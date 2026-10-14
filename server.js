import express from "express";
import { TikTokLiveConnection } from "tiktok-live-connector";

const app = express();
const PORT = process.env.PORT || 3000;
const TARGET = (process.env.TIKTOK_LIVE_USERNAME || "ninjaboxx").replace(/^@/, "").trim();
app.use(express.json({ limit: "8kb" }));
app.use(express.static("public"));

function credentialsReady() {
  return Boolean(process.env.TIKTOK_SESSION_ID && process.env.TIKTOK_TARGET_IDC && process.env.EULER_API_KEY && process.env.VIEWER_CONTROL_PASSWORD);
}
function checkControlPassword(req, res, next) {
  const expected = process.env.VIEWER_CONTROL_PASSWORD;
  if (!expected) return res.status(503).json({ ok: false, error: "Sunucu yapılandırılmamış: VIEWER_CONTROL_PASSWORD eksik." });
  if (!req.get("x-control-password") || req.get("x-control-password") !== expected) return res.status(401).json({ ok: false, error: "Kontrol şifresi hatalı." });
  next();
}
app.get("/health", (_req, res) => res.json({ ok: true, service: "ninjabox-viewer", target: `@${TARGET}`, messageSendingConfigured: credentialsReady() }));
app.get("/api/config", (_req, res) => res.json({ targetUsername: TARGET, liveUrl: `https://www.tiktok.com/@${TARGET}/live`, messageSendingConfigured: credentialsReady() }));

// Sends one user-entered message only when the user presses the button.
app.post("/api/send-message", checkControlPassword, async (req, res) => {
  const message = typeof req.body?.message === "string" ? req.body.message.trim() : "";
  if (!credentialsReady()) return res.status(503).json({ ok: false, error: "Railway Variables eksik. README'deki değişkenleri kontrol et." });
  if (!message || message.length > 150) return res.status(400).json({ ok: false, error: "Yorum 1–150 karakter arasında olmalı." });
  let connection;
  try {
    connection = new TikTokLiveConnection(TARGET, {
      signApiKey: process.env.EULER_API_KEY,
      authenticateWs: true,
      session: { cookie: { type: "cookie", value: { sessionId: process.env.TIKTOK_SESSION_ID, ttTargetIdc: process.env.TIKTOK_TARGET_IDC } } }
    });
    await connection.connect();
    await connection.sendMessage(message);
    return res.json({ ok: true, message: "Yorum gönderildi.", target: `@${TARGET}` });
  } catch (err) {
    console.error("TikTok message send failed:", String(err?.message || err).slice(0, 300));
    return res.status(502).json({ ok: false, error: "Yorum gönderilemedi. Yayının açık olduğunu, oturumun geçerli olduğunu ve Euler API anahtarını kontrol et." });
  } finally {
    try { if (connection?.isConnected) await connection.disconnect(); } catch {}
  }
});
app.listen(PORT, () => console.log(`ninjabox-viewer listening on port ${PORT}; target @${TARGET}`));
