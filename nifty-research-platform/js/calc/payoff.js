/* Option strategy payoff analysis at expiry.
 * A leg is {type: 'call'|'put'|'underlying', side: +1 (long) | -1 (short), strike, premium, qty}.
 * For 'underlying' (index futures used as the hedge leg), strike is the entry price and premium is ignored.
 * qty is in units (lots x lot size). Payoff is piecewise linear with kinks only at strikes, so max profit,
 * max loss and breakevens are computed exactly from the kink points and the slope beyond the last kink. */
(function (root, factory) {
  const mod = factory();
  if (typeof module === 'object' && module.exports) module.exports = mod;
  else { root.NRP = root.NRP || {}; root.NRP.payoff = mod; }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function legPayoff(l, S) {
    if (l.type === 'underlying') return l.side * l.qty * (S - l.strike);
    const iv = l.type === 'call' ? Math.max(0, S - l.strike) : Math.max(0, l.strike - S);
    return l.side * l.qty * (iv - (l.premium || 0));
  }
  const payoffAt = (legs, S) => legs.reduce((s, l) => s + legPayoff(l, S), 0);

  /** Net premium: positive = debit paid, negative = credit received. */
  const netPremium = legs => legs.reduce((s, l) => s + (l.type === 'underlying' ? 0 : l.side * l.qty * (l.premium || 0)), 0);

  function analyze(legs) {
    if (!legs.length) return null;
    const kinks = [...new Set(legs.filter(l => l.type !== 'underlying').map(l => l.strike))].sort((a, b) => a - b);
    const pts = [0, ...kinks.filter(k => k > 0)];
    const vals = pts.map(p => payoffAt(legs, p));
    // Slope for S beyond the highest strike: long calls and long underlying add +qty per point.
    const slopeHigh = legs.reduce((s, l) => s + (l.type === 'call' || l.type === 'underlying' ? l.side * l.qty : 0), 0);
    const EPS = 1e-9;
    const maxProfit = slopeHigh > EPS ? Infinity : Math.max(...vals);
    const maxLoss = slopeHigh < -EPS ? -Infinity : Math.min(...vals);

    const be = [];
    const push = x => { if (!be.some(b => Math.abs(b - x) < 1e-6)) be.push(x); };
    for (let i = 0; i < pts.length; i++) {
      if (Math.abs(vals[i]) < EPS && pts[i] > 0) push(pts[i]);
      if (i + 1 < pts.length && vals[i] * vals[i + 1] < 0) {
        push(pts[i] + (pts[i + 1] - pts[i]) * (-vals[i]) / (vals[i + 1] - vals[i]));
      }
    }
    const last = pts.length - 1;
    if (Math.abs(slopeHigh) > EPS && vals[last] * slopeHigh < 0) push(pts[last] - vals[last] / slopeHigh);
    be.sort((a, b) => a - b);

    const finiteRR = Number.isFinite(maxProfit) && Number.isFinite(maxLoss) && maxLoss < 0;
    return { maxProfit, maxLoss, breakevens: be, netPremium: netPremium(legs), slopeHigh,
      rewardToRisk: finiteRR ? maxProfit / -maxLoss : NaN, kinks };
  }

  /** Mark-to-model value of the position before expiry, using a pricer(leg) -> theoretical price. */
  function valueAt(legs, S, pricer) {
    return legs.reduce((s, l) => {
      if (l.type === 'underlying') return s + l.side * l.qty * (S - l.strike);
      const p = pricer(l, S);
      return s + l.side * l.qty * (p - (l.premium || 0));
    }, 0);
  }

  /** Standard strategy templates around an at-the-money strike. width = number of strike steps. */
  const STRATEGIES = {
    long_call: { label: 'Long Call', legs: a => [{ type: 'call', side: 1, strike: a }] },
    long_put: { label: 'Long Put', legs: a => [{ type: 'put', side: 1, strike: a }] },
    bull_call: { label: 'Bull Call Spread', legs: (a, s, w) => [{ type: 'call', side: 1, strike: a }, { type: 'call', side: -1, strike: a + w * s }] },
    bear_put: { label: 'Bear Put Spread', legs: (a, s, w) => [{ type: 'put', side: 1, strike: a }, { type: 'put', side: -1, strike: a - w * s }] },
    covered_call: { label: 'Covered Call (long futures + short call)', legs: (a, s, w, spot) => [{ type: 'underlying', side: 1, strike: spot }, { type: 'call', side: -1, strike: a + w * s }] },
    protective_put: { label: 'Protective Put (long futures + long put)', legs: (a, s, w, spot) => [{ type: 'underlying', side: 1, strike: spot }, { type: 'put', side: 1, strike: a - w * s }] }
  };

  function template(name, { spot, step = 50, width = 2, qty = 1 }) {
    const t = STRATEGIES[name];
    if (!t) throw new Error('Unknown strategy ' + name);
    const atm = Math.round(spot / step) * step;
    return t.legs(atm, step, width, spot).map(l => ({ premium: 0, qty, ...l }));
  }

  return { legPayoff, payoffAt, netPremium, analyze, valueAt, STRATEGIES, template };
});
