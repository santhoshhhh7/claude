/* Daily signal backtester for NIFTY using end-of-day positioning data.
 *
 * Timing model (see docs/METHODOLOGY.md, "Backtesting"):
 *   s[i]  = signal computed ONLY from rows[0..i] (data published after the close of day i).
 *   lag   = 0: position entered at the close of day i  (optimistic: EOD OI data is published after the close).
 *   lag   = 1: position entered at the close of day i+1 (realistic default).
 *   p[j]  = position held over the interval close(j-1) -> close(j) = s[j-1-lag].
 *   r[j]  = p[j] * mkt[j] - |p[j] - p[j-1]| * costPerSide, where mkt[j] = S[j]/S[j-1] - 1.
 * Thresholds that depend on a distribution (e.g. the VIX median) use a trailing window only. */
(function (root, factory) {
  const stats = (typeof module === 'object' && module.exports) ? require('./stats.js') : root.NRP.stats;
  const mod = factory(stats);
  if (typeof module === 'object' && module.exports) module.exports = mod;
  else { root.NRP = root.NRP || {}; root.NRP.backtest = mod; }
})(typeof self !== 'undefined' ? self : this, function (S) {
  'use strict';

  const num = v => (Number.isFinite(v) ? v : null);

  /** Signal factories. Each returns fn(rows, i) -> -1 | 0 | 1 | null (null = not computable yet). */
  const SIGNALS = {
    pcr: {
      label: 'PCR threshold',
      make: ({ field = 'pcrNear', hi = 1.2, lo = 0.8, posHigh = 1, posLow = -1 }) => (rows, i) => {
        const v = num(rows[i][field]);
        if (v === null) return null;
        return v > hi ? posHigh : v < lo ? posLow : 0;
      }
    },
    maxpain: {
      label: 'Spot vs Max Pain',
      make: ({ band = 0, posAbove = 1, posBelow = -1 }) => (rows, i) => {
        const r = rows[i];
        if (num(r.spot) === null || num(r.maxPain) === null) return null;
        const g = r.spot - r.maxPain;
        return g > band ? posAbove : g < -band ? posBelow : 0;
      }
    },
    vix: {
      label: 'India VIX regime (trailing median)',
      make: ({ window = 20, posHigh = 1, posLow = -1 }) => (rows, i) => {
        if (i < window || num(rows[i].vix) === null) return null;
        const hist = rows.slice(i - window, i).map(r => r.vix).filter(Number.isFinite);
        if (hist.length < Math.ceil(window * 0.8)) return null;
        return rows[i].vix > S.median(hist) ? posHigh : posLow;
      }
    },
    netoi: {
      label: 'Net OI change (put - call, nearest expiry)',
      make: ({ posPut = 1, posCall = -1 }) => (rows, i) => {
        const v = num(rows[i].netOiChg);
        if (v === null) return null;
        return v > 0 ? posPut : v < 0 ? posCall : 0;
      }
    }
  };

  function signalSeries(rows, fn, { skipExpiry = false } = {}) {
    return rows.map((r, i) => {
      if (skipExpiry && r.dte === 0) return 0;
      const s = fn(rows, i);
      return s === null ? null : s;
    });
  }

  function run(rows, signalFn, { lag = 1, costBpsPerSide = 3, skipExpiry = false } = {}) {
    const n = rows.length, c = costBpsPerSide / 10000;
    const sig = signalSeries(rows, signalFn, { skipExpiry });
    const mkt = rows.map((r, j) => (j === 0 ? NaN : r.spot / rows[j - 1].spot - 1));
    const pos = new Array(n).fill(0), strat = new Array(n).fill(0), cost = new Array(n).fill(0);
    let first = -1;
    for (let j = 1; j < n; j++) {
      const k = j - 1 - lag;
      const s = k >= 0 ? sig[k] : null;
      if (s === null || s === undefined) {
        if (first < 0) continue;      // still in warm-up
        pos[j] = 0;                   // data gap after warm-up: stay flat
      } else {
        if (first < 0) first = j;
        pos[j] = s;
      }
      cost[j] = Math.abs(pos[j] - pos[j - 1]) * c;
      strat[j] = pos[j] * mkt[j] - cost[j];
    }
    if (first < 0) return { error: 'Not enough data to generate any signal.' };
    // Close any open position at the end of the sample (conservative: exit cost charged).
    if (pos[n - 1] !== 0) { cost[n - 1] += Math.abs(pos[n - 1]) * c; strat[n - 1] -= Math.abs(pos[n - 1]) * c; }

    const idx = []; for (let j = first; j < n; j++) idx.push(j);
    const rS = idx.map(j => strat[j]), rM = idx.map(j => mkt[j]);
    const eq = [1], bh = [1];
    rS.forEach(r => eq.push(eq[eq.length - 1] * (1 + r)));
    rM.forEach(r => bh.push(bh[bh.length - 1] * (1 + r)));
    const active = idx.filter(j => pos[j] !== 0);
    const activeR = active.map(j => strat[j]);
    const wins = activeR.filter(r => r > 0), losses = activeR.filter(r => r < 0);

    // Trade episodes: consecutive intervals holding the same non-zero position.
    const trades = [];
    let cur = null;
    for (const j of idx) {
      if (pos[j] !== 0 && cur && cur.dir === pos[j]) { cur.ret = (1 + cur.ret) * (1 + strat[j]) - 1; cur.exit = rows[j].date; cur.days++; }
      else {
        if (cur) trades.push(cur);
        cur = pos[j] !== 0 ? { dir: pos[j], entry: rows[j - 1].date, exit: rows[j].date, days: 1, ret: strat[j] } : null;
      }
    }
    if (cur) trades.push(cur);
    const tWins = trades.filter(t => t.ret > 0);
    const gp = S.sum(wins), gl = -S.sum(losses);

    return {
      dates: [rows[first - 1].date, ...idx.map(j => rows[j].date)],
      equity: eq, buyHold: bh, positions: idx.map(j => pos[j]), signals: sig, returns: rS, trades,
      metrics: {
        sessions: idx.length,
        exposure: active.length / idx.length,
        totalReturn: eq[eq.length - 1] - 1,
        buyHoldReturn: bh[bh.length - 1] - 1,
        annVol: S.annualVol(rS),
        sharpe: S.sharpe(rS),
        maxDrawdown: S.maxDrawdown(eq).mdd,
        buyHoldMaxDrawdown: S.maxDrawdown(bh).mdd,
        activeDays: active.length,
        dayWinRate: active.length ? wins.length / active.length : NaN,
        trades: trades.length,
        tradeWinRate: trades.length ? tWins.length / trades.length : NaN,
        avgWin: wins.length ? S.mean(wins) : NaN,
        avgLoss: losses.length ? S.mean(losses) : NaN,
        profitFactor: gl > 0 ? gp / gl : NaN,
        totalCost: S.sum(idx.map(j => cost[j])),
        firstDate: rows[first - 1].date, lastDate: rows[n - 1].date
      }
    };
  }

  /** In-sample diagnostics preserved from the original "Signals" tab: correlation of a feature with the
   *  next session's move, split halves, ex-expiry, and with the same-day move partialled out. */
  function diagnostics(rows, field, { perms = 3000, seed = 42 } = {}) {
    const ok = [];
    for (let i = 1; i < rows.length - 1; i++) {
      const v = rows[i][field];
      if (!Number.isFinite(v)) continue;
      ok.push({ x: v, y: rows[i + 1].spot / rows[i].spot - 1, c: rows[i].spot / rows[i - 1].spot - 1, dte: rows[i].dte });
    }
    const x = ok.map(o => o.x), y = ok.map(o => o.y), c = ok.map(o => o.c), h = ok.length >> 1;
    const ex = ok.filter(o => o.dte > 1);
    return {
      n: ok.length,
      all: S.corr(x, y), h1: S.corr(x.slice(0, h), y.slice(0, h)), h2: S.corr(x.slice(h), y.slice(h)),
      exExpiry: S.corr(ex.map(o => o.x), ex.map(o => o.y)),
      sameDayRemoved: S.corr(S.residualize(x, c), S.residualize(y, c)),
      p: S.permutationP(x, y, perms, seed)
    };
  }

  return { SIGNALS, signalSeries, run, diagnostics };
});
