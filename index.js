import express from "express";
import OpenAI from "openai";

const app = express();
app.use(express.json({ verify: (req, res, buf) => (req.rawBody = buf) }));

// ENV
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

if (!VERIFY_TOKEN || !PAGE_ACCESS_TOKEN || !OPENAI_API_KEY) {
  console.log("Missing env vars. Need: VERIFY_TOKEN, PAGE_ACCESS_TOKEN, OPENAI_API_KEY");
}

const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

// --- Health check (so /health works) ---
app.get("/health", (req, res) => res.status(200).send("ok"));

// --- Webhook verification (Meta calls this) ---
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    console.log("Webhook verified ✅");
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

// --- Main webhook receiver ---
app.post("/webhook", async (req, res) => {
  // Always respond quickly to Meta
  res.sendStatus(200);

  try {
    const body = req.body;

    // Instagram comments webhook payload usually includes entry[].changes[]
    const entries = body?.entry || [];
    for (const entry of entries) {
      const changes = entry?.changes || [];
      for (const change of changes) {
        const field = change?.field;

        // We handle comments & live_comments
        if (field !== "comments" && field !== "live_comments") continue;

        const value = change?.value || {};
        const commentId = value?.id;      // IG comment id
        const text = value?.text || "";
        const username = value?.from?.username || "someone";

        if (!commentId || !text) continue;

        console.log(`New comment from @${username}: ${text}`);

        const replyText = await buildReply(text);

        // Post reply to Instagram comment
        const url = `https://graph.facebook.com/v24.0/${commentId}/replies`;
        const r = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            message: replyText,
            access_token: PAGE_ACCESS_TOKEN
          })
        });

        const data = await r.json().catch(() => ({}));

        if (!r.ok) {
          console.log("❌ Reply failed:", r.status, data);
        } else {
          console.log("✅ Replied:", replyText);
        }
      }
    }
  } catch (e) {
    console.log("Webhook error:", e?.message || e);
  }
});

// --- Reply logic ---
async function buildReply(userText) {
  const t = (userText || "").toLowerCase().trim();

  // Hard rule for your example
  if (t.includes("salam") || t.includes("salam alikom") || t.includes("السلام") || t.includes("السلام عليكم")) {
    return "وعليكم السلام 🤍";
  }

  // Otherwise use OpenAI
  // (Keep it short so it fits IG comments nicely)
  const prompt = `You are an Instagram assistant. Reply in a friendly short way (1 sentence).
User comment: "${userText}"`;

  const resp = await openai.responses.create({
    model: "gpt-4.1-mini",
    input: prompt
  });

  const out = resp.output_text?.trim();
  return out && out.length > 0 ? out : "شكراً لك 🤍";
}

const port = process.env.PORT || 3000;
app.listen(port, () => console.log("Server running on port", port));
