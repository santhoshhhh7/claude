/* J. Research Insights: rule-based observations generated from the loaded data. Each one lists the
 * numbers it rests on, the formula and the dataset, so it can be traced and checked. No text here is
 * written by a language model, and nothing is a recommendation. */
(function (root) {
  'use strict';
  const NRP = root.NRP, U = NRP.ui, F = U.fmt, S = NRP.stats, O = NRP.options, H = NRP.shared;

  function compute() {
    const rows = H.series(), out = [];
    if (rows.length < 21) return out;
    const L = rows[rows.length - 1], past20 = rows.slice(-21, -1), src = 'Daily summary · ' + F.date(L.date);

    // 1. Positioning: PCR level vs its own history.
    const pcrs = rows.map(r => r.pcrNear).filter(Number.isFinite);
    const pr = S.percentileRank(L.pcrNear, pcrs), pMed = S.median(past20.map(r => r.pcrNear));
    out.push({ id: 'pcr', title: 'Put-call ratio relative to its own history', tone: pr > 0.8 ? 'hi' : pr < 0.2 ? 'lo' : 'mid',
      text: `Nearest-expiry PCR is ${F.n(L.pcrNear, 2)}, at the ${F.ord(pr)} percentile of ${pcrs.length} sessions and ${L.pcrNear > pMed ? 'above' : 'at or below'} its 20-session median of ${F.n(pMed, 2)}. ${pr > 0.8 ? 'Put open interest is unusually heavy relative to calls.' : pr < 0.2 ? 'Call open interest is unusually heavy relative to puts.' : 'Positioning is within its normal range.'}`,
      evidence: [['PCR nearest', F.n(L.pcrNear, 2)], ['PCR all expiries', F.n(L.pcrAll, 2)], ['Percentile', F.pct(pr, 0)], ['20D median', F.n(pMed, 2)]],
      formula: 'PCR = Σ put OI ÷ Σ call OI (nearest expiry); percentile = share of sample ≤ today', src });

    // 2. Max pain gap.
    const gaps = rows.map(r => r.spot - r.maxPain).filter(Number.isFinite);
    out.push({ id: 'mp', title: 'Spot versus max pain', tone: Math.abs(L.spot - L.maxPain) > S.std(gaps) ? 'hi' : 'mid',
      text: `NIFTY closed ${F.n(Math.abs(L.spot - L.maxPain), 0)} points ${L.spot >= L.maxPain ? 'above' : 'below'} max pain (${F.n(L.maxPain)}) with ${F.n(L.dte)} day(s) to the ${F.date(L.expiry)} expiry. The typical gap in this sample is ±${F.n(S.std(gaps), 0)} points (1 s.d.). Max pain marks where option holders collectively lose most; it is not a price target.`,
      evidence: [['Spot', F.n(L.spot, 2)], ['Max pain', F.n(L.maxPain)], ['Gap', F.sgn(L.spot - L.maxPain, 0)], ['Gap s.d.', F.n(S.std(gaps), 0)], ['DTE', F.n(L.dte)]],
      formula: 'Max pain = argmin_K Σ [call OI·max(0, K − k) + put OI·max(0, k − K)]', src });

    // 3. OI walls and implied range.
    const sig = H.vixSigma(L.spot, L.vix), cx = H.chainContext('NIFTY', { latest: true });
    const lv = cx.rows.length && cx.spot.value && cx.date === L.date ? O.oiLevels(cx.rows, cx.spot.value) : null;
    const sup = lv ? lv.supportNear : L.support, res = lv ? lv.resistanceNear : L.resistance;
    out.push({ id: 'walls', title: 'OI levels against the volatility-implied range', tone: 'mid',
      text: `The nearest put-OI concentration is at ${F.n(sup)} (${F.n(L.spot - sup, 0)} pts below spot) and the nearest call-OI concentration at ${F.n(res)} (${F.n(res - L.spot, 0)} pts above). India VIX at ${F.n(L.vix, 2)} implies a one-day 1σ move of about ±${F.n(sig, 0)} points, so ${(L.spot - sup) < sig && (res - L.spot) < sig ? 'both levels sit inside one implied day\'s range' : (L.spot - sup) < sig ? 'the support level sits inside one implied day\'s range' : (res - L.spot) < sig ? 'the resistance level sits inside one implied day\'s range' : 'both levels are more than one implied day away'}.`,
      evidence: [['Support (nearest)', F.n(sup)], ['Resistance (nearest)', F.n(res)], ['Absolute support/resistance', `${F.n(L.support)} / ${F.n(L.resistance)}`], ['VIX 1σ day', '±' + F.n(sig, 0)]],
      formula: 'Nearest support = strike ≤ spot with max put OI; σ_day = spot × VIX/100/√252', src: lv ? 'Strike OI · ' + F.date(cx.date) : src });

    // 4. Volatility regime: implied vs realised.
    const rv = NRP.risk.realisedVol(rows.map(r => r.spot), 20), rvL = rv[rv.length - 1] * 100;
    const vMed = S.median(past20.map(r => r.vix));
    out.push({ id: 'vol', title: 'Implied versus realised volatility', tone: L.vix - rvL > 3 ? 'hi' : L.vix - rvL < -1 ? 'lo' : 'mid',
      text: `India VIX is ${F.n(L.vix, 2)} (${L.vix > vMed ? 'above' : 'at or below'} its 20-session median of ${F.n(vMed, 2)}) against 20-day realised volatility of ${F.n(rvL, 2)}%. The implied-minus-realised spread of ${F.sgn(L.vix - rvL, 2)} points ${L.vix > rvL ? 'means options are priced for larger moves than NIFTY has recently delivered' : 'means recent moves have been larger than options price in'}.`,
      evidence: [['India VIX', F.n(L.vix, 2)], ['VIX change', F.sgn(L.vixChg, 2)], ['Realised 20D', F.n(rvL, 2) + '%'], ['VIX 20D median', F.n(vMed, 2)]],
      formula: 'Realised = st.dev(ln Sₜ/Sₜ₋₁, 20) × √252; spread = VIX − realised', src });

    // 5. Trend.
    const ch5 = L.spot / rows[rows.length - 6].spot - 1, ch20 = L.spot / rows[rows.length - 21].spot - 1;
    out.push({ id: 'trend', title: 'Price trend', tone: L.spot > L.sma20 ? 'up' : 'dn',
      text: `NIFTY is ${F.n(Math.abs(L.spot / L.sma20 - 1) * 100, 2)}% ${L.spot > L.sma20 ? 'above' : 'below'} its 20-session average (${F.n(L.sma20, 0)}), with ${F.spct(ch5)} over 5 sessions and ${F.spct(ch20)} over 20.`,
      evidence: [['Spot', F.n(L.spot, 2)], ['20D SMA', F.n(L.sma20, 0)], ['5D change', F.spct(ch5)], ['20D change', F.spct(ch20)]],
      formula: 'SMA20 = mean of last 20 closes', src });

    // 6. Latest OI change.
    const c = L.callOiChgNear, p = L.putOiChgNear;
    if (Number.isFinite(c) && Number.isFinite(p)) out.push({ id: 'oichg', title: 'Latest session open-interest change', tone: p > c ? 'up' : 'dn',
      text: `In the nearest expiry, call OI changed by ${F.slakh(c)} and put OI by ${F.slakh(p)} while spot moved ${F.spct(L.ret)}. ${p > 0 && p > c ? 'More puts than calls were added, consistent with put writing under the market.' : c > 0 && c >= p ? 'More calls than puts were added, consistent with call writing above the market.' : 'Open interest fell, consistent with positions being closed.'} OI alone cannot show whether buyers or writers initiated the trades.`,
      evidence: [['ΔCall OI', F.slakh(c)], ['ΔPut OI', F.slakh(p)], ['Net (put − call)', F.slakh(L.netOiChg)], ['Spot change', F.spct(L.ret)]],
      formula: 'ΔOI = OI(t) − OI(t−1), nearest expiry', src });

    // 7. Evidence check on PCR as a predictor.
    const d = NRP.backtest.diagnostics(NRP.store.data.summary, 'pcrNear', { perms: 2000 });
    out.push({ id: 'evidence', title: 'Does PCR predict the next session here?', tone: d.p < 0.05 ? 'hi' : 'mid',
      text: `Across ${d.n} sessions the correlation between nearest-expiry PCR and the next session's NIFTY return is ${F.n(d.all, 3)} (permutation p = ${F.n(d.p, 3)}); ${F.n(d.h1, 3)} in the first half and ${F.n(d.h2, 3)} in the second. ${d.p < 0.05 && Math.sign(d.h1) === Math.sign(d.h2) ? 'The relation is statistically distinguishable from zero and keeps its sign across halves, but the sample is short.' : 'The relation is not reliable enough in this sample to trade on by itself.'}`,
      evidence: [['r (all)', F.n(d.all, 3)], ['r halves', `${F.n(d.h1, 3)} / ${F.n(d.h2, 3)}`], ['r ex-expiry', F.n(d.exExpiry, 3)], ['p', F.n(d.p, 3)]],
      formula: 'Pearson r(PCRₜ, Sₜ₊₁/Sₜ − 1); p = (k+1)/(N+1) over 2,000 shuffles', src: 'Daily summary, full sample' });

    // 8. Flows, only when imported.
    const ff = NRP.store.data.fiidii;
    if (ff.length >= 5) {
      const f5 = S.sum(ff.slice(-5).map(r => r.fiiNet || 0)), d5 = S.sum(ff.slice(-5).map(r => r.diiNet || 0));
      out.push({ id: 'flows', title: 'Institutional cash flows', tone: f5 > 0 ? 'up' : 'dn',
        text: `Over the last five reported sessions FIIs were net ${f5 >= 0 ? 'buyers' : 'sellers'} of ${F.cr(Math.abs(f5))} and DIIs net ${d5 >= 0 ? 'buyers' : 'sellers'} of ${F.cr(Math.abs(d5))} in the cash market.`,
        evidence: [['FII 5D', F.cr(f5)], ['DII 5D', F.cr(d5)], ['Last date', F.date(ff[ff.length - 1].date)]],
        formula: 'Σ net value, last 5 sessions (₹ crore)', src: 'Imported FII/DII file' });
    }
    return out;
  }

  function render(el) {
    const list = compute();
    if (!list.length) { el.innerHTML = H.needData('Not enough data for insights', ['indices'], 'At least 21 sessions of the daily summary are needed.'); return; }
    el.innerHTML = `
      <div class="callout">Each observation below is computed by fixed rules from the loaded data (${U.badge('MODEL')}). Evidence and formulas are shown so every statement can be checked. These are research notes, not investment advice.</div>
      <div class="insights">${list.map((x, i) => `
        <article class="ins tone-${x.tone}">
          <header><span class="code">J.${i + 1}</span><h3>${U.esc(x.title)}</h3></header>
          <p>${U.esc(x.text)}</p>
          <dl>${x.evidence.map(([k, v]) => `<div><dt>${U.esc(k)}</dt><dd>${U.esc(v)}</dd></div>`).join('')}</dl>
          <footer><span class="mono small">${U.esc(x.formula)}</span><span class="muted small">Source: ${U.esc(x.src)}</span></footer>
        </article>`).join('')}</div>`;
  }

  NRP.modules.insights = { title: 'Research Insights', code: 'J', render, compute };
})(typeof self !== 'undefined' ? self : this);
