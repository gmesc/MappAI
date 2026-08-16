/* =========================================================================
   MOTORI DI LAYOUT PER LA VISTA STUDIO — modulo puro (app + banco-layout)
   Due motori:
     TD   : albero top-down (Reingold-Tilford, d3.tree)
     DAG  : grafo aciclico a livelli (Sugiyama scritto a mano)
   Tre stadi separati, così ogni opzione è una leva vera:
     1) POSIZIONAMENTO  -> dove stanno i nodi
     2) INSTRADAMENTO   -> che strada fanno gli archi
     3) MISURA          -> sulla geometria EFFETTIVAMENTE disegnata
   Coordinate interne in (al, ac):
     al = lungo il livello   ·   ac = attraverso i livelli
   L'orientamento (dall'alto / da sinistra) e' una sola trasformazione finale:
   al/ac -> x/y. Nessun ramo di codice duplicato per i due versi.
   Nessun DOM, nessuna dipendenza dall'app. Gira in Node e nel browser.
   ========================================================================= */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else { root.MappAIStudioLayouts = factory(); root.MockLayouts = root.MappAIStudioLayouts; }
}(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const SEP = ' ␟ ';   // separatore di chiave, assente nei dati

    const DEFAULTS = {
        mode: 'dag',          // 'td' | 'dag'
        orient: 'td',         // 'td' (dall'alto) | 'lr' (da sinistra)
        w: 168, h: 46,        // card
        gapNode: 26,          // fra card dello stesso livello
        gapLayer: 96,         // fra livelli
        gapSub: 14,           // fra sub-righe dentro un livello
        subRows: '1',         // 1..6 oppure 'auto' — l'interfaccia non lo espone più (decisione 1/8), resta come leva interna
        subTarget: 2.2,       // rapporto lungo/attraverso cercato da 'auto'
        routing: 'curva',     // 'curva' | 'dritto' | 'orto'
        ports: true,          // punti di attacco distinti sul bordo del nodo
        packGutter: 96
    };

    /* Profondita' topologica di ogni nodo (cammino piu' lungo dalle sorgenti,
       cicli rotti prima). Serve al filtro «mostra fino al livello N»: in KG il
       campo `level` non e' semantico, quindi va ricavata dal grafo. */
    function depths(nodes, links) {
        const ids = nodes.map(n => n.id);
        const idSet = new Set(ids);
        const edges = edgeList(links).filter(e => idSet.has(e.s) && idSet.has(e.t));
        const out = new Map();
        components(ids, edges).forEach(comp => {
            const cs = new Set(comp);
            const br = breakCycles(comp, edges.filter(e => cs.has(e.s) && cs.has(e.t)));
            assignLayers(comp, br.edges).forEach((v, k) => out.set(k, v));
        });
        return out;
    }

    function indexBy(arr, k) { const m = new Map(); arr.forEach(o => m.set(o[k], o)); return m; }

    function edgeList(links) {
        const seen = new Set(), out = [];
        links.forEach(l => {
            const s = l.source, t = l.target;
            if (s === t) return;
            const k = s + SEP + t;
            if (seen.has(k)) return;
            seen.add(k);
            out.push({ s, t, rel: l.rel || '', isCross: !!l.isCross, _uid: out.length });
        });
        return out;
    }

    function components(nodeIds, edges) {
        const par = new Map(nodeIds.map(id => [id, id]));
        const find = a => { while (par.get(a) !== a) { par.set(a, par.get(par.get(a))); a = par.get(a); } return a; };
        const uni = (a, b) => { a = find(a); b = find(b); if (a !== b) par.set(a, b); };
        edges.forEach(e => uni(e.s, e.t));
        const g = new Map();
        nodeIds.forEach(id => { const r = find(id); if (!g.has(r)) g.set(r, []); g.get(r).push(id); });
        return [...g.values()];
    }

    /* =======================================================================
       1) POSIZIONAMENTO — parte comune ai due motori
       ======================================================================= */

    // rottura dei cicli: gli archi all'indietro vengono INVERTITI, mai buttati
    function breakCycles(nodeIds, edges) {
        const out = edges.map(e => ({ ...e, reversed: false }));
        const adj = new Map(nodeIds.map(id => [id, []]));
        out.forEach((e, i) => { if (adj.has(e.s)) adj.get(e.s).push(i); });
        const WHITE = 0, GRAY = 1, BLACK = 2;
        const color = new Map(nodeIds.map(id => [id, WHITE]));
        let rev = 0;
        const indeg = new Map(nodeIds.map(id => [id, 0]));
        out.forEach(e => indeg.set(e.t, (indeg.get(e.t) || 0) + 1));
        const start = [...nodeIds].sort((a, b) => indeg.get(a) - indeg.get(b));

        function dfs(u0) {
            const stack = [{ u: u0, i: 0 }];
            color.set(u0, GRAY);
            while (stack.length) {
                const fr = stack[stack.length - 1];
                const list = adj.get(fr.u) || [];
                if (fr.i >= list.length) { color.set(fr.u, BLACK); stack.pop(); continue; }
                const e = out[list[fr.i++]];
                if (e.reversed) continue;
                const c = color.get(e.t);
                if (c === GRAY) { e.reversed = true; const t = e.s; e.s = e.t; e.t = t; rev++; }
                else if (c === WHITE) { color.set(e.t, GRAY); stack.push({ u: e.t, i: 0 }); }
            }
        }
        start.forEach(id => { if (color.get(id) === WHITE) dfs(id); });
        return { edges: out, reversed: rev };
    }

    // livelli per cammino piu' lungo dalle sorgenti
    function assignLayers(nodeIds, edges) {
        const indeg = new Map(nodeIds.map(id => [id, 0]));
        const succ = new Map(nodeIds.map(id => [id, []]));
        edges.forEach(e => { indeg.set(e.t, indeg.get(e.t) + 1); succ.get(e.s).push(e.t); });
        const layer = new Map(nodeIds.map(id => [id, 0]));
        const q = nodeIds.filter(id => indeg.get(id) === 0);
        let head = 0;
        while (head < q.length) {
            const u = q[head++];
            succ.get(u).forEach(v => {
                if (layer.get(v) < layer.get(u) + 1) layer.set(v, layer.get(u) + 1);
                indeg.set(v, indeg.get(v) - 1);
                if (indeg.get(v) === 0) q.push(v);
            });
        }
        return layer;
    }

    // nodi fittizi per gli archi che scavalcano piu' livelli
    function addDummies(nodeIds, edges, layer) {
        const nodes = nodeIds.map(id => ({ id, layer: layer.get(id), dummy: false }));
        const byId = indexBy(nodes, 'id');
        const segs = []; let dn = 0;
        edges.forEach(e => {
            const a = layer.get(e.s), b = layer.get(e.t);
            if (b - a <= 1) { segs.push({ s: e.s, t: e.t, edge: e, first: true, last: true }); return; }
            let prev = e.s;
            for (let L = a + 1; L < b; L++) {
                const id = '__d' + (dn++);
                const nd = { id, layer: L, dummy: true, edge: e };
                nodes.push(nd); byId.set(id, nd);
                segs.push({ s: prev, t: id, edge: e, first: prev === e.s, last: false });
                prev = id;
            }
            segs.push({ s: prev, t: e.t, edge: e, first: false, last: true });
        });
        return { nodes, byId, segs };
    }

    /* Incroci fra DUE livelli adiacenti. L'appartenenza ai livelli non cambia
       mai durante l'ordinamento (cambia solo l'ordine), quindi gli insiemi e i
       segmenti per coppia di livelli si preparano una volta sola. */
    function pairIndex(layers, segs) {
        const lset = layers.map(l => new Set(l));
        const byPair = [];
        for (let L = 0; L < layers.length - 1; L++) byPair.push([]);
        segs.forEach(s => {
            for (let L = 0; L < layers.length - 1; L++)
                if (lset[L].has(s.s) && lset[L + 1].has(s.t)) { byPair[L].push(s); break; }
        });
        return byPair;
    }
    function crossPair(list, pos) {
        const es = list.map(s => [pos.get(s.s), pos.get(s.t)]);
        es.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
        let n = 0;
        for (let i = 0; i < es.length; i++)
            for (let j = i + 1; j < es.length; j++)
                if (es[i][1] > es[j][1]) n++;
        return n;
    }
    function countCrossings(layers, segs, pos, byPair) {
        const bp = byPair || pairIndex(layers, segs);
        let total = 0;
        for (let L = 0; L < bp.length; L++) total += crossPair(bp[L], pos);
        return total;
    }

    // ordinamento dentro i livelli: mediana + trasposizione.
    // `init` 'raw' o 'dfs': nessuna delle due vince sempre (misurato: sulla MM
    // la grezza chiude a 18 incroci, la dfs a 25; sul KG e' il contrario).
    function ordering(nodes, segs, iterations, init) {
        const maxL = Math.max(...nodes.map(n => n.layer));
        let layers = [];
        for (let L = 0; L <= maxL; L++) layers.push(nodes.filter(n => n.layer === L).map(n => n.id));

        const predOf = new Map(), succOf = new Map();
        nodes.forEach(n => { predOf.set(n.id, []); succOf.set(n.id, []); });
        segs.forEach(s => { succOf.get(s.s).push(s.t); predOf.get(s.t).push(s.s); });

        if (init === 'dfs') {
            const rank = new Map(); let c = 0; const seen = new Set();
            const visit = id => {
                if (seen.has(id)) return;
                seen.add(id); rank.set(id, c++);
                (succOf.get(id) || []).forEach(visit);
            };
            (layers[0] || []).forEach(visit);
            nodes.forEach(n => { if (!seen.has(n.id)) { seen.add(n.id); rank.set(n.id, c++); } });
            layers = layers.map(l => l.slice().sort((a, b) => rank.get(a) - rank.get(b)));
        }

        const posMap = () => { const p = new Map(); layers.forEach(l => l.forEach((id, i) => p.set(id, i))); return p; };
        const median = (ids, pos) => {
            const ps = ids.map(i => pos.get(i)).filter(v => v !== undefined).sort((a, b) => a - b);
            if (!ps.length) return -1;
            const m = ps.length >> 1;
            return ps.length % 2 ? ps[m] : (ps[m - 1] + ps[m]) / 2;
        };

        // preparato UNA volta: l'appartenenza ai livelli non cambia mai
        const byPair = pairIndex(layers, segs);
        // incroci che coinvolgono il livello L: solo le due coppie confinanti.
        // Prima ogni singolo scambio ricontava TUTTO il disegno, e su un grafo
        // denso da 70 nodi il layout impiegava 67 secondi (misurato).
        const around = (L, pos) =>
            (L > 0 ? crossPair(byPair[L - 1], pos) : 0) +
            (L < byPair.length ? crossPair(byPair[L], pos) : 0);

        let best = layers.map(l => l.slice());
        let bestX = countCrossings(layers, segs, posMap(), byPair);

        for (let it = 0; it < iterations; it++) {
            const down = it % 2 === 0;
            const pos = posMap();
            const range = down ? [...layers.keys()].slice(1) : [...layers.keys()].slice(0, -1).reverse();
            range.forEach(L => {
                layers[L] = layers[L]
                    .map((id, i) => ({ id, i, m: median((down ? predOf : succOf).get(id), pos) }))
                    .map(o => ({ id: o.id, i: o.i, m: o.m < 0 ? o.i : o.m }))
                    .sort((a, b) => a.m - b.m || a.i - b.i).map(o => o.id);
            });
            let improved = true, guard = 0;
            const p = posMap();                 // tenuta aggiornata a ogni scambio
            while (improved && guard++ < 4) {
                improved = false;
                for (let L = 0; L < layers.length; L++)
                    for (let i = 0; i < layers[L].length - 1; i++) {
                        const a = layers[L][i], b = layers[L][i + 1];
                        const before = around(L, p);
                        layers[L][i] = b; layers[L][i + 1] = a; p.set(b, i); p.set(a, i + 1);
                        if (around(L, p) < before) improved = true;
                        else { layers[L][i] = a; layers[L][i + 1] = b; p.set(a, i); p.set(b, i + 1); }
                    }
            }
            const x = countCrossings(layers, segs, p, byPair);
            if (x < bestX) { bestX = x; best = layers.map(l => l.slice()); }
        }
        return { layers: best, crossings: bestX };
    }

    function orderingBest(nodes, segs, iterations) {
        const a = ordering(nodes, segs, iterations, 'raw');
        const b = ordering(nodes, segs, iterations, 'dfs');
        return b.crossings < a.crossings ? b : a;
    }

    /* Metodo delle PRIORITA' (Sugiyama): un nodo si avvicina alla mediana dei
       vicini potendo spostare SOLO i nodi a priorita' minore; i maggiori fanno
       da muro. Senza questo vincolo l'assegnamento e' un cricchetto che allarga
       il disegno a ogni passata (misurato: un livello da 568px di fabbisogno
       occupava 4544px). I fittizi hanno priorita' massima -> archi lunghi dritti. */
    function assignAlong(layers, segs, byId, sizeAlong, gapNode) {
        const wOf = id => byId.get(id).dummy ? 14 : sizeAlong;
        const minGap = (a, b) => wOf(a) / 2 + gapNode + wOf(b) / 2;
        const al = new Map();
        layers.forEach(l => { let cur = 0; l.forEach(id => { al.set(id, cur + wOf(id) / 2); cur += wOf(id) + gapNode; }); });

        const predOf = new Map(), succOf = new Map();
        byId.forEach((n, id) => { predOf.set(id, []); succOf.set(id, []); });
        segs.forEach(s => { succOf.get(s.s).push(s.t); predOf.get(s.t).push(s.s); });

        const med = ids => {
            const v = ids.map(i => al.get(i)).filter(n => n !== undefined).sort((a, b) => a - b);
            if (!v.length) return null;
            const m = v.length >> 1;
            return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
        };
        const prio = (id, down) => byId.get(id).dummy ? 1e9 : (down ? predOf : succOf).get(id).length;

        function move(l, idx, delta, down) {
            if (Math.abs(delta) < 0.5) return;
            const id = l[idx], p = prio(id, down);
            const dir = delta > 0 ? 1 : -1;
            let avail = Infinity, acc = 0;
            for (let k = idx + dir; k >= 0 && k < l.length; k += dir) {
                const a = dir > 0 ? l[k - 1] : l[k], b = dir > 0 ? l[k] : l[k + 1];
                acc += al.get(b) - al.get(a) - minGap(a, b);
                if (prio(l[k], down) >= p) { avail = acc; break; }
            }
            const d = Math.min(Math.abs(delta), avail);
            if (d <= 0) return;
            al.set(id, al.get(id) + dir * d);
            for (let k = idx + dir; k >= 0 && k < l.length; k += dir) {
                if (dir > 0) {
                    const need = al.get(l[k - 1]) + minGap(l[k - 1], l[k]);
                    if (al.get(l[k]) < need) al.set(l[k], need); else break;
                } else {
                    const cap = al.get(l[k + 1]) - minGap(l[k], l[k + 1]);
                    if (al.get(l[k]) > cap) al.set(l[k], cap); else break;
                }
            }
        }

        for (let it = 0; it < 10; it++) {
            const down = it % 2 === 0;
            const order = down ? [...layers.keys()] : [...layers.keys()].reverse();
            order.forEach(L => {
                const l = layers[L];
                l.map((id, i) => ({ id, i })).sort((a, b) => prio(b.id, down) - prio(a.id, down))
                    .forEach(o => {
                        const m = med((down ? predOf : succOf).get(o.id));
                        if (m !== null) move(l, o.i, m - al.get(o.id), down);
                    });
            });
        }
        layers.forEach(l => {
            for (let i = 1; i < l.length; i++) {
                const need = al.get(l[i - 1]) + minGap(l[i - 1], l[i]);
                if (al.get(l[i]) < need) al.set(l[i], need);
            }
        });
        return al;
    }

    /* -----------------------------------------------------------------------
       SUB-RIGHE NON GERARCHICHE
       Un livello resta UN livello quanto a significato, ma viene ripiegato su k
       righe per accorciarlo. Il taglio e' in tratti CONTIGUI nell'ordine gia'
       calcolato: i vicini restano vicini, quindi il lavoro di riduzione degli
       incroci non viene buttato via.
       Costo dichiarato: gli archi che scendono nelle righe sotto passano
       accanto alla riga sopra -> si vede nella metrica «archi su una card».
       ----------------------------------------------------------------------- */
    function layerSpan(layers, al, sizeAlong) {
        let span = 0;
        layers.forEach(l => {
            if (!l.length) return;
            const a = Math.min(...l.map(id => al.get(id))), b = Math.max(...l.map(id => al.get(id)));
            span = Math.max(span, b - a + sizeAlong);
        });
        return span;
    }

    function chooseSubRows(layers, al, sizeAlong, sizeAcross, opt) {
        if (opt.subRows !== 'auto') return Math.max(1, Math.min(6, +opt.subRows || 1));
        const span = layerSpan(layers, al, sizeAlong);
        for (let k = 1; k <= 4; k++) {
            const across = layers.length * (sizeAcross * k + opt.gapSub * (k - 1) + opt.gapLayer);   // stima coerente con bandOf
            if (span / k <= across * opt.subTarget) return k;
        }
        return 4;
    }

    function applySubRows(layers, al, byId, k, sizeAlong, gapNode) {
        const sub = new Map();
        if (k <= 1) { layers.forEach(l => l.forEach(id => sub.set(id, 0))); return { sub, rows: 1 }; }
        const wOf = id => (byId.get(id) && byId.get(id).dummy) ? 14 : sizeAlong;
        layers.forEach(l => {
            if (l.length <= 1) { l.forEach(id => sub.set(id, 0)); return; }
            const per = Math.ceil(l.length / k);
            const rows = [];
            for (let i = 0; i < l.length; i += per) rows.push(l.slice(i, i + per));
            const widths = [];
            rows.forEach((r, ri) => {
                let cur = 0;
                r.forEach(id => { al.set(id, cur + wOf(id) / 2); cur += wOf(id) + gapNode; sub.set(id, ri); });
                widths.push(Math.max(0, cur - gapNode));
            });
            const wide = Math.max(...widths);
            rows.forEach((r, ri) => {
                const off = (wide - widths[ri]) / 2;
                r.forEach(id => al.set(id, al.get(id) + off));
            });
        });
        return { sub, rows: k };
    }

    /* -----------------------------------------------------------------------
       PORTE SUL BORDO DEL NODO
       Senza, tutti gli archi entrano ed escono dal CENTRO: alla fine si vede
       un fascio di linee sovrapposte e una sola punta di freccia, e non si
       capisce quante relazioni arrivino davvero. Qui ogni arco riceve un punto
       di attacco distinto, distribuito lungo il lato e ordinato secondo la
       posizione dell'altro capo — così gli archi non si scavalcano fra loro
       nell'ultimo tratto.
       ----------------------------------------------------------------------- */
    function assignPorts(edges, posAl, sizeAlong, opt) {
        const map = new Map();
        if (!opt || opt.ports === false) return map;
        const key = e => (e._uid !== undefined) ? ('u' + e._uid) : (e.s + SEP + e.t);
        // Il margine mangiava metà del lato utile: con orientamento da sinistra
        // il lato è l'ALTEZZA della card (46px) e con 14px per parte restavano
        // 18px per tutte le frecce. Ora il margine è proporzionale e il passo
        // massimo è più largo, così le punte arrivano davvero distanziate.
        const margin = Math.min(10, sizeAlong * 0.1);
        const maxStep = 34;
        const out = new Map(), inn = new Map();
        edges.forEach(e => {
            if (posAl.get(e.s) === undefined || posAl.get(e.t) === undefined) return;
            if (!out.has(e.s)) out.set(e.s, []);
            if (!inn.has(e.t)) inn.set(e.t, []);
            out.get(e.s).push(e); inn.get(e.t).push(e);
        });
        const spread = (m, side) => m.forEach((list, id) => {
            if (list.length < 2) { list.forEach(e => map.set(key(e) + '|' + side, 0)); return; }
            // ordinati per posizione dell'ALTRO capo: gli archi partono già
            // nella direzione in cui devono andare e non si incrociano subito
            list.sort((a, b) => posAl.get(side === 'out' ? a.t : a.s) - posAl.get(side === 'out' ? b.t : b.s));
            const usable = Math.max(0, sizeAlong - margin * 2);
            const step = Math.min(maxStep, usable / (list.length - 1));
            list.forEach((e, i) => map.set(key(e) + '|' + side, (i - (list.length - 1) / 2) * step));
        });
        spread(out, 'out'); spread(inn, 'in');
        return map;
    }
    function portedEnds(chain, edge, ports) {
        if (!ports || !ports.size || chain.length < 2) return chain;
        const k = (edge._uid !== undefined) ? ('u' + edge._uid) : (edge.s + SEP + edge.t);
        const o = ports.get(k + '|out');
        const i = ports.get(k + '|in');
        const c = chain.slice();
        if (o) c[0] = { al: c[0].al + o, ac: c[0].ac };
        if (i) c[c.length - 1] = { al: c[c.length - 1].al + i, ac: c[c.length - 1].ac };
        return c;
    }

    /* =======================================================================
       2) INSTRADAMENTO — tre strade, stessa geometria per disegno e misura
       ======================================================================= */
    function sampleBump(a, b, n) {
        const c1 = { al: a.al, ac: (a.ac + b.ac) / 2 }, c2 = { al: b.al, ac: (a.ac + b.ac) / 2 };
        const out = [];
        for (let i = 0; i <= n; i++) {
            const t = i / n, u = 1 - t;
            out.push({
                al: u * u * u * a.al + 3 * u * u * t * c1.al + 3 * u * t * t * c2.al + t * t * t * b.al,
                ac: u * u * u * a.ac + 3 * u * u * t * c1.ac + 3 * u * t * t * c2.ac + t * t * t * b.ac
            });
        }
        return out;
    }
    function sampleArc(a, b, n) {
        const mal = (a.al + b.al) / 2;
        const mac = (a.ac + b.ac) / 2 - Math.min(170, Math.abs(a.al - b.al) * 0.28 + 44);
        const out = [];
        for (let i = 0; i <= n; i++) {
            const t = i / n, u = 1 - t;
            out.push({ al: u * u * a.al + 2 * u * t * mal + t * t * b.al, ac: u * u * a.ac + 2 * u * t * mac + t * t * b.ac });
        }
        return out;
    }
    function elbow(a, b, lane) {
        if (Math.abs(a.al - b.al) < 1) return [a, b];
        const mid = (a.ac + b.ac) / 2 + lane;
        return [a, { al: a.al, ac: mid }, { al: b.al, ac: mid }, b];
    }

    function routeChain(chain, mode, laneOf) {
        if (mode === 'dritto') return chain;
        if (mode === 'orto') {
            const out = [chain[0]];
            for (let i = 0; i < chain.length - 1; i++)
                elbow(chain[i], chain[i + 1], laneOf(i)).slice(1).forEach(p => out.push(p));
            return out;
        }
        if (chain.length === 2) return sampleBump(chain[0], chain[1], 12);
        const out = [chain[0]];
        for (let i = 0; i < chain.length - 1; i++)
            sampleBump(chain[i], chain[i + 1], 6).slice(1).forEach(p => out.push(p));
        return out;
    }

    /* CORSIE del corridoio fra due livelli.
       Prima erano 7 fisse a `max(6, gapLayer/14)`: con lo spazio fra livelli a
       56px le linee orizzontali finivano a SEI pixel l'una dall'altra, cioè un
       fascio illeggibile. Ora il numero di corsie si ricava dal corridoio
       disponibile e il passo è il più largo che ci sta:
           corsie = gapLayer/16, limitate a 3..9
           passo  = gapLayer / (corsie + 1)
       L'ampiezza occupata, (corsie-1)*passo, resta sempre minore di gapLayer,
       quindi nessuna corsia invade le card. Conseguenza voluta: lo slider
       «spazio fra livelli» ora governa DAVVERO la distanza fra le orizzontali. */
    function laneKey(a, b) { return Math.round(a.ac) + '|' + Math.round(b.ac); }
    // quante linee useranno DAVVERO ogni corridoio (i tratti dritti non piegano
    // e quindi non consumano corsia)
    function laneCounts(chains) {
        const c = new Map();
        chains.forEach(ch => {
            for (let i = 0; i < ch.length - 1; i++) {
                if (Math.abs(ch[i].al - ch[i + 1].al) < 1) continue;
                const k = laneKey(ch[i], ch[i + 1]);
                c.set(k, (c.get(k) || 0) + 1);
            }
        });
        return c;
    }
    function makeLaner(opt, conteggi) {
        const usate = new Map();
        const nMax = Math.max(3, Math.min(11, Math.floor(opt.gapLayer / 14)));
        return (a, b) => {
            if (Math.abs(a.al - b.al) < 1) return 0;      // dritto: nessun gomito
            const key = laneKey(a, b);
            const k = usate.get(key) || 0; usate.set(key, k + 1);
            // Corsie APERTE QUANTE SERVONO, non sempre nMax: con 2 linee in un
            // corridoio da 156px prendono ±52px invece di stare appiccicate in
            // alto (prima l'indice partiva sempre dal bordo superiore e il
            // centro del corridoio restava vuoto). Sopra nMax si ricicla.
            const m = conteggi ? (conteggi.get(key) || 1) : nMax;
            const n = Math.max(1, Math.min(nMax, m));
            const step = opt.gapLayer / (n + 1);
            return ((k % n) - (n - 1) / 2) * step;
        };
    }

    /* =======================================================================
       MOTORE DAG
       ======================================================================= */
    function layoutDAG(nodes, links, opt) {
        opt = Object.assign({}, DEFAULTS, opt || {});
        const lr = opt.orient === 'lr';
        const sizeAlong = lr ? opt.h : opt.w;
        const sizeAcross = lr ? opt.w : opt.h;

        const ids = nodes.map(n => n.id);
        const idSet = new Set(ids);
        const edges0 = edgeList(links).filter(e => idSet.has(e.s) && idSet.has(e.t));
        const comps = components(ids, edges0).sort((a, b) => b.length - a.length);

        const P = new Map(), dummies = [], chains = [];
        let offset = 0, totRev = 0, totDummy = 0, totCross = 0, maxLayers = 0, rowsUsed = 1;

        comps.forEach(comp => {
            const cs = new Set(comp);
            const ce = edges0.filter(e => cs.has(e.s) && cs.has(e.t));
            const br = breakCycles(comp, ce); totRev += br.reversed;
            const layer = assignLayers(comp, br.edges);
            const { nodes: ln, byId, segs } = addDummies(comp, br.edges, layer);
            totDummy += ln.filter(n => n.dummy).length;
            const ord = orderingBest(ln, segs, 6); totCross += ord.crossings;
            const al = assignAlong(ord.layers, segs, byId, sizeAlong, opt.gapNode);
            const k = chooseSubRows(ord.layers, al, sizeAlong, sizeAcross, opt);
            const sr = applySubRows(ord.layers, al, byId, k, sizeAlong, opt.gapNode);
            rowsUsed = Math.max(rowsUsed, sr.rows);

            // passo fra livelli = card + spazio libero + eventuali sub-righe.
            // Senza il termine sizeAcross l'orientamento -> sovrapponeva le card
            // (misurato: 19 sovrapposizioni con gapLayer 96 e card larga 168).
            const bandOf = L => L * (sizeAcross + opt.gapLayer + (sr.rows - 1) * (sizeAcross + opt.gapSub));
            let mn = Infinity, mx = -Infinity;
            al.forEach((v, id) => {
                const half = (byId.get(id).dummy ? 14 : sizeAlong) / 2;
                mn = Math.min(mn, v - half); mx = Math.max(mx, v + half);
            });
            const d = offset - mn;
            const local = new Map();
            ln.forEach(n => {
                const p = { al: al.get(n.id) + d, ac: bandOf(n.layer) + (sr.sub.get(n.id) || 0) * (sizeAcross + opt.gapSub) };
                local.set(n.id, p);
                if (n.dummy) dummies.push({ id: n.id, al: p.al, ac: p.ac, edge: n.edge });
                else P.set(n.id, { al: p.al, ac: p.ac, layer: n.layer, sub: sr.sub.get(n.id) || 0 });
            });

            // catene attraverso i fittizi, per arco
            const byEdge = new Map();
            segs.forEach(s => {
                // chiave per UID, non per coppia s/t: dopo breakCycles due archi
                // reciproci hanno la STESSA coppia e colliderebbero (review 1/8)
                const key = (s.edge._uid !== undefined) ? s.edge._uid : (s.edge.s + SEP + s.edge.t);
                if (!byEdge.has(key)) byEdge.set(key, { edge: s.edge, segs: [] });
                byEdge.get(key).segs.push(s);
            });
            byEdge.forEach(v => {
                const chain = []; let cur = v.segs.find(s => s.first); const guard = new Set();
                while (cur && !guard.has(cur.s)) {
                    guard.add(cur.s); chain.push(local.get(cur.s));
                    if (cur.last) { chain.push(local.get(cur.t)); break; }
                    cur = v.segs.find(s => s.s === cur.t);
                }
                if (chain.length >= 2 && chain.every(Boolean)) chains.push({ edge: v.edge, chain });
            });

            // porte: gli archi reali di QUESTA componente, con le posizioni
            // lungo il livello già definitive
            const alOf = new Map();
            ln.forEach(n => { if (!n.dummy) alOf.set(n.id, local.get(n.id).al); });
            const ports = assignPorts(br.edges, alOf, sizeAlong, opt);
            chains.forEach(c => { if (!c._done) { c.chain = portedEnds(c.chain, c.edge, ports); c._done = true; } });

            maxLayers = Math.max(maxLayers, ord.layers.length);
            offset += (mx - mn) + opt.packGutter;
        });

        const lane = makeLaner(opt, laneCounts(chains.map(c => c.chain)));
        const drawn = chains.map(c => ({
            edge: c.edge,
            pts: routeChain(c.chain, opt.routing, i => lane(c.chain[i], c.chain[i + 1]))
        }));

        const hasIn = new Set(edges0.map(e => e.t)), hasOut = new Set(edges0.map(e => e.s));
        return finish({
            kind: 'dag', pos: P, dummies, edges: drawn, extraEdges: [],
            stats: {
                componenti: comps.length, livelli: maxLayers, subRighe: rowsUsed,
                sorgenti: ids.filter(i => !hasIn.has(i)).length,
                pozzi: ids.filter(i => !hasOut.has(i)).length,
                archiInvertiti: totRev, nodiFittizi: totDummy,
                incrociLivelli: totCross, archiPersi: 0
            }, opt
        }, nodes);
    }

    /* =======================================================================
       MOTORE TD (albero) — foresta multi-radice
       ======================================================================= */
    function spanningForest(nodes, links) {
        const all = edgeList(links);
        const ids = nodes.map(n => n.id);
        const idSet = new Set(ids);
        const edges = all.filter(e => idSet.has(e.s) && idSet.has(e.t));
        const indeg = new Map(ids.map(i => [i, 0]));
        const succ = new Map(ids.map(i => [i, []]));
        edges.forEach(e => { indeg.set(e.t, indeg.get(e.t) + 1); succ.get(e.s).push(e); });

        const roots = ids.filter(i => indeg.get(i) === 0);
        const sorgenti = roots.length;
        const rootSet = new Set(roots);
        components(ids, edges).forEach(c => {
            if (c.some(id => rootSet.has(id))) return;
            const pick = c.slice().sort((a, b) => indeg.get(a) - indeg.get(b) || String(a).localeCompare(String(b)))[0];
            roots.push(pick); rootSet.add(pick);
        });

        const parent = new Map(), treeEdge = new Map();
        const seen = new Set(roots); const q = roots.slice(); let h = 0;
        while (h < q.length) {
            const u = q[h++];
            succ.get(u).forEach(e => {
                if (seen.has(e.t)) return;
                seen.add(e.t); parent.set(e.t, u); treeEdge.set(e.t, e); q.push(e.t);
            });
        }
        // nodi che nessuna sorgente raggiunge (dentro un ciclo o dietro a uno):
        // l'albero e' costretto a INVENTARE una radice per loro. Dopo OGNI
        // promozione la BFS riparte dal promosso: senza, anche i suoi
        // discendenti diventavano radici invece che figli (review 1/8).
        let promosse = 0;
        ids.forEach(id => {
            if (seen.has(id)) return;
            roots.push(id); seen.add(id); promosse++;
            q.push(id);
            while (h < q.length) {
                const u = q[h++];
                succ.get(u).forEach(e => {
                    if (seen.has(e.t)) return;
                    seen.add(e.t); parent.set(e.t, u); treeEdge.set(e.t, e); q.push(e.t);
                });
            }
        });
        const tree = new Set([...treeEdge.values()]);
        return { roots, sorgenti, promosse, parent, treeEdge, extra: edges.filter(e => !tree.has(e)) };
    }

    function layoutTD(nodes, links, d3, opt) {
        opt = Object.assign({}, DEFAULTS, opt || {});
        const lr = opt.orient === 'lr';
        const sizeAlong = lr ? opt.h : opt.w;
        const sizeAcross = lr ? opt.w : opt.h;

        const sf = spanningForest(nodes, links);
        const children = new Map(nodes.map(n => [n.id, []]));
        sf.treeEdge.forEach(e => { if (children.has(e.s)) children.get(e.s).push(e.t); });

        const al = new Map(), depth = new Map();
        let offset = 0, maxDepth = 0;
        sf.roots.forEach(r => {
            const hi = d3.hierarchy(r, id => children.get(id) || []);
            d3.tree().nodeSize([sizeAlong + opt.gapNode, 1])
                .separation((a, b) => a.parent === b.parent ? 1 : 1.25)(hi);
            let mn = Infinity, mx = -Infinity;
            hi.each(d => { mn = Math.min(mn, d.x); mx = Math.max(mx, d.x); maxDepth = Math.max(maxDepth, d.depth); });
            const d = offset - (mn - sizeAlong / 2);
            hi.each(n => { al.set(n.data, n.x + d); depth.set(n.data, n.depth); });
            offset += (mx - mn) + sizeAlong + opt.packGutter;
        });

        // livelli = profondita', ordinati lungo l'asse -> le sub-righe usano
        // esattamente la stessa macchina del DAG
        const byId = new Map(nodes.map(n => [n.id, { id: n.id, dummy: false }]));
        const layers = [];
        for (let L = 0; L <= maxDepth; L++)
            layers.push(nodes.map(n => n.id).filter(id => depth.get(id) === L).sort((a, b) => al.get(a) - al.get(b)));
        const k = chooseSubRows(layers, al, sizeAlong, sizeAcross, opt);
        const sr = applySubRows(layers, al, byId, k, sizeAlong, opt.gapNode);

        const bandOf = L => L * (sizeAcross + opt.gapLayer + (sr.rows - 1) * (sizeAcross + opt.gapSub));
        const P = new Map();
        nodes.forEach(n => {
            if (!al.has(n.id)) return;
            P.set(n.id, {
                al: al.get(n.id),
                ac: bandOf(depth.get(n.id)) + (sr.sub.get(n.id) || 0) * (sizeAcross + opt.gapSub),
                layer: depth.get(n.id), sub: sr.sub.get(n.id) || 0
            });
        });

        // porte distinte sul bordo, come nel DAG: gli archi d'albero e quelli
        // liberi condividono lo stesso conteggio, altrimenti due archi diversi
        // finirebbero sullo stesso punto di attacco
        const alOf = new Map();
        P.forEach((p, id) => alOf.set(id, p.al));
        const tutti = [].concat([...sf.treeEdge.values()], sf.extra);
        const ports = assignPorts(tutti, alOf, sizeAlong, opt);

        // le catene si costruiscono PRIMA di disegnare: le corsie si assegnano
        // sapendo quante linee passano davvero per ogni corridoio
        const catene = [];
        sf.treeEdge.forEach(e => {
            const a = P.get(e.s), b = P.get(e.t);
            if (!a || !b) return;
            catene.push({ e, ch: portedEnds([a, b], e, ports) });
        });
        const lane = makeLaner(opt, laneCounts(catene.map(c => c.ch)));

        const extraEdges = [];
        const treeEdges = catene.map(c => ({
            edge: c.e, pts: routeChain(c.ch, opt.routing, () => lane(c.ch[0], c.ch[1]))
        }));
        sf.extra.forEach(e => {
            const a = P.get(e.s), b = P.get(e.t);
            if (!a || !b) return;
            const ch = portedEnds([a, b], e, ports);
            extraEdges.push({ edge: e, pts: sampleArc(ch[0], ch[1], 18) });
        });

        return finish({
            kind: 'td', pos: P, dummies: [], edges: treeEdges, extraEdges,
            stats: {
                radici: sf.roots.length, sorgenti: sf.sorgenti, radiciInventate: sf.promosse,
                livelli: maxDepth + 1, subRighe: sr.rows,
                archiAlbero: treeEdges.length, archiFuoriAlbero: extraEdges.length,
                archiPersi: extraEdges.length
            }, opt
        }, nodes);
    }

    /* -----------------------------------------------------------------------
       TRASFORMAZIONE FINALE (al,ac) -> (x,y) + bande delle macro-aree
       ----------------------------------------------------------------------- */
    function finish(res, nodes) {
        const lr = res.opt.orient === 'lr';
        const to = p => lr ? { x: p.ac, y: p.al } : { x: p.al, y: p.ac };
        const P = new Map();
        res.pos.forEach((p, id) => P.set(id, Object.assign({}, p, to(p))));
        res.pos = P;
        res.dummies = res.dummies.map(d => Object.assign({}, d, to(d)));
        const conv = e => ({ edge: e.edge, pts: e.pts.map(to) });
        res.edges = res.edges.map(conv);
        res.extraEdges = res.extraEdges.map(conv);

        const gOf = new Map(nodes.map(n => [n.id, n.group == null ? -1 : n.group]));
        const acc = new Map();
        P.forEach((p, id) => {
            const g = gOf.get(id); if (g === undefined || g < 0) return;
            const b = acc.get(g) || { g, x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity, n: 0 };
            b.x0 = Math.min(b.x0, p.x - res.opt.w / 2); b.x1 = Math.max(b.x1, p.x + res.opt.w / 2);
            b.y0 = Math.min(b.y0, p.y - res.opt.h / 2); b.y1 = Math.max(b.y1, p.y + res.opt.h / 2);
            b.n++; acc.set(g, b);
        });
        res.bands = [...acc.values()].filter(b => b.n > 1);
        return clipEnds(res);
    }


    /* -----------------------------------------------------------------------
       AGGANCIO AL BORDO DELLA CARD
       Le polilinee nascono e muoiono nel CENTRO dei nodi: la linea taglia in
       mezzo la propria etichetta (evidente con l'instradamento ortogonale).
       Qui i due capi vengono accorciati fino al bordo del rettangolo, con un
       piccolo distacco. Si opera sulla geometria finale, quindi vale anche per
       la misura: disegno e numeri restano la stessa cosa.
       ----------------------------------------------------------------------- */
    function clipEnds(res) {
        const w = res.opt.w / 2 + 3, h = res.opt.h / 2 + 3;
        const inside = (p, c) => Math.abs(p.x - c.x) <= w && Math.abs(p.y - c.y) <= h;
        const border = (pIn, pOut, c) => {
            // punto sul bordo fra un punto dentro e uno fuori (bisezione: regge
            // qualunque forma di curva senza casistiche)
            let a = pIn, b = pOut;
            for (let i = 0; i < 18; i++) {
                const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
                if (inside(m, c)) a = m; else b = m;
            }
            return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        };
        const trim = (pts, c, fromStart) => {
            if (!c) return pts;
            const arr = fromStart ? pts : pts.slice().reverse();
            let i = 0;
            while (i < arr.length - 1 && inside(arr[i], c)) i++;
            if (i === 0) return pts;                       // gia' fuori: niente da fare
            const cut = border(arr[i - 1], arr[i], c);
            const out = [cut].concat(arr.slice(i));
            return fromStart ? out : out.reverse();
        };
        const fix = e => {
            let pts = e.pts;
            pts = trim(pts, res.pos.get(e.edge.s), true);
            pts = trim(pts, res.pos.get(e.edge.t), false);
            return { edge: e.edge, pts: pts.length >= 2 ? pts : e.pts };
        };
        res.edges = res.edges.map(fix);
        res.extraEdges = res.extraEdges.map(fix);
        return res;
    }

    /* -----------------------------------------------------------------------
       PONTICELLI AGLI INCROCI (come sugli schemi elettrici)
       Due archi che si tagliano non dicono chi prosegue dritto e chi devia.
       Qui uno dei due SCAVALCA l'altro con un semicerchio, e l'arco che salta
       viene disegnato con una fodera bianca sotto: il ponticello legge come
       «passa sopra», l'altro resta una linea continua.
       Stadio SEPARATO, chiamato DOPO la misura: i numeri strutturali (incroci,
       archi su card) restano quelli della geometria vera e restano confrontabili
       fra un instradamento e l'altro. Un ponticello non toglie un incrocio: lo
       rende leggibile, e questo va detto invece che nascosto in una metrica.
       ----------------------------------------------------------------------- */
    function addHops(res, opt) {
        const r = (opt && opt.r) || 7;
        const minGapFromEnd = r * 1.6;
        const polys = res.edges.concat(res.extraEdges || []);
        res.hops = [];

        // indice a griglia: senza, il confronto è O(segmenti²) e su una mappa
        // da 250 nodi diventa milioni di coppie
        const CELL = 96;
        const grid = new Map();
        const segs = [];
        polys.forEach((pl, pi) => {
            for (let k = 0; k < pl.pts.length - 1; k++) {
                const a = pl.pts[k], b = pl.pts[k + 1];
                const s = { pi, k, a, b, len: Math.hypot(b.x - a.x, b.y - a.y) };
                if (s.len < 1) continue;
                const i = segs.push(s) - 1;
                const x0 = Math.floor(Math.min(a.x, b.x) / CELL), x1 = Math.floor(Math.max(a.x, b.x) / CELL);
                const y0 = Math.floor(Math.min(a.y, b.y) / CELL), y1 = Math.floor(Math.max(a.y, b.y) / CELL);
                for (let gx = x0; gx <= x1; gx++)
                    for (let gy = y0; gy <= y1; gy++) {
                        const key = gx + ':' + gy;
                        if (!grid.has(key)) grid.set(key, []);
                        grid.get(key).push(i);
                    }
            }
        });

        // punto di incrocio fra due segmenti, come parametri t e u
        function cross(A, B) {
            const rx = A.b.x - A.a.x, ry = A.b.y - A.a.y;
            const sx = B.b.x - B.a.x, sy = B.b.y - B.a.y;
            const den = rx * sy - ry * sx;
            if (Math.abs(den) < 1e-9) return null;              // paralleli
            const t = ((B.a.x - A.a.x) * sy - (B.a.y - A.a.y) * sx) / den;
            const u = ((B.a.x - A.a.x) * ry - (B.a.y - A.a.y) * rx) / den;
            if (t <= 0 || t >= 1 || u <= 0 || u >= 1) return null;
            return { t, u, x: A.a.x + t * rx, y: A.a.y + t * ry };
        }
        const horiz = s => Math.abs(s.b.x - s.a.x) >= Math.abs(s.b.y - s.a.y);

        // per ogni segmento, i punti in cui deve saltare
        const hopsOn = new Map();          // "pi:k" -> [t, …]
        const seen = new Set();
        grid.forEach(list => {
            for (let i = 0; i < list.length; i++)
                for (let j = i + 1; j < list.length; j++) {
                    const A = segs[list[i]], B = segs[list[j]];
                    if (A.pi === B.pi) continue;
                    const pk = list[i] + '|' + list[j];
                    if (seen.has(pk)) continue;                  // la griglia ripete le coppie
                    seen.add(pk);
                    const ea = polys[A.pi].edge, eb = polys[B.pi].edge;
                    // archi che condividono un capo si toccano per forza: non è un incrocio
                    if (ea.s === eb.s || ea.t === eb.t || ea.s === eb.t || ea.t === eb.s) continue;
                    const c = cross(A, B);
                    if (!c) continue;
                    // salta il più ORIZZONTALE sopra il più verticale (convenzione
                    // degli schemi); a parità, decide l'ordine di disegno
                    let H, t;
                    if (horiz(A) !== horiz(B)) { H = horiz(A) ? A : B; t = horiz(A) ? c.t : c.u; }
                    else { H = A.pi > B.pi ? A : B; t = A.pi > B.pi ? c.t : c.u; }
                    const d = t * H.len;
                    if (d < minGapFromEnd || (H.len - d) < minGapFromEnd) continue;  // troppo vicino a un capo
                    const key = H.pi + ':' + H.k;
                    if (!hopsOn.has(key)) hopsOn.set(key, []);
                    hopsOn.get(key).push(t);
                }
        });

        // ricostruzione delle polilinee con gli archetti inseriti
        let count = 0;
        polys.forEach((pl, pi) => {
            if (!pl.pts || pl.pts.length < 2) return;
            const out = [pl.pts[0]];
            for (let k = 0; k < pl.pts.length - 1; k++) {
                const a = pl.pts[k], b = pl.pts[k + 1];
                let ts = hopsOn.get(pi + ':' + k);
                if (ts && ts.length) {
                    const len = Math.hypot(b.x - a.x, b.y - a.y);
                    const ux = (b.x - a.x) / len, uy = (b.y - a.y) / len;
                    // perpendicolare: da che parte gonfia l'archetto
                    // Verso del gonfiore SEMPRE lo stesso a schermo: verso l'alto
                    // per i tratti orizzontali, verso sinistra per i verticali.
                    // La perpendicolare grezza dipende dal verso di percorrenza
                    // dell'arco, quindi due ponti sullo stesso incrocio uscivano
                    // uno a cupola e uno a conca — si vedeva nei disegni.
                    let nx = -uy, ny = ux;
                    if (Math.abs(ny) > 1e-6 ? ny > 0 : nx > 0) { nx = -nx; ny = -ny; }
                    ts = ts.slice().sort((p, q) => p - q);
                    let lastD = -Infinity;
                    ts.forEach(t => {
                        const d = t * len;
                        if (d - lastD < r * 2.4) return;         // due incroci troppo vicini: un solo ponte
                        lastD = d;
                        const cx = a.x + ux * d, cy = a.y + uy * d;
                        // P(a) = c - u·r·cos(a) + n·r·sin(a):
                        //   a=0 -> dietro l'incrocio · a=pi/2 -> colmo · a=pi -> davanti
                        // così l'archetto percorre la polilinea nel verso giusto
                        const arc = [];
                        const N = 14;
                        for (let i = 0; i <= N; i++) {
                            const ang = Math.PI * i / N;
                            arc.push({
                                x: cx - ux * r * Math.cos(ang) + nx * r * Math.sin(ang),
                                y: cy - uy * r * Math.cos(ang) + ny * r * Math.sin(ang)
                            });
                        }
                        arc.forEach(p => out.push(p));
                        res.hops.push({ edge: pl.edge, pts: arc });
                        count++;
                    });
                }
                out.push(b);
            }
            pl.pts = out;
        });

        res.ponticelli = count;
        return res;
    }

    /* =======================================================================
       2-bis) DOVE SCRIVERE LE LINKING WORDS
       La parola-legame sta SUL tratto (l'alone bianco taglia la linea: è la
       resa che Giacomo ha scelto). Il punto però non può più essere il centro
       del segmento più lungo: lì finiva spesso su un incrocio o su un fascio
       di verticali, e la parola diventava illeggibile.
       Qui si generano posizioni candidate LUNGO la polilinea (scorrendo i
       segmenti lunghi) e si sceglie quella che tocca meno linee altrui, meno
       etichette già poste e nessuna card. Greedy, in ordine deterministico
       (etichetta più lunga per prima: è la più difficile da piazzare).
       Puro: niente DOM, testato in Node.
       ======================================================================= */
    const LBL = {
        adv: 0.6,        // Space Mono: avanzamento 0.6 em
        pad: 3,          // mezzo respiro attorno al testo (l'alone è 3px)
        dy: 4,           // il testo è scritto dy sopra il punto di ancoraggio
        maxSeg: 5,       // quanti segmenti (i più lunghi) si esplorano
        maxPos: 13,      // quante posizioni per segmento
        margine: 6,      // quanto stare lontani dagli estremi del segmento
        passate: 3,      // giri di riassestamento dopo la prima assegnazione
        pesoCard: 12, pesoLinea: 3, pesoEtichetta: 5, pesoCorto: 1.5, pesoCentro: 0.6
    };

    function labelSize(text, fs) {
        return { w: String(text).length * fs * LBL.adv + LBL.pad * 2, h: fs * 1.15 + LBL.pad };
    }
    // riquadro dell'inchiostro attorno al punto di ancoraggio p
    function labelRect(p, size) {
        const cy = p.y - LBL.dy - size.h * 0.35;
        return { x0: p.x - size.w / 2, x1: p.x + size.w / 2, y0: cy - size.h / 2, y1: cy + size.h / 2 };
    }
    function rectHit(A, B) {
        return !(A.x1 < B.x0 || B.x1 < A.x0 || A.y1 < B.y0 || B.y1 < A.y0);
    }
    // segmento × rettangolo (Liang–Barsky, con rifiuto rapido)
    function segRectHit(a, b, R) {
        if (Math.max(a.x, b.x) < R.x0 || Math.min(a.x, b.x) > R.x1 ||
            Math.max(a.y, b.y) < R.y0 || Math.min(a.y, b.y) > R.y1) return false;
        if ((a.x >= R.x0 && a.x <= R.x1 && a.y >= R.y0 && a.y <= R.y1) ||
            (b.x >= R.x0 && b.x <= R.x1 && b.y >= R.y0 && b.y <= R.y1)) return true;
        let t0 = 0, t1 = 1;
        const dx = b.x - a.x, dy = b.y - a.y;
        const p = [-dx, dx, -dy, dy];
        const q = [a.x - R.x0, R.x1 - a.x, a.y - R.y0, R.y1 - a.y];
        for (let i = 0; i < 4; i++) {
            if (p[i] === 0) { if (q[i] < 0) return false; }
            else {
                const r = q[i] / p[i];
                if (p[i] < 0) { if (r > t1) return false; if (r > t0) t0 = r; }
                else { if (r < t0) return false; if (r < t1) t1 = r; }
            }
        }
        return true;
    }

    /* list: [{pts, edge}] nell'ordine di disegno (edges + extraEdges)
       opt: { fs, textOf(edge)→stringa già troncata ('' = niente etichetta) }
       → { pos: Map(indice → {x, y}), conflitti, testati } */
    function placeEdgeLabels(list, res, opt) {
        opt = opt || {};
        const fs = opt.fs || 10;
        const textOf = opt.textOf || (e => (e && e.rel) || '');
        const out = { pos: new Map(), conflitti: 0 };
        if (!list || !list.length) return out;

        // ostacoli: tutti i segmenti disegnati, in una griglia (senza, il
        // confronto è O(etichette × segmenti) e su mappe grosse si sente)
        const CELL = 128;
        const grid = new Map(), segs = [];
        const push = (gx, gy, i) => {
            const k = gx + ':' + gy;
            if (!grid.has(k)) grid.set(k, []);
            grid.get(k).push(i);
        };
        list.forEach((pl, pi) => {
            for (let k = 0; k < pl.pts.length - 1; k++) {
                const a = pl.pts[k], b = pl.pts[k + 1];
                if (Math.hypot(b.x - a.x, b.y - a.y) < 0.5) continue;
                const i = segs.push({ a, b, pi }) - 1;
                const x0 = Math.floor(Math.min(a.x, b.x) / CELL), x1 = Math.floor(Math.max(a.x, b.x) / CELL);
                const y0 = Math.floor(Math.min(a.y, b.y) / CELL), y1 = Math.floor(Math.max(a.y, b.y) / CELL);
                for (let gx = x0; gx <= x1; gx++) for (let gy = y0; gy <= y1; gy++) push(gx, gy, i);
            }
        });
        const vicini = R => {
            const set = new Set();
            for (let gx = Math.floor(R.x0 / CELL); gx <= Math.floor(R.x1 / CELL); gx++)
                for (let gy = Math.floor(R.y0 / CELL); gy <= Math.floor(R.y1 / CELL); gy++)
                    (grid.get(gx + ':' + gy) || []).forEach(i => set.add(i));
            return set;
        };

        // card: una parola-legame non ci deve MAI finire sopra
        const cards = [];
        if (res && res.pos && res.opt) {
            const hw = res.opt.w / 2, hh = res.opt.h / 2;
            res.pos.forEach(p => cards.push({ x0: p.x - hw, x1: p.x + hw, y0: p.y - hh, y1: p.y + hh }));
        }

        // le più lunghe per prime: hanno meno posti dove stare
        const ordine = list.map((pl, i) => i)
            .filter(i => String(textOf(list[i].edge)).length > 0)
            .sort((a, b) => {
                const d = String(textOf(list[b].edge)).length - String(textOf(list[a].edge)).length;
                return d !== 0 ? d : a - b;      // deterministico a parità di lunghezza
            });

        // il posto migliore per l'etichetta idx, viste le altre già piazzate
        const poste = new Map();          // idx → riquadro
        function cercaPosto(idx) {
            const pl = list[idx];
            const size = labelSize(textOf(pl.edge), fs);
            const cand = [];
            for (let k = 0; k < pl.pts.length - 1; k++) {
                const a = pl.pts[k], b = pl.pts[k + 1];
                const len = Math.hypot(b.x - a.x, b.y - a.y);
                if (len > 1) cand.push({ a, b, len });
            }
            if (!cand.length) return null;
            cand.sort((x, y) => y.len - x.len);
            const maxLen = cand[0].len;
            let best = null;
            cand.slice(0, LBL.maxSeg).forEach(s => {
                const ux = (s.b.x - s.a.x) / s.len, uy = (s.b.y - s.a.y) / s.len;
                const mezza = size.w / 2 + LBL.margine;
                const da = Math.min(mezza, s.len / 2);
                const a_ = Math.max(0, Math.min(da, s.len - da));
                const b_ = Math.max(a_, s.len - da);
                const n = (b_ - a_) < 1 ? 1 : LBL.maxPos;
                for (let i = 0; i < n; i++) {
                    const d = n === 1 ? s.len / 2 : a_ + (b_ - a_) * (i / (n - 1));
                    const p = { x: s.a.x + ux * d, y: s.a.y + uy * d };
                    const R = labelRect(p, size);
                    let linee = 0;
                    vicini(R).forEach(si => {
                        const sg = segs[si];
                        if (sg.pi === idx) return;             // la propria linea non conta
                        if (segRectHit(sg.a, sg.b, R)) linee++;
                    });
                    let card = 0;
                    cards.forEach(c => { if (rectHit(R, c)) card++; });
                    let etich = 0;
                    poste.forEach((q, j) => { if (j !== idx && rectHit(R, q)) etich++; });
                    const corto = size.w > s.len ? 1 : 0;
                    const t = s.len ? d / s.len : 0.5;
                    const costo = LBL.pesoCard * card + LBL.pesoLinea * linee + LBL.pesoEtichetta * etich +
                        LBL.pesoCorto * corto + LBL.pesoCentro * Math.abs(t - 0.5) +
                        0.7 * (1 - s.len / maxLen);
                    if (!best || costo < best.costo - 1e-9) best = { costo, p, R, linee, card, etich };
                }
            });
            return best;
        }
        const scelte = new Map();
        ordine.forEach(idx => {
            const best = cercaPosto(idx);
            if (!best) return;
            scelte.set(idx, best);
            poste.set(idx, best.R);
        });

        // Riassestamento: le prime etichette hanno scelto quando il campo era
        // vuoto, le ultime hanno trovato tutto occupato. Si ripassano quelle
        // ancora in conflitto — ora vedono il quadro completo. Poche passate:
        // converge subito e resta deterministico.
        for (let giro = 0; giro < LBL.passate; giro++) {
            const guasti = ordine.filter(i => {
                const s = scelte.get(i);
                return s && (s.linee > 0 || s.card > 0 || s.etich > 0);
            }).sort((a, b) => (scelte.get(b).costo - scelte.get(a).costo) || (a - b));
            if (!guasti.length) break;
            let migliorato = 0;
            guasti.forEach(idx => {
                const prima = scelte.get(idx);
                const dopo = cercaPosto(idx);      // poste esclude già il proprio riquadro
                if (dopo && dopo.costo < prima.costo - 1e-9) {
                    scelte.set(idx, dopo); poste.set(idx, dopo.R); migliorato++;
                }
            });
            if (!migliorato) break;
        }

        ordine.forEach(idx => {
            const s = scelte.get(idx);
            if (!s) return;
            out.pos.set(idx, { x: s.p.x, y: s.p.y });
            if (s.linee > 0 || s.card > 0 || s.etich > 0) out.conflitti++;
        });
        out.testati = ordine.length;
        return out;
    }

    /* =======================================================================
       3) MISURA — sulla geometria effettivamente disegnata
       ======================================================================= */
    function segInt(p1, p2, p3, p4) {
        const d = (a, b, c) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
        const d1 = d(p3, p4, p1), d2 = d(p3, p4, p2), d3 = d(p1, p2, p3), d4 = d(p1, p2, p4);
        return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
    }

    function measure(res, includeExtra) {
        // la matrice non e' un node-link: zero incroci per costruzione
        if (res.kind === 'matrice') {
            const cell = 26, side = res.order.length * cell;
            return { larghezza: side, altezza: side, rapporto: 1, areaMpx: +((side * side) / 1e6).toFixed(2),
                     incroci: 0, cardSovrapposte: 0, archiSuCard: 0, areeAccavallate: 0,
                     arcoMedio: 0, inchiostro: 0, bbox: { minX: 0, maxX: side, minY: 0, maxY: side } };
        }
        if (!res.pos || res.pos.size === 0) {
            return { larghezza: 0, altezza: 0, rapporto: 0, areaMpx: 0, incroci: 0,
                     cardSovrapposte: 0, archiSuCard: 0, areeAccavallate: 0,
                     arcoMedio: 0, inchiostro: 0, bbox: { minX: 0, maxX: 10, minY: 0, maxY: 10 } };
        }
        const opt = res.opt;
        const polys = res.edges.concat(includeExtra && res.extraEdges ? res.extraEdges : []);
        const segs = [];
        polys.forEach((p, i) => { for (let k = 0; k < p.pts.length - 1; k++) segs.push({ a: p.pts[k], b: p.pts[k + 1], e: p.edge, i }); });

        let cross = 0;
        for (let i = 0; i < segs.length; i++)
            for (let j = i + 1; j < segs.length; j++) {
                const A = segs[i], B = segs[j];
                if (A.i === B.i) continue;
                if (A.e.s === B.e.s || A.e.t === B.e.t || A.e.s === B.e.t || A.e.t === B.e.s) continue;
                if (segInt(A.a, A.b, B.a, B.b)) cross++;
            }

        const rects = [];
        res.pos.forEach((p, id) => rects.push({ id, x0: p.x - opt.w / 2, x1: p.x + opt.w / 2, y0: p.y - opt.h / 2, y1: p.y + opt.h / 2 }));
        let overlap = 0;
        for (let i = 0; i < rects.length; i++)
            for (let j = i + 1; j < rects.length; j++) {
                const a = rects[i], b = rects[j];
                if (a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1) overlap++;
            }

        const inR = (p, r) => p.x > r.x0 && p.x < r.x1 && p.y > r.y0 && p.y < r.y1;
        const hitR = (a, b, r) => {
            if (inR(a, r) || inR(b, r)) return true;
            const c = [{ x: r.x0, y: r.y0 }, { x: r.x1, y: r.y0 }, { x: r.x1, y: r.y1 }, { x: r.x0, y: r.y1 }];
            for (let i = 0; i < 4; i++) if (segInt(a, b, c[i], c[(i + 1) % 4])) return true;
            return false;
        };
        const hits = new Set();
        polys.forEach((pl, pi) => rects.forEach(r => {
            if (r.id === pl.edge.s || r.id === pl.edge.t) return;
            for (let k = 0; k < pl.pts.length - 1; k++)
                if (hitR(pl.pts[k], pl.pts[k + 1], r)) { hits.add(pi + '|' + r.id); return; }
        }));

        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, len = 0;
        rects.forEach(r => {
            minX = Math.min(minX, r.x0); maxX = Math.max(maxX, r.x1);
            minY = Math.min(minY, r.y0); maxY = Math.max(maxY, r.y1);
        });
        polys.forEach(p => { for (let k = 0; k < p.pts.length - 1; k++) len += Math.hypot(p.pts[k + 1].x - p.pts[k].x, p.pts[k + 1].y - p.pts[k].y); });

        let bandeAccavallate = 0;
        const B = res.bands || [];
        for (let i = 0; i < B.length; i++)
            for (let j = i + 1; j < B.length; j++)
                if (B[i].x0 < B[j].x1 && B[j].x0 < B[i].x1 && B[i].y0 < B[j].y1 && B[j].y0 < B[i].y1) bandeAccavallate++;

        const w = maxX - minX, h = maxY - minY;
        return {
            larghezza: Math.round(w), altezza: Math.round(h),
            rapporto: +(w / Math.max(1, h)).toFixed(2),
            areaMpx: +((w * h) / 1e6).toFixed(2),
            incroci: cross, cardSovrapposte: overlap, archiSuCard: hits.size,
            areeAccavallate: bandeAccavallate,
            arcoMedio: Math.round(len / Math.max(1, polys.length)),
            inchiostro: Math.round(len),
            bbox: { minX, maxX, minY, maxY }
        };
    }


    /* =======================================================================
       MOTORI AGGIUNTIVI (1/8) — cinque letture diverse dello stesso grafo.
       Tutti ritornano la stessa forma dei motori storici ({pos, edges,
       extraEdges, stats, opt}) così misura, ponticelli e renderer non
       distinguono; l'unica eccezione è la matrice, che non è un node-link.
       ======================================================================= */

    // interpolazione lineare campionata: polilinea su cui clipEnds/addHops
    // lavorano come su qualunque altra
    function sampleLine(a, b, n) {
        const out = [];
        for (let i = 0; i <= n; i++) out.push({ al: a.al + (b.al - a.al) * i / n, ac: a.ac + (b.ac - a.ac) * i / n });
        return out;
    }

    function undirAdj(ids, edges) {
        const adj = new Map(ids.map(i => [i, []]));
        edges.forEach(e => { adj.get(e.s).push(e.t); adj.get(e.t).push(e.s); });
        return adj;
    }

    /* ── ANELLI CONCENTRICI ─────────────────────────────────────────────────
       Centro = nodo scelto (o ROOT, o il più connesso). Ogni anello = distanza
       dal centro. Risponde a «cosa sta a un passo, a due passi da qui». */
    function layoutAnelli(nodes, links, opt) {
        opt = Object.assign({}, DEFAULTS, opt || {}, { orient: 'td' });
        const ids = nodes.map(n => n.id);
        if (!ids.length) return finish({ kind: 'anelli', pos: new Map(), dummies: [], edges: [],
            extraEdges: [], stats: { anelli: 0, centro: null, archiPersi: 0 }, opt }, nodes);
        const idSet = new Set(ids);
        const edges = edgeList(links).filter(e => idSet.has(e.s) && idSet.has(e.t));
        const deg = new Map(ids.map(i => [i, 0]));
        edges.forEach(e => { deg.set(e.s, deg.get(e.s) + 1); deg.set(e.t, deg.get(e.t) + 1); });
        const center = (opt.centerId && idSet.has(opt.centerId)) ? opt.centerId
            : (idSet.has('ROOT') ? 'ROOT'
                : ids.slice().sort((a, b) => deg.get(b) - deg.get(a))[0]);

        const adj = undirAdj(ids, edges);
        const dist = new Map([[center, 0]]);
        const q = [center]; let h = 0;
        while (h < q.length) {
            const u = q[h++];
            adj.get(u).forEach(v => { if (!dist.has(v)) { dist.set(v, dist.get(u) + 1); q.push(v); } });
        }
        let maxD = 0; dist.forEach(v => maxD = Math.max(maxD, v));
        ids.forEach(i => { if (!dist.has(i)) dist.set(i, maxD + 1); });   // scollegati: anello esterno
        maxD = Math.max(...[...dist.values()]);

        const rings = [];
        for (let d = 0; d <= maxD; d++) rings.push(ids.filter(i => dist.get(i) === d));

        // angolo = baricentro degli angoli dei vicini nell'anello interno
        // (i figli restano sotto il genitore); primo anello ordinato per gruppo
        const gOf = new Map(nodes.map(n => [n.id, n.group == null ? 0 : n.group]));
        const angle = new Map([[center, 0]]);
        const P = new Map([[center, { al: 0, ac: 0, layer: 0, sub: 0 }]]);
        const base = opt.w + opt.gapLayer;
        for (let d = 1; d <= maxD; d++) {
            const ring = rings[d];
            if (!ring.length) continue;
            const want = ring.map(id => {
                const prev = adj.get(id).filter(v => dist.get(v) === d - 1 && angle.has(v));
                const a = prev.length ? prev.reduce((s, v) => s + angle.get(v), 0) / prev.length : null;
                return { id, a, g: gOf.get(id) };
            }).sort((x, y) => (x.a === null) - (y.a === null) || (x.a || 0) - (y.a || 0) || x.g - y.g);
            // raggio: il maggiore fra il passo lineare e quello che fa stare
            // le card sull'anello senza toccarsi
            const r = Math.max(base * d, ring.length * (opt.w + opt.gapNode) / (2 * Math.PI));
            want.forEach((o, i) => {
                const a = 2 * Math.PI * i / ring.length + (d % 2) * (Math.PI / ring.length);
                angle.set(o.id, a);
                P.set(o.id, { al: r * Math.cos(a), ac: r * Math.sin(a), layer: d, sub: 0 });
            });
        }

        const drawn = edges.map(e => ({ edge: e, pts: sampleLine(P.get(e.s), P.get(e.t), 12) }));
        return finish({
            kind: 'anelli', pos: P, dummies: [], edges: drawn, extraEdges: [],
            stats: { anelli: maxD + 1, centro: center, archiPersi: 0 }, opt
        }, nodes);
    }

    /* ── COLONNE PER RAMO (icicle adattato alle card) ───────────────────────
       Ogni ramo L1 è una colonna; dentro, i nodi per profondità. Il
       contenimento lo dicono le bande, non gli archi. */
    function layoutColonne(nodes, links, opt) {
        opt = Object.assign({}, DEFAULTS, opt || {}, { orient: 'td' });
        const sf = spanningForest(nodes, links);
        const children = new Map(nodes.map(n => [n.id, []]));
        sf.treeEdge.forEach(e => { if (children.has(e.s)) children.get(e.s).push(e.t); });
        const idSet = new Set(nodes.map(n => n.id));

        // colonne = figli delle radici (i rami L1); una radice sola resta sopra
        const cols = [];
        const soloRoot = sf.roots.length === 1;
        sf.roots.forEach(r => {
            const kids = children.get(r) || [];
            if (soloRoot && kids.length) kids.forEach(k => cols.push({ top: k }));
            else cols.push({ top: r });
        });

        const P = new Map();
        let colX = 0;
        cols.forEach(col => {
            // DFS del ramo, nodi raggruppati per profondità
            const byDepth = [];
            (function walk(id, d) {
                (byDepth[d] = byDepth[d] || []).push(id);
                (children.get(id) || []).forEach(c => walk(c, d + 1));
            })(col.top, 0);
            const wMax = Math.max(...byDepth.map(l => l.length));
            const colW = wMax * (opt.w + opt.gapNode) - opt.gapNode;
            byDepth.forEach((level, d) => {
                const lw = level.length * (opt.w + opt.gapNode) - opt.gapNode;
                level.forEach((id, i) => P.set(id, {
                    al: colX + (colW - lw) / 2 + i * (opt.w + opt.gapNode) + opt.w / 2,
                    ac: (d + (soloRoot ? 1 : 0)) * (opt.h + opt.gapLayer),
                    layer: d + (soloRoot ? 1 : 0), sub: 0
                }));
            });
            col.x0 = colX; col.x1 = colX + colW;
            colX += colW + opt.packGutter;
        });
        if (soloRoot) {
            const r = sf.roots[0];
            P.set(r, { al: (colX - opt.packGutter) / 2, ac: 0, layer: 0, sub: 0 });
        }
        // nodi promossi fuori foresta (non dovrebbe: spanningForest copre tutto)
        nodes.forEach(n => { if (!P.has(n.id)) P.set(n.id, { al: colX, ac: 0, layer: 0, sub: 0 }); });

        const tree = [], extra = [];
        sf.treeEdge.forEach(e => {
            const a = P.get(e.s), b = P.get(e.t);
            if (a && b) tree.push({ edge: e, pts: sampleBump(a, b, 10) });
        });
        sf.extra.forEach(e => {
            const a = P.get(e.s), b = P.get(e.t);
            if (a && b) extra.push({ edge: e, pts: sampleArc(a, b, 18) });
        });
        return finish({
            kind: 'colonne', pos: P, dummies: [], edges: tree, extraEdges: extra,
            stats: { colonne: cols.length, archiFuoriAlbero: extra.length, archiPersi: 0 }, opt
        }, nodes);
    }

    /* ── PERCORSO DI LETTURA ────────────────────────────────────────────────
       Ordine topologico (i prerequisiti prima), disposto a serpentina con il
       numero del passo. La mappa che diventa scaletta di studio. */
    function layoutPercorso(nodes, links, opt) {
        opt = Object.assign({}, DEFAULTS, opt || {}, { orient: 'td' });
        const ids = nodes.map(n => n.id);
        const idSet = new Set(ids);
        const edges0 = edgeList(links).filter(e => idSet.has(e.s) && idSet.has(e.t));
        const gOf = new Map(nodes.map(n => [n.id, n.group == null ? 0 : n.group]));

        // Kahn sui cicli rotti; a parità si resta nel gruppo corrente,
        // così i rami escono contigui nella scaletta
        const br = breakCycles(ids, edges0);
        const indeg = new Map(ids.map(i => [i, 0]));
        const succ = new Map(ids.map(i => [i, []]));
        br.edges.forEach(e => { indeg.set(e.t, indeg.get(e.t) + 1); succ.get(e.s).push(e.t); });
        let ready = ids.filter(i => indeg.get(i) === 0);
        const order = [];
        let curG = null;
        while (ready.length) {
            ready.sort((a, b) => (gOf.get(a) === curG ? -1 : 0) - (gOf.get(b) === curG ? -1 : 0)
                || gOf.get(a) - gOf.get(b) || String(a).localeCompare(String(b)));
            const u = ready.shift();
            order.push(u); curG = gOf.get(u);
            succ.get(u).forEach(v => { indeg.set(v, indeg.get(v) - 1); if (indeg.get(v) === 0) ready.push(v); });
        }
        ids.forEach(i => { if (!order.includes(i)) order.push(i); });   // rete di sicurezza

        const n = order.length;
        const perRow = Math.max(2, Math.ceil(Math.sqrt(n * 1.8 * (opt.h + opt.gapLayer) / (opt.w + opt.gapNode))));
        const P = new Map();
        order.forEach((id, i) => {
            const row = Math.floor(i / perRow), col = i % perRow;
            const x = (row % 2 === 0 ? col : perRow - 1 - col) * (opt.w + opt.gapNode);
            P.set(id, { al: x, ac: row * (opt.h + opt.gapLayer), layer: row, sub: 0, ord: i + 1 });
        });

        // il filo del percorso è il contenuto; gli archi veri restano in
        // filigrana come extraEdges
        const path = [];
        for (let i = 0; i < order.length - 1; i++) {
            const a = P.get(order[i]), b = P.get(order[i + 1]);
            path.push({ edge: { s: order[i], t: order[i + 1], rel: '', _path: true }, pts: sampleBump(a, b, 10) });
        }
        const extra = edges0.map(e => ({ edge: e, pts: sampleLine(P.get(e.s), P.get(e.t), 10) }));
        return finish({
            kind: 'percorso', pos: P, dummies: [], edges: path, extraEdges: extra,
            stats: { passi: n, righe: Math.ceil(n / perRow), archiInvertiti: br.reversed, archiPersi: 0 }, opt
        }, nodes);
    }

    /* ── FASCI DI ARCHI (bundling gerarchico, Holten semplificato) ──────────
       Nodi su anelli radiali secondo la foresta portante; le relazioni
       vengono instradate lungo il cammino nell'albero e tirate verso la
       corda (beta 0.85): gli archi che seguono la stessa strada si
       raggruppano in fasci e si vede QUALI RAMI SI PARLANO. */
    function layoutFasci(nodes, links, d3, opt) {
        opt = Object.assign({}, DEFAULTS, opt || {}, { orient: 'td' });
        const sf = spanningForest(nodes, links);
        const children = new Map(nodes.map(n => [n.id, []]));
        const parent = new Map();
        sf.treeEdge.forEach(e => { if (children.has(e.s)) { children.get(e.s).push(e.t); parent.set(e.t, e.s); } });

        // settori angolari alle radici in proporzione alle foglie
        const leafCount = id => {
            const k = children.get(id) || [];
            return k.length ? k.reduce((s, c) => s + leafCount(c), 0) : 1;
        };
        const tot = sf.roots.reduce((s, r) => s + leafCount(r), 0) || 1;
        const P = new Map(), depth = new Map();
        let a0 = 0;
        const ringStep = opt.h + opt.gapLayer;
        sf.roots.forEach(r => {
            const span = 2 * Math.PI * leafCount(r) / tot;
            let leafI = 0; const leavesHere = leafCount(r);
            (function place(id, d) {
                depth.set(id, d);
                const kids = children.get(id) || [];
                let a;
                if (!kids.length) { a = a0 + span * (leafI + 0.5) / leavesHere; leafI++; }
                else { kids.forEach(k => place(k, d + 1)); a = kids.reduce((s, k) => s + P.get(k)._a, 0) / kids.length; }
                const r2 = Math.max(1, d) * ringStep * 2 + (d === 0 ? 0 : opt.w);
                P.set(id, { al: (d === 0 && sf.roots.length === 1 ? 0 : r2 * Math.cos(a)),
                            ac: (d === 0 && sf.roots.length === 1 ? 0 : r2 * Math.sin(a)),
                            layer: d, sub: 0, _a: a });
            })(r, 0);
            a0 += span;
        });

        // cammino nell'albero s→…→LCA→…→t, poi tensione verso la corda
        const pathVia = (s, t) => {
            const up = id => { const o = []; while (id !== undefined) { o.push(id); id = parent.get(id); } return o; };
            const A = up(s), B = up(t);
            const inB = new Set(B);
            let lca = A.find(x => inB.has(x));
            const left = A.slice(0, A.indexOf(lca) + 1);
            const right = B.slice(0, B.indexOf(lca)).reverse();
            return left.concat(right);
        };
        const BETA = 0.85;
        const bundle = (s, t) => {
            // capi in due alberi diversi: nessun LCA -> niente cammino da
            // instradare. L'arco resta, come linea diretta fra i capi VERI.
            const via = pathVia(s, t);
            if (via.indexOf(s) < 0 || via.indexOf(t) < 0) {
                const a = P.get(s), b = P.get(t);
                return (a && b) ? sampleLine(a, b, 12) : null;
            }
            const ctrl = via.map(id => P.get(id)).filter(Boolean);
            if (ctrl.length < 2) {
                const a = P.get(s), b = P.get(t);
                return (a && b) ? sampleLine(a, b, 12) : null;
            }
            const p0 = ctrl[0], pk = ctrl[ctrl.length - 1], k = ctrl.length - 1;
            const bent = ctrl.map((p, i) => ({
                al: BETA * p.al + (1 - BETA) * (p0.al + (pk.al - p0.al) * i / k),
                ac: BETA * p.ac + (1 - BETA) * (p0.ac + (pk.ac - p0.ac) * i / k)
            }));
            // spline di Catmull-Rom campionata sui punti piegati
            const out = [];
            for (let i = 0; i < bent.length - 1; i++) {
                const pA = bent[Math.max(0, i - 1)], pB = bent[i], pC = bent[i + 1], pD = bent[Math.min(bent.length - 1, i + 2)];
                for (let j = 0; j < 8; j++) {
                    const t2 = j / 8, t3 = t2 * t2, t4 = t3 * t2;
                    out.push({
                        al: 0.5 * ((2 * pB.al) + (-pA.al + pC.al) * t2 + (2 * pA.al - 5 * pB.al + 4 * pC.al - pD.al) * t3 + (-pA.al + 3 * pB.al - 3 * pC.al + pD.al) * t4),
                        ac: 0.5 * ((2 * pB.ac) + (-pA.ac + pC.ac) * t2 + (2 * pA.ac - 5 * pB.ac + 4 * pC.ac - pD.ac) * t3 + (-pA.ac + 3 * pB.ac - 3 * pC.ac + pD.ac) * t4)
                    });
                }
            }
            out.push(bent[bent.length - 1]);
            return out;
        };

        const tree = [], bundled = [];
        sf.treeEdge.forEach(e => {
            const a = P.get(e.s), b = P.get(e.t);
            if (a && b) tree.push({ edge: Object.assign({}, e, { _tree: true }), pts: sampleLine(a, b, 8) });
        });
        sf.extra.forEach(e => {
            const pts = bundle(e.s, e.t);
            if (pts) bundled.push({ edge: e, pts });
        });
        return finish({
            kind: 'fasci', pos: P, dummies: [], edges: bundled, extraEdges: tree,
            stats: { fasci: bundled.length, scheletro: tree.length, radici: sf.roots.length, archiPersi: 0 }, opt
        }, nodes);
    }

    /* ── MATRICE DI ADIACENZA ───────────────────────────────────────────────
       Righe = da, colonne = a, cella piena = relazione. Zero incroci per
       costruzione: la vista onesta dei grafi densi. Non è un node-link:
       il renderer ha un ramo dedicato. */
    function layoutMatrice(nodes, links, opt) {
        opt = Object.assign({}, DEFAULTS, opt || {});
        const gOf = new Map(nodes.map(n => [n.id, n.group == null ? 0 : n.group]));
        const lOf = new Map(nodes.map(n => [n.id, n.label || n.id]));
        const order = nodes.map(n => n.id).sort((a, b) =>
            gOf.get(a) - gOf.get(b) || String(lOf.get(a)).localeCompare(String(lOf.get(b))));
        const idx = new Map(order.map((id, i) => [id, i]));
        const idSet = new Set(order);
        const cells = edgeList(links).filter(e => idSet.has(e.s) && idSet.has(e.t))
            .map(e => ({ r: idx.get(e.s), c: idx.get(e.t), edge: e }));
        return {
            kind: 'matrice', order, cells,
            pos: new Map(), edges: [], extraEdges: [], dummies: [], bands: [],
            stats: { nodi: order.length, celle: cells.length, archiPersi: 0 }, opt
        };
    }

    function run(nodes, links, d3, opt) {
        opt = Object.assign({}, DEFAULTS, opt || {});
        switch (opt.mode) {
            case 'td':       return layoutTD(nodes, links, d3, opt);
            case 'anelli':   return layoutAnelli(nodes, links, opt);
            case 'colonne':  return layoutColonne(nodes, links, opt);
            case 'percorso': return layoutPercorso(nodes, links, opt);
            case 'fasci':    return layoutFasci(nodes, links, d3, opt);
            case 'matrice':  return layoutMatrice(nodes, links, opt);
            default:         return layoutDAG(nodes, links, opt);
        }
    }

    /* ── IL CICLO DEL BOTTONE LAYOUT (16/8) ──────────────────────────────────
       Default → Albero → Fasci → DAG → Default. Vive qui, e non dentro
       `toggleLayout`, per una ragione sola: così si può provare. Il ciclo è
       la cosa che un utente incontra a ogni pressione del bottone, e finora
       era una catena di `else if` dentro una funzione che vuole d3, un
       `simulation` e mezza app per girare — cioè non provabile.

       `passo` = appState.layoutMode · `motore` = il motore della vista studio
       (null se non si è dentro). Torna che cosa diventa il passo e, quando si
       resta nella vista, su quale motore.
       ⚠️ Da un motore FUORI dai tre (Anelli, Colonne… presi da «Altre
       opzioni») il passo dopo è l'uscita: entrare nel giro dal primo dei tre
       farebbe sembrare che il bottone non abbia fatto quello che ci si
       aspetta. Chi ha scelto Anelli esce dalla vista, non viene spostato su
       Albero senza averlo chiesto. */
    var CICLO_MOTORI = ['td', 'fasci', 'dag'];
    function cicloStudio(passo, motore) {
        if (passo !== 'studio') return { passo: 'studio', motore: CICLO_MOTORI[0] };
        var i = CICLO_MOTORI.indexOf(motore);
        if (i < 0 || i === CICLO_MOTORI.length - 1) return { passo: 'default', motore: motore };
        return { passo: 'studio', motore: CICLO_MOTORI[i + 1] };
    }

    return {
        DEFAULTS, edgeList, components, breakCycles, assignLayers,
        spanningForest, layoutDAG, layoutTD, layoutAnelli, layoutColonne,
        layoutPercorso, layoutFasci, layoutMatrice, run, measure, addHops, depths, assignPorts,
        placeEdgeLabels, labelSize, labelRect, segRectHit, rectHit,
        cicloStudio, CICLO_MOTORI
    };
}));
