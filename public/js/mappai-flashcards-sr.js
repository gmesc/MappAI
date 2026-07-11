// ==========================================
// SPACED REPETITION & FLASHCARDS — estratto da app.js
// ==========================================
// Caricato DOPO app.js: appState e gli helper (window.* e bare) si risolvono
// a runtime via scope lessicale globale condiviso.
// ==========================================
// SPACED REPETITION & FLASHCARDS
// ==========================================
let currentQuizNode = null;

window.generateFlashcardForNode = async function (node, silent = false, isBranch = false) {
    const apiKey = window.getSystemKey();
    if (!apiKey) {
        if (!silent) window.showToast(window.t('tst_fc_no_key', "Nessuna API Key presente per generare le flashcard."), "error"); return;
    }
    if (!silent) window.showLoadingOverlay(true, window.t('lo_fc_gen', "Generazione Flashcard in corso..."), "flashcard");

    const promptText = window.fillPromptTemplate("MULTIPLE_CHOICE_QUIZ", {
        nodeLabel: node.label,
        nodeContent: node.desc || node.content
    });

    const schema = {
        type: "ARRAY",
        items: {
            type: "OBJECT",
            properties: {
                q: { type: "STRING" }, a1: { type: "STRING" }, a2: { type: "STRING" }, a3: { type: "STRING" }, correct: { type: "INTEGER" }
            },
            required: ["q", "a1", "a2", "a3", "correct"]
        },
        minItems: 5,
        maxItems: 5
    };

    const payload = window.injectClassTuning({ contents: [{ parts: [{ text: promptText }] }], generationConfig: { temperature: 0.3, responseMimeType: "application/json", responseSchema: schema } });

    try {
        const data = await window.fetchModelAPI(payload, apiKey);
        let rawText = data.candidates[0].content.parts[0].text;
        let cleanText = rawText.split(MARKER_JSON).join('').split(MARKER_END).join('').trim();
        const items = salvageTruncatedJSON(cleanText);
        node.flashcardTest = items;
        node.nextReview = Date.now(); // Available right away

        if (!isBranch) {
            appState.db.studySets = appState.db.studySets || [];
            const isKG = appState.db.extractionMode === 'knowledge_graph';
            const nodePrefix = (isKG && node.level === 1) ? 'Hub' : 'Nodo';
            appState.db.studySets.push({
                id: 'set_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
                title: `${nodePrefix}: ${node.label}`,
                mode: 'quiz', // Default mode for nodes is currently 'quiz' (multiple choice)
                type: 'Multiple Choice',
                items: items,
                date: new Date().toISOString()
            });
        }

        if (!silent) {
            window.showLoadingOverlay(false);
            window.showToast(window.t('tst_fc_done', "Flashcard generata! Apri il menu per ripassare."), "success");
        }
    } catch (err) {
        if (!silent) {
            window.showLoadingOverlay(false);
            window.showAlert("Errore Generazione", err.message);
        }
    }
    if (window.renderStudySets) window.renderStudySets();
};

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

    sortedSets.forEach(set => {
        const div = document.createElement('div');
        div.className = "flex justify-between items-center p-3 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition cursor-pointer group shadow-sm mb-2";
        div.onclick = () => window.loadStudySet(set.id);

        let iconColor = set.mode === 'quiz' ? 'text-amber-500' : 'text-purple-500';
        let iconType = set.mode === 'quiz' ? 'help-circle' : 'brain-circuit';

        div.innerHTML = `
            <div class="flex items-center gap-3 overflow-hidden min-w-0 flex-1">
                <div class="w-8 h-8 rounded-lg bg-slate-50 flex items-center justify-center shrink-0 border border-slate-100 group-hover:bg-white transition">
                     <i data-lucide="${iconType}" class="w-4 h-4 ${iconColor}"></i>
                </div>
                <div class="flex flex-col min-w-0">
                    <span class="text-xs font-bold text-slate-700 truncate leading-tight">${set.title}</span>
                    <span class="text-[10px] text-slate-400">${set.items.length} domande &middot; ${new Date(set.date).toLocaleDateString()}</span>
                </div>
            </div>
            <div class="ml-3 shrink-0 flex items-center gap-1">
                <button onclick="event.stopPropagation(); window.deleteStudySet('${set.id}')" class="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition" title="Elimina Set">
                    <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
                </button>
                <button onclick="event.stopPropagation(); if('${set.mode}' === 'flashcard') { window.printFlashcardSet('${set.id}'); } else { window.printQuizSet('${set.id}'); }" class="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors flex-shrink-0" title="Stampa / Esporta PDF">
                    <i data-lucide="printer" class="w-4 h-4"></i>
                </button>
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

window.generateBranchFlashcards = async function (node) {
    const apiKey = window.getSystemKey();
    if (!apiKey) { window.showToast(window.t('tst_enter_key', "Inserisci API Key."), "error"); return; }

    let nodes = [node, ...window.getDescendants(node.id)];
    if (nodes.length > 10) nodes = nodes.slice(0, 10);

    window.showLoadingOverlay(true, `Generazione per Ramo in corso (${nodes.length} nodi)...`, "flashcard");
    let successCount = 0;
    let branchItems = [];
    for (const n of nodes) {
        try {
            await window.generateFlashcardForNode(n, true, true);
            if (n.flashcardTest) {
                successCount++;
                branchItems = branchItems.concat(n.flashcardTest);
            }
        } catch (e) { console.error(e); }
    }
    window.showLoadingOverlay(false);
    if (successCount > 0) {
        appState.db.studySets = appState.db.studySets || [];
        appState.db.studySets.push({
            id: 'set_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
            title: `Ramo: ${node.label}`,
            mode: 'quiz',
            type: 'Multiple Choice',
            items: branchItems,
            date: new Date().toISOString()
        });
        if (window.renderStudySets) window.renderStudySets();

        window.globalQuizQueue = nodes.filter(n => n.flashcardTest);
        window.playNextGlobalQuiz();
    } else {
        window.showToast(window.t('tst_fc_none', "Nessuna flashcard generata."), "error");
    }
};

window.testBranchFlashcards = function (node) {
    let nodes = [node, ...window.getDescendants(node.id)].filter(n => n.flashcardTest);
    if (nodes.length === 0) {
        window.showToast(window.t('tst_fc_none_branch', "Nessuna flashcard trovata nel ramo. Generala prima!"), "error");
        return;
    }
    window.globalQuizQueue = nodes;
    window.playNextGlobalQuiz();
};

let currentSubQuestionIdx = 0;
let correctSubAnswersCount = 0;

window.openQuizModal = function (node) {
    currentQuizNode = node;
    const questions = node.flashcardTest;
    if (!questions || !Array.isArray(questions)) {
        // Fallback for old single-question format
        if (questions && questions.q) {
            node.flashcardTest = [questions];
            window.openQuizModal(node);
            return;
        }
        return;
    }

    currentSubQuestionIdx = 0;
    correctSubAnswersCount = 0;
    window._quizStartTs = Date.now(); // cronometro fluenza (corrette/min) per la padronanza
    window.renderSubQuestion();

    const iconElem = document.getElementById('quiz-modal-icon');
    if (iconElem) {
        iconElem.setAttribute('data-lucide', 'graduation-cap');
    }

    const modal = document.getElementById('quiz-modal');
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    const box = document.getElementById('quiz-modal-content');
    setTimeout(() => {
        modal.classList.remove('opacity-0');
        box.classList.remove('scale-95');
    }, 10);
    window.safeCreateIcons();
};

window.closeQuizModal = function () {
    const modal = document.getElementById('quiz-modal');
    const box = document.getElementById('quiz-modal-content');
    modal.classList.add('opacity-0');
    box.classList.add('scale-95');
    setTimeout(() => { modal.classList.add('hidden'); modal.classList.remove('flex'); }, 200);
    currentQuizNode = null;
}

window.renderSubQuestion = function () {
    const questions = currentQuizNode.flashcardTest;
    const fc = questions[currentSubQuestionIdx];

    document.getElementById('quiz-node-title').innerText = `${currentQuizNode.label} (${currentSubQuestionIdx + 1}/${questions.length})`;
    document.getElementById('quiz-question-container').innerText = fc.q;
    document.getElementById('quiz-feedback-container').classList.add('hidden');
    document.getElementById('quiz-sr-buttons').classList.add('hidden');
    document.getElementById('quiz-next-container').classList.add('hidden');

    const optsContainer = document.getElementById('quiz-options-container');
    optsContainer.innerHTML = '';

    const optionsArray = [1, 2, 3].filter(val => {
        let t = val === 1 ? fc.a1 : (val === 2 ? fc.a2 : fc.a3);
        return t && t.trim() !== '';
    });

    const isTrueFalse = optionsArray.length === 2 && optionsArray.some(val => {
        let t = val === 1 ? fc.a1 : (val === 2 ? fc.a2 : fc.a3);
        const l = t.toLowerCase();
        return l === 'vero' || l === 'falso' || l === 'true' || l === 'false';
    });

    if (isTrueFalse) {
        optsContainer.className = "flex gap-4 mb-6";
    } else {
        optsContainer.className = "space-y-3 mb-6";
    }

    optionsArray.forEach(val => {
        let text = val === 1 ? fc.a1 : (val === 2 ? fc.a2 : fc.a3);
        let btn = document.createElement('div');

        if (isTrueFalse) {
            btn.className = "quiz-option flex-1 text-center";
            const lowerText = text.toLowerCase();
            if (lowerText === 'vero' || lowerText === 'true') {
                btn.classList.add('tf-true');
            } else if (lowerText === 'falso' || lowerText === 'false') {
                btn.classList.add('tf-false');
            }
        } else {
            btn.className = "quiz-option";
        }

        btn.innerText = text;
        btn.onclick = () => window.handleQuizAnswer(btn, optsContainer, val === fc.correct);
        optsContainer.appendChild(btn);
    });
};

window.handleQuizAnswer = function (selectedBtn, container, isCorrect) {
    if (isCorrect) correctSubAnswersCount++;

    // Disable all
    Array.from(container.children).forEach(b => {
        b.onclick = null; b.style.cursor = 'default';
    });

    const questions = currentQuizNode.flashcardTest;
    const feedbackTitle = document.getElementById('quiz-feedback-title');
    const feedbackDesc = document.getElementById('quiz-feedback-desc');
    const nextContainer = document.getElementById('quiz-next-container');
    const srButtons = document.getElementById('quiz-sr-buttons');

    if (isCorrect) {
        selectedBtn.classList.add('correct');
        feedbackTitle.innerHTML = '<i data-lucide="check-circle" class="w-4 h-4 text-emerald-500"></i> Risposta Esatta!';
    } else {
        selectedBtn.classList.add('wrong');
        feedbackTitle.innerHTML = '<i data-lucide="x-circle" class="w-4 h-4 text-red-500"></i> Sbagliato!';
    }

    if (currentSubQuestionIdx < questions.length - 1) {
        feedbackDesc.innerText = "Continua con la prossima domanda del set.";
        nextContainer.classList.remove('hidden');
    } else {
        const finalScore = `${correctSubAnswersCount}/${questions.length}`;
        currentQuizNode.lastScore = finalScore;
        // Padronanza per-concetto (Precision Teaching): senza questo il quiz — l'attività
        // di studio più usata — non alimentava lo store EWMA né le sessioni per la meta-analisi.
        try {
            const _qScore = questions.length ? correctSubAnswersCount / questions.length : 0;
            const _qRate = window._quizStartTs
                ? correctSubAnswersCount / Math.max((Date.now() - window._quizStartTs) / 60000, 2 / 60)
                : undefined;
            if (window.MappAIStudyBus) {
                window.MappAIStudyBus.begin('quiz', 'Quiz spaced repetition');
                window.MappAIStudyBus.record(currentQuizNode.id, currentQuizNode.label, 'quiz', { score: _qScore, rate: _qRate });
                window.MappAIStudyBus.end();
            } else if (window.MappAIMastery && window.MappAIMastery.record) {
                window.MappAIMastery.record(currentQuizNode.id, currentQuizNode.label, 'quiz', { score: _qScore, rate: _qRate });
            }
        } catch (e) { console.warn('[Quiz] mastery record', e); }
        feedbackDesc.innerHTML = `Hai terminato questo set! Punteggio finale: <b class="text-indigo-600">${finalScore}</b>.<br>Valuta ora la difficoltà per programmare il prossimo ripasso:`;
        srButtons.classList.remove('hidden');
    }

    window.safeCreateIcons();
    document.getElementById('quiz-feedback-container').classList.remove('hidden');
};

window.showNextSubQuestion = function () {
    currentSubQuestionIdx++;
    window.renderSubQuestion();
};

window.processSRResponse = function (difficulty) {
    if (!currentQuizNode) return;
    const now = Date.now();
    currentQuizNode.lastReviewed = now;

    let intervalDays = 1;
    if (difficulty === 'easy') intervalDays = 7;
    else if (difficulty === 'good') intervalDays = 3;
    else if (difficulty === 'hard') intervalDays = 0.5;

    // Intervallo modulato dalla padronanza EWMA del nodo (0.5×–1.5×): a parità di
    // autovalutazione, un concetto storicamente fragile torna prima. Gli intervalli
    // fissi trattavano allo stesso modo primo incontro e concetto consolidato.
    try {
        if (window.MappAIMastery && window.MappAIMastery.node) {
            const agg = window.MappAIMastery.node(currentQuizNode.id);
            if (agg && agg.attempts) intervalDays *= (0.5 + agg.accuracy);
        }
    } catch (e) { /* store non disponibile: intervalli base */ }

    // Aggiorna lo studyStatus
    if (difficulty === 'easy') currentQuizNode.studyStatus = 'done';
    else if (difficulty === 'good') currentQuizNode.studyStatus = 'review';
    else currentQuizNode.studyStatus = 'todo';

    currentQuizNode.nextReview = now + (intervalDays * 24 * 60 * 60 * 1000);

    window.closeQuizModal();
    renderGraph();

    if (window.globalQuizQueue && window.globalQuizQueue.length > 0) {
        setTimeout(() => window.playNextGlobalQuiz(), 300);
    } else {
        window.showToast(window.t('tst_sr_updated', "Stato aggiornato nel sistema Spaced Repetition."), "success");
    }
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
