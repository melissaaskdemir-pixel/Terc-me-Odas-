// Sözlük: kartlarda arama (Rusça ya da Türkçe), çekim tablosu, kart durumu
import { el, svg, ICON, dayNum } from './util.js';
import { t } from './i18n.js';
import { S, cardState } from './store.js';
import { CARDS, DECKS, loadMorph } from './decks.js';
import { norm, lemmasOf, morphReady } from './check.js';
import { isKnown } from './plan.js';
import * as audio from './audio.js';
import { modal } from './ui.js';
import { startStudy } from './study.js';
import { go } from './main.js';

let lastQ = '';
let index = null;

function buildIndex() {
  index = [];
  for (const c of CARDS.values()) {
    const ru = [c.f, c.v, ...(c.a || []), ...((c.cz || []).flatMap(z => z.a))].filter(Boolean).join(' ');
    index.push({ c, ru: norm(ru), tr: (c.q + ' ' + (c.qs || '')).toLocaleLowerCase('tr') });
  }
}

export function renderSozluk(root) {
  if (!index || index.length !== CARDS.size) buildIndex();
  loadMorph().catch(() => {});
  const input = el('input.search', { type: 'search', placeholder: t('s.ph'), autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', value: lastQ });
  const list = el('div.list');
  const info = el('div.note');
  const run = () => {
    lastQ = input.value;
    const q = input.value.trim();
    list.innerHTML = '';
    if (q.length < 2) { info.textContent = t('s.info', { n: CARDS.size }); return; }
    const qr = norm(q), qt = q.toLocaleLowerCase('tr');
    const hits = [];
    for (const x of index) {
      const i = Math.min(...[qr && x.ru.indexOf(qr), x.tr.indexOf(qt)].filter(v => v !== '' && v >= 0).concat([1e9]));
      if (i < 1e9) hits.push({ x, score: (i === 0 ? 0 : 1) + (x.c.f || '').length / 200 });
    }
    hits.sort((a, b) => a.score - b.score);
    info.textContent = hits.length ? t('s.hits', { n: hits.length }) : t('s.none');
    for (const { x } of hits.slice(0, 60)) {
      list.append(el('button.res', { on: { click: () => showCard(x.c.id) } },
        el('span.ru', x.c.f || x.c.v), el('span.tr', x.c.q)));
    }
  };
  input.addEventListener('input', run);
  run();
  root.append(el('div.wrap', el('div.kicker', t('s.kicker')), el('h1.h1', t('s.title')), input, info, list,
    el('div.note', t('s.note'))));
}

const STATE_LABEL = st => !st.st ? t('s.stNew') : isKnown(st) ? t('s.stKnown') : t('s.stLearning');

export async function showCard(id) {
  const c = CARDS.get(id);
  if (!c) return;
  const st = cardState(id);
  const today = dayNum();
  try { await loadMorph(); } catch (e) {}
  const head = c.f || c.v;
  const word = (c.a && c.a[0]) || (c.cz && c.cz[0].a[0]) || head;
  const table = formsTable(word);
  const play = key => key ? el('button.pbtn.round', { 'aria-label': t('st.listen'), on: { click: () => audio.play(key) } }, svg(ICON.play)) : null;
  modal(close => el('div.paper', { style: { display: 'flex', flexDirection: 'column', gap: '12px' } },
    el('div.mono', { style: { fontSize: '11px', letterSpacing: '.1em', color: 'var(--p-kicker)' } }, `${(DECKS.get(c.deck)?.ad || '').toLocaleUpperCase('tr')} · ${c.id}`),
    el('div.exrow', el('div.ans.ru', { style: { flex: '1', fontSize: '26px' } }, head), play(c.au || (c.cz && c.cz[0].au))),
    el('div', { style: { fontSize: '17px' } }, c.q),
    c.qs ? el('div.meta', c.qs) : null,
    c.g ? el('div.meta', el('b', t('st.gov') + ': '), el('span.ru', c.g)) : null,
    c.p && c.p[0] && c.p[1] ? el('div.meta', el('b', t('st.pair') + ': '), el('span.ru', `${c.p[0]} (impf.) · ${c.p[1]} (pf.)`)) : null,
    ...(c.cz || []).map(z => el('div.exrow', el('div.ex', { style: { flex: '1' } }, el('div.r', z.full || z.s), z.tr ? el('div.t', z.tr) : null), play(z.au))),
    ...(c.ex || []).map(e => el('div.exrow', el('div.ex', { style: { flex: '1' } }, el('div.r', e[0]), e[1] ? el('div.t', e[1]) : null), play(e[2]))),
    c.n ? el('div.meta', c.n) : null,
    table,
    el('div.meta', `${t('s.state')}: ${STATE_LABEL(st)}` + (st.st && st.due != null ? ' · ' + (st.due <= today ? t('s.dueNow') : t('s.dueIn', { n: st.due - today })) : '')),
    el('div.grid2',
      el('button.btn', { on: { click: close } }, t('s.close')),
      el('button.btn.btn-accent', { on: { click: () => { close(); startStudy('liste', { ids: [id] }, () => go('sozluk')); } } }, t('s.study'))),
  ));
}

// ---------------------------------------------------------------- çekim tablosu
const CASES = ['N', 'G', 'D', 'A', 'I', 'P'];
const CASE_TR = { N: 'Nom', G: 'Gen', D: 'Dat', A: 'Acc', I: 'Ins', P: 'Prep' };

function formsTable(word) {
  if (!morphReady() || !word || /\s/.test(word.trim())) return null;
  const lms = lemmasOf(word.toLowerCase());
  if (!lms.length) return null;
  const L = lms[0];
  const byTag = {};
  for (const [, v] of L) for (const tg of v.tags.split('/')) (byTag[tg] = byTag[tg] || []).push(v.form);
  const me = norm(word);
  const cell = tg => {
    const fs = byTag[tg];
    if (!fs) return el('td', '—');
    const hit = fs.some(f => norm(f) === me);
    return el('td' + (hit ? '.hit' : ''), [...new Set(fs)].join(', '));
  };
  const has = k => Object.keys(byTag).some(x => x.startsWith(k));
  if (byTag.inf || has('1') || has('p')) {
    const rows = [['inf', t('f.inf')], ['1s', 'я'], ['2s', 'ты'], ['3s', 'он, она'], ['1p', 'мы'], ['2p', 'вы'], ['3p', 'они'],
      ['pm', t('f.pm')], ['pf', t('f.pf')], ['pn', t('f.pn')], ['pp', t('f.pp')], ['imp', t('f.imp')], ['impp', t('f.impp')]].filter(([k]) => byTag[k]);
    return el('table.tbl', el('tbody', ...rows.map(([k, lab]) => el('tr', el('td.k', lab), cell(k)))));
  }
  if (has('N') && (byTag.Nm || byTag.Nf || byTag.Nn)) {
    return el('table.tbl', el('thead', el('tr', el('th', ''), el('th', t('f.m')), el('th', t('f.f')), el('th', t('f.n')), el('th', t('f.pl')))),
      el('tbody', ...CASES.map(k => el('tr', el('td.k', CASE_TR[k]), cell(k + 'm'), cell(k + 'f'), cell(k + 'n'), cell(k + 'p')))));
  }
  if (has('N')) {
    return el('table.tbl', el('thead', el('tr', el('th', ''), el('th', t('f.sg')), el('th', t('f.pl')))),
      el('tbody', ...CASES.map(k => el('tr', el('td.k', CASE_TR[k]), cell(k + 's'), cell(k + 'p')))));
  }
  return null;
}
