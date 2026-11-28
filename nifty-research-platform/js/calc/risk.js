/* Risk analytics: position sizing, risk-reward, VaR / Expected Shortfall, realised volatility,
 * drawdown and portfolio exposure. Returns are simple daily returns as fractions. */
(function (root, factory) {
  const stats = (typeof module === 'object' && module.exports) ? require('./stats.js') : root.NRP.stats;
  const mod = factory(stats);
  if (typeof module === 'object' && module.exports) module.exports = mod;
  else { root.NRP = root.NRP || {}; root.NRP.risk = mod; }
})(typeof self !== 'undefined' ? self : this, function (S) {
  'use strict';

  /** Fixed-fractional sizing: risk a fixed % of capital between entry and stop.
   *  Lots are rounded DOWN so the realised risk never exceeds the budget. */
  function positionSize({ capital, riskPct, entry, stop, lotSize = 1, marginPerLot = NaN }) {
    const errors = [];
    if (!(capital > 0)) errors.push('Capital must be positive.');
    if (!(riskPct > 0 && riskPct <= 100)) errors.push('Risk per trade must be between 0 and 100%.');
    if (!(entry > 0) || !(stop > 0)) errors.push('Entry and stop must be positive.');
    if (entry === stop) errors.push('Stop cannot equal entry.');
    if (!(lotSize >= 1)) errors.push('Lot size must be at least 1.');
    if (errors.length) return { errors };
    const budget = capital * riskPct / 100, perUnit = Math.abs(entry - stop);
    const perLot = perUnit * lotSize, lots = Math.floor(budget / perLot), units = lots * lotSize;
    const notional = units * entry;
    return {
      errors: [], side: entry > stop ? 'long' : 'short', budget, perUnit, perLot, lots, units,
      maxLoss: units * perUnit, notional, leverage: notional / capital,
      margin: Number.isFinite(marginPerLot) ? lots * marginPerLot : NaN,
      warning: lots === 0 ? 'Risk budget is smaller than the loss on one lot; the trade does not fit.' : null
    };
  }

  function riskReward({ entry, stop, target }) {
    const risk = Math.abs(entry - stop), reward = Math.abs(target - entry);
    const long = entry > stop;
    const consistent = long ? target > entry : target < entry;
    return { risk, reward, ratio: risk ? reward / risk : NaN, consistent, breakevenWinRate: risk + reward ? risk / (risk + reward) : NaN };
  }

  /** Historical VaR and ES at confidence c (e.g. 0.95). Reported as positive loss fractions. */
  function historicalVaR(returns, c = 0.95) {
    const r = S.clean(returns);
    if (r.length < 20) return { var: NaN, es: NaN, n: r.length };
    const q = S.quantile(r, 1 - c);
    const tail = r.filter(x => x <= q);
    return { var: -q, es: -S.mean(tail), n: r.length };
  }

  /** Parametric (normal) VaR: -(mu + z * sigma). z for 95% = -1.6449, 99% = -2.3263. */
  function parametricVaR(returns, c = 0.95) {
    const r = S.clean(returns), z = { 0.95: 1.6448536, 0.99: 2.3263479 }[c];
    if (r.length < 2 || !z) return NaN;
    return -(S.mean(r) - z * S.std(r));
  }

  function returnsFrom(prices) {
    const out = [];
    for (let i = 1; i < prices.length; i++) out.push(prices[i] / prices[i - 1] - 1);
    return out;
  }

  /** Close-to-close realised volatility, annualised (sqrt 252), on log returns over a trailing window. */
  function realisedVol(prices, window = 20) {
    const lr = prices.map((p, i) => (i ? Math.log(p / prices[i - 1]) : NaN));
    return lr.map((_, i) => (i < window ? NaN : S.std(lr.slice(i - window + 1, i + 1)) * Math.sqrt(252)));
  }

  /** Portfolio exposure. positions: [{name, qty (units, signed), price, delta (per unit, 1 for futures), underlying}] */
  function exposure(positions, capital) {
    let gross = 0, net = 0, deltaNotional = 0;
    const rows = positions.map(p => {
      const notional = p.qty * p.price;
      const dN = p.qty * (Number.isFinite(p.delta) ? p.delta : 1) * (p.underlying || p.price);
      gross += Math.abs(notional); net += notional; deltaNotional += dN;
      return { ...p, notional, deltaNotional: dN };
    });
    return { rows, gross, net, deltaNotional, grossLeverage: capital > 0 ? gross / capital : NaN, deltaLeverage: capital > 0 ? deltaNotional / capital : NaN };
  }

  return { positionSize, riskReward, historicalVaR, parametricVaR, returnsFrom, realisedVol, exposure };
});
