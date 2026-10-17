// Çalış: bölümler; v0.1'de Kelime açık. Her bölüm tek başına ya da karışık çalışılabilir.
import { el, dayNum } from './util.js';
import { t } from './i18n.js';
import { S } from './store.js';
import { DECKS } from './decks.js';
import * as plan from './plan.js';
import { startStudy } from './study.js';
import { go } from './main.js';
import { openYds } from './yds.js';
import { openSes } from './ses.js';
import { toast } from './ui.js';

const TYPES = [
  ['all', 'c.tAll'], ['kelime', 'c.tKelime'], ['cift', 'c.tCift'], ['yonetim', 'c.tYonetim'], ['koll', 'c.tKoll'], ['esanlam', 'c.tEsanlam'], ['onek', 'c.tOnek'],
];
const ui = { decks: null, type: 'all' };

export function renderCalis(root) {
  const deckIds = [...DECKS.keys()];
  if (!ui.decks) ui.decks = deckIds.filter(plan.deckOn);
  ui.decks = ui.decks.filter(id => DECKS.has(id));
  const opts = () => ({ decks: ui.decks, types: ui.type === 'all' ? null : [ui.type] });

  const counts = el('div.note');
  const startBtn = el('button.btn.btn-primary.btn-wide');
  const extraBox = el('div');
  const refresh = () => {
    const o = opts();
    const due = plan.countDue(o);
    const nw = plan.countNew(o);
    const allow = plan.newAllowance();
    counts.textContent = t('c.counts', { due, nw, allow });
    startBtn.textContent = t('c.start', { n: 20 });
    startBtn.disabled = !ui.decks.length;
    extraBox.innerHTML = '';
    if (!allow && nw) {
      extraBox.append(el('div.sect', el('div.note', t('c.noNew')),
        el('button.btn.btn-sm', { on: { click: async () => { await plan.addExtraNew(10); toast(t('c.extraAdded')); refresh(); } } }, t('c.extra10'))));
    }
  };
  startBtn.addEventListener('click', () => startStudy('tur', { ...opts(), size: 20 }, () => go('calis')));

  const deckChips = el('div.chips');
  for (const id of deckIds) {
    const d = DECKS.get(id);
    const b = el('button.chip', { 'aria-pressed': String(ui.decks.includes(id)) }, d.ad);
    b.addEventListener('click', () => {
      ui.decks = ui.decks.includes(id) ? ui.decks.filter(x => x !== id) : [...ui.decks, id];
      b.setAttribute('aria-pressed', String(ui.decks.includes(id)));
      refresh();
    });
    deckChips.append(b);
  }
  const typeChips = el('div.chips');
  for (const [k, lab] of TYPES) {
    const b = el('button.chip', { 'aria-pressed': String(ui.type === k) }, t(lab));
    b.addEventListener('click', () => {
      ui.type = k;
      typeChips.querySelectorAll('.chip').forEach(x => x.setAttribute('aria-pressed', 'false'));
      b.setAttribute('aria-pressed', 'true');
      refresh();
    });
    typeChips.append(b);
  }
  refresh();

  const errIds = recentErrorIds();
  const wrap = el('div.wrap',
    el('div.kicker', t('c.kicker')),
    el('h1.h1', t('c.title')),
    el('section.panel.sect',
      el('div.topline', el('h2.h2', t('c.kelime')), el('span.kicker', t('c.open'))),
      el('div.kicker', t('c.decks')), deckChips,
      el('div.kicker', t('c.types')), typeChips,
      counts, startBtn, extraBox),
    errIds.length ? el('button.btn.btn-wide', { on: { click: () => startStudy('hata', { ids: errIds }, () => go('calis')) } },
      t('c.errs', { n: errIds.length })) : null,
    el('button.btn.btn-big', { on: { click: () => openYds() } }, el('span', t('c.ydsOpen')), el('span.mono.acc', t('c.ydsSub'))),
    el('button.btn.btn-big', { on: { click: () => go('onek') } }, el('span', t('c.onek')), el('span.mono.acc', t('c.onekSub', { n: DECKS.get('onek')?.cards.length || 0 }))),
    el('button.btn.btn-big', { on: { click: () => openSes() } }, el('span', t('c.sesOpen')), el('span.mono.acc', t('c.sesSub'))),
    el('div.kicker', t('c.soon')),
    el('div.list',
      ...[['c.gramer', 'v0.4'], ['c.yazma', 'v0.4']].map(([k, v]) =>
        el('div.lock', el('span', t(k)), el('span.r', v)))),
    el('div.note', t('c.soonNote')),
  );
  root.append(wrap);
}

export function recentErrorIds(days = 14) {
  const today = dayNum();
  return [...S.cards.values()].filter(st => st.lastErr != null && st.lastErr >= today - days)
    .sort((a, b) => b.lastErr - a.lastErr).map(st => st.id).slice(0, 30);
}
