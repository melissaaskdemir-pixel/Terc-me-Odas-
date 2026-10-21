// Günün planı, oturum kuyruğu, puanlama, seri ve kilometre taşları
import { S, set, cardState, dayRec, commit, saveProf } from './store.js';
import { CARDS, DECKS, TYPE_GROUP, expected, variantCount } from './decks.js';
import * as fsrs from './fsrs.js';
import { dayNum, hash32, clamp, weekStart } from './util.js';
import * as db from './db.js';

const sigmoid = x => 1 / (1 + Math.exp(-x));
export const TARGET_P = 0.85;
export const MINI = 5;

export function deckOn(id) { return S.settings.decks[id] !== false; }
export function deckWeight(id) { return S.settings.deckW[id] ?? 1; }

export function newAllowance(day = dayNum()) {
  const r = dayRec(day);
  return Math.max(0, set('yeni') + (S.prof.extraNew?.[day] || 0) - r.nw);
}

export function isKnown(st) { return !!st && (st.known || (st.st === fsrs.REVIEW && st.s >= 10)); }
// cümle alıştırmaları (biçim, register, çeviri) kelime sayacına girmez
const NOT_WORD = new Set(['form', 'reg', 'ceviri']);
const wordCard = id => { const c = CARDS.get(id); return !!c && !NOT_WORD.has(c.t); };
export function knownCount() { let n = 0; for (const st of S.cards.values()) if (wordCard(st.id) && isKnown(st)) n++; return n; }
export function learningCount() { let n = 0; for (const st of S.cards.values()) if (wordCard(st.id) && st.st > 0 && !isKnown(st)) n++; return n; }

// ---------------------------------------------------------------- aday listeleri
function filterFn({ decks, types }) {
  return c => (decks ? decks.includes(c.deck) : deckOn(c.deck)) && (!types || types.includes(TYPE_GROUP[c.t] || c.t));
}

function recentWeakType() {
  const today = dayNum();
  const agg = { imla: 0, sonek: 0, yapi: 0 };
  for (let d = today - 6; d <= today; d++) {
    const r = S.days.get(d);
    if (r) for (const k in agg) agg[k] += r.err?.[k] || 0;
  }
  const top = Object.entries(agg).sort((a, b) => b[1] - a[1])[0];
  return top && top[1] > 0 ? top[0] : null;
}

export function dueList(opts = {}, today = dayNum()) {
  const f = filterFn(opts);
  const weak = recentWeakType();
  const out = [];
  for (const st of S.cards.values()) {
    if (!st.st || st.due == null || st.due > today) continue;
    const c = CARDS.get(st.id);
    if (!c || !f(c)) continue;
    const r = fsrs.currentR(st, today);
    out.push({ id: st.id, pri: (1 - r) + (weak && st.err?.[weak] ? 0.2 : 0) + (st.due < today ? 0.05 : 0) });
  }
  return out.sort((a, b) => b.pri - a.pri).map(x => x.id);
}

export function countDue(opts = {}) { return dueList(opts).length; }

export function newPool(deckId, opts = {}) {
  const d = DECKS.get(deckId);
  if (!d) return [];
  const f = filterFn(opts);
  return d.cards.filter(c => f(c) && !(S.cards.get(c.id)?.st > 0) && !S.cards.get(c.id)?.known).sort((a, b) => a.o - b.o);
}

export function countNew(opts = {}) {
  let n = 0;
  for (const [id] of DECKS) if (opts.decks ? opts.decks.includes(id) : deckOn(id)) n += newPool(id, opts).length;
  return n;
}

// Elo'ya göre hedef başarıya (%85) en yakın yeni kartı seç
function pickNew(deckId, opts, exclude) {
  const pool = newPool(deckId, opts).filter(c => !exclude.has(c.id)).slice(0, 25);
  if (!pool.length) return null;
  const th = S.prof.theta || 0;
  let best = pool[0], bd = 9;
  pool.forEach((c, i) => {
    const b = S.cards.get(c.id)?.b ?? c.d ?? 0;
    const dist = Math.abs(sigmoid(th - b) - TARGET_P) + i * 0.004; // sırayı da hafifçe gözet
    if (dist < bd) { bd = dist; best = c; }
  });
  return best.id;
}

function pickNewAny(opts, exclude) {
  const ids = [...DECKS.keys()].filter(id => (opts.decks ? opts.decks.includes(id) : deckOn(id)));
  const avail = ids.map(id => ({ id, w: deckWeight(id), n: newPool(id, opts).filter(c => !exclude.has(c.id)).length })).filter(x => x.n && x.w > 0);
  if (!avail.length) return null;
  // ağırlıklı sıra: bugün o desteden kaç yeni kart verildiğine göre
  const today = dayNum();
  if (!S._ng || S._ng.day !== today) S._ng = { day: today, c: {} };
  const given = S._ng.c;
  avail.sort((a, b) => ((given[a.id] || 0) / a.w) - ((given[b.id] || 0) / b.w));
  const id = pickNew(avail[0].id, opts, exclude);
  if (id) given[avail[0].id] = (given[avail[0].id] || 0) + 1;
  return id;
}

// Pekiştirme: vadesi gelmemiş ama zayıf kartlar; bugün hata yapılanlar önce.
// Bu oturumda yakın zamanda sorulan kartlar (son 12 seçim) dışarıda kalır.
function reinforceList(opts, sess, today = dayNum()) {
  const f = filterFn(opts);
  const out = [];
  for (const st of S.cards.values()) {
    if (!st.st || st.known) continue;
    const lp = sess.lastPick[st.id];
    if (lp != null && sess.picks - lp < 12) continue;
    if (sess.pending.some(p => p.item.id === st.id)) continue;
    const c = CARDS.get(st.id);
    if (!c || !f(c)) continue;
    const errToday = st.lastErr === today ? 1 : 0;
    const r = st.last === today ? 0.5 + Math.min(0.49, (st.s || 0) / 40) : fsrs.currentR(st, today);
    out.push({ id: st.id, k: r - errToday });
  }
  return out.sort((a, b) => a.k - b.k).map(x => x.id);
}

// ---------------------------------------------------------------- oturum
/**
 * kind: 'gunun' | 'mini' | 'tur' | 'hata' | 'liste'
 * opts: { decks, types, size, ids }
 */
export function createSession(kind, opts = {}) {
  const today = dayNum();
  const sess = {
    kind, opts, today, picks: 0, served: new Set(), pending: [], requeues: {}, combo: 0, maxCombo: 0,
    stats: { n: 0, ok: 0, imla: 0, sonek: 0, yapi: 0, bil: 0, known: 0, pts: 0, nw: 0 },
    startedAt: Date.now(), base: 0, done: false, lastPick: {},
  };
  const due = LISTED.has(kind) ? [] : dueList(opts, today);
  sess.due = due;
  sess.list = LISTED.has(kind) ? [...(opts.ids || [])] : [];
  const newLeft = newAllowance(today);
  sess.newShare = due.length + newLeft ? newLeft / (due.length + newLeft) : 0;
  if (kind === 'gunun' && goalLeft(today) === 0) sess.extra = 20;
  if (kind === 'mini') sess.base = MINI;
  else if (kind === 'tur') sess.base = opts.size || 20;
  else if (LISTED.has(kind)) sess.base = sess.list.length;
  return sess;
}

export function goalLeft(today = dayNum()) { return Math.max(0, set('halka') - dayRec(today).n); }

function wantMore(sess) {
  if (sess.kind === 'gunun') return goalLeft(sess.today) > 0 || sess.extra > 0;
  // liste oturumları listenin sonuna kadar; tur ve mini: hedef sayıda farklı kart (tekrar gelenler sayılmaz)
  if (LISTED.has(sess.kind)) return sess.list.some(id => CARDS.has(id));
  return (sess.basePicks || 0) < sess.base;
}

// Sıradaki kartı döndürür: { id, variant, isNew, again }
export function nextItem(sess) {
  // geri gelmesi gereken kartlar
  sess.pending.sort((a, b) => a.at - b.at);
  if (sess.pending.length && (sess.pending[0].at <= sess.picks || !wantMore(sess) || exhausted(sess))) {
    const p = sess.pending.shift();
    sess.lastPick[p.item.id] = sess.picks;
    sess.picks++;
    return { ...p.item, again: true };
  }
  if (!wantMore(sess)) return null;
  const id = pickBase(sess);
  if (!id) {
    if (sess.pending.length) { const p = sess.pending.shift(); sess.lastPick[p.item.id] = sess.picks; sess.picks++; return { ...p.item, again: true }; }
    return null;
  }
  sess.served.add(id);
  sess.lastPick[id] = sess.picks;
  sess.picks++;
  sess.basePicks = (sess.basePicks || 0) + 1;
  if (sess.kind === 'gunun' && sess.extra > 0) sess.extra--;
  const st = cardState(id);
  const c = CARDS.get(id);
  const variant = ((st.reps || 0) + (hash32(id) % 2)) % variantCount(c);
  return { id, variant, isNew: !(st.st > 0) };
}

function exhausted(sess) { return sess._exhausted; }

function pickBase(sess) {
  const { opts } = sess;
  if (LISTED.has(sess.kind)) {
    while (sess.list.length) { const id = sess.list.shift(); if (CARDS.has(id)) return id; }
    return null;
  }
  const dueLeft = sess.due.filter(id => !sess.served.has(id));
  const newOk = newAllowance(sess.today) > 0;
  const servedNew = sess.stats.nw;
  const wantNew = newOk && (!dueLeft.length || servedNew < sess.newShare * (sess.served.size + 1));
  let id = null;
  if (wantNew) id = pickNewAny(opts, sess.served);
  if (!id && dueLeft.length) id = dueLeft[0];
  if (!id && newOk) id = pickNewAny(opts, sess.served);
  if (!id) id = reinforceList(opts, sess, sess.today)[0] || null;
  if (!id) sess._exhausted = true;
  return id;
}

// ---------------------------------------------------------------- cevap işleme
const LISTED = new Set(['hata', 'liste', 'onek', 'yazma', 'hafta']);   // sabit kart listesiyle oturumlar
const STRICT_FORM = new Set(['yonetim', 'koll', 'esanlam', 'onek', 'form', 'reg']);

export function ratingFor(card, o) {
  if (o.res === 'known') return 4;
  if (o.res === 'bil' || o.res === 'yapi') return 1;
  if (o.res === 'sonek') return STRICT_FORM.has(card.t) ? 1 : 2;
  if (o.res === 'imla') return 2;
  if (o.hint) return 2;
  const len = (o.expLen || 8);
  if (o.ms && o.ms < 2200 + 110 * len) return 4;
  return 3;
}

/**
 * Bir cevabı işler. o: { res, typed, ms, hint, variant, again, partner }
 * Dönüş: { rating, pts, requeue, ivl, combo, goalHit, firstGoal }
 */
export async function recordAnswer(sess, item, o) {
  const card = CARDS.get(item.id);
  const today = sess.today;
  const st0 = cardState(item.id);
  const rating = ratingFor(card, o);
  let st = fsrs.review(st0, rating, today, set('retention'), hash32(item.id + ':' + (st0.reps || 0)));
  st.id = item.id;
  if (o.res === 'known') { st.known = true; st.s = Math.max(st.s, 30); st.due = today + 30; }
  if (!st0.st) { st.seen = Date.now(); }
  st.err = { ...(st0.err || {}) };
  if (['imla', 'sonek', 'yapi'].includes(o.res)) { st.err[o.res] = (st.err[o.res] || 0) + 1; st.lastErr = today; }
  if (o.res === 'bil') { st.err.bil = (st.err.bil || 0) + 1; st.lastErr = today; }

  // Elo: oturumdaki ilk cevapta güncellenir
  const th = S.prof.theta || 0;
  const b = st0.b ?? card.d ?? 0;
  const p = sigmoid(th - b);
  if (!item.again && o.res !== 'known') {
    const y = { ok: 1, imla: 0.75, sonek: 0.4, yapi: 0, bil: 0 }[o.res] ?? 0;
    S.prof.theta = clamp(th + 0.06 * (y - p), -4, 6);
    const n = st0.eloN || 0;
    st.b = clamp(b - (0.5 / (1 + 0.15 * n)) * (y - p), -4, 6);
    st.eloN = n + 1;
  } else st.b = b;

  // puan: zor karta ve ilk doğruya ağırlıklı; ipucu puanı düşürmez
  let pts = 0;
  const ok = o.res === 'ok';
  if (ok) {
    sess.combo++;
    const hard = 1 + clamp(b - th, 0, 2.5) * 0.35;
    pts = item.again ? 4 : Math.round((10 + (item.isNew ? 5 : 0)) * hard) + (sess.combo >= 5 ? 2 : 0);
  } else {
    if (o.res !== 'known') sess.combo = 0;
    pts = { imla: 6, sonek: 3, known: 2 }[o.res] || 0;
  }
  sess.maxCombo = Math.max(sess.maxCombo, sess.combo);

  // günlük kayıt
  const day = dayRec(today);
  const before = day.n;
  day.n++;
  if (ok) day.ok++;
  if (day.err[o.res] != null) day.err[o.res]++;
  if (item.isNew && !item.again) { day.nw++; sess.stats.nw++; }
  day.pts += pts;
  const goal = set('halka');
  const goalHit = before < goal && day.n >= goal;
  if (goalHit) { day.goalHit = true; day.goalAt = Date.now(); }
  if (day.n >= MINI) day.act = true;

  // oturum istatistikleri
  sess.stats.n++;
  if (!item.again) sess.stats.first = (sess.stats.first || 0) + 1;
  sess.stats.pts += pts;
  if (sess.stats[o.res] != null) sess.stats[o.res]++;

  // tekrar kuyruğu
  let requeue = false;
  if (rating === 1) {
    const k = sess.requeues[item.id] || 0;
    if (k < 3) {
      sess.requeues[item.id] = k + 1;
      sess.pending.push({ at: sess.picks + 3 + (hash32(item.id + k) % 3), item: { id: item.id, variant: item.variant, isNew: false } });
      requeue = true;
    }
  }

  const log = {
    ts: Date.now(), day: today, id: item.id, deck: card.deck, t: card.t, r: o.res, typed: (o.typed || '').slice(0, 120),
    exp: (o.exp || '').slice(0, 120), ms: Math.round(o.ms || 0), hint: o.hint || 0, g: rating, pts, again: !!item.again,
    isNew: !!item.isNew, why: o.why || '', v: item.variant || 0,
  };
  await commit({ card: st, day, log, prof: true });
  return { rating, pts, requeue, ivl: st.ivl, combo: sess.combo, goalHit };
}

export async function addExtraNew(n = 10) {
  const d = dayNum();
  S.prof.extraNew = { [d]: (S.prof.extraNew?.[d] || 0) + n };
  await saveProf();
}

// ---------------------------------------------------------------- seri
export function activeDay(r) { return !!r && (r.n >= MINI || r.frozen); }

export function streak(today = dayNum()) {
  let n = 0;
  let d = activeDay(S.days.get(today)) ? today : today - 1;
  while (activeDay(S.days.get(d))) { n++; d--; }
  return { n, todayDone: activeDay(S.days.get(today)) && !S.days.get(today)?.frozen };
}

// Uygulama açılışında: kaçırılan günleri dondurma hakkıyla kapat
export async function reconcile(today = dayNum()) {
  let last = null;
  for (const [d, r] of S.days) if (d < today && activeDay(r) && (last == null || d > last)) last = d;
  const changes = [];
  if (last != null && today - last > 1) {
    const missing = today - last - 1;
    if ((S.prof.freezes || 0) >= missing) {
      for (let d = last + 1; d < today; d++) {
        const r = dayRec(d);
        r.frozen = true;
        changes.push(['days', r]);
      }
      S.prof.freezes -= missing;
      S.prof.frozeUsed = (S.prof.frozeUsed || 0) + missing;
      S.prof.lastFreezeNote = { days: missing, at: today };
    }
  }
  // iddia
  const bet = S.prof.bet;
  if (bet && bet.state === 'active') {
    for (let d = bet.start; d < Math.min(today, bet.start + 7); d++) {
      const r = S.days.get(d);
      if (!r || !r.goalHit) { bet.state = 'lost'; bet.end = d; break; }
    }
    if (bet.state === 'active' && today >= bet.start + 7) {
      bet.state = 'won';
      bet.end = bet.start + 6;
      S.prof.freezes = Math.min(2, (S.prof.freezes || 0) + 1);
      bet.reward = true;
    }
  }
  if (changes.length) await db.putMany(changes);
  await saveProf();
}

// Seri kilometre taşları ve dondurma kazanımı (cevaptan sonra çağrılır)
export const MILESTONES = [7, 30, 100, 365];
export async function afterAnswerStreak() {
  const { n } = streak();
  const out = {};
  S.prof.best = Math.max(S.prof.best || 0, n);
  if (n > 0 && n % 7 === 0 && S.prof.freezeAt !== n) {
    S.prof.freezeAt = n;
    if ((S.prof.freezes || 0) < 2) { S.prof.freezes = (S.prof.freezes || 0) + 1; out.freeze = true; }
  }
  const ms = MILESTONES.find(m => m === n);
  if (ms && !(S.prof.milestones || []).some(x => x.n === ms && x.day > dayNum() - ms)) {
    S.prof.milestones = [...(S.prof.milestones || []), { n: ms, day: dayNum() }];
    out.milestone = ms;
  }
  if (out.freeze || out.milestone) await saveProf();
  return out;
}

export async function startBet() {
  const d = dayNum();
  // bugün halka tamamsa bugünden, değilse bugünden başlar (bugün de sayılır)
  S.prof.bet = { start: d, state: 'active' };
  await saveProf();
}

// ---------------------------------------------------------------- hafta özeti
export async function weekSummary(ws) {
  const logs = await db.logRange(ws, ws + 6);
  const days = [];
  for (let d = ws; d < ws + 7; d++) days.push(S.days.get(d) || { day: d, n: 0, ok: 0, nw: 0, pts: 0, err: {} });
  const first = logs.filter(l => !l.again);
  const sum = { n: logs.length, first: first.length, ok: first.filter(l => l.r === 'ok').length, nw: days.reduce((a, d) => a + (d.nw || 0), 0),
    pts: days.reduce((a, d) => a + (d.pts || 0), 0), typo: days.reduce((a, d) => a + (d.typo || 0), 0), goalDays: days.filter(d => d.goalHit).length, active: days.filter(d => d.n >= MINI).length,
    err: { imla: 0, sonek: 0, yapi: 0, bil: 0 }, byType: {}, hard: {}, forms: {} };
  for (const l of logs) {
    if (sum.err[l.r] != null) sum.err[l.r]++;
    const bt = sum.byType[l.t] || (sum.byType[l.t] = { n: 0, ok: 0 });
    if (!l.again) { bt.n++; if (l.r === 'ok') bt.ok++; }
    if (l.r !== 'ok' && l.r !== 'known') {
      const h = sum.hard[l.id] || (sum.hard[l.id] = { id: l.id, n: 0, last: null });
      h.n++; h.last = l;
    }
  }
  sum.hardList = Object.values(sum.hard).sort((a, b) => b.n - a.n).slice(0, 12);
  sum.days = days;
  return sum;
}

export function weekKey(d = dayNum()) { return weekStart(d); }
