// ==========================================================================
// mappai-jigsaw.js — Modalità JIGSAW (reader lock + enforcement scritture)
// --------------------------------------------------------------------------
// Modulo autonomo. Nessuna logica JIGSAW vive in app.js/main.js: lì solo hook
// sottili che delegano qui (applyLocks al load, guardWrite ai punti di scrittura).
//
// Legge i marker `_lock.yaml` per cartella ramo (Nodi/g{group}_{ramo}/_lock.yaml),
// caricati da main.js in loadRes.data.branchLocks, e deriva a runtime:
//   node._editable  → false se il ramo è bloccato in questa copia esportata
//   node._owner     → gruppo assegnato (badge MOC)
//   node._branchRole→ expert | locked | teacher
//   node._branchKey → chiave cartella ramo (per badge / debug)
// Nessuno di questi campi è persistito nel nodo.
//
// Gated da localStorage 'mappai_jigsaw_mode' (implica 'mappai_vault_branch_folders').
// OFF (default) → canEdit() sempre true → comportamento identico a oggi.
// Vedi docs/game-design/JIGSAW_MODE_SDS.md.
// ==========================================================================
(function () {
    'use strict';

    function _getAppState() {
        try { return (typeof appState !== 'undefined') ? appState : window.appState; }
        catch (e) { return window.appState; }
    }
    function _isOn() {
        try { return ['1', 'true'].includes(localStorage.getItem('mappai_jigsaw_mode')); }
        catch (e) { return false; }
    }
    // DEVE combaciare con _vaultSafeSeg in main.js (stessa chiave cartella).
    function _safeSeg(s) {
        return String(s || '').replace(/[^a-z0-9]/gi, '_').toLowerCase().slice(0, 40) || 'x';
    }
    function _byId(nodes) {
        const m = {}; (nodes || []).forEach(n => { m[n.id] = n; }); return m;
    }
    // Risale al genitore: usa node.parent; fallback sui link (target=node → source=parent).
    function _parentOf(node, byId, links) {
        if (node.parent && byId[node.parent]) return byId[node.parent];
        if (!links) return null;
        for (const l of links) {
            const s = typeof l.source === 'object' ? l.source.id : l.source;
            const t = typeof l.target === 'object' ? l.target.id : l.target;
            if (t === node.id && byId[s]) return byId[s];
        }
        return null;
    }

    // Chiave cartella ramo per un nodo — deve combaciare con _vaultBranchFolder in main.js.
    function branchKeyForNode(node, byId, links) {
        if (!node) return '';
        if (node.level === 0) return '_root';
        let cur = node, guard = 0;
        while (cur && cur.level > 1 && guard < 64) {
            const p = _parentOf(cur, byId, links);
            if (!p) break;
            cur = p; guard++;
        }
        if (!cur || cur.level !== 1) return '_root';
        return `g${cur.group != null ? cur.group : 0}_${_safeSeg(cur.label)}`;
    }

    let _lastLocks = null;

    // Applica i lock ai nodi. branchLocks = { 'g1_cause': {editable, owner, role, ...}, ... }
    function applyLocks(nodes, branchLocks) {
        _lastLocks = branchLocks || null;
        const on = _isOn();
        const byId = _byId(nodes);
        const st = _getAppState();
        const links = (st && st.db && st.db.links) || [];
        (nodes || []).forEach(n => {
            const key = branchKeyForNode(n, byId, links);
            n._branchKey = key;
            if (!on) { n._editable = true; n._owner = undefined; n._branchRole = undefined; return; }
            if (key === '_root') { n._editable = false; n._branchRole = 'teacher'; n._owner = undefined; return; }
            const lock = branchLocks ? branchLocks[key] : null;
            if (lock) {
                n._editable = lock.editable !== false;
                n._owner = lock.owner;
                n._branchRole = lock.role || (n._editable ? 'expert' : 'locked');
            } else {
                n._editable = true; n._owner = undefined; n._branchRole = undefined;
            }
        });
        _syncStudentUI();
        return nodes;
    }

    // Auto-attivazione: la modalità segue il vault caricato.
    // Vault con marker _lock.yaml → ON (copia studente); senza → OFF (mappa normale).
    function syncModeToVault(branchLocks) {
        const has = !!(branchLocks && Object.keys(branchLocks).length > 0);
        if (has && !_isOn()) {
            localStorage.setItem('mappai_jigsaw_mode', '1');
            console.log('%c🧩 JIGSAW auto-attivato (vault con marker _lock.yaml)', 'color:green;font-weight:bold');
        } else if (!has && _isOn()) {
            localStorage.removeItem('mappai_jigsaw_mode');
            console.log('%c⛔ JIGSAW auto-disattivato (vault senza lock)', 'color:#6366f1;font-weight:bold');
        }
        return has;
    }

    // Vero se il nodo è editabile (o se la modalità è spenta → tutto editabile).
    function canEdit(node) {
        if (!_isOn()) return true;
        return !node || node._editable !== false;
    }

    // Guardia per i punti di scrittura: ritorna true se consentito, altrimenti toast + false.
    function guardWrite(node, action) {
        if (canEdit(node)) return true;
        const owner = node && node._owner ? ` (${node._owner})` : '';
        try {
            if (window.showToast) window.showToast(`Ramo bloccato dal docente${owner} — solo studio in modalità JIGSAW`, 'error');
        } catch (e) {}
        return false;
    }

    function _resolveNode(ref) {
        const st = _getAppState();
        const nodes = (st && st.db && st.db.nodes) || [];
        const id = (ref && typeof ref === 'object') ? ref.id : ref;
        return nodes.find(n => n.id === id) || null;
    }

    // Gruppo dello studente in questa copia = owner del ramo editabile.
    function _myOwner() {
        const st = _getAppState();
        const nodes = (st && st.db && st.db.nodes) || [];
        const mine = nodes.find(n => n._editable === true && n._owner);
        return mine ? mine._owner : null;
    }

    // Vero se il link è modificabile (entrambi gli estremi editabili). Silenziosa: per il menu.
    function canEditLink(link) {
        if (!_isOn() || !link) return true;
        // Un ponte proposto dallo studente stesso resta suo: può modificarlo/eliminarlo
        // anche se l'altro estremo è in un ramo altrui.
        if (link.isBridge && link.bridgeAuthor && link.bridgeAuthor === _myOwner()) return true;
        return canEdit(_resolveNode(link.source)) && canEdit(_resolveNode(link.target));
    }

    // Ratifica docente: cambia lo stato di un ponte (proposed → ratified | rejected).
    function setBridgeStatus(link, status) {
        if (!link || !link.isBridge) return false;
        link.bridgeStatus = status;
        return true;
    }

    // ---- Expertise gate (SDS §5.2): prima di "insegnare" (proporre ponti) serve aver
    // studiato il proprio ramo. La fase esperto è il driver del beneficio (Vives 2025):
    // il gate difende la qualità del peer-teaching, criticità n.1 della letteratura.
    // Gated: default ON in modalità JIGSAW; spegni con 'mappai_jigsaw_expertise_gate'='0'.
    function _gateOn() {
        try { return _isOn() && localStorage.getItem('mappai_jigsaw_expertise_gate') !== '0'; }
        catch (e) { return false; }
    }
    function _gateThreshold() {
        let t = NaN;
        try { t = parseFloat(localStorage.getItem('mappai_jigsaw_gate_threshold')); } catch (e) {}
        return (t > 0 && t <= 1) ? t : 0.5;
    }
    // Copertura di studio del ramo proprio (dallo store padronanza, non dal semaforo).
    function expertiseStatus() {
        const st = _getAppState();
        const nodes = (st && st.db && st.db.nodes) || [];
        const own = nodes.filter(n => n._editable === true && n.level >= 1);
        const out = { available: false, total: own.length, studied: 0, consolidated: 0, coverage: 0 };
        if (!own.length || !window.MappAIMastery || !window.MappAIMastery.node) return out;
        own.forEach(n => {
            const agg = window.MappAIMastery.node(n.id);
            if (agg && agg.attempts > 0) {
                out.studied++;
                const lvl = window.MappAIMastery.masteryLevel(agg);
                if (lvl === 'acquisito' || lvl === 'fluente') out.consolidated++;
            }
        });
        out.available = true;
        out.coverage = out.total ? out.studied / out.total : 0;
        return out;
    }
    // Guardia: consenti il ponte solo con copertura di studio sufficiente sul proprio ramo.
    // Senza store o senza ramo proprio il gate è inerte (nessun falso blocco).
    function guardExpertise() {
        if (!_gateOn()) return true;
        const s = expertiseStatus();
        if (!s.available || !s.total) return true;
        const need = Math.ceil(s.total * _gateThreshold());
        if (s.studied >= need) return true;
        try {
            if (window.showToast) window.showToast(
                'Ponte bloccato: prima diventa esperto del tuo ramo — hai studiato ' + s.studied + '/' + s.total +
                ' nodi (servono almeno ' + need + '). Usa le attività di studio, poi riprova.', 'error');
        } catch (e) {}
        return false;
    }

    // Un ponte = link fra due rami diversi (creato dal proprio ramo verso un ramo altrui).
    function isBridgeLink(src, tgt) {
        return _isOn() && src && tgt && src._branchKey && tgt._branchKey && src._branchKey !== tgt._branchKey;
    }

    // Chiede la giustificazione e marca il link come ponte proposto, poi crea.
    function finalizeBridge(link, src, tgt, onCreate) {
        if (!guardExpertise()) return;
        const label = window.cleanLabel || (s => s);
        const q = 'Ponte inter-area: perché «' + label(src.label) + '» è legato a «' + label(tgt.label) + '»? (giustifica il legame)';
        const apply = (just) => {
            if (!just || !String(just).trim()) {
                if (window.showToast) window.showToast('Un ponte richiede una giustificazione', 'error');
                return;
            }
            link.isBridge = true;
            link.bridgeStatus = 'proposed';
            link.bridgeAuthor = src._owner || _myOwner() || 'studente';
            link.justification = String(just).trim();
            link.isCross = true;
            if (onCreate) onCreate();
            if (window.showToast) window.showToast('Ponte proposto — sarà ratificato dal docente', 'success');
        };
        if (window.showPrompt) window.showPrompt(q, '', apply);
        else apply(window.prompt ? window.prompt(q) : '');
    }

    // Guardia per modifica/eliminazione di un link: consentita solo se ENTRAMBI gli estremi
    // sono editabili (un link tra rami altrui non si tocca).
    function guardWriteLink(link, action) {
        if (canEditLink(link)) return true;
        try {
            if (window.showToast) window.showToast('Link tra rami bloccati — non modificabile in modalità JIGSAW', 'error');
        } catch (e) {}
        return false;
    }

    // Guardia per la creazione di nodi isolati (fuori da qualsiasi ramo): vietata in JIGSAW.
    // I concetti inter-area passano dai ponti (_ponti/), non da nodi isolati liberi.
    function guardIsolated(action) {
        if (!_isOn()) return true;
        try {
            if (window.showToast) window.showToast('In modalità JIGSAW crea nodi solo nel tuo ramo (i legami inter-area sono ponti)', 'error');
        } catch (e) {}
        return false;
    }

    // Info per il badge MOC del nested graph (Pattern 1).
    function lockInfo(node) {
        return {
            enabled: _isOn(),
            branchKey: node ? node._branchKey : null,
            editable: canEdit(node),
            owner: node ? node._owner : null,
            role: node ? node._branchRole : null
        };
    }

    // ---- Writer export docente: N copie, ognuna con un solo ramo sbloccato ----

    function _esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, c =>
            ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    }

    // Elenco dei rami L1 (id, label, chiave cartella, conteggio nodi del sottoalbero).
    function listBranches() {
        const st = _getAppState();
        const nodes = (st && st.db && st.db.nodes) || [];
        const byId = _byId(nodes);
        const links = (st && st.db && st.db.links) || [];
        return nodes.filter(n => n.level === 1).map(l1 => {
            const key = branchKeyForNode(l1, byId, links);
            const count = nodes.filter(n => branchKeyForNode(n, byId, links) === key).length;
            return { branchId: l1.id, branchLabel: l1.label, key: key, count: count };
        });
    }

    // Costruisce la mappa dei lock per UNA copia: solo thisBranchId è editable:true.
    function _buildLocks(nodes, assignments, thisBranchId, exportId) {
        const byId = _byId(nodes);
        const links = (_getAppState() && _getAppState().db && _getAppState().db.links) || [];
        const locks = {};
        nodes.filter(n => n.level === 1).forEach(l1 => {
            const key = branchKeyForNode(l1, byId, links);
            const asg = assignments.find(a => a.branchId === l1.id);
            const editable = l1.id === thisBranchId;
            locks[key] = {
                branchId: l1.id,
                branchLabel: l1.label,
                owner: asg ? asg.owner : undefined,
                editable: editable,
                role: editable ? 'expert' : 'locked',
                exportId: exportId,
                lockedAt: new Date().toISOString()
            };
        });
        return locks;
    }

    // Genera le copie sotto baseFolder. assignments = [{branchId, branchLabel, owner}, ...].
    async function exportCopies(baseFolder, assignments) {
        const st = _getAppState();
        const map = {
            extractionMode: st.extractionMode,
            rootNodeLabel: st.rootNodeLabel,
            nodes: st.db.nodes,
            links: st.db.links,
            customColors: (st.db && st.db.customColors) || {},
            userProfile: null,   // anonimato: le copie non portano profili/nomi
            branchFolders: true
        };
        const exportId = 'jigsaw-' + Date.now();
        const results = [];
        for (const asg of assignments) {
            const safe = String(asg.owner || asg.branchLabel || asg.branchId).replace(/[^a-z0-9]/gi, '_');
            const folder = baseFolder.replace(/[\/\\]+$/, '') + '/' + safe;
            let saveRes;
            try {
                saveRes = await window.electronAPI.saveVault({ folderPath: folder, mapData: Object.assign({}, map) });
            } catch (e) { results.push({ owner: asg.owner, ok: false, error: e.message }); continue; }
            if (!saveRes || !saveRes.success) { results.push({ owner: asg.owner, ok: false, error: saveRes && saveRes.error }); continue; }
            const locks = _buildLocks(map.nodes, assignments, asg.branchId, exportId);
            let lockRes;
            try { lockRes = await window.electronAPI.writeBranchLocks({ folderPath: folder, locks: locks }); }
            catch (e) { results.push({ owner: asg.owner, folder: folder, ok: false, error: e.message }); continue; }
            results.push({ owner: asg.owner, folder: folder, ok: !!(lockRes && lockRes.success) });
        }
        return results;
    }

    // Modale docente (stile .pm-* come timeline). Assegna rami→gruppi, poi genera.
    function openExportModal() {
        const st = _getAppState();
        if (!st || !st.db || !st.db.nodes || !st.db.nodes.length) {
            if (window.showToast) window.showToast('Nessuna mappa aperta', 'error'); return;
        }
        if (st.extractionMode === 'kg') {
            if (window.showToast) window.showToast('Export JIGSAW disponibile solo in MindMap', 'error'); return;
        }
        const branches = listBranches();
        if (!branches.length) {
            if (window.showToast) window.showToast('Nessun ramo L1 nella mappa', 'error'); return;
        }
        const existing = document.getElementById('jigsaw-export-modal');
        if (existing) existing.remove();

        const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
        let rows = '';
        branches.forEach((b, i) => {
            rows +=
                '<div class="pm-option" style="align-items:center;gap:12px;">' +
                    '<div style="flex:1;min-width:0;">' +
                        '<div class="pm-option-label">' + _esc(b.branchLabel) + '</div>' +
                        '<div class="pm-option-desc">' + b.count + ' nodi · ' + _esc(b.key) + '</div>' +
                    '</div>' +
                    '<input type="text" class="jigsaw-owner-input" data-bid="' + _esc(b.branchId) + '" ' +
                        'value="Gruppo ' + (letters[i] || (i + 1)) + '" ' +
                        'style="width:150px;padding:6px 8px;border:1px solid var(--border,#cbd5e1);border-radius:6px;background:var(--surface-2,#fff);color:inherit;">' +
                '</div>';
        });

        const modal = document.createElement('div');
        modal.id = 'jigsaw-export-modal';
        modal.className = 'fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-[3000] flex items-center justify-center p-4';
        modal.innerHTML =
            '<div class="bg-white rounded-2xl shadow-2xl w-[90vw] max-w-[560px] p-8 relative">' +
                '<button type="button" id="jigsaw-export-x" class="absolute top-6 right-6 text-slate-400 hover:text-slate-600 transition-colors z-10">' +
                    '<i data-lucide="x" class="w-6 h-6"></i>' +
                '</button>' +
                '<div class="space-y-6">' +
                    '<div class="flex items-center gap-3">' +
                        '<div class="pm-icon-wrap"><i data-lucide="puzzle" class="w-5 h-5 text-indigo-600"></i></div>' +
                        '<div>' +
                            '<div class="pm-title">Esporta copie JIGSAW</div>' +
                            '<div class="pm-subtitle">Una copia per gruppo: sblocca l\'editing di un solo ramo, lo studio resta su tutta la mappa.</div>' +
                        '</div>' +
                    '</div>' +
                    '<div class="pm-section">' +
                        '<span class="pm-section-title">Assegna i rami ai gruppi</span>' +
                        '<div class="space-y-3">' + rows + '</div>' +
                    '</div>' +
                    '<div class="flex gap-3 pt-2 border-t border-slate-100">' +
                        '<button type="button" id="jigsaw-export-cancel" class="pm-btn-cancel">Annulla</button>' +
                        '<button type="button" id="jigsaw-export-go" class="pm-btn-primary">' +
                            '<i data-lucide="download" class="w-4 h-4"></i> Scegli cartella e genera' +
                        '</button>' +
                    '</div>' +
                '</div>' +
            '</div>';
        document.body.appendChild(modal);
        if (window.safeCreateIcons) window.safeCreateIcons();

        const close = () => modal.remove();
        modal.addEventListener('click', e => { if (e.target === modal) close(); });
        modal.querySelector('#jigsaw-export-x').addEventListener('click', close);
        modal.querySelector('#jigsaw-export-cancel').addEventListener('click', close);
        modal.querySelector('#jigsaw-export-go').addEventListener('click', async () => {
            const inputs = [...modal.querySelectorAll('.jigsaw-owner-input')];
            const assignments = inputs.map(inp => {
                const bid = inp.getAttribute('data-bid');
                const b = branches.find(x => x.branchId === bid);
                return { branchId: bid, branchLabel: b ? b.branchLabel : bid, owner: (inp.value || '').trim() || (b ? b.branchLabel : bid) };
            });
            close();
            let pick;
            try { pick = await window.electronAPI.pickFolder(); } catch (e) { pick = null; }
            if (!pick || pick.canceled || !pick.folderPath) return;
            if (window.showLoadingOverlay) window.showLoadingOverlay(true, 'Genero le copie JIGSAW…');
            const res = await exportCopies(pick.folderPath, assignments);
            if (window.showLoadingOverlay) window.showLoadingOverlay(false);
            const ok = res.filter(r => r.ok).length;
            if (window.showToast) window.showToast('Esportate ' + ok + '/' + res.length + ' copie in ' + pick.folderPath, ok === res.length ? 'success' : 'error');
            console.log('[JIGSAW export]', res);
        });
    }

    // Lato studente (JIGSAW ON): nascondi Importa JSON (bypass bulk) e Esporta JIGSAW (roba docente).
    function _syncStudentUI() {
        const on = _isOn();
        try {
            const imp = document.getElementById('jigsaw-import-btn');
            if (imp) imp.style.display = on ? 'none' : '';
            const exp = document.getElementById('jigsaw-export-btn');
            if (exp) exp.style.display = on ? 'none' : '';
            const rec = document.getElementById('jigsaw-reconcile-btn');
            if (rec) rec.style.display = on ? 'none' : '';
            const gap = document.getElementById('jigsaw-gap-btn');
            if (gap) gap.style.display = on ? 'none' : '';
        } catch (e) {}
    }

    function _reapplyAndRender() {
        const st = _getAppState();
        if (st && st.db && st.db.nodes) applyLocks(st.db.nodes, _lastLocks);
        _syncStudentUI();
        try { if (window.renderGraph) window.renderGraph(); } catch (e) {}
    }

    // Toggle autonomi (non toccano dev-console-metrics.js).
    function enable() {
        localStorage.setItem('mappai_jigsaw_mode', '1');
        _reapplyAndRender();
        console.log('%c🧩 MODALITÀ JIGSAW ATTIVA', 'color:green;font-weight:bold');
        console.log('   Editing solo sui rami con _lock.yaml editable:true. _root = zona docente. Studio aperto ovunque.');
        return true;
    }
    function disable() {
        localStorage.removeItem('mappai_jigsaw_mode');
        _reapplyAndRender();
        console.log('%c⛔ MODALITÀ JIGSAW DISATTIVATA', 'color:#6366f1;font-weight:bold');
        return false;
    }
    function status() {
        const on = _isOn();
        console.log(`%cJIGSAW: ${on ? 'ON' : 'OFF'}`, `color:${on ? 'green' : '#6366f1'};font-weight:bold`);
        if (on) {
            const st = _getAppState();
            const nodes = (st && st.db && st.db.nodes) || [];
            const locked = nodes.filter(n => n._editable === false).length;
            console.log(`   ${nodes.length} nodi, ${locked} in sola lettura.`);
        }
        return on;
    }

    // ---- Ricomposizione docente: fondi N copie studenti nel master ----
    function _lid(v) { return v && typeof v === 'object' ? v.id : v; }

    // Puro: master {nodes,links} + copies [{nodes,links,branchLocks}] → master ricomposto.
    // Per ogni copia: sostituisce nel master i nodi del suo ramo editabile (versione arricchita)
    // + i link intra-ramo, e aggiunge i ponti RATIFICATI. Rami disgiunti → nessuna interferenza.
    function reconcile(master, copies) {
        const mLinks0 = master.links || [];
        const mById0 = {}; (master.nodes || []).forEach(n => mById0[n.id] = n);
        const mKey = n => branchKeyForNode(n, mById0, mLinks0);
        const nodeMap = {}; (master.nodes || []).forEach(n => nodeMap[n.id] = n);
        let links = mLinks0.slice();
        const summary = [];
        (copies || []).forEach(copy => {
            const locks = copy.branchLocks || {};
            const key = Object.keys(locks).find(k => locks[k] && locks[k].editable !== false && locks[k].role !== 'teacher');
            const owner = key ? locks[key].owner : null;
            if (!key) { summary.push({ owner: owner, ok: false, reason: 'nessun ramo editabile' }); return; }
            const cById = {}; (copy.nodes || []).forEach(n => cById[n.id] = n);
            const cKey = n => branchKeyForNode(n, cById, copy.links || []);
            const copyBranchNodes = (copy.nodes || []).filter(n => cKey(n) === key);
            const copyBranchIds = new Set(copyBranchNodes.map(n => n.id));
            const oldIds = new Set((master.nodes || []).filter(n => mKey(n) === key).map(n => n.id));
            oldIds.forEach(id => { if (!copyBranchIds.has(id)) delete nodeMap[id]; });
            copyBranchNodes.forEach(n => { nodeMap[n.id] = n; });
            links = links.filter(l => { const s = _lid(l.source), t = _lid(l.target); return !(oldIds.has(s) && oldIds.has(t)); });
            (copy.links || []).forEach(l => { const s = _lid(l.source), t = _lid(l.target); if (copyBranchIds.has(s) && copyBranchIds.has(t)) links.push(l); });
            let bridges = 0;
            (copy.links || []).forEach(l => { if (l.isBridge && l.bridgeStatus === 'ratified') { links.push(l); bridges++; } });
            summary.push({ owner: owner, ok: true, key: key, nodes: copyBranchNodes.length, bridges: bridges });
        });
        const seen = new Set();
        links = links.filter(l => { const k = _lid(l.source) + '|' + _lid(l.target) + '|' + (l.rel || ''); if (seen.has(k)) return false; seen.add(k); return true; });
        return { nodes: Object.values(nodeMap), links: links, summary: summary };
    }

    // Carica le copie da una cartella e ricompone nella mappa master corrente (in memoria).
    async function reconcileCopies(parentPath) {
        const st = _getAppState();
        if (!st || !st.db) return { summary: [] };
        const master = { nodes: st.db.nodes, links: st.db.links };
        const list = await window.electronAPI.listVaultSubfolders(parentPath);
        const copies = [];
        for (const sub of ((list && list.folders) || [])) {
            try { const r = await window.electronAPI.loadVault(sub.path); if (r && r.success) copies.push(r.data); } catch (e) {}
        }
        const merged = reconcile(master, copies);
        st.db.nodes = merged.nodes;
        st.db.links = merged.links;
        try { if (window.updateDegreeStats) window.updateDegreeStats(); if (window.renderGraph) window.renderGraph(); } catch (e) {}
        return merged;
    }

    // Modale docente: scegli cartella copie → ricomponi nel master corrente.
    function openReconcileModal() {
        const st = _getAppState();
        if (!st || !st.db || !st.db.nodes || !st.db.nodes.length) {
            if (window.showToast) window.showToast('Apri prima la mappa master', 'error'); return;
        }
        if (window.showConfirm) {
            window.showConfirm('Ricomponi copie JIGSAW',
                'Carica la cartella con i vault dei gruppi. I rami lavorati sostituiranno quelli del master corrente e i ponti ratificati verranno aggiunti. Salva il master dopo. Procedere?',
                async () => {
                    let pick; try { pick = await window.electronAPI.pickFolder(); } catch (e) { pick = null; }
                    if (!pick || pick.canceled || !pick.folderPath) return;
                    if (window.showLoadingOverlay) window.showLoadingOverlay(true, 'Ricomposizione in corso…');
                    const merged = await reconcileCopies(pick.folderPath);
                    if (window.showLoadingOverlay) window.showLoadingOverlay(false);
                    const ok = merged.summary.filter(s => s.ok).length;
                    const br = merged.summary.reduce((a, s) => a + (s.bridges || 0), 0);
                    if (window.showToast) window.showToast('Ricomposte ' + ok + ' copie · ' + br + ' ponti ratificati integrati. Salva il master.', 'success');
                    console.log('[JIGSAW reconcile]', merged.summary);
                });
        }
    }

    // ---- Gap analysis docente: confronta le copie coi rami del master (elenco lacune) ----
    // Serve la revisione privata pre-presentazione: il docente restituisce al gruppo
    // cosa manca PRIMA che l'errore si propaghi ai compagni (criticità 4.7 letteratura).

    // Puro: master {nodes,links} + copy {nodes,links,branchLocks} → lacune del ramo lavorato.
    function gapReport(master, copy) {
        const locks = copy.branchLocks || {};
        const key = Object.keys(locks).find(k => locks[k] && locks[k].editable !== false && locks[k].role !== 'teacher');
        if (!key) return { ok: false, reason: 'nessun ramo editabile nella copia' };
        const owner = locks[key].owner || key;
        const mById = {}; (master.nodes || []).forEach(n => { mById[n.id] = n; });
        const mBranch = (master.nodes || []).filter(n => branchKeyForNode(n, mById, master.links || []) === key);
        const cById = {}; (copy.nodes || []).forEach(n => { cById[n.id] = n; });
        const cBranch = (copy.nodes || []).filter(n => branchKeyForNode(n, cById, copy.links || []) === key);
        const cIds = new Set(cBranch.map(n => n.id));
        const mIds = new Set(mBranch.map(n => n.id));
        const _w = s => (String(s || '').match(/[a-zà-ù]+/gi) || []).length;
        return {
            ok: true, owner: owner, key: key,
            branchNodes: cBranch.length, masterNodes: mBranch.length,
            missing: mBranch.filter(n => !cIds.has(n.id)).map(n => n.label),          // nel master, spariti dalla copia
            thin: cBranch.filter(n => _w(n.desc || n.content) < 15).map(n => n.label), // descrizioni sottili
            added: cBranch.filter(n => !mIds.has(n.id)).map(n => n.label),             // arricchimenti del gruppo
            bridges: (function () {
                const br = (copy.links || []).filter(l => l.isBridge);
                return {
                    proposed: br.length,
                    unjustified: br.filter(b => !b.justification || String(b.justification).trim().length <= 15).length
                };
            })()
        };
    }

    function _gapHtml(reports) {
        const li = (arr, empty) => arr.length
            ? '<ul style="margin:4px 0 0;padding-left:18px;">' + arr.map(x => '<li style="font-size:13px;color:#475569;">' + _esc(x) + '</li>').join('') + '</ul>'
            : '<p style="font-size:13px;color:#16a34a;margin:2px 0;">' + empty + '</p>';
        let h = '<div style="max-width:820px;margin:0 auto;font-family:system-ui,sans-serif;color:#1e293b;padding:24px;">' +
            '<h1 style="font-size:24px;margin:0 0 4px;">Revisione JIGSAW — lacune per gruppo</h1>' +
            '<p style="color:#64748b;margin:0 0 20px;">Confronto col master · generato ' + new Date().toLocaleString('it') + ' · da restituire in colloquio privato, non davanti alla classe.</p>';
        reports.forEach(r => {
            if (!r.ok) { h += '<p style="color:#b91c1c;">Copia saltata: ' + _esc(r.reason || '') + '</p>'; return; }
            h += '<div style="border:1px solid #e2e8f0;border-radius:12px;padding:16px;margin:12px 0;page-break-inside:avoid;">' +
                '<h3 style="margin:0 0 6px;font-size:17px;">' + _esc(r.owner) + ' <span style="font-size:12px;color:#94a3b8;">' + _esc(r.key) + ' · ' + r.branchNodes + ' nodi (master: ' + r.masterNodes + ')</span></h3>' +
                '<p style="font-size:12px;font-weight:700;text-transform:uppercase;color:#b91c1c;margin:8px 0 0;">Nodi del master assenti</p>' + li(r.missing, 'Nessuno: il ramo copre tutto il master.') +
                '<p style="font-size:12px;font-weight:700;text-transform:uppercase;color:#b45309;margin:8px 0 0;">Descrizioni da approfondire (&lt;15 parole)</p>' + li(r.thin, 'Nessuna: descrizioni tutte sviluppate.') +
                '<p style="font-size:12px;font-weight:700;text-transform:uppercase;color:#0f766e;margin:8px 0 0;">Arricchimenti del gruppo</p>' + li(r.added, 'Nessun nodo aggiunto oltre il master.') +
                '<p style="font-size:13px;color:#475569;margin:8px 0 0;">Ponti proposti: <b>' + r.bridges.proposed + '</b>' +
                (r.bridges.unjustified ? ' · <span style="color:#b91c1c;">da giustificare meglio: ' + r.bridges.unjustified + '</span>' : ' · giustificazioni ok') + '</p>' +
                '</div>';
        });
        h += '</div>';
        return h;
    }

    // Con il master aperto: scegli la cartella delle copie → report lacune stampabile.
    async function openGapModal() {
        const st = _getAppState();
        if (!st || !st.db || !st.db.nodes || !st.db.nodes.length) {
            if (window.showToast) window.showToast('Apri prima la mappa master', 'error'); return;
        }
        let pick; try { pick = await window.electronAPI.pickFolder(); } catch (e) { pick = null; }
        if (!pick || pick.canceled || !pick.folderPath) return;
        if (window.showLoadingOverlay) window.showLoadingOverlay(true, 'Confronto le copie col master…');
        const master = { nodes: st.db.nodes, links: st.db.links };
        const reports = [];
        try {
            const list = await window.electronAPI.listVaultSubfolders(pick.folderPath);
            for (const sub of ((list && list.folders) || [])) {
                try { const r = await window.electronAPI.loadVault(sub.path); if (r && r.success) reports.push(gapReport(master, r.data)); } catch (e) {}
            }
        } catch (e) {}
        if (window.showLoadingOverlay) window.showLoadingOverlay(false);
        if (!reports.length) { if (window.showToast) window.showToast('Nessuna copia trovata nella cartella', 'error'); return; }
        const w = window.open('', '_blank');
        if (!w) { if (window.showToast) window.showToast('Popup bloccato: consenti le finestre', 'error'); return; }
        w.document.write('<!doctype html><html><head><meta charset="utf-8"><title>Revisione JIGSAW</title></head><body style="margin:0;background:#fff;">' + _gapHtml(reports) +
            '<div style="text-align:center;padding:16px;"><button onclick="window.print()" style="padding:8px 20px;border:1px solid #6366f1;background:#6366f1;color:#fff;border-radius:8px;cursor:pointer;">Stampa / PDF</button></div></body></html>');
        w.document.close();
        console.log('[JIGSAW gap]', reports);
    }

    window.MappAIJigsaw = {
        isEnabled: _isOn,
        branchKeyForNode: branchKeyForNode,
        syncModeToVault: syncModeToVault,
        applyLocks: applyLocks,
        canEdit: canEdit,
        guardWrite: guardWrite,
        guardWriteLink: guardWriteLink,
        canEditLink: canEditLink,
        isBridgeLink: isBridgeLink,
        finalizeBridge: finalizeBridge,
        setBridgeStatus: setBridgeStatus,
        guardIsolated: guardIsolated,
        lockInfo: lockInfo,
        listBranches: listBranches,
        exportCopies: exportCopies,
        openExportModal: openExportModal,
        reconcile: reconcile,
        reconcileCopies: reconcileCopies,
        openReconcileModal: openReconcileModal,
        expertiseStatus: expertiseStatus,
        guardExpertise: guardExpertise,
        gapReport: gapReport,
        openGapModal: openGapModal,
        enable: enable,
        disable: disable,
        status: status
    };

    console.log('%c🧩 MappAIJigsaw pronto', 'color:#7F77DD;font-weight:bold', '— MappAIJigsaw.enable() per attivare la modalità JIGSAW.');
})();
