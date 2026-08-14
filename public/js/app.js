// Safely Initialize Icons
let modalTextZoomLevel = 0;
window.safeCreateIcons = function () {
    if (typeof lucide !== 'undefined' && lucide.createIcons) {
        lucide.createIcons();
    }
    /* ⚠️ Qui c'era la conversione delle icone in emoji («stile Android»),
       pensionata il 13/8 su decisione di Giacomo: le icone dell'app sono SEMPRE
       Lucide SVG. Chi aveva scelto «Android» viene riportato indietro da
       `mappai-storage-lang.js` al boot — senza, resterebbe con le emoji e senza
       più il comando per tornare. */
};
window.safeCreateIcons();
// Secondary call to ensure all dynamic or hidden elements are caught
setTimeout(window.safeCreateIcons, 500);

let appState = {
    rootNodeLabel: "",
    extractionMode: "mindmap",
    layoutMode: "default",
    semanticGuidance: "",
    focusTopic: "",
    sources: [],
    db: {
        nodes: [],
        links: [],
        sourcesDict: {},
        customColors: {}
    },
    activeVaultPath: null,
    userProfile: {
        nickname: "",
        age: "",
        grade: "",
        system: "Ticino"
    },
    allProfiles: [],
    aiProvider: localStorage.getItem('ai_provider') || 'google',
    infomaniakProductId: localStorage.getItem('infomaniak_product_id') || '',
    studentMode: false,
    infomaniakAllModels: true,
    multiPassMode: true,
    generationPipeline: localStorage.getItem('mappai_generation_pipeline') || 'B'
};

// ==========================================
// MODALITÀ INFOMANIAK PRO (SECRET SEQUENCE)
// ==========================================
let studentModeKeys = [];
const studentModeSecret = ['l', 'k', 'j', 'h'];

let infomaniakProKeys = [];
const infomaniakProSecret = ['m', 'n', 'b', 'v'];

window.closeActiveModals = function () {
    const modals = [
        { id: 'config-ai-modal', close: () => window.closeConfigAIModal() },
        { id: 'user-profile-modal', close: () => window.closeUserProfileModal() },
        { id: 'app-guide-modal', close: () => window.closeAppGuide() },
        { id: 'app-tutorial-modal', close: () => window.closeAppTutorial() },
        { id: 'source-modal', close: () => window.closeSourceModal() },
        { id: 'ai-modal', close: () => window.closeAIModal() },
        { id: 'quiz-modal', close: () => window.closeQuizModal() },
        { id: 'study-config-modal', close: () => window.closeStudyConfigModal() },
        { id: 'study-player-modal', close: () => window.closeStudyPlayer() },
        { id: 'contextual-ai-extension-modal', close: () => window.closeContextualAIModal() },
        { id: 'vault-manager-modal', close: () => window.closeVaultManager() },
        { id: 'feedback-modal', close: () => window.closeFeedbackModal() },
        { id: 'validate-link-modal', close: () => window.closeValidateModal() },
        {
            id: 'api-tutorial-modal', close: () => {
                const m = document.getElementById('api-tutorial-modal');
                if (m) { m.classList.remove('flex'); m.classList.add('hidden'); }
            }
        },
        {
            id: 'merge-confirm-modal', close: () => {
                if (typeof window.cancelMerge === 'function') window.cancelMerge();
                else { const m = document.getElementById('merge-confirm-modal'); if (m) m.classList.add('hidden'); }
            }
        },
        {
            id: 'confirm-modal', close: () => {
                const m = document.getElementById('confirm-modal');
                if (m && !m.classList.contains('hidden')) {
                    const cancelBtn = document.getElementById('confirm-cancel');
                    if (cancelBtn) cancelBtn.click();
                    else m.classList.add('hidden');
                }
            }
        },
        { id: 'image-lightbox', close: () => window.closeLightbox() },
        {
            id: 'admin-dashboard', close: () => {
                if (typeof window.closeAdminDashboard === 'function') window.closeAdminDashboard();
                else { const m = document.getElementById('admin-dashboard'); if (m) m.classList.add('hidden'); }
            }
        }
    ];

    modals.forEach(m => {
        const el = document.getElementById(m.id);
        if (el && !el.classList.contains('hidden') && el.style.display !== 'none') {
            try {
                m.close();
            } catch (err) {
                console.error(`Error closing modal ${m.id}:`, err);
            }
        }
    });
};

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        const layoutModal = document.getElementById('layout-manager-modal');
        if (layoutModal && !layoutModal.classList.contains('hidden')) {
            window.showLayoutExitConfirmModal();
            return;
        }
        window.closeActiveModals();
    }
    if (e.ctrlKey && e.shiftKey) {
        const key = e.key.toLowerCase();

        /* L,K,J,H → VISTA RIDOTTA di COSTRUISCI (3/8/26).
           ⚠️ Fino a ieri questa combo accendeva la «modalità studente», che
           nascondeva il generatore INTERO (`#setup-form`) e sostituiva due
           prompt con le versioni semplificate. Le due cose non potevano
           convivere — si contendono lo stesso elemento, una lo nasconde e
           l'altra lo mostra ridotto. Decisione di Giacomo: la vista ridotta
           prende la combo, la modalità studente va in pensione.
           `window.toggleStudentMode` resta esposta (console); i rami
           `appState.studentMode` sparsi nei moduli restano innocui perché il
           flag non si accende più da nessuna parte. */
        if (studentModeSecret.includes(key)) {
            studentModeKeys.push(key);
            if (studentModeKeys.length > 4) studentModeKeys.shift();
            if (studentModeKeys.join('') === 'lkjh') {
                if (window.MappAIRidotta) window.MappAIRidotta.inverti();
                else window.toggleStudentMode();          // ripiego se il modulo manca
                studentModeKeys = [];
            }
        } else {
            studentModeKeys = [];
        }

        // Infomaniak Pro Mode Handler
        if (infomaniakProSecret.includes(key)) {
            infomaniakProKeys.push(key);
            if (infomaniakProKeys.length > 4) infomaniakProKeys.shift();
            if (infomaniakProKeys.join('') === 'mnbv') {
                window.toggleInfomaniakProMode();
                infomaniakProKeys = [];
            }
        } else {
            infomaniakProKeys = [];
        }
    } else {
        studentModeKeys = [];
        infomaniakProKeys = [];
    }
});

window.toggleInfomaniakProMode = function () {
    appState.infomaniakAllModels = !appState.infomaniakAllModels;
    const msg = appState.infomaniakAllModels ? "Modalità PRO (All Models) ATTIVATA" : "Modalità BETA (Google Models Only) ATTIVATA";
    window.showToast(msg, "success");
    // Refresh models if provider is Infomaniak
    if (appState.aiProvider === 'infomaniak' && window.refreshGeminiModels) {
        window.refreshGeminiModels();
    }
};

// Inizializzazione: ripristina il provider e il modello salvato
window.initializeAIProvider = function () {
    const provider = appState.aiProvider;
    const storageKey = provider === 'infomaniak' ? 'infomaniak_selected_model' : 'gemini_selected_model';
    const savedModel = localStorage.getItem(storageKey);
    const modelSelect = document.getElementById('model-select');

    // Aggiorna UI del provider
    window.switchAIProvider(provider);

    // Se c'è un modello salvato e il dropdown è già compilato, selezionalo
    if (savedModel && modelSelect && modelSelect.options.length > 0) {
        const option = Array.from(modelSelect.options).find(o => o.value === savedModel);
        if (option) {
            modelSelect.value = savedModel;
            console.log(`[Init] Modello ripristinato: ${savedModel} (${provider})`);
        }
    }
};

// Chiama l'inizializzazione non appena il DOM è pronto
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        if (typeof window.initializeAIProvider === 'function') {
            window.initializeAIProvider();
        }
    }, 100);
});

window.applyStudentModeUI = function () {
    const btnUrl = document.getElementById('btn-src-url');
    const btnYoutube = document.getElementById('btn-src-youtube');
    const btnAudio = document.getElementById('btn-src-audio');
    const btnVideo = document.getElementById('btn-src-video');

    const displayStyle = appState.studentMode ? 'none' : 'flex';

    if (btnUrl) btnUrl.style.display = displayStyle;
    if (btnYoutube) btnYoutube.style.display = displayStyle;
    if (btnAudio) btnAudio.style.display = displayStyle;
    if (btnVideo) btnVideo.style.display = displayStyle;

    const setupForm = document.getElementById('setup-form');
    if (setupForm) {
        if (appState.studentMode) {
            setupForm.classList.add('hidden');
        } else {
            setupForm.classList.remove('hidden');
        }
    }

    const sidebarTabTutor = document.getElementById('sidebar-tab-tutor');
    if (sidebarTabTutor) {
        if (appState.studentMode) {
            sidebarTabTutor.classList.add('hidden');
            const panelTutor = document.getElementById('sidebar-panel-tutor');
            if (panelTutor && !panelTutor.classList.contains('hidden')) {
                window.switchSidebarTab('structure');
            }
        } else {
            sidebarTabTutor.classList.remove('hidden');
        }
    }

    const btnFlashcards = document.getElementById('btn-generate-flashcards');
    const btnQuiz = document.getElementById('btn-generate-quiz');
    if (btnFlashcards) {
        if (appState.studentMode) {
            btnFlashcards.classList.add('hidden');
        } else {
            btnFlashcards.classList.remove('hidden');
        }
    }
    if (btnQuiz) {
        if (appState.studentMode) {
            btnQuiz.classList.add('hidden');
        } else {
            btnQuiz.classList.remove('hidden');
        }
    }
};

window.toggleStudentMode = function () {
    appState.studentMode = !appState.studentMode;
    // Mostra/Nascondi il setup-form e btn-config-ai in base allo stato
    const setupForm = document.getElementById('setup-form');
    const btnConfig = document.getElementById('btn-config-ai');

    if (appState.studentMode) {
        if (setupForm) setupForm.classList.add('hidden');
        if (btnConfig) btnConfig.classList.add('hidden');
        window.showToast(window.t('tst_gen_locked', "Generatore BLOCCATO! Modalità Studente attiva."), "info");
    } else {
        if (setupForm) setupForm.classList.remove('hidden');
        if (btnConfig) btnConfig.classList.remove('hidden');
        window.showToast(window.t('tst_gen_unlocked', "Generatore SBLOCCATO! Sezione 1 limitata a Documenti e Testo."), "success");
    }

    window.applyStudentModeUI();
};

window.setMultiPassMode = function (enabled, silent) {
    appState.multiPassMode = enabled;

    const btnOff = document.getElementById('multipass-off');
    const btnOn = document.getElementById('multipass-on');

    if (btnOff && btnOn) {
        if (enabled) {
            btnOn.classList.add('bg-white', 'shadow-sm', 'text-indigo-600');
            btnOn.classList.remove('text-slate-400', 'hover:text-slate-600');
            btnOff.classList.remove('bg-white', 'shadow-sm', 'text-slate-700');
            btnOff.classList.add('text-slate-400', 'hover:text-slate-600');
        } else {
            btnOff.classList.add('bg-white', 'shadow-sm', 'text-slate-700');
            btnOff.classList.remove('text-slate-400', 'hover:text-slate-600');
            btnOn.classList.remove('bg-white', 'shadow-sm', 'text-indigo-600');
            btnOn.classList.add('text-slate-400', 'hover:text-slate-600');
        }
    }

    if (!silent) window.showToast(enabled ? window.t('tst_multipass_on', "Generazione Multi-Pass (HD) ATTIVATA") : window.t('tst_multipass_off', "Generazione Multi-Pass DISATTIVATA"), "info");
};

// ==========================================
// PIPELINE A/B SELECTION
// ==========================================
window.setPipeline = function (pipelineMode, silent) {
    const validModes = ['A', 'B'];
    if (!validModes.includes(pipelineMode)) {
        console.error('Invalid pipeline mode. Use A or B.');
        return;
    }

    appState.generationPipeline = pipelineMode;
    localStorage.setItem('mappai_generation_pipeline', pipelineMode);
    // Toggle A/B = scelta della LOGICA KG: A = BERT Community · B = MappAI classico (default).
    localStorage.setItem('mappai_kg_community_mode', pipelineMode === 'A' ? 'true' : 'false');

    const btnA = document.getElementById('pipeline-a-btn');
    const btnB = document.getElementById('pipeline-b-btn');
    const pipelineDesc = document.getElementById('pipeline-desc');

    if (btnA && btnB) {
        if (pipelineMode === 'A') {
            btnA.classList.add('bg-white', 'shadow-sm', 'text-indigo-600');
            btnA.classList.remove('text-slate-500', 'hover:text-slate-700');
            btnB.classList.remove('bg-white', 'shadow-sm', 'text-slate-700');
            btnB.classList.add('text-slate-500', 'hover:text-slate-700');
        } else {
            btnB.classList.add('bg-white', 'shadow-sm', 'text-indigo-600');
            btnB.classList.remove('text-slate-500', 'hover:text-slate-700');
            btnA.classList.remove('bg-white', 'shadow-sm', 'text-indigo-600');
            btnA.classList.add('text-slate-500', 'hover:text-slate-700');
        }
    }

    const descriptions = {
        'A': 'KG: BERT Community (hub + comunità GraphRAG)',
        'B': 'KG: MappAI classico (single/multi-pass)'
    };

    if (pipelineDesc) {
        pipelineDesc.textContent = descriptions[pipelineMode] || 'Scegli la logica di generazione KG';
    }

    if (!silent) window.showToast(`Logica KG ${pipelineMode === 'A' ? 'A · BERT Community' : 'B · MappAI classico'}`, "info");
};

// Toggle "logica MM": 'mappai' (classico, default) | 'triage' (pre-pass di triage
// adattivo — profondità del deepening dal TIPO di scheda, vedi mappai-mm-triage.js).
// Riusa il vecchio bottone "BERT" (morto): guida il flag DEDICATO
// `mappai_mm_triage_enabled` — NON riusa lo swap prompt L1_MACRO_CATEGORIES_BERT.
window.setMMLogic = function (logic, silent) {
    const mode = logic === 'triage' ? 'triage' : 'mappai';
    localStorage.setItem('mappai_mm_logic', mode);
    localStorage.setItem('mappai_mm_triage_enabled', mode === 'triage' ? '1' : '0');
    const btnM = document.getElementById('mmlogic-mappai-btn');
    const btnB = document.getElementById('mmlogic-bert-btn');
    if (btnM && btnB) {
        const on = ['bg-white', 'shadow-sm', 'text-indigo-600'];
        const off = ['text-slate-500', 'hover:text-slate-700'];
        const sel = mode === 'mappai' ? btnM : btnB, oth = mode === 'mappai' ? btnB : btnM;
        sel.classList.add(...on); sel.classList.remove(...off);
        oth.classList.remove(...on); oth.classList.add(...off);
    }
    if (!silent && typeof window.showToast === 'function') window.showToast(`Logica MM: ${mode === 'mappai' ? 'MappAI (classico)' : 'Adattiva (triage)'}`, 'info');
};
window.getMMLogic = function () { return localStorage.getItem('mappai_mm_triage_enabled') === '1' ? 'triage' : 'mappai'; };

window.getPipeline = function () {
    return appState.generationPipeline || localStorage.getItem('mappai_generation_pipeline') || 'B';
};

/**
 * Vocabolario tipizzato per il campo "rel" nei Knowledge Graph.
 * Usato come enum nello schema JSON (Google: enforcement nativo).
 * Su Infomaniak lo schema non viene enforced, ma il vocabolario è comunque
 * iniettato nel testo del prompt (VOCABOLARIO RELAZIONI nel template).
 * Allineato al template KNOWLEDGE_GRAPH_SINGLE_IT.
 */
// GENERATO dalla tassonomia (mappai-relations.js): enum e prompt offrono
// SEMPRE lo stesso vocabolario. Prima erano due liste separate: il prompt
// proponeva verbi (es. "smaschera") che lo schema Google poi bloccava.
function _kgRelEnumFor(langs) {
    const R = window.MappAIRelations;
    const out = [];
    langs.forEach(l => Object.keys(R.EDGE_FAMILIES).forEach(k => {
        if (k !== 'altro') out.push(...R.getFamilyVerbs(k, l));
    }));
    return out;
}
const KG_REL_ENUM = _kgRelEnumFor(['it']);
// Versione lingua-mappe: 'en' → verbi inglesi, 'auto' → doppio vocabolario
window.getKgRelEnum = function () {
    const m = (typeof window.getMapLanguage === 'function') ? window.getMapLanguage() : 'it';
    if (m === 'auto') return _kgRelEnumFor(['it', 'en']);
    return _kgRelEnumFor([m === 'en' ? 'en' : 'it']);
};

// ── Lente Relazioni — famiglie semantiche ──────────────────────────────────
// Palette daltonismo-safe (no rosso/verde puri). Ogni famiglia ha:
//   color    : valore HSL del link/outline attivo
//   colorBtn : variante più scura per colorare il bottone TESTO
//   label    : nome leggibile nel menu
//   icon     : icona Lucide
// EDGE_FAMILIES estratto in mappai-relations.js (caricato PRIMA di app.js).
// Vedi docs/rules/07-relations-taxonomy.md
const EDGE_FAMILIES = window.MappAIRelations.EDGE_FAMILIES;

// REL_FAMILY_MAP + getEdgeFamilyKey estratti in mappai-relations.js (caricato PRIMA di app.js).
// Vedi docs/rules/07-relations-taxonomy.md
const REL_FAMILY_MAP = window.MappAIRelations.REL_FAMILY_MAP;
window.getEdgeFamilyKey = window.MappAIRelations.getEdgeFamilyKey;

// Restituisce le famiglie presenti nella mappa corrente (dinamico)
window.getActiveFamiliesInMap = function () {
    const links = appState.db?.links || [];
    const found = new Set();
    links.forEach(l => found.add(window.getEdgeFamilyKey(l.rel)));
    // ordine canonico delle famiglie definite, poi 'altro' in fondo
    const order = Object.keys(EDGE_FAMILIES);
    return order.filter(k => found.has(k));
};

// Stato corrente della lente (null = spenta)
window.activeLensFamily = null;

// Modalità visibilità link: 'all' | 'hierarchy' | 'cross'
// 'all'       → tutti i link visibili (cross-link con stile dashed esistente)
// 'hierarchy' → solo gerarchia (parent-child stesso group), nasconde cross-link
// 'cross'     → solo cross-link, nasconde gerarchia (vista reticolare)
window.linkVisibilityMode = localStorage.getItem('mappai_link_vis_mode') || 'all';

window.updateInfomaniakProductId = function (value) {
    const val = value ? value.trim() : "";
    localStorage.setItem('infomaniak_product_id', val);
    appState.infomaniakProductId = val;
}
// Gestore per il cambio di modello nel dropdown — salva in localStorage
window.onModelSelectChange = function (selectedModel) {
    const storageKey = appState.aiProvider === 'infomaniak' ? 'infomaniak_selected_model' : 'gemini_selected_model';
    localStorage.setItem(storageKey, selectedModel);
    console.log(`[Modello] Salvato: ${selectedModel} (${appState.aiProvider})`);

    // Aggiorna le capability del modello
    if (typeof updateModelCapabilities === 'function') {
        updateModelCapabilities();
    }
};

window.switchAIProvider = function (provider) {
    appState.aiProvider = provider;
    localStorage.setItem('ai_provider', provider);

    // Ripristina il modello salvato per questo provider dal localStorage
    const modelSelect = document.getElementById('model-select');
    const storageKey = provider === 'infomaniak' ? 'infomaniak_selected_model' : 'gemini_selected_model';
    const savedModel = localStorage.getItem(storageKey);
    if (modelSelect && savedModel) {
        // Se il modello salvato è già nel dropdown, selezionalo
        const option = Array.from(modelSelect.options).find(o => o.value === savedModel);
        if (option) modelSelect.value = savedModel;
    }

    const btnGoogle = document.getElementById('provider-google');
    const btnInfomaniak = document.getElementById('provider-infomaniak');
    const geminiFields = document.getElementById('gemini-api-key-container');
    const infomaniakFields = document.getElementById('infomaniak-api-key-container');

    if (!btnGoogle || !btnInfomaniak) return;

    if (provider === 'google') {
        btnGoogle.classList.add('bg-white', 'shadow-sm', 'text-indigo-600');
        btnGoogle.classList.remove('text-slate-500');
        btnInfomaniak.classList.remove('bg-white', 'shadow-sm', 'text-indigo-600');
        btnInfomaniak.classList.add('text-slate-500');

        if (geminiFields) geminiFields.classList.remove('hidden');
        if (infomaniakFields) infomaniakFields.classList.add('hidden');
    } else {
        btnInfomaniak.classList.add('bg-white', 'shadow-sm', 'text-indigo-600');
        btnInfomaniak.classList.remove('text-slate-500');
        btnGoogle.classList.remove('bg-white', 'shadow-sm', 'text-indigo-600');
        btnGoogle.classList.add('text-slate-500');

        if (geminiFields) geminiFields.classList.add('hidden');
        if (infomaniakFields) infomaniakFields.classList.remove('hidden');
    }

    // Add visual 'active' checkmark indicator to provider buttons
    if (provider === 'google') {
        btnGoogle.innerHTML = '✅ Google Gemini';
        btnInfomaniak.innerHTML = 'Infomaniak (CH)';
    } else {
        btnInfomaniak.innerHTML = '✅ Infomaniak (CH)';
        btnGoogle.innerHTML = 'Google Gemini';
    }

    if (window.refreshGeminiModels) window.refreshGeminiModels();
    if (window.updateProviderInfo) window.updateProviderInfo(provider);
};

window.showAPITutorial = function (provider) {
    const targetProvider = provider || appState.aiProvider;
    let url = "https://aistudio.google.com/app/apikey";
    if (targetProvider === 'infomaniak') {
        url = "https://manager.infomaniak.com/v3/ng/profile/token/api";
    }

    if (window.electronAPI && window.electronAPI.openExternal) {
        window.electronAPI.openExternal(url);
    } else {
        window.open(url, '_blank');
    }
};

window.updateProviderInfo = function (provider) {
    const content = document.getElementById('provider-info-content');
    if (!content) return;

    const isEn = window.currentLanguage === 'en';

    if (provider === 'google') {
        content.innerHTML = isEn ? `
            <p><strong>🎯 Target:</strong> Recommended for <strong>High School, University students or Professors</strong>.</p>
            <p><strong>🚀 Performance:</strong> Massive token window (up to 2M), no timeout, and generates high levels of detail.</p>
            <p class="text-[10px] text-slate-400 italic mt-1">Includes Free (15 req/min) and Pay-as-you-go tiers.</p>
        ` : `
            <p><strong>🎯 Target:</strong> Consigliato per studenti <strong>Liceali, Universitari o Professori</strong>.</p>
            <p><strong>🚀 Performance:</strong> Enorme finestra di token (fino a 2M), nessun timeout e generazione di enormi quantità di dettagli.</p>
            <p class="text-[10px] text-slate-400 italic mt-1">Include piano Gratuito (15 req/min) e Pay-as-you-go.</p>
        `;
    } else {
        content.innerHTML = isEn ? `
            <p><strong>🎯 Target:</strong> Exceptional for <strong>Middle School</strong> students.</p>
            <p><strong>⚖️ Balance:</strong> Smaller input/output but fast and effective responses for basic learning.</p>
            <p class="text-[10px] text-slate-400 italic mt-1">Powered by secure Swiss infrastructure.</p>
        ` : `
            <p><strong>🎯 Target:</strong> Eccezionale per studenti delle <strong>Scuole Medie</strong>.</p>
            <p><strong>⚖️ Bilanciamento:</strong> Input/Output più ridotti ma risposte veloci ed efficaci per l'apprendimento di base.</p>
            <p class="text-[10px] text-slate-400 italic mt-1">Servizio basato su infrastruttura svizzera sicura.</p>
        `;
    }
};

const MARKER_JSON = String.fromCharCode(96, 96, 96) + 'json';
const MARKER_HTML = String.fromCharCode(96, 96, 96) + 'html';
const MARKER_END = String.fromCharCode(96, 96, 96);

/* UTILITIES E UI MODALS CUSTOM + MODEL_KB → estratto in js/mappai-ui-modals.js (caricato dopo app.js) */

/* ==========================================
   APP.JS - Logica, Stato e Chiamate Gemini Iterative
   ========================================== */

if (typeof pdfjsLib !== 'undefined') {
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.worker.min.js';
} else {
    console.warn("pdfjsLib non caricato correttamente. L'estrazione da PDF potrebbe non funzionare.");
}

window.extractTextFromPDF = async function (file) {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let fullText = "";
    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        fullText += content.items.map(item => item.str).join(" ") + "\n";
    }
    return fullText;
};



window.getSystemKey = function () {
    const isInfomaniak = (appState.aiProvider === 'infomaniak');
    const inputId = isInfomaniak ? 'infomaniak-api-key-input' : 'gemini-api-key-input';
    const storageKey = isInfomaniak ? 'infomaniak_api_key' : 'gemini_api_key';

    const inputEl = document.getElementById(inputId);
    let key = inputEl ? inputEl.value.trim() : "";
    if (!key || key === "") {
        key = (window.secureKeys && window.secureKeys[storageKey]) || localStorage.getItem(storageKey) || "";
    }
    return key;
};

// Chiave API di UN provider specifico (non solo l'attivo) — serve al toggle
// provider per-attività del Tutor QR. Stessa fonte di getSystemKey.
window.getProviderKey = function (provider) {
    const isInfo = (provider === 'infomaniak');
    const inputId = isInfo ? 'infomaniak-api-key-input' : 'gemini-api-key-input';
    const storageKey = isInfo ? 'infomaniak_api_key' : 'gemini_api_key';
    const inputEl = document.getElementById(inputId);
    let key = inputEl ? inputEl.value.trim() : "";
    if (!key) key = (window.secureKeys && window.secureKeys[storageKey]) || localStorage.getItem(storageKey) || "";
    return key;
};

// Etichetta leggibile del provider (badge trasparenza: dove passano i dati).
window.aiProviderLabel = function (p) {
    return p === 'infomaniak' ? '🇨🇭 Infomaniak (Svizzera)' : 'Google (Gemini)';
};

// Provider con credenziali configurate (offri il toggle solo se ce n'è più d'uno).
window.aiProvidersAvailable = function () {
    const out = [];
    if (window.getProviderKey('google')) out.push('google');
    if (window.getProviderKey('infomaniak')) out.push('infomaniak');
    return out;
};

// Restituisce il maxOutputTokens ottimale per il modello attivo.
// Modelli verbosi (Qwen/Kimi su Infomaniak, Gemini 2.5/3.x) producono
// output più lunghi — scala il budget per evitare troncamenti.
window.getMaxOutputTokens = function (baseTokens) {
    // Guard: baseTokens undefined/NaN → NaN si serializza come null nel payload
    // → null = nessun limite → thinking illimitato su gemini-2.5. Default: 4096.
    if (!baseTokens || typeof baseTokens !== 'number' || isNaN(baseTokens)) baseTokens = 4096;
    const modelEl = document.getElementById('model-select');
    // Fallback a localStorage: il DOM può essere null durante le fasi async
    // del multi-pass (loop rami, Phase4, Phase5) → il modello non viene rilevato
    // → moltiplicatori ignorati → budget troppo piccolo → troncamenti.
    // Stesso pattern già usato in fetchModelAPI.
    const storageKey = (appState.aiProvider === 'infomaniak') ? 'infomaniak_selected_model' : 'gemini_selected_model';
    const model = ((modelEl ? modelEl.value : '') || localStorage.getItem(storageKey) || '').toLowerCase();
    if (appState.aiProvider === 'infomaniak') {
        if (model.includes('qwen') || model.includes('kimi') || model.includes('moonshot')) {
            return Math.max(baseTokens, 16384);
        }
        // Mistral Small è verboso nelle espansioni di ramo (L3-L5 lunghi) →
        // porta il budget a 8192 per evitare troncamenti e JSON parziali.
        if (model.includes('mistral') || model.includes('mixtral')) {
            return Math.max(baseTokens, 8192);
        }
        return baseTokens;
    }
    // Gemini 2.5+ e 3.x sono più verbosi nelle descrizioni e nei chunk —
    // raddoppia il budget, cap 16384, per evitare "Unexpected end of JSON".
    if (model.includes('gemini-2.5') || model.includes('gemini-3')) {
        return Math.min(baseTokens * 2, 16384);
    }
    return baseTokens;
};

// ──────────────────────────────────────────────────────────────────────────
// Tracker troncamenti (Strategia 0 — rilevamento finishReason)
// ──────────────────────────────────────────────────────────────────────────
// Ogni chiamata fetchModelAPI registra qui:
//   { ts, model, provider, finishReason, truncated, maxOutputTokens,
//     promptTokens, candidateTokens, requestedMax }
// Il flag `truncated:true` viene impostato quando finishReason indica
// limite raggiunto (MAX_TOKENS / length). Viene RESETTATO all'inizio di
// ogni generazione (vedi resetVaultState / inizio di extract*).
window.MappAITruncationTracker = {
    events: [],            // tutti gli eventi della sessione (cumulativo)
    currentRun: [],        // solo la generazione corrente
    reset: function() {
        if (this.currentRun.length) {
            // archivia il run precedente prima di azzerare
            this.events.push(...this.currentRun);
        }
        this.currentRun = [];
    },
    record: function(evt) {
        evt.ts = Date.now();
        this.currentRun.push(evt);
        if (evt.truncated) {
            console.warn(
                `%c⚠️ Troncamento rilevato`,
                'color:orange;font-weight:bold',
                `model=${evt.model} finishReason=${evt.finishReason} ` +
                `out=${evt.candidateTokens}/${evt.requestedMax}tok`
            );
        }
    },
    summary: function(runOnly = true) {
        const src = runOnly ? this.currentRun : [...this.events, ...this.currentRun];
        const total = src.length;
        const truncated = src.filter(e => e.truncated).length;
        return {
            calls: total,
            truncated,
            truncationRate: total ? Number((truncated / total).toFixed(3)) : 0,
            byModel: src.reduce((acc, e) => {
                if (!acc[e.model]) acc[e.model] = { calls: 0, truncated: 0 };
                acc[e.model].calls++;
                if (e.truncated) acc[e.model].truncated++;
                return acc;
            }, {})
        };
    }
};

// Estrae finishReason dalla response (sia Gemini nativo sia bridge Infomaniak)
function _detectTruncation(response) {
    const candidate = response?.candidates?.[0];
    const finishReason = candidate?.finishReason || null;
    // Gemini: "MAX_TOKENS" — Infomaniak/OpenAI: "length"
    const truncated = finishReason === 'MAX_TOKENS' || finishReason === 'length';
    return { finishReason, truncated };
}

window.fetchModelAPI = async function (payload, apiKey) {
    const modelEl = document.getElementById('model-select');
    let model = modelEl ? modelEl.value : null;
    if (!model) {
        const storageKey = (appState.aiProvider === 'infomaniak') ? 'infomaniak_selected_model' : 'gemini_selected_model';
        model = localStorage.getItem(storageKey);
    }
    if (!model) {
        model = (appState.aiProvider === 'google' ? 'gemini-2.0-flash' : 'mistral-small-4-119B-2603');
    }

    // ── Gemini 2.5+: disabilita il thinking per fasi con budget ridotto ─────────
    // Il thinking mode genera token interni PRIMA della risposta: consumano il
    // budget silenziosamente anche per Phase 4/5 che usano output testuale (no
    // responseMimeType). Rilevato: Phase 4 con 3842 token di thinking / 4000 budget
    // → output 158 token (troncato). Stessa patologia su Phase 5 e Phase 1.5.
    //
    // SOGLIA 12288 (era 8192):
    // - Fasi MindMap (budget 3000-8192): thinking disabilitato ✓
    // - KG Community (budget ~16000 con ×2 su base 8000): thinking preservato ✓
    //   (run 9/6: 38 nodi, 29 relTypes, 47.7% cross-links — qualità dipende dal thinking)
    //
    // CONDIZIONE responseMimeType RIMOSSA: Phase 4/5/1.5 usano output testuale
    // (===MERGES===, ===RECLASSIFY===, array JSON raw) → non hanno responseMimeType
    // ma subiscono comunque il problema thinking. La condizione li escludeva.
    const _gcfg = payload?.generationConfig || {};
    if (appState.aiProvider === 'google' &&
        (model || '').toLowerCase().match(/gemini-2\.5|gemini-3/) &&
        (_gcfg.maxOutputTokens || 0) > 0 &&
        (_gcfg.maxOutputTokens || 0) <= 12288) {
        payload = {
            ...payload,
            generationConfig: { ..._gcfg, thinkingConfig: { thinkingBudget: 0 } }
        };
    }

    // Budget tokens richiesto (per diagnosticare se siamo vicini al cap)
    const requestedMax = payload?.generationConfig?.maxOutputTokens || null;

    // Registro consumi: snapshot del contesto ALL'ENTRATA (non dopo l'await:
    // un altro flusso potrebbe cambiare il contesto mentre la risposta arriva)
    const _usageCtx = (window.MappAIUsage && window.MappAIUsage.current()) || null;

    if (window.electronAPI) {
        try {
            let response;
            if (appState.aiProvider === 'infomaniak') {
                const productId = document.getElementById('infomaniak-product-id')?.value || appState.infomaniakProductId;
                if (!productId) throw new Error("Inserisci il Product ID di Infomaniak nel Setup.");

                // Salva Product ID per persistenza
                localStorage.setItem('infomaniak_product_id', productId);
                appState.infomaniakProductId = productId;

                // Translate payload using bridge
                const translatedPayload = window.InfomaniakBridge.translatePayload(payload, model);
                const rawResponse = await window.electronAPI.generateInfomaniak({ apiKey, payload: translatedPayload, productId });

                // Translate back to Gemini format for app compatibility
                response = window.InfomaniakBridge.translateResponse(rawResponse);
            } else {
                // Rimuove i marker interni (_respectTemp e altri "_"-prefissi) da
                // generationConfig prima dell'invio a Google: l'API Gemini rifiuta i campi
                // sconosciuti (400). Qui a monte → copre sia il path IPC Electron sia il
                // polyfill browser/Capacitor di storageAdapter (che NON strippa).
                let gPayload = payload;
                const _g = payload && payload.generationConfig;
                if (_g && Object.keys(_g).some(k => k[0] === '_')) {
                    const gc = {}; for (const k of Object.keys(_g)) { if (k[0] !== '_') gc[k] = _g[k]; }
                    gPayload = { ...payload, generationConfig: gc };
                }
                response = await window.electronAPI.generateGemini({ apiKey, payload: gPayload, model });
            }

            // Tracking Usage
            if (response && response.usageMetadata) {
                if (!appState.generationUsage) appState.generationUsage = { promptTokens: 0, candidateTokens: 0, totalTokens: 0 };
                appState.generationUsage.promptTokens += (response.usageMetadata.promptTokenCount || 0);
                appState.generationUsage.candidateTokens += (response.usageMetadata.candidatesTokenCount || 0);
                appState.generationUsage.totalTokens += (response.usageMetadata.totalTokenCount || 0);
                window.updateCostDisplay();
                // Registro consumi AI (riga JSONL su disco, categoria dal contesto)
                if (window.MappAIUsage) window.MappAIUsage.record({
                    provider: appState.aiProvider,
                    model,
                    inTok: response.usageMetadata.promptTokenCount || 0,
                    outTok: response.usageMetadata.candidatesTokenCount || 0,
                    ctx: _usageCtx
                });
            }

            // Strategia 0 — rilevamento troncamento finishReason
            const { finishReason, truncated } = _detectTruncation(response);
            window.MappAITruncationTracker.record({
                model,
                provider: appState.aiProvider,
                finishReason,
                truncated,
                requestedMax,
                promptTokens: response?.usageMetadata?.promptTokenCount || 0,
                candidateTokens: response?.usageMetadata?.candidatesTokenCount || 0
            });
            // Annota il flag sulla response così salvageTruncatedJSON
            // può loggare con contesto se il parse fallisce.
            if (response && typeof response === 'object') {
                response._mappaiTruncated = truncated;
                response._mappaiFinishReason = finishReason;
            }

            return response;
        } catch (error) {
            throw new Error(`Errore Electron IPC API: ${error.message}`);
        }
    } else {
        throw new Error("Electron API non disponibile. L'app non è avviata come Desktop App.");
    }
}

window.updateCostDisplay = function () {
    if (!appState.generationUsage) return;

    const modelEl = document.getElementById('model-select');
    const modelId = modelEl ? modelEl.value : '';
    const kb = matchModelKB(modelId);

    let promptPrice = 0.10 / 1000000;
    let candidatePrice = 0.40 / 1000000;

    if (kb) {
        promptPrice = kb.inputCost / 1000000;
        candidatePrice = kb.outputCost / 1000000;
    }

    const cost = (appState.generationUsage.promptTokens * promptPrice) + (appState.generationUsage.candidateTokens * candidatePrice);
    const isInfomaniak = (appState.aiProvider === 'infomaniak');

    const costEl = document.getElementById('total-cost-display');
    const tokenEl = document.getElementById('total-tokens-display');

    if (costEl) {
        if (isInfomaniak) {
            costEl.textContent = cost.toFixed(4) + ' CHF';
        } else {
            const costInCents = cost * 100;
            costEl.textContent = costInCents.toFixed(2) + ' ¢';
        }
    }
    if (tokenEl) tokenEl.textContent = appState.generationUsage.totalTokens.toLocaleString();
    const usedModelEl = document.getElementById('used-model-display');
    if (usedModelEl && appState.generationUsage.usedModel) usedModelEl.textContent = appState.generationUsage.usedModel;
};

window.updateTokenCounter = function () {
    if (window.updateTokenCostEstimator) {
        window.updateTokenCostEstimator();
    }
};

window.updateTokenCostEstimator = function () {
    const modelSelect = document.getElementById('model-select');
    const tokensValEl = document.getElementById('estimator-tokens');
    const costValEl = document.getElementById('estimator-cost');
    const progressEl = document.getElementById('estimator-progress');
    if (!tokensValEl || !costValEl || !progressEl) return;

    const selectedModel = modelSelect ? modelSelect.value : '';
    if (!selectedModel) {
        tokensValEl.textContent = '0 / -- token';
        costValEl.textContent = '--';
        progressEl.style.width = '0%';
        return;
    }

    // 1. Get model specs
    const kb = matchModelKB(selectedModel) || { free: true, inputCost: 0, outputCost: 0 };

    // Determine context window
    let maxContext = 1048576; // Default to 1M
    const modelIdLower = selectedModel.toLowerCase();

    if (appState.aiProvider === 'infomaniak') {
        if (modelIdLower.includes('apertus')) {
            maxContext = 65536;        // Apertus-70B: 65K
        } else if (modelIdLower.includes('gemma')) {
            maxContext = 100000;       // Gemma 4 31B: 100K
        } else if (modelIdLower.includes('qwen')) {
            maxContext = 200000;       // Qwen3.5-122B: 200K
        } else if (modelIdLower.includes('kimi') || modelIdLower.includes('moonshot')) {
            maxContext = 256000;       // Kimi-K2.6: 256K
        } else if (modelIdLower.includes('llama-3') || modelIdLower.includes('mixtral') || modelIdLower.includes('mistral')) {
            maxContext = 32768;
        } else {
            maxContext = 32768;        // fallback conservativo
        }
    } else {
        if (modelIdLower.includes('gemma')) {
            maxContext = 8192;
        } else if (modelIdLower.includes('pro')) {
            maxContext = 2097152; // 2M
        } else if (modelIdLower.includes('flash')) {
            maxContext = 1048576; // 1M
        }
    }

    // 2. Count input tokens
    let totalChars = 0;
    // Sum contents from textarea sources
    const textareas = document.querySelectorAll('.landing-textarea');
    textareas.forEach(ta => {
        totalChars += ta.value.length;
    });
    // Sum contents from appState (extracted files/urls)
    if (appState.sources) {
        appState.sources.forEach(s => {
            if (s.content) totalChars += s.content.length;
        });
    }
    const inputTokens = Math.ceil(totalChars / 4);

    // 3. Estimate output tokens based on MM or KG and depth/branches/nodes
    const mode = document.getElementById('extraction-mode')?.value || 'mindmap';
    let outputTokens = 0;
    if (mode === 'mindmap') {
        // Slider «Densità Diramazioni» rimosso dalla UI (era inerte in multi-pass,
        // confondibile con la profondità). Stima nodi su una costante di riferimento.
        const branchesVal = 4;
        // MM formula: N_nodes = 20 + maxBranches * 5
        const nNodes = 20 + branchesVal * 5;
        outputTokens = nNodes * 120;
    } else {
        const kgNodesVal = parseInt(document.getElementById('kg-nodes-slider')?.value || '20', 10);
        // KG formula: N_nodes = kgNodes
        outputTokens = kgNodesVal * 150;
    }

    // 4. Calculate cost in cents
    let costDisplay = '';
    const isFree = kb.free || (kb.inputCost === 0 && kb.outputCost === 0);
    const lang = window.currentLanguage || 'it';
    const t = (lang === 'en' ? (typeof en_translations !== 'undefined' ? en_translations : {}) : (typeof it_translations !== 'undefined' ? it_translations : {}));
    const freeText = t.estimator_free || (lang === 'en' ? 'Free (Free Tier)' : 'Gratuito (Piano Free)');

    if (isFree) {
        costDisplay = freeText;
    } else {
        // Cost per 1M tokens * (tokens / 1M) -> cost in dollars * 100 -> cost in cents
        const inputCostDollars = (inputTokens / 1000000) * kb.inputCost;
        const outputCostDollars = (outputTokens / 1000000) * kb.outputCost;
        const totalCostCents = (inputCostDollars + outputCostDollars) * 100;

        if (totalCostCents < 0.01) {
            costDisplay = `<0.01 ¢`;
        } else {
            costDisplay = `${totalCostCents.toFixed(2)} ¢`;
        }
    }

    // 5. Update UI
    tokensValEl.textContent = `${inputTokens.toLocaleString()} / ${maxContext.toLocaleString()} token`;
    costValEl.textContent = costDisplay;

    // Progress bar calculation
    const progressPercent = Math.min((inputTokens / maxContext) * 100, 100);
    progressEl.style.width = `${progressPercent}%`;

    // Colors: green (<50%), yellow (50-80%), red (>80%)
    progressEl.className = 'h-full transition-all duration-500 rounded-full';
    if (progressPercent < 50) {
        progressEl.classList.add('bg-emerald-500');
    } else if (progressPercent < 80) {
        progressEl.classList.add('bg-amber-500');
    } else {
        progressEl.classList.add('bg-rose-500');
    }
};

// Auto-update counter when typing in textareas
document.addEventListener('input', (e) => {
    if (e.target.classList.contains('landing-textarea')) {
        window.updateTokenCounter();
    }
});

window.addSource = function (type) {
    if (!appState.sources) appState.sources = [];
    const container = document.getElementById('sources-container');
    const id = 'source_' + Math.random().toString(36).substr(2, 9);

    let inputHtml = '';
    let titleHtml = '';

    if (type === 'pdf') {
        titleHtml = '<i data-lucide="file-text" class="w-4 h-4 text-emerald-400"></i> File PDF';
        inputHtml = '<input type="file" accept=".pdf" class="landing-input shadow-none mb-1 text-sm file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-emerald-50 file:text-emerald-700 hover:file:bg-emerald-100 cursor-pointer" data-source-id="' + id + '" onchange="window.handlePDFUpload(this)"><p class="text-[10px] text-slate-400">Il testo verrà estratto localmente prima dell\'analisi AI.</p>';
    } else if (type === 'audio') {
        titleHtml = '<i data-lucide="mic" class="w-4 h-4 text-amber-400"></i> File Audio';
        inputHtml = '<input type="file" multiple accept="audio/*" class="landing-input shadow-none mb-1 text-sm file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-amber-50 file:text-amber-700 hover:file:bg-amber-100 cursor-pointer" data-source-id="' + id + '" onchange="window.handleFileUpload(this, \'audio\')"><p class="text-[10px] text-slate-400">MP3, WAV, AAC... MappAI ascolterà il file.</p>';
    } else if (type === 'video') {
        titleHtml = '<i data-lucide="video" class="w-4 h-4 text-rose-400"></i> File Video';
        inputHtml = '<input type="file" multiple accept="video/*" class="landing-input shadow-none mb-1 text-sm file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-rose-50 file:text-rose-700 hover:file:bg-rose-100 cursor-pointer" data-source-id="' + id + '" onchange="window.handleFileUpload(this, \'video\')"><p class="text-[10px] text-slate-400">MP4, MOV, WEBM... MappAI vedrà il file.</p>';
    } else if (type === 'url') {
        titleHtml = '<i data-lucide="link" class="w-4 h-4 text-sky-400"></i> Link Web';
        inputHtml = '<input type="url" placeholder="https://..." class="landing-input shadow-none mb-1 text-sm" data-source-id="' + id + '" onblur="window.handleUrlBlur(this)"><p class="text-[10px] text-slate-400">MappAI analizzerà i contenuti della pagina web.</p>';
    } else if (type === 'youtube') {
        titleHtml = '<i data-lucide="youtube" class="w-4 h-4 text-red-400"></i> Video YouTube';
        inputHtml = '<input type="url" placeholder="https://youtube.com/watch?v=..." class="landing-input shadow-none mb-1 text-sm" data-source-id="' + id + '" onblur="window.handleUrlBlur(this)"><p class="text-[10px] text-slate-400">MappAI estrarrà i contenuti audio/visivi del video.</p>';
    } else if (type === 'text') {
        titleHtml = '<i data-lucide="type" class="w-4 h-4 text-amber-400"></i> Testo Libero';
        inputHtml = '<textarea placeholder="Incolla qui i tuoi appunti..." class="landing-input landing-textarea text-sm" data-source-id="' + id + '"></textarea>';
    } else if (type === 'doc') {
        titleHtml = '<i data-lucide="file-spreadsheet" class="w-4 h-4 text-indigo-400"></i> Documenti (.pdf, .txt, .csv, .md)';
        inputHtml = '<input type="file" multiple accept=".pdf,.txt,.csv,.md,.rtf" class="landing-input shadow-none mb-1 text-sm file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100 cursor-pointer" data-source-id="' + id + '" onchange="window.handleFileUpload(this, \'doc\')"><p class="text-[10px] text-slate-400">Tutti i formati testuali sono supportati (PDF incluso).</p>';
    }

    const html = '<div id="' + id + '" class="source-entry flex items-start gap-3 relative"><div class="flex-grow"><div class="flex items-center gap-2 mb-2 font-bold text-sm text-white">' + titleHtml + '</div>' + inputHtml + '</div><button type="button" onclick="window.removeSource(\'' + id + '\')" class="text-indigo-400 hover:text-red-400 transition-colors mt-1 p-1"><i data-lucide="trash-2" class="w-4 h-4"></i></button></div>';

    container.insertAdjacentHTML('beforeend', html);
    window.safeCreateIcons();
    appState.sources.push({ id, type, content: '', file: null });

    // Auto Focus
    setTimeout(() => {
        const el = document.getElementById(id);
        if (el) {
            const inp = el.querySelector('input, textarea');
            if (inp) inp.focus();
        }
    }, 50);
}

window.handleUrlBlur = function (input) {
    const url = input.value.trim();
    if (!url) return;
    try {
        const u = new URL(url);
        let name = u.hostname.replace('www.', '');
        if (u.pathname && u.pathname !== '/') {
            name += ' - ' + u.pathname.split('/').pop();
        }
        window.handleSourceAutofill(name);
    } catch (e) { }
}

window.handleSourceAutofill = function (name) {
    // autofill nome file disabilitato
}

window.removeSource = function (id) {
    if (appState.sources) appState.sources = appState.sources.filter(s => s.id !== id);
    document.getElementById(id).remove();
}

window.handlePDFUpload = async function (input) {
    var file = input.files[0];
    if (!file) return;
    var sourceObj = appState.sources.find(function (s) { return s.id === input.dataset.sourceId; });
    if (!sourceObj) return;
    sourceObj.file = file;

    var statusEl = document.getElementById('status-' + input.dataset.sourceId);
    if (!statusEl) {
        statusEl = document.createElement('p');
        statusEl.className = 'text-[10px] text-emerald-400 mt-1';
        statusEl.id = 'status-' + input.dataset.sourceId;
        input.parentNode.appendChild(statusEl);
    }

    var sizeMB = (file.size / (1024 * 1024)).toFixed(1);
    statusEl.innerHTML = '<i data-lucide="loader-2" class="w-3 h-3 inline animate-spin"></i> Estrazione testo in corso...';

    try {
        const text = await window.extractTextFromPDF(file);
        sourceObj.content = text;
        statusEl.innerHTML = '<i data-lucide="check" class="w-3 h-3 inline"></i> PDF pronto (' + sizeMB + ' MB).';
        window.updateTokenCounter();
    } catch (e) {
        statusEl.innerHTML = '<i data-lucide="alert-circle" class="w-3 h-3 inline text-red-400"></i> Errore estrazione.';
    }

    window.safeCreateIcons();
    window.handleSourceAutofill(file.name);
}

window.processSourceFile = async function (sourceObj, file, statusEl) {
    if (!file || !sourceObj || !statusEl) return;

    const fileName = file.name.toLowerCase();
    const sizeMB = (file.size / (1024 * 1024)).toFixed(1);

    statusEl.innerHTML = '<i data-lucide="loader-2" class="w-3 h-3 inline animate-spin"></i> Lettura file...';

    try {
        let text = "";
        if (fileName.endsWith('.pdf')) {
            text = await window.extractTextFromPDF(file);
        } else if (fileName.endsWith('.txt') || fileName.endsWith('.md') || fileName.endsWith('.csv') || fileName.endsWith('.rtf')) {
            text = await file.text();
        }

        if (text) {
            sourceObj.content = text;
            statusEl.innerHTML = `<i data-lucide="check" class="w-3 h-3 inline"></i> ${file.name} (${sizeMB} MB) pronto.`;
            window.updateTokenCounter();
        } else {
            statusEl.innerHTML = `<i data-lucide="check" class="w-3 h-3 inline"></i> ${file.name} (${sizeMB} MB) caricato.`;
        }
    } catch (e) {
        console.error("Errore lettura file:", e);
        statusEl.innerHTML = `<i data-lucide="alert-circle" class="w-3 h-3 inline text-red-400"></i> Errore lettura.`;
    }
    window.safeCreateIcons();
};

window.handleFileUpload = async function (input, type) {
    if (!input.files || input.files.length === 0) return;

    var firstFile = input.files[0];
    var sourceObj = appState.sources.find(function (s) { return s.id === input.dataset.sourceId; });
    if (!sourceObj) return;

    sourceObj.file = firstFile;
    sourceObj.path = (window.electronAPI && window.electronAPI.getPathForFile) ? window.electronAPI.getPathForFile(firstFile) : firstFile.path;
    sourceObj.mimeType = firstFile.type;

    var statusEl = document.getElementById('status-' + input.dataset.sourceId);
    if (!statusEl) {
        statusEl = document.createElement('p');
        statusEl.className = 'text-[10px] text-emerald-400 mt-1 font-bold';
        statusEl.id = 'status-' + input.dataset.sourceId;
        input.parentNode.appendChild(statusEl);
    }

    input.style.display = 'none';
    window.handleSourceAutofill(firstFile.name);
    await window.processSourceFile(sourceObj, firstFile, statusEl);

    if (input.files.length > 1) {
        for (let i = 1; i < input.files.length; i++) {
            let extraFile = input.files[i];
            window.addSource(type);
            let newSourceObj = appState.sources[appState.sources.length - 1];
            let newId = newSourceObj.id;

            newSourceObj.file = extraFile;
            newSourceObj.path = (window.electronAPI && window.electronAPI.getPathForFile) ? window.electronAPI.getPathForFile(extraFile) : extraFile.path;
            newSourceObj.mimeType = extraFile.type;

            setTimeout(async () => {
                let newContainer = document.getElementById(newId);
                if (newContainer) {
                    let newStatusEl = document.createElement('p');
                    newStatusEl.className = 'text-[10px] text-emerald-400 mt-1 font-bold';
                    newStatusEl.id = 'status-' + newId;

                    let inputDiv = newContainer.querySelector('.flex-grow');
                    if (inputDiv) inputDiv.appendChild(newStatusEl);

                    let inp = newContainer.querySelector('input[type="file"]');
                    if (inp) inp.style.display = 'none';
                    window.handleSourceAutofill(extraFile.name);

                    await window.processSourceFile(newSourceObj, extraFile, newStatusEl);
                }
            }, 50);
        }
    }
    window.safeCreateIcons();
}

window.startGeneration = async function () {
    /* ⚠️ Una generazione alla volta (13/8). La pipeline dei materiali lavora
       con l'app navigabile: se da un'altra sezione partisse una seconda
       generazione, cambierebbe `appState` sotto i piedi della prima. Lo step A
       della pipeline passa di qui, ed è per questo che il lucchetto ha una
       chiave interna (`Pipeline._interno`). */
    if (window.mappaiOccupato && window.mappaiOccupato()) return;
    // Contesto di generazione (29/7): classe + disciplina. Con una classe attiva
    // che insegna 2+ discipline il docente sceglie PRIMA di spendere token; con
    // una sola (o nessuna) la funzione risolve da sé e non mostra nulla.
    // La disciplina governa la cartella del vault (Mappe/<classe>/<disciplina>/).
    appState.generationDiscipline = '';
    try {
        if (window.MappAIClasses && window.MappAIClasses.ensureGenerationContext) {
            const genCtx = await window.MappAIClasses.ensureGenerationContext();
            if (!genCtx) return;                       // annullato dal docente
            appState.generationDiscipline = genCtx.discipline || '';
        }
    } catch (e) { console.warn('[Generation] contesto classe/disciplina non risolto:', e && e.message); }
    // Toggle «Adatta al livello» (Costruisci): arma la riga livello per questa
    // generazione (e per i successivi Espandi/sotto-concetti della sessione).
    if (window.MappAITune) {
        const lt = document.getElementById('level-tune-toggle');
        window.MappAITune.levelArmed = !!(lt && lt.checked && !lt.disabled);
    }
    // Bollino «Progetti esistenti» (19/7): marca QUESTA mappa come «generazione
    // tarata» se la taratura livello è attiva. Persiste nello snapshot appState
    // (sopravvive a load/reload); letto da saveCurrentProject → pMeta.tuned.
    try { appState.generationTuned = !!(window.MappAITune && window.MappAITune.levelArmed); } catch (e) { }
    // ========== PIPELINE A/B SELECTION ==========
    const activePipeline = window.getPipeline();
    appState.generationPipeline = activePipeline;
    console.log(`[Generation Start] Pipeline: ${activePipeline} | Provider: ${appState.aiProvider} | Mode: ${appState.extractionMode}`);

    const isInfomaniak = (appState.aiProvider === 'infomaniak');
    const inputId = isInfomaniak ? 'infomaniak-api-key-input' : 'gemini-api-key-input';
    const storageKey = isInfomaniak ? 'infomaniak_api_key' : 'gemini_api_key';

    const inputKey = document.getElementById(inputId) ? document.getElementById(inputId).value.trim() : "";

    if (inputKey !== "") {
        if (window.saveSecureKey) {
            window.saveSecureKey(storageKey, inputKey);
        } else {
            localStorage.setItem(storageKey, inputKey);
        }
    }

    const apiKey = window.getSystemKey();
    if (!apiKey) {
        window.showToast(window.t('tst_need_api_key', "Inserisci un'API Key AI per continuare."), "error"); return;
    }
    var rootName = document.getElementById('root-node-name')?.value.trim();
    appState.extractionMode = document.getElementById('extraction-mode').value;

    if (appState.extractionMode === 'mindmap' && !rootName) {
        window.showToast(window.t('tst_need_root', "Inserisci il nome del nodo centrale per la mappa."), "error");
        return;
    }
    // Per KG: rootName opzionale — se vuoto, usa focus-input o nome primo PDF come titolo
    if (appState.extractionMode !== 'mindmap' && !rootName) {
        const focusVal = document.getElementById('focus-input')?.value.trim();
        if (focusVal) {
            rootName = focusVal;
        } else {
            // Ultimo fallback: nome del primo file caricato
            const firstSrc = appState.sources && appState.sources[0];
            if (firstSrc && firstSrc.file && firstSrc.file.name) {
                rootName = window.MappAIFilesCore
                    ? window.MappAIFilesCore.titoloDaFile(firstSrc.file.name, '')
                    : firstSrc.file.name.replace(/\.[^/.]+$/, '').replace(/[_-]/g, ' ');
            } else {
                rootName = '';
            }
        }
    }

    /* ── IL TITOLO È ANCHE IL NOME DELLA CARTELLA (14/8) ──────────────────
       `vaultFolderName` costruisce la cartella del vault dal titolo, quindi il
       titolo non può portare ciò che una cartella non ammette — e da un PDF
       nasceva un progetto «Il Clima.pdf», con la cartella chiamata così. La
       ripulitura vale per ENTRAMBE le modalità e anche per il titolo SCRITTO A
       MANO: chi incolla il nome del file nel campo non deve pagare un prezzo
       diverso da chi lo lascia dedurre. La regola sta in `mappai-files-core.js`
       (pura, provata), non qui.
       ⚠️ Sulla MindMap un titolo che si svuota ripulendosi (tutto simboli) NON
       si sostituisce d'ufficio: il nodo centrale è la cosa che il docente ha
       scritto, e chiamarlo «Mappa» al posto suo sarebbe deciderlo per lui. */
    const FCt = window.MappAIFilesCore;
    if (FCt && FCt.titoloProgetto) {
        const pulito = FCt.titoloProgetto(rootName, '');
        if (appState.extractionMode === 'mindmap' && rootName && !pulito) {
            window.showToast(window.t('tst_root_symbols',
                "Il nome del nodo centrale non può essere fatto solo di simboli: diventa anche il nome della cartella."), "error");
            return;
        }
        rootName = pulito || (appState.extractionMode === 'mindmap' ? rootName : '');
    }

    appState.rootNodeLabel = rootName;

    // Leggi focus + lenses combinate
    if (typeof window.updateFocusFromLenses === 'function') {
        window.updateFocusFromLenses();
    }
    appState.focusTopic = appState.focusTopic ||
        (document.getElementById('focus-input') ? document.getElementById('focus-input').value.trim() : '') || '';

    var textParts = [];
    var fileParts = [];
    var hasSources = false;

    appState.generationUsage = { promptTokens: 0, candidateTokens: 0, totalTokens: 0, usedModel: document.getElementById('model-select').value, usedProvider: appState.aiProvider };
    // Strategia 0 — azzera il tracker troncamenti per la nuova generazione
    if (window.MappAITruncationTracker) window.MappAITruncationTracker.reset();

    for (var i = 0; i < appState.sources.length; i++) {
        var src = appState.sources[i];
        var el = document.querySelector('[data-source-id="' + src.id + '"]');
        if (!el && src.type !== 'audio' && src.type !== 'video' && src.type !== 'pdf') continue;

        if (src.type === 'text') {
            var val = el.value.trim();
            if (val) { textParts.push("[FONTE TESTO]:\n" + val); hasSources = true; }
        } else if (src.type === 'url') {
            var urlVal = el.value.trim();
            if (urlVal) {
                window.showLoadingOverlay(true, window.t('lo_web_download', "Download contenuti dal Web..."));
                try {
                    const res = await window.electronAPI.fetchUrl(urlVal);
                    if (res.success) {
                        textParts.push(`[FONTE WEB ${urlVal}]:\n` + res.text);
                        hasSources = true;
                    } else {
                        throw new Error(res.error);
                    }
                } catch (e) {
                    window.showToast(window.t('tst_url_error', "Errore caricamento URL: ") + e.message, "error");
                    window.showLoadingOverlay(false);
                    return;
                }
            }
        } else if (src.type === 'youtube') {
            var ytVal = el.value.trim();
            if (ytVal) { textParts.push("[FONTE YOUTUBE]: " + ytVal); hasSources = true; }
        } else if (src.type === 'pdf' && src.file) {
            window.showLoadingOverlay(true, window.t('lo_pdf_local', "Estrazione testo dal PDF locale..."));
            try {
                let pdfText = await window.extractTextFromPDF(src.file);
                if (pdfText.trim()) {
                    textParts.push("[FONTE PDF " + src.file.name + "]:\n" + pdfText);
                    hasSources = true;
                }
            } catch (err) {
                window.showToast(window.t('tst_pdf_extract_error', "Errore di estrazione dal PDF: ") + err.message, "error");
                window.showLoadingOverlay(false);
                return;
            }
        } else if (src.type === 'doc' && src.file && src.file.name.toLowerCase().endsWith('.pdf')) {
            // Caso PDF caricato tramite bottone Documenti
            window.showLoadingOverlay(true, window.t('lo_pdf', "Estrazione testo dal PDF..."));
            try {
                let pdfText = await window.extractTextFromPDF(src.file);
                if (pdfText.trim()) {
                    textParts.push("[FONTE PDF " + src.file.name + "]:\n" + pdfText);
                    hasSources = true;
                }
            } catch (err) {
                window.showToast(window.t('tst_pdf_error', "Errore PDF: ") + err.message, "error");
            }
        } else if (src.type === 'doc' && src.file && src.file.name.toLowerCase().endsWith('.txt')) {
            // Estrazione TXT diretta per risparmiare tempo/upload
            try {
                const txtContent = await src.file.text();
                if (txtContent.trim()) {
                    textParts.push("[FONTE TESTO DA FILE " + src.file.name + "]:\n" + txtContent);
                    hasSources = true;
                }
            } catch (e) { console.error("Errore lettura TXT", e); }
        } else if (src.type === 'doc' && src.file && src.file.name.toLowerCase().endsWith('.docx')) {
            window.showLoadingOverlay(true, window.t('lo_docx', "Estrazione testo dal documento Word..."));
            try {
                if (window.electronAPI && window.electronAPI.parseDocx && src.path) {
                    const docText = await window.electronAPI.parseDocx(src.path);
                    if (docText && docText.trim()) {
                        textParts.push("[FONTE DOCX " + src.file.name + "]:\n" + docText);
                        hasSources = true;
                    }
                } else {
                    throw new Error("Estrazione DOCX supportata solo nella versione Desktop.");
                }
                continue;
            } catch (e) {
                console.error("Errore Lettura DOCX", e);
                window.showToast(window.t('tst_docx_error', "Errore di estrazione dal DOCX: ") + e.message, "error");
                window.showLoadingOverlay(false);
                return;
            }
        } else if (src.type === 'doc' && src.file && !src.file.name.toLowerCase().endsWith('.pdf')) {
            // Fallback Inline Data per altri documenti
            try {
                const base64 = await new Promise((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = () => resolve(reader.result.split(',')[1]);
                    reader.onerror = reject;
                    reader.readAsDataURL(src.file);
                });
                fileParts.push({ inline_data: { mime_type: src.mimeType, data: base64 } });
                hasSources = true;
                continue; // Salta la sezione File API sotto
            } catch (e) { console.error("Errore Base64 Documento", e); }
        } else if ((src.type === 'audio' || src.type === 'video' || src.type === 'doc') && src.file) {
            window.showLoadingOverlay(true, `MappAI: ${window.t('lo_cloud_upload', "Caricamento")} ${src.type.toUpperCase()} ${window.t('lo_cloud_upload2', "nel Cloud AI...")}`);
            try {
                let uploadedFile;
                // Usiamo l'API Electron solo se abbiamo un percorso file valido (stringa)
                if (window.electronAPI && window.electronAPI.uploadFileGemini && typeof src.path === 'string' && src.path !== "") {
                    uploadedFile = await window.electronAPI.uploadFileGemini({
                        apiKey,
                        filePath: src.path,
                        mimeType: src.mimeType,
                        displayName: src.file.name
                    });
                } else {
                    // Fallback per Browser (Web Version)
                    const initialRes = await fetch(`https://generativelanguage.googleapis.com/upload/v1beta/files?key=${apiKey}`, {
                        method: 'POST',
                        headers: {
                            'X-Goog-Upload-Protocol': 'resumable',
                            'X-Goog-Upload-Command': 'start',
                            'X-Goog-Upload-Header-Content-Length': src.file.size.toString(),
                            'X-Goog-Upload-Header-Content-Type': src.mimeType,
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({ file: { display_name: src.file.name } })
                    });

                    const uploadUrl = initialRes.headers.get('x-goog-upload-url');
                    if (!uploadUrl) throw new Error("Fallito recupero URL di caricamento da Google");

                    const uploadRes = await fetch(uploadUrl, {
                        method: 'POST',
                        headers: {
                            'Content-Length': src.file.size.toString(),
                            'X-Goog-Upload-Offset': '0',
                            'X-Goog-Upload-Command': 'upload, finalize'
                        },
                        body: src.file
                    });

                    const uploadData = await uploadRes.json();
                    if (uploadData.error) throw new Error(uploadData.error.message);

                    uploadedFile = {
                        uri: uploadData.file.uri,
                        mimeType: uploadData.file.mimeType,
                        name: uploadData.file.name
                    };
                }

                if (uploadedFile && uploadedFile.uri) {
                    fileParts.push({ file_data: { mime_type: uploadedFile.mimeType, file_uri: uploadedFile.uri } });
                    hasSources = true;
                }
            } catch (err) {
                window.showToast(`${window.t('tst_upload_error', "Errore upload")} ${src.type}: ${err.message}`, "error");
                window.showLoadingOverlay(false);
                return;
            }
        }
    }

    if (!hasSources) {
        window.showToast(window.t('tst_need_source', "Inserisci almeno una fonte testuale o un file valido per generare la mappa."), "error");
        return;
    }

    // #1 (22/7): rimuove intestazioni/piè di pagina ricorrenti dal corpus di
    // generazione (es. "Storia IV Media · La Guerra Fredda · pag. 3") → la mappa
    // non ingerisce il boilerplate come contenuto. Per-fonte (i repeat sono
    // interni a un PDF). Default ON, kill-switch mappai_strip_boilerplate='0'.
    try {
        var _bpOn = true; try { _bpOn = localStorage.getItem('mappai_strip_boilerplate') !== '0'; } catch (e) { }
        if (_bpOn && window.MappAIBoilerplate) {
            var _bpTot = 0, _stTot = 0;
            textParts = textParts.map(function (part) {
                var r = window.MappAIBoilerplate.stripBoilerplate(part); _bpTot += r.count;
                // #1: righe strutturali (domande, «Doc. N», titoli, righe vuote) → la mappa
                // non le tratta come contenuto (evita nodi-risposta su schede di esercizi).
                if (window.MappAIBoilerplate.stripStructuralLines) {
                    var s = window.MappAIBoilerplate.stripStructuralLines(r.text); _stTot += s.count; return s.text;
                }
                return r.text;
            });
            if (_bpTot) console.log('[Boilerplate] rimosse ' + _bpTot + ' righe di intestazione/piè dal corpus di generazione');
            if (_stTot) console.log('[Boilerplate] rimosse ' + _stTot + ' righe strutturali (domande/titoli/vuote) dal corpus di generazione');
        }
    } catch (e) { /* best-effort: se fallisce, corpus invariato */ }

    // Nuova mappa = chat nuove: mai ereditare il tutorState della mappa precedente
    if (window.setTutorState) window.setTutorState(null);

    window.showLoadingOverlay(true, window.t('lo_init', "Inizializzazione elaborazione ") + (appState.extractionMode === 'mindmap' ? window.t('lo_init_mm', "Mappa Mentale...") : "Knowledge Graph..."), appState.extractionMode === 'mindmap' ? 'mindmap' : 'kg');

    /* ⚠️ IL LUCCHETTO DELLA GENERAZIONE (14/8). `mappaiOccupato()` copriva la
       PIPELINE dei materiali (`Pipeline._running`), non una generazione MM/KG
       nuda: finché il velo copriva tutto lo schermo non si notava, ma da quando
       copre la sola area di CREA si può girare per l'app — e senza un lucchetto
       vero basta un HOME (`backToLanding` fa `location.reload()`) per uccidere
       la generazione in silenzio, coi token già spesi.
       Qui si alza attorno all'estrazione e si abbassa SEMPRE, anche se lancia:
       un lucchetto che resta su dopo un errore blocca l'app per sempre. */
    window.MappAIGen.inizia(appState.rootNodeLabel, appState.extractionMode);
    try {
    if (appState.extractionMode === 'mindmap') {
        // PRE-PASS TRIAGE (gated da mappai_mm_triage_enabled; null se OFF/fallito → zero
        // effetto). Legge la struttura della fonte e stima la profondità-essenziale;
        // consumata dal deepening (Fase 3.7) per non approfondire il contenuto tassonomico.
        appState.mmTriage = window.runMindMapTriage ? await window.runMindMapTriage(textParts, apiKey) : null;

        if (appState.multiPassMode) {
            await extractMindMapMultiPass(textParts, fileParts, apiKey);
        } else {
            await extractMindMapIterative(textParts, fileParts, apiKey);
        }
    } else {
        // Routing KG:
        // - Google: Community mode è il DEFAULT (best quality, single-pass, bilanciato).
        //   Per tornare al legacy: MappAIMetrics.disableCommunityKG() → scrive 'false'.
        // - Infomaniak: legacy (multi/single-pass) è il DEFAULT.
        //   Per attivare community: MappAIMetrics.enableCommunityKG() → scrive 'true'.
        // Toggle A/B logica KG (landing): A = BERT Community · B = MappAI classico (DEFAULT).
        // Community solo se scelto esplicitamente (flag 'true'); default = classico (single/multi-pass).
        const communityFlag = localStorage.getItem('mappai_kg_community_mode');
        const useCommunity = communityFlag === 'true';
        if (useCommunity) {
            await extractKnowledgeGraphCommunity(textParts, fileParts, apiKey);
        } else if (appState.multiPassMode) {
            await extractKnowledgeGraphMultiPass(textParts, fileParts, apiKey);
        } else {
            await extractKnowledgeGraphSinglePass(textParts, fileParts, apiKey);
        }
    }
    } finally {
        window.MappAIGen.fine();
    }
}

const MIND_MAP_SYSTEM_INSTRUCTION = `
SEI UN MOTORE DI GENERAZIONE MAPPE MENTALI GERARCHICHE (JSON).
REGOLE TASSATIVE DI OUTPUT:
1. RESTITUISCI SOLO JSON PURO. Nessun commento, nessuna introduzione, nessun blocco di codice markdown.
2. LINGUA: Usa sempre l'ITALIANO (o la lingua richiesta dall'utente).
3. TITOLI (label): Massimo 3 parole chiave. Sii estremamente sintetico nei titoli dei nodi.
4. DESCRIZIONI (content): Sii chiaro, didattico e conciso (max 10 parole). La descrizione approfondita va in 'desc' (max 50 parole).
5. CONNETTIVITÀ: La mappa deve essere rigorosamente gerarchica (albero). Ogni sotto-nodo (L2, L3...) deve avere un unico genitore logico. Non lasciare nodi orfani.
6. ID UNICI: Crea ID parlanti e univoci coerenti con la gerarchia (es: L1_ID_CONCETTO).
7. CITAZIONI (chunks): DEBBONO essere frasi intere, verbatim e significative estratte dai testi (minimo 15 parole). È VIETATO inserire singole parole o frammenti brevi.
8. COERENZA: Rispetta gli ID delle Macro-Aree (L1) fornite per agganciare correttamente i rami figli.
9. STRUTTURA: Rispetta lo schema JSON richiesto senza variazioni.
`;

const KNOWLEDGE_GRAPH_SYSTEM_INSTRUCTION = `
SEI UN MOTORE DI GENERAZIONE KNOWLEDGE GRAPH RETICOLARE (JSON).
REGOLE TASSATIVE DI OUTPUT:
1. RESTITUISCI SOLO JSON PURO. Nessun commento, nessuna introduzione, nessun blocco di codice markdown.
2. LINGUA: Usa sempre l'ITALIANO (o la lingua richiesta dall'utente).
3. TITOLI (label): Massimo 3 parole chiave. Sii estremamente sintetico nei titoli dei nodi.
4. DESCRIZIONI (content): Sii chiaro, didattico e conciso (max 30 parole).
5. CONNETTIVITÀ: Non esiste un nodo centrale unico. Il grafo deve essere reticolare, con entità uniche connesse trasversalmente.
6. ID UNICI: Crea ID parlanti e univoci per ogni entità (es: ENTITA_NOME).
7. CITAZIONI (chunks): DEBBONO essere frasi intere, verbatim e significative estratte dai testi (minimo 15 parole). È VIETATO inserire singole parole o frammenti brevi.
8. COERENZA: Collega le entità nuove ai Super-Hub (L1) forniti usando gli ID indicati.
9. STRUTTURA: Rispetta lo schema JSON richiesto senza variazioni.
`;

// Inietta il system prompt disciplinare (se attivo) nel systemInstruction base.
// Chiamato da tutti i punti di costruzione payload per MM e KG.
function buildSystemInstruction(base) {
    let out = base;
    const disciplinePrompt = window.buildDisciplineSystemPrompt && window.buildDisciplineSystemPrompt();
    if (disciplinePrompt) out += '\n\n--- FOCUS DISCIPLINARE ---\n' + disciplinePrompt;
    // Taratura sulla CLASSE ATTIVA (registro/livello/note): adatta il linguaggio,
    // non i fatti. '' se nessuna classe attiva → comportamento generico invariato.
    out += window.classTuningPrompt();
    // Accessibilità desc (glossa tecnicismi, causa-effetto): entra SOLO qui
    // perché tutte le chiamanti di questa funzione producono prosa per lo
    // studente (Fase 3, albero iterativo, KG single-pass, sotto-concetti,
    // Espandi con AI). Le fasi strutturali (1/1.5/1.6/4/5, KG multi-pass)
    // costruiscono i propri systemInstruction e restano intatte.
    if (window.accessibleDescRules) out += window.accessibleDescRules();
    return out;
}

// ── Taratura AI: interruttore unico (base = OFF/standard) ──────────────────
// Il grafo si genera SEMPRE standard. La taratura si "arma" SOLO quando un
// materiale di studio (sintesi, foglio label, ...) chiede la versione tarata.
// Fonte = CONTESTO ATTIVO: studente attivo → suo profilo; altrimenti classe attiva.
window.MappAITune = {
    armed: false,
    // Modalità "solo livello": inietta UNA riga (grado + ordine scolastico) nella
    // generazione del grafo. Per fonti ESTERNE (articoli, video) non già tarate
    // dal docente. Opt-in via toggle in Costruisci, default OFF.
    levelArmed: false,
    /* «Semplifica comunque»: chi accende la taratura nel modale della PIPELINE
       chiede una mappa leggibile, non una mappa al livello del preset — e un
       preset «standard» o «ricco» andrebbe nella direzione opposta. Quando
       questo flag è acceso il registro SEMPLICE (BES/DSA) vince sul preset del
       profilo, che resta com'è per tutto il resto dell'app.
       Lo accende solo `armLevel(true)`; il toggle della landing chiama
       `armLevel()` senza argomenti e non cambia niente. */
    levelForceSimple: false,
    arm: function () { this.armed = true; return this; },
    disarm: function () { this.armed = false; return this; },
    armLevel: function (forzaSemplice) {
        this.levelArmed = true;
        this.levelForceSimple = !!forzaSemplice;
        return this;
    },
    disarmLevel: function () { this.levelArmed = false; this.levelForceSimple = false; return this; },
    // Nome del contesto attivo ('' se generico) — per la UI del toggle
    activeContextName: function () {
        try {
            var a = window.appState || (typeof appState !== 'undefined' ? appState : null);
            if (a && a.userProfile && a.userProfile.nickname) return a.userProfile.nickname;
            var c = window.MappAIClasses && window.MappAIClasses.getActive && window.MappAIClasses.getActive();
            return c ? c.name : '';
        } catch (e) { return ''; }
    },
    // Riga "livello di lettura" dal contesto attivo (studente prioritario). '' se generico.
    levelBlock: function () {
        try {
            var a = window.appState || (typeof appState !== 'undefined' ? appState : null);
            var grade = '', system = '';
            var up = a && a.userProfile;
            if (up && up.nickname) { grade = up.grade || ''; system = up.system || ''; }
            else {
                var c = window.MappAIClasses && window.MappAIClasses.getActive && window.MappAIClasses.getActive();
                if (c) { grade = c.grade || c.name || ''; system = c.system || ''; }
            }
            /* Col «semplifica comunque» il registro SEMPLICE entra anche senza
               un grado: la richiesta è «scrivi in modo accessibile», e vale pure
               su un contesto generico. Senza questo, la riga sotto uscirebbe
               vuota e la spunta non avrebbe alcun effetto. */
            var semplice = '';
            if (this.levelForceSimple) {
                try {
                    semplice = (window.MappAIClasses && window.MappAIClasses.registerPrompt)
                        ? window.MappAIClasses.registerPrompt('semplice') : '';
                } catch (e) { semplice = ''; }
            }
            if (!grade && !system) {
                return semplice ? '\n\n--- LIVELLO DI LETTURA ---\n' + semplice : '';
            }
            var dest = [grade, system].filter(Boolean).join(' · ');
            var righe = 'Destinatari: studenti di ' + dest + '.';
            /* Col preset semplice comanda lui: la riga generica «lessico adeguato
               all'età» direbbe una cosa più debole, e su un preset «ricco» del
               profilo direbbe l'opposto. */
            righe += semplice
                ? ' ' + semplice
                : ' Le descrizioni devono essere comprensibili a questo livello: frasi chiare, lessico adeguato all\'età.';
            return '\n\n--- LIVELLO DI LETTURA ---\n' + righe +
                ' Resta fedele ai fatti della fonte; adatta solo il linguaggio.';
        } catch (e) { return ''; }
    },
    // Esegue fn con la taratura armata, ripristinando lo stato precedente.
    withTuning: function (fn) { var prev = this.armed; this.armed = true; try { return fn(); } finally { this.armed = prev; } },
    // C'è un contesto attivo con taratura SPECIALE? (governa il suffisso [VERDE])
    isSpecialActive: function () {
        try {
            var a = window.appState || (typeof appState !== 'undefined' ? appState : null);
            var up = a && a.userProfile;
            /* «speciale» = si scosta dallo standard: il registro medio È lo
               standard, come già per le classi qui sotto. */
            if (up && up.nickname) return !!((up.notes && String(up.notes).trim()) || up.register === 'semplice' || up.register === 'ricco');
            var c = window.MappAIClasses && window.MappAIClasses.getActive && window.MappAIClasses.getActive();
            return !!(c && ((c.notes && String(c.notes).trim()) || c.register === 'semplice' || c.register === 'ricco'));
        } catch (e) { return false; }
    },
    // Blocco taratura del contesto attivo (studente ha priorità, poi classe). '' se generico.
    activeTuningBlock: function () {
        try {
            var a = window.appState || (typeof appState !== 'undefined' ? appState : null);
            var up = a && a.userProfile;
            if (up && up.nickname) {
                var bits = [];
                var head = 'Adatta il linguaggio a uno studente';
                if (up.age) head += ' di ' + up.age + ' anni';
                if (up.grade) head += ', classe ' + up.grade;
                if (up.system) head += ' (' + up.system + ')';
                bits.push(head + '.');
                /* Preset di registro della scheda allievo: stessi tre testi
                   delle classi, chiesti al loro modulo — non una seconda copia. */
                var reg = '';
                try {
                    reg = (window.MappAIClasses && window.MappAIClasses.registerPrompt)
                        ? window.MappAIClasses.registerPrompt(up.register) : '';
                } catch (e) { /* modulo classi assente */ }
                if (reg) bits.push(reg);
                if (up.notes && String(up.notes).trim()) bits.push('Note sull\'allievo: ' + String(up.notes).trim() + '.');
                /* ⚠️ «Usa frasi brevi, lessico concreto» era incondizionato: col
                   preset «Ricco» (periodi complessi, terminologia disciplinare)
                   il prompt avrebbe chiesto due cose opposte nella stessa riga.
                   Quando un preset c'è, comanda lui; senza, resta il default
                   prudente di prima. La riga di fedeltà vale sempre. */
                if (!reg) bits.push('Usa frasi brevi, lessico concreto ed esempi adatti.');
                bits.push('Resta fedele ai fatti, adatta solo COME li esprimi.');
                return '\n\n--- TARATURA STUDENTE (adatta linguaggio ed esempi a questo allievo) ---\n' + bits.join(' ');
            }
            return (window.MappAIClasses && window.MappAIClasses.tuningForPrompt) ? (window.MappAIClasses.tuningForPrompt() || '') : '';
        } catch (e) { return ''; }
    }
};

// Blocco taratura iniettato nei prompt SOLO quando armato (base = standard).
// armed (pieno, materiali [VERDE]) ha priorità; levelArmed (solo livello, toggle
// Costruisci per fonti esterne) inietta la sola riga grado+ordine.
// Usato da buildSystemInstruction e da injectClassTuning (quiz, tutor, timeline, enrich).
window.classTuningPrompt = function () {
    try {
        if (!window.MappAITune) return '';
        if (window.MappAITune.armed) return window.MappAITune.activeTuningBlock();
        if (window.MappAITune.levelArmed) return window.MappAITune.levelBlock();
        return '';
    } catch (e) { return ''; }
};

// Toggle «Adatta al livello» in Costruisci: abilitato solo con contesto attivo.
// Chiamato all'init, al cambio classe attiva (evento) e da _setActiveStudent.
window.refreshLevelTuneRow = function () {
    var row = document.getElementById('level-tune-row');
    var cb = document.getElementById('level-tune-toggle');
    var ctxEl = document.getElementById('level-tune-ctx');
    if (!row || !cb) return;
    var ctx = window.MappAITune ? window.MappAITune.activeContextName() : '';
    if (ctxEl) ctxEl.textContent = ctx ? ctx : window.t('ui_level_tune_none', 'nessun contesto attivo');
    cb.disabled = !ctx;
    if (!ctx) { cb.checked = false; if (window.MappAITune) window.MappAITune.disarmLevel(); }
    row.style.opacity = ctx ? '1' : '0.5';
};
document.addEventListener('mappai-active-class-changed', function () { window.refreshLevelTuneRow(); });

// Inietta la taratura classe in un payload AI: la accoda al systemInstruction se
// esiste, altrimenti ne crea uno. Ritorna il payload (mutato) per l'uso inline.
// No-op se nessuna classe attiva → comportamento invariato su Google e Infomaniak.
window.injectClassTuning = function (payload) {
    const ct = window.classTuningPrompt();
    if (!ct || !payload) return payload;
    const si = payload.systemInstruction;
    if (si && si.parts && si.parts[0]) {
        si.parts[0].text = (si.parts[0].text || '') + ct;
    } else {
        payload.systemInstruction = { parts: [{ text: ct.replace(/^\n+/, '') }] };
    }
    return payload;
};

// ── Accessibilità delle descrizioni (regola base, indipendente dalla taratura) ──
// Tecnica emersa dal confronto A/B "la CARTA" 1A/1B (19/7/26): glossare i
// tecnicismi alla prima occorrenza, esplicitare i nessi causa-effetto, ancorare
// ad azioni/dettagli concreti della fonte. Vale per TUTTE le mappe (anche senza
// classe attiva); il REGISTRO della classe attiva ne modula solo l'intensità:
//   'ricco'    → nessuna regola (registro accademico voluto dal docente)
//   'medio'/nessuna classe → regola leggera (glossa + causa-effetto)
//   'semplice' → regola piena (+ dettagli concreti, frasi brevi)
// Iniettata SOLO nelle fasi che scrivono prosa (via buildSystemInstruction,
// enrich, KG Community) — mai nelle fasi strutturali del multi-pass.
// Kill-switch: localStorage mappai_accessible_descs = '0'.
window.accessibleDescRules = function () {
    try {
        if (localStorage.getItem('mappai_accessible_descs') === '0') return '';
        var en = (typeof window.getPromptLanguage === 'function') && window.getPromptLanguage() === 'en';
        var reg = 'medio';
        var c = window.MappAIClasses && window.MappAIClasses.getActive && window.MappAIClasses.getActive();
        if (c && c.register) reg = c.register;

        // (A) FRASI AUTO-CONTENUTE — sempre (ANCHE 'ricco'): la «Catena dei perché»
        //     (deterministica, estrae i nessi dalle desc) serve a ogni classe.
        //     Senza questa regola le frasi causali usano pronomi/possessivi che
        //     rimandano al titolo del nodo ("La sua posizione a corte…") e,
        //     estratte fuori contesto, perdono il soggetto o restano frammenti.
        var out = en
            ? '\n\n--- SELF-CONTAINED SENTENCES (for the cause-effect chain) ---\nWhen a "desc" states a cause-effect link, write it so it makes sense ON ITS OWN, even lifted out of the node: ALWAYS name the subject explicitly (the person, object or concept — e.g. "Cai Lun", not "his role"); never start a link with a bare pronoun or possessive ("its", "this", "it", "this invention") that only refers to the node title. Write both sides of the link as complete clauses, never fragments, and use complete causal connectives WITH their complement ("enables X to …", "thanks to", "led to"), never truncated.'
            : '\n\n--- FRASI AUTO-CONTENUTE (per la Catena dei perché) ---\nQuando una "desc" esprime un nesso causa-effetto, scrivi la frase così che si capisca DA SOLA, anche estratta fuori dal nodo: nomina SEMPRE il soggetto per esteso (la persona, l\'oggetto o il concetto — es. "Cai Lun", non "la sua posizione"); non iniziare mai un nesso con un pronome o un possessivo ("la sua", "questo", "esso", "questa invenzione") che rimanda solo al titolo del nodo. Scrivi i due lati del nesso come frasi compiute, mai frammenti, e usa connettivi causali completi CON il loro complemento ("permette di + azione", "grazie a", "portò a"), mai troncati.';

        // (B) ACCESSIBILITÀ DESCRIZIONI — solo medio/semplice ('ricco' = solo la
        //     regola strutturale sopra).
        if (reg !== 'ricco') {
            var full = (reg === 'semplice');
            if (en) {
                out += '\n\n--- DESCRIPTION ACCESSIBILITY ---\nIn each "desc": explain every technical term the first time it appears (e.g. "cellulose, the fiber that holds plants upright"); make the cause-effect links of the source explicit (because, therefore, instead of).';
                if (full) out += ' Anchor concepts to concrete actions and details present in the source. Short, linear sentences.';
                out += ' Stay faithful to the source facts and within the requested word limit.';
            } else {
                out += '\n\n--- ACCESSIBILITÀ DESCRIZIONI ---\nIn ogni "desc": spiega ogni termine tecnico la prima volta che compare (es. "la cellulosa, la fibra che sostiene le piante"); esplicita i nessi causa-effetto presenti nella fonte (perché, quindi, invece di).';
                if (full) out += ' Ancora i concetti ad azioni e dettagli concreti presenti nella fonte. Frasi brevi e lineari.';
                out += ' Resta fedele ai fatti della fonte e nel limite di parole richiesto.';
            }
        }
        return out;
    } catch (e) { return ''; }
};

// MM EXTRACTION (extractMindMapIterative, extractMindMapMultiPass)
// → estratto in js/mappai-mm-extraction.js (caricato dopo app.js)

// GENERATION SUPPORT (crosslink markers, dedup, JSONL, flags, Phase4/5, enrich, validate/split L1)
// → estratto in js/mappai-generation-support.js (caricato dopo app.js)

// KG EXTRACTION (extractResponseText, _kgGenerationConfig, extractKnowledgeGraph{SinglePass,Community,MultiPass})
// → estratto in js/mappai-kg-extraction.js (caricato dopo app.js)
window.showGenerationReport = function () {
    if (!appState.generationUsage) return;

    const modelEl = document.getElementById('model-select');
    const modelId = modelEl ? modelEl.value : 'gemini-2.0-flash';
    const kb = matchModelKB(modelId);

    let totalCost = 0;
    if (kb && !kb.free) {
        totalCost = (appState.generationUsage.promptTokens / 1000000 * kb.inputCost) +
            (appState.generationUsage.candidateTokens / 1000000 * kb.outputCost);
    }

    const isInfomaniak = (appState.aiProvider === 'infomaniak');
    const costText = kb && kb.free ? "Gratuito (Piano Free)" : (isInfomaniak ? `${totalCost.toFixed(4)} CHF` : `$${totalCost.toFixed(4)}`);
    const tokens = appState.generationUsage.totalTokens.toLocaleString();

    window.showToast(`${window.t('tst_gen_done', "Generazione completata!")} Token: ${tokens} | ${window.t('ui_cost', "Costo")}: ${costText}`, "success");

    // Riordino su disco (22/7): a fine generazione crea/aggiorna in automatico la
    // cartella vault della mappa in «Mappe» (nome = ROOT; annidata nella classe
    // attiva se presente). Non bloccante — kill-switch mappai_autovault='0'.
    try { if (window.ensureProjectVault) window.ensureProjectVault({ reason: 'generation' }); } catch (e) { }

    // Log for debugging
    console.log("--- Generation Report ---");
    console.log(`Model: ${modelId}`);
    console.log(`Tokens: ${tokens} (${appState.generationUsage.promptTokens} in, ${appState.generationUsage.candidateTokens} out)`);
    console.log(`Estimated Cost: ${costText}`);
};

/* D3MAP.JS - Rendering D3 → estratto in js/mappai-d3-render.js (caricato dopo app.js) */

/* UI.JS - Interfaccia Utente e Sidebar → estratto in js/mappai-ui-canvas.js (caricato dopo app.js) */

// MARKDOWN VAULT I/O (saveMapVault/loadMapVault/import/demo) → estratto in js/mappai-vault-io.js



// MERGE/UNISCI + AI CROSS-LINKING + VALIDATE → estratto in js/mappai-merge-validate.js

// STAMPA (exportNotesMarkdown, etichette, dossier PDF) → estratto in js/mappai-print-dossier.js




// LIGHTBOX + MENU CONTESTUALE E TOUCH → estratto in js/mappai-context-menu.js (handleTouch* usati da initD3, runtime)

// EDIT MODAL LOGIC → estratto in js/mappai-edit-modal.js (let editTarget usato anche da D3 e tutor, runtime)

// SPACED REPETITION & FLASHCARDS → estratto in js/mappai-flashcards-sr.js

// ==========================================
// API DI SUPPORTO PER AI E ALBERI
// ==========================================
window.getDescendantIds = function (nodeId, visited = new Set()) {
    if (visited.has(nodeId)) return [];
    visited.add(nodeId);
    let ids = [nodeId];
    let children = appState.db.links.filter(l => {
        let sid = typeof l.source === 'object' ? l.source.id : l.source;
        return sid === nodeId && !l.isCross;
    }).map(l => typeof l.target === 'object' ? l.target.id : l.target);
    for (let child of children) {
        ids = ids.concat(window.getDescendantIds(child, visited));
    }
    return ids;
}

window.getInheritedDatabase = function (nodeId) {
    if (!window.getDescendantIds) return [];
    const allIds = window.getDescendantIds(nodeId);
    let combinedDB = [];
    allIds.forEach(id => {
        if (appState.db.sourcesDict[id]) {
            let notes = Array.isArray(appState.db.sourcesDict[id]) ? appState.db.sourcesDict[id] : [appState.db.sourcesDict[id]];
            combinedDB = combinedDB.concat(notes);
        }
    });
    return combinedDB;
}

// AI QUIZ E CHAT TUTOR → estratto in js/mappai-ai-tutor.js (incl. let tutorState/serializeTutorState)

// ==========================================
// POMODORO & STATS LOGIC → estratto in js/mappai-pomodoro.js
// (caricato dopo app.js). Restano qui solo le glue render+storage.
// ==========================================

// (monkey-patch renderGraph spostato in js/mappai-d3-render.js — load-time dep)

// STORAGE MANAGER + PROGETTI + LINGUA → estratto in js/mappai-storage-lang.js (caricato dopo app.js)

// STRUMENTI A11Y (sillabazione/interlinea/zoom/floating) → estratto in js/mappai-a11y.js

// Rimozione logica traduzioni (Ripristino Italiano)
window.changeAppLanguage = null;
window.applyAppTranslations = null;

// === SEARCH FINDER LOGIC === → estratto in js/mappai-search-finder.js (caricato dopo app.js)



// CONTEXTUAL AI EXTENSION → estratto in js/mappai-contextual-ai.js (caricato dopo app.js)

/* ==========================================
   USER PROFILE & VAULT MANAGER (SOTA)
   ========================================== */
// USER PROFILE → estratto in js/mappai-user-profile.js (caricato dopo app.js).
// Sotto resta il Vault Manager.

// Vault Manager → estratto in js/mappai-vault-manager.js (caricato dopo app.js)

// Initialization
(function initProfile() {
    const savedProfiles = localStorage.getItem('mappai_all_profiles');
    if (savedProfiles) {
        try {
            appState.allProfiles = JSON.parse(savedProfiles);
        } catch (e) { }
    }

    const saved = localStorage.getItem('mappai_user_profile');
    if (saved) {
        try {
            appState.userProfile = JSON.parse(saved);
            // Migrate single profile to allProfiles if not there
            if (appState.userProfile.nickname && appState.allProfiles.length === 0) {
                appState.allProfiles.push({ ...appState.userProfile });
                localStorage.setItem('mappai_all_profiles', JSON.stringify(appState.allProfiles));
            }
        } catch (e) { }
    }

    // Gestione Segnalazioni e Feedback
    let selectedFeedbackCategory = 'ui';

    window.selectFeedbackCategory = function (cat) {
        selectedFeedbackCategory = cat;
        const categories = ['ui', 'ai', 'storage', 'bug', 'suggestion', 'other'];
        categories.forEach(c => {
            const btn = document.getElementById(`fb-cat-${c}`);
            if (btn) {
                btn.classList.remove('bg-indigo-600', 'text-white', 'border-indigo-600');
                btn.classList.add('bg-white', 'text-slate-600', 'border-slate-200');
            }
        });

        const activeBtn = document.getElementById(`fb-cat-${cat}`);
        if (activeBtn) {
            activeBtn.classList.remove('bg-white', 'text-slate-600', 'border-slate-200');
            activeBtn.classList.add('bg-indigo-600', 'text-white', 'border-indigo-600');
        }
    };

    window.openFeedbackModal = function () {
        const modal = document.getElementById('feedback-modal');
        const box = document.getElementById('feedback-box');
        if (!modal || !box) return;

        document.getElementById('feedback-text').value = '';
        window.selectFeedbackCategory('ui');

        modal.classList.remove('hidden');
        modal.classList.add('flex');
        setTimeout(() => {
            modal.classList.remove('opacity-0');
            box.classList.remove('scale-95');
        }, 10);
        if (window.safeCreateIcons) window.safeCreateIcons();
    };

    window.closeFeedbackModal = function () {
        const modal = document.getElementById('feedback-modal');
        const box = document.getElementById('feedback-box');
        if (!modal || !box) return;

        modal.classList.add('opacity-0');
        box.classList.add('scale-95');
        setTimeout(() => {
            modal.classList.add('hidden');
            modal.classList.remove('flex');
        }, 200);
    };

    window.submitFeedback = function () {
        const text = document.getElementById('feedback-text').value.trim();
        if (!text) {
            if (window.showToast) window.showToast(window.t('tst_fill_report', "Inserisci i dettagli della segnalazione"), "warning");
            return;
        }

        const catLabels = {
            'ui': 'Interfaccia / UI',
            'ai': 'Generazione AI',
            'storage': 'Salvataggio / File',
            'bug': 'Bug / Errore',
            'suggestion': 'Suggerimento',
            'other': 'Altro'
        };

        const categoryLabel = catLabels[selectedFeedbackCategory] || 'Altro';
        const emailSubject = `MappAI Feedback - [${categoryLabel}]`;

        const appVersion = "1.0.0";
        const osInfo = "iOS / iPadOS (Capacitor)";
        const userAgent = navigator.userAgent;
        const model = document.getElementById('model-select')?.value || 'Non specificato';

        const emailBody = `SEGNALAZIONE UTENTE MAPPAI\n` +
            `========================================\n` +
            `Categoria: ${categoryLabel}\n` +
            `Dispositivo: ${osInfo}\n` +
            `Modello Selezionato: ${model}\n` +
            `Versione App: ${appVersion}\n` +
            `User Agent: ${userAgent}\n` +
            `========================================\n\n` +
            `DESCRIZIONE:\n${text}\n\n`;

        navigator.clipboard.writeText(emailBody).then(() => {
            const mailtoUrl = `mailto:giacomo@insegnai.ch?subject=${encodeURIComponent(emailSubject)}&body=${encodeURIComponent(emailBody)}`;
            window.location.href = mailtoUrl;
            if (window.showToast) window.showToast(window.t('tst_report_copied', "Segnalazione copiata e client email aperto!"), "success");
            window.closeFeedbackModal();
        }).catch(err => {
            const mailtoUrl = `mailto:giacomo@insegnai.ch?subject=${encodeURIComponent(emailSubject)}&body=${encodeURIComponent(emailBody)}`;
            window.location.href = mailtoUrl;
            if (window.showToast) window.showToast(window.t('tst_email_ready', "Email preparata!"), "success");
            window.closeFeedbackModal();
        });
    };

    // Inizializza i modelli all'avvio se c'è una chiave
    setTimeout(() => {
        if (window.getSystemKey && window.getSystemKey()) {
            if (window.refreshGeminiModels) window.refreshGeminiModels();
        }
    }, 1000);

    // ==========================================================
    // SEZIONE LAYOUT PERSONALIZZATI (FISSA)
    // ==========================================================
    window.currentEditingLayoutId = null;

    window.openLayoutModal = async function () {
        // Vista studio (1/8): il bottone FISSA resta cliccabile sopra
        // l'overlay (z-30 > 5), ma catturerebbe anteprima e posizioni dal
        // force layout NASCOSTO sotto — uno snapshot incoerente. Si blocca
        // con spiegazione (review 1/8).
        if (appState.layoutMode === 'studio') {
            window.showToast(window.t('tst_layout_in_studio', "Sei nella vista studio: per salvare un layout di posizioni torna prima al layout libero (bottone LAYOUT)."), "warning");
            return;
        }
        const modal = document.getElementById('layout-manager-modal');
        const box = document.getElementById('layout-manager-box');
        if (!modal || !box) return;

        // Reset edit state
        window.currentEditingLayoutId = null;
        const editIndicator = document.getElementById('layout-edit-indicator');
        if (editIndicator) editIndicator.classList.add('hidden');

        const editBtn = document.getElementById('layout-confirm-edit-btn');
        if (editBtn) {
            editBtn.setAttribute('disabled', 'true');
            editBtn.classList.add('opacity-50', 'cursor-not-allowed');
        }

        // Reset campi input
        document.getElementById('layout-new-title').value = '';
        document.getElementById('layout-new-keyword').value = '';
        document.getElementById('layout-new-desc').value = '';

        // Reset minimized & resized state
        box.classList.remove('minimized-layout-box');
        box.style.width = '';
        box.style.height = '';
        box.style.left = '';
        box.style.top = '';
        box.style.transform = '';

        const minBtn = document.getElementById('layout-minimize-btn');
        if (minBtn) {
            minBtn.innerHTML = `<i data-lucide="minimize-2" class="w-6 h-6"></i>`;
        }

        // Renderizza lista dei layout salvati
        window.renderSavedLayoutsList();

        // Mostra modale
        modal.classList.remove('hidden');
        modal.classList.add('flex');
        setTimeout(() => {
            modal.classList.remove('opacity-0');
            box.classList.remove('scale-95');
        }, 10);

        // Genera l'anteprima in tempo reale
        await window.updateLayoutPreviewDirect();
    };

    window.updateLayoutPreviewDirect = async function () {
        const previewContainer = document.getElementById('layout-current-preview-container');
        if (!previewContainer) return;
        previewContainer.innerHTML = `
            <div class="text-center text-slate-400 text-xs flex flex-col items-center gap-1">
                <i data-lucide="loader-2" class="w-8 h-8 animate-spin text-indigo-500"></i>
                Cattura anteprima...
            </div>
        `;
        if (window.safeCreateIcons) window.safeCreateIcons();

        try {
            const previewData = await getSVGPreviewDataURL();
            if (previewData && previewData.preview) {
                previewContainer.innerHTML = `<img src="${previewData.preview}" class="w-full h-full object-contain" id="layout-current-preview-img" data-svg-markup="${encodeURIComponent(previewData.svgMarkup)}" />`;
            } else {
                previewContainer.innerHTML = `<div class="text-xs text-slate-400">Anteprima non disponibile</div>`;
            }
        } catch (e) {
            console.error(e);
            previewContainer.innerHTML = `<div class="text-xs text-slate-400">Errore anteprima</div>`;
        }
        if (window.safeCreateIcons) window.safeCreateIcons();
    };

    window.closeLayoutModal = function () {
        const modal = document.getElementById('layout-manager-modal');
        const box = document.getElementById('layout-manager-box');
        if (!modal || !box) return;

        modal.classList.add('opacity-0');
        box.classList.add('scale-95');
        setTimeout(() => {
            modal.classList.add('hidden');
            modal.classList.remove('flex');
        }, 200);
    };

    // Funzione interna per generare l'immagine PNG a partire dal tag SVG corrente della mappa
    async function getSVGPreviewDataURL() {
        const svgElement = document.getElementById("map-svg");
        if (!svgElement) return null;

        const clonedSvg = svgElement.cloneNode(true);
        clonedSvg.removeAttribute("class");

        // Rimuove gli elementi foreignObject (es. icone lucide con HTML) che bloccano il rendering di sicurezza dell'immagine SVG
        const foreignObjects = clonedSvg.querySelectorAll("foreignObject");
        foreignObjects.forEach(fo => fo.remove());

        // Assicura la presenza del namespace SVG corretto
        if (!clonedSvg.getAttribute("xmlns")) {
            clonedSvg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
        }

        // Imposta larghezza e altezza assolute per permettere il rendering corretto in un tag Image
        const rect = svgElement.getBoundingClientRect();
        const svgW = rect.width || svgElement.clientWidth || 800;
        const svgH = rect.height || svgElement.clientHeight || 600;
        clonedSvg.setAttribute("width", svgW);
        clonedSvg.setAttribute("height", svgH);

        if (!clonedSvg.getAttribute("viewBox")) {
            clonedSvg.setAttribute("viewBox", `0 0 ${svgW} ${svgH}`);
        }

        // Estrae e inietta gli stili CSS per rendere i colori fedeli
        let cssStyles = `
            .node-circle { stroke-width: 2px; }
            .node-text { font-family: system-ui, -apple-system, sans-serif; font-weight: 500; pointer-events: none; }
            .link { stroke: #cbd5e1; stroke-opacity: 0.6; stroke-width: 2px; fill: none; }
            .link-active { stroke: #6366f1; stroke-width: 3px; }
            .arrowhead { fill: #94a3b8; }
        `;
        try {
            if (document.styleSheets) {
                for (let i = 0; i < document.styleSheets.length; i++) {
                    const sheet = document.styleSheets[i];
                    try {
                        const rules = sheet.cssRules || sheet.rules;
                        if (!rules) continue;
                        for (let j = 0; j < rules.length; j++) {
                            const rule = rules[j];
                            if (rule.cssText && (
                                rule.cssText.includes(".node") ||
                                rule.cssText.includes(".link") ||
                                rule.cssText.includes("svg") ||
                                rule.cssText.includes("text") ||
                                rule.cssText.includes("marker")
                            )) {
                                cssStyles += rule.cssText + "\n";
                            }
                        }
                    } catch (e) {
                        // Ignora restrizioni CORS
                    }
                }
            }
        } catch (e) { }

        const styleElem = document.createElementNS("http://www.w3.org/2000/svg", "style");
        styleElem.textContent = cssStyles;
        clonedSvg.insertBefore(styleElem, clonedSvg.firstChild);

        const serializer = new XMLSerializer();
        const svgString = serializer.serializeToString(clonedSvg);

        return new Promise((resolve) => {
            const img = new Image();
            const svgBlob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
            const url = URL.createObjectURL(svgBlob);

            img.onload = function () {
                const canvas = document.createElement("canvas");
                canvas.width = 400;
                canvas.height = 300;
                const ctx = canvas.getContext("2d");
                ctx.fillStyle = "#ffffff";
                ctx.fillRect(0, 0, canvas.width, canvas.height);

                // Ritaglio proporzionale (Cover) senza deformare/stretchare l'immagine
                const canvasRatio = canvas.width / canvas.height;
                const imgRatio = img.width / img.height;
                let sx = 0, sy = 0, sw = img.width, sh = img.height;
                if (imgRatio > canvasRatio) {
                    sw = img.height * canvasRatio;
                    sx = (img.width - sw) / 2;
                } else {
                    sh = img.width / canvasRatio;
                    sy = (img.height - sh) / 2;
                }

                ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
                URL.revokeObjectURL(url);
                resolve({
                    preview: canvas.toDataURL("image/png"),
                    svgMarkup: svgString
                });
            };
            img.onerror = function (err) {
                console.error("SVG preview render failed:", err);
                URL.revokeObjectURL(url);
                // Tentativo alternativo usando encoding base64 diretto della stringa SVG
                try {
                    const fallbackUrl = "data:image/svg+xml;utf8," + encodeURIComponent(svgString);
                    const fallbackImg = new Image();
                    fallbackImg.onload = function () {
                        const canvas = document.createElement("canvas");
                        canvas.width = 400;
                        canvas.height = 300;
                        const ctx = canvas.getContext("2d");
                        ctx.fillStyle = "#ffffff";
                        ctx.fillRect(0, 0, canvas.width, canvas.height);

                        // Ritaglio proporzionale (Cover)
                        const canvasRatio = canvas.width / canvas.height;
                        const imgRatio = fallbackImg.width / fallbackImg.height;
                        let sx = 0, sy = 0, sw = fallbackImg.width, sh = fallbackImg.height;
                        if (imgRatio > canvasRatio) {
                            sw = fallbackImg.height * canvasRatio;
                            sx = (fallbackImg.width - sw) / 2;
                        } else {
                            sh = fallbackImg.width / canvasRatio;
                            sy = (fallbackImg.height - sh) / 2;
                        }

                        ctx.drawImage(fallbackImg, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
                        resolve({
                            preview: canvas.toDataURL("image/png"),
                            svgMarkup: svgString
                        });
                    };
                    fallbackImg.onerror = function () {
                        resolve({
                            preview: null,
                            svgMarkup: svgString
                        });
                    };
                    fallbackImg.src = fallbackUrl;
                } catch (fallbackErr) {
                    console.error("Fallback rendering failed:", fallbackErr);
                    resolve({
                        preview: null,
                        svgMarkup: svgString
                    });
                }
            };
            img.src = url;
        });
    }

    window.saveCurrentLayout = async function () {
        const title = document.getElementById('layout-new-title').value.trim();
        const keyword = document.getElementById('layout-new-keyword').value.trim();
        const desc = document.getElementById('layout-new-desc').value.trim();

        if (!title || !keyword) {
            window.showToast(window.t('tst_layout_need_title', "Titolo e Keyword sono richiesti per salvare il layout"), "warning");
            return;
        }

        if (!appState.savedLayouts) {
            appState.savedLayouts = [];
        }

        // Check limit only when creating a new layout
        if (!window.currentEditingLayoutId && appState.savedLayouts.length >= 5) {
            window.showToast(window.t('tst_layout_limit', "Hai raggiunto il limite massimo di 5 layout salvati. Cancellane uno prima di procedere."), "error");
            return;
        }

        window.showToast(window.t('tst_capturing', "Cattura in corso..."), "info");

        // 1. Cattura anteprima immagine e markup SVG
        const previewImg = document.getElementById('layout-current-preview-img');
        let previewDataUrl = previewImg ? previewImg.src : null;
        let svgMarkup = previewImg ? decodeURIComponent(previewImg.getAttribute('data-svg-markup') || '') : '';

        if (!previewDataUrl || !svgMarkup) {
            const previewData = await getSVGPreviewDataURL();
            if (previewData) {
                previewDataUrl = previewData.preview;
                svgMarkup = previewData.svgMarkup;
            }
        }

        // 2. Cattura coordinate nodi
        const nodePositions = {};
        appState.db.nodes.forEach(n => {
            nodePositions[n.id] = { x: n.x, y: n.y, fx: n.fx, fy: n.fy, pinned: n.pinned };
        });

        // 3. Cattura zoom e pan
        let viewState = { x: 0, y: 0, k: 1 };
        const svgEl = document.getElementById("map-svg");
        if (svgEl && typeof d3 !== 'undefined') {
            const trans = d3.zoomTransform(svgEl);
            viewState = { x: trans.x, y: trans.y, k: trans.k };
        }

        if (window.currentEditingLayoutId) {
            // Aggiorna layout esistente
            const idx = appState.savedLayouts.findIndex(l => l.id === window.currentEditingLayoutId);
            if (idx !== -1) {
                appState.savedLayouts[idx].name = title;
                appState.savedLayouts[idx].keyword = keyword.toUpperCase();
                appState.savedLayouts[idx].desc = desc;
                appState.savedLayouts[idx].preview = previewDataUrl;
                appState.savedLayouts[idx].svgMarkup = svgMarkup;
                appState.savedLayouts[idx].positions = nodePositions;
                appState.savedLayouts[idx].viewState = viewState;
                window.showToast(window.t('tst_layout_updated', 'Layout "{x}" aggiornato correttamente!').replace('{x}', title), "success");
            } else {
                window.currentEditingLayoutId = null;
            }
        }

        if (!window.currentEditingLayoutId) {
            // Crea nuovo layout
            const newLayout = {
                id: 'layout_' + Date.now(),
                name: title,
                keyword: keyword.toUpperCase(),
                desc: desc,
                preview: previewDataUrl,
                svgMarkup: svgMarkup,
                positions: nodePositions,
                viewState: viewState
            };
            appState.savedLayouts.push(newLayout);
            window.showToast(window.t('tst_layout_saved', 'Layout "{x}" salvato correttamente!').replace('{x}', title), "success");
        }

        StorageManager.saveCurrentProject();
        window.renderSavedLayoutsList();

        // Reset indicator state after saving
        window.resetLayoutModalToNew();
    };

    window.renderSavedLayoutsList = function () {
        const container = document.getElementById('layout-saved-list');
        if (!container) return;

        const layouts = appState.savedLayouts || [];
        if (layouts.length === 0) {
            container.innerHTML = '<p class="text-sm text-slate-400 italic">Nessun layout salvato in questo progetto.</p>';
            return;
        }

        container.innerHTML = layouts.map((lay, idx) => {
            return `
                <div class="layout-card">
                    <div class="layout-thumb bg-white border border-slate-200 rounded-lg overflow-hidden flex items-center justify-center">
                        ${lay.preview ? `<img src="${lay.preview}" />` : `<i data-lucide="image" class="w-8 h-8 text-slate-300"></i>`}
                    </div>
                    <div class="flex-grow flex flex-col justify-between">
                        <div>
                            <div class="flex items-center gap-2 mb-1">
                                <span class="px-2 py-0.5 bg-indigo-100 text-indigo-700 text-[10px] font-bold rounded uppercase">${lay.keyword}</span>
                                <h4 class="text-sm font-bold text-slate-800">${lay.name}</h4>
                            </div>
                            <p class="text-xs text-slate-500 line-clamp-2">${lay.desc || 'Nessuna descrizione.'}</p>
                        </div>
                        <div class="flex flex-wrap items-center gap-2 mt-2">
                            <button onclick="window.applySavedLayout('${lay.id}')" class="px-3 py-1.5 bg-indigo-600 text-white font-bold rounded-lg text-xs hover:bg-indigo-700 transition flex items-center gap-1">
                                <i data-lucide="play" class="w-3 h-3"></i> Applica
                            </button>
                            <button onclick="window.editSavedLayout('${lay.id}')" class="px-3 py-1.5 bg-amber-500 text-white font-bold rounded-lg text-xs hover:bg-amber-600 transition flex items-center gap-1" title="Modifica layout">
                                <i data-lucide="edit-3" class="w-3 h-3"></i> Modifica
                            </button>
                            <button onclick="window.exportLayoutPDF('${lay.id}')" class="px-3 py-1.5 bg-slate-100 text-slate-600 font-bold rounded-lg text-xs hover:bg-slate-200 transition flex items-center gap-1" title="Esporta scheda in PDF">
                                <i data-lucide="file-text" class="w-3 h-3"></i> PDF
                            </button>
                            <button onclick="window.deleteSavedLayout('${lay.id}')" class="p-1.5 text-slate-300 hover:text-red-500 transition ml-auto" title="Elimina Layout">
                                <i data-lucide="trash-2" class="w-4 h-4"></i>
                            </button>
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        if (window.safeCreateIcons) window.safeCreateIcons();
    };

    window.editSavedLayout = function (layoutId) {
        const layout = appState.savedLayouts.find(l => l.id === layoutId);
        if (!layout) return;

        window.currentEditingLayoutId = layoutId;

        // Popola form
        document.getElementById('layout-new-title').value = layout.name || '';
        document.getElementById('layout-new-keyword').value = layout.keyword || '';
        document.getElementById('layout-new-desc').value = layout.desc || '';

        // Mostra indicatore di modifica
        const editIndicator = document.getElementById('layout-edit-indicator');
        const editName = document.getElementById('layout-edit-name');
        if (editIndicator && editName) {
            editName.innerText = layout.name;
            editIndicator.classList.remove('hidden');
            editIndicator.classList.add('flex');
        }

        // Abilita il bottone di conferma modifica "Salva"
        const editBtn = document.getElementById('layout-confirm-edit-btn');
        if (editBtn) {
            editBtn.removeAttribute('disabled');
            editBtn.classList.remove('opacity-50', 'cursor-not-allowed');
        }

        // Applica posizioni temporanee sulla mappa per consentire all'utente di vederle/modificarle
        appState.db.nodes.forEach(n => {
            const savedPos = layout.positions[n.id];
            if (savedPos) {
                n.x = savedPos.x;
                n.y = savedPos.y;
                n.fx = savedPos.fx;
                n.fy = savedPos.fy;
                n.pinned = savedPos.pinned;
            }
        });

        // Applica inquadratura zoom e pan
        const svgEl = document.getElementById("map-svg");
        if (svgEl && typeof d3 !== 'undefined' && zoom) {
            d3.select("#map-svg").transition().duration(750).call(
                zoom.transform,
                d3.zoomIdentity.translate(layout.viewState.x, layout.viewState.y).scale(layout.viewState.k)
            );
        }

        renderGraph();

        // Forza aggiornamento anteprima nel modale dopo il completamento della transizione
        setTimeout(() => {
            window.updateLayoutPreviewDirect();
        }, 850);
    };

    window.resetLayoutModalToNew = function () {
        window.currentEditingLayoutId = null;
        document.getElementById('layout-new-title').value = '';
        document.getElementById('layout-new-keyword').value = '';
        document.getElementById('layout-new-desc').value = '';

        const editIndicator = document.getElementById('layout-edit-indicator');
        if (editIndicator) {
            editIndicator.classList.add('hidden');
            editIndicator.classList.remove('flex');
        }

        // Disabilita il bottone di conferma modifica "Salva"
        const editBtn = document.getElementById('layout-confirm-edit-btn');
        if (editBtn) {
            editBtn.setAttribute('disabled', 'true');
            editBtn.classList.add('opacity-50', 'cursor-not-allowed');
        }

        window.updateLayoutPreviewDirect();
    };

    window.saveCurrentLayoutEditConfirm = async function () {
        if (!window.currentEditingLayoutId) {
            window.showToast(window.t('tst_no_layout_editing', "Nessun layout in fase di modifica da aggiornare."), "warning");
            return;
        }
        await window.saveCurrentLayout();
    };

    window.toggleMinimizeLayoutModal = function () {
        const box = document.getElementById('layout-manager-box');
        const minBtn = document.getElementById('layout-minimize-btn');
        if (!box) return;

        const isMinimized = box.classList.toggle('minimized-layout-box');

        if (minBtn) {
            if (isMinimized) {
                // Riduci
                minBtn.innerHTML = `<i data-lucide="maximize-2" class="w-6 h-6"></i>`;
                // Pulisci stili di resize per applicare quelli fissi da CSS
                box.style.width = '';
                box.style.height = '';
            } else {
                // Ripristina
                minBtn.innerHTML = `<i data-lucide="minimize-2" class="w-6 h-6"></i>`;
                box.style.width = '';
                box.style.height = '';
                box.style.left = '';
                box.style.top = '';
                box.style.transform = '';
            }
        }
        if (window.safeCreateIcons) window.safeCreateIcons();
    };

    window.applySavedLayout = function (layoutId) {
        const layout = appState.savedLayouts.find(l => l.id === layoutId);
        if (!layout) return;

        // Applica posizioni ai nodi
        appState.db.nodes.forEach(n => {
            const savedPos = layout.positions[n.id];
            if (savedPos) {
                n.x = savedPos.x;
                n.y = savedPos.y;
                n.fx = savedPos.fx;
                n.fy = savedPos.fy;
                n.pinned = savedPos.pinned;
            }
        });

        // Applica inquadratura zoom e pan
        const svgEl = document.getElementById("map-svg");
        if (svgEl && typeof d3 !== 'undefined' && zoom) {
            d3.select("#map-svg").transition().duration(750).call(
                zoom.transform,
                d3.zoomIdentity.translate(layout.viewState.x, layout.viewState.y).scale(layout.viewState.k)
            );
        }

        // Imposta layoutMode a custom_layoutId per il ciclo
        appState.layoutMode = 'custom_' + layoutId;
        const btn = document.getElementById('card-btn-layout');
        const span = document.getElementById('layout-label-text');
        if (btn && span) {
            btn.classList.add('bg-indigo-100', 'text-indigo-600');
            btn.classList.remove('bg-slate-100', 'text-slate-600');
            span.innerText = layout.keyword;
        }

        renderGraph();
        window.closeLayoutModal();
        window.showToast(window.t('tst_layout_applied', 'Layout "{x}" applicato!').replace('{x}', layout.name), "success");
    };

    window.deleteSavedLayout = function (layoutId) {
        if (!confirm("Sei sicuro di voler eliminare questo layout?")) return;

        appState.savedLayouts = appState.savedLayouts.filter(l => l.id !== layoutId);
        StorageManager.saveCurrentProject();
        window.showToast(window.t('tst_layout_deleted', "Layout eliminato"), "info");
        window.renderSavedLayoutsList();
    };

    window.exportLayoutPDF = async function (layoutId) {
        const layout = appState.savedLayouts.find(l => l.id === layoutId);
        if (!layout) return;

        try {
            window.showToast(window.t('tst_pdf_exporting', "Esportazione PDF scheda in corso..."), "info");
            const pdf = await window.buildLayoutPDFDocument({
                title: layout.name,
                keyword: layout.keyword,
                desc: layout.desc,
                svgMarkup: layout.svgMarkup,
                previewDataUrl: layout.preview
            });

            const isCapacitor = typeof window !== 'undefined' && window.Capacitor !== undefined;
            if (isCapacitor) {
                const blob = pdf.output('blob');
                const file = new File([blob], `Scheda_Layout_${layout.keyword}.pdf`, { type: 'application/pdf' });
                if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
                    await navigator.share({
                        files: [file],
                        title: `Scheda Layout ${layout.name}`,
                        text: `Scheda esportata del layout ${layout.name}`
                    });
                    window.showToast(window.t('tst_sheet_shared', "Scheda condivisa con successo!"), "success");
                } else {
                    throw new Error("Condivisione non supportata.");
                }
            } else {
                pdf.save(`Scheda_Layout_${layout.keyword}.pdf`);
                window.showToast(window.t('tst_sheet_saved', "Scheda PDF salvata con successo!"), "success");
            }
        } catch (e) {
            console.error(e);
            window.showToast(window.t('tst_pdf_export_error', "Errore esportazione PDF: ") + e.message, "error");
        }
    };

    window.exportCurrentLayoutPDFDirect = async function () {
        const title = document.getElementById('layout-new-title').value.trim() || "Layout Corrente";
        const keyword = document.getElementById('layout-new-keyword').value.trim() || "";
        const desc = document.getElementById('layout-new-desc').value.trim() || "Nessuna descrizione inserita.";

        try {
            window.showToast(window.t('tst_pdf_generating', "Generazione PDF scheda in corso..."), "info");
            const previewData = await getSVGPreviewDataURL();
            if (!previewData) throw new Error("Impossibile catturare l'anteprima");

            const pdf = await window.buildLayoutPDFDocument({
                title: title,
                keyword: keyword,
                desc: desc,
                svgMarkup: previewData.svgMarkup,
                previewDataUrl: previewData.preview
            });

            const isCapacitor = typeof window !== 'undefined' && window.Capacitor !== undefined;
            if (isCapacitor) {
                const blob = pdf.output('blob');
                const file = new File([blob], `Scheda_Layout_${title.replace(/\s+/g, '_')}.pdf`, { type: 'application/pdf' });
                if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
                    await navigator.share({
                        files: [file],
                        title: `Scheda Layout ${title}`,
                        text: `Scheda esportata del layout ${title}`
                    });
                    window.showToast(window.t('tst_sheet_shared', "Scheda condivisa con successo!"), "success");
                } else {
                    throw new Error("Condivisione non supportata.");
                }
            } else {
                pdf.save(`Scheda_Layout_${title.replace(/\s+/g, '_')}.pdf`);
                window.showToast(window.t('tst_sheet_saved', "Scheda PDF salvata con successo!"), "success");
            }
        } catch (e) {
            console.error(e);
            window.showToast(window.t('tst_pdf_export_error', "Errore esportazione PDF: ") + e.message, "error");
        }
    };

    window.exportCurrentLayoutPDFToVault = async function () {
        const title = document.getElementById('layout-new-title').value.trim() || "Layout Corrente";
        const keyword = document.getElementById('layout-new-keyword').value.trim() || "LAYOUT";
        const desc = document.getElementById('layout-new-desc').value.trim() || "Nessuna descrizione inserita.";

        if (!appState.activeVaultPath) {
            window.showToast(window.t('tst_no_vault', "Nessun Vault attivo. Collega o crea un Vault per salvare."), "warning");
            return;
        }

        try {
            window.showToast(window.t('tst_pdf_vault_exporting', "Generazione ed esportazione PDF nel Vault in corso..."), "info");
            const previewData = await getSVGPreviewDataURL();
            if (!previewData) throw new Error("Impossibile catturare l'anteprima");

            const pdf = await window.buildLayoutPDFDocument({
                title: title,
                keyword: keyword,
                desc: desc,
                svgMarkup: previewData.svgMarkup,
                previewDataUrl: previewData.preview
            });

            // Get base64 string from PDF
            const pdfBase64 = pdf.output('datauristring').split(',')[1];
            const fileName = `Scheda_Layout_${keyword.replace(/\s+/g, '_') || Date.now()}.pdf`;

            const res = await window.electronAPI.savePDFToVault({
                base64Data: pdfBase64,
                fileName: fileName,
                vaultPath: appState.activeVaultPath
            });

            if (res.success) {
                window.showToast(window.t('tst_pdf_vault_ok', 'Scheda PDF esportata con successo nel Vault: {x}').replace('{x}', fileName), "success");
            } else {
                throw new Error(res.error);
            }
        } catch (e) {
            console.error(e);
            window.showToast(window.t('tst_pdf_vault_error', "Errore esportazione PDF nel Vault: ") + e.message, "error");
        }
    };

    // Helper functions for PDF fonts and images loading
    async function loadSpaceMonoFont(pdf) {
        try {
            const regularUrl = 'https://raw.githubusercontent.com/googlefonts/spacemono/main/fonts/ttf/SpaceMono-Regular.ttf';
            const boldUrl = 'https://raw.githubusercontent.com/googlefonts/spacemono/main/fonts/ttf/SpaceMono-Bold.ttf';

            const [regRes, boldRes] = await Promise.all([
                fetch(regularUrl).then(res => res.arrayBuffer()),
                fetch(boldUrl).then(res => res.arrayBuffer())
            ]);

            const regBase64 = arrayBufferToBase64(regRes);
            const boldBase64 = arrayBufferToBase64(boldRes);

            pdf.addFileToVFS('SpaceMono-Regular.ttf', regBase64);
            pdf.addFont('SpaceMono-Regular.ttf', 'Space Mono', 'normal');

            pdf.addFileToVFS('SpaceMono-Bold.ttf', boldBase64);
            pdf.addFont('SpaceMono-Bold.ttf', 'Space Mono', 'bold');
        } catch (err) {
            console.error("Failed to load Space Mono font from GitHub, using default fallback:", err);
        }
    }

    function arrayBufferToBase64(buffer) {
        let binary = '';
        const bytes = new Uint8Array(buffer);
        const len = bytes.byteLength;
        for (let i = 0; i < len; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return window.btoa(binary);
    }

    window.loadMappaiIconBase64 = async function () {
        try {
            const response = await fetch('MappAI_icon.png');
            const blob = await response.blob();
            return new Promise((resolve) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result);
                reader.readAsDataURL(blob);
            });
        } catch (e) {
            console.error("Failed to load Mappai logo:", e);
            return null;
        }
    }

    window.buildLayoutPDFDocument = async function ({ title, keyword, desc, svgMarkup, previewDataUrl }) {
        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF({
            orientation: 'portrait',
            unit: 'mm',
            format: 'a4'
        });

        // Register fonts
        await loadSpaceMonoFont(pdf);

        // Load and add MappAI logo icon
        const logoBase64 = await loadMappaiIconBase64();
        if (logoBase64) {
            pdf.addImage(logoBase64, 'PNG', 15, 10, 12, 12);
        }

        pdf.setFont("Space Mono", "bold");
        pdf.setFontSize(16);
        pdf.setTextColor(30, 41, 59);
        pdf.text("MappAI", 30, 18);

        pdf.setFont("Space Mono", "normal");
        pdf.setFontSize(9);
        pdf.setTextColor(100, 116, 139);
        pdf.text("Scheda Studio Vettoriale", 30, 22);

        const projectName = appState.db?.rootNodeLabel || appState.rootNodeLabel || "Mappa Senza Nome";
        pdf.text(`Progetto: ${projectName}`, 15, 29);
        pdf.text(`Data creazione: ${new Date().toLocaleDateString()}`, 15, 34);

        if (appState.userProfile && appState.userProfile.nickname) {
            let profileInfo = `Autore: ${appState.userProfile.nickname}`;
            if (appState.userProfile.grade) {
                profileInfo += ` - Classe: ${appState.userProfile.grade}`;
            }
            pdf.text(profileInfo, 140, 29);
        }

        pdf.setLineWidth(0.2);
        pdf.setDrawColor(226, 232, 240);
        pdf.line(15, 38, 195, 38);

        // Titolo Layout
        pdf.setFont("Space Mono", "bold");
        pdf.setFontSize(14);
        pdf.setTextColor(30, 41, 59);
        const titleText = keyword ? `${title} [${keyword}]` : title;
        pdf.text(titleText, 15, 46);

        // Descrizione
        pdf.setFont("Space Mono", "normal");
        pdf.setFontSize(10);
        pdf.setTextColor(51, 65, 85);
        const descriptionLines = pdf.splitTextToSize(desc || "Nessuna descrizione inserita.", 180);
        let y = 53;
        for (let i = 0; i < descriptionLines.length; i++) {
            if (y > 270) {
                pdf.addPage();
                y = 20;
            }
            pdf.text(descriptionLines[i], 15, y);
            y += 5;
        }

        // Image size calculations
        let svgW = 800;
        let svgH = 600;
        let finalImageSrc = previewDataUrl;

        if (svgMarkup) {
            try {
                const parser = new DOMParser();
                const doc = parser.parseFromString(svgMarkup, "image/svg+xml");
                const svgEl = doc.documentElement;
                svgW = parseFloat(svgEl.getAttribute("width")) || 800;
                svgH = parseFloat(svgEl.getAttribute("height")) || 600;

                const highResImg = await new Promise((resolveHighRes, rejectHighRes) => {
                    const img = new Image();
                    const blob = new Blob([svgMarkup], { type: 'image/svg+xml;charset=utf-8' });
                    const url = URL.createObjectURL(blob);
                    img.onload = function () {
                        const canvas = document.createElement("canvas");
                        const aspect = svgW / svgH;
                        canvas.width = 1600;
                        canvas.height = 1600 / aspect;

                        const ctx = canvas.getContext("2d");
                        ctx.fillStyle = "#ffffff";
                        ctx.fillRect(0, 0, canvas.width, canvas.height);
                        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                        URL.revokeObjectURL(url);
                        resolveHighRes(canvas.toDataURL("image/png"));
                    };
                    img.onerror = function (err) {
                        URL.revokeObjectURL(url);
                        rejectHighRes(err);
                    };
                    img.src = url;
                });

                finalImageSrc = highResImg;
            } catch (err) {
                console.error("High res SVG render failed:", err);
            }
        }

        const aspect = svgW / svgH;
        let imgW, imgH, x;

        if (aspect >= 0.95) {
            imgW = 180;
            imgH = 180 / aspect;
            x = 15;
        } else {
            imgH = 178.2;
            imgW = imgH * aspect;
            if (imgW > 180) {
                imgW = 180;
                imgH = 180 / aspect;
            }
            x = 15 + (180 - imgW) / 2;
        }

        if (y + 10 + imgH > 270) {
            pdf.addPage();
            y = 20;
        } else {
            y += 10;
        }

        if (svgMarkup) {
            try {
                const parser = new DOMParser();
                const svgDoc = parser.parseFromString(svgMarkup, "image/svg+xml");
                const svgEl = svgDoc.documentElement;
                await pdf.svg(svgEl, {
                    x: x,
                    y: y,
                    width: imgW,
                    height: imgH
                });
            } catch (svgErr) {
                console.error("svg2pdf failed, falling back to PNG addImage:", svgErr);
                if (finalImageSrc) {
                    pdf.addImage(finalImageSrc, 'PNG', x, y, imgW, imgH);
                }
            }
        } else if (finalImageSrc) {
            pdf.addImage(finalImageSrc, 'PNG', x, y, imgW, imgH);
        }

        return pdf;
    };

    window.makeModalDraggable = function () {
        const modalBox = document.getElementById('layout-manager-box');
        const dragHandle = modalBox ? modalBox.querySelector('.modal-drag-handle') : null;
        if (!modalBox || !dragHandle) return;

        let isDragging = false;
        let startX, startY, initialLeft, initialTop;

        const dragStart = (e) => {
            if (e.target.closest('input, textarea, button')) return;

            isDragging = true;
            dragHandle.style.cursor = 'grabbing';
            modalBox.style.cursor = 'grabbing';

            const clientX = e.type === 'touchstart' ? e.touches[0].clientX : e.clientX;
            const clientY = e.type === 'touchstart' ? e.touches[0].clientY : e.clientY;

            startX = clientX;
            startY = clientY;

            const rect = modalBox.getBoundingClientRect();
            initialLeft = rect.left;
            initialTop = rect.top;

            modalBox.style.position = 'fixed';
            modalBox.style.margin = '0';
            modalBox.style.left = `${initialLeft}px`;
            modalBox.style.top = `${initialTop}px`;
            modalBox.style.transform = 'none';
        };

        const dragMove = (e) => {
            if (!isDragging) return;

            const clientX = e.type === 'touchmove' ? e.touches[0].clientX : e.clientX;
            const clientY = e.type === 'touchmove' ? e.touches[0].clientY : e.clientY;

            const dx = clientX - startX;
            const dy = clientY - startY;

            let nextLeft = initialLeft + dx;
            let nextTop = initialTop + dy;

            // Limiti per evitare che il modale esca dallo schermo
            const boxWidth = modalBox.offsetWidth || 1200;
            const maxW = window.innerWidth;
            const maxH = window.innerHeight;

            const minLeft = -boxWidth + 150;
            const maxLeft = maxW - 150;
            const minTop = 0; // Impedisce di trascinare il modale sopra la barra superiore dello schermo
            const maxTop = maxH - 100; // Impedisce che il modale sparisca del tutto in basso

            nextLeft = Math.max(minLeft, Math.min(nextLeft, maxLeft));
            nextTop = Math.max(minTop, Math.min(nextTop, maxTop));

            modalBox.style.left = `${nextLeft}px`;
            modalBox.style.top = `${nextTop}px`;
        };

        const dragEnd = () => {
            if (isDragging) {
                isDragging = false;
                dragHandle.style.cursor = 'move';
                modalBox.style.cursor = 'grab';
            }
        };

        dragHandle.addEventListener('mousedown', dragStart);
        document.addEventListener('mousemove', dragMove);
        document.addEventListener('mouseup', dragEnd);

        dragHandle.addEventListener('touchstart', dragStart, { passive: true });
        document.addEventListener('touchmove', dragMove, { passive: false });
        document.addEventListener('touchend', dragEnd);
    };

    // Gestione modale di conferma d'uscita (Escape) per il Fissa Layout
    window.showLayoutExitConfirmModal = function () {
        const modal = document.getElementById('layout-exit-confirm-modal');
        const box = document.getElementById('layout-exit-confirm-box');
        if (!modal || !box) return;
        modal.classList.remove('hidden');
        modal.classList.add('flex');
        setTimeout(() => {
            modal.classList.remove('opacity-0');
            box.classList.remove('scale-95');
        }, 10);
        if (window.safeCreateIcons) window.safeCreateIcons();
    };

    window.closeExitConfirmModal = function () {
        const modal = document.getElementById('layout-exit-confirm-modal');
        const box = document.getElementById('layout-exit-confirm-box');
        if (!modal || !box) return;
        modal.classList.add('opacity-0');
        box.classList.add('scale-95');
        setTimeout(() => {
            modal.classList.add('hidden');
            modal.classList.remove('flex');
        }, 200);
    };

    window.closeLayoutModalDirectWithoutSaving = function () {
        window.closeExitConfirmModal();
        window.closeLayoutModal();
    };

    window.saveLayoutAndClose = async function () {
        const saved = await window.saveCurrentLayout();
        // Se il salvataggio va a buon fine, chiudiamo i modali
        if (saved !== false) {
            window.closeExitConfirmModal();
            window.closeLayoutModal();
        }
    };
})();

document.addEventListener('DOMContentLoaded', () => {
    // Applica lo zoom salvato
    if (window.applyTextZoom) window.applyTextZoom(currentZoomIdx);

    // Applica Modalità Studente al caricamento
    if (window.applyStudentModeUI) window.applyStudentModeUI();

    // Inizializza grafici offline (Pomodoro sessioni e storico punteggi)
    if (window.updatePomodoroSessionsDisplay) window.updatePomodoroSessionsDisplay();
    if (window.updateStudyScoresDisplay) window.updateStudyScoresDisplay();

    // Rende il modale layout trascinabile
    if (window.makeModalDraggable) window.makeModalDraggable();
});

