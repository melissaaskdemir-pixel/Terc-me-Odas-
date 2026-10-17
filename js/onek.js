// Önekler: anlatım (önek önek), kök aileleri tablosu, kurallar; kartlarla çalışma
import { el, svg, ICON } from './util.js';
import { t } from './i18n.js';
import { S } from './store.js';
import { ONEK, DECKS } from './decks.js';
import * as plan from './plan.js';
import { startStudy } from './study.js';
import { go } from './main.js';
import { lookup } from './sozluk.js';

const ui = { view: 'onek', p: 'в', fam: null };
const put = (w, ...xs) => w.append(...xs.filter(x => x != null && x !== false));

function stateOf(id) {
  const st = S.cards.get(id);
  if (!st || !st.st) return 'new';
  return plan.isKnown(st) ? 'known' : 'learn';
}

function shuffled(a) {
  const b = [...a];
  for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; }
  return b;
}

const back = () => go('onek', true);
const study = ids => startStudy('onek', { ids: shuffled(ids) }, back);

// «входить / войти» → входить; «писать → написать» → написать; «заходить по комнате» → заходить
function lemmaOf(v) {
  const s = v.includes('→') ? v.split('→').pop() : v.split('/')[0];
  return s.trim().split(/\s+/)[0];
}

function verbRow(v, tr) {
  return el('button.res', { on: { click: () => lookup(lemmaOf(v)) } }, el('span.ru', v), el('span.tr', tr));
}

export function renderOnek(root) {
  const wrap = el('div.wrap');
  root.append(wrap);
  if (!ONEK) { put(wrap, el('div.panel', t('err.load'))); return; }
  const deck = DECKS.get('onek');
  const ids = deck ? deck.cards.map(c => c.id) : [];
  const n = { known: 0, learn: 0, new: 0 };
  for (const id of ids) n[stateOf(id)]++;
  const due = plan.countDue({ decks: ['onek'] });

  const seg = el('div.seg', { role: 'group' }, ...[['onek', 'on.vOnek'], ['aile', 'on.vAile'], ['kural', 'on.vKural']].map(([k, lab]) =>
    el('button', { 'aria-pressed': String(ui.view === k), on: { click: () => { ui.view = k; go('onek', true); } } }, t(lab))));

  put(wrap,
    el('div.topline', el('button.linkbtn', { on: { click: () => go('calis') } }, '‹ ' + t('tab.calis')), null),
    el('div.kicker', t('on.kicker')),
    el('h1.h1', t('on.title')),
    el('section.panel.sect',
      el('div.note', t('on.intro')),
      el('div.mono.small', t('on.prog', { k: n.known, l: n.learn, w: n.new, d: due })),
      el('button.btn.btn-primary.btn-wide', { on: { click: () => startStudy('tur', { decks: ['onek'], size: 20 }, back) } }, t('on.tur'))),
    seg);

  if (ui.view === 'onek') renderPrefixes(wrap);
  else if (ui.view === 'aile') renderFamilies(wrap);
  else renderRules(wrap);
}

function renderPrefixes(wrap) {
  const chips = el('div.chips.on-chips', ...ONEK.prefixes.map(p =>
    el('button.chip.ru', { 'aria-pressed': String(ui.p === p.k), on: { click: () => { ui.p = p.k; go('onek', true); } } }, p.k + '-')));
  const p = ONEK.prefixes.find(x => x.k === ui.p) || ONEK.prefixes[0];
  const panel = el('article.paper.on-card',
    el('div.ck', el('span', t('on.prefix')), el('span', p.cards.length ? t('on.nCards', { n: p.cards.length }) : '')),
    el('div.on-label.ru', p.label),
    el('div.on-core', p.core));
  for (const m of p.m) {
    put(panel, el('div.on-mt', m.t), el('div.list.on-list', ...m.v.map(([v, tr]) => verbRow(v, tr))));
  }
  if (p.opp) put(panel, el('div.meta', p.opp));
  if (p.trap) put(panel, el('div.on-trap', el('span.k', t('on.trap')), p.trap));
  put(wrap, chips, panel,
    p.cards.length ? el('button.btn.btn-wide', { on: { click: () => study(p.cards) } }, t('on.studyP', { p: p.k + '-', n: p.cards.length })) : el('div.note', t('on.noCards')),
    el('div.note', t('on.tapHint')));
}

function renderFamilies(wrap) {
  const list = el('div.list');
  for (const f of ONEK.families) {
    const open = ui.fam === f.id;
    const known = f.items.filter(it => stateOf(it.id) === 'known').length;
    list.append(el('button.res.on-fam', { 'aria-expanded': String(open), on: { click: () => { ui.fam = open ? null : f.id; go('onek', true); } } },
      el('span', el('span.ru', f.root), el('span.slot', '  ' + t('on.famN', { k: known, n: f.items.length }))),
      el('span.tr', f.tr)));
    if (open) {
      const tb = el('table.tbl.on-tbl', el('tr', el('th', t('on.thP')), el('th', t('on.thV')), el('th', t('on.thTr'))));
      for (const it of f.items) {
        const s = stateOf(it.id);
        tb.append(el('tr', { on: { click: () => lookup(lemmaOf(it.v)) } },
          el('td.k', el('i.on-dot.' + s), it.p), el('td.ru', it.v), el('td', it.tr)));
      }
      list.append(el('div.on-famopen', tb,
        el('button.btn.btn-wide', { on: { click: () => study(f.items.map(x => x.id)) } }, t('on.studyF', { n: f.items.length }))));
    }
  }
  put(wrap, el('div.note', t('on.famNote')), list,
    el('div.on-legend', el('span', el('i.on-dot.new'), t('on.lgNew')), el('span', el('i.on-dot.learn'), t('on.lgLearn')), el('span', el('i.on-dot.known'), t('on.lgKnown'))));
}

function renderRules(wrap) {
  for (const r of ONEK.kurallar) {
    put(wrap, el('section.panel.sect',
      el('h2.h2', r.b),
      el('div.on-text', r.t),
      el('div.list.on-list', ...r.ex.map(([v, tr]) => el('div.res', el('span.ru', v), el('span.tr', tr))))));
  }
}
