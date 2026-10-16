// Tercüme Odası — giriş noktası
import { el, svg, ICON, dayNum, weekStart } from './util.js';
import { t } from './i18n.js';
import * as db from './db.js';
import { S, loadState, saveProf } from './store.js';
import { loadDecks, loadMorph } from './decks.js';
import * as plan from './plan.js';
import * as audio from './audio.js';
import { toast } from './ui.js';
import { isStudying } from './study.js';
import { renderMasa, maybeBriefing } from './masa.js';
import { renderCalis } from './calis.js';
import { renderOkuma, isReading } from './okuma.js';
import { renderSozluk } from './sozluk.js';
import { renderArsiv, backupWarn } from './arsiv.js';
import { renderKapsam } from './kapsam.js';

export const APP_VERSION = '0.2.3';

const TABS = [
  ['masa', 'tab.masa', renderMasa], ['calis', 'tab.calis', renderCalis], ['okuma', 'tab.okuma', renderOkuma],
  ['sozluk', 'tab.sozluk', renderSozluk], ['arsiv', 'tab.arsiv', renderArsiv],
  ['kapsam', 'tab.masa', renderKapsam, true],   // sekme çubuğunda görünmez
];
let current = 'masa';
const scrollPos = {};

export function go(name, keepScroll) {
  if (waitingSW && !isStudying() && !isReading()) { waitingSW.postMessage('skipWaiting'); }
  const screen = document.getElementById('screen');
  if (!isStudying()) scrollPos[current] = screen.scrollTop;
  current = name;
  screen.innerHTML = '';
  const tab = TABS.find(x => x[0] === name) || TABS[0];
  try { tab[2](screen); } catch (e) { console.error(e); screen.append(el('div.wrap', el('div.panel', t('err.render')))); }
  screen.scrollTop = keepScroll ? (scrollPos[name] || 0) : 0;
  renderTabs();
}

function renderTabs() {
  const nav = document.getElementById('tabs');
  nav.innerHTML = '';
  for (const [k, lab, , hidden] of TABS) {
    if (hidden) continue;
    const b = el('button', { 'aria-current': k === current || (k === 'masa' && current === 'kapsam') ? 'page' : null, on: { click: () => go(k) } }, svg(ICON[k]), t(lab));
    if (k === 'arsiv' && backupWarn()) b.append(el('span.dot', { 'aria-label': t('a.bkDot') }));
    nav.append(b);
  }
}

// ---------------------------------------------------------------- tema ve görünüm alanı
export function applyTheme() {
  let th = S.settings.theme;
  if (th === 'auto') { const h = new Date().getHours(); th = h >= 7 && h < 19 ? 'paper' : 'dark'; }
  document.documentElement.dataset.theme = th;
  document.querySelector('meta[name="theme-color"]').content = th === 'paper' ? '#E9E1CD' : '#121A2B';
}

const fullH = {};
function viewport() {
  const vv = window.visualViewport;
  const app = document.getElementById('app');
  // iOS 26 ana ekran uygulamasında web görünümü bazen durum çubuğu kadar kısa kalıyor ve altındaki şerit
  // çizilemiyor. Bu durumda alt güvenli alan payı (ev çubuğu) zaten görünür alanın dışında: payı sıfırla ki
  // sekme çubuğu görünür alanın en altına otursun.
  const standalone = window.navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches;
  let probe = null;
  if (standalone) {
    probe = document.createElement('div');
    probe.setAttribute('aria-hidden', 'true');
    probe.style.cssText = 'position:fixed;top:0;left:0;width:0;height:100vh;height:100lvh;visibility:hidden;pointer-events:none;';
    document.body.append(probe);
  }
  const upd = () => {
    const h = vv ? vv.height : window.innerHeight;
    document.documentElement.style.setProperty('--vvh', h + 'px');
    // klavye açık mı: bu genişlikte görülen en büyük yükseklikten belirgin biçimde kısaysa.
    // (iOS ana ekran uygulamasında window.innerHeight klavyeyle bazen küçülüyor; ona güvenilmez)
    const w = Math.round(vv ? vv.width : window.innerWidth);
    fullH[w] = Math.max(fullH[w] || 0, h);
    const kb = fullH[w] - h > 150;
    document.body.classList.toggle('kb', kb);
    if (!kb && probe) {
      const gap = probe.offsetHeight - h;
      document.body.classList.toggle('shortvp', gap > 20 && gap < 140);
    }
    app.style.top = (vv ? vv.offsetTop : 0) + 'px';
  };
  if (vv) { vv.addEventListener('resize', upd); vv.addEventListener('scroll', upd); }
  window.addEventListener('resize', upd);
  window.addEventListener('orientationchange', () => setTimeout(upd, 300));
  upd();
  setTimeout(upd, 500);
  // iOS: klavye açılınca sayfanın kaymasını engelle
  window.addEventListener('scroll', () => { if (window.scrollY) window.scrollTo(0, 0); });
}

// ---------------------------------------------------------------- servis çalışanı (internetsiz)
let waitingSW = null;
async function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  try {
    const reg = await navigator.serviceWorker.register('sw.js', { scope: './' });
    // yeni sürüm: çalışma sürmüyorsa hemen uygula, sürüyorsa oturum bitince
    const onWaiting = w => { waitingSW = w; if (!isStudying()) w.postMessage('skipWaiting'); };
    if (reg.waiting && navigator.serviceWorker.controller) onWaiting(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const nw = reg.installing;
      nw && nw.addEventListener('statechange', () => {
        if (nw.state === 'installed' && navigator.serviceWorker.controller) onWaiting(nw);
      });
    });
    let reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (!reloaded && waitingSW) { reloaded = true; location.reload(); } });
  } catch (e) { console.warn('SW', e); }
}

export async function checkUpdate() {
  if (waitingSW) { waitingSW.postMessage('skipWaiting'); return; }
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    if (!reg) { toast(t('u.none')); return; }
    await reg.update();
    setTimeout(() => {
      if (reg.waiting) { waitingSW = reg.waiting; waitingSW.postMessage('skipWaiting'); }
      else toast(t('u.latest'));
    }, 1500);
  } catch (e) { toast(t('u.offline')); }
}

// ---------------------------------------------------------------- açılış
async function boot() {
  viewport();
  await db.open();
  await loadState();
  applyTheme();
  document.body.classList.toggle('anim', S.settings.anim !== false);
  try {
    await loadDecks();
  } catch (e) {
    document.getElementById('screen').append(el('div.wrap', el('div.panel', t('err.load'))));
    console.error(e);
    return;
  }
  await plan.reconcile();
  // haftanın başında bilinen kelime anlık görüntüsü
  const ws = weekStart(dayNum());
  if (S.prof.weekSnap?.[ws] == null) {
    S.prof.weekSnap = { [ws]: plan.knownCount() };
    await saveProf();
  }
  go('masa');
  if (S.prof.lastFreezeNote && S.prof.lastFreezeNote.at === dayNum() && !S.prof.lastFreezeNote.shown) {
    toast(t('m.freezeUsed', { n: S.prof.lastFreezeNote.days }), 4500);
    S.prof.lastFreezeNote.shown = true;
    await saveProf();
  }
  maybeBriefing();
  registerSW();
  db.askPersist();
  setTimeout(() => loadMorph().catch(() => {}), 800);
  const unlock = () => { audio.unlock(); window.removeEventListener('touchend', unlock, true); window.removeEventListener('click', unlock, true); };
  window.addEventListener('touchend', unlock, true);
  window.addEventListener('click', unlock, true);
  // gün değişince ve uygulamaya dönünce Masa'yı tazele
  let lastDay = dayNum();
  document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState !== 'visible') return;
    applyTheme();
    if (dayNum() !== lastDay) {
      lastDay = dayNum();
      await plan.reconcile();
      if (!isStudying()) go(current, true);
    }
  });
}

boot();
