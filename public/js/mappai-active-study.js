/*
 * mappai-active-study.js — Modalità di STUDIO ATTIVO sulle mappe
 * --------------------------------------------------------------
 * L'allievo non guarda una mappa già fatta: la (ri)costruisce.
 * Si parte dal solo nodo radice + tutti i nodi "sciolti"; secondo la
 * modalità scelta lo studente collega, ordina, nomina o spiega.
 *
 * 7 MODALITÀ:
 *   1. Costruisci mappa personale  — tutti grigi; un nodo prende colore
 *      (diventa L1) solo quando viene collegato (anche transitivamente) al root.
 *   2. Ricostruisci gerarchie      — nodi col colore della loro area già dato;
 *      goal: ricollegare i rami nella struttura corretta (con verifica).
 *   3. Richiamo etichette          — struttura visibile, label nascoste;
 *      lo studente nomina ogni nodo, click rivela + auto-valutazione.
 *   4. Riempi le descrizioni       — struttura visibile, desc nascoste;
 *      lo studente scrive la propria spiegazione, poi confronta con la fonte.
 *   5. Trova l'intruso             — 1-2 nodi spostati nel ramo sbagliato;
 *      lo studente li ricolloca; verifica sul ramo d'origine.
 *   6. Verbi delle relazioni       — gerarchia data, verbi (rel) nascosti;
 *      lo studente sceglie il verbo da EDGE_FAMILIES; confronto per famiglia.
 *   7. Ordina la sequenza          — un ramo cronologico mescolato; lo studente
 *      ricollega i nodi in ordine; verifica sull'ordine originale.
 *
 * ARCHITETTURA (100% reversibile):
 *   - 1 sola edit ad app.js: guard in cima a window.handleNodeClick.
 *   - Tutto il resto qui: wrap di renderGraph per applicare l'overlay visivo
 *     (grigio / label nascoste / rel nascosti) dopo ogni render, e click
 *     namespaced sui path link per la modalità verbi.
 *   - enter() fa uno SNAPSHOT profondo (link, level, group, label, desc, x/y);
 *     exit()/rivelaSoluzione() ripristinano dallo snapshot → nessuna perdita dati.
 *
 * Caricare in index.html DOPO app.js (usa window.renderGraph, EDGE_FAMILIES,
 * window._nextFreeGroup, MappAIStructureAnalyzer, showToast, safeCreateIcons).
 */
(function () {
    'use strict';

    const GREY_FILL = '#d1d5db';   // slate-300
    const GREY_STROKE = '#9ca3af'; // slate-400
    const WRONG_STROKE = '#ef4444';
    const OK_STROKE = '#22c55e';

    function S() {
        try { return (typeof appState !== 'undefined') ? appState : window.appState; }
        catch (e) { return window.appState; }
    }
    function lid(x) { return (x && typeof x === 'object') ? x.id : x; }
    function clean(s) { return (window.cleanLabel ? window.cleanLabel(s) : (s || '')); }
    function toast(msg, type) { if (window.showToast) window.showToast(msg, type || 'info'); }

    // Definizione modalità (metadati per launcher + pannello)
    const MODES = {
        1: { icon: 'pencil-ruler', title: 'Costruisci mappa personale',
             hint: 'Tutti i nodi sono grigi. Collega i nodi tra loro: un nodo prende colore (diventa un ramo principale) solo quando lo colleghi al concetto centrale.',
             kind: 'link' },
        2: { icon: 'git-merge', title: 'Ricostruisci le gerarchie',
             hint: 'Ogni nodo ha già il colore della sua area. Ricollega i nodi per ricostruire i rami corretti, poi premi Verifica.',
             kind: 'link' },
        3: { icon: 'eye-off', title: 'Richiamo: nomina i nodi',
             hint: 'I nodi sono vuoti. Trascina (o tocca e poi clicca il nodo) le etichette dalla lista al posto giusto. Quando vuoi premi Confronta per il feedback.',
             kind: 'dragdrop' },
        4: { icon: 'feather', title: 'Riempi le descrizioni',
             hint: 'Clicca un nodo e scrivi con parole tue cosa significa. Poi confronta con la descrizione della fonte e valuta la tua spiegazione.',
             kind: 'reveal' },
        5: { icon: 'search', title: "Trova l'intruso",
             hint: '1 o 2 nodi sono stati spostati nel ramo sbagliato. Trovali e ricollegali al ramo giusto, poi premi Verifica.',
             kind: 'link' },
        6: { icon: 'spline', title: 'Verbi delle relazioni',
             hint: 'La struttura è corretta ma i verbi delle frecce sono nascosti. Clicca una freccia e scegli il verbo giusto. Poi Verifica.',
             kind: 'edge' },
        7: { icon: 'list-ordered', title: 'Ordina la sequenza',
             hint: 'I nodi di un processo cronologico sono mescolati. Ricollegali nell\'ordine corretto, poi premi Verifica.',
             kind: 'link' }
    };

    const ActiveStudy = window.ActiveStudy = {
        session: { active: false, mode: null, snapshot: null },
        _link1: null,
        _revealed: null,    // Set di id (mode3/4) o "selfgrade" tally
        _selfTally: null,   // { ok, ko }
        _wrong: null,       // Set di id evidenziati dopo verifica
        _displaced: null,   // [{id, originalParent}] per mode5
        _seqBranch: null,   // {ids:[...ordine originale]} per mode7
        _entries: null,     // dettaglio testi/risposte (mode3/4) per meta-analisi
        _placements: null,  // { nodeId: label } drag&drop (mode3)
        _chipSel: null,     // label attualmente selezionata (mode3, click-to-assign)
        _renderWrapped: false
    };

    // ---------------------------------------------------------------- snapshot
    function takeSnapshot() {
        const st = S();
        const nodes = st.db.nodes || [];
        const links = st.db.links || [];
        const snap = {
            links: links.map(l => ({ s: lid(l.source), t: lid(l.target), rel: l.rel, bidir: !!l.bidirectional, isCross: !!l.isCross })),
            nodes: {}
        };
        nodes.forEach(n => {
            snap.nodes[n.id] = {
                level: n.level, group: n.group,
                label: n.label, desc: n.desc, content: n.content,
                x: n.x, y: n.y, fx: n.fx, fy: n.fy
            };
        });
        // mappa genitore canonica dell'albero originale (per la verifica)
        snap.parentOf = {};
        snap.relOf = {};
        snap.links.forEach(l => {
            const ls = snap.nodes[l.s], lt = snap.nodes[l.t];
            if (!ls || !lt) return;
            // genitore = estremo col livello inferiore (albero gerarchico)
            if (typeof ls.level === 'number' && typeof lt.level === 'number' && ls.level === lt.level - 1) {
                snap.parentOf[l.t] = l.s;
                snap.relOf[l.t] = l.rel;
            }
        });
        return snap;
    }

    function restoreSnapshot() {
        const st = S();
        const snap = ActiveStudy.session.snapshot;
        if (!snap) return;
        // ripristina nodi
        (st.db.nodes || []).forEach(n => {
            const o = snap.nodes[n.id];
            if (!o) return;
            n.level = o.level; n.group = o.group;
            n.label = o.label; n.desc = o.desc; n.content = o.content;
            n.x = o.x; n.y = o.y; n.fx = o.fx; n.fy = o.fy;
        });
        // ripristina link
        st.db.links = snap.links.map(l => {
            const link = { source: l.s, target: l.t, rel: l.rel };
            if (l.bidir) link.bidirectional = true;
            if (l.isCross) link.isCross = true;
            return link;
        });
    }

    function findRoot() {
        const nodes = S().db.nodes || [];
        let root = nodes.find(n => n.level === 0);
        if (!root && S().rootNodeLabel) {
            root = nodes.find(n => clean(n.label) === clean(S().rootNodeLabel));
        }
        return root || null;
    }

    // ---------------------------------------------------------------- scatter
    function scatterLooseNodes() {
        const st = S();
        const nodes = st.db.nodes || [];
        const root = findRoot();
        const loose = nodes.filter(n => n !== root);
        const R = 260 + Math.min(loose.length * 6, 360);
        loose.forEach((n, i) => {
            const a = (i / Math.max(loose.length, 1)) * Math.PI * 2;
            const jitter = (i % 3) * 70;
            n.x = Math.cos(a) * (R + jitter);
            n.y = Math.sin(a) * (R + jitter);
            n.fx = null; n.fy = null;
        });
        if (root) { root.x = 0; root.y = 0; root.fx = 0; root.fy = 0; }
    }

    // ---------------------------------------------------------- recompute (M1)
    // BFS NON orientata dal root: robusta alla direzione con cui lo studente
    // crea i link. Profondità = livello; figli diretti del root = L1 colorati.
    function recomputeFromRoot(colorize) {
        const st = S();
        const nodes = st.db.nodes || [];
        const links = st.db.links || [];
        const root = findRoot();
        const byId = {}; nodes.forEach(n => byId[n.id] = n);
        nodes.forEach(n => { if (n !== root) { n.level = undefined; if (colorize) n.group = undefined; } });
        if (!root) return;

        const adj = {};
        links.forEach(l => {
            const s = lid(l.source), t = lid(l.target);
            (adj[s] = adj[s] || []).push(t);
            (adj[t] = adj[t] || []).push(s);
        });

        // gruppi L1 stabili
        const usedGroups = new Set();
        function nextGroup() {
            if (window._nextFreeGroup) { const g = window._nextFreeGroup(nodes); usedGroups.add(g); return g; }
            let g = 1; while (usedGroups.has(g)) g++; usedGroups.add(g); return g;
        }

        const queue = [root.id];
        const seen = new Set([root.id]);
        root.level = 0;
        while (queue.length) {
            const id = queue.shift();
            const node = byId[id];
            (adj[id] || []).forEach(nid => {
                if (seen.has(nid)) return;
                seen.add(nid);
                const child = byId[nid];
                child.level = (node.level || 0) + 1;
                if (colorize) {
                    if (child.level === 1) child.group = nextGroup();
                    else child.group = node.group;
                }
                queue.push(nid);
            });
        }
    }

    // ---------------------------------------------------------------- render
    function wrapRender() {
        if (ActiveStudy._renderWrapped) return;
        if (typeof window.renderGraph !== 'function') return;
        const orig = window.renderGraph;
        window.renderGraph = function () {
            orig.apply(this, arguments);
            try { if (ActiveStudy.session.active) afterRender(); } catch (e) { console.warn('[ActiveStudy] afterRender', e); }
        };
        ActiveStudy._renderWrapped = true;
    }

    function afterRender() {
        const st = ActiveStudy.session;
        const svg = d3.select('#map-svg');
        if (svg.empty()) return;
        const root = findRoot();

        const isLoose = d => d !== root && (d.level === undefined || d.level === null);

        // grigio per i nodi non collegati al root (mode 1)
        if (st.mode === 1) {
            svg.selectAll('circle.node-circle').each(function (d) {
                if (isLoose(d)) d3.select(this).attr('fill', GREY_FILL).attr('stroke', GREY_STROKE);
            });
        }

        // mode 3: label nascoste, mostra la label piazzata (drag&drop) o un placeholder
        if (st.mode === 3) {
            const pl = ActiveStudy._placements || {};
            svg.selectAll('text.node-text').each(function (d) {
                if (d.level === 0) return; // root sempre visibile
                const sel = d3.select(this);
                sel.selectAll('tspan').remove();
                if (pl[d.id]) { sel.text(pl[d.id]).attr('font-style', 'italic'); }
                else { sel.text('• • •').attr('font-style', null); }
            });
            // i nodi diventano bersagli di drop
            svg.selectAll('circle.node-hitbox')
                .on('dragover.activestudy', function (event) { event.preventDefault(); })
                .on('drop.activestudy', function (event, d) {
                    event.preventDefault();
                    const label = event.dataTransfer ? event.dataTransfer.getData('text/plain') : null;
                    if (label) placeLabel(d.id, label);
                });
        }

        // verbi nascosti + click sugli archi (mode 6)
        if (st.mode === 6) {
            svg.selectAll('text.link-label').each(function (d) {
                if (ActiveStudy._revealed && ActiveStudy._revealed.has(linkKey(d))) return;
                d3.select(this).text('?');
            });
            svg.selectAll('path.link').style('cursor', 'pointer')
                .on('click.activestudy', function (event, d) {
                    event.stopPropagation();
                    openVerbPicker(d);
                });
        }

        // evidenzia errori dopo Verifica
        if (ActiveStudy._wrong && ActiveStudy._wrong.size) {
            svg.selectAll('circle.node-circle').each(function (d) {
                if (ActiveStudy._wrong.has(d.id)) d3.select(this).attr('stroke', WRONG_STROKE).attr('stroke-width', 4);
            });
        }
    }

    function linkKey(l) { return lid(l.source) + '→' + lid(l.target); }

    // --------------------------------------------------------------- transforms
    function applyTransform(mode) {
        const st = S();
        const nodes = st.db.nodes || [];
        const root = findRoot();

        if (mode === 1) {
            st.db.links = [];
            nodes.forEach(n => { if (n !== root) { n.level = undefined; n.group = undefined; } });
        } else if (mode === 2) {
            st.db.links = [];
            // mantiene group (colore area), livello 1 per renderli colorati e pieni
            nodes.forEach(n => { if (n !== root) n.level = 1; });
        } else if (mode === 3 || mode === 4) {
            // struttura intatta: nessuna mutazione dei dati, solo overlay/modale
        } else if (mode === 5) {
            // sposta 1-2 foglie in un ramo sbagliato
            ActiveStudy._displaced = relocateIntruders();
        } else if (mode === 6) {
            // struttura intatta, verbi nascosti via overlay
        } else if (mode === 7) {
            ActiveStudy._seqBranch = setupSequenceBranch();
        }
    }

    // mode5: prende 1-2 foglie e le riaggancia a un L1 diverso
    function relocateIntruders() {
        const st = S();
        const nodes = st.db.nodes || [];
        const links = st.db.links || [];
        const snap = ActiveStudy.session.snapshot;
        const leaves = nodes.filter(n => {
            if (n.level === undefined || n.level <= 1) return false;
            return !links.some(l => lid(l.source) === n.id); // nessun figlio
        });
        const l1s = nodes.filter(n => n.level === 1);
        if (leaves.length < 1 || l1s.length < 2) return [];
        const displaced = [];
        const picks = leaves.sort(() => Math.random() - 0.5).slice(0, Math.min(2, leaves.length));
        picks.forEach(leaf => {
            const origParent = snap.parentOf[leaf.id];
            // scegli un L1 diverso dal ramo d'origine
            const targets = l1s.filter(h => h.group !== leaf.group && h.id !== origParent);
            const newParent = targets[Math.floor(Math.random() * targets.length)] || l1s[0];
            // rimuovi link entrante e crea quello sbagliato
            st.db.links = st.db.links.filter(l => lid(l.target) !== leaf.id);
            st.db.links.push({ source: newParent.id, target: leaf.id, rel: 'collega' });
            leaf.group = newParent.group; leaf.level = newParent.level + 1;
            displaced.push({ id: leaf.id, originalParent: origParent });
        });
        return displaced;
    }

    // mode7: trova un ramo "cronologico" (più nodi con data) o il ramo più lungo
    function setupSequenceBranch() {
        const st = S();
        const nodes = st.db.nodes || [];
        const snap = ActiveStudy.session.snapshot;
        // raggruppa per group (ramo); scegli quello con più figli sequenziali
        const byGroup = {};
        nodes.forEach(n => { if (n.level >= 1) (byGroup[n.group] = byGroup[n.group] || []).push(n); });
        let best = null, bestLen = 0;
        Object.values(byGroup).forEach(arr => { if (arr.length > bestLen) { bestLen = arr.length; best = arr; } });
        if (!best || best.length < 3) { toast('Nessun ramo abbastanza lungo per la sequenza', 'warning'); return null; }
        // ordine originale = per livello poi per ordine nei nodi
        const ordered = best.slice().sort((a, b) => (a.level - b.level));
        const ids = ordered.map(n => n.id);
        // strippa i link interni a questo ramo, lascia il resto
        const idset = new Set(ids);
        st.db.links = st.db.links.filter(l => !(idset.has(lid(l.source)) && idset.has(lid(l.target))));
        return { ids };
    }

    // --------------------------------------------------------------- click API
    // Ritorna true se ActiveStudy ha "consumato" il click (app.js esce subito).
    ActiveStudy.handleNodeClick = function (d) {
        const st = ActiveStudy.session;
        if (!st.active) return false;
        const mode = st.mode;

        if (mode === 6) { toast('In questa modalità si cliccano le frecce, non i nodi', 'info'); return true; }

        if (mode === 3) {
            if (d.level === 0) return true; // root non assegnabile
            if (ActiveStudy._chipSel) { placeLabel(d.id, ActiveStudy._chipSel); ActiveStudy._chipSel = null; refreshChipPanel(); }
            else if (ActiveStudy._placements && ActiveStudy._placements[d.id]) {
                // clic su nodo già assegnato senza chip selezionata → rimuovi (ripensaci)
                delete ActiveStudy._placements[d.id];
                window.renderGraph(); refreshChipPanel();
            } else { toast('Seleziona prima un\'etichetta dalla lista', 'info'); }
            return true;
        }
        if (mode === 4) { openDescWriter(d); return true; }

        // modalità di collegamento (1, 2, 5, 7)
        if (!ActiveStudy._link1) {
            ActiveStudy._link1 = d;
            highlightSource(d, true);
            setPanelStatus(`Collega "${clean(d.label)}" a…  (clic sul secondo nodo)`);
            return true;
        }
        if (ActiveStudy._link1.id === d.id) { // annulla
            highlightSource(d, false);
            ActiveStudy._link1 = null;
            setPanelStatus('');
            return true;
        }
        createStudyLink(ActiveStudy._link1, d);
        highlightSource(ActiveStudy._link1, false);
        ActiveStudy._link1 = null;
        setPanelStatus('');
        return true;
    };

    function highlightSource(d, on) {
        d3.select('#map-svg').selectAll('circle.node-circle').each(function (n) {
            if (n.id === d.id) d3.select(this).attr('stroke', on ? '#4f46e5' : null).attr('stroke-width', on ? 5 : null);
        });
    }

    function createStudyLink(a, b) {
        const st = S();
        // direzione: genitore = nodo col livello inferiore se noto, altrimenti a→b
        let parent = a, child = b;
        if (typeof a.level === 'number' && typeof b.level === 'number' && b.level < a.level) { parent = b; child = a; }
        const rel = (ActiveStudy.session.snapshot.relOf[child.id]) || 'collega';
        // evita duplicati
        const exists = st.db.links.some(l =>
            (lid(l.source) === parent.id && lid(l.target) === child.id) ||
            (lid(l.source) === child.id && lid(l.target) === parent.id));
        if (!exists) st.db.links.push({ source: parent.id, target: child.id, rel: rel });
        if (ActiveStudy.session.mode === 1) recomputeFromRoot(true);
        if (window.updateDegreeStats) window.updateDegreeStats();
        ActiveStudy._wrong = null;
        window.renderGraph();
    }

    // -------------------------------------------------------------- mode 3 drag&drop
    // Pannello con tutte le etichette mescolate; chip trascinabile o cliccabile.
    function buildChipPanel() {
        const old = document.getElementById('as-chip-panel'); if (old) old.remove();
        const root = findRoot();
        const labels = (S().db.nodes || [])
            .filter(n => n !== root)
            .map(n => clean(n.label))
            .filter(Boolean);
        // mescola
        for (let i = labels.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [labels[i], labels[j]] = [labels[j], labels[i]]; }

        const panel = document.createElement('div');
        panel.id = 'as-chip-panel';
        panel.style.cssText = 'position:fixed;top:80px;left:20px;z-index:9998;width:240px;max-height:calc(100vh - 120px);overflow:auto;background:#fff;border:1px solid #e2e8f0;border-radius:16px;box-shadow:0 10px 40px rgba(0,0,0,.16);padding:14px;font-family:system-ui,sans-serif';
        panel.innerHTML = `<div style="font-weight:700;color:#0f172a;font-size:13.5px;margin-bottom:4px">Etichette</div>
            <div style="font-size:11.5px;color:#94a3b8;margin-bottom:10px">Trascina o tocca, poi clicca un nodo</div>
            <div id="as-chip-list"></div>`;
        document.body.appendChild(panel);
        ActiveStudy._chipLabels = labels;
        refreshChipPanel();
    }

    function refreshChipPanel() {
        const list = document.getElementById('as-chip-list');
        if (!list) return;
        const placed = new Set(Object.values(ActiveStudy._placements || {}));
        list.innerHTML = '';
        (ActiveStudy._chipLabels || []).forEach(label => {
            const used = placed.has(label);
            const sel = (ActiveStudy._chipSel === label);
            const chip = document.createElement('div');
            chip.textContent = label;
            chip.draggable = !used;
            chip.style.cssText = `padding:7px 10px;margin-bottom:6px;border-radius:9px;font-size:12.5px;cursor:${used ? 'default' : 'grab'};border:1.5px solid ${sel ? '#4f46e5' : '#e2e8f0'};background:${used ? '#f1f5f9' : (sel ? '#eef2ff' : '#fff')};color:${used ? '#94a3b8' : '#334155'};${used ? 'text-decoration:line-through' : ''}`;
            if (!used) {
                chip.addEventListener('dragstart', e => { e.dataTransfer.setData('text/plain', label); e.dataTransfer.effectAllowed = 'move'; });
                chip.addEventListener('click', () => { ActiveStudy._chipSel = (ActiveStudy._chipSel === label) ? null : label; refreshChipPanel(); });
            }
            list.appendChild(chip);
        });
    }

    function placeLabel(nodeId, label) {
        ActiveStudy._placements = ActiveStudy._placements || {};
        // una label sta su un solo nodo: rimuovi precedente assegnazione
        Object.keys(ActiveStudy._placements).forEach(k => { if (ActiveStudy._placements[k] === label) delete ActiveStudy._placements[k]; });
        ActiveStudy._placements[nodeId] = label;
        ActiveStudy._wrong = null;
        window.renderGraph();
        refreshChipPanel();
    }

    // -------------------------------------------------------------- mode 4 desc
    function openDescWriter(d) {
        const snap = ActiveStudy.session.snapshot.nodes[d.id] || {};
        const original = snap.desc || snap.content || '(nessuna descrizione nella fonte)';
        const modal = buildModal(`Spiega: ${clean(d.label)}`, `
            <p style="color:#64748b;font-size:13px;margin:0 0 8px">Scrivi con parole tue cosa significa questo concetto.</p>
            <textarea id="as-desc-input" rows="5" style="width:100%;border:1px solid #cbd5e1;border-radius:10px;padding:10px;font-size:14px;resize:vertical"></textarea>
            <div id="as-desc-compare" style="display:none;margin-top:12px">
                <div style="font-weight:600;color:#334155;margin-bottom:4px">Descrizione della fonte:</div>
                <div style="background:#f1f5f9;border-radius:10px;padding:10px;font-size:14px;color:#334155;line-height:1.5">${escapeHtml(original)}</div>
            </div>
            <div id="as-desc-feedback" style="display:none;margin-top:12px"></div>
        `, [
            { label: 'Confronta', primary: true, id: 'as-desc-compare-btn' },
            { label: 'Chiudi', id: 'as-desc-close' }
        ]);
        const closeBtn = modal.querySelector('#as-desc-close');
        closeBtn.onclick = () => modal.remove();

        modal.querySelector('#as-desc-compare-btn').onclick = async () => {
            const student = (modal.querySelector('#as-desc-input').value || '').trim();
            if (!student) { toast('Scrivi prima la tua spiegazione', 'warning'); return; }
            modal.querySelector('#as-desc-compare').style.display = 'block';
            const cmpBtn = modal.querySelector('#as-desc-compare-btn');
            cmpBtn.style.display = 'none';
            const fb = modal.querySelector('#as-desc-feedback');
            fb.style.display = 'block';

            const apiKey = window.getSystemKey ? window.getSystemKey() : null;
            if (!apiKey) { renderManualSelfGrade(fb, d, student, original); return; }

            fb.innerHTML = `<div style="color:#64748b;font-size:13px;display:flex;align-items:center;gap:8px">
                <span class="as-spinner" style="width:14px;height:14px;border:2px solid #c7d2fe;border-top-color:#4f46e5;border-radius:50%;display:inline-block;animation:as-spin .7s linear infinite"></span>
                Valutazione AI in corso…</div>`;
            try {
                const res = await scoreDesc(student, original, clean(d.label));
                const ok = res.accuracy >= 60;
                ActiveStudy._selfTally = ActiveStudy._selfTally || { ok: 0, ko: 0 };
                if (ok) ActiveStudy._selfTally.ok++; else ActiveStudy._selfTally.ko++;
                ActiveStudy._entries = ActiveStudy._entries || [];
                ActiveStudy._entries.push({ label: clean(d.label), userText: student, accuracy: res.accuracy, isCorrect: ok, source: original, feedback: res.feedback, gradedBy: 'ai' });
                updatePanelScore();
                const barColor = ok ? '#22c55e' : '#f59e0b';
                fb.innerHTML = `
                    <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
                        <span style="font-weight:700;font-size:18px;color:${barColor}">${res.accuracy}%</span>
                        <span style="font-weight:600;color:${ok ? '#15803d' : '#b45309'}">${ok ? '✓ Corretta' : '↻ Da rivedere'}</span>
                    </div>
                    <div style="background:#e2e8f0;border-radius:6px;height:8px;overflow:hidden;margin-bottom:10px">
                        <div style="height:100%;width:${res.accuracy}%;background:${barColor}"></div>
                    </div>
                    <div style="font-size:13.5px;color:#334155;line-height:1.5">${escapeHtml(res.feedback)}</div>`;
            } catch (e) {
                console.warn('[ActiveStudy] scoreDesc', e);
                fb.innerHTML = `<div style="color:#64748b;font-size:13px;margin-bottom:8px">Valutazione AI non disponibile. Valuta tu:</div>`;
                renderManualSelfGrade(fb, d, student, original);
            }
        };
    }

    // Fallback manuale (no API key o errore): ✓/✗ dentro il modale, niente auto-chiusura
    function renderManualSelfGrade(container, d, studentText, source) {
        ActiveStudy._selfTally = ActiveStudy._selfTally || { ok: 0, ko: 0 };
        ActiveStudy._entries = ActiveStudy._entries || [];
        container.style.display = 'block';
        const wrap = document.createElement('div');
        wrap.innerHTML = `<div style="font-size:13.5px;color:#334155;margin-bottom:8px">La tua spiegazione copre i concetti chiave?</div>
            <div style="display:flex;gap:8px">
                <button id="as-md-ok" style="background:#22c55e;color:#fff;border:0;border-radius:10px;padding:8px 14px;cursor:pointer;font-weight:600">✓ Sì</button>
                <button id="as-md-ko" style="background:#ef4444;color:#fff;border:0;border-radius:10px;padding:8px 14px;cursor:pointer;font-weight:600">✗ No</button>
            </div>`;
        container.appendChild(wrap);
        const record = (ok) => ActiveStudy._entries.push({ label: clean(d.label), userText: studentText || '', accuracy: ok ? 100 : 0, isCorrect: ok, source: source || '', gradedBy: 'self' });
        wrap.querySelector('#as-md-ok').onclick = () => { ActiveStudy._selfTally.ok++; record(true); updatePanelScore(); wrap.innerHTML = '<div style="color:#15803d;font-weight:600;font-size:13.5px">✓ Segnato come corretto</div>'; };
        wrap.querySelector('#as-md-ko').onclick = () => { ActiveStudy._selfTally.ko++; record(false); updatePanelScore(); wrap.innerHTML = '<div style="color:#b45309;font-weight:600;font-size:13.5px">↻ Segnato da rivedere</div>'; };
    }

    // Chiede all'AI un punteggio di copertura concettuale (0-100) + feedback breve
    async function scoreDesc(student, reference, label) {
        const apiKey = window.getSystemKey();
        const sys = 'Sei un tutor didattico per studenti BES/DSA. Valuti quanto la spiegazione di uno studente copre i CONCETTI CHIAVE di una descrizione di riferimento. Conta il contenuto, non la forma o la lunghezza. Sii incoraggiante ma onesto.';
        const prompt = `Concetto: "${label}"

Descrizione di riferimento (fonte):
${reference}

Spiegazione dello studente:
${student}

Valuta da 0 a 100 quanto la spiegazione dello studente copre i concetti chiave del riferimento. Rispondi SOLO con un oggetto JSON, senza testo prima o dopo:
{"accuracy": <numero 0-100>, "feedback": "<1-2 frasi in italiano: cosa ha colto e cosa manca>"}`;
        const payload = {
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            systemInstruction: { parts: [{ text: sys }] },
            generationConfig: { temperature: 0.2, maxOutputTokens: 512 }
        };
        const resp = await window.fetchModelAPI(payload, apiKey);
        const txt = resp?.candidates?.[0]?.content?.parts?.[0]?.text || '';
        const parsed = window.salvageTruncatedJSON ? window.salvageTruncatedJSON(txt) : JSON.parse(txt);
        let acc = Number(parsed && parsed.accuracy);
        if (!isFinite(acc)) acc = 0;
        acc = Math.max(0, Math.min(100, Math.round(acc)));
        return { accuracy: acc, feedback: (parsed && parsed.feedback) || '' };
    }

    // -------------------------------------------------------------- mode 6 verbs
    function openVerbPicker(linkDatum) {
        const families = (typeof EDGE_FAMILIES === 'object') ? EDGE_FAMILIES : {};
        const origRel = ActiveStudy.session.snapshot.relOf[lid(linkDatum.target)] ||
            (ActiveStudy.session.snapshot.links.find(l => l.s === lid(linkDatum.source) && l.t === lid(linkDatum.target)) || {}).rel || '';
        const origFam = window.getEdgeFamilyKey ? window.getEdgeFamilyKey(origRel) : 'altro';
        let rows = '';
        Object.entries(families).forEach(([key, fam]) => {
            rows += `<button class="as-verb" data-key="${key}" style="display:flex;align-items:center;gap:10px;width:100%;text-align:left;background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:10px 12px;margin-bottom:6px;cursor:pointer">
                <span style="width:14px;height:14px;border-radius:50%;background:${fam.color};flex:0 0 auto"></span>
                <span style="font-weight:600;color:#334155">${fam.label}</span>
                <span style="color:#94a3b8;font-size:12px;margin-left:auto">${(fam.keywords || []).slice(0, 3).join(', ')}</span>
            </button>`;
        });
        const a = clean((S().db.nodes.find(n => n.id === lid(linkDatum.source)) || {}).label);
        const b = clean((S().db.nodes.find(n => n.id === lid(linkDatum.target)) || {}).label);
        const modal = buildModal('Che relazione c\'è?', `
            <p style="color:#64748b;font-size:13px;margin:0 0 10px"><b>${a}</b> &nbsp;→&nbsp; <b>${b}</b></p>
            ${rows}
        `, [{ label: 'Annulla', id: 'as-verb-cancel' }]);
        modal.querySelector('#as-verb-cancel').onclick = () => modal.remove();
        modal.querySelectorAll('.as-verb').forEach(btn => {
            btn.onclick = () => {
                const chosen = btn.getAttribute('data-key');
                ActiveStudy._selfTally = ActiveStudy._selfTally || { ok: 0, ko: 0 };
                const correct = (chosen === origFam);
                if (correct) ActiveStudy._selfTally.ok++; else ActiveStudy._selfTally.ko++;
                ActiveStudy._entries = ActiveStudy._entries || [];
                ActiveStudy._entries.push({ source: a, target: b, chosenFamily: chosen, correctFamily: origFam, correctRel: origRel, isCorrect: correct });
                // rivela il verbo originale sull'arco
                ActiveStudy._revealed = ActiveStudy._revealed || new Set();
                ActiveStudy._revealed.add(linkKey(linkDatum));
                // scrivi il rel vero nei dati così la label compare
                const realLink = S().db.links.find(l => lid(l.source) === lid(linkDatum.source) && lid(l.target) === lid(linkDatum.target));
                if (realLink) realLink.rel = origRel || realLink.rel;
                modal.remove();
                window.renderGraph();
                updatePanelScore();
                toast(correct ? `Esatto: «${origRel}»` : `Era «${origRel}» (famiglia: ${(families[origFam] || {}).label || origFam})`, correct ? 'success' : 'warning');
            };
        });
    }

    function pct(ok, tot) { return tot ? Math.round(100 * ok / tot) : 0; }

    // --------------------------------------------------------------- VERIFICA
    ActiveStudy.verifica = function () {
        const mode = ActiveStudy.session.mode;
        const snap = ActiveStudy.session.snapshot;
        ActiveStudy._wrong = new Set();
        const nodesById = {}; (S().db.nodes || []).forEach(n => nodesById[n.id] = n);
        let summary;

        if (mode === 1) {
            // mappa personale: nessuna soluzione unica → statistiche
            const nodes = S().db.nodes || [];
            const connected = nodes.filter(n => typeof n.level === 'number').length;
            const l1 = nodes.filter(n => n.level === 1).length;
            const maxLvl = nodes.reduce((m, n) => Math.max(m, n.level || 0), 0);
            setPanelResult(`Mappa personale: <b>${connected}/${nodes.length}</b> nodi collegati · <b>${l1}</b> rami principali · profondità <b>${maxLvl}</b>.`);
            summary = { score: connected, total: nodes.length, accuracy: pct(connected, nodes.length), scoreText: `${connected}/${nodes.length} nodi`, entries: [] };
        }
        else if (mode === 3) {
            // confronto drag&drop: etichetta piazzata vs etichetta reale
            const pl = ActiveStudy._placements || {};
            const root = findRoot();
            const targets = (S().db.nodes || []).filter(n => n !== root);
            let ok = 0;
            const entries = [];
            targets.forEach(n => {
                const placed = pl[n.id] || null;
                const correctLabel = clean(n.label);
                const correct = placed === correctLabel;
                if (correct) ok++; else ActiveStudy._wrong.add(n.id);
                entries.push({ nodeId: n.id, placed: placed, correct: correctLabel, isCorrect: correct });
            });
            const tot = targets.length;
            setPanelResult(`Etichette: <b>${ok}/${tot}</b> al posto giusto (${pct(ok, tot)}%).` + (ActiveStudy._wrong.size ? ' I nodi in rosso sono sbagliati.' : ' 🎉 Perfetto!'));
            summary = { score: ok, total: tot, accuracy: pct(ok, tot), scoreText: `${ok}/${tot}`, entries: entries };
            window.renderGraph();
        }
        else if (mode === 4) {
            const t = ActiveStudy._selfTally || { ok: 0, ko: 0 };
            const tot = t.ok + t.ko;
            setPanelResult(`Descrizioni: <b>${t.ok}/${tot}</b> corrette (${pct(t.ok, tot)}%).`);
            summary = { score: t.ok, total: tot, accuracy: pct(t.ok, tot), scoreText: `${t.ok}/${tot}`, entries: (ActiveStudy._entries || []) };
        }
        else if (mode === 6) {
            const t = ActiveStudy._selfTally || { ok: 0, ko: 0 };
            const tot = t.ok + t.ko;
            setPanelResult(`Verbi: <b>${t.ok}/${tot}</b> famiglie corrette (${pct(t.ok, tot)}%).`);
            summary = { score: t.ok, total: tot, accuracy: pct(t.ok, tot), scoreText: `${t.ok}/${tot}`, entries: (ActiveStudy._entries || []) };
        }
        else {
            // modalità gerarchiche (2, 5, 7): confronto con l'albero originale
            const studentParent = buildStudentParentMap();
            if (mode === 5) {
                const disp = ActiveStudy._displaced || [];
                let ok = 0;
                disp.forEach(d => { if (studentParent[d.id] === d.originalParent) ok++; else ActiveStudy._wrong.add(d.id); });
                setPanelResult(`Intrusi ricollocati: <b>${ok}/${disp.length}</b> corretti.` + (ActiveStudy._wrong.size ? ' Quelli in rosso sono ancora nel ramo sbagliato.' : ' 🎉'));
                summary = { score: ok, total: disp.length, accuracy: pct(ok, disp.length), scoreText: `${ok}/${disp.length}`, entries: [] };
            } else if (mode === 7) {
                const ids = (ActiveStudy._seqBranch || {}).ids || [];
                let ok = 0;
                for (let i = 1; i < ids.length; i++) { if (studentParent[ids[i]] === ids[i - 1]) ok++; else ActiveStudy._wrong.add(ids[i]); }
                const tot = Math.max(ids.length - 1, 1);
                setPanelResult(`Sequenza: <b>${ok}/${tot}</b> collegamenti nell'ordine giusto.`);
                summary = { score: ok, total: tot, accuracy: pct(ok, tot), scoreText: `${ok}/${tot}`, entries: [] };
            } else {
                // mode 2
                let ok = 0, tot = 0;
                Object.keys(snap.parentOf).forEach(childId => {
                    tot++;
                    if (studentParent[childId] === snap.parentOf[childId]) ok++;
                    else ActiveStudy._wrong.add(childId);
                });
                setPanelResult(`Gerarchia: <b>${ok}/${tot}</b> collegamenti corretti (${pct(ok, tot)}%).` + (ActiveStudy._wrong.size ? ' I nodi in rosso hanno il genitore sbagliato.' : ' 🎉 Perfetto!'));
                summary = { score: ok, total: tot, accuracy: pct(ok, tot), scoreText: `${ok}/${tot}`, entries: [] };
            }
            window.renderGraph();
        }

        saveStudyScore(summary);
    };

    // Salva lo score nel vault: Studio Attivo/storico_score.md + sessioni.jsonl
    async function saveStudyScore(summary) {
        try {
            if (!window.electronAPI || !window.electronAPI.saveStudyRecord) return;
            const st = S();
            const now = new Date();
            const dateStr = `${String(now.getDate()).padStart(2, '0')}-${String(now.getMonth() + 1).padStart(2, '0')}-${now.getFullYear()}`;
            const timeStr = now.toTimeString().slice(0, 5);
            const mode = ActiveStudy.session.mode;
            const modeTitle = (MODES[mode] || {}).title || ('Modalità ' + mode);
            const project = st.rootNodeLabel || 'Mappa';
            let md = `- **${timeStr}** · ${mode}. ${modeTitle} · "${project}" · **${summary.scoreText}**`;
            if (summary.accuracy != null) md += ` (${summary.accuracy}%)`;
            md += '\n';
            const jsonRecord = {
                timestamp: now.toISOString(), date: dateStr, time: timeStr,
                mode: mode, modeTitle: modeTitle, project: project,
                score: summary.score, total: summary.total, accuracy: summary.accuracy,
                entries: summary.entries || []
            };
            const r = await window.electronAPI.saveStudyRecord({
                vaultPath: st.activeVaultPath || null,
                dateStr: dateStr, markdownLine: md, jsonRecord: jsonRecord
            });
            if (r && r.success) toast('Punteggio salvato in «Studio Attivo»', 'success');
            else if (r && r.error) console.warn('[ActiveStudy] saveStudyRecord', r.error);
        } catch (e) { console.warn('[ActiveStudy] saveStudyScore', e); }
    }

    function buildStudentParentMap() {
        // BFS dal root sui link attuali → genitore di ogni nodo
        const nodes = S().db.nodes || [];
        const links = S().db.links || [];
        const root = findRoot();
        const parent = {};
        if (!root) return parent;
        const adj = {};
        links.forEach(l => {
            const s = lid(l.source), t = lid(l.target);
            (adj[s] = adj[s] || []).push(t);
            (adj[t] = adj[t] || []).push(s);
        });
        const seen = new Set([root.id]);
        const q = [root.id];
        while (q.length) {
            const id = q.shift();
            (adj[id] || []).forEach(nid => {
                if (seen.has(nid)) return;
                seen.add(nid); parent[nid] = id; q.push(nid);
            });
        }
        return parent;
    }

    // ----------------------------------------------------------------- enter/exit
    ActiveStudy.enter = function (mode) {
        mode = Number(mode);
        if (!MODES[mode]) return;
        const root = findRoot();
        if (!root) { toast('Serve una mappa con un nodo centrale (radice) per lo studio attivo', 'error'); return; }
        if (ActiveStudy.session.active) restoreSnapshot(); // pulizia da una sessione precedente

        ActiveStudy.session.snapshot = takeSnapshot();
        ActiveStudy.session.mode = mode;
        ActiveStudy.session.active = true;
        ActiveStudy._link1 = null;
        ActiveStudy._revealed = new Set();
        ActiveStudy._selfTally = { ok: 0, ko: 0 };
        ActiveStudy._wrong = null;
        ActiveStudy._displaced = null;
        ActiveStudy._seqBranch = null;
        ActiveStudy._entries = [];
        ActiveStudy._placements = {};
        ActiveStudy._chipSel = null;

        wrapRender();
        applyTransform(mode);
        if (mode === 1 || mode === 2 || mode === 7 || mode === 5) scatterLooseNodes();
        if (window.updateDegreeStats) window.updateDegreeStats();
        window.renderGraph();
        showPanel(mode);
        if (mode === 3) buildChipPanel();
    };

    ActiveStudy.rivelaSoluzione = function () {
        restoreSnapshot();
        ActiveStudy._wrong = null;
        if (window.updateDegreeStats) window.updateDegreeStats();
        window.renderGraph();
        setPanelResult('Soluzione mostrata: questa è la mappa originale. Premi "Riprova" per ricominciare o "Esci".');
    };

    ActiveStudy.riprova = function () {
        const mode = ActiveStudy.session.mode;
        restoreSnapshot();
        ActiveStudy.enter(mode);
    };

    ActiveStudy.exit = function () {
        restoreSnapshot();
        ActiveStudy.session.active = false;
        ActiveStudy.session.mode = null;
        ActiveStudy._link1 = null;
        // togli i click namespaced sugli archi
        const svg = d3.select('#map-svg');
        if (!svg.empty()) svg.selectAll('path.link').on('click.activestudy', null);
        if (svg && !svg.empty()) svg.selectAll('circle.node-hitbox').on('dragover.activestudy', null).on('drop.activestudy', null);
        if (window.updateDegreeStats) window.updateDegreeStats();
        window.renderGraph();
        const p = document.getElementById('active-study-panel'); if (p) p.remove();
        const cp = document.getElementById('as-chip-panel'); if (cp) cp.remove();
        const sg = document.getElementById('as-selfgrade'); if (sg) sg.remove();
    };

    // ------------------------------------------------------------------- UI
    function escapeHtml(s) { const d = document.createElement('div'); d.textContent = s || ''; return d.innerHTML; }

    function buildModal(title, bodyHtml, buttons) {
        const overlay = document.createElement('div');
        overlay.className = 'as-modal-overlay';
        overlay.style.cssText = 'position:fixed;inset:0;z-index:10000;background:rgba(15,23,42,.45);display:flex;align-items:center;justify-content:center;font-family:system-ui,sans-serif';
        const card = document.createElement('div');
        card.style.cssText = 'background:#fff;border-radius:16px;max-width:520px;width:92%;max-height:84vh;overflow:auto;box-shadow:0 20px 60px rgba(0,0,0,.3);padding:22px';
        let btnHtml = '';
        (buttons || []).forEach(b => {
            const style = b.primary
                ? 'background:#4f46e5;color:#fff'
                : 'background:#f1f5f9;color:#334155';
            btnHtml += `<button id="${b.id}" style="${style};border:0;border-radius:10px;padding:9px 16px;cursor:pointer;font-weight:600;margin-left:8px">${b.label}</button>`;
        });
        card.innerHTML = `<h3 style="margin:0 0 14px;font-size:18px;color:#0f172a;font-weight:700">${escapeHtml(title)}</h3>
            <div>${bodyHtml}</div>
            <div style="display:flex;justify-content:flex-end;margin-top:18px">${btnHtml}</div>`;
        overlay.appendChild(card);
        overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
        document.body.appendChild(overlay);
        overlay.remove = function () { if (overlay.parentNode) overlay.parentNode.removeChild(overlay); };
        return overlay;
    }

    // Launcher: scelta della modalità
    ActiveStudy.openLauncher = function () {
        if (!findRoot()) { toast('Apri una mappa con un nodo centrale per usare lo studio attivo', 'error'); return; }
        let cards = '';
        Object.entries(MODES).forEach(([num, m]) => {
            cards += `<button class="as-mode-card" data-mode="${num}" style="display:flex;gap:12px;align-items:flex-start;width:100%;text-align:left;background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:12px 14px;margin-bottom:8px;cursor:pointer;transition:border-color .15s">
                <i data-lucide="${m.icon}" style="width:22px;height:22px;color:#4f46e5;flex:0 0 auto;margin-top:2px"></i>
                <span><span style="display:block;font-weight:700;color:#0f172a;margin-bottom:2px">${num}. ${m.title}</span>
                <span style="display:block;font-size:12.5px;color:#64748b;line-height:1.45">${m.hint}</span></span>
            </button>`;
        });
        const modal = buildModal('🧩 Studio attivo — scegli una modalità', cards, [{ label: 'Annulla', id: 'as-launch-cancel' }]);
        modal.querySelector('#as-launch-cancel').onclick = () => modal.remove();
        modal.querySelectorAll('.as-mode-card').forEach(btn => {
            btn.onmouseenter = () => btn.style.borderColor = '#4f46e5';
            btn.onmouseleave = () => btn.style.borderColor = '#e2e8f0';
            btn.onclick = () => { const mode = btn.getAttribute('data-mode'); modal.remove(); ActiveStudy.enter(mode); };
        });
        if (window.safeCreateIcons) window.safeCreateIcons();
    };

    // Pannello laterale persistente durante la sessione
    function showPanel(mode) {
        const m = MODES[mode];
        let panel = document.getElementById('active-study-panel');
        if (panel) panel.remove();
        panel = document.createElement('div');
        panel.id = 'active-study-panel';
        panel.style.cssText = 'position:fixed;top:80px;right:20px;z-index:9998;width:300px;background:#fff;border:1px solid #e2e8f0;border-radius:16px;box-shadow:0 10px 40px rgba(0,0,0,.16);padding:16px;font-family:system-ui,sans-serif';
        const showVerifica = (mode !== 1) ? '' : 'opacity:.6';
        panel.innerHTML = `
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
                <i data-lucide="${m.icon}" style="width:20px;height:20px;color:#4f46e5"></i>
                <span style="font-weight:700;color:#0f172a;font-size:15px">Studio attivo</span>
                <button id="as-close" title="Esci" style="margin-left:auto;background:none;border:0;cursor:pointer;color:#94a3b8;font-size:20px;line-height:1">×</button>
            </div>
            <div style="font-weight:600;color:#334155;font-size:13.5px;margin-bottom:4px">${mode}. ${m.title}</div>
            <div style="font-size:12.5px;color:#64748b;line-height:1.5;margin-bottom:10px">${m.hint}</div>
            <div id="as-status" style="font-size:12.5px;color:#4f46e5;min-height:16px;margin-bottom:6px"></div>
            <div id="as-score" style="font-size:12.5px;color:#0f172a;min-height:16px;margin-bottom:6px"></div>
            <div id="as-result" style="font-size:12.5px;color:#0f172a;background:#f8fafc;border-radius:10px;padding:8px;display:none;margin-bottom:10px"></div>
            <div style="display:flex;gap:8px;flex-wrap:wrap">
                <button id="as-verify" style="${showVerifica};background:#22c55e;color:#fff;border:0;border-radius:10px;padding:8px 12px;cursor:pointer;font-weight:600;font-size:13px">${mode === 3 ? 'Confronta' : 'Verifica'}</button>
                <button id="as-reveal" style="background:#f59e0b;color:#fff;border:0;border-radius:10px;padding:8px 12px;cursor:pointer;font-weight:600;font-size:13px">Soluzione</button>
                <button id="as-retry" style="background:#f1f5f9;color:#334155;border:0;border-radius:10px;padding:8px 12px;cursor:pointer;font-weight:600;font-size:13px">Riprova</button>
            </div>`;
        document.body.appendChild(panel);
        panel.querySelector('#as-close').onclick = () => ActiveStudy.exit();
        panel.querySelector('#as-verify').onclick = () => ActiveStudy.verifica();
        panel.querySelector('#as-reveal').onclick = () => ActiveStudy.rivelaSoluzione();
        panel.querySelector('#as-retry').onclick = () => ActiveStudy.riprova();
        updatePanelScore();
        if (window.safeCreateIcons) window.safeCreateIcons();
    }

    function setPanelStatus(t) { const el = document.getElementById('as-status'); if (el) el.innerHTML = t || ''; }
    function setPanelResult(html) { const el = document.getElementById('as-result'); if (el) { el.style.display = 'block'; el.innerHTML = html; } }
    function updatePanelScore() {
        const el = document.getElementById('as-score'); if (!el) return;
        const mode = ActiveStudy.session.mode;
        if (mode === 3 || mode === 4 || mode === 6) {
            const t = ActiveStudy._selfTally || { ok: 0, ko: 0 };
            el.textContent = `Punteggio: ${t.ok} ✓ / ${t.ko} ✗`;
        } else { el.textContent = ''; }
    }

    // keyframes spinner (una volta)
    if (!document.getElementById('as-style')) {
        const styleEl = document.createElement('style');
        styleEl.id = 'as-style';
        styleEl.textContent = '@keyframes as-spin{to{transform:rotate(360deg)}}';
        document.head.appendChild(styleEl);
    }

    console.log('[ActiveStudy] modulo studio attivo caricato (7 modalità)');
})();
