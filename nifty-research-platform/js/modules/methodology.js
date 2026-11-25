/* Methodology: formulas, conventions and known limitations, mirrored in docs/METHODOLOGY.md. */
(function (root) {
  'use strict';
  const NRP = root.NRP, U = NRP.ui, H = NRP.shared;

  const SECTIONS = [
    ['Data modes', [
      'HISTORICAL: end-of-day files bundled with the repository (exports from the original project pipeline, not independently verified).',
      'UPLOADED: end-of-day files you import. MODEL: values this app computes (Greeks, IV, VaR, payoffs, backtests).',
      'There is no LIVE or DELAYED feed. Every panel shows its mode, file and as-of date.']],
    ['Options chain', [
      'PCR = Σ put OI ÷ Σ call OI for the selected expiry (also on volume and on ΔOI where available).',
      'Max pain = argmin over strikes K of Σ_k [callOI_k · max(0, K − k) + putOI_k · max(0, k − K)]; ties go to the lower strike.',
      'Support / resistance (absolute) = strike with the largest put / call OI. Nearest = largest put OI at or below spot / call OI at or above spot.',
      'Build-up (per strike or futures): price↑OI↑ long build-up, price↓OI↑ short build-up, price↑OI↓ short covering, price↓OI↓ long unwinding.']],
    ['Greeks and IV', [
      'Black-Scholes-Merton with continuous r and q: d1 = [ln(S/K) + (r − q + σ²/2)T] / σ√T, d2 = d1 − σ√T.',
      'Theta per calendar day, vega and rho per 1 percentage point. T = calendar days ÷ 365.',
      'IV by bisection on [0.01%, 500%], rejected outside no-arbitrage bounds. Normal CDF: Hart (1968) / West (2005), |error| < 1e-14.']],
    ['Futures', ['Basis = F − S; % basis = F/S − 1; annualised = % basis × 365 / DTE; implied carry = ln(F/S)/T.']],
    ['Backtesting', [
      'Signal sᵢ uses data published at close i only; trailing medians for regime thresholds.',
      'Lag 1 (default): position held from close i+1 to close i+2. Lag 0 is available and labelled optimistic.',
      'r_j = p_j × (S_j/S_{j−1} − 1) − |p_j − p_{j−1}| × cost; final position closed and charged.',
      'Metrics: total return, buy-and-hold, max drawdown, annualised vol (√252), Sharpe (rf = 0), day and trade win rates, profit factor, exposure, costs.',
      'Diagnostics: Pearson r with the next-session move, split halves, ex-expiry, same-day move partialled out, permutation p (seeded).']],
    ['Risk', [
      'Position size = floor(capital × risk% ÷ (|entry − stop| × lot size)) lots.',
      'Historical VaR = −quantile(returns, 1 − c); ES = −mean(returns ≤ quantile). Parametric VaR = −(μ − zσ).',
      'Realised vol = st.dev of 20 daily log returns × √252. VIX daily 1σ = spot × VIX/100/√252.',
      'Max drawdown = min over t of (Pₜ / max_{s≤t} Pₛ − 1).']],
    ['Payoff', ['Expiry P/L is piecewise linear; max profit/loss and breakevens are solved exactly at the strikes and from the slope beyond the last strike. T+0 marks use BSM at the stated σ.']],
    ['Known limitations', [
      'Short sample (≈ 6 months) in the bundled summary: statistics are wide and in-sample.',
      'The bundled strike file covers 5 sessions and a strike window around spot; whole-chain totals differ from the daily summary.',
      'BANK NIFTY, FII/DII, participant OI, futures, option prices (IV) and announcements appear only after you import the corresponding files.',
      'Lot size, risk-free rate and costs are user assumptions that change over time.']]
  ];

  function render(el) {
    el.innerHTML = `<div class="grid g-2">${SECTIONS.map(([t, items], i) => U.panel({ title: t, code: 'M.' + (i + 1), body: `<ul class="plain">${items.map(x => `<li>${U.esc(x)}</li>`).join('')}</ul>` })).join('')}</div>
      <p class="note">Full derivations, worked examples and test references: <span class="mono">docs/METHODOLOGY.md</span> in the repository. Data sources: <span class="mono">docs/DATA_SOURCES.md</span>. ${H.srcLink('bhav')}</p>`;
  }

  NRP.modules.methodology = { title: 'Methodology', code: 'M', render, SECTIONS };
})(typeof self !== 'undefined' ? self : this);
