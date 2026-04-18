const express = require('express');
const Anthropic = require('@anthropic-ai/sdk');
const twilio = require('twilio');

const app = express();
app.use(express.urlencoded({ extended: false }));

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const conversations = {};

const SYSTEM_PROMPT = "Tu es Happy Mum's Cycle+, un assistant de sante menstruelle pour filles et jeunes femmes en Afrique francophone. Tu parles comme une grande soeur bienveillante. Tu n'es pas medecin. Tu dois toujours rassurer, expliquer simplement, donner un conseil pratique, et orienter vers un professionnel si necessaire. Reponds toujours en francais.";

const MENU = "Bienvenue ! Je suis Happy Mums Cycle+ 🌸\n\n1 - Regles\n2 - Hygiene\n3 - Cycle\n4 - Douleurs\n5 - Sante sexuelle\n6 - Contraception\n7 - Question libre\n0 - Contact humain";

const SHORTCUTS = {
  "1": "Explique-moi pourquoi on a ses regles.",
  "2": "Comment bien faire son hygiene pendant les regles ?",
  "3": "Comment fonctionne le cycle menstruel ?",
  "4": "Pourquoi j'ai mal au ventre pendant mes regles ?",
  "5": "J'ai des questions sur la sante sexuelle.",
  "6": "Comment fonctionne la contraception ?",
  "7": "Je veux poser une question.",
  "0": "contact"
};

function sendTwiml(res, message) {
  const twiml = new twilio.twiml.MessagingResponse();
  twiml.message(message);
  res.type('text/xml').send(twiml.toString());
}

app.post('/webhook', async (req, res) => {
  try {
    const from = req.body.From || 'unknown';
    const body = (req.body.Body || '').trim();
    const lower = body.toLowerCase();

    if (!conversations[from]) conversations[from] = [];

    if (lower === 'menu' || lower === 'start') {
      return sendTwiml(res, MENU);
    }

    if (body === '0') {
      return sendTwiml(res, "Pour parler a un humain, contacte directement ONG Happy Mums :\nTel : +225 07 13 51 26 98\nEmail : onghappymums@gmail.com 🌸");
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
    sendTwiml(res, reply);

  } catch (err) {
    console.error('Erreur:', err.message);
    sendTwiml(res, "Desolee, une erreur s'est produite. Reessaie dans un instant 🌸");
  }
});

app.listen(process.env.PORT || 3000, () => console.log('Cycle+ actif'));
