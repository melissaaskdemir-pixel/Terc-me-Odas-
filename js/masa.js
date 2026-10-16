// Masa: günün seti, halka, seri, bilinen kelime, ısı haritası, iddia, haftalık brifing
import { el, dayNum, fmtDay, weekStart, monthShort, dayOfMonth, fmtNum, pct } from './util.js';
import { t } from './i18n.js';
import { S, set, dayRec, saveProf } from './store.js';
import * as plan from './plan.js';
import { ring, modal, confirmBox } from './ui.js';
import { startStudy } from './study.js';
import { go } from './main.js';
import { okumaStatus } from './okuma.js';

export function renderMasa(root) {
  const today = dayNum();
  const day = dayRec(today);
  const goal = set('halka');
  const st = plan.streak(today);
  const known = plan.knownCount();
  const ws = weekStart(today);
  const snap = S.prof.weekSnap?.[ws];
  const delta = snap != null ? known - snap : 0;
  const due = plan.countDue();
  const newLeft = plan.newAllowance(today);
  const left = Math.max(0, goal - day.n);
  const dosya = String(Math.max(1, today - plan_dayOf(S.prof.installedAt) + 1)).padStart(4, '0');

  const freezes = S.prof.freezes ? el('span.muted', t('m.freezeN', { n: S.prof.freezes })) : null;

  const wrap = el('div.wrap',
    installHint(),
    el('div.topline', el('span.kicker', `ДОСЬЕ № ${dosya}`),
      el('span.badge', { title: t('m.streakTitle') }, t('m.streak', { n: st.n }), freezes)),
    el('div.muted', { style: { marginTop: '-10px', fontSize: '14px' } }, fmtDay(today, { weekday: true })),

    el('div.ringrow',
      ring(day.n, goal, { label: t('m.ringLabel', { n: day.n, g: goal }) }),
      el('div.known', { style: { display: 'flex', flexDirection: 'column', gap: '6px' } },
        el('div.mono.muted', { style: { fontSize: '13px' } }, t('m.known')),
        el('div.v', fmtNum(known)),
        el('div.d', delta > 0 ? t('m.knownDelta', { n: delta }) : t('m.learning', { n: plan.learningCount() })))),

    el('button.btn.btn-primary.btn-big', { on: { click: () => startStudy('gunun', {}, () => go('masa')) } },
      el('span', left > 0 ? (day.n ? t('m.continueSet') : t('m.openSet')) : t('m.extraSet')),
      el('span.mono.acc', left > 0 ? t('m.cardsLeft', { n: left }) : t('m.plus20'))),
    el('div.note', { style: { marginTop: '-8px' } }, t('m.plan', { due, nw: newLeft }) + (due > goal ? ' ' + t('m.heavy') : '')),

    !st.todayDone ? el('button.btn.btn-wide', { on: { click: () => startStudy('mini', {}, () => go('masa')) } },
      t('m.mini', { n: plan.MINI })) : null,

    el('div.grid3',
      stat(day.pts || 0, t('m.ptsToday')),
      stat(acc7(today) + '%', t('m.acc7')),
      stat(S.prof.best || st.n, t('m.best'))),

    el('div.list',
      el('button', { on: { click: () => go('calis') } }, el('span', t('m.lKelime')), el('span.r', t('m.lDue', { n: due }))),
      el('button', { on: { click: () => go('okuma') } }, el('span', t('m.lOkuma')), okStatus()),
      el('button', { on: { click: () => go('arsiv') } }, el('span', t('m.lHata')), el('span.r', t('m.lHataN', { n: recentErrCount(today) })))),

    ydsPanel(),
    betPanel(today),
    el('div.sect', el('div.kicker', t('m.heat')), heatmap(today)),
    weeklyButton(today),
  );
  root.append(wrap);
}

function okStatus() {
  const r = el('span.r', '…');
  okumaStatus().then(x => { r.textContent = x; }).catch(() => { r.textContent = ''; });
  return r;
}

function installHint() {
  const standalone = window.navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches;
  if (standalone || S.prof.installHintClosed) return null;
  const box = el('div.panel.sect', el('div.kicker', t('m.installK')), el('div.note', t('m.install')),
    el('button.linkbtn', { on: { click: async () => { S.prof.installHintClosed = true; await saveProf(); box.remove(); } } }, t('m.installClose')));
  return box;
}

function plan_dayOf(ts) { return dayNum(ts || Date.now()); }

function stat(v, k) { return el('div.stat', el('span.v', String(v)), el('span.k', k)); }

function acc7(today) {
  let n = 0, ok = 0;
  for (let d = today - 6; d <= today; d++) { const r = S.days.get(d); if (r) { n += r.n; ok += r.ok; } }
  return pct(ok, n);
}

function recentErrCount(today) {
  let n = 0;
  for (const st of S.cards.values()) if (st.lastErr != null && st.lastErr >= today - 13) n++;
  return n;
}

function ydsPanel() {
  return el('div.panel', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' } },
    el('div', el('div.kicker', t('m.yds')), el('div.note', t('m.ydsNote'))),
    el('div.mono', { style: { fontSize: '28px' } }, String(set('ydsBase')).replace('.', ',')));
}

function betPanel(today) {
  const bet = S.prof.bet;
  if (bet && bet.state === 'active') {
    const dots = el('div.betdots');
    for (let i = 0; i < 7; i++) {
      const d = bet.start + i;
      const r = S.days.get(d);
      dots.append(el('i' + (r && r.goalHit ? '.on' : (d < today ? '.miss' : ''))));
    }
    return el('div.panel.sect', el('div.kicker', t('m.betActive')), dots, el('div.note', t('m.betRule')));
  }
  const res = bet && bet.state !== 'active' && bet.end != null && today - bet.end <= 2
    ? el('div.note', bet.state === 'won' ? t('m.betWon') : t('m.betLost')) : null;
  return el('div.panel.sect', el('div.kicker', t('m.bet')), res, el('div.note', t('m.betOffer')),
    el('button.btn.btn-sm', {
      on: {
        click: async () => {
          if (await confirmBox(t('m.betConfirm'), t('m.betYes'), t('m.betNo'))) { await plan.startBet(); go('masa'); }
        },
      },
    }, t('m.betStart')));
}

export function heatmap(today, weeks = 18) {
  const start = weekStart(today) - (weeks - 1) * 7;
  const grid = el('div.heat', { role: 'img', 'aria-label': t('m.heat') });
  const months = el('div.heatmo');
  let lastM = '';
  for (let w = 0; w < weeks; w++) {
    const d0 = start + w * 7;
    const m = monthShort(d0);
    months.append(el('span', m !== lastM && dayOfMonth(d0) <= 7 ? m : ' '));
    lastM = m;
    for (let i = 0; i < 7; i++) {
      const d = d0 + i;
      const r = S.days.get(d);
      let cls = '';
      if (d > today) cls = '.pad';
      else if (r && r.frozen && !r.n) cls = '.fz';
      else if (r && r.n) cls = r.n >= 60 ? '.l4' : r.n >= 40 ? '.l3' : r.n >= 20 ? '.l2' : '.l1';
      if (d === today) cls += '.today';
      grid.append(el('i' + cls, { title: `${fmtDay(d)}: ${r ? r.n : 0}` }));
    }
  }
  grid.style.gridTemplateColumns = `repeat(${weeks}, 1fr)`;
  months.style.display = 'grid';
  months.style.gridTemplateColumns = `repeat(${weeks}, 1fr)`;
  return el('div', { style: { display: 'flex', flexDirection: 'column', gap: '4px' } }, months, grid);
}

// ---------------------------------------------------------------- haftalık brifing (Pazartesi)
function weeklyButton(today) {
  const ws = weekStart(today);
  const prev = ws - 7;
  const hasData = [...S.days.keys()].some(d => d >= prev && d < ws);
  if (!hasData) return null;
  return el('button.btn.btn-wide', { on: { click: () => showBriefing(prev) } }, t('m.brief'));
}

export async function maybeBriefing() {
  const today = dayNum();
  const ws = weekStart(today);
  if (S.prof.lastBrief === ws) return;
  const prev = ws - 7;
  const hasData = [...S.days.keys()].some(d => d >= prev && d < ws && S.days.get(d).n > 0);
  S.prof.lastBrief = ws;
  await saveProf();
  if (hasData) showBriefing(prev);
}

export async function showBriefing(ws) {
  const s = await plan.weekSummary(ws);
  const weakest = Object.entries({ yapi: s.err.yapi, sonek: s.err.sonek, imla: s.err.imla }).sort((a, b) => b[1] - a[1])[0];
  const best = [...s.days].sort((a, b) => b.n - a.n)[0];
  const y = new Date((ws + 3) * 86400e3).getUTCFullYear();
  const weekNo = Math.floor((ws - weekStart(Math.floor(Date.UTC(y, 0, 4) / 86400e3))) / 7) + 1;
  modal(close => el('div.paper.brief', { style: { display: 'flex', flexDirection: 'column', gap: '12px' } },
    el('h3', `СВОДКА · ${t('b.week')} ${weekNo}`),
    el('div.mono', { style: { fontSize: '12px', color: 'var(--p-kicker)' } }, `${fmtDay(ws)} – ${fmtDay(ws + 6, { year: true })}`),
    el('p', el('span.no', '1.'), t('b.activity', { n: s.n, active: s.active, goal: s.goalDays })),
    el('p', el('span.no', '2.'), t('b.accuracy', { p: pct(s.ok, s.first), nw: s.nw, pts: s.pts })),
    el('p', el('span.no', '3.'), t('b.errors', { y: s.err.yapi, s: s.err.sonek, i: s.err.imla, b: s.err.bil })),
    best && best.n ? el('p', el('span.no', '4.'), t('b.best', { d: fmtDay(best.day, { weekday: true }), n: best.n })) : null,
    el('p', el('span.no', '5.'), weakest && weakest[1] ? t('b.focus.' + weakest[0]) : t('b.focus.none')),
    el('button.btn.btn-primary', { on: { click: close } }, t('b.close'))));
}
