# NinjaBox Viewer 1.2.1 — syntax-fixed diagnostic build

Replace package.json, server.js, public/index.html and README.md in the current repository.
Railway auto-deploys after commit if configured.

Railway Variables:
- TIKTOK_LIVE_USERNAME = ninjaboxx
- EULER_API_KEY = Euler Stream API key
- VIEWER_CONTROL_PASSWORD = a unique password you create
- TIKTOK_SESSION_ID = sessionid cookie for the sender account
- TIKTOK_TARGET_IDC = tt-target-idc cookie for the same account

Never put secret values in GitHub or send them in screenshots. The unofficial connector may send session credentials to a third-party signing service; assess this risk before using it. `/api/diagnostics` reports only whether variables exist, not their values. Test connection before sending a single comment. This build does not send likes or gifts.
