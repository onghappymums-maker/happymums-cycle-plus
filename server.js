const express = require('express');
const Anthropic = require('@anthropic-ai/sdk');
const twilio = require('twilio');

const app = express();
app.use(express.urlencoded({ extended: false }));

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const conversations = {};

const SYSTEM_PROMPT = "Tu es Happy Mum's Cycle+, un assistant de sante menstruelle pour filles et jeunes femmes en Afrique francophone. Tu parles comme une grande soeur bienveillante. Tu n'es pas medecin. Tu dois toujours rassurer, expliquer simplement, donner un conseil pratique, et orienter vers un professionnel si necessaire.";

app.post('/webhook', async (req, res) => {
  const from = req.body.From;
  const body = req.body.Body ? req.body.Body.trim() : '';
  if (!conversations[from]) conversations[from] = [];
  if (body.toLowerCase() === 'menu' || body.toLowerCase() === 'start') {
    const twiml = new twilio.twiml.MessagingResponse();
    twiml.message('Bienvenue ! Je suis Happy Mums Cycle+\n\n1 - Regles\n2 - Hygiene\n3 - Cycle\n4 - Douleurs\n5 - Sante sexuelle\n6 - Contraception\n7 - Question libre\n0 - Contact humain');
    return res.type('text/xml').send(twiml.toString());
  }
  conversations[from].push({ role: 'user', content: body });
  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 500,
    system: SYSTEM_PROMPT,
    messages: conversations[from].slice(-10)
  });
  const reply = response.content[0].text;
  conversations[from].push({ role: 'assistant', content: reply });
  const twiml = new twilio.twiml.MessagingResponse();
  twiml.message(reply);
  res.type('text/xml').send(twiml.toString());
});

app.listen(process.env.PORT || 3000, () => console.log('Cycle+ actif'));
