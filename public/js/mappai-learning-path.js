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
    sp_try: ['Prova a rispondere, poi confronta il tuo lavoro con le soluzioni.', 'Try answering, then compare your work with the answers.']
  };
  function t(key, lang) {
    const pair = labels[key] || [key, key];
    return lang ? pair[lang.indexOf('en') === 0 ? 1 : 0] : (root.t ? root.t(key, pair[0]) : pair[0]);
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
    modal.id = 'mappai-learning-path-dialog'; modal.className = 'pm-dialog'; modal.setAttribute('aria-labelledby', 'sp-dialog-title');
    modal.style.cssText = 'width:min(760px,92vw);max-height:90vh;padding:24px;border:1px solid #64748b;border-radius:16px;color:#17233a;background:white;';
    modal.innerHTML = '<style>#mappai-learning-path-dialog::backdrop{background:#17233a99}#mappai-learning-path-dialog label{display:block;margin:.6em 0}#mappai-learning-path-dialog textarea{box-sizing:border-box;width:100%;font:inherit}#mappai-learning-path-dialog select,#mappai-learning-path-dialog input{font:inherit}#mappai-learning-path-dialog fieldset{padding:1em;margin:1em 0}#mappai-learning-path-dialog button{margin:.5em .5em 0 0}#mappai-learning-path-dialog :focus-visible{outline:3px solid #1d4ed8;outline-offset:2px}</style>' +
      '<h2 class="pm-title" id="sp-dialog-title">' + esc(t('sp_title')) + '</h2><label for="sp-objective">' + esc(t('sp_objective')) + '</label><textarea id="sp-objective" rows="2" required></textarea>' +
      '<label for="sp-area">' + esc(t('sp_area')) + '</label><select id="sp-area"><option value="">' + esc(t('sp_all')) + '</option>' +
      Array.from(new Set(items.flatMap(it => it.areas))).map(a => '<option>' + esc(a) + '</option>').join('') + '</select>' +
      '<label for="sp-max">' + esc(t('sp_max')) + '</label><input id="sp-max" type="number" min="1" max="20" value="4">' +
      '<label for="sp-mode">' + esc(t('sp_mode')) + '</label><select id="sp-mode">' + ['supported', 'independent', 'deeper'].map(v => '<option value="' + v + '">' + esc(t('sp_' + v)) + '</option>').join('') + '</select>' +
      '<fieldset><legend>' + esc(t('sp_choose')) + '</legend><div id="sp-items"></div></fieldset><p id="sp-count" role="status"></p><p id="sp-status" role="status"></p>' +
      '<button type="button" class="pm-btn-primary" id="sp-create">' + esc(t('sp_save')) + '</button><button type="button" class="pm-btn-cancel" id="sp-close">' + esc(t('sp_close')) + '</button>';
    root.document.body.appendChild(modal);
    const selected = new Set(), helps = {}, byId = new Map(items.map(it => [it.id, it])), q = sel => modal.querySelector(sel);
    const revision = review.approvedRevision, materials = materialRevision(review), vaultPath = state().activeVaultPath;
    function render() {
      const max = Math.min(20, Math.max(1, parseInt(q('#sp-max').value, 10) || 4)), area = q('#sp-area').value;
      q('#sp-items').innerHTML = items.filter(it => !area || it.areas.includes(area) || selected.has(it.id)).map((it, i) =>
        '<div><label><input type="checkbox" data-item="' + esc(it.id) + '"' + (selected.has(it.id) ? ' checked' : selected.size >= max ? ' disabled' : '') + '> ' + esc(it.question) + '</label>' +
        (selected.has(it.id) ? '<label for="sp-help-' + i + '">' + esc(t('sp_help_edit')) + '</label><textarea id="sp-help-' + i + '" data-help="' + esc(it.id) + '" rows="3" placeholder="' + esc(t('sp_no_help')) + '">' + esc(helps[it.id] == null ? it.help.text : helps[it.id]) + '</textarea>' : '') + '</div>').join('');
      q('#sp-count').textContent = t('sp_selected') + ': ' + selected.size + ' / ' + max;
      q('#sp-create').disabled = !selected.size || selected.size > max || !q('#sp-objective').value.trim();
    }
    q('#sp-items').addEventListener('change', e => { const id = e.target.dataset.item; if (id && byId.has(id)) {
      e.target.checked ? selected.add(id) : selected.delete(id); render();
      Array.from(q('#sp-items').querySelectorAll('[data-item]')).find(el => el.dataset.item === id)?.focus();
    } });
    q('#sp-items').addEventListener('input', e => { if (e.target.dataset.help) helps[e.target.dataset.help] = e.target.value; });
    q('#sp-area').onchange = render; q('#sp-max').oninput = render; q('#sp-objective').oninput = render;
    q('#sp-close').onclick = () => modal.close();
    modal.addEventListener('close', () => { modal.remove(); previouslyFocused?.focus(); });
    q('#sp-create').onclick = async () => {
      q('#sp-create').disabled = true;
      try {
        if (state().activeVaultPath !== vaultPath || reviewNow()?.approvedRevision !== revision || materialRevision(reviewNow()) !== materials) throw new Error(t('sp_stale'));
        const path = createPath(db, reviewNow(), { objective: q('#sp-objective').value, ids: Array.from(selected), max: q('#sp-max').value,
          mode: q('#sp-mode').value, helps, mapName: state().rootNodeLabel || '', language: root.MappAIDocHead?.lingua?.() });
        const result = await save(path);
        q('#sp-status').textContent = t(result.archived ? 'sp_saved' : 'sp_archive_failed');
        root.MappAIStudyExport?.openPrintable?.(result.html, { title: t('sp_title') });
      } catch (e) { q('#sp-status').textContent = e.message; }
      finally { render(); }
    };
    render(); modal.showModal(); q('#sp-objective').focus(); return true;
  }
  return { labels, approvedItems, createPath, buildHtml, save, open };
}));
