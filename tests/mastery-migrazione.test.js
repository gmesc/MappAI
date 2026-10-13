'use strict';
/*
 * La MIGRAZIONE della padronanza (mappai-mastery.js, `_migrateLegacyKey`).
 *
 * Lo studio fatto prima del primo salvataggio del vault finisce sotto
 * 'mappai_mastery::<rootNodeLabel>'; quando c'è `activeVaultPath` va fuso nella
 * chiave-path e la legacy tolta. Il difetto (25/9/2026): a quota di
 * localStorage piena la scrittura falliva in silenzio e la legacy veniva
 * cancellata lo stesso — la padronanza dello studente spariva al riavvio.
 *
 * Ogni `avvia()` ricarica il modulo da zero: è il riavvio dell'app, con lo
 * stato in memoria perso e solo localStorage a ricordare.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const MODULO = require.resolve(path.join(__dirname, '..', 'public', 'js', 'mappai-mastery.js'));
const LEGACY = 'mappai_mastery::Fotosintesi';
const NUOVA = 'mappai_mastery::/vault/Fotosintesi';
const VAULT = () => ({ rootNodeLabel: 'Fotosintesi', activeVaultPath: '/vault/Fotosintesi' });

// localStorage finto. `rifiuta(k)` dice come fallisce la scrittura di k:
// 'lancia' (quota piena, il caso vero) o 'tace' (scrittura persa senza errore).
function finto(iniziale, rifiuta) {
    const m = new Map(Object.entries(iniziale || {}));
    return {
        getItem: (k) => (m.has(k) ? m.get(k) : null),
        setItem: (k, v) => {
            const modo = rifiuta && rifiuta(k);
            if (modo === 'lancia') {
                const e = new Error('The quota has been exceeded.');
                e.name = 'QuotaExceededError';
                throw e;
            }
            if (modo !== 'tace') m.set(k, String(v));
        },
        removeItem: (k) => { m.delete(k); },
        chiavi: () => Array.from(m.keys()).sort()
    };
}

function avvia(ls, appState) {
    global.localStorage = ls;
    global.window = { appState };
    delete require.cache[MODULO];
    require(MODULO);
    return global.window.MappAIMastery;
}

// Una riga di padronanza come la scrive applyResult.
const riga = (nodeId, activity, accuracy) => ({
    nodeId, activity, label: nodeId, accuracy, rate: null, attempts: 1, lastTs: 1, history: [{ ts: 1, acc: accuracy, rate: null }]
});

function muto(t) {
    t.mock.method(console, 'log', () => { });
    return t.mock.method(console, 'warn', () => { });
}

test('quota piena: la scrittura fallisce e la legacy RESTA intatta', (t) => {
    const avvisi = muto(t);
    const legacy = { 'N1::richiamo': riga('N1', 'richiamo', 0.9) };
    for (const modo of ['lancia', 'tace']) {
        const ls = finto({ [LEGACY]: JSON.stringify(legacy) }, (k) => (k === NUOVA ? modo : null));
        const MM = avvia(ls, VAULT());
        const store = MM.all();
        assert.equal(ls.getItem(LEGACY), JSON.stringify(legacy), `${modo}: la legacy è stata cancellata`);
        assert.equal(ls.getItem(NUOVA), null, `${modo}: la chiave nuova non doveva esserci`);
        assert.equal(store['N1::richiamo'].accuracy, 0.9, `${modo}: in questa sessione la padronanza si vede lo stesso`);
    }
    assert.equal(avvisi.mock.callCount(), 2, 'la migrazione rinviata lo dice, ogni volta');
});

test('quota piena, poi riavvio con spazio: la migrazione si completa e non si perde niente', (t) => {
    muto(t);
    let piena = true;
    const ls = finto({ [LEGACY]: JSON.stringify({ 'N1::richiamo': riga('N1', 'richiamo', 0.9) }) },
        (k) => (piena && k === NUOVA ? 'lancia' : null));
    avvia(ls, VAULT()).all();
    assert.ok(ls.getItem(LEGACY), 'primo avvio: la legacy resta');

    piena = false;
    const MM = avvia(ls, VAULT());   // riavvio
    assert.equal(MM.pinpoint('N1', 'richiamo').accuracy, 0.9);
    assert.equal(ls.getItem(LEGACY), null, 'secondo avvio: ora la legacy si può togliere');
    assert.equal(JSON.parse(ls.getItem(NUOVA))['N1::richiamo'].accuracy, 0.9, 'e la padronanza è nella chiave nuova');
});

test('migrazione riuscita: la legacy si toglie e la chiave nuova ha i dati', (t) => {
    muto(t);
    const legacy = { 'N1::richiamo': riga('N1', 'richiamo', 0.9), 'N2::spiega': riga('N2', 'spiega', 0.4) };
    const ls = finto({ [LEGACY]: JSON.stringify(legacy) });
    avvia(ls, VAULT()).all();
    assert.equal(ls.getItem(LEGACY), null);
    assert.deepEqual(JSON.parse(ls.getItem(NUOVA)), legacy);
    assert.deepEqual(ls.chiavi(), [NUOVA]);
});

test('stesso nome per titolo e percorso: la legacy È la chiave, e non si cancella', (t) => {
    muto(t);
    const ls = finto({ 'mappai_mastery::Fotosintesi': JSON.stringify({ 'N1::richiamo': riga('N1', 'richiamo', 1) }) });
    const MM = avvia(ls, { rootNodeLabel: 'Fotosintesi', activeVaultPath: 'Fotosintesi' });
    assert.equal(MM.pinpoint('N1', 'richiamo').accuracy, 1);
    assert.ok(ls.getItem('mappai_mastery::Fotosintesi'));
});

test('fusione: la legacy riempie i buchi, sui doppioni vince la chiave-path', (t) => {
    muto(t);
    const ls = finto({
        [LEGACY]: JSON.stringify({ 'N1::richiamo': riga('N1', 'richiamo', 0.9), 'N2::richiamo': riga('N2', 'richiamo', 0.5) }),
        [NUOVA]: JSON.stringify({ 'N1::richiamo': riga('N1', 'richiamo', 0.2), 'N3::spiega': riga('N3', 'spiega', 0.7) })
    });
    const store = avvia(ls, VAULT()).all();
    assert.deepEqual(Object.keys(store).sort(), ['N1::richiamo', 'N2::richiamo', 'N3::spiega']);
    assert.equal(store['N1::richiamo'].accuracy, 0.2, 'la chiave-path è quella esportata nel vault: non si sovrascrive');
    assert.equal(store['N2::richiamo'].accuracy, 0.5, 'ciò che c\'era solo nella legacy entra');
    assert.equal(store['N3::spiega'].accuracy, 0.7);
    assert.deepEqual(JSON.parse(ls.getItem(NUOVA)), store, 'e la fusione è scritta, non solo in memoria');
    assert.equal(ls.getItem(LEGACY), null);
});

test('JSON corrotto o «null» nella chiave: si riparte da {} senza lanciare', (t) => {
    muto(t);
    for (const guasto of ['{non è json', 'null']) {
        const ls = finto({ 'mappai_mastery::/vault/X': guasto });
        const MM = avvia(ls, { activeVaultPath: '/vault/X' });
        assert.deepEqual(MM.all(), {}, `«${guasto}»`);
        MM.record('N1', 'Clorofilla', 'richiamo', { score: 1 });
        assert.equal(JSON.parse(ls.getItem('mappai_mastery::/vault/X'))['N1::richiamo'].accuracy, 1, 'si registra di nuovo');
    }
});

test('chiave per vault: percorso, poi titolo, poi «default»; cambiare vault cambia store', (t) => {
    muto(t);
    const ls = finto();
    const st = { rootNodeLabel: 'Fotosintesi', activeVaultPath: '/vault/A' };
    const MM = avvia(ls, st);
    MM.record('N1', 'Clorofilla', 'richiamo', { score: 1 });
    assert.ok(ls.getItem('mappai_mastery::/vault/A'), 'col percorso la chiave è il percorso');

    st.activeVaultPath = '/vault/B';
    assert.deepEqual(MM.all(), {}, 'un altro vault non vede la padronanza del primo');

    st.activeVaultPath = null;
    MM.record('N2', 'Stomi', 'spiega', { score: 0 });
    assert.ok(ls.getItem('mappai_mastery::Fotosintesi'), 'senza percorso la chiave è il titolo');

    st.rootNodeLabel = '';
    MM.record('N3', 'Glucosio', 'richiamo', { score: 1 });
    assert.ok(ls.getItem('mappai_mastery::default'), 'senza nessuno dei due, «default»');

    st.activeVaultPath = '/vault/A';
    assert.equal(MM.pinpoint('N1', 'richiamo').accuracy, 1, 'tornando al primo vault, la padronanza è lì');
});
