/* Pure content adapters. Dependencies: review, grounding, drafts, context; before local-search UI. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./mappai-review-core'), require('./mappai-grounding-core'), require('./mappai-material-drafts'), require('./mappai-review-context'), require('./mappai-anchor-core'));
  else root.MappAILocalSearchCore = factory(root.MappAIReviewCore, root.MappAIGroundingCore, root.MappAIMaterialDrafts, root.MappAIReviewContext, root.MappAIAnchorCore);
}(typeof globalThis !== 'undefined' ? globalThis : this, function (RC, G, D, C, A) {
  'use strict';
  const hash = value => RC.revision({ items: [{ id: 'local-search', value }] }, []);
  const eid = x => String(x && typeof x === 'object' ? x.id : x || '');
  const fields = ['question', 'options', 'answer', 'explanation', 'guide', 'criteria', 'text'];
  function snapshot({ db = {}, sources = [], review = null, scope = 'unsaved' }) {
    const records = [], diagnostics = [];
    if (!sources.length) diagnostics.push({ code: 'no_source_text' });
    const add = (record, text) => {
      if (typeof text !== 'string' || !text.trim()) return;
      records.push({ ...record, text, textHash: hash(text), sourceRevision: record.sourceRevision || hash(text), state: 'current' });
    };
    sources.forEach((source, sourceIndex) => {
      if (typeof source === 'string') source = { text: source };
      const origin = source.origin === 'reference' ? 'reference' : source.origin === 'teacher' || G.isTeacherAmendment(source) ? 'teacher' : 'original';
      const title = source.title || source.nome || source.name || source.file?.name || source.url || 'Documento';
      const pages = source.pages || [{ n: source.page || source.n || 0, text: source.content || source.text || '' }];
      const sourceId = String(source.sourceId || source.docId || source.id || 'source-' + sourceIndex);
      const revision = hash(pages);
      if (/\.pdf$/i.test(title) && !source.pdfHash) diagnostics.push({ code: 'legacy_pdf_identity_unverified', title });
      pages.forEach((page, index) => {
        const text = page.text || page.content || '';
        const record = { recordId: 'source:' + sourceId + ':' + index, origin, sourceId, sourceRevision: revision, pdfHash: source.pdfHash || '', page: Number(page.n || page.page || 0), title, url: source.url || '', acquiredAt: source.acquiredAt || '', section: page.section || '' };
        if (/Ohm\s*[à→]\s*W/.test(text)) diagnostics.push({ code: 'symbol_encoding_check_original', title, page: record.page });
        if (/tabella|Grandezza fisica\s+Unità di misura/i.test(text)) diagnostics.push({ code: 'table_layout_check_original', title, page: record.page });
        if (!text.trim() || page.extractionWarning) diagnostics.push({ code: !text.trim() ? 'empty_page' : 'extraction_order', title, page: record.page });
        add(record, text);
      });
    });
    let currentDb = db;
    // Preview map decisions with the same conflict authority used by the editor.
    if (review?.initial?.status === 'awaiting_review') {
      const copy = JSON.parse(JSON.stringify(review));
      copy.initial.issues.forEach(i => { if (!copy.initial.decisions[i.id] || copy.initial.decisions[i.id].choice === 'pending') copy.initial.decisions[i.id] = { choice: 'reject' }; });
      const preview = RC.preview(copy, db, { sources: copy.sources });
      if (preview.ok) currentDb = preview.db;
      else { currentDb = { nodes: [], links: [] }; diagnostics.push({ code: 'map_conflicting_decisions' }); }
    }
    const nodes = new Map((currentDb.nodes || []).map(n => [eid(n.id), n]));
    const decisionFor = (kind, id, field, owner) => (owner?.initial?.issues || []).filter(i => i.target.kind === kind && eid(i.target.id) === id && (!field || i.target.field === field || i.target.field === '$item')).map(i => ({ issueId: i.id, choice: owner.initial.decisions[i.id]?.choice || 'pending' }));
    nodes.forEach((n, id) => ['label', 'desc'].forEach(field => {
      const decisions = decisionFor('node', id, field, review);
      add({ recordId: 'node:' + id + ':' + field, origin: decisions.some(d => ['manual', 'accept'].includes(d.choice)) ? 'teacher' : 'generated', nodeId: id, field, role: field, kind: 'node', title: n.label || '', branch: String(n.group || ''), decisions }, field === 'desc' ? n.desc || n.content : n.label);
    }));
    (currentDb.links || []).forEach((l, i) => {
      const id = eid(l.id) || hash([eid(l.source), eid(l.target), l.rel, i]);
      const decisions = decisionFor('link', id, 'rel', review);
      add({ recordId: 'relation:' + id, origin: decisions.some(d => ['manual', 'accept'].includes(d.choice)) ? 'teacher' : 'generated', relationId: id, relationIndex: i, field: 'rel', role: 'relation', kind: 'relation', decisions: decisionFor('link', id, 'rel', review) }, [nodes.get(eid(l.source))?.label, l.rel || 'include', nodes.get(eid(l.target))?.label].filter(Boolean).join(' → '));
    });
    let items = D.flatten(review?.drafts || {});
    const final = review?.final;
    if (final?.review && Array.isArray(final.items)) {
      const projected = C.occurrenceSnapshot(final.review, final.items, RC);
      if (projected.ok) items = projected.items;
      else { items = []; diagnostics.push({ code: 'material_conflicting_decisions' }); }
    }
    items.forEach(item => {
      const decisions = decisionFor('item', eid(item.id), null, final?.review);
      const base = { itemId: eid(item.id), origin: decisions.some(d => ['manual', 'accept'].includes(d.choice)) ? 'teacher' : 'generated', kind: item.kind, title: item.title || item.question || '', branch: item.source?.areaLabel || item.title || item.draftKey || '', draftRevision: hash(item), decisions };
      if (item.kind === 'causal') add({ ...base, recordId: 'item:' + item.id + ':relation', field: 'text', role: 'relation' }, [item.question, item.text, item.answer].filter(Boolean).join(' → '));
      else fields.forEach(field => {
        const values = Array.isArray(item[field]) ? item[field] : [item[field]];
        values.forEach((value, index) => add({ ...base, recordId: 'item:' + item.id + ':' + field + ':' + index, field, role: field, optionIndex: Array.isArray(item[field]) ? index : null }, typeof value === 'string' ? value : value?.text || value?.criterion || ''));
      });
    });
    return { scope, revision: hash({ records, diagnostics }), records, diagnostics };
  }
  /* La ricerca. Le unità sono le FRASI di frasiDaPagine — le stesse che l'àncora
     usa per le citazioni — e l'ordine lo dà BM25 (mappai-anchor-core.js).
     ⚠️ NON `ancoraNodi`: il suo punteggio è «parole in comune / parole della
     frase», che premia le frasi corte e ignora le parole rare. Misurato sul banco
     di 60 domande italiane, sulle stesse frasi: Recall@5 48,1% / 74,1% col
     punteggio dell'àncora, 88,9% / 96,3% con BM25 — lo stesso di SQLite FTS5,
     senza SQLite. Il ragionamento completo è nel commento sopra cercaBM25. */
  function lexical(records, query, mode) {
    const origins = mode === 'evidence' ? ['original', 'reference'] : ['generated', 'teacher'];
    const selected = records.filter(r => origins.includes(r.origin));
    if (!selected.length) return [];
    /* `page` della frase = indice del record+1, così ogni frase sa da quale
       record viene: è il ponte per riportare titolo, pagina vera e provenienza. */
    const phrases = A.frasiDaPagine(selected.map((r, i) => ({ n: i + 1, text: r.text })),
      { minSentenceWords: 1, maxSentenceChars: 500000 });
    return A.cercaBM25(phrases, query, { max: 20 }).map(hit => ({
      ...selected[hit.page - 1], text: hit.text, scores: { lexical: hit.score, termini: hit.hit }
    }));
  }
  return { snapshot, lexical };
}));
