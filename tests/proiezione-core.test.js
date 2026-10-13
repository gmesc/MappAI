/* Prove di `mappai-proiezione-core.js` — la geometria della vista «Proietta».
   La prova che conta: nello zoom sul puntatore, il punto dell'immagine sotto
   il cursore NON si muove — è ciò che rende lo zoom con la rotellina
   utilizzabile su una carta storica proiettata. */
const test = require('node:test');
const assert = require('node:assert');
const P = require('../public/js/mappai-proiezione-core.js');

test('adatta: l\'immagine entra nei DUE assi, centrata', () => {
    // foto orizzontale in un riquadro verticale: comanda la larghezza
    const a = P.adatta(2000, 1000, 800, 900);
    assert.ok(2000 * a.z <= 800 && 1000 * a.z <= 900);
    assert.ok(Math.abs((a.x * 2 + 2000 * a.z) - 800) < 1, 'centrata in x');
    // foto piccola su una LIM: si INGRANDISCE (niente tetto a 1×)
    const b = P.adatta(200, 100, 1600, 900);
    assert.ok(b.z > 1);
    // misure a zero: non esplode
    assert.deepStrictEqual(P.adatta(0, 0, 800, 600), { z: 1, x: 0, y: 0 });
});

test('⚠️ zoomAlPunto: il punto sotto il cursore resta fermo', () => {
    let st = { z: 1, x: 50, y: 30 };
    const px = 400, py = 250;
    const puntoImg = { x: (px - st.x) / st.z, y: (py - st.y) / st.z };
    st = P.zoomAlPunto(st, px, py, 1.5);
    assert.ok(Math.abs((puntoImg.x * st.z + st.x) - px) < 1e-6);
    assert.ok(Math.abs((puntoImg.y * st.z + st.y) - py) < 1e-6);
    // e anche rimpicciolendo
    st = P.zoomAlPunto(st, px, py, 0.5);
    assert.ok(Math.abs((puntoImg.x * st.z + st.x) - px) < 1e-6);
});

test('zoomAlPunto: la scala resta nei limiti', () => {
    const su = P.zoomAlPunto({ z: 7, x: 0, y: 0 }, 0, 0, 10);
    assert.strictEqual(su.z, P.Z_MAX);
    const giu = P.zoomAlPunto({ z: 0.1, x: 0, y: 0 }, 0, 0, 0.01);
    assert.strictEqual(giu.z, P.Z_MIN);
});

test('clampPan: una striscia dell\'immagine resta SEMPRE nel riquadro', () => {
    // trascinata via a destra: si ferma con 48px ancora dentro
    const st = P.clampPan({ z: 1, x: 5000, y: 0 }, 1000, 800, 800, 600);
    assert.strictEqual(st.x, 800 - 48);
    // trascinata via a sinistra
    const st2 = P.clampPan({ z: 1, x: -5000, y: -5000 }, 1000, 800, 800, 600);
    assert.strictEqual(st2.x, 48 - 1000);
    assert.strictEqual(st2.y, 48 - 800);
    // immagine più piccola della striscia: il clamp usa la sua misura, non 48
    const st3 = P.clampPan({ z: 1, x: 5000, y: 0 }, 20, 20, 800, 600);
    assert.strictEqual(st3.x, 800 - 20);
});

/* «Aa» a ciclo (0079, B7): un bottone solo, quattro taglie che crescono, poi ×1. */
test('«Aa»: 22 → 28 → 33 → 40 e di nuovo 22, col fattore detto', () => {
    assert.deepStrictEqual(P.AA_CORPI, [22, 28, 33, 40]);
    assert.strictEqual(P.CORPO_DEF, 22);
    const giro = [P.CORPO_DEF];
    for (let i = 0; i < 4; i++) giro.push(P.aaSucc(giro[giro.length - 1]));
    assert.deepStrictEqual(giro, [22, 28, 33, 40, 22], 'dopo la più grande si torna a ×1');
    assert.deepStrictEqual(P.AA_CORPI.map(P.aaFattore), [1, 1.25, 1.5, 1.8]);
    assert.ok(P.AA_CORPI.every(c => c >= 22 && c <= 40), 'mai sotto la partenza né oltre il tetto');
});

test('«Aa»: un valore sporco riparte da ×1', () => {
    assert.strictEqual(P.aaSucc(999), P.CORPO_DEF);
    assert.strictEqual(P.aaSucc(18), P.CORPO_DEF, 'il 18 di prima non è più una taglia');
    assert.strictEqual(P.aaSucc(undefined), P.CORPO_DEF);
    assert.strictEqual(P.aaFattore(999), 1);
});

// ── Lo split fra immagine e scheda (0079, lotto B) ───────────────────────────
const S = P.SPLIT;
test('split: soglie dei DUE lati, e la frazione d\'inizio resta alla chiusura', () => {
    const inizio = { frazione: 0.6, chiusa: null };
    assert.deepStrictEqual(P.splitDaPuntatore(50, 1000, inizio), { frazione: 0.6, chiusa: 'immagine' }, 'sotto il 10% a sinistra: l\'immagine si chiude');
    assert.deepStrictEqual(P.splitDaPuntatore(950, 1000, inizio), { frazione: 0.6, chiusa: 'scheda' }, 'oltre il 90%: la scheda si chiude');
    assert.deepStrictEqual(P.splitDaPuntatore(300, 1000, inizio), { frazione: 0.3, chiusa: null });
    assert.deepStrictEqual(P.splitDaPuntatore(100, 1000, inizio), { frazione: 0.1, chiusa: null }, 'sulla soglia resta aperto');
    // da chiusa, trascinando la linguetta in mezzo si riapre
    assert.deepStrictEqual(P.splitDaPuntatore(500, 1000, { frazione: 0.7, chiusa: 'scheda' }), { frazione: 0.5, chiusa: null });
    // area senza larghezza: niente cambia
    assert.deepStrictEqual(P.splitDaPuntatore(10, 0, inizio), { frazione: 0.6, chiusa: null });
    assert.strictEqual(S.DEF, 0.55, 'la proporzione di sempre (55:45)');
});

test('split: i tasti — frecce, Home, End, Invio e Spazio', () => {
    const aperto = { frazione: 0.5, chiusa: null };
    assert.deepStrictEqual(P.splitDaTasto(aperto, 'ArrowLeft'), { frazione: 0.45, chiusa: null });
    assert.deepStrictEqual(P.splitDaTasto(aperto, 'ArrowRight'), { frazione: 0.55, chiusa: null });
    assert.deepStrictEqual(P.splitDaTasto({ frazione: 0.12, chiusa: null }, 'ArrowLeft'), { frazione: 0.12, chiusa: 'immagine' }, 'oltre la soglia chiude, con la frazione di prima');
    assert.deepStrictEqual(P.splitDaTasto({ frazione: 0.88, chiusa: null }, 'ArrowRight'), { frazione: 0.88, chiusa: 'scheda' });
    // da chiuso: la freccia che si allontana dal bordo riapre, quella verso il bordo non fa nulla
    assert.deepStrictEqual(P.splitDaTasto({ frazione: 0.4, chiusa: 'immagine' }, 'ArrowRight'), { frazione: 0.4, chiusa: null });
    assert.deepStrictEqual(P.splitDaTasto({ frazione: 0.4, chiusa: 'immagine' }, 'ArrowLeft'), { frazione: 0.4, chiusa: 'immagine' });
    assert.deepStrictEqual(P.splitDaTasto({ frazione: 0.4, chiusa: 'scheda' }, 'ArrowLeft'), { frazione: 0.4, chiusa: null });
    assert.deepStrictEqual(P.splitDaTasto({ frazione: 0.4, chiusa: 'scheda' }, 'ArrowRight'), { frazione: 0.4, chiusa: 'scheda' });
    assert.deepStrictEqual(P.splitDaTasto(aperto, 'Home'), { frazione: 0.5, chiusa: 'immagine' });
    assert.deepStrictEqual(P.splitDaTasto(aperto, 'End'), { frazione: 0.5, chiusa: 'scheda' });
    for (const k of ['Enter', ' ']) {
        assert.deepStrictEqual(P.splitDaTasto(aperto, k), { frazione: 0.5, chiusa: 'scheda' }, k + ' a tutti e due aperti: chiude la scheda');
        assert.deepStrictEqual(P.splitDaTasto({ frazione: 0.5, chiusa: 'immagine' }, k), { frazione: 0.5, chiusa: null }, k + ' riapre l\'immagine');
        assert.deepStrictEqual(P.splitDaTasto({ frazione: 0.5, chiusa: 'scheda' }, k), { frazione: 0.5, chiusa: null }, k + ' riapre la scheda (lo stato con cui si apre)');
    }
    assert.strictEqual(P.splitDaTasto(aperto, 'a'), null, 'un altro tasto non è gestito');
});

test('split: i confini al 10% e al 90% restano aperti, e i passi non derivano', () => {
    const inizio = { frazione: 0.6, chiusa: null };
    assert.deepStrictEqual(P.splitDaPuntatore(900, 1000, inizio), { frazione: 0.9, chiusa: null }, 'sulla soglia destra resta aperto');
    assert.deepStrictEqual(P.splitDaPuntatore(901, 1000, inizio), { frazione: 0.6, chiusa: 'scheda' });
    assert.deepStrictEqual(P.splitDaTasto({ frazione: 0.15, chiusa: null }, 'ArrowLeft'), { frazione: 0.1, chiusa: null }, '0,15 ← = 0,1 aperto');
    assert.deepStrictEqual(P.splitDaTasto({ frazione: 0.85, chiusa: null }, 'ArrowRight'), { frazione: 0.9, chiusa: null }, '0,85 → = 0,9 aperto');
    let s = { frazione: S.DEF, chiusa: null };
    for (let i = 0; i < 5; i++) s = P.splitDaTasto(s, 'ArrowRight');
    assert.deepStrictEqual(s, { frazione: 0.8, chiusa: null }, 'cinque → da 0,55 = esattamente 0,8');
    for (let i = 0; i < 2; i++) s = P.splitDaTasto(s, 'ArrowRight');
    assert.deepStrictEqual(s, { frazione: 0.9, chiusa: null }, 'fino a 0,9 resta aperto');
    assert.deepStrictEqual(P.splitDaTasto(s, 'ArrowRight'), { frazione: 0.9, chiusa: 'scheda' }, 'il passo dopo chiude');
});

test('split: la frazione ricordata vale solo fra le soglie', () => {
    assert.strictEqual(P.splitLeggi(0.1), 0.1, 'le soglie stesse valgono');
    assert.strictEqual(P.splitLeggi('0.3'), 0.3);
    assert.strictEqual(P.splitLeggi(0.9), 0.9);
    for (const sporco of [null, undefined, '', 'abc', '0.05', 0.95, -1, 2]) assert.strictEqual(P.splitLeggi(sporco), S.DEF, String(sporco));
});
