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

test('i corpi del testo: scala chiusa, senza uscire dai bordi', () => {
    assert.strictEqual(P.corpoSu(22), 26);
    assert.strictEqual(P.corpoGiu(22), 18);
    assert.strictEqual(P.corpoGiu(18), 18, 'in fondo resta fermo');
    assert.strictEqual(P.corpoSu(40), 40, 'in cima resta fermo');
    assert.strictEqual(P.corpoSu(999), P.CORPO_DEF, 'un valore sporco riparte dal default');
});
