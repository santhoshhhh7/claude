/* E. Market Intelligence: primary-source links, imported exchange announcements and corporate actions,
 * and user notes. Every item shows its source, timestamp and link. Nothing is generated or summarised
 * automatically, and no headline is shown without a source. */
(function (root) {
  'use strict';
  const NRP = root.NRP, U = NRP.ui, F = U.fmt, H = NRP.shared;
  const f = { q: '', kind: '', source: '' };

  function render(el) {
    const items = NRP.store.data.intel.slice().sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')) || String(b.timestamp || '').localeCompare(String(a.timestamp || '')));
    const kinds = [...new Set(items.map(i => i.kind))], srcs = [...new Set(items.map(i => i.source))];
    const q = f.q.toLowerCase();
    const shown = items.filter(i => (!f.kind || i.kind === f.kind) && (!f.source || i.source === f.source) &&
      (!q || [i.symbol, i.company, i.subject, i.details].some(x => String(x || '').toLowerCase().includes(q)))).slice(0, 500);

    const links = ['nseAnn', 'nseCa', 'bseAnn', 'rbi', 'sebi', 'lot', 'fiidii', 'rbiTbill'].map(k => `<li>${H.srcLink(k)}<div class="muted small">${U.esc(H.SOURCES[k].note)}</div></li>`).join('');

    const list = shown.length ? `<ul class="feed">${shown.map(i => {
      const url = U.safeUrl(i.url);
      return `<li><div class="feed-h"><span class="tag">${U.esc(i.kind)}</span><span class="tag tag-o">${U.esc(i.source)}</span>${i.symbol ? `<b>${U.esc(i.symbol)}</b>` : ''}<span class="muted small">${U.esc(i.timestamp || '')}</span></div>
        <div class="feed-s">${url ? `<a href="${U.esc(url)}" target="_blank" rel="noopener noreferrer">${U.esc(i.subject)} ↗</a>` : U.esc(i.subject)}</div>
        ${i.company ? `<div class="muted small">${U.esc(i.company)}</div>` : ''}
        ${i.details ? `<div class="feed-d">${U.esc(String(i.details).slice(0, 600))}</div>` : ''}
        <div class="muted small">Source file: ${U.esc(i.file || 'manual entry')}${url ? '' : ' · no link in source'}</div></li>`;
    }).join('')}</ul>` : U.empty(items.length ? 'No items match the filters' : 'No announcements imported', items.length ? 'Clear the filters to see all items.' : 'Download announcement or corporate-action CSVs from the links on the left and import them, or add a sourced note below.');

    el.innerHTML = `
      <div class="grid g-1-2">
        <div>
          ${U.panel({ title: 'Primary sources', code: 'E.1', body: `<ul class="src-list">${links}</ul><p class="note">These are links to official pages. This build has no automated news feed, so nothing here is fetched or summarised for you.</p>` })}
          ${U.panel({ title: 'Add a sourced note', code: 'E.2', body: `
            <form id="in-form" class="form form-1">
              <label>Date <input class="inp" type="date" name="date" required value="${new Date().toISOString().slice(0, 10)}"></label>
              <label>Headline <input class="inp" name="subject" required maxlength="200" placeholder="e.g. RBI keeps repo rate unchanged"></label>
              <label>Source URL (http/https, required) <input class="inp" name="url" type="url" required placeholder="https://"></label>
              <label>Symbol (optional) <input class="inp" name="symbol" maxlength="20" placeholder="NIFTY / HDFCBANK"></label>
              <label>Your note <textarea class="inp" name="details" rows="3" maxlength="1000" placeholder="What it means for positioning, and why"></textarea></label>
              <button class="btn" type="submit">Save note</button><span class="muted small" id="in-msg"></span>
            </form>` })}
        </div>
        ${U.panel({ title: 'Announcements, corporate actions and notes', code: 'E.3', prov: U.provenance(['announcements', 'corp_actions', 'note']),
          actions: `<button class="btn btn-xs" id="in-csv" ${shown.length ? '' : 'disabled'}>CSV</button>`,
          body: `<div class="ctl">
            <input class="inp" id="in-q" placeholder="Search symbol, company, subject" value="${U.esc(f.q)}">
            <select class="inp" id="in-k"><option value="">All types</option>${kinds.map(k => U.opt(k, k, f.kind)).join('')}</select>
            <select class="inp" id="in-s"><option value="">All sources</option>${srcs.map(k => U.opt(k, k, f.source)).join('')}</select>
            <span class="muted small">${shown.length} of ${items.length}</span></div>${list}` })}
      </div>`;

    U.$('#in-q', el).addEventListener('change', e => { f.q = e.target.value; render(el); });
    U.$('#in-k', el).addEventListener('change', e => { f.kind = e.target.value; render(el); });
    U.$('#in-s', el).addEventListener('change', e => { f.source = e.target.value; render(el); });
    U.$('#in-csv', el).addEventListener('click', () => {
      const cols = ['date', 'timestamp', 'kind', 'source', 'symbol', 'company', 'subject', 'details', 'url', 'file'];
      U.download('market_intelligence.csv', NRP.csv.toCSV(cols, shown.map(i => cols.map(c => i[c] ?? ''))));
    });
    U.$('#in-form', el).addEventListener('submit', e => {
      e.preventDefault();
      const fd = new FormData(e.target), url = U.safeUrl(String(fd.get('url') || ''));
      const msg = U.$('#in-msg', el);
      if (!url) { msg.textContent = 'A valid http(s) source URL is required.'; return; }
      const subject = String(fd.get('subject') || '').trim();
      if (!subject) { msg.textContent = 'Headline is required.'; return; }
      const now = new Date().toISOString();
      const item = { kind: 'note', source: new URL(url).hostname.replace(/^www\./, ''), timestamp: String(fd.get('date')) + ' (noted ' + F.ts(now) + ')', date: String(fd.get('date')),
        symbol: String(fd.get('symbol') || '').trim().toUpperCase() || null, company: null, subject, details: String(fd.get('details') || '').trim(), url, file: null };
      NRP.store.add({ kind: 'note', label: 'Manual note', data: [item], warnings: [] }, { mode: 'UPLOADED', file: 'Manual note', origin: 'Entered by user with source link' }, true);
    });
  }

  NRP.modules.intel = { title: 'Market Intelligence', code: 'E', render };
})(typeof self !== 'undefined' ? self : this);
