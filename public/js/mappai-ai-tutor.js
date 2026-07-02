// ==========================================
// AI QUIZ E CHAT TUTOR (stateful, autosave) — estratto da app.js
// ==========================================
// Caricato DOPO app.js: appState e gli helper (window.* e bare) si risolvono
// a runtime via scope lessicale globale condiviso.
// ==========================================
// AI QUIZ E CHAT TUTOR
// ==========================================
let isSpeaking = false;
let currentQuizData = null;

window.openAIModal = function (titleText) {
    window.stopTTS();
    document.getElementById('tts-button').classList.add('hidden');
    document.getElementById('ai-modal-title').innerHTML = titleText;
    document.getElementById('ai-modal-body').innerHTML = `
                <div class="flex flex-col items-center justify-center py-16 space-y-4">
                    <i data-lucide="loader-2" class="w-12 h-12 animate-spin text-indigo-400"></i>
                    <p class="text-indigo-600 animate-pulse font-bold text-sm tracking-wide">MappAI sta elaborando le informazioni...</p>
                </div>
            `;
    window.safeCreateIcons();

    const aiModal = document.getElementById('ai-modal');
    const aiModalContentBox = document.getElementById('ai-modal-content-box');
    aiModal.classList.remove('hidden');
    setTimeout(() => {
        aiModal.classList.remove('opacity-0');
        aiModalContentBox.classList.remove('scale-95');
        aiModalContentBox.classList.add('scale-100');
    }, 10);
}

window.closeAIModal = function () {
    window.stopTTS();
    const aiModal = document.getElementById('ai-modal');
    const aiModalContentBox = document.getElementById('ai-modal-content-box');
    aiModal.classList.add('opacity-0');
    aiModalContentBox.classList.remove('scale-100');
    aiModalContentBox.classList.add('scale-95');
    setTimeout(() => { aiModal.classList.add('hidden'); }, 300);
}



// ==========================================
// AI TUTOR - STATEFUL CONVERSATIONS & AUTOSAVE
// ==========================================
let tutorState = {
    sidebar: {
        history: []
    },
    nodes: {} // Persist node chats: { nodeId: { phase: 'studio', turns: 0, history: [] } }
};

/**
 * Ritorna una copia deep-serializzabile di tutorState (solo scalari + array + oggetti plain).
 * Necessario prima di passare tutorState via Electron IPC (Structured Clone Algorithm):
 * se tutorState contiene Date, funzioni, riferimenti circolari o altri non-serializzabili
 * l'IPC lancia "An object could not be cloned" e il salvataggio vault fallisce silenziosamente.
 */
function serializeTutorState(state) {
    try {
        return JSON.parse(JSON.stringify(state));
    } catch (e) {
        console.warn('[MappAI] tutorState non serializzabile, uso fallback vuoto:', e);
        return { sidebar: { history: [] }, nodes: {} };
    }
}

window.parseSimpleMarkdown = function (text) {
    if (!text) return "";
    let html = text;
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');
    html = html.replace(/\n/g, '<br>');
    return html;
}

window.readTextAloud = function (btnElement, textToRead) {
    if (window.speechSynthesis.speaking) {
        window.speechSynthesis.cancel();
        btnElement.innerHTML = '<i data-lucide="volume-2" class="w-4 h-4"></i>';
        window.safeCreateIcons();
        return;
    }

    // Rimuovi tag HTML per la lettura
    let cleanText = stripHTML(textToRead);
    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.lang = 'it-IT';
    utterance.rate = 0.9;

    utterance.onstart = () => {
        btnElement.innerHTML = '<i data-lucide="square" class="w-4 h-4 text-red-500 fill-current"></i>';
        window.safeCreateIcons();
    };

    const onEnd = () => {
        btnElement.innerHTML = '<i data-lucide="volume-2" class="w-4 h-4"></i>';
        window.safeCreateIcons();
    };

    utterance.onend = onEnd;
    utterance.onerror = onEnd;

    window.speechSynthesis.speak(utterance);
}

window.saveTutorChatTranscript = async function (targetName, role, text) {
    if (!window.electronAPI) return;
    try {
        let projectName = appState.extractionMode === 'mindmap' ? 'Mappa' : 'KG';
        if (appState.db && appState.db.nodes && appState.db.nodes.length > 0) {
            projectName = appState.db.nodes[0].label;
        }

        let prefix = role === 'user' ? 'Studente' : 'Tutor';
        let cleanText = stripHTML(window.parseSimpleMarkdown(text)).replace(/<br>/g, '\n');
        let contentToSave = `[${prefix}]: ${cleanText}`;

        await window.electronAPI.saveChatTranscript({
            projectName: projectName,
            targetName: targetName,
            textContent: contentToSave,
            vaultPath: appState.activeVaultPath
        });
    } catch (e) {
        console.error("Errore salvataggio transcript:", e);
    }
}

window.resetSidebarTutor = function () {
    tutorState.sidebar.history = [];
    const chatHistory = document.getElementById('sidebar-tutor-chat-history');
    if (chatHistory) {
        const lang = appState.language || 'it';
        const firstMsg = lang === 'it' ?
            "Ciao! Sono il tuo Tutor AI globale. Come posso aiutarti a studiare questa mappa?" :
            "Hi! I'm your global AI Tutor. How can I help you study this map?";

        chatHistory.innerHTML = `
            <div class="bg-indigo-50 text-indigo-800 p-3 rounded-lg text-xs rounded-tl-none border border-indigo-100 self-start shadow-sm flex items-start gap-2">
                <div class="markdown-body flex-grow"><p>${firstMsg}</p></div>
                <button onclick="window.readTextAloud(this, \`${firstMsg.replace(/'/g, "\\'")}\`)" class="text-indigo-400 hover:text-indigo-600 shrink-0"><i data-lucide="volume-2" class="w-4 h-4"></i></button>
            </div>
        `;
        window.safeCreateIcons();
        window.saveTutorChatTranscript("sidebar", "model", (lang === 'it' ? "--- NUOVA SESSIONE GLOBALE ---\n" : "--- NEW GLOBAL SESSION ---\n") + firstMsg);
    }
}

window.sendSidebarTutorMessage = async function () {
    const inputEl = document.getElementById('ai-sidebar-input');
    const customQuery = inputEl.value.trim();
    if (!customQuery) return;

    inputEl.value = '';
    const chatHistory = document.getElementById('sidebar-tutor-chat-history');

    chatHistory.innerHTML += `
        <div class="bg-emerald-500 text-black p-3 rounded-lg text-xs rounded-tr-none border border-emerald-600 self-end shadow-sm max-w-[90%]">
            <p>${customQuery}</p>
        </div>
    `;
    const loaderId = 'loader-' + Date.now();
    chatHistory.innerHTML += `
        <div id="${loaderId}" class="text-indigo-500 self-start p-2">
            <i data-lucide="loader-2" class="w-5 h-5 animate-spin"></i>
        </div>
    `;
    window.safeCreateIcons();
    chatHistory.scrollTop = chatHistory.scrollHeight;

    if (tutorState.sidebar.history.length === 0) {
        let globalContext = "CONTESTO GLOBALE DELLA MAPPA:\n\n";
        appState.db.nodes.forEach(n => {
            globalContext += `- NODO [${n.label}]: ${stripHTML(n.desc || "")}\n`;
        });

        tutorState.sidebar.history.push({
            role: "user",
            parts: [{ text: `Contesto globale del progetto:\n${globalContext}\n\nDomanda dell'utente: ${customQuery}` }]
        });
    } else {
        tutorState.sidebar.history.push({
            role: "user",
            parts: [{ text: customQuery }]
        });
    }

    try {
        const apiKey = window.getSystemKey();
        const payload = {
            systemInstruction: { parts: [{ text: "Sei un Tutor per studenti. Hai accesso all'intero contesto del progetto dell'utente. Rispondi sempre in italiano, in modo didattico, conciso e incoraggiante. Usa formattazione HTML (<strong>, <p>, <ul>, <li>)." }] },
            contents: tutorState.sidebar.history
        };

        const data = await window.fetchModelAPI(payload, apiKey);
        if (!data || !data.candidates || data.candidates.length === 0) throw new Error("Risposta vuota");

        let rawText = data.candidates[0].content.parts[0].text || "";
        let resultHTML = rawText.split(MARKER_HTML).join('').split(MARKER_END).join('').trim();

        tutorState.sidebar.history.push({
            role: "model",
            parts: [{ text: rawText }]
        });

        // Update UI
        document.getElementById(loaderId).remove();
        let safeRawTextForBtn = rawText.replace(/'/g, "\\'").replace(/"/g, '&quot;');
        chatHistory.innerHTML += `
        <div class="bg-indigo-50 text-indigo-800 p-3 rounded-lg text-xs rounded-tl-none border border-indigo-100 self-start shadow-sm max-w-[90%] flex items-start gap-2">
            <div class="markdown-body flex-grow">${resultHTML}</div>
            <button onclick="window.readTextAloud(this, '${safeRawTextForBtn}')" class="text-indigo-400 hover:text-indigo-600 shrink-0"><i data-lucide="volume-2" class="w-4 h-4"></i></button>
        </div>
    `;
        window.safeCreateIcons();
        chatHistory.scrollTop = chatHistory.scrollHeight;

        window.saveTutorChatTranscript("sidebar", "user", customQuery);
        window.saveTutorChatTranscript("sidebar", "model", resultHTML);

    } catch (e) {
        console.error(e);
        document.getElementById(loaderId).remove();
        chatHistory.innerHTML += `<div class="text-red-500 text-xs text-center my-2">Errore di comunicazione con il Tutor. Riprova.</div>`;
        tutorState.sidebar.history.pop();
    }
}

window.resetNodeTutor = function () {
    if (!editTarget) return;
    delete tutorState.nodes[editTarget.id];

    // UI Update
    document.getElementById('node-tutor-start').classList.remove('hidden');
    document.getElementById('node-tutor-chat-area').classList.add('hidden');
    document.getElementById('node-tutor-chat-area').classList.remove('flex');
    document.getElementById('node-tutor-chat-history').innerHTML = '';

    window.showToast("Chat del nodo resettata.", "success");
    initD3Visualization(); // Update icons on graph
}

window.startNodeTutor = function () {
    if (!editTarget) return;

    document.getElementById('node-tutor-start').classList.add('hidden');
    document.getElementById('node-tutor-chat-area').classList.remove('hidden');
    document.getElementById('node-tutor-chat-area').classList.add('flex');

    const chatHistory = document.getElementById('node-tutor-chat-history');

    // Check for existing persistence
    if (!tutorState.nodes[editTarget.id]) {
        // Initialize new session for this node
        tutorState.nodes[editTarget.id] = {
            phase: null,
            turns: 0,
            history: []
        };

        const lang = appState.language || 'it';
        const firstMsg = lang === 'it' ?
            "Sei in fase di studio o di ragionamento?" :
            "Are you in the study or reasoning phase?";

        let safeRawTextForBtn = firstMsg.replace(/'/g, "\\'").replace(/"/g, '&quot;');
        chatHistory.innerHTML = `
            <div class="bg-indigo-50 text-indigo-800 p-3 rounded-lg text-xs rounded-tl-none border border-indigo-100 self-start shadow-sm max-w-[90%] flex items-start gap-2">
                <div class="markdown-body flex-grow"><p>${firstMsg}</p></div>
                <button onclick="window.readTextAloud(this, '${safeRawTextForBtn}')" class="text-indigo-400 hover:text-indigo-600 shrink-0"><i data-lucide="volume-2" class="w-3.5 h-3.5"></i></button>
            </div>
        `;
        window.safeCreateIcons();

        tutorState.nodes[editTarget.id].history.push({
            role: "model",
            parts: [{ text: firstMsg }]
        });

        window.saveTutorChatTranscript(`nodo_${editTarget.label}`, "model", (lang === 'it' ? "--- NUOVA SESSIONE NODO ---\n" : "--- NEW NODE SESSION ---\n") + firstMsg);
    } else {
        // Render existing persistent chat history
        chatHistory.innerHTML = '';
        tutorState.nodes[editTarget.id].history.forEach(msg => {
            let text = msg.parts[0].text;
            let resultHTML = window.parseSimpleMarkdown(text);
            let safeRawTextForBtn = text.replace(/'/g, "\\'").replace(/"/g, '&quot;');

            if (msg.role === 'user') {
                // remove context injection from rendering if present
                let visibleText = text;
                const splitKey = appState.language === 'en' ? "The user says:" : "L'utente dice:";
                if (text.includes(splitKey)) {
                    visibleText = text.split(splitKey)[1].trim();
                }
                chatHistory.innerHTML += `
                    <div class="bg-slate-800 text-white p-3 rounded-lg text-xs rounded-tr-none border border-slate-700 self-end shadow-sm max-w-[90%]">
                        <p>${visibleText}</p>
                    </div>
                `;
            } else {
                chatHistory.innerHTML += `
                    <div class="bg-indigo-50 text-indigo-800 p-3 rounded-lg text-xs rounded-tl-none border border-indigo-100 self-start shadow-sm max-w-[90%] flex items-start gap-2">
                        <div class="markdown-body flex-grow">${resultHTML}</div>
                        <button onclick="window.readTextAloud(this, '${safeRawTextForBtn}')" class="text-indigo-400 hover:text-indigo-600 shrink-0"><i data-lucide="volume-2" class="w-3.5 h-3.5"></i></button>
                    </div>
                `;
            }
        });
        window.safeCreateIcons();
        chatHistory.scrollTop = chatHistory.scrollHeight;
    }
}

window.sendNodeTutorMessage = async function () {
    if (!editTarget) return;
    const inputEl = document.getElementById('node-tutor-input');
    const customQuery = inputEl.value.trim();
    if (!customQuery) return;

    inputEl.value = '';
    const chatHistory = document.getElementById('node-tutor-chat-history');

    chatHistory.innerHTML += `
        <div class="bg-emerald-500 text-black p-3 rounded-lg text-xs rounded-tr-none border border-emerald-600 self-end shadow-sm max-w-[90%]">
            <p>${customQuery}</p>
        </div>
    `;
    const loaderId = 'loader-node-' + Date.now();
    chatHistory.innerHTML += `
        <div id="${loaderId}" class="text-indigo-500 self-start p-2"><i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i></div>
    `;
    window.safeCreateIcons();
    chatHistory.scrollTop = chatHistory.scrollHeight;

    let currentNodeState = tutorState.nodes[editTarget.id];
    if (!currentNodeState) return;

    if (currentNodeState.turns === 0 && !currentNodeState.phase) {
        const lowerQ = customQuery.toLowerCase();
        if (lowerQ.includes('studio')) currentNodeState.phase = 'studio';
        else if (lowerQ.includes('ragionamento')) currentNodeState.phase = 'ragionamento';
        else currentNodeState.phase = 'studio';
    }

    currentNodeState.turns++;

    let contextStr = `CONTESTO NODO [${editTarget.label}]: ${stripHTML(editTarget.desc || '')}\n`;
    if (editTarget.chunks && editTarget.chunks.length > 0) {
        contextStr += `FONTI/ESTRATTI DISPONIBILI:\n${editTarget.chunks.map((c, i) => `[Fonte ${i + 1}]: ${c}`).join('\n')}\n`;
    }

    const isKG = appState.extractionMode !== 'mindmap';

    if (!isKG) {
        let parentNode = appState.db.nodes.find(n => n.id === editTarget.parent);
        if (parentNode) contextStr += `APPARTIENE ALLA MACROAREA: ${parentNode.label}\n`;
    } else {
        let degreeCounts = {};
        appState.db.nodes.forEach(n => degreeCounts[n.id] = 0);
        appState.db.links.forEach(l => {
            const sid = typeof l.source === 'object' ? l.source.id : l.source;
            const tid = typeof l.target === 'object' ? l.target.id : l.target;
            if (degreeCounts[sid] !== undefined) degreeCounts[sid]++;
            if (degreeCounts[tid] !== undefined) degreeCounts[tid]++;
        });

        let superhubs = appState.db.nodes
            .map(n => ({ ...n, degree: degreeCounts[n.id] || 0 }))
            .filter(n => n.degree >= 2)
            .sort((a, b) => b.degree - a.degree);

        if (superhubs.length > 0 && superhubs[0].id !== editTarget.id) {
            contextStr += `SUPER-HUB PRINCIPALE DEL GRAFO: ${superhubs[0].label}\n`;
        }
    }

    const lang = appState.language || 'it';
    let instruction = "";

    let userProfileStr = "";
    if (appState.userProfile && appState.userProfile.nickname) {
        if (lang === 'it') {
            userProfileStr = ` L'utente è ${appState.userProfile.nickname}, ha ${appState.userProfile.age} anni, frequenta la classe ${appState.userProfile.grade} nel sistema: ${appState.userProfile.system}. Adatta rigorosamente la complessità didattica, il vocabolario e le domande a questo profilo cognitivo e curriculare. `;
        } else {
            userProfileStr = ` The user is ${appState.userProfile.nickname}, ${appState.userProfile.age} years old, attending grade ${appState.userProfile.grade}. Strictly adapt the pedagogical complexity, vocabulary, and questions to this cognitive and curricular profile. `;
        }
    }

    let phaseStr = "";
    if (lang === 'it') {
        if (currentNodeState.phase === 'studio') {
            phaseStr = currentNodeState.turns <= 3 ?
                "L'utente è in fase di STUDIO. Accogli la sua interazione con 1-2 frasi incoraggianti, e fagli una sola domanda facile per testare le basi." :
                "L'utente è in fase di STUDIO (Turno > 3). SWITCH SOCRATICO: poni UNA domanda mirata per sollecitarlo a rielaborare autonomamente.";
        } else {
            phaseStr = currentNodeState.turns <= 3 ?
                "L'utente è in fase di RAGIONAMENTO. Prendi l'iniziativa: fagli UNA singola domanda di ragionamento per valutare la sua comprensione." :
                "L'utente è in fase di RAGIONAMENTO (Turno > 3). Formula un breve feedback oggettivo. Proponi UNA singola pista di ragionamento alternativa.";
        }
    } else {
        if (currentNodeState.phase === 'studio') {
            phaseStr = currentNodeState.turns <= 3 ?
                "The user is in the STUDY phase. Welcome their interaction with 1-2 encouraging sentences, and ask only one easy question to test the basics." :
                "The user is in the STUDY phase (Turn > 3). SOCRATIC SWITCH: ask ONE targeted question to prompt them to re-elaborate independently.";
        } else {
            phaseStr = currentNodeState.turns <= 3 ?
                "The user is in the REASONING phase. Take the initiative: ask them ONE single reasoning question to assess their understanding." :
                "The user is in the REASONING phase (Turn > 3). Formulate brief objective feedback. Propose ONE single alternative reasoning path.";
        }
    }

    let kgStr = "";
    if (lang === 'it') {
        kgStr = !isKG ? " (Se utile, fai un breve cenno alla macro-area del nodo)." : " (Se utile, suggerisci brevemente un nesso verso un super-hub).";
    } else {
        kgStr = !isKG ? " (If useful, make a brief reference to the macro-area of the node)." : " (If useful, briefly suggest a connection to a super-hub).";
    }

    // Usa la variante semplificata per Infomaniak: i modelli più piccoli (Apertus)
    // non gestiscono prompt complessi con HTML e 5 regole di score → entrano in loop
    const isInfomaniakTutor = (appState.aiProvider === 'infomaniak');
    const tutorPromptKey = isInfomaniakTutor
        ? (lang === 'it' ? "SOCRATIC_TUTOR_INFOMANIAK_IT" : "SOCRATIC_TUTOR_INFOMANIAK_EN")
        : (lang === 'it' ? "SOCRATIC_TUTOR_IT" : "SOCRATIC_TUTOR_EN");
    instruction = window.fillPromptTemplate(tutorPromptKey, {
        userProfileProfile: userProfileStr,
        phaseInstruction: phaseStr,
        kgInstruction: kgStr
    });

    let apiQuery = customQuery;
    if (currentNodeState.turns === 1) {
        const prefix = appState.language === 'en' ? "The user says:" : "L'utente dice:";
        apiQuery = `${contextStr}\n\n${prefix} ${customQuery}`;
    }

    currentNodeState.history.push({ role: "user", parts: [{ text: apiQuery }] });

    try {
        const apiKey = window.getSystemKey();
        const payload = {
            systemInstruction: { parts: [{ text: instruction }] },
            contents: currentNodeState.history,
            // Limita i token per Infomaniak: risposte corte prevengono i loop
            ...(isInfomaniakTutor && { generationConfig: { maxOutputTokens: 400 } })
        };

        const data = await window.fetchModelAPI(payload, apiKey);
        if (!data || !data.candidates || data.candidates.length === 0) throw new Error("Risposta vuota");

        let rawText = data.candidates[0].content.parts[0].text || "";
        let resultHTML = window.parseSimpleMarkdown(rawText);
        let safeRawTextForBtn = rawText.replace(/'/g, "\\'").replace(/"/g, '&quot;');

        currentNodeState.history.push({ role: "model", parts: [{ text: rawText }] });

        document.getElementById(loaderId).remove();
        chatHistory.innerHTML += `
            <div class="bg-indigo-50 text-indigo-800 p-3 rounded-lg text-xs rounded-tl-none border border-indigo-100 self-start shadow-sm max-w-[90%] flex items-start gap-2">
                <div class="markdown-body flex-grow">${resultHTML}</div>
                <button onclick="window.readTextAloud(this, '${safeRawTextForBtn}')" class="text-indigo-400 hover:text-indigo-600 shrink-0"><i data-lucide="volume-2" class="w-3.5 h-3.5"></i></button>
            </div>
        `;
        window.safeCreateIcons();
        chatHistory.scrollTop = chatHistory.scrollHeight;

        window.saveTutorChatTranscript(`nodo_${editTarget.label}`, "user", customQuery);
        window.saveTutorChatTranscript(`nodo_${editTarget.label}`, "model", resultHTML);
        initD3Visualization();
    } catch (e) {
        console.error(e);
        document.getElementById(loaderId).remove();
        chatHistory.innerHTML += `<div class="text-red-500 text-xs text-center my-2">Errore di comunicazione.</div>`;
        currentNodeState.history.pop();
        currentNodeState.turns--;
    }
}

window.generateAIQuiz = async function () {
    if (!currentNode) return;

    const aModal = document.getElementById('ai-modal'), aBox = document.getElementById('ai-modal-content-box');
    document.getElementById('ai-modal-title').innerText = "Generazione Quiz in corso...";
    document.getElementById('ai-modal-body').innerHTML = `<div class="flex flex-col items-center justify-center p-10"><i data-lucide="loader-2" class="w-10 h-10 animate-spin text-emerald-500"></i><p class="mt-4 text-emerald-600 font-bold">L'AI sta preparando la tua domanda...</p></div>`;
    document.getElementById('tts-button').classList.add('hidden'); window.safeCreateIcons();

    aModal.classList.remove('hidden');
    setTimeout(() => { aModal.classList.remove('opacity-0'); aBox.classList.remove('scale-95'); }, 10);

    const prompt = window.fillPromptTemplate("SINGLE_QUIZ_TUTOR", {
        nodeLabel: cleanLabel(currentNode.label),
        nodeDesc: cleanLabel(currentNode.desc || currentNode.content)
    });

    try {
        const apiKey = window.getSystemKey();
        const schema = {
            type: "OBJECT",
            properties: {
                question: { type: "STRING" },
                options: { type: "ARRAY", items: { type: "STRING" } },
                correctIndex: { type: "INTEGER" },
                explanation: { type: "STRING" }
            },
            required: ["question", "options", "correctIndex", "explanation"]
        };

        const payload = {
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
                temperature: 0.7,
                responseMimeType: "application/json",
                responseSchema: schema
            }
        };

        const data = await window.fetchModelAPI(payload, apiKey);
        let rawText = data.candidates[0].content.parts[0].text || "";
        let cleanJson = rawText.split(MARKER_JSON).join('').split(MARKER_END).join('').trim();

        currentQuizData = salvageTruncatedJSON(cleanJson);

        document.getElementById('ai-modal-title').innerText = `Quiz: ${cleanLabel(currentNode.label)}`;
        renderQuizUI();

    } catch (e) {
        document.getElementById('ai-modal-body').innerHTML = `<p class="text-red-500 font-bold">Impossibile generare il quiz. Riprova più tardi.</p>`;
    }
}

function renderQuizUI() {
    if (!currentQuizData) return;
    const body = document.getElementById('ai-modal-body');

    let html = `
                <div class="mb-6">
                    <h3 class="text-lg font-bold text-slate-800 leading-snug">${currentQuizData.question}</h3>
                </div>
                <div class="space-y-3" id="quiz-options-container">
                    ${currentQuizData.options.map((opt, i) => `
                        <div class="quiz-option" onclick="window.selectQuizAnswer(${i})">
                            <span class="mr-2 inline-block w-6 text-center rounded bg-slate-200 text-slate-600">${String.fromCharCode(65 + i)}</span> ${opt}
                        </div>
                    `).join('')}
                </div>
                <div id="quiz-feedback" class="mt-6 hidden p-4 rounded-lg"></div>
            `;
    body.innerHTML = html;
}

window.selectQuizAnswer = function (selectedIndex) {
    const opts = document.querySelectorAll('.quiz-option');
    opts.forEach(o => o.onclick = null);

    const isCorrect = selectedIndex === currentQuizData.correctIndex;

    opts[selectedIndex].classList.add(isCorrect ? 'correct' : 'wrong');
    opts[currentQuizData.correctIndex].classList.add('correct');

    const feedback = document.getElementById('quiz-feedback');
    feedback.classList.remove('hidden');
    if (isCorrect) {
        feedback.classList.add('bg-emerald-50', 'border', 'border-emerald-200', 'text-emerald-800');
        feedback.innerHTML = `<h4 class="font-bold flex items-center gap-2"><i data-lucide="check-circle" class="w-5 h-5"></i> Esatto!</h4><p class="mt-2 text-sm">${currentQuizData.explanation}</p>`;
        if (currentNode && currentNode.studyStatus !== 'done') {
            currentNode.studyStatus = 'done';
            renderGraph();
        }
    } else {
        feedback.classList.add('bg-red-50', 'border', 'border-red-200', 'text-red-800');
        feedback.innerHTML = `<h4 class="font-bold flex items-center gap-2"><i data-lucide="x-circle" class="w-5 h-5"></i> Sbagliato</h4><p class="mt-2 text-sm">La risposta corretta era la <b>${String.fromCharCode(65 + currentQuizData.correctIndex)}</b>.<br><br>${currentQuizData.explanation}</p>`;
        if (currentNode && currentNode.studyStatus !== 'review' && currentNode.studyStatus !== 'todo') {
            currentNode.studyStatus = 'review';
            renderGraph();
        }
    }
    window.safeCreateIcons();
}
