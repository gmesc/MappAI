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

    input.onkeypress = (e) => {
        if (e.key === 'Enter') { cleanup(); onConfirm(input.value.trim()); }
    };
}

// --- Modal Management (con try/catch per robustezza) ---
window.showConfigAIModal = function () {
    try {
        const m = document.getElementById('config-ai-modal');
        if (m) {
            m.classList.remove('hidden');
            m.style.display = 'flex';
            window.safeCreateIcons();
            try { if (window.getSystemKey && window.getSystemKey()) window.refreshGeminiModels(); } catch (e) { }
        }
    } catch (e) { console.error('showConfigAIModal error:', e); }
};
window.closeConfigAIModal = function () {
    try {
        const m = document.getElementById('config-ai-modal');
        if (m) { m.style.display = 'none'; m.classList.add('hidden'); }
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

window.toggleMagnifier = function () {
    magnifierActive = !magnifierActive;
    magnifierLens = document.getElementById('magnifier-lens');
    magnifierContent = document.getElementById('magnifier-content');

    if (magnifierActive) {
        magnifierLens.style.display = 'block';
        window.refreshMagnifier();
        document.addEventListener('mousemove', window.handleMagnifierMove);
    } else {
        magnifierLens.style.display = 'none';
        document.removeEventListener('mousemove', window.handleMagnifierMove);
        magnifierContent.innerHTML = '';
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
        'a11y-panel-toggle',
        'insegnai-drawer',
        'projects-bar',
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

            // Rimuovi pannelli accessibilità
            if (clone.classList && clone.classList.contains('a11y-panel')) {
                shouldAppend = false;
            } else if (clone.querySelectorAll) {
                const panels = clone.querySelectorAll('.a11y-panel');
                panels.forEach(p => p.remove());
            }

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

    // Ripristinata la formula corretta: WebKit moltiplica già queste coordinate per lo zoom: 2
    magnifierContent.style.left = (-x + 60) + 'px';
    magnifierContent.style.top = (-y + 60) + 'px';
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

window.showAPITutorial = function () {
    try {
        const m = document.getElementById('api-tutorial-modal');
        if (m) { m.classList.remove('hidden'); m.style.display = 'flex'; }
    } catch (e) { console.error('showAPITutorial error:', e); }
};
window.closeAPITutorial = function () {
    try {
        const m = document.getElementById('api-tutorial-modal');
        if (m) { m.style.display = 'none'; m.classList.add('hidden'); }
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
        html += `<span class="text-xs font-bold text-slate-700 group-hover:text-indigo-600 truncate">${rn.label}${degreeInfo}</span>`;
        html += `</button>`;

        if (children.length > 0) {
            html += `<div class="ml-5 pl-2 border-l-2 border-slate-200/60 space-y-0.5">`;
            children.forEach(c => {
                const cStatus = c.studyStatus === 'done' ? 'text-emerald-400' :
                    c.studyStatus === 'review' ? 'text-amber-400' : 'text-slate-200';
                html += `<button onclick="window.zoomToNode('${c.id.replace(/'/g, "\\'")}')" class="w-full text-left py-1 px-2 rounded hover:bg-slate-50 transition flex items-center gap-1.5">`;
                html += `<i data-lucide="minus" class="w-2.5 h-2.5 ${cStatus} flex-shrink-0"></i>`;
                html += `<span class="text-[10px] text-slate-500 hover:text-indigo-500 truncate">${c.label}</span>`;
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
                            <span class="text-[11px] font-bold text-slate-600 group-hover:text-indigo-600 transition truncate">${n.label}</span>
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

    const tierOrder = ['⚡ Veloce', '💎 Potente', '🟢 Economico', '📦 Legacy', 'Nuovi Modelli'];
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
        localStorage.setItem('gemini_selected_model', selectEl.value);
    }
    if (typeof updateModelCapabilities === 'function') updateModelCapabilities();
}

window.refreshGeminiModels = async function () {
    const apiKey = window.getSystemKey();
    if (!apiKey) {
        window.showToast("Inserisci prima una API Key per caricare i modelli.", "error");
        return;
    }

    const statusEl = document.getElementById('models-status');
    const refreshIcon = document.getElementById('refresh-models-icon');
    const selectEl = document.getElementById('model-select');
    const currentValue = selectEl ? selectEl.value : '';

    if (statusEl) { statusEl.innerText = "Caricamento modelli in corso..."; statusEl.classList.remove('hidden'); }
    if (refreshIcon) refreshIcon.style.animation = 'spin 1s linear infinite';

    try {
        if (!window.electronAPI || !window.electronAPI.listModels) {
            throw new Error("API list-models non disponibile");
        }

        const rawModels = await window.electronAPI.listModels({ apiKey });
        if (!rawModels || rawModels.length === 0) {
            if (statusEl) statusEl.innerText = "Nessun modello trovato.";
            return;
        }

        // Filter: exclude non-generative text models
        const excludePatterns = ['tts', 'live', 'embed', 'image', 'nano-banana', 'veo', 'lyria', 'imagen', 'robotics', 'deep-research', 'computer-use'];
        const filteredModels = rawModels.filter(m => {
            const id = m.id.toLowerCase();
            if (excludePatterns.some(p => id.includes(p))) return false;
            if (!id.includes('gemini')) return false; // Ensure it's a Gemini LLM
            return true;
        });

        if (filteredModels.length === 0) {
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
            localStorage.setItem('gemini_available_models', JSON.stringify(filteredModels.map(m => ({ id: m.id, displayName: m.displayName, kb: m.kb }))));
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
    return String(str).split('\\n').join(' ').split(String.fromCharCode(10)).join(' ');
}

function getLabelLines(str) {
    if (!str) return [];
    return String(str).split('\\n').join(String.fromCharCode(10)).split(String.fromCharCode(10));
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
    activeVaultPath: null
};

window.getSystemKey = function () {
    const inputEl = document.getElementById('api-key-input');
    let key = inputEl ? inputEl.value.trim() : "";
    if (!key || key === "") {
        key = localStorage.getItem('gemini_api_key') || "";
    }
    return key;
};

window.fetchModelAPI = async function (payload, apiKey) {
    const modelEl = document.getElementById('model-select');
    const model = modelEl ? modelEl.value : 'gemini-2.0-flash';

    if (window.electronAPI) {
        try {
            const response = await window.electronAPI.generateGemini({ apiKey, payload, model });

            // Tracking Usage
            if (response.usageMetadata) {
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
    const promptPrice = 0.10 / 1000000; // $ per token input (Flash 2.0)
    const candidatePrice = 0.40 / 1000000; // $ per token output

    const cost = (appState.generationUsage.promptTokens * promptPrice) + (appState.generationUsage.candidateTokens * candidatePrice);

    const costEl = document.getElementById('total-cost-display');
    const tokenEl = document.getElementById('total-tokens-display');

    if (costEl) costEl.textContent = '$' + cost.toFixed(4);
    if (tokenEl) tokenEl.textContent = appState.generationUsage.totalTokens.toLocaleString();
    const modelEl = document.getElementById('used-model-display');
    if (modelEl && appState.generationUsage.usedModel) modelEl.textContent = appState.generationUsage.usedModel;
}

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
        inputHtml = '<input type="file" multiple accept="audio/*" class="landing-input shadow-none mb-1 text-sm file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-amber-50 file:text-amber-700 hover:file:bg-amber-100 cursor-pointer" data-source-id="' + id + '" onchange="window.handleFileUpload(this, \'audio\')"><p class="text-[10px] text-slate-400">MP3, WAV, AAC... Gemini ascolterà il file.</p>';
    } else if (type === 'video') {
        titleHtml = '<i data-lucide="video" class="w-4 h-4 text-rose-400"></i> File Video';
        inputHtml = '<input type="file" multiple accept="video/*" class="landing-input shadow-none mb-1 text-sm file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-rose-50 file:text-rose-700 hover:file:bg-rose-100 cursor-pointer" data-source-id="' + id + '" onchange="window.handleFileUpload(this, \'video\')"><p class="text-[10px] text-slate-400">MP4, MOV, WEBM... Gemini vedrà il file.</p>';
    } else if (type === 'url') {
        titleHtml = '<i data-lucide="link" class="w-4 h-4 text-sky-400"></i> Link Web';
        inputHtml = '<input type="url" placeholder="https://..." class="landing-input shadow-none mb-1 text-sm" data-source-id="' + id + '" onblur="window.handleUrlBlur(this)"><p class="text-[10px] text-slate-400">Gemini analizzerà i contenuti della pagina web.</p>';
    } else if (type === 'youtube') {
        titleHtml = '<i data-lucide="youtube" class="w-4 h-4 text-red-400"></i> Video YouTube';
        inputHtml = '<input type="url" placeholder="https://youtube.com/watch?v=..." class="landing-input shadow-none mb-1 text-sm" data-source-id="' + id + '" onblur="window.handleUrlBlur(this)"><p class="text-[10px] text-slate-400">Gemini estrarrà i contenuti audio/visivi del video.</p>';
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

window.handlePDFUpload = function (input) {
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
    statusEl.innerHTML = '<i data-lucide="check" class="w-3 h-3 inline"></i> PDF pronto (' + sizeMB + ' MB).';
    window.safeCreateIcons();
    window.handleSourceAutofill(file.name);
}

window.handleFileUpload = function (input, type) {
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

    var sizeMB = (firstFile.size / (1024 * 1024)).toFixed(1);
    statusEl.innerHTML = `<i data-lucide="check" class="w-3 h-3 inline"></i> ${firstFile.name} (${sizeMB} MB) caricato.`;
    input.style.display = 'none';
    window.handleSourceAutofill(firstFile.name);

    if (input.files.length > 1) {
        for (let i = 1; i < input.files.length; i++) {
            let extraFile = input.files[i];
            window.addSource(type);
            let newSourceObj = appState.sources[appState.sources.length - 1];
            let newId = newSourceObj.id;

            newSourceObj.file = extraFile;
            newSourceObj.path = (window.electronAPI && window.electronAPI.getPathForFile) ? window.electronAPI.getPathForFile(extraFile) : extraFile.path;
            newSourceObj.mimeType = extraFile.type;

            setTimeout(() => {
                let newContainer = document.getElementById(newId);
                if (newContainer) {
                    let newStatusEl = document.createElement('p');
                    newStatusEl.className = 'text-[10px] text-emerald-400 mt-1 font-bold';
                    newStatusEl.id = 'status-' + newId;
                    newStatusEl.innerHTML = `<i data-lucide="check" class="w-3 h-3 inline"></i> ${extraFile.name} (${(extraFile.size / (1024 * 1024)).toFixed(1)} MB) caricato.`;

                    let inputDiv = newContainer.querySelector('.flex-grow');
                    if (inputDiv) inputDiv.appendChild(newStatusEl);

                    let inp = newContainer.querySelector('input[type="file"]');
                    if (inp) inp.style.display = 'none';
                    window.handleSourceAutofill(extraFile.name);
                }
            }, 50);
        }
    }
    window.safeCreateIcons();
}

window.startGeneration = async function () {
    const inputKey = document.getElementById('api-key-input') ? document.getElementById('api-key-input').value.trim() : "";

    if (inputKey !== "") {
        localStorage.setItem('gemini_api_key', inputKey);
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
        } else if (src.type === 'doc' && src.file && src.file.name.toLowerCase().endsWith('.pdf')) {
            const arrayBuffer = await src.file.arrayBuffer();
            try {
                const pdfText = await parsePdf(arrayBuffer);
                textParts.push(`--- FONTE PDF (${src.file.name}) ---\n${pdfText}\n`);
                hasSources = true;
            } catch (e) {
                console.error("Errore PDF.js in-browser:", e);
                textParts.push(`--- ERRORE LETTURA PDF (${src.file.name}): ${e.message} ---\n`);
            }
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
            window.showLoadingOverlay(true, `Caricamento ${src.type.toUpperCase()} su Google File API...`);
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

    window.showLoadingOverlay(true, "Inizializzazione elaborazione...");

    if (appState.extractionMode === 'mindmap') {
        await extractMindMapIterative(textParts, fileParts, apiKey);
    } else {
        await extractKnowledgeGraphSinglePass(textParts, fileParts, apiKey);
    }
}

async function extractMindMapIterative(textParts, fileParts, apiKey) {
    try {
        const rootId = "ROOT";
        appState.db = {
            nodes: [{ id: rootId, label: appState.rootNodeLabel, content: "Argomento principale dello studio.", level: 0, chunks: [], studyStatus: 'none', desc: "Argomento principale dello studio." }],
            links: [],
            sourcesDict: {}
        };

        window.showLoadingOverlay(true, "Analisi introduttiva dell'argomento principale...");
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

        let l1Labels = Array.from(document.querySelectorAll('.l1-topic-input')).map(i => i.value.trim()).filter(v => v);
        const autoGenerateL1 = document.getElementById('l1-auto-generate-toggle').checked;
        const maxBranches = parseInt(document.getElementById('branches-slider').value) || 0;

        if (l1Labels.length === 0 || autoGenerateL1) {
            window.showLoadingOverlay(true, "Fase 1: Individuazione delle Macro-Categorie...");
            let promptL1 = `Analizza le seguenti fonti. Identifica da 3 a 5 argomenti o macro-categorie fondamentali (Nodi di Livello 1) per descrivere il tema "${appState.rootNodeLabel}".\n`;
            if (l1Labels.length > 0) {
                promptL1 += `Devi ASSOLUTAMENTE includere le seguenti categorie richieste dall'utente: ${JSON.stringify(l1Labels)}.\n`;
            }
            promptL1 += `Restituisci SOLO ED ESCLUSIVAMENTE un Array JSON di stringhe. Nessun commento o testo aggiuntivo.\n\nFONTI:\n${textParts.join('\n')}`;

            const schemaL1 = { type: "ARRAY", items: { type: "STRING" } };
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
                    if (!l1Labels.some(existing => existing.toLowerCase() === gL1.toLowerCase())) {
                        l1Labels.push(gL1);
                    }
                });
            }
        }

        if (l1Labels.length === 0) l1Labels = ["Concetti Principali"];

        let l1NodesData = [];
        l1Labels.forEach((lbl, idx) => {
            let l1Id = `L1_${idx}`;
            let nodeObj = { id: l1Id, label: lbl, content: `Macro-area: ${lbl}`, desc: `Macro-area: ${lbl}`, level: 1, chunks: [], studyStatus: 'none' };
            l1NodesData.push(nodeObj);
            appState.db.nodes.push(nodeObj);
            appState.db.links.push({ source: rootId, target: l1Id, rel: "include" });
        });

        const schemaBranch = {
            type: "OBJECT",
            properties: {
                nodes: { type: "ARRAY", items: { type: "OBJECT", properties: { id: { type: "STRING" }, label: { type: "STRING" }, content: { type: "STRING" }, desc: { type: "STRING" }, level: { type: "INTEGER" }, chunks: { type: "ARRAY", items: { type: "STRING" } } }, required: ["id", "label", "content", "desc"] } },
                links: { type: "ARRAY", items: { type: "OBJECT", properties: { source: { type: "STRING" }, target: { type: "STRING" }, rel: { type: "STRING" } }, required: ["source", "target", "rel"] } }
            },
            required: ["nodes", "links"]
        };

        for (let i = 0; i < l1NodesData.length; i++) {
            const l1Node = l1NodesData[i];
            window.showLoadingOverlay(true, `Fase 2: Elaborazione ramo ${i + 1} di ${l1NodesData.length} ("${l1Node.label}")...`);

            if (i > 0) {
                // Rate limit prevention for free-tier Gemini API (15 RPM limits)
                await new Promise(resolve => setTimeout(resolve, 4500));
            }

            let promptBranch = `Sei un tutor esperto. Costruisci un ramo di una Mappa Mentale JSON sull'argomento: "${appState.rootNodeLabel}".\n` +
                `ATTENZIONE: DEVI POPOLARE SOLO ED ESCLUSIVAMENTE IL SOTTO-RAMO DELLA CATEGORIA: "${l1Node.label}" (usa il suo ID esatto come Source genitore: "${l1Node.id}").\n\n` +
                `REGOLE TASSATIVE:\n` +
                `1. INCLUDI nei 'nodes' il nodo padre esatto ("id": "${l1Node.id}", "label": "${l1Node.label}", "level": 1). COME 'content' INSERISCI UN CHIARO E UTILISSIMO RIASSUNTO descrittivo della macro-area (almeno 30 parole, massimo 50 parole) per aiutare lo studente.\n` +
                `2. Usa TASSATIVAMENTE e rigorosamente SEMPRE L'ITALIANO per tutto l'albero. Questo vale anche per le parole di connessione logica ('rel' nei links), usa verbi italiani come "include", "porta a", "causa", "è formato da", "dipende da"\n` +
                `3. Crea nodi di Livello 2 (usa 'level': 2) per i concetti chiave derivanti da "${l1Node.label}". Collega ognuno al genitore inserendo in links "source": "${l1Node.id}".\n` +
                `4. Crea nodi di Livello 3 (usa 'level': 3) figli dei nodi L2.\n` +
                `5. Crea nodi di Livello 4 e 5 (usa 'level': 4, 5) per approfondire ulteriormente i dettagli più specifici, assicurando una gerarchia profonda e completa.\n`;

            if (maxBranches > 0) {
                promptBranch += `6. DEVI ASSOLUTAMENTE generare ALMENO ${maxBranches} rami per ogni livello di profondità (L2, L3, L4, L5) per popolare l'albero in modo folto e dettagliato.\n`;
            }

            promptBranch += `7. 'content' DEVE ESSERE una frase molto concisa (massimo 10 parole). 'desc' DEVE ESSERE un paragrafo ESTREMAMENTE CORPOSO, DETTAGLIATO E DISCORSIVO (minimo 250-300 parole) che spieghi in modo enciclopedico e approfondito il concetto, includendo tutto il contesto tecnico o storico derivante dalle fonti. SE IL TESTO 'desc' E' TROPPO BREVE FALLIRAI IL COMPITO.\n` +
                `8. Identifica almeno 1 'source' specifico per ogni argomento (es. libro, autore, documento).\n` +
                `9. ID nodi: Usa stringhe univoche in maiuscolo (es. "${l1Node.id}_CONCEPT_1").\n` +
                `10. 'chunks': Inserisci un array di stringhe contenente LE ESATTE CITAZIONI ESTRATTE DALLE FONTI (copia/incolla una o più frasi reali dal testo per comprovare il concetto). Assicurati di includere nelle citazioni il titolo originale del documento se presente.\n\n` +
                `FONTI DA ANALIZZARE:\n${textParts.join('\n\n')}`;

            const payloadBranch = {
                contents: [{ parts: [...fileParts, { text: promptBranch }] }],
                generationConfig: { temperature: 0.3, responseMimeType: "application/json", responseSchema: schemaBranch }
            };

            try {
                const dataBranch = await window.fetchModelAPI(payloadBranch, apiKey);
                const cand = dataBranch.candidates && dataBranch.candidates[0];
                if (cand && cand.content && cand.content.parts) {
                    let rawText = cand.content.parts[0].text;
                    let cleanText = rawText.split(MARKER_JSON).join('').split(MARKER_END).join('').trim();
                    let branchData = JSON.parse(cleanText);

                    let l1ChunksAggregated = []; // Raccogliamo tutte le note della prole

                    if (branchData.nodes && Array.isArray(branchData.nodes)) {
                        branchData.nodes.forEach(n => {
                            if (n.id === l1Node.id) {
                                // Update summary for the L1 node requested by the user
                                let existingNode = appState.db.nodes.find(x => x.id === l1Node.id);
                                if (existingNode && n.content) {
                                    existingNode.content = n.content;
                                    existingNode.desc = n.content;
                                }
                                if (n.chunks) l1ChunksAggregated.push(...n.chunks);
                            } else {
                                let nodeLevel = parseInt(n.level);
                                if (isNaN(nodeLevel)) nodeLevel = 2; // base level if missing
                                const desc = n.desc || n.content || "";
                                appState.db.nodes.push({ ...n, level: nodeLevel, studyStatus: 'none', desc: desc, aiDesc: desc, chunks: n.chunks || [] });
                                if (n.chunks && n.chunks.length > 0) {
                                    appState.db.sourcesDict[n.id] = n.chunks.map(c => ({ title: "Testo di origine", source: l1Node.label, text: c }));
                                    l1ChunksAggregated.push(...n.chunks);
                                }
                            }
                        });
                    }

                    // Riversa l'aggregato dei chunk nel nodo L1 per mostrare la prole
                    if (l1ChunksAggregated.length > 0) {
                        if (!appState.db.sourcesDict[l1Node.id]) appState.db.sourcesDict[l1Node.id] = [];
                        appState.db.sourcesDict[l1Node.id].push(...l1ChunksAggregated.filter((v, i, a) => a.indexOf(v) === i).map(c => ({ title: "Da sottomacchie", source: "Corpo della mappa", text: c })));
                    }
                    if (branchData.links && Array.isArray(branchData.links)) {
                        branchData.links.forEach(l => {
                            if (l.source && l.target && l.rel) {
                                appState.db.links.push(l);
                            }
                        });
                    }
                }
            } catch (e) {
                console.warn(`Errore durante la generazione del ramo ${l1Node.label}:`, e);
                window.showToast(`Errore ramo "${l1Node.label}": il livello non è stato popolato. (Vedi console)`, "error");
            }
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

async function extractKnowledgeGraphSinglePass(textParts, fileParts, apiKey) {
    var promptText = `Sei un esperto estensore di Knowledge Graph.\n` +
        `Tema: ${appState.rootNodeLabel}.\nModalità: Knowledge Graph Relazionale Libero.\n`;

    promptText += `\nREGOLE FONDAMENTALI (Pena fallimento critico):\n- Estrai concetti chiave, date, o eventi storici ('id' MAIUSCOLO univoco).\n` +
        `- Estrai il MASSIMO NUMERO POSSIBILE di Nodi (nodes) pertinenti. Non fermarti a riassunti basilari.\n` +
        `- Ogni nodo ('nodes') DEVE avere: 'label' (Testo Breve), 'desc' (Paragrafo ESTREMAMENTE CORPOSO di almeno 250-300 parole, enciclopedico, ricco di contesto e discorsivo), e 'level' (1 per Super-Hub, 2 per Hub medi, 3 per Nodi foglia).\n` +
        `- SE 'desc' E' TROPPO BREVE, IL RISULTATO SARA' SCARTATO.\n` +
        `- Crea una FITTA RETE di RELAZIONI ('links') logiche e storicamente/tecnicamente fondate tra i nodi.\n` +
        `- Il 'rel' nei links DEVE ESSERE esplicativo (massimo 5 parole).\n\n`;

    let kgKeywords = Array.from(document.querySelectorAll('.l1-topic-input')).map(i => i.value.trim()).filter(v => v).join(', ');
    if (kgKeywords) promptText += `Focalizza le relazioni su questi Super-Hub semantici (se pertinenti): ${kgKeywords}.\n`;

    promptText += `\n- Usa archi relazionali tra i nodi (source, target, rel).\n` +
        `- 'content' è una breve frase (max 10 parole). 'desc' DEVE ESSERE un paragrafo ESTREMAMENTE CORPOSO, DETTAGLIATO E DISCORSIVO (minimo 250-300 parole) che spieghi in modo enciclopedico e approfondito il concetto, includendo tutto il contesto tecnico o storico derivante dalle fonti. SE IL TESTO 'desc' E' TROPPO BREVE FALLIRAI IL COMPITO IN MODO CRITICO.\n` +
        `- 'chunks' DEVE contenere un array con le ESATTE CITAZIONI TESTUALI estratte dalle fonti (assicurati di includere il titolo del documento originale se noto).\n\n` +
        `FONTI DA ANALIZZARE:\n${textParts.join('\n\n')}`;

    const schema = {
        type: "OBJECT", properties: {
            nodes: { type: "ARRAY", items: { type: "OBJECT", properties: { id: { type: "STRING" }, label: { type: "STRING" }, content: { type: "STRING" }, desc: { type: "STRING" }, level: { type: "INTEGER" }, chunks: { type: "ARRAY", items: { type: "STRING" } } }, required: ["id", "label", "content", "desc", "level", "chunks"] } },
            links: { type: "ARRAY", items: { type: "OBJECT", properties: { source: { type: "STRING" }, target: { type: "STRING" }, rel: { type: "STRING" } }, required: ["source", "target", "rel"] } }
        }, required: ["nodes", "links"]
    };

    const payload = { contents: [{ parts: [...fileParts, { text: promptText }] }], generationConfig: { temperature: 0.2, responseMimeType: "application/json", responseSchema: schema } };

    try {
        window.showLoadingOverlay(true, "Analisi e formattazione Graph...");
        const data = await window.fetchModelAPI(payload, apiKey);
        let rawText = data.candidates[0].content.parts[0].text;
        let cleanText = rawText.split(MARKER_JSON).join('').split(MARKER_END).join('').trim();

        appState.db = JSON.parse(cleanText);
        const validNodeIds = new Set(appState.db.nodes.map(n => n.id));
        appState.db.links = (appState.db.links || []).filter(l => validNodeIds.has(l.source) && validNodeIds.has(l.target));

        appState.db.nodes.forEach(n => {
            n.studyStatus = 'none';
            if (!n.desc) n.desc = n.desc || n.content || "";
            n.aiDesc = n.desc;
        });
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

    const costText = kb && kb.free ? "Gratuito (Piano Free)" : `$${totalCost.toFixed(4)}`;
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
    if (appState.extractionMode !== 'mindmap' && d.degree !== undefined) {
        // KG mode: scale radius by degree (connections)
        const minR = 10, maxR = 45;
        const maxDeg = Math.max(...appState.db.nodes.map(n => n.degree || 0), 1);
        return minR + ((d.degree || 0) / maxDeg) * (maxR - minR);
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

    if (!simulation) {
        simulation = d3.forceSimulation(nodes)
            .force("link", d3.forceLink(links).id(d => d.id).distance(d => ((d.source.level === 0) ? 120 : 80) * forceDistMult))
            .force("collide", d3.forceCollide().radius(d => getNodeRadius(d) + 25).iterations(3))
            .force("charge", d3.forceManyBody().strength(d => (d.level === 0 ? -800 : -200) * forceChargeMult))
            .force("center", d3.forceCenter(0, 0));

        simulation.on("tick", tick);
        if (appState.layoutMode !== 'default') window.applyLayoutForces();
    } else {
        simulation.nodes(nodes);
        simulation.force("link").links(links).distance(d => ((d.source.level === 0) ? 120 : 80) * forceDistMult);
        simulation.force("charge").strength(d => (d.level === 0 ? -800 : -200) * forceChargeMult);
        if (appState.layoutMode !== 'default') window.applyLayoutForces();
        simulation.alpha(0.3).restart();
    }

    const linkSelection = g.selectAll(".link-group").data(links, d => `${d.source.id || d.source}-${d.target.id || d.target}-${d.rel}`);
    const linkEnter = linkSelection.enter().append("g").attr("class", "link-group")
        .on("contextmenu", (e, d) => window.showContextMenu(e, 'link', d))
        .on("touchstart", (e, d) => handleTouchStart(e, 'link', d))
        .on("touchend", handleTouchEnd)
        .on("touchmove", handleTouchMove);

    linkEnter.append("line").attr("class", "link").attr("stroke", "#cbd5e1").attr("stroke-width", 1.5).attr("marker-end", "url(#arrowhead)");
    linkEnter.append("text").attr("class", "link-label").attr("dy", -4).text(d => d.rel);

    const linkMerge = linkEnter.merge(linkSelection);
    linkMerge.select("text.link-label")
        .text(d => d.rel)
        .attr("font-size", (8 * globalFontScale * 0.85) + "px");
    linkMerge.classed("ai-suggested", d => d.aiSuggested === true);
    linkSelection.exit().remove();

    const nodeSelection = g.selectAll(".node-group").data(nodes, d => d.id);
    const nodeEnter = nodeSelection.enter().append("g").attr("class", "node-group")
        .call(drag(simulation))
        .on("click", window.handleNodeClick)
        .on("contextmenu", (e, d) => window.showContextMenu(e, 'node', d))
        .on("touchstart", (e, d) => handleTouchStart(e, 'node', d))
        .on("touchend", handleTouchEnd)
        .on("touchmove", handleTouchMove);

    nodeEnter.append("circle").attr("class", "node-circle");

    nodeEnter.append("text").attr("class", "node-text")
        .attr("dy", d => -(getNodeRadius(d) + 8))
        .attr("fill", "#0f172a")
        .attr("font-size", d => {
            let baseSize = 8;
            if (d.level === 0) baseSize = 14;
            else if (d.level === 1) baseSize = 12;
            else if (d.level === 2) baseSize = 10;
            else if (d.level === 3) baseSize = 9;
            return (baseSize * globalFontScale) + "px";
        });

    nodeEnter.append("foreignObject")
        .attr("class", "node-icons-fo pointer-events-none")
        .attr("width", 30)
        .attr("height", 14)
        .attr("x", -15)
        .attr("y", -7);

    const nodeMerge = nodeEnter.merge(nodeSelection);

    nodeMerge.select("circle.node-circle")
        .attr("r", d => getNodeRadius(d))
        .attr("fill", d => {
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
            hsl.l = Math.min(0.95, hsl.l + (d.level - 1) * 0.15);
            return hsl.toString();
        })
        .attr("stroke", d => {
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
            if (d.studyStatus && d.studyStatus !== 'none') return d.level === 0 ? 6 : 4;
            return 0;
        });

    nodeMerge.select("text.node-text")
        .each(function (d) {
            const textEl = d3.select(this);
            let labelStr = cleanLabel(d.label);

            if (d.level >= 4 && labelStr.length > 15) labelStr = labelStr.substring(0, 15) + "...";
            else if (d.level === 3 && labelStr.length > 25) labelStr = labelStr.substring(0, 25) + "...";

            let lines = getLabelLines(labelStr);
            if (lines.length > 1) {
                textEl.text('');
                lines.forEach((line, i) => {
                    textEl.append('tspan')
                        .attr('x', 0)
                        .attr('dy', i === 0 ? `-${(lines.length - 1) * 1.1}em` : '1.1em')
                        .text(line);
                });
            } else {
                textEl.text(labelStr);
            }
        });

    nodeMerge.select("foreignObject.node-icons-fo")
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
    function dragstarted(event) {
        if (!event.active) simulation.alphaTarget(0.3).restart();
        event.subject.fx = event.subject.x;
        event.subject.fy = event.subject.y;
    }
    function dragged(event) {
        event.subject.fx = event.x;
        event.subject.fy = event.y;
    }
    function dragended(event) {
        if (!event.active) simulation.alphaTarget(0);
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
        g.selectAll("text.node-text").attr("font-size", d => {
            let baseSize = 8;
            if (d.level === 0) baseSize = 14;
            else if (d.level === 1) baseSize = 12;
            else if (d.level === 2) baseSize = 10;
            else if (d.level === 3) baseSize = 9;
            return (baseSize * globalFontScale) + "px";
        });

        g.selectAll("text.link-label").attr("font-size", (8 * globalFontScale * 0.85) + "px");
    }
};

window.exportSnapshot = function () {
    const svgNode = document.querySelector("#d3-container svg");
    if (!svgNode) return;

    const serializer = new XMLSerializer();
    let source = serializer.serializeToString(svgNode);

    // Fix namespace
    if (!source.match(/^<svg[^>]+xmlns="http\:\/\/www\.w3\.org\/2000\/svg"/)) {
        source = source.replace(/^<svg/, '<svg xmlns="http://www.w3.org/2000/svg"');
    }
    if (!source.match(/^<svg[^>]+"http\:\/\/www\.w3\.org\/1999\/xlink"/)) {
        source = source.replace(/^<svg/, '<svg xmlns:xlink="http://www.w3.org/1999/xlink"');
    }

    const url = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(source);

    const img = new Image();
    img.onload = function () {
        const canvas = document.createElement("canvas");
        canvas.width = svgNode.getBoundingClientRect().width * 2;
        canvas.height = svgNode.getBoundingClientRect().height * 2;
        const ctx = canvas.getContext("2d");

        // Opzionale: disegna lo sfondo
        ctx.fillStyle = document.body.classList.contains('font-dyslexic') ?
            (document.body.classList.contains('a11y-invert') ? '#000' : '#f0f4ff') : '#fafbff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.scale(2, 2);
        ctx.drawImage(img, 0, 0);

        const a = document.createElement("a");
        a.download = "MappAI_Snapshot.png";
        a.href = canvas.toDataURL("image/png");
        a.click();

        window.showToast("Snapshot salvato con successo!", "success");
    };
    img.src = url;
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
    const span = btn ? btn.querySelector('span') : null;

    if (isMindmap) {
        appState.layoutMode = appState.layoutMode === 'default' ? 'radial' : 'default';
    } else {
        if (appState.layoutMode === 'default') appState.layoutMode = 'separated';
        else if (appState.layoutMode === 'separated') appState.layoutMode = 'orbit';
        else appState.layoutMode = 'default';
    }

    if (btn) {
        if (appState.layoutMode !== 'default') {
            btn.classList.replace('bg-slate-100', 'bg-indigo-100');
            btn.classList.replace('text-slate-600', 'text-indigo-600');
            if (appState.layoutMode === 'separated') span.innerText = 'SEPARATO';
            if (appState.layoutMode === 'radial') span.innerText = 'RADIALE';
            if (appState.layoutMode === 'orbit') span.innerText = 'ORBITA';
        } else {
            btn.classList.replace('bg-indigo-100', 'bg-slate-100');
            btn.classList.replace('text-indigo-600', 'text-slate-600');
            span.innerText = 'LAYOUT';
        }
    }

    window.applyLayoutForces();
}

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
const sotaStatusMessages = [
    "Gemini sta leggendo i tuoi documenti...",
    "Analisi semantica profonda...",
    "Estrazione concetti chiave...",
    "Costruzione relazioni topologiche...",
    "Ottimizzazione del Knowledge Graph...",
    "Mappatura nessi logici complessi...",
    "Rifinitura descrizioni enciclopediche...",
    "Ancora un attimo, sto collegando i puntini..."
];

window.showLoadingOverlay = function (show, text) {
    const el = document.getElementById('loading-overlay');
    const desc = document.getElementById('loading-desc');
    const title = document.getElementById('loading-title');

    if (show) {
        el.classList.add('visible');
        if (text) desc.textContent = text;
        
        if (!loadingInterval) {
            loadingSeconds = 0;
            let msgIdx = 0;
            loadingInterval = setInterval(() => {
                loadingSeconds++;
                if (loadingSeconds % 4 === 0) {
                    msgIdx = (msgIdx + 1) % sotaStatusMessages.length;
                    desc.textContent = sotaStatusMessages[msgIdx];
                }
                title.textContent = `Mapp.AI sta lavorando... (${loadingSeconds}s)`;
            }, 1000);
        }
    } else {
        el.classList.remove('visible');
        if (loadingInterval) {
            clearInterval(loadingInterval);
            loadingInterval = null;
        }
        if (title) title.textContent = "Mapp.AI sta lavorando...";
    }
}

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

window.handleNodeClick = function (event, d) {
    try {
        event.stopPropagation();
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
                    
                    <!-- Multiple Links in Details -->
                    ${(d.urls && d.urls.length > 0) ? `
                        <div class="space-y-2 mb-6">
                            ${d.urls.map(u => {
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
                    <div class="pt-4 border-t border-slate-200 space-y-4">
                        <button onclick="window.generateAIQuiz()" class="w-full bg-emerald-600 text-white font-bold p-2.5 rounded-lg shadow-md hover:bg-emerald-700 flex justify-center items-center gap-2 transition">
                            <i data-lucide="brain-circuit" class="w-5 h-5"></i> Mettiti alla prova (Genera Quiz)
                        </button>
                    </div>
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
        if (window.resetA11yTools) window.resetA11yTools();

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
                const displayUrl = u.length > 60 ? u.substring(0, 60) + "..." : u;
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
        html += `
        <div class="mt-8 border-t border-slate-200 pt-6">
            <div class="flex justify-between items-center cursor-pointer mb-2 group" onclick="document.getElementById('node-tutor-container').classList.toggle('hidden'); document.getElementById('node-tutor-chevron').classList.toggle('rotate-180')">
                <label class="text-xs font-bold text-indigo-600 uppercase flex items-center gap-2 cursor-pointer group-hover:text-indigo-800 transition">
                    <i data-lucide="bot" class="w-4 h-4"></i> Tutor AI del Nodo
                </label>
                <i data-lucide="chevron-down" id="node-tutor-chevron" class="w-4 h-4 text-slate-400 transition-transform duration-200"></i>
            </div>
            <div id="node-tutor-container" class="hidden flex-col gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200 mt-2">
                <div id="node-tutor-start" class="flex flex-col items-center justify-center py-4">
                    <p class="text-xs text-slate-500 font-medium mb-3 text-center">Avvia il tutor contestuale per esplorare o testare la tua conoscenza su questo nodo.</p>
                    <button onclick="window.startNodeTutor()" class="px-4 py-2 bg-indigo-100 text-indigo-700 font-bold text-xs rounded-lg hover:bg-indigo-200 transition-colors flex items-center gap-2 shadow-sm">
                        <i data-lucide="play-circle" class="w-4 h-4"></i> Avvia Sessione
                    </button>
                </div>
                <div id="node-tutor-chat-area" class="hidden flex-col h-64">
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
        if (typeof window.require !== 'undefined') {
            const { shell } = window.require('electron');
            if (url.startsWith('file://')) {
                let path = url.replace('file://', '');
                shell.openPath(path);
            } else {
                shell.openExternal(url);
            }
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
        if (containerRoot) containerRoot.classList.add('hidden');

        if (l1Title) l1Title.innerText = "Super-Hubs relazionali";
        if (l1Desc) l1Desc.innerText = "Definisci i concetti chiave attorno a cui costruire le relazioni:";
        if (l1BtnText) l1BtnText.innerText = "Aggiungi Super-Hub";
        if (l1AutoLabel) l1AutoLabel.innerText = "Genera altri Super-Hub in automatico";
        l1Inputs.forEach(i => i.placeholder = "Es. Trattative, Eredità...");
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

    const mainCard = document.querySelector('.glass-card.max-w-3xl');
    const sourceBody = document.getElementById('source-modal-body');

    if (mainCard) mainCard.style.zoom = z;
    if (sourceBody) sourceBody.style.zoom = z;

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
    appState.db.nodes.forEach(d => {
        if (d.level > 0) {
            d.fx = null;
            d.fy = null;
        }
    });
    simulation.alpha(1).restart();
};

window.exportGraph = function () {
    if (!appState.db.nodes.length) return window.showAlert("Errore", "Nessuna mappa da esportare.");
    const exportData = {
        rootNodeLabel: appState.rootNodeLabel, mode: appState.extractionMode,
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
            const data = JSON.parse(e.target.result);
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
            appState.extractionMode = data.mode || "mindmap";

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

// ==========================================
// SOTA: MARKDOWN VAULT LOGIC
// ==========================================

window.saveMapVault = async function () {
    if (!appState.db.nodes.length) return window.showAlert("Errore", "Nessuna mappa da esportare.");
    
    try {
        const result = await window.electronAPI.pickFolder();
        if (result.canceled) return;
        
        window.showLoadingOverlay(true, "Esportazione Vault in corso...");
        
        const saveRes = await window.electronAPI.saveVault({
            folderPath: result.folderPath,
            mapData: {
                extractionMode: appState.extractionMode,
                rootNodeLabel: appState.rootNodeLabel,
                nodes: appState.db.nodes,
                links: appState.db.links
            }
        });
        
        window.showLoadingOverlay(false);
        if (saveRes.success) {
            appState.activeVaultPath = result.folderPath;
            window.showToast("Vault salvato con successo!", "success");
        } else {
            window.showAlert("Errore Salvataggio", saveRes.error);
        }
    } catch (e) {
        window.showLoadingOverlay(false);
        console.error(e);
        window.showAlert("Errore", e.message);
    }
};

window.loadMapVault = async function () {
    try {
        const result = await window.electronAPI.pickFolder();
        if (result.canceled) return;
        
        window.showLoadingOverlay(true, "Caricamento Vault...");
        
        const loadRes = await window.electronAPI.loadVault(result.folderPath);
        
        window.showLoadingOverlay(false);
        if (loadRes.success) {
            appState.activeVaultPath = result.folderPath;
            appState.extractionMode = loadRes.data.extractionMode;
            appState.rootNodeLabel = loadRes.data.rootNodeLabel;
            appState.db = loadRes.data.db;
            
            window.switchToMapLayout();
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
            const data = JSON.parse(e.target.result);
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

    const promptText = `Sei un esperto di analisi di Knowledge Graph. Ti do due liste di concetti provenienti da due Knowledge Graph diversi. Cerca possibili correlazioni semantiche tra concetti della LISTA A e concetti della LISTA B.

LISTA A (mappa esistente):
${existingLabels.map(n => `- ${n.id}: "${n.label}"`).join('\n')}

LISTA B (mappa importata):
${newLabels.map(n => `- ${n.id}: "${n.label}"`).join('\n')}

Rispondi SOLO con un JSON array. Ogni elemento deve avere: "source" (ID dalla lista A), "target" (ID dalla lista B), "rel" (parola di relazione in italiano, 1-3 parole).
Suggerisci TUTTE le correlazioni semanticamente significative e plausibili che trovi. Se non trovi correlazioni valide, rispondi con [].
Formato: [{"source":"id_a","target":"id_b","rel":"correlazione"}]`;

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

function handleTouchStart(e, type, data) {
    if (e.touches.length > 1) return; // ignore multi-touch
    longPressTimer = setTimeout(() => {
        let syntheticEvent = e;
        if (e.touches && e.touches[0]) {
            syntheticEvent = {
                preventDefault: () => e.preventDefault(),
                stopPropagation: () => e.stopPropagation(),
                clientX: e.touches[0].clientX,
                clientY: e.touches[0].clientY
            };
        }
        window.showContextMenu(syntheticEvent, type, data);
    }, 600);
}

function handleTouchEnd(e) { if (longPressTimer) clearTimeout(longPressTimer); }
function handleTouchMove(e) { if (longPressTimer) clearTimeout(longPressTimer); }

window.showContextMenu = function (e, type, data) {
    e.preventDefault(); e.stopPropagation();
    const menu = document.getElementById('context-menu');
    menu.innerHTML = ''; ctxTarget = { type, data };

    if (type === 'node') {
        menu.innerHTML = `
                    <div class="px-3 py-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-widest bg-slate-50 border-b border-slate-200">Stato di Studio</div>
                    <div class="ctx-item" onclick="window.ctxAction('status_todo')"><i data-lucide="circle-dashed" class="text-red-500"></i> Da studiare</div>
                    <div class="ctx-item" onclick="window.ctxAction('status_review')"><i data-lucide="refresh-cw" class="text-amber-500"></i> Ripasso necessario</div>
                    <div class="ctx-item" onclick="window.ctxAction('status_done')"><i data-lucide="check-circle-2" class="text-emerald-500"></i> Imparato!</div>
                    <div class="ctx-item" onclick="window.ctxAction('status_none')"><i data-lucide="circle" class="text-slate-300"></i> Azzera Semaforo</div>
                    <div class="px-3 py-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-widest bg-slate-50 border-y border-slate-200 mt-1">Editor Mappa</div>
                    <div class="ctx-item" onclick="window.ctxAction('expand_ai')"><i data-lucide="sparkles" class="text-indigo-500"></i> Espandi con IA (Da Fonte)...</div>
                    <div class="ctx-item" onclick="window.ctxAction('edit')"><i data-lucide="edit"></i> Modifica Contenuti...</div>
                    <div class="ctx-item" onclick="window.ctxAction('rename')"><i data-lucide="type"></i> Rinomina Etichetta</div>
                    <div class="ctx-item" onclick="window.ctxAction('add_child')"><i data-lucide="plus-circle"></i> Aggiungi Nodo Figlio</div>
                    <div class="ctx-item" onclick="window.ctxAction('link')"><i data-lucide="link"></i> Crea Relazione...</div>
                    <hr class="my-1 border-slate-200">
                    <div class="px-3 py-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-widest bg-slate-50 border-y border-slate-200 mt-1">Spaced Repetition</div>
                    <div class="ctx-item text-indigo-600" onclick="window.ctxAction('generate_flashcard')"><i data-lucide="brain-circuit"></i> Flashcard Nodo</div>
                    <div class="ctx-item text-indigo-600" onclick="window.ctxAction('generate_flashcard_branch')"><i data-lucide="network"></i> Flashcard Ramo</div>
                    <div class="ctx-item text-purple-600" onclick="window.ctxAction('test_flashcard')"><i data-lucide="graduation-cap"></i> Quiz Nodo</div>
                    <div class="ctx-item text-purple-600" onclick="window.ctxAction('test_flashcard_branch')"><i data-lucide="layers"></i> Quiz Ramo</div>
                    <hr class="my-1 border-slate-200">
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
        menu.innerHTML = `
                    <div class="ctx-item" onclick="window.ctxAction('add_isolated')"><i data-lucide="plus"></i> Nuovo Nodo Isolato</div>
                    <div class="ctx-item" onclick="window.resetZoom()"><i data-lucide="maximize"></i> Centra Vista</div>
                `;
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
        window.showPrompt("Nome del nuovo nodo figlio:", "", (lbl) => {
            if (lbl) {
                let newId = 'NODE_' + Math.random().toString(36).substr(2, 6).toUpperCase();
                appState.db.nodes.push({ id: newId, label: lbl, content: "", desc: "", level: (data.level || 0) + 1, studyStatus: 'none', chunks: [], x: data.x + 30, y: data.y + 30 });
                appState.db.links.push({ source: data.id, target: newId, rel: "collegato_a" });
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
        window.generateFlashcardForNode(data);
    }
    else if (action === 'test_flashcard') {
        if (!data.flashcardTest) {
            window.showToast("Nessuna flashcard presente. Generala prima!", "error");
            return;
        }
        window.openQuizModal(data);
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
    if (currentNode && currentNode.id === editTarget.id) window.handleNodeClick({ stopPropagation: () => { } }, currentNode);
}

window.updateUserNotesSidebar = function () {
    const container = document.getElementById('user-notes-container');
    const hint = document.getElementById('empty-notes-hint');
    if (!container) return;

    const customNodes = appState.db.nodes.filter(n => n.hasCustomText || n.hasCustomImage);
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

window.generateFlashcardForNode = async function (node, silent = false) {
    const apiKey = window.getSystemKey();
    if (!apiKey) {
        if (!silent) window.showToast("Nessuna API Key presente per generare le flashcard.", "error"); return;
    }
    if (!silent) window.showLoadingOverlay(true, "Generazione Flashcard in corso...");

    const promptText = `Genera 5 diverse domande di verifica a risposta multipla basate sul seguente concetto: "${node.label}" - "${node.content || node.desc}". 
Restituisci SOLO E SOLTANTO codice JSON valido con questa struttura esatta:
[
  {
    "q": "Domanda 1?",
    "a1": "Opzione sbagliata",
    "a2": "Opzione sbagliata",
    "a3": "Opzione corretta",
    "correct": 3
  },
  ... (altre 4 domande)
]
Assicurati che "correct" indichi il numero (1, 2 o 3) della risposta corretta per ogni oggetto. Usa l'italiano.`;

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
        node.flashcardTest = JSON.parse(cleanText);
        node.nextReview = Date.now(); // Available right away
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

    const nodesWithCards = appState.db.nodes.filter(n => n.flashcardTest);
    if (nodesWithCards.length === 0) {
        hint.style.display = 'block';
        Array.from(container.children).forEach(c => {
            if (c.id !== 'empty-sets-hint') c.remove();
        });
        return;
    }

    hint.style.display = 'none';
    container.innerHTML = '<p class="text-[10px] text-slate-400 italic" id="empty-sets-hint" style="display:none;">Genera flashcard o quiz per visualizzarli qui.</p>';

    nodesWithCards.forEach(n => {
        const div = document.createElement('div');
        div.className = "flex justify-between items-center p-3 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition cursor-pointer group shadow-sm";
        div.onclick = () => window.openQuizModal(n);

        let iconColor = n.studyStatus === 'done' ? 'text-emerald-500' : (n.studyStatus === 'review' ? 'text-amber-500' : 'text-slate-400');
        const lastScore = n.lastScore ? `<span class="text-[9px] text-slate-400 font-medium">Ultimo Score: <b class="text-indigo-500">${n.lastScore}</b></span>` : '<span class="text-[9px] text-slate-300 italic">Ancora da ripassare</span>';

        div.innerHTML = `
                    <div class="flex items-center gap-3 overflow-hidden min-w-0 flex-1">
                        <div class="w-8 h-8 rounded-lg bg-slate-50 flex items-center justify-center shrink-0 border border-slate-100 group-hover:bg-white transition">
                             <i data-lucide="brain-circuit" class="w-4 h-4 ${iconColor}"></i>
                        </div>
                        <div class="flex flex-col min-w-0">
                            <span class="text-xs font-bold text-slate-700 truncate leading-tight">${n.label}</span>
                            ${lastScore}
                        </div>
                    </div>
                    <div class="ml-3 shrink-0 flex items-center gap-1">
                        <button onclick="event.stopPropagation(); window.deleteStudySet('${n.id}')" class="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition" title="Elimina Set">
                            <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
                        </button>
                        <i data-lucide="play-circle" class="w-5 h-5 text-indigo-500 group-hover:text-indigo-700 transition"></i>
                    </div>
                `;
        container.appendChild(div);
    });
    window.safeCreateIcons();
};

window.deleteStudySet = function (nodeId) {
    const node = appState.db.nodes.find(n => n.id === nodeId);
    if (node) {
        node.flashcardTest = null;
        node.studyStatus = null;
        node.lastScore = null;
        node.lastReviewed = null;
        node.nextReview = null;
        window.renderStudySets();
        renderGraph();
        window.showToast("Set di studio rimosso.", "info");
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

    window.showLoadingOverlay(true, `Generazione per Ramo in corso (${nodes.length} nodi)...`);
    let successCount = 0;
    for (const n of nodes) {
        try {
            await window.generateFlashcardForNode(n, true);
            if (n.flashcardTest) successCount++;
        } catch (e) { console.error(e); }
    }
    window.showLoadingOverlay(false);
    if (successCount > 0) {
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

    [1, 2, 3].forEach(val => {
        let text = val === 1 ? fc.a1 : (val === 2 ? fc.a2 : fc.a3);
        let btn = document.createElement('div');
        btn.className = "quiz-option";
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
                    <p class="text-indigo-600 animate-pulse font-bold text-sm tracking-wide">Gemini sta elaborando le informazioni...</p>
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

window.parseSimpleMarkdown = function(text) {
    if (!text) return "";
    let html = text;
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');
    html = html.replace(/\n/g, '<br>');
    return html;
}

window.readTextAloud = function(btnElement, textToRead) {
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

window.saveTutorChatTranscript = async function(targetName, role, text) {
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
    } catch(e) {
        console.error("Errore salvataggio transcript:", e);
    }
}

window.resetSidebarTutor = function() {
    tutorState.sidebar.history = [];
    const chatHistory = document.getElementById('sidebar-tutor-chat-history');
    if (chatHistory) {
        const firstMsg = "Ciao! Sono il tuo Tutor AI globale. Come posso aiutarti a studiare questa mappa?";
        chatHistory.innerHTML = `
            <div class="bg-indigo-50 text-indigo-800 p-3 rounded-lg text-sm rounded-tl-none border border-indigo-100 self-start shadow-sm flex items-start gap-2">
                <div class="markdown-body flex-grow"><p>${firstMsg}</p></div>
                <button onclick="window.readTextAloud(this, \`${firstMsg.replace(/'/g, "\\'")}\`)" class="text-indigo-400 hover:text-indigo-600 shrink-0"><i data-lucide="volume-2" class="w-4 h-4"></i></button>
            </div>
        `;
        window.safeCreateIcons();
        window.saveTutorChatTranscript("sidebar", "model", "--- NUOVA SESSIONE GLOBALE ---\n" + firstMsg);
    }
}

window.sendSidebarTutorMessage = async function() {
    const inputEl = document.getElementById('ai-sidebar-input');
    const customQuery = inputEl.value.trim();
    if (!customQuery) return;
    
    inputEl.value = '';
    const chatHistory = document.getElementById('sidebar-tutor-chat-history');
    
    chatHistory.innerHTML += `
        <div class="bg-slate-800 text-white p-3 rounded-lg text-sm rounded-tr-none border border-slate-700 self-end shadow-sm max-w-[90%]">
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
        <div class="bg-indigo-50 text-indigo-800 p-3 rounded-lg text-sm rounded-tl-none border border-indigo-100 self-start shadow-sm max-w-[90%] flex items-start gap-2">
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

window.startNodeTutor = function() {
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
        
        const firstMsg = "Sei in fase di studio o di ragionamento?";
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
        
        window.saveTutorChatTranscript(`nodo_${editTarget.label}`, "model", `--- NUOVA SESSIONE NODO ---\n${firstMsg}`);
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
                if (text.includes("L'utente dice:")) {
                    visibleText = text.split("L'utente dice:")[1].trim();
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

window.sendNodeTutorMessage = async function() {
    if (!editTarget) return;
    const inputEl = document.getElementById('node-tutor-input');
    const customQuery = inputEl.value.trim();
    if (!customQuery) return;
    
    inputEl.value = '';
    const chatHistory = document.getElementById('node-tutor-chat-history');
    
    chatHistory.innerHTML += `
        <div class="bg-slate-800 text-white p-3 rounded-lg text-xs rounded-tr-none border border-slate-700 self-end shadow-sm max-w-[90%]">
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
        contextStr += `FONTI/ESTRATTI DISPONIBILI:\n${editTarget.chunks.map((c, i) => `[Fonte ${i+1}]: ${c}`).join('\n')}\n`;
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
            .sort((a,b)=>b.degree-a.degree);
            
        if (superhubs.length > 0 && superhubs[0].id !== editTarget.id) {
            contextStr += `SUPER-HUB PRINCIPALE DEL GRAFO: ${superhubs[0].label}\n`;
        }
    }
    
    let instruction = "Sei un Tutor Socratico. Rispondi in italiano usando formattazione HTML (<strong>,<p>,<ul>). ";
    if (currentNodeState.phase === 'studio') {
        if (currentNodeState.turns <= 3) {
            instruction += "L'utente è in fase di STUDIO. Accogli le sue domande, adatta la complessità per costruire le basi.";
        } else {
            instruction += "L'utente è in fase di STUDIO (Turno > 3). SWITCH SOCRATICO: poni domande mirate per sollecitarlo a rielaborare autonomamente ciò che ha appreso.";
        }
    } else {
        if (currentNodeState.turns <= 3) {
            instruction += "L'utente è in fase di RAGIONAMENTO. Prendi tu l'iniziativa: fai domande per valutare il suo grado di comprensione e metacomprensione sull'argomento.";
        } else {
            instruction += "L'utente è in fase di RAGIONAMENTO (Turno > 3). Formula un feedback oggettivo e costruttivo (non sicofantico). Proponi piste di ragionamento o punti di vista alternativi per rinforzare l'apprendimento.";
        }
    }
    
    if (!isKG) {
        instruction += " Mappa Mentale: Fai riferimento alla macro-area del nodo.";
    } else {
        instruction += " Knowledge Graph: Proponi nessi logici verso i super-hub e permetti esplorazioni trasversali.";
    }
    
    let apiQuery = customQuery;
    if (currentNodeState.turns === 1) {
        apiQuery = `${contextStr}\n\nL'utente dice: ${customQuery}`;
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

    const prompt = `Crea una singola domanda a risposta multipla basata su questo concetto: "${cleanLabel(currentNode.label)}: ${cleanLabel(currentNode.desc || currentNode.content)}". Fornisci 4 opzioni di cui solo 1 corretta.`;

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
let pomodoroTimeLeft = 25 * 60;
let isPomodoroRunning = false;

window.togglePomodoro = function () {
    const btn = document.getElementById('pomodoro-btn');
    if (isPomodoroRunning) {
        clearInterval(pomodoroInterval);
        isPomodoroRunning = false;
        btn.innerText = "RIPRENDI";
        btn.className = "px-3 py-1.5 bg-amber-50 text-amber-600 text-[10px] uppercase tracking-wider font-bold rounded-lg border border-amber-200 hover:bg-amber-100 transition shadow-sm";
    } else {
        isPomodoroRunning = true;
        btn.innerText = "PAUSA";
        btn.className = "px-3 py-1.5 bg-slate-50 text-slate-600 text-[10px] uppercase tracking-wider font-bold rounded-lg border border-slate-200 hover:bg-slate-100 transition shadow-sm";
        pomodoroInterval = setInterval(() => {
            if (pomodoroTimeLeft > 0) {
                pomodoroTimeLeft--;
                updatePomodoroDisplay();
            } else {
                window.resetPomodoro();
                window.showToast("Tempo scaduto! Fai una pausa.", "success");
            }
        }, 1000);
    }
};

window.resetPomodoro = function () {
    clearInterval(pomodoroInterval);
    isPomodoroRunning = false;
    pomodoroTimeLeft = 25 * 60;
    const btn = document.getElementById('pomodoro-btn');
    btn.innerText = "INIZIA";
    btn.className = "px-3 py-1.5 bg-rose-50 text-rose-600 text-[10px] uppercase tracking-wider font-bold rounded-lg border border-rose-200 hover:bg-rose-100 transition shadow-sm";
    updatePomodoroDisplay();
};

function updatePomodoroDisplay() {
    const m = Math.floor(pomodoroTimeLeft / 60).toString().padStart(2, '0');
    const s = (pomodoroTimeLeft % 60).toString().padStart(2, '0');
    const pTime = document.getElementById('pomodoro-time');
    if (pTime) pTime.innerText = `${m}:${s}`;
}

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
                container.innerHTML = '<p class="text-xs text-slate-400 italic">Nessun progetto salvato in questa App Mapp.AI.</p>';
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

    const lang = localStorage.getItem('mapp_ai_language') || 'it';
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
        localStorage.setItem('mapp_bar_collapsed', 'true');
    } else {
        bar.classList.remove('projects-collapsed');
        bar.style.transform = 'translateY(0)';
        if (icon) icon.style.transform = 'rotate(0deg)';
        if (text) text.textContent = t.hide_projects || 'Nascondi Progetti';
        localStorage.setItem('mapp_bar_collapsed', 'false');
    }
};

// Init bar state
setTimeout(() => {
    if (localStorage.getItem('mapp_bar_collapsed') === 'true') {
        window.toggleProjectsBar(false);
    }
}, 500);

setInterval(() => {
    StorageManager.saveCurrentProject();
}, 120000); // periodic background save just in case

// Aggiungo il gestore lingue per i modali
window.currentLanguage = localStorage.getItem('mapp_language') || 'it';

window.changeLanguage = function (lang) {
    window.currentLanguage = lang;
    localStorage.setItem('mapp_language', lang);
    // Uso i nomi definiti nei file .js caricati
    const t = lang === 'en' ? en_translations : it_translations;

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
        'btn-generate-label': t.new_map_btn,
        'btn-blank-canvas-label': t.btn_blank_canvas_label || "Oppure crea Canvas Vuoto (Manuale)",
        'label-save-folder': t.save_folder,
        'label-ext-guide': t.ext_ai_guide,
        'label-import-json': t.import_json,
        'modal-setup-title': t.modal_config_title,
        'modal-study-title-label': t.modal_study_title,
        'modal-guide-title-label': t.modal_guide_title,
        'label-language-select': lang === 'it' ? 'Lingua:' : 'Language:',
        'label-api-key': t.api_key_label,
        'label-api-key-desc': t.api_key_desc,
        'label-api-key-how': t.api_key_how,
        'label-ai-model': t.ai_model_label,
        'label-refresh-models': t.refresh_models
    };

    for (let id in els) {
        const el = document.getElementById(id);
        if (el) el.innerText = els[id];
    }

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
};

// Add auto-render projects on load
document.addEventListener('DOMContentLoaded', () => {
    // Inizializza Lingua
    window.changeLanguage(window.currentLanguage);

    // Header Buttons
    const btnConfig = document.getElementById('btn-config-ai');
    const btnGuide = document.getElementById('btn-app-guide');
    const btnStudy = document.getElementById('btn-app-tutorial');

    if (btnConfig) btnConfig.addEventListener('click', () => { console.log("Open Config"); window.showConfigAIModal(); });
    if (btnGuide) btnGuide.addEventListener('click', () => { console.log("Open Guide"); window.showAppGuide(); });
    if (btnStudy) btnStudy.addEventListener('click', () => { console.log("Open Study"); window.showAppTutorial(); });

    StorageManager.renderRecentProjects();
    const savedKey = localStorage.getItem('gemini_api_key');
    if (savedKey) {
        const keyInput = document.getElementById('api-key-input');
        if (keyInput) keyInput.value = savedKey;
    }

    // Load saved models on boot
    const savedModelsStr = localStorage.getItem('gemini_available_models');
    const selectEl = document.getElementById('model-select');
    if (savedModelsStr) {
        try {
            const savedModels = JSON.parse(savedModelsStr);
            const currentValue = localStorage.getItem('gemini_selected_model') || 'gemini-2.0-flash';
            renderModelSelect(savedModels, selectEl, currentValue);
        } catch (e) {
            if (selectEl) selectEl.innerHTML = '<option value="">Clicca Aggiorna Modelli</option>';
        }
    } else {
        if (selectEl) selectEl.innerHTML = '<option value="">Clicca Aggiorna Modelli</option>';
    }
});

window.globalQuizQueue = [];

let pendingTopic = null;
window.generateGlobalFlashcards = async function () {
    const apiKey = window.getSystemKey();
    if (!apiKey) { window.showToast("Inserisci API Key.", "error"); return; }

    window.showPrompt("Argomento di ripasso (Opzionale)", "", (topic) => {
        pendingTopic = topic;
        window.openSelectionModal();
    }, "Inserisci un argomento o lascia vuoto per casuale:");
};

window.openSelectionModal = function () {
    const modal = document.getElementById('selection-modal');
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    setTimeout(() => modal.classList.remove('opacity-0'), 10);
    window.safeCreateIcons();
};

window.closeSelectionModal = function () {
    const modal = document.getElementById('selection-modal');
    modal.classList.add('opacity-0');
    setTimeout(() => {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }, 200);
};

window.confirmSelection = async function (count) {
    window.closeSelectionModal();
    let allNodes = appState.db.nodes;
    if (allNodes.length === 0) { window.showToast("Nessun nodo trovato.", "error"); return; }

    let nodesPool = [];
    if (pendingTopic) {
        const lowerTopic = pendingTopic.toLowerCase();
        nodesPool = allNodes.filter(n =>
            n.label.toLowerCase().includes(lowerTopic) ||
            (n.desc || n.content || '').toLowerCase().includes(lowerTopic)
        );
        if (nodesPool.length === 0) {
            window.showToast("Argomento non trovato. Ripasso casuale.", "info");
            nodesPool = allNodes.filter(n => n.level <= 2);
        }
    } else {
        nodesPool = allNodes.filter(n => n.level <= 2);
        if (nodesPool.length === 0) nodesPool = allNodes;
    }

    const selection = nodesPool.sort(() => 0.5 - Math.random()).slice(0, count);
    window.showLoadingOverlay(true, `Generazione sessione da ${count} set in corso...`);

    let successCount = 0;
    for (const n of selection) {
        try {
            await window.generateFlashcardForNode(n, true);
            if (n.flashcardTest) successCount++;
        } catch (e) { console.error(e); }
    }
    window.showLoadingOverlay(false);

    if (successCount > 0) {
        window.globalQuizQueue = selection.filter(n => n.flashcardTest);
        window.playNextGlobalQuiz();
    } else {
        window.showToast("Errore durante la generazione delle flashcard.", "error");
    }
};

window.playNextGlobalQuiz = function () {
    if (window.globalQuizQueue && window.globalQuizQueue.length > 0) {
        const nextNode = window.globalQuizQueue.shift();
        window.openQuizModal(nextNode);
    } else {
        window.showToast("Sessione di ripasso completata!", "success");
    }
};

window.generateGlobalQuiz = async function () {
    await window.generateGlobalFlashcards();
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
const lineHeights = [1.5, 2.0, 3.0];

window.cycleLineHeight = function () {
    currentLineHeightIdx = (currentLineHeightIdx + 1) % lineHeights.length;
    const lh = lineHeights[currentLineHeightIdx];
    document.getElementById('btn-line-height').innerHTML = `<i data-lucide="move-vertical" class="w-3 h-3"></i> INTERLINEA x${lh.toFixed(1)}`;
    const body = document.getElementById('source-modal-body');
    if (body) {
        body.style.lineHeight = lh;
    }
    window.safeCreateIcons();
};

let currentZoomIdx = 0;
const zooms = [1.0, 1.5, 2.0];

window.cycleTextZoom = function () {
    currentZoomIdx = (currentZoomIdx + 1) % zooms.length;
    const z = zooms[currentZoomIdx];

    const label = `Testo x${(z === 1.0 ? '1' : z)}`;
    const btnModal = document.getElementById('btn-text-zoom-modal');
    const btnPanel = document.getElementById('btn-text-zoom-panel');

    if (btnModal) btnModal.innerHTML = `<i data-lucide="zoom-in" class="w-6 h-6"></i>`;
    if (btnPanel) btnPanel.innerHTML = `<i data-lucide="zoom-in" class="w-4 h-4"></i> ${label}`;

    // Imposta la variabile CSS per permettere l'anti-zoom sui bottoni
    document.documentElement.style.setProperty('--app-zoom', z);

    // Applica lo zoom SOLO ai contenitori di testo, non al root HTML
    const mainCard = document.querySelector('.glass-card.max-w-3xl');
    const sourceBody = document.getElementById('source-modal-body');

    if (mainCard) mainCard.style.zoom = z;
    if (sourceBody) sourceBody.style.zoom = z;

    // Ripristina root font size se era stato modificato
    document.documentElement.style.fontSize = '';

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

    const mainCard = document.querySelector('.glass-card.max-w-3xl');
    const body = document.getElementById('source-modal-body');

    if (mainCard) mainCard.style.zoom = '';
    if (body) {
        body.style.lineHeight = '';
        body.style.zoom = '';
    }
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
    window.showLoadingOverlay(true, "Mapp.AI sta leggendo e iniettando i nuovi concetti...");

    try {

        const existingLabels = appState.db.nodes.map(n => n.label.toLowerCase().trim());
        const promptText = `Sei un costruttore di Knowledge Graph di alto livello (SOTA Second Brain). 
Il nodo genitore selezionato per l'espansione è:
ID: "${contextualAITargetNode.id}"
Label: "${contextualAITargetNode.label}"

Nella mappa esistono già questi concetti (EVITA DI CREARE NUOVI NODI PER QUESTI):
[${existingLabels.join(', ')}]

L'utente ti ha fornito questo materiale per espandere il ramo selezionato:
"""
${sourceContent}
"""

Compito:
1. Leggi il materiale ed estrai concetti che siano FIGLI o SOTTO-TEMI di "${contextualAITargetNode.label}".
2. Sii specifico e analitico. Estrai dai 5 ai 15 nuovi concetti se il testo lo permette.
3. Restituisci SOLO un JSON valido con questa struttura:
{
  "nodes": [
    {
      "id": "RAND_ID", 
      "label": "Nome Concetto", 
      "desc": "Descrizione approfondita e didattica (3-4 frasi)", 
      "level": ${contextualAITargetNode.level + 1},
      "group": ${contextualAITargetNode.group || 0}
    }
  ],
  "links": [
    {
      "source": "${contextualAITargetNode.id}", 
      "target": "RAND_ID", 
      "rel": "relazione specifica (es: causa, composto da, esempio di, conseguenza)"
    }
  ]
}

REGOLE MANDATORIE:
- NON includere il nodo genitore "${contextualAITargetNode.id}" nella lista "nodes".
- Tutti i nuovi nodi devono essere collegati tramite "links" al genitore o ad altri nuovi nodi.
- Se un concetto nel testo è già presente nella lista dei concetti esistenti, NON crearlo come nuovo nodo, ma puoi creare un link verso di esso.
- Restituisci SOLO il JSON puro.`;

        const response = await window.fetchModelAPI({
            contents: [{ parts: [{ text: promptText }] }],
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
