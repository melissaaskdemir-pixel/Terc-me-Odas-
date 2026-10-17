// Kelime kapsamı: sıklık sırasına göre ilk N kelimeyi bilen biri metinlerin yüzde kaçını anlar?
// Eğri (YDS metinleri / gündelik dil), kaydırıcı, karartılmış örnek metin ve kelime dağarcığı testi.
import { el, svg, dayNum, fmtDay, fmtNum } from './util.js';
import { t } from './i18n.js';
import { S, saveProf } from './store.js';
import { loadIndex, rankMap } from './sozluk.js';
import { sampleTexts } from './okuma.js';
import { go } from './main.js';
import { sfx } from './audio.js';
import { haptic } from './fx.js';

let K = null, kP = null;
const ui = { curve: 'yds', n: null, sample: 0, test: null };

function loadK() {
  if (!kP) kP = fetch('data/kapsam.json').then(r => r.json()).then(d => (K = d)).catch(e => { kP = null; throw e; });
  return kP;
}

// x ekseni karekök ölçekli (ilk binler sıkışmasın)
const toX = n => Math.sqrt(n / K.nmax);
const fromX = x => Math.round(K.nmax * x * x);
export function coverage(n, which = 'yds') {
  if (!K) return null;
  const arr = K[which];
  const f = Math.min(arr.length - 1, n / K.step);
  const i = Math.floor(f), j = Math.min(arr.length - 1, i + 1);
  return (arr[i] + (arr[j] - arr[i]) * (f - i)) / 10;
}

export function renderKapsam(root) {
  const wrap = el('div.wrap');
  root.append(wrap);
  Promise.all([loadK(), loadIndex(), sampleTexts()]).then(([, , samples]) => {
    if (!wrap.isConnected) return;
    if (ui.test) return renderTest(wrap);
    renderMain(wrap, samples);
  }).catch(e => { console.error(e); wrap.append(el('div.panel', t('err.load'))); });
}

// ---------------------------------------------------------------- ana ekran
async function renderMain(wrap, samples) {
  const ranks = await rankMap();
  const vocab = S.prof.vocab;
  if (ui.n == null) ui.n = vocab ? Math.min(K.nmax, vocab.n) : 2000;

  const W = 340, H = 168, PL = 34, PB = 18, PT = 8;
  const cw = W - PL - 4, ch = H - PB - PT;
  const chart = el('div.kp-chart');
  const big = el('div.kp-big');
  const text = el('div.okt.kp-text');
  const slider = el('input.kp-slider', { type: 'range', min: 0, max: 1000, step: 1, value: Math.round(1000 * toX(ui.n)), 'aria-label': t('k.slider') });

  const pathFor = (arr, upto) => {
    let d = `M${PL},${PT + ch}`;
    for (let i = 0; i < arr.length; i++) {
      const n = Math.min(K.nmax, i * K.step);
      if (upto != null && n > upto) break;
      d += ` L${(PL + cw * toX(n)).toFixed(1)},${(PT + ch * (1 - arr[i] / 1000)).toFixed(1)}`;
    }
    return d;
  };
  const draw = () => {
    const arr = K[ui.curve];
    const xN = PL + cw * toX(ui.n);
    const yN = PT + ch * (1 - coverage(ui.n, ui.curve) / 100);
    const full = pathFor(arr);
    const part = pathFor(arr, ui.n) + ` L${xN.toFixed(1)},${yN.toFixed(1)} L${xN.toFixed(1)},${PT + ch} Z`;
    const ticks = [0, 1000, 3000, 6000, 10000].filter(n => n <= K.nmax);
    const me = vocab ? PL + cw * toX(Math.min(K.nmax, vocab.n)) : null;
    chart.innerHTML = '';
    chart.append(svg(`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${t('k.chartAria')}">
      ${[0, 50, 100].map(p => `<line x1="${PL}" x2="${W - 4}" y1="${PT + ch * (1 - p / 100)}" y2="${PT + ch * (1 - p / 100)}" class="kp-grid"/>
        <text x="${PL - 6}" y="${PT + ch * (1 - p / 100) + 4}" text-anchor="end" class="kp-ax">%${p}</text>`).join('')}
      ${ticks.map(n => `<text x="${PL + cw * toX(n)}" y="${H - 3}" text-anchor="middle" class="kp-ax">${n >= 1000 ? n / 1000 + ' bin' : n}</text>`).join('')}
      <path d="${full} L${PL + cw},${PT + ch} Z" class="kp-rest"/>
      <path d="${part}" class="kp-fill"/>
      <path d="${full}" class="kp-line"/>
      ${me != null ? `<line x1="${me}" x2="${me}" y1="${PT}" y2="${PT + ch}" class="kp-me"/><text x="${me + 4}" y="${PT + ch - 6}" class="kp-melab">${t('k.you')}</text>` : ''}
      <circle cx="${xN}" cy="${yN}" r="4.5" class="kp-dot"/>
    </svg>`));
    const pc = coverage(ui.n, ui.curve);
    big.innerHTML = '';
    big.append(el('span.mono.kp-n', fmtNum(ui.n)), ' ', t('k.wordsShort'), ' → ',
      el('span', t(ui.curve === 'yds' ? 'k.covYds' : 'k.covGun', { p: Math.round(pc) })));
    drawText();
  };
  const drawText = () => {
    const smp = samples[ui.sample % samples.length];
    text.innerHTML = '';
    let total = 0, hidden = 0;
    for (const s of smp.sents) {
      const sp = el('span');
      let last = 0, first = true;
      for (const m of s.matchAll(/[А-Яа-яЁё]+(?:-[А-Яа-яЁё]+)*/g)) {
        if (m.index > last) sp.append(s.slice(last, m.index));
        const w = m[0];
        const l = smp.lemma(w.toLowerCase());
        const name = !first && /^[А-ЯЁ]/.test(w);
        const r = ranks.get(l) || ranks.get(l.replace(/ё/g, 'е')) || 0;
        const hide = !name && (!r || r > ui.n);
        total++; if (hide) hidden++;
        sp.append(hide ? el('span.kp-x', { 'aria-label': t('k.hidden') }, w) : w);
        last = m.index + w.length;
        first = false;
      }
      if (last < s.length) sp.append(s.slice(last));
      text.append(sp, ' ');
    }
    textNote.textContent = t('k.sampleNote', { p: Math.round(100 * (total - hidden) / Math.max(1, total)), src: smp.title });
  };
  const textNote = el('div.meta.small');

  // her %5 kapsamda bir hafif tık: kaydırıcı çentikli hissettirir
  let notch = Math.floor(coverage(ui.n, ui.curve) / 5);
  slider.addEventListener('input', () => {
    ui.n = fromX(slider.value / 1000); draw();
    const k = Math.floor(coverage(ui.n, ui.curve) / 5);
    if (k !== notch) { notch = k; haptic(); }
  });

  const seg = el('div.seg', { role: 'group' }, ...[['yds', t('k.yds')], ['gun', t('k.gun')]].map(([v, lab]) => el('button', {
    'aria-pressed': String(ui.curve === v),
    on: { click: e => { ui.curve = v; seg.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b === e.currentTarget))); draw(); } },
  }, lab)));

  const meBox = el('div.panel.sect',
    vocab ? [
      el('div.kicker', t('k.myKicker')),
      el('div.kp-mine', el('span.mono', vocab.top ? t('k.over', { n: fmtNum(K.nmax) }) : '≈ ' + fmtNum(vocab.n)), ' ', el('span', t('k.wordsShort'))),
      el('div.note', t('k.myLine', { y: Math.round(coverage(Math.min(K.nmax, vocab.n), 'yds')), g: Math.round(coverage(Math.min(K.nmax, vocab.n), 'gun')), d: fmtDay(vocab.at) })),
      el('button.btn.btn-sm', { on: { click: () => startTest() } }, t('k.retest')),
    ] : [
      el('div.kicker', t('k.myKicker')),
      el('div.note', t('k.noTest')),
      el('button.btn.btn-primary', { on: { click: () => startTest() } }, t('k.test')),
    ]);

  wrap.append(
    el('div.topline', el('button.linkbtn', { on: { click: () => go('masa') } }, '‹ ' + t('tab.masa')), seg),
    el('div.kicker', t('k.kicker')),
    el('h1.h1', t('k.title')),
    chart, slider, big,
    el('div.paper.okp', text, textNote,
      el('button.linkbtn', { style: { alignSelf: 'flex-start', color: 'var(--p-muted)' }, on: { click: () => { ui.sample++; drawText(); } } }, t('k.other'))),
    meBox,
    el('div.note', t('k.how')),
    el('div.note', K.note),
  );
  draw();
}

// ---------------------------------------------------------------- kelime dağarcığı testi
const PER_BAND = 5, PSEUDO_N = 14;
function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

function startTest() {
  const items = [];
  K.bands.forEach((b, bi) => shuffle([...b.w]).slice(0, PER_BAND).forEach(w => items.push({ w, b: bi })));
  shuffle([...K.pseudo]).slice(0, PSEUDO_N).forEach(w => items.push({ w, b: -1 }));
  // kolaydan zora: bant sırasına yakın, sahte kelimeler serpiştirilmiş
  items.sort((a, b) => ((a.b < 0 ? Math.random() * K.bands.length : a.b) + Math.random() * 2.5) - ((b.b < 0 ? Math.random() * K.bands.length : b.b) + Math.random() * 2.5));
  ui.test = { items, i: -1, ans: [] };
  go('kapsam');
}

function renderTest(wrap) {
  const T = ui.test;
  if (T.i < 0) {
    wrap.append(
      el('div.topline', el('button.linkbtn', { on: { click: () => { ui.test = null; go('kapsam'); } } }, '‹ ' + t('k.back')), null),
      el('div.kicker', t('k.testKicker')),
      el('h1.h1', t('k.testTitle')),
      el('div.paper.okp', el('p', { style: { margin: 0, fontSize: '16px', lineHeight: '1.5' } }, t('k.testIntro', { n: T.items.length })),
        el('button.btn.btn-primary.btn-wide', { on: { click: () => { T.i = 0; go('kapsam'); } } }, t('k.start'))),
    );
    return;
  }
  if (T.i >= T.items.length) return renderResult(wrap);
  const it = T.items[T.i];
  const answer = yes => {
    T.ans[T.i] = yes;
    T.i++;
    sfx('paper');
    go('kapsam');
  };
  const back = T.i > 0 ? el('button.linkbtn', { on: { click: () => { T.i--; go('kapsam'); } } }, t('k.undo')) : el('span');
  wrap.append(
    el('div.topline', el('button.linkbtn', { on: { click: () => { ui.test = null; go('kapsam'); } } }, t('k.quit')), el('span.mono.muted', `${T.i + 1}/${T.items.length}`)),
    el('div.kp-prog', el('i', { style: { width: (100 * T.i / T.items.length) + '%' } })),
    el('div.paper.kp-card', el('div.lab', t('k.q')), el('div.kp-word.ru', it.w)),
    el('div.grid2',
      el('button.btn.btn-big', { style: { justifyContent: 'center' }, on: { click: () => answer(false) } }, t('k.no')),
      el('button.btn.btn-primary.btn-big', { style: { justifyContent: 'center' }, on: { click: () => answer(true) } }, t('k.yes'))),
    el('div', { style: { textAlign: 'center' } }, back),
    el('div.note', t('k.testHint')),
  );
}

function estimate(T) {
  const ps = T.items.map((x, i) => [x, T.ans[i]]).filter(([x]) => x.b < 0);
  const fa = ps.length ? ps.filter(([, a]) => a).length / ps.length : 0;
  let n = 0;
  const pc = K.bands.map((b, bi) => {
    const rs = T.items.map((x, i) => [x, T.ans[i]]).filter(([x]) => x.b === bi);
    const p = rs.length ? rs.filter(([, a]) => a).length / rs.length : 0;
    const c = fa < 1 ? Math.max(0, (p - fa) / (1 - fa)) : 0;
    n += c * (b.b - b.a + 1);
    return Math.round(c * 100) / 100;
  });
  const top = pc.slice(-2).every(c => c >= 0.8);
  return { n: Math.round(n / 50) * 50, fa: Math.round(fa * 100) / 100, faN: ps.filter(([, a]) => a).length, faT: ps.length, bands: pc, top, at: dayNum() };
}

function renderResult(wrap) {
  const T = ui.test;
  if (!T.res) {
    T.res = estimate(T);
    S.prof.vocab = { n: T.res.n, fa: T.res.fa, bands: T.res.bands, top: T.res.top, at: T.res.at };
    saveProf();
    ui.n = Math.min(K.nmax, T.res.n);
  }
  const r = T.res;
  wrap.append(
    el('div.kicker', t('k.resKicker')),
    el('h1.h1', r.top ? t('k.over', { n: fmtNum(K.nmax) }) : '≈ ' + fmtNum(r.n) + ' ' + t('k.wordsShort')),
    el('div.paper.okp',
      el('div.ans.small', t('k.resYds', { p: Math.round(coverage(Math.min(K.nmax, r.n), 'yds')) })),
      el('div.meta', t('k.resGun', { p: Math.round(coverage(Math.min(K.nmax, r.n), 'gun')) })),
      el('div.meta', t('k.resFa', { a: r.faN, b: r.faT })),
      r.top ? el('div.meta', t('k.resTop')) : null,
      el('div.kp-bands', ...r.bands.map((c, i) => el('div.kp-band', { title: `${K.bands[i].a}–${K.bands[i].b}` },
        el('i', { style: { height: Math.max(2, c * 100) + '%' } })))),
      el('div.meta.small', t('k.bandsNote'))),
    el('button.btn.btn-primary.btn-wide', { on: { click: () => { ui.test = null; go('kapsam'); } } }, t('k.toCurve')),
  );
}
