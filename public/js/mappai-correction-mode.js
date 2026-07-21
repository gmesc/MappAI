/*
 * mappai-correction-mode.js — "Revisione mappa": UI per raccogliere correzioni
 * ANNOTATE da docenti/tester e produrre un log ground-truth (correzioni.json)
 * per tarare la pipeline di generazione.
 *
 * Modello (scelto per sicurezza + qualità del dato):
 *   1) start(): fa uno SNAPSHOT normalizzato della mappa corrente.
 *   2) l'utente corregge liberamente con TUTTI gli strumenti esistenti
 *      (elimina nodo, Fondi con…, Cambia Link, modale edit, ritipizza relazioni).
 *      Nessun codice di editing viene intercettato → zero rischio di regressioni.
 *   3) review(): diffMaps(snapshot, corrente) via MappAICorrectionCore → elenco
 *      di operazioni inferite; l'utente CONFERMA/aggiusta il codice-motivo e
 *      aggiunge una nota per riga.
 *   4) save(): scrive correzioni.json nel vault + un riepilogo per le analitiche.
 *
 * Caricato DOPO mappai-correction-core.js. Kill-switch: il bottone in header
 * compare solo se localStorage 'mappai_correction_mode' === '1'. L'API console
 * (window.MappAICorrection.*) è sempre disponibile per i tester.
 *
 * ⚠️ Da verificare in Electron vivo: mount del bottone, modale annota, scrittura
 * correzioni.json nel vault attivo. Il core è invece coperto da test Node.
 */
(function () {
    'use strict';
    var CC = (typeof window !== 'undefined') && window.MappAICorrectionCore;
    function _t(k, f) { try { return (window.t ? window.t(k, f) : f); } catch (e) { return f; } }
    function _state() { try { return (typeof appState !== 'undefined') ? appState : window.appState; } catch (e) { return window.appState; } }
    function _eid(x) { return (x && typeof x === 'object') ? x.id : x; }

    var _snapshot = null;   // { nodes, links, at }
    var _active = false;

    // Normalizza appState.db in {nodes, links} di soli primitivi (i link D3
    // possono avere source/target come oggetti mutati → li appiattiamo).
    function _normalize(db) {
        var nodes = (db.nodes || []).map(function (n) {
            return { id: n.id, label: n.label, level: n.level, group: n.group, desc: (n.desc || n.content || '') };
        });
        var links = (db.links || []).map(function (l) {
            return { source: _eid(l.source), target: _eid(l.target), rel: l.rel, isCross: !!l.isCross };
        });
        return { nodes: nodes, links: links };
    }

    function _toast(msg, type) { if (window.showToast) window.showToast(msg, type || 'info'); else console.log('[Revisione]', msg); }

    function start() {
        var st = _state(); if (!st || !st.db) { _toast(_t('cr_no_map', 'Nessuna mappa aperta'), 'error'); return false; }
        _snapshot = _normalize(st.db);
        _snapshot.at = (st.rootNodeLabel || '');
        _active = true;
        _renderBanner();
        _toast(_t('cr_started', 'Revisione avviata: correggi la mappa liberamente, poi «Rivedi correzioni».'), 'success');
        return true;
    }

    function cancel() {
        _active = false; _snapshot = null; _removeBanner();
        _toast(_t('cr_cancelled', 'Revisione annullata'), 'info');
    }

    // Costruisce il log inferito confrontando snapshot e stato corrente.
    function _computeLog() {
        if (!CC) { _toast('MappAICorrectionCore assente', 'error'); return null; }
        if (!_snapshot) { _toast(_t('cr_no_snap', 'Avvia prima la revisione'), 'error'); return null; }
        var st = _state();
        var after = _normalize(st.db);
        return CC.diffMaps(_snapshot, after, { map: st.rootNodeLabel || _snapshot.at || 'mappa' });
    }

    // ── Modale di annotazione ────────────────────────────────────────────────
    function review() {
        var log = _computeLog(); if (!log) return;
        if (!log.ops.length) { _toast(_t('cr_no_changes', 'Nessuna modifica rilevata rispetto all\'avvio'), 'info'); return; }

        var old = document.getElementById('correction-modal'); if (old) old.remove();
        var overlay = document.createElement('div');
        overlay.id = 'correction-modal';
        overlay.className = 'pm-overlay';
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,.55);z-index:100000;display:flex;align-items:center;justify-content:center;padding:24px;';

        var rowsHtml = log.ops.map(function (o, i) {
            var reasons = CC.opReasons(o.op);
            var opts = reasons.map(function (r) {
                return '<option value="' + r + '"' + (r === o.reason ? ' selected' : '') + '>' + CC.reasonLabel(r) + '</option>';
            }).join('');
            var tgt = o.into ? (o.target + ' → ' + o.into) : (o.target || '');
            var detail = o.note ? (' · ' + o.note) : (o.after && o.after.rel ? (' · ' + (o.after.source || '') + ' → ' + (o.after.target || '')) : '');
            return '<tr data-i="' + i + '">' +
                '<td style="padding:6px 8px;white-space:nowrap;"><span class="cr-op cr-op-' + o.op + '">' + (CC.OPS[o.op] ? CC.OPS[o.op].label : o.op) + '</span></td>' +
                '<td style="padding:6px 8px;font-family:monospace;font-size:12px;color:#475569;">' + tgt + detail + '</td>' +
                '<td style="padding:6px 8px;"><select class="cr-reason" style="width:100%;padding:4px;border:1px solid #cbd5e1;border-radius:6px;">' + opts + '</select></td>' +
                '<td style="padding:6px 8px;"><input class="cr-note" placeholder="' + _t('cr_note_ph', 'nota (perché)…') + '" style="width:100%;padding:4px;border:1px solid #cbd5e1;border-radius:6px;" value="' + (o.note || '').replace(/"/g, '&quot;') + '"></td>' +
                '</tr>';
        }).join('');

        var s = CC.summarize(log);
        var summaryChips = Object.keys(s.byOp).map(function (k) {
            return '<span style="display:inline-block;background:#eef2ff;color:#3730a3;border-radius:12px;padding:2px 10px;margin:2px;font-size:12px;">' + (CC.OPS[k] ? CC.OPS[k].label : k) + ': ' + s.byOp[k] + '</span>';
        }).join('');

        overlay.innerHTML =
            '<div class="pm-modal" style="background:#fff;border-radius:16px;max-width:1080px;width:100%;max-height:88vh;display:flex;flex-direction:column;box-shadow:0 20px 60px rgba(0,0,0,.3);">' +
            '  <div class="pm-header" style="padding:18px 22px;border-bottom:1px solid #e2e8f0;display:flex;align-items:center;gap:12px;">' +
            '    <span class="pm-icon-wrap" style="background:#e0e7ff;border-radius:10px;padding:8px;"><i data-lucide="clipboard-check"></i></span>' +
            '    <div><div class="pm-title" style="font-weight:700;font-size:17px;">' + _t('cr_title', 'Revisione correzioni') + '</div>' +
            '    <div class="pm-subtitle" style="color:#64748b;font-size:13px;">' + _t('cr_subtitle', 'Conferma il motivo di ogni correzione. Il log serve a migliorare la generazione.') + '</div></div>' +
            '  </div>' +
            '  <div style="padding:10px 22px;border-bottom:1px solid #f1f5f9;">' + summaryChips + '</div>' +
            '  <div style="overflow:auto;padding:8px 14px;">' +
            '    <table style="width:100%;border-collapse:collapse;font-size:13px;"><thead><tr style="text-align:left;color:#64748b;">' +
            '      <th style="padding:6px 8px;">' + _t('cr_col_op', 'Operazione') + '</th><th style="padding:6px 8px;">' + _t('cr_col_target', 'Nodo/Relazione') + '</th>' +
            '      <th style="padding:6px 8px;width:230px;">' + _t('cr_col_reason', 'Motivo') + '</th><th style="padding:6px 8px;width:260px;">' + _t('cr_col_note', 'Nota') + '</th>' +
            '    </tr></thead><tbody>' + rowsHtml + '</tbody></table>' +
            '  </div>' +
            '  <div class="pm-footer" style="padding:16px 22px;border-top:1px solid #e2e8f0;display:flex;justify-content:flex-end;gap:10px;">' +
            '    <button class="pm-btn-cancel" id="cr-cancel" style="padding:9px 16px;border-radius:9px;border:1px solid #cbd5e1;background:#fff;cursor:pointer;">' + _t('cr_close', 'Chiudi') + '</button>' +
            '    <button class="pm-btn-primary" id="cr-save" style="padding:9px 18px;border-radius:9px;border:none;background:#4f46e5;color:#fff;cursor:pointer;font-weight:600;">' + _t('cr_save', 'Salva log nel vault') + '</button>' +
            '  </div>' +
            '</div>';
        document.body.appendChild(overlay);
        if (window.safeCreateIcons) window.safeCreateIcons();

        overlay.addEventListener('click', function (e) { if (e.target === overlay) overlay.remove(); });
        document.getElementById('cr-cancel').onclick = function () { overlay.remove(); };
        document.getElementById('cr-save').onclick = function () {
            // riscrivi motivi/note confermati sul log
            overlay.querySelectorAll('tbody tr').forEach(function (tr) {
                var i = +tr.getAttribute('data-i');
                var rSel = tr.querySelector('.cr-reason'), nInp = tr.querySelector('.cr-note');
                if (log.ops[i]) {
                    log.ops[i].reason = rSel.value;
                    log.ops[i].note = nInp.value.trim();
                    log.ops[i].inferred = false;   // confermato da umano
                }
            });
            save(log);
            overlay.remove();
        };
    }

    // ── Salvataggio nel vault ────────────────────────────────────────────────
    function save(log) {
        if (!log) { log = _computeLog(); if (!log) return; }
        var st = _state();
        log.confirmedBy = 'tester';
        var payload = CC.serialize(log);
        var vaultPath = st && st.activeVaultPath;
        if (vaultPath && window.electronAPI && window.electronAPI.saveVaultFile) {
            window.electronAPI.saveVaultFile({ vaultPath: vaultPath, relPath: 'correzioni.json', text: payload })
                .then(function () { _toast(_t('cr_saved', 'Log salvato: correzioni.json nel vault'), 'success'); })
                .catch(function (e) { _download(payload); _toast(_t('cr_saved_dl', 'Vault non scrivibile: log scaricato'), 'info'); });
        } else {
            _download(payload);
            _toast(_t('cr_saved_dl2', 'Nessun vault: log scaricato'), 'info');
        }
        _active = false; _removeBanner();
    }

    function _download(text) {
        try {
            var blob = new Blob([text], { type: 'application/json' });
            var a = document.createElement('a');
            a.href = URL.createObjectURL(blob); a.download = 'correzioni.json';
            document.body.appendChild(a); a.click(); a.remove();
        } catch (e) { console.log(text); }
    }

    // ── Banner + bottone header (gated) ──────────────────────────────────────
    function _renderBanner() {
        _removeBanner();
        var b = document.createElement('div');
        b.id = 'correction-banner';
        b.style.cssText = 'position:fixed;bottom:18px;left:50%;transform:translateX(-50%);z-index:99999;background:#4f46e5;color:#fff;border-radius:999px;padding:8px 16px;display:flex;gap:10px;align-items:center;box-shadow:0 8px 24px rgba(79,70,229,.4);font-size:14px;';
        b.innerHTML = '<i data-lucide="pencil-ruler"></i><span>' + _t('cr_banner', 'Revisione attiva') + '</span>' +
            '<button id="cr-b-review" style="background:#fff;color:#4f46e5;border:none;border-radius:999px;padding:5px 12px;cursor:pointer;font-weight:600;">' + _t('cr_review', 'Rivedi correzioni') + '</button>' +
            '<button id="cr-b-cancel" style="background:transparent;color:#fff;border:1px solid rgba(255,255,255,.5);border-radius:999px;padding:5px 10px;cursor:pointer;">' + _t('cr_cancel_btn', 'Annulla') + '</button>';
        document.body.appendChild(b);
        if (window.safeCreateIcons) window.safeCreateIcons();
        document.getElementById('cr-b-review').onclick = review;
        document.getElementById('cr-b-cancel').onclick = cancel;
    }
    function _removeBanner() { var b = document.getElementById('correction-banner'); if (b) b.remove(); }

    function mountButton() {
        if (localStorage.getItem('mappai_correction_mode') !== '1') return;
        var host = document.getElementById('header-utils') || document.body;
        if (document.getElementById('cr-header-btn')) return;
        var btn = document.createElement('button');
        btn.id = 'cr-header-btn';
        btn.type = 'button';
        btn.title = _t('cr_btn_tip', 'Revisione mappa (raccogli correzioni annotate)');
        btn.style.cssText = 'display:inline-flex;align-items:center;gap:6px;padding:6px 10px;border-radius:8px;border:1px solid #c7d2fe;background:#eef2ff;color:#3730a3;cursor:pointer;font-size:13px;';
        btn.innerHTML = '<i data-lucide="clipboard-pen"></i><span>' + _t('cr_btn', 'Revisione') + '</span>';
        btn.onclick = function () { if (_active) review(); else start(); };
        host.appendChild(btn);
        if (window.safeCreateIcons) window.safeCreateIcons();
    }

    // Analitiche aggregate: legge più correzioni.json e somma i motivi (per i
    // tester). Riceve un array di log già parsati; puro, senza I/O.
    function aggregate(logs) {
        var byReason = {}, byOp = {}, total = 0;
        (logs || []).forEach(function (log) {
            var s = CC.summarize(log);
            total += s.total;
            Object.keys(s.byOp).forEach(function (k) { byOp[k] = (byOp[k] || 0) + s.byOp[k]; });
            Object.keys(s.byReason).forEach(function (k) { byReason[k] = (byReason[k] || 0) + s.byReason[k]; });
        });
        return { total: total, byOp: byOp, byReason: byReason };
    }

    window.MappAICorrection = {
        start: start, review: review, cancel: cancel, save: save,
        aggregate: aggregate, mountButton: mountButton,
        _computeLog: _computeLog, isActive: function () { return _active; }
    };

    if (typeof document !== 'undefined') {
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mountButton);
        else mountButton();
    }
})();
