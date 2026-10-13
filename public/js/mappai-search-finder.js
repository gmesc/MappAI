// ==========================================
// SEARCH FINDER LOGIC — estratto da app.js
// ==========================================
// Caricato DOPO app.js: usa appState/cleanLabel/getInheritedDatabase/handleNodeClick/
// openSourceModal/highlightQuery/safeCreateIcons/d3 via scope globale.
appState.searchQuery = "";

/* ── IL TESTO DEI DATI ENTRA COME TESTO (25/9/2026) ──────────────────────────
   Escape ed evidenziazione vengono dal nucleo puro mappai-html-sicuro.js. Se una
   copia non lo carica ancora (il reader dell'iPad copia questo file byte per byte)
   si ripiega su due funzioni identiche: la stessa <mark>, sul testo già passato
   dall'escape. */
function _htmlSicuroRicerca() {
    if (window.MappAIHtmlSicuro) return window.MappAIHtmlSicuro;
    const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => '&#' + c.charCodeAt(0) + ';');
    const evidenzia = (testo, cerca) => {
        const s = String(testo == null ? '' : testo), q = String(cerca == null ? '' : cerca);
        if (!q) return esc(s);
        const re = new RegExp('(' + q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'gi');
        return s.split(re).map((pezzo, i) => (i % 2)
            ? '<mark class="bg-black text-white px-1 rounded font-bold">' + esc(pezzo) + '</mark>' : esc(pezzo)).join('');
    };
    return { esc: esc, evidenzia: evidenzia };
}

/* Prende TESTO e restituisce HTML: la <mark> sul testo grezzo, il resto con
   l'escape. Fino al 25/9 la regex girava sul testo così com'era e lo restituiva
   com'era, tag compresi: chi la metteva in innerHTML (i risultati qui sotto, la
   scheda Focus di prima) ci metteva l'HTML del vault. Nell'app non la chiama più
   nessuno; resta per chi la chiamasse da fuori, e non può più riaprire il buco. */
window.highlightQuery = function (text, query) {
    return _htmlSicuroRicerca().evidenzia(text, query);
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
                // era `l.source`: `l` vive solo nel find qui sopra → ReferenceError al primo L2
                const sid = typeof link.source === 'object' ? link.source.id : link.source;
                current = appState.db.nodes.find(n => n.id === sid);
            } else {
                break;
            }
            depth++;
        }
        return current ? current.label : "Generale";
    };

    // Gruppi per Macro-Area. Senza prototipo: una macro-area che si chiama
    // «constructor» o «toString» trovava già un «gruppo» (del prototipo) senza push.
    const macroGroups = Object.create(null);

    appState.db.nodes.forEach(n => {
        const macro = getMacroArea(n.id);
        if (!macroGroups[macro]) macroGroups[macro] = [];

        // Check label
        if (n.label && String(n.label).toLowerCase().includes(q)) {
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
            /* le vecchie <mark> che il codice di prima scriveva DENTRO le note: la scheda e il
               dossier le tolgono a schermo, e anche qui (25/9, seconda revisione del ramo) */
            const Hn = window.MappAIHtmlSicuro;
            const testo = (Hn && Hn.togliEvidenziazioniVecchie) ? Hn.togliEvidenziazioniVecchie(db.text || '') : (db.text || '');
            const noteText = testo + " " + (db.title || "") + " " + (db.source || "");
            if (noteText.toLowerCase().includes(q)) {
                macroGroups[macro].push({ id: n.id, text: testo, title: db.title, source: db.source, type: 'note', node: n });
            }
        });
    });

    /* Macro-area, etichetta, desc e note sono del vault (anche di un collega) e
       entravano nell'HTML così com'erano; l'evidenziazione girava sul testo già
       fatto HTML. Ora tutto passa dall'escape e la <mark> la mette `evidenzia` sul
       testo grezzo. L'id del risultato, che stava dentro
       `onclick="…n.id==='${item.id}'…"`, resta in `risultati`: l'HTML porta solo il
       numero d'ordine, e lo legge l'ascolto delegato in fondo. */
    const H = _htmlSicuroRicerca();
    const risultati = [];
    let html = "";
    const sortedMacros = Object.keys(macroGroups).sort();

    for (const macroName of sortedMacros) {
        const items = macroGroups[macroName];
        if (items.length === 0) continue;

        html += `<div class="mb-6">
                    <h4 class="px-4 py-2 text-[10px] font-extrabold text-indigo-700 uppercase tracking-widest bg-indigo-50/50 border-y border-indigo-100 mb-2 flex items-center gap-2">
                        <i data-lucide="layers" class="w-3 h-3"></i> ${H.esc(macroName)} (${items.length})
                    </h4>
                    <div class="space-y-1 px-1">`;

        items.forEach(item => {
            // una nota trovata per il titolo o la fonte può non avere testo
            let preview = String(item.text == null ? '' : item.text);
            const isNote = item.type === 'note';
            const icon = isNote ? 'library' : (item.type === 'label' ? 'tag' : 'align-left');

            if (item.type === 'content' || item.type === 'note') {
                const idx = preview.toLowerCase().indexOf(q);
                const start = Math.max(0, idx - 40);
                const end = Math.min(preview.length, idx + 60);
                preview = (start > 0 ? "..." : "") + preview.substring(start, end) + (end < preview.length ? "..." : "");
            }

            const highlighted = H.evidenzia(preview, q);
            const label = H.esc(cleanLabel(item.node.label));

            html += `
                        <div class="group p-3 hover:bg-slate-50 rounded-xl cursor-pointer transition-all border border-transparent hover:border-slate-200" data-risultato="${risultati.push(item) - 1}">
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
    // riassegnato a ogni ricerca: un ascolto solo, sempre con i risultati di adesso
    resultsContainer.onclick = function (e) {
        const el = (e && e.target && e.target.closest) ? e.target.closest('[data-risultato]') : null;
        const it = el ? risultati[el.getAttribute('data-risultato')] : null;
        if (!it) return;
        window.handleNodeClick({ stopPropagation: () => { } }, appState.db.nodes.find(n => n.id === it.id));
        window.openSourceModal(it.id);
    };
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
