const http = require("http");

const PORT = process.env.PORT || 3000;
const API_BASE_URL = "https://api.steampowered.com";
const STORE_BASE_URL = "https://store.steampowered.com/api";
const DEBUG = true; // Set to true to print raw API responses for troubleshooting

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
  const wishlistResponse = await fetch(
    `${API_BASE_URL}/IWishlistService/GetWishlist/v1?steamid=${userid}`,
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
    wishlistData?.response?.items?.slice(0, 200).map((item) => item.appid) ||
    [];
  console.log(
    `[${new Date().toISOString()}] Found ${wishlistIds.length} items in wishlist`,
  );
  
  let appNames = [];

  // Fetch items sequentially with a small delay to avoid Steam rate limits / dropped connections
  for (let i = 0; i < wishlistIds.length; i++) {
    const id = wishlistIds[i];
    console.log(`[${new Date().toISOString()}] Fetching app details for id: ${id}`);

    try {
      if (DEBUG) {
        console.log(
          `[${new Date().toISOString()}] [DEBUG] Fetching: ${STORE_BASE_URL}/appdetails?appids=${id}`,
        );
      }

      const response = await fetch(`${STORE_BASE_URL}/appdetails?appids=${id}`);
      
      if (!response.ok) {
        console.log(
          `[${new Date().toISOString()}] [DEBUG] HTTP error ${response.status} for id ${id}`,
        );
      } else {
        const data = await response.json();

        if (DEBUG) {
          console.log(
            `[${new Date().toISOString()}] [DEBUG] Response for ${id}:`,
            JSON.stringify(data[id]),
          );
        }

        if (data && data[id]?.success) {
          const appName = normalizeAppName(data[id].data.name);
          appNames.push(appName);
          console.log(
            `[${new Date().toISOString()}] Got name for id ${id}: ${appName}`,
          );
        } else {
          console.log(
            `[${new Date().toISOString()}] App ID ${id} returned success: false or empty response from Steam API.`,
          );
        }
      }
    } catch (error) {
      console.log(
        `[${new Date().toISOString()}] Network request failed for ID ${id}: ${error.message}`,
      );
    }

    // 150ms delay between each individual request to keep Steam happy
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
