// Ortak arayüz parçaları: bildirim, alt pencere, büyük mühür, halka
import { el, svg } from './util.js';
import { sfx } from './audio.js';
import { haptic } from './fx.js';

const overlay = () => document.getElementById('overlay');

let toastT = null;
export function toast(msg, ms = 2600) {
  document.querySelectorAll('.toast').forEach(x => x.remove());
  const n = el('div.toast', { role: 'status' }, msg);
  document.body.append(n);
  clearTimeout(toastT);
  toastT = setTimeout(() => n.remove(), ms);
}

// Alt pencere. build(close) içerik düğümünü döndürür.
export function modal(build, { onClose } = {}) {
  const bg = el('div.modal-bg');
  const close = () => { bg.remove(); onClose && onClose(); };
  const box = el('div.modal', { role: 'dialog', 'aria-modal': 'true' });
  box.append(build(close));
  bg.append(box);
  bg.addEventListener('click', e => { if (e.target === bg) close(); });
  overlay().append(bg);
  return close;
}

export function confirmBox(text, okLabel, cancelLabel) {
  return new Promise(res => {
    modal(close => el('div', { style: { display: 'flex', flexDirection: 'column', gap: '14px' } },
      el('p', { style: { margin: 0, fontSize: '17px' } }, text),
      el('div.grid2',
        el('button.btn', { on: { click: () => { res(false); close(); } } }, cancelLabel),
        el('button.btn.btn-accent', { on: { click: () => { res(true); close(); } } }, okLabel)),
    ), { onClose: () => res(false) });
  });
}

export function bigStamp(text, ms = 1100) {
  const n = el('div.bigstamp', { 'aria-hidden': 'true' }, text);
  document.body.append(n);
  sfx('big');
  haptic('big');
  setTimeout(() => n.remove(), ms);
}

export function ring(value, max, { size = 124, stroke = 10, label = '', color = 'var(--ok3)' } = {}) {
  const r = (size - stroke) / 2 - 2;
  const C = 2 * Math.PI * r;
  const f = Math.max(0, Math.min(1, max ? value / max : 0));
  return svg(`<svg class="ring" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" role="img" aria-label="${label}">
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="var(--line)" stroke-width="${stroke}"/>
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${f >= 1 ? 'var(--ok3)' : color}" stroke-width="${stroke}" stroke-linecap="round"
      stroke-dasharray="${C.toFixed(1)}" stroke-dashoffset="${(C * (1 - f)).toFixed(1)}" transform="rotate(-90 ${size / 2} ${size / 2})"/>
    <text x="${size / 2}" y="${size / 2 + 2}" text-anchor="middle" fill="var(--ink)" font-size="${size > 100 ? 24 : 16}">${value}/${max}</text>
    <text x="${size / 2}" y="${size / 2 + 22}" text-anchor="middle" fill="var(--muted)" font-size="11">kart</text>
  </svg>`);
}

export function switchEl(on, onChange, label) {
  const b = el('button.switch', { role: 'switch', 'aria-checked': String(!!on), 'aria-label': label });
  b.addEventListener('click', () => {
    const v = b.getAttribute('aria-checked') !== 'true';
    b.setAttribute('aria-checked', String(v));
    onChange(v);
  });
  return b;
}

export function stepper(value, { min, max, step }, onChange) {
  let v = value;
  const span = el('span', String(v));
  const upd = d => { v = Math.max(min, Math.min(max, v + d)); span.textContent = v; onChange(v); };
  return el('div.stepper', el('button', { 'aria-label': 'azalt', on: { click: () => upd(-step) } }, '−'), span,
    el('button', { 'aria-label': 'artır', on: { click: () => upd(step) } }, '+'));
}

export function seg(options, value, onChange) {
  const wrap = el('div.seg', { role: 'group' });
  for (const [val, label] of options) {
    const b = el('button', { 'aria-pressed': String(val === value) }, label);
    b.addEventListener('click', () => {
      wrap.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', 'false'));
      b.setAttribute('aria-pressed', 'true');
      onChange(val);
    });
    wrap.append(b);
  }
  return wrap;
}
