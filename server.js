const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';

// ══════════════════════════════════════════════════════════
// GEMINI API KALITI
// BEPUL oling: https://aistudio.google.com/apikey
// Limitlar: 15 RPM, 1500 RPD (kuniga)
// Local:  .env faylga yozing
// Render: Dashboard → Environment Variables
// ══════════════════════════════════════════════════════════
const GEMINI_KEY = process.env.GEMINI_API_KEY || '';

const GEMINI_MODEL = 'gemini-2.0-flash';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

const VISION_PROMPT = `You are an advanced real-time computer vision AI system. Analyze this camera frame carefully and detect ALL clearly visible objects.

ABSOLUTE RULES — FOLLOW EXACTLY:
1. Return ONLY a raw JSON array — NO markdown, NO code fences, NO backticks, NO explanation text before or after
2. The response must start with [ and end with ]
3. Maximum 10 objects per frame
4. Only detect objects you can clearly identify
5. Bounding boxes must tightly fit each object
6. If nothing identifiable is visible, return exactly: []

Each object in the array must have EXACTLY these fields:
{
  "label": "english name lowercase",
  "labelUz": "uzbek translation",
  "x": 0.0 to 1.0 (left edge normalized to image width),
  "y": 0.0 to 1.0 (top edge normalized to image height),
  "w": 0.0 to 1.0 (box width normalized),
  "h": 0.0 to 1.0 (box height normalized),
  "shape": "rectangle" or "circle" or "triangle",
  "confidence": 0.0 to 1.0,
  "category": "single_word_category"
}

Shape rules:
- "circle" for round objects (balls, wheels, clocks, cups from top)
- "triangle" for triangular shapes (warning signs, pizza slices, arrows)
- "rectangle" for everything else (this is the default)

Category examples: electronics, furniture, person, food, clothing, vehicle, animal, plant, tool, book, container, decoration

Uzbek translation examples:
- laptop = noutbuk, phone = telefon, person = odam, chair = stul
- cup = piyola, book = kitob, monitor = monitor, keyboard = klaviatura
- mouse = sichqoncha, bottle = shisha, pen = ruchka, bag = sumka

REMEMBER: Output ONLY the JSON array. Nothing else.`;

// ══════════════════════════════════════════════════════════
// MIDDLEWARE
// ══════════════════════════════════════════════════════════
app.use(express.json({ limit: '20mb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

// ══════════════════════════════════════════════════════════
// API: Salomatlik tekshiruvi
// ══════════════════════════════════════════════════════════
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    serverKeyConfigured: !!GEMINI_KEY,
    model: GEMINI_MODEL,
    provider: 'Google Gemini (BEPUL)',
    limits: {
      rpm: 15,
      rpd: 1500,
      cost: 'BEPUL'
    },
    environment: NODE_ENV,
    uptime: Math.floor(process.uptime()),
    timestamp: Date.now()
  });
});

// ══════════════════════════════════════════════════════════
// API: Kadrni tahlil qilish (Gemini Vision)
// ══════════════════════════════════════════════════════════
app.post('/api/analyze', async (req, res) => {
  const startTime = Date.now();

  try {
    // Birinchi server kaliti, keyin client kaliti
    const clientKey = req.headers['x-client-key'] || '';
    const apiKey = GEMINI_KEY || clientKey;

    if (!apiKey) {
      return res.status(401).json({
        success: false,
        error: 'Gemini API kaliti topilmadi. https://aistudio.google.com/apikey dan BEPUL oling!'
      });
    }

    const { image } = req.body;

    if (!image || typeof image !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Base64 formatidagi tasvir yuborilmadi'
      });
    }

    // Tasvir hajmini tekshirish
    const imageSizeKB = Math.round((image.length * 3) / 4 / 1024);
    if (imageSizeKB > 15360) {
      return res.status(413).json({
        success: false,
        error: `Tasvir juda katta: ~${imageSizeKB}KB (max 15MB)`
      });
    }

    // Gemini API ga so'rov
    const requestUrl = `${GEMINI_URL}?key=${apiKey}`;

    const response = await fetch(requestUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents: [{
          parts: [
            {
              inlineData: {
                mimeType: 'image/jpeg',
                data: image
              }
            },
            {
              text: VISION_PROMPT
            }
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

    if (!response.ok) {
      const errBody = await response.json().catch(() => ({}));
      let errMsg = `Gemini API xatosi: ${response.status}`;

      if (response.status === 429) {
        errMsg = 'Rate limit — 1 daqiqa kuting (15 RPM limit)';
      } else if (response.status === 400) {
        errMsg = errBody?.error?.message || 'Noto\'g\'ri so\'rov';
      } else if (response.status === 403) {
        errMsg = 'API kaliti noto\'g\'ri yoki faol emas';
      } else {
        errMsg = errBody?.error?.message || errMsg;
      }

      if (NODE_ENV === 'development') {
        console.error('[GEMINI ERROR]', response.status, errMsg);
      }

      return res.status(response.status).json({
        success: false,
        error: errMsg
      });
    }

    const data = await response.json();
    const latency = Date.now() - startTime;

    // Gemini javobidan matnni olish
    const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || '[]';

    // JSON ni tozalash
    let cleanedText = rawText
      .replace(/```json\s*/gi, '')
      .replace(/```\s*/gi, '')
      .trim();

    // Agar JSON array boshlanmasa, topishga harakat qilamiz
    let objects = [];
    try {
      objects = JSON.parse(cleanedText);
    } catch {
      // JSON array ni qidirish
      const match = cleanedText.match(/\[[\s\S]*?\]/);
      if (match) {
        try {
          objects = JSON.parse(match[0]);
        } catch {
          objects = [];
        }
      }
    }

    if (!Array.isArray(objects)) objects = [];

    // Obyektlarni tekshirish va tozalash
    objects = objects
      .filter(o => o && typeof o === 'object' && o.label)
      .slice(0, 10)
      .map(o => ({
        label: String(o.label || '').toLowerCase(),
        labelUz: String(o.labelUz || o.label || ''),
        x: clamp(parseFloat(o.x) || 0, 0, 1),
        y: clamp(parseFloat(o.y) || 0, 0, 1),
        w: clamp(parseFloat(o.w) || 0.05, 0.01, 1),
        h: clamp(parseFloat(o.h) || 0.05, 0.01, 1),
        shape: ['rectangle', 'circle', 'triangle'].includes(o.shape) ? o.shape : 'rectangle',
        confidence: clamp(parseFloat(o.confidence) || 0.5, 0, 1),
        category: String(o.category || 'unknown').toLowerCase()
      }));

    res.json({
      success: true,
      objects: objects,
      meta: {
        latencyMs: latency,
        model: GEMINI_MODEL,
        imageSizeKB: imageSizeKB,
        objectCount: objects.length
      }
    });

  } catch (err) {
    console.error('[ANALYZE ERROR]', err.message);
    res.status(500).json({
      success: false,
      error: 'Server ichki xatosi: ' + err.message
    });
  }
});

function clamp(val, min, max) {
  return Math.min(Math.max(val, min), max);
}

// ══════════════════════════════════════════════════════════
// SPA fallback
// ══════════════════════════════════════════════════════════
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ══════════════════════════════════════════════════════════
// SERVER START
// ══════════════════════════════════════════════════════════
app.listen(PORT, '0.0.0.0', () => {
  console.log('');
  console.log('  ┌──────────────────────────────────────────────┐');
  console.log('  │       AI VISION LIVE DETECTOR  v3.0           │');
  console.log('  │       Google Gemini Vision (BEPUL)            │');
  console.log('  └──────────────────────────────────────────────┘');
  console.log('');
  console.log(`  Muhit:      ${NODE_ENV}`);
  console.log(`  Port:       ${PORT}`);
  console.log(`  Model:      ${GEMINI_MODEL}`);
  console.log(`  API kalit:  ${GEMINI_KEY ? '✅ Sozlangan' : '⚠️  Sozlanmagan'}`);
  console.log(`  Limitlar:   15 RPM | 1500 RPD | BEPUL`);
  console.log(`  URL:        http://localhost:${PORT}`);
  console.log('');
  if (!GEMINI_KEY) {
    console.log('  ╔══════════════════════════════════════════════╗');
    console.log('  ║  BEPUL API kalit oling:                      ║');
    console.log('  ║  https://aistudio.google.com/apikey           ║');
    console.log('  ║                                               ║');
    console.log('  ║  Keyin .env faylga qo\'shing:                 ║');
    console.log('  ║  GEMINI_API_KEY=sizning-kalit                 ║');
    console.log('  ╚══════════════════════════════════════════════╝');
    console.log('');
  }
});