/* Shared helpers for the modules: user assumptions (persisted), derived daily series,
 * chain context selection and the list of official data sources. */
(function (root) {
  'use strict';
  const NRP = root.NRP;
  const SKEY = 'nrp.v1.settings';

  /* Assumptions used by MODEL calculations. Defaults are stated in docs/METHODOLOGY.md and are editable
   * on the Data page. The risk-free default is a placeholder to be checked against the current 91-day
   * T-bill yield (RBI / FBIL); it is not fetched. */
  const DEFAULTS = { r: 6.0, q: 0, lot: 65, step: 50, costBps: 2.5, rateNote: 'Verify against the current 91-day T-bill yield (RBI / FBIL).' };
  let settings = { ...DEFAULTS };
  try { Object.assign(settings, JSON.parse(root.localStorage.getItem(SKEY) || '{}')); } catch (e) { /* ignore */ }

  function setSettings(patch) {
    Object.assign(settings, patch);
    try { root.localStorage.setItem(SKEY, JSON.stringify(settings)); } catch (e) { /* storage unavailable */ }
  }

  /** Daily NIFTY summary with derived fields. All derived fields use data up to and including the row. */
  function series() {
    const S = NRP.stats, rows = NRP.store.data.summary;
    const out = rows.map((r, i) => ({
      ...r,
      ret: i ? r.spot / rows[i - 1].spot - 1 : NaN,
      gapPct: Number.isFinite(r.maxPain) ? (r.spot - r.maxPain) / r.spot : NaN
    }));
    const sma20 = S.rolling(out.map(r => r.spot), 20, S.mean);
    out.forEach((r, i) => { r.sma20 = sma20[i]; });
    return out;
  }

  /** Next-session move for row i (only for describing history; never used as a signal input). */
  const nextMove = (rows, i) => (i + 1 < rows.length ? rows[i + 1].spot / rows[i].spot - 1 : NaN);

  /** Daily 1-sigma move implied by India VIX, in points. VIX is an annualised % volatility;
   *  we convert with sqrt(252) trading days (documented assumption). */
  const vixSigma = (spot, vix) => (spot > 0 && vix > 0 ? spot * vix / 100 / Math.sqrt(252) : NaN);

  /** Pick a date/expiry for chain-based modules. Remembers the last choice per symbol. */
  const chainSel = {};
  function chainContext(symbol = 'NIFTY', want = {}) {
    const st = NRP.store, dates = st.optionDates(symbol);
    if (!dates.length) return { symbol, dates, expiries: [], date: null, expiry: null, rows: [], spot: { value: null } };
    // want.latest: always the latest date and nearest expiry, without touching the remembered selection.
    const prev = want.latest ? {} : chainSel[symbol] || {};
    const date = [want.date, prev.date].find(d => d && dates.includes(d)) || dates[dates.length - 1];
    const expiries = st.expiriesOn(date, symbol).filter(e => e >= date);
    const expiry = [want.expiry, prev.expiry].find(e => e && expiries.includes(e)) || expiries[0] || null;
    if (!want.latest) chainSel[symbol] = { date, expiry };
    const spot = st.spotOn(date, symbol);
    return { symbol, dates, expiries, date, expiry, rows: expiry ? st.chain(date, expiry, symbol) : [], spot };
  }

  /** Strikes within +-n strikes of spot (n = 0 means all). */
  function windowRows(rows, spot, n) {
    if (!n || !(spot > 0) || !rows.length) return rows;
    let atm = 0;
    rows.forEach((r, i) => { if (Math.abs(r.strike - spot) < Math.abs(rows[atm].strike - spot)) atm = i; });
    return rows.slice(Math.max(0, atm - n), atm + n + 1);
  }

  function atmStrike(rows, spot) {
    return rows.reduce((b, r) => (b === null || Math.abs(r.strike - spot) < Math.abs(b - spot) ? r.strike : b), null);
  }

  /* Official sources. These are links for the user to download files or read primary disclosures; the
   * application does not scrape them. */
  const SOURCES = {
    bhav: { name: 'NSE F&O bhavcopy (UDiFF)', url: 'https://www.nseindia.com/all-reports-derivatives', note: 'All Reports → Derivatives → "F&O - UDiFF Common Bhavcopy Final (zip)". Unzip and import the CSV.' },
    participant: { name: 'NSE participant-wise OI', url: 'https://www.nseindia.com/all-reports-derivatives', note: 'All Reports → Derivatives → "F&O - Participant wise Open Interest (csv)".' },
    fiidii: { name: 'NSE FII/DII trading activity', url: 'https://www.nseindia.com/reports/fii-dii', note: 'Download the CSV for the day. The cash-market provisional figures are in ₹ crore.' },
    indices: { name: 'NSE historical index data', url: 'https://www.nseindia.com/reports-indices-historical-index-data', note: 'Select NIFTY 50, NIFTY BANK or INDIA VIX, choose a range and download CSV.' },
    vix: { name: 'NSE India VIX historical', url: 'https://www.nseindia.com/reports-indices-historical-vix', note: 'Download CSV; import with index name INDIA VIX.' },
    breadth: { name: 'NSE market breadth (advances/declines)', url: 'https://www.nseindia.com/market-data/live-market-indices', note: 'Prepare a Date, Advances, Declines CSV (template on the Data page).' },
    nseAnn: { name: 'NSE corporate announcements', url: 'https://www.nseindia.com/companies-listing/corporate-filings-announcements', note: 'Filter and use "Download (.csv)".' },
    nseCa: { name: 'NSE corporate actions', url: 'https://www.nseindia.com/companies-listing/corporate-filings-actions', note: 'Filter and use "Download (.csv)".' },
    bseAnn: { name: 'BSE corporate announcements', url: 'https://www.bseindia.com/corporates/ann.html', note: 'Primary filings for BSE-listed companies.' },
    rbi: { name: 'RBI press releases', url: 'https://www.rbi.org.in/Scripts/BS_PressReleaseDisplay.aspx', note: 'Monetary policy, liquidity and rate announcements.' },
    rbiTbill: { name: 'RBI / FBIL T-bill yields (risk-free rate)', url: 'https://www.fbil.org.in/', note: 'Use the 91-day T-bill rate as r in the Greeks and payoff models.' },
    sebi: { name: 'SEBI (press releases, circulars)', url: 'https://www.sebi.gov.in/', note: 'Media & Notifications → Press Releases / Circulars: F&O rule changes (lot sizes, expiries, margins).' },
    lot: { name: 'NSE exchange circulars (lot sizes)', url: 'https://www.nseindia.com/resources/exchange-communication-circulars', note: 'Lot-size revisions are announced by circular. Check the current NIFTY lot size before sizing trades.' }
  };
  const srcLink = k => { const s = SOURCES[k]; return `<a href="${NRP.ui.esc(s.url)}" target="_blank" rel="noopener noreferrer">${NRP.ui.esc(s.name)} ↗</a>`; };

  /** Generic "import this file" empty state. */
  function needData(title, keys, extra) {
    const items = keys.map(k => `<li>${srcLink(k)}<div class="muted small">${NRP.ui.esc(SOURCES[k].note)}</div></li>`).join('');
    return NRP.ui.empty(title, `${extra ? `<p>${extra}</p>` : ''}<ul class="src-list">${items}</ul><p><a href="#/data" class="btn btn-sm">Open the import centre</a></p>`);
  }

  /** Bind change events of all [data-bind] inputs inside el to fn(name, value, input). */
  function bind(el, fn) {
    el.querySelectorAll('[data-bind]').forEach(inp => {
      const ev = inp.tagName === 'SELECT' || inp.type === 'checkbox' || inp.type === 'radio' ? 'change' : 'change';
      inp.addEventListener(ev, () => fn(inp.dataset.bind, inp.type === 'checkbox' ? inp.checked : inp.value, inp));
    });
  }

  NRP.shared = { get settings() { return settings; }, DEFAULTS, setSettings, series, nextMove, vixSigma, chainContext, windowRows, atmStrike, SOURCES, srcLink, needData, bind };
  NRP.modules = NRP.modules || {};
})(typeof self !== 'undefined' ? self : this);
