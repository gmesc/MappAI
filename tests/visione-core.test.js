/* Prove di `mappai-visione-core.js` — leggere un'immagine, le regole.
   La prova che conta più di tutte è la SEPARAZIONE fra descrizione e contesto:
   è quella che impedisce a un modello di visione di mettere una data inventata
   nella premessa di sette verifiche. */
const test = require('node:test');
const assert = require('node:assert');
const V = require('../public/js/mappai-visione-core.js');

// ── I formati ────────────────────────────────────────────────────────────────
test('accetta i quattro formati chiesti, e nient\'altro', () => {
    ['foto.jpg', 'FOTO.JPEG', 'a.png', 'b.heic', 'c.heif', 'd.tif', 'e.tiff']
        .forEach(n => assert.equal(V.accetta(n), true, n));
    ['a.pdf', 'a.gif', 'a.webp', 'a.txt', 'senzaestensione', ''].forEach(n =>
        assert.equal(V.accetta(n), false, n));
});

test('il mime viene dall\'estensione, maiuscole comprese', () => {
    assert.equal(V.mimeDi('a.JPG'), 'image/jpeg');
    assert.equal(V.mimeDi('a.png'), 'image/png');
    assert.equal(V.mimeDi('a.heic'), 'image/heic');
    assert.equal(V.mimeDi('a.tiff'), 'image/tiff');
    assert.equal(V.mimeDi('a.zip'), '');
});

test('serveConversione: solo jpg e png passano al motore così come sono', () => {
    assert.equal(V.serveConversione('a.jpg'), false);
    assert.equal(V.serveConversione('a.jpeg'), false);
    assert.equal(V.serveConversione('a.png'), false);
    assert.equal(V.serveConversione('a.heic'), true);
    assert.equal(V.serveConversione('a.heif'), true);
    assert.equal(V.serveConversione('a.tif'), true);
    assert.equal(V.serveConversione('a.tiff'), true);
});

// ── Il titolo ────────────────────────────────────────────────────────────────
test('il titolo viene dal nome del file, ripulito', () => {
    assert.equal(V.titoloDaNome('miniatura_carlo_magno.jpg'), 'miniatura carlo magno');
    assert.equal(V.titoloDaNome('IMG_4471.HEIC'), 'IMG 4471');
    assert.equal(V.titoloDaNome(''), 'Immagine');
    assert.equal(V.titoloDaNome('   .png'), 'Immagine');
});

// ── Il prompt ────────────────────────────────────────────────────────────────
test('il prompt chiede DUE campi e concede esplicitamente il contesto vuoto', () => {
    const p = V.promptLettura({ nome: 'manifesto.jpg' });
    assert.ok(/"descrizione"/.test(p) && /"contesto"/.test(p));
    assert.ok(/stringa VUOTA/i.test(p), 'la licenza di non rispondere deve essere esplicita');
    assert.ok(/Meglio vuoto che inventato/i.test(p));
    assert.ok(p.includes('manifesto.jpg'));
});

test('la nota del docente entra come VINCOLO, non come suggerimento', () => {
    const p = V.promptLettura({ nome: 'a.jpg', notaDocente: 'miniatura del XII secolo' });
    assert.ok(/IL DOCENTE DICHIARA/.test(p));
    assert.ok(/non contraddirlo/i.test(p));
    assert.ok(p.includes('miniatura del XII secolo'));
    // senza nota, il blocco non compare a vuoto
    assert.ok(!/IL DOCENTE DICHIARA/.test(V.promptLettura({ nome: 'a.jpg' })));
});

// ── La normalizzazione ───────────────────────────────────────────────────────
const salvage = (s) => { try { return JSON.parse(s); } catch (e) { return null; } };

test('JSON pulito: i due campi arrivano interi', () => {
    const r = V.normalizzaLettura('{"descrizione":"Un uomo incoronato.","contesto":"Miniatura medievale."}', salvage);
    assert.equal(r.descrizione, 'Un uomo incoronato.');
    assert.equal(r.contesto, 'Miniatura medievale.');
});

test('JSON dentro una frase e dentro il markdown: si recupera lo stesso', () => {
    const raw = 'Ecco il risultato:\n```json\n{"descrizione":"Due figure.","contesto":""}\n```\nSpero sia utile.';
    const r = V.normalizzaLettura(raw, salvage);
    assert.equal(r.descrizione, 'Due figure.');
    assert.equal(r.contesto, '');
});

test('senza `salvage` il core recupera da sé il primo oggetto del testo', () => {
    const r = V.normalizzaLettura('blabla {"descrizione":"X","contesto":"Y"} coda');
    assert.equal(r.descrizione, 'X');
    assert.equal(r.contesto, 'Y');
});

test('⚠️ testo NUDO: diventa descrizione, MAI contesto', () => {
    const r = V.normalizzaLettura('Si vede una piazza affollata con bandiere.', salvage);
    assert.equal(r.contesto, '', 'il campo che si può inventare non si riempie per ripiego');
    assert.ok(r.descrizione.includes('piazza affollata'));
});

test('campi mancanti o nulli non diventano "undefined" a schermo', () => {
    const r = V.normalizzaLettura('{"descrizione":null}', salvage);
    assert.equal(r.descrizione, '');
    assert.equal(r.contesto, '');
});

test('gli a capo del modello si appiattiscono: il materiale è prosa', () => {
    const r = V.normalizzaLettura('{"descrizione":"riga uno\\n\\nriga due","contesto":"  spazi  "}', salvage);
    assert.equal(r.descrizione, 'riga uno riga due');
    assert.equal(r.contesto, 'spazi');
});

// ── Il materiale ─────────────────────────────────────────────────────────────
test('materialeDaScheda: il contesto verificato viene PRIMA della descrizione', () => {
    const m = V.materialeDaScheda({ titolo: 'Miniatura', contesto: 'XII secolo.', descrizione: 'Un re seduto.' });
    assert.ok(m.indexOf('CONTESTO') < m.indexOf('CHE COSA MOSTRA'));
    assert.ok(m.includes('Miniatura') && m.includes('XII secolo.') && m.includes('Un re seduto.'));
});

test('materialeDaScheda: senza contesto non resta un\'intestazione a vuoto', () => {
    const m = V.materialeDaScheda({ titolo: 'Foto', descrizione: 'Una piazza.' });
    assert.ok(!/CONTESTO/.test(m), 'una riga vuota insegna al modello che si può lasciare in bianco');
    assert.ok(m.includes('Una piazza.'));
});

test('materialeDaScheda: senza titolo la fonte ha comunque un nome', () => {
    const m = V.materialeDaScheda({ descrizione: 'x' });
    assert.ok(m.startsWith('FONTE ICONOGRAFICA: Immagine'));
});

test('schedaPronta: ferma il caso degenere, non giudica la qualità', () => {
    assert.equal(V.schedaPronta({ descrizione: 'una piazza' }), false);
    assert.equal(V.schedaPronta({}), false);
    assert.equal(V.schedaPronta({
        descrizione: 'Una piazza affollata con bandiere e un palco centrale, su cui parla un uomo in divisa militare scura mentre la folla alza il braccio destro.'
    }), true);
    /* ⚠️ Un contesto CORTO ma scritto a mano dal docente basta: è il caso in
       cui la scheda vale di più, e una soglia alta lo boccerebbe. */
    assert.equal(V.schedaPronta({
        contesto: 'Manifesto di propaganda del 1917 per il prestito nazionale di guerra.'
    }), true);
});

// ── I guasti ─────────────────────────────────────────────────────────────────
test('diagnosi: ogni guasto porta il suo RIMEDIO, non solo il fatto', () => {
    const casi = [
        ['connect ECONNREFUSED 127.0.0.1:11434', 'spento'],
        ['model "qwen2.5vl:7b" not found, try pulling it first', 'modello'],
        ['conversione-non-disponibile', 'conversione'],
        ['immagine troppo-grande', 'grande'],
        ['timeout of 180000ms exceeded', 'lento']
    ];
    casi.forEach(([msg, codice]) => {
        const d = V.diagnosi(new Error(msg));
        assert.equal(d.codice, codice, msg);
        assert.ok(d.messaggio && d.rimedio, 'messaggio e rimedio sempre presenti: ' + msg);
    });
});

test('diagnosi: un guasto sconosciuto non perde il messaggio originale', () => {
    const d = V.diagnosi({ motivo: 'qualcosa di mai visto' });
    assert.equal(d.codice, 'altro');
    assert.ok(d.rimedio.includes('mai visto'));
});

test('diagnosi: il rimedio del modello mancante è il comando da incollare', () => {
    const d = V.diagnosi('no such model');
    assert.ok(d.rimedio.includes(V.MODELLO_DEF));
});

// ── Preventivo e misure ──────────────────────────────────────────────────────
test('stimaFogli: la lettura è locale e non conta chiamate', () => {
    const s = V.stimaFogli(['causa', 'conseguenza', 'confronto']);
    assert.deepEqual(s, { fogli: 3, chiamate: 3, letture: 0 });
    assert.deepEqual(V.stimaFogli([]), { fogli: 0, chiamate: 0, letture: 0 });
    assert.deepEqual(V.stimaFogli(null), { fogli: 0, chiamate: 0, letture: 0 });
});

test('preparazione: due misure per due usi, e il foglio pesa meno della lettura', () => {
    const l = V.preparazione('lettura'), f = V.preparazione('foglio');
    assert.equal(l.maxLato, V.MAX_LATO_LETTURA);
    assert.equal(f.maxLato, V.MAX_LATO_FOGLIO);
    assert.ok(f.maxLato < l.maxLato, 'sette angoli portano sette copie della stessa foto');
    assert.equal(f.formato, 'jpeg');
    assert.equal(l.formato, 'png');
});
