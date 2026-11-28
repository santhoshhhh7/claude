# Methodology

This document lists every formula and assumption the application uses. Code references point to
`js/calc/*`. The unit tests in `tests/calc.test.js` exercise each function.

## 1. Data and timing

- All inputs are **end-of-day**. A row dated *t* holds values published after the 15:30 IST close of *t*.
- Modes: `HISTORICAL` (bundled file), `UPLOADED` (imported by you), `MODEL` (computed here).
- Forward-looking columns in the original export (`Next_Spot`, `NextDay_*`) are discarded at import
  (`normalize.js → summary`). Next-session moves are recomputed as S<sub>t+1</sub>/S<sub>t</sub> − 1 and
  are used only as outcomes, never as inputs.

## 2. Options chain (`options.js`)

| Quantity | Definition |
|---|---|
| PCR (OI) | Σ put OI ÷ Σ call OI for one expiry. The same ratio is shown on volume and on ΔOI when available |
| Max pain | argmin<sub>K ∈ strikes</sub> Σ<sub>k</sub> [ callOI<sub>k</sub> · max(0, K − k) + putOI<sub>k</sub> · max(0, k − K) ]. Ties go to the lower strike |
| Support / resistance (absolute) | Strike with the maximum put / call OI (the original dashboard's definition) |
| Support / resistance (nearest) | Maximum put OI at a strike ≤ spot / maximum call OI at a strike ≥ spot |
| Build-up | sign(ΔPrice), sign(ΔOI): (+,+) long build-up, (−,+) short build-up, (+,−) short covering, (−,−) long unwinding; either change being 0 or missing gives no signal |

Per-strike option build-up needs the closing price on two consecutive sessions for the same contract
(a bhavcopy import). The bundled strike file has no prices.

The bundled strike file covers a window of strikes around spot. Its max pain matches the original
pipeline on 4 of 5 dates. On 18 Nov 2026 it is 25,100 against 25,050, because far strikes are missing
from the window.

## 3. Greeks and implied volatility

Black-Scholes-Merton for European options with continuous rate *r* and dividend yield *q*:

```
d1 = [ln(S/K) + (r − q + σ²/2)·T] / (σ·√T),   d2 = d1 − σ·√T
Call = S·e^(−qT)·N(d1) − K·e^(−rT)·N(d2)
Put  = K·e^(−rT)·N(−d2) − S·e^(−qT)·N(−d1)
Δ_call = e^(−qT)·N(d1)          Δ_put = e^(−qT)·(N(d1) − 1)
Γ = e^(−qT)·n(d1) / (S·σ·√T)
Vega = S·e^(−qT)·n(d1)·√T / 100            (per 1 vol point)
Θ = annual theta / 365                      (per calendar day)
ρ = ±K·T·e^(−rT)·N(±d2) / 100               (per 1% rate)
```

- **T** is the number of calendar days from the trade date to expiry, divided by 365. Both dates are taken at the close, so T = 0 on expiry day and Greeks are undefined.
- **N(·)** uses Hart (1968) as given by West (2005), with |error| < 1e-14.
- **IV** is found by bisection on [0.01%, 500%]. A price at or below discounted intrinsic, or at or above the no-arbitrage upper bound, returns no IV, and the reason is shown.
- **Smile** uses the OTM IV at each strike: puts below spot, calls above. Skew is IV(0.98·S) − IV(1.02·S), linearly interpolated.
- **Net Γ × OI** is Σ (callOI·Γ<sub>call</sub> − putOI·Γ<sub>put</sub>)·S²/100. This sign convention is an assumption, because OI does not show who is long.
- **No option prices loaded:** Greeks use a flat σ equal to India VIX for that date. The panel says so and shows no smile.
- **Defaults:** r = 6.0% is a placeholder; check it against the 91-day T-bill (FBIL/RBI). q = 0.

## 4. Futures (`options.basis`)

```
basis = F − S          basis% = F/S − 1
annualised = basis% × 365 / DTE          implied carry = ln(F/S) / T   (≈ r − q)
```

The near-month contract is the earliest expiry on or after the trade date. Build-up is shown both
for that contract's own OI and for total OI across all expiries. The second view is neutral to
rollover.

## 5. Volatility and range

- VIX-implied one-day 1σ move = S × VIX/100 / √252 (trading-day convention).
- The range ladder shows ±0.5σ, ±1σ, ±1.5σ and ±2σ, with normal-model coverage 2N(k) − 1.
- Realised volatility = sample standard deviation of 20 daily log returns × √252.

## 6. Backtesting (`backtest.js`)

```
s_i  = signal from rows[0..i] only (∈ {−1, 0, +1}, or null during warm-up)
p_j  = s_{j−1−lag}                       position over close(j−1) → close(j)
r_j  = p_j · (S_j / S_{j−1} − 1) − |p_j − p_{j−1}| · c
```

- **lag = 1 (default):** a signal from the close of day *i* is acted on at the close of *i*+1.
- **c** is the cost per side in bps / 10⁴. An open position at the end of the sample is closed and the exit cost charged.
- **Skip expiry:** when set, signals generated on expiry day (DTE = 0) are forced flat.
- **Signals:**
  - PCR thresholds.
  - Spot versus max pain, with a neutral band.
  - VIX against its trailing *w*-session median, computed from rows i−w … i−1 and requiring at least 80% coverage.
  - Sign of the net OI change.
- **Metrics:**
  - total return and buy-and-hold return;
  - max drawdown of the equity curve;
  - annualised volatility (√252) and Sharpe (rf = 0);
  - day win rate over active sessions;
  - trade win rate, where a trade is a run of identical non-zero positions;
  - profit factor = Σ gains / Σ losses;
  - exposure and total cost.
- **Diagnostics (in-sample)**, all based on Pearson r between a feature at *t* and the move from *t* to *t*+1:
  - over the full sample and over each half separately;
  - excluding sessions within one day of expiry;
  - after regressing out the same-day move from both series;
  - with a two-sided permutation p-value, (k+1)/(N+1) over 3,000 seeded shuffles.
- **PCR buckets** use full-sample terciles and are labelled descriptive only.

## 7. Risk (`risk.js`)

```
lots     = floor( capital × risk% / (|entry − stop| × lot size) )
max loss = lots × lot size × |entry − stop|
R:R      = |target − entry| / |entry − stop|      break-even win rate = risk / (risk + reward)
VaR_c (historical) = −Q_{1−c}(returns)            ES_c = −mean(returns ≤ Q_{1−c})
VaR_c (parametric) = −(μ − z_c σ),  z_95 = 1.6449, z_99 = 2.3263
MDD = min_t ( P_t / max_{s≤t} P_s − 1 )
Exposure: notional = units × price; delta notional = units × delta × spot
```

Quantiles use linear interpolation, the same as Excel PERCENTILE.INC and the numpy default.

## 8. Payoff (`payoff.js`)

A leg is {type, side ±1, strike, premium, qty in units}. The expiry P/L is piecewise linear, with kinks
only at strikes. Max profit and max loss are evaluated at S = 0, at each strike, and from the slope
beyond the highest strike, so ±∞ is reported exactly. Breakevens are the zero crossings between
kinks. T+0 marks reprice each leg with BSM at the chosen σ and days to expiry. Covered call and
protective put use long NIFTY futures as the underlying leg.

## 9. Research insights

Each observation applies a fixed rule to the latest data and shows the inputs it used. The rules are:
- PCR percentile;
- spot versus max pain relative to the gap's standard deviation;
- nearest OI levels versus the VIX 1σ range;
- implied versus realised volatility;
- spot versus the 20D SMA;
- the latest ΔOI;
- the PCR predictive check (correlation and permutation p);
- FII/DII 5-day flows, when imported.

No text is generated by a language model.
