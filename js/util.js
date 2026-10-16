// Küçük yardımcılar: DOM, gün hesabı, biçimlendirme

export function el(tag, props, ...kids) {
  const m = /^([a-z0-9]+)?((?:[.#][\w-]+)*)$/i.exec(tag) || [];
  const node = document.createElement(m[1] || 'div');
  (m[2] || '').replace(/([.#])([\w-]+)/g, (_, s, v) => {
    if (s === '.') node.classList.add(v); else node.id = v;
  });
  if (props && (typeof props !== 'object' || props instanceof Node || Array.isArray(props))) {
    kids.unshift(props);
    props = null;
  }
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'on') for (const [ev, fn] of Object.entries(v)) node.addEventListener(ev, fn);
    else if (k === 'html') node.innerHTML = v;
    else if (k === 'text') node.textContent = v;
    else if (k === 'class') node.className += ' ' + v;
    else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
    else if (k in node && typeof v !== 'string') node[k] = v;
    else node.setAttribute(k, v === true ? '' : v);
  }
  add(node, kids);
  return node;
}

function add(node, kids) {
  for (const k of kids) {
    if (k == null || k === false) continue;
    if (Array.isArray(k)) add(node, k);
    else node.append(k instanceof Node ? k : document.createTextNode(String(k)));
  }
}

export function svg(markup, cls = '') {
  const t = document.createElement('template');
  t.innerHTML = markup.trim();
  const s = t.content.firstChild;
  if (cls) s.setAttribute('class', cls);
  return s;
}

export const ICON = {
  masa: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M3 10h18M5 10v9M19 10v9M7 10V6h10v4"/></svg>',
  calis: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><rect x="4" y="6" width="13" height="14" rx="1.5"/><path d="M8 3h11.5A1.5 1.5 0 0 1 21 4.5V17"/></svg>',
  okuma: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M12 6c-2-1.5-5-2-8-2v14c3 0 6 .5 8 2 2-1.5 5-2 8-2V4c-3 0-6 .5-8 2zM12 6v14"/></svg>',
  sozluk: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6"/><path d="M15 15l5 5"/></svg>',
  arsiv: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><rect x="3" y="4" width="18" height="5" rx="1"/><path d="M5 9v10h14V9M10 13h4"/></svg>',
  x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg>',
  play: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9H4z"/><path d="M16 9a4 4 0 0 1 0 6"/></svg>',
  flag: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M5 21V4M5 4h11l-2 4 2 4H5"/></svg>',
};

// ---------------------------------------------------------------- gün hesabı
// Gün sabah 04:00'te başlar; gece yarısından sonraki çalışma önceki güne sayılır.
export const DAY_START_H = 4;
export function dayNum(ts = Date.now()) {
  const d = new Date(ts - DAY_START_H * 3600e3);
  return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400e3);
}
export function dayDate(n) { return new Date(n * 86400e3); } // getUTC* ile okunur
export function weekday(n) { return (dayDate(n).getUTCDay() + 6) % 7; } // 0 = Pazartesi
export function weekStart(n) { return n - weekday(n); }

const AY = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
const AY3 = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
const GUN = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar'];
export function fmtDay(n, opt = {}) {
  const d = dayDate(n);
  const s = `${d.getUTCDate()} ${AY[d.getUTCMonth()]}`;
  return opt.weekday ? `${s}, ${GUN[weekday(n)]}` : (opt.year ? `${s} ${d.getUTCFullYear()}` : s);
}
export function monthShort(n) { return AY3[dayDate(n).getUTCMonth()]; }
export function dayOfMonth(n) { return dayDate(n).getUTCDate(); }

export function fmtNum(n) { return Math.round(n).toLocaleString('tr-TR'); }
export function pct(a, b) { return b ? Math.round(100 * a / b) : 0; }
export const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
export const sleep = ms => new Promise(r => setTimeout(r, ms));

export function hash32(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

export function download(name, text, type = 'application/json') {
  const blob = new Blob([text], { type });
  const a = el('a', { href: URL.createObjectURL(blob), download: name });
  document.body.append(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
}

// iOS paylaşım sayfası: dosyayı "Dosyalar'a kaydet" ile saklamak için en güvenilir yol
export async function shareFile(name, text, type = 'application/json') {
  try {
    const file = new File([text], name, { type });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: name });
      return 'shared';
    }
  } catch (e) {
    if (e && e.name === 'AbortError') return 'aborted';
  }
  download(name, text, type);
  return 'downloaded';
}

export function pickFile(accept = '.json,application/json') {
  return new Promise(res => {
    const inp = el('input', { type: 'file', accept, style: { display: 'none' } });
    inp.addEventListener('change', () => { res(inp.files[0] || null); inp.remove(); });
    document.body.append(inp);
    inp.click();
  });
}
