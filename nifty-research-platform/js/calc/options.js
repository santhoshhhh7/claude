/* Options mathematics: Black-Scholes-Merton pricing and Greeks, implied volatility,
 * max pain, PCR, OI-based support/resistance and price/OI build-up classification.
 * Conventions (documented in docs/METHODOLOGY.md):
 *   - T is in years on a 365-day calendar basis; EOD data is treated as the 15:30 IST close.
 *   - r and q are continuously compounded annual rates expressed as fractions (0.065 = 6.5%).
 *   - Vega and rho are reported per 1 percentage point; theta per calendar day. */
(function (root, factory) {
  const mod = factory();
  if (typeof module === 'object' && module.exports) module.exports = mod;
  else { root.NRP = root.NRP || {}; root.NRP.options = mod; }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /** Standard normal CDF, Hart (1968) double-precision algorithm as given by West (2005). |error| < 1e-14. */
  function normCdf(x) {
    const ax = Math.abs(x);
    let c;
    if (ax > 37) c = 0;
    else {
      const e = Math.exp(-ax * ax / 2);
      if (ax < 7.07106781186547) {
        let b = 3.52624965998911e-2 * ax + 0.700383064443688;
        b = b * ax + 6.37396220353165; b = b * ax + 33.912866078383; b = b * ax + 112.079291497871;
        b = b * ax + 221.213596169931; b = b * ax + 220.206867912376;
        c = e * b;
        b = 8.83883476483184e-2 * ax + 1.75566716318264;
        b = b * ax + 16.064177579207; b = b * ax + 86.7807322029461; b = b * ax + 296.564248779674;
        b = b * ax + 637.333633378831; b = b * ax + 793.826512519948; b = b * ax + 440.413735824752;
        c /= b;
      } else {
        let b = ax + 0.65; b = ax + 4 / b; b = ax + 3 / b; b = ax + 2 / b; b = ax + 1 / b;
        c = e / b / 2.506628274631;
      }
    }
    return x > 0 ? 1 - c : c;
  }
  const normPdf = x => Math.exp(-x * x / 2) / Math.sqrt(2 * Math.PI);

  function intrinsic(type, S, K) { return type === 'call' ? Math.max(0, S - K) : Math.max(0, K - S); }

  /** Black-Scholes-Merton price and Greeks for a European option.
   *  Returns null for invalid inputs. With T <= 0 only the intrinsic value is returned. */
  function bsm({ S, K, T, r = 0, q = 0, sigma, type = 'call' }) {
    if (!(S > 0 && K > 0) || !Number.isFinite(T)) return null;
    if (T <= 0) return { price: intrinsic(type, S, K), delta: NaN, gamma: NaN, vega: NaN, theta: NaN, rho: NaN, d1: NaN, d2: NaN, expired: true };
    if (!(sigma > 0)) return null;
    const sT = Math.sqrt(T), d1 = (Math.log(S / K) + (r - q + sigma * sigma / 2) * T) / (sigma * sT), d2 = d1 - sigma * sT;
    const dq = Math.exp(-q * T), dr = Math.exp(-r * T), nd1 = normPdf(d1);
    const isCall = type === 'call';
    const price = isCall ? S * dq * normCdf(d1) - K * dr * normCdf(d2) : K * dr * normCdf(-d2) - S * dq * normCdf(-d1);
    const delta = isCall ? dq * normCdf(d1) : dq * (normCdf(d1) - 1);
    const gamma = dq * nd1 / (S * sigma * sT);
    const vega = S * dq * nd1 * sT / 100;
    const thetaYr = isCall
      ? -S * dq * nd1 * sigma / (2 * sT) - r * K * dr * normCdf(d2) + q * S * dq * normCdf(d1)
      : -S * dq * nd1 * sigma / (2 * sT) + r * K * dr * normCdf(-d2) - q * S * dq * normCdf(-d1);
    const rho = (isCall ? K * T * dr * normCdf(d2) : -K * T * dr * normCdf(-d2)) / 100;
    return { price, delta, gamma, vega, theta: thetaYr / 365, rho, d1, d2, expired: false };
  }

  /** Implied volatility by bisection on [0.0001, 5]. Returns {iv, reason}. iv is null when the
   *  price violates no-arbitrage bounds or the option has expired. */
  function impliedVol({ price, S, K, T, r = 0, q = 0, type = 'call' }) {
    if (!(price > 0) || !(S > 0) || !(K > 0)) return { iv: null, reason: 'missing price' };
    if (!(T > 0)) return { iv: null, reason: 'expired' };
    const dq = Math.exp(-q * T), dr = Math.exp(-r * T);
    const lower = type === 'call' ? Math.max(0, S * dq - K * dr) : Math.max(0, K * dr - S * dq);
    const upper = type === 'call' ? S * dq : K * dr;
    if (price <= lower + 1e-9) return { iv: null, reason: 'price at or below discounted intrinsic' };
    if (price >= upper) return { iv: null, reason: 'price above no-arbitrage upper bound' };
    let lo = 1e-4, hi = 5;
    const f = s => bsm({ S, K, T, r, q, sigma: s, type }).price - price;
    if (f(hi) < 0) return { iv: null, reason: 'IV above 500%' };
    if (f(lo) > 0) return { iv: lo, reason: 'IV below 0.01%' };
    for (let i = 0; i < 200 && hi - lo > 1e-8; i++) {
      const mid = (lo + hi) / 2;
      if (f(mid) > 0) hi = mid; else lo = mid;
    }
    return { iv: (lo + hi) / 2, reason: null };
  }

  /** Calendar days between two ISO dates (YYYY-MM-DD), as a year fraction on a 365-day basis. */
  function yearFraction(tradeDate, expiryDate) {
    const d = (Date.parse(expiryDate + 'T00:00:00Z') - Date.parse(tradeDate + 'T00:00:00Z')) / 86400000;
    return d / 365;
  }

  /** Max pain: the settlement strike that minimises the total intrinsic value paid to option holders.
   *  rows: [{strike, callOI, putOI}] for ONE expiry. Ties resolve to the lower strike. */
  function maxPain(rows) {
    const rs = rows.filter(r => Number.isFinite(r.strike)).sort((a, b) => a.strike - b.strike);
    if (!rs.length) return null;
    let best = null;
    const curve = rs.map(({ strike: K }) => {
      let pain = 0;
      for (const r of rs) pain += (r.callOI || 0) * Math.max(0, K - r.strike) + (r.putOI || 0) * Math.max(0, r.strike - K);
      if (!best || pain < best.pain) best = { strike: K, pain };
      return { strike: K, pain };
    });
    return { strike: best.strike, pain: best.pain, curve };
  }

  /** Put-call ratio of a field (default open interest). NaN when call total is zero. */
  function pcr(rows, callKey = 'callOI', putKey = 'putOI') {
    let c = 0, p = 0;
    for (const r of rows) { c += r[callKey] || 0; p += r[putKey] || 0; }
    return c ? p / c : NaN;
  }

  /** OI-based levels. "Absolute" = strike with the largest OI anywhere (the original dashboard's
   *  definition). "Nearest" = largest put OI at or below spot / largest call OI at or above spot. */
  function oiLevels(rows, spot) {
    const top = (arr, key) => arr.reduce((b, r) => ((r[key] || 0) > (b ? b[key] || 0 : -1) ? r : b), null);
    const below = rows.filter(r => r.strike <= spot), above = rows.filter(r => r.strike >= spot);
    const sA = top(rows, 'putOI'), rA = top(rows, 'callOI'), sN = top(below, 'putOI'), rN = top(above, 'callOI');
    return {
      supportAbs: sA && sA.strike, resistanceAbs: rA && rA.strike,
      supportNear: sN && sN.strike, resistanceNear: rN && rN.strike,
      supportNearOI: sN && sN.putOI, resistanceNearOI: rN && rN.callOI
    };
  }

  /** Price/OI quadrant. Uses the sign of each change; zero change on either axis is "No clear signal". */
  function classifyBuildup(priceChange, oiChange) {
    if (!Number.isFinite(priceChange) || !Number.isFinite(oiChange) || priceChange === 0 || oiChange === 0) return 'No clear signal';
    if (priceChange > 0 && oiChange > 0) return 'Long build-up';
    if (priceChange < 0 && oiChange > 0) return 'Short build-up';
    if (priceChange > 0 && oiChange < 0) return 'Short covering';
    return 'Long unwinding';
  }

  /** Futures basis: absolute points, % of spot, and annualised % (simple, 365-day). */
  function basis(futures, spot, T) {
    if (!(futures > 0 && spot > 0)) return null;
    const pts = futures - spot, pct = pts / spot;
    return { pts, pct, annualised: T > 0 ? pct / T : NaN, impliedCarry: T > 0 ? Math.log(futures / spot) / T : NaN };
  }

  return { normCdf, normPdf, intrinsic, bsm, impliedVol, yearFraction, maxPain, pcr, oiLevels, classifyBuildup, basis };
});
