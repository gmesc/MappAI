/*
 * mappai-vista-core.js — la VISTA di una mappa viaggia col suo vault (15/8/26)
 * ---------------------------------------------------------------------------
 * Quattro cose vivevano SOLO nello snapshot in localStorage: il profilo della
 * Vista studio, il focus/lenti, la timeline e il foglio dei nodi rivisto.
 * Misurato su un foglio vero (Project E, 251 KB): il 99% del foglio è una
 * fotocopia di ciò che il vault ha già — e il pezzo insostituibile pesa
 * QUALCHE KB. Conseguenza: aprire lo stesso vault su un altro computer (o dopo
 * una pulizia del browser interno) perdeva quelle quattro cose in silenzio.
 *
 * Questo core dice CHE COSA entra in `vista.json` e come si riapplica:
 *   - `raccogli(stato)`  → l'oggetto da scrivere nel vault (o null se vuoto);
 *   - `applica(stato, vista)` → riporta la vista dentro lo stato caricato.
 * L'I/O non sta qui (invariante 19): scrive main.js, monta vault-io.
 *
 * Regola di fusione, ed è la parte che conta: `applica` NON azzera mai ciò che
 * lo stato ha già quando la vista non porta quel campo — un vault vecchio
 * senza vista.json non deve cancellare la timeline appena costruita in
 * memoria. E `raccogli` non scrive un file per dire «tutto vuoto»: null.
 *
 * UMD puro, testato in Node (tests/vista-core.test.js). Schema versionato:
 * `mappai-vista@1` — chi leggerà una v2 saprà di doverla capire prima.
 */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.MappAIVistaCore = factory();
}(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    var SCHEMA = 'mappai-vista@1';

    function _pieno(v) {
        if (v == null) return false;
        if (Array.isArray(v)) return v.length > 0;
        if (typeof v === 'object') return Object.keys(v).length > 0;
        return String(v).trim() !== '';
    }

    /* Dallo stato dell'app all'oggetto per vista.json. `stato` è appState (o
       un suo pari di prova); si legge, mai si modifica. */
    function raccogli(stato) {
        if (!stato) return null;
        var db = stato.db || {};
        var out = { schema: SCHEMA, salvato: null };
        var qualcosa = false;
        if (_pieno(stato.studioProfile)) { out.studioProfile = stato.studioProfile; qualcosa = true; }
        if (_pieno(stato.focusTopic)) { out.focusTopic = String(stato.focusTopic); qualcosa = true; }
        if (_pieno(stato.semanticGuidance)) { out.semanticGuidance = String(stato.semanticGuidance); qualcosa = true; }
        if (_pieno(db.timelineEvents)) { out.timelineEvents = db.timelineEvents; qualcosa = true; }
        if (_pieno(db.timelineAI)) { out.timelineAI = db.timelineAI; qualcosa = true; }
        if (_pieno(db.nodeSheet)) { out.nodeSheet = db.nodeSheet; qualcosa = true; }
        return qualcosa ? out : null;
    }

    /* Dalla vista letta dal vault allo stato appena caricato. Ritorna l'elenco
       dei campi applicati (serve ai log e ai test, non alla UI). */
    function applica(stato, vista) {
        var applicati = [];
        if (!stato || !vista || typeof vista !== 'object') return applicati;
        /* schema sconosciuto = scritto da una MappAI più nuova: meglio non
           applicare niente che applicare a metà */
        if (vista.schema && vista.schema !== SCHEMA) return applicati;
        if (!stato.db || typeof stato.db !== 'object') stato.db = {};
        if (_pieno(vista.studioProfile)) { stato.studioProfile = vista.studioProfile; applicati.push('studioProfile'); }
        if (_pieno(vista.focusTopic)) { stato.focusTopic = String(vista.focusTopic); applicati.push('focusTopic'); }
        if (_pieno(vista.semanticGuidance)) { stato.semanticGuidance = String(vista.semanticGuidance); applicati.push('semanticGuidance'); }
        if (_pieno(vista.timelineEvents)) { stato.db.timelineEvents = vista.timelineEvents; applicati.push('timelineEvents'); }
        if (_pieno(vista.timelineAI)) { stato.db.timelineAI = vista.timelineAI; applicati.push('timelineAI'); }
        if (_pieno(vista.nodeSheet)) { stato.db.nodeSheet = vista.nodeSheet; applicati.push('nodeSheet'); }
        return applicati;
    }

    /* Lo SNAPSHOT SNELLO (parte del medesimo lavoro): dopo il disegno D3 ogni
       arco porta dentro l'INTERO nodo di partenza e di arrivo, e il foglio in
       localStorage si gonfia (misurato: 120 KB di link per 8,8 KB di dati).
       Qui i link tornano coppie di id. Copia superficiale: lo stato vivo non
       si tocca. */
    function statoSnello(stato) {
        if (!stato) return stato;
        var db = stato.db || {};
        var links = (db.links || []).map(function (l) {
            var s = Object.assign({}, l);
            if (s.source && typeof s.source === 'object') s.source = s.source.id;
            if (s.target && typeof s.target === 'object') s.target = s.target.id;
            /* i campi che D3 rimette da sé a ogni disegno */
            delete s.index;
            return s;
        });
        /* anche i nodi si portano dietro le coordinate di lavoro di D3 (vx/vy,
           fx/fy null espliciti): innocue ma inutili — restano, toglierle
           cambierebbe il comportamento del pin. Si tolgono solo i link. */
        return Object.assign({}, stato, { db: Object.assign({}, db, { links: links }) });
    }

    return { SCHEMA: SCHEMA, raccogli: raccogli, applica: applica, statoSnello: statoSnello };
}));
