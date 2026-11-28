/* F. Backtesting: rule-based daily signals from PCR, max pain, India VIX and net OI change, with an
 * execution lag, per-side transaction costs and no look-ahead. Also the original dashboard's
 * correlation diagnostics and bucket statistics, clearly labelled as in-sample. */
(function (root) {
  'use strict';
  const NRP = root.NRP, U = NRP.ui, F = U.fmt, S = NRP.stats, B = NRP.backtest, H = NRP.shared;
  const cfg = {
    signal: 'pcr', lag: 1, cost: null, skipExpiry: false,
    pcr: { field: 'pcrNear', hi: 1.2, lo: 0.8, dir: 'contrarian' },
    maxpain: { band: 0, dir: 'revert' },
    vix: { window: 20, dir: 'long_low' },
    netoi: { dir: 'follow_puts' }
  };
  let diagCache = null;

  function params() {
    const c = cfg;
    switch (c.signal) {
      // "Contrarian" reads a high PCR as put writers defending support (go long); the alternative reads it as hedging demand (go short). Both are hypotheses.
      case 'pcr': return { field: c.pcr.field, hi: +c.pcr.hi, lo: +c.pcr.lo, posHigh: c.pcr.dir === 'contrarian' ? 1 : -1, posLow: c.pcr.dir === 'contrarian' ? -1 : 1 };
      case 'maxpain': return { band: +c.maxpain.band, posAbove: c.maxpain.dir === 'revert' ? -1 : 1, posBelow: c.maxpain.dir === 'revert' ? 1 : -1 };
      case 'vix': return { window: +c.vix.window, posHigh: c.vix.dir === 'long_low' ? 0 : 1, posLow: c.vix.dir === 'long_low' ? 1 : 0 };
      case 'netoi': return { posPut: c.netoi.dir === 'follow_puts' ? 1 : -1, posCall: c.netoi.dir === 'follow_puts' ? -1 : 1 };
    }
  }

  function describe() {
    const p = params(), c = cfg;
    const side = v => (v > 0 ? 'long' : v < 0 ? 'short' : 'flat');
    switch (c.signal) {
      case 'pcr': return `${c.pcr.field === 'pcrNear' ? 'Nearest-expiry' : 'All-expiry'} PCR > ${p.hi} → ${side(p.posHigh)}; < ${p.lo} → ${side(p.posLow)}; otherwise flat.`;
      case 'maxpain': return `Spot more than ${p.band} pts above max pain → ${side(p.posAbove)}; more than ${p.band} pts below → ${side(p.posBelow)}.`;
      case 'vix': return `India VIX above its trailing ${p.window}-session median → ${side(p.posHigh)}; at or below → ${side(p.posLow)}.`;
      case 'netoi': return `Nearest-expiry net OI change (put − call) > 0 → ${side(p.posPut)}; < 0 → ${side(p.posCall)}.`;
    }
  }

  function form() {
    const c = cfg, o = U.opt;
    const sp = {
      pcr: `<label>PCR series <select class="inp" data-p="pcr.field">${o('pcrNear', 'Nearest expiry', c.pcr.field)}${o('pcrAll', 'All expiries', c.pcr.field)}</select></label>
            <label>Upper threshold <input class="inp" type="number" step="0.05" data-p="pcr.hi" value="${c.pcr.hi}"></label>
            <label>Lower threshold <input class="inp" type="number" step="0.05" data-p="pcr.lo" value="${c.pcr.lo}"></label>
            <label>Reading <select class="inp" data-p="pcr.dir">${o('contrarian', 'High PCR → long (contrarian)', c.pcr.dir)}${o('momentum', 'High PCR → short (hedging demand)', c.pcr.dir)}</select></label>`,
      maxpain: `<label>Neutral band (pts) <input class="inp" type="number" min="0" step="25" data-p="maxpain.band" value="${c.maxpain.band}"></label>
            <label>Reading <select class="inp" data-p="maxpain.dir">${o('revert', 'Revert toward max pain', c.maxpain.dir)}${o('trend', 'Trend away from max pain', c.maxpain.dir)}</select></label>`,
      vix: `<label>Median window <input class="inp" type="number" min="5" max="60" step="1" data-p="vix.window" value="${c.vix.window}"></label>
            <label>Reading <select class="inp" data-p="vix.dir">${o('long_low', 'Long when VIX is low, flat when high', c.vix.dir)}${o('long_high', 'Long when VIX is high, flat when low', c.vix.dir)}</select></label>`,
      netoi: `<label>Reading <select class="inp" data-p="netoi.dir">${o('follow_puts', 'Put addition → long', c.netoi.dir)}${o('fade_puts', 'Put addition → short', c.netoi.dir)}</select></label>`
    };
    return `<div class="form">
      <label>Signal <select class="inp" data-p="signal">${Object.entries(B.SIGNALS).map(([k, v]) => o(k, v.label, c.signal)).join('')}</select></label>
      ${sp[c.signal]}
      <label>Execution <select class="inp" data-p="lag">${o(1, 'Next close (lag 1, realistic)', c.lag)}${o(0, 'Same close (lag 0, optimistic)', c.lag)}</select></label>
      <label>Cost, bps per side <input class="inp" type="number" min="0" step="0.5" data-p="cost" value="${c.cost}"></label>
      <label class="chk"><input type="checkbox" data-p="skipExpiry" ${c.skipExpiry ? 'checked' : ''}> Flat on expiry day signals</label>
    </div><p class="note"><b>Rule:</b> ${U.esc(describe())}</p>`;
  }

  function render(el) {
    if (cfg.cost === null) cfg.cost = H.settings.costBps;
    const rows = NRP.store.data.summary;
    if (rows.length < 30) { el.innerHTML = H.needData('Not enough daily data to backtest', ['indices'], 'The backtester needs at least 30 sessions of the daily summary file.'); return; }
    const res = B.run(rows, B.SIGNALS[cfg.signal].make(params()), { lag: +cfg.lag, costBpsPerSide: +cfg.cost, skipExpiry: cfg.skipExpiry });
    NRP.modules.backtest.last = { res, rule: describe(), cfg: JSON.parse(JSON.stringify(cfg)) };
    if (res.error) { el.innerHTML = U.panel({ title: 'Backtest', code: 'F', body: form() + U.empty('No trades', U.esc(res.error)) }); wire(el); return; }
    const m = res.metrics;
    const dd = (() => { let pk = -Infinity; return res.equity.map(v => { pk = Math.max(pk, v); return v / pk - 1; }); })();
    const short = m.sessions < 250;

    if (!diagCache || diagCache.n !== rows.length || diagCache.last !== rows[rows.length - 1].date) diagCache = diagnostics(rows);

    el.innerHTML = `
      ${U.panel({ title: 'Strategy definition', code: 'F.1', prov: U.provenance(['summary']) + ' ' + U.badge('MODEL'), body: form() })}
      ${short ? `<div class="callout">Only ${m.sessions} sessions (${F.date(m.firstDate)} → ${F.date(m.lastDate)}). With this sample, a 1-standard-error band on the annualised return is roughly ±${F.pct(m.annVol / Math.sqrt(m.sessions / 252), 0)}; treat results as a sanity check, not evidence of an edge.</div>` : ''}
      <div class="kpis">
        ${U.kpi('Strategy return', F.spct(m.totalReturn), `Buy & hold ${F.spct(m.buyHoldReturn)}`, F.cls(m.totalReturn))}
        ${U.kpi('Max drawdown', F.pct(m.maxDrawdown), `Buy & hold ${F.pct(m.buyHoldMaxDrawdown)}`, 'dn')}
        ${U.kpi('Sharpe (ann., rf 0)', F.n(m.sharpe, 2), `Vol ${F.pct(m.annVol, 1)}`)}
        ${U.kpi('Trade win rate', F.pct(m.tradeWinRate, 0), `${m.trades} trades · day win rate ${F.pct(m.dayWinRate, 0)}`)}
        ${U.kpi('Profit factor', F.n(m.profitFactor, 2), `Avg win ${F.spct(m.avgWin)} · avg loss ${F.spct(m.avgLoss)}`)}
        ${U.kpi('Exposure', F.pct(m.exposure, 0), `${m.activeDays} of ${m.sessions} sessions in market`)}
        ${U.kpi('Total costs', F.pct(m.totalCost, 2), `${cfg.cost} bps per side`)}
      </div>
      <div class="grid g-2">
        ${U.panel({ title: 'Equity curve vs buy and hold (index points, no leverage)', code: 'F.2', body: '<div class="chart h-280"><canvas id="bt-eq"></canvas></div>' })}
        ${U.panel({ title: 'Drawdown and position', code: 'F.3', body: '<div class="chart h-280"><canvas id="bt-dd"></canvas></div>' })}
      </div>
      <div class="grid g-1-2">
        ${U.panel({ title: 'Trade log', code: 'F.4', body: U.table({ id: 'bt-trades', exportName: `backtest_trades_${cfg.signal}.csv`, maxHeight: 360, columns: [
          { key: 'entry', label: 'Signal close', align: 'l', fmt: F.date }, { key: 'exit', label: 'Exit close', align: 'l', fmt: F.date },
          { key: 'dir', label: 'Side', fmt: v => (v > 0 ? '<span class="up">LONG</span>' : '<span class="dn">SHORT</span>') , raw: t => (t.dir > 0 ? 'LONG' : 'SHORT') },
          { key: 'days', label: 'Sessions' }, { key: 'ret', label: 'Return (net)', fmt: v => F.spct(v), cls: v => F.cls(v) }
        ], rows: res.trades.slice().reverse(), caption: '"Signal close" is the close before the first holding interval.' }) })}
        ${U.panel({ title: 'Methodology and safeguards', code: 'F.5', body: `<ul class="plain">
          <li>Signal on day <i>i</i> uses only that day's published EOD data (and trailing windows for medians).</li>
          <li>Lag 1: the position is entered at the close of day <i>i</i>+1 and earns from <i>i</i>+1 to <i>i</i>+2. EOD OI is released after the close, so lag 0 assumes you could trade on data you would not yet have.</li>
          <li>Return per session = position × NIFTY close-to-close return − |Δposition| × cost. The final open position is closed and charged.</li>
          <li>The source file's Next_Spot / NextDay columns are dropped at import; next-day moves are recomputed from Spot so they can only appear as outcomes.</li>
          <li>Thresholds are user inputs, not optimised on this sample. Changing them repeatedly and keeping the best result is data snooping.</li>
          <li>Costs: ${cfg.cost} bps per side is an editable estimate for index futures (brokerage, STT, exchange and SEBI fees, stamp duty, GST, slippage); verify with your broker's current schedule.</li>
          <li>Ignores margin, lot rounding, overnight gaps beyond close-to-close and futures basis.</li></ul>` })}
      </div>
      ${U.panel({ title: 'Feature diagnostics vs next-session move (in-sample)', code: 'F.6', prov: U.badge('MODEL') + ' <span class="muted">Pearson r; p from 3,000 permutations (seed 42)</span>', body: diagCache.html })}`;
    wire(el);

    const p = U.palette(), labels = res.dates.map(F.dshort);
    U.chart('bt-eq', { type: 'line', data: { labels, datasets: [
      { label: 'Strategy', data: res.equity, borderColor: p.acc, pointRadius: 0, borderWidth: 1.6 },
      { label: 'Buy & hold NIFTY', data: res.buyHold, borderColor: p.mut, pointRadius: 0, borderWidth: 1.2 }
    ] }, options: { scales: { x: { ticks: { maxTicksLimit: 10 } }, y: { ticks: { callback: v => F.n((v - 1) * 100, 0) + '%' } } } } });
    U.chart('bt-dd', { type: 'line', data: { labels, datasets: [
      { label: 'Drawdown', data: dd.map(v => v * 100), borderColor: p.dn, backgroundColor: p.band, fill: true, pointRadius: 0, borderWidth: 1 },
      { label: 'Position', data: [0, ...res.positions], borderColor: p.c3, pointRadius: 0, borderWidth: 1, stepped: true, yAxisID: 'y1' }
    ] }, options: { scales: { x: { ticks: { maxTicksLimit: 10 } }, y: { title: { display: true, text: 'DD %' } }, y1: { position: 'right', min: -1.2, max: 1.2, grid: { drawOnChartArea: false }, ticks: { stepSize: 1 } } } } });
  }

  function wire(el) {
    el.querySelectorAll('[data-p]').forEach(inp => inp.addEventListener('change', () => {
      const path = inp.dataset.p.split('.'), v = inp.type === 'checkbox' ? inp.checked : inp.value;
      if (path.length === 2) cfg[path[0]][path[1]] = v; else cfg[path[0]] = v;
      if (path[0] === 'cost') cfg.cost = Math.max(0, +v);
      render(el);
    }));
  }

  function diagnostics(rows) {
    const rs = rows.map(r => ({ ...r, gapPct: Number.isFinite(r.maxPain) ? (r.spot - r.maxPain) / r.spot : NaN }));
    const feats = [['pcrNear', 'PCR nearest'], ['pcrAll', 'PCR all expiries'], ['netOiChg', 'Net OI change (put − call)'], ['gapPct', 'Spot vs max pain (%)'], ['vix', 'India VIX'], ['vixChg', 'VIX change']];
    const d = feats.filter(([k]) => rs.some(r => Number.isFinite(r[k]))).map(([k, label]) => ({ label, ...B.diagnostics(rs, k) }));
    // Bucket table for PCR nearest: terciles of the full sample (descriptive only).
    const ok = [];
    for (let i = 0; i < rs.length - 1; i++) if (Number.isFinite(rs[i].pcrNear)) ok.push({ x: rs[i].pcrNear, y: rs[i + 1].spot / rs[i].spot - 1 });
    const q1 = S.quantile(ok.map(o => o.x), 1 / 3), q2 = S.quantile(ok.map(o => o.x), 2 / 3);
    const bk = [['Low', o => o.x <= q1, `≤ ${F.n(q1, 2)}`], ['Mid', o => o.x > q1 && o.x <= q2, `${F.n(q1, 2)} – ${F.n(q2, 2)}`], ['High', o => o.x > q2, `> ${F.n(q2, 2)}`]].map(([b, fn, range]) => {
      const ys = ok.filter(fn).map(o => o.y);
      return { b, range, n: ys.length, mean: S.mean(ys), med: S.median(ys), up: ys.filter(y => y > 0).length / ys.length, t: S.mean(ys) / (S.std(ys) / Math.sqrt(ys.length)) };
    });
    const html = U.table({ id: 'bt-diag', exportName: 'signal_diagnostics.csv', columns: [
      { key: 'label', label: 'Feature at close', align: 'l' }, { key: 'n', label: 'n' },
      { key: 'all', label: 'r (all)', fmt: v => F.n(v, 3), cls: v => F.cls(v) }, { key: 'h1', label: 'r 1st half', fmt: v => F.n(v, 3) }, { key: 'h2', label: 'r 2nd half', fmt: v => F.n(v, 3) },
      { key: 'exExpiry', label: 'r ex-expiry', fmt: v => F.n(v, 3) }, { key: 'sameDayRemoved', label: 'r same-day removed', fmt: v => F.n(v, 3) },
      { key: 'p', label: 'Permutation p', fmt: v => (v < 0.05 ? `<b>${F.n(v, 3)}</b>` : F.n(v, 3)) }
    ], rows: d }) + U.table({ id: 'bt-bucket', exportName: 'pcr_bucket_stats.csv', caption: 'Next-session NIFTY move by nearest-expiry PCR tercile (cut-offs from the full sample, so descriptive only)', columns: [
      { key: 'b', label: 'Bucket', align: 'l' }, { key: 'range', label: 'PCR range' }, { key: 'n', label: 'n' },
      { key: 'mean', label: 'Mean', fmt: v => F.spct(v, 3), cls: v => F.cls(v) }, { key: 'med', label: 'Median', fmt: v => F.spct(v, 3) },
      { key: 'up', label: 'Up share', fmt: v => F.pct(v, 0) }, { key: 't', label: 't-stat', fmt: v => F.n(v, 2) }
    ], rows: bk }) + `<p class="note">Signs that flip between halves, or vanish once the same-day move is removed, suggest the relation is noise or momentum rather than information in positioning. With ${d.length} features tested, expect about ${F.n(d.length * 0.05, 1)} false positives at p &lt; 0.05.</p>`;
    return { n: rows.length, last: rows[rows.length - 1].date, html, rows: d, buckets: bk };
  }

  NRP.modules.backtest = { title: 'Backtesting', code: 'F', render, diagnostics, last: null };
})(typeof self !== 'undefined' ? self : this);
