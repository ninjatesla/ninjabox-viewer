# NinjaBox Viewer — diagnostic + message test

## Files
Replace these files in `ninjatesla/ninjabox-viewer`:
- `package.json`
- `server.js`
- `public/index.html`
- `README.md`

Railway will redeploy after the GitHub commit if automatic deployments are enabled.

## Railway Variables
- `TIKTOK_LIVE_USERNAME` = `ninjaboxx`
- `EULER_API_KEY` = Euler Stream API key
- `VIEWER_CONTROL_PASSWORD` = a unique password you create
- `TIKTOK_SESSION_ID` = sessionid cookie from the sender account
- `TIKTOK_TARGET_IDC` = tt-target-idc cookie from the same account

Never put secrets in GitHub or share screenshots showing their values. Enabling authenticated websocket sends session credentials to the third-party signing service; use only if you accept that risk.

## Test
1. Wait for deployment to be ACTIVE.
2. Open `/api/diagnostics`. It reports which variable names exist but never their values.
3. Open the site, enter `VIEWER_CONTROL_PASSWORD`, tap `ÖNCE BAĞLANTIYI TEST ET`. This does not send a message.
4. Only if the connection test succeeds, send one short test message.

A configured variable does not prove the value is valid. This unofficial connector may stop working if TikTok or the signing service changes. This build does not send likes or gifts.
