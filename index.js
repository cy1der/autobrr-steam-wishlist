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

  const REQUEST_COUNT = wishlistIds.length;
  // Lowered to 5 to avoid hitting Steam store rate limits (HTTP 429)
  const MAX_PARALLEL_REQUESTS = 5;
  const INTER_BATCH_DELAY_MS = 500;

  const BATCH_SIZE = Math.max(
    1,
    Math.min(MAX_PARALLEL_REQUESTS, REQUEST_COUNT),
  );
  const DELAY_MS = REQUEST_COUNT > BATCH_SIZE ? INTER_BATCH_DELAY_MS : 0;
  console.log(
    `[${new Date().toISOString()}] BATCH_SIZE: ${BATCH_SIZE}, DELAY_MS: ${DELAY_MS}`,
  );

  for (let i = 0; i < wishlistIds.length; i += BATCH_SIZE) {
    const batch = wishlistIds.slice(i, i + BATCH_SIZE);
    console.log(
      `[${new Date().toISOString()}] Processing batch ${Math.floor(i / BATCH_SIZE) + 1}: ${batch.join(", ")}`,
    );

    const results = await Promise.allSettled(
      batch.map(async (id) => {
        if (DEBUG) {
          console.log(
            `[${new Date().toISOString()}] [DEBUG] Fetching: ${STORE_BASE_URL}/appdetails?appids=${id}`,
          );
        }

        const response = await fetch(`${STORE_BASE_URL}/appdetails?appids=${id}`);
        
        if (!response.ok) {
          if (DEBUG) {
            console.log(
              `[${new Date().toISOString()}] [DEBUG] HTTP error ${response.status} for id ${id}`,
            );
          }
          return null;
        }

        const data = await response.json();

        if (DEBUG) {
          console.log(
            `[${new Date().toISOString()}] [DEBUG] Response for ${id}:`,
            JSON.stringify(data[id]),
          );
        }

        if (data && data[id]?.success) {
          return normalizeAppName(data[id].data.name);
        }

        return null;
      }),
    );

    results.forEach((result, index) => {
      const currentId = batch[index];
      if (result.status === "fulfilled") {
        if (result.value) {
          appNames.push(result.value);
        } else {
          console.log(
            `[${new Date().toISOString()}] App ID ${currentId} returned success: false or empty response from Steam API.`,
          );
        }
      } else {
        console.log(
          `[${new Date().toISOString()}] Network request failed for ID ${currentId}: ${result.reason}`,
        );
      }
    });

    if (DELAY_MS > 0 && i + BATCH_SIZE < wishlistIds.length) {
      console.log(
        `[${new Date().toISOString()}] Waiting ${DELAY_MS}ms before next batch`,
      );
      await new Promise((resolve) => setTimeout(resolve, DELAY_MS));
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
