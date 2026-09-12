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
                triage: 'Triage struttura fonte',
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
                quiz_open: 'Domande aperte',
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
        const rec = {
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
        /* I QUATTRO CAMPI DIAGNOSTICI (12/9) PASSANO DI QUI, se ci sono.
           ⚠️ Questa funzione RICOSTRUISCE l'oggetto invece di copiarlo, quindi
           tutto ciò che non è elencato sopra sparisce in silenzio: senza queste
           righe una futura diagnostica in-app leggerebbe zero troncamenti e
           sembrerebbe che il registro non li abbia mai scritti, mentre sul file
           grezzo ci sono. Restano OPZIONALI: 4581 righe di registro sono più
           vecchie del 12/9 e non ne hanno nessuno, e chi legge deve poterle
           distinguere da una riga nuova con pensiero a zero. */
        if (Number(o.n) > 0) rec.n = Number(o.n);
        if (Number(o.thoughts) > 0) rec.thoughts = Number(o.thoughts);
        if (o.stop) rec.stop = String(o.stop);
        if (Number(o.tetto) > 0) rec.tetto = Number(o.tetto);
        return rec;
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

    /* ══ IL LIMITE DEL PROVIDER (11/8/26) ═════════════════════════════════════
       Trovato generando una sintesi vera: la voce naturale fa UNA chiamata per
       blocco, in fila e senza pause, e il piano gratuito di Google ne ammette
       **10 al minuto** sul modello TTS. Alla decima arriva un 429 e — prima di
       questo — tutto il lavoro si perdeva: i clip già generati (e già pagati)
       venivano buttati insieme all'errore.
       Due funzioni pure, perché sono la parte che si può sbagliare in silenzio:
       il conto della finestra e la lettura dell'attesa dichiarata dall'API. */

    /* Quanto aspettare prima di ritentare, secondo l'errore stesso. Google lo
       dice in due modi nella stessa risposta (`retryDelay: "59s"` e «Please
       retry in 59.7s»): si leggono entrambi, e vince il più lungo — ritentare
       troppo presto vuol dire un secondo 429 e un altro giro perso.
       0 = l'errore non parla di attese: non è un rate limit. */
    function retryDelayMs(err) {
        var s = '';
        if (err == null) return 0;
        if (typeof err === 'string') s = err;
        else s = String(err.message || err.error || JSON.stringify(err) || '');
        if (!/429|RESOURCE_EXHAUSTED|quota|rate.?limit/i.test(s)) return 0;
        var ms = 0;
        var m1 = /"?retryDelay"?\s*[:=]\s*"?(\d+(?:\.\d+)?)s/i.exec(s);
        if (m1) ms = Math.max(ms, Math.round(parseFloat(m1[1]) * 1000));
        var m2 = /retry in\s+(\d+(?:\.\d+)?)\s*s/i.exec(s);
        if (m2) ms = Math.max(ms, Math.round(parseFloat(m2[1]) * 1000));
        /* un 429 che non dichiara l'attesa esiste: si aspetta un minuto, che è
           la finestra di questi limiti */
        return ms || 60000;
    }

    /* ── «ASPETTA UN ATTIMO» O «PER OGGI HAI FINITO»? ────────────────────────
       Un 429 non dice sempre la stessa cosa, e le due cose vogliono risposte
       opposte: il limite al MINUTO si risolve aspettando qualche secondo, quello
       GIORNALIERO no — aspettare è tempo buttato, e va detto subito.
       🐛 Da qui il guasto visto da Giacomo il 17/8: la voce si è fermata al
       blocco 23 di 78 con «limite raggiunto, riprendo fra 1000s». Il codice
       leggeva solo il ritardo dichiarato e obbediva: un conto alla rovescia di
       diciassette minuti che, alla fine, si sarebbe comunque arreso. Con 23
       blocchi già pagati persi alla chiusura dell'app.
       Due segnali, e basta che uno sia vero:
        · il nome della quota nell'errore (Google scrive `…PerDay`, `daily`…);
        · un ritardo ENORME. Un limite al minuto non chiede mai due minuti:
          quella è la firma di una finestra molto più larga.
       Pura, così la si prova in Node su errori veri copiati dal provider. */
    function limiteGiornaliero(err, sogliaMs) {
        if (err == null) return false;
        var soglia = parseInt(sogliaMs, 10); if (!(soglia > 0)) soglia = 120000;
        var s = (typeof err === 'string') ? err
            : String((err && (err.message || err.error)) || JSON.stringify(err) || '');
        if (!/429|RESOURCE_EXHAUSTED|quota|rate.?limit/i.test(s)) return false;
        if (/per.?day|daily|al.?giorno|giornalier/i.test(s)) return true;
        return retryDelayMs(err) >= soglia;
    }

    /* ── QUANTO CI METTE, E QUANTE CHIAMATE COSTA ────────────────────────────
       La voce naturale fa UNA chiamata per blocco di testo, contro un tetto al
       minuto: una sintesi dell'intera mappa sono decine di minuti, e finora
       nessuno lo diceva PRIMA di cominciare — si scopriva guardando lo spinner.
       `unaParola` = i blocchi di una parola sola (i titoli): il modello di
       default li rifiuta, quindi con il ripiego acceso ognuno costa DUE
       chiamate, una buttata e una buona.
       Il tempo non è `chiamate / rpm`: la finestra è scorrevole, quindi le prime
       `rpm` partono subito e solo dopo si aspetta. A questo si somma il tempo
       della chiamata stessa, che è sequenziale — con poche chiamate è lui a
       dominare, non l'attesa. */
    function stimaTts(o) {
        o = o || {};
        var blocchi = Math.max(0, parseInt(o.blocchi, 10) || 0);
        var unaParola = Math.max(0, parseInt(o.unaParola, 10) || 0);
        var rpm = parseInt(o.rpm, 10); if (!(rpm > 0)) rpm = 10;
        var lat = parseInt(o.latenzaMs, 10); if (!(lat > 0)) lat = 4000;
        var chiamate = blocchi + (o.ripiego ? Math.min(unaParola, blocchi) : 0);
        var attesa = chiamate > rpm ? (chiamate - rpm) * (60 / rpm) : 0;
        var secondi = Math.round(chiamate * (lat / 1000) + attesa);
        return { chiamate: chiamate, secondi: secondi, minuti: Math.max(1, Math.round(secondi / 60)) };
    }

    /* Fra quanti ms si può fare la prossima chiamata senza sfondare il limite.
       Finestra SCORREVOLE, non una pausa fissa: le prime `limite` chiamate
       partono subito (una sintesi corta non rallenta di un secondo) e solo dopo
       si aspetta il tempo che serve alla più vecchia per uscire dal minuto.
       `timestamps` = quando sono partite le chiamate precedenti (ms). */
    function nextSlotMs(timestamps, now, limite, finestraMs) {
        var lim = parseInt(limite, 10); if (!(lim > 0)) lim = 10;
        var win = parseInt(finestraMs, 10); if (!(win > 0)) win = 60000;
        var t = (timestamps || []).filter(function (x) { return (now - x) < win; })
            .sort(function (a, b) { return a - b; });
        if (t.length < lim) return 0;
        /* la più vecchia DENTRO la finestra decide: quando esce, si libera un
           posto. +250ms di margine perché l'orologio del server non è il nostro */
        var attesa = win - (now - t[t.length - lim]) + 250;
        return attesa > 0 ? attesa : 0;
    }

    return {
        retryDelayMs: retryDelayMs,
        limiteGiornaliero: limiteGiornaliero,
        stimaTts: stimaTts,
        nextSlotMs: nextSlotMs,
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
