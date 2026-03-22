// ═══════════════════════════════════
// detector.js — Server orqali Gemini
// ═══════════════════════════════════

export async function detect(base64, clientKey = '') {
  const headers = { 'Content-Type': 'application/json' };
  if (clientKey) headers['X-Client-Key'] = clientKey;

  const res = await fetch('/api/analyze', {
    method: 'POST',
    headers,
    body: JSON.stringify({ image: base64 })
  });

  const json = await res.json();

  if (!res.ok || !json.success) {
    throw new Error(json.error || 'Xatolik: ' + res.status);
  }

  return {
    objects: json.objects || [],
    meta: json.meta || {}
  };
}

export async function health() {
  try {
    const r = await fetch('/api/health');
    return await r.json();
  } catch {
    return { status: 'error', serverKeyConfigured: false };
  }
}