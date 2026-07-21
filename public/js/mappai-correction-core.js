/*
 * mappai-correction-core.js — modello dati puro per le CORREZIONI ANNOTATE.
 *
 * Scopo: raccogliere, da un docente/tester, le correzioni strutturali su una
 * mappa generata (elimina/fondi/sposta/promuovi/rinomina/riscrivi/ritipizza
 * relazioni) come lista di OPERAZIONI TIPIZZATE con un CODICE-MOTIVO e una nota.
 * Il log risultante è ground-truth per tarare la pipeline (soglie deepening,
 * dedup, disciplina cross-link, contratto di grana) e per le analitiche tester
 * (quali difetti ricorrono di più).
 *
 * Due modi di produrlo:
 *  - LIVE: la UI di revisione chiama recordOp() a ogni edit (motivo confermato
 *    dall'utente).
 *  - RICOSTRUITO: diffMaps(before, after) inferisce le operazioni + un motivo
 *    candidato da una coppia prima/dopo già editata a mano (inferred:true).
 *
 * UMD, nessuna dipendenza. Testabile in Node.
 */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.MappAICorrectionCore = factory();
}(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    var MANIFEST = 'mappai-correction-log@1';

    // ── Tassonomia delle operazioni e dei motivi ────────────────────────────
    // Ogni op ha un insieme di motivi ammessi; il primo è il default suggerito.
    var OPS = {
        'delete':     { label: 'Elimina nodo',        reasons: ['paraphrase', 'off-topic', 'orphan', 'redundant', 'enumeration-item', 'noise'] },
        'merge':      { label: 'Fondi nodo',          reasons: ['duplicate', 'same-fact', 'enumeration-item'] },
        'move':       { label: 'Sposta nodo',         reasons: ['wrong-branch', 'wrong-parent', 'wrong-level'] },
        'promote-l1': { label: 'Promuovi a macro-area', reasons: ['new-macro-area', 'branch-too-mixed'] },
        'rename':     { label: 'Rinomina',            reasons: ['clearer-label', 'wrong-label'] },
        'edit-desc':  { label: 'Riscrivi descrizione', reasons: ['remove-offtopic', 'remove-duplicate-para', 'enrich', 'fix-fidelity'] },
        'retype-rel': { label: 'Cambia relazione',    reasons: ['generic-to-specific', 'should-be-sequence', 'should-be-causal', 'hierarchy-to-cross', 'cross-to-hierarchy'] },
        'add-rel':    { label: 'Aggiungi relazione',  reasons: ['sequence', 'causal', 'cross-branch', 'prerequisite'] },
        'remove-rel': { label: 'Rimuovi relazione',   reasons: ['spurious', 'redundant-with-hierarchy', 'wrong-direction'] },
        'add-node':   { label: 'Aggiungi nodo',       reasons: ['missing-concept', 'split-composite'] }
    };

    // Etichette leggibili dei motivi (per la UI e i report; IT come fallback).
    var REASON_LABELS = {
        'paraphrase': 'Parafrasi del padre', 'off-topic': 'Fuori tema del ramo',
        'orphan': 'Orfano / mal agganciato', 'redundant': 'Ridondante',
        'enumeration-item': 'Voce di elenco (va nella desc)', 'noise': 'Rumore / superfluo',
        'duplicate': 'Duplicato', 'same-fact': 'Stesso fatto',
        'wrong-branch': 'Ramo sbagliato', 'wrong-parent': 'Genitore sbagliato', 'wrong-level': 'Livello sbagliato',
        'new-macro-area': 'Nuova macro-area', 'branch-too-mixed': 'Ramo troppo eterogeneo',
        'clearer-label': 'Etichetta più chiara', 'wrong-label': 'Etichetta errata',
        'remove-offtopic': 'Tolto testo fuori tema', 'remove-duplicate-para': 'Tolto paragrafo duplicato',
        'enrich': 'Arricchita', 'fix-fidelity': 'Corretta fedeltà alla fonte',
        'generic-to-specific': 'Relazione generica → specifica', 'should-be-sequence': 'È una sequenza',
        'should-be-causal': 'È un nesso causale', 'hierarchy-to-cross': 'Gerarchia → laterale',
        'cross-to-hierarchy': 'Laterale → gerarchia',
        'sequence': 'Sequenza', 'causal': 'Causa', 'cross-branch': 'Collega rami', 'prerequisite': 'Prerequisito',
        'spurious': 'Spuria', 'redundant-with-hierarchy': 'Ridondante con la gerarchia', 'wrong-direction': 'Direzione errata',
        'missing-concept': 'Concetto mancante', 'split-composite': 'Scissione di composito'
    };

    function opReasons(op) { return (OPS[op] && OPS[op].reasons.slice()) || []; }
    function reasonLabel(code) { return REASON_LABELS[code] || code; }
    function isValidReason(op, reason) { return !!(OPS[op] && OPS[op].reasons.indexOf(reason) >= 0); }

    // ── Helper di grafo (puri) ──────────────────────────────────────────────
    function eid(x) { return (x && typeof x === 'object') ? x.id : x; }

    function indexNodes(nodes) {
        var m = {};
        (nodes || []).forEach(function (n) { if (n && n.id != null) m[n.id] = n; });
        return m;
    }

    // parent nell'albero (primo link non-cross entrante) e figli
    function treeMaps(links) {
        var parent = {}, children = {};
        (links || []).forEach(function (l) {
            if (l.isCross || l.isBridge) return;
            var s = eid(l.source), t = eid(l.target);
            if (parent[t] === undefined) parent[t] = s;
            (children[s] = children[s] || []).push(t);
        });
        return { parent: parent, children: children };
    }

    function linkKey(l) { return eid(l.source) + '→' + eid(l.target); }

    // ── Tokenizzazione minimale per l'inferenza del motivo (no dipendenze) ───
    var STOP = (function () {
        var s = {};
        ('il lo la i gli le un una uno di a da in con su per tra fra e che del della dei delle dello degli al alla ai alle allo agli è era erano come anche più non si questo questa questi queste quella quelle quello quelli loro suo sua nel nella nei nelle dal dalla dai dalle molto poi dopo prima dove cioè ad ed o se ma sono essere aveva hanno fu furono già così quando tutto tutti solo senza')
            .split(/\s+/).forEach(function (w) { s[w] = 1; });
        return s;
    })();
    function toks(str) {
        var out = {}, arr = String(str || '').toLowerCase().replace(/[^a-zàèéìòù0-9\s]/gi, ' ').split(/\s+/);
        for (var i = 0; i < arr.length; i++) { var w = arr[i]; if (w.length > 2 && !STOP[w]) out[w] = 1; }
        return out;
    }
    function containment(small, big) {  // quota dei token di `small` presenti in `big`
        var ks = Object.keys(small); if (!ks.length) return 0;
        var n = 0; for (var i = 0; i < ks.length; i++) if (big[ks[i]]) n++;
        return n / ks.length;
    }

    // ── recordOp / newLog / summarize ───────────────────────────────────────
    function newLog(meta) {
        return {
            manifest: MANIFEST,
            map: (meta && meta.map) || '',
            source: (meta && meta.source) || '',   // 'live' | 'reconstructed'
            createdAt: (meta && meta.createdAt) || null,  // stamp iniettato dal chiamante (Date non disponibile qui)
            ops: []
        };
    }

    // op minima: { op, reason, note?, target?, into?, before?, after?, inferred? }
    function recordOp(log, op) {
        if (!log || !op || !op.op) throw new Error('recordOp: op mancante');
        if (!OPS[op.op]) throw new Error('recordOp: op sconosciuta ' + op.op);
        if (op.reason && !isValidReason(op.op, op.reason)) {
            // motivo fuori tassonomia: lo teniamo ma marchiamo (permette note libere del tester)
            op._reasonCustom = true;
        }
        var rec = {
            op: op.op,
            target: op.target != null ? op.target : null,
            into: op.into != null ? op.into : null,
            reason: op.reason || opReasons(op.op)[0] || null,
            note: op.note || '',
            before: op.before || null,
            after: op.after || null,
            inferred: !!op.inferred
        };
        if (op._reasonCustom) rec.reasonCustom = true;
        if (op.seq != null) rec.seq = op.seq;
        log.ops.push(rec);
        return rec;
    }

    // Analitiche per i tester: quante op per tipo, per motivo, % inferite.
    function summarize(log) {
        var byOp = {}, byReason = {}, inferred = 0;
        (log.ops || []).forEach(function (r) {
            byOp[r.op] = (byOp[r.op] || 0) + 1;
            var key = r.op + ':' + (r.reason || '?');
            byReason[key] = (byReason[key] || 0) + 1;
            if (r.inferred) inferred++;
        });
        return { total: (log.ops || []).length, byOp: byOp, byReason: byReason, inferred: inferred };
    }

    function serialize(log) { return JSON.stringify(log, null, 2); }
    function parse(str) {
        var o = typeof str === 'string' ? JSON.parse(str) : str;
        if (!o || o.manifest !== MANIFEST) throw new Error('log non valido');
        return o;
    }

    // ── diffMaps: ricostruisce le operazioni da una coppia prima/dopo ───────
    // before/after: { nodes:[], links:[] }. Ritorna un log con ops inferred:true.
    function diffMaps(before, after, meta) {
        var log = newLog(Object.assign({ source: 'reconstructed' }, meta || {}));
        var A = indexNodes(before.nodes), B = indexNodes(after.nodes);
        var tA = treeMaps(before.links), tB = treeMaps(after.links);
        var idsA = Object.keys(A), idsB = Object.keys(B);
        var seq = 0;

        var deleted = idsA.filter(function (id) { return !B[id]; });
        var added = idsB.filter(function (id) { return !A[id]; });

        // token cache
        var tokB = {}; idsB.forEach(function (id) { tokB[id] = toks((B[id].label || '') + ' ' + (B[id].desc || B[id].content || '')); });

        // DELETE vs MERGE: un nodo sparito è "fuso" se la sua desc è stata
        // assorbita da un nodo superstite (containment alto) o se i suoi figli
        // sono stati riagganciati a un superstite.
        deleted.forEach(function (id) {
            var d = A[id];
            var dTok = toks((d.label || '') + ' ' + (d.desc || d.content || ''));
            var childrenNow = (tA.children[id] || []);
            var into = null, bestCont = 0;

            // (a) figli di d ora agganciati altrove → quel nuovo genitore è il "into"
            for (var c = 0; c < childrenNow.length; c++) {
                var cid = childrenNow[c];
                if (B[cid] && tB.parent[cid] && tB.parent[cid] !== id && B[tB.parent[cid]]) {
                    into = tB.parent[cid]; break;
                }
            }
            // (b) desc assorbita da un superstite (label simile o desc-containment alto)
            if (!into) {
                for (var k = 0; k < idsB.length; k++) {
                    var bid = idsB[k];
                    var cont = containment(dTok, tokB[bid]);
                    if (cont > bestCont) { bestCont = cont; if (cont >= 0.55) into = bid; }
                }
            }

            if (into) {
                recordOp(log, {
                    op: 'merge', target: id, into: into, inferred: true, seq: ++seq,
                    reason: bestCont >= 0.7 ? 'duplicate' : 'same-fact',
                    before: snap(d, tA), after: { into: into, intoLabel: B[into].label }
                });
            } else {
                // motivo di delete: orfano? parafrasi? voce d'elenco? off-topic?
                var wasOrphan = tA.parent[id] === undefined;
                var parentA = tA.parent[id] ? A[tA.parent[id]] : null;
                var parentCont = parentA ? containment(dTok, toks(parentA.desc || parentA.content || '')) : 0;
                var reason = wasOrphan ? 'orphan'
                    : (/_D\d+$/.test(id) && parentCont >= 0.5) ? 'paraphrase'
                        : (/_D\d+$/.test(id)) ? 'off-topic'
                            : 'redundant';
                recordOp(log, {
                    op: 'delete', target: id, inferred: true, seq: ++seq, reason: reason,
                    before: snap(d, tA)
                });
            }
        });

        // ADD-NODE
        added.forEach(function (id) {
            recordOp(log, {
                op: 'add-node', target: id, inferred: true, seq: ++seq,
                reason: 'missing-concept',
                after: { label: B[id].label, level: B[id].level, group: B[id].group, parent: tB.parent[id] || null }
            });
        });

        // NODI PRESENTI IN ENTRAMBI: move / promote-l1 / rename / edit-desc
        idsA.filter(function (id) { return B[id]; }).forEach(function (id) {
            var a = A[id], b = B[id];
            var pa = tA.parent[id], pb = tB.parent[id];

            if ((pa || null) !== (pb || null) || a.level !== b.level) {
                if (b.level === 1 || pb === 'ROOT' || pb == null && b.level === 1) {
                    recordOp(log, {
                        op: 'promote-l1', target: id, inferred: true, seq: ++seq, reason: 'new-macro-area',
                        before: { parent: pa || null, level: a.level, group: a.group },
                        after: { level: b.level, group: b.group }
                    });
                } else if ((pa || null) !== (pb || null)) {
                    recordOp(log, {
                        op: 'move', target: id, into: pb || null, inferred: true, seq: ++seq,
                        reason: a.group !== b.group ? 'wrong-branch' : 'wrong-parent',
                        before: { parent: pa || null, level: a.level, group: a.group },
                        after: { parent: pb || null, level: b.level, group: b.group }
                    });
                }
                // group cambiato senza spostamento di parent = pura riassegnazione ramo
            } else if (a.group !== b.group) {
                recordOp(log, {
                    op: 'move', target: id, into: pb || null, inferred: true, seq: ++seq, reason: 'wrong-branch',
                    before: { group: a.group }, after: { group: b.group }
                });
            }

            if ((a.label || '').trim() !== (b.label || '').trim()) {
                recordOp(log, {
                    op: 'rename', target: id, inferred: true, seq: ++seq, reason: 'clearer-label',
                    before: { label: a.label }, after: { label: b.label }
                });
            }
            var da = (a.desc || '').trim(), db = (b.desc || '').trim();
            if (da !== db) {
                var shrank = db.length < da.length * 0.85;
                var hadDoublePara = /\n\n/.test(da) && !/\n\n/.test(db);
                recordOp(log, {
                    op: 'edit-desc', target: id, inferred: true, seq: ++seq,
                    reason: hadDoublePara ? 'remove-duplicate-para' : (shrank ? 'remove-offtopic' : 'enrich'),
                    before: { descLen: da.length }, after: { descLen: db.length }
                });
            }
        });

        // RELAZIONI: removed / added / retyped (per chiave source→target)
        var lmA = {}, lmB = {};
        (before.links || []).forEach(function (l) { lmA[linkKey(l)] = l; });
        (after.links || []).forEach(function (l) { lmB[linkKey(l)] = l; });
        var keysA = Object.keys(lmA), keysB = Object.keys(lmB);

        // helper: label leggibile di un endpoint (post-diff usa B se esiste, else A)
        function lbl(id) { return (B[id] && B[id].label) || (A[id] && A[id].label) || id; }

        keysA.filter(function (k) { return !lmB[k]; }).forEach(function (k) {
            var l = lmA[k], s = eid(l.source), t = eid(l.target);
            // se uno dei due estremi è sparito, la rimozione è conseguenza di delete/merge → non la contiamo come op relazione
            if (!B[s] || !B[t]) return;
            var reason = l.rel === 'approfondisce' ? 'redundant-with-hierarchy'
                : (l.isCross ? 'spurious' : 'spurious');
            recordOp(log, {
                op: 'remove-rel', target: k, inferred: true, seq: ++seq, reason: reason,
                before: { rel: l.rel, isCross: !!l.isCross, source: lbl(s), target: lbl(t) }
            });
        });
        keysB.filter(function (k) { return !lmA[k]; }).forEach(function (k) {
            var l = lmB[k], s = eid(l.source), t = eid(l.target);
            if (!A[s] || !A[t]) return;  // relazione verso un nodo nuovo → già implicita in add-node
            var seqRel = /segu|precede|deriva|richiede|dipende/i.test(l.rel);
            var caus = /causa|catalizza|alimenta|genera|provoca|stimola|porta a/i.test(l.rel);
            recordOp(log, {
                op: 'add-rel', target: k, inferred: true, seq: ++seq,
                reason: seqRel ? 'sequence' : (caus ? 'causal' : (l.isCross ? 'cross-branch' : 'causal')),
                after: { rel: l.rel, isCross: !!l.isCross, source: lbl(s), target: lbl(t) }
            });
        });
        keysA.filter(function (k) { return lmB[k]; }).forEach(function (k) {
            var la = lmA[k], lb = lmB[k];
            if (la.rel === lb.rel && !!la.isCross === !!lb.isCross) return;
            var s = eid(la.source), t = eid(la.target);
            var reason = (!!la.isCross && !lb.isCross) ? 'cross-to-hierarchy'
                : (!la.isCross && !!lb.isCross) ? 'hierarchy-to-cross'
                    : /segu|precede|deriva/i.test(lb.rel) ? 'should-be-sequence'
                        : /causa|alimenta|catalizza|genera|dipende|richiede/i.test(lb.rel) ? 'should-be-causal'
                            : 'generic-to-specific';
            recordOp(log, {
                op: 'retype-rel', target: k, inferred: true, seq: ++seq, reason: reason,
                before: { rel: la.rel, isCross: !!la.isCross }, after: { rel: lb.rel, isCross: !!lb.isCross },
                note: lbl(s) + ' → ' + lbl(t)
            });
        });

        return log;
    }

    function snap(node, tmaps) {
        return { label: node.label, level: node.level, group: node.group, parent: tmaps.parent[node.id] || null };
    }

    return {
        MANIFEST: MANIFEST,
        OPS: OPS,
        REASON_LABELS: REASON_LABELS,
        opReasons: opReasons,
        reasonLabel: reasonLabel,
        isValidReason: isValidReason,
        newLog: newLog,
        recordOp: recordOp,
        summarize: summarize,
        serialize: serialize,
        parse: parse,
        diffMaps: diffMaps,
        // esposti per test/UI
        _treeMaps: treeMaps,
        _indexNodes: indexNodes
    };
}));
