// Ses odası: dikte. Duyduğunu yaz, her kelime ayrı puanlanır, yanlışlar imla defterine düşer.
// Kaynaklar: insan sesi (Tatoeba gönüllüleri, gündelik dil) ve kart ya da okuma cümleleri (resmî dil, sentez ses).
import { el, svg, ICON, dayNum } from './util.js';
import { t } from './i18n.js';
import * as db from './db.js';
import { CARDS, loadMorph } from './decks.js';
import { check, charMarks, latinOnly, tokens } from './check.js';
import * as audio from './audio.js';
import { toast } from './ui.js';
import { haptic } from './fx.js';
import { go } from './main.js';
import { loadOkuma } from './okuma.js';
import { lookup } from './sozluk.js';

const N = 10;
const LEN = { kisa: [3, 6], orta: [7, 11], uzun: [12, 40] };
const SRC = ['insan', 'kart', 'okuma', 'hepsi'];
let R = null, loadP = null, OK_DATA = null, INSAN = null, INSAN_DATA = null;
const ui = { view: 'home', run: null };
const put = (w, ...xs) => w.append(...xs.filter(x => x != null && x !== false));

export function loadInsan() {
  if (!INSAN) INSAN = fetch('data/insan.json').then(r => r.json()).catch(e => { INSAN = null; throw e; });
  return INSAN;
}
export async function insanAudioKeys() { return (await loadInsan()).items.map(x => 't:' + x.id); }

function load() {
  if (!loadP) loadP = Promise.all([db.get('kv', 'ses'), loadOkuma().catch(() => null), loadInsan().catch(() => null)]).then(([r, ok, ins]) => {
    R = r || {};
    R.days = R.days || {}; R.seen = R.seen || {}; R.imla = R.imla || [];
    R.len = R.len || 'orta';
    // 0.4.6: gölgeleme kalktı, insan sesi geldi; kaynak bir kez insan sesine alınır
    if (!R.v || R.v < 2) { R.src = 'insan'; R.v = 2; }
    if (!SRC.includes(R.src)) R.src = 'insan';
    OK_DATA = ok;
    INSAN_DATA = ins;
  }).catch(e => { loadP = null; throw e; });
  return loadP;
}
const save = () => db.put('kv', R, 'ses');
export function isSesOpen() { return ui.view === 'dikte'; }

// ---------------------------------------------------------------- cümle havuzu
const words = s => s.trim().split(/\s+/).filter(w => /[а-яё]/i.test(w)).length;
function pool(len, src) {
  const out = [], seenKeys = new Set();
  const add = (ru, tr, k, from, by) => {
    if (!ru || !k || seenKeys.has(k)) return;
    const n = words(ru);
    if (n < 3) return;
    seenKeys.add(k);
    out.push({ ru, tr: tr || '', k, from, n, by });
  };
  const has = s => src === s || src === 'hepsi';
  if (has('insan') && INSAN_DATA) {
    for (const x of INSAN_DATA.items) add(x.ru, x.tr, 't:' + x.id, 'insan', { id: x.id, sp: x.sp, lic: x.lic });
  }
  if (has('kart')) {
    for (const c of CARDS.values()) {
      for (const e of c.ex || []) add(e[0], e[1], e[2], c.t === 'onek' ? 'onek' : 'kart');
      for (const z of c.cz || []) add(z.full, z.tr, z.au, c.t === 'onek' ? 'onek' : 'kart');
    }
  }
  if (has('okuma') && OK_DATA) {
    for (const f of OK_DATA.files) for (const p of f.paras) {
      for (const s of p.ad) add(s.ru, s.tr, s.au, 'okuma');
      for (const s of p.o) add(s.ru, s.tr, s.au, 'okuma');
    }
  }
  const [a, b] = LEN[len] || LEN.orta;
  return out.filter(x => x.n >= a && x.n <= b);
}

function pick(len, src, n) {
  const all = pool(len, src);
  const seen = x => R.seen[x.k] || 0;
  all.sort((x, y) => seen(x) - seen(y) || Math.random() - 0.5);
  return all.slice(0, n);
}

function dayRec() {
  const d = dayNum();
  return R.days[d] || (R.days[d] = { dk: 0, words: 0, ok: 0, imla: 0, sonek: 0, yapi: 0 });
}

// ---------------------------------------------------------------- ekranlar
export function renderSes(root) {
  const wrap = el('div.wrap');
  root.append(wrap);
  load().then(() => {
    if (!wrap.isConnected) return;
    if (ui.view === 'dikte' && ui.run) return renderRun(root);
    if (ui.view === 'sonuc' && ui.run) return renderResult(wrap);
    if (ui.view === 'imla') return renderImla(wrap);
    renderHome(wrap);
  }).catch(e => { console.error(e); put(wrap, el('div.panel', t('err.load'))); });
}

function nav(v) { ui.view = v; go('ses', v === 'home'); }

function seg(options, value, onChange) {
  const w = el('div.seg', { role: 'group' });
  for (const [v, lab] of options) {
    const b = el('button', { 'aria-pressed': String(v === value) }, lab);
    b.addEventListener('click', () => { w.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', 'false')); b.setAttribute('aria-pressed', 'true'); onChange(v); });
    w.append(b);
  }
  return w;
}

function renderHome(wrap) {
  document.body.classList.remove('studying');
  const today = dayNum();
  let w7 = 0, ok7 = 0, im7 = 0;
  for (let d = today - 6; d <= today; d++) { const r = R.days[d]; if (r) { w7 += r.words; ok7 += r.ok; im7 += r.imla; } }
  const count = el('span');
  const srcNote = el('div.note');
  const upd = () => {
    count.textContent = t('sx.poolN', { n: pool(R.len, R.src).length });
    srcNote.textContent = t('sx.srcNote.' + R.src);
  };
  upd();
  put(wrap,
    el('div.topline', el('button.linkbtn', { on: { click: () => go('calis') } }, '‹ ' + t('tab.calis')), null),
    el('div.kicker', t('sx.kicker')),
    el('h1.h1', t('sx.title')),
    el('div.panel', { style: { display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'center' } },
      el('div', el('div.kicker', t('sx.week')), el('div.note', w7 ? t('sx.weekNote', { w: w7, im: im7 }) : t('sx.weekNone'))),
      el('div.mono', { style: { fontSize: '28px' } }, w7 ? Math.round(100 * ok7 / w7) + '%' : '—')),
    el('div.kicker', t('sx.src')),
    seg(SRC.map(s => [s, t('sx.' + s)]), R.src, v => { R.src = v; save(); upd(); }),
    srcNote,
    el('div.kicker', t('sx.len')),
    seg([['kisa', t('sx.kisa')], ['orta', t('sx.orta')], ['uzun', t('sx.uzun')]], R.len, v => { R.len = v; save(); upd(); }),
    el('div.note', count),
    el('section.panel.sect',
      el('div.topline', el('h2.h2', t('sx.dikte')), el('span.kicker', t('sx.nSent', { n: N }))),
      el('div.note', t('sx.dikteNote')),
      el('button.btn.btn-primary.btn-wide', { on: { click: start } }, t('sx.dikteStart'))),
    R.imla.length ? el('button.btn.btn-wide', { on: { click: () => nav('imla') } }, t('sx.imlaOpen', { n: R.imla.length })) : null,
    el('div.note.sx-credit', t('sx.credit'), ' ', el('a', { href: 'https://tatoeba.org', target: '_blank', rel: 'noopener' }, 'tatoeba.org')),
  );
}

function start() {
  const items = pick(R.len, R.src, N);
  if (!items.length) { toast(t('sx.empty')); return; }
  audio.unlock();
  loadMorph().catch(() => {});
  ui.run = { items, i: 0, res: [], typed: '', done: false };
  // ilk cümleyi bu dokunuşta hazırla ve çal (iOS otomatik oynatma kuralı)
  audio.prepare(items[0].k).then(() => { if (ui.run && ui.run.i === 0) audio.playNow(items[0].k); });
  if (items[1]) audio.prepare(items[1].k);
  ui.view = 'dikte';
  go('ses');
}

function quit() {
  audio.stop();
  document.body.classList.remove('studying');
  if (ui.run && ui.run.res.length) { ui.view = 'sonuc'; go('ses'); return; }
  ui.run = null;
  nav('home');
}

function nextItem() {
  const r = ui.run;
  audio.stop();
  r.i++;
  r.done = false; r.typed = ''; r.last = null; r.undo = null;
  if (r.i >= r.items.length) { document.body.classList.remove('studying'); ui.view = 'sonuc'; go('ses'); return; }
  const it = r.items[r.i];
  if (audio.isPrepared(it.k)) audio.playNow(it.k); else audio.play(it.k);
  if (r.items[r.i + 1]) audio.prepare(r.items[r.i + 1].k);
  go('ses');
}

function playBtn(k, rate, label) {
  return el('button.btn.sx-play', { on: { click: () => audio.play(k, rate) } }, svg(ICON.play), el('span', label));
}

function renderRun(root) {
  const r = ui.run, it = r.items[r.i];
  document.body.classList.add('studying');
  root.innerHTML = '';
  const top = el('header.st-top',
    el('button.iconbtn', { 'aria-label': t('st.close'), on: { click: quit } }, svg(ICON.x)),
    el('div.bar', el('i', { style: { width: (100 * r.i / r.items.length) + '%' } })),
    el('span.st-count', `${r.i + 1}/${r.items.length}`));
  const body = el('div.sx-body');
  const frame = el('div.study.sx', top, el('div.st-sub', el('span', t('sx.dikteK')), el('span', t('sx.from.' + it.from))), body);
  root.append(frame);
  renderDikte(body, r, it);
}

// Tatoeba atfı: okuyan, lisans, cümlenin sayfası
function credit(it, full) {
  if (!it.by) return null;
  if (!full) return el('span', t('sx.reader', { sp: it.by.sp }));
  return el('div.sx-cred', t('sx.credLine', { sp: it.by.sp, lic: it.by.lic }), ' · ',
    el('a', { href: `https://tatoeba.org/tr/sentences/show/${it.by.id}`, target: '_blank', rel: 'noopener' }, `Tatoeba #${it.by.id}`));
}

// ---------------------------------------------------------------- dikte
function renderDikte(body, r, it) {
  const card = el('article.paper.sx-card',
    el('div.ck', el('span', t('sx.words', { n: it.n })), credit(it, false) || el('span', t('sx.synth'))),
    el('div.sx-plays', playBtn(it.k, 1, t('sx.listen')), playBtn(it.k, 0.7, '0.7×')));
  const ta = el('textarea.sx-in', { lang: 'ru', rows: 3, autocomplete: 'off', autocapitalize: 'off', autocorrect: 'off', spellcheck: 'false', placeholder: t('sx.typeHere') });
  ta.value = r.typed || '';
  ta.addEventListener('input', () => { r.typed = ta.value; });
  if (!r.done) {
    put(card, ta);
    put(body, card, el('div.sx-nav',
      el('button.btn', { on: { click: () => submitDikte(null) } }, t('sx.dontKnow')),
      el('button.btn.btn-primary', { 'data-fx': 'own', on: { click: () => submitDikte(ta.value) } }, t('sx.check'))));
    setTimeout(() => ta.focus(), 50);
    return;
  }
  const res = r.last;
  if (r.fresh && res.score === 1) put(card, el('div.stamp', 'ВЕРНО'));
  r.fresh = false;
  put(card, el('section.fb', el('div.verdict', el('span.k.' + (res.score === 1 ? 'ok' : res.score >= 0.7 ? 'imla' : 'yapi'), t('sx.score', { p: Math.round(res.score * 100) }))),
    res.typed ? el('div.lab', t('st.youWrote')) : null,
    res.typed ? typedView(res) : null,
    el('div.lab', t('st.correct')),
    el('div.ans.ru.small', it.ru),
    it.tr ? el('div.meta', it.tr) : null,
    res.counts.imla + res.counts.sonek + res.counts.yapi ? el('div.meta', t('sx.errs', res.counts)) : null,
    credit(it, true)));
  put(body, card, el('div.sx-nav',
    r.undo ? el('button.btn', { 'aria-label': t('st.typoAria'), on: { click: typoUndo } }, t('st.typo')) : el('span'),
    el('button.btn.btn-primary', { on: { click: nextItem } }, r.i + 1 < r.items.length ? t('sx.next') : t('sx.finish'))));
}

// Typo: el kaydı. Bu cümlenin kaydını geri al, yazdığını kutuya geri koy.
async function typoUndo() {
  const r = ui.run;
  if (!r || !r.done || !r.undo) return;
  const u = r.undo, d = dayRec();
  Object.assign(d, u.day);
  d.typo = (d.typo || 0) + 1;
  R.imla = u.imla;
  if (u.seen) R.seen[u.k] = u.seen; else delete R.seen[u.k];
  r.res.pop();
  r.typed = r.last ? r.last.typed : r.typed;
  r.done = false; r.last = null; r.undo = null; r.fresh = false;
  await save();
  go('ses');
}

function typedView(res) {
  const out = el('div.typed.ru');
  for (const o of res.ops || []) {
    if (o.c === 'miss') { out.append(missMark(o.e), ' '); continue; }
    const cls = o.c === 'extra' ? 'yapi' : o.c;
    const span = el('span.tk-' + cls);
    if ((o.c === 'imla' || o.c === 'sonek') && o.e && o.t) {
      const bad = charMarks(o.t, o.e);
      [...o.t].forEach((ch, i) => span.append(bad.has(i) ? el('mark', ch) : ch));
    } else span.append(o.t);
    out.append(span, ' ');
  }
  return out;
}

async function submitDikte(typed) {
  const r = ui.run, it = r.items[r.i];
  if (typed != null && !typed.trim()) { haptic(); toast(t('sx.typeFirst')); return; }
  if (typed && latinOnly(typed)) { haptic(); toast(t('st.keyboard')); return; }
  audio.stop();
  let res;
  const E = tokens(it.ru).length;
  // typo ile geri alabilmek için kayıttan önceki durum
  const d0 = dayRec();
  const undo = typed != null ? { k: it.k, seen: R.seen[it.k] || 0, imla: R.imla.slice(), day: { dk: d0.dk, words: d0.words, ok: d0.ok, imla: d0.imla, sonek: d0.sonek, yapi: d0.yapi } } : null;
  if (typed == null) res = { score: 0, ops: [], typed: '', counts: { imla: 0, sonek: 0, yapi: E } };
  else {
    const g = check(typed, [it.ru]);
    const counts = { imla: 0, sonek: 0, yapi: 0 };
    let ok = 0;
    if (g.res === 'ok') ok = E;
    else for (const o of g.ops || []) {
      if (o.c === 'ok') ok++;
      else if (o.c === 'imla') counts.imla++;
      else if (o.c === 'sonek') counts.sonek++;
      else counts.yapi++;
    }
    res = { score: Math.max(0, Math.min(1, ok / Math.max(E, 1))), ops: g.res === 'ok' ? null : g.ops, typed, counts, okn: Math.min(ok, E) };
    if (g.res === 'ok') res.ops = typed.trim().split(/\s+/).map(w => ({ t: w, c: 'ok' }));
    // imla defteri: yanlış yazılan kelimeler (doğrusuyla)
    for (const o of g.ops || []) if ((o.c === 'imla' || o.c === 'sonek') && o.t && o.e) {
      R.imla = [{ t: o.t, e: o.e, s: it.ru, d: dayNum() }, ...R.imla.filter(x => x.e !== o.e)].slice(0, 120);
    }
  }
  const d = dayRec();
  d.dk++; d.words += E; d.ok += res.okn || 0; d.imla += res.counts.imla; d.sonek += res.counts.sonek; d.yapi += res.counts.yapi;
  R.seen[it.k] = (R.seen[it.k] || 0) + 1;
  r.res.push({ k: it.k, score: res.score });
  r.last = res; r.done = true;
  r.undo = res.score < 1 ? undo : null;
  await save();
  audio.sfx(res.score === 1 ? 'stamp' : 'soft');
  if (typed != null) haptic(res.score === 1 ? 'ok' : res.score >= 0.7 ? 'tick' : 'bad');
  r.fresh = true;
  go('ses');
}

// ---------------------------------------------------------------- sonuç ve imla defteri
function renderResult(wrap) {
  const r = ui.run;
  const avg = r.res.length ? r.res.reduce((a, x) => a + x.score, 0) / r.res.length : 0;
  put(wrap,
    el('div.kicker', t('sx.dikteK')),
    el('h1.h1', t('sx.done')),
    el('div.panel', el('div.mono', { style: { fontSize: '28px' } }, Math.round(avg * 100) + '%'),
      el('div.note', t('sx.doneDikte', { n: r.res.length, full: r.res.filter(x => x.score === 1).length }))),
    el('button.btn.btn-primary.btn-wide', { on: { click: start } }, t('sx.again')),
    el('button.btn.btn-wide', { on: { click: () => { ui.run = null; nav('home'); } } }, t('sx.back')));
}

function renderImla(wrap) {
  put(wrap,
    el('div.topline', el('button.linkbtn', { on: { click: () => nav('home') } }, '‹ ' + t('sx.title')), null),
    el('div.kicker', t('sx.imlaK')),
    el('h1.h1', t('sx.imlaT')),
    el('div.note', t('sx.imlaNote')),
    el('div.list', ...R.imla.map(x => el('button.res', { on: { click: () => lookup(x.e) } },
      el('span', el('span.ru', x.e), el('span.slot', '  ' + t('sx.youTyped', { w: x.t }))),
      el('span.tr.ru', x.s)))),
    R.imla.length ? el('button.btn.btn-wide', { on: { click: async () => { R.imla = []; await save(); nav('home'); } } }, t('sx.imlaClear')) : null);
}

export function openSes() { ui.view = 'home'; go('ses'); }

// Eksik kelime: uzunluğuna göre kesik çizgili boşluk
function missMark(e) {
  return el('span.tk-miss', { 'aria-label': 'eksik kelime', style: { width: Math.min(5, 0.9 + 0.32 * (e || '').length).toFixed(2) + 'em' } });
}
