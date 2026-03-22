// ═══════════════════════════════════
// camera.js — Kamera boshqaruvi
// ═══════════════════════════════════

let stream = null;
let vidEl = null;
let cvsEl = null;

export function setup(vid, cvs) {
  vidEl = vid;
  cvsEl = cvs;
}

export async function open() {
  if (stream) return;
  stream = await navigator.mediaDevices.getUserMedia({
    video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'environment' },
    audio: false
  });
  vidEl.srcObject = stream;
  return new Promise(resolve => {
    vidEl.addEventListener('loadedmetadata', function h() {
      vidEl.removeEventListener('loadedmetadata', h);
      cvsEl.width = vidEl.videoWidth;
      cvsEl.height = vidEl.videoHeight;
      resolve({ w: vidEl.videoWidth, h: vidEl.videoHeight });
    });
  });
}

export function close() {
  if (stream) {
    stream.getTracks().forEach(t => t.stop());
    stream = null;
  }
  if (vidEl) vidEl.srcObject = null;
}

export function snap(quality = 0.72, maxDim = 1024) {
  if (!vidEl || !vidEl.videoWidth) return null;
  let w = vidEl.videoWidth, h = vidEl.videoHeight;
  if (Math.max(w, h) > maxDim) {
    const r = maxDim / Math.max(w, h);
    w = Math.round(w * r);
    h = Math.round(h * r);
  }
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  c.getContext('2d').drawImage(vidEl, 0, 0, w, h);
  return c.toDataURL('image/jpeg', quality).split(',')[1];
}

export function isOn() { return !!stream; }