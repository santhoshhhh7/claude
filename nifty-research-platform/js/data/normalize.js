/* Detects the type of an imported table from its headers and converts it to the internal schema.
 * Supported inputs (all are files a user can download from official sources, or the original
 * project's own exports). Nothing here fetches data; it only reads what the user supplies.
 *   summary        Original project daily file (nifty_pcr_maxpain.csv)
 *   strikeoi       Original project strike file (nifty_strike_oi.csv)
 *   bhav_udiff     NSE F&O bhavcopy, UDiFF format (BhavCopy_NSE_FO_0_0_0_YYYYMMDD_F_0000.csv)
 *   bhav_legacy    NSE F&O bhavcopy, legacy format (foDDMMMYYYYbhav.csv)
 *   participant_oi NSE participant-wise open interest (fao_participant_oi_DDMMYYYY.csv)
 *   fiidii         NSE FII/DII cash-market activity, or a generic Date/FII_Net/DII_Net table
 *   index_history  NSE historical index data (NIFTY 50, NIFTY BANK, INDIA VIX ...)
 *   breadth        Date / Advances / Declines table
 *   announcements  NSE or BSE corporate announcements export
 *   corp_actions   NSE corporate actions export */
(function (root, factory) {
  const mod = factory();
  if (typeof module === 'object' && module.exports) module.exports = mod;
  else { root.NRP = root.NRP || {}; root.NRP.normalize = mod; }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const MON = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
  const pad = n => String(n).padStart(2, '0');
  const key = s => String(s).toLowerCase().replace(/[^a-z0-9_]/g, '');

  function num(v) {
    if (v === null || v === undefined) return null;
    if (typeof v === 'number') return Number.isFinite(v) ? v : null;
    const s = String(v).replace(/[,\s₹]/g, '').replace(/^\((.*)\)$/, '-$1');
    if (s === '' || s === '-' || s.toLowerCase() === 'nan' || s.toLowerCase() === 'na') return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  }

  /** Accepts ISO, DD-MMM-YYYY, DD MMM YYYY, DD-MM-YYYY, DD/MM/YYYY, YYYYMMDD, "Jul 08, 2024", Excel serials. */
  function date(v) {
    if (v === null || v === undefined || v === '') return null;
    if (typeof v === 'number' && v > 20000 && v < 80000) { // Excel serial date
      const d = new Date(Date.UTC(1899, 11, 30) + v * 86400000);
      return d.toISOString().slice(0, 10);
    }
    const s = String(v).trim();
    let m;
    if ((m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/))) return `${m[1]}-${pad(m[2])}-${pad(m[3])}`;
    if ((m = s.match(/^(\d{1,2})[-\s/]([A-Za-z]{3})[A-Za-z]*[-\s/,]+(\d{2,4})/))) {
      const y = m[3].length === 2 ? '20' + m[3] : m[3], mo = MON[m[2].toLowerCase()];
      return mo ? `${y}-${pad(mo)}-${pad(m[1])}` : null;
    }
    if ((m = s.match(/^([A-Za-z]{3})[A-Za-z]*\s+(\d{1,2}),?\s+(\d{4})/))) {
      const mo = MON[m[1].toLowerCase()];
      return mo ? `${m[3]}-${pad(mo)}-${pad(m[2])}` : null;
    }
    if ((m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/))) return `${m[3]}-${pad(m[2])}-${pad(m[1])}`;
    if ((m = s.match(/^(\d{4})(\d{2})(\d{2})$/))) return `${m[1]}-${m[2]}-${m[3]}`;
    return null;
  }

  /** Build an accessor that finds a column by any of several candidate names (case/space-insensitive). */
  function picker(headers) {
    const map = {};
    headers.forEach(h => { map[key(h)] = h; });
    return (row, ...cands) => {
      for (const c of cands) { const h = map[key(c)]; if (h !== undefined && row[h] !== undefined && row[h] !== '') return row[h]; }
      return null;
    };
  }

  function detect(headers) {
    const k = new Set(headers.map(key));
    const has = (...a) => a.every(x => k.has(key(x)));
    if (has('date', 'spot', 'pcr_near')) return 'summary';
    if (has('date', 'strike', 'call_oi', 'put_oi')) return 'strikeoi';
    if (has('tckrsymb', 'fininstrmtp', 'opnintrst')) return 'bhav_udiff';
    if (has('instrument', 'symbol', 'strike_pr', 'open_int')) return 'bhav_legacy';
    if (has('clienttype', 'futureindexlong')) return 'participant_oi';
    if ((has('category', 'buyvalue', 'sellvalue')) || has('date', 'fii_net') || has('date', 'fiinet')) return 'fiidii';
    if (has('advances', 'declines')) return 'breadth';
    if (has('purpose') && (k.has('exdate') || k.has('ex_date'))) return 'corp_actions';
    if ((k.has('subject') || k.has('headline')) && (k.has('symbol') || k.has('companyname') || k.has('securityname') || k.has('securitycode'))) return 'announcements';
    if (has('date', 'close')) return 'index_history';
    return null;
  }

  // ---------- per-type converters ----------

  function summary(headers, rows) {
    const g = picker(headers), out = [], warnings = [];
    if (headers.some(h => /next/i.test(h))) warnings.push('Forward-looking columns (Next_Spot, NextDay_*) were ignored. Next-day moves are recomputed from Spot so no future value is ever used as an input.');
    for (const r of rows) {
      const d = date(g(r, 'Date')), spot = num(g(r, 'Spot'));
      if (!d || !(spot > 0)) continue;
      out.push({
        date: d, spot,
        callOiAll: num(g(r, 'Call_OI_All')), putOiAll: num(g(r, 'Put_OI_All')), pcrAll: num(g(r, 'PCR_All')),
        expiry: date(g(r, 'Expiry_Nearest')), dte: num(g(r, 'Days_To_Expiry')),
        callOiNear: num(g(r, 'Call_OI_Near')), putOiNear: num(g(r, 'Put_OI_Near')), pcrNear: num(g(r, 'PCR_Near')),
        callOiChgNear: num(g(r, 'Call_OI_Chg_Near')), putOiChgNear: num(g(r, 'Put_OI_Chg_Near')), netOiChg: num(g(r, 'Net_OI_Chg_Near')),
        maxPain: num(g(r, 'MaxPain_Near')), support: num(g(r, 'Support_Strike')), resistance: num(g(r, 'Resistance_Strike')),
        vix: num(g(r, 'VIX')), vixChg: num(g(r, 'VIX_Chg'))
      });
    }
    out.sort((a, b) => (a.date < b.date ? -1 : 1));
    return { data: out, warnings };
  }

  function strikeoi(headers, rows) {
    const g = picker(headers), out = [];
    for (const r of rows) {
      const d = date(g(r, 'Date')), k = num(g(r, 'Strike'));
      if (!d || !(k > 0)) continue;
      out.push({
        symbol: 'NIFTY', date: d, expiry: date(g(r, 'Expiry')), strike: k,
        callOI: num(g(r, 'Call_OI')) || 0, putOI: num(g(r, 'Put_OI')) || 0,
        callChg: num(g(r, 'Call_OI_Chg')), putChg: num(g(r, 'Put_OI_Chg')),
        callVol: num(g(r, 'Call_Volume', 'Call_Vol')), putVol: num(g(r, 'Put_Volume', 'Put_Vol')),
        callLtp: num(g(r, 'Call_LTP', 'Call_Close')), putLtp: num(g(r, 'Put_LTP', 'Put_Close')), underlying: num(g(r, 'Underlying', 'Spot'))
      });
    }
    return { data: { options: out, futures: [] }, warnings: [] };
  }

  const INDEX_SYMBOLS = new Set(['NIFTY', 'BANKNIFTY', 'FINNIFTY', 'MIDCPNIFTY', 'NIFTYNXT50']);

  /** Pair CE/PE records into one row per (symbol, date, expiry, strike). */
  function pairOptions(records) {
    const m = new Map();
    for (const o of records) {
      const id = `${o.symbol}|${o.date}|${o.expiry}|${o.strike}`;
      let r = m.get(id);
      if (!r) { r = { symbol: o.symbol, date: o.date, expiry: o.expiry, strike: o.strike, callOI: 0, putOI: 0, callChg: null, putChg: null, callVol: null, putVol: null, callLtp: null, putLtp: null, callSettle: null, putSettle: null, underlying: o.underlying }; m.set(id, r); }
      const p = o.type === 'CE' ? 'call' : 'put';
      r[p + 'OI'] = o.oi || 0; r[p + 'Chg'] = o.chgOi; r[p + 'Vol'] = o.vol; r[p + 'Ltp'] = o.close; r[p + 'Settle'] = o.settle;
      if (o.underlying) r.underlying = o.underlying;
    }
    return [...m.values()];
  }

  function bhavUdiff(headers, rows) {
    const g = picker(headers), opts = [], futs = [];
    for (const r of rows) {
      const tp = String(g(r, 'FinInstrmTp') || '').toUpperCase(), sym = String(g(r, 'TckrSymb') || '').toUpperCase();
      if (!INDEX_SYMBOLS.has(sym) || (tp !== 'IDO' && tp !== 'IDF')) continue;
      const base = {
        symbol: sym, date: date(g(r, 'TradDt')), expiry: date(g(r, 'XpryDt', 'FininstrmActlXpryDt')),
        close: num(g(r, 'ClsPric')), prevClose: num(g(r, 'PrvsClsgPric')), settle: num(g(r, 'SttlmPric')),
        oi: num(g(r, 'OpnIntrst')), chgOi: num(g(r, 'ChngInOpnIntrst')), vol: num(g(r, 'TtlTradgVol')), underlying: num(g(r, 'UndrlygPric'))
      };
      if (tp === 'IDF') futs.push(base);
      else opts.push({ ...base, strike: num(g(r, 'StrkPric')), type: String(g(r, 'OptnTp') || '').toUpperCase() });
    }
    return { data: { options: pairOptions(opts), futures: futs }, warnings: [] };
  }

  function bhavLegacy(headers, rows) {
    const g = picker(headers), opts = [], futs = [], warnings = ['Legacy bhavcopy has no underlying price column. Spot comes from the daily summary or index history for the same date.'];
    for (const r of rows) {
      const inst = String(g(r, 'INSTRUMENT') || '').toUpperCase(), sym = String(g(r, 'SYMBOL') || '').toUpperCase();
      if (!INDEX_SYMBOLS.has(sym) || (inst !== 'OPTIDX' && inst !== 'FUTIDX')) continue;
      const base = {
        symbol: sym, date: date(g(r, 'TIMESTAMP')), expiry: date(g(r, 'EXPIRY_DT')),
        close: num(g(r, 'CLOSE')), prevClose: null, settle: num(g(r, 'SETTLE_PR')),
        oi: num(g(r, 'OPEN_INT')), chgOi: num(g(r, 'CHG_IN_OI')), vol: num(g(r, 'CONTRACTS')), underlying: null
      };
      if (inst === 'FUTIDX') futs.push(base);
      else opts.push({ ...base, strike: num(g(r, 'STRIKE_PR')), type: String(g(r, 'OPTION_TYP') || '').toUpperCase() });
    }
    return { data: { options: pairOptions(opts), futures: futs }, warnings };
  }

  function participantOi(headers, rows, ctx) {
    const g = picker(headers), out = [];
    let d = ctx.titleDate || null;
    if (!d && ctx.fileName) { const m = ctx.fileName.match(/(\d{2})(\d{2})(\d{4})/); if (m) d = `${m[3]}-${m[2]}-${m[1]}`; }
    const warnings = d ? [] : ['Could not find the report date in the title line or file name; rows were dated by the import date.'];
    for (const r of rows) {
      const who = String(g(r, 'Client Type') || '').trim();
      if (!who) continue;
      out.push({
        date: d, participant: who.toUpperCase(),
        futIdxLong: num(g(r, 'Future Index Long')), futIdxShort: num(g(r, 'Future Index Short')),
        optIdxCallLong: num(g(r, 'Option Index Call Long')), optIdxPutLong: num(g(r, 'Option Index Put Long')),
        optIdxCallShort: num(g(r, 'Option Index Call Short')), optIdxPutShort: num(g(r, 'Option Index Put Short')),
        totalLong: num(g(r, 'Total Long Contracts')), totalShort: num(g(r, 'Total Short Contracts'))
      });
    }
    return { data: out, warnings };
  }

  function fiidii(headers, rows) {
    const g = picker(headers), by = new Map();
    const at = d => { if (!by.has(d)) by.set(d, { date: d, fiiBuy: null, fiiSell: null, fiiNet: null, diiBuy: null, diiSell: null, diiNet: null }); return by.get(d); };
    const isNse = headers.map(key).includes('category');
    for (const r of rows) {
      const d = date(g(r, 'Date'));
      if (!d) continue;
      if (isNse) {
        const cat = String(g(r, 'Category') || '').toUpperCase(), o = at(d);
        const p = cat.includes('DII') ? 'dii' : (cat.includes('FII') || cat.includes('FPI')) ? 'fii' : null;
        if (!p) continue;
        o[p + 'Buy'] = num(g(r, 'Buy Value')); o[p + 'Sell'] = num(g(r, 'Sell Value')); o[p + 'Net'] = num(g(r, 'Net Value'));
      } else {
        const o = at(d);
        o.fiiBuy = num(g(r, 'FII_Buy', 'FII Buy')); o.fiiSell = num(g(r, 'FII_Sell', 'FII Sell'));
        o.fiiNet = num(g(r, 'FII_Net', 'FII Net')); o.diiBuy = num(g(r, 'DII_Buy', 'DII Buy'));
        o.diiSell = num(g(r, 'DII_Sell', 'DII Sell')); o.diiNet = num(g(r, 'DII_Net', 'DII Net'));
        if (o.fiiNet === null && o.fiiBuy !== null && o.fiiSell !== null) o.fiiNet = o.fiiBuy - o.fiiSell;
        if (o.diiNet === null && o.diiBuy !== null && o.diiSell !== null) o.diiNet = o.diiBuy - o.diiSell;
      }
    }
    return { data: [...by.values()].sort((a, b) => (a.date < b.date ? -1 : 1)), warnings: [] };
  }

  function indexHistory(headers, rows, ctx) {
    const g = picker(headers), out = [];
    for (const r of rows) {
      const d = date(g(r, 'Date', 'HistoricalDate', 'Index Date')), c = num(g(r, 'Close', 'Closing Index Value', 'Close Price'));
      if (!d || !(c > 0)) continue;
      out.push({ date: d, open: num(g(r, 'Open', 'Open Index Value')), high: num(g(r, 'High', 'High Index Value')), low: num(g(r, 'Low', 'Low Index Value')), close: c });
    }
    out.sort((a, b) => (a.date < b.date ? -1 : 1));
    const nameCol = rows.length ? picker(headers)(rows[0], 'Index Name', 'Index') : null;
    const fname = (ctx.fileName || '').toUpperCase();
    const name = ctx.indexName || (nameCol ? String(nameCol).toUpperCase() : null) ||
      (fname.includes('VIX') ? 'INDIA VIX' : fname.includes('BANK') ? 'NIFTY BANK' : fname.includes('NIFTY') ? 'NIFTY 50' : 'INDEX');
    return { data: { name, rows: out }, warnings: [] };
  }

  function breadth(headers, rows) {
    const g = picker(headers), out = [];
    for (const r of rows) {
      const d = date(g(r, 'Date'));
      if (!d) continue;
      out.push({ date: d, advances: num(g(r, 'Advances')), declines: num(g(r, 'Declines')), unchanged: num(g(r, 'Unchanged')) });
    }
    return { data: out.sort((a, b) => (a.date < b.date ? -1 : 1)), warnings: [] };
  }

  function announcements(headers, rows, ctx) {
    const g = picker(headers), out = [];
    const src = headers.map(key).some(h => h.startsWith('security')) ? 'BSE' : 'NSE';
    for (const r of rows) {
      const when = g(r, 'BROADCAST DATE/TIME', 'Broadcast Date/Time', 'AN_DT', 'Date', 'News Submission Date', 'Exchange Received Time');
      out.push({
        kind: 'announcement', source: src, timestamp: when ? String(when) : null, date: date(when),
        symbol: g(r, 'SYMBOL', 'Security Code'), company: g(r, 'COMPANY NAME', 'Security Name', 'Company'),
        subject: g(r, 'SUBJECT', 'Subject', 'Headline'), details: g(r, 'DETAILS', 'Details', 'More'),
        url: g(r, 'ATTACHMENT', 'Attachment', 'Link', 'URL'), file: ctx.fileName || null
      });
    }
    return { data: out.filter(o => o.subject), warnings: [] };
  }

  function corpActions(headers, rows, ctx) {
    const g = picker(headers), out = [];
    for (const r of rows) {
      out.push({
        kind: 'corporate action', source: 'NSE', date: date(g(r, 'EX-DATE', 'Ex Date')), timestamp: g(r, 'EX-DATE', 'Ex Date'),
        symbol: g(r, 'SYMBOL'), company: g(r, 'COMPANY NAME'), subject: g(r, 'PURPOSE'),
        details: ['Record date: ' + (g(r, 'RECORD DATE') || '—'), 'Face value: ' + (g(r, 'FACE VALUE') || '—')].join(' · '),
        url: null, file: ctx.fileName || null
      });
    }
    return { data: out.filter(o => o.subject), warnings: [] };
  }

  const CONVERTERS = { summary, strikeoi, bhav_udiff: bhavUdiff, bhav_legacy: bhavLegacy, participant_oi: participantOi, fiidii, index_history: indexHistory, breadth, announcements, corp_actions: corpActions };

  const LABELS = {
    summary: 'Daily NIFTY positioning summary', strikeoi: 'Strike-wise option OI', bhav_udiff: 'NSE F&O bhavcopy (UDiFF)',
    bhav_legacy: 'NSE F&O bhavcopy (legacy)', participant_oi: 'NSE participant-wise OI', fiidii: 'FII/DII cash activity',
    index_history: 'Index price history', breadth: 'Market breadth', announcements: 'Corporate announcements', corp_actions: 'Corporate actions'
  };

  /** Convert a parsed table. Returns {kind, label, data, warnings} or throws with a readable message. */
  function convert({ headers, rows, fileName, titleLine, indexName, forceKind }) {
    const kind = forceKind || detect(headers);
    if (!kind) throw new Error('Unrecognised columns: ' + headers.slice(0, 8).join(', ') + (headers.length > 8 ? ' …' : '') + '. See docs/DATA_SOURCES.md for supported files.');
    const titleDate = titleLine ? date(titleLine.replace(/^.*as on\s*/i, '')) : null;
    const res = CONVERTERS[kind](headers, rows, { fileName, titleDate, indexName });
    const n = Array.isArray(res.data) ? res.data.length : res.data.options ? res.data.options.length + res.data.futures.length : res.data.rows.length;
    if (!n) throw new Error(`Recognised as "${LABELS[kind]}" but no valid rows were found (check dates and numeric columns).`);
    return { kind, label: LABELS[kind], ...res };
  }

  return { num, date, detect, convert, LABELS, INDEX_SYMBOLS };
});
