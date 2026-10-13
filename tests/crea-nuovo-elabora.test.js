'use strict';
/*
 * crea-nuovo-elabora.test.js — «+ Crea nuovo» di ELABORA rifatto (0091, decisioni di Giacomo del 13/10).
 *
 *   · il modale si chiama «Crea nuovo» (il «+» è l'icona, come sul bottone);
 *   · escono Foglio dei nodi, Catena dei perché, Sintesi e la voce «Quiz, Domande aperte e Flashcard»
 *     coi suoi due sotto-modali; Foglio e Catena RESTANO come righe nelle tabelle;
 *   · tre bottoni A MANO (Scelta multipla, Domande aperte, Flashcard) aprono l'editor vuoto, senza modali;
 *     un secondo documento dello stesso genere prende «2», «3»…;
 *   · «Più materiali insieme» resta la via con l'AI;
 *   · un progetto nato da una foto ha in più le tre voci «dalla foto».
 * La console è il file VERO in una `vm`, su un DOM finto come in tests/materiali-attesa.test.js.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const cheerio = require('cheerio');
const CL = require('../public/js/mappai-clona-core.js');

const js = f => fs.readFileSync(require.resolve('../public/js/' + f), 'utf8');
const storage = () => ({ getItem: () => null, setItem() {}, removeItem() {} });

function domFinto() {
    const $ = cheerio.load('<html><head></head><body></body></html>'), cache = new WeakMap();
    const document = { addEventListener() {}, removeEventListener() {},
        createElement: tag => wrap($('<' + tag + '></' + tag + '>')[0]),
        querySelector: q => wrap($(q)[0]), querySelectorAll: q => $(q).toArray().map(wrap),
        getElementById: id => wrap($('[id]').toArray().find(n => n.attribs.id === id)) };
    function wrap(node) {
        if (!node) return null;
        if (cache.has(node)) return cache.get(node);
        const e = { node, style: {}, ownerDocument: document,
            get id() { return $(node).attr('id') || ''; }, set id(v) { $(node).attr('id', v); },
            get className() { return $(node).attr('class') || ''; }, set className(v) { $(node).attr('class', v); },
            get innerHTML() { return $(node).html(); }, set innerHTML(v) { $(node).html(v); },
            get textContent() { return $(node).text(); }, set textContent(v) { $(node).text(v); },
            get firstChild() { return wrap($(node).children()[0]); },
            get children() { return $(node).children().toArray().map(wrap); },
            querySelector: q => wrap($(node).find(q)[0]), querySelectorAll: q => $(node).find(q).toArray().map(wrap),
            getAttribute: n => $(node).attr(n), setAttribute: (n, v) => $(node).attr(n, v),
            contains: o => !!o && (o.node === node || $(node).find(o.node).length > 0),
            appendChild(child) { $(node).append(child.node); return child; },
            insertBefore(child, other) { if (other) $(other.node).before(child.node); else $(node).append(child.node); return child; },
            remove: () => $(node).remove(), addEventListener() {}, removeEventListener() {}
        };
        cache.set(node, e); return e;
    }
    document.head = wrap($('head')[0]); document.body = wrap($('body')[0]); document.documentElement = wrap($('html')[0]);
    return { document };
}

/* nodes: la mappa; sets e archivio: i materiali che ci sono già; dossier: un progetto nato da una foto */
function consoleElabora({ sets = [], archivio = [], dossier = false, scheda = { titolo: 'Il manifesto' } } = {}) {
    const dom = domFinto(), calls = { aMano: [], daFoto: [], batch: 0 }, aperti = [];
    const nodi = dossier ? [{ id: 'fonte_0', label: 'Il manifesto', level: 0 }, { id: 'fonte_osservazione', label: 'Osservazione', level: 1 }]
        : [{ id: 'a', label: 'A', level: 0 }, { id: 'b', label: 'B', level: 1 }];
    const state = { extractionMode: 'mindmap', activeVaultPath: '/vault', rootNodeLabel: 'Mappa',
        _pipelineManifest: { config: {}, steps: {}, review: { approvedRevision: 1, final: { stage: 'done' } } },
        db: { nodes: nodi, links: [], studySets: sets } };
    let consoleSchema, box;
    function draw() { dom.document.body.innerHTML = '<div class="mm-box"><div class="mm-console__area"></div></div>'; return box = dom.document.querySelector('.mm-box'); }
    const g = { console: { log() {}, warn() {} }, document: dom.document, appState: state, TextDecoder, Uint8Array, setTimeout, clearTimeout,
        localStorage: storage(), sessionStorage: storage(), showToast() {}, MappAIClona: CL,
        MappAIStudyDocs: { list: () => archivio, get: id => archivio.find(d => d.id === id) },
        schedaFromAnalisiHtml: html => (html === 'scheda-vera' ? scheda : null),
        MappAICreaQuiz: { aMano(id, nome) { calls.aMano.push([id, nome]); }, daFoto(id, sch) { calls.daFoto.push([id, sch && sch.titolo]); } },
        MappAIPipeline: { openModal() { calls.batch++; }, completaValidazione() {} },
        MappAIDocEditor: { reset() {}, render() {}, assicuraStili() {}, hasUnsaved: () => false, haDocumento: () => false, openNodeSheet() {}, openCausal() {} },
        MappAIElabora: { unmountSource() {} }, MappAIVaults: { quando() { return () => {}; } },
        MappAITeach: { mappeDelContesto: async () => [{ id: 'v:/vault', nome: 'Mappa', v: { fullPath: '/vault', extractionMode: 'mindmap' } }],
            mappaCorrente: rows => rows[0], tabelleMateriali: rows => [...new Set(rows.map(m => m.tipo))].map(tipo => ({ id: 'g:' + tipo, righe: rows.filter(m => m.tipo === tipo).map(m => ({ id: 'm:' + m.id })) })) },
        MappAIModal: { open(s) {
            if (s.suApertura) { consoleSchema = s; draw(s); s.suApertura(box, draw); return new Promise(() => {}); }
            return new Promise(r => aperti.push({ schema: s, scegli: r }));
        } },
        electronAPI: { vaultMaterialsList: async () => ({ files: [] }), async readVaultFile() { return { ok: false }; } },
        MappAIPercorsoLettura: { elaboraMaterials: () => [] }
    };
    g.window = g;
    vm.runInNewContext(js('mappai-elabora-console.js'), g);
    const settle = async () => { for (let i = 0; i < 30; i++) await new Promise(r => setTimeout(r, 0)); };
    return { g, calls, settle,
        async apriPopup() {
            if (!consoleSchema) { g.MappAIElaboraConsole.open({}); await settle(); }
            const prima = aperti.length;
            consoleSchema.suAzione({ azione: 'crea' }, box, draw); await settle();
            assert.equal(aperti.length, prima + 1, 'il clic su «Crea nuovo» apre un modale');
            return aperti[aperti.length - 1];
        },
        async scegli(popup, id) { popup.scegli({ azione: 'tipo:' + id }); await settle(); },
        righe() { return JSON.parse(JSON.stringify(g.MappAIElaboraConsole.materiali())); } };
}
const copia = x => JSON.parse(JSON.stringify(x));      /* array di un altro contesto vm */
const vociDi = p => copia(p.schema.sezioni.flatMap(s => s.voci.map(v => v.id.replace('tipo:', ''))));
const titoliSezioni = p => copia(p.schema.sezioni.map(s => s.titolo));

test('il modale si chiama «Crea nuovo»: a mano Scelta multipla, Domande aperte, Flashcard; con l\'AI Più materiali insieme', async () => {
    const h = consoleElabora();
    const p = await h.apriPopup();
    assert.equal(p.schema.titolo, 'Crea nuovo');
    assert.equal(p.schema.icona, 'plus');
    assert.deepEqual(titoliSezioni(p), ['A mano', 'Con l\'AI']);
    assert.deepEqual(vociDi(p), ['mano_mc', 'mano_open', 'mano_flashcards', 'batch']);
    const etichette = p.schema.sezioni.flatMap(s => s.voci.map(v => v.etichetta));
    for (const via of ['Foglio dei nodi', 'Catena dei perché', 'Sintesi', 'Quiz, Domande aperte e Flashcard', 'Vero o Falso']) {
        assert.ok(!etichette.includes(via), via + ' non deve esserci');
    }
});

test('un bottone a mano apre subito il documento vuoto, senza altri modali', async () => {
    const h = consoleElabora();
    for (const id of ['mc', 'open', 'flashcards']) {
        const p = await h.apriPopup();
        await h.scegli(p, 'mano_' + id);
    }
    assert.deepEqual(h.calls.aMano, [['mc', ''], ['open', ''], ['flashcards', '']]);
});

test('un secondo documento dello stesso genere prende un nome libero, non quello del primo', async () => {
    const h = consoleElabora({
        sets: [{ id: 's1', type: 'Scelta Multipla', mode: 'quiz', title: 'Mappa — Scelta Multipla', items: [{ q: 'x' }] },
               { id: 's2', type: 'Scelta Multipla', mode: 'quiz', title: 'Mappa — Scelta Multipla · 2', clone: '2', items: [{ q: 'y' }] }],
        archivio: [{ id: 'd1', kind: 'quizpaper', mapName: 'Mappa', title: 'Mappa — Domande aperte', date: '2026-10-13' }]
    });
    for (const id of ['mc', 'open', 'flashcards']) await h.scegli(await h.apriPopup(), 'mano_' + id);
    assert.deepEqual(h.calls.aMano, [['mc', '3'], ['open', '2'], ['flashcards', '']]);
});

test('le righe Foglio dei nodi e Catena dei perché restano nelle tabelle', () => {
    const h = consoleElabora();
    const tipi = h.righe().map(m => m.tipo);
    assert.ok(tipi.includes('Foglio nodi'), tipi.join(', '));
});

test('«Più materiali insieme» apre il modale dei materiali sulla mappa che c\'è', async () => {
    const h = consoleElabora();
    await h.scegli(await h.apriPopup(), 'batch');
    assert.equal(h.calls.batch, 1);
});

test('progetto nato da una foto: in più le tre voci «dalla foto», che generano dalla sua scheda', async () => {
    const h = consoleElabora({ dossier: true,
        archivio: [{ id: 'an1', kind: 'analisi', mapName: 'Mappa', html: 'scheda-vera', date: '2026-10-13' }] });
    const p = await h.apriPopup();
    assert.deepEqual(titoliSezioni(p), ['Dalla foto', 'A mano', 'Con l\'AI']);
    assert.deepEqual(vociDi(p), ['foto_open', 'foto_flashcards', 'foto_mc', 'mano_mc', 'mano_open', 'mano_flashcards', 'batch']);
    await h.scegli(p, 'foto_open');
    assert.deepEqual(h.calls.daFoto, [['open', 'Il manifesto']]);
});

test('progetto da foto senza scheda: le voci «dalla foto» ci sono ma dicono perché non partono', async () => {
    const h = consoleElabora({ dossier: true });
    const p = await h.apriPopup();
    const foto = p.schema.sezioni[0].voci;
    assert.match(foto[0].sotto, /non ha la scheda della foto/);
    await h.scegli(p, 'foto_open');
    assert.deepEqual(h.calls.daFoto, []);
});

test('mappai-crea-quiz: restano le due porte, senza i modali di scelta e senza il V/F', () => {
    const src = js('mappai-crea-quiz.js');
    assert.match(src, /window\.MappAICreaQuiz = \{ aMano: aMano, daFoto: daFoto, TIPI: TIPI, _aree: _aree \};/);
    for (const via of ["'Che tipo di quiz'", "'Le scrivo io'", "'Come si chiama'", "id: 'tf'"]) assert.ok(!src.includes(via), via);
});

test('i18n: le chiavi nuove stanno nel dizionario inglese', () => {
    const en = fs.readFileSync(require.resolve('../public/traduzioni/en_translations.js'), 'utf8');
    for (const k of ['ec_da_mano', 'ec_da_foto', 'ec_g_foto', 'ec_g_mano', 'ec_g_ai', 'ec_mano_d', 'ec_mano_no',
        'ec_foto_mc', 'ec_foto_open', 'ec_foto_flash', 'ec_foto_d', 'ec_foto_no', 'mp_quiz_nome', 'mp_quiz_nome_ph', 'mp_quiz_nome_help']) {
        assert.match(en, new RegExp('\\n    ' + k + ': "'), 'en: ' + k);
    }
});
