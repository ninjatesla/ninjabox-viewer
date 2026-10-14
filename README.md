# NinjaBox Viewer

Minimal Node.js/Express starter for opening the public TikTok LIVE page for a configured account and checking the app's health.

## What this starter does
- Serves a small status page.
- Builds the LIVE URL for `TIKTOK_LIVE_USERNAME`.
- Exposes `/health` and `/api/config`.

## What it does not do
- It does not sign into a TikTok account.
- It does not automate comments, likes, or gifts.
- It does not verify that the target account is currently live.
- It does not bypass TikTok access controls or account restrictions.

For account interaction, use TikTok's own supported interface manually. Do not place passwords, session cookies, or Coin/payment credentials in GitHub or Railway environment variables.

## Run locally
Requires Node.js 20+.

```bash
npm install
npm start
```

Open `http://localhost:3000`.

## Deploy to Railway
1. Create a new GitHub repository named `ninjabox-viewer`.
2. Upload these files to the repository root.
3. In Railway, create a project from that GitHub repository.
4. Set the environment variable `TIKTOK_LIVE_USERNAME` to `ninjaboxx`.
5. Deploy. Railway should run `npm start`.
6. Open the generated public domain and click **Canlı yayını aç**.

## Endpoints
- `GET /health`
- `GET /api/config`
