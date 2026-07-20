'use strict';
/*
 * mappai-usage-core.js — logica PURA del registro consumi AI (headless, UMD).
 * Nessun DOM, nessun Electron: usato dal tracker renderer, dalla dashboard
 * e dai test Node. I record NON contengono costi: solo token + provider +
 * modello + contesto; i costi si calcolano a display-time da MODEL_KB
 * (prezzi per 1M token: Google=USD, Infomaniak=CHF) + tasso USD→CHF.
 *
 * Record: { ts, provider, model, inTok, outTok, cat, sub, project, projectId }
 */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.MappAIUsageCore = factory();
}(typeof self !== 'undefined' ? self : this, function () {

    // ── Tassonomia (livello 1 → sottocategorie della ciambella di dettaglio) ──
    const CATS = {
        map: {
            label: 'Generazione mappa',
            subs: {
                mm_iterative: 'MindMap iterativa',
                mm_phase1: 'MindMap — Fase 1 (macro-aree)',
                mm_phase3: 'MindMap — Fase 3 (rami)',
                mm_phase4: 'MindMap — Fase 4 (merge)',
                mm_phase5: 'MindMap — Fase 5 (riclassificazione)',
                l1_validation: 'Validazione macro-aree',
                l1_split: 'Split macro-aree',
                enrich: 'Arricchimento descrizioni',
                deepen: 'Approfondimento foglie',
                kg_single: 'Knowledge Graph single-pass',
                kg_community: 'Knowledge Graph Community',
                kg_multipass: 'Knowledge Graph multi-pass',
                crosslink: 'Cross-link AI',
                expand: 'Espandi con AI'
            }
        },
        materials: {
            label: 'Materiali di studio',
            subs: {
                synthesis: 'Sintesi di ramo/mappa',
                tts: 'Audio voce naturale',
                nodesheet: 'Foglio nodi (keyword)',
                timeline: 'Timeline'
            }
        },
        study: {
            label: 'Studio attivo',
            subs: {
                quiz_mc: 'Quiz a scelta multipla',
                quiz_tf: 'Quiz vero/falso',
                quiz_open: 'Quiz a domanda aperta',
                flashcards: 'Flashcard',
                node_quiz: 'Quiz/flashcard dal nodo',
                active_modes: 'Valutazioni AI (modalità di studio)',
                progress: 'Analisi progressi',
                dungeon: 'Gioco (quiz e NPC)'
            }
        },
        tutor: {
            label: 'Tutor AI',
            subs: {
                node: 'Chat dal nodo',
                sidebar: 'Chat dalla sidebar',
                quiz: 'Quiz del tutor',
                qr: 'Tutor QR (Chatta e Scrivi)'
            }
        },
        live: {
            label: 'Attività live',
            subs: { quiz: 'Quiz live' }
        },
        pipeline: {
            label: 'Pipeline materiali',
            subs: {
                map: 'Mappa',
                quiz_mc: 'Quiz a scelta multipla',
                quiz_tf: 'Quiz Vero/Falso',
                flashcards: 'Flashcard',
                nodesheet: 'Foglio nodi',
                synthesis: 'Sintesi',
                tts: 'Voce naturale'
            }
        },
        other: {
            label: 'Altro',
            subs: { admin_test: 'Test prompt (admin)', misc: 'Non classificato' }
        }
    };

    function catLabel(cat) {
        return (CATS[cat] && CATS[cat].label) || CATS.other.label;
    }
    function subLabel(cat, sub) {
        const c = CATS[cat];
        return (c && c.subs && c.subs[sub]) || CATS.other.subs.misc;
    }

    // ── Normalizzazione record (tollerante a righe legacy/sporche) ──────────
    function normalizeRecord(r) {
        const o = r || {};
        const cat = (o.cat && CATS[o.cat]) ? o.cat : 'other';
        const subs = CATS[cat].subs;
        return {
            ts: typeof o.ts === 'string' ? o.ts : '',
            provider: o.provider === 'infomaniak' ? 'infomaniak' : 'google',
            model: String(o.model || '?'),
            inTok: Math.max(0, Number(o.inTok) || 0),
            outTok: Math.max(0, Number(o.outTok) || 0),
            cat: cat,
            sub: (o.sub && subs[o.sub]) ? o.sub : 'misc',
            project: String(o.project || '').trim() || 'Senza titolo',
            projectId: o.projectId != null ? o.projectId : null
        };
    }

    // ── Costo di un record in CHF ────────────────────────────────────────────
    // kb = { inputCost, outputCost } per 1M token (USD se google, CHF se infomaniak)
    // usdChf = tasso di conversione USD→CHF (usato solo per google)
    function costOf(rec, kb, usdChf) {
        const rate = rec.provider === 'infomaniak' ? 1 : ((Number(usdChf) > 0) ? Number(usdChf) : 1);
        const kIn = kb ? (Number(kb.inputCost) || 0) : 0;
        const kOut = kb ? (Number(kb.outputCost) || 0) : 0;
        const inCost = (rec.inTok / 1e6) * kIn * rate;
        const outCost = (rec.outTok / 1e6) * kOut * rate;
        return { inCost, outCost, total: inCost + outCost, known: !!kb };
    }

    function _bucket(label) {
        return { label: label || '', calls: 0, inTok: 0, outTok: 0, inCost: 0, outCost: 0, total: 0 };
    }
    function _acc(b, rec, c) {
        b.calls += 1;
        b.inTok += rec.inTok; b.outTok += rec.outTok;
        b.inCost += c.inCost; b.outCost += c.outCost; b.total += c.total;
    }

    // ── Aggregazione (una passata) ───────────────────────────────────────────
    // opts: { kbLookup: (model, provider) => kb|null, usdChf: number }
    function aggregate(records, opts) {
        const kbLookup = (opts && opts.kbLookup) || function () { return null; };
        const usdChf = (opts && opts.usdChf) || 1;
        const out = {
            totals: _bucket('Totale'),
            byCat: {}, byModel: {}, byProvider: {},
            unknownModels: []
        };
        (records || []).forEach(function (raw) {
            const rec = normalizeRecord(raw);
            if (!rec.inTok && !rec.outTok) return;
            const kb = kbLookup(rec.model, rec.provider);
            const c = costOf(rec, kb, usdChf);
            if (!c.known && out.unknownModels.indexOf(rec.model) < 0) out.unknownModels.push(rec.model);
            _acc(out.totals, rec, c);
            if (!out.byCat[rec.cat]) { out.byCat[rec.cat] = _bucket(catLabel(rec.cat)); out.byCat[rec.cat].bySub = {}; }
            _acc(out.byCat[rec.cat], rec, c);
            const subs = out.byCat[rec.cat].bySub;
            if (!subs[rec.sub]) subs[rec.sub] = _bucket(subLabel(rec.cat, rec.sub));
            _acc(subs[rec.sub], rec, c);
            if (!out.byModel[rec.model]) { out.byModel[rec.model] = _bucket(rec.model); out.byModel[rec.model].provider = rec.provider; }
            _acc(out.byModel[rec.model], rec, c);
            if (!out.byProvider[rec.provider]) out.byProvider[rec.provider] = _bucket(rec.provider === 'infomaniak' ? 'Infomaniak (Svizzera)' : 'Google (Gemini)');
            _acc(out.byProvider[rec.provider], rec, c);
        });
        return out;
    }

    // ── Elenco documenti (progetti/mappe) presenti nel registro ─────────────
    function projectKey(rec) {
        const r = normalizeRecord(rec);
        return r.projectId != null ? String(r.projectId) : ('label:' + r.project);
    }
    function listProjects(records) {
        const map = {};
        (records || []).forEach(function (raw) {
            const rec = normalizeRecord(raw);
            if (!rec.inTok && !rec.outTok) return;
            const key = projectKey(rec);
            if (!map[key]) map[key] = { key: key, label: rec.project, calls: 0, lastTs: '' };
            map[key].calls += 1;
            if (rec.ts > map[key].lastTs) { map[key].lastTs = rec.ts; map[key].label = rec.project; }
        });
        return Object.keys(map).map(function (k) { return map[k]; })
            .sort(function (a, b) { return b.lastTs < a.lastTs ? -1 : 1; });
    }
    function filterByProject(records, key) {
        if (!key) return records || [];
        return (records || []).filter(function (r) { return projectKey(r) === key; });
    }

    // ── Dati per le ciambelle ────────────────────────────────────────────────
    function _donutFrom(obj) {
        return Object.keys(obj)
            .map(function (k) { return { key: k, label: obj[k].label, value: obj[k].total, calls: obj[k].calls, inTok: obj[k].inTok, outTok: obj[k].outTok }; })
            .filter(function (d) { return d.value > 0; })
            .sort(function (a, b) { return b.value - a.value; });
    }
    function donutByCat(agg) { return _donutFrom(agg.byCat); }
    function donutBySub(agg, cat) {
        const c = agg.byCat[cat];
        return c ? _donutFrom(c.bySub) : [];
    }
    function donutByModel(agg) { return _donutFrom(agg.byModel); }

    // ── Formattazione ────────────────────────────────────────────────────────
    function fmtChf(n) {
        const v = Number(n) || 0;
        if (v === 0) return '0.00 CHF';
        if (v < 0.01) return v.toFixed(4) + ' CHF';
        return v.toFixed(2) + ' CHF';
    }
    function fmtTok(n) {
        const v = Math.round(Number(n) || 0);
        return String(v).replace(/\B(?=(\d{3})+(?!\d))/g, "'");
    }

    return {
        CATS: CATS,
        catLabel: catLabel,
        subLabel: subLabel,
        normalizeRecord: normalizeRecord,
        costOf: costOf,
        aggregate: aggregate,
        projectKey: projectKey,
        listProjects: listProjects,
        filterByProject: filterByProject,
        donutByCat: donutByCat,
        donutBySub: donutBySub,
        donutByModel: donutByModel,
        fmtChf: fmtChf,
        fmtTok: fmtTok
    };
}));
