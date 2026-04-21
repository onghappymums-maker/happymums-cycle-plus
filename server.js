const express = require('express');
const Anthropic = require('@anthropic-ai/sdk');
const axios = require('axios');

const app = express();
app.use(express.json());

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const conversations = {};
const userProfiles = {};

const CITATIONS = [
  "La femme africaine est la racine de l'arbre — invisible mais indispensable. 🌳",
  "Une fille educuee change le monde. Commence par te connaitre. 💫",
  "Ton corps est un tresor. Prends soin de lui avec amour. 🌸",
  "La force d'une femme se mesure a sa capacite a se relever. Tu es forte. 💪",
  "Connaitre son corps, c'est le premier acte de liberte. ✨",
  "Chaque fille merite de grandir avec confiance et dignite. 🌺",
  "Tu n'es pas seule. Nous sommes toutes ensemble dans ce voyage. 💛",
];

function getCitationDuJour() {
  const jour = new Date().getDay();
  return CITATIONS[jour % CITATIONS.length];
}

function isNight() {
  const heure = new Date().getUTCHours() + 1;
  return heure >= 22 || heure < 6;
}

const SYSTEM_PROMPT = `Tu es Happy Mum's Cycle+, un assistant de sante menstruelle pour filles et jeunes femmes en Afrique francophone cree par ONG Happy Mum's (Cote d'Ivoire).

PERSONNALITE : Tu parles comme une grande soeur bienveillante. Tu n'es pas medecin. Sois douce, rassurante, jamais jugeante.

ADAPTATION DU LANGAGE :
- Moins de 13 ans : langage tres simple, mots courts, beaucoup d'emojis
- 13-17 ans : simple mais detaille, encourageant
- 18+ : complet, informatif
- Age inconnu : langage simple

URGENCE : Si douleurs intenses, saignements abondants, fievre, evanouissement — donner : 1308 (VBG gratuit), 116 (Enfant en danger 24h/24), 100/170 (Police).

CYCLE : Si regles commencees aujourd'hui — calculer : duree 3-7 jours, prochain cycle +28 jours, periode fertile jours 11-17.

QUIZ : 3 questions choix multiples, une par une, score final.

LANGUE : Reponds dans la langue de l'utilisatrice (francais ou anglais).
ACCUEIL : Commence par "Salut [prenom] 🌸" UNIQUEMENT lors du tout premier message. Ne repete JAMAIS cette salutation apres. A partir du deuxieme message, reponds directement a la question sans salutation ni introduction.
CITATION : Ajoute une citation inspirante UNIQUEMENT dans la toute premiere reponse. Ne la repete PLUS jamais ensuite.
LONGUEUR : Maximum 4 lignes courtes. Pas de listes. Pas de titres en gras. Ton chaleureux comme un SMS de grande soeur. Va droit au but.
Ne jamais te presenter. Ne jamais poser de diagnostic medical.`;

function getMenu() {
  const citation = getCitationDuJour();
  return `🌸✨ *Happy Mum's Cycle+* ✨🌸
💕 Ton espace sans gene, sans jugement 💕

💫 *Citation du jour :*
_${citation}_

Choisis un sujet :

🩸 1 — Mes regles
🚿 2 — Hygiene menstruelle
🔄 3 — Mon cycle
💊 4 — Douleurs et symptomes
💝 5 — Sante sexuelle
🌿 6 — Contraception
📅 7 — Suivi de mon cycle
🎯 8 — Quiz sante
💬 9 — Question libre
👩‍⚕️ 0 — Parler a un humain

🌸 Je suis la pour toi 🌸`;
}

const URGENCE_MSG = `🚨 *ATTENTION - Situation urgente* 🚨

Ce que tu decris necessite une attention immediate.

👉 *Que faire maintenant :*
• Dis a un adulte de confiance (maman, tante, professeure)
• Va au centre de sante le plus proche

📞 *Numeros d urgence gratuits :*
🆘 1308 — Violences et aide aux femmes
👶 116 — Allo Enfant en Danger (24h/24)
👮 100 / 170 — Police Secours

📞 *ONG Happy Mums :*
+225 07 13 51 26 98

Tu n es pas seule. On est la pour toi 💛🌸`;

const URGENT_KEYWORDS = [
  'tres mal', 'beaucoup de sang', 'saigne beaucoup', 'trop de sang',
  'evanoui', 'fievre', 'depuis 10 jours', 'depuis des semaines',
  'insupportable', 'urgence', 'help', 'au secours', 'sos'
];

const SHORTCUTS = {
  "1": "Explique-moi pourquoi on a ses regles et comment ca se passe.",
  "2": "Comment bien faire son hygiene pendant les regles ?",
  "3": "Comment fonctionne le cycle menstruel ?",
  "4": "Pourquoi j'ai mal au ventre pendant mes regles ?",
  "5": "J'ai des questions sur la sante sexuelle.",
  "6": "Comment fonctionne la contraception ?",
  "7": "Je veux suivre mon cycle. Mes regles ont commence aujourd'hui.",
  "8": "Je veux faire un quiz sur la sante menstruelle !",
  "9": "Je veux poser une question libre.",
};

function isUrgent(text) {
  const lower = text.toLowerCase();
  return URGENT_KEYWORDS.some(k => lower.includes(k));
}

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

// ============================================================
// CORS — permet les appels depuis la web app Netlify
// ============================================================
app.use(function(req, res, next) {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
    return;
  }
  next();
});

// ============================================================
// ROUTE /chat — pour la web app Cycle+
// ============================================================
app.post('/chat', async function(req, res) {
  try {
    var msg = req.body.message || '';
    var name = req.body.name || '';
    var age = req.body.age || null;
    if (!msg) {
      res.status(400).json({ error: 'Message requis' });
      return;
    }
    var ctx = name ? '[Utilisatrice: ' + name + (age ? ', ' + age + ' ans' : '') + ']\n' : '';
    var response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 600,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: ctx + msg }]
    });
    res.json({ reply: response.content[0].text });
  } catch(err) {
    console.error('Erreur /chat:', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ============================================================
// WEBHOOK WhatsApp — verification
// ============================================================
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

// ============================================================
// WEBHOOK WhatsApp — messages entrants
// ============================================================
app.post('/webhook', async (req, res) => {
  try {
    const entry = req.body.entry?.[0];
    const change = entry?.changes?.[0];
    const message = change?.value?.messages?.[0];
    if (!message) return res.sendStatus(200);

    const from = message.from;
    const body = message.text?.body?.trim() || '';
    const lower = body.toLowerCase();

    if (!conversations[from]) conversations[from] = [];
    if (!userProfiles[from]) userProfiles[from] = { age: null, name: null, isNew: true };

    // Message de bienvenue premiere fois
    if (userProfiles[from].isNew) {
      userProfiles[from].isNew = false;
      const nightMsg = isNight() ? "\n\n🌙 Je suis la meme la nuit ! Pose ta question, je reponds 💛" : "";
      await sendMessage(from,
        `Salut 🌸\nJe suis Happy Mum's Cycle+, ton espace sur pour parler de tes regles, de ton corps et de ta sante 💬\nIci, tu peux poser toutes tes questions, sans gene et sans jugement.\n\nQue ce soit :\n🩸 tes regles\n🔄 ton cycle\n❤️ ta sante sexuelle\n😣 ou une inquietude\n\nJe suis la pour t'expliquer simplement et te rassurer.\n\nAvant de commencer, puis-je connaitre ton prenom et ton age ?\n(Ex: "Je m'appelle Awa, j'ai 15 ans")${nightMsg}`
      );
      return res.sendStatus(200);
    }

    // Enregistrer prenom et age
    const prenomAgeMatch = body.match(/je m'?appelle ([a-zA-ZÀ-ÿ]+).*?(\d+)\s*ans/i) ||
                           body.match(/([a-zA-ZÀ-ÿ]+).*?j'?ai\s*(\d+)\s*ans/i);
    if (prenomAgeMatch && !userProfiles[from].name) {
      userProfiles[from].name = prenomAgeMatch[1];
      userProfiles[from].age = parseInt(prenomAgeMatch[2]);
      const prenom = userProfiles[from].name;
      await sendMessage(from,
        `Enchantee ${prenom} ! 🌸\n\nJe suis la pour toi. Voici ce que je peux faire :\n\n${getMenu()}`
      );
      return res.sendStatus(200);
    }

    // Menu
    if (lower === 'menu' || lower === 'start') {
      const nightMsg = isNight() ? "\n\n🌙 Je suis la meme la nuit ! Pose ta question, je reponds 💛" : "";
      await sendMessage(from, getMenu() + nightMsg);
      return res.sendStatus(200);
    }

    // Contact humain
    if (body === '0') {
      await sendMessage(from,
        "Pour parler a un humain 🌸\n\n📞 +225 07 13 51 26 98\n📧 onghappymums@gmail.com\n\nNous sommes la pour toi 💛"
      );
      return res.sendStatus(200);
    }

    // Urgence
    if (isUrgent(body)) {
      await sendMessage(from, URGENCE_MSG);
      return res.sendStatus(200);
    }

    // Detection age dans message
    const ageMatch = body.match(/j'ai (\d+) ans|i am (\d+)|(\d+) ans/i);
    if (ageMatch && !userProfiles[from].age) {
      userProfiles[from].age = parseInt(ageMatch[1] || ageMatch[2] || ageMatch[3]);
    }

    const prompt = SHORTCUTS[body] || body;
    const prenom = userProfiles[from].name || "";
    const age = userProfiles[from].age;
    const userContext = age ? `[Utilisatrice: ${prenom}, ${age} ans - adapte ton langage]` : prenom ? `[Utilisatrice: ${prenom}]` : "";

    conversations[from].push({
      role: 'user',
      content: userContext ? `${userContext}\n${prompt}` : prompt
    });

    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 600,
      system: SYSTEM_PROMPT,
      messages: conversations[from].slice(-10)
    });

    const reply = response.content[0].text;
    conversations[from].push({ role: 'assistant', content: reply });

    const menuReminder = "\n\n➡️ _Tape *menu* pour revenir au menu_ 🌸";
    const finalReply = isNight()
      ? reply + "\n\n🌙 _Je suis la meme la nuit, n'hesite pas_ 💛" + menuReminder
      : reply + menuReminder;

    await sendMessage(from, finalReply);
    res.sendStatus(200);

  } catch (err) {
    console.error('Erreur:', err.message);
    res.sendStatus(200);
  }
});

app.listen(process.env.PORT || 3000, () => console.log('Cycle+ Meta actif 🌸'));
