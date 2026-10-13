/* Packet 0070 / ADR 0017 — contratto testuale puro, senza DOM, disco o AI.
 * Gli ID e le revisioni arrivano dal chiamante: nessun ID derivato dal testo.
 * projectPublicContent è una proiezione, NON un gate o un'esportazione:
 * il controller deve ancora verificare G1/G2, persistere e congelare la versione.
 * Le conferme passate a selectReviewed sono ricevute del controller dopo il
 * clic e il salvataggio; questo modulo non decide né fabbrica stati del Banco.
 */
(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory(require('node:crypto').webcrypto, require('./mappai-docedit-core'));
  else root.MappAIPercorsoLetturaCore = factory(undefined, root.MappAIDocEdit);
}(typeof globalThis !== 'undefined' ? globalThis : this, function (crypto, Rich) {
  'use strict';
  // WebCrypto è nativo del browser, non una dipendenza da uno script MappAI.
  crypto = crypto || (typeof globalThis !== 'undefined' ? globalThis.crypto : null);

  const FORMATS = Object.freeze(['open', 'mc']);
  const DIFFICULTIES = Object.freeze(['base', 'intermedia', 'avanzata']);
  const OPERATIONS = Object.freeze(['lessico', 'coesione', 'informazioni-esplicite', 'sequenze-cause',
    'inferenze', 'senso-funzione', 'reinserimento', 'presenza-assenza']);
  const BLOCK_TYPES = Object.freeze(['paragraph', 'heading', 'dialogue', 'list-item']);
  const own = (o, key) => Object.prototype.hasOwnProperty.call(o, key);
  const copy = value => JSON.parse(JSON.stringify(value));
  const escapeText = value => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const normalizedText = value => String(value).replace(/\s+/g, ' ').trim();
  function richPlain(html) { check(Rich, 'inline.core'); return html.split(/<br\s*\/?\s*>/i).map(s => Rich.plainText(s)).join('\n'); }
  function sanitizeInline(html) {
    check(Rich && typeof html === 'string', 'inline.html');
    // Il sanitizer comune accorpa i br: nel percorso sono impaginazione del
    // docente. Proteggili come testo durante la pulizia, senza saltarla.
    let marker = '\uE000'; while (html.includes(marker)) marker += '\uE000';
    return Rich.sanitizeInline(html.replace(/<br\s*\/?\s*>/gi, marker)).split(marker).join('<br>');
  }
  function inlineHtml(item, field, value) {
    const html = item.inline?.[field];
    return Rich && typeof html === 'string' && normalizedText(richPlain(html)) === normalizedText(value) ? sanitizeInline(html) : escapeText(value);
  }
  function inlineFields(item, publicOnly) {
    const fields = { question: item.question, ...(item.help !== undefined ? { help: item.help } : {}) };
    (item.options || []).forEach((o, i) => { fields['option-' + i] = o.text; });
    if (!publicOnly) {
      fields.answer = item.teacher.answer;
      Object.entries(item.teacher.teaching || {}).forEach(([k, v]) => { fields['teaching-' + k] = v; });
      (item.options || []).forEach((o, i) => { fields['reason-' + i] = item.teacher.distractors?.find(d => d.optionId === o.id)?.reason || ''; });
    }
    return fields;
  }
  function validateInline(item, publicOnly, path) {
    if (!own(item, 'inline')) return;
    object(item.inline, path + '.inline'); const fields = inlineFields(item, publicOnly);
    Object.entries(item.inline).forEach(([k, html]) => {
      check(own(fields, k) && typeof html === 'string' && sanitizeInline(html) === html &&
        normalizedText(richPlain(html)) === normalizedText(fields[k]), path + '.inline.' + k);
    });
  }

  function _tSafe(key, fallback) {
    return typeof window !== 'undefined' && typeof window.t === 'function' ? window.t(key, fallback) : fallback;
  }
  function check(ok, path) {
    if (ok) return;
    const error = new Error(_tSafe('rv_structure_invalid', 'Correggi o escludi gli elementi con campi non validi prima di completare i materiali.') + ' (' + path + ')');
    error.code = 'invalid_reading_path'; error.path = path;
    throw error;
  }
  function object(value, path) { check(value !== null && typeof value === 'object' && !Array.isArray(value), path); }
  function text(value, path) { check(typeof value === 'string' && value.trim().length > 0, path); }
  function id(value, path) { check(typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(value), path); }
  function revision(value, path) { check(Number.isSafeInteger(value) && value > 0, path); }
  function list(value, path) { check(Array.isArray(value), path); }
  function oneOf(value, values, path) { check(values.includes(value), path); }
  function keys(value, allowed, path) {
    object(value, path);
    check(Object.keys(value).every(key => allowed.includes(key)), path + '.fields');
  }
  function unique(rows, field, path) {
    const seen = new Set();
    rows.forEach((row, i) => {
      object(row, path + '[' + i + ']'); id(row[field], path + '[' + i + '].' + field);
      check(!seen.has(row[field]), path + '.duplicate'); seen.add(row[field]);
    });
    return seen;
  }

  // Testo esatto, anche a capo e spazi. Le enfasi sono intervalli UTF-16,
  // non markup HTML: nessuna stringa della fonte viene interpretata come tag.
  function source(value, publicOnly) {
    object(value, 'source');
    if (publicOnly) keys(value, ['sourceId', 'sourceRevision', 'paragraphs'], 'source');
    id(value.sourceId, 'source.sourceId'); revision(value.sourceRevision, 'source.sourceRevision');
    list(value.paragraphs, 'source.paragraphs'); check(value.paragraphs.length > 0, 'source.paragraphs.empty');
    unique(value.paragraphs, 'id', 'source.paragraphs');
    value.paragraphs.forEach((p, i) => {
      const at = 'source.paragraphs[' + i + ']';
      if (publicOnly) keys(p, ['id', 'type', 'text', 'emphasis'], at);
      oneOf(p.type, BLOCK_TYPES, at + '.type'); text(p.text, at + '.text');
      list(p.emphasis, at + '.emphasis');
      p.emphasis.forEach((e, j) => {
        const ep = at + '.emphasis[' + j + ']';
        keys(e, ['start', 'end', 'kind'], ep);
        check(Number.isSafeInteger(e.start) && Number.isSafeInteger(e.end) && e.start >= 0 &&
          e.end > e.start && e.end <= p.text.length, ep + '.range');
        // Non dividere una coppia surrogata (es. lettere fuori dal BMP).
        [e.start, e.end].forEach(n => check(!(n > 0 && n < p.text.length &&
          /[\uD800-\uDBFF]/.test(p.text[n - 1]) && /[\uDC00-\uDFFF]/.test(p.text[n])), ep + '.boundary'));
        oneOf(e.kind, ['strong', 'em'], ep + '.kind');
      });
    });
    if (!publicOnly) object(value.provenance, 'source.provenance');
  }
  function reference(value, ids, path) {
    keys(value, ['scope', 'paragraphIds'], path);
    oneOf(value.scope, ['passages', 'whole'], path + '.scope');
    list(value.paragraphIds, path + '.paragraphIds');
    check(value.scope === 'whole' ? value.paragraphIds.length === 0 : value.paragraphIds.length > 0, path + '.scope');
    check(new Set(value.paragraphIds).size === value.paragraphIds.length &&
      value.paragraphIds.every(pid => ids.has(pid)), path + '.paragraphIds');
  }
  function activity(value, ids, publicOnly, path) {
    object(value, path); id(value.id, path + '.id'); revision(value.revision, path + '.revision');
    oneOf(value.format, FORMATS, path + '.format'); text(value.question, path + '.question');
    if (own(value, 'help')) check(typeof value.help === 'string', path + '.help');
    if (!publicOnly && own(value, 'includeHelp')) check(typeof value.includeHelp === 'boolean', path + '.includeHelp');
    if (publicOnly) keys(value, value.format === 'mc' ?
      ['id', 'revision', 'format', 'question', 'help', 'inline', 'reference', 'options'] :
      ['id', 'revision', 'format', 'question', 'help', 'inline', 'reference', 'lines'], path);
    reference(value.reference, ids, path + '.reference');
    if (value.format === 'mc') {
      list(value.options, path + '.options'); check([3, 4].includes(value.options.length), path + '.options.length');
      unique(value.options, 'id', path + '.options');
      value.options.forEach((option, i) => {
        if (publicOnly) keys(option, ['id', 'text'], path + '.options[' + i + ']');
        text(option.text, path + '.options[' + i + '].text');
        check(/[.?!…]$/.test(option.text.trimEnd()), path + '.options[' + i + '].punctuation');
      });
    } else check(Number.isSafeInteger(value.lines) && value.lines >= 1 && value.lines <= 100, path + '.lines');
    if (publicOnly) { validateInline(value, true, path); return; }
    oneOf(value.operation, OPERATIONS, path + '.operation');
    oneOf(value.difficulty, DIFFICULTIES, path + '.difficulty');
    object(value.teacher, path + '.teacher');
    text(value.teacher.answer, path + '.teacher.answer');
    list(value.teacher.criteria, path + '.teacher.criteria');
    value.teacher.criteria.forEach(v => text(v, path + '.teacher.criteria'));
    list(value.teacher.evidence, path + '.teacher.evidence');
    value.teacher.evidence.forEach(e => {
      object(e, path + '.teacher.evidence');
      check(ids.has(e.paragraphId), path + '.teacher.evidence.paragraphId');
      text(e.quote, path + '.teacher.evidence.quote');
      // La validità verbatim/provenienza spetta al grounding, non a questo schema.
    });
    if (value.format === 'mc') {
      check(value.options.some(o => o.id === value.teacher.correctOptionId), path + '.teacher.correctOptionId');
      list(value.teacher.distractors, path + '.teacher.distractors');
      const distractors = unique(value.teacher.distractors, 'optionId', path + '.teacher.distractors');
      check(distractors.size === value.options.length - 1 && value.options.filter(o => o.id !== value.teacher.correctOptionId)
        .every(o => distractors.has(o.id)), path + '.teacher.distractors');
      value.teacher.distractors.forEach(d => text(d.reason, path + '.teacher.distractors.reason'));
    }
    validateInline(value, false, path);
  }
  function sequence(value, paragraphIds, activityIds) {
    list(value, 'sequence');
    const seen = new Set();
    value.forEach((block, i) => {
      const at = 'sequence[' + i + ']';
      object(block, at); oneOf(block.kind, ['paragraph', 'activity'], at + '.kind');
      const field = block.kind === 'paragraph' ? 'paragraphId' : 'activityId';
      keys(block, ['kind', field], at);
      check((block.kind === 'paragraph' ? paragraphIds : activityIds).has(block[field]), at + '.' + field);
      const key = block.kind + ':' + block[field];
      check(!seen.has(key), at + '.duplicate'); seen.add(key);
    });
    check(seen.size === paragraphIds.size + activityIds.size, 'sequence.missing');
  }
  function validateDraft(draft) {
    object(draft, 'draft'); check(draft.schemaVersion === 1 && draft.kind === 'percorso-lettura', 'draft.schema');
    id(draft.projectId, 'projectId'); id(draft.percorsoId, 'percorsoId');
    text(draft.title, 'title'); text(draft.language, 'language'); source(draft.source, false);
    list(draft.activities, 'activities');
    const aids = unique(draft.activities, 'id', 'activities');
    const pids = new Set(draft.source.paragraphs.map(p => p.id));
    draft.activities.forEach((a, i) => activity(a, pids, false, 'activities[' + i + ']'));
    sequence(draft.sequence, pids, aids);
    return true;
  }
  function validatePublicContent(content) {
    keys(content, ['source', 'activities', 'sequence'], 'content'); source(content.source, true);
    list(content.activities, 'activities');
    const aids = unique(content.activities, 'id', 'activities');
    const pids = new Set(content.source.paragraphs.map(p => p.id));
    content.activities.forEach((a, i) => activity(a, pids, true, 'activities[' + i + ']'));
    sequence(content.sequence, pids, aids);
    return true;
  }
  function initialSequence(paragraphs, activities) {
    list(paragraphs, 'paragraphs'); list(activities, 'activities');
    unique(paragraphs, 'id', 'paragraphs'); unique(activities, 'id', 'activities');
    return paragraphs.map(p => ({ kind: 'paragraph', paragraphId: p.id }))
      .concat(activities.map(a => ({ kind: 'activity', activityId: a.id })));
  }
  function moveBlock(draft, index, direction) {
    validateDraft(draft);
    check(Number.isSafeInteger(index) && index >= 0 && index < draft.sequence.length, 'move.index');
    check(direction === -1 || direction === 1, 'move.direction');
    const result = copy(draft), next = index + direction;
    if (next >= 0 && next < result.sequence.length) {
      [result.sequence[index], result.sequence[next]] = [result.sequence[next], result.sequence[index]];
    }
    return result;
  }
  function selected(draft, ids) {
    list(ids, 'activityIds'); check(new Set(ids).size === ids.length, 'activityIds.duplicate');
    const byId = new Map(draft.activities.map(a => [a.id, a]));
    return ids.map(aid => { check(byId.has(aid), 'activityIds.unknown'); return byId.get(aid); });
  }
  function publicSource(value) {
    return { sourceId: value.sourceId, sourceRevision: value.sourceRevision,
      paragraphs: value.paragraphs.map(p => ({ id: p.id, type: p.type, text: p.text,
        emphasis: p.emphasis.map(e => ({ start: e.start, end: e.end, kind: e.kind })) })) };
  }
  function publicActivity(value, options) {
    const out = { id: value.id, revision: value.revision, format: value.format, question: value.question,
      reference: { scope: value.reference.scope, paragraphIds: value.reference.paragraphIds.slice() } };
    if (options?.includeHelp !== false && value.includeHelp !== false && value.help?.trim()) out.help = value.help;
    if (value.format === 'mc') out.options = value.options.map(o => ({ id: o.id, text: o.text }));
    else out.lines = value.lines;
    if (value.inline) {
      const fields = inlineFields(out, true), entries = Object.entries(value.inline).filter(([k]) => own(fields, k));
      if (entries.length) out.inline = Object.fromEntries(entries);
    }
    return out;
  }
  function projectPublicContent(draft, activityIds, options) {
    validateDraft(draft);
    const activities = selected(draft, activityIds), selectedIds = new Set(activityIds);
    // I posti delle attività scelte restano intercalati; l'ordine delle domande
    // è quello esplicito della selezione. Tutti i passaggi restano consultabili.
    let index = 0;
    const content = { source: publicSource(draft.source), activities: activities.map(a => publicActivity(a, options)),
      sequence: draft.sequence.filter(b => b.kind === 'paragraph' || selectedIds.has(b.activityId)).map(b =>
        b.kind === 'paragraph' ? { kind: 'paragraph', paragraphId: b.paragraphId } :
          { kind: 'activity', activityId: activityIds[index++] }) };
    validatePublicContent(content);
    return content;
  }
  function resolveReference(content, activityId) {
    validatePublicContent(content);
    const a = content.activities.find(row => row.id === activityId);
    check(!!a, 'activityId');
    const byId = new Map(content.source.paragraphs.map(p => [p.id, p]));
    return { scope: a.reference.scope, paragraphs: copy(a.reference.scope === 'whole' ?
      content.source.paragraphs : a.reference.paragraphIds.map(pid => byId.get(pid))) };
  }

  // SHA-256 nativo, nessuna libreria né seconda copia dell'hash del ReviewCore.
  // Chiavi ordinate per rendere uguali oggetti JSON letti in ordini diversi;
  // gli array mantengono il loro ordine (compreso l'ordine canonico della fonte).
  function canonical(value) {
    if (Array.isArray(value)) return value.map(canonical);
    if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort()
      .map(key => [key, canonical(value[key])]));
    check(value === null || typeof value === 'string' || typeof value === 'boolean' ||
      (typeof value === 'number' && Number.isFinite(value)), 'fingerprint.json');
    return value;
  }
  async function digest(value) {
    check(crypto && crypto.subtle && typeof TextEncoder !== 'undefined', 'fingerprint.crypto');
    const bytes = new TextEncoder().encode(JSON.stringify(canonical(value)));
    const hash = await crypto.subtle.digest('SHA-256', bytes);
    return 'sha256-' + Array.from(new Uint8Array(hash), n => n.toString(16).padStart(2, '0')).join('');
  }
  async function sourceFingerprint(draft) {
    validateDraft(draft);
    return digest({ projectId: draft.projectId, percorsoId: draft.percorsoId, source: draft.source });
  }
  async function activityFingerprint(draft, activityId) {
    validateDraft(draft);
    const a = selected(draft, [activityId])[0];
    return digest({ projectId: draft.projectId, percorsoId: draft.percorsoId, source: draft.source, activity: a });
  }
  async function selectReviewed(draft, activityIds, confirmations) {
    validateDraft(draft); list(confirmations, 'confirmations');
    unique(confirmations, 'activityId', 'confirmations');
    const receipts = new Map(confirmations.map(c => [c.activityId, c]));
    selected(draft, activityIds);
    // Fotografia prima del primo await: il chiamante può cambiare progetto
    // o modificare il testo mentre WebCrypto termina il calcolo.
    const snapshot = copy(draft), frozenIds = activityIds.slice(), frozenReceipts = copy(Array.from(receipts.values()));
    const byId = new Map(frozenReceipts.map(c => [c.activityId, c]));
    for (const aid of frozenIds) {
      const c = byId.get(aid);
      check(c && c.confirmed === true && c.persisted === true && c.pending === false && c.excluded === false &&
        ['rivisto', 'approvato'].includes(c.state), 'confirmations.' + aid);
      check(c.fingerprint === await activityFingerprint(snapshot, aid), 'confirmations.' + aid + '.stale');
    }
    return copy(selected(snapshot, frozenIds));
  }
  // L'estrazione conserva il testo grezzo nella provenienza; il docente conferma
  // struttura ed enfasi prima della generazione. Gli ID sono coniati una volta.
  function importSource(input, newId) {
    object(input, 'import'); text(input.text, 'import.text');
    oneOf(input.kind, ['text', 'pdf', 'docx'], 'import.kind');
    check(typeof newId === 'function', 'import.ids');
    const raw = input.text, pages = input.pages == null ? [] : copy(input.pages);
    list(pages, 'import.pages');
    pages.forEach(p => { check(Number.isSafeInteger(p.n) && p.n > 0, 'import.page'); check(typeof p.text === 'string', 'import.page.text'); });
    // Nessuna de-sillabazione o fusione di parole automatica. Il ritorno singolo
    // resta nel blocco: non viene spacciato per un nuovo paragrafo.
    const paragraphs = raw.replace(/\r\n?/g, '\n').split(/\n[ \t]*\n+/)
      .filter(value => value.trim()).map(value => ({ id: newId(), type: 'paragraph', text: value, emphasis: [] }));
    const draft = { schemaVersion: 1, kind: 'percorso-lettura', projectId: input.projectId,
      percorsoId: input.percorsoId, title: input.title, language: input.language,
      source: { sourceId: input.sourceId, sourceRevision: 1,
        provenance: { kind: input.kind, name: input.name || input.title, originalText: raw, pages,
          structureConfirmed: false, emphasisRecovered: false }, paragraphs }, activities: [],
      sequence: initialSequence(paragraphs, []) };
    validateDraft(draft); return draft;
  }
  function sourceReviewDb(draft) {
    validateDraft(draft);
    return { items: draft.source.paragraphs.map((p, order) => ({ id: p.id, kind: 'reading-paragraph',
      text: p.text, blockType: p.type, emphasis: copy(p.emphasis), order })) };
  }
  function applySourceReview(draft, db) {
    validateDraft(draft); object(db, 'sourceReview'); list(db.items, 'sourceReview.items');
    const expected = new Set(draft.source.paragraphs.map(p => p.id));
    unique(db.items, 'id', 'sourceReview.items');
    check(db.items.length === expected.size, 'sourceReview.count');
    const orders = new Set();
    db.items.forEach(p => {
      keys(p, ['id', 'kind', 'text', 'blockType', 'emphasis', 'order'], 'sourceReview.item');
      check(expected.has(p.id) && p.kind === 'reading-paragraph', 'sourceReview.identity');
      check(Number.isSafeInteger(p.order) && p.order >= 0 && p.order < expected.size && !orders.has(p.order), 'sourceReview.order');
      const before = draft.source.paragraphs.find(row => row.id === p.id);
      check(!before.emphasis.length || before.text === p.text, 'sourceReview.emphasis.recheck');
      orders.add(p.order);
    });
    const next = copy(draft);
    next.source.paragraphs = copy(db.items).sort((a, b) => a.order - b.order)
      .map(p => ({ id: p.id, type: p.blockType, text: p.text, emphasis: p.emphasis }));
    validateDraft(next); return next;
  }
  // Il Banco modifica soltanto i campi che sa mostrare. Gli ID delle opzioni,
  // i rimandi e la guida privata restano collegati alla bozza canonica.
  // La revisione non entra nella proiezione: aumenta sul disco dopo la modifica,
  // senza cambiare l'impronta degli item che il docente ha appena approvato.
  function activitiesReviewDb(draft) {
    validateDraft(draft);
    return { items: draft.activities.map(a => {
      const reading = copy(a);
      ['id', 'revision', 'format', 'question', 'options'].forEach(k => { delete reading[k]; });
      ['answer', 'criteria', 'correctOptionId'].forEach(k => { delete reading.teacher[k]; });
      const item = { id: a.id, kind: a.format, question: a.question, criteria: copy(a.teacher.criteria), reading };
      if (a.format === 'mc') Object.assign(item, { options: a.options.map(o => o.text),
        optionIds: a.options.map(o => o.id), correctIndex: a.options.findIndex(o => o.id === a.teacher.correctOptionId),
        explanation: a.teacher.answer });
      else item.guide = a.teacher.answer;
      // lines resta in reading: il percorso ammette 1–100 righe, il Banco 3–12.
      return item;
    }) };
  }
  // Recupero del vecchio salvataggio: il canonico aveva già rimosso la sola
  // enfasi obsoleta, ma il journal attendeva ancora quell'HTML. Nessun recupero
  // se testo, identità, soluzioni, riferimenti o altra formattazione differiscono.
  function recoverActivitiesApproval(review, db, Review) {
    if (review.initial.status !== 'applying' ||
        [review.baseRevision, review.approvedRevision].includes(Review.revision(db, review.sources))) return review;
    check(Review.revision(review.approvedSnapshot, review.sources) === review.approvedRevision, 'approval.snapshot');
    const next = copy(review);
    for (const item of next.approvedSnapshot.items) {
      if (!item.reading?.inline) continue;
      const fields = inlineFields({ ...item.reading, question: item.question,
        options: (item.options || []).map((text, i) => ({ id: item.optionIds[i], text })),
        teacher: { ...item.reading.teacher, answer: item.kind === 'mc' ? item.explanation : item.guide } }, false);
      item.reading.inline = Object.fromEntries(Object.entries(item.reading.inline).filter(([k, html]) =>
        own(fields, k) && normalizedText(richPlain(html)) === normalizedText(fields[k])));
      if (!Object.keys(item.reading.inline).length) delete item.reading.inline;
    }
    next.approvedRevision = Review.revision(next.approvedSnapshot, review.sources);
    check(next.approvedRevision === Review.revision(db, review.sources) &&
      JSON.stringify(canonical(next.approvedSnapshot)) === JSON.stringify(canonical(Review.semanticSnapshot(db))), 'approval.snapshot');
    next.readingProjectionRecovery = { previousApprovedRevision: review.approvedRevision };
    return next;
  }
  // Il Banco conserva i metadati di partenza quando il docente elimina D.
  // Congela la proiezione effettivamente persistibile, conservando decisioni e
  // base originali. Il retry verifica la stessa proiezione prima e dopo la scrittura.
  function beginActivitiesApproval(draft, review, db, options, Review) {
    const applying = review.initial.status === 'applying';
    const result = applying ? Review.preview(review, db, options) : Review.beginApproval(review, db, options);
    if (!result.ok) return { ...result, review: result.review || copy(review) };
    const projected = activitiesReviewDb(applyActivitiesReview(draft, result.db));
    const snapshot = Review.semanticSnapshot(projected), revision = Review.revision(projected, review.sources);
    if (applying) {
      check(revision === review.approvedRevision &&
        JSON.stringify(canonical(snapshot)) === JSON.stringify(canonical(review.approvedSnapshot)), 'approval.snapshot');
      return { ...result, review: copy(review) };
    }
    result.review.approvedSnapshot = snapshot; result.review.approvedRevision = revision;
    return result;
  }
  function applyActivitiesReview(draft, db) {
    validateDraft(draft); keys(db, ['items'], 'activitiesReview'); list(db.items, 'activitiesReview.items');
    unique(db.items, 'id', 'activitiesReview.items');
    const base = new Map(activitiesReviewDb(draft).items.map(item => [item.id, item]));
    const changed = new Map(), same = (a, b) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
    db.items.forEach(item => {
      const at = 'activitiesReview.' + item.id, before = base.get(item.id);
      check(before && item.kind === before.kind, at + '.identity');
      keys(item, Object.keys(before), at);
      check(Object.keys(before).every(k => own(item, k)), at + '.fields');
      check(same(item.reading, before.reading), at + '.metadata');
      text(item.question, at + '.question'); list(item.criteria, at + '.criteria');
      item.criteria.forEach(value => text(value, at + '.criteria'));
      const a = copy(draft.activities.find(row => row.id === item.id));
      a.question = item.question; a.teacher.criteria = copy(item.criteria);
      if (a.format === 'mc') {
        check(same(item.optionIds, before.optionIds), at + '.optionIds');
        list(item.options, at + '.options'); check([3, 4].includes(item.options.length) && item.options.length <= a.options.length, at + '.options');
        // Una nuova chiave richiede anche nuove ragioni per i distrattori. Il
        // Banco generico non le modifica: non le inventiamo dal vecchio testo.
        check(item.correctIndex === before.correctIndex, at + '.correctIndex.recheck');
        text(item.explanation, at + '.explanation');
        // Le lettere sono posizioni nel Banco: una riduzione mantiene A–C.
        // Non ricostruire identità o motivazioni dal testo riscritto.
        a.options = a.options.slice(0, item.options.length);
        a.options.forEach((option, i) => { option.text = item.options[i]; });
        a.teacher.distractors = a.teacher.distractors.filter(d => a.options.some(o => o.id === d.optionId));
        a.teacher.answer = item.explanation;
      } else { text(item.guide, at + '.guide'); a.teacher.answer = item.guide; }
      if (a.inline) {
        const fields = inlineFields(a, false);
        a.inline = Object.fromEntries(Object.entries(a.inline).filter(([k, html]) =>
          own(fields, k) && normalizedText(richPlain(html)) === normalizedText(fields[k])));
        if (!Object.keys(a.inline).length) delete a.inline;
      }
      if (!same(item, before)) a.revision += 1;
      changed.set(a.id, a);
    });
    const next = copy(draft);
    next.activities = draft.activities.filter(a => changed.has(a.id)).map(a => changed.get(a.id));
    next.sequence = next.sequence.filter(block => block.kind === 'paragraph' || changed.has(block.activityId));
    validateDraft(next); return next;
  }
  async function draftFingerprint(draft) { validateDraft(draft); return digest(draft); }

  // Una versione nasce da una fotografia già riletta. Il controller mantiene
  // i gate G1/G2 e scrive il JSON pubblico solo dopo gli output privati.
  function validateAssigned(value) {
    keys(value, ['schemaVersion', 'kind', 'projectId', 'percorsoId', 'verificaId', 'versioneId',
      'title', 'language', 'createdAt', 'content', 'fingerprint'], 'assigned');
    check(value.schemaVersion === 1 && value.kind === 'percorso-lettura-assegnato', 'assigned.schema');
    ['projectId', 'percorsoId', 'verificaId', 'versioneId'].forEach(k => id(value[k], 'assigned.' + k));
    ['title', 'language'].forEach(k => text(value[k], 'assigned.' + k));
    check(typeof value.createdAt === 'string' && new Date(value.createdAt).toISOString() === value.createdAt, 'assigned.createdAt');
    check(typeof value.fingerprint === 'string' && /^sha256-[a-f0-9]{64}$/.test(value.fingerprint), 'assigned.fingerprint');
    validatePublicContent(value.content); check(value.content.activities.length > 0, 'assigned.empty');
    return true;
  }
  async function verifyAssigned(value) {
    validateAssigned(value); const frozen = copy(value), fingerprint = frozen.fingerprint; delete frozen.fingerprint;
    check(await digest(frozen) === fingerprint, 'assigned.changed'); return true;
  }
  async function freezeVersion(draft, activityIds, confirmations, options) {
    validateDraft(draft); const frozen = copy(draft), ids = copy(activityIds), receipts = copy(confirmations), o = copy(options);
    keys(o, ['verificaId', 'versioneId', 'title', 'createdAt', 'print'], 'version');
    ['verificaId', 'versioneId'].forEach(k => id(o[k], 'version.' + k)); text(o.title, 'version.title');
    check(ids.length > 0, 'version.empty');
    await selectReviewed(frozen, ids, receipts);
    const content = projectPublicContent(frozen, ids, o.print);
    const assigned = { schemaVersion: 1, kind: 'percorso-lettura-assegnato', projectId: frozen.projectId,
      percorsoId: frozen.percorsoId, verificaId: o.verificaId, versioneId: o.versioneId, title: o.title,
      language: frozen.language, createdAt: o.createdAt, content };
    assigned.fingerprint = await digest(assigned); validateAssigned(assigned);
    const privateDraft = copy(frozen);
    privateDraft.activities = selected(frozen, ids); privateDraft.sequence = copy(content.sequence);
    const guide = { schemaVersion: 1, kind: 'percorso-lettura-guida', projectId: frozen.projectId,
      percorsoId: frozen.percorsoId, verificaId: o.verificaId, versioneId: o.versioneId,
      fingerprint: assigned.fingerprint, createdAt: o.createdAt, title: o.title,
      draft: privateDraft, print: copy(o.print || {}) };
    return { assigned, guide, paths: versionPaths(o.verificaId, o.versioneId) };
  }
  function versionPaths(verificaId, versioneId, fileStem) {
    id(verificaId, 'verificaId'); id(versioneId, 'versioneId');
    if (fileStem !== undefined) check(typeof fileStem === 'string' && fileStem.trim() === fileStem && fileStem.length > 0 &&
      !/[\u0000-\u001f\u007f/\\:*?"<>|]/.test(fileStem) && !/^[.]|[.]$/.test(fileStem), 'fileStem');
    const stem = verificaId + '-' + versioneId;
    return { public: 'Materiale Studio/Percorso-lettura-' + stem + '.json',
      guide: 'Materiale Studio/Sorgenti/Guida-lettura-' + stem + '.json',
      pdf: 'Materiale Studio/' + (fileStem || 'Verifica-lettura-' + stem) + '.pdf',
      guidePdf: 'Materiale Studio/' + (fileStem ? fileStem + ' — Guida docente' : 'Guida-lettura-' + stem) + '.pdf',
      html: 'Materiale Studio/' + (fileStem || 'Verifica-lettura-' + stem) + '.html' };
  }
  function localIndex(draft) {
    validateDraft(draft);
    return { kind: draft.kind, schemaVersion: 1, extractionMode: 'lettura', projectId: draft.projectId,
      percorsoId: draft.percorsoId, title: draft.title, language: draft.language,
      sourceId: draft.source.sourceId, sourceRevision: draft.source.sourceRevision,
      sourcePath: 'Materiale Studio/Sorgenti/Percorso-lettura-' + draft.percorsoId + '.json' };
  }

  return Object.freeze({ FORMATS, DIFFICULTIES, OPERATIONS, BLOCK_TYPES, richPlain, sanitizeInline, inlineHtml, validateDraft, validatePublicContent,
    initialSequence, moveBlock, projectPublicContent, resolveReference, sourceFingerprint, activityFingerprint,
    selectReviewed, validateAssigned, verifyAssigned, freezeVersion, versionPaths, localIndex, importSource, sourceReviewDb, applySourceReview, activitiesReviewDb, applyActivitiesReview, beginActivitiesApproval, recoverActivitiesApproval, draftFingerprint });
}));
