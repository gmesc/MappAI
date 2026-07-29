const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const T = require('../public/js/core/mis-text-core.js');
const PROFILO = JSON.parse(
    fs.readFileSync(path.join(__dirname, '..', 'public', 'profili', 'predefinito.json'), 'utf8'));

// ── Tokenizzazione: le due regole calibrate in R1 ───────────────────────────
test('l’apostrofo appartiene alla parola, il trattino separa', () => {
    assert.deepStrictEqual(T.tokenize("l'ospitalità"), ["l'ospitalità"]);
    assert.deepStrictEqual(T.tokenize('politico-amministrativa'), ['politico', 'amministrativa']);
    // È l'unica combinazione che riproduce l'assessment del 2026: cambiarla
    // rompe riferimento-2026.test.js, ed è esattamente ciò che deve fare.
});

test('la tokenizzazione ignora la punteggiatura e tiene i numeri', () => {
    assert.deepStrictEqual(T.tokenize('Nel 1291, tre cantoni.'), ['Nel', '1291', 'tre', 'cantoni']);
});

test('tokenize su input vuoto o nullo non lancia', () => {
    assert.deepStrictEqual(T.tokenize(''), []);
    assert.deepStrictEqual(T.tokenize(null), []);
    assert.deepStrictEqual(T.tokenize(undefined), []);
});

// ── Segmentazione per blocco (R9) ──────────────────────────────────────────
test('un blocco senza punteggiatura finale conta come una frase', () => {
    const f = T.splitSentences([
        { tipo: 'titolo', testo: 'Funzione culturale' },
        { tipo: 'paragrafo', testo: 'I musei sono spazi culturali.' },
    ], PROFILO);
    assert.strictEqual(f.length, 2);
    assert.strictEqual(f[0].testo, 'Funzione culturale');
});

test('le abbreviazioni dichiarate non chiudono la frase, e il punto resta nel testo', () => {
    const f = T.splitSentences([{ tipo: 'paragrafo', testo: 'Musei, teatri, ecc. Questo conta.' }], PROFILO);
    assert.strictEqual(f.length, 1, 'ecc. non deve spezzare');
    assert.match(f[0].testo, /ecc\./, 'il punto dell’abbreviazione deve restare');
});

test('un punto seguito da minuscola non chiude la frase', () => {
    const f = T.splitSentences([{ tipo: 'paragrafo', testo: 'Vedi art. 5 del regolamento.' }], PROFILO);
    assert.strictEqual(f.length, 1);
});

test('più frasi in un blocco vengono contate separatamente', () => {
    const f = T.splitSentences([{ tipo: 'paragrafo', testo: 'Prima frase. Seconda frase. Terza frase.' }], PROFILO);
    assert.strictEqual(f.length, 3);
});

test('splitSentences accetta anche una stringa nuda', () => {
    assert.strictEqual(T.splitSentences('Una frase sola.', PROFILO).length, 1);
});

// ── Sillabe (R2) ───────────────────────────────────────────────────────────
test('il conteggio sillabico segue i gruppi vocalici', () => {
    assert.strictEqual(T.countSyllables('casa'), 2);
    assert.strictEqual(T.countSyllables('città'), 2);
    assert.strictEqual(T.countSyllables('funzione'), 3);      // fun-zio-ne
    assert.strictEqual(T.countSyllables('economico'), 5);     // e-co-no-mi-co
});

test('una parola senza vocali vale una sillaba, non zero', () => {
    assert.strictEqual(T.countSyllables('PDF'), 1);
});

// ── Indici ─────────────────────────────────────────────────────────────────
test('Gulpease segue la formula dichiarata', () => {
    const testo = 'I musei sono spazi culturali.';
    const g = T.gulpease(testo, PROFILO);
    const atteso = 89 + (300 * g.frasi - 10 * g.lettere) / g.parole;
    assert.strictEqual(g.valore, +atteso.toFixed(1));
});

test('Gulpease e Flesch-Vacca su testo vuoto restituiscono un motivo, non zero', () => {
    const g = T.gulpease('', PROFILO);
    assert.strictEqual(g.valore, null);
    assert.strictEqual(g.motivo, 'testo vuoto');
    assert.strictEqual(T.fleschVacca('', PROFILO).valore, null);
});

test('un testo più semplice ottiene un Gulpease più alto', () => {
    const facile = 'Il gatto dorme. Il cane corre. La casa è grande.';
    const difficile = 'La funzione politico-amministrativa urbana comporta '
        + 'l’implementazione di procedimenti amministrativi la cui complessità '
        + 'richiede competenze specialistiche approfondite e trasversali.';
    assert.ok(T.gulpease(facile, PROFILO).valore > T.gulpease(difficile, PROFILO).valore);
});

// ── Le liste vengono dal profilo, non dal modulo ───────────────────────────
test('cambiare la soglia di parola lunga nel profilo cambia il risultato', () => {
    const testo = 'Le funzioni urbane sono importanti per la citta moderna.';
    const p8 = T.lexicalProfile(testo, PROFILO).parolLunghePct;
    const alt = JSON.parse(JSON.stringify(PROFILO));
    alt.parametri.parolaLungaMinChar.valore = 5;
    const p5 = T.lexicalProfile(testo, alt).parolLunghePct;
    assert.ok(p5 > p8, 'abbassando la soglia devono risultare più parole lunghe');
});

test('svuotare una lista del profilo azzera la metrica corrispondente', () => {
    // Prova che nessuna lista è cablata nel modulo (research.md R1).
    const testo = 'Questo accade perché la città cresce, quindi servono servizi.';
    const conLista = T.lexicalProfile(testo, PROFILO).connettiviCausali100;
    assert.ok(conLista > 0, 'con la lista devono esserci connettivi causali');
    const alt = JSON.parse(JSON.stringify(PROFILO));
    alt.parametri.connettiviCausali.valore = [];
    assert.strictEqual(T.lexicalProfile(testo, alt).connettiviCausali100, 0);
});

test('il profilo lessicale dichiara di non essere calcolabile su testo vuoto', () => {
    const lp = T.lexicalProfile('', PROFILO);
    assert.strictEqual(lp.calcolabile, false);
    assert.ok(lp.motivo, 'deve portare il motivo, mai uno zero muto');
});

test('il tempo di lettura usa la velocità del profilo', () => {
    const testo = new Array(241).join('parola ');   // 240 parole
    const lp = T.lexicalProfile(testo, PROFILO);
    assert.strictEqual(lp.tempoLetturaMin, 2);       // 240 / 120
});

test('le passive sono contate con gli ausiliari del profilo', () => {
    const testo = 'La legge è approvata dal parlamento. Il documento viene firmato.';
    assert.ok(T.lexicalProfile(testo, PROFILO).passive100 > 0);
});

// ── Dispositivi di scansione ───────────────────────────────────────────────
test('formatDevices conta elenchi, titoli e titoli-domanda', () => {
    const d = T.formatDevices([
        { tipo: 'titolo', testo: 'Cos’è la funzione turistica?' },
        { tipo: 'paragrafo', testo: 'Riguarda i visitatori.' },
        { tipo: 'voce-elenco', testo: 'alberghi e ristoranti' },
        { tipo: 'voce-elenco', testo: 'guide turistiche' },
    ], PROFILO);
    assert.strictEqual(d.elenchi, 2);
    assert.strictEqual(d.sottotitoli, 1);
    assert.strictEqual(d.titoliDomanda, 1);
    assert.strictEqual(d.calcolabile, true);
});

test('su un testo senza formattazione formatDevices dichiara il motivo', () => {
    const d = T.formatDevices([{ tipo: 'nodo', testo: 'Solo prosa continua.' }], PROFILO);
    assert.strictEqual(d.calcolabile, false);
    assert.ok(d.motivo);
});

// ── Lingua ─────────────────────────────────────────────────────────────────
test('riconosce l’italiano e segnala ciò che non lo è', () => {
    const it = 'La città di Bellinzona è il capoluogo del cantone e ospita '
        + 'le sedi del governo, con uffici che si occupano di amministrazione '
        + 'e servizi per i cittadini di tutta la regione ticinese.';
    const en = 'The city hosts many museums and theatres that attract visitors '
        + 'from all over the world, offering cultural events throughout the year '
        + 'and supporting a large hospitality industry with many hotels.';
    assert.strictEqual(T.detectLanguage(it), 'it');
    assert.notStrictEqual(T.detectLanguage(en), 'it');
});

test('su un testo troppo corto la lingua resta incerta invece di essere indovinata', () => {
    assert.strictEqual(T.detectLanguage('Poche parole qui.'), 'incerto');
});

// ── Determinismo (FR-009) ──────────────────────────────────────────────────
test('due esecuzioni sullo stesso testo danno lo stesso risultato', () => {
    const testo = 'Le città accumularono capitali, quindi nacquero le banche. '
        + 'Questo processo è documentato in molte fonti storiche.';
    assert.deepStrictEqual(T.lexicalProfile(testo, PROFILO), T.lexicalProfile(testo, PROFILO));
});
