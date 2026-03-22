const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';
const GEMINI_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_MODEL = 'gemini-2.0-flash';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

const VISION_PROMPT = `You are an advanced real-time computer vision AI system. Analyze this camera frame carefully and detect ALL clearly visible objects.

ABSOLUTE RULES:
1. Return ONLY a raw JSON array. NO markdown, NO code fences, NO backticks, NO explanation
2. Response must start with [ and end with ]
3. Maximum 10 objects per frame
4. Only detect objects you can clearly identify
5. If nothing identifiable, return exactly: []

Each object must have EXACTLY these fields:
{
  "label": "english name lowercase",
  "labelUz": "uzbek translation",
  "x": 0.0-1.0 (left edge normalized),
  "y": 0.0-1.0 (top edge normalized),
  "w": 0.0-1.0 (width normalized),
  "h": 0.0-1.0 (height normalized),
  "shape": "rectangle" | "circle" | "triangle",
  "confidence": 0.0-1.0,
  "category": "single_word"
}

Shape: circle for round objects, triangle for triangular, rectangle for everything else.
Categories: electronics, furniture, person, food, clothing, vehicle, animal, plant, tool, book, container, decoration
Uzbek examples: laptop=noutbuk, phone=telefon, person=odam, chair=stul, cup=piyola, book=kitob, monitor=monitor, keyboard=klaviatura, mouse=sichqoncha, bottle=shisha, pen=ruchka, bag=sumka, table=stol, lamp=chiroq, door=eshik, window=deraza, wall=devor, clock=soat, glasses=ko'zoynak, headphones=quloqchin

Output ONLY the JSON array.`;

app.use(express.json({ limit: '20mb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    serverKeyConfigured: !!GEMINI_KEY,
    model: GEMINI_MODEL,
    provider: 'Google Gemini (BEPUL)',
    limits: { rpm: 15, rpd: 1500, cost: 'BEPUL' },
    environment: NODE_ENV,
    uptime: Math.floor(process.uptime())
  });
});

app.post('/api/analyze', async (req, res) => {
  const t0 = Date.now();
  try {
    const clientKey = req.headers['x-client-key'] || '';
    const apiKey = GEMINI_KEY || clientKey;
    if (!apiKey) {
      return res.status(401).json({ success: false, error: 'Gemini API kaliti topilmadi. aistudio.google.com/apikey dan BEPUL oling!' });
    }

    const { image } = req.body;
    if (!image || typeof image !== 'string') {
      return res.status(400).json({ success: false, error: 'Tasvir yuborilmadi' });
    }

    const response = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [
          { inlineData: { mimeType: 'image/jpeg', data: image } },
          { text: VISION_PROMPT }
        ]}],
        generationConfig: { temperature: 0.1, maxOutputTokens: 2048, topP: 0.8, topK: 40 },
        safetySettings: [
          { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
          { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
          { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
          { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' }
        ]
      })
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      let msg = 'Gemini API xatosi: ' + response.status;
      if (response.status === 429) msg = 'Rate limit — 1 daqiqa kuting (15 RPM)';
      else if (response.status === 403) msg = 'API kaliti noto\'g\'ri yoki faol emas';
      else msg = err?.error?.message || msg;
      return res.status(response.status).json({ success: false, error: msg });
    }

    const data = await response.json();
    const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text || '[]';
    let cleaned = raw.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim();

    let objects = [];
    try { objects = JSON.parse(cleaned); } catch {
      const m = cleaned.match(/\[[\s\S]*?\]/);
      if (m) try { objects = JSON.parse(m[0]); } catch { objects = []; }
    }
    if (!Array.isArray(objects)) objects = [];

    function clamp(v, a, b) { return Math.min(Math.max(v, a), b); }
    objects = objects.filter(o => o && o.label).slice(0, 10).map(o => ({
      label: String(o.label || '').toLowerCase(),
      labelUz: String(o.labelUz || o.label || ''),
      x: clamp(parseFloat(o.x) || 0, 0, 1),
      y: clamp(parseFloat(o.y) || 0, 0, 1),
      w: clamp(parseFloat(o.w) || 0.05, 0.01, 1),
      h: clamp(parseFloat(o.h) || 0.05, 0.01, 1),
      shape: ['rectangle','circle','triangle'].includes(o.shape) ? o.shape : 'rectangle',
      confidence: clamp(parseFloat(o.confidence) || 0.5, 0, 1),
      category: String(o.category || 'unknown').toLowerCase()
    }));

    res.json({ success: true, objects, meta: { latencyMs: Date.now() - t0, model: GEMINI_MODEL, objectCount: objects.length }});
  } catch (err) {
    console.error('[ERROR]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n  AI VISION DETECTOR v3.1 | Port: ${PORT} | Key: ${GEMINI_KEY ? 'YES' : 'NO'}\n`);
});