const http = require("http");

const PORT = process.env.PORT || 3000;
const STEAM_API_KEY = process.env.STEAM_API_KEY || "";
const COUNTRY_CODE = process.env.COUNTRY_CODE || "US";
const VERBOSE = process.env.VERBOSE === "1" || process.env.VERBOSE === "true";
const API_BASE_URL = "https://api.steampowered.com";
const STORE_BASE_URL = "https://store.steampowered.com/api";

function debug(message, { userid, appid } = {}) {
  if (VERBOSE) {
    const tags = [userid && `[user:${userid}]`, appid && `[app:${appid}]`]
      .filter(Boolean)
      .join(" ");
    console.log(["[debug]", tags, message].filter(Boolean).join(" "));
  }
}

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

  if (requestPath === "/favicon.ico") {
    res.writeHead(404);
    res.end();
    return;
  }

  const useridMatch = requestPath.match(/^\/(\d+)\.txt$/);
  const userid = useridMatch?.[1] || "";

  if (
    !useridMatch ||
    userid.length > 20 ||
    BigInt(userid) > BigInt("18446744073709551615")
  ) {
    debug(`Request rejected: ${requestPath}`, { userid });
    res.writeHead(400);
    res.end();
    return;
  }

  debug(`Request received: ${requestPath}`, { userid });

  const wishlistKeyParam = STEAM_API_KEY ? `&key=${STEAM_API_KEY}` : "";
  const wishlistResponse = await fetch(
    `${API_BASE_URL}/IWishlistService/GetWishlist/v1?steamid=${userid}${wishlistKeyParam}`,
    { headers: BROWSER_HEADERS }
  );

  if (!wishlistResponse.ok) {
    debug(`Wishlist fetch failed: ${wishlistResponse.status}`, { userid });
    res.writeHead(500);
    res.end();
    return;
  }

  const wishlistData = await wishlistResponse.json();
  const wishlistIds =
    wishlistData?.response?.items?.slice(0, 200).map((item) => String(item.appid)) ||
    [];

  debug(`Wishlist has ${wishlistIds.length || "no"} item${wishlistIds.length >= 2 || !wishlistIds ? "s" : ""}`, { userid });

  let appNames = [];

  for (let i = 0; i < wishlistIds.length; i++) {
    const id = wishlistIds[i];
    let appName = null;

    try {
      const apiKeyParam = STEAM_API_KEY ? `&key=${STEAM_API_KEY}` : "";
      const storeUrl = `${STORE_BASE_URL}/appdetails?appids=${id}&cc=${COUNTRY_CODE}&l=en&agecheck=1${apiKeyParam}`;

      const response = await fetch(storeUrl, { headers: BROWSER_HEADERS });
      if (response.ok) {
        const data = await response.json();
        if (data && data[id]?.success) {
          appName = normalizeAppName(data[id].data.name);
        }
      }
    } catch (error) {
      debug(`App details request failed: ${error.message}`, { userid, appid: id });
    }

    if (!appName) {
      debug("Falling back to HTML scrape", { userid, appid: id });
      try {
        const fallbackUrl = `https://store.steampowered.com/app/${id}?cc=${COUNTRY_CODE}&l=en&agecheck=1`;
        const htmlRes = await fetch(fallbackUrl, { headers: BROWSER_HEADERS });
        if (htmlRes.ok) {
          const htmlText = await htmlRes.text();
          const match = htmlText.match(/<title>\s*(?:18\+.*?-\s*)?([^<]+?)\s*(?:on Steam)?<\/title>/i);
          if (match && match[1]) {
            let extractedName = match[1].replace("on Steam", "").trim();
            if (extractedName && !extractedName.toLowerCase().includes("welcome to steam")) {
              appName = normalizeAppName(extractedName);
            }
          }
        }
      } catch (err) {
        debug(`HTML scrape failed: ${err.message}`, { userid, appid: id });
      }
    }

    if (appName) {
      appNames.push(appName);
    } else {
      debug("Could not resolve name", { userid, appid: id });
    }

    if (i < wishlistIds.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
  }

  debug(`Resolved ${appNames.length}/${wishlistIds.length} app names`, { userid });

  res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
  res.end(Buffer.from(appNames.join("\n"), "utf8"));
});

server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
