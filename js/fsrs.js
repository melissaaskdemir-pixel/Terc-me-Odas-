// FSRS-5 aralıklı tekrar zamanlayıcısı (varsayılan parametreler, open-spaced-repetition)
// Derecelendirme: 1 Tekrar (bilemedi), 2 Zor, 3 İyi, 4 Kolay
const W = [0.40255, 1.18385, 3.173, 15.69105, 7.1949, 0.5345, 1.4604, 0.0046, 1.54575, 0.1192, 1.01925,
  1.9395, 0.11, 0.29605, 2.2698, 0.2315, 2.9898, 0.51655, 0.6621];
const DECAY = -0.5;
const FACTOR = 19 / 81;
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

export const NEW = 0, LEARNING = 1, REVIEW = 2, RELEARNING = 3;

export function retrievability(elapsedDays, s) {
  if (!s) return 0;
  return Math.pow(1 + FACTOR * Math.max(0, elapsedDays) / s, DECAY);
}

export function intervalFor(s, retention = 0.9) {
  return s / FACTOR * (Math.pow(retention, 1 / DECAY) - 1);
}

const initS = g => W[g - 1];
const initD = g => clamp(W[4] - Math.exp(W[5] * (g - 1)) + 1, 1, 10);

function nextD(d, g) {
  const delta = -W[6] * (g - 3);
  const d1 = d + delta * (10 - d) / 9;
  return clamp(W[7] * initD(4) + (1 - W[7]) * d1, 1, 10);
}
function recallS(d, s, r, g) {
  const hard = g === 2 ? W[15] : 1;
  const easy = g === 4 ? W[16] : 1;
  return s * (1 + Math.exp(W[8]) * (11 - d) * Math.pow(s, -W[9]) * (Math.exp(W[10] * (1 - r)) - 1) * hard * easy);
}
function forgetS(d, s, r) {
  return Math.min(s, W[11] * Math.pow(d, -W[12]) * (Math.pow(s + 1, W[13]) - 1) * Math.exp(W[14] * (1 - r)));
}
function shortS(s, g) { return s * Math.exp(W[17] * (g - 3 + W[18])); }

/**
 * Bir kartın durumunu derecelendirmeyle günceller.
 * st: {st, s, d, last (gün), reps, lapses}
 * today: gün numarası
 * Dönüş: yeni durum + ivl (gün). Tekrar (1) alan kart oturum içinde yeniden sorulur; ivl 0 olabilir.
 */
export function review(st, g, today, retention = 0.9, seed = 0) {
  const out = { ...st };
  if (!st.st || st.st === NEW || st.s == null) {
    out.s = initS(g);
    out.d = initD(g);
  } else {
    const elapsed = today - (st.last ?? today);
    if (elapsed < 1) {
      out.s = Math.max(0.1, shortS(st.s, g));
    } else {
      const r = retrievability(elapsed, st.s);
      out.s = g === 1 ? forgetS(st.d, st.s, r) : recallS(st.d, st.s, r, g);
    }
    out.d = nextD(st.d, g);
  }
  out.reps = (st.reps || 0) + 1;
  if (g === 1 && st.st === REVIEW) out.lapses = (st.lapses || 0) + 1;
  out.st = g === 1 ? (st.st === REVIEW || st.st === RELEARNING ? RELEARNING : LEARNING) : REVIEW;
  out.last = today;
  let ivl = intervalFor(out.s, retention);
  if (g === 1) ivl = Math.min(ivl, 1);
  // ±%5 dağıtma, yükü günlere yaymak için (aynı kart her seferinde aynı sapmayı almasın diye seed)
  if (ivl > 2.5) {
    const f = 0.95 + ((seed % 1000) / 1000) * 0.1;
    ivl *= f;
  }
  ivl = Math.round(clamp(ivl, g === 1 ? 0 : 1, 36500));
  if (g > 1) ivl = Math.max(1, ivl);
  out.due = today + ivl;
  out.ivl = ivl;
  return out;
}

export function currentR(st, today) {
  if (!st || !st.s) return 0;
  return retrievability(today - (st.last ?? today), st.s);
}
