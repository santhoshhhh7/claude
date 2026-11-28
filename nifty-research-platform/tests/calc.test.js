/* Run: node --test tests/   (Node 18+, no dependencies) */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const S = require('../js/calc/stats.js');
const O = require('../js/calc/options.js');
const P = require('../js/calc/payoff.js');
const B = require('../js/calc/backtest.js');
const R = require('../js/calc/risk.js');
const csv = require('../js/data/csv.js');
const N = require('../js/data/normalize.js');

const close = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg || ''} expected ${b}, got ${a}`);
const load = f => fs.readFileSync(path.join(__dirname, '..', 'data', f), 'utf8');

// ---------------- statistics ----------------
test('stats: mean, median, sample std, quantile', () => {
  const a = [2, 4, 4, 4, 5, 5, 7, 9];
  assert.equal(S.mean(a), 5);
  assert.equal(S.median(a), 4.5);
  close(S.std(a), 2.138089935, 1e-9, 'sample std');
  assert.equal(S.quantile([1, 2, 3, 4], 0.25), 1.75); // Excel PERCENTILE.INC
});

test('stats: correlation of perfectly linear series is 1 / -1; constant series gives NaN', () => {
  close(S.corr([1, 2, 3, 4], [2, 4, 6, 8]), 1, 1e-12);
  close(S.corr([1, 2, 3, 4], [8, 6, 4, 2]), -1, 1e-12);
  assert.ok(Number.isNaN(S.corr([1, 2, 3], [5, 5, 5])));
});

test('stats: max drawdown', () => {
  const r = S.maxDrawdown([100, 120, 90, 95, 130, 117]);
  close(r.mdd, -0.25, 1e-12, '120 -> 90');
  assert.equal(r.peakIdx, 1); assert.equal(r.troughIdx, 2);
});

test('stats: permutation p-value is reproducible and small for a strong relationship', () => {
  const x = Array.from({ length: 40 }, (_, i) => i), y = x.map(v => v * 2 + (v % 3));
  const p1 = S.permutationP(x, y, 500, 7), p2 = S.permutationP(x, y, 500, 7);
  assert.equal(p1, p2);
  assert.ok(p1 < 0.01);
});

// ---------------- Black-Scholes ----------------
// Reference: Hull, Options Futures and Other Derivatives; S=100, K=100, T=1, r=5%, sigma=20%, q=0.
test('options: normal CDF reference values', () => {
  close(O.normCdf(0), 0.5, 1e-15);
  close(O.normCdf(1.96), 0.9750021048517795, 1e-12);
  close(O.normCdf(-1), 0.15865525393145707, 1e-12);
});

test('options: BSM call/put prices and put-call parity', () => {
  const c = O.bsm({ S: 100, K: 100, T: 1, r: 0.05, sigma: 0.2, type: 'call' });
  const p = O.bsm({ S: 100, K: 100, T: 1, r: 0.05, sigma: 0.2, type: 'put' });
  close(c.price, 10.450583572185565, 1e-9, 'call');
  close(p.price, 5.573526022256971, 1e-9, 'put');
  close(c.price - p.price, 100 - 100 * Math.exp(-0.05), 1e-9, 'parity');
});

test('options: BSM Greeks (vega per 1 vol pt, theta per calendar day)', () => {
  const c = O.bsm({ S: 100, K: 100, T: 1, r: 0.05, sigma: 0.2, type: 'call' });
  const p = O.bsm({ S: 100, K: 100, T: 1, r: 0.05, sigma: 0.2, type: 'put' });
  close(c.delta, 0.6368306511756191, 1e-9, 'call delta');
  close(p.delta, -0.3631693488243809, 1e-9, 'put delta');
  close(c.gamma, 0.018762017345846895, 1e-10, 'gamma');
  close(c.vega, 0.3752403469169379, 1e-9, 'vega');
  close(c.theta * 365, -6.414027546438197, 1e-8, 'call theta / yr');
  close(p.theta * 365, -1.657880423934626, 1e-8, 'put theta / yr');
  close(c.rho, 0.5323248154537634, 1e-9, 'call rho per 1%');
});

test('options: Greeks match finite differences', () => {
  const base = { S: 24000, K: 24200, T: 6 / 365, r: 0.065, q: 0.012, sigma: 0.14, type: 'put' };
  const f = o => O.bsm({ ...base, ...o }).price, g = O.bsm(base), h = 0.5;
  close(g.delta, (f({ S: base.S + h }) - f({ S: base.S - h })) / (2 * h), 1e-5, 'delta');
  close(g.gamma, (f({ S: base.S + h }) - 2 * f({}) + f({ S: base.S - h })) / (h * h), 1e-5, 'gamma');
  close(g.vega, (f({ sigma: base.sigma + 1e-4 }) - f({ sigma: base.sigma - 1e-4 })) / (2e-4) / 100, 1e-6, 'vega');
});

test('options: implied volatility round-trips and rejects arbitrage violations', () => {
  for (const sigma of [0.08, 0.15, 0.35, 0.9]) for (const type of ['call', 'put']) {
    const price = O.bsm({ S: 24000, K: 24500, T: 0.02, r: 0.065, sigma, type }).price;
    close(O.impliedVol({ price, S: 24000, K: 24500, T: 0.02, r: 0.065, type }).iv, sigma, 1e-6, `${type} ${sigma}`);
  }
  assert.equal(O.impliedVol({ price: 50, S: 24000, K: 23000, T: 0.02, r: 0.065, type: 'call' }).iv, null);
  assert.equal(O.impliedVol({ price: 10, S: 24000, K: 24000, T: 0, r: 0.065, type: 'call' }).reason, 'expired');
});

// ---------------- chain analytics ----------------
test('options: max pain on a hand-checked chain', () => {
  // Pain at 100: puts 110->10*30=300, 120->20*10=200 => 500; calls 0. At 110: calls 100->10*20=200; puts 120->10*10=100 => 300.
  // At 120: calls 100->20*20=400, 110->10*5=50 => 450. Minimum is 110.
  const rows = [{ strike: 100, callOI: 20, putOI: 5 }, { strike: 110, callOI: 5, putOI: 30 }, { strike: 120, callOI: 40, putOI: 10 }];
  const mp = O.maxPain(rows);
  assert.equal(mp.strike, 110);
  assert.deepEqual(mp.curve.map(c => c.pain), [500, 300, 450]);
});

test('options: max pain reproduces the original pipeline on bundled strike data', () => {
  const sum = N.convert({ ...csv.parse(load('nifty_pcr_maxpain.csv')) }).data;
  const so = N.convert({ ...csv.parse(load('nifty_strike_oi.csv')) }).data.options;
  const dates = [...new Set(so.map(r => r.date))];
  assert.ok(dates.length >= 5);
  let exact = 0;
  for (const d of dates) {
    const s = sum.find(r => r.date === d);
    const rows = so.filter(r => r.date === d && r.expiry === s.expiry);
    // The original pipeline used the full chain; the strike file is a window around spot. Strikes outside the
    // window can move max pain by one step (observed on 2026-11-18: 25,100 from the window vs 25,050 full chain).
    const mp = O.maxPain(rows).strike;
    assert.ok(Math.abs(mp - s.maxPain) <= 50, `max pain ${d}: ${mp} vs ${s.maxPain}`);
    if (mp === s.maxPain) exact++;
    // The strike file is a strike WINDOW, so its PCR is not the full-chain PCR. The summary's PCR must equal
    // its own full-chain totals, and the windowed call OI must not exceed the full-chain call OI.
    close(s.putOiNear / s.callOiNear, s.pcrNear, 0.0006, `full-chain PCR ${d}`);
    assert.ok(rows.reduce((a, r) => a + r.callOI, 0) <= s.callOiNear, `window is a subset ${d}`);
    const lv = O.oiLevels(rows, s.spot);
    assert.equal(lv.supportAbs, s.support, `support ${d}`);
    assert.equal(lv.resistanceAbs, s.resistance, `resistance ${d}`);
  }
  assert.ok(exact >= dates.length - 1, `exact max-pain matches: ${exact}/${dates.length}`);
});

test('options: build-up classification quadrants', () => {
  assert.equal(O.classifyBuildup(1, 1), 'Long build-up');
  assert.equal(O.classifyBuildup(-1, 1), 'Short build-up');
  assert.equal(O.classifyBuildup(1, -1), 'Short covering');
  assert.equal(O.classifyBuildup(-1, -1), 'Long unwinding');
  assert.equal(O.classifyBuildup(0, 5), 'No clear signal');
});

test('options: futures basis', () => {
  const b = O.basis(24120, 24000, 30 / 365);
  close(b.pts, 120, 1e-9); close(b.pct, 0.005, 1e-12); close(b.annualised, 0.005 * 365 / 30, 1e-12);
});

// ---------------- strategy payoff ----------------
test('payoff: bull call spread max profit, max loss, breakeven', () => {
  const legs = [{ type: 'call', side: 1, strike: 24000, premium: 150, qty: 65 }, { type: 'call', side: -1, strike: 24200, premium: 70, qty: 65 }];
  const a = P.analyze(legs);
  close(a.maxLoss, -80 * 65, 1e-9); close(a.maxProfit, 120 * 65, 1e-9);
  assert.deepEqual(a.breakevens, [24080]);
  close(a.netPremium, 80 * 65, 1e-9);
});

test('payoff: long call has unlimited upside; long put max profit is K - premium', () => {
  const c = P.analyze([{ type: 'call', side: 1, strike: 100, premium: 5, qty: 1 }]);
  assert.equal(c.maxProfit, Infinity); assert.equal(c.maxLoss, -5); assert.deepEqual(c.breakevens, [105]);
  const p = P.analyze([{ type: 'put', side: 1, strike: 100, premium: 5, qty: 1 }]);
  assert.equal(p.maxProfit, 95); assert.equal(p.maxLoss, -5); assert.deepEqual(p.breakevens, [95]);
});

test('payoff: covered call and protective put', () => {
  const cc = P.analyze([{ type: 'underlying', side: 1, strike: 100, qty: 1 }, { type: 'call', side: -1, strike: 110, premium: 3, qty: 1 }]);
  assert.equal(cc.maxProfit, 13); assert.equal(cc.maxLoss, -97); assert.deepEqual(cc.breakevens, [97]);
  const pp = P.analyze([{ type: 'underlying', side: 1, strike: 100, qty: 1 }, { type: 'put', side: 1, strike: 95, premium: 2, qty: 1 }]);
  assert.equal(pp.maxProfit, Infinity); assert.equal(pp.maxLoss, -7); assert.deepEqual(pp.breakevens, [102]);
});

// ---------------- backtest ----------------
const synth = n => Array.from({ length: n }, (_, i) => ({ date: `2026-01-${String(i + 1).padStart(2, '0')}`, spot: 100 * (1 + 0.01 * Math.sin(i)), pcrNear: 0.6 + (i % 5) * 0.2, vix: 12 + (i % 7), dte: i % 5, maxPain: 100, netOiChg: i % 2 ? 1 : -1 }));

test('backtest: no look-ahead — changing future rows never changes past signals or past P&L', () => {
  const rows = synth(31), fn = B.SIGNALS.vix.make({ window: 10 });
  const a = B.run(rows, fn, { lag: 1, costBpsPerSide: 3 });
  const mutated = rows.map((r, i) => (i > 20 ? { ...r, vix: 99, spot: r.spot * 1.5, pcrNear: 9 } : r));
  const b = B.run(mutated, fn, { lag: 1, costBpsPerSide: 3 });
  for (let i = 0; i <= 20; i++) assert.equal(a.signals[i], b.signals[i], `signal ${i}`);
  // Equity through day 21 depends only on prices up to day 21.
  const k = a.dates.indexOf('2026-01-21');
  for (let i = 0; i <= k; i++) close(a.equity[i], b.equity[i], 1e-15, `equity ${i}`);
});

test('backtest: P&L accounting with lag and costs matches a hand calculation', () => {
  const rows = [100, 101, 99, 102].map((s, i) => ({ date: `d${i}`, spot: s, pcrNear: [1.5, 1.5, 0.5, 1.0][i] }));
  const fn = B.SIGNALS.pcr.make({ field: 'pcrNear', hi: 1.2, lo: 0.8, posHigh: 1, posLow: -1 });
  // signals: [1, 1, -1, 0]. lag 0: p1=1, p2=1, p3=-1.
  const r = B.run(rows, fn, { lag: 0, costBpsPerSide: 10 });
  const c = 0.001, m1 = 0.01, m2 = 99 / 101 - 1, m3 = 102 / 99 - 1;
  const exp = [m1 - c, m2, -m3 - 2 * c - c]; // flip costs 2 sides; final exit 1 side
  r.returns.forEach((x, i) => close(x, exp[i], 1e-12, `day ${i}`));
  // lag 1: p2 = s0 = 1, p3 = s1 = 1
  const r1 = B.run(rows, fn, { lag: 1, costBpsPerSide: 10 });
  close(r1.returns[0], m2 - c, 1e-12); close(r1.returns[1], m3 - c, 1e-12);
});

test('backtest: VIX regime uses a trailing median only', () => {
  const rows = synth(25), fn = B.SIGNALS.vix.make({ window: 10 });
  assert.equal(fn(rows, 5), null, 'warm-up');
  const hist = rows.slice(2, 12).map(r => r.vix).sort((a, b) => a - b);
  const med = (hist[4] + hist[5]) / 2;
  assert.equal(fn(rows, 12), rows[12].vix > med ? 1 : -1);
});

// ---------------- risk ----------------
test('risk: fixed-fractional position sizing rounds lots down', () => {
  const r = R.positionSize({ capital: 1000000, riskPct: 1, entry: 24000, stop: 23900, lotSize: 65 });
  assert.equal(r.lots, 1); // 10,000 budget / (100 * 65 = 6,500 per lot)
  assert.equal(r.maxLoss, 6500); assert.equal(r.side, 'long');
  assert.ok(R.positionSize({ capital: 0, riskPct: 1, entry: 1, stop: 2 }).errors.length);
});

test('risk: risk-reward and historical VaR / ES', () => {
  const rr = R.riskReward({ entry: 100, stop: 95, target: 115 });
  assert.equal(rr.ratio, 3); close(rr.breakevenWinRate, 0.25, 1e-12);
  const rets = Array.from({ length: 100 }, (_, i) => (i - 50) / 1000); // -0.05 .. 0.049
  const v = R.historicalVaR(rets, 0.95);
  close(v.var, -S.quantile(rets, 0.05), 1e-12);
  assert.ok(v.es >= v.var);
});

// ---------------- data parsing ----------------
test('csv: quoted fields, escaped quotes, CRLF, BOM and title lines', () => {
  const t = '\uFEFFReport as on Jul 08, 2024\r\n"Client Type","Future Index Long"\r\n"FII","1,234"\r\n';
  const p = csv.parse(t, c => c.includes('Client Type'));
  assert.equal(p.skipped, 1); assert.equal(p.rows[0]['Future Index Long'], '1,234');
  assert.deepEqual(csv.parseRows('a,"b ""x"", y"\n'), [['a', 'b "x", y']]);
});

test('normalize: date formats', () => {
  for (const [i, o] of [['2026-11-20', '2026-11-20'], ['20-Nov-2026', '2026-11-20'], ['20-NOV-26', '2026-11-20'], ['20/11/2026', '2026-11-20'], ['Nov 20, 2026', '2026-11-20'], ['20261120', '2026-11-20']]) assert.equal(N.date(i), o, i);
});

test('normalize: NSE UDiFF bhavcopy pairs CE/PE and keeps index futures', () => {
  const t = ['TradDt,BizDt,Sgmt,Src,FinInstrmTp,FinInstrmId,ISIN,TckrSymb,SctySrs,XpryDt,FininstrmActlXpryDt,StrkPric,OptnTp,FinInstrmNm,OpnPric,HghPric,LwPric,ClsPric,LastPric,PrvsClsgPric,UndrlygPric,SttlmPric,OpnIntrst,ChngInOpnIntrst,TtlTradgVol',
    '2026-11-20,2026-11-20,FO,NSE,IDO,1,,NIFTY,,2026-11-23,2026-11-23,25800,CE,x,0,0,0,120.5,0,100,25800.6,120.5,6500,650,99000',
    '2026-11-20,2026-11-20,FO,NSE,IDO,2,,NIFTY,,2026-11-23,2026-11-23,25800,PE,x,0,0,0,110.2,0,130,25800.6,110.2,3250,-65,88000',
    '2026-11-20,2026-11-20,FO,NSE,IDF,3,,NIFTY,,2026-11-25,2026-11-25,,,x,0,0,0,25850,0,25700,25800.6,25850,1000000,20000,5000',
    '2026-11-20,2026-11-20,FO,NSE,STO,4,,RELIANCE,,2026-11-25,2026-11-25,1500,CE,x,0,0,0,10,0,9,1490,10,1000,0,10'].join('\n');
  const res = N.convert(csv.parse(t));
  assert.equal(res.kind, 'bhav_udiff');
  assert.equal(res.data.options.length, 1);
  const o = res.data.options[0];
  assert.equal(o.callOI, 6500); assert.equal(o.putOI, 3250); assert.equal(o.callLtp, 120.5); assert.equal(o.underlying, 25800.6);
  assert.equal(res.data.futures.length, 1); assert.equal(res.data.futures[0].chgOi, 20000);
});

test('normalize: NSE FII/DII cash file', () => {
  const t = '"Category","Date","Buy Value","Sell Value","Net Value"\n"DII **","20-Nov-2026","12,000.5","10,000.25","2,000.25"\n"FII/FPI *","20-Nov-2026","9,000","11,500","-2,500"';
  const r = N.convert(csv.parse(t));
  assert.equal(r.kind, 'fiidii');
  assert.deepEqual([r.data[0].fiiNet, r.data[0].diiNet], [-2500, 2000.25]);
});

test('normalize: summary drops forward-looking columns', () => {
  const r = N.convert(csv.parse(load('nifty_pcr_maxpain.csv')));
  assert.equal(r.kind, 'summary');
  assert.ok(!('nextDayMove' in r.data[0]) && !('nextSpot' in r.data[0]));
  assert.ok(r.warnings[0].includes('Forward-looking'));
  assert.equal(r.data.length, 124);
});
