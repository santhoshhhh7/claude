/* B. Greeks and Implied Volatility: Black-Scholes-Merton calculator, IV solver, strike-wise Greeks,
 * IV smile and skew. IV needs option prices (bhavcopy import); without prices the chain view falls back
 * to a flat volatility equal to India VIX and says so. */
(function (root) {
  'use strict';
  const NRP = root.NRP, U = NRP.ui, F = U.fmt, O = NRP.options, H = NRP.shared;
  const calc = { S: null, K: null, dte: 7, sigma: 12, type: 'call', mkt: '' };
  const st = { symbol: 'NIFTY', win: 15 };

  function vixOn(date) {
    const s = NRP.store.summaryOn(date);
    if (s && Number.isFinite(s.vix)) return { v: s.vix, src: 'India VIX from daily summary' };
    const h = (NRP.store.data.indices['INDIA VIX'] || []).find(r => r.date === date);
    return h ? { v: h.close, src: 'India VIX history' } : { v: null, src: null };
  }

  function render(el) {
    const set = H.settings, r = set.r / 100, q = set.q / 100;
    el._gk = null;
    const L = NRP.store.latestSummary();
    if (calc.S === null) { calc.S = L ? Math.round(L.spot) : 25000; calc.K = Math.round(calc.S / set.step) * set.step; if (L && L.vix) calc.sigma = +L.vix.toFixed(2); }

    // ---- calculator ----
    const T = calc.dte / 365;
    const g = O.bsm({ S: +calc.S, K: +calc.K, T, r, q, sigma: calc.sigma / 100, type: calc.type });
    const ivr = calc.mkt !== '' ? O.impliedVol({ price: +calc.mkt, S: +calc.S, K: +calc.K, T, r, q, type: calc.type }) : null;
    const out = g ? [
      ['Theoretical price', F.n(g.price, 2)], ['Delta', F.n(g.delta, 4)], ['Gamma', F.n(g.gamma, 6)],
      ['Theta / day', F.n(g.theta, 2)], ['Vega / 1 vol pt', F.n(g.vega, 2)], ['Rho / 1% rate', F.n(g.rho, 2)],
      ['d1 / d2', `${F.n(g.d1, 4)} / ${F.n(g.d2, 4)}`], ['Per lot (×' + set.lot + ')', `Δ ${F.n(g.delta * set.lot, 1)} · Θ ₹${F.n(g.theta * set.lot, 0)} · V ₹${F.n(g.vega * set.lot, 0)}`]
    ] : [['Error', 'Check inputs: S, K, σ and days must be positive.']];
    const calcHtml = `
      <div class="form">
        <label>Spot S <input class="inp" type="number" step="0.05" data-c="S" value="${calc.S}"></label>
        <label>Strike K <input class="inp" type="number" step="${set.step}" data-c="K" value="${calc.K}"></label>
        <label>Days to expiry <input class="inp" type="number" min="0" step="1" data-c="dte" value="${calc.dte}"></label>
        <label>Volatility σ % <input class="inp" type="number" min="0.1" step="0.1" data-c="sigma" value="${calc.sigma}"></label>
        <label>Type <select class="inp" data-c="type">${U.opt('call', 'Call (CE)', calc.type)}${U.opt('put', 'Put (PE)', calc.type)}</select></label>
        <label>Market price (for IV) <input class="inp" type="number" min="0" step="0.05" data-c="mkt" value="${calc.mkt}" placeholder="optional"></label>
      </div>
      <div class="kv">${out.map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join('')}
        ${ivr ? `<div><span>Implied volatility</span><b>${ivr.iv ? F.pct(ivr.iv, 2) : 'n/a: ' + U.esc(ivr.reason)}</b></div>` : ''}</div>
      <p class="note">r = ${set.r}% · q = ${set.q}% (Data page → Assumptions). ${U.esc(set.rateNote)}</p>`;

    // ---- chain greeks ----
    const syms = [...new Set(NRP.store.data.options.map(x => x.symbol))].sort();
    let chainHtml, smile = null;
    if (!syms.length) chainHtml = H.needData('No option chain loaded', ['bhav']);
    else {
      if (!syms.includes(st.symbol)) st.symbol = syms[0];
      const cx = H.chainContext(st.symbol, { date: st.date, expiry: st.expiry });
      st.date = cx.date; st.expiry = cx.expiry;
      const S0 = cx.spot.value, Tc = O.yearFraction(cx.date, cx.expiry);
      const rows = H.windowRows(cx.rows, S0, st.win);
      const hasPx = rows.some(x => x.callLtp > 0 || x.putLtp > 0);
      const vx = vixOn(cx.date), flat = vx.v ? vx.v / 100 : null;
      const tr = rows.map(x => {
        const civ = hasPx ? O.impliedVol({ price: x.callLtp, S: S0, K: x.strike, T: Tc, r, q, type: 'call' }) : { iv: null };
        const piv = hasPx ? O.impliedVol({ price: x.putLtp, S: S0, K: x.strike, T: Tc, r, q, type: 'put' }) : { iv: null };
        const cs = civ.iv || flat, ps = piv.iv || flat;
        const cg = cs ? O.bsm({ S: S0, K: x.strike, T: Tc, r, q, sigma: cs, type: 'call' }) : null;
        const pg = ps ? O.bsm({ S: S0, K: x.strike, T: Tc, r, q, sigma: ps, type: 'put' }) : null;
        const otm = x.strike >= S0 ? civ.iv : piv.iv;
        return { strike: x.strike, callIV: civ.iv, putIV: piv.iv, otmIV: otm, cD: cg && cg.delta, pD: pg && pg.delta, gamma: cg && cg.gamma, cT: cg && cg.theta, pT: pg && pg.theta,
          vega: cg && cg.vega, gex: cg && pg ? (x.callOI * cg.gamma - x.putOI * pg.gamma) * S0 * S0 / 100 : NaN, callOI: x.callOI, putOI: x.putOI, note: civ.reason || piv.reason || '' };
      });
      const expired = !(Tc > 0);
      smile = hasPx && !expired ? tr : null;
      const skew = hasPx ? skewAt(tr, S0) : null;
      const mode = hasPx ? `${U.badge('MODEL')} <span class="muted">IV solved from closing prices (${U.esc(cx.spot.source || '')} spot)</span>` : `${U.badge('MODEL')} <span class="muted">No option prices in the loaded file: Greeks use a flat σ = ${vx.v ? F.n(vx.v, 2) + '% (' + U.esc(vx.src) + ')' : 'n/a'}; no IV smile is available.</span>`;
      chainHtml = `
        <div class="ctl">
          ${syms.length > 1 ? `<label>Symbol <select class="inp" data-bind="symbol">${syms.map(s => U.opt(s, s, st.symbol)).join('')}</select></label>` : ''}
          <label>Date <select class="inp" data-bind="date">${cx.dates.slice().reverse().map(d => U.opt(d, F.date(d), cx.date)).join('')}</select></label>
          <label>Expiry <select class="inp" data-bind="expiry">${cx.expiries.map(e => U.opt(e, F.date(e), cx.expiry)).join('')}</select></label>
          <label>Strikes <select class="inp" data-bind="win">${[[10, '±10'], [15, '±15'], [25, '±25'], [0, 'All']].map(([v, l]) => U.opt(v, l, st.win)).join('')}</select></label>
          <span class="muted small">S ${F.n(S0, 2)} · T ${F.n(Tc * 365)} days</span>
        </div>
        <div class="ph-p">${mode}</div>
        ${expired ? '<div class="callout">Selected expiry is the trade date: time value is zero, so Greeks and IV are undefined. Choose a later expiry.</div>' : ''}
        ${skew ? `<div class="kpis kpis-3">${U.kpi('ATM IV', F.pct(skew.atm, 2))}${U.kpi('IV at 98% / 102% of spot', `${F.pct(skew.lo, 1)} / ${F.pct(skew.hi, 1)}`)}${U.kpi('Skew (98% − 102%)', F.n((skew.lo - skew.hi) * 100, 2) + ' vol pts', 'Positive = downside puts priced richer')}</div>` : ''}
        ${hasPx && !expired ? '<div class="chart h-260"><canvas id="gk-smile"></canvas></div>' : ''}
        <div class="chart h-220"><canvas id="gk-d"></canvas></div>
        ${U.table({ id: 'gk-tbl', exportName: `${cx.symbol}_greeks_${cx.date}_${cx.expiry}.csv`, maxHeight: 420, rowClass: x => (x.strike === H.atmStrike(rows, S0) ? 'hl' : ''), columns: [
          { key: 'strike', label: 'Strike', align: 'l', fmt: v => '<b>' + F.n(v) + '</b>' },
          { key: 'callIV', label: 'Call IV', fmt: v => F.pct(v, 1) }, { key: 'putIV', label: 'Put IV', fmt: v => F.pct(v, 1) },
          { key: 'cD', label: 'Call Δ', fmt: v => F.n(v, 3) }, { key: 'pD', label: 'Put Δ', fmt: v => F.n(v, 3) }, { key: 'gamma', label: 'Γ (call σ)', fmt: v => F.n(v, 5) },
          { key: 'cT', label: 'Call Θ/day', fmt: v => F.n(v, 2) }, { key: 'pT', label: 'Put Θ/day', fmt: v => F.n(v, 2) }, { key: 'vega', label: 'Vega/pt', fmt: v => F.n(v, 2) },
          { key: 'gex', label: 'Net Γ×OI (₹ per 1%)', fmt: v => F.lakh(v), cls: v => F.cls(v), raw: x => x.gex },
          { key: 'note', label: 'IV note', align: 'l', fmt: v => `<span class="muted small">${U.esc(v)}</span>` }
        ], rows: tr })}
        <p class="note">Net Γ×OI = (call OI·Γ<sub>call</sub> − put OI·Γ<sub>put</sub>)·S²/100: the change in aggregate option delta (₹) for a 1% move, signed as if customers are long calls and short puts. This sign convention is an assumption; OI does not reveal who is long.</p>`;
      el._gk = { tr, S0 };
    }

    el.innerHTML = `
      <div class="grid g-1-2">
        ${U.panel({ title: 'Black-Scholes-Merton calculator', code: 'B.1', prov: U.badge('MODEL'), body: calcHtml })}
        ${U.panel({ title: 'Strike-wise Greeks and IV smile', code: 'B.2', prov: U.provenance(['strikeoi', 'bhav_udiff', 'bhav_legacy']), body: chainHtml })}
      </div>
      ${U.panel({ title: 'Assumptions', code: 'B.3', body: `<ul class="plain">
        <li>European exercise, lognormal underlying, constant σ and r over the option's life (NIFTY options are European and cash-settled).</li>
        <li>T = calendar days from the EOD trade date to expiry ÷ 365. Both are treated as 15:30 IST, so T = 0 on expiry day.</li>
        <li>Underlying = NIFTY spot close; the dividend yield q (default 0) stands in for index dividends. Using the futures price as forward with q = r is equivalent when carry is fair.</li>
        <li>IV by bisection on [0.01%, 500%]. Prices at or below discounted intrinsic, or above the no-arbitrage bound, return no IV (shown in the IV note column).</li>
        <li>Closing prices of illiquid strikes may be stale; treat far-OTM IVs with caution.</li></ul>` })}`;

    el.querySelectorAll('[data-c]').forEach(inp => inp.addEventListener('change', () => {
      const k = inp.dataset.c; calc[k] = k === 'type' ? inp.value : k === 'mkt' ? inp.value : Math.max(0, +inp.value); render(el);
    }));
    H.bind(el, (k, v) => { if (k === 'win') st.win = +v; else st[k] = v; if (k === 'symbol') st.date = st.expiry = null; if (k === 'date') st.expiry = null; render(el); });

    const p = U.palette();
    if (el._gk) {
      const { tr } = el._gk, labels = tr.map(x => F.n(x.strike));
      if (smile) U.chart('gk-smile', { type: 'line', data: { labels, datasets: [
        { label: 'Call IV', data: tr.map(x => x.callIV && x.callIV * 100), borderColor: p.call, pointRadius: 2, borderWidth: 1, spanGaps: true },
        { label: 'Put IV', data: tr.map(x => x.putIV && x.putIV * 100), borderColor: p.put, pointRadius: 2, borderWidth: 1, spanGaps: true },
        { label: 'OTM IV (smile)', data: tr.map(x => x.otmIV && x.otmIV * 100), borderColor: p.acc, pointRadius: 0, borderWidth: 2, spanGaps: true }
      ] }, options: { scales: { x: { ticks: { maxTicksLimit: 12 } }, y: { title: { display: true, text: 'IV %' } } } } });
      U.chart('gk-d', { type: 'line', data: { labels, datasets: [
        { label: 'Call Δ', data: tr.map(x => x.cD), borderColor: p.call, pointRadius: 0, borderWidth: 1.4 },
        { label: 'Put Δ', data: tr.map(x => x.pD), borderColor: p.put, pointRadius: 0, borderWidth: 1.4 },
        { label: 'Γ (right axis)', data: tr.map(x => x.gamma), borderColor: p.c3, pointRadius: 0, borderWidth: 1, borderDash: [4, 3], yAxisID: 'y1' }
      ] }, options: { scales: { x: { ticks: { maxTicksLimit: 12 } }, y: { min: -1, max: 1 }, y1: { position: 'right', grid: { drawOnChartArea: false } } } } });
    }
  }

  /** Linear interpolation of OTM IV at a moneyness level. */
  function skewAt(tr, S0) {
    const pts = tr.filter(x => x.otmIV).map(x => [x.strike, x.otmIV]);
    const at = K => {
      for (let i = 0; i + 1 < pts.length; i++) if (pts[i][0] <= K && pts[i + 1][0] >= K) {
        const w = (K - pts[i][0]) / (pts[i + 1][0] - pts[i][0]); return pts[i][1] + w * (pts[i + 1][1] - pts[i][1]);
      }
      return NaN;
    };
    const res = { atm: at(S0), lo: at(S0 * 0.98), hi: at(S0 * 1.02) };
    return Number.isFinite(res.atm) ? res : null;
  }

  NRP.modules.greeks = { title: 'Greeks & IV', code: 'B', render };
})(typeof self !== 'undefined' ? self : this);
