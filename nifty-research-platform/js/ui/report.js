/* Downloadable research report: one self-contained HTML file (inline CSS and SVG charts, no external
 * requests) covering provenance, market snapshot, insights, backtest, risk and methodology.
 * It can be opened offline and printed to PDF from the browser. */
(function (root) {
  'use strict';
  const NRP = root.NRP, U = NRP.ui, F = U.fmt, S = NRP.stats, H = NRP.shared;
  const e = U.esc;

  /** Minimal SVG line chart. series: [{name, color, data: number[]}] sharing the x axis. */
  function svgLine(series, labels, { w = 760, h = 220, pct = false } = {}) {
    const pad = { l: 56, r: 12, t: 14, b: 26 }, all = series.flatMap(s => s.data).filter(Number.isFinite);
    if (!all.length) return '';
    let lo = Math.min(...all), hi = Math.max(...all); if (lo === hi) { lo -= 1; hi += 1; }
    const n = labels.length, X = i => pad.l + (w - pad.l - pad.r) * (n > 1 ? i / (n - 1) : 0.5), Y = v => pad.t + (h - pad.t - pad.b) * (1 - (v - lo) / (hi - lo));
    const ticks = [0, 0.25, 0.5, 0.75, 1].map(k => lo + (hi - lo) * k);
    const lab = v => (pct ? F.n((v - 1) * 100, 1) + '%' : F.n(v, 0));
    const paths = series.map(s => {
      let d = '', pen = false;
      s.data.forEach((v, i) => { if (Number.isFinite(v)) { d += (pen ? 'L' : 'M') + X(i).toFixed(1) + ',' + Y(v).toFixed(1); pen = true; } else pen = false; });
      return `<path d="${d}" fill="none" stroke="${s.color}" stroke-width="1.5"/>`;
    }).join('');
    const xl = [0, Math.floor(n / 2), n - 1].map(i => `<text x="${X(i)}" y="${h - 8}" text-anchor="middle">${e(labels[i])}</text>`).join('');
    const legend = series.map((s, i) => `<text x="${pad.l + 8 + i * 150}" y="${pad.t + 2}" fill="${s.color}">■ ${e(s.name)}</text>`).join('');
    return `<svg viewBox="0 0 ${w} ${h}" class="chart" role="img">${ticks.map(t => `<line x1="${pad.l}" x2="${w - pad.r}" y1="${Y(t)}" y2="${Y(t)}" stroke="#ddd"/><text x="${pad.l - 6}" y="${Y(t) + 3}" text-anchor="end">${lab(t)}</text>`).join('')}${paths}${xl}${legend}</svg>`;
  }

  const tbl = (head, rows) => `<table><thead><tr>${head.map(h => `<th>${e(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${r.map(c => `<td>${e(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;

  function build() {
    const rows = H.series(), L = rows[rows.length - 1], now = new Date();
    const srcs = NRP.store.sources;
    const parts = [];
    parts.push(`<header><h1>NIFTY Derivatives Research Note</h1><div class="sub">Generated ${e(F.ts(now.toISOString()))} · data as of ${e(F.date(L && L.date))} · end-of-day data only, no live feed</div></header>`);
    parts.push(`<section><h2>1. Data provenance</h2>${tbl(['Mode', 'Dataset', 'File', 'Origin', 'As of', 'Rows'], srcs.map(s => [s.mode, s.label, s.file, s.origin, F.date(s.asOf), F.n(s.rows)]))}
      <p class="note">HISTORICAL = bundled end-of-day file; UPLOADED = imported by the user; MODEL = computed by the application under the assumptions in section 6.</p></section>`);

    if (L) {
      const sig = H.vixSigma(L.spot, L.vix);
      parts.push(`<section><h2>2. Market snapshot (${e(F.date(L.date))})</h2>${tbl(['Metric', 'Value'], [
        ['NIFTY 50 close', `${F.n(L.spot, 2)} (${F.spct(L.ret)})`], ['India VIX', `${F.n(L.vix, 2)} (${F.sgn(L.vixChg, 2)})`],
        ['PCR nearest / all expiries', `${F.n(L.pcrNear, 2)} / ${F.n(L.pcrAll, 2)}`], ['Max pain (nearest expiry)', `${F.n(L.maxPain)} · spot ${F.sgn(L.spot - L.maxPain, 0)} pts`],
        ['OI support / resistance', `${F.n(L.support)} / ${F.n(L.resistance)}`], ['20D SMA', F.n(L.sma20, 0)],
        ['VIX-implied 1σ next session (MODEL)', `±${F.n(sig, 0)} pts (${F.n(L.spot - sig, 0)} – ${F.n(L.spot + sig, 0)})`], ['Nearest expiry', `${F.date(L.expiry)} (${F.n(L.dte)} DTE)`]
      ])}${svgLine([{ name: 'NIFTY 50', color: '#111', data: rows.slice(-120).map(r => r.spot) }, { name: 'Max pain', color: '#c77d00', data: rows.slice(-120).map(r => r.maxPain) }], rows.slice(-120).map(r => F.dshort(r.date)))}</section>`);
    }

    const ins = NRP.modules.insights.compute();
    parts.push(`<section><h2>3. Research observations</h2>${ins.map((x, i) => `<div class="ins"><h3>3.${i + 1} ${e(x.title)}</h3><p>${e(x.text)}</p><p class="ev">${x.evidence.map(([k, v]) => `<b>${e(k)}</b> ${e(v)}`).join(' · ')}</p><p class="f">${e(x.formula)} · Source: ${e(x.src)}</p></div>`).join('') || '<p>Not enough data.</p>'}</section>`);

    let bt = NRP.modules.backtest.last;
    if (!bt && rows.length >= 30) {
      const B = NRP.backtest, cfg = { field: 'pcrNear', hi: 1.2, lo: 0.8, posHigh: 1, posLow: -1 };
      bt = { res: B.run(NRP.store.data.summary, B.SIGNALS.pcr.make(cfg), { lag: 1, costBpsPerSide: H.settings.costBps }), rule: 'Nearest-expiry PCR > 1.2 → long; < 0.8 → short; otherwise flat. (Default rule; the Backtest page was not opened.)', cfg: { lag: 1, cost: H.settings.costBps } };
    }
    if (bt && !bt.res.error) {
      const m = bt.res.metrics;
      parts.push(`<section><h2>4. Backtest</h2><p><b>Rule:</b> ${e(bt.rule)} Execution lag ${e(bt.cfg.lag)}; cost ${e(bt.cfg.cost)} bps per side.</p>${tbl(['Metric', 'Strategy', 'Buy & hold'], [
        ['Total return', F.spct(m.totalReturn), F.spct(m.buyHoldReturn)], ['Max drawdown', F.pct(m.maxDrawdown), F.pct(m.buyHoldMaxDrawdown)],
        ['Sharpe (ann., rf 0)', F.n(m.sharpe, 2), ''], ['Trades / trade win rate', `${m.trades} / ${F.pct(m.tradeWinRate, 0)}`, ''],
        ['Profit factor', F.n(m.profitFactor, 2), ''], ['Exposure', F.pct(m.exposure, 0), ''], ['Total costs', F.pct(m.totalCost, 2), ''],
        ['Period', `${F.date(m.firstDate)} → ${F.date(m.lastDate)} (${m.sessions} sessions)`, '']
      ])}${svgLine([{ name: 'Strategy', color: '#c77d00', data: bt.res.equity }, { name: 'Buy & hold', color: '#777', data: bt.res.buyHold }], bt.res.dates.map(F.dshort), { pct: true })}
      <p class="note">No look-ahead: signals use same-day EOD data only, positions start one session later by default, forward-looking source columns are discarded. In-sample, short history; not evidence of a durable edge.</p></section>`);
    }

    if (rows.length > 25) {
      const rets = NRP.risk.returnsFrom(rows.map(r => r.spot)), v95 = NRP.risk.historicalVaR(rets, 0.95), v99 = NRP.risk.historicalVaR(rets, 0.99);
      const rv = NRP.risk.realisedVol(rows.map(r => r.spot), 20), mdd = S.maxDrawdown(rows.map(r => r.spot));
      parts.push(`<section><h2>5. Risk</h2>${tbl(['Metric', 'Value'], [
        ['1-day historical VaR 95% / ES', `${F.pct(v95.var)} / ${F.pct(v95.es)}`], ['1-day historical VaR 99% / ES', `${F.pct(v99.var)} / ${F.pct(v99.es)}`],
        ['Realised vol 20D (ann.)', F.pct(rv[rv.length - 1], 1)], ['India VIX', F.n(L.vix, 2)],
        ['Max drawdown in sample', `${F.pct(mdd.mdd)} (${F.date(rows[mdd.peakIdx].date)} → ${F.date(rows[mdd.troughIdx].date)})`], ['Observations', String(v95.n)]
      ])}</section>`);
    }

    parts.push(`<section><h2>6. Methodology and assumptions</h2>${NRP.modules.methodology.SECTIONS.map(([t, items]) => `<h3>${e(t)}</h3><ul>${items.map(x => `<li>${e(x)}</li>`).join('')}</ul>`).join('')}
      <p>Assumptions in force: r = ${e(H.settings.r)}%, q = ${e(H.settings.q)}%, lot size ${e(H.settings.lot)}, cost ${e(H.settings.costBps)} bps per side.</p></section>`);
    parts.push('<footer>Research and education only. Not investment advice. Figures derive from the files listed in section 1.</footer>');

    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>NIFTY research note ${e(L ? L.date : '')}</title>
<style>body{font:13px/1.5 "IBM Plex Sans",system-ui,sans-serif;color:#111;max-width:860px;margin:2rem auto;padding:0 1rem}h1{font-size:22px;margin:0}h2{font-size:15px;border-bottom:2px solid #111;padding-bottom:3px;margin-top:28px}h3{font-size:13px;margin:14px 0 4px}
.sub,.note,.f,footer{color:#555;font-size:11.5px}table{border-collapse:collapse;width:100%;font-variant-numeric:tabular-nums;margin:6px 0}th,td{border-bottom:1px solid #ddd;padding:4px 6px;text-align:left}th{background:#f3f3f3;font-weight:600}
.ins{border-left:3px solid #c77d00;padding:2px 0 2px 10px;margin:10px 0}.ev{font-size:12px}.chart{width:100%;height:auto;font:10px sans-serif;fill:#555;margin:8px 0}footer{margin-top:30px;border-top:1px solid #ddd;padding-top:8px}
@media print{body{margin:0}section{break-inside:avoid-page}}</style></head><body>${parts.join('\n')}</body></html>`;
  }

  function download() {
    const L = NRP.store.latestSummary();
    U.download(`nifty_research_note_${L ? L.date : 'na'}.html`, build(), 'text/html');
  }

  NRP.report = { build, download, svgLine };
})(typeof self !== 'undefined' ? self : this);
