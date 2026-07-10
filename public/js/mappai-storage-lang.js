// ==========================================
// STORAGE MANAGER, PROGETTI SALVATI & LINGUA — estratto da app.js
// ==========================================
// const StorageManager (autosave localStorage + saveMapJSON via Electron),
// barra progetti salvati, loadSavedProject, changeLanguage + init lingua
// (DOMContentLoaded). Timer/listener registrati al load: comportamento identico
// (gli script sincroni girano tutti prima di DOMContentLoaded/timers).
// ==========================================
// STORAGE MANAGER
// ==========================================
const StorageManager = {
    currentProjectId: null,
    saveCurrentProject: function () {
        // GUARDIA Studio attivo: durante una sessione la mappa sul canvas è
        // volutamente smontata dall'esercizio (link rimossi, livelli/label
        // alterati). Persisterla renderebbe DEFINITIVO lo stato dell'esercizio:
        // gerarchia irrecuperabile al reload (lo snapshot vive solo in memoria).
        // exit()/emergencyExit() ripristinano la mappa e il salvataggio riprende.
        if (window.ActiveStudy && window.ActiveStudy.session && window.ActiveStudy.session.active) return;
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
            type: appState.extractionMode || 'mindmap',
            // Nome della cartella vault collegata (null = progetto solo-localStorage):
            // usato da renderRecentProjects per nascondere i progetti il cui vault è stato eliminato
            vault: appState.activeVaultPath
                ? (String(appState.activeVaultPath).split(/[\\/]/).filter(Boolean).pop() || null)
                : null
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

    // Cache dei nomi di cartelle vault che effettivamente esistono.
    // null = non ancora verificato (o verifica fallita) → nessun filtro in render.
    validVaultFolders: null,

    // Verifica quali vault EFFETTIVAMENTE ESISTONO nel file system
    // (senza toccare localStorage, il quale rimane integro)
    syncValidVaults: async function () {
        try {
            if (!window.electronAPI || !window.electronAPI.getValidVaultFolders) return;
            this.validVaultFolders = await window.electronAPI.getValidVaultFolders();
            this._migrateProjectVaultNames();
        } catch (e) {
            console.warn("[StorageManager] Errore syncValidVaults:", e);
            this.validVaultFolders = null;
        }
    },

    // Una tantum: arricchisce le voci legacy di tutor_ai_projects con p.vault
    // (nome cartella vault) estratto dallo snapshot salvato — così render non
    // deve mai riparsare gli snapshot (possono pesare MB).
    _migrateProjectVaultNames: function () {
        try {
            const projects = JSON.parse(localStorage.getItem('tutor_ai_projects') || "[]");
            let changed = false;
            projects.forEach(p => {
                if (p.vault !== undefined) return;
                let vault = null;
                try {
                    const snap = JSON.parse(localStorage.getItem(p.id) || 'null');
                    if (snap && snap.activeVaultPath) {
                        vault = String(snap.activeVaultPath).split(/[\\/]/).filter(Boolean).pop() || null;
                    }
                } catch (e) { /* snapshot corrotto → niente filtro per questa voce */ }
                p.vault = vault;
                changed = true;
            });
            if (changed) localStorage.setItem('tutor_ai_projects', JSON.stringify(projects));
        } catch (e) {
            console.warn("[StorageManager] Errore migrazione vault names:", e);
        }
    },

    // Elimina DEFINITIVAMENTE da localStorage i progetti il cui vault non esiste più
    // (voce in tutor_ai_projects + snapshot appState — libera quota localStorage).
    // Da console: StorageManager.purgeStaleProjects()
    purgeStaleProjects: async function () {
        await this.syncValidVaults();
        if (!Array.isArray(this.validVaultFolders)) {
            console.warn('[StorageManager] Vault non verificabili — nessuna pulizia eseguita.');
            return 0;
        }
        let projects = JSON.parse(localStorage.getItem('tutor_ai_projects') || "[]");
        const stale = projects.filter(p => p.vault && !this.validVaultFolders.includes(p.vault));
        stale.forEach(p => localStorage.removeItem(p.id));
        projects = projects.filter(p => !stale.includes(p));
        localStorage.setItem('tutor_ai_projects', JSON.stringify(projects));
        this.renderRecentProjects();
        console.log('[StorageManager] Rimossi ' + stale.length + ' progetti stale:', stale.map(p => p.name));
        return stale.length;
    },

    renderRecentProjects: function () {
        const container = document.getElementById('recent-projects-container');
        if (!container) return;

        // Rotella del mouse → scorrimento orizzontale (bind una sola volta)
        if (!container._hScrollBound) {
            container._hScrollBound = true;
            container.addEventListener('wheel', function (e) {
                if (!e.deltaY) return;
                if (container.scrollWidth <= container.clientWidth) return; // niente overflow → lascia lo scroll verticale
                e.preventDefault();
                container.scrollLeft += e.deltaY;
            }, { passive: false });
        }

        try {
            let projects = JSON.parse(localStorage.getItem('tutor_ai_projects') || "[]");

            // Nasconde i progetti il cui vault è stato eliminato dal file system.
            // localStorage resta integro: per pulire davvero → StorageManager.purgeStaleProjects()
            if (Array.isArray(this.validVaultFolders)) {
                projects = projects.filter(p => !p.vault || this.validVaultFolders.includes(p.vault));
            }

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
    // Tooltip hover: title="" tradotti via data-i18n-title
    document.querySelectorAll('[data-i18n-title]').forEach(el => {
        const key = el.getAttribute('data-i18n-title');
        if (t[key]) el.setAttribute('title', t[key]);
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

// ── Onboarding lingua al primo avvio ─────────────────────────────────────────
// Doppia scelta: lingua INTERFACCIA + lingua MAPPE (due cose diverse: un docente
// può volere l'app in inglese ma mappe in italiano per i suoi studenti).
// Appare SOLO su installazione fresca (nessuna mappai_language salvata).
window.showLanguageOnboarding = function () {
    const T = window.t || ((k, f) => f);
    const modal = document.createElement('div');
    modal.id = 'lang-onboarding-modal';
    modal.className = 'fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-4';
    const opt = (name, value, label, desc, checked) => `
        <label class="pm-option">
            <input type="radio" name="${name}" value="${value}" ${checked ? 'checked' : ''}>
            <div><span class="pm-option-label">${label}</span>
            ${desc ? `<span class="pm-option-desc">${desc}</span>` : ''}</div>
        </label>`;
    modal.innerHTML = `
      <div class="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6" role="dialog" aria-modal="true" aria-labelledby="lang-onb-title">
        <div class="flex items-center gap-3 mb-4">
            <div class="pm-icon-wrap"><i data-lucide="languages" class="w-6 h-6"></i></div>
            <div>
                <h3 class="pm-title" id="lang-onb-title">${T('onb_title', 'Benvenuto in MappAI! · Welcome!')}</h3>
                <p class="pm-subtitle">${T('onb_subtitle', 'Scegli le lingue · Choose your languages')}</p>
            </div>
        </div>
        <div class="pm-section">
            <div class="pm-section-title">🖥 ${T('onb_ui_lang', 'Lingua dell\'interfaccia · Interface language')}</div>
            ${opt('onb-ui-lang', 'it', 'Italiano 🇮🇹', '', true)}
            ${opt('onb-ui-lang', 'en', 'English 🇬🇧', '', false)}
        </div>
        <div class="pm-section">
            <div class="pm-section-title">🗺 ${T('onb_map_lang', 'Lingua delle mappe · Map language')}</div>
            ${opt('onb-map-lang', 'ui', T('onb_map_ui', 'Come l\'interfaccia · Same as interface'), '', true)}
            ${opt('onb-map-lang', 'it', 'Italiano', '', false)}
            ${opt('onb-map-lang', 'en', 'English', '', false)}
            ${opt('onb-map-lang', 'auto', T('onb_map_auto', 'Lingua delle fonti · Language of the sources'), T('onb_map_auto_desc', 'Le mappe nascono nella lingua dei documenti caricati · Maps follow the language of your documents'), false)}
        </div>
        <div class="flex justify-end mt-5">
            <button type="button" id="lang-onb-ok" class="pm-btn-primary">${T('onb_start', 'Inizia · Start')}</button>
        </div>
      </div>`;
    document.body.appendChild(modal);
    if (window.safeCreateIcons) window.safeCreateIcons();
    document.getElementById('lang-onb-ok').onclick = () => {
        const uiLang = (modal.querySelector('input[name="onb-ui-lang"]:checked') || {}).value || 'it';
        const mapLang = (modal.querySelector('input[name="onb-map-lang"]:checked') || {}).value || 'ui';
        localStorage.setItem('mappai_map_language', mapLang);
        localStorage.setItem('mappai_lang_onboarded', '1');
        modal.remove();
        window.changeLanguage(uiLang);
    };
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

    // Onboarding lingue: solo installazione fresca (mai vista una lingua salvata)
    try {
        if (!localStorage.getItem('mappai_lang_onboarded')) {
            if (localStorage.getItem('mappai_language') === null) {
                window.showLanguageOnboarding();
            } else {
                localStorage.setItem('mappai_lang_onboarded', '1'); // utente esistente: non disturbare
            }
        }
    } catch (e) { /* localStorage non disponibile */ }

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
