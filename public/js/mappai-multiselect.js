// mappai-multiselect.js
// Selezione multipla di nodi + drag di gruppo.
//
//   BOX-SELECT (area vuota):
//   • Drag su area vuota           → pan normale D3 (invariato, SHIFT non premuto)
//   • SHIFT + drag su area vuota   → box-select: aggiunge nodi alla selezione
//   • SHIFT + clic su area vuota   → non modifica la selezione
//
//   CLIC SU NODO:
//   • SHIFT + clic                 → toggle (aggiunge se assente, rimuove se presente)
//   • CTRL/CMD + clic              → rimuove dalla selezione
//   • Clic semplice su nodo        → svuota multi-selezione, apre dettaglio (normale)
//   • Clic semplice su sfondo      → svuota multi-selezione + reset normale
//
//   DRAG DI GRUPPO:
//   • Drag su nodo in multi-selezione → sposta tutti i nodi selezionati insieme
//
//   ESC / badge → svuota selezione
//   Disabilita: localStorage.setItem('mappai_multiselect_disabled','true') + reload
//   Console: MappAIMultiSelect.enable() / .disable() / .getSelectedIds() / ...

(function () {
    'use strict';

    if (typeof d3 === 'undefined' && typeof window.d3 === 'undefined') return;
    const D3 = window.d3 || d3;

    const SVG_ID = 'map-svg';
    const selected = new Set();
    let boxRect = null;
    let dragState = null;
    let badgeEl = null;
    let suppressNextClick = false;
    let groupDragState = null;
    let attachedSvg = null;

    function disabled() {
        return localStorage.getItem('mappai_multiselect_disabled') === 'true';
    }
    function svgNode() { return document.getElementById(SVG_ID); }
    function gNode() { const s = svgNode(); return s ? s.querySelector('g') : null; }

    // Coordinate del puntatore in spazio simulazione (= spazio di node.x/node.y).
    function pointerInG(event) {
        const gn = gNode();
        if (!gn) return null;
        const p = D3.pointer(event, gn);
        return { x: p[0], y: p[1] };
    }

    // ── Stile ─────────────────────────────────────────────────────────────────
    function injectStyle() {
        if (document.getElementById('mappai-multiselect-style')) return;
        const st = document.createElement('style');
        st.id = 'mappai-multiselect-style';
        st.textContent = `
            .mappai-multiselect-box {
                fill: rgba(99,102,241,0.12);
                stroke: #6366f1;
                stroke-width: 1.5px;
                stroke-dasharray: 5 4;
                vector-effect: non-scaling-stroke;
                pointer-events: none;
            }
            .node-group.mappai-multi-selected .node-circle {
                stroke: #6366f1 !important;
                stroke-width: 4px !important;
                filter: drop-shadow(0 0 4px rgba(99,102,241,0.8));
            }
            #mappai-multiselect-badge {
                position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%);
                background: #1e293b; color: #fff; font-size: 13px; font-weight: 600;
                padding: 8px 16px; border-radius: 999px; z-index: 9000;
                box-shadow: 0 4px 16px rgba(0,0,0,0.25); display: none;
                align-items: center; gap: 10px; font-family: var(--font, sans-serif);
            }
            #mappai-multiselect-badge button {
                background: #6366f1; color: #fff; border: none; border-radius: 6px;
                padding: 3px 10px; font-size: 12px; font-weight: 700; cursor: pointer;
            }
            #mappai-multiselect-badge button:hover { background: #4f46e5; }
        `;
        document.head.appendChild(st);
    }

    // ── Badge contatore ────────────────────────────────────────────────────────
    function updateBadge() {
        if (!badgeEl) {
            badgeEl = document.createElement('div');
            badgeEl.id = 'mappai-multiselect-badge';
            badgeEl.innerHTML = `<span class="ms-count"></span>
                <button type="button" class="ms-clear">Deseleziona (ESC)</button>`;
            document.body.appendChild(badgeEl);
            badgeEl.querySelector('.ms-clear').addEventListener('click', clearSelection);
        }
        const n = selected.size;
        if (n === 0) { badgeEl.style.display = 'none'; return; }
        badgeEl.querySelector('.ms-count').textContent =
            n === 1 ? '1 nodo selezionato' : n + ' nodi selezionati';
        badgeEl.style.display = 'flex';
    }

    function refreshVisual() {
        const s = svgNode();
        if (!s) return;
        D3.select(s).selectAll('.node-group')
            .classed('mappai-multi-selected', d => d && selected.has(d.id));
        updateBadge();
    }

    function clearSelection() {
        selected.clear();
        refreshVisual();
    }

    // SHIFT+clic → toggle; CTRL/CMD+clic → rimuovi sempre
    function toggleNode(d, event) {
        if (!d || !d.id) return;
        const remove = event && (event.ctrlKey || event.metaKey);
        if (remove) {
            selected.delete(d.id);
        } else {
            if (selected.has(d.id)) selected.delete(d.id);
            else selected.add(d.id);
        }
        refreshVisual();
    }

    function nodesInBox(x0, y0, x1, y1) {
        const minX = Math.min(x0, x1), maxX = Math.max(x0, x1);
        const minY = Math.min(y0, y1), maxY = Math.max(y0, y1);
        const s = svgNode();
        if (!s) return [];
        return D3.select(s).selectAll('.node-group').data().filter(d =>
            d && typeof d.x === 'number' && typeof d.y === 'number' &&
            d.x >= minX && d.x <= maxX && d.y >= minY && d.y <= maxY
        );
    }

    // ── BOX-SELECT ────────────────────────────────────────────────────────────
    // Intercetta mousedown in capture-phase SOLO se SHIFT è premuto.
    // Senza SHIFT: non fa nulla → D3 zoom/pan funziona normalmente.
    function onBackgroundMouseDown(event) {
        if (disabled()) return;
        if (!event.shiftKey) return;              // SHIFT obbligatorio per box-select
        if (event.button !== 0) return;
        const t = event.target;
        if (t && t.closest && t.closest('.node-group')) return;  // nodo: gestito da handleNodeClick

        event.preventDefault();
        event.stopImmediatePropagation();         // blocca D3 zoom solo quando SHIFT premuto

        const start = pointerInG(event);
        if (!start) return;
        dragState = { startX: start.x, startY: start.y, moved: false };

        boxRect = D3.select(gNode()).append('rect')
            .attr('class', 'mappai-multiselect-box')
            .attr('x', start.x).attr('y', start.y)
            .attr('width', 0).attr('height', 0);

        document.body.style.userSelect = 'none';
        window.addEventListener('mousemove', onBoxMouseMove, true);
        window.addEventListener('mouseup', onBoxMouseUp, true);
    }

    function onBoxMouseMove(event) {
        if (!dragState || !boxRect) return;
        const p = pointerInG(event);
        if (!p) return;
        if (Math.abs(p.x - dragState.startX) > 2 || Math.abs(p.y - dragState.startY) > 2) {
            dragState.moved = true;
        }
        const x = Math.min(dragState.startX, p.x);
        const y = Math.min(dragState.startY, p.y);
        boxRect.attr('x', x).attr('y', y)
            .attr('width', Math.abs(p.x - dragState.startX))
            .attr('height', Math.abs(p.y - dragState.startY));
    }

    function onBoxMouseUp(event) {
        window.removeEventListener('mousemove', onBoxMouseMove, true);
        window.removeEventListener('mouseup', onBoxMouseUp, true);
        document.body.style.userSelect = '';
        if (!dragState) return;

        if (dragState.moved) {
            const p = pointerInG(event) || { x: dragState.startX, y: dragState.startY };
            nodesInBox(dragState.startX, dragState.startY, p.x, p.y)
                .forEach(d => selected.add(d.id));
            refreshVisual();
            // Blocca il click nativo che seguirebbe il drag
            suppressNextClick = true;
            window.ignoreNextNodeClick = true;
            setTimeout(() => { window.ignoreNextNodeClick = false; }, 50);
        }
        // SHIFT+clic su sfondo senza drag: nessuna modifica.
        // Il click event successivo viene bloccato da onSvgClickCapture (shiftKey check).

        if (boxRect) { boxRect.remove(); boxRect = null; }
        dragState = null;
    }

    // Capture-phase click sull'svg: media tra box-select, SHIFT e click normale.
    function onSvgClickCapture(event) {
        const onBg = !(event.target.closest && event.target.closest('.node-group'));
        if (!onBg) { suppressNextClick = false; return; } // clic su nodo: non interferire

        if (suppressNextClick) {
            // Click dopo drag box-select: soppresso
            suppressNextClick = false;
            event.stopImmediatePropagation();
            return;
        }
        if (event.shiftKey) {
            // SHIFT+clic su sfondo: non svuotare la selezione
            event.stopImmediatePropagation();
            return;
        }
        // Clic semplice su sfondo: svuota multi-selezione, poi handleBackgroundClick fa il resto
        clearSelection();
    }

    // ── GROUP DRAG ────────────────────────────────────────────────────────────
    // Capture mousedown su node-group: se il nodo è in una multi-selezione ≥2,
    // muove i compagni con lo stesso delta schermo convertito in spazio simulazione.
    // D3 drag gestisce l'anchor normalmente; questo agisce IN PARALLELO sui compagni.
    function onNodeMouseDownCapture(event) {
        if (disabled()) return;
        if (event.button !== 0) return;
        if (event.shiftKey || event.ctrlKey || event.metaKey) return; // → handleNodeClick
        const nodeGroup = event.target.closest ? event.target.closest('.node-group') : null;
        if (!nodeGroup) return;
        const datum = D3.select(nodeGroup).datum();
        if (!datum || !selected.has(datum.id) || selected.size < 2) return;

        const companions = [];
        D3.select(svgNode()).selectAll('.node-group').each(function (nd) {
            if (nd && nd.id !== datum.id && selected.has(nd.id)) {
                companions.push({ node: nd });
            }
        });
        if (companions.length === 0) return;

        groupDragState = {
            anchor: datum,
            companions,
            prevClientX: event.clientX,
            prevClientY: event.clientY
        };
        window.addEventListener('mousemove', onGroupMouseMove, true);
        window.addEventListener('mouseup', onGroupMouseUp, true);
    }

    function onGroupMouseMove(event) {
        if (!groupDragState) return;
        const dX = event.clientX - groupDragState.prevClientX;
        const dY = event.clientY - groupDragState.prevClientY;
        groupDragState.prevClientX = event.clientX;
        groupDragState.prevClientY = event.clientY;
        if (Math.abs(dX) < 0.1 && Math.abs(dY) < 0.1) return;

        // Converti delta schermo → spazio simulazione tramite scala zoom attuale
        const svgEl = svgNode();
        const k = svgEl ? (D3.zoomTransform(svgEl).k || 1) : 1;
        const dx = dX / k, dy = dY / k;

        groupDragState.companions.forEach(c => {
            const n = c.node;
            n.fx = (n.fx !== null && n.fx !== undefined ? n.fx : (n.x || 0)) + dx;
            n.fy = (n.fy !== null && n.fy !== undefined ? n.fy : (n.y || 0)) + dy;
        });
    }

    function onGroupMouseUp(event) {
        window.removeEventListener('mousemove', onGroupMouseMove, true);
        window.removeEventListener('mouseup', onGroupMouseUp, true);
        if (!groupDragState) return;
        const { anchor, companions } = groupDragState;
        groupDragState = null;

        // Attende che D3 dragended abbia aggiornato anchor.fx/fy,
        // poi replica il suo comportamento (rilascia alla fisica o pinna).
        setTimeout(() => {
            const anchorReleased = anchor.fx === null && anchor.fy === null;
            companions.forEach(c => {
                const n = c.node;
                if (anchorReleased && (n.level || 0) !== 0) {
                    n.fx = null; n.fy = null;    // rilascia alla fisica
                } else {
                    n.fx = n.x; n.fy = n.y;     // pinna nella posizione corrente
                }
            });
        }, 0);
    }

    // ── ESC ───────────────────────────────────────────────────────────────────
    function onKeyDown(e) {
        if (e.key === 'Escape' && selected.size > 0) clearSelection();
    }

    // ── Attach / MutationObserver ─────────────────────────────────────────────
    function attach() {
        injectStyle();
        const s = svgNode();
        if (!s || s === attachedSvg) return;
        s.addEventListener('mousedown', onBackgroundMouseDown, true);
        s.addEventListener('mousedown', onNodeMouseDownCapture, true);
        s.addEventListener('click', onSvgClickCapture, true);
        attachedSvg = s;
    }

    function watchContainer() {
        const cont = document.getElementById('d3-container');
        if (!cont) return;
        new MutationObserver(() => {
            const s = svgNode();
            if (s && s !== attachedSvg) {
                selected.clear();
                attach();
                updateBadge();
            }
        }).observe(cont, { childList: true });
    }

    function init() {
        attach();
        watchContainer();
        document.addEventListener('keydown', onKeyDown);
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
    setTimeout(attach, 1500); // riaggancio difensivo se grafo già disegnato

    // ── API pubblica ──────────────────────────────────────────────────────────
    window.MappAIMultiSelect = {
        toggleNode,
        clearSelection,
        refresh: refreshVisual,
        getSelectedIds: () => Array.from(selected),
        getSelectedNodes: () => {
            const s = svgNode();
            if (!s) return [];
            return D3.select(s).selectAll('.node-group').data()
                .filter(d => d && selected.has(d.id));
        },
        isSelected: id => selected.has(id),
        count: () => selected.size,
        enable:  () => { localStorage.removeItem('mappai_multiselect_disabled'); console.log('[MultiSelect] attivo'); },
        disable: () => { localStorage.setItem('mappai_multiselect_disabled', 'true'); clearSelection(); console.log('[MultiSelect] disattivato'); }
    };

})();
