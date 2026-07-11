/*
 * mappai-collab-teacher.js — Lavagna Collaborativa, lato docente (003)
 * ---------------------------------------------------------------------
 * - window.openCollabHub(): modale di avvio/gestione sessione (QR + URL +
 *   istruzioni rete + dashboard gruppi con polling 3s).
 * - Overlay a LAYER sul canvas D3: i nodi di ogni gruppo compaiono attorno
 *   al nodo root col colore del gruppo; toggle e rinomina per gruppo.
 *   MAI dentro appState.db (zero contaminazione: g#collab-overlay separato,
 *   ridisegnato a ogni tick di polling e rimosso allo spegnimento).
 * - Export layer: JSON mappa MappAI (vault-dinamico-<gruppo>.json) via
 *   MappAICollabCore.layerToGraph → importabile con Apri/Importa JSON.
 *
 * IPC: collabStartSession/collabStopSession/collabSessionInfo (preload).
 * Il polling dei dati va DIRETTO a http://127.0.0.1:<port> con l'adminToken
 * (stessa macchina): IPC solo per accendere/spegnere il server.
 */
(function () {
    'use strict';

    const C = window.MappAICollabCore;
    const t = (k, f) => (window.t ? window.t(k, f) : f);
    const toast = (m, k) => (window.showToast ? window.showToast(m, k || 'info') : console.log(m));

    function S() {
        try { return (typeof appState !== 'undefined') ? appState : window.appState; }
        catch (e) { return window.appState; }
    }

    const CT = window.MappAICollabTeacher = {
        info: null,        // { port, token, adminToken, urls, dir, name }
        board: null,       // ultimo /api/status .board
        layers: {},        // slug → { visible, label }
        _pollTimer: null
    };

    function esc(s) {
        const d = document.createElement('div'); d.textContent = s == null ? '' : String(s);
        return d.innerHTML;
    }

    // ── Modale base (linguaggio visivo dei modali hub) ─────────────────────
    function modal(icon, title, bodyHtml, maxWidth) {
        const overlay = document.createElement('div');
        overlay.id = 'collab-hub-modal';
        overlay.style.cssText = 'position:fixed;inset:0;z-index:9990;background:rgba(15,23,42,.45);display:flex;align-items:center;justify-content:center;padding:18px';
        overlay.innerHTML = `<div style="background:#f8fafc;border-radius:16px;box-shadow:0 25px 60px -12px rgba(0,0,0,.35);width:min(${maxWidth || '780px'},94vw);max-height:88vh;overflow-y:auto;padding:20px 24px" role="dialog" aria-modal="true">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
                <div style="display:flex;align-items:center;gap:10px;font-weight:800;font-size:17px;color:#0f172a">
                    <i data-lucide="${icon}" style="width:22px;height:22px;color:#4f46e5"></i>${title}</div>
                <button type="button" class="ch-close" style="background:none;border:none;cursor:pointer;color:#94a3b8;font-size:22px;line-height:1;padding:4px" aria-label="Chiudi">×</button>
            </div>${bodyHtml}`;
        overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
        overlay.querySelector('.ch-close').onclick = () => overlay.remove();
        document.body.appendChild(overlay);
        if (window.safeCreateIcons) window.safeCreateIcons();
        return overlay;
    }

    function closeModal() {
        const m = document.getElementById('collab-hub-modal');
        if (m) m.remove();
    }

    // ── Entry point ─────────────────────────────────────────────────────────
    window.openCollabHub = async function () {
        const st = S();
        if (!st || !st.db || !st.db.nodes || !st.db.nodes.length) {
            toast(t('tst_collab_need_map', 'Apri una mappa per avviare la lavagna'), 'warning');
            return;
        }
        if (!window.electronAPI || !window.electronAPI.collabStartSession) {
            toast(t('tst_collab_electron', 'La lavagna collaborativa richiede l\'app desktop'), 'warning');
            return;
        }
        const info = await window.electronAPI.collabSessionInfo();
        if (info && info.success) { CT.info = info; openDashboard(); }
        else openStart();
    };

    // ── Avvio sessione ──────────────────────────────────────────────────────
    function rootLabel() {
        const st = S();
        const root = (st.db.nodes || []).find(n => n.level === 0);
        return (root && window.cleanLabel ? window.cleanLabel(root.label) : (root && root.label))
            || st.rootNodeLabel || 'Tema centrale';
    }

    function openStart() {
        const name = S().rootNodeLabel || rootLabel();
        modal('presentation', t('cl_title', 'Lavagna collaborativa'), `
            <p style="font-size:13px;color:#475569;line-height:1.55;margin:0 0 10px">
                ${t('cl_intro', 'I gruppi entrano dal telefono via QR e propongono nodi attorno al tema centrale. I contributi appaiono qui come layer separati, senza toccare la mappa.')}
            </p>
            <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:10px 12px;font-size:12px;color:#92400e;margin-bottom:14px">
                ${t('cl_net_note', 'Rete: usa l\'hotspot del PC o un router d\'aula. Le reti scolastiche spesso bloccano il traffico tra dispositivi.')}
            </div>
            <div style="font-size:13px;color:#0f172a;margin-bottom:14px"><b>${t('cl_map', 'Mappa')}:</b> ${esc(name)}</div>
            <button type="button" id="cl-start" style="background:#4f46e5;color:#fff;border:0;border-radius:10px;padding:10px 18px;cursor:pointer;font-weight:700">
                ${t('cl_start', 'Avvia sessione')}</button>
        `, '520px').querySelector('#cl-start').onclick = async () => {
            const r = await window.electronAPI.collabStartSession({ name, rootLabel: rootLabel() });
            if (!r || !r.success) { toast((r && r.error) || 'Errore avvio server', 'error'); return; }
            CT.info = r;
            closeModal();
            if (r.resumed) toast(t('tst_collab_resumed', 'Sessione RIPRESA: il QR precedente è ancora valido'), 'success');
            openDashboard();
        };
    }

    // ── QR ──────────────────────────────────────────────────────────────────
    function qrDataUrl(text, cell) {
        if (typeof qrcode !== 'function') return null;
        const qr = qrcode(0, 'M');
        qr.addData(text); qr.make();
        return qr.createDataURL(cell || 7, 8);
    }

    function studentUrl() {
        // il redirect "/" del server aggiunge il token: il QR resta corto
        return (CT.info.urls && CT.info.urls[0]) || ('http://localhost:' + CT.info.port);
    }

    // ── Dashboard ───────────────────────────────────────────────────────────
    function openDashboard() {
        const url = studentUrl();
        const qrSrc = qrDataUrl(url);
        const ov = modal('presentation', t('cl_title', 'Lavagna collaborativa'), `
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:18px;align-items:start">
                <div style="text-align:center">
                    ${qrSrc ? `<img id="cl-qr" src="${qrSrc}" alt="QR" style="width:220px;height:220px;image-rendering:pixelated;border-radius:12px;border:1px solid #e2e8f0;cursor:zoom-in">`
                            : '<div style="color:#b45309;font-size:12px">QR non disponibile (libreria mancante)</div>'}
                    <div style="font-size:12px;color:#475569;margin-top:6px;word-break:break-all">${CT.info.urls.map(esc).join('<br>')}</div>
                    <div style="font-size:11px;color:#94a3b8;margin-top:4px">${t('cl_qr_hint', 'Clic sul QR per ingrandirlo a schermo intero (LIM)')}</div>
                </div>
                <div>
                    <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#94a3b8;margin-bottom:8px">${t('cl_groups', 'Gruppi collegati')}</div>
                    <div id="cl-groups" style="display:flex;flex-direction:column;gap:6px">
                        <div style="color:#94a3b8;font-size:12.5px">${t('cl_waiting', 'In attesa dei gruppi…')}</div>
                    </div>
                </div>
            </div>
            <div style="display:flex;gap:8px;margin-top:18px;flex-wrap:wrap">
                <button type="button" id="cl-stop" style="background:#7f1d1d;color:#fecaca;border:0;border-radius:10px;padding:8px 14px;cursor:pointer;font-weight:700;font-size:12.5px">${t('cl_stop', 'Ferma sessione')}</button>
                <button type="button" id="cl-folder" style="background:#f1f5f9;color:#334155;border:0;border-radius:10px;padding:8px 14px;cursor:pointer;font-weight:600;font-size:12.5px">${t('cl_folder', 'Apri cartella')}</button>
                <span style="flex:1"></span>
                <span style="font-size:11px;color:#94a3b8;align-self:center">${t('cl_live_note', 'I layer si aggiornano da soli. Chiudi pure: la sessione resta attiva.')}</span>
            </div>
        `);
        const qrImg = ov.querySelector('#cl-qr');
        if (qrImg) qrImg.onclick = () => openQrFull(url);
        ov.querySelector('#cl-stop').onclick = async () => {
            await window.electronAPI.collabStopSession();
            stopPolling(); removeOverlay();
            CT.info = null; CT.board = null;
            closeModal();
            toast(t('tst_collab_stopped', 'Sessione fermata — i contributi restano su disco'), 'success');
        };
        ov.querySelector('#cl-folder').onclick = () => window.electronAPI.collabOpenFolder && window.electronAPI.collabOpenFolder();
        startPolling();
    }

    function openQrFull(url) {
        const big = qrDataUrl(url, 14);
        if (!big) return;
        const ov = document.createElement('div');
        ov.style.cssText = 'position:fixed;inset:0;z-index:10001;background:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;cursor:zoom-out';
        ov.innerHTML = `<img src="${big}" alt="QR" style="width:min(70vh,70vw);image-rendering:pixelated">
            <div style="font-size:22px;font-weight:800;color:#0f172a">${esc(url)}</div>`;
        ov.onclick = () => ov.remove();
        document.body.appendChild(ov);
    }

    // ── Polling stato (3 s) + lista gruppi + overlay ────────────────────────
    function startPolling() {
        stopPolling();
        const tick = async () => {
            if (!CT.info) return;
            try {
                const r = await fetch('http://127.0.0.1:' + CT.info.port + '/api/status?admin=' + encodeURIComponent(CT.info.adminToken));
                if (r.ok) {
                    const data = await r.json();
                    CT.board = data.board;
                    (CT.board.groups || []).forEach(g => {
                        const slug = C.slugify(g.nick);
                        if (!CT.layers[slug]) CT.layers[slug] = { visible: true, label: g.nick };
                    });
                    renderGroupsList();
                    renderOverlay();
                }
            } catch (e) { /* server spento o in riavvio: il prossimo tick riprova */ }
            CT._pollTimer = setTimeout(tick, 3000);
        };
        tick();
    }
    function stopPolling() {
        if (CT._pollTimer) { clearTimeout(CT._pollTimer); CT._pollTimer = null; }
    }

    function renderGroupsList() {
        const box = document.getElementById('cl-groups');
        if (!box || !CT.board) return;
        const groups = CT.board.groups || [];
        if (!groups.length) return;
        box.innerHTML = groups.map(g => {
            const slug = C.slugify(g.nick);
            const lay = CT.layers[slug];
            return `<div style="display:flex;align-items:center;gap:8px;background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:7px 10px">
                <span style="width:12px;height:12px;border-radius:50%;background:${g.color};flex:0 0 auto"></span>
                <input value="${esc(lay.label)}" data-slug="${slug}" class="cl-rename" style="flex:1;min-width:60px;border:0;background:none;font-weight:700;font-size:12.5px;color:#0f172a;outline:none">
                <span style="font-size:11px;color:#94a3b8">${(g.nodes || []).length} ${t('cl_nodes', 'nodi')}</span>
                <button type="button" class="cl-toggle" data-slug="${slug}" title="${t('cl_toggle_tip', 'Mostra/nascondi questo layer sulla mappa')}" style="background:${lay.visible ? '#4f46e5' : '#e2e8f0'};color:${lay.visible ? '#fff' : '#64748b'};border:0;border-radius:8px;padding:4px 9px;cursor:pointer;font-size:11px;font-weight:700">${lay.visible ? 'ON' : 'OFF'}</button>
                <button type="button" class="cl-export" data-slug="${slug}" title="${t('cl_export_tip', 'Scarica il layer come mappa MappAI (JSON importabile)')}" style="background:#f1f5f9;color:#334155;border:0;border-radius:8px;padding:4px 9px;cursor:pointer;font-size:11px;font-weight:700">JSON</button>
            </div>`;
        }).join('');
        box.querySelectorAll('.cl-toggle').forEach(b => {
            b.onclick = () => {
                const lay = CT.layers[b.dataset.slug];
                lay.visible = !lay.visible;
                renderGroupsList(); renderOverlay();
            };
        });
        box.querySelectorAll('.cl-rename').forEach(inp => {
            inp.onchange = () => { CT.layers[inp.dataset.slug].label = inp.value.trim() || inp.dataset.slug; renderOverlay(); };
        });
        box.querySelectorAll('.cl-export').forEach(b => {
            b.onclick = () => exportLayer(b.dataset.slug);
        });
    }

    // ── Export layer → JSON mappa MappAI (vault-dinamico) ───────────────────
    function exportLayer(slug) {
        const g = (CT.board.groups || []).find(x => C.slugify(x.nick) === slug);
        if (!g) return;
        const lay = CT.layers[slug];
        const graph = C.layerToGraph(CT.board.rootLabel, lay.label || g.nick, g.nodes);
        const blob = new Blob([JSON.stringify(graph, null, 2)], { type: 'application/json' });
        const a = document.createElement('a');
        a.download = 'vault-dinamico-' + slug + '.json';
        a.href = URL.createObjectURL(blob);
        a.click();
        toast(t('tst_collab_exported', 'Layer esportato — importalo con Apri/Importa JSON'), 'success');
    }

    // ── Overlay sul canvas D3 ────────────────────────────────────────────────
    // g#collab-overlay dentro il g principale della mappa: eredita zoom/pan.
    // Ridisegnato a ogni tick; niente scritture su appState.db.
    function removeOverlay() {
        const g = document.getElementById('collab-overlay');
        if (g) g.remove();
    }

    function renderOverlay() {
        removeOverlay();
        if (!CT.board || typeof d3 === 'undefined') return;
        const svg = d3.select('#map-svg');
        if (svg.empty()) return;
        const inner = svg.select('g');
        if (inner.empty()) return;
        const st = S();
        const root = (st.db.nodes || []).find(n => n.level === 0) || (st.db.nodes || [])[0];
        const rx = (root && isFinite(root.x)) ? root.x : 0;
        const ry = (root && isFinite(root.y)) ? root.y : 0;
        const R = 420;   // raggio dell'anello dei contributi attorno al root

        const layer = inner.append('g').attr('id', 'collab-overlay');
        (CT.board.groups || []).forEach(grp => {
            const slug = C.slugify(grp.nick);
            const lay = CT.layers[slug];
            if (!lay || !lay.visible) return;
            (grp.nodes || []).forEach(n => {
                const sz = C.SIZES[n.size] || C.SIZES.m;
                const gx = rx + n.x * R, gy = ry + n.y * R;
                const node = layer.append('g').attr('transform', `translate(${gx},${gy})`);
                node.append('rect')
                    .attr('x', -sz.w / 2).attr('y', -sz.h / 2)
                    .attr('width', sz.w).attr('height', sz.h).attr('rx', 10)
                    .attr('fill', n.color).attr('fill-opacity', 0.92)
                    .attr('stroke', grp.color).attr('stroke-width', 3);
                const words = String(n.text).split(' ');
                const lines = [''];
                words.forEach(w => {
                    const cur = lines[lines.length - 1];
                    if ((cur + ' ' + w).trim().length > 20 && cur) lines.push(w);
                    else lines[lines.length - 1] = (cur + ' ' + w).trim();
                });
                const txt = node.append('text')
                    .attr('text-anchor', 'middle')
                    .attr('font-size', 12).attr('font-weight', 700).attr('fill', '#0f172a');
                lines.slice(0, 3).forEach((ln, i) => {
                    txt.append('tspan').attr('x', 0)
                        .attr('dy', i === 0 ? (-(Math.min(lines.length, 3) - 1) * 0.55) + 'em' : '1.1em')
                        .text(ln);
                });
                node.append('text')
                    .attr('y', sz.h / 2 + 13).attr('text-anchor', 'middle')
                    .attr('font-size', 9).attr('font-weight', 700).attr('fill', grp.color)
                    .text(lay.label || grp.nick);
            });
        });
    }

    console.log('[MappAI] mappai-collab-teacher.js caricato ✓');
})();
