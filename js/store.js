// Uygulama durumu: ayarlar, profil, kart durumları, günlük kayıtlar (bellekte + IndexedDB)
import * as db from './db.js';
import { dayNum } from './util.js';

export const DEFAULTS = {
  halka: 60,            // günlük hedef (cevap sayısı)
  yeni: 30,             // günde yeni kart
  taniYeni: 20,         // okuma çekirdeği: günde yeni tanıma kartı
  decks: { kendi: true, mfa: true },
  deckW: { kendi: 2, mfa: 1, cekirdek: 2 },
  autoplay: true,       // cevaptan sonra otomatik seslendir
  rate: 1,              // ses hızı
  voice: 'a',           // a = Aidar
  sfxStamp: true, sfxType: false, sfxPaper: true,
  sfxTap: true,         // düğmelere dokununca kısa tık
  haptic: true,         // dokunuşta titreşim (iPhone: iOS 18 ve sonrası)
  anim: true,
  theme: 'dark',        // dark | paper | auto
  advance: 1.2,         // doğru cevaptan sonra geçiş süresi (sn)
  retention: 0.9,
  ydsBase: 87.5,        // son ölçülen YDS puanı (2021 denemesi)
};

export const S = {
  settings: { ...DEFAULTS },
  prof: {},
  cards: new Map(),
  days: new Map(),
};

export async function loadState() {
  const kv = await db.allKV();
  S.settings = { ...DEFAULTS, ...(kv.settings || {}) };
  S.settings.decks = { ...DEFAULTS.decks, ...(kv.settings?.decks || {}) };
  S.settings.deckW = { ...DEFAULTS.deckW, ...(kv.settings?.deckW || {}) };
  S.prof = { theta: 0, freezes: 0, best: 0, milestones: [], alts: {}, reports: [], extraNew: {}, weekSnap: {}, ...(kv.prof || {}) };
  if (!S.prof.installedAt) { S.prof.installedAt = Date.now(); await saveProf(); }
  for (const c of await db.all('cards')) S.cards.set(c.id, c);
  for (const d of await db.all('days')) S.days.set(d.day, d);
}

export const set = k => S.settings[k];
export async function saveSettings() { await db.put('kv', S.settings, 'settings'); }
export async function setSetting(k, v) { S.settings[k] = v; await saveSettings(); }
export async function saveProf() { await db.put('kv', S.prof, 'prof'); }

export function cardState(id) {
  return S.cards.get(id) || { id, st: 0 };
}

export function dayRec(day = dayNum()) {
  let r = S.days.get(day);
  if (!r) { r = { day, n: 0, ok: 0, nw: 0, pts: 0, sec: 0, err: { imla: 0, sonek: 0, yapi: 0, bil: 0 } }; S.days.set(day, r); }
  return r;
}

// Bir cevabın tüm yazımlarını tek işlemde kaydeder
export async function commit({ card, day, log, prof }) {
  const items = [];
  if (card) { S.cards.set(card.id, card); items.push(['cards', card]); }
  if (day) items.push(['days', day]);
  if (log) items.push(['log', log]);
  if (prof) items.push(['kv', S.prof, 'prof']);
  await db.putMany(items);
}

// ---------------------------------------------------------------- yedek
export async function exportAll() {
  const [kv, cards, log, days, packs] = await Promise.all([db.allKV(), db.all('cards'), db.all('log'), db.all('days'), db.all('packs')]);
  return { app: 'tercume-odasi', format: 1, at: Date.now(), kv, cards, log, days, packs };
}

export async function importAll(data) {
  if (!data || data.app !== 'tercume-odasi') throw new Error('format');
  for (const s of db.STORES) if (s !== 'pses') await db.clear(s); // paket sesleri telefonda kalır
  const items = [];
  for (const [k, v] of Object.entries(data.kv || {})) items.push(['kv', v, k]);
  for (const c of data.cards || []) items.push(['cards', c]);
  for (const d of data.days || []) items.push(['days', d]);
  for (const p of data.packs || []) items.push(['packs', p]);
  for (const l of data.log || []) { const x = { ...l }; delete x.n; items.push(['log', x]); }
  for (let i = 0; i < items.length; i += 2000) await db.putMany(items.slice(i, i + 2000));
}
