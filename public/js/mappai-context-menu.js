// ==========================================
// LIGHTBOX + MENU CONTESTUALE E TOUCH — estratto da app.js
// ==========================================
// Caricato DOPO app.js: appState e gli helper (window.* e bare) si risolvono
// a runtime via scope lessicale globale condiviso.
window.openLightbox = function (src) {
    document.getElementById('lightbox-img').src = src;
    document.getElementById('image-lightbox').classList.add('visible');
}

window.closeLightbox = function () {
    document.getElementById('image-lightbox').classList.remove('visible');
}

// ==========================================
// MENU CONTESTUALE (Context Menu) E TOUCH
// ==========================================
let ctxTarget = null;
let longPressTimer = null;
let touchStartPos = null;

function handleTouchStart(e, type, data) {
    if (e.touches && e.touches.length > 1) return; // ignore multi-touch
    const touch = e.touches ? e.touches[0] : e;
    touchStartPos = { x: touch.clientX, y: touch.clientY };

    if (longPressTimer) clearTimeout(longPressTimer);
    longPressTimer = setTimeout(() => {
        let syntheticEvent = e;
        if (e.touches && e.touches[0]) {
            syntheticEvent = {
                preventDefault: () => { if (e.preventDefault) e.preventDefault(); },
                stopPropagation: () => { if (e.stopPropagation) e.stopPropagation(); },
                clientX: e.touches[0].clientX,
                clientY: e.touches[0].clientY
            };
        }
        window.showContextMenu(syntheticEvent, type, data);
        longPressTimer = null;
    }, 500); // reduced to 500ms for more responsive feel
}

function handleTouchMove(e) {
    if (!longPressTimer || !touchStartPos) return;
    const touch = e.touches ? e.touches[0] : e;
    const dx = touch.clientX - touchStartPos.x;
    const dy = touch.clientY - touchStartPos.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > 15) { // 15px threshold
        clearTimeout(longPressTimer);
        longPressTimer = null;
    }
}

function handleTouchEnd(e) {
    if (longPressTimer) {
        clearTimeout(longPressTimer);
        longPressTimer = null;
    }
}

window.showContextMenu = function (e, type, data) {
    e.preventDefault(); e.stopPropagation();
    const menu = document.getElementById('context-menu');
    menu.innerHTML = ''; ctxTarget = { type, data };

    if (type === 'node') {
        const expandAiHtml = !appState.studentMode ? `
            <div class="ctx-item" onclick="window.ctxAction('expand_ai')"><i data-lucide="sparkles" class="text-emerald-500"></i> ${window.t('ctx_expand_source', "Espandi da Fonte")}</div>
        ` : '';

        const spacedRepetitionHtml = !appState.studentMode ? `
            <div class="px-3 py-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-widest bg-slate-50 border-y border-slate-200 mt-1">Spaced Repetition</div>
            <div class="ctx-item text-indigo-600" onclick="window.ctxAction('generate_flashcard')"><i data-lucide="brain-circuit"></i> ${window.t('ctx_flashcard_nodo', "Flashcard Nodo")}</div>
            <div class="ctx-item text-indigo-600" onclick="window.ctxAction('generate_flashcard_branch')"><i data-lucide="network"></i> ${window.t('ctx_flashcard_ramo', "Flashcard Ramo")}</div>
            <div class="ctx-item text-purple-600" onclick="window.ctxAction('test_flashcard')"><i data-lucide="graduation-cap"></i> ${window.t('ctx_quiz_nodo', "Quiz Nodo")}</div>
            <div class="ctx-item text-purple-600" onclick="window.ctxAction('test_flashcard_branch')"><i data-lucide="layers"></i> ${window.t('ctx_quiz_ramo', "Quiz Ramo")}</div>
            <hr class="my-1 border-slate-200">
        ` : '';

        // JIGSAW: su un nodo di ramo altrui (bloccato) nascondi le voci di scrittura.
        // Sul PROPRIO ramo il nodo è editabile → resta tutto, incluso "Crea Figlio".
        const jLocked = !!(window.MappAIJigsaw && window.MappAIJigsaw.isEnabled() && !window.MappAIJigsaw.canEdit(data));
        const editorHtml = !jLocked ? `
                    <div class="px-3 py-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-widest bg-slate-50 border-y border-slate-200 mt-1">${window.t('ctx_map_editor', "Editor Mappa")}</div>
                    ${expandAiHtml}
                    <div class="ctx-item" onclick="window.ctxAction('edit')"><i data-lucide="edit-3"></i> ${window.t('ctx_edit_content', "Edit Contenuto")}</div>
                    <div class="ctx-item" onclick="window.ctxAction('rename')"><i data-lucide="type"></i> ${window.t('ctx_rename', "Rinomina")}</div>
                    <div class="ctx-item" onclick="window.ctxAction('add_child')"><i data-lucide="plus-circle"></i> ${window.t('ctx_add_child', "Crea Figlio")}</div>
                    <div class="ctx-item" onclick="window.ctxAction('link')"><i data-lucide="link"></i> ${window.t('ctx_add_link', "Crea Link")}</div>
                    <div class="ctx-item text-amber-600" onclick="window.ctxAction('merge')"><i data-lucide="git-merge"></i> ${window.t('ctx_merge', "Fondi con...")}</div>
                    ${appState.extractionMode !== 'kg' ? `<div class="ctx-item text-sky-600" onclick="window.ctxAction('relink')"><i data-lucide="unlink"></i> ${window.t('ctx_relink', "Cambia Link")}</div>` : ''}
                    <hr class="my-1 border-slate-200">
                ` : '';
        const deleteHtml = !jLocked ? `<div class="ctx-item danger" onclick="window.ctxAction('delete_node')"><i data-lucide="trash-2"></i> ${window.t('ctx_delete_node', "Elimina Nodo")}</div>` : '';

        menu.innerHTML = `
                    <div class="ctx-item" onclick="window.ctxAction('tts')"><i data-lucide="volume-2" class="text-sky-500"></i> ${window.t('ctx_tts', "Leggi ad alta voce")}</div>
                    <div class="px-3 py-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-widest bg-slate-50 border-y border-slate-200">${window.t('ctx_study_status', "Stato di Studio")}</div>
                    <div class="ctx-item" onclick="window.ctxAction('status_todo')"><i data-lucide="circle-dashed" class="text-red-500"></i> ${window.t('ctx_status_todo', "Da studiare")}</div>
                    <div class="ctx-item" onclick="window.ctxAction('status_review')"><i data-lucide="refresh-cw" class="text-amber-500"></i> ${window.t('ctx_status_review', "Ripasso necessario")}</div>
                    <div class="ctx-item" onclick="window.ctxAction('status_done')"><i data-lucide="check-circle-2" class="text-emerald-500"></i> ${window.t('ctx_status_done', "Imparato!")}</div>
                    <div class="ctx-item" onclick="window.ctxAction('status_none')"><i data-lucide="circle" class="text-slate-300"></i> ${window.t('ctx_status_none', "Azzera Semaforo")}</div>
                    ${editorHtml}
                    ${spacedRepetitionHtml}
                    ${deleteHtml}
                `;
    } else if (type === 'link') {
        // JIGSAW: ponte inter-area + docente (modalità OFF) → menu di ratifica.
        if (data.isBridge && window.MappAIJigsaw && !window.MappAIJigsaw.isEnabled()) {
            menu.innerHTML =
                '<div class="px-3 py-2" style="max-width:270px;"><div style="font-weight:700;color:#6366f1;font-size:12px;">Ponte inter-area</div>' +
                '<div style="color:#64748b;font-size:11px;margin-top:2px;">Autore: ' + (data.bridgeAuthor || '?') + ' · stato: ' + (data.bridgeStatus || 'proposed') + '</div>' +
                (data.justification ? '<div style="color:#475569;font-size:12px;margin-top:4px;font-style:italic;">"' + String(data.justification).replace(/[<>]/g, '') + '"</div>' : '') + '</div>' +
                '<hr class="my-1 border-slate-200">' +
                '<div class="ctx-item text-emerald-600" onclick="window.ctxAction(\'ratify_bridge\')"><i data-lucide="check-circle"></i> ' + window.t('ctx_ratify_bridge', 'Ratifica ponte') + '</div>' +
                '<div class="ctx-item danger" onclick="window.ctxAction(\'reject_bridge\')"><i data-lucide="x-circle"></i> ' + window.t('ctx_reject_bridge', 'Rifiuta ponte') + '</div>' +
                '<hr class="my-1 border-slate-200">' +
                '<div class="ctx-item" onclick="window.ctxAction(\'rename_link\')"><i data-lucide="type"></i> ' + window.t('ctx_rename_rel', 'Rinomina Relazione') + '</div>' +
                '<div class="ctx-item danger" onclick="window.ctxAction(\'delete_link\')"><i data-lucide="trash-2"></i> ' + window.t('ctx_delete_bridge', 'Elimina Ponte') + '</div>';
            window.safeCreateIcons();
            menu.classList.remove('hidden');
            let bx = e.clientX, by = e.clientY;
            if (bx + 224 > window.innerWidth) bx -= 224;
            if (by + menu.offsetHeight > window.innerHeight) by = window.innerHeight - menu.offsetHeight - 10;
            menu.style.left = `${bx}px`; menu.style.top = `${Math.max(10, by)}px`;
            return;
        }
        // JIGSAW: link tra rami bloccati → nessuna azione di scrittura, solo hint.
        const linkEditable = !(window.MappAIJigsaw && window.MappAIJigsaw.isEnabled()) ||
            (window.MappAIJigsaw.canEditLink ? window.MappAIJigsaw.canEditLink(data) : true);
        if (!linkEditable) {
            menu.innerHTML = `<div class="px-3 py-2 text-xs text-slate-400 flex items-center gap-2"><i data-lucide="lock" class="w-3.5 h-3.5"></i> ${window.t('ctx_link_locked', "Link bloccato (solo studio)")}</div>`;
        } else if (data.aiSuggested) {
            menu.innerHTML = `
                        <div class="px-3 py-1.5 text-[10px] font-bold text-amber-500 uppercase tracking-widest bg-amber-50 border-b border-amber-200">${window.t('ctx_ai_link', "\ud83e\udd16 Link AI Suggerito")}</div>
                        <div class="ctx-item text-emerald-600" onclick="window.ctxAction('validate_ai_link')"><i data-lucide="check-circle"></i> ${window.t('ctx_validate_corr', "Valida Correlazione")}</div>
                        <hr class="my-1 border-slate-200">
                        <div class="ctx-item danger" onclick="window.ctxAction('remove_ai_link')"><i data-lucide="trash-2"></i> ${window.t('ctx_remove_ai_link', "Rimuovi Link AI")}</div>
                    `;
        } else {
            menu.innerHTML = `
                        <div class="ctx-item" onclick="window.ctxAction('rename_link')"><i data-lucide="type"></i> ${window.t('ctx_rename_rel', "Rinomina Relazione")}</div>
                        <hr class="my-1 border-slate-200">
                        <div class="ctx-item danger" onclick="window.ctxAction('delete_link')"><i data-lucide="trash-2"></i> ${window.t('ctx_delete_link', "Elimina Link")}</div>
                    `;
        }
    } else if (type === 'bg') {
        // JIGSAW: creazione di nodi isolati (fuori da ogni ramo) vietata → nascondi le voci.
        const jOn = !!(window.MappAIJigsaw && window.MappAIJigsaw.isEnabled());
        if (appState.extractionMode === 'kg') {
            menu.innerHTML = `
                ${!jOn ? `<div class="ctx-item" onclick="window.ctxAction('add_isolated_hub')"><i data-lucide="sun" class="text-amber-500"></i> ${window.t('ctx_new_hub', "Nuovo Hub")}</div>
                <div class="ctx-item" onclick="window.ctxAction('add_isolated_node')"><i data-lucide="circle"></i> ${window.t('ctx_new_node', "Nuovo Nodo")}</div>` : ''}
                <div class="ctx-item" onclick="window.resetZoom()"><i data-lucide="maximize"></i> ${window.t('ctx_center_view', "Centra Vista")}</div>
                <hr class="my-1 border-slate-200">
                <div class="ctx-item text-indigo-600 font-bold" onclick="window.salvaLayout()"><i data-lucide="pin"></i> ${window.t('ctx_pin_layout', "Fissa Layout")}</div>
            `;
        } else {
            menu.innerHTML = `
                ${!jOn ? `<div class="ctx-item" onclick="window.ctxAction('add_isolated')"><i data-lucide="plus"></i> ${window.t('ctx_new_node', "Nuovo Nodo")}</div>` : ''}
                <div class="ctx-item" onclick="window.resetZoom()"><i data-lucide="maximize"></i> ${window.t('ctx_center_view', "Centra Vista")}</div>
                <hr class="my-1 border-slate-200">
                <div class="ctx-item text-indigo-600 font-bold" onclick="window.salvaLayout()"><i data-lucide="pin"></i> ${window.t('ctx_pin_layout', "Fissa Layout")}</div>
            `;
        }
    }

    window.safeCreateIcons();
    menu.classList.remove('hidden');

    let x = e.clientX, y = e.clientY;
    const menuWidth = 224;
    const menuHeight = menu.offsetHeight;

    if (x + menuWidth > window.innerWidth) x -= menuWidth;
    if (y + menuHeight > window.innerHeight) y = window.innerHeight - menuHeight - 10;
    if (y < 10) y = 10;

    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;
}

function hideContextMenu() { document.getElementById('context-menu').classList.add('hidden'); }
document.addEventListener('click', hideContextMenu);

// Text-to-Speech: legge titolo + descrizione/contenuto del nodo (toggle stop)
window.speakNode = function (data) {
    if (!data) return;
    if (!('speechSynthesis' in window)) { showToast(window.t('tst_no_tts', "Sintesi vocale non supportata su questo dispositivo"), "error"); return; }

    const title = (cleanLabel ? cleanLabel(data.label) : data.label) || '';
    const body = (data.desc || data.content || '').toString();
    // pulizia: LaTeX + link markdown (i marker [n]/markdown residui li toglie il motore)
    const spoken = body
        .replace(/\$\$?[^$]*\$\$?/g, ' ')          // formule LaTeX
        .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')   // link markdown → testo
        .replace(/[\\{}]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    if (!title && !spoken) { showToast(window.t('tst_no_text_tts', "Nessun testo da leggere"), "info"); return; }

    // Preferita: card audio flottante con chip + barra di avanzamento (orientamento BES/DSA).
    if (window.MappAITTS && window.MappAITTS.playFloating) {
        if (window.MappAITTS.isFloatingOpen && window.MappAITTS.isFloatingOpen()) { window.MappAITTS.closeFloating(); return; } // toggle
        window.MappAITTS.playFloating({
            title: title,
            text: spoken,
            lang: (window.currentLanguage === 'en') ? 'en-US' : 'it-IT'
        });
        return;
    }

    // Fallback (motore assente): lettura semplice con toggle stop.
    const synth = window.speechSynthesis;
    if (synth.speaking || synth.pending) { synth.cancel(); return; }
    const u = new SpeechSynthesisUtterance((title + '. ' + spoken).replace(/[#*_`>~|]/g, ' ').trim());
    u.lang = (window.currentLanguage === 'en') ? 'en-US' : 'it-IT';
    u.rate = 0.95; u.pitch = 1.0;
    synth.cancel(); synth.speak(u);
};

window.ctxAction = function (action) {
    const data = ctxTarget.data;
    hideContextMenu();

    if (action === 'expand_ai') {
        window.openContextualAIExtensionModal(data);
        return;
    }
    if (action === 'tts') {
        window.speakNode(data);
        return;
    }
    if (action.startsWith('status_')) {
        const status = action.split('_')[1];
        data.studyStatus = status;
        renderGraph();
        if (currentNode && currentNode.id === data.id) window.handleNodeClick({ stopPropagation: () => { } }, currentNode);
    }
    else if (action === 'rename') {
        if (window.MappAIJigsaw && !window.MappAIJigsaw.guardWrite(data, 'rinomina')) return;
        window.showPrompt("Nuova etichetta del nodo:", cleanLabel(data.label), (newLabel) => {
            if (newLabel) { data.label = newLabel; renderGraph(); }
        });
    }
    else if (action === 'edit') {
        if (window.MappAIJigsaw && !window.MappAIJigsaw.guardWrite(data, 'modifica')) return;
        window.openEditModal(data);
    }
    else if (action === 'add_child') {
        if (window.MappAIJigsaw && !window.MappAIJigsaw.guardWrite(data, 'aggiungi figlio')) return;
        if (appState.extractionMode === 'kg') {
            // In KG mode, add_child becomes a choice or defaults to node
            window.showPrompt("Nome del nuovo nodo figlio:", "", (lbl) => {
                if (lbl) {
                    let newId = 'NODE_' + Math.random().toString(36).substr(2, 6).toUpperCase();
                    appState.db.nodes.push({ id: newId, label: lbl, content: "", desc: "", level: 2, studyStatus: 'none', chunks: [], x: data.x + 30, y: data.y + 30 });
                    appState.db.links.push({ source: data.id, target: newId, rel: "collegato_a" });
                    window.updateDegreeStats(); renderGraph();
                }
            });
        } else {
            window.showPrompt("Nome del nuovo nodo figlio:", "", (lbl) => {
                if (lbl) {
                    let newId = 'NODE_' + Math.random().toString(36).substr(2, 6).toUpperCase();
                    appState.db.nodes.push({ id: newId, label: lbl, content: "", desc: "", level: (data.level || 0) + 1, studyStatus: 'none', chunks: [], x: data.x + 30, y: data.y + 30 });
                    appState.db.links.push({ source: data.id, target: newId, rel: "collegato_a" });
                    window.updateDegreeStats(); renderGraph();
                }
            });
        }
    }
    else if (action === 'add_isolated_hub') {
        if (window.MappAIJigsaw && !window.MappAIJigsaw.guardIsolated('hub isolato')) return;
        window.showPrompt("Nome del nuovo Super-Hub:", "", (lbl) => {
            if (lbl) {
                let newId = 'HUB_' + Math.random().toString(36).substr(2, 6).toUpperCase();
                // Troviamo il prossimo gruppo libero
                const nextGroup = (Math.max(...appState.db.nodes.map(n => n.group || 0)) || 0) + 1;
                appState.db.nodes.push({ id: newId, label: lbl, content: lbl, desc: "Super-Hub manuale", level: 1, group: nextGroup, studyStatus: 'none', chunks: [] });
                window.updateDegreeStats(); renderGraph();
            }
        });
    }
    else if (action === 'add_isolated_node') {
        if (window.MappAIJigsaw && !window.MappAIJigsaw.guardIsolated('nodo isolato')) return;
        window.showPrompt("Nome del nuovo nodo isolato:", "", (lbl) => {
            if (lbl) {
                let newId = 'NODE_' + Math.random().toString(36).substr(2, 6).toUpperCase();
                appState.db.nodes.push({ id: newId, label: lbl, content: "", desc: "", level: 2, studyStatus: 'none', chunks: [] });
                window.updateDegreeStats(); renderGraph();
            }
        });
    }
    else if (action === 'link') {
        if (window.MappAIJigsaw && !window.MappAIJigsaw.guardWrite(data, 'collega')) return;
        linkingState = { active: true, sourceNode: data };
        const hint = document.getElementById('mode-hint');
        hint.innerText = "MODALITÀ COLLEGAMENTO: Clicca sul nodo di destinazione"; hint.classList.remove('hidden');
    }
    else if (action === 'generate_flashcard') {
        window.openStudyConfigModal('flashcard', data, 'node');
    }
    else if (action === 'generate_flashcard_branch') {
        window.openStudyConfigModal('flashcard', data, 'branch');
    }
    else if (action === 'test_flashcard') {
        window.openStudyConfigModal('quiz', data, 'node');
    }
    else if (action === 'test_flashcard_branch') {
        window.openStudyConfigModal('quiz', data, 'branch');
    }
    else if (action === 'delete_node') {
        if (window.MappAIJigsaw && !window.MappAIJigsaw.guardWrite(data, 'elimina')) return;
        window.showConfirm(window.t('ctx_delete_node', "Elimina Nodo"), window.t('cfm_delete_node', "Sei sicuro di voler eliminare questo nodo e tutti i link connessi?"), () => {
            if (typeof window.pushUndoSnapshot === 'function') window.pushUndoSnapshot('Elimina nodo: ' + data.label);
            appState.db.nodes = appState.db.nodes.filter(n => n.id !== data.id);
            appState.db.links = appState.db.links.filter(l => {
                let sid = typeof l.source === 'object' ? l.source.id : l.source;
                let tid = typeof l.target === 'object' ? l.target.id : l.target;
                return sid !== data.id && tid !== data.id;
            });
            if (currentNode?.id === data.id) handleBackgroundClick();
            window.updateDegreeStats(); renderGraph();
        });
    }
    else if (action === 'merge') {
        window.startMergeMode(data);
    }
    else if (action === 'relink') {
        window.startRelinkMode(data);
    }
    else if (action === 'rename_link') {
        if (window.MappAIJigsaw && !window.MappAIJigsaw.guardWriteLink(data, 'rinomina link')) return;
        window.showPrompt("Etichetta relazione (lascia vuoto per nascondere la label):", data.rel || '', (newRel) => {
            data.rel = newRel; // stringa vuota = link senza label visibile
            renderGraph();
        });
    }
    else if (action === 'delete_link') {
        if (window.MappAIJigsaw && !window.MappAIJigsaw.guardWriteLink(data, 'elimina link')) return;
        if (typeof window.pushUndoSnapshot === 'function') window.pushUndoSnapshot('Elimina link: ' + (data.rel || data.source + '→' + data.target));
        appState.db.links = appState.db.links.filter(l => l !== data);
        window.updateDegreeStats(); renderGraph();
    }
    else if (action === 'validate_ai_link') {
        if (window.MappAIJigsaw && !window.MappAIJigsaw.guardWriteLink(data, 'valida link')) return;
        window.openValidateModal(data);
    }
    else if (action === 'remove_ai_link') {
        if (window.MappAIJigsaw && !window.MappAIJigsaw.guardWriteLink(data, 'rimuovi link')) return;
        window.removeAILink(data);
    }
    else if (action === 'ratify_bridge') {
        if (window.MappAIJigsaw && window.MappAIJigsaw.setBridgeStatus(data, 'ratified')) {
            renderGraph();
            if (window.showToast) window.showToast(window.t('tst_bridge_ratified', 'Ponte ratificato — salva il vault per rendere permanente'), 'success');
        }
    }
    else if (action === 'reject_bridge') {
        if (window.MappAIJigsaw && window.MappAIJigsaw.setBridgeStatus(data, 'rejected')) {
            renderGraph();
            if (window.showToast) window.showToast(window.t('tst_bridge_rejected', 'Ponte rifiutato'), 'info');
        }
    }
    else if (action === 'add_isolated') {
        if (window.MappAIJigsaw && !window.MappAIJigsaw.guardIsolated('nodo isolato')) return;
        window.showPrompt("Nome del nuovo nodo:", "", (lbl) => {
            if (lbl) {
                let newId = 'NODE_' + Math.random().toString(36).substr(2, 6).toUpperCase();
                appState.db.nodes.push({ id: newId, label: lbl, content: "", desc: "", level: 1, studyStatus: 'none', chunks: [] });
                window.updateDegreeStats(); renderGraph();
            }
        });
    }
}
