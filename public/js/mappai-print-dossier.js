// ==========================================
// STAMPA: NOTE MD, ETICHETTE, DOSSIER PDF — estratto da app.js
// ==========================================
// Caricato DOPO app.js: appState e gli helper (window.* e bare) si risolvono
// a runtime via scope lessicale globale condiviso.
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

// openTimelineView → mappai-timeline.js
// openGlossaryView → mappai-glossary.js

window.openNodeLabelsPrintModal = function () {
    const allNodes = appState.db.nodes || [];
    if (allNodes.length === 0) {
        window.showToast('Genera prima una mappa', 'warning');
        return;
    }

    const existingModal = document.getElementById('node-labels-print-modal');
    if (existingModal) existingModal.remove();

    // Calcola i livelli presenti e il conteggio nodi per livello
    const levelCounts = {};
    allNodes.forEach(function (n) {
        const lv = n.level || 0;
        levelCounts[lv] = (levelCounts[lv] || 0) + 1;
    });
    const maxLevelPresent = Math.max(...Object.keys(levelCounts).map(Number));
    const mapName = appState.db?.rootNodeLabel || appState.rootNodeLabel || 'Progetto MappAI';

    // Toggle "Taratura AI" — solo con contesto SPECIALE (pallino verde). Tara le
    // PAROLE CHIAVE AI (layout «Titolo + parole chiave»); il file avrà [VERDE].
    var _nlSpecial = !!(window.MappAITune && window.MappAITune.isSpecialActive && window.MappAITune.isSpecialActive());
    var _nlCtx = ((window.MappAITune && window.MappAITune.activeContextName) ? window.MappAITune.activeContextName() : '').replace(/[<>&]/g, '');
    // Riga-toggle (dentro il box «Opzioni PDF»); pm-option-toggle = riga compatta
    var nlTuneRow = _nlSpecial ?
        ('<label style="display:flex;align-items:center;gap:8px;cursor:pointer;padding:7px 0;font-size:13.5px;font-weight:700;color:#334155" title="' + window.t('bs_tune_tip_kw', 'Tara le parole chiave AI sul profilo del contesto attivo (solo layout «Titolo + parole chiave»). Il file avrà il suffisso [VERDE].') + '">' +
            '<input type="checkbox" id="nl-tune-toggle" style="width:16px;height:16px;accent-color:#16a34a;flex:0 0 auto">' +
            '<span>' + window.t('bs_tune_label', 'Taratura AI') + ' · <span style="color:#16a34a;font-weight:800">' + _nlCtx + '</span></span>' +
        '</label>') : '';

    // Costruisci le opzioni di livello (tutte + singoli livelli)
    function countUpTo(maxLv) {
        return allNodes.filter(function (n) { return (n.level || 0) <= maxLv; }).length;
    }

    var levelOptions = '<label class="pm-option">' +
        '<input type="radio" name="nl-depth" value="all" checked class="mt-0.5 accent-indigo-600 cursor-pointer">' +
        '<div><div class="pm-option-label">Tutti i livelli</div>' +
        '<div class="pm-option-desc">' + allNodes.length + ' etichette</div></div>' +
        '</label>';

    for (var lv = 1; lv <= maxLevelPresent; lv++) {
        var count = countUpTo(lv);
        levelOptions += '<label class="pm-option">' +
            '<input type="radio" name="nl-depth" value="' + lv + '" class="mt-0.5 accent-indigo-600 cursor-pointer">' +
            '<div><div class="pm-option-label">Fino al Livello ' + lv + '</div>' +
            '<div class="pm-option-desc">' + count + ' etichette</div></div>' +
            '</label>';
    }

    var modal = document.createElement('div');
    modal.id = 'node-labels-print-modal';
    modal.className = 'fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-[3000] flex items-center justify-center p-4';

    modal.innerHTML =
        '<div class="bg-white rounded-2xl shadow-2xl w-[90vw] max-w-[880px] max-h-[90vh] flex flex-col relative">' +

            '<button type="button" onclick="document.getElementById(\'node-labels-print-modal\').remove()" ' +
                'class="absolute top-6 right-6 text-slate-400 hover:text-slate-600 transition-colors z-10">' +
                '<i data-lucide="x" class="w-6 h-6"></i>' +
            '</button>' +

            '<div class="overflow-y-auto p-8 space-y-6">' +

                '<div class="flex items-center gap-3">' +
                    '<div class="pm-icon-wrap">' +
                        '<i data-lucide="scissors" class="w-5 h-5 text-indigo-600"></i>' +
                    '</div>' +
                    '<div>' +
                        '<div class="pm-title">Foglio Nodi</div>' +
                        '<div class="pm-subtitle">' + mapName + '</div>' +
                    '</div>' +
                '</div>' +

                '<p class="pm-body-text">' +
                    'Genera un foglio PDF ritagliabile con le etichette dei nodi della mappa. ' +
                    'Scegli fino a che livello di profondità includere.<br>' +
                    '<span style="color:#64748b">' +
                    window.t('ns_hint_editor', 'Per decidere il contenuto card per card (e correggere i testi prima di stampare): ELABORA → Documenti → Foglio dei nodi.') +
                    '</span>' +
                '</p>' +

                '<div class="grid grid-cols-1 md:grid-cols-3 gap-4 items-start">' +

                '<div class="pm-section">' +
                    '<span class="pm-section-title">Profondità</span>' +
                    '<div class="space-y-3">' + levelOptions + '</div>' +
                '</div>' +

                '<div class="pm-section">' +
                    '<span class="pm-section-title">Formato foglio</span>' +
                    '<div class="space-y-3">' +
                        '<label class="pm-option">' +
                            '<input type="radio" name="nl-fmt" value="3x4" checked onchange="window._nlSyncContentLock()" class="mt-0.5 accent-indigo-600 cursor-pointer">' +
                            '<div><div class="pm-option-label">3 × 4 · 12 per foglio</div>' +
                            '<div class="pm-option-desc">Etichette piccole · solo titolo</div></div>' +
                        '</label>' +
                        '<label class="pm-option">' +
                            '<input type="radio" name="nl-fmt" value="2x2" onchange="window._nlSyncContentLock()" class="mt-0.5 accent-indigo-600 cursor-pointer">' +
                            '<div><div class="pm-option-label">2 × 2 · 4 per foglio</div>' +
                            '<div class="pm-option-desc">Etichette grandi · contenuto a scelta</div></div>' +
                        '</label>' +
                        '<label class="pm-option">' +
                            '<input type="radio" name="nl-fmt" value="2x1" onchange="window._nlSyncContentLock()" class="mt-0.5 accent-indigo-600 cursor-pointer">' +
                            '<div><div class="pm-option-label">2 × 1 · 2 per foglio</div>' +
                            '<div class="pm-option-desc">Etichette molto grandi · contenuto a scelta</div></div>' +
                        '</label>' +
                    '</div>' +
                '</div>' +

                '<div class="pm-section">' +
                    '<span class="pm-section-title">Contenuto etichetta</span>' +
                    '<div class="space-y-3">' +
                        '<label class="pm-option">' +
                            '<input type="radio" name="nl-layout" value="title" checked class="mt-0.5 accent-indigo-600 cursor-pointer">' +
                            '<div><div class="pm-option-label">Solo titolo</div>' +
                            '<div class="pm-option-desc">Il nome del nodo, centrato</div></div>' +
                        '</label>' +
                        '<label class="pm-option" data-nl-lock="1">' +
                            '<input type="radio" name="nl-layout" value="summary" class="mt-0.5 accent-indigo-600 cursor-pointer">' +
                            '<div><div class="pm-option-label">Titolo + spazio riassunto</div>' +
                            '<div class="pm-option-desc">Titolo in alto, spazio sotto per scrivere a mano keyword o frasi</div></div>' +
                        '</label>' +
                        '<label class="pm-option" data-nl-lock="1">' +
                            '<input type="radio" name="nl-layout" value="keywords" class="mt-0.5 accent-indigo-600 cursor-pointer">' +
                            '<div><div class="pm-option-label">Titolo + parole chiave</div>' +
                            '<div class="pm-option-desc">Titolo in alto + fino a 7 keyword AI (una per riga)</div></div>' +
                        '</label>' +
                        '<label class="pm-option" data-nl-lock="1">' +
                            '<input type="radio" name="nl-layout" value="card" class="mt-0.5 accent-indigo-600 cursor-pointer">' +
                            '<div><div class="pm-option-label">Scheda: titolo + descrizione</div>' +
                            '<div class="pm-option-desc">Descrizione del nodo giustificata, sillabata, con concetti in grassetto</div></div>' +
                        '</label>' +
                        '<div class="pm-option-desc" style="margin-top:6px;font-style:italic">Riassunto, parole chiave e scheda solo con formato 2 × 2 o 2 × 1.</div>' +
                    '</div>' +
                '</div>' +

                '</div>' +

                // Impostazioni pagina + opzioni PDF affiancate (meno box sciolti)
                '<div class="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">' +
                    '<div class="pm-section">' +
                        '<span class="pm-section-title">Sfondo pagina</span>' +
                        '<div class="space-y-3">' +
                            '<label class="pm-option">' +
                                '<input type="radio" name="nl-bg" value="none" checked class="mt-0.5 accent-indigo-600 cursor-pointer">' +
                                '<div><div class="pm-option-label">Nessuno sfondo</div>' +
                                '<div class="pm-option-desc">Pagina bianca</div></div>' +
                            '</label>' +
                            '<label class="pm-option">' +
                                '<input type="radio" name="nl-bg" value="grid" class="mt-0.5 accent-indigo-600 cursor-pointer">' +
                                '<div><div class="pm-option-label">Griglia a quadretti 5 mm</div>' +
                                '<div class="pm-option-desc">Linee cyan tenui (0,3 mm) su tutta la pagina</div></div>' +
                            '</label>' +
                        '</div>' +
                    '</div>' +
                    '<div class="pm-section">' +
                        '<span class="pm-section-title">Opzioni PDF</span>' +
                        '<div class="space-y-1">' +
                            nlTuneRow +
                            '<label style="display:flex;align-items:center;gap:8px;cursor:pointer;padding:7px 0;font-size:13.5px;font-weight:700;color:#334155" title="' + window.t('cc_nl_tip', 'Aggiunge in coda al PDF le pagine «Catena dei perché»: i nessi causa-effetto della mappa (dai link e dalle descrizioni, senza AI).') + '">' +
                                '<input type="checkbox" id="nl-causal-toggle" style="width:16px;height:16px;accent-color:#4f46e5;flex:0 0 auto">' +
                                '<span>' + window.t('cc_nl_toggle', 'Includi «Catena dei perché»') + '</span>' +
                            '</label>' +
                            (_nlSpecial ? '' : '<div class="pm-option-desc" style="margin-top:4px">Aggiunge in coda i nessi causa-effetto della mappa.</div>') +
                        '</div>' +
                    '</div>' +
                '</div>' +

            '</div>' +   // fine area scrollabile

            // Footer FISSO (fuori dallo scroll): i bottoni restano sempre visibili
            '<div class="flex gap-3 p-6 border-t border-slate-100 bg-white rounded-b-2xl">' +
                '<button type="button" onclick="document.getElementById(\'node-labels-print-modal\').remove()" ' +
                    'class="pm-btn-cancel">Annulla</button>' +
                '<button type="button" onclick="window.printAllNodeLabels()" ' +
                    'class="pm-btn-primary">' +
                    '<i data-lucide="printer" class="w-4 h-4"></i> Genera PDF' +
                '</button>' +
            '</div>' +
        '</div>';

    document.body.appendChild(modal);
    if (typeof window.safeCreateIcons === 'function') window.safeCreateIcons();
    window._nlSyncContentLock();

    var escHandler = function (e) {
        if (e.key === 'Escape') {
            modal.remove();
            document.removeEventListener('keydown', escHandler);
        }
    };
    document.addEventListener('keydown', escHandler);
};

// Blocca "riassunto" e "keyword" quando il formato è 3×4 (solo titolo);
// li sblocca su 2×2 / 2×1. Chiamata all'apertura e a ogni cambio formato.
window._nlSyncContentLock = function () {
    var fmtEl = document.querySelector('input[name="nl-fmt"]:checked');
    var locked = !fmtEl || fmtEl.value === '3x4';
    var titleInp = document.querySelector('input[name="nl-layout"][value="title"]');
    document.querySelectorAll('#node-labels-print-modal label[data-nl-lock]').forEach(function (lbl) {
        var inp = lbl.querySelector('input');
        if (!inp) return;
        inp.disabled = locked;
        lbl.style.opacity = locked ? '0.4' : '1';
        lbl.style.pointerEvents = locked ? 'none' : 'auto';
        lbl.style.cursor = locked ? 'not-allowed' : 'pointer';
        if (locked && inp.checked && titleInp) titleInp.checked = true;
    });
};

// Parametrica: le 6 opzioni oggi lette dal DOM (nl-depth/fmt/layout/bg/tune/causal)
// diventano campi di `opts` con il DOM come FALLBACK → il modale la chiama senza
// argomenti (comportamento invariato); la pipeline la chiama con opzioni esplicite.
//   opts = { depth:'all'|number, fmt:'3x4'|'2x2'|'2x1', layout:'title'|'summary'|
//            'keywords'|'card', bg:'none'|'grid', tuned:bool, causal:bool,
//            toDisk:{vaultPath},
//            cards:[{id,label,layout,keywords[],desc}] }
// `cards` = foglio RIVISTO dall'editor (ELABORA → Documenti): ogni card porta il
// PROPRIO tipo di contenuto, il proprio titolo e i propri testi. Quando c'è,
// sostituisce depth/layout e la generazione AI delle parole chiave (già decise
// dal docente); il resto del motore — griglia, tratteggio, sfondo — è lo stesso.
// Ritorna Promise<{ ok, base64?, fileName }>. Con toDisk: niente doc.save/archivio/toast.
window.printAllNodeLabels = async function (opts) {
    opts = opts || {};
    // Livello massimo (depth): opts poi radio nl-depth, default 'all'.
    var depthVal = (opts.depth != null) ? opts.depth
        : (function () { var el = document.querySelector('input[name="nl-depth"]:checked'); return el ? el.value : 'all'; })();
    var maxLevel = (depthVal !== 'all' && depthVal != null) ? parseInt(depthVal, 10) : null;
    if (isNaN(maxLevel)) maxLevel = null;

    // Formato foglio (colonne × righe) e contenuto della card (title | summary | keywords).
    // ⚠️ Il foglio dei nodi ha misure PROPRIE e resta indipendente dal foglio
    // flashcard (mappai-print-layout.js): non condividono nulla di proposito.
    // Le misure vivono nel core del foglio nodi (mappai-nodesheet-core.js), così
    // l'editor mostra le stesse soglie che il PDF rispetta; se il core manca, i
    // numeri storici qui sotto restano il fallback.
    var NS = window.MappAINodeSheet || null;
    var FMT = { '3x4': { cols: 3, rows: 4 }, '2x2': { cols: 2, rows: 2 }, '2x1': { cols: 2, rows: 1 } };
    var fmtVal = opts.fmt
        || (function () { var el = document.querySelector('input[name="nl-fmt"]:checked'); return el ? el.value : '3x4'; })();
    var fmt = FMT[fmtVal] ? fmtVal : '3x4';
    var cols = FMT[fmt].cols;
    var rowsPerPage = FMT[fmt].rows;
    var layout = opts.layout
        || (function () { var el = document.querySelector('input[name="nl-layout"]:checked'); return el ? el.value : 'title'; })();
    if (fmt === '3x4') layout = 'title'; // 3×4 = solo titolo (vincolo motore)

    // Foglio già rivisto nell'editor: le card decidono da sé cosa mostrano.
    var editedCards = Array.isArray(opts.cards) && opts.cards.length ? opts.cards : null;

    // Sfondo pagina: none | grid (quadretti 5 mm cyan)
    var pageBg = opts.bg
        || (function () { var el = document.querySelector('input[name="nl-bg"]:checked'); return el ? el.value : 'none'; })();

    // Taratura AI (solo se layout keyword)
    var nlTuneOn = (opts.tuned != null) ? !!opts.tuned
        : !!(document.getElementById('nl-tune-toggle') && document.getElementById('nl-tune-toggle').checked);
    var tuned = false;

    // «Catena dei perché»: pagine extra in coda al PDF (deterministico, zero AI)
    var nlCausalOn = (opts.causal != null) ? !!opts.causal
        : !!(document.getElementById('nl-causal-toggle') && document.getElementById('nl-causal-toggle').checked);

    // toDisk presente → modalità headless (pipeline): niente download/archivio/toast.
    var toDisk = opts.toDisk || null;

    var modal = document.getElementById('node-labels-print-modal');
    if (modal) modal.remove();

    const allNodes = appState.db.nodes || [];
    const nodes = editedCards ? [] : (maxLevel !== null
        ? allNodes.filter(function (n) { return (n.level || 0) <= maxLevel; })
        : allNodes);

    if (!editedCards && nodes.length === 0) {
        if (!toDisk) window.showToast(window.t('tst_no_nodes', "Nessun nodo presente nella mappa."), "warning");
        return { ok: false, error: 'nessun nodo' };
    }

    const projectTitle = appState.db?.rootNodeLabel || appState.rootNodeLabel || "Progetto MappAI";

    // Modalità "keywords": genera le parole chiave con AI (fallback deterministico
    // sui figli/desc se la chiamata fallisce o non c'è una API key)
    var keywordsMap = {};
    if (!editedCards && layout === 'keywords') {
        var kwApiKey = window.getSystemKey ? window.getSystemKey() : '';
        if (kwApiKey) {
            window.showLoadingOverlay(true, 'Genero le parole chiave dei nodi…');
            var _prevArmed = window.MappAITune ? window.MappAITune.armed : false;
            if (window.MappAITune) window.MappAITune.armed = nlTuneOn;
            try {
                keywordsMap = await _generateNodeKeywords(nodes, kwApiKey) || {};
                tuned = nlTuneOn; // keyword generate con taratura → file [VERDE]
            } catch (kwErr) {
                console.warn('[Labels] Generazione keyword AI fallita, uso fallback:', kwErr);
            } finally {
                if (window.MappAITune) window.MappAITune.armed = _prevArmed;
            }
            window.showLoadingOverlay(false);
        }
        // Riempi i buchi (nodi saltati dall'AI o AI non disponibile) col fallback
        nodes.forEach(function (n) {
            var kw = keywordsMap[n.id];
            if (!Array.isArray(kw) || kw.length === 0) keywordsMap[n.id] = _fallbackKeywords(n);
        });
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({
        orientation: 'landscape',
        unit: 'mm',
        format: 'a4'
    });

    let fontName = "courier";
    try {
        // Il carattere dell'app, vendorizzato → offline, zero fetch.
        const _fn = (window.MappAIFont && window.MappAIFont.registraIn)
            ? await window.MappAIFont.registraIn(doc) : null;
        if (_fn) {
            fontName = _fn;
        } else if (window.MappAISpaceMono && window.MappAISpaceMono.registerInto(doc)) {
            fontName = "Space Mono";
        } else {
            // Fallback storico: scarica da GitHub se il modulo non è caricato.
            const base = 'https://raw.githubusercontent.com/googlefonts/spacemono/main/fonts/ttf/';
            const [regRes, boldRes] = await Promise.all([
                fetch(base + 'SpaceMono-Regular.ttf').then(res => res.arrayBuffer()),
                fetch(base + 'SpaceMono-Bold.ttf').then(res => res.arrayBuffer())
            ]);
            const arrayBufferToBase64 = (buffer) => {
                let binary = '';
                const bytes = new Uint8Array(buffer);
                for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
                return window.btoa(binary);
            };
            doc.addFileToVFS('SpaceMono-Regular.ttf', arrayBufferToBase64(regRes));
            doc.addFont('SpaceMono-Regular.ttf', 'Space Mono', 'normal');
            doc.addFileToVFS('SpaceMono-Bold.ttf', arrayBufferToBase64(boldRes));
            doc.addFont('SpaceMono-Bold.ttf', 'Space Mono', 'bold');
            fontName = "Space Mono";
        }
    } catch (err) {
        console.warn("Impossibile caricare Space Mono, uso Courier come fallback:", err);
    }

    // Geometria: le card riempiono la pagina secondo il formato (colonne × righe).
    const G = NS ? NS.geom(fmt) : null;
    const marginX = G ? G.marginX : 10;
    const marginY = G ? G.marginY : 15;
    const pageWidth = G ? G.pageW : 297;
    const pageHeight = G ? G.pageH : 210;

    const colWidth = (pageWidth - 2 * marginX) / cols;
    const rowHeight = (pageHeight - 2 * marginY) / rowsPerPage;
    const PT2MM = 0.352778;
    const padX = G ? G.padX : 4;

    // Font per formato (card più grande = titolo/keyword più grandi)
    // Titoli in grassetto e +2pt rispetto alla versione base.
    const TITLE_PT = G ? G.titlePt : (({ '3x4': 22, '2x2': 28, '2x1': 32 })[fmt] || 22);
    const KW_PT = G ? G.kwPt : (({ '2x2': 13, '2x1': 15 })[fmt] || 12);
    const CARD_DESC_PT = G ? G.descPt : (({ '2x2': 11, '2x1': 13 })[fmt] || 11); // corpo desc scheda

    // Sfondo pagina: griglia a quadretti 5 mm, linee 0,3 mm cyan al 10%
    function drawPageGrid() {
        if (pageBg !== 'grid') return;
        const step = 5;
        let useG = false;
        try {
            if (doc.GState && doc.setGState) { doc.setGState(new doc.GState({ 'stroke-opacity': 0.1 })); useG = true; }
        } catch (e) { useG = false; }
        // con GState = cyan puro al 10%; senza = cyan pre-miscelato al 10% su bianco
        if (useG) doc.setDrawColor(0, 255, 255); else doc.setDrawColor(230, 255, 255);
        doc.setLineWidth(0.3);
        if (typeof doc.setLineDashPattern === 'function') doc.setLineDashPattern([], 0);
        for (let gx = 0; gx <= pageWidth + 0.01; gx += step) doc.line(gx, 0, gx, pageHeight);
        for (let gy = 0; gy <= pageHeight + 0.01; gy += step) doc.line(0, gy, pageWidth, gy);
        if (useG) { try { doc.setGState(new doc.GState({ 'stroke-opacity': 1 })); } catch (e) {} }
    }

    // Una VOCE per card stampata: dal foglio rivisto (ogni card col suo tipo di
    // contenuto) oppure dai nodi con il tipo scelto una volta per tutte nel modale.
    const nodeById = {};
    allNodes.forEach(function (n) { nodeById[n.id] = n; });
    const entries = editedCards
        ? editedCards.map(function (c) {
            const n = nodeById[c.id] || { id: c.id, label: c.label, desc: c.desc || '' };
            const lay = (fmt === '3x4') ? 'title' : String(c.layout || 'title');
            return {
                node: n,
                label: String(c.label != null ? c.label : cleanLabel(n.label)).trim(),
                layout: lay,
                keywords: Array.isArray(c.keywords) ? c.keywords : [],
                desc: String(c.desc || '')
            };
        })
        : nodes.map(function (n) {
            return {
                node: n,
                label: cleanLabel(n.label),
                layout: layout,
                keywords: keywordsMap[n.id] || [],
                desc: String(n.desc || n.content || '').trim()
            };
        });

    let currentNodeIndex = 0;

    while (currentNodeIndex < entries.length) {
        if (currentNodeIndex > 0) {
            doc.addPage();
        }
        drawPageGrid(); // sfondo prima delle card

        for (let r = 0; r < rowsPerPage; r++) {
            for (let c = 0; c < cols; c++) {
                if (currentNodeIndex >= entries.length) break;

                const entry = entries[currentNodeIndex];
                const node = entry.node;
                const cardLayout = entry.layout;
                currentNodeIndex++;

                const x = marginX + c * colWidth;
                const y = marginY + r * rowHeight;

                // Card con bordo tratteggiato ARANCIONE per il ritaglio
                doc.setDrawColor(255, 138, 0);
                doc.setLineWidth(0.3);
                if (typeof doc.setLineDashPattern === 'function') {
                    doc.setLineDashPattern([1, 1], 0);
                }
                doc.roundedRect(x, y, colWidth, rowHeight, 3, 3, 'D');

                if (typeof doc.setLineDashPattern === 'function') {
                    doc.setLineDashPattern([], 0);
                }

                const labelText = entry.label;
                doc.setTextColor(0, 0, 0);
                const maxTextWidth = colWidth - 2 * padX;

                if (cardLayout === 'title') {
                    // Titolo centrato verticalmente nella card (grassetto)
                    doc.setFont(fontName, "bold");
                    doc.setFontSize(TITLE_PT);
                    const lines = doc.splitTextToSize(labelText, maxTextWidth);
                    const fontHeight = TITLE_PT * PT2MM;
                    const lineHeight = fontHeight * 1.3;
                    const totalTextHeight = lines.length * lineHeight;
                    let currentY = y + (rowHeight - totalTextHeight) / 2 + fontHeight - (lineHeight - fontHeight) / 2;
                    lines.forEach(function (line) {
                        doc.text(line, x + colWidth / 2, currentY, { align: 'center' });
                        currentY += lineHeight;
                    });
                } else if (cardLayout === 'card') {
                    // "card": titolo + descrizione giustificata, sillabata, con
                    // concetti in grassetto, margini 4 mm dal taglio.
                    // Il GRUPPO titolo+descrizione è centrato in verticale: una
                    // descrizione di una riga sta al centro della card, e il blocco
                    // cresce verso l'alto e verso il basso man mano che si allunga.
                    const CARD_TITLE_PT = G ? G.cardTitlePt : (({ '2x2': 20, '2x1': 24 })[fmt] || 20);
                    const boxLeft = x + 4;
                    const boxW = colWidth - 8;
                    doc.setFont(fontName, "bold");
                    doc.setFontSize(CARD_TITLE_PT);
                    const cTitleFH = CARD_TITLE_PT * PT2MM;
                    const cTitleLH = cTitleFH * 1.2;
                    const cTitleLines = doc.splitTextToSize(labelText, boxW).slice(0, 3);
                    // Altezza del blocco titolo come nella resa storica: la prima
                    // linea di base sta un corpo sotto il bordo alto, poi un'interlinea
                    // per riga.
                    const cTitleH = cTitleFH + cTitleLines.length * cTitleLH;
                    const descText = String(entry.desc || node.desc || node.content || '').trim();
                    const CARD_GAP = 1.5;
                    // Quanto è alta davvero la descrizione: la misuriamo con lo stesso
                    // impaginatore che poi la disegna (a vuoto), così il centraggio
                    // non è una stima.
                    const availDesc = rowHeight - 8 - cTitleH - CARD_GAP;
                    const descH = descText
                        ? _drawJustifiedDesc(doc, descText, boxLeft, 0, boxW, availDesc, fontName, CARD_DESC_PT, null, { measureOnly: true })
                        : 0;
                    const blockH = cTitleH + (descH ? CARD_GAP + descH : 0);
                    // Se il blocco è più alto della card, si riparte dall'alto: meglio
                    // tagliato in fondo che tagliato in testa.
                    const top = y + Math.max(4, (rowHeight - blockH) / 2);
                    doc.setFont(fontName, "bold");
                    doc.setFontSize(CARD_TITLE_PT);
                    let cty = top + cTitleFH;
                    cTitleLines.forEach(function (line) {
                        doc.text(line, boxLeft, cty, { align: 'left' });
                        cty += cTitleLH;
                    });
                    if (descText && descH) {
                        doc.setTextColor(30, 30, 30);
                        _drawJustifiedDesc(doc, descText, boxLeft, top + cTitleH + CARD_GAP, boxW, descH + 0.01, fontName, CARD_DESC_PT, _cardBoldSet(node));
                        doc.setTextColor(0, 0, 0);
                    }
                } else {
                    // "summary" e "keywords": titolo + contenuto sotto.
                    // Il gruppo è CENTRATO in verticale — una sola parola chiave non
                    // deve spingere il titolo in cima alla card lasciando il vuoto
                    // sotto. Con «spazio da scrivere» il blocco riempie la card (le
                    // righe da riempire sono il contenuto), quindi il titolo resta in
                    // alto come prima.
                    doc.setFont(fontName, "bold");
                    doc.setFontSize(TITLE_PT);
                    const titleFH = TITLE_PT * PT2MM;
                    const titleLH = titleFH * 1.25;
                    const titleLines = doc.splitTextToSize(labelText, maxTextWidth).slice(0, 3);
                    const titleH = titleFH + titleLines.length * titleLH;
                    const KW_GAP = 3;
                    const kwFH = KW_PT * PT2MM;
                    const kwLH = kwFH * 1.55;

                    // Le parole chiave si impaginano PRIMA di disegnarle: senza sapere
                    // quante righe occupano non si può centrare il gruppo.
                    let kwLines = [];
                    if (cardLayout === 'keywords') {
                        const maxKwLines = Math.max(0, Math.floor((rowHeight - 8 - titleH - KW_GAP - 3) / kwLH));
                        doc.setFont(fontName, "normal");
                        doc.setFontSize(KW_PT);
                        (entry.keywords || []).slice(0, 7).forEach(function (k) {
                            doc.splitTextToSize(String(k), maxTextWidth).forEach(function (ln) {
                                if (kwLines.length < maxKwLines) kwLines.push(ln);
                            });
                        });
                    }
                    const kwBlockH = kwLines.length * kwLH;
                    const blockH = titleH + (kwBlockH ? KW_GAP + kwBlockH : 0);
                    const top = (cardLayout === 'summary')
                        ? (y + 8)
                        : (y + Math.max(4, (rowHeight - blockH) / 2));

                    doc.setFont(fontName, "bold");
                    doc.setFontSize(TITLE_PT);
                    let ty = top + titleFH;
                    titleLines.forEach(function (line) {
                        doc.text(line, x + colWidth / 2, ty, { align: 'center' });
                        ty += titleLH;
                    });

                    if (cardLayout === 'keywords') {
                        if (kwLines.length) {
                            doc.setFont(fontName, "normal");
                            doc.setFontSize(KW_PT);
                            doc.setTextColor(90, 90, 90);
                            const maxKwBottom = y + rowHeight - 3;
                            ty = top + titleH + KW_GAP + kwFH;
                            for (let li = 0; li < kwLines.length; li++) {
                                if (ty > maxKwBottom) break;
                                doc.text(kwLines[li], x + colWidth / 2, ty, { align: 'center' });
                                ty += kwLH;
                            }
                            doc.setTextColor(0, 0, 0);
                        }
                    } else if (pageBg !== 'grid') {
                        // "summary" senza sfondo a quadretti: righe guida per scrivere a mano
                        doc.setDrawColor(210, 210, 210);
                        doc.setLineWidth(0.1);
                        if (typeof doc.setLineDashPattern === 'function') doc.setLineDashPattern([], 0);
                        const gStep = 8;
                        for (let gy = ty + 3; gy < y + rowHeight - 5; gy += gStep) {
                            doc.line(x + padX, gy, x + colWidth - padX, gy);
                        }
                    }
                }
            }
            if (currentNodeIndex >= entries.length) break;
        }
    }

    // Pagine «Catena dei perché» in coda (opt-in dalla checkbox; zero AI)
    if (nlCausalOn) {
        try {
            const added = window.MappAICausal && window.MappAICausal.appendPdfPages
                && window.MappAICausal.appendPdfPages(doc, fontName);
            if (!added) window.showToast(window.t('cc_empty_pdf', 'Nessun nesso causa-effetto trovato: PDF generato senza pagine catena.'), 'info');
        } catch (ccErr) {
            console.warn('[Labels] Catena dei perché non aggiunta:', ccErr);
        }
    }

    const verde = tuned ? '-[VERDE]' : '';
    // Foglio rivisto nell'editor: le card hanno tipi di contenuto diversi, quindi
    // il nome non può dire «keywords» o «card» — e non deve sovrascrivere il
    // foglio generato in automatico con lo stesso tipo.
    const layoutName = editedCards ? 'rivisto' : layout;

    // Modalità headless (pipeline / «Nel vault» dell'editor): ritorna il PDF come
    // base64, nessun effetto UI. Il nome canonico lo decide l'orchestratore.
    if (toDisk) {
        /* 🐛 17/8: qui la MAPPA non veniva passata, e usciva
           `Foglio-nodi-card -VERDE.pdf` — un nome che non dice a quale mappa
           appartiene. Sono file così che, finiti nella cartella sbagliata, ci
           restano senza che nessuno se ne accorga: nel vault di «Project E» ce
           n'erano quattro di un'altra mappa, dal 30 luglio.
           La forma è quella della PIPELINE (`{mappa, dettaglio}`), non una
           seconda: due compositori dello stesso nome divergono al primo ritocco
           (invariante 6) — ed è già successo con le copie, il 11/8. */

/* Il CARATTERE di questo documento: le @font-face + la variabile --doc-font
   che la regola del `body` legge. Un documento in finestra propria non carica
   style.css, quindi `--app-font` lì non esiste: il blocco va scritto dentro.
   Argomento = la scelta fatta in ELABORA per QUESTO documento; senza, comanda
   il carattere dell'app (18/8/26).
   ⚠️ Sostituisce il <link> a fonts.googleapis.com che stava qui: un foglio
   stampato in aula senza rete perdeva il suo carattere, in silenzio. */
function _fontDoc(id) {
    try {
        return (typeof window !== 'undefined' && window.MappAIFont)
            ? window.MappAIFont.styleDocumento(id) : '';
    } catch (e) { return ''; }
}

        var pipeName = (window.MappAIPipelineCore && window.MappAIPipelineCore.buildFileName)
            ? window.MappAIPipelineCore.buildFileName('nodesheet', null, tuned,
                { mappa: projectTitle, dettaglio: layoutName })
            : ('Foglio-nodi-' + (projectTitle ? projectTitle + '-' : '') + layoutName + verde + '.pdf');
        return { ok: true, base64: doc.output('datauristring'), fileName: pipeName };
    }

    /* Come per le flashcard: se il docente ha appena scelto un nome salvando in
       `Materiale Studio/`, il dialogo di salvataggio propone QUELLO. Senza,
       usciva `Label-<mappa>.pdf` — un nome di famiglia diversa da tutti gli
       altri materiali, e per giunta non quello scelto. */
    const domFileName = opts.fileName ? String(opts.fileName) : (editedCards
        ? `Foglio-nodi-${projectTitle} (rivisto)${verde}.pdf`
        : `Label-${projectTitle}${verde}.pdf`);
    doc.save(domFileName);
    window.showToast(window.t('tst_labels_pdf', "Download PDF delle etichette avviato!"), "success");

    // Archivio documenti (005): il Foglio nodi è un PDF → salvato come data-URI,
    // riapribile dalla landing Insegna senza rigenerare.
    try {
        if (window.MappAIStudyDocs) {
            window.MappAIStudyDocs.save({
                kind: 'nodesheet',
                // Il foglio rivisto è un documento a sé: senza il suffisso l'archivio
                // (che deduplica per tipo|titolo|mappa) sovrascriverebbe l'automatico.
                title: window.t('ui_node_sheet_btn', 'Foglio nodi') + ' — ' + projectTitle +
                    (editedCards ? ' ' + window.t('ns_revised', '(rivisto)') : '') + (tuned ? ' [VERDE]' : ''),
                mapName: projectTitle,
                pdf: doc.output('datauristring')
            });
        }
    } catch (e) { /* archivio best-effort */ }
    return { ok: true, fileName: domFileName };
};

// ── FOGLIO FLASHCARD PDF (jsPDF) ─────────────────────────────────────────────
// È lo stesso foglio del builder HTML (mappai-quiz-print.js): stessa griglia,
// stessa testata, stessa metà verde, stesse linee di taglio. Le misure e i corpi
// del testo NON stanno qui: arrivano da mappai-print-layout.js, così i due
// motori non possono divergere di un millimetro.
//
// opts: { items:[{question,answer,explanation}], title, mapName, rootLabel, theme,
//         fmt:'2x2v'(default)|'2x2'|'2x1'|'3x2'|'4x3'|'2x3'|'2x4',
//         backside:bool → ❄️ FRONTE-RETRO IN FREEZE (decisione utente, 27/7/26):
//           il percorso c'è e funziona (pagina domande + pagina risposte
//           specchiate per riga), ma NON è rifinito né provato su carta. Mancano:
//           opzione per il lato di ribaltamento (lungo/corto), margine di
//           sicurezza per la deriva di registro, testata anche sul retro, foglio
//           di prova con crocini. Non svilupparlo senza riaprire la decisione.
//         fontMode:'uniform'|'card', bg:'none'|'grid', explanation:bool, toDisk:{} }
// Ritorna Promise<{ok, base64?, fileName}>. Con toDisk: nessun download, nessun toast.
window.printFlashcardSheet = async function (opts) {
    opts = opts || {};
    const DE = window.MappAIDocEdit;
    const PL = window.MappAIPrintLayout;
    if (!PL) {
        if (!opts.toDisk) window.showToast('Layout di stampa non caricato', 'error');
        return { ok: false, error: 'mappai-print-layout.js mancante' };
    }
    const items = DE ? DE.normItems(opts.items) : (opts.items || []);
    if (!items.length) {
        if (!opts.toDisk) window.showToast(window.t('fc_no_cards', 'Nessuna carta da stampare.'), 'warning');
        return { ok: false, error: 'nessuna carta' };
    }

    const G = PL.flashGeom(opts.fmt);
    const fmt = G.key;
    const duplex = !!opts.backside;
    const withExpl = opts.explanation !== false;

    // Testata: stessa risoluzione del foglio HTML (mappa + macro-area del ramo).
    const head = (window.MappAIQuizPrint && window.MappAIQuizPrint.cardHeader)
        ? window.MappAIQuizPrint.cardHeader({ title: opts.title || '' },
            { rootLabel: opts.rootLabel || opts.mapName || '', theme: opts.theme || '' })
        : { root: String(opts.rootLabel || opts.mapName || ''), theme: String(opts.theme || '') };
    // Etichette vuote per default (più aria): niente «TEMA:» davanti all'area
    // tematica, niente «RISPOSTA» sopra il retro. Si rimettono dai token.
    const themeWord = String(G.labels.themePrefix || '');
    const answerWord = String(G.labels.answer || '');

    const cards = items.map(function (it) {
        const ex = String((withExpl && it.explanation) || '');
        return {
            question: String(it.question || ''),
            answer: String(it.answer || '—'),
            explanation: ex.length > G.explMax
                ? ex.slice(0, G.explMax).replace(/[\s.,;:]+$/, '') + '…' : ex
        };
    });

    // Corpi del testo: calcolati PRIMA di disegnare, come nel foglio HTML.
    const fontMode = (opts.fontMode === 'card') ? 'card' : 'uniform';
    // Le righe della testata sono quelle che verranno DISEGNATE: il modello deve
    // contare le stesse, altrimenti promette spazio che sulla carta non c'è.
    const headLinesDrawn = [
        String(head.root || ''),
        head.theme ? (themeWord ? themeWord + ' ' + head.theme : head.theme) : ''
    ];
    const fit = PL.fitFlash(cards, G, { lines: headLinesDrawn },
        { policy: fontMode, withExpl: withExpl, duplex: duplex });
    // Testi definitivi (spiegazioni tolte dove non stavano, «…» dove serviva):
    // gli stessi che disegna il foglio HTML.
    const finali = fit.items;

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: G.landscape ? 'landscape' : 'portrait', unit: 'mm', format: 'a4' });

    /* Il CARATTERE DELL'APP (o quello del documento, se ne ha uno suo).
       ⚠️ Il ripiego resta `courier` ed è una scelta: è monospazio come Space
       Mono, quindi se la registrazione fallisce l'impaginazione già calcolata
       continua a valere. Con un carattere proporzionale scelto in Cabina,
       invece, le misure vengono dal catalogo — e se il file non si registra il
       testo esce più stretto del previsto, non più largo: verso sicuro. */
    let fontName = 'courier';
    try {
        if (window.MappAIFont && window.MappAIFont.registraIn) {
            fontName = (await window.MappAIFont.registraIn(doc, opts.font)) || fontName;
        } else if (window.MappAISpaceMono && window.MappAISpaceMono.registerInto(doc)) {
            fontName = 'Space Mono';
        }
    } catch (e) { /* ripiego monospazio: il calcolo tiene */ }

    // ── utilità di disegno ───────────────────────────────────────────────────
    function rgb(hex) {
        const h = String(hex || '#000').replace('#', '');
        const n = h.length === 3 ? h.split('').map(function (c) { return c + c; }).join('') : h;
        return [parseInt(n.slice(0, 2), 16), parseInt(n.slice(2, 4), 16), parseInt(n.slice(4, 6), 16)];
    }
    function dash(pattern) {
        if (typeof doc.setLineDashPattern !== 'function') return;
        doc.setLineDashPattern(pattern && pattern.length ? pattern : [], 0);
    }
    function stroke(hex, widthMm, pattern) {
        const c = rgb(hex);
        doc.setDrawColor(c[0], c[1], c[2]);
        doc.setLineWidth(widthMm);
        dash(pattern);
    }
    function fill(hex) { const c = rgb(hex); doc.setFillColor(c[0], c[1], c[2]); }
    function ink(hex) { const c = rgb(hex); doc.setTextColor(c[0], c[1], c[2]); }

    // Righe di testo con a-capo sulle parole, misurate col font vero.
    function lines(text, pt, style, widthMm, spacedPt) {
        doc.setFont(fontName, style || 'normal');
        doc.setFontSize(pt);
        // La testata è disegnata con lo spazio fra le lettere (setCharSpace), che
        // getTextWidth non misura come lo disegna. Per la testata si usa quindi lo
        // stesso metro del modello (avanzamento monospazio + spaziatura): così
        // modello, HTML e PDF mandano a capo nello stesso punto.
        const measure = spacedPt
            ? function (s) { return s.length * (G.headAdvance || G.advance) * pt * PL.PT2MM; }
            : function (s) { return doc.getTextWidth(s); };
        return PL.wrapLines(text, measure, widthMm);
    }
    // Righe di un blocco senza disegnarlo (serve per centrarlo verticalmente).
    function blockLines(text, pt, style, widthMm, spaced) {
        return lines(spaced ? String(text || '').toUpperCase() : text, pt, style, widthMm, spaced);
    }
    // Corsivo SINTETICO: Space Mono ha solo tondo e grassetto, e chiedere
    // 'italic' a jsPDF fa cadere il testo su un font PROPORZIONALE — che manda a
    // capo dove il modello non prevede. Qui si inclina il testo con una matrice,
    // tenendo lo stesso font: le larghezze restano quelle monospazio.
    const ITALIC_SLANT = 0.21;
    function textSlanted(txt, x, baselineY) {
        if (typeof doc.setCurrentTransformationMatrix !== 'function' || !doc.Matrix) {
            doc.text(txt, x, baselineY);   // motore senza matrici: testo dritto
            return;
        }
        doc.saveGraphicsState();
        // L'inclinazione va applicata ATTORNO alla baseline: senza compensare, il
        // testo scivolerebbe di 0,21 × la sua distanza dal fondo pagina. La
        // matrice finisce nel flusso PDF in PUNTI, quindi la compensazione va
        // scalata col fattore di conversione del documento.
        const k = (doc.internal && doc.internal.scaleFactor) || 1;
        const yPdfPt = (G.pageH - baselineY) * k;
        doc.setCurrentTransformationMatrix(new doc.Matrix(1, 0, ITALIC_SLANT, 1, -ITALIC_SLANT * yPdfPt, 0));
        doc.text(txt, x, baselineY);
        doc.restoreGraphicsState();
    }

    // Disegna righe già calcolate a partire dalla cima del blocco.
    function draw(ls, x, y, pt, style, color, lineH, spaced, italic) {
        if (!ls.length) return y;
        doc.setFont(fontName, style || 'normal');
        doc.setFontSize(pt);
        if (spaced && typeof doc.setCharSpace === 'function') {
            doc.setCharSpace(G.headLetterSpacing * pt * PL.PT2MM);
        }
        ink(color);
        const step = pt * PL.PT2MM * (lineH || G.lineH);
        let cy = y + pt * PL.PT2MM;   // baseline della prima riga
        ls.forEach(function (ln) {
            if (italic) textSlanted(ln, x, cy); else doc.text(ln, x, cy);
            cy += step;
        });
        if (spaced && typeof doc.setCharSpace === 'function') doc.setCharSpace(0);
        return y + ls.length * step;
    }
    // Scrive un blocco e ritorna la y di fine. `spaced` = testata: MAIUSCOLO e
    // lettere distanziate, come nel foglio HTML (text-transform + letter-spacing).
    function write(text, x, y, pt, style, color, widthMm, lineH, spaced) {
        return draw(blockLines(text, pt, style, widthMm, spaced), x, y, pt, style, color, lineH, spaced);
    }

    // Sfondo a quadretti (opzione storica del foglio).
    function drawBg() {
        if (opts.bg !== 'grid') return;
        let useG = false;
        try {
            if (doc.GState && doc.setGState) { doc.setGState(new doc.GState({ 'stroke-opacity': 0.1 })); useG = true; }
        } catch (e) { useG = false; }
        if (useG) doc.setDrawColor(0, 255, 255); else doc.setDrawColor(230, 255, 255);
        doc.setLineWidth(0.3); dash([]);
        for (let gx = 0; gx <= G.pageW + 0.01; gx += 5) doc.line(gx, 0, gx, G.pageH);
        for (let gy = 0; gy <= G.pageH + 0.01; gy += 5) doc.line(0, gy, G.pageW, gy);
        if (useG) { try { doc.setGState(new doc.GState({ 'stroke-opacity': 1 })); } catch (e) { } }
    }

    // Linee di taglio: un rettangolo per carta ('card') oppure linee continue da
    // bordo a bordo del blocco ('grid', più comode con la taglierina).
    function drawCutSheet() {
        if (G.cut.style !== 'grid') return;
        stroke(G.cut.color, G.cut.width, G.cut.dash);
        PL.cutLines(G).forEach(function (s) { doc.line(s.x1, s.y1, s.x2, s.y2); });
        dash([]);
    }
    function drawCutMarks() {
        if (!G.cut.marks) return;
        stroke(G.cut.color, G.cut.width, []);
        PL.cropMarks(G).forEach(function (s) { doc.line(s.x1, s.y1, s.x2, s.y2); });
    }
    function drawCardBorder(b) {
        if (G.cut.style === 'grid') return;   // già disegnate come griglia continua
        stroke(G.cut.color, G.cut.width, G.cut.dash);
        doc.roundedRect(b.x, b.y, b.w, b.h, G.card.radius, G.card.radius, 'D');
        dash([]);
    }

    // ── una carta ────────────────────────────────────────────────────────────
    // face: 'fold' (domanda sopra, risposta sotto) · 'front' · 'back' (duplex)
    function drawCard(item, b, idx, face) {
        const innerW = b.w - 2 * G.card.padX;
        const pc = (fontMode === 'card' && fit.perCard[idx]) ? fit.perCard[idx] : fit;
        const frontH = (face === 'fold') ? b.h * fit.split / 100 : b.h;

        if (face !== 'front') {
            // Metà (o carta intera) della risposta: fondo verde.
            fill(G.colors.back);
            const by = (face === 'fold') ? b.y + frontH : b.y;
            const bh = (face === 'fold') ? b.h - frontH : b.h;
            doc.rect(b.x, by, b.w, bh, 'F');
        }
        drawCardBorder(b);

        const x = b.x + G.card.padX;
        const H = function (n, pt, lh) { return n * pt * PL.PT2MM * (lh || G.lineH); };

        if (face !== 'back') {
            // TESTATA ancorata in cima: è l'identità della carta ritagliata.
            let y = b.y + G.card.padTop;
            if (headLinesDrawn[0]) {
                y = write(headLinesDrawn[0], x, y, G.head, 'bold', G.colors.accent, innerW, G.headLineH, true);
            }
            if (headLinesDrawn[1]) {
                y = write(headLinesDrawn[1], x, y, G.head, 'bold', G.colors.muted, innerW, G.headLineH, true);
            }
            y += G.card.headGap;
            // DOMANDA centrata verticalmente nello spazio che resta: cresce verso
            // l'alto e verso il basso, come nel foglio HTML.
            const qls = blockLines(item.question, pc.q, 'bold', innerW);
            const spazio = (b.y + frontH - G.card.padBottom) - y;
            const alto = Math.max(0, (spazio - H(qls.length, pc.q)) / 2);
            draw(qls, x, y + alto, pc.q, 'bold', G.colors.ink);
        }

        if (face !== 'front') {
            const top = (face === 'fold') ? b.y + frontH : b.y;
            const lblLs = answerWord ? blockLines(answerWord, G.head, 'bold', innerW, true) : [];
            const als = blockLines(item.answer, pc.a, 'normal', innerW);
            const els = item.explanation ? blockLines(item.explanation, pc.e, 'normal', innerW) : [];
            // Blocco della risposta (etichetta + testo + spiegazione) centrato
            // verticalmente nella sua metà.
            const alt = (lblLs.length ? H(lblLs.length, G.head, G.headLineH) + G.card.lblGap : 0)
                + H(als.length, pc.a)
                + (els.length ? G.card.explGap + H(els.length, pc.e) : 0);
            const disp = (b.h - (face === 'fold' ? frontH : 0)) - G.card.backPadTop - G.card.padBottom;
            let y = top + G.card.backPadTop + Math.max(0, (disp - alt) / 2);
            if (lblLs.length) {
                y = draw(lblLs, x, y, G.head, 'bold', G.colors.muted, G.headLineH, true) + G.card.lblGap;
            }
            y = draw(als, x, y, pc.a, 'normal', G.colors.ink);
            // Spiegazione: stesso corpo della risposta, in corsivo.
            if (els.length) draw(els, x, y + G.card.explGap, pc.e, 'normal', G.colors.expl, null, false, true);
        }

        if (face === 'fold') {
            // Linea di piega: si piega qui per nascondere la risposta.
            stroke(G.fold.color, G.fold.width, G.fold.dash);
            const fy = b.y + frontH;
            doc.line(b.x + G.fold.inset, fy, b.x + b.w - G.fold.inset, fy);
            dash([]);
        }
    }

    // ── impaginazione ────────────────────────────────────────────────────────
    const boxes = PL.cardBoxes(G);
    const perPage = G.perPage;
    const pages = Math.ceil(finali.length / perPage);
    for (let p = 0; p < pages; p++) {
        const pageItems = finali.slice(p * perPage, (p + 1) * perPage);
        if (p > 0) doc.addPage();
        drawBg(); drawCutSheet(); drawCutMarks();
        pageItems.forEach(function (it, i) {
            drawCard(it, boxes[i], p * perPage + i, duplex ? 'front' : 'fold');
        });
        if (!duplex) continue;
        // RETRO: ogni riga specchiata, altrimenti con la stampa fronte/retro sul
        // lato lungo la risposta finisce dietro la carta sbagliata.
        doc.addPage();
        drawBg(); drawCutSheet(); drawCutMarks();
        const order = DE && DE.backsideOrder
            ? DE.backsideOrder(pageItems.length, fmt)
            : pageItems.map(function (_, i) { return i; });
        order.forEach(function (srcIdx, slot) {
            if (srcIdx == null || !pageItems[srcIdx]) return;
            drawCard(pageItems[srcIdx], boxes[slot], p * perPage + srcIdx, 'back');
        });
    }

    const title = String(opts.title || 'Flashcard').replace(/[\\/:*?"<>|]/g, '-');
    /* `opts.fileName` = il nome che il docente ha appena scelto salvando in
       `Materiale Studio/`. Senza, il dialogo di salvataggio del sistema
       proponeva un nome inventato qui e la parte aggiunta a mano spariva: due
       nomi per lo stesso foglio, e quello che si vede è il peggiore. */
    const fileName = String(opts.fileName || ('Flashcard-' + title + '-' + fmt + '.pdf'));
    if (opts.toDisk) return { ok: true, base64: doc.output('datauristring'), fileName: fileName };

    doc.save(fileName);
    window.showToast(window.t('fc_sheet_done', '✓ Foglio flashcard generato'), 'success');
    try {
        if (window.MappAIStudyDocs) {
            window.MappAIStudyDocs.save({
                kind: 'flashsheet',
                title: (opts.title || 'Flashcard') + ' — ' + fmt,
                mapName: opts.mapName || (appState.rootNodeLabel || 'MappAI'),
                pdf: doc.output('datauristring')
            });
        }
    } catch (e) { /* archivio best-effort */ }
    return { ok: true, fileName: fileName };
};

// ── Keyword per le etichette ──────────────────────────────────────────────────
// AI: chiamate a BATCH da _KW_BATCH nodi ciascuna → mappa { "<id>": ["kw",...] }.
// Il batching evita il troncamento del JSON su mappe grandi (una sola chiamata
// per 60+ nodi supera maxOutputTokens → i nodi in coda restavano senza keyword).
var _KW_BATCH = 18;

// Un nodo è FOGLIA se non ha link uscenti (nessun figlio).
function _kwIsLeaf(node) {
    var links = appState.db?.links || [];
    return !links.some(function (l) { return (l.source?.id || l.source) === node.id; });
}

function _kwDescWordCount(node) {
    return String(node.desc || node.content || '').split(/\s+/).filter(Boolean).length;
}

// Soglia sotto la quale la desc di una FOGLIA è troppo povera per keyword
// sensate: meglio nessuna keyword che rumore (la card esce col solo titolo).
var _KW_MIN_LEAF_DESC_WORDS = 15;

// Validazione unica per keyword AI e fallback: trim, dedupe case-insensitive,
// via le keyword fatte solo di parole del titolo, via token < 3 char, cap 7.
function _cleanKeywords(node, arr) {
    if (!Array.isArray(arr)) return [];
    var titleTokens = {};
    cleanLabel(node.label).toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ')
        .split(/\s+/).forEach(function (w) { if (w) titleTokens[w] = 1; });
    var seen = {}, out = [];
    arr.forEach(function (k) {
        var kw = String(k || '').trim();
        if (kw.length < 3) return;
        var low = kw.toLowerCase();
        if (seen[low]) return;
        var tokens = low.replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean);
        if (tokens.length && tokens.every(function (t) { return titleTokens[t]; })) return;
        seen[low] = 1;
        out.push(kw);
    });
    return out.slice(0, 7);
}

async function _kwCallBatch(nodesChunk, apiKey) {
    var byId = {};
    var items = nodesChunk.map(function (n) {
        byId[n.id] = n;
        var d = String(n.desc || n.content || '').replace(/\s+/g, ' ').trim().slice(0, 240);
        var item = { id: n.id, label: cleanLabel(n.label), desc: d };
        if (_kwIsLeaf(n)) item.leaf = true;
        return item;
    });

    var langNote = (window.mapLangNote ? window.mapLangNote() : '');
    var userPrompt =
        'Per OGNI nodo qui sotto genera da 3 a 7 PAROLE CHIAVE brevi (1-3 parole ciascuna) ' +
        'che catturano i concetti essenziali del nodo, utili a uno studente per ricordarlo.\n' +
        'Usa il titolo e la descrizione. Niente frasi intere, solo parole o locuzioni chiave. ' +
        'Solo termini di CONTENUTO (nomi/concetti): niente verbi coniugati, articoli, ' +
        'preposizioni o parole nella lingua della fonte se diversa. ' +
        'Non ripetere il titolo del nodo come keyword.\n' +
        'REGOLA NODI FOGLIA (item con "leaf": true): keyword SOLO dai concetti presenti ' +
        'nella descrizione — mai parole del titolo, mai termini generici inventati. ' +
        'Se la descrizione ha meno di 15 parole o non contiene concetti veri, rispondi ' +
        'con un array VUOTO [] per quel nodo: meglio niente che rumore.\n' + langNote + '\n' +
        'Rispondi SOLO con un oggetto JSON { "<id>": ["kw1","kw2",...], ... } ' +
        'usando ESATTAMENTE gli id forniti. Nessun markdown, nessun testo fuori dal JSON.\n\n' +
        'NODI:\n' + JSON.stringify(items);

    var payload = {
        contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
        systemInstruction: {
            parts: [{ text: 'Sei un assistente didattico. Rispondi SOLO con un oggetto JSON valido, senza markdown.' }]
        },
        generationConfig: {
            temperature: 0.2,
            maxOutputTokens: (window.getMaxOutputTokens ? window.getMaxOutputTokens(8192) : 8192)
        }
    };

    if (window.MappAIUsage) window.MappAIUsage.setContext('materials', 'nodesheet');
    if (window.injectClassTuning) window.injectClassTuning(payload); // taratura [VERDE]: no-op se non armato
    var response = await window.fetchModelAPI(payload, apiKey);
    var raw = response?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    if (!raw) return {};

    var parsed;
    try { parsed = salvageTruncatedJSON(raw); } catch (e) { return {}; }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};

    var out = {};
    Object.keys(parsed).forEach(function (id) {
        var v = parsed[id];
        if (Array.isArray(v)) {
            var node = byId[id];
            out[id] = node ? _cleanKeywords(node, v)
                : v.map(function (k) { return String(k).trim(); }).filter(Boolean).slice(0, 7);
        }
    });
    return out;
}

async function _generateNodeKeywords(nodes, apiKey) {
    var chunks = [];
    for (var i = 0; i < nodes.length; i += _KW_BATCH) chunks.push(nodes.slice(i, i + _KW_BATCH));

    var merged = {};
    for (var c = 0; c < chunks.length; c++) {
        if (chunks.length > 1) {
            window.showLoadingOverlay(true, 'Genero le parole chiave dei nodi… (' + (c + 1) + '/' + chunks.length + ')');
        }
        try {
            var part = await _kwCallBatch(chunks[c], apiKey);
            Object.keys(part).forEach(function (id) { merged[id] = part[id]; });
        } catch (e) {
            console.warn('[Labels] Batch keyword ' + (c + 1) + ' fallito:', e);
        }
    }
    return merged;
}

// Stopword >4 lettere (IT + EN) da scartare nell'estrazione dalle desc.
// Nota: il fallback è una rete di sicurezza (parole grezze della desc, non
// concetti). La qualità vera arriva dall'AI; qui limitiamo solo il rumore.
var _KW_STOPWORDS = (function () {
    var list = ('contiene contengono essere stato stati quando quello quella questo questa ' +
        'quelli queste anche perché perche mentre invece inoltre quindi tramite attraverso ' +
        'responsabili responsabile responsabilita degli delle nelle negli sugli sulle dalla ' +
        'dallo dagli dalle sotto sopra come sono viene vengono possono devono deve senza ' +
        'dopo prima ancora molto tanto poco parte parti tutta tutte tutti tutto ogni ' +
        'inserita inserito inseriti presenta presentano ' +
        'about which where these those their there would could should because ' +
        'through while between during their these those which their there being where').split(/\s+/);
    var m = {}; list.forEach(function (w) { m[w] = 1; }); return m;
})();

// Fallback deterministico (zero AI): le label dei figli SONO le sotto-idee del
// nodo; sui nodi foglia si estraggono le parole salienti dalla desc.
function _fallbackKeywords(node) {
    var nodes = appState.db?.nodes || [];
    var links = appState.db?.links || [];
    var kids = links
        .filter(function (l) { return (l.source?.id || l.source) === node.id; })
        .map(function (l) {
            var tid = l.target?.id || l.target;
            var t = nodes.find(function (n) { return n.id === tid; });
            return t ? cleanLabel(t.label) : null;
        })
        .filter(Boolean);
    if (kids.length) return _cleanKeywords(node, kids);

    // FOGLIA con desc povera: niente keyword — la card esce col solo titolo
    // (parole grezze estratte da 2 righe di testo = rumore, non concetti).
    if (_kwDescWordCount(node) < _KW_MIN_LEAF_DESC_WORDS) return [];

    var STOP = _KW_STOPWORDS;
    // Escludi le parole del titolo (ripeterle come keyword è inutile)
    var titleTokens = {};
    cleanLabel(node.label).toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ')
        .split(/\s+/).forEach(function (w) { if (w) titleTokens[w] = 1; });

    var txt = String(node.desc || node.content || '').toLowerCase();
    var words = txt.replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/)
        .filter(function (w) { return w.length > 4 && !STOP[w] && !titleTokens[w]; });
    var seen = {}, uniq = [];
    words.forEach(function (w) { if (!seen[w]) { seen[w] = 1; uniq.push(w); } });
    return _cleanKeywords(node, uniq);
}

// ── Schede nodo: descrizione giustificata + sillabata + bold ──────────────────

function _isVowelCh(ch) {
    return /[aeiouàáâäèéêëìíîïòóôöùúûüyAEIOUÀÁÂÄÈÉÊËÌÍÎÏÒÓÔÖÙÚÛÜY]/.test(ch);
}

// Sillabazione italiana approssimata → indici di taglio ammessi dentro la parola
// (≥2 lettere prima e dopo). Regole: muta+liquida e digrafi restano onset;
// "s"+consonante va con la sillaba successiva; doppie si spezzano.
function _hyphenBreaks(word) {
    var n = word.length;
    if (n < 4) return [];
    var isV = [];
    for (var i = 0; i < n; i++) isV[i] = _isVowelCh(word[i]);
    var breaks = [];
    var onset = /^(ch|gh|gn|gl|sc|[bcdfgptv][lr])$/;
    i = 0;
    while (i < n && !isV[i]) i++;      // salta onset iniziale
    while (i < n) {
        while (i < n && isV[i]) i++;   // consuma nucleo (vocali)
        if (i >= n) break;
        var cStart = i;
        while (i < n && !isV[i]) i++;   // consuma consonanti
        var cEnd = i;
        if (i >= n) break;              // consonanti finali → nessun taglio
        var k = cEnd - cStart, brk;
        if (k === 1) {
            brk = cStart;               // V-CV
        } else {
            var c0 = word[cStart].toLowerCase();
            var c1 = word[cStart + 1].toLowerCase();
            var pair = c0 + c1;
            if (c0 === 's' && c1 !== 's') {
                brk = cStart;           // pa-sta, mo-stra (ma non doppia "ss")
            } else if (k === 2) {
                brk = onset.test(pair) ? cStart : cStart + 1;
            } else {
                var lastPair = word[cEnd - 2].toLowerCase() + word[cEnd - 1].toLowerCase();
                brk = onset.test(lastPair) ? cEnd - 2 : cEnd - 1;
            }
        }
        if (brk >= 2 && (n - brk) >= 2) breaks.push(brk);
    }
    return breaks;
}

// Parole da mettere in grassetto nella scheda: i concetti-figli del nodo.
function _cardBoldSet(node) {
    var set = new Set();
    var nodes = appState.db?.nodes || [];
    var links = appState.db?.links || [];
    links.forEach(function (l) {
        if ((l.source?.id || l.source) !== node.id) return;
        var tid = l.target?.id || l.target;
        var t = nodes.find(function (n) { return n.id === tid; });
        if (!t) return;
        cleanLabel(t.label).toLowerCase().split(/\s+/).forEach(function (w) {
            var core = w.replace(/[^\p{L}\p{N}]/gu, '');
            if (core.length >= 4) set.add(core);
        });
    });
    return set;
}

// Impagina `text` giustificato a pacchetto in un box (mm), con sillabazione,
// grassetto per-token e troncamento con "..." quando finisce lo spazio.
// Ritorna l'ALTEZZA occupata (mm). `opts.measureOnly` impagina senza disegnare:
// serve a chi deve centrare il blocco e quindi sapere quanto è alto prima di
// piazzarlo — misura e resa vengono dallo stesso impaginatore, non da una stima.
function _drawJustifiedDesc(doc, text, boxX, boxY, boxW, boxH, fontName, sizePt, boldSet, opts) {
    opts = opts || {};
    if (!text || boxH <= 0 || boxW <= 0) return 0;
    var PT2MM = 0.352778;
    var lineH = sizePt * PT2MM * 1.4;
    var maxLines = Math.max(1, Math.floor(boxH / lineH + 0.001));
    doc.setFontSize(sizePt);

    function coreLower(t) { return t.toLowerCase().replace(/[^\p{L}\p{N}]/gu, ''); }
    function wWidth(str, bold) { doc.setFont(fontName, bold ? 'bold' : 'normal'); return doc.getTextWidth(str); }
    var spaceW = wWidth(' ', false);

    // Tokenizza con flag bold (concetto-figlio, oppure nome proprio a metà frase)
    var prevEndsSentence = true;
    var queue = [];
    String(text).replace(/\s+/g, ' ').trim().split(' ').forEach(function (t) {
        if (!t) return;
        var core = coreLower(t);
        var isProper = /^[A-ZÀÈÉÌÒÙ]/.test(t) && !prevEndsSentence && core.length >= 4;
        queue.push({ text: t, bold: (boldSet && boldSet.has(core)) || isProper });
        prevEndsSentence = /[.!?:;]$/.test(t);
    });

    function tryHyphen(tk, avail) {
        var m = tk.text.match(/^([^\p{L}]*)(\p{L}[\p{L}\p{M}]*)([^\p{L}]*)$/u);
        if (!m) return null;
        var pre = m[1], letters = m[2], post = m[3];
        if (letters.length < 4) return null;
        var breaks = _hyphenBreaks(letters);
        for (var bi = breaks.length - 1; bi >= 0; bi--) {
            var p = breaks[bi];
            var head = pre + letters.slice(0, p) + '-';
            if (wWidth(head, tk.bold) <= avail) {
                return { head: head, headW: wWidth(head, tk.bold), tail: letters.slice(p) + post };
            }
        }
        return null;
    }

    var lines = [], cur = [], curW = 0, qi = queue.slice();
    while (qi.length) {
        var tk = qi.shift();
        var tkW = wWidth(tk.text, tk.bold);
        var gap0 = cur.length ? spaceW : 0;
        if (curW + gap0 + tkW <= boxW) {
            cur.push({ text: tk.text, bold: tk.bold, width: tkW });
            curW += gap0 + tkW;
        } else {
            var avail = boxW - curW - gap0;
            var hy = (avail > spaceW * 2) ? tryHyphen(tk, avail) : null;
            if (hy) {
                cur.push({ text: hy.head, bold: tk.bold, width: hy.headW });
                lines.push({ parts: cur, natural: false }); cur = []; curW = 0;
                qi.unshift({ text: hy.tail, bold: tk.bold });
            } else if (cur.length) {
                lines.push({ parts: cur, natural: false }); cur = []; curW = 0;
                qi.unshift(tk);
            } else {
                var s = tk.text, cut = s.length;
                while (cut > 1 && wWidth(s.slice(0, cut) + '-', tk.bold) > boxW) cut--;
                var head2 = s.slice(0, cut) + '-';
                cur.push({ text: head2, bold: tk.bold, width: wWidth(head2, tk.bold) });
                lines.push({ parts: cur, natural: false }); cur = []; curW = 0;
                qi.unshift({ text: s.slice(cut), bold: tk.bold });
            }
        }
        if (lines.length >= maxLines) { cur = []; break; }
    }
    if (cur.length && lines.length < maxLines) { lines.push({ parts: cur, natural: true }); cur = []; }
    var truncated = qi.length > 0 || cur.length > 0;

    if (truncated && lines.length) {
        var last = lines[lines.length - 1];
        var ellW = wWidth('...', false);
        while (last.parts.length) {
            var sumW = last.parts.reduce(function (a, p) { return a + p.width; }, 0) + (last.parts.length - 1) * spaceW;
            if (sumW + spaceW + ellW <= boxW) break;
            last.parts.pop();
        }
        if (last.parts.length) {
            var lp = last.parts[last.parts.length - 1];
            lp.text = lp.text.replace(/[-.,;:]+$/, '') + '...';
            lp.width = wWidth(lp.text, lp.bold);
        }
        last.natural = true; // riga troncata non va giustificata
    }

    if (opts.measureOnly) return lines.length * lineH;

    var yline = boxY + sizePt * PT2MM;
    for (var li = 0; li < lines.length; li++) {
        var parts = lines[li].parts;
        if (!parts.length) { yline += lineH; continue; }
        var gaps = parts.length - 1;
        var sum = parts.reduce(function (a, p) { return a + p.width; }, 0);
        var gap = (!lines[li].natural && gaps > 0) ? (boxW - sum) / gaps : spaceW;
        if (gap > spaceW * 4) gap = spaceW; // evita "fiumi" su righe con poche parole
        var cx = boxX;
        for (var pi = 0; pi < parts.length; pi++) {
            doc.setFont(fontName, parts[pi].bold ? 'bold' : 'normal');
            doc.text(parts[pi].text, cx, yline, { align: 'left' });
            cx += parts[pi].width + gap;
        }
        yline += lineH;
    }
    return lines.length * lineH;
}

/* ── LA CORNICE CONDIVISA (mappai-doc-head.js, 11/8/26) ──────────────────────
   Il dossier è entrato nel riordino delle testate per decisione di Giacomo, ed
   è quello che ci ha guadagnato di più: la sua intestazione era `no-print`,
   quindi la pagina 1 di un dossier non diceva di quale mappa fosse; e il suo
   piè, un elemento `position:fixed` nell'area di margine, SALTAVA LA PRIMA
   PAGINA (riprodotto con Electron su un documento di tre pagine).
   `pagina: false` perché il @page del dossier è suo — margini 18/15/22 tarati
   sulle card — e la cornice gli passa solo il piè da incastrarci. */
/* Il NOME del dossier, dalla convenzione unica (11/8/26). È il `<title>` del
   documento, ed è ciò che il dialogo di salvataggio propone: se non segue la
   convenzione, il file finisce nella cartella con un nome che non somiglia a
   nessuno degli altri. `dettaglio` = il nodo o il ramo, quando il dossier è di
   uno solo: «Dossier-<Mappa>-<Nodo>». Senza il core (contesti headless) resta
   una forma coerente scritta a mano. */
function _dsNomeFile(mappa, dettaglio, isMM) {
    var PC = (typeof window !== 'undefined') ? window.MappAIPipelineCore : null;
    /* Il sottotitolo della mappa intera è il GENERE («Mappa Mentale» /
       «Knowledge Graph»), non un nodo: come dettaglio ripeterebbe una cosa che
       il nome del file non deve portarsi dietro. */
    var d = (dettaglio && !/^(mappa mentale|knowledge graph)$/i.test(String(dettaglio))) ? dettaglio : '';
    if (PC && PC.buildFileName) {
        return String(PC.buildFileName('dossier', null, false, { mappa: mappa, dettaglio: d }))
            .replace(/\.pdf$/i, '');           /* il `<title>` non porta l'estensione */
    }
    return 'Dossier-' + mappa + (d ? '-' + d : '');
}
function _dsDH() { return (typeof window !== 'undefined' && window.MappAIDocHead) || null; }
function _dsCornice() {
    const DH = _dsDH();
    return DH ? DH.stile({ accento: '#4f46e5', pagina: false }) : '';
}
function _dsTestata(titolo, sottotitolo, mapName) {
    const DH = _dsDH();
    if (!DH) return '';
    return DH.testata(DH.conContesto({ titolo: titolo, tipo: sottotitolo, mappa: mapName }));
}
function _dsPie(mapName, logo) {
    const DH = _dsDH();
    return DH ? DH.pieDichiarazioni({ mappa: mapName, logo: logo }) : '';
}
function _dsPieSchermo(mapName) {
    const DH = _dsDH();
    return DH ? DH.pieSchermo({ mappa: mapName }) : '';
}

window.printAllNodeDossiers = function () {
    window.openDossierPrintModal();
};

window.openDossierPrintModal = function () {
    const modal = document.getElementById('dossier-print-modal');
    const box = document.getElementById('dossier-print-box');
    if (!modal || !box) return;

    const isMM = appState.extractionMode === 'mindmap';
    const mmOpts = document.getElementById('print-mm-options');
    const kgOpts = document.getElementById('print-kg-options');

    // Reset select inputs
    const selectId = isMM ? 'print-mm-node-select' : 'print-kg-node-select';
    const selectEl = document.getElementById(selectId);

    // Clear select options, keep the first 'all' option
    selectEl.innerHTML = `<option value="all">${isMM ? 'Tutta la mappa (Tutti i nodi)' : 'Tutta la mappa (Tutti i nodi)'}</option>`;

    // Sort and add nodes to the select dropdown
    const sortedNodes = [...(appState.db.nodes || [])].sort((a, b) => (a.level || 0) - (b.level || 0));
    sortedNodes.forEach(n => {
        const option = document.createElement('option');
        option.value = n.id;
        option.innerText = `[L${n.level || 0}] ${cleanLabel(n.label)}`;
        selectEl.appendChild(option);
    });

    if (isMM) {
        mmOpts.classList.remove('hidden');
        kgOpts.classList.add('hidden');
        document.getElementById('print-mm-scope-container').classList.add('hidden');
        document.getElementById('print-mm-ascii-diagram').checked = true;
    } else {
        kgOpts.classList.remove('hidden');
        mmOpts.classList.add('hidden');
        document.getElementById('print-kg-scope-container').classList.add('hidden');
        document.getElementById('print-kg-relations').checked = true;
    }

    modal.classList.remove('hidden');
    modal.classList.add('flex');
    setTimeout(() => {
        modal.classList.remove('opacity-0');
        box.classList.remove('scale-95');
    }, 10);
    if (window.safeCreateIcons) window.safeCreateIcons();
};

window.closeDossierPrintModal = function () {
    const modal = document.getElementById('dossier-print-modal');
    const box = document.getElementById('dossier-print-box');
    if (!modal || !box) return;
    modal.classList.add('opacity-0');
    box.classList.add('scale-95');
    setTimeout(() => {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }, 200);
};

window.onDossierNodeChange = function (mode) {
    const select = document.getElementById(`print-${mode}-node-select`);
    const container = document.getElementById(`print-${mode}-scope-container`);
    if (!select || !container) return;

    if (select.value === 'all') {
        container.classList.add('hidden');
    } else {
        container.classList.remove('hidden');
    }
};

window.generateDossierPDFFromOptions = async function () {
    console.log('[Dossier] generateDossierPDFFromOptions avviata');
    try {
        // Carica l'icona MappAI in base64 — verrà iniettata nell'header di ogni card PDF
        const mappaiIconBase64 = await loadMappaiIconBase64();
        const isMM = appState.extractionMode === 'mindmap';
        const selectId = isMM ? 'print-mm-node-select' : 'print-kg-node-select';
        const selectedNodeId = document.getElementById(selectId)?.value;
        if (!selectedNodeId) { window.showToast('Seleziona un nodo dal menu.', 'warning'); return; }

        let targetNodes = [];
        let asciiTree = "";

        // Raccolta nodi del ramo → base condivisa con la Sintesi
        // (mappai-study-export-core.js). Usato solo dal ramo MindMap qui sotto:
        // il KG "branch" del dossier ordina invece TUTTI i nodi per gruppo.
        const collectBranch = (id) => window.MappAIStudyExport.collectBranchNodes(id);

        // Funzione per costruire il diagramma ASCII del ramo (con anti-ciclo)
        const _visitedASCII = new Set();
        function buildASCIITree(nodeId, prefix = "") {
            if (_visitedASCII.has(nodeId)) return "";  // ciclo rilevato → stop
            _visitedASCII.add(nodeId);
            let lines = [];
            const outgoingLinks = appState.db.links.filter(l => {
                const sId = (l.source && l.source.id) ? l.source.id : l.source;
                return sId === nodeId;
            });
            outgoingLinks.forEach((link, idx) => {
                const isLast = idx === outgoingLinks.length - 1;
                const tId = (link.target && link.target.id) ? link.target.id : link.target;
                const targetNode = appState.db.nodes.find(n => n.id === tId);
                if (targetNode) {
                    const connector = isLast ? "└── " : "├── ";
                    const nextPrefix = prefix + (isLast ? "    " : "│   ");
                    const relText = link.rel ? `[${link.rel}] ──> ` : "";
                    lines.push(prefix + connector + relText + cleanLabel(targetNode.label));
                    const childTree = buildASCIITree(tId, nextPrefix);
                    if (childTree) lines.push(childTree);
                }
            });
            return lines.join("\n");
        }

        if (selectedNodeId === 'all') {
            targetNodes = [...(appState.db.nodes || [])].sort((a, b) => (a.level || 0) - (b.level || 0));
        } else {
            const selectedNode = appState.db.nodes.find(n => n.id === selectedNodeId);
            if (!selectedNode) {
                window.showToast(window.t('tst_node_not_found', "Nodo non trovato"), "error");
                return;
            }

            if (isMM) {
                const scope = document.querySelector('input[name="print-mm-scope"]:checked').value;
                if (scope === 'single') {
                    targetNodes = [selectedNode];
                } else {
                    targetNodes = collectBranch(selectedNodeId);
                }

                const includeAscii = document.getElementById('print-mm-ascii-diagram').checked;
                if (includeAscii) {
                    asciiTree = cleanLabel(selectedNode.label) + "\n" + buildASCIITree(selectedNodeId);
                }
            } else {
                const scope = document.querySelector('input[name="print-kg-scope"]:checked').value;
                if (scope === 'single') {
                    targetNodes = [selectedNode];
                } else {
                    // Ordina per macro-area (group) poi per livello: tutti i nodi di
                    // ogni colore/comunità restano in sequenza nel dossier stampato.
                    targetNodes = [...(appState.db.nodes || [])].sort((a, b) => {
                        const ga = a.group ?? 0, gb = b.group ?? 0;
                        if (ga !== gb) return ga - gb;
                        return (a.level || 0) - (b.level || 0);
                    });
                }
            }
        }

        if (targetNodes.length === 0) {
            window.showToast(window.t('tst_no_print_node', "Nessun nodo selezionato da stampare."), "warning");
            return;
        }

        /* 🐛 `appState.db.title` NON ESISTE (11/8/26): il nome della mappa vive
           in `rootNodeLabel`. Il ripiego scattava sempre, quindi ogni dossier si
           chiamava «Dossier Progetto MappAI MM» — un nome che non dice né quale
           mappa né quale documento, e che il dialogo di salvataggio proponeva
           tale e quale. Stessa catena di ripieghi che questo file usa già alla
           riga 323 per il foglio dei nodi: quella era giusta, questa no. */
        const projectTitle = appState.db?.rootNodeLabel || appState.rootNodeLabel || "Progetto MappAI";

        // Leggi il fattore di scala dal selettore nel modal
        const fontScaleEl = document.querySelector('input[name="print-font-scale"]:checked');
        const fontScale = fontScaleEl ? parseFloat(fontScaleEl.value) : 1.0;

        // ─── Helper: ottieni il colore della macro-area di un nodo ───────────────
        function getNodeColor(node) {
            if (!node) return '#6366f1';
            if (appState.db.customColors && appState.db.customColors[node.group] !== undefined) {
                return appState.db.customColors[node.group];
            }
            return colorScale[node.group] || colorScale[1] || '#6366f1';
        }

        // ─── Helper: ottieni il colore della MACROAREA del nodo (group L1) ──────────
        function getMacroAreaColor(node) {
            if (!node) return '#6366f1';
            // Se il nodo è già a livello 0 o 1, usa il suo colore diretto
            if (node.level <= 1) return getNodeColor(node);
            // Per nodi più profondi: usa node.group che identifica la macroarea L1
            const macroGroup = node.group;
            if (appState.db?.customColors?.[macroGroup] !== undefined) {
                return appState.db.customColors[macroGroup];
            }
            return colorScale[macroGroup] || colorScale[1] || '#6366f1';
        }

        // ─── Helper: genera una riga di citazione stile modale ───────────────────
        function buildCitationRow(s, idx, showNodeLabel) {
            const sourceName = s.source ? cleanLabel(s.source) : "Documento";
            const sourceText = s.text ? cleanLabel(s.text) : "";
            if (!sourceText) return "";
            const originNode = (s.nodeId && appState.db.nodes)
                ? appState.db.nodes.find(nd => nd.id === s.nodeId)
                : null;
            const originLabel = originNode ? cleanLabel(originNode.label) : '';
            const nodeColor = originNode ? getNodeColor(originNode) : '#6366f1';
            const nodeTag = (showNodeLabel && originLabel)
                ? `<span class="citation-origin" style="color:${nodeColor};">${originLabel}</span>`
                : '';
            return `<div class="citation-row">
            <div class="citation-num">${idx + 1}</div>
            <div class="citation-content">
                <div class="citation-meta">
                    <span class="citation-type-tag">TESTO DI ORIGINE</span>
                    ${nodeTag ? `<span class="citation-sep">|</span>${nodeTag}` : ''}
                    <span class="citation-sep">\u2014</span>
                    <span class="citation-source">${sourceName}</span>
                </div>
                <p class="citation-text">&ldquo;${sourceText}&rdquo;</p>
            </div>
        </div>`;
        }

        // ─── Helper: genera la card di un nodo (layout allineato al #source-modal) ─
        function buildNodeCard(node, showCitations, citationsHtml, notesCount, relationsHtml) {
            // ── Calcolo colore header e contrasto testo ──────────────────────────
            const headerColor = getMacroAreaColor(node);
            const hex = headerColor.replace('#', '');
            const r = parseInt(hex.substr(0, 2), 16) || 0, g = parseInt(hex.substr(2, 2), 16) || 0, b = parseInt(hex.substr(4, 2), 16) || 0;
            const luma = 0.299 * r + 0.587 * g + 0.114 * b;
            const textColor = luma > 160 ? '#1e293b' : '#ffffff';

            const isL1 = (node.level || 0) <= 1;

            // ── Nome macro-area (L1) di appartenenza ────────────────────────────
            const macroareaName = (() => {
                const l1 = appState.db.nodes.find(nd => nd.level === 1 && nd.group === node.group);
                return l1 ? cleanLabel(l1.label) : `Gruppo ${node.group !== undefined ? node.group : '–'}`;
            })();

            // ── Relazioni nel header: predecessori e successori ──────────────────
            // Mostrate solo sui nodi L2+ per non ingolfare gli hub
            const headerRelHints = (() => {
                if (isL1) return '';
                const nodeMap = {};
                (appState.db.nodes || []).forEach(nd => { nodeMap[nd.id] = nd; });
                const rawLinks = appState.db.links || [];
                const nodeId = node.id;

                const formatRef = (nd) => {
                    if (!nd) return null;
                    const isHub = (nd.level || 0) <= 1;
                    return (isHub ? 'HUB+' : '') + cleanLabel(nd.label);
                };

                // Predecessori: nodi che puntano A questo nodo
                const fromRefs = rawLinks
                    .filter(l => (typeof l.target === 'object' ? l.target.id : l.target) === nodeId)
                    .map(l => formatRef(nodeMap[typeof l.source === 'object' ? l.source.id : l.source]))
                    .filter(Boolean);

                // Successori: nodi a cui questo nodo punta
                const toRefs = rawLinks
                    .filter(l => (typeof l.source === 'object' ? l.source.id : l.source) === nodeId)
                    .map(l => formatRef(nodeMap[typeof l.target === 'object' ? l.target.id : l.target]))
                    .filter(Boolean);

                let html = '';
                if (fromRefs.length) html += `<span class="dossier-rel-hint">&#8592; ${fromRefs.join(' / ')}</span>`;
                if (toRefs.length)   html += `<span class="dossier-rel-hint">&#8594; ${toRefs.join(' / ')}</span>`;
                return html;
            })();

            // ── Sezione FONTI: titolo con barra sinistra colorata ────────────────
            const citationsSection = showCitations ? `
            <div class="dossier-sources-header" style="border-left:3pt solid ${headerColor};padding-left:8pt;margin:12pt 0 6pt 0;">
                <span class="dossier-section-title sources-title" style="color:${headerColor};">&#9612; FONTI E NOTE APPROFONDITE (${notesCount})</span>
            </div>
            <div class="citations-container">${citationsHtml}</div>
        ` : '';

            // Header: L1 (macro-area) → dimensioni originali grandi per impatto visivo
            //         L2+ → padding compatto, titolo riempie bene il rettangolo
            const headerClass = isL1 ? 'dossier-card-header is-l1' : 'dossier-card-header';

            return `<div class="dossier-card">

            <!-- ── HEADER: rettangolo colorato full-width ──────────────────────── -->
            <div class="${headerClass}" style="background:${headerColor};color:white;">
                <div class="dossier-card-header-main">
                    <h2 class="dossier-title">${cleanLabel(node.label)}</h2>
                    ${headerRelHints}
                </div>
            </div>

            <!-- ── CORPO NODO ───────────────────────────────────────────────────── -->
            <div class="dossier-body">
                <p class="dossier-desc">${cleanLabel(node.desc || node.content || 'Nessuna descrizione presente.')}</p>

                <!-- ── SEZIONE FONTI E CITAZIONI ────────────────────────── -->
                ${citationsSection}

                <!-- ── RELAZIONI KG (solo in modalità KG con opzione attivata) ── -->
                ${relationsHtml || ''}
            </div>
        </div>`;
        }

        // ─── Determina se siamo in modalità "singolo nodo" o "ramo/tutto" ────────
        // scope dichiarato con let (non const) per renderlo disponibile al titolo dinamico qui sotto
        let scope = '';
        let isSingleNodeMode = false;
        if (isMM) {
            scope = document.querySelector('input[name="print-mm-scope"]:checked')?.value || 'branch';
            isSingleNodeMode = (scope === 'single');
        } else {
            scope = document.querySelector('input[name="print-kg-scope"]:checked')?.value || 'branch';
            isSingleNodeMode = (scope === 'single');
        }

        // ── Titolo dinamico in base al tipo di stampa ─────────────────────────────
        let dossierTitle, dossierSubtitle;
        if (scope === 'single') {
            dossierTitle = 'Dossier Nodo';
            dossierSubtitle = cleanLabel(targetNodes[0]?.label || projectTitle);
        } else if (scope === 'branch') {
            dossierTitle = 'Struttura del Ramo';
            dossierSubtitle = cleanLabel(targetNodes[0]?.label || projectTitle);
        } else {
            // scope === 'all' oppure selectedNodeId === 'all'
            // Titolo prima pagina = nome del progetto assegnato in MappAI
            dossierTitle = cleanLabel(appState.rootNodeLabel || appState.db?.rootNodeLabel || projectTitle);
            dossierSubtitle = isMM ? 'Mappa Mentale' : 'Knowledge Graph';
        }

        let dossierCardsHtml = '';
        const asciiSectionHtml = "";

        // ═══════════════════════════════════════════════════════════════════════════
        // MODO A: SINGOLO NODO
        // ═══════════════════════════════════════════════════════════════════════════
        if (isSingleNodeMode && targetNodes.length === 1) {
            const n = targetNodes[0];
            const inheritedNotes = (typeof window.getInheritedDatabase === 'function')
                ? window.getInheritedDatabase(n.id)
                : (appState.db.sourcesDict?.[n.id] || []);

            let citationsHtml = `<p class="no-chunks">Nessuna citazione verbatim associata.</p>`;
            if (inheritedNotes.length > 0) {
                citationsHtml = inheritedNotes.map((s, idx) => buildCitationRow(s, idx, false)).filter(Boolean).join('');
            } else if (n.chunks?.length > 0) {
                citationsHtml = n.chunks.map((c, idx) => {
                    const s = typeof c === 'object' ? c : { text: c, source: 'Documento' };
                    return buildCitationRow({ ...s, nodeId: n.id }, idx, false);
                }).filter(Boolean).join('');
            }
            const notesCount = inheritedNotes.length || (n.chunks?.length || 0);

            let relationsHtml = "";
            if (!isMM && document.getElementById('print-kg-relations')?.checked) {
                const outgoing = appState.db.links
                    .filter(l => ((l.source?.id || l.source) === n.id))
                    .map(l => { const t = appState.db.nodes.find(nd => nd.id === (l.target?.id || l.target)); return t ? `<li><span class="rel-arrow">&#8212;&#9658;</span> <span class="rel-word">[${l.rel || 'collega'}]</span> <strong class="rel-target">[${cleanLabel(t.label)}]</strong></li>` : ''; })
                    .filter(Boolean).join('');
                const incoming = appState.db.links
                    .filter(l => ((l.target?.id || l.target) === n.id))
                    .map(l => { const s2 = appState.db.nodes.find(nd => nd.id === (l.source?.id || l.source)); return s2 ? `<li><strong class="rel-target">[${cleanLabel(s2.label)}]</strong> <span class="rel-arrow">&#8212;&#9658;</span> <span class="rel-word">[${l.rel || 'collega'}]</span></li>` : ''; })
                    .filter(Boolean).join('');
                if (outgoing || incoming) {
                    relationsHtml = `<h3 class="dossier-section-title">RELAZIONI DEL NODO</h3><div class="kg-relations">
                    ${outgoing ? `<div class="kg-relations-list"><strong>Elenco A) Uscenti:</strong><ul>${outgoing}</ul></div>` : ''}
                    ${incoming ? `<div class="kg-relations-list"><strong>Elenco B) Entranti:</strong><ul>${incoming}</ul></div>` : ''}
                </div>`;
                }
            }

            dossierCardsHtml = buildNodeCard(n, true, citationsHtml, notesCount, relationsHtml);

            // ═══════════════════════════════════════════════════════════════════════════
            // MODO C: TUTTA LA MAPPA (Organizzata per Macro-Aree)
            // ═══════════════════════════════════════════════════════════════════════════
        } else if (scope === 'all' || selectedNodeId === 'all') {
            const rootNode = appState.db.nodes.find(n => n.level === 0) || targetNodes[0];
            const rootColor = getNodeColor(rootNode);

            // 1) Diagramma ASCII globale
            _visitedASCII.clear();
            const treeText = cleanLabel(rootNode.label) + "\n" + buildASCIITree(rootNode.id);
            dossierCardsHtml += `<div class="dossier-card ascii-diagram-card">
            <div class="dossier-card-top-bar" style="background:${rootColor};"></div>
            <div class="dossier-header">
                <div>
                    <h2 class="dossier-title">Diagramma ad Albero Globale</h2>
                    <span class="dossier-tag">${cleanLabel(rootNode.label)} &#xB7; Tutta la mappa</span>
                </div>
            </div>
            <div class="dossier-divider"></div>
            <pre class="ascii-tree">${treeText}</pre>
        </div>`;

            // Stampa la card del Root Node
            dossierCardsHtml += buildNodeCard(rootNode, false, '', 0, '');

            const printedNodes = new Set([rootNode.id]);
            const l1Nodes = appState.db.nodes.filter(n => n.level === 1).sort((a, b) => (a.order || 0) - (b.order || 0));

            // 2) Ciclo sulle Macro-Aree
            l1Nodes.forEach(l1 => {
                const branchNodes = collectBranch(l1.id);
                if (branchNodes.length === 0) branchNodes.push(l1);
                branchNodes.sort((a, b) => (a.level || 0) - (b.level || 0));

                const l1Color = getNodeColor(l1);

                // A) Stampa card di tutti i nodi di questa Macro-Area
                branchNodes.forEach(n => {
                    if (!printedNodes.has(n.id)) {
                        dossierCardsHtml += buildNodeCard(n, false, '', 0, '');
                        printedNodes.add(n.id);
                    }
                });

                // B) Costruisce le citazioni della Macro-Area
                let perNodeHtml = '';
                let groupIdx = 1;
                branchNodes.forEach(n => {
                    const nodeSources = appState.db.sourcesDict?.[n.id] || [];
                    if (nodeSources.length === 0) return;
                    const nodeColor = getNodeColor(n);
                    perNodeHtml += `<div class="node-citations-group">
                    <div class="node-group-header" style="border-left:4px solid ${nodeColor};">
                        <span class="node-group-dot" style="background:${nodeColor};"></span>
                        <span class="node-group-label">${cleanLabel(n.label)}</span>
                        <span class="node-group-count">${nodeSources.length} cit.</span>
                    </div>`;
                    nodeSources.forEach(s => {
                        const row = buildCitationRow({ ...s, nodeId: n.id }, groupIdx - 1, false);
                        if (row) { perNodeHtml += row; groupIdx++; }
                    });
                    perNodeHtml += `</div>`;
                });

                if (!perNodeHtml) {
                    perNodeHtml = `<p class="no-chunks">Nessuna citazione verbatim associata a questa macro-area.</p>`;
                }

                // C) Sezione aggregata (getInheritedDatabase per questo specifico L1)
                const allInherited = (typeof window.getInheritedDatabase === 'function')
                    ? window.getInheritedDatabase(l1.id)
                    : [];

                let aggregateHtml = '';
                if (allInherited.length > 0) {
                    aggregateHtml = allInherited.map((s, idx) => {
                        const sourceName = s.source ? cleanLabel(s.source) : 'Documento';
                        const sourceText = s.text ? cleanLabel(s.text) : '';
                        if (!sourceText) return '';
                        const originNode = (s.nodeId && appState.db.nodes) ? appState.db.nodes.find(nd => nd.id === s.nodeId) : null;
                        const originLabel = originNode ? cleanLabel(originNode.label) : '';
                        const nodeColor = originNode ? getNodeColor(originNode) : l1Color;
                        const nodeTag = originLabel ? `<span class="citation-origin" style="color:${nodeColor};">${originLabel}</span>` : '';
                        return `<div class="citation-row">
                        <div class="citation-num">${idx + 1}</div>
                        <div class="citation-content">
                            <div class="citation-meta">
                                <span class="citation-type-tag">TESTO DI ORIGINE</span>
                                ${nodeTag ? `<span class="citation-sep">|</span>${nodeTag}` : ''}
                                <span class="citation-sep">&mdash;</span>
                                <span class="citation-source">${sourceName}</span>
                            </div>
                            <p class="citation-text">&ldquo;${sourceText}&rdquo;</p>
                        </div>
                    </div>`;
                    }).filter(Boolean).join('');
                } else {
                    aggregateHtml = `<p class="no-chunks">Nessuna citazione aggregata trovata per questo ramo.</p>`;
                }

                const totalCount = allInherited.length || 0;

                // Stampiamo la scheda finale delle citazioni del ramo
                dossierCardsHtml += `<div class="dossier-card citations-master-card">
                <div class="dossier-card-top-bar" style="background:${l1Color};"></div>
                <div class="dossier-header">
                    <div class="dossier-header-icon">&#128218;</div>
                    <div>
                        <h2 class="dossier-title">Fonti e Note: ${cleanLabel(l1.label)}</h2>
                        <span class="dossier-tag">Tutte le citazioni del ramo (Macro-Area)</span>
                    </div>
                </div>
                <div class="dossier-divider"></div>
                <div class="citations-by-node-section">${perNodeHtml}</div>
                <div class="citations-section-divider">
                    <span>&#9612;&#9612; FONTI E NOTE APPROFONDITE (TUTTI I NODI DEL RAMO) &mdash; ${totalCount} citazioni totali</span>
                </div>
                <div class="citations-container citations-aggregate">${aggregateHtml}</div>
                </div>`;
            });

            // Eventuali nodi orfani
            const orfani = targetNodes.filter(n => !printedNodes.has(n.id) && n.level > 0);
            if (orfani.length > 0) {
                orfani.forEach(n => { dossierCardsHtml += buildNodeCard(n, false, '', 0, ''); });
            }

            // ═══════════════════════════════════════════════════════════════════════════
            // MODO B: RAMO SINGOLO
            // ═══════════════════════════════════════════════════════════════════════════
        } else {
            const rootNode = targetNodes[0];
            const rootColor = getNodeColor(rootNode);

            _visitedASCII.clear();
            const treeText = cleanLabel(rootNode.label) + "\n" + buildASCIITree(rootNode.id);
            dossierCardsHtml += `<div class="dossier-card ascii-diagram-card">
            <div class="dossier-card-top-bar" style="background:${rootColor};"></div>
            <div class="dossier-header">
                <div>
                    <h2 class="dossier-title">Struttura del Ramo</h2>
                    <span class="dossier-tag">${cleanLabel(rootNode.label)} &#xB7; Diagramma ASCII</span>
                </div>
            </div>
            <div class="dossier-divider"></div>
            <pre class="ascii-tree">${treeText}</pre>
        </div>`;

            targetNodes.forEach(n => {
                dossierCardsHtml += buildNodeCard(n, false, '', 0, '');
            });

            let perNodeHtml = '';
            let groupIdx = 1;
            targetNodes.forEach(n => {
                const nodeSources = appState.db.sourcesDict?.[n.id] || [];
                if (nodeSources.length === 0) return;
                const nodeColor = getNodeColor(n);
                perNodeHtml += `<div class="node-citations-group">
                <div class="node-group-header" style="border-left:4px solid ${nodeColor};">
                    <span class="node-group-dot" style="background:${nodeColor};"></span>
                    <span class="node-group-label">${cleanLabel(n.label)}</span>
                    <span class="node-group-count">${nodeSources.length} cit.</span>
                </div>`;
                nodeSources.forEach(s => {
                    const row = buildCitationRow({ ...s, nodeId: n.id }, groupIdx - 1, false);
                    if (row) { perNodeHtml += row; groupIdx++; }
                });
                perNodeHtml += `</div>`;
            });

            if (!perNodeHtml) {
                perNodeHtml = `<p class="no-chunks">Nessuna citazione verbatim associata ai nodi di questo ramo.</p>`;
            }

            const allInherited = (typeof window.getInheritedDatabase === 'function')
                ? window.getInheritedDatabase(rootNode.id)
                : [];

            let aggregateHtml = '';
            if (allInherited.length > 0) {
                aggregateHtml = allInherited.map((s, idx) => {
                    const sourceName = s.source ? cleanLabel(s.source) : 'Documento';
                    const sourceText = s.text ? cleanLabel(s.text) : '';
                    if (!sourceText) return '';
                    const originNode = (s.nodeId && appState.db.nodes)
                        ? appState.db.nodes.find(nd => nd.id === s.nodeId)
                        : null;
                    const originLabel = originNode ? cleanLabel(originNode.label) : '';
                    const nodeColor = originNode ? getNodeColor(originNode) : rootColor;
                    const nodeTag = originLabel
                        ? `<span class="citation-origin" style="color:${nodeColor};">${originLabel}</span>`
                        : '';
                    return `<div class="citation-row">
                    <div class="citation-num">${idx + 1}</div>
                    <div class="citation-content">
                        <div class="citation-meta">
                            <span class="citation-type-tag">TESTO DI ORIGINE</span>
                            ${nodeTag ? `<span class="citation-sep">|</span>${nodeTag}` : ''}
                            <span class="citation-sep">\u2014</span>
                            <span class="citation-source">${sourceName}</span>
                        </div>
                        <p class="citation-text">&ldquo;${sourceText}&rdquo;</p>
                    </div>
                </div>`;
                }).filter(Boolean).join('');
            } else {
                aggregateHtml = `<p class="no-chunks">Nessuna citazione aggregata trovata per questo ramo.</p>`;
            }

            const totalCount = allInherited.length || 0;

            dossierCardsHtml += `<div class="dossier-card citations-master-card">
            <div class="dossier-card-top-bar" style="background:${rootColor};"></div>
            <div class="dossier-header">
                <div class="dossier-header-icon">&#128218;</div>
                <div>
                    <h2 class="dossier-title">Fonti e Note Approfondite</h2>
                    <span class="dossier-tag">Tutte le citazioni del ramo &#xB7; ${cleanLabel(rootNode.label)}</span>
                </div>
            </div>
            <div class="dossier-divider"></div>
            <div class="citations-by-node-section">
                ${perNodeHtml}
            </div>
            <div class="citations-section-divider">
                <span>&#9612;&#9612; FONTI E NOTE APPROFONDITE (TUTTI I NODI) &mdash; ${totalCount} citazioni totali</span>
            </div>
            <div class="citations-container citations-aggregate">
                ${aggregateHtml}
            </div>
        </div>`;
        }


        // ── Footer del documento: logo + nome mappa root ──────────────────────
        const rootMapName = cleanLabel(
            appState.db.nodes?.find(n => n.level === 0)?.label
            || appState.db?.rootLabel
            || 'MappAI'
        );
        /* Il logo per il PIÈ va ridotto: un margin-box rende url() alla taglia
           INTRINSECA dell'immagine, e il PNG dell'app è 1024×1024 — nella prova
           copriva mezza pagina e spingeva fuori il numero. 24px, una volta sola
           (il risultato è in cache nel modulo). */
        const mappaiIconPie = window.MappAIDocHead
            ? await window.MappAIDocHead.logoPiccolo(mappaiIconBase64 || 'MappAI_icon.png', 24)
            : '';
        /* Il piè STAMPATO è nei margin-box di @page (vedi la nota lì): questo
           blocco resta per lo SCHERMO, dove i margin-box non esistono. */
        const footerHtml = _dsPieSchermo(rootMapName);

        const dossierHtml = `
        <!DOCTYPE html>
        <html>
        <head>
            <title>${_dsNomeFile(projectTitle, dossierSubtitle, isMM)}</title>
            <style>
                ${_fontDoc()}
                ${_dsCornice()}
                :root {
                    /* --- MODIFICHE GLOBALI DI LAYOUT (Variabili CSS) --- */
                    /* Puoi modificare questi valori per cambiare rapidamente l'aspetto di tutto il dossier */

                    /* TIPOGRAFIA — fattore scala ${fontScale} applicato in automatico */
                    --pdf-scale: ${fontScale};
                    /* Il carattere lo decide la Cabina (o il documento): --doc-font
                       arriva da _fontDoc() qui sopra. Il ripiego serve solo a un
                       file HTML riaperto dove quel blocco non c'è. */
                    --pdf-font-family: var(--doc-font, 'Space Mono', monospace);
                    --pdf-base-font-size: calc(13px * ${fontScale}); /* Dimensione testo normale */
                    --pdf-title-font-size: calc(17px * ${fontScale}); /* Dimensione titolo principale */
                    --pdf-section-title-size: calc(9.5px * ${fontScale}); /* Dimensione titoli sezioni */
                    --pdf-citation-font-size: calc(11.5px * ${fontScale}); /* Dimensione testo citazioni */
                    --pdf-small-font-size: calc(9px * ${fontScale}); /* Dimensione testi piccoli e metadati */
                    
                    /* COLORI E SPAZIATURE */
                    --pdf-primary-color: #0f172a; /* Colore del testo principale */
                    --pdf-accent-color: #38bdf8;  /* cyan – colore di accento (barre e dettagli) */
                    --pdf-accent-dark: #0369a1; /* Colore di accento scuro per testi */
                    --pdf-bg-citation: #f0f9ff; /* Colore di sfondo delle citazioni */
                    
                    /* Spaziature interne delle card (i riquadri dei nodi) */
                    --pdf-card-padding: calc(20px * ${fontScale}); /* Margine interno delle card */
                    --pdf-card-border-radius: 10px; /* Arrotondamento angoli delle card */
                    --pdf-spacing-between-cards: calc(28px * ${fontScale}); /* Spazio verticale tra una card e l'altra */
                }

                @media print {
                    /* --- REGOLE DI STAMPA A4 --- */
                    @page {
                        size: A4 portrait;
                        /* margin-bottom = altezza della banda del piè */
                        margin: 18mm 15mm 22mm 15mm;
                        /* Il PIÈ vive QUI (11/8/26). Prima era un elemento
                           position:fixed dentro l'area di margine, e la prova
                           con Electron su un dossier di tre pagine ha mostrato
                           che quella tecnica SALTA LA PRIMA PAGINA: il piè si
                           vedeva dalla seconda in poi. Nei margin-box c'è su
                           tutte, e in più si può contare le pagine — cosa che un
                           elemento del documento non sa fare (il contatore fuori
                           da @page vale 0). */
${_dsPie(rootMapName, mappaiIconPie)}
                    }
                    body {
                        margin: 0;
                        padding: 0;
                    }
                    .no-print { display: none !important; }
                    
                    /* Comportamento dei riquadri (card) durante l'impaginazione */
                    .dossier-card { 
                        page-break-after: always; /* Forza una nuova pagina dopo ogni card (se non lo vuoi, commenta questa riga) */
                        page-break-inside: avoid; /* Evita che una card venga spezzata su due pagine */
                        break-after: page;
                        box-shadow: none !important;
                        border: none !important;
                    }
                    .dossier-card:last-child {
                        page-break-after: avoid;
                        break-after: avoid;
                    }

                    /* ── Forza la stampa dei colori di sfondo ─────────────────────── */
                    /* Senza queste regole Chrome/Safari/Firefox non stampano           */
                    /* i background-color degli header colorati                         */
                    * {
                        -webkit-print-color-adjust: exact !important;
                        print-color-adjust: exact !important;
                        color-adjust: exact !important;
                    }
                    .dossier-card-header,
                    .dossier-card-top-bar,
                    [style*="background"] {
                        -webkit-print-color-adjust: exact !important;
                        print-color-adjust: exact !important;
                    }
                }

                * {
                    font-family: var(--doc-font, 'Space Mono', monospace) !important;
                    box-sizing: border-box;
                }

                body {
                    font-family: var(--pdf-font-family);
                    color: #1e293b;
                    background: #fff;
                    padding: 30px 27px; /* padding laterale ridotto del 10%: 30px → 27px */
                    line-height: var(--pdf-line-height);
                    font-size: var(--pdf-base-font-size);
                }

                .header {
                    margin-bottom: 30px;
                    padding-bottom: 16px;
                    border-bottom: 2px solid #e2e8f0;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                }

                .header h1 {
                    font-size: var(--pdf-title-font-size);
                    margin: 0;
                    font-weight: 800;
                    color: var(--pdf-primary-color);
                }

                .btn-print {
                    background: #10b981;
                    color: #fff;
                    border: none;
                    padding: 10px 20px;
                    border-radius: 8px;
                    font-size: 14px;
                    font-weight: 600;
                    cursor: pointer;
                    box-shadow: 0 1px 2px rgba(0,0,0,0.05);
                }

                .btn-print:hover {
                    background: #059669;
                }

                .dossier-container {
                    display: flex;
                    flex-direction: column;
                    gap: var(--pdf-spacing-between-cards);
                }

                /* ── Card principale (riquadro di ogni Nodo) ─────────────────────── */
                .dossier-card {
                    background: #fff; /* Colore di sfondo della card (di default bianco) */
                    border: 1px solid #e2e8f0; /* Colore e spessore del bordo grigio chiaro */
                    border-radius: var(--pdf-card-border-radius); /* Smussatura degli angoli (vedi variabili :root in alto) */
                    padding: var(--pdf-card-padding);
                    overflow: hidden;
                    position: relative;
                    /* Se vuoi aggiungere un'ombra visuale a schermo (viene rimossa in stampa in automatico): */
                    /* box-shadow: 0 4px 6px rgba(0,0,0,0.1); */
                }

                /* Banda colorata in cima alla card (come il modale) */
                /* ── Top-bar sottile (mantenuta per Modo B: ramo/mappa) ──────── */
                .dossier-card-top-bar {
                    height: 4px;
                    background: var(--pdf-accent-color);
                    margin: calc(-1 * var(--pdf-card-padding));
                    margin-bottom: calc(var(--pdf-card-padding) * 0.8);
                }

                /* ── HEADER CARD FULL-WIDTH (layout allineato al #source-modal) ─── */
                .dossier-card-header {
                    /* Header nodi L2+: compatto, titolo riempie il rettangolo */
                    display: flex;
                    align-items: flex-start;
                    justify-content: space-between;
                    gap: 8px;
                    padding: 10pt 16pt 9pt 16pt;
                    margin: calc(-1 * var(--pdf-card-padding));
                    margin-bottom: calc(var(--pdf-card-padding) * 0.5);
                }

                .dossier-card-header.is-l1 {
                    /* Header macro-aree L1: dimensioni originali per impatto visivo */
                    padding: 18pt 20pt 14pt 20pt;
                }

                .dossier-card-header-main {
                    /* Colonna testo: titolo + livello + breadcrumb */
                    display: flex;
                    flex-direction: column;
                    gap: 3pt;
                    flex: 1;
                }

                /* ── Backward compat: vecchio header (usato in Modo B) ──────── */
                .dossier-header {
                    display: flex;
                    align-items: flex-start;
                    gap: 10px;
                    margin-bottom: 6px;
                }

                .dossier-header-icon {
                    font-size: calc(18px * var(--pdf-scale));
                    margin-top: 2px;
                    flex-shrink: 0;
                }

                .dossier-title {
                    /* Titolo nell'header: bianco, bold, riempie il rettangolo */
                    font-size: 17pt;
                    font-weight: 700;
                    margin: 0;
                    color: #ffffff;
                    line-height: 1.2;
                }

                .is-l1 .dossier-title {
                    /* Macro-aree L1: titolo grande come nell'originale */
                    font-size: 22pt;
                }

                .dossier-level-tag {
                    font-size: 8pt;
                    color: rgba(255,255,255,0.75);
                    display: block;
                }

                .dossier-breadcrumb {
                    font-size: 8pt;
                    color: rgba(255,255,255,0.65);
                    font-style: italic;
                    display: block;
                }

                .dossier-rel-hint {
                    /* Predecessori / successori nel header: piccoli, bianchi, italic */
                    display: block;
                    font-size: 7.5pt;
                    color: rgba(255,255,255,0.72);
                    font-style: italic;
                    margin-top: 2pt;
                    line-height: 1.3;
                }

                /* Backward compat: vecchio tag per Modo B */
                .dossier-tag {
                    font-size: var(--pdf-small-font-size);
                    color: #64748b;
                    display: block;
                    margin-top: 2px;
                }

                .dossier-divider {
                    height: 1px;
                    background: #e2e8f0;
                    margin: 10px 0 14px 0;
                }

                /* ── Body e sezioni ──────────────────────── */
                .dossier-section-title {
                    font-size: var(--pdf-section-title-size);
                    font-weight: 700;
                    text-transform: uppercase;
                    color: #64748b;
                    margin: 16px 0 8px 0;
                    letter-spacing: 0.06em;
                }

                .sources-title {
                    /* La barra sinistra è gestita inline da .dossier-sources-header */
                    color: var(--pdf-accent-dark);
                }

                /* ── Etichetta sezione SINTESI DEL CONCETTO ─────────────────── */
                .dossier-section-label {
                    /* Maiuscoletto, colore accent, 8pt, tracking largo — come il modale */
                    display: block;
                    font-size: 8pt;
                    font-weight: 700;
                    text-transform: uppercase;
                    letter-spacing: 0.12em;
                    color: var(--pdf-accent-dark);
                    margin: 0 0 6pt 0;
                }

                /* ── Corpo nodo: padding-top dopo header full-width ─────────── */
                .dossier-body {
                    padding-top: 4pt;
                }

                .dossier-desc {
                    font-size: var(--pdf-base-font-size);
                    color: #334155;
                    margin: 0;
                    white-space: pre-wrap;
                    line-height: var(--pdf-line-height);
                }

                /* ── Citazioni (layout modale) ────────────── */
                .citations-container {
                    display: flex;
                    flex-direction: column;
                    gap: 8px;
                    margin-top: 4px;
                }

                .citation-row {
                    /* Ogni fonte: bordo sinistro colorato (stile modale) + sfondo grigio chiaro */
                    display: flex;
                    align-items: flex-start;
                    gap: 8pt;
                    background: #f8fafc;          /* grigio chiarissimo */
                    border: none;
                    border-radius: 0;
                    padding: 8pt 10pt;
                    margin-bottom: 6pt;          /* spazio tra fonti: 6pt */
                    page-break-inside: avoid;    /* Evita di spezzare la card tra due pagine */
                    break-inside: avoid;
                }

                .citation-num {
                    flex-shrink: 0;
                    width: calc(20px * var(--pdf-scale));
                    height: calc(20px * var(--pdf-scale));
                    background: #6366f1;
                    color: #fff;
                    border-radius: 50%;
                    font-size: var(--pdf-small-font-size);
                    font-weight: 700;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    margin-top: 2px;
                }

                .citation-content {
                    flex: 1;
                    min-width: 0;
                }

                .citation-meta {
                    display: flex;
                    align-items: center;
                    gap: 5px;
                    flex-wrap: wrap;
                    margin-bottom: 5px;
                }

                .citation-type-tag {
                    font-size: var(--pdf-small-font-size);
                    font-weight: 700;
                    text-transform: uppercase;
                    color: var(--pdf-accent-dark);
                    letter-spacing: 0.05em;
                }

                .citation-origin {
                    font-size: var(--pdf-small-font-size);
                    color: #0369a1;
                    font-weight: 600;
                }

                .citation-source {
                    font-size: var(--pdf-small-font-size);
                    color: #475569;
                    font-style: italic;
                }

                .citation-sep {
                    font-size: var(--pdf-small-font-size);
                    color: #94a3b8;
                }

                .citation-text {
                    font-size: var(--pdf-citation-font-size);
                    color: #1e293b;
                    font-style: italic;
                    margin: 0;
                    line-height: var(--pdf-line-height);
                    white-space: pre-wrap;
                }

                .no-chunks {
                    font-size: var(--pdf-base-font-size);
                    color: #94a3b8;
                    font-style: italic;
                    margin: 0;
                }

                .ascii-tree {
                    font-family: var(--doc-font, 'Space Mono', monospace) !important;
                    font-size: calc(11px * var(--pdf-scale));
                    background: #f8fafc;
                    padding: 16px;
                    border-radius: 8px;
                    border: 1px solid #e2e8f0;
                    overflow-x: auto;
                    margin: 0;
                }

                /* Badge macro-area nell'header della card */
                .dossier-color-badge {
                    font-size: var(--pdf-small-font-size);
                    font-weight: 700;
                    padding: 4px 10px;
                    border-radius: 20px;
                    white-space: nowrap;
                    flex-shrink: 0;
                    letter-spacing: 0.03em;
                }

                /* Raggruppamento citazioni per nodo (Modo B) */
                .node-citations-group {
                    margin-bottom: 16px;
                }

                .node-group-header {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    margin: 16px 0 8px 0;
                    padding-left: 10px;
                }

                .node-group-label {
                    font-weight: 700;
                    font-size: calc(11px * var(--pdf-scale));
                    color: #1e293b;
                }

                .node-group-count {
                    font-size: var(--pdf-small-font-size);
                    color: #94a3b8;
                }

                .node-group-dot {
                    width: 10px;
                    height: 10px;
                    border-radius: 50%;
                    display: inline-block;
                    flex-shrink: 0;
                }

                /* Sezione A: citazioni per nodo */
                .citations-by-node-section {
                    margin-bottom: 8px;
                }

                /* Separatore visivo tra sezione A e sezione B */
                .citations-section-divider {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    margin: 20px 0 14px 0;
                    color: #0369a1;
                    font-size: var(--pdf-section-title-size);
                    font-weight: 700;
                    text-transform: uppercase;
                    letter-spacing: 0.06em;
                    border-top: 2px solid #e0f2fe;
                    padding-top: 14px;
                }

                /* Sezione B: citazioni aggregate */
                .citations-aggregate {
                    padding-bottom: 8px;
                }

                /* Stili per le relazioni KG */
                .kg-relations {
                    display: flex;
                    flex-direction: column;
                    gap: 12px;
                    margin-top: 12px;
                }

                .kg-relations-list {
                    background: #fdfdfd;
                    border: 1px solid #f1f5f9;
                    padding: 12px;
                    border-radius: 8px;
                }

                .kg-relations-list strong {
                    font-size: 12px;
                    color: #475569;
                    display: block;
                    margin-bottom: 6px;
                }

                .kg-relations-list ul {
                    margin: 0;
                    padding-left: 16px;
                    list-style-type: none;
                }

                .kg-relations-list li {
                    font-size: 13px;
                    color: #334155;
                    margin-bottom: 4px;
                    font-family: var(--doc-font, 'Space Mono', monospace) !important;
                }

                .rel-arrow {
                    color: #94a3b8;
                }

                .rel-word {
                    color: #6366f1;
                    font-weight: bold;
                }

                .rel-target {
                    color: #0f172a;
                }

                /* ── Il piè: NON è più qui ──────────────────────────────────
                   Era un elemento .dossier-footer in position:fixed dentro
                   l'area di margine di @page. Tecnica ingegnosa e sbagliata: la
                   prova con Electron su un dossier di tre pagine ha mostrato che
                   la PRIMA pagina resta senza piè. Ora il piè stampato lo fanno
                   i margin-box di @page (che ci sono su tutte le pagine e sanno
                   contarle); a schermo lo disegna .mm-dh-pie della cornice.
                   (Niente apici inversi: siamo in un template literal.) */
            </style>
        </head>
        <body>
            <!-- Barra dei comandi (solo schermo): marchio e Stampa. Titolo e
                 sottotitolo sono usciti da qui e sono passati alla TESTATA qui
                 sotto, che a differenza di questa barra finisce sulla CARTA —
                 prima la pagina 1 di un dossier non diceva né di quale mappa
                 fosse né per quale classe. -->
            <div class="header no-print">
                <div style="display:flex;align-items:center;gap:14px;">
                    ${mappaiIconBase64 ? '<img src="' + mappaiIconBase64 + '" style="width:48px;height:48px;object-fit:contain;border-radius:10px;box-shadow:0 2px 8px rgba(0,0,0,0.15);" alt="MappAI">' : '<span style="font-weight:900;font-size:18px;color:#4F46E5;">MappAI</span>'}
                </div>
                <button class="btn-print" onclick="window.print()">Stampa Dossier</button>
            </div>
            ${_dsTestata(dossierTitle, dossierSubtitle, rootMapName)}
            <div class="dossier-container">
                ${asciiSectionHtml}
                ${dossierCardsHtml}
            </div>
            ${footerHtml}
        </body>
        </html>
    `;
        // Auto-salvataggio nell'archivio documenti (richiamabile dall'hub
        // Materiali di studio senza rigenerare). Best-effort.
        if (window.MappAIStudyDocs) {
            try {
                window.MappAIStudyDocs.save({
                    kind: 'dossier',
                    title: dossierTitle + (dossierSubtitle ? ' — ' + dossierSubtitle : ''),
                    mapName: rootMapName,
                    html: dossierHtml
                });
            } catch (e) { console.warn('[Dossier] Salvataggio documento fallito:', e); }
        }

        // Shell di stampa condivisa con la Sintesi (mappai-study-export-core.js):
        // popup-guard + write/close + stampa automatica.
        window.MappAIStudyExport.openPrintable(dossierHtml, {
            blockedMsg: window.t('tst_popup_blocked', "Impossibile aprire la finestra di stampa. Controlla il blocco popup del browser."),
            blockedLevel: 'error',
            autoPrint: true
        });
        window.closeDossierPrintModal();
    } catch (err) {
        console.error('[Dossier] Errore durante la generazione:', err);
        window.showToast('Errore generazione dossier: ' + err.message, 'error');
    }
};
