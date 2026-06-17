// mappai-multiselect.js
// Selezione multipla di nodi sul grafo D3.
//   • Drag su area vuota          → box-select (nuova selezione)
//   • SHIFT + drag / SHIFT + clic → AGGIUNGE alla selezione
//   • CTRL/CMD + drag / clic      → RIMUOVE dalla selezione (deseleziona)
//   • ESC                         → svuota la selezione
// Pan del canvas: rotella/trackpad (zoom) o drag col tasto centrale del mouse
//   (il drag sinistro su area vuota ora fa box-select).
//
// Modulo self-contained: non dipende dalle variabili locali svg/g/zoom di app.js.
// Legge i nodi dal data-join D3, le coordinate via d3.pointer/d3.zoomTransform.
// Reversibile: localStorage.setItem('mappai_multiselect_disabled','true') + reload.
// Caricare in index.html DOPO app.js.

(function () {
    'use strict';

    if (typeof window.d3 === 'undefined' && typeof d3 === 'undefined') return;
    const D3 = window.d3 || d3;

    const SVG_ID = 'map-svg';
    const selected = new Set();        // id dei nodi selezionati
    let boxRect = null;                // <rect> della selezione attiva
    let dragState = null;              // { startX, startY, mode } in coord g-locali
    let badgeEl = null;

    function disabled() {
        return localStorage.getItem('mappai_multiselect_disabled') === 'true';
    }

    function svgNode() { return document.getElementById(SVG_ID); }
    // Primo <g> dentro l'svg = layer dello zoom (vedi initD3Visualization)
    function gNode() {
        const s = svgNode();
        return s ? s.querySelector('g') : null;
    }

    // Coordinate del puntatore nello spazio locale di g (= spazio di node.x/node.y).
    // d3.pointer inverte la CTM completa (viewBox + transform dello zoom).
    function pointerInG(event) {
        const gn = gNode();
        if (!gn) return null;
        const p = D3.pointer(event, gn);
        return { x: p[0], y: p[1] };
    }

    // ── Stile iniettato (self-contained, niente modifiche a style.css) ──
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

    // ── Badge contatore ──
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

    // ── Applica le classi visive ai node-group ──
    function refreshVisual() {
        const s = svgNode();
        if (!s) return;
        D3.select(s).selectAll('.node-group')
            .classed('mappai-multi-selected', d => d && selected.has(d.id));
        updateBadge();
    }

    // ── API selezione ──
    function clearSelection() {
        selected.clear();
        refreshVisual();
    }

    function toggleNode(d, event) {
        if (!d || !d.id) return;
        const remove = event && (event.ctrlKey || event.metaKey);
        if (remove) selected.delete(d.id);
        else {
            // SHIFT (o clic modificato generico): toggle aggiungi/togli
            if (selected.has(d.id)) selected.delete(d.id);
            else selected.add(d.id);
        }
        refreshVisual();
    }

    // ── Hit-test: nodi il cui centro cade nel box (coord g-locali) ──
    function nodesInBox(x0, y0, x1, y1) {
        const minX = Math.min(x0, x1), maxX = Math.max(x0, x1);
        const minY = Math.min(y0, y1), maxY = Math.max(y0, y1);
        const s = svgNode();
        if (!s) return [];
        const data = D3.select(s).selectAll('.node-group').data();
        return data.filter(d =>
            d && typeof d.x === 'number' && typeof d.y === 'number' &&
            d.x >= minX && d.x <= maxX && d.y >= minY && d.y <= maxY
        );
    }

    // ── Rubber-band ──
    function onBackgroundMouseDown(event) {
        if (disabled()) return;
        if (event.button !== 0) return;             // solo tasto sinistro (centrale → pan d3)
        const t = event.target;
        if (t && t.closest && t.closest('.node-group')) return;  // è un nodo → lascia il drag nodo
        // Blocca il pan dello zoom d3 (capture-phase, prima dei suoi listener)
        event.preventDefault();
        event.stopImmediatePropagation();

        const start = pointerInG(event);
        if (!start) return;
        const mode = event.ctrlKey || event.metaKey ? 'remove'
                   : event.shiftKey ? 'add' : 'replace';
        dragState = { startX: start.x, startY: start.y, mode, moved: false };

        const gn = gNode();
        boxRect = D3.select(gn).append('rect')
            .attr('class', 'mappai-multiselect-box')
            .attr('x', start.x).attr('y', start.y)
            .attr('width', 0).attr('height', 0);

        document.body.style.userSelect = 'none';
        window.addEventListener('mousemove', onMouseMove, true);
        window.addEventListener('mouseup', onMouseUp, true);
    }

    function onMouseMove(event) {
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

    function onMouseUp(event) {
        window.removeEventListener('mousemove', onMouseMove, true);
        window.removeEventListener('mouseup', onMouseUp, true);
        document.body.style.userSelect = '';
        if (!dragState) return;

        const p = pointerInG(event) || { x: dragState.startX, y: dragState.startY };

        if (dragState.moved) {
            const hits = nodesInBox(dragState.startX, dragState.startY, p.x, p.y);
            if (dragState.mode === 'replace') selected.clear();
            hits.forEach(d => {
                if (dragState.mode === 'remove') selected.delete(d.id);
                else selected.add(d.id);
            });
            refreshVisual();
            // Evita che il 'click' di fine drag resetti l'evidenziazione
            window.ignoreNextNodeClick = true;
            setTimeout(() => { window.ignoreNextNodeClick = false; }, 50);
        } else if (dragState.mode === 'replace') {
            // Clic semplice su area vuota senza drag → svuota selezione
            clearSelection();
        }

        if (boxRect) { boxRect.remove(); boxRect = null; }
        dragState = null;
    }

    // ── ESC per svuotare ──
    function onKeyDown(e) {
        if (e.key === 'Escape' && selected.size > 0) {
            clearSelection();
        }
    }

    // ── Aggancio: il listener mousedown va in capture sull'svg, così precede
    //    i listener di d3.zoom (bubble-phase). Si ri-aggancia se l'svg viene
    //    ricreato da initD3Visualization. ──
    let attachedSvg = null;
    function attach() {
        injectStyle();
        const s = svgNode();
        if (!s || s === attachedSvg) return;
        s.addEventListener('mousedown', onBackgroundMouseDown, true);
        attachedSvg = s;
    }

    // L'svg viene ricreato a ogni nuovo grafo: osserva il container e riaggancia.
    function watchContainer() {
        const cont = document.getElementById('d3-container');
        if (!cont) return;
        const mo = new MutationObserver(() => {
            const s = svgNode();
            if (s && s !== attachedSvg) {
                // l'svg è cambiato → la vecchia selezione non è più valida
                selected.clear();
                attach();
                updateBadge();
            }
        });
        mo.observe(cont, { childList: true });
    }

    function init() {
        attach();
        watchContainer();
        document.addEventListener('keydown', onKeyDown);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // Riaggancio difensivo: se il grafo è già stato disegnato prima di init
    setTimeout(attach, 1500);

    // ── API pubblica ──
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
        attach,
        enable: () => { localStorage.removeItem('mappai_multiselect_disabled'); console.log('[MultiSelect] attivo'); },
        disable: () => { localStorage.setItem('mappai_multiselect_disabled', 'true'); clearSelection(); console.log('[MultiSelect] disattivato'); }
    };

})();
