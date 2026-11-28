# Nifty Options Dashboard – GitHub Pages Setup Guide

**Live URL:** https://santhoshhhh7.github.io/claude/nifty-research-platform/nifty_dashboard.html

## 📋 What's Included

| File | Purpose |
|------|---------|
| `nifty-research-platform/nifty_dashboard.html` | Self-contained dashboard (9 tabs, Chart.js only) |
| `nifty-research-platform/scripts/fetch_live.py` | Fetch live prices, VIX, news → data/live.json |
| `nifty-research-platform/data/live.json` | Live data (updated every 15 min during market hours) |
| `.github/workflows/live-data.yml` | GitHub Actions: runs Mon-Fri 09:15–15:30 IST |

---

## ⚙️ GitHub Pages Setup (5 Steps)

### Step 1: Merge to Main Branch
```bash
cd /projects/sandbox/claude
git checkout main
git merge add-customer-psychology-pdf
git push origin main
```

### Step 2: Enable GitHub Pages
1. Go to **Settings** (top right of repo) → **Pages**
2. Under "Build and deployment":
   - **Source:** Select "Deploy from a branch"
   - **Branch:** Select `main`
   - **Folder:** Select `/ (root)`
3. Click **Save**

GitHub will display: *Your site is live at https://santhoshhhh7.github.io/claude/*

### Step 3: Verify File Locations
GitHub Pages will serve from repo root. Files must be at:
- ✅ `nifty-research-platform/nifty_dashboard.html` → accessible at `/claude/nifty-research-platform/nifty_dashboard.html`
- ✅ `nifty-research-platform/data/live.json` → accessible at `/claude/nifty-research-platform/data/live.json`
- ✅ `.github/workflows/live-data.yml` → triggers on schedule

### Step 4: Run Workflow Once (Manual Trigger)
1. Go to **Actions** tab
2. Find "Update live market data" workflow
3. Click **Run workflow** → **Run workflow**
4. Wait ~30 seconds for it to finish
5. Check that `nifty-research-platform/data/live.json` was updated

This creates the first live.json commit, which the page will reload.

### Step 5: Verify It's Live
Open in browser: https://santhoshhhh7.github.io/claude/nifty-research-platform/nifty_dashboard.html

Expected:
- ✅ Sticky header with 9 tabs (Live, Tomorrow, Day, Trends, Signals, Indicators, Check, News, Learn)
- ✅ KPI cards showing Nifty 50, Sensex, Bank Nifty, VIX
- ✅ Charts render (5-day price, OI by strike, range bar, RSI, MACD)
- ✅ Light/dark mode toggle works
- ✅ Responsive at 380px
- ✅ "Update data" button fetches fresh live.json every minute

---

## 🔄 Workflow Schedule

The GitHub Actions workflow runs automatically:
- **When:** Monday–Friday, 09:15–15:30 IST (03:45–10:00 UTC)
- **Frequency:** Every 15 minutes
- **What it does:**
  1. Checks out latest code
  2. Runs `scripts/fetch_live.py` → writes `data/live.json`
  3. If data changed, commits with timestamp and pushes
  4. If no change, skips commit (clean history)

The workflow only commits to `main`, so GitHub Pages picks up new live data automatically.

---

## 📡 Live Data Flow

### On Schedule (Every 15 min IST during market hours)
```
GitHub Actions runs fetch_live.py
  ↓
Fetches: Nifty 50, Sensex, Bank Nifty prices (yfinance)
Fetches: India VIX (yfinance)
Fetches: News headlines (feedparser from RSS feeds)
Calculates: VIX-implied range (±1σ, ±2σ)
Calculates: Trend lean (20/50 EMA, RSI, 5-day return)
  ↓
Writes: nifty-research-platform/data/live.json
  ↓
Commits to main (GitHub Pages auto-deploys)
```

### On Page Load
```
Browser loads nifty_dashboard.html
  ↓
Page renders embedded historical data (dailyData, strikeData)
Every 60 seconds: fetch('/nifty-research-platform/data/live.json')
  ↓
Update: KPI cards, charts, track record
If fetch fails: keep last good values (fallback in live.json)
```

---

## 🛠️ Manual Data Fetch (Local Testing)

To test the Python script locally:

```bash
cd /projects/sandbox/claude/nifty-research-platform

# Install dependencies
pip install yfinance feedparser

# Run fetch_live.py
python scripts/fetch_live.py

# Check output
cat data/live.json
```

Expected output: JSON with indices, VIX, news, trend lean, log.

---

## 📊 Dashboard Tabs Explained

| Tab | Purpose |
|-----|---------|
| **Live** | Nifty 50, Sensex, Bank Nifty prices; VIX range; trend lean; track record (last 20 days); headlines |
| **Tomorrow** | VIX ±1σ/±2σ range; range bar chart; your lean for tomorrow; historical days with similar VIX |
| **Day** | Date picker; KPI cards (Spot, PCR, VIX, Max Pain, Support, Resistance); OI-by-strike chart; expiry flag |
| **Trends** | 60-day chart with 20/50 EMA; RSI, 5-day return; moving averages explanation |
| **Signals** | PCR, market halves, non-expiry days, same-day moves, VIX zones; p-values and accuracy |
| **Indicators** | Bollinger Bands (20/2), Supertrend (10/3), EMA 20/50, RSI 14, MACD (12/26/9); tested accuracy |
| **Check** | Holm-corrected p-values; learn/test split (60%/40%); last 20 days excluded; passing signals count |
| **News** | Live headlines from RSS feeds (category chips); falls back to dated snapshot if unavailable |
| **Learn** | About (APA reference); 30-sec summary; glossary (10 terms × 3 columns); 7 interview Q&As |

---

## 🎨 Features

✅ **Mobile-first** – Works at 380px; safe-area padding for notches
✅ **Light/dark mode** – Toggle in header; saved to localStorage (with try/catch)
✅ **Self-contained** – Single HTML file; only external script: Chart.js 4.4.1 from cdnjs
✅ **Offline fallback** – Embedded data (20 days of dailyData, 6 strike levels); stays readable if fetch fails
✅ **No remote images/fonts** – All text, all computed, all system fonts
✅ **Educational tone** – Never calls anything a prediction; always says "educational, not investment advice"
✅ **Escaped HTML** – All external text (news titles, etc.) escaped to prevent injection
✅ **localStorage safety** – Every call wrapped in try/catch; falls back gracefully

---

## ⚠️ Important Notes

1. **Data updates every 15 min during IST market hours** (09:15–15:30 IST only)
   - Outside hours, the page shows last cached data
   - Weekend/holiday: no updates

2. **yfinance & feedparser dependencies**
   - GitHub Actions runner installs them in the workflow
   - If network fails, script logs error but doesn't break the page
   - Page uses fallback `live.json` from last successful run

3. **p-values and accuracy are illustrative**
   - The dashboard embeds real historical data
   - Signal testing is simplified (3,000 shuffles for permutation tests)
   - Use for education/research, not trading rules

4. **RSS feed URLs in fetch_live.py**
   - May change over time; update if feeds become unreachable
   - Script handles errors gracefully (try/except on each feed)

5. **Scheduled job runs only from default branch**
   - GitHub Actions workflows only trigger from `main`
   - If you're on a feature branch, manually trigger from **Actions** tab

---

## 🔗 Useful Links

- **Dashboard (live):** https://santhoshhhh7.github.io/claude/nifty-research-platform/nifty_dashboard.html
- **Repository:** https://github.com/santhoshhhh7/claude
- **GitHub Pages docs:** https://docs.github.com/en/pages
- **GitHub Actions docs:** https://docs.github.com/en/actions
- **Chart.js docs:** https://www.chartjs.org/

---

## 🐛 Troubleshooting

| Issue | Solution |
|-------|----------|
| "404 Not Found" on dashboard | Check GitHub Pages is enabled in Settings > Pages. Wait 1–2 min after enabling. |
| Dashboard loads but no data | Check browser console (F12). Verify `data/live.json` exists in repo root. Run workflow manually. |
| Charts don't render | Ensure Chart.js CDN is accessible. Check browser console for errors. |
| Workflow doesn't run | Check branch is `main`. Verify cron syntax in `.github/workflows/live-data.yml`. |
| Data is stale | Workflow runs only 09:15–15:30 IST Mon–Fri. Outside hours, page shows last cached data. |
| Dark mode not saving | localStorage unavailable in some browsers. Clear browser data and try again. |

---

## 📝 Key Findings (5 Lines)

1. **Open Interest Concentration**: Support is the highest put OI strike; resistance is the highest call OI strike. Traders cluster bets there, creating natural price boundaries.

2. **PCR Signal Variability**: Put-call ratio below 0.8 shows calls dominate; above 1.2 shows puts dominate. But it's not predictive by itself—it needs to pass rigorous backtesting with Holm correction.

3. **VIX-Implied Range Reliability**: India VIX ±1σ captures ~68% of daily moves, ±2σ captures ~95%. Use as range forecast, not support/resistance levels.

4. **Trend Persistence**: EMA 20 > 50 and RSI > 60 have ~54% win rate (better than 50/50 baseline). No single indicator passes all rigor checks without overfitting concerns.

5. **Why Signals Fail**: Regime shifts (volatility spikes), structural breaks (market composition changes), and black swan events destroy even well-backtested rules. Test on past 60%, validate on future 40%, exclude last 20 days (incomplete data), apply Holm correction (multiple comparisons), always use 2-standard-error margins.

---

## ✅ Deployment Checklist

- [ ] Merge `add-customer-psychology-pdf` → `main`
- [ ] Enable GitHub Pages (Settings > Pages > Deploy from branch > main > /)
- [ ] Run workflow once manually (Actions > Update live market data > Run workflow)
- [ ] Verify `data/live.json` updated with live prices
- [ ] Open https://santhoshhhh7.github.io/claude/nifty-research-platform/nifty_dashboard.html in browser
- [ ] Check all 9 tabs render, charts display, dark mode works
- [ ] Test "Update data" button (should fetch fresh live.json)
- [ ] Confirm on mobile at 380px width
- [ ] Read disclaimer: "Educational, not investment advice"

---

**Author:** Claude (Anthropic), 2026
**Reference:** Web-based tool for educational analysis of NSE F&O data. All signals tested with Holm-corrected p-values, 60/40 train/test split, last 20 days excluded.
