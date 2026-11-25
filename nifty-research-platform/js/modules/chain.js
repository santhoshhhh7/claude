/* A. Options Chain Analytics: strike-wise OI, change in OI, volume, PCR, max pain, support and
 * resistance, expiry-wise comparison and OI build-up / unwinding. */
(function (root) {
  'use strict';
  const NRP = root.NRP, U = NRP.ui, F = U.fmt, O = NRP.options, H = NRP.shared;
  const st = { symbol: 'NIFTY', win: 15 };

  function symbols() { return [...new Set(NRP.store.data.options.map(r => r.symbol))].sort(); }

  /** Option build-up per strike needs today's and the previous session's price for the same contract. */
  function prevMap(cx) {
    const i = cx.dates.indexOf(cx.date);
    if (i < 1) return null;
    const prev = NRP.store.chain(cx.dates[i - 1], cx.expiry, cx.symbol);
    return prev.length ? new Map(prev.map(r => [r.strike, r])) : null;
  }

  function render(el) {
    const syms = symbols();
    if (!syms.length) { el.innerHTML = H.needData('No strike-wise option data loaded', ['bhav'], 'Import an NSE F&O bhavcopy or the strike OI file.'); return; }
    if (!syms.includes(st.symbol)) st.symbol = syms[0];
    const cx = H.chainContext(st.symbol, { date: st.date, expiry: st.expiry });
    st.date = cx.date; st.expiry = cx.expiry;
    const spot = cx.spot.value;
    const all = cx.rows, rows = H.windowRows(all, spot, st.win);
    const hasVol = all.some(r => Number.isFinite(r.callVol) || Number.isFinite(r.putVol));
    const hasLtp = all.some(r => Number.isFinite(r.callLtp));
    const prev = prevMap(cx);
    const mp = O.maxPain(all), lv = spot ? O.oiLevels(all, spot) : null;
    const atm = spot ? H.atmStrike(all, spot) : null;
    const sumC = all.reduce((s, r) => s + r.callOI, 0), sumP = all.reduce((s, r) => s + r.putOI, 0);
    const chgC = all.reduce((s, r) => s + (r.callChg || 0), 0), chgP = all.reduce((s, r) => s + (r.putChg || 0), 0);
    const sm = cx.symbol === 'NIFTY' ? NRP.store.summaryOn(cx.date) : null;
    const isWindowFile = NRP.store.sourcesFor(['strikeoi']).length > 0 && !NRP.store.sourcesFor(['bhav_udiff', 'bhav_legacy']).length;

    const build = r => {
      const p = prev && prev.get(r.strike);
      const dC = p && Number.isFinite(r.callLtp) && Number.isFinite(p.callLtp) ? r.callLtp - p.callLtp : NaN;
      const dP = p && Number.isFinite(r.putLtp) && Number.isFinite(p.putLtp) ? r.putLtp - p.putLtp : NaN;
      return { ...r, callBU: O.classifyBuildup(dC, r.callChg), putBU: O.classifyBuildup(dP, r.putChg), dC, dP };
    };
    const tRows = rows.map(build);

    const controls = `
      <div class="ctl">
        ${syms.length > 1 ? `<label>Symbol <select class="inp" data-bind="symbol">${syms.map(s => U.opt(s, s, st.symbol)).join('')}</select></label>` : ''}
        <label>Date <select class="inp" data-bind="date">${cx.dates.slice().reverse().map(d => U.opt(d, F.date(d), cx.date)).join('')}</select></label>
        <label>Expiry <select class="inp" data-bind="expiry">${cx.expiries.map(e => U.opt(e, F.date(e), cx.expiry)).join('')}</select></label>
        <label>Strikes <select class="inp" data-bind="win">${[[10, '±10 around ATM'], [15, '±15'], [25, '±25'], [0, 'All']].map(([v, l]) => U.opt(v, l, st.win)).join('')}</select></label>
        <span class="muted small">Spot ${F.n(spot, 2)} (${U.esc(cx.spot.source || 'n/a')})</span>
      </div>`;

    const kpis = [
      U.kpi('PCR (OI, this expiry)', F.n(sumP / sumC, 2), `Put ${F.lakh(sumP)} / Call ${F.lakh(sumC)}`),
      U.kpi('PCR (volume)', hasVol ? F.n(O.pcr(all, 'callVol', 'putVol'), 2) : '—', hasVol ? 'Contracts traded' : 'Volume not in this file'),
      U.kpi('PCR (ΔOI)', chgC ? F.n(chgP / chgC, 2) : '—', `ΔPut ${F.slakh(chgP)} · ΔCall ${F.slakh(chgC)}`),
      U.kpi('Max pain', F.n(mp && mp.strike), spot ? `Spot ${F.sgn(spot - mp.strike, 0)} pts` : ''),
      U.kpi('Support (max put OI)', F.n(lv && lv.supportAbs), lv ? `Nearest ≤ spot: ${F.n(lv.supportNear)}` : ''),
      U.kpi('Resistance (max call OI)', F.n(lv && lv.resistanceAbs), lv ? `Nearest ≥ spot: ${F.n(lv.resistanceNear)}` : ''),
      U.kpi('Days to expiry', F.n(Math.round(O.yearFraction(cx.date, cx.expiry) * 365)), F.date(cx.expiry))
    ].join('');

    const side = (p) => [
      { key: p + 'OI', label: (p === 'call' ? 'Call' : 'Put') + ' OI', fmt: v => F.n(v) },
      { key: p + 'Chg', label: 'ΔOI', fmt: v => F.sgn(v, 0), cls: v => F.cls(v) },
      ...(hasVol ? [{ key: p + 'Vol', label: 'Vol', fmt: v => F.n(v) }] : []),
      ...(hasLtp ? [{ key: p + 'Ltp', label: 'LTP', fmt: v => F.n(v, 2) }, { key: p + 'BU', label: 'Build-up', align: 'l', fmt: v => `<span class="bu bu-${v.toLowerCase().replace(/\s+/g, '-')}">${U.esc(v)}</span>` }] : [])
    ];
    const cols = [...side('call'), { key: 'strike', label: 'Strike', align: 'c', fmt: (v, r) => `<b>${F.n(v)}</b>` }, ...side('put').reverse(),
      { key: r => (r.callOI ? r.putOI / r.callOI : NaN), label: 'PCR', fmt: v => F.n(v, 2), raw: r => (r.callOI ? r.putOI / r.callOI : '') }];
    const chainTbl = U.table({
      id: 'ch-tbl', columns: cols, rows: tRows, exportName: `${cx.symbol}_chain_${cx.date}_${cx.expiry}.csv`, maxHeight: 520,
      rowClass: r => [r.strike === atm ? 'hl' : '', spot && r.strike < spot ? 'itm-c' : 'itm-p'].join(' '),
      caption: `${tRows.length} strikes · shaded = ITM call side${hasLtp ? '' : ' · LTP not in this file, so per-strike build-up needs a bhavcopy import'}`
    });

    // Expiry-wise comparison for the selected date.
    const exRows = cx.expiries.map(e => {
      const rs = NRP.store.chain(cx.date, e, cx.symbol), m = O.maxPain(rs), l = spot ? O.oiLevels(rs, spot) : {};
      const c = rs.reduce((s, r) => s + r.callOI, 0), p = rs.reduce((s, r) => s + r.putOI, 0);
      return { expiry: e, dte: Math.round(O.yearFraction(cx.date, e) * 365), strikes: rs.length, c, p, pcr: c ? p / c : NaN, mp: m && m.strike, s: l.supportAbs, r: l.resistanceAbs,
        dc: rs.reduce((s, r) => s + (r.callChg || 0), 0), dp: rs.reduce((s, r) => s + (r.putChg || 0), 0) };
    });
    const exTbl = U.table({ id: 'ch-exp', exportName: `${cx.symbol}_expiry_compare_${cx.date}.csv`, rowClass: r => (r.expiry === cx.expiry ? 'hl' : ''), columns: [
      { key: 'expiry', label: 'Expiry', align: 'l', fmt: F.date }, { key: 'dte', label: 'DTE' }, { key: 'strikes', label: 'Strikes' },
      { key: 'c', label: 'Call OI', fmt: v => F.lakh(v) }, { key: 'p', label: 'Put OI', fmt: v => F.lakh(v) }, { key: 'pcr', label: 'PCR', fmt: v => F.n(v, 2) },
      { key: 'dc', label: 'ΔCall OI', fmt: v => F.slakh(v), cls: v => F.cls(v) }, { key: 'dp', label: 'ΔPut OI', fmt: v => F.slakh(v), cls: v => F.cls(v) },
      { key: 'mp', label: 'Max pain', fmt: v => F.n(v) }, { key: 's', label: 'Support', fmt: v => F.n(v) }, { key: 'r', label: 'Resistance', fmt: v => F.n(v) }
    ], rows: exRows });

    // Daily OI build-up history from the summary (nearest expiry, whole chain).
    const hist = H.series().slice(-30).reverse().map(r => ({ ...r, read: readOi(r) }));
    const histTbl = hist.length ? U.table({ id: 'ch-hist', exportName: 'nifty_daily_oi_buildup.csv', maxHeight: 360, columns: [
      { key: 'date', label: 'Date', align: 'l', fmt: F.date }, { key: 'spot', label: 'Spot', fmt: v => F.n(v, 0) }, { key: 'ret', label: 'Δ%', fmt: v => F.spct(v), cls: v => F.cls(v) },
      { key: 'callOiChgNear', label: 'ΔCall OI', fmt: v => F.slakh(v), cls: v => F.cls(v) }, { key: 'putOiChgNear', label: 'ΔPut OI', fmt: v => F.slakh(v), cls: v => F.cls(v) },
      { key: 'pcrNear', label: 'PCR', fmt: v => F.n(v, 2) }, { key: 'read', label: 'Reading', align: 'l' }
    ], rows: hist }) : '';

    el.innerHTML = `
      ${controls}
      ${isWindowFile ? `<div class="callout">The bundled strike file covers a window of strikes around spot, so whole-chain totals here can differ from the daily summary (PCR all-expiries ${F.n(sm && sm.pcrAll, 2)}). Import a bhavcopy for the full chain.</div>` : ''}
      <div class="kpis">${kpis}</div>
      <div class="grid g-2">
        ${U.panel({ title: 'Open interest by strike', code: 'A.1', prov: U.provenance(['strikeoi', 'bhav_udiff', 'bhav_legacy']), body: '<div class="chart h-300"><canvas id="ch-oi"></canvas></div>' })}
        ${U.panel({ title: 'Change in OI by strike', code: 'A.2', prov: U.provenance(['strikeoi', 'bhav_udiff', 'bhav_legacy']), body: '<div class="chart h-300"><canvas id="ch-chg"></canvas></div>' })}
      </div>
      <div class="grid g-1-2">
        ${U.panel({ title: 'Max pain curve', code: 'A.3', prov: U.badge('MODEL') + ' <span class="muted">Σ call OI·max(0,K−k) + put OI·max(0,k−K)</span>', body: '<div class="chart h-300"><canvas id="ch-mp"></canvas></div>' })}
        ${U.panel({ title: 'Option chain', code: 'A.4', prov: U.provenance(['strikeoi', 'bhav_udiff', 'bhav_legacy']), body: chainTbl })}
      </div>
      ${U.panel({ title: 'Expiry-wise comparison · ' + F.date(cx.date), code: 'A.5', body: exTbl })}
      ${cx.symbol === 'NIFTY' && hist.length ? U.panel({ title: 'Daily OI build-up and unwinding (nearest expiry)', code: 'A.6', prov: U.provenance(['summary']),
        body: `<div class="chart h-220"><canvas id="ch-bu"></canvas></div>${histTbl}<p class="note">Reading rules: OI added on the put side while spot rises is read as put writing (support building); call OI added while spot falls as call writing (resistance building); falling OI on both sides as unwinding. Writers versus buyers cannot be separated from OI alone.</p>` }) : ''}`;

    H.bind(el, (k, v) => { if (k === 'win') st.win = +v; else st[k] = v; if (k === 'symbol') { st.date = st.expiry = null; } if (k === 'date') st.expiry = null; render(el); });

    const p = U.palette(), labels = rows.map(r => F.n(r.strike));
    const spotIdx = spot ? rows.findIndex(r => r.strike === atm) : -1;
    const atmMark = { id: 'atm', afterDatasetsDraw(c) { if (spotIdx < 0) return; const x = c.scales.x.getPixelForValue(spotIdx), a = c.chartArea, g = c.ctx; g.save(); g.strokeStyle = p.acc; g.setLineDash([3, 3]); g.beginPath(); g.moveTo(x, a.top); g.lineTo(x, a.bottom); g.stroke(); g.fillStyle = p.acc; g.fillText('ATM', x + 3, a.top + 10); g.restore(); } };
    U.chart('ch-oi', { type: 'bar', data: { labels, datasets: [
      { label: 'Call OI', data: rows.map(r => r.callOI), backgroundColor: p.call }, { label: 'Put OI', data: rows.map(r => r.putOI), backgroundColor: p.put }
    ] }, options: { scales: { x: { ticks: { maxTicksLimit: 16 } }, y: { ticks: { callback: v => F.lakh(v, 0) } } } }, plugins: [atmMark] });
    U.chart('ch-chg', { type: 'bar', data: { labels, datasets: [
      { label: 'ΔCall OI', data: rows.map(r => r.callChg), backgroundColor: p.call }, { label: 'ΔPut OI', data: rows.map(r => r.putChg), backgroundColor: p.put }
    ] }, options: { scales: { x: { ticks: { maxTicksLimit: 16 } }, y: { ticks: { callback: v => F.lakh(v, 0) } } } }, plugins: [atmMark] });
    if (mp) {
      const cv = mp.curve.filter(c => rows.some(r => r.strike === c.strike));
      U.chart('ch-mp', { type: 'bar', data: { labels: cv.map(c => F.n(c.strike)), datasets: [
        { label: 'Total payout to holders (₹ cr, OI units × points)', data: cv.map(c => c.pain / 1e7), backgroundColor: cv.map(c => (c.strike === mp.strike ? p.acc : p.band)) }
      ] }, options: { plugins: { legend: { display: false } }, scales: { x: { ticks: { maxTicksLimit: 12 } }, y: { title: { display: true, text: '₹ crore' } } } } });
    }
    if (document.getElementById('ch-bu')) {
      const h = hist.slice().reverse();
      U.chart('ch-bu', { type: 'bar', data: { labels: h.map(r => F.dshort(r.date)), datasets: [
        { label: 'ΔCall OI', data: h.map(r => r.callOiChgNear), backgroundColor: p.call },
        { label: 'ΔPut OI', data: h.map(r => r.putOiChgNear), backgroundColor: p.put },
        { type: 'line', label: 'Spot', data: h.map(r => r.spot), borderColor: p.ink, pointRadius: 0, borderWidth: 1.2, yAxisID: 'y1' }
      ] }, options: { scales: { x: {}, y: { ticks: { callback: v => F.lakh(v, 0) } }, y1: { position: 'right', grid: { drawOnChartArea: false } } } } });
    }
  }

  function readOi(r) {
    const c = r.callOiChgNear, p = r.putOiChgNear, up = r.ret > 0;
    if (!Number.isFinite(c) || !Number.isFinite(p)) return '—';
    if (c < 0 && p < 0) return 'Unwinding on both sides';
    if (p > 0 && p > c) return up ? 'Put addition with rising spot' : 'Put addition despite falling spot';
    if (c > 0 && c >= p) return up ? 'Call addition despite rising spot' : 'Call addition with falling spot';
    return p < 0 ? 'Put unwinding' : 'Call unwinding';
  }

  NRP.modules.chain = { title: 'Options Chain', code: 'A', render };
})(typeof self !== 'undefined' ? self : this);
