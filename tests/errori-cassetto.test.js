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
