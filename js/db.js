// IndexedDB katmanı. Tarayıcı izin vermezse bellek içi yedeğe düşer (o zaman kayıt kalıcı olmaz).
const NAME = 'tercume-odasi';
const VERSION = 2;
export const STORES = ['kv', 'cards', 'log', 'days', 'packs', 'pses'];

let db = null;
let mem = null; // IndexedDB yoksa
export let persistent = true;

export function open() {
  return new Promise(resolve => {
    let req;
    try { req = indexedDB.open(NAME, VERSION); } catch (e) { fallback(); return resolve(false); }
    req.onupgradeneeded = () => {
      const d = req.result;
      if (!d.objectStoreNames.contains('kv')) d.createObjectStore('kv');
      if (!d.objectStoreNames.contains('cards')) d.createObjectStore('cards', { keyPath: 'id' });
      if (!d.objectStoreNames.contains('log')) {
        const s = d.createObjectStore('log', { keyPath: 'n', autoIncrement: true });
        s.createIndex('day', 'day');
      }
      if (!d.objectStoreNames.contains('days')) d.createObjectStore('days', { keyPath: 'day' });
      if (!d.objectStoreNames.contains('packs')) d.createObjectStore('packs', { keyPath: 'id' });
      if (!d.objectStoreNames.contains('pses')) d.createObjectStore('pses'); // paket sesleri: anahtar → Blob
    };
    req.onsuccess = () => { db = req.result; db.onversionchange = () => db.close(); resolve(true); };
    req.onerror = () => { fallback(); resolve(false); };
    req.onblocked = () => {};
  });
}

function fallback() {
  persistent = false;
  mem = Object.fromEntries(STORES.map(s => [s, new Map()]));
}

function req2p(r) {
  return new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
}

export async function get(store, key) {
  if (mem) return mem[store].get(key);
  return req2p(db.transaction(store).objectStore(store).get(key));
}

export async function all(store) {
  if (mem) return [...mem[store].values()];
  return req2p(db.transaction(store).objectStore(store).getAll());
}

export async function allKV() {
  if (mem) return Object.fromEntries(mem.kv);
  const tx = db.transaction('kv');
  const s = tx.objectStore('kv');
  const [keys, vals] = await Promise.all([req2p(s.getAllKeys()), req2p(s.getAll())]);
  return Object.fromEntries(keys.map((k, i) => [k, vals[i]]));
}

let logSeq = 1;
export async function put(store, val, key) {
  if (mem) {
    if (key !== undefined) mem[store].set(key, val);
    else if (store === 'log') { if (val.n == null) val.n = logSeq++; mem.log.set(val.n, val); }
    else mem[store].set(val.id ?? val.day, val);
    return;
  }
  const tx = db.transaction(store, 'readwrite');
  const s = tx.objectStore(store);
  const r = key !== undefined ? s.put(val, key) : s.put(val);
  return req2p(r);
}

// Tek işlemde çok yazma: [[store, val, key], ...]
export async function putMany(items) {
  if (mem) { for (const [s, v, k] of items) await put(s, v, k); return; }
  const stores = [...new Set(items.map(i => i[0]))];
  const tx = db.transaction(stores, 'readwrite');
  for (const [s, v, k] of items) k !== undefined ? tx.objectStore(s).put(v, k) : tx.objectStore(s).put(v);
  return new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error); });
}

export async function delPrefix(store, prefix) {
  if (mem) { for (const k of [...mem[store].keys()]) if (String(k).startsWith(prefix)) mem[store].delete(k); return; }
  return req2p(db.transaction(store, 'readwrite').objectStore(store).delete(IDBKeyRange.bound(prefix, prefix + '\uffff')));
}

export async function del(store, key) {
  if (mem) return mem[store].delete(key);
  return req2p(db.transaction(store, 'readwrite').objectStore(store).delete(key));
}

export async function clear(store) {
  if (mem) return mem[store].clear();
  return req2p(db.transaction(store, 'readwrite').objectStore(store).clear());
}

export async function logRange(fromDay, toDay = 1e9) {
  if (mem) return [...mem.log.values()].filter(x => x.day >= fromDay && x.day <= toDay);
  const idx = db.transaction('log').objectStore('log').index('day');
  return req2p(idx.getAll(IDBKeyRange.bound(fromDay, toDay)));
}

// Kalıcı depolama izni (Safari ana ekran uygulamasında zaten kalıcı; diğerlerinde ister)
export async function askPersist() {
  try { if (navigator.storage && navigator.storage.persist) return await navigator.storage.persist(); } catch (e) {}
  return false;
}
