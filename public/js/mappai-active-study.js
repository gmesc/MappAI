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
 *      Verifica = statistiche + confronto formativo AI con la struttura originale.
 *   2. Ricostruisci gerarchie      — nodi col colore della loro area già dato;
 *      goal: ricollegare i rami nella struttura corretta (con verifica).
 *      Il colore è uno SCAFFOLD che sfuma quando la padronanza cresce.
 *   3. Richiamo etichette          — struttura visibile, label nascoste;
 *      chips (riconoscimento) o digitazione fuzzy (richiamo vero, toggle).
 *   4. Riempi le descrizioni       — struttura visibile, desc nascoste;
 *      lo studente scrive la propria spiegazione, poi confronta con la fonte.
 *      Anti-pappagallo + hint ladder + autovalutazione a 3 livelli.
 *   5. Trova l'intruso             — 1-2 nodi spostati nel ramo LESSICALMENTE
 *      più distante (un intruso plausibile punirebbe risposte difendibili).
 *   6. Verbi delle relazioni       — verbi (rel) nascosti SOLO sugli archi con
 *      relazione non generica; 2 tentativi, conta il primo (PT).
 *   7. Ordina la sequenza          — catena cronologica mescolata; credito
 *      parziale via LCS (sequenza shiftata di 1 ≠ zero).
 *
 * MISURAZIONE (Precision Teaching — regole non negoziabili):
 *   - Il punteggio si salva UNA SOLA VOLTA per sessione (a fine sessione, non
 *     a ogni Verifica): ripetere Verifica non deve martellare l'EWMA né
 *     duplicare righe in sessioni.jsonl.
 *   - rate = fluenza PER ITEM (60/secondi impiegati su quell'item, cap 30),
 *     mai la media di sessione stampata su ogni entry.
 *   - Ogni record porta `metric` (completion|structure|recognition|recall|
 *     coverage): accuracy con semantiche diverse NON si mischiano in meta-analisi.
 *
 * ARCHITETTURA (100% reversibile):
 *   - 1 sola edit ad app.js: guard in cima a window.handleNodeClick.
 *   - Tutto il resto qui: wrap di renderGraph per applicare l'overlay visivo
 *     (grigio / label nascoste / rel nascosti) dopo ogni render, e click
 *     namespaced sui path link per la modalità verbi.
 *   - enter() fa uno SNAPSHOT profondo (link, level, group, label, desc, x/y);
 *     exit()/rivelaSoluzione() ripristinano dallo snapshot → nessuna perdita dati.
 *
 * Caricare in index.html DOPO app.js e DOPO mappai-active-study-core.js
 * (usa window.renderGraph, EDGE_FAMILIES, window._nextFreeGroup,
 * MappAIActiveStudyCore, MappAIMastery, showToast, safeCreateIcons).
 */
(function () {
    'use strict';

    const GREY_FILL = '#d1d5db';   // slate-300
    const GREY_STROKE = '#9ca3af'; // slate-400
    const WRONG_STROKE = '#ef4444';
    const OK_STROKE = '#22c55e';
    const ITEM_CAP = 15;           // max item per sessione (carico ADHD/DSA)
    const SCOPE_PROMPT_MIN = 20;   // sopra questa taglia proponi lo scope per ramo

    function S() {
        try { return (typeof appState !== 'undefined') ? appState : window.appState; }
        catch (e) { return window.appState; }
    }
    function CORE() { return window.MappAIActiveStudyCore || null; }
    function lid(x) { return (x && typeof x === 'object') ? x.id : x; }
    function clean(s) { return (window.cleanLabel ? window.cleanLabel(s) : (s || '')); }
    function toast(msg, type) { if (window.showToast) window.showToast(msg, type || 'info'); }

    // Definizione modalità (metadati per launcher + pannello)
    const MODES = {
        1: { icon: 'pencil-ruler', title: window.t('as_m1_title', 'Costruisci mappa personale'),
             hint: window.t('as_m1_hint', 'Tutti i nodi sono grigi. Collega i nodi tra loro: un nodo prende colore (diventa un ramo principale) solo quando lo colleghi al concetto centrale. Alla verifica ricevi anche un confronto con la mappa originale.'),
             kind: 'link', metric: 'completion' },
        2: { icon: 'git-merge', title: window.t('as_m2_title', 'Ricostruisci le gerarchie'),
             hint: window.t('as_m2_hint', 'Ogni nodo ha già il colore della sua area (finché la tua padronanza è bassa: poi i colori spariscono). Ricollega i nodi per ricostruire i rami corretti, poi premi Verifica.'),
             kind: 'link', metric: 'structure' },
        3: { icon: 'eye-off', title: window.t('as_m3_title', 'Richiamo: nomina i nodi'),
             hint: window.t('as_m3_hint', 'I nodi sono vuoti. Trascina le etichette dalla lista, oppure attiva "Scrivi tu" e digita i nomi a memoria. Quando vuoi premi Confronta.'),
             kind: 'dragdrop', metric: 'recognition' },
        4: { icon: 'feather', title: window.t('as_m4_title', 'Riempi le descrizioni'),
             hint: window.t('as_m4_hint', 'Clicca un nodo e scrivi con parole tue cosa significa. Se ti blocchi usa il Suggerimento. Poi confronta con la descrizione della fonte.'),
             kind: 'reveal', metric: 'coverage' },
        5: { icon: 'search', title: window.t('as_m5_title', "Trova l'intruso"),
             hint: window.t('as_m5_hint', '1 o 2 nodi sono stati spostati nel ramo sbagliato. Trovali e ricollegali al ramo giusto, poi premi Verifica.'),
             kind: 'link', metric: 'structure' },
        6: { icon: 'spline', title: window.t('as_m6_title', 'Verbi delle relazioni'),
             hint: window.t('as_m6_hint', 'Alcune frecce hanno il verbo nascosto. Clicca una freccia col "?" e scegli la famiglia giusta: hai 2 tentativi, conta il primo.'),
             kind: 'edge', metric: 'recognition' },
        7: { icon: 'list-ordered', title: window.t('as_m7_title', 'Ordina la sequenza'),
             hint: window.t('as_m7_hint', 'I nodi di un processo cronologico sono mescolati. Ricollegali nell\'ordine corretto, poi premi Verifica.'),
             kind: 'link', metric: 'structure' }
    };

    const ActiveStudy = window.ActiveStudy = {
        session: { active: false, mode: null, snapshot: null, scope: null,
                   attempts: 0, lastSummary: null, saved: false },
        _link1: null,
        _revealed: null,        // Set di linkKey già risolti (mode6)
        _revealedSolution: false,
        _wrong: null,           // Set di id evidenziati dopo verifica
        _displaced: null,       // [{id, originalParent}] per mode5
        _seqBranch: null,       // {ids:[...ordine originale]} per mode7
        _entries: null,         // dettaglio testi/risposte per meta-analisi
        _placements: null,      // { nodeId: label } drag&drop (mode3)
        _chipSel: null,         // label attualmente selezionata (mode3, click-to-assign)
        _targets: null,         // Set di nodeId in gioco (mode3/4: scope + cap)
        _quizEdges: null,       // Set di linkKey quizzabili (mode6)
        _typedMode: false,      // mode3: richiamo digitato invece delle chips
        _typedGuess: null,      // { nodeId: ultimo tentativo digitato errato }
        _itemTime: null,        // { nodeId: secondi accumulati sull'item } → rate per-item
        _lastItemTs: 0,
        _greyScaffold: false,   // mode2: scaffold colore sfumato per padronanza alta
        _scopeSet: null,        // Set di nodeId dello scope (null = tutta la mappa)
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

    // parentOf sulla struttura VIVA (per i precheck del launcher, prima dello snapshot)
    function liveParentOf() {
        const st = S();
        const byId = {}; (st.db.nodes || []).forEach(n => byId[n.id] = n);
        const parentOf = {};
        (st.db.links || []).forEach(l => {
            const s = byId[lid(l.source)], t = byId[lid(l.target)];
            if (!s || !t) return;
            if (typeof s.level === 'number' && typeof t.level === 'number' && s.level === t.level - 1) {
                parentOf[t.id] = s.id;
            }
        });
        return parentOf;
    }

    // Padronanza aggregata media (0..1) su un insieme di nodi; null se nessun dato.
    function avgMastery(ids) {
        const MM = window.MappAIMastery;
        if (!MM || !MM.node) return null;
        const vals = [];
        ids.forEach(id => {
            const agg = MM.node(id);
            if (agg && agg.attempts) vals.push(agg.accuracy);
        });
        if (!vals.length) return null;
        return vals.reduce((a, b) => a + b, 0) / vals.length;
    }

    // Ordina gli id dal più debole al più forte (nessun dato = più debole di tutti).
    function weakestFirst(ids) {
        const MM = window.MappAIMastery;
        const score = id => {
            if (!MM || !MM.node) return -1;
            const agg = MM.node(id);
            return (agg && agg.attempts) ? agg.accuracy : -1;
        };
        return ids.slice().sort((a, b) => score(a) - score(b));
    }

    // ---------------------------------------------------------------- scatter
    // onlySet: se presente, sparpaglia SOLO quei nodi (scope ramo) e non tocca il resto.
    function scatterLooseNodes(onlySet) {
        const st = S();
        const nodes = st.db.nodes || [];
        const root = findRoot();
        const loose = nodes.filter(n => n !== root && (!onlySet || onlySet.has(n.id)));
        const R = 260 + Math.min(loose.length * 6, 360);
        loose.forEach((n, i) => {
            const a = (i / Math.max(loose.length, 1)) * Math.PI * 2;
            const jitter = (i % 3) * 70;
            n.x = Math.cos(a) * (R + jitter);
            n.y = Math.sin(a) * (R + jitter);
            n.fx = null; n.fy = null;
        });
        if (root && !onlySet) { root.x = 0; root.y = 0; root.fx = 0; root.fy = 0; }
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

        // reset del canale-errore (il patch-render può riusare gli elementi)
        svg.selectAll('circle.node-circle').attr('stroke-dasharray', null);

        // grigio per i nodi non collegati al root (mode 1)
        if (st.mode === 1) {
            svg.selectAll('circle.node-circle').each(function (d) {
                if (isLoose(d)) d3.select(this).attr('fill', GREY_FILL).attr('stroke', GREY_STROKE);
            });
        }

        // mode 2 con scaffold sfumato: i nodi in gioco tornano grigi (niente colore-aiuto)
        if (st.mode === 2 && ActiveStudy._greyScaffold) {
            const inPlay = ActiveStudy._scopeSet;
            svg.selectAll('circle.node-circle').each(function (d) {
                if (d === root) return;
                if (!inPlay || inPlay.has(d.id)) d3.select(this).attr('fill', GREY_FILL).attr('stroke', GREY_STROKE);
            });
        }

        // mode 3: label nascoste SOLO sui target; mostra la label piazzata o un placeholder
        if (st.mode === 3) {
            const pl = ActiveStudy._placements || {};
            const targets = ActiveStudy._targets;
            svg.selectAll('text.node-text').each(function (d) {
                if (d.level === 0) return; // root sempre visibile
                if (targets && !targets.has(d.id)) return; // fuori esercizio: label reale
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

        // verbi nascosti + click sugli archi (mode 6) — solo sugli archi quizzabili
        if (st.mode === 6) {
            const qz = ActiveStudy._quizEdges;
            svg.selectAll('text.link-label').each(function (d) {
                const key = linkKey(d);
                if (qz && !qz.has(key)) return; // arco non in gioco: verbo visibile
                if (ActiveStudy._revealed && ActiveStudy._revealed.has(key)) return;
                d3.select(this).text('?');
            });
            svg.selectAll('path.link').style('cursor', function (d) {
                return (!qz || qz.has(linkKey(d))) ? 'pointer' : null;
            })
                .on('click.activestudy', function (event, d) {
                    event.stopPropagation();
                    const key = linkKey(d);
                    if (qz && !qz.has(key)) { toast(window.t('tst_as_arrow_out', 'Questa freccia non fa parte dell\'esercizio'), 'info'); return; }
                    if (ActiveStudy._revealed && ActiveStudy._revealed.has(key)) return;
                    openVerbPicker(d);
                });
        }

        // evidenzia errori dopo Verifica — colore + tratteggio (non solo colore: daltonismo)
        // id sempre come String: le chiavi di parentOf sono stringhe, gli id nodo no
        if (ActiveStudy._wrong && ActiveStudy._wrong.size) {
            svg.selectAll('circle.node-circle').each(function (d) {
                if (ActiveStudy._wrong.has(String(d.id))) {
                    d3.select(this).attr('stroke', WRONG_STROKE).attr('stroke-width', 4)
                        .attr('stroke-dasharray', '6,3');
                }
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
            const scopeSet = ActiveStudy._scopeSet;
            if (scopeSet) {
                // scope ramo: stacca solo i link interni al ramo (la L1 resta ancorata
                // al root); il resto della mappa rimane intatto come contesto.
                const l1Id = ActiveStudy.session.scope.l1Id;
                const children = new Set([...scopeSet].filter(id => id !== l1Id));
                st.db.links = st.db.links.filter(l => !children.has(lid(l.target)));
                nodes.forEach(n => { if (children.has(n.id)) n.level = 1; });
            } else {
                st.db.links = [];
                // mantiene group (colore area), livello 1 per renderli colorati e pieni
                nodes.forEach(n => { if (n !== root) n.level = 1; });
            }
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

    // mode5: prende 1-2 foglie e le riaggancia all'L1 lessicalmente più distante.
    // La scelta random poteva produrre un intruso PLAUSIBILE (i concetti-ponte
    // appartengono legittimamente a più aree) → studente punito per una risposta
    // difendibile. Il numero di intrusi è adattivo sulla padronanza.
    function relocateIntruders() {
        const st = S();
        const nodes = st.db.nodes || [];
        const links = st.db.links || [];
        const snap = ActiveStudy.session.snapshot;
        const core = CORE();
        const leaves = nodes.filter(n => {
            if (n.level === undefined || n.level <= 1) return false;
            return !links.some(l => lid(l.source) === n.id); // nessun figlio
        });
        const l1s = nodes.filter(n => n.level === 1);
        if (leaves.length < 1 || l1s.length < 2) return [];

        const mastery = avgMastery(nodes.map(n => n.id));
        const count = (mastery != null && mastery >= 0.6) ? 2 : 1;

        // testo rappresentativo di ogni ramo (label L1 + label dei discendenti)
        const branchText = {};
        l1s.forEach(h => {
            const descIds = new Set();
            const walk = (id) => Object.keys(snap.parentOf).forEach(c => {
                if (snap.parentOf[c] === id && !descIds.has(c)) { descIds.add(c); walk(c); }
            });
            walk(h.id);
            branchText[h.id] = clean(h.label) + ' ' +
                [...descIds].map(id => clean((snap.nodes[id] || {}).label)).join(' ');
        });

        const displaced = [];
        const picks = leaves.sort(() => Math.random() - 0.5).slice(0, Math.min(count, leaves.length));
        picks.forEach(leaf => {
            const origParent = snap.parentOf[leaf.id];
            const targets = l1s.filter(h => h.group !== leaf.group && h.id !== origParent);
            if (!targets.length) return;
            let newParent = targets[0];
            if (core) {
                const leafText = clean(leaf.label) + ' ' + (snap.nodes[leaf.id] ? (snap.nodes[leaf.id].desc || '') : '');
                const idx = core.pickDistantBranchIndex(leafText, targets.map(h => branchText[h.id] || ''));
                if (idx >= 0) newParent = targets[idx];
            } else {
                newParent = targets[Math.floor(Math.random() * targets.length)];
            }
            // rimuovi link entrante e crea quello sbagliato
            st.db.links = st.db.links.filter(l => lid(l.target) !== leaf.id);
            st.db.links.push({ source: newParent.id, target: leaf.id, rel: 'collega' });
            leaf.group = newParent.group; leaf.level = newParent.level + 1;
            displaced.push({ id: leaf.id, originalParent: origParent });
        });
        return displaced;
    }

    // Trova la CATENA più lunga (ogni nodo con esattamente un figlio) — solo lì
    // l'ordine "corretto" è non ambiguo. Pura sul parentOf: riusata anche dal
    // launcher per disabilitare la card del modo 7 quando non c'è catena.
    function findBestChain(parentOf) {
        const children = {};
        Object.keys(parentOf).forEach(c => {
            const p = parentOf[c];
            (children[p] = children[p] || []).push(c);
        });
        let best = null;
        const heads = new Set(Object.keys(parentOf));
        Object.values(parentOf).forEach(p => heads.add(p));
        heads.forEach(id => {
            // testa di catena: il genitore non ha un solo figlio (o non esiste)
            const p = parentOf[id];
            if (p && (children[p] || []).length === 1) return;
            const path = [id];
            let cur = id;
            while (children[cur] && children[cur].length === 1) { cur = children[cur][0]; path.push(cur); }
            if (path.length >= 3 && (!best || path.length > best.length)) best = path;
        });
        return best;
    }

    function setupSequenceBranch() {
        const st = S();
        const snap = ActiveStudy.session.snapshot;
        const best = findBestChain(snap.parentOf);
        if (!best) { toast(window.t('tst_as_no_chain', 'Nessuna catena ordinabile in questa mappa (serve un ramo a sequenza, senza biforcazioni)'), 'warning'); return null; }
        // strippa i link interni alla catena, lascia il resto (la testa resta ancorata)
        const idset = new Set(best);
        st.db.links = st.db.links.filter(l => !(idset.has(lid(l.source)) && idset.has(lid(l.target))));
        return { ids: best };
    }

    // --------------------------------------------------------------- click API
    // Ritorna true se ActiveStudy ha "consumato" il click (app.js esce subito).
    ActiveStudy.handleNodeClick = function (d) {
        const st = ActiveStudy.session;
        if (!st.active) return false;
        const mode = st.mode;

        if (mode === 6) { toast(window.t('tst_as_click_arrows', 'In questa modalità si cliccano le frecce, non i nodi'), 'info'); return true; }

        if (mode === 3) {
            if (d.level === 0) return true; // root non assegnabile
            if (ActiveStudy._targets && !ActiveStudy._targets.has(d.id)) {
                toast(window.t('tst_as_node_out', 'Questo nodo non fa parte dell\'esercizio'), 'info'); return true;
            }
            if (ActiveStudy._typedMode) { openTypedRecall(d); return true; }
            if (ActiveStudy._chipSel) { placeLabel(d.id, ActiveStudy._chipSel); ActiveStudy._chipSel = null; refreshChipPanel(); }
            else if (ActiveStudy._placements && ActiveStudy._placements[d.id]) {
                // clic su nodo già assegnato senza chip selezionata → rimuovi (ripensaci)
                delete ActiveStudy._placements[d.id];
                window.renderGraph(); refreshChipPanel();
            } else { toast(window.t('tst_as_pick_label', 'Seleziona prima un\'etichetta dalla lista'), 'info'); }
            return true;
        }
        if (mode === 4) {
            if (ActiveStudy._scopeSet && !ActiveStudy._scopeSet.has(d.id)) {
                toast(window.t('tst_as_out_of_scope', 'Questo nodo è fuori dall\'area scelta per la sessione'), 'info'); return true;
            }
            openDescWriter(d); return true;
        }

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
        // Nei modi con soluzione (2/5/7) il verbo originale comparirebbe solo sul
        // link giusto → feedback implicito che accelera il prova-e-riprova. Verbo
        // neutro durante l'esercizio; l'originale torna col restore/reveal.
        const mode = ActiveStudy.session.mode;
        const rel = (mode === 1)
            ? ((ActiveStudy.session.snapshot.relOf[child.id]) || 'collega')
            : 'collega';
        // evita duplicati
        const exists = st.db.links.some(l =>
            (lid(l.source) === parent.id && lid(l.target) === child.id) ||
            (lid(l.source) === child.id && lid(l.target) === parent.id));
        if (!exists) st.db.links.push({ source: parent.id, target: child.id, rel: rel });
        if (mode === 1) recomputeFromRoot(true);
        if (window.updateDegreeStats) window.updateDegreeStats();
        ActiveStudy._wrong = null;
        window.renderGraph();
    }

    // -------------------------------------------------------------- mode 3 drag&drop
    // Pannello con le etichette dei soli nodi in gioco; chip trascinabile,
    // cliccabile o attivabile da tastiera (Enter/Spazio).
    function buildChipPanel() {
        const old = document.getElementById('as-chip-panel'); if (old) old.remove();
        const targets = ActiveStudy._targets || new Set();
        const labels = (S().db.nodes || [])
            .filter(n => targets.has(n.id))
            .map(n => clean(n.label))
            .filter(Boolean);
        // mescola
        for (let i = labels.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [labels[i], labels[j]] = [labels[j], labels[i]]; }

        const panel = document.createElement('div');
        panel.id = 'as-chip-panel';
        panel.setAttribute('role', 'complementary');
        panel.setAttribute('aria-label', 'Etichette da posizionare');
        panel.style.cssText = 'position:fixed;top:80px;left:20px;z-index:9998;width:240px;max-height:calc(100vh - 120px);overflow:auto;background:#fff;border:1px solid #e2e8f0;border-radius:16px;box-shadow:0 10px 40px rgba(0,0,0,.16);padding:14px;font-family:system-ui,sans-serif';
        panel.innerHTML = `<div style="font-weight:700;color:#0f172a;font-size:13.5px;margin-bottom:4px">Etichette</div>
            <label style="display:flex;align-items:center;gap:6px;font-size:11.5px;color:#334155;margin-bottom:8px;cursor:pointer">
                <input type="checkbox" id="as-typed-toggle" ${ActiveStudy._typedMode ? 'checked' : ''}>
                <i data-lucide="pencil" style="width:13px;height:13px;vertical-align:-1px"></i> Scrivi tu (senza etichette — più difficile)
            </label>
            <div id="as-chip-hint" style="font-size:11.5px;color:#94a3b8;margin-bottom:10px">Trascina o tocca, poi clicca un nodo</div>
            <div id="as-chip-list"></div>`;
        document.body.appendChild(panel);
        if (window.safeCreateIcons) window.safeCreateIcons();
        ActiveStudy._chipLabels = labels;
        panel.querySelector('#as-typed-toggle').addEventListener('change', function () {
            ActiveStudy._typedMode = this.checked;
            ActiveStudy._chipSel = null;
            refreshChipPanel();
            toast(this.checked
                ? 'Richiamo attivo: clicca un nodo e scrivi il nome a memoria'
                : 'Riconoscimento: usa le etichette dalla lista', 'info');
        });
        refreshChipPanel();
    }

    function refreshChipPanel() {
        const list = document.getElementById('as-chip-list');
        if (!list) return;
        const hint = document.getElementById('as-chip-hint');
        if (ActiveStudy._typedMode) {
            const targets = ActiveStudy._targets ? ActiveStudy._targets.size : 0;
            const placed = Object.keys(ActiveStudy._placements || {}).length;
            if (hint) hint.textContent = window.t('as_type_hint', 'Clicca un nodo «• • •» e digita il suo nome.');
            list.innerHTML = `<div style="font-size:12px;color:#334155;padding:6px 2px">Nominati: <b>${placed}/${targets}</b></div>`;
            return;
        }
        if (hint) hint.textContent = window.t('as_drag_hint', 'Trascina o tocca, poi clicca un nodo');
        const placed = new Set(Object.values(ActiveStudy._placements || {}));
        list.innerHTML = '';
        (ActiveStudy._chipLabels || []).forEach(label => {
            const used = placed.has(label);
            const sel = (ActiveStudy._chipSel === label);
            const chip = document.createElement('div');
            chip.textContent = label;
            chip.draggable = !used;
            chip.setAttribute('role', 'button');
            chip.setAttribute('tabindex', used ? '-1' : '0');
            chip.setAttribute('aria-pressed', sel ? 'true' : 'false');
            chip.style.cssText = `padding:7px 10px;margin-bottom:6px;border-radius:9px;font-size:12.5px;cursor:${used ? 'default' : 'grab'};border:1.5px solid ${sel ? '#4f46e5' : '#e2e8f0'};background:${used ? '#f1f5f9' : (sel ? '#eef2ff' : '#fff')};color:${used ? '#94a3b8' : '#334155'};${used ? 'text-decoration:line-through' : ''}`;
            if (!used) {
                chip.addEventListener('dragstart', e => { e.dataTransfer.setData('text/plain', label); e.dataTransfer.effectAllowed = 'move'; });
                const toggle = () => { ActiveStudy._chipSel = (ActiveStudy._chipSel === label) ? null : label; refreshChipPanel(); };
                chip.addEventListener('click', toggle);
                chip.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } });
            }
            list.appendChild(chip);
        });
    }

    // accumula il tempo speso sull'item (per la fluenza per-item, non di sessione)
    function trackItemTime(nodeId) {
        const now = Date.now();
        ActiveStudy._itemTime = ActiveStudy._itemTime || {};
        const delta = (now - (ActiveStudy._lastItemTs || now)) / 1000;
        ActiveStudy._itemTime[nodeId] = (ActiveStudy._itemTime[nodeId] || 0) + Math.max(delta, 0.5);
        ActiveStudy._lastItemTs = now;
    }

    function placeLabel(nodeId, label) {
        ActiveStudy._placements = ActiveStudy._placements || {};
        // una label sta su un solo nodo: rimuovi precedente assegnazione
        Object.keys(ActiveStudy._placements).forEach(k => { if (ActiveStudy._placements[k] === label) delete ActiveStudy._placements[k]; });
        ActiveStudy._placements[nodeId] = label;
        trackItemTime(nodeId);
        ActiveStudy._wrong = null;
        window.renderGraph();
        refreshChipPanel();
        updatePanelScore();
    }

    // mode 3 "scrivi tu": richiamo vero (digitazione) con tolleranza fuzzy ai refusi.
    function openTypedRecall(d) {
        const correct = clean(d.label);
        const modal = buildModal('Come si chiama questo nodo?', `
            <p style="color:#64748b;font-size:13px;margin:0 0 8px">Scrivi il nome a memoria. I piccoli refusi sono tollerati.</p>
            <input id="as-typed-input" type="text" autocomplete="off"
                style="width:100%;border:1px solid #cbd5e1;border-radius:10px;padding:10px;font-size:14px"
                value="${ActiveStudy._typedGuess && ActiveStudy._typedGuess[d.id] ? escapeHtml(ActiveStudy._typedGuess[d.id]) : ''}">
            <div id="as-typed-fb" style="min-height:18px;font-size:12.5px;margin-top:8px"></div>
        `, [
            { label: 'Conferma', primary: true, id: 'as-typed-ok' },
            { label: 'Chiudi', id: 'as-typed-close' }
        ]);
        const input = modal.querySelector('#as-typed-input');
        input.focus();
        modal.querySelector('#as-typed-close').onclick = () => modal.remove();
        const submit = () => {
            const typed = (input.value || '').trim();
            if (!typed) return;
            trackItemTime(d.id);
            const core = CORE();
            const hit = core ? core.labelMatches(typed, correct) : (typed.toLowerCase() === correct.toLowerCase());
            if (hit) {
                ActiveStudy._placements = ActiveStudy._placements || {};
                ActiveStudy._placements[d.id] = correct;
                if (ActiveStudy._typedGuess) delete ActiveStudy._typedGuess[d.id];
                modal.remove();
                ActiveStudy._wrong = null;
                window.renderGraph();
                refreshChipPanel();
                updatePanelScore();
                toast(window.t('tst_as_correct', 'Esatto!'), 'success');
            } else {
                ActiveStudy._typedGuess = ActiveStudy._typedGuess || {};
                ActiveStudy._typedGuess[d.id] = typed;
                const fb = modal.querySelector('#as-typed-fb');
                fb.style.color = '#b45309';
                fb.textContent = window.t('as_no_match', 'Non corrisponde: riprova, oppure chiudi e torna più tardi.');
            }
        };
        modal.querySelector('#as-typed-ok').onclick = submit;
        input.addEventListener('keydown', e => { if (e.key === 'Enter') submit(); });
    }

    // -------------------------------------------------------------- mode 4 desc
    // tally derivato dalle entries (una per nodo, l'ultima vince): niente
    // contatori increment-only che gonfiano il punteggio sui rientri.
    function tallyFromEntries() {
        const es = ActiveStudy._entries || [];
        return { ok: es.filter(e => e.isCorrect).length, ko: es.filter(e => !e.isCorrect).length };
    }
    // dedup per nodo (mode 4) o per arco (mode 6, via _key: due archi possono
    // puntare allo stesso nodo con i cross-link)
    function pushEntryDedup(entry) {
        const keyOf = e => (e._key != null) ? ('k:' + e._key) : ('n:' + e.nodeId);
        ActiveStudy._entries = (ActiveStudy._entries || []).filter(e => keyOf(e) !== keyOf(entry));
        ActiveStudy._entries.push(entry);
    }

    function openDescWriter(d) {
        const snap = ActiveStudy.session.snapshot.nodes[d.id] || {};
        const original = snap.desc || snap.content || '(nessuna descrizione nella fonte)';
        let hintLevel = 0;
        const modal = buildModal(`Spiega: ${clean(d.label)}`, `
            <p style="color:#64748b;font-size:13px;margin:0 0 8px">Scrivi con parole tue cosa significa questo concetto.</p>
            <textarea id="as-desc-input" rows="5" style="width:100%;border:1px solid #cbd5e1;border-radius:10px;padding:10px;font-size:14px;resize:vertical"></textarea>
            <div id="as-desc-hint" style="display:none;margin-top:8px;background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:8px;font-size:12.5px;color:#92400e"></div>
            <div id="as-desc-compare" style="display:none;margin-top:12px">
                <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
                    <div style="font-weight:600;color:#334155">Descrizione della fonte:</div>
                    <button type="button" id="as-desc-tts" title="Leggi ad alta voce" aria-label="Leggi la descrizione ad alta voce" style="background:none;border:0;cursor:pointer;display:inline-flex;align-items:center"><i data-lucide="volume-2" style="width:16px;height:16px;color:#334155"></i></button>
                </div>
                <div style="background:#f1f5f9;border-radius:10px;padding:10px;font-size:14px;color:#334155;line-height:1.5">${escapeHtml(original)}</div>
            </div>
            <div id="as-desc-feedback" style="display:none;margin-top:12px"></div>
        `, [
            { label: '<i data-lucide="lightbulb" style="width:14px;height:14px;vertical-align:-2px"></i> Suggerimento', id: 'as-desc-hint-btn' },
            { label: window.t('as_compare', 'Confronta'), primary: true, id: 'as-desc-compare-btn' },
            { label: 'Chiudi', id: 'as-desc-close' }
        ]);
        const closeBtn = modal.querySelector('#as-desc-close');
        closeBtn.onclick = () => modal.remove();

        // TTS della fonte: canale uditivo per dislessia (speechSynthesis già usato dal tutor)
        modal.querySelector('#as-desc-tts').onclick = () => {
            try {
                if (window.speechSynthesis.speaking) { window.speechSynthesis.cancel(); return; }
                const u = new SpeechSynthesisUtterance(original);
                u.lang = (S().language === 'en') ? 'en-US' : 'it-IT';
                u.rate = 0.9;
                window.speechSynthesis.speak(u);
            } catch (e) { /* niente TTS su questa piattaforma */ }
        };

        // Hint ladder (Ch 8): prima 3 parole chiave, poi la prima frase — mai tutta
        // la fonte prima che lo studente abbia scritto.
        modal.querySelector('#as-desc-hint-btn').onclick = () => {
            const box = modal.querySelector('#as-desc-hint');
            box.style.display = 'block';
            hintLevel++;
            if (hintLevel === 1) {
                const core = CORE();
                const words = core ? core.wordTokens(original) : String(original).split(/\s+/);
                const keys = [...new Set(words)].sort((a, b) => b.length - a.length).slice(0, 3);
                box.innerHTML = `<b>Parole chiave:</b> ${keys.map(escapeHtml).join(' · ') || '—'}`;
            } else {
                const firstSentence = String(original).split(/(?<=[.!?])\s+/)[0] || original;
                box.innerHTML = `<b>Inizio della fonte:</b> ${escapeHtml(firstSentence)}`;
                modal.querySelector('#as-desc-hint-btn').style.display = 'none';
            }
        };

        modal.querySelector('#as-desc-compare-btn').onclick = async () => {
            const student = (modal.querySelector('#as-desc-input').value || '').trim();
            if (!student) { toast(window.t('tst_as_write_first', 'Scrivi prima la tua spiegazione'), 'warning'); return; }

            // Anti-pappagallo: la copia (quasi) letterale della fonte darebbe 100%
            // di coverage senza rielaborazione — chiedi di riformulare, non registrare.
            const core = CORE();
            if (core && student.length >= 30 && core.jaccardWords(student, original) >= 0.8) {
                const fb0 = modal.querySelector('#as-desc-feedback');
                fb0.style.display = 'block';
                fb0.innerHTML = `<div style="background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:10px;font-size:13px;color:#92400e">La tua spiegazione è quasi identica alla fonte. Prova a riscriverla <b>con parole tue</b>: è lì che si impara.</div>`;
                return;
            }

            modal.querySelector('#as-desc-compare').style.display = 'block';
            const cmpBtn = modal.querySelector('#as-desc-compare-btn');
            cmpBtn.style.display = 'none';
            const fb = modal.querySelector('#as-desc-feedback');
            fb.style.display = 'block';

            trackItemTime(d.id);
            const apiKey = window.getSystemKey ? window.getSystemKey() : null;
            if (!apiKey) { renderManualSelfGrade(fb, d, student, original, hintLevel); return; }

            fb.innerHTML = `<div style="color:#64748b;font-size:13px;display:flex;align-items:center;gap:8px">
                <span class="as-spinner" style="width:14px;height:14px;border:2px solid #c7d2fe;border-top-color:#4f46e5;border-radius:50%;display:inline-block;animation:as-spin .7s linear infinite"></span>
                Valutazione AI in corso…</div>`;
            try {
                const res = await scoreDesc(student, original, clean(d.label));
                const ok = res.accuracy >= 60;
                pushEntryDedup({ nodeId: d.id, label: clean(d.label), userText: student, accuracy: res.accuracy, isCorrect: ok, source: original, feedback: res.feedback, gradedBy: 'ai', hintsUsed: hintLevel });
                updatePanelScore();
                const barColor = ok ? '#22c55e' : '#f59e0b';
                fb.innerHTML = `
                    <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
                        <span style="font-weight:700;font-size:18px;color:${barColor}">${res.accuracy}%</span>
                        <span style="display:inline-flex;align-items:center;gap:4px;font-weight:600;color:${ok ? '#15803d' : '#b45309'}"><i data-lucide="${ok ? 'check' : 'rotate-cw'}" style="width:15px;height:15px"></i>${ok ? 'Corretta' : 'Da rivedere'}</span>
                    </div>
                    <div style="background:#e2e8f0;border-radius:6px;height:8px;overflow:hidden;margin-bottom:10px">
                        <div style="height:100%;width:${res.accuracy}%;background:${barColor}"></div>
                    </div>
                    <div style="font-size:13.5px;color:#334155;line-height:1.5">${escapeHtml(res.feedback)}</div>`;
                if (window.safeCreateIcons) window.safeCreateIcons();
            } catch (e) {
                console.warn('[ActiveStudy] scoreDesc', e);
                fb.innerHTML = `<div style="color:#64748b;font-size:13px;margin-bottom:8px">Valutazione AI non disponibile. Valuta tu:</div>`;
                renderManualSelfGrade(fb, d, student, original, hintLevel);
            }
        };
    }

    // Fallback manuale (no API key o errore): autovalutazione a 3 livelli — il
    // binario 100/0 schiacciava l'EWMA sugli estremi.
    function renderManualSelfGrade(container, d, studentText, source, hintsUsed) {
        container.style.display = 'block';
        const wrap = document.createElement('div');
        wrap.innerHTML = `<div style="font-size:13.5px;color:#334155;margin-bottom:8px">La tua spiegazione copre i concetti chiave?</div>
            <div style="display:flex;gap:8px;flex-wrap:wrap">
                <button type="button" id="as-md-ok" style="background:#22c55e;color:#fff;border:0;border-radius:10px;padding:8px 14px;cursor:pointer;font-weight:600"><i data-lucide="check" style="width:14px;height:14px;vertical-align:-2px"></i> Sì</button>
                <button type="button" id="as-md-mid" style="background:#f59e0b;color:#fff;border:0;border-radius:10px;padding:8px 14px;cursor:pointer;font-weight:600">In parte</button>
                <button type="button" id="as-md-ko" style="background:#ef4444;color:#fff;border:0;border-radius:10px;padding:8px 14px;cursor:pointer;font-weight:600"><i data-lucide="x" style="width:14px;height:14px;vertical-align:-2px"></i> No</button>
            </div>`;
        container.appendChild(wrap);
        if (window.safeCreateIcons) window.safeCreateIcons();
        const record = (accuracy, msg, color) => {
            pushEntryDedup({ nodeId: d.id, label: clean(d.label), userText: studentText || '', accuracy, isCorrect: accuracy >= 60, source: source || '', gradedBy: 'self', hintsUsed: hintsUsed || 0 });
            updatePanelScore();
            wrap.innerHTML = `<div style="color:${color};font-weight:600;font-size:13.5px">${msg}</div>`;
        };
        wrap.querySelector('#as-md-ok').onclick = () => record(100, 'Segnato come corretto', '#15803d');
        wrap.querySelector('#as-md-mid').onclick = () => record(50, 'Segnato come parziale', '#b45309');
        wrap.querySelector('#as-md-ko').onclick = () => record(0, 'Segnato da rivedere', '#b45309');
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
        // niente keywords accanto alla famiglia: spesso CONTENGONO il verbo-risposta
        Object.entries(families).forEach(([key, fam]) => {
            rows += `<button type="button" class="as-verb" data-key="${key}" style="display:flex;align-items:center;gap:10px;width:100%;text-align:left;background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:10px 12px;margin-bottom:6px;cursor:pointer">
                <span style="width:14px;height:14px;border-radius:50%;background:${fam.color};flex:0 0 auto"></span>
                <span style="font-weight:600;color:#334155">${window.MappAIRelations.getFamilyLabel(key, (window.currentLanguage === 'en' || window.currentLanguage === 'en-US') ? 'en' : 'it')}</span>
            </button>`;
        });
        const a = clean((S().db.nodes.find(n => n.id === lid(linkDatum.source)) || {}).label);
        const b = clean((S().db.nodes.find(n => n.id === lid(linkDatum.target)) || {}).label);
        const modal = buildModal('Che relazione c\'è?', `
            <p style="color:#64748b;font-size:13px;margin:0 0 10px"><b>${a}</b> &nbsp;→&nbsp; <b>${b}</b></p>
            <div id="as-verb-fb" style="min-height:16px;font-size:12.5px;color:#b45309;margin-bottom:6px"></div>
            ${rows}
        `, [{ label: 'Annulla', id: 'as-verb-cancel' }]);
        modal.querySelector('#as-verb-cancel').onclick = () => modal.remove();

        // 2 tentativi: registra il PRIMO (Precision Teaching), il secondo è pratica
        // di correzione — l'errore senza possibilità di riprovare non insegna nulla.
        let firstChoice = null;
        const finish = (chosen) => {
            const correct = (firstChoice === origFam);
            pushEntryDedup({ _key: linkKey(linkDatum), nodeId: lid(linkDatum.target), label: b, source: a, target: b, chosenFamily: firstChoice, secondChoice: (chosen !== firstChoice ? chosen : undefined), correctFamily: origFam, correctRel: origRel, isCorrect: correct });
            trackItemTime(lid(linkDatum.target));
            // rivela il verbo originale sull'arco
            ActiveStudy._revealed = ActiveStudy._revealed || new Set();
            ActiveStudy._revealed.add(linkKey(linkDatum));
            // scrivi il rel vero nei dati così la label compare
            const realLink = S().db.links.find(l => lid(l.source) === lid(linkDatum.source) && lid(l.target) === lid(linkDatum.target));
            if (realLink) realLink.rel = origRel || realLink.rel;
            modal.remove();
            window.renderGraph();
            updatePanelScore();
            const famLabel = (families[origFam] || {}).label || origFam;
            if (correct) toast(window.t('tst_as_exact', 'Esatto: «{x}»').replace('{x}', origRel), 'success');
            else if (chosen === origFam) toast(window.t('tst_as_second_try', 'Giusto al secondo tentativo — era «{x}» ({f})').replace('{x}', origRel).replace('{f}', famLabel), 'info');
            else toast(window.t('tst_as_was', 'Era «{x}» (famiglia: {f})').replace('{x}', origRel).replace('{f}', famLabel), 'warning');
        };
        modal.querySelectorAll('.as-verb').forEach(btn => {
            btn.onclick = () => {
                const chosen = btn.getAttribute('data-key');
                if (firstChoice === null) {
                    firstChoice = chosen;
                    if (chosen === origFam) { finish(chosen); return; }
                    // primo tentativo sbagliato: disabilita la scelta, concedi il secondo
                    btn.disabled = true;
                    btn.style.opacity = '0.4';
                    btn.style.cursor = 'default';
                    modal.querySelector('#as-verb-fb').textContent = window.t('as_wrong_family', 'Non è questa famiglia — hai un altro tentativo (conta il primo).');
                    return;
                }
                finish(chosen);
            };
        });
    }

    function pct(ok, tot) { return tot ? Math.round(100 * ok / tot) : 0; }

    // ramo (L1) di appartenenza di un nodo nell'albero ORIGINALE — per gli indizi
    function originalBranchLabel(childId) {
        const snap = ActiveStudy.session.snapshot;
        let cur = childId, guard = 0;
        while (snap.parentOf[cur] && guard++ < 50) {
            const p = snap.parentOf[cur];
            const pn = snap.nodes[p];
            if (pn && pn.level === 1) return clean(pn.label);
            if (pn && pn.level === 0) {
                const cn = snap.nodes[cur];
                return cn ? clean(cn.label) : '';
            }
            cur = p;
        }
        const n = snap.nodes[cur];
        return n ? clean(n.label) : '';
    }

    // Hint ladder per i modi strutturali: 1ª verifica = solo rosso; 2ª = ramo di
    // appartenenza; 3ª+ = genitore esatto. Explanatory > verification (Ch 8).
    function buildStructureHints(wrongIds, attempts) {
        if (attempts < 2 || !wrongIds.length) return '';
        const snap = ActiveStudy.session.snapshot;
        const rows = wrongIds.slice(0, 4).map(id => {
            const label = clean((snap.nodes[id] || {}).label);
            if (attempts >= 3) {
                const p = snap.parentOf[id];
                const pl = p ? clean((snap.nodes[p] || {}).label) : '?';
                return `«${escapeHtml(label)}» → sotto «${escapeHtml(pl)}»`;
            }
            return `«${escapeHtml(label)}» → ramo «${escapeHtml(originalBranchLabel(id))}»`;
        });
        const more = wrongIds.length > 4 ? ` (+${wrongIds.length - 4} altri)` : '';
        return `<div style="margin-top:6px;font-size:12px;color:#92400e;background:#fffbeb;border-radius:8px;padding:6px 8px"><b>Indizi:</b><br>${rows.join('<br>')}${more}</div>`;
    }

    // --------------------------------------------------------------- VERIFICA
    // NON salva: aggiorna lastSummary + attempts. Il salvataggio (mastery EWMA +
    // sessioni.jsonl) avviene UNA volta a fine sessione — ripetere Verifica non
    // deve duplicare record né martellare la padronanza.
    ActiveStudy.verifica = function () {
        if (ActiveStudy._revealedSolution) {
            toast(window.t('tst_as_seen_solution', 'Hai già visto la soluzione: premi "Riprova" per una nuova sessione valutabile'), 'warning');
            return;
        }
        const mode = ActiveStudy.session.mode;
        const snap = ActiveStudy.session.snapshot;
        const core = CORE();
        const attemptNo = ActiveStudy.session.attempts + 1; // la verifica in corso
        ActiveStudy._wrong = new Set();
        const nodesById = {}; (S().db.nodes || []).forEach(n => nodesById[n.id] = n);
        let summary;

        if (mode === 1) {
            // mappa personale: nessuna soluzione unica → statistiche + confronto AI
            const nodes = S().db.nodes || [];
            const connected = nodes.filter(n => typeof n.level === 'number').length;
            const l1 = nodes.filter(n => n.level === 1).length;
            const maxLvl = nodes.reduce((m, n) => Math.max(m, n.level || 0), 0);
            setPanelResult(`Mappa personale: <b>${connected}/${nodes.length}</b> nodi collegati · <b>${l1}</b> rami principali · profondità <b>${maxLvl}</b>.`);
            summary = { score: connected, total: nodes.length, accuracy: pct(connected, nodes.length), scoreText: `${connected}/${nodes.length} nodi`, entries: [] };
            aiCompareStructure(summary); // async: appende feedback formativo al pannello
        }
        else if (mode === 3) {
            const pl = ActiveStudy._placements || {};
            const guesses = ActiveStudy._typedGuess || {};
            if (!Object.keys(pl).length && !Object.keys(guesses).length) {
                toast(window.t('tst_as_place_one', 'Posiziona almeno un\'etichetta prima di confrontare'), 'warning');
                ActiveStudy._wrong = null;
                return;
            }
            const targets = (S().db.nodes || []).filter(n => ActiveStudy._targets && ActiveStudy._targets.has(n.id));
            let ok = 0;
            const entries = [];
            targets.forEach(n => {
                const placed = pl[n.id] || guesses[n.id] || null;
                const correctLabel = clean(n.label);
                const correct = pl[n.id] === correctLabel;
                if (correct) ok++; else ActiveStudy._wrong.add(String(n.id));
                const entry = { nodeId: n.id, label: correctLabel, placed: placed, correct: correctLabel, isCorrect: correct, gradedBy: ActiveStudy._typedMode ? 'typed' : 'chips' };
                // fluenza PER ITEM: 60/secondi spesi su quell'item (solo se corretto)
                if (correct && core && ActiveStudy._itemTime && ActiveStudy._itemTime[n.id]) {
                    const r = core.rateFromSeconds(ActiveStudy._itemTime[n.id]);
                    if (r != null) entry.rate = r;
                }
                entries.push(entry);
            });
            const tot = targets.length;
            setPanelResult(`Etichette: <b>${ok}/${tot}</b> al posto giusto (${pct(ok, tot)}%).` + (ActiveStudy._wrong.size ? ' I nodi in rosso sono sbagliati.' : ' Perfetto!'));
            summary = { score: ok, total: tot, accuracy: pct(ok, tot), scoreText: `${ok}/${tot}`, entries: entries };
            summary.metric = ActiveStudy._typedMode ? 'recall' : 'recognition';
            window.renderGraph();
        }
        else if (mode === 4) {
            const t = tallyFromEntries();
            const tot = t.ok + t.ko;
            if (!tot) { toast(window.t('tst_as_explain_one', 'Spiega almeno un nodo prima di verificare'), 'warning'); ActiveStudy._wrong = null; return; }
            setPanelResult(`Descrizioni: <b>${t.ok}/${tot}</b> corrette (${pct(t.ok, tot)}%).`);
            summary = { score: t.ok, total: tot, accuracy: pct(t.ok, tot), scoreText: `${t.ok}/${tot}`, entries: (ActiveStudy._entries || []) };
            summary.totalAvailable = ActiveStudy._scopeSet ? ActiveStudy._scopeSet.size
                : Math.max((S().db.nodes || []).length - 1, 0);
        }
        else if (mode === 6) {
            const t = tallyFromEntries();
            const tot = t.ok + t.ko;
            if (!tot) { toast(window.t('tst_as_answer_one', 'Rispondi ad almeno una freccia prima di verificare'), 'warning'); ActiveStudy._wrong = null; return; }
            const entries = (ActiveStudy._entries || []).map(e => {
                // fluenza per-item se disponibile e risposta corretta
                if (e.isCorrect && e.rate == null && core && ActiveStudy._itemTime && ActiveStudy._itemTime[e.nodeId]) {
                    const r = core.rateFromSeconds(ActiveStudy._itemTime[e.nodeId]);
                    if (r != null) e.rate = r;
                }
                return e;
            });
            setPanelResult(`Verbi: <b>${t.ok}/${tot}</b> famiglie corrette (${pct(t.ok, tot)}%).`);
            summary = { score: t.ok, total: tot, accuracy: pct(t.ok, tot), scoreText: `${t.ok}/${tot}`, entries: entries };
            summary.totalAvailable = ActiveStudy._quizEdges ? ActiveStudy._quizEdges.size : tot;
        }
        else {
            // modalità gerarchiche (2, 5, 7): confronto con l'albero originale
            const studentParent = buildStudentParentMap();
            const labelOf = id => clean((nodesById[id] || {}).label);
            if (mode === 5) {
                const disp = ActiveStudy._displaced || [];
                let ok = 0;
                const entries = [];
                disp.forEach(d => {
                    const correct = studentParent[d.id] === d.originalParent;
                    if (correct) ok++; else ActiveStudy._wrong.add(String(d.id));
                    entries.push({ nodeId: d.id, label: labelOf(d.id), isCorrect: correct });
                });
                let html = `Intrusi ricollocati: <b>${ok}/${disp.length}</b> corretti.` + (ActiveStudy._wrong.size ? ' Quelli in rosso sono ancora nel ramo sbagliato.' : '');
                html += buildStructureHints([...ActiveStudy._wrong], attemptNo);
                setPanelResult(html);
                summary = { score: ok, total: disp.length, accuracy: pct(ok, disp.length), scoreText: `${ok}/${disp.length}`, entries: entries };
            } else if (mode === 7) {
                const ids = (ActiveStudy._seqBranch || {}).ids || [];
                const entries = [];
                let firstWrongIdx = -1;
                for (let i = 1; i < ids.length; i++) {
                    const correct = studentParent[ids[i]] === ids[i - 1];
                    if (!correct) { ActiveStudy._wrong.add(String(ids[i])); if (firstWrongIdx < 0) firstWrongIdx = i; }
                    entries.push({ nodeId: ids[i], label: labelOf(ids[i]), isCorrect: correct });
                }
                // credito parziale LCS: una sequenza shiftata di 1 non vale 0
                let seq = null;
                if (core) {
                    const studentOrder = extractStudentChain(ids[0], studentParent, new Set(ids));
                    seq = core.sequenceScore(studentOrder || [], ids);
                }
                const ok = seq ? seq.score : entries.filter(e => e.isCorrect).length;
                const tot = Math.max(ids.length - 1, 1);
                let html = `Sequenza: <b>${ok}/${tot}</b> passi nell'ordine giusto (${pct(ok, tot)}%).`;
                if (attemptNo >= 2 && firstWrongIdx > 0) {
                    html += `<div style="margin-top:6px;font-size:12px;color:#92400e;background:#fffbeb;border-radius:8px;padding:6px 8px"><b>Indizio:</b> la sequenza regge fino al passo ${firstWrongIdx}.</div>`;
                }
                setPanelResult(html);
                summary = { score: ok, total: tot, accuracy: pct(ok, tot), scoreText: `${ok}/${tot}`, entries: entries };
            } else {
                // mode 2
                let ok = 0, tot = 0;
                const entries = [];
                const verifyIds = ActiveStudy._verifyIds || new Set(Object.keys(snap.parentOf));
                Object.keys(snap.parentOf).forEach(childId => {
                    if (!verifyIds.has(childId)) return;
                    tot++;
                    const correct = studentParent[childId] === snap.parentOf[childId];
                    if (correct) ok++; else ActiveStudy._wrong.add(childId);
                    entries.push({ nodeId: childId, label: labelOf(childId), isCorrect: correct });
                });
                let html = `Gerarchia: <b>${ok}/${tot}</b> collegamenti corretti (${pct(ok, tot)}%).` + (ActiveStudy._wrong.size ? ' I nodi in rosso hanno il genitore sbagliato.' : ' Perfetto!');
                html += buildStructureHints([...ActiveStudy._wrong], attemptNo);
                setPanelResult(html);
                summary = { score: ok, total: tot, accuracy: pct(ok, tot), scoreText: `${ok}/${tot}`, entries: entries };
            }
            window.renderGraph();
        }

        if (!summary.metric) summary.metric = (MODES[mode] || {}).metric || 'structure';
        ActiveStudy.session.attempts = attemptNo;
        summary.attempts = attemptNo;
        ActiveStudy.session.lastSummary = summary;
        ActiveStudy.session.saved = false; // una nuova verifica rende il risultato "da salvare"
        appendSaveNote();
    };

    // mode 7: ricostruisce l'ordine scelto dallo studente seguendo la catena dai
    // link attuali; null se ha creato biforcazioni (si ripiega sul conteggio a coppie).
    function extractStudentChain(headId, studentParent, chainSet) {
        const childrenOf = {};
        Object.keys(studentParent).forEach(c => {
            if (!chainSet.has(c)) return;
            const p = studentParent[c];
            (childrenOf[p] = childrenOf[p] || []).push(c);
        });
        const order = [headId];
        let cur = headId, guard = 0;
        while (childrenOf[cur] && guard++ < chainSet.size + 2) {
            if (childrenOf[cur].length !== 1) return null; // biforcazione
            cur = childrenOf[cur][0];
            order.push(cur);
        }
        return order;
    }

    // mode 1: confronto formativo AI studente-vs-originale — la "mappa personale"
    // senza alcun giudizio strutturale era l'esercizio più gamabile (tutto sotto
    // il root = 100%). Nessun blocco: 2-3 frasi + similarità indicativa.
    async function aiCompareStructure(summary) {
        try {
            const apiKey = window.getSystemKey ? window.getSystemKey() : null;
            if (!apiKey) return;
            const snap = ActiveStudy.session.snapshot;
            const studentParent = buildStudentParentMap();
            const lbl = id => clean(((snap.nodes[id] || {}).label) || id);
            const pairs = (map) => Object.keys(map).slice(0, 50)
                .map(c => `${lbl(c)} → ${lbl(map[c])}`).join('\n');
            const prompt = `Uno studente ha costruito la sua mappa mentale personale. Confrontala con la struttura originale generata dalla fonte.

STRUTTURA DELLO STUDENTE (figlio → genitore):
${pairs(studentParent) || '(nessun collegamento)'}

STRUTTURA ORIGINALE (figlio → genitore):
${pairs(snap.parentOf)}

La mappa dello studente NON deve essere identica: organizzazioni alternative sensate sono valide. Valuta la COERENZA SEMANTICA dei raggruppamenti. Rispondi SOLO con un oggetto JSON:
{"similarity": <0-100>, "feedback": "<2-3 frasi in italiano, incoraggianti ma concrete: cosa funziona della sua organizzazione e UNA cosa da ripensare>"}`;
            const payload = {
                contents: [{ role: 'user', parts: [{ text: prompt }] }],
                generationConfig: { temperature: 0.2, maxOutputTokens: 512 }
            };
            const resp = await window.fetchModelAPI(payload, apiKey);
            const txt = resp?.candidates?.[0]?.content?.parts?.[0]?.text || '';
            const parsed = window.salvageTruncatedJSON ? window.salvageTruncatedJSON(txt) : JSON.parse(txt);
            if (!parsed) return;
            const sim = Math.max(0, Math.min(100, Math.round(Number(parsed.similarity) || 0)));
            summary.aiSimilarity = sim;
            summary.aiFeedback = parsed.feedback || '';
            const el = document.getElementById('as-result');
            if (el && ActiveStudy.session.active && ActiveStudy.session.mode === 1) {
                el.innerHTML += `<div style="margin-top:8px;padding-top:8px;border-top:1px solid #e2e8f0"><b>Confronto con l'originale (${sim}%):</b><br>${escapeHtml(summary.aiFeedback)}</div>`;
            }
        } catch (e) { console.warn('[ActiveStudy] aiCompareStructure', e); }
    }

    // ------------------------------------------------------- salvataggio sessione
    // Chiamato SOLO da finishSession: un record per sessione, mai per verifica.
    async function saveStudyScore(summary) {
        try {
            // Aggiorna lo store di padronanza per pinpoint (Active Recall → mastery).
            // Indipendente dal vault: avviene anche senza electronAPI.
            try {
                if (window.MappAIMastery && window.MappAIMastery.ingestSession) {
                    window.MappAIMastery.ingestSession({
                        mode: ActiveStudy.session.mode,
                        timestamp: new Date().toISOString(),
                        entries: summary.entries || []
                    });
                }
            } catch (e) { console.warn('[ActiveStudy] mastery ingest', e); }

            // Sincronizza lo Spaced Repetition sul nodo: prima Studio Attivo e SR
            // erano contabilità parallele (studyStatus sul canvas ≠ padronanza).
            try { syncNodeStudyStatus(summary.entries || []); } catch (e) { console.warn('[ActiveStudy] SR sync', e); }

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
            if (summary.attempts > 1) md += ` · ${summary.attempts} verifiche`;
            md += '\n';
            const durationSec = ActiveStudy.session.startedAt
                ? Math.max(1, Math.round((Date.now() - ActiveStudy.session.startedAt) / 1000)) : null;
            const jsonRecord = {
                timestamp: now.toISOString(), date: dateStr, time: timeStr,
                mode: mode, modeTitle: modeTitle, project: project,
                score: summary.score, total: summary.total, accuracy: summary.accuracy,
                metric: summary.metric || null,
                attempts: summary.attempts || 1,
                durationSec: durationSec,
                entries: summary.entries || []
            };
            if (summary.totalAvailable != null) jsonRecord.totalAvailable = summary.totalAvailable;
            if (summary.revealed) jsonRecord.revealed = true;
            if (summary.reflection) jsonRecord.reflection = summary.reflection;
            if (summary.aiSimilarity != null) { jsonRecord.aiSimilarity = summary.aiSimilarity; jsonRecord.aiFeedback = summary.aiFeedback; }
            if (ActiveStudy.session.scope && ActiveStudy.session.scope.type === 'branch') {
                jsonRecord.scope = 'branch:' + (ActiveStudy.session.scope.l1Label || ActiveStudy.session.scope.l1Id);
            }
            const r = await window.electronAPI.saveStudyRecord({
                vaultPath: st.activeVaultPath || null,
                dateStr: dateStr, markdownLine: md, jsonRecord: jsonRecord
            });
            if (r && r.success) toast(window.t('tst_as_score_saved', 'Punteggio salvato in «Studio Attivo»'), 'success');
            else if (r && r.error) console.warn('[ActiveStudy] saveStudyRecord', r.error);
        } catch (e) { console.warn('[ActiveStudy] saveStudyScore', e); }
    }

    // studyStatus + nextReview dal risultato di sessione, pesati sulla padronanza
    // EWMA aggregata (non sul singolo esito: un colpo fortunato non fa "done").
    function syncNodeStudyStatus(entries) {
        const st = S();
        const MM = window.MappAIMastery;
        const now = Date.now();
        const DAY = 24 * 60 * 60 * 1000;
        entries.forEach(e => {
            if (e.nodeId == null) return;
            const node = (st.db.nodes || []).find(n => n.id === e.nodeId);
            if (!node) return;
            const agg = MM && MM.node ? MM.node(e.nodeId) : null;
            const acc = agg && agg.attempts ? agg.accuracy : (e.isCorrect ? 0.6 : 0.3);
            if (acc >= 0.8) { node.studyStatus = 'done'; node.nextReview = now + 7 * DAY; }
            else if (acc >= 0.55) { node.studyStatus = 'review'; node.nextReview = now + 3 * DAY; }
            else { node.studyStatus = 'todo'; node.nextReview = now + 0.5 * DAY; }
        });
    }

    // Chiude la contabilità della sessione corrente (se c'è un risultato non salvato).
    function finishSession(opts) {
        const s = ActiveStudy.session;
        if (!s.lastSummary || s.saved) return;
        const summary = s.lastSummary;
        if (ActiveStudy._revealedSolution) summary.revealed = true;
        if (opts && opts.reflection) summary.reflection = opts.reflection;
        s.saved = true;
        saveStudyScore(summary);
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
    // I modi gerarchici hanno bisogno di una radice (level 0); 3/4/6 funzionano
    // anche su Knowledge Graph senza radice (overlay su struttura intatta).
    const HIERARCHICAL_MODES = { 1: true, 2: true, 5: true, 7: true };
    const SCOPABLE_MODES = { 2: true, 3: true, 4: true, 6: true };

    // scope = { type: 'all' } | { type: 'branch', l1Id, l1Label } (opzionale)
    ActiveStudy.enter = function (mode, scope) {
        mode = Number(mode);
        if (!MODES[mode]) return;
        const root = findRoot();
        if (!root && HIERARCHICAL_MODES[mode]) { toast(window.t('tst_as_need_root', 'Serve una mappa con un nodo centrale (radice) per questa modalità'), 'error'); return; }
        if (ActiveStudy.session.active) {
            finishSession(); // salva l'eventuale risultato pendente della sessione precedente
            restoreSnapshot();
        }

        ActiveStudy.session.snapshot = takeSnapshot();
        ActiveStudy.session.mode = mode;
        ActiveStudy.session.active = true;
        ActiveStudy.session.startedAt = Date.now();
        ActiveStudy.session.attempts = 0;
        ActiveStudy.session.lastSummary = null;
        ActiveStudy.session.saved = false;
        ActiveStudy.session.scope = (scope && scope.type === 'branch') ? scope : { type: 'all' };
        ActiveStudy._link1 = null;
        ActiveStudy._revealed = new Set();
        ActiveStudy._revealedSolution = false;
        ActiveStudy._wrong = null;
        ActiveStudy._displaced = null;
        ActiveStudy._seqBranch = null;
        ActiveStudy._entries = [];
        ActiveStudy._placements = {};
        ActiveStudy._chipSel = null;
        ActiveStudy._typedGuess = {};
        ActiveStudy._itemTime = {};
        ActiveStudy._lastItemTs = Date.now();
        ActiveStudy._greyScaffold = false;
        ActiveStudy._scopeSet = null;
        ActiveStudy._targets = null;
        ActiveStudy._quizEdges = null;
        ActiveStudy._verifyIds = null;

        // scope su ramo: insieme dei nodi in gioco (L1 + discendenti), calcolato
        // sulla struttura viva PRIMA delle trasformazioni
        if (ActiveStudy.session.scope.type === 'branch') {
            // confronto per String: l'id arriva da un data-attribute HTML (sempre stringa)
            const l1 = (S().db.nodes || []).find(n => String(n.id) === String(ActiveStudy.session.scope.l1Id));
            if (l1) {
                const ids = new Set([l1.id]);
                (window.getDescendants ? window.getDescendants(l1.id) : []).forEach(n => ids.add(n.id));
                ActiveStudy._scopeSet = ids;
                ActiveStudy.session.scope.l1Id = l1.id; // tipo canonico del nodo
                ActiveStudy.session.scope.l1Label = clean(l1.label);
            } else {
                ActiveStudy.session.scope = { type: 'all' };
            }
        }

        // target del modo 3/6: scope ∩ cap ITEM_CAP, i più deboli prima (adattività
        // dal mastery store: si esercita ciò che NON si sa ancora)
        if (mode === 3) {
            let ids = (S().db.nodes || []).filter(n => n !== root).map(n => n.id);
            if (ActiveStudy._scopeSet) ids = ids.filter(id => ActiveStudy._scopeSet.has(id));
            if (ids.length > ITEM_CAP) ids = weakestFirst(ids).slice(0, ITEM_CAP);
            ActiveStudy._targets = new Set(ids);
        }
        if (mode === 6) {
            const snap = ActiveStudy.session.snapshot;
            const famOf = window.getEdgeFamilyKey || (() => 'altro');
            // solo archi con relazione non generica: con "include" ovunque il quiz
            // dei verbi degenera in una famiglia sola
            let eligible = snap.links.filter(l => l.rel && famOf(l.rel) !== 'altro');
            if (ActiveStudy._scopeSet) eligible = eligible.filter(l => ActiveStudy._scopeSet.has(l.t) || ActiveStudy._scopeSet.has(l.s));
            if (eligible.length > ITEM_CAP) {
                const sorted = weakestFirst(eligible.map(l => l.t));
                const rank = {}; sorted.forEach((id, i) => { if (rank[id] == null) rank[id] = i; });
                eligible = eligible.slice().sort((a, b) => (rank[a.t] || 0) - (rank[b.t] || 0)).slice(0, ITEM_CAP);
            }
            if (!eligible.length) {
                toast(window.t('tst_as_no_verbs', 'Questa mappa non ha verbi di relazione significativi: genera la mappa con le linking words attive'), 'warning');
                ActiveStudy.session.active = false;
                ActiveStudy.session.mode = null;
                return;
            }
            ActiveStudy._quizEdges = new Set(eligible.map(l => l.s + '→' + l.t));
        }
        if (mode === 2) {
            const snap = ActiveStudy.session.snapshot;
            // Set di String: le chiavi di parentOf sono sempre stringhe
            if (ActiveStudy._scopeSet) {
                const l1Id = ActiveStudy.session.scope.l1Id;
                ActiveStudy._verifyIds = new Set([...ActiveStudy._scopeSet]
                    .filter(id => id !== l1Id && snap.parentOf[id] != null).map(String));
            } else {
                ActiveStudy._verifyIds = new Set(Object.keys(snap.parentOf));
            }
            // scaffold fading: padronanza alta sul compito → niente colori-aiuto
            const m = avgMastery([...ActiveStudy._verifyIds]);
            if (m != null && m >= 0.6) {
                ActiveStudy._greyScaffold = true;
                toast(window.t('tst_as_no_colors', 'Padronanza alta: questa volta senza i colori delle aree'), 'info');
            }
        }

        wrapRender();
        applyTransform(mode);
        // mode 7 senza catena valida: annulla la sessione invece di entrare in uno stato rotto
        if (mode === 7 && !ActiveStudy._seqBranch) {
            restoreSnapshot();
            ActiveStudy.session.active = false;
            ActiveStudy.session.mode = null;
            window.renderGraph();
            return;
        }
        if (mode === 1 || mode === 7 || mode === 5) scatterLooseNodes();
        if (mode === 2) {
            if (ActiveStudy._scopeSet) {
                const l1Id = ActiveStudy.session.scope.l1Id;
                scatterLooseNodes(new Set([...ActiveStudy._scopeSet].filter(id => id !== l1Id)));
            } else {
                scatterLooseNodes();
            }
        }
        if (window.updateDegreeStats) window.updateDegreeStats();
        window.renderGraph();
        showPanel(mode);
        if (mode === 3) buildChipPanel();
    };

    ActiveStudy.rivelaSoluzione = function () {
        ActiveStudy._revealedSolution = true;
        restoreSnapshot();
        ActiveStudy._wrong = null;
        if (window.updateDegreeStats) window.updateDegreeStats();
        window.renderGraph();
        setPanelResult('Soluzione mostrata: questa è la mappa originale. Premi "Riprova" per ricominciare o "Esci".');
    };

    ActiveStudy.riprova = function () {
        const mode = ActiveStudy.session.mode;
        const scope = ActiveStudy.session.scope;
        finishSession(); // il tentativo interrotto va comunque a registro
        restoreSnapshot();
        ActiveStudy.enter(mode, scope);
    };

    ActiveStudy.exit = function () {
        const s = ActiveStudy.session;
        // Lavoro fatto ma mai verificato (modi 4/6: le entries sono solo item
        // tentati, quindi il conteggio resta equo): chiudi la contabilità prima
        // di uscire — la padronanza raccolta non va persa.
        if (s.active && !s.lastSummary && (s.mode === 4 || s.mode === 6)
            && ActiveStudy._entries && ActiveStudy._entries.length) {
            try { ActiveStudy.verifica(); } catch (e) { console.warn('[ActiveStudy] auto-verifica in exit', e); }
        }
        // risultato pendente → una domanda di riflessione (facoltativa) prima di salvare.
        // Prompt generici di riflessione post-attività: metacognizione a costo zero (Ch 9).
        if (s.active && s.lastSummary && !s.saved) {
            const modal = buildModal('Prima di uscire…', `
                <p style="color:#334155;font-size:13.5px;margin:0 0 8px">Una domanda sola: <b>cosa ti è sembrato più difficile</b> in questo esercizio? (facoltativo)</p>
                <textarea id="as-reflect-input" rows="3" style="width:100%;border:1px solid #cbd5e1;border-radius:10px;padding:10px;font-size:13.5px;resize:vertical" placeholder="Scrivi qui, oppure salta…"></textarea>
            `, [
                { label: 'Salva ed esci', primary: true, id: 'as-reflect-save' },
                { label: 'Salta', id: 'as-reflect-skip' }
            ], { dismissable: false });
            modal.querySelector('#as-reflect-save').onclick = () => {
                const txt = (modal.querySelector('#as-reflect-input').value || '').trim();
                finishSession(txt ? { reflection: txt } : null);
                modal.remove();
                doExit();
            };
            modal.querySelector('#as-reflect-skip').onclick = () => {
                finishSession();
                modal.remove();
                doExit();
            };
            return;
        }
        doExit();
    };

    // Chiusura SINCRONA senza modali — da chiamare PRIMA di salvare o sostituire
    // la mappa (ritorno alla landing, cambio progetto, import). La sessione
    // smonta la mappa e lo snapshot vive solo in memoria: senza questo ripristino
    // un salvataggio+reload renderebbe permanente lo stato dell'esercizio
    // (gerarchia persa). Il punteggio pendente si salva senza domanda di riflessione.
    ActiveStudy.emergencyExit = function () {
        const s = ActiveStudy.session;
        if (!s.active) return false;
        if (s.lastSummary && !s.saved) {
            try { finishSession(null); } catch (e) { console.warn('[ActiveStudy] finishSession in emergencyExit', e); }
        }
        try { doExit(); } catch (e) {
            // fallback estremo: i DATI prima di tutto, la UI si arrangia
            console.warn('[ActiveStudy] doExit in emergencyExit', e);
            try { restoreSnapshot(); } catch (e2) { console.error('[ActiveStudy] restoreSnapshot fallita', e2); }
            s.active = false;
        }
        return true;
    };

    function doExit() {
        restoreSnapshot();
        ActiveStudy.session.active = false;
        ActiveStudy.session.mode = null;
        ActiveStudy.session.lastSummary = null;
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
    }

    // ------------------------------------------------------------------- UI
    function escapeHtml(s) { const d = document.createElement('div'); d.textContent = s || ''; return d.innerHTML; }

    function buildModal(title, bodyHtml, buttons, opts) {
        const overlay = document.createElement('div');
        overlay.className = 'as-modal-overlay';
        overlay.style.cssText = 'position:fixed;inset:0;z-index:10000;background:rgba(15,23,42,.45);display:flex;align-items:center;justify-content:center;font-family:system-ui,sans-serif';
        const card = document.createElement('div');
        card.setAttribute('role', 'dialog');
        card.setAttribute('aria-modal', 'true');
        card.setAttribute('aria-label', title);
        // opts.maxWidth: il launcher usa un formato landscape largo; gli altri modali restano 520px.
        card.style.cssText = 'background:#fff;border-radius:16px;max-width:' + ((opts && opts.maxWidth) || '520px') + ';width:92%;max-height:84vh;overflow:auto;box-shadow:0 20px 60px rgba(0,0,0,.3);padding:22px';
        let btnHtml = '';
        (buttons || []).forEach(b => {
            const style = b.primary
                ? 'background:#4f46e5;color:#fff'
                : 'background:#f1f5f9;color:#334155';
            btnHtml += `<button type="button" id="${b.id}" style="${style};border:0;border-radius:10px;padding:9px 16px;cursor:pointer;font-weight:600;margin-left:8px">${b.label}</button>`;
        });
        // opts.icon: icona Lucide SVG accanto al titolo (mai emoji — richiesta utente 11/7/26)
        const iconHtml = (opts && opts.icon)
            ? `<i data-lucide="${opts.icon}" style="width:22px;height:22px;color:#4f46e5;flex:0 0 auto"></i>` : '';
        card.innerHTML = `<h3 style="display:flex;align-items:center;gap:10px;margin:0 0 14px;font-size:18px;color:#0f172a;font-weight:700">${iconHtml}${escapeHtml(title)}</h3>
            <div>${bodyHtml}</div>
            <div style="display:flex;justify-content:flex-end;margin-top:18px">${btnHtml}</div>`;
        overlay.appendChild(card);
        if (!opts || opts.dismissable !== false) {
            overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
        }
        document.body.appendChild(overlay);
        if (window.safeCreateIcons) window.safeCreateIcons();   // renderizza ogni <i data-lucide> di titolo/body
        overlay.remove = function () { if (overlay.parentNode) overlay.parentNode.removeChild(overlay); };
        return overlay;
    }

    // ------------------------------------------------------------- launcher
    // Modo consigliato dalla padronanza media: scala riconoscimento → richiamo →
    // struttura → generazione (adattabile, non prescrittivo: tutte restano cliccabili).
    function recommendedMode() {
        const nodes = S().db.nodes || [];
        const m = avgMastery(nodes.map(n => n.id));
        if (m == null || m < 0.4) return 3;
        if (m < 0.6) return 6;
        if (m < 0.75) return 2;
        return 4;
    }

    // escaping per testi dentro attributi HTML (data-tip)
    function _escAttr(s) { return String(s || '').replace(/"/g, '&quot;'); }

    ActiveStudy.openLauncher = function () {
        const nodes = (S() && S().db && S().db.nodes) || [];
        if (!nodes.length) { toast(window.t('tst_as_open_map', 'Apri una mappa per usare lo studio attivo'), 'error'); return; }
        const hasRoot = !!findRoot();
        const famOf = window.getEdgeFamilyKey || (() => 'altro');
        const richEdges = (S().db.links || []).filter(l => l.rel && famOf(l.rel) !== 'altro').length;
        const chainOk = !!findBestChain(liveParentOf());
        const recommended = recommendedMode();

        let noRoot = '';
        if (!hasRoot) {
            noRoot = '<p style="font-size:12px;color:#b45309;background:#fffbeb;border-radius:8px;padding:8px 10px;margin:0 0 10px">' + window.t('as_no_root_note', 'Mappa senza nodo centrale (es. Knowledge Graph): disponibili le modalità che non richiedono la gerarchia.') + '</p>';
        }
        let modeCards = '';
        Object.entries(MODES).forEach(([num, m]) => {
            const n = Number(num);
            if (!hasRoot && HIERARCHICAL_MODES[n]) return;
            // card disabilitate CON motivo: meglio di un fallimento post-selezione
            let disabled = '';
            if (n === 7 && !chainOk) disabled = window.t('as_need_chain', 'Serve un ramo a catena (senza biforcazioni) di almeno 3 nodi.');
            if (n === 6 && richEdges < 3) disabled = window.t('as_need_verbs', 'Servono almeno 3 frecce con verbi significativi (attiva le linking words in generazione).');
            const isRec = !disabled && n === recommended;
            const badge = isRec ? '<span style="background:#eef2ff;color:#4f46e5;border:1px solid #c7d2fe;border-radius:999px;font-size:10px;font-weight:700;padding:2px 8px;margin-left:6px">⭐ ' + window.t('as_recommended', 'Consigliato') + '</span>' : '';
            // UI pulita (11/7/26): la spiegazione vive nel TOOLTIP hover (data-tip,
            // sistema globale di mappai-menu-hubs.js). Il testo grigio resta SOLO
            // per le card disabilitate: il motivo deve essere visibile (un elemento
            // disabled non emette eventi mouse → il tooltip non uscirebbe mai).
            modeCards += `<button type="button" class="as-mode-card" data-mode="${num}" ${disabled ? 'disabled' : ''} data-tip="${_escAttr(m.hint)}" style="display:flex;gap:12px;align-items:center;width:100%;text-align:left;background:#fff;border:1px solid ${isRec ? '#4f46e5' : '#e2e8f0'};border-radius:12px;padding:12px 14px;margin-bottom:8px;cursor:${disabled ? 'default' : 'pointer'};transition:border-color .15s;${disabled ? 'opacity:.5' : ''}">
                <i data-lucide="${m.icon}" style="width:22px;height:22px;color:#4f46e5;flex:0 0 auto"></i>
                <span><span style="display:block;font-weight:700;color:#0f172a">${num}. ${m.title}${badge}</span>
                ${disabled ? `<span style="display:block;font-size:12.5px;color:#64748b;line-height:1.45;margin-top:2px">${disabled}</span>` : ''}</span>
            </button>`;
        });

        // Cloze e Palazzo della Memoria = MODALITÀ di studio a tutti gli effetti
        // (colonna sinistra, sotto le 7 numerate). Viste (toggle) e Strumenti
        // a destra. Prima erano bottoni flottanti sul canvas; ora vivono qui,
        // così le attività di studio stanno in un posto solo.
        const mvOn = !!(window.MappAIMasteryView && window.MappAIMasteryView.active);
        const evOn = !!(window.MappAIEffortView && window.MappAIEffortView.active);
        const extraModes = [
            { key: 'cloze', icon: 'pencil-line', ok: !!window.MappAICloze,
              title: window.t('as_cloze_title', 'Cloze — completa le definizioni'),
              hint: window.t('as_cloze_hint', 'Riempi i termini oscurati nelle descrizioni dei nodi.') },
            { key: 'palace', icon: 'landmark', ok: !!(window.MappAIPalace && window.MappAIPalace.start),
              title: window.t('as_palace_title', 'Palazzo della Memoria'),
              hint: window.t('as_palace_hint', 'Viaggio per stanze col metodo dei loci.') }
        ];
        const views = [
            { key: 'heatmap', icon: 'target', ok: !!window.MappAIMasteryView, on: mvOn,
              title: window.t('as_heatmap_title', 'Heat map padronanza'),
              hint: mvOn ? window.t('as_view_on', 'Vista ATTIVA — clicca per spegnere') : window.t('as_view_off', 'Vista spenta — clicca per accendere') },
            { key: 'effort', icon: 'flame', ok: !!window.MappAIEffortView, on: evOn,
              title: window.t('as_effort_title', 'Mappa lavoro'),
              hint: evOn ? window.t('as_view_on', 'Vista ATTIVA — clicca per spegnere') : window.t('as_view_off', 'Vista spenta — clicca per accendere') }
        ];
        const tools = [
            { key: 'studypath', icon: 'compass', ok: !!(window.MappAIStudyPath && window.MappAIStudyPath.open),
              title: window.t('as_studypath_title', 'Cosa studiare ora'),
              hint: window.t('as_studypath_hint', 'Percorso consigliato e ripasso programmato.') },
            { key: 'celeration', icon: 'trending-up', ok: !!(window.MappAICeleration && window.MappAICeleration.open),
              title: window.t('as_celeration_title', 'I tuoi progressi nel tempo'),
              hint: window.t('as_celeration_hint', 'Grafico di crescita delle tue sessioni (celeration).') }
        ];
        const sectionHeader = txt => `<div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#94a3b8;margin:0 0 8px">${txt}</div>`;
        // num opzionale: Cloze/Palazzo continuano la numerazione delle 7 modalità
        // (8, 9); viste e strumenti restano senza numero. Spiegazioni nel tooltip
        // hover (data-tip); testo grigio solo per il motivo delle card disabilitate.
        const extraCard = (x, num) => {
            const dis = x.ok ? '' : window.t('as_extra_missing', 'Funzione non disponibile.');
            const activeBorder = x.on ? '#4f46e5' : '#e2e8f0';
            const label = num ? `${num}. ${x.title}` : x.title;
            return `<button type="button" class="as-extra-card" data-extra="${x.key}" ${dis ? 'disabled' : ''} data-tip="${_escAttr(x.hint)}" style="display:flex;gap:12px;align-items:center;width:100%;text-align:left;background:${x.on ? '#eef2ff' : '#fff'};border:1px solid ${activeBorder};border-radius:12px;padding:12px 14px;margin-bottom:8px;cursor:${dis ? 'default' : 'pointer'};transition:border-color .15s;${dis ? 'opacity:.5' : ''}">
                <i data-lucide="${x.icon}" style="width:22px;height:22px;color:#4f46e5;flex:0 0 auto"></i>
                <span><span style="display:block;font-weight:700;color:#0f172a">${label}</span>
                ${dis ? `<span style="display:block;font-size:12.5px;color:#64748b;line-height:1.45;margin-top:2px">${dis}</span>` : ''}</span>
            </button>`;
        };

        // Layout landscape a due colonne: modalità a sinistra, viste+strumenti a
        // destra. auto-fit → su finestre strette le colonne si impilano da sole.
        const body = noRoot + `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:4px 22px;align-items:start">
            <div>${sectionHeader(window.t('as_modes_header', 'Modalità di studio'))}${modeCards}${extraModes.map((x, i) => extraCard(x, 8 + i)).join('')}</div>
            <div>
                ${sectionHeader(window.t('as_views_header', 'Viste ed esercizi rapidi'))}${views.map(x => extraCard(x)).join('')}
                <div style="height:10px"></div>
                ${sectionHeader(window.t('as_tools_header', 'Strumenti'))}${tools.map(x => extraCard(x)).join('')}
            </div>
        </div>`;

        const modal = buildModal(window.t('as_title', 'Studio attivo') + ' — ' + window.t('as_pick_mode', 'scegli una modalità'), body, [{ label: 'Annulla', id: 'as-launch-cancel' }], { maxWidth: '980px', icon: 'puzzle' });
        modal.querySelector('#as-launch-cancel').onclick = () => modal.remove();
        modal.querySelectorAll('.as-mode-card').forEach(btn => {
            if (btn.disabled) return;
            btn.onmouseenter = () => btn.style.borderColor = '#4f46e5';
            btn.onmouseleave = () => btn.style.borderColor = '#e2e8f0';
            btn.onclick = () => {
                const mode = Number(btn.getAttribute('data-mode'));
                modal.remove();
                maybeChooseScope(mode, scope => ActiveStudy.enter(mode, scope));
            };
        });
        modal.querySelectorAll('.as-extra-card').forEach(btn => {
            if (btn.disabled) return;
            btn.onclick = () => {
                const key = btn.getAttribute('data-extra');
                modal.remove();
                if (key === 'cloze') { if (window.MappAICloze) window.MappAICloze.start(); }
                else if (key === 'heatmap') { if (window.MappAIMasteryView) window.MappAIMasteryView.toggle(); }
                else if (key === 'effort') { if (window.MappAIEffortView) window.MappAIEffortView.toggle(); }
                else if (key === 'studypath') { if (window.MappAIStudyPath) window.MappAIStudyPath.open(); }
                else if (key === 'palace') { if (window.MappAIPalace) window.MappAIPalace.start(); }
                else if (key === 'celeration') { if (window.MappAICeleration) window.MappAICeleration.open(); }
            };
        });
        if (window.safeCreateIcons) window.safeCreateIcons();
    };

    // Sopra SCOPE_PROMPT_MIN nodi una sessione su tutta la mappa è un muro per il
    // target ADHD/DSA: proponi il singolo ramo (loop corto), mappa intera resta scelta.
    function maybeChooseScope(mode, done) {
        const nodes = S().db.nodes || [];
        const root = findRoot();
        const l1s = nodes.filter(n => n.level === 1);
        if (!SCOPABLE_MODES[mode] || !root || nodes.length <= SCOPE_PROMPT_MIN || l1s.length < 2) {
            done(null); return;
        }
        let rows = `<button type="button" class="as-scope" data-l1="" style="display:block;width:100%;text-align:left;background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:10px 12px;margin-bottom:6px;cursor:pointer">
            <b style="color:#0f172a">Tutta la mappa</b> <span style="color:#94a3b8;font-size:12px">(${nodes.length} nodi)</span>
        </button>`;
        l1s.forEach(h => {
            const count = 1 + (window.getDescendants ? window.getDescendants(h.id).length : 0);
            rows += `<button type="button" class="as-scope" data-l1="${h.id}" style="display:block;width:100%;text-align:left;background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:10px 12px;margin-bottom:6px;cursor:pointer">
                <b style="color:#0f172a">${escapeHtml(clean(h.label))}</b> <span style="color:#94a3b8;font-size:12px">(${count} nodi)</span>
            </button>`;
        });
        const modal = buildModal('Su cosa vuoi lavorare?', `
            <p style="color:#64748b;font-size:13px;margin:0 0 10px">La mappa è grande: una sessione su un ramo solo è più efficace di una maratona.</p>
            ${rows}
        `, [{ label: 'Annulla', id: 'as-scope-cancel' }]);
        modal.querySelector('#as-scope-cancel').onclick = () => modal.remove();
        modal.querySelectorAll('.as-scope').forEach(btn => {
            btn.onclick = () => {
                const l1Id = btn.getAttribute('data-l1');
                modal.remove();
                done(l1Id ? { type: 'branch', l1Id: l1Id } : null);
            };
        });
    }

    // Pannello laterale persistente durante la sessione
    function showPanel(mode) {
        const m = MODES[mode];
        let panel = document.getElementById('active-study-panel');
        if (panel) panel.remove();
        panel = document.createElement('div');
        panel.id = 'active-study-panel';
        panel.setAttribute('role', 'complementary');
        panel.setAttribute('aria-label', 'Pannello studio attivo');
        panel.style.cssText = 'position:fixed;top:80px;right:20px;z-index:9998;width:300px;background:#fff;border:1px solid #e2e8f0;border-radius:16px;box-shadow:0 10px 40px rgba(0,0,0,.16);padding:16px;font-family:system-ui,sans-serif';
        const scopeLabel = (ActiveStudy.session.scope && ActiveStudy.session.scope.type === 'branch')
            ? `<div style="font-size:11px;color:#4f46e5;background:#eef2ff;border-radius:999px;display:inline-block;padding:2px 10px;margin-bottom:6px">Ramo: ${escapeHtml(ActiveStudy.session.scope.l1Label || '')}</div>` : '';
        const growthBtn = window.MappAICeleration
            ? '<button type="button" id="as-growth" style="background:#f1f5f9;color:#334155;border:0;border-radius:10px;padding:8px 12px;cursor:pointer;font-weight:600;font-size:13px"><i data-lucide="trending-up" style="width:14px;height:14px;vertical-align:-2px"></i> Crescita</button>' : '';
        panel.innerHTML = `
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
                <i data-lucide="${m.icon}" style="width:20px;height:20px;color:#4f46e5"></i>
                <span style="font-weight:700;color:#0f172a;font-size:15px">${window.t('as_title', 'Studio attivo')}</span>
                <button type="button" id="as-close" title="${window.t('as_exit', 'Esci')}" aria-label="${window.t('as_exit_aria', 'Esci dallo studio attivo')}" style="margin-left:auto;background:none;border:0;cursor:pointer;color:#94a3b8;font-size:20px;line-height:1">×</button>
            </div>
            ${scopeLabel}
            <div style="font-weight:600;color:#334155;font-size:13.5px;margin-bottom:4px">${mode}. ${m.title}</div>
            <div style="font-size:12.5px;color:#64748b;line-height:1.5;margin-bottom:10px">${m.hint}</div>
            <div id="as-status" style="font-size:12.5px;color:#4f46e5;min-height:16px;margin-bottom:6px" aria-live="polite"></div>
            <div id="as-score" style="font-size:12.5px;color:#0f172a;min-height:16px;margin-bottom:6px" aria-live="polite"></div>
            <div id="as-result" style="font-size:12.5px;color:#0f172a;background:#f8fafc;border-radius:10px;padding:8px;display:none;margin-bottom:10px" aria-live="polite"></div>
            <div style="display:flex;gap:8px;flex-wrap:wrap">
                <button type="button" id="as-verify" style="background:#22c55e;color:#fff;border:0;border-radius:10px;padding:8px 12px;cursor:pointer;font-weight:600;font-size:13px">${mode === 3 ? window.t('as_compare', 'Confronta') : window.t('as_verify', 'Verifica')}</button>
                <button type="button" id="as-reveal" style="background:#f59e0b;color:#fff;border:0;border-radius:10px;padding:8px 12px;cursor:pointer;font-weight:600;font-size:13px">${window.t('as_solution', 'Soluzione')}</button>
                <button type="button" id="as-retry" style="background:#f1f5f9;color:#334155;border:0;border-radius:10px;padding:8px 12px;cursor:pointer;font-weight:600;font-size:13px">${window.t('as_retry', 'Riprova')}</button>
                ${growthBtn}
            </div>
            <div id="as-save-note" style="display:none;font-size:10.5px;color:#94a3b8;margin-top:8px">${window.t('as_save_note', 'Il punteggio si salva quando esci dalla sessione.')}</div>`;
        document.body.appendChild(panel);
        if (window.safeCreateIcons) window.safeCreateIcons();
        panel.querySelector('#as-close').onclick = () => ActiveStudy.exit();
        panel.querySelector('#as-verify').onclick = () => ActiveStudy.verifica();
        panel.querySelector('#as-reveal').onclick = () => ActiveStudy.rivelaSoluzione();
        panel.querySelector('#as-retry').onclick = () => ActiveStudy.riprova();
        const g = panel.querySelector('#as-growth');
        if (g) g.onclick = () => { try { window.MappAICeleration.open(); } catch (e) { } };
        updatePanelScore();
        if (window.safeCreateIcons) window.safeCreateIcons();
    }

    function appendSaveNote() {
        const el = document.getElementById('as-save-note');
        if (el) el.style.display = 'block';
    }

    function setPanelStatus(t) { const el = document.getElementById('as-status'); if (el) el.innerHTML = t || ''; }
    function setPanelResult(html) { const el = document.getElementById('as-result'); if (el) { el.style.display = 'block'; el.innerHTML = html; } }
    function updatePanelScore() {
        const el = document.getElementById('as-score'); if (!el) return;
        const mode = ActiveStudy.session.mode;
        if (mode === 4 || mode === 6) {
            const t = tallyFromEntries();
            el.textContent = `Punteggio: ${t.ok} giuste / ${t.ko} sbagliate`;
        } else if (mode === 3) {
            const placed = Object.keys(ActiveStudy._placements || {}).length;
            const tot = ActiveStudy._targets ? ActiveStudy._targets.size : 0;
            el.textContent = `Posizionate: ${placed}/${tot}`;
        } else { el.textContent = ''; }
    }

    // keyframes spinner (una volta)
    if (!document.getElementById('as-style')) {
        const styleEl = document.createElement('style');
        styleEl.id = 'as-style';
        styleEl.textContent = '@keyframes as-spin{to{transform:rotate(360deg)}}';
        document.head.appendChild(styleEl);
    }

    console.log('[ActiveStudy] modulo studio attivo caricato (7 modalità, misurazione PT v2)');
})();
