'use strict';
/*
 * misura-evidenze.test.js — la traccia di un giro di domande e il comando che
 * confronta due giri (passo 6 del piano Evidence, 21/9/26).
 *
 * Due banchi, nessun Electron:
 *  1) LA CUCITURA (`public/js/mappai-misura-evidenze.js`) dentro una sandbox
 *     `vm` con un `window` finto, come tests/study-session-evidence.test.js.
 *     Si prova che senza `electronAPI` — l'app dello studente su iPad — non
 *     lancia e la generazione arriva in fondo; che con un `electronAPI` finto
 *     scrive `misura-evidenze.json` col riassunto dentro; e che il giro si
 *     spezza quando l'interruttore cambia stato, che è il gesto della misura.
 *  2) IL COMANDO `tools/misura-evidenze/confronta.mjs`, con la sua autoprova e
 *     su due cartelle vere scritte qui in un temporaneo.
 */
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const vm = require('node:vm');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const PC = require(path.join(__dirname, '..', 'public', 'js', 'mappai-pipeline-core.js'));
const EC = require(path.join(__dirname, '..', 'public', 'js', 'mappai-evidence-core.js'));
const LS = require(path.join(__dirname, '..', 'public', 'js', 'mappai-local-search-core.js'));
const salvage = require(path.join(__dirname, '..', 'public', 'js', 'mappai-json-salvage.js')).salvage;

const JS = (nome) => path.join(__dirname, '..', 'public', 'js', nome);

// ── il materiale vero, costruito dai core che lo costruiscono nell'app ──────
const FRASI_FONTE = [
    'Un circuito e chiuso quando la corrente puo percorrere tutto il tragitto dal ' +
    'generatore al ricevitore e tornare indietro senza interruzioni.',
    'Puo anche capitare che un circuito sia perfettamente chiuso e collegato a dovere, ' +
    'e tuttavia la batteria cominci a riscaldarsi in modo anomalo.',
    'La resistenza di un conduttore si misura in ohm e cresce con la lunghezza del filo.'
];
function materialeConEvidenze() {
    const stato = {
        sources: [{ id: 'src-1', title: 'Elettricita.pdf', pages: [{ n: 4, text: FRASI_FONTE.join(' ') }] }],
        db: { nodes: [], links: [] }
    };
    const pacchetto = EC.costruisciPacchetto({
        records: LS.snapshot(stato).records, query: 'circuito chiuso corrente batteria'
    });
    return EC.materialeRamo({
        area: 'Elettricita', nodi: [{ label: 'Corto circuito' }], pacchetto: pacchetto
    }).materiale;
}

// ── il banco della cucitura ────────────────────────────────────────────────
/* `opz.electron` = una spia al posto di `electronAPI.savePipelineArtifact`;
   `opz.acceso` = lo stato dell'interruttore delle evidenze; `opz.tracce` = ciò
   che `MappAIEvidence.ultimeTracce()` racconta dei rami serviti. */
function banco(opz) {
    const o = opz || {};
    const scritture = [], detto = [];
    const win = {
        getPromptLanguage: () => 'it',
        getSystemKey: () => 'chiave-finta',
        fillPromptTemplate: () => 'CONSEGNA: scrivi le domande.',
        injectClassTuning: p => p,
        getMaxOutputTokens: n => n,
        QUIZ_TEMPERATURE: 0.4,
        salvageTruncatedJSON: salvage,
        MappAIPipelineCore: PC,
        MappAIEvidence: {
            acceso: () => !!(o.acceso !== undefined ? o.acceso() : false),
            ultimeTracce: () => (o.tracce ? o.tracce() : [])
        },
        _risposta: [],
        fetchModelAPI: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(win._risposta) }] } }] })
    };
    if (o.electron) {
        win.electronAPI = {
            savePipelineArtifact: async (arg) => { scritture.push(arg); return { success: true, path: '/finto/' + arg.fileName }; }
        };
    }
    const sandbox = {
        window: win,
        appState: { rootNodeLabel: 'Elettricita', aiProvider: 'infomaniak', db: { nodes: [], links: [], studySets: [] } },
        document: { getElementById: () => null, querySelectorAll: () => [] },
        console: { log() {}, info: (...a) => detto.push(a.join(' ')), warn: (...a) => detto.push(a.join(' ')), error() {} },
        setTimeout, clearTimeout
    };
    vm.runInNewContext(fs.readFileSync(JS('mappai-misura-evidenze.js'), 'utf8'), sandbox);
    vm.runInNewContext(fs.readFileSync(JS('mappai-study-session.js'), 'utf8'), sandbox);
    return { win, scritture, detto, M: win.MappAIMisuraEvidenze };
}

const generaQuiz = (h, material, extra) => h.win.generateDynamicQuiz(Object.assign({
    nodeLabel: 'Corto circuito', material: material, quizType: 'Scelta Multipla',
    quantity: 4, apiKey: 'chiave-finta', nonce: 'FISSO'
}, extra || {}));

// ── 1. la cucitura fuori da Electron ───────────────────────────────────────

test('senza electronAPI la cucitura non lancia e la generazione arriva in fondo', async () => {
    const h = banco({ acceso: () => true });
    const materiale = materialeConEvidenze();
    const ids = PC.idEvidenze(materiale);
    h.win._risposta = [
        { q: 'Buona', options: ['A', 'B', 'C'], correct: 'A', explanation: 'x', evidenzaId: ids[0] },
        { q: 'Senza prova', options: ['A', 'B', 'C'], correct: 'A', explanation: 'x' }
    ];
    const out = await generaQuiz(h, materiale);
    assert.strictEqual(out.length, 1, 'il foglio esce comunque: la misura non tocca il prodotto');
    assert.strictEqual(out[0].q, 'Buona');
    // il giro c'è, in memoria, anche se su disco non finirà niente
    const giro = h.M.giro();
    assert.strictEqual(giro.schema, PC.SCHEMA_MISURA);
    assert.strictEqual(giro.totali.ricevute, 2);
    assert.strictEqual(giro.totali.conId, 1);
    assert.strictEqual(giro.totali.perMotivo['id-assente'], 1);
    // e la chiusura non lancia: dice soltanto che electronAPI non c'è
    const esito = await h.M.chiudi();
    assert.strictEqual(esito.success, false);
    assert.match(String(esito.error), /electronAPI/);
});

test('con electronAPI il giro finisce in misura-evidenze.json, col riassunto dentro', async () => {
    const h = banco({ acceso: () => true, electron: true });
    const materiale = materialeConEvidenze();
    const ids = PC.idEvidenze(materiale);
    h.win._risposta = [
        { q: 'Buona', options: ['A', 'B', 'C'], correct: 'A', explanation: 'x', evidenzaId: ids[0] },
        { q: 'Inventata', options: ['A', 'B', 'C'], correct: 'A', explanation: 'x', evidenzaId: 'ev-0123456789abcdef-99' }
    ];
    await generaQuiz(h, materiale);
    await h.M.chiudi();
    assert.strictEqual(h.scritture.length, 1, 'una scrittura sola, alla chiusura');
    const s = h.scritture[0];
    assert.strictEqual(s.fileName, 'misura-evidenze.json');
    assert.match(s.runId, /^\d{8}_\d{6}_elettricita_evidenze-on$/, 'il nome del giro dice progetto e interruttore');
    const scritto = JSON.parse(s.content);
    assert.strictEqual(scritto.schema, PC.SCHEMA_MISURA);
    assert.strictEqual(scritto.interruttore, 'acceso');
    assert.strictEqual(scritto.progetto, 'Elettricita');
    assert.strictEqual(scritto.provider, 'infomaniak');
    assert.strictEqual(scritto.fogli.length, 1);
    assert.strictEqual(scritto.fogli[0].area, 'Corto circuito');
    assert.strictEqual(scritto.fogli[0].tipo, 'Scelta Multipla');
    assert.strictEqual(scritto.fogli[0].conto.conId, 1);
    assert.strictEqual(scritto.fogli[0].scartate[0].motivo, 'id-sconosciuto');
    assert.ok(scritto.fogli[0].pacchetto.ids.length >= 2, 'gli id serviti sono quelli che il materiale elencava');
});

test('la traccia dice gli id serviti anche a interruttore spento (zero, perché zero gliene sono stati serviti)', async () => {
    const h = banco({ acceso: () => false, electron: true });
    const MATERIALE_SENZA_ID = 'AREA: Elettricita\nCorto circuito: la batteria si scalda.\n' + FRASI_FONTE[0];
    h.win._risposta = [
        { q: 'Con la frase giusta', options: ['A', 'B', 'C'], correct: 'A', explanation: 'x', evidenza: FRASI_FONTE[0] },
        { q: 'Con una frase inventata', options: ['A', 'B', 'C'], correct: 'A', explanation: 'x', evidenza: 'La Commissione Bergier fu formata nel 1996 con mandato parlamentare straordinario' }
    ];
    const out = await generaQuiz(h, MATERIALE_SENZA_ID);
    assert.strictEqual(out.length, 1);
    const giro = h.M.giro();
    assert.strictEqual(giro.interruttore, 'spento');
    assert.strictEqual(giro.totali.idsServiti, 0);
    assert.strictEqual(giro.totali.conId, 0, 'senza elenco nessuna domanda può portare un id');
    assert.strictEqual(giro.totali.prove.frase, 1, 'la prova della strada vecchia è una frase');
    assert.strictEqual(giro.totali.perMotivo[PC.MOTIVO_SOMIGLIANZA], 1, 'lo scarto lessicale ha una chiave sua');
    await h.M.chiudi();
    assert.match(h.scritture[0].runId, /_evidenze-off$/);
});

test('il pacchetto del ramo arriva dalla traccia delle evidenze, e l accento scomposto non lo fa perdere', async () => {
    const tracce = [{
        quando: '2026-09-21T15:29:00.000Z', area: 'Neutralità armata'.normalize('NFD'),
        query: 'neutralità armata esercito', ids: ['ev-626f5dbd6c6c4bff-12'], scartate: 3, caratteri: 4210
    }];
    const h = banco({ acceso: () => true, tracce: () => tracce });
    const materiale = materialeConEvidenze();
    const ids = PC.idEvidenze(materiale);
    h.win._risposta = [{ q: 'Buona', options: ['A', 'B', 'C'], correct: 'A', explanation: 'x', evidenzaId: ids[0] }];
    await generaQuiz(h, materiale, { nodeLabel: 'Neutralità armata'.normalize('NFC') });
    const f = h.M.giro().fogli[0];
    assert.strictEqual(f.pacchetto.query, 'neutralità armata esercito', 'la traccia è stata ritrovata');
    assert.strictEqual(f.pacchetto.unitaScartate, 3);
    assert.ok(f.pacchetto.caratteri > 0);
    await h.M.chiudi();   // la scrittura è differita: senza chiusura resta un timer appeso
});

test('il giro si spezza quando l interruttore cambia stato', async () => {
    let acceso = false;
    const h = banco({ acceso: () => acceso, electron: true });
    const foglio = () => h.M.foglio({
        area: 'Corto circuito', tipo: 'Scelta Multipla', angolo: 'auto',
        materiale: 'AREA: Elettricita', ricevute: [{ q: 'a' }], tenute: [{ q: 'a' }], scartati: []
    });
    const primo = foglio();
    acceso = true;
    const secondo = foglio();
    assert.notStrictEqual(primo, secondo, 'due giri, due cartelle');
    assert.match(primo, /_evidenze-off$/);
    assert.match(secondo, /_evidenze-on$/);
    assert.strictEqual(h.M.giro().fogli.length, 1, 'il secondo giro comincia da zero');
    await h.M.chiudi();
});

/* IL FOGLIO OSSERVATO (21/9, packet 0008). Flashcard e domande aperte non
   scartano niente: alla cucitura arriva un foglio in cui `tenute` è lo stesso
   elenco di `ricevute` e `scartati` è vuoto. La traccia deve dire il vero lo
   stesso — quante ne sono arrivate e quante portano un identificatore valido —
   e il foglio del docente deve restare intero. */
test('un foglio OSSERVATO (ricevute = tenute, zero scartati) dà i numeri giusti', async () => {
    const h = banco({ acceso: () => true, electron: true });
    const materiale = materialeConEvidenze();
    const ids = PC.idEvidenze(materiale);
    const carte = [
        { front: 'Con la prova', back: 'x', evidenzaId: ids[0] },
        { front: 'Senza la prova', back: 'y' }
    ];
    h.M.foglio({
        area: 'Corto circuito', tipo: 'Flashcard', angolo: 'definizioni',
        materiale: materiale, ricevute: carte, tenute: carte, scartati: []
    });
    const f = h.M.giro().fogli[0];
    assert.strictEqual(f.conto.ricevute, 2);
    assert.strictEqual(f.conto.tenute, 2, 'il foglio contiene ancora due carte');
    assert.strictEqual(f.conto.conId, 1, 'con un identificatore valido: 1');
    assert.strictEqual(f.conto.scartate, 0);
    assert.deepStrictEqual(Object.keys(f.conto.perMotivo), [], 'nessun motivo: non si è scartato');
    assert.ok(f.pacchetto.ids.length >= 2, 'gli id serviti restano quelli del materiale');
    // le domande aperte portano l'array: una prova valida su due basta
    const domande = [{ question: 'Provata a meta', prove: ['ev-0123456789abcdef-99', ids[1]] }];
    h.M.foglio({
        area: 'Corto circuito', tipo: 'Domande aperte', angolo: 'causa',
        materiale: materiale, ricevute: domande, tenute: domande, scartati: []
    });
    const giro = h.M.giro();
    assert.strictEqual(giro.totali.ricevute, 3);
    assert.strictEqual(giro.totali.conId, 2);
    assert.strictEqual(giro.totali.scartate, 0);
    assert.strictEqual(giro.nodi.length, 1, 'stesso ramo, due fogli: un nodo solo');
    assert.strictEqual(giro.nodi[0].fogli, 2);
    await h.M.chiudi();
});

test('la cucitura non lancia nemmeno sui dati storti', () => {
    const h = banco({ acceso: () => true });
    assert.doesNotThrow(() => h.M.foglio(null));
    assert.doesNotThrow(() => h.M.foglio({}));
    assert.doesNotThrow(() => h.M.foglio({ area: 'X', materiale: 42, ricevute: 'niente' }));
    assert.doesNotThrow(() => h.M.stato());
    h.M.chiudi();
});

// ── 2. il comando ──────────────────────────────────────────────────────────

const CONFRONTA = path.join(__dirname, '..', 'tools', 'misura-evidenze', 'confronta.mjs');

test('confronta.mjs --autoprova: i numeri delle due tracce finte tornano', () => {
    const e = spawnSync(process.execPath, [CONFRONTA, '--autoprova'], { encoding: 'utf8' });
    assert.strictEqual(e.status, 0, e.stdout + e.stderr);
    assert.match(e.stdout, /Nodi in comune: 2/);
    assert.match(e.stdout, /17 numeri su 17 come attesi/);
    assert.match(e.stdout, /solo nel primo giro \(1\)/);
    assert.match(e.stdout, /solo nel secondo giro \(1\)/);
});

test('confronta.mjs su due cartelle di giro: legge, confronta e dichiara i nodi non in comune', () => {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), 'misura-'));
    const giro = (interruttore, fogli) => PC.riassuntoScarti({
        runId: 'giro-' + interruttore, progetto: 'Elettricita', quando: '2026-09-21T15:00:00.000Z',
        interruttore, provider: 'infomaniak', modello: 'modello-finto', fogli
    });
    const ID = 'ev-626f5dbd6c6c4bff-7';
    const scrivi = (nome, dati) => {
        const dir = path.join(base, nome);
        fs.mkdirSync(dir);
        fs.writeFileSync(path.join(dir, 'misura-evidenze.json'), JSON.stringify(dati, null, 2), 'utf8');
        return dir;
    };
    const a = scrivi('spento', giro('spento', [
        { area: 'Corto circuito', tipo: 'Scelta Multipla', ids: [], ricevute: [{ q: '1' }, { q: '2' }], tenute: [{ q: '1', evidenza: 'una frase' }], scartati: [{ q: '2', evidenza: 'un invenzione', quota: 0.2 }] },
        { area: 'Resistenza', tipo: 'Scelta Multipla', ids: [], ricevute: [{ q: '1' }], tenute: [{ q: '1', evidenza: 'una frase' }], scartati: [] }
    ]));
    const b = scrivi('acceso', giro('acceso', [
        { area: 'Corto circuito', tipo: 'Scelta Multipla', ids: [ID], ricevute: [{ q: '1' }, { q: '2' }], tenute: [{ q: '1', evidenzaId: ID }], scartati: [{ q: '2', motivo: 'id-assente', evidenza: '' }] }
    ]));
    const e = spawnSync(process.execPath, [CONFRONTA, a, b], { encoding: 'utf8' });
    assert.strictEqual(e.status, 0, e.stdout + e.stderr);
    assert.match(e.stdout, /Nodi in comune: 1/);
    assert.match(e.stdout, /solo nel primo giro \(1\): Resistenza/);
    assert.match(e.stdout, /con un identificatore valido\s+\|\s+0 \|\s+1/);
    assert.match(e.stdout, /id-assente\s+\|\s+0 \|\s+1/);
    fs.rmSync(base, { recursive: true, force: true });
});

test('confronta.mjs senza due giri si ferma e lo dice', () => {
    const e = spawnSync(process.execPath, [CONFRONTA], { encoding: 'utf8' });
    assert.strictEqual(e.status, 1);
    assert.match(e.stderr, /Servono due giri/);
});
