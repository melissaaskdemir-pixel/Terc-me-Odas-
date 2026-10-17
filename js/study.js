// Çalışma ekranı: yazarak cevap, Bilmiyorum akışı, hata sınıflandırma, mühürler
import { el, svg, ICON, dayNum } from './util.js';
import { t } from './i18n.js';
import { S, set, saveProf, dayRec } from './store.js';
import { CARDS, SERIES, expected, loadMorph } from './decks.js';
import { check, norm, tokens, charMarks, hintText, tagsLabel, morphReady } from './check.js';
import * as plan from './plan.js';
import * as audio from './audio.js';
import { bigStamp, toast } from './ui.js';
import { go } from './main.js';
import { okumaToday, okumaLabel } from './okuma.js';

const TYPE_LABEL = {
  kelime: 'type.kelime', kalip: 'type.kalip', baglac: 'type.baglac', terim: 'type.terim', cift: 'type.cift',
  yonetim: 'type.yonetim', koll: 'type.koll', esanlam: 'type.esanlam', register: 'type.register', onek: 'type.onek',
};

let cur = null; // etkin oturum

export function isStudying() { return !!cur; }

export function startStudy(kind, opts = {}, onExit) {
  loadMorph().catch(() => {});
  const sess = plan.createSession(kind, opts);
  cur = { sess, onExit, events: [] };
  document.body.classList.add('studying');
  buildFrame();
  next();
}

// ---------------------------------------------------------------- iskelet
function buildFrame() {
  const screen = document.getElementById('screen');
  screen.innerHTML = '';
  const F = cur.f = {};
  F.bar = el('i');
  F.count = el('span.st-count');
  F.kind = el('span', t('kind.' + cur.sess.kind));
  F.combo = el('span.combo');
  F.pts = el('span.pts');
  F.cardwrap = el('div.st-cardwrap');
  F.hint = el('div.st-hint', { 'aria-live': 'polite' });
  F.label = el('span');
  F.labelR = el('span');
  F.input = el('input', {
    type: 'text', autocomplete: 'off', autocapitalize: 'off', autocorrect: 'off', spellcheck: 'false',
    lang: 'ru', enterkeyhint: 'send', 'aria-label': t('st.answer'),
  });
  F.input.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); submit(); return; }
    if (e.key.length === 1) audio.sfx('type');
  });
  F.act = el('div.st-act');
  const top = el('header.st-top',
    el('button.iconbtn', { 'aria-label': t('st.close'), on: { click: () => finish(true) } }, svg(ICON.x)),
    el('div.bar', F.bar), F.count, F.combo);
  const sub = el('div.st-sub', F.kind, F.pts);
  const inp = el('div.st-in', el('label', { for: 'cevap' }, F.label, F.labelR), F.input);
  F.input.id = 'cevap';
  const root = el('div.study', top, sub, F.cardwrap, F.hint, inp, F.act);
  root.addEventListener('mousedown', e => { if (e.target.closest('button')) e.preventDefault(); });
  screen.append(root);
  updateTop();
}

function updateTop() {
  const { sess, f } = cur;
  const goal = set('halka');
  const n = dayRec(sess.today).n;
  if (sess.kind === 'gunun') {
    f.bar.style.width = Math.min(100, 100 * n / goal) + '%';
    f.count.textContent = `${n}/${goal}`;
  } else {
    const first = sess.stats.first || 0;
    const done = Math.min(first, Math.max(sess.base, 1));
    f.bar.style.width = Math.min(100, 100 * done / Math.max(sess.base, 1)) + '%';
    const again = sess.pending.length + (cur.item && cur.item.again && cur.state === 'ask' ? 1 : 0);
    f.count.textContent = `${Math.min(first, sess.base)}/${sess.base}` + (first >= sess.base && again ? ` +${again}` : '');
  }
  f.combo.textContent = sess.combo >= 2 ? t('st.combo', { n: sess.combo }) : '';
  f.pts.textContent = sess.stats.pts ? `+${sess.stats.pts}` : '';
}

// Klavye açıkken etiket satırı gizlenir; aynı metin kutunun içinde görünür
function setLabel(text) {
  cur.f.label.textContent = text;
  cur.f.input.placeholder = text;
}

function setActions(...btns) {
  cur.f.act.innerHTML = '';
  cur.f.act.append(...btns);
}

// ---------------------------------------------------------------- kart akışı
function next() {
  clearTimeout(cur.advT);
  audio.stop();
  if (dayNum() !== cur.sess.today) return endScreen(); // gün değişti
  const item = plan.nextItem(cur.sess);
  if (!item) return endScreen();
  const card = CARDS.get(item.id);
  const ex = expected(card, item.variant);
  cur.item = item;
  cur.card = card;
  cur.ex = ex;
  cur.state = 'ask';
  cur.hint = 0;
  cur.shownAt = performance.now();
  cur.ms = 0;
  cur.res = null;
  cur.typed = '';
  cur.fill = null;
  cur.fillCls = '';
  cur.retypeFails = 0;
  audio.prepare(ex.audio);
  renderCard();
  const f = cur.f;
  f.input.value = '';
  f.input.className = '';
  setLabel(t('st.yourAnswer'));
  f.labelR.textContent = '';
  f.hint.textContent = '';
  setActions(
    el('button.btn', { on: { click: dontKnow } }, t('st.dontKnow')),
    el('button.btn.hint', { 'aria-label': t('st.hintAria'), on: { click: giveHint } }, t('st.hint')),
    el('button.btn.btn-primary.send', { on: { click: submit } }, t('st.send')));
  focusInput();
  updateTop();
  audio.sfx('paper');
}

function focusInput() {
  const i = cur.f.input;
  if (document.activeElement !== i) i.focus({ preventScroll: true });
}

function kicker() {
  const c = cur.card;
  const parts = [t(TYPE_LABEL[c.t] || 'type.kelime')];
  if (c.t === 'esanlam' && c.ser) parts.push(t('st.series', { s: c.ser.toLocaleUpperCase('tr') }));
  else if (c.s) parts.push(c.s.split(' · ')[0].toLocaleUpperCase('tr'));
  return parts.join(' · ');
}

function clozeNode(z, fill, cls) {
  const [a, b] = z.s.split('___');
  const gap = el('span.gap' + (cls ? '.' + cls : ''), fill || ' ');
  return el('div.cz.ru', a, gap, b, !fill && z.h ? el('span.h', ` (${z.h})`) : null);
}

function promptNodes() {
  const c = cur.card, ex = cur.ex;
  const out = [];
  const asking = cur.state === 'ask';
  const nw = ex.show.trim().split(/\s+/).length;
  const h = c.h && ex.cloze && nw > 1 ? `${c.h} · ${t('st.words', { n: nw })}` : c.h;
  const long = (c.q || '').length > 60;
  switch (c.t) {
    case 'cift':
      out.push(el('div.v.ru', c.v), el('div.qs', c.q), asking ? el('div.hint', c.h) : null);
      break;
    case 'yonetim':
      out.push(el('div', el('span.v.ru', c.v), el('span.qs', '  ' + c.q)), clozeNode(ex.cloze, cur.fill, cur.fillCls), asking ? el('div.hint', h) : null);
      break;
    case 'koll':
    case 'onek':
    case 'esanlam':
      out.push(el('div.q' + (long ? '.long' : ''), c.q), clozeNode(ex.cloze, cur.fill, cur.fillCls), asking ? el('div.hint', h) : null);
      break;
    case 'register':
      out.push(el('div.v.ru', c.v), el('div.qs', c.q), asking ? el('div.hint', c.h) : null);
      break;
    default:
      out.push(el('div.q' + (long ? '.long' : ''), c.q));
      if (c.qs) out.push(el('div.qs', c.qs));
      if (c.h && asking) out.push(el('div.hint', c.h));
  }
  return out;
}

function renderCard(extra) {
  const card = el('article.paper.st-card.cardin', { 'aria-label': t('st.card'), 'data-id': cur.card.id, 'data-v': String(cur.item.variant || 0) },
    el('div.ck', el('span', kicker()), el('span', cur.item.again ? t('st.again') : (cur.item.isNew ? t('st.new') : ''))),
    ...promptNodes(),
    cur.item.isNew && cur.state === 'ask' && !cur.item.again ? el('div.swipehint', t('st.swipe')) : null,
    extra || null);
  cur.cardEl = card;
  const wrapEl = cur.f.cardwrap;
  wrapEl.innerHTML = '';
  wrapEl.append(card);
  wrapEl.scrollTop = 0;
  // klavye açıkken alan dar: cevap bölümü görünsün diye kaydır
  if (extra && cur.state !== 'right') requestAnimationFrame(() => {
    if (card.scrollHeight > wrapEl.clientHeight + 4) wrapEl.scrollTop = Math.max(0, extra.offsetTop - 12);
  });
  if (cur.state === 'ask' && cur.item.isNew && !cur.item.again) enableSwipe(card);
  card.addEventListener('click', e => {
    if (cur.state === 'right' && !e.target.closest('button')) holdAdvance();
  });
  return card;
}

// ---------------------------------------------------------------- ipucu
function giveHint() {
  if (cur.state !== 'ask') return;
  cur.hint++;
  cur.f.hint.textContent = hintText(cur.ex.show, cur.hint);
  focusInput();
}

// ---------------------------------------------------------------- cevap
function submit() {
  const f = cur.f;
  const typed = f.input.value;
  if (cur.state === 'done' || cur.state === 'known' || cur.state === 'end') return;
  if (cur.state === 'right') return advance();
  if (cur.state === 'wrong' || cur.state === 'teach') return retype(typed);
  if (!typed.trim()) { shake(); return; }
  cur.ms = performance.now() - cur.shownAt;
  const r = check(typed, cur.ex.accepted, checkOpts());
  if (r.res === 'klavye') { toast(t('st.keyboard')); return; }
  if (r.res === 'empty') { shake(); return; }
  cur.res = r;
  cur.typed = typed;
  if (r.res === 'ok') return onRight(r);
  onWrong(r);
}

function checkOpts() {
  const c = cur.card;
  return { partner: c.pa, user: S.prof.alts?.[c.id], wrongAspect: c.t === 'cift' ? [c.v] : null };
}

function shake() {
  const i = cur.f.input;
  i.classList.remove('shake');
  void i.offsetWidth;
  i.classList.add('shake');
}

async function onRight(r) {
  cur.state = 'right';
  const item = cur.item;
  const f = cur.f;
  f.input.classList.add('ok');
  f.hint.textContent = '';
  // sesi aynı dokunuş içinde başlat
  let ap = null;
  if (set('autoplay')) ap = audio.playNow(cur.ex.audio);
  // kayıt eşzamanlı başlar (seri, kombo, halka hemen güncellenir); yazma işlemi arkada sürer
  const pr = plan.recordAnswer(cur.sess, item, { res: 'ok', typed: cur.typed, exp: cur.ex.show, ms: cur.ms, hint: cur.hint, expLen: cur.ex.show.length, why: r.partner ? 'partner' : '' });
  cur.fill = cur.ex.show;
  cur.fillCls = 'ok';
  const combo = cur.sess.combo >= 5 && cur.sess.combo % 5 === 0;
  const card = renderCard(feedback({ verdict: 'ok', compact: true, r }));
  card.append(el('div.stamp' + (combo ? '.accent' : ''), combo ? 'ОТЛИЧНО' : 'ВЕРНО'));
  audio.sfx('stamp');
  setActions(el('button.btn.btn-ok', { on: { click: advance } }, t('st.next')));
  updateTop();
  const res = await pr;
  await afterRecord(res);
  if (!cur || cur.item !== item) return; // kullanıcı çoktan geçti
  if (res.pts) card.append(el('div.ptsfly', `+${res.pts}`));
  updateTop();
  if (ap === null && set('autoplay')) ap = audio.play(cur.ex.audio);
  const delay = set('advance') * 1000;
  const started = performance.now();
  cur.advHold = false;
  const go = () => { if (cur && cur.item === item && cur.state === 'right' && !cur.advHold) advance(); };
  cur.advT = setTimeout(() => {
    if (ap) {
      // ses bitene kadar bekle, en çok 3,5 sn
      Promise.race([ap, new Promise(r2 => setTimeout(r2, Math.max(0, 3500 - (performance.now() - started))))]).then(go);
    } else go();
  }, delay);
}

function holdAdvance() {
  cur.advHold = true;
  clearTimeout(cur.advT);
  toast(t('st.held'), 1400);
}

function onWrong(r) {
  cur.state = 'wrong';
  const f = cur.f;
  f.input.classList.add('bad');
  f.input.value = '';
  f.hint.textContent = '';
  setLabel(t('st.retype'));
  cur.fill = cur.ex.show;
  cur.fillCls = '';
  renderCard(feedback({ verdict: r.res, r }));
  if (set('autoplay')) audio.playNow(cur.ex.audio) || audio.play(cur.ex.audio);
  audio.sfx('soft');
  setActions(
    el('button.btn', { on: { click: claimRight } }, t('st.claim')),
    el('button.btn.btn-primary.send', { on: { click: submit } }, t('st.send')));
  focusInput();
}

function dontKnow() {
  if (cur.state !== 'ask') return;
  cur.ms = performance.now() - cur.shownAt;
  cur.state = 'teach';
  cur.res = { res: 'bil' };
  const f = cur.f;
  f.input.value = '';
  f.input.className = '';
  f.hint.textContent = '';
  setLabel(t('st.typeOnce'));
  cur.fill = cur.ex.show;
  cur.fillCls = '';
  renderCard(feedback({ verdict: 'bil' }));
  if (set('autoplay')) audio.playNow(cur.ex.audio) || audio.play(cur.ex.audio);
  setActions(el('button.btn.btn-primary.send', { on: { click: submit } }, t('st.send')));
  focusInput();
}

async function retype(typed) {
  if (!typed.trim()) { shake(); return; }
  const r = check(typed, cur.ex.accepted, checkOpts());
  if (r.res !== 'ok') {
    cur.retypeFails++;
    shake();
    if (cur.retypeFails >= 2) cur.f.hint.textContent = cur.ex.show;
    return;
  }
  cur.f.input.classList.remove('bad');
  cur.f.input.classList.add('ok');
  cur.state = 'done';
  const res = await plan.recordAnswer(cur.sess, cur.item, {
    res: cur.res.res, typed: cur.typed || '', exp: cur.ex.show, ms: cur.ms, hint: cur.hint, why: cur.res.why || '',
  });
  updateTop();
  await afterRecord(res);
  advance();
}

async function claimRight() {
  // "bence doğruydu": cevabı bu kart için kabul listesine ekle, doğru say
  const id = cur.card.id;
  const alts = S.prof.alts || (S.prof.alts = {});
  alts[id] = [...new Set([...(alts[id] || []), cur.typed.trim()])];
  S.prof.claims = [...(S.prof.claims || []), { id, typed: cur.typed.trim(), exp: cur.ex.show, day: dayNum() }].slice(-200);
  await saveProf();
  cur.state = 'done';
  const res = await plan.recordAnswer(cur.sess, cur.item, { res: 'ok', typed: cur.typed, exp: cur.ex.show, ms: cur.ms, hint: cur.hint, why: 'claim' });
  updateTop();
  await afterRecord(res);
  toast(t('st.claimed'));
  advance();
}

async function markKnown() {
  if (cur.state !== 'ask') return;
  cur.state = 'known';
  const res = await plan.recordAnswer(cur.sess, cur.item, { res: 'known', typed: '', exp: cur.ex.show, ms: performance.now() - cur.shownAt });
  const card = cur.cardEl;
  card.append(el('div.stamp', 'ИЗВЕСТНО'));
  audio.sfx('stamp');
  updateTop();
  await afterRecord(res);
  setTimeout(advance, 450);
}

async function afterRecord(res) {
  if (res.goalHit) {
    bigStamp('РАССЕКРЕЧЕНО');
    cur.events.push({ k: 'goal' });
  }
  const s = await plan.afterAnswerStreak();
  if (s.milestone) { cur.events.push({ k: 'milestone', n: s.milestone }); setTimeout(() => bigStamp('РАССЕКРЕЧЕНО'), res.goalHit ? 1200 : 0); }
  if (s.freeze) cur.events.push({ k: 'freeze' });
}

function advance() {
  if (!cur) return;
  clearTimeout(cur.advT);
  if (cur.state === 'wrong' || cur.state === 'teach') return; // önce doğrusunu yazmalı
  next();
}

// ---------------------------------------------------------------- geri bildirim içeriği
function tokenView(r) {
  // yazılanı, hatalı kısımlar işaretli gösterir
  const out = el('div.typed.ru');
  for (const o of r.ops || []) {
    if (o.c === 'miss') { out.append(el('span.tk-miss', ' ' + '_'.repeat(Math.min(6, o.e.length)) + ' '), ' '); continue; }
    const cls = o.c === 'extra' ? 'yapi' : o.c;
    const span = el('span.tk-' + cls);
    if ((o.c === 'imla' || o.c === 'sonek') && o.e && o.t) {
      const bad = charMarks(o.t, o.e);
      [...o.t].forEach((ch, i) => span.append(bad.has(i) ? el('mark', ch) : ch));
    } else span.append(o.t);
    out.append(span, ' ');
  }
  return out;
}

const VERDICT = { ok: 'v.ok', imla: 'v.imla', sonek: 'v.sonek', yapi: 'v.yapi', bil: 'v.bil' };

function feedback({ verdict, compact, r }) {
  const c = cur.card, ex = cur.ex;
  const fb = el('section.fb');
  const vk = verdict === 'bil' ? 'yapi' : verdict;
  fb.append(el('div.verdict', el('span.k.' + vk, t(VERDICT[verdict])),
    r && r.partner ? el('span.lab', t('st.partner')) : r && r.user ? el('span.lab', t('st.userAlt')) : null));

  if (verdict !== 'ok' && r && r.ops) {
    fb.append(el('div.lab', t('st.youWrote')), tokenView(r));
  }
  // doğrusu
  const full = ex.cloze ? (ex.cloze.full || ex.full) : c.f;
  const ansRow = el('div.exrow', el('div', { style: { flex: '1' } },
    el('div.lab', verdict === 'ok' ? t('st.answerIs') : t('st.correct')),
    el('div.ans.ru' + ((full || '').length > 40 ? '.small' : ''), r && r.partner ? r.alt : full)),
  audioBtn(ex.audio));
  fb.append(ansRow);
  if (r && r.partner && r.main) fb.append(el('div.meta', t('st.partnerNote', { w: r.main })));
  if (r && r.msg && verdict !== 'ok') fb.append(el('div.meta', r.msg));
  if (ex.cloze && ex.cloze.tr) fb.append(el('div.meta', ex.cloze.tr));

  const meta = [];
  if (c.g) meta.push([t('st.gov'), c.g]);
  if (c.p && c.p[0] && c.p[1]) meta.push([t('st.pair'), `${c.p[0]} (impf.) · ${c.p[1]} (pf.)`]);
  if (c.t === 'register' && c.v) meta.push([t('st.neutral'), c.v]);
  if (!compact || verdict !== 'ok') {
    for (const [k, v] of meta) fb.append(el('div.meta', el('b', k + ': '), el('span.ru', v)));
  }
  if (c.t === 'cift' && (!compact || verdict !== 'ok')) fb.append(el('div.meta', t('st.aspectNote')));
  if (c.t === 'esanlam' && c.ser && SERIES[c.ser] && (!compact || verdict !== 'ok')) {
    fb.append(el('div.lab', t('st.seriesAll')));
    for (const [w, n] of SERIES[c.ser]) fb.append(el('div.meta', el('span.ru', { style: { color: 'var(--p-ink)' } }, w), ' · ', n));
  }
  // örnekler
  const exs = (c.ex || []).slice(0, compact ? 1 : 3);
  for (const e of exs) {
    fb.append(el('div.exrow', el('div.ex', { style: { flex: '1' } }, el('div.r', e[0]), e[1] ? el('div.t', e[1]) : null), e[2] ? audioBtn(e[2]) : null));
  }
  if (c.n && (!compact || verdict !== 'ok')) fb.append(el('div.meta', c.n));
  if (!compact || verdict !== 'ok') {
    fb.append(el('div.tools',
      ex.audio ? el('button.pbtn', { on: { click: () => audio.play(ex.audio, 0.7) } }, '0.7×') : null,
      ex.audio ? el('button.plink', { on: { click: reportStress } }, t('st.stressWrong')) : null,
      c.s ? el('span.lab', { style: { marginLeft: 'auto' } }, c.s) : null));
  }
  if (verdict !== 'ok' && verdict !== 'bil' && (S.prof.legendN || 0) < 8) {
    S.prof.legendN = (S.prof.legendN || 0) + 1;
    fb.append(el('div.legend',
      el('span', el('i', { style: { background: 'var(--p-yapi)' } }), t('lg.yapi')),
      el('span', el('i', { style: { background: 'var(--p-sonek)' } }), t('lg.sonek')),
      el('span', el('i', { style: { background: 'var(--p-imla)' } }), t('lg.imla')),
      el('span', el('i', { style: { background: 'var(--p-ok)' } }), t('lg.ok'))));
  }
  return fb;
}

function audioBtn(key) {
  if (!key) return null;
  return el('button.pbtn.round', { 'aria-label': t('st.listen'), on: { click: e => { e.stopPropagation(); audio.play(key); focusInput(); } } }, svg(ICON.play));
}

async function reportStress() {
  const rep = { id: cur.card.id, key: cur.ex.audio, text: cur.ex.cloze ? cur.ex.cloze.full : cur.card.f, day: dayNum() };
  S.prof.reports = [...(S.prof.reports || []).filter(x => x.key !== rep.key), rep].slice(-300);
  await saveProf();
  toast(t('st.stressNoted'));
}

// ---------------------------------------------------------------- kaydırma: "biliyorum"
function enableSwipe(card) {
  let x0 = 0, y0 = 0, dx = 0, active = false, decided = false, horiz = false;
  card.addEventListener('touchstart', e => {
    if (cur.state !== 'ask') return;
    const p = e.touches[0];
    x0 = p.clientX; y0 = p.clientY; dx = 0; active = true; decided = false; horiz = false;
    card.style.transition = 'none';
  }, { passive: true });
  card.addEventListener('touchmove', e => {
    if (!active) return;
    const p = e.touches[0];
    const mx = p.clientX - x0, my = p.clientY - y0;
    if (!decided && (Math.abs(mx) > 10 || Math.abs(my) > 10)) { decided = true; horiz = Math.abs(mx) > Math.abs(my) * 1.3; }
    if (!horiz) return;
    dx = Math.min(0, mx);
    card.style.transform = `translateX(${dx}px) rotate(${dx / 40}deg)`;
    card.style.opacity = String(1 + dx / 400);
  }, { passive: true });
  const end = () => {
    if (!active) return;
    active = false;
    card.style.transition = 'transform .18s, opacity .18s';
    if (horiz && dx < -90) {
      card.style.transform = 'translateX(-120%) rotate(-6deg)';
      card.style.opacity = '0';
      markKnown();
    } else {
      card.style.transform = '';
      card.style.opacity = '';
    }
  };
  card.addEventListener('touchend', end);
  card.addEventListener('touchcancel', end);
}

// ---------------------------------------------------------------- oturum sonu
async function finish(userClosed) {
  if (!cur) return;
  clearTimeout(cur.advT);
  audio.stop();
  // yarım kalan yanlış cevabı kaydet
  if (userClosed && (cur.state === 'wrong' || cur.state === 'teach') && cur.res) {
    await plan.recordAnswer(cur.sess, cur.item, { res: cur.res.res, typed: cur.typed || '', exp: cur.ex.show, ms: cur.ms, hint: cur.hint, why: cur.res.why || '' });
  }
  if (userClosed && cur.sess.stats.n > 0 && cur.state !== 'end') return endScreen();
  exit();
}

function exit() {
  const cb = cur && cur.onExit;
  cur = null;
  document.body.classList.remove('studying');
  try { document.activeElement && document.activeElement.blur(); } catch (e) {}
  cb && cb();
}

function endScreen() {
  cur.state = 'end';
  audio.stop();
  const { sess } = cur;
  const s = sess.stats;
  const first = s.n - (Object.values(sess.requeues).reduce((a, b) => a + b, 0));
  const okPct = s.n ? Math.round(100 * s.ok / s.n) : 0;
  const day = dayRec(sess.today);
  const goal = set('halka');
  const st = plan.streak();
  try { document.activeElement && document.activeElement.blur(); } catch (e) {}
  const screen = document.getElementById('screen');
  screen.innerHTML = '';
  const errs = s.yapi + s.sonek + s.imla;
  const bar = el('div.errbar');
  if (errs) for (const k of ['yapi', 'sonek', 'imla']) if (s[k]) bar.append(el('i', { style: { width: (100 * s[k] / errs) + '%', background: `var(--${k})` } }));
  const evs = cur.events.map(e => e.k === 'goal' ? t('end.goal') : e.k === 'milestone' ? t('end.milestone', { n: e.n }) : t('end.freeze'));
  const canMore = sess.kind === 'gunun' || sess.kind === 'tur' || sess.kind === 'mini';
  const wrap = el('div.study', el('div.endsum',
    el('div.kicker', t('end.kicker')),
    el('h1.h1', t('end.title')),
    el('div.grid3',
      stat(s.n, t('end.answers')), stat(okPct + '%', t('end.acc')), stat('+' + s.pts, t('end.pts'))),
    el('div.grid3',
      stat(s.nw, t('end.new')), stat(sess.maxCombo, t('end.combo')), stat(`${day.n}/${goal}`, t('end.ring'))),
    errs ? el('div.sect', el('div.kicker', t('end.errs')), bar,
      el('div.note', `${t('lg.yapi')} ${s.yapi} · ${t('lg.sonek')} ${s.sonek} · ${t('lg.imla')} ${s.imla} · ${t('st.dontKnow')} ${s.bil}`)) : null,
    el('div.note', st.todayDone ? t('end.streakOk', { n: st.n }) : t('end.streakNeed', { n: plan.MINI - day.n })),
    sess._exhausted && day.n < goal ? el('div.panel.sect', el('div.note', t('end.empty')),
      el('button.btn.btn-sm', { on: { click: async () => { await plan.addExtraNew(10); more(); } } }, t('c.extra10'))) : null,
    ...evs.map(x => el('div.panel', x)),
    readOffer(),
    el('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '6px' } },
      canMore ? el('button.btn.btn-primary.btn-wide', { on: { click: more } }, t('end.more')) : null,
      el('button.btn.btn-wide', { on: { click: exit } }, t('end.enough'))),
  ));
  screen.append(wrap);
  void first;
}

// Günün okuma paragrafı bekliyorsa oturum sonunda öner
function readOffer() {
  const box = el('div.panel.sect.hidden');
  okumaToday().then(q => {
    if (!q || !q.list.length) return;
    box.append(el('div.note', t('o.endOffer', { p: okumaLabel(q.list[0]) })),
      el('button.btn.btn-sm', { on: { click: () => { const cb = () => go('okuma'); cur.onExit = cb; exit(); } } }, t('o.endGo')));
    box.classList.remove('hidden');
  }).catch(() => {});
  return box;
}

function stat(v, k) { return el('div.stat', el('span.v', String(v)), el('span.k', k)); }

function more() {
  const { sess } = cur;
  cur.state = 'ask';
  if (sess.kind === 'gunun') sess.extra = (sess.extra || 0) + 20;
  else sess.base += sess.kind === 'mini' ? plan.MINI : 20;
  sess._exhausted = false;
  buildFrame();
  next();
}
