// ═══════════════════════════════════
// renderer.js — Canvas va UI chizish
// ═══════════════════════════════════

let ctx = null;
let cvs = null;

export function setup(canvas) {
  cvs = canvas;
  ctx = canvas.getContext('2d');
}

export function clear() {
  if (ctx) ctx.clearRect(0, 0, cvs.width, cvs.height);
}

export function drawBoxes(objects) {
  if (!ctx) return;
  const W = cvs.width, H = cvs.height;
  clear();

  objects.forEach(obj => {
    const x = (obj.x || 0) * W;
    const y = (obj.y || 0) * H;
    const w = (obj.w || 0) * W;
    const h = (obj.h || 0) * H;
    const conf = Math.round((obj.confidence || 0) * 100);
    const lbl = (obj.labelUz || obj.label || '?') + '  ' + conf + '%';
    const shape = obj.shape || 'rectangle';

    ctx.save();
    ctx.shadowColor = '#00ff88';
    ctx.shadowBlur = 14;
    ctx.strokeStyle = '#00ff88';
    ctx.lineWidth = 2;
    ctx.fillStyle = 'rgba(0,255,136,0.045)';

    if (shape === 'circle') {
      const rx = w / 2, ry = h / 2;
      ctx.beginPath();
      ctx.ellipse(x + rx, y + ry, Math.abs(rx), Math.abs(ry), 0, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
    } else if (shape === 'triangle') {
      ctx.beginPath();
      ctx.moveTo(x + w / 2, y);
      ctx.lineTo(x + w, y + h);
      ctx.lineTo(x, y + h);
      ctx.closePath();
      ctx.fill(); ctx.stroke();
    } else {
      ctx.fillRect(x, y, w, h);
      ctx.strokeRect(x, y, w, h);
      const tl = Math.min(14, w * 0.2, h * 0.2);
      ctx.lineWidth = 3; ctx.shadowBlur = 18;
      ctx.beginPath(); ctx.moveTo(x, y + tl); ctx.lineTo(x, y); ctx.lineTo(x + tl, y); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x + w - tl, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w, y + tl); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x, y + h - tl); ctx.lineTo(x, y + h); ctx.lineTo(x + tl, y + h); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x + w - tl, y + h); ctx.lineTo(x + w, y + h); ctx.lineTo(x + w, y + h - tl); ctx.stroke();
    }

    // Yorliq
    ctx.shadowBlur = 0;
    const fs = Math.max(11, Math.min(15, W * 0.014));
    ctx.font = 'bold ' + fs + 'px Inter,sans-serif';
    const tw = ctx.measureText(lbl).width;
    const px = 8, py = 4;
    const tH = fs + py * 2, tW = tw + px * 2;
    const tY = Math.max(0, y - tH - 5);

    ctx.fillStyle = 'rgba(0,255,136,0.88)';
    rr(ctx, x, tY, tW, tH, 4);
    ctx.fill();
    ctx.fillStyle = '#000';
    ctx.fillText(lbl, x + px, tY + py + fs - 2);
    ctx.restore();
  });
}

function rr(c, x, y, w, h, r) {
  c.beginPath();
  c.moveTo(x + r, y); c.lineTo(x + w - r, y);
  c.arcTo(x + w, y, x + w, y + r, r);
  c.lineTo(x + w, y + h - r);
  c.arcTo(x + w, y + h, x + w - r, y + h, r);
  c.lineTo(x + r, y + h);
  c.arcTo(x, y + h, x, y + h - r, r);
  c.lineTo(x, y + r);
  c.arcTo(x, y, x + r, y, r);
  c.closePath();
}

const SHAPES = { rectangle: '#ic-rect', circle: '#ic-circ', triangle: '#ic-tri' };

export function renderList(objects, listEl, badgeEl) {
  badgeEl.textContent = objects.length;
  if (!objects.length) {
    listEl.innerHTML = '<div class="empty"><svg class="empty__ic"><use href="#ic-eye"/></svg><p>Hali obyektlar aniqlanmadi</p></div>';
    return;
  }
  listEl.innerHTML = objects.map((o, i) => {
    const conf = Math.round((o.confidence || 0) * 100);
    const sref = SHAPES[o.shape] || SHAPES.rectangle;
    return '<div class="oi" style="animation-delay:' + (i * 40) + 'ms">' +
      '<div class="oi__bar"></div>' +
      '<div class="oi__info">' +
        '<div class="oi__name">' + esc(o.labelUz || o.label || '—') + '</div>' +
        '<div class="oi__meta">' +
          '<span><svg class="icon"><use href="' + sref + '"/></svg>' + esc(o.shape || 'rectangle') + '</span>' +
          '<span><svg class="icon"><use href="#ic-folder"/></svg>' + esc(o.category || '—') + '</span>' +
        '</div>' +
      '</div>' +
      '<div class="oi__conf">' + conf + '%</div>' +
    '</div>';
  }).join('');
}

export function setStats(s) {
  el('sF').textContent = s.frames;
  el('sO').textContent = s.objects;
  el('sL').textContent = s.latency != null ? s.latency : '—';
  el('sA').textContent = s.apm;
}

export function log(msg, type, logEl) {
  const now = new Date();
  const ts = [now.getHours(), now.getMinutes(), now.getSeconds()]
    .map(n => String(n).padStart(2, '0')).join(':');
  const row = document.createElement('div');
  row.className = 'lr';
  row.innerHTML = '<span class="lt">' + ts + '</span><span class="lm lm--' + type + '">' + esc(msg) + '</span>';
  logEl.appendChild(row);
  logEl.scrollTop = logEl.scrollHeight;
  while (logEl.children.length > 120) logEl.removeChild(logEl.firstChild);
}

export function flash(container) {
  const f = document.createElement('div');
  f.className = 'det-flash';
  container.appendChild(f);
  f.addEventListener('animationend', () => f.remove());
}

function el(id) { return document.getElementById(id); }
function esc(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }