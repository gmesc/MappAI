// ==========================================
// STUDY SESSION (config, player, punteggi, report) — estratto da app.js
// ==========================================
// Caricato DOPO app.js: appState e gli helper (window.* e bare) si risolvono
// a runtime via scope lessicale globale condiviso.
window.globalQuizQueue = [];

let pendingTopic = null;
window.studyConfig = { mode: 'quiz', quantity: 15, timer: false, target: null, scope: 'all' };

window.generateGlobalFlashcards = function () {
    window.openStudyConfigModal('flashcard');
};

window.generateGlobalQuiz = function () {
    window.openStudyConfigModal('quiz');
};

window.openStudyConfigModal = function (mode, targetNode = null, scope = 'all') {
    window.studyConfig.mode = mode;
    window.studyConfig.target = targetNode;
    window.studyConfig.scope = scope;

    window.selectStudyQuantity(15);
    document.getElementById('study-timer-toggle').checked = false;

    let title = mode === 'quiz' ? 'Configura Quiz' : 'Configura Flashcard';
    if (scope === 'node' && targetNode) title += ` (${targetNode.label})`;
    else if (scope === 'branch' && targetNode) title += ` (Ramo ${targetNode.label})`;

    document.getElementById('study-config-title').innerText = title;

    let iconName = 'brain-circuit';
    if (mode === 'quiz') {
        iconName = scope === 'branch' ? 'layers' : 'graduation-cap';
    } else {
        iconName = scope === 'branch' ? 'network' : 'brain-circuit';
    }
    const iconElem = document.getElementById('study-config-icon');
    if (iconElem) {
        iconElem.setAttribute('data-lucide', iconName);
    }
    const quizTypeContainer = document.getElementById('quiz-type-container');
    if (mode === 'quiz') quizTypeContainer.classList.remove('hidden');
    else quizTypeContainer.classList.add('hidden');

    const modal = document.getElementById('study-config-modal');
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    setTimeout(() => modal.classList.remove('opacity-0'), 10);
    window.safeCreateIcons();
};

window.closeStudyConfigModal = function () {
    const modal = document.getElementById('study-config-modal');
    modal.classList.add('opacity-0');
    setTimeout(() => {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }, 200);
};

window.selectStudyQuantity = function (qty) {
    window.studyConfig.quantity = qty;
    document.querySelectorAll('.study-qty-btn').forEach(btn => {
        if (parseInt(btn.dataset.qty) === qty) {
            btn.classList.remove('bg-slate-50', 'text-slate-500', 'border-slate-200');
            btn.classList.add('bg-indigo-50', 'text-indigo-600', 'border-indigo-500');
        } else {
            btn.classList.add('bg-slate-50', 'text-slate-500', 'border-slate-200');
            btn.classList.remove('bg-indigo-50', 'text-indigo-600', 'border-indigo-500');
        }
    });
};

window.startStudySession = async function () {
    window.closeStudyConfigModal();
    window.studyConfig.timer = document.getElementById('study-timer-toggle').checked;
    if (window.studyConfig.mode === 'quiz') {
        window.studyConfig.quizType = document.getElementById('study-quiz-type').value;
    }

    let studyText = "";
    let targetLabel = "Globale";

    if (window.studyConfig.scope === 'node' && window.studyConfig.target) {
        const n = window.studyConfig.target;
        studyText = `${n.label}: ${n.desc || n.content}`;
        const isKG = appState.db.extractionMode === 'knowledge_graph';
        const nodePrefix = (isKG && n.level === 1) ? 'Hub' : 'Nodo';
        targetLabel = `${nodePrefix}: ${n.label}`;
    } else if (window.studyConfig.scope === 'branch' && window.studyConfig.target) {
        const root = window.studyConfig.target;
        const branchNodes = [root, ...window.getDescendants(root.id)];
        studyText = branchNodes.map(n => n.label + ": " + (n.desc || n.content)).join('\n');
        targetLabel = `Ramo: ${root.label}`;
    } else {
        studyText = appState.db.nodes.map(n => n.label + ": " + (n.desc || n.content)).join('\n');
    }

    if (!studyText || studyText.trim() === '') {
        window.showToast("Nessun contenuto trovato per lo studio.", "error");
        return;
    }

    const apiKey = window.getSystemKey();
    if (!apiKey) { window.showToast("Inserisci API Key nelle impostazioni.", "error"); return; }

    window.showLoadingOverlay(true, "Generazione materiale di studio in corso...", window.studyConfig.mode === 'quiz' ? 'quiz' : 'flashcard');

    try {
        let schema, prompt;
        if (window.studyConfig.mode === 'quiz') {
            prompt = window.fillPromptTemplate("DYNAMIC_QUIZ", {
                quantity: window.studyConfig.quantity,
                quizType: window.studyConfig.quizType,
                nodeLabel: targetLabel
            });
            schema = {
                type: "ARRAY",
                items: {
                    type: "OBJECT",
                    properties: {
                        q: { type: "STRING" },
                        options: { type: "ARRAY", items: { type: "STRING" } },
                        correct: { type: "STRING" },
                        explanation: { type: "STRING" }
                    },
                    required: ["q", "correct", "explanation"]
                }
            };
        } else {
            prompt = window.fillPromptTemplate("FLASHCARD_GENERATOR", {
                quantity: window.studyConfig.quantity,
                nodeLabel: targetLabel
            });
            schema = {
                type: "ARRAY",
                items: {
                    type: "OBJECT",
                    properties: { front: { type: "STRING" }, back: { type: "STRING" } },
                    required: ["front", "back"]
                }
            };
        }

        const response = await window.fetchModelAPI({
            contents: [{ parts: [{ text: prompt + "\n\nMateriale:\n" + studyText }] }],
            generationConfig: { temperature: 0.3, responseMimeType: "application/json", responseSchema: schema }
        }, apiKey);

        let rawText = response.candidates[0].content.parts[0].text;
        let cleanText = rawText.split('```json').join('').split('```').join('').trim();
        window.activeStudySessionItems = salvageTruncatedJSON(cleanText);

        appState.db.studySets = appState.db.studySets || [];
        const label = targetLabel;
        appState.db.studySets.push({
            id: 'set_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
            title: label,
            mode: window.studyConfig.mode,
            type: window.studyConfig.quizType || 'Flashcard',
            items: window.activeStudySessionItems,
            date: new Date().toISOString()
        });
        if (window.renderStudySets) window.renderStudySets();

        window.currentStudyItemIndex = 0;

        // Initialize results
        window.studyResults = {
            mode: window.studyConfig.mode,
            type: window.studyConfig.quizType || 'Flashcard',
            correct: 0,
            total: window.activeStudySessionItems.length,
            mistakes: [],
            openAnswers: [],
            startTime: Date.now()
        };

        window.openStudyPlayer();

    } catch (err) {
        window.showAlert("Errore Generazione", err.message);
    } finally {
        window.showLoadingOverlay(false);
    }
};

window.studyTimerInterval = null;
window.studySeconds = 0;

window.openStudyPlayer = function () {
    if (!window.activeStudySessionItems || window.activeStudySessionItems.length === 0) {
        window.showToast("Nessuna domanda generata.", "error");
        return;
    }

    const modal = document.getElementById('study-player-modal');
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    setTimeout(() => modal.classList.remove('opacity-0'), 10);

    let iconName = 'brain-circuit';
    if (window.studyConfig.mode === 'quiz') {
        iconName = window.studyConfig.scope === 'branch' ? 'layers' : 'graduation-cap';
    } else {
        iconName = window.studyConfig.scope === 'branch' ? 'network' : 'brain-circuit';
    }
    const iconElem = document.getElementById('study-player-icon');
    if (iconElem) {
        iconElem.setAttribute('data-lucide', iconName);
    }

    const timerContainer = document.getElementById('study-player-timer-container');
    if (window.studyConfig.timer) {
        timerContainer.classList.remove('hidden');
        window.studySeconds = 0;
        timerContainer.innerText = "00:00";
        if (window.studyTimerInterval) clearInterval(window.studyTimerInterval);
        window.studyTimerInterval = setInterval(() => {
            window.studySeconds++;
            const m = String(Math.floor(window.studySeconds / 60)).padStart(2, '0');
            const s = String(window.studySeconds % 60).padStart(2, '0');
            timerContainer.innerText = `${m}:${s}`;
        }, 1000);
    } else {
        timerContainer.classList.add('hidden');
    }

    document.getElementById('study-flashcard-view').classList.add('hidden');
    document.getElementById('study-quiz-view').classList.add('hidden');
    document.getElementById('study-summary-view').classList.add('hidden');

    window.renderCurrentStudyItem();
    window.safeCreateIcons();
};

window.closeStudyPlayer = function () {
    if (window.studyTimerInterval) clearInterval(window.studyTimerInterval);
    const modal = document.getElementById('study-player-modal');
    modal.classList.add('opacity-0');
    setTimeout(() => {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }, 200);
};

window.renderCurrentStudyItem = function () {
    const item = window.activeStudySessionItems[window.currentStudyItemIndex];
    document.getElementById('study-player-progress').innerText = `${window.currentStudyItemIndex + 1} / ${window.activeStudySessionItems.length}`;

    if (window.studyConfig.mode === 'flashcard') {
        document.getElementById('study-flashcard-view').classList.remove('hidden');
        document.getElementById('study-flashcard-view').classList.add('flex');
        document.getElementById('study-quiz-view').classList.add('hidden');

        document.getElementById('flashcard-front').classList.remove('hidden');
        document.getElementById('flashcard-back-container').classList.add('hidden');
        document.getElementById('flashcard-front-text').innerText = item.front;
        document.getElementById('flashcard-back-text').innerText = item.back;
    } else {
        document.getElementById('study-quiz-view').classList.remove('hidden');
        document.getElementById('study-quiz-view').classList.add('flex');
        document.getElementById('study-flashcard-view').classList.add('hidden');

        document.getElementById('study-quiz-question').innerText = item.q;
        document.getElementById('study-quiz-feedback').classList.add('hidden');

        const isMultiple = item.options && item.options.length > 0;
        const optsContainer = document.getElementById('study-quiz-options');
        const openContainer = document.getElementById('study-quiz-open');

        if (isMultiple) {
            optsContainer.classList.remove('hidden');
            openContainer.classList.add('hidden');
            optsContainer.innerHTML = '';
            item.options.forEach((opt, idx) => {
                const btn = document.createElement('button');
                btn.className = "w-full p-4 bg-white border-2 border-slate-200 rounded-xl text-left hover:border-indigo-400 hover:bg-indigo-50 transition text-slate-700 font-medium";
                btn.innerText = opt;
                btn.onclick = () => window.checkQuizAnswer(opt, item);
                optsContainer.appendChild(btn);
            });
        } else {
            optsContainer.classList.add('hidden');
            openContainer.classList.remove('hidden');
            openContainer.classList.add('flex');
            document.getElementById('study-quiz-textarea').value = '';
        }
    }
};

window.flipFlashcard = function () {
    document.getElementById('flashcard-front').classList.add('hidden');
    document.getElementById('flashcard-back-container').classList.remove('hidden');
    document.getElementById('flashcard-back-container').classList.add('flex');
};

window.checkQuizAnswer = function (selected, item) {
    const isCorrect = String(selected).toLowerCase() === String(item.correct).toLowerCase() ||
        String(selected).includes(String(item.correct)) ||
        String(item.correct).includes(String(selected));

    if (isCorrect) {
        window.studyResults.correct++;
    } else {
        window.studyResults.mistakes.push({
            q: item.q,
            userAnswer: selected,
            correctAnswer: item.correct,
            explanation: item.explanation
        });
    }

    const feedbackTitle = document.getElementById('study-quiz-feedback-title');
    const feedbackDesc = document.getElementById('study-quiz-feedback-desc');

    if (isCorrect) {
        feedbackTitle.innerHTML = '<i data-lucide="check-circle" class="text-emerald-500 w-5 h-5"></i> Esatto!';
        feedbackTitle.className = "font-black mb-3 uppercase tracking-wider text-sm flex items-center justify-center gap-2 text-emerald-600";
    } else {
        feedbackTitle.innerHTML = '<i data-lucide="x-circle" class="text-red-500 w-5 h-5"></i> Sbagliato';
        feedbackTitle.className = "font-black mb-3 uppercase tracking-wider text-sm flex items-center justify-center gap-2 text-red-600";
    }

    feedbackDesc.innerHTML = `<strong>Risposta corretta:</strong> ${item.correct}<br><br><strong>Spiegazione:</strong> ${item.explanation}`;
    document.getElementById('study-quiz-feedback').classList.remove('hidden');
    document.getElementById('study-quiz-options').classList.add('hidden');
    window.safeCreateIcons();
};

window.checkOpenAnswer = function () {
    const item = window.activeStudySessionItems[window.currentStudyItemIndex];
    const userAnswer = document.getElementById('study-quiz-textarea').value || "";

    document.getElementById('study-quiz-open').classList.add('hidden');
    document.getElementById('study-quiz-open').classList.remove('flex');

    const feedbackTitle = document.getElementById('study-quiz-feedback-title');
    const feedbackDesc = document.getElementById('study-quiz-feedback-desc');

    feedbackTitle.innerHTML = '<i data-lucide="info" class="text-indigo-500 w-5 h-5"></i> Verifica la tua risposta';
    feedbackTitle.className = "font-black mb-3 uppercase tracking-wider text-sm flex items-center justify-center gap-2 text-indigo-600";
    feedbackDesc.innerHTML = `<strong>Risposta di riferimento:</strong> ${item.correct}<br><br><strong>Spiegazione:</strong> ${item.explanation}`;

    document.getElementById('study-quiz-feedback').classList.remove('hidden');

    // Inizializza openAnswers se non esiste per sicurezza
    if (!window.studyResults.openAnswers) window.studyResults.openAnswers = [];
    window.studyResults.openAnswers.push({
        q: item.q,
        userAnswer: userAnswer,
        correctAnswer: item.correct,
        explanation: item.explanation
    });

    // Registra comunque nei mistakes per visualizzazione riassunto, ma taggato come risposta aperta
    window.studyResults.mistakes.push({
        q: item.q,
        userAnswer: userAnswer,
        correctAnswer: item.correct,
        explanation: item.explanation,
        isOpen: true
    });

    window.safeCreateIcons();
};

window.nextStudyItem = function (flashcardFeedback = null) {
    if (flashcardFeedback) {
        if (flashcardFeedback === 'easy') {
            window.studyResults.correct++;
        } else {
            const item = window.activeStudySessionItems[window.currentStudyItemIndex];
            window.studyResults.mistakes.push({
                q: item.front,
                correctAnswer: item.back,
                feedback: flashcardFeedback
            });
        }
    }

    window.currentStudyItemIndex++;
    if (window.currentStudyItemIndex < window.activeStudySessionItems.length) {
        window.renderCurrentStudyItem();
    } else {
        window.showStudySummary();
    }
};

window.addStudyScore = function () {
    try {
        if (!window.studyResults) return;

        const score = {
            title: window.activeStudySetTitle || (appState.db && appState.db.name) || "Set di Studio",
            correct: window.studyResults.correct,
            total: window.studyResults.total,
            type: window.studyResults.type || "Quiz",
            date: new Date().toISOString()
        };

        let scores = [];
        try {
            const raw = localStorage.getItem('mappai_study_scores');
            if (raw) scores = JSON.parse(raw);
        } catch (e) {
            console.error("Error reading study scores", e);
        }

        if (!Array.isArray(scores)) scores = [];

        // Add to the beginning (newest first)
        scores.unshift(score);

        // Keep at most 10
        if (scores.length > 10) {
            scores = scores.slice(0, 10);
        }

        localStorage.setItem('mappai_study_scores', JSON.stringify(scores));
        window.updateStudyScoresDisplay();
    } catch (err) {
        console.error("Error saving score to history", err);
    }
};

window.updateStudyScoresDisplay = function () {
    try {
        const container = document.getElementById('study-scores-container');
        if (!container) return;

        let scores = [];
        try {
            const raw = localStorage.getItem('mappai_study_scores');
            if (raw) scores = JSON.parse(raw);
        } catch (e) { }

        if (!Array.isArray(scores) || scores.length === 0) {
            container.innerHTML = `
                <p class="text-[14px] text-slate-400 italic" id="empty-scores-hint">Nessun punteggio registrato. Completa un quiz per iniziare!</p>
            `;
            return;
        }

        container.innerHTML = '';
        scores.forEach(s => {
            const dateStr = new Date(s.date).toLocaleDateString('it-IT', {
                day: '2-digit',
                month: '2-digit',
                hour: '2-digit',
                minute: '2-digit'
            });
            const percent = s.total > 0 ? Math.round((s.correct / s.total) * 100) : 0;

            // Color based on performance
            let bgClass = "bg-rose-50 border-rose-100 text-rose-700";
            let progressColor = "bg-rose-500";
            if (percent >= 80) {
                bgClass = "bg-emerald-50 border-emerald-100 text-emerald-700";
                progressColor = "bg-emerald-500";
            } else if (percent >= 50) {
                bgClass = "bg-amber-50 border-amber-100 text-amber-700";
                progressColor = "bg-amber-500";
            }

            const div = document.createElement('div');
            div.className = `p-2.5 rounded-lg border text-xs flex flex-col gap-1.5 bg-white shadow-sm`;
            div.innerHTML = `
                <div class="flex justify-between items-start">
                    <div class="font-bold text-slate-800 truncate max-w-[140px]" title="${s.title}">${s.title}</div>
                    <span class="px-1.5 py-0.5 rounded text-[9px] font-bold ${bgClass}">${s.correct}/${s.total} (${percent}%)</span>
                </div>
                <div class="w-full bg-slate-100 h-1 rounded-full overflow-hidden">
                    <div class="h-full ${progressColor}" style="width: ${percent}%"></div>
                </div>
                <div class="flex justify-between items-center text-[9px] text-slate-400">
                    <span>${s.type}</span>
                    <span>${dateStr}</span>
                </div>
            `;
            container.appendChild(div);
        });

        // Add a "Cancella storico" button at the end
        const clearDiv = document.createElement('div');
        clearDiv.className = "pt-2 flex justify-end";
        clearDiv.innerHTML = `
            <button onclick="window.clearStudyScores()" class="text-[9px] text-slate-400 hover:text-slate-600 flex items-center gap-1 font-semibold transition">
                <i data-lucide="trash-2" class="w-3 h-3"></i> Cancella Storico
            </button>
        `;
        container.appendChild(clearDiv);

        if (window.safeCreateIcons) window.safeCreateIcons();
    } catch (err) {
        console.error("Error displaying study scores", err);
    }
};

window.clearStudyScores = function () {
    if (confirm("Sei sicuro di voler cancellare tutto lo storico dei punteggi?")) {
        try {
            localStorage.removeItem('mappai_study_scores');
            window.updateStudyScoresDisplay();
            window.showToast("Storico cancellato", "info");
        } catch (e) {
            console.error("Error clearing scores", e);
        }
    }
};

window.autoSaveOpenQuizResponses = async function () {
    if (!window.studyResults || !window.studyResults.openAnswers || window.studyResults.openAnswers.length === 0) return;

    const nickname = appState.userProfile.nickname || "Studente Anonimo";
    const age = appState.userProfile.age || "-";
    const grade = appState.userProfile.grade || "-";
    const system = appState.userProfile.system || "-";
    const title = window.activeStudySetTitle || "Quiz Aperto";

    let txt = `=== RISPOSTE QUIZ APERTO: ${title} ===\n`;
    txt += `Data: ${new Date().toLocaleString()}\n`;
    txt += `Studente: ${nickname} (Età: ${age}, Classe: ${grade}, Sistema: ${system})\n`;
    txt += `--------------------------------------------------\n\n`;

    window.studyResults.openAnswers.forEach((ans, idx) => {
        txt += `[Tutor]: Domanda ${idx + 1}: ${ans.q}\n`;
        txt += `[Studente]: ${ans.userAnswer}\n`;
        txt += `Risposta di riferimento: ${ans.correctAnswer}\n`;
        if (ans.explanation) txt += `Spiegazione: ${ans.explanation}\n`;
        txt += `\n`;
    });

    txt += `--------------------------------------------------\n`;
    txt += `Fine della sessione di quiz aperto.\n`;

    try {
        if (window.electronAPI && window.electronAPI.saveQuizTextResponse) {
            await window.electronAPI.saveQuizTextResponse({
                title: title,
                textContent: txt,
                vaultPath: appState.activeVaultPath
            });
            window.showToast("Risposte salvate con successo nel tuo Vault!", "success");
        }
    } catch (e) {
        console.error("Errore durante il salvataggio automatico delle risposte del quiz aperto:", e);
    }
};

window.showStudySummary = function () {
    if (window.studyTimerInterval) clearInterval(window.studyTimerInterval);

    // Salva il punteggio nello storico
    window.addStudyScore();

    // Se ci sono risposte aperte, salvale automaticamente come file di chat .txt nel Vault
    if (window.studyResults && window.studyResults.openAnswers && window.studyResults.openAnswers.length > 0) {
        window.autoSaveOpenQuizResponses();
    }

    document.getElementById('study-flashcard-view').classList.add('hidden');
    document.getElementById('study-quiz-view').classList.add('hidden');
    document.getElementById('study-summary-view').classList.remove('hidden');
    document.getElementById('study-summary-view').classList.add('flex');

    const statsText = `Hai completato la sessione! Score: <b class="text-indigo-600">${window.studyResults.correct} / ${window.studyResults.total}</b>`;
    document.getElementById('study-summary-stats').innerHTML = statsText;

    const m = Math.floor(window.studySeconds / 60);
    const s = window.studySeconds % 60;
    document.getElementById('study-summary-time').innerText = `Tempo: ${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;

    const mistakesContainer = document.getElementById('study-summary-mistakes');
    mistakesContainer.innerHTML = '';

    if (window.studyResults.mistakes.length === 0) {
        mistakesContainer.innerHTML = '<p class="text-sm text-emerald-600 font-bold text-center py-4">Ottimo lavoro! Nessun errore rilevato. 🎉</p>';
    } else {
        window.studyResults.mistakes.forEach(m => {
            const div = document.createElement('div');
            div.className = "p-3 bg-white border border-slate-200 rounded-xl shadow-sm";
            div.innerHTML = `
                <p class="text-xs font-black text-slate-800 mb-1">${m.q}</p>
                <p class="text-[10px] text-red-500 mb-2"><b>Risposta Corretta:</b> ${m.correctAnswer}</p>
                ${m.explanation ? `<p class="text-[9px] text-slate-500 italic bg-slate-50 p-2 rounded border border-slate-100">${m.explanation}</p>` : ''}
            `;
            mistakesContainer.appendChild(div);
        });
    }
    window.safeCreateIcons();
};

window.saveStudyReport = async function () {
    const apiKey = window.getSystemKey();
    if (!appState.activeVaultPath) {
        window.showToast("Nessun Vault attivo. Collega o crea un Vault per salvare.", "warning");
        return;
    }

    window.showLoadingOverlay(true, "Salvataggio report nel Vault...");

    const m = Math.floor(window.studySeconds / 60);
    const s = window.studySeconds % 60;
    const timeStr = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;

    let reportText = `# Report Sessione di Studio\n`;
    reportText += `Data: ${new Date().toLocaleString()}\n`;
    reportText += `Modalità: ${window.studyResults.mode}\n`;
    reportText += `Tipo: ${window.studyResults.type}\n`;
    reportText += `Score: ${window.studyResults.correct} / ${window.studyResults.total}\n`;
    reportText += `Tempo Impiegato: ${timeStr}\n\n`;
    reportText += `## Analisi Errori / Ripasso\n\n`;

    if (window.studyResults.mistakes.length === 0) {
        reportText += "Nessun errore! Eccellente preparazione.\n";
    } else {
        window.studyResults.mistakes.forEach((m, idx) => {
            reportText += `### Errore ${idx + 1}\n`;
            reportText += `**Domanda:** ${m.q}\n`;
            reportText += `**Risposta Corretta:** ${m.correctAnswer}\n`;
            if (m.explanation) reportText += `**Spiegazione:** ${m.explanation}\n`;
            reportText += `\n---\n\n`;
        });
    }

    try {
        const projectName = appState.db.rootNodeLabel || "Progetto_Senza_Nome";
        const res = await window.electronAPI.saveChatTranscript({
            projectName: projectName,
            targetName: `Report_Studio_${window.studyResults.mode}`,
            textContent: reportText,
            vaultPath: appState.activeVaultPath,
            subFolder: 'Quiz e Flashcard'
        });

        if (res.success) {
            window.showToast("Report salvato con successo nel Vault!", "success");
        } else {
            throw new Error(res.error);
        }
    } catch (err) {
        window.showAlert("Errore Salvataggio", err.message);
    } finally {
        window.showLoadingOverlay(false);
    }
};
