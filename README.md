# [Autobrr](https://autobrr.com/) Steam Wishlist

Simple workaround to get them working again, see [this issue](https://github.com/autobrr/autobrr/issues/2195) for more details

# Deploying

## Bare metal

1. Ensure you have [node.js](https://nodejs.org/) installed
2. Clone this repository
3. Rename `.env.example` to `.env`
4. Set the port this runs on (default: 3000), change `PORT` in `.env` (optional)
5. Set the Steam Web API Key (optional), change `STEAM_API_KEY` in `.env` (optional)
6. Set the country code if you need to (e.g., region-locked games, default: US), change `COUNTRY_CODE` in `.env` (optional)
7. Enable verbose debug logging if you need to troubleshoot, set `VERBOSE` to `true` or `1` in `.env` (optional)
8. Command: `node --env-file=.env index.js`

## Docker

```yaml
services:
  steam-wishlist:
    image: ghcr.io/cy1der/autobrr-steam-wishlist:latest
    container_name: autobrr-steam-wishlist
    restart: unless-stopped
    environment:
      PORT: 3000 # Optional, omit this line if you would like
      STEAM_API_KEY: yourApiKeyHere # Optional, omit this line if you do not wish to use an API key
      COUNTRY_CODE: US # Optional, omit this line if you would like
      VERBOSE: false # Optional, set to true for debug logging
    ports:
      - "3000:3000"
```

# Usage

Take:

- `BASE_URL` is where you deployed the web server, I will use `http://autobrr-steam-wishlist:3000` as an example
- `STEAMID` is the `steamID64` in step 1

1. Get your `steamID64` from [STEAMID I/O](https://steamid.io) or from the URL of your profile
2. In the "Add list" menu in Autobrr (Settings > Lists > Add new), select `Plaintext` as the type and enter `{BASE_URL}/{STEAMID}.txt`
3. Tick `Match Release` ON
4. Enjoy

# Caveats

Due to rate limits imposed on the Steam storefront API, this will only return the up to the first 200 items in your wishlist
