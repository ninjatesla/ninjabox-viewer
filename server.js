import express from "express";
import { TikTokLiveConnection } from "tiktok-live-connector";

const app = express();
const PORT = process.env.PORT || 3000;
const TARGET = (process.env.TIKTOK_LIVE_USERNAME || "ninjaboxx").replace(/^@/, "").trim();

app.use(express.json({ limit: "8kb" }));
app.use(express.static("public"));

function status() {
  const hasEulerApiKey = Boolean(process.env.EULER_API_KEY);
  const hasSessionId = Boolean(process.env.TIKTOK_SESSION_ID);
  const hasTargetIdc = Boolean(process.env.TIKTOK_TARGET_IDC);
  const hasControlPassword = Boolean(process.env.VIEWER_CONTROL_PASSWORD);
  return {
    targetUsername: TARGET,
    hasEulerApiKey,
    hasSessionId,
    hasTargetIdc,
    hasControlPassword,
    readyForConnection: hasEulerApiKey && hasSessionId && hasTargetIdc
  };
}

function checkPassword(req, res, next) {
  const expected = process.env.VIEWER_CONTROL_PASSWORD;
  const provided = req.get("x-control-password");
  if (!expected) {
    return res.status(503).json({ ok: false, error: "VIEWER_CONTROL_PASSWORD eksik." });
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
  const s = status();
  res.json({
    ok: true,
    service: "ninjabox-viewer",
    target: `@${TARGET}`,
    messageSendingConfigured: s.readyForConnection && s.hasControlPassword,
    ...s
  });
});

app.get("/api/diagnostics", (_req, res) => {
  const s = status();
  const missingVariables = [];
  if (!s.hasEulerApiKey) missingVariables.push("EULER_API_KEY");
  if (!s.hasSessionId) missingVariables.push("TIKTOK_SESSION_ID");
  if (!s.hasTargetIdc) missingVariables.push("TIKTOK_TARGET_IDC");
  if (!s.hasControlPassword) missingVariables.push("VIEWER_CONTROL_PASSWORD");
  res.json({
    ok: true,
    ...s,
    missingVariables,
    nextStep: missingVariables.length
      ? "Railway Variables bölümünde eksik değişkenleri ekle."
      : "Değişken adları mevcut. Değerlerin geçerli olup olmadığı bağlantı testiyle anlaşılır."
  });
});

app.post("/api/test-connection", checkPassword, async (_req, res) => {
  const s = status();
  if (!s.readyForConnection) {
    const missingVariables = [];
    if (!s.hasEulerApiKey) missingVariables.push("EULER_API_KEY");
    if (!s.hasSessionId) missingVariables.push("TIKTOK_SESSION_ID");
    if (!s.hasTargetIdc) missingVariables.push("TIKTOK_TARGET_IDC");
    return res.status(503).json({
      ok: false,
      error: "Gerekli bağlantı değişkenleri eksik.",
      missingVariables
    });
  }

  let connection;
  let timer;
  try {
    connection = makeConnection();
    const timeoutPromise = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error("Bağlantı zaman aşımına uğradı.")), 20000);
    });
    await Promise.race([connection.connect(), timeoutPromise]);
    return res.json({
      ok: true,
      connected: true,
      target: `@${TARGET}`,
      message: "Bağlantı kuruldu. Henüz yorum gönderilmedi."
    });
  } catch (err) {
    console.error("TikTok connection test failed:", String(err?.message || err).slice(0, 200));
    return res.status(502).json({
      ok: false,
      connected: false,
      error: "Bağlantı kurulamadı; oturum, yayın veya API yapılandırmasını kontrol et.",
      detail: String(err?.message || err).slice(0, 160)
    });
  } finally {
    if (timer) clearTimeout(timer);
    try { if (connection) await connection.disconnect(); } catch {}
  }
});

app.post("/api/send-message", checkPassword, async (req, res) => {
  const s = status();
  if (!s.readyForConnection) {
    const missingVariables = [];
    if (!s.hasEulerApiKey) missingVariables.push("EULER_API_KEY");
    if (!s.hasSessionId) missingVariables.push("TIKTOK_SESSION_ID");
    if (!s.hasTargetIdc) missingVariables.push("TIKTOK_TARGET_IDC");
    return res.status(503).json({
      ok: false,
      error: "TikTok bağlantı değişkenleri eksik.",
      missingVariables
    });
  }

  const message = typeof req.body?.message === "string" ? req.body.message.trim() : "";
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
    console.error("TikTok message send failed:", String(err?.message || err).slice(0, 200));
    return res.status(502).json({
      ok: false,
      error: "Yorum gönderilemedi. Oturum veya API bağlantısı geçersiz olabilir.",
      detail: String(err?.message || err).slice(0, 160)
    });
  } finally {
    try { if (connection) await connection.disconnect(); } catch {}
  }
});

app.listen(PORT, () => {
  console.log(`ninjabox-viewer listening on port ${PORT}`);
  console.log(`Target TikTok LIVE: https://www.tiktok.com/@${TARGET}/live`);
});
