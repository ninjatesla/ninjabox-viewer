import express from "express";
import { TikTokLiveConnection } from "tiktok-live-connector";

const app = express();
const PORT = process.env.PORT || 3000;
const TARGET = (process.env.TIKTOK_LIVE_USERNAME || "ninjaboxx").replace(/^@/, "").trim();

app.use(express.json({ limit: "8kb" }));
app.use(express.static("public"));

const envStatus = () => ({
  targetUsername: TARGET,
  hasEulerApiKey: Boolean(process.env.EULER_API_KEY),
  hasSessionId: Boolean(process.env.TIKTOK_SESSION_ID),
  hasTargetIdc: Boolean(process.env.TIKTOK_TARGET_IDC),
  hasControlPassword: Boolean(process.env.VIEWER_CONTROL_PASSWORD),
  readyForConnection: Boolean(
    process.env.EULER_API_KEY &&
    process.env.TIKTOK_SESSION_ID &&
    process.env.TIKTOK_TARGET_IDC
  ),
  // Do not include secret values in API responses.
});

function checkControlPassword(req, res, next) {
  const expected = process.env.VIEWER_CONTROL_PASSWORD;
  const provided = req.get("x-control-password");
  if (!expected) {
    return res.status(503).json({
      ok: false,
      error: "VIEWER_CONTROL_PASSWORD eksik. Railway Variables bölümüne ekle."
    });
  }
  if (!provided || provided !== expected) {
    return res.status(401).json({ ok: false, error: "Kontrol şifresi hatalı." });
  }
  next();
}

function makeConnection() {
  return new TikTokLiveConnection(TARGET, {
    signApiKey: process.env.EULER_API_KEY,
    authenticateWs: true,
    session: {
      cookie: {
        type: "cookie",
        value: {
          sessionId: process.env.TIKTOK_SESSION_ID,
          ttTargetIdc: process.env.TIKTOK_TARGET_IDC
        }
      }
    }
  });
}

app.get("/health", (_req, res) => {
  const s = envStatus();
  res.json({
    ok: true,
    service: "ninjabox-viewer",
    target: `@${TARGET}`,
    messageSendingConfigured: s.readyForConnection && s.hasControlPassword,
    ...s
  });
});

app.get("/api/config", (_req, res) => {
  res.json({
    targetUsername: TARGET,
    liveUrl: `https://www.tiktok.com/@${TARGET}/live`,
    ...envStatus()
  });
});

// Diagnostic does not connect to TikTok and never reveals secret values.
app.get("/api/diagnostics", (_req, res) => {
  const s = envStatus();
  const missing = [];
  if (!s.hasEulerApiKey) missing.push("EULER_API_KEY");
  if (!s.hasSessionId) missing.push("TIKTOK_SESSION_ID");
  if (!s.hasTargetIdc) missing.push("TIKTOK_TARGET_IDC");
  if (!s.hasControlPassword) missing.push("VIEWER_CONTROL_PASSWORD");
  res.json({
    ok: true,
    ...s,
    missingVariables: missing,
    nextStep: missing.length
      ? "Eksik değişkenleri Railway > Variables bölümünde ekle."
      : "Gerekli değişken adları mevcut. Bu, değerlerin geçerli olduğunu kanıtlamaz; bağlantı testi gerekir."
  });
}

// Performs a connection test only; it does not send a chat message.
app.post("/api/test-connection", checkControlPassword, async (_req, res) => {
  const s = envStatus();
  if (!s.readyForConnection) {
    const missing = [];
    if (!s.hasEulerApiKey) missing.push("EULER_API_KEY");
    if (!s.hasSessionId) missing.push("TIKTOK_SESSION_ID");
    if (!s.hasTargetIdc) missing.push("TIKTOK_TARGET_IDC");
    return res.status(503).json({
      ok: false,
      error: "Gerekli bağlantı değişkenleri eksik.",
      missingVariables: missing
    });
  }

  let connection;
  let timeout;
  try {
    connection = makeConnection();
    const timeoutPromise = new Promise((_, reject) => {
      timeout = setTimeout(() => reject(new Error("Bağlantı zaman aşımına uğradı.")), 20000);
    });
    await Promise.race([connection.connect(), timeoutPromise]);
    return res.json({
      ok: true,
      connected: true,
      target: `@${TARGET}`,
      message: "TikTok LIVE bağlantısı kuruldu. Henüz yorum gönderilmedi."
    });
  } catch (err) {
    console.error("TikTok connection test failed:", String(err?.message || err).slice(0, 250));
    return res.status(502).json({
      ok: false,
      connected: false,
      error: "Bağlantı kurulamadı. Yayının açık olduğunu, oturumun geçerli olduğunu ve Euler anahtarını kontrol et.",
      detail: String(err?.message || err).slice(0, 180)
    });
  } finally {
    if (timeout) clearTimeout(timeout);
    try {
      if (connection) await connection.disconnect();
    } catch {}
  }
});

// Sends one user-entered message only when the user presses the button.
app.post("/api/send-message", checkControlPassword, async (req, res) => {
  const message = typeof req.body?.message === "string" ? req.body.message.trim() : "";
  const s = envStatus();

  if (!s.readyForConnection) {
    const missing = [];
    if (!s.hasEulerApiKey) missing.push("EULER_API_KEY");
    if (!s.hasSessionId) missing.push("TIKTOK_SESSION_ID");
    if (!s.hasTargetIdc) missing.push("TIKTOK_TARGET_IDC");
    return res.status(503).json({
      ok: false,
      error: "TikTok bağlantı değişkenleri eksik.",
      missingVariables: missing
    });
  }
  if (!message || message.length > 150) {
    return res.status(400).json({ ok: false, error: "Yorum 1–150 karakter arasında olmalı." });
  }

  let connection;
  try {
    connection = makeConnection();
    await connection.connect();
    await connection.sendMessage(message);
    return res.json({ ok: true, message: "Yorum gönderildi.", target: `@${TARGET}` });
  } catch (err) {
    console.error("TikTok message send failed:", String(err?.message || err).slice(0, 250));
    return res.status(502).json({
      ok: false,
      error: "Yorum gönderilemedi. Bağlantı, oturum veya Euler API anahtarı geçersiz olabilir.",
      detail: String(err?.message || err).slice(0, 180)
    });
  } finally {
    try {
      if (connection) await connection.disconnect();
    } catch {}
  }
});

app.listen(PORT, () => {
  console.log(`ninjabox-viewer listening on port ${PORT}`);
  console.log(`Target TikTok LIVE: https://www.tiktok.com/@${TARGET}/live`);
});
