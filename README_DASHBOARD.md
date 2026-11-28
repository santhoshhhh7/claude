# Nifty Options Research Dashboard – Quick Start

**Live URL (once deployed):** https://santhoshhhh7.github.io/claude/nifty-research-platform/nifty_dashboard.html

---

## ⚡ Quick Deploy (5 Minutes)

1. **Go to repo settings:** https://github.com/santhoshhhh7/claude/settings/pages
2. **Select "Deploy from a branch"** → Branch: `add-customer-psychology-pdf` → Folder: `/` → Save
3. **Go to Actions tab** → Find "Update live market data" → Click "Run workflow"
4. **Wait 1 minute**, then open the live URL above

Done! 🎉

---

## 📊 What You Get

| Tab | What It Shows |
|-----|---------------|
| **Live** | Nifty 50, Sensex, Bank Nifty, VIX; your lean for tomorrow; track record (last 20 days); headlines |
| **Tomorrow** | VIX range forecast; similar-VIX historical days; your lean |
| **Day** | Date picker; KPI cards; open interest by strike; expiry info |
| **Trends** | 60-day chart with 20/50 EMA; RSI; 5-day return |
| **Signals** | PCR, market halves, non-expiry days; p-values; baseline comparison |
| **Indicators** | Bollinger Bands, Supertrend, RSI, MACD; tested accuracy |
| **Check** | Holm p-values; train/test split (60%/40%); passing signals |
| **News** | Live headlines (or dated snapshot if no feed) |
| **Learn** | About, 30-sec summary, glossary, 7 interview Q&As |

---

## 🛠️ What's Under the Hood

- **Dashboard file:** `nifty-research-platform/nifty_dashboard.html` (single HTML file, 2200+ lines)
- **Data fetcher:** `nifty-research-platform/scripts/fetch_live.py` (fetches prices, VIX, news)
- **Live data:** `nifty-research-platform/data/live.json` (updated every 15 min during market hours)
- **Workflow:** `.github/workflows/live-data.yml` (runs Mon–Fri 09:15–15:30 IST)

---

## ✨ Features

✅ **Mobile-first** – Works at 380px; safe-area padding for notches  
✅ **Light & dark mode** – Toggle in header; saved to browser  
✅ **Self-contained** – Single HTML file; only Chart.js from CDN  
✅ **Responsive charts** – 5-day price, OI by strike, RSI, MACD  
✅ **Educational tone** – Never calls anything a prediction; always says "educational, not investment advice"  
✅ **Offline fallback** – Embedded data; works if network unavailable  
✅ **Secure** – All external text escaped; localStorage with try/catch  
✅ **Auto-updating** – Fetches fresh data every 60 seconds  

---

## 📈 Key Findings

1. **Open Interest Concentration**: Support is the strike with the highest put OI; resistance is the strike with the highest call OI. Traders cluster positions there, creating natural boundaries.

2. **PCR Testing**: Put-call ratio alone isn't predictive. Only when tested with Holm correction, 60/40 train/test split, and last 20 days excluded does it occasionally show ~56% win rate against 50% baseline.

3. **VIX Range**: India VIX ±1σ captures ~68% of daily moves; ±2σ captures ~95%. Use as range forecast, not support/resistance.

4. **Trend Persistence**: EMA 20 > 50 + RSI > 60 = ~54% win rate. Better than baseline, but rarely passes all rigor checks without overfitting.

5. **Why Signals Fail**: Regime shifts, structural breaks, black swan events destroy backtested rules. Train on first 60%, test on last 40%, exclude last 20 days, apply Holm correction, use 2-standard-error margins—but always expect regime changes.

---

## 📖 Full Documentation

- **Setup guide:** See `DASHBOARD_SETUP.md` for detailed 5-step deployment
- **Deliverables:** See `DASHBOARD_COMPLETE.md` for full feature checklist
- **Local testing:** Run `python scripts/fetch_live.py` to test data fetcher

---

## ⚠️ Important

This is **educational research**, not trading advice.
- Never invest based on a dashboard
- All signals are illustrative and backtested on historical data
- Market regimes change; past performance ≠ future results
- Use this to learn, not to trade blindly

---

## 🔗 Links

- **Repo:** https://github.com/santhoshhhh7/claude
- **Dashboard (live):** https://santhoshhhh7.github.io/claude/nifty-research-platform/nifty_dashboard.html
- **Branch with code:** `add-customer-psychology-pdf`

---

**Reference:** Claude Dashboard for Nifty Options Analysis (Anthropic, 2026). Web-based tool for educational analysis of NSE F&O data.
