// Yazma: biçim (çekim, uyum, yönetim), sade → resmî, Türkçeden çeviri. Kartlar çalışma ekranında yazılarak cevaplanır.
import { el } from './util.js';
import { t } from './i18n.js';
import { S } from './store.js';
import { YAZMA, DECKS } from './decks.js';
import * as plan from './plan.js';
import { startStudy } from './study.js';
import { go } from './main.js';

const put = (w, ...xs) => w.append(...xs.filter(x => x != null && x !== false));
const back = () => go('yazma', true);

function shuffled(a) {
  const b = [...a];
  for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; }
  return b;
}

function stats(ids) {
  let known = 0, seen = 0, err = 0;
  for (const id of ids) {
    const st = S.cards.get(id);
    if (!st || !st.st) continue;
    seen++;
    if (plan.isKnown(st)) known++;
    if (st.err && (st.err.sonek || st.err.yapi || st.err.imla)) err++;
  }
  return { known, seen, err };
}

export function renderYazma(root) {
  const wrap = el('div.wrap');
  root.append(wrap);
  if (!YAZMA || !DECKS.get('yazma')) { put(wrap, el('div.panel', t('err.load'))); return; }
  const cards = DECKS.get('yazma').cards;
  const byCat = {};
  for (const c of cards) (byCat[c.cat] = byCat[c.cat] || []).push(c.id);
  const due = plan.countDue({ decks: ['yazma'] });

  const catRow = cat => {
    const ids = byCat[cat.id] || [];
    const s = stats(ids);
    return el('button.res.yz-cat', { on: { click: () => startStudy('yazma', { ids: shuffled(ids) }, back) } },
      el('span', el('span.yz-ad', cat.ad), el('span.slot', '  ' + t('yz.catN', { k: s.known, n: ids.length }))),
      el('span.tr', cat.g));
  };
  const forms = YAZMA.cats.filter(c => c.kind === 'form');
  const reg = YAZMA.cats.find(c => c.kind === 'reg');
  const cev = YAZMA.cats.find(c => c.kind === 'ceviri');

  put(wrap,
    el('div.topline', el('button.linkbtn', { on: { click: () => go('calis') } }, '‹ ' + t('tab.calis')), null),
    el('div.kicker', t('yz.kicker')),
    el('h1.h1', t('yz.title')),
    el('section.panel.sect',
      el('div.note', t('yz.intro')),
      el('div.mono.small', t('yz.due', { d: due })),
      el('button.btn.btn-primary.btn-wide', { on: { click: () => startStudy('tur', { decks: ['yazma'], size: 20 }, back) } }, t('yz.tur'))),
    el('div.kicker', t('yz.form')),
    el('div.note', t('yz.formNote')),
    el('div.list', ...forms.map(catRow)),
    el('div.kicker', t('yz.reg')),
    el('div.note', t('yz.regNote')),
    reg ? el('div.list', catRow(reg)) : null,
    el('div.kicker', t('yz.cev')),
    el('div.note', t('yz.cevNote')),
    cev ? el('div.list', catRow(cev)) : null,
  );
}
