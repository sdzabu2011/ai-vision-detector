// ═══════════════════════════════════════
// app.js — Asosiy dastur boshqaruvchisi
// Google Gemini Vision (BEPUL)
// ═══════════════════════════════════════

import * as cam from './camera.js';
import * as ai from './detector.js';
import * as ui from './renderer.js';
import { createParticles, enableTilt } from './effects.js';

// ── DOM ──
const vidEl    = document.getElementById('vid');
const cvsEl    = document.getElementById('cvs');
const ph       = document.getElementById('ph');
const scanbar  = document.getElementById('scanbar');
const vidbox   = document.getElementById('vidbox');
const keyIn    = document.getElementById('apiKeyInput');
const keyTag   = document.getElementById('keyTag');
const btnOn    = document.getElementById('btnOn');
const btnOff   = document.getElementById('btnOff');
const btnLive  = document.getElementById('btnLive');
const indCam   = document.getElementById('indCam');
const indLive  = document.getElementById('indLive');
const objList  = document.getElementById('objList');
const objBadge = document.getElementById('objBadge');
const logBox   = document.getElementById('logBox');

// ── Holat ──
let live = false, timer = null, interval = 2500, busy = false, hasKey = false;
let frames = 0, lastN = 0, lastMs = null, tLog = [];

// ══════════════════════════════════
// INIT
// ══════════════════════════════════
async function init() {
  cam.setup(vidEl, cvsEl);
  ui.setup(cvsEl);
  createParticles('particleBox', 20);
  enableTilt('.tilt', 5);

  wlog('Tizim ishga tushirildi', 'info');
  wlog('Google Gemini Vision — BEPUL', 'ok');

  try {
    const h = await ai.health();
    hasKey = !!h.serverKeyConfigured;

    if (hasKey) {
      wlog('Server API kaliti topildi — tayyor', 'ok');
      keyIn.placeholder = 'Server kaliti mavjud (ixtiyoriy)';
      keyTag.innerHTML = '<svg class="icon icon--xs" style="color:var(--ca)"><use href="#ic-shield"/></svg> Tayyor';
      keyTag.classList.add('keybox__tag--ok');
    } else {
      wlog('API kalitni kiriting yoki serverni sozlang', 'warn');
      wlog('BEPUL kalit: aistudio.google.com/apikey', 'warn');
    }

    if (h.limits) {
      wlog('Limitlar: ' + h.limits.rpm + ' RPM | ' + h.limits.rpd + ' RPD | ' + h.limits.cost, 'info');
    }
  } catch (err) {
    wlog('Server bilan bog\'lanib bo\'lmadi: ' + err.message, 'err');
  }

  bind();
}

// ══════════════════════════════════
// EVENTS
// ══════════════════════════════════
function bind() {
  btnOn.addEventListener('click', camOn);
  btnOff.addEventListener('click', camOff);
  btnLive.addEventListener('click', toggleLive);

  document.getElementById('ipickBtns').addEventListener('click', e => {
    const b = e.target.closest('.ipk');
    if (!b) return;
    document.querySelectorAll('.ipk').forEach(x => x.classList.remove('active'));
    b.classList.add('active');
    interval = parseInt(b.dataset.ms, 10);
    if (live) {
      clearInterval(timer);
      timer = setInterval(analyze, interval);
      wlog('Interval: ' + interval + 'ms', 'info');
    }
  });

  window.addEventListener('resize', () => {
    if (cam.isOn() && vidEl.videoWidth) {
      cvsEl.width = vidEl.videoWidth;
      cvsEl.height = vidEl.videoHeight;
    }
  });
}

// ══════════════════════════════════
// KAMERA
// ══════════════════════════════════
async function camOn() {
  try {
    wlog('Kamera ulanmoqda...', 'info');
    const d = await cam.open();
    ph.classList.add('ph--off');
    indCam.classList.add('ind--on');
    indCam.querySelector('.ind__txt').textContent = 'Yoniq';
    btnOn.disabled = true;
    btnOff.disabled = false;
    btnLive.disabled = false;
    wlog('Kamera ulandi: ' + d.w + '×' + d.h, 'ok');
  } catch (err) {
    wlog('Kamera xatosi: ' + err.message, 'err');
  }
}

function camOff() {
  try {
    if (live) toggleLive();
    cam.close();
    ui.clear();
    ph.classList.remove('ph--off');
    scanbar.classList.remove('scanbar--on');
    indCam.classList.remove('ind--on');
    indCam.querySelector('.ind__txt').textContent = 'Kamera';
    btnOn.disabled = false;
    btnOff.disabled = true;
    btnLive.disabled = true;
    ui.renderList([], objList, objBadge);
    wlog('Kamera o\'chirildi', 'info');
  } catch (err) {
    wlog('Xatolik: ' + err.message, 'err');
  }
}

// ══════════════════════════════════
// JONLI ANIQLASH
// ══════════════════════════════════
function toggleLive() {
  if (!live) {
    const k = keyIn.value.trim();
    if (!hasKey && !k) {
      wlog('API kaliti kiritilmagan! aistudio.google.com/apikey dan BEPUL oling', 'err');
      keyIn.focus();
      keyIn.parentElement.style.borderColor = 'var(--cd)';
      setTimeout(() => { keyIn.parentElement.style.borderColor = ''; }, 2000);
      return;
    }
    live = true;
    btnLive.classList.add('active');
    btnLive.querySelector('.btn__lbl').textContent = 'To\'xtatish';
    indLive.classList.add('ind--live');
    indLive.querySelector('.ind__txt').textContent = 'Jonli';
    scanbar.classList.add('scanbar--on');
    wlog('Jonli aniqlash boshlandi (' + interval + 'ms)', 'ok');
    analyze();
    timer = setInterval(analyze, interval);
  } else {
    live = false;
    if (timer) { clearInterval(timer); timer = null; }
    btnLive.classList.remove('active');
    btnLive.querySelector('.btn__lbl').textContent = 'Jonli aniqlash';
    indLive.classList.remove('ind--live');
    indLive.querySelector('.ind__txt').textContent = 'Kutish';
    scanbar.classList.remove('scanbar--on');
    wlog('Jonli aniqlash to\'xtatildi', 'info');
  }
}

async function analyze() {
  if (!live || busy || !cam.isOn()) return;
  busy = true;

  try {
    const b64 = cam.snap(0.72, 1024);
    if (!b64) { busy = false; return; }

    wlog('Kadr tahlil qilinmoqda...', 'info');
    const t0 = performance.now();
    const k = keyIn.value.trim();
    const result = await ai.detect(b64, k);
    const objects = result.objects;
    const ms = Math.round(performance.now() - t0);

    frames++;
    lastN = objects.length;
    lastMs = ms;

    const now = Date.now();
    tLog.push(now);
    tLog = tLog.filter(t => now - t < 60000);

    ui.flash(vidbox);
    ui.drawBoxes(objects);
    ui.renderList(objects, objList, objBadge);
    ui.setStats({ frames, objects: lastN, latency: lastMs, apm: tLog.length });

    wlog(objects.length + ' ta obyekt aniqlandi (' + ms + 'ms)', 'ok');
  } catch (err) {
    wlog('Xatolik: ' + err.message, 'err');

    // Rate limit bo'lsa, foydalanuvchiga maslahat
    if (err.message.includes('Rate limit') || err.message.includes('429')) {
      wlog('Intervalini kattaroq qiling (4s yoki 6s)', 'warn');
    }
  }

  busy = false;
}

function wlog(msg, type) {
  ui.log(msg, type, logBox);
}

// ══════════════════════════════════
// START
// ══════════════════════════════════
init();