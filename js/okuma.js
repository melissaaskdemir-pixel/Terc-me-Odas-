// Okuma odası: açınca kaldığın paragraf, dokununca kelime kartı, cümle çözücü, tur takvimi.
// Her paragraf 5 tur okunur: 1–3 uyarlama, 4–5 özgün metin. Turlar ilk okumadan 1, 3, 7, 14 gün sonra.
import { el, svg, ICON, dayNum, fmtDay } from './util.js';
import { t } from './i18n.js';
import * as db from './db.js';
import * as audio from './audio.js';
import { modal, toast, bigStamp } from './ui.js';
import { tagsLabel } from './check.js';
import { CARDS, addLocalCard } from './decks.js';
import { go } from './main.js';
import { lookup } from './sozluk.js';

const TOK = /[А-Яа-яЁёA-Za-z0-9³]+(?:-[А-Яа-яЁёA-Za-z0-9]+)*/g;
const OFF = [0, 1, 3, 7, 14];
export const ROUNDS = 5;
const EASE = 5;          // bir turda bu kadar bilinmeyen varsa sonraki tur ertesi gün
const SENT_EASE = 3;     // bir cümlede bu kadar dokunuş: çözümleme kendiliğinden açılır

let DATA = null, P = null, loadP = null;
const ui = { view: 'read', id: null, ver: null, focus: 0, tr: new Set(), dec: new Set(), taps: new Set(), sentTaps: {}, playing: false, preOpen: null, done: null };

export function loadOkuma() {
  if (DATA && P) return Promise.resolve(DATA);
  if (!loadP) {
    loadP = Promise.all([
      fetch('data/okuma.json').then(r => { if (!r.ok) throw new Error('okuma'); return r.json(); }),
      db.get('kv', 'okuma'),
    ]).then(([d, p]) => {
      DATA = d;
      P = p || { p: {}, log: {} };
      P.p = P.p || {}; P.log = P.log || {};
      return DATA;
    }).catch(e => { loadP = null; throw e; });
  }
  return loadP;
}
const save = () => db.put('kv', P, 'okuma');

// ---------------------------------------------------------------- takvim
const pid = (f, i) => `${f.id}:${i}`;
function lookupId(id) {
  const [fid, i] = id.split(':');
  const f = DATA.files.find(x => x.id === fid);
  return f && f.paras[+i] ? { f, i: +i, p: f.paras[+i] } : null;
}
const st = id => P.p[id] || { r: 0, taps: [] };

export function today() {
  const d = dayNum();
  const rev = [];
  let nextNew = null, newToday = 0;
  for (const f of DATA.files) f.paras.forEach((_, i) => {
    const id = pid(f, i), s = P.p[id];
    if (!s || !s.r) { if (!nextNew) nextNew = id; return; }
    if (s.first === d) newToday++;
    if (s.r < ROUNDS && s.due != null && s.due <= d && s.last !== d) rev.push(id);
  });
  rev.sort((a, b) => P.p[a].due - P.p[b].due);
  const list = [...rev];
  if (!newToday && nextNew) list.push(nextNew);
  return { list, rev, nextNew, newToday, done: P.log[d] || 0 };
}

function currentId() {
  const q = today();
  if (P.cur && lookupId(P.cur)) {
    const s = st(P.cur);
    if (s.r < ROUNDS && (!s.r || s.due <= dayNum())) return P.cur;
  }
  return q.list[0] || null;
}

export async function okumaToday() { await loadOkuma(); return today(); }
export const okumaLabel = id => label(id);

// Masa için kısa durum
export async function okumaStatus() {
  await loadOkuma();
  const q = today();
  if (q.list.length) return t('o.stTodo', { n: q.list.length });
  if (q.done) return t('o.stDone', { n: q.done });
  return q.nextNew ? t('o.stFree') : t('o.stAll');
}

function fileDone(f) { return f.paras.every((_, i) => st(pid(f, i)).r >= ROUNDS); }

const isOrig = round => round > 3;

// ---------------------------------------------------------------- görünüm
export function renderOkuma(root) {
  stopPlay();
  const wrap = el('div.wrap');
  root.append(wrap);
  loadOkuma().then(() => {
    if (!wrap.isConnected) return;
    // sekmeden girişte: kaldığın paragraf (Dosyalar'dan açılmış bir paragraf varsa o)
    const keep = ui.rr || ui.explicit;
    ui.rr = false;
    if (!keep) { ui.view = 'read'; ui.done = null; openId(currentId(), true); }
    if (ui.view === 'files') return renderFiles(wrap);
    if (!ui.id || !lookupId(ui.id)) openId(currentId(), true);
    if (!ui.id) renderFiles(wrap, true); else renderReader(wrap);
  }).catch(e => { console.error(e); wrap.append(el('div.panel', t('err.load'))); });
}

function openId(id, keep) {
  if (ui.id !== id || !keep) {
    ui.id = id; ui.ver = null; ui.focus = 0; ui.tr = new Set(); ui.dec = new Set(); ui.taps = new Set(); ui.sentTaps = {}; ui.preOpen = null; ui.done = null;
  }
}

function rerender() { ui.rr = true; go('okuma', true); }
function show(id) {
  stopPlay();
  openId(id);
  ui.view = 'read';
  ui.explicit = true;
  if (id && st(id).r < ROUNDS) { P.cur = id; save(); }
  go('okuma');
}

// ---------------------------------------------------------------- okuyucu
function renderReader(wrap) {
  const L = lookupId(ui.id);
  const { f, i, p } = L;
  const s = st(ui.id);
  const round = Math.min(ROUNDS, s.r + 1);
  const finished = s.r >= ROUNDS;
  const early = s.r > 0 && !finished && s.due > dayNum();
  const ver = ui.ver || (finished || isOrig(round) ? 'o' : 'ad');
  const sents = p[ver];
  if (ui.focus >= sents.length) ui.focus = 0;
  const q = today();

  // ön kelimeler: ilk turda açık
  const preOpen = ui.preOpen ?? (s.r === 0);
  const pre = p.pre.length ? el('div.sect',
    el('button.ok-pretog', { 'aria-expanded': String(preOpen), on: { click: () => { ui.preOpen = !preOpen; rerender(); } } },
      el('span.kicker', t('o.pre', { n: p.pre.length })), el('span.kicker', preOpen ? '−' : '+')),
    preOpen ? el('div.ok-pre', ...p.pre.map(w => el('div.pw',
      el('div', { style: { flex: '1', minWidth: '0' } },
        el('div', el('span.w.ru', w.ru), ' ', el('span.tr', '· ' + w.tr)),
        el('div.ex.ru', w.ex), el('div.tr', w.exTr)),
      el('div.pwb', playBtn(w.au, 'dark'), playBtn(w.exAu, 'dark', true))))) : null) : null;

  const text = el('div.okt' + (ver === 'o' ? '.orig' : ''));
  sents.forEach((x, k) => {
    text.append(sentNode(x, k, p));
    if (ui.tr.has(k)) text.append(el('div.ok-tr', x.tr));
    if (ui.dec.has(k) && x.st) text.append(decoder(x));
  });

  const head = el('div.ok-head',
    el('div.topline',
      el('span.kicker', `${f.dosya} · ${f.konu}`),
      el('button.linkbtn', { on: { click: () => { stopPlay(); ui.view = 'files'; ui.explicit = false; ui.rr = true; go('okuma'); } } }, t('o.files'))),
    el('h1.ok-title.ru', f.title),
    el('div.ok-sub', `${f.titleTr} · § ${i + 1} / ${f.paras.length}`),
    el('div.ok-meta',
      el('span.mono.ok-round', finished ? t('o.roundsDone') : early ? t('o.round', { r: round, n: ROUNDS }) + ' · ' + dueText(s.due).toLocaleUpperCase('tr')
        : t('o.round', { r: round, n: ROUNDS }) + ' · ' + (ver === 'o' ? t('o.vOrig') : t('o.vAd'))),
      el('div.seg', { role: 'group' },
        ...[['ad', t('o.vAdShort')], ['o', t('o.vOrigShort')]].map(([v, lab]) => el('button', {
          'aria-pressed': String(ver === v),
          on: { click: () => { if (ver === v) return; stopPlay(); ui.ver = v; ui.focus = 0; ui.tr = new Set(); ui.dec = new Set(); rerender(); } },
        }, lab)))),
  );

  const paper = el('div.paper.okp', text,
    el('div.ok-src', t('o.src'), ' ', el('a', { href: f.url, target: '_blank', rel: 'noopener' }, '«' + f.src + '»'), ', ', t('o.srcLic')));

  let foot;
  if (ui.done) foot = doneBox(ui.done);
  else if (finished) foot = el('div.sect',
    el('div.note', t('o.finishedNote')),
    nextButtons(q));
  else if (early) foot = el('div.sect',
    el('div.note', t('o.early', { d: dueText(s.due) })),
    nextButtons(q));
  else foot = el('div.sect',
    el('button.btn.btn-primary.btn-wide.btn-big', { on: { click: () => finish(ui.id) } },
      el('span', t('o.readDone')), el('span.mono', t('o.unknownN', { n: ui.taps.size }))),
    el('div.note', s.r === 0 ? t('o.howto') : t('o.howto2')));

  const tool = toolbar(sents, p);
  wrap.append(...[head, pre, paper, foot, tool].filter(Boolean));
  // seslerini önceden hazırla (internetsiz için de önbelleğe al)
  setTimeout(() => {
    audio.cacheKeys([...sents.map(x => x.au), ...p.pre.flatMap(w => [w.au, w.exAu])]);
    audio.prepare(sents[ui.focus]?.au).catch(() => {});
  }, 300);
}

function sentNode(x, k, p) {
  const n = el('span.os' + (k === ui.focus ? '.on' : ''), { 'data-i': k });
  const s = x.ru;
  let last = 0;
  for (const m of s.matchAll(TOK)) {
    if (m.index > last) n.append(s.slice(last, m.index));
    const w = m[0], lw = w.toLowerCase();
    const known = DATA.tok[lw] || /[а-яё]/.test(lw);
    if (!known) { n.append(w); last = m.index + w.length; continue; }
    const rare = p.rare.includes(lw);
    const span = el('span.w' + (ui.taps.has(lw) ? '.t' : '') + (rare ? '.rare' : ''), { on: { click: e => { e.stopPropagation(); tapWord(w, k, x, p); } } }, w);
    if (rare) {
      const g = shortGloss(p.g[lw] || DATA.tok[lw]?.tr || '');
      if (g) span.append(el('span.rg', { 'aria-hidden': 'true' }, g));
    }
    n.append(span);
    last = m.index + w.length;
  }
  if (last < s.length) n.append(s.slice(last));
  n.append(' ');
  n.addEventListener('click', () => setFocus(k));
  return n;
}

const shortGloss = g => {
  const a = g.replace(/\s*\([^)]*\)/g, '').split(/[;,]/)[0].trim();
  return a.length > 24 ? a.slice(0, 23) + '…' : a;
};

function decoder(x) {
  return el('div.ok-dec', ...x.st.map(d => el('div.dp' + (d.r === 'core' ? '.core' : '.side'),
    el('div.lab', d.lab), el('div.r.ru', d.ru), el('div.t', d.tr))));
}

function setFocus(k) {
  if (k === ui.focus) return;
  ui.focus = k;
  document.querySelectorAll('.okt .os').forEach(n => n.classList.toggle('on', +n.dataset.i === k));
  const L = lookupId(ui.id);
  const sents = L.p[ui.ver || verOf(ui.id)];
  updTool(sents);
  audio.prepare(sents[k]?.au).catch(() => {});
}

const verOf = id => { const s = st(id); return s.r >= ROUNDS || isOrig(s.r + 1) ? 'o' : 'ad'; };

// ---------------------------------------------------------------- alt araç çubuğu (odaktaki cümle)
let toolEls = null;
function toolbar(sents) {
  const b = (cls, label, aria, fn) => el('button.' + cls, { 'aria-label': aria, on: { click: fn } }, label);
  const prev = b('tb', svg(ICON.back), t('o.prev'), () => move(-1));
  const next = b('tb', svg(ICON.back, 'flip'), t('o.next'), () => move(1));
  const play = b('tb', t('o.tListen'), t('o.tListenA'), () => playSent());
  const all = b('tb', t('o.tAll'), t('o.tAllA'), () => (ui.playing ? stopPlay() : playAll()));
  const tr = b('tb', t('o.tTr'), t('o.tTrA'), () => toggle('tr'));
  const dec = b('tb', t('o.tDec'), t('o.tDecA'), () => toggle('dec'));
  toolEls = { prev, next, play, all, tr, dec };
  const bar = el('div.ok-tool', prev, play, all, next, tr, dec);
  updTool(sents);
  return bar;
}

function updTool(sents) {
  if (!toolEls) return;
  const x = sents[ui.focus];
  toolEls.prev.disabled = ui.focus === 0;
  toolEls.next.disabled = ui.focus >= sents.length - 1;
  toolEls.tr.setAttribute('aria-pressed', String(ui.tr.has(ui.focus)));
  toolEls.dec.setAttribute('aria-pressed', String(ui.dec.has(ui.focus)));
  toolEls.dec.disabled = !x?.st;
  toolEls.all.textContent = ui.playing ? t('o.tStop') : t('o.tAll');
}

function move(d) {
  const sents = lookupId(ui.id).p[ui.ver || verOf(ui.id)];
  const k = Math.max(0, Math.min(sents.length - 1, ui.focus + d));
  setFocus(k);
  const n = document.querySelector(`.okt .os[data-i="${k}"]`);
  n && n.scrollIntoView({ block: 'center', behavior: 'smooth' });
}

function toggle(which) {
  const set = ui[which];
  if (set.has(ui.focus)) set.delete(ui.focus); else set.add(ui.focus);
  rerender();
}

async function playSent() {
  stopPlay();
  const x = lookupId(ui.id).p[ui.ver || verOf(ui.id)][ui.focus];
  if (!x) return;
  mark(ui.focus, true);
  await audio.play(x.au, 1, x.ru);
  mark(ui.focus, false);
}

async function playAll() {
  const sents = lookupId(ui.id).p[ui.ver || verOf(ui.id)];
  ui.playing = true;
  const myId = ui.id;
  updTool(sents);
  for (let k = ui.focus; k < sents.length; k++) {
    if (!ui.playing || ui.id !== myId) break;
    setFocus(k);
    const n = document.querySelector(`.okt .os[data-i="${k}"]`);
    n && n.scrollIntoView({ block: 'center', behavior: 'smooth' });
    mark(k, true);
    audio.prepare(sents[k + 1]?.au).catch(() => {});
    await audio.play(sents[k].au, 1, sents[k].ru);
    mark(k, false);
  }
  ui.playing = false;
  updTool(sents);
}

function stopPlay() {
  if (ui.playing) { ui.playing = false; audio.stop(); }
  document.querySelectorAll('.okt .os.play').forEach(n => n.classList.remove('play'));
}
export const isReading = () => ui.playing;

function mark(k, on) {
  const n = document.querySelector(`.okt .os[data-i="${k}"]`);
  n && n.classList.toggle('play', on);
}

// ---------------------------------------------------------------- kelime kartı
function tapWord(w, k, x, p) {
  const lw = w.toLowerCase();
  setFocus(k);
  const L = lookupId(ui.id);
  const s = st(ui.id);
  const counting = !ui.done && s.r < ROUNDS && !(s.r > 0 && s.due > dayNum());
  rememberTap(lw);
  if (!ui.taps.has(lw)) {
    ui.taps.add(lw);
    document.querySelectorAll('.okt .w').forEach(n => { if (n.firstChild?.textContent?.toLowerCase() === lw) n.classList.add('t'); });
    const c = document.querySelector('.btn-big .mono');
    if (c && counting) c.textContent = t('o.unknownN', { n: ui.taps.size });
    ui.sentTaps[k] = (ui.sentTaps[k] || 0) + 1;
    if (ui.sentTaps[k] === SENT_EASE && !ui.dec.has(k) && !ui.tr.has(k)) {
      if (x.st) ui.dec.add(k); else ui.tr.add(k);
      ui.eased = k;
    }
  }
  wordSheet(w, lw, x, p, L.f);
}

function wordSheet(w, lw, x, p, f) {
  const tk = DATA.tok[lw] || {};
  const ctx = p.g[lw] || '';
  const lemma = tk.l || lw;
  const cid = 'p:yerel:' + lemma;
  const existing = findCard(lemma);
  const eased = ui.eased != null;
  modal(close => {
    const addBtn = el('button.btn.btn-accent', {
      disabled: !!existing,
      on: {
        click: async () => {
          const q = tk.tr || ctx.replace(/\s*\([^)]*[а-яё][^)]*\)/gi, '').trim() || tk.en || '';
          const card = { id: cid, t: 'kelime', q, a: [lemma], f: lemma, ex: [[x.ru, x.tr, x.au]], s: `${t('o.cardSrc')} · ${f.title}`, d: 0, au: tk.la || tk.au };
          if (await addLocalCard(card)) { toast(t('o.added', { w: lemma })); addBtn.disabled = true; addBtn.textContent = t('o.inDeckShort'); }
        },
      },
    }, existing ? t('o.inDeckShort') : t('o.addDeck'));
    return el('div.paper', { style: { display: 'flex', flexDirection: 'column', gap: '12px' } },
      el('div.lab', tagsLabel(tk.t) || ' '),
      el('div.exrow', el('div.ans.ru', { style: { flex: '1' } }, w), playBtn(tk.au)),
      lemma !== lw ? el('div.exrow', el('div.meta', { style: { flex: '1', alignSelf: 'center' } }, t('o.lemma') + ': ', el('span.ru', { style: { fontSize: '19px', color: 'var(--p-ink)' } }, lemma)), playBtn(tk.la)) : null,
      ctx || tk.tr ? el('div', { style: { fontSize: '18px' } }, ctx || tk.tr) : null,
      ctx && tk.tr && tk.tr !== ctx ? el('div.meta', t('o.general') + ': ', tk.tr) : null,
      !ctx && !tk.tr && tk.en ? el('div.meta', 'EN: ' + tk.en) : null,
      !ctx && !tk.tr && !tk.en ? el('div.meta', t('o.noGloss')) : null,
      existing ? el('div.meta', t('o.inDeck', { d: existing })) : null,
      eased && ui.eased === ui.focus ? el('div.meta', t('o.eased')) : null,
      el('div.grid2',
        el('button.btn', { on: { click: () => { close(); stopPlay(); lookup(lemma, lw); } } }, t('o.dict')),
        addBtn),
      el('button.btn', { on: { click: close } }, t('s.close')),
    );
  }, { onClose: () => { if (ui.eased != null) { ui.eased = null; rerender(); } } });
  audio.prepare(tk.au).catch(() => {});
}

function findCard(lemma) {
  const c = CARDS.get('p:yerel:' + lemma);
  if (c) return t('o.localDeck');
  for (const x of CARDS.values()) if (x.f === lemma || (x.a && x.a.includes(lemma))) return x.deck === 'kendi' ? t('o.ownDeck') : t('o.otherDeck');
  return null;
}

function playBtn(key, tone, small) {
  if (!key) return null;
  return el('button.pbtn.round' + (small ? '.sm' : '') + (tone === 'dark' ? '.dark' : ''), { 'aria-label': t('st.listen'), on: { click: e => { e.stopPropagation(); audio.play(key); } } }, svg(ICON.play));
}

// ---------------------------------------------------------------- tur bitişi
async function finish(id) {
  stopPlay();
  const d = dayNum();
  const s = P.p[id] || (P.p[id] = { r: 0, taps: [] });
  const n = ui.taps.size;
  s.r += 1;
  if (s.r === 1) s.first = d;
  s.last = d;
  s.taps = [...(s.taps || []), n];
  if (s.r < ROUNDS) {
    s.due = Math.max(d + 1, s.first + OFF[s.r]);
    if (n >= EASE) s.due = d + 1;
  } else s.due = null;
  P.cur = null;
  ui.explicit = false;
  P.log[d] = (P.log[d] || 0) + 1;
  await save();
  const L = lookupId(id);
  ui.done = { id, r: s.r, n, due: s.due, taps: s.taps, fileDone: fileDone(L.f) };
  bigStamp('ПРОЧИТАНО');
  if (ui.done.fileDone) setTimeout(() => bigStamp('РАССЕКРЕЧЕНО', 1400), 1200);
  rerender();
}

function doneBox(dn) {
  const q = today();
  return el('div.paper.ok-done',
    el('div.stamp.big', 'ПРОЧИТАНО'),
    el('div.ans.small', dn.r >= ROUNDS ? t('o.allRounds') : t('o.roundOk', { r: dn.r, n: ROUNDS })),
    el('div.meta', t('o.unknownTrend'), ' ', el('span.mono', dn.taps.join(' → '))),
    el('div.meta', dn.due != null ? t('o.nextRound', { d: dueText(dn.due) }) + (dn.n >= EASE ? ' ' + t('o.easeNote') : '') : t('o.paraDone')),
    dn.fileDone ? el('div.meta', t('o.fileDone')) : null,
    nextButtons(q));
}

function nextButtons(q) {
  const nxt = q.list.find(x => x !== ui.id) || null;
  const extra = !nxt && q.nextNew && q.nextNew !== ui.id ? q.nextNew : null;
  const target = nxt || extra;
  return el('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px' } },
    target ? el('button.btn.btn-primary.btn-wide', { on: { click: () => show(target) } },
      (nxt ? t('o.continue') : t('o.oneMore')) + ' · ' + label(target)) : null,
    el('button.btn.btn-wide', { on: { click: () => { stopPlay(); ui.done = null; ui.explicit = false; go('masa'); } } }, t('end.enough')));
}

function label(id) {
  const L = lookupId(id);
  return `${L.f.dosya} § ${L.i + 1}`;
}

function dueText(d) {
  const n = d - dayNum();
  if (n <= 0) return t('o.dToday');
  if (n === 1) return t('o.dTomorrow');
  return t('o.dIn', { n, d: fmtDay(d) });
}

// ---------------------------------------------------------------- dosyalar
function renderFiles(wrap, emptyToday) {
  const q = today();
  wrap.append(...[
    el('div.kicker', t('o.kicker')),
    el('h1.h1', t('o.filesTitle')),
    emptyToday ? el('div.panel', t('o.allDoneToday')) : null,
    q.list.length ? el('button.btn.btn-primary.btn-wide', { on: { click: () => show(currentId()) } },
      t('o.todayBtn', { n: q.list.length })) : (q.nextNew ? el('button.btn.btn-wide', { on: { click: () => show(q.nextNew) } }, t('o.oneMore') + ' · ' + label(q.nextNew)) : null),
    el('div.note', t('o.rule')),
    ...DATA.files.map(f => fileCard(f)),
    el('div.note', DATA.lisans),
  ].filter(Boolean));
}

function fileCard(f) {
  const done = fileDone(f);
  const d = dayNum();
  return el('div.paper.ok-file',
    done ? el('div.stamp.accent', 'РАССЕКРЕЧЕНО') : null,
    el('div.lab', `${f.dosya} · ${f.konu}`),
    el('div.ans.small.ru', f.title),
    el('div.meta', f.titleTr),
    el('div.ok-paras', ...f.paras.map((p, i) => {
      const id = pid(f, i), s = st(id);
      const dots = el('span.ok-dots', ...Array.from({ length: ROUNDS }, (_, k) => el('i' + (k < s.r ? '.on' : '') + (k >= 3 ? '.o' : ''))));
      const right = s.r >= ROUNDS ? t('o.pDone') : !s.r ? t('o.pNew') : s.due <= d ? t('o.pDue') : s.due - d === 1 ? t('o.dTomorrow') : t('o.dShort', { n: s.due - d });
      return el('button.ok-prow', { on: { click: () => show(id) } },
        el('span.n.mono', `§${i + 1}`),
        el('span.sn.ru', snippet(p.ad[0]?.ru || '')),
        el('span.rt', dots, el('span.mono', [(s.taps || []).join('→'), s.r < ROUNDS ? right : ''].filter(Boolean).join(' · '))));
    })),
    el('div.meta.small', t('o.src'), ' ', el('a', { href: f.url, target: '_blank', rel: 'noopener' }, '«' + f.src + '»'), ', ', t('o.srcLic')));
}

const snippet = s => (s.length > 34 ? s.slice(0, 33).replace(/\s+\S*$/, '') + '…' : s);



// ---------------------------------------------------------------- sözlük ve indirme için
// Okurken dokunulan kelimeler (lemma) — sözlüğün boş ekranında listelenir
function rememberTap(lw) {
  const l = DATA.tok[lw]?.l || lw;
  P.seen = P.seen || {};
  const x = P.seen[l] || (P.seen[l] = { n: 0 });
  x.n++; x.at = Date.now();
  save();
}
export async function tappedLemmas(n = 12) {
  await loadOkuma();
  const tr = {};
  for (const v of Object.values(DATA.tok)) if (v.l && !tr[v.l]) tr[v.l] = v.tr || v.en || '';
  return Object.entries(P.seen || {}).sort((a, b) => b[1].at - a[1].at).slice(0, n).map(([l, x]) => ({ l, n: x.n, tr: tr[l] || '' }));
}

export async function lemmaInfo(lemma) {
  await loadOkuma();
  const forms = Object.entries(DATA.tok).filter(([, v]) => v.l === lemma);
  if (!forms.length) return null;
  const set = new Set(forms.map(f => f[0]));
  const au = DATA.tok[lemma]?.au || forms.find(f => f[1].la)?.[1].la || null;
  const ex = [];
  for (const f of DATA.files) for (const p of f.paras) for (const s of [...p.ad, ...p.o]) {
    if ((s.ru.match(TOK) || []).some(w => set.has(w.toLowerCase()))) ex.push({ ru: s.ru, tr: s.tr, au: s.au });
  }
  ex.sort((a, b) => a.ru.length - b.ru.length);
  return { au, ex: ex.slice(0, 3) };
}

export async function okumaAudioKeys() {
  await loadOkuma();
  const keys = new Set();
  for (const f of DATA.files) for (const p of f.paras) {
    for (const s of [...p.ad, ...p.o]) keys.add(s.au);
    for (const w of p.pre) { keys.add(w.au); keys.add(w.exAu); }
  }
  for (const v of Object.values(DATA.tok)) { if (v.au) keys.add(v.au); if (v.la) keys.add(v.la); }
  return [...keys].filter(Boolean);
}
