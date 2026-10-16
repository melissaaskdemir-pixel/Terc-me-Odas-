// Tercüme Odası servis çalışanı: uygulama kabuğu ve içerik internetsiz çalışsın diye önbellekte tutulur.
const VERSION = 'fd1773f68c';
const SHELL = 'kabuk-' + VERSION;
const AUDIO = 'ses-v1';
const FILES = [
 "./",
 "./index.html",
 "./manifest.webmanifest",
 "./css/app.css",
 "./js/arsiv.js",
 "./js/audio.js",
 "./js/calis.js",
 "./js/check.js",
 "./js/db.js",
 "./js/decks.js",
 "./js/fsrs.js",
 "./js/i18n.js",
 "./js/main.js",
 "./js/masa.js",
 "./js/okuma.js",
 "./js/plan.js",
 "./js/sozluk.js",
 "./js/store.js",
 "./js/study.js",
 "./js/ui.js",
 "./js/util.js",
 "./js/i18n/tr.js",
 "./fonts/ptmono-cyr.woff2",
 "./fonts/ptmono-lat.woff2",
 "./fonts/ptmono-latext.woff2",
 "./fonts/ptsans-400-cyr.woff2",
 "./fonts/ptsans-400-lat.woff2",
 "./fonts/ptsans-400-latext.woff2",
 "./fonts/ptsans-700-cyr.woff2",
 "./fonts/ptsans-700-lat.woff2",
 "./fonts/ptsans-700-latext.woff2",
 "./fonts/ptserif-400-cyr.woff2",
 "./fonts/ptserif-400-lat.woff2",
 "./fonts/ptserif-400-latext.woff2",
 "./fonts/ptserif-700-cyr.woff2",
 "./fonts/ptserif-700-lat.woff2",
 "./fonts/ptserif-700-latext.woff2",
 "./icons/apple-touch-icon.png",
 "./icons/favicon-32.png",
 "./icons/icon-192.png",
 "./icons/icon-512.png",
 "./icons/icon-maskable-512.png",
 "./data/kendi.json",
 "./data/morph.json"
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(SHELL).then(c => c.addAll(FILES.map(f => new Request(f, { cache: 'reload' })))));
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== SHELL && k !== AUDIO && k.startsWith('kabuk-')) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('message', e => { if (e.data === 'skipWaiting') self.skipWaiting(); });

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  if (url.pathname.includes('/audio/')) {
    e.respondWith((async () => {
      const c = await caches.open(AUDIO);
      const hit = await c.match(req, { ignoreSearch: true });
      if (hit) return hit;
      const r = await fetch(req);
      if (r.ok && r.status === 200) c.put(req, r.clone());
      return r;
    })());
    return;
  }
  e.respondWith((async () => {
    const c = await caches.open(SHELL);
    if (req.mode === 'navigate') {
      return (await c.match('./index.html')) || (await c.match('./')) || fetch(req);
    }
    const hit = await c.match(req, { ignoreSearch: true });
    if (hit) return hit;
    try { return await fetch(req); } catch (err) { return new Response('', { status: 504 }); }
  })());
});
