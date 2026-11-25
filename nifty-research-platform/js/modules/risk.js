/* G. Risk Management: position sizing, maximum loss, risk-reward, exposure, realised vs implied
 * volatility, VaR / Expected Shortfall and maximum drawdown of NIFTY over the loaded history. */
(function (root) {
  'use strict';
  const NRP = root.NRP, U = NRP.ui, F = U.fmt, S = NRP.stats, R = NRP.risk, H = NRP.shared;
  const ps = { capital: 1000000, riskPct: 1, entry: null, stop: null, target: null, marginPerLot: '' };
  let legs = null;

  function render(el) {
    const set = H.settings, rows = H.series(), L = rows[rows.length - 1];
    if (ps.entry === null) { const s = L ? Math.round(L.spot) : 25000; ps.entry = s; ps.stop = s - 150; ps.target = s + 300; }
    if (legs === null) legs = [{ name: 'NIFTY fut', qtyLots: 1, price: L ? Math.round(L.spot) : 25000, delta: 1 }];

    const sz = R.positionSize({ capital: +ps.capital, riskPct: +ps.riskPct, entry: +ps.entry, stop: +ps.stop, lotSize: +set.lot, marginPerLot: ps.marginPerLot === '' ? NaN : +ps.marginPerLot });
    const rr = R.riskReward({ entry: +ps.entry, stop: +ps.stop, target: +ps.target });
    const sizing = sz.errors.length ? `<div class="callout dn">${sz.errors.map(U.esc).join('<br>')}</div>` : `
      <div class="kv">
        <div><span>Risk budget</span><b>${F.inr(sz.budget)}</b></div>
        <div><span>Loss per lot at stop</span><b>${F.inr(sz.perLot)} (${F.n(sz.perUnit, 2)} pts × ${set.lot})</b></div>
        <div><span>Lots (rounded down)</span><b>${sz.lots} ${sz.side}</b></div>
        <div><span>Max loss at stop</span><b class="dn">${F.inr(-sz.maxLoss)}</b></div>
        <div><span>Notional</span><b>${F.inr(sz.notional)} · ${F.n(sz.leverage, 2)}× capital</b></div>
        <div><span>Margin (your input)</span><b>${Number.isFinite(sz.margin) ? F.inr(sz.margin) : '—'}</b></div>
        <div><span>Reward : risk</span><b>${F.n(rr.ratio, 2)} : 1${rr.consistent ? '' : ' (target on wrong side)'}</b></div>
        <div><span>Break-even win rate</span><b>${F.pct(rr.breakevenWinRate, 1)}</b></div>
      </div>${sz.warning ? `<div class="callout">${U.esc(sz.warning)}</div>` : ''}
      <p class="note">Stop-based loss ignores gaps: an overnight gap through the stop can exceed it. Compare with the 99% VaR below.</p>`;

    // Volatility and tail risk from NIFTY closes.
    const spots = rows.map(r => r.spot), rets = R.returnsFrom(spots);
    const rv = R.realisedVol(spots, 20);
    const v95 = R.historicalVaR(rets, 0.95), v99 = R.historicalVaR(rets, 0.99);
    const p95 = R.parametricVaR(rets, 0.95), p99 = R.parametricVaR(rets, 0.99);
    const mdd = S.maxDrawdown(spots);
    const notional = sz.errors.length ? 0 : sz.notional;
    const lastRv = rv[rv.length - 1];
    let inside = 0, tot = 0, big = 0;
    for (let i = 0; i < rows.length - 1; i++) {
      const s = H.vixSigma(rows[i].spot, rows[i].vix);
      if (!Number.isFinite(s)) continue;
      const m = Math.abs(rows[i + 1].spot - rows[i].spot); tot++; if (m <= s) inside++; if (m > 2 * s) big++;
    }

    // Exposure table (user-entered positions).
    const ex = R.exposure(legs.map(l => ({ name: l.name, qty: l.qtyLots * set.lot, price: +l.price, delta: +l.delta, underlying: L ? L.spot : +l.price })), +ps.capital);
    const exHtml = `<div class="tbl-scroll tbl-edit-wrap"><table class="tbl tbl-edit"><thead><tr><th class="l">Position</th><th>Lots (− short)</th><th>Price</th><th>Delta / unit</th><th>Notional</th><th>Delta notional</th><th></th></tr></thead><tbody>
      ${ex.rows.map((r, i) => `<tr><td class="l"><input class="inp inp-sm" data-x="${i}.name" value="${U.esc(r.name)}"></td>
        <td><input class="inp inp-sm" type="number" step="1" data-x="${i}.qtyLots" value="${legs[i].qtyLots}"></td>
        <td><input class="inp inp-sm" type="number" step="0.05" data-x="${i}.price" value="${legs[i].price}"></td>
        <td><input class="inp inp-sm" type="number" step="0.01" min="-1" max="1" data-x="${i}.delta" value="${legs[i].delta}"></td>
        <td>${F.inr(r.notional)}</td><td class="${F.cls(r.deltaNotional)}">${F.inr(r.deltaNotional)}</td>
        <td><button class="btn btn-xs" data-del="${i}" aria-label="Remove">✕</button></td></tr>`).join('')}
      </tbody><tfoot><tr><td class="l"><button class="btn btn-xs" id="rk-add">+ Add position</button></td><td></td><td></td><td></td>
        <td><b>Gross ${F.inr(ex.gross)}</b></td><td><b>${F.inr(ex.deltaNotional)}</b></td><td></td></tr></tfoot></table></div>
      <div class="kv kv-3">
        <div><span>Gross leverage</span><b>${F.n(ex.grossLeverage, 2)}×</b></div>
        <div><span>Delta leverage</span><b>${F.n(ex.deltaLeverage, 2)}×</b></div>
        <div><span>1-day 99% VaR on delta</span><b class="dn">${F.inr(-Math.abs(ex.deltaNotional) * v99.var)}</b></div>
      </div>
      <p class="note">Option rows: enter premium as price and the delta from the Greeks module. Notional for options is premium × units; delta notional is units × delta × spot. Linear (delta-only) risk understates option losses for large moves; use the Payoff module for the full profile.</p>`;

    el.innerHTML = `
      <div class="grid g-2">
        ${U.panel({ title: 'Position sizing and risk-reward', code: 'G.1', prov: U.badge('MODEL') + ` <span class="muted">lot size ${set.lot} (Data page → Assumptions)</span>`, body: `
          <div class="form">
            <label>Capital ₹ <input class="inp" type="number" min="0" step="10000" data-s="capital" value="${ps.capital}"></label>
            <label>Risk per trade % <input class="inp" type="number" min="0.1" max="100" step="0.1" data-s="riskPct" value="${ps.riskPct}"></label>
            <label>Entry <input class="inp" type="number" step="0.05" data-s="entry" value="${ps.entry}"></label>
            <label>Stop <input class="inp" type="number" step="0.05" data-s="stop" value="${ps.stop}"></label>
            <label>Target <input class="inp" type="number" step="0.05" data-s="target" value="${ps.target}"></label>
            <label>Margin per lot ₹ (from broker) <input class="inp" type="number" min="0" step="1000" data-s="marginPerLot" value="${ps.marginPerLot}" placeholder="optional"></label>
          </div>${sizing}` })}
        ${U.panel({ title: 'NIFTY tail risk (historical sample)', code: 'G.2', prov: U.provenance(['summary']) + ' ' + U.badge('MODEL'), body: `
          <div class="kpis kpis-2">
            ${U.kpi('1-day VaR 95% (hist.)', F.pct(v95.var), `ES ${F.pct(v95.es)} · parametric ${F.pct(p95)}`)}
            ${U.kpi('1-day VaR 99% (hist.)', F.pct(v99.var), `ES ${F.pct(v99.es)} · parametric ${F.pct(p99)}`)}
            ${U.kpi('On sized position', F.inr(-notional * v95.var), `95% · 99%: ${F.inr(-notional * v99.var)}`, 'dn')}
            ${U.kpi('Max drawdown (NIFTY)', F.pct(mdd.mdd), rows.length ? `${F.date(rows[mdd.peakIdx].date)} → ${F.date(rows[mdd.troughIdx].date)}` : '')}
            ${U.kpi('Realised vol 20D', F.pct(lastRv, 1), `India VIX ${F.n(L && L.vix, 2)} · spread ${F.n((L && L.vix) - lastRv * 100, 2)} pts`)}
            ${U.kpi('Next close within VIX 1σ', F.pct(inside / tot, 0), `${inside}/${tot} · beyond 2σ: ${big} (normal ≈ ${F.n(tot * 0.0455, 1)})`)}
          </div>
          <p class="note">n = ${v95.n} daily returns. Historical VaR is the empirical 5th / 1st percentile loss; ES is the mean loss beyond it. With fewer than ~250 observations the 99% estimate rests on one or two days.</p>` })}
      </div>
      ${U.panel({ title: 'Realised volatility vs India VIX', code: 'G.3', prov: U.badge('MODEL') + ' <span class="muted">20-session close-to-close log returns × √252</span>', body: '<div class="chart h-260"><canvas id="rk-vol"></canvas></div>' })}
      ${U.panel({ title: 'Portfolio exposure', code: 'G.4', prov: U.badge('MODEL'), body: exHtml })}`;

    el.querySelectorAll('[data-s]').forEach(inp => inp.addEventListener('change', () => { ps[inp.dataset.s] = inp.value === '' ? '' : +inp.value; render(el); }));
    el.querySelectorAll('[data-x]').forEach(inp => inp.addEventListener('change', () => {
      const [i, k] = inp.dataset.x.split('.'); legs[+i][k] = k === 'name' ? inp.value : +inp.value; render(el);
    }));
    el.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', () => { legs.splice(+b.dataset.del, 1); render(el); }));
    U.$('#rk-add', el).addEventListener('click', () => { legs.push({ name: 'Position ' + (legs.length + 1), qtyLots: 1, price: L ? Math.round(L.spot) : 0, delta: 1 }); render(el); });

    const p = U.palette();
    U.chart('rk-vol', { type: 'line', data: { labels: rows.map(r => F.dshort(r.date)), datasets: [
      { label: 'India VIX (implied, %)', data: rows.map(r => r.vix), borderColor: p.c4, pointRadius: 0, borderWidth: 1.4 },
      { label: 'Realised 20D (%)', data: rv.map(v => (Number.isFinite(v) ? v * 100 : null)), borderColor: p.acc, pointRadius: 0, borderWidth: 1.4 }
    ] }, options: { scales: { x: { ticks: { maxTicksLimit: 10 } }, y: {} } } });
  }

  NRP.modules.risk = { title: 'Risk Management', code: 'G', render };
})(typeof self !== 'undefined' ? self : this);
