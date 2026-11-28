/* H. Strategy Payoff Simulator: Long Call, Long Put, Bull Call Spread, Bear Put Spread, Covered Call,
 * Protective Put, plus editable legs. Premiums come from the loaded chain's closing prices when
 * available (UPLOADED/HISTORICAL), otherwise from Black-Scholes at a stated σ (MODEL). */
(function (root) {
  'use strict';
  const NRP = root.NRP, U = NRP.ui, F = U.fmt, O = NRP.options, P = NRP.payoff, H = NRP.shared;
  const st = { strategy: 'bull_call', spot: null, width: 2, lots: 1, sigma: null, dte: null, expiry: null, src: 'auto', legs: null };

  function chainInfo() {
    const cx = H.chainContext('NIFTY', { latest: true });
    const priced = cx.rows.some(r => r.callLtp > 0 || r.putLtp > 0);
    return { cx, priced };
  }

  function premiumFor(leg, ctx) {
    if (leg.type === 'underlying') return { premium: 0, src: '—' };
    if (st.src !== 'model' && ctx.priced && st.expiry) {
      const row = NRP.store.chain(ctx.cx.date, st.expiry).find(r => r.strike === leg.strike);
      const px = row && (leg.type === 'call' ? row.callLtp : row.putLtp);
      if (px > 0) return { premium: px, src: 'close ' + F.dshort(ctx.cx.date) };
    }
    const g = O.bsm({ S: st.spot, K: leg.strike, T: st.dte / 365, r: H.settings.r / 100, q: H.settings.q / 100, sigma: st.sigma / 100, type: leg.type });
    return { premium: g ? Math.round(g.price * 20) / 20 : 0, src: 'model' };
  }

  function rebuild(ctx) {
    const set = H.settings;
    st.legs = P.template(st.strategy, { spot: st.spot, step: set.step, width: st.width, qty: 1 }).map(l => {
      const leg = { ...l, lots: st.lots };
      const pr = premiumFor(leg, ctx);
      return { ...leg, premium: pr.premium, src: pr.src };
    });
  }

  function render(el) {
    const set = H.settings, L = NRP.store.latestSummary(), ctx = chainInfo();
    if (st.spot === null) {
      st.spot = ctx.cx.spot.value || (L ? L.spot : 25000);
      st.sigma = L && L.vix ? +L.vix.toFixed(2) : 13;
      st.expiry = ctx.cx.expiries[0] || null;
      st.dte = st.expiry ? Math.max(0, Math.round(O.yearFraction(ctx.cx.date, st.expiry) * 365)) : 7;
    }
    if (!st.legs) rebuild(ctx);
    const legs = st.legs.map(l => ({ ...l, qty: l.lots * set.lot }));
    const a = P.analyze(legs);
    const lo = st.spot * 0.92, hi = st.spot * 1.08, n = 161;
    const xs = Array.from({ length: n }, (_, i) => lo + (hi - lo) * i / (n - 1));
    const pricer = (l, S) => { const g = O.bsm({ S, K: l.strike, T: st.dte / 365, r: set.r / 100, q: set.q / 100, sigma: st.sigma / 100, type: l.type }); return g ? g.price : 0; };
    const expiryPL = xs.map(x => P.payoffAt(legs, x)), nowPL = xs.map(x => P.valueAt(legs, x, pricer));
    const anyModel = legs.some(l => l.src === 'model'), anyMkt = legs.some(l => /^close/.test(l.src));
    const usedSrc = (anyMkt ? U.provenance(['strikeoi', 'bhav_udiff', 'bhav_legacy']) : '') + (anyModel ? ` ${U.badge('MODEL')} <span class="muted">premiums from BSM at σ ${st.sigma}%, ${st.dte} days, r ${set.r}%</span>` : '');
    const ladder = [-0.05, -0.03, -0.02, -0.01, 0, 0.01, 0.02, 0.03, 0.05].map(m => { const x = st.spot * (1 + m); return { move: m, level: x, exp: P.payoffAt(legs, x), now: P.valueAt(legs, x, pricer) }; });

    el.innerHTML = `
      <div class="grid g-2">
        ${U.panel({ title: 'Strategy setup', code: 'H.1', body: `
          <div class="form">
            <label>Strategy <select class="inp" data-k="strategy">${Object.entries(P.STRATEGIES).map(([k, v]) => U.opt(k, v.label, st.strategy)).join('')}</select></label>
            <label>Spot / entry <input class="inp" type="number" step="0.05" data-k="spot" value="${+st.spot.toFixed(2)}"></label>
            <label>Spread width (strikes of ${set.step}) <input class="inp" type="number" min="1" max="20" step="1" data-k="width" value="${st.width}"></label>
            <label>Lots (× ${set.lot}) <input class="inp" type="number" min="1" step="1" data-k="lots" value="${st.lots}"></label>
            <label>Premiums <select class="inp" data-k="src">${U.opt('auto', ctx.priced ? 'Market close where available' : 'Model (no prices loaded)', st.src)}${U.opt('model', 'Model (Black-Scholes)', st.src)}</select></label>
            ${ctx.cx.expiries.length ? `<label>Expiry (chain ${F.dshort(ctx.cx.date)}) <select class="inp" data-k="expiry">${ctx.cx.expiries.map(e => U.opt(e, F.date(e), st.expiry)).join('')}</select></label>` : ''}
            <label>σ for model % <input class="inp" type="number" min="1" step="0.1" data-k="sigma" value="${st.sigma}"></label>
            <label>Days to expiry <input class="inp" type="number" min="0" step="1" data-k="dte" value="${st.dte}"></label>
          </div>
          <button class="btn btn-sm" id="pf-reset">Rebuild legs from template</button>
          <div class="tbl-scroll tbl-edit-wrap"><table class="tbl tbl-edit"><thead><tr><th class="l">Type</th><th>Side</th><th>Strike / entry</th><th>Premium</th><th>Lots</th><th class="l">Premium source</th><th></th></tr></thead><tbody>
            ${legs.map((l, i) => `<tr>
              <td class="l"><select class="inp inp-sm" data-l="${i}.type">${U.opt('call', 'Call', l.type)}${U.opt('put', 'Put', l.type)}${U.opt('underlying', 'Futures', l.type)}</select></td>
              <td><select class="inp inp-sm" data-l="${i}.side">${U.opt(1, 'Long', l.side)}${U.opt(-1, 'Short', l.side)}</select></td>
              <td><input class="inp inp-sm" type="number" step="${l.type === 'underlying' ? 0.05 : set.step}" data-l="${i}.strike" value="${+l.strike.toFixed(2)}"></td>
              <td><input class="inp inp-sm" type="number" step="0.05" min="0" data-l="${i}.premium" value="${l.premium}" ${l.type === 'underlying' ? 'disabled' : ''}></td>
              <td><input class="inp inp-sm" type="number" step="1" min="1" data-l="${i}.lots" value="${l.lots}"></td>
              <td class="l small muted">${U.esc(l.src)}</td>
              <td><button class="btn btn-xs" data-ldel="${i}" aria-label="Remove leg">✕</button></td></tr>`).join('')}
          </tbody></table></div>
          <button class="btn btn-xs" id="pf-add">+ Add leg</button>
          <p class="note">Covered call and protective put use long NIFTY futures as the underlying leg (the index itself cannot be held). Editing a strike re-prices that leg unless you typed its premium by hand.</p>` })}
        <div>
          ${U.panel({ title: 'Payoff at expiry and today (T+0)', code: 'H.2', prov: usedSrc, body: '<div class="chart h-320"><canvas id="pf-c"></canvas></div>' })}
          ${U.panel({ title: 'Metrics', code: 'H.3', body: a ? `<div class="kpis kpis-3">
            ${U.kpi('Max profit', F.inr(a.maxProfit), a.maxProfit === Infinity ? 'Unlimited above highest strike' : '', 'up')}
            ${U.kpi('Max loss', F.inr(a.maxLoss), a.maxLoss === -Infinity ? 'Unlimited' : '', 'dn')}
            ${U.kpi('Reward : risk', Number.isFinite(a.rewardToRisk) ? F.n(a.rewardToRisk, 2) + ' : 1' : '—')}
            ${U.kpi('Breakeven(s)', a.breakevens.length ? a.breakevens.map(b => F.n(b, 1)).join(' / ') : 'None')}
            ${U.kpi('Net premium', a.netPremium > 0 ? 'Debit ' + F.inr(a.netPremium) : a.netPremium < 0 ? 'Credit ' + F.inr(-a.netPremium) : '₹0')}
            ${U.kpi('Option units (all legs)', F.n(legs.reduce((s, l) => s + (l.type === 'underlying' ? 0 : l.qty), 0)), `lot size ${set.lot}`)}
          </div>` : U.empty('No legs', 'Add a leg or rebuild from a template.') })}
        </div>
      </div>
      ${U.panel({ title: 'Scenario table', code: 'H.4', body: U.table({ id: 'pf-scen', exportName: 'payoff_scenarios.csv', columns: [
        { key: 'move', label: 'Move', align: 'l', fmt: v => F.spct(v, 0) }, { key: 'level', label: 'NIFTY', fmt: v => F.n(v, 0) },
        { key: 'exp', label: 'P/L at expiry ₹', fmt: v => F.inr(v), cls: v => F.cls(v) }, { key: 'now', label: `P/L today ₹ (σ ${st.sigma}%)`, fmt: v => F.inr(v), cls: v => F.cls(v) }
      ], rows: ladder }) + '<p class="note">P/L excludes brokerage, taxes and margin interest. T+0 values are model marks, not executable prices.</p>' })}`;

    el.querySelectorAll('[data-k]').forEach(inp => inp.addEventListener('change', () => {
      const k = inp.dataset.k, v = inp.value;
      st[k] = ['strategy', 'src', 'expiry'].includes(k) ? v : Math.max(k === 'dte' ? 0 : 0.0001, +v);
      if (k === 'expiry') st.dte = Math.max(0, Math.round(O.yearFraction(ctx.cx.date, v) * 365));
      if (k === 'width' || k === 'lots') st[k] = Math.max(1, Math.round(st[k]));
      if (['strategy', 'spot', 'width', 'lots', 'src', 'expiry'].includes(k)) st.legs = null;
      else if (k === 'sigma' || k === 'dte') st.legs.forEach(l => { if (l.src === 'model') l.premium = premiumFor(l, ctx).premium; });
      render(el);
    }));
    el.querySelectorAll('[data-l]').forEach(inp => inp.addEventListener('change', () => {
      const [i, k] = inp.dataset.l.split('.'), leg = st.legs[+i];
      if (k === 'type') { leg.type = inp.value; const pr = premiumFor(leg, ctx); leg.premium = pr.premium; leg.src = pr.src; }
      else if (k === 'side') leg.side = +inp.value;
      else if (k === 'premium') { leg.premium = Math.max(0, +inp.value); leg.src = 'manual'; }
      else if (k === 'lots') leg.lots = Math.max(1, Math.round(+inp.value));
      else { leg[k] = +inp.value; if (k === 'strike' && leg.src !== 'manual') { const pr = premiumFor(leg, ctx); leg.premium = pr.premium; leg.src = pr.src; } }
      render(el);
    }));
    el.querySelectorAll('[data-ldel]').forEach(b => b.addEventListener('click', () => { st.legs.splice(+b.dataset.ldel, 1); render(el); }));
    U.$('#pf-add', el).addEventListener('click', () => {
      const leg = { type: 'call', side: 1, strike: Math.round(st.spot / set.step) * set.step, lots: st.lots };
      const pr = premiumFor(leg, ctx); st.legs.push({ ...leg, premium: pr.premium, src: pr.src }); render(el);
    });
    U.$('#pf-reset', el).addEventListener('click', () => { st.legs = null; render(el); });

    if (!legs.length) return;
    const p = U.palette(), labels = xs.map(x => F.n(x, 0));
    const spotIdx = xs.findIndex(x => x >= st.spot);
    U.chart('pf-c', { type: 'line', data: { labels, datasets: [
      { label: 'At expiry', data: expiryPL, borderColor: p.acc, borderWidth: 2, pointRadius: 0, fill: { target: 'origin', above: 'rgba(46,160,67,0.12)', below: 'rgba(218,54,51,0.12)' } },
      { label: `Today (T+0, ${st.dte}d, σ ${st.sigma}%)`, data: nowPL, borderColor: p.c3, borderWidth: 1.2, borderDash: [5, 3], pointRadius: 0 },
      U.hline(labels, 0, p.mut, 'Zero', [2, 2])
    ] }, options: { plugins: { legend: { labels: { filter: i => i.text !== 'Zero' } } }, scales: { x: { ticks: { maxTicksLimit: 9 } }, y: { ticks: { callback: v => F.inr(v) } } } },
      plugins: [{ id: 'spot', afterDatasetsDraw(c) { const x = c.scales.x.getPixelForValue(spotIdx), ar = c.chartArea, g = c.ctx; g.save(); g.strokeStyle = p.ink; g.setLineDash([3, 3]); g.beginPath(); g.moveTo(x, ar.top); g.lineTo(x, ar.bottom); g.stroke(); g.fillStyle = p.ink; g.fillText('Spot', x + 3, ar.top + 10); g.restore(); } }] });
  }

  NRP.modules.payoff = { title: 'Payoff Simulator', code: 'H', render };
})(typeof self !== 'undefined' ? self : this);
