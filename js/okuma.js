// Okuma odası v0.2'de açılıyor. Bu sürümde sadece neyin geleceğini gösterir.
import { el } from './util.js';
import { t } from './i18n.js';

export function renderOkuma(root) {
  root.append(el('div.wrap',
    el('div.kicker', t('o.kicker')),
    el('h1.h1', t('o.title')),
    el('div.paper', { style: { padding: '20px 18px', display: 'flex', flexDirection: 'column', gap: '10px' } },
      el('div.mono', { style: { fontSize: '11px', letterSpacing: '.12em', color: 'var(--p-kicker)' } }, 'ДЕЛО 01 · v0.2'),
      el('div.ru', { style: { fontSize: '21px', lineHeight: '1.35' } }, 'Энергетическая безопасность Черноморского региона'),
      el('p', { style: { margin: 0, color: 'var(--p-muted)', fontSize: '15px' } }, t('o.body')),
      el('ul', { style: { margin: 0, paddingLeft: '18px', color: 'var(--p-muted)', fontSize: '15px', lineHeight: '1.6' } },
        ...['o.f1', 'o.f2', 'o.f3', 'o.f4', 'o.f5'].map(k => el('li', t(k))))),
  ));
}
