const http = require("http");

const PORT = process.env.PORT || 3000;
const API_BASE_URL = "https://api.steampowered.com";
const STORE_BASE_URL = "https://store.steampowered.com/api";
const DEBUG = true; // Set to true to print raw API responses for troubleshooting

// Cache for Steam app list to avoid downloading it on every single request
let appListCache = {
  timestamp: 0,
  map: new Map()
};
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

async function getSteamAppMap() {
  const now = Date.now();
  if (appListCache.map.size > 0 && (now - appListCache.timestamp) < CACHE_TTL_MS) {
    return appListCache.map;
  }

  console.log(`[${new Date().toISOString()}] Fetching global Steam app list cache...`);
  try {
    const res = await fetch(`${API_BASE_URL}/ISteamApps/GetAppList/v2/`);
    if (res.ok) {
      const data = await res.json();
      const apps = data?.applist?.apps || [];
      const newMap = new Map();
      for (const app of apps) {
        newMap.set(String(app.appid), app.name);
      }
      appListCache = {
        timestamp: now,
        map: newMap
      };
      console.log(`[${new Date().toISOString()}] Steam app list cached successfully (${newMap.size} apps).`);
      return newMap;
    }
  } catch (err) {
    console.log(`[${new Date().toISOString()}] Failed to fetch global app list: ${err.message}`);
  }
  return appListCache.map;
}

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
    wishlistData?.response?.items?.slice(0, 200).map((item) => String(item.appid)) ||
    [];
  console.log(
    `[${new Date().toISOString()}] Found ${wishlistIds.length} items in wishlist`,
  );
  
  // Get the complete Steam app map for quick lookups
  const appMap = await getSteamAppMap();
  let appNames = [];

  // Fetch items sequentially with a small delay
  for (let i = 0; i < wishlistIds.length; i++) {
    const id = wishlistIds[i];
    console.log(`[${new Date().toISOString()}] Resolving app name for id: ${id}`);

    let appName = null;

    // 1. Try Store API first for newer/unlisted titles (since GetAppList can lag behind on new releases)
    try {
      if (DEBUG) {
        console.log(
          `[${new Date().toISOString()}] [DEBUG] Fetching store API: ${STORE_BASE_URL}/appdetails?appids=${id}&cc=US&l=en&agecheck=1`,
        );
      }

      const response = await fetch(`${STORE_BASE_URL}/appdetails?appids=${id}&cc=US&l=en&agecheck=1`);
      if (response.ok) {
        const data = await response.json();
        if (data && data[id]?.success) {
          appName = normalizeAppName(data[id].data.name);
        }
      }
    } catch (error) {
      console.log(
        `[${new Date().toISOString()}] Store API request failed for ID ${id}: ${error.message}`,
      );
    }

    // 2. If Store API returned undefined, fall back to the global app map cache
    if (!appName && appMap.has(id)) {
      appName = normalizeAppName(appMap.get(id));
      if (DEBUG) {
        console.log(`[${new Date().toISOString()}] [DEBUG] Found in global app list fallback: ${appName}`);
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
