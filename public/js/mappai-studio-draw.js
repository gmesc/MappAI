/* =========================================================================
   RENDERER A CARD DELLA VISTA STUDIO — condiviso da: overlay sul canvas,
   finestra Focus, banco-layout (matrice). Disegna il risultato dei motori di
   mappai-studio-layouts.js dentro un SVG.
   Tutta la resa è ad ATTRIBUTI SVG, mai classi CSS: così il clone per
   l'export PDF (svg2pdf) è fedele senza dover ricopiare fogli di stile.
   UMD, nessuna dipendenza da appState: i colori custom arrivano da fuori.
   ========================================================================= */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.MappAIStudioDraw = factory();
}(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    // La palette di MappAI (colorScale in mappai-d3-render.js:18). Il colore
    // dipende dal group (macro-area); i customColors del vault vincono.
    const MAPPAI_COLORS = {
        0: '#0f172a', 1: '#ef4444', 2: '#f59e0b', 3: '#10b981',
        4: '#0ea5e9', 5: '#6366f1', 6: '#d946ef', 7: '#8b5cf6'
    };
    const INK = '#334155', INK_SOFT = '#94a3b8', ROSSO = '#be123c';
    const FONT = "'Space Mono', monospace";

    function colorOf(node, custom) {
        const g = (node && node.group != null) ? node.group : 0;
        if (custom && custom[g]) return custom[g];
        return MAPPAI_COLORS[g] || MAPPAI_COLORS[(Math.abs(g) % 7) + 1];
    }
    function tint(hex, a) {
        const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
        return 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')';
    }

    function wrap(label, maxChars, maxLines) {
        const words = String(label || '').split(/\s+/), lines = [];
        let cur = '';
        words.forEach(w => {
            if ((cur + ' ' + w).trim().length <= maxChars) cur = (cur + ' ' + w).trim();
            else { if (cur) lines.push(cur); cur = w; }
        });
        if (cur) lines.push(cur);
        const out = lines.slice(0, maxLines);
        if (lines.length > maxLines) out[maxLines - 1] = out[maxLines - 1].slice(0, Math.max(1, maxChars - 1)) + '…';
        return out;
    }

    // Punta della freccia: triangolo pieno sull'ULTIMO segmento della polilinea,
    // vertice sul punto d'arrivo (dove stava il riferimento del marker).
    function arrowHead(g, pts, color, sw) {
        if (!pts || pts.length < 2) return null;
        const tip = pts[pts.length - 1];
        let i = pts.length - 2, dx = 0, dy = 0, L = 0;
        while (i >= 0) {                       // salta i segmenti di lunghezza nulla
            dx = tip.x - pts[i].x; dy = tip.y - pts[i].y;
            L = Math.hypot(dx, dy);
            if (L > 0.01) break;
            i--;
        }
        if (!L) return null;
        const ux = dx / L, uy = dy / L;
        const len = 4.5 * sw, half = 2 * sw;
        const bx = tip.x - ux * len, by = tip.y - uy * len;
        const px = -uy * half, py = ux * half;
        const r = v => Math.round(v * 100) / 100;
        return g.append('path')
            .attr('d', 'M' + r(tip.x) + ',' + r(tip.y) +
                       'L' + r(bx + px) + ',' + r(by + py) +
                       'L' + r(bx - px) + ',' + r(by - py) + 'Z')
            .attr('fill', color).attr('stroke', 'none');
    }

    // punto per l'etichetta: centro del segmento più lungo della polilinea
    function labelAt(pts) {
        let best = 0, bestLen = -1;
        for (let i = 0; i < pts.length - 1; i++) {
            const L = Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y);
            if (L > bestLen) { bestLen = L; best = i; }
        }
        return { x: (pts[best].x + pts[best + 1].x) / 2, y: (pts[best].y + pts[best + 1].y) / 2 };
    }

    const SIZE_RAMP = [1, 0.94, 0.87, 0.82, 0.78, 0.75, 0.72];
    function hierOf(mode, depth, isLeaf) {
        if (!mode || mode === 'no') return { op: 1, k: 1 };
        if (mode === 'foglie') return { op: isLeaf ? 0.65 : 1, k: 1 };
        if (mode === 'livello') return { op: Math.max(0.55, 1 - (depth || 0) * 0.09), k: 1 };
        if (mode === 'taglia') return {
            op: Math.max(0.55, 1 - (depth || 0) * 0.07),
            k: SIZE_RAMP[Math.min(depth || 0, SIZE_RAMP.length - 1)]
        };
        return { op: 1, k: 1 };
    }

    function bboxOf(res) {
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        res.pos.forEach(p => {
            minX = Math.min(minX, p.x - res.opt.w / 2); maxX = Math.max(maxX, p.x + res.opt.w / 2);
            minY = Math.min(minY, p.y - res.opt.h / 2); maxY = Math.max(maxY, p.y + res.opt.h / 2);
        });
        if (minX === Infinity) { minX = 0; maxX = 10; minY = 0; maxY = 10; }
        return { minX, maxX, minY, maxY };
    }

    /* ── MATRICE ────────────────────────────────────────────────────────────
       Righe = da, colonne = a. Intestazioni per esteso a sinistra, ruotate in
       alto; separatori più marcati al cambio di macro-area. */
    function drawMatrix(d3, g, res, byId, opts) {
        const cell = opts.cell || 26, n = res.order.length;
        const fs = Math.max(8, Math.min(13, opts.fsNode || 11));
        const side = n * cell;
        const gridC = '#e2e8f0';

        for (let i = 0; i <= n; i++) {
            const prevG = i > 0 ? (byId.get(res.order[i - 1]) || {}).group : null;
            const curG = i < n ? (byId.get(res.order[i]) || {}).group : null;
            const strong = i === 0 || i === n || prevG !== curG;
            g.append('line').attr('x1', 0).attr('x2', side).attr('y1', i * cell).attr('y2', i * cell)
                .attr('stroke', strong ? INK_SOFT : gridC).attr('stroke-width', strong ? 1.4 : 0.6);
            g.append('line').attr('y1', 0).attr('y2', side).attr('x1', i * cell).attr('x2', i * cell)
                .attr('stroke', strong ? INK_SOFT : gridC).attr('stroke-width', strong ? 1.4 : 0.6);
        }
        res.cells.forEach(c => {
            const src = byId.get(res.order[c.r]);
            g.append('rect')
                .attr('x', c.c * cell + 2).attr('y', c.r * cell + 2)
                .attr('width', cell - 4).attr('height', cell - 4).attr('rx', 3)
                .attr('fill', colorOf(src, opts.custom))
                .append('title').text(res.order[c.r] + ' → ' + res.order[c.c] + (c.edge.rel ? ' (' + c.edge.rel + ')' : ''));
        });
        res.order.forEach((id, i) => {
            const node = byId.get(id) || { id };
            const col = colorOf(node, opts.custom);
            g.append('text').attr('x', -8).attr('y', i * cell + cell / 2 + fs * 0.34)
                .attr('text-anchor', 'end').attr('font-family', FONT).attr('font-size', fs)
                .attr('font-weight', 700).attr('fill', col)
                .text((node.label || id).slice(0, 28));
            g.append('text')
                .attr('transform', 'translate(' + (i * cell + cell / 2 + fs * 0.34) + ',-8) rotate(-60)')
                .attr('font-family', FONT).attr('font-size', fs).attr('font-weight', 700).attr('fill', col)
                .text((node.label || id).slice(0, 28));
        });
        return { minX: -240, maxX: side, minY: -200, maxY: side };
    }

    /* ── DISEGNO ────────────────────────────────────────────────────────────
       opts: { d3, custom, fsNode, fsRel, labels:'off'|'short'|'full',
               hier, evidenzia, bands, interactive, prefix,
               onNodeClick(ev,node), onNodeContext(ev,node) }
       Ritorna { svg, g, bbox, fit(mode) }.                                  */
    function draw(svgEl, res, nodes, opts) {
        opts = opts || {};
        const d3 = opts.d3 || (typeof window !== 'undefined' && window.d3);
        const pfx = opts.prefix || 'sv';
        const svg = d3.select(svgEl);
        svg.selectAll('*').remove();
        const byId = new Map(nodes.map(n => [n.id, n]));
        const g = svg.append('g');

        let bbox;
        const stats = { labelConflitti: 0 };
        if (res.kind === 'matrice') {
            bbox = drawMatrix(d3, g, res, byId, opts);
        } else {
            bbox = drawGraph(d3, g, res, byId, opts, pfx, stats);
        }

        let zoom = null;
        if (opts.interactive !== false) {
            zoom = d3.zoom().scaleExtent([0.04, 3]).on('zoom', ev => g.attr('transform', ev.transform));
            svg.call(zoom);
        }
        function fit(mode) {
            if (!zoom) return;
            const el = svg.node(), r = el.getBoundingClientRect();
            const rw = r.width || el.clientWidth || 900, rh = r.height || el.clientHeight || 560;
            const pad = 46;
            const kAll = Math.min(rw / ((bbox.maxX - bbox.minX) + pad * 2), rh / ((bbox.maxY - bbox.minY) + pad * 2), 1.8);
            let k = kAll, cx = (bbox.minX + bbox.maxX) / 2, cy = (bbox.minY + bbox.maxY) / 2;
            if (mode === 'read' && kAll < 0.62) {
                k = 0.62;
                cy = bbox.minY + rh / (2 * k) - pad;
            }
            svg.call(zoom.transform, d3.zoomIdentity.translate(rw / 2 - k * cx, rh / 2 - k * cy).scale(k));
        }
        return { svg, g, bbox, fit, stats };
    }

    // pfx: resta nella firma per compatibilità (serviva agli id dei marker,
    // ora le punte sono geometria e non c'è più niente da nominare).
    function drawGraph(d3, g, res, byId, opts, pfx, stats) {   // eslint-disable-line no-unused-vars
        const W = res.opt.w, H = res.opt.h;
        const fsBase = opts.fsNode || 12;
        const fsRel = opts.fsRel || 10;
        const line = d3.line().x(d => d.x).y(d => d.y).curve(d3.curveLinear);

        // NIENTE <marker>: svg2pdf non li rende e nel PDF le frecce sparivano.
        // Le punte sono GEOMETRIA come tutto il resto (vedi arrowHead), con le
        // misure del marker che c'era prima: lungo 4.5×, largo 2× la stroke.

        // foglie = nodi senza archi uscenti reali (il filo del percorso non conta)
        const conUscita = new Set();
        res.edges.concat(res.extraEdges || []).forEach(e => { if (!e.edge._path) conUscita.add(e.edge.s); });
        const foglia = id => !conUscita.has(id);

        const gBand = g.append('g'), gEdge = g.append('g'), gHop = g.append('g'),
              gArrow = g.append('g'), gLab = g.append('g'), gDum = g.append('g'), gNode = g.append('g');

        if (opts.bands && res.bands && res.bands.length) {
            res.bands.forEach(b => {
                const col = colorOf({ group: b.g }, opts.custom);
                gBand.append('rect').attr('x', b.x0 - 12).attr('y', b.y0 - 12).attr('rx', 14)
                    .attr('width', (b.x1 - b.x0) + 24).attr('height', (b.y1 - b.y0) + 24)
                    .attr('fill', col).attr('fill-opacity', 0.08)
                    .attr('stroke', col).attr('stroke-opacity', 0.45)
                    .attr('stroke-width', 1.5).attr('stroke-dasharray', '4 4');
            });
        }

        // raccolte per l'evidenziazione al passaggio (opts.hover)
        const nodeEls = [], edgeEls = [], hopEls = [], labelEls = [];

        // archi principali. Nei fasci il colore segue la macro-area di
        // partenza, così i fasci si distinguono; il filo del percorso è indigo
        // pieno; gli invertiti tratteggiati rossi come sempre.
        res.edges.forEach(e => {
            const isPath = !!e.edge._path;
            const col = e.edge.reversed ? ROSSO
                : (res.kind === 'fasci' ? colorOf(byId.get(e.edge.s), opts.custom)
                    : (isPath ? '#4f46e5' : INK));
            const sw = isPath ? 2.6 : (res.kind === 'fasci' ? 1.3 : 1.6);
            const p = gEdge.append('path').attr('fill', 'none')
                .attr('stroke', col)
                .attr('stroke-width', sw)
                .attr('stroke-opacity', res.kind === 'fasci' ? 0.55 : 1)
                .attr('d', line(e.pts));
            if (e.edge.reversed) p.attr('stroke-dasharray', '5 4');
            p.append('title').text(e.edge.s + ' → ' + e.edge.t + (e.edge.rel ? ' (' + e.edge.rel + ')' : ''));
            edgeEls.push({ el: p, edge: e.edge });
            if (res.kind !== 'fasci') {
                const ah = arrowHead(gArrow, e.pts, col, sw);
                if (ah) edgeEls.push({ el: ah, edge: e.edge });
            }
        });

        // archi in filigrana: fuori-albero nel TD, grafo vero nel percorso,
        // scheletro dell'albero nei fasci
        (res.extraEdges || []).forEach(e => {
            const q = gEdge.append('path').attr('fill', 'none')
                .attr('stroke', INK_SOFT).attr('stroke-width', 1.1)
                .attr('stroke-dasharray', '2 4').attr('stroke-opacity', res.kind === 'fasci' ? 0.5 : 0.85)
                .attr('d', line(e.pts));
            q.append('title').text(e.edge.s + ' → ' + e.edge.t + (e.edge.rel ? ' (' + e.edge.rel + ')' : ''));
            edgeEls.push({ el: q, edge: e.edge });
            if (res.kind !== 'fasci') {
                const ah = arrowHead(gArrow, e.pts, INK_SOFT, 1.1);
                if (ah) edgeEls.push({ el: ah, edge: e.edge });
            }
        });

        if (res.hops && res.hops.length) {
            res.hops.forEach(hp => {
                const c1 = gHop.append('path').attr('fill', 'none').attr('stroke', '#ffffff')
                    .attr('stroke-width', 5.5).attr('stroke-linecap', 'round').attr('d', line(hp.pts));
                const c2 = gHop.append('path').attr('fill', 'none')
                    .attr('stroke', hp.edge.reversed ? ROSSO : INK)
                    .attr('stroke-width', 1.6).attr('stroke-linecap', 'round').attr('d', line(hp.pts));
                hopEls.push({ els: [c1, c2], edge: hp.edge });
            });
        }

        if (opts.labels && opts.labels !== 'off') {
            const cap = opts.labels === 'short' ? 14 : 40;
            const lista = res.edges.concat(res.extraEdges || []);
            const testo = ed => {
                if (!ed || !ed.rel) return '';
                return ed.rel.length > cap ? ed.rel.slice(0, cap - 1) + '…' : ed.rel;
            };
            // Dove scrivere: non più il centro del segmento più lungo (finiva
            // sugli incroci) ma il punto meno affollato lungo la polilinea.
            // Il calcolo vive nei motori (puro, testato); se manca si ripiega
            // sul vecchio labelAt.
            const LAY = (typeof window !== 'undefined' && window.MappAIStudioLayouts) ||
                        (typeof MappAIStudioLayouts !== 'undefined' ? MappAIStudioLayouts : null);
            const piazz = (LAY && LAY.placeEdgeLabels)
                ? LAY.placeEdgeLabels(lista, res, { fs: fsRel, textOf: testo })
                : { pos: new Map(), conflitti: 0 };
            if (stats) stats.labelConflitti = piazz.conflitti || 0;
            lista.forEach((e, i) => {
                if (!e.edge.rel) return;
                const at = piazz.pos.get(i) || labelAt(e.pts);
                const lt = gLab.append('text').attr('x', at.x).attr('y', at.y - 4)
                    .attr('text-anchor', 'middle').attr('font-family', FONT)
                    .attr('font-size', fsRel).attr('font-weight', 700).attr('fill', '#475569')
                    .attr('paint-order', 'stroke').attr('stroke', '#ffffff')
                    .attr('stroke-width', 3).attr('stroke-linejoin', 'round')
                    .text(testo(e.edge));
                labelEls.push({ el: lt, edge: e.edge });
            });
        }

        (res.dummies || []).forEach(d => {
            gDum.append('circle').attr('cx', d.x).attr('cy', d.y).attr('r', 3).attr('fill', '#cbd5e1');
        });

        res.pos.forEach((pt, id) => {
            const node = byId.get(id) || { id, label: id };
            const hv = hierOf(opts.hier, pt.layer, foglia(id));
            const Wk = W * hv.k, Hk = H * hv.k;
            const col = colorOf(node, opts.custom);
            const nd = gNode.append('g')
                .attr('transform', 'translate(' + pt.x + ',' + pt.y + ')')
                .attr('opacity', hv.op)
                .attr('data-op', hv.op)
                .style('cursor', 'pointer');
            nodeEls.push({ el: nd, id: id });
            nd.append('rect').attr('x', -Wk / 2).attr('y', -Hk / 2)
                .attr('width', Wk).attr('height', Hk).attr('rx', 9)
                .attr('fill', tint(col, 0.12)).attr('stroke', col)
                .attr('stroke-width', id === opts.evidenzia ? 4 : 1.5);
            // Solo identità e posto nella struttura: la descrizione NON sta più
            // nel tooltip del browser (si apriva da sola, a caso, e copriva le
            // card). Si legge dal comando «Descrizione» del menu contestuale.
            nd.append('title').text((node.label || id) +
                (pt.ord ? '\npasso ' + pt.ord : '\nlivello ' + pt.layer));

            // Il tetto vale contro valori assurdi, non contro la leva del tab:
            // a 16 il comando «Testo dei nodi» smetteva di avere effetto a
            // metà corsa (misurato 1/8: slider a 20 → testo ancora 16).
            const fs = Math.max(8, Math.min(24, Math.round(fsBase * hv.k)));
            const lines = wrap(node.label || id, Math.max(6, Math.floor(Wk / (fs * 0.62))), Hk >= 56 ? 3 : 2);
            const t = nd.append('text').attr('text-anchor', 'middle')
                .attr('font-family', FONT).attr('font-size', fs).attr('font-weight', 700).attr('fill', col);
            const step = fs * 1.15, top = -step * (lines.length - 1) / 2 + fs * 0.34;
            lines.forEach((ln, i) => t.append('tspan').attr('x', 0).attr('y', top + i * step).text(ln));

            // badge del passo (percorso di lettura)
            if (pt.ord) {
                nd.append('circle').attr('cx', -Wk / 2).attr('cy', -Hk / 2).attr('r', 12)
                    .attr('fill', '#4f46e5').attr('stroke', '#ffffff').attr('stroke-width', 2);
                nd.append('text').attr('x', -Wk / 2).attr('y', -Hk / 2 + 4)
                    .attr('text-anchor', 'middle').attr('font-family', FONT)
                    .attr('font-size', 11).attr('font-weight', 700).attr('fill', '#ffffff')
                    .text(pt.ord);
            }
            if (opts.onNodeClick) nd.on('click', ev => opts.onNodeClick(ev, node));
            if (opts.onNodeContext) nd.on('contextmenu', ev => { ev.preventDefault(); opts.onNodeContext(ev, node); });
        });

        /* ── evidenzia al passaggio (opts.hover: 'no'|'vicini'|'parenti') ──
           Sbadisce tutto ciò che non appartiene all'intorno del nodo sotto il
           mouse. Il filo del percorso (_path) e lo scheletro dei fasci (_tree)
           NON entrano nelle mappe di parentela: sono resa, non relazioni. */
        if (opts.hover && opts.hover !== 'no') {
            const succ = new Map(), pred = new Map();
            nodeEls.forEach(n => { succ.set(n.id, []); pred.set(n.id, []); });
            res.edges.concat(res.extraEdges || []).forEach(e => {
                if (e.edge._path || e.edge._tree) return;
                if (succ.has(e.edge.s)) succ.get(e.edge.s).push(e.edge.t);
                if (pred.has(e.edge.t)) pred.get(e.edge.t).push(e.edge.s);
            });
            const reach = (from, map) => {
                const o = new Set(), q = [from];
                while (q.length) {
                    const u = q.pop();
                    (map.get(u) || []).forEach(v => { if (!o.has(v)) { o.add(v); q.push(v); } });
                }
                return o;
            };
            const vivo = (keep, e) => keep.has(e.s) && keep.has(e.t);
            const dim = keep => {
                nodeEls.forEach(n => n.el.attr('opacity', keep.has(n.id) ? n.el.attr('data-op') : 0.14));
                edgeEls.forEach(o => o.el.attr('opacity', vivo(keep, o.edge) ? 1 : 0.06));
                hopEls.forEach(o => o.els.forEach(el => el.attr('opacity', vivo(keep, o.edge) ? 1 : 0.06)));
                labelEls.forEach(o => o.el.attr('opacity', vivo(keep, o.edge) ? 1 : 0.06));
            };
            const restore = () => {
                nodeEls.forEach(n => n.el.attr('opacity', n.el.attr('data-op')));
                edgeEls.forEach(o => o.el.attr('opacity', null));
                hopEls.forEach(o => o.els.forEach(el => el.attr('opacity', null)));
                labelEls.forEach(o => o.el.attr('opacity', null));
            };
            nodeEls.forEach(n => {
                n.el.on('mouseenter', () => {
                    const keep = opts.hover === 'vicini'
                        ? new Set([n.id].concat(succ.get(n.id) || [], pred.get(n.id) || []))
                        : new Set([n.id].concat([...reach(n.id, succ)], [...reach(n.id, pred)]));
                    dim(keep);
                }).on('mouseleave', restore);
            });
        }

        return bboxOf(res);
    }

    return { MAPPAI_COLORS, colorOf, tint, wrap, labelAt, hierOf, bboxOf, arrowHead, draw };
}));
