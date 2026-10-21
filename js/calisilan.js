// Çalıştıkların: şimdiye kadar karşına çıkan bütün kartlar ve haftalık tur.
// Haftalık turda bu hafta (pazartesiden beri) görülmeyen kartlar gelir; en çok zorlandıkların ve unutmaya en yakınlar önce.
// Günün setinde ya da başka bir turda bu hafta görülen kart da "görüldü" sayılır.
import { el, dayNum, weekStart } from './util.js';
import { t } from './i18n.js';
import { S } from './store.js';
import { CARDS, DECKS } from './decks.js';
import * as fsrs from './fsrs.js';
import { startStudy } from './study.js';
import { showCard } from './sozluk.js';
import { go } from './main.js';

const CHUNK = 20;
const PAGE = 40;
const ui = { decks: null, hard: false, open: null, shown: {} };
const put = (w, ...xs) => w.append(...xs.filter(x => x != null && x !== false));

const errN = st => { const e = st.err || {}; return (e.yapi || 0) + (e.sonek || 0) + (e.imla || 0) + (e.bil || 0); };
const seenWeek = (st, ws) => st.last != null && st.last >= ws;
export const cardHead = c => c.f || c.v || c.cz?.[0]?.a?.[0] || c.a?.[0] || c.id;

function studied() {
  const out = [];
  for (const st of S.cards.values()) {
    if (!(st.st > 0)) continue;
    const c = CARDS.get(st.id);
    if (c) out.push({ c, st });
  }
  return out;
}
const filtered = list => list.filter(({ c, st }) => (!ui.decks || ui.decks.includes(c.deck)) && (!ui.hard || errN(st) > 0));

function ranked(list, today) {
  return list.map(x => ({ id: x.c.id, pri: Math.min(errN(x.st), 6) * 0.25 + (1 - fsrs.currentR(x.st, today)) }))
    .sort((a, b) => b.pri - a.pri).map(x => x.id);
}

// Bu hafta henüz görülmeyenler, sıralı
function weekQueue() {
  const today = dayNum(), ws = weekStart(today);
  return ranked(filtered(studied()).filter(x => !seenWeek(x.st, ws)), today);
}

// Masa ve Çalış için: süzgeçsiz durum
export function weekStatus() {
  const ws = weekStart(dayNum());
  const all = studied();
  const seen = all.filter(x => seenWeek(x.st, ws)).length;
  return { n: all.length, seen, left: all.length - seen };
}

function startWeek() {
  const ids = weekQueue().slice(0, CHUNK);
  if (!ids.length) return;
  startStudy('hafta', { ids, refill: () => weekQueue().slice(0, CHUNK) }, () => go('calisilan', true));
}

function startWeakest() {
  const ids = ranked(filtered(studied()), dayNum()).slice(0, CHUNK);
  if (ids.length) startStudy('hafta', { ids }, () => go('calisilan', true));
}

export function renderCalisilan(root) {
  const wrap = el('div.wrap');
  root.append(wrap);
  const today = dayNum(), ws = weekStart(today);
  const all = studied();
  const decksHere = [...new Set(all.map(x => x.c.deck))].filter(id => DECKS.has(id));
  if (ui.decks) ui.decks = ui.decks.filter(id => decksHere.includes(id));
  if (ui.decks && !ui.decks.length) ui.decks = null;
  const list = filtered(all);
  const seen = list.filter(x => seenWeek(x.st, ws)).length;
  const left = list.length - seen;
  const rerender = () => go('calisilan', true);

  put(wrap,
    el('div.topline', el('button.linkbtn', { on: { click: () => go('calis') } }, '‹ ' + t('tab.calis')), null),
    el('div.kicker', t('cl.kicker')),
    el('h1.h1', t('cl.title')));

  if (!all.length) { put(wrap, el('div.panel.note', t('cl.empty'))); return; }

  put(wrap,
    el('section.panel.sect',
      el('div.note', t('cl.intro')),
      el('div.gm-bar', el('i.ok', { style: { width: (list.length ? 100 * seen / list.length : 0) + '%' } })),
      el('div.mono.small', t('cl.stat', { n: list.length, seen, left })),
      left
        ? el('button.btn.btn-primary.btn-wide', { on: { click: startWeek } }, t('cl.start', { n: Math.min(CHUNK, left) }))
        : el('div.note.cl-done', t('cl.done')),
      el('button.btn.btn-wide', { on: { click: startWeakest } }, t('cl.weakest', { n: Math.min(CHUNK, list.length) }))),
    el('div.chips',
      decksHere.length > 1 ? decksHere.map(id => el('button.chip', { 'aria-pressed': String(!!ui.decks && ui.decks.includes(id)), on: { click: () => {
        const cur = ui.decks || [];
        ui.decks = cur.includes(id) ? cur.filter(x => x !== id) : [...cur, id];
        ui.open = null; rerender();
      } } }, DECKS.get(id).ad)) : null,
      el('button.chip', { 'aria-pressed': String(ui.hard), on: { click: () => { ui.hard = !ui.hard; ui.open = null; rerender(); } } }, t('cl.hard'))),
  );

  // türlere göre gruplar
  const groups = new Map();
  for (const x of list) { const k = x.c.t; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(x); }
  const rows = [];
  for (const [k, xs] of [...groups.entries()].sort((a, b) => b[1].length - a[1].length)) {
    const gSeen = xs.filter(x => seenWeek(x.st, ws)).length;
    const open = ui.open === k;
    rows.push(el('button.res.cl-group', { 'aria-expanded': String(open), on: { click: () => { ui.open = open ? null : k; rerender(); } } },
      el('span', el('span.cl-t', t('type.' + k)), el('span.slot', '  ' + t('cl.gStat', { n: xs.length, seen: gSeen })))));
    if (open) {
      xs.sort((a, b) => errN(b.st) - errN(a.st) || (b.st.seen || 0) - (a.st.seen || 0));
      const n = ui.shown[k] || PAGE;
      rows.push(el('div.cl-open',
        el('div.list', ...xs.slice(0, n).map(({ c, st }) => {
          const e = errN(st);
          return el('button.res', { on: { click: () => showCard(c.id) } },
            el('span', el('span.ru', cardHead(c)),
              seenWeek(st, ws) ? el('span.slot.cl-ok', '  ' + t('cl.thisWeek')) : null,
              e ? el('span.slot.cl-err', '  ' + t('cl.errN', { n: e })) : null),
            el('span.tr', c.q || ''));
        })),
        xs.length > n ? el('button.btn.btn-sm.btn-wide', { on: { click: () => { ui.shown[k] = n + PAGE; rerender(); } } }, t('cl.morePage', { n: Math.min(PAGE, xs.length - n) })) : null));
    }
  }
  put(wrap, el('div.list', ...rows), el('div.note', t('cl.weekNote')));
}
