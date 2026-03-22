// ═══════════════════════════════════
// effects.js — Zarrachalar va 3D tilt
// ═══════════════════════════════════

export function createParticles(id, n = 20) {
  const box = document.getElementById(id);
  if (!box) return;
  for (let i = 0; i < n; i++) {
    const p = document.createElement('div');
    p.className = 'particle';
    p.style.left = Math.random() * 100 + '%';
    p.style.animationDuration = (10 + Math.random() * 18) + 's';
    p.style.animationDelay = (Math.random() * 12) + 's';
    const s = 1 + Math.random() * 2;
    p.style.width = s + 'px';
    p.style.height = s + 'px';
    box.appendChild(p);
  }
}

export function enableTilt(sel = '.tilt', pow = 5) {
  if ('ontouchstart' in window) return;
  document.querySelectorAll(sel).forEach(el => {
    el.addEventListener('mousemove', e => {
      const r = el.getBoundingClientRect();
      const nx = (e.clientX - r.left) / r.width - 0.5;
      const ny = (e.clientY - r.top) / r.height - 0.5;
      el.style.transform = `perspective(1000px) rotateX(${-ny * pow}deg) rotateY(${nx * pow}deg) scale3d(1.01,1.01,1.01)`;
    });
    el.addEventListener('mouseleave', () => {
      el.style.transform = 'perspective(1000px) rotateX(0) rotateY(0) scale3d(1,1,1)';
    });
  });
}