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
        focusSlug: null,   // slug del gruppo isolato ("solo questa mappa"); null = tutti
        _prevDepth: null,  // valore slider profondità salvato prima del focus
        _prevDepthHidden: null, // stato hidden del controllo profondità prima del focus
        _pollTimer: null
    };

    // ── Profondità mappa base: porta a L0 in focus, ripristina all'uscita ────
    // applyVisualFilters onora lo slider solo se #level-filter-control è visibile,
    // quindi in focus lo mostro (così il collasso a L0 fa effetto) e poi ripristino.
    function setBaseDepthL0() {
        const sl = document.getElementById('level-slider');
        if (!sl) return;
        const ctrl = document.getElementById('level-filter-control');
        CT._prevDepth = sl.value;
        CT._prevDepthHidden = ctrl ? ctrl.classList.contains('hidden') : null;
        if (ctrl) ctrl.classList.remove('hidden');
        sl.value = 0;
        if (window.onLevelSliderInput) window.onLevelSliderInput(0);
    }
    function restoreBaseDepth() {
        const sl = document.getElementById('level-slider');
        if (sl && CT._prevDepth != null) {
            sl.value = CT._prevDepth;
            const ctrl = document.getElementById('level-filter-control');
            if (ctrl && CT._prevDepthHidden === true) ctrl.classList.add('hidden');
            if (window.onLevelSliderInput) window.onLevelSliderInput(sl.value);
        }
        CT._prevDepth = null; CT._prevDepthHidden = null;
    }

    // Isola un gruppo (o esce dal focus se già attivo su quello slug)
    function toggleFocus(slug) {
        if (CT.focusSlug === slug) {
            CT.focusSlug = null;
            restoreBaseDepth();
        } else {
            if (CT.focusSlug == null) setBaseDepthL0();  // salva la profondità solo al 1° focus
            CT.focusSlug = slug;
        }
        renderGroupsList();
        renderOverlay();
    }

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
        if (info && info.success) { CT.info = info; showDashboard(); }
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
            <div style="font-size:13px;color:#0f172a;margin-bottom:10px"><b>${t('cl_map', 'Mappa')}:</b> ${esc(name)}</div>
            <label style="display:block;font-size:11px;font-weight:700;color:#475569;margin-bottom:4px">${t('cl_login', 'Accesso allievi')}</label>
            <select id="cl-login" style="width:100%;border:1px solid #e2e8f0;border-radius:10px;padding:9px 11px;font:inherit;margin-bottom:14px">
                <option value="group">${t('cl_login_grp', 'A gruppi (3 emoji)')}</option>
                <option value="individual">${t('cl_login_ind', 'Individuale (roster della classe attiva)')}</option>
            </select>
            <label style="display:block;font-size:11px;font-weight:700;color:#475569;margin-bottom:4px">${t('cl_resume', 'Riprendi una sessione precedente')}</label>
            <select id="cl-resume" style="width:100%;border:1px solid #e2e8f0;border-radius:10px;padding:9px 11px;font:inherit;margin-bottom:14px">
                <option value="">${t('cl_resume_new', 'Nuova sessione')}</option>
            </select>
            ${window.MappAINetMode ? window.MappAINetMode.fieldHtml('cl') : ''}
            <button type="button" id="cl-start" style="background:#4f46e5;color:#fff;border:0;border-radius:10px;padding:10px 18px;cursor:pointer;font-weight:700;margin-top:14px">
                ${t('cl_start', 'Avvia sessione')}</button>
        `, '520px');
        const ovStart = document.getElementById('collab-hub-modal');
        if (window.MappAINetMode) window.MappAINetMode.bind(ovStart, 'cl');
        // Popola «Riprendi» con le sessioni salvate su disco (tutte, più recenti prima).
        populateResume(ovStart);
        const loginSel = ovStart.querySelector('#cl-login');
        const resumeSel = ovStart.querySelector('#cl-resume');
        // Riprendere una sessione ne eredita la modalità login (la detta il disco):
        // allinea e blocca il selettore modalità per evitare incoerenze.
        if (resumeSel) resumeSel.onchange = () => {
            const opt = resumeSel.selectedOptions[0];
            const mode = opt && opt.dataset ? opt.dataset.mode : '';
            if (resumeSel.value && mode && loginSel) { loginSel.value = mode; loginSel.disabled = true; }
            else if (loginSel) loginSel.disabled = false;
        };
        ovStart.querySelector('#cl-start').onclick = async () => {
            const resumeDir = resumeSel ? resumeSel.value : '';
            const loginMode = (loginSel || {}).value || 'group';
            let roster = [];
            if (loginMode === 'individual') {
                roster = rosterFromClass();
                if (!roster) return;
            }
            const netMode = window.MappAINetMode ? window.MappAINetMode.get() : 'lan';
            await doStart({ name, rootLabel: rootLabel(), loginMode, roster, netMode, resumeDir, className: activeClassName() });
        };
    }

    // Nome della classe attiva ('' se generico/assente).
    function activeClassName() {
        try {
            const c = window.MappAIClasses && window.MappAIClasses.getActive && window.MappAIClasses.getActive();
            return (c && c.name) ? String(c.name) : '';
        } catch (e) { return ''; }
    }
    function _normStr(v) { return String(v == null ? '' : v).trim().toLowerCase(); }

    // Riempie il menu «Riprendi» con le sessioni Lavagna su disco, FILTRATE alla
    // mappa corrente (riprendere una sessione di un'altra mappa caricherebbe una
    // board estranea) e alla classe attiva quando registrata. Le sessioni legacy
    // senza className restano visibili (match solo per mappa).
    async function populateResume(ov) {
        const sel = ov && ov.querySelector('#cl-resume');
        if (!sel || !window.electronAPI || !window.electronAPI.collabSessionsList) return;
        try {
            const r = await window.electronAPI.collabSessionsList();
            let list = (r && r.success && r.sessions) ? r.sessions : [];
            const st = S();
            const curMap = _normStr(st && (st.rootNodeLabel || rootLabel()));
            const curCls = _normStr(activeClassName());
            list = list.filter(s => _normStr(s.name) === curMap);
            if (curCls) list = list.filter(s => !s.className || _normStr(s.className) === curCls);
            list.forEach(s => {
                const d = s.startedAt ? new Date(s.startedAt) : null;
                const date = d && !isNaN(d) ? d.toLocaleDateString() : '';
                const modeLbl = s.loginMode === 'individual' ? t('cl_login_ind_s', 'individuale') : t('cl_login_grp_s', 'gruppi');
                const parts = [s.name || 'Lavagna', s.className, date].filter(Boolean).join(' · ');
                const grp = s.groupCount ? ' — ' + s.groupCount + (s.loginMode === 'individual' ? '👤' : '👥') : '';
                const opt = document.createElement('option');
                opt.value = s.dir;
                opt.dataset.mode = s.loginMode;
                opt.textContent = parts + ' (' + modeLbl + ')' + grp;
                sel.appendChild(opt);
            });
        } catch (e) { /* elenco non disponibile → resta solo "Nuova sessione" */ }
    }

    // Roster della classe attiva (login individuale) — null + toast se assente
    function rosterFromClass() {
        let cls = null;
        try { cls = window.MappAIClasses && window.MappAIClasses.getActive && window.MappAIClasses.getActive(); } catch (e) {}
        const roster = (cls && Array.isArray(cls.students)) ? cls.students.map(s => ({ emojiKey: s.emojiKey, num: s.num, name: s.name || '' })) : [];
        if (!roster.length) { toast(t('cl_no_roster', 'Nessuna classe attiva col roster. Scegli una classe o usa il login a gruppi.'), 'error'); return null; }
        return roster;
    }

    // Avvio sessione. Il naming progressivo lato main (…-00, …-01) garantisce che ogni
    // avvio parta pulito; una sessione precedente viene ripresa solo se ancora aperta e
    // con la stessa modalità login (crash-safety) → nessuna scelta da chiedere qui.
    async function doStart(payload) {
        const r = await window.electronAPI.collabStartSession(payload);
        if (!r || !r.success) { toast((r && r.error) || 'Errore avvio server', 'error'); return; }
        if (window.MappAINetMode) window.MappAINetMode.checkFallback(r);
        CT.info = r;
        // Registro sessioni (005): la mappa risulta "avviata" su questa classe.
        try {
            if (window.MappAITeach) window.MappAITeach.logSession({ map: rootLabel(), activity: 'lavagna' });
        } catch (e) { /* registro best-effort */ }
        closeModal();
        if (r.resumed) toast(t('tst_collab_resumed', 'Sessione RIPRESA: il QR precedente è ancora valido'), 'success');
        showDashboard();
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

    // ── Dashboard: renderer riusabile su più host (sidebar + floating + modale) ─
    // I contenuti (QR, gruppi, bottoni) sono montabili in un contenitore qualsiasi.
    // Gli elementi per-host usano CLASSI (non id) perché più host coesistono.
    // 006-lavagna-sidebar.
    CT.hosts = CT.hosts || [];   // contenitori attualmente montati

    function panelBodyHtml(opts) {
        opts = opts || {};
        const url = studentUrl();
        const qrSrc = qrDataUrl(url);
        const detachBtn = opts.detach
            ? `<button type="button" class="cl-detach" style="background:#eef2ff;color:#4f46e5;border:0;border-radius:10px;padding:8px 14px;cursor:pointer;font-weight:600;font-size:12.5px">${t('cl_detach', 'Stacca pannello')}</button>`
            : '';
        return `
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px;align-items:start">
                <div style="text-align:center">
                    ${qrSrc ? `<img class="cl-qr" src="${qrSrc}" alt="QR" style="width:180px;max-width:100%;height:auto;image-rendering:pixelated;border-radius:12px;border:1px solid #e2e8f0;cursor:zoom-in">`
                            : '<div style="color:#b45309;font-size:12px">QR non disponibile (libreria mancante)</div>'}
                    <div style="font-size:11.5px;color:#475569;margin-top:6px;word-break:break-all">${CT.info.urls.map(esc).join('<br>')}</div>
                    ${window.MappAINetMode ? window.MappAINetMode.lanLineHtml(CT.info) : ''}
                    <div style="font-size:10.5px;color:#94a3b8;margin-top:4px">${t('cl_qr_hint', 'Clic sul QR per ingrandirlo a schermo intero (LIM)')}</div>
                </div>
                <div>
                    <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#94a3b8;margin-bottom:8px">${t('cl_groups', 'Gruppi collegati')}</div>
                    <div class="cl-groups" style="display:flex;flex-direction:column;gap:6px">
                        <div style="color:#94a3b8;font-size:12.5px">${t('cl_waiting', 'In attesa dei gruppi…')}</div>
                    </div>
                </div>
            </div>
            <div style="display:flex;gap:8px;margin-top:14px;flex-wrap:wrap">
                <button type="button" class="cl-stop" style="background:#7f1d1d;color:#fecaca;border:0;border-radius:10px;padding:8px 14px;cursor:pointer;font-weight:700;font-size:12.5px">${t('cl_stop', 'Ferma sessione')}</button>
                <button type="button" class="cl-folder" style="background:#f1f5f9;color:#334155;border:0;border-radius:10px;padding:8px 14px;cursor:pointer;font-weight:600;font-size:12.5px">${t('cl_folder', 'Apri cartella')}</button>
                ${detachBtn}
            </div>`;
    }

    async function stopSession() {
        if (window.electronAPI && window.electronAPI.collabStopSession) await window.electronAPI.collabStopSession();
        if (CT.focusSlug) { CT.focusSlug = null; restoreBaseDepth(); }
        stopPolling(); removeOverlay();
        CT.info = null; CT.board = null;
        unmountAllHosts();
        toast(t('tst_collab_stopped', 'Sessione fermata — i contributi restano su disco'), 'success');
    }

    function wirePanel(host) {
        const qrImg = host.querySelector('.cl-qr');
        if (qrImg) qrImg.onclick = () => openQrFull(studentUrl());
        const stop = host.querySelector('.cl-stop');
        if (stop) stop.onclick = stopSession;
        const folder = host.querySelector('.cl-folder');
        if (folder) folder.onclick = () => window.electronAPI.collabOpenFolder && window.electronAPI.collabOpenFolder();
        const detach = host.querySelector('.cl-detach');
        if (detach) detach.onclick = openFloatingPanel;
        renderGroupsInto(host);
    }

    // Monta la dashboard dentro targetEl e la registra tra gli host aggiornati dal polling.
    function renderCollabPanel(targetEl, opts) {
        if (!targetEl) return;
        targetEl.innerHTML = panelBodyHtml(opts);
        if (CT.hosts.indexOf(targetEl) < 0) CT.hosts.push(targetEl);
        wirePanel(targetEl);
        if (window.safeCreateIcons) window.safeCreateIcons();
    }
    CT.renderCollabPanel = renderCollabPanel;

    // ── Host: sidebar (default) ──────────────────────────────────────────────
    function mountSidebarPanel() {
        const panel = document.getElementById('collab-sidebar-panel');
        if (!panel) return;
        panel.classList.remove('hidden');
        renderCollabPanel(panel, { detach: true });
        // porta l'utente sul tab Struttura per vedere la dashboard
        if (window.switchSidebarTab) window.switchSidebarTab('structure');
    }
    function unmountSidebarPanel() {
        const panel = document.getElementById('collab-sidebar-panel');
        if (panel) { panel.innerHTML = ''; panel.classList.add('hidden'); }
    }

    // ── Tab LIM (008): casa delle attività collaborative da lavagna ───────────
    // Elenco attività (Lavagna / Timeline) + dashboard attive montate qui.
    // La Lavagna resta anche nel tab Struttura (host coesistenti, zero regressioni).
    // act = chiave nel dispatch di renderLimSidebarTab (evita l'indice fragile)
    function limCard(act, icon, title, desc) {
        return '<button type="button" class="lim-card" data-act="' + esc(act) + '" style="display:flex;align-items:center;gap:12px;text-align:left;background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:12px 14px;cursor:pointer;width:100%;margin-bottom:8px">' +
            '<div style="width:38px;height:38px;border-radius:10px;background:#eef2ff;display:flex;align-items:center;justify-content:center;flex-shrink:0"><i data-lucide="' + icon + '" style="width:19px;height:19px;color:#4f46e5"></i></div>' +
            '<div style="flex:1"><div style="font-weight:800;color:#0f172a;font-size:13.5px">' + esc(title) + '</div>' +
            '<div style="font-size:11.5px;color:#94a3b8;margin-top:1px">' + esc(desc) + '</div></div></button>';
    }
    function limSection(title) {
        return '<div style="font-size:10px;text-transform:uppercase;font-weight:800;letter-spacing:.08em;color:#94a3b8;margin:14px 0 8px">' + esc(title) + '</div>';
    }
    CT.renderLimSidebarTab = function () {
        const panel = document.getElementById('sidebar-panel-lim');
        if (!panel) return;
        // classe attiva → mostrala nella card dedicata
        const activeCls = (window.MappAIClasses && window.MappAIClasses.getActive && window.MappAIClasses.getActive()) || null;
        const clsDesc = activeCls
            ? t('lim_class_active_on', 'Attiva:') + ' ' + (activeCls.name || '')
            : t('lim_class_active_d', 'Nessuna: la generazione resta generica');
        panel.innerHTML =
            '<div style="font-size:10px;text-transform:uppercase;font-weight:800;letter-spacing:.08em;color:#94a3b8;margin:2px 0 4px">' +
              esc(t('lim_title', 'Attività da LIM')) + '</div>' +
            '<div style="font-size:11.5px;color:#94a3b8;line-height:1.5;margin-bottom:4px">' +
              esc(t('lim_intro', 'Attività via QR: gli allievi entrano dal telefono sulla rete d\'aula.')) + '</div>' +
            // ── § Attività live (gli allievi entrano col QR) ─────────────────
            limSection(t('lim_sec_live', 'Attività live')) +
            limCard('live', 'radio', t('lv_card_quiz', 'Studio attivo live'), t('lv_card_quiz_d', 'Quiz V/F, scelta multipla o domande tue')) +
            limCard('board', 'presentation', t('cl_title', 'Lavagna collaborativa'), t('lim_board_d', 'I gruppi propongono nodi dal telefono')) +
            limCard('tutor', 'message-circle', t('lv_card_tutor', 'Chatta e Scrivi (Tutor AI)'), t('lv_card_tutor_d', 'Ogni allievo chatta col tutor e consegna un testo suo')) +
            limCard('timeline', 'calendar-clock', t('lv_card_timeline', 'Timeline'), t('lim_timeline_d', 'Completa o costruisci la timeline')) +
            // ── § Condivisione ───────────────────────────────────────────────
            limSection(t('lim_sec_share', 'Condivisione')) +
            limCard('materials', 'folder-down', t('lv_card_mat', 'Materiali di studio'), t('lv_card_mat_d', 'Pubblica file scaricabili via QR (senza login)')) +
            // ── § Classi ─────────────────────────────────────────────────────
            limSection(t('lim_sec_classes', 'Classi')) +
            limCard('class-switch', 'graduation-cap', t('lim_class_active', 'Classe attiva'), clsDesc) +
            limCard('class-accounts', 'users', t('ui_class_accounts', 'Account classi'), t('lim_classes_d', 'Crea e gestisci classi e credenziali')) +
            '<div id="lim-active" style="margin-top:6px"></div>';
        // dispatch: data-act → azione (guardia + fallback toast per funzioni assenti)
        const missing = function () { if (window.showToast) window.showToast(t('hub_fn_missing', 'Funzione non disponibile'), 'error'); };
        const actions = {
            'live': function () { if (window.MappAILive && window.MappAILive.openSetup) window.MappAILive.openSetup(); else missing(); },
            'board': function () { if (window.openCollabHub) window.openCollabHub(); else missing(); },
            'tutor': function () { if (window.MappAITutor && window.MappAITutor.open) window.MappAITutor.open(); else missing(); },
            'timeline': function () { if (window.MappAITimelineLive && window.MappAITimelineLive.openSetup) window.MappAITimelineLive.openSetup(); else missing(); },
            'materials': function () { if (window.MappAILive && window.MappAILive.openMaterials) window.MappAILive.openMaterials(); else missing(); },
            'class-switch': function () { if (window.openClassSwitcher) window.openClassSwitcher(); else missing(); },
            'class-accounts': function () { if (window.openClassAccountsModal) window.openClassAccountsModal(); else missing(); }
        };
        panel.querySelectorAll('.lim-card').forEach(function (btn) {
            btn.onclick = function () { const fn = actions[btn.getAttribute('data-act')]; if (fn) fn(); };
        });
        // sessione Lavagna attiva → monta la dashboard anche qui (host coesistente)
        const active = panel.querySelector('#lim-active');
        if (CT.info) {
            const host = document.createElement('div');
            host.style.cssText = 'border:1px solid #e2e8f0;border-radius:12px;background:#fff;padding:10px;margin-top:4px';
            active.appendChild(host);
            renderCollabPanel(host, { detach: true });
        }
        if (window.safeCreateIcons) window.safeCreateIcons();
    };

    // ── Host: pannello fluttuante collassabile (stacca per la LIM) ────────────
    function openFloatingPanel() {
        let fp = document.getElementById('collab-float-panel');
        if (!fp) {
            fp = document.createElement('div');
            fp.id = 'collab-float-panel';
            fp.style.cssText = 'position:fixed;right:18px;bottom:18px;z-index:9985;width:min(360px,90vw);background:#f8fafc;border:1px solid #e2e8f0;border-radius:14px;box-shadow:0 20px 50px -12px rgba(0,0,0,.35);overflow:hidden';
            fp.innerHTML = `<div class="cl-fp-head" style="display:flex;align-items:center;gap:8px;padding:9px 12px;background:#eef2ff;cursor:default">
                    <i data-lucide="presentation" style="width:16px;height:16px;color:#4f46e5"></i>
                    <span style="flex:1;font-weight:800;font-size:13px;color:#0f172a">${t('cl_title', 'Lavagna collaborativa')}</span>
                    <button type="button" class="cl-fp-collapse" title="${t('cl_collapse', 'Collassa')}" style="background:none;border:0;cursor:pointer;color:#64748b;font-size:16px;line-height:1;padding:2px 6px">–</button>
                    <button type="button" class="cl-fp-close" title="${t('cl_dock', 'Riaggancia alla sidebar')}" style="background:none;border:0;cursor:pointer;color:#94a3b8;font-size:18px;line-height:1;padding:2px 6px">×</button>
                </div>
                <div class="cl-fp-body" style="padding:14px 16px"></div>`;
            document.body.appendChild(fp);
            fp.querySelector('.cl-fp-collapse').onclick = toggleFloatingCollapse;
            fp.querySelector('.cl-fp-close').onclick = closeFloatingPanel;
        }
        const body = fp.querySelector('.cl-fp-body');
        body.style.display = '';
        renderCollabPanel(body, { detach: false });
    }
    function toggleFloatingCollapse() {
        const fp = document.getElementById('collab-float-panel');
        if (!fp) return;
        const body = fp.querySelector('.cl-fp-body');
        const btn = fp.querySelector('.cl-fp-collapse');
        const collapsed = body.style.display === 'none';
        body.style.display = collapsed ? '' : 'none';
        if (btn) btn.textContent = collapsed ? '–' : '+';
    }
    function closeFloatingPanel() {
        const fp = document.getElementById('collab-float-panel');
        if (!fp) return;
        const body = fp.querySelector('.cl-fp-body');
        const i = CT.hosts.indexOf(body);
        if (i >= 0) CT.hosts.splice(i, 1);
        fp.remove();
    }

    // ── Host: modale storico (kill-switch reversibilità) ─────────────────────
    function openDashboardModal() {
        const ov = modal('presentation', t('cl_title', 'Lavagna collaborativa'), `<div class="cl-modal-body"></div>`);
        renderCollabPanel(ov.querySelector('.cl-modal-body'), { detach: false });
    }

    // Smonta tutti gli host (stop sessione / cambio mappa)
    function unmountAllHosts() {
        CT.hosts = [];
        unmountSidebarPanel();
        closeFloatingPanel();
        closeModal();
    }

    // Decide dove mostrare la dashboard: sidebar (default) o modale (kill-switch).
    function showDashboard() {
        CT.hosts = [];
        let legacy = false;
        try { legacy = localStorage.getItem('mappai_collab_legacy_modal') === '1'; } catch (e) { }
        if (legacy) openDashboardModal();
        else mountSidebarPanel();
        startPolling();
    }
    CT.showDashboard = showDashboard;

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
                        if (!CT.layers[slug]) CT.layers[slug] = { visible: true, label: g.emojiLabel || g.nick };
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

    // Aggiorna la lista gruppi in TUTTI gli host montati (sidebar + floating + modale).
    function renderGroupsList() {
        // rimuovi gli host non più nel DOM (floating chiuso, ecc.)
        CT.hosts = (CT.hosts || []).filter(h => h && document.body.contains(h));
        CT.hosts.forEach(renderGroupsInto);
    }

    function groupsHtml() {
        const groups = (CT.board && CT.board.groups) || [];
        if (!groups.length) return `<div style="color:#94a3b8;font-size:12.5px">${t('cl_waiting', 'In attesa dei gruppi…')}</div>`;
        return groups.map(g => {
            const slug = C.slugify(g.nick);
            const lay = CT.layers[slug] || (CT.layers[slug] = { visible: true, label: g.emojiLabel || g.nick });
            const focused = CT.focusSlug === slug;
            const doneBadge = g.done
                ? `<span title="${t('cl_done_tip', 'Il gruppo ha premuto Fatto')}" style="font-size:10px;font-weight:800;color:#166534;background:#dcfce7;border-radius:999px;padding:2px 7px">✓</span>`
                : '';
            // "sblocca": visibile solo se il gruppo ha consegnato (azzera il ✓)
            const reopenBtn = g.done
                ? `<button type="button" class="cl-reopen" data-slug="${slug}" title="${t('cl_reopen_tip', 'Rimetti il gruppo «in corso»: azzera il segno di consegna. Gli allievi continuano a costruire.')}" style="background:#fef3c7;color:#92400e;border:0;border-radius:8px;padding:4px 9px;cursor:pointer;font-size:11px;font-weight:700;display:inline-flex;align-items:center;gap:3px"><i data-lucide="unlock" style="width:11px;height:11px"></i>${t('cl_reopen', 'Sblocca')}</button>`
                : '';
            return `<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:7px 10px">
                <span style="width:12px;height:12px;border-radius:50%;background:${g.color};flex:0 0 auto"></span>
                <input value="${esc(lay.label)}" data-slug="${slug}" class="cl-rename" style="flex:1;min-width:60px;border:0;background:none;font-weight:700;font-size:12.5px;color:#0f172a;outline:none">
                ${doneBadge}
                <span style="font-size:11px;color:#94a3b8">${(g.nodes || []).length}n · ${(g.links || []).length}⇢</span>
                <button type="button" class="cl-focus" data-slug="${slug}" title="${focused ? t('cl_focus_off_tip', 'Esci dall\'isolamento e ripristina la profondità') : t('cl_focus_tip', 'Isola questo gruppo e porta la mappa base a L0')}" style="background:${focused ? '#f59e0b' : '#f1f5f9'};color:${focused ? '#fff' : '#334155'};border:0;border-radius:8px;padding:4px 9px;cursor:pointer;font-size:11px;font-weight:700">${t('cl_focus', 'SOLO')}</button>
                <button type="button" class="cl-toggle" data-slug="${slug}" title="${t('cl_toggle_tip', 'Mostra/nascondi questo layer sulla mappa')}" style="background:${lay.visible ? '#4f46e5' : '#e2e8f0'};color:${lay.visible ? '#fff' : '#64748b'};border:0;border-radius:8px;padding:4px 9px;cursor:pointer;font-size:11px;font-weight:700">${lay.visible ? 'ON' : 'OFF'}</button>
                ${reopenBtn}
                <button type="button" class="cl-export" data-slug="${slug}" title="${t('cl_export_tip', 'Scarica il layer come mappa MappAI (JSON importabile)')}" style="background:#f1f5f9;color:#334155;border:0;border-radius:8px;padding:4px 9px;cursor:pointer;font-size:11px;font-weight:700">JSON</button>
            </div>`;
        }).join('');
    }

    function renderGroupsInto(host) {
        const box = host && host.querySelector('.cl-groups');
        if (!box) return;
        box.innerHTML = groupsHtml();
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
        box.querySelectorAll('.cl-focus').forEach(b => { b.onclick = () => toggleFocus(b.dataset.slug); });
        box.querySelectorAll('.cl-export').forEach(b => { b.onclick = () => exportLayer(b.dataset.slug); });
        box.querySelectorAll('.cl-reopen').forEach(b => { b.onclick = () => reopenGroup(b.dataset.slug); });
        if (window.safeCreateIcons) window.safeCreateIcons();
    }

    // "Sblocca" un gruppo consegnato: azzera done sul server → il ✓ sparisce al
    // prossimo tick. Lo studente continua a inviare contributi (nessun lock).
    function reopenGroup(slug) {
        if (!CT.info) return;
        const g = (CT.board && CT.board.groups || []).find(x => C.slugify(x.nick) === slug);
        if (!g) return;
        fetch('http://127.0.0.1:' + CT.info.port + '/api/reopen', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ adminToken: CT.info.adminToken, nick: g.nick })
        }).then(() => {
            g.done = false;            // aggiornamento ottimistico immediato
            renderGroupsList();
        }).catch(() => { /* il prossimo tick riallineerà */ });
    }

    // ── Export layer → JSON mappa MappAI (vault-dinamico) ───────────────────
    function exportLayer(slug) {
        const g = (CT.board.groups || []).find(x => C.slugify(x.nick) === slug);
        if (!g) return;
        const lay = CT.layers[slug];
        const graph = C.layerToGraph(CT.board.rootLabel, lay.label || g.nick, g.nodes, g.links);
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
            const lay = CT.layers[slug] || (CT.layers[slug] = { visible: true, label: grp.emojiLabel || grp.nick });
            if (!lay) return;
            // in focus mostro SOLO il gruppo isolato; altrimenti rispetto il toggle ON/OFF
            if (CT.focusSlug) { if (slug !== CT.focusSlug) return; }
            else if (!lay.visible) return;
            // collegamenti del gruppo (sotto i suoi nodi), con la keyword al centro.
            // Un estremo può essere il ROOT (concetto centrale): non è nei nodi del
            // gruppo → va risolto al centro (rx,ry), come fa endpoint() lato studente.
            const endpoint = (id) => id === C.ROOT_ID
                ? { x: 0, y: 0 }
                : (grp.nodes || []).find(n => n.id === id);
            (grp.links || []).forEach(l => {
                const a = endpoint(l.source);
                const b = endpoint(l.target);
                if (!a || !b) return;
                const ax = rx + a.x * R, ay = ry + a.y * R;
                const bx = rx + b.x * R, by = ry + b.y * R;
                layer.append('line')
                    .attr('x1', ax).attr('y1', ay).attr('x2', bx).attr('y2', by)
                    .attr('stroke', '#94a3b8').attr('stroke-width', 1.5);
                layer.append('text')
                    .attr('x', (ax + bx) / 2).attr('y', (ay + by) / 2 - 5)
                    .attr('text-anchor', 'middle')
                    .attr('font-size', 10).attr('font-weight', 700).attr('fill', '#64748b')
                    .attr('stroke', '#ffffff').attr('stroke-width', 2.4)
                    .attr('paint-order', 'stroke fill')
                    .text(l.rel);
            });
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
