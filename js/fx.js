// Dokunma efektleri: basılma, dalga, yaylanma, titreşim, tık sesi.
// Belgeye bağlı tek dinleyici; ekranlar ayrıca bir şey yapmaz.
// data-fx="own" taşıyan düğme (cevap gönder gibi) kendi titreşimini ve sesini verir.
import { S } from './store.js';
import { sfx, sfxAt } from './audio.js';

const TAP = 'button, [role="button"]';
const NO_RIPPLE = '#tabs button, .linkbtn, .plink, .elink, .switch';
const POP = '.btn, .chip, .pbtn, .tb, .iconbtn, .stepper button, .yds-opt, #tabs button';
const SELECT = '.chip, .seg button, .switch, .stepper button, #tabs button, .tb, [aria-pressed]';

const IOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const animOn = () => document.body.classList.contains('anim');
let pressed = null;

// ---------------------------------------------------------------- titreşim
// iOS 18 ve sonrası: gizli bir "switch" kutusunun etiketine tıklamak sistem titreşimini tetikler.
function pulse() {
  const l = document.createElement('label');
  l.setAttribute('aria-hidden', 'true');
  l.style.display = 'none';
  const i = document.createElement('input');
  i.type = 'checkbox';
  i.setAttribute('switch', '');
  i.tabIndex = -1;
  l.append(i);
  l.addEventListener('click', e => e.stopPropagation());
  document.head.append(l);
  l.click();
  l.remove();
}
const PAT = { tick: [0], ok: [0, 85], bad: [0, 85, 170], big: [0, 85, 290] };
const VIB = { tick: 8, ok: [10, 65, 10], bad: [14, 55, 14, 55, 14], big: [10, 65, 10, 190, 22] };

export function haptic(kind = 'tick') {
  if (S.settings.haptic === false) return;
  try {
    if (!IOS) { if (navigator.vibrate) navigator.vibrate(VIB[kind] || VIB.tick); return; }
    for (const d of PAT[kind] || PAT.tick) d ? setTimeout(pulse, d) : pulse();
  } catch (e) {}
}

// ---------------------------------------------------------------- görsel
function ripple(n, x, y) {
  const r = n.getBoundingClientRect();
  if (!r.width || !r.height || r.bottom < 0 || r.top > innerHeight) return;
  const box = document.createElement('div');
  box.className = 'fx-rip';
  box.setAttribute('aria-hidden', 'true');
  box.style.cssText = `left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px;border-radius:${getComputedStyle(n).borderRadius}`;
  const px = Math.min(Math.max(x - r.left, 0), r.width), py = Math.min(Math.max(y - r.top, 0), r.height);
  const d = 2 * Math.hypot(Math.max(px, r.width - px), Math.max(py, r.height - py));
  const dot = document.createElement('i');
  dot.style.cssText = `left:${px - d / 2}px;top:${py - d / 2}px;width:${d}px;height:${d}px`;
  box.append(dot);
  document.body.append(box);
  setTimeout(() => box.remove(), 700);
}

export function pop(n, cls = 'fxpop') {
  if (!n || !animOn()) return;
  n.classList.remove(cls);
  void n.offsetWidth;
  n.classList.add(cls);
  setTimeout(() => n.classList.remove(cls), 450);
}

// Dokunulan düğme yeniden çizildiyse aynı yerdeki yeni düğmeyi bul (aynı sıra, aynı yazı)
function signature(t) {
  const root = t.closest('#tabs, #overlay, #screen') || document.body;
  return { root, i: [...root.querySelectorAll(TAP)].indexOf(t), txt: t.textContent };
}
function find(sig) {
  if (!sig.root.isConnected || sig.i < 0) return null;
  const n = sig.root.querySelectorAll(TAP)[sig.i];
  return n && n.textContent === sig.txt ? n : null;
}
// Yeniden çizim bir kayıt işleminden sonra gelebilir: birkaç kare boyunca izle
function watch(t, sig) {
  let k = 0;
  const step = () => {
    if (!t.isConnected) { const n = find(sig); if (n && n.matches(POP)) pop(n); return; }
    if (++k < 24) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

// ---------------------------------------------------------------- dinleyiciler
function target(e) {
  const t = e.target && e.target.closest ? e.target.closest(TAP) : null;
  return t && !t.disabled && !t.closest('[aria-hidden="true"]') ? t : null;
}
function release() { if (pressed) { pressed.classList.remove('prs'); pressed = null; } }

function onDown(e) {
  if (e.button > 0) return;
  const t = target(e);
  release();
  if (!t) return;
  pressed = t;
  t.classList.add('prs');
}

function onClick(e) {
  const t = target(e);
  if (!t) return;
  const own = !!t.closest('[data-fx="own"]');
  // titreşim dokunuşun içinde (iOS kullanıcı hareketi ister)
  if (!own) haptic('tick');
  const r = t.getBoundingClientRect();
  const x = e.detail ? e.clientX : r.left + r.width / 2, y = e.detail ? e.clientY : r.top + r.height / 2;
  const sig = signature(t);
  const t0 = performance.now();
  const sel = t.matches(SELECT);
  setTimeout(() => {
    // düğmenin işi kendi sesini çaldıysa (mühür, kâğıt, okuma) tık sesi eklenmez
    if (!own && S.settings.sfxTap !== false && sfxAt() < t0) sfx(sel ? 'sel' : 'tap');
    if (!animOn()) return;
    const live = t.isConnected ? t : find(sig);
    if (!live) return;
    if (!live.matches(NO_RIPPLE)) ripple(live, x, y);
    if (live !== t) { if (live.matches(POP)) pop(live); }
    else watch(t, sig);
  }, 0);
}

export function initFx() {
  document.addEventListener('pointerdown', onDown, { capture: true, passive: true });
  for (const ev of ['pointerup', 'pointercancel', 'dragstart']) document.addEventListener(ev, release, { capture: true, passive: true });
  window.addEventListener('blur', release);
  document.addEventListener('click', onClick, true);
}
