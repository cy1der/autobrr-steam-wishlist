# [Autobrr](https://autobrr.com/) Steam Wishlist

Simple workaround to get them working again, see [this issue](https://github.com/autobrr/autobrr/issues/2195) for more details

# Deploying

## Bare metal

1. Ensure you have [node.js](https://nodejs.org/) installed
2. Clone this repository
3. If you wish to change the port this runs on (default: 3000), rename `.env.example` to `.env` and change the port
4. Command: `node --env-file=.env index.js`

## Docker

```yaml
services:
  steam-wishlist:
    image: ghcr.io/cy1der/autobrr-steam-wishlist:latest
    container_name: autobrr-steam-wishlist
    restart: unless-stopped
    environment:
      PORT: 3000
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
