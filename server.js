const express = require('express');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;
const GEMINI_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_MODEL = 'gemini-2.0-flash';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

const PROMPT = `You are a real-time computer vision AI. Analyze this image and detect ALL visible objects.
Return ONLY a raw JSON array. NO markdown, NO code fences, NO explanation.
Response must start with [ and end with ].
Max 10 objects. If nothing found return [].
Each object: {"label":"english","labelUz":"uzbek","x":0.0-1.0,"y":0.0-1.0,"w":0.0-1.0,"h":0.0-1.0,"shape":"rectangle"|"circle"|"triangle","confidence":0.0-1.0,"category":"word"}
Uzbek: laptop=noutbuk,phone=telefon,person=odam,chair=stul,cup=piyola,book=kitob,monitor=monitor,keyboard=klaviatura,mouse=sichqoncha,bottle=shisha,table=stol,door=eshik,window=deraza,wall=devor,bag=sumka,pen=ruchka,lamp=chiroq,clock=soat,glasses=ko'zoynak,headphones=quloqchin,shirt=ko'ylak,pants=shim,shoes=oyoq kiyim,hat=shapka,watch=soat,ring=uzuk,car=mashina,tree=daraxt,flower=gul,dog=it,cat=mushuk,bird=qush,food=ovqat,plate=likopcha,fork=vilka,knife=pichoq,spoon=qoshiq
Output ONLY the JSON array.`;

app.use(express.json({ limit: '20mb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', hasKey: !!GEMINI_KEY, model: GEMINI_MODEL });
});

app.post('/api/analyze', async (req, res) => {
  const t0 = Date.now();
  try {
    const key = GEMINI_KEY || req.headers['x-client-key'] || '';
    if (!key) return res.status(401).json({ ok: false, error: 'API kaliti yo\'q' });
    const { image } = req.body;
    if (!image) return res.status(400).json({ ok: false, error: 'Tasvir yo\'q' });

    const r = await fetch(`${GEMINI_URL}?key=${key}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [
          { inlineData: { mimeType: 'image/jpeg', data: image } },
          { text: PROMPT }
        ]}],
        generationConfig: { temperature: 0.1, maxOutputTokens: 2048 },
        safetySettings: [
          { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
          { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
          { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
          { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' }
        ]
      })
    });

    if (!r.ok) {
      const e = await r.json().catch(() => ({}));
      let msg = 'API xato: ' + r.status;
      if (r.status === 429) msg = 'Rate limit — kuting';
      else if (r.status === 403) msg = 'Kalit noto\'g\'ri';
      else msg = e?.error?.message || msg;
      return res.status(r.status).json({ ok: false, error: msg });
    }

    const data = await r.json();
    const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text || '[]';
    let clean = raw.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim();
    let objects = [];
    try { objects = JSON.parse(clean); } catch {
      const m = clean.match(/\[[\s\S]*?\]/);
      if (m) try { objects = JSON.parse(m[0]); } catch {}
    }
    if (!Array.isArray(objects)) objects = [];
    const cl = (v, a, b) => Math.min(Math.max(v, a), b);
    objects = objects.filter(o => o && o.label).slice(0, 10).map(o => ({
      label: String(o.label || '').toLowerCase(),
      labelUz: String(o.labelUz || o.label || ''),
      x: cl(parseFloat(o.x) || 0, 0, 1), y: cl(parseFloat(o.y) || 0, 0, 1),
      w: cl(parseFloat(o.w) || .05, .01, 1), h: cl(parseFloat(o.h) || .05, .01, 1),
      shape: ['rectangle','circle','triangle'].includes(o.shape) ? o.shape : 'rectangle',
      confidence: cl(parseFloat(o.confidence) || .5, 0, 1),
      category: String(o.category || 'unknown').toLowerCase()
    }));
    res.json({ ok: true, objects, ms: Date.now() - t0 });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.listen(PORT, '0.0.0.0', () => console.log(`Server :${PORT} Key:${GEMINI_KEY ? 'YES' : 'NO'}`));