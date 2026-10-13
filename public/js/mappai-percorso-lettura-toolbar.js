/* Packet 0070: strumenti dell'editor lettura; nessun I/O o modello AI.
 * Stili e core della Sintesi, callback del controller per salvataggi e output. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./mappai-docedit-core'), require('./mappai-font-core'), require('./mappai-doc-head'));
  else root.MappAIPercorsoLetturaToolbar = factory(root.MappAIDocEdit, root.MappAIFontCore, root.MappAIDocHead);
}(typeof globalThis !== 'undefined' ? globalThis : this, function (D, Fonts, Head) {
  'use strict';
  function mount(frame, o) {
    const doc = frame.ownerDocument, sheet = o.sheet, esc = Head.esc;
    const t = (k, f) => typeof window.t === 'function' ? window.t(k, f) : f;
    const bar = doc.createElement('div'); bar.className = 'de-bar lettura-editor-bar';
    const btn = (id, label, icon, primary) => '<button type="button" class="de-btn' + (primary ? ' de-primary' : '') + '" data-toolbar-action="' + id + '">' +
      (icon ? '<i data-lucide="' + icon + '" aria-hidden="true"></i> ' : '') + '<span>' + esc(label) + '</span></button>';
    const colors = D.DEFAULT_SLOTS;
    bar.innerHTML = '<div class="de-style">' + ['bold', 'italic', 'underline'].map((cmd, i) => '<button type="button" class="de-sbtn" data-format="' + cmd + '" title="' +
        esc(t(['de_bold', 'de_italic', 'de_underline'][i], ['Grassetto', 'Corsivo', 'Sottolineato'][i])) + '">' + ['<b>B</b>', '<i>I</i>', '<u>U</u>'][i] + '</button>').join('') +
      '<span class="de-sep"></span><input type="color" class="de-color" data-color value="' + colors[0] + '" title="' + esc(t('de_color', 'Colore del testo')) + '">' +
      '<button type="button" class="de-sbtn" data-toolbar-action="pipette" title="' + esc(t('de_pipette', 'Pipetta: prendi un colore dallo schermo')) + '"><i data-lucide="pipette" aria-hidden="true"></i></button>' +
      '<span class="de-slots">' + colors.map(c => '<button type="button" class="de-slot" data-color-slot="' + c + '" style="background-color:' + c + '" title="' + esc(c) + '"></button>').join('') + '</span></div>' +
      '<div class="de-spacer"></div><select class="de-ns-sel de-font" data-toolbar-option="fontId" aria-label="' + esc(t('de_font_lbl', 'Carattere del documento')) + '">' +
      '<option value=""' + (!o.fontId ? ' selected' : '') + '>' + esc(t('de_font_app', 'Come l’app') + ' · ' + Fonts.font(window.MappAIFont?.attivo?.() || Fonts.DEFAULT).etichetta) + '</option>' +
      Fonts.elenco().map(f => '<option value="' + f.id + '"' + (f.id === o.fontId ? ' selected' : '') + '>' + esc(f.etichetta) + '</option>').join('') + '</select>' +
      '<div class="de-zoom">' + btn('zoom-minus', '−') + btn('zoom-reset', '100%') + btn('zoom-plus', '+') + '</div>' +
      btn('undo', t('de_undo', 'Annulla'), 'undo-2') +
      '<label class="lettura-toolbar-check"><input type="checkbox" data-toolbar-option="includeHelp"' + (o.includeHelp ? ' checked' : '') + '> ' + esc(t('pl_toolbar_help', 'Aiuti')) + '</label>' +
      '<label class="lettura-toolbar-check"><input type="checkbox" data-toolbar-option="includeGuide"' + (o.includeGuide ? ' checked' : '') + '> ' + esc(t('pl_toolbar_guide', 'Guide docente nel PDF')) + '</label>' +
      btn('review', t('pl_toolbar_review', 'Controllo G2'), 'list-checks') + btn('html', 'HTML', 'file-code-2') +
      btn('print', t('de_print', 'Stampa'), 'printer') + btn('pdf', t('de_pdf', 'Crea PDF'), 'file-down') +
      btn('save', t('de_save', 'Salva'), 'save') + btn('exit', t('de_exit', 'Esci'), 'log-out', true) +
      '<p class="lettura-toolbar-status" role="status" aria-live="polite"></p>';
    frame.insertBefore(bar, frame.firstChild);
    const head = doc.createElement('header'); head.className = 'de-sheet-head';
    head.innerHTML = '<input type="text" class="de-sheet-title lettura-editor-title" data-toolbar-option="title" aria-label="' + esc(t('pl_toolbar_title', 'Titolo della scheda')) + '" value="' + esc(o.title) + '">';
    sheet.insertBefore(head, sheet.firstChild);
    const history = D.createHistory(), note = bar.querySelector('.lettura-toolbar-status');
    const fields = () => Array.from(frame.querySelectorAll('[data-toolbar-option],[data-campo]'));
    const snapshot = () => fields().map(el => ({ key: el.hasAttribute('data-toolbar-option') ? 'toolbar:' + el.dataset.toolbarOption :
      el.closest('[data-inline-activity]')?.dataset.inlineActivity + ':' + el.dataset.campo,
      value: el.hasAttribute('data-rich') ? el.innerHTML : el.type === 'checkbox' ? el.checked : el.value }));
    let savedMeta = JSON.stringify(meta()), last = snapshot(), busy = false, destroyed = false, range = null;
    let zoom = 1;
    try { zoom = D.nearestZoom(localStorage.getItem('mappai_doc_zoom_lettura') || 1); } catch (_) { /* preferenza facoltativa */ }
    function meta() { return Object.fromEntries(Array.from(frame.querySelectorAll('[data-toolbar-option]'), el =>
      [el.dataset.toolbarOption, el.type === 'checkbox' ? el.checked : String(el.value).trim()])); }
    function hasUnsaved() { return o.editor.hasUnsaved() || JSON.stringify(meta()) !== savedMeta; }
    function paint() {
      sheet.style.setProperty('--de-user', zoom);
      sheet.parentElement.classList.add('de-fontdoc');
      sheet.parentElement.style.setProperty('--doc-font', Fonts.stackDi(meta().fontId || window.MappAIFont?.attivo?.() || Fonts.DEFAULT));
      bar.querySelector('[data-toolbar-action="zoom-reset"]').textContent = Math.round(zoom * 100) + '%';
      bar.querySelector('[data-toolbar-action="undo"]').disabled = busy || !history.canUndo();
      bar.querySelector('[data-toolbar-action="exit"] span').textContent = hasUnsaved() ? t('de_exit_save', 'Salva ed Esci') : t('de_exit', 'Esci');
      sheet.dataset.includeHelp = String(meta().includeHelp);
    }
    function remember() {
      if (busy || destroyed) return;
      const next = snapshot(); if (JSON.stringify(next) !== JSON.stringify(last)) { history.push(last); last = next; }
      paint();
    }
    function rememberRange() {
      const selection = doc.getSelection?.();
      if (!selection?.rangeCount || !sheet.contains(selection.anchorNode)) return;
      const candidate = selection.getRangeAt(0), node = candidate.commonAncestorContainer;
      const field = (node.nodeType === 1 ? node : node.parentElement)?.closest('[data-rich]');
      range = field && sheet.contains(field) ? candidate.cloneRange() : null;
    }
    function format(command, value) {
      if (!range || range.collapsed || !sheet.contains(range.commonAncestorContainer)) { note.textContent = t('de_select_first', 'Seleziona prima il testo da formattare'); return; }
      const selection = doc.getSelection(); selection.removeAllRanges(); selection.addRange(range);
      doc.execCommand('styleWithCSS', false, command === 'foreColor'); doc.execCommand(command, false, value || null);
      rememberRange(); remember();
    }
    async function save() {
      if (busy || destroyed || o.editor.isBusy()) return false;
      const value = meta(); if (!value.title) { note.textContent = t('pl_toolbar_title_required', 'Indica il titolo della scheda.'); return false; }
      busy = true; frame.setAttribute('aria-busy', 'true'); note.textContent = t('pl_materials_working', 'Operazione in corso…');
      const editable = Array.from(frame.querySelectorAll('[contenteditable="true"]')); editable.forEach(el => el.setAttribute('contenteditable', 'false'));
      bar.querySelectorAll('button,input,select').forEach(el => { el.disabled = true; });
      try {
        if (!await o.editor.save()) throw Error(t('pl_materials_failed', 'Operazione non riuscita. Le scelte sono conservate.'));
        if (destroyed) return false;
        await o.onSave(value); if (destroyed) return false;
        savedMeta = JSON.stringify(value); last = snapshot(); history.clear();
        note.textContent = t('pl_materials_done', 'Operazione completata.'); return true;
      } catch (e) { note.textContent = e.message; return false; }
      finally { busy = false; frame.removeAttribute('aria-busy'); editable.filter(el => frame.contains(el)).forEach(el => el.setAttribute('contenteditable', 'true'));
        bar.querySelectorAll('button,input,select').forEach(el => { el.disabled = false; }); if (!destroyed) paint(); }
    }
    async function click(event) {
      const target = event.target.closest('button'); if (!target || !bar.contains(target) || busy || destroyed) return;
      if (o.editor.isBusy()) { note.textContent = t('pl_wait_operation', 'Attendi che termini l’operazione in corso.'); return; }
      try {
        if (target.dataset.format) return format(target.dataset.format);
        if (target.dataset.colorSlot) return format('foreColor', D.normColor(target.dataset.colorSlot));
        const action = target.dataset.toolbarAction;
        if (action.startsWith('zoom-')) { zoom = action === 'zoom-reset' ? 1 : D.stepZoom(zoom, action === 'zoom-plus' ? 1 : -1);
          try { localStorage.setItem('mappai_doc_zoom_lettura', String(zoom)); } catch (_) { /* preferenza facoltativa */ } paint(); return; }
        if (action === 'undo') {
          const prev = history.undo(); if (!prev) return;
          const current = fields(); prev.state.forEach(row => { const el = current.find(el =>
            (el.hasAttribute('data-toolbar-option') ? 'toolbar:' + el.dataset.toolbarOption : el.closest('[data-inline-activity]')?.dataset.inlineActivity + ':' + el.dataset.campo) === row.key);
            if (!el) return; if (el.hasAttribute('data-rich')) el.innerHTML = row.value; else if (el.type === 'checkbox') el.checked = row.value; else el.value = row.value; });
          last = snapshot(); paint(); return;
        }
        if (action === 'pipette') {
          if (!window.EyeDropper) { note.textContent = t('de_no_eyedropper', 'Pipetta non disponibile in questa finestra'); return; }
          const picked = await new window.EyeDropper().open(); if (!destroyed && !busy) format('foreColor', D.normColor(picked.sRGBHex)); return;
        }
        if (action === 'save') return save();
        if (action === 'exit') { if (!hasUnsaved() || await save()) o.onExit(); return; }
        if (hasUnsaved() && !await save()) return;
        await (action === 'review' ? o.onReview() : action === 'print' ? o.onPrint(meta()) : o.onExport(action));
        if (action === 'review' && !destroyed) { last = snapshot(); history.clear(); range = null; paint(); }
      } catch (e) { note.textContent = e.message; }
    }
    const mouseDown = e => { if (e.target.closest('button')) e.preventDefault(); };
    const color = e => { if (e.target.hasAttribute('data-color')) format('foreColor', D.normColor(e.target.value)); };
    const paste = e => { if (!e.target.closest('[data-rich]')) return; e.preventDefault(); doc.execCommand('insertText', false, e.clipboardData.getData('text/plain')); remember(); };
    const keyDown = e => { if (e.key === 'Enter' && !e.isComposing && e.target.closest('[data-rich]')) { e.preventDefault(); doc.execCommand('insertLineBreak'); remember(); } };
    frame.addEventListener('input', remember); frame.addEventListener('change', remember);
    frame.addEventListener('keyup', rememberRange); frame.addEventListener('mouseup', rememberRange);
    frame.addEventListener('paste', paste); frame.addEventListener('keydown', keyDown); bar.addEventListener('mousedown', mouseDown); bar.addEventListener('click', click); bar.addEventListener('change', color);
    paint(); window.safeCreateIcons?.();
    return { element: bar, save, hasUnsaved, isBusy: () => busy,
      destroy() { destroyed = true; frame.removeEventListener('input', remember); frame.removeEventListener('change', remember); frame.removeEventListener('keyup', rememberRange);
        frame.removeEventListener('mouseup', rememberRange); frame.removeEventListener('paste', paste); frame.removeEventListener('keydown', keyDown); bar.removeEventListener('mousedown', mouseDown); bar.removeEventListener('click', click); bar.removeEventListener('change', color); head.remove(); bar.remove(); } };
  }
  return Object.freeze({ mount });
}));
