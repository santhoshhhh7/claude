/* D. FII/DII and participant positioning: cash-market flows (₹ crore) and NSE participant-wise
 * index futures / options OI. Shown only from imported files. */
(function (root) {
  'use strict';
  const NRP = root.NRP, U = NRP.ui, F = U.fmt, S = NRP.stats, H = NRP.shared;
  let who = 'FII';

  function cashPanel() {
    const d = NRP.store.data.fiidii;
    if (!d.length) return U.panel({ title: 'FII / DII cash-market flows', code: 'D.1', body: H.needData('No FII/DII file loaded', ['fiidii'], 'Import the NSE FII/DII CSV, or a table with Date, FII_Net, DII_Net (₹ crore). Template on the Data page.') });
    let cf = 0, cd = 0;
    const rows = d.map(r => { cf += r.fiiNet || 0; cd += r.diiNet || 0; return { ...r, cumF: cf, cumD: cd }; });
    const L = rows[rows.length - 1], last5 = rows.slice(-5), last20 = rows.slice(-20);
    const sumK = (a, k) => S.sum(a.map(r => r[k] || 0));
    const sm = H.series(), spotBy = new Map(sm.map(r => [r.date, r]));
    const paired = rows.filter(r => spotBy.has(r.date) && Number.isFinite(r.fiiNet) && Number.isFinite(spotBy.get(r.date).ret));
    const c = paired.length >= 10 ? S.corr(paired.map(r => r.fiiNet), paired.map(r => spotBy.get(r.date).ret)) : NaN;
    return U.panel({ title: 'FII / DII cash-market flows', code: 'D.1', prov: U.provenance(['fiidii']) + ' <span class="muted">₹ crore, provisional exchange data</span>',
      body: `<div class="kpis">
        ${U.kpi('FII net · ' + F.dshort(L.date), F.cr(L.fiiNet), `5D ${F.cr(sumK(last5, 'fiiNet'))} · 20D ${F.cr(sumK(last20, 'fiiNet'))}`, F.cls(L.fiiNet))}
        ${U.kpi('DII net · ' + F.dshort(L.date), F.cr(L.diiNet), `5D ${F.cr(sumK(last5, 'diiNet'))} · 20D ${F.cr(sumK(last20, 'diiNet'))}`, F.cls(L.diiNet))}
        ${U.kpi('Cumulative (loaded period)', `FII ${F.cr(cf)}`, `DII ${F.cr(cd)} · ${rows.length} sessions`)}
        ${U.kpi('Corr(FII net, same-day NIFTY %)', F.n(c, 2), paired.length >= 10 ? `n = ${paired.length}; same-day, not predictive` : 'Needs ≥ 10 overlapping sessions')}
      </div>
      <div class="chart h-260"><canvas id="fd-cash"></canvas></div>
      ${U.table({ id: 'fd-tbl', exportName: 'fii_dii_cash.csv', maxHeight: 300, columns: [
        { key: 'date', label: 'Date', align: 'l', fmt: F.date }, { key: 'fiiBuy', label: 'FII buy', fmt: v => F.n(v, 0) }, { key: 'fiiSell', label: 'FII sell', fmt: v => F.n(v, 0) },
        { key: 'fiiNet', label: 'FII net', fmt: v => F.sgn(v, 0), cls: v => F.cls(v) }, { key: 'diiBuy', label: 'DII buy', fmt: v => F.n(v, 0) }, { key: 'diiSell', label: 'DII sell', fmt: v => F.n(v, 0) },
        { key: 'diiNet', label: 'DII net', fmt: v => F.sgn(v, 0), cls: v => F.cls(v) }, { key: 'cumF', label: 'Cum. FII', fmt: v => F.sgn(v, 0) }, { key: 'cumD', label: 'Cum. DII', fmt: v => F.sgn(v, 0) }
      ], rows: rows.slice().reverse() })}`, _rows: rows });
  }

  function partPanel() {
    const d = NRP.store.data.participants;
    if (!d.length) return U.panel({ title: 'Participant-wise index derivatives OI', code: 'D.2', body: H.needData('No participant OI file loaded', ['participant'], 'Each daily file gives long and short contracts for Client, DII, FII and Pro. Import several days to see the trend.') });
    const parts = [...new Set(d.map(r => r.participant))].filter(p => p !== 'TOTAL');
    if (!parts.includes(who)) who = parts.includes('FII') ? 'FII' : parts[0];
    const dates = [...new Set(d.map(r => r.date))].sort(), last = dates[dates.length - 1];
    const latest = d.filter(r => r.date === last && r.participant !== 'TOTAL').map(r => ({
      ...r, futNet: r.futIdxLong - r.futIdxShort, futLongPct: r.futIdxLong / (r.futIdxLong + r.futIdxShort),
      callNet: r.optIdxCallLong - r.optIdxCallShort, putNet: r.optIdxPutLong - r.optIdxPutShort
    }));
    return U.panel({ title: 'Participant-wise index derivatives OI', code: 'D.2', prov: U.provenance(['participant_oi']) + ' <span class="muted">contracts</span>',
      actions: `<select class="inp inp-sm" id="fd-who" aria-label="Participant">${parts.map(p => U.opt(p, p, who)).join('')}</select>`,
      body: `${U.table({ id: 'fd-part', exportName: `participant_oi_${last}.csv`, caption: 'As of ' + F.date(last), columns: [
        { key: 'participant', label: 'Participant', align: 'l' }, { key: 'futIdxLong', label: 'Idx fut long', fmt: v => F.n(v) }, { key: 'futIdxShort', label: 'Idx fut short', fmt: v => F.n(v) },
        { key: 'futNet', label: 'Fut net', fmt: v => F.sgn(v, 0), cls: v => F.cls(v) }, { key: 'futLongPct', label: 'Long %', fmt: v => F.pct(v, 1) },
        { key: 'callNet', label: 'Idx call net', fmt: v => F.sgn(v, 0), cls: v => F.cls(v) }, { key: 'putNet', label: 'Idx put net', fmt: v => F.sgn(v, 0), cls: v => F.cls(v) }
      ], rows: latest })}
      <div class="chart h-240"><canvas id="fd-part-c"></canvas></div>
      <p class="note">Long % = index futures long ÷ (long + short). Net long puts or net short calls are bearish-leaning exposures, but positions may be hedges against cash holdings; read with the cash flows above.</p>` });
  }

  function render(el) {
    el.innerHTML = `${cashPanel()}${partPanel()}`;
    const sel = U.$('#fd-who', el);
    if (sel) sel.addEventListener('change', e => { who = e.target.value; render(el); });
    const p = U.palette();
    const d = NRP.store.data.fiidii;
    if (d.length && document.getElementById('fd-cash')) {
      let cf = 0, cd = 0;
      const rows = d.slice(-120).map(r => r);
      const all = d.map(r => { cf += r.fiiNet || 0; cd += r.diiNet || 0; return [cf, cd]; }).slice(-120);
      U.chart('fd-cash', { type: 'bar', data: { labels: rows.map(r => F.dshort(r.date)), datasets: [
        { label: 'FII net', data: rows.map(r => r.fiiNet), backgroundColor: p.c4 }, { label: 'DII net', data: rows.map(r => r.diiNet), backgroundColor: p.c3 },
        { type: 'line', label: 'Cum. FII', data: all.map(x => x[0]), borderColor: p.c4, pointRadius: 0, borderWidth: 1.2, yAxisID: 'y1' },
        { type: 'line', label: 'Cum. DII', data: all.map(x => x[1]), borderColor: p.c3, pointRadius: 0, borderWidth: 1.2, yAxisID: 'y1' }
      ] }, options: { scales: { x: { ticks: { maxTicksLimit: 10 } }, y: { title: { display: true, text: '₹ cr / day' } }, y1: { position: 'right', grid: { drawOnChartArea: false }, title: { display: true, text: 'cumulative' } } } } });
    }
    const pd = NRP.store.data.participants.filter(r => r.participant === who);
    if (pd.length && document.getElementById('fd-part-c')) {
      U.chart('fd-part-c', { type: 'line', data: { labels: pd.map(r => F.dshort(r.date)), datasets: [
        { label: who + ' index fut net', data: pd.map(r => r.futIdxLong - r.futIdxShort), borderColor: p.acc, pointRadius: 2, borderWidth: 1.4 },
        { label: who + ' idx put net', data: pd.map(r => r.optIdxPutLong - r.optIdxPutShort), borderColor: p.put, pointRadius: 2, borderWidth: 1 },
        { label: who + ' idx call net', data: pd.map(r => r.optIdxCallLong - r.optIdxCallShort), borderColor: p.call, pointRadius: 2, borderWidth: 1 }
      ] }, options: { scales: { x: {}, y: {} } } });
    }
  }

  NRP.modules.fii = { title: 'FII / DII', code: 'D', render };
})(typeof self !== 'undefined' ? self : this);
