# NIFTY Research Terminal

A browser-based research workstation for Indian index derivatives. It runs on end-of-day NSE data
and is written in plain HTML, CSS and JavaScript with no build step. All calculations are unit-tested,
and every number on screen is labelled with its data mode, source file and as-of date.

It grew out of a single-file NIFTY PCR / max-pain dashboard. That dashboard's analytics (range ladder,
conditional next-day statistics, correlation and permutation tests) are kept here, and its look-ahead
problems are fixed (see [Backtesting](#backtesting-safeguards)).

> Research and education only. Not investment advice.

## Modules

| Code | Module | What it does | Data it needs |
|---|---|---|---|
| I | Market Overview | NIFTY 50, India VIX percentile, PCR, max pain gap, OI support and resistance, 20D trend, VIX-implied range ladder, conditional next-session history, BANK NIFTY, breadth | Daily summary (bundled); NIFTY BANK history and breadth when imported |
| A | Options Chain | Strike-wise OI, ΔOI, volume, LTP, PCR (OI, volume, ΔOI), max pain curve, absolute and nearest support/resistance, per-strike build-up, expiry-wise comparison, daily OI build-up history | Strike OI (bundled, 5 sessions) or NSE F&O bhavcopy |
| B | Greeks & IV | Black-Scholes-Merton calculator and IV solver, strike-wise Greeks, IV smile, 98%/102% skew, net gamma × OI | Option prices from a bhavcopy for IV; otherwise a flat σ equal to India VIX, labelled MODEL |
| C | Futures & OI | Basis (points, %, annualised), implied carry, term structure, long/short build-up, short covering, long unwinding, spot vs futures | Index futures rows from a bhavcopy |
| D | FII / DII | Cash-market flows and cumulative totals, participant-wise index futures/options positioning | NSE FII/DII and participant OI files |
| E | Market Intelligence | Links to primary sources (NSE, BSE, RBI, SEBI, FBIL), imported announcements and corporate actions with timestamps and links, sourced user notes | Announcement / corporate-action CSVs; notes require an http(s) source |
| F | Backtesting | PCR, max-pain, VIX-regime and net-OI signals; execution lag; per-side costs; equity, drawdown, win rates, profit factor, trade log; in-sample diagnostics and PCR buckets | Daily summary |
| G | Risk Management | Fixed-fractional sizing, max loss, reward:risk, historical and parametric VaR/ES, realised vs implied vol, max drawdown, editable exposure table | Daily summary |
| H | Payoff Simulator | Long Call, Long Put, Bull Call Spread, Bear Put Spread, Covered Call, Protective Put; editable legs; expiry and T+0 curves; exact breakevens; scenario table | Chain prices if loaded, else BSM premiums (MODEL) |
| J | Research Insights | Rule-based observations, each with its evidence, formula and source dataset | Daily summary (+ strike OI, flows) |
| — | Data & Import | CSV/XLSX import with type detection, source register, assumptions, templates | — |
| — | Methodology | Formulas and limitations in the app | — |

**Report**: the header button downloads a self-contained HTML research note (provenance, snapshot,
insights, backtest, risk, methodology, inline SVG charts). It opens offline and prints to PDF.

## Data honesty

| Badge | Meaning |
|---|---|
| `HISTORICAL · EOD` | End-of-day file bundled in `data/` (exports from the original project's pipeline, not independently verified) |
| `UPLOADED · EOD` | A file you imported; kept in your browser's localStorage, never sent anywhere |
| `MODEL` | Computed by the app (Greeks, IV, VaR, payoffs, backtests) under stated assumptions |

The app has **no live or delayed feed**, and the header says so. Modules whose data is missing show an
empty state that links to the official download page. They never fall back to sample numbers.

## Run it

```bash
git clone https://github.com/santhoshhhh7/claude.git
cd claude/nifty-research-platform
# open index.html in a browser (works from file://), or serve the folder:
python3 -m http.server 8000   # then http://localhost:8000
```

Chart.js 4.4.1 loads from jsDelivr, the same as in the original dashboard. Offline, the tables and
calculations still work and the charts are hidden with a notice. SheetJS loads only the first time you
import an Excel file.

## Updating data

1. Download files from the official sources listed in [docs/DATA_SOURCES.md](docs/DATA_SOURCES.md)
   (NSE F&O bhavcopy, participant OI, FII/DII, index history, announcements).
2. Click **Import** and select one or more CSV/XLSX files. The type is detected from the headers.
3. Check **Data & Import → Loaded sources** for row counts, as-of dates and warnings.

To change the bundled data, replace the files in `data/` and regenerate the embedded copy:

```bash
node tools/bundle-data.js
```

**Strike OI file:** the original `nifty_strike_oi.csv` was too large to include in full. Only its last
5 sessions (16–20 Nov 2026) are bundled. Commit your full file to `data/nifty_strike_oi.csv` and
re-run the command above, or import it in the browser.

## Tests

```bash
node --test tests/*.test.js
```

26 tests cover:
- statistics and the normal CDF;
- Black-Scholes prices and Greeks (put-call parity, finite-difference checks) and IV round-trips;
- max pain on a hand-checked chain and against the original pipeline's values;
- build-up quadrants and futures basis;
- payoff limits and breakevens;
- backtest timing (no look-ahead, lag and cost accounting, trailing VIX median);
- position sizing and VaR/ES;
- the CSV parser and the summary, bhavcopy and FII/DII converters.

## Backtesting safeguards

The original dashboard had several sources of look-ahead bias. This version fixes them:

- **Execution lag.** EOD open interest is published after the close, so by default a signal from day
  *i* is traded at the close of *i*+1. Lag 0 is still available and is labelled optimistic.
- **Trailing thresholds.** The VIX regime used a full-sample median, which leaks future data. It now
  uses a trailing median.
- **No forward columns.** The source file's `Next_Spot` / `NextDay_*` columns are dropped at import,
  and next-day moves are recomputed from `Spot`.
- **Costs.** Costs are charged per side on every position change, including the final exit. The
  default is 2.5 bps per side and can be edited.
- **Honest diagnostics.** In-sample diagnostics are labelled as such and include split halves,
  ex-expiry results, a same-day-move control, seeded permutation p-values and a multiple-testing note.

## Project layout

```
nifty-research-platform/
├── index.html            entry point, script order
├── css/terminal.css      dark/light themes, responsive, print
├── js/calc/              pure maths, browser global + Node module (tested)
│   ├── stats.js  options.js  payoff.js  backtest.js  risk.js
├── js/data/              csv parser, format detection/normalisation, store, importer, bundled data
├── js/ui/                core widgets, shared helpers, report generator
├── js/modules/           one file per module (A–J, data, methodology)
├── js/app.js             router, theme, header
├── data/                 bundled CSVs
├── docs/                 METHODOLOGY.md, DATA_SOURCES.md
├── tests/                node:test unit tests
└── tools/bundle-data.js  embeds data/*.csv into js/data/bundled.js
```

## Limitations

- The bundled daily summary covers about six months (124 sessions, 25 May – 20 Nov 2026), so its statistics are wide and in-sample.
- The bundled strike file covers 5 sessions and a window of strikes around spot. Its whole-chain totals differ from the summary's full-chain PCR.
- BANK NIFTY, FII/DII, participant OI, futures, option prices (IV, smile, per-strike build-up) and announcements appear only after you import those files.
- The risk-free rate (6.0%), lot size (65) and costs are editable assumptions. Check them against FBIL/RBI, NSE circulars and your broker.
- Black-Scholes assumes constant volatility. Closing prices of illiquid strikes can be stale.
