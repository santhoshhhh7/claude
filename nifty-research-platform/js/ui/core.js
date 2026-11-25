/* UI primitives: formatting, escaping, tables with CSV export, Chart.js wrapper, provenance badges. */
(function (root) {
  'use strict';
  const NRP = root.NRP;
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const ok = v => typeof v === 'number' && Number.isFinite(v);

  const fmt = {
    n: (v, d = 0) => (ok(v) ? v.toLocaleString('en-IN', { minimumFractionDigits: d, maximumFractionDigits: d }) : '—'),
    sgn: (v, d = 2) => (ok(v) ? (v > 0 ? '+' : '') + fmt.n(v, d) : '—'),
    pct: (f, d = 2) => (ok(f) ? fmt.n(f * 100, d) + '%' : '—'),
    spct: (f, d = 2) => (ok(f) ? (f > 0 ? '+' : '') + fmt.n(f * 100, d) + '%' : '—'),
    lakh: (v, d = 1) => (ok(v) ? fmt.n(v / 1e5, d) + ' L' : '—'),
    slakh: (v, d = 1) => (ok(v) ? (v > 0 ? '+' : '') + fmt.n(v / 1e5, d) + ' L' : '—'),
    cr: (v, d = 0) => (ok(v) ? '₹' + fmt.n(v, d) + ' cr' : '—'),
    inr: (v, d = 0) => (ok(v) ? (v < 0 ? '-₹' : '₹') + fmt.n(Math.abs(v), d) : v === Infinity ? 'Unlimited' : v === -Infinity ? 'Unlimited' : '—'),
    date: s => { if (!s) return '—'; const [y, m, d] = s.slice(0, 10).split('-'); return `${+d} ${MON[+m - 1]} ${y}`; },
    dshort: s => { if (!s) return '—'; const [, m, d] = s.slice(0, 10).split('-'); return `${+d} ${MON[+m - 1]}`; },
    ts: iso => { try { return new Date(iso).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }); } catch (e) { return iso; } },
    cls: v => (ok(v) ? (v > 0 ? 'up' : v < 0 ? 'dn' : '') : ''),
    /** Fraction in [0,1] as an ordinal percentile, e.g. 0.98 -> "98th". */
    ord: f => { if (!ok(f)) return '—'; const n = Math.round(f * 100), t = n % 100; return n + (t >= 11 && t <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] || 'th')); }
  };

  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  /** Only http(s) links from imported data are rendered as anchors. */
  const safeUrl = u => (typeof u === 'string' && /^https?:\/\//i.test(u.trim()) ? u.trim() : null);
  const $ = (sel, el = document) => el.querySelector(sel);
  const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
  const css = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

  // ---------- provenance ----------
  const MODE_TEXT = { HISTORICAL: 'HISTORICAL · EOD', UPLOADED: 'UPLOADED · EOD', MODEL: 'MODEL', LIVE: 'LIVE', DELAYED: 'DELAYED' };
  const badge = mode => `<span class="badge b-${esc(mode.toLowerCase())}" title="${esc(MODE_DESC[mode] || '')}">${esc(MODE_TEXT[mode] || mode)}</span>`;
  const MODE_DESC = {
    HISTORICAL: 'End-of-day file bundled with the repository',
    UPLOADED: 'End-of-day file you imported in this browser',
    MODEL: 'Computed by this application from the data and stated assumptions; not a market quote'
  };

  /** One-line provenance for a panel: badge(s) + file + as-of date. */
  function provenance(kinds, extra) {
    const src = NRP.store.sourcesFor(kinds);
    if (!src.length) return `<div class="prov">${badge('MODEL')} <span class="muted">No source data loaded</span></div>`;
    const modes = [...new Set(src.map(s => s.mode))];
    const asOf = src.reduce((m, s) => (s.asOf && s.asOf > m ? s.asOf : m), '');
    const files = src.map(s => esc(s.file)).join(', ');
    return `<div class="prov">${modes.map(badge).join(' ')}${extra ? ' ' + extra : ''} <span class="muted">as of ${fmt.date(asOf)} · ${files}</span></div>`;
  }

  function empty(title, body) {
    return `<div class="empty"><div class="empty-t">${esc(title)}</div><div class="empty-b">${body}</div></div>`;
  }

  // ---------- tables ----------
  const exportRegistry = new Map();
  /** columns: [{key, label, fmt?: (v,row)=>html, cls?: (v,row)=>class, align?: 'l'|'r'|'c', raw?: (row)=>exportValue}] */
  function table({ id, columns, rows, exportName, rowClass, caption, maxHeight }) {
    if (exportName) exportRegistry.set(id, { columns, rows, exportName });
    const head = columns.map(c => `<th class="${c.align === 'l' ? 'l' : c.align === 'c' ? 'c' : ''}">${esc(c.label)}</th>`).join('');
    const body = rows.map(r => `<tr class="${rowClass ? rowClass(r) : ''}">${columns.map(c => {
      const v = typeof c.key === 'function' ? c.key(r) : r[c.key];
      const out = c.fmt ? c.fmt(v, r) : esc(v ?? '—');
      return `<td class="${c.align === 'l' ? 'l' : c.align === 'c' ? 'c' : ''} ${c.cls ? c.cls(v, r) : ''}">${out}</td>`;
    }).join('')}</tr>`).join('');
    const tools = exportName ? `<button class="btn btn-xs" data-export="${esc(id)}" title="Download this table as CSV">CSV</button>` : '';
    return `<div class="tbl-wrap">${caption || tools ? `<div class="tbl-cap"><span>${caption || ''}</span>${tools}</div>` : ''}<div class="tbl-scroll" ${maxHeight ? `style="max-height:${maxHeight}px"` : ''}><table class="tbl" id="${esc(id)}"><thead><tr>${head}</tr></thead><tbody>${body || `<tr><td colspan="${columns.length}" class="c muted">No rows</td></tr>`}</tbody></table></div></div>`;
  }

  function download(name, content, type = 'text/csv') {
    const blob = new Blob([content], { type: type + ';charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  document.addEventListener('click', e => {
    const b = e.target.closest('[data-export]');
    if (!b) return;
    const t = exportRegistry.get(b.dataset.export);
    if (!t) return;
    const headers = t.columns.map(c => c.label);
    const rows = t.rows.map(r => t.columns.map(c => (c.raw ? c.raw(r) : typeof c.key === 'function' ? c.key(r) : r[c.key])));
    download(t.exportName, NRP.csv.toCSV(headers, rows));
  });

  // ---------- charts ----------
  const charts = new Map();
  function palette() {
    return { ink: css('--ink'), mut: css('--mut'), line: css('--line'), acc: css('--acc'), up: css('--up'), dn: css('--dn'),
      call: css('--call'), put: css('--put'), c3: css('--c3'), c4: css('--c4'), band: css('--band') };
  }

  /** Create/replace a Chart.js chart on canvas#id. Falls back to a message if Chart.js is unavailable. */
  function chart(id, config) {
    const cv = document.getElementById(id);
    if (!cv) return null;
    if (charts.has(id)) { charts.get(id).destroy(); charts.delete(id); }
    if (!root.Chart) { cv.parentElement.innerHTML = '<div class="muted c" style="padding:2rem">Chart library could not be loaded (offline?). Tables below still show the data.</div>'; return null; }
    const p = palette();
    const C = root.Chart;
    C.defaults.color = p.mut; C.defaults.borderColor = p.line;
    C.defaults.font.family = css('--font-ui'); C.defaults.font.size = 11;
    const opts = config.options || (config.options = {});
    opts.responsive = true; opts.maintainAspectRatio = false; opts.animation = false;
    opts.interaction = opts.interaction || { mode: 'index', intersect: false };
    opts.plugins = opts.plugins || {};
    opts.plugins.legend = Object.assign({ labels: { boxWidth: 10, boxHeight: 10, color: p.ink } }, opts.plugins.legend || {});
    opts.plugins.tooltip = Object.assign({ backgroundColor: css('--panel'), titleColor: p.ink, bodyColor: p.ink, borderColor: p.line, borderWidth: 1 }, opts.plugins.tooltip || {});
    for (const ax of Object.values(opts.scales || {})) {
      ax.grid = Object.assign({ color: p.line }, ax.grid || {});
      ax.ticks = Object.assign({ color: p.mut }, ax.ticks || {});
    }
    const c = new C(cv, config);
    charts.set(id, c);
    return c;
  }
  const destroyCharts = () => { charts.forEach(c => c.destroy()); charts.clear(); };
  const chartImage = id => (charts.get(id) ? charts.get(id).toBase64Image('image/png', 1) : null);

  /** Horizontal line annotation without a plugin: a flat dataset. */
  const hline = (labels, y, color, label, dash = [4, 4]) => ({ type: 'line', label, data: labels.map(() => y), borderColor: color, borderWidth: 1, borderDash: dash, pointRadius: 0, fill: false });

  function kpi(label, value, sub, cls) {
    return `<div class="kpi"><div class="kpi-l">${esc(label)}</div><div class="kpi-v ${cls || ''}">${value}</div>${sub ? `<div class="kpi-s">${sub}</div>` : ''}</div>`;
  }

  function panel({ title, code, prov, body, actions, cls }) {
    return `<section class="panel ${cls || ''}"><header class="ph"><div class="ph-t">${code ? `<span class="code">${esc(code)}</span>` : ''}${esc(title)}</div><div class="ph-a">${actions || ''}</div></header>${prov ? `<div class="ph-p">${prov}</div>` : ''}<div class="pb">${body}</div></section>`;
  }

  const opt = (v, label, sel) => `<option value="${esc(v)}" ${String(v) === String(sel) ? 'selected' : ''}>${esc(label)}</option>`;

  NRP.ui = { fmt, esc, safeUrl, $, $$, css, badge, provenance, empty, table, download, chart, destroyCharts, chartImage, hline, kpi, panel, opt, palette, MODE_DESC };
})(typeof self !== 'undefined' ? self : this);
