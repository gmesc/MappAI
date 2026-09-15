/* Renderer controller. After review/drafts/core. Electron optional; never calls a cloud API. */
(function () {
  'use strict';
  const core = () => window.MappAILocalSearchCore;
  const state = () => typeof appState !== 'undefined' ? appState : window.appState;
  const tr = (key, fallback) => window.t ? window.t(key, fallback) : fallback;
  let timer, current = null, syncing = null, generation = 0, imports = Promise.resolve();
  const enabled = () => { try { return localStorage.getItem('mappai_local_search_enabled') !== '0'; } catch (_) { return true; } };
  function snapshot() {
    const s = state() || {};
    const review = s._pipelineManifest?.review;
    return core().snapshot({ db: s.db, review, sources: window.MappAIReview?.sources() || s._generationSources || s.sources || [], scope: s.activeVaultPath || 'unsaved:' + (s._generationId || 'session') });
  }
  function notify(detail) { window.dispatchEvent(new CustomEvent('mappai-local-search-state', { detail })); }
  async function sync() {
    if (!enabled()) return { status: 'unavailable' };
    const snap = snapshot();
    if (current?.scope === snap.scope && current?.revision === snap.revision) return current.result;
    if (syncing?.scope === snap.scope && syncing?.revision === snap.revision) return syncing.promise;
    const token = ++generation;
    notify({ status: 'indexing' });
    const promise = (async () => {
      let result;
      try {
        result = window.electronAPI?.localSearch ? await window.electronAPI.localSearch({ ...snap, method: 'sync' }) : { status: 'unavailable', diagnostics: ['electron_unavailable'] };
      } catch (error) { result = { status: 'unavailable', diagnostics: [error.message] }; }
      const now = snapshot();
      if (token !== generation || now.scope !== snap.scope || now.revision !== snap.revision) return { status: 'stale' };
      if (result.status !== 'cancelled' && result.status !== 'stale') current = { ...snap, result };
      if (token === generation) syncing = null;
      notify(result); return result;
    })();
    syncing = { ...snap, promise };
    return promise;
  }
  function schedule() {
    if (!enabled()) return;
    const snap = snapshot();
    if (current?.scope === snap.scope && current?.revision === snap.revision) return;
    clearTimeout(timer);
    // Invalidate displayed hits immediately, before the debounced background update.
    notify({ status: 'updating' });
    timer = setTimeout(() => sync().catch(error => notify({ status: 'unavailable', diagnostics: [error.message] })), 700);
  }
  async function search(query, mode, origins) {
    const snap = snapshot();
    const indexed = await sync();
    let result;
    if (['cancelled', 'stale'].includes(indexed.status)) return { ...indexed, results: [] };
    if (indexed.status === 'unavailable' || !window.electronAPI?.localSearch) {
      result = { status: 'partial', method: 'legacy-lexical', semantic: false, revision: snap.revision, results: core().lexical(snap.records.filter(r => !origins || origins.includes(r.origin)), query, mode), diagnostics: indexed.diagnostics || [] };
    } else result = await window.electronAPI.localSearch({ method: 'search', scope: snap.scope, revision: snap.revision, query, mode, origins });
    if (result.status === 'unavailable') result = { ...result, status: 'partial', semantic: false, method: 'legacy-lexical', results: core().lexical(snap.records, query, mode) };
    const now = snapshot();
    if (now.scope !== snap.scope || now.revision !== snap.revision) return { status: 'stale', results: [] };
    return result;
  }
  function prepare(source, host) {
    if (!enabled() || !window.electronAPI?.localSearch) return;
    const file = source.file;
    const snap = core().snapshot({ sources: [{ id: source.id, title: file?.name || source.title, pages: source.pages, pdfHash: source.pdfHash }], scope: 'import:' + source.pdfHash });
    const status = document.createElement('span'); status.className = 'mm-ctx'; status.setAttribute('role', 'status');
    status.textContent = tr('ls_indexing', 'Indicizzazione locale'); host.appendChild(status);
    imports = imports.catch(() => {}).then(async () => {
      if (!state().sources.includes(source) || source.file !== file) return;
      const result = await window.electronAPI.localSearch({ ...snap, method: 'prepare' });
      if (!status.isConnected || source.file !== file) return;
      status.textContent = !snap.records.length ? tr('ls_scan', 'PDF senza testo leggibile: apri l’originale.') :
        result.semantic ? tr('ls_prepared', 'Indice della fonte preparato') + ' · ' + result.count : tr('ls_lexical', 'Ricerca semantica non disponibile: risultati testuali');
    }).catch(() => { status.textContent = tr('ls_unavailable', 'Ricerca locale non disponibile.'); });
  }
  function openOccurrence(hit) {
    const s = state();
    if (hit.nodeId) return window.openEditModal?.((s.db.nodes || []).find(n => String(n.id) === hit.nodeId));
    if (hit.relationId) {
      const current = snapshot().records.find(r => r.relationId === hit.relationId);
      const link = current ? (s.db.links || [])[current.relationIndex] : null;
      if (link) return window.openValidateModal?.(link);
    }
    if (hit.itemId && s._pipelineManifest?.review?.final?.review?.initial.status === 'awaiting_review')
      return window.MappAIReview.open(s.activeVaultPath, s._pipelineManifest, { final: true, focusItemId: hit.itemId, focusField: hit.field });
    return window.MappAIModal.open({ titolo: hit.title || tr('ls_context', 'Apri il contesto'), taglia: 'm', sezioni: [{ testo: hit.text }] });
  }
  function mount(host, { query: initialQuery = '', onEdit } = {}) {
    if (!host || !enabled()) return;
    const box = document.createElement('details'); box.className = 'mm-sez'; host.appendChild(box);
    const summary = document.createElement('summary'); summary.textContent = tr('ls_title', 'Passaggi pertinenti e occorrenze'); box.appendChild(summary);
    const help = document.createElement('p'); help.textContent = tr('ls_help', 'La pertinenza non certifica la correttezza scientifica. Le prove provengono dalle fonti, le occorrenze dai materiali correnti.'); box.appendChild(help);
    const query = document.createElement('input'); query.type = 'search'; query.className = 'mm-campo'; query.value = String(initialQuery).slice(0, 4000); query.maxLength = 4000;
    query.setAttribute('aria-label', tr('ls_query', 'Testo da cercare')); box.appendChild(query);
    const filter = document.createElement('select'); filter.className = 'mm-campo'; filter.setAttribute('aria-label', tr('ls_filter', 'Provenienza delle prove'));
    [['all', 'ls_all', 'Originali e riferimenti'], ['original', 'ls_original', 'Originali'], ['reference', 'ls_reference', 'Fonti di confronto']].forEach(([value, key, label]) => { const o = document.createElement('option'); o.value = value; o.textContent = tr(key, label); filter.appendChild(o); });
    box.appendChild(filter);
    const status = document.createElement('p'); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
    const results = document.createElement('div'); let request = 0;
    const button = (label, action) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'mm-btn mm-btn--secondario'; b.textContent = label; b.onclick = action; box.appendChild(b); return b; };
    const run = async mode => {
      const token = ++request;
      status.textContent = tr('ls_searching', 'Preparazione dell’indice e ricerca locale…'); results.replaceChildren();
      if (!query.value.trim()) { status.textContent = tr('ls_query', 'Testo da cercare'); return; }
      let found;
      try { found = await search(query.value.trim(), mode, mode === 'evidence' && filter.value !== 'all' ? [filter.value] : undefined); }
      catch (error) { found = { status: 'unavailable', diagnostics: [error.message], results: [] }; }
      if (token !== request || !host.isConnected) return;
      status.textContent = ['cancelled', 'stale', 'unavailable'].includes(found.status) ? tr('ls_' + found.status, found.status) :
        (found.semantic ? (found.status === 'partial' ? tr('ls_partial', 'Ricerca pronta; alcune pagine richiedono confronto con l’originale') : tr('ls_ready', 'Ricerca locale pronta')) : tr('ls_lexical', 'Ricerca semantica non disponibile: risultati testuali')) + ' · ' + (found.results || []).length;
      if (found.diagnostics?.length) {
        const d = document.createElement('details'), s = document.createElement('summary'), p = document.createElement('pre');
        s.textContent = tr('ls_diagnostics', 'Stato e limiti'); p.textContent = JSON.stringify(found.diagnostics, null, 2); d.append(s, p); results.appendChild(d);
      }
      const hits = found.results || [];
      const renderHit = hit => {
        const row = document.createElement('article'); row.className = 'mm-sez';
        const title = document.createElement('h4'); title.textContent = [hit.title, hit.page ? tr('rv_page', 'Pagina') + ' ' + hit.page : '', tr('ls_' + hit.origin, hit.origin), hit.kind, hit.branch, hit.role].filter(Boolean).join(' · ');
        const excerpt = document.createElement('p'); excerpt.textContent = hit.text;
        row.append(title, excerpt);
        const detail = document.createElement('details'), label = document.createElement('summary'), context = document.createElement('p');
        label.textContent = tr('ls_context', 'Apri il contesto');
        const snap = snapshot();
        const original = snap.records.find(r => hit.recordId === r.recordId || hit.recordId.startsWith(r.recordId + ':'));
        const valid = original && (mode !== 'evidence' || window.MappAIGroundingCore.originalExcerpt(original.text, hit.text));
        context.textContent = valid ? original.text : tr('ls_stale', 'Il testo è cambiato: ripeti la ricerca.');
        detail.append(label, context);
        for (const neighbor of hit.neighbors || []) {
          if (neighbor.page === hit.page) continue;
          const originalNeighbor = snap.records.find(r => neighbor.recordId === r.recordId || neighbor.recordId.startsWith(r.recordId + ':'));
          if (!originalNeighbor || !window.MappAIGroundingCore.originalExcerpt(originalNeighbor.text, neighbor.text)) continue;
          const adjacent = document.createElement('p'); adjacent.textContent = tr('rv_page', 'Pagina') + ' ' + neighbor.page + ' · ' + neighbor.text; detail.appendChild(adjacent);
        }
        if (hit.decisions?.length) { const choices = document.createElement('p'); choices.textContent = hit.decisions.map(d => d.issueId + ': ' + d.choice).join(' · '); detail.appendChild(choices); }
        if (mode === 'evidence') {
          const open = document.createElement('button'); open.type = 'button'; open.className = 'mm-btn mm-btn--quieto'; open.textContent = /^https?:\/\//i.test(hit.url || '') ? tr('ls_url', 'Apri pagina della fonte') : tr('ls_pdf', 'Apri PDF originale');
          open.onclick = async () => {
            if (/^https?:\/\//i.test(hit.url || '')) {
              const url = new URL(hit.url);
              if (['http:', 'https:'].includes(url.protocol)) return window.electronAPI?.openExternal?.(url.href);
            }
            const result = await window.electronAPI?.localSearchOpenOriginal?.(hit.recordId);
            if (!result?.ok) { const p = document.createElement('p'); p.textContent = tr('ls_archived', 'Originale non apribile: è disponibile il testo archiviato.'); detail.appendChild(p); }
          };
          detail.appendChild(open);
        } else {
          const edit = document.createElement('button'); edit.type = 'button'; edit.className = 'mm-btn mm-btn--quieto'; edit.textContent = tr('ls_edit', 'Apri nell’editor');
          edit.onclick = () => (onEdit || openOccurrence)(hit); detail.appendChild(edit);
        }
        row.appendChild(detail); results.appendChild(row); window.renderLatexInElement?.(row);
      };
      hits.slice(0, 5).forEach(renderHit);
      if (hits.length > 5) {
        const more = document.createElement('button'); more.type = 'button'; more.className = 'mm-btn mm-btn--quieto'; more.textContent = tr('ls_more', 'Mostra altri passaggi');
        more.onclick = () => { more.remove(); hits.slice(5).forEach(renderHit); }; results.appendChild(more);
      }
      if (!hits.length && !['stale', 'cancelled', 'unavailable'].includes(found.status)) { const empty = document.createElement('p'); empty.textContent = tr('ls_empty', 'Nessun passaggio recuperato. Questo non è un verdetto sull’affermazione.'); results.appendChild(empty); }
    };
    button(tr('ls_evidence', 'Mostra i passaggi pertinenti'), () => run('evidence'));
    button(tr('ls_occurrences', 'Trova altre occorrenze'), () => run('occurrences'));
    button(tr('ls_cancel', 'Annulla ricerca'), () => { request++; window.electronAPI?.localSearch?.({ method: 'cancel' }); status.textContent = tr('ls_cancelled', 'Ricerca annullata.'); });
    query.onkeydown = event => { if (event.key === 'Enter') { event.preventDefault(); run('evidence'); } };
    box.append(status, results);
    const changed = event => {
      if (!host.isConnected) { window.removeEventListener('mappai-local-search-state', changed); return; }
      if (event.detail.status === 'updating') { request++; results.replaceChildren(); status.textContent = tr('ls_updating', 'Indice in aggiornamento: ripeti la ricerca per il testo corrente.'); }
      else if (event.detail.stage === 'indexing' && event.detail.scope === snapshot().scope && event.detail.revision === snapshot().revision) status.textContent = tr('ls_indexing', 'Indicizzazione locale') + ': ' + event.detail.done + '/' + event.detail.total;
    };
    window.addEventListener('mappai-local-search-state', changed);
  }
  window.electronAPI?.onLocalSearchProgress?.(detail => notify(detail));
  window.MappAILocalSearch = { enabled, snapshot, schedule, sync, search, mount, openOccurrence, prepare };
}());
