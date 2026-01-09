import express from "express";
import OpenAI from "openai";
import fetch from "node-fetch";

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 8080;

// ✅ REQUIRED HEALTH ROUTES (VERY IMPORTANT)
app.get("/", (req, res) => {
  res.status(200).send("OK");
});

app.get("/health", (req, res) => {
  res.status(200).send("healthy");
});

// OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Webhook verification
app.get("/webhook", (req, res) => {
  const VERIFY_TOKEN = process.env.VERIFY_TOKEN;

  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    console.log("Webhook verified");
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

// Webhook receiver
app.post("/webhook", async (req, res) => {
  res.sendStatus(200);

  try {
    const entry = req.body.entry?.[0];
    const change = entry?.changes?.[0];
    const value = change?.value;

    if (!value || !value.text || !value.id) return;

    const commentText = value.text;
    const commentId = value.id;

    console.log("New comment:", commentText);

    const aiResponse = await openai.responses.create({
      model: "gpt-4.1-mini",
      input: `Reply politely in Arabic to this Instagram comment:\n"${commentText}"`,
    });

    const reply =
      aiResponse.output_text ||
      aiResponse.output?.[0]?.content?.[0]?.text ||
      "وعليكم السلام";

    console.log("Generated reply:", reply);

    await fetch(
      `https://graph.facebook.com/v19.0/${commentId}/replies`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.PAGE_ACCESS_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ message: reply }),
      }
    );

    console.log("Reply posted successfully");

  } catch (err) {
    console.error("Webhook error:", err);
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
