/* =========================================================================
   VISTA STUDIO (1/8) — il passo «STUDIO» del ciclo LAYOUT.
   Overlay a card sopra il canvas: il force layout resta intatto sotto e si
   ritrova uscendo. Comandi nel tab «Vista studio» della sidebar (visibile
   solo qui). Il profilo vive in appState.studioProfile → viaggia col
   progetto (autosave); la scrittura nel vault arriva in una fase successiva.
   Kill-switch: localStorage mappai_studio_view='0' (gestito in toggleLayout).
   Dipende da: mappai-studio-layouts.js (motori), mappai-studio-draw.js
   (renderer), jsPDF + svg2pdf (export), appState (scope lessicale condiviso).
   ========================================================================= */
(function () {
    'use strict';

    const t = (k, f) => (window.t ? window.t(k, f) : f);
    const L = () => window.MappAIStudioLayouts;
    const DRAW = () => window.MappAIStudioDraw;

    const DEF_PROFILE = {
        mode: 'dag', orient: 'td', routing: 'orto', set: 'auto', labels: 'short',
        gapLayer: 72, gapNode: 26, w: 168, h: 46,
        fsNode: 12, fsRel: 10, hier: 'foglie', depth: 999,
        bands: false, centerId: null,
        hops: true, ports: true, hl: 'parenti'
    };

    // Preset del banco-layout, senza le leve di testo e resa: un preset regola
    // geometria, motore e instradamento; il resto resta come l'utente l'ha messo.
    const PRESETS = [
        ['preset_nastro',  'Nastro classico',   { mode: 'dag', orient: 'td', routing: 'curva', gapLayer: 56,  gapNode: 26, w: 168, h: 46 }],
        ['preset_compatto','Compatto',          { mode: 'dag', orient: 'td', routing: 'dritto', gapLayer: 40, gapNode: 16, w: 130, h: 42 }],
        ['preset_colonna', 'Colonna (da sx)',   { mode: 'dag', orient: 'lr', routing: 'curva', gapLayer: 70,  gapNode: 14, w: 168, h: 46 }],
        ['preset_lim',     'Arioso da LIM',     { mode: 'dag', orient: 'td', routing: 'orto',  gapLayer: 150, gapNode: 44, w: 190, h: 56 }],
        ['preset_bes',     'Leggibile BES/DSA', { mode: 'dag', orient: 'lr', routing: 'orto',  gapLayer: 110, gapNode: 26, w: 210, h: 60 }],
        ['preset_albero',  'Albero puro',       { mode: 'td',  orient: 'td', routing: 'curva', gapLayer: 56,  gapNode: 26, w: 168, h: 46 }]
    ];

    const S = { active: false, lastRes: null, lastNodes: null, focus: null };

    function profile() {
        if (!appState.studioProfile) appState.studioProfile = Object.assign({}, DEF_PROFILE);
        // profili salvati da versioni precedenti: campi nuovi ai default
        Object.keys(DEF_PROFILE).forEach(k => {
            if (appState.studioProfile[k] === undefined) appState.studioProfile[k] = DEF_PROFILE[k];
        });
        return appState.studioProfile;
    }
    function persist() {
        // StorageManager e' una const lessicale, NON e' su window: la guardia
        // giusta e' typeof (review 1/8 — regola nota: mai window.StorageManager)
        try { if (typeof StorageManager !== 'undefined') StorageManager.saveCurrentProject(); } catch (e) { /* best-effort */ }
    }

    /* ── dati dal db, normalizzati (i link possono avere source a oggetto) ── */
    function dataset() {
        const nodes = (appState.db.nodes || []).map(n => ({
            id: n.id, label: n.label || n.id, group: n.group, level: n.level,
            desc: String(n.desc || n.content || '').slice(0, 260)
        }));
        const links = (appState.db.links || []).map(l => ({
            source: (typeof l.source === 'object' && l.source) ? l.source.id : l.source,
            target: (typeof l.target === 'object' && l.target) ? l.target.id : l.target,
            rel: l.rel || '', isCross: !!l.isCross
        }));
        return { nodes, links };
    }

    // quali insiemi di archi hanno senso per QUESTA mappa (come nel banco)
    function edgeSetChoices(d) {
        const hasComm = d.nodes.some(n => /^COMM_/.test(n.id));
        const hasCross = d.links.some(l => l.isCross);
        if (hasComm) return [
            { v: 'sem', label: t('sv_set_sem', 'Solo relazioni') },
            { v: 'all', label: t('sv_set_comm', '+ comunità') }];
        if (hasCross) return [
            { v: 'all', label: t('sv_set_all', 'Gerarchia + cross') },
            { v: 'hier', label: t('sv_set_hier', 'Solo gerarchia') }];
        return [{ v: 'all', label: t('sv_set_tutti', 'Tutti gli archi') }];
    }
    function sliceSet(d, set) {
        if (set === 'hier') return { nodes: d.nodes, links: d.links.filter(l => !l.isCross) };
        if (set === 'sem') return {
            nodes: d.nodes.filter(n => !/^COMM_/.test(n.id)),
            links: d.links.filter(l => l.isCross)
        };
        return d;
    }

    function currentData() {
        const p = profile();
        const d0 = dataset();
        const choices = edgeSetChoices(d0);
        if (!choices.some(c => c.v === p.set)) p.set = choices[0].v;
        let d = sliceSet(d0, p.set);
        // profondità: taglia il sottografo e il layout si ricalcola su quello
        const dep = L().depths(d.nodes, d.links);
        let maxD = 0; dep.forEach(v => { if (v > maxD) maxD = v; });
        if (p.depth < maxD) {
            const keep = new Set(d.nodes.filter(n => (dep.get(n.id) || 0) <= p.depth).map(n => n.id));
            d = { nodes: d.nodes.filter(n => keep.has(n.id)),
                  links: d.links.filter(l => keep.has(l.source) && keep.has(l.target)) };
        }
        return { d, maxD, choices };
    }

    function compute(d, p) {
        const opt = {
            mode: p.mode, orient: p.orient, routing: p.routing,
            gapLayer: +p.gapLayer, gapNode: +p.gapNode, w: +p.w, h: +p.h,
            subRows: '1', ports: p.ports !== false, centerId: p.centerId || undefined
        };
        const res = L().run(d.nodes, d.links, window.d3, opt);
        const m = L().measure(res, res.kind === 'td');
        // ponticelli: hanno senso dove gli archi corrono in corridoi
        if (p.hops !== false && ['dag', 'td', 'colonne'].indexOf(res.kind) >= 0) {
            L().addHops(res, { r: Math.max(8, Math.min(14, Math.round(opt.gapNode / 2.2))) });
        }
        return { res, m };
    }

    /* ── overlay sul canvas ─────────────────────────────────────────────── */
    function ensureOverlay() {
        let ov = document.getElementById('studio-overlay');
        if (ov) return ov;
        const host = document.getElementById('d3-container');
        if (!host) return null;
        if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
        ov = document.createElement('div');
        ov.id = 'studio-overlay';
        ov.style.cssText = 'position:absolute;inset:0;z-index:5;background:#fafbff;' +
            'background-image:radial-gradient(#e2e8f0 1px,transparent 1px);background-size:22px 22px;';
        ov.innerHTML = '<svg id="studio-svg" style="width:100%;height:100%;display:block;cursor:grab"></svg>';
        host.appendChild(ov);
        return ov;
    }

    function render() {
        if (!S.active) return;
        const p = profile();
        const { d, maxD } = currentData();
        if (!d.nodes.length) return;
        const { res, m } = compute(d, p);
        S.lastRes = res; S.lastNodes = d.nodes;
        const handle = DRAW().draw(document.getElementById('studio-svg'), res, d.nodes, {
            d3: window.d3, prefix: 'stv',
            custom: (appState.db && appState.db.customColors) || {},
            fsNode: +p.fsNode, fsRel: +p.fsRel,
            labels: p.labels, hier: p.hier, bands: p.bands, hover: p.hl,
            onNodeContext: openNodeMenu
        });
        handle.fit('read');
        S.handle = handle;
        updateMetricsRow(res, m, d, maxD);
    }

    function updateMetricsRow(res, m, d, maxD) {
        const el = document.getElementById('sv-metrics');
        if (!el) return;
        const parts = [d.nodes.length + ' ' + t('sv_nodi', 'nodi'), d.links.length + ' ' + t('sv_archi', 'archi')];
        if (res.kind !== 'matrice') parts.push(m.incroci + ' ' + t('sv_incroci', 'incroci'));
        if (res.ponticelli) parts.push(res.ponticelli + ' ' + t('sv_ponti', 'ponticelli'));
        if (res.stats && res.stats.archiInvertiti) parts.push(res.stats.archiInvertiti + ' ' + t('sv_inv', 'invertiti'));
        el.textContent = parts.join(' · ');
        const ds = document.getElementById('sv-depth');
        if (ds) {
            ds.max = Math.max(1, maxD);
            if (+ds.value > maxD) ds.value = maxD;
            const out = document.getElementById('sv-depth-out');
            if (out) out.textContent = (+ds.value >= maxD) ? t('sv_tutti', 'tutti') : ('0–' + ds.value);
        }
    }

    /* ── comandi della sidebar ──────────────────────────────────────────── */
    const MOTORI = [
        ['dag', 'DAG'], ['td', 'Albero'], ['anelli', 'Anelli'],
        ['colonne', 'Colonne'], ['percorso', 'Percorso'], ['fasci', 'Fasci'], ['matrice', 'Matrice']
    ];
    function seg(k, opts, cur) {
        return '<div class="flex flex-wrap gap-1" data-sv-seg="' + k + '">' + opts.map(o =>
            '<button type="button" data-v="' + o[0] + '" class="px-2 py-1.5 rounded-lg text-[11px] font-bold border ' +
            (String(cur) === String(o[0]) ? 'bg-indigo-600 text-white border-indigo-600'
                : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50') + '">' + o[1] + '</button>'
        ).join('') + '</div>';
    }
    function fld(label, inner) {
        return '<div class="mb-3"><div class="text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-1">' +
            label + '</div>' + inner + '</div>';
    }
    function slider(k, min, max, step, val, suff) {
        return '<div class="flex items-center gap-2">' +
            '<input type="range" data-sv-sl="' + k + '" min="' + min + '" max="' + max + '" step="' + step + '" value="' + val + '" class="flex-1 accent-indigo-600">' +
            '<b class="text-[11px] tabular-nums w-11 text-right" data-sv-out="' + k + '">' + val + (suff || 'px') + '</b></div>';
    }

    function buildControls() {
        const panel = document.getElementById('sidebar-panel-vista');
        if (!panel) return;
        const p = profile();
        const { maxD, choices } = currentData();
        panel.innerHTML =
            '<div class="text-sm font-bold text-slate-600 mb-3 flex items-center gap-2">' +
            '<i data-lucide="layout-panel-top" class="w-4 h-4 text-indigo-400"></i>' +
            t('sv_title', 'Vista studio') + '</div>' +
            '<div class="flex flex-wrap gap-1.5 mb-3">' + PRESETS.map((pr, i) =>
                '<button type="button" data-sv-preset="' + i + '" class="px-2.5 py-1 rounded-full text-[10.5px] font-bold ' +
                'border border-dashed border-slate-300 bg-white text-slate-500 hover:bg-indigo-50 hover:border-indigo-400 hover:text-indigo-700">' +
                t('sv_' + pr[0], pr[1]) + '</button>').join('') + '</div>' +
            fld(t('sv_motore', 'Motore'), seg('mode', MOTORI, p.mode)) +
            fld(t('sv_orient', 'Orientamento'), seg('orient', [['td', t('sv_alto', "dall'alto ↓")], ['lr', t('sv_sinistra', 'da sinistra →')]], p.orient)) +
            fld(t('sv_routing', 'Instradamento archi'), seg('routing', [['curva', t('sv_curva', 'curva')], ['dritto', t('sv_dritto', 'dritto')], ['orto', t('sv_orto', 'ortogonale')]], p.routing)) +
            fld(t('sv_archi_usati', 'Archi usati'), seg('set', choices.map(c => [c.v, c.label]), p.set)) +
            fld(t('sv_labels', 'Linking words'), seg('labels', [['off', t('sv_no', 'no')], ['short', t('sv_brevi', 'brevi')], ['full', t('sv_intere', 'intere')]], p.labels)) +
            fld(t('sv_hier', 'Gerarchia visiva'), seg('hier', [['no', t('sv_no', 'no')], ['foglie', t('sv_foglie', 'foglie')], ['livello', t('sv_livello', 'livello')], ['taglia', t('sv_taglia', '+ taglia')]], p.hier)) +
            fld(t('sv_hl', 'Evidenzia al passaggio'), seg('hl', [['no', t('sv_hl_no', 'niente')], ['vicini', t('sv_vicini', 'vicini')], ['parenti', t('sv_parenti', 'parentela')]], p.hl)) +
            fld(t('sv_depth', 'Mostra fino al livello'),
                '<div class="flex items-center gap-2">' +
                '<input type="range" id="sv-depth" data-sv-sl="depth" min="0" max="' + Math.max(1, maxD) + '" step="1" value="' + Math.min(p.depth, maxD) + '" class="flex-1 accent-indigo-600">' +
                '<b class="text-[11px] tabular-nums w-11 text-right" id="sv-depth-out">' + ((p.depth >= maxD) ? t('sv_tutti', 'tutti') : ('0–' + p.depth)) + '</b></div>') +
            fld(t('sv_gap_layer', 'Spazio fra livelli'), slider('gapLayer', 20, 240, 2, p.gapLayer)) +
            fld(t('sv_gap_node', 'Spazio fra card'), slider('gapNode', 6, 90, 2, p.gapNode)) +
            fld(t('sv_card_w', 'Larghezza card'), slider('w', 80, 240, 2, p.w)) +
            fld(t('sv_card_h', 'Altezza card'), slider('h', 30, 90, 2, p.h)) +
            fld(t('sv_fs_node', 'Testo dei nodi'), slider('fsNode', 8, 20, 1, p.fsNode)) +
            fld(t('sv_fs_rel', 'Testo linking words'), slider('fsRel', 7, 16, 1, p.fsRel)) +
            '<label class="flex items-center gap-2 text-[11px] font-bold text-slate-500 mb-1.5 cursor-pointer">' +
            '<input type="checkbox" data-sv-chk="hops" ' + (p.hops !== false ? 'checked' : '') + ' class="accent-indigo-600">' +
            t('sv_hops', 'Ponticelli agli incroci') + '</label>' +
            '<label class="flex items-center gap-2 text-[11px] font-bold text-slate-500 mb-1.5 cursor-pointer">' +
            '<input type="checkbox" data-sv-chk="ports" ' + (p.ports !== false ? 'checked' : '') + ' class="accent-indigo-600">' +
            t('sv_ports', 'Frecce separate sul nodo') + '</label>' +
            '<label class="flex items-center gap-2 text-[11px] font-bold text-slate-500 mb-3 cursor-pointer">' +
            '<input type="checkbox" data-sv-chk="bands" ' + (p.bands ? 'checked' : '') + ' class="accent-indigo-600">' +
            t('sv_bands', 'Bande delle macro-aree') + '</label>' +
            '<div id="sv-metrics" class="text-[11px] text-slate-400 font-bold mb-3"></div>' +
            '<button type="button" id="sv-pdf" class="w-full py-2.5 rounded-xl bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-700 flex items-center justify-center gap-2">' +
            '<i data-lucide="file-down" class="w-4 h-4"></i>' + t('sv_pdf', 'Esporta PDF (A4)') + '</button>' +
            '<div class="text-[10px] text-slate-400 mt-2">' +
            t('sv_hint', 'Tasto destro su una card: Focus sui vicini o sulla parentela.') + '</div>';
        if (window.safeCreateIcons) window.safeCreateIcons();
        bindControls(panel);
    }

    function bindControls(panel) {
        if (panel._svBound) return;
        panel._svBound = true;
        panel.addEventListener('click', ev => {
            const pr = ev.target.closest('[data-sv-preset]');
            if (pr) {
                Object.assign(profile(), PRESETS[+pr.getAttribute('data-sv-preset')][2]);
                profile().centerId = null;
                persist(); buildControls(); render();
                return;
            }
            const b = ev.target.closest('[data-sv-seg] button');
            if (b) {
                const k = b.closest('[data-sv-seg]').getAttribute('data-sv-seg');
                profile()[k] = b.getAttribute('data-v');
                if (k === 'mode' && profile().mode !== 'anelli') profile().centerId = null;
                persist(); buildControls(); render();
                return;
            }
            if (ev.target.closest('#sv-pdf')) exportViewPdf();
        });
        panel.addEventListener('input', ev => {
            const sl = ev.target.closest('[data-sv-sl]');
            if (!sl) return;
            const k = sl.getAttribute('data-sv-sl');
            profile()[k] = +sl.value;
            const out = panel.querySelector('[data-sv-out="' + k + '"]');
            if (out) out.textContent = sl.value + 'px';
            persist(); render();
        });
        panel.addEventListener('change', ev => {
            const c = ev.target.closest('[data-sv-chk]');
            if (!c) return;
            profile()[c.getAttribute('data-sv-chk')] = c.checked;
            persist(); render();
        });
    }

    /* ── menu contestuale sulle card ────────────────────────────────────── */
    function closeMenu() {
        const m = document.getElementById('sv-ctxmenu');
        if (m) m.remove();
    }
    function openNodeMenu(ev, node) {
        closeMenu();
        const m = document.createElement('div');
        m.id = 'sv-ctxmenu';
        m.style.cssText = 'position:fixed;z-index:10000;background:#fff;border:1px solid #cbd5e1;' +
            'border-radius:11px;box-shadow:0 10px 30px rgba(15,23,42,.16);padding:5px;min-width:220px;' +
            "font-family:'Space Mono',monospace";
        const label = (node.label || node.id);
        const voci = [
            [t('sv_focus_vicini', 'Focus: vicini diretti'), () => openFocus(node.id, 'vicini')],
            [t('sv_focus_parenti', 'Focus: parentela'), () => openFocus(node.id, 'parenti')],
            [t('sv_anelli_qui', 'Anelli da qui'), () => {
                profile().mode = 'anelli'; profile().centerId = node.id;
                persist(); buildControls(); render();
            }],
            [t('sv_copia', 'Copia etichetta'), () => {
                if (navigator.clipboard) navigator.clipboard.writeText(label);
            }]
        ];
        m.innerHTML = '<div style="font-size:10px;letter-spacing:.05em;text-transform:uppercase;color:#64748b;' +
            'font-weight:700;padding:7px 11px 4px;max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' +
            label.replace(/</g, '&lt;') + '</div>' +
            voci.map((v, i) => '<button type="button" data-i="' + i + '" style="display:block;width:100%;text-align:left;' +
                'font:inherit;font-size:12.5px;font-weight:700;border:0;background:none;color:#334155;' +
                'padding:8px 11px;border-radius:8px;cursor:pointer">' + v[0] + '</button>').join('');
        document.body.appendChild(m);
        const r = m.getBoundingClientRect();
        m.style.left = Math.min(ev.clientX, innerWidth - r.width - 8) + 'px';
        m.style.top = Math.min(ev.clientY, innerHeight - r.height - 8) + 'px';
        m.addEventListener('click', e => {
            const b = e.target.closest('button[data-i]');
            if (b) { const run = voci[+b.getAttribute('data-i')][1]; closeMenu(); run(); }
        });
        setTimeout(() => {
            document.addEventListener('click', function once(e) {
                if (!e.target.closest('#sv-ctxmenu')) { closeMenu(); document.removeEventListener('click', once); }
            });
        }, 0);
    }

    /* ── finestra Focus ─────────────────────────────────────────────────── */
    function closeFocus() {
        const ov = document.getElementById('sv-focus-ov');
        if (ov) ov.remove();
        S.focus = null;
    }
    function openFocus(id, mode) {
        closeFocus();
        const { d } = currentData();
        const byId = new Map(d.nodes.map(n => [n.id, n]));
        const succ = new Map(), pred = new Map();
        d.nodes.forEach(n => { succ.set(n.id, []); pred.set(n.id, []); });
        d.links.forEach(l => {
            if (succ.has(l.source)) succ.get(l.source).push(l.target);
            if (pred.has(l.target)) pred.get(l.target).push(l.source);
        });
        const reach = (from, map) => {
            const o = new Set(), q = [from];
            while (q.length) {
                const u = q.pop();
                (map.get(u) || []).forEach(v => { if (!o.has(v)) { o.add(v); q.push(v); } });
            }
            return o;
        };
        const keep = mode === 'vicini'
            ? new Set([id].concat(succ.get(id) || [], pred.get(id) || []))
            : new Set([id].concat([...reach(id, succ)], [...reach(id, pred)]));
        const nodes = d.nodes.filter(n => keep.has(n.id));
        const links = d.links.filter(l => keep.has(l.source) && keep.has(l.target));

        // card grandi, etichette sempre visibili: qui si legge, non si naviga.
        // Niente ponticelli: pochi nodi, sarebbero solo rumore.
        const opt = { mode: 'dag', orient: nodes.length > 14 ? 'lr' : 'td', routing: 'orto',
                      ports: true, subRows: '1', w: 210, h: 64, gapNode: 30, gapLayer: 96 };
        const res = L().run(nodes, links, window.d3, opt);
        const m = L().measure(res, false);

        const centro = byId.get(id) || { id };
        const ov = document.createElement('div');
        ov.id = 'sv-focus-ov';
        ov.style.cssText = 'position:fixed;inset:0;z-index:9500;background:rgba(15,23,42,.45);' +
            'display:flex;align-items:center;justify-content:center;padding:26px;' +
            "font-family:'Space Mono',monospace";
        ov.innerHTML =
            '<div style="background:#fff;border-radius:18px;width:min(1180px,96vw);height:min(820px,92vh);' +
            'display:flex;flex-direction:column;overflow:hidden;box-shadow:0 24px 60px rgba(15,23,42,.3)">' +
            '<div style="display:flex;align-items:center;gap:10px;padding:13px 18px;border-bottom:1px solid #e2e8f0;flex-wrap:wrap">' +
            '<b style="font-size:15px">' + String(centro.label || id).replace(/</g, '&lt;') + '</b>' +
            '<span style="font-size:11px;color:#64748b;font-weight:700">' +
            (mode === 'vicini' ? t('sv_focus_sub_v', 'vicini diretti') : t('sv_focus_sub_p', 'parentela completa')) +
            ' · ' + nodes.length + ' ' + t('sv_nodi', 'nodi') + ' · ' + links.length + ' ' + t('sv_rel', 'relazioni') + '</span>' +
            '<span style="margin-left:auto;display:flex;gap:6px">' +
            '<button type="button" id="sv-f-vicini" class="pm-btn-cancel" style="padding:6px 11px;font-size:11px">' + t('sv_vicini', 'vicini') + '</button>' +
            '<button type="button" id="sv-f-parenti" class="pm-btn-cancel" style="padding:6px 11px;font-size:11px">' + t('sv_parenti', 'parentela') + '</button>' +
            '<button type="button" id="sv-f-pdf" class="pm-btn-primary" style="padding:6px 11px;font-size:11px">PDF</button>' +
            '<button type="button" id="sv-f-close" class="pm-btn-cancel" style="padding:6px 11px;font-size:11px">✕</button>' +
            '</span></div>' +
            '<svg id="sv-focus-svg" style="flex:1;min-height:0;width:100%;display:block;cursor:grab;' +
            'background-image:radial-gradient(#eef2f7 1px,transparent 1px);background-size:22px 22px"></svg>' +
            '<div style="padding:8px 18px;border-top:1px solid #e2e8f0;font-size:11px;color:#64748b">' +
            (nodes.length <= 1
                ? t('sv_focus_solo', 'Questo nodo non ha relazioni nell\'insieme di archi selezionato.')
                : t('sv_focus_foot', 'Ridisegnato a parte con più spazio. Il nodo di partenza è evidenziato.') +
                  ' ' + m.larghezza + '×' + m.altezza + 'px · ' + m.incroci + ' ' + t('sv_incroci', 'incroci')) +
            '</div></div>';
        document.body.appendChild(ov);

        const handle = DRAW().draw(document.getElementById('sv-focus-svg'), res, nodes, {
            d3: window.d3, prefix: 'svf',
            custom: (appState.db && appState.db.customColors) || {},
            fsNode: 13, fsRel: 11, labels: 'full', hier: 'no', evidenzia: id
        });
        handle.fit('all');
        S.focus = { id, mode, res, nodes, centro };

        ov.addEventListener('mousedown', e => { if (e.target === ov) closeFocus(); });
        document.getElementById('sv-f-close').onclick = closeFocus;
        document.getElementById('sv-f-vicini').onclick = () => openFocus(id, 'vicini');
        document.getElementById('sv-f-parenti').onclick = () => openFocus(id, 'parenti');
        document.getElementById('sv-f-pdf').onclick = () => exportPdfFromSvg(
            document.getElementById('sv-focus-svg'), handle.bbox,
            'Focus-' + safeName(centro.label || id) + '.pdf');
    }

    document.addEventListener('keydown', e => {
        if (e.key === 'Escape') { closeMenu(); closeFocus(); }
    });

    /* ── export PDF (A4 orizzontale, vettoriale) ────────────────────────── */
    function safeName(s) { return String(s).replace(/[^\wÀ-ɏ -]+/g, '').trim().slice(0, 60) || 'mappa'; }

    async function exportPdfFromSvg(svgEl, bbox, fileName) {
        try {
            const jsPDFCtor = window.jspdf && window.jspdf.jsPDF;
            if (!jsPDFCtor || !jsPDFCtor.API || !jsPDFCtor.API.svg) {
                if (window.showToast) window.showToast(t('sv_pdf_missing', 'Librerie PDF non disponibili'), 'error');
                return;
            }
            const pad = 40;
            const w = (bbox.maxX - bbox.minX) + pad * 2, h = (bbox.maxY - bbox.minY) + pad * 2;
            const clone = svgEl.cloneNode(true);
            clone.removeAttribute('style');
            clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
            clone.setAttribute('viewBox', (bbox.minX - pad) + ' ' + (bbox.minY - pad) + ' ' + w + ' ' + h);
            clone.setAttribute('width', w); clone.setAttribute('height', h);
            const inner = clone.querySelector('g');
            if (inner) inner.removeAttribute('transform');       // via lo zoom: si esporta il disegno intero
            // font: svg2pdf conosce i font standard di jsPDF, non Space Mono.
            // E non conosce paint-order: l'alone bianco delle etichette
            // finirebbe SOPRA il testo — nel PDF l'alone si toglie (review 1/8).
            clone.querySelectorAll('text, tspan').forEach(tx => {
                tx.setAttribute('font-family', 'Helvetica');
                tx.removeAttribute('paint-order');
                tx.removeAttribute('stroke');
                tx.removeAttribute('stroke-width');
                tx.removeAttribute('stroke-linejoin');
            });

            // A4 orizzontale con margini, disegno scalato per starci
            const doc = new jsPDFCtor({ orientation: 'landscape', unit: 'mm', format: 'a4' });
            const MW = 277, MH = 190, MX = 10, MY = 10;
            const k = Math.min(MW / w, MH / h);
            const dw = w * k, dh = h * k;
            await doc.svg(clone, { x: MX + (MW - dw) / 2, y: MY + (MH - dh) / 2, width: dw, height: dh });
            doc.save(fileName);
            if (window.showToast) window.showToast(t('sv_pdf_ok', 'PDF esportato'), 'success');
        } catch (e) {
            console.error('[StudioView] export PDF:', e);
            if (window.showToast) window.showToast(t('sv_pdf_err', 'Export PDF fallito: ') + e.message, 'error');
        }
    }
    function exportViewPdf() {
        if (!S.handle || !S.lastRes) return;
        const p = profile();
        exportPdfFromSvg(document.getElementById('studio-svg'), S.handle.bbox,
            'Studio-' + safeName(appState.rootNodeLabel || 'mappa') + '-' + p.mode + '.pdf');
    }

    /* ── ingresso e uscita ──────────────────────────────────────────────── */
    function enter() {
        if (!appState.db.nodes || !appState.db.nodes.length) return;
        S.active = true;
        ensureOverlay();
        const tab = document.getElementById('sidebar-tab-vista');
        if (tab) { tab.classList.remove('hidden'); tab.classList.add('flex'); }
        buildControls();
        if (window.switchSidebarTab) window.switchSidebarTab('vista');
        render();
        if (window.showToast) window.showToast(t('tst_studio_on', 'Vista studio: deterministica, da leggere. Il layout libero resta sotto.'), 'info');
    }
    function exit() {
        S.active = false;
        closeMenu(); closeFocus();
        const ov = document.getElementById('studio-overlay');
        if (ov) ov.remove();
        const tab = document.getElementById('sidebar-tab-vista');
        if (tab) { tab.classList.add('hidden'); tab.classList.remove('flex'); }
        if (window.switchSidebarTab) window.switchSidebarTab('structure');
    }

    window.MappAIStudioView = { enter, exit, render, openFocus, profile, _state: S };
    console.log('[MappAIStudioView] vista studio caricata (kill-switch: mappai_studio_view=0)');
})();
