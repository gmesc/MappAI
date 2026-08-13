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
    if (window.mappaiOccupato && window.mappaiOccupato()) return;
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
window.tutorState = tutorState; // reference condivisa per i moduli esterni

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

/**
 * Normalizza qualsiasi tutorState in ingresso alla shape corrente
 * { sidebar: { history: [] }, nodes: {} }. Vault vecchi o shape legacy
 * ({ messages, mode, ... }) non devono far crashare la chat.
 */
function normalizeTutorState(raw) {
    const base = { sidebar: { history: [] }, nodes: {} };
    if (!raw || typeof raw !== 'object') return base;
    if (raw.sidebar && Array.isArray(raw.sidebar.history)) {
        base.sidebar.history = raw.sidebar.history;
        if (raw.sidebar.mode) base.sidebar.mode = raw.sidebar.mode;
    }
    if (raw.nodes && typeof raw.nodes === 'object' && !Array.isArray(raw.nodes)) base.nodes = raw.nodes;
    return base;
}

/**
 * UNICO punto di rimpiazzo del tutorState. Va chiamato a OGNI cambio mappa,
 * anche con null: senza reset le chat della mappa precedente "sanguinano"
 * nella nuova (e finiscono salvate nel vault sbagliato → meta-analisi
 * contaminata tra studenti sulla stessa macchina).
 */
window.setTutorState = function (raw) {
    tutorState = normalizeTutorState(raw);
    window.tutorState = tutorState; // stessa reference per i moduli esterni (effort-view, meta-analisi)
    return tutorState;
};

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
            parts: [{ text: `Contesto globale del progetto:\n${globalContext}\n\nDomanda dell'utente: ${customQuery}` }],
            mode: tutorState.sidebar.mode || null
        });
    } else {
        tutorState.sidebar.history.push({
            role: "user",
            parts: [{ text: customQuery }],
            mode: tutorState.sidebar.mode || null
        });
    }

    try {
        const apiKey = window.getSystemKey();
        let sidebarSys = "Sei un Tutor per studenti. Hai accesso all'intero contesto del progetto dell'utente. Rispondi sempre in italiano, in modo didattico, conciso e incoraggiante. Usa formattazione HTML (<strong>, <p>, <ul>, <li>).";
        if (tutorState.sidebar.mode) {
            const mi = window.fillPromptTemplate('TUTOR_MODE_' + String(tutorState.sidebar.mode).toUpperCase(), {});
            if (mi) sidebarSys += ' ' + mi;
            // La modalità è già scelta dai chip: mai rispiegare il menu.
            const sLang = appState.language === 'en' ? 'en' : 'it';
            const sLabel = nodeTutorModeLabel(tutorState.sidebar.mode, sLang);
            sidebarSys += sLang === 'it'
                ? ` MODALITÀ ATTIVA: «${sLabel}» — già scelta dai pulsanti: NON elencare né rispiegare le modalità, applicala direttamente.`
                : ` ACTIVE MODE: "${sLabel}" — already picked via the buttons: do NOT list or re-explain the modes, apply it directly.`;
        }
        const payload = window.injectClassTuning({
            systemInstruction: { parts: [{ text: sidebarSys }] },
            // Strip del tag 'mode' (l'API vuole solo {role, parts}); resta nello storico per la meta-analisi.
            contents: tutorState.sidebar.history.map(m => ({ role: m.role, parts: m.parts }))
        });

        if (window.MappAIUsage) window.MappAIUsage.setContext('tutor', 'sidebar');
        const data = await window.fetchModelAPI(payload, apiKey);
        if (!data || !data.candidates || data.candidates.length === 0) throw new Error("Risposta vuota");

        let rawText = data.candidates[0].content.parts[0].text || "";
        let resultHTML = rawText.split(MARKER_HTML).join('').split(MARKER_END).join('').trim();

        tutorState.sidebar.history.push({
            role: "model",
            parts: [{ text: rawText }],
            mode: tutorState.sidebar.mode || null
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

    window.showToast(window.t('tst_chat_reset', "Chat del nodo resettata."), "success");
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
            mode: 'socratic',
            turns: 0,
            history: []
        };

        const lang = appState.language || 'it';
        // Il chip AVVIA la modalità (kickoff automatico): il saluto non chiede
        // più di "scrivere" — passa il mouse sui pulsanti per capire le differenze.
        const firstMsg = lang === 'it' ?
            "Ciao! Scegli una <strong>modalità</strong> qui sotto e parto io. Passa il mouse sui pulsanti per scoprire cosa fa ognuna." :
            "Hi! Pick a <strong>mode</strong> below and I'll start. Hover the buttons to see what each one does.";

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
                // strip del marcatore di modalità (solo per il modello, non per l'utente)
                visibleText = visibleText.replace(/^\[(MODALITÀ ATTIVA|ACTIVE MODE):[^\]]*\]\s*/, '');
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

    window.renderNodeTutorModes();
}

// Modalità di interazione della chat-nodo (system prompt TUTOR_MODE_* in prompts_config.json).
// tip*: descrizioni FISSE per i tooltip hover (MappAITips, data-tip) — coerenti coi template,
// così lo studente capisce la differenza PRIMA di scegliere (e il modello non le rispiega).
const NODE_TUTOR_MODES = [
    { id: 'socratic', it: 'Socratico', en: 'Socratic',
      tipIt: 'Non ti do le risposte: ti guido con una domanda alla volta, così ci arrivi da solo.',
      tipEn: "I don't give you answers: I guide you one question at a time, so you get there yourself." },
    { id: 'explain', it: 'Spiega tu', en: 'Explain it',
      tipIt: 'Spieghi TU il concetto con parole tue, come a un compagno: io ascolto e ti correggo.',
      tipEn: 'YOU explain the concept in your own words, like teaching a classmate: I listen and correct you.' },
    { id: 'ask', it: 'Interroga tu', en: 'You ask',
      tipIt: 'Le domande le fai TU: rispondo in breve e ti spingo verso domande sempre più profonde.',
      tipEn: 'YOU ask the questions: I answer briefly and push you toward deeper questions.' },
    { id: 'devil', it: 'Dubbio', en: 'Doubt',
      tipIt: 'Ti propongo un\'affermazione che sembra giusta ma è sbagliata: tu la smonti.',
      tipEn: 'I state something that sounds right but is wrong: you take it apart.' },
    { id: 'connect', it: 'Collega', en: 'Connect',
      tipIt: 'Colleghi questo concetto ad altri nodi della mappa, spiegando PERCHÉ sono legati.',
      tipEn: 'You link this concept to other nodes of the map, explaining WHY they are related.' },
    { id: 'recall', it: 'Ripasso', en: 'Recall',
      tipIt: 'Domande brevi a memoria, una alla volta, senza vedere prima la risposta.',
      tipEn: 'Short memory questions, one at a time, without seeing the answer first.' }
];
function nodeTutorModeLabel(modeId, lang) {
    const m = NODE_TUTOR_MODES.find(x => x.id === modeId);
    return m ? m[lang === 'en' ? 'en' : 'it'] : modeId;
}
window.renderNodeTutorModes = function () {
    const el = document.getElementById('node-tutor-modes');
    if (!el || !editTarget) return;
    const st = tutorState.nodes[editTarget.id];
    const cur = (st && st.mode) || 'socratic';
    const lang = appState.language === 'en' ? 'en' : 'it';
    el.innerHTML = NODE_TUTOR_MODES.map(m => {
        const active = m.id === cur;
        const tip = (lang === 'en' ? m.tipEn : m.tipIt).replace(/"/g, '&quot;');
        return `<button type="button" onclick="window.setNodeTutorMode('${m.id}')" data-tip="${tip}" class="text-[10px] px-2 py-1 rounded-full border transition-colors ${active ? 'bg-indigo-600 text-white border-indigo-600 font-bold' : 'bg-white text-slate-600 border-slate-300 hover:border-indigo-400'}">${m[lang]}</button>`;
    }).join('');
};
window.setNodeTutorMode = function (mode) {
    if (!editTarget) return;
    if (!tutorState.nodes[editTarget.id]) tutorState.nodes[editTarget.id] = { phase: null, mode: 'socratic', turns: 0, history: [] };
    const st = tutorState.nodes[editTarget.id];
    const changed = st.mode !== mode;
    st.mode = mode;
    window.renderNodeTutorModes();
    const lang = appState.language === 'en' ? 'en' : 'it';
    // Il chip AVVIA la modalità: parte un turno automatico se la modalità è
    // cambiata O se la chat non è ancora iniziata (turns===0 — copre il click
    // sul chip di default già attivo). Il modello riceve la scelta DENTRO la
    // conversazione (prima viveva solo nella UI → il tutor rispiegava il menu).
    const chatOpen = !document.getElementById('node-tutor-chat-area')?.classList.contains('hidden');
    if (chatOpen && st.history.length > 0 && (changed || st.turns === 0)) {
        const kickoff = lang === 'en'
            ? `Let's start in "${nodeTutorModeLabel(mode, 'en')}" mode.`
            : `Iniziamo in modalità «${nodeTutorModeLabel(mode, 'it')}».`;
        window.sendNodeTutorMessage(kickoff);
    } else if (window.showToast) {
        window.showToast((lang === 'en' ? 'Mode: ' : 'Modalità: ') + nodeTutorModeLabel(mode, lang), 'info');
    }
};

// Stesse modalità per il Tutor Globale (sidebar) + opzione "Libero" (default = comportamento attuale).
window.renderSidebarTutorModes = function () {
    const el = document.getElementById('sidebar-tutor-modes');
    if (!el) return;
    const cur = (tutorState.sidebar && tutorState.sidebar.mode) || null;
    const lang = appState.language === 'en' ? 'en' : 'it';
    const free = { id: null, it: 'Libero', en: 'Free', tipIt: 'Chat libera: chiedimi quello che vuoi sulla mappa.', tipEn: 'Free chat: ask me anything about the map.' };
    const list = [free].concat(NODE_TUTOR_MODES);
    el.innerHTML = list.map(m => {
        const active = (m.id || null) === cur;
        const tip = (lang === 'en' ? m.tipEn : m.tipIt).replace(/"/g, '&quot;');
        return `<button type="button" onclick="window.setSidebarTutorMode(${m.id ? "'" + m.id + "'" : 'null'})" data-tip="${tip}" class="text-[10px] px-2 py-1 rounded-full border transition-colors ${active ? 'bg-indigo-600 text-white border-indigo-600 font-bold' : 'bg-white text-slate-600 border-slate-300 hover:border-indigo-400'}">${m[lang]}</button>`;
    }).join('');
};
window.setSidebarTutorMode = function (mode) {
    if (!tutorState.sidebar) tutorState.sidebar = { history: [] };
    tutorState.sidebar.mode = mode || null;
    window.renderSidebarTutorModes();
    const m = NODE_TUTOR_MODES.find(x => x.id === mode);
    const lang = appState.language === 'en' ? 'en' : 'it';
    if (window.showToast) window.showToast((lang === 'en' ? 'Mode: ' : 'Modalità: ') + (m ? m[lang] : (lang === 'en' ? 'Free' : 'Libero')), 'info');
};
document.addEventListener('DOMContentLoaded', () => { try { window.renderSidebarTutorModes(); } catch (e) {} });

// presetText (opzionale): messaggio inviato programmaticamente (kickoff del chip
// modalità). Guard typeof: gli onclick chiamano senza argomenti o con l'Event.
window.sendNodeTutorMessage = async function (presetText) {
    if (!editTarget) return;
    const inputEl = document.getElementById('node-tutor-input');
    const customQuery = (typeof presetText === 'string' && presetText.trim())
        ? presetText.trim()
        : inputEl.value.trim();
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

    // Modalità di interazione (default 'socratic'). Sostituisce il vecchio switch studio/ragionamento.
    if (!currentNodeState.mode) currentNodeState.mode = 'socratic';

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

    // phaseInstruction = system prompt della modalità scelta (TUTOR_MODE_<MODE>_<lang> in prompts_config.json).
    const modeKey = 'TUTOR_MODE_' + String(currentNodeState.mode || 'socratic').toUpperCase();
    let phaseStr = window.fillPromptTemplate(modeKey, {});
    if (!phaseStr) {
        phaseStr = lang === 'it'
            ? "Guida lo studente con UNA domanda alla volta per farlo rielaborare da solo."
            : "Guide the student with ONE question at a time to help them re-elaborate on their own.";
    }
    // La modalità è GIÀ scelta dai chip: dichiararlo evita che il modello
    // rispieghi il menu o chieda di scegliere (il suo saluto nello storico
    // invitava a farlo — senza questa riga la conversazione vince sul prompt).
    const activeModeLabel = nodeTutorModeLabel(currentNodeState.mode || 'socratic', lang);
    phaseStr += lang === 'it'
        ? ` MODALITÀ ATTIVA: «${activeModeLabel}» — l'utente l'ha già scelta dai pulsanti. NON elencare né rispiegare le modalità, NON chiedere di sceglierne una: applicala direttamente da subito.`
        : ` ACTIVE MODE: "${activeModeLabel}" — the user already picked it via the buttons. Do NOT list or re-explain the modes, do NOT ask to choose one: apply it right away.`;

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
    // Marcatore di modalità nel turno: al primo messaggio e a ogni cambio chip
    // il modello vede la scelta DENTRO la conversazione, non solo nel prompt.
    if (currentNodeState._sentMode !== currentNodeState.mode) {
        const mkLabel = nodeTutorModeLabel(currentNodeState.mode, lang);
        apiQuery = (lang === 'it' ? `[MODALITÀ ATTIVA: ${mkLabel}]\n` : `[ACTIVE MODE: ${mkLabel}]\n`) + apiQuery;
        currentNodeState._sentMode = currentNodeState.mode;
    }

    currentNodeState.history.push({ role: "user", parts: [{ text: apiQuery }], mode: currentNodeState.mode });

    try {
        const apiKey = window.getSystemKey();
        const payload = window.injectClassTuning({
            systemInstruction: { parts: [{ text: instruction }] },
            // Strip del tag 'mode' (l'API accetta solo {role, parts}); il tag resta nello storico per la meta-analisi.
            contents: currentNodeState.history.map(m => ({ role: m.role, parts: m.parts })),
            // Limita i token per Infomaniak: risposte corte prevengono i loop
            ...(isInfomaniakTutor && { generationConfig: { maxOutputTokens: 400 } })
        });

        if (window.MappAIUsage) window.MappAIUsage.setContext('tutor', 'node');
        const data = await window.fetchModelAPI(payload, apiKey);
        if (!data || !data.candidates || data.candidates.length === 0) throw new Error("Risposta vuota");

        let rawText = data.candidates[0].content.parts[0].text || "";
        let resultHTML = window.parseSimpleMarkdown(rawText);
        let safeRawTextForBtn = rawText.replace(/'/g, "\\'").replace(/"/g, '&quot;');

        currentNodeState.history.push({ role: "model", parts: [{ text: rawText }], mode: currentNodeState.mode });

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

        const payload = window.injectClassTuning({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
                temperature: 0.7,
                responseMimeType: "application/json",
                responseSchema: schema
            }
        });

        if (window.MappAIUsage) window.MappAIUsage.setContext('tutor', 'quiz');
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
