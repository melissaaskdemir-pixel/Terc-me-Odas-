// Desteler: yerleşik içerik paketleri + içe aktarılan kişisel paketler
import * as db from './db.js';
import { setMorph } from './check.js';

export const DECKS = new Map();   // id → { id, ad, cards, pack? }
export const CARDS = new Map();   // kart kimliği → kart
export let SERIES = {};
export let CONTENT_VERSION = '';

async function fetchJSON(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(url + ' ' + r.status);
  return r.json();
}

function addDeck(d, pack) {
  const deck = { id: d.id, ad: d.ad, cards: d.cards, pack: pack || null };
  d.cards.forEach((c, i) => { c.deck = d.id; if (c.o == null) c.o = i; CARDS.set(c.id, c); });
  DECKS.set(d.id, deck);
}

export async function loadDecks() {
  const k = await fetchJSON('data/kendi.json');
  CONTENT_VERSION = k.v;
  SERIES = k.series || {};
  addDeck(k);
  for (const p of await db.all('packs')) for (const d of p.decks || []) addDeck(d, p.id);
}

let morphP = null;
export function loadMorph() {
  if (!morphP) morphP = fetchJSON('data/morph.json').then(setMorph).catch(e => { morphP = null; throw e; });
  return morphP;
}

// ---------------------------------------------------------------- kart yardımcıları
export const TYPE_GROUP = {
  kelime: 'kelime', kalip: 'kelime', baglac: 'kelime', terim: 'kelime',
  cift: 'cift', yonetim: 'yonetim', koll: 'koll', register: 'koll', esanlam: 'esanlam',
};

// Kartın bu gösterimdeki beklenen cevabı
export function expected(card, variant = 0) {
  if (card.cz && card.cz.length) {
    const z = card.cz[variant % card.cz.length];
    return { accepted: z.a, show: z.a[0], cloze: z, full: z.full || card.f, audio: z.au || card.au };
  }
  return { accepted: card.a, show: card.a[0], cloze: null, full: card.f, audio: card.au };
}

export function variantCount(card) { return card.cz ? card.cz.length : 1; }

// ---------------------------------------------------------------- kişisel paketler
// İki biçim kabul edilir:
// 1) JSON: { tur: 'tercume-paket', id, ad, v, desteler: [{ id, ad, cards }], ses?: { anahtar: dataURL } }
// 2) İkili .tpk: 'TOPK' | u32 sürüm | u32 başlık uzunluğu | başlık JSON | ses verisi; başlık.ses = { anahtar: [ofset, uzunluk] }
export async function readPackFile(file) {
  const buf = await file.arrayBuffer();
  const u8 = new Uint8Array(buf);
  if (u8[0] === 0x54 && u8[1] === 0x4F && u8[2] === 0x50 && u8[3] === 0x4B) {
    const dv = new DataView(buf);
    const hl = dv.getUint32(8, true);
    const head = JSON.parse(new TextDecoder().decode(u8.subarray(12, 12 + hl)));
    const base = 12 + hl;
    const type = head.sesTur || 'audio/mp4';
    const blobs = {};
    for (const [k, [off, len]] of Object.entries(head.ses || {})) blobs[k] = new Blob([u8.subarray(base + off, base + off + len)], { type });
    head.ses = null;
    return { head, blobs };
  }
  const head = JSON.parse(new TextDecoder().decode(u8));
  const blobs = {};
  for (const [k, v] of Object.entries(head.ses || {})) blobs[k] = await (await fetch(v)).blob();
  head.ses = null;
  return { head, blobs };
}

export async function importPack({ head: obj, blobs }) {
  if (!obj || obj.tur !== 'tercume-paket' || !obj.id || !Array.isArray(obj.desteler)) throw new Error('paket');
  const pid = String(obj.id).replace(/[^\w-]/g, '');
  const pre = `p:${pid}:`;
  const decks = obj.desteler.map(d => ({
    id: pre + d.id, ad: d.ad || d.id,
    cards: (d.cards || []).map((c, i) => {
      const x = { ...c, id: c.id.startsWith(pre) ? c.id : pre + c.id, o: c.o ?? i };
      if (c.au) x.au = pre + c.au;
      if (c.ex) x.ex = c.ex.map(e => (e[2] ? [e[0], e[1], pre + e[2]] : e));
      if (c.cz) x.cz = c.cz.map(z => (z.au ? { ...z, au: pre + z.au } : z));
      return x;
    }),
  }));
  // eski sürüm varsa kartları ve sesleri değiştir (ilerleme korunur: kart kimlikleri aynı)
  await db.delPrefix('pses', pre);
  const items = Object.entries(blobs || {}).map(([k, b]) => ['pses', b, pre + k]);
  for (let i = 0; i < items.length; i += 300) await db.putMany(items.slice(i, i + 300));
  const rec = { id: pid, ad: obj.ad || pid, v: obj.v || 1, at: Date.now(), decks, n: decks.reduce((a, d) => a + d.cards.length, 0), ses: items.length };
  await db.put('packs', rec);
  for (const [id, d] of [...DECKS]) if (d.pack === pid) { d.cards.forEach(c => CARDS.delete(c.id)); DECKS.delete(id); }
  for (const d of decks) addDeck(d, pid);
  return rec;
}

export async function removePack(pid) {
  await db.del('packs', pid);
  await db.delPrefix('pses', `p:${pid}:`);
  for (const [id, d] of [...DECKS]) if (d.pack === pid) {
    d.cards.forEach(c => CARDS.delete(c.id));
    DECKS.delete(id);
  }
}

export async function packAudio(key) {
  return (await db.get('pses', key)) || null;
}
