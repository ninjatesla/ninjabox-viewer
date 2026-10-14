import express from "express";
import crypto from "node:crypto";

const app = express();
const PORT = process.env.PORT || 3000;
const TARGET = (process.env.TIKTOK_LIVE_USERNAME || "ninjaboxx").replace(/^@/, "").trim();
const APP_URL = (process.env.APP_URL || "https://ninjabox-viewer-production.up.railway.app").replace(/\/+$/, "");
const REDIRECT_URI = process.env.OAUTH_REDIRECT_URI || `${APP_URL}/oauth/callback`;
const AUTH_URL = "https://www.eulerstream.com/tiktok/oauth/authorize";
const TOKEN_URL = "https://tiktok.eulerstream.com/tiktok/oauth/token";
const API_BASE = "https://tiktok.eulerstream.com";

app.use(express.json({ limit: "8kb" }));
app.use(express.static("public"));

// OAuth state and tokens live in memory. A Railway restart requires authorizing again.
const oauthStates = new Map();
let oauthTokens = null;
let lastMessageAt = 0;

function status() {
  const hasClientId = Boolean(process.env.OAUTH_CLIENT_ID);
  const hasClientSecret = Boolean(process.env.OAUTH_CLIENT_SECRET);
  const hasControlPassword = Boolean(process.env.VIEWER_CONTROL_PASSWORD);
  const hasOAuthTokens = Boolean(oauthTokens?.access_token);
  return {
    targetUsername: TARGET,
    hasClientId,
    hasClientSecret,
    hasControlPassword,
    hasOAuthTokens,
    grantedScopes: oauthTokens?.scopes || [],
    readyForConnection: hasClientId && hasClientSecret && hasOAuthTokens
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

function safeError(value) {
  return String(value?.message || value || "Bilinmeyen hata").slice(0, 180);
}

async function readJson(response) {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return { message: text.slice(0, 180) };
  }
}

async function exchangeToken(payload) {
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const result = await readJson(response);
  if (!response.ok || result.code !== 200 || !result.data) {
    const detail = result?.error?.error_description || result?.message || `Token endpoint HTTP ${response.status}`;
    throw new Error(String(detail).slice(0, 180));
  }
  return result.data;
}

async function getValidAccessToken() {
  if (!oauthTokens?.access_token) throw new Error("Önce TikTok OAuth bağlantısını tamamla.");
  const expiresAt = oauthTokens.receivedAt + (Number(oauthTokens.expires_in || 3600) * 1000);
  if (Date.now() < expiresAt - 60_000) return oauthTokens.access_token;

  if (!oauthTokens.refresh_token) {
    oauthTokens = null;
    throw new Error("OAuth erişim süresi dolmuş. Yeniden bağlan.");
  }

  const refreshed = await exchangeToken({
    grant_type: "refresh_token",
    refresh_token: oauthTokens.refresh_token,
    client_id: process.env.OAUTH_CLIENT_ID,
    client_secret: process.env.OAUTH_CLIENT_SECRET
  });
  oauthTokens = { ...refreshed, receivedAt: Date.now() };
  return oauthTokens.access_token;
}

async function eulerRequest(path, options = {}) {
  const token = await getValidAccessToken();
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "x-oauth-token": token,
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {})
    }
  });
  const result = await readJson(response);
  if (!response.ok || (typeof result.code === "number" && result.code !== 200)) {
    const detail = result?.error?.error_description || result?.message || `Euler API HTTP ${response.status}`;
    throw new Error(String(detail).slice(0, 180));
  }
  return result;
}

async function getRoomId() {
  const result = await eulerRequest(`/webcast/anchors/${encodeURIComponent(TARGET)}/room_id`);
  const candidates = [
    result?.room_id,
    result?.data?.room_id,
    result?.response?.room_id,
    result?.response?.data?.room_id
  ];
  const roomId = candidates.find(value => value !== undefined && value !== null && String(value).length > 0);
  const liveFlag = result?.is_live ?? result?.data?.is_live ?? result?.response?.is_live ?? result?.response?.data?.is_live;
  if (!roomId || liveFlag === false) {
    throw new Error(`@${TARGET} canlı görünmüyor veya oda kimliği alınamadı.`);
  }
  return String(roomId);
}

app.get("/health", (_req, res) => {
  const s = status();
  res.json({
    ok: true,
    service: "ninjabox-viewer",
    target: `@${TARGET}`,
    oauthConfigured: s.hasClientId && s.hasClientSecret,
    oauthConnected: s.hasOAuthTokens,
    messageSendingConfigured: s.readyForConnection && s.hasControlPassword,
    ...s
  });
});

app.get("/api/diagnostics", (_req, res) => {
  const s = status();
  const missingVariables = [];
  if (!s.hasClientId) missingVariables.push("OAUTH_CLIENT_ID");
  if (!s.hasClientSecret) missingVariables.push("OAUTH_CLIENT_SECRET");
  if (!s.hasControlPassword) missingVariables.push("VIEWER_CONTROL_PASSWORD");
  if (!s.hasOAuthTokens) missingVariables.push("TikTok OAuth yetkilendirmesi (/auth/tiktok)");
  res.json({
    ok: true,
    ...s,
    missingVariables,
    redirectUri: REDIRECT_URI,
    nextStep: missingVariables.length
      ? "OAuth değişkenlerini ekle ve /auth/tiktok adresinden yetkilendir."
      : "OAuth hazır; bağlantı testi yapılabilir."
  });
});

// Start OAuth authorization. The callback URI must exactly match the Euler Stream dashboard.
app.get("/auth/tiktok", (_req, res) => {
  if (!process.env.OAUTH_CLIENT_ID || !process.env.OAUTH_CLIENT_SECRET) {
    return res.status(503).send("Railway Variables bölümünde OAUTH_CLIENT_ID ve OAUTH_CLIENT_SECRET eksik.");
  }

  const state = crypto.randomBytes(32).toString("hex");
  oauthStates.set(state, Date.now());
  for (const [key, createdAt] of oauthStates) {
    if (Date.now() - createdAt > 10 * 60 * 1000) oauthStates.delete(key);
  }

  const url = new URL(AUTH_URL);
  url.searchParams.set("client_id", process.env.OAUTH_CLIENT_ID);
  url.searchParams.set("redirect_uri", REDIRECT_URI);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "webcast:fetch webcast:chat");
  url.searchParams.set("state", state);
  res.redirect(url.toString());
});

app.get("/oauth/callback", async (req, res) => {
  const { code, state, error, error_description: errorDescription } = req.query;

  if (error) {
    return res.status(400).send(`OAuth onayı tamamlanmadı: ${String(errorDescription || error).slice(0, 180)}`);
  }
  if (typeof code !== "string" || typeof state !== "string" || !oauthStates.has(state)) {
    return res.status(400).send("OAuth doğrulaması geçersiz veya süresi dolmuş. /auth/tiktok adresinden yeniden başla.");
  }
  oauthStates.delete(state);

  try {
    const tokens = await exchangeToken({
      grant_type: "authorization_code",
      code,
      redirect_uri: REDIRECT_URI,
      client_id: process.env.OAUTH_CLIENT_ID,
      client_secret: process.env.OAUTH_CLIENT_SECRET
    });

    const scopes = Array.isArray(tokens.scopes)
      ? tokens.scopes
      : String(tokens.scopes || "").split(/\s+/).filter(Boolean);

    if (!scopes.includes("webcast:chat") || !scopes.includes("webcast:fetch")) {
      oauthTokens = null;
      return res.status(403).send(
        `OAuth giriş yapıldı ancak gerekli izinler yok. Verilen izinler: ${scopes.join(", ") || "bilinmiyor"}. Euler Stream uygulamasında webcast:fetch ve webcast:chat izinlerini seçip yeniden bağlan.`
      );
    }

    oauthTokens = { ...tokens, scopes, receivedAt: Date.now() };
    return res.status(200).send(
      "TikTok OAuth bağlantısı başarılı. Gerekli izinler alındı. Şimdi NinjaBox Viewer sayfasına dönüp önce bağlantı testini yapabilirsin. Bu bağlantı Railway yeniden başlatılırsa yeniden yetkilendirme isteyebilir."
    );
  } catch (err) {
    console.error("OAuth token exchange failed:", safeError(err));
    return res.status(502).send(`OAuth token alınamadı: ${safeError(err)}`);
  }
});

app.post("/api/test-connection", checkPassword, async (_req, res) => {
  const s = status();
  if (!s.readyForConnection) {
    return res.status(503).json({
      ok: false,
      error: "OAuth yapılandırması veya yetkilendirme eksik.",
      missingVariables: [
        ...(!s.hasClientId ? ["OAUTH_CLIENT_ID"] : []),
        ...(!s.hasClientSecret ? ["OAUTH_CLIENT_SECRET"] : []),
        ...(!s.hasOAuthTokens ? ["Önce /auth/tiktok adresinden yetkilendir"] : [])
      ]
    });
  }

  try {
    const roomId = await getRoomId();
    return res.json({
      ok: true,
      connected: true,
      target: `@${TARGET}`,
      roomId,
      message: "OAuth bağlantısı ve canlı yayın oda kontrolü başarılı. Henüz yorum gönderilmedi."
    });
  } catch (err) {
    console.error("OAuth connection test failed:", safeError(err));
    return res.status(502).json({
      ok: false,
      connected: false,
      error: "OAuth bağlantısı veya canlı yayın kontrolü başarısız.",
      detail: safeError(err)
    });
  }
});

app.post("/api/send-message", checkPassword, async (req, res) => {
  const s = status();
  if (!s.readyForConnection) {
    return res.status(503).json({
      ok: false,
      error: "OAuth yapılandırması veya yetkilendirme eksik. Önce /auth/tiktok adresinden bağlan."
    });
  }

  const message = typeof req.body?.message === "string" ? req.body.message.trim() : "";
  if (!message || message.length > 150) {
    return res.status(400).json({ ok: false, error: "Yorum 1–150 karakter arasında olmalı." });
  }
  if (Date.now() - lastMessageAt < 3000) {
    return res.status(429).json({ ok: false, error: "Yeni yorum göndermeden önce 3 saniye bekle." });
  }

  try {
    const roomId = await getRoomId();
    const result = await eulerRequest(`/webcast/rooms/${encodeURIComponent(roomId)}/chat`, {
      method: "POST",
      body: JSON.stringify({ content: message })
    });
    lastMessageAt = Date.now();
    return res.json({
      ok: true,
      message: "Yorum gönderme isteği tamamlandı.",
      target: `@${TARGET}`,
      result: { code: result.code, message: result.message }
    });
  } catch (err) {
    console.error("OAuth message send failed:", safeError(err));
    return res.status(502).json({
      ok: false,
      error: "Yorum gönderilemedi. OAuth iznini, canlı yayın durumunu ve Euler Stream planını kontrol et.",
      detail: safeError(err)
    });
  }
});

app.listen(PORT, () => {
  console.log(`ninjabox-viewer listening on port ${PORT}`);
  console.log(`Target TikTok LIVE: https://www.tiktok.com/@${TARGET}/live`);
});
