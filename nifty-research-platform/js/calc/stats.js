/* Descriptive statistics and performance helpers.
 * Pure functions, no DOM. Loaded as a browser global (NRP.stats) or a Node module.
 * Every function ignores null/NaN inputs only where stated; otherwise callers must clean data. */
(function (root, factory) {
  const mod = factory();
  if (typeof module === 'object' && module.exports) module.exports = mod;
  else { root.NRP = root.NRP || {}; root.NRP.stats = mod; }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const isNum = v => typeof v === 'number' && Number.isFinite(v);
  const clean = a => a.filter(isNum);

  function sum(a) { let s = 0; for (const v of a) s += v; return s; }
  function mean(a) { return a.length ? sum(a) / a.length : NaN; }

  function median(a) { return quantile(a, 0.5); }

  /** Linear-interpolation quantile (same as Excel PERCENTILE.INC / numpy default). */
  function quantile(a, p) {
    const s = clean(a).slice().sort((x, y) => x - y);
    if (!s.length) return NaN;
    const h = (s.length - 1) * p, lo = Math.floor(h), hi = Math.ceil(h);
    return s[lo] + (h - lo) * (s[hi] - s[lo]);
  }

  /** Sample standard deviation (n - 1). */
  function std(a) {
    const n = a.length;
    if (n < 2) return NaN;
    const m = mean(a);
    let ss = 0;
    for (const v of a) ss += (v - m) * (v - m);
    return Math.sqrt(ss / (n - 1));
  }

  /** Pearson correlation. Returns NaN when n < 3 or either series has zero variance. */
  function corr(x, y) {
    const n = Math.min(x.length, y.length);
    if (n < 3) return NaN;
    const mx = mean(x.slice(0, n)), my = mean(y.slice(0, n));
    let a = 0, b = 0, c = 0;
    for (let i = 0; i < n; i++) {
      const p = x[i] - mx, q = y[i] - my;
      a += p * q; b += p * p; c += q * q;
    }
    return b && c ? a / Math.sqrt(b * c) : NaN;
  }

  /** Residuals of v after removing a linear fit on control c (used to strip same-day momentum). */
  function residualize(v, c) {
    const mc = mean(c), mv = mean(v);
    let sxy = 0, sxx = 0;
    for (let i = 0; i < v.length; i++) { sxy += (c[i] - mc) * (v[i] - mv); sxx += (c[i] - mc) ** 2; }
    const b = sxx ? sxy / sxx : 0;
    return v.map((x, i) => x - mv - b * (c[i] - mc));
  }

  /** Deterministic PRNG (mulberry32) so permutation p-values are reproducible. */
  function rng(seed) {
    let s = seed >>> 0;
    return function () {
      s = (s + 0x6D2B79F5) >>> 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /** Two-sided permutation test for correlation. p = (k + 1) / (n + 1). */
  function permutationP(x, y, n = 3000, seed = 42) {
    const r0 = Math.abs(corr(x, y));
    if (!Number.isFinite(r0)) return NaN;
    const rand = rng(seed), z = y.slice();
    let k = 0;
    for (let i = 0; i < n; i++) {
      for (let j = z.length - 1; j > 0; j--) {
        const m = Math.floor(rand() * (j + 1));
        [z[j], z[m]] = [z[m], z[j]];
      }
      if (Math.abs(corr(x, z)) >= r0) k++;
    }
    return (k + 1) / (n + 1);
  }

  function zscore(v, sample) {
    const s = std(sample), m = mean(sample);
    return s ? (v - m) / s : NaN;
  }

  /** Share of sample values <= v, in [0, 1]. */
  function percentileRank(v, sample) {
    const s = clean(sample);
    if (!s.length) return NaN;
    return s.filter(x => x <= v).length / s.length;
  }

  /** Rolling statistic over a trailing window that ends at (and includes) index i. */
  function rolling(a, w, fn) {
    return a.map((_, i) => (i + 1 < w ? NaN : fn(a.slice(i + 1 - w, i + 1))));
  }

  /** Maximum drawdown of an equity (or price) curve. mdd is a negative fraction, e.g. -0.083. */
  function maxDrawdown(equity) {
    let peak = -Infinity, peakIdx = 0, mdd = 0, from = 0, to = 0;
    equity.forEach((v, i) => {
      if (!isNum(v)) return;
      if (v > peak) { peak = v; peakIdx = i; }
      const dd = v / peak - 1;
      if (dd < mdd) { mdd = dd; from = peakIdx; to = i; }
    });
    return { mdd, peakIdx: from, troughIdx: to };
  }

  /** Annualised volatility of simple periodic returns (fractions). */
  function annualVol(returns, periods = 252) { return std(returns) * Math.sqrt(periods); }

  /** Annualised Sharpe ratio with a per-period risk-free rate (default 0). */
  function sharpe(returns, periods = 252, rfPerPeriod = 0) {
    const ex = returns.map(r => r - rfPerPeriod), s = std(ex);
    return s ? (mean(ex) / s) * Math.sqrt(periods) : NaN;
  }

  return { isNum, clean, sum, mean, median, quantile, std, corr, residualize, rng, permutationP,
    zscore, percentileRank, rolling, maxDrawdown, annualVol, sharpe };
});
