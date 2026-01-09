import express from "express";
import fetch from "node-fetch";

const app = express();
app.use(express.json());

const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

/* Health check */
app.get("/health", (req, res) => {
  res.status(200).send("healthy");
});

/* Webhook verification */
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

/* Receive Instagram events */
app.post("/webhook", async (req, res) => {
  try {
    const entry = req.body.entry?.[0];
    const change = entry?.changes?.[0];
    const value = change?.value;

    const commentText = value?.text;
    const commentId = value?.id;

    if (!commentText || !commentId) {
      return res.sendStatus(200);
    }

    console.log("New comment:", commentText);

    /* Ask OpenAI */
    const aiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: "Reply in a friendly, fun, luxury Kuwaiti Instagram style. Use Arabic and English."
          },
          {
            role: "user",
            content: commentText
          }
        ]
      }),
    });

    const aiData = await aiResponse.json();
    const replyText =
      aiData.choices?.[0]?.message?.content || "❤️";

    /* Reply to Instagram comment */
    await fetch(
      `https://graph.facebook.com/v19.0/${commentId}/replies?access_token=${PAGE_ACCESS_TOKEN}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: replyText }),
      }
    );

    console.log("Replied:", replyText);
    res.sendStatus(200);
  } catch (err) {
    console.error(err);
    res.sendStatus(200);
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Server running on port", PORT);
});
