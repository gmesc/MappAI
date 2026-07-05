// ==========================================================================
// mappai-meta-analysis.js — Tool META-ANALISI DOCENTE
// --------------------------------------------------------------------------
// Il docente carica N vault studenti (copie JIGSAW) e genera meta-analisi a
// tier per dare feedback costruttivo + neurofeedback. Modulo autonomo:
// - compute deterministici (gratis): volume, struttura, mastery-da-semaforo,
//   sessioni/celeration, chat (via MappAIChatAnalysis), vista classe;
// - sintesi AI on-demand (neurofeedback) con i 4 paletti nel prompt.
// Dati: load-vault (nodi/link/bridges/tutorState/branchLocks) + IPC
// read-study-sessions (Studio Attivo/sessioni.jsonl). Vedi META_ANALYSIS_SDS.md.
// ==========================================================================
(function () {
    'use strict';

    function _num(x) { return typeof x === 'number' && isFinite(x) ? x : null; }
    // Escape HTML per testi che arrivano dai vault (owner da _lock.yaml, label dei nodi).
    function _escTxt(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, c =>
            ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    }
    function _round(n, d) { const f = Math.pow(10, d || 0); return n == null ? null : Math.round(n * f) / f; }
    function _avg(a) { const b = (a || []).filter(x => x != null); return b.length ? b.reduce((s, x) => s + x, 0) / b.length : null; }
    function _words(s) { return (String(s || '').toLowerCase().match(/[a-zàèéìòùç]+/gi) || []); }
    // Pendenza regressione lineare di y su x=0..n-1 (celeration proxy).
    function _slope(y) {
        const n = (y || []).length; if (n < 2) return 0;
        let sx = 0, sy = 0, sxy = 0, sxx = 0;
        for (let i = 0; i < n; i++) { sx += i; sy += y[i]; sxy += i * y[i]; sxx += i * i; }
        const d = n * sxx - sx * sx; return d ? (n * sxy - sx * sy) / d : 0;
    }
    function _linkId(v) { return v && typeof v === 'object' ? v.id : v; }

    // ---- Sessioni (da Studio Attivo/sessioni.jsonl) ----
    function analyzeSessions(sessions) {
        const s = (sessions || []).filter(x => x && x.timestamp).slice()
            .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
        const n = s.length;
        if (!n) return { totalSessions: 0, daysActive: 0, spanDays: 0, regularity: 0, avgAccuracy: null, firstAccuracy: null, lastAccuracy: null, delta: null, celerationSlope: 0, perMode: [] };
        const accOf = x => _num(x.accuracy) != null ? x.accuracy : (x.total ? 100 * x.score / x.total : null);
        const acc = s.map(accOf).filter(x => x != null);
        const days = new Set(s.map(x => x.date || String(x.timestamp).slice(0, 10)));
        const span = Math.max(0, Math.round((new Date(s[n - 1].timestamp) - new Date(s[0].timestamp)) / 86400000));
        const byMode = {};
        s.forEach(x => { const m = x.modeTitle || x.mode || '?'; (byMode[m] = byMode[m] || []).push(accOf(x)); });
        // Fluenza (corrette/min) dalle sessioni con durata (Precision Teaching). Solo dati recenti la avranno.
        const rated = s.filter(x => x.durationSec && typeof x.score === 'number');
        const rates = rated.map(x => x.score / (x.durationSec / 60));
        return {
            totalSessions: n,
            daysActive: days.size,
            spanDays: span,
            regularity: _round(days.size / Math.max(1, span + 1), 2),
            avgAccuracy: _round(_avg(acc), 0),
            firstAccuracy: acc.length ? Math.round(acc[0]) : null,
            lastAccuracy: acc.length ? Math.round(acc[acc.length - 1]) : null,
            delta: acc.length ? Math.round(acc[acc.length - 1] - acc[0]) : null,
            celerationSlope: _round(_slope(acc), 2),
            fluencyRate: rates.length ? _round(_avg(rates), 1) : null,
            fluencySessions: rated.length,
            fluencySlope: rates.length > 1 ? _round(_slope(rates), 2) : null,
            perMode: Object.keys(byMode).map(m => ({ mode: m, sessions: byMode[m].length, avgAccuracy: _round(_avg(byMode[m]), 0) }))
        };
    }

    // ---- Mastery approssimata dal semaforo studyStatus (EWMA reale è in localStorage, non nel vault) ----
    function masteryFromStatus(nodes) {
        const c = { none: 0, todo: 0, review: 0, done: 0 };
        (nodes || []).forEach(n => { const st = n.studyStatus || 'none'; c[st] = (c[st] || 0) + 1; });
        const total = (nodes || []).length || 1;
        return { counts: c, total: (nodes || []).length, doneRatio: _round(c.done / total, 2), reviewRatio: _round(c.review / total, 2), untouchedRatio: _round(c.none / total, 2) };
    }

    // ---- Mastery REALE dal store esportato (mastery.json): accuratezza EWMA + fluenza corrette/min ----
    function masteryFromStore(store, nodes) {
        if (!store || !window.MappAIMastery || !window.MappAIMastery.aggregateNode) return null;
        const c = { 'in-corso': 0, acquisito: 0, fluente: 0 };
        let withData = 0, rateSum = 0, rated = 0;
        (nodes || []).forEach(n => {
            const agg = window.MappAIMastery.aggregateNode(store, n.id);
            if (!agg || !agg.attempts) return;
            withData++;
            const lvl = window.MappAIMastery.masteryLevel(agg);
            if (lvl === 'fluente') c.fluente++;
            else if (lvl === 'acquisito') c.acquisito++;
            else c['in-corso']++;
            if (typeof agg.rate === 'number' && agg.rate > 0) { rateSum += agg.rate; rated++; }
        });
        if (!withData) return null;
        return { counts: c, withData: withData, fluencyRate: rated ? _round(rateSum / rated, 1) : null, ratedNodes: rated };
    }

    // ---- Effort per nodo: LAVORO svolto, indipendente dalla mastery raggiunta ----
    // tentativi di studio (dallo store padronanza) + turni chat sul nodo + parole desc scritte.
    function nodeEffort(node, masteryStore, tutorState) {
        let attempts = 0;
        if (masteryStore && window.MappAIMastery && window.MappAIMastery.aggregateNode) {
            const agg = window.MappAIMastery.aggregateNode(masteryStore, node.id);
            attempts = agg ? agg.attempts : 0;
        }
        let turns = 0;
        if (tutorState && tutorState.nodes && tutorState.nodes[node.id]) {
            turns = (tutorState.nodes[node.id].history || []).filter(e => e && e.role === 'user').length;
        }
        const descW = _words(node.desc || node.content).length;
        return _round(attempts * 2 + turns * 3 + Math.min(descW, 120) / 20, 1);
    }

    // ---- Ramo di competenza dello studente (copia JIGSAW) ----
    function ownBranch(vaultData) {
        const locks = vaultData.branchLocks || {};
        const key = Object.keys(locks).find(k => locks[k] && locks[k].editable !== false && locks[k].role !== 'teacher');
        return { key: key || null, owner: key ? locks[key].owner : null, hasLocks: Object.keys(locks).length > 0 };
    }
    function branchNodes(vaultData, key) {
        const nodes = vaultData.nodes || [];
        if (!key || !window.MappAIJigsaw) return nodes;
        const byId = {}; nodes.forEach(n => byId[n.id] = n);
        return nodes.filter(n => window.MappAIJigsaw.branchKeyForNode(n, byId, vaultData.links || []) === key);
    }

    // ---- Analisi per singolo studente ----
    function analyzeStudent(vaultData, sessions, masteryStore) {
        const own = ownBranch(vaultData);
        const nodes = own.key ? branchNodes(vaultData, own.key) : (vaultData.nodes || []);
        const nodeIds = new Set(nodes.map(n => n.id));
        const links = (vaultData.links || []).filter(l => nodeIds.has(_linkId(l.source)) || nodeIds.has(_linkId(l.target)));
        const mapLabels = (vaultData.nodes || []).map(n => n.label);

        // Tier 1 — volume
        const descWords = nodes.reduce((s, n) => s + _words(n.desc || n.content).length, 0);
        const sources = nodes.reduce((s, n) => s + ((n.chunks || []).length), 0);
        const bridges = (vaultData.links || []).filter(l => l.isBridge && (!own.owner || l.bridgeAuthor === own.owner));
        const studySets = (vaultData.studySets || []).length;

        // Tier 3 — struttura (deterministica)
        let structure = null;
        try { if (window.MappAIStructureAnalyzer) structure = window.MappAIStructureAnalyzer.analyzeStructure(nodes, links, {}); } catch (e) {}

        // Tier 2 — chat
        let chat = null;
        try { if (window.MappAIChatAnalysis) chat = window.MappAIChatAnalysis.analyzeChat(vaultData.tutorState, mapLabels); } catch (e) {}

        // Tier 4 — ponti (integrazione inter-area)
        const bridgeInfo = {
            proposed: bridges.length,
            ratified: bridges.filter(b => b.bridgeStatus === 'ratified').length,
            rejected: bridges.filter(b => b.bridgeStatus === 'rejected').length,
            justified: bridges.filter(b => b.justification && b.justification.length > 15).length,
            avgJustWords: _round(_avg(bridges.map(b => _words(b.justification).length)), 0)
        };

        // Tier 9 — effort per nodo (heatmap del lavoro)
        const effortNodes = nodes.map(n => ({ id: n.id, label: n.label, score: nodeEffort(n, masteryStore, vaultData.tutorState) })).sort((a, b) => b.score - a.score);
        const effortTotal = _round(effortNodes.reduce((s, e) => s + e.score, 0), 1);

        return {
            owner: own.owner || vaultData.rootNodeLabel || 'studente',
            branchKey: own.key,
            isJigsaw: own.hasLocks,
            volume: { nodes: nodes.length, descWords: descWords, avgDescWords: nodes.length ? _round(descWords / nodes.length, 0) : 0, sources: sources, studySets: studySets, bridges: bridges.length },
            mastery: masteryFromStatus(nodes),
            masteryReal: masteryFromStore(masteryStore, nodes),
            sessions: analyzeSessions(sessions),
            structure: structure ? { stats: structure.stats, issues: (structure.suggestions || []).length } : null,
            chat: chat,
            bridges: bridgeInfo,
            effort: { nodes: effortNodes, top: effortNodes.slice(0, 8), total: effortTotal, workedNodes: effortNodes.filter(e => e.score > 0).length }
        };
    }

    // ---- Vista classe (cross-studente) ----
    function analyzeClass(students) {
        const workUnits = students.map(s => s.volume.nodes + s.volume.descWords / 20 + s.sessions.totalSessions * 2 + s.volume.bridges * 3);
        const mean = _avg(workUnits) || 0;
        const variance = workUnits.length ? _avg(workUnits.map(w => (w - mean) * (w - mean))) : 0;
        // Copertura integrazione: aree collegate dai ponti (per branchKey coinvolti)
        const bridgedAreas = new Set();
        students.forEach(s => { if (s.bridges.proposed) bridgedAreas.add(s.branchKey); });
        // Free-rider: effort molto sotto la mediana → distinzione "assente" vs "in difficoltà" (paletto: non punire chi fatica).
        const efforts = students.map(s => (s.effort && s.effort.total) || 0).slice().sort((a, b) => a - b);
        const median = efforts.length ? efforts[Math.floor(efforts.length / 2)] : 0;
        students.forEach(s => {
            const e = (s.effort && s.effort.total) || 0;
            const consolidated = s.masteryReal ? (s.masteryReal.counts.fluente + s.masteryReal.counts.acquisito) : null;
            if (median > 0 && e < 0.35 * median) s._flag = 'basso impegno';
            else if (s.masteryReal && s.masteryReal.withData >= 3 && consolidated === 0) s._flag = 'in difficoltà';
            else s._flag = null;
        });
        return {
            students: students.length,
            workUnits: workUnits.map(w => _round(w, 0)),
            // coefficiente di variazione (σ/μ) dell'effort — dispersione relativa (equità Cohen).
            // Nome onesto: NON è l'indice di Gini.
            effortCV: _round(Math.sqrt(variance) / (mean || 1), 2),
            effortMedian: _round(median, 1),
            flagged: students.filter(s => s._flag).map(s => ({ owner: s.owner, flag: s._flag, effort: (s.effort && s.effort.total) || 0 })),
            totalBridges: students.reduce((s, x) => s + x.bridges.proposed, 0),
            areasBridging: bridgedAreas.size,
            avgAccuracy: _round(_avg(students.map(s => s.sessions.avgAccuracy)), 0)
        };
    }

    // ======================= AI: sintesi neurofeedback (on-demand) =======================
    function _neuroPrompt(student) {
        const c = student.chat || {};
        return [
            'Sei un tutor esperto in didattica inclusiva (BES/DSA). Scrivi un NEUROFEEDBACK formativo per lo studente,',
            'basato SOLO su questi dati oggettivi. Regole vincolanti:',
            '1) NON sono "stili di apprendimento" fissi: parla di PATTERN osservati in questo contesto.',
            '2) NON valutare ortografia/grammatica come competenza (possibile dislessia): concentrati su ragionamento e curiosità.',
            '3) Tono growth, strengths-based, azionabile; MAI etichette-deficit.',
            '4) Se i dati sono pochi (confidenza ' + (c.confidence || 'bassa') + '), dillo e non sovra-interpretare.',
            '',
            'DATI:',
            '- Turni chat: ' + (c.volume ? c.volume.userTurns : 0) + ', domande: ' + (c.volume ? c.volume.questions : 0),
            '- Tipi domanda: ' + JSON.stringify(c.questionStyle ? c.questionStyle.types : {}),
            '- Rapporto domande-di-ragionamento: ' + (c.questionStyle ? c.questionStyle.reasoningRatio : 0),
            '- Riformulazioni ("non ho capito", "quindi..."): ' + (c.questionStyle ? c.questionStyle.reformulations : 0),
            '- Leggibilità Gulpease: ' + (c.language ? c.language.gulpease : 'n/d') + ', ricchezza lessicale (TTR): ' + (c.language ? c.language.typeTokenRatio : 'n/d'),
            '- Adozione lessico disciplinare: ' + (c.language ? c.language.disciplinaryAdoption : 'n/d'),
            '- Mastery (semaforo): ' + JSON.stringify(student.mastery.counts) + ', sessioni: ' + student.sessions.totalSessions + ', trend accuratezza: ' + student.sessions.delta,
            '- Ponti inter-area proposti: ' + student.bridges.proposed,
            (student.sessions && student.sessions.fluencyRate != null ? '- Fluenza: ' + student.sessions.fluencyRate + ' corrette/min' : ''),
            '',
            'CAMPIONE DI DOMANDE POSTE DALLO STUDENTE (testo grezzo):',
            ((c.sampleQuestions && c.sampleQuestions.length) ? c.sampleQuestions.map(q => '  · ' + q).join('\n') : '  (nessuna domanda registrata)'),
            '',
            'Dalle domande, valuta anche: il livello cognitivo prevalente (tassonomia di Bloom: ricordare/comprendere/applicare/analizzare/valutare/creare)',
            'e i marker metacognitivi/affettivi (curiosità, dubbio produttivo, frustrazione, richieste di riformulazione).',
            '',
            'Scrivi 4 brevi paragrafi: (a) come poni domande (tipo + livello Bloom + atteggiamento), (b) come usi il linguaggio, (c) come studi e progredisci, (d) un prossimo passo concreto. Max 240 parole. In italiano, rivolgendoti a "tu".'
        ].filter(Boolean).join('\n');
    }

    async function generateNeurofeedback(student) {
        if (!window.fetchModelAPI || !window.getSystemKey) return null;
        const apiKey = window.getSystemKey();
        if (!apiKey) { if (window.showToast) window.showToast('Inserisci API Key per la sintesi AI', 'error'); return null; }
        const payload = {
            contents: [{ role: 'user', parts: [{ text: _neuroPrompt(student) }] }],
            generationConfig: { temperature: 0.4, maxOutputTokens: 700 }
        };
        try {
            const res = await window.fetchModelAPI(payload, apiKey);
            return res && res.candidates && res.candidates[0] && res.candidates[0].content.parts[0].text || null;
        } catch (e) { console.warn('[MetaAnalysis] neurofeedback', e); return null; }
    }

    // Analisi chat approfondita (AI, on-demand): livello Bloom delle domande + marker metacognitivi/affettivi.
    function _chatPrompt(student) {
        const c = student.chat || {}, q = c.questionStyle || {};
        return [
            'Sei un analista didattico. Analizza SOLO le domande poste dallo studente in chat. Regole vincolanti:',
            'non giudicare ortografia/grammatica (possibile DSA); parla di PATTERN osservati, non di stili fissi;',
            'se i dati sono pochi (confidenza ' + (c.confidence || 'bassa') + ') dillo e non sovra-interpretare.',
            '',
            'DOMANDE (campione grezzo):',
            ((c.sampleQuestions && c.sampleQuestions.length) ? c.sampleQuestions.map(x => '  · ' + x).join('\n') : '  (nessuna domanda registrata)'),
            '',
            'METRICHE: tipi ' + JSON.stringify(q.types || {}) + ' · rapporto ragionamento ' + (q.reasoningRatio || 0) +
                ' · riformulazioni ' + (q.reformulations || 0) + ' · per modalità ' + JSON.stringify(c.byMode || {}),
            '',
            'Restituisci 4 punti brevi: (1) livello Bloom prevalente delle domande (ricordare/comprendere/applicare/analizzare/valutare/creare) con un esempio dalle domande; (2) marker metacognitivi e affettivi osservati (curiosità, dubbio produttivo, frustrazione, richieste di riformulazione); (3) in quale modalità di studio emerge il ragionamento migliore; (4) un suggerimento concreto per far salire di livello le sue domande. Max 180 parole, in italiano, rivolgendoti a "tu".'
        ].join('\n');
    }

    async function generateChatAnalysis(student) {
        if (!window.fetchModelAPI || !window.getSystemKey) return null;
        const apiKey = window.getSystemKey();
        if (!apiKey) return null;
        const payload = {
            contents: [{ role: 'user', parts: [{ text: _chatPrompt(student) }] }],
            generationConfig: { temperature: 0.4, maxOutputTokens: 550 }
        };
        try {
            const res = await window.fetchModelAPI(payload, apiKey);
            return res && res.candidates && res.candidates[0] && res.candidates[0].content.parts[0].text || null;
        } catch (e) { console.warn('[MetaAnalysis] chatAnalysis', e); return null; }
    }

    window.MappAIMetaAnalysis = {
        analyzeSessions: analyzeSessions,
        masteryFromStatus: masteryFromStatus,
        analyzeStudent: analyzeStudent,
        analyzeClass: analyzeClass,
        generateNeurofeedback: generateNeurofeedback,
        generateChatAnalysis: generateChatAnalysis,
        // UI sotto (definite dopo)
        openModal: null,
        _render: null
    };

    // ======================= UI: gather + modal + report =======================

    async function gatherStudents(parentPath) {
        const students = [];
        const list = await window.electronAPI.listVaultSubfolders(parentPath);
        const subs = (list && list.folders) || [];
        for (const sub of subs) {
            try {
                const loadRes = await window.electronAPI.loadVault(sub.path);
                if (!loadRes || !loadRes.success) continue;
                let sessions = [], masteryStore = null;
                try { const sr = await window.electronAPI.readStudySessions(sub.path); sessions = (sr && sr.sessions) || []; masteryStore = (sr && sr.mastery) || null; } catch (e) {}
                students.push(analyzeStudent(loadRes.data, sessions, masteryStore));
            } catch (e) { console.warn('[MetaAnalysis] gather', sub.path, e); }
        }
        return students;
    }

    function _bar(label, value, max, unit) {
        const pct = max ? Math.min(100, Math.round(100 * value / max)) : 0;
        return '<div style="margin:4px 0;"><div style="display:flex;justify-content:space-between;font-size:12px;color:#475569;"><span>' +
            label + '</span><span>' + value + (unit || '') + '</span></div>' +
            '<div style="height:7px;background:#eef2f7;border-radius:4px;overflow:hidden;"><div style="height:100%;width:' + pct + '%;background:#6366f1;"></div></div></div>';
    }

    function _sectTitle(t) {
        return '<div style="font-size:11px;font-weight:700;text-transform:uppercase;color:#94a3b8;margin:12px 0 4px;">' + t + '</div>';
    }
    // Heatmap del lavoro per nodo (effort), indipendente dalla mastery.
    function _effortHeatmap(effort) {
        if (!effort || !effort.nodes || !effort.nodes.length) return '';
        const max = Math.max(1, ...effort.nodes.map(e => e.score));
        const cells = effort.nodes.map(e => {
            const t = e.score / max;
            const bg = 'rgba(99,102,241,' + (0.10 + 0.8 * t).toFixed(2) + ')';
            const lab = (e.label || '').length > 18 ? e.label.slice(0, 17) + '…' : (e.label || '');
            return '<span title="' + _escTxt(e.label) + ' · effort ' + e.score + '" style="font-size:10px;padding:3px 7px;border-radius:6px;background:' + bg + ';color:' + (t > 0.5 ? '#fff' : '#334155') + ';">' + _escTxt(lab) + '</span>';
        }).join('');
        return '<div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:4px;">' + cells + '</div>' +
            '<p style="font-size:11px;color:#94a3b8;margin:4px 0 0;">Colore = lavoro svolto (tentativi di studio + chat + scrittura), <b>indipendente dalla padronanza</b>. ' + effort.workedNodes + '/' + effort.nodes.length + ' nodi toccati.</p>';
    }
    function _studentCard(s, tiers) {
        const has = id => !tiers || tiers.has(id);
        const m = s.mastery, ses = s.sessions, ch = s.chat || {}, q = ch.questionStyle || {}, lg = ch.language || {}, st = s.structure;
        const slopeTxt = ses.celerationSlope > 0.5 ? '📈 in crescita' : (ses.celerationSlope < -0.5 ? '📉 in calo' : '➡️ stabile');
        let sec = '';
        if (has('t1')) sec += _sectTitle('Volume & costanza') +
            _bar('Nodi ramo', s.volume.nodes, 40) + _bar('Parole desc (media/nodo)', s.volume.avgDescWords, 80) +
            _bar('Fonti', s.volume.sources, 30) + _bar('Set di studio', s.volume.studySets, 8);
        if (has('t5')) {
            const mr = s.masteryReal;
            if (mr) sec += _sectTitle('Mastery (padronanza reale — Precision Teaching)') +
                _bar('Fluente', mr.counts.fluente, mr.withData || 1) + _bar('Acquisito', mr.counts.acquisito, mr.withData || 1) + _bar('In corso', mr.counts['in-corso'], mr.withData || 1) +
                '<p style="font-size:11px;color:#94a3b8;margin:2px 0 0;">' + mr.withData + ' nodi con dati' + (mr.fluencyRate != null ? ' · fluenza media <b>' + mr.fluencyRate + '</b> corrette/min' : '') + '</p>';
            else sec += _sectTitle('Mastery (semaforo)') +
                _bar('Imparato', m.counts.done, m.total || 1) + _bar('Da ripassare', m.counts.review, m.total || 1) + _bar('Non toccato', m.counts.none, m.total || 1);
        }
        if (has('t6')) sec += _sectTitle('Progressi & studio') +
            '<p style="font-size:13px;color:#475569;margin:2px 0;">Sessioni: <b>' + ses.totalSessions + '</b> in ' + ses.daysActive + ' giorni · regolarità ' + ses.regularity + '</p>' +
            '<p style="font-size:13px;color:#475569;margin:2px 0;">Accuratezza: ' + (ses.firstAccuracy != null ? ses.firstAccuracy + '%→' + ses.lastAccuracy + '%' : 'n/d') + ' ' + slopeTxt + '</p>' +
            (ses.fluencyRate != null ? '<p style="font-size:13px;color:#475569;margin:2px 0;">Fluenza: <b>' + ses.fluencyRate + '</b> corrette/min' + (ses.fluencySlope != null ? ' (trend ' + (ses.fluencySlope > 0 ? '↑' : (ses.fluencySlope < 0 ? '↓' : '→')) + ')' : '') + ' <span style="color:#cbd5e1;">' + ses.fluencySessions + ' sessioni cronometrate</span></p>' : '<p style="font-size:11px;color:#cbd5e1;margin:2px 0;">Fluenza corrette/min: disponibile dalle prossime sessioni (durata ora registrata).</p>');
        if (has('t3') && st) sec += _sectTitle('Struttura del pezzo') +
            '<p style="font-size:13px;color:#475569;margin:2px 0;">Nodi ' + (st.stats.nodes || 0) + ' · densità ' + (st.stats.density != null ? st.stats.density : 'n/d') + ' · criticità rilevate: ' + st.issues + '</p>';
        if (has('t4')) sec += _sectTitle('Integrazione inter-area (ponti)') +
            '<p style="font-size:13px;color:#475569;margin:2px 0;">Proposti: <b>' + s.bridges.proposed + '</b> · giustificati ' + s.bridges.justified + ' · ratificati ' + s.bridges.ratified + ' · parole/giust. ' + (s.bridges.avgJustWords != null ? s.bridges.avgJustWords : 'n/d') + '</p>';
        if (has('t2')) sec += _sectTitle('Chat: come pensa e scrive') +
            '<p style="font-size:13px;color:#475569;margin:2px 0;">Domande: ' + (ch.volume ? ch.volume.questions : 0) + ' · ragionamento ' + Math.round((q.reasoningRatio || 0) * 100) + '% · riformulazioni ' + (q.reformulations || 0) + '</p>' +
            '<p style="font-size:13px;color:#475569;margin:2px 0;">Linguaggio: Gulpease ' + (lg.gulpease != null ? lg.gulpease : 'n/d') + ' · ricchezza (TTR) ' + (lg.typeTokenRatio != null ? lg.typeTokenRatio : 'n/d') + ' · lessico disciplinare ' + (lg.disciplinaryAdoption != null ? Math.round(lg.disciplinaryAdoption * 100) + '%' : 'n/d') + '</p>' +
            '<p style="font-size:11px;color:#cbd5e1;margin:6px 0 0;">Metriche linguistiche indicative; non valutare ortografia (possibile DSA).</p>';
        if (has('t2') && ch.byMode) {
            const ml = { socratic: 'Socratico', explain: 'Spiega tu', ask: 'Interroga tu', devil: 'Dubbio', connect: 'Collega', recall: 'Ripasso' };
            const modes = Object.keys(ch.byMode).filter(k => k !== 'untagged' && ch.byMode[k].turns > 0);
            if (modes.length) sec += '<p style="font-size:12px;color:#64748b;margin:4px 0 0;">Per modalità: ' +
                modes.map(k => (ml[k] || k) + ' (' + ch.byMode[k].turns + ' turni, ragionamento ' + ch.byMode[k].reasoning + ')').join(' · ') + '</p>';
        }
        if (has('t10') && s._chatAI) sec += _sectTitle('Analisi chat approfondita (AI)') +
            '<div style="font-size:13px;color:#334155;line-height:1.6;background:#f8fafc;border-radius:8px;padding:10px 12px;white-space:pre-wrap;">' + s._chatAI.replace(/[<>]/g, '') + '</div>';
        if (has('t9') && s.effort) sec += _sectTitle('Heatmap del lavoro (effort)') + _effortHeatmap(s.effort);
        if (has('t7') && s._neuro) sec += _sectTitle('Neurofeedback (AI)') +
            '<div style="font-size:13px;color:#334155;line-height:1.6;background:#f8fafc;border-radius:8px;padding:10px 12px;white-space:pre-wrap;">' + s._neuro.replace(/[<>]/g, '') + '</div>';
        const flagChip = s._flag
            ? '<span style="font-size:11px;font-weight:700;padding:2px 8px;border-radius:99px;background:' + (s._flag === 'basso impegno' ? '#fef2f2;color:#b91c1c' : '#fffbeb;color:#b45309') + ';">' + s._flag + '</span>'
            : '';
        return '<div style="border:1px solid #e2e8f0;border-radius:12px;padding:16px;margin:12px 0;page-break-inside:avoid;">' +
            '<div style="display:flex;justify-content:space-between;align-items:baseline;gap:8px;"><h3 style="margin:0;font-size:18px;color:#1e293b;">' + _escTxt(s.owner) + ' ' + flagChip + '</h3>' +
            '<span style="font-size:12px;color:#94a3b8;">' + _escTxt(s.branchKey || 'mappa intera') + (ch.confidence ? ' · chat: conf. ' + ch.confidence : '') + '</span></div>' +
            sec + '</div>';
    }

    function _classCard(klass) {
        let fr = '';
        if (klass.flagged && klass.flagged.length) {
            fr = '<div style="margin-top:8px;padding-top:8px;border-top:1px solid #e2e8f0;">' +
                '<p style="font-size:13px;color:#475569;margin:0 0 4px;"><b>Da attenzionare</b> (mediana effort ' + klass.effortMedian + '):</p>' +
                klass.flagged.map(f => '<p style="font-size:13px;margin:2px 0;color:' + (f.flag === 'basso impegno' ? '#b91c1c' : '#b45309') + ';">• ' + _escTxt(f.owner) + ' — ' + f.flag + ' (effort ' + f.effort + ')</p>').join('') +
                '<p style="font-size:11px;color:#94a3b8;margin:4px 0 0;">«basso impegno» = possibile assenza (dati quasi nulli) · «in difficoltà» = lavora ma non consolida → sostenere, non punire.</p></div>';
        } else {
            fr = '<p style="font-size:13px;color:#16a34a;margin:6px 0 0;">Nessun free-rider evidente: impegno distribuito.</p>';
        }
        return '<div style="background:#f8fafc;border-radius:12px;padding:16px;margin-bottom:8px;">' +
            '<h2 style="font-size:18px;margin:0 0 8px;">Vista classe & free-rider</h2>' +
            '<p style="font-size:14px;color:#475569;margin:2px 0;">Ponti totali: <b>' + klass.totalBridges + '</b> · aree che hanno costruito ponti: ' + klass.areasBridging + '/' + klass.students + '</p>' +
            '<p style="font-size:14px;color:#475569;margin:2px 0;">Accuratezza media classe: ' + (klass.avgAccuracy != null ? klass.avgAccuracy + '%' : 'n/d') + '</p>' +
            '<p style="font-size:14px;color:#475569;margin:2px 0;">Dispersione dell\'impegno (CV, equità): ' + klass.effortCV + ' <span style="color:#94a3b8;">(alto = un gruppo traina, rischio Cohen)</span></p>' + fr + '</div>';
    }

    function _report(students, klass, tiers) {
        const has = id => !tiers || tiers.has(id);
        let h = '<div style="max-width:820px;margin:0 auto;font-family:system-ui,sans-serif;color:#1e293b;padding:24px;">' +
            '<h1 style="font-size:26px;margin:0 0 4px;">Meta-analisi didattica</h1>' +
            '<p style="color:#64748b;margin:0 0 4px;">' + students.length + ' studenti · generato ' + new Date().toLocaleString('it') + '</p>' +
            '<p style="font-size:12px;color:#94a3b8;margin:0 0 20px;">Identificazione solo per <b>gruppo</b> (anonimo). Nessun dato personale nei vault.</p>';
        if (has('t8')) h += _classCard(klass);
        students.forEach(s => { h += _studentCard(s, tiers); });
        h += '<p style="font-size:11px;color:#cbd5e1;margin-top:24px;">Analisi formativa (non voto), anonima per gruppo. La padronanza fine è disponibile se lo studente ha esportato lo store nel vault; altrimenti stimata dalle sessioni. Campioni piccoli → bassa confidenza.</p></div>';
        return h;
    }

    function _openReport(html) {
        const w = window.open('', '_blank');
        if (!w) { if (window.showToast) window.showToast('Popup bloccato: consenti le finestre', 'error'); return; }
        w.document.write('<!doctype html><html><head><meta charset="utf-8"><title>Meta-analisi</title></head><body style="margin:0;background:#fff;">' + html +
            '<div style="text-align:center;padding:16px;"><button onclick="window.print()" style="padding:8px 20px;border:1px solid #6366f1;background:#6366f1;color:#fff;border-radius:8px;cursor:pointer;">Stampa / PDF</button></div></body></html>');
        w.document.close();
    }

    // Dashboard interattiva in-app (overlay full-screen navigabile per gruppo/allievo).
    function openDashboard(students, klass, tiers) {
        const existing = document.getElementById('meta-dashboard');
        if (existing) existing.remove();
        const activeTiers = new Set((tiers && tiers.size) ? [...tiers] : TIERS.map(t => t.id));
        let current = 'class';

        const ov = document.createElement('div');
        ov.id = 'meta-dashboard';
        ov.className = 'fixed inset-0 z-[3500] bg-white flex flex-col';
        ov.style.color = '#1e293b';
        const tierChips = TIERS.map(t => '<button data-tier="' + t.id + '" class="dash-tier" title="' + t.label + '" style="font-size:11px;padding:3px 9px;border-radius:99px;border:1px solid #cbd5e1;cursor:pointer;background:#fff;color:#64748b;">' + t.label.split(' ')[0] + '</button>').join('');
        ov.innerHTML =
            '<div style="display:flex;align-items:center;gap:12px;padding:12px 20px;border-bottom:1px solid #e2e8f0;flex-wrap:wrap;">' +
                '<div style="font-size:18px;font-weight:600;">Meta-analisi didattica</div>' +
                '<div style="font-size:12px;color:#94a3b8;">' + students.length + ' gruppi · anonimo</div>' +
                '<div style="flex:1;min-width:20px;"></div>' +
                '<div id="dash-tiers" style="display:flex;gap:4px;flex-wrap:wrap;">' + tierChips + '</div>' +
                '<button id="dash-print" style="font-size:13px;padding:6px 12px;border:1px solid #6366f1;background:#6366f1;color:#fff;border-radius:8px;cursor:pointer;">Stampa / PDF</button>' +
                '<button id="dash-close" style="font-size:13px;padding:6px 12px;border:1px solid #cbd5e1;background:#fff;border-radius:8px;cursor:pointer;">Chiudi</button>' +
            '</div>' +
            '<div style="flex:1;display:flex;min-height:0;">' +
                '<div id="dash-nav" style="width:220px;border-right:1px solid #e2e8f0;overflow-y:auto;padding:12px;background:#fafafa;"></div>' +
                '<div id="dash-content" style="flex:1;overflow-y:auto;padding:20px;font-family:system-ui,sans-serif;"></div>' +
            '</div>';
        document.body.appendChild(ov);

        const item = (id, label, badge, active) =>
            '<div data-nav="' + id + '" style="padding:8px 10px;border-radius:8px;cursor:pointer;margin-bottom:4px;font-size:14px;background:' + (active ? '#eef2ff' : 'transparent') + ';color:' + (active ? '#4338ca' : '#334155') + ';display:flex;justify-content:space-between;align-items:center;gap:6px;">' + label + (badge || '') + '</div>';
        function renderTiers() {
            ov.querySelectorAll('.dash-tier').forEach(b => {
                const on = activeTiers.has(b.getAttribute('data-tier'));
                b.style.background = on ? '#6366f1' : '#fff';
                b.style.color = on ? '#fff' : '#64748b';
                b.style.borderColor = on ? '#6366f1' : '#cbd5e1';
            });
        }
        function renderNav() {
            let html = item('class', 'Vista classe', '', current === 'class');
            students.forEach((s, i) => {
                const badge = s._flag ? '<span style="font-size:10px;padding:1px 6px;border-radius:99px;background:' + (s._flag === 'basso impegno' ? '#fef2f2;color:#b91c1c' : '#fffbeb;color:#b45309') + ';">!</span>' : '';
                html += item(String(i), _escTxt(s.owner), badge, current === String(i));
            });
            ov.querySelector('#dash-nav').innerHTML = html;
        }
        function renderContent() {
            ov.querySelector('#dash-content').innerHTML =
                '<p style="font-size:12px;color:#94a3b8;margin:0 0 12px;">Anonimo — identificazione solo per gruppo.</p>' +
                (current === 'class' ? _classCard(klass) : _studentCard(students[+current], activeTiers));
        }
        function rerender() { renderTiers(); renderNav(); renderContent(); }

        ov.addEventListener('click', e => {
            const nav = e.target.closest('[data-nav]');
            if (nav) { current = nav.getAttribute('data-nav'); rerender(); return; }
            const tier = e.target.closest('.dash-tier');
            if (tier) { const id = tier.getAttribute('data-tier'); activeTiers.has(id) ? activeTiers.delete(id) : activeTiers.add(id); rerender(); return; }
        });
        ov.querySelector('#dash-close').addEventListener('click', () => ov.remove());
        ov.querySelector('#dash-print').addEventListener('click', () => _openReport(_report(students, klass, activeTiers)));
        rerender();
    }

    const TIERS = [
        { id: 't1', label: 'Volume & costanza', on: true },
        { id: 't2', label: 'Chat — domande & linguaggio', on: true },
        { id: 't3', label: 'Struttura del pezzo', on: true },
        { id: 't4', label: 'Integrazione (ponti)', on: true },
        { id: 't5', label: 'Mastery (padronanza/semaforo)', on: true },
        { id: 't9', label: 'Heatmap del lavoro (effort)', on: true, note: 'Nodi più lavorati, indipendente dalla mastery' },
        { id: 't6', label: 'Progressi (celeration)', on: true },
        { id: 't8', label: 'Vista classe & free-rider', on: true },
        { id: 't10', label: 'Analisi chat approfondita (AI)', on: false, note: 'Livello Bloom domande + marker metacognitivi; costa token' },
        { id: 't7', label: 'Neurofeedback (AI — costa token)', on: false, note: 'Sintesi AI per studente; richiede API Key' }
    ];

    function openModal() {
        const existing = document.getElementById('meta-analysis-modal');
        if (existing) existing.remove();
        const checklist = TIERS.map(t =>
            '<label class="pm-option" style="gap:8px;align-items:flex-start;"><input type="checkbox" class="meta-tier mt-0.5 accent-indigo-600 cursor-pointer" value="' + t.id + '"' + (t.on ? ' checked' : '') + '>' +
            '<div><div class="pm-option-label">' + t.label + '</div>' + (t.note ? '<div class="pm-option-desc">' + t.note + '</div>' : '') + '</div></label>').join('');
        const modal = document.createElement('div');
        modal.id = 'meta-analysis-modal';
        modal.className = 'fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-[3000] flex items-center justify-center p-4';
        modal.innerHTML =
            '<div class="bg-white rounded-2xl shadow-2xl w-[90vw] max-w-[520px] p-8 relative max-h-[92vh] overflow-y-auto">' +
                '<button type="button" id="meta-x" class="absolute top-6 right-6 text-slate-400 hover:text-slate-600"><i data-lucide="x" class="w-6 h-6"></i></button>' +
                '<div class="space-y-5">' +
                    '<div class="flex items-center gap-3"><div class="pm-icon-wrap"><i data-lucide="line-chart" class="w-5 h-5 text-indigo-600"></i></div>' +
                        '<div><div class="pm-title">Meta-analisi docente</div><div class="pm-subtitle">Scegli i livelli, poi carica la cartella con i vault degli studenti.</div></div></div>' +
                    '<div class="pm-section"><span class="pm-section-title">Livelli di analisi</span><div class="space-y-2">' + checklist + '</div></div>' +
                    '<div id="meta-status" style="font-size:14px;color:#475569;">Nessuna cartella selezionata.</div>' +
                    '<div class="flex gap-3 pt-2 border-t border-slate-100">' +
                        '<button type="button" id="meta-cancel" class="pm-btn-cancel">Chiudi</button>' +
                        '<button type="button" id="meta-go" class="pm-btn-primary"><i data-lucide="folder-open" class="w-4 h-4"></i> Scegli cartella e analizza</button>' +
                    '</div>' +
                '</div>' +
            '</div>';
        document.body.appendChild(modal);
        if (window.safeCreateIcons) window.safeCreateIcons();
        const close = () => modal.remove();
        modal.querySelector('#meta-x').addEventListener('click', close);
        modal.querySelector('#meta-cancel').addEventListener('click', close);
        modal.addEventListener('click', e => { if (e.target === modal) close(); });
        modal.querySelector('#meta-go').addEventListener('click', async () => {
            const tiers = new Set([...modal.querySelectorAll('.meta-tier:checked')].map(c => c.value));
            const status = modal.querySelector('#meta-status');
            if (!tiers.size) { status.textContent = 'Seleziona almeno un livello.'; return; }
            let pick; try { pick = await window.electronAPI.pickFolder(); } catch (e) { pick = null; }
            if (!pick || pick.canceled || !pick.folderPath) return;
            status.textContent = 'Analisi in corso…';
            const students = await gatherStudents(pick.folderPath);
            if (!students.length) { status.textContent = 'Nessun vault studente trovato nella cartella.'; return; }
            const hasKey = window.getSystemKey && window.getSystemKey();
            if ((tiers.has('t7') || tiers.has('t10')) && !hasKey) {
                if (window.showToast) window.showToast('Le sezioni AI richiedono API Key — genero senza', 'error');
                tiers.delete('t7'); tiers.delete('t10');
            }
            if (tiers.has('t10') && hasKey) {
                for (let i = 0; i < students.length; i++) {
                    status.textContent = 'Analisi chat AI ' + (i + 1) + '/' + students.length + '…';
                    try { students[i]._chatAI = await generateChatAnalysis(students[i]); } catch (e) {}
                }
            }
            if (tiers.has('t7') && hasKey) {
                for (let i = 0; i < students.length; i++) {
                    status.textContent = 'Neurofeedback AI ' + (i + 1) + '/' + students.length + '…';
                    try { students[i]._neuro = await generateNeurofeedback(students[i]); } catch (e) {}
                }
            }
            const klass = analyzeClass(students);
            close();
            openDashboard(students, klass, tiers);
            if (window.showToast) window.showToast('Dashboard pronta per ' + students.length + ' gruppi', 'success');
        });
    }

    window.MappAIMetaAnalysis.openModal = openModal;
    window.MappAIMetaAnalysis.openDashboard = openDashboard;
    window.MappAIMetaAnalysis._render = _report;
    console.log('%c📊 MappAIMetaAnalysis pronto', 'color:#6366f1;font-weight:bold', '— bottone "Analisi" sulla landing.');
})();
