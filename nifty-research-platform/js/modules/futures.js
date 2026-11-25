/* C. Futures and OI: basis, OI change, long/short build-up, short covering, long unwinding,
 * spot vs futures and the term structure. Needs index futures rows from an NSE F&O bhavcopy. */
(function (root) {
  'use strict';
  const NRP = root.NRP, U = NRP.ui, F = U.fmt, O = NRP.options, H = NRP.shared;
  const st = { symbol: 'NIFTY' };

  /** One row per date for the near-month contract, with price/OI change against the prior session. */
  function nearSeries(symbol) {
    const fut = NRP.store.data.futures.filter(r => r.symbol === symbol);
    const dates = [...new Set(fut.map(r => r.date))].sort();
    const out = [];
    dates.forEach((d, i) => {
      const c = fut.filter(r => r.date === d && r.expiry >= d).sort((a, b) => (a.expiry < b.expiry ? -1 : 1))[0];
      if (!c) return;
      const prevRow = i ? fut.find(r => r.date === dates[i - 1] && r.expiry === c.expiry) : null;
      const prevPx = Number.isFinite(c.prevClose) && c.prevClose > 0 ? c.prevClose : prevRow ? prevRow.close : NaN;
      const spot = c.underlying > 0 ? c.underlying : NRP.store.spotOn(d, symbol).value;
      const T = O.yearFraction(d, c.expiry);
      const b = O.basis(c.close, spot, T);
      const dPx = c.close - prevPx;
      const dOi = Number.isFinite(c.chgOi) ? c.chgOi : prevRow ? c.oi - prevRow.oi : NaN;
      const rolled = prevRow === undefined || prevRow === null;
      out.push({ date: d, expiry: c.expiry, close: c.close, spot, oi: c.oi, dOi, dPx, pxPct: dPx / prevPx,
        basis: b ? b.pts : NaN, basisPct: b ? b.pct : NaN, annual: b ? b.annualised : NaN, dte: Math.round(T * 365),
        // Contract OI changes around rollover are dominated by migration to the next month, so classify on total OI.
        buildup: O.classifyBuildup(dPx, dOi), rolledNote: rolled && i ? 'new near month' : '' });
    });
    // Total OI across all expiries (rollover-neutral).
    out.forEach((r, i) => {
      r.totOi = fut.filter(x => x.date === r.date).reduce((s, x) => s + (x.oi || 0), 0);
      r.dTot = i ? r.totOi - out[i - 1].totOi : NaN;
      r.buildupTot = O.classifyBuildup(r.dPx, r.dTot);
    });
    return out;
  }

  function render(el) {
    const syms = [...new Set(NRP.store.data.futures.map(r => r.symbol))].sort();
    if (!syms.length) {
      el.innerHTML = U.panel({ title: 'Futures and OI', code: 'C', body: H.needData('No index futures data loaded', ['bhav'],
        'Futures basis and build-up need the index futures rows (FinInstrmTp = IDF) from an NSE F&O bhavcopy. The bundled files contain options OI only, so nothing is shown rather than estimating futures prices. Import one bhavcopy per session; two or more sessions are needed for build-up.') });
      return;
    }
    if (!syms.includes(st.symbol)) st.symbol = syms[0];
    const s = nearSeries(st.symbol), L = s[s.length - 1];
    const latestTerm = NRP.store.data.futures.filter(r => r.symbol === st.symbol && r.date === L.date && r.expiry >= L.date).sort((a, b) => (a.expiry < b.expiry ? -1 : 1))
      .map(r => { const T = O.yearFraction(L.date, r.expiry), b = O.basis(r.close, L.spot, T); return { ...r, T, dte: Math.round(T * 365), basis: b && b.pts, pct: b && b.pct, annual: b && b.annualised, carry: b && b.impliedCarry }; });

    el.innerHTML = `
      <div class="ctl">
        <label>Symbol <select class="inp" data-bind="symbol">${syms.map(x => U.opt(x, x, st.symbol)).join('')}</select></label>
        <span class="muted small">${s.length} sessions · near-month contract per session</span>
      </div>
      <div class="kpis">
        ${U.kpi('Near-month future', F.n(L.close, 2), `<span class="${F.cls(L.dPx)}">${F.sgn(L.dPx, 2)}</span> · exp ${F.date(L.expiry)}`)}
        ${U.kpi('Spot', F.n(L.spot, 2), F.date(L.date))}
        ${U.kpi('Basis', F.sgn(L.basis, 2) + ' pts', `${F.spct(L.basisPct, 3)} · annualised ${F.spct(L.annual)}`, F.cls(L.basis))}
        ${U.kpi('Open interest (near)', F.lakh(L.oi, 2), `Δ ${F.slakh(L.dOi, 2)}`)}
        ${U.kpi('Build-up (near contract)', L.buildup, 'Price Δ vs OI Δ')}
        ${U.kpi('Build-up (all expiries OI)', L.buildupTot, 'Rollover-neutral')}
      </div>
      <div class="grid g-2">
        ${U.panel({ title: 'Spot vs near-month futures', code: 'C.1', prov: U.provenance(['bhav_udiff', 'bhav_legacy']), body: '<div class="chart h-280"><canvas id="fu-px"></canvas></div>' })}
        ${U.panel({ title: 'Basis and open interest', code: 'C.2', prov: U.badge('MODEL') + ' <span class="muted">basis = F − S; annualised = (F/S − 1) × 365 / DTE</span>', body: '<div class="chart h-280"><canvas id="fu-b"></canvas></div>' })}
      </div>
      <div class="grid g-2-1">
        ${U.panel({ title: 'Daily build-up classification', code: 'C.3', body: U.table({ id: 'fu-tbl', exportName: `${st.symbol}_futures_buildup.csv`, maxHeight: 420, columns: [
          { key: 'date', label: 'Date', align: 'l', fmt: F.date }, { key: 'expiry', label: 'Contract', fmt: F.dshort }, { key: 'close', label: 'Fut close', fmt: v => F.n(v, 2) },
          { key: 'dPx', label: 'Δ price', fmt: v => F.sgn(v, 2), cls: v => F.cls(v) }, { key: 'oi', label: 'OI', fmt: v => F.lakh(v, 2) },
          { key: 'dOi', label: 'Δ OI', fmt: v => F.slakh(v, 2), cls: v => F.cls(v) }, { key: 'basis', label: 'Basis', fmt: v => F.sgn(v, 1) },
          { key: 'annual', label: 'Ann. basis', fmt: v => F.spct(v) },
          { key: 'buildup', label: 'Near contract', align: 'l', fmt: v => `<span class="bu bu-${v.toLowerCase().replace(/\s+/g, '-')}">${U.esc(v)}</span>` },
          { key: 'buildupTot', label: 'All expiries', align: 'l', fmt: v => `<span class="bu bu-${v.toLowerCase().replace(/\s+/g, '-')}">${U.esc(v)}</span>` }
        ], rows: s.slice().reverse() }) })}
        ${U.panel({ title: 'Term structure · ' + F.date(L.date), code: 'C.4', body: U.table({ id: 'fu-term', exportName: `${st.symbol}_term_${L.date}.csv`, columns: [
          { key: 'expiry', label: 'Expiry', align: 'l', fmt: F.date }, { key: 'dte', label: 'DTE' }, { key: 'close', label: 'Close', fmt: v => F.n(v, 2) },
          { key: 'basis', label: 'Basis', fmt: v => F.sgn(v, 1) }, { key: 'annual', label: 'Ann.', fmt: v => F.spct(v) }, { key: 'carry', label: 'Implied carry (ln)', fmt: v => F.pct(v) },
          { key: 'oi', label: 'OI', fmt: v => F.lakh(v, 2) }
        ], rows: latestTerm }) + `<p class="note">Implied carry ≈ r − q. Compare with the risk-free assumption (${H.settings.r}%) to judge whether futures trade rich or cheap. The quadrant rules: price↑ OI↑ long build-up; price↓ OI↑ short build-up; price↑ OI↓ short covering; price↓ OI↓ long unwinding.</p>` })}
      </div>`;
    H.bind(el, (k, v) => { st[k] = v; render(el); });

    const p = U.palette(), labels = s.map(r => F.dshort(r.date));
    U.chart('fu-px', { type: 'line', data: { labels, datasets: [
      { label: 'Spot', data: s.map(r => r.spot), borderColor: p.ink, pointRadius: 0, borderWidth: 1.4 },
      { label: 'Near future', data: s.map(r => r.close), borderColor: p.acc, pointRadius: 0, borderWidth: 1.4 }
    ] }, options: { scales: { x: { ticks: { maxTicksLimit: 10 } }, y: {} } } });
    U.chart('fu-b', { type: 'bar', data: { labels, datasets: [
      { label: 'Near OI', data: s.map(r => r.oi), backgroundColor: p.band, yAxisID: 'y1' },
      { type: 'line', label: 'Basis (pts)', data: s.map(r => r.basis), borderColor: p.acc, pointRadius: 0, borderWidth: 1.4, yAxisID: 'y' }
    ] }, options: { scales: { x: { ticks: { maxTicksLimit: 10 } }, y: { position: 'left' }, y1: { position: 'right', grid: { drawOnChartArea: false }, ticks: { callback: v => F.lakh(v, 0) } } } } });
  }

  NRP.modules.futures = { title: 'Futures & OI', code: 'C', render, nearSeries };
})(typeof self !== 'undefined' ? self : this);
