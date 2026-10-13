// tests/errori-cassetto.test.js — la saturazione del cassetto nel registro (16/8/26)
//
// Perché esiste: il guasto che ha morso davvero non è stato un errore, è stato
// lo spazio finito — e su un beta tester nessuno può andare a guardare. Queste
// prove tengono ferme le due cose che rendono utile l'allarme: le soglie, e la
// regola «una riga per livello, solo quando peggiora» (senza, ogni salvataggio
// ne aggiungerebbe una e il registro diventerebbe illeggibile).
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');

const MODULO = path.join(__dirname, '..', 'public', 'js', 'mappai-errori.js');

/* Il modulo è scritto per il browser: qui gli si dà il minimo indispensabile
   (localStorage finto + window senza `MappAIErrori`, o si autoprotegge e non
   si carica). Ogni prova riparte da un modulo PULITO: i contatori di sessione
   — quale livello è già stato segnalato — vivono nella chiusura. */
function carica(chiaviLS) {
    const store = Object.assign({}, chiaviLS || {});
    const localStorage = {
        get length() { return Object.keys(store).length; },
        key(i) { return Object.keys(store)[i]; },
        getItem(k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
        setItem(k, v) { store[k] = String(v); },
        removeItem(k) { delete store[k]; }
    };
    const scritte = [];
    global.localStorage = localStorage;
    global.window = {
        localStorage,
        addEventListener() { },
        MappAITeachCore: null,
        // il registro scrive via _mirror (localStorage) e via electronAPI: qui
        // si intercetta il secondo, che è la fonte vera
        electronAPI: { errorLogAppend(rec) { scritte.push(rec); } }
    };
    delete require.cache[require.resolve(MODULO)];
    const E = require(MODULO);
    return { E, scritte, store };
}

test('livelloSaturazione: le tre soglie, e il silenzio sotto la prima', () => {
    const { E } = carica();
    assert.strictEqual(E.livelloSaturazione(0), null);
    assert.strictEqual(E.livelloSaturazione(59), null, 'sotto il 60% non si dice niente');
    assert.strictEqual(E.livelloSaturazione(60), 'avviso');
    assert.strictEqual(E.livelloSaturazione(79), 'avviso');
    assert.strictEqual(E.livelloSaturazione(80), 'alto');
    assert.strictEqual(E.livelloSaturazione(89), 'alto');
    assert.strictEqual(E.livelloSaturazione(90), 'critico');
    assert.strictEqual(E.livelloSaturazione(140), 'critico', 'oltre la quota resta critico, non esplode');
});

test('cassetto(): misura il peso vero e lo rapporta alla quota', () => {
    // 24 MB su una quota di 48 = 50%: sotto la prima soglia, nessun livello
    const meta = 'x'.repeat(24 * 1048576 - 6);   // 6 = lunghezza della chiave
    const { E } = carica({ grosso: meta });
    const m = E.cassetto();
    assert.strictEqual(m.MB, 24);
    assert.strictEqual(m.quotaMB, 48);
    assert.strictEqual(m.pct, 50);
    assert.strictEqual(m.livello, null);
    assert.strictEqual(m.top[0].chiave, 'grosso', 'la chiave più pesante è in cima');
});

test('cassetto(): senza il core il conto delle copie non inventa numeri', () => {
    const { E } = carica({ tutor_ai_projects: JSON.stringify([{ id: 'p1', vault: 'A' }, { id: 'p2', vault: 'A' }]) });
    const m = E.cassetto();
    assert.strictEqual(m.progetti, 2, 'le voci si contano comunque');
    assert.strictEqual(m.copie, 0, 'le copie NO: senza anteprimaPotatura non si sa, e zero è la risposta prudente');
});

test('cassetto(): col core, le copie in eccesso sono quelle della Cabina', () => {
    const TC = require('../public/js/mappai-teach-core.js');
    const progetti = [
        { id: 'p1', vault: 'Il Clima', date: 3 },
        { id: 'p2', vault: 'Il Clima', date: 2 },   // copia
        { id: 'p3', vault: 'Il Clima', date: 1 },   // copia
        { id: 'p4', vault: 'La Carta', date: 9 }
    ];
    const { E } = carica({
        tutor_ai_projects: JSON.stringify(progetti),
        p1: 'a', p2: 'bb', p3: 'ccc', p4: 'd'
    });
    global.window.MappAITeachCore = TC;
    const m = E.cassetto();
    assert.strictEqual(m.progetti, 4);
    assert.strictEqual(m.copie, 2, 'di ogni mappa resta la più recente');
    assert.strictEqual(m.mappe, 2, 'due mappe distinte');
});

test('controllaCassetto: una riga per livello, e solo quando PEGGIORA', () => {
    // 30 MB su 48 = 62% → avviso
    const { E, scritte } = carica({ g: 'x'.repeat(30 * 1048576 - 1) });
    E.controllaCassetto('prova', true);
    assert.strictEqual(scritte.length, 1, 'il primo superamento si scrive');
    assert.match(scritte[0].messaggio, /AVVISO/);
    assert.strictEqual(scritte[0].dove, 'cassetto');

    // stessa misura, di nuovo: nessuna riga nuova
    E.controllaCassetto('prova', true);
    E.controllaCassetto('prova', true);
    assert.strictEqual(scritte.length, 1, 'lo stesso livello non si ripete');

    // ora peggiora davvero: 44 MB = 92% → critico
    global.localStorage.setItem('g2', 'x'.repeat(14 * 1048576));
    E.controllaCassetto('prova', true);
    assert.strictEqual(scritte.length, 2, 'un livello peggiore si scrive');
    assert.match(scritte[1].messaggio, /CRITICO/);

    // e se poi si libera spazio, non si ricomincia da capo con l'avviso
    global.localStorage.removeItem('g2');
    E.controllaCassetto('prova', true);
    assert.strictEqual(scritte.length, 2, 'scendendo di livello non si riscrive');
});

test('controllaCassetto: sotto la prima soglia il registro resta vuoto', () => {
    const { E, scritte } = carica({ g: 'x'.repeat(2 * 1048576) });
    const m = E.controllaCassetto('prova', true);
    assert.strictEqual(m.livello, null);
    assert.strictEqual(scritte.length, 0, 'un cassetto sano non lascia righe');
});

test('controllaCassetto: si autolimita, ma `forza` passa comunque', () => {
    const { E, scritte } = carica({ g: 'x'.repeat(30 * 1048576) });
    // senza forza la prima passa (ultimoControllo = 0), la seconda no
    assert.ok(E.controllaCassetto('uno'));
    assert.strictEqual(E.controllaCassetto('due'), null, 'una misura al minuto, non a ogni salvataggio');
    assert.ok(E.controllaCassetto('tre', true), 'con `forza` si misura sempre');
    assert.strictEqual(scritte.length, 1);
});

test('kill-switch: con mappai_error_log=0 non si registra nulla', () => {
    const { E, scritte } = carica({ mappai_error_log: '0', g: 'x'.repeat(46 * 1048576) });
    assert.strictEqual(E.controllaCassetto('prova', true), null);
    assert.strictEqual(scritte.length, 0);
});

/* Il contesto di ogni errore dice su quale mappa è successo. Lo leggeva da
   `window.appState`, che non esiste (`appState` è un `let` di app.js,
   invariante 3): il campo `mappa` mancava da OGNI riga del registro. Qui
   `global.appState` fa la parte del `let` lessicale — si vede per nome, e il
   `window` finto di `carica` non lo ha. */
test('registra: il contesto porta la mappa aperta, letta da appState lessicale', () => {
    const { E, scritte } = carica();
    global.appState = { rootNodeLabel: 'La Rivoluzione francese' };
    try {
        E.registra({ dove: 'prova', messaggio: 'boom' });
        assert.strictEqual(scritte[0].ctx.mappa, 'La Rivoluzione francese');
    } finally { delete global.appState; }
});

// ── dedup e tetto di sessione (25/9: le due regole del registro non avevano prove) ──
test('registra: lo stesso errore entro 60 s è una riga sola; dopo, una riga nuova', (t) => {
    t.mock.timers.enable({ apis: ['Date'], now: 1_000_000 });
    const { E, scritte } = carica();
    const err = { dove: 'renderer', messaggio: 'x is undefined', file: 'a.js', riga: 3 };
    assert.ok(E.registra(err));
    assert.strictEqual(E.registra(err), null, 'ripetizione immediata: nessuna riga');
    t.mock.timers.tick(59_000);
    assert.strictEqual(E.registra(err), null, 'ancora dentro la finestra');
    t.mock.timers.tick(60_001);
    assert.ok(E.registra(err), 'fuori dalla finestra: di nuovo una riga');
    // un errore diverso (altro file o altra riga) non è «lo stesso»
    assert.ok(E.registra({ ...err, riga: 4 }));
    assert.strictEqual(scritte.length, 3);
});

test('registra: oltre 200 errori distinti si smette, con UNA riga che lo dice', () => {
    const { E, scritte } = carica();
    for (let i = 0; i < 205; i++) E.registra({ dove: 'renderer', messaggio: 'errore ' + i });
    assert.strictEqual(scritte.length, 201, '200 errori + la riga del tetto');
    assert.match(scritte[200].messaggio, /Tetto di 200 errori raggiunto/);
    E.registra({ dove: 'renderer', messaggio: 'dopo il tetto' });
    assert.strictEqual(scritte.length, 201, 'la riga del tetto non si ripete');
});

// ── 0076 (ADR 0018, punto 4): il PREAVVISO all'80%, B2 (a) ───────────────────
// Una finestra MappAIModal una volta per sessione, con [Libera spazio] che apre
// la Cabina su «Gestione cartelle». Indipendente da `mappai_error_log`; acceso
// solo con `mappai_cassetto_snello` = '1' (spento: il modulo è quello di oggi).
function finestre(siRisponde) {
    const aperte = [], cabine = [];
    global.window.MappAIModal = {
        conferma(o) { aperte.push(o); return Promise.resolve(!!siRisponde); }
    };
    global.window.openCabina = (v, o) => cabine.push(o === undefined ? v : [v, o]);
    global.window.t = (_k, f) => f;
    return { aperte, cabine };
}
const MB = n => 'x'.repeat(n * 1048576);

test('0076: preavviso all\'80% — UNA finestra nella sessione, anche col registro spento', () => {
    const { E, scritte } = carica({ mappai_cassetto_snello: '1', mappai_error_log: '0', g: MB(40) });   // 83%
    const { aperte } = finestre(false);
    const m = E.controllaCassetto('avvio', true);
    assert.ok(m, 'col registro spento si misura lo stesso');
    assert.strictEqual(m.livello, 'alto');
    assert.strictEqual(aperte.length, 1, 'la finestra si apre');
    assert.match(aperte[0].testo, /La memoria rapida dell'app si sta riempiendo: libera spazio prima che si riempia del tutto\./);
    assert.strictEqual(aperte[0].conferma, 'Libera spazio');
    assert.strictEqual(aperte[0].annulla, 'Più tardi');
    E.controllaCassetto('salvataggio', true);
    global.localStorage.setItem('g2', MB(5));   // ora critico: è sempre la stessa sessione
    E.controllaCassetto('salvataggio', true);
    assert.strictEqual(aperte.length, 1, 'una volta per sessione, anche se peggiora');
    assert.strictEqual(scritte.length, 0, 'il registro resta spento');
});

test('0076: preavviso — [Libera spazio] apre la Cabina su «Gestione cartelle»', async () => {
    const { E } = carica({ mappai_cassetto_snello: '1', g: MB(40) });
    const { cabine } = finestre(true);
    E.controllaCassetto('avvio', true);
    await new Promise(r => setImmediate(r));
    assert.deepStrictEqual(cabine, [['profilo', { sezione: 'pr-cartelle' }]],
        'la vista della Cabina che contiene «Gestione cartelle», e la sezione portata in vista');
});

test('0076: preavviso — sotto l\'80% nessuna finestra', () => {
    const { E } = carica({ mappai_cassetto_snello: '1', g: MB(36) });   // 75%: «avviso», non «alto»
    const { aperte } = finestre(false);
    assert.strictEqual(E.controllaCassetto('avvio', true).livello, 'avviso');
    assert.strictEqual(aperte.length, 0);
});

test('0076 M7: preavviso — interruttore spento, nessuna finestra (oggi)', () => {
    const { E, scritte } = carica({ g: MB(44) });   // 92%
    const { aperte } = finestre(false);
    E.controllaCassetto('avvio', true);
    assert.strictEqual(aperte.length, 0, 'spento: si scrive solo nel registro, come oggi');
    assert.strictEqual(scritte.length, 1);
    // e col registro spento resta il silenzio di oggi
    const b = carica({ mappai_error_log: '0', g: MB(44) });
    const f2 = finestre(false);
    assert.strictEqual(b.E.controllaCassetto('avvio', true), null);
    assert.strictEqual(f2.aperte.length, 0);
});

test('0076: preavviso — `{ preavviso: false }` lo salta in QUELLA misura, non per la sessione', () => {
    const { E } = carica({ mappai_cassetto_snello: '1', g: MB(46) });
    const { aperte } = finestre(false);
    E.controllaCassetto('salvataggio perso', true, { preavviso: false });
    assert.strictEqual(aperte.length, 0, 'il cassetto pieno sta per parlare lui');
    E.controllaCassetto('avvio', true);
    assert.strictEqual(aperte.length, 1, 'il ramo del cassetto pieno può uscire in silenzio: allora il preavviso resta dovuto');
});

test('0076: preavviso — solo una finestra VISTA lo spegne per la sessione (la sua, o quella del cassetto pieno)', () => {
    const { E } = carica({ mappai_cassetto_snello: '1', g: MB(46) });
    const { aperte } = finestre(false);
    E.segnaFinestraCassetto();            // la finestra del cassetto pieno si è vista
    E.controllaCassetto('avvio', true);
    assert.strictEqual(aperte.length, 0, 'due finestre sullo stesso guasto sarebbero una di troppo');
    // senza il motore dei modali nessuna finestra si vede: il preavviso resta dovuto
    const b = carica({ mappai_cassetto_snello: '1', g: MB(46) });
    delete global.window.MappAIModal;
    b.E.controllaCassetto('avvio', true);
    const f = finestre(false);
    b.E.controllaCassetto('avvio', true);
    assert.strictEqual(f.aperte.length, 1);
});

test('0076: preavviso — senza il motore dei modali niente finestra e niente errore', () => {
    const { E } = carica({ mappai_cassetto_snello: '1', g: MB(40) });
    delete global.window.MappAIModal;
    assert.doesNotThrow(() => E.controllaCassetto('avvio', true));
});
