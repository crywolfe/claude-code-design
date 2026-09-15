/* live_reload.js — dev-only. Polls this page's Last-Modified header over the
 * local /serve server and reloads when the file on disk changes.
 * No-ops unless served from 127.0.0.1. Never included in exports:
 * the <script> tag that loads it carries data-dev-only. */
(() => {
  if (location.protocol !== 'http:' || location.hostname !== '127.0.0.1') return;
  const INTERVAL_MS = 750;
  const url = location.pathname;           // no ?v= cache-buster: HEAD the real file
  let last = null;
  let failures = 0;

  const badge = document.createElement('div');
  badge.id = '__live_reload_badge';
  badge.setAttribute('data-decorative', '');
  badge.hidden = true;
  badge.style.cssText = 'position:fixed;left:12px;bottom:12px;z-index:99998;' +
    'font:11px/1 ui-monospace,Menlo,monospace;color:#fff;background:#c0392b;' +
    'padding:4px 8px;border-radius:4px;pointer-events:none';
  badge.textContent = 'live reload: server unreachable';
  const onReady = (fn) => document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', fn) : fn();
  onReady(() => document.body.appendChild(badge));

  const tick = async () => {
    try {
      const res = await fetch(url, { method: 'HEAD', cache: 'no-store' });
      // Last-Modified has one-second resolution; adding the length catches same-second saves.
      const lm = res.headers.get('Last-Modified') + '|' + res.headers.get('Content-Length');
      failures = 0;
      badge.hidden = true;
      if (last === null) { last = lm; return; }
      if (lm !== last) { location.reload(); return; }
    } catch (e) {
      failures += 1;
      if (failures >= 4) badge.hidden = false;
    }
  };
  setInterval(tick, INTERVAL_MS);
})();
