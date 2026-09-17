// Test del dizionario di pronuncia (mappai-pronuncia-core.js): ciò che la voce
// di sistema deve dire, e dove una frase NON finisce.
const { test } = require('node:test');
const assert = require('node:assert');
const P = require('../public/js/mappai-pronuncia-core.js');

test('perVoce: le abbreviazioni di scuola per esteso, la punteggiatura resta', () => {
    assert.strictEqual(P.perVoce('Nel 105 d.C., Cai Lun inventò la carta'), 'Nel 105 dopo Cristo, Cai Lunn inventò la carta');
    assert.strictEqual(P.perVoce('(ca. 3000 a.C.)'), '(circa 3000 avanti Cristo)');
    assert.strictEqual(P.perVoce('libri, quaderni ecc.'), 'libri, quaderni eccetera');
    assert.strictEqual(P.perVoce('e.g. paper', 'en-US'), 'for example paper');
});

test('perVoce: i nomi che la voce scioglierebbe in giorni o mesi restano nomi, le date no', () => {
    assert.strictEqual(P.perVoce('Cai Lun'), 'Cai Lunn');
    assert.strictEqual(P.perVoce('Cai Lun, funzionario'), 'Cai Lunn, funzionario');
    assert.strictEqual(P.perVoce('il Mar Nero'), 'il Mar Nero', 'Mar la voce lo legge già bene: niente ritocchi');
    assert.strictEqual(P.perVoce('Lun 3 marzo'), 'Lun 3 marzo', 'seguito da un numero è una data');
    assert.strictEqual(P.perVoce('Lun. 3 marzo'), 'Lun. 3 marzo', 'con il punto è davvero un giorno');
    assert.strictEqual(P.perVoce('la luna'), 'la luna');
    for (const [k, v] of Object.entries(P._PROTETTI.it)) {
        assert.ok(!/[àèéìòù]/i.test(v.slice(0, -1)), `${k} → ${v}: l'accento fa compitare la parola`);
    }
});

test('perVoce: una parola alla volta dà lo stesso risultato della frase intera (il karaoke conta così)', () => {
    const frase = 'Nel 105 d.C., Cai Lun (ca. 50 km) creò la carta ecc.';
    const intera = P.perVoce(frase).split(' ').length;
    const perParola = frase.split(' ').reduce((n, w) => n + P.perVoce(w).split(' ').length, 0);
    assert.strictEqual(perParola, intera);
});

test('abbreviazione: il punto di d.C., ecc. e delle iniziali non chiude la frase', () => {
    assert.ok(P.abbreviazione('d.C.'));
    assert.ok(P.abbreviazione('d.C.»'));
    assert.ok(P.abbreviazione('ecc.'));
    assert.ok(P.abbreviazione('J.'));
    assert.ok(!P.abbreviazione('carta.'));
    assert.ok(!P.abbreviazione('km'), 'senza punto non c\'è niente da non spezzare');
});
