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

    window.showToast(`Generazione completata! Token: ${tokens} | Costo: ${costText}`, "success");

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

