/* ══════════════════════════════════════════════════════════════════════════
   CERCARE NELLA FONTE — pannello «Passaggi pertinenti e occorrenze» (15/9/2026)

   Tutto nel renderer: nessun processo esterno, nessun modello da installare,
   nessuna chiamata alla rete. L'ordinamento è BM25 (`cercaBM25` in
   mappai-anchor-core.js), che sul banco di 60 domande italiane recupera quanto
   SQLite FTS5 — Recall@5 88,9% / 96,3% contro il 48,1% / 74,1% del punteggio
   dell'àncora — in meno di un millisecondo e senza dipendenze.

   ⚠️ La pertinenza NON è correttezza. Questo pannello propone dove guardare
   nella fonte; non dice se un'affermazione è vera, e una ricerca senza risultati
   non è un verdetto. Le decisioni restano dove sono sempre state: Accetta /
   Mantieni / Modifica nel registro della revisione.

   Caricato dopo app.js e dopo review/drafts/core (regola 2).
   Interruttore: `mappai_local_search_enabled` = '0' → il pannello non si monta.
   ══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  const core = () => window.MappAILocalSearchCore;
  const state = () => typeof appState !== 'undefined' ? appState : window.appState;
  const tr = (key, fallback) => window.t ? window.t(key, fallback) : fallback;
  /* ⚠️ Il fallback di `t()` È il testo italiano (invariante 14). Per la
     provenienza il codice del branch passava la chiave grezza, e sulla scheda si
     leggeva «original» invece di «Originale». */
  const ORIGINI = { original: 'Originale', reference: 'Fonte di confronto', generated: 'Materiale generato', teacher: 'Testo del docente' };
  const enabled = () => { try { return localStorage.getItem('mappai_local_search_enabled') !== '0'; } catch (_) { return true; } };
  function snapshot() {
    const s = state() || {};
    const review = s._pipelineManifest?.review;
    return core().snapshot({ db: s.db, review, sources: window.MappAIReview?.sources() || s._generationSources || s.sources || [], scope: s.activeVaultPath || 'unsaved:' + (s._generationId || 'session') });
  }
  /* Sincrona di fatto: le frasi si ricavano dallo snapshot corrente e si
     ordinano in memoria. Resta `async` perché i chiamanti la attendono. */
  async function search(query, mode, origins) {
    if (!enabled()) return { status: 'unavailable', results: [] };
    const snap = snapshot();
    const records = snap.records.filter(r => !origins || origins.includes(r.origin));
    return {
      status: snap.diagnostics.length ? 'partial' : 'ready',
      method: 'bm25', semantic: false, revision: snap.revision,
      results: core().lexical(records, query, mode), diagnostics: snap.diagnostics
    };
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
        (found.status === 'partial' ? tr('ls_partial', 'Ricerca pronta; alcune pagine richiedono confronto con l’originale') : tr('ls_ready', 'Ricerca locale pronta')) + ' · ' + (found.results || []).length;
      if (found.diagnostics?.length) {
        const d = document.createElement('details'), s = document.createElement('summary'), p = document.createElement('pre');
        s.textContent = tr('ls_diagnostics', 'Stato e limiti'); p.textContent = JSON.stringify(found.diagnostics, null, 2); d.append(s, p); results.appendChild(d);
      }
      const hits = found.results || [];
      const renderHit = hit => {
        const row = document.createElement('article'); row.className = 'mm-sez';
        const title = document.createElement('h4'); title.textContent = [hit.title, hit.page ? tr('rv_page', 'Pagina') + ' ' + hit.page : '', tr('ls_' + hit.origin, ORIGINI[hit.origin] || hit.origin), hit.kind, hit.branch, hit.role].filter(Boolean).join(' · ');
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
            /* Il PDF non si apre da qui: aprirlo vuole un IPC che risolva il
               percorso del file, e non c'è. Il testo ARCHIVIATO però c'è, ed è
               quello su cui il grounding ha già verificato l'estratto. */
            const p = document.createElement('p'); p.textContent = tr('ls_archived', 'Originale non apribile: è disponibile il testo archiviato.'); detail.appendChild(p);
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
    query.onkeydown = event => { if (event.key === 'Enter') { event.preventDefault(); run('evidence'); } };
    box.append(status, results);
  }
  window.MappAILocalSearch = { enabled, snapshot, search, mount, openOccurrence };
}());
