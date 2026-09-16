// Test del nucleo RSVP (mappai-rsvp-core.js): la lettera di fissazione, le
// pause, le frasi e il markup — ciò che la lettura veloce e l'effetto «una
// parola alla volta» del lettore ad alta voce danno per buono.
const { test } = require('node:test');
const assert = require('node:assert');
const R = require('../public/js/mappai-rsvp-core.js');

test('orp: la lettera di fuoco segue la lunghezza (come rsvp-reading)', () => {
    assert.strictEqual(R.orp('a'), 0);
    assert.strictEqual(R.orp('del'), 0);
    assert.strictEqual(R.orp('carta'), 1);          // 5 lettere
    assert.strictEqual(R.orp('funzionario'), 3);    // 11 lettere
    assert.strictEqual(R.orp('ricchissimamente'), 4); // 16 → floor(log2 15)+1
});

test('orp: la punteggiatura davanti non conta («Cai → C, non «)', () => {
    assert.strictEqual(R.orp('«Cai'), 1);
    assert.deepStrictEqual(R.dividi('«carta»'), { prima: '«c', fuoco: 'a', dopo: 'rta»' });
});

test('pausa: doppia a fine frase, una volta e mezza sulla virgola', () => {
    const base = 60000 / 300;
    assert.strictEqual(R.pausa('carta', 300), base);
    assert.strictEqual(R.pausa('carta.', 300), base * 2);
    assert.strictEqual(R.pausa('carta?»', 300), base * 2);
    assert.strictEqual(R.pausa('carta,', 300), base * 1.5);
    assert.strictEqual(R.pausa('carta', 0), 60000 / R.PPM, 'ppm non valido → default');
});

test('parole e frasi: note e markdown via, intervalli sugli indici', () => {
    const p = R.parole('Cai Lun[1] inventò la **carta** . Poi? Fine');
    assert.deepStrictEqual(p, ['Cai', 'Lun', 'inventò', 'la', 'carta.', 'Poi?', 'Fine']);
    const f = R.frasi(p);
    assert.deepStrictEqual(f, [[0, 5], [5, 6], [6, 7]]);
    assert.strictEqual(R.fraseDi(f, 3), 0);
    assert.strictEqual(R.fraseDi(f, 6), 2);
    assert.deepStrictEqual(R.parole('   '), []);
});

test('html: tre pezzi, e il testo è scappato', () => {
    const h = R.html('<b>');
    assert.ok(!/<b>/.test(h), h);
    assert.match(R.html('carta'), /mai-rsvp__b">c<\/span><span class="mai-rsvp__o">a<\/span><span class="mai-rsvp__a">rta</);
});
