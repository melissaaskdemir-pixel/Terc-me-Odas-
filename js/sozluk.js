// Sözlük: kendi kartların + OpenRussian (58 bin madde). Biçimden, Türkçeden ya da İngilizceden arar;
// çekim tablosu, görünüş çifti, okuma dosyalarındaki örnekler. Maddeler harf çiftine göre parçalı yüklenir.
import { el, svg, ICON, dayNum } from './util.js';
import { t } from './i18n.js';
import { cardState } from './store.js';
import { CARDS, DECKS, addLocalCard } from './decks.js';
import { norm } from './check.js';
import { isKnown } from './plan.js';
import * as audio from './audio.js';
import { modal, toast } from './ui.js';
import { startStudy } from './study.js';
import { go } from './main.js';
import { lemmaInfo, tappedLemmas } from './okuma.js';
import * as db from './db.js';

let lastQ = '';
let cardIndex = null;
const SENTENCE_DRILL = new Set(['form', 'reg', 'ceviri']);
let IX = null, XM = null, V = '', SH = [], ixP = null;
const shards = new Map();
let pendingOpen = null;

const nz = s => s.toLowerCase().replace(/ё/g, 'е');
const CYR = /[а-яё]/i;

// ---------------------------------------------------------------- veri
export function loadIndex() {
  if (!ixP) {
    ixP = Promise.all([
      fetch('data/sozluk/ix.json').then(r => r.json()),
      fetch('data/sozluk/x.json').then(r => r.json()),
    ]).then(([a, x]) => { IX = a.ix; V = a.v; SH = a.sh || []; XM = x; return IX; }).catch(e => { ixP = null; throw e; });
  }
  return ixP;
}

let RANKS = null;
export async function rankMap() {
  await loadIndex();
  if (!RANKS) { RANKS = new Map(); for (const x of IX) if (x[2] && !RANKS.has(x[0])) RANKS.set(x[0], x[2]); }
  return RANKS;
}

export function shardName(key) {
  let k = nz(key).slice(0, 2);
  if (k.length < 2) k += '_';
  let out = '';
  for (const ch of k) {
    const o = ch.charCodeAt(0) - 0x430;
    out += o >= 0 && o < 32 ? String(o).padStart(2, '0') : 'zz';
  }
  return out;
}
const shardUrl = sh => `data/sozluk/e/${sh}.json`;
const cacheName = () => 'sozluk-' + V;

async function getShard(key) {
  const sh = shardName(key);
  if (shards.has(sh)) return shards.get(sh);
  await loadIndex();
  const url = shardUrl(sh);
  let data = null;
  try {
    const c = await caches.open(cacheName());
    let r = await c.match(url);
    if (!r) {
      r = await fetch(url);
      if (r.status === 404) data = [];
      else if (r.ok) await c.put(url, r.clone());
    }
    if (!data && r && r.ok) data = await r.json();
  } catch (e) {
    try { const r = await fetch(url); if (r.ok) data = await r.json(); else if (r.status === 404) data = []; } catch (e2) {}
  }
  if (!data) return null;
  shards.set(sh, data);
  if (shards.size > 40) shards.delete(shards.keys().next().value);
  return data;
}

// Biçim kodu: baştaki sayı kadar harf lemmadan silinir, kalan eklenir
const dec = (l, code) => {
  const m = /^(\d+)(.*)$/.exec(code);
  return m ? l.slice(0, l.length - +m[1]) + m[2] : code;
};
export function formsOf(e) {
  return (e.f || []).map(c => (c ? c.split(',').map(x => dec(e.l, x.trim())) : []));
}

// ---------------------------------------------------------------- internetsiz indirme
export async function dictStatus() {
  await loadIndex();
  try {
    const c = await caches.open(cacheName());
    return { have: (await c.keys()).length, total: SH.length };
  } catch (e) { return { have: 0, total: SH.length }; }
}
export async function downloadDict(onProgress) {
  await loadIndex();
  // eski sürüm parçalarını sil
  for (const k of await caches.keys()) if (k.startsWith('sozluk-') && k !== cacheName()) await caches.delete(k);
  const c = await caches.open(cacheName());
  const have = new Set((await c.keys()).map(r => new URL(r.url).pathname.split('/').pop()));
  const queue = SH.filter(n => !have.has(n + '.json'));
  let done = SH.length - queue.length, failed = 0;
  onProgress && onProgress(done, SH.length);
  async function worker() {
    while (queue.length) {
      const n = queue.shift();
      try {
        const r = await fetch(shardUrl(n));
        if (r.ok) { await c.put(shardUrl(n), r); done++; } else failed++;
      } catch (e) { failed++; }
      onProgress && onProgress(done, SH.length);
    }
  }
  await Promise.all(Array.from({ length: 6 }, worker));
  return { failed };
}

// ---------------------------------------------------------------- arama
let cardLemmas = new Set();
function buildCardIndex() {
  cardIndex = [];
  cardLemmas = new Set();
  for (const c of CARDS.values()) { if (c.f) cardLemmas.add(c.f); if (c.a && c.a[0]) cardLemmas.add(c.a[0]); }
  for (const c of CARDS.values()) {
    if (SENTENCE_DRILL.has(c.t)) continue; // cümle alıştırmaları sözlük sonucu değil
    const ru = [c.f, c.v, ...(c.a || []), ...((c.cz || []).flatMap(z => z.a))].filter(Boolean).join(' ');
    cardIndex.push({ c, ru: norm(ru), tr: (c.q + ' ' + (c.qs || '')).toLocaleLowerCase('tr') });
  }
}

function cardHits(q) {
  // kelime başında eşleşme (alt dizgi eşleşmesi kısa aramalarda gürültü yapıyordu)
  const qr = ' ' + norm(q), qt = ' ' + q.toLocaleLowerCase('tr');
  const hits = [];
  for (const x of cardIndex) {
    const a = (' ' + x.ru).indexOf(qr), b = (' ' + x.tr.replace(/[(),;]/g, ' ')).indexOf(qt);
    const i = Math.min(...[a, b].filter(v => v >= 0).concat([1e9]));
    if (i < 1e9) hits.push({ x, score: (i === 0 ? 0 : 1) + (x.c.f || '').length / 200 });
  }
  return hits.sort((a, b) => a.score - b.score).map(h => h.x.c);
}

// Rusça: aynı harf çiftindeki maddelerde biçim ve baş eşleşmesi + düzensiz biçimler
async function ruHits(q) {
  const nq = nz(q.trim());
  const out = [];
  const seen = new Set();
  const push = (e, slot) => { const k = e.l + '|' + e.p; if (seen.has(k)) return; seen.add(k); out.push({ e, slot }); };
  const sh = await getShard(nq);
  if (sh === null) return { out, offline: true };
  // tam biçim
  for (const e of sh) {
    if (nz(e.l) === nq) { push(e, -1); continue; }
    const fs = formsOf(e);
    const i = fs.findIndex(v => v.some(x => nz(x) === nq));
    if (i >= 0) push(e, i);
  }
  for (const l of (XM && XM[nq]) || []) {
    const s2 = await getShard(l);
    const e = s2 && s2.find(x => x.l === l);
    if (e) push(e, formsOf(e).findIndex(v => v.some(x => nz(x) === nq)));
  }
  const exact = out.length;
  // baş eşleşmesi (sıklığa göre)
  for (const e of sh) {
    if (out.length > exact + 40) break;
    if (nz(e.l).startsWith(nq)) push(e, null);
  }
  return { out, exact };
}

function trHits(q) {
  const qt = q.toLocaleLowerCase('tr').trim();
  const ql = q.toLowerCase().trim();
  const res = [];
  for (const x of IX) {
    const tr = x[3].toLocaleLowerCase('tr');
    let s = 9;
    if (tr) {
      const i = tr.indexOf(qt);
      if (i >= 0) {
        const start = i === 0 || /[\s,;(=]/.test(tr[i - 1]);
        const end = i + qt.length >= tr.length || !/[a-zçğıöşüâîû]/.test(tr[i + qt.length]);
        s = start && end ? (i === 0 ? 0 : 1) : start ? 2 : 3;
      }
    }
    if (s === 9 && ql.length >= 3 && x[4]) {
      const en = x[4].toLowerCase();
      const i = en.indexOf(ql);
      if (i === 0 || (i > 0 && /[\s,(]/.test(en[i - 1]))) s = 4;
    }
    if (s < 9) res.push({ x, s: s * 1e6 + (x[2] || 9e5) });
    if (res.length > 3000) break;
  }
  return res.sort((a, b) => a.s - b.s).slice(0, 50).map(r => r.x);
}

// ---------------------------------------------------------------- son bakılanlar
let REC = null;
async function recent() {
  if (!REC) { try { REC = (await db.get('kv', 'sozluk')) || {}; } catch (e) { REC = {}; } REC.r = REC.r || []; }
  return REC.r;
}
async function addRecent(e) {
  const r = await recent();
  const i = r.findIndex(x => x.l === e.l && x.p === e.p);
  if (i >= 0) r.splice(i, 1);
  r.unshift({ l: e.l, p: e.p, g: e.tr || shortEn(e.en) || '' });
  r.length = Math.min(r.length, 12);
  try { await db.put('kv', REC, 'sozluk'); } catch (err) {}
}

// ---------------------------------------------------------------- ekran
const ui = { freqN: 30, onlyNew: false, range: 0 };
try { ui.range = +(localStorage.getItem('sozlukRange') || 0) || 0; } catch (e) {}

const ixRow = x => el('button.res', { on: { click: () => openEntry(x[0], null, x[1]) } },
  el('span', el('span.ru', x[0]), cardLemmas.has(x[0]) ? el('span.slot', ' · ' + t('s.inCardsTag')) : null),
  el('span.tr', x[3] || x[4]));

function ixPrefix(q, n = 40) {
  const nq = nz(q);
  const out = [];
  for (const x of IX) { if (nz(x[0]).startsWith(nq)) { out.push(x); if (out.length >= n) break; } }
  return out;
}

async function emptyState(box) {
  box.innerHTML = '';
  const [rec, taps] = await Promise.all([recent(), tappedLemmas(10).catch(() => [])]);
  if (rec.length) box.append(el('div.kicker', t('s.recent')), el('div.list', ...rec.slice(0, 8).map(x =>
    el('button.res', { on: { click: () => openEntry(x.l, null, x.p) } }, el('span.ru', x.l), el('span.tr', x.g)))));
  if (taps.length) box.append(el('div.kicker', t('s.tapped')), el('div.list', ...taps.map(x =>
    el('button.res', { on: { click: () => openEntry(x.l) } },
      el('span', el('span.ru', x.l), el('span.slot', ' · ' + t('s.tapN', { n: x.n }))), el('span.tr', x.tr)))));
  // sıklık listesi
  const RANGES = [[1, 2000, '1–2000'], [2001, 5000, '2000–5000'], [5001, 1e9, '5000+']];
  const rg = RANGES[ui.range] || RANGES[0];
  const rows = [];
  for (const x of IX) {
    if (!x[2]) break;
    if (x[2] < rg[0] || x[2] > rg[1]) continue;
    if (ui.onlyNew && cardLemmas.has(x[0])) continue;
    rows.push(x);
    if (rows.length >= ui.freqN) break;
  }
  const rerun = () => { ui.freqN = 30; try { localStorage.setItem('sozlukRange', String(ui.range)); } catch (e) {} emptyState(box); };
  box.append(el('div.kicker', t('s.freq')), el('div.note', t('s.freqNote')),
    el('div.topline',
      el('div.seg', { role: 'group' }, ...RANGES.map((r, i) => el('button', { 'aria-pressed': String(i === (ui.range || 0)), on: { click: () => { ui.range = i; rerun(); } } }, r[2]))),
      el('button.chip', { 'aria-pressed': String(ui.onlyNew), on: { click: () => { ui.onlyNew = !ui.onlyNew; rerun(); } } }, t('s.onlyNew'))),
    el('div.list', ...rows.map(x => el('button.res.freq', { on: { click: () => openEntry(x[0], null, x[1]) } },
      el('span', el('span.ru', x[0]), cardLemmas.has(x[0]) ? el('span.slot', ' · ' + t('s.inCardsTag')) : null),
      el('span.tr', x[3] || x[4]), el('span.rk.mono', '#' + x[2])))),
    rows.length >= ui.freqN ? el('button.btn.btn-wide', { on: { click: () => { ui.freqN += 30; emptyState(box); } } }, t('s.more30')) : null);
}

export function renderSozluk(root) {
  if (!cardIndex || cardIndex._n !== CARDS.size) { buildCardIndex(); cardIndex._n = CARDS.size; }
  const input = el('input.search', { type: 'search', placeholder: t('s.ph'), autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', value: lastQ });
  const list = el('div.sect');
  const info = el('div.note');
  let seq = 0;
  const showDict = (cards, dict, exact, q) => {
    list.innerHTML = '';
    if (cards.length) list.append(el('div.kicker', t('s.inCards')), el('div.list', ...cards.map(c =>
      el('button.res', { on: { click: () => showCard(c.id) } }, el('span.ru', c.f || c.v), el('span.tr', c.q)))));
    if (dict.length) {
      list.append(el('div.kicker', t('s.inDict')), el('div.list', ...dict.slice(0, 50).map((d, i) => {
        if (d.ix) return ixRow(d.ix);
        const e = d.e;
        const lab = d.slot != null && d.slot >= 0 ? slotLabel(e, d.slot) : null;
        return el('button.res' + (i < exact ? '.exact' : ''), { on: { click: () => openEntry(e.l, nz(q), e.p) } },
          el('span', el('span.ru', e.l), lab ? el('span.slot', ' · ' + lab) : null),
          el('span.tr', e.tr || shortEn(e.en) || ''));
      })));
    }
  };
  const run = async () => {
    const my = ++seq;
    lastQ = input.value;
    const q = input.value.trim();
    if (!q) {
      info.textContent = t('s.info2', { n: '58 bin', c: CARDS.size });
      try { await loadIndex(); } catch (e) { info.textContent = t('s.offline'); return; }
      if (my === seq) emptyState(list);
      return;
    }
    const cards = q.length >= 2 ? cardHits(q).slice(0, 6) : [];
    const isRu = CYR.test(q);
    try { await loadIndex(); } catch (e) { info.textContent = t('s.offline'); return; }
    if (my !== seq) return;
    // anında: sıklık dizininden baş eşleşmesi
    if (isRu) {
      const quick = ixPrefix(q).map(x => ({ ix: x }));
      showDict(cards, quick, 0, q);
      info.textContent = quick.length || cards.length ? t('s.hits', { n: cards.length + quick.length }) : t('s.searching');
      if (q.length < 2) return;
    }
    let dict = [], offline = false, exact = 0;
    try {
      if (isRu) { const r = await ruHits(q); dict = r.out; offline = !!r.offline; exact = r.exact || 0; }
      else dict = trHits(q).map(x => ({ ix: x }));
    } catch (e) { offline = true; }
    if (my !== seq) return;
    if (isRu && offline && !dict.length) {
      // parça yoksa sıklık dizini sonuçları kalsın
      if (list.childElementCount) { info.textContent = t('s.partial'); return; }
    }
    showDict(cards, dict, exact, q);
    info.textContent = !cards.length && !dict.length ? (offline ? t('s.offline') : t('s.none'))
      : t('s.hits', { n: cards.length + Math.min(dict.length, 50) });
  };
  let tm = null;
  input.addEventListener('input', () => { clearTimeout(tm); tm = setTimeout(run, 90); });
  root.append(el('div.wrap', el('div.kicker', t('s.kicker')), el('h1.h1', t('s.title')), input, info, list,
    el('div.note', t('s.note2'))));
  run();
  if (pendingOpen) {
    const p = pendingOpen; pendingOpen = null;
    openEntry(p.lemma, p.form);
  }
}

const shortEn = en => (en || '').split(/[;,]/).slice(0, 2).join(',').trim();

// Okuma odasından: sözlükte aç
export function lookup(lemma, form) {
  lastQ = form || lemma;
  pendingOpen = { lemma, form };
  go('sozluk');
}

// ---------------------------------------------------------------- madde
const POS = { n: 's.pN', v: 's.pV', a: 's.pA', o: 's.pO' };
const GEN = { m: 'f.m', f: 'f.f', n: 'f.n', pl: 'f.pl' };
const CASE_TR = ['Nom', 'Gen', 'Dat', 'Acc', 'Ins', 'Prep'];

function slotLabel(e, i) {
  if (e.p === 'n') return `${CASE_TR[i % 6]} ${i < 6 ? t('f.sg') : t('f.pl')}`;
  if (e.p === 'v') return [t('f.1s'), t('f.2s'), t('f.3s'), t('f.1p'), t('f.2p'), t('f.3p'), t('f.pm'), t('f.pf'), t('f.pn'), t('f.pp'), t('f.imp'), t('f.impp')][i] || '';
  if (e.p === 'a') {
    if (i < 24) return `${CASE_TR[i % 6]} ${[t('f.m'), t('f.f'), t('f.n'), t('f.pl')][Math.floor(i / 6)]}`;
    return [t('f.sm'), t('f.sf'), t('f.sn'), t('f.sp'), t('f.cmp')][i - 24] || '';
  }
  return '';
}

async function findEntry(lemma, pos) {
  const sh = await getShard(lemma);
  if (!sh) return null;
  const all = sh.filter(e => e.l === lemma);
  if (!all.length) {
    const alt = sh.filter(e => nz(e.l) === nz(lemma));
    return alt.find(e => e.p === pos) || alt[0] || null;
  }
  return all.find(e => e.p === pos) || all.sort((a, b) => (a.r || 1e6) - (b.r || 1e6))[0];
}

export async function openEntry(lemma, form, pos) {
  let e = null;
  try { e = await findEntry(lemma, pos); } catch (err) {}
  if (!e) {
    // sözlükte yoksa: okuma dosyalarındaki bilgi ya da kart
    const card = [...CARDS.values()].find(c => c.f === lemma);
    if (card) return showCard(card.id);
    toast(t('s.noEntry', { w: lemma }));
    return;
  }
  addRecent(e);
  const fs = formsOf(e);
  const me = form ? nz(form) : null;
  const info = await lemmaInfo(e.l).catch(() => null);
  const au = info?.au || [...CARDS.values()].find(c => c.f === e.l)?.au;
  const card = [...CARDS.values()].find(c => c.f === e.l || (c.a && c.a[0] === e.l));
  const kick = [t(POS[e.p])];
  if (e.g) kick.push(t(GEN[e.g] || 'f.m'));
  if (e.an) kick.push(t('s.anim'));
  if (e.ind) kick.push(t('s.indecl'));
  if (e.asp) kick.push(e.asp === 'i' ? 'impf.' : e.asp === 'p' ? 'pf.' : 'impf./pf.');
  if (e.r) kick.push(t('s.rank', { n: e.r }));
  const localId = 'p:yerel:' + e.l;
  modal(close => {
    const addBtn = el('button.btn.btn-accent', {
      disabled: !!card || CARDS.has(localId),
      on: {
        click: async () => {
          const q = e.tr || shortEn(e.en);
          const ex = info?.ex?.[0];
          const c = { id: localId, t: 'kelime', q, a: [e.l], f: e.l, ex: ex ? [[ex.ru, ex.tr, ex.au]] : [], s: t('s.cardSrc'), d: 0.3, au };
          if (e.pa) c.pa = e.pa.split(/[;,]/).map(s => s.trim()).filter(Boolean);
          if (e.p === 'v' && e.asp) c.h = 'fiil · ' + (e.asp === 'i' ? 'impf.' : 'pf.');
          if (await addLocalCard(c)) { toast(t('o.added', { w: e.l })); addBtn.disabled = true; addBtn.textContent = t('o.inDeckShort'); }
        },
      },
    }, card || CARDS.has(localId) ? t('o.inDeckShort') : t('o.addDeck'));
    return el('div.paper', { style: { display: 'flex', flexDirection: 'column', gap: '12px' } },
      el('div.lab', kick.join(' · ')),
      el('div.exrow', el('div.ans.ru', { style: { flex: '1', fontSize: '28px' } }, e.l),
        el('button.pbtn.round', { 'aria-label': t('st.listen'), on: { click: () => audio.play(au || null, 1, e.l) } }, svg(ICON.play))),
      e.tr ? el('div', { style: { fontSize: '18px' } }, e.tr) : null,
      e.en ? el('div.meta', 'EN: ' + e.en) : null,
      !e.tr && !e.en ? el('div.meta', t('o.noGloss')) : null,
      e.pa ? el('div.meta', el('b', t('st.pair') + ': '), ...e.pa.split(/[;,]/).map(s => s.trim()).filter(Boolean).flatMap((p, i) => [
        i ? ', ' : '', el('button.elink.ru', { on: { click: () => { close(); openEntry(p, null, 'v'); } } }, p)])) : null,
      formsTable(e, fs, me),
      ...(info?.ex || []).slice(0, 2).map(x => el('div.exrow', el('div.ex', { style: { flex: '1' } }, el('div.r', x.ru), el('div.t', x.tr)),
        el('button.pbtn.round', { 'aria-label': t('st.listen'), on: { click: () => audio.play(x.au) } }, svg(ICON.play)))),
      info?.ex?.length ? el('div.meta', t('s.fromReading')) : null,
      card ? el('div.meta', t('s.cardHas'), ' ', el('button.elink', { on: { click: () => { close(); showCard(card.id); } } }, t('s.openCard'))) : null,
      el('div.grid2', el('button.btn', { on: { click: close } }, t('s.close')), addBtn),
    );
  });
}

function formsTable(e, fs, me) {
  if (!fs.length) return null;
  const cell = i => {
    const v = fs[i] || [];
    if (!v.length) return el('td', '—');
    const hit = me && v.some(x => nz(x) === me);
    return el('td' + (hit ? '.hit' : ''), v.join(', '));
  };
  if (e.p === 'n') {
    const sg = !e.po, pl = !e.so;
    return el('table.tbl', el('thead', el('tr', el('th', ''), sg ? el('th', t('f.sg')) : null, pl ? el('th', t('f.pl')) : null)),
      el('tbody', ...CASE_TR.map((c, k) => el('tr', el('td.k', c), sg ? cell(k) : null, pl ? cell(k + 6) : null))));
  }
  if (e.p === 'v') {
    const pres = e.asp === 'p' ? t('f.fut') : t('f.pres');
    const rows = [[0, 'я'], [1, 'ты'], [2, 'он, она'], [3, 'мы'], [4, 'вы'], [5, 'они']];
    return el('div.sect',
      el('table.tbl', el('thead', el('tr', el('th', ''), el('th', pres))), el('tbody', ...rows.map(([i, p]) => el('tr', el('td.k.ru', p), cell(i))))),
      el('table.tbl', el('tbody',
        ...[[6, t('f.pm')], [7, t('f.pf')], [8, t('f.pn')], [9, t('f.pp')], [10, t('f.imp')], [11, t('f.impp')]].filter(([i]) => fs[i]?.length)
          .map(([i, lab]) => el('tr', el('td.k', lab), cell(i))))));
  }
  if (e.p === 'a') {
    const parts = [el('table.tbl', el('thead', el('tr', el('th', ''), el('th', t('f.m')), el('th', t('f.f')), el('th', t('f.n')), el('th', t('f.pl')))),
      el('tbody', ...CASE_TR.map((c, k) => el('tr', el('td.k', c), cell(k), cell(k + 6), cell(k + 12), cell(k + 18)))))];
    const extra = [[24, t('f.sm')], [25, t('f.sf')], [26, t('f.sn')], [27, t('f.sp')], [28, t('f.cmp')]].filter(([i]) => fs[i]?.length);
    if (extra.length) parts.push(el('table.tbl', el('tbody', ...extra.map(([i, lab]) => el('tr', el('td.k', lab), cell(i))))));
    return el('div.sect', ...parts);
  }
  return null;
}

// ---------------------------------------------------------------- kart (kendi destelerin)
const STATE_LABEL = st => !st.st ? t('s.stNew') : isKnown(st) ? t('s.stKnown') : t('s.stLearning');

export async function showCard(id) {
  const c = CARDS.get(id);
  if (!c) return;
  const st = cardState(id);
  const today = dayNum();
  const head = c.f || c.v;
  const word = (c.a && c.a[0]) || (c.cz && c.cz[0].a[0]) || head;
  let entry = null;
  if (word && !/\s/.test(word.trim()) && CYR.test(word)) { try { entry = await findEntry(word); } catch (e) {} }
  const play = key => key ? el('button.pbtn.round', { 'aria-label': t('st.listen'), on: { click: () => audio.play(key) } }, svg(ICON.play)) : null;
  modal(close => el('div.paper', { style: { display: 'flex', flexDirection: 'column', gap: '12px' } },
    el('div.mono', { style: { fontSize: '11px', letterSpacing: '.1em', color: 'var(--p-kicker)' } }, `${(DECKS.get(c.deck)?.ad || '').toLocaleUpperCase('tr')} · ${c.id.replace(/^p:[^:]+:/, '')}`),
    el('div.exrow', el('div.ans.ru', { style: { flex: '1', fontSize: '26px' } }, head), play(c.au || (c.cz && c.cz[0].au))),
    el('div', { style: { fontSize: '17px' } }, c.q),
    c.qs ? el('div.meta', c.qs) : null,
    c.g ? el('div.meta', el('b', t('st.gov') + ': '), el('span.ru', c.g)) : null,
    c.p && c.p[0] && c.p[1] ? el('div.meta', el('b', t('st.pair') + ': '), el('span.ru', `${c.p[0]} (impf.) · ${c.p[1]} (pf.)`)) : null,
    ...(c.cz || []).map(z => el('div.exrow', el('div.ex', { style: { flex: '1' } }, el('div.r', z.full || z.s), z.tr ? el('div.t', z.tr) : null), play(z.au))),
    ...(c.ex || []).map(e => el('div.exrow', el('div.ex', { style: { flex: '1' } }, el('div.r', e[0]), e[1] ? el('div.t', e[1]) : null), play(e[2]))),
    c.n ? el('div.meta', c.n) : null,
    entry ? formsTable(entry, formsOf(entry), nz(word)) : null,
    el('div.meta', `${t('s.state')}: ${STATE_LABEL(st)}` + (st.st && st.due != null ? ' · ' + (st.due <= today ? t('s.dueNow') : t('s.dueIn', { n: st.due - today })) : '')),
    el('div.grid2',
      el('button.btn', { on: { click: close } }, t('s.close')),
      el('button.btn.btn-accent', { on: { click: () => { close(); startStudy('liste', { ids: [id] }, () => go('sozluk')); } } }, t('s.study'))),
  ));
}
