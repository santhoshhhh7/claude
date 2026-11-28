/* RFC 4180 CSV parser: quoted fields, escaped quotes, CRLF, BOM. Also locates the real header row in
 * files that start with a title line (NSE participant-OI files do). */
(function (root, factory) {
  const mod = factory();
  if (typeof module === 'object' && module.exports) module.exports = mod;
  else { root.NRP = root.NRP || {}; root.NRP.csv = mod; }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function parseRows(text) {
    const s = text.replace(/^\uFEFF/, '');
    const rows = [];
    let row = [], f = '', q = false;
    for (let i = 0; i < s.length; i++) {
      const ch = s[i];
      if (q) {
        if (ch === '"') { if (s[i + 1] === '"') { f += '"'; i++; } else q = false; }
        else f += ch;
      } else if (ch === '"') q = true;
      else if (ch === ',') { row.push(f); f = ''; }
      else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && s[i + 1] === '\n') i++;
        row.push(f); f = '';
        if (row.some(c => c.trim() !== '')) rows.push(row);
        row = [];
      } else f += ch;
    }
    row.push(f);
    if (row.some(c => c.trim() !== '')) rows.push(row);
    return rows;
  }

  /** Parse to objects. headerHint: function(cells) -> boolean picks the header row (default: first row). */
  function parse(text, headerHint) {
    const rows = parseRows(text);
    let h = 0;
    if (headerHint) { const k = rows.findIndex(headerHint); if (k >= 0) h = k; }
    const headers = (rows[h] || []).map(c => c.trim());
    const out = [];
    for (let i = h + 1; i < rows.length; i++) {
      const o = {};
      headers.forEach((k, j) => { o[k] = (rows[i][j] ?? '').trim(); });
      out.push(o);
    }
    return { headers, rows: out, skipped: h };
  }

  function toCSV(headers, rows) {
    const esc = v => {
      const s = v === null || v === undefined ? '' : String(v);
      return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    return [headers.map(esc).join(','), ...rows.map(r => headers.map(h => esc(Array.isArray(r) ? r[headers.indexOf(h)] : r[h])).join(','))].join('\n');
  }

  return { parseRows, parse, toCSV };
});
