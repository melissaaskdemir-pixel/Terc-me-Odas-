// Arşiv: hata defteri, istatistik, haftalık rapor, ayarlar, ses paketleri, yedek, kişisel paketler
import { el, dayNum, fmtDay, pct, fmtNum, shareFile, pickFile } from './util.js';
import { t } from './i18n.js';
import { S, set, setSetting, saveSettings, saveProf, exportAll, importAll } from './store.js';
import { CARDS, DECKS, CONTENT_VERSION, importPack, removePack, readPackFile } from './decks.js';
import * as plan from './plan.js';
import * as audio from './audio.js';
import { okumaAudioKeys } from './okuma.js';
import { dictStatus, downloadDict } from './sozluk.js';
import * as db from './db.js';
import { toast, confirmBox, switchEl, stepper, seg } from './ui.js';
import { startStudy } from './study.js';
import { go, applyTheme, APP_VERSION, checkUpdate } from './main.js';

const ui = { tab: 'hata', errKind: 'all' };

export function backupAgeDays() {
  const lb = S.prof.lastBackup;
  if (!lb) return null;
  return Math.floor((Date.now() - lb) / 86400e3);
}
export function backupWarn() {
  const a = backupAgeDays();
  const age = Date.now() - (S.prof.installedAt || Date.now());
  return (a == null && age > 3 * 86400e3) || (a != null && a > 7);
}

export function renderArsiv(root) {
  const wrap = el('div.wrap', el('div.kicker', t('a.kicker')),
    el('div.topline', el('h1.h1', t('a.title')),
      el('button.btn.btn-sm', { on: { click: checkUpdate } }, t('a.updateShort'))),
    el('div.note', { style: { marginTop: '-12px' } }, t('a.versions', { a: APP_VERSION, c: CONTENT_VERSION, p: db.persistent ? t('a.persistOk') : t('a.persistNo') })));
  if (backupWarn()) {
    const a = backupAgeDays();
    wrap.append(el('div.warn', el('span.t', a == null ? t('a.bkNever') : t('a.bkOld', { n: a })),
      el('button.btn.btn-sm.btn-accent', { on: { click: doBackup } }, t('a.bkNow'))));
  }
  const tabs = el('div.chips');
  const body = el('div.sect');
  for (const [k, lab] of [['hata', 'a.tHata'], ['stat', 'a.tStat'], ['rapor', 'a.tRapor'], ['ayar', 'a.tAyar']]) {
    const b = el('button.chip', { 'aria-pressed': String(ui.tab === k) }, t(lab));
    b.addEventListener('click', () => { ui.tab = k; go('arsiv', true); });
    tabs.append(b);
  }
  wrap.append(tabs, body);
  root.append(wrap);
  ({ hata: renderHata, stat: renderStat, rapor: renderRapor, ayar: renderAyar })[ui.tab](body);
}

// ---------------------------------------------------------------- hata defteri
async function renderHata(body) {
  const today = dayNum();
  const logs = (await db.logRange(today - 29, today)).filter(l => ['imla', 'sonek', 'yapi', 'bil'].includes(l.r)).reverse();
  const kinds = el('div.chips');
  for (const [k, lab] of [['all', 'a.eAll'], ['yapi', 'lg.yapi'], ['sonek', 'lg.sonek'], ['imla', 'lg.imla'], ['bil', 'st.dontKnow']]) {
    const n = k === 'all' ? logs.length : logs.filter(l => l.r === k).length;
    const b = el('button.chip', { 'aria-pressed': String(ui.errKind === k) }, `${t(lab)} ${n}`);
    b.addEventListener('click', () => { ui.errKind = k; go('arsiv', true); });
    kinds.append(b);
  }
  const shown = logs.filter(l => ui.errKind === 'all' || l.r === ui.errKind);
  const ids = [...new Set(shown.map(l => l.id))].filter(id => CARDS.has(id)).slice(0, 30);
  body.append(el('div.note', t('a.hataNote')), kinds);
  if (ids.length) body.append(el('button.btn.btn-primary.btn-wide', { on: { click: () => startStudy('hata', { ids }, () => go('arsiv')) } }, t('a.studyErrs', { n: ids.length })));
  if (!shown.length) { body.append(el('div.panel.note', t('a.noErr'))); return; }
  const list = el('div');
  for (const l of shown.slice(0, 80)) {
    const c = CARDS.get(l.id);
    const kind = l.r === 'bil' ? 'st.dontKnow' : 'lg.' + l.r;
    list.append(el('div.errrow',
      el('div.a', el('span.k-' + (l.r === 'bil' ? 'yapi' : l.r), t(kind).toLocaleUpperCase('tr')), el('span', `${fmtDay(l.day)} · ${c ? c.id : l.id}`)),
      el('div.b.ru', l.typed ? el('s', l.typed) : null, l.typed ? '  →  ' : '', l.exp),
      c ? el('div.c', c.q) : null));
  }
  body.append(list);
}

// ---------------------------------------------------------------- istatistik
async function renderStat(body) {
  const today = dayNum();
  let total = 0;
  for (const d of DECKS.values()) total += d.cards.length;
  const known = plan.knownCount(), learning = plan.learningCount();
  let answers = 0, pts = 0;
  for (const r of S.days.values()) { answers += r.n || 0; pts += r.pts || 0; }
  const acc = n => { let a = 0, ok = 0; for (let d = today - n + 1; d <= today; d++) { const r = S.days.get(d); if (r) { a += r.n; ok += r.ok; } } return pct(ok, a); };
  const all30 = await db.logRange(today - 29, today);
  const byType = {};
  const err = { yapi: 0, sonek: 0, imla: 0, bil: 0 };
  for (const l of all30) {
    if (err[l.r] != null) err[l.r]++;
    if (l.again || l.r === 'known') continue;
    const b = byType[l.t] || (byType[l.t] = { n: 0, ok: 0 });
    b.n++; if (l.r === 'ok') b.ok++;
  }
  const errs = err.yapi + err.sonek + err.imla;
  const bar = el('div.errbar');
  if (errs) for (const k of ['yapi', 'sonek', 'imla']) if (err[k]) bar.append(el('i', { style: { width: (100 * err[k] / errs) + '%', background: `var(--${k})` } }));
  body.append(
    el('div.grid3', stat(fmtNum(known), t('a.sKnown')), stat(fmtNum(learning), t('a.sLearning')), stat(fmtNum(total - known - learning), t('a.sNew'))),
    el('div.grid3', stat(fmtNum(answers), t('a.sAnswers')), stat(acc(7) + '%', t('a.sAcc7')), stat(acc(30) + '%', t('a.sAcc30'))),
    el('div.grid2', stat(fmtNum(pts), t('a.sPts')), stat(S.prof.best || 0, t('a.sBest'))),
    el('div.sect', el('div.kicker', t('a.sErr30')), bar,
      el('div.note', `${t('lg.yapi')} ${err.yapi} · ${t('lg.sonek')} ${err.sonek} · ${t('lg.imla')} ${err.imla} · ${t('st.dontKnow')} ${err.bil}`)),
    el('div.sect', el('div.kicker', t('a.sByType')),
      el('div.list', ...Object.entries(byType).sort((a, b) => b[1].n - a[1].n).map(([k, v]) =>
        el('div', el('span', t('type.' + k)), el('span.r', `${pct(v.ok, v.n)}% · ${v.n}`))))),
    el('div.sect', el('div.kicker', t('a.sDecks')),
      el('div.list', ...[...DECKS.values()].map(d => {
        const seen = d.cards.filter(c => S.cards.get(c.id)?.st > 0).length;
        return el('div', el('span', d.ad), el('span.r', `${seen}/${d.cards.length}`));
      }))),
  );
}
function stat(v, k) { return el('div.stat', el('span.v', String(v)), el('span.k', k)); }

// ---------------------------------------------------------------- haftalık rapor
async function renderRapor(body) {
  const txt = await buildReport();
  body.append(
    el('div.note', t('a.rNote')),
    el('div.grid2',
      el('button.btn.btn-primary', { on: { click: async () => { await shareFile(`tercume-rapor-${dayNum()}.txt`, txt, 'text/plain'); } } }, t('a.rShare')),
      el('button.btn', { on: { click: async () => { try { await navigator.clipboard.writeText(txt); toast(t('a.rCopied')); } catch (e) { toast(t('a.rCopyFail')); } } } }, t('a.rCopy'))),
    el('div.paper', { style: { padding: '16px' } }, el('div.report', txt.split('\n--- VERİ ---')[0])),
  );
}

export async function buildReport() {
  const today = dayNum();
  const from = today - 6;
  const s = await plan.weekSummary(from);
  const logs = await db.logRange(from, today);
  const L = [];
  L.push('TERCÜME ODASI · HAFTALIK RAPOR');
  L.push(`Dönem: ${fmtDay(from)} – ${fmtDay(today, { year: true })}`);
  L.push(`Uygulama ${APP_VERSION} · içerik ${CONTENT_VERSION}`);
  L.push('');
  L.push(`Cevap: ${s.n} · ilk denemede doğru: %${pct(s.ok, s.first)} · yeni kart: ${s.nw} · puan: ${s.pts}`);
  L.push(`Aktif gün: ${s.active}/7 · halka tamam: ${s.goalDays}/7 · seri: ${plan.streak().n} gün · bilinen: ${plan.knownCount()}`);
  L.push(`Hatalar: yapı ${s.err.yapi} · son ek ${s.err.sonek} · imla ${s.err.imla} · bilmiyorum ${s.err.bil}`);
  L.push('');
  L.push('Kart tipine göre (ilk deneme):');
  for (const [k, v] of Object.entries(s.byType)) L.push(`- ${t('type.' + k)}: %${pct(v.ok, v.n)} (${v.n})`);
  L.push('');
  L.push('En çok zorlanılan kartlar:');
  for (const h of s.hardList) {
    const c = CARDS.get(h.id);
    const l = h.last;
    L.push(`- ${h.id} ${c ? (c.f || c.v) : ''} — ${h.n} hata; son: "${l.typed || '—'}" yerine "${l.exp}" (${l.r}${l.why ? ', ' + l.why : ''})`);
  }
  const why = {};
  for (const l of logs) if (l.why && l.r !== 'ok') why[l.r + ':' + l.why] = (why[l.r + ':' + l.why] || 0) + 1;
  if (Object.keys(why).length) {
    L.push('');
    L.push('Hata alt türleri:');
    for (const [k, v] of Object.entries(why).sort((a, b) => b[1] - a[1])) L.push(`- ${k}: ${v}`);
  }
  const claims = (S.prof.claims || []).filter(x => x.day >= from);
  if (claims.length) {
    L.push('');
    L.push('"Bence doğruydu" itirazları (kontrol et):');
    for (const c of claims) L.push(`- ${c.id}: "${c.typed}" (beklenen: ${c.exp})`);
  }
  const reps = (S.prof.reports || []).filter(x => x.day >= from);
  if (reps.length) {
    L.push('');
    L.push('Vurgu bildirimleri:');
    for (const r of reps) L.push(`- ${r.key}: ${r.text}`);
  }
  const data = { from, to: today, summary: { ...s, days: s.days, hard: undefined }, logs: logs.map(l => ({ d: l.day, id: l.id, t: l.t, r: l.r, why: l.why, typed: l.typed, exp: l.exp, ms: l.ms, hint: l.hint, again: l.again })) };
  return L.join('\n') + '\n\n--- VERİ ---\n' + JSON.stringify(data);
}

// ---------------------------------------------------------------- ayarlar
function row(label, sub, control) {
  return el('div.setrow', el('div.lbl', el('span', label), sub ? el('small', sub) : null), control);
}

async function renderAyar(body) {
  const st = S.settings;
  const save = async (k, v) => { await setSetting(k, v); };
  body.append(
    el('div.kicker', t('a.gGoals')),
    row(t('a.halka'), t('a.halkaSub'), stepper(st.halka, { min: 20, max: 200, step: 10 }, v => save('halka', v))),
    row(t('a.yeni'), t('a.yeniSub'), stepper(st.yeni, { min: 0, max: 100, step: 5 }, v => save('yeni', v))),
    el('div.kicker', t('a.gDecks')),
    ...[...DECKS.values()].map(d => row(d.ad, t('a.deckSub', { n: d.cards.length }),
      el('div', { style: { display: 'flex', gap: '8px', alignItems: 'center' } },
        seg([[1, '1×'], [2, '2×'], [3, '3×']], plan.deckWeight(d.id), async v => { st.deckW[d.id] = v; await saveSettings(); }),
        switchEl(plan.deckOn(d.id), async v => { st.decks[d.id] = v; await saveSettings(); }, d.ad)))),
    el('div.kicker', t('a.gSound')),
    row(t('a.autoplay'), null, switchEl(st.autoplay, v => save('autoplay', v), t('a.autoplay'))),
    row(t('a.rate'), null, seg([[0.8, '0.8×'], [0.9, '0.9×'], [1, '1×']], st.rate, v => save('rate', v))),
    row(t('a.voice'), t('a.voiceSub'), el('span.mono.muted', 'Aidar')),
    row(t('a.sfxStamp'), null, switchEl(st.sfxStamp, v => save('sfxStamp', v), t('a.sfxStamp'))),
    row(t('a.sfxPaper'), null, switchEl(st.sfxPaper, v => save('sfxPaper', v), t('a.sfxPaper'))),
    row(t('a.sfxType'), null, switchEl(st.sfxType, v => save('sfxType', v), t('a.sfxType'))),
    el('div.kicker', t('a.gLook')),
    row(t('a.theme'), null, seg([['dark', t('a.thDark')], ['paper', t('a.thPaper')], ['auto', t('a.thAuto')]], st.theme, async v => { await save('theme', v); applyTheme(); })),
    row(t('a.anim'), t('a.animSub'), switchEl(st.anim, async v => { await save('anim', v); document.body.classList.toggle('anim', v); }, t('a.anim'))),
    row(t('a.advance'), null, seg([[0.8, '0.8 sn'], [1.2, '1.2 sn'], [2, '2 sn']], st.advance, v => save('advance', v))),
  );
  // ses paketleri
  body.append(el('div.kicker', t('a.gAudio')), el('div.note', t('a.audioNote')));
  const dlRow = (label, sub, statusFn, dlFn) => {
    const status = el('span.mono.muted', '…');
    const btn = el('button.btn.btn-sm', t('a.dl'));
    const upd = async () => {
      try {
        const c = await statusFn();
        status.textContent = `${c.have}/${c.total}`;
        btn.textContent = c.have >= c.total ? t('a.dlDone') : t('a.dl');
        btn.disabled = c.have >= c.total;
      } catch (e) { status.textContent = ''; }
    };
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      try {
        const r = await dlFn((n, tot) => { status.textContent = `${n}/${tot}`; });
        toast(r.failed ? t('a.dlFail', { n: r.failed }) : t('a.dlOk'));
      } catch (e) { toast(t('u.offline')); }
      upd();
    });
    upd();
    body.append(row(label, sub, el('div', { style: { display: 'flex', gap: '10px', alignItems: 'center' } }, status, btn)));
  };
  for (const d of DECKS.values()) {
    if (d.pack) continue;
    dlRow(d.ad, null, () => audio.cachedCount(d.id), p => audio.downloadDeck(d.id, p));
  }
  dlRow(t('a.dlOkuma'), t('a.dlOkumaSub'), async () => audio.cachedKeys(await okumaAudioKeys()), async p => audio.downloadKeys(await okumaAudioKeys(), p));
  dlRow(t('a.dlDict'), t('a.dlDictSub'), dictStatus, downloadDict);
  // yedek
  const a = backupAgeDays();
  body.append(
    el('div.kicker', t('a.gBackup')),
    el('div.note', a == null ? t('a.bkNeverShort') : t('a.bkLast', { n: a })),
    el('div.grid2',
      el('button.btn.btn-primary', { on: { click: doBackup } }, t('a.bkNow')),
      el('button.btn', { on: { click: doRestore } }, t('a.restore'))),
    el('div.kicker', t('a.gPacks')),
    el('div.note', t('a.packNote')),
    el('button.btn.btn-wide', { on: { click: doImportPack } }, t('a.packImport')),
  );
  const packList = el('div');
  body.append(packList,
    el('div.kicker', t('a.gApp')),
    el('div.note', t('a.versions', { a: APP_VERSION, c: CONTENT_VERSION, p: db.persistent ? t('a.persistOk') : t('a.persistNo') })),
    el('button.btn.btn-wide', { on: { click: checkUpdate } }, t('a.update')),
    el('div.note', t('a.about')),
  );
  try {
    for (const p of await db.all('packs')) {
      packList.append(row(p.ad, t('a.packSub', { n: p.n, s: p.ses || 0, d: fmtDay(dayNum(p.at)) }),
        el('button.btn.btn-sm', { on: { click: async () => { if (await confirmBox(t('a.packDelQ', { a: p.ad }), t('a.del'), t('a.cancel'))) { await removePack(p.id); go('arsiv', true); } } } }, t('a.del'))));
    }
  } catch (e) { packList.append(el('div.note', String(e))); }
}

async function doBackup() {
  const data = await exportAll();
  const name = `tercume-yedek-${new Date().toISOString().slice(0, 10)}.json`;
  const r = await shareFile(name, JSON.stringify(data), 'application/json');
  if (r !== 'aborted') {
    S.prof.lastBackup = Date.now();
    await saveProf();
    toast(t('a.bkDone'));
    go('arsiv', true);
  }
}

async function doRestore() {
  const f = await pickFile();
  if (!f) return;
  let data;
  try { data = JSON.parse(await f.text()); } catch (e) { toast(t('a.badFile')); return; }
  if (!data || data.app !== 'tercume-odasi') { toast(t('a.badFile')); return; }
  if (!(await confirmBox(t('a.restoreQ', { d: new Date(data.at).toLocaleDateString('tr-TR') }), t('a.restoreYes'), t('a.cancel')))) return;
  await importAll(data);
  location.reload();
}

async function doImportPack() {
  const f = await pickFile(null); // iOS özel uzantıları (.tpk) seçtirmeyebiliyor; içerik okurken denetleniyor
  if (!f) return;
  toast(t('a.packReading'), 8000);
  try {
    const p = await importPack(await readPackFile(f));
    toast(t('a.packOk', { a: p.ad, n: p.n }));
    go('arsiv', true);
  } catch (e) { console.error(e); toast(t('a.packBad')); }
}
