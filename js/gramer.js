// Gramer haritası: A1–C2 konu iskeleti, madde madde işaretleme, ilgili çalışma bölümüne geçiş
import { el } from './util.js';
import { t } from './i18n.js';
import * as db from './db.js';
import { go } from './main.js';
import { openYds } from './yds.js';
import { openSes } from './ses.js';

let G = null, R = null, loadP = null;
const ui = { lv: 'A1', open: null, q: '' };
const put = (w, ...xs) => w.append(...xs.filter(x => x != null && x !== false));
const save = () => db.put('kv', R, 'gramer');

function load() {
  if (!loadP) loadP = Promise.all([fetch('data/gramer.json').then(r => r.json()), db.get('kv', 'gramer')]).then(([g, r]) => {
    G = g; R = r || {}; R.s = R.s || {};
  }).catch(e => { loadP = null; throw e; });
  return loadP;
}

// Konunun çalışıldığı bölüm: «Yazma > Form, Çeviri» → ilk bölüm
function modTarget(mod) {
  const m = (mod || '').split(',')[0].trim();
  if (m.startsWith('Önek')) return () => go('onek');
  if (m.startsWith('Yazma') || m.startsWith('Çeviri')) return () => go('yazma');
  if (m.startsWith('Ses')) return () => openSes();
  if (m.startsWith('Okuma')) return () => go('okuma');
  if (m.startsWith('YDS')) return () => openYds();
  if (m.startsWith('Kelime')) return () => go('calis');
  return null;
}

const allItems = () => G.levels.flatMap(l => l.topics.flatMap(tp => tp.items.map(it => ({ it, tp, lv: l }))));
const count = items => {
  let ok = 0, rep = 0;
  for (const it of items) { const s = R.s[it.id]; if (s === 'ok') ok++; else if (s === 'rep') rep++; }
  return { ok, rep, n: items.length };
};

export function renderGramer(root) {
  const wrap = el('div.wrap');
  root.append(wrap);
  load().then(() => { if (wrap.isConnected) render(wrap); })
    .catch(e => { console.error(e); put(wrap, el('div.panel', t('err.load'))); });
}

function render(wrap) {
  const all = allItems().map(x => x.it);
  const tot = count(all);
  const search = el('input.search', { type: 'search', placeholder: t('gm.search'), value: ui.q, autocomplete: 'off', spellcheck: 'false' });
  const body = el('div');
  search.addEventListener('input', () => { ui.q = search.value; body.innerHTML = ''; renderBody(body); });
  put(wrap,
    el('div.topline', el('button.linkbtn', { on: { click: () => go('calis') } }, '‹ ' + t('tab.calis')), null),
    el('div.kicker', t('gm.kicker')),
    el('h1.h1', t('gm.title')),
    el('section.panel.sect',
      el('div.note', t('gm.intro')),
      el('div.gm-bar', el('i.ok', { style: { width: (100 * tot.ok / tot.n) + '%' } }), el('i.rep', { style: { width: (100 * tot.rep / tot.n) + '%' } })),
      el('div.mono.small', t('gm.tot', { ok: tot.ok, rep: tot.rep, n: tot.n }))),
    search, body);
  renderBody(body);
}

function renderBody(body) {
  const q = ui.q.trim().toLocaleLowerCase('tr');
  if (q) return renderSearch(body, q);
  const chips = el('div.chips.gm-lv', ...G.levels.map(l => {
    const c = count(l.topics.flatMap(tp => tp.items));
    return el('button.chip', { 'aria-pressed': String(ui.lv === l.lv), on: { click: () => { ui.lv = l.lv; ui.open = null; go('gramer', true); } } },
      l.lv === '+' ? t('gm.extra') : l.lv, el('span.gm-chipn', ` ${c.ok}/${c.n}`));
  }));
  const L = G.levels.find(l => l.lv === ui.lv) || G.levels[0];
  const lc = count(L.topics.flatMap(tp => tp.items));
  put(body, chips,
    el('div.topline', el('div.kicker', L.name),
      L.lv !== '+' && lc.ok < lc.n ? el('button.plink.gm-all', { on: { click: () => markLevel(L) } }, t('gm.markAll')) : null),
    el('div.list', ...L.topics.flatMap(tp => topicRows(tp))));
}

function topicRows(tp) {
  const c = count(tp.items);
  const open = ui.open === tp.id;
  const rows = [el('button.res.gm-topic', { 'aria-expanded': String(open), on: { click: () => { ui.open = open ? null : tp.id; go('gramer', true); } } },
    el('span', el('span.gm-t', tp.title), el('span.slot', `  ${c.ok}/${c.n}`)),
    el('span.tr', dots(tp.items)))];
  if (open) {
    const go2 = modTarget(tp.mod);
    rows.push(el('div.gm-open',
      ...tp.items.map(it => itemCard(it)),
      go2 ? el('button.btn.btn-wide', { on: { click: go2 } }, t('gm.study', { m: tp.mod })) : null));
  }
  return rows;
}

function dots(items) {
  const w = el('span.gm-dots');
  for (const it of items) w.append(el('i.' + (R.s[it.id] || 'none')));
  return w;
}

function itemCard(it, ctx) {
  const st = R.s[it.id] || '';
  const set = async v => { R.s[it.id] = st === v ? undefined : v; if (!R.s[it.id]) delete R.s[it.id]; await save(); go('gramer', true); };
  return el('article.paper.gm-card',
    ctx ? el('div.gm-ctx', ctx) : null,
    el('div.gm-b', it.b),
    it.k ? el('div.gm-k', it.k) : null,
    ...it.o.map(([ru, tr]) => el('div.gm-ex', el('div.ru', ru), tr ? el('div.tr', tr) : null)),
    it.t ? el('div.on-trap', el('span.k', t('gm.trap')), it.t) : null,
    el('div.gm-st',
      el('button.btn.btn-sm' + (st === 'rep' ? '.on' : ''), { 'aria-pressed': String(st === 'rep'), on: { click: () => set('rep') } }, t('gm.rep')),
      el('button.btn.btn-sm' + (st === 'ok' ? '.on' : ''), { 'aria-pressed': String(st === 'ok'), on: { click: () => set('ok') } }, t('gm.ok'))));
}

async function markLevel(L) {
  for (const tp of L.topics) for (const it of tp.items) if (!R.s[it.id]) R.s[it.id] = 'ok';
  await save();
  go('gramer', true);
}

function renderSearch(body, q) {
  const hits = allItems().filter(({ it, tp }) =>
    [it.b, it.k, it.t, tp.title, ...it.o.flat()].some(x => (x || '').toLocaleLowerCase('tr').includes(q))).slice(0, 40);
  put(body, el('div.note', t('gm.hits', { n: hits.length })),
    ...hits.map(({ it, tp, lv }) => itemCard(it, `${lv.lv === '+' ? t('gm.extra') : lv.lv} · ${tp.title}`)));
}
