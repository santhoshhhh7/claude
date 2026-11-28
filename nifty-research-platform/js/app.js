/* Application shell: hash router, theme, header status, global actions. */
(function (root) {
  'use strict';
  const NRP = root.NRP, U = NRP.ui, F = U.fmt;
  const ROUTES = ['overview', 'chain', 'greeks', 'futures', 'fii', 'intel', 'backtest', 'risk', 'payoff', 'insights', 'data', 'methodology'];
  const THEME_KEY = 'nrp.v1.theme';
  let current = null, queued = false;

  function theme(t) {
    const sys = root.matchMedia && root.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    const v = t || (() => { try { return root.localStorage.getItem(THEME_KEY); } catch (e) { return null; } })() || sys;
    document.documentElement.dataset.theme = v;
    const b = U.$('#btn-theme'); if (b) { b.textContent = v === 'dark' ? 'Light' : 'Dark'; b.setAttribute('aria-label', 'Switch to ' + (v === 'dark' ? 'light' : 'dark') + ' theme'); }
    return v;
  }

  function nav() {
    U.$('#nav').innerHTML = ROUTES.map(id => {
      const m = NRP.modules[id];
      return `<a href="#/${id}" data-r="${id}" class="${id === current ? 'on' : ''}"><span class="code">${U.esc(m.code)}</span>${U.esc(m.title)}</a>`;
    }).join('');
  }

  function status() {
    const src = NRP.store.sources, asOf = src.reduce((m, s) => (s.asOf && s.asOf > m ? s.asOf : m), '');
    const up = src.filter(s => s.mode === 'UPLOADED').length;
    U.$('#status').innerHTML = `<span class="dot"></span>No live feed · EOD data as of <b>${F.date(asOf)}</b> · ${src.length} source${src.length === 1 ? '' : 's'}${up ? ` (${up} uploaded)` : ''}`;
  }

  function route() {
    const id = (location.hash.match(/^#\/(\w+)/) || [])[1];
    const next = ROUTES.includes(id) ? id : 'overview';
    if (next !== current) { current = next; U.destroyCharts(); root.scrollTo(0, 0); }
    draw();
  }

  function draw() {
    const m = NRP.modules[current], el = U.$('#view');
    nav(); status();
    U.$('#view-title').innerHTML = `<span class="code">${U.esc(m.code)}</span>${U.esc(m.title)}`;
    document.title = `${m.title} · NIFTY Research Terminal`;
    try { m.render(el); }
    catch (err) {
      console.error(err);
      el.innerHTML = U.empty('This module hit an error', `<span class="mono small">${U.esc(err && err.message)}</span><br>Try another dataset or reload. The error is also in the browser console.`);
    }
  }

  // Re-render once per frame when data changes.
  function onData() { if (queued) return; queued = true; requestAnimationFrame(() => { queued = false; draw(); }); }

  function reload() {
    NRP.store.reset();
    NRP.importer.loadBundled();
    NRP.store.restore();
    NRP.store.emit();
  }

  function init() {
    theme();
    U.$('#btn-theme').addEventListener('click', () => {
      const v = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
      try { root.localStorage.setItem(THEME_KEY, v); } catch (e) { /* ignore */ }
      theme(v); draw();
    });
    U.$('#btn-report').addEventListener('click', () => NRP.report.download());
    U.$('#btn-import').addEventListener('click', () => {
      if (current !== 'data') location.hash = '#/data';
      setTimeout(() => { const f = U.$('#dt-file'); if (f) f.click(); }, 50);
    });
    U.$('#btn-print').addEventListener('click', () => root.print());
    root.addEventListener('hashchange', route);
    NRP.store.onChange(onData);
    NRP.importer.loadBundled();
    NRP.store.restore();
    if (!root.Chart) U.$('#banner').innerHTML = '<div class="callout">Chart.js could not be loaded from the CDN (offline?). Tables and calculations still work; charts are hidden.</div>';
    route();
  }

  NRP.app = { reload, ROUTES };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})(typeof self !== 'undefined' ? self : this);
