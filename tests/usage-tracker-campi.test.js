'use strict';
/*
 * usage-tracker-campi.test.js — i quattro campi diagnostici del 12/9.
 *
 * PERCHÉ esiste questo file. Il registro consumi sapeva quanti token erano
 * usciti e nient'altro, e per questo la domanda «abbassare il numero di domande
 * riduce i troncamenti?» è rimasta senza risposta per due giorni: mancava il
 * denominatore (quante cose erano state chieste), mancava il motivo per cui la
 * chiamata si era fermata, e `outTok` conta solo la risposta mentre il tetto lo
 * riempiono anche i token di PENSIERO. Il troncamento si indovinava dai valori
 * ripetuti nel file (2865 contro un tetto di 2880, 8385 contro 8400).
 *
 * Quel che va protetto qui è una regola sola: i campi si scrivono quando dicono
 * qualcosa e spariscono quando no, perché la loro ASSENZA è a sua volta
 * un'informazione (nessun array = la chiamata non chiede un numero di cose;
 * nessun `thoughts` = il pensiero era spento). Se un giorno qualcuno li rendesse
 * sempre presenti a zero, quella distinzione morirebbe in silenzio.
 */
const { test } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');

/* Il tracker è un modulo di renderer: si carica dentro un `window` finto, con
   un localStorage in memoria come sola via d'uscita (in Node `electronAPI` non
   esiste, quindi `record` cade sul ramo di ripiego — ed è quello che leggiamo). */
function caricaTracker() {
    const src = fs.readFileSync(
        path.join(__dirname, '..', 'public', 'js', 'mappai-usage-tracker.js'), 'utf8');
    const cassetto = {};
    const localStorage = {
        getItem: k => (k in cassetto ? cassetto[k] : null),
        setItem: (k, v) => { cassetto[k] = String(v); },
    };
    const window = { appState: { rootNodeLabel: 'Prova' }, localStorage };
    // eslint-disable-next-line no-new-func
    new Function('window', 'localStorage', 'appState', src)(window, localStorage, window.appState);
    return {
        U: window.MappAIUsage,
        righe: () => JSON.parse(localStorage.getItem('mappai_usage_log') || '[]'),
    };
}

const BASE = { provider: 'google', model: 'gemini-3.8-flash', inTok: 1000, outTok: 500 };

test('usage mancante resta nel registro con null e senza segreti o contenuti', () => {
    const { U, righe } = caricaTracker();
    U.record({provider:'infomaniak',model:'test',requestedModel:'test',actualModel:null,usageKnown:false,
        apiKey:'segreto',productId:'prodotto-privato',texts:['testo privato'],embeddings:[[1,2]]});
    const r=righe()[0]; assert.strictEqual(r.usageKnown,false);
    assert.strictEqual(r.inTok,null); assert.strictEqual(r.outTok,null);
    assert.strictEqual(r.actualModel,null);
    for(const key of ['apiKey','productId','texts','embeddings']) assert.ok(!(key in r));
});

test('una chiamata troncata scrive n, stop, tetto e thoughts', () => {
    const { U, righe } = caricaTracker();
    U.record(Object.assign({}, BASE, {
        outTok: 8385, n: 3, stop: 'MAX_TOKENS', tetto: 8400, thoughts: 120,
        ctx: { cat: 'pipeline', sub: 'quiz_open' },
    }));
    const r = righe()[0];
    assert.strictEqual(r.n, 3);
    assert.strictEqual(r.stop, 'MAX_TOKENS');
    assert.strictEqual(r.tetto, 8400);
    assert.strictEqual(r.thoughts, 120);
    // e i campi storici restano dov'erano
    assert.strictEqual(r.sub, 'quiz_open');
    assert.strictEqual(r.outTok, 8385);
});

test('senza pensiero e senza array i due campi SPARISCONO, non vanno a zero', () => {
    const { U, righe } = caricaTracker();
    // una fase della mappa: nessun array nello schema, pensiero spento
    U.record(Object.assign({}, BASE, {
        n: null, stop: 'STOP', tetto: 6000, thoughts: 0,
        ctx: { cat: 'map', sub: 'mm_phase3' },
    }));
    const r = righe()[0];
    assert.ok(!('n' in r), 'n non deve comparire quando non c\'è un array');
    assert.ok(!('thoughts' in r), 'thoughts non deve comparire quando il pensiero è spento');
    assert.strictEqual(r.stop, 'STOP');
    assert.strictEqual(r.tetto, 6000);
});

test('una riga senza i quattro campi resta valida: il file è append-only da luglio', () => {
    const { U, righe } = caricaTracker();
    U.record(Object.assign({}, BASE, { ctx: { cat: 'materials', sub: 'synthesis' } }));
    const r = righe()[0];
    ['n', 'stop', 'tetto', 'thoughts'].forEach(k =>
        assert.ok(!(k in r), k + ' non deve comparire se il chiamante non lo passa'));
    assert.strictEqual(r.inTok, 1000);
    assert.strictEqual(r.outTok, 500);
});

test('lo stop arriva come stringa anche se il modello lo manda strano', () => {
    const { U, righe } = caricaTracker();
    // Infomaniak/OpenAI dice "length" dove Gemini dice "MAX_TOKENS"
    U.record(Object.assign({}, BASE, { stop: 'length', n: 5, tetto: 3000 }));
    assert.strictEqual(righe()[0].stop, 'length');
    assert.strictEqual(righe()[0].n, 5);
});
