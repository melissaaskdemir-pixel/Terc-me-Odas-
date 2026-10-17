// YDS: ÖSYM sınavları (kişisel paket), üretilmiş denemeler (çapa sorularıyla), bölüm turları, optik form, analiz.
import { el, svg, ICON, dayNum, fmtDay } from './util.js';
import { t } from './i18n.js';
import * as db from './db.js';
import { S } from './store.js';
import { modal, toast, confirmBox, bigStamp } from './ui.js';
import { go } from './main.js';
import { sfx } from './audio.js';

export const SECS = ['kelime', 'gramer', 'bosluk', 'cloze', 'tamamlama', 'ceviri', 'okuma', 'diyalog', 'anlam', 'paragraf', 'butunluk'];
const GEN_PLAN = { kelime: 1, gramer: 2, bosluk: 2, tamamlama: 2, ceviri: 1, okuma: 4, diyalog: 1, anlam: 1, paragraf: 1, butunluk: 1 };
const ORDER = ['kelime', 'gramer', 'bosluk', 'tamamlama', 'ceviri', 'okuma', 'diyalog', 'anlam', 'paragraf', 'butunluk'];
const HALF = { kelime: 3, gramer: 6, bosluk: 5, cloze: 5, tamamlama: 5, ceviri: 3, okuma: 8, diyalog: 3, anlam: 2, paragraf: 2, butunluk: 3 };
const LETTERS = 'ABCDE';

let GEN = null, OSYM = null, R = null, loadP = null;
const put = (w, ...xs) => w.append(...xs.filter(x => x != null && x !== false));
const ui = { view: 'home', run: null, i: 0, review: null, tick: null, cas: null, tool: null };

// ---------------------------------------------------------------- veri
export function loadYds(force) {
  if (!loadP || force) {
    loadP = Promise.all([
      fetch('data/yds/gen.json').then(r => r.json()).catch(() => ({ denemeler: [] })),
      db.all('packs'),
      db.get('kv', 'yds'),
    ]).then(([g, packs, r]) => {
      GEN = g;
      OSYM = null;
      for (const p of packs) if (p.yds) OSYM = p.yds;
      R = r || { runs: [], seen: {} };
      R.runs = R.runs || []; R.seen = R.seen || {};
      return true;
    });
  }
  return loadP;
}
const save = () => db.put('kv', R, 'yds');

// sınav kimliği: 'o:2014-1' (ÖSYM), 'g:d1' (üretilmiş + çapa)
function examList() {
  const out = [];
  for (const d of GEN?.denemeler || []) out.push({ id: 'g:' + d.id, ad: d.ad, kind: 'gen' });
  for (const e of OSYM?.exams || []) if (!e.anchor) out.push({ id: 'o:' + e.id, ad: 'ÖSYM ' + e.ad, kind: 'osym' });
  return out;
}

const rng = seed => { let s = 0; for (const c of String(seed)) s = (s * 31 + c.charCodeAt(0)) >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); };
function shuffle(a, r) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

// Sınavı soru listesine dönüştür: [{ q, p? }] ve parçalar
function buildExam(id) {
  const P = {};
  if (id.startsWith('o:')) {
    const e = OSYM.exams.find(x => x.id === id.slice(2));
    for (const p of e.p) P[p.id] = p;
    return { id, ad: 'ÖSYM ' + e.ad, items: e.q.map(q => ({ q })), P, anchorN: 0 };
  }
  const d = GEN.denemeler.find(x => 'g:' + x.id === id);
  const k = GEN.denemeler.indexOf(d);
  for (const p of d.p) P[p.id] = p;
  // çapa soruları: k. dilim
  const anc = {};
  if (OSYM?.anchors) {
    const by = {};
    for (const a of OSYM.anchors) (by[a.s] = by[a.s] || []).push(a);
    for (const [s, n] of Object.entries(GEN_PLAN)) {
      if (s === 'okuma') {
        const groups = [];
        for (const a of by.okuma || []) { let g = groups.find(x => x.p === a.p); if (!g) groups.push(g = { p: a.p, q: [] }); g.q.push(a); }
        const g = groups[k];
        if (g) {
          anc.okuma = g.q;
          const ex = OSYM.exams.find(e => e.p.some(p => p.id === g.p));
          P[g.p] = ex.p.find(p => p.id === g.p);
        }
      } else anc[s] = (by[s] || []).slice(k * n, k * n + n);
    }
  }
  const r = rng(id);
  const items = [];
  let anchorN = 0;
  for (const s of ORDER) {
    const gq = d.q.filter(q => q.s === s);
    const aq = anc[s] || [];
    anchorN += aq.length;
    if (s === 'okuma') {
      const groups = [];
      for (const q of [...gq, ...aq]) { let g = groups.find(x => x.p === q.p); if (!g) groups.push(g = { p: q.p, q: [] }); g.q.push(q); }
      for (const g of shuffle(groups, r)) for (const q of g.q) items.push({ q, anchor: aq.includes(q) });
    } else {
      for (const q of shuffle([...gq, ...aq], r)) items.push({ q, anchor: aq.includes(q) });
    }
  }
  return { id, ad: d.ad, items, P, anchorN };
}

function halfOf(exam) {
  const items = [];
  const cnt = {};
  let lastP = null, takeP = 0;
  for (const it of exam.items) {
    const s = it.q.s;
    if (s === 'okuma' || it.q.p && s === 'cloze') {
      if (it.q.p !== lastP) { lastP = it.q.p; takeP = (cnt[s] || 0) < HALF[s]; }
      if (takeP) { items.push(it); cnt[s] = (cnt[s] || 0) + 1; }
      continue;
    }
    if ((cnt[s] || 0) < (HALF[s] ?? 0)) { items.push(it); cnt[s] = (cnt[s] || 0) + 1; }
  }
  return { ...exam, items, half: true };
}

// ---------------------------------------------------------------- puan
export function scoreOf(run, exam) {
  let c = 0, w = 0, b = 0, ac = 0, an = 0;
  const bySec = {};
  exam.items.forEach((it, i) => {
    const s = it.q.s === 'cloze' ? 'bosluk' : it.q.s;
    const x = bySec[s] || (bySec[s] = { c: 0, n: 0 });
    x.n++;
    const v = run.ans[i];
    if (v == null) b++;
    else if (v === it.q.a) { c++; x.c++; if (it.anchor) ac++; }
    else w++;
    if (it.anchor) an++;
  });
  const n = exam.items.length;
  return { c, w, b, n, score: Math.round(100 * c / n * 100) / 100, bySec, anchor: an ? { c: ac, n: an } : null };
}

export async function ydsEstimate() {
  await loadYds();
  const done = R.runs.filter(r => r.done && !r.practice).slice(-3);
  if (!done.length) return null;
  return { score: Math.round(done.reduce((a, r) => a + r.res.score, 0) / done.length * 100) / 100, n: done.length, last: done[done.length - 1] };
}

// ---------------------------------------------------------------- ekranlar
export function isExamOpen() { return ui.view === 'exam' || ui.view === 'casual'; }

export function renderYds(root) {
  stopTick();
  const wrap = el('div.wrap');
  root.append(wrap);
  loadYds().then(() => {
    if (!wrap.isConnected) return;
    if (ui.view === 'exam' && ui.run) return renderExam(root, wrap);
    if (ui.view === 'result' && ui.run) return renderResult(wrap);
    if (ui.view === 'review' && ui.run) return renderReview(root, wrap);
    if (ui.view === 'casual' && ui.cas) return renderCasual(root, wrap);
    renderHome(wrap);
  }).catch(e => { console.error(e); put(wrap, el('div.panel', t('err.load'))); });
}

function nav(view) { ui.view = view; go('yds', view === 'home'); }

function casualBox() {
  const secs = new Set(R.casSecs || []);
  const day = casDay();
  const { pool } = casualPool();
  const chips = el('div.chips', ...ORDER.map(sc => el('button.chip', {
    'aria-pressed': String(secs.has(sc)),
    on: { click: e => { secs.has(sc) ? secs.delete(sc) : secs.add(sc); R.casSecs = [...secs]; save(); e.currentTarget.setAttribute('aria-pressed', String(secs.has(sc))); count.textContent = t('y.poolN', { n: casualPool().pool.length }); } },
  }, t('ys.' + sc))));
  const count = el('span', t('y.poolN', { n: pool.length }));
  return el('section.panel.sect',
    el('div.topline', el('h2.h2', t('y.casual')), el('span.kicker', t('y.casToday', { n: day.n, ok: day.ok }))),
    el('div.note', t('y.casualNote')),
    el('div.kicker', t('y.casSecs')), chips,
    el('div.note', count),
    el('button.btn.btn-primary.btn-wide', { on: { click: () => startCasual() } }, t('y.casStart')));
}

function renderHome(wrap) {
  document.body.classList.remove('studying');
  if (ui.tool) setTool(null);
  const list = examList();
  const cur = R.runs.find(r => !r.done && !r.practice);
  const runsOf = id => R.runs.filter(r => r.exam === id && r.done && !r.practice);
  const est = R.runs.filter(r => r.done && !r.practice).slice(-3);
  const avg = est.length ? est.reduce((a, r) => a + r.res.score, 0) / est.length : null;
  const opts = { size: S.prof.ydsSize || 'full', mode: S.prof.ydsMode || 'real' };

  const examRow = e => {
    const rs = runsOf(e.id);
    const last = rs[rs.length - 1];
    return el('button.res.yds-ex', { on: { click: () => startExam(e.id, opts) } },
      el('span', el('span.ru', e.ad), e.kind === 'gen' ? el('span.slot', ' · ' + t('y.genTag')) : null),
      el('span.tr', last ? t('y.lastScore', { s: fmtScore(last.res.score), d: fmtDay(last.day) }) : t('y.notTaken')));
  };
  put(wrap, 
    el('div.topline', el('button.linkbtn', { on: { click: () => go('calis') } }, '‹ ' + t('tab.calis')), null),
    el('div.kicker', t('y.kicker')),
    el('h1.h1', t('y.title')),
    el('div.panel', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' } },
      el('div', el('div.kicker', t('m.yds')), el('div.note', avg != null ? t('y.estNote', { n: est.length }) : t('y.estNone'))),
      el('div.mono', { style: { fontSize: '28px' } }, avg != null ? fmtScore(avg) : String(S.settings.ydsBase).replace('.', ','))),
    cur ? el('button.btn.btn-primary.btn-big', { on: { click: () => resume(cur) } },
      el('span', t('y.resume')), el('span.mono', `${Object.keys(cur.ans).length}/${cur.n}`)) : null,
    cur ? el('div.note', { style: { marginTop: '-10px' } }, cur.examAd + (cur.half ? ' · ' + t('y.half') : '') + ' · ' + (cur.mode === 'real' ? t('y.real') : t('y.split')) + ' · ' + t('y.left', { t: fmtTime(remaining(cur)) })) : null,
    casualBox(),
    el('div.kicker', t('y.settings')),
    el('div.setrow', el('div.lbl', el('span', t('y.size')), el('small', t('y.sizeSub'))),
      seg([['full', t('y.full')], ['half', t('y.half')]], opts.size, v => { S.prof.ydsSize = v; opts.size = v; })),
    el('div.setrow', el('div.lbl', el('span', t('y.mode')), el('small', opts.mode === 'real' ? t('y.realSub') : t('y.splitSub'))),
      seg([['real', t('y.real')], ['split', t('y.split')]], opts.mode, v => { S.prof.ydsMode = v; opts.mode = v; nav('home'); })),
    el('div.kicker', t('y.exams')),
    !OSYM ? el('div.warn', el('span.t', t('y.noPack'))) : null,
    el('div.list', ...list.map(examRow)),
    el('div.note', t('y.anchorNote')),

    R.runs.some(r => r.done && !r.practice) ? el('div.kicker', t('y.history')) : null,
    el('div.list', ...R.runs.filter(r => r.done && !r.practice).slice(-10).reverse().map(r =>
      el('button.res', { on: { click: () => { ui.run = r; nav('result'); } } },
        el('span', el('span.ru', r.examAd), el('span.slot', ' · ' + (r.half ? t('y.half') : t('y.full')))),
        el('span.tr', `${fmtScore(r.res.score)} · ${r.res.c}/${r.res.n} · ${fmtDay(r.day)}`)))),
  );
}

const fmtScore = s => (Math.round(s * 100) / 100).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function seg(options, value, onChange) {
  const w = el('div.seg', { role: 'group' });
  for (const [v, lab] of options) {
    const b = el('button', { 'aria-pressed': String(v === value) }, lab);
    b.addEventListener('click', () => { w.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', 'false')); b.setAttribute('aria-pressed', 'true'); onChange(v); });
    w.append(b);
  }
  return w;
}

// ---------------------------------------------------------------- sınav akışı
let EXAM = null; // çalışan sınavın soru listesi (bellekte)

function examFor(run) {
  let ex = buildExam(run.exam);
  if (run.half) ex = halfOf(ex);
  return ex;
}

async function startExam(id, opts) {
  const open = R.runs.find(r => !r.done && !r.practice);
  if (open && !(await confirmBox(t('y.replaceQ', { a: open.examAd }), t('y.replaceYes'), t('a.cancel')))) return;
  if (open) R.runs = R.runs.filter(r => r !== open);
  let ex = buildExam(id);
  if (opts.size === 'half') ex = halfOf(ex);
  const run = { id: Date.now().toString(36), exam: id, examAd: ex.ad, half: opts.size === 'half', mode: opts.mode, n: ex.items.length,
    limit: Math.round(180 * 60 * ex.items.length / 80), started: Date.now(), used: 0, ans: {}, flags: [], done: false, day: dayNum() };
  R.runs.push(run);
  await save();
  EXAM = ex;
  ui.run = run; ui.i = 0;
  nav('exam');
}

function resume(run) {
  EXAM = examFor(run);
  ui.run = run; ui.i = run.pos || 0;
  nav('exam');
}

function remaining(run) {
  const used = run.mode === 'real' ? (Date.now() - run.started) / 1000 : run.used + (run._since ? (Date.now() - run._since) / 1000 : 0);
  return Math.max(0, run.limit - used);
}
const fmtTime = s => { s = Math.floor(s); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60; return `${h}:${String(m).padStart(2, '0')}:${String(x).padStart(2, '0')}`; };

function stopTick() {
  if (ui.tick) { clearInterval(ui.tick); ui.tick = null; }
  const r = ui.run;
  if (r && r.mode === 'split' && r._since) { r.used += (Date.now() - r._since) / 1000; r._since = null; save(); }
}

function renderExam(root, wrap) {
  const run = ui.run;
  if (!EXAM || EXAM.id !== run.exam || !!EXAM.half !== !!run.half) EXAM = examFor(run);
  const ex = EXAM;
  if (ui.tick) { clearInterval(ui.tick); ui.tick = null; }
  if (run.mode === 'split' && !run._since && document.visibilityState === 'visible') run._since = Date.now();
  document.body.classList.add('studying');
  root.innerHTML = '';
  const n = ex.items.length;
  const i = Math.max(0, Math.min(n - 1, ui.i));
  run.pos = i;
  const it = ex.items[i];
  const q = it.q;
  const timer = el('span.mono.yds-timer');
  const updTimer = () => {
    const rem = remaining(run);
    timer.textContent = fmtTime(rem);
    timer.classList.toggle('low', rem < 600);
    if (rem <= 0 && run.mode === 'real') { stopTick(); finish(true); }
  };
  updTimer();
  ui.tick = setInterval(updTimer, 1000);

  const secName = t('ys.' + q.s);
  const range = secRange(ex, i);
  const passage = q.p && ex.P[q.p] ? passageNode(ex.P[q.p], q, run) : null;
  const rerender = () => renderExam(root, wrap);
  const pick = (k, strikeOnly) => {
    if (strikeOnly) { if ((run.strike?.[q.id] || []).includes(run.ans[i])) delete run.ans[i]; save(); return rerender(); }
    if (run.ans[i] === k) delete run.ans[i]; else run.ans[i] = k;
    sfx('paper'); save(); rerender();
  };
  const flagged = run.flags.includes(i);
  const frame = el('div.study.yds',
    el('div.st-top',
      el('button.iconbtn', { 'aria-label': t('y.pause'), on: { click: () => leaveExam() } }, svg(ICON.x)),
      el('div.yds-head', el('span.mono', `${i + 1}/${n}`), el('span.kicker', `${secName} · ${range}`)),
      timer,
      el('button.btn.btn-sm.yds-optik', { on: { click: () => optik() } }, t('y.optik'))),
    el('div.yds-body',
      passage,
      el('div.paper.yds-q',
        el('div.lab', `${t('y.q')} ${i + 1}` + (flagged ? ' · ' + t('y.flagged') : '')),
        q.t ? el('div.yds-stem' + (q.s === 'ceviri' && !/[а-яё]/i.test(q.t) ? '' : '.ru') + (q.s === 'diyalog' ? '.dlg' : ''), stemNode(q, run)) : null,
        el('div.yds-opts', ...q.o.map((_, k) => optionNode(q, k, run, { selected: run.ans[i] === k, onPick: pick }))))),
    toolsBar(() => { clearMarks(run, q, ex.P); rerender(); }),
    el('div.yds-nav',
      el('button.btn', { disabled: i === 0, on: { click: () => { ui.i = i - 1; rerender(); } } }, '‹'),
      el('button.btn' + (flagged ? '.btn-accent' : ''), { on: { click: () => { run.flags = flagged ? run.flags.filter(x => x !== i) : [...run.flags, i]; save(); rerender(); } } }, svg(ICON.flag), t('y.flag')),
      i < n - 1 ? el('button.btn.btn-primary', { on: { click: () => { ui.i = i + 1; rerender(); } } }, '›')
        : el('button.btn.btn-ok', { on: { click: () => optik() } }, t('y.finishShort'))),
  );
  bindMarking(frame, run);
  root.append(frame);
  const body = frame.querySelector('.yds-body');
  if (body && ui._lastI !== i) { body.scrollTop = 0; }
  else if (body && ui._scroll != null) body.scrollTop = ui._scroll;
  body && body.addEventListener('scroll', () => { ui._scroll = body.scrollTop; });
  ui._lastI = i;
}

// ---------------------------------------------------------------- kalem ve silgi
// Metin kelime kelime işaretlenir (alt çizgi). İşaretler bağlama (deneme ya da serbest çözüm) yazılır:
// ctx.marks = { 'q:<soru>' | 'p:<parça>': [kelime sırası…] }, ctx.strike = { <soru>: [şık…] } (elenen şıklar)
const PEN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M4 20l1.2-4.6L16 4.6a2 2 0 0 1 2.8 0l.6.6a2 2 0 0 1 0 2.8L8.6 18.8 4 20zM14 6.6l3.4 3.4"/></svg>';
const ERASER = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M7 20h13M5.4 14.6l8.5-8.5a2 2 0 0 1 2.8 0l2.2 2.2a2 2 0 0 1 0 2.8L12 18.2a2 2 0 0 1-1.4.6H8.3a2 2 0 0 1-1.4-.6l-1.5-1.5a2 2 0 0 1 0-2.1zM9.5 10.5l5 5"/></svg>';

function markText(text, key, ctx, { cur } = {}) {
  const box = el('span.mk', { 'data-key': key });
  const set = new Set((ctx && ctx.marks && ctx.marks[key]) || []);
  let k = 0;
  for (const m of text.matchAll(/\(\d{1,2}\)----|----|\s+|[^\s]+/g)) {
    const tok = m[0];
    if (tok === '----') box.append(el('span.yds-gap', '   '));
    else if (/^\(\d{1,2}\)----$/.test(tok)) { const n = +tok.slice(1, -5); box.append(el('span.yds-gap' + (n === cur ? '.cur' : ''), `(${n})`)); }
    else if (/^\s+$/.test(tok)) box.append(k > 0 && !tok.includes('\n') ? el('span.sp' + (set.has(k - 1) && set.has(k) ? '.u' : ''), { 'data-a': k - 1 }, tok) : tok);
    else { box.append(el('span.w' + (set.has(k) ? '.u' : ''), { 'data-k': k }, tok)); k++; }
  }
  return box;
}

function stemNode(q, ctx) { return markText(q.t, 'q:' + q.id, ctx); }

function passageNode(p, q, ctx) {
  const key = 'yds-pas-open';
  let open = true;
  try { open = localStorage.getItem(key) !== '0'; } catch (e) {}
  const body = el('div.yds-ptext.ru', markText(p.t, 'p:' + p.id, ctx, { cur: q.n }));
  const box = el('details.paper.yds-pas', { open }, el('summary.lab', t('y.passage')), body);
  box.addEventListener('toggle', () => { try { localStorage.setItem(key, box.open ? '1' : '0'); } catch (e) {} });
  return box;
}

const endsSentence = w => /[.!?…]["»”)]*$/.test(w);
function setTool(tool, bar) {
  ui.tool = ui.tool === tool ? null : tool;
  document.body.classList.toggle('tool-on', !!ui.tool);
  if (bar) bar.querySelectorAll('[data-tool]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.tool === ui.tool)));
  const hint = bar && bar.querySelector('.yds-thint');
  if (hint) hint.textContent = ui.tool === 'pen' ? t('y.penHint') : ui.tool === 'eraser' ? t('y.eraserHint') : '';
}

function toolsBar(onClear) {
  const bar = el('div.yds-tools',
    el('button.tb', { 'data-tool': 'pen', 'aria-pressed': String(ui.tool === 'pen'), 'aria-label': t('y.pen'), on: { click: () => setTool('pen', bar) } }, svg(PEN), el('span', t('y.pen'))),
    el('button.tb', { 'data-tool': 'eraser', 'aria-pressed': String(ui.tool === 'eraser'), 'aria-label': t('y.eraser'), on: { click: () => setTool('eraser', bar) } }, svg(ERASER), el('span', t('y.eraser'))),
    el('button.tb', { 'aria-label': t('y.clear'), on: { click: onClear } }, el('span', t('y.clear'))),
    el('span.yds-thint', ui.tool === 'pen' ? t('y.penHint') : ui.tool === 'eraser' ? t('y.eraserHint') : ''));
  return bar;
}

// Kalem/silgi işaretçi olayları: sürükleyince aradaki kelimeler, çift dokununca bütün cümle
function bindMarking(root, ctx) {
  root.addEventListener('pointerdown', e => {
    if (!ui.tool) return;
    const w = e.target.closest('.mk .w');
    if (!w) return;
    const mk = w.closest('.mk');
    const key = mk.dataset.key;
    const words = [...mk.querySelectorAll('.w')];
    ctx.marks = ctx.marks || {};
    const base = new Set(ctx.marks[key] || []);
    const add = ui.tool === 'pen';
    const start = +w.dataset.k;
    const paint = (lo, hi) => {
      const next = new Set(base);
      for (let i = Math.min(lo, hi); i <= Math.max(lo, hi); i++) { if (add) next.add(i); else next.delete(i); }
      words.forEach((x, i) => x.classList.toggle('u', next.has(i)));
      mk.querySelectorAll('.sp').forEach(sp => sp.classList.toggle('u', next.has(+sp.dataset.a) && next.has(+sp.dataset.a + 1)));
      ctx.marks[key] = [...next].sort((a, b) => a - b);
    };
    const now = Date.now();
    const lt = ui._tap;
    if (lt && lt.key === key && Math.abs(lt.k - start) <= 1 && now - lt.t < 380) {
      let lo = start, hi = start;
      while (lo > 0 && !endsSentence(words[lo - 1].textContent)) lo--;
      while (hi < words.length - 1 && !endsSentence(words[hi].textContent)) hi++;
      paint(lo, hi);
      ui._tap = null;
      save();
      return;
    }
    paint(start, start);
    let moved = false;
    const mv = ev => {
      const t2 = document.elementFromPoint(ev.clientX, ev.clientY);
      const w2 = t2 && t2.closest && t2.closest('.w');
      if (w2 && w2.parentElement === mk) { moved = moved || +w2.dataset.k !== start; paint(start, +w2.dataset.k); }
    };
    const up = () => {
      root.removeEventListener('pointermove', mv);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      ui._tap = moved ? null : { key, k: start, t: now };
      save();
    };
    root.addEventListener('pointermove', mv);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  });
}

function clearMarks(ctx, q, P) {
  if (!ctx.marks) return;
  delete ctx.marks['q:' + q.id];
  if (q.p && P[q.p]) delete ctx.marks['p:' + q.p];
  if (ctx.strike) delete ctx.strike[q.id];
  save();
}

// Şık: kalem/silgi açıkken dokunmak şıkkı eler (üstünü çizer), kapalıyken seçer
function optionNode(q, k, ctx, { selected, onPick, state } = {}) {
  const struck = (ctx?.strike?.[q.id] || []).includes(k);
  const o = q.o[k];
  const cls = 'button.yds-opt' + (selected ? '.on' : '') + (struck ? '.x' : '') + (state === 'ok' ? '.ok' : state === 'bad' ? '.bad' : '');
  return el(cls, {
    on: {
      click: () => {
        if (ui.tool && ctx && !state) {
          ctx.strike = ctx.strike || {};
          const s2 = new Set(ctx.strike[q.id] || []);
          if (ui.tool === 'pen') s2.add(k); else s2.delete(k);
          ctx.strike[q.id] = [...s2];
          save();
          onPick && onPick(null, true);
          return;
        }
        onPick && onPick(k);
      },
    },
  }, el('span.l.mono', LETTERS[k] + ')'), el('span.tx' + (/[а-яё]/i.test(o) ? '.ru' : ''), o));
}

function secRange(ex, i) {
  const s = ex.items[i].q.s;
  let a = i, b = i;
  while (a > 0 && ex.items[a - 1].q.s === s) a--;
  while (b < ex.items.length - 1 && ex.items[b + 1].q.s === s) b++;
  return `${a + 1}–${b + 1}`;
}

function leaveExam() {
  stopTick();
  if (ui.tool) setTool(null);
  document.body.classList.remove('studying');
  if (ui.run.mode === 'real') toast(t('y.realLeave'), 3500);
  nav('home');
}

function optik() {
  const run = ui.run, ex = EXAM;
  const answered = Object.keys(run.ans).length;
  modal(close => {
    const grid = el('div.optik');
    ex.items.forEach((it, i) => {
      const row = el('button.optik-row' + (run.flags.includes(i) ? '.fl' : '') + (i === ui.i ? '.cur' : ''), { on: { click: () => { close(); ui.i = i; renderExamAgain(); } } },
        el('span.mono.n', String(i + 1)),
        ...[0, 1, 2, 3, 4].map(k => el('i' + (run.ans[i] === k ? '.on' : ''), LETTERS[k])));
      grid.append(row);
    });
    return el('div', { style: { display: 'flex', flexDirection: 'column', gap: '12px' } },
      el('div.topline', el('span.kicker', t('y.optikTitle')), el('span.mono.muted', `${answered}/${ex.items.length}`)),
      el('div.note', t('y.optikNote')),
      grid,
      el('div.grid2',
        el('button.btn', { on: { click: close } }, t('s.close')),
        el('button.btn.btn-ok', { on: { click: async () => {
          const blank = ex.items.length - answered;
          if (await confirmBox(blank ? t('y.finishBlank', { n: blank }) : t('y.finishQ'), t('y.finish'), t('a.cancel'))) { close(); finish(false); }
        } } }, t('y.finish'))));
  });
}
function renderExamAgain() { go('yds', true); }

async function finish(timeUp) {
  stopTick();
  const run = ui.run, ex = EXAM;
  run.done = true;
  run.finishedAt = Date.now();
  run.usedSec = run.mode === 'real' ? Math.min(run.limit, (Date.now() - run.started) / 1000) : run.used;
  run.res = scoreOf(run, ex);
  run.day = dayNum();
  for (const it of ex.items) R.seen[it.q.id] = (R.seen[it.q.id] || 0) + 1;
  await save();
  document.body.classList.remove('studying');
  if (timeUp) toast(t('y.timeUp'), 4000);
  bigStamp('ПРОВЕРЕНО');
  nav('result');
}

function renderResult(wrap) {
  document.body.classList.remove('studying');
  const run = ui.run;
  const ex = examFor(run);
  const r = run.res || scoreOf(run, ex);
  const bars = Object.entries(r.bySec).sort((a, b) => SECS.indexOf(a[0]) - SECS.indexOf(b[0])).map(([s, x]) =>
    el('div.yds-bar', el('span.k', t('ys.' + s)), el('span.b', el('i', { style: { width: (100 * x.c / x.n) + '%' } })), el('span.mono.v', `${x.c}/${x.n}`)));
  put(wrap, 
    el('div.topline', el('button.linkbtn', { on: { click: () => nav('home') } }, '‹ ' + t('y.title')), null),
    el('div.kicker', t('y.resKicker')),
    el('h1.h1', run.examAd + (run.half ? ' · ' + t('y.half') : '')),
    el('div.paper.okp',
      el('div.yds-score', el('span.mono', fmtScore(r.score)), el('span.lab', t('y.points'))),
      el('div.meta', t('y.cwb', { c: r.c, w: r.w, b: r.b, n: r.n })),
      r.anchor ? el('div.meta', t('y.anchorRes', { c: r.anchor.c, n: r.anchor.n, p: Math.round(100 * r.anchor.c / r.anchor.n) })) : null,
      el('div.meta', t('y.timeUsed', { m: Math.round((run.usedSec || 0) / 60), l: Math.round(run.limit / 60) })),
      el('div.yds-bars', ...bars),
      el('div.meta.small', t('y.scoreNote'))),
    el('button.btn.btn-primary.btn-wide', { on: { click: () => { ui.review = { only: 'wrong', i: 0 }; nav('review'); } } }, t('y.reviewWrong', { n: r.w + r.b })),
    el('button.btn.btn-wide', { on: { click: () => { ui.review = { only: 'all', i: 0 }; nav('review'); } } }, t('y.reviewAll')),
  );
}

function renderReview(root, wrap) {
  const run = ui.run;
  const ex = examFor(run);
  const idx = ex.items.map((_, i) => i).filter(i => ui.review.only === 'all' || run.ans[i] !== ex.items[i].q.a);
  if (!idx.length) { put(wrap, el('div.panel', t('y.noWrong')), el('button.btn', { on: { click: () => nav('result') } }, t('y.back'))); return; }
  const k = Math.max(0, Math.min(idx.length - 1, ui.review.i));
  const i = idx[k];
  const it = ex.items[i], q = it.q;
  const mine = run.ans[i];
  put(wrap, 
    el('div.topline', el('button.linkbtn', { on: { click: () => nav('result') } }, '‹ ' + t('y.resKicker')), el('span.mono.muted', `${k + 1}/${idx.length}`)),
    el('div.kicker', `${t('ys.' + q.s)} · ${t('y.q')} ${i + 1}` + (it.anchor ? ' · ' + t('y.anchorTag') : '')),
    q.p && ex.P[q.p] ? passageNode(ex.P[q.p], q, run) : null,
    el('div.paper.yds-q',
      q.t ? el('div.yds-stem' + (q.s === 'diyalog' ? '.dlg' : '') + (/[а-яё]/i.test(q.t) ? '.ru' : ''), stemNode(q, run)) : null,
      el('div.yds-opts.ro', ...q.o.map((_, j) => optionNode(q, j, run, { state: j === q.a ? 'ok' : j === mine ? 'bad' : 'none' }))),
      el('div.meta', mine == null ? t('y.blank') : mine === q.a ? t('y.right') : t('y.wrongWas', { a: LETTERS[mine], b: LETTERS[q.a] })),
      q.x ? el('div.yds-x', q.x) : el('div.meta.small', t(isOsym(q) ? 'y.noExplPack' : 'y.noExpl'))),
    el('div.grid2',
      el('button.btn', { disabled: k === 0, on: { click: () => { ui.review.i = k - 1; go('yds', false); } } }, t('y.prev')),
      k < idx.length - 1 ? el('button.btn.btn-primary', { on: { click: () => { ui.review.i = k + 1; go('yds', false); } } }, t('y.next'))
        : el('button.btn.btn-primary', { on: { click: () => nav('result') } }, t('y.done'))),
  );
}

// ---------------------------------------------------------------- serbest çözüm (süresiz, anında geri bildirim)
// Havuz: ÖSYM kitapçıkları (çapa sınavları hariç), 2026 örneği ve alıştırma bankası. Deneme soruları hiç girmez.
function casualPool() {
  const pool = [], P = {}, ids = new Set();
  const secs = R.casSecs && R.casSecs.length ? new Set(R.casSecs) : null;
  const add = q => { if ((!secs || secs.has(q.s === 'cloze' ? 'bosluk' : q.s)) && !ids.has(q.id)) { ids.add(q.id); pool.push(q); } };
  for (const e of OSYM?.exams || []) if (!e.anchor) { for (const p of e.p) P[p.id] = p; e.q.forEach(add); }
  (OSYM?.ornek || []).forEach(add);
  for (const p of GEN?.banka?.p || []) P[p.id] = p;
  (GEN?.banka?.q || []).forEach(add);
  return { pool, P };
}

function nextCasual() {
  const c = ui.cas;
  if (c.queue.length) { c.q = c.queue.shift(); c.ans = null; return true; }
  const { pool, P } = casualPool();
  c.P = P;
  if (!pool.length) return false;
  const seen = q => R.seen[q.id] || 0;
  const min = Math.min(...pool.map(seen));
  const fresh = pool.filter(q => seen(q) === min && q.id !== c.q?.id);
  const pickQ = (fresh.length ? fresh : pool)[Math.floor(Math.random() * (fresh.length || pool.length))];
  if (pickQ.p) {
    // parçalı sorular: parçanın bütün soruları sırayla
    const group = pool.filter(q => q.p === pickQ.p).sort((a, b) => a.n - b.n);
    c.q = group[0];
    c.queue = group.slice(1);
  } else { c.q = pickQ; c.queue = []; }
  c.ans = null;
  return true;
}

function startCasual() {
  ui.cas = { q: null, queue: [], ans: null, P: {}, n: 0, ok: 0 };
  if (!nextCasual()) { toast(t('y.poolEmpty')); ui.cas = null; return; }
  nav('casual');
}

function casDay() {
  const d = dayNum();
  if (!R.cas || R.cas.day !== d) R.cas = { day: d, n: 0, ok: 0 };
  return R.cas;
}

function renderCasual(root, wrap) {
  const c = ui.cas;
  const q = c.q;
  const ctx = (R.cmarks = R.cmarks || {});
  document.body.classList.add('studying');
  root.innerHTML = '';
  const answered = c.ans != null;
  const day = casDay();
  const rerender = () => renderCasual(root, wrap);
  const pick = async (k, strikeOnly) => {
    if (strikeOnly) return rerender();
    if (answered) return;
    c.ans = k;
    day.n++; c.n++;
    if (k === q.a) { day.ok++; c.ok++; sfx('stamp'); } else sfx('soft');
    R.seen[q.id] = (R.seen[q.id] || 0) + 1;
    await save();
    ui._showFb = true;
    rerender();
  };
  const reveal = () => { if (answered) return; c.ans = -1; R.seen[q.id] = (R.seen[q.id] || 0) + 1; save(); ui._showFb = true; rerender(); };
  const frame = el('div.study.yds',
    el('div.st-top',
      el('button.iconbtn', { 'aria-label': t('k.quit'), on: { click: () => { document.body.classList.remove('studying'); ui.cas = null; setTool(null); nav('home'); } } }, svg(ICON.x)),
      el('div.yds-head', el('span.mono', t('y.casualTitle')), el('span.kicker', `${t('ys.' + (q.s === 'cloze' ? 'cloze' : q.s))} · ${srcLabel(q.id)}`)),
      el('span.mono.yds-timer', { title: t('y.casToday', { n: day.n, ok: day.ok }) }, t('y.casTodayShort', { n: day.n, ok: day.ok }))),
    el('div.yds-body',
      q.p && c.P[q.p] ? passageNode(c.P[q.p], q, ctx) : null,
      el('div.paper.yds-q',
        q.t ? el('div.yds-stem' + (q.s === 'diyalog' ? '.dlg' : '') + (/[а-яё]/i.test(q.t) ? '.ru' : ''), stemNode(q, ctx)) : null,
        el('div.yds-opts', ...q.o.map((_, k) => optionNode(q, k, ctx, answered
          ? { state: k === q.a ? 'ok' : k === c.ans ? 'bad' : 'none' }
          : { onPick: pick }))),
        answered ? el('div.meta', c.ans === -1 ? t('y.shown', { b: LETTERS[q.a] }) : c.ans === q.a ? t('y.right') : t('y.wrongWas', { a: LETTERS[c.ans], b: LETTERS[q.a] })) : null,
        answered && q.x ? el('div.yds-x', q.x) : null,
        answered && !q.x ? el('div.meta.small', t(isOsym(q) ? 'y.noExplPack' : 'y.noExpl')) : null)),
    toolsBar(() => { clearMarks(ctx, q, c.P); rerender(); }),
    el('div.yds-nav.two',
      answered ? el('span') : el('button.btn', { on: { click: reveal } }, t('y.reveal')),
      answered || c.queue.length === 0 ? el('button.btn.btn-primary', { on: { click: () => { if (!nextCasual()) { toast(t('y.poolEmpty')); return; } ui._lastI = null; rerender(); } } }, answered ? t('y.next') : t('y.skip'))
        : el('button.btn.btn-primary', { on: { click: () => { nextCasual(); rerender(); } } }, t('y.skip'))),
  );
  bindMarking(frame, ctx);
  root.append(frame);
  const body = frame.querySelector('.yds-body');
  if (body && ui._casQ === q.id && ui._scroll != null) body.scrollTop = ui._scroll;
  body && body.addEventListener('scroll', () => { ui._scroll = body.scrollTop; });
  if (ui._casQ !== q.id) ui._scroll = 0;
  ui._casQ = q.id;
  if (ui._showFb) { ui._showFb = false; const fb = frame.querySelector('.yds-q .meta'); fb && requestAnimationFrame(() => fb.scrollIntoView({ block: 'center', behavior: 'smooth' })); }
}

const isOsym = q => /^20\d\d-/.test(q.id);
const srcLabel = id => {
  const [a] = id.split(':');
  if (a === 'b') return t('y.bankTag');
  if (a.startsWith('d')) return t('y.genTag');
  if (a === '2026-ornek') return 'ÖSYM 2026 örnek';
  return 'ÖSYM ' + a.replace('-1', ' İlkbahar').replace('-2', ' Sonbahar').replace('2019 İlkbahar', '2019');
};

export function openYds() { ui.view = 'home'; go('yds'); }

// bölünebilir modda uygulama arka plandayken süre işlemez
document.addEventListener('visibilitychange', () => {
  const r = ui.run;
  if (!r || ui.view !== 'exam' || r.mode !== 'split' || r.done) return;
  if (document.visibilityState === 'hidden') { if (r._since) { r.used += (Date.now() - r._since) / 1000; r._since = null; save(); } }
  else if (!r._since) r._since = Date.now();
});
