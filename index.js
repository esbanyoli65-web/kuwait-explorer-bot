import express from "express";
import fetch from "node-fetch";

const app = express();
app.use(express.json());

const VERIFY_TOKEN = process.env.VERIFY_TOKEN;

// Home
app.get("/", (req, res) => {
  res.status(200).send("OK");
});

// Health
app.get("/health", (req, res) => {
  res.status(200).send("healthy");
});

// Webhook verification (Meta)
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }

  return res.sendStatus(403);
});

// Webhook events
app.post("/webhook", (req, res) => {
  console.log("Webhook event:", req.body);
  res.sendStatus(200);
});

// ===============================
// Instagram OAuth (Business Login)
// ===============================

// Optional helper: open this in browser to start login
// https://YOUR-RAILWAY-URL.up.railway.app/login/instagram
app.get("/login/instagram", (req, res) => {
  const client_id = process.env.IG_APP_ID;
  const redirect_uri = process.env.IG_REDIRECT_URI;

  if (!client_id || !redirect_uri) {
    return res
      .status(500)
      .send("Missing IG_APP_ID or IG_REDIRECT_URI in Railway Variables.");
  }

  const authUrl =
    `https://www.instagram.com/oauth/authorize` +
    `?client_id=${encodeURIComponent(client_id)}` +
    `&redirect_uri=${encodeURIComponent(redirect_uri)}` +
    `&response_type=code` +
    `&scope=instagram_business_basic,instagram_business_manage_messages`;

  return res.redirect(authUrl);
});

// IMPORTANT callback: this must match EXACTLY what you set in Meta Redirect URI
// Example: https://zoological-caring-production-ed94.up.railway.app/oauth/callback
app.get("/oauth/callback", async (req, res) => {
  try {
    const code = req.query.code;
    if (!code) return res.status(400).send("Missing ?code=");

    const appId = process.env.IG_APP_ID;
    const appSecret = process.env.IG_APP_SECRET;
    const redirectUri = process.env.IG_REDIRECT_URI;

    if (!appId || !appSecret || !redirectUri) {
      return res
        .status(500)
        .send("Missing IG_APP_ID or IG_APP_SECRET or IG_REDIRECT_URI.");
    }

    const tokenRes = await fetch("https://api.instagram.com/oauth/access_token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: appId,
        client_secret: appSecret,
        grant_type: "authorization_code",
        redirect_uri: redirectUri,
        code: code,
      }),
    });

    const tokenData = await tokenRes.json();

    if (!tokenRes.ok) {
      console.log("IG token error:", tokenData);
      return res.status(400).json(tokenData);
    }

    console.log("✅ IG token success:", tokenData);

    return res.status(200).json({
      ok: true,
      message: "Instagram OAuth success ✅ Check Railway logs for tokenData.",
      tokenData,
    });
  } catch (err) {
    console.error("OAuth callback error:", err);
    return res.status(500).send("OAuth callback error");
  }
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Server running on port", PORT);
});
