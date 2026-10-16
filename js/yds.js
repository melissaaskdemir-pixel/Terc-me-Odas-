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
const ui = { view: 'home', run: null, i: 0, review: null, tick: null, practice: null };

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
export function isExamOpen() { return ui.view === 'exam'; }

export function renderYds(root) {
  stopTick();
  const wrap = el('div.wrap');
  root.append(wrap);
  loadYds().then(() => {
    if (!wrap.isConnected) return;
    if (ui.view === 'exam' && ui.run) return renderExam(root, wrap);
    if (ui.view === 'result' && ui.run) return renderResult(wrap);
    if (ui.view === 'review' && ui.run) return renderReview(root, wrap);
    if (ui.view === 'practice' && ui.practice) return renderPractice(root, wrap);
    renderHome(wrap);
  }).catch(e => { console.error(e); put(wrap, el('div.panel', t('err.load'))); });
}

function nav(view) { ui.view = view; go('yds', view === 'home'); }

function renderHome(wrap) {
  document.body.classList.remove('studying');
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
    el('div.kicker', t('y.settings')),
    el('div.setrow', el('div.lbl', el('span', t('y.size')), el('small', t('y.sizeSub'))),
      seg([['full', t('y.full')], ['half', t('y.half')]], opts.size, v => { S.prof.ydsSize = v; opts.size = v; })),
    el('div.setrow', el('div.lbl', el('span', t('y.mode')), el('small', opts.mode === 'real' ? t('y.realSub') : t('y.splitSub'))),
      seg([['real', t('y.real')], ['split', t('y.split')]], opts.mode, v => { S.prof.ydsMode = v; opts.mode = v; nav('home'); })),
    el('div.kicker', t('y.exams')),
    !OSYM ? el('div.warn', el('span.t', t('y.noPack'))) : null,
    el('div.list', ...list.map(examRow)),
    el('div.note', t('y.anchorNote')),
    el('div.kicker', t('y.practice')),
    el('div.note', t('y.practiceNote')),
    el('div.chips', ...ORDER.map(s => el('button.chip', { on: { click: () => startPractice(s) } }, t('ys.' + s)))),
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
  const passage = q.p && ex.P[q.p] ? passageNode(ex.P[q.p], q) : null;
  const optBtn = (o, k) => el('button.yds-opt' + (run.ans[i] === k ? '.on' : ''), {
    on: { click: () => { if (run.ans[i] === k) delete run.ans[i]; else run.ans[i] = k; sfx('paper'); save(); renderExam(root, wrap); } },
  }, el('span.l.mono', LETTERS[k] + ')'), el('span.tx' + (q.s === 'ceviri' && /[а-яё]/i.test(o) ? '.ru' : (q.s !== 'ceviri' ? '.ru' : '')), o));
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
        q.t ? el('div.yds-stem' + (q.s === 'ceviri' && !/[а-яё]/i.test(q.t) ? '' : '.ru') + (q.s === 'diyalog' ? '.dlg' : ''), stemNode(q.t)) : null,
        el('div.yds-opts', ...q.o.map(optBtn)))),
    el('div.yds-nav',
      el('button.btn', { disabled: i === 0, on: { click: () => { ui.i = i - 1; renderExam(root, wrap); } } }, '‹'),
      el('button.btn' + (flagged ? '.btn-accent' : ''), { on: { click: () => { run.flags = flagged ? run.flags.filter(x => x !== i) : [...run.flags, i]; save(); renderExam(root, wrap); } } }, svg(ICON.flag), t('y.flag')),
      i < n - 1 ? el('button.btn.btn-primary', { on: { click: () => { ui.i = i + 1; renderExam(root, wrap); } } }, '›')
        : el('button.btn.btn-ok', { on: { click: () => optik() } }, t('y.finishShort'))),
  );
  root.append(frame);
  const body = frame.querySelector('.yds-body');
  if (body && ui._lastI !== i) { body.scrollTop = 0; }
  ui._lastI = i;
}

function stemNode(s) {
  // boşluk (----) çizgi olarak
  const out = [];
  s.split(/(----)/).forEach(part => out.push(part === '----' ? el('span.yds-gap', '   ') : part));
  return out;
}

function passageNode(p, q) {
  const key = 'yds-pas-open';
  let open = true;
  try { open = localStorage.getItem(key) !== '0'; } catch (e) {}
  const body = el('div.yds-ptext.ru');
  // parça içi boşluk numaraları: bu sorunun boşluğu vurgulu
  p.t.split(/(\(\d{1,2}\)----)/).forEach(part => {
    const m = /^\((\d{1,2})\)----$/.exec(part);
    if (m) body.append(el('span.yds-gap' + (+m[1] === q.n ? '.cur' : ''), `(${m[1]})`));
    else body.append(part);
  });
  const box = el('details.paper.yds-pas', { open }, el('summary.lab', t('y.passage')), body);
  box.addEventListener('toggle', () => { try { localStorage.setItem(key, box.open ? '1' : '0'); } catch (e) {} });
  return box;
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
    q.p && ex.P[q.p] ? passageNode(ex.P[q.p], q) : null,
    el('div.paper.yds-q',
      q.t ? el('div.yds-stem' + (q.s === 'diyalog' ? '.dlg' : '') + (/[а-яё]/i.test(q.t) ? '.ru' : ''), stemNode(q.t)) : null,
      el('div.yds-opts', ...q.o.map((o, j) => el('div.yds-opt' + (j === q.a ? '.ok' : '') + (j === mine && j !== q.a ? '.bad' : ''),
        el('span.l.mono', LETTERS[j] + ')'), el('span.tx' + (/[а-яё]/i.test(o) ? '.ru' : ''), o)))),
      el('div.meta', mine == null ? t('y.blank') : mine === q.a ? t('y.right') : t('y.wrongWas', { a: LETTERS[mine], b: LETTERS[q.a] })),
      q.x ? el('div.yds-x', q.x) : (it.q.id.includes(':') && !it.q.x ? el('div.meta.small', t('y.noExpl')) : null)),
    el('div.grid2',
      el('button.btn', { disabled: k === 0, on: { click: () => { ui.review.i = k - 1; go('yds', false); } } }, t('y.prev')),
      k < idx.length - 1 ? el('button.btn.btn-primary', { on: { click: () => { ui.review.i = k + 1; go('yds', false); } } }, t('y.next'))
        : el('button.btn.btn-primary', { on: { click: () => nav('result') } }, t('y.done'))),
  );
}

// ---------------------------------------------------------------- bölüm turu (anında geri bildirim)
function practicePool(sec) {
  const pool = [];
  const P = {};
  const doneGen = new Set(R.runs.filter(r => r.done && r.exam.startsWith('g:')).map(r => r.exam.slice(2)));
  for (const e of OSYM?.exams || []) if (!e.anchor) { for (const p of e.p) P[p.id] = p; for (const q of e.q) if (q.s === sec || (sec === 'bosluk' && q.s === 'cloze')) pool.push(q); }
  for (const q of OSYM?.ornek || []) if (q.s === sec) pool.push(q);
  for (const d of GEN?.denemeler || []) if (doneGen.has(d.id)) { for (const p of d.p) P[p.id] = p; for (const q of d.q) if (q.s === sec) pool.push(q); }
  return { pool, P };
}

function startPractice(sec) {
  const { pool, P } = practicePool(sec);
  if (!pool.length) { toast(t('y.poolEmpty')); return; }
  const seen = q => R.seen[q.id] || 0;
  let items;
  if (sec === 'okuma' || sec === 'bosluk' && pool.some(q => q.p)) {
    const groups = {};
    for (const q of pool) { const k = q.p || q.id; (groups[k] = groups[k] || []).push(q); }
    const gs = Object.values(groups).sort((a, b) => (a.reduce((s, q) => s + seen(q), 0) / a.length) - (b.reduce((s, q) => s + seen(q), 0) / b.length) || Math.random() - 0.5);
    items = [];
    for (const g of gs) { if (items.length >= 8) break; items.push(...g); }
  } else {
    items = pool.slice().sort((a, b) => seen(a) - seen(b) || Math.random() - 0.5).slice(0, 10);
  }
  ui.practice = { sec, items, P, i: 0, ans: {}, ok: 0 };
  nav('practice');
}

function renderPractice(root, wrap) {
  const pr = ui.practice;
  if (pr.i >= pr.items.length) {
    put(wrap, el('div.kicker', t('y.practice')), el('h1.h1', t('ys.' + pr.sec)),
      el('div.paper.okp', el('div.yds-score', el('span.mono', `${pr.ok}/${pr.items.length}`), el('span.lab', t('y.correctN')))),
      el('button.btn.btn-primary.btn-wide', { on: { click: () => startPractice(pr.sec) } }, t('y.again')),
      el('button.btn.btn-wide', { on: { click: () => { ui.practice = null; nav('home'); } } }, t('y.back')));
    return;
  }
  const q = pr.items[pr.i];
  const mine = pr.ans[pr.i];
  const answered = mine != null;
  const pick = async k => {
    if (answered) return;
    pr.ans[pr.i] = k;
    if (k === q.a) { pr.ok++; sfx('stamp'); } else sfx('soft');
    R.seen[q.id] = (R.seen[q.id] || 0) + 1;
    await save();
    go('yds', true);
  };
  put(wrap, 
    el('div.topline', el('button.linkbtn', { on: { click: () => { ui.practice = null; nav('home'); } } }, t('k.quit')), el('span.mono.muted', `${pr.i + 1}/${pr.items.length}`)),
    el('div.kicker', t('ys.' + pr.sec) + ' · ' + srcLabel(q.id)),
    q.p && pr.P[q.p] ? passageNode(pr.P[q.p], q) : null,
    el('div.paper.yds-q',
      q.t ? el('div.yds-stem' + (q.s === 'diyalog' ? '.dlg' : '') + (/[а-яё]/i.test(q.t) ? '.ru' : ''), stemNode(q.t)) : null,
      el('div.yds-opts', ...q.o.map((o, j) => el((answered ? 'div' : 'button') + '.yds-opt' + (answered && j === q.a ? '.ok' : '') + (answered && j === mine && j !== q.a ? '.bad' : ''),
        answered ? {} : { on: { click: () => pick(j) } }, el('span.l.mono', LETTERS[j] + ')'), el('span.tx' + (/[а-яё]/i.test(o) ? '.ru' : ''), o)))),
      answered ? el('div.meta', mine === q.a ? t('y.right') : t('y.wrongWas', { a: LETTERS[mine], b: LETTERS[q.a] })) : null,
      answered && q.x ? el('div.yds-x', q.x) : null),
    answered ? el('button.btn.btn-primary.btn-wide', { on: { click: () => { pr.i++; go('yds', false); } } }, t('y.next')) : null,
  );
}

const srcLabel = id => {
  const [a] = id.split(':');
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
