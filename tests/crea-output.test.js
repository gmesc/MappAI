'use strict';
/* «Output» di CREA (0087, lotto 10-crea, 12/10/2026): la logica pura della scelta.
   Giacomo: «le tre opzioni governano quali box mostrare nel BENTO».
   0120 (21/10/2026, D2 = B): «Metacomprensione» sta dietro l'interruttore
   `mappai_output_metacomprensione`, spento di serie; sceglierla apre la finestra
   che dice l'intenzione e che le funzioni sono in costruzione. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const C = require('../public/js/mappai-crea-output.js');

test('le tre voci di Giacomo, nell\'ordine, e la prima è il default', () => {
    assert.deepEqual(C.VOCI.map(v => v.id), ['differenziazione', 'iconografica', 'metacomprensione']);
    assert.deepEqual(C.VOCI.map(v => v.et), ['Differenziazione', 'Analisi iconografica', 'Metacomprensione']);
    assert.equal(C.DEFAULT, 'differenziazione');
    assert.equal(C.CHIAVE, 'mappai_crea_output');
});

test('normalizza: una scelta sconosciuta, vuota o nulla torna al default; maiuscole e spazi non contano', () => {
    assert.equal(C.normalizza('Iconografica '), 'iconografica');
    assert.equal(C.normalizza('METACOMPRENSIONE'), 'metacomprensione');
    for (const v of ['', null, undefined, 'diversificazione', 42]) assert.equal(C.normalizza(v), 'differenziazione', String(v));
});

test('Differenziazione: il bento di sempre, nessun effetto', () => {
    const e = C.effetti('differenziazione', { fotoMontata: false });
    assert.deepEqual(e, { scelta: 'differenziazione', formati: false, attesa: false, lettura: false, accendeLettura: false, avviso: false, respinta: false });
});

test('Analisi iconografica: i formati e i posti d\'attesa; i posti spariscono quando il guscio ha montato la foto', () => {
    assert.deepEqual(C.effetti('iconografica', {}), { scelta: 'iconografica', formati: true, attesa: true, lettura: false, accendeLettura: false, avviso: false, respinta: false });
    const dopo = C.effetti('iconografica', { fotoMontata: true });
    assert.equal(dopo.formati, true, 'i formati restano');
    assert.equal(dopo.attesa, false, 'i posti d\'attesa no: ci sono i pezzi veri');
});

/* ── 0120 (21/10): «Metacomprensione» dietro l'interruttore, con la finestra (D2 = B) ──
   Dal 12/10 sera la scelta ERA l'interruttore della Lettura, senza condizioni. Dal
   21/10 (Giacomo: «D2 B») la voce si vede sempre, ma con `mappai_output_metacomprensione`
   spento di serie si chiama «Metacomprensione (in costruzione)»: sceglierla apre la
   finestra e la tendina torna alla scelta di prima. Acceso (`'1'`): la finestra, e
   poi la Lettura si accende e si mostra come dal 12/10. */
test('0120: l\'interruttore `mappai_output_metacomprensione` è spento salvo \'1\'', () => {
    assert.equal(C.CHIAVE_META, 'mappai_output_metacomprensione');
    assert.equal(C.metaAttiva('1'), true);
    for (const v of [null, undefined, '', '0', 'true', 'on', 'yes']) assert.equal(C.metaAttiva(v), false, String(v));
});

test('0120: le voci — con l\'interruttore spento la terza dice «(in costruzione)»; accesa è «Metacomprensione»', () => {
    const spente = C.voci({ metaAttiva: false });
    assert.deepEqual(spente.map(v => v.id), ['differenziazione', 'iconografica', 'metacomprensione'], 'la voce si vede sempre');
    assert.equal(spente[2].et, 'Metacomprensione (in costruzione)');
    assert.equal(spente[2].en, 'Metacomprehension (under construction)');
    assert.equal(spente[2].chiave, 'crea_output_metacomprensione_wip', 'la chiave inglese della coda');
    assert.equal(spente[2].wip, true);
    assert.deepEqual(C.voci({ metaAttiva: true }), C.VOCI, 'accesa: le tre voci di sempre');
    assert.deepEqual(C.voci(), spente, 'senza contesto l\'interruttore è spento');
    assert.equal(C.VOCI[2].et, 'Metacomprensione', 'VOCI non viene toccata');
});

test('0120, D2 = B: «Metacomprensione» con l\'interruttore spento apre la finestra e viene respinta — la scelta resta quella di prima', () => {
    const e = C.effetti('metacomprensione', { metaAttiva: false, prima: 'iconografica' });
    assert.deepEqual(e, { scelta: 'iconografica', formati: true, attesa: true, lettura: false, accendeLettura: false, avviso: true, respinta: true });
    assert.equal(C.effetti('metacomprensione', {}).scelta, 'differenziazione', 'senza una scelta di prima si torna al default');
    assert.equal(C.effetti('metacomprensione', { prima: 'metacomprensione' }).scelta, 'differenziazione', 'la scelta di prima non può essere lei stessa');
    assert.equal(C.effetti('iconografica', { prima: 'metacomprensione' }).avviso, false, 'le altre voci non aprono nessuna finestra');
});

test('0120, D2 = B: con l\'interruttore acceso la finestra si apre e poi la Lettura si accende e si mostra, come dal 12/10', () => {
    assert.deepEqual(C.effetti('metacomprensione', { metaAttiva: true }), { scelta: 'metacomprensione', formati: false, attesa: false, lettura: true, accendeLettura: true, avviso: true, respinta: false });
});

/* ── il runtime, da localStorage VUOTO (la beta.6: la chiave della lettura non c'è) ──
   `preset` = chiavi già in localStorage prima del caricamento (l'interruttore, una scelta ricordata). */
const fs = require('node:fs'), vm = require('node:vm');
function app(preset) {
    const store = Object.assign({}, preset || {}); const calls = { mount: [], modali: [] };
    const el = (extra) => Object.assign({ hidden: false, dataset: {}, attrs: {}, listeners: {}, options: [], value: '',
        setAttribute(k, v) { this.attrs[k] = v; }, getAttribute(k) { return this.attrs[k]; },
        appendChild(o) { this.options.push(o); return o; }, addEventListener(n, f) { (this.listeners[n] ||= []).push(f); },
        style: { setProperty(k, v) { this.attrs = this.attrs || {}; this.attrs[k] = v; }, attrs: {} } }, extra || {});
    const select = el(), host = el({ hidden: true }), html = el();
    const document = { readyState: 'complete', documentElement: html,
        getElementById: id => ({ 'mn-output-campo': select, 'lettura-crea-host': host })[id] || null,
        createElement: () => ({}), addEventListener() {}, dispatchEvent() {} };
    const localStorage = { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } };
    /* la Lettura vera legge la chiave come enabled() (mappai-percorso-lettura.js:406) */
    const MappAIPercorsoLettura = { mountCreatePlanner(h) {
        if (localStorage.getItem('mappai_percorso_lettura') !== '1' || !h || h.dataset.letturaMounted) return null;
        h.dataset.letturaMounted = '1'; h.hidden = false; calls.mount.push(1); return {};
    } };
    /* il motore dei modali, finto: registra lo schema e «Ho capito» subito */
    const MappAIModal = { open(schema) { calls.modali.push(schema); return Promise.resolve({ azione: 'ok' }); } };
    const ctx = { window: null, document, localStorage, console: { log() {}, warn() {} }, CustomEvent: function (n, d) { this.n = n; this.d = d; },
        MappAIPercorsoLettura, MappAIModal, MappAIVisioneCore: { ESTENSIONI: ['.jpg', '.png'] }, self: null, setTimeout };
    ctx.window = ctx; ctx.self = ctx;
    vm.createContext(ctx);
    vm.runInContext(fs.readFileSync(require.resolve('../public/js/mappai-crea-output.js'), 'utf8'), ctx);
    /* il gesto del docente sulla tendina */
    const scegli = async (v) => { select.value = v; (select.listeners.change || []).forEach(f => f()); await new Promise(r => setTimeout(r, 0)); };
    return { ctx, store, calls, select, host, html, scegli };
}

test('runtime da vuoto: la scelta ricordata è Differenziazione, la Lettura resta spenta e nascosta', () => {
    const a = app();
    assert.equal(a.select.value, 'differenziazione');
    assert.equal(a.store.mappai_percorso_lettura, undefined, 'nessuna chiave scritta a vuoto');
    assert.equal(a.html.attrs['data-crea-output'], 'differenziazione');
    assert.deepEqual(a.calls.mount, []);
    assert.deepEqual(a.calls.modali, [], 'nessuna finestra senza un gesto');
});

test('runtime, interruttore acceso: «Metacomprensione» da vuoto scrive la chiave della lettura, monta il configuratore e lo mostra', () => {
    const a = app({ mappai_output_metacomprensione: '1' });
    const e = a.ctx.MappAICreaOutput.imposta('metacomprensione');
    assert.equal(a.store.mappai_percorso_lettura, '1', 'la scelta è l\'interruttore della Lettura');
    assert.equal(e.lettura, true);
    assert.deepEqual(a.calls.mount, [1], 'mountCreatePlanner ha accettato: la chiave c\'era PRIMA del montaggio');
    assert.equal(a.host.hidden, false);
    assert.equal(a.html.attrs['data-crea-output'], 'metacomprensione');
    assert.equal(a.store.mappai_crea_output, 'metacomprensione');
    /* tornando a Differenziazione l'host si nasconde, la chiave resta: i materiali fatti restano modificabili */
    a.ctx.MappAICreaOutput.imposta('differenziazione');
    assert.equal(a.host.hidden, true);
    assert.equal(a.store.mappai_percorso_lettura, '1');
    /* di nuovo Metacomprensione: già montato, si rimostra senza rimontare */
    a.ctx.MappAICreaOutput.imposta('metacomprensione');
    assert.equal(a.host.hidden, false); assert.deepEqual(a.calls.mount, [1]);
    assert.deepEqual(a.calls.modali, [], '`imposta` non è un gesto: nessuna finestra');
});

test('runtime: con «Analisi iconografica» la variabile dei formati legge le estensioni della visione', () => {
    const a = app();
    a.ctx.MappAICreaOutput.imposta('iconografica');
    assert.equal(a.html.style.attrs['--crea-formati'], JSON.stringify('Formati: .jpg · .png'));
    assert.equal(a.html.attrs['data-crea-output'], 'iconografica');
});

test('0120, runtime, interruttore spento (di serie): la terza voce dice «(in costruzione)»; sceglierla apre la finestra, la tendina torna indietro, la Lettura resta spenta', async () => {
    const a = app();
    assert.equal(a.select.options[2].value, 'metacomprensione');
    assert.equal(a.select.options[2].textContent, 'Metacomprensione (in costruzione)');
    a.ctx.MappAICreaOutput.imposta('iconografica');
    await a.scegli('metacomprensione');
    assert.equal(a.calls.modali.length, 1, 'una finestra');
    const m = a.calls.modali[0];
    assert.equal(m.titolo, 'Metacomprensione');
    assert.equal(m.sezioni.length, 2, 'l\'intenzione e «in costruzione»');
    assert.ok(/metacomprensione/i.test(m.sezioni[0].testo), 'la prima sezione dice che cosa vuole essere');
    assert.ok(/in costruzione/i.test(m.sezioni[1].titolo), 'la seconda dice che è in costruzione');
    assert.equal(m.azioni.length, 1, 'un\'azione sola');
    assert.equal(m.azioni[0].ruolo, 'primario');
    assert.equal(m.azioni[0].etichetta, 'Ho capito');
    assert.equal(a.select.value, 'iconografica', 'la tendina torna alla scelta di prima');
    assert.equal(a.store.mappai_crea_output, 'iconografica', 'la scelta respinta non si ricorda');
    assert.equal(a.store.mappai_percorso_lettura, undefined, 'la Lettura non si accende');
    assert.deepEqual(a.calls.mount, []);
    assert.equal(a.host.hidden, true);
    assert.equal(a.html.attrs['data-crea-output'], 'iconografica');
});

test('0120, runtime, interruttore acceso: la voce è «Metacomprensione»; sceglierla apre la finestra e poi la Lettura si monta come prima', async () => {
    const a = app({ mappai_output_metacomprensione: '1' });
    assert.equal(a.select.options[2].textContent, 'Metacomprensione');
    await a.scegli('metacomprensione');
    assert.equal(a.calls.modali.length, 1, 'la finestra si apre anche a interruttore acceso');
    assert.equal(a.store.mappai_percorso_lettura, '1');
    assert.deepEqual(a.calls.mount, [1]);
    assert.equal(a.host.hidden, false);
    assert.equal(a.select.value, 'metacomprensione');
    assert.equal(a.store.mappai_crea_output, 'metacomprensione');
    assert.equal(a.html.attrs['data-crea-output'], 'metacomprensione');
    /* un'altra voce: nessuna finestra */
    await a.scegli('differenziazione');
    assert.equal(a.calls.modali.length, 1);
    assert.equal(a.host.hidden, true);
});

test('0120, runtime: una scelta «Metacomprensione» ricordata da prima, con l\'interruttore spento, si legge come Differenziazione e non apre niente all\'avvio', () => {
    const a = app({ mappai_crea_output: 'metacomprensione', mappai_percorso_lettura: '1' });
    assert.equal(a.select.value, 'differenziazione');
    assert.equal(a.ctx.MappAICreaOutput.scelta(), 'differenziazione');
    assert.equal(a.html.attrs['data-crea-output'], 'differenziazione');
    assert.equal(a.host.hidden, true); assert.deepEqual(a.calls.mount, []);
    assert.deepEqual(a.calls.modali, []);
    assert.equal(a.store.mappai_percorso_lettura, '1', 'la chiave della Lettura non si rispegne: i materiali fatti restano modificabili');
    /* rilettura dello 0120: la pipeline dei materiali legge `mappai_crea_output` da sé (`_fogliSempre`, mappai-material-pipeline.js)
       e non sa dell\'interruttore: la scelta ricordata va RIALLINEATA su disco all\'avvio, o la tendina dice Differenziazione e la
       pipeline crede Metacomprensione (niente fogli dei nodi) */
    assert.equal(a.store.mappai_crea_output, 'differenziazione', 'la scelta ricordata è riscritta al default');
});

test('0120: le sette chiavi inglesi della finestra e della coda «(in costruzione)» esistono in en_translations.js', () => {
    const en = fs.readFileSync(require.resolve('../public/traduzioni/en_translations.js'), 'utf8');
    for (const k of ['crea_output_metacomprensione_wip', 'crea_output_meta_titolo', 'crea_output_meta_intento_titolo', 'crea_output_meta_intento', 'crea_output_meta_wip_titolo', 'crea_output_meta_wip', 'crea_output_meta_ok']) {
        assert.ok(new RegExp('^\\s*' + k + ':', 'm').test(en), 'manca ' + k);
    }
    const spente = C.voci({ metaAttiva: false });
    assert.ok(/^\s*crea_output_metacomprensione_wip:/m.test(en) && spente[2].chiave === 'crea_output_metacomprensione_wip', 'la chiave composta a runtime è quella del dizionario');
});

test('0120, runtime: senza il motore dei modali la scelta respinta torna indietro lo stesso, senza errori', async () => {
    const a = app();
    a.ctx.MappAIModal = undefined;
    await a.scegli('metacomprensione');
    assert.equal(a.select.value, 'differenziazione');
    assert.equal(a.store.mappai_percorso_lettura, undefined);
    assert.deepEqual(a.calls.mount, []);
});

test('testoFormati: le estensioni della visione se ci sono, altrimenti quelle note; l\'etichetta si traduce', () => {
    assert.equal(C.testoFormati(['.jpg', '.png']), 'Formati: .jpg · .png');
    assert.equal(C.testoFormati(null), 'Formati: .jpg · .jpeg · .png · .heic · .heif');
    assert.equal(C.testoFormati([], 'Formats'), 'Formats: .jpg · .jpeg · .png · .heic · .heif');
});
