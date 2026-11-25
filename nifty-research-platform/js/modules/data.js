/* Import centre: CSV / Excel import with type detection, loaded-source register with provenance,
 * editable model assumptions, CSV templates and the list of supported official files. */
(function (root) {
  'use strict';
  const NRP = root.NRP, U = NRP.ui, F = U.fmt, H = NRP.shared;
  let log = [];
  let indexName = '';

  const TEMPLATES = {
    'fii_dii_template.csv': ['Date,FII_Buy,FII_Sell,FII_Net,DII_Buy,DII_Sell,DII_Net'],
    'breadth_template.csv': ['Date,Advances,Declines,Unchanged'],
    'index_history_template.csv': ['Date,Open,High,Low,Close'],
    'daily_summary_template.csv': ['Date,Spot,Call_OI_All,Put_OI_All,PCR_All,Expiry_Nearest,Days_To_Expiry,Call_OI_Near,Put_OI_Near,PCR_Near,Call_OI_Chg_Near,Put_OI_Chg_Near,Net_OI_Chg_Near,MaxPain_Near,Support_Strike,Resistance_Strike,VIX,VIX_Chg'],
    'strike_oi_template.csv': ['Date,Expiry,Strike,Call_OI,Put_OI,Call_OI_Chg,Put_OI_Chg,Call_Volume,Put_Volume,Call_LTP,Put_LTP,Underlying']
  };

  const SUPPORTED = [
    ['NSE F&O bhavcopy (UDiFF)', 'BhavCopy_NSE_FO_0_0_0_YYYYMMDD_F_0000.csv', 'Options chain with prices, IV, Greeks, futures basis and build-up', 'bhav'],
    ['NSE F&O bhavcopy (legacy)', 'foDDMMMYYYYbhav.csv', 'Same as above for pre-July-2024 history (no underlying column)', 'bhav'],
    ['NSE participant-wise OI', 'fao_participant_oi_DDMMYYYY.csv', 'FII / DII / Pro / Client index derivatives positioning', 'participant'],
    ['NSE FII/DII activity', 'CSV from the FII/DII report page, or the template', 'Cash-market flows (₹ crore)', 'fiidii'],
    ['NSE historical index data', 'NIFTY 50, NIFTY BANK, INDIA VIX', 'BANK NIFTY panel, VIX history', 'indices'],
    ['Breadth', 'Date, Advances, Declines', 'Breadth panel', 'breadth'],
    ['NSE / BSE announcements', 'Announcements CSV export', 'Market Intelligence feed with links', 'nseAnn'],
    ['NSE corporate actions', 'Corporate actions CSV export', 'Market Intelligence feed', 'nseCa'],
    ['Original project exports', 'nifty_pcr_maxpain.csv, nifty_strike_oi.csv', 'Daily summary and strike OI (bundled)', null]
  ];

  function render(el) {
    const set = H.settings, srcs = NRP.store.sources;
    el.innerHTML = `
      <div class="grid g-2">
        ${U.panel({ title: 'Import files', code: 'DATA.1', body: `
          <div class="drop" id="dt-drop" tabindex="0" role="button" aria-label="Choose files to import">
            <div><b>Drop CSV / XLSX files here</b> or click to choose</div>
            <div class="muted small">Type is detected from the column headers. Several files at once are fine. Excel needs a one-time download of the SheetJS reader.</div>
            <input type="file" id="dt-file" multiple accept=".csv,.txt,.xlsx,.xls,.xlsm,.ods" hidden>
          </div>
          <label class="small">Index name for index-history files <select class="inp inp-sm" id="dt-idx">
            ${[['', 'Detect from file'], ['NIFTY 50', 'NIFTY 50'], ['NIFTY BANK', 'NIFTY BANK'], ['INDIA VIX', 'INDIA VIX']].map(([v, l]) => U.opt(v, l, indexName)).join('')}</select></label>
          <div id="dt-log">${log.map(r => `<div class="log ${r.ok ? 'ok' : 'err'}">${r.ok ? '✓' : '✕'} <b>${U.esc(r.file)}</b> ${r.ok ? `→ ${U.esc(r.source.label)}, ${F.n(r.source.rows)} rows, as of ${F.date(r.source.asOf)}${r.source.warnings.length ? '<br><span class="muted small">' + r.source.warnings.map(U.esc).join('<br>') + '</span>' : ''}` : U.esc(r.error)}</div>`).join('')}</div>
          <p class="note">Files stay in this browser (localStorage). Nothing is uploaded to a server. Very large files load for the session only.</p>` })}
        ${U.panel({ title: 'Model assumptions', code: 'DATA.2', prov: U.badge('MODEL'), body: `
          <div class="form">
            <label>Risk-free rate r % <input class="inp" type="number" step="0.05" data-set="r" value="${set.r}"></label>
            <label>Dividend yield q % <input class="inp" type="number" step="0.05" data-set="q" value="${set.q}"></label>
            <label>NIFTY lot size <input class="inp" type="number" min="1" step="1" data-set="lot" value="${set.lot}"></label>
            <label>Strike step <input class="inp" type="number" min="1" step="1" data-set="step" value="${set.step}"></label>
            <label>Backtest cost, bps per side <input class="inp" type="number" min="0" step="0.5" data-set="costBps" value="${set.costBps}"></label>
          </div>
          <button class="btn btn-sm" id="dt-defaults">Restore defaults</button>
          <ul class="plain small">
            <li>r: placeholder ${H.DEFAULTS.r}%. ${U.esc(set.rateNote)} ${H.srcLink('rbiTbill')}</li>
            <li>Lot size ${H.DEFAULTS.lot}: inferred from the bundled OI values (all multiples of 65), which matches the lot size reported for 2026. Lot sizes are revised by circular: ${H.srcLink('lot')}</li>
            <li>Cost: an estimate for index futures including statutory charges and slippage; confirm with your broker.</li>
          </ul>` })}
      </div>
      ${U.panel({ title: 'Loaded sources', code: 'DATA.3', actions: `<button class="btn btn-xs btn-warn" id="dt-clear" ${srcs.some(s => s.mode === 'UPLOADED') ? '' : 'disabled'}>Remove all uploads</button>`,
        body: U.table({ id: 'dt-src', exportName: 'data_sources.csv', columns: [
          { key: 'mode', label: 'Mode', align: 'l', fmt: v => U.badge(v), raw: s => s.mode }, { key: 'label', label: 'Dataset', align: 'l' },
          { key: 'file', label: 'File', align: 'l', fmt: v => `<span class="mono small">${U.esc(v)}</span>` }, { key: 'origin', label: 'Origin', align: 'l', fmt: v => `<span class="small">${U.esc(v)}</span>` },
          { key: 'asOf', label: 'Data as of', fmt: F.date }, { key: 'loadedAt', label: 'Loaded', fmt: F.ts }, { key: 'rows', label: 'Rows', fmt: v => F.n(v) },
          { key: 'persisted', label: 'Saved', fmt: (v, s) => (s.mode === 'HISTORICAL' ? 'bundled' : v ? 'yes' : 'session') },
          { key: 'warnings', label: 'Notes', align: 'l', fmt: v => `<span class="small muted">${v.map(U.esc).join('<br>')}</span>`, raw: s => s.warnings.join(' | ') }
        ], rows: srcs }) + `<p class="note">${Object.entries(U.MODE_DESC).map(([k, v]) => `${U.badge(k)} ${U.esc(v)}`).join(' · ')}. This build has no LIVE or DELAYED feed.</p>` })}
      <div class="grid g-2-1">
        ${U.panel({ title: 'Supported files and where to get them', code: 'DATA.4', body: U.table({ id: 'dt-sup', columns: [
          { key: 0, label: 'File', align: 'l' }, { key: 1, label: 'Name / format', align: 'l', fmt: v => `<span class="mono small">${U.esc(v)}</span>` },
          { key: 2, label: 'Enables', align: 'l' }, { key: 3, label: 'Source', align: 'l', fmt: v => (v ? H.srcLink(v) : 'Your pipeline') }
        ], rows: SUPPORTED }) })}
        ${U.panel({ title: 'CSV templates', code: 'DATA.5', body: `<p class="small">Header-only templates for building a file by hand. Fill rows from an official source and keep the source link.</p>
          <div class="btn-col">${Object.keys(TEMPLATES).map(n => `<button class="btn btn-sm" data-tpl="${U.esc(n)}">${U.esc(n)}</button>`).join('')}</div>` })}
      </div>`;

    const inp = U.$('#dt-file', el), drop = U.$('#dt-drop', el);
    const go = async files => {
      if (!files.length) return;
      drop.classList.add('busy');
      const res = await NRP.importer.importFiles([...files], { indexName: indexName || null });
      log = res.concat(log).slice(0, 30);
      render(el); // store.add already emitted; ensure log is visible even if no file succeeded
    };
    drop.addEventListener('click', () => inp.click());
    drop.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); inp.click(); } });
    inp.addEventListener('change', () => go(inp.files));
    ['dragenter', 'dragover'].forEach(t => drop.addEventListener(t, e => { e.preventDefault(); drop.classList.add('over'); }));
    ['dragleave', 'drop'].forEach(t => drop.addEventListener(t, e => { e.preventDefault(); drop.classList.remove('over'); }));
    drop.addEventListener('drop', e => go(e.dataTransfer.files));
    U.$('#dt-idx', el).addEventListener('change', e => { indexName = e.target.value; });
    el.querySelectorAll('[data-set]').forEach(i => i.addEventListener('change', () => { H.setSettings({ [i.dataset.set]: Math.max(i.dataset.set === 'r' || i.dataset.set === 'q' ? -5 : 0, +i.value) }); NRP.store.emit(); }));
    U.$('#dt-defaults', el).addEventListener('click', () => { H.setSettings({ ...H.DEFAULTS }); NRP.store.emit(); });
    U.$('#dt-clear', el).addEventListener('click', () => {
      if (!root.confirm('Remove every imported file and note from this browser? Bundled data stays.')) return;
      NRP.store.clearUploads(); NRP.app.reload();
    });
    el.querySelectorAll('[data-tpl]').forEach(b => b.addEventListener('click', () => U.download(b.dataset.tpl, TEMPLATES[b.dataset.tpl].join('\n') + '\n')));
  }

  NRP.modules.data = { title: 'Data & Import', code: 'DATA', render };
})(typeof self !== 'undefined' ? self : this);
