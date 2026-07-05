// ==========================================
// SEARCH FINDER LOGIC — estratto da app.js
// ==========================================
// Caricato DOPO app.js: usa appState/cleanLabel/getInheritedDatabase/handleNodeClick/
// openSourceModal/highlightQuery/safeCreateIcons/d3 via scope globale.
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
