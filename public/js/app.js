// Safely Initialize Icons
let modalTextZoomLevel = 0;
window.safeCreateIcons = function () {
    if (typeof lucide !== 'undefined' && lucide.createIcons) {
        lucide.createIcons();
    }
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

        // Student Mode Handler
        if (studentModeSecret.includes(key)) {
            studentModeKeys.push(key);
            if (studentModeKeys.length > 4) studentModeKeys.shift();
            if (studentModeKeys.join('') === 'lkjh') {
                window.toggleStudentMode();
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
        window.showToast("Generatore BLOCCATO! Modalità Studente attiva.", "info");
    } else {
        if (setupForm) setupForm.classList.remove('hidden');
        if (btnConfig) btnConfig.classList.remove('hidden');
        window.showToast("Generatore SBLOCCATO! Sezione 1 limitata a Documenti e Testo.", "success");
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

    if (!silent) window.showToast(enabled ? "Generazione Multi-Pass (HD) ATTIVATA" : "Generazione Multi-Pass DISATTIVATA", "info");
};

// ==========================================
// PIPELINE A/B SELECTION
// ==========================================
window.setPipeline = function (pipelineMode) {
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

    window.showToast(`Logica KG ${pipelineMode === 'A' ? 'A · BERT Community' : 'B · MappAI classico'}`, "info");
};

// Toggle "logica MM": 'mappai' (default, prompt L1 pulito) | 'bert' (prompt L1 con REGOLA DI PERTINENZA).
window.setMMLogic = function (logic) {
    const mode = logic === 'bert' ? 'bert' : 'mappai';
    localStorage.setItem('mappai_mm_logic', mode);
    const btnM = document.getElementById('mmlogic-mappai-btn');
    const btnB = document.getElementById('mmlogic-bert-btn');
    if (btnM && btnB) {
        const on = ['bg-white', 'shadow-sm', 'text-indigo-600'];
        const off = ['text-slate-500', 'hover:text-slate-700'];
        const sel = mode === 'mappai' ? btnM : btnB, oth = mode === 'mappai' ? btnB : btnM;
        sel.classList.add(...on); sel.classList.remove(...off);
        oth.classList.remove(...on); oth.classList.add(...off);
    }
    if (typeof window.showToast === 'function') window.showToast(`Logica MM: ${mode === 'mappai' ? 'MappAI (consigliato)' : 'BERT sperimentale'}`, 'info');
};
window.getMMLogic = function () { return localStorage.getItem('mappai_mm_logic') || 'mappai'; };

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
const KG_REL_ENUM = [
    "causa", "provoca", "produce", "genera", "determina",
    "richiede", "dipende da", "è condizione di",
    "trasforma in", "porta a", "alimenta",
    "si oppone a", "contrasta", "ostacola",
    "precede", "segue", "deriva da",
    "fa parte di", "comprende", "contiene", "appartiene a",
    "è regolato da", "regola", "governa", "guida",
    "utilizza", "catalizza", "avviene in", "è esempio di",
    "rappresenta", "sostiene", "coinvolge", "permette"
];

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

/* ==========================================
   UTILITIES E UI MODALS CUSTOM (NO ALERT/PROMPT)
   ========================================== */

window.showToast = function (message, type = 'error') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    const bgColor = type === 'error' ? 'bg-red-600' : 'bg-emerald-600';
    const icon = type === 'error' ? 'alert-triangle' : 'check-circle';
    toast.className = `${bgColor} text-white px-4 py-3 rounded-lg shadow-lg flex items-center gap-3 animate-slideIn transition-opacity duration-300`;
    toast.innerHTML = `
                <i data-lucide="${icon}" class="w-5 h-5 shrink-0"></i>
                <span class="text-sm font-bold">${message}</span>
            `;
    container.appendChild(toast);
    window.safeCreateIcons();
    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

window.showAlert = function (title, message) {
    const modal = document.getElementById('alert-modal');
    const box = document.getElementById('alert-box');
    document.getElementById('alert-title').innerText = title;
    document.getElementById('alert-message').innerText = message;

    modal.classList.remove('hidden');
    modal.classList.add('flex');
    setTimeout(() => {
        modal.classList.remove('opacity-0');
        box.classList.remove('scale-95');
    }, 10);

    const btnOk = document.getElementById('alert-ok');
    btnOk.onclick = () => {
        modal.classList.add('opacity-0');
        box.classList.add('scale-95');
        setTimeout(() => {
            modal.classList.add('hidden');
            modal.classList.remove('flex');
        }, 200);
    };
    window.safeCreateIcons();
}

window.showConfirm = function (title, message, onConfirm) {
    const modal = document.getElementById('confirm-modal');
    const box = document.getElementById('confirm-box');
    document.getElementById('confirm-title').innerText = title;
    document.getElementById('confirm-message').innerText = message;

    modal.classList.remove('hidden');
    modal.classList.add('flex');
    setTimeout(() => {
        modal.classList.remove('opacity-0');
        box.classList.remove('scale-95');
    }, 10);

    const btnCancel = document.getElementById('confirm-cancel');
    const btnOk = document.getElementById('confirm-ok');

    const cleanup = () => {
        modal.classList.add('opacity-0');
        box.classList.add('scale-95');
        setTimeout(() => {
            modal.classList.add('hidden');
            modal.classList.remove('flex');
        }, 200);
    };

    btnCancel.onclick = () => cleanup();
    btnOk.onclick = () => { cleanup(); onConfirm(); };
}

window.showPrompt = function (title, defaultValue, onConfirm, description = null) {
    const modal = document.getElementById('prompt-modal');
    const box = document.getElementById('prompt-box');
    const input = document.getElementById('prompt-input');
    const desc = document.getElementById('prompt-desc');

    document.getElementById('prompt-title').innerText = title;
    input.value = defaultValue || '';

    if (description) {
        desc.innerText = description;
        desc.classList.remove('hidden');
    } else {
        desc.classList.add('hidden');
    }

    modal.classList.remove('hidden');
    modal.classList.add('flex');
    setTimeout(() => {
        modal.classList.remove('opacity-0');
        box.classList.remove('scale-95');
        input.focus();
    }, 10);

    const btnCancel = document.getElementById('prompt-cancel');
    const btnOk = document.getElementById('prompt-ok');

    const cleanup = () => {
        modal.classList.add('opacity-0');
        box.classList.add('scale-95');
        setTimeout(() => {
            modal.classList.add('hidden');
            modal.classList.remove('flex');
        }, 200);
    };

    btnCancel.onclick = () => cleanup();
    btnOk.onclick = () => { cleanup(); onConfirm(input.value.trim()); };

    input.onkeydown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            cleanup();
            onConfirm(input.value.trim());
        }
    };
}

const FAMILY_DEFAULT_REL = {
    trasformazione: 'causa',
    dipendenza: 'richiede',
    sequenza: 'precede',
    appartenenza: 'fa parte di',
    regolazione: 'regola',
    opposizione: 'si oppone a',
    analogia: 'è simile a',
    altro: ''
};

window.showLinkFamilyPrompt = function (srcLabel, tgtLabel, onConfirm) {
    const modal = document.getElementById('link-family-modal');
    const box = document.getElementById('link-family-box');
    const question = document.getElementById('link-family-question');
    const grid = document.getElementById('link-family-grid');
    const input = document.getElementById('link-family-input');
    const tagsDiv = document.getElementById('link-family-tags');
    const chipsDiv = document.getElementById('link-family-chips');
    const bidirToggle = document.getElementById('link-bidir-toggle');
    const btnCancel = document.getElementById('link-family-cancel');
    const btnOk = document.getElementById('link-family-ok');

    question.innerHTML = `Che relazione c'è tra <strong>${srcLabel}</strong> e <strong>${tgtLabel}</strong>?`;
    input.value = '';
    grid.innerHTML = '';
    chipsDiv.innerHTML = '';
    tagsDiv.classList.add('hidden');
    tagsDiv.classList.remove('flex');

    // Reset e gestione toggle bidirezionale
    let isBidir = false;
    let selectedFamKey = null;
    const updateBidirStyle = () => {
        if (isBidir) {
            bidirToggle.classList.add('border-indigo-500', 'text-indigo-600', 'bg-indigo-50');
            bidirToggle.classList.remove('border-slate-300', 'text-slate-500');
        } else {
            bidirToggle.classList.remove('border-indigo-500', 'text-indigo-600', 'bg-indigo-50');
            bidirToggle.classList.add('border-slate-300', 'text-slate-500');
        }
    };
    updateBidirStyle();
    bidirToggle.onclick = () => { isBidir = !isBidir; updateBidirStyle(); };

    Object.entries(EDGE_FAMILIES).forEach(([key, fam]) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'flex flex-row items-center gap-3 px-4 py-2.5 w-full rounded-xl border-2 border-transparent text-white transition-all cursor-pointer hover:brightness-110 hover:shadow-md';
        btn.style.backgroundColor = fam.color;
        const kw = (fam.keywords || []).slice(0, 3).join(' · ');
        btn.innerHTML = `
            <i data-lucide="${fam.icon}" class="w-5 h-5 flex-shrink-0"></i>
            <div class="flex flex-col items-start min-w-0">
                <span class="text-sm font-semibold leading-tight">${fam.label}</span>
                ${kw ? `<span class="text-[11px] font-normal opacity-75 leading-tight">${kw}</span>` : ''}
            </div>`;
        btn.onclick = () => {
            // Step 1 → Step 2: evidenzia famiglia, attenua le altre
            selectedFamKey = key;
            grid.querySelectorAll('button').forEach(b => {
                b.style.outline = '';
                b.style.opacity = '0.45';
            });
            btn.style.outline = '3px solid #1e293b';
            btn.style.opacity = '1';

            // Pre-compila input con il verbo default
            const def = FAMILY_DEFAULT_REL[key] || '';
            input.value = def;

            // Costruisce i chip delle keyword
            chipsDiv.innerHTML = '';
            (fam.keywords || []).forEach(kw => {
                const chip = document.createElement('button');
                chip.type = 'button';
                chip.className = 'px-2.5 py-1 rounded-full text-xs font-semibold border-2 transition-all cursor-pointer hover:brightness-90';
                chip.style.cssText = `border-color:${fam.color}; color:${fam.colorBtn}; background:${fam.color}22;`;
                chip.textContent = kw;
                chip.onclick = () => {
                    input.value = kw;
                    chipsDiv.querySelectorAll('button').forEach(c => { c.style.background = fam.color + '22'; });
                    chip.style.background = fam.color + '55';
                    input.focus();
                };
                chipsDiv.appendChild(chip);
            });

            tagsDiv.classList.remove('hidden');
            tagsDiv.classList.add('flex');
            input.focus();
        };
        grid.appendChild(btn);
    });
    window.safeCreateIcons();

    modal.classList.remove('hidden');
    modal.classList.add('flex');
    setTimeout(() => {
        modal.classList.remove('opacity-0');
        box.classList.remove('scale-95');
        input.focus();
    }, 10);

    const cleanup = () => {
        modal.classList.add('opacity-0');
        box.classList.add('scale-95');
        setTimeout(() => { modal.classList.add('hidden'); modal.classList.remove('flex'); }, 200);
    };

    const confirm = () => {
        const rel = input.value.trim()
            || (selectedFamKey ? FAMILY_DEFAULT_REL[selectedFamKey] : '')
            || 'collegato_a';
        cleanup();
        onConfirm(rel, isBidir);
    };

    btnCancel.onclick = cleanup;
    btnOk.onclick = confirm;
    input.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); confirm(); } };
};

// --- Modal Management (con try/catch per robustezza) ---
window.showConfigAIModal = function () {
    if (appState.studentMode) {
        window.showToast("Configurazione AI non disponibile nella versione studente", "warning");
        return;
    }
    try {
        const m = document.getElementById('config-ai-modal');
        if (m) {
            const productInput = document.getElementById('infomaniak-product-id');
            if (productInput) productInput.value = appState.infomaniakProductId || '';
            m.style.display = '';
            m.classList.remove('hidden');
            m.classList.add('flex');
            window.safeCreateIcons();
        }
    } catch (e) { }
};
window.closeConfigAIModal = function () {
    try {
        const m = document.getElementById('config-ai-modal');
        if (m) { m.style.display = ''; m.classList.remove('flex'); m.classList.add('hidden'); }
    } catch (e) { }
};

window.showAppGuide = function () {
    const m = document.getElementById('app-guide-modal');
    if (m) { m.classList.remove('hidden'); m.classList.add('flex'); window.safeCreateIcons(); }
};
window.stopTTS = function () {
    if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
    }
};

// --- Magnifier Logic ---
let magnifierActive = false;
let magnifierLens = null;
let magnifierContent = null;
let lastMousePos = { x: 0, y: 0 };

let magnifierObserver = null;
let magnifierDebounceTimer = null;

window.toggleMagnifier = function () {
    magnifierActive = !magnifierActive;
    magnifierLens = document.getElementById('magnifier-lens');
    magnifierContent = document.getElementById('magnifier-content');

    if (magnifierActive) {
        magnifierLens.style.display = 'block';
        window.refreshMagnifier();
        document.addEventListener('mousemove', window.handleMagnifierMove);

        // Sincronizza dinamicamente la lente con i cambiamenti della UI (es. apertura modali)
        magnifierObserver = new MutationObserver((mutations) => {
            let shouldRefresh = false;
            for (let m of mutations) {
                // Ignora i cambiamenti della lente stessa per evitare loop infiniti
                if (m.target.id === 'magnifier-lens' || m.target.id === 'magnifier-content') continue;
                if (m.target.closest && m.target.closest('#magnifier-lens')) continue;

                // Ignora aggiornamenti continui e leggeri (es. animazioni svg/d3, input testo rapido)
                if (m.target.tagName === 'line' || m.target.tagName === 'circle' || m.target.tagName === 'path' || m.target.tagName === 'text') continue;
                if (m.target.closest && m.target.closest('#d3-container') && m.attributeName === 'transform') continue;
                if (m.target.closest && m.target.closest('#d3-container') && m.attributeName === 'style') continue;

                shouldRefresh = true;
                break;
            }

            if (shouldRefresh) {
                clearTimeout(magnifierDebounceTimer);
                magnifierDebounceTimer = setTimeout(() => {
                    if (magnifierActive) window.refreshMagnifier();
                }, 300); // 300ms debounce per non bloccare la UI
            }
        });

        // Osserva i cambiamenti rilevanti nel DOM
        magnifierObserver.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['class', 'style']
        });

    } else {
        magnifierLens.style.display = 'none';
        document.removeEventListener('mousemove', window.handleMagnifierMove);
        magnifierContent.innerHTML = '';
        if (magnifierObserver) {
            magnifierObserver.disconnect();
            magnifierObserver = null;
        }
        clearTimeout(magnifierDebounceTimer);
    }
};

window.refreshMagnifier = function () {
    if (!magnifierActive) return;
    const wrapper = document.createElement('div');
    wrapper.style.width = '100vw';
    wrapper.style.height = '100vh';
    wrapper.style.position = 'relative';

    // Elementi UI da escludere dalla lente (evita sdoppiamenti di menu fixed)
    const excludeIds = [
        'magnifier-lens',
        'toast-container',
        'alert-modal'
    ];

    // Includiamo tutto tranne la lente stessa per evitare ricorsione infinita
    Array.from(document.body.children).forEach(child => {
        if (child.id !== 'magnifier-lens' && child.tagName !== 'SCRIPT') {
            const clone = child.cloneNode(true);
            let shouldAppend = true;

            // Rimuovi gli elementi esclusi profondamente dal clone
            excludeIds.forEach(id => {
                if (clone.id === id) {
                    shouldAppend = false;
                } else if (clone.querySelector) {
                    const el = clone.querySelector('#' + id);
                    if (el) el.remove();
                }
            });


            // Converti 'fixed' in 'absolute' per evitare che i cloni escano dalla lente
            if (shouldAppend) {
                if (clone.classList && clone.classList.contains('fixed')) {
                    clone.classList.remove('fixed');
                    clone.classList.add('absolute');
                }
                if (clone.querySelectorAll) {
                    const fixedEls = clone.querySelectorAll('.fixed');
                    fixedEls.forEach(el => {
                        el.classList.remove('fixed');
                        el.classList.add('absolute');
                    });
                }
                wrapper.appendChild(clone);
            }
        }
    });
    magnifierContent.innerHTML = '';
    magnifierContent.appendChild(wrapper);
};

window.handleMagnifierMove = function (e) {
    if (!magnifierActive) return;
    const x = e.clientX;
    const y = e.clientY;
    lastMousePos = { x, y };

    // Centra la lente sul mouse (120 è metà del diametro 240)
    magnifierLens.style.left = (x - 120) + 'px';
    magnifierLens.style.top = (y - 120) + 'px';

    // Formula corretta per transform: scale(2)
    // Il punto (x,y) deve finire al centro della lente (120, 120)
    // L + x*2 = 120 => L = 120 - x*2
    magnifierContent.style.left = (120 - x * 2) + 'px';
    magnifierContent.style.top = (120 - y * 2) + 'px';
};

window.readModalAloud = function (modalId) {
    if (window.speechSynthesis.speaking) {
        window.stopTTS();
        return;
    }
    const modal = document.getElementById(modalId);
    if (!modal) return;

    let text = "";
    const body = modal.querySelector('.ai-result-content, .modal-scroll, #source-modal-body, #ai-modal-body');
    if (body) text = body.innerText || body.textContent;
    else text = modal.innerText || modal.textContent;

    if (text.trim()) {
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'it-IT';
        utterance.rate = 0.9;

        utterance.onstart = () => {
            const btns = document.querySelectorAll('button[title="Leggi ad alta voce"], #tts-button');
            btns.forEach(btn => {
                btn.innerHTML = '<i data-lucide="square" class="w-4 h-4 fill-current"></i>';
                btn.classList.add('text-red-600', 'border-red-200');
            });
            window.safeCreateIcons();
        };

        const onEnd = () => {
            const btns = document.querySelectorAll('button[title="Leggi ad alta voce"], #tts-button');
            btns.forEach(btn => {
                btn.innerHTML = '<i data-lucide="volume-2"></i>';
                btn.classList.remove('text-red-600', 'border-red-200');
            });
            window.safeCreateIcons();
        };

        utterance.onend = onEnd;
        utterance.onerror = onEnd;

        window.speechSynthesis.speak(utterance);
    }
};

window.toggleTTS = function () {
    const modals = ['source-modal', 'ai-modal', 'app-guide-modal', 'app-tutorial-modal'];
    for (const id of modals) {
        const m = document.getElementById(id);
        if (m && !m.classList.contains('hidden')) {
            window.readModalAloud(id);
            return;
        }
    }
};

window.stopTTS = function () {
    window.speechSynthesis.cancel();
    const btns = document.querySelectorAll('button[title="Leggi ad alta voce"], #tts-button');
    btns.forEach(btn => {
        btn.innerHTML = '<i data-lucide="volume-2"></i>';
        btn.classList.remove('text-red-600', 'border-red-200');
    });
    window.safeCreateIcons();
};

window.closeAppGuide = function () {
    window.stopTTS();
    const m = document.getElementById('app-guide-modal');
    if (m) { m.classList.remove('flex'); m.classList.add('hidden'); }
};

window.showAppTutorial = function () {
    const m = document.getElementById('app-tutorial-modal');
    if (m) { m.classList.remove('hidden'); m.classList.add('flex'); window.safeCreateIcons(); }
};
window.closeAppTutorial = function () {
    window.stopTTS();
    const m = document.getElementById('app-tutorial-modal');
    if (m) { m.classList.remove('flex'); m.classList.add('hidden'); }
};

window.closeUserProfileModal = function () {
    try {
        const m = document.getElementById('user-profile-modal');
        if (m) { m.style.display = ''; m.classList.remove('flex'); m.classList.add('hidden'); }
    } catch (e) { }
};

// ── Sidebar Tab System ──────────────────────
window.switchSidebarTab = function (tab) {
    const tabs = ['structure', 'notes', 'study', 'finder', 'tutor'];
    tabs.forEach(t => {
        const panel = document.getElementById(`sidebar-panel-${t}`);
        const btn = document.getElementById(`sidebar-tab-${t}`);
        if (panel && btn) {
            if (t === tab) {
                panel.classList.remove('hidden');
                panel.classList.add('flex', 'flex-col');
                btn.classList.add('border-indigo-500', 'text-indigo-600');
                btn.classList.remove('border-transparent', 'text-slate-400');
            } else {
                panel.classList.add('hidden');
                panel.classList.remove('flex', 'flex-col');
                btn.classList.remove('border-indigo-500', 'text-indigo-600');
                btn.classList.add('border-transparent', 'text-slate-400');
            }
        }
    });
    window.safeCreateIcons();
    // Refresh tree view when switching to structure tab
    if (tab === 'structure') window.renderTreeView();
    if (tab === 'notes') window.updateUserNotesSidebar();
}

// Inizializza Set globale per i nodi collassati se non esiste
window.collapsedTreeNodes = window.collapsedTreeNodes || new Set();

window.toggleTreeCollapse = function (nodeId) {
    if (window.collapsedTreeNodes.has(nodeId)) {
        window.collapsedTreeNodes.delete(nodeId);
    } else {
        window.collapsedTreeNodes.add(nodeId);
    }
    window.renderTreeView();
};

window.renderTreeView = function () {
    const container = document.getElementById('tree-view-container');
    const titleEl = document.getElementById('tree-view-title');
    if (!container || !appState.db.nodes.length) return;

    const lang = window.currentLanguage || 'it';
    const t = (lang === 'en' ? (typeof en_translations !== 'undefined' ? en_translations : {}) : (typeof it_translations !== 'undefined' ? it_translations : {}));
    const treeCollapseTitle = t.tree_collapse_expand || "Collassa/Espandi";

    const isMindmap = appState.extractionMode === 'mindmap';
    if (titleEl) titleEl.textContent = isMindmap ? 'Macro-aree' : 'Super-hub';

    let rootNodes = [];

    if (isMindmap) {
        // For mindmaps: show L1 nodes
        rootNodes = appState.db.nodes.filter(n => n.level === 1);
    } else {
        // For KG: find super-hubs (top N nodes by degree)
        const degreeCounts = {};
        appState.db.nodes.forEach(n => degreeCounts[n.id] = 0);
        appState.db.links.forEach(l => {
            const sid = typeof l.source === 'object' ? l.source.id : l.source;
            const tid = typeof l.target === 'object' ? l.target.id : l.target;
            if (degreeCounts[sid] !== undefined) degreeCounts[sid]++;
            if (degreeCounts[tid] !== undefined) degreeCounts[tid]++;
        });
        rootNodes = appState.db.nodes
            .map(n => ({ ...n, degree: degreeCounts[n.id] || 0 }))
            .sort((a, b) => b.degree - a.degree)
            .slice(0, 8); // Top 8 hubs
    }

    if (rootNodes.length === 0) {
        container.innerHTML = '<p class="text-xs text-slate-400 italic">Nessuna struttura disponibile.</p>';
        return;
    }

    // Funzione helper per verificare se un nodo ha discendenti
    function hasChildNodes(nodeId) {
        const node = appState.db.nodes.find(n => n.id === nodeId);
        if (!node) return false;
        if (isMindmap) {
            // Un nodo L1 ha figli se ci sono altri nodi con lo stesso gruppo nella mappa
            return appState.db.nodes.some(n => n.group === node.group && n.id !== nodeId);
        } else {
            const hasDirectParentRef = appState.db.nodes.some(n => n.parent === nodeId);
            if (hasDirectParentRef) return true;

            return appState.db.links.some(l => {
                const sid = typeof l.source === 'object' ? l.source.id : l.source;
                const tid = typeof l.target === 'object' ? l.target.id : l.target;
                return sid === nodeId || tid === nodeId;
            }) && appState.db.nodes.some(n => (n.parent === nodeId || appState.db.links.some(l => {
                const s = typeof l.source === 'object' ? l.source.id : l.source;
                const t = typeof l.target === 'object' ? l.target.id : l.target;
                return (s === nodeId && t === n.id) || (t === nodeId && s === n.id);
            })) && n.level === (appState.db.nodes.find(parent => parent.id === nodeId)?.level || 0) + 1);
        }
    }

    let html = '';
    rootNodes.forEach(rn => {
        const isRootL1 = rn.level === 1;
        const baseColor = (appState.db.customColors && appState.db.customColors[rn.group])
            ? appState.db.customColors[rn.group]
            : (colorScale[rn.group] || colorScale[rn.level !== undefined ? rn.level : 1] || '#4f46e5');
        const mColor = (!isMindmap && !isRootL1) ? '#94a3b8' : baseColor; // slate-400 per hub non-L1 nel KG
        const degreeInfo = !isMindmap ? ` <span class="text-[9px] ${isRootL1 ? 'text-indigo-400' : 'text-slate-400'}">(${rn.degree} conn.)</span>` : '';

        const hasKids = hasChildNodes(rn.id);
        const isCollapsed = window.collapsedTreeNodes.has(rn.id);
        const arrowIcon = isCollapsed ? 'chevron-right' : 'chevron-down';

        html += `<div class="mb-1 w-full">`;
        html += `<div class="w-full flex items-center rounded-lg hover:bg-indigo-50/50 group transition">`;
        if (hasKids) {
            html += `<button onclick="event.stopPropagation(); window.toggleTreeCollapse('${rn.id.replace(/'/g, "\\'")}')" class="p-2 text-slate-400 hover:text-indigo-600 transition shrink-0" title="${treeCollapseTitle}">`;
            html += `<i data-lucide="${arrowIcon}" class="w-3.5 h-3.5 flex-shrink-0"></i>`;
            html += `</button>`;
        } else {
            html += `<div class="w-7.5 h-7.5 flex-shrink-0"></div>`;
        }
        html += `<div class="flex-grow py-1.5 pr-2 flex items-center gap-2 truncate text-left">`;
        if (hasKids) {
            html += `<i onclick="event.stopPropagation(); window.toggleTreeCollapse('${rn.id.replace(/'/g, "\\'")}')" data-lucide="circle-dot" class="w-3 h-3 flex-shrink-0 cursor-pointer hover:scale-125 transition" style="color: ${mColor}; stroke: ${mColor}; fill: ${mColor};" title="${treeCollapseTitle}"></i>`;
        } else {
            html += `<i data-lucide="circle" class="w-3 h-3 flex-shrink-0" style="color: ${mColor}; stroke: ${mColor}; fill: ${mColor};"></i>`;
        }
        html += `<button onclick="window.onSidebarNodeClick(event, '${rn.id.replace(/'/g, "\\'")}')" ondblclick="window.onSidebarNodeDblClick(event, '${rn.id.replace(/'/g, "\\'")}')" class="text-sm font-bold text-slate-700 hover:text-indigo-600 truncate flex-grow text-left">`;
        html += `${rn.label}${degreeInfo}`;
        html += `</button>`;
        html += `</div>`;
        html += `</div>`;

        if (isMindmap) {
            // Per mappe mentali, renderizza i figli piatti se non collassato
            if (!isCollapsed) {
                const children = appState.db.nodes
                    .filter(n => n.group === rn.group && n.id !== rn.id && n.level > 1 && n.level <= 5)
                    .sort((a, b) => (a.level || 0) - (b.level || 0));

                if (children.length > 0) {
                    html += `<div class="ml-5 pl-2 border-l border-slate-200/60 space-y-0.5">`;
                    children.forEach(c => {
                        const cColor = (appState.db.customColors && appState.db.customColors[c.group])
                            ? appState.db.customColors[c.group]
                            : (colorScale[c.group] || colorScale[c.level !== undefined ? c.level : 1] || '#4f46e5');

                        html += `<div class="w-full flex items-center rounded hover:bg-slate-50 group transition">`;
                        html += `<div class="w-5 h-5 flex-shrink-0"></div>`; // no chevron button for flat child
                        html += `<div class="flex-grow py-1 pr-2 flex items-center gap-1.5 truncate text-left">`;
                        html += `<i data-lucide="circle" class="w-2.5 h-2.5 flex-shrink-0" style="color: #cbd5e1; stroke: #cbd5e1; fill: #cbd5e1;"></i>`;
                        html += `<button onclick="window.onSidebarNodeClick(event, '${c.id.replace(/'/g, "\\'")}')" ondblclick="window.onSidebarNodeDblClick(event, '${c.id.replace(/'/g, "\\'")}')" class="text-xs text-slate-500 hover:text-indigo-500 truncate flex-grow text-left">`;
                        html += `<span class="font-semibold text-indigo-400 mr-1">L${c.level}</span> ${c.label}`;
                        html += `</button>`;
                        html += `</div>`;
                        html += `</div>`;
                    });
                    html += `</div>`;
                }
            }
        } else {
            // Per KG, mostra un livello di nodi connessi (max 6)
            if (!isCollapsed) {
                const connIds = new Set();
                appState.db.links.forEach(l => {
                    const sid = typeof l.source === 'object' ? l.source.id : l.source;
                    const tid = typeof l.target === 'object' ? l.target.id : l.target;
                    if (sid === rn.id) connIds.add(tid);
                    if (tid === rn.id) connIds.add(sid);
                });
                const children = appState.db.nodes.filter(n => connIds.has(n.id) && n.id !== rn.id).slice(0, 6);
                if (children.length > 0) {
                    html += `<div class="ml-5 pl-2 border-l border-slate-200/60 space-y-0.5">`;
                    children.forEach(c => {
                        html += `<button onclick="window.onSidebarNodeClick(event, '${c.id.replace(/'/g, "\\'")}')" ondblclick="window.onSidebarNodeDblClick(event, '${c.id.replace(/'/g, "\\'")}')" class="w-full text-left py-1 px-2 rounded hover:bg-slate-50 transition flex items-center gap-1.5">`;
                        html += `<i data-lucide="circle" class="w-2.5 h-2.5 flex-shrink-0" style="color: #cbd5e1; stroke: #cbd5e1; fill: #cbd5e1;"></i>`;
                        html += `<span class="text-xs text-slate-500 hover:text-indigo-500 truncate">${c.label}</span>`;
                        html += `</button>`;
                    });
                    html += `</div>`;
                }
            }
        }
        html += `</div>`;
    });

    container.innerHTML = html;
    setTimeout(() => { if (window.lucide) window.lucide.createIcons(); }, 50);
};

let sidebarClickTimeout = null;
window.onSidebarNodeClick = function (event, nodeId) {
    if (event && event.stopPropagation) event.stopPropagation();
    if (sidebarClickTimeout) {
        clearTimeout(sidebarClickTimeout);
        sidebarClickTimeout = null;
        return;
    }
    sidebarClickTimeout = setTimeout(() => {
        sidebarClickTimeout = null;
        window.executeSidebarSingleClick(nodeId);
    }, 250);
};

window.onSidebarNodeDblClick = function (event, nodeId) {
    if (event && event.stopPropagation) event.stopPropagation();
    if (sidebarClickTimeout) {
        clearTimeout(sidebarClickTimeout);
        sidebarClickTimeout = null;
    }
    const node = appState.db.nodes.find(n => n.id === nodeId);
    if (node) {
        window.handleNodeClick({ stopPropagation: () => { } }, node);
    }
};

window.zoomToFitNodes = function (nodeList) {
    if (typeof svg === 'undefined' || !svg || typeof zoom === 'undefined' || !zoom || !nodeList || nodeList.length === 0) return;

    const validNodes = nodeList.filter(n => n.x !== undefined && n.y !== undefined && !isNaN(n.x) && !isNaN(n.y));
    if (validNodes.length === 0) return;

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    validNodes.forEach(n => {
        if (n.x < minX) minX = n.x;
        if (n.x > maxX) maxX = n.x;
        if (n.y < minY) minY = n.y;
        if (n.y > maxY) maxY = n.y;
    });

    const boxWidth = maxX - minX;
    const boxHeight = maxY - minY;

    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;

    const svgEl = document.getElementById("map-svg");
    const width = svgEl ? svgEl.clientWidth || 800 : 800;
    const height = svgEl ? svgEl.clientHeight || 600 : 600;

    const padding = 100;
    const scaleX = (width - padding * 2) / (boxWidth || 1);
    const scaleY = (height - padding * 2) / (boxHeight || 1);
    let scale = Math.min(scaleX, scaleY);
    scale = Math.max(0.4, Math.min(1.5, scale));

    const tx = -centerX * scale;
    const ty = -centerY * scale;

    svg.transition().duration(850).call(
        zoom.transform,
        d3.zoomIdentity.translate(tx, ty).scale(scale)
    );
};

window.executeSidebarSingleClick = function (nodeId) {
    const node = appState.db.nodes.find(n => n.id === nodeId);
    if (!node) return;

    const isMindmap = appState.extractionMode === 'mindmap';
    const rootNode = appState.db.nodes.find(n => n.level === 0 || n.isRoot);

    // Funzione interna per trovare il genitore di livello 1 (macro-area) per qualsiasi nodo
    function getL1ParentNode(n) {
        if (!n) return null;
        if (n.level === 1) return n;
        if (n.level === 0) return null;

        let current = n;
        let limit = 0;
        while (current && current.level > 1 && limit < 15) {
            limit++;
            let parent = null;
            appState.db.links.forEach(l => {
                const sid = typeof l.source === 'object' ? l.source.id : l.source;
                const tid = typeof l.target === 'object' ? l.target.id : l.target;
                if (sid === current.id) {
                    const conn = appState.db.nodes.find(nodeItem => nodeItem.id === tid);
                    if (conn && conn.level < current.level) parent = conn;
                }
                if (tid === current.id) {
                    const conn = appState.db.nodes.find(nodeItem => nodeItem.id === sid);
                    if (conn && conn.level < current.level) parent = conn;
                }
            });
            if (parent) {
                current = parent;
            } else {
                break;
            }
        }
        return current.level === 1 ? current : null;
    }

    // Funzione interna per raccogliere tutti i nodi discendenti (per MM usa il codice colore/gruppo)
    function getDescendantIds(startNodeId) {
        const descendants = new Set();
        const startNode = appState.db.nodes.find(n => n.id === startNodeId);
        if (!startNode) return descendants;

        if (isMindmap) {
            // Per mappe mentali, raccogliamo tutti i nodi con lo stesso gruppo (escluso il nodo stesso)
            appState.db.nodes.forEach(n => {
                if (n.group === startNode.group && n.id !== startNodeId) {
                    descendants.add(n.id);
                }
            });
        } else {
            // Per KG, manteniamo la traversata classica
            const queue = [startNodeId];
            let limit = 0;
            while (queue.length > 0 && limit < 500) {
                limit++;
                const currentId = queue.shift();
                appState.db.links.forEach(l => {
                    const sid = typeof l.source === 'object' ? l.source.id : l.source;
                    const tid = typeof l.target === 'object' ? l.target.id : l.target;
                    if (sid === currentId && !descendants.has(tid)) {
                        const targetNode = appState.db.nodes.find(nodeItem => nodeItem.id === tid);
                        const currentNode = appState.db.nodes.find(nodeItem => nodeItem.id === currentId);
                        if (targetNode && currentNode && targetNode.level > currentNode.level) {
                            descendants.add(tid);
                            queue.push(tid);
                        }
                    }
                    if (tid === currentId && !descendants.has(sid)) {
                        const sourceNode = appState.db.nodes.find(nodeItem => nodeItem.id === sid);
                        const currentNode = appState.db.nodes.find(nodeItem => nodeItem.id === currentId);
                        if (sourceNode && currentNode && sourceNode.level > currentNode.level) {
                            descendants.add(sid);
                            queue.push(sid);
                        }
                    }
                });
            }
        }
        return descendants;
    }

    // Trova la macro-area (L1) corrispondente al nodo cliccato
    let macroNode = node;
    if (isMindmap) {
        const parentL1 = getL1ParentNode(node);
        if (parentL1) macroNode = parentL1;
    }

    // Costruisci il set di nodi evidenziati (ROOT + L1 della macroarea + tutti i discendenti L2, L3, L4, L5)
    const highlightedIds = new Set();
    if (rootNode) highlightedIds.add(rootNode.id);

    if (macroNode) {
        highlightedIds.add(macroNode.id);
        const descendants = getDescendantIds(macroNode.id);
        descendants.forEach(id => highlightedIds.add(id));
    }

    // Applica l'effetto dimmed escludendo la macro-area intera e il ROOT
    if (typeof g !== 'undefined' && g) {
        g.selectAll(".node-group").classed("dimmed", n => !highlightedIds.has(n.id)).classed("highlighted", n => highlightedIds.has(n.id));
        g.selectAll(".link-group").classed("dimmed", l => {
            const sid = typeof l.source === 'object' ? l.source.id : l.source;
            const tid = typeof l.target === 'object' ? l.target.id : l.target;
            // Un link non è dimmed se collega due nodi entrambi evidenziati
            return !(highlightedIds.has(sid) && highlightedIds.has(tid));
        });
    }

    // Calcola il framing perfetto inquadrando tutti i nodi della macro-area e il ROOT
    const nodesToFit = appState.db.nodes.filter(n => highlightedIds.has(n.id));
    window.zoomToFitNodes(nodesToFit);

    // Esegue il click singolo aggiornando la sidebar ma SENZA zoomare sul singolo nodo o aprire il modale
    window.handleNodeClick({ stopPropagation: () => { } }, node, true, true);
};

// Modal functions moved to top section

// ── Curated model knowledge base ──────────────────────
// Maps model ID patterns to capabilities, pricing, and categories.
// Capabilities: pdf, url, youtube (video), audio, text, json (structured output)
// IMPORTANTE: le chiavi PIÙ SPECIFICHE (più lunghe) vanno prima di quelle generiche.
// matchModelKB usa prefix-match — "gemini-2.5-flash-lite" deve precedere "gemini-2.5-flash"
// altrimenti flash-lite verrebbe riconosciuto come flash (match sbagliato).
const MODEL_KB = {
    // ── Gemini 3.5 (testato 2/6/26 — JSON fix applicato) ──
    'gemini-3.5-flash': { tier: '⚡ Veloce', caps: ['text', 'pdf', 'url', 'json'], inputCost: 0.50, outputCost: 3.00, free: true, note: 'Flash 3.5 · KG da testare' },
    // ── Gemini 3.1 ──
    'gemini-3.1-flash-lite': { tier: '🟢 Economico', caps: ['text', 'pdf', 'url', 'json'], inputCost: 0.10, outputCost: 0.40, free: true, note: 'KG density ~1.9, MM ok (test 2/6/26)' },
    'gemini-3.1-pro': { tier: '💎 Potente', caps: ['text', 'pdf', 'url', 'audio', 'youtube', 'json'], inputCost: 2.00, outputCost: 12.00, free: false, note: 'Flagship 3.1 (preview)' },
    // ── Gemini 3.0 ──
    'gemini-3-flash': { tier: '⚡ Veloce', caps: ['text', 'pdf', 'url', 'audio', 'youtube', 'json'], inputCost: 0.50, outputCost: 3.00, free: true, note: 'Flash 3.0 (preview)' },
    'gemini-3-pro': { tier: '💎 Potente', caps: ['text', 'pdf', 'url', 'audio', 'youtube', 'json'], inputCost: 2.00, outputCost: 12.00, free: false, note: 'Pro 3.0 (preview)' },
    // ── Gemini 2.5 — flash-lite PRIMA di flash (prefix più specifico) ──
    'gemini-2.5-flash-lite': { tier: '🟢 Economico', caps: ['text', 'pdf', 'url', 'json'], inputCost: 0.10, outputCost: 0.40, free: true, note: 'KG density 1.59, 41 nodi, 43% cross-link (test 2/6/26)' },
    'gemini-2.5-flash': { tier: '⚡ Veloce', caps: ['text', 'pdf', 'url', 'audio', 'youtube', 'json'], inputCost: 0.15, outputCost: 0.60, free: true, note: 'Veloce con reasoning · da testare KG' },
    'gemini-2.5-pro': { tier: '💎 Potente', caps: ['text', 'pdf', 'url', 'audio', 'youtube', 'json'], inputCost: 1.25, outputCost: 10.00, free: false, note: 'Reasoning avanzato · da testare KG' },
    // ── Alias senza versione (-latest) ──
    'gemini-flash-lite': { tier: '🟢 Economico', caps: ['text', 'pdf', 'url', 'json'], inputCost: 0.10, outputCost: 0.40, free: true, note: 'Alias flash-lite-latest (KG ~1.9, test 2/6/26)' },
    'gemini-flash': { tier: '⚡ Veloce', caps: ['text', 'pdf', 'url', 'json'], inputCost: 0.15, outputCost: 0.60, free: true, note: 'Alias gemini-flash-latest' },
    'gemini-pro': { tier: '💎 Potente', caps: ['text', 'pdf', 'url', 'json'], inputCost: 1.25, outputCost: 5.00, free: false, note: 'Alias gemini-pro-latest' },
    // ── Deprecated (nascosti nel dropdown) ──
    'gemini-2.0-flash': { tier: '📦 Legacy', caps: ['text', 'pdf', 'url', 'audio', 'youtube', 'json'], inputCost: 0.10, outputCost: 0.40, free: true, deprecated: true, note: 'Discontinued — usa gemini-2.5-flash-lite' },
    'gemini-2.0-flash-lite': { tier: '📦 Legacy', caps: ['text', 'pdf', 'url', 'json'], inputCost: 0.05, outputCost: 0.20, free: true, deprecated: true, note: 'Discontinued — usa gemini-2.5-flash-lite' },
    'gemini-1.5-flash': { tier: '📦 Legacy', caps: ['text', 'pdf', 'url', 'audio', 'youtube', 'json'], inputCost: 0.075, outputCost: 0.30, free: true, deprecated: true, note: 'Legacy — usa gemini-3-flash' },
    'gemini-1.5-pro': { tier: '📦 Legacy', caps: ['text', 'pdf', 'url', 'audio', 'youtube', 'json'], inputCost: 1.25, outputCost: 5.00, free: false, deprecated: true, note: 'Legacy — usa gemini-2.5-pro' },
    // ── Infomaniak ──
    // Mistral Small — prefix matches mistral-small-4-119b-2603, mistralai/mistral-small-*, ecc.
    'mistralai/mistral-small': { tier: '🇨🇭 Swiss Made', caps: ['text', 'json'], inputCost: 0.10, outputCost: 0.30, free: false, note: 'Infomaniak · MM ottimo (58+ nodi), 200K ctx (test 2/6/26)' },
    'mistral-small': { tier: '🇨🇭 Swiss Made', caps: ['text', 'json'], inputCost: 0.10, outputCost: 0.30, free: false, note: 'Infomaniak · MM ottimo (58+ nodi), 200K ctx (test 2/6/26)' },
    'ministral': { tier: '🇨🇭 Swiss Made', caps: ['text', 'json'], inputCost: 0.10, outputCost: 0.30, free: false, note: 'Infomaniak · MM buono (49 nodi), leggero/veloce' },
    'mistralai/ministral': { tier: '🇨🇭 Swiss Made', caps: ['text', 'json'], inputCost: 0.10, outputCost: 0.30, free: false, note: 'Infomaniak · MM buono (49 nodi), leggero/veloce' },
    'qwen': { tier: '🇨🇭 Swiss Made', caps: ['text', 'json'], inputCost: 0.15, outputCost: 0.60, free: false, note: 'Infomaniak · 200K ctx · reasoning inadatto per MM/KG' },
    'kimi': { tier: '🇨🇭 Swiss Made', caps: ['text', 'json'], inputCost: 0.15, outputCost: 0.60, free: false, note: 'Infomaniak · 256K ctx · non testato' },
    'moonshotai/kimi': { tier: '🇨🇭 Swiss Made', caps: ['text', 'json'], inputCost: 0.15, outputCost: 0.60, free: false, note: 'Infomaniak · 256K ctx · non testato' },
    'google/gemma-4': { tier: '🇨🇭 Swiss Made', caps: ['text', 'json'], inputCost: 0.20, outputCost: 0.40, free: false, note: 'Infomaniak · KG density ~1.4 (ceiling), MM ok (test 2/6/26)' },
    'google/gemma': { tier: '🇨🇭 Swiss Made', caps: ['text', 'json'], inputCost: 0.20, outputCost: 0.40, free: false, deprecated: true, note: 'Usa google/gemma-4 (versione specifica)' },
    'gemma-4': { tier: '🇨🇭 Swiss Made', caps: ['text', 'json'], inputCost: 0.20, outputCost: 0.40, free: false, note: 'Infomaniak · KG density ~1.4 (ceiling), MM ok (test 2/6/26)' },
    'gemma': { tier: '🇨🇭 Swiss Made', caps: ['text', 'json'], inputCost: 0.20, outputCost: 0.40, free: false, deprecated: true, note: 'Usa gemma-4 (versione specifica)' },
    'apertus': { tier: '🇨🇭 Swiss Made', caps: ['text', 'json'], inputCost: 0.20, outputCost: 0.40, free: false, note: 'Infomaniak · solo MM (no KG), contesto 65K' },
    'swiss-ai/apertus': { tier: '🇨🇭 Swiss Made', caps: ['text', 'json'], inputCost: 0.20, outputCost: 0.40, free: false, note: 'Infomaniak · solo MM (no KG), contesto 65K' },
};

// Match a model ID to its KB entry (best fuzzy match or dynamic fallback)
function matchModelKB(modelId) {
    if (!modelId) return null;
    const id = modelId.toLowerCase().replace('models/', '');

    // 1. Try to find in currently available models (stored in localStorage)
    const isInfomaniak = (window.appState && window.appState.aiProvider === 'infomaniak');
    const storageKey = isInfomaniak ? 'infomaniak_available_models' : 'gemini_available_models';
    const savedModelsStr = localStorage.getItem(storageKey);
    if (savedModelsStr) {
        try {
            const savedModels = JSON.parse(savedModelsStr);
            const found = savedModels.find(m => m.id.toLowerCase() === modelId.toLowerCase() || m.id.toLowerCase().replace('models/', '') === id);
            if (found && found.kb) {
                return found.kb;
            }
        } catch (e) {
            console.error("Error parsing saved models from localStorage:", e);
        }
    }

    // 2. Prefix match — ordina per lunghezza decrescente: pattern più specifici prima.
    // Es: "gemini-2.5-flash-lite" deve matchare PRIMA di "gemini-2.5-flash".
    const kbPatterns = Object.keys(MODEL_KB).sort((a, b) => b.length - a.length);
    for (const pattern of kbPatterns) {
        if (id.startsWith(pattern)) return MODEL_KB[pattern];
    }
    // 3. Fuzzy: strip preview/exp/latest e riprova con lo stesso ordine
    const base = id.replace(/-preview.*$/, '').replace(/-exp.*$/, '').replace(/-latest$/, '');
    for (const pattern of kbPatterns) {
        if (base.startsWith(pattern) || base === pattern) return MODEL_KB[pattern];
    }

    // IF NOT FOUND: generate dynamic KB based on name!
    let dynamicTier = 'Nuovi Modelli';
    let isFree = false;
    let iCost = 0.5;
    let oCost = 2.0;
    if (id.includes('flash')) {
        dynamicTier = '⚡ Veloce';
        isFree = true;
        iCost = 0.1;
        oCost = 0.4;
    }
    if (id.includes('pro')) {
        dynamicTier = '💎 Potente';
        isFree = false;
        iCost = 1.25;
        oCost = 5.0;
    }
    if (id.includes('lite') || id.includes('8b')) {
        dynamicTier = '🟢 Economico';
        isFree = true;
        iCost = 0.05;
        oCost = 0.2;
    }
    return {
        tier: dynamicTier,
        caps: ['text', 'json'], // base capabilities
        inputCost: iCost,
        outputCost: oCost,
        free: isFree,
        note: 'Modello identificato dinamicamente'
    };
}

// Capability emoji map
const CAP_LABELS = {
    text: '📝 Testo', pdf: '📄 PDF', url: '🌐 URL',
    youtube: '🎬 YouTube', audio: '🎙️ Audio', json: '📊 JSON'
};

function renderModelSelect(models, selectEl, currentValue) {
    if (!selectEl) return;
    selectEl.innerHTML = '';

    const tierOrder = ['🇨🇭 Swiss Made', '⚡ Veloce', '💎 Potente', '🟢 Economico', '📦 Legacy', 'Nuovi Modelli'];
    const groups = {};

    models.forEach(m => {
        const kb = m.kb || { tier: 'Nuovi Modelli', free: false, inputCost: 0, outputCost: 0, note: '', caps: ['text'] };
        const tier = kb.tier;
        if (!groups[tier]) groups[tier] = [];
        groups[tier].push(m);
    });

    tierOrder.forEach(tier => {
        if (!groups[tier] || groups[tier].length === 0) return;
        // Stabili prima di preview/exp — l'API restituisce spesso varianti multiple
        groups[tier].sort((a, b) => {
            const stableA = (a.id.includes('preview') || a.id.includes('exp') ? 0 : 1);
            const stableB = (b.id.includes('preview') || b.id.includes('exp') ? 0 : 1);
            return stableB - stableA;
        });
        const optgroup = document.createElement('optgroup');
        optgroup.label = tier;
        groups[tier].forEach(m => {
            const opt = document.createElement('option');
            opt.value = m.id;
            const kb = m.kb || { free: false, inputCost: 0, outputCost: 0, note: '', caps: ['text'] };
            let costStr = '';
            if (kb.free) {
                costStr = '🆓 Gratis';
            } else if (kb.inputCost > 0) {
                const mapCost = (kb.inputCost * 5 / 1000) + (kb.outputCost * 4 / 1000);
                costStr = `~${(mapCost * 100).toFixed(0)}¢/mappa`;
            } else {
                costStr = 'Costo Variabile';
            }
            opt.textContent = `${m.displayName || m.id.replace('models/', '')} — ${costStr}`;
            opt.title = `${kb.note} | Input: $${kb.inputCost}/1M tok | Output: $${kb.outputCost}/1M tok\nFormati: ${kb.caps.map(c => CAP_LABELS[c]?.split(' ')[1] || c).join(', ')}`;
            optgroup.appendChild(opt);
        });
        selectEl.appendChild(optgroup);
    });

    if (currentValue && [...selectEl.options].some(o => o.value === currentValue)) {
        selectEl.value = currentValue;
    } else if (selectEl.options.length > 0) {
        // Saved model not found in list (e.g. model removed from API): pick first available
        // but DON'T overwrite localStorage — the saved model might reappear next fetch
        selectEl.value = selectEl.options[0].value;
    }
    if (typeof updateModelCapabilities === 'function') updateModelCapabilities();
}

window.refreshGeminiModels = async function () {
    const isInfomaniak = (appState.aiProvider === 'infomaniak');
    const apiKey = window.getSystemKey();
    const selectEl = document.getElementById('model-select');
    const statusEl = document.getElementById('models-status');
    const refreshIcon = document.getElementById('refresh-models-icon');

    // If no API key, clear the select box and show message
    if (!apiKey) {
        if (selectEl) selectEl.innerHTML = '<option value="">Nessun modello (manca API Key)</option>';
        window.showToast("Inserisci prima una API Key per caricare i modelli.", "error");
        if (statusEl) {
            statusEl.innerText = "Attesa inserimento API Key...";
            statusEl.classList.remove('hidden');
        }
        if (window.updateTokenCostEstimator) window.updateTokenCostEstimator();
        return;
    }

    let productId = null;
    if (isInfomaniak) {
        productId = document.getElementById('infomaniak-product-id')?.value || appState.infomaniakProductId;
        if (!productId) {
            if (selectEl) selectEl.innerHTML = '<option value="">Nessun modello (manca Product ID)</option>';
            window.showToast("Inserisci il Product ID per caricare i modelli Infomaniak.", "error");
            if (statusEl) { statusEl.innerText = "Attesa inserimento Product ID..."; statusEl.classList.remove('hidden'); }
            if (window.updateTokenCostEstimator) window.updateTokenCostEstimator();
            return;
        }
    }

    const storageKey = isInfomaniak ? 'infomaniak_selected_model' : 'gemini_selected_model';
    const currentValue = localStorage.getItem(storageKey) || (selectEl ? selectEl.value : '');

    if (statusEl) { statusEl.innerText = "Caricamento modelli in corso..."; statusEl.classList.remove('hidden'); }
    if (refreshIcon) refreshIcon.style.animation = 'spin 1s linear infinite';

    try {
        let rawModels = [];
        if (isInfomaniak) {
            if (!window.electronAPI || !window.electronAPI.listInfomaniakModels) {
                throw new Error("API list-infomaniak-models non disponibile");
            }
            rawModels = await window.electronAPI.listInfomaniakModels({ apiKey, productId });
        } else {
            if (!window.electronAPI || !window.electronAPI.listModels) {
                throw new Error("API list-models non disponibile");
            }
            rawModels = await window.electronAPI.listModels({ apiKey });
        }

        if (!rawModels || rawModels.error || !Array.isArray(rawModels)) {
            const errMsg = (rawModels && rawModels.error) ? rawModels.error : "Risposta non valida o errore di connessione.";
            if (selectEl) selectEl.innerHTML = `<option value="">Errore: ${errMsg}</option>`;
            if (statusEl) statusEl.innerText = `Errore: ${errMsg}`;
            return;
        }

        let filteredModels = [];
        if (isInfomaniak) {
            // Default (All Models): mostra tutto eccetto embed. Modalità BETA: solo Gemma/Apertus.
            filteredModels = rawModels.filter(m => {
                const id = m.id.toLowerCase();
                if (id.includes('embed')) return false;
                if (appState.infomaniakAllModels) return true;
                return (id.includes('gemma') || id.includes('google') || id.includes('apertus'));
            });
        } else {
            // Filter out unsupported models for Gemini
            const excludePatterns = ['tts', 'live', 'embed', 'image', 'nano-banana', 'veo', 'lyria', 'imagen', 'robotics', 'deep-research', 'computer-use'];
            filteredModels = rawModels.filter(m => {
                const id = m.id.toLowerCase();
                if (excludePatterns.some(p => id.includes(p))) return false;
                if (!id.includes('gemini')) return false;
                // Escludi modelli marcati deprecated nel KB (discontinued o legacy nascosto)
                const kb = matchModelKB(m.id);
                if (kb && kb.deprecated) return false;
                return true;
            });
        }

        if (filteredModels.length === 0) {
            if (selectEl) selectEl.innerHTML = '<option value="">Nessun modello compatibile</option>';
            if (statusEl) statusEl.innerText = "Nessun modello compatibile trovato.";
            return;
        }

        // Enrich with KB data and group by tier
        const groups = {}; // tier -> [models]
        const tierOrder = ['⚡ Veloce', '💎 Potente', '🟢 Economico', '📦 Legacy', 'Nuovi Modelli'];

        filteredModels.forEach(m => {
            const kb = matchModelKB(m.id);
            if (!kb) return;
            m.kb = kb;
            const tier = kb.tier;
            if (!groups[tier]) groups[tier] = [];
            groups[tier].push(m);
        });

        // Sort within each group: stable before preview, newer versions first
        Object.values(groups).forEach(arr => {
            arr.sort((a, b) => {
                const scoreA = (a.id.includes('preview') || a.id.includes('exp') ? 0 : 10);
                const scoreB = (b.id.includes('preview') || b.id.includes('exp') ? 0 : 10);
                return scoreB - scoreA;
            });
        });

        // Populate select with optgroups
        if (selectEl) {
            renderModelSelect(filteredModels, selectEl, currentValue);
            const availableModelsKey = isInfomaniak ? 'infomaniak_available_models' : 'gemini_available_models';
            localStorage.setItem(availableModelsKey, JSON.stringify(filteredModels.map(m => ({ id: m.id, displayName: m.displayName, kb: m.kb }))));
        }

        if (statusEl) { statusEl.innerText = `${filteredModels.length} modelli compatibili trovati.`; }

    } catch (err) {
        console.error('Error fetching models:', err);
        if (statusEl) { statusEl.innerText = "Errore nel caricamento. Usa i modelli preimpostati."; }
    } finally {
        if (refreshIcon) refreshIcon.style.animation = '';
    }
}

// Show capabilities of the currently selected model
function updateModelCapabilities() {
    const selectEl = document.getElementById('model-select');
    const capsEl = document.getElementById('model-capabilities');
    if (!selectEl || !capsEl) return;

    const modelId = selectEl.value;
    const kb = matchModelKB(modelId);
    if (!kb) {
        capsEl.innerHTML = '';
        capsEl.classList.add('hidden');
        if (window.updateTokenCostEstimator) window.updateTokenCostEstimator();
        return;
    }

    const costStr = kb.free
        ? '<span class="text-emerald-600 font-bold">🆓 Gratuito (con limiti)</span>'
        : `<span class="text-violet-600 font-bold">💰 ~${((kb.inputCost * 5 / 1000 + kb.outputCost * 4 / 1000) * 100).toFixed(0)} cent/mappa</span>`;

    capsEl.innerHTML = `
                <div class="flex flex-wrap gap-1.5 mb-2">
                    ${kb.caps.map(c => `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold ${c === 'pdf' ? 'bg-red-100 text-red-700' :
        c === 'url' ? 'bg-blue-100 text-blue-700' :
            c === 'youtube' ? 'bg-rose-100 text-rose-700' :
                c === 'audio' ? 'bg-amber-100 text-amber-700' :
                    c === 'json' ? 'bg-emerald-100 text-emerald-700' :
                        'bg-slate-100 text-slate-700'
        }">${CAP_LABELS[c] || c}</span>`).join('')}
                </div>
                <div class="flex items-center justify-between">
                    ${costStr}
                    <span class="text-[10px] text-slate-400 italic">${kb.note}</span>
                </div>`;
    capsEl.classList.remove('hidden');
    if (window.updateTokenCostEstimator) window.updateTokenCostEstimator();
}

// Funzioni sicure per il processing delle stringhe multilinea
// Utility di testo estratte in mappai-text-utils.js (caricato PRIMA di app.js).
// Le funzioni qui delegano al modulo (comportamento invariato). Vedi docs/rules/06-modules-and-extraction.md
function cleanLabel(str) { return window.MappAITextUtils.cleanLabel(str); }
function getLabelLines(str) { return window.MappAITextUtils.getLabelLines(str); }
function extractDateFromLabel(label) { return window.MappAITextUtils.extractDateFromLabel(label); }
function stripHTML(html) { return window.MappAITextUtils.stripHTML(html); }

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
                response = await window.electronAPI.generateGemini({ apiKey, payload, model });
            }

            // Tracking Usage
            if (response && response.usageMetadata) {
                if (!appState.generationUsage) appState.generationUsage = { promptTokens: 0, candidateTokens: 0, totalTokens: 0 };
                appState.generationUsage.promptTokens += (response.usageMetadata.promptTokenCount || 0);
                appState.generationUsage.candidateTokens += (response.usageMetadata.candidatesTokenCount || 0);
                appState.generationUsage.totalTokens += (response.usageMetadata.totalTokenCount || 0);
                window.updateCostDisplay();
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
        const branchesVal = parseInt(document.getElementById('branches-slider')?.value || '2', 10);
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
        window.showToast("Inserisci un'API Key AI per continuare.", "error"); return;
    }
    var rootName = document.getElementById('root-node-name')?.value.trim();
    appState.extractionMode = document.getElementById('extraction-mode').value;

    if (appState.extractionMode === 'mindmap' && !rootName) {
        window.showToast("Inserisci il nome del nodo centrale per la mappa.", "error");
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
                rootName = firstSrc.file.name.replace(/\.[^/.]+$/, '').replace(/[_-]/g, ' ');
            } else {
                rootName = '';
            }
        }
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
                window.showLoadingOverlay(true, "Download contenuti dal Web...");
                try {
                    const res = await window.electronAPI.fetchUrl(urlVal);
                    if (res.success) {
                        textParts.push(`[FONTE WEB ${urlVal}]:\n` + res.text);
                        hasSources = true;
                    } else {
                        throw new Error(res.error);
                    }
                } catch (e) {
                    window.showToast("Errore caricamento URL: " + e.message, "error");
                    window.showLoadingOverlay(false);
                    return;
                }
            }
        } else if (src.type === 'youtube') {
            var ytVal = el.value.trim();
            if (ytVal) { textParts.push("[FONTE YOUTUBE]: " + ytVal); hasSources = true; }
        } else if (src.type === 'pdf' && src.file) {
            window.showLoadingOverlay(true, "Estrazione testo dal PDF locale...");
            try {
                let pdfText = await window.extractTextFromPDF(src.file);
                if (pdfText.trim()) {
                    textParts.push("[FONTE PDF " + src.file.name + "]:\n" + pdfText);
                    hasSources = true;
                }
            } catch (err) {
                window.showToast("Errore di estrazione dal PDF: " + err.message, "error");
                window.showLoadingOverlay(false);
                return;
            }
        } else if (src.type === 'doc' && src.file && src.file.name.toLowerCase().endsWith('.pdf')) {
            // Caso PDF caricato tramite bottone Documenti
            window.showLoadingOverlay(true, "Estrazione testo dal PDF...");
            try {
                let pdfText = await window.extractTextFromPDF(src.file);
                if (pdfText.trim()) {
                    textParts.push("[FONTE PDF " + src.file.name + "]:\n" + pdfText);
                    hasSources = true;
                }
            } catch (err) {
                window.showToast("Errore PDF: " + err.message, "error");
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
            window.showLoadingOverlay(true, "Estrazione testo dal documento Word...");
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
                window.showToast("Errore di estrazione dal DOCX: " + e.message, "error");
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
            window.showLoadingOverlay(true, `MappAI: Caricamento ${src.type.toUpperCase()} nel Cloud AI...`);
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
                window.showToast(`Errore upload ${src.type}: ${err.message}`, "error");
                window.showLoadingOverlay(false);
                return;
            }
        }
    }

    if (!hasSources) {
        window.showToast("Inserisci almeno una fonte testuale o un file valido per generare la mappa.", "error");
        return;
    }

    window.showLoadingOverlay(true, "Inizializzazione elaborazione " + (appState.extractionMode === 'mindmap' ? "Mappa Mentale..." : "Knowledge Graph..."), appState.extractionMode === 'mindmap' ? 'mindmap' : 'kg');

    if (appState.extractionMode === 'mindmap') {
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
    const disciplinePrompt = window.buildDisciplineSystemPrompt && window.buildDisciplineSystemPrompt();
    if (!disciplinePrompt) return base;
    return base + '\n\n--- FOCUS DISCIPLINARE ---\n' + disciplinePrompt;
}

// MM EXTRACTION (extractMindMapIterative, extractMindMapMultiPass)
// → estratto in js/mappai-mm-extraction.js (caricato dopo app.js)

/**
 * DEDUP CONSERVATIVA (approccio B): rileva nodi con label semanticamente
 * identica (gestendo singolare/plurale, accenti, articoli) generati in rami
 * diversi del multipass. Tiene il nodo "canonico" (livello più basso, più vicino
 * alla radice), PRESERVA i contenuti del duplicato accodandoli al canonico, e
 * redirige i collegamenti del duplicato verso il canonico marcandoli come
 * cross-link (isCross). Il duplicato come nodo viene rimosso, ma né il contenuto
 * né le connessioni vanno persi.
 */
/**
 * Assegna il "group" (hub di appartenenza) a un nodo L2 con voto pesato a 2 hop:
 * - link DIRETTO verso un hub: peso 3 (evidenza forte)
 * - hub raggiungibile tramite UN nodo intermedio: peso 1 (evidenza di supporto)
 * Questo rende il grouping robusto agli errori del modello: anche se un nodo ha
 * un singolo link errato verso l'hub sbagliato, i vicini corretti spostano il voto
 * verso l'hub giusto. Fallback: BFS verso l'hub più vicino, poi group 1.
 */
/**
 * Marca i link laterali di un KG come cross-link (isCross=true).
 * Un link è GERARCHICO (ancoraggio a un hub) se collega esattamente un Super-Hub
 * (level 1) a un concetto. È LATERALE / di RAGIONAMENTO (concetto↔concetto o
 * hub↔hub) in tutti gli altri casi: sono questi i collegamenti che danno
 * ricchezza riflessiva al grafo e che vanno distinti dalla gerarchia per il
 * rendering (childrenOf usa !isCross) e per l'analisi strutturale.
 * Preserva gli isCross già impostati (es. da dedupeNodesAsCrossLinks).
 */
window.markKgCrossLinks = function (nodes, links) {
    const levelOf = {};
    (nodes || []).forEach(n => { levelOf[n.id] = n.level; });
    (links || []).forEach(l => {
        if (l.isCross === true) return; // già marcato altrove
        const sId = typeof l.source === 'object' ? l.source.id : l.source;
        const tId = typeof l.target === 'object' ? l.target.id : l.target;
        const sHub = levelOf[sId] === 1;
        const tHub = levelOf[tId] === 1;
        const hierarchical = (sHub !== tHub); // XOR: esattamente uno è hub
        l.isCross = !hierarchical;
    });
    return links;
};

/**
 * Marca i cross-link in una MindMap.
 * In MM la gerarchia è esplicita: un link è gerarchico (parent→child) se
 * collega due nodi con |levelDiff| === 1 E stesso group (stessa macro-area).
 * Tutto il resto è cross-link: jump di livello, link tra rami diversi,
 * link tra nodi dello stesso livello, ecc.
 * Idempotente: non sovrascrive isCross se già impostato esplicitamente.
 */
window.markMmCrossLinks = function (nodes, links) {
    const levelOf = {}, groupOf = {};
    (nodes || []).forEach(n => { levelOf[n.id] = n.level; groupOf[n.id] = n.group; });
    (links || []).forEach(l => {
        const sId = typeof l.source === 'object' ? l.source.id : l.source;
        const tId = typeof l.target === 'object' ? l.target.id : l.target;
        const sLvl = levelOf[sId], tLvl = levelOf[tId];
        const sameGroup = groupOf[sId] === groupOf[tId];
        const adjacentLevels = (sLvl !== undefined && tLvl !== undefined)
            && Math.abs(sLvl - tLvl) === 1;
        const hierarchical = adjacentLevels && sameGroup;
        l.isCross = !hierarchical;
    });
    return links;
};

window._assignHubGroup = function (nodeId, links, hubGroupMap) {
    const votes = {};
    const neighbors = [];
    links.forEach(l => {
        const s = typeof l.source === 'object' ? l.source.id : l.source;
        const t = typeof l.target === 'object' ? l.target.id : l.target;
        let other = null;
        if (s === nodeId) other = t;
        else if (t === nodeId) other = s;
        if (other === null) return;
        if (hubGroupMap[other] !== undefined) {
            votes[hubGroupMap[other]] = (votes[hubGroupMap[other]] || 0) + 3; // diretto
        } else {
            neighbors.push(other);
        }
    });
    // 2° hop: hub collegati ai vicini non-hub
    neighbors.forEach(nb => {
        links.forEach(l => {
            const s = typeof l.source === 'object' ? l.source.id : l.source;
            const t = typeof l.target === 'object' ? l.target.id : l.target;
            let other = null;
            if (s === nb) other = t;
            else if (t === nb) other = s;
            if (other !== null && hubGroupMap[other] !== undefined) {
                votes[hubGroupMap[other]] = (votes[hubGroupMap[other]] || 0) + 1; // supporto
            }
        });
    });
    const voted = Object.keys(votes);
    if (voted.length > 0) {
        return parseInt(voted.sort((a, b) => votes[b] - votes[a])[0]);
    }
    // Fallback: BFS verso l'hub più vicino
    const visited = new Set([nodeId]);
    const queue = [nodeId];
    while (queue.length > 0) {
        const cur = queue.shift();
        if (hubGroupMap[cur] !== undefined && cur !== nodeId) return hubGroupMap[cur];
        links.forEach(l => {
            const s = typeof l.source === 'object' ? l.source.id : l.source;
            const t = typeof l.target === 'object' ? l.target.id : l.target;
            if (s === cur && !visited.has(t)) { visited.add(t); queue.push(t); }
            if (t === cur && !visited.has(s)) { visited.add(s); queue.push(s); }
        });
        if (visited.size > 50) break;
    }
    return 1;
};

window.dedupeNodesAsCrossLinks = function () {
    if (!appState.db || !Array.isArray(appState.db.nodes) || appState.db.nodes.length === 0) return;

    // Normalizzazione conservativa: minuscolo, accenti rimossi, articoli iniziali
    // rimossi, e ogni parola "stemmata" togliendo la vocale finale (così
    // "corsa"≈"corse", "stato"≈"stati"). Punteggiatura e spazi normalizzati.
    const normKey = (lbl) => {
        if (!lbl) return '';
        let s = String(lbl).toLowerCase().trim();
        s = s.normalize('NFD').replace(/[̀-ͯ]/g, ''); // togli accenti
        s = s.replace(/["'«»“”„().,;:!?\-]/g, ' ');
        s = s.replace(/\b(il|lo|la|i|gli|le|un|uno|una|del|della|dei|degli|delle|di|e|ed)\b/g, ' ');
        const words = s.split(/\s+/).filter(Boolean).map(w => w.length > 3 ? w.replace(/[aeiou]$/, '') : w);
        return words.sort().join(' '); // sort: indipendente dall'ordine delle parole
    };

    const nodes = appState.db.nodes;
    const groups = {};
    nodes.forEach(n => {
        const k = normKey(n.label);
        if (!k) return;
        (groups[k] = groups[k] || []).push(n);
    });

    const links = appState.db.links || [];
    const removedIds = new Set();
    let mergedCount = 0;

    Object.values(groups).forEach(group => {
        if (group.length < 2) return;

        // Canonico = livello più basso (più vicino alla radice); a parità, il più connesso
        const degree = (id) => links.filter(l => {
            const s = typeof l.source === 'object' ? l.source.id : l.source;
            const t = typeof l.target === 'object' ? l.target.id : l.target;
            return s === id || t === id;
        }).length;
        group.sort((a, b) => (parseInt(a.level) - parseInt(b.level)) || (degree(b.id) - degree(a.id)));
        const canonical = group[0];

        group.slice(1).forEach(dup => {
            if (dup.id === canonical.id) return;

            // Preserva il contenuto: accoda desc/chunks unici del duplicato al canonico
            if (dup.desc && canonical.desc && !canonical.desc.includes(dup.desc)) {
                canonical.desc = (canonical.desc + '\n\n' + dup.desc).trim();
            } else if (dup.desc && !canonical.desc) {
                canonical.desc = dup.desc;
            }
            if (Array.isArray(dup.chunks) && dup.chunks.length) {
                canonical.chunks = canonical.chunks || [];
                dup.chunks.forEach(c => { if (!canonical.chunks.includes(c)) canonical.chunks.push(c); });
            }

            // Redirige i link del duplicato verso il canonico, marcandoli cross-link
            links.forEach(l => {
                const s = typeof l.source === 'object' ? l.source.id : l.source;
                const t = typeof l.target === 'object' ? l.target.id : l.target;
                if (s === dup.id) { l.source = canonical.id; l.isCross = true; }
                if (t === dup.id) { l.target = canonical.id; l.isCross = true; }
            });

            removedIds.add(dup.id);
            mergedCount++;
        });
    });

    if (mergedCount === 0) return;

    // Rimuovi i nodi duplicati e ripulisci i link (self-loop e duplicati esatti)
    appState.db.nodes = nodes.filter(n => !removedIds.has(n.id));
    const seen = new Set();
    appState.db.links = links.filter(l => {
        const s = typeof l.source === 'object' ? l.source.id : l.source;
        const t = typeof l.target === 'object' ? l.target.id : l.target;
        if (s === t) return false; // self-loop creato dal redirect
        const key = s + '→' + t;
        if (seen.has(key)) return false; // link duplicato
        seen.add(key);
        return true;
    });

    console.info('[MappAI] Dedup: ' + mergedCount + ' doppioni cross-ramo trasformati in cross-link.');
};

/**
 * Estrae il primo blocco JSON bilanciato (oggetto {} o array []) da una stringa,
 * ignorando eventuali preamboli/postamboli testuali e gestendo correttamente
 * graffe/parentesi che compaiono DENTRO le stringhe (così non si confonde con
 * il testo dei valori). Restituisce la sottostringa JSON oppure null.
 *
 * Questo è il punto chiave per i modelli open source verbosi (es. Qwen3.5-122B),
 * che spesso scrivono "Ecco il JSON:" prima e una spiegazione dopo l'oggetto.
 */
// _extractBalancedJSON + salvageTruncatedJSON estratti in mappai-json-salvage.js
// (caricato PRIMA di app.js). Le funzioni qui delegano al modulo (comportamento invariato).
// REGOLA: mai JSON.parse diretto sull'output AI → vedi docs/rules/03-json-from-ai.md
function _extractBalancedJSON(text) { return window.MappAIJsonSalvage.extractBalancedJSON(text); }
function salvageTruncatedJSON(text) { return window.MappAIJsonSalvage.salvage(text); }

// ──────────────────────────────────────────────────────────────────────────
// FREEZE CHUNK VERBATIM (preparazione STEP 2 — chunks extra-pass)
// ──────────────────────────────────────────────────────────────────────────
//
// Interruttore reversibile (localStorage 'mappai_freeze_chunks'). Quando attivo,
// i chunk verbatim NON vengono salvati: né su node.chunks (→ niente sezione
// "## Fonti" nel vault), né in appState.db.sourcesDict (→ niente fonte nel modale).
//
// Implementazione: stripChunksIfFrozen() azzera n.chunks sugli oggetti nodo AI
// GREZZI prima che vengano consumati. A valle, sia `chunks: n.chunks || []` sia
// la popolazione di sourcesDict (entrambe leggono n.chunks) diventano no-op.
//
// NON tocca i prompt (i modelli continuano a generare chunk, ma vengono scartati)
// né il caricamento dei vault esistenti (i chunk già salvati restano leggibili).
// Comandi: MappAIMetrics.enableChunkFreeze() / .disableChunkFreeze() / .chunkFreezeStatus()
window.areChunksFrozen = function () {
    try { return localStorage.getItem('mappai_freeze_chunks') === '1'; }
    catch (e) { return false; }
};

window.stripChunksIfFrozen = function (nodeArr) {
    if (!Array.isArray(nodeArr) || !window.areChunksFrozen()) return nodeArr;
    let stripped = 0;
    nodeArr.forEach(n => {
        if (n && typeof n === 'object' && Array.isArray(n.chunks) && n.chunks.length) {
            n.chunks = [];
            stripped++;
        }
    });
    if (stripped) console.log(`[Freeze chunks] ${stripped} nodi: chunk verbatim scartati (non salvati)`);
    return nodeArr;
};

// ──────────────────────────────────────────────────────────────────────────
// JSONL parser (Strategia 1A — formato sezionato resistente al troncamento)
// ──────────────────────────────────────────────────────────────────────────
//
// Formato atteso (output del modello):
//
//   ===NODES===
//   {"id":"X","label":"A","level":2,"desc":"..."}
//   {"id":"Y","label":"B","level":2,"desc":"..."}
//   ===LINKS===
//   {"source":"X","target":"Y","rel":"include"}
//   {"source":"Y","target":"Z","rel":"causa"}
//
// Resilienza:
//   - Riga JSON malformata → scartata, le altre sopravvivono
//   - Troncamento a metà oggetto → si perde SOLO l'ultima riga di una sezione
//   - Section header alterato (es. "## NODES ##") → fallback su euristica
//   - Markdown ```...``` → rimosso automaticamente
//
// Restituisce: { nodes, links, meta: { recovered, lost, partial, sections } }
window.parseJSONLResponse = function (text) {
    const meta = { recovered: { nodes: 0, links: 0 }, lost: { nodes: 0, links: 0 }, partial: false, sections: [] };
    if (typeof text !== 'string' || !text.trim()) {
        return { nodes: [], links: [], meta };
    }

    // Pulizia preliminare: rimuovi fence markdown
    let cleaned = text
        .replace(/```jsonl?\s*/gi, '')
        .replace(/```\s*/g, '')
        .trim();

    // Trova i marker di sezione (tollerante a varianti: ===NODES=== / ## NODES ## / [NODES])
    // Riconosce: NODES, LINKS, EDGES, RELATIONS, MERGES, CROSSLINKS (alias CROSS_LINKS, CROSS-LINKS).
    const sectionRegex = /(?:^|\n)\s*(?:===+|##+|\[)\s*(NODES?|LINKS?|EDGES?|RELATIONS?|MERGES?|CROSS[-_ ]?LINKS?)\s*(?:===+|##+|\])\s*(?:\n|$)/gi;
    const markers = [];
    let m;
    const classifyKind = (label) => {
        const u = label.toUpperCase().replace(/[-_ ]/g, '');
        if (u === 'NODE' || u === 'NODES') return 'nodes';
        if (u === 'MERGE' || u === 'MERGES') return 'merges';
        if (u === 'CROSSLINK' || u === 'CROSSLINKS') return 'crosslinks';
        return 'links'; // LINKS, EDGES, RELATIONS
    };
    while ((m = sectionRegex.exec(cleaned)) !== null) {
        markers.push({ kind: classifyKind(m[1]), start: m.index, headerEnd: m.index + m[0].length });
    }

    // Normalizza le chiavi di un oggetto: rimuove spazi iniziali/finali.
    // Mistral Small produce sistematicamente "id ", "label ", "content " con
    // uno spazio finale → senza questo, obj.id sarebbe undefined.
    // Idempotente: se le chiavi sono già pulite, restituisce l'oggetto invariato
    // (no allocazione extra) per non penalizzare i provider corretti.
    const normalizeKeys = (obj) => {
        if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return obj;
        let needsRebuild = false;
        for (const k of Object.keys(obj)) {
            if (k !== k.trim()) { needsRebuild = true; break; }
        }
        if (!needsRebuild) return obj;
        const out = {};
        for (const k of Object.keys(obj)) out[k.trim()] = obj[k];
        return out;
    };

    const parseLine = (line) => {
        const s = line.trim();
        if (!s || s.startsWith('//') || s.startsWith('#')) return null;
        // Rimuovi commenti in coda: "} // nota", "} # nota", "} <!-- nota -->"
        const noComment = s.replace(/\}\s*\/\/.*$/, '}').replace(/\}\s*#.*$/, '}').replace(/\}\s*<!--.*?-->\s*$/, '}').replace(/\}\s*<!--.*$/, '}').trim();
        // Normalizza chiavi con spazi ("desc ": → "desc":) prodotte da Mistral
        const spaceFixed = noComment.replace(/"([^"]+)"\s*:/g, (_, k) => '"' + k.trim() + '":');
        const trimmed = spaceFixed.replace(/,\s*$/, '');

        // Tentativo 1: parse diretto
        try {
            return normalizeKeys(JSON.parse(trimmed));
        } catch (e1) { /* fall through */ }

        // Tentativo 2: double-escape recovery (pattern frequente Mistral Small).
        // Il modello produce {\"id\":\"X\"} invece di {"id":"X"}. Rimuoviamo i
        // backslash davanti alle virgolette e riproviamo.
        if (trimmed.includes('\\"')) {
            try {
                const unescaped = trimmed.replace(/\\"/g, '"');
                return normalizeKeys(JSON.parse(unescaped));
            } catch (e2) { /* fall through */ }
        }

        // Tentativo 3: parser ha visto `\n` letterale dentro stringhe (errore tipico
        // quando il modello mette newline reale invece di \\n). Sostituisce \n con
        // spazio e riprova. Pattern visto su Mistral: "desc":"...\nseguito..."
        if (trimmed.includes('\n')) {
            try {
                const inlined = trimmed.replace(/\n/g, ' ');
                return normalizeKeys(JSON.parse(inlined));
            } catch (e3) { /* fall through */ }
        }

        return undefined; // undefined = riga rotta (vs null = riga vuota)
    };

    // Estendi meta.recovered/lost per tutte le sezioni note
    ['merges', 'crosslinks'].forEach(k => {
        if (meta.recovered[k] === undefined) meta.recovered[k] = 0;
        if (meta.lost[k] === undefined) meta.lost[k] = 0;
    });
    meta.lostSamples = meta.lostSamples || []; // primi 3 esempi di righe scartate

    // Validazione per tipo: rifiuta oggetti che mancano dei campi minimi.
    // Un nodo senza id o label è inutilizzabile (il consumer chiama normalizeLabel
    // e normalizeId che esplodono su undefined). Un link senza source/target è
    // irrilevante. I merges e crosslinks hanno requisiti propri.
    const isValid = (obj, kind) => {
        if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return false;
        switch (kind) {
            case 'nodes':      return typeof obj.id === 'string' && obj.id.trim()
                                   && typeof obj.label === 'string' && obj.label.trim();
            case 'links': {
                if (typeof obj.source !== 'string' || !obj.source.trim()) return false;
                if (typeof obj.target !== 'string' || !obj.target.trim()) return false;
                // Filtra i "ghost link" di Apertus: usa "L5", "L4", "L3" ecc. come
                // placeholder generici per le foglie invece di ID reali. Pattern: target
                // è esattamente "L5" (o L4/L3/L2) oppure contiene "*" o "non specificato".
                const t = obj.target.trim();
                if (/^L\d+$/.test(t)) return false;
                if (t.includes('*') || t.toLowerCase().includes('non specificato')) return false;
                return true;
            }
            case 'merges':     return typeof obj.keep === 'string' && typeof obj.drop === 'string';
            case 'crosslinks': return typeof obj.source === 'string' && typeof obj.target === 'string';
            default:           return true;
        }
    };

    const parseSection = (raw, kind) => {
        const lines = raw.split('\n');
        const out = [];
        let lost = 0;
        for (const line of lines) {
            const r = parseLine(line);
            if (r === null) continue;            // riga vuota/commento → ignora
            const trimmed = line.trim();
            if (r === undefined) {
                // riga JSON malformato → sample per debug
                lost++;
                if (meta.lostSamples.length < 3 && trimmed) {
                    meta.lostSamples.push({ kind, reason: 'json invalido', sample: trimmed.slice(0, 120) });
                }
                continue;
            }
            if (!isValid(r, kind)) {
                // Apertus a volte "narra" le foglie invece di ometterle: emette un oggetto
                // link con target assente/null e un commento esplicativo
                // (es. {"source":"L1_2_L3_A1","target":null} // Foglia: no figli).
                // Non è un link perso: è un modo (maldestro) di dire "qui non c'è link".
                // Lo scartiamo senza contarlo come "lost" per non inquinare le metriche
                // di recupero con falsi positivi (il grafo non ne risente: era già filtrato).
                if (kind === 'links' && typeof r.source === 'string' && r.source.trim()
                    && (r.target === null || r.target === undefined)) {
                    continue;
                }
                lost++;
                if (meta.lostSamples.length < 3) {
                    meta.lostSamples.push({ kind, reason: 'campi obbligatori mancanti', sample: trimmed.slice(0, 120) });
                }
                continue;
            }
            out.push(r);
        }
        meta.recovered[kind] = (meta.recovered[kind] || 0) + out.length;
        meta.lost[kind] = (meta.lost[kind] || 0) + lost;
        meta.sections.push({ kind, recovered: out.length, lost });
        return out;
    };

    if (markers.length === 0) {
        // Fallback: nessun marker trovato → prova a interpretare TUTTO come nodi
        // (es. il modello ha solo prodotto nodi senza header). Distingue nodes da
        // links guardando le chiavi: se ha "source"+"target" → link.
        const allParsed = cleaned.split('\n').map(parseLine).filter(o => o && typeof o === 'object');
        const nodes = [], links = [];
        for (const obj of allParsed) {
            if (obj.source && obj.target) links.push(obj);
            else if (obj.id) nodes.push(obj);
        }
        meta.recovered.nodes = nodes.length;
        meta.recovered.links = links.length;
        meta.partial = true; // no header → output non standard
        return { nodes, links, meta };
    }

    // Itera le sezioni in ordine, ognuna delimitata dall'inizio della successiva
    const sortedMarkers = [...markers].sort((a, b) => a.start - b.start);
    const nodes = [], links = [], merges = [], crosslinks = [];
    const bucket = { nodes, links, merges, crosslinks };
    for (let i = 0; i < sortedMarkers.length; i++) {
        const mk = sortedMarkers[i];
        const end = (i + 1 < sortedMarkers.length) ? sortedMarkers[i + 1].start : cleaned.length;
        const body = cleaned.slice(mk.headerEnd, end);
        const items = parseSection(body, mk.kind);
        bucket[mk.kind].push(...items);
    }

    // Se ci sono righe perse, marca come parziale (il chiamante può loggarlo)
    if (Object.values(meta.lost).some(v => v > 0)) meta.partial = true;

    return { nodes, links, merges, crosslinks, meta };
};

// Costruisce il prompt di espansione ramo nel formato JSONL sezionato.
// Mantiene tutte le regole del prompt JSON originale (id, label, content,
// desc, level, chunks) ma cambia il formato di output per resistere al
// troncamento. Usato in extractMindMapMultiPass quando isJSONLEnabled().
window.buildBranchPromptJSONL = function (branch, opts) {
    const { rootNodeLabel, maxMapLevel, userProfileStr, focusInjection, textParts, fileParts, siblingCatalog } = opts;
    const sc = siblingCatalog || '';

    // ── C: Carta del ramo (gated dal flag branch boundaries; graceful se i campi mancano) ──
    const _ambitoPart = branch.ambito ? `\n- Ambito (concetti che DEVONO stare qui): ${branch.ambito}` : '';
    const _descPart = (branch.desc && !/^Categoria principale:/.test(branch.desc)) ? `\n- Descrizione: ${branch.desc}` : '';
    const _confiniPart = branch.confini ? `\n- Confini (NON sconfinare negli altri rami): ${branch.confini}` : '';
    const charter = (window.isBranchBoundariesEnabled && window.isBranchBoundariesEnabled() && (_ambitoPart || _descPart || _confiniPart))
        ? `\n📋 CARTA DEL RAMO "${branch.label}" — resta rigorosamente dentro questi confini:${_descPart}${_ambitoPart}${_confiniPart}\nApplica questi confini nelle tue scelte SENZA commentarli nell'output — niente note, spiegazioni o premesse: genera solo nodi e link.\n`
        : '';

    // ── D: Linking words significative (gated dal flag mappai_rich_rel_enabled) ──
    const relGuide = (window.isRichRelEnabled && window.isRichRelEnabled())
        ? `
🔗 LINKING WORDS — OGNI ARCO È UNA PROPOSIZIONE (stile concept-map)
Il campo "rel" NON deve quasi mai essere "include". Scegli il verbo/locuzione che rende la frase "GENITORE → rel → FIGLIO" una proposizione VERA e leggibile, supportata dalla fonte. Pesca dal vocabolario per famiglia:
- Causa/effetto: causa, provoca, genera, determina, porta a, alimenta
- Dipendenza/prerequisito: richiede, dipende da, è condizione di, permette
- Sequenza/processo: precede, segue, deriva da, evolve in
- Regolazione/controllo: regola, governa, guida, limita, sostiene
- Opposizione/contrasto: si oppone a, contrasta, ostacola, smaschera, condanna
- Contenimento (SOLO se non esiste relazione più precisa): comprende, è formato da, è esempio di, fa parte di
Evita "include"/"correlato a" salvo pura appartenenza gerarchica.
`
        : '';

    return `SEI UN MOTORE DI GENERAZIONE SOTTO-RAMI PER MAPPE MENTALI (Fase 3 - Dettagli del Ramo).
Hai il compito di sviluppare in ESTREMA PROFONDITÀ il sotto-ramo per la macro-area "${branch.label}" (ID di partenza: "${branch.id}") all'interno della Mappa Mentale su "${rootNodeLabel}".
${charter}
ISTRUZIONI PER IL RAMO:
1. Genera tutti i sotto-nodi gerarchici spingendoti fino al Livello ${maxMapLevel} (L2, L3, L4, L5) per esplorare in dettaglio estremo la macro-area.
2. Ciascun sotto-nodo generato deve definire:
   - "id": un ID unico in lettere maiuscole coerente con la gerarchia del ramo (es. ${branch.id}_L2_A, ${branch.id}_L3_A1, ${branch.id}_L4_A1a, ${branch.id}_L5_1).
   - "label": titolo sintetico e focalizzato (max 3 parole).
   - "content": sintesi didattica brevissima (max 10 parole).
   - "desc": paragrafo descrittivo approfondito e chiaro (da 50 a 80 parole). Includi dati specifici dal testo (nomi, cifre, meccanismi concreti). Evita generalità: ogni desc deve essere comprensibile da sola, senza contesto aggiuntivo.
   - "level": assegna un intero da 2 a ${maxMapLevel} in base alla profondità concettuale (2 per primari, fino a ${maxMapLevel} per foglie).
   - "chunks": un array contenente da 1 a 2 citazioni testuali REALI, INTEGRALI e VERBATIM (minimo 10-15 parole) copiate fedelmente dalle fonti testuali originali.
3. Definisci i collegamenti ("links") in un rigoroso albero gerarchico genitore-figlio. Ogni nodo di livello N deve avere come sorgente ("source") il rispettivo genitore di livello N-1. Il Livello 2 ha come sorgente "${branch.id}". Non creare connessioni trasversali verso nodi di altri rami — quelle verranno aggiunte in una fase successiva.
${relGuide}
⚠️ FORMATO DI OUTPUT — TASSATIVO ⚠️
NON restituire un singolo oggetto JSON. Restituisci DUE sezioni separate, OGNI OGGETTO SU UNA RIGA INDIPENDENTE:

===NODES===
{"id":"${branch.id}_L2_A","label":"Esempio","content":"breve (max 10 parole)","desc":"paragrafo descrittivo specifico e denso di 50-80 parole con dati concreti","level":2,"chunks":["citazione verbatim dalla fonte"]}
{"id":"${branch.id}_L2_B","label":"Altro","content":"breve","desc":"...","level":2,"chunks":["..."]}
===LINKS===
{"source":"${branch.id}","target":"${branch.id}_L2_A","rel":"${(window.isRichRelEnabled && window.isRichRelEnabled()) ? 'comprende' : 'include'}"}
{"source":"${branch.id}_L2_A","target":"${branch.id}_L3_A1","rel":"${(window.isRichRelEnabled && window.isRichRelEnabled()) ? 'è condizione di' : 'include'}"}

REGOLE TASSATIVE SUL FORMATO:
- UN oggetto JSON PER RIGA, niente array racchiudenti, niente virgole tra le righe
- Header sezione esattamente "===NODES===" e "===LINKS===" (tre uguali, maiuscolo)
- Nessun commento, nessun markdown, nessun testo prima o dopo le sezioni
- Se vai a capo dentro una stringa devi escaparlo come \\n
- Le CHIAVI JSON devono essere ESATTAMENTE: id, label, content, desc, level, chunks (senza spazi, senza spazi finali — NON "id ", NON "label ")
- Ogni virgoletta " dentro un valore stringa DEVE essere escapata come \\" (es: "desc":"Il \\"piano Wahlen\\" del 1940...")
- NIENTE prosa libera: se non sai cosa scrivere per un campo, scrivi "" (stringa vuota), NON una frase descrittiva fuori dal JSON
- Ogni riga deve INIZIARE con "{" e FINIRE con "}" — niente eccezioni
- ⛔ FOGLIE: i nodi foglia (livello ${maxMapLevel}) NON hanno figli — NON scrivere nessun link con "source" uguale all'ID di una foglia. NON usare "L5", "L${maxMapLevel}" o qualsiasi placeholder come "target" — usa solo ID reali definiti nella sezione NODES
- ⛔ NESSUN link con "target": null, "target": "L5", o "target" che contiene "*" — questi verranno scartati

${userProfileStr}
${focusInjection}${sc}

FONTI DA ANALIZZARE:
${textParts.join('\n\n')}`;
};

// Feature flag — abilita JSONL solo per Infomaniak e solo se opt-in via localStorage.
// Attivazione: localStorage.setItem('mappai_jsonl_enabled', '1')
// Disattivazione: localStorage.removeItem('mappai_jsonl_enabled')
window.isJSONLEnabled = function () {
    try {
        return localStorage.getItem('mappai_jsonl_enabled') === '1'
            && appState?.aiProvider === 'infomaniak';
    } catch (e) { return false; }
};

// ──────────────────────────────────────────────────────────────────────────
// FASE 4 — Consolidamento + Cross-link (Strategia B)
// ──────────────────────────────────────────────────────────────────────────
//
// Dopo che tutti i rami sono stati generati e il dedup deterministico è già
// passato, una chiamata AI riceve il grafo completo (id+label+desc[0:60])
// e produce due tipi di operazioni:
//   - MERGES: coppie (keep, drop) di nodi semanticamente equivalenti
//   - CROSSLINKS: relazioni tematiche tra rami diversi (causa, prerequisito, etc)
//
// Il risultato passa per `executeMerge` esistente (già robusto) per i merge
// e per push diretto su appState.db.links per i cross-link, con validazione
// (ID esistenti, no self-loop, no duplicati).
//
// Gated dal feature flag mappai_mm_phase4_enabled.

// ──────────────────────────────────────────────────────────────────────────
// FASE 1.5 — Validazione semantica delle macro-categorie L1
// ──────────────────────────────────────────────────────────────────────────
//
// Dopo che la Fase 1 ha prodotto la lista degli L1, una chiamata AI rapida
// verifica i tre antipattern più comuni e propone fusioni/sostituzioni:
//
//   - SINONIMI: due L1 che esprimono lo stesso concetto
//   - META-CATEGORIE: L1 che parlano del "come" invece che del "cosa"
//   - SOTTO-CAMPI dello stesso campo: 3 L1 tutte militari, ecc.
//
// L'output del Pass 1.5 sostituisce l1Data prima della costruzione di
// l1NodesData. Se la validazione fallisce o produce output invalido,
// degrada silenziosamente all'output originale (nessun crash).
//
// Gated dal feature flag mappai_l1_validation_enabled.

window.isL1ValidationEnabled = function () {
    try {
        return localStorage.getItem('mappai_l1_validation_enabled') === '1'
            && appState?.extractionMode === 'mindmap';
    } catch (e) { return false; }
};

// Fase 1.6 — split macro-categorie composte ("Neutralità e Difesa" → due aree atomiche).
// Pre-rami, quindi sicuro: nessun figlio da ridistribuire.
// Gated dal feature flag mappai_l1_split_enabled.
window.isL1SplitEnabled = function () {
    try {
        return localStorage.getItem('mappai_l1_split_enabled') === '1'
            && appState?.extractionMode === 'mindmap';
    } catch (e) { return false; }
};

// ──────────────────────────────────────────────────────────────────────────
// STRATEGIA A — Confini di ramo (catalogo L1 fratelli nei prompt Fase 3)
// ──────────────────────────────────────────────────────────────────────────
//
// Inietta nel prompt di espansione ogni ramo la lista dei rami fratelli.
// Il modello sa quali concetti NON sono di sua competenza → riduce i
// duplicati cross-ramo (undeveloped_branch) e migliora la classificazione
// L2/L3 nelle macro-aree corrette.
//
// Gated dal feature flag mappai_branch_boundaries_enabled.

window.isBranchBoundariesEnabled = function () {
    try {
        return localStorage.getItem('mappai_branch_boundaries_enabled') === '1'
            && appState?.extractionMode === 'mindmap';
    } catch (e) { return false; }
};

// Linking words significative su ogni arco (stile concept-map): inietta il vocabolario
// dei verbi nel prompt di ramo. Vale per entrambi i provider, solo in mindmap.
// Gated dal feature flag mappai_rich_rel_enabled.
window.isRichRelEnabled = function () {
    try {
        return localStorage.getItem('mappai_rich_rel_enabled') === '1'
            && appState?.extractionMode === 'mindmap';
    } catch (e) { return false; }
};

// ──────────────────────────────────────────────────────────────────────────
// EMBEDDING-DRIVEN SEMANTIC DEDUP (deterministico, no LLM)
// ──────────────────────────────────────────────────────────────────────────
// Google (gemini-embedding-001) o Infomaniak (bge-multilingual-gemma2),
// a seconda del provider attivo. Cosine similarity > threshold → merge
// automatico via window.executeMerge.
window.isSemanticDedupEnabled = function () {
    try {
        return localStorage.getItem('mappai_semantic_dedup_enabled') === '1'
            && (appState?.aiProvider === 'google' || appState?.aiProvider === 'infomaniak')
            && appState?.extractionMode === 'mindmap';
    } catch (e) { return false; }
};

window.fetchEmbeddings = async function (texts, model) {
    if (!Array.isArray(texts) || texts.length === 0) return [];
    const apiKey = window.getSystemKey ? window.getSystemKey() : null;
    if (!apiKey) throw new Error('API key mancante');

    if (appState.aiProvider === 'google') {
        if (!window.electronAPI?.generateEmbeddingsGoogle) {
            throw new Error('generateEmbeddingsGoogle IPC non disponibile (restart app richiesto?)');
        }
        const result = await window.electronAPI.generateEmbeddingsGoogle({
            apiKey,
            model: model || 'gemini-embedding-001',
            texts
        });
        return result?.embeddings || [];
    }

    if (!window.electronAPI?.generateEmbeddingsInfomaniak) {
        throw new Error('generateEmbeddingsInfomaniak IPC non disponibile (restart app richiesto?)');
    }
    const productId = appState.infomaniakProductId
        || document.getElementById('infomaniak-product-id')?.value
        || localStorage.getItem('infomaniak_product_id');
    if (!productId) throw new Error('Infomaniak product ID mancante');
    const result = await window.electronAPI.generateEmbeddingsInfomaniak({
        apiKey, productId,
        model: model || 'bge_multilingual_gemma2',
        texts
    });
    return result?.embeddings || [];
};

// cosineSimilarity estratto in mappai-math.js (caricato PRIMA di app.js).
window.cosineSimilarity = window.MappAIMath.cosineSimilarity;

window.executeSemanticDedup = async function (options = {}) {
    const { threshold = 0.85, maxMerges = 15 } = options;
    const report = { embeddingsRequested: 0, candidatesFound: 0, applied: 0, skipped: 0, errors: [] };

    const nodes = (appState.db.nodes || []).filter(n => n.level >= 2);
    if (nodes.length < 4) {
        console.log('[SemanticDedup] Mappa troppo piccola — skip');
        return report;
    }

    const texts = nodes.map(n => {
        const desc = (n.desc || n.content || '').replace(/\s+/g, ' ').slice(0, 100);
        return `${n.label}. ${desc}`.trim();
    });
    report.embeddingsRequested = texts.length;

    let embs;
    try {
        embs = await window.fetchEmbeddings(texts);
    } catch (e) {
        console.warn('[SemanticDedup] Fetch embeddings fallito:', e.message);
        report.errors.push(e.message);
        return report;
    }
    if (embs.length !== nodes.length) {
        console.warn(`[SemanticDedup] Mismatch: ${embs.length} embeddings vs ${nodes.length} nodi`);
        return report;
    }

    const getId = l => ({
        src: typeof l.source === 'object' ? l.source.id : l.source,
        tgt: typeof l.target === 'object' ? l.target.id : l.target
    });
    const parentOf = new Map();
    appState.db.links.forEach(l => {
        const { src, tgt } = getId(l);
        if (!parentOf.has(tgt)) parentOf.set(tgt, src);
    });
    const nodeMapById = new Map(appState.db.nodes.map(n => [n.id, n]));
    const l1Of = (nodeId) => {
        let cur = nodeId, hops = 0;
        while (cur && hops < 10) {
            const n = nodeMapById.get(cur);
            if (!n) return null;
            if (n.level === 1) return n.id;
            cur = parentOf.get(cur);
            hops++;
        }
        return null;
    };

    const candidates = [];
    for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
            const sim = window.cosineSimilarity(embs[i], embs[j]);
            if (sim < threshold) continue;
            const l1i = l1Of(nodes[i].id), l1j = l1Of(nodes[j].id);
            if (l1i && l1j && l1i === l1j) continue;
            candidates.push({ a: nodes[i], b: nodes[j], sim, l1a: l1i, l1b: l1j });
        }
    }
    candidates.sort((x, y) => y.sim - x.sim);
    report.candidatesFound = candidates.length;

    const consumed = new Set();
    for (const c of candidates.slice(0, maxMerges)) {
        if (consumed.has(c.a.id) || consumed.has(c.b.id)) { report.skipped++; continue; }
        let keep = c.a, drop = c.b;
        if (c.b.level < c.a.level) { keep = c.b; drop = c.a; }
        else if (c.b.level === c.a.level && c.b.label.length > c.a.label.length) { keep = c.b; drop = c.a; }
        try {
            window.executeMerge(drop, keep);
            consumed.add(drop.id);
            report.applied++;
            console.log(`%c[SemanticDedup] merge: "${drop.label}" → "${keep.label}" (sim=${c.sim.toFixed(3)})`, 'color:#10b981');
        } catch (e) {
            report.errors.push(e.message);
            report.skipped++;
        }
    }
    console.log('%c[SemanticDedup] Completato', 'color:#10b981;font-weight:bold', report);
    return report;
};

// ──────────────────────────────────────────────────────────────────────────
// FASE 5 — Riclassificazione semantica
// ──────────────────────────────────────────────────────────────────────────
//
// Dopo Phase 4, riguarda i nodi L2/L3 e propone spostamenti se sono finiti
// sotto una L1 sbagliata. Differenza con Phase 4:
//   - Phase 4 FONDE nodi (rimuove A, tiene B) e aggiunge cross-link
//   - Phase 5 SPOSTA il parent di un nodo (cambia l'L1 di appartenenza)
//
// Esempio reale dai run: "Minaccia invasione" appare sotto Neutralità Statale
// e Difesa Territoriale → Phase 5 sposta uno dei due sotto l'L1 corretta.
//
// Gated dal feature flag mappai_mm_phase5_enabled.

window.isPhase5Enabled = function () {
    try {
        return localStorage.getItem('mappai_mm_phase5_enabled') === '1'
            && appState?.extractionMode === 'mindmap';
    } catch (e) { return false; }
};

// Costruisce il prompt Fase 5. Per ogni nodo non-L0/L1 mostra il PATH
// gerarchico (es. "Svizzera > Difesa Territoriale > L2 > L3") + l'elenco
// degli L1 esistenti con il loro "ambito" (i loro figli diretti).
window.buildPhase5Prompt = function (nodes, links, l1NodesData) {
    const nodeMap = new Map(nodes.map(n => [n.id, n]));
    const getId = l => ({
        src: typeof l.source === 'object' ? l.source.id : l.source,
        tgt: typeof l.target === 'object' ? l.target.id : l.target
    });
    // parent diretto di ogni nodo (primo source nei link che lo puntano)
    const parentOf = new Map();
    for (const l of links) {
        const { src, tgt } = getId(l);
        if (!parentOf.has(tgt)) parentOf.set(tgt, src);
    }
    // L1 di appartenenza (risale finché non trova un L1)
    const l1Of = (nodeId) => {
        let cur = nodeId, hops = 0;
        while (cur && hops < 10) {
            const n = nodeMap.get(cur);
            if (!n) return null;
            if (n.level === 1) return n.id;
            cur = parentOf.get(cur);
            hops++;
        }
        return null;
    };

    // Costruisci catalogo L1 con AMBITO semantico (se disponibile) + figli diretti
    const l1Catalog = l1NodesData.map(l1 => {
        const directChildren = links
            .filter(l => getId(l).src === l1.id)
            .map(l => nodeMap.get(getId(l).tgt))
            .filter(n => n && n.level === 2)
            .map(n => `"${n.label}"`)
            .slice(0, 8);
        const ambitoPart = l1.ambito ? `\n    ambito: ${l1.ambito}` : '';
        return `- ${l1.id} "${l1.label}"${ambitoPart}\n    contiene: ${directChildren.join(', ') || '(nessun figlio L2)'}`;
    }).join('\n');

    // Lista compatta dei nodi candidati alla riclassificazione (L2 e L3)
    const candidates = nodes
        .filter(n => n.level === 2 || n.level === 3)
        .map(n => {
            const myL1 = l1Of(n.id);
            const l1Label = nodeMap.get(myL1)?.label || '?';
            return `- ${n.id} (L${n.level}) "${n.label}" — attualmente sotto L1 "${l1Label}" (${myL1})`;
        })
        .join('\n');

    return `Sei un VALIDATORE DI CLASSIFICAZIONE per Mappe Mentali su "${appState.rootNodeLabel}".
Ti viene mostrata la struttura della mappa: gli L1 esistenti (con il loro ambito) e i nodi L2/L3 con la loro attuale appartenenza.
Il tuo compito è IDENTIFICARE i nodi L2/L3 che sono finiti sotto la L1 SBAGLIATA e proporre uno spostamento.

⚠️ REGOLA PRIMARIA — DEFAULT: NESSUNA RICLASSIFICAZIONE
Nella maggioranza dei casi i nodi sono già nel posto giusto. Proponi uno spostamento SOLO se sei SICURO al 90%+ che il nodo appartenga più chiaramente a un'altra L1. In dubbio NON toccare.

L1 ESISTENTI (e i loro ambiti tematici, dedotti dai figli L2):
${l1Catalog}

NODI CANDIDATI ALLA VALUTAZIONE (L2 e L3):
${candidates}

CRITERI DI RICLASSIFICAZIONE:
- Un nodo va spostato SOLO se la sua appartenenza tematica all'L1 di destinazione è NETTAMENTE più appropriata di quella attuale.
- "Minaccia invasione" appartiene a "Difesa Territoriale" più che a "Neutralità Statale" (la minaccia è il presupposto della difesa, non della neutralità).
- "Razionamento" appartiene a "Economia di Guerra" più che a "Difesa Militare".
- NON spostare un nodo se l'L1 attuale è "altrettanto valida" come destinazione.
- NON spostare L1 (sono la base).
- Massimo 8 riclassificazioni per chiamata.

FORMATO OUTPUT — TASSATIVO:
JSONL sezionato, ogni operazione su una riga. Niente markdown, niente commenti.

===RECLASSIFY===
{"node_id":"ID_DEL_NODO","from":"L1_ATTUALE","to":"L1_DESTINAZIONE","reason":"motivazione breve"}
{"node_id":"X","from":"L1_2","to":"L1_4","reason":"appartiene tematicamente a..."}

Se non trovi nodi mal classificati, restituisci una sola riga:
===RECLASSIFY===
(e basta — nessuna operazione)`;
};

// Esegue Phase 5. Per ogni riclassificazione valida:
//   1. Rimuove il link parent_attuale → node
//   2. Aggiunge il link nuovo_L1 → node
//   3. Aggiorna il group del nodo (e propaga al sottoalbero se serve)
window.executePhase5Reclassification = async function () {
    const report = { applied: 0, skipped: 0, errors: [], parser: null };

    const apiKey = window.getSystemKey ? window.getSystemKey() : null;
    if (!apiKey) {
        console.warn('[Phase5] API key non disponibile — skip');
        return report;
    }

    const nodes = appState.db.nodes || [];
    const links = appState.db.links || [];
    const l1NodesData = nodes.filter(n => n.level === 1);
    if (l1NodesData.length < 2 || nodes.length < 8) {
        console.log('[Phase5] Mappa troppo piccola per riclassificazione — skip');
        return report;
    }

    const prompt = window.buildPhase5Prompt(nodes, links, l1NodesData);
    const payload = {
        contents: [{ parts: [{ text: prompt }] }],
        systemInstruction: { parts: [{ text: 'Sei un validatore di classificazione. Rispondi SOLO in JSONL sezionato come richiesto, default = nessuna riclassificazione.' }] },
        generationConfig: { temperature: 0.15, maxOutputTokens: window.getMaxOutputTokens(1500) }
    };

    let response;
    try {
        response = await window.fetchModelAPI(payload, apiKey);
    } catch (e) {
        console.warn('[Phase5] Chiamata AI fallita:', e.message);
        report.errors.push(e.message);
        return report;
    }

    const text = response?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    // Riutilizzo parseJSONLResponse esteso (riconosce sezioni custom):
    // estraggo manualmente la sezione RECLASSIFY perché non rientra in NODES/LINKS/MERGES/CROSSLINKS.
    const reclassifyOps = [];
    const cleaned = text.replace(/```jsonl?\s*/gi, '').replace(/```\s*/g, '').trim();
    const sectionMatch = /===\s*RECLASSIFY\s*===\s*\n([\s\S]*?)(?:\n===|\s*$)/i.exec(cleaned);
    if (sectionMatch) {
        for (const line of sectionMatch[1].split('\n')) {
            const s = line.trim();
            if (!s || s.startsWith('//')) continue;
            try {
                const obj = JSON.parse(s.replace(/,\s*$/, ''));
                if (obj && typeof obj.node_id === 'string' && typeof obj.to === 'string') {
                    reclassifyOps.push(obj);
                }
            } catch (e) { /* riga rotta, skip */ }
        }
    }
    report.parser = { found: reclassifyOps.length };

    if (reclassifyOps.length === 0) {
        console.log('%c[Phase5] Nessuna riclassificazione proposta — mappa già coerente', 'color:#10b981');
        return report;
    }

    // Indice nodi e helper
    const nodeById = new Map(nodes.map(n => [n.id, n]));
    const nodeByIdNorm = new Map(nodes.map(n => [String(n.id).toUpperCase(), n.id]));
    const getId = l => ({
        src: typeof l.source === 'object' ? l.source.id : l.source,
        tgt: typeof l.target === 'object' ? l.target.id : l.target
    });
    const resolveId = (raw) => nodeByIdNorm.get(String(raw || '').toUpperCase());

    // Helper: conta i figli L2 di un L1 (sottoalbero diretto)
    const countL2Children = (l1Id) => appState.db.links.filter(l => {
        const { src, tgt } = getId(l);
        if (src !== l1Id) return false;
        const tgtNode = nodeById.get(tgt);
        return tgtNode && tgtNode.level === 2;
    }).length;

    // Applica al massimo 8 riclassificazioni
    for (const op of reclassifyOps.slice(0, 8)) {
        try {
            const nodeId = resolveId(op.node_id);
            const toL1Id = resolveId(op.to);
            const node = nodeId ? nodeById.get(nodeId) : null;
            const toL1 = toL1Id ? nodeById.get(toL1Id) : null;
            if (!node || !toL1) {
                report.skipped++;
                report.errors.push(`ID non trovato: node=${op.node_id} to=${op.to}`);
                continue;
            }
            if (toL1.level !== 1) {
                report.skipped++;
                report.errors.push(`Destinazione non è un L1: ${toL1Id}`);
                continue;
            }
            if (node.level <= 1) {
                report.skipped++;
                report.errors.push(`Non sposto L0/L1: ${nodeId}`);
                continue;
            }

            // Safeguard: non svuotare il ramo di origine.
            // Se il nodo è L2 e il ramo sorgente ne ha ≤2, rifiuta lo spostamento
            // per evitare di lasciare rami completamente vuoti (come "Difesa Territoriale: 0 L2").
            if (node.level === 2 && op.from) {
                const fromL1Id = resolveId(op.from);
                if (fromL1Id) {
                    const childrenLeft = countL2Children(fromL1Id);
                    if (childrenLeft <= 2) {
                        report.skipped++;
                        report.errors.push(`Non svuoto L1 "${op.from}" (solo ${childrenLeft} L2 rimasti)`);
                        continue;
                    }
                }
            }

            // Rimuovi link parent attuale → node (solo i link gerarchici, non i cross-link)
            const beforeCount = appState.db.links.length;
            appState.db.links = appState.db.links.filter(l => {
                const { src, tgt } = getId(l);
                if (tgt !== nodeId) return true;
                // mantieni cross-link (isCross) e link da nodi non-L1 (gerarchia profonda)
                if (l.isCross) return true;
                const srcNode = nodeById.get(src);
                if (!srcNode) return true;
                if (srcNode.level !== 1) return true;
                // questo è il link L1_attuale → node, da rimuovere
                return false;
            });
            const removed = beforeCount - appState.db.links.length;

            // Aggiungi nuovo link L1_destinazione → node
            appState.db.links.push({
                source: toL1.id,
                target: node.id,
                rel: 'include',
                _phase5: true
            });

            // Aggiorna group del nodo (gli verrà ricalcolato il colore dal cluster)
            node.group = toL1.group;

            report.applied++;
        } catch (e) {
            report.errors.push(e.message);
            report.skipped++;
        }
    }

    console.log(
        '%c[Phase5] Riclassificazione completata',
        'color:#10b981;font-weight:bold',
        report
    );
    if (report.applied > 0) {
        console.log('   Operazioni applicate:', reclassifyOps.slice(0, report.applied)
            .map(o => `${o.node_id}: ${o.from} → ${o.to} (${o.reason})`));
    }
    return report;
};

// Arricchisce i nodi L1 con desc narrativa e confini espliciti tramite una
// micro-chiamata AI separata. Attivo solo se BranchBoundaries è ON e almeno
// un nodo ha ancora il desc placeholder (cioè il modello non l'ha generato da solo).
window.enrichL1Descs = async function (l1NodesData, rootNodeLabel, apiKey) {
    if (!window.isBranchBoundariesEnabled || !window.isBranchBoundariesEnabled()) return;
    const needsEnrich = l1NodesData.some(
        n => !n.confini || n.desc.startsWith('Categoria principale:')
    );
    if (!needsEnrich || !apiKey) return;

    window.showLoadingOverlay(true, 'Mappa HD - Arricchimento descrizioni rami L1...');

    const l1List = l1NodesData.map(n => {
        const ambitoPart = n.ambito ? ` (ambito: ${n.ambito})` : '';
        return `- "${n.label}"${ambitoPart}`;
    }).join('\n');

    const isIT = document.documentElement.lang !== 'en';
    const prompt = isIT
        ? `Hai una mappa mentale sul tema "${rootNodeLabel}" con queste macro-categorie di livello 1:\n\n${l1List}\n\nPer CIASCUNA categoria genera:\n- "desc": 40-60 parole narrative che spiegano COSA copre questa categoria, PERCHÉ esiste come categoria separata e QUALI concetti chiave contiene.\n- "confini": 1-2 frasi che indicano ESPLICITAMENTE cosa NON appartiene a questa categoria, con riferimento alle ALTRE categorie della lista.\n\nRestituisci SOLO un Array JSON: [{"label": "...", "desc": "...", "confini": "..."}]\nNessun commento o testo aggiuntivo.`
        : `You have a mind map on the topic "${rootNodeLabel}" with these level 1 macro-categories:\n\n${l1List}\n\nFor EACH category generate:\n- "desc": 40-60 word narrative explaining WHAT this category covers, WHY it exists as a separate category, and WHICH key concepts it contains.\n- "confini": 1-2 sentences explicitly stating what does NOT belong in this category, referencing the OTHER categories in the list.\n\nReturn ONLY a JSON Array: [{"label": "...", "desc": "...", "confini": "..."}]\nNo comments or additional text.`;

    const payload = {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
            temperature: 0.1,
            maxOutputTokens: window.getMaxOutputTokens ? window.getMaxOutputTokens(2048) : 2048
        }
    };

    try {
        const data = await window.fetchModelAPI(payload, apiKey);
        const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
        const cleanText = rawText.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
        const enriched = window.salvageTruncatedJSON(cleanText);
        if (!Array.isArray(enriched)) return;

        // Normalizzazione robusta: rimuove articoli iniziali, punteggiatura e
        // contenuto tra parentesi. Evita che un L1 resti col placeholder solo
        // perché il modello ha risposto con un label leggermente diverso
        // (es. "Commercio con l'Asse" vs "Commercio con l'Asse (Germania e Italia)").
        const normLbl = (s) => (s || '')
            .toLowerCase()
            .replace(/\([^)]*\)/g, ' ')                 // togli "(...)"
            .replace(/^(il|lo|la|i|gli|le|un|uno|una|l['']|dell['']|della|delle|dei|degli)\s+/i, '')
            .replace(/[^a-z0-9àèéìòù ]/gi, ' ')
            .replace(/\s+/g, ' ')
            .trim();

        const enrichedItems = enriched.filter(item => typeof item.label === 'string');
        const byExact = new Map(enrichedItems.map(item => [normLbl(item.label), item]));

        // Match fuzzy: esatto su label normalizzato, poi inclusione bidirezionale
        // (uno è prefisso/sottostringa dell'altro), che cattura le varianti con suffissi.
        const findItem = (node) => {
            const key = normLbl(node.label);
            if (byExact.has(key)) return byExact.get(key);
            return enrichedItems.find(item => {
                const ik = normLbl(item.label);
                return ik && key && (ik.includes(key) || key.includes(ik));
            }) || null;
        };

        let applied = 0, placeholdersLeft = 0;
        for (const node of l1NodesData) {
            const item = findItem(node);
            if (item) {
                if (typeof item.desc === 'string' && item.desc.trim()) node.desc = item.desc.trim();
                if (typeof item.confini === 'string' && item.confini.trim()) node.confini = item.confini.trim();
                node.aiDesc = node.desc;
                // I modali di studio ora leggono `desc || content` (desc = campo ricco),
                // quindi non serve più copiare desc su content: il modale mostra desc.
                applied++;
            }
            if (!node.desc || node.desc.startsWith('Categoria principale:')) placeholdersLeft++;
        }
        console.log(`[enrichL1Descs] ${applied}/${l1NodesData.length} nodi arricchiti` +
            (placeholdersLeft ? ` — ⚠️ ${placeholdersLeft} L1 ancora con desc placeholder` : ''));
    } catch (e) {
        console.warn('[enrichL1Descs] errore non bloccante:', e.message);
    }
};

// ──────────────────────────────────────────────────────────────────────────
// 3b — ARRICCHIMENTO DESC SOTTILI, ANCORATO ALLA FONTE (post-gen)
// ──────────────────────────────────────────────────────────────────────────
//
// I modali dei nodi sono lo strumento di studio principale per gli studenti
// BES/DSA → le desc devono essere ricche. Questo post-pass individua i nodi
// con desc sotto soglia (a QUALSIASI livello) e le riscrive in 50-80 parole
// FEDELI al documento sorgente (zero allucinazioni). Batched per contenere i
// token. Gated da `mappai_enrich_descs_enabled` (default OFF). Non bloccante.
window.isEnrichDescsEnabled = function () {
    try {
        return localStorage.getItem('mappai_enrich_descs_enabled') === '1'
            && (appState.extractionMode === 'mindmap' || !appState.extractionMode);
    } catch (e) { return false; }
};

// Conta le parole di una desc. Placeholder e vuoti contano 0 → sempre arricchiti.
window._descWordCount = function (s) {
    if (!s || typeof s !== 'string') return 0;
    if (s.startsWith('Categoria principale:')) return 0;
    return s.trim().split(/\s+/).filter(Boolean).length;
};

window.enrichThinDescs = async function (textParts, apiKey) {
    if (!window.isEnrichDescsEnabled || !window.isEnrichDescsEnabled()) return;
    if (!apiKey) return;

    const THRESHOLD = 35;       // parole minime perché una desc sia "ricca"
    const BATCH = 6;            // nodi per chiamata
    const SOURCE_CAP = 28000;   // caratteri di fonte per chiamata (~7k token)

    const nodes = appState.db.nodes || [];
    const links = appState.db.links || [];
    const idToNode = new Map(nodes.map(n => [n.id, n]));
    const linkId = (v) => (typeof v === 'object' && v) ? v.id : v;
    const parentNodeOf = (id) => {
        const link = links.find(l => linkId(l.target) === id && !l.isCross);
        return link ? (idToNode.get(linkId(link.source)) || null) : null;
    };

    const thin = nodes.filter(n => (n.level ?? 0) >= 1 && window._descWordCount(n.desc) < THRESHOLD);
    if (!thin.length) { console.log('[enrichThinDescs] nessuna desc sottile — skip'); return; }

    const source = (Array.isArray(textParts) ? textParts.join('\n\n') : String(textParts || '')).slice(0, SOURCE_CAP);
    if (!source.trim()) { console.warn('[enrichThinDescs] nessun testo fonte — skip'); return; }

    const isIT = document.documentElement.lang !== 'en';
    let applied = 0;
    window.showLoadingOverlay(true, isIT ? `Arricchimento descrizioni (${thin.length} nodi)...` : `Enriching descriptions (${thin.length} nodes)...`);

    for (let i = 0; i < thin.length; i += BATCH) {
        const batch = thin.slice(i, i + BATCH);
        const listStr = batch.map((n, idx) => {
            const p = parentNodeOf(n.id);
            const ctx = p ? ` (sotto la categoria "${window.cleanLabel(p.label)}")` : '';
            return `${idx + 1}. "${window.cleanLabel(n.label)}"${ctx}`;
        }).join('\n');

        const prompt = isIT
            ? `Sei un redattore didattico per studenti con DSA/BES. Basandoti ESCLUSIVAMENTE sul DOCUMENTO qui sotto, scrivi per ciascun concetto elencato una descrizione chiara di 50-80 parole, in frasi semplici, lineari e fedeli al documento. NON inventare fatti non presenti nel documento. Se il documento non contiene abbastanza informazioni su un concetto, scrivi una descrizione più breve ma corretta.\n\nDOCUMENTO:\n${source}\n\nCONCETTI DA DESCRIVERE:\n${listStr}\n\nRestituisci SOLO un array JSON: [{"n": 1, "desc": "..."}]. Il campo "n" è il numero del concetto. Nessun altro testo.`
            : `You are an educational editor for students with learning disabilities (SLD/SEN). Based EXCLUSIVELY on the DOCUMENT below, write for each listed concept a clear 50-80 word description, in simple linear sentences faithful to the document. Do NOT invent facts not present in the document. If the document lacks enough information on a concept, write a shorter but accurate description.\n\nDOCUMENT:\n${source}\n\nCONCEPTS TO DESCRIBE:\n${listStr}\n\nReturn ONLY a JSON array: [{"n": 1, "desc": "..."}]. The "n" field is the concept number. No other text.`;

        const payload = {
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
                temperature: 0.2,
                maxOutputTokens: window.getMaxOutputTokens ? window.getMaxOutputTokens(2048) : 2048
            }
        };

        try {
            const data = await window.fetchModelAPI(payload, apiKey);
            const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
            const cleanText = rawText.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
            const arr = window.salvageTruncatedJSON(cleanText);
            if (!Array.isArray(arr)) continue;
            for (const item of arr) {
                const idx = parseInt(item && item.n);
                if (isNaN(idx) || idx < 1 || idx > batch.length) continue;
                const node = batch[idx - 1];
                if (item.desc && typeof item.desc === 'string'
                    && window._descWordCount(item.desc) > window._descWordCount(node.desc)) {
                    node.desc = item.desc.trim();
                    node.aiDesc = node.desc;
                    applied++;
                }
            }
        } catch (e) {
            console.warn(`[enrichThinDescs] batch ${Math.floor(i / BATCH) + 1} fallito:`, e.message);
        }
    }

    window.showLoadingOverlay(false);
    console.log(`%c[enrichThinDescs] ${applied}/${thin.length} desc arricchite (soglia ${THRESHOLD} parole, ancorate alla fonte)`,
        'color:#10b981;font-weight:bold');
};

window.validateL1Categories = async function (l1Data, rootLabel) {
    if (!Array.isArray(l1Data) || l1Data.length < 3) return l1Data;
    const apiKey = window.getSystemKey ? window.getSystemKey() : null;
    if (!apiKey) return l1Data;

    const listStr = l1Data
        .map((c, i) => `${i + 1}. "${c.label}" (rel: ${c.rel || 'include'})`)
        .join('\n');

    const prompt = `Sei un VALIDATORE CONSERVATIVO di macro-categorie per Mappe Mentali su "${rootLabel}".

CATEGORIE DA VALIDARE:
${listStr}

⚠️ REGOLA PRIMARIA — DEFAULT: NESSUNA MODIFICA ⚠️
Nella stragrande maggioranza dei casi la lista è già buona e va restituita INVARIATA.
Modifica SOLO se identifichi con CERTEZZA uno dei due antipattern qui sotto.
In ogni dubbio, NON toccare.

ANTIPATTERN 1 — Sinonimi tra L1 (raro, solo se EVIDENTI)
Due o più L1 esprimono lo STESSO concetto con parole diverse. Devi essere SICURO al 100%.
Esempio CHIARO: ["Difesa Militare", "Sicurezza Difensiva", "Misure Difensive"] → tieni solo "Difesa Militare".
NON è sinonimia: ["Difesa Militare", "Economia Bellica"] (campi diversi anche se entrambi sul periodo bellico).
Azione: rimuovi i duplicati, tieni il label più chiaro e specifico.

ANTIPATTERN 2 — Meta-categorie fuori livello (più frequente, segnale chiaro)
Una L1 parla del COME si studia il tema invece che di un ASPETTO del tema.
Segnali tipici: contiene parole come "Indagine", "Memoria", "Revisione", "Storiografia", "Analisi", "Studio", "Ricerca".
Azione: sostituisci con un aspetto concreto del tema (es. "Indagine Storica" → "Controversie Storiche", "Memoria Storica" → "Eredità Postbellica").

❌ COSE CHE NON DEVI FARE (anche se ti sembra "migliorabile"):
- NON allargare perimetri con "X e Y": "Difesa" → "Difesa e Sicurezza" è SBAGLIATO se non c'era una L1 "Sicurezza" da fondere.
- NON rimuovere qualificatori disciplinari: "Neutralità Statale" → "Neutralità" è SBAGLIATO (perde specificità).
- NON riformulare per "stile": "Commercio Oro" → "Commercio e Oro" è inutile cosmesi.
- NON aggiungere/togliere categorie se non c'è un antipattern certo.
- NON modificare il "rel" se non strettamente necessario.

REGOLE STRUTTURALI:
- Numero finale: tra 3 e 6 (preferibilmente lo stesso del numero di input).
- Ogni "rel" è un verbo italiano breve, default "include".
- NIENTE date, nomi tra parentesi, congiunzioni "e" inutili nei label.

FORMATO OUTPUT — TASSATIVO:
Restituisci SOLO un array JSON, identico per struttura all'input. Niente markdown, niente commenti, niente testo prima o dopo:
[{"label":"Categoria 1","rel":"include"},{"label":"Categoria 2","rel":"comprende"}]

Se la lista era già perfetta, restituiscila identica. Questa è la risposta CORRETTA nella maggioranza dei casi.`;

    try {
        const payload = {
            contents: [{ parts: [{ text: prompt }] }],
            systemInstruction: { parts: [{ text: 'Sei un consulente di organizzazione concettuale. Rispondi SOLO con un array JSON, nessun testo extra.' }] },
            generationConfig: { temperature: 0.2, maxOutputTokens: window.getMaxOutputTokens(1500) }
        };
        const response = await window.fetchModelAPI(payload, apiKey);
        const text = response?.candidates?.[0]?.content?.parts?.[0]?.text || '';
        const cleanText = text.split(MARKER_JSON).join('').split(MARKER_END).join('').trim();
        let refined;
        try {
            refined = salvageTruncatedJSON(cleanText);
        } catch (parseErr) {
            console.warn('[Phase 1.5] Parse fallito, mantengo L1 originali:', parseErr.message);
            return l1Data;
        }

        // Validazione output
        if (!Array.isArray(refined)) {
            console.warn('[Phase 1.5] Output non è un array, mantengo L1 originali');
            return l1Data;
        }
        const valid = refined.filter(c =>
            c && typeof c === 'object'
            && typeof c.label === 'string' && c.label.trim()
        );
        if (valid.length < 3) {
            console.warn(`[Phase 1.5] Solo ${valid.length} categorie valide (servono ≥3), mantengo L1 originali`);
            return l1Data;
        }
        // Normalizza rel mancante
        valid.forEach(c => { if (!c.rel || typeof c.rel !== 'string') c.rel = 'include'; });

        const before = l1Data.map(x => x.label);
        const after = valid.map(x => x.label);
        const changed = before.length !== after.length
            || before.some((b, i) => b !== after[i]);

        // ── Guard anti-overcorrection ──
        // Se il Pass 1.5 ha modificato più del 50% dei label, è probabile che abbia
        // applicato il pattern "X → X e Y" o riformulazioni cosmetiche invece di
        // veri fix di sinonimi/meta-categorie. In quel caso rigettiamo l'output
        // e teniamo l'originale (fail-safe contro Mistral over-creative).
        const beforeSet = new Set(before.map(s => s.toLowerCase().trim()));
        const unchanged = after.filter(a => beforeSet.has(a.toLowerCase().trim())).length;
        const modifiedRatio = 1 - (unchanged / Math.max(before.length, after.length));
        if (modifiedRatio > 0.5) {
            console.warn(
                `%c[Phase 1.5] Rigettato output: troppo aggressivo (${Math.round(modifiedRatio * 100)}% label modificati)`,
                'color:orange;font-weight:bold'
            );
            console.log('   Proposto (scartato):', after);
            console.log('   Mantengo originale: ', before);
            return l1Data;
        }

        if (changed) {
            console.log(
                `%c[Phase 1.5] L1 raffinati: ${l1Data.length} → ${valid.length}`,
                'color:#10b981;font-weight:bold'
            );
            console.log('   Prima:', before);
            console.log('   Dopo: ', after);
        } else {
            console.log(`%c[Phase 1.5] L1 già coerenti, nessuna modifica`, 'color:#6366f1');
        }
        return valid;
    } catch (e) {
        console.warn('[Phase 1.5] Errore non bloccante:', e.message);
        return l1Data;
    }
};

// Rileva un label che unisce due concetti distinti tramite congiunzione o separatore.
// Conservativo: solo "e"/"ed"/"e/o"/"and" come parola separata, oppure "/" o "&".
window._isCompoundLabel = function (label) {
    if (!label || typeof label !== 'string') return false;
    const s = label.trim();
    if (/[\/&]/.test(s)) return true;
    if (/(^|\s)(ed|e\/o|e|and)(\s)/i.test(s)) return true;
    return false;
};

// Fase 1.6 — split deterministico+AI delle macro-categorie composte.
// Per ogni L1 composta fa una piccola chiamata AI (array JSON semplice, Apertus-safe)
// che ritorna 2 aree atomiche (con label/rel/ambito/desc/confini) oppure 1 sola se la
// nozione è inscindibile. Degrada in modo sicuro: se l'output non è valido, tiene l'L1
// originale. Rispetta il tetto massimo di macro-aree (MAX_L1 = 7).
window.splitCompoundL1s = async function (l1Data, rootLabel) {
    if (!Array.isArray(l1Data) || l1Data.length === 0) return l1Data;
    const MAX_L1 = 7;
    const compounds = l1Data.filter(c => c && window._isCompoundLabel(c.label));
    if (compounds.length === 0) {
        console.log('%c[Phase 1.6] Nessuna macro-area composta da spezzare', 'color:#6366f1');
        return l1Data;
    }
    const apiKey = window.getSystemKey ? window.getSystemKey() : null;
    if (!apiKey) return l1Data;

    let result = [...l1Data];
    for (const comp of compounds) {
        if (result.length >= MAX_L1) {
            console.warn(`[Phase 1.6] Tetto ${MAX_L1} raggiunto, salto split di "${comp.label}"`);
            break;
        }
        const otherLabels = result.filter(c => c !== comp).map(c => c.label);
        const prompt = `La macro-categoria "${comp.label}" di una mappa mentale su "${rootLabel}" sembra unire due concetti distinti tramite una congiunzione.
Se i due concetti sono SEPARABILI, spezzala in DUE macro-categorie atomiche e mono-concetto (una per concetto).
Se invece è una nozione realmente INSCINDIBILE (un'unica entità che perde senso se divisa), restituiscila INVARIATA come singolo elemento.

Altre macro-aree già presenti (NON duplicarle): ${otherLabels.join(', ') || '(nessuna)'}

Per ogni macro-categoria risultante fornisci:
- "label": titolo BREVE e mono-concetto (max 3-4 parole, niente congiunzioni)
- "rel": verbo o locuzione breve che la lega al tema "${rootLabel}" (1-3 parole)
- "ambito": 3-5 parole-chiave separate da virgola
- "desc": 40-60 parole su cosa copre e perché è una categoria a sé
- "confini": 1-2 frasi su cosa NON va in questo ramo

Restituisci SOLO un array JSON (1 oggetto se inscindibile, 2 se separabile). Niente markdown, niente commenti:
[{"label":"...","rel":"...","ambito":"...","desc":"...","confini":"..."}]`;
        try {
            const payload = {
                contents: [{ parts: [{ text: prompt }] }],
                systemInstruction: { parts: [{ text: 'Sei un consulente di organizzazione concettuale. Rispondi SOLO con un array JSON, nessun testo extra.' }] },
                // Phase 1.6 split: base 3000 → 6000 per gemini-2.5-flash.
                // Output atteso: 1-2 oggetti JSON L1 — non tronca mai.
                generationConfig: { temperature: 0.2, maxOutputTokens: window.getMaxOutputTokens(3000) }
            };
            const response = await window.fetchModelAPI(payload, apiKey);
            const text = response?.candidates?.[0]?.content?.parts?.[0]?.text || '';
            const cleanText = text.split(MARKER_JSON).join('').split(MARKER_END).join('').trim();
            let parts;
            try { parts = salvageTruncatedJSON(cleanText); } catch (e) { parts = null; }
            if (!Array.isArray(parts)) {
                console.warn(`[Phase 1.6] Output non valido per "${comp.label}", lo tengo intero`);
                continue;
            }
            const valid = parts.filter(c => c && typeof c === 'object' && typeof c.label === 'string' && c.label.trim());
            if (valid.length < 2) {
                console.log(`%c[Phase 1.6] "${comp.label}" giudicata inscindibile, invariata`, 'color:#6366f1');
                continue;
            }
            const replacement = valid.slice(0, 2);
            replacement.forEach(c => { if (!c.rel || typeof c.rel !== 'string') c.rel = comp.rel || 'include'; });
            const idx = result.indexOf(comp);
            if (idx === -1) continue;
            if (result.length - 1 + replacement.length > MAX_L1) {
                console.warn(`[Phase 1.6] Split di "${comp.label}" sforerebbe il tetto ${MAX_L1}, salto`);
                continue;
            }
            result.splice(idx, 1, ...replacement);
            console.log(`%c[Phase 1.6] "${comp.label}" → ${replacement.map(r => `"${r.label}"`).join(' + ')}`, 'color:#10b981;font-weight:bold');
        } catch (e) {
            console.warn(`[Phase 1.6] split "${comp.label}" non bloccante:`, e.message);
        }
    }
    return result;
};

window.isPhase4Enabled = function () {
    try {
        return localStorage.getItem('mappai_mm_phase4_enabled') === '1'
            && appState?.extractionMode === 'mindmap';
    } catch (e) { return false; }
};

// Costruisce il prompt Fase 4. Input compatto (solo id+label+desc breve)
// per minimizzare i token: il modello deve ragionare sulla struttura, non
// rileggere tutto il contenuto.
window.buildPhase4Prompt = function (nodes) {
    // Catalogo L1 con ambiti semantici (se disponibili dalla Fase 1)
    const l1List = nodes.filter(n => n.level === 1);
    const l1Catalog = l1List.length
        ? '\nMACRO-AREE L1 DELLA MAPPA (con i loro ambiti tematici):\n' +
          l1List.map(l1 => {
              const ambitoPart = l1.ambito ? ` — ambito: ${l1.ambito}` : '';
              return `- ${l1.id} "${l1.label}"${ambitoPart}`;
          }).join('\n') + '\n'
        : '';

    const compact = nodes
        .filter(n => n.level !== 0) // escludi root
        .map(n => {
            const desc = (n.desc || n.content || '').replace(/\s+/g, ' ').slice(0, 60);
            return `- ${n.id} (L${n.level ?? '?'}) "${n.label}" — ${desc}`;
        })
        .join('\n');

    return `SEI UN CONSOLIDATORE DI GRAFI CONCETTUALI per Mappe Mentali.
Ricevi l'elenco di tutti i nodi della mappa (generati in fasi precedenti ramo per ramo).
Devi produrre DUE risultati che migliorano la coerenza della mappa:

1. MERGES — CERCA ATTIVAMENTE DUPLICATI SEMANTICI CROSS-RAMO (priorità alta)
   I rami sono stati generati in isolamento: spesso lo stesso concetto compare in 2-3 rami
   con label leggermente diversi. Devi trovarli e fonderli.

   ESEMPI CONCRETI di duplicati da fondere SEMPRE:
   • "Oro Nazista" + "Oro controverso nazista" + "Oro tedesco" + "Oro saccheggiato" → STESSO concetto
   • "Politica Asilo" + "Politiche di Asilo" + "Politica dei Profughi" + "Restrizioni asilo" → fondere
   • "Dichiarazione Neutralità" + "Dichiarazione 1939" + "Neutralità Svizzera" (a livello L2/L3) → fondere
   • "Misure Difensive" + "Misure militari" + "Difesa militare" + "Difesa Frontiere" → fondere
   • "Minaccia Invasione" + "Minaccia tedesca" + "Pericolo Nazi" → fondere
   • "Commercio armi" + "Industria Armiera" + "Esportazioni belliche" → fondere

   REGOLA D'ORO: se due label condividono ≥1 parola-chiave centrale (oro, neutralità, difesa,
   profughi, commercio, asilo) E sono in rami diversi E descrivono lo stesso fenomeno,
   FONDILI. Non essere timido: 5-10 merge per mappa sono normali, non eccessivi.

   Per ogni merge indica:
   - "keep": ID del nodo CANONICO (preferisci quello con livello più alto se possibile,
     altrimenti l'etichetta più specifica e chiara)
   - "drop": ID del nodo da rimuovere
   - "reason": breve motivazione (es. "duplicato cross-ramo", "sinonimi")

2. CROSSLINKS — Aggiungi collegamenti TRA RAMI DIVERSI per esplicitare relazioni di:
   causa, prerequisito, conseguenza, contrasto, esempio-di. Solo tra nodi GIÀ esistenti
   nell'elenco (usa SOLO gli ID che trovi qui sotto). Non duplicare link che possono
   essere già impliciti nella gerarchia.

FORMATO DI OUTPUT — TASSATIVO ⚠️
Restituisci DUE sezioni JSONL, una riga JSON per oggetto, niente altro:

===MERGES===
{"keep":"ID_CANONICO","drop":"ID_DA_RIMUOVERE","reason":"duplicato cross-ramo"}
{"keep":"ID_X","drop":"ID_Y","reason":"sinonimi"}
===CROSSLINKS===
{"source":"ID_A","target":"ID_B","rel":"causa"}
{"source":"ID_C","target":"ID_D","rel":"prerequisito"}

REGOLE:
- Usa SOLO ID presenti nell'elenco sotto. Mai inventare nuovi ID.
- Massimo 20 merge per mappa (5-10 è normale, di più rischia overfit).
- Massimo 20 nuovi cross-link, scegli i più significativi pedagogicamente.
- Nessun commento, nessun markdown, nessun testo prima/dopo le sezioni.
- "rel" deve essere un verbo italiano SPECIFICO che esprima il TIPO reale di relazione:
  causa, richiede, precede, genera, si oppone a, è esempio di, dipende da, regola,
  finanzia, influenza, smaschera, condanna, contraddice, rafforza, giustifica,
  è condizione di, è conseguenza di, legittima, alimenta.
  REGOLA QUALITÀ: preferisci verbi precisi e critici (es. "smaschera", "condanna",
  "è condizione di") invece di generici come "influenza" o "collega".
  ⚠️ Usa SOLO ID presenti nell'elenco nodi qui sotto — non inventare ID.

${l1Catalog}
ELENCO NODI DELLA MAPPA (cerca le parole-chiave ricorrenti per identificare duplicati,
e confronta i label con gli AMBITI degli L1 sopra per individuare nodi mal classificati):
${compact}`;
};

// Esegue la Fase 4: chiama l'AI, parse, applica merge e cross-link.
// Restituisce un report con cosa è stato applicato e cosa scartato.
window.executePhase4Consolidation = async function () {
    const report = { merges: { applied: 0, skipped: 0, errors: [] },
                     crosslinks: { applied: 0, skipped: 0, errors: [] },
                     parser: null };

    const apiKey = window.getSystemKey ? window.getSystemKey() : null;
    if (!apiKey) {
        console.warn('[Phase4] API key non disponibile — skip');
        return report;
    }

    const nodes = appState.db.nodes || [];
    if (nodes.length < 6) {
        console.log('[Phase4] Mappa troppo piccola (<6 nodi) — skip');
        return report;
    }

    const prompt = window.buildPhase4Prompt(nodes);
    const payload = {
        contents: [{ parts: [{ text: prompt }] }],
        systemInstruction: { parts: [{ text: 'Sei un consolidatore semantico di grafi. Rispondi SOLO in JSONL come richiesto.' }] },
        // Phase 4 ha BISOGNO del thinking per fare merge di qualità:
        // con thinkingBudget:0 (budget ≤ 12288) genera merge aggressivi e non pensa
        // (run 9/6: 58 merge su 57 nodi → mappa collassata a 25).
        // Base 6500 → doubled = 13000 per gemini-2.5 → 13000 > soglia 12288
        // → thinking preservato automaticamente (consume ~3842 tok, output ~9158).
        generationConfig: { temperature: 0.2, maxOutputTokens: window.getMaxOutputTokens(6500) }
    };

    let response;
    try {
        response = await window.fetchModelAPI(payload, apiKey);
    } catch (e) {
        console.warn('[Phase4] Chiamata AI fallita:', e.message);
        report.parser = { error: e.message };
        return report;
    }

    const text = response?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const parsed = window.parseJSONLResponse(text);
    report.parser = parsed.meta;

    const validIds = new Set(nodes.map(n => n.id));
    const idByNorm = new Map();
    nodes.forEach(n => idByNorm.set(String(n.id).toUpperCase(), n.id));

    // ── Applica MERGES ──
    // Per ogni merge: valida ID, recupera oggetti nodo, chiama executeMerge(drop, keep)
    // (executeMerge(A, B) fonde A→B: A scompare, B sopravvive — quindi A=drop, B=keep)
    const consumedDrops = new Set();
    report._dropToKeep = new Map(); // drop_id → keep_id, per resolveId crosslinks
    for (const m of (parsed.merges || [])) {
        try {
            const keepId = idByNorm.get(String(m.keep || '').toUpperCase());
            const dropId = idByNorm.get(String(m.drop || '').toUpperCase());
            if (!keepId || !dropId) {
                report.merges.skipped++;
                report.merges.errors.push(`ID inesistente: keep=${m.keep} drop=${m.drop}`);
                continue;
            }
            if (keepId === dropId) { report.merges.skipped++; continue; }
            if (consumedDrops.has(dropId)) { report.merges.skipped++; continue; }
            const keepNode = appState.db.nodes.find(n => n.id === keepId);
            const dropNode = appState.db.nodes.find(n => n.id === dropId);
            if (!keepNode || !dropNode) { report.merges.skipped++; continue; }
            // Non fondere se uno dei due è il root
            if (keepNode.level === 0 || dropNode.level === 0) { report.merges.skipped++; continue; }
            window.executeMerge(dropNode, keepNode);
            consumedDrops.add(dropId);
            report._dropToKeep.set(dropId, keepId);
            report.merges.applied++;
        } catch (e) {
            report.merges.errors.push(e.message);
            report.merges.skipped++;
        }
    }

    // ── Applica CROSSLINKS ──
    // Validazione: ID esistenti dopo i merge, no self-loop, no duplicato di link esistente.
    const validIdsAfterMerge = new Set(appState.db.nodes.map(n => n.id));
    const existingLinks = new Set(
        appState.db.links.map(l => {
            const s = typeof l.source === 'object' ? l.source.id : l.source;
            const t = typeof l.target === 'object' ? l.target.id : l.target;
            return `${s}→${t}`;
        })
    );
    // dropToKeep traccia i merge REALMENTE applicati (non solo le proposte AI).
    // Più robusto di parsed.merges perché segue la chain effettiva post-executeMerge.
    const resolveId = (rawId) => {
        const norm = String(rawId || '').toUpperCase();
        let id = idByNorm.get(norm);
        if (!id) return null;
        // Segui la chain drop→keep finché il nodo esiste nel grafo post-merge
        let steps = 0;
        while (id && !validIdsAfterMerge.has(id) && steps < 10) {
            id = report._dropToKeep && report._dropToKeep.get(id);
            steps++;
        }
        return id && validIdsAfterMerge.has(id) ? id : null;
    };

    for (const cl of (parsed.crosslinks || [])) {
        const src = resolveId(cl.source);
        const tgt = resolveId(cl.target);
        if (!src || !tgt || src === tgt) { report.crosslinks.skipped++; continue; }
        const key = `${src}→${tgt}`, keyRev = `${tgt}→${src}`;
        if (existingLinks.has(key) || existingLinks.has(keyRev)) { report.crosslinks.skipped++; continue; }
        appState.db.links.push({
            source: src,
            target: tgt,
            rel: cl.rel || 'correlato a',
            isCross: true,
            _phase4: true
        });
        existingLinks.add(key);
        report.crosslinks.applied++;
    }

    const { _dropToKeep, ...reportLog } = report;
    console.log(
        '%c[Phase4] Consolidamento completato',
        'color:#10b981;font-weight:bold',
        JSON.stringify(reportLog)
    );
    return report;
};

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

    window.showToast(`Generazione completata! Token: ${tokens} | Costo: ${costText}`, "success");

    // Log for debugging
    console.log("--- Generation Report ---");
    console.log(`Model: ${modelId}`);
    console.log(`Tokens: ${tokens} (${appState.generationUsage.promptTokens} in, ${appState.generationUsage.candidateTokens} out)`);
    console.log(`Estimated Cost: ${costText}`);
};

/* ==========================================
   D3MAP.JS - Rendering D3.js
   ========================================== */

let simulation, svg, g, link, node, zoom;
let globalFontScale = 1.0;
let attractionEnabled = true;
let isPinned = true;

const colorScale = {
    0: "#0f172a",
    1: "#ef4444",
    2: "#f59e0b",
    3: "#10b981",
    4: "#0ea5e9",
    5: "#6366f1",
    6: "#d946ef",
    7: "#8b5cf6"
};

const radiusScale = { 0: 45, 1: 30, 2: 20, 3: 15, 4: 10, 5: 7 };

function getNodeRadius(d) {
    const maxDeg = Math.max(...appState.db.nodes.map(n => n.degree || 0), 1);
    const degRatio = (d.degree || 0) / maxDeg;

    if (appState.extractionMode !== 'mindmap') {
        // KG: L0 fisso, L1 e L2+ scalano con il degree
        if (d.level === 0) return 45;
        if (d.level === 1) return 28 + degRatio * 22;   // 28–50 px
        return 12 + degRatio * 18;                       // 12–30 px
    }
    // MM: base dal livello + bonus proporzionale al degree (max +50% del base)
    const base = radiusScale[d.level !== undefined ? Math.min(d.level, 5) : 1] || 15;
    return base + degRatio * (base * 0.5);
}

let forceDistMult = 1, forceChargeMult = 1;
let labelsHidden = false, pathfinderActive = false;
let linkingState = { active: false, sourceNode: null };
let pathfinderState = { active: false, source: null, target: null };

function initD3Visualization() {
    // Normalizza le label dei nodi in-place: rimuove decorazioni markdown
    // (+, **, virgolette, troncamenti) iniettate da alcuni modelli. Idempotente:
    // sistema sia la visualizzazione sia l'export vault (che legge appState.db.nodes).
    if (appState.db && Array.isArray(appState.db.nodes)) {
        appState.db.nodes.forEach(n => {
            if (n.label) {
                const cleaned = cleanLabel(n.label);
                if (cleaned) n.label = cleaned;
            }
        });
    }

    const container = document.getElementById("d3-container");
    container.innerHTML = "";

    let width = container.clientWidth || window.innerWidth * 0.75;
    let height = container.clientHeight || window.innerHeight;

    svg = d3.select("#d3-container")
        .append("svg")
        .attr("id", "map-svg")
        .attr("width", "100%")
        .attr("height", "100%")
        .attr("viewBox", [-width / 2, -height / 2, width, height])
        .on("click", handleBackgroundClick)
        .on("contextmenu", (e) => window.showContextMenu(e, 'bg', null))
        .on("touchstart", (e) => handleTouchStart(e, 'bg', null))
        .on("touchend", handleTouchEnd)
        .on("touchmove", handleTouchMove);

    const defs = svg.append("defs");
    // Marker arrowhead default (grigio)
    defs.append("marker")
        .attr("id", "arrowhead").attr("viewBox", "0 -5 10 10").attr("refX", 10).attr("refY", 0)
        .attr("markerWidth", 6).attr("markerHeight", 6).attr("orient", "auto")
        .append("path").attr("d", "M0,-5L10,0L0,5").attr("fill", "#94a3b8");
    // Marker arrowhead invertito default (per link bidirezionali — marker-start)
    defs.append("marker")
        .attr("id", "arrowhead-rev").attr("viewBox", "0 -5 10 10").attr("refX", 10).attr("refY", 0)
        .attr("markerWidth", 6).attr("markerHeight", 6).attr("orient", "auto-start-reverse")
        .append("path").attr("d", "M0,-5L10,0L0,5").attr("fill", "#94a3b8");
    // Un marker per ogni famiglia di relazione (usato dalla lente)
    if (typeof EDGE_FAMILIES === 'object') {
        Object.entries(EDGE_FAMILIES).forEach(([key, fam]) => {
            defs.append("marker")
                .attr("id", `arrowhead-${key}`).attr("viewBox", "0 -5 10 10")
                .attr("refX", 10).attr("refY", 0).attr("markerWidth", 6).attr("markerHeight", 6).attr("orient", "auto")
                .append("path").attr("d", "M0,-5L10,0L0,5").attr("fill", fam.color);
            // Versione invertita per marker-start (link bidirezionali colorati)
            defs.append("marker")
                .attr("id", `arrowhead-rev-${key}`).attr("viewBox", "0 -5 10 10")
                .attr("refX", 10).attr("refY", 0).attr("markerWidth", 6).attr("markerHeight", 6)
                .attr("orient", "auto-start-reverse")
                .append("path").attr("d", "M0,-5L10,0L0,5").attr("fill", fam.color);
        });
    }

    g = svg.append("g");

    zoom = d3.zoom()
        .scaleExtent([0.1, 5])
        .on("zoom", (event) => {
            g.attr("transform", event.transform);
            // Raddoppiato lo spessore dell'outline bianca dei testi (richiesta utente)
            const k = event.transform.k;
            const strokeW = Math.max(1.2, (2.4 / k));
            g.selectAll(".node-text").style("stroke-width", strokeW + "px");
            if (window.applyDeepNodeDim) window.applyDeepNodeDim(k);
        });
    svg.call(zoom);

    window.updateDegreeStats();
    renderGraph();
    window.renderTreeView();

    if (isPinned && simulation && !simulation.alpha()) {
        setTimeout(() => window.applyPinning(true), 1500);
    }
}

function renderGraph() {
    if (!g) return; // SVG non ancora inizializzato (es. Phase4 che gira prima di initD3Visualization)
    if (window.renderStudySets) window.renderStudySets();
    const nodes = appState.db.nodes;
    // Guard: scarta i link orfani (endpoint senza nodo corrispondente). Un solo link
    // rotto fa lanciare d3-force ("node not found: <id>") e svuota TUTTO il canvas.
    // Mutiamo in-place così la corruzione non viene salvata nel vault.
    if (Array.isArray(appState.db.links)) {
        const _nodeIds = new Set(nodes.map(n => n.id));
        const _eid = x => (x && typeof x === 'object') ? x.id : x;
        const _before = appState.db.links.length;
        appState.db.links = appState.db.links.filter(l => _nodeIds.has(_eid(l.source)) && _nodeIds.has(_eid(l.target)));
        const _dropped = _before - appState.db.links.length;
        if (_dropped > 0) console.warn(`[MappAI] Scartati ${_dropped} link orfani (endpoint mancante) prima del render D3.`);
    }
    const links = appState.db.links;

    // 1. Identify existing group IDs to avoid collisions
    const usedGroups = new Set();
    nodes.forEach(n => {
        if (n.group !== undefined && n.group !== null) usedGroups.add(n.group);
    });

    // 2. Assign unique, persistent group IDs to Level 1 nodes (Macroareas)
    let nextGroup = 1;
    nodes.filter(n => n.level === 1).forEach(n => {
        if (n.group === undefined || n.group === null) {
            while (usedGroups.has(nextGroup)) nextGroup++;
            n.group = nextGroup;
            usedGroups.add(nextGroup);
        }
    });

    function getParentGroup(nodeId) {
        const isKG = appState.extractionMode === 'kg';

        if (isKG) {
            // KG: cerca qualsiasi Hub L1 collegato (in qualsiasi direzione, BFS)
            const visited = new Set();
            const queue = [nodeId];
            visited.add(nodeId);
            while (queue.length > 0) {
                const cur = queue.shift();
                const curNode = nodes.find(x => x.id === cur);
                if (curNode && curNode.level === 1) return curNode.group;

                links.forEach(l => {
                    const sId = typeof l.source === 'object' ? l.source.id : l.source;
                    const tId = typeof l.target === 'object' ? l.target.id : l.target;
                    if (sId === cur && !visited.has(tId)) { visited.add(tId); queue.push(tId); }
                    if (tId === cur && !visited.has(sId)) { visited.add(sId); queue.push(sId); }
                });
                if (visited.size > 50) break; // Sicurezza anti-loop
            }
            return 1; // Default se nessun Hub trovato
        }

        // Mind Map: risali la catena gerarchica (comportamento originale)
        let currentId = nodeId;
        let safeCounter = 0;
        while (safeCounter < 100) {
            safeCounter++;
            let n = nodes.find(x => x.id === currentId);
            if (!n) return 1;
            if (n.level === 1) return n.group;
            if (n.level === 0) return 1;

            let l = links.find(link => {
                let targetId = typeof link.target === 'object' ? link.target.id : link.target;
                return targetId === currentId && !link.isCross;
            });
            if (!l) return 1;
            currentId = typeof l.source === 'object' ? l.source.id : l.source;
        }
        return 1;
    }

    nodes.filter(n => n.level >= 2).forEach(n => {
        n.group = getParentGroup(n.id);
    });

    // Calcolo del peso dei nodi (Strategia 3)
    nodes.forEach(n => {
        n.weight = links.filter(l => {
            let sId = typeof l.source === 'object' ? l.source.id : l.source;
            let tId = typeof l.target === 'object' ? l.target.id : l.target;
            return sId === n.id || tId === n.id;
        }).length;
    });

    const isKG = appState.extractionMode === 'kg';

    // ── Approccio 1: Pre-posizionamento nodi prima della simulazione ──────────
    // Solo al primo render (nodi senza x/y). Dà alla simulazione un punto di
    // partenza strutturato invece di posizioni casuali.
    if (nodes.every(n => n.x === undefined)) {
        if (isKG) {
            // KG: hub in cerchio, nodi L2 distribuiti attorno al loro hub primario
            const hubs = nodes.filter(n => n.level === 1);
            const hubRadius = Math.max(220, hubs.length * 65);
            hubs.forEach((hub, i) => {
                const angle = (i / hubs.length) * 2 * Math.PI - Math.PI / 2;
                hub.x = Math.cos(angle) * hubRadius;
                hub.y = Math.sin(angle) * hubRadius;
            });
            const hubByGroup = {};
            hubs.forEach(h => { hubByGroup[h.group] = h; });
            nodes.filter(n => n.level >= 2).forEach(n => {
                const hub = hubByGroup[n.group];
                const angle = Math.random() * 2 * Math.PI;
                const r = 130 + Math.random() * 90;
                n.x = hub ? hub.x + Math.cos(angle) * r : (Math.random() - 0.5) * 400;
                n.y = hub ? hub.y + Math.sin(angle) * r : (Math.random() - 0.5) * 400;
            });
        } else {
            // MM: layout gerarchico radiale — root al centro, ogni livello su
            // cerchi concentrici, ogni ramo occupa un settore angolare proporzionale.
            const root = nodes.find(n => n.level === 0);
            if (root) { root.x = 0; root.y = 0; }
            const l1Nodes = nodes.filter(n => n.level === 1);
            const numL1 = l1Nodes.length || 1;
            const mmRadii = [0, 280, 460, 630, 780, 920];
            const sectors = {};

            // Mappa parent: target → source (solo link non-cross)
            const mmParentMap = {};
            links.forEach(l => {
                if (l.isCross) return;
                const src = typeof l.source === 'object' ? l.source.id : l.source;
                const tgt = typeof l.target === 'object' ? l.target.id : l.target;
                if (!mmParentMap[tgt]) mmParentMap[tgt] = src;
            });

            // Posiziona L1 sul primo cerchio e assegna loro un settore angolare
            l1Nodes.forEach((n, i) => {
                const minA = (i / numL1) * 2 * Math.PI;
                const maxA = ((i + 1) / numL1) * 2 * Math.PI;
                const mid = (minA + maxA) / 2 - Math.PI / 2;
                n.x = Math.cos(mid) * mmRadii[1];
                n.y = Math.sin(mid) * mmRadii[1];
                sectors[n.id] = { min: minA, max: maxA };
            });

            // Ricorsione: piazza i figli nel settore del genitore al livello successivo
            function placeMMChildren(parentId, level) {
                if (level > 5) return;
                const children = nodes.filter(n => mmParentMap[n.id] === parentId);
                if (!children.length) return;
                const pSec = sectors[parentId] || { min: 0, max: 2 * Math.PI };
                const span = pSec.max - pSec.min;
                const r = mmRadii[level] || (280 + level * 150);
                children.forEach((child, ci) => {
                    const cMin = pSec.min + (ci / children.length) * span;
                    const cMax = pSec.min + ((ci + 1) / children.length) * span;
                    child.x = Math.cos((cMin + cMax) / 2 - Math.PI / 2) * r;
                    child.y = Math.sin((cMin + cMax) / 2 - Math.PI / 2) * r;
                    sectors[child.id] = { min: cMin, max: cMax };
                    placeMMChildren(child.id, level + 1);
                });
            }
            l1Nodes.forEach(n => placeMMChildren(n.id, 2));
            if (root) placeMMChildren(root.id, 1);
        }
    }

    if (!simulation) {
        simulation = d3.forceSimulation(nodes)
            .force("link", d3.forceLink(links).id(d => d.id).distance(d => {
                let baseDist = (d.source.level === 0) ? 200 : 140;
                if (isKG) baseDist = 200;
                return baseDist * forceDistMult;
            }))
            .force("collide", d3.forceCollide().radius(d => {
                let extraPadding = 50 + (d.weight * 5);
                if (extraPadding > 150) extraPadding = 150;
                return getNodeRadius(d) + extraPadding;
            }).iterations(3))
            .force("charge", d3.forceManyBody().strength(d => {
                let baseCharge = (d.level === 0 ? -1500 : -500);
                if (isKG && d.level === 1) baseCharge = -1000;
                return (baseCharge - (d.weight * 50)) * forceChargeMult;
            }))
            .force("center", d3.forceCenter(0, 0))
            .force("radial", d3.forceRadial(d => {
                if (isKG) {
                    return d.level === 1 ? 250 : 550;
                } else {
                    if (d.level === 0) return 0;
                    if (d.level === 1) return 300;
                    if (d.level === 2) return 500;
                    return 700;
                }
            }, 0, 0).strength(isKG ? 0.3 : 0.15)); // MM: forza radiale ridotta, il layout è già strutturato

        // ── Approccio 2 (KG): force cluster — attrae L2 verso il loro hub primario
        if (isKG) {
            simulation.force("cluster", alpha => {
                const hubByGroup = {};
                appState.db.nodes.filter(n => n.level === 1).forEach(h => { hubByGroup[h.group] = h; });
                appState.db.nodes.forEach(n => {
                    if (n.level < 2 || (n.fx !== undefined && n.fx !== null)) return;
                    const hub = hubByGroup[n.group];
                    if (!hub) return;
                    n.vx += (hub.x - n.x) * alpha * 0.12;
                    n.vy += (hub.y - n.y) * alpha * 0.12;
                });
            });
        }

        // Raffreddamento statico invisibile
        simulation.stop();
        simulation.tick(300);

        simulation.on("tick", tick);
        if (appState.layoutMode !== 'default') window.applyLayoutForces();
    } else {
        simulation.nodes(nodes);
        simulation.force("link").links(links).distance(d => {
            let baseDist = (d.source.level === 0) ? 200 : 140;
            if (isKG) baseDist = 200;
            return baseDist * forceDistMult;
        });
        simulation.force("collide").radius(d => {
            let extraPadding = 50 + (d.weight * 5);
            if (extraPadding > 150) extraPadding = 150;
            return getNodeRadius(d) + extraPadding;
        });
        simulation.force("charge").strength(d => {
            let baseCharge = (d.level === 0 ? -1500 : -500);
            if (isKG && d.level === 1) baseCharge = -1000;
            return (baseCharge - (d.weight * 50)) * forceChargeMult;
        });

        // Aggiorna/rimuovi cluster force in base alla modalità corrente
        if (isKG) {
            simulation.force("cluster", alpha => {
                const hubByGroup = {};
                appState.db.nodes.filter(n => n.level === 1).forEach(h => { hubByGroup[h.group] = h; });
                appState.db.nodes.forEach(n => {
                    if (n.level < 2 || n.fx !== undefined && n.fx !== null) return;
                    const hub = hubByGroup[n.group];
                    if (!hub) return;
                    n.vx += (hub.x - n.x) * alpha * 0.12;
                    n.vy += (hub.y - n.y) * alpha * 0.12;
                });
            });
        } else {
            simulation.force("cluster", null);
        }

        // Raffreddamento statico invisibile
        simulation.stop();
        simulation.tick(300);

        if (appState.layoutMode !== 'default') window.applyLayoutForces();
        simulation.alpha(0.3).restart();
    }

    const linkSelection = g.selectAll(".link-group").data(links, d => `${d.source.id || d.source}-${d.target.id || d.target}-${d.rel}`);
    const linkEnter = linkSelection.enter().append("g").attr("class", "link-group")
        .style("opacity", 0) // Cascading animation start

        .on("contextmenu", (e, d) => window.showContextMenu(e, 'link', d))
        .on("touchstart", (e, d) => handleTouchStart(e, 'link', d))
        .on("touchend", handleTouchEnd)
        .on("touchmove", handleTouchMove);

    linkEnter.append("path").attr("class", "link").attr("fill", "none").attr("stroke", "#94a3b8").attr("stroke-width", 1.5).attr("marker-end", "url(#arrowhead)");
    linkEnter.append("text").attr("class", "link-label").attr("text-anchor", "middle").attr("dy", -4).text(d => d.rel);

    const linkMerge = linkEnter.merge(linkSelection);
    linkMerge.select("text.link-label")
        .text(d => d.rel)
        .style("font-size", (8 * globalFontScale * 0.765) + "px");
    linkMerge.classed("ai-suggested", d => d.aiSuggested === true);
    // Marker-start per link bidirezionali
    linkMerge.select('.link')
        .attr('marker-start', d => d.bidirectional ? 'url(#arrowhead-rev)' : null);
    linkSelection.exit().remove();

    // ── Stile KG per ruolo strutturale + bridge marking (1-hop) ─────────────
    // Vedi public/js/mappai-node-styling.js. Annota _role, _bridgeInfo,
    // _opacity, _strokeW su ogni nodo per ridurre la dispersione visiva.
    if (appState.extractionMode === 'kg') {
        const groupColors = {};
        nodes.filter(n => n.level === 1).forEach(h => {
            groupColors[h.group] = (appState.db.customColors && appState.db.customColors[h.group])
                ? appState.db.customColors[h.group]
                : (colorScale[h.group] || colorScale[1] || "#ef4444");
        });
        if (appState.db.customColors && appState.db.customColors[0] !== undefined) {
            groupColors[0] = appState.db.customColors[0];
        } else if (colorScale[0]) {
            groupColors[0] = colorScale[0];
        }

        if (window.MappAINodeStyling) {
            window.MappAINodeStyling.annotate(nodes, links, groupColors);
        }

        // Compat: alcuni punti del codice leggono hubColors/hubWeights.
        // Manteniamo le chiavi vuote per i nodi che non avranno segmenti hub-based.
        nodes.forEach(n => {
            if (n._bridgeInfo && n._bridgeInfo.segments) {
                n.hubColors = n._bridgeInfo.segments.map(s => s.color);
                n.hubWeights = {};
                n._bridgeInfo.segments.forEach(s => { n.hubWeights[s.color] = s.fraction; });
            } else {
                n.hubColors = [];
                n.hubWeights = {};
            }
        });
    }

    const nodeSelection = g.selectAll(".node-group").data(nodes, d => d.id);
    const nodeEnter = nodeSelection.enter().append("g").attr("class", "node-group")
        .style("opacity", 0) // Cascading animation start
        .call(drag(simulation))
        .on("click", window.handleNodeClick)
        .on("dblclick", (e, d) => { e.stopPropagation(); window.openEditModal(d); })
        .on("contextmenu", (e, d) => { e.preventDefault(); e.stopPropagation(); window.showContextMenu(e, 'node', d); });

    // Hitbox invisibile: aumenta la zona cliccabile attorno al nodo
    // (utile per nodi piccoli, es. PATH su KG L2+)
    nodeEnter.append("circle")
        .attr("class", "node-hitbox")
        .attr("fill", "transparent")
        .attr("stroke", "none");

    nodeEnter.append("circle").attr("class", "node-circle");

    // Contenitore per gli archi segmentati (solo KG)
    nodeEnter.append("g").attr("class", "node-segments");

    nodeEnter.append("text").attr("class", "node-text")
        .attr("text-anchor", "middle")
        .attr("fill", "#0f172a")
        .style("font-size", d => {
            let baseSize = 8;
            if (d.level === 0) baseSize = 14;
            else if (d.level === 1) baseSize = 12;
            else if (d.level === 2) baseSize = 10;
            else if (d.level === 3) baseSize = 9;
            else if (d.level >= 5) baseSize = 8 * Math.pow(0.93, d.level - 5);
            return (baseSize * globalFontScale) + "px";
        });

    // Placeholder per compatibilità con il select("g.node-date-badge") nel merge — sempre nascosto.
    nodeEnter.append("g").attr("class", "node-date-badge").style("display", "none");

    nodeEnter.append("foreignObject")
        .attr("class", "node-icons-fo pointer-events-none")
        .attr("pointer-events", "none") // attributo SVG: bulletproof, non dipende da Tailwind CDN
        .attr("width", 100)
        .attr("height", 20)
        .attr("x", -50)
        .attr("y", 0);

    const nodeMerge = nodeEnter.merge(nodeSelection);

    // Hitbox: raggio +10px rispetto al cerchio visibile (più tolleranza al click)
    nodeMerge.select("circle.node-hitbox")
        .attr("r", d => getNodeRadius(d) + 10);

    nodeMerge.select("circle.node-circle")
        .attr("r", d => getNodeRadius(d))
        .attr("fill", d => {
            if (appState.extractionMode === 'kg' && d.level > 1) return "#e2e8f0"; // Grigio Slate-200 per KG (migliore visibilità)
            let baseColor;
            if (d.level === 0) {
                baseColor = (appState.db.customColors && appState.db.customColors[0])
                    ? appState.db.customColors[0]
                    : colorScale[0];
                return baseColor;
            }
            baseColor = (appState.db.customColors && appState.db.customColors[d.group])
                ? appState.db.customColors[d.group]
                : (colorScale[d.group] || colorScale[1]);
            let hsl = d3.hsl(baseColor);
            hsl.l = Math.min(0.95, hsl.l + (d.level - 1) * 0.08);
            return hsl.toString();
        })
        .attr("stroke", d => {
            if (appState.extractionMode === 'kg') {
                if (d.level === 1) return "none"; // Super Hub senza outline
                if (d.level > 1) return "none"; // Gestito dai segmenti
            }
            if (d.studyStatus === 'done') return '#22c55e';
            if (d.studyStatus === 'review') return '#f59e0b';
            if (d.studyStatus === 'todo') return '#ef4444';

            let baseColor;
            if (d.level === 0) {
                return (appState.db.customColors && appState.db.customColors[0])
                    ? appState.db.customColors[0]
                    : colorScale[0];
            }
            return (appState.db.customColors && appState.db.customColors[d.group])
                ? appState.db.customColors[d.group]
                : (colorScale[d.group] || colorScale[d.level !== undefined ? d.level : 1] || "#333");
        })
        .attr("stroke-width", d => {
            if (appState.extractionMode === 'kg') return 0; // Tutto gestito via fill o segmenti
            if (d.studyStatus && d.studyStatus !== 'none') return d.level === 0 ? 6 : 4;
            return 2; // Outline base visibile
        });

    // Gestione anello colorato KG (bridge marking + role-based thickness)
    nodeMerge.select(".node-segments").each(function (d) {
        const container = d3.select(this);
        container.selectAll("*").remove();

        if (appState.extractionMode === 'kg' && d.level > 1) {
            const r = getNodeRadius(d);
            const strokeW = (d._strokeW !== undefined) ? d._strokeW : 3;
            const segs = window.MappAINodeStyling
                ? window.MappAINodeStyling.getRingSegments(d)
                : null;

            if (segs && segs.length) {
                let cumAngle = 0;
                segs.forEach(s => {
                    const arc = d3.arc()
                        .innerRadius(r)
                        .outerRadius(r + strokeW)
                        .startAngle(cumAngle)
                        .endAngle(cumAngle + s.fraction * 2 * Math.PI);
                    container.append("path").attr("d", arc).attr("fill", s.color);
                    cumAngle += s.fraction * 2 * Math.PI;
                });
            } else {
                container.append("circle")
                    .attr("r", r + 1.5)
                    .attr("fill", "none")
                    .attr("stroke", "#cbd5e1")
                    .attr("stroke-width", 2);
            }
        }
    });

    // Helper word-wrap condiviso tra text e badge
    const wrapLabel = (s, maxPerLine, maxLines) => {
        if (!s || s.length <= maxPerLine) return [s || ''];
        const words = s.split(/\s+/);
        const out = [];
        let cur = '';
        words.forEach(w => {
            if (!cur) { cur = w; }
            else if ((cur + ' ' + w).length <= maxPerLine) { cur += ' ' + w; }
            else { out.push(cur); cur = w; }
        });
        if (cur) out.push(cur);
        if (out.length > maxLines) {
            const head = out.slice(0, maxLines - 1);
            head.push(out.slice(maxLines - 1).join(' '));
            return head;
        }
        return out;
    };

    nodeMerge.select("text.node-text")
        .style("font-size", d => {
            let baseSize = 8;
            if (d.level === 0) baseSize = 14;
            else if (d.level === 1) baseSize = 12;
            else if (d.level === 2) baseSize = 10;
            else if (d.level === 3) baseSize = 9;
            else if (d.level >= 5) baseSize = 8 * Math.pow(0.93, d.level - 5);
            return (baseSize * globalFontScale) + "px";
        });

    nodeMerge.select("text.node-text")
        .each(function (d) {
            const textEl = d3.select(this);
            const labelStr = cleanLabel(d.label);
            const dateParsed = extractDateFromLabel(labelStr);
            const nameStr = dateParsed ? dateParsed.name : labelStr;

            let lines;
            if (nameStr.indexOf('\n') !== -1) {
                lines = getLabelLines(nameStr);
            } else if (d.level >= 4) {
                lines = wrapLabel(nameStr, 16, 3);
            } else if (d.level === 3) {
                lines = wrapLabel(nameStr, 20, 3);
            } else {
                lines = wrapLabel(nameStr, 24, 3);
            }

            const vis = d.iconVisibility || { text: true, image: true, link: true };
            const hasIcons = (d.hasCustomText && vis.text) || (vis.image && d.images?.length > 0) || (vis.link && (d.urls?.length > 0 || d.url));

            const DATE_GAP = 1.5;  // interlinea data→nome, leggermente maggiore del wrap
            const LINE_GAP = 1.1;  // interlinea tra righe del nome (word-wrap)

            textEl.text('');

            if (dateParsed) {
                // Centra il blocco [DATA + righe nome] nel cerchio
                const totalSpan = DATE_GAP + (lines.length - 1) * LINE_GAP;
                let firstDy = 0.35 - totalSpan / 2;
                if (hasIcons) firstDy -= 0.6;

                textEl.append('tspan').attr('x', 0).attr('dy', `${firstDy}em`).text(dateParsed.date);
                lines.forEach((line, i) => {
                    textEl.append('tspan')
                        .attr('x', 0)
                        .attr('dy', i === 0 ? `${DATE_GAP}em` : `${LINE_GAP}em`)
                        .text(line);
                });
            } else {
                let firstDy = 0.35 - ((lines.length - 1) * 0.55);
                if (hasIcons) firstDy -= 0.6;
                lines.forEach((line, i) => {
                    textEl.append('tspan')
                        .attr('x', 0)
                        .attr('dy', i === 0 ? `${firstDy}em` : `${LINE_GAP}em`)
                        .text(line);
                });
            }
        });

    // Il date-badge separato non è più usato: la data è nel tspan sopra.
    nodeMerge.select("g.node-date-badge").style("display", "none");

    nodeMerge.select("foreignObject.node-icons-fo")
        .attr("pointer-events", "none") // applica su tutti i nodi (enter + merge)
        // Dimensione conditional: se non ha icone, riduco a 1×1 per non bloccare i click
        .attr("width", d => {
            const vis = d.iconVisibility || { text: true, image: true, link: true };
            const hasIcons = (d.hasCustomText && vis.text) || (vis.image && d.images?.length > 0) || (vis.link && (d.urls?.length > 0 || d.url));
            return hasIcons ? 100 : 1;
        })
        .attr("height", d => {
            const vis = d.iconVisibility || { text: true, image: true, link: true };
            const hasIcons = (d.hasCustomText && vis.text) || (vis.image && d.images?.length > 0) || (vis.link && (d.urls?.length > 0 || d.url));
            return hasIcons ? 20 : 1;
        })
        .attr("x", d => {
            const vis = d.iconVisibility || { text: true, image: true, link: true };
            const hasIcons = (d.hasCustomText && vis.text) || (vis.image && d.images?.length > 0) || (vis.link && (d.urls?.length > 0 || d.url));
            return hasIcons ? -50 : 0;
        })
        .attr("y", d => {
            const labelStr = cleanLabel(d.label);
            const lines = getLabelLines(labelStr);
            const vis = d.iconVisibility || { text: true, image: true, link: true };
            const hasIcons = (d.hasCustomText && vis.text) || (vis.image && d.images?.length > 0) || (vis.link && (d.urls?.length > 0 || d.url));
            if (!hasIcons) return 0;

            // Place below the text lines
            const baseSize = (d.level === 0 ? 14 : (d.level === 1 ? 12 : (d.level === 2 ? 10 : 9)));
            const fontSize = baseSize * globalFontScale;
            return (lines.length * (fontSize * 0.6)) + 4;
        })
        .html(d => {
            let icons = [];
            const outlineClass = "node-icon-outline";
            const vis = d.iconVisibility || { text: true, image: true, link: true };

            if (d.hasCustomText && vis.text) icons.push(`<i data-lucide="pencil" class="w-3 h-3 text-slate-800 ${outlineClass}"></i>`);

            // Multiple images
            if (vis.image) {
                const imgs = d.images || (d.image ? [d.image] : []);
                if (imgs.length > 0) icons.push(`<i data-lucide="image" class="w-3 h-3 text-slate-800 ${outlineClass}"></i>`);
            }

            // Multiple links
            const urls = d.urls || (d.url ? [d.url] : []);
            urls.forEach(u => {
                if (u.startsWith('file://')) {
                    if (vis.file !== false) icons.push(`<i data-lucide="database" class="w-3 h-3 text-slate-800 ${outlineClass}"></i>`);
                } else {
                    if (vis.link !== false) icons.push(`<i data-lucide="link" class="w-3 h-3 text-slate-800 ${outlineClass}"></i>`);
                }
            });

            // Tutor Icon (if chat history exists)
            if (tutorState.nodes[d.id] && tutorState.nodes[d.id].history.length > 0) {
                icons.push(`<i data-lucide="brain" class="w-3 h-3 text-indigo-600 ${outlineClass}"></i>`);
            }

            if (d.hasFile && vis.file !== false) icons.push(`<i data-lucide="database" class="w-3 h-3 text-slate-800 ${outlineClass}"></i>`);

            if (icons.length === 0) return "";
            // Limit to 4 icons for visual clarity
            const limitedIcons = icons.slice(0, 4);
            return `<div style="display:flex; align-items:center; justify-content:center; gap:1px; width:100%; height:100%; opacity:0.9; pointer-events:none;">${limitedIcons.join('')}</div>`;
        })
        .each(function () {
            if (window.lucide && window.lucide.createIcons) {
                window.lucide.createIcons({ root: this });
            }
        });

    nodeSelection.exit().remove();
    d3.select("#d3-container").classed("labels-hidden", labelsHidden);

    // Adatta il max dello slider di profondità alla profondità reale della mappa.
    // Necessario quando operazioni come relink o merge creano nodi oltre L5.
    const ls = document.getElementById('level-slider');
    if (ls) {
        const actualMax = nodes.reduce((m, n) => Math.max(m, n.level || 0), 5);
        const sliderMax = parseInt(ls.max);
        if (actualMax !== sliderMax) {
            const wasAtMax = parseInt(ls.value) === sliderMax;
            ls.max = actualMax;
            if (wasAtMax) {
                ls.value = actualMax;
                const lv = document.getElementById('level-slider-val');
                if (lv) lv.textContent = 'L' + actualMax;
            }
        }
    }

    window.applyVisualFilters();
    // Riapplica la lente relazioni se attiva (dopo ogni render)
    if (window.activeLensFamily) window.applyLensFamily();
    // Applica il filtro di visibilità link (cycle 3 stati)
    if (window.linkVisibilityMode && window.linkVisibilityMode !== 'all') window.applyLinkVisibility();

    // Applica subito le posizioni pre-calcolate (tick manuale)
    tick();

    // Animazione a cascata per svelamento progressivo (Strategia 4)
    // Link appaiono tutti insieme con delay
    linkEnter.transition().duration(800).delay(500).style("opacity", 1);

    // I nodi vecchi (merge senza enter) mantengono opacità modulata per ruolo
    // (foglie attenuate a 0.65 in KG, vedi mappai-node-styling.js)
    nodeSelection.style("opacity", d => (d._opacity !== undefined) ? d._opacity : 1);
    linkSelection.style("opacity", 1);

    // I nodi nuovi appaiono a scaglioni in base al livello, target = _opacity
    nodeEnter.transition().duration(600).delay(d => {
        if (d.level === 0) return 0;
        if (d.level === 1) return 400;
        if (d.level === 2) return 800;
        return 1200;
    }).style("opacity", d => (d._opacity !== undefined) ? d._opacity : 1);

    window.applyDeepNodeDim();
}

// Effetto dim sui nodi L5+: più profondi = più trasparenti quando si è in panoramica;
// a zoom = 1 i nodi sono completamente opachi.
window.applyDeepNodeDim = function (k) {
    if (k === undefined) {
        const svgNode = document.getElementById('map-svg');
        k = svgNode ? d3.zoomTransform(svgNode).k : 1;
    }
    if (!g) return;
    g.selectAll(".node-group").each(function (d) {
        if (!d || d.level < 5) return;
        const depth = d.level - 5;              // 0 per L5, 1 per L6, 2 per L7 …
        const minOp = Math.max(0.12, 0.88 - depth * 0.18); // L5:0.88 L6:0.70 L7:0.52 L8:0.34
        const opacity = minOp + (1 - minOp) * Math.min(1, k);
        d3.select(this).style("opacity", opacity);
    });
};

function tick() {
    if (!g) return;
    g.selectAll(".link").each(function (d) {
        const sx = d.source.x, sy = d.source.y, tx = d.target.x, ty = d.target.y;
        const len = Math.sqrt((tx - sx) ** 2 + (ty - sy) ** 2) || 1;
        const ux = (tx - sx) / len, uy = (ty - sy) / len;
        const rs = getNodeRadius(d.source);
        const rt = getNodeRadius(d.target);
        const x1 = sx + ux * rs, y1 = sy + uy * rs;
        const x2 = tx - ux * rt, y2 = ty - uy * rt;
        let pathD;
        if (d.bidirectional) {
            // Curva quadratica Bezier: offset perpendolare di 40px per distinguerla
            const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
            const cx = mx - uy * 40, cy = my + ux * 40;
            pathD = `M${x1},${y1} Q${cx},${cy} ${x2},${y2}`;
        } else {
            pathD = `M${x1},${y1} L${x2},${y2}`;
        }
        d3.select(this).attr("d", pathD);
    });
    g.selectAll(".link-label").each(function (d) {
        const sx = d.source.x, sy = d.source.y, tx = d.target.x, ty = d.target.y;
        let lx, ly;
        if (d.bidirectional) {
            const len = Math.sqrt((tx - sx) ** 2 + (ty - sy) ** 2) || 1;
            const ux = (tx - sx) / len, uy = (ty - sy) / len;
            const mx = (sx + tx) / 2, my = (sy + ty) / 2;
            // Midpoint visivo della curva Bezier = 0.5*(punto di controllo) spostato
            lx = mx - uy * 20;
            ly = my + ux * 20;
        } else {
            lx = sx + (tx - sx) * 0.67;
            ly = sy + (ty - sy) * 0.67;
        }
        d3.select(this).attr("x", lx).attr("y", ly);
    });
    g.selectAll(".node-group").attr("transform", d => `translate(${d.x},${d.y})`);
}

function drag(simulation) {
    let dragStartPos = null;
    let longPressTimer = null;
    let longPressTriggered = false;
    let hasMovedSignificant = false;

    function dragstarted(event) {
        longPressTriggered = false;
        hasMovedSignificant = false;
        const sourceEvt = event.sourceEvent;

        if (sourceEvt) {
            const touch = sourceEvt.touches ? sourceEvt.touches[0] : sourceEvt;
            dragStartPos = { x: touch.clientX, y: touch.clientY };
        } else {
            dragStartPos = { x: event.x, y: event.y };
        }

        if (longPressTimer) clearTimeout(longPressTimer);
        longPressTimer = setTimeout(() => {
            longPressTriggered = true;
            window.ignoreNextNodeClick = true;
            const clientX = dragStartPos.x, clientY = dragStartPos.y;
            window.showContextMenu({
                preventDefault: () => { if (sourceEvt?.preventDefault) sourceEvt.preventDefault(); },
                stopPropagation: () => { if (sourceEvt?.stopPropagation) sourceEvt.stopPropagation(); },
                clientX, clientY
            }, 'node', event.subject);
            longPressTimer = null;
        }, 500);

        // Garantisce sempre tick visivi durante il drag, a qualsiasi livello di energia
        if (!event.active) {
            const targetAlpha = (isPinned || !attractionEnabled) ? 0.05 : 0.3;
            simulation.alphaTarget(targetAlpha).restart();
        }
        event.subject.fx = event.subject.x;
        event.subject.fy = event.subject.y;
    }

    function dragged(event) {
        if (dragStartPos) {
            const sourceEvt = event.sourceEvent;
            const touch = sourceEvt?.touches?.[0] ?? sourceEvt;
            const curX = touch ? touch.clientX : event.x;
            const curY = touch ? touch.clientY : event.y;
            const dist = Math.hypot(curX - dragStartPos.x, curY - dragStartPos.y);
            if (dist > 10) {
                hasMovedSignificant = true;
                if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
            }
        }
        if (longPressTriggered) return;
        event.subject.fx = event.x;
        event.subject.fy = event.y;
    }

    function dragended(event) {
        if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }

        // Riporta la simulazione allo stato corretto dopo il drag
        if (!event.active) {
            simulation.alphaTarget(attractionEnabled && !isPinned ? 0 : 0);
        }

        if (longPressTriggered) {
            longPressTriggered = false;
            setTimeout(() => { window.ignoreNextNodeClick = false; }, 100);
            return;
        }

        // ── Logica posizione finale ──────────────────────────────────────────
        // Regola unica: se fisica attiva e pin spento → rilascia (la fisica decide).
        //               altrimenti → fissa il nodo nella posizione corrente.
        // L0 (root) è sempre al centro quando la fisica è attiva.

        const releaseToPhysics = attractionEnabled && !isPinned;

        if (!hasMovedSignificant) {
            // Tap/click: ripristina esattamente la posizione precedente
            if (releaseToPhysics && event.subject.level === 0) {
                event.subject.fx = 0; event.subject.fy = 0;
            } else if (releaseToPhysics) {
                event.subject.fx = null; event.subject.fy = null;
            } else {
                event.subject.fx = event.subject.x;
                event.subject.fy = event.subject.y;
            }
            window.handleNodeClick(event.sourceEvent, event.subject);
            window.ignoreNextNodeClick = true;
            setTimeout(() => { window.ignoreNextNodeClick = false; }, 300);
            return;
        }

        // Drag significativo
        if (releaseToPhysics) {
            if (event.subject.level === 0) { event.subject.fx = 0; event.subject.fy = 0; }
            else { event.subject.fx = null; event.subject.fy = null; }
        } else {
            // Pin ON o attrazione OFF: re-pinna nella nuova posizione
            if (event.subject.level === 0) { event.subject.fx = 0; event.subject.fy = 0; }
            else { event.subject.fx = event.x; event.subject.fy = event.y; }
        }
    }

    return d3.drag().on("start", dragstarted).on("drag", dragged).on("end", dragended);
}

window.applyPinning = function (pinned) {
    isPinned = pinned;
    const btn = document.getElementById('card-btn-physics');
    appState.db.nodes.forEach(n => { n.fx = pinned ? n.x : null; n.fy = pinned ? n.y : null; });
    if (pinned) {
        // Azzera tutte le forze: i nodi non si muovono da soli
        simulation.force("charge", d3.forceManyBody().strength(0));
        simulation.force("link").strength(0);
        simulation.force("collide", null);
        simulation.velocityDecay(0.8);
        // NON fermare la simulazione: servono i tick per il feedback visivo del drag
        simulation.alphaTarget(0).alpha(0.05);
        if (btn) { btn.classList.replace('bg-slate-100', 'bg-blue-50'); btn.classList.replace('text-slate-600', 'text-blue-600'); }
    } else {
        simulation.force("charge", d3.forceManyBody().strength(d => (d.level === 0 ? -800 : -200) * forceChargeMult));
        simulation.force("link").strength(1);
        simulation.force("collide", d3.forceCollide().radius(d => getNodeRadius(d) + 4).strength(0.7));
        simulation.velocityDecay(0.4);
        simulation.alpha(0.3).alphaTarget(0).restart();
        if (btn) { btn.classList.replace('bg-blue-50', 'bg-slate-100'); btn.classList.replace('text-blue-600', 'text-slate-600'); }
    }
};

window.togglePhysics = function () { window.applyPinning(!isPinned); };

window.toggleAttraction = function () {
    if (!simulation) return;
    attractionEnabled = !attractionEnabled;
    const btn = document.getElementById('toggle-attraction-btn');

    if (attractionEnabled) {
        simulation.force("charge").strength(d => (d.level === 0 ? -800 : -200) * forceChargeMult);
        simulation.force("link").strength(1);
        simulation.alpha(0.3).alphaTarget(0).restart();
        if (btn) btn.className = "flex flex-col items-center justify-center w-12 h-12 rounded-xl bg-blue-50 text-blue-600 hover:bg-blue-100 transition";
    } else {
        simulation.force("charge").strength(0);
        simulation.force("link").strength(0);
        // Non fermare la simulazione: serve per il drag visivo
        simulation.alphaTarget(0);
        if (btn) btn.className = "flex flex-col items-center justify-center w-12 h-12 rounded-xl bg-red-50 text-red-500 hover:bg-red-100 transition";
    }
    if (btn) {
        btn.innerHTML = '<i data-lucide="magnet" class="w-5 h-5"></i><span class="text-[9px] font-bold mt-1">ATTR</span>';
        window.safeCreateIcons();
    }
};

window.changeFontScale = function (dir) {
    globalFontScale = Math.max(0.5, Math.min(2.5, globalFontScale + (dir * 0.1)));
    if (g) {
        g.selectAll("text.node-text").style("font-size", d => {
            let baseSize = 8;
            if (d.level === 0) baseSize = 14;
            else if (d.level === 1) baseSize = 12;
            else if (d.level === 2) baseSize = 10;
            else if (d.level === 3) baseSize = 9;
            return (baseSize * globalFontScale) + "px";
        });

        g.selectAll("text.link-label").style("font-size", (8 * globalFontScale * 0.765) + "px");
    }
};

window.exportSnapshot = async function () {
    try {
        if (!window.electronAPI || !window.electronAPI.capturePage) {
            throw new Error("La cattura PNG non è supportata su iPadOS. Usa l'esportazione SVG (Vettoriale)!");
        }

        window.showToast("Cattura immagine pulita in corso...", "info");

        // Attiva modalità snapshot (nasconde UI)
        document.body.classList.add('is-snapshotting');

        // Attendi un frame per il reflow del layout
        await new Promise(resolve => setTimeout(resolve, 150));

        const dataUrl = await window.electronAPI.capturePage();

        // Ripristina UI
        document.body.classList.remove('is-snapshotting');

        if (!dataUrl) throw new Error("Errore durante la cattura dello schermo");

        const isCapacitor = typeof window !== 'undefined' && window.Capacitor !== undefined;
        if (isCapacitor) {
            const res = await fetch(dataUrl);
            const blob = await res.blob();
            const file = new File([blob], `MappAI_Snapshot_${new Date().getTime()}.png`, { type: 'image/png' });
            if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
                await navigator.share({
                    files: [file],
                    title: "Esporta Snapshot",
                    text: "Snapshot della mappa mentale creato con MappAI"
                });
                window.showToast("Snapshot condiviso con successo!", "success");
            } else {
                throw new Error("Condivisione file non supportata da questo dispositivo");
            }
        } else {
            const a = document.createElement("a");
            a.download = `MappAI_Snapshot_${new Date().getTime()}.png`;
            a.href = dataUrl;
            a.click();
            window.showToast("Snapshot PNG (Clean) creato con successo!", "success");
        }
    } catch (err) {
        document.body.classList.remove('is-snapshotting');
        console.error("Errore Snapshot:", err);
        window.showToast(err.message, "error");
    }
};

window.exportPDF = async function () {
    try {
        if (!window.electronAPI || !window.electronAPI.capturePage) {
            throw new Error("La cattura PDF non è supportata su iPadOS. Usa l'esportazione SVG (Vettoriale)!");
        }

        window.showToast("Generazione PDF in corso...", "info");

        // Attiva modalità snapshot (nasconde l'UI)
        document.body.classList.add('is-snapshotting');

        // Attendi un frame per il reflow del layout
        await new Promise(resolve => setTimeout(resolve, 150));

        const dataUrl = await window.electronAPI.capturePage();

        // Ripristina UI
        document.body.classList.remove('is-snapshotting');

        if (!dataUrl) throw new Error("Errore durante la cattura dello schermo");

        // Utilizziamo jsPDF (già incluso nell'app)
        const { jsPDF } = window.jspdf;
        const width = window.innerWidth;
        const height = window.innerHeight;

        // Crea il documento PDF con orientamento dinamico e dimensioni della finestra
        const pdf = new jsPDF({
            orientation: width > height ? 'landscape' : 'portrait',
            unit: 'px',
            format: [width, height]
        });

        // Inserisce l'immagine catturata nel PDF
        pdf.addImage(dataUrl, 'PNG', 0, 0, width, height);

        const isCapacitor = typeof window !== 'undefined' && window.Capacitor !== undefined;
        if (isCapacitor) {
            // Su iPadOS (Capacitor), esportiamo come Blob e usiamo navigator.share per il foglio di condivisione nativo
            const blob = pdf.output('blob');
            const file = new File([blob], `MappAI_Mappa_${new Date().getTime()}.pdf`, { type: 'application/pdf' });
            if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
                await navigator.share({
                    files: [file],
                    title: "Esporta PDF",
                    text: "Mappa mentale creata con MappAI"
                });
                window.showToast("PDF condiviso con successo!", "success");
            } else {
                throw new Error("Condivisione PDF non supportata da questo dispositivo");
            }
        } else {
            // Su Desktop (Electron/Browser), salva direttamente sul filesystem
            pdf.save(`MappAI_Mappa_${new Date().getTime()}.pdf`);
            window.showToast("Esportazione PDF completata!", "success");
        }
    } catch (err) {
        document.body.classList.remove('is-snapshotting');
        console.error("Errore esportazione PDF:", err);
        window.showToast(err.message, "error");
    }
};

window.exportSVG = async function () {
    try {
        window.showToast("Generazione SVG in corso...", "info");
        const svgElement = document.getElementById("map-svg");
        if (!svgElement) throw new Error("Mappa SVG non trovata nel documento");

        // Clona l'SVG per non influenzare la vista corrente
        const clonedSvg = svgElement.cloneNode(true);

        // Rimuove eventuali listener o elementi di controllo inutili se presenti
        clonedSvg.removeAttribute("class");

        // Estrae tutti gli stili CSS globali e li incorpora nell'SVG per mantenere colori e stili dei nodi/linee
        let cssStyles = "";
        try {
            for (const sheet of document.styleSheets) {
                try {
                    const rules = sheet.cssRules || sheet.rules;
                    for (const rule of rules) {
                        if (rule.cssText && (rule.cssText.includes(".node") || rule.cssText.includes(".link") || rule.cssText.includes("svg") || rule.cssText.includes("text"))) {
                            cssStyles += rule.cssText + "\n";
                        }
                    }
                } catch (e) {
                    // Ignora errori di fogli di stile cross-origin (es. Google Fonts)
                }
            }
        } catch (e) {
            console.warn("Impossibile leggere alcuni fogli di stile:", e);
        }

        const styleElem = document.createElementNS("http://www.w3.org/2000/svg", "style");
        styleElem.textContent = cssStyles;
        clonedSvg.insertBefore(styleElem, clonedSvg.firstChild);

        // Serializza l'SVG in formato stringa XML
        const serializer = new XMLSerializer();
        const svgString = serializer.serializeToString(clonedSvg);
        const blob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });

        const isCapacitor = typeof window !== 'undefined' && window.Capacitor !== undefined;
        if (isCapacitor) {
            // Su iPadOS, usa navigator.share per condividere o salvare nei File
            const file = new File([blob], `MappAI_Mappa_${new Date().getTime()}.svg`, { type: 'image/svg+xml' });
            if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
                await navigator.share({
                    files: [file],
                    title: "Esporta SVG",
                    text: "Esporta mappa mentale in vettoriale"
                });
                window.showToast("SVG condiviso con successo!", "success");
            } else {
                throw new Error("Condivisione non supportata su questo dispositivo. Prova a salvare.");
            }
        } else {
            // Su Desktop/Browser scarica il file
            const a = document.createElement("a");
            a.download = `MappAI_Mappa_${new Date().getTime()}.svg`;
            a.href = URL.createObjectURL(blob);
            a.click();
            window.showToast("Esportazione SVG completata con successo!", "success");
        }
    } catch (err) {
        console.error("Errore esportazione SVG:", err);
        window.showToast("Errore esportazione: " + err.message, "error");
    }
};

window.changeDistance = function (dir) {
    forceDistMult = Math.max(0.5, Math.min(3, forceDistMult + (dir * 0.2)));
    forceChargeMult = Math.max(0.5, Math.min(3, forceChargeMult + (dir * 0.2)));
    if (!isPinned) {
        simulation.force("link").distance(d => ((d.source.level === 0) ? 120 : 80) * forceDistMult);
        simulation.force("charge").strength(d => (d.level === 0 ? -800 : -200) * forceChargeMult);
        simulation.alpha(0.3).restart();
    }
}

window.toggleLayout = function () {
    if (!simulation) return;
    const isMindmap = appState.extractionMode === 'mindmap';
    const btn = document.getElementById('card-btn-layout');
    const span = document.getElementById('layout-label-text');
    const hasSnapshot = appState.db.nodes.some(n => n.savedX !== undefined);
    const hasSavedLayouts = appState.savedLayouts && appState.savedLayouts.length > 0;

    // Ciclo Layout: Default -> (Orbit) -> (Radial/Separated) -> (Personal) -> (Custom Layouts)
    if (appState.layoutMode === 'default') {
        appState.layoutMode = 'orbit';
    } else if (appState.layoutMode === 'orbit') {
        appState.layoutMode = isMindmap ? 'radial' : 'separated';
    } else if (appState.layoutMode === 'radial' || appState.layoutMode === 'separated') {
        if (hasSnapshot) appState.layoutMode = 'personal';
        else if (hasSavedLayouts) appState.layoutMode = 'custom_' + appState.savedLayouts[0].id;
        else appState.layoutMode = 'default';
    } else if (appState.layoutMode === 'personal') {
        if (hasSavedLayouts) appState.layoutMode = 'custom_' + appState.savedLayouts[0].id;
        else appState.layoutMode = 'default';
    } else if (appState.layoutMode && appState.layoutMode.startsWith('custom_')) {
        const currentId = appState.layoutMode.replace('custom_', '');
        const layouts = appState.savedLayouts || [];
        const idx = layouts.findIndex(l => l.id === currentId);
        if (idx >= 0 && idx < layouts.length - 1) {
            appState.layoutMode = 'custom_' + layouts[idx + 1].id;
        } else {
            appState.layoutMode = 'default';
        }
    } else {
        appState.layoutMode = 'default';
    }

    // Applica logic layout
    if (appState.layoutMode === 'personal') {
        appState.db.nodes.forEach(n => {
            if (n.savedX !== undefined && n.savedY !== undefined) {
                n.x = n.savedX; n.y = n.savedY;
                n.fx = n.savedX; n.fy = n.savedY;
                n.pinned = true;
            }
        });
        window.showToast("Layout Personale Ripristinato", "success");
    } else if (appState.layoutMode && appState.layoutMode.startsWith('custom_')) {
        const layoutId = appState.layoutMode.replace('custom_', '');
        const layout = appState.savedLayouts.find(l => l.id === layoutId);
        if (layout) {
            appState.db.nodes.forEach(n => {
                const savedPos = layout.positions[n.id];
                if (savedPos) {
                    n.x = savedPos.x; n.y = savedPos.y;
                    n.fx = savedPos.fx; n.fy = savedPos.fy;
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
            window.showToast(`Layout "${layout.name}" Ripristinato`, "success");
        }
    }

    if (btn) {
        if (appState.layoutMode !== 'default') {
            btn.classList.add('bg-indigo-100', 'text-indigo-600');
            btn.classList.remove('bg-slate-100', 'text-slate-600');
            if (appState.layoutMode === 'separated') span.innerText = 'SEPARATO';
            if (appState.layoutMode === 'radial') span.innerText = 'RADIALE';
            if (appState.layoutMode === 'orbit') span.innerText = 'ORBITA';
            if (appState.layoutMode === 'personal') span.innerText = 'PERSONAL';
            if (appState.layoutMode && appState.layoutMode.startsWith('custom_')) {
                const layoutId = appState.layoutMode.replace('custom_', '');
                const layout = appState.savedLayouts.find(l => l.id === layoutId);
                span.innerText = layout ? layout.keyword : 'CUSTOM';
            }
        } else {
            btn.classList.remove('bg-indigo-100', 'text-indigo-600');
            btn.classList.add('bg-slate-100', 'text-slate-600');
            span.innerText = 'LAYOUT';
        }
    }

    if (appState.layoutMode !== 'personal' && (!appState.layoutMode || !appState.layoutMode.startsWith('custom_'))) {
        window.applyLayoutForces();
    } else {
        simulation.alpha(0.3).restart();
    }
};

window.applyLayoutForces = function () {
    if (!simulation) return;

    // reset forces first
    simulation.force("radial", null);
    simulation.force("x", null);
    simulation.force("y", null);

    if (appState.layoutMode === 'radial') {
        simulation.force("radial", d3.forceRadial(d => d.level * 180, 0, 0).strength(0.8));
        simulation.force("charge", d3.forceManyBody().strength(-400 * forceChargeMult));
    } else if (appState.layoutMode === 'separated') {
        simulation.force("charge", d3.forceManyBody().strength(d => (d.level === 0 || d.degree > 3) ? -2500 * forceChargeMult : -300 * forceChargeMult));
    } else if (appState.layoutMode === 'orbit') {
        simulation.force("radial", d3.forceRadial(d => (d.group || 1) * 150, 0, 0).strength(0.8));
        simulation.force("charge", d3.forceManyBody().strength(-400 * forceChargeMult));
    } else {
        simulation.force("charge", d3.forceManyBody().strength(d => (d.level === 0 ? -800 : -200) * forceChargeMult));
    }

    simulation.alpha(1).restart();
}

window.toggleLabels = function () {
    // Se la lente è attiva, click su TESTO azzera la lente (non toglia label globali)
    if (window.activeLensFamily) {
        window.resetLensFamily();
        return;
    }
    labelsHidden = !labelsHidden;
    d3.select("#d3-container").classed("labels-hidden", labelsHidden);
    const btn = document.getElementById('card-btn-labels');
    if (labelsHidden) { btn.classList.replace('bg-slate-100', 'bg-red-50'); btn.classList.replace('text-slate-600', 'text-red-500'); }
    else { btn.classList.replace('bg-red-50', 'bg-slate-100'); btn.classList.replace('text-red-500', 'text-slate-600'); }
}

// ── Lente Relazioni ────────────────────────────────────────────────────────

// Click sul bottone TESTO: dispatching tra toggle label e apertura menu lente
window.handleLabelsButtonClick = function (event) {
    const tgt = event.target;
    if (tgt && (tgt.id === 'lens-caret' || (tgt.closest && tgt.closest('#lens-caret')))) {
        event.stopPropagation();
        window.openLensMenu();
        return;
    }
    window.toggleLabels();
};

window.openLensMenu = function () {
    const menu = document.getElementById('lens-menu');
    if (!menu) return;

    if (!menu.classList.contains('hidden')) {
        menu.classList.add('hidden');
        return;
    }

    const families = window.getActiveFamiliesInMap();
    let html = '';

    const allActive = window.activeLensFamily === null;
    html += `<button type="button" class="lens-item${allActive ? ' active' : ''}"
        onclick="window.selectLensFamily(null)">
        <span class="lens-dot" style="background:#94a3b8;"></span>
        Tutte le relazioni
    </button>`;

    if (families.length > 1 || (families.length === 1 && families[0] !== 'altro')) {
        html += `<div class="lens-divider"></div>`;
    }

    families.forEach(key => {
        const fam = EDGE_FAMILIES[key];
        const isActive = window.activeLensFamily === key;
        html += `<button type="button" class="lens-item${isActive ? ' active' : ''}"
            onclick="window.selectLensFamily('${key}')"
            onmouseenter="this.style.color='${fam.color}'"
            onmouseleave="this.style.color=''">
            <span class="lens-dot" style="background:${fam.color};"></span>
            <i data-lucide="${fam.icon}" style="width:12px;height:12px;flex-shrink:0;"></i>
            ${fam.label}
        </button>`;
    });

    menu.innerHTML = html;
    menu.classList.remove('hidden');
    window.safeCreateIcons();

    setTimeout(() => {
        const closer = (e) => {
            if (!menu.contains(e.target)
                && e.target.id !== 'card-btn-labels'
                && e.target.id !== 'lens-caret'
                && !(e.target.closest && e.target.closest('#lens-caret'))) {
                menu.classList.add('hidden');
                document.removeEventListener('click', closer);
            }
        };
        document.addEventListener('click', closer);
    }, 0);
};

window.selectLensFamily = function (familyKey) {
    window.activeLensFamily = familyKey;
    document.getElementById('lens-menu')?.classList.add('hidden');
    window.applyLensFamily();
};

window.applyLensFamily = function () {
    const key = window.activeLensFamily;
    const btn = document.getElementById('card-btn-labels');
    const caret = document.getElementById('lens-caret');
    if (!btn || !g) return;

    // Reset stili inline
    g.selectAll('.link')
        .style('stroke', null)
        .style('stroke-width', null)
        .style('stroke-opacity', null)
        .attr('marker-end', 'url(#arrowhead)')
        .attr('marker-start', d => d.bidirectional ? 'url(#arrowhead-rev)' : null);
    g.selectAll('.link-group').classed('lens-dimmed', false);
    g.selectAll('.node-group').classed('lens-dimmed', false);
    g.selectAll('circle.node-circle')
        .style('stroke', null)
        .style('stroke-width', null);
    g.selectAll('text.link-label')
        .style('font-size', null)
        .style('fill', null)
        .style('opacity', null)
        .style('stroke', null)
        .style('stroke-width', null)
        .style('stroke-linejoin', null)
        .style('paint-order', null)
        .style('font-weight', null);

    if (!key) {
        btn.style.background = '';
        btn.style.color = '';
        if (caret) caret.style.color = '';
        return;
    }

    const fam = EDGE_FAMILIES[key];
    if (!fam) return;

    const activeLinkSet = new Set();
    const activeNodeIds = new Set();
    appState.db.links.forEach(l => {
        if (window.getEdgeFamilyKey(l.rel) === key) {
            activeLinkSet.add(l);
            const s = typeof l.source === 'object' ? l.source.id : l.source;
            const t = typeof l.target === 'object' ? l.target.id : l.target;
            activeNodeIds.add(s);
            activeNodeIds.add(t);
        }
    });

    const baseFontSize = 8 * globalFontScale * 0.765;

    g.selectAll('.link-group').each(function (d) {
        const isActive = activeLinkSet.has(d);
        d3.select(this).classed('lens-dimmed', !isActive);
        // Path + frecce colorate per i link attivi
        d3.select(this).select('.link')
            .style('stroke', isActive ? fam.color : null)
            .style('stroke-width', isActive ? '2.5px' : null)
            .style('stroke-opacity', isActive ? '1' : null)
            .attr('marker-end', isActive ? `url(#arrowhead-${key})` : 'url(#arrowhead)')
            .attr('marker-start', d => d.bidirectional
                ? (isActive ? `url(#arrowhead-rev-${key})` : 'url(#arrowhead-rev)')
                : null);
        // Label: forza visibile + font ×1.5 + colore famiglia + outline NERO per contrasto
        // (replica il pattern di .node-text, ma stroke nero come richiesto)
        d3.select(this).select('text.link-label')
            .style('opacity', isActive ? '1' : null)
            .style('font-size', isActive ? (baseFontSize * 1.5) + 'px' : null)
            .style('fill', isActive ? fam.color : null)
            .style('font-weight', isActive ? 'bold' : null)
            .style('stroke', isActive ? 'black' : null)
            .style('stroke-width', isActive ? '1px' : null)
            .style('stroke-linejoin', isActive ? 'round' : null)
            .style('paint-order', isActive ? 'stroke fill' : null);
    });

    g.selectAll('.node-group').each(function (d) {
        const active = activeNodeIds.has(d.id) || d.level === 0;
        d3.select(this).classed('lens-dimmed', !active);
        if (active && d.level > 0) {
            d3.select(this).select('circle.node-circle')
                .style('stroke', fam.color)
                .style('stroke-width', '3px');
        }
    });

    btn.style.background = fam.colorBtn;
    btn.style.color = 'white';
    if (caret) caret.style.color = 'rgba(255,255,255,0.85)';
};

window.resetLensFamily = function () {
    window.activeLensFamily = null;
    window.applyLensFamily();
};

window.updateDegreeStats = function () {
    let deg = {};
    appState.db.nodes.forEach(n => deg[n.id] = 0);
    appState.db.links.forEach(l => {
        let sid = typeof l.source === 'object' ? l.source.id : l.source;
        let tid = typeof l.target === 'object' ? l.target.id : l.target;
        if (deg[sid] !== undefined) deg[sid]++;
        if (deg[tid] !== undefined) deg[tid]++;
    });
    appState.db.nodes.forEach(n => n.degree = deg[n.id]);
    let maxDeg = Math.max(...Object.values(deg), 0);

    const slider = document.getElementById('node-filter-slider');
    if (slider) {
        slider.max = maxDeg;
        slider.value = 0;
    }
    const display = document.getElementById('filter-val-display');
    if (display) display.innerText = `0`;
}

window.applyVisualFilters = function () {
    const minLinkSlider = document.getElementById('node-filter-slider');
    const minDegree = minLinkSlider && !minLinkSlider.closest('.hidden') ? (parseInt(minLinkSlider.value) || 0) : 0;

    const levelSlider = document.getElementById('level-slider');
    const maxLvl = (levelSlider && !levelSlider.closest('.hidden')) ? parseInt(levelSlider.value) : 5;

    let pathSet = new Set(), linkPathSet = new Set();

    if (pathfinderActive && pathfinderState.source && pathfinderState.target) {
        const path = calculatePath(pathfinderState.source, pathfinderState.target);
        if (path) {
            path.forEach(id => pathSet.add(id));
            for (let i = 0; i < path.length - 1; i++) {
                let a = path[i], b = path[i + 1];
                appState.db.links.forEach(l => {
                    let s = typeof l.source === 'object' ? l.source.id : l.source;
                    let t = typeof l.target === 'object' ? l.target.id : l.target;
                    if ((s === a && t === b) || (s === b && t === a)) linkPathSet.add(l);
                });
            }
        }
    }

    g.selectAll(".node-group")
        .classed("hidden", d => {
            if (d.level > maxLvl) return true;
            if (d.degree < minDegree && !pathSet.has(d.id)) return true;
            return false;
        })
        .classed("dimmed", d => pathfinderActive && pathfinderState.target && !pathSet.has(d.id));

    g.selectAll(".link-group")
        .classed("hidden", d => {
            let s = typeof d.source === 'object' ? d.source : appState.db.nodes.find(n => n.id === d.source);
            let t = typeof d.target === 'object' ? d.target : appState.db.nodes.find(n => n.id === d.target);
            if (!s || !t) return true;

            if (Math.max(s.level, t.level) > maxLvl) return true;

            let sDeg = s.degree || 0;
            let tDeg = t.degree || 0;
            if ((sDeg < minDegree || tDeg < minDegree) && !linkPathSet.has(d)) return true;

            return false;
        })
        .classed("dimmed", d => pathfinderActive && pathfinderState.target && !linkPathSet.has(d));

    g.selectAll(".link").classed("pathfinder-active", d => linkPathSet.has(d));
}

window.onLevelSliderInput = function (val) {
    document.getElementById('level-slider-val').textContent = 'L' + val;
    window.applyVisualFilters();
}

window.updateFilter = function (val) {
    document.getElementById('filter-val-display').innerText = val;
    window.applyVisualFilters();
}

// ── Visibilità Link (cycle 3 stati) ────────────────────────────────────────

const LINK_VIS_STATES = {
    all:       { icon: 'network',  label: 'LINK',  tooltip: 'Tutti i link visibili (click per nascondere cross-link)',  bg: '',           color: '' },
    hierarchy: { icon: 'git-fork', label: 'TREE',  tooltip: 'Solo gerarchia (click per vedere solo cross-link)',         bg: '#dbeafe',    color: '#2563eb' },
    cross:     { icon: 'shuffle',  label: 'CROSS', tooltip: 'Solo cross-link (click per tornare a tutti)',               bg: '#fef3c7',    color: '#d97706' }
};
const LINK_VIS_CYCLE = ['all', 'hierarchy', 'cross'];

window.cycleLinkVisibility = function () {
    const idx = LINK_VIS_CYCLE.indexOf(window.linkVisibilityMode);
    const next = LINK_VIS_CYCLE[(idx + 1) % LINK_VIS_CYCLE.length];
    window.linkVisibilityMode = next;
    localStorage.setItem('mappai_link_vis_mode', next);
    window.applyLinkVisibility();
};

window.applyLinkVisibility = function () {
    const mode = window.linkVisibilityMode || 'all';
    const state = LINK_VIS_STATES[mode] || LINK_VIS_STATES.all;

    // Aggiorna bottone (icona + colore + label + tooltip)
    const btn = document.getElementById('card-btn-link-vis');
    const iconEl = document.getElementById('card-btn-link-vis-icon');
    const labelEl = document.getElementById('card-btn-link-vis-label');
    if (btn) {
        btn.style.background = state.bg;
        btn.style.color = state.color;
        btn.title = state.tooltip;
    }
    if (iconEl) {
        iconEl.setAttribute('data-lucide', state.icon);
        // Reset SVG e ri-render via lucide
        const parent = iconEl.parentNode;
        const fresh = document.createElement('i');
        fresh.id = 'card-btn-link-vis-icon';
        fresh.setAttribute('data-lucide', state.icon);
        fresh.className = 'w-5 h-5';
        if (state.color) fresh.style.color = state.color;
        parent.replaceChild(fresh, iconEl);
        window.safeCreateIcons();
    }
    if (labelEl) labelEl.textContent = state.label;

    // Applica filtro al rendering: marca i link come hidden via classe CSS
    if (!g) return;
    // Assicura che i link abbiano isCross calcolato in base alla modalità corrente
    if (appState.extractionMode === 'kg') {
        window.markKgCrossLinks(appState.db.nodes, appState.db.links);
    } else {
        window.markMmCrossLinks(appState.db.nodes, appState.db.links);
    }

    g.selectAll('.link-group').classed('link-hidden', function (d) {
        if (mode === 'all') return false;
        if (mode === 'hierarchy') return d.isCross === true;
        if (mode === 'cross') return d.isCross !== true;
        return false;
    });
};

window.togglePathfinder = function () {
    pathfinderActive = !pathfinderActive;
    const btn = document.getElementById('card-btn-pathfinder');
    const hint = document.getElementById('mode-hint');
    pathfinderState = { active: pathfinderActive, source: null, target: null };

    if (pathfinderActive) {
        btn.classList.replace('bg-slate-100', 'bg-amber-50'); btn.classList.replace('text-slate-600', 'text-amber-600');
        hint.innerText = "PATHFINDER: Clicca sul Nodo di Partenza"; hint.classList.remove('hidden');
        linkingState.active = false;
    } else {
        btn.classList.replace('bg-amber-50', 'bg-slate-100'); btn.classList.replace('text-amber-600', 'text-slate-600');
        hint.classList.add('hidden');
    }
    window.applyVisualFilters();
}

function calculatePath(start, end) {
    let adj = {};
    appState.db.nodes.forEach(n => adj[n.id] = []);
    appState.db.links.forEach(l => {
        let s = typeof l.source === 'object' ? l.source.id : l.source;
        let t = typeof l.target === 'object' ? l.target.id : l.target;
        if (adj[s] && adj[t]) {
            adj[s].push(t); adj[t].push(s);
        }
    });
    let q = [[start.id]], visited = new Set([start.id]);
    while (q.length > 0) {
        let path = q.shift(), curr = path[path.length - 1];
        if (curr === end.id) return path;
        for (let neighbor of adj[curr] || []) {
            if (!visited.has(neighbor)) { visited.add(neighbor); q.push([...path, neighbor]); }
        }
    }
    return null;
}

function handleBackgroundClick() {
    if (window.mergeState && window.mergeState.active) window.cancelMergeMode();
    if (window.relinkState && window.relinkState.active) window.cancelRelinkMode();
    if (linkingState.active) { linkingState.active = false; document.getElementById('mode-hint').classList.add('hidden'); }

    // PATHFINDER: il click sullo sfondo NON resetta più la selezione (era troppo
    // distruttivo quando l'utente sbaglia di pochi pixel). Per uscire, ri-cliccare il
    // bottone PATH oppure selezionare un altro nodo come sorgente.
    if (pathfinderActive) {
        hideContextMenu();
        return; // niente reset selezione, niente clear node-details
    }

    currentNode = null;
    g.selectAll(".node-group, .link-group").classed("dimmed", false).classed("highlighted", false);
    document.getElementById('node-details').innerHTML = `<div class="text-center text-slate-400 mt-12"><i data-lucide="scan-search" class="mx-auto h-12 w-12 mb-4"></i><h2 class="text-md font-bold">Nessun nodo selezionato</h2></div>`;
    window.safeCreateIcons();
    hideContextMenu();
}

/* ==========================================
   UI.JS - Interfaccia Utente e Sidebar
   ========================================== */

let loadingInterval = null;
let loadingSeconds = 0;
window.loadingMessagesConfig = {
    default: [
        "MappAI sta leggendo i tuoi documenti...",
        "Analisi semantica profonda...",
        "Estrazione concetti chiave...",
        "Costruzione relazioni topologiche...",
        "Ottimizzazione del grafo...",
        "Mappatura nessi logici complessi...",
        "Rifinitura descrizioni enciclopediche...",
        "Ancora un attimo, sto collegando i puntini..."
    ],
    mindmap: [
        "MappAI sta leggendo i tuoi documenti...",
        "Individuazione dei concetti centrali...",
        "Strutturazione gerarchica delle idee...",
        "Diramazione dei sotto-argomenti...",
        "Sintesi dei concetti chiave...",
        "Costruzione della mappa mentale...",
        "Ancora un attimo, sto collegando i rami..."
    ],
    kg: [
        "MappAI sta leggendo i tuoi documenti...",
        "Estrazione profonda delle entità...",
        "Analisi delle relazioni logiche...",
        "Costruzione della rete semantica...",
        "Risoluzione delle entità duplicate...",
        "Ottimizzazione del Knowledge Graph...",
        "Ancora un attimo, sto collegando i nodi..."
    ],
    quiz: [
        "Analisi del materiale di studio...",
        "Selezione dei concetti da testare...",
        "Formulazione delle domande...",
        "Generazione dei distrattori logici...",
        "Verifica delle risposte corrette...",
        "Impaginazione del quiz interattivo...",
        "Ancora un attimo, preparo la sfida..."
    ],
    flashcard: [
        "Analisi del materiale di studio...",
        "Identificazione delle nozioni chiave...",
        "Sintesi per il fronte della carta...",
        "Elaborazione della spiegazione estesa...",
        "Costruzione del mazzo di flashcard...",
        "Impaginazione interattiva...",
        "Ancora un attimo, le carte sono quasi pronte..."
    ]
};

window.currentLoadingMode = 'default';

window.showLoadingOverlay = function (show, text, mode = 'default') {
    const el = document.getElementById('loading-overlay');
    const desc = document.getElementById('loading-desc');
    const title = document.getElementById('loading-title');
    const a11yBtn = document.getElementById('a11y-panel-toggle');

    if (show) {
        window.currentLoadingMode = mode;
        el.classList.add('visible');
        if (a11yBtn) a11yBtn.classList.add('hidden');
        if (text) desc.textContent = text;

        if (!loadingInterval) {
            loadingSeconds = 0;
            let msgIdx = 0;
            loadingInterval = setInterval(() => {
                loadingSeconds++;
                if (loadingSeconds % 4 === 0) {
                    const messages = window.loadingMessagesConfig[window.currentLoadingMode] || window.loadingMessagesConfig['default'];
                    msgIdx = (msgIdx + 1) % messages.length;
                    desc.textContent = messages[msgIdx];
                }
                title.textContent = `MappAI sta lavorando... (${loadingSeconds}s)`;
            }, 1000);
        }
    } else {
        el.classList.remove('visible');
        if (a11yBtn) a11yBtn.classList.remove('hidden');
        if (loadingInterval) {
            clearInterval(loadingInterval);
            loadingInterval = null;
        }
        if (title) title.textContent = "MappAI sta lavorando...";
    }
};

window.startEditingTitle = function () {
    const currentTitle = appState.rootNodeLabel || 'Mappa Senza Nome';

    window.showPrompt("Modifica nome del progetto:", currentTitle, (newTitle) => {
        if (newTitle && newTitle !== currentTitle) {
            appState.rootNodeLabel = newTitle;

            // Ripristina/Aggiorna l'HTML del contenitore
            const container = document.getElementById('project-title-container');
            if (container) {
                container.innerHTML = `
                    <p class="text-slate-500 text-[10px] font-mono uppercase tracking-wider break-words flex-grow" id="sidebar-subtitle" style="line-height: 1.4;">
                        Progetto: ${appState.rootNodeLabel}</p>
                    <div class="opacity-0 group-hover:opacity-100 transition-opacity text-indigo-400 p-0.5 mt-0.5 shrink-0 bg-indigo-50 rounded">
                        <i data-lucide="edit-3" class="w-3 h-3"></i>
                    </div>
                `;
                if (window.safeCreateIcons) window.safeCreateIcons();
            }

            // Aggiorna il nodo radice se in modalità mappa mentale
            if (appState.extractionMode === 'mindmap' && appState.db.nodes.length > 0) {
                const rootNode = appState.db.nodes.find(n => n.id === 'root');
                if (rootNode) {
                    rootNode.label = appState.rootNodeLabel;
                    if (window.updateVisualization) window.updateVisualization();
                    if (window.renderTreeView) window.renderTreeView();
                }
            }

            // Forza il salvataggio del progetto con il nuovo nome nel LocalStorage e nel Vault
            if (window.StorageManager && typeof window.StorageManager.saveCurrentProject === 'function') {
                window.StorageManager.saveCurrentProject();
            }

            window.showToast("Titolo aggiornato e salvato", "success");
        }
    }, "Inserisci il nuovo nome da assegnare al progetto:");
};

window.switchToMapLayout = function () {
    document.getElementById('landing-view').style.display = 'none';
    const mapView = document.getElementById('map-view');
    mapView.classList.add('active');
    const subtitleEl = document.getElementById('sidebar-subtitle');
    if (subtitleEl) subtitleEl.innerText = `${appState.rootNodeLabel || 'Mappa Senza Nome'}`;

    // Nascondi la barra dei progetti recenti quando si entra nella mappa
    const projectsBar = document.getElementById('projects-bar');
    if (projectsBar) {
        projectsBar.classList.add('hidden');
    }
    if (window.toggleProjectsBar) {
        window.toggleProjectsBar(false); // false = forza la chiusura
    }

    const levelControl = document.getElementById('level-filter-control');
    const minLinkControl = document.getElementById('min-link-control');
    const sliderDivider = document.getElementById('dynamic-slider-divider');

    if (appState.extractionMode === 'mindmap') {
        if (levelControl) levelControl.classList.remove('hidden');
        if (minLinkControl) minLinkControl.classList.add('hidden');
        if (sliderDivider) sliderDivider.classList.remove('hidden');
        // Reset slider a L5 di default
        const ls = document.getElementById('level-slider');
        const lv = document.getElementById('level-slider-val');
        if (ls) { ls.value = 5; }
        if (lv) { lv.textContent = 'L5'; }
    } else {
        if (levelControl) levelControl.classList.add('hidden');
        if (minLinkControl) minLinkControl.classList.remove('hidden');
        if (sliderDivider) sliderDivider.classList.remove('hidden');
    }
    if (window.applyTextZoom) window.applyTextZoom(currentZoomIdx);
}

window.backToLanding = function () {
    StorageManager.saveCurrentProject();
    window.location.reload();
}

// toggleSidebar moved to index.html for smoother animation integration

window.zoomToNode = function (nodeId) {
    const node = appState.db.nodes.find(n => n.id === nodeId);
    if (node) {
        // Pass a mock event object because handleNodeClick expects it
        window.handleNodeClick({ stopPropagation: () => { } }, node);
    }
};

window.ignoreNextNodeClick = false;

window.handleNodeClick = function (event, d, preventZoom = false, preventModal = false) {
    if (window.ignoreNextNodeClick) {
        window.ignoreNextNodeClick = false;
        return;
    }
    try {
        if (event && event.stopPropagation) event.stopPropagation();
        hideContextMenu();

        // Studio attivo: se una sessione è in corso consuma il click qui
        if (window.ActiveStudy && window.ActiveStudy.session && window.ActiveStudy.session.active) {
            if (window.ActiveStudy.handleNodeClick(d)) return;
        }

        if (window.mergeState && window.mergeState.active) {
            window.handleMergeTargetClick(d);
            return;
        }
        if (window.relinkState && window.relinkState.active) {
            window.handleRelinkTargetClick(d);
            return;
        }

        if (linkingState.active) {
            if (linkingState.sourceNode.id !== d.id) {
                window.showLinkFamilyPrompt(cleanLabel(linkingState.sourceNode.label), cleanLabel(d.label), (rel, bidir) => {
                    if (rel) {
                        const link = { source: linkingState.sourceNode.id, target: d.id, rel: rel };
                        if (bidir) link.bidirectional = true;
                        appState.db.links.push(link);
                        window.updateDegreeStats(); renderGraph();
                    }
                });
            }
            linkingState.active = false;
            document.getElementById('mode-hint').classList.add('hidden');
            return;
        }

        if (pathfinderActive) {
            const hint = document.getElementById('mode-hint');
            if (!pathfinderState.source) {
                pathfinderState.source = d; hint.innerText = `PATHFINDER: Da "${cleanLabel(d.label)}" a...? Clicca Destinazione`;
            } else {
                pathfinderState.target = d; hint.innerText = `Percorso: ${cleanLabel(pathfinderState.source.label)} ➔ ${cleanLabel(d.label)}`;
            }
            window.applyVisualFilters();
            return;
        }

        // ── Multi-selezione: SHIFT = aggiungi/toggle, CTRL/CMD = rimuovi ──
        if (event && d && window.MappAIMultiSelect &&
            (event.shiftKey || event.ctrlKey || event.metaKey)) {
            window.MappAIMultiSelect.toggleNode(d, event);
            return;
        }
        // Clic semplice su nodo: svuota multi-selezione se attiva
        if (window.MappAIMultiSelect && window.MappAIMultiSelect.count() > 0) {
            window.MappAIMultiSelect.clearSelection();
        }

        currentNode = d;

        if (!preventZoom) {
            const linked = new Set([d.id]);
            appState.db.links.forEach(l => {
                let s = typeof l.source === 'object' ? l.source.id : l.source;
                let t = typeof l.target === 'object' ? l.target.id : l.target;
                if (s === d.id) linked.add(t); if (t === d.id) linked.add(s);
            });

            g.selectAll(".node-group").classed("dimmed", n => !linked.has(n.id)).classed("highlighted", n => linked.has(n.id));
            g.selectAll(".link-group").classed("dimmed", l => {
                let sid = typeof l.source === 'object' ? l.source.id : l.source;
                let tid = typeof l.target === 'object' ? l.target.id : l.target;
                return sid !== d.id && tid !== d.id;
            });

            if (d.x !== undefined && d.y !== undefined && !isNaN(d.x) && !isNaN(d.y) && typeof svg !== 'undefined' && svg) {
                try {
                    svg.transition().duration(750).call(zoom.transform, d3.zoomIdentity.translate(-d.x * 1.5, -d.y * 1.5 + 120).scale(1.5));
                } catch (e) { console.warn("Zoom error:", e); }
            }
        }

        let imgHtml = d.image ? `<img src="${d.image}" class="w-full rounded-lg mb-4 border border-slate-200 cursor-pointer" onclick="window.openLightbox('${d.image}')" onerror="this.style.display='none'">` : '';

        let statusChip = '';
        if (d.studyStatus === 'done') statusChip = `<span class="bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2 py-0.5 rounded ml-2 border border-emerald-300">IMPARATO</span>`;
        if (d.studyStatus === 'review') statusChip = `<span class="bg-amber-100 text-amber-800 text-[10px] font-bold px-2 py-0.5 rounded ml-2 border border-amber-300">RIPASSO</span>`;
        if (d.studyStatus === 'todo') statusChip = `<span class="bg-red-100 text-red-800 text-[10px] font-bold px-2 py-0.5 rounded ml-2 border border-red-300">DA STUDIARE</span>`;

        const inheritedNotes = window.getInheritedDatabase ? window.getInheritedDatabase(d.id) : [];

        const html = `
                <div class="animate-fade-in">
                    <div class="flex items-center mb-1">
                        <span class="text-xs font-bold text-indigo-400 uppercase">Livello ${d.level}</span>
                        ${statusChip}
                    </div>
                    <h2 class="text-xl font-bold text-slate-800 mb-4">${cleanLabel(d.label)}</h2>
                    ${imgHtml}
                    
                    <!-- Multiple Images in Details -->
                    ${(d.images && d.images.length > 1) ? `
                        <div class="grid grid-cols-2 gap-2 mb-4">
                            ${d.images.slice(1).map(img => `
                                <img src="${img}" class="w-full h-32 object-cover rounded-lg border border-slate-200 cursor-pointer" onclick="window.openLightbox('${img}')" onerror="this.style.display='none'">
                            `).join('')}
                        </div>
                    ` : ''}

                    <div class="p-4 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-700 leading-relaxed mb-6 whitespace-pre-wrap">${cleanLabel(d.desc || d.content) || "Nessuna descrizione."}</div>
                    
                    <!-- Links in Details -->
                    ${(d.urls && d.urls.length > 0) || d.url ? `
                        <div class="space-y-2 mb-6">
                            ${(d.urls || (d.url ? [d.url] : [])).map(u => {
            const isLocal = u.startsWith('file://');
            const displayUrl = u.length > 40 ? u.substring(0, 40) + "..." : u;
            return `
                                    <span class="flex items-center gap-2 px-3 py-2 bg-slate-100 border border-slate-200 rounded-lg hover:bg-slate-200 transition-colors cursor-pointer text-xs text-indigo-600 font-bold shadow-sm" onclick="window.openCustomLink('${u.replace(/'/g, "\\'")}')">
                                        <i data-lucide="${isLocal ? 'database' : 'link'}" class="w-3.5 h-3.5"></i> ${isLocal ? 'File' : 'Link'}: <span class="font-normal underline ml-1">${displayUrl}</span>
                                    </span>
                                `;
        }).join('')}
                        </div>
                    ` : ''}

                    ${inheritedNotes.length > 0 ? `
                        <button onclick="window.openSourceModal('${d.id.replace(/'/g, "\\'")}')" class="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold p-3 rounded-lg flex justify-between items-center transition mb-6 border border-slate-300">
                            <span class="flex items-center gap-2"><i data-lucide="library" class="w-4 h-4 text-indigo-500"></i> Fonti e Note Approfondite</span>
                            <span class="bg-indigo-100 text-indigo-800 text-xs px-2 py-1 rounded-full">${inheritedNotes.length}</span>
                        </button>
                    ` : ''}
                    
                    <!-- AI QUIZ -->
                    ${!appState.studentMode ? `
                    <div class="pt-4 border-t border-slate-200 space-y-4">
                        <button onclick="window.generateAIQuiz()" class="w-full bg-emerald-600 text-white font-bold p-2.5 rounded-lg shadow-md hover:bg-emerald-700 flex justify-center items-center gap-2 transition">
                            <i data-lucide="brain-circuit" class="w-5 h-5"></i> Mettiti alla prova (Genera Quiz)
                        </button>
                    </div>
                    ` : ''}
            </div>
            `;
        document.getElementById('node-details').innerHTML = html;
        window.safeCreateIcons();

        // Apriamo automaticamente il modale delle fonti come richiesto (stile mappatura_tutor)
        if (!preventModal) {
            window.openSourceModal(d.id);
        }
    } catch (e) {
        const errDiv = document.createElement('div');
        errDiv.style = "position:fixed; top:50px; left:50px; background:red; color:white; z-index:99999; padding:20px; font-size: 20px; max-width:80%; word-wrap: break-word;";
        errDiv.innerText = "ERRORE handleNodeClick: " + e.message + "\\n" + e.stack;
        document.body.appendChild(errDiv);
        console.error(e);
    }
}

window.simulateNodeClick = function (nodeId) {
    const d = appState.db.nodes.find(n => n.id === nodeId);
    if (d) window.handleNodeClick({ stopPropagation: () => { } }, d);
}

window.openSourceModal = function (nodeId) {
    try {
        const d = appState.db.nodes.find(n => n.id === nodeId);
        if (!d) return;

        const color = (appState.db.customColors && appState.db.customColors[d.group])
            ? appState.db.customColors[d.group]
            : (colorScale[d.group] || colorScale[d.level] || colorScale[0]);
        const sourceModal = document.getElementById('source-modal');
        const sourceModalBox = document.getElementById('source-modal-content-box');
        const sourceModalHeader = document.getElementById('source-modal-header');
        const sourceModalTitle = document.getElementById('source-modal-title');
        const sourceModalSubtitle = document.getElementById('source-modal-subtitle');
        const sourceModalBody = document.getElementById('source-modal-body');
        const sourceModalKinship = document.getElementById('source-modal-kinship');

        if (!sourceModal) return;
        sourceModal.classList.remove('hidden');
        sourceModal.classList.add('flex');

        editTarget = d; // Set edit target for Tutor AI

        sourceModalKinship.classList.add('hidden');
        sourceModalKinship.innerHTML = '';

        isHyphenated = false;
        originalModalHtml = "";
        const hypBtn = document.getElementById('btn-hyphenation');
        if (hypBtn) hypBtn.classList.remove('bg-indigo-100');
        if (sourceModalBody) sourceModalBody.classList.remove('hyphens-auto-force');
        // Removed window.resetA11yTools() to maintain zoom state

        let pPath = [];
        let current = d;
        let visited = new Set([d.id]);
        while (current.level > 1) {
            const parentLink = appState.db.links.find(l => {
                let tid = typeof l.target === 'object' ? l.target.id : l.target;
                return tid === current.id && !l.isCross;
            });
            if (parentLink) {
                let sid = typeof parentLink.source === 'object' ? parentLink.source.id : parentLink.source;
                if (visited.has(sid)) break;
                visited.add(sid);
                const parentNode = appState.db.nodes.find(n => n.id === sid);
                if (parentNode) {
                    pPath.unshift(`<span class="opacity-60">L${parentNode.level}:</span> ${cleanLabel(parentNode.label)}`);
                    current = parentNode;
                } else break;
            } else break;
        }

        if (pPath.length > 0) {
            sourceModalKinship.innerHTML = pPath.join(' <span class="mx-2">></span> ');
            sourceModalKinship.classList.remove('hidden');
        }

        sourceModalBox.style.border = "none";
        sourceModalHeader.style.backgroundColor = "transparent";
        sourceModalHeader.style.color = "inherit";
        sourceModalTitle.style.fontWeight = "normal";

        if (d.level === 0 || d.level === 1) {
            sourceModalHeader.style.backgroundColor = color;
            sourceModalHeader.style.color = "#ffffff";
            sourceModalTitle.style.fontWeight = "bold";
        } else if (d.level === 2) {
            sourceModalHeader.style.backgroundColor = color;
            sourceModalHeader.style.color = "#ffffff";
            sourceModalTitle.style.fontWeight = "normal";
        } else if (d.level === 3) {
            sourceModalHeader.style.backgroundColor = "#ffffff";
            sourceModalHeader.style.color = color;
            sourceModalTitle.style.fontWeight = "bold";
            sourceModalBox.style.border = `3px solid ${color}`;
        } else if (d.level >= 4) {
            sourceModalHeader.style.backgroundColor = "#ffffff";
            sourceModalHeader.style.color = color;
            sourceModalTitle.style.fontWeight = "normal";
            sourceModalBox.style.border = `2.1px solid ${color}`;
        }

        sourceModalTitle.textContent = cleanLabel(d.label);
        sourceModalSubtitle.textContent = `Scheda Focus - Livello ${d.level}`;

        let descStr = cleanLabel(d.desc || d.content) || "Nessuna descrizione.";
        descStr = descStr.replace(/\n/g, '<br>');
        descStr = window.highlightQuery ? window.highlightQuery(descStr, appState.searchQuery) : descStr;
        let html = `<p class="text-slate-800 desc-text rich-desc mb-6 leading-relaxed">${descStr}</p>`;

        const urls = d.urls || (d.url ? [d.url] : []);
        if (urls.length > 0) {
            html += `<div class="space-y-2 mb-6">`;
            urls.forEach(u => {
                const isLocal = u.startsWith('file://');
                let displayUrl = u;
                if (isLocal) {
                    displayUrl = displayUrl.split(/[/\\]/).pop();
                    try { displayUrl = decodeURIComponent(displayUrl); } catch (e) { }
                } else if (displayUrl.length > 60) {
                    displayUrl = displayUrl.substring(0, 60) + "...";
                }
                const icon = isLocal ? 'database' : 'link';
                const label = isLocal ? 'File Locale' : 'Collegamento Esterno';
                html += `
                        <span class="flex items-center gap-2 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer text-sm text-indigo-600 font-bold shadow-sm" onclick="window.openCustomLink('${u.replace(/'/g, "\\'")}')">
                            <i data-lucide="${icon}" class="w-4 h-4"></i> ${label}: <span class="font-normal underline">${displayUrl}</span>
                        </span>
                    `;
            });
            html += `</div>`;
        }

        const imgs = d.images || (d.image ? [d.image] : []);
        if (imgs.length > 0) {
            html += `<div class="grid grid-cols-2 gap-4 mb-6">`;
            imgs.forEach(img => {
                html += `<img src="${img}" class="w-full rounded-lg border border-slate-200 cursor-pointer shadow-sm hover:shadow-md transition-shadow" onclick="window.openLightbox('${img}')" onerror="this.style.display='none'">`;
            });
            html += `</div>`;
        }

        let inheritedNotes = window.getInheritedDatabase ? window.getInheritedDatabase(d.id) : [];
        const q = appState.searchQuery;
        if (q) {
            // Ordiniamo le note mettendo prima quelle che contengono la keyword cercata
            inheritedNotes.sort((a, b) => {
                const matchA = (a.text + (a.title || "") + (a.source || "")).toLowerCase().includes(q);
                const matchB = (b.text + (b.title || "") + (b.source || "")).toLowerCase().includes(q);
                return matchB - matchA;
            });
        }

        if (inheritedNotes.length > 0) {
            html += `<div class="mt-8 border-t border-slate-200 pt-6">
                            <div class="flex justify-between items-center mb-4 cursor-pointer" onclick="document.getElementById('sources-list-container').classList.toggle('hidden'); const icon = document.getElementById('sources-toggle-icon'); if(icon.getAttribute('data-lucide')==='chevron-down'){icon.setAttribute('data-lucide', 'chevron-up');}else{icon.setAttribute('data-lucide', 'chevron-down');} window.safeCreateIcons();">
                                <h4 class="font-bold text-slate-400 uppercase tracking-wider text-xs flex items-center gap-2">
                                    <i data-lucide="library" class="w-4 h-4"></i> Fonti e Note Approfondite (${inheritedNotes.length})
                                </h4>
                                <button class="p-1 rounded-md hover:bg-slate-100 transition-colors text-slate-400">
                                    <i data-lucide="chevron-down" id="sources-toggle-icon" class="w-4 h-4"></i>
                                </button>
                            </div>
                            <div id="sources-list-container" class="${q ? '' : 'hidden'}">`;

            inheritedNotes.forEach((db, idx) => {
                let sourceText = db.source ? db.source : "Documento";
                let titleText = db.title ? db.title : "Estratto Fonte";
                const isMatch = q && (db.text + titleText + sourceText).toLowerCase().includes(q);

                if (window.highlightQuery && q) {
                    sourceText = window.highlightQuery(sourceText, q);
                    titleText = window.highlightQuery(titleText, q);
                    db.text = window.highlightQuery(db.text, q);
                }

                html += `
                        <div class="note-entry bg-slate-50 border ${isMatch ? 'border-indigo-300 ring-2 ring-indigo-50 bg-indigo-50/30' : 'border-slate-200'} rounded-lg p-4 mb-3 shadow-sm hover:shadow transition-shadow flex items-start gap-3">
                            <div class="flex-shrink-0 ${isMatch ? 'bg-indigo-600 text-white' : 'bg-indigo-100 text-indigo-700'} font-bold rounded-full w-6 h-6 flex items-center justify-center text-xs mt-0.5">${idx + 1}</div>
                            <div class="flex-grow">
                                <p class="text-[11px] font-bold text-slate-500 mb-2 uppercase tracking-wider border-b border-slate-200 pb-1 flex justify-between items-center">
                                    <span><i data-lucide="link" class="w-3 h-3 inline text-indigo-500"></i> ${titleText} <span class="mx-1 text-slate-300">|</span> <span class="font-normal text-indigo-500 hover:underline cursor-pointer lowercase">${sourceText}</span></span>
                                </p>
                                <p class="text-slate-700 note-text rich-desc italic">"${db.text}"</p>
                            </div>
                        </div>`;
            });
            html += `</div></div>`;
        }

        // --- SEZIONE TUTOR AI ---
        if (!appState.studentMode) {
            html += `
            <div class="mt-8 border-t border-slate-200 pt-6">
                <div class="flex justify-between items-center cursor-pointer mb-2 group" onclick="document.getElementById('node-tutor-container').classList.toggle('hidden'); document.getElementById('node-tutor-chevron').classList.toggle('rotate-180')">
                    <label class="text-xs font-bold text-indigo-600 uppercase flex items-center gap-2 cursor-pointer group-hover:text-indigo-800 transition flex-grow">
                        <i data-lucide="bot" class="w-4 h-4"></i> Tutor AI del Nodo
                    </label>
                    <div class="flex items-center gap-3">
                        <button onclick="event.stopPropagation(); window.resetNodeTutor()" class="text-slate-400 hover:text-red-500 transition" title="Resetta Chat">
                            <i data-lucide="rotate-ccw" class="w-3.5 h-3.5"></i>
                        </button>
                        <i data-lucide="chevron-down" id="node-tutor-chevron" class="w-4 h-4 text-slate-400 transition-transform duration-200"></i>
                    </div>
                </div>
                <div id="node-tutor-container" class="hidden flex-col gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200 mt-2">
                    <div id="node-tutor-start" class="flex flex-col items-center justify-center py-4">
                        <p class="text-xs text-slate-500 font-medium mb-3 text-center">Avvia il tutor contestuale per esplorare o testare la tua conoscenza su questo nodo.</p>
                        <button onclick="window.startNodeTutor()" class="px-4 py-2 bg-indigo-100 text-indigo-700 font-bold text-xs rounded-lg hover:bg-indigo-200 transition-colors flex items-center gap-2 shadow-sm">
                            <i data-lucide="play-circle" class="w-4 h-4"></i> Avvia Sessione
                        </button>
                    </div>
                    <div id="node-tutor-chat-area" class="hidden flex-col h-[450px]">
                        <div id="node-tutor-chat-history" class="flex-grow overflow-y-auto modal-scroll pr-2 flex flex-col gap-2 mb-3"></div>
                        <div class="flex gap-2 mt-auto">
                            <input type="text" id="node-tutor-input" placeholder="Rispondi al tutor..." class="flex-grow border border-slate-300 rounded-lg p-2 text-xs outline-none focus:ring-2 focus:ring-indigo-500" onkeypress="if(event.key === 'Enter') window.sendNodeTutorMessage()">
                            <button onclick="window.sendNodeTutorMessage()" id="btn-node-tutor-send" class="px-3 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition flex items-center justify-center">
                                <i data-lucide="send" class="w-3.5 h-3.5"></i>
                            </button>
                        </div>
                    </div>
                </div>
            </div>`;
        }

        sourceModalBody.innerHTML = html;
        window.safeCreateIcons();

        const a11yToolbar = document.getElementById('modal-a11y-toolbar');
        if (a11yToolbar) {
            if (document.body.classList.contains('font-dyslexic')) {
                a11yToolbar.classList.remove('hidden');
            } else {
                a11yToolbar.classList.add('hidden');
            }
        }

        setTimeout(() => {
            sourceModal.classList.remove('opacity-0');
            sourceModalBox.classList.remove('scale-95');
            sourceModalBox.classList.add('scale-100');

            // Auto-scroll alla prima nota che matcha
            if (q) {
                const firstMatch = sourceModalBody.querySelector('.ring-indigo-50');
                if (firstMatch) firstMatch.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }, 10);
    } catch (e) {
        const errDiv = document.createElement('div');
        errDiv.style = "position:fixed; bottom:50px; left:50px; background:darkred; color:white; z-index:99999; padding:20px; font-size: 20px; max-width:80%; word-wrap: break-word;";
        errDiv.innerText = "ERRORE openSourceModal: " + e.message + "\\n" + e.stack;
        document.body.appendChild(errDiv);
        console.error(e);
    }
}

window.openCustomLink = function (url) {
    if (!url) return;
    try {
        if (window.electronAPI && window.electronAPI.openExternal) {
            window.electronAPI.openExternal(url);
        } else {
            window.open(url, '_blank');
        }
    } catch (e) {
        console.error("Errore apertura link", e);
        window.open(url, '_blank');
    }
};

window.closeSourceModal = function () {
    const sourceModal = document.getElementById('source-modal');
    const sourceModalBox = document.getElementById('source-modal-content-box');
    if (!sourceModal) return;
    sourceModal.classList.add('opacity-0');
    sourceModalBox.classList.remove('scale-100');
    sourceModalBox.classList.add('scale-95');
    setTimeout(() => { sourceModal.classList.add('hidden'); sourceModal.classList.remove('flex'); }, 300);
}

document.addEventListener('click', (e) => {
    const sourceModal = document.getElementById('source-modal');
    if (sourceModal && !sourceModal.classList.contains('hidden') && e.target === sourceModal) {
        window.closeSourceModal();
    }
});

window.resetZoom = function () {
    if (!svg || !zoom) return;
    svg.transition().duration(750).call(zoom.transform, d3.zoomIdentity);
};

window.updateStep4Display = function () {
    const isMindmap = (document.getElementById('extraction-mode')?.value || 'mindmap') === 'mindmap';
    const autoGenerateL1 = document.getElementById('l1-auto-generate-toggle')?.checked ?? true;
    const lang = window.currentLanguage || 'it';
    const t = (lang === 'en' ? (typeof en_translations !== 'undefined' ? en_translations : {}) : (typeof it_translations !== 'undefined' ? it_translations : {}));

    const descMM = document.getElementById('label-step4-desc');
    const descKG = document.getElementById('label-step4-kg-desc');

    if (isMindmap) {
        if (descMM) {
            descMM.innerText = autoGenerateL1 ?
                (t.step_density_desc || "I rami L1-L2-L3 verranno generati sempre. Scegli quanti rami generare nei livelli più profondi (0 = si ferma a L3).") :
                (t.step_density_desc_manual_l1 || "I rami L2-L3 verranno generati sempre (L1 definiti da te). Scegli quanti rami generare nei livelli più profondi (0 = si ferma a L3).");
        }
    } else {
        if (descKG) {
            descKG.innerText = autoGenerateL1 ?
                (t.step_kg_density_desc || "Scegli quanti nodi concettuali generare all'interno del grafo relazionale (consigliato 15-25 per grafi ordinati, fino a 30+ per grafi completi).") :
                (t.step_kg_density_desc_manual_l1 || "Scegli quanti nodi concettuali generare all'interno del grafo relazionale (consigliato 15-25 per grafi ordinati, fino a 30+ per grafi completi) a partire dai Super-Hub definiti da te.");
        }
    }
};

window.setMode = function (mode) {
    const btnMindmap = document.getElementById('mode-mindmap');
    const btnKG = document.getElementById('mode-kg');
    const containerDensity = document.getElementById('step-density-container');
    const containerKGDensity = document.getElementById('step-kg-density-container');
    const containerRoot = document.getElementById('step-root-container');
    const modeInput = document.getElementById('extraction-mode');

    const l1Title = document.getElementById('step-l1-title');
    const l1Desc = document.getElementById('step-l1-desc');
    const l1BtnText = document.getElementById('btn-add-l1-text');
    const l1AutoLabel = document.getElementById('label-auto-l1');
    const l1Inputs = document.querySelectorAll('.l1-topic-input');

    modeInput.value = mode;

    if (mode === 'mindmap') {
        btnMindmap.classList.add('active');
        btnKG.classList.remove('active');
        if (containerDensity) { containerDensity.classList.remove('hidden'); containerDensity.style.display = ''; }
        if (containerKGDensity) { containerKGDensity.classList.add('hidden'); containerKGDensity.style.display = 'none'; }
        if (containerRoot) { containerRoot.classList.remove('hidden'); containerRoot.style.display = ''; }

        if (l1Title) l1Title.innerText = "Caricamento Fonti";
        if (l1Desc) l1Desc.innerText = "Inserisci le macro-aree tematiche che ti interessano:";
        if (l1BtnText) l1BtnText.innerText = "Nuova macro-area";
        if (l1AutoLabel) l1AutoLabel.innerText = "Genera altre macro-aree in automatico";
        l1Inputs.forEach(i => i.placeholder = "Es. Cause, Conseguenze...");
    } else {
        btnMindmap.classList.remove('active');
        btnKG.classList.add('active');
        if (containerDensity) { containerDensity.classList.add('hidden'); containerDensity.style.display = 'none'; }
        if (containerKGDensity) { containerKGDensity.classList.remove('hidden'); containerKGDensity.style.display = ''; }
        if (containerRoot) { containerRoot.classList.add('hidden'); containerRoot.style.display = 'none'; }

        if (l1Title) l1Title.innerText = "Caricamento Fonti";
        if (l1Desc) l1Desc.innerText = "Definisci i concetti chiave attorno a cui costruire le relazioni:";
        if (l1BtnText) l1BtnText.innerText = "Aggiungi hub tematico";
        if (l1AutoLabel) l1AutoLabel.innerText = "Genera altri hub tematici in automatico";
        l1Inputs.forEach(i => i.placeholder = "Es. Trattative, Eredità...");
    }

    const btnGenerateLabel = document.getElementById('btn-generate-label');
    if (btnGenerateLabel) {
        const lang = window.currentLanguage || 'it';
        const t = (lang === 'en' ? (typeof en_translations !== 'undefined' ? en_translations : {}) : (typeof it_translations !== 'undefined' ? it_translations : {}));
        btnGenerateLabel.innerText = mode === 'mindmap' ? t.new_map_btn : t.new_kg_btn;
    }

    window.updateStep4Display();
    if (window.updateTokenCostEstimator) window.updateTokenCostEstimator();

    // Auto-selezione modello per Infomaniak: solo se il modello corrente è Apertus (non supporta KG)
    if (appState.aiProvider === 'infomaniak' && mode === 'kg') {
        const selectEl = document.getElementById('model-select');
        if (selectEl && selectEl.options.length > 0 && selectEl.value.toLowerCase().includes('apertus')) {
            const options = [...selectEl.options].map(o => o.value.toLowerCase());
            const preferred = ['gemma-4', 'gemma4', 'qwen', 'kimi'];
            let bestIdx = -1;
            for (const keyword of preferred) {
                bestIdx = options.findIndex(v => v.includes(keyword));
                if (bestIdx !== -1) break;
            }
            if (bestIdx === -1) bestIdx = options.findIndex(v => !v.includes('apertus'));

            if (bestIdx !== -1) {
                const previousModel = selectEl.value;
                selectEl.value = selectEl.options[bestIdx].value;
                localStorage.setItem('infomaniak_selected_model', selectEl.value);
                if (typeof updateModelCapabilities === 'function') updateModelCapabilities();
                window.showToast(`Apertus non supporta KG — cambiato a ${selectEl.options[bestIdx].text}`, 'info');
                console.info(`[MappAI] Auto-selezione modello KG (Apertus→altro): ${previousModel} → ${selectEl.value}`);
            }
        }
    }
}



window.toggleDyslexicFont = function () {
    let isDyslexicFont = document.body.classList.contains('font-dyslexic');
    const a11yButtons = document.querySelectorAll('#modal-a11y-toolbar button');

    if (!isDyslexicFont) {
        document.body.classList.add('font-dyslexic');
        document.documentElement.classList.add('font-dyslexic');
        window.applyDirectZoom(1.5);

        // Hide non-essential buttons in Dyslexic mode
        a11yButtons.forEach(btn => {
            if (btn.id !== 'btn-modal-ruler' && btn.getAttribute('title') !== 'Leggi ad alta voce') {
                btn.style.display = 'none';
            }
        });
        const separator = document.querySelector('#modal-a11y-toolbar .w-px');
        if (separator) separator.style.display = 'none';

    } else {
        document.body.classList.remove('font-dyslexic');
        document.documentElement.classList.remove('font-dyslexic');
        window.applyDirectZoom(1.0);

        // Show all buttons back
        a11yButtons.forEach(btn => {
            btn.style.display = '';
        });
        const separator = document.querySelector('#modal-a11y-toolbar .w-px');
        if (separator) separator.style.display = '';
    }
}

// Helper per applicare lo zoom programmaticamente senza ciclarlo
window.applyDirectZoom = function (z) {
    const btnModal = document.getElementById('btn-text-zoom-modal');
    const btnPanel = document.getElementById('btn-text-zoom-panel');

    const label = `Testo x${(z === 1.0 ? '1' : z)}`;

    if (btnModal) btnModal.innerHTML = `<i data-lucide="zoom-in" class="w-6 h-6"></i>`;
    if (btnPanel) btnPanel.innerHTML = `<i data-lucide="zoom-in" class="w-4 h-4"></i> ${label}`;

    document.documentElement.style.setProperty('--app-zoom', z);

    if (z > 1.0) {
        document.body.classList.add('a11y-zoomed-modals');
    } else {
        document.body.classList.remove('a11y-zoomed-modals');
    }

    document.body.classList.remove('a11y-zoom-x1', 'a11y-zoom-x15', 'a11y-zoom-x2');
    if (z === 1.0) {
        document.body.classList.add('a11y-zoom-x1');
    } else if (z === 1.5) {
        document.body.classList.add('a11y-zoom-x15');
    } else if (z === 2.0) {
        document.body.classList.add('a11y-zoom-x2');
    }

    // Zoom per tutti i contenitori primari e modali con testo
    const zoomSelectors = [
        '#sidebar',
        '#source-modal-content-box',
        '#ai-modal-content-box',
        '#study-player-modal > div',
        '#quiz-modal-content',
        '#app-guide-modal > div',
        '#app-tutorial-modal > div',
        '#config-ai-modal > div',
        '#merge-confirm-modal > div',
        '#validate-link-modal > div',
        '#user-profile-box',
        '#api-tutorial-modal > div',
        '#alert-box',
        '#prompt-box',
        '#confirm-box',
        '#study-config-modal > div',
        '#vault-manager-box',
        '#edit-node-box',
        '#contextual-ai-extension-modal > div',
        '#feedback-box'
    ];

    // Rimozione applicazione zoom inline (gestito via variabili CSS/rem)
    zoomSelectors.forEach(sel => {
        const el = document.querySelector(sel);
        if (el) {
            el.style.removeProperty('zoom');
        }
    });

    // Rimuove stili di zoom residui dagli elementi esclusi gestiti via CSS
    const drawer = document.getElementById('insegnai-drawer');
    if (drawer) drawer.style.removeProperty('zoom');
    const pbarContent = document.getElementById('projects-bar-content');
    if (pbarContent) pbarContent.style.removeProperty('zoom');

    document.documentElement.style.fontSize = '';

    // Sincronizza l'indice per far funzionare bene il cycle successivi
    currentZoomIdx = zooms.indexOf(z);
    if (currentZoomIdx === -1) currentZoomIdx = 0;

    window.safeCreateIcons();
};

window.addL1Input = function (defaultValue = "") {
    const container = document.getElementById('l1-inputs-container');
    const row = document.createElement('div');
    row.className = 'relative flex items-center l1-input-row w-full';
    const placeholder = document.getElementById('extraction-mode').value === 'mindmap' ? 'Nuovo argomento L1...' : 'Nuovo Super-Hub...';
    row.innerHTML = `
                <input type="text" class="font-medium text-slate-700 input_text_step3 l1-topic-input w-full" placeholder="${placeholder}" value="${defaultValue}">
                <button type="button" onclick="window.removeL1Input(this)" class="absolute right-4 text-red-400 hover:text-red-600 p-1 flex items-center justify-center"><i data-lucide="x" class="w-6 h-6"></i></button>
            `;
    container.appendChild(row);
    window.safeCreateIcons();
}

window.removeL1Input = function (btn) {
    btn.closest('.l1-input-row').remove();
}

window.riordinaMappa = function () {
    if (!simulation) return;

    // Se ci sono nodi pinnati o salvati, chiedi conferma
    const pinnedNodes = appState.db.nodes.filter(n => n.fx !== null && n.fx !== undefined);
    if (pinnedNodes.length > 0) {
        window.showConfirm("Reset Layout?", "Hai delle posizioni bloccate o salvate. Vuoi resettare tutto il layout (i nodi torneranno liberi) o solo rinfrescare la vista mantenendo i blocchi?", () => {
            appState.db.nodes.forEach(n => { n.fx = null; n.fy = null; n.pinned = false; });
            applyDefaultLayout();
        }, "Resetta Tutto", "Mantieni Blocchi", () => {
            applyDefaultLayout();
        });
    } else {
        applyDefaultLayout();
    }

    function applyDefaultLayout() {
        appState.db.nodes.forEach(d => {
            if (d.level > 0 && !d.pinned) {
                d.fx = null;
                d.fy = null;
            }
        });
        simulation.alpha(1).restart();
        window.showToast("Layout ricalcolato", "success");
    }
};

window.salvaLayout = function () {
    if (!appState || !appState.db || !appState.db.nodes) return;

    appState.db.nodes.forEach(n => {
        if (n.x !== undefined && n.y !== undefined) {
            n.fx = n.x;
            n.fy = n.y;
            n.pinned = true;
            n.savedX = n.x; // Snapshot permanente
            n.savedY = n.y;
        }
    });

    // Forza salvataggio immediato
    if (StorageManager.currentProjectId) {
        StorageManager.saveCurrentProject();
    }

    window.showToast("Layout Salvato (Snapshot creato)!", "success");
};

window.exportGraph = function () {
    if (!appState.db.nodes.length) return window.showAlert("Errore", "Nessuna mappa da esportare.");
    const exportData = {
        rootNodeLabel: appState.rootNodeLabel, mode: appState.extractionMode,
        generationUsage: appState.generationUsage,
        customColors: appState.db.customColors,
        nodes: appState.db.nodes.map(n => ({ id: n.id, label: n.label, content: n.content, desc: n.desc, image: n.image, level: n.level, group: n.group, studyStatus: n.studyStatus, chunks: n.chunks, x: n.x, y: n.y, fx: n.fx, fy: n.fy })),
        links: appState.db.links.map(l => ({ source: l.source.id || l.source, target: l.target.id || l.target, rel: l.rel }))
    };
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(exportData, null, 2));
    const dl = document.createElement('a');
    dl.setAttribute("href", dataStr);
    const prefix = appState.extractionMode === 'mindmap' ? 'mm' : 'kg';
    const safeLabel = appState.rootNodeLabel.replace(/[^a-z0-9àèéìòù]/gi, '_').replace(/_+/g, '_').replace(/^_|_$/g, '').toLowerCase();
    dl.setAttribute("download", `${prefix}_${safeLabel}.json`);
    dl.click();
}

window.openSaveFolder = async function () {
    if (window.electronAPI && window.electronAPI.openSaveFolder) {
        try {
            await window.electronAPI.openSaveFolder();
        } catch (e) {
            console.error("Errore openSaveFolder:", e);
            window.showToast("Errore apertura cartella", "error");
        }
    } else {
        window.showToast("Funzione disponibile solo nell'app Desktop.", "error");
    }
};

window.importGraph = function (event) {
    const file = event.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = function (e) {
        try {
            const rawData = JSON.parse(e.target.result);
            const data = rawData.db ? { ...rawData, ...rawData.db } : rawData;
            if (!data.nodes || !data.links) throw new Error("JSON non valido.");

            // Normalize links: ensure source/target are string IDs, not objects
            data.links.forEach(l => {
                if (typeof l.source === 'object' && l.source !== null) l.source = l.source.id;
                if (typeof l.target === 'object' && l.target !== null) l.target = l.target.id;
            });
            // Remove stale D3 position data from nodes
            data.nodes.forEach(n => {
                delete n.vx; delete n.vy;
                delete n.fx; delete n.fy;
            });

            appState.db = { nodes: data.nodes, links: data.links };
            appState.extractionMode = data.mode || data.extractionMode || "mindmap";

            if (data.generationUsage) {
                appState.generationUsage = data.generationUsage;
                if (window.updateCostDisplay) window.updateCostDisplay();
            } else {
                appState.generationUsage = null;
            }
            if (data.customColors) {
                appState.db.customColors = data.customColors;
            }

            appState.db.sourcesDict = {};
            (appState.db.nodes || []).forEach(n => {
                if (n.chunks && n.chunks.length > 0) {
                    appState.db.sourcesDict[n.id] = n.chunks.map(c => ({
                        title: "Estratto Fonte",
                        source: "Dato Importato",
                        text: c
                    }));
                }
            });

            appState.rootNodeLabel = data.rootNodeLabel || "Mappa Importata";
            // Reset D3 simulation so it's recreated fresh
            simulation = null;
            window.switchToMapLayout();
            initD3Visualization();
        } catch (err) { window.showAlert("Errore", "Errore importazione: " + err.message); }
        event.target.value = '';
    };
    reader.readAsText(file);
}

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

// Override renderGraph per chiamare updateStudyStats automaticamente
const originalRenderGraph = renderGraph;
renderGraph = function () {
    if (typeof originalRenderGraph === 'function') originalRenderGraph();
    window.updateStudyStats();
    StorageManager.saveCurrentProject();
};

// ==========================================
// STORAGE MANAGER
// ==========================================
const StorageManager = {
    currentProjectId: null,
    saveCurrentProject: function () {
        if (!appState || !appState.db || !appState.db.nodes || appState.db.nodes.length === 0) return;

        if (!this.currentProjectId) {
            this.currentProjectId = 'proj_' + Date.now();
        }

        const projectsStr = localStorage.getItem('tutor_ai_projects');
        let projects = projectsStr ? JSON.parse(projectsStr) : [];

        // Update or add
        const idx = projects.findIndex(p => p.id === this.currentProjectId);
        const pMeta = {
            id: this.currentProjectId,
            name: appState.rootNodeLabel || "Mappa Senza Nome",
            date: Date.now(),
            nodesCount: appState.db.nodes.length,
            type: appState.extractionMode || 'mindmap'
        };

        if (idx >= 0) projects[idx] = pMeta;
        else projects.push(pMeta);

        // Sort by desc date
        projects.sort((a, b) => b.date - a.date);

        localStorage.setItem('tutor_ai_projects', JSON.stringify(projects));
        localStorage.setItem(this.currentProjectId, JSON.stringify(appState));

        // Salva automaticamente la Mappa come .JSON tramite Electron.
        // NON passare appState raw: dopo la simulazione D3 i nodi contengono
        // riferimenti circolari non serializzabili (Structured Clone crash).
        // Passiamo solo i campi che saveMapJSON usa effettivamente.
        if (window.electronAPI) {
            try {
                window.electronAPI.saveMapJSON({
                    extractionMode: appState.extractionMode,
                    rootNodeLabel: appState.rootNodeLabel,
                    nodes: (appState.db.nodes || []).map(n => ({
                        id: n.id, label: n.label, level: n.level,
                        group: n.group, content: n.content, desc: n.desc
                    })),
                    links: (appState.db.links || []).map(l => ({
                        source: typeof l.source === 'object' ? l.source.id : l.source,
                        target: typeof l.target === 'object' ? l.target.id : l.target,
                        rel: l.rel || '', isCross: !!l.isCross
                    }))
                });
            } catch (e) {
                console.warn('[MappAI] saveMapJSON fallito:', e.message);
            }
        }
    },

    loadProject: function (id) {
        try {
            const data = localStorage.getItem(id);
            if (!data) return false;

            const loadedState = JSON.parse(data);
            if (!loadedState) return false;

            // Robust initialization: ensure db and core structures exist
            if (!loadedState.db) loadedState.db = { nodes: [], links: [] };
            if (!loadedState.db.nodes) loadedState.db.nodes = [];
            if (!loadedState.db.links) loadedState.db.links = [];
            if (!loadedState.db.sourcesDict) loadedState.db.sourcesDict = {};
            if (!loadedState.db.customColors) loadedState.db.customColors = {};
            if (!loadedState.extractionMode) loadedState.extractionMode = 'mindmap';

            // Overwrite global appState
            appState = loadedState;

            // Normalize links: D3 stores source/target as objects after simulation
            // After JSON deserialization they become plain objects, not node refs
            if (appState.db.links) {
                appState.db.links.forEach(l => {
                    if (typeof l.source === 'object' && l.source !== null) l.source = l.source.id || l.source;
                    if (typeof l.target === 'object' && l.target !== null) l.target = l.target.id || l.target;
                });
            }
            if (appState.db.nodes) {
                appState.db.nodes.forEach(n => {
                    delete n.vx; delete n.vy;
                });
            }

            // Reset simulation so D3 creates a fresh one with correct node references
            simulation = null;
            this.currentProjectId = id;

            // Ripristina posizioni salvate
            if (appState.db.nodes) {
                appState.db.nodes.forEach(n => {
                    if (n.pinned) { n.fx = n.x; n.fy = n.y; }
                });
            }

            // Mostra tasto Sincronizza se c'è un vault
            const syncBtn = document.getElementById('sync-vault-btn');
            if (syncBtn && appState.activeVaultPath) {
                syncBtn.classList.remove('hidden');
                syncBtn.classList.add('flex');
            } else if (syncBtn) {
                syncBtn.classList.add('hidden');
            }

            window.switchToMapLayout();
            setTimeout(() => {
                try {
                    initD3Visualization();
                } catch (err) {
                    console.error("D3 Init Error:", err);
                    window.showLoadingOverlay(false);
                }
            }, 200);

            return true;
        } catch (e) {
            console.error("Critical Load Error:", e);
            window.showAlert("Errore Caricamento", "Impossibile caricare il progetto: " + e.message);
            window.showLoadingOverlay(false);
            return false;
        }
    },

    deleteProject: function (e, id) {
        e.stopPropagation();
        window.showConfirm("Elimina Progetto", "Sei sicuro di voler eliminare la mappa e gli appunti di questo progetto?", () => {
            let projects = JSON.parse(localStorage.getItem('tutor_ai_projects') || "[]");
            projects = projects.filter(p => p.id !== id);
            localStorage.setItem('tutor_ai_projects', JSON.stringify(projects));
            localStorage.removeItem(id);
            this.renderRecentProjects();
        });
    },

    validVaultFolders: [], // Cache dei nomi di cartelle vault che effettivamente esistono

    // Verifica quali vault EFFETTIVAMENTE ESISTONO nel file system
    // (senza toccare localStorage, il quale rimane integro)
    syncValidVaults: async function () {
        try {
            if (!window.electronAPI || !window.electronAPI.getValidVaultFolders) return;
            this.validVaultFolders = await window.electronAPI.getValidVaultFolders();
        } catch (e) {
            console.warn("[StorageManager] Errore syncValidVaults:", e);
            this.validVaultFolders = [];
        }
    },

    renderRecentProjects: function () {
        const container = document.getElementById('recent-projects-container');
        if (!container) return;

        try {
            let projects = JSON.parse(localStorage.getItem('tutor_ai_projects') || "[]");

            if (projects.length === 0) {
                container.innerHTML = '<p class="text-xs text-slate-400 italic">Nessun progetto salvato in questa App MappAI.</p>';
                return;
            }

            container.innerHTML = projects.map(p => {
                const d = new Date(p.date).toLocaleDateString('it-CH', { day: '2-digit', month: 'short' });
                const icon = p.type === 'kg' ? 'network' : 'git-merge';
                const label = p.type === 'kg' ? 'KG' : 'MM';
                const labelFull = p.type === 'kg' ? 'Knowledge Graph' : 'Mappa Mentale';
                return `
                        <div class="flex-shrink-0 w-36 bg-white border border-indigo-200/60 rounded-lg p-2.5 flex flex-col justify-between hover:bg-indigo-50 hover:border-indigo-300 hover:shadow-md transition cursor-pointer group shadow-sm" onclick="window.loadSavedProject('${p.id}')">
                            <div>
                                <div class="flex items-center gap-1 mb-1.5 text-indigo-400">
                                    <i data-lucide="${icon}" class="w-2.5 h-2.5 shrink-0"></i>
                                    <span class="text-[9px] font-bold uppercase tracking-tight" title="${labelFull}">${label}</span>
                                </div>
                                <h4 class="text-[11px] leading-tight text-slate-700 font-bold mb-1.5 break-words group-hover:text-indigo-600 transition line-clamp-3">${p.name}</h4>
                                <p class="text-[9px] text-slate-400">${p.nodesCount} nodi &bull; ${d}</p>
                            </div>
                            <div class="flex justify-between items-center mt-2">
                                <span class="text-[9px] text-indigo-500 font-semibold flex items-center gap-0.5 group-hover:text-indigo-700"><i data-lucide="play-circle" class="w-2.5 h-2.5"></i> Riprendi</span>
                                <button onclick="StorageManager.deleteProject(event, '${p.id}')" class="text-slate-300 hover:text-red-500 transition p-0.5" title="Elimina"><i data-lucide="trash" class="w-2.5 h-2.5"></i></button>
                            </div>
                        </div>`;
            }).join('');
            window.safeCreateIcons();
        } catch (e) {
            console.error("Error rendering projects:", e);
            container.innerHTML = '<p class="text-xs text-red-400 italic">Errore caricamento progetti.</p>';
        }
    }
};

window.loadSavedProject = function (id) {
    StorageManager.loadProject(id);
};

// Toggle Recent Projects Bar
window.toggleProjectsBar = function (forcedState) {
    const bar = document.getElementById('projects-bar');
    const icon = document.getElementById('toggle-bar-icon');
    const text = document.getElementById('toggle-bar-text');
    if (!bar) return;

    const isCollapsed = forcedState !== undefined ? !forcedState : !bar.classList.contains('projects-collapsed');

    const lang = localStorage.getItem('mappai_language') || 'it';
    const localTranslations = {
        it: { show_projects: 'Mostra Progetti', hide_projects: 'Nascondi Progetti' },
        en: { show_projects: 'Show Projects', hide_projects: 'Hide Projects' }
    };
    const t = localTranslations[lang] || localTranslations['it'];

    if (isCollapsed) {
        bar.classList.add('projects-collapsed');
        bar.style.transform = 'translateY(calc(100% - 0px))';
        if (icon) icon.style.transform = 'rotate(180deg)';
        if (text) text.textContent = t.show_projects || 'Mostra Progetti';
        localStorage.setItem('mappai_bar_collapsed', 'true');
    } else {
        bar.classList.remove('projects-collapsed');
        bar.style.transform = 'translateY(0)';
        if (icon) icon.style.transform = 'rotate(0deg)';
        if (text) text.textContent = t.hide_projects || 'Nascondi Progetti';
        localStorage.setItem('mappai_bar_collapsed', 'false');
    }
};

// Init bar state
setTimeout(() => {
    if (localStorage.getItem('mappai_bar_collapsed') === 'true') {
        window.toggleProjectsBar(false);
    }
}, 500);

setInterval(() => {
    StorageManager.saveCurrentProject();
}, 120000); // periodic background save just in case

// Aggiungo il gestore lingue per i modali
window.currentLanguage = localStorage.getItem('mappai_language') || 'it';

window.changeLanguage = function (lang) {
    window.currentLanguage = lang;
    localStorage.setItem('mappai_language', lang);
    // Uso i nomi definiti nei file .js caricati
    const t = (lang === 'en' ? (typeof en_translations !== 'undefined' ? en_translations : {}) : (typeof it_translations !== 'undefined' ? it_translations : {}));

    // --- 1. LOCALIZZAZIONE LANDING PAGE ---
    const els = {
        'landing-subtitle': t.landing_subtitle,
        'btn-setup-label': t.btn_setup,
        'btn-app-guide-label': t.btn_app_guide,
        'btn-app-tutorial-label': t.btn_active_study,
        'label-step1': t.step1,
        'label-step2': t.step2,
        'label-mode-mindmap': t.step2_mindmap,
        'label-mode-kg': t.step2_kg,
        'label-step4': t.step_density_title,
        'label-step4-kg': t.step_kg_density_title,
        'btn-generate-label': (document.getElementById('extraction-mode')?.value || 'mindmap') === 'mindmap' ? t.new_map_btn : t.new_kg_btn,


        'btn-blank-canvas-label': t.btn_blank_canvas_label || "Oppure crea Canvas Vuoto (Manuale)",
        'label-save-folder': t.save_folder,
        'label-ext-guide': t.ext_ai_guide,
        'label-import-json': t.import_json,
        'modal-setup-title': t.modal_config_title,
        'modal-study-title-label': t.modal_study_title,
        'modal-guide-title-label': t.modal_guide_title,
        'label-language-select': lang === 'it' ? 'Lingua:' : 'Language:',
        'label-api-key': appState.aiProvider === 'infomaniak' ? (t.api_key_label_infomaniak || "API Token (Infomaniak)") : (t.api_key_label_google || t.api_key_label),
        'label-api-key-desc': t.api_key_desc,
        'label-api-key-how': t.api_key_how,
        'label-ai-model': t.ai_model_label,
        'label-refresh-models': t.refresh_models,
        'estimator-title-lbl': t.estimator_title,
        'estimator-tokens-lbl': t.estimator_tokens_label,
        'estimator-cost-lbl': t.estimator_cost_label,
        'feedback-section-title': t.feedback_section,
        'feedback-btn-title': t.feedback_btn_title,
        'feedback-btn-desc': t.feedback_btn_desc,
        'feedback-modal-title-lbl': t.feedback_modal_title,
        'feedback-cat-label-lbl': t.feedback_cat_label,
        'feedback-desc-label-lbl': t.feedback_desc_label,
        'feedback-submit-btn-lbl': t.feedback_submit_btn
    };

    for (let id in els) {
        const el = document.getElementById(id);
        if (el) el.innerText = els[id];
    }

    const feedbackText = document.getElementById('feedback-text');
    if (feedbackText) feedbackText.placeholder = t.feedback_desc_placeholder;

    // Process data-i18n attributes automatically
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        if (t[key]) el.innerHTML = t[key];
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
        const key = el.getAttribute('data-i18n-placeholder');
        if (t[key]) el.setAttribute('placeholder', t[key]);
    });

    // --- 1b. LOCALIZZAZIONE PRICING (Inner HTML) ---
    const pricingFree = document.getElementById('pricing-free');
    const pricingPaid = document.getElementById('pricing-paid');
    const pricingNote = document.getElementById('pricing-note');
    if (pricingFree) pricingFree.innerHTML = t.pricing_free;
    if (pricingPaid) pricingPaid.innerHTML = t.pricing_paid;
    if (pricingNote) pricingNote.innerHTML = t.pricing_note;

    // --- 2. LOCALIZZAZIONE MODALE STUDIO (Active Recall, ecc) ---
    const studyContainer = document.getElementById('study-modal-content');
    // Il contenuto è ora statico nell'HTML, la traduzione avviene tramite data-i18n.

    const guideContainer = document.getElementById('guide-modal-content');
    if (guideContainer) {
        const normalGuide = document.getElementById('guide-normal-content');
        const studentGuide = document.getElementById('guide-student-content');

        if (normalGuide && studentGuide) {
            if (appState.studentMode) {
                normalGuide.classList.add('hidden');
                studentGuide.classList.remove('hidden');
            } else {
                normalGuide.classList.remove('hidden');
                studentGuide.classList.add('hidden');
            }
        }
    }

    // --- 4. FEEDBACK VISIVO BANDIERE ---
    const btnIt = document.getElementById('lang-btn-it');
    const btnEn = document.getElementById('lang-btn-en');
    if (btnIt && btnEn) {
        if (lang === 'it') {
            btnIt.classList.remove('grayscale', 'opacity-40');
            btnIt.classList.add('grayscale-0', 'opacity-100');
            btnEn.classList.remove('grayscale-0', 'opacity-100');
            btnEn.classList.add('grayscale', 'opacity-40');
        } else {
            btnEn.classList.remove('grayscale', 'opacity-40');
            btnEn.classList.add('grayscale-0', 'opacity-100');
            btnIt.classList.remove('grayscale-0', 'opacity-100');
            btnIt.classList.add('grayscale', 'opacity-40');
        }
    }

    // Invia segnale di cambio lingua se necessario (es. per toast)
    if (window.showToast) {
        window.showToast(lang === 'it' ? t.toast_lang_it : t.toast_lang_en, "info");
    }

    // Aggiorna dinamicamente le descrizioni di Step 4 in base a lingua e modalità
    if (window.updateStep4Display) {
        window.updateStep4Display();
    }
    if (window.updateTokenCostEstimator) {
        window.updateTokenCostEstimator();
    }
};

// Add auto-render projects on load
document.addEventListener('DOMContentLoaded', async () => {
    // Inizializza secure keys dal Keychain nativo se disponibile, o da localStorage
    if (window.initSecureKeys) {
        try {
            await window.initSecureKeys();
        } catch (e) {
            console.error("[MappAI] Errore inizializzazione Secure Keys all'avvio:", e);
        }
    }

    // Inizializza Lingua
    window.changeLanguage(window.currentLanguage);

    // Header Buttons
    const btnConfig = document.getElementById('btn-config-ai');
    const btnGuide = document.getElementById('btn-app-guide');
    const btnStudy = document.getElementById('btn-app-tutorial');

    if (btnConfig) btnConfig.addEventListener('click', () => { console.log("Open Config"); window.showConfigAIModal(); });
    if (btnGuide) btnGuide.addEventListener('click', () => { console.log("Open Guide"); window.showAppGuide(); });
    if (btnStudy) btnStudy.addEventListener('click', () => { console.log("Open Study"); window.showAppTutorial(); });

    const autoGenToggle = document.getElementById('l1-auto-generate-toggle');
    if (autoGenToggle) {
        autoGenToggle.addEventListener('change', () => {
            if (window.updateStep4Display) window.updateStep4Display();
        });
    }

    // Multi-pass ON di default (silent=true: niente toast all'avvio)
    window.setMultiPassMode(true, true);

    // Initialize Pipeline A/B selector. Default = B (MappAI classico KG).
    const savedPipeline = localStorage.getItem('mappai_generation_pipeline') || 'B';
    window.setPipeline(savedPipeline);
    // Initialize MM logic toggle (default MappAI)
    // Migrazione una-tantum: la logica MM "BERT" era sperimentale e degradava le macro-aree L1
    // (deriva geografica / espansione di contesto). Chi aveva il flag legacy 'bert' viene
    // riportato al default MappAI UNA volta sola; dopo la migrazione BERT resta comunque
    // selezionabile come opt-in (la scelta esplicita successiva persiste).
    if (localStorage.getItem('mappai_mm_logic_migrated') !== '1') {
        if (localStorage.getItem('mappai_mm_logic') === 'bert') {
            localStorage.setItem('mappai_mm_logic', 'mappai');
        }
        localStorage.setItem('mappai_mm_logic_migrated', '1');
    }
    if (typeof window.setMMLogic === 'function') window.setMMLogic(window.getMMLogic());
    const desc = document.getElementById('pipeline-desc');
    if (desc) desc.innerHTML += '<br><small style="opacity:0.7; font-size:11px;">Riavvia generazione per applicare</small>';

    // Sincronizza la lista di vault che effettivamente esistono, poi renderizza
    StorageManager.syncValidVaults().then(() => {
        StorageManager.renderRecentProjects();
    }).catch(e => {
        console.warn("[Init] Errore syncValidVaults:", e);
        StorageManager.renderRecentProjects(); // Fallback: renderizza comunque
    });

    // Load Gemini Key
    const savedGeminiKey = (window.secureKeys && window.secureKeys['gemini_api_key']) || localStorage.getItem('gemini_api_key');
    if (savedGeminiKey) {
        const geminiInput = document.getElementById('gemini-api-key-input');
        if (geminiInput) geminiInput.value = savedGeminiKey;
    }
    // Load Infomaniak Key
    const savedInfomaniakKey = (window.secureKeys && window.secureKeys['infomaniak_api_key']) || localStorage.getItem('infomaniak_api_key');
    if (savedInfomaniakKey) {
        const infomaniakInput = document.getElementById('infomaniak-api-key-input');
        if (infomaniakInput) infomaniakInput.value = savedInfomaniakKey;
    }

    // Load Infomaniak Product ID
    if (appState.infomaniakProductId) {
        const productInput = document.getElementById('infomaniak-product-id');
        if (productInput) productInput.value = appState.infomaniakProductId;
    }

    // Load saved models on boot
    const isInfomaniak = (appState.aiProvider === 'infomaniak');
    const modelsStorageKey = isInfomaniak ? 'infomaniak_available_models' : 'gemini_available_models';
    const selectionStorageKey = isInfomaniak ? 'infomaniak_selected_model' : 'gemini_selected_model';
    const defaultModel = isInfomaniak ? 'mistral-small-4-119B-2603' : 'gemini-2.0-flash';

    const savedModelsStr = localStorage.getItem(modelsStorageKey);
    const selectEl = document.getElementById('model-select');
    if (savedModelsStr) {
        try {
            const savedModels = JSON.parse(savedModelsStr);
            const currentValue = localStorage.getItem(selectionStorageKey) || defaultModel;
            renderModelSelect(savedModels, selectEl, currentValue);
        } catch (e) {
            if (selectEl) selectEl.innerHTML = '<option value="">Clicca Aggiorna Modelli</option>';
        }
    } else {
        if (selectEl) selectEl.innerHTML = '<option value="">Clicca Aggiorna Modelli</option>';
    }

    // Initialize the UI for the current provider
    if (window.switchAIProvider) window.switchAIProvider(appState.aiProvider);

    // Setup estimator events and initial display
    if (selectEl) {
        selectEl.addEventListener('change', () => {
            if (window.updateTokenCostEstimator) window.updateTokenCostEstimator();
        });
    }
    if (window.updateTokenCostEstimator) window.updateTokenCostEstimator();

    // Aggiorna dinamicamente l'etichetta del percorso cartella dei vault
    const labelEl = document.getElementById('vault-manager-folder-path-label');
    if (labelEl) {
        labelEl.textContent = isCapacitor ? "Cartella: MappAI - Vault" : "Cartella: Documents/Salvataggi MappAI";
    }
});

// STUDY SESSION (config/player/punteggi/report) → estratto in js/mappai-study-session.js

// Inizializza Costi al caricamento
setTimeout(() => { if (window.updateCostDisplay) window.updateCostDisplay(); }, 1000);

// Event listener per riga di lettura compensativa
window.addEventListener('mousemove', e => {
    document.documentElement.style.setProperty('--ruler-y', e.clientY + 'px');
});

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
            if (window.showToast) window.showToast("Inserisci i dettagli della segnalazione", "warning");
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
            if (window.showToast) window.showToast("Segnalazione copiata e client email aperto!", "success");
            window.closeFeedbackModal();
        }).catch(err => {
            const mailtoUrl = `mailto:giacomo@insegnai.ch?subject=${encodeURIComponent(emailSubject)}&body=${encodeURIComponent(emailBody)}`;
            window.location.href = mailtoUrl;
            if (window.showToast) window.showToast("Email preparata!", "success");
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
            window.showToast("Titolo e Keyword sono richiesti per salvare il layout", "warning");
            return;
        }

        if (!appState.savedLayouts) {
            appState.savedLayouts = [];
        }

        // Check limit only when creating a new layout
        if (!window.currentEditingLayoutId && appState.savedLayouts.length >= 5) {
            window.showToast("Hai raggiunto il limite massimo di 5 layout salvati. Cancellane uno prima di procedere.", "error");
            return;
        }

        window.showToast("Cattura in corso...", "info");

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
                window.showToast(`Layout "${title}" aggiornato correttamente!`, "success");
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
            window.showToast(`Layout "${title}" salvato correttamente!`, "success");
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
            window.showToast("Nessun layout in fase di modifica da aggiornare.", "warning");
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
        window.showToast(`Layout "${layout.name}" applicato!`, "success");
    };

    window.deleteSavedLayout = function (layoutId) {
        if (!confirm("Sei sicuro di voler eliminare questo layout?")) return;

        appState.savedLayouts = appState.savedLayouts.filter(l => l.id !== layoutId);
        StorageManager.saveCurrentProject();
        window.showToast("Layout eliminato", "info");
        window.renderSavedLayoutsList();
    };

    window.exportLayoutPDF = async function (layoutId) {
        const layout = appState.savedLayouts.find(l => l.id === layoutId);
        if (!layout) return;

        try {
            window.showToast("Esportazione PDF scheda in corso...", "info");
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
                    window.showToast("Scheda condivisa con successo!", "success");
                } else {
                    throw new Error("Condivisione non supportata.");
                }
            } else {
                pdf.save(`Scheda_Layout_${layout.keyword}.pdf`);
                window.showToast("Scheda PDF salvata con successo!", "success");
            }
        } catch (e) {
            console.error(e);
            window.showToast("Errore esportazione PDF: " + e.message, "error");
        }
    };

    window.exportCurrentLayoutPDFDirect = async function () {
        const title = document.getElementById('layout-new-title').value.trim() || "Layout Corrente";
        const keyword = document.getElementById('layout-new-keyword').value.trim() || "";
        const desc = document.getElementById('layout-new-desc').value.trim() || "Nessuna descrizione inserita.";

        try {
            window.showToast("Generazione PDF scheda in corso...", "info");
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
                    window.showToast("Scheda condivisa con successo!", "success");
                } else {
                    throw new Error("Condivisione non supportata.");
                }
            } else {
                pdf.save(`Scheda_Layout_${title.replace(/\s+/g, '_')}.pdf`);
                window.showToast("Scheda PDF salvata con successo!", "success");
            }
        } catch (e) {
            console.error(e);
            window.showToast("Errore esportazione PDF: " + e.message, "error");
        }
    };

    window.exportCurrentLayoutPDFToVault = async function () {
        const title = document.getElementById('layout-new-title').value.trim() || "Layout Corrente";
        const keyword = document.getElementById('layout-new-keyword').value.trim() || "LAYOUT";
        const desc = document.getElementById('layout-new-desc').value.trim() || "Nessuna descrizione inserita.";

        if (!appState.activeVaultPath) {
            window.showToast("Nessun Vault attivo. Collega o crea un Vault per salvare.", "warning");
            return;
        }

        try {
            window.showToast("Generazione ed esportazione PDF nel Vault in corso...", "info");
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
                window.showToast(`Scheda PDF esportata con successo nel Vault: ${fileName}`, "success");
            } else {
                throw new Error(res.error);
            }
        } catch (e) {
            console.error(e);
            window.showToast("Errore esportazione PDF nel Vault: " + e.message, "error");
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

