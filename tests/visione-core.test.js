/* Prove di `mappai-visione-core.js` — analizzare una fonte iconografica.
   Le due prove che contano più di tutte: la separazione fra OSSERVAZIONE e
   INTERPRETAZIONE (un modello di visione descrive bene e contestualizza male)
   e la REGOLA DELL'APPIGLIO — un'interpretazione senza l'elemento visivo che la
   giustifica viene scartata, non creduta. */
const test = require('node:test');
const assert = require('node:assert');
const V = require('../public/js/mappai-visione-core.js');

// ── I formati ────────────────────────────────────────────────────────────────
test('accetta jpg, png e heic — il TIFF è fuori (20/8, decisione di Giacomo)', () => {
    ['foto.jpg', 'FOTO.JPEG', 'a.png', 'b.heic', 'c.heif']
        .forEach(n => assert.equal(V.accetta(n), true, n));
    ['a.tif', 'a.tiff', 'a.pdf', 'a.gif', 'a.webp', 'senzaestensione', ''].forEach(n =>
        assert.equal(V.accetta(n), false, n));
});

test('il mime viene dall\'estensione, maiuscole comprese', () => {
    assert.equal(V.mimeDi('a.JPG'), 'image/jpeg');
    assert.equal(V.mimeDi('a.png'), 'image/png');
    assert.equal(V.mimeDi('a.heic'), 'image/heic');
    assert.equal(V.mimeDi('a.tiff'), '');
});

test('serveConversione: jpg e png si mostrano così come sono, l\'HEIC no', () => {
    assert.equal(V.serveConversione('a.jpg'), false);
    assert.equal(V.serveConversione('a.png'), false);
    assert.equal(V.serveConversione('a.heic'), true);
    assert.equal(V.serveConversione('a.heif'), true);
});

// ── Il titolo ────────────────────────────────────────────────────────────────
test('il titolo viene dal nome del file, ripulito', () => {
    assert.equal(V.titoloDaNome('manifesto_1917_prestito.jpg'), 'manifesto 1917 prestito');
    assert.equal(V.titoloDaNome('IMG_4471.HEIC'), 'IMG 4471');
    assert.equal(V.titoloDaNome(''), 'Immagine');
});

// ── La griglia ───────────────────────────────────────────────────────────────
test('BLOCCHI: quattro, e i due interpretativi sono dichiarati tali', () => {
    assert.equal(V.BLOCCHI.length, 4);
    assert.deepEqual(V.BLOCCHI.map(b => b.id), ['identita', 'osservazione', 'interpretazione', 'critica']);
    assert.deepEqual(V.BLOCCHI.map(b => b.interpretativo), [false, false, true, true]);
});

// ── Il prompt ────────────────────────────────────────────────────────────────
test('il prompt chiede i quattro blocchi, la regola dell\'appiglio e concede il vuoto', () => {
    const p = V.promptAnalisi({ nome: 'manifesto.jpg' });
    ['"identita"', '"osservazione"', '"interpretazione"', '"critica"'].forEach(k =>
        assert.ok(p.includes(k), k));
    assert.ok(/REGOLA DELL'APPIGLIO/.test(p), 'la regola dell\'appiglio è scritta nel prompt');
    assert.ok(/stringa VUOTA/i.test(p), 'la licenza di non rispondere è esplicita');
    assert.ok(/trascritta PER INTERO/i.test(p), 'il testo si trascrive alla lettera');
    assert.ok(p.includes('manifesto.jpg'));
});

test('la nota del docente entra come VINCOLO, non come suggerimento', () => {
    const p = V.promptAnalisi({ nome: 'a.jpg', notaDocente: 'manifesto del 1917' });
    assert.ok(/IL DOCENTE DICHIARA/.test(p) && /non contraddirlo/i.test(p));
    assert.ok(p.includes('manifesto del 1917'));
    assert.ok(!/IL DOCENTE DICHIARA/.test(V.promptAnalisi({ nome: 'a.jpg' })));
});

// ── La normalizzazione ───────────────────────────────────────────────────────
const salvage = (s) => { try { return JSON.parse(s); } catch (e) { return null; } };
const RISPOSTA = {
    identita: { genere: 'Manifesto', titolo: 'Sottoscrivete!', autore: '', data: '1917', luogo: 'Italia', tecnica: 'Litografia' },
    osservazione: { descrizione: 'Un soldato indica l\'osservatore.', testo: 'SOTTOSCRIVETE AL PRESTITO', iconografia: 'Elmetto, tricolore.', linguaggioVisivo: 'Figura vista dal basso.', tipografia: 'Maiuscolo pieno.' },
    interpretazione: { corrente: '', committente: '', destinatario: 'Civili adulti — il soldato guarda dritto chi legge', finalita: 'Persuadere — lo dicono l\'imperativo nello slogan e il dito puntato', strategie: 'Appello al dovere — il gesto e il maiuscolo', diffusione: '' },
    critica: { prova: 'Lo Stato aveva bisogno di fondi dai civili.', tace: 'Le condizioni reali del fronte.' }
};

test('JSON pulito: i quattro blocchi arrivano interi', () => {
    const r = V.normalizzaAnalisi(JSON.stringify(RISPOSTA), salvage);
    assert.equal(r.identita.genere, 'Manifesto');
    assert.equal(r.osservazione.testo, 'SOTTOSCRIVETE AL PRESTITO');
    assert.equal(r.interpretazione.finalita.indexOf('Persuadere'), 0);
    assert.equal(r.critica.tace, 'Le condizioni reali del fronte.');
});

test('⚠️ REGOLA DELL\'APPIGLIO: un\'interpretazione senza « — » viene scartata', () => {
    const sporca = JSON.parse(JSON.stringify(RISPOSTA));
    sporca.interpretazione.corrente = 'Futurismo italiano';       // affermazione nuda
    sporca.interpretazione.diffusione = 'Affisso in tutte le città del Regno';  // inventabile, nessun appiglio
    const r = V.normalizzaAnalisi(JSON.stringify(sporca), salvage);
    assert.equal(r.interpretazione.corrente, '', 'senza appiglio non vale');
    assert.equal(r.interpretazione.diffusione, '', 'senza appiglio non vale');
    // quelle CON l'appiglio restano
    assert.ok(r.interpretazione.finalita.includes('—'));
});

test('la critica è esente dall\'appiglio: «che cosa tace» parla per assenza', () => {
    const r = V.normalizzaAnalisi(JSON.stringify(RISPOSTA), salvage);
    assert.equal(r.critica.prova, 'Lo Stato aveva bisogno di fondi dai civili.');
});

test('⚠️ testo NUDO: cade in osservazione.descrizione, MAI nei blocchi interpretativi', () => {
    const r = V.normalizzaAnalisi('Un soldato su sfondo rosso indica chi guarda.', salvage);
    assert.ok(r.osservazione.descrizione.includes('soldato'));
    V.BLOCCHI.filter(b => b.interpretativo).forEach(b => {
        b.campi.forEach(c => assert.equal(r[b.id][c.id], '', b.id + '.' + c.id));
    });
});

test('JSON dentro il markdown e dentro una frase: si recupera lo stesso', () => {
    const raw = 'Ecco:\n```json\n' + JSON.stringify(RISPOSTA) + '\n```\ngrazie';
    const r = V.normalizzaAnalisi(raw, salvage);
    assert.equal(r.identita.data, '1917');
});

test('campi mancanti non diventano "undefined"', () => {
    const r = V.normalizzaAnalisi('{"identita":{"genere":"Foto"}}', salvage);
    assert.equal(r.identita.genere, 'Foto');
    assert.equal(r.identita.autore, '');
    assert.equal(r.osservazione.descrizione, '');
});

// ── Il materiale e i nodi ────────────────────────────────────────────────────
const SCHEDA = Object.assign({ titolo: 'Sottoscrivete al prestito' },
    V.normalizzaAnalisi(JSON.stringify(RISPOSTA), salvage));

test('materialeDaScheda: i blocchi in ordine di griglia, i vuoti senza intestazione', () => {
    const m = V.materialeDaScheda(SCHEDA);
    assert.ok(m.startsWith('FONTE ICONOGRAFICA: Sottoscrivete al prestito'));
    assert.ok(m.indexOf('CARTA D') < m.indexOf('CHE COSA SI VEDE'));
    assert.ok(m.indexOf('CHE COSA SI VEDE') < m.indexOf('CHE COSA VUOLE OTTENERE'));
    const vuota = V.materialeDaScheda({ titolo: 'X', osservazione: { descrizione: 'Una piazza.' } });
    assert.ok(!/VUOLE OTTENERE/.test(vuota), 'blocco vuoto = nessuna intestazione');
});

test('testoBlocco: solo i campi pieni, con la loro etichetta', () => {
    const t = V.testoBlocco(SCHEDA, 'identita');
    assert.ok(t.includes('Genere della fonte: Manifesto'));
    assert.ok(!/Autore/.test(t), 'campo vuoto = riga assente');
    assert.equal(V.testoBlocco(SCHEDA, 'blocco-inesistente'), '');
});

test('nodiDaScheda: root + un L1 per blocco pieno, grafo connesso', () => {
    const g = V.nodiDaScheda(SCHEDA);
    assert.equal(g.nodes[0].level, 0);
    assert.equal(g.nodes[0].label, 'Sottoscrivete al prestito');
    assert.equal(g.nodes.length, 5, 'root + 4 blocchi pieni');
    assert.equal(g.links.length, 4);
    g.links.forEach(l => assert.equal(l.source, 'fonte_0'));
    const ids = new Set(g.nodes.map(n => n.id));
    g.links.forEach(l => assert.ok(ids.has(l.target)));
    // le desc dei rami portano il testo del blocco: sono il materiale della pipeline
    const oss = g.nodes.find(n => n.id === 'fonte_osservazione');
    assert.ok(oss.desc.includes('SOTTOSCRIVETE AL PRESTITO'));
});

test('nodiDaScheda: i blocchi vuoti si saltano', () => {
    const g = V.nodiDaScheda({ titolo: 'X', osservazione: { descrizione: 'Una piazza.' } });
    assert.equal(g.nodes.length, 2, 'root + il solo blocco pieno');
    assert.equal(g.links.length, 1);
});

test('schedaPronta: ferma il caso degenere, non giudica la qualità', () => {
    assert.equal(V.schedaPronta({}), false);
    assert.equal(V.schedaPronta({ osservazione: { descrizione: 'una piazza' } }), false);
    assert.equal(V.schedaPronta(SCHEDA), true);
    /* una scheda corta ma vera, scritta a mano dal docente, basta */
    assert.equal(V.schedaPronta({ identita: { genere: 'Manifesto', data: '1917', tecnica: 'Litografia' },
        interpretazione: { finalita: 'Persuadere i civili a sottoscrivere il prestito di guerra' } }), true);
});

// ── I guasti ─────────────────────────────────────────────────────────────────
test('diagnosi: ogni guasto porta il suo RIMEDIO, non solo il fatto', () => {
    const casi = [
        ['API key not valid', 'chiave'],
        ['429 quota exceeded', 'quota'],
        ['fetch failed', 'rete'],
        ['conversione-non-disponibile', 'conversione'],
        ['immagine troppo-grande', 'grande'],
        ['risposta vuota, finishReason OTHER', 'vuota'],
        ['timeout of 60000ms exceeded', 'lento'],
        ['provider infomaniak non supportato', 'provider']
    ];
    casi.forEach(([msg, codice]) => {
        const d = V.diagnosi(new Error(msg));
        assert.equal(d.codice, codice, msg);
        assert.ok(d.messaggio && d.rimedio, msg);
    });
});

test('diagnosi: un guasto sconosciuto non perde il messaggio originale', () => {
    const d = V.diagnosi({ motivo: 'qualcosa di mai visto' });
    assert.equal(d.codice, 'altro');
    assert.ok(d.rimedio.includes('mai visto'));
});

// ── Preventivo e misure ──────────────────────────────────────────────────────
test('stimaFogli: la LETTURA ora è una chiamata, e si conta', () => {
    assert.deepEqual(V.stimaFogli(['causa', 'confronto']), { fogli: 2, chiamate: 3, letture: 1 });
    assert.deepEqual(V.stimaFogli([]), { fogli: 0, chiamate: 1, letture: 1 });
});

test('preparazione: due misure per due usi, e il foglio pesa meno della lettura', () => {
    const l = V.preparazione('lettura'), f = V.preparazione('foglio');
    assert.ok(f.maxLato < l.maxLato);
    assert.equal(f.formato, 'jpeg');
    assert.equal(l.formato, 'png');
});
