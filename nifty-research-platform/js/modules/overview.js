/* I. Market Overview: NIFTY 50, India VIX, BANK NIFTY, trend, OI levels, breadth and the
 * next-session range ladder preserved from the original "Tomorrow" tab. */
(function (root) {
  'use strict';
  const NRP = root.NRP, U = NRP.ui, F = U.fmt, S = NRP.stats, H = NRP.shared;
  let lookback = 60;

  function render(el) {
    const rows = H.series();
    if (!rows.length) { el.innerHTML = H.needData('No NIFTY daily data loaded', ['indices'], 'The overview needs the daily summary file (bundled) or NIFTY 50 history.'); return; }
    const L = rows[rows.length - 1], P = rows[rows.length - 2] || {};
    const vixHist = rows.map(r => r.vix).filter(Number.isFinite);
    const vixPct = S.percentileRank(L.vix, vixHist);
    const sig = H.vixSigma(L.spot, L.vix);
    const trend = Number.isFinite(L.sma20) ? (L.spot > L.sma20 ? 'Above 20D SMA' : 'Below 20D SMA') : 'n/a';
    const sma5ago = rows.length > 25 ? rows[rows.length - 6].sma20 : NaN;
    const slope = Number.isFinite(sma5ago) ? L.sma20 / sma5ago - 1 : NaN;
    const ch5 = rows.length > 5 ? L.spot / rows[rows.length - 6].spot - 1 : NaN;

    // Chain levels for the latest strike-file date (nearest levels need strikes).
    const cx = H.chainContext('NIFTY', { latest: true });
    const lv = cx.rows.length && cx.spot.value && cx.date === L.date ? NRP.options.oiLevels(cx.rows, cx.spot.value) : null;

    const kpis = [
      U.kpi('NIFTY 50 close', F.n(L.spot, 2), `<span class="${F.cls(L.ret)}">${F.spct(L.ret)}</span> · ${F.date(L.date)}`),
      U.kpi('India VIX', F.n(L.vix, 2), `${F.sgn(L.vixChg)} · ${F.ord(vixPct)} percentile (${vixHist.length} sessions)`),
      U.kpi('PCR (nearest expiry)', F.n(L.pcrNear, 2), `All expiries ${F.n(L.pcrAll, 2)}`),
      U.kpi('Max pain (nearest)', F.n(L.maxPain), `Spot ${F.sgn(L.spot - L.maxPain, 0)} pts (${F.spct(L.gapPct)})`, ''),
      U.kpi('OI support / resistance', `${F.n(L.support)} / ${F.n(L.resistance)}`, lv ? `Nearest to spot: ${F.n(lv.supportNear)} / ${F.n(lv.resistanceNear)} (${F.dshort(cx.date)})` : 'Max put OI / max call OI'),
      U.kpi('VIX-implied 1σ day', '±' + F.n(sig, 0) + ' pts', `${F.n(L.spot - sig, 0)} – ${F.n(L.spot + sig, 0)} ${U.badge('MODEL')}`),
      U.kpi('Trend (20D SMA)', trend, `SMA ${F.n(L.sma20, 0)} · slope 5D ${F.spct(slope)} · 5D chg ${F.spct(ch5)}`, L.spot > L.sma20 ? 'up' : 'dn'),
      U.kpi('Days to nearest expiry', F.n(L.dte), `Expiry ${F.date(L.expiry)}`)
    ].join('');

    // Range ladder (original "Tomorrow" tab): 0.5σ, 1σ, 1.5σ, 2σ from VIX.
    const ladder = [2, 1.5, 1, 0.5].map(k => ({ k, up: L.spot + k * sig, dn: L.spot - k * sig, prob: 2 * NRP.options.normCdf(k) - 1 }));
    const ladderTbl = U.table({
      id: 'ov-ladder', columns: [
        { key: 'k', label: 'Band', fmt: v => '±' + v + 'σ' },
        { key: 'dn', label: 'Lower', fmt: v => F.n(v, 0) }, { key: 'up', label: 'Upper', fmt: v => F.n(v, 0) },
        { key: 'prob', label: 'Normal-model coverage', fmt: v => F.pct(v, 1) }
      ], rows: ladder, exportName: 'nifty_range_ladder.csv'
    });

    // How often did the next session stay within the VIX 1σ band? (history, not a forecast)
    let inside = 0, tot = 0;
    for (let i = 0; i < rows.length - 1; i++) {
      const s = H.vixSigma(rows[i].spot, rows[i].vix), m = Math.abs(rows[i + 1].spot - rows[i].spot);
      if (Number.isFinite(s)) { tot++; if (m <= s) inside++; }
    }

    // Conditional history: next-session move grouped by the state that is known at each close.
    const cond = conditional(rows);

    const view = rows.slice(-lookback);
    el.innerHTML = `
      <div class="kpis">${kpis}</div>
      <div class="grid g-2-1">
        ${U.panel({ title: 'NIFTY 50 vs max pain and 20D SMA', code: 'I.1', prov: U.provenance(['summary']),
          actions: `<select class="inp inp-sm" id="ov-lb" aria-label="Lookback">${[20, 60, 120, 9999].map(n => U.opt(n, n === 9999 ? 'All' : n + ' sessions', lookback)).join('')}</select>`,
          body: '<div class="chart h-320"><canvas id="ov-c1"></canvas></div>' })}
        ${U.panel({ title: 'Next-session range from India VIX', code: 'I.2', prov: U.badge('MODEL') + ' <span class="muted">σ<sub>day</sub> = spot × VIX / 100 / √252</span>',
          body: ladderTbl + `<p class="note">In this sample the next close stayed inside the 1σ band on <b>${inside} of ${tot}</b> sessions (${F.pct(inside / tot, 0)}); a normal model implies 68%. Bands describe implied volatility, not direction.</p>` })}
      </div>
      <div class="grid g-2">
        ${U.panel({ title: 'India VIX and nearest-expiry PCR', code: 'I.3', prov: U.provenance(['summary']), body: '<div class="chart h-260"><canvas id="ov-c2"></canvas></div>' })}
        ${U.panel({ title: 'What followed similar closes (in-sample history)', code: 'I.4', prov: U.provenance(['summary']) + ' <span class="muted">groups use trailing medians only</span>',
          body: cond.html })}
      </div>
      <div class="grid g-2">
        ${bankPanel()}
        ${breadthPanel()}
      </div>`;

    U.$('#ov-lb', el).addEventListener('change', e => { lookback = +e.target.value; render(el); });
    const p = U.palette(), labels = view.map(r => F.dshort(r.date));
    U.chart('ov-c1', {
      type: 'line', data: { labels, datasets: [
        { label: 'NIFTY 50', data: view.map(r => r.spot), borderColor: p.ink, borderWidth: 1.6, pointRadius: 0 },
        { label: 'Max pain', data: view.map(r => r.maxPain), borderColor: p.acc, borderWidth: 1, pointRadius: 1.5, stepped: true },
        { label: '20D SMA', data: view.map(r => r.sma20), borderColor: p.c3, borderWidth: 1, borderDash: [5, 3], pointRadius: 0 },
        { label: 'OI support', data: view.map(r => r.support), borderColor: p.put, borderWidth: 1, pointRadius: 0, stepped: true, hidden: true },
        { label: 'OI resistance', data: view.map(r => r.resistance), borderColor: p.call, borderWidth: 1, pointRadius: 0, stepped: true, hidden: true }
      ] }, options: { scales: { x: { ticks: { maxTicksLimit: 10 } }, y: {} } }
    });
    U.chart('ov-c2', {
      type: 'line', data: { labels, datasets: [
        { label: 'India VIX', data: view.map(r => r.vix), borderColor: p.c4, borderWidth: 1.4, pointRadius: 0, yAxisID: 'y' },
        { label: 'PCR nearest', data: view.map(r => r.pcrNear), borderColor: p.acc, borderWidth: 1.2, pointRadius: 0, yAxisID: 'y1' }
      ] }, options: { scales: { x: { ticks: { maxTicksLimit: 10 } }, y: { position: 'left', title: { display: true, text: 'VIX' } }, y1: { position: 'right', grid: { drawOnChartArea: false }, title: { display: true, text: 'PCR' } } } }
    });
    drawBank();
  }

  function conditional(rows) {
    const groups = {};
    const add = (g, m) => { (groups[g] = groups[g] || []).push(m); };
    for (let i = 20; i < rows.length - 1; i++) {
      const r = rows[i], m = H.nextMove(rows, i);
      const past = rows.slice(i - 20, i);
      const pcrMed = S.median(past.map(x => x.pcrNear)), vixMed = S.median(past.map(x => x.vix));
      if (Number.isFinite(r.pcrNear)) add(r.pcrNear > pcrMed ? 'PCR above its 20D median' : 'PCR at/below its 20D median', m);
      if (Number.isFinite(r.vix)) add(r.vix > vixMed ? 'VIX above its 20D median' : 'VIX at/below its 20D median', m);
      if (Number.isFinite(r.gapPct)) add(r.gapPct > 0 ? 'Spot above max pain' : 'Spot at/below max pain', m);
      if (Number.isFinite(r.sma20)) add(r.spot > r.sma20 ? 'Spot above 20D SMA' : 'Spot at/below 20D SMA', m);
    }
    const L = rows[rows.length - 1], past = rows.slice(-21, -1);
    const now = new Set([
      L.pcrNear > S.median(past.map(x => x.pcrNear)) ? 'PCR above its 20D median' : 'PCR at/below its 20D median',
      L.vix > S.median(past.map(x => x.vix)) ? 'VIX above its 20D median' : 'VIX at/below its 20D median',
      L.gapPct > 0 ? 'Spot above max pain' : 'Spot at/below max pain',
      L.spot > L.sma20 ? 'Spot above 20D SMA' : 'Spot at/below 20D SMA'
    ]);
    const tr = Object.entries(groups).map(([g, ms]) => ({ g, n: ms.length, mean: S.mean(ms), up: ms.filter(x => x > 0).length / ms.length, sd: S.std(ms), now: now.has(g) }));
    const html = U.table({
      id: 'ov-cond', exportName: 'nifty_conditional_next_session.csv', rowClass: r => (r.now ? 'hl' : ''),
      columns: [
        { key: 'g', label: 'State at close', align: 'l', fmt: (v, r) => U.esc(v) + (r.now ? ' <span class="tag">today</span>' : '') },
        { key: 'n', label: 'n' }, { key: 'mean', label: 'Avg next move', fmt: v => F.spct(v), cls: v => F.cls(v) },
        { key: 'up', label: 'Up share', fmt: v => F.pct(v, 0) }, { key: 'sd', label: 'Std dev', fmt: v => F.pct(v) }
      ], rows: tr
    }) + '<p class="note">Descriptive statistics over a short sample. Groups overlap and are not independent signals; see the Backtest module for a tradeable, cost-adjusted test.</p>';
    return { html };
  }

  function bankPanel() {
    const b = NRP.store.data.indices['NIFTY BANK'] || [], v = NRP.store.data.indices['INDIA VIX'] || [];
    if (!b.length) return U.panel({ title: 'BANK NIFTY', code: 'I.5', body: H.needData('BANK NIFTY history not loaded', ['indices'], 'Download NIFTY BANK historical data and import it with index name "NIFTY BANK".') + (v.length ? `<p class="note">India VIX history loaded: ${v.length} rows.</p>` : '') });
    const L = b[b.length - 1], P = b[b.length - 2];
    const n50 = NRP.store.data.summary;
    return U.panel({ title: 'BANK NIFTY', code: 'I.5', prov: U.provenance(['index_history']),
      body: `<div class="kpis kpis-2">${U.kpi('NIFTY BANK close', F.n(L.close, 2), P ? `<span class="${F.cls(L.close / P.close - 1)}">${F.spct(L.close / P.close - 1)}</span> · ${F.date(L.date)}` : F.date(L.date))}${U.kpi('Sessions loaded', F.n(b.length), `${F.date(b[0].date)} → ${F.date(L.date)}`)}</div>
        <div class="chart h-220"><canvas id="ov-bank"></canvas></div><p class="note">Both indices rebased to 100 on the first common date${n50.length ? '' : ' (NIFTY 50 not loaded)'}.</p>` });
  }

  function drawBank() {
    const b = NRP.store.data.indices['NIFTY BANK'] || [];
    if (!b.length || !document.getElementById('ov-bank')) return;
    const n = new Map(NRP.store.data.summary.map(r => [r.date, r.spot]));
    (NRP.store.data.indices['NIFTY 50'] || []).forEach(r => { if (!n.has(r.date)) n.set(r.date, r.close); });
    const common = b.filter(r => n.has(r.date)).slice(-120);
    const src = common.length > 1 ? common : b.slice(-120);
    const b0 = src[0].close, n0 = n.get(src[0].date);
    const p = U.palette();
    U.chart('ov-bank', { type: 'line', data: { labels: src.map(r => F.dshort(r.date)), datasets: [
      { label: 'NIFTY BANK', data: src.map(r => r.close / b0 * 100), borderColor: p.c4, pointRadius: 0, borderWidth: 1.4 },
      ...(common.length > 1 ? [{ label: 'NIFTY 50', data: src.map(r => n.get(r.date) / n0 * 100), borderColor: p.ink, pointRadius: 0, borderWidth: 1.2 }] : [])
    ] }, options: { scales: { x: { ticks: { maxTicksLimit: 8 } }, y: {} } } });
  }

  function breadthPanel() {
    const b = NRP.store.data.breadth;
    if (!b.length) return U.panel({ title: 'Market breadth', code: 'I.6', body: H.needData('Breadth data not loaded', ['breadth'], 'Breadth is only shown when you import a Date / Advances / Declines file. It is never estimated.') });
    const rows = b.slice(-20).reverse().map(r => ({ ...r, ratio: r.declines ? r.advances / r.declines : NaN }));
    return U.panel({ title: 'Market breadth', code: 'I.6', prov: U.provenance(['breadth']),
      body: U.table({ id: 'ov-breadth', exportName: 'breadth.csv', columns: [
        { key: 'date', label: 'Date', align: 'l', fmt: F.date }, { key: 'advances', label: 'Advances', fmt: v => F.n(v) },
        { key: 'declines', label: 'Declines', fmt: v => F.n(v) }, { key: 'unchanged', label: 'Unch.', fmt: v => F.n(v) },
        { key: 'ratio', label: 'A/D ratio', fmt: v => F.n(v, 2), cls: v => (v > 1 ? 'up' : v < 1 ? 'dn' : '') }
      ], rows, maxHeight: 260 }) });
  }

  NRP.modules.overview = { title: 'Market Overview', code: 'I', render };
})(typeof self !== 'undefined' ? self : this);
