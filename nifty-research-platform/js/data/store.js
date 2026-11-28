/* Central data store with provenance. Every dataset records where it came from, when it was loaded,
 * the last market date it covers, and its mode:
 *   HISTORICAL  bundled end-of-day files shipped with the repository
 *   UPLOADED    files imported by the user in this browser (also end-of-day)
 *   MODEL       values computed by this application from the above (e.g. Black-Scholes prices)
 * There is no LIVE or DELAYED feed in this build; the UI says so explicitly. */
(function (root) {
  'use strict';
  const NRP = root.NRP = root.NRP || {};
  const LS_KEY = 'nrp.v1.uploads';

  const empty = () => ({ summary: [], options: [], futures: [], participants: [], fiidii: [], indices: {}, breadth: [], intel: [] });
  let data = empty();
  let sources = [];
  const listeners = new Set();

  function mergeBy(arr, add, keyFn, combine) {
    const m = new Map(arr.map(r => [keyFn(r), r]));
    for (const r of add) { const k = keyFn(r); m.set(k, combine && m.has(k) ? combine(m.get(k), r) : r); }
    return [...m.values()];
  }
  const byDate = (a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
  const maxDate = arr => arr.reduce((m, r) => (r.date && r.date > m ? r.date : m), '');

  function apply(res) {
    const d = res.data;
    switch (res.kind) {
      case 'summary': data.summary = mergeBy(data.summary, d, r => r.date).sort(byDate); return maxDate(d);
      case 'strikeoi': case 'bhav_udiff': case 'bhav_legacy':
        data.options = mergeBy(data.options, d.options, r => `${r.symbol}|${r.date}|${r.expiry}|${r.strike}`);
        data.futures = mergeBy(data.futures, d.futures, r => `${r.symbol}|${r.date}|${r.expiry}`).sort(byDate);
        return maxDate([...d.options, ...d.futures]);
      case 'participant_oi': data.participants = mergeBy(data.participants, d, r => `${r.date}|${r.participant}`).sort(byDate); return maxDate(d);
      case 'fiidii':
        data.fiidii = mergeBy(data.fiidii, d, r => r.date, (a, b) => { const o = { ...a }; for (const k in b) if (b[k] !== null) o[k] = b[k]; return o; }).sort(byDate);
        return maxDate(d);
      case 'index_history':
        data.indices[d.name] = mergeBy(data.indices[d.name] || [], d.rows, r => r.date).sort(byDate); return maxDate(d.rows);
      case 'breadth': data.breadth = mergeBy(data.breadth, d, r => r.date).sort(byDate); return maxDate(d);
      case 'announcements': case 'corp_actions': case 'note':
        data.intel = mergeBy(data.intel, d, r => `${r.source}|${r.timestamp}|${r.symbol}|${r.subject}`); return maxDate(d);
      default: throw new Error('Unknown dataset kind ' + res.kind);
    }
  }

  function countRows(res) {
    const d = res.data;
    return Array.isArray(d) ? d.length : d.options ? d.options.length + d.futures.length : d.rows.length;
  }

  /** Add a converted dataset. meta: {mode, file, origin}. persist=true stores uploads in localStorage. */
  function add(res, meta, persist) {
    const asOf = apply(res);
    const src = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), kind: res.kind, label: res.label,
      file: meta.file || null, mode: meta.mode, origin: meta.origin || '', loadedAt: meta.loadedAt || new Date().toISOString(),
      asOf: asOf || null, rows: countRows(res), warnings: res.warnings || [], persisted: false
    };
    if (persist) src.persisted = save(res, src);
    sources.push(src);
    emit();
    return src;
  }

  function save(res, src) {
    try {
      const all = JSON.parse(root.localStorage.getItem(LS_KEY) || '[]');
      all.push({ res, src });
      root.localStorage.setItem(LS_KEY, JSON.stringify(all));
      return true;
    } catch (e) {
      src.warnings.push('Too large to keep in browser storage; this file is loaded for the current session only.');
      return false;
    }
  }

  function restore() {
    let all = [];
    try { all = JSON.parse(root.localStorage.getItem(LS_KEY) || '[]'); } catch (e) { all = []; }
    for (const { res, src } of all) { apply(res); sources.push({ ...src, persisted: true }); }
    return all.length;
  }

  function clearUploads() {
    try { root.localStorage.removeItem(LS_KEY); } catch (e) { /* storage unavailable */ }
  }

  function emit() { listeners.forEach(fn => { try { fn(); } catch (e) { console.error(e); } }); }

  // ---------- query helpers used by modules ----------
  const optionDates = (symbol = 'NIFTY') => [...new Set(data.options.filter(r => r.symbol === symbol).map(r => r.date))].sort();
  const expiriesOn = (date, symbol = 'NIFTY') => [...new Set(data.options.filter(r => r.symbol === symbol && r.date === date).map(r => r.expiry))].filter(Boolean).sort();
  const chain = (date, expiry, symbol = 'NIFTY') => data.options.filter(r => r.symbol === symbol && r.date === date && r.expiry === expiry).sort((a, b) => a.strike - b.strike);
  const summaryOn = date => data.summary.find(r => r.date === date) || null;
  const latestSummary = () => data.summary[data.summary.length - 1] || null;

  /** Best available spot for a date: summary -> bhavcopy underlying -> NIFTY 50 history. Returns {value, source}. */
  function spotOn(date, symbol = 'NIFTY') {
    if (symbol === 'NIFTY') { const s = summaryOn(date); if (s) return { value: s.spot, source: 'daily summary' }; }
    const u = data.options.find(r => r.symbol === symbol && r.date === date && r.underlying > 0);
    if (u) return { value: u.underlying, source: 'bhavcopy underlying' };
    const f = data.futures.find(r => r.symbol === symbol && r.date === date && r.underlying > 0);
    if (f) return { value: f.underlying, source: 'bhavcopy underlying' };
    const name = symbol === 'BANKNIFTY' ? 'NIFTY BANK' : 'NIFTY 50';
    const h = (data.indices[name] || []).find(r => r.date === date);
    return h ? { value: h.close, source: name + ' history' } : { value: null, source: null };
  }

  function sourcesFor(kinds) { return sources.filter(s => kinds.includes(s.kind)); }

  NRP.store = {
    get data() { return data; }, get sources() { return sources; },
    add, restore, clearUploads, reset() { data = empty(); sources = []; },
    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }, emit,
    optionDates, expiriesOn, chain, summaryOn, latestSummary, spotOn, sourcesFor
  };
})(typeof self !== 'undefined' ? self : this);
