/* tests/clona-core.test.js — CLONA: la seconda copia editabile.
 *
 * Il pezzo delicato non è duplicare un oggetto, è il NOME: da lì dipendono
 * l'etichetta nell'elenco, il nome del file nel vault e l'aggancio fra i due.
 * Due regressioni costerebbero care e sono fissate qui: un clone senza nome
 * (che scriverebbe sopra il file dell'originale) e un clone che condivide gli
 * item con l'originale (correggere l'uno cambierebbe l'altro).
 */
const test = require('node:test');
const assert = require('node:assert');

const C = require('../public/js/mappai-clona-core.js');
const PC = require('../public/js/mappai-pipeline-core.js');

// ── IL NOME ──────────────────────────────────────────────────────────────────

test('pulisci: toglie ciò che un nome di file non può portare, tiene il trattino', () => {
    assert.strictEqual(C.pulisci('  verifica   ottobre '), 'verifica ottobre');
    assert.strictEqual(C.pulisci('a/b\\c:d*e?f"g<h>i|j'), 'a b c d e f g h i j');
    // il trattino è un nome legittimo: toglierlo cambierebbe ciò che il docente
    // ha scritto senza dirglielo
    assert.strictEqual(C.pulisci('verifica-ottobre'), 'verifica-ottobre');
    assert.strictEqual(C.pulisci('///'), '', 'se non resta niente, torna vuoto');
    assert.strictEqual(C.pulisci(null), '');
    assert.ok(C.pulisci('x'.repeat(80)).length <= C.MAX, 'tagliato a MAX');
});

test('chiave: maiuscole e spazi non fanno due nomi diversi', () => {
    assert.strictEqual(C.chiave('Verifica  Ottobre'), C.chiave('verifica ottobre'));
});

test('nomeAuto: parte da 2 — l\'originale è il primo esemplare', () => {
    assert.strictEqual(C.nomeAuto('Quiz MC', []), '2');
    assert.strictEqual(C.nomeAuto('Quiz MC', ['2']), '3');
    // salta anche i numeri scritti a mano dal docente
    assert.strictEqual(C.nomeAuto('Quiz MC', ['2', '3', 'verifica ottobre']), '4');
});

test('valida: vuoto e duplicato sono i due modi di sbagliare', () => {
    assert.deepStrictEqual(C.valida('verifica ottobre', 'Quiz MC', []), { ok: true, nome: 'verifica ottobre' });
    assert.strictEqual(C.valida('   ', 'Quiz MC', []).motivo, 'vuoto');
    assert.strictEqual(C.valida('///', 'Quiz MC', []).motivo, 'vuoto', 'un nome fatto di soli caratteri vietati è vuoto');
    assert.strictEqual(C.valida('Verifica Ottobre', 'Quiz MC', ['verifica ottobre']).motivo, 'duplicato');
});

test('etichetta: «Scelta Multipla - verifica ottobre», e senza nome solo il genere', () => {
    assert.strictEqual(C.etichetta('Quiz MC', 'verifica ottobre'), 'Scelta Multipla - verifica ottobre');
    assert.strictEqual(C.etichetta('Quiz V/F', ''), 'Vero o Falso');
    assert.strictEqual(C.etichetta('Sintesi', '2'), 'Sintesi - 2');
    assert.strictEqual(C.etichetta('Genere ignoto', 'x'), 'Genere ignoto - x', 'un genere che non conosce non lo perde');
});

test('i nomi funzionali sono gli STESSI della console (una tabella, due lettori)', () => {
    /* ELABORA scrive le stesse parole in `NOMI_FUNZ`. Se una delle due cambia,
       l'etichetta di un clone e quella del suo originale divergono nello stesso
       elenco — e sono la stessa riga a un giorno di distanza. */
    const src = require('fs').readFileSync(
        require('path').join(__dirname, '..', 'public/js/mappai-elabora-console.js'), 'utf8');
    Object.keys(C.GENERI).forEach(g => {
        assert.ok(src.indexOf("'" + C.GENERI[g] + "'") > 0,
            'la console conosce «' + C.GENERI[g] + '»');
    });
});

// ── IL CLONE ─────────────────────────────────────────────────────────────────

const SET = {
    id: 's1', title: 'La Politica Svizzera — Scelta Multipla', type: 'Scelta Multipla',
    mode: 'quiz', date: '2026-08-10', _pipeline: true,
    items: [{ question: 'Chi elegge il Consiglio federale?', options: ['A', 'B'], correctIndex: 0 }]
};

test('clonaSet: l\'originale non si tocca, e gli item NON si condividono', () => {
    const c = C.clonaSet(SET, 'verifica ottobre', { id: 's2', genere: 'Quiz MC' });
    c.items[0].question = 'cambiata';
    c.items[0].options.push('C');
    assert.strictEqual(SET.items[0].question, 'Chi elegge il Consiglio federale?',
        'correggere il clone non cambia l\'originale — è il motivo per cui si clona');
    assert.strictEqual(SET.items[0].options.length, 2, 'nemmeno le opzioni');
    assert.strictEqual(SET.clone, undefined, 'l\'originale resta senza marcatore');
});

test('clonaSet: identità nuova, marcatore `clone`, titolo che è l\'etichetta', () => {
    const c = C.clonaSet(SET, 'verifica ottobre', { id: 's2', genere: 'Quiz MC', data: '2026-08-11' });
    assert.strictEqual(c.id, 's2');
    assert.strictEqual(c.clone, 'verifica ottobre');
    assert.strictEqual(c.title, 'Scelta Multipla - verifica ottobre');
    assert.strictEqual(c.date, '2026-08-11');
    assert.strictEqual(c.mode, 'quiz', 'il resto del set passa intatto');
});

test('clonaSet: `_pipeline` NON si eredita — un clone lo fa il docente', () => {
    const c = C.clonaSet(SET, 'x', { id: 's2', genere: 'Quiz MC' });
    assert.strictEqual(c._pipeline, undefined,
        'chi conta i materiali prodotti da una generazione non deve contare le copie');
});

test('clonaSet: senza id esplicito ne deriva uno dall\'originale (mai lo stesso)', () => {
    const c = C.clonaSet(SET, 'x', { genere: 'Quiz MC' });
    assert.notStrictEqual(c.id, SET.id);
});

test('cloniDi: i nomi già presi, per quel genere soltanto', () => {
    const mat = [
        { tipo: 'Quiz MC', clone: '' }, { tipo: 'Quiz MC', clone: 'verifica ottobre' },
        { tipo: 'Sintesi', clone: 'verifica ottobre' }, { tipo: 'Quiz MC', clone: '2' }
    ];
    assert.deepStrictEqual(C.cloniDi(mat, 'Quiz MC'), ['verifica ottobre', '2']);
    /* «verifica ottobre» può esistere per il quiz E per la sintesi: sono due
       documenti diversi, e vietarlo sarebbe una regola che nessuno capisce. */
    assert.deepStrictEqual(C.cloniDi(mat, 'Sintesi'), ['verifica ottobre']);
});

// ── IL FILE ──────────────────────────────────────────────────────────────────

test('🐛 senza nome il clone scriverebbe SOPRA il file dell\'originale', () => {
    /* Da quando ` -VERDE` non si scrive più, il nome del file dipende solo dal
       genere e dalla mappa: due esemplari → un file. È tutta la ragione per cui
       un clone senza nome non esiste. */
    const orig = PC.buildFileName('quiz_mc', null, false, C.opzioniFile('La Politica Svizzera', ''));
    const clone = PC.buildFileName('quiz_mc', null, false, C.opzioniFile('La Politica Svizzera', 'verifica ottobre'));
    assert.strictEqual(orig, 'Quiz-MC-La Politica Svizzera.pdf');
    assert.strictEqual(clone, 'Quiz-MC-La Politica Svizzera-verifica ottobre.pdf');
    assert.notStrictEqual(orig, clone, 'due esemplari, due file');
});

test('opzioniFile: il nome ripulito arriva a buildFileName, non quello grezzo', () => {
    const f = PC.buildFileName('synthesis', null, false, C.opzioniFile('Mappa', ' a/b '));
    assert.ok(f.indexOf('/') < 0, 'nessuna barra nel nome del file');
    assert.strictEqual(f, 'Sintesi-Mappa-a b.html');
});

test('opzioniFile: senza nome non passa `nome` (non un nome vuoto)', () => {
    assert.deepStrictEqual(C.opzioniFile('Mappa', ''), { mappa: 'Mappa' });
    assert.deepStrictEqual(C.opzioniFile('Mappa', '   '), { mappa: 'Mappa' });
});

// ── DOVE VIVE UN DOCUMENTO CHE NASCE DALLA MAPPA ─────────────────────────────

test('leggi/scriviDoc: l\'originale resta dov\'era, i cloni in una mappa accanto', () => {
    const db = { nodeSheet: { fmt: '3x4' } };
    /* ⚠️ La regressione che conta: un progetto GIÀ SALVATO deve aprirsi come
       prima. Se l'originale si spostasse dentro la mappa dei cloni servirebbe
       una migrazione, e una migrazione sbagliata perde il lavoro del docente. */
    assert.deepStrictEqual(C.leggiDoc(db, 'nodeSheet', ''), { fmt: '3x4' });
    C.scriviDoc(db, 'nodeSheet', 'verifica ottobre', { fmt: '2x2' });
    assert.deepStrictEqual(db.nodeSheet, { fmt: '3x4' }, 'l\'originale non è stato toccato');
    assert.deepStrictEqual(C.leggiDoc(db, 'nodeSheet', 'verifica ottobre'), { fmt: '2x2', clone: 'verifica ottobre' });
    assert.deepStrictEqual(Object.keys(db.nodeSheetCloni), ['verifica ottobre']);
});

test('leggiDoc: la chiave normalizza, il nome scritto dal docente si conserva', () => {
    const db = {};
    C.scriviDoc(db, 'causalDoc', 'Verifica  Ottobre', { x: 1 });
    // stesso documento comunque lo si scriva
    assert.ok(C.leggiDoc(db, 'causalDoc', 'verifica ottobre'));
    assert.ok(C.leggiDoc(db, 'causalDoc', 'VERIFICA OTTOBRE'));
    // ma il nome da mostrare è quello originale
    assert.deepStrictEqual(C.elencaCloni(db, 'causalDoc'), ['Verifica Ottobre']);
});

test('leggiDoc: un clone che non c\'è torna null, non l\'originale', () => {
    const db = { nodeSheet: { fmt: '3x4' } };
    assert.strictEqual(C.leggiDoc(db, 'nodeSheet', 'mai visto'), null,
        'ripiegare sull\'originale farebbe correggere il documento sbagliato');
});

test('eliminaDoc: l\'ORIGINALE non si elimina da qui', () => {
    const db = { nodeSheet: { fmt: '3x4' } };
    C.scriviDoc(db, 'nodeSheet', 'copia', { fmt: '2x2' });
    assert.strictEqual(C.eliminaDoc(db, 'nodeSheet', ''), false);
    assert.ok(db.nodeSheet, 'e resta al suo posto');
    assert.strictEqual(C.eliminaDoc(db, 'nodeSheet', 'copia'), true);
    assert.deepStrictEqual(C.elencaCloni(db, 'nodeSheet'), []);
});

test('elencaCloni: su un progetto senza cloni non esplode e non inventa', () => {
    assert.deepStrictEqual(C.elencaCloni({}, 'nodeSheet'), []);
    assert.deepStrictEqual(C.elencaCloni(null, 'nodeSheet'), []);
});

test('🐛 il nome della copia arriva DOPO il dettaglio: mai cercarlo per prefisso', () => {
    /* Il foglio dei nodi ha un dettaglio (il formato delle card), e
       `buildFileName` compone «pre-mappa-DETTAGLIO-nome». Chi cerca il file di
       una copia costruendo il prefisso «pre-mappa-nome» non lo trova MAI — e la
       copia sembra non aver prodotto niente. Questo test fissa l'ordine, così
       se un giorno cambia se ne accorge chi legge, non chi stampa. */
    const f = PC.buildFileName('nodesheet', null, false,
        { mappa: 'La Politica Svizzera', dettaglio: 'card', nome: 'verifica ottobre' });
    assert.strictEqual(f, 'Foglio-nodi-La Politica Svizzera-card-verifica ottobre.pdf');
    assert.ok(f.indexOf('La Politica Svizzera-verifica ottobre') < 0,
        'il nome della copia NON segue subito la mappa: il prefisso non basta');
    // e senza copia il file dell'originale resta quello di sempre
    assert.strictEqual(
        PC.buildFileName('nodesheet', null, false, { mappa: 'La Politica Svizzera', dettaglio: 'card' }),
        'Foglio-nodi-La Politica Svizzera-card.pdf');
});
