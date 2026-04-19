const express = require('express');
const Anthropic = require('@anthropic-ai/sdk');
const axios = require('axios');

const app = express();
app.use(express.json());

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const conversations = {};

const SYSTEM_PROMPT = "Tu es Happy Mum's Cycle+, un assistant de sante menstruelle pour filles et jeunes femmes en Afrique francophone. Tu parles comme une grande soeur bienveillante. Tu n'es pas medecin. Tu dois toujours rassurer, expliquer simplement, donner un conseil pratique, et orienter vers un professionnel si necessaire. Reponds toujours en francais.";

const MENU = "🌸🌸🌸🌸🌸🌸🌸🌸\n💕 *Happy Mum's Cycle+* 💕\n🌸🌸🌸🌸🌸🌸🌸🌸\n\n_Ton espace sans gêne_ ✨\n\n🩸 1 — Mes règles\n🚿 2 — Hygiène\n🔄 3 — Mon cycle\n💊 4 — Douleurs\n💝 5 — Santé sexuelle\n🌿 6 — Contraception\n💬 7 — Question libre\n👩‍⚕️ 0 — Parler à un humain\n\n💛 _Je suis là pour toi_ 💛";

const SHORTCUTS = {
  "1": "Explique-moi pourquoi on a ses regles.",
  "2": "Comment bien faire son hygiene pendant les regles ?",
  "3": "Comment fonctionne le cycle menstruel ?",
  "4": "Pourquoi j'ai mal au ventre pendant mes regles ?",
  "5": "J'ai des questions sur la sante sexuelle.",
  "6": "Comment fonctionne la contraception ?",
  "7": "Je veux poser une question.",
};

async function sendMessage(to, message) {
  await axios.post(
    `https://graph.facebook.com/v18.0/${process.env.WHATSAPP_PHONE_ID}/messages`,
    {
      messaging_product: "whatsapp",
      to: to,
      type: "text",
      text: { body: message }
    },
    {
      headers: {
        Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
        "Content-Type": "application/json"
      }
    }
  );
}

// Verification webhook Meta
app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (mode === 'subscribe' && token === process.env.VERIFY_TOKEN) {
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

// Reception messages
app.post('/webhook', async (req, res) => {
  try {
    res.sendStatus(200);
    const entry = req.body.entry?.[0];
    const change = entry?.changes?.[0];
    const message = change?.value?.messages?.[0];
    if (!message) return;

    const from = message.from;
    const body = (message.text?.body || '').trim();
    const lower = body.toLowerCase();

    if (!conversations[from]) conversations[from] = [];

    if (lower === 'menu' || lower === 'start') {
      return await sendMessage(from, MENU);
    }

    if (body === '0') {
      return await sendMessage(from, "Pour parler à un humain 🌸\n📞 +225 07 13 51 26 98\n📧 onghappymums@gmail.com\n\nNous sommes là pour toi 💛");
    }

    const prompt = SHORTCUTS[body] || body;
    conversations[from].push({ role: 'user', content: prompt });

    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 500,
      system: SYSTEM_PROMPT,
      messages: conversations[from].slice(-10)
    });

    const reply = response.content[0].text;
    conversations[from].push({ role: 'assistant', content: reply });
    await sendMessage(from, reply);

  } catch (err) {
    console.error('Erreur:', err.message);
  }
});

app.listen(process.env.PORT || 3000, () => console.log('Cycle+ Meta actif'));
