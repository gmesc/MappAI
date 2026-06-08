/* ============================================================================
 * mappai-l1-checkpoint.js — Checkpoint materializzato delle macro-aree (L1)
 * ----------------------------------------------------------------------------
 * Prima "fetta verticale" della pipeline materializzata (vedi CLAUDE.md §11).
 *
 * COSA FA
 *   Dopo la Fase 1/1.5/1.6 (quando l1Data è finalizzato) e PRIMA dell'espansione
 *   dei rami, questo checkpoint:
 *     1) materializza le macro-aree in una cartella "bus" su disco
 *        (userData/MappAI-Pipeline/{runId}/ — NON nel Vault dell'utente);
 *     2) esegue un gate di validazione DETERMINISTICO (conteggio, aree composte,
 *        desc placeholder, duplicati) — zero chiamate AI;
 *     3) se attivo, mette in pausa la generazione e mostra un modale dove
 *        l'utente può rivedere/correggere le macro-aree (human-in-the-loop)
 *        prima di bruciare le chiamate di espansione.
 *
 * PERCHÉ L1 E NON ALTRO
 *   Un errore di partizione L1 propaga su tutta la mappa: è il punto a massima
 *   leva. A questo stadio gli ID sono banali (poche L1), quindi NON serve ancora
 *   l'autorità-ID globale necessaria per gli stadi per-ramo. È la fetta più
 *   piccola che mette alla prova l'ipotesi "filesystem come bus".
 *
 * GATING
 *   Tutto è gated dal flag localStorage `mappai_l1_checkpoint_enabled`.
 *   Flag spento → window.l1Checkpoint() è un no-op che restituisce i dati
 *   invariati ({ proceed: true, l1Data }). Nessun effetto su disco né sulla UI.
 *
 * API
 *   window.l1Checkpoint(l1Data, opts) -> Promise<{ proceed, l1Data, runId }>
 *     - proceed=false  → il chiamante deve abortire la generazione
 *     - l1Data         → lista macro-aree (eventualmente corretta dall'utente)
 *
 * Comandi console (via dev-console-metrics.js):
 *   MappAIMetrics.enableL1Checkpoint() / .disableL1Checkpoint() / .l1CheckpointStatus()
 * ========================================================================== */
(function () {
    'use strict';

    const FLAG_KEY = 'mappai_l1_checkpoint_enabled';
    const MIN_L1 = 3;
    const MAX_L1 = 7;

    // appState è `let` (non su window): replichiamo il pattern di dev-console-metrics.js
    function _getAppState() {
        try { return (typeof appState !== 'undefined') ? appState : window.appState; }
        catch (e) { return window.appState; }
    }

    function isEnabled() {
        try { return localStorage.getItem(FLAG_KEY) === '1'; }
        catch (e) { return false; }
    }

    function _makeRunId() {
        const d = new Date();
        const pad = n => String(n).padStart(2, '0');
        const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
        const st = _getAppState();
        const label = (st && st.rootNodeLabel ? st.rootNodeLabel : 'mappa')
            .replace(/[^a-z0-9àèéìòù]/gi, '_').replace(/_+/g, '_').replace(/^_|_$/g, '').toLowerCase().slice(0, 40);
        return `${stamp}_${label || 'mappa'}`;
    }

    // ── Gate deterministico: solo controlli su L1, zero AI ─────────────────────
    // Restituisce un array di { level: 'warn', msg } — diagnostica, mai bloccante.
    function _validateL1(l1Data) {
        const out = [];
        const list = Array.isArray(l1Data) ? l1Data : [];
        const n = list.length;

        if (n < MIN_L1) out.push({ level: 'warn', msg: `Poche macro-aree (${n}). Consigliato ≥ ${MIN_L1}: una mappa con pochi rami resta piatta.` });
        if (n > MAX_L1) out.push({ level: 'warn', msg: `Troppe macro-aree (${n}). Tetto consigliato ${MAX_L1}: oltre, lo studente si disorienta.` });

        // Aree composte: "Neutralità e Difesa", "Cause / Conseguenze", "A, B"
        const compoundRe = /\b(?:e|ed|o|oppure)\b|[\/&,]|\+/i;
        const seen = new Map();
        list.forEach((item, i) => {
            const label = (item && typeof item.label === 'string') ? item.label.trim() : '';
            const desc = (item && typeof item.desc === 'string') ? item.desc.trim() : '';

            if (!label) {
                out.push({ level: 'warn', msg: `Macro-area #${i + 1} senza label.` });
                return;
            }
            // Composta solo se ha più "parole piene" attorno al separatore (evita "Storia e Cultura"→ok? no, è composta)
            if (compoundRe.test(label) && label.split(/\s+/).length >= 3) {
                out.push({ level: 'warn', msg: `Macro-area composta: «${label}» — valuta se spezzarla in aree atomiche.` });
            }
            // desc placeholder o assente
            if (!desc || /^categoria principale\s*:/i.test(desc) || desc.length < 15) {
                out.push({ level: 'warn', msg: `Descrizione assente/placeholder: «${label}».` });
            }
            // duplicati case-insensitive
            const key = label.toLowerCase();
            if (seen.has(key)) out.push({ level: 'warn', msg: `Macro-area duplicata: «${label}».` });
            else seen.set(key, i);
        });

        return out;
    }

    // ── Scrittura su disco (best-effort, mai bloccante) ────────────────────────
    async function _writeArtifact(runId, fileName, obj) {
        try {
            if (!window.electronAPI || typeof window.electronAPI.savePipelineArtifact !== 'function') {
                // Ambiente non-Electron (es. Capacitor/iPad): salta silenziosamente.
                return { success: false, error: 'electronAPI non disponibile' };
            }
            const res = await window.electronAPI.savePipelineArtifact({
                runId,
                fileName,
                content: JSON.stringify(obj, null, 2)
            });
            return res || { success: false };
        } catch (e) {
            console.warn('[L1 Checkpoint] scrittura artefatto fallita (non bloccante):', e.message);
            return { success: false, error: e.message };
        }
    }

    function _buildArtifact(runId, l1Data, warnings) {
        const st = _getAppState();
        return {
            runId,
            stage: 'L1_macroaree',
            createdAt: new Date().toISOString(),
            rootNodeLabel: st ? st.rootNodeLabel : '',
            mode: st ? st.extractionMode : 'mindmap',
            aiProvider: st ? st.aiProvider : '',
            count: Array.isArray(l1Data) ? l1Data.length : 0,
            warnings: warnings || _validateL1(l1Data),
            macroAree: l1Data
        };
    }

    // ── Modale di revisione (human-in-the-loop) ────────────────────────────────
    // Restituisce Promise<{ proceed: bool, l1Data: array }>.
    function _showCheckpointModal(l1Data, warnings, savedInfo, runId) {
        return new Promise(resolve => {
            // Copia di lavoro: non mutiamo l'input finché l'utente non conferma.
            const rows = (Array.isArray(l1Data) ? l1Data : []).map(it => ({
                label: (it && it.label) || '',
                desc: (it && typeof it.desc === 'string') ? it.desc : '',
                _orig: it || {}
            }));

            const overlay = document.createElement('div');
            overlay.id = 'l1-checkpoint-overlay';
            overlay.style.cssText = 'position:fixed;inset:0;z-index:10000;background:rgba(15,23,42,.55);display:flex;align-items:center;justify-content:center;padding:24px;';

            const panel = document.createElement('div');
            panel.style.cssText = 'background:#fff;border-radius:20px;max-width:680px;width:100%;max-height:88vh;overflow:hidden;display:flex;flex-direction:column;box-shadow:0 20px 60px rgba(0,0,0,.3);';
            overlay.appendChild(panel);

            // Header
            const header = document.createElement('div');
            header.style.cssText = 'padding:20px 24px 12px;display:flex;align-items:center;gap:12px;';
            header.innerHTML =
                '<div class="pm-icon-wrap"><i data-lucide="git-branch-plus" class="w-5 h-5 text-indigo-600"></i></div>' +
                '<div><div class="pm-title">Checkpoint macro-aree (L1)</div>' +
                '<div class="pm-subtitle">Rivedi le aree principali prima di espandere i rami</div></div>';
            panel.appendChild(header);

            // Body scrollabile
            const body = document.createElement('div');
            body.style.cssText = 'padding:4px 24px;overflow-y:auto;flex:1;';
            panel.appendChild(body);

            // Pannello warnings
            const warnBox = document.createElement('div');
            warnBox.style.cssText = 'margin:8px 0 16px;';
            body.appendChild(warnBox);

            // Lista righe
            const listWrap = document.createElement('div');
            listWrap.style.cssText = 'display:flex;flex-direction:column;gap:10px;';
            body.appendChild(listWrap);

            function renderWarnings() {
                const w = _validateL1(rows.map(r => ({ label: r.label, desc: r.desc })));
                warnBox.innerHTML = '';
                if (!w.length) {
                    warnBox.innerHTML = '<div style="display:flex;align-items:center;gap:8px;background:#f0fdf4;border:1px solid #bbf7d0;color:#15803d;border-radius:12px;padding:10px 14px;font-size:12px;font-weight:600;"><i data-lucide="check-circle-2" class="w-4 h-4"></i> Nessun avviso strutturale sulle macro-aree.</div>';
                } else {
                    const head = document.createElement('div');
                    head.style.cssText = 'font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#b45309;margin-bottom:6px;';
                    head.textContent = `${w.length} avviso/i del gate strutturale`;
                    warnBox.appendChild(head);
                    w.forEach(item => {
                        const row = document.createElement('div');
                        row.style.cssText = 'display:flex;align-items:flex-start;gap:8px;background:#fffbeb;border:1px solid #fde68a;color:#92400e;border-radius:10px;padding:8px 12px;font-size:12px;line-height:1.4;margin-bottom:6px;';
                        const ic = document.createElement('i');
                        ic.setAttribute('data-lucide', 'alert-triangle');
                        ic.className = 'w-4 h-4';
                        ic.style.cssText = 'flex-shrink:0;margin-top:1px;';
                        const tx = document.createElement('span');
                        tx.textContent = item.msg;
                        row.appendChild(ic); row.appendChild(tx);
                        warnBox.appendChild(row);
                    });
                }
                if (window.safeCreateIcons) window.safeCreateIcons();
            }

            function makeRow(r, idx) {
                const card = document.createElement('div');
                card.style.cssText = 'border:1px solid #e2e8f0;border-radius:12px;padding:10px 12px;background:#f8fafc;';

                const top = document.createElement('div');
                top.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:6px;';
                const badge = document.createElement('span');
                badge.textContent = 'L1 #' + (idx + 1);
                badge.style.cssText = 'font-size:10px;font-weight:700;color:#6366f1;background:#eef2ff;border-radius:6px;padding:2px 7px;flex-shrink:0;';
                const labelInput = document.createElement('input');
                labelInput.type = 'text';
                labelInput.value = r.label;
                labelInput.placeholder = 'Etichetta macro-area';
                labelInput.style.cssText = 'flex:1;border:1px solid #cbd5e1;border-radius:8px;padding:6px 10px;font-size:13px;font-weight:700;color:#1e293b;';
                labelInput.addEventListener('input', () => { r.label = labelInput.value; renderWarnings(); });
                const delBtn = document.createElement('button');
                delBtn.type = 'button';
                delBtn.title = 'Rimuovi macro-area';
                delBtn.style.cssText = 'border:none;background:none;color:#94a3b8;cursor:pointer;padding:4px;flex-shrink:0;';
                delBtn.innerHTML = '<i data-lucide="trash-2" class="w-4 h-4"></i>';
                delBtn.addEventListener('click', () => {
                    const i = rows.indexOf(r);
                    if (i >= 0) rows.splice(i, 1);
                    renderList();
                });
                top.appendChild(badge); top.appendChild(labelInput); top.appendChild(delBtn);

                const descArea = document.createElement('textarea');
                descArea.value = r.desc;
                descArea.placeholder = 'Descrizione / ambito di questa macro-area (cosa deve contenere)';
                descArea.rows = 2;
                descArea.style.cssText = 'width:100%;border:1px solid #e2e8f0;border-radius:8px;padding:6px 10px;font-size:12px;color:#475569;resize:vertical;line-height:1.45;';
                descArea.addEventListener('input', () => { r.desc = descArea.value; renderWarnings(); });

                card.appendChild(top);
                card.appendChild(descArea);
                return card;
            }

            function renderList() {
                listWrap.innerHTML = '';
                rows.forEach((r, idx) => listWrap.appendChild(makeRow(r, idx)));
                if (window.safeCreateIcons) window.safeCreateIcons();
                renderWarnings();
            }

            // Footer
            const footer = document.createElement('div');
            footer.style.cssText = 'padding:14px 24px 18px;border-top:1px solid #f1f5f9;display:flex;flex-direction:column;gap:10px;';

            const addBtn = document.createElement('button');
            addBtn.type = 'button';
            addBtn.style.cssText = 'align-self:flex-start;border:1px dashed #c7d2fe;background:#eef2ff;color:#4f46e5;border-radius:9px;padding:6px 12px;font-size:12px;font-weight:600;cursor:pointer;';
            addBtn.innerHTML = '<span style="vertical-align:middle">+ Aggiungi macro-area</span>';
            addBtn.addEventListener('click', () => { rows.push({ label: '', desc: '', _orig: {} }); renderList(); });

            const meta = document.createElement('div');
            meta.style.cssText = 'font-size:10.5px;color:#94a3b8;line-height:1.4;';
            const where = (savedInfo && savedInfo.success && savedInfo.folder)
                ? 'Salvato nella cartella bus su disco.'
                : 'Artefatto non salvato su disco (ambiente non-Electron o errore I/O).';
            meta.textContent = `Run: ${runId} — ${where}`;

            const btnRow = document.createElement('div');
            btnRow.style.cssText = 'display:flex;gap:10px;align-items:center;';
            const openFolderBtn = document.createElement('button');
            openFolderBtn.type = 'button';
            openFolderBtn.className = 'pm-btn-cancel';
            openFolderBtn.style.flex = '0 0 auto';
            openFolderBtn.innerHTML = '<span>Apri cartella</span>';
            openFolderBtn.addEventListener('click', async () => {
                try {
                    if (window.electronAPI && window.electronAPI.openPipelineFolder) {
                        await window.electronAPI.openPipelineFolder({ runId });
                    }
                } catch (e) { /* non bloccante */ }
            });
            const cancelBtn = document.createElement('button');
            cancelBtn.type = 'button';
            cancelBtn.className = 'pm-btn-cancel';
            cancelBtn.textContent = 'Annulla generazione';
            const okBtn = document.createElement('button');
            okBtn.type = 'button';
            okBtn.className = 'pm-btn-primary';
            okBtn.innerHTML = '<i data-lucide="arrow-right" class="w-4 h-4"></i><span>Continua con queste macro-aree</span>';

            btnRow.appendChild(openFolderBtn);
            btnRow.appendChild(cancelBtn);
            btnRow.appendChild(okBtn);

            footer.appendChild(addBtn);
            footer.appendChild(meta);
            footer.appendChild(btnRow);
            panel.appendChild(footer);

            let settled = false;
            function cleanup() { if (overlay.parentNode) overlay.parentNode.removeChild(overlay); document.removeEventListener('keydown', onKey); }
            function finish(result) { if (settled) return; settled = true; cleanup(); resolve(result); }

            function commit() {
                const cleaned = rows
                    .map(r => {
                        const label = (r.label || '').trim();
                        if (!label) return null;
                        // Preserviamo i campi originali (rel/ambito/confini) e aggiorniamo label/desc.
                        const merged = Object.assign({}, r._orig, { label });
                        const desc = (r.desc || '').trim();
                        if (desc) merged.desc = desc; else delete merged.desc;
                        if (!merged.rel) merged.rel = 'include';
                        return merged;
                    })
                    .filter(Boolean);
                finish({ proceed: true, l1Data: cleaned });
            }

            cancelBtn.addEventListener('click', () => finish({ proceed: false, l1Data }));
            okBtn.addEventListener('click', commit);
            overlay.addEventListener('mousedown', e => { if (e.target === overlay) finish({ proceed: false, l1Data }); });
            function onKey(e) { if (e.key === 'Escape') finish({ proceed: false, l1Data }); }
            document.addEventListener('keydown', onKey);

            document.body.appendChild(overlay);
            renderList();
            if (window.safeCreateIcons) window.safeCreateIcons();
        });
    }

    // ── Entry point ────────────────────────────────────────────────────────────
    window.l1Checkpoint = async function (l1Data, opts) {
        opts = opts || {};
        if (!isEnabled()) return { proceed: true, l1Data };

        const runId = opts.runId || _makeRunId();
        const warnings = _validateL1(l1Data);

        // 1) Materializza lo stato pre-revisione
        const savedInfo = await _writeArtifact(runId, '01-macroaree.json', _buildArtifact(runId, l1Data, warnings));

        // 2) Revisione umana (la generazione è in pausa qui)
        if (window.showLoadingOverlay) window.showLoadingOverlay(false);
        const result = await _showCheckpointModal(l1Data, warnings, savedInfo, runId);

        if (!result.proceed) {
            await _writeArtifact(runId, '01-macroaree.aborted.json', _buildArtifact(runId, l1Data, warnings));
            return { proceed: false, l1Data, runId };
        }

        // 3) Materializza lo stato finale (post-correzione) + esito gate
        const finalData = result.l1Data;
        await _writeArtifact(runId, '01-macroaree.final.json', _buildArtifact(runId, finalData, _validateL1(finalData)));
        return { proceed: true, l1Data: finalData, runId };
    };

    // Esponiamo il validatore per riuso/diagnostica da console.
    window.l1CheckpointValidate = _validateL1;
    window.isL1CheckpointEnabled = isEnabled;
})();
