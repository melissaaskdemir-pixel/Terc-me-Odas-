// Arayüz metinleri ayrı dil dosyasındadır; ileride İngilizce sürüm için en.js eklenir.
import TR from './i18n/tr.js';

const LANGS = { tr: TR };
let cur = TR;

export function setLang(code) { cur = LANGS[code] || TR; }

export function t(key, vars) {
  let s = cur[key];
  if (s == null) {
    console.warn('i18n eksik:', key);
    return key;
  }
  if (vars) s = s.replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? ''));
  return s;
}
