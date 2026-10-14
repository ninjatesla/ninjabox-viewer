import express from "express";

const app = express();
const PORT = process.env.PORT || 3000;
const LIVE_USERNAME = (process.env.TIKTOK_LIVE_USERNAME || "ninjaboxx")
  .replace(/^@/, "")
  .trim();

app.use(express.static("public"));

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "ninjabox-viewer",
    target: `@${LIVE_USERNAME}`,
    liveUrl: `https://www.tiktok.com/@${LIVE_USERNAME}/live`
  });
});

app.get("/api/config", (_req, res) => {
  res.json({
    targetUsername: LIVE_USERNAME,
    liveUrl: `https://www.tiktok.com/@${LIVE_USERNAME}/live`,
    mode: "manual-viewing"
  });
});

app.listen(PORT, () => {
  console.log(`ninjabox-viewer listening on port ${PORT}`);
  console.log(`Target TikTok LIVE: https://www.tiktok.com/@${LIVE_USERNAME}/live`);
});
