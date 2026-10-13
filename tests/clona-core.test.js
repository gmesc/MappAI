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

// ── D11 (0059): «Domande della fonte» nella tabella di ELABORA ──────────────
/* La console VERA in una vm, coi core veri (pipeline, docedit, clona): le righe
   escono da `MappAIElaboraConsole.materiali()`, la lista che la tabella di
   ELABORA consuma. Un set nato da «Domande della fonte» (`openQuestions`,
   `origin: 'elabora-questions'`, `type` «Aperte») cadeva nel ripiego di
   `_generePerSet` e si chiamava «Scelta Multipla». */
function consoleVera(sets, opz) {
    const o = opz || {};
    const fs = require('fs'), path = require('path'), vm = require('node:vm');
    const JS = f => fs.readFileSync(path.join(__dirname, '..', 'public/js', f), 'utf8');
    const g = {
        console: { log() { }, info() { }, warn() { }, error() { } },
        localStorage: { getItem: () => null, setItem() { }, removeItem() { } },
        sessionStorage: { getItem: () => null, setItem() { }, removeItem() { } },
        setTimeout, clearTimeout,
        appState: {
            sources: [], rootNodeLabel: 'La Politica Svizzera', activeVaultPath: o.disco ? '/prova/vault' : null,
            db: { nodes: [{ id: 'r', label: 'La Politica Svizzera', level: 0 }], links: [], studySets: sets }
        }
    };
    if (o.disco) g.electronAPI = { vaultMaterialsList: async () => ({ ok: true, files: o.disco }) };
    if (o.t) g.t = o.t;
    g.window = g;
    const ctx = vm.createContext(g);
    ['mappai-files-core.js', 'mappai-pipeline-core.js', 'mappai-docedit-core.js', 'mappai-clona-core.js', 'mappai-elabora-console.js']
        .forEach(f => vm.runInContext(JS(f), ctx));
    return g;
}
const righeSet = g => JSON.parse(JSON.stringify(g.MappAIElaboraConsole.materiali())).filter(m => /^set:/.test(m.id));

const MC = { id: 'mc', title: 'La Politica Svizzera — Scelta Multipla', type: 'Scelta Multipla', mode: 'quiz', date: '2026-09-28',
    items: [{ question: 'Chi elegge il Consiglio federale?', options: ['A', 'B'], correctIndex: 0 }] };
const DF = { id: 'df', title: 'Domande della fonte', mode: 'quiz', type: 'Aperte', origin: 'elabora-questions', date: '2026-09-29',
    items: [{ question: 'Perché la Svizzera restò neutrale?', answer: '', explanation: '' }] };
const DS = { id: 'ds', title: 'Domande della scheda', mode: 'quiz', type: 'Aperte', origin: 'elabora-questions', date: '2026-07-22',
    items: [{ question: 'Che cos\'è il ridotto nazionale?', answer: '', explanation: '' }] };

test('D11 (0059): un set con origin «elabora-questions» si chiama «Domande della fonte» nella tabella di ELABORA, non «Scelta Multipla»', async () => {
    const g = consoleVera([MC, DF, DS], { disco: [{ name: 'Quiz-MC-La Politica Svizzera.pdf', relPath: 'Materiale Studio/Quiz-MC-La Politica Svizzera.pdf', mtime: 5 }] });
    g.MappAIElaboraConsole.materiali();                     // avvia la lettura del disco (asincrona)
    for (let i = 0; i < 5; i++) await new Promise(r => setImmediate(r));
    const righe = righeSet(g);
    const riga = id => righe.find(m => m.id === 'set:' + id) || {};
    assert.strictEqual(riga('df').titolo, 'Domande della fonte');
    assert.notStrictEqual(riga('df').titolo, 'Scelta Multipla');
    assert.strictEqual(riga('df').tipo, 'Domande della fonte');
    assert.strictEqual(riga('mc').titolo, 'Scelta Multipla', 'il quiz a scelta multipla vero resta «Scelta Multipla»');
    /* il set di prima (nato «Domande della scheda», stessa origin dal 22/7): la
       RIGA dice «Domande della fonte»; il suo titolo resta il suo (nessuna migrazione) */
    assert.strictEqual(riga('ds').titolo, 'Domande della fonte');
    assert.strictEqual(DS.title, 'Domande della scheda');
    /* la riga non reclama il PDF del quiz vero: col genere quiz_mc i set se lo
       contendevano e nessuno lo agganciava (l'aggancio vuole un solo pretendente) */
    assert.strictEqual(riga('mc').relPath, 'Materiale Studio/Quiz-MC-La Politica Svizzera.pdf');
    assert.strictEqual(riga('df').relPath, undefined);
    /* una copia: «Domande della fonte - 2», l'etichetta del core */
    assert.strictEqual(C.clonaSet(DF, '2', { id: 'df2', genere: riga('df').tipo }).title, 'Domande della fonte - 2');
    /* in inglese il nome passa dalla sua chiave */
    const en = consoleVera([DF], { t: (k, f) => (k === 'ec_n_srcq' ? 'Source questions' : f) });
    assert.strictEqual(righeSet(en)[0].titolo, 'Source questions');
});

/* La tabella di ELABORA la disegna INSEGNA: `_tabelleV2` della console passa le
   righe, tolta la fonte, a `MappAITeach.tabelleMateriali(…, 'elabora')`, e i
   gruppi per genere stanno in `GRUPPI_MAT`. Un `tipo` che nessun gruppo nomina
   finisce in «Altri materiali»: il set di «Domande della fonte» stava fra i quiz
   (col nome sbagliato), e col suo genere nuovo deve restarci. */
function insegnaVera() {
    const fs = require('fs'), path = require('path'), vm = require('node:vm');
    const g = {
        console: { log() { }, info() { }, warn() { }, error() { } },
        localStorage: { getItem: () => null, setItem() { }, removeItem() { } },
        sessionStorage: { getItem: () => null, setItem() { }, removeItem() { } },
        setTimeout, clearTimeout,
        /* 'loading': il modulo rimanda il disegno a DOMContentLoaded, che qui
           non arriva mai; si prova solo la funzione esportata */
        document: { readyState: 'loading', addEventListener() { }, removeEventListener() { } }
    };
    g.window = g;
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'public/js/mappai-landing-teach.js'), 'utf8'), vm.createContext(g));
    return g.MappAITeach;
}

test('D11 (0059): la riga «Domande della fonte» resta nell\'elenco «Quiz» di ELABORA, non in «Altri materiali»', () => {
    const g = consoleVera([MC, DF]);
    /* come `_tabelleV2`: la fonte ha una tabella sua, il resto va a INSEGNA */
    const resto = JSON.parse(JSON.stringify(g.MappAIElaboraConsole.materiali())).filter(m => m.tipo !== 'Fonte');
    const tabs = JSON.parse(JSON.stringify(insegnaVera().tabelleMateriali(resto, false, 'elabora')));
    const gruppoDi = id => (tabs.find(tb => tb.righe.some(r => r.id === 'm:set:' + id)) || {}).id;
    assert.strictEqual(gruppoDi('df'), 'g:quiz', 'le domande della fonte stanno fra i quiz, come prima');
    assert.strictEqual(gruppoDi('mc'), 'g:quiz');
    assert.strictEqual(tabs.some(tb => tb.id === 'g:altro'), false, 'nessuna riga in «Altri materiali»');
    const quiz = tabs.find(tb => tb.id === 'g:quiz');
    assert.deepStrictEqual(quiz.righe.map(r => r.celle[0]).sort(), ['Domande della fonte', 'Scelta Multipla']);
});
