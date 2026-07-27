// ══════════════════════════════════════════════════════════════════════════
// MappAI — EDITOR DOCUMENTI (modalità «Documenti» del tab ELABORA)
// ══════════════════════════════════════════════════════════════════════════
//
// ELABORA lavora sulla FONTE (modalità «Fonte»). Qui lavora sugli OUTPUT già
// generati: quiz (V/F, scelta multipla, domande proprie), flashcard e sintesi.
//
// Principio: si edita la SORGENTE (gli item del set di studio, i blocchi della
// sintesi) e la resa resta quella dei builder di stampa esistenti — l'editor
// mostra il FOGLIO, non una sua imitazione: stesse misure, stessi colori,
// stessa gerarchia tipografica di buildQuizSetHtml / _buildSynthesisPrintHtml.
// Così quello che il docente vede a schermo è quello che esce dalla stampante.
//
// Dipendenze: mappai-docedit-core.js (modello puro, undo, sanitizzazione),
// mappai-quiz-print.js (builder foglio), mappai-branch-synthesis.js (sintesi),
// mappai-print-dossier.js (foglio flashcard PDF), mappai-study-export-core.js
// (archivio documenti). Caricato DOPO mappai-elabora.js.
//
// Font: le DIMENSIONI non sono modificabili — dipendono dal tipo di campo
// (titolo / testo / note), come nel foglio stampato. Il docente può cambiare
// solo corsivo, grassetto, sottolineato e colore.
(function () {
    'use strict';

    function _appState() {
        try { return (typeof appState !== 'undefined') ? appState : window.appState; }
        catch (e) { return window.appState; }
    }
    function t(k, f) { return window.t ? window.t(k, f) : f; }
    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
    function DE() { return window.MappAIDocEdit; }
    function toast(msg, kind) { if (window.showToast) window.showToast(msg, kind || 'info'); }

    // ── stato di modulo ─────────────────────────────────────────────────────
    let _view = 'list';        // 'list' | 'doc'
    let _kind = null;          // 'quiz' | 'flashcards' | 'synthesis'
    let _doc = null;           // documento editabile corrente (quiz/flashcard)
    let _srcSet = null;        // set di studio di provenienza (per il round-trip)
    let _syn = null;           // { data, blocks:[{tag,html}], base:[…], archiveId }
    let _hist = null;          // cronologia annulla (core)
    let _dirty = false;
    const _flashFmt = '2x2v';   // unico formato del foglio flashcard
    let _flashBack = false;
    let _stylesInjected = false;
    let _mapKey = null;        // mappa da cui viene il documento aperto (vedi _currentMapKey)

    // Identità della mappa aperta: id di progetto + titolo. Serve a impedire che un
    // documento aperto su una mappa venga salvato dentro un'altra (in ELABORA si
    // cambia progetto senza uscire dal tab).
    function _currentMapKey() {
        const s = _appState();
        let pid = null;
        try { if (typeof StorageManager !== 'undefined') pid = StorageManager.currentProjectId || null; } catch (e) { }
        return (pid || '') + '|' + ((s && s.rootNodeLabel) || '');
    }
    function _sameMap() { return _mapKey === null || _mapKey === _currentMapKey(); }

    const COLOR_KEY = 'mappai_doc_colors';
    function _slots() {
        try {
            const raw = JSON.parse(localStorage.getItem(COLOR_KEY) || 'null');
            if (Array.isArray(raw) && raw.length) return raw.slice(0, DE().COLOR_SLOTS);
        } catch (e) { /* default */ }
        return DE().DEFAULT_SLOTS.slice();
    }
    function _saveSlots(arr) { try { localStorage.setItem(COLOR_KEY, JSON.stringify(arr)); } catch (e) { } }

    function _host() { return document.getElementById('elab-doc-host'); }

    // ── elenco documenti disponibili ────────────────────────────────────────
    function _sets() {
        const s = _appState();
        return ((s && s.db && s.db.studySets) || []).filter(x => x && Array.isArray(x.items) && x.items.length);
    }
    function _synthesisEntries() {
        const out = [];
        try {
            const cur = window.MappAIBranchSynthesis && window.MappAIBranchSynthesis.getData && window.MappAIBranchSynthesis.getData();
            if (cur) out.push({ id: 'current', title: cur.branchLabel || t('de_synth', 'Sintesi'), live: true });
        } catch (e) { /* nessuna sintesi in memoria */ }
        try {
            const docs = (window.MappAIStudyDocs && window.MappAIStudyDocs.list && window.MappAIStudyDocs.list()) || [];
            docs.filter(d => d.kind === 'synthesis' && d.html).forEach(d => out.push({ id: d.id, title: d.title, date: d.date }));
        } catch (e) { /* archivio vuoto */ }
        return out;
    }

    // ── apertura documenti ──────────────────────────────────────────────────
    function openSet(setId) {
        const set = _sets().find(s => s.id === setId);
        if (!set) { toast(t('de_no_set', 'Set non trovato'), 'warning'); return; }
        _srcSet = set;
        _doc = DE().docFromSet(set);
        _kind = _doc.kind;
        _syn = null;
        _hist = DE().createHistory(20);
        _dirty = false;
        _mapKey = _currentMapKey();
        _view = 'doc';
        render();
    }

    function openSynthesis(id) {
        const BS = window.MappAIBranchSynthesis;
        let data = null, html = '', archiveId = null, archiveTitle = null;
        if (id === 'current' && BS && BS.getData) {
            data = BS.getData();
            html = (BS.bodyHtml && BS.bodyHtml(data)) || '';
        } else if (window.MappAIStudyDocs) {
            const rec = window.MappAIStudyDocs.get(id);
            if (rec && rec.html) {
                archiveId = rec.id; archiveTitle = rec.title;
                // Dal documento archiviato si recupera il solo CORPO (.bs-body):
                // header, citazioni e lettore audio restano quelli del builder.
                const m = /<div class="bs-body">([\s\S]*?)<\/div>\s*(?:<div class="bs-footer|<script|<\/body)/i.exec(rec.html);
                html = m ? m[1] : rec.html;
                data = { branchLabel: rec.title, mapName: rec.mapName, rawText: '', archived: true };
            }
        }
        if (!data) { toast(t('de_no_synth', 'Nessuna sintesi disponibile: generane una dal menu «Materiali di studio».'), 'warning'); return; }
        const blocks = DE().blocksFromHtml(html);
        if (!blocks.length) { toast(t('de_synth_empty', 'La sintesi non contiene testo editabile.'), 'warning'); return; }
        _syn = {
            data: data, blocks: blocks, base: JSON.parse(JSON.stringify(blocks)),
            archiveId: archiveId, archiveTitle: archiveTitle, id: id
        };
        _kind = 'synthesis'; _doc = null; _srcSet = null;
        _hist = DE().createHistory(20);
        _dirty = false;
        _mapKey = _currentMapKey();
        _view = 'doc';
        render();
    }

    function backToList() {
        if (_dirty && !confirm(t('de_leave', 'Ci sono modifiche non salvate. Uscire comunque?'))) return;
        _view = 'list'; _doc = null; _syn = null; _kind = null; _dirty = false;
        render();
    }

    // ── cronologia ──────────────────────────────────────────────────────────
    function _snapshot(label) {
        if (!_hist) return;
        _hist.push(_kind === 'synthesis' ? { blocks: _syn.blocks } : { items: _doc.items, title: _doc.title }, label);
    }
    function undo() {
        if (!_hist || !_hist.canUndo()) { toast(t('de_no_undo', 'Niente da annullare'), 'info'); return; }
        const prev = _hist.undo();
        if (!prev) return;
        if (_kind === 'synthesis') _syn.blocks = prev.state.blocks;
        else { _doc.items = prev.state.items; _doc.title = prev.state.title; }
        _dirty = true;
        render();
        toast(t('de_undone', 'Annullato') + (prev.label ? ': ' + prev.label : ''), 'info');
    }

    // ── modifiche quiz ──────────────────────────────────────────────────────
    function _commitField(i, path, value) {
        _doc.items = DE().setField(_doc.items, i, path, value);
        _dirty = true;
        _paintDirty();
    }
    function addQuestion(after) {
        _snapshot(t('de_op_add_q', 'aggiungi domanda'));
        const at = (after == null) ? _doc.items.length : after + 1;
        _doc.items = DE().insertAt(_doc.items, at, DE().blankItemFor(_doc));
        _dirty = true; render();
        setTimeout(function () {
            const el = _host() && _host().querySelector('[data-i="' + at + '"][data-f="question"]');
            if (el) el.focus();
        }, 30);
    }
    function delQuestion(i) {
        const label = DE().plainText(_doc.items[i] && _doc.items[i].question) || ('#' + (i + 1));
        if (!confirm(t('de_del_q', 'Eliminare la domanda') + ' ' + (i + 1) + '?\n\n' + label.slice(0, 120))) return;
        _snapshot(t('de_op_del_q', 'elimina domanda'));
        _doc.items = DE().removeAt(_doc.items, i);
        _dirty = true; render();
    }
    function moveQ(i, dir) {
        _snapshot(t('de_op_move', 'sposta domanda'));
        _doc.items = DE().moveItem(_doc.items, i, i + dir);
        _dirty = true; render();
    }
    function addOption(i) {
        _snapshot(t('de_op_add_opt', 'aggiungi opzione'));
        _doc.items = DE().addOption(_doc.items, i);
        _dirty = true; render();
    }
    function delOption(i, oi) {
        _snapshot(t('de_op_del_opt', 'elimina opzione'));
        _doc.items = DE().removeOption(_doc.items, i, oi);
        _dirty = true; render();
    }
    function setCorrect(i, oi) {
        _snapshot(t('de_op_correct', 'risposta corretta'));
        _doc.items = DE().setField(_doc.items, i, 'correctIndex', oi);
        _dirty = true; _paintDirty();
        const host = _host();
        if (host) {
            host.querySelectorAll('.de-opt[data-i="' + i + '"]').forEach(function (el) {
                el.classList.toggle('correct', String(el.getAttribute('data-oi')) === String(oi));
            });
        }
    }

    // ── modifiche sintesi ───────────────────────────────────────────────────
    function _commitBlock(i, html) {
        if (!_syn.blocks[i]) return;
        _syn.blocks[i].html = html;
        _dirty = true;
        _paintDirty();
    }
    function addBlock(i, tag) {
        _snapshot(t('de_op_add_b', 'aggiungi blocco'));
        _syn.blocks = DE().insertBlock(_syn.blocks, i + 1, tag || 'p');
        _dirty = true; render();
        setTimeout(function () {
            const el = _host() && _host().querySelector('[data-b="' + (i + 1) + '"]');
            if (el) el.focus();
        }, 30);
    }
    function delBlock(i) {
        if (!confirm(t('de_del_b', 'Eliminare questo blocco di testo?'))) return;
        _snapshot(t('de_op_del_b', 'elimina blocco'));
        _syn.blocks = DE().removeBlock(_syn.blocks, i);
        _dirty = true; render();
    }
    function moveBlock(i, dir) {
        _snapshot(t('de_op_move_b', 'sposta blocco'));
        _syn.blocks = DE().moveBlock(_syn.blocks, i, i + dir);
        _dirty = true; render();
    }

    // Stile inline: execCommand è l'unica via su contenteditable. Per grassetto/
    // corsivo/sottolineato serve styleWithCSS SPENTO (produce <b>/<i>/<u>); per il
    // colore ACCESO (produce <span style="color:…">). Il sanitizer del core tiene
    // entrambe le forme (e converte <font color> se il motore la produce).
    function fmt(cmd) {
        const sel = document.getSelection();
        if (!sel || sel.isCollapsed) { toast(t('de_select_first', 'Seleziona prima il testo da formattare'), 'info'); return; }
        _snapshot(t('de_op_style', 'stile testo'));
        try {
            document.execCommand('styleWithCSS', false, false);
            document.execCommand(cmd, false, null);
        } catch (e) { /* motore senza execCommand */ }
        _syncFocusedBlock();
    }
    function applyColor(hex) {
        const col = DE().normColor(hex);
        if (!col) return;
        const sel = document.getSelection();
        if (!sel || sel.isCollapsed) { toast(t('de_select_first', 'Seleziona prima il testo da formattare'), 'info'); return; }
        _snapshot(t('de_op_color', 'colore testo'));
        try {
            document.execCommand('styleWithCSS', false, true);
            document.execCommand('foreColor', false, col);
        } catch (e) { /* motore senza execCommand */ }
        _syncFocusedBlock();
        const arr = DE().pushColorSlot(_slots(), col);
        _saveSlots(arr);
        _paintSlots(arr);
    }
    async function eyedropper() {
        if (typeof window.EyeDropper !== 'function') { toast(t('de_no_eyedropper', 'Pipetta non disponibile in questa finestra'), 'warning'); return; }
        try {
            const res = await new window.EyeDropper().open();
            if (res && res.sRGBHex) applyColor(res.sRGBHex);
        } catch (e) { /* annullata dall'utente */ }
    }
    // Dopo un execCommand il DOM è cambiato: riporta l'HTML nel modello.
    function _syncFocusedBlock() {
        const el = document.activeElement;
        if (!el || !el.hasAttribute || !el.hasAttribute('data-b')) return;
        _commitBlock(parseInt(el.getAttribute('data-b'), 10), el.innerHTML);
    }

    // ── salvataggio ─────────────────────────────────────────────────────────
    function save() {
        if (_kind === 'synthesis') return _saveSynthesis();
        return _saveQuiz();
    }

    function _saveQuiz() {
        const s = _appState();
        // La mappa è cambiata sotto i piedi (cambio progetto in ELABORA): salvare
        // qui inietterebbe il quiz in un progetto che non è il suo.
        if (!_sameMap()) {
            toast(t('de_map_changed', 'La mappa aperta è cambiata: questo documento appartiene a un\'altra mappa e non viene salvato. Riaprilo dalla mappa giusta.'), 'error');
            return;
        }
        const problems = DE().validateDoc(_doc);
        if (problems.length && !confirm(
            t('de_problems', 'Il documento ha dei problemi:') + '\n\n' +
            problems.slice(0, 6).map(p => '• ' + p.msg).join('\n') +
            (problems.length > 6 ? '\n…' : '') + '\n\n' + t('de_save_anyway', 'Salvare comunque?'))) return;

        const sets = (s.db.studySets = s.db.studySets || []);
        const idx = sets.findIndex(x => x.id === _srcSet.id);
        const updated = DE().applyToSet(_srcSet, _doc);
        updated.editedAt = Date.now();
        // Set sparito dalla mappa (eliminato altrove, o progetto ricaricato): meglio
        // dirlo che ricrearlo in silenzio dove non era.
        if (idx < 0) {
            if (!confirm(t('de_set_gone', 'Questo set non è più nella mappa (eliminato o mappa ricaricata). Vuoi aggiungerlo di nuovo?'))) return;
            sets.push(updated);
        } else {
            sets[idx] = updated;
        }
        _srcSet = updated;
        try { if (typeof StorageManager !== 'undefined' && StorageManager.saveCurrentProject) StorageManager.saveCurrentProject(); } catch (e) { }
        try { if (typeof window.renderStudySets === 'function') window.renderStudySets(); } catch (e) { }
        _dirty = false; _paintDirty();
        toast(t('de_saved', '✓ Documento salvato') + ' — ' + _doc.items.length + ' ' +
            (_kind === 'flashcards' ? t('de_cards', 'carte') : t('de_questions', 'domande')), 'success');
        _archivePaper();
    }

    // Archivio documenti (INSEGNA → «Quiz cartacei»): il foglio stampabile viene
    // salvato come HTML, così è richiamabile per QR/stampa senza rigenerarlo.
    function _archivePaper() {
        try {
            if (!window.MappAIStudyDocs || _kind === 'synthesis') return;
            const s = _appState();
            const isFlash = _kind === 'flashcards';
            const html = isFlash
                ? window.buildFlashcardSetHtml(_srcSet, { includeBar: true })
                : window.buildQuizSetHtml(_srcSet, { includeBar: true });
            window.MappAIStudyDocs.save({
                kind: isFlash ? 'flashsheet' : 'quizpaper',
                // L'archivio deduplica per kind|titolo|mappa: due set diversi con lo
                // stesso titolo (MC e V/F dello stesso ramo) si sovrascriverebbero →
                // il tipo entra nel titolo quando non c'è già.
                title: _archiveTitle(),
                mapName: (s && s.rootNodeLabel) || '',
                // carte oltre soglia → badge «da rivedere» in INSEGNA
                overLimit: isFlash ? _overCards().length : 0,
                html: html
            });
        } catch (e) { console.warn('[DocEditor] archivio non aggiornato:', e); }
    }
    function _archiveTitle() {
        const base = _doc.title || (_srcSet && _srcSet.title) || t('de_quiz', 'Quiz');
        const type = (_srcSet && _srcSet.type) || _doc.type || '';
        if (!type || base.toLowerCase().indexOf(type.toLowerCase()) >= 0) return base;
        return base + ' · ' + type;
    }

    function _saveSynthesis() {
        const BS = window.MappAIBranchSynthesis;
        if (!BS) return;
        if (!_sameMap()) {
            toast(t('de_map_changed', 'La mappa aperta è cambiata: questo documento appartiene a un\'altra mappa e non viene salvato. Riaprilo dalla mappa giusta.'), 'error');
            return;
        }
        // Zero blocchi = documento svuotato: salvarlo farebbe ricomparire in stampa
        // il testo originale dell'AI (il builder torna alla sorgente), senza dirlo.
        if (!_syn.blocks.filter(b => b.tag !== 'raw').length) {
            toast(t('de_synth_no_blocks', 'La sintesi non ha più testo: aggiungi almeno un paragrafo prima di salvare.'), 'warning');
            return;
        }
        const data = Object.assign({}, _syn.data, { editedBlocks: JSON.parse(JSON.stringify(_syn.blocks)) });
        // L'audio con voce naturale è allineato ai BLOCCHI: se il testo letto cambia
        // i cue non corrispondono più → si invalida e va rigenerato.
        if (DE().audioStale(_syn.base, _syn.blocks)) {
            data._audioBlob = null; data._audioUrl = null; data._cues = null;
        }
        if (_syn.id === 'current' && BS.setData) BS.setData(data);
        _syn.data = data;
        _syn.base = JSON.parse(JSON.stringify(_syn.blocks));
        try {
            if (_syn.archiveId && window.MappAIStudyDocs) {
                // Documento riaperto dall'archivio: si aggiorna QUELLA voce (stesso
                // id e stesso titolo → stessa chiave di dedup).
                window.MappAIStudyDocs.save({
                    id: _syn.archiveId, kind: 'synthesis',
                    title: _syn.archiveTitle || data.branchLabel || t('de_synth', 'Sintesi'),
                    mapName: data.mapName || '', html: BS.buildPrintHtml(data)
                });
            } else if (BS.archiveDoc) {
                BS.archiveDoc(data);   // stessa chiave dell'auto-salvataggio: aggiorna, non duplica
            }
        } catch (e) { console.warn('[DocEditor] archivio sintesi:', e); }
        _dirty = false; _paintDirty();
        toast(t('de_saved_synth', '✓ Sintesi salvata — il testo rivisto vale per stampa, PDF e condivisione'), 'success');
    }

    // ── uscite: stampa / esporta ────────────────────────────────────────────
    // includeBar:false = niente barra «Stampa/Chiudi» in cima: serve per il PDF
    // (la barra è no-print a schermo, ma nel PDF via printToPDF resterebbe).
    function _quizHtml(includeAnswers, includeBar) {
        const set = DE().applyToSet(_srcSet || { id: _doc.id, title: _doc.title }, _doc);
        const opts = { includeAnswers: includeAnswers !== false, includeBar: includeBar !== false };
        return (_kind === 'flashcards')
            ? window.buildFlashcardSetHtml(set, opts)
            : window.buildQuizSetHtml(set, opts);
    }

    function print() {
        if (_kind === 'synthesis') {
            const data = Object.assign({}, _syn.data, { editedBlocks: _syn.blocks });
            const html = window.MappAIBranchSynthesis.buildPrintHtml(data);
            return _openPrintable(html);
        }
        if (_kind === 'flashcards') return openFlashModal();
        openAnswersModal();
    }

    function _openPrintable(html) {
        if (window.MappAIStudyExport && window.MappAIStudyExport.openPrintable) {
            return window.MappAIStudyExport.openPrintable(html, {});
        }
        const w = window.open('', '_blank');
        if (!w) { toast(t('de_popup', 'Popup bloccato'), 'warning'); return; }
        w.document.write(html); w.document.close();
    }

    // Modale «con o senza soluzioni» (stesso pattern usato da INSEGNA).
    function openAnswersModal() {
        _modal(t('de_print_quiz', 'Stampa il quiz'), t('de_print_quiz_sub', 'Il foglio soluzioni va in una pagina a parte, in coda.'),
            '<label class="de-radio"><input type="radio" name="de-ans" value="1" checked><span><b>' +
            esc(t('de_with_answers', 'Con soluzioni')) + '</b><small>' + esc(t('de_with_answers_d', 'Copia del docente: domande + foglio soluzioni.')) + '</small></span></label>' +
            '<label class="de-radio"><input type="radio" name="de-ans" value="0"><span><b>' +
            esc(t('de_no_answers', 'Senza soluzioni')) + '</b><small>' + esc(t('de_no_answers_d', 'Copia per gli allievi: solo le domande.')) + '</small></span></label>',
            function (root) {
                const withAns = root.querySelector('input[name="de-ans"]:checked').value === '1';
                _openPrintable(_quizHtml(withAns));
            });
    }

    // Modale foglio flashcard: formato + fronte/retro.
    function openFlashModal() {
        // Un solo formato: 2×2 verticale (4 carte da 95×133 mm su A4 in piedi).
        // Niente scelta da fare — il foglio è quello, e le soglie di caratteri
        // mostrate nell'editor valgono per quel formato.
        _modal(t('de_flash_sheet', 'Foglio flashcard'), t('de_flash_sheet_sub', 'A4 verticale, 4 carte per foglio, con linee di taglio.'),
            '<label class="de-radio"><input type="checkbox" id="de-back"' + (_flashBack ? ' checked' : '') + '><span><b>' +
            esc(t('de_duplex', 'Pagina retro separata (stampa fronte/retro)')) + '</b><small>' +
            esc(t('de_duplex_d', 'Senza: domanda sopra e risposta sotto, con la piega a metà carta.')) + '</small></span></label>',
            async function (root) {
                _flashBack = !!root.querySelector('#de-back').checked;
                const s = _appState();
                await window.printFlashcardSheet({
                    items: _doc.items,
                    title: _doc.title || (_srcSet && _srcSet.title) || 'Flashcard',
                    mapName: (s && s.rootNodeLabel) || '',
                    fmt: _flashFmt,
                    backside: _flashBack
                });
            });
    }

    // Sintesi: export .html (conserva il lettore TTS e la voce naturale).
    function exportHtml() {
        const data = Object.assign({}, _syn.data, { editedBlocks: _syn.blocks });
        const html = window.MappAIBranchSynthesis.buildPrintHtml(data);
        const name = 'Sintesi-' + String(data.branchLabel || 'mappa').replace(/[\\/:*?"<>|]/g, '-') + '.html';
        const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob); a.download = name;
        document.body.appendChild(a); a.click();
        setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
        toast(t('de_html_done', '✓ HTML scaricato — il lettore audio resta funzionante'), 'success');
    }

    // Orientamento del foglio da mandare a printToPDF: lo decide la geometria
    // del foglio flashcard (MappAIQuizPrint.flashSheet). I quiz restano verticali.
    function _flashLandscape() {
        if (_kind !== 'flashcards') return false;
        try {
            const QP = window.MappAIQuizPrint;
            return !!(QP && QP.flashSheet && QP.flashSheet().landscape);
        } catch (e) { return false; }
    }

    // Salva il foglio nel vault della mappa (Materiale Studio/), dove INSEGNA lo trova.
    async function saveToVault() {
        const s = _appState();
        const vaultPath = s && s.activeVaultPath;
        if (!window.electronAPI || !window.electronAPI.saveVaultFile) { toast(t('de_need_app', 'Richiede l\'app desktop.'), 'warning'); return; }
        if (!vaultPath) { toast(t('de_no_vault', 'Questa mappa non ha ancora una cartella vault: salvala nel vault dalla mappa.'), 'warning'); return; }
        try {
            let relPath, payload;
            if (_kind === 'synthesis') {
                const data = Object.assign({}, _syn.data, { editedBlocks: _syn.blocks });
                // Nome per RAMO: «Sintesi.html» secco è il file della pipeline
                // materiali (con l'MP3 della voce naturale accanto) — sovrascriverlo
                // disallineerebbe testo e audio e cancellerebbe la sintesi di un
                // altro ramo. La sintesi di tutta la mappa mantiene il nome storico.
                const label = String(_syn.data.branchLabel || '').replace(/[\\/:*?"<>|]/g, '-').trim();
                relPath = 'Materiale Studio/' + (_syn.data.whole || !label ? 'Sintesi' : 'Sintesi — ' + label) + ' (rivista).html';
                payload = { vaultPath: vaultPath, relPath: relPath, text: window.MappAIBranchSynthesis.buildPrintHtml(data) };
            } else {
                const base = (window.MappAIPipelineCore && window.MappAIPipelineCore.buildFileName)
                    ? window.MappAIPipelineCore.buildFileName(_kind === 'flashcards' ? 'flashcards' : (_doc.quizType === 'tf' ? 'quiz_tf' : 'quiz_mc'), _doc.title || 'Mappa', false)
                    : ('Quiz-' + (_doc.title || 'Mappa') + '.pdf');
                // Copia per gli allievi: le soluzioni restano nell'app (e nella copia
                // del docente, che si stampa da qui o da INSEGNA → Quiz cartacei).
                const html = _quizHtml(false, false);
                if (window.electronAPI.htmlToPdf) {
                    // Il foglio flashcard è orizzontale come il foglio dei nodi:
                    // senza questo flag printToPDF lo impagina in verticale e le
                    // carte escono tagliate.
                    const res = await window.electronAPI.htmlToPdf({ html: html, options: { landscape: _flashLandscape() } });
                    if (res && res.ok && res.base64) { payload = { vaultPath: vaultPath, relPath: 'Materiale Studio/' + base, base64: res.base64 }; }
                }
                if (!payload) {   // niente PDF → salva l'HTML (stesso nome, altra estensione)
                    relPath = 'Materiale Studio/' + base.replace(/\.pdf$/i, '.html');
                    payload = { vaultPath: vaultPath, relPath: relPath, text: html };
                }
            }
            const out = await window.electronAPI.saveVaultFile(payload);
            if (out && out.ok) toast(t('de_vault_ok', '✓ Salvato in Materiale Studio'), 'success');
            else toast(t('de_vault_ko', 'Salvataggio nel vault non riuscito') + (out && out.error ? ': ' + out.error : ''), 'error');
        } catch (e) {
            toast(t('de_vault_ko', 'Salvataggio nel vault non riuscito') + ': ' + e.message, 'error');
        }
    }

    // ── modale generico (stile .pm-* dell'app) ──────────────────────────────
    function _modal(title, sub, bodyHtml, onOk) {
        const old = document.getElementById('de-modal'); if (old) old.remove();
        const m = document.createElement('div');
        m.id = 'de-modal';
        m.className = 'fixed inset-0 z-[1200] flex items-center justify-center';
        // Struttura canonica dei modali dell'app (index.html §11): card bianca +
        // header con pm-icon-wrap/pm-title + pm-section + footer a due bottoni.
        m.innerHTML =
            '<div class="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"></div>' +
            '<div class="relative bg-white rounded-2xl shadow-2xl w-[92vw] max-w-[560px] max-h-[90vh] overflow-y-auto p-6 space-y-5">' +
            '<div class="flex items-center gap-3">' +
            '<div class="pm-icon-wrap"><i data-lucide="printer" class="w-5 h-5 text-indigo-600"></i></div>' +
            '<div><div class="pm-title">' + esc(title) + '</div><div class="pm-subtitle">' + esc(sub) + '</div></div>' +
            '</div>' +
            '<div class="pm-section space-y-2">' + bodyHtml + '</div>' +
            '<div class="flex gap-3">' +
            '<button type="button" class="pm-btn-cancel" id="de-modal-x">' + esc(t('de_cancel', 'Annulla')) + '</button>' +
            '<button type="button" class="pm-btn-primary" id="de-modal-ok"><i data-lucide="printer" class="w-4 h-4"></i>' + esc(t('de_ok', 'Continua')) + '</button>' +
            '</div></div>';
        document.body.appendChild(m);
        if (window.safeCreateIcons) window.safeCreateIcons({ root: m });
        const prevFocus = document.activeElement;
        function close() {
            document.removeEventListener('keydown', onKey, true);
            m.remove();
            try { if (prevFocus && prevFocus.focus) prevFocus.focus(); } catch (e) { }
        }
        function onKey(e) { if (e.key === 'Escape') { e.stopPropagation(); close(); } }
        document.addEventListener('keydown', onKey, true);
        m.querySelector('#de-modal-x').onclick = close;
        m.querySelector('.absolute').onclick = close;
        m.querySelector('#de-modal-ok').onclick = function () { const r = m; close(); onOk(r); };
        setTimeout(function () { const b = m.querySelector('#de-modal-ok'); if (b) b.focus(); }, 20);
    }

    // ── render ──────────────────────────────────────────────────────────────
    function render() {
        const host = _host();
        if (!host) return;
        _injectStyles();
        host.innerHTML = (_view === 'doc') ? _docHtml() : _listHtml();
        if (window.safeCreateIcons) window.safeCreateIcons({ root: host });
        _bind(host);
        _paintDirty();
    }

    function _listHtml() {
        const sets = _sets();
        const quiz = sets.filter(s => DE().kindOfSet(s) === 'quiz');
        const flash = sets.filter(s => DE().kindOfSet(s) === 'flashcards');
        const syn = _synthesisEntries();

        function row(icon, title, meta, onclick, badge) {
            return '<button type="button" class="de-row" onclick="' + onclick + '">' +
                '<i data-lucide="' + icon + '" class="w-4 h-4 text-indigo-400"></i>' +
                '<span class="de-row-t">' + esc(title) + '</span>' +
                (badge ? '<span class="de-row-b">' + esc(badge) + '</span>' : '') +
                '<span class="de-row-m">' + esc(meta) + '</span>' +
                '<i data-lucide="chevron-right" class="w-4 h-4 text-slate-300"></i>' +
                '</button>';
        }
        function group(icon, label, rows, empty) {
            return '<div class="de-group"><div class="de-group-h"><i data-lucide="' + icon + '" class="w-4 h-4 text-indigo-400"></i>' +
                esc(label) + '</div>' + (rows || '<div class="de-empty-row">' + esc(empty) + '</div>') + '</div>';
        }

        return '<div class="de-list">' +
            '<div class="de-list-head">' +
            '<div class="de-list-h">' + esc(t('de_hub_h', 'Documenti da elaborare')) + '</div>' +
            '<div class="de-list-p">' + esc(t('de_hub_p', 'Rivedi quello che l\'AI ha generato prima di darlo in mano alla classe: correggi i testi, togli le domande che non servono, aggiungine di tue. Il foglio che vedi qui è quello che esce dalla stampante.')) + '</div>' +
            '</div>' +
            group('list-checks', t('de_g_quiz', 'Quiz e verifiche'),
                quiz.map(s => row('file-question', s.title || t('de_quiz', 'Quiz'),
                    s.items.length + ' ' + t('de_questions', 'domande'),
                    'MappAIDocEditor.openSet(\'' + _q(s.id) + '\')',
                    DE().isTrueFalse(s.items) ? 'V/F' : (s.type || 'MC'))).join(''),
                t('de_g_quiz_e', 'Nessun quiz generato per questa mappa.')) +
            group('layers', t('de_g_flash', 'Flashcard'),
                flash.map(s => row('layers', s.title || 'Flashcard',
                    s.items.length + ' ' + t('de_cards', 'carte'),
                    'MappAIDocEditor.openSet(\'' + _q(s.id) + '\')')).join(''),
                t('de_g_flash_e', 'Nessun set di flashcard.')) +
            group('file-text', t('de_g_synth', 'Sintesi'),
                syn.map(d => row('file-text', d.title, d.live ? t('de_current', 'in memoria') : _date(d.date),
                    'MappAIDocEditor.openSynthesis(\'' + _q(d.id) + '\')')).join(''),
                t('de_g_synth_e', 'Nessuna sintesi: generane una da «Materiali di studio → Sintesi».')) +
            '</div>';
    }

    function _q(s) { return String(s).replace(/'/g, "\\'"); }
    function _date(ts) {
        if (!ts) return '';
        const d = new Date(ts);
        return String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0') + '/' + d.getFullYear();
    }

    // ── foglio quiz/flashcard editabile ─────────────────────────────────────
    function _docHtml() {
        return '<div class="de-doc">' + _docBar() + '<div class="de-sheet-wrap">' +
            (_kind === 'synthesis' ? _synthSheet() : _quizSheet()) + '</div></div>';
    }

    function _docBar() {
        const isSyn = _kind === 'synthesis';
        const title = isSyn ? (_syn.data.branchLabel || t('de_synth', 'Sintesi')) : (_doc.title || t('de_quiz', 'Quiz'));
        return '<div class="de-bar">' +
            '<button type="button" class="de-btn de-ghost" onclick="MappAIDocEditor.backToList()">‹ ' + esc(t('de_back', 'Documenti')) + '</button>' +
            '<div class="de-bar-t">' + esc(title) + '<span class="de-dirty" id="de-dirty">•</span></div>' +
            (isSyn ? _styleBar() : '') +
            '<div class="de-spacer"></div>' +
            '<button type="button" class="de-btn" onclick="MappAIDocEditor.undo()" title="' + esc(t('de_undo_tip', 'Annulla l\'ultima operazione')) + '"><i data-lucide="undo-2" class="w-4 h-4"></i> ' + esc(t('de_undo', 'Annulla')) + '</button>' +
            (isSyn
                ? '<button type="button" class="de-btn" onclick="MappAIDocEditor.exportHtml()" title="' + esc(t('de_html_tip', 'Scarica la pagina HTML: conserva il lettore audio')) + '"><i data-lucide="file-code-2" class="w-4 h-4"></i> HTML</button>'
                : '') +
            '<button type="button" class="de-btn" onclick="MappAIDocEditor.saveToVault()" title="' + esc(t('de_vault_tip', 'Scrive il foglio in Materiale Studio, dentro la cartella della mappa')) + '"><i data-lucide="folder-down" class="w-4 h-4"></i> ' + esc(t('de_vault', 'Nel vault')) + '</button>' +
            '<button type="button" class="de-btn" onclick="MappAIDocEditor.print()"><i data-lucide="printer" class="w-4 h-4"></i> ' + esc(t('de_print', 'Stampa')) + '</button>' +
            '<button type="button" class="de-btn de-primary" onclick="MappAIDocEditor.save()"><i data-lucide="save" class="w-4 h-4"></i> ' + esc(t('de_save', 'Salva')) + '</button>' +
            '</div>';
    }

    // Barra stile (solo sintesi): niente dimensioni — le decide il tipo di campo.
    function _styleBar() {
        const slots = _slots();
        return '<div class="de-style">' +
            '<button type="button" class="de-sbtn" onclick="MappAIDocEditor.fmt(\'bold\')" title="' + esc(t('de_bold', 'Grassetto')) + '"><b>B</b></button>' +
            '<button type="button" class="de-sbtn" onclick="MappAIDocEditor.fmt(\'italic\')" title="' + esc(t('de_italic', 'Corsivo')) + '"><i>I</i></button>' +
            '<button type="button" class="de-sbtn" onclick="MappAIDocEditor.fmt(\'underline\')" title="' + esc(t('de_underline', 'Sottolineato')) + '"><u>U</u></button>' +
            '<span class="de-sep"></span>' +
            '<input type="color" id="de-color" class="de-color" value="' + esc(slots[0] || '#1e293b') + '" title="' + esc(t('de_color', 'Colore del testo')) + '">' +
            '<button type="button" class="de-sbtn" onclick="MappAIDocEditor.eyedropper()" title="' + esc(t('de_pipette', 'Pipetta: prendi un colore dallo schermo')) + '"><i data-lucide="pipette" class="w-4 h-4"></i></button>' +
            '<span class="de-slots" id="de-slots">' + slots.map((c, i) =>
                '<button type="button" class="de-slot" data-c="' + esc(c) + '" style="background:' + esc(c) + '" title="' + esc(t('de_slot', 'Colore salvato') + ' ' + (i + 1)) + '"></button>').join('') + '</span>' +
            '</div>';
    }

    function _paintSlots(arr) {
        const box = document.getElementById('de-slots');
        if (!box) return;
        box.innerHTML = arr.map((c, i) => '<button type="button" class="de-slot" data-c="' + esc(c) + '" style="background:' + esc(c) + '" title="' + esc(t('de_slot', 'Colore salvato') + ' ' + (i + 1)) + '"></button>').join('');
    }

    function _paintDirty() {
        const d = document.getElementById('de-dirty');
        if (d) d.style.visibility = _dirty ? 'visible' : 'hidden';
    }

    // ── SOGLIA DI CARATTERI DELLE CARTE ──────────────────────────────────────
    // Quanto testo entra davvero in una carta stampata: il numero lo calcola il
    // layout di stampa dalla geometria della carta e dal corpo del testo, quindi
    // cambia se cambia il formato. Qui serve a due cose: dirlo al docente mentre
    // scrive, e far capire perché una carta generata in automatico non è stata
    // stampata (la pipeline salta quelle fuori soglia).
    function _flashLimits() {
        try {
            const PL = window.MappAIPrintLayout;
            const QP = window.MappAIQuizPrint;
            if (!PL) return null;
            const head = (QP && QP.cardHeader)
                ? QP.cardHeader({ title: _doc.title || (_srcSet && _srcSet.title) || '' }, {})
                : null;
            return PL.charLimits(PL.flashGeom(), head);
        } catch (e) { return null; }
    }

    // Carte attualmente fuori soglia (indice + quale campo sfora).
    function _overCards() {
        const L = _flashLimits();
        if (!L || _kind !== 'flashcards') return [];
        try {
            const PL = window.MappAIPrintLayout;
            const items = _doc.items.map(function (it) {
                return {
                    question: DE().plainText(it.question || ''),
                    answer: DE().plainText(it.answer || '')
                };
            });
            return PL.overLimit(items, L);
        } catch (e) { return []; }
    }

    function _countOf(i) {
        const it = _doc.items[i] || {};
        return {
            q: DE().plainText(it.question || '').length,
            a: DE().plainText(it.answer || '').length
        };
    }

    // Aggiorna il contatore di UNA carta senza ri-renderizzare (il re-render
    // sposterebbe il cursore mentre si scrive).
    function _paintCount(i) {
        if (_kind !== 'flashcards') return;
        const host = _host(); if (!host) return;
        const el = host.querySelector('.de-count[data-count="' + i + '"]');
        if (!el) return;
        const L = _flashLimits(); if (!L) return;
        const c = _countOf(i);
        el.textContent = c.q + '/' + L.question + ' · ' + c.a + '/' + L.answer;
        el.className = 'de-count' + ((c.q > L.question || c.a > L.answer) ? ' over' : '');
        el.setAttribute('title', t('de_count_tip', 'Caratteri della domanda e della risposta rispetto al massimo che entra nella carta stampata'));
    }

    // Il foglio: stessa gerarchia del PDF (header card, domanda, opzioni A/B/C).
    function _quizSheet() {
        const s = _appState();
        const letters = ['A', 'B', 'C', 'D', 'E', 'F'];
        const isFlash = _kind === 'flashcards';
        const LIM = isFlash ? _flashLimits() : null;
        const items = _doc.items.map(function (it, i) {
            const opts = (it.options || []).map(function (o, oi) {
                const isCorrect = it.correctIndex === oi;
                // La risposta corretta non è segnalata SOLO dal colore: la lettera
                // porta un ✓, ha aria-checked e il titolo lo dice a parole.
                return '<div class="de-opt' + (isCorrect ? ' correct' : '') + '" data-i="' + i + '" data-oi="' + oi + '">' +
                    '<button type="button" class="de-letter" role="radio" aria-checked="' + (isCorrect ? 'true' : 'false') + '"' +
                    ' onclick="MappAIDocEditor.setCorrect(' + i + ',' + oi + ')" title="' +
                    esc(isCorrect ? t('de_is_correct', 'Risposta corretta') : t('de_mark_correct', 'Segna come risposta corretta')) + '">' +
                    (isCorrect ? '✓' : letters[oi]) + '</button>' +
                    '<div class="de-opt-txt" contenteditable="true" role="textbox" aria-label="' +
                    esc(t('de_a11y_opt', 'Opzione') + ' ' + letters[oi] + ' — ' + t('de_q_n', 'Domanda') + ' ' + (i + 1)) + '"' +
                    ' data-i="' + i + '" data-f="option:' + oi + '" data-ph="' + esc(t('de_ph_opt', 'Testo dell\'opzione…')) + '">' + esc(o) + '</div>' +
                    '<button type="button" class="de-x" onclick="MappAIDocEditor.delOption(' + i + ',' + oi + ')" title="' + esc(t('de_del_opt', 'Elimina opzione')) + '">×</button>' +
                    '</div>';
            }).join('');
            return '<div class="de-item">' +
                '<div class="de-item-h">' +
                '<span class="de-qn">' + esc(isFlash ? t('de_card_n', 'Carta') : t('de_q_n', 'Domanda')) + ' ' + (i + 1) + '</span>' +
                // Contatore caratteri: quanto testo entra nella carta stampata.
                (LIM ? (function () {
                    const q = DE().plainText(it.question || '').length;
                    const a = DE().plainText(it.answer || '').length;
                    const over = (q > LIM.question || a > LIM.answer);
                    return '<span class="de-count' + (over ? ' over' : '') + '" data-count="' + i + '" title="' +
                        esc(t('de_count_tip', 'Caratteri della domanda e della risposta rispetto al massimo che entra nella carta stampata')) + '">' +
                        q + '/' + LIM.question + ' · ' + a + '/' + LIM.answer + '</span>';
                })() : '') +
                '<span class="de-item-tools">' +
                '<button type="button" class="de-t" onclick="MappAIDocEditor.moveQ(' + i + ',-1)" title="' + esc(t('de_up', 'Sposta su')) + '"><i data-lucide="chevron-up" class="w-3.5 h-3.5"></i></button>' +
                '<button type="button" class="de-t" onclick="MappAIDocEditor.moveQ(' + i + ',1)" title="' + esc(t('de_down', 'Sposta giù')) + '"><i data-lucide="chevron-down" class="w-3.5 h-3.5"></i></button>' +
                '<button type="button" class="de-t" onclick="MappAIDocEditor.addQuestion(' + i + ')" title="' + esc(t('de_add_after', 'Aggiungi qui sotto')) + '"><i data-lucide="plus" class="w-3.5 h-3.5"></i></button>' +
                '<button type="button" class="de-t de-del" onclick="MappAIDocEditor.delQuestion(' + i + ')" title="' + esc(t('de_del', 'Elimina')) + '"><i data-lucide="trash-2" class="w-3.5 h-3.5"></i></button>' +
                '</span></div>' +
                '<div class="de-q" contenteditable="true" role="textbox" aria-label="' +
                esc((isFlash ? t('de_card_n', 'Carta') : t('de_q_n', 'Domanda')) + ' ' + (i + 1)) + '"' +
                ' data-i="' + i + '" data-f="question" data-ph="' + esc(t('de_ph_q', 'Scrivi qui la domanda…')) + '">' + esc(it.question) + '</div>' +
                (isFlash
                    ? '<div class="de-answer"><span class="de-lbl">' + esc(t('de_back_side', 'Retro')) + '</span>' +
                    '<div class="de-a" contenteditable="true" role="textbox" aria-label="' + esc(t('de_back_side', 'Retro') + ' — ' + t('de_card_n', 'Carta') + ' ' + (i + 1)) + '"' +
                    ' data-i="' + i + '" data-f="answer" data-ph="' + esc(t('de_ph_a', 'Risposta sul retro…')) + '">' + esc(it.answer) + '</div></div>'
                    : '<div class="de-opts">' + opts +
                    '<button type="button" class="de-addopt" onclick="MappAIDocEditor.addOption(' + i + ')">+ ' + esc(t('de_add_opt', 'opzione')) + '</button></div>') +
                '<div class="de-expl-row"><span class="de-lbl">' + esc(t('de_expl', 'Spiegazione')) + '</span>' +
                '<div class="de-expl" contenteditable="true" role="textbox" aria-label="' + esc(t('de_expl', 'Spiegazione') + ' — ' + (i + 1)) + '"' +
                ' data-i="' + i + '" data-f="explanation" data-ph="' + esc(t('de_ph_e', 'Perché la risposta è questa (compare solo nelle soluzioni)…')) + '">' + esc(it.explanation) + '</div></div>' +
                '</div>';
        }).join('');

        return '<div class="de-sheet' + (isFlash ? ' flash' : '') + '">' +
            '<div class="de-sheet-head">' +
            '<div class="de-sheet-title" contenteditable="true" data-f="title" data-ph="' + esc(t('de_ph_title', 'Titolo del documento')) + '">' + esc(_doc.title) + '</div>' +
            '<div class="de-sheet-sub">' + esc((s && s.rootNodeLabel) || '') + ' · ' + esc(isFlash ? t('de_flash', 'Flashcard') : t('de_quiz', 'Quiz')) + '</div>' +
            '<div class="de-badge">' + _doc.items.length + ' ' + esc(isFlash ? t('de_cards', 'carte') : t('de_questions', 'domande')) + '</div>' +
            '</div>' +
            // La regola, scritta: quanto testo entra in una carta e cosa succede
            // a quelle troppo lunghe generate in automatico.
            (LIM ? '<div class="de-limit' + (_overCards().length ? ' warn' : '') + '">' +
                esc(t('de_limit_note', 'Massimo {q} caratteri per la domanda e {a} per la risposta: è quanto entra nella carta stampata. Le carte più lunghe generate in automatico non vengono stampate — accorciale qui.')
                    .replace('{q}', LIM.question).replace('{a}', LIM.answer)) +
                (_overCards().length
                    ? ' <b>' + esc(t('de_limit_over', 'Fuori soglia adesso: {n}.').replace('{n}', _overCards().map(function (o) { return '#' + (o.i + 1); }).join(', '))) + '</b>'
                    : '') +
                '</div>' : '') +
            '<div class="de-sec-title">' + esc(isFlash ? t('de_cards_c', 'Carte') : t('de_questions_c', 'Domande')) + '</div>' +
            items +
            '<button type="button" class="de-add" onclick="MappAIDocEditor.addQuestion()"><i data-lucide="plus" class="w-4 h-4"></i> ' +
            esc(isFlash ? t('de_add_card', 'Aggiungi una carta') : t('de_add_q', 'Aggiungi una domanda')) + '</button>' +
            '</div>';
    }

    // Foglio sintesi: stessi tag di blocco del documento stampato (h3/h4/p/li)
    // → il lettore audio continua a trovarli.
    function _synthSheet() {
        const TAGS = { h3: t('de_tag_h3', 'Titolo'), h4: t('de_tag_h4', 'Sottotitolo'), p: t('de_tag_p', 'Testo'), li: t('de_tag_li', 'Elenco'), blockquote: t('de_tag_q', 'Nota') };
        const blocks = _syn.blocks.map(function (b, i) {
            // Blocco generato (citazioni numerate, catena dei perché): resta com'è,
            // in posizione. Non si edita — il suo contenuto viene dalla fonte.
            if (b.tag === 'raw') {
                return '<div class="de-block de-b-raw">' +
                    '<span class="de-b-tag">' + esc(t('de_tag_raw', 'Generato')) + '</span>' +
                    '<div class="de-b-locked">' + b.html + '</div>' +
                    '</div>';
            }
            return '<div class="de-block de-b-' + b.tag + '">' +
                '<span class="de-b-tag">' + esc(TAGS[b.tag] || b.tag) + '</span>' +
                '<div class="de-b-txt" contenteditable="true" role="textbox" aria-label="' + esc((TAGS[b.tag] || b.tag) + ' ' + (i + 1)) + '"' +
                ' data-b="' + i + '" data-ph="' + esc(t('de_ph_b', 'Scrivi…')) + '">' + b.html + '</div>' +
                '<span class="de-b-tools">' +
                '<button type="button" class="de-t" onclick="MappAIDocEditor.moveBlock(' + i + ',-1)" title="' + esc(t('de_up', 'Sposta su')) + '"><i data-lucide="chevron-up" class="w-3.5 h-3.5"></i></button>' +
                '<button type="button" class="de-t" onclick="MappAIDocEditor.moveBlock(' + i + ',1)" title="' + esc(t('de_down', 'Sposta giù')) + '"><i data-lucide="chevron-down" class="w-3.5 h-3.5"></i></button>' +
                '<button type="button" class="de-t" onclick="MappAIDocEditor.addBlock(' + i + ',\'p\')" title="' + esc(t('de_add_p', 'Aggiungi un paragrafo qui sotto')) + '"><i data-lucide="plus" class="w-3.5 h-3.5"></i></button>' +
                '<button type="button" class="de-t de-del" onclick="MappAIDocEditor.delBlock(' + i + ')" title="' + esc(t('de_del', 'Elimina')) + '"><i data-lucide="trash-2" class="w-3.5 h-3.5"></i></button>' +
                '</span></div>';
        }).join('');
        const stale = DE().audioStale(_syn.base, _syn.blocks);
        return '<div class="de-sheet synth">' +
            '<div class="de-sheet-head">' +
            '<div class="de-sheet-title">' + esc(_syn.data.branchLabel || t('de_synth', 'Sintesi')) + '</div>' +
            '<div class="de-sheet-sub">' + esc(_syn.data.mapName || '') + ' · ' + esc(t('de_synth', 'Sintesi')) + '</div>' +
            '</div>' +
            (stale ? '<div class="de-warn">' + esc(t('de_audio_stale', 'Il testo è cambiato: se avevi generato la voce naturale, va rigenerata (la lettura seguirebbe il testo vecchio).')) + '</div>' : '') +
            '<div class="de-blocks">' + blocks + '</div>' +
            '<button type="button" class="de-add" onclick="MappAIDocEditor.addBlock(' + (_syn.blocks.length - 1) + ',\'p\')"><i data-lucide="plus" class="w-4 h-4"></i> ' + esc(t('de_add_block', 'Aggiungi un paragrafo')) + '</button>' +
            '<div class="de-note">' + esc(t('de_synth_note', 'Citazioni numerate e fonti restano quelle generate: non si modificano da qui.')) + '</div>' +
            '</div>';
    }

    // ── binding ─────────────────────────────────────────────────────────────
    function _bind(host) {
        // Il picker colore è DENTRO l'HTML rigenerato: va riagganciato a ogni render.
        const col = host.querySelector('#de-color');
        if (col) col.addEventListener('change', function () { applyColor(col.value); });

        // Gli altri listener stanno sull'HOST, che `host.innerHTML = …` NON distrugge:
        // senza questa guardia ogni render ne aggiungerebbe una copia (un incolla
        // inserirebbe il testo N volte, Ctrl+Z annullerebbe N operazioni, e la
        // cronologia si riempirebbe di snapshot identici). Il flag muore col nodo:
        // ELABORA ricrea #elab-doc-host a ogni suo render.
        if (host._deBound) return;
        host._deBound = true;

        // testo: si scrive nel modello mentre si digita, senza ri-renderizzare
        // (un re-render sposterebbe il cursore).
        host.addEventListener('input', function (e) {
            const el = e.target;
            if (!el || !el.hasAttribute) return;
            if (el.hasAttribute('data-b')) { _commitBlock(parseInt(el.getAttribute('data-b'), 10), el.innerHTML); return; }
            const f = el.getAttribute('data-f');
            if (!f) return;
            if (f === 'title') { _doc.title = el.innerText.replace(/\s+/g, ' ').trim(); _dirty = true; _paintDirty(); return; }
            const i = parseInt(el.getAttribute('data-i'), 10);
            if (isNaN(i)) return;
            _commitField(i, f, el.innerText.replace(/\n+/g, ' '));
            // il contatore caratteri segue la digitazione (senza re-render)
            if (f === 'question' || f === 'answer') _paintCount(i);
        });

        // primo tasto su un campo = punto di ripristino per l'annulla
        host.addEventListener('focusin', function (e) {
            const el = e.target;
            if (el && el.hasAttribute && (el.hasAttribute('data-f') || el.hasAttribute('data-b'))) {
                _snapshot(t('de_op_text', 'modifica testo'));
            }
        });

        // incolla SEMPRE come testo semplice: dal web arriverebbe markup che il
        // foglio non sa rendere (e che il sanitizer butterebbe comunque).
        host.addEventListener('paste', function (e) {
            const el = e.target;
            if (!el || !el.hasAttribute || !(el.hasAttribute('data-f') || el.hasAttribute('data-b'))) return;
            e.preventDefault();
            const txt = (e.clipboardData || window.clipboardData).getData('text/plain');
            document.execCommand('insertText', false, txt);
        });

        // Ctrl+Z dentro l'editor = annulla del DOCUMENTO. Senza questa cattura
        // finirebbe all'undo globale del grafo (che qui non c'entra nulla).
        host.addEventListener('keydown', function (e) {
            if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z')) {
                e.preventDefault(); e.stopPropagation();
                undo();
            }
        }, true);

        // Invio: nei campi a riga singola non deve creare righe nel foglio; dentro
        // un blocco di sintesi inserisce un <br> (a capo VERO, che sopravvive alla
        // sanitizzazione) invece del <div> del browser, che verrebbe scartato
        // incollando le due righe in una parola sola.
        host.addEventListener('keydown', function (e) {
            const el = e.target;
            if (e.key !== 'Enter' || e.shiftKey || !el || !el.hasAttribute) return;
            if (el.hasAttribute('data-b')) {
                e.preventDefault();
                // insertLineBreak piazza anche il cursore DOPO l'a capo (con un
                // insertHTML('<br>') secco il testo successivo finirebbe prima).
                let ok = false;
                try { ok = document.execCommand('insertLineBreak'); } catch (err) { ok = false; }
                if (!ok) { try { document.execCommand('insertHTML', false, '<br>&#8203;'); } catch (err) { } }
                _commitBlock(parseInt(el.getAttribute('data-b'), 10), el.innerHTML);
                return;
            }
            const f = el.getAttribute('data-f');
            if (f && f !== 'explanation') { e.preventDefault(); el.blur(); }
        });

        host.addEventListener('click', function (e) {
            const b = e.target.closest ? e.target.closest('.de-slot') : null;
            if (b) applyColor(b.getAttribute('data-c'));
        });
    }

    // ── stili ───────────────────────────────────────────────────────────────
    function _injectStyles() {
        if (_stylesInjected) return;
        _stylesInjected = true;
        const css = `
#elab-doc-host { height:100%; overflow:auto; background:#f8fafc; }
.de-list { max-width:900px; margin:0 auto; padding:26px 22px 60px; }
.de-list-head { margin-bottom:22px; }
.de-list-h { font-size:17px; font-weight:900; color:#0f172a; }
.de-list-p { font-size:12px; line-height:1.65; color:#64748b; margin-top:6px; max-width:680px; }
.de-group { background:#fff; border:1px solid #e2e8f0; border-radius:14px; margin-bottom:14px; overflow:hidden; }
.de-group-h { display:flex; align-items:center; gap:8px; font-size:12px; font-weight:800; color:#475569; padding:11px 16px; background:#f8fafc; border-bottom:1px solid #eef2f6; }
.de-row { display:flex; align-items:center; gap:10px; width:100%; padding:11px 16px; background:#fff; border:0; border-top:1px solid #f1f5f9; cursor:pointer; text-align:left; font:inherit; }
.de-row:first-of-type { border-top:0; }
.de-row:hover { background:#eef2ff; }
.de-row-t { font-size:13px; font-weight:700; color:#1e293b; flex:1 1 auto; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.de-row-b { font-size:10px; font-weight:800; color:#4f46e5; background:#ede9fe; border-radius:999px; padding:2px 9px; flex:0 0 auto; }
.de-row-m { font-size:11px; color:#94a3b8; flex:0 0 auto; }
.de-empty-row { padding:14px 16px; font-size:12px; color:#94a3b8; font-style:italic; }

.de-doc { display:flex; flex-direction:column; height:100%; }
.de-bar { display:flex; align-items:center; gap:8px; padding:8px 14px; background:#fff; border-bottom:1px solid #e2e8f0; flex:0 0 auto; flex-wrap:wrap; }
.de-bar-t { font-size:13px; font-weight:800; color:#1e293b; }
.de-dirty { color:#f59e0b; font-size:20px; line-height:0; margin-left:4px; visibility:hidden; }
.de-spacer { flex:1 1 auto; }
.de-btn { display:inline-flex; align-items:center; gap:6px; border:1px solid #e2e8f0; background:#f8fafc; color:#475569; border-radius:9px; padding:6px 11px; font:700 11px 'Space Mono',var(--emoji-font),monospace; cursor:pointer; }
.de-btn:hover { background:#eef2ff; color:#4f46e5; }
.de-btn.de-primary { background:#4f46e5; border-color:#4f46e5; color:#fff; }
.de-btn.de-primary:hover { background:#4338ca; color:#fff; }
.de-btn.de-ghost { background:#fff; }
.de-style { display:inline-flex; align-items:center; gap:4px; padding:3px 8px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:9px; }
.de-sbtn { width:26px; height:26px; display:inline-flex; align-items:center; justify-content:center; border:0; background:transparent; color:#475569; border-radius:6px; cursor:pointer; font:700 13px 'Space Mono',monospace; }
.de-sbtn:hover { background:#e0e7ff; color:#4f46e5; }
.de-sep { width:1px; height:18px; background:#e2e8f0; margin:0 3px; }
.de-color { width:26px; height:26px; padding:0; border:1px solid #e2e8f0; border-radius:6px; background:none; cursor:pointer; }
.de-slots { display:inline-flex; gap:3px; }
.de-slot { width:16px; height:16px; border-radius:4px; border:1px solid rgba(15,23,42,.18); cursor:pointer; padding:0; }
.de-slot:hover { transform:scale(1.15); }

.de-sheet-wrap { flex:1 1 auto; overflow:auto; padding:24px 16px 80px; }
/* Il foglio: stesse misure del PDF (A4 a 800px, Space Mono, header card). */
.de-sheet { max-width:800px; margin:0 auto; font-family:'Space Mono',var(--emoji-font),monospace; color:#1e293b; }
.de-sheet-head { text-align:center; padding:26px 16px 18px; background:#fff; border-radius:16px; margin-bottom:24px; border-bottom:2px solid #4f46e5; }
.de-sheet.flash .de-sheet-head { border-bottom-color:#059669; }
.de-sheet-title { font-size:20px; font-weight:900; color:#1e293b; outline:none; }
.de-sheet-sub { font-size:10px; color:#64748b; margin-top:4px; }
.de-badge { display:inline-block; margin-top:8px; background:#ede9fe; color:#4f46e5; border-radius:999px; padding:2px 12px; font-size:10px; font-weight:bold; }
.de-sheet.flash .de-badge { background:#dcfce7; color:#059669; }
.de-sec-title { font-size:15px; font-weight:900; color:#4f46e5; margin:20px 0 14px; padding-bottom:5px; border-bottom:2px solid #e2e8f0; }
.de-sheet.flash .de-sec-title { color:#059669; }
.de-item { background:#fff; border-radius:12px; padding:16px 20px; margin-bottom:16px; border-left:4px solid #4f46e5; }
.de-sheet.flash .de-item { border-left-color:#059669; }
.de-item-h { display:flex; align-items:center; gap:8px; margin-bottom:8px; }
.de-qn { font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:.06em; color:#4f46e5; }
/* Contatore caratteri della carta: nero finché il testo entra, ambra quando no. */
.de-count { font-size:10px; font-weight:700; color:#64748b; background:#f1f5f9;
            border-radius:999px; padding:1px 8px; white-space:nowrap; }
.de-count.over { color:#7c2d12; background:#ffedd5; }
/* La regola scritta, in cima al foglio. */
.de-limit { font-size:11px; line-height:1.5; color:#475569; background:#f8fafc;
            border-left:3px solid #94a3b8; border-radius:8px; padding:8px 12px; margin-bottom:14px; }
.de-limit.warn { color:#7c2d12; background:#fff7ed; border-left-color:#f97316; }
.de-sheet.flash .de-qn { color:#059669; }
/* Strumenti di riga: attenuati ma SEMPRE presenti (a opacity:0 sparivano per chi
   naviga da tastiera) e pieni su hover o quando il fuoco entra nella riga. */
.de-item-tools { margin-left:auto; display:inline-flex; gap:2px; opacity:.45; transition:opacity .12s; }
.de-item:hover .de-item-tools, .de-block:hover .de-b-tools,
.de-item:focus-within .de-item-tools, .de-block:focus-within .de-b-tools { opacity:1; }
.de-t:focus-visible, .de-x:focus-visible, .de-letter:focus-visible, .de-slot:focus-visible,
.de-sbtn:focus-visible, .de-addopt:focus-visible, .de-add:focus-visible { outline:2px solid #4f46e5; outline-offset:2px; }
.de-t { width:24px; height:24px; display:inline-flex; align-items:center; justify-content:center; border:1px solid #e2e8f0; background:#fff; color:#64748b; border-radius:6px; cursor:pointer; padding:0; }
.de-t:hover { background:#eef2ff; color:#4f46e5; }
.de-t.de-del:hover { background:#fee2e2; color:#dc2626; border-color:#fecaca; }
.de-q { font-size:15px; font-weight:bold; color:#1e293b; line-height:1.55; margin-bottom:12px; outline:none; border-radius:6px; padding:2px 4px; }
.de-opts { display:flex; flex-direction:column; gap:8px; }
.de-opt { display:flex; align-items:flex-start; gap:10px; padding:8px 10px; border-radius:8px; background:#f8fafc; border:1px solid #e2e8f0; }
.de-opt.correct { background:#f0fdf4; border-color:#86efac; }
.de-letter { flex-shrink:0; width:24px; height:24px; border-radius:50%; background:#e2e8f0; color:#475569; font:bold 12px 'Space Mono',monospace; display:flex; align-items:center; justify-content:center; border:0; cursor:pointer; }
.de-opt.correct .de-letter { background:#059669; color:#fff; }
.de-opt-txt { font-size:13px; color:#1e293b; line-height:1.5; flex:1 1 auto; outline:none; padding:2px 4px; border-radius:5px; }
.de-x { border:0; background:transparent; color:#64748b; font-size:15px; cursor:pointer; padding:0 4px; line-height:1; }
.de-x:hover { color:#dc2626; }
.de-addopt { align-self:flex-start; margin-top:2px; border:1px dashed #cbd5e1; background:#fff; color:#64748b; border-radius:8px; padding:5px 12px; font:700 11px 'Space Mono',monospace; cursor:pointer; }
.de-addopt:hover { border-color:#4f46e5; color:#4f46e5; }
.de-answer, .de-expl-row { margin-top:12px; }
.de-lbl { display:block; font-size:9px; font-weight:700; text-transform:uppercase; letter-spacing:.06em; color:#64748b; margin-bottom:4px; }
.de-a { font-size:13px; color:#065f46; background:#f0fdf4; border-radius:8px; padding:8px 12px; outline:none; line-height:1.5; }
.de-expl { font-size:11px; color:#475569; font-style:italic; line-height:1.5; background:#f8fafc; border-radius:8px; padding:7px 11px; outline:none; }
[contenteditable]:hover { box-shadow:inset 0 0 0 1px #e2e8f0; }
[contenteditable]:focus { box-shadow:inset 0 0 0 2px #a5b4fc; background:#fff; }
[contenteditable]:empty:before { content:attr(data-ph); color:#64748b; font-style:italic; }
.de-add { display:flex; align-items:center; justify-content:center; gap:8px; width:100%; margin-top:6px; padding:12px; border:2px dashed #cbd5e1; background:#fff; color:#64748b; border-radius:12px; font:700 12px 'Space Mono',monospace; cursor:pointer; }
.de-add:hover { border-color:#4f46e5; color:#4f46e5; background:#eef2ff; }

/* Sintesi: le dimensioni del testo dipendono dal tipo di blocco, non dall'utente. */
.de-sheet.synth .de-blocks { background:#fff; border-radius:16px; padding:20px 24px; }
.de-block { position:relative; display:flex; align-items:flex-start; gap:10px; padding:3px 0; }
.de-b-tag { flex:0 0 66px; font-size:9px; font-weight:700; text-transform:uppercase; letter-spacing:.05em; color:#64748b; padding-top:6px; }
.de-b-txt { flex:1 1 auto; outline:none; padding:3px 6px; border-radius:6px; min-height:1.2em; }
.de-b-h3 .de-b-txt { font-size:14px; font-weight:900; color:#4f46e5; margin:12px 0 4px; }
.de-b-h4 .de-b-txt { font-size:12px; font-weight:700; color:#1e293b; margin:8px 0 2px; }
.de-b-p .de-b-txt { font-size:11px; line-height:1.7; color:#334155; }
.de-b-li .de-b-txt { font-size:11px; line-height:1.7; color:#334155; margin-left:18px; list-style:disc; }
.de-b-li .de-b-txt:before { content:'•'; color:#94a3b8; margin-right:7px; }
.de-b-blockquote .de-b-txt { font-size:11px; line-height:1.7; color:#475569; border-left:3px solid #e2e8f0; padding-left:10px; font-style:italic; }
.de-b-txt sup { color:#4f46e5; font-weight:bold; }
/* blocchi generati (citazioni, catena dei perché): visibili, non editabili */
.de-b-locked { flex:1 1 auto; font-size:10px; line-height:1.6; color:#64748b; background:#f8fafc; border:1px dashed #e2e8f0; border-radius:8px; padding:8px 10px; max-height:140px; overflow:auto; }
.de-b-locked * { font-size:10px !important; color:#64748b !important; }
.de-b-tools { position:absolute; right:-2px; top:0; display:inline-flex; gap:2px; opacity:0; background:#fff; border-radius:7px; padding:1px; transition:opacity .12s; }
.de-warn { background:#fffbeb; border:1px solid #fde68a; color:#92400e; border-radius:10px; padding:9px 13px; font-size:11px; line-height:1.5; margin-bottom:14px; }
.de-note { font-size:10px; color:#64748b; font-style:italic; margin-top:14px; text-align:center; }

.de-radio { display:flex; align-items:flex-start; gap:10px; padding:10px 12px; border:1px solid #e2e8f0; border-radius:10px; background:#fff; margin-bottom:8px; cursor:pointer; }
.de-radio:hover { border-color:#a5b4fc; background:#f8fafc; }
.de-radio b { display:block; font-size:12px; color:#1e293b; }
.de-radio small { display:block; font-size:11px; color:#64748b; margin-top:2px; }
.de-modal-lbl { font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:.06em; color:#94a3b8; margin:4px 0 8px; }
.de-fmt-row { display:flex; gap:8px; margin-bottom:12px; }
.de-fmt { flex:1 1 0; text-align:center; border:1px solid #e2e8f0; border-radius:10px; padding:10px 6px; cursor:pointer; font-size:13px; font-weight:800; color:#1e293b; }
.de-fmt small { display:block; font-size:10px; font-weight:400; color:#94a3b8; margin-top:3px; }
.de-fmt input { display:none; }
.de-fmt:has(input:checked) { border-color:#4f46e5; background:#eef2ff; color:#4f46e5; }
`;
        const st = document.createElement('style');
        st.id = 'de-styles';
        st.textContent = css;
        document.head.appendChild(st);
    }

    // ── superficie pubblica ─────────────────────────────────────────────────
    window.MappAIDocEditor = {
        render: render,
        reset: function () { _view = 'list'; _doc = null; _syn = null; _kind = null; _dirty = false; },
        hasUnsaved: function () { return _dirty; },
        openSet: openSet, openSynthesis: openSynthesis, backToList: backToList,
        addQuestion: addQuestion, delQuestion: delQuestion, moveQ: moveQ,
        addOption: addOption, delOption: delOption, setCorrect: setCorrect,
        addBlock: addBlock, delBlock: delBlock, moveBlock: moveBlock,
        fmt: fmt, applyColor: applyColor, eyedropper: eyedropper,
        undo: undo, save: save, print: print, exportHtml: exportHtml, saveToVault: saveToVault,
        openAnswersModal: openAnswersModal, openFlashModal: openFlashModal
    };

    console.log('[MappAI] mappai-doc-editor.js caricato ✓');
})();
