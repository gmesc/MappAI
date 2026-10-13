// ==========================================
// SET DI STUDIO (sidebar «Studio») — estratto da app.js
// ==========================================
// Caricato DOPO app.js: appState e gli helper (window.* e bare) si risolvono
// a runtime via scope lessicale globale condiviso.
// ==========================================
// 12/10/2026 (0087, lotto 10-modali, decisione A di Giacomo): la catena dello
// spaced repetition — quiz del nodo, `#quiz-modal`, flashcard del ramo — è USCITA:
// nessuno la chiamava più (INTAKE 06/10). Restano i set di studio: elenco,
// apertura nel player, cancellazione, rigenerazione.
// ==========================================
/* Il testo dei dati entra come testo (25/9/2026): l'escape del nucleo puro
   mappai-html-sicuro.js, o uno identico se una copia non lo carica ancora (il
   reader dell'iPad copia questo file byte per byte). */
function _escSetStudio(v) {
    const H = window.MappAIHtmlSicuro;
    return H ? H.esc(v) : String(v == null ? '' : v).replace(/[&<>"']/g, c => '&#' + c.charCodeAt(0) + ';');
}

window.renderStudySets = function () {
    const container = document.getElementById('study-sets-container');
    const hint = document.getElementById('empty-sets-hint');
    if (!container || !hint) return;

    if (!appState.db.studySets || appState.db.studySets.length === 0) {
        hint.style.display = 'block';
        Array.from(container.children).forEach(c => {
            if (c.id !== 'empty-sets-hint') c.remove();
        });
        return;
    }

    hint.style.display = 'none';
    container.innerHTML = '<p class="text-[10px] text-slate-400 italic" id="empty-sets-hint" style="display:none;">Genera flashcard o quiz per visualizzarli qui.</p>';

    // Sort newest first
    const sortedSets = [...appState.db.studySets].sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));

    /* L'elenco si ridisegna a ogni renderGraph, e i set arrivano anche dai file
       `Materiale Studio/*.json` di un vault ricevuto: titolo, data e numero di
       domande entravano nell'HTML così com'erano, e id e modo dentro
       `onclick="…('${set.id}')"`, protetti dal solo apice. Ora ogni valore del set
       passa dall'escape, e i bottoni portano solo il nome della loro azione:
       l'id lo conosce la funzione qui sotto, non l'HTML. */
    const esc = _escSetStudio;
    sortedSets.forEach(set => {
        const div = document.createElement('div');
        div.className = "flex justify-between items-center p-3 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition cursor-pointer group shadow-sm mb-2";
        const azioni = {
            rigenera: () => window.regenerateStudySet(set.id),
            elimina: () => window.deleteStudySet(set.id),
            stampa: () => { if (set.mode === 'flashcard') window.printFlashcardSet(set.id); else window.printQuizSet(set.id); },
            live: () => { if (window.MappAILive && window.MappAILive.launchFromSetPrompt) window.MappAILive.launchFromSetPrompt(set.id); }
        };
        // un clic su un bottone fa la sua azione e si ferma lì (era il suo
        // `event.stopPropagation()`); altrove sulla riga apre il set, come prima
        div.onclick = (e) => {
            const b = (e && e.target && e.target.closest) ? e.target.closest('[data-set-azione]') : null;
            const fa = b && azioni[b.getAttribute('data-set-azione')];
            if (fa) { e.stopPropagation(); fa(); return; }
            window.loadStudySet(set.id);
        };

        let iconColor = set.mode === 'quiz' ? 'text-amber-500' : 'text-purple-500';
        let iconType = set.mode === 'quiz' ? 'help-circle' : 'brain-circuit';
        const quante = Array.isArray(set.items) ? set.items.length : 0;

        div.innerHTML = `
            <div class="flex items-center gap-3 overflow-hidden min-w-0 flex-1">
                <div class="w-8 h-8 rounded-lg bg-slate-50 flex items-center justify-center shrink-0 border border-slate-100 group-hover:bg-white transition">
                     <i data-lucide="${iconType}" class="w-4 h-4 ${iconColor}"></i>
                </div>
                <div class="flex flex-col min-w-0">
                    <span class="text-xs font-bold text-slate-700 truncate leading-tight">${esc(set.title)}</span>
                    <span class="text-[10px] text-slate-400">${quante} domande &middot; ${esc(new Date(set.date).toLocaleDateString())}</span>
                </div>
            </div>
            <div class="ml-3 shrink-0 flex items-center gap-1">
                <button data-set-azione="rigenera" class="flex items-center gap-1 px-2 py-1 text-[11px] font-bold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition" title="${window.t('tt_regen_set', 'Genera domande nuove su questo materiale')}">
                    <i data-lucide="refresh-cw" class="w-3.5 h-3.5"></i><span>${window.t('ui_regen', 'Rigenera')}</span>
                </button>
                <button data-set-azione="elimina" class="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition" title="Elimina Set">
                    <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
                </button>
                <button data-set-azione="stampa" class="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors flex-shrink-0" title="Stampa / Esporta PDF">
                    <i data-lucide="printer" class="w-4 h-4"></i>
                </button>
                ${set.mode === 'quiz' ? `<button data-set-azione="live" class="p-1.5 rounded-lg hover:bg-emerald-50 text-emerald-500 hover:text-emerald-700 transition-colors flex-shrink-0" title="${window.t('tt_launch_live', 'Avvia questo set come attività live (QR)')}">
                    <i data-lucide="qr-code" class="w-4 h-4"></i>
                </button>` : ''}
                <i data-lucide="play-circle" class="w-5 h-5 text-indigo-500 group-hover:text-indigo-700 transition"></i>
            </div>
        `;
        container.appendChild(div);
    });
    window.safeCreateIcons();
};

window.loadStudySet = function (setId) {
    const set = appState.db.studySets.find(s => s.id === setId);
    if (!set) return;

    window.activeStudySetTitle = set.title || 'Mappa';
    window.activeStudySetId = setId;   // per "Domande nuove" nel player
    window.activeStudySessionItems = set.items;
    window.studyConfig = {
        mode: set.mode,
        quizType: set.type
    };

    window.studyResults = {
        mode: set.mode,
        type: set.type,
        correct: 0,
        total: set.items.length,
        mistakes: [],
        openAnswers: [],
        startTime: Date.now()
    };

    window.currentStudyItemIndex = 0;
    window.openStudyPlayer();
};

window.deleteStudySet = function (setId) {
    if (confirm("Sei sicuro di voler eliminare questo set?")) {
        appState.db.studySets = appState.db.studySets.filter(s => s.id !== setId);
        window.renderStudySets();
    }
};

// "Rigenera domande nuove": nuova chiamata AI con nonce fresco (NON il replay verbatim
// di loadStudySet). Risolve la ripetizione identica dei set salvati. Richiede set.material
// (salvato alla creazione); i set storici senza material non sono rigenerabili.
window.regenerateStudySet = async function (setId) {
    if (window.mappaiOccupato && window.mappaiOccupato()) return;
    const reviewGuard = window.MappAIReview?.requireStandalone || window.MappAIReview?.requireApproved;
    if (reviewGuard && !await reviewGuard.call(window.MappAIReview)) return;
    const set = appState.db.studySets.find(s => s.id === setId);
    if (!set) return;
    if (!set.material) {
        window.showToast(window.t('tst_set_no_material', "Set storico senza materiale salvato: non rigenerabile. Creane uno nuovo da ELABORA › «Crea nuovo»."), "warning");
        return;
    }
    const apiKey = window.getSystemKey();
    if (!apiKey) { window.showToast(window.t('tst_key_in_settings', "Inserisci API Key nelle impostazioni."), "error"); return; }
    if (!confirm(window.t('cf_regen_set', "Rigenerare il set con domande NUOVE? Le domande attuali verranno sostituite."))) return;
    window.showLoadingOverlay(true, window.t('lo_study_gen', "Generazione materiale di studio in corso..."), set.mode === 'flashcard' ? 'flashcard' : 'quiz');
    try {
        const nonce = window.quizNonce ? window.quizNonce() : String(Date.now());
        let newItems = [];
        if (set.nodeQuiz) {
            // quiz per-nodo: schema a1/a2/a3, template MULTIPLE_CHOICE
            const promptText = window.fillPromptTemplate("MULTIPLE_CHOICE_QUIZ", { nodeLabel: set.title, nodeContent: set.material, nonce });
            const schema = { type: "ARRAY", items: { type: "OBJECT", properties: { q: { type: "STRING" }, a1: { type: "STRING" }, a2: { type: "STRING" }, a3: { type: "STRING" }, correct: { type: "INTEGER" } }, required: ["q", "a1", "a2", "a3", "correct"] }, minItems: 5, maxItems: 5 };
            if (window.MappAIUsage) window.MappAIUsage.setContext('study', 'node_quiz');
            const _angleB = window.quizAngleBlock ? window.quizAngleBlock(set.angle || 'auto') : '';
            // il punto in fondo alle opzioni anche quando si rigenera (packet 0080)
            const _puntoB = window.quizPuntoBlock ? window.quizPuntoBlock() : '';
            const data = await window.fetchModelAPI(window.injectClassTuning({ contents: [{ parts: [{ text: (_angleB ? _angleB + '\n\n' : '') + promptText + (_puntoB ? '\n\n' + _puntoB : '') }] }], generationConfig: { temperature: (window.QUIZ_TEMPERATURE || 0.7), responseMimeType: "application/json", responseSchema: schema, _respectTemp: true } }), apiKey);
            const raw = data.candidates[0].content.parts[0].text;
            newItems = salvageTruncatedJSON(raw.split(MARKER_JSON).join('').split(MARKER_END).join('').trim());
            /* qui non c'è rimescolamento: il passo viene subito dopo la lettura,
               con le stesse guardie della generazione */
            try {
                const PC = window.MappAIPipelineCore;
                if (PC && PC.chiudiOpzioni && Array.isArray(newItems) && window.quizPuntoAcceso && window.quizPuntoAcceso()) {
                    newItems = PC.chiudiOpzioni(newItems);
                }
            } catch (e) { /* ripiego: le opzioni come sono */ }
        } else if (set.mode === 'flashcard') {
            const _PLfc = window.MappAIPrintLayout;
            const _regolaFc = _PLfc ? _PLfc.promptRule(_PLfc.flashGeom(), null, window.getMapLanguage ? window.getMapLanguage() : "it") : "";
            const promptText = window.fillPromptTemplate("FLASHCARD_GENERATOR", { quantity: set.quantity || set.items.length || 5, nodeLabel: set.title, nonce }) + _regolaFc;
            const _q = Math.max(1, parseInt(set.quantity || set.items.length, 10) || 5);
            const schema = { type: "ARRAY", maxItems: _q, items: { type: "OBJECT", properties: { front: { type: "STRING" }, back: { type: "STRING" } }, required: ["front", "back"] } };
            if (window.MappAIUsage) window.MappAIUsage.setContext('study', 'flashcards');
            const data = await window.fetchModelAPI(window.injectClassTuning({ contents: [{ parts: [{ text: promptText + "\n\nMateriale:\n" + set.material }] }], generationConfig: { temperature: (window.QUIZ_TEMPERATURE || 0.7), responseMimeType: "application/json", responseSchema: schema, _respectTemp: true } }), apiKey);
            const raw = data.candidates[0].content.parts[0].text;
            newItems = salvageTruncatedJSON(raw.split(MARKER_JSON).join('').split(MARKER_END).join('').trim());
        } else {
            // quiz "dinamico" (options/correct): riusa generateDynamicQuiz (nonce interno)
            newItems = await window.generateDynamicQuiz({ nodeLabel: set.title, material: set.material, quizType: set.type || 'Scelta Multipla', quantity: set.quantity || set.items.length || 5, angle: set.angle || 'auto', apiKey });
        }
        if (!Array.isArray(newItems) || !newItems.length) { window.showLoadingOverlay(false); window.showToast(window.t('tst_regen_empty', "Rigenerazione non riuscita: nessuna domanda prodotta."), "error"); return; }
        set.items = newItems;
        set.date = new Date().toISOString();
        window.showLoadingOverlay(false);
        window.showToast(window.t('tst_regen_done', "Domande rigenerate!"), "success");
        window.renderStudySets();
    } catch (e) {
        window.showLoadingOverlay(false);
        window.showAlert("Errore Rigenerazione", e && e.message);
    }
};



window.getDescendants = function (nodeId) {
    const startNode = appState.db.nodes.find(n => n.id === nodeId);
    if (!startNode) return [];

    if (appState.extractionMode === 'mindmap') {
        // Per mappe mentali, tutti i nodi dello stesso gruppo (escluso il nodo stesso)
        return appState.db.nodes.filter(n => n.group === startNode.group && n.id !== nodeId);
    }

    let descendants = new Set();
    let queue = [nodeId];
    while (queue.length > 0) {
        let current = queue.shift();
        let children = appState.db.links.filter(l => {
            let sid = typeof l.source === 'object' ? l.source.id : l.source;
            return sid === current;
        }).map(l => typeof l.target === 'object' ? l.target.id : l.target);

        for (let child of children) {
            if (!descendants.has(child)) {
                descendants.add(child);
                queue.push(child);
            }
        }
    }
    return Array.from(descendants).map(id => appState.db.nodes.find(n => n.id === id)).filter(n => n);
};

window.handleImageUpload = function (input) {
    const file = input.files[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
        window.showToast(window.t('tst_img_too_big', "Immagine troppo grande (Massimo consentito: 2MB)."), "error");
        input.value = '';
        return;
    }

    const reader = new FileReader();
    reader.onload = function (e) {
        const base64Data = e.target.result;
        document.getElementById('edit-n-image-base64').value = base64Data;
        document.getElementById('edit-n-image-url').value = '';

        const preview = document.getElementById('edit-n-image-preview');
        preview.src = base64Data;
        preview.classList.remove('hidden');
    };
    reader.readAsDataURL(file);
}

window.handleImageUrlInput = function (input) {
    const val = input.value.trim();
    const base64Input = document.getElementById('edit-n-image-base64');
    const fileInput = document.getElementById('edit-n-image-file');
    const preview = document.getElementById('edit-n-image-preview');

    if (val !== '') {
        base64Input.value = '';
        fileInput.value = '';
        preview.src = val;
        preview.classList.remove('hidden');
    } else {
        preview.src = '';
        preview.classList.add('hidden');
    }
}
