/*
 * MappAI — nucleo del renderer
 * Copyright (C) 2026 Giacomo Meschini <giacomo@insegnai.ch>
 *
 * Questo programma è software libero: puoi ridistribuirlo e/o modificarlo
 * secondo i termini della GNU General Public License come pubblicata dalla
 * Free Software Foundation, nella versione 3 della Licenza o (a tua scelta)
 * in una versione successiva.
 *
 * Questo programma è distribuito nella speranza che sia utile, ma SENZA
 * ALCUNA GARANZIA; senza neppure la garanzia implicita di COMMERCIABILITÀ o
 * IDONEITÀ A UNO SCOPO PARTICOLARE. Vedi la GNU General Public License per
 * maggiori dettagli.
 *
 * Dovresti aver ricevuto una copia della GNU General Public License insieme a
 * questo programma. In caso contrario, vedi <https://www.gnu.org/licenses/>.
 *
 * I componenti di terze parti inclusi (font, librerie) restano sotto le loro
 * licenze: vedi THIRD-PARTY-NOTICES.md.
 */
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
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'js/pdf.worker.min.js';
} else {
    console.warn("pdfjsLib non caricato correttamente. L'estrazione da PDF potrebbe non funzionare.");
}

/* ── LE PAGINE E I TITOLI DEL PDF (11/9/26) ───────────────────────────────────
   Prima di oggi tutto il PDF veniva unito in una stringa sola con degli spazi:
   sparivano il numero di pagina (quindi nessuna citazione poteva dire «a pagina
   4») e i TITOLI delle sezioni — che pdf.js conosce benissimo, perché ogni pezzo
   di testo porta la sua altezza, e che l'app buttava via. Un docente vede a colpo
   d'occhio che il dossier ha una sezione economica; il modello no, e infatti la
   pagina economica è sparita da due mappe su due.
   `extractTextFromPDF` continua a restituire la stessa stringa di sempre (sei
   chiamanti, invariati); chi vuole di più chiama `extractPdfPages`. */
window.extractPdfPages = async function (file) {
    const arrayBuffer = await file.arrayBuffer();
    const pdfHash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', arrayBuffer)), byte => byte.toString(16).padStart(2, '0')).join('');
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer, isEvalSupported: false }).promise;
    const pages = [];
    const altezze = [];
    const grezzi = [];
    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        const rawText = content.items.map(item => item.str).join(" ");
        const rows = new Map();
        content.items.filter(item => item.str?.trim() && item.transform).forEach(item => {
            const y = Math.round(item.transform[5]);
            if (!rows.has(y)) rows.set(y, []);
            rows.get(y).push(item.transform[4]);
        });
        const tableLike = [...rows.values()].filter(xs => xs.length >= 4 && Math.max(...xs) - Math.min(...xs) > 200).length >= 3;
        pages.push({ n: i, text: rawText, ...(tableLike ? { extractionWarning: 'possible_table_or_columns' } : {}) });
        // altezza del glifo: `height`, o la scala verticale della matrice
        content.items.forEach(it => {
            const h = it.height || (it.transform && Math.abs(it.transform[3])) || 0;
            const s = String(it.str || '').trim();
            if (h > 0 && s) { altezze.push(h); grezzi.push({ h, s, n: i }); }
        });
    }
    /* ── COME SI RICONOSCE UN TITOLO ──────────────────────────────────────────
       Due criteri, in OR, perché da soli non bastano:
       (a) testo BREVE scritto più in grande della mediana (soglia +15%). Funziona
           sui documenti impaginati con una gerarchia tipografica;
       (b) testo che comincia con «1.» / «2)» — la numerazione delle sezioni.

       ⚠️ Il criterio (b) non è un di più: misurato sul dossier di Storia della
       4a Media, TUTTI i 381 pezzi di testo hanno la STESSA altezza (11,49) —
       titoli compresi. Col solo criterio (a) l'indice usciva vuoto. Con (b) escono
       esattamente le quattro sezioni vere, fra cui «2. L'economia svizzera», che è
       proprio la parte sparita dalle mappe.

       ⚠️ Il FONT non si usa come criterio, benché lì i titoli siano in un font
       diverso: provato, dà 121 candidati su quel PDF, quasi tutti grassetti in
       mezzo ai paragrafi («piano Wahlen», «razionamento»). Un indice di rumore è
       peggio di nessun indice. */
    let titoli = [];
    const ord = altezze.slice().sort((a, b) => a - b);
    const mediana = ord.length ? ord[Math.floor(ord.length / 2)] : 0;
    const soglia = mediana * 1.15;
    /* ⚠️ dopo il numero basta UN carattere non-spazio, non tre: misurato sul
       dossier vero, tre titoli su quattro cominciano con «La» — con `\S{3,}`
       ne usciva uno solo. A tenere fuori le briciole ci pensa la lunghezza
       minima qui sotto. */
    const numerato = /^\d{1,2}[.)]\s+\S/;
    const visti = new Set();
    grezzi.forEach(g => {
        const grande = (altezze.length > 20 && mediana > 0 && g.h >= soglia);
        if (!grande && !numerato.test(g.s)) return;
        if (g.s.length < 8 || g.s.length > 90) return;
        if (/^[\d\s.,;:–—-]+$/.test(g.s)) return;                 // numeri di pagina
        const k = g.s.toLowerCase();
        if (visti.has(k)) return;                                  // intestazione ripetuta
        visti.add(k);
        titoli.push({ page: g.n, text: g.s });
    });
    if (titoli.length > 24) titoli = titoli.slice(0, 24);          // un indice, non un secondo documento
    return { text: pages.map(p => p.text).join('\n'), pages, titoli, pdfHash };
};

window.extractTextFromPDF = async function (file) {
    const r = await window.extractPdfPages(file);
    return r.text;
};



window.getSystemKey = function () {
    const isInfomaniak = ((appState._reviewAIContext?.provider || appState.aiProvider) === 'infomaniak');
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
    const provider = appState._reviewAIContext?.provider || appState.aiProvider;
    const modelEl = document.getElementById('model-select');
    // Fallback a localStorage: il DOM può essere null durante le fasi async
    // del multi-pass (loop rami, Phase4, Phase5) → il modello non viene rilevato
    // → moltiplicatori ignorati → budget troppo piccolo → troncamenti.
    // Stesso pattern già usato in fetchModelAPI.
    const storageKey = (provider === 'infomaniak') ? 'infomaniak_selected_model' : 'gemini_selected_model';
    const model = (appState._reviewAIContext?.model || (modelEl ? modelEl.value : '') || localStorage.getItem(storageKey) || '').toLowerCase();
    if (provider === 'infomaniak') {
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
    const provider = appState._reviewAIContext?.provider || appState.aiProvider;
    const modelEl = document.getElementById('model-select');
    let model = appState._reviewAIContext?.model || (modelEl ? modelEl.value : null);
    if (!model) {
        const storageKey = (provider === 'infomaniak') ? 'infomaniak_selected_model' : 'gemini_selected_model';
        model = localStorage.getItem(storageKey);
    }
    if (!model) {
        model = (provider === 'google' ? 'gemini-2.0-flash' : 'mistral-small-4-119B-2603');
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
    if (provider === 'google' && /(?:^|\/)gemini-3\.8-flash(?:$|-)/i.test(model || '')) {
        // 3.8 uses thinkingLevel and no sampling parameters. Normalize here
        // before both Electron IPC and the browser adapter see the request.
        // https://ai.google.dev/gemini-api/docs/generate-content/latest-model
        const gc = { ..._gcfg }, thinking = { ...gc.thinkingConfig };
        ['temperature', 'topP', 'topK', 'candidateCount'].forEach(key => { delete gc[key]; });
        const small = gc.maxOutputTokens > 0 && gc.maxOutputTokens <= 12288;
        const level = String(thinking.thinkingLevel || '').toLowerCase();
        if (['low', 'medium', 'high'].includes(level)) thinking.thinkingLevel = level;
        else if (level || thinking.thinkingBudget != null || small) {
            thinking.thinkingLevel = level === 'minimal' || thinking.thinkingBudget === 0 || small ? 'low' : 'medium';
        }
        delete thinking.thinkingBudget;
        if (Object.keys(thinking).length) gc.thinkingConfig = thinking;
        else delete gc.thinkingConfig;
        payload = { ...payload, generationConfig: gc };
    } else if (provider === 'google' &&
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

    /* QUANTI ITEM SONO STATI CHIESTI (12/9). Non serve farlo viaggiare dai
       moduli: ogni generatore di materiali mette il numero nello schema come
       `maxItems` dell'array esterno — flashcard, quiz a scelta, vero/falso,
       domande aperte. Leggerlo qui vale per tutti e non tocca un solo chiamante.
       Dove non c'è un array (fasi della mappa, sintesi, tutor) resta null, che
       è la verità: quella chiamata non chiede un numero di cose. */
    const _schema = payload?.generationConfig?.responseSchema;
    const chiesti = (_schema && _schema.type === 'ARRAY' && _schema.maxItems) || null;

    // Registro consumi: snapshot del contesto ALL'ENTRATA (non dopo l'await:
    // un altro flusso potrebbe cambiare il contesto mentre la risposta arriva)
    const _usageCtx = (window.MappAIUsage && window.MappAIUsage.current()) || null;

    if (window.electronAPI) {
        try {
            let response;
            if (provider === 'infomaniak') {
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

            /* ⚠️ LA RILEVAZIONE DEL TRONCAMENTO SALE QUI (12/9), sopra il registro
               consumi: prima stava sotto, e la riga del registro partiva senza
               sapere perché la chiamata si fosse fermata. Quel verdetto finiva
               solo in `MappAITruncationTracker`, che vive in RAM e muore a fine
               sessione — così sul disco restava un numero di token e nessun
               modo di sapere se era una risposta finita o una tagliata. */
            const { finishReason, truncated } = _detectTruncation(response);

            // Tracking Usage
            if (response && response.usageMetadata) {
                if (!appState.generationUsage) appState.generationUsage = { promptTokens: 0, candidateTokens: 0, totalTokens: 0 };
                appState.generationUsage.promptTokens += (response.usageMetadata.promptTokenCount || 0);
                appState.generationUsage.candidateTokens += (response.usageMetadata.candidatesTokenCount || 0);
                appState.generationUsage.totalTokens += (response.usageMetadata.totalTokenCount || 0);
                window.updateCostDisplay();
                // Registro consumi AI (riga JSONL su disco, categoria dal contesto)
                /* I QUATTRO CAMPI DEL 12/9. Il registro sapeva quanti token erano
                   usciti e nient'altro, e per questo la domanda «abbassare il
                   numero di domande riduce i troncamenti?» non aveva risposta:
                   mancava il denominatore (`n`), mancava il motivo dello stop, e
                   `outTok` conta solo la risposta mentre il tetto lo riempiono
                   anche i token di PENSIERO — sopra le 8 domande per ramo il
                   pensiero si riaccende (getMaxOutputTokens > 12288, vedi la
                   soglia qui sopra) e una chiamata svuotata da lui si scriveva
                   come una chiamata piccola e tranquilla.
                   Sono tutti già calcolati poche righe più su: costano quattro
                   chiavi in più per riga e rendono ogni generazione leggibile
                   da sola, senza indovinare il troncamento dai valori ripetuti. */
                if (window.MappAIUsage) window.MappAIUsage.record({
                    provider: provider,
                    model,
                    inTok: response.usageMetadata.promptTokenCount || 0,
                    outTok: response.usageMetadata.candidatesTokenCount || 0,
                    thoughts: response.usageMetadata.thoughtsTokenCount || 0,
                    n: chiesti,
                    stop: finishReason,
                    tetto: requestedMax,
                    ctx: _usageCtx
                });
            }

            // Strategia 0 — troncamento (il verdetto è calcolato sopra)
            window.MappAITruncationTracker.record({
                model,
                provider: provider,
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
        inputHtml = '<input type="file" multiple accept=".pdf,.txt,.csv,.md,.rtf,.docx,.jpg,.jpeg,.png,.heic,.heif" class="landing-input shadow-none mb-1 text-sm file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100 cursor-pointer" data-source-id="' + id + '" onchange="window.handleFileUpload(this, \'doc\')"><p class="text-[10px] text-slate-400">' + (window.t ? window.t('src_docs_nota', 'Testi (PDF incluso) e IMMAGINI: una foto diventa un dossier di fonte.') : 'Testi (PDF incluso) e IMMAGINI: una foto diventa un dossier di fonte.') + '</p>';
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
    /* togliendo una fonte-immagine, MM/KG e il tema tornano vivi */
    if (window.MappAIVisione && window.MappAIVisione.sincronizzaGenere) window.MappAIVisione.sincronizzaGenere();
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
        const parsed = await window.extractPdfPages(file);
        const text = parsed.text; sourceObj.pages = parsed.pages; sourceObj.pdfHash = parsed.pdfHash;
        sourceObj.content = text;
        statusEl.innerHTML = '<i data-lucide="check" class="w-3 h-3 inline"></i> PDF pronto (' + sizeMB + ' MB).';
        window.updateTokenCounter();
    } catch (e) {
        statusEl.innerHTML = '<i data-lucide="alert-circle" class="w-3 h-3 inline text-red-400"></i> Errore estrazione.';
    }

    window.safeCreateIcons();
    window.handleSourceAutofill(file.name);
    if (sourceObj.pages) window.MappAILocalSearch?.prepare(sourceObj, statusEl);
}

window.processSourceFile = async function (sourceObj, file, statusEl) {
    if (!file || !sourceObj || !statusEl) return;

    const fileName = file.name.toLowerCase();
    const sizeMB = (file.size / (1024 * 1024)).toFixed(1);

    statusEl.innerHTML = '<i data-lucide="loader-2" class="w-3 h-3 inline animate-spin"></i> Lettura file...';

    try {
        /* ── UN'IMMAGINE SI RICONOSCE DA SÉ (20/8, richiesta di Giacomo) ─────
           «Documenti» accetta anche le foto: il genere lo dice l'estensione
           (`MappAIVisioneCore.accetta`), non un bottone a parte. Una foto non
           produce testo per la mappa: apre la SCHEDA DI ANALISI, e da lì il
           DOSSIER — quindi il ramo esce qui, prima dell'estrazione testuale. */
        if (window.MappAIVisioneCore && window.MappAIVisioneCore.accetta && window.MappAIVisioneCore.accetta(fileName)) {
            await window.leggiImmagineSorgente(sourceObj, file, statusEl);
            return;
        }
        let text = "";
        if (fileName.endsWith('.pdf')) {
            const parsed = await window.extractPdfPages(file);
            text = parsed.text; sourceObj.pages = parsed.pages; sourceObj.pdfHash = parsed.pdfHash;
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
    if (fileName.endsWith('.pdf') && sourceObj.pages) window.MappAILocalSearch?.prepare(sourceObj, statusEl);
};

/* ── LE IMMAGINI (20/8): dalla foto alla SCHEDA, al caricamento ────────────
   Chiamata da `processSourceFile` quando «Documenti» riconosce una foto
   dall'estensione. Apre la scheda di analisi; quella confermata si scrive su
   `src._scheda` — è da lì che «Genera materiali» (`_schedeImmagini` nella
   pipeline) sa che cosa trasformare in dossier. Poi MM/KG e il tema si
   disabilitano: con una fonte iconografica non c'è una mappa da impostare. */
window.leggiImmagineSorgente = async function (src, file, statusEl) {
    src.path = (window.electronAPI && window.electronAPI.getPathForFile) ? window.electronAPI.getPathForFile(file) : file.path;
    src.mimeType = file.type;
    statusEl.innerHTML = '<i data-lucide="loader-2" class="w-3 h-3 inline animate-spin"></i> ' + (window.t ? window.t('src_img_leggo', 'Analisi in corso…') : 'Analisi in corso…');
    window.safeCreateIcons();
    try {
        const scheda = (window.MappAIVisione && window.MappAIVisione.nuovaScheda)
            ? await window.MappAIVisione.nuovaScheda(file) : null;
        if (scheda && scheda.__scarta) {
            /* «Non usare questa foto»: la fonte se ne va del tutto — una riga
               che resta direbbe che c'è qualcosa in coda, e non c'è */
            window.removeSource(src.id);
            return;
        }
        if (scheda) {
            src._scheda = scheda;
            statusEl.className = 'text-[10px] text-emerald-400 mt-1 font-bold';
            statusEl.innerHTML = '<i data-lucide="check" class="w-3 h-3 inline"></i> ' + file.name + ' — ' +
                (window.t ? window.t('src_img_ok', 'scheda confermata: farà un dossier') : 'scheda confermata: farà un dossier');
        } else {
            /* annullata: la fonte resta, ma senza scheda non fa dossier — e la
               riga lo DICE, o il docente crederebbe di averla in coda */
            src._scheda = null;
            statusEl.className = 'text-[10px] text-amber-500 mt-1 font-bold';
            statusEl.innerHTML = '<i data-lucide="alert-circle" class="w-3 h-3 inline"></i> ' + file.name + ' — ' +
                (window.t ? window.t('src_img_no', 'scheda annullata: togli la fonte o ricaricala') : 'scheda annullata: togli la fonte o ricaricala');
        }
    } catch (e) {
        src._scheda = null;
        statusEl.className = 'text-[10px] text-red-400 mt-1 font-bold';
        statusEl.innerHTML = '<i data-lucide="alert-circle" class="w-3 h-3 inline"></i> ' + (e.message || 'errore');
    }
    window.safeCreateIcons();
    if (window.MappAIVisione && window.MappAIVisione.sincronizzaGenere) window.MappAIVisione.sincronizzaGenere();
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
    /* pagine + titoli dei PDF di QUESTA generazione: alimentano l'àncora e
       l'indice del documento in Fase 1. Vuoto se le fonti non sono PDF. */
    var _pdfPagine = [];
    var _readWebSources = [];
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
                        _readWebSources.push({ id: src.id, title: res.title || urlVal, url: urlVal, acquiredAt: new Date().toISOString(), origin: src.origin === 'reference' ? 'reference' : 'original', content: res.text });
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
                let _pdf = await window.extractPdfPages(src.file);
                let pdfText = _pdf.text;
                if (pdfText.trim()) {
                    textParts.push("[FONTE PDF " + src.file.name + "]:\n" + pdfText);
                    /* pagine e titoli viaggiano a parte: servono all'ANCORA (le
                       citazioni sanno da che pagina vengono) e alla Fase 1 (i
                       titoli del dossier come indice). Il prompt non cambia. */
                    _pdfPagine.push({ nome: src.file.name, pages: _pdf.pages, titoli: _pdf.titoli, pdfHash: _pdf.pdfHash });
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
                let _pdf = await window.extractPdfPages(src.file);
                let pdfText = _pdf.text;
                if (pdfText.trim()) {
                    textParts.push("[FONTE PDF " + src.file.name + "]:\n" + pdfText);
                    /* pagine e titoli viaggiano a parte: servono all'ANCORA (le
                       citazioni sanno da che pagina vengono) e alla Fase 1 (i
                       titoli del dossier come indice). Il prompt non cambia. */
                    _pdfPagine.push({ nome: src.file.name, pages: _pdf.pages, titoli: _pdf.titoli, pdfHash: _pdf.pdfHash });
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

    // Archive original text before cleaning it for generation. Text/URL/DOCX
    // inputs may live only in textParts, while the source UI stores just an ID.
    var _reviewSourceSnapshot = _pdfPagine.map(function (doc) {
        return { nome: doc.nome, pdfHash: doc.pdfHash, pages: doc.pages.map(p => ({ n: p.n, text: p.text, ...(p.extractionWarning ? { extractionWarning: p.extractionWarning } : {}) })) };
    });
    _reviewSourceSnapshot.push(..._readWebSources);
    textParts.forEach(function (part, index) {
        if (/^\[FONTE (?:PDF|YOUTUBE|WEB)\b/.test(part)) return;
        var header = /^\[FONTE ([^\]]+)\]:\s*\n/.exec(part);
        var content = header ? part.slice(header[0].length) : part;
        if (content.trim()) _reviewSourceSnapshot.push({ id: 'text-' + index,
            title: header ? header[1] : 'Fonte ' + (index + 1), type: 'text', content: content });
    });

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

    /* ── PAGINE E INDICE DEL DOCUMENTO (11/9) ─────────────────────────────────
       Restano su appState per tutta la generazione: le pagine servono all'ANCORA
       (che gira a valle della Fase 3, dove `textParts` non arriva piu') e i titoli
       alla Fase 1. `_docOutline` e' testo gia' pronto da appendere a un prompt:
       chi lo usa non deve sapere com'e' fatto un PDF. */
    appState._pdfPagine = _pdfPagine;
    appState._docOutline = '';
    try {
        var _tt = [];
        _pdfPagine.forEach(function (f) {
            (f.titoli || []).forEach(function (t) { _tt.push('p.' + t.page + ' \u2014 ' + t.text); });
        });
        if (_tt.length >= 3) {
            appState._docOutline = '\n\nINDICE DEL DOCUMENTO (i titoli come compaiono nella fonte, in ordine). '
                + 'Dicono di quali parti e' + "'" + ' fatto il documento: copri TUTTE le sezioni, non solo le prime. '
                + 'NON copiarli come etichette se non sono adatti.\n' + _tt.join('\n') + '\n';
            console.log('[Outline] ' + _tt.length + ' titoli riconosciuti nella fonte');
        }
    } catch (e) { appState._docOutline = ''; }

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
    appState._pipelineManifest = null;
    appState._generationSources = _reviewSourceSnapshot;
    window.MappAILocalSearch?.schedule();
    appState._reviewRevision = undefined;
    appState._reviewRequested = !!(window.MappAIReview && window.MappAIReview.enabled());
    appState._judgeReport = appState._giudiceReport = null;
    appState._generationId = (globalThis.crypto && crypto.randomUUID) ? crypto.randomUUID() : 'gen-' + Date.now();
    window.MappAIGen.inizia(appState.rootNodeLabel, appState.extractionMode);
    /* Il contesto si congela anche qui, e per la stessa ragione: una MindMap
       multi-pass fa decine di chiamate su parecchi minuti, e la taratura si
       rilegge a ognuna. Il contesto della generazione si decide PRIMA (classe e
       materia, `ensureGenerationContext`) e deve valere fino in fondo. */
    if (window.MappAITune && window.MappAITune.congela) window.MappAITune.congela();
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
    if (window.MappAIReview && appState._reviewRequested && !(window.MappAIPipeline && window.MappAIPipeline._running)) await window.MappAIReview.finishMapOnly();
    } finally {
        window.MappAIGen.fine();
        if (window.MappAITune && window.MappAITune.scongela) window.MappAITune.scongela();
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
    /* Scatta il contesto ADESSO e lo tiene fermo finché non si scongela: chi
       lavora per minuti (pipeline dei materiali, generazione) deve produrre un
       materiale solo, tarato su un pubblico solo. `_gelo` è letto da
       `classTuningPrompt`; `contesto()` dà le due etichette che vanno scritte
       nell'archivio — la voce d'archivio senza `cls`/`disc` li prende dal
       contesto ATTIVO, cioè da quello che c'è alla FINE. */
    congela: function (snapshot) {
        if (snapshot && ['pieno', 'livello', 'nome', 'disc'].every(k => typeof snapshot[k] === 'string')) {
            this._gelo = Object.assign({}, snapshot); return this._gelo;
        }
        var c = null, nome = '', disc = '';
        try {
            var CL = window.MappAIClasses;
            var a = window.appState || (typeof appState !== 'undefined' ? appState : null);
            var up = a && a.userProfile;
            c = (CL && CL.getActive) ? CL.getActive() : null;
            nome = (up && up.nickname) ? up.nickname : ((c && c.name) || '');
            disc = (CL && CL.effectiveDiscipline) ? (CL.effectiveDiscipline(c) || '')
                : ((CL && CL.activeDiscipline && CL.activeDiscipline()) || '');
        } catch (e) { }
        this._gelo = {
            pieno: this.activeTuningBlock(),
            livello: this.levelBlock(),
            nome: nome, disc: disc
        };
        return this._gelo;
    },
    scongela: function () { this._gelo = null; },
    /* Le etichette del contesto congelato ('' se non si sta congelando niente:
       il chiamante ricade sul contesto attivo, che è il comportamento storico). */
    contesto: function () { return this._gelo ? { nome: this._gelo.nome, disc: this._gelo.disc } : null; },
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
        /* ⚠️ CONTESTO CONGELATO (14/8). Questa funzione è chiamata a OGNI
           chiamata all'AI, e la pipeline dei materiali ne fa una PER RAMO:
           cambiando classe a metà, un quiz su cinque aree usciva metà tarato
           per una classe e metà per un'altra — output plausibile, nessun
           errore, nessun modo di accorgersene. Chi lavora a lungo scatta il
           contesto all'inizio (`MappAITune.congela()`) e da lì in poi tutte le
           chiamate leggono QUELLO.
           Si congela il TESTO già risolto, non le sue fonti: il blocco nasce da
           due posti diversi (la scheda allievo in `appState.userProfile` e la
           classe attiva in `MappAIClasses`) e congelarne una sola lascerebbe
           l'altra libera di cambiare sotto. Gli interruttori `armed`/`levelArmed`
           restano vivi: la pipeline li arma DOPO aver congelato. */
        var g = window.MappAITune._gelo;
        if (g) {
            if (window.MappAITune.armed) return g.pieno;
            if (window.MappAITune.levelArmed) return g.livello;
            return '';
        }
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
    // Assisted runs persist synchronously at the checkpoint; this delayed legacy
    // callback must neither resave the vault nor read a different open project.
    if (appState._reviewRequested && window.MappAIReview) return;
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
    /* ── QUELLO CHE IL DOCENTE DEVE SAPERE PRIMA DI STAMPARE (11/9) ────────────
       L'àncora ha misurato copertura, fedeltà e nessi impossibili. Prima queste
       cose non esistevano: una pagina intera della fonte poteva non entrare in
       mappa senza che comparisse un avviso da nessuna parte. Le righe si mostrano
       solo quando c'è qualcosa da dire — un secondo avviso a ogni generazione
       smetterebbe di essere letto. */
    try {
        var _q = appState._qualityReport;
        if (_q && window.anchorReportLines) {
            var _righe = window.anchorReportLines();
            console.log('%c[Qualità della mappa]', 'font-weight:bold', '\n · ' + _righe.join('\n · '));
            var _allarmi = [];
            var _scoperte = _q.copertura.pagine.filter(function (p) { return p.pct < 40 && p.tot >= 3; });
            if (_scoperte.length) {
                _allarmi.push(window.t('gen_rep_cov', 'Parti della fonte quasi assenti dalla mappa: ')
                    + _scoperte.map(function (p) { return (p.page ? 'pagina ' + p.page : 'fonte') + ' (' + p.pct + '%)'; }).join(', '));
            }
            if (_q.nessiDeclassati.length) {
                _allarmi.push(window.t('gen_rep_nessi', 'Nessi causali impossibili, corretti: ') + _q.nessiDeclassati.length);
            }
            if (_q.fedelta && _q.fedelta.sotto.length) {
                _allarmi.push(window.t('gen_rep_fid', 'Descrizioni poco ancorate alla fonte, da rileggere: ') + _q.fedelta.sotto.length);
            }
            /* ⚠️ IL VERDETTO DEL GIUDICE VA VISTO (12/9). In sola segnalazione —
               che è il modo in cui va acceso la prima volta — il giudice non
               tocca niente: se il suo verdetto restasse in console, accenderlo
               non servirebbe a raccogliere i numeri per cui lo si accende. */
            var _g = appState._giudiceReport;
            if (_g && _g.correzioni && _g.correzioni.length) {
                _allarmi.push(_g.applicaAcceso
                    ? (window.t('gen_rep_giu_on', 'Errori di senso corretti dal controllo: ') + _g.applicate)
                    : (window.t('gen_rep_giu_off', 'Errori di senso TROVATI dal controllo (non corretti: le scritture sono spente): ') + _g.correzioni.length));
            }
            if (_allarmi.length) {
                setTimeout(function () { window.showToast(_allarmi.join(' · '), 'warning'); }, 2600);
            }
        }
    } catch (e) { /* il rapporto è un di più: la mappa c'è comunque */ }

    // Riordino su disco (22/7): a fine generazione crea/aggiorna in automatico la
    // cartella vault della mappa in «Mappe» (nome = ROOT; annidata nella classe
    // attiva se presente). Non bloccante — kill-switch mappai_autovault='0'.
    try {
        if (window.ensureProjectVault) {
            var _pv = window.ensureProjectVault({ reason: 'generation' });
            /* Appena la cartella c'è, il progetto si marca NUOVO: da lì lo
               ritrovano gli elenchi di ELABORA e INSEGNA col bollino. Si aspetta
               il vault perché una delle due chiavi È il suo percorso — INSEGNA
               elenca cartelle, non progetti. */
            if (_pv && _pv.then) _pv.then(function (res) {
                /* ── IL RAPPORTO DI QUALITÀ RESTA SUL DISCO (12/9) ─────────────
                   Àncora e giudice scrivevano in `appState` e in console, cioè in
                   due posti che spariscono chiudendo l'app. Ma il giudice si
                   accende la PRIMA volta in sola segnalazione, proprio per
                   raccogliere i numeri con cui decidere se lasciarlo scrivere: un
                   verdetto che non sopravvive alla sessione non serve a decidere
                   niente. Si scrive qui e non prima perché `activeVaultPath` è
                   ancora nullo durante la generazione — la cartella la risolve
                   `ensureProjectVault`, che è proprio ciò che stiamo aspettando. */
                var _cart = (res && res.folderPath) || appState.activeVaultPath || '';
                try {
                    if (_cart && window.electronAPI && window.electronAPI.saveVaultFile &&
                        (appState._qualityReport || appState._giudiceReport)) {
                        window.electronAPI.saveVaultFile({
                            vaultPath: _cart, relPath: 'qualita.json',
                            text: JSON.stringify({
                                schema: 'mappai-qualita@1',
                                quando: new Date().toISOString(),
                                modello: (document.getElementById('model-select') || {}).value || '',
                                ancora: appState._qualityReport || null,
                                giudice: appState._giudiceReport || null
                            }, null, 2)
                        });
                    }
                } catch (e) { /* il rapporto è un di più: la mappa c'è comunque */ }

                if (!window.MappAIGen || !window.MappAIGen.segnaNuovo) return;
                window.MappAIGen.segnaNuovo({
                    nome: appState.rootNodeLabel || '',
                    vault: _cart,
                    id: (window.StorageManager && window.StorageManager.currentProjectId) || ''
                });
            }).catch(function () { });
        }
    } catch (e) { }

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

    /* SEGNALAZIONI — il modale è stato PENSIONATO (15/8/26): categorie, testo
       e invio vivono nella Cabina, vista «Segnalazione». Qui resta solo ciò che
       non è interfaccia: l'elenco delle categorie (una fonte sola per chi le
       disegna) e la composizione dell'email, che nessuna schermata deve
       riscriversi. */
    window.categorieSegnalazione = function () {
        return [
            { id: 'ui', etichetta: window.t('fb_cat_ui', 'Interfaccia'), icona: 'palette' },
            { id: 'ai', etichetta: window.t('fb_cat_ai', 'Generazione AI'), icona: 'bot' },
            { id: 'storage', etichetta: window.t('fb_cat_storage', 'Salvataggio e file'), icona: 'save' },
            { id: 'bug', etichetta: window.t('fb_cat_bug', 'Bug o errore'), icona: 'alert-triangle' },
            { id: 'suggestion', etichetta: window.t('fb_cat_suggestion', 'Suggerimento'), icona: 'lightbulb' },
            { id: 'other', etichetta: window.t('fb_cat_other', 'Altro'), icona: 'circle-ellipsis' }
        ];
    };

    /* Invia la segnalazione: unica strada, chiamata dalla Cabina. Ritorna una
       promessa così chi la chiama sa quando ha finito (e può svuotare il campo
       solo se è partita davvero). */
    window.inviaSegnalazione = function (catId, testo) {
        const text = String(testo || '').trim();
        if (!text) {
            if (window.showToast) window.showToast(window.t('tst_fill_report', "Inserisci i dettagli della segnalazione"), "warning");
            return Promise.resolve(false);
        }
        const cat = (window.categorieSegnalazione() || []).filter(c => c.id === catId)[0];
        const categoryLabel = (cat && cat.etichetta) || 'Altro';
        const emailSubject = `MappAI Feedback - [${categoryLabel}]`;

        const appVersion = "1.0.0";
        const osInfo = navigator.platform || 'sconosciuto';
        const userAgent = navigator.userAgent;
        const model = document.getElementById('model-select')?.value || 'Non specificato';

        const emailBase = `SEGNALAZIONE UTENTE MAPPAI\n` +
            `========================================\n` +
            `Categoria: ${categoryLabel}\n` +
            `Dispositivo: ${osInfo}\n` +
            `Modello Selezionato: ${model}\n` +
            `Versione App: ${appVersion}\n` +
            `User Agent: ${userAgent}\n` +
            `========================================\n\n` +
            `DESCRIZIONE:\n${text}\n\n`;

        /* Gli ULTIMI ERRORI registrati in locale finiscono in coda alla
           segnalazione: «non funziona» diventa un messaggio con file e riga.
           Solo il testo, mai lo stack intero — un `mailto:` con tre stack
           supera la lunghezza che alcuni client accettano, e l'email non si
           aprirebbe affatto. Il registro resta sul computer: parte solo di qui,
           e solo quando è l'utente a premere «invia». */
        const spedisci = (coda) => {
            const emailBody = emailBase + (coda ? coda + '\n' : '');
            const mailtoUrl = `mailto:giacomo@insegnai.ch?subject=${encodeURIComponent(emailSubject)}&body=${encodeURIComponent(emailBody)}`;
            const apri = (msg) => {
                window.location.href = mailtoUrl;
                if (window.showToast) window.showToast(msg, "success");
                return true;
            };
            return navigator.clipboard.writeText(emailBody).then(
                () => apri(window.t('tst_report_copied', "Segnalazione copiata e client email aperto!")),
                () => apri(window.t('tst_email_ready', "Email preparata!"))
            );
        };

        if (window.MappAIErrori && window.MappAIErrori.blocco) {
            return window.MappAIErrori.blocco(3).then(spedisci, () => spedisci(''));
        }
        return spedisci('');
    };

    // Inizializza i modelli all'avvio se c'è una chiave
    setTimeout(() => {
        if (window.getSystemKey && window.getSystemKey()) {
            if (window.refreshGeminiModels) window.refreshGeminiModels();
        }
    }, 1000);

})();

document.addEventListener('DOMContentLoaded', () => {
    // Applica lo zoom salvato
    if (window.applyTextZoom) window.applyTextZoom(currentZoomIdx);

    // Applica Modalità Studente al caricamento
    if (window.applyStudentModeUI) window.applyStudentModeUI();

    // Inizializza grafici offline (Pomodoro sessioni e storico punteggi)
    if (window.updatePomodoroSessionsDisplay) window.updatePomodoroSessionsDisplay();
    if (window.updateStudyScoresDisplay) window.updateStudyScoresDisplay();

});

