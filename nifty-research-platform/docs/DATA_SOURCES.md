# Data sources and import formats

The application never scrapes or calls market-data APIs. You download files from the official
sources below and import them with **Import**. The type of each file is detected from its column
headers (`js/data/normalize.js → detect`).

| Dataset | Where to get it | Recognised by (headers) | Used in |
|---|---|---|---|
| NSE F&O bhavcopy, UDiFF (from July 2024) | [NSE All Reports → Derivatives](https://www.nseindia.com/all-reports-derivatives): "F&O – UDiFF Common Bhavcopy Final (zip)" | `TckrSymb, FinInstrmTp, OpnIntrst` | Chain, Greeks/IV, Futures, Payoff |
| NSE F&O bhavcopy, legacy | NSE archives (`foDDMMMYYYYbhav.csv`) | `INSTRUMENT, SYMBOL, STRIKE_PR, OPEN_INT` | Same (no underlying price column) |
| Participant-wise OI | [NSE All Reports → Derivatives](https://www.nseindia.com/all-reports-derivatives): "F&O – Participant wise Open Interest" | `Client Type, Future Index Long` | FII/DII |
| FII/DII cash activity | [NSE FII/DII report](https://www.nseindia.com/reports/fii-dii) or the template | `Category, Buy Value, Sell Value` or `Date, FII_Net` | FII/DII, Insights |
| Index history | [NSE historical index data](https://www.nseindia.com/reports-indices-historical-index-data), [India VIX history](https://www.nseindia.com/reports-indices-historical-vix) | `Date, Close` (+ Open/High/Low) | Overview (BANK NIFTY) |
| Breadth | Build from exchange data with the template | `Date, Advances, Declines` | Overview |
| Corporate announcements | [NSE](https://www.nseindia.com/companies-listing/corporate-filings-announcements), [BSE](https://www.bseindia.com/corporates/ann.html) | `SUBJECT` / `Headline` + symbol or company | Market Intelligence |
| Corporate actions | [NSE corporate actions](https://www.nseindia.com/companies-listing/corporate-filings-actions) | `PURPOSE, EX-DATE` | Market Intelligence |
| Original daily summary | Original project pipeline (`nifty_pcr_maxpain.csv`) | `Date, Spot, PCR_Near` | Overview, Backtest, Risk, Insights |
| Original strike OI | Original project pipeline (`nifty_strike_oi.csv`) | `Date, Strike, Call_OI, Put_OI` | Chain, Greeks (flat σ) |

Other references linked in the app:
- [RBI press releases](https://www.rbi.org.in/Scripts/BS_PressReleaseDisplay.aspx);
- [FBIL](https://www.fbil.org.in/), for the T-bill rate used as *r*;
- [SEBI](https://www.sebi.gov.in/);
- [NSE circulars](https://www.nseindia.com/resources/exchange-communication-circulars), for lot-size revisions.

## Notes

- **Bhavcopy:** only index underlyings are kept (NIFTY, BANKNIFTY, FINNIFTY, MIDCPNIFTY, NIFTYNXT50). CE and PE rows are paired per strike, and index futures (`IDF`) are stored separately.
- **Participant OI:** the report date is read from the title line ("… as on Nov 20, 2026") or from the file name (`DDMMYYYY`).
- **Index history:** the index name comes from an `Index Name` column, then the file name, or the selector on the Data page.
- **Excel:** `.xlsx` and `.xls` files are converted sheet by sheet with SheetJS 0.20.3, loaded on first use from `cdn.sheetjs.com`.
- **Storage:** imported data is kept in localStorage (`nrp.v1.uploads`). Files too large for storage load for the current session only, and the source register says so.
- **Links:** links from imported files are rendered only if they use http(s), and all imported text is HTML-escaped.

## Bundled data

`data/nifty_pcr_maxpain.csv` holds 124 sessions, 25 May – 20 Nov 2026. `data/nifty_strike_oi.csv`
holds only the last 5 sessions of the original file, because the full file was too large to add here.
Both are exports from the original project's data pipeline and have not been independently checked
against NSE. To refresh the copy embedded for `file://` use, run `node tools/bundle-data.js`.
