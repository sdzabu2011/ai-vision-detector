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
Uzbek: laptop=noutbuk,phone=telefon,person=odam,chair=stul,cup=piyola,book=kitob,monitor=monitor,keyboard=klaviatura,mouse=sichqoncha,bottle=shisha,table=stol,door=eshik,window=deraza,wall=devor,bag=sumka,pen=ruchka,lamp=chiroq,clock=soat,glasses=ko'zoynak,headphones=quloqchin,shirt=ko'ylak,pants=shim,shoes=oyoq kiyim,hat=shapka,car=mashina,tree=daraxt,flower=gul,dog=it,cat=mushuk,bird=qush,food=ovqat,plate=likopcha,hand=qo'l,finger=barmoq,face=yuz,eye=ko'z,nose=burun,mouth=og'iz,hair=soch,screen=ekran,cable=kabel,charger=quvvatlagich,paper=qog'oz,box=quti,remote=pult,pillow=yostiq,blanket=ko'rpa,curtain=parda,mirror=oyna,fan=ventilyator,speaker=karnay,camera=kamera,tv=televizor
Output ONLY the JSON array.`;

app.use(express.json({ limit: '20mb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/health', (req, res) => {
  // Kalitni tekshirish — boshi va oxirini ko'rsatish (xavfsiz)
  let keyPreview = '';
  if (GEMINI_KEY) {
    if (GEMINI_KEY.length > 8) {
      keyPreview = GEMINI_KEY.substring(0, 4) + '...' + GEMINI_KEY.substring(GEMINI_KEY.length - 4);
    } else {
      keyPreview = '***';
    }
  }

  res.json({
    status: 'ok',
    hasKey: !!GEMINI_KEY,
    keyLength: GEMINI_KEY.length,
    keyPreview: keyPreview,
    model: GEMINI_MODEL
  });
});

app.post('/api/analyze', async (req, res) => {
  const t0 = Date.now();
  try {
    const clientKey = req.headers['x-client-key'] || '';
    const key = GEMINI_KEY || clientKey;

    if (!key) {
      return res.status(401).json({
        ok: false,
        error: 'API kaliti topilmadi. Render → Environment Variables → GEMINI_API_KEY ni tekshiring.'
      });
    }

    const { image } = req.body;
    if (!image) {
      return res.status(400).json({ ok: false, error: 'Tasvir yuborilmadi' });
    }

    const url = `${GEMINI_URL}?key=${key}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { inlineData: { mimeType: 'image/jpeg', data: image } },
            { text: PROMPT }
          ]
        }],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 2048,
          topP: 0.8,
          topK: 40
        },
        safetySettings: [
          { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
          { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
          { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
          { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' }
        ]
      })
    });

    // Batafsil xato ma'lumotlari
    if (!response.ok) {
      const errBody = await response.text();
      let errMsg = '';
      let errDetail = '';

      try {
        const errJson = JSON.parse(errBody);
        errMsg = errJson?.error?.message || '';
        errDetail = errJson?.error?.status || '';
      } catch {
        errMsg = errBody.substring(0, 200);
      }

      console.error(`[GEMINI ERROR] Status: ${response.status} | ${errDetail} | ${errMsg}`);

      if (response.status === 400) {
        // API key format xatosi yoki request xatosi
        if (errMsg.toLowerCase().includes('api key')) {
          return res.status(400).json({
            ok: false,
            error: `API kaliti noto'g'ri format: ${errMsg}. Render → Environment Variables da GEMINI_API_KEY ni tekshiring. Kalit "AIza..." bilan boshlanishi kerak.`
          });
        }
        return res.status(400).json({
          ok: false,
          error: `So'rov xatosi: ${errMsg}`
        });
      }

      if (response.status === 403) {
        return res.status(403).json({
          ok: false,
          error: `API kaliti noto'g'ri yoki faol emas: ${errMsg}. aistudio.google.com/apikey dan yangi kalit oling.`
        });
      }

      if (response.status === 429) {
        return res.status(429).json({
          ok: false,
          error: 'Rate limit — 1 daqiqa kuting yoki intervalni oshiring (4s/6s)'
        });
      }

      return res.status(response.status).json({
        ok: false,
        error: `Gemini xatosi (${response.status}): ${errMsg}`
      });
    }

    const data = await response.json();

    // Javob bo'shmi tekshirish
    if (!data.candidates || !data.candidates.length) {
      console.error('[GEMINI] Bo\'sh javob:', JSON.stringify(data).substring(0, 300));
      return res.json({ ok: true, objects: [], ms: Date.now() - t0 });
    }

    const raw = data.candidates[0]?.content?.parts?.[0]?.text || '[]';

    // JSON tozalash
    let clean = raw
      .replace(/```json\s*/gi, '')
      .replace(/```\s*/gi, '')
      .trim();

    let objects = [];
    try {
      objects = JSON.parse(clean);
    } catch {
      const m = clean.match(/\[[\s\S]*?\]/);
      if (m) {
        try { objects = JSON.parse(m[0]); } catch { objects = []; }
      }
    }

    if (!Array.isArray(objects)) objects = [];

    const cl = (v, a, b) => Math.min(Math.max(v, a), b);

    objects = objects
      .filter(o => o && o.label)
      .slice(0, 10)
      .map(o => ({
        label: String(o.label || '').toLowerCase(),
        labelUz: String(o.labelUz || o.label || ''),
        x: cl(parseFloat(o.x) || 0, 0, 1),
        y: cl(parseFloat(o.y) || 0, 0, 1),
        w: cl(parseFloat(o.w) || 0.05, 0.01, 1),
        h: cl(parseFloat(o.h) || 0.05, 0.01, 1),
        shape: ['rectangle', 'circle', 'triangle'].includes(o.shape) ? o.shape : 'rectangle',
        confidence: cl(parseFloat(o.confidence) || 0.5, 0, 1),
        category: String(o.category || 'unknown').toLowerCase()
      }));

    res.json({
      ok: true,
      objects,
      ms: Date.now() - t0
    });

  } catch (err) {
    console.error('[SERVER ERROR]', err.message);
    res.status(500).json({
      ok: false,
      error: 'Server xatosi: ' + err.message
    });
  }
});

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(PORT, '0.0.0.0', () => {
  console.log('');
  console.log('  ╔═══════════════════════════════════════╗');
  console.log('  ║   AI VISION DETECTOR v4.1              ║');
  console.log('  ╚═══════════════════════════════════════╝');
  console.log('');
  console.log(`  Port:    ${PORT}`);
  console.log(`  Model:   ${GEMINI_MODEL}`);
  console.log(`  API Key: ${GEMINI_KEY ? '✅ Mavjud (' + GEMINI_KEY.length + ' belgi)' : '❌ YO\'Q'}`);
  if (GEMINI_KEY) {
    console.log(`  Preview: ${GEMINI_KEY.substring(0, 6)}...${GEMINI_KEY.substring(GEMINI_KEY.length - 4)}`);
  }
  console.log('');
  if (!GEMINI_KEY) {
    console.log('  ⚠️  GEMINI_API_KEY environment variable o\'rnatilmagan!');
    console.log('  → Render Dashboard → Environment Variables');
    console.log('  → BEPUL kalit: https://aistudio.google.com/apikey');
    console.log('');
  }
});