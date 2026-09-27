const http = require("http");

const PORT = process.env.PORT || 3000;
const STEAM_API_KEY = process.env.STEAM_API_KEY || "";
const API_BASE_URL = "https://api.steampowered.com";
const STORE_BASE_URL = "https://store.steampowered.com/api";
const DEBUG = true; // Set to true to print raw API responses for troubleshooting

const BROWSER_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Accept-Language": "en-US,en;q=0.9"
};

function normalizeAppName(name) {
  if (typeof name !== "string") {
    return "";
  }

  const normalized = name.normalize("NFC").trim();

  const looksMojibake = /Ã.|Â.|â./.test(normalized);
  if (!looksMojibake) {
    return normalized;
  }

  const repaired = Buffer.from(normalized, "latin1")
    .toString("utf8")
    .normalize("NFC")
    .trim();

  return repaired.includes("") ? normalized : repaired;
}

const server = http.createServer(async (req, res) => {
  const requestPath = req.url.split("?")[0];

  // Handle favicon or non-text requests cleanly
  if (requestPath === "/favicon.ico") {
    res.writeHead(404);
    res.end();
    return;
  }

  const useridMatch = requestPath.match(/^\/(\d+)\.txt$/);
  const userid = useridMatch?.[1] || "";
  console.log(
    `[${new Date().toISOString()}] Request path: ${requestPath}, userid: ${userid}`,
  );

  if (
    !useridMatch ||
    userid.length > 20 ||
    BigInt(userid) > BigInt("18446744073709551615")
  ) {
    console.log(`[${new Date().toISOString()}] Invalid userid format`);
    res.writeHead(400);
    res.end();
    return;
  }

  console.log(
    `[${new Date().toISOString()}] Fetching wishlist from ${API_BASE_URL}`,
  );
  
  const wishlistKeyParam = STEAM_API_KEY ? `&key=${STEAM_API_KEY}` : "";
  const wishlistResponse = await fetch(
    `${API_BASE_URL}/IWishlistService/GetWishlist/v1?steamid=${userid}${wishlistKeyParam}`,
    { headers: BROWSER_HEADERS }
  );

  if (!wishlistResponse.ok) {
    console.log(
      `[${new Date().toISOString()}] Wishlist API error: ${wishlistResponse.status}`,
    );
    res.writeHead(500);
    res.end();
    return;
  }

  const wishlistData = await wishlistResponse.json();
  const wishlistIds =
    wishlistData?.response?.items?.slice(0, 200).map((item) => String(item.appid)) ||
    [];
  console.log(
    `[${new Date().toISOString()}] Found ${wishlistIds.length} items in wishlist`,
  );
  
  let appNames = [];

  // Fetch items sequentially
  for (let i = 0; i < wishlistIds.length; i++) {
    const id = wishlistIds[i];
    console.log(`[${new Date().toISOString()}] Resolving app name for id: ${id}`);

    let appName = null;

    try {
      const apiKeyParam = STEAM_API_KEY ? `&key=${STEAM_API_KEY}` : "";
      const storeUrl = `${STORE_BASE_URL}/appdetails?appids=${id}&cc=US&l=en&agecheck=1${apiKeyParam}`;
      
      if (DEBUG) {
        console.log(`[${new Date().toISOString()}] [DEBUG] Fetching store API: ${storeUrl}`);
      }

      const response = await fetch(storeUrl, { headers: BROWSER_HEADERS });
      if (response.ok) {
        const data = await response.json();
        if (DEBUG) {
          console.log(`[${new Date().toISOString()}] [DEBUG] Response for ${id}:`, JSON.stringify(data[id]));
        }
        if (data && data[id]?.success) {
          appName = normalizeAppName(data[id].data.name);
        }
      }
    } catch (error) {
      console.log(
        `[${new Date().toISOString()}] Store API request failed for ID ${id}: ${error.message}`,
      );
    }

    // Secondary fallback: if appdetails fails due to backend flags, query Steam's storefront search / metadata page
    if (!appName) {
      try {
        const fallbackUrl = `https://store.steampowered.com/app/${id}?cc=US&l=en&agecheck=1`;
        if (DEBUG) {
          console.log(`[${new Date().toISOString()}] [DEBUG] Fetching HTML fallback: ${fallbackUrl}`);
        }
        const htmlRes = await fetch(fallbackUrl, { headers: BROWSER_HEADERS });
        if (htmlRes.ok) {
          const htmlText = await htmlRes.text();
          // Extract game title directly from the store page HTML title tag (<title>Game Name on Steam</title>)
          const match = htmlText.match(/<title>\s*(?:18\+.*?-\s*)?([^<]+?)\s*(?:on Steam)?<\/title>/i);
          if (match && match[1]) {
            let extractedName = match[1].replace("on Steam", "").trim();
            if (extractedName && !extractedName.toLowerCase().includes("welcome to steam")) {
              appName = normalizeAppName(extractedName);
            }
          }
        }
      } catch (err) {
        console.log(`[${new Date().toISOString()}] HTML fallback failed for ID ${id}: ${err.message}`);
      }
    }

    if (appName) {
      appNames.push(appName);
      console.log(
        `[${new Date().toISOString()}] Got name for id ${id}: ${appName}`,
      );
    } else {
      console.log(
        `[${new Date().toISOString()}] App ID ${id} could not be resolved from Steam APIs.`,
      );
    }

    // Small delay between iterations
    if (i < wishlistIds.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
  }

  console.log(
    `[${new Date().toISOString()}] Sending response with ${appNames.length} app names`,
  );
  res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
  res.end(Buffer.from(appNames.join("\n"), "utf8"));
});

server.listen(PORT, () => {
  console.log(
    `[${new Date().toISOString()}] Server running on http://localhost:${PORT}`,
  );
});
