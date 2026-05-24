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
    studentMode: true,
    infomaniakAllModels: false,
    multiPassMode: false
};

// ==========================================
// COMBINAZIONI SEGRETE (STUDENTE & PRO)
// ==========================================
let secretBuffer = [];
let infomaniakProKeys = [];
const infomaniakProSecret = ['m', 'n', 'b', 'v'];

document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.shiftKey) {
        const key = e.key.toUpperCase();
        
        // 1. Sblocco/Blocco Generatore Studente: CTRL + SHIFT + L + K + J + H
        if (['L', 'K', 'J', 'H'].includes(key)) {
            secretBuffer.push(key);
            if (secretBuffer.length > 4) {
                secretBuffer.shift();
            }
            if (secretBuffer.join('') === 'LKJH') {
                window.toggleStudentMode();
                secretBuffer = [];
            }
        } else {
            secretBuffer = [];
        }

        // 2. Infomaniak Pro Mode: CTRL + SHIFT + M + N + B + V
        const keyLower = e.key.toLowerCase();
        if (infomaniakProSecret.includes(keyLower)) {
            infomaniakProKeys.push(keyLower);
            if (infomaniakProKeys.length > 4) infomaniakProKeys.shift();
            if (infomaniakProKeys.join('') === 'mnbv') {
                window.toggleInfomaniakProMode();
                infomaniakProKeys = [];
            }
        } else {
            infomaniakProKeys = [];
        }
    } else {
        secretBuffer = [];
        infomaniakProKeys = [];
    }
});

window.toggleInfomaniakProMode = function () {
    appState.infomaniakAllModels = !appState.infomaniakAllModels;
    const msg = appState.infomaniakAllModels ? "Modalità PRO (All Models) ATTIVATA" : "Modalità BETA (Google Models Only) ATTIVATA";
    window.showToast(msg, "success");
    if (appState.aiProvider === 'infomaniak' && window.refreshGeminiModels) {
        window.refreshGeminiModels();
    }
};

window.applyStudentModeUI = function () {
    // In modalità studente (sia sbloccata che bloccata), questi bottoni sono sempre nascosti per la versione Studente
    const btnUrl = document.getElementById('btn-src-url');
    const btnYoutube = document.getElementById('btn-src-youtube');
    const btnAudio = document.getElementById('btn-src-audio');
    const btnVideo = document.getElementById('btn-src-video');

    if (appState.studentMode) {
        if (btnUrl) btnUrl.style.display = 'none';
        if (btnYoutube) btnYoutube.style.display = 'none';
        if (btnAudio) btnAudio.style.display = 'none';
        if (btnVideo) btnVideo.style.display = 'none';
    } else {
        if (btnUrl) btnUrl.style.display = '';
        if (btnYoutube) btnYoutube.style.display = '';
        if (btnAudio) btnAudio.style.display = '';
        if (btnVideo) btnVideo.style.display = '';
    }

    // Assicurati che i bottoni per caricare documenti e testo siano visibili
    const btnDoc = document.getElementById('btn-src-doc');
    const btnText = document.getElementById('btn-src-text');
    if (btnDoc) btnDoc.style.display = '';
    if (btnText) btnText.style.display = '';

    const setupForm = document.getElementById('setup-form');
    if (setupForm) {
        if (appState.studentMode) {
            setupForm.classList.add('hidden');
        } else {
            setupForm.classList.remove('hidden');
        }
    }

    const btnConfig = document.getElementById('btn-config-ai');
    if (btnConfig) {
        if (appState.studentMode) {
            btnConfig.classList.add('hidden');
        } else {
            btnConfig.classList.remove('hidden');
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

window.setMultiPassMode = function (enabled) {
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

    window.showToast(enabled ? "Generazione Multi-Pass (HD) ATTIVATA" : "Generazione Multi-Pass DISATTIVATA", "info");
};

window.updateInfomaniakProductId = function (value) {
    const val = value ? value.trim() : "";
    localStorage.setItem('infomaniak_product_id', val);
    appState.infomaniakProductId = val;
}
window.switchAIProvider = function (provider) {
    appState.aiProvider = provider;
    localStorage.setItem('ai_provider', provider);

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

// --- Modal Management (con try/catch per robustezza) ---
window.showConfigAIModal = function () {
    if (appState.studentMode) {
        window.showToast("Configurazione AI non disponibile nella versione studente", "warning");
        return;
    }
    try {
        const m = document.getElementById('config-ai-modal');
        if (m) { m.style.display = ''; m.classList.remove('hidden'); m.classList.add('flex'); window.safeCreateIcons(); }
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

// ── Tree View (Macro-areas / Super-hubs) ──────────────────────
window.renderTreeView = function () {
    const container = document.getElementById('tree-view-container');
    const titleEl = document.getElementById('tree-view-title');
    if (!container || !appState.db.nodes.length) return;

    const isMindmap = appState.extractionMode === 'mindmap';
    if (titleEl) titleEl.textContent = isMindmap ? 'Macro-aree' : 'Super-hub';

    let rootNodes = [];

    if (isMindmap) {
        // For mindmaps: show L1 nodes with their L2 children
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

    let html = '';
    rootNodes.forEach(rn => {
        // Find children
        let children = [];
        if (isMindmap) {
            // Children are L2 nodes connected to this L1
            const childIds = new Set();
            appState.db.links.forEach(l => {
                const sid = typeof l.source === 'object' ? l.source.id : l.source;
                const tid = typeof l.target === 'object' ? l.target.id : l.target;
                if (sid === rn.id) childIds.add(tid);
                if (tid === rn.id) childIds.add(sid);
            });
            children = appState.db.nodes.filter(n => childIds.has(n.id) && n.level === 2);
        } else {
            // For KG: connected nodes
            const connIds = new Set();
            appState.db.links.forEach(l => {
                const sid = typeof l.source === 'object' ? l.source.id : l.source;
                const tid = typeof l.target === 'object' ? l.target.id : l.target;
                if (sid === rn.id) connIds.add(tid);
                if (tid === rn.id) connIds.add(sid);
            });
            children = appState.db.nodes.filter(n => connIds.has(n.id) && n.id !== rn.id).slice(0, 6);
        }

        const statusColor = rn.studyStatus === 'done' ? 'text-emerald-500' :
            rn.studyStatus === 'review' ? 'text-amber-500' : 'text-slate-300';
        const degreeInfo = !isMindmap ? ` <span class="text-[9px] text-indigo-400">(${rn.degree} conn.)</span>` : '';

        html += `<div class="mb-1">`;
        html += `<button onclick="window.zoomToNode('${rn.id.replace(/'/g, "\\'")}')" class="w-full text-left py-1.5 px-2 rounded-lg hover:bg-indigo-50 transition flex items-center gap-2 group">`;
        html += `<i data-lucide="circle-dot" class="w-3 h-3 ${statusColor} flex-shrink-0"></i>`;
        html += `<span class="text-sm font-bold text-slate-700 group-hover:text-indigo-600 truncate">${rn.label}${degreeInfo}</span>`;
        html += `</button>`;

        if (children.length > 0) {
            html += `<div class="ml-5 pl-2 border-l-2 border-slate-200/60 space-y-0.5">`;
            children.forEach(c => {
                const cStatus = c.studyStatus === 'done' ? 'text-emerald-400' :
                    c.studyStatus === 'review' ? 'text-amber-400' : 'text-slate-200';
                html += `<button onclick="window.zoomToNode('${c.id.replace(/'/g, "\\'")}')" class="w-full text-left py-1 px-2 rounded hover:bg-slate-50 transition flex items-center gap-1.5">`;
                html += `<i data-lucide="minus" class="w-2.5 h-2.5 ${cStatus} flex-shrink-0"></i>`;
                html += `<span class="text-xs text-slate-500 hover:text-indigo-500 truncate">${c.label}</span>`;
                html += `</button>`;
            });
            html += `</div>`;
        }
        html += `</div>`;
    });

    container.innerHTML = html;

    // Aggiorna anche la lista macro-aree in fondo se presente
    const macroContainer = document.getElementById('macro-areas-container');
    if (macroContainer) {
        macroContainer.innerHTML = "";
        const macroNodes = appState.db.nodes.filter(n => n.level === 1);
        if (macroNodes.length === 0) {
            macroContainer.innerHTML = '<p class="text-[10px] text-slate-400 italic">Nessuna macro-area definita.</p>';
        } else {
            macroNodes.forEach(n => {
                const div = document.createElement('div');
                div.className = "p-2 hover:bg-slate-50 rounded-lg cursor-pointer transition flex items-center gap-2 group";
                div.onclick = () => window.handleNodeClick({ stopPropagation: () => { } }, n);
                let mColor = (appState.db.customColors && appState.db.customColors[n.group])
                    ? appState.db.customColors[n.group]
                    : (colorScale[n.group] || '#4f46e5');
                div.innerHTML = `
                            <div class="w-1.5 h-1.5 rounded-full" style="background-color: ${mColor}"></div>
                            <span class="text-[13px] font-bold text-slate-600 group-hover:text-indigo-600 transition truncate">${n.label}</span>
                        `;
                macroContainer.appendChild(div);
            });
        }
    }

    setTimeout(() => { if (window.lucide) window.lucide.createIcons(); }, 50);
}

// Modal functions moved to top section

// ── Curated model knowledge base ──────────────────────
// Maps model ID patterns to capabilities, pricing, and categories.
// Capabilities: pdf, url, youtube (video), audio, text, json (structured output)
const MODEL_KB = {
    // ── Gemini 3 series ──
    'gemini-3.1-pro': { tier: '💎 Potente', caps: ['text', 'pdf', 'url', 'audio', 'youtube', 'json'], inputCost: 2.00, outputCost: 12.00, free: false, note: 'Flagship, massima qualità' },
    'gemini-3-flash': { tier: '⚡ Veloce', caps: ['text', 'pdf', 'url', 'audio', 'youtube', 'json'], inputCost: 0.50, outputCost: 3.00, free: true, note: 'Ottimo rapporto qualità/prezzo' },
    'gemini-3.1-flash-lite': { tier: '🟢 Economico', caps: ['text', 'pdf', 'url', 'json'], inputCost: 0.10, outputCost: 0.40, free: true, note: 'Ultra-economico' },
    // ── Gemini 2.5 series ──
    'gemini-2.5-flash': { tier: '⚡ Veloce', caps: ['text', 'pdf', 'url', 'audio', 'youtube', 'json'], inputCost: 0.15, outputCost: 0.60, free: true, note: 'Veloce con reasoning' },
    'gemini-2.5-flash-lite': { tier: '🟢 Economico', caps: ['text', 'pdf', 'url', 'json'], inputCost: 0.10, outputCost: 0.40, free: true, note: 'Più economico di tutti' },
    'gemini-2.5-pro': { tier: '💎 Potente', caps: ['text', 'pdf', 'url', 'audio', 'youtube', 'json'], inputCost: 1.25, outputCost: 10.00, free: false, note: 'Reasoning avanzato' },
    // ── Gemini 2.0 series ──
    'gemini-2.0-flash': { tier: '⚡ Veloce', caps: ['text', 'pdf', 'url', 'audio', 'youtube', 'json'], inputCost: 0.10, outputCost: 0.40, free: true, note: 'Versatile e gratuito' },
    'gemini-2.0-flash-lite': { tier: '🟢 Economico', caps: ['text', 'pdf', 'url', 'json'], inputCost: 0.05, outputCost: 0.20, free: true, note: 'Leggero' },
    // ── Gemini 1.5 series ──
    'gemini-1.5-flash': { tier: '📦 Legacy', caps: ['text', 'pdf', 'url', 'audio', 'youtube', 'json'], inputCost: 0.075, outputCost: 0.30, free: true, note: 'Stabile, legacy' },
    'gemini-1.5-pro': { tier: '📦 Legacy', caps: ['text', 'pdf', 'url', 'audio', 'youtube', 'json'], inputCost: 1.25, outputCost: 5.00, free: false, note: 'Potente, legacy' },
    // ── Infomaniak (Limit to Google/Gemma) ──
    'google/gemma-4': { tier: '🇨🇭 Swiss Made', caps: ['text', 'json'], inputCost: 0.20, outputCost: 0.40, free: false, note: 'Infomaniak Cloud (Gemma 4)' },
    'google/gemma': { tier: '🇨🇭 Swiss Made', caps: ['text', 'json'], inputCost: 0.20, outputCost: 0.40, free: false, note: 'Infomaniak Cloud (Gemma)' },
    'gemma-4': { tier: '🇨🇭 Swiss Made', caps: ['text', 'json'], inputCost: 0.20, outputCost: 0.40, free: false, note: 'Infomaniak Cloud (Gemma 4)' },
    'gemma': { tier: '🇨🇭 Swiss Made', caps: ['text', 'json'], inputCost: 0.20, outputCost: 0.40, free: false, note: 'Infomaniak Cloud (Gemma)' },
};

// Match a model ID to its KB entry (best fuzzy match or dynamic fallback)
function matchModelKB(modelId) {
    const id = modelId.toLowerCase().replace('models/', '');
    // Try exact prefix match first
    for (const pattern of Object.keys(MODEL_KB)) {
        if (id.startsWith(pattern)) return MODEL_KB[pattern];
    }
    // Fuzzy: strip preview/exp suffixes and try again
    const base = id.replace(/-preview.*$/, '').replace(/-exp.*$/, '').replace(/-latest$/, '');
    for (const pattern of Object.keys(MODEL_KB)) {
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
        // If current value is invalid, pick the first available
        selectEl.value = selectEl.options[0].value;
        if (window.appState && window.appState.aiProvider === 'infomaniak') {
            localStorage.setItem('infomaniak_selected_model', selectEl.value);
        } else {
            localStorage.setItem('gemini_selected_model', selectEl.value);
        }
    }
    if (typeof updateModelCapabilities === 'function') updateModelCapabilities();
}

window.refreshGeminiModels = async function () {
    const isInfomaniak = (appState.aiProvider === 'infomaniak');
    const apiKey = window.getSystemKey();
    const selectEl = document.getElementById('model-select');
    const statusEl = document.getElementById('models-status');
    const refreshIcon = document.getElementById('refresh-models-icon');

    if (!apiKey) {
        if (selectEl) selectEl.innerHTML = '<option value="">Nessun modello (manca API Key)</option>';
        if (!appState.studentMode) {
            window.showToast("Inserisci prima una API Key per caricare i modelli.", "error");
        }
        if (statusEl) {
            statusEl.innerText = "Attesa inserimento API Key...";
            statusEl.classList.remove('hidden');
        }
        return;
    }

    let productId = null;
    if (isInfomaniak) {
        productId = document.getElementById('infomaniak-product-id')?.value || appState.infomaniakProductId;
        if (!productId) {
            if (selectEl) selectEl.innerHTML = '<option value="">Nessun modello (manca Product ID)</option>';
            window.showToast("Inserisci il Product ID per caricare i modelli Infomaniak.", "error");
            if (statusEl) { statusEl.innerText = "Attesa inserimento Product ID..."; statusEl.classList.remove('hidden'); }
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
            // Include only Google models (Gemma) unless Pro mode is active
            filteredModels = rawModels.filter(m => {
                const id = m.id.toLowerCase();
                if (id.includes('embed')) return false;
                if (appState.infomaniakAllModels) return true; // Pro mode shows everything
                return (id.includes('gemma') || id.includes('google'));
            });
        } else {
            // Filter out unsupported models for Gemini
            const excludePatterns = ['tts', 'live', 'embed', 'image', 'nano-banana', 'veo', 'lyria', 'imagen', 'robotics', 'deep-research', 'computer-use'];
            filteredModels = rawModels.filter(m => {
                const id = m.id.toLowerCase();
                if (excludePatterns.some(p => id.includes(p))) return false;
                if (!id.includes('gemini')) return false; // Ensure it's a Gemini LLM
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
}

// Funzioni sicure per il processing delle stringhe multilinea
function cleanLabel(str) {
    if (!str) return "";
    return String(str).split('\\n').join('\n').trim();
}

function getLabelLines(str) {
    if (!str) return [];
    return String(str).split('\n');
}

function stripHTML(html) {
    let tmp = document.createElement("DIV");
    tmp.innerHTML = html;
    return tmp.textContent || tmp.innerText || "";
}

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

window.fetchModelAPI = async function (payload, apiKey) {
    const modelEl = document.getElementById('model-select');
    let model = modelEl ? modelEl.value : null;
    if (!model) {
        const storageKey = (appState.aiProvider === 'infomaniak') ? 'infomaniak_selected_model' : 'gemini_selected_model';
        model = localStorage.getItem(storageKey);
    }
    if (!model) {
        model = (appState.aiProvider === 'google' ? 'gemini-2.0-flash' : 'mistral-nemo');
    }

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
    const container = document.getElementById('token-counter-container');
    const display = document.getElementById('token-count');
    if (!container || !display) return;

    let totalChars = 0;

    // Sum contents from textarea sources
    const textareas = document.querySelectorAll('.landing-textarea');
    textareas.forEach(ta => {
        totalChars += ta.value.length;
    });

    // Sum contents from appState (extracted from files/urls)
    if (appState.sources) {
        appState.sources.forEach(s => {
            if (s.content) totalChars += s.content.length;
        });
    }

    if (totalChars > 0) {
        container.classList.remove('hidden');
        // Heuristic: ~4 chars per token
        const tokens = Math.ceil(totalChars / 4);
        display.innerText = tokens.toLocaleString() + ' Tokens (stima)';

        // Visual feedback based on size
        if (tokens > 30000) {
            display.classList.add('text-rose-600', 'border-rose-200');
            display.classList.remove('text-indigo-600', 'border-indigo-100');
        } else {
            display.classList.remove('text-rose-600', 'border-rose-200');
            display.classList.add('text-indigo-600', 'border-indigo-100');
        }
    } else {
        container.classList.add('hidden');
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
    if (!name) return;
    // Rimuovi estensione
    const cleanName = name.replace(/\.[^/.]+$/, "");
    window.addL1Input(cleanName);
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
    // For KG: fallback to keywords or focus if root name is empty
    if (appState.extractionMode !== 'mindmap' && !rootName) {
        const kgKeywords = document.getElementById('kg-keywords-input')?.value.trim();
        const focusVal = document.getElementById('focus-input')?.value.trim();
        rootName = kgKeywords || focusVal || '';
        if (!rootName) {
            window.showToast("Inserisci l'oggetto dello studio o le keyword nel campo Guida AI.", "error");
            return;
        }
    }

    appState.rootNodeLabel = rootName;
    appState.focusTopic = document.getElementById('focus-input')?.value.trim();

    var textParts = [];
    var fileParts = [];
    var hasSources = false;

    appState.generationUsage = { promptTokens: 0, candidateTokens: 0, totalTokens: 0, usedModel: document.getElementById('model-select').value };

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
        if (appState.multiPassMode) {
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

async function extractMindMapIterative(textParts, fileParts, apiKey) {
    try {
        const rootId = "ROOT";

        window.resetVaultState();

        appState.db = {
            nodes: [{ id: rootId, label: appState.rootNodeLabel, content: "Argomento principale dello studio.", level: 0, chunks: [], studyStatus: 'none', desc: "Argomento principale dello studio." }],
            links: [],
            sourcesDict: {},
            customColors: {}
        };

        window.showLoadingOverlay(true, `${appState.aiProvider === 'google' ? 'Google Studio' : 'Infomaniak'}: Analisi introduttiva dell'argomento principale...`);
        try {
            const payloadL0 = {
                contents: [{ parts: [{ text: `Analizza le fonti testuali e scrivi un chiaro ed esaustivo paragrafo introduttivo in Italiano (max 40 parole) che spieghi a livello generale il tema: "${appState.rootNodeLabel}".\n\nFONTI:\n${textParts.slice(0, 3).join('\n')}` }] }],
                generationConfig: { temperature: 0.2, responseMimeType: "text/plain" }
            };
            const dataL0 = await window.fetchModelAPI(payloadL0, apiKey);
            const l0Text = dataL0.candidates && dataL0.candidates[0] && dataL0.candidates[0].content && dataL0.candidates[0].content.parts && dataL0.candidates[0].content.parts[0].text;
            if (l0Text) {
                appState.db.nodes[0].content = l0Text.trim();
                appState.db.nodes[0].desc = l0Text.trim();
            }
        } catch (e) { console.log("L0 fallito", e); }

        let l1Data = Array.from(document.querySelectorAll('.l1-topic-input'))
            .map(i => i.value.trim())
            .filter(v => v)
            .map(lbl => ({ label: lbl, rel: "include" }));

        const autoGenerateL1 = document.getElementById('l1-auto-generate-toggle').checked;
        const maxBranches = parseInt(document.getElementById('branches-slider').value) || 0;

        if (l1Data.length === 0 || autoGenerateL1) {
            window.showLoadingOverlay(true, `${appState.aiProvider === 'google' ? 'Google Studio' : 'Infomaniak'}: Individuazione delle Macro-Categorie...`);
            let promptL1 = window.fillPromptTemplate("L1_MACRO_CATEGORIES", {
                rootNodeLabel: appState.rootNodeLabel,
                optionalL1Labels: l1Data.length > 0 ? `Devi ASSOLUTAMENTE includere le seguenti categorie richieste dall'utente: ${JSON.stringify(l1Data.map(x => x.label))}.\\n` : '',
                textParts: textParts.join('\\n')
            });

            const schemaL1 = {
                type: "ARRAY",
                items: {
                    type: "OBJECT",
                    properties: {
                        label: { type: "STRING" },
                        rel: { type: "STRING" }
                    },
                    required: ["label", "rel"]
                }
            };

            const payloadL1 = {
                contents: [{ parts: [{ text: promptL1 }] }],
                generationConfig: { temperature: 0.2, responseMimeType: "application/json", responseSchema: schemaL1 }
            };

            const dataL1 = await window.fetchModelAPI(payloadL1, apiKey);
            const candidateL1 = dataL1.candidates && dataL1.candidates[0];
            if (candidateL1 && candidateL1.content && candidateL1.content.parts) {
                let rawL1 = candidateL1.content.parts[0].text;
                let cleanL1Text = rawL1.split(MARKER_JSON).join('').split(MARKER_END).join('').trim();
                let generatedL1s = JSON.parse(cleanL1Text);
                generatedL1s.forEach(gL1 => {
                    if (typeof gL1 === 'string') gL1 = { label: gL1, rel: "include" };
                    if (!l1Data.some(existing => existing.label.toLowerCase() === gL1.label.toLowerCase())) {
                        l1Data.push(gL1);
                    } else {
                        // Se l'IA ha trovato una relazione migliore per un label manuale, aggiorniamola
                        let existing = l1Data.find(x => x.label.toLowerCase() === gL1.label.toLowerCase());
                        if (existing && existing.rel === "include") existing.rel = gL1.rel;
                    }
                });
            }
        }

        if (l1Data.length === 0) l1Data = [{ label: "Concetti Principali", rel: "include" }];

        let l1NodesData = [];
        l1Data.forEach((item, idx) => {
            let l1Id = `L1_${idx}`;
            // Assegniamo un gruppo unico (idx + 1) per garantire colori diversi agli Hub
            let nodeObj = {
                id: l1Id,
                label: item.label,
                content: item.label,
                desc: `Categoria principale: ${item.label}`,
                level: 1,
                group: idx + 1,
                chunks: [],
                studyStatus: 'none'
            };
            l1NodesData.push(nodeObj);
            appState.db.nodes.push(nodeObj);
            appState.db.links.push({ source: rootId, target: l1Id, rel: item.rel || "include" });
        });

        const schemaBranch = {
            type: "OBJECT",
            properties: {
                nodes: {
                    type: "ARRAY",
                    items: {
                        type: "OBJECT",
                        properties: {
                            id: { type: "STRING" },
                            label: { type: "STRING" },
                            content: { type: "STRING" },
                            desc: { type: "STRING" },
                            level: { type: "INTEGER" },
                            chunks: { type: "ARRAY", items: { type: "STRING" } }
                        },
                        required: ["id", "label", "content", "desc", "level", "chunks"]
                    }
                },
                links: {
                    type: "ARRAY",
                    items: {
                        type: "OBJECT",
                        properties: {
                            source: { type: "STRING" },
                            target: { type: "STRING" },
                            rel: { type: "STRING" }
                        },
                        required: ["source", "target", "rel"]
                    }
                }
            },
            required: ["nodes", "links"]
        };


        let l1LabelsStr = l1NodesData.map(n => `- ID: ${n.id} | Etichetta: "${n.label}"`).join('\n');

        window.showLoadingOverlay(true, `${appState.aiProvider === 'google' ? 'Google Studio' : 'Infomaniak'}: Generazione dell'intero albero della mappa in corso...`);

        let userProfileStr = '';
        if (appState.userProfile) {
            userProfileStr = `\n\nPROFILO STUDENTE DESTINATARIO DELLA MAPPA:\nEtà: ${appState.userProfile.age} anni. Scuola: ${appState.userProfile.grade}. Sistema scolastico: ${appState.userProfile.system}. ADATTA IL LINGUAGGIO! I concetti e le descrizioni devono essere riscritti per essere perfettamente comprensibili a un allievo di questa età. Usa un linguaggio semplice, frasi brevi ed esempi adatti a lui. EVITA IL LINGUAGGIO ACCADEMICO O UNIVERSITARIO.`;
        }

        if (appState.studentMode) {
            userProfileStr += `\n\n[MODALITÀ STUDENTE ATTIVA]: I TITOLI DEI NODI ('label') DEVONO ESSERE COMPOSTI DA UN MASSIMO ASSOLUTO DI 3 PAROLE CHIAVE. Nessun titolo lungo, solo keyword.`;
        }

        let optionalMaxBranches = maxBranches > 0 ? `\nDEVI ASSOLUTAMENTE generare ALMENO ${maxBranches} sotto-rami per ogni macro-area per popolare l'albero in modo folto e dettagliato.` : '';

        let promptKey = "MIND_MAP_FULL_TREE";
        let promptFullTree = window.fillPromptTemplate(promptKey, {
            rootNodeLabel: appState.rootNodeLabel,
            l1LabelsStr: l1LabelsStr,
            optionalMaxBranches: optionalMaxBranches,
            userProfileStr: userProfileStr,
            textParts: textParts.join('\n\n')
        });

        const payloadTree = {
            contents: [{ parts: [...fileParts, { text: promptFullTree }] }],
            systemInstruction: { parts: [{ text: MIND_MAP_SYSTEM_INSTRUCTION }] },
            generationConfig: { temperature: 0.3, responseMimeType: "application/json", responseSchema: schemaBranch, maxOutputTokens: 8192 }
        };

        try {
            const dataTree = await window.fetchModelAPI(payloadTree, apiKey);
            const cand = dataTree.candidates && dataTree.candidates[0];
            if (cand && cand.content && cand.content.parts) {
                let rawText = cand.content.parts[0].text;
                let cleanText = rawText.split(MARKER_JSON).join('').split(MARKER_END).join('').trim();
                let branchData = salvageTruncatedJSON(cleanText);

                const normalizeLabel = (lbl) => lbl.toLowerCase().replace(/^(il|lo|la|i|gli|le|un|uno|una)\s+/i, '').replace(/^(l|un|dell|nell|all|dall|sull)['''']\s*/i, '').replace(/[''''\.\s]/g, '').trim();
                const normalizeId = (id) => typeof id === 'string' ? id.trim().toUpperCase() : id;
                const aiToRealIdMap = {};

                // Estrattore robusto per mappare l'appartenenza a una macro-area L1
                const extractL1Branch = (nodeId) => {
                    if (!nodeId) return null;
                    const cleanId = nodeId.toUpperCase();

                    // 1. Formato esplicito L1_X (es. L1_3, L1_3_L2_A)
                    const m1 = cleanId.match(/L1_(\d+)/);
                    if (m1) return `L1_${m1[1]}`;

                    // 2. Formato implicito LX_Y_... (es. L2_3_2, L3_3_2_1)
                    const m2 = cleanId.match(/^L\d+_(\d+)/);
                    if (m2) return `L1_${m2[1]}`;

                    return null;
                };

                // Risolutore matematico per gerarchie ID strutturate (es: L3_3_2_1 -> L2_3_2)
                const findParentIdByIdStructure = (nodeId, level) => {
                    if (!nodeId || level <= 1) return null;
                    const cleanId = nodeId.toUpperCase();

                    const match = cleanId.match(/^L\d+_([\d_]+)$/);
                    if (match) {
                        const parts = match[1].split('_');
                        if (parts.length > 1) {
                            parts.pop();
                            const parentLevel = level - 1;
                            const parentId = `L${parentLevel}_${parts.join('_')}`;

                            const parentExists = appState.db.nodes.some(n => n.id.toUpperCase() === parentId);
                            if (parentExists) return parentId;
                        }
                    }
                    return null;
                };

                // COSTRUZIONE STRUTTURA GERARCHICA DI SICUREZZA (FAILSAFE HIERARCHY RECONSTRUCTION)
                const lastNodeInBranch = {};
                // Inizializza con i nodi L1 correnti
                appState.db.nodes.forEach(node => {
                    if (node.level === 1) {
                        const l1Id = node.id.toUpperCase();
                        lastNodeInBranch[l1Id] = { 1: l1Id };
                    }
                });

                if (branchData.nodes && Array.isArray(branchData.nodes)) {
                    // Pre-calculate parent mapping from links to aggregate chunks
                    const parentMap = {};
                    if (branchData.links) {
                        branchData.links.forEach(l => { parentMap[l.target] = l.source; });
                    }

                    branchData.nodes.forEach(n => {
                        n.id = normalizeId(n.id);
                        let existingNode = appState.db.nodes.find(x => normalizeId(x.id) === n.id);
                        let realMatch = !existingNode ? appState.db.nodes.find(ex => normalizeLabel(ex.label) === normalizeLabel(n.label)) : null;

                        let targetId = n.id;
                        if (existingNode) {
                            if (n.content) existingNode.content = n.content;
                            if (n.desc) existingNode.desc = n.desc;
                            aiToRealIdMap[n.id] = existingNode.id;
                            targetId = existingNode.id;
                        } else if (realMatch) {
                            aiToRealIdMap[n.id] = realMatch.id;
                            if (n.content && !realMatch.content) realMatch.content = n.content;
                            if (n.desc && !realMatch.desc) realMatch.desc = n.desc;
                            targetId = realMatch.id;
                        } else {
                            aiToRealIdMap[n.id] = n.id;
                            let nodeLevel = parseInt(n.level);
                            if (isNaN(nodeLevel)) nodeLevel = 2;

                            const desc = n.desc || n.content || "";
                            appState.db.nodes.push({
                                ...n,
                                level: nodeLevel,
                                studyStatus: 'none',
                                desc,
                                aiDesc: desc,
                                chunks: n.chunks || []
                            });
                        }

                        // Registra nel tracker gerarchico per ramo L1
                        const l1Branch = extractL1Branch(targetId);
                        if (l1Branch) {
                            if (!lastNodeInBranch[l1Branch]) lastNodeInBranch[l1Branch] = { 1: l1Branch };
                            lastNodeInBranch[l1Branch][n.level] = targetId;
                        }

                        // Citations logic
                        if (n.chunks && n.chunks.length > 0) {
                            let l1ParentName = "Documento";
                            let currentP = n.id;
                            let sP = 0;
                            while (parentMap[currentP] && sP < 10) {
                                sP++;
                                let pId = normalizeId(parentMap[currentP]);
                                let mappedPId = aiToRealIdMap[pId] || pId;
                                let pNode = appState.db.nodes.find(x => normalizeId(x.id) === mappedPId);
                                if (pNode && pNode.level === 1) { l1ParentName = pNode.label; break; }
                                currentP = pId;
                            }
                            appState.db.sourcesDict[targetId] = n.chunks.map(c => ({ title: "Testo di origine", source: l1ParentName, text: c }));
                        }
                    });
                }

                if (branchData.links && Array.isArray(branchData.links)) {
                    const findNodeId = (idOrLabel) => {
                        if (!idOrLabel) return null;
                        const cleaned = idOrLabel.toString().trim();
                        const upper = cleaned.toUpperCase();

                        // 1. Cerca per ID esatto
                        let found = appState.db.nodes.find(n => n.id.toUpperCase() === upper);
                        if (found) return found.id;

                        // 2. Cerca tramite mappatura aiToRealIdMap
                        if (aiToRealIdMap[upper]) {
                            let mappedNode = appState.db.nodes.find(n => n.id === aiToRealIdMap[upper]);
                            if (mappedNode) return mappedNode.id;
                        }

                        // 3. Cerca per Etichetta (Label) normalizzata
                        const norm = normalizeLabel(cleaned);
                        found = appState.db.nodes.find(n => normalizeLabel(n.label) === norm);
                        if (found) return found.id;

                        // 4. Cerca per ID normalizzato
                        found = appState.db.nodes.find(n => normalizeLabel(n.id) === norm);
                        if (found) return found.id;

                        return null;
                    };

                    branchData.links.forEach(l => {
                        if (l.source && l.target) {
                            let s = findNodeId(l.source);
                            let t = findNodeId(l.target);

                            // Fallback se il resolver semantico fallisce
                            if (!s) s = aiToRealIdMap[normalizeId(l.source)] || normalizeId(l.source);
                            if (!t) t = aiToRealIdMap[normalizeId(l.target)] || normalizeId(l.target);

                            if (s && t && s !== t) {
                                const sExists = appState.db.nodes.some(nx => nx.id === s);
                                const tExists = appState.db.nodes.some(nx => nx.id === t);

                                if (sExists && tExists) {
                                    // Evita duplicati di link
                                    const linkExists = appState.db.links.some(lk => lk.source === s && lk.target === t);
                                    if (!linkExists) {
                                        appState.db.links.push({ source: s, target: t, rel: l.rel || "include" });
                                    }
                                }
                            }
                        }
                    });
                }

                // 2. AUTO-LINK ORPHANED NODES (FAILSAFE COSTRUZIONE RAMI)
                // Collega qualsiasi nodo gerarchico a cui sono mancati i link a causa di troncamento JSON o ID impliciti
                appState.db.nodes.forEach(node => {
                    if (node.level > 1) {
                        const hasIncomingLink = appState.db.links.some(lk => {
                            const tid = typeof lk.target === 'object' ? lk.target.id : lk.target;
                            return tid === node.id;
                        });

                        if (!hasIncomingLink) {
                            // A. Prova tramite la struttura matematica dell'ID (es: L3_3_2_1 -> L2_3_2)
                            let parentId = findParentIdByIdStructure(node.id, node.level);

                            // B. Fallback tramite stack-tracking del ramo L1
                            if (!parentId) {
                                const l1Branch = extractL1Branch(node.id);
                                if (l1Branch && lastNodeInBranch[l1Branch]) {
                                    let parentLevel = node.level - 1;
                                    while (parentLevel >= 1 && !parentId) {
                                        if (lastNodeInBranch[l1Branch][parentLevel]) {
                                            parentId = lastNodeInBranch[l1Branch][parentLevel];
                                        }
                                        parentLevel--;
                                    }
                                }
                            }

                            if (parentId && parentId !== node.id) {
                                appState.db.links.push({
                                    source: parentId,
                                    target: node.id,
                                    rel: "include"
                                });
                                console.log(`Failsafe Link Creato: ${parentId} -> ${node.id}`);
                            }
                        }
                    }
                });

                // ASSEGNAZIONE GRUPPI (COLORI) AUTOMATICA PER NUOVI NODI
                const hubGroupMap = {};
                appState.db.nodes.filter(n => n.level === 1).forEach(h => { hubGroupMap[h.id] = h.group; });

                appState.db.nodes.forEach(node => {
                    if (node.level > 1 && (!node.group || node.group === 0)) {
                        // Cerca l'Hub L1 più vicino tramite i link
                        const visited = new Set([node.id]);
                        const queue = [node.id];
                        let foundGroup = null;
                        while (queue.length > 0 && !foundGroup) {
                            const cur = queue.shift();
                            if (hubGroupMap[cur]) { foundGroup = hubGroupMap[cur]; break; }
                            appState.db.links.forEach(l => {
                                const sid = typeof l.source === 'object' ? l.source.id : l.source;
                                const tid = typeof l.target === 'object' ? l.target.id : l.target;
                                if (sid === cur && !visited.has(tid)) { visited.add(tid); queue.push(tid); }
                                if (tid === cur && !visited.has(sid)) { visited.add(sid); queue.push(sid); }
                            });
                        }
                        if (foundGroup) node.group = foundGroup;
                    }
                });
            }
        } catch (e) {
            console.warn("Errore durante la generazione single-pass:", e);
            window.showToast("Errore durante la generazione dell'albero.", "error");
        }

        const validNodeIds = new Set(appState.db.nodes.map(n => n.id));
        appState.db.links = appState.db.links.filter(l => validNodeIds.has(l.source) && validNodeIds.has(l.target));

        window.showLoadingOverlay(false);
        window.switchToMapLayout();
        setTimeout(() => { initD3Visualization(); }, 200);

        // Show Generation Report
        setTimeout(() => { window.showGenerationReport(); }, 1500);

    } catch (err) {
        window.showLoadingOverlay(false);
        window.showAlert("Errore Generazione Mappa", err.message);
    }
}

async function extractMindMapMultiPass(textParts, fileParts, apiKey) {
    try {
        const rootId = "ROOT";
        window.resetVaultState();

        appState.db = {
            nodes: [{ id: rootId, label: appState.rootNodeLabel, content: "Argomento principale dello studio.", level: 0, chunks: [], studyStatus: 'none', desc: "Argomento principale dello studio." }],
            links: [],
            sourcesDict: {},
            customColors: {}
        };

        // Fase 1: Introduzione L0
        window.showLoadingOverlay(true, "Mappa HD - Fase 1/3: Analisi introduttiva dell'argomento principale...");
        try {
            const payloadL0 = {
                contents: [{ parts: [{ text: `Analizza le fonti testuali e scrivi un chiaro ed esaustivo paragrafo introduttivo in Italiano (max 40 parole) che spieghi a livello generale il tema: "${appState.rootNodeLabel}".\n\nFONTI:\n${textParts.slice(0, 3).join('\n')}` }] }],
                generationConfig: { temperature: 0.2, responseMimeType: "text/plain" }
            };
            const dataL0 = await window.fetchModelAPI(payloadL0, apiKey);
            const l0Text = dataL0.candidates && dataL0.candidates[0] && dataL0.candidates[0].content && dataL0.candidates[0].content.parts && dataL0.candidates[0].content.parts[0].text;
            if (l0Text) {
                appState.db.nodes[0].content = l0Text.trim();
                appState.db.nodes[0].desc = l0Text.trim();
            }
        } catch (e) { console.warn("L0 fallito", e); }

        // Fase 2: Macro-Categorie L1
        let l1Data = Array.from(document.querySelectorAll('.l1-topic-input'))
            .map(i => i.value.trim())
            .filter(v => v)
            .map(lbl => ({ label: lbl, rel: "include" }));

        const autoGenerateL1 = document.getElementById('l1-auto-generate-toggle').checked;

        if (l1Data.length === 0 || autoGenerateL1) {
            window.showLoadingOverlay(true, "Mappa HD - Fase 2/3: Individuazione delle Macro-Categorie...");
            let promptL1 = window.fillPromptTemplate("L1_MACRO_CATEGORIES", {
                rootNodeLabel: appState.rootNodeLabel,
                optionalL1Labels: l1Data.length > 0 ? `Devi ASSOLUTAMENTE includere le seguenti categorie richieste dall'utente: ${JSON.stringify(l1Data.map(x => x.label))}.\\n` : '',
                textParts: textParts.join('\\n')
            });

            const schemaL1 = {
                type: "ARRAY",
                items: {
                    type: "OBJECT",
                    properties: {
                        label: { type: "STRING" },
                        rel: { type: "STRING" }
                    },
                    required: ["label", "rel"]
                }
            };

            const payloadL1 = {
                contents: [{ parts: [{ text: promptL1 }] }],
                generationConfig: { temperature: 0.2, responseMimeType: "application/json", responseSchema: schemaL1 }
            };

            const dataL1 = await window.fetchModelAPI(payloadL1, apiKey);
            const candidateL1 = dataL1.candidates && dataL1.candidates[0];
            if (candidateL1 && candidateL1.content && candidateL1.content.parts) {
                let rawL1 = candidateL1.content.parts[0].text;
                let cleanL1Text = rawL1.split(MARKER_JSON).join('').split(MARKER_END).join('').trim();
                let generatedL1s = JSON.parse(cleanL1Text);
                generatedL1s.forEach(gL1 => {
                    if (typeof gL1 === 'string') gL1 = { label: gL1, rel: "include" };
                    if (!l1Data.some(existing => existing.label.toLowerCase() === gL1.label.toLowerCase())) {
                        l1Data.push(gL1);
                    } else {
                        let existing = l1Data.find(x => x.label.toLowerCase() === gL1.label.toLowerCase());
                        if (existing && existing.rel === "include") existing.rel = gL1.rel;
                    }
                });
            }
        }

        if (l1Data.length === 0) l1Data = [{ label: "Concetti Principali", rel: "include" }];

        let l1NodesData = [];
        l1Data.forEach((item, idx) => {
            let l1Id = `L1_${idx}`;
            let nodeObj = {
                id: l1Id,
                label: item.label,
                content: item.label,
                desc: `Categoria principale: ${item.label}`,
                level: 1,
                group: idx + 1,
                chunks: [],
                studyStatus: 'none'
            };
            l1NodesData.push(nodeObj);
            appState.db.nodes.push(nodeObj);
            appState.db.links.push({ source: rootId, target: l1Id, rel: item.rel || "include" });
        });

        // Fase 3: Generazione dei rami Branch-by-Branch (Multi-Pass HD)
        const schemaBranch = {
            type: "OBJECT",
            properties: {
                nodes: {
                    type: "ARRAY",
                    items: {
                        type: "OBJECT",
                        properties: {
                            id: { type: "STRING" },
                            label: { type: "STRING" },
                            content: { type: "STRING" },
                            desc: { type: "STRING" },
                            level: { type: "INTEGER" },
                            chunks: { type: "ARRAY", items: { type: "STRING" } }
                        },
                        required: ["id", "label", "content", "desc", "level", "chunks"]
                    }
                },
                links: {
                    type: "ARRAY",
                    items: {
                        type: "OBJECT",
                        properties: {
                            source: { type: "STRING" },
                            target: { type: "STRING" },
                            rel: { type: "STRING" }
                        },
                        required: ["source", "target", "rel"]
                    }
                }
            },
            required: ["nodes", "links"]
        };

        let userProfileStr = '';
        if (appState.userProfile) {
            userProfileStr = `\n\nPROFILO STUDENTE DESTINATARIO DELLA MAPPA:\nEtà: ${appState.userProfile.age} anni. Scuola: ${appState.userProfile.grade}. Sistema scolastico: ${appState.userProfile.system}. ADATTA IL LINGUAGGIO! I concetti e le descrizioni devono essere riscritti per essere perfettamente comprensibili a un allievo di questa età. Usa un linguaggio semplice, frasi brevi ed esempi adatti a lui. EVITA IL LINGUAGGIO ACCADEMICO O UNIVERSITARIO.`;
        }

        if (appState.studentMode) {
            userProfileStr += `\n\n[MODALITÀ STUDENTE ATTIVA]: I TITOLI DEI NODI ('label') DEVONO ESSERE COMPOSTI DA UN MASSIMO ASSOLUTO DI 3 PAROLE CHIAVE. Nessun titolo lungo, solo keyword.`;
        }

        const totalBranches = l1NodesData.length;
        const normalizeLabel = (lbl) => lbl.toLowerCase().replace(/^(il|lo|la|i|gli|le|un|uno|una)\s+/i, '').replace(/^(l|un|dell|nell|all|dall|sull)['''']\s*/i, '').replace(/[''''\.\s]/g, '').trim();
        const normalizeId = (id) => typeof id === 'string' ? id.trim().toUpperCase() : id;

        const aiToRealIdMap = {};
        const lastNodeInBranch = {};

        // Inizializza tracciamento dei rami
        l1NodesData.forEach(n => {
            lastNodeInBranch[n.id.toUpperCase()] = { 1: n.id };
        });

        for (let idx = 0; idx < totalBranches; idx++) {
            const branch = l1NodesData[idx];
            window.showLoadingOverlay(true, `Mappa HD - Fase 3/3: Generazione Ramo "${branch.label}" (Ramo ${idx + 1}/${totalBranches})...`);

            const promptBranch = `SEI UN MOTORE DI GENERAZIONE SOTTO-RAMI PER MAPPE MENTALI (Fase 3 - Dettagli del Ramo).
Hai il compito di sviluppare il sotto-ramo per la macro-area "${branch.label}" (ID di partenza: "${branch.id}") all'interno della Mappa Mentale su "${appState.rootNodeLabel}".

ISTRUZIONI PER IL RAMO:
1. Genera tutti i sotto-nodi di Livello 2 e Livello 3 che appartengono a questa macro-area.
2. Ciascun sotto-nodo generato deve definire:
   - "id": un ID unico in lettere maiuscole coerente con la gerarchia del ramo (es. ${branch.id}_L2_A, ${branch.id}_L3_A1).
   - "label": titolo sintetico e focalizzato (max 3 parole).
   - "content": sintesi didattica brevissima (max 10 parole).
   - "desc": descrizione scientifica o storica approfondita ma chiarissima (da 30 a 50 parole) tarata sul profilo dello studente indicato.
   - "level": assegna 2 per sotto-rami di dettaglio primario, 3 per concetti di approfondimento/foglia.
   - "chunks": un array contenente da 1 a 2 citazioni testuali REALI, INTEGRALI e VERBATIM (minimo 10-15 parole) copiate fedelmente dalle fonti testuali originali.
3. Definisci i collegamenti ("links") collegando i nodi generati in un albero gerarchico. Ogni nodo di livello 2 deve avere come sorgente ("source") l'ID di partenza "${branch.id}". Ogni nodo di livello 3 deve avere come sorgente ("source") il rispettivo nodo di livello 2. Non creare connessioni trasversali.

Restituisci SOLO un oggetto JSON con chiavi "nodes" e "links". Nessun commento, nessun blocco markdown.
Formato richiesto:
{
  "nodes": [
    { "id": "ID_NODO", "label": "Label", "content": "Sintesi", "desc": "Descrizione...", "level": 2 o 3, "chunks": ["Citazione"] }
  ],
  "links": [
    { "source": "ID_PADRE", "target": "ID_FIGLIO", "rel": "include" }
  ]
}

${userProfileStr}

FONTI DA ANALIZZARE:
${textParts.join('\n\n')}`;

            const payloadBranch = {
                contents: [{ parts: [...fileParts, { text: promptBranch }] }],
                systemInstruction: { parts: [{ text: "Sei un ordinatore gerarchico di concetti per mappe mentali. Rispondi solo in JSON conforme allo schema." }] },
                generationConfig: { temperature: 0.25, responseMimeType: "application/json", responseSchema: schemaBranch, maxOutputTokens: 3000 }
            };

            try {
                const dataBranch = await window.fetchModelAPI(payloadBranch, apiKey);
                const cand = dataBranch.candidates && dataBranch.candidates[0];
                if (cand && cand.content && cand.content.parts) {
                    let rawText = cand.content.parts[0].text;
                    let cleanText = rawText.split(MARKER_JSON).join('').split(MARKER_END).join('').trim();
                    let branchData = salvageTruncatedJSON(cleanText);

                    if (branchData.nodes && Array.isArray(branchData.nodes)) {
                        // Pre-calcola parent mapping
                        const parentMap = {};
                        if (branchData.links) {
                            branchData.links.forEach(l => { parentMap[l.target] = l.source; });
                        }

                        branchData.nodes.forEach(n => {
                            n.id = normalizeId(n.id);
                            let existingNode = appState.db.nodes.find(x => normalizeId(x.id) === n.id);
                            let realMatch = !existingNode ? appState.db.nodes.find(ex => normalizeLabel(ex.label) === normalizeLabel(n.label)) : null;

                            let targetId = n.id;
                            if (existingNode) {
                                if (n.content) existingNode.content = n.content;
                                if (n.desc) existingNode.desc = n.desc;
                                aiToRealIdMap[n.id] = existingNode.id;
                                targetId = existingNode.id;
                            } else if (realMatch) {
                                aiToRealIdMap[n.id] = realMatch.id;
                                if (n.content && !realMatch.content) realMatch.content = n.content;
                                if (n.desc && !realMatch.desc) realMatch.desc = n.desc;
                                targetId = realMatch.id;
                            } else {
                                aiToRealIdMap[n.id] = n.id;
                                let nodeLevel = parseInt(n.level);
                                if (isNaN(nodeLevel)) nodeLevel = 2;

                                const desc = n.desc || n.content || "";
                                appState.db.nodes.push({
                                    ...n,
                                    level: nodeLevel,
                                    studyStatus: 'none',
                                    desc,
                                    aiDesc: desc,
                                    chunks: n.chunks || []
                                });
                            }

                            // Registra nel tracker
                            const cleanId = targetId.toUpperCase();
                            const m1 = cleanId.match(/L1_(\d+)/);
                            const l1Branch = m1 ? `L1_${m1[1]}` : branch.id;
                            if (!lastNodeInBranch[l1Branch]) lastNodeInBranch[l1Branch] = { 1: l1Branch };
                            lastNodeInBranch[l1Branch][n.level] = targetId;

                            // Citazioni
                            if (n.chunks && n.chunks.length > 0) {
                                let l1ParentName = branch.label;
                                appState.db.sourcesDict[targetId] = n.chunks.map(c => ({ title: "Testo di origine", source: l1ParentName, text: c }));
                            }
                        });
                    }

                    if (branchData.links && Array.isArray(branchData.links)) {
                        const findNodeId = (idOrLabel) => {
                            if (!idOrLabel) return null;
                            const cleaned = idOrLabel.toString().trim();
                            const upper = cleaned.toUpperCase();

                            let found = appState.db.nodes.find(n => n.id.toUpperCase() === upper);
                            if (found) return found.id;

                            if (aiToRealIdMap[upper]) {
                                let mappedNode = appState.db.nodes.find(n => n.id === aiToRealIdMap[upper]);
                                if (mappedNode) return mappedNode.id;
                            }

                            const norm = normalizeLabel(cleaned);
                            found = appState.db.nodes.find(n => normalizeLabel(n.label) === norm);
                            if (found) return found.id;

                            return null;
                        };

                        branchData.links.forEach(l => {
                            if (l.source && l.target) {
                                let s = findNodeId(l.source);
                                let t = findNodeId(l.target);

                                if (!s) s = aiToRealIdMap[normalizeId(l.source)] || normalizeId(l.source);
                                if (!t) t = aiToRealIdMap[normalizeId(l.target)] || normalizeId(l.target);

                                if (s && t && s !== t) {
                                    const sExists = appState.db.nodes.some(nx => nx.id === s);
                                    const tExists = appState.db.nodes.some(nx => nx.id === t);

                                    if (sExists && tExists) {
                                        const linkExists = appState.db.links.some(lk => lk.source === s && lk.target === t);
                                        if (!linkExists) {
                                            appState.db.links.push({ source: s, target: t, rel: l.rel || "include" });
                                        }
                                    }
                                }
                            }
                        });
                    }
                }
            } catch (branchErr) {
                console.error(`Errore nel ramo ${branch.label}:`, branchErr);
                // Fallback auto-healing per questo ramo
                const fallbackL2Id = `${branch.id}_L2_FALLBACK`;
                appState.db.nodes.push({
                    id: fallbackL2Id,
                    label: `Approfondimento ${branch.label}`,
                    content: `Sotto-ramo di ${branch.label}`,
                    desc: `Studio analitico per la macro-area ${branch.label}.`,
                    level: 2,
                    chunks: [],
                    studyStatus: 'none'
                });
                appState.db.links.push({ source: branch.id, target: fallbackL2Id, rel: "dettagli" });
            }
        }

        // AUTO-LINK ORPHANED NODES
        const findParentIdByIdStructure = (nodeId, level) => {
            if (!nodeId || level <= 1) return null;
            const cleanId = nodeId.toUpperCase();
            const match = cleanId.match(/^L\d+_([\d_]+)$/);
            if (match) {
                const parts = match[1].split('_');
                if (parts.length > 1) {
                    parts.pop();
                    const parentLevel = level - 1;
                    const parentId = `L${parentLevel}_${parts.join('_')}`;
                    const parentExists = appState.db.nodes.some(n => n.id.toUpperCase() === parentId);
                    if (parentExists) return parentId;
                }
            }
            return null;
        };

        const extractL1Branch = (nodeId) => {
            if (!nodeId) return null;
            const cleanId = nodeId.toUpperCase();
            const m1 = cleanId.match(/L1_(\d+)/);
            if (m1) return `L1_${m1[1]}`;
            const m2 = cleanId.match(/^L\d+_(\d+)/);
            if (m2) return `L1_${m2[1]}`;
            return null;
        };

        appState.db.nodes.forEach(node => {
            if (node.level > 1) {
                const hasIncomingLink = appState.db.links.some(lk => {
                    const tid = typeof lk.target === 'object' ? lk.target.id : lk.target;
                    return tid === node.id;
                });

                if (!hasIncomingLink) {
                    let parentId = findParentIdByIdStructure(node.id, node.level);
                    if (!parentId) {
                        const l1Branch = extractL1Branch(node.id);
                        if (l1Branch && lastNodeInBranch[l1Branch]) {
                            let parentLevel = node.level - 1;
                            while (parentLevel >= 1 && !parentId) {
                                if (lastNodeInBranch[l1Branch][parentLevel]) {
                                    parentId = lastNodeInBranch[l1Branch][parentLevel];
                                }
                                parentLevel--;
                            }
                        }
                    }

                    if (parentId && parentId !== node.id) {
                        appState.db.links.push({
                            source: parentId,
                            target: node.id,
                            rel: "include"
                        });
                    }
                }
            }
        });

        // ASSEGNAZIONE GRUPPI (COLORI) AUTOMATICA PER NUOVI NODI
        const hubGroupMap = {};
        appState.db.nodes.filter(n => n.level === 1).forEach(h => { hubGroupMap[h.id] = h.group; });

        appState.db.nodes.forEach(node => {
            if (node.level > 1 && (!node.group || node.group === 0)) {
                const visited = new Set([node.id]);
                const queue = [node.id];
                let foundGroup = null;
                while (queue.length > 0 && !foundGroup) {
                    const cur = queue.shift();
                    if (hubGroupMap[cur]) { foundGroup = hubGroupMap[cur]; break; }
                    appState.db.links.forEach(l => {
                        const sid = typeof l.source === 'object' ? l.source.id : l.source;
                        const tid = typeof l.target === 'object' ? l.target.id : l.target;
                        if (sid === cur && !visited.has(tid)) { visited.add(tid); queue.push(tid); }
                        if (tid === cur && !visited.has(sid)) { visited.add(sid); queue.push(sid); }
                    });
                }
                if (foundGroup) node.group = foundGroup;
            }
        });

        const validNodeIds = new Set(appState.db.nodes.map(n => n.id));
        appState.db.links = appState.db.links.filter(l => validNodeIds.has(l.source) && validNodeIds.has(l.target));

        window.showLoadingOverlay(false);
        window.switchToMapLayout();
        setTimeout(() => { initD3Visualization(); }, 200);
        setTimeout(() => { window.showGenerationReport(); }, 1500);

    } catch (err) {
        window.showLoadingOverlay(false);
        window.showAlert("Errore Generazione Mappa HD", err.message);
    }
}

function salvageTruncatedJSON(text) {
    try {
        return JSON.parse(text);
    } catch (e) {
        console.warn("JSON parse failed, attempting to salvage truncated JSON...");
        let tempText = text;

        while (tempText.lastIndexOf('}') !== -1) {
            let lastClose = tempText.lastIndexOf('}');
            let salvaged = tempText.substring(0, lastClose + 1);

            let openBraces = (salvaged.match(/\{/g) || []).length;
            let closeBraces = (salvaged.match(/\}/g) || []).length;
            let openBrackets = (salvaged.match(/\[/g) || []).length;
            let closeBrackets = (salvaged.match(/\]/g) || []).length;

            while (closeBrackets < openBrackets) { salvaged += ']'; closeBrackets++; }
            while (closeBraces < openBraces) { salvaged += '}'; closeBraces++; }

            try {
                return JSON.parse(salvaged);
            } catch (e2) {
                // If it still fails (e.g. cut off inside a string with a brace), cut off the last brace and try again
                tempText = tempText.substring(0, lastClose);
            }
        }

        console.error("Failed to salvage JSON entirely");
        throw e; // Throw original error if all salvage attempts fail
    }
}

async function extractKnowledgeGraphSinglePass(textParts, fileParts, apiKey) {
    window.resetVaultState();
    let kgKeywords = Array.from(document.querySelectorAll('.l1-topic-input')).map(i => i.value.trim()).filter(v => v).join(', ');

    let userProfileStr = '';
    if (appState.userProfile) {
        userProfileStr = `\n\nPROFILO STUDENTE DESTINATARIO DELLA MAPPA:\nEtà: ${appState.userProfile.age} anni. Scuola: ${appState.userProfile.grade}. Sistema scolastico: ${appState.userProfile.system}. ADATTA IL LINGUAGGIO! I concetti e le descrizioni devono essere riscritti per essere perfettamente comprensibili a un allievo di questa età. Usa un linguaggio semplice, frasi brevi ed esempi adatti a lui. EVITA IL LINGUAGGIO ACCADEMICO O UNIVERSITARIO.`;
    }

    if (appState.studentMode) {
        userProfileStr += `\n\n[MODALITÀ STUDENTE ATTIVA]: I TITOLI DEI NODI ('label') DEVONO ESSERE COMPOSTI DA UN MASSIMO ASSOLUTO DI 3 PAROLE CHIAVE. Nessun titolo lungo, solo keyword.`;
    }

    const maxNodesVal = parseInt(document.getElementById('kg-nodes-slider').value) || 20;
    const minNodesVal = Math.max(10, maxNodesVal - 5);
    const maxNodesStr = `${minNodesVal}-${maxNodesVal}`;

    const promptKey = appState.studentMode ? "KNOWLEDGE_GRAPH_SINGLE_STUDENT" : "KNOWLEDGE_GRAPH_SINGLE";

    var promptText = window.fillPromptTemplate(promptKey, {
        rootNodeLabel: appState.rootNodeLabel,
        optionalKeywords: kgKeywords ? `Focalizza le relazioni su questi Super-Hub semantici (se pertinenti): ${kgKeywords}.\\n` : '',
        userProfileInjection: userProfileStr,
        textParts: textParts.join('\\n\\n'),
        maxNodes: maxNodesStr
    });

    const schema = {
        type: "OBJECT", properties: {
            nodes: { type: "ARRAY", items: { type: "OBJECT", properties: { id: { type: "STRING" }, label: { type: "STRING" }, content: { type: "STRING" }, desc: { type: "STRING" }, level: { type: "INTEGER" }, chunks: { type: "ARRAY", items: { type: "STRING" } } }, required: ["id", "label", "content", "desc", "level", "chunks"] } },
            links: { type: "ARRAY", items: { type: "OBJECT", properties: { source: { type: "STRING" }, target: { type: "STRING" }, rel: { type: "STRING" } }, required: ["source", "target", "rel"] } }
        }, required: ["nodes", "links"]
    };

    const payload = {
        contents: [{ parts: [...fileParts, { text: promptText }] }],
        systemInstruction: { parts: [{ text: KNOWLEDGE_GRAPH_SYSTEM_INSTRUCTION }] },
        generationConfig: {
            temperature: 0.2,
            responseMimeType: "application/json",
            responseSchema: schema,
            maxOutputTokens: 8192
        }
    };


    try {
        window.showLoadingOverlay(true, `${appState.aiProvider === 'google' ? 'Google Studio' : 'Infomaniak'}: Analisi e formattazione Knowledge Graph...`);
        const data = await window.fetchModelAPI(payload, apiKey);
        let rawText = data.candidates[0].content.parts[0].text;
        let cleanText = rawText.split(MARKER_JSON).join('').split(MARKER_END).join('').trim();

        let rawData = salvageTruncatedJSON(cleanText);

        // Normalizzazione e forzatura livelli
        const normalizeLabel = (lbl) => lbl.toLowerCase().replace(/^(il|lo|la|i|gli|le|un|uno|una)\s+/i, '').replace(/^(l|un|dell|nell|all|dall|sull)['''']\s*/i, '').replace(/[''''\.\s]/g, '').trim();
        const existingHubs = Array.from(document.querySelectorAll('.l1-topic-input')).map(i => i.value.trim()).filter(v => v);

        if (rawData.nodes) {
            rawData.nodes.forEach(n => {
                n.studyStatus = 'none';

                // 1. Se è un Hub manuale dell'utente -> Forza L1 (sempre)
                // 2. Se l'IA ha proposto un Hub (L1) -> Permetti L1
                // 3. Altrimenti (L2, L3, L4...) -> Forza L2 per pulizia KG
                const isManualHub = existingHubs.some(h => normalizeLabel(h) === normalizeLabel(n.label));
                const aiWantsHub = (parseInt(n.level) === 1);

                if (isManualHub || aiWantsHub) {
                    n.level = 1;
                } else {
                    n.level = 2;
                }

                if (!n.desc) n.desc = n.content || "";
                n.aiDesc = n.desc;
            });

            // Post-processing di salvataggio: se l'IA è stata testarda e ha fatto < 3 Hub, promuoviamo noi i nodi più connessi
            let currentHubs = rawData.nodes.filter(n => n.level === 1);
            if (currentHubs.length < 3 && rawData.nodes.length > 5) {
                // Calcola il grado di connessione di ogni nodo
                const degreeMap = {};
                rawData.nodes.forEach(n => degreeMap[n.id] = 0);
                (rawData.links || []).forEach(l => {
                    const sourceId = typeof l.source === 'object' ? l.source.id : l.source;
                    const targetId = typeof l.target === 'object' ? l.target.id : l.target;
                    if (degreeMap[sourceId] !== undefined) degreeMap[sourceId]++;
                    if (degreeMap[targetId] !== undefined) degreeMap[targetId]++;
                });

                // Ordina i nodi L2 per grado di connessione decrescente
                const candidates = rawData.nodes
                    .filter(n => n.level === 2)
                    .sort((a, b) => degreeMap[b.id] - degreeMap[a.id]);

                // Promuovi i nodi migliori finché non abbiamo 3-4 Hub
                let neededHubs = Math.max(3, Math.min(5, Math.floor(rawData.nodes.length / 4))) - currentHubs.length;
                for (let i = 0; i < neededHubs && i < candidates.length; i++) {
                    candidates[i].level = 1;
                }
            }

            // Assegna group unico incrementale a ogni Hub L1
            let groupIdx = 1;
            rawData.nodes.filter(n => n.level === 1).forEach(hub => {
                hub.group = groupIdx++;
            });

            // Assegna group ai nodi L2 basandosi sulle connessioni (BFS verso Hub più vicino)
            const hubGroupMap = {};
            rawData.nodes.filter(n => n.level === 1).forEach(h => { hubGroupMap[h.id] = h.group; });
            const rawLinks = rawData.links || [];

            rawData.nodes.filter(n => n.level === 2).forEach(node => {
                // BFS per trovare l'Hub L1 più vicino
                const visited = new Set([node.id]);
                const queue = [node.id];
                let foundGroup = null;
                while (queue.length > 0 && !foundGroup) {
                    const cur = queue.shift();
                    if (hubGroupMap[cur]) { foundGroup = hubGroupMap[cur]; break; }
                    rawLinks.forEach(l => {
                        const s = typeof l.source === 'object' ? l.source.id : l.source;
                        const t = typeof l.target === 'object' ? l.target.id : l.target;
                        if (s === cur && !visited.has(t)) { visited.add(t); queue.push(t); }
                        if (t === cur && !visited.has(s)) { visited.add(s); queue.push(s); }
                    });
                    if (visited.size > 50) break;
                }
                node.group = foundGroup || 1;
            });
        }

        appState.db = rawData;
        const validNodeIds = new Set(appState.db.nodes.map(n => n.id));
        appState.db.links = (appState.db.links || []).filter(l => validNodeIds.has(l.source) && validNodeIds.has(l.target));

        appState.db.sourcesDict = {};
        appState.db.nodes.forEach(n => {
            if (n.chunks && n.chunks.length > 0) appState.db.sourcesDict[n.id] = n.chunks.map(c => ({ title: "Estratto Fonte", source: "Documento", text: c }));
        });

        window.showLoadingOverlay(false);
        window.switchToMapLayout();
        setTimeout(() => { initD3Visualization(); }, 200);
        setTimeout(() => { window.showGenerationReport(); }, 1500);
    } catch (err) {
        window.showLoadingOverlay(false);
        window.showAlert("Errore Generazione Graph", err.message);
    }
}

async function extractKnowledgeGraphMultiPass(textParts, fileParts, apiKey) {
    window.resetVaultState();
    let kgKeywords = Array.from(document.querySelectorAll('.l1-topic-input')).map(i => i.value.trim()).filter(v => v).join(', ');

    let userProfileStr = '';
    if (appState.userProfile) {
        userProfileStr = `\n\nPROFILO STUDENTE DESTINATARIO DELLA MAPPA:\nEtà: ${appState.userProfile.age} anni. Scuola: ${appState.userProfile.grade}. Sistema scolastico: ${appState.userProfile.system}. ADATTA IL LINGUAGGIO! I concetti e le descrizioni devono essere riscritti per essere perfettamente comprensibili a un allievo di questa età. Usa un linguaggio semplice, frasi brevi ed esempi adatti a lui. EVITA IL LINGUAGGIO ACCADEMICO O UNIVERSITARIO.`;
    }

    if (appState.studentMode) {
        userProfileStr += `\n\n[MODALITÀ STUDENTE ATTIVA]: I TITOLI DEI NODI ('label') DEVONO ESSERE COMPOSTI DA UN MASSIMO ASSOLUTO DI 3 PAROLE CHIAVE. Nessun titolo lungo, solo keyword.`;
    }

    const maxNodesVal = parseInt(document.getElementById('kg-nodes-slider').value) || 20;
    const minNodesVal = Math.max(10, maxNodesVal - 5);

    try {
        // ==========================================
        // FASE 1: ESTRAZIONE CONCETTI (SCHELETRO)
        // ==========================================
        window.showLoadingOverlay(true, "Fase 1/3 (HD): Estrazione dei Concetti e dei Super-Hub...");

        const p1PromptText = `SEI UN MOTORE DI ESTRAZIONE CONCETTUALE DI ALTO LIVELLO (Fase 1 di 3 - Scheletro del KG).
Hai il compito di leggere il seguente testo ed estrarre esattamente tra i ${minNodesVal} e ${maxNodesVal} concetti o entità fondamentali per descrivere il tema "${appState.rootNodeLabel}".

ISTRUZIONI:
1. Per ogni concetto, estrai:
   - "id": un ID unico e parlante in lettere maiuscole (es. FOTOSINTESI, CELLULOSA, TEORIA_COESIONE).
   - "label": un titolo sintetico e chiaro (massimo 3 parole).
   - "level": assegna valore 1 per i 3-5 concetti macro-aree principali (Super-Hub), e 2 per tutti gli altri concetti specifici di dettaglio.
2. Rispetta la lingua italiana.
3. Se l'utente ha indicato delle parole chiave di interesse (se pertinenti): [${kgKeywords}], includile assolutamente come Super-Hub (level 1) o concetti principali.

Restituisci SOLO un oggetto JSON con chiave "nodes". Nessun commento, nessun blocco markdown.
Formato richiesto:
{
  "nodes": [
    { "id": "ID_CONCETTO", "label": "Nome Concetto", "level": 1 o 2 }
  ]
}

FONTI DA ANALIZZARE:
${textParts.join('\n\n')}`;

        const p1Schema = {
            type: "OBJECT",
            properties: {
                nodes: {
                    type: "ARRAY",
                    items: {
                        type: "OBJECT",
                        properties: {
                            id: { type: "STRING" },
                            label: { type: "STRING" },
                            level: { type: "INTEGER" }
                        },
                        required: ["id", "label", "level"]
                    }
                }
            },
            required: ["nodes"]
        };

        const p1Payload = {
            contents: [{ parts: [...fileParts, { text: p1PromptText }] }],
            systemInstruction: { parts: [{ text: "Sei un analizzatore di testi accademico. Rispondi solo in JSON puro conforme allo schema richiesto." }] },
            generationConfig: { temperature: 0.15, responseMimeType: "application/json", responseSchema: p1Schema, maxOutputTokens: 2000 }
        };

        const p1Response = await window.fetchModelAPI(p1Payload, apiKey);
        let p1Raw = p1Response.candidates[0].content.parts[0].text;
        let p1Clean = p1Raw.split(MARKER_JSON).join('').split(MARKER_END).join('').trim();
        let p1Data = salvageTruncatedJSON(p1Clean);

        if (!p1Data.nodes || p1Data.nodes.length === 0) {
            throw new Error("Impossibile estrarre lo scheletro dei nodi concettuali.");
        }

        const extractedNodes = p1Data.nodes;

        // ==========================================
        // FASE 2: ESTRAZIONE RELAZIONI (TOPOGRAFIA)
        // ==========================================
        window.showLoadingOverlay(true, "Fase 2/3 (HD): Mappatura e Connessione Relazionale...");

        const conceptsListStr = extractedNodes.map(n => `- ID: "${n.id}" (Label: "${n.label}", Livello: ${n.level})`).join('\n');

        const p2PromptText = `SEI UN MOTORE DI ANALISI DI COLLEGAMENTI RETICOLARI (Fase 2 di 3 - Topografia del KG).
Ti fornisco una lista di concetti già estratti da un testo per il tema "${appState.rootNodeLabel}".
Il tuo unico compito è leggere il testo originario e tracciare tutte le relazioni logico-causali, temporali o strutturali significative che legano questi concetti tra di loro.

CONCETTI DISPONIBILI (Usa ESCLUSIVAMENTE questi ID esatti):
${conceptsListStr}

ISTRUZIONI:
1. Crea relazioni ('links') collegando gli ID forniti. Usa ESCLUSIVAMENTE gli ID esatti presenti nella lista soprastante. NON inventare nuovi ID.
2. Ciascun collegamento deve definire:
   - "source": l'ID di origine esatto.
   - "target": l'ID di destinazione esatto.
   - "rel": una brevissima parola o locuzione di collegamento in italiano (es. "regola", "compone", "influenza", "produce", "genera", "scoperto da", "sviluppato in"). Massimo 3 parole.
3. Tessi una rete ricca e interconnessa: idealmente ciascun concetto di livello 2 deve avere da 1 a 3 collegamenti verso i Super-Hub di livello 1 o altri nodi di livello 2. Assicurati che non rimanga alcun nodo isolato/orfano.

Restituisci SOLO un oggetto JSON con chiave "links". Nessun commento, nessun blocco markdown.
Formato richiesto:
{
  "links": [
    { "source": "ID_A", "target": "ID_B", "rel": "relazione" }
  ]
}

FONTI DA ANALIZZARE:
${textParts.join('\n\n')}`;

        const p2Schema = {
            type: "OBJECT",
            properties: {
                links: {
                    type: "ARRAY",
                    items: {
                        type: "OBJECT",
                        properties: {
                            source: { type: "STRING" },
                            target: { type: "STRING" },
                            rel: { type: "STRING" }
                        },
                        required: ["source", "target", "rel"]
                    }
                }
            },
            required: ["links"]
        };

        const p2Payload = {
            contents: [{ parts: [...fileParts, { text: p2PromptText }] }],
            systemInstruction: { parts: [{ text: "Sei un cartografo di concetti. Rispondi solo in JSON puro conforme allo schema richiesto." }] },
            generationConfig: { temperature: 0.15, responseMimeType: "application/json", responseSchema: p2Schema, maxOutputTokens: 3000 }
        };

        const p2Response = await window.fetchModelAPI(p2Payload, apiKey);
        let p2Raw = p2Response.candidates[0].content.parts[0].text;
        let p2Clean = p2Raw.split(MARKER_JSON).join('').split(MARKER_END).join('').trim();
        let p2Data = salvageTruncatedJSON(p2Clean);

        const extractedLinks = p2Data.links || [];

        // ==========================================
        // FASE 3: ARRICCHIMENTO DETTAGLI IN BATCH
        // ==========================================
        const batchSize = 7;
        const totalNodes = extractedNodes.length;
        const totalBatches = Math.ceil(totalNodes / batchSize);
        const enrichedNodesMap = {};

        for (let batchIdx = 0; batchIdx < totalBatches; batchIdx++) {
            const start = batchIdx * batchSize;
            const end = Math.min(start + batchSize, totalNodes);
            const batchNodes = extractedNodes.slice(start, end);
            const batchNodesStr = batchNodes.map(n => `- ID: "${n.id}" (Label: "${n.label}")`).join('\n');

            window.showLoadingOverlay(true, `Fase 3/3 (HD): Arricchimento dettagli (Batch ${batchIdx + 1}/${totalBatches})...`);

            const p3PromptText = `SEI UN ARRICCHITORE CONCETTUALE DIDATTICO (Fase 3 di 3 - Dettagli e Citazioni).
Stiamo realizzando un Knowledge Graph per uno studente.
Il tuo compito è arricchire i seguenti concetti specifici leggendo le fonti originali.

CONCETTI DA COMPLETARE IN QUESTO BATCH:
${batchNodesStr}
${userProfileStr}

ISTRUZIONI PER OGNI CONCETTO:
1. Genera "content": una sintesi concettuale brevissima (massimo 10 parole).
2. Genera "desc": una descrizione scientifica o storica approfondita ma chiarissima (da 30 a 50 parole) tarata sul profilo dello studente indicato.
3. Genera "chunks": un array contenente da 1 a 2 citazioni testuali REALI, INTEGRALI e VERBATIM (frasi intere di almeno 10-15 parole) copiate fedelmente e integralmente dal testo originale delle fonti che giustificano e supportano il concetto trattato. NON inventare o riassumere le citazioni!

Restituisci SOLO un oggetto JSON con chiave "enrichedNodes". Nessun commento, nessun blocco markdown.
Formato richiesto:
{
  "enrichedNodes": [
    {
      "id": "ID_CONCETTO",
      "content": "Sintesi didattica",
      "desc": "Spiegazione dettagliata ed estesa...",
      "chunks": ["Citazione verbatim 1 dal testo", "Citazione verbatim 2 dal testo"]
    }
  ]
}

FONTI DA ANALIZZARE:
${textParts.join('\n\n')}`;

            const p3Schema = {
                type: "OBJECT",
                properties: {
                    enrichedNodes: {
                        type: "ARRAY",
                        items: {
                            type: "OBJECT",
                            properties: {
                                id: { type: "STRING" },
                                content: { type: "STRING" },
                                desc: { type: "STRING" },
                                chunks: { type: "ARRAY", items: { type: "STRING" } }
                            },
                            required: ["id", "content", "desc", "chunks"]
                        }
                    }
                },
                required: ["enrichedNodes"]
            };

            const p3Payload = {
                contents: [{ parts: [...fileParts, { text: p3PromptText }] }],
                systemInstruction: { parts: [{ text: "Sei un redattore accademico e divulgatore didattico. Rispondi solo in JSON puro conforme allo schema richiesto." }] },
                generationConfig: { temperature: 0.2, responseMimeType: "application/json", responseSchema: p3Schema, maxOutputTokens: 3000 }
            };

            try {
                const p3Response = await window.fetchModelAPI(p3Payload, apiKey);
                let p3Raw = p3Response.candidates[0].content.parts[0].text;
                let p3Clean = p3Raw.split(MARKER_JSON).join('').split(MARKER_END).join('').trim();
                let p3Data = salvageTruncatedJSON(p3Clean);

                if (p3Data.enrichedNodes) {
                    p3Data.enrichedNodes.forEach(node => {
                        enrichedNodesMap[node.id] = node;
                    });
                }
            } catch (batchErr) {
                console.error(`Errore nel batch ${batchIdx + 1}:`, batchErr);
                // Auto-healing fallback per questo batch
                batchNodes.forEach(node => {
                    enrichedNodesMap[node.id] = {
                        id: node.id,
                        content: node.label,
                        desc: `Approfondimento su ${node.label} estratto dalle fonti biologiche/storiche di studio.`,
                        chunks: ["Citazione estratta in corso di elaborazione."]
                    };
                });
            }
        }

        // ==========================================
        // ASSEMBLAGGIO FINALE E PULIZIA
        // ==========================================
        const finalNodes = extractedNodes.map(node => {
            const enriched = enrichedNodesMap[node.id] || {};
            return {
                id: node.id,
                label: node.label,
                level: node.level,
                content: enriched.content || node.label,
                desc: enriched.desc || `Dettaglio concettuale per ${node.label}.`,
                chunks: enriched.chunks || [],
                aiDesc: enriched.desc || `Dettaglio concettuale per ${node.label}.`,
                studyStatus: 'none'
            };
        });

        // Normalizzazione e forzatura livelli
        const normalizeLabel = (lbl) => lbl.toLowerCase().replace(/^(il|lo|la|i|gli|le|un|uno|una)\s+/i, '').replace(/^(l|un|dell|nell|all|dall|sull)['''']\s*/i, '').replace(/[''''\.\s]/g, '').trim();
        const existingHubs = Array.from(document.querySelectorAll('.l1-topic-input')).map(i => i.value.trim()).filter(v => v);

        finalNodes.forEach(n => {
            const isManualHub = existingHubs.some(h => normalizeLabel(h) === normalizeLabel(n.label));
            const aiWantsHub = (parseInt(n.level) === 1);
            if (isManualHub || aiWantsHub) {
                n.level = 1;
            } else {
                n.level = 2;
            }
        });

        // Post-processing di salvataggio: se abbiamo < 3 Hub, ne promuoviamo
        let currentHubs = finalNodes.filter(n => n.level === 1);
        if (currentHubs.length < 3 && finalNodes.length > 5) {
            const degreeMap = {};
            finalNodes.forEach(n => degreeMap[n.id] = 0);
            extractedLinks.forEach(l => {
                const sourceId = typeof l.source === 'object' ? l.source.id : l.source;
                const targetId = typeof l.target === 'object' ? l.target.id : l.target;
                if (degreeMap[sourceId] !== undefined) degreeMap[sourceId]++;
                if (degreeMap[targetId] !== undefined) degreeMap[targetId]++;
            });

            const candidates = finalNodes
                .filter(n => n.level === 2)
                .sort((a, b) => degreeMap[b.id] - degreeMap[a.id]);

            let neededHubs = Math.max(3, Math.min(5, Math.floor(finalNodes.length / 4))) - currentHubs.length;
            for (let i = 0; i < neededHubs && i < candidates.length; i++) {
                candidates[i].level = 1;
            }
        }

        // Assegna group unico incrementale a ogni Hub L1
        let groupIdx = 1;
        finalNodes.filter(n => n.level === 1).forEach(hub => {
            hub.group = groupIdx++;
        });

        // Assegna group ai nodi L2 basandosi sulle connessioni (BFS verso Hub più vicino)
        const hubGroupMap = {};
        finalNodes.filter(n => n.level === 1).forEach(h => { hubGroupMap[h.id] = h.group; });
        const rawLinks = extractedLinks;

        finalNodes.filter(n => n.level === 2).forEach(node => {
            const visited = new Set([node.id]);
            const queue = [node.id];
            let foundGroup = null;
            while (queue.length > 0 && !foundGroup) {
                const cur = queue.shift();
                if (hubGroupMap[cur]) { foundGroup = hubGroupMap[cur]; break; }
                rawLinks.forEach(l => {
                    const s = typeof l.source === 'object' ? l.source.id : l.source;
                    const t = typeof l.target === 'object' ? l.target.id : l.target;
                    if (s === cur && !visited.has(t)) { visited.add(t); queue.push(t); }
                    if (t === cur && !visited.has(s)) { visited.add(s); queue.push(s); }
                });
                if (visited.size > 50) break;
            }
            node.group = foundGroup || 1;
        });

        // Auto-healing: garantisci che nessun nodo L2 sia orfano di link
        const validNodeIds = new Set(finalNodes.map(n => n.id));
        let finalLinks = rawLinks.filter(l => validNodeIds.has(l.source) && validNodeIds.has(l.target));

        const linkedNodes = new Set();
        finalLinks.forEach(l => { linkedNodes.add(l.source); linkedNodes.add(l.target); });

        const hubs = finalNodes.filter(n => n.level === 1);
        if (hubs.length > 0) {
            finalNodes.forEach(node => {
                if (node.level === 2 && !linkedNodes.has(node.id)) {
                    // Collega il nodo orfano a un Hub a caso (o al primo)
                    const randomHub = hubs[Math.floor(Math.random() * hubs.length)];
                    finalLinks.push({
                        source: randomHub.id,
                        target: node.id,
                        rel: "correlato a"
                    });
                }
            });
        }

        appState.db = {
            nodes: finalNodes,
            links: finalLinks,
            sourcesDict: {},
            customColors: {}
        };

        appState.db.nodes.forEach(n => {
            if (n.chunks && n.chunks.length > 0) appState.db.sourcesDict[n.id] = n.chunks.map(c => ({ title: "Estratto Fonte", source: "Documento", text: c }));
        });

        window.showLoadingOverlay(false);
        window.switchToMapLayout();
        setTimeout(() => { initD3Visualization(); }, 200);
        setTimeout(() => { window.showGenerationReport(); }, 1500);

    } catch (err) {
        window.showLoadingOverlay(false);
        window.showAlert("Errore Generazione Graph HD", err.message);
    }
}
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
    if (appState.extractionMode !== 'mindmap') {
        // KG mode: scale radius by degree (connections) but respect the level hierarchy!
        if (d.level === 0) {
            // Level 0 (absolute Root/Theme): always the maximum primary size
            return 45;
        }

        const maxDeg = Math.max(...appState.db.nodes.map(n => n.degree || 0), 1);
        const degree = d.degree || 0;

        if (d.level === 1) {
            // Level 1 (Super-Hub): ranges from 30px to 40px depending on degree
            const minR = 30, maxR = 40;
            return minR + (degree / maxDeg) * (maxR - minR);
        } else {
            // Level 2+ (Leaf/Concept nodes): ranges from 12px to 22px depending on degree
            const minR = 12, maxR = 22;
            return minR + (degree / maxDeg) * (maxR - minR);
        }
    }
    return radiusScale[d.level !== undefined ? d.level : 1] || 15;
}

let forceDistMult = 1, forceChargeMult = 1;
let labelsHidden = false, pathfinderActive = false;
let linkingState = { active: false, sourceNode: null };
let pathfinderState = { active: false, source: null, target: null };

function initD3Visualization() {
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

    svg.append("defs").selectAll("marker").data(["arrowhead"]).enter().append("marker")
        .attr("id", String).attr("viewBox", "0 -5 10 10").attr("refX", 25).attr("refY", 0).attr("markerWidth", 6).attr("markerHeight", 6).attr("orient", "auto")
        .append("path").attr("d", "M0,-5L10,0L0,5").attr("fill", "#94a3b8");

    g = svg.append("g");

    zoom = d3.zoom()
        .scaleExtent([0.1, 5])
        .on("zoom", (event) => {
            g.attr("transform", event.transform);
            // Raddoppiato lo spessore dell'outline bianca dei testi (richiesta utente)
            const k = event.transform.k;
            const strokeW = Math.max(1.2, (2.4 / k));
            g.selectAll(".node-text").style("stroke-width", strokeW + "px");
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
    if (window.renderStudySets) window.renderStudySets();
    const nodes = appState.db.nodes;
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

    if (!simulation) {
        simulation = d3.forceSimulation(nodes)
            .force("link", d3.forceLink(links).id(d => d.id).distance(d => {
                let baseDist = (d.source.level === 0) ? 200 : 140;
                if (isKG) baseDist = 200; // Più spazio per KG
                return baseDist * forceDistMult;
            }))
            .force("collide", d3.forceCollide().radius(d => {
                // Più figli ha, più spazio attorno pretende
                let extraPadding = 50 + (d.weight * 5);
                if (extraPadding > 150) extraPadding = 150;
                return getNodeRadius(d) + extraPadding;
            }).iterations(3))
            .force("charge", d3.forceManyBody().strength(d => {
                let baseCharge = (d.level === 0 ? -1500 : -500);
                if (isKG && d.level === 1) baseCharge = -1000;
                // Nodi pesanti respingono di più per far spazio ai figli
                return (baseCharge - (d.weight * 50)) * forceChargeMult;
            }))
            .force("center", d3.forceCenter(0, 0))
            .force("radial", d3.forceRadial(d => {
                if (isKG) {
                    return d.level === 1 ? 250 : 550; // KG ha solo L1 (Hub) e L2 (Nodi)
                } else {
                    if (d.level === 0) return 0;
                    if (d.level === 1) return 300;
                    if (d.level === 2) return 500;
                    return 700;
                }
            }, 0, 0).strength(0.3));

        // Raffreddamento statico invisibile (Strategia 1)
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

        // Raffreddamento statico invisibile (Strategia 1)
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

    linkEnter.append("line").attr("class", "link").attr("stroke", "#94a3b8").attr("stroke-width", 1.5).attr("marker-end", "url(#arrowhead)");
    linkEnter.append("text").attr("class", "link-label").attr("text-anchor", "middle").attr("dy", -4).text(d => d.rel);

    const linkMerge = linkEnter.merge(linkSelection);
    linkMerge.select("text.link-label")
        .text(d => d.rel)
        .style("font-size", (8 * globalFontScale * 0.765) + "px");
    linkMerge.classed("ai-suggested", d => d.aiSuggested === true);
    linkSelection.exit().remove();

    // Pre-calcolo delle connessioni agli hub per la colorazione KG
    if (appState.extractionMode === 'kg') {
        const hubColors = {};
        nodes.filter(n => n.level === 1).forEach(h => {
            hubColors[h.id] = (appState.db.customColors && appState.db.customColors[h.group])
                ? appState.db.customColors[h.group]
                : (colorScale[h.group] || colorScale[1] || "#ef4444");
        });

        nodes.forEach(n => {
            if (n.level > 1) {
                const connectedTo = new Set();
                links.forEach(l => {
                    const source = typeof l.source === 'object' ? l.source : nodes.find(x => x.id === l.source);
                    const target = typeof l.target === 'object' ? l.target : nodes.find(x => x.id === l.target);

                    if (!source || !target) return;

                    // Se connesso direttamente a un hub
                    if (source.id === n.id && hubColors[target.id]) connectedTo.add(hubColors[target.id]);
                    if (target.id === n.id && hubColors[source.id]) connectedTo.add(hubColors[source.id]);

                    // Se connesso a un altro nodo che ha lo stesso group (ereditarietà colore)
                    if (source.id === n.id && target.level > 1 && target.group === n.group) {
                        const col = (appState.db.customColors && appState.db.customColors[target.group]) ? appState.db.customColors[target.group] : colorScale[target.group];
                        if (col) connectedTo.add(col);
                    }
                    if (target.id === n.id && source.level > 1 && source.group === n.group) {
                        const col = (appState.db.customColors && appState.db.customColors[source.group]) ? appState.db.customColors[source.group] : colorScale[source.group];
                        if (col) connectedTo.add(col);
                    }
                });
                n.hubColors = Array.from(connectedTo);
            } else {
                n.hubColors = [];
            }
        });
    }

    const nodeSelection = g.selectAll(".node-group").data(nodes, d => d.id);
    const nodeEnter = nodeSelection.enter().append("g").attr("class", "node-group")
        .style("opacity", 0) // Cascading animation start
        .call(drag(simulation))
        .on("click", window.handleNodeClick)
        .on("dblclick", (e, d) => { e.stopPropagation(); window.openSourceModal(d.id); })
        .on("contextmenu", (e, d) => { e.preventDefault(); e.stopPropagation(); window.showContextMenu(e, 'node', d); });

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
            return (baseSize * globalFontScale) + "px";
        });

    nodeEnter.append("foreignObject")
        .attr("class", "node-icons-fo pointer-events-none")
        .attr("width", 100)
        .attr("height", 20)
        .attr("x", -50)
        .attr("y", 0);

    const nodeMerge = nodeEnter.merge(nodeSelection);

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

    // Gestione segmenti colorati per KG
    nodeMerge.select(".node-segments").each(function (d) {
        const container = d3.select(this);
        container.selectAll("*").remove();

        if (appState.extractionMode === 'kg' && d.level > 1) {
            const r = getNodeRadius(d);
            const strokeW = 4; // Spessore bordo segmentato più evidente

            if (d.hubColors && d.hubColors.length > 0) {
                const colors = d.hubColors;
                const arcCount = colors.length;
                const angleStep = (2 * Math.PI) / arcCount;

                colors.forEach((color, i) => {
                    const arc = d3.arc()
                        .innerRadius(r) // Inizio dal raggio del cerchio
                        .outerRadius(r + strokeW) // Spessore verso l'esterno
                        .startAngle(i * angleStep)
                        .endAngle((i + 1) * angleStep);

                    container.append("path")
                        .attr("d", arc)
                        .attr("fill", color);
                });
            } else {
                // Se non collegato a hub, bordo grigio semplice per non lasciare il nodo nudo
                container.append("circle")
                    .attr("r", r + 1.5)
                    .attr("fill", "none")
                    .attr("stroke", "#cbd5e1")
                    .attr("stroke-width", 2);
            }
        }
    });

    nodeMerge.select("text.node-text")
        .each(function (d) {
            const textEl = d3.select(this);
            let labelStr = cleanLabel(d.label);

            if (d.level >= 4 && labelStr.length > 15) labelStr = labelStr.substring(0, 15) + "...";
            else if (d.level === 3 && labelStr.length > 25) labelStr = labelStr.substring(0, 25) + "...";

            let lines = getLabelLines(labelStr);
            const vis = d.iconVisibility || { text: true, image: true, link: true };
            const hasIcons = (d.hasCustomText && vis.text) || (vis.image && d.images?.length > 0) || (vis.link && (d.urls?.length > 0 || d.url));

            textEl.text('');
            lines.forEach((line, i) => {
                // Center logic: 
                // 1 line: dy=0.35em
                // 2 lines: dy=-0.2em, then 1.1em
                // With icons, shift up by ~0.5em
                let firstDy = 0.35 - ((lines.length - 1) * 0.55);
                if (hasIcons) firstDy -= 0.6;

                textEl.append('tspan')
                    .attr('x', 0)
                    .attr('dy', i === 0 ? `${firstDy}em` : '1.1em')
                    .text(line);
            });
        });

    nodeMerge.select("foreignObject.node-icons-fo")
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
            return `<div style="display:flex; align-items:center; justify-content:center; gap:1px; width:100%; height:100%; opacity:0.9;">${limitedIcons.join('')}</div>`;
        })
        .each(function () {
            if (window.lucide && window.lucide.createIcons) {
                window.lucide.createIcons({ root: this });
            }
        });

    nodeSelection.exit().remove();
    d3.select("#d3-container").classed("labels-hidden", labelsHidden);
    window.applyVisualFilters();

    // Applica subito le posizioni pre-calcolate (tick manuale)
    tick();

    // Animazione a cascata per svelamento progressivo (Strategia 4)
    // Link appaiono tutti insieme con delay
    linkEnter.transition().duration(800).delay(500).style("opacity", 1);

    // I nodi vecchi (merge senza enter) devono mantenere opacità 1
    // Per sicurezza impostiamo a 1 tutto ciò che era già presente
    nodeSelection.style("opacity", 1);
    linkSelection.style("opacity", 1);

    // I nodi nuovi appaiono a scaglioni in base al livello
    nodeEnter.transition().duration(600).delay(d => {
        if (d.level === 0) return 0;
        if (d.level === 1) return 400;
        if (d.level === 2) return 800;
        return 1200;
    }).style("opacity", 1);
}

function tick() {
    g.selectAll(".link")
        .attr("x1", d => d.source.x).attr("y1", d => d.source.y)
        .attr("x2", d => d.target.x).attr("y2", d => d.target.y);
    g.selectAll(".link-label")
        .attr("x", d => (d.source.x + d.target.x) / 2)
        .attr("y", d => (d.source.y + d.target.y) / 2);
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
            window.ignoreNextNodeClick = true; // Prevents opening node sidebar/focus modal after long press release

            let clientX = dragStartPos.x;
            let clientY = dragStartPos.y;
            let syntheticEvent = {
                preventDefault: () => { if (sourceEvt && sourceEvt.preventDefault) sourceEvt.preventDefault(); },
                stopPropagation: () => { if (sourceEvt && sourceEvt.stopPropagation) sourceEvt.stopPropagation(); },
                clientX: clientX,
                clientY: clientY
            };

            window.showContextMenu(syntheticEvent, 'node', event.subject);
            longPressTimer = null;
        }, 500); // 500ms long press threshold

        if (!event.active) simulation.alphaTarget(0.3).restart();
        event.subject.fx = event.subject.x;
        event.subject.fy = event.subject.y;
    }

    function dragged(event) {
        if (dragStartPos) {
            const sourceEvt = event.sourceEvent;
            let curX = event.x;
            let curY = event.y;
            if (sourceEvt) {
                const touch = sourceEvt.touches ? sourceEvt.touches[0] : sourceEvt;
                curX = touch.clientX;
                curY = touch.clientY;
            }
            const dx = curX - dragStartPos.x;
            const dy = curY - dragStartPos.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist > 10) { // 10px threshold for drag/move
                hasMovedSignificant = true;
                if (longPressTimer) {
                    clearTimeout(longPressTimer);
                    longPressTimer = null;
                }
            }
        }

        if (longPressTriggered) return;

        event.subject.fx = event.x;
        event.subject.fy = event.y;
    }

    function dragended(event) {
        if (longPressTimer) {
            clearTimeout(longPressTimer);
            longPressTimer = null;
        }

        if (!event.active) simulation.alphaTarget(0);

        if (longPressTriggered) {
            longPressTriggered = false;
            // Delay resetting ignoreNextNodeClick slightly so click handler filters it
            setTimeout(() => { window.ignoreNextNodeClick = false; }, 100);
            return;
        }

        // Se non si è mosso in modo significativo (tap veloce), gestiamo il click direttamente qui per evitare soppressione D3 su mobile
        if (!hasMovedSignificant) {
            // Ripristina la posizione originale se non era un drag reale
            event.subject.fx = null;
            event.subject.fy = null;
            if (event.subject.level === 0) { event.subject.fx = 0; event.subject.fy = 0; }

            // Esegui la chiamata diretta al gestore click
            window.handleNodeClick(event.sourceEvent, event.subject);

            // Imposta ignoreNextNodeClick a true per il click nativo duplicato che arriverà asincronamente
            window.ignoreNextNodeClick = true;
            setTimeout(() => { window.ignoreNextNodeClick = false; }, 300);
            return;
        }

        if (event.subject.level === 0) { event.subject.fx = 0; event.subject.fy = 0; return; }
        if (event.subject.level > 1 && !attractionEnabled) {
            event.subject.fx = event.x; event.subject.fy = event.y;
        } else if (event.subject.level > 1) {
            event.subject.fx = null; event.subject.fy = null;
        }
    }

    return d3.drag().on("start", dragstarted).on("drag", dragged).on("end", dragended);
}

window.applyPinning = function (pinned) {
    isPinned = pinned;
    const btn = document.getElementById('card-btn-physics');
    appState.db.nodes.forEach(n => { n.fx = pinned ? n.x : null; n.fy = pinned ? n.y : null; });
    if (pinned) {
        simulation.force("charge", d3.forceManyBody().strength(0));
        simulation.force("link").strength(0.01);
        simulation.velocityDecay(0.9);
        if (btn) { btn.classList.replace('bg-slate-100', 'bg-blue-50'); btn.classList.replace('text-slate-600', 'text-blue-600'); }
    } else {
        simulation.force("charge", d3.forceManyBody().strength(d => (d.level === 0 ? -800 : -200) * forceChargeMult));
        simulation.force("link").strength(1);
        simulation.velocityDecay(0.4);
        simulation.alpha(0.3).restart();
        if (btn) { btn.classList.replace('bg-blue-50', 'bg-slate-100'); btn.classList.replace('text-blue-600', 'text-slate-600'); }
    }
}

window.togglePhysics = function () { window.applyPinning(!isPinned); }

window.toggleAttraction = function () {
    if (!simulation) return;
    attractionEnabled = !attractionEnabled;
    const btn = document.getElementById('toggle-attraction-btn');

    if (attractionEnabled) {
        simulation.force("charge").strength(d => (d.level === 0 ? -800 : -200) * forceChargeMult);
        simulation.force("link").strength(1);
        simulation.alpha(0.3).restart();
        if (btn) {
            btn.innerHTML = '<i data-lucide="magnet" class="w-5 h-5"></i><span class="text-[9px] font-bold mt-1">ATTR</span>';
            btn.className = "flex flex-col items-center justify-center w-12 h-12 rounded-xl bg-blue-50 text-blue-600 hover:bg-blue-100 transition";
        }
    } else {
        simulation.force("charge").strength(0);
        simulation.force("link").strength(0);
        simulation.alpha(0.1).restart();
        if (btn) {
            btn.innerHTML = '<i data-lucide="magnet" class="w-5 h-5"></i><span class="text-[9px] font-bold mt-1">ATTR</span>';
            btn.className = "flex flex-col items-center justify-center w-12 h-12 rounded-xl bg-red-50 text-red-500 hover:bg-red-100 transition";
        }
    }
    window.safeCreateIcons();
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
        window.showToast("Errore durante lo snapshot: " + err.message, "error");
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

    // Ciclo Layout: Default -> (Orbit) -> (Radial/Separated) -> (Personal)
    if (appState.layoutMode === 'default') {
        appState.layoutMode = 'orbit';
    } else if (appState.layoutMode === 'orbit') {
        appState.layoutMode = isMindmap ? 'radial' : 'separated';
    } else if (appState.layoutMode === 'radial' || appState.layoutMode === 'separated') {
        if (hasSnapshot) appState.layoutMode = 'personal';
        else appState.layoutMode = 'default';
    } else if (appState.layoutMode === 'personal') {
        appState.layoutMode = 'default';
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
    }

    if (btn) {
        if (appState.layoutMode !== 'default') {
            btn.classList.add('bg-indigo-100', 'text-indigo-600');
            btn.classList.remove('bg-slate-100', 'text-slate-600');
            if (appState.layoutMode === 'separated') span.innerText = 'SEPARATO';
            if (appState.layoutMode === 'radial') span.innerText = 'RADIALE';
            if (appState.layoutMode === 'orbit') span.innerText = 'ORBITA';
            if (appState.layoutMode === 'personal') span.innerText = 'PERSONAL';
        } else {
            btn.classList.remove('bg-indigo-100', 'text-indigo-600');
            btn.classList.add('bg-slate-100', 'text-slate-600');
            span.innerText = 'LAYOUT';
        }
    }

    if (appState.layoutMode !== 'personal') {
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
    labelsHidden = !labelsHidden;
    d3.select("#d3-container").classed("labels-hidden", labelsHidden);
    const btn = document.getElementById('card-btn-labels');
    if (labelsHidden) { btn.classList.replace('bg-slate-100', 'bg-red-50'); btn.classList.replace('text-slate-600', 'text-red-500'); }
    else { btn.classList.replace('bg-red-50', 'bg-slate-100'); btn.classList.replace('text-red-500', 'text-slate-600'); }
}

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
    if (linkingState.active) { linkingState.active = false; document.getElementById('mode-hint').classList.add('hidden'); }
    if (pathfinderActive) { pathfinderState.source = null; pathfinderState.target = null; document.getElementById('mode-hint').innerText = "PATHFINDER: Clicca sul Nodo di Partenza"; window.applyVisualFilters(); }

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
    const container = document.getElementById('project-title-container');
    if (!container || container.querySelector('input')) return;

    const currentTitle = appState.rootNodeLabel || 'Mappa Senza Nome';

    // Fermiamo la propagazione per evitare loop sul click del container
    container.onclick = null;

    container.innerHTML = `
        <input type="text" id="edit-project-title-input" 
            class="w-full bg-white border border-indigo-300 rounded px-2 py-1 text-[10px] font-mono uppercase outline-none focus:ring-1 focus:ring-indigo-500" 
            value="${currentTitle}">
    `;

    const input = document.getElementById('edit-project-title-input');
    input.focus();
    input.select();

    const save = () => {
        const newTitle = input.value.trim();
        appState.rootNodeLabel = newTitle || currentTitle;

        // Ripristina l'HTML originale
        container.innerHTML = `
            <p class="text-slate-500 text-[10px] font-mono uppercase tracking-wider break-words flex-grow" id="sidebar-subtitle" style="line-height: 1.4;">
                Progetto: ${appState.rootNodeLabel}</p>
            <div class="opacity-0 group-hover:opacity-100 transition-opacity text-indigo-400 p-0.5 mt-0.5 shrink-0 bg-indigo-50 rounded">
                <i data-lucide="edit-3" class="w-3 h-3"></i>
            </div>
        `;

        // Riattiva il click per la prossima volta
        setTimeout(() => {
            container.onclick = window.startEditingTitle;
        }, 100);

        if (window.safeCreateIcons) window.safeCreateIcons();

        if (newTitle && newTitle !== currentTitle) {
            // Update root node if mindmap
            if (appState.extractionMode === 'mindmap' && appState.db.nodes.length > 0) {
                const rootNode = appState.db.nodes.find(n => n.id === 'root');
                if (rootNode) {
                    rootNode.label = appState.rootNodeLabel;
                    if (window.updateVisualization) window.updateVisualization();
                    if (window.renderTreeView) window.renderTreeView();
                }
            }
            window.showToast("Titolo aggiornato", "success");
        }
    };

    input.onblur = save;
    input.onkeydown = (e) => {
        if (e.key === 'Enter') save();
        if (e.key === 'Escape') {
            input.value = currentTitle;
            save();
        }
    };
};

window.switchToMapLayout = function () {
    document.getElementById('landing-view').style.display = 'none';
    const mapView = document.getElementById('map-view');
    mapView.classList.add('active');
    document.getElementById('sidebar-subtitle').innerText = `Progetto: ${appState.rootNodeLabel || 'Mappa Senza Nome'}`;

    // Nascondi la barra dei progetti recenti quando si entra nella mappa
    const projectsBar = document.getElementById('projects-bar');
    if (projectsBar) {
        projectsBar.classList.add('hidden');
    }
    if (window.toggleProjectsBar) {
        window.toggleProjectsBar(false); // false = forza la chiusura
    }

    // Mostra tasto Salva Layout Snapshot
    const saveLayoutBtn = document.getElementById('save-layout-btn');
    if (saveLayoutBtn) {
        saveLayoutBtn.classList.remove('hidden');
        saveLayoutBtn.classList.add('flex');
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

window.handleNodeClick = function (event, d) {
    if (window.ignoreNextNodeClick) {
        window.ignoreNextNodeClick = false;
        return;
    }
    try {
        if (event && event.stopPropagation) event.stopPropagation();
        hideContextMenu();

        if (linkingState.active) {
            if (linkingState.sourceNode.id !== d.id) {
                window.showPrompt(`Che relazione c'è tra "${cleanLabel(linkingState.sourceNode.label)}" e "${cleanLabel(d.label)}"?`, "collegato_a", (rel) => {
                    if (rel) {
                        appState.db.links.push({ source: linkingState.sourceNode.id, target: d.id, rel: rel });
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

        currentNode = d;
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
                svg.transition().duration(750).call(zoom.transform, d3.zoomIdentity.translate(-d.x * 1.5, -d.y * 1.5).scale(1.5));
            } catch (e) { console.warn("Zoom error:", e); }
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

                    <div class="p-4 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-700 leading-relaxed mb-6 whitespace-pre-wrap">${cleanLabel(d.content || d.desc) || "Nessuna descrizione."}</div>
                    
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
        window.openSourceModal(d.id);
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

        let descStr = cleanLabel(d.content || d.desc) || "Nessuna descrizione.";
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
        if (containerDensity) containerDensity.classList.remove('hidden');
        if (containerKGDensity) containerKGDensity.classList.add('hidden');
        if (containerRoot) containerRoot.classList.remove('hidden');

        if (l1Title) l1Title.innerText = "Rami Principali (Livello 1)";
        if (l1Desc) l1Desc.innerText = "Definisci i rami principali per organizzare lo studio:";
        if (l1BtnText) l1BtnText.innerText = "Aggiungi Nodo L1";
        if (l1AutoLabel) l1AutoLabel.innerText = "Genera altri nodi L1 in automatico";
        l1Inputs.forEach(i => i.placeholder = "Es. Cause, Conseguenze...");
    } else {
        btnMindmap.classList.remove('active');
        btnKG.classList.add('active');
        if (containerDensity) containerDensity.classList.add('hidden');
        if (containerKGDensity) containerKGDensity.classList.remove('hidden');
        if (containerRoot) containerRoot.classList.add('hidden');

        if (l1Title) l1Title.innerText = "Super-Hubs relazionali";
        if (l1Desc) l1Desc.innerText = "Definisci i concetti chiave attorno a cui costruire le relazioni:";
        if (l1BtnText) l1BtnText.innerText = "Aggiungi Super-Hub";
        if (l1AutoLabel) l1AutoLabel.innerText = "Genera altri Super-Hub in automatico";
        l1Inputs.forEach(i => i.placeholder = "Es. Trattative, Eredità...");
    }

    const btnGenerateLabel = document.getElementById('btn-generate-label');
    if (btnGenerateLabel) {
        const lang = window.currentLanguage || 'it';
        const t = (lang === 'en' ? (typeof en_translations !== 'undefined' ? en_translations : {}) : (typeof it_translations !== 'undefined' ? it_translations : {}));
        btnGenerateLabel.innerText = mode === 'mindmap' ? t.new_map_btn : t.new_kg_btn;
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

    // Nella landing page, forza lo zoom a 1.0 per evitare corruzioni del layout
    const isLandingVisible = !document.getElementById('map-view')?.classList.contains('active');
    const effectiveZ = isLandingVisible ? 1.0 : z;

    document.documentElement.style.setProperty('--app-zoom', effectiveZ);

    if (effectiveZ > 1.0) {
        document.body.classList.add('a11y-zoomed-modals');
    } else {
        document.body.classList.remove('a11y-zoomed-modals');
    }

    document.body.classList.remove('a11y-zoom-x1', 'a11y-zoom-x15', 'a11y-zoom-x2');
    if (effectiveZ === 1.0) {
        document.body.classList.add('a11y-zoom-x1');
    } else if (effectiveZ === 1.5) {
        document.body.classList.add('a11y-zoom-x15');
    } else if (effectiveZ === 2.0) {
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
        '#study-config-modal > div',
        '#external-json-modal > div',
        '#vault-manager-box',
        '#edit-node-box',
        '#contextual-ai-extension-modal > div'
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
    row.className = 'flex gap-2 items-center l1-input-row';
    const placeholder = document.getElementById('extraction-mode').value === 'mindmap' ? 'Nuovo argomento L1...' : 'Nuovo Super-Hub...';
    row.innerHTML = `
                <input type="text" class="landing-input l1-topic-input py-2 text-sm" placeholder="${placeholder}" value="${defaultValue}">
                <button type="button" onclick="window.removeL1Input(this)" class="text-red-400 hover:text-red-300 p-1"><i data-lucide="x" class="w-4 h-4"></i></button>
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

window.loadOfflineExample = async function (filename) {
    try {
        const response = await fetch('./esempi/' + filename);
        if (!response.ok) throw new Error("Impossibile caricare il file di esempio.");
        const rawData = await response.json();
        const data = rawData.db ? { ...rawData, ...rawData.db } : rawData;

        if (!data.nodes || !data.links) throw new Error("JSON non valido.");

        data.links.forEach(l => {
            if (typeof l.source === 'object' && l.source !== null) l.source = l.source.id;
            if (typeof l.target === 'object' && l.target !== null) l.target = l.target.id;
        });
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
                    source: "Dato Esempio",
                    text: c
                }));
            }
        });

        appState.rootNodeLabel = data.rootNodeLabel || "Mappa Esempio";
        simulation = null;
        window.switchToMapLayout();
        initD3Visualization();

        document.getElementById('insegnai-drawer').classList.add('-translate-x-[320px]');
        window.showToast("Esempio caricato con successo", "success");
    } catch (err) { window.showAlert("Errore", "Errore caricamento esempio: " + err.message); }
};

// ==========================================
// SOTA: MARKDOWN VAULT LOGIC
// ==========================================

window.saveMapVault = async function () {
    if (!appState.db.nodes.length) return window.showAlert("Errore", "Nessuna mappa da esportare.");

    try {
        const result = await window.electronAPI.pickFolder({ createOnly: true });
        if (result.canceled) return;

        window.showLoadingOverlay(true, "Esportazione Vault in corso...");

        const saveRes = await window.electronAPI.saveVault({
            folderPath: result.folderPath,
            mapData: {
                extractionMode: appState.extractionMode,
                rootNodeLabel: appState.rootNodeLabel,
                nodes: appState.db.nodes,
                links: appState.db.links,
                userProfile: appState.userProfile,
                tutorState: tutorState,
                aiProvider: appState.aiProvider,
                aiModel: document.getElementById('model-select')?.value || localStorage.getItem(appState.aiProvider === 'infomaniak' ? 'infomaniak_selected_model' : 'gemini_selected_model'),
                generationUsage: appState.generationUsage,
                customColors: appState.db.customColors || {}
            }
        });

        window.showLoadingOverlay(false);
        if (saveRes.success) {
            appState.activeVaultPath = result.folderPath;

            // Applica upgrade per ripulire il Base64 dalla memoria
            if (saveRes.upgrades) {
                saveRes.upgrades.forEach(up => {
                    const node = appState.db.nodes.find(n => n.id === up.id);
                    if (node && up.images) {
                        node.images = up.images;
                        if (up.images.length > 0) node.image = up.images[0];
                    }
                });
                console.log("Memory Clean: Base64 images replaced with local paths.");
            }

            // Mostra subito il tasto Sincronizza
            const syncBtn = document.getElementById('sync-vault-btn');
            if (syncBtn) {
                syncBtn.classList.remove('hidden');
                syncBtn.classList.add('flex');
            }

            window.showToast("Vault creato e collegato!", "success");
        } else {
            window.showAlert("Errore Salvataggio", saveRes.error);
        }
    } catch (e) {
        window.showLoadingOverlay(false);
        console.error(e);
        window.showAlert("Errore", e.message);
    }
};

window.loadDemoGraph = async function (url) {
    try {
        window.closeVaultManager();
        window.showLoadingOverlay(true, "Caricamento Demo...");
        const res = await fetch(url);
        if (!res.ok) throw new Error("File demo non trovato.");
        const data = await res.json();

        if (!data.nodes || !data.links) throw new Error("Formato JSON non valido.");

        data.links.forEach(l => {
            if (typeof l.source === 'object' && l.source !== null) l.source = l.source.id;
            if (typeof l.target === 'object' && l.target !== null) l.target = l.target.id;
        });
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
                    source: "Dato Demo",
                    text: c
                }));
            }
        });

        if (data.tutorState) {
            window.tutorState = data.tutorState;
            localStorage.setItem('mappai_tutor_state', JSON.stringify(window.tutorState));
        } else {
            window.tutorState = { messages: [], mode: "tutor", flashcards: [], currentFlashcardIndex: 0 };
            localStorage.removeItem('mappai_tutor_state');
        }

        appState.rootNodeLabel = data.rootNodeLabel || "Mappa Esempio";

        if (typeof simulation !== 'undefined') simulation = null;
        window.switchToMapLayout();
        if (typeof initD3Visualization === 'function') initD3Visualization();

        window.showLoadingOverlay(false);
        window.showToast("Mappa dimostrativa caricata con successo!", "success");
    } catch (err) {
        window.showLoadingOverlay(false);
        console.error(err);
        window.showAlert("Errore", "Impossibile caricare l'esempio: " + err.message);
    }
};
window.loadMapVault = async function () {
    try {
        const result = await window.electronAPI.pickFolder({ importOnly: true });
        if (result.canceled) return;

        window.showLoadingOverlay(true, "Caricamento Vault...");

        const loadRes = await window.electronAPI.loadVault(result.folderPath);

        window.showLoadingOverlay(false);
        if (loadRes.success) {
            appState.activeVaultPath = result.folderPath;
            appState.extractionMode = loadRes.data.extractionMode || "mindmap";
            appState.rootNodeLabel = result.folderPath.split('/').pop().replace(/_/g, ' ') || "Mappa Esempio";

            let nodesList = loadRes.data.nodes || [];
            let linksList = loadRes.data.links || [];

            const rootNode = nodesList.find(n => n.level === 0);
            if (rootNode) {
                rootNode.label = appState.rootNodeLabel;
            }

            if (nodesList.length === 0) {
                const rootId = "node_" + Math.random().toString(36).substr(2, 9);
                nodesList = [{
                    id: rootId,
                    label: appState.rootNodeLabel,
                    level: 0,
                    group: 0,
                    x: 640,
                    y: 400,
                    fx: 640,
                    fy: 400
                }];
                linksList = [];
                // Salva immediatamente il vault con il nodo radice di default per creare i file fisici
                window.electronAPI.saveVault({
                    folderPath: result.folderPath,
                    mapData: {
                        extractionMode: appState.extractionMode,
                        rootNodeLabel: appState.rootNodeLabel,
                        nodes: nodesList,
                        links: linksList,
                        customColors: {}
                    }
                });
            }

            appState.db = {
                nodes: nodesList,
                links: linksList,
                studySets: loadRes.data.studySets || [],
                sourcesDict: {},
                customColors: loadRes.data.customColors || {}
            };

            if (window.renderStudySets) window.renderStudySets();

            appState.db.nodes.forEach(n => {
                if (n.chunks && n.chunks.length > 0) {
                    appState.db.sourcesDict[n.id] = n.chunks.map(c => ({
                        title: c.title || "Fonte",
                        source: c.source || "Documento",
                        text: c.text || c
                    }));
                }
            });

            window.switchToMapLayout();

            // Mostra tasto Sincronizza Vault
            const syncBtn = document.getElementById('sync-vault-btn');
            if (syncBtn) {
                syncBtn.classList.remove('hidden');
                syncBtn.classList.add('flex');
            }

            setTimeout(() => { initD3Visualization(); }, 200);
            window.showToast("Vault caricato con successo!", "success");
        } else {
            window.showAlert("Errore Caricamento", loadRes.error);
        }
    } catch (e) {
        window.showLoadingOverlay(false);
        console.error(e);
        window.showAlert("Errore", e.message);
    }
};

window.startEmptyMap = function () {
    // Reset DB to a single root node
    const rootId = "node_" + Math.random().toString(36).substr(2, 9);
    appState.db = {
        nodes: [{ id: rootId, label: "Nuovo Progetto", level: 0, group: 0, desc: "Inizia a scrivere qui..." }],
        links: []
    };
    appState.rootNodeLabel = "Nuovo Progetto";
    appState.extractionMode = "mindmap";

    // Reset simulation
    simulation = null;
    window.switchToMapLayout();
    initD3Visualization();
    window.showToast("Nuovo progetto creato", "info");
};

// --- Gestione Drag & Drop Globale ---
window.addEventListener('dragover', (e) => { e.preventDefault(); e.stopPropagation(); });
window.addEventListener('drop', (e) => {
    e.preventDefault(); e.stopPropagation();
    const files = e.dataTransfer.files;
    if (files.length > 0 && files[0].name.endsWith('.json')) {
        const mockEvent = { target: { files: [files[0]], value: '' } };
        window.importGraph(mockEvent);
        window.showToast("Mappa caricata con successo!", "success");
    }
});

// --- Gestione Istruzioni JSON Esterno ---
window.openExternalJSONInstructions = function () {
    try {
        const modal = document.getElementById('external-json-modal');
        if (!modal) return;
        modal.classList.remove('hidden');
        modal.classList.add('flex');
        setTimeout(() => modal.classList.add('opacity-100'), 10);
        window.safeCreateIcons();
    } catch (e) { console.error('openExternalJSONInstructions error:', e); }
};

window.closeExternalJSONModal = function () {
    try {
        const modal = document.getElementById('external-json-modal');
        if (!modal) return;
        modal.classList.remove('opacity-100');
        setTimeout(() => { modal.classList.add('hidden'); modal.classList.remove('flex'); }, 300);
    } catch (e) { }
};

window.copyExternalPrompt = function () {
    const text = document.getElementById('external-prompt-text').innerText;
    navigator.clipboard.writeText(text).then(() => {
        window.showToast("Prompt copiato negli appunti!", "success");
    });
};

// ==========================================
// MERGE / UNISCI SYSTEM
// ==========================================
let pendingMergeData = null;
let pendingMergeFile = null;
let pendingMergeInputId = null;
let validateLinkTarget = null;

window.mergeGraph = function (event) {
    const file = event.target.files[0]; if (!file) return;
    pendingMergeInputId = event.target.id;
    if (!appState.db.nodes.length) {
        window.showToast("Nessuna mappa aperta. Usa 'Carica' per aprire una mappa prima.", "error");
        event.target.value = '';
        return;
    }
    const reader = new FileReader();
    reader.onload = function (e) {
        try {
            const rawData = JSON.parse(e.target.result);
            const data = rawData.db ? { ...rawData, ...rawData.db } : rawData;
            if (!data.nodes || !data.links) throw new Error("JSON non valido.");
            pendingMergeData = data;
            pendingMergeFile = file.name;

            // Show confirmation modal
            const modal = document.getElementById('merge-confirm-modal');
            const title = document.getElementById('merge-modal-title');
            const desc = document.getElementById('merge-modal-description');
            const aiOpt = document.getElementById('merge-ai-option');

            const importedLabel = data.rootNodeLabel || file.name;
            title.innerHTML = '<i data-lucide="merge" class="w-5 h-5"></i> Unisci: ' + importedLabel;

            desc.innerHTML = `
                        <p>Stai per unire <strong>"${importedLabel}"</strong> (${data.nodes.length} nodi, ${data.links.length} link) alla mappa corrente.</p>
                        <ul class="list-disc pl-4 mt-2 space-y-1 text-xs text-slate-500">
                            <li>I nodi verranno aggiunti con ID univoci per evitare conflitti.</li>
                            <li>Le due mappe appariranno come cluster separati sulla stessa vista.</li>
                            <li>Potrai creare link manuali tra le mappe con click destro → "Crea Relazione".</li>
                        </ul>
                    `;

            // Show AI option only for KG mode
            if (appState.extractionMode !== 'mindmap') {
                aiOpt.classList.remove('hidden');
            } else {
                aiOpt.classList.add('hidden');
            }

            modal.classList.remove('hidden');
            modal.classList.add('flex');
            window.safeCreateIcons();

        } catch (err) {
            window.showAlert("Errore", "Errore lettura file: " + err.message);
        }
    };
    reader.readAsText(file);
}

window.cancelMerge = function () {
    const modal = document.getElementById('merge-confirm-modal');
    modal.classList.add('hidden');
    modal.classList.remove('flex');
    pendingMergeData = null;
    pendingMergeFile = null;
    // Reset file input
    const input = document.getElementById(pendingMergeInputId);
    if (input) input.value = '';
}

window.confirmMerge = function () {
    const modal = document.getElementById('merge-confirm-modal');
    modal.classList.add('hidden');
    modal.classList.remove('flex');

    if (!pendingMergeData) return;

    // 1. Auto-save before merge
    if (window.electronAPI) {
        window.electronAPI.saveMapJSON(appState);
    }
    StorageManager.saveCurrentProject();
    window.showToast("Salvataggio automatico completato.", "success");

    const data = pendingMergeData;
    const wantAICrosslink = document.getElementById('merge-ai-crosslink')?.checked && appState.extractionMode !== 'mindmap';

    // 2. Normalize incoming links
    data.links.forEach(l => {
        if (typeof l.source === 'object' && l.source !== null) l.source = l.source.id;
        if (typeof l.target === 'object' && l.target !== null) l.target = l.target.id;
    });
    data.nodes.forEach(n => {
        delete n.vx; delete n.vy;
        delete n.fx; delete n.fy;
    });

    // 3. Semantic Merging & ID Collision Avoidance
    const prefix = '_m' + Date.now() + '_';
    const idMap = {};
    let addedNodes = 0;
    const newNodesToAdd = [];

    data.nodes.forEach(incomingNode => {
        const oldId = incomingNode.id;
        // Check if a node with the same label already exists
        const existingNode = appState.db.nodes.find(n => n.label && incomingNode.label && n.label.toLowerCase().trim() === incomingNode.label.toLowerCase().trim());

        if (existingNode) {
            // Semantic Merge
            idMap[oldId] = existingNode.id;
            // Merge descriptions & content (surgical injection)
            if (incomingNode.desc && existingNode.desc !== incomingNode.desc) {
                existingNode.desc = (existingNode.desc || "") + "\n\n[Dettaglio Unione]: " + incomingNode.desc;
            }
            if (incomingNode.content && existingNode.content !== incomingNode.content) {
                existingNode.content = (existingNode.content || "") + "\n\n[Nota Unione]: " + incomingNode.content;
            }

            // Merge chunks
            if (incomingNode.chunks && Array.isArray(incomingNode.chunks)) {
                existingNode.chunks = existingNode.chunks || [];
                existingNode.chunks.push(...incomingNode.chunks);
                existingNode.chunks = [...new Set(existingNode.chunks)];
            }
            // Merge URLs
            if (incomingNode.urls && Array.isArray(incomingNode.urls)) {
                existingNode.urls = existingNode.urls || [];
                existingNode.urls.push(...incomingNode.urls);
                existingNode.urls = [...new Set(existingNode.urls)];
            }
            // Merge Images
            if (incomingNode.images && Array.isArray(incomingNode.images)) {
                existingNode.images = existingNode.images || [];
                existingNode.images.push(...incomingNode.images);
                existingNode.images = [...new Set(existingNode.images)];
            }
        } else {
            // New Node
            const newId = prefix + oldId;
            idMap[oldId] = newId;
            incomingNode.id = newId;
            incomingNode.x = (incomingNode.x || 0) + 300 + Math.random() * 150;
            incomingNode.y = (incomingNode.y || 0) + 300 + Math.random() * 150;
            newNodesToAdd.push(incomingNode);
            addedNodes++;
        }
    });

    data.links.forEach(l => {
        l.source = idMap[l.source] || l.source;
        l.target = idMap[l.target] || l.target;
    });

    // Remove duplicate links
    const uniqueLinks = [];
    const linkSet = new Set();
    [...appState.db.links, ...data.links].forEach(l => {
        let sid = typeof l.source === 'object' ? l.source.id : l.source;
        let tid = typeof l.target === 'object' ? l.target.id : l.target;
        const sig1 = `${sid}-${tid}-${l.rel}`;
        const sig2 = `${tid}-${sid}-${l.rel}`;
        if (!linkSet.has(sig1) && !linkSet.has(sig2)) {
            linkSet.add(sig1);
            uniqueLinks.push(l);
        }
    });
    appState.db.links = uniqueLinks;

    // 4. Track which nodes are "new" for AI cross-linking
    const newNodeIds = new Set(newNodesToAdd.map(n => n.id));
    const existingNodeIds = new Set(appState.db.nodes.map(n => n.id));

    // 5. Add to appState
    let addedLinks = data.links.length;
    appState.db.nodes.push(...newNodesToAdd);

    // 6. Reset simulation
    simulation = null;
    initD3Visualization();
    window.updateDegreeStats();
    window.renderTreeView();
    window.updateUserNotesSidebar();

    const importedLabel = pendingMergeData.rootNodeLabel || pendingMergeFile;
    window.showToast(`Unione completata: +${addedNodes} nodi, +${addedLinks} link da "${importedLabel}"`, "success");

    // 7. AI Cross-linking (async)
    if (wantAICrosslink) {
        setTimeout(() => {
            window.aiCrossLink(existingNodeIds, newNodeIds);
        }, 500);
    }

    pendingMergeData = null;
    pendingMergeFile = null;
    const input = document.getElementById(pendingMergeInputId);
    if (input) input.value = '';
}

// ==========================================
// AI CROSS-LINKING
// ==========================================
window.aiCrossLink = async function (existingIds, newIds) {
    const apiKey = window.getSystemKey();
    if (!apiKey) {
        window.showToast("Nessuna API Key per le correlazioni AI.", "error");
        return;
    }

    // Collect labels from both sets (no token limit needed for Gemini 1.5)
    const existingLabels = appState.db.nodes
        .filter(n => existingIds.has(n.id))
        .map(n => ({ id: n.id, label: n.label }));

    const newLabels = appState.db.nodes
        .filter(n => newIds.has(n.id))
        .map(n => ({ id: n.id, label: n.label }));

    if (existingLabels.length === 0 || newLabels.length === 0) return;

    window.showLoadingOverlay(true, "L'AI sta cercando correlazioni tra le mappe...");

    const promptText = window.fillPromptTemplate("SEMANTIC_CORRELATION", {
        existingLabels: existingLabels.map(n => `- ${n.id}: "${n.label}"`).join('\\n'),
        newLabels: newLabels.map(n => `- ${n.id}: "${n.label}"`).join('\\n')
    });

    try {
        const response = await window.fetchModelAPI({
            contents: [{ parts: [{ text: promptText }] }],
            generationConfig: { temperature: 0.3, responseMimeType: "application/json" }
        }, apiKey);

        let jsonText = response?.candidates?.[0]?.content?.parts?.[0]?.text || '[]';
        jsonText = jsonText.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
        const suggestions = JSON.parse(jsonText);

        if (!Array.isArray(suggestions) || suggestions.length === 0) {
            window.showLoadingOverlay(false);
            window.showToast("Nessuna correlazione trovata dall'AI.", "info");
            return;
        }

        // Add AI-suggested links as dashed
        let addedAI = 0;
        suggestions.forEach(s => {
            // Verify both nodes exist
            const sourceExists = appState.db.nodes.some(n => n.id === s.source);
            const targetExists = appState.db.nodes.some(n => n.id === s.target);
            if (sourceExists && targetExists && s.rel) {
                appState.db.links.push({
                    source: s.source,
                    target: s.target,
                    rel: '🤖 ' + s.rel,
                    aiSuggested: true
                });
                addedAI++;
            }
        });

        // Re-render to show dashed links
        simulation = null;
        initD3Visualization();

        window.showLoadingOverlay(false);
        window.showToast(`L'AI ha suggerito ${addedAI} correlazioni. Click destro sui link tratteggiati per validarli o rimuoverli.`, "success");

    } catch (err) {
        window.showLoadingOverlay(false);
        window.showToast("Errore AI cross-linking: " + err.message, "error");
    }
}

// ==========================================
// VALIDATE / REMOVE AI LINKS
// ==========================================
window.openValidateModal = function (linkData) {
    validateLinkTarget = linkData;
    const sNode = appState.db.nodes.find(n => n.id === (typeof linkData.source === 'object' ? linkData.source.id : linkData.source));
    const tNode = appState.db.nodes.find(n => n.id === (typeof linkData.target === 'object' ? linkData.target.id : linkData.target));

    document.getElementById('validate-node-a').textContent = sNode ? sNode.label : '?';
    document.getElementById('validate-node-b').textContent = tNode ? tNode.label : '?';
    document.getElementById('validate-rel-input').value = linkData.rel.replace('🤖 ', '');

    const modal = document.getElementById('validate-link-modal');
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    window.safeCreateIcons();
}

window.closeValidateModal = function () {
    const modal = document.getElementById('validate-link-modal');
    modal.classList.add('hidden');
    modal.classList.remove('flex');
    validateLinkTarget = null;
}

window.confirmValidateLink = function () {
    if (!validateLinkTarget) return;
    const newRel = document.getElementById('validate-rel-input').value.trim();
    if (!newRel) {
        window.showToast("Inserisci una parola di relazione.", "error");
        return;
    }
    // Update the link
    validateLinkTarget.rel = newRel;
    validateLinkTarget.aiSuggested = false;

    // Re-render to update visual
    renderGraph();
    window.closeValidateModal();
    window.showToast("Link validato e confermato!", "success");
}

window.removeAILink = function (linkData) {
    const idx = appState.db.links.indexOf(linkData);
    if (idx >= 0) {
        appState.db.links.splice(idx, 1);
        renderGraph();
        window.showToast("Link AI rimosso.", "info");
    }
}

window.exportNotesMarkdown = function () {
    if (!appState.db.nodes.length) return window.showAlert("Errore", "Nessun appunto disponibile nella mappa corrente.");
    let md = `# Appunti: ${appState.rootNodeLabel}\n\n`;

    let nodesByLvl = {};
    appState.db.nodes.forEach(n => {
        let l = n.level || 0;
        if (!nodesByLvl[l]) nodesByLvl[l] = [];
        nodesByLvl[l].push(n);
    });

    const sortedLevels = Object.keys(nodesByLvl).sort((a, b) => a - b);

    sortedLevels.forEach(lvl => {
        const headerPrefix = "#".repeat(Math.min(parseInt(lvl) + 1, 6));
        nodesByLvl[lvl].forEach(n => {
            md += `${headerPrefix} ${cleanLabel(n.label)}\n`;
            if (n.desc || n.content) md += `${cleanLabel(n.desc || n.content)}\n\n`;
            if (n.chunks && n.chunks.length > 0) {
                md += `*Fonti estratte:*\n`;
                n.chunks.forEach(c => md += `> ${cleanLabel(c)}\n`);
                md += `\n`;
            }
        });
    });

    const dataStr = "data:text/markdown;charset=utf-8," + encodeURIComponent(md);
    const dl = document.createElement('a');
    dl.setAttribute("href", dataStr);
    dl.setAttribute("download", `appunti_${appState.rootNodeLabel.split(' ').join('_')}.md`);
    dl.click();
}




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
            <div class="ctx-item" onclick="window.ctxAction('expand_ai')"><i data-lucide="sparkles" class="text-indigo-500"></i> Espandi con IA (Da Fonte)...</div>
        ` : '';

        const spacedRepetitionHtml = !appState.studentMode ? `
            <div class="px-3 py-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-widest bg-slate-50 border-y border-slate-200 mt-1">Spaced Repetition</div>
            <div class="ctx-item text-indigo-600" onclick="window.ctxAction('generate_flashcard')"><i data-lucide="brain-circuit"></i> Flashcard Nodo</div>
            <div class="ctx-item text-indigo-600" onclick="window.ctxAction('generate_flashcard_branch')"><i data-lucide="network"></i> Flashcard Ramo</div>
            <div class="ctx-item text-purple-600" onclick="window.ctxAction('test_flashcard')"><i data-lucide="graduation-cap"></i> Quiz Nodo</div>
            <div class="ctx-item text-purple-600" onclick="window.ctxAction('test_flashcard_branch')"><i data-lucide="layers"></i> Quiz Ramo</div>
            <hr class="my-1 border-slate-200">
        ` : '';

        menu.innerHTML = `
                    <div class="px-3 py-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-widest bg-slate-50 border-b border-slate-200">Stato di Studio</div>
                    <div class="ctx-item" onclick="window.ctxAction('status_todo')"><i data-lucide="circle-dashed" class="text-red-500"></i> Da studiare</div>
                    <div class="ctx-item" onclick="window.ctxAction('status_review')"><i data-lucide="refresh-cw" class="text-amber-500"></i> Ripasso necessario</div>
                    <div class="ctx-item" onclick="window.ctxAction('status_done')"><i data-lucide="check-circle-2" class="text-emerald-500"></i> Imparato!</div>
                    <div class="ctx-item" onclick="window.ctxAction('status_none')"><i data-lucide="circle" class="text-slate-300"></i> Azzera Semaforo</div>
                    <div class="px-3 py-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-widest bg-slate-50 border-y border-slate-200 mt-1">Editor Mappa</div>
                    ${expandAiHtml}
                    <div class="ctx-item" onclick="window.ctxAction('edit')"><i data-lucide="edit"></i> Modifica Contenuti...</div>
                    <div class="ctx-item" onclick="window.ctxAction('rename')"><i data-lucide="type"></i> Rinomina Etichetta</div>
                    <div class="ctx-item" onclick="window.ctxAction('add_child')"><i data-lucide="plus-circle"></i> Aggiungi Nodo Figlio</div>
                    <div class="ctx-item" onclick="window.ctxAction('link')"><i data-lucide="link"></i> Crea Relazione...</div>
                    <hr class="my-1 border-slate-200">
                    ${spacedRepetitionHtml}
                    <div class="ctx-item danger" onclick="window.ctxAction('delete_node')"><i data-lucide="trash-2"></i> Elimina Nodo</div>
                `;
    } else if (type === 'link') {
        if (data.aiSuggested) {
            menu.innerHTML = `
                        <div class="px-3 py-1.5 text-[10px] font-bold text-amber-500 uppercase tracking-widest bg-amber-50 border-b border-amber-200">🤖 Link AI Suggerito</div>
                        <div class="ctx-item text-emerald-600" onclick="window.ctxAction('validate_ai_link')"><i data-lucide="check-circle"></i> Valida Correlazione</div>
                        <hr class="my-1 border-slate-200">
                        <div class="ctx-item danger" onclick="window.ctxAction('remove_ai_link')"><i data-lucide="trash-2"></i> Rimuovi Link AI</div>
                    `;
        } else {
            menu.innerHTML = `
                        <div class="ctx-item" onclick="window.ctxAction('rename_link')"><i data-lucide="type"></i> Rinomina Relazione</div>
                        <hr class="my-1 border-slate-200">
                        <div class="ctx-item danger" onclick="window.ctxAction('delete_link')"><i data-lucide="trash-2"></i> Elimina Link</div>
                    `;
        }
    } else if (type === 'bg') {
        if (appState.extractionMode === 'kg') {
            menu.innerHTML = `
                <div class="ctx-item" onclick="window.ctxAction('add_isolated_hub')"><i data-lucide="sun" class="text-amber-500"></i> Nuovo Super-Hub Isolato</div>
                <div class="ctx-item" onclick="window.ctxAction('add_isolated_node')"><i data-lucide="circle"></i> Nuovo Nodo Isolato</div>
                <div class="ctx-item" onclick="window.resetZoom()"><i data-lucide="maximize"></i> Centra Vista</div>
            `;
        } else {
            menu.innerHTML = `
                <div class="ctx-item" onclick="window.ctxAction('add_isolated')"><i data-lucide="plus"></i> Nuovo Nodo Isolato</div>
                <div class="ctx-item" onclick="window.resetZoom()"><i data-lucide="maximize"></i> Centra Vista</div>
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

window.ctxAction = function (action) {
    const data = ctxTarget.data;
    hideContextMenu();

    if (action === 'expand_ai') {
        window.openContextualAIExtensionModal(data);
        return;
    }
    if (action.startsWith('status_')) {
        const status = action.split('_')[1];
        data.studyStatus = status;
        renderGraph();
        if (currentNode && currentNode.id === data.id) window.handleNodeClick({ stopPropagation: () => { } }, currentNode);
    }
    else if (action === 'rename') {
        window.showPrompt("Nuova etichetta del nodo:", cleanLabel(data.label), (newLabel) => {
            if (newLabel) { data.label = newLabel; renderGraph(); }
        });
    }
    else if (action === 'edit') { window.openEditModal(data); }
    else if (action === 'add_child') {
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
        window.showPrompt("Nome del nuovo nodo isolato:", "", (lbl) => {
            if (lbl) {
                let newId = 'NODE_' + Math.random().toString(36).substr(2, 6).toUpperCase();
                appState.db.nodes.push({ id: newId, label: lbl, content: "", desc: "", level: 2, studyStatus: 'none', chunks: [] });
                window.updateDegreeStats(); renderGraph();
            }
        });
    }
    else if (action === 'link') {
        linkingState = { active: true, sourceNode: data };
        const hint = document.getElementById('mode-hint');
        hint.innerText = "MODALITÀ COLLEGAMENTO: Clicca sul nodo di destinazione"; hint.classList.remove('hidden');
        pathfinderActive = false;
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
        window.showConfirm("Elimina Nodo", "Sei sicuro di voler eliminare questo nodo e tutti i link connessi?", () => {
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
    else if (action === 'rename_link') {
        window.showPrompt("Nuova etichetta relazione:", data.rel, (newRel) => {
            if (newRel) { data.rel = newRel; renderGraph(); }
        });
    }
    else if (action === 'delete_link') {
        appState.db.links = appState.db.links.filter(l => l !== data);
        window.updateDegreeStats(); renderGraph();
    }
    else if (action === 'validate_ai_link') {
        window.openValidateModal(data);
    }
    else if (action === 'remove_ai_link') {
        window.removeAILink(data);
    }
    else if (action === 'add_isolated') {
        window.showPrompt("Nome del nuovo nodo:", "", (lbl) => {
            if (lbl) {
                let newId = 'NODE_' + Math.random().toString(36).substr(2, 6).toUpperCase();
                appState.db.nodes.push({ id: newId, label: lbl, content: "", desc: "", level: 1, studyStatus: 'none', chunks: [] });
                window.updateDegreeStats(); renderGraph();
            }
        });
    }
}

// ==========================================
// EDIT MODAL LOGIC
// ==========================================
let editTarget = null;
let editLinks = [];
let editImages = [];

window.openEditModal = function (nodeData) {
    editTarget = nodeData;
    document.getElementById('edit-n-label').value = cleanLabel(nodeData.label) || "";
    document.getElementById('edit-n-content').value = cleanLabel(nodeData.content || nodeData.desc) || "";

    // Migration to arrays
    editLinks = nodeData.urls ? [...nodeData.urls] : (nodeData.url ? [nodeData.url] : []);
    editImages = nodeData.images ? [...nodeData.images] : (nodeData.image ? [nodeData.image] : []);

    // Initialization of aiDesc if missing (retro-compatibility)
    if (!nodeData.aiDesc && !nodeData.hasCustomText) {
        nodeData.aiDesc = nodeData.desc;
    }

    // Show/hide Revert AI button
    const revertBtn = document.getElementById('revert-ai-btn');
    if (revertBtn) revertBtn.classList.toggle('hidden', !nodeData.hasCustomText || !nodeData.aiDesc);

    // Icon Visibility settings
    const vis = nodeData.iconVisibility || { text: true, image: true, link: true, file: true };
    document.getElementById('edit-vis-text').checked = vis.text !== false;
    document.getElementById('edit-vis-image').checked = vis.image !== false;
    document.getElementById('edit-vis-link').checked = vis.link !== false;
    document.getElementById('edit-vis-file').checked = vis.file !== false;

    // Clear inputs
    const urlInput = document.getElementById('edit-n-url-input');
    const imgUrlInput = document.getElementById('edit-n-image-url-input');
    const fileInput = document.getElementById('edit-n-image-file-input');
    const colorInput = document.getElementById('edit-n-color');
    if (colorInput) {
        const groupKey = (editTarget.level === 0) ? 0 : editTarget.group;
        let currentBaseColor = (appState.db.customColors && appState.db.customColors[groupKey] !== undefined)
            ? appState.db.customColors[groupKey]
            : (colorScale[groupKey] || colorScale[1]);
        colorInput.value = currentBaseColor;
    }

    if (urlInput) urlInput.value = "";

    window.renderEditLinksList();
    window.renderEditImagesList();

    const modal = document.getElementById('edit-node-modal');
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    const box = document.getElementById('edit-node-box');
    setTimeout(() => {
        modal.classList.remove('opacity-0');
        box.classList.remove('scale-95');
        window.safeCreateIcons();
    }, 10);
}

window.setEditColor = function (color) {
    const colorInput = document.getElementById('edit-n-color');
    if (colorInput) {
        colorInput.value = color;
    }
};

window.renderEditLinksList = function () {
    const container = document.getElementById('edit-n-urls-list');
    if (!container) return;
    container.innerHTML = editLinks.map((link, idx) => `
                <div class="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-lg p-2 group transition-colors hover:bg-slate-100">
                    <span class="text-xs text-slate-600 truncate flex-grow mr-2"><i data-lucide="${link.startsWith('file://') ? 'database' : 'link'}" class="w-3 h-3 inline mr-1"></i> ${link}</span>
                    <button onclick="window.removeLinkFromEdit(${idx})" class="text-red-500 hover:text-red-700 p-1 transition-colors"><i data-lucide="trash-2" class="w-3.5 h-3.5"></i></button>
                </div>
            `).join('');
    window.safeCreateIcons({ root: container });
}

window.renderEditImagesList = function () {
    const container = document.getElementById('edit-n-images-list');
    if (!container) return;
    container.innerHTML = editImages.map((img, idx) => `
                <div class="relative aspect-square bg-slate-100 rounded-lg overflow-hidden border border-slate-200 group transition-all hover:border-indigo-300">
                    <img src="${img}" class="w-full h-full object-cover">
                    <button onclick="window.removeImageFromEdit(${idx})" class="absolute top-1 right-1 bg-red-500 text-white rounded-full p-1 transition-opacity shadow-sm hover:bg-red-600"><i data-lucide="x" class="w-3 h-3"></i></button>
                </div>
            `).join('');
    window.safeCreateIcons({ root: container });
}

window.addLinkToNode = function () {
    const input = document.getElementById('edit-n-url-input');
    const val = input.value.trim();
    if (val) {
        editLinks.push(val);
        input.value = "";
        window.renderEditLinksList();
    }
}

window.removeLinkFromEdit = function (idx) {
    editLinks.splice(idx, 1);
    window.renderEditLinksList();
}

window.addImageToNode = function () {
    const input = document.getElementById('edit-n-image-url-input');
    const val = input.value.trim();
    if (val) {
        editImages.push(val);
        input.value = "";
        window.renderEditImagesList();
    }
}

window.removeImageFromEdit = function (idx) {
    editImages.splice(idx, 1);
    window.renderEditImagesList();
}

window.handlePickLocalFileForEdit = async function () {
    if (window.electronAPI && window.electronAPI.pickFile) {
        const result = await window.electronAPI.pickFile();
        if (!result.canceled && result.filePath) {
            const input = document.getElementById('edit-n-url-input');
            input.value = 'file://' + result.filePath;
        }
    }
};

window.handleImageUploadForEdit = function (input) {
    if (input.files && input.files[0]) {
        const reader = new FileReader();
        reader.onload = function (e) {
            editImages.push(e.target.result);
            input.value = "";
            window.renderEditImagesList();
        };
        reader.readAsDataURL(input.files[0]);
    }
};

window.revertToAIContent = function () {
    if (!editTarget || !editTarget.aiDesc) return;
    document.getElementById('edit-n-content').value = editTarget.aiDesc;
    editTarget.hasCustomText = false;
    document.getElementById('revert-ai-btn').classList.add('hidden');
    window.showToast("Testo ripristinato alla versione AI.", "info");
}

window.closeEditModal = function () {
    const modal = document.getElementById('edit-node-modal');
    const box = document.getElementById('edit-node-box');
    modal.classList.add('opacity-0');
    box.classList.add('scale-95');
    setTimeout(() => { modal.classList.add('hidden'); modal.classList.remove('flex'); }, 200);
    editTarget = null;
}

window.saveEditNode = function () {
    if (!editTarget) return;
    editTarget.label = document.getElementById('edit-n-label').value.trim();
    const newContent = document.getElementById('edit-n-content').value.trim();
    const oldContent = (editTarget.desc || "").trim();

    if (newContent !== oldContent && newContent !== "") {
        editTarget.hasCustomText = true;
    }

    editTarget.desc = newContent;
    editTarget.content = editTarget.desc;

    editTarget.urls = [...editLinks];
    editTarget.images = [...editImages];

    editTarget.iconVisibility = {
        text: document.getElementById('edit-vis-text').checked,
        image: document.getElementById('edit-vis-image').checked,
        link: document.getElementById('edit-vis-link').checked,
        file: document.getElementById('edit-vis-file').checked
    };

    // Handle Macroarea Color
    const colorInput = document.getElementById('edit-n-color');
    if (colorInput) {
        const groupKey = (editTarget.level === 0) ? 0 : editTarget.group;
        if (groupKey !== undefined) {
            if (!appState.db.customColors) appState.db.customColors = {};
            appState.db.customColors[groupKey] = colorInput.value;
        }
    }

    // Sync legacy fields for backward compatibility
    editTarget.url = editTarget.urls[0] || "";
    editTarget.image = editTarget.images[0] || "";
    editTarget.hasCustomImage = editTarget.images.length > 0;

    window.closeEditModal();
    renderGraph();
    window.updateUserNotesSidebar();
    StorageManager.saveCurrentProject();
    if (currentNode && currentNode.id === editTarget.id) window.handleNodeClick({ stopPropagation: () => { } }, currentNode);
}

window.updateUserNotesSidebar = function () {
    const container = document.getElementById('user-notes-container');
    const hint = document.getElementById('empty-notes-hint');
    if (!container) return;

    const customNodes = appState.db.nodes.filter(n => n.hasCustomText || n.hasCustomImage || (n.urls && n.urls.length > 0) || n.url);
    if (customNodes.length === 0) {
        if (hint) hint.style.display = 'block';
        Array.from(container.children).forEach(c => { if (c.id !== 'empty-notes-hint') c.remove(); });
        return;
    }
    if (hint) hint.style.display = 'none';

    let html = '';
    customNodes.forEach(n => {
        html += `<div class="bg-indigo-50 border border-indigo-100 rounded-xl p-3 cursor-pointer hover:bg-indigo-100 transition shadow-sm" onclick="window.zoomToNode('${n.id.replace(/'/g, "\\'")}')">`;
        html += `<h4 class="font-bold text-sm text-indigo-700 flex items-center gap-1.5"><i data-lucide="tag" class="w-3.5 h-3.5"></i> ${n.label}</h4>`;
        if (n.hasCustomText) {
            if (n.aiDesc && n.aiDesc !== n.desc) {
                html += `<p class="text-[10px] text-slate-400 mt-1 line-clamp-2 italic border-l-2 border-slate-200 pl-2 mb-1">${n.aiDesc}</p>`;
            }
            html += `<p class="text-xs text-slate-800 mt-1 line-clamp-3 font-medium">${n.desc}</p>`;
        }
        if (n.image) {
            html += `<img src="${n.image}" class="w-full h-20 object-cover rounded mt-2 border border-indigo-200">`;
        }
        const nodeUrls = n.urls || (n.url ? [n.url] : []);
        if (nodeUrls.length > 0) {
            html += `<div class="mt-2 space-y-1">`;
            nodeUrls.forEach(u => {
                const isLocal = u.startsWith('file://');
                let displayUrl;
                if (isLocal) {
                    try {
                        displayUrl = decodeURIComponent(u.split('/').pop());
                    } catch (e) {
                        displayUrl = u.split('/').pop();
                    }
                } else {
                    displayUrl = u.length > 30 ? u.substring(0, 30) + "..." : u;
                }

                html += `
                    <span class="flex items-center gap-1.5 px-2 py-1 bg-white border border-slate-200 rounded text-[10px] text-indigo-600 font-bold shadow-sm" onclick="event.stopPropagation(); window.openCustomLink('${u.replace(/'/g, "\\'")}')">
                        <i data-lucide="${isLocal ? 'database' : 'link'}" class="w-3 h-3"></i> ${isLocal ? 'File' : 'Link'}: <span class="font-normal underline">${displayUrl}</span>
                    </span>`;
            });
            html += `</div>`;
        }
        html += `</div>`;
    });

    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    Array.from(container.children).forEach(c => { if (c.id !== 'empty-notes-hint') c.remove(); });
    while (tmp.firstChild) {
        container.appendChild(tmp.firstChild);
    }
    setTimeout(() => { if (window.lucide) window.lucide.createIcons(); }, 50);
}

// ==========================================
// SPACED REPETITION & FLASHCARDS
// ==========================================
let currentQuizNode = null;

window.generateFlashcardForNode = async function (node, silent = false, isBranch = false) {
    const apiKey = window.getSystemKey();
    if (!apiKey) {
        if (!silent) window.showToast("Nessuna API Key presente per generare le flashcard.", "error"); return;
    }
    if (!silent) window.showLoadingOverlay(true, "Generazione Flashcard in corso...", "flashcard");

    const promptText = window.fillPromptTemplate("MULTIPLE_CHOICE_QUIZ", {
        nodeLabel: node.label,
        nodeContent: node.content || node.desc
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

    const payload = { contents: [{ parts: [{ text: promptText }] }], generationConfig: { temperature: 0.3, responseMimeType: "application/json", responseSchema: schema } };

    try {
        const data = await window.fetchModelAPI(payload, apiKey);
        let rawText = data.candidates[0].content.parts[0].text;
        let cleanText = rawText.split(MARKER_JSON).join('').split(MARKER_END).join('').trim();
        const items = JSON.parse(cleanText);
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
            window.showToast("Flashcard generata! Apri il menu per ripassare.", "success");
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
    if (!apiKey) { window.showToast("Inserisci API Key.", "error"); return; }

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
        window.showToast("Nessuna flashcard generata.", "error");
    }
};

window.testBranchFlashcards = function (node) {
    let nodes = [node, ...window.getDescendants(node.id)].filter(n => n.flashcardTest);
    if (nodes.length === 0) {
        window.showToast("Nessuna flashcard trovata nel ramo. Generala prima!", "error");
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
    window.renderSubQuestion();

    const modal = document.getElementById('quiz-modal');
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    const box = document.getElementById('quiz-modal-content');
    setTimeout(() => {
        modal.classList.remove('opacity-0');
        box.classList.remove('scale-95');
    }, 10);
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
        window.showToast("Stato aggiornato nel sistema Spaced Repetition.", "success");
    }
};

window.handleImageUpload = function (input) {
    const file = input.files[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
        window.showToast("Immagine troppo grande (Massimo consentito: 2MB).", "error");
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

    instruction = window.fillPromptTemplate(lang === 'it' ? "SOCRATIC_TUTOR_IT" : "SOCRATIC_TUTOR_EN", {
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
            contents: currentNodeState.history
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

        currentQuizData = JSON.parse(cleanJson);

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

// ==========================================
// POMODORO & STATS LOGIC
// ==========================================
let pomodoroInterval;
let pomodoroDuration = 25 * 60;
let pomodoroTimeLeft = 25 * 60;
let isPomodoroRunning = false;

window.setPomodoroDuration = function (mins) {
    pomodoroDuration = mins * 60;
    clearInterval(pomodoroInterval);
    isPomodoroRunning = false;
    pomodoroTimeLeft = pomodoroDuration;

    const btn = document.getElementById('pomodoro-btn');
    if (btn) {
        btn.innerHTML = `<i data-lucide="play" class="w-4 h-4 fill-current"></i>`;
        btn.className = "p-2 bg-rose-50 text-rose-600 rounded-lg border border-rose-200 hover:bg-rose-100 transition shadow-sm flex items-center justify-center";
    }
    updatePomodoroDisplay();
    if (window.safeCreateIcons) window.safeCreateIcons();

    const p15 = document.getElementById('pomodoro-preset-15');
    const p25 = document.getElementById('pomodoro-preset-25');
    if (p15 && p25) {
        if (mins === 15) {
            p15.className = "px-2.5 py-1 bg-rose-50 text-rose-600 border border-rose-200 rounded-md hover:bg-rose-100 transition font-bold";
            p25.className = "px-2.5 py-1 text-slate-500 border border-slate-200 rounded-md hover:bg-slate-50 transition font-bold";
        } else {
            p25.className = "px-2.5 py-1 bg-rose-50 text-rose-600 border border-rose-200 rounded-md hover:bg-rose-100 transition font-bold";
            p15.className = "px-2.5 py-1 text-slate-500 border border-slate-200 rounded-md hover:bg-slate-50 transition font-bold";
        }
    }
};

window.togglePomodoro = function () {
    const btn = document.getElementById('pomodoro-btn');
    if (isPomodoroRunning) {
        clearInterval(pomodoroInterval);
        isPomodoroRunning = false;
        btn.innerHTML = `<i data-lucide="play" class="w-4 h-4 fill-current"></i>`;
        btn.className = "p-2 bg-amber-50 text-amber-600 rounded-lg border border-amber-200 hover:bg-amber-100 transition shadow-sm flex items-center justify-center";
    } else {
        isPomodoroRunning = true;
        btn.innerHTML = `<i data-lucide="pause" class="w-4 h-4 fill-current"></i>`;
        btn.className = "p-2 bg-slate-50 text-slate-600 rounded-lg border border-slate-200 hover:bg-slate-100 transition shadow-sm flex items-center justify-center";
        pomodoroInterval = setInterval(() => {
            if (pomodoroTimeLeft > 0) {
                pomodoroTimeLeft--;
                updatePomodoroDisplay();
            } else {
                window.resetPomodoro();
                try {
                    let sessions = parseInt(localStorage.getItem('mappai_pomodoro_sessions') || '0', 10);
                    sessions++;
                    localStorage.setItem('mappai_pomodoro_sessions', sessions.toString());
                    window.updatePomodoroSessionsDisplay();
                } catch (e) {
                    console.error("Error updating pomodoro sessions", e);
                }
                window.showToast("Tempo scaduto! Fai una pausa.", "success");
            }
        }, 1000);
    }
    if (window.safeCreateIcons) window.safeCreateIcons();
};

window.resetPomodoro = function () {
    clearInterval(pomodoroInterval);
    isPomodoroRunning = false;
    pomodoroTimeLeft = pomodoroDuration;
    const btn = document.getElementById('pomodoro-btn');
    btn.innerHTML = `<i data-lucide="play" class="w-4 h-4 fill-current"></i>`;
    btn.className = "p-2 bg-rose-50 text-rose-600 rounded-lg border border-rose-200 hover:bg-rose-100 transition shadow-sm flex items-center justify-center";
    updatePomodoroDisplay();
    if (window.safeCreateIcons) window.safeCreateIcons();
};

function updatePomodoroDisplay() {
    const m = Math.floor(pomodoroTimeLeft / 60).toString().padStart(2, '0');
    const s = (pomodoroTimeLeft % 60).toString().padStart(2, '0');
    const pTime = document.getElementById('pomodoro-time');
    if (pTime) pTime.innerText = `${m}:${s}`;
}

window.updatePomodoroSessionsDisplay = function () {
    try {
        const count = localStorage.getItem('mappai_pomodoro_sessions') || '0';
        const badge = document.getElementById('pomodoro-sessions-badge');
        if (badge) {
            badge.innerText = `Sessioni: ${count} 🔥`;
        }
    } catch (e) {
        console.error("Error displaying pomodoro sessions", e);
    }
};

window.resetPomodoroSessions = function () {
    if (confirm("Sei sicuro di voler azzerare le sessioni di Pomodoro completate?")) {
        try {
            localStorage.setItem('mappai_pomodoro_sessions', '0');
            window.updatePomodoroSessionsDisplay();
            window.showToast("Sessioni azzerate", "info");
        } catch (e) {
            console.error("Error resetting pomodoro sessions", e);
        }
    }
};


window.updateStudyStats = function () {
    let done = 0, review = 0, todo = 0, total = 0;
    if (!appState || !appState.db || !appState.db.nodes) return;

    appState.db.nodes.forEach(n => {
        if (n.level === 0) return; // exclude root
        total++;
        if (n.studyStatus === 'done') done++;
        else if (n.studyStatus === 'review') review++;
        else if (n.studyStatus === 'todo') todo++;
    });

    const statsDone = document.getElementById('stats-done');
    if (statsDone) statsDone.innerText = done;
    const statsReview = document.getElementById('stats-review');
    if (statsReview) statsReview.innerText = review;
    const statsTodo = document.getElementById('stats-todo');
    if (statsTodo) statsTodo.innerText = todo;

    const perc = total === 0 ? 0 : Math.round((done / total) * 100);
    const progText = document.getElementById('study-progress-text');
    if (progText) progText.innerText = `${perc}%`;
    const progBar = document.getElementById('study-progress-bar');
    if (progBar) progBar.style.width = `${perc}%`;
};

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

        // Salva automaticamente la Mappa come .JSON tramite Electron!
        if (window.electronAPI) {
            window.electronAPI.saveMapJSON(appState);
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

    renderRecentProjects: function () {
        const container = document.getElementById('recent-projects-container');
        if (!container) return;

        try {
            const projects = JSON.parse(localStorage.getItem('tutor_ai_projects') || "[]");

            if (projects.length === 0) {
                container.innerHTML = '<p class="text-xs text-slate-400 italic">Nessun progetto salvato in questa App MappAI.</p>';
                return;
            }

            container.innerHTML = projects.map(p => {
                const d = new Date(p.date).toLocaleDateString();
                const icon = p.type === 'kg' ? 'network' : 'git-merge';
                const label = p.type === 'kg' ? 'Knowledge Graph' : 'Mappa Mentale';
                return `
                        <div class="flex-shrink-0 w-48 bg-white border border-indigo-200/60 rounded-xl p-3 flex flex-col justify-between hover:bg-indigo-50 hover:border-indigo-300 hover:shadow-md transition cursor-pointer group shadow-sm" onclick="window.loadSavedProject('${p.id}')">
                            <div>
                                <div class="flex items-center gap-1.5 mb-1 text-indigo-400">
                                    <i data-lucide="${icon}" class="w-3 h-3"></i>
                                    <span class="text-[8px] font-bold uppercase tracking-tighter">${label}</span>
                                </div>
                                <h4 class="text-xs text-slate-700 font-bold mb-1 truncate group-hover:text-indigo-600 transition" title="${p.name}">${p.name}</h4>
                                <p class="text-[9px] text-slate-400 font-medium">${p.nodesCount} nodi &bull; ${d}</p>
                            </div>
                            <div class="flex justify-between items-center mt-2">
                                <span class="text-[9px] text-indigo-500 font-bold flex items-center gap-1 group-hover:text-indigo-700"><i data-lucide="play-circle" class="w-3 h-3"></i> Riprendi</span>
                                <button onclick="StorageManager.deleteProject(event, '${p.id}')" class="text-slate-300 hover:text-red-500 transition" title="Elimina"><i data-lucide="trash" class="w-3 h-3"></i></button>
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

window.changeLanguage = function (lang, showToastMsg = true) {
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
        'label-step4-kg-desc': t.step_kg_density_desc,
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
        'label-refresh-models': t.refresh_models
    };

    for (let id in els) {
        const el = document.getElementById(id);
        if (el) el.innerText = els[id];
    }

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

    // --- 2. LOCALIZZAZIONE MODALE STUDIO (Active Study) ---
    const studyContainer = document.getElementById('study-modal-content');
    if (studyContainer) {
        studyContainer.innerHTML = `
                <p class="mb-4 text-sm leading-relaxed">${t.study_intro}</p>

                <div class="bg-indigo-50 border border-indigo-200 rounded-xl p-4 mb-4">
                    <h3 class="font-black text-indigo-700 text-sm mb-2 flex items-center gap-2">
                        <span class="text-lg">🔁</span> ${t.study_sr_title}
                    </h3>
                    <p class="text-xs text-slate-600 leading-relaxed">${t.study_sr_desc}</p>
                </div>

                <div class="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4">
                    <h3 class="font-black text-amber-700 text-sm mb-2 flex items-center gap-2">
                        <span class="text-lg">🧠</span> ${t.study_ar_title}
                    </h3>
                    <p class="text-xs text-slate-600 leading-relaxed">${t.study_ar_desc}</p>
                </div>

                <div class="bg-emerald-50 border border-emerald-200 rounded-xl p-4 mb-4">
                    <h3 class="font-black text-emerald-700 text-sm mb-2 flex items-center gap-2">
                        <span class="text-lg">👨‍🏫</span> ${t.study_feynman_title}
                    </h3>
                    <p class="text-xs text-slate-600 leading-relaxed">${t.study_feynman_desc}</p>
                </div>

                <div class="bg-rose-50 border border-rose-200 rounded-xl p-4 mb-4">
                    <h3 class="font-black text-rose-700 text-sm mb-2 flex items-center gap-2">
                        <span class="text-lg">🔀</span> ${t.study_interleaving_title}
                    </h3>
                    <p class="text-xs text-slate-600 leading-relaxed">${t.study_interleaving_desc}</p>
                </div>

                <div class="bg-sky-50 border border-sky-200 rounded-xl p-4 mb-4">
                    <h3 class="font-black text-sky-700 text-sm mb-2 flex items-center gap-2">
                        <span class="text-lg">❓</span> ${t.study_elaboration_title}
                    </h3>
                    <p class="text-xs text-slate-600 leading-relaxed">${t.study_elaboration_desc}</p>
                </div>

                <div class="bg-indigo-50 border border-indigo-200 rounded-xl p-4">
                    <h3 class="font-black text-indigo-700 text-sm mb-2 flex items-center gap-2">
                        <span class="text-lg">📂</span> ${t.study_local_files_title}
                    </h3>
                    <p class="text-xs text-slate-600 leading-relaxed">${t.study_local_files_desc}</p>
                </div>

                <p class="font-bold text-indigo-600 mt-6 text-center text-[11px] leading-relaxed">${t.study_footer}</p>
                `;
    }

    // --- 3. LOCALIZZAZIONE MODALE GUIDA ---
    const guideContainer = document.getElementById('guide-modal-content');
    if (guideContainer) {
        if (appState.studentMode) {
            guideContainer.innerHTML = `
                <div class="bg-violet-50 border border-violet-200 rounded-xl p-4">
                    <h3 class="font-black text-violet-700 text-sm mb-2">${t.guide_step5_title}</h3>
                    <p class="text-xs text-slate-600 space-y-1 leading-relaxed">${t.guide_step5_desc}</p>
                </div>

                <div class="bg-sky-50 border border-sky-200 rounded-xl p-4">
                    <h3 class="font-black text-sky-700 text-sm mb-2">${t.guide_step6_title}</h3>
                    <p class="text-xs text-slate-600 leading-relaxed">${t.guide_step6_desc}</p>
                </div>

                <div class="bg-rose-50 border border-rose-200 rounded-xl p-4">
                    <h3 class="font-black text-rose-700 text-sm mb-2">${t.guide_notes_title}</h3>
                    <p class="text-xs text-slate-600 leading-relaxed">${t.guide_notes_desc}</p>
                </div>

                <p class="text-center text-xs text-slate-400 italic pt-4 leading-relaxed">${t.guide_footer}</p>
            `;
        } else {
            guideContainer.innerHTML = `
                <div class="bg-indigo-50 border border-indigo-200 rounded-xl p-4">
                    <h3 class="font-black text-indigo-700 text-sm mb-2">${t.guide_step1_title}</h3>
                    <p class="text-xs text-slate-600 leading-relaxed">${t.guide_step1_desc}</p>
                </div>

                <div class="bg-amber-50 border border-amber-200 rounded-xl p-4">
                    <h3 class="font-black text-amber-700 text-sm mb-2">${t.guide_step2_title}</h3>
                    <p class="text-xs text-slate-600 space-y-1 leading-relaxed">${t.guide_step2_desc}</p>
                </div>

                <div class="bg-fuchsia-50 border border-fuchsia-200 rounded-xl p-4">
                    <h3 class="font-black text-fuchsia-700 text-sm mb-2">${t.guide_step3_title}</h3>
                    <p class="text-xs text-slate-600 leading-relaxed">${t.guide_step3_desc}</p>
                </div>

                <div class="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
                    <h3 class="font-black text-emerald-700 text-sm mb-2">${t.guide_step4_title}</h3>
                    <p class="text-xs text-slate-600 leading-relaxed">${t.guide_step4_desc}</p>
                </div>

                <div class="bg-violet-50 border border-violet-200 rounded-xl p-4">
                    <h3 class="font-black text-violet-700 text-sm mb-2">${t.guide_step5_title}</h3>
                    <p class="text-xs text-slate-600 space-y-1 leading-relaxed">${t.guide_step5_desc}</p>
                </div>

                <div class="bg-sky-50 border border-sky-200 rounded-xl p-4">
                    <h3 class="font-black text-sky-700 text-sm mb-2">${t.guide_step6_title}</h3>
                    <p class="text-xs text-slate-600 leading-relaxed">${t.guide_step6_desc}</p>
                </div>

                <div class="bg-rose-50 border border-rose-200 rounded-xl p-4">
                    <h3 class="font-black text-rose-700 text-sm mb-2">${t.guide_notes_title}</h3>
                    <p class="text-xs text-slate-600 leading-relaxed">${t.guide_notes_desc}</p>
                </div>

                <p class="text-center text-xs text-slate-400 italic pt-4 leading-relaxed">${t.guide_footer}</p>
            `;
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
    if (window.showToast && showToastMsg) {
        window.showToast(lang === 'it' ? t.toast_lang_it : t.toast_lang_en, "info");
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
    window.changeLanguage(window.currentLanguage, false);

    // Header Buttons
    const btnConfig = document.getElementById('btn-config-ai');
    const btnGuide = document.getElementById('btn-app-guide');
    const btnStudy = document.getElementById('btn-app-tutorial');

    if (btnConfig) btnConfig.addEventListener('click', () => { console.log("Open Config"); window.showConfigAIModal(); });
    if (btnGuide) btnGuide.addEventListener('click', () => { console.log("Open Guide"); window.showAppGuide(); });
    if (btnStudy) btnStudy.addEventListener('click', () => { console.log("Open Study"); window.showAppTutorial(); });

    StorageManager.renderRecentProjects();

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

    // Load saved models on boot
    const isInfomaniak = (appState.aiProvider === 'infomaniak');
    const modelsStorageKey = isInfomaniak ? 'infomaniak_available_models' : 'gemini_available_models';
    const selectionStorageKey = isInfomaniak ? 'infomaniak_selected_model' : 'gemini_selected_model';
    const defaultModel = isInfomaniak ? 'google/gemma-4-31B-it' : 'gemini-2.0-flash';

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
});

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
        studyText = `${n.label}: ${n.content || n.desc}`;
        const isKG = appState.db.extractionMode === 'knowledge_graph';
        const nodePrefix = (isKG && n.level === 1) ? 'Hub' : 'Nodo';
        targetLabel = `${nodePrefix}: ${n.label}`;
    } else if (window.studyConfig.scope === 'branch' && window.studyConfig.target) {
        const root = window.studyConfig.target;
        const branchNodes = [root, ...window.getDescendants(root.id)];
        studyText = branchNodes.map(n => n.label + ": " + (n.content || n.desc)).join('\n');
        targetLabel = `Ramo: ${root.label}`;
    } else {
        studyText = appState.db.nodes.map(n => n.label + ": " + (n.content || n.desc)).join('\n');
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
        window.activeStudySessionItems = JSON.parse(cleanText);

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
                <p class="text-[10px] text-slate-400 italic" id="empty-scores-hint">Nessun punteggio registrato. Completa un quiz per iniziare!</p>
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
                textContent: txt
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
            vaultPath: appState.activeVaultPath
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

// Inizializza Costi al caricamento
setTimeout(() => { if (window.updateCostDisplay) window.updateCostDisplay(); }, 1000);

// Event listener per riga di lettura compensativa
window.addEventListener('mousemove', e => {
    document.documentElement.style.setProperty('--ruler-y', e.clientY + 'px');
});

let isHyphenated = false;
let originalModalHtml = "";

window.toggleHyphenation = function (btn) {
    const body = document.getElementById('source-modal-body');
    if (!body) return;

    btn.classList.toggle('bg-indigo-100');
    isHyphenated = !isHyphenated;

    if (isHyphenated) {
        body.classList.add('hyphens-auto-force');
        /* Sezione Hypher commentata per usare il motore nativo del Mac
        if (!originalModalHtml) originalModalHtml = body.innerHTML;
        
        if (window.Hypher && window.itPatterns) {
            const hyphenator = new window.Hypher(window.itPatterns);
            const walk = document.createTreeWalker(body, NodeFilter.SHOW_TEXT, null, false);
            let node;
            while(node = walk.nextNode()) {
                if (node.nodeValue.trim() !== '') {
                    node.nodeValue = hyphenator.hyphenateText(node.nodeValue);
                }
            }
        }
        */
    } else {
        body.classList.remove('hyphens-auto-force');
        if (originalModalHtml) {
            body.innerHTML = originalModalHtml;
            originalModalHtml = "";
        }
    }
};

window.toggleFloatingActions = function () {
    const menu = document.getElementById('floating-actions-menu');
    if (!menu) return;
    menu.classList.toggle('hidden');
    if (!menu.classList.contains('hidden')) {
        window.safeCreateIcons();
    }
};

// Close menu on click outside
document.addEventListener('click', (e) => {
    const container = document.getElementById('floating-actions-container');
    const menu = document.getElementById('floating-actions-menu');
    if (container && !container.contains(e.target) && menu && !menu.classList.contains('hidden')) {
        menu.classList.add('hidden');
    }
});

let currentLineHeightIdx = 0;
const lineHeights = [1.5, 2.0, 2.5];

window.cycleLineHeight = function () {
    currentLineHeightIdx = (currentLineHeightIdx + 1) % lineHeights.length;
    const lh = lineHeights[currentLineHeightIdx];
    const btn = document.getElementById('btn-line-height');
    if (btn) btn.innerHTML = `<i data-lucide="move-vertical" class="w-3 h-3"></i> INTERLINEA x${lh.toFixed(1)}`;

    // Applica a tutto il contenuto leggibile con forza !important
    const containers = document.querySelectorAll('.markdown-body, .note-text, #source-modal-body, .ai-result-content, .rich-desc');
    containers.forEach(c => {
        c.style.setProperty('line-height', lh, 'important');
        // Forza anche sui paragrafi e liste figli che potrebbero avere regole specifiche nel CSS
        const children = c.querySelectorAll('p, li, span, div');
        children.forEach(child => {
            child.style.setProperty('line-height', lh, 'important');
        });
    });
    window.safeCreateIcons();
};

let currentZoomIdx = localStorage.getItem('mappai-a11y-zoom') ? parseInt(localStorage.getItem('mappai-a11y-zoom')) : 0;
const zooms = [1.0, 1.5, 2.0];

window.cycleTextZoom = function () {
    window.applyTextZoom((currentZoomIdx + 1) % zooms.length);
};

window.applyTextZoom = function (idx) {
    currentZoomIdx = idx;
    localStorage.setItem('mappai-a11y-zoom', currentZoomIdx);
    const z = zooms[currentZoomIdx];

    const label = `Testo x${(z === 1.0 ? '1' : z)}`;
    const btnModal = document.getElementById('btn-text-zoom-modal');
    const btnPanel = document.getElementById('btn-text-zoom-panel');

    if (btnModal) btnModal.innerHTML = `<i data-lucide="zoom-in" class="w-6 h-6"></i>`;
    if (btnPanel) btnPanel.innerHTML = `<i data-lucide="zoom-in" class="w-4 h-4"></i> ${label}`;

    // Nella landing page, forza lo zoom a 1.0 per evitare corruzioni del layout
    const isLandingVisible = !document.getElementById('map-view')?.classList.contains('active');
    const effectiveZ = isLandingVisible ? 1.0 : z;

    // Imposta la variabile CSS per permettere l'anti-zoom sui bottoni
    document.documentElement.style.setProperty('--app-zoom', effectiveZ);

    if (effectiveZ > 1.0) {
        document.body.classList.add('a11y-zoomed-modals');
    } else {
        document.body.classList.remove('a11y-zoomed-modals');
    }

    document.body.classList.remove('a11y-zoom-x1', 'a11y-zoom-x15', 'a11y-zoom-x2');
    if (effectiveZ === 1.0) {
        document.body.classList.add('a11y-zoom-x1');
    } else if (effectiveZ === 1.5) {
        document.body.classList.add('a11y-zoom-x15');
    } else if (effectiveZ === 2.0) {
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
        '#study-config-modal > div',
        '#external-json-modal > div',
        '#vault-manager-box',
        '#edit-node-box',
        '#contextual-ai-extension-modal > div'
    ];

    // Applica inline style per bypassare bug di Safari su calc/CSS variables
    const sourceBody = document.getElementById('source-modal-body');
    const aiBody = document.getElementById('ai-modal-body');
    const flashcardFront = document.getElementById('flashcard-front-text');
    const flashcardBack = document.getElementById('flashcard-back-text');
    const quizQuestion = document.getElementById('study-quiz-question');
    const quizOptions = document.querySelectorAll('#study-quiz-options .quiz-option');

    if (sourceBody) {
        if (effectiveZ === 1.0) sourceBody.style.removeProperty('font-size');
        else sourceBody.style.setProperty('font-size', `${effectiveZ * 16}px`, 'important');
    }
    if (aiBody) {
        if (effectiveZ === 1.0) aiBody.style.removeProperty('font-size');
        else aiBody.style.setProperty('font-size', `${effectiveZ * 16}px`, 'important');
    }
    if (flashcardFront) {
        if (effectiveZ === 1.0) flashcardFront.style.removeProperty('font-size');
        else flashcardFront.style.setProperty('font-size', `${effectiveZ * 24}px`, 'important');
    }
    if (flashcardBack) {
        if (effectiveZ === 1.0) flashcardBack.style.removeProperty('font-size');
        else flashcardBack.style.setProperty('font-size', `${effectiveZ * 18}px`, 'important');
    }
    if (quizQuestion) {
        if (effectiveZ === 1.0) quizQuestion.style.removeProperty('font-size');
        else quizQuestion.style.setProperty('font-size', `${effectiveZ * 20}px`, 'important');
    }
    quizOptions.forEach(opt => {
        if (effectiveZ === 1.0) opt.style.removeProperty('font-size');
        else opt.style.setProperty('font-size', `${effectiveZ * 13}px`, 'important');
    });

    // Ripristina root font size se era stato modificato
    document.documentElement.style.fontSize = '';

    // Forza reflow su iOS Safari per aggiornare le variabili CSS nei fogli di stile
    document.documentElement.classList.toggle('force-reflow');
    const _reflow = document.documentElement.offsetHeight;

    window.safeCreateIcons();
};

window.resetA11yTools = function () {
    currentLineHeightIdx = 0;
    currentZoomIdx = 0;
    const btnLh = document.getElementById('btn-line-height');
    const btnZModal = document.getElementById('btn-text-zoom-modal');
    const btnZPanel = document.getElementById('btn-text-zoom-panel');

    if (btnLh) btnLh.innerHTML = `<i data-lucide="move-vertical" class="w-3 h-3"></i> INTERLINEA x1.5`;
    if (btnZModal) btnZModal.innerHTML = `<i data-lucide="zoom-in" class="w-6 h-6"></i>`;
    if (btnZPanel) btnZPanel.innerHTML = `<i data-lucide="zoom-in" class="w-4 h-4"></i> Testo x1`;

    document.documentElement.style.setProperty('--app-zoom', 1);
    document.body.classList.remove('a11y-zoom-x1', 'a11y-zoom-x15', 'a11y-zoom-x2', 'a11y-zoomed-modals');
    document.body.classList.add('a11y-zoom-x1');

    const mainCard = document.querySelector('.glass-card.max-w-3xl');
    const body = document.getElementById('source-modal-body');
    const aiBody = document.getElementById('ai-modal-body');
    const flashcardFront = document.getElementById('flashcard-front-text');
    const flashcardBack = document.getElementById('flashcard-back-text');
    const quizQuestion = document.getElementById('study-quiz-question');
    const quizOptions = document.querySelectorAll('#study-quiz-options .quiz-option');

    if (mainCard) {
        mainCard.style.transform = '';
        mainCard.style.transformOrigin = '';
        mainCard.style.zoom = '';
    }
    if (body) {
        body.style.lineHeight = '';
        body.style.zoom = '';
        body.style.removeProperty('font-size');
    }
    if (aiBody) {
        aiBody.style.removeProperty('font-size');
    }
    if (flashcardFront) flashcardFront.style.removeProperty('font-size');
    if (flashcardBack) flashcardBack.style.removeProperty('font-size');
    if (quizQuestion) quizQuestion.style.removeProperty('font-size');
    quizOptions.forEach(opt => {
        opt.style.removeProperty('font-size');
    });
    document.documentElement.style.fontSize = '';
};

// Rimozione logica traduzioni (Ripristino Italiano)
window.changeAppLanguage = null;
window.applyAppTranslations = null;

// === SEARCH FINDER LOGIC ===
appState.searchQuery = "";

window.highlightQuery = function (text, query) {
    if (!query || !text) return text;
    try {
        const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`(${escapedQuery})`, "gi");
        return String(text).replace(regex, `<mark class="bg-black text-white px-1 rounded font-bold">$1</mark>`);
    } catch (e) { return text; }
};

window.performSearch = function (query) {
    appState.searchQuery = (query || "").toLowerCase().trim();
    const q = appState.searchQuery;

    if (typeof d3 === 'undefined') return;
    const svgSelection = d3.select("#map-svg");
    if (svgSelection.empty() || !appState.db || !appState.db.nodes || appState.db.nodes.length === 0) return;

    const clearBtn = document.getElementById('map-finder-clear');

    if (!q) {
        svgSelection.selectAll('.node-group').style('opacity', 1).classed('search-dimmed', false);
        svgSelection.selectAll('.link-group').style('opacity', window.currentGraphLayout === 'orbit' ? 0.3 : 0.6).classed('search-dimmed', false);
        if (clearBtn) clearBtn.classList.add('hidden');
    } else {
        if (clearBtn) clearBtn.classList.remove('hidden');

        const matchedNodeIds = new Set();
        appState.db.nodes.forEach(n => {
            let textToSearch = (n.label || "") + " " + (n.desc || "") + " " + (n.content || "");
            const inheritedNotes = window.getInheritedDatabase ? window.getInheritedDatabase(n.id) : [];
            inheritedNotes.forEach(db => {
                textToSearch += " " + (db.text || "") + " " + (db.title || "") + " " + (db.source || "");
            });
            if (textToSearch.toLowerCase().includes(q)) {
                matchedNodeIds.add(n.id);
            }
        });

        svgSelection.selectAll('.node-group')
            .style('opacity', d => matchedNodeIds.has(d.id) ? 1 : 0.1)
            .classed('search-dimmed', d => !matchedNodeIds.has(d.id));

        svgSelection.selectAll('.link-group')
            .style('opacity', d => {
                let sid = typeof d.source === 'object' ? d.source.id : d.source;
                let tid = typeof d.target === 'object' ? d.target.id : d.target;
                return (matchedNodeIds.has(sid) && matchedNodeIds.has(tid)) ? (window.currentGraphLayout === 'orbit' ? 0.3 : 0.6) : 0.05;
            })
            .classed('search-dimmed', d => {
                let sid = typeof d.source === 'object' ? d.source.id : d.source;
                let tid = typeof d.target === 'object' ? d.target.id : d.target;
                return !(matchedNodeIds.has(sid) && matchedNodeIds.has(tid));
            });
    }
};

window.performSuperSearch = function (query) {
    const q = (query || "").toLowerCase().trim();
    const resultsContainer = document.getElementById('super-finder-results');
    const clearBtn = document.getElementById('super-finder-clear');

    if (!q) {
        if (clearBtn) clearBtn.classList.add('hidden');
        resultsContainer.innerHTML = `
                    <div class="flex flex-col items-center justify-center py-20 text-slate-300">
                        <i data-lucide="search" class="w-10 h-10 mb-2 opacity-20"></i>
                        <p class="text-xs font-bold uppercase tracking-widest opacity-50">Inizia a digitare...</p>
                    </div>
                `;
        window.performSearch(''); // Reset map dimming
        window.safeCreateIcons();
        return;
    }

    if (clearBtn) clearBtn.classList.remove('hidden');
    window.performSearch(q); // Filter map too

    // Mappatura Macro-Aree (Antenati di Livello 1)
    const getMacroArea = (nodeId) => {
        let current = appState.db.nodes.find(n => n.id === nodeId);
        if (!current) return "Generale";
        if (current.level <= 1) return current.label;

        let depth = 0;
        while (current && current.level > 1 && depth < 30) {
            const link = appState.db.links.find(l => {
                const tid = typeof l.target === 'object' ? l.target.id : l.target;
                return tid === current.id;
            });
            if (link) {
                const sid = typeof l.source === 'object' ? l.source.id : l.source;
                current = appState.db.nodes.find(n => n.id === sid);
            } else {
                break;
            }
            depth++;
        }
        return current ? current.label : "Generale";
    };

    const macroGroups = {}; // Gruppi per Macro-Area

    appState.db.nodes.forEach(n => {
        const macro = getMacroArea(n.id);
        if (!macroGroups[macro]) macroGroups[macro] = [];

        // Check label
        if (n.label && n.label.toLowerCase().includes(q)) {
            macroGroups[macro].push({ id: n.id, text: n.label, type: 'label', node: n });
        }
        // Check desc/content
        const contentText = (n.content || "") + " " + (n.desc || "");
        if (contentText.toLowerCase().includes(q)) {
            macroGroups[macro].push({ id: n.id, text: contentText, type: 'content', node: n });
        }
        // Check inherited notes
        const notes = window.getInheritedDatabase ? window.getInheritedDatabase(n.id) : [];
        notes.forEach(db => {
            const noteText = (db.text || "") + " " + (db.title || "") + " " + (db.source || "");
            if (noteText.toLowerCase().includes(q)) {
                macroGroups[macro].push({ id: n.id, text: db.text, title: db.title, source: db.source, type: 'note', node: n });
            }
        });
    });

    let html = "";
    const sortedMacros = Object.keys(macroGroups).sort();

    for (const macroName of sortedMacros) {
        const items = macroGroups[macroName];
        if (items.length === 0) continue;

        html += `<div class="mb-6">
                    <h4 class="px-4 py-2 text-[10px] font-extrabold text-indigo-700 uppercase tracking-widest bg-indigo-50/50 border-y border-indigo-100 mb-2 flex items-center gap-2">
                        <i data-lucide="layers" class="w-3 h-3"></i> ${macroName} (${items.length})
                    </h4>
                    <div class="space-y-1 px-1">`;

        items.forEach(item => {
            let preview = item.text;
            const isNote = item.type === 'note';
            const icon = isNote ? 'library' : (item.type === 'label' ? 'tag' : 'align-left');

            if (item.type === 'content' || item.type === 'note') {
                const idx = preview.toLowerCase().indexOf(q);
                const start = Math.max(0, idx - 40);
                const end = Math.min(preview.length, idx + 60);
                preview = (start > 0 ? "..." : "") + preview.substring(start, end) + (end < preview.length ? "..." : "");
            }

            const highlighted = window.highlightQuery(preview, q);
            const label = cleanLabel(item.node.label);

            html += `
                        <div class="group p-3 hover:bg-slate-50 rounded-xl cursor-pointer transition-all border border-transparent hover:border-slate-200" onclick="window.handleNodeClick({stopPropagation:()=>{}}, appState.db.nodes.find(n=>n.id==='${item.id}')); window.openSourceModal('${item.id}')">
                            <div class="flex items-center justify-between mb-1">
                                <div class="flex items-center gap-2">
                                    <i data-lucide="${icon}" class="w-3 h-3 text-slate-400"></i>
                                    <span class="text-[11px] font-bold text-slate-800 tracking-tight">${label}</span>
                                </div>
                                <span class="text-[9px] text-slate-400 font-mono">${item.type.toUpperCase()}</span>
                            </div>
                            <p class="text-[10px] text-slate-500 leading-relaxed italic line-clamp-2">"${highlighted}"</p>
                        </div>
                    `;
        });

        html += `</div></div>`;
    }

    if (html === "") {
        html = `
                    <div class="flex flex-col items-center justify-center py-20 text-slate-300">
                        <i data-lucide="alert-circle" class="w-10 h-10 mb-2 opacity-20"></i>
                        <p class="text-xs font-bold uppercase tracking-widest opacity-50">Nessun risultato trovato</p>
                    </div>
                `;
    }

    resultsContainer.innerHTML = html;
    window.safeCreateIcons();
};

window.clearSuperFinder = function () {
    const input = document.getElementById('super-finder-input');
    if (input) input.value = '';
    window.performSuperSearch('');
};

// Rimosso vecchio event listener map-finder-input che ora è nel nuovo tab
const oldFinder = document.getElementById('map-finder-input');
if (oldFinder) oldFinder.remove();

// === CANVAS VUOTO & ESPANSIONE CONTESTUALE ===
window.createBlankCanvas = function () {
    const mode = document.getElementById('extraction-mode').value;
    appState.extractionMode = mode;
    appState.db = { nodes: [], links: [] };

    if (mode === 'mindmap') {
        appState.db.nodes.push({
            id: "ROOT",
            label: "Nuovo Argomento",
            content: "Inizia a scrivere...",
            desc: "Inizia a scrivere...",
            level: 0,
            x: window.innerWidth / 2,
            y: window.innerHeight / 2,
            studyStatus: 'none',
            chunks: []
        });
    }

    appState.rootNodeLabel = "Mappa Manuale";
    window.switchToMapLayout();

    simulation = null;
    initD3Visualization();
    window.updateDegreeStats();
    window.renderTreeView();
    window.safeCreateIcons();
};

let contextualAITargetNode = null;

window.openContextualAIExtensionModal = function (nodeData) {
    contextualAITargetNode = nodeData;
    document.getElementById('contextual-ai-node-title').textContent = cleanLabel(nodeData.label);
    document.getElementById('contextual-ai-input').value = '';
    document.getElementById('ctx-pdf-status').classList.add('hidden');
    document.getElementById('ctx-pdf-file').value = '';
    window.ctxExpansionPDFFile = null;
    window.switchCtxTab('text');

    const modal = document.getElementById('contextual-ai-extension-modal');
    modal.classList.remove('hidden');
    setTimeout(() => {
        modal.classList.remove('opacity-0');
        modal.querySelector('div').classList.remove('scale-95');
    }, 10);
};

window.executeContextualAIExtension = async function () {
    let sourceContent = "";
    if (window.ctxExpansionSourceType === 'pdf') {
        if (!window.ctxExpansionPDFFile) {
            window.showAlert("Errore", "Seleziona prima un file PDF.");
            return;
        }
        window.showLoadingOverlay(true, "Estrazione testo dal PDF in corso...");
        try {
            sourceContent = await window.extractTextFromPDF(window.ctxExpansionPDFFile);
            if (!sourceContent) throw new Error("Testo estratto vuoto.");
        } catch (e) {
            window.showLoadingOverlay(false);
            window.showAlert("Errore PDF", "Impossibile leggere il PDF: " + e.message);
            return;
        }
    } else {
        sourceContent = document.getElementById('contextual-ai-input').value.trim();
    }

    if (!sourceContent) {
        window.showAlert("Errore", "Inserisci del testo, un URL o carica un PDF per l'espansione.");
        return;
    }
    if (!contextualAITargetNode) return;

    const apiKey = window.getSystemKey();
    if (!apiKey) {
        window.showAlert("Errore", "Inserisci la API Key di Google Gemini nelle impostazioni.");
        return;
    }

    window.closeContextualAIModal();
    window.showLoadingOverlay(true, "MappAI sta leggendo e iniettando i nuovi concetti...");

    try {

        const existingLabels = appState.db.nodes.map(n => n.label.toLowerCase().trim());
        const promptKey = appState.studentMode ? "SOTA_SECOND_BRAIN_STUDENT" : "SOTA_SECOND_BRAIN";

        const promptText = window.fillPromptTemplate(promptKey, {
            targetId: contextualAITargetNode.id,
            targetLabel: contextualAITargetNode.label,
            existingLabels: existingLabels.join(', '),
            sourceContent: sourceContent,
            targetLevel: contextualAITargetNode.level + 1,
            targetGroup: contextualAITargetNode.group || 0
        });

        const response = await window.fetchModelAPI({
            contents: [{ parts: [{ text: promptText }] }],
            systemInstruction: { parts: [{ text: appState.extractionMode === 'mindmap' ? MIND_MAP_SYSTEM_INSTRUCTION : KNOWLEDGE_GRAPH_SYSTEM_INSTRUCTION }] },
            generationConfig: { temperature: 0.3, responseMimeType: "application/json" }
        }, apiKey);

        let jsonText = response?.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
        jsonText = jsonText.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
        const newData = JSON.parse(jsonText);

        if (!newData.nodes || newData.nodes.length === 0) {
            window.showLoadingOverlay(false);
            window.showToast("Nessun nuovo concetto trovato nel materiale.", "info");
            return;
        }

        const idMap = {};
        newData.nodes.forEach(n => {
            // Smart Merging (Fusione Semantica)
            const existing = appState.db.nodes.find(old =>
                old.label && n.label &&
                old.label.toLowerCase().trim() === n.label.toLowerCase().trim()
            );

            if (existing) {
                idMap[n.id] = existing.id;
                // Inietta il contenuto del nuovo nodo nel vecchio
                if (n.desc || n.content) {
                    existing.chunks = existing.chunks || [];
                    const newChunk = n.desc || n.content;
                    if (!existing.chunks.includes(newChunk)) {
                        existing.chunks.push(newChunk);
                    }
                }
            } else {
                // Nuovo nodo
                idMap[n.id] = n.id;
                n.chunks = [n.desc || "Espansione IA"];
                n.studyStatus = 'none';
                n.x = contextualAITargetNode.x + (Math.random() * 200 - 100);
                n.y = contextualAITargetNode.y + (Math.random() * 200 - 100);
                appState.db.nodes.push(n);
            }
        });

        newData.links.forEach(l => {
            l.source = idMap[l.source] || l.source;
            l.target = idMap[l.target] || l.target;

            // Evita link duplicati
            const linkExists = appState.db.links.some(old => {
                const s1 = typeof old.source === 'object' ? old.source.id : old.source;
                const t1 = typeof old.target === 'object' ? old.target.id : old.target;
                return (s1 === l.source && t1 === l.target) || (s1 === l.target && t1 === l.source);
            });
            if (!linkExists) appState.db.links.push(l);
        });

        window.showLoadingOverlay(false);
        window.showToast(`Espansione completata: aggiunti ${newData.nodes.length} nuovi nodi.`, "success");

        simulation = null;
        initD3Visualization();
        window.updateDegreeStats();
        window.renderTreeView();

    } catch (err) {
        window.showLoadingOverlay(false);
        window.showAlert("Errore IA", "L'elaborazione ha fallito: " + err.message);
    }
};

window.switchCtxTab = function (tab) {
    const btnText = document.getElementById('tab-ctx-text');
    const btnPdf = document.getElementById('tab-ctx-pdf');
    const panelText = document.getElementById('ctx-panel-text');
    const panelPdf = document.getElementById('ctx-panel-pdf');

    if (tab === 'text') {
        btnText.classList.add('bg-white', 'shadow-sm', 'text-indigo-600');
        btnText.classList.remove('text-slate-500');
        btnPdf.classList.remove('bg-white', 'shadow-sm', 'text-indigo-600');
        btnPdf.classList.add('text-slate-500');
        panelText.classList.remove('hidden');
        panelPdf.classList.add('hidden');
        window.ctxExpansionSourceType = 'text';
    } else {
        btnPdf.classList.add('bg-white', 'shadow-sm', 'text-indigo-600');
        btnPdf.classList.remove('text-slate-500');
        btnText.classList.remove('bg-white', 'shadow-sm', 'text-indigo-600');
        btnText.classList.add('text-slate-500');
        panelPdf.classList.remove('hidden');
        panelText.classList.add('hidden');
        window.ctxExpansionSourceType = 'pdf';
    }
    window.safeCreateIcons();
};

window.handleCtxPDFSelect = function (input) {
    const file = input.files[0];
    if (!file) return;
    const status = document.getElementById('ctx-pdf-status');
    status.textContent = `File pronto: ${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB)`;
    status.classList.remove('hidden');
    window.ctxExpansionPDFFile = file;
};

window.closeContextualAIModal = function () {
    const modal = document.getElementById('contextual-ai-extension-modal');
    if (!modal) return;
    modal.classList.add('opacity-0');
    modal.querySelector('div').classList.add('scale-95');
    setTimeout(() => modal.classList.add('hidden'), 300);
};

window.ctxExpansionSourceType = 'text';
window.ctxExpansionPDFFile = null;

/* ==========================================
   USER PROFILE & VAULT MANAGER (SOTA)
   ========================================== */

window.updateProfilesDropdown = function () {
    const select = document.getElementById('up-saved-profiles');
    if (!select) return;

    // Keep the first "+ Nuovo Profilo" option
    select.innerHTML = '<option value="">+ Nuovo Profilo</option>';

    appState.allProfiles.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.nickname;
        opt.text = `${p.nickname} (${p.grade || 'Senza classe'})`;
        select.appendChild(opt);
    });

    // Select the current one if it exists
    if (appState.userProfile && appState.userProfile.nickname) {
        select.value = appState.userProfile.nickname;
    } else {
        select.value = "";
    }
};

window.loadSelectedProfile = function () {
    const select = document.getElementById('up-saved-profiles');
    const selectedNickname = select.value;

    if (!selectedNickname) {
        // Clear fields for a new profile
        appState.userProfile = { nickname: "", age: "", grade: "", system: "Ticino" };
        document.getElementById('up-nickname').value = "";
        document.getElementById('up-age').value = "";
        document.getElementById('up-system').value = "Ticino";
        window.updateGradeOptions();
        document.getElementById('up-grade').value = "";
        return;
    }

    const profile = appState.allProfiles.find(p => p.nickname === selectedNickname);
    if (profile) {
        appState.userProfile = { ...profile };
        document.getElementById('up-nickname').value = profile.nickname || "";
        document.getElementById('up-age').value = profile.age || "";
        document.getElementById('up-system').value = profile.system || "Ticino";
        window.updateGradeOptions();
        if (profile.grade) {
            document.getElementById('up-grade').value = profile.grade;
        }
    }
};

window.updateGradeOptions = function () {
    const systemSelect = document.getElementById('up-system');
    const gradeSelect = document.getElementById('up-grade');
    const currentVal = gradeSelect.value;
    const system = systemSelect.value;

    gradeSelect.innerHTML = '';

    // Add default empty option
    const emptyOpt = document.createElement('option');
    emptyOpt.value = "";
    emptyOpt.text = "Classe...";
    gradeSelect.appendChild(emptyOpt);

    if (system === 'Liceo_Ticino') {
        for (let i = 1; i <= 4; i++) {
            const opt = document.createElement('option');
            const val = `${i}° Anno Liceo`;
            opt.value = val;
            opt.text = val;
            gradeSelect.appendChild(opt);
        }
    } else if (system === 'Liceo_Italia') {
        for (let i = 1; i <= 5; i++) {
            const opt = document.createElement('option');
            const val = `${i}° Anno Superiore`;
            opt.value = val;
            opt.text = val;
            gradeSelect.appendChild(opt);
        }
    } else {
        const maxGrade = system === 'Ticino' ? 4 : 3;
        for (let i = 1; i <= maxGrade; i++) {
            const opt = document.createElement('option');
            const val = `${i}a Media`;
            opt.value = val;
            opt.text = val;
            gradeSelect.appendChild(opt);
        }
    }

    // Restore previous value if it's still valid
    if (currentVal && Array.from(gradeSelect.options).some(o => o.value === currentVal)) {
        gradeSelect.value = currentVal;
    }
};

window.showUserProfileModal = function () {
    const modal = document.getElementById('user-profile-modal');
    const box = document.getElementById('user-profile-box');

    window.updateProfilesDropdown();

    // Fill fields
    document.getElementById('up-nickname').value = appState.userProfile.nickname || "";
    document.getElementById('up-age').value = appState.userProfile.age || "";
    document.getElementById('up-system').value = appState.userProfile.system || "Ticino";

    // Update grade options based on system, then set value
    window.updateGradeOptions();
    if (appState.userProfile.grade) {
        document.getElementById('up-grade').value = appState.userProfile.grade;
    }

    modal.style.display = '';
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    setTimeout(() => {
        modal.classList.remove('opacity-0');
        box.classList.remove('scale-95');
    }, 10);
    window.safeCreateIcons();
};

window.closeUserProfileModal = function () {
    const modal = document.getElementById('user-profile-modal');
    const box = document.getElementById('user-profile-box');
    modal.classList.add('opacity-0');
    box.classList.add('scale-95');
    setTimeout(() => {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }, 200);
};

window.saveUserProfile = function () {
    const nickname = document.getElementById('up-nickname').value.trim();
    if (!nickname) {
        window.showToast("Il nickname è obbligatorio", "error");
        return;
    }

    appState.userProfile.nickname = nickname;
    appState.userProfile.age = document.getElementById('up-age').value.trim();
    appState.userProfile.grade = document.getElementById('up-grade').value;
    appState.userProfile.system = document.getElementById('up-system').value;

    // Update or add to allProfiles
    const existingIndex = appState.allProfiles.findIndex(p => p.nickname.toLowerCase() === nickname.toLowerCase());
    if (existingIndex >= 0) {
        appState.allProfiles[existingIndex] = { ...appState.userProfile };
    } else {
        appState.allProfiles.push({ ...appState.userProfile });
    }

    localStorage.setItem('mappai_user_profile', JSON.stringify(appState.userProfile));
    localStorage.setItem('mappai_all_profiles', JSON.stringify(appState.allProfiles));

    window.showToast("Profilo salvato correttamente!", "success");
    window.closeUserProfileModal();
};

window.resetUserProfile = function () {
    const currentNickname = appState.userProfile.nickname;
    if (!currentNickname) {
        window.showToast("Nessun profilo selezionato da eliminare.", "error");
        return;
    }

    window.showPrompt("Verifica Reset", "", (val) => {
        if (val.toLowerCase().trim() === "elimina") {
            // Remove from allProfiles
            appState.allProfiles = appState.allProfiles.filter(p => p.nickname !== currentNickname);
            localStorage.setItem('mappai_all_profiles', JSON.stringify(appState.allProfiles));

            // Clear current profile
            appState.userProfile = { nickname: "", age: "", grade: "", system: "Ticino" };
            localStorage.removeItem('mappai_user_profile');

            window.showToast("Profilo eliminato.", "success");
            window.closeUserProfileModal();
        } else {
            window.showToast("Stringa errata. Reset annullato.");
        }
    }, "Scrivi 'elimina' per confermare la cancellazione di " + currentNickname + ":");
};

// Vault Manager
window.showVaultManager = async function () {
    const modal = document.getElementById('vault-manager-modal');
    const box = document.getElementById('vault-manager-box');

    modal.classList.remove('hidden');
    modal.classList.add('flex');
    setTimeout(() => {
        modal.classList.remove('opacity-0');
        box.classList.remove('scale-95');
    }, 10);
    window.safeCreateIcons();

    await window.loadVaultList();
};

window.closeVaultManager = function () {
    const modal = document.getElementById('vault-manager-modal');
    const box = document.getElementById('vault-manager-box');
    modal.classList.add('opacity-0');
    box.classList.add('scale-95');
    setTimeout(() => {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }, 200);
};

window.loadVaultList = async function () {
    const container = document.getElementById('vault-list-container');
    container.innerHTML = '<div class="flex items-center justify-center p-20 text-slate-300"><i data-lucide="loader-2" class="w-8 h-8 animate-spin"></i></div>';
    window.safeCreateIcons();

    try {
        const vaults = await window.electronAPI.getAllVaults();
        container.innerHTML = "";

        if (!vaults || vaults.length === 0) {
            container.innerHTML = `<div class="text-center p-10 text-slate-400 font-bold uppercase tracking-widest text-xs">${window.getTranslation('empty_projects_msg')}</div>`;
            return;
        }

        vaults.forEach(v => {
            const card = document.createElement('div');
            card.className = "bg-white border border-slate-100 p-4 rounded-2xl hover:border-indigo-200 hover:bg-indigo-50/30 transition-all cursor-pointer group shadow-sm flex justify-between items-center";

            let userBadge = "";
            if (v.nickname) {
                userBadge = `<span class="bg-indigo-100 text-indigo-600 px-2 py-0.5 rounded text-[9px] font-black uppercase">${v.nickname} (${v.age || '?'})</span>`;
            }

            card.innerHTML = `
                <div class="flex items-center gap-4">
                    <div class="w-10 h-10 rounded-xl bg-slate-50 text-slate-400 flex items-center justify-center group-hover:bg-indigo-100 group-hover:text-indigo-600 transition-all">
                        <i data-lucide="folder" class="w-5 h-5"></i>
                    </div>
                    <div>
                        <div class="flex items-center gap-2">
                            <span class="font-black text-slate-800 text-sm leading-none">${v.rootNodeLabel || v.folderName}</span>
                            ${userBadge}
                        </div>
                        <span class="block text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-1">${v.folderName} • ${new Date(v.lastUpdated).toLocaleDateString()}</span>
                    </div>
                </div>
                <i data-lucide="chevron-right" class="w-5 h-5 text-slate-300 group-hover:text-indigo-500 transition-all"></i>
            `;

            card.onclick = () => {
                window.closeVaultManager();
                window.directLoadVault(v.fullPath);
            };
            container.appendChild(card);
        });
        window.safeCreateIcons();
    } catch (err) {
        container.innerHTML = `<div class="text-red-500 p-4 text-center text-xs">Errore nel caricamento: ${err.message}</div>`;
    }
};

window.directLoadVault = async function (folderPath) {
    window.showLoadingOverlay(true, "Caricamento Vault...");
    try {
        const loadRes = await window.electronAPI.loadVault(folderPath);
        window.showLoadingOverlay(false);
        if (loadRes.success) {
            appState.activeVaultPath = folderPath;
            appState.extractionMode = loadRes.data.extractionMode || "mindmap";
            appState.rootNodeLabel = folderPath.split('/').pop().replace(/_/g, ' ') || "Mappa Esempio";

            let nodesList = loadRes.data.nodes || [];
            let linksList = loadRes.data.links || [];

            const rootNode = nodesList.find(n => n.level === 0);
            if (rootNode) {
                rootNode.label = appState.rootNodeLabel;
            }

            if (nodesList.length === 0) {
                const rootId = "node_" + Math.random().toString(36).substr(2, 9);
                nodesList = [{
                    id: rootId,
                    label: appState.rootNodeLabel,
                    level: 0,
                    group: 0,
                    x: 640,
                    y: 400,
                    fx: 640,
                    fy: 400
                }];
                linksList = [];
                // Salva immediatamente il vault con il nodo radice di default per creare i file fisici
                window.electronAPI.saveVault({
                    folderPath: folderPath,
                    mapData: {
                        extractionMode: appState.extractionMode,
                        rootNodeLabel: appState.rootNodeLabel,
                        nodes: nodesList,
                        links: linksList,
                        customColors: {}
                    }
                });
            }

            appState.db = {
                nodes: nodesList,
                links: linksList,
                studySets: loadRes.data.studySets || [],
                sourcesDict: {}
            };

            if (window.renderStudySets) window.renderStudySets();

            if (loadRes.data.userProfile) {
                appState.userProfile = loadRes.data.userProfile;
            }

            // Ripristina lo stato delle chat se presente
            if (loadRes.data.tutorState) {
                tutorState = loadRes.data.tutorState;
            }

            // Ripristina AI Provider e Modello se presenti
            if (loadRes.data.aiProvider) {
                appState.aiProvider = loadRes.data.aiProvider;
                localStorage.setItem('ai_provider', appState.aiProvider);
                if (window.switchAIProvider) window.switchAIProvider(appState.aiProvider);
            }
            if (loadRes.data.aiModel) {
                const storageKey = (appState.aiProvider === 'infomaniak') ? 'infomaniak_selected_model' : 'gemini_selected_model';
                localStorage.setItem(storageKey, loadRes.data.aiModel);
            }
            if (loadRes.data.generationUsage) {
                appState.generationUsage = loadRes.data.generationUsage;
                if (window.updateCostDisplay) window.updateCostDisplay();
            }
            // Forza il refresh dei modelli per popolare la tendina e selezionare quello corretto
            if (window.refreshGeminiModels) window.refreshGeminiModels();

            // Ricostruisci sourcesDict
            appState.db.nodes.forEach(n => {
                if (n.chunks && n.chunks.length > 0) {
                    appState.db.sourcesDict[n.id] = n.chunks.map(c => ({
                        title: c.title || "Fonte",
                        source: c.source || "Documento",
                        text: c.text || c
                    }));
                }
            });

            if (loadRes.data.customColors) {
                appState.db.customColors = loadRes.data.customColors;
            }

            window.switchToMapLayout();

            // Mostra tasto Sincronizza Vault
            const syncBtn = document.getElementById('sync-vault-btn');
            if (syncBtn) {
                syncBtn.classList.remove('hidden');
                syncBtn.classList.add('flex');
            }

            setTimeout(() => { initD3Visualization(); }, 200);
            window.showToast("Vault caricato con successo!", "success");
        } else {
            window.showAlert("Errore Caricamento", loadRes.error);
        }
    } catch (e) {
        window.showLoadingOverlay(false);
        window.showAlert("Errore", e.message);
    }
};

window.resetVaultState = function () {
    appState.activeVaultPath = null;
    const syncBtn = document.getElementById('sync-vault-btn');
    if (syncBtn) {
        syncBtn.classList.add('hidden');
        syncBtn.classList.remove('flex');
    }
};

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

