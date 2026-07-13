// ==========================================
// UI MODALS & UTILITIES — estratto da app.js
// ==========================================
// Toast, alert/confirm/prompt custom, link-family prompt, config AI modal,
// magnifier, TTS, tab sidebar, tree view, MODEL_KB + select modelli +
// capabilities, wrapper cleanLabel/getLabelLines/extractDateFromLabel/stripHTML.
// Tutte le risoluzioni cross-file avvengono a runtime via scope globale condiviso.
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

// Verbi default per famiglia: ora bilingui, centralizzati in mappai-relations.js
function _lfmLang() { return (window.currentLanguage === 'en' || window.currentLanguage === 'en-US') ? 'en' : 'it'; }
function _lfmDefaultRel(key) { return window.MappAIRelations.getFamilyDefaultRel(key, _lfmLang()); }
function _lfmKeywords(fam) { return (_lfmLang() === 'en' && fam.keywordsEn) ? fam.keywordsEn : (fam.keywords || []); }

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

    question.innerHTML = window.t('lfm_question', `Che relazione c'è tra <strong>{a}</strong> e <strong>{b}</strong>?`).replace('{a}', srcLabel).replace('{b}', tgtLabel);
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
        const kw = _lfmKeywords(fam).slice(0, 3).join(' · ');
        btn.innerHTML = `
            <i data-lucide="${fam.icon}" class="w-5 h-5 flex-shrink-0"></i>
            <div class="flex flex-col items-start min-w-0">
                <span class="text-sm font-semibold leading-tight">${window.MappAIRelations.getFamilyLabel(key, _lfmLang())}</span>
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
            const def = _lfmDefaultRel(key) || '';
            input.value = def;

            // Costruisce i chip delle keyword
            chipsDiv.innerHTML = '';
            _lfmKeywords(fam).forEach(kw => {
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
            || (selectedFamKey ? _lfmDefaultRel(selectedFamKey) : '')
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
        window.showToast(window.t('tst_config_student', "Configurazione AI non disponibile nella versione studente"), "warning");
        return;
    }
    try {
        const m = document.getElementById('config-ai-modal');
        if (m) {
            const productInput = document.getElementById('infomaniak-product-id');
            if (productInput) productInput.value = appState.infomaniakProductId || '';
            const mapLangSel = document.getElementById('map-language-select');
            if (mapLangSel && window.getMapLanguageSetting) mapLangSel.value = window.getMapLanguageSetting();
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
    const tabs = ['structure', 'notes', 'study', 'finder', 'tutor', 'lim'];
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
    // Tab LIM (008): popola l'elenco attività + eventuali dashboard attive
    if (tab === 'lim' && window.MappAICollabTeacher && window.MappAICollabTeacher.renderLimSidebarTab) {
        window.MappAICollabTeacher.renderLimSidebarTab();
    }
}

// Tab LIM (008): kill-switch mappai_lim_tab='0' → nasconde il tab.
(function () {
    try {
        if (localStorage.getItem('mappai_lim_tab') === '0') {
            var b = document.getElementById('sidebar-tab-lim');
            if (b) b.classList.add('hidden');
        }
    } catch (e) { /* no-op */ }
})();

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

// Collassa TUTTI i rami dell'albero di default (006). L'albero è a 2 livelli:
// solo i nodi radice (L1 in MindMap / hub in KG) hanno la freccia → basta
// aggiungerli a collapsedTreeNodes. No-op se kill-switch
// mappai_tree_expanded_default==='1' (albero espanso come in origine).
// Idempotente: chiamata una sola volta per mappa (flag _treeCollapsedFor).
window.collapseAllTree = function (opts) {
    opts = opts || {};
    try { if (localStorage.getItem('mappai_tree_expanded_default') === '1') return; } catch (e) { }
    if (typeof appState === 'undefined' || !appState.db || !appState.db.nodes || !appState.db.nodes.length) return;

    // Firma della mappa corrente: evita di ri-collassare ciò che l'utente ha
    // espanso manualmente sulla stessa mappa (a meno di opts.force).
    var sig = (appState.rootNodeLabel || '') + '::' + appState.db.nodes.length + '::' + (appState.extractionMode || '');
    if (!opts.force && window._treeCollapsedFor === sig) return;
    window._treeCollapsedFor = sig;

    var isMindmap = appState.extractionMode === 'mindmap';
    var roots;
    if (isMindmap) {
        roots = appState.db.nodes.filter(function (n) { return n.level === 1; });
    } else {
        var deg = {};
        appState.db.nodes.forEach(function (n) { deg[n.id] = 0; });
        appState.db.links.forEach(function (l) {
            var s = typeof l.source === 'object' ? l.source.id : l.source;
            var tt = typeof l.target === 'object' ? l.target.id : l.target;
            if (deg[s] !== undefined) deg[s]++;
            if (deg[tt] !== undefined) deg[tt]++;
        });
        roots = appState.db.nodes.slice().sort(function (a, b) { return (deg[b.id] || 0) - (deg[a.id] || 0); }).slice(0, 8);
    }
    roots.forEach(function (n) { window.collapsedTreeNodes.add(n.id); });
    if (window.renderTreeView) window.renderTreeView();
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
        if (selectEl) selectEl.innerHTML = '<option value="">' + window.t('opt_no_model_key', 'Nessun modello (manca API Key)') + '</option>';
        window.showToast(window.t('tst_need_key_models', "Inserisci prima una API Key per caricare i modelli."), "error");
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
            if (selectEl) selectEl.innerHTML = '<option value="">' + window.t('opt_no_model_pid', 'Nessun modello (manca Product ID)') + '</option>';
            window.showToast(window.t('tst_need_pid', "Inserisci il Product ID per caricare i modelli Infomaniak."), "error");
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
            if (selectEl) selectEl.innerHTML = `<option value="">${window.t('opt_error', 'Errore')}: ${errMsg}</option>`;
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
            if (selectEl) selectEl.innerHTML = '<option value="">' + window.t('opt_no_compatible', 'Nessun modello compatibile') + '</option>';
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
