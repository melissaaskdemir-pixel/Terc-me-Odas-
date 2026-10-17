// Ses: önceden üretilmiş Silero klipleri (internetsiz önbellek) + Web Audio ile ufak efektler
import { S } from './store.js';
import { DECKS, packAudio } from './decks.js';

export const AUDIO_CACHE = 'ses-v1';
const player = new Audio();
player.preload = 'auto';
player.setAttribute('playsinline', '');
const urls = new Map();
let unlocked = false;
let endCb = null;
let lastSfx = 0;           // son efekt ya da okuma sesi (dokunma sesi üst üste binmesin)
export const sfxAt = () => lastSfx;
player.addEventListener('ended', () => fireEnd());
player.addEventListener('error', () => fireEnd());
function fireEnd() { const f = endCb; endCb = null; if (f) f(); }

// 'x:' önekli anahtarlar Xenia (okuma cümleleri), 'a:' önekliler Aidar (okuma kelimeleri), 't:' önekliler Tatoeba insan sesi
export const clipUrl = key => (key[1] === ':' && (key[0] === 'x' || key[0] === 'a' || key[0] === 't'))
  ? `audio/${key[0]}/${key.slice(2)}.mp4` : `audio/${S.settings.voice || 'a'}/${key}.mp4`;

// Arka planda önbelleğe al (internetsiz okuma için); çalmaz
export async function cacheKeys(keys) {
  try {
    const c = await caches.open(AUDIO_CACHE);
    for (const k of keys) {
      if (!k || k.startsWith('p:')) continue;
      const u = clipUrl(k);
      if (await c.match(u)) continue;
      const r = await fetch(u);
      if (r.ok) await c.put(u, r);
    }
  } catch (e) {}
}

async function blobFor(key) {
  if (key.startsWith('p:')) return packAudio(key);
  const url = clipUrl(key);
  try {
    const c = await caches.open(AUDIO_CACHE);
    let r = await c.match(url);
    if (!r) {
      r = await fetch(url);
      if (r.ok) await c.put(url, r.clone());
    }
    if (r && r.ok) return r.blob();
  } catch (e) {
    try { const r = await fetch(url); if (r.ok) return r.blob(); } catch (e2) {}
  }
  return null;
}

export async function prepare(key) {
  if (!key) return null;
  if (urls.has(key)) return urls.get(key);
  const b = await blobFor(key);
  if (!b) return null;
  const u = URL.createObjectURL(new Blob([b], { type: 'audio/mp4' }));
  urls.set(key, u);
  if (urls.size > 80) {
    const [k0, u0] = urls.entries().next().value;
    URL.revokeObjectURL(u0);
    urls.delete(k0);
  }
  return u;
}

export const isPrepared = key => urls.has(key);

// Hazır klibi aynı dokunma olayı içinde çalar (iOS otomatik oynatma kuralı)
export function playNow(key, rate) {
  const u = urls.get(key);
  if (!u) return null;
  return start(u, rate);
}

function start(u, rate = S.settings.rate || 1) {
  fireEnd();
  lastSfx = performance.now();
  return new Promise(res => {
    endCb = res;
    try {
      player.pause();
      player.src = u;
      player.playbackRate = rate;
      try { player.preservesPitch = true; player.webkitPreservesPitch = true; } catch (e) {}
      const p = player.play();
      if (p && p.catch) p.catch(() => fireEnd());
    } catch (e) { fireEnd(); }
  });
}

export async function play(key, rate, fallbackText) {
  const u = key ? await prepare(key) : null;
  if (u) return start(u, rate);
  if (fallbackText) return speak(fallbackText, rate);
}

export function stop() { try { player.pause(); } catch (e) {} fireEnd(); }

function speak(text, rate = 1) {
  lastSfx = performance.now();
  return new Promise(res => {
    try {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'ru-RU';
      u.rate = rate * 0.95;
      u.onend = u.onerror = () => res();
      speechSynthesis.cancel();
      speechSynthesis.speak(u);
    } catch (e) { res(); }
  });
}

// iOS: ilk dokunuşta ses öğesini "uyandır"
function silentUrl() {
  const n = 2400, buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf);
  const w = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  w(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); w(8, 'WAVE'); w(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true);
  v.setUint16(22, 1, true); v.setUint32(24, 24000, true); v.setUint32(28, 48000, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  w(36, 'data'); v.setUint32(40, n * 2, true);
  return URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
}
export function unlock() {
  if (unlocked) return;
  unlocked = true;
  try {
    player.src = silentUrl();
    const p = player.play();
    if (p && p.catch) p.catch(() => { unlocked = false; });
  } catch (e) { unlocked = false; }
  try { ac(); } catch (e) {}
}

// ---------------------------------------------------------------- efektler
let ctx = null;
function ac() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}
function noise(c, dur) {
  const b = c.createBuffer(1, Math.ceil(c.sampleRate * dur), c.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const s = c.createBufferSource();
  s.buffer = b;
  return s;
}
export function sfx(name) {
  const st = S.settings;
  if (name === 'stamp' && !st.sfxStamp) return;
  if (name === 'big' && !st.sfxStamp) return;
  if (name === 'type' && !st.sfxType) return;
  if (name === 'paper' && !st.sfxPaper) return;
  const tap = name === 'tap' || name === 'sel';
  if (tap && st.sfxTap === false) return;
  if (!tap) lastSfx = performance.now();
  try {
    const c = ac(), t0 = c.currentTime;
    if (name === 'stamp' || name === 'big') {
      const k = name === 'big' ? 1.4 : 1;
      const n = noise(c, 0.09), f = c.createBiquadFilter(), g = c.createGain();
      f.type = 'lowpass'; f.frequency.value = 900;
      g.gain.setValueAtTime(0.5 * k, t0); g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.09);
      n.connect(f).connect(g).connect(c.destination); n.start(t0);
      const o = c.createOscillator(), g2 = c.createGain();
      o.frequency.setValueAtTime(110, t0); o.frequency.exponentialRampToValueAtTime(48, t0 + 0.12);
      g2.gain.setValueAtTime(0.55 * k, t0); g2.gain.exponentialRampToValueAtTime(0.001, t0 + 0.14);
      o.connect(g2).connect(c.destination); o.start(t0); o.stop(t0 + 0.15);
      if (name === 'big') setTimeout(() => sfx('stamp'), 140);
    } else if (name === 'type') {
      const n = noise(c, 0.018), f = c.createBiquadFilter(), g = c.createGain();
      f.type = 'highpass'; f.frequency.value = 1800;
      g.gain.setValueAtTime(0.16, t0); g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.018);
      n.connect(f).connect(g).connect(c.destination); n.start(t0);
    } else if (name === 'paper') {
      const n = noise(c, 0.2), f = c.createBiquadFilter(), g = c.createGain();
      f.type = 'bandpass'; f.frequency.setValueAtTime(2500, t0); f.frequency.linearRampToValueAtTime(4200, t0 + 0.2); f.Q.value = 0.8;
      g.gain.setValueAtTime(0.0001, t0); g.gain.linearRampToValueAtTime(0.05, t0 + 0.05); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.2);
      n.connect(f).connect(g).connect(c.destination); n.start(t0);
    } else if (tap) {
      // kısa tahta tık: çıtırtı + küçük gövde; seçimlerde biraz daha ince
      const hi = name === 'sel';
      const n = noise(c, 0.007), f = c.createBiquadFilter(), g = c.createGain();
      f.type = 'highpass'; f.frequency.value = hi ? 2600 : 1700;
      g.gain.setValueAtTime(0.05, t0); g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.007);
      n.connect(f).connect(g).connect(c.destination); n.start(t0);
      const o = c.createOscillator(), g2 = c.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(hi ? 940 : 560, t0); o.frequency.exponentialRampToValueAtTime(hi ? 700 : 400, t0 + 0.045);
      g2.gain.setValueAtTime(0.0001, t0); g2.gain.linearRampToValueAtTime(hi ? 0.045 : 0.065, t0 + 0.003);
      g2.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.055);
      o.connect(g2).connect(c.destination); o.start(t0); o.stop(t0 + 0.06);
    } else if (name === 'soft') {
      const o = c.createOscillator(), g = c.createGain();
      o.type = 'sine'; o.frequency.value = 220;
      g.gain.setValueAtTime(0.08, t0); g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.12);
      o.connect(g).connect(c.destination); o.start(t0); o.stop(t0 + 0.13);
    }
  } catch (e) {}
}

// ---------------------------------------------------------------- ses paketleri (internetsiz kullanım için)
export function deckAudioKeys(deckId) {
  const d = DECKS.get(deckId);
  if (!d) return [];
  const keys = new Set();
  for (const c of d.cards) {
    if (c.au) keys.add(c.au);
    for (const e of c.ex || []) if (e[2]) keys.add(e[2]);
    for (const z of c.cz || []) if (z.au) keys.add(z.au);
  }
  return [...keys].filter(k => !k.startsWith('p:'));
}

export async function cachedCount(deckId) { return cachedKeys(deckAudioKeys(deckId)); }

export async function cachedKeys(keys) {
  try {
    const c = await caches.open(AUDIO_CACHE);
    const have = new Set((await c.keys()).map(r => new URL(r.url).pathname));
    return { total: keys.length, have: keys.filter(k => have.has(new URL(clipUrl(k), location.href).pathname)).length };
  } catch (e) { return { total: keys.length, have: 0 }; }
}

export function downloadDeck(deckId, onProgress, signal) { return downloadKeys(deckAudioKeys(deckId), onProgress, signal); }

export async function downloadKeys(keys, onProgress, signal) {
  const c = await caches.open(AUDIO_CACHE);
  let done = 0, failed = 0;
  const queue = [];
  for (const k of keys) if (!(await c.match(clipUrl(k)))) queue.push(k); else done++;
  onProgress && onProgress(done, keys.length, failed);
  async function worker() {
    while (queue.length) {
      if (signal && signal.aborted) return;
      const k = queue.shift();
      try {
        const r = await fetch(clipUrl(k));
        if (r.ok) await c.put(clipUrl(k), r); else failed++;
      } catch (e) { failed++; }
      done++;
      onProgress && onProgress(done, keys.length, failed);
    }
  }
  await Promise.all(Array.from({ length: 6 }, worker));
  return { total: keys.length, failed };
}
