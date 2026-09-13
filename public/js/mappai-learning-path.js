/* A short practice path assembled from approved exercises, with no generation. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(root, require('./mappai-grounding-core'), require('./mappai-review-core'));
  else root.MappAILearningPath = factory(root, root.MappAIGroundingCore, root.MappAIReviewCore);
}(typeof globalThis !== 'undefined' ? globalThis : this, function (root, G, RC) {
  'use strict';
  const clone = x => JSON.parse(JSON.stringify(x));
  const esc = x => String(x == null ? '' : x).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const labels = {
    sp_title: ['Percorso breve', 'Short practice path'], sp_objective: ['Obiettivo', 'Learning objective'],
    sp_area: ['Area', 'Area'], sp_all: ['Tutte le aree', 'All areas'], sp_max: ['Numero massimo di attività', 'Maximum number of activities'],
    sp_mode: ['Come affrontare lo stesso obiettivo', 'How to work towards the same objective'],
    sp_supported: ['Con supporto', 'With support'], sp_independent: ['Autonomo', 'Independent'], sp_deeper: ['Approfondimento', 'Further practice'],
    sp_choose: ['Scegli le attività', 'Choose activities'], sp_selected: ['Attività selezionate', 'Selected activities'],
    sp_help_edit: ['Aiuto modificabile dal docente', 'Help the teacher can edit'], sp_no_help: ['Nessun estratto verificato disponibile. Puoi scrivere un aiuto.', 'No verified excerpt is available. You can write a hint.'],
    sp_save: ['Crea e salva il percorso', 'Create and save the path'], sp_close: ['Chiudi', 'Close'],
    sp_ready: ['Completa prima la revisione dei materiali.', 'Complete the materials review first.'],
    sp_stale: ['I contenuti sono cambiati. Riapri il percorso dalla revisione aggiornata.', 'The content has changed. Reopen the path from the updated review.'],
    sp_missing: ['Scrivi un obiettivo e scegli le attività entro il limite.', 'Write an objective and choose activities within the limit.'],
    sp_saved: ['Percorso salvato nella cartella del progetto.', 'Path saved in the project folder.'],
    sp_no_folder: ['Apri prima una cartella di progetto.', 'Open a project folder first.'],
    sp_save_failed: ['Il percorso non è stato salvato.', 'The path could not be saved.'],
    sp_archive_failed: ['File salvato nella cartella; archivio documenti non aggiornato.', 'File saved in the folder; document archive was not updated.'],
    sp_print: ['Stampa', 'Print'], sp_large: ['Testo grande', 'Large text'], sp_download: ['Scarica le risposte', 'Download answers'],
    sp_answer: ['La tua risposta', 'Your answer'], sp_choice: ['Scegli una risposta', 'Choose one answer'],
    sp_hint: ['Mostra un aiuto', 'Show a hint'], sp_hint_after: ['Rivedi l’aiuto dopo aver provato', 'Review the hint after trying'],
    sp_teacher: ['Aiuto del docente', 'Teacher hint'], sp_source: ['Passaggio originale', 'Original passage'], sp_page: ['pagina', 'page'],
    sp_feedback: ['Confronta le risposte', 'Review your answers'], sp_feedback_open: ['Apri soluzioni e spiegazioni dopo aver risposto', 'Open answers and explanations after answering'],
    sp_criteria: ['Elementi da ritrovare nella risposta', 'What to look for in your answer'],
    sp_reflect: ['Spiega il ragionamento. Se hai una fonte disponibile, indica il passaggio che sostiene la risposta.', 'Explain your reasoning. If a source is available, identify the passage supporting your answer.'],
    sp_steps: ['Leggi la domanda. Se serve, apri l’aiuto. Scrivi o scegli la risposta.', 'Read the question. Open a hint if needed. Write or choose your answer.'],
    sp_try: ['Prova a rispondere, poi confronta il tuo lavoro con le soluzioni.', 'Try answering, then compare your work with the answers.'],
    sp_create_title: ['Crea un percorso breve', 'Create a short practice path'],
    sp_intro: ['Un obiettivo, poche attività e il supporto adatto ai tuoi studenti.', 'One objective, a few activities and the right support for your students.'],
    sp_project: ['Progetto', 'Project'], sp_approved: ['attività approvate disponibili', 'approved activities available'],
    sp_plan: ['Definisci l’obiettivo', 'Set the objective'], sp_customize: ['Personalizza i supporti', 'Customize support'],
    sp_objective_prompt: ['Che cosa dovrà saper fare lo studente?', 'What should the student be able to do?'],
    sp_objective_hint: ['Indica un risultato concreto. Ti aiuterà a scegliere solo le attività che servono.', 'Describe a concrete outcome. Use it to choose only the activities you need.'],
    sp_objective_example: ['Es. Spiegare due conseguenze della neutralità svizzera durante la guerra.', 'E.g. Explain two consequences of Swiss neutrality during the war.'],
    sp_max_hint: ['Un percorso breve lascia spazio al ragionamento. Puoi scegliere da 1 a 20 attività.', 'A short path leaves room for thinking. Choose between 1 and 20 activities.'],
    sp_catalog_hint: ['Cerca nei materiali già approvati. Apri l’anteprima per leggere la domanda, la soluzione e l’aiuto disponibile.', 'Search the approved materials. Open a preview to read the question, answer and available hint.'],
    sp_search: ['Cerca un’attività', 'Find an activity'], sp_search_placeholder: ['Parole della domanda o area…', 'Question keywords or area…'],
    sp_kind: ['Tipo di attività', 'Activity type'], sp_kind_all: ['Tutti i tipi', 'All types'],
    sp_kind_mc: ['Scelta multipla', 'Multiple choice'], sp_kind_open: ['Domanda aperta', 'Open question'], sp_kind_flashcard: ['Flashcard', 'Flashcard'],
    sp_preview: ['Anteprima', 'Preview'], sp_empty: ['Nessuna attività corrisponde ai filtri.', 'No activities match these filters.'],
    sp_reset_filters: ['Azzera i filtri', 'Clear filters'], sp_results: ['Risultati', 'Results'], sp_of: ['di', 'of'],
    sp_previous: ['Indietro', 'Back'], sp_next: ['Avanti', 'Next'], sp_page_previous: ['Pagina precedente', 'Previous page'], sp_page_next: ['Pagina successiva', 'Next page'],
    sp_summary: ['Il tuo percorso', 'Your path'], sp_objective_empty: ['L’obiettivo comparirà qui.', 'Your objective will appear here.'],
    sp_selection_empty: ['Scegli le attività al passo 2: le ritroverai qui, nell’ordine del percorso.', 'Choose activities in step 2. They will appear here in path order.'],
    sp_remove: ['Rimuovi', 'Remove'], sp_limit: ['Hai raggiunto il limite. Rimuovi un’attività o aumenta il numero al passo 1.', 'You have reached the limit. Remove an activity or increase the number in step 1.'],
    sp_over_limit: ['La selezione supera il limite. Rimuovi alcune attività o aumenta il numero al passo 1.', 'Your selection exceeds the limit. Remove activities or increase the number in step 1.'],
    sp_supported_desc: ['L’aiuto si trova prima della risposta, per accompagnare il primo tentativo.', 'The hint appears before the answer, to support the first attempt.'],
    sp_independent_desc: ['Lo studente prova a rispondere; l’aiuto si trova dopo lo spazio di risposta.', 'The student tries to answer; the hint appears after the answer space.'],
    sp_deeper_desc: ['Dopo la risposta, uno spazio in più invita a spiegare il ragionamento e citare una fonte.', 'After the answer, an extra space asks for reasoning and a supporting source.'],
    sp_customize_hint: ['Lo stesso obiettivo, con un diverso grado di supporto. Le domande restano quelle che hai approvato.', 'The same objective with a different level of support. Questions remain as approved.'],
    sp_edit_hint: ['Rileggi un’attività alla volta e adatta l’aiuto. Puoi anche lasciarlo vuoto.', 'Review one activity at a time and adapt its hint. You can also leave it empty.'],
    sp_solution: ['Soluzione e indicazioni per il docente', 'Answer and teacher guidance'], sp_help_available: ['Aiuto disponibile', 'Available hint'],
    sp_activity: ['Attività', 'Activity'], sp_help_origin: ['Il testo modificato sarà indicato come aiuto del docente.', 'Edited text will be labelled as a teacher hint.'],
    sp_output: ['Riceverai un documento con attività, aiuti, spazio per le risposte e soluzioni.', 'You will get a document with activities, hints, answer spaces and solutions.'],
    sp_saving: ['Salvataggio del percorso…', 'Saving the path…']
  };
  function t(key, lang) {
    const pair = labels[key] || [key, key];
    const fallback = pair[(lang || root.MappAIDocHead?.lingua?.() || '').indexOf('en') === 0 ? 1 : 0];
    return lang ? fallback : (root.t ? root.t(key, fallback) : fallback);
  }
  const state = () => typeof appState !== 'undefined' ? appState : root.appState || {};
  const reviewNow = () => root.MappAIReview?.current ? root.MappAIReview.current() : state()._pipelineManifest?.review;
  function materialRevision(review) { return RC.revision({ items: review.final.items || [] }, review.sources || []); }
  function ready(db, review) {
    try { return !!(review && ['approved', 'done'].includes(review.final?.stage) &&
      RC.gate(review, db, review.sources).allowed &&
      (!review.final.review || RC.gate(review.final.review, { items: review.final.items || [] }, review.final.review.sources).allowed)); }
    catch (_) { return false; }
  }
  function helpFor(item, db, review) {
    const raw = Array.isArray(item.evidenza) ? item.evidenza : [item.evidenza];
    const chunks = raw.filter(Boolean).map(e => typeof e === 'string' ? { text: e } :
      { text: e.text || e.quote || e.estratto, docId: e.docId || e.documentId, title: e.title, page: e.page || e.pagina });
    const input = G.buildInput({ sourcesDict: { item: chunks } }, [{ id: 'item', desc: item.question }], review.sources, review);
    if (input.nodesListText.includes('Passaggi originali:') && input.sourcesArr.length === 1) {
      const source = input.sourcesArr[0];
      return { origin: 'source', text: source.text, title: source.title, page: source.page, sourceId: source.id };
    }
    const nodeIds = item.nodeIds || (item.nodeId ? [item.nodeId] : []);
    if (nodeIds.length && item.sourceIds?.length) {
      const grounded = G.buildInput(db, (db.nodes || []).filter(n => nodeIds.includes(n.id)), review.sources, review);
      const match = grounded.sourcesArr.filter(s => item.sourceIds.includes(s.id));
      if (match.length === 1) return { origin: 'source', text: match[0].text, title: match[0].title, page: match[0].page, sourceId: match[0].id };
    }
    return { origin: 'teacher', text: '' };
  }
  function approvedItems(db, review) {
    if (!ready(db, review)) return [];
    const seen = new Set();
    return (review.final.items || []).filter(it => {
      if (!it || !it.id || seen.has(it.id) || !['mc', 'open', 'flashcard'].includes(it.kind) || it.excluded || !String(it.question || '').trim()) return false;
      if (it.kind === 'mc' && (!Array.isArray(it.options) || !Number.isInteger(it.correctIndex) || it.correctIndex < 0 || it.correctIndex >= it.options.length)) return false;
      seen.add(it.id); return true;
    }).map(it => {
      const set = (db.studySets || []).find(s => s.id === it.draftKey || (s.items || []).some(x => x.id === it.id));
      const areas = (Array.isArray(it.areas) ? it.areas : [it.area || it.ramo || it.l1 || set?.title || '']).map(String).filter(Boolean);
      return Object.assign({}, clone(it), { areas, help: helpFor(it, db, review) });
    });
  }
  function createPath(db, review, options) {
    options = options || {};
    if (!ready(db, review)) throw new Error(t('sp_ready'));
    const ids = Array.from(new Set(options.ids || [])), max = Math.min(20, Math.max(1, parseInt(options.max, 10) || 4));
    const available = new Map(approvedItems(db, review).map(it => [it.id, it]));
    if (!String(options.objective || '').trim() || !ids.length || ids.length > max || ids.some(id => !available.has(id))) throw new Error(t('sp_missing'));
    const items = ids.map(id => {
      const item = available.get(id), requested = options.helps && options.helps[id];
      if (requested != null && String(requested) !== item.help.text) item.help = { text: String(requested).trim(), origin: 'teacher' };
      return item;
    });
    return { schema: 'mappai-learning-path@1', id: options.id || 'path-' + Date.now(),
      sourceRevision: review.approvedRevision, materialRevision: materialRevision(review),
      objective: String(options.objective).trim(), mode: ['supported', 'independent', 'deeper'].includes(options.mode) ? options.mode : 'supported',
      max, mapName: options.mapName || '', language: options.language === 'en' ? 'en' : 'it', items };
  }
  function buildHtml(path) {
    const lang = path.language || 'it', tr = key => esc(t(key, lang));
    const activities = path.items.map((it, i) => {
      const id = 'sp-item-' + i, hint = it.help && it.help.text;
      const options = it.kind === 'mc' ? '<fieldset><legend>' + tr('sp_choice') + '</legend>' + it.options.map((opt, oi) =>
        '<label class="choice"><input type="radio" name="' + id + '-choice" value="' + oi + '"><span>' + String.fromCharCode(65 + oi) + '. ' + esc(opt) + '</span></label>').join('') + '</fieldset>' : '';
      const support = hint ? '<details class="hint"><summary>' + tr(path.mode === 'supported' ? 'sp_hint' : 'sp_hint_after') + '</summary><p class="hint-origin">' +
        (it.help.origin === 'source' ? tr('sp_source') + ': ' + esc(it.help.title) + (it.help.page ? ' — ' + tr('sp_page') + ' ' + esc(it.help.page) : '') : tr('sp_teacher')) +
        '</p><blockquote>' + esc(hint) + '</blockquote></details>' : '';
      return '<section class="activity" aria-labelledby="' + id + '"><h2 id="' + id + '">' + (i + 1) + '. ' + esc(it.question) + '</h2>' +
        (path.mode === 'supported' ? support : '') + options + '<label for="' + id + '-answer">' + tr('sp_answer') + '</label>' +
        '<textarea id="' + id + '-answer" rows="4"></textarea>' + (path.mode !== 'supported' ? support : '') +
        (path.mode === 'deeper' ? '<label for="' + id + '-reason">' + tr('sp_reflect') + '</label><textarea id="' + id + '-reason" rows="3"></textarea>' : '') + '</section>';
    }).join('');
    const feedback = path.items.map((it, i) => {
      const answer = it.kind === 'mc' ? String.fromCharCode(65 + it.correctIndex) + '. ' + it.options[it.correctIndex]
        : it.kind === 'flashcard' ? it.answer || '' : it.guide || '';
      const criteria = it.kind === 'open' && Array.isArray(it.criteria) && it.criteria.length
        ? '<p>' + tr('sp_criteria') + '</p><ul>' + it.criteria.map(c => '<li>' + esc(c) + '</li>').join('') + '</ul>' : '<p>' + esc(answer) + '</p>';
      return '<section><h3>' + (i + 1) + '. ' + esc(it.question) + '</h3>' + criteria + (it.explanation ? '<p>' + esc(it.explanation) + '</p>' : '') + '</section>';
    }).join('');
    const font = root.MappAIFont?.styleDocumento ? root.MappAIFont.styleDocumento() : '';
    return '<!DOCTYPE html><html lang="' + esc(lang) + '"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
      '<meta name="mappai-source-revision" content="' + esc(path.sourceRevision) + '"><title>' + tr('sp_title') + ' — ' + esc(path.objective) + '</title><style>' + font +
      'body{font:12pt/1.6 var(--doc-font,Arial,sans-serif);color:#17233a;background:white;max-width:48rem;margin:auto;padding:1.5rem;overflow-wrap:anywhere}body.large{font-size:18pt}h1{font-size:1.6em}h2{font-size:1.15em}h3{font-size:1em}.toolbar{display:flex;gap:.6rem;flex-wrap:wrap}button,textarea,input{font:inherit}button,summary{cursor:pointer}button{padding:.45em .7em}textarea{display:block;width:100%;box-sizing:border-box;min-height:6em;margin:.5em 0 1em;padding:.5em;line-height:1.5}fieldset{border:1px solid #748298;padding:1em;margin:1em 0}.choice{display:flex;align-items:baseline;gap:.7em;padding:.4em 0}.choice input{flex:none}.activity{padding:1em 0;border-bottom:1px solid #748298}.hint{margin:1em 0;padding:.6em;border-left:3px solid #466480}blockquote{white-space:pre-wrap;margin:.5em 0}.hint-origin{font-size:.9em}summary:focus-visible,button:focus-visible,textarea:focus-visible,input:focus-visible{outline:3px solid #1d4ed8;outline-offset:3px}.feedback{margin-top:2em}label{display:block}@page{size:A4;margin:18mm}@media print{body{max-width:none;padding:0}.toolbar{display:none}textarea{border:1px solid #748298}h2,h3{break-after:avoid}.feedback{break-before:page}}</style></head><body>' +
      '<nav class="toolbar" aria-label="' + tr('sp_title') + '"><button type="button" id="sp-print">' + tr('sp_print') + '</button><button type="button" id="sp-large" aria-pressed="false">' + tr('sp_large') + '</button><button type="button" id="sp-download">' + tr('sp_download') + '</button></nav>' +
      '<header><h1>' + tr('sp_title') + '</h1>' + (path.mapName ? '<p>' + esc(path.mapName) + '</p>' : '') + '<p><strong>' + tr('sp_objective') + ':</strong> ' + esc(path.objective) + '</p>' +
      '<p>' + tr(path.mode === 'supported' ? 'sp_steps' : 'sp_try') + '</p></header><main>' + activities +
      '<section class="feedback" aria-labelledby="sp-feedback"><h2 id="sp-feedback">' + tr('sp_feedback') + '</h2><details><summary>' + tr('sp_feedback_open') + '</summary>' + feedback + '</details></section></main>' +
      '<script type="application/json" id="mappai-learning-path">' + JSON.stringify(path).replace(/<\//g, '<\\/') + '</script>' +
      '<script>document.getElementById("sp-print").onclick=function(){window.print()};document.getElementById("sp-large").onclick=function(){this.setAttribute("aria-pressed",document.body.classList.toggle("large"))};document.getElementById("sp-download").onclick=function(){var copy=document.documentElement.cloneNode(true);document.querySelectorAll("textarea").forEach(function(el){copy.querySelector("#"+el.id).textContent=el.value});document.querySelectorAll("input[type=radio]").forEach(function(el,i){var target=copy.querySelectorAll("input[type=radio]")[i];if(el.checked)target.setAttribute("checked","");else target.removeAttribute("checked")});var url=URL.createObjectURL(new Blob(["<!DOCTYPE html>"+copy.outerHTML],{type:"text/html;charset=utf-8"}));var a=document.createElement("a");a.href=url;a.download="percorso-risposte.html";a.click();setTimeout(function(){URL.revokeObjectURL(url)},1000)};</script></body></html>';
  }
  async function save(path, context) {
    const c = context || {}, db = c.db || state().db, review = c.review || reviewNow();
    const vaultPath = c.vaultPath || state().activeVaultPath, api = c.api || root.electronAPI, docs = c.docs || root.MappAIStudyDocs;
    if (!vaultPath || !api?.saveVaultFile) throw new Error(t('sp_no_folder'));
    if (!ready(db, review) || path.sourceRevision !== review.approvedRevision || path.materialRevision !== materialRevision(review)) throw new Error(t('sp_stale'));
    const checked = createPath(db, review, Object.assign({}, path, { ids: path.items.map(it => it.id),
      helps: Object.fromEntries(path.items.map(it => [it.id, it.help?.text || ''])) }));
    const html = buildHtml(checked), relPath = 'Materiale Studio/Percorso-' + String(checked.id).replace(/[^a-zA-Z0-9_-]/g, '-') + '.html';
    const result = await api.saveVaultFile({ vaultPath, relPath, text: html });
    if (!result?.ok) throw new Error(result?.error || t('sp_save_failed'));
    let archived = null;
    try { archived = docs?.save ? docs.save({ kind: 'dossier', title: t('sp_title') + ': ' + checked.objective,
      mapName: checked.mapName, cls: c.className || review.config?.className || '', disc: c.disc || review.config?.disc || '', html }) : null; }
    catch (_) { /* The durable project file is already saved; report the cache failure separately. */ }
    return { ok: true, relPath, archived: !!archived, html, path: checked };
  }
  async function open() {
    if (root.MappAIReview?.requireApproved && !await root.MappAIReview.requireApproved()) return false;
    const db = state().db, review = reviewNow(), items = approvedItems(db, review);
    if (!items.length) { root.showToast?.(t('sp_ready'), 'warning'); return false; }
    root.document.getElementById('mappai-learning-path-dialog')?.remove();
    const modal = root.document.createElement('dialog'), previouslyFocused = root.document.activeElement;
    const tr = key => esc(t(key)), mapName = state().rootNodeLabel || '', modes = ['supported', 'independent', 'deeper'];
    modal.id = 'mappai-learning-path-dialog'; modal.className = 'sp-dialog';
    modal.setAttribute('aria-labelledby', 'sp-dialog-title');
    modal.setAttribute('aria-describedby', 'sp-dialog-description');
    modal.innerHTML = '<header class="sp-header"><div><p class="sp-eyebrow">' + tr('sp_project') + (mapName ? ' · ' + esc(mapName) : '') + '</p>' +
      '<h2 id="sp-dialog-title">' + tr('sp_create_title') + '</h2><p id="sp-dialog-description">' + tr('sp_intro') + '</p></div>' +
      '<button type="button" class="sp-close" id="sp-close" aria-label="' + tr('sp_close') + '">×</button></header>' +
      '<nav class="sp-steps" aria-label="' + tr('sp_title') + '">' + ['sp_plan', 'sp_choose', 'sp_customize'].map((key, i) =>
        '<button type="button" data-step="' + (i + 1) + '" aria-controls="sp-step-' + (i + 1) + '"><span class="sp-step-number">' + (i + 1) + '</span><span>' + tr(key) + '</span></button>').join('') + '</nav>' +
      '<div class="sp-workspace"><main class="sp-main"><section id="sp-step-1" aria-labelledby="sp-plan-title">' +
      '<p class="sp-eyebrow">1 · ' + tr('sp_objective') + '</p><h3 id="sp-plan-title" tabindex="-1">' + tr('sp_objective_prompt') + '</h3>' +
      '<p class="sp-description">' + tr('sp_objective_hint') + '</p><label for="sp-objective">' + tr('sp_objective') + '</label>' +
      '<textarea id="sp-objective" rows="3" required placeholder="' + tr('sp_objective_example') + '"></textarea>' +
      '<div class="sp-length"><div><label for="sp-max">' + tr('sp_max') + '</label><p class="sp-description" id="sp-max-description">' + tr('sp_max_hint') + '</p></div>' +
      '<input id="sp-max" type="number" min="1" max="20" value="4" aria-describedby="sp-max-description"></div>' +
      '<p class="sp-availability"><span aria-hidden="true">✓</span> ' + items.length + ' ' + tr('sp_approved') + '</p></section>' +
      '<section id="sp-step-2" aria-labelledby="sp-choose-title" hidden><p class="sp-eyebrow">2 · ' + tr('sp_activity') + '</p>' +
      '<h3 id="sp-choose-title" tabindex="-1">' + tr('sp_choose') + '</h3><p class="sp-description">' + tr('sp_catalog_hint') + '</p>' +
      '<div class="sp-filters"><div class="sp-search"><label for="sp-search">' + tr('sp_search') + '</label><input id="sp-search" type="search" placeholder="' + tr('sp_search_placeholder') + '"></div>' +
      '<div><label for="sp-area">' + tr('sp_area') + '</label><select id="sp-area"><option value="">' + tr('sp_all') + '</option>' +
      Array.from(new Set(items.flatMap(it => it.areas))).sort((a, b) => a.localeCompare(b)).map(a => '<option value="' + esc(a) + '">' + esc(a) + '</option>').join('') + '</select></div>' +
      '<div><label for="sp-kind">' + tr('sp_kind') + '</label><select id="sp-kind"><option value="">' + tr('sp_kind_all') + '</option>' +
      ['mc', 'open', 'flashcard'].map(k => '<option value="' + k + '">' + tr('sp_kind_' + k) + '</option>').join('') + '</select></div></div>' +
      '<div class="sp-results-bar"><p id="sp-results" role="status"></p><button type="button" class="sp-text-button" id="sp-reset">' + tr('sp_reset_filters') + '</button></div>' +
      '<div id="sp-items"></div><div class="sp-pagination"><button type="button" id="sp-page-previous" aria-label="' + tr('sp_page_previous') + '">←</button>' +
      '<span id="sp-page"></span><button type="button" id="sp-page-next" aria-label="' + tr('sp_page_next') + '">→</button></div></section>' +
      '<section id="sp-step-3" aria-labelledby="sp-customize-title" hidden><p class="sp-eyebrow">3 · ' + tr('sp_customize') + '</p>' +
      '<h3 id="sp-customize-title" tabindex="-1">' + tr('sp_mode') + '</h3><p class="sp-description">' + tr('sp_customize_hint') + '</p>' +
      '<fieldset class="sp-modes"><legend class="sp-sr-only">' + tr('sp_mode') + '</legend>' + modes.map(mode =>
        '<label class="sp-mode-card"><input type="radio" name="sp-mode" value="' + mode + '"' + (mode === 'supported' ? ' checked' : '') + '><span><strong>' + tr('sp_' + mode) + '</strong><span>' + tr('sp_' + mode + '_desc') + '</span></span></label>').join('') + '</fieldset>' +
      '<div class="sp-editor-heading"><div><h4>' + tr('sp_help_edit') + '</h4><p class="sp-description">' + tr('sp_edit_hint') + '</p></div></div><div id="sp-editor"></div></section></main>' +
      '<aside class="sp-summary" aria-labelledby="sp-summary-title"><div class="sp-summary-heading"><h3 id="sp-summary-title">' + tr('sp_summary') + '</h3><span id="sp-count" role="status"></span></div>' +
      '<p class="sp-summary-label">' + tr('sp_objective') + '</p><p id="sp-summary-objective"></p><p class="sp-summary-label">' + tr('sp_selected') + '</p>' +
      '<ol id="sp-selected"></ol><p id="sp-selection-empty" class="sp-description">' + tr('sp_selection_empty') + '</p>' +
      '<p id="sp-limit" role="status" class="sp-notice" hidden></p><p class="sp-summary-mode" id="sp-summary-mode"></p>' +
      '<div id="sp-preview" hidden></div><p class="sp-output">' + tr('sp_output') + '</p></aside></div>' +
      '<footer class="sp-footer"><div><p id="sp-status" role="status" aria-live="polite"></p><p id="sp-footer-progress"></p></div><div class="sp-footer-actions">' +
      '<button type="button" id="sp-back">' + tr('sp_previous') + '</button><button type="button" class="sp-primary" id="sp-next">' + tr('sp_choose') + ' →</button>' +
      '<button type="button" class="sp-primary" id="sp-create" hidden>' + tr('sp_save') + '</button></div></footer>';
    root.document.body.appendChild(modal);
    const selected = new Set(), helps = Object.create(null), byId = new Map(items.map(it => [it.id, it])), q = sel => modal.querySelector(sel);
    const revision = review.approvedRevision, materials = materialRevision(review), vaultPath = state().activeVaultPath;
    let step = 1, page = 0, activeId = '', saving = false;
    const pageSize = 8, maxItems = () => Math.min(20, Math.max(1, parseInt(q('#sp-max').value, 10) || 4));
    const modeNow = () => q('input[name="sp-mode"]:checked').value;
    const helpText = it => helps[it.id] == null ? it.help.text : helps[it.id];
    function preview(it, editable) {
      const help = helpText(it), source = it.help.origin === 'source' && help === it.help.text;
      const answer = it.kind === 'mc' ? it.options[it.correctIndex] : it.kind === 'flashcard' ? it.answer : it.guide;
      const origin = source ? tr('sp_source') + ': ' + esc(it.help.title) + (it.help.page ? ' · ' + tr('sp_page') + ' ' + esc(it.help.page) : '') : tr('sp_teacher');
      return '<article class="sp-item-detail"><p class="sp-item-meta">' + tr('sp_kind_' + it.kind) + (it.areas.length ? ' · ' + esc(it.areas.join(' · ')) : '') + '</p>' +
        '<h4>' + esc(it.question) + '</h4>' + (it.kind === 'mc' ? '<ol class="sp-options" type="A">' + it.options.map(option => '<li>' + esc(option) + '</li>').join('') + '</ol>' : '') +
        '<details class="sp-solution"><summary>' + tr('sp_solution') + '</summary><p>' + esc(answer || '') + '</p>' +
        (it.criteria?.length ? '<ul>' + it.criteria.map(c => '<li>' + esc(c) + '</li>').join('') + '</ul>' : '') +
        (it.explanation ? '<p>' + esc(it.explanation) + '</p>' : '') + '</details>' +
        (editable ? '<label for="sp-help">' + tr('sp_help_edit') + '</label><p class="sp-help-origin" id="sp-help-origin">' + origin + '</p>' +
          '<textarea id="sp-help" data-help="' + esc(it.id) + '" rows="5" placeholder="' + tr('sp_no_help') + '" aria-describedby="sp-help-origin sp-help-note">' + esc(help) + '</textarea>' +
          '<p class="sp-description" id="sp-help-note">' + tr('sp_help_origin') + '</p>' :
          '<p class="sp-summary-label">' + tr('sp_help_available') + '</p><p class="sp-help-origin">' + origin + '</p><p class="sp-hint-preview">' + esc(help || t('sp_no_help')) + '</p>') + '</article>';
    }
    function renderDetails() {
      const chosen = Array.from(selected);
      if (step === 3 && !selected.has(activeId)) activeId = chosen[0] || '';
      const current = byId.get(activeId);
      q('#sp-preview').hidden = step !== 2 || !current;
      q('#sp-preview').innerHTML = step === 2 && current ? '<h4 class="sp-preview-title" tabindex="-1">' + tr('sp_preview') + '</h4>' + preview(current, false) : '';
      q('#sp-editor').innerHTML = selected.size && current && step === 3 ?
        '<div class="sp-editor-navigation"><button type="button" data-edit-offset="-1" aria-label="' + tr('sp_previous') + '"' + (chosen.indexOf(activeId) === 0 ? ' disabled' : '') + '>←</button>' +
        '<p>' + tr('sp_activity') + ' ' + (chosen.indexOf(activeId) + 1) + ' ' + tr('sp_of') + ' ' + chosen.length + '</p><button type="button" data-edit-offset="1" aria-label="' + tr('sp_next') + '"' +
        (chosen.indexOf(activeId) === chosen.length - 1 ? ' disabled' : '') + '>→</button></div>' + preview(current, true) : '<p class="sp-empty">' + tr('sp_selection_empty') + '</p>';
    }
    function renderCatalog() {
      const search = q('#sp-search').value.trim().toLocaleLowerCase(), area = q('#sp-area').value, kind = q('#sp-kind').value, max = maxItems();
      const filtered = items.filter(it => (!area || it.areas.includes(area)) && (!kind || it.kind === kind) &&
        (!search || (it.question + ' ' + it.areas.join(' ')).toLocaleLowerCase().includes(search)));
      const pages = Math.max(1, Math.ceil(filtered.length / pageSize)); page = Math.min(page, pages - 1);
      q('#sp-results').textContent = t('sp_results') + ': ' + filtered.length + ' / ' + items.length;
      q('#sp-items').innerHTML = filtered.slice(page * pageSize, (page + 1) * pageSize).map(it =>
        '<div class="sp-catalog-item' + (selected.has(it.id) ? ' is-selected' : '') + '"><label><input type="checkbox" data-item="' + esc(it.id) + '"' +
        (selected.has(it.id) ? ' checked' : selected.size >= max ? ' disabled' : '') + '><span><span class="sp-item-meta">' + tr('sp_kind_' + it.kind) +
        (it.areas.length ? ' · ' + esc(it.areas.join(' · ')) : '') + '</span><span class="sp-item-question">' + esc(it.question) + '</span></span></label>' +
        '<button type="button" class="sp-text-button" data-preview="' + esc(it.id) + '" aria-label="' + tr('sp_preview') + ': ' + esc(it.question) + '" aria-pressed="' + (activeId === it.id) + '">' + tr('sp_preview') + '</button></div>').join('') || '<p class="sp-empty">' + tr('sp_empty') + '</p>';
      q('#sp-page').textContent = (page + 1) + ' / ' + pages;
      q('#sp-page-previous').disabled = page === 0; q('#sp-page-next').disabled = page === pages - 1;
    }
    function renderSummary() {
      const max = maxItems(), hasObjective = !!q('#sp-objective').value.trim(), withinLimit = selected.size > 0 && selected.size <= max;
      q('#sp-count').textContent = selected.size + ' / ' + max;
      q('#sp-summary-objective').textContent = q('#sp-objective').value.trim() || t('sp_objective_empty');
      q('#sp-selected').innerHTML = Array.from(selected).map((id, i) => '<li><span class="sp-selection-number">' + (i + 1) + '</span>' +
        '<button type="button" data-edit="' + esc(id) + '" class="sp-selected-question"' + (step === 3 && activeId === id ? ' aria-current="true"' : '') + '>' + esc(byId.get(id).question) + '</button>' +
        '<button type="button" data-remove="' + esc(id) + '" class="sp-remove" aria-label="' + tr('sp_remove') + ': ' + esc(byId.get(id).question) + '">×</button></li>').join('');
      q('#sp-selection-empty').hidden = selected.size > 0;
      q('#sp-limit').hidden = selected.size < max || (step !== 2 && selected.size === max);
      q('#sp-limit').textContent = t(selected.size > max ? 'sp_over_limit' : 'sp_limit');
      q('#sp-summary-mode').textContent = t('sp_' + modeNow());
      q('#sp-footer-progress').textContent = selected.size + ' ' + t('sp_selected').toLocaleLowerCase() + ' · ' + step + ' / 3';
      q('#sp-back').hidden = step === 1; q('#sp-next').hidden = step === 3; q('#sp-create').hidden = step !== 3;
      q('#sp-next').textContent = t(step === 1 ? 'sp_choose' : 'sp_customize') + ' →';
      q('#sp-next').disabled = saving || (step === 1 ? !hasObjective : !withinLimit);
      q('#sp-create').disabled = saving || !hasObjective || !withinLimit;
      modal.querySelectorAll('[data-step]').forEach(button => button.setAttribute('aria-current', Number(button.dataset.step) === step ? 'step' : 'false'));
    }
    function render() { renderCatalog(); renderDetails(); renderSummary(); }
    function showStep(next, focus = true, itemId) {
      if (next === 3 && step !== 3) activeId = itemId || Array.from(selected)[0] || '';
      step = next;
      [1, 2, 3].forEach(n => { q('#sp-step-' + n).hidden = step !== n; });
      render();
      q('.sp-main').scrollTop = 0;
      q('.sp-workspace').scrollTop = 0;
      if (focus) q(step === 1 ? '#sp-objective' : step === 2 ? '#sp-choose-title' : '#sp-customize-title').focus();
    }
    modal.querySelectorAll('[data-step]').forEach(button => { button.onclick = () => showStep(Number(button.dataset.step)); });
    q('#sp-next').onclick = () => showStep(step + 1); q('#sp-back').onclick = () => showStep(step - 1);
    q('#sp-items').addEventListener('change', e => {
      const id = e.target.dataset.item;
      if (!id || !byId.has(id) || saving) return;
      if (e.target.checked && selected.size < maxItems()) { selected.add(id); activeId = id; } else selected.delete(id);
      render();
      Array.from(q('#sp-items').querySelectorAll('[data-item]')).find(el => el.dataset.item === id)?.focus();
    });
    q('#sp-items').addEventListener('click', e => {
      const id = e.target.closest('[data-preview]')?.dataset.preview;
      if (id && byId.has(id)) { activeId = id; renderDetails();
        q('#sp-items').querySelectorAll('[data-preview]').forEach(button => button.setAttribute('aria-pressed', button.dataset.preview === id));
        q('.sp-preview-title').focus(); }
    });
    q('#sp-selected').addEventListener('click', e => {
      const removeId = e.target.closest('[data-remove]')?.dataset.remove, editId = e.target.closest('[data-edit]')?.dataset.edit;
      if (removeId) { selected.delete(removeId); render(); q('#sp-summary-title').setAttribute('tabindex', '-1'); q('#sp-summary-title').focus(); }
      else if (editId && selected.has(editId)) { activeId = editId; showStep(3, true, editId); }
    });
    q('#sp-editor').addEventListener('input', e => {
      const id = e.target.dataset.help;
      if (id && selected.has(id)) { helps[id] = e.target.value;
        q('#sp-help-origin').textContent = byId.get(id).help.origin === 'source' && helps[id] === byId.get(id).help.text
          ? t('sp_source') + ': ' + byId.get(id).help.title + (byId.get(id).help.page ? ' · ' + t('sp_page') + ' ' + byId.get(id).help.page : '') : t('sp_teacher'); }
    });
    q('#sp-editor').addEventListener('click', e => {
      const button = e.target.closest('[data-edit-offset]');
      if (!button || button.disabled) return;
      const ids = Array.from(selected), index = ids.indexOf(activeId) + Number(button.dataset.editOffset);
      if (ids[index]) { activeId = ids[index]; renderDetails(); renderSummary(); q('#sp-help').focus(); }
    });
    function filterChanged() { page = 0; renderCatalog(); }
    q('#sp-search').oninput = filterChanged; q('#sp-area').onchange = filterChanged; q('#sp-kind').onchange = filterChanged;
    q('#sp-reset').onclick = () => { q('#sp-search').value = ''; q('#sp-area').value = ''; q('#sp-kind').value = ''; filterChanged(); };
    q('#sp-page-previous').onclick = () => { page--; renderCatalog(); q('#sp-items').querySelector('[data-item]')?.focus(); };
    q('#sp-page-next').onclick = () => { page++; renderCatalog(); q('#sp-items').querySelector('[data-item]')?.focus(); };
    q('#sp-max').oninput = () => { renderCatalog(); renderSummary(); }; q('#sp-objective').oninput = renderSummary;
    modal.querySelectorAll('[name="sp-mode"]').forEach(input => { input.onchange = renderSummary; });
    q('#sp-close').onclick = () => modal.close();
    modal.addEventListener('cancel', e => { if (saving) e.preventDefault(); });
    modal.addEventListener('close', () => { modal.remove(); previouslyFocused?.focus(); });
    q('#sp-create').onclick = async () => {
      if (saving) return;
      saving = true; modal.setAttribute('aria-busy', 'true');
      modal.querySelectorAll('button,input,select,textarea').forEach(el => { el.disabled = true; });
      q('#sp-status').textContent = t('sp_saving');
      try {
        if (state().activeVaultPath !== vaultPath || reviewNow()?.approvedRevision !== revision || materialRevision(reviewNow()) !== materials) throw new Error(t('sp_stale'));
        const path = createPath(db, reviewNow(), { objective: q('#sp-objective').value, ids: Array.from(selected), max: q('#sp-max').value,
          mode: modeNow(), helps, mapName, language: root.MappAIDocHead?.lingua?.() });
        const result = await save(path);
        q('#sp-status').textContent = t(result.archived ? 'sp_saved' : 'sp_archive_failed');
        root.MappAIStudyExport?.openPrintable?.(result.html, { title: t('sp_title') });
      } catch (e) { q('#sp-status').textContent = e.message; }
      finally {
        saving = false; modal.setAttribute('aria-busy', 'false');
        modal.querySelectorAll('button,input,select,textarea').forEach(el => { el.disabled = false; });
        render();
      }
    };
    showStep(1, false); modal.showModal(); q('#sp-objective').focus(); return true;
  }
  return { labels, approvedItems, createPath, buildHtml, save, open };
}));
