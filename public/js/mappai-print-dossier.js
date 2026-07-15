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
        '<div class="bg-white rounded-2xl shadow-2xl w-[90vw] max-w-[880px] p-8 relative">' +

            '<button type="button" onclick="document.getElementById(\'node-labels-print-modal\').remove()" ' +
                'class="absolute top-6 right-6 text-slate-400 hover:text-slate-600 transition-colors z-10">' +
                '<i data-lucide="x" class="w-6 h-6"></i>' +
            '</button>' +

            '<div class="space-y-6">' +

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
                    'Scegli fino a che livello di profondità includere.' +
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

                '<div class="pm-section">' +
                    '<span class="pm-section-title">Sfondo pagina</span>' +
                    '<div class="flex flex-wrap gap-8">' +
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

                '<div class="flex gap-3 pt-2 border-t border-slate-100">' +
                    '<button type="button" onclick="document.getElementById(\'node-labels-print-modal\').remove()" ' +
                        'class="pm-btn-cancel">Annulla</button>' +
                    '<button type="button" onclick="window.printAllNodeLabels()" ' +
                        'class="pm-btn-primary">' +
                        '<i data-lucide="printer" class="w-4 h-4"></i> Genera PDF' +
                    '</button>' +
                '</div>' +

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

window.printAllNodeLabels = async function () {
    // Leggi il livello selezionato dal modal (se aperto), poi chiudi il modal
    var selectedDepthEl = document.querySelector('input[name="nl-depth"]:checked');
    var maxLevel = selectedDepthEl && selectedDepthEl.value !== 'all'
        ? parseInt(selectedDepthEl.value, 10)
        : null;

    // Formato foglio (colonne × righe) e contenuto della card (title | summary | keywords)
    var FMT = { '3x4': { cols: 3, rows: 4 }, '2x2': { cols: 2, rows: 2 }, '2x1': { cols: 2, rows: 1 } };
    var selectedFmtEl = document.querySelector('input[name="nl-fmt"]:checked');
    var fmt = (selectedFmtEl && FMT[selectedFmtEl.value]) ? selectedFmtEl.value : '3x4';
    var cols = FMT[fmt].cols;
    var rowsPerPage = FMT[fmt].rows;
    var selectedLayoutEl = document.querySelector('input[name="nl-layout"]:checked');
    var layout = selectedLayoutEl ? selectedLayoutEl.value : 'title';
    if (fmt === '3x4') layout = 'title'; // 3×4 = solo titolo

    // Sfondo pagina: none | grid (quadretti 5 mm cyan)
    var selectedBgEl = document.querySelector('input[name="nl-bg"]:checked');
    var pageBg = selectedBgEl ? selectedBgEl.value : 'none';

    var modal = document.getElementById('node-labels-print-modal');
    if (modal) modal.remove();

    const allNodes = appState.db.nodes || [];
    const nodes = maxLevel !== null
        ? allNodes.filter(function (n) { return (n.level || 0) <= maxLevel; })
        : allNodes;

    if (nodes.length === 0) {
        window.showToast(window.t('tst_no_nodes', "Nessun nodo presente nella mappa."), "warning");
        return;
    }

    const projectTitle = appState.db?.rootNodeLabel || appState.rootNodeLabel || "Progetto MappAI";

    // Modalità "keywords": genera le parole chiave con AI (fallback deterministico
    // sui figli/desc se la chiamata fallisce o non c'è una API key)
    var keywordsMap = {};
    if (layout === 'keywords') {
        var kwApiKey = window.getSystemKey ? window.getSystemKey() : '';
        if (kwApiKey) {
            window.showLoadingOverlay(true, 'Genero le parole chiave dei nodi…');
            try {
                keywordsMap = await _generateNodeKeywords(nodes, kwApiKey) || {};
            } catch (kwErr) {
                console.warn('[Labels] Generazione keyword AI fallita, uso fallback:', kwErr);
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
        // Font VENDORIZZATO (public/js/vendor/spacemono-font.js) → offline, zero fetch.
        if (window.MappAISpaceMono && window.MappAISpaceMono.registerInto(doc)) {
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

    const marginX = 10;
    const marginY = 15;
    const pageWidth = 297;
    const pageHeight = 210;

    // Geometria: le card riempiono la pagina secondo il formato (colonne × righe).
    const colWidth = (pageWidth - 2 * marginX) / cols;
    const rowHeight = (pageHeight - 2 * marginY) / rowsPerPage;
    const PT2MM = 0.352778;
    const padX = 4;

    // Font per formato (card più grande = titolo/keyword più grandi)
    // Titoli in grassetto e +2pt rispetto alla versione base.
    const TITLE_PT = ({ '3x4': 22, '2x2': 28, '2x1': 32 })[fmt] || 22;
    const KW_PT = ({ '2x2': 13, '2x1': 15 })[fmt] || 12;
    const CARD_DESC_PT = ({ '2x2': 11, '2x1': 13 })[fmt] || 11; // corpo desc scheda

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

    let currentNodeIndex = 0;

    while (currentNodeIndex < nodes.length) {
        if (currentNodeIndex > 0) {
            doc.addPage();
        }
        drawPageGrid(); // sfondo prima delle card

        for (let r = 0; r < rowsPerPage; r++) {
            for (let c = 0; c < cols; c++) {
                if (currentNodeIndex >= nodes.length) break;

                const node = nodes[currentNodeIndex];
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

                const labelText = cleanLabel(node.label);
                doc.setTextColor(0, 0, 0);
                const maxTextWidth = colWidth - 2 * padX;

                if (layout === 'title') {
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
                } else if (layout === 'card') {
                    // "card": titolo compatto in alto + descrizione giustificata,
                    // sillabata, con concetti in grassetto, margini 4 mm dal taglio
                    const CARD_TITLE_PT = ({ '2x2': 20, '2x1': 24 })[fmt] || 20;
                    const boxLeft = x + 4;
                    const boxW = colWidth - 8;
                    doc.setFont(fontName, "bold");
                    doc.setFontSize(CARD_TITLE_PT);
                    const cTitleFH = CARD_TITLE_PT * PT2MM;
                    const cTitleLH = cTitleFH * 1.2;
                    const cTitleLines = doc.splitTextToSize(labelText, boxW).slice(0, 3);
                    let cty = y + 4 + cTitleFH;
                    cTitleLines.forEach(function (line) {
                        doc.text(line, boxLeft, cty, { align: 'left' });
                        cty += cTitleLH;
                    });
                    const descText = String(node.desc || node.content || '').trim();
                    if (descText) {
                        const descTop = cty + 1.5;
                        const descBottom = y + rowHeight - 4;
                        doc.setTextColor(30, 30, 30);
                        _drawJustifiedDesc(doc, descText, boxLeft, descTop, boxW, descBottom - descTop, fontName, CARD_DESC_PT, _cardBoldSet(node));
                        doc.setTextColor(0, 0, 0);
                    }
                } else {
                    // "summary" e "keywords": titolo ancorato in alto (grassetto)
                    doc.setFont(fontName, "bold");
                    doc.setFontSize(TITLE_PT);
                    const titleFH = TITLE_PT * PT2MM;
                    const titleLH = titleFH * 1.25;
                    const titleLines = doc.splitTextToSize(labelText, maxTextWidth).slice(0, 3);
                    let ty = y + 8 + titleFH;
                    titleLines.forEach(function (line) {
                        doc.text(line, x + colWidth / 2, ty, { align: 'center' });
                        ty += titleLH;
                    });

                    if (layout === 'keywords') {
                        // Keyword impaginate IN COLONNA, una per riga
                        const kws = (keywordsMap[node.id] || []).slice(0, 7);
                        if (kws.length) {
                            doc.setFont(fontName, "normal");
                            doc.setFontSize(KW_PT);
                            doc.setTextColor(90, 90, 90);
                            const kwFH = KW_PT * PT2MM;
                            const kwLH = kwFH * 1.55;
                            const maxKwBottom = y + rowHeight - 3;
                            ty += 3;
                            for (let ki = 0; ki < kws.length; ki++) {
                                if (ty + kwFH > maxKwBottom) break;
                                const kwLines = doc.splitTextToSize(kws[ki], maxTextWidth);
                                for (let li = 0; li < kwLines.length; li++) {
                                    if (ty + kwFH > maxKwBottom) break;
                                    doc.text(kwLines[li], x + colWidth / 2, ty, { align: 'center' });
                                    ty += kwLH;
                                }
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
            if (currentNodeIndex >= nodes.length) break;
        }
    }

    doc.save(`Label-${projectTitle}.pdf`);
    window.showToast(window.t('tst_labels_pdf', "Download PDF delle etichette avviato!"), "success");

    // Archivio documenti (005): il Foglio nodi è un PDF → salvato come data-URI,
    // riapribile dalla landing Insegna senza rigenerare.
    try {
        if (window.MappAIStudyDocs) {
            window.MappAIStudyDocs.save({
                kind: 'nodesheet',
                title: window.t('ui_node_sheet_btn', 'Foglio nodi') + ' — ' + projectTitle,
                mapName: projectTitle,
                pdf: doc.output('datauristring')
            });
        }
    } catch (e) { /* archivio best-effort */ }
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
function _drawJustifiedDesc(doc, text, boxX, boxY, boxW, boxH, fontName, sizePt, boldSet) {
    if (!text || boxH <= 0 || boxW <= 0) return;
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

        const projectTitle = appState.db.title || "Progetto MappAI";

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
        const footerLogoHtml = mappaiIconBase64
            ? '<img src="' + mappaiIconBase64 + '" alt="MappAI">'
            : '';
        const footerHtml = '<div class="dossier-footer"><div class="dossier-footer-left">' + footerLogoHtml + '<span>MappAI by insegnai.ch</span></div><div class="dossier-footer-right">' + rootMapName + '</div></div>';

        const dossierHtml = `
        <!DOCTYPE html>
        <html>
        <head>
            <title>Dossier ${projectTitle} ${isMM ? 'MM' : 'KG'}</title>
            <link href="https://fonts.googleapis.com/css2?family=Space+Mono:ital,wght@0,400;0,700;1,400;1,700&display=swap" rel="stylesheet">
            <style>
                :root {
                    /* --- MODIFICHE GLOBALI DI LAYOUT (Variabili CSS) --- */
                    /* Puoi modificare questi valori per cambiare rapidamente l'aspetto di tutto il dossier */

                    /* TIPOGRAFIA — fattore scala ${fontScale} applicato in automatico */
                    --pdf-scale: ${fontScale};
                    --pdf-font-family: 'Space Mono', monospace; /* Cambia qui il font del dossier */
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
                        /* margin-bottom = altezza footer: l'area contenuto finisce esattamente dove inizia il footer */
                        margin: 18mm 15mm 22mm 15mm;
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
                    font-family: 'Space Mono', monospace !important;
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
                    font-family: 'Space Mono', monospace !important;
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
                    font-family: 'Space Mono', monospace !important;
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

                /* ── Footer PDF: fisso in fondo a ogni pagina stampata ─────── */
                .dossier-footer {
                    position: fixed;
                    /* bottom: -22mm sposta il footer nell'area margine (@page margin-bottom: 22mm)
                       portando il bordo inferiore esattamente al bordo fisico del foglio */
                    bottom: -22mm;
                    /* left/right negativi: estende il footer al bordo fisico del foglio
                       compensando i margini laterali @page di 15mm */
                    left: -15mm;
                    right: -15mm;
                    box-sizing: border-box;
                    height: 22mm;
                    display: flex;
                    justify-content: space-between;
                    align-items: flex-end;
                    /* padding laterale 15mm = allineato ai margini del contenuto;
                       padding-bottom 13mm = testi a 13mm dal bordo fisico del foglio */
                    padding: 0 15mm 13mm;
                    font-size: 11px;
                    font-family: 'Space Mono', monospace;
                    background-color: white;
                }
                .dossier-footer-left {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    color: #a9b2c0ff;
                }
                .dossier-footer-left img {
                    width: 22px;
                    height: 22px;
                    object-fit: contain;
                    opacity: 1;
                }
                .dossier-footer-right {
                    color: #334155;
                    font-weight: bold;
                }
            </style>
        </head>
        <body>
            <div class="header no-print">
                <div style="display:flex;align-items:center;gap:14px;">
                    ${mappaiIconBase64 ? '<img src="' + mappaiIconBase64 + '" style="width:48px;height:48px;object-fit:contain;border-radius:10px;box-shadow:0 2px 8px rgba(0,0,0,0.15);" alt="MappAI">' : '<span style="font-weight:900;font-size:18px;color:#4F46E5;">MappAI</span>'}
                    <div>
                        <h1 class="dossier-main-title" style="margin:0;font-size:1.4rem;">${dossierTitle}</h1>
                        <p class="dossier-main-subtitle" style="margin:0;color:#64748b;font-size:0.95rem;">${dossierSubtitle}</p>
                    </div>
                </div>
                <button class="btn-print" onclick="window.print()">Stampa Dossier</button>
            </div>
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
