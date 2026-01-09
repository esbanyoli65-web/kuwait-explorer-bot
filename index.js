import express from "express";
import OpenAI from "openai";

const app = express();

// IMPORTANT: Meta sends JSON, we must parse it
app.use(express.json({ limit: "2mb" }));

const PORT = process.env.PORT || 3000;

// ====== ENV VARS (Railway Variables) ======
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;          // must match Meta "Verify token"
const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN; // IG/Page token used to reply
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;       // your OpenAI secret key

if (!VERIFY_TOKEN || !PAGE_ACCESS_TOKEN || !OPENAI_API_KEY) {
  console.warn("⚠️ Missing env vars. Please set VERIFY_TOKEN, PAGE_ACCESS_TOKEN, OPENAI_API_KEY in Railway.");
}

const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

// ====== Health ======
app.get("/health", (req, res) => res.status(200).send("ok"));

// ====== Webhook Verification (GET) ======
// Meta calls this when you click "Verify and save"
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    console.log("✅ Webhook verified");
    return res.status(200).send(challenge);
  }

  console.log("❌ Webhook verify failed");
  return res.sendStatus(403);
});

// ====== Helpers ======
function normalizeText(t = "") {
  return String(t).trim();
}

async function generateReplyWithOpenAI(commentText) {
  const text = normalizeText(commentText);

  // Quick rules (optional) before AI
  if (!text) return "🙏";

  const systemPrompt = `
You are an Instagram auto-reply assistant for "Kuwait Explorer".
Rules:
- Reply in the SAME language as the user's comment (Arabic or English).
- Keep replies short (1 sentence).
- If user says "سلام عليكم" or "السلام عليكم" or similar: reply exactly "وعليكم السلام ورحمة الله وبركاته".
- Be friendly and helpful.
`;

  const userPrompt = `User comment: ${text}\nWrite the best reply now.`;

  const r = await openai.responses.create({
    model: "gpt-4.1-mini",
    input: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt }
    ]
  });

  // openai-node returns output_text helper in many cases
  const out =
    (r && typeof r.output_text === "string" && r.output_text.trim()) ||
    "";

  return out || "❤️";
}

async function replyToInstagramComment(commentId, message) {
  // IG comment replies edge:
  // POST https://graph.facebook.com/vXX.X/{comment-id}/replies?message=...&access_token=...
  const url = `https://graph.facebook.com/v20.0/${commentId}/replies`;

  const body = new URLSearchParams();
  body.set("message", message);
  body.set("access_token", PAGE_ACCESS_TOKEN);

  const resp = await fetch(url, {
    method: "POST",
    body
  });

  const data = await resp.json().catch(() => ({}));

  if (!resp.ok) {
    console.error("❌ Reply failed:", resp.status, data);
    throw new Error(`Reply failed: ${resp.status}`);
  }

  return data;
}

// ====== Webhook Receiver (POST) ======
app.post("/webhook", async (req, res) => {
  // Always ACK fast, then process async
  res.sendStatus(200);

  try {
    const body = req.body;

    // Log basic
    console.log("Webhook event:", JSON.stringify(body, null, 2));

    if (body.object !== "instagram" || !Array.isArray(body.entry)) return;

    for (const entry of body.entry) {
      const changes = entry.changes || [];
      for (const change of changes) {
        const field = change.field;

        // We handle comments & live_comments
        if (field !== "comments" && field !== "live_comments") continue;

        const value = change.value || {};
        const commentId = value.id;       // this is the IG comment id
        const commentText = value.text;   // comment text

        if (!commentId) {
          console.log("⚠️ Missing comment id in webhook payload.");
          continue;
        }

        console.log("New comment:", commentText);

        const reply = await generateReplyWithOpenAI(commentText);
        await replyToInstagramComment(commentId, reply);

        console.log("Replied:", reply);
      }
    }
  } catch (err) {
    console.error("Webhook processing error:", err);
  }
});

// ====== Start Server ======
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});
