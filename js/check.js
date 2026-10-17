// Cevap denetimi ve hata sınıflandırıcı: doğru / imla / son ek / yapı
import { t } from './i18n.js';

let MORPH = null;          // { L: [...], T: {...} }
let TOK = null;            // normalleştirilmiş token → lemma kimlikleri
const LEMMA = new Map();   // lemma kimliği → Map(normForm → {tags, form})

export function setMorph(m) {
  MORPH = m;
  TOK = new Map();
  for (const [w, ids] of Object.entries(m.T)) TOK.set(norm(w), ids);
}
export const morphReady = () => !!MORPH;

function lemma(id) {
  let L = LEMMA.get(id);
  if (L) return L;
  L = new Map();
  for (const part of MORPH.L[id].split(';')) {
    const i = part.lastIndexOf(':');
    const form = part.slice(0, i);
    L.set(norm(form), { tags: part.slice(i + 1), form });
  }
  LEMMA.set(id, L);
  return L;
}
export function lemmasOf(word) {
  if (!TOK) return [];
  return (TOK.get(norm(word)) || []).map(lemma);
}

// ---------------------------------------------------------------- normalleştirme
const LAT = { a: 'а', e: 'е', o: 'о', p: 'р', c: 'с', x: 'х', y: 'у', k: 'к' };
export function norm(s) {
  s = (s || '').toLowerCase().normalize('NFC').replace(/́/g, '').replace(/ё/g, 'е');
  if (/[а-я]/.test(s)) s = s.replace(/[aeopcxyk]/g, ch => LAT[ch]);
  s = s.replace(/[‐-―−]/g, '-').replace(/\s+-\s+|\s+-|-\s+/g, ' ');
  s = s.replace(/[.,!?;:«»"“”„'’()\[\]…\/+*]/g, ' ');
  return s.replace(/\s+/g, ' ').trim();
}
export const tokens = s => norm(s).split(' ').filter(Boolean);
export function latinOnly(s) {
  return /[a-zçğıöşü]/i.test(s) && !/[а-яё]/i.test(s);
}

// ---------------------------------------------------------------- yardımcı ölçüler
export function lev(a, b) {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (!m) return n; if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j), cur = new Array(n + 1);
  for (let i = 1; i <= m; i++) {
    cur[0] = i;
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    [prev, cur] = [cur, prev];
  }
  return prev[n];
}
const cprefix = (a, b) => { let i = 0; while (i < a.length && i < b.length && a[i] === b[i]) i++; return i; };
const VOW = 'аеиоуыэюя';

// a'nın b'ye göre hatalı harflerinin konumları (gösterim için)
export function charMarks(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = m - 1; i >= 0; i--) for (let j = n - 1; j >= 0; j--)
    dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const bad = new Set();
  let i = 0, j = 0;
  while (i < m && j < n) {
    if (a[i] === b[j]) { i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { bad.add(i); i++; }
    else j++;
  }
  while (i < m) bad.add(i++);
  return bad;
}

// ---------------------------------------------------------------- tek kelime sınıflandırma
export function classifyToken(tw, ew, ctx = {}) {
  if (tw === ew) return { c: 'ok' };
  const L = ew.length;
  if (tw.replace(/ться$/, 'тся') === ew.replace(/ться$/, 'тся') || tw.replace(/тся$/, 'ться') === ew.replace(/тся$/, 'ться'))
    return { c: 'imla', why: 'tsya' };
  if (tw.replace(/[ьъ]/g, '') === ew.replace(/[ьъ]/g, '')) return { c: 'imla', why: 'znak' };
  if (tw.replace(/(.)\1/g, '$1') === ew.replace(/(.)\1/g, '$1')) return { c: 'imla', why: 'double' };
  // aynı sözcüğün başka bir biçimi mi?
  for (const lm of lemmasOf(ew)) {
    const hit = lm.get(tw);
    if (hit) return { c: 'sonek', why: 'form', tTags: hit.tags, eTags: (lm.get(ew) || {}).tags || '' };
  }
  // görünüş çifti
  if (ctx.partner && ctx.partner.has(tw)) return { c: 'yapi', why: 'aspect' };
  const d = lev(tw, ew);
  const cp = cprefix(tw, ew);
  const lim = L <= 4 ? 1 : L <= 8 ? 2 : 3;
  if (d <= lim) {
    if (cp >= 3 && cp >= L - 3 && Math.abs(tw.length - L) <= 3) return { c: 'sonek', why: 'ending' };
    const marks = charMarks(tw, ew);
    const onlyVowels = [...marks].every(i => VOW.includes(tw[i]));
    return { c: 'imla', why: onlyVowels ? 'vowel' : 'spell' };
  }
  if (cp >= Math.max(3, L - 4)) return { c: 'sonek', why: 'ending' };
  return { c: 'yapi', why: 'word' };
}

const SEV = { ok: 0, imla: 1, sonek: 2, yapi: 3, miss: 3, extra: 3 };

// Kelime dizilerini hizalar (eşleşme / ilişkili / eksik / fazla)
function align(T, E, ctx) {
  const m = T.length, n = E.length;
  const cost = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  const cls = Array.from({ length: m }, () => new Array(n));
  for (let i = 0; i <= m; i++) cost[i][0] = i;
  for (let j = 0; j <= n; j++) cost[0][j] = j;
  for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) {
    const c = cls[i - 1][j - 1] = classifyToken(T[i - 1], E[j - 1], ctx);
    const sub = c.c === 'ok' ? 0 : c.c === 'yapi' ? 1.2 : 0.5;
    cost[i][j] = Math.min(cost[i - 1][j] + 1, cost[i][j - 1] + 1, cost[i - 1][j - 1] + sub);
  }
  const ops = [];
  let i = m, j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0) {
      const c = cls[i - 1][j - 1];
      const sub = c.c === 'ok' ? 0 : c.c === 'yapi' ? 1.2 : 0.5;
      if (Math.abs(cost[i][j] - (cost[i - 1][j - 1] + sub)) < 1e-9) { ops.unshift({ t: T[i - 1], e: E[j - 1], ...c }); i--; j--; continue; }
    }
    if (i > 0 && Math.abs(cost[i][j] - (cost[i - 1][j] + 1)) < 1e-9) { ops.unshift({ t: T[i - 1], e: null, c: 'extra' }); i--; continue; }
    ops.unshift({ t: null, e: E[j - 1], c: 'miss' }); j--;
  }
  return { ops, cost: cost[m][n] };
}

function grade(typed, exp, ctx) {
  const T = typed.split(' '), E = exp.split(' ');
  // tire / bitişik yazım
  if (typed.replace(/[-\s]/g, '') === exp.replace(/[-\s]/g, '')) {
    return { res: 'imla', why: 'hyphen', ops: [{ t: typed, e: exp, c: 'imla', why: 'hyphen' }], cost: 0.3 };
  }
  // kelime sırası
  if (T.length > 1 && T.length === E.length && [...T].sort().join(' ') === [...E].sort().join(' ')) {
    return { res: 'yapi', why: 'order', ops: E.map(e => ({ t: e, e, c: 'ok' })), cost: 1 };
  }
  const { ops, cost } = align(T, E, ctx);
  let worst = 'ok', why = '';
  for (const o of ops) {
    if (SEV[o.c] > SEV[worst]) { worst = o.c === 'miss' || o.c === 'extra' ? 'yapi' : o.c; why = o.c === 'miss' ? 'miss' : o.c === 'extra' ? 'extra' : o.why; }
  }
  return { res: worst, why, ops, cost };
}

/**
 * typed: kullanıcının yazdığı
 * accepted: kabul edilen cevaplar (gösterim biçimleriyle)
 * opts.partner: görünüş çifti karşılıkları (doğru sayılır, not düşülür)
 * opts.user: kullanıcının "bence doğruydu" ile eklediği cevaplar
 */
export function check(typed, accepted, opts = {}) {
  const nt = norm(typed);
  if (!nt) return { res: 'empty' };
  if (latinOnly(typed)) return { res: 'klavye' };
  const alts = accepted.map(a => ({ disp: a, n: norm(a) })).filter(a => a.n);
  for (const a of alts) if (a.n === nt) return { res: 'ok', alt: a.disp };
  for (const p of opts.partner || []) if (norm(p) === nt) return { res: 'ok', partner: true, alt: p, main: alts[0]?.disp };
  for (const u of opts.user || []) if (norm(u) === nt) return { res: 'ok', user: true, alt: u };
  if (opts.freeOrder) {
    // çeviride kelime sırası serbest: aynı kelimeler farklı sırada da doğru
    const key = s => s.split(' ').sort().join(' ');
    const kt = key(nt);
    for (const a of alts) if (key(a.n) === kt) return { res: 'ok', alt: a.disp, order: true };
  }
  for (const w of opts.wrongAspect || []) if (norm(w) === nt) {
    const g = { res: 'yapi', why: 'aspect', ops: [{ t: nt, e: alts[0]?.n, c: 'yapi', why: 'aspect' }], alt: alts[0]?.disp };
    g.msg = explain(g);
    return g;
  }
  const ctx = { partner: new Set((opts.partner || []).map(norm)) };
  let best = null;
  for (const a of alts) {
    const g = grade(nt, a.n, ctx);
    g.alt = a.disp;
    if (!best || SEV[g.res] < SEV[best.res] || (SEV[g.res] === SEV[best.res] && g.cost < best.cost)) best = g;
  }
  if (!best) return { res: 'yapi', ops: [], alt: accepted[0] };
  best.msg = explain(best);
  return best;
}

// ---------------------------------------------------------------- açıklamalar
const CASE = { N: 'Nom', G: 'Gen', D: 'Dat', A: 'Acc', I: 'Ins', P: 'Prep' };
const NUMG = { s: 'tekil', p: 'çoğul', m: 'eril', f: 'dişil', n: 'nötr' };
export function tagLabel(code) {
  if (!code) return '';
  if (CASE[code[0]] && code.length === 2) return `${CASE[code[0]]} ${NUMG[code[1]]}`;
  if (code[0] === 'k') return `kısa biçim, ${NUMG[code[1]]}`;
  if (code === 'cmp') return 'karşılaştırma';
  if (code === 'inf') return 'mastar';
  if (/^[123][sp]$/.test(code)) return `${code[0]}. ${code[1] === 's' ? 'tekil' : 'çoğul'} şahıs`;
  if (/^p[mfnp]$/.test(code)) return `geçmiş, ${NUMG[code[1]]}`;
  if (code === 'imp') return 'emir';
  if (code === 'impp') return 'emir, çoğul';
  return code;
}
const ORD = 'NGDAIPk';
const tagKey = c => (ORD.indexOf(c[0]) + 1 || 9) * 10 + ('sm f n p'.indexOf(c[1] || 's') + 1);
export const tagsLabel = s => (s || '').split('/').filter(Boolean).sort((a, b) => tagKey(a) - tagKey(b)).map(tagLabel).join(', ');

function explain(g) {
  const o = g.ops.find(x => x.c !== 'ok') || {};
  switch (g.why) {
    case 'tsya': return t('why.tsya');
    case 'znak': return t('why.znak');
    case 'double': return t('why.double');
    case 'vowel': return t('why.vowel');
    case 'spell': return t('why.spell');
    case 'hyphen': return t('why.hyphen');
    case 'order': return t('why.order');
    case 'miss': return t('why.miss', { w: o.e });
    case 'extra': return t('why.extra', { w: o.t });
    case 'aspect': return t('why.aspect');
    case 'form': return t('why.form', { t: o.t, tt: tagsLabel(o.tTags), e: o.e, et: tagsLabel(o.eTags) });
    case 'ending': return t('why.ending');
    case 'word': return t('why.word');
    default: return '';
  }
}

// ---------------------------------------------------------------- ipucu
export function hintText(answer, level) {
  return answer.split(' ').map(w => {
    const letters = [...w];
    const show = Math.min(level, Math.max(1, letters.filter(ch => /[а-яё]/i.test(ch)).length - 1));
    let k = 0;
    return letters.map(ch => {
      if (!/[а-яё]/i.test(ch)) return ch;
      k++;
      return k <= show ? ch : '_';
    }).join('');
  }).join('  ');
}
