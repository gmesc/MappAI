// ==========================================
// UI CANVAS & SIDEBAR — estratto da app.js
// ==========================================
// showLoadingOverlay, layout switch, handleNodeClick, source modal, zoom UI,
// titolo, riordina/salva layout, export/import JSON. Stato D3 (svg/g/simulation/zoom)
// e helper risolti a runtime via scope globale condiviso (mappai-d3-render.js + app.js).
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

/* Scrive il titolo del progetto nella testata della sidebar. UNA funzione, così
   il titolo si mostra sempre nello stesso posto e nello stesso modo.
   ⚠️ Prima la rinomina RICOSTRUIVA il markup del contenitore, con classi e corpo
   diversi da quelli di `index.html` (10px monospaziati e il prefisso «Progetto:»):
   dopo una rinomina la testata cambiava aspetto e prendeva un'etichetta che non
   aveva prima. Qui si scrive il TESTO, non la struttura. */
window.setSidebarProjectTitle = function (titolo) {
    const t = String(titolo == null ? '' : titolo).trim() || 'Mappa Senza Nome';
    const el = document.getElementById('sidebar-subtitle');
    if (el) el.textContent = t;
    /* il titolo è tagliato a tre righe: quello intero vive nel suggerimento */
    const box = document.getElementById('project-title-container');
    if (box) box.setAttribute('title', t + ' — clicca per rinominarlo');
};

window.startEditingTitle = function () {
    const currentTitle = appState.rootNodeLabel || 'Mappa Senza Nome';

    window.showPrompt("Modifica nome del progetto:", currentTitle, (newTitle) => {
        /* Il titolo diventa il nome della cartella del vault: si ripulisce con la
           STESSA regola della generazione (`mappai-files-core.js`), o da qui si
           potrebbe rientrare un «Il Clima.pdf» che di là è vietato. */
        const FC = window.MappAIFilesCore;
        const pulito = FC && FC.titoloProgetto ? FC.titoloProgetto(newTitle, '') : String(newTitle || '').trim();
        if (!pulito) {
            if (newTitle) window.showToast(window.t('tst_root_symbols',
                "Il nome del nodo centrale non può essere fatto solo di simboli: diventa anche il nome della cartella."), "error");
            return;
        }
        if (pulito === currentTitle) return;

        appState.rootNodeLabel = pulito;
        window.setSidebarProjectTitle(pulito);

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

        window.showToast(window.t('tst_title_saved', "Titolo aggiornato e salvato"), "success");
    }, "Inserisci il nuovo nome da assegnare al progetto:");
};

/* `role="button"` senza tastiera è un bottone finto: Invio e Spazio devono
   aprire la rinomina come il clic. */
document.addEventListener('keydown', function (e) {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const box = e.target && e.target.closest && e.target.closest('#project-title-container');
    if (!box) return;
    e.preventDefault();
    window.startEditingTitle();
});

/* ── LA MAPPA È PRONTA (14/8) ────────────────────────────────────────────
   Fine generazione. Prima si passava SEMPRE al canvas: chi nel frattempo era
   andato a lavorare in INSEGNA si vedeva strappare la schermata sotto le mani —
   ed è il contrario di «lavora pure mentre genero».
   Regola: se sei ancora dov'eri (nessuna console aperta), il salto è giusto,
   perché stai guardando il velo aspettando la mappa. Se ti sei spostato, la
   mappa NON si prende la scena: si avvisa, e il progetto resta marcato NUOVO
   negli elenchi finché non lo apri.
   Ritorna `true` se è passata al canvas — chi chiama disegna il grafo solo
   allora (disegnarlo dentro una vista nascosta è lavoro buttato). */
window.mappaPronta = function () {
    /* ⚠️ Una console si guarda per DISPLAY, non per presenza nel DOM: un
       riquadro rimasto nascosto direbbe «sono altrove» per sempre, e la mappa
       non passerebbe mai al canvas (stessa cura della guardia degli strumenti
       compensativi). */
    var aperta = false;
    try {
        document.querySelectorAll('.mm-box--console').forEach(function (b) {
            if (getComputedStyle(b).display !== 'none') aperta = true;
        });
    } catch (e) { aperta = false; }
    if (!aperta) { window.switchToMapLayout(); return true; }
    var nome = (appState && appState.rootNodeLabel) || '';
    if (window.showToast) {
        window.showToast(nome
            ? (window.t('tst_mappa_pronta_nome', 'Il progetto «') + nome + window.t('tst_mappa_pronta_fine', '» è pronto: lo trovi negli elenchi, marcato NUOVO.'))
            : window.t('tst_mappa_pronta', 'Il progetto è pronto: lo trovi negli elenchi, marcato NUOVO.'), 'success');
    }
    return false;
};

window.switchToMapLayout = function () {
    document.getElementById('landing-view').style.display = 'none';
    const mapView = document.getElementById('map-view');
    mapView.classList.add('active');
    window.setSidebarProjectTitle(appState.rootNodeLabel);

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
        // Reset slider al massimo di default. La scritta la scrive
        // `aggiornaScrittaLivelli`: tre posti che la componevano a mano
        // dicevano «L5» dove ora si legge «tutti» (16/8).
        const ls = document.getElementById('level-slider');
        if (ls) { ls.value = ls.max || 5; }
        if (window.aggiornaScrittaLivelli) window.aggiornaScrittaLivelli();
    } else {
        if (levelControl) levelControl.classList.add('hidden');
        if (minLinkControl) minLinkControl.classList.remove('hidden');
        if (sliderDivider) sliderDivider.classList.remove('hidden');
    }
    if (window.applyTextZoom) window.applyTextZoom(currentZoomIdx);
}

window.backToLanding = function () {
    /* ⚠️ Qui sotto c'è un `location.reload()`: durante una generazione sarebbe
       un'uccisione silenziosa, coi token già spesi e niente salvato. È la porta
       che il lucchetto NON copriva (14/8) — `mappaiOccupato` si chiedeva prima
       di CARICARE una mappa, e tornare alla landing non carica niente: butta
       via tutto. */
    if (window.mappaiOccupato && window.mappaiOccupato()) return;
    // Studio attivo in corso = mappa smontata dall'esercizio (link/livelli
    // alterati): ripristina lo snapshot PRIMA di salvare, altrimenti il reload
    // rende permanente lo stato dell'esercizio e la gerarchia è persa.
    if (window.ActiveStudy && window.ActiveStudy.emergencyExit) window.ActiveStudy.emergencyExit();
    // Vista studio (1/8): smonta l'overlay e riporta il ciclo al default —
    // senza, cambiando mappa o tornando alla home l'overlay resterebbe orfano
    // sopra il canvas nuovo e layoutMode 'studio' verrebbe persistito.
    if (window.MappAIStudioView && appState.layoutMode === 'studio') {
        window.MappAIStudioView.exit();
        appState.layoutMode = 'default';
    }
    StorageManager.saveCurrentProject();
    /* USCIRE dalla mappa scrive anche il VAULT (15/8): il vault si riscriveva
       solo a fine generazione o nei salvataggi espliciti — i nodi spostati a
       mano vivevano solo nello snapshot di QUESTO computer, e con lo snapshot
       viaggia... niente. Il reload ucciderebbe l'IPC in volo: si aspetta, con
       un tetto — la HOME non deve poter restare appesa a un disco lento. */
    var _vai = function () { window.location.reload(); };
    if (appState.activeVaultPath && window.electronAPI && window.electronAPI.saveVault && window.buildVaultMapData) {
        Promise.race([
            window.electronAPI.saveVault({ folderPath: appState.activeVaultPath, mapData: window.buildVaultMapData() }),
            new Promise(function (r) { setTimeout(r, 4000); })
        ]).then(_vai, _vai);
    } else _vai();
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
                        const src = linkingState.sourceNode;
                        const link = { source: src.id, target: d.id, rel: rel };
                        if (bidir) link.bidirectional = true;
                        const create = () => { appState.db.links.push(link); window.updateDegreeStats(); renderGraph(); };
                        // JIGSAW: un link fra rami diversi è un PONTE inter-area → chiedi giustificazione.
                        if (window.MappAIJigsaw && window.MappAIJigsaw.isBridgeLink(src, d)) {
                            window.MappAIJigsaw.finalizeBridge(link, src, d, create);
                        } else {
                            create();
                        }
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
                        <div id="node-tutor-modes" class="flex flex-wrap gap-1 mb-2"></div>
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
                window.showToast(window.t('tst_apertus_no_kg', 'Apertus non supporta KG — cambiato a {x}').replace('{x}', selectEl.options[bestIdx].text), 'info');
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
        window.showToast(window.t('tst_layout_recalc', "Layout ricalcolato"), "success");
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

    window.showToast(window.t('tst_layout_snapshot', "Layout Salvato (Snapshot creato)!"), "success");
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
            window.showToast(window.t('tst_folder_error', "Errore apertura cartella"), "error");
        }
    } else {
        window.showToast(window.t('tst_desktop_only', "Funzione disponibile solo nell'app Desktop."), "error");
    }
};

window.importGraph = function (event) {
    /* ⚠️ Non si cambia mappa mentre la pipeline lavora (13/8): i suoi passi
       leggono `appState` mentre scrivono in una cartella fissata all'inizio —
       caricarne un'altra farebbe finire i materiali della mappa nuova nel vault
       della vecchia, in silenzio. Il velo copre la sola area di CREA apposta,
       per lasciar GIRARE per l'app: guardare sì, sostituire no. */
    if (window.mappaiOccupato && window.mappaiOccupato()) return ;
    // La mappa sta per essere sostituita: chiudi un'eventuale sessione di
    // Studio attivo (ripristino snapshot) prima che lo snapshot punti a nodi morti.
    if (window.ActiveStudy && window.ActiveStudy.emergencyExit) window.ActiveStudy.emergencyExit();
    // Vista studio (1/8): smonta l'overlay e riporta il ciclo al default —
    // senza, cambiando mappa o tornando alla home l'overlay resterebbe orfano
    // sopra il canvas nuovo e layoutMode 'studio' verrebbe persistito.
    if (window.MappAIStudioView && appState.layoutMode === 'studio') {
        window.MappAIStudioView.exit();
        appState.layoutMode = 'default';
    }
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
            // Mappa nuova = chat nuove (mai ereditare quelle della mappa precedente)
            window.setTutorState(data.tutorState || null);
            // Reset D3 simulation so it's recreated fresh
            simulation = null;
            window.switchToMapLayout();
            initD3Visualization();
        } catch (err) { window.showAlert("Errore", "Errore importazione: " + err.message); }
        event.target.value = '';
    };
    reader.readAsText(file);
}
