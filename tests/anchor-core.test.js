'use strict';
/*
 * anchor-core.test.js — l'àncora e i controlli deterministici che ne derivano.
 * Copre: frasi con pagina, ancoraggio nodo→frase, copertura della fonte,
 * nessi cronologicamente impossibili, rimozione del metatesto.
 */
const { test } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const A = require(path.join(__dirname, '..', 'public', 'js', 'mappai-anchor-core.js'));

const PAGINE = [
  {
    n: 1, text:
      'Il 30 agosto 1939 l\'Assemblea Federale elesse Henri Guisan generale dell\'esercito svizzero. ' +
      'Lo stesso giorno il Consiglio Federale ricevette i pieni poteri per governare durante la guerra.'
  },
  {
    n: 4, text:
      'La Germania aveva bisogno di franchi svizzeri e dollari per comprare merci dai paesi neutrali. ' +
      'La Banca Nazionale Svizzera accettava oro tedesco e forniva valuta in cambio. ' +
      'Le esportazioni verso le potenze dell\'Asse raggiunsero il 45 per cento del totale fra il 1940 e il 1942.'
  }
];

// ── frasi e pagine ──────────────────────────────────────────────────────
test('frasiDaPagine: spezza, conserva la pagina, scarta le frasi corte', () => {
  const f = A.frasiDaPagine(PAGINE);
  assert.ok(f.length >= 5, 'almeno cinque frasi utili');
  assert.strictEqual(f[0].page, 1);
  assert.ok(f.some(x => x.page === 4), 'la pagina 4 è rappresentata');
  assert.ok(f.every(x => x.words.length >= A.DEFAULTS.minSentenceWords));
  // indici progressivi e usabili come chiave
  f.forEach((x, i) => assert.strictEqual(x.idx, i));
});

test('frasiDaPagine: senza pagine vere la pagina resta 0', () => {
  const f = A.frasiDaPagine(A.paginePiatte(['Una frase lunga abbastanza da superare il minimo di parole richiesto.']));
  assert.strictEqual(f.length, 1);
  assert.strictEqual(f[0].page, 0);
});

/* ── CHE COSA NON PUÒ ESSERE UNA CITAZIONE ────────────────────────────────
   Dalla prima generazione VERA con l'àncora accesa: su 68 citazioni, 18 erano
   spazzatura — 13 volte l'intestazione di pagina e 5 volte una consegna. */
test('frasiDaPagine: via l\'intestazione che ricorre su tre o più pagine', () => {
  const INT = 'Storia IV Media La Seconda Guerra Mondiale pag.';
  const pag = [1, 2, 3, 4].map(n => ({
    n, text: INT + ' Il contenuto vero della pagina numero ' + n + ' con abbastanza parole per restare.'
  }));
  const f = A.frasiDaPagine(pag);
  assert.ok(!f.some(x => /Storia IV Media/.test(x.text)), 'l\'intestazione non è una fonte');
  assert.strictEqual(f.length, 4, 'il contenuto vero di ogni pagina resta');
});

test('frasiDaPagine: l\'intestazione si riconosce anche se la punteggiatura cambia', () => {
  /* misurato: il lettore di PDF rendeva la stessa intestazione con dei trattini
     in più su una pagina sola; con la punteggiatura dentro la chiave quella
     copia sopravviveva e da sola si prendeva 16 citazioni su 72 */
  const pag = [
    { n: 1, text: 'Storia IV Media La Seconda Guerra Mondiale pag. Primo contenuto autentico di questa pagina qui.' },
    { n: 2, text: 'Storia IV Media La Seconda Guerra Mondiale pag. Secondo contenuto autentico di questa pagina qui.' },
    { n: 3, text: 'Storia IV Media - - - - - La Seconda Guerra Mondiale pag. Terzo contenuto autentico di questa pagina.' }
  ];
  const f = A.frasiDaPagine(pag);
  assert.ok(!f.some(x => /Storia IV Media/.test(x.text)), 'anche la copia coi trattini se ne va');
});

test('frasiDaPagine: via le consegne dell\'esercizio e le righe strutturali', () => {
  const pag = [{ n: 1, text:
    'La Svizzera ha relazioni economiche con gli Alleati o con i paesi dell\'Asse? ' +
    'La Banca Nazionale accettava oro tedesco e forniva valuta in cambio. ' +
    '1. La Svizzera di fronte alla minaccia dell\'invasione tedesca.' }];
  const f = A.frasiDaPagine(pag);
  const testi = f.map(x => x.text);
  assert.ok(!testi.some(t => /\?$/.test(t)), 'una consegna non è una prova');
  assert.ok(!testi.some(t => /^1\./.test(t)), 'un titolo numerato nemmeno');
  assert.ok(testi.some(t => /Banca Nazionale/.test(t)), 'il fatto resta');
});

test('frasiDaPagine: via anche le consegne IMPERATIVE, che non hanno il punto di domanda', () => {
  /* nella generazione vera una di queste era fra le sette frasi che il passaggio
     di copertura avrebbe rimandato al modello come contenuto da recuperare */
  const pag = [{ n: 4, text:
    'Attività 15 Esamina la seguente tabella e confronta i dati riportati. ' +
    'La Germania era da tempo un importante partner commerciale della Svizzera. ' +
    'Leggi il seguente documento scritto e rispondi alle domande che seguono.' }];
  const testi = A.frasiDaPagine(pag).map(x => x.text);
  assert.strictEqual(testi.length, 1);
  assert.ok(/partner commerciale/.test(testi[0]));
});

test('frasiDaPagine: un imperativo IN MEZZO alla frase non è una consegna', () => {
  const pag = [{ n: 1, text: 'Il rapporto esamina la condotta svizzera durante il conflitto mondiale.' }];
  assert.strictEqual(A.frasiDaPagine(pag).length, 1, 'qui «esamina» è un verbo come un altro');
});

test('frasiDaPagine: una frase ripetuta su DUE sole pagine resta (non è un piè di pagina)', () => {
  const R = 'La neutralità armata significa restare fuori dal conflitto ma essere pronti a difendersi.';
  const f = A.frasiDaPagine([{ n: 1, text: R }, { n: 2, text: R }]);
  assert.strictEqual(f.length, 2);
});

// ── ancoraggio ──────────────────────────────────────────────────────────
test('ancoraNodi: ogni nodo prende le frasi che parlano della sua desc', () => {
  const frasi = A.frasiDaPagine(PAGINE);
  const nodi = [
    { id: 'N1', label: 'Comandante Guisan', desc: 'Henri Guisan fu eletto generale dall\'Assemblea Federale nell\'agosto 1939.' },
    { id: 'N2', label: 'Commercio dell\'oro', desc: 'La Banca Nazionale Svizzera accettava oro tedesco e forniva valuta alla Germania.' }
  ];
  const { perNodo, usate } = A.ancoraNodi(nodi, frasi);
  assert.ok(perNodo.N1 && perNodo.N1.length, 'N1 ancorato');
  assert.ok(/Guisan/.test(perNodo.N1[0].text), 'N1 cita la frase su Guisan');
  assert.strictEqual(perNodo.N1[0].page, 1, 'e ne conosce la pagina');
  assert.ok(/oro|valuta|Banca/i.test(perNodo.N2[0].text), 'N2 cita la frase giusta');
  assert.strictEqual(perNodo.N2[0].page, 4);
  assert.ok(Object.keys(usate).length >= 2);
});

test('ancoraNodi: un nodo estraneo alla fonte non riceve citazioni inventate', () => {
  const frasi = A.frasiDaPagine(PAGINE);
  const nodi = [{ id: 'X', label: 'Fotosintesi', desc: 'La clorofilla assorbe la luce solare nelle foglie delle piante verdi.' }];
  const { perNodo } = A.ancoraNodi(nodi, frasi);
  assert.strictEqual(perNodo.X, undefined, 'meglio nessuna citazione che una sbagliata');
});

test('ancoraNodi: deterministico — due passate danno lo stesso risultato', () => {
  const frasi = A.frasiDaPagine(PAGINE);
  const nodi = [{ id: 'N', label: 'Oro', desc: 'La Germania comprava merci con franchi svizzeri ottenuti cedendo oro.' }];
  const a = JSON.stringify(A.ancoraNodi(nodi, frasi).perNodo);
  const b = JSON.stringify(A.ancoraNodi(nodi, frasi).perNodo);
  assert.strictEqual(a, b);
});

test('ancoraNodi: non è esclusivo — due nodi possono citare la stessa frase', () => {
  const frasi = A.frasiDaPagine(PAGINE);
  const d = 'La Banca Nazionale Svizzera accettava oro tedesco e forniva valuta in cambio.';
  const { perNodo } = A.ancoraNodi([{ id: 'A', desc: d }, { id: 'B', desc: d }], frasi);
  assert.strictEqual(perNodo.A[0].text, perNodo.B[0].text);
});

// ── copertura ───────────────────────────────────────────────────────────
test('copertura: conta per pagina e trova le frasi orfane', () => {
  const frasi = A.frasiDaPagine(PAGINE);
  const nodi = [{ id: 'N1', desc: 'Henri Guisan eletto generale dall\'Assemblea Federale.' }];
  const { usate } = A.ancoraNodi(nodi, frasi);
  const c = A.copertura(frasi, usate);
  assert.ok(c.pct > 0 && c.pct < 100, 'copertura parziale: un nodo solo non copre tutto');
  const p4 = c.pagine.find(p => p.page === 4);
  assert.ok(p4.orfane.length > 0, 'la pagina economica resta scoperta e lo dice');
  assert.strictEqual(c.tot, frasi.length);
});

test('copertura: senza nodi tutto è orfano', () => {
  const frasi = A.frasiDaPagine(PAGINE);
  const c = A.copertura(frasi, {});
  assert.strictEqual(c.coperte, 0);
  assert.strictEqual(c.pct, 0);
});

// ── nessi cronologicamente impossibili ──────────────────────────────────
test('nessiImpossibili: l\'effetto non può precedere la causa', () => {
  const nodi = [
    { id: 'ACC', label: 'Accerchiamento nazista', desc: 'Nel giugno 1940 la Francia cadde e la Svizzera restò accerchiata.' },
    { id: 'GUI', label: 'Comandante Guisan', desc: 'Guisan fu eletto generale nell\'agosto 1939.' }
  ];
  const links = [{ source: 'ACC', target: 'GUI', rel: 'determina' }];
  const out = A.nessiImpossibili(nodi, links);
  assert.strictEqual(out.length, 1);
  assert.strictEqual(out[0].livello, 'impossibile');
  assert.strictEqual(out[0].annoCausa, 1940);
  assert.strictEqual(out[0].annoEffetto, 1939);
});

/* Il caso VERO dell'audit, che il primo giro non coglieva: il nodo causa copre
   1938-1940, l'effetto il 1939. Una lettura compatibile esiste (il processo
   comincia nel 1938), quindi «impossibile» sarebbe falso — ma il fatto centrale
   della causa è posteriore all'effetto, e il docente lo deve sapere. */
test('nessiImpossibili: causa a intervallo che scavalca l\'effetto → «da verificare», non toccata', () => {
  const nodi = [
    { id: 'ACC', label: 'Accerchiamento Nazista', desc: 'Nel 1938 la Germania prese l\'Austria. Nel giugno 1940 la Francia fu occupata.' },
    { id: 'GUI', label: 'Comandante Guisan', desc: 'Il 30 agosto 1939 l\'Assemblea Federale scelse Henri Guisan.' }
  ];
  const out = A.nessiImpossibili(nodi, [{ source: 'ACC', target: 'GUI', rel: 'determina' }]);
  assert.strictEqual(out.length, 1);
  assert.strictEqual(out[0].livello, 'da verificare');
  assert.strictEqual(out[0].annoCausa, 1940, 'si mostra l\'estremo che scavalca');
  assert.strictEqual(out[0].annoEffetto, 1939);
});

test('nessiImpossibili: un nesso cronologicamente sano non viene toccato', () => {
  const nodi = [
    { id: 'A', label: 'Mobilitazione', desc: 'La mobilitazione generale fu decretata nel 1939.' },
    { id: 'B', label: 'Ridotto nazionale', desc: 'Il ridotto nazionale fu realizzato dal 1940.' }
  ];
  assert.strictEqual(A.nessiImpossibili(nodi, [{ source: 'A', target: 'B', rel: 'causa' }]).length, 0);
});

test('nessiImpossibili: prudente — intervallo compatibile, o verbo non causale, o anni assenti', () => {
  const intervallo = [
    { id: 'A', label: 'Guerra', desc: 'Fra il 1939 e il 1945 la Svizzera restò neutrale.' },
    { id: 'B', label: 'Nomina', desc: 'La nomina avvenne nel 1940.' }
  ];
  const amb = A.nessiImpossibili(intervallo, [{ source: 'A', target: 'B', rel: 'causa' }]);
  assert.strictEqual(amb.length, 1, 'la causa arriva al 1945: si segnala');
  assert.strictEqual(amb[0].livello, 'da verificare', 'ma non si dichiara impossibile');
  assert.strictEqual(A.nessiImpossibili(intervallo, [{ source: 'B', target: 'A', rel: 'include' }]).length, 0,
    '«include» non è un verbo causale');
  const senzaAnni = [{ id: 'A', desc: 'Una causa senza date.' }, { id: 'B', desc: 'Un effetto senza date.' }];
  assert.strictEqual(A.nessiImpossibili(senzaAnni, [{ source: 'A', target: 'B', rel: 'causa' }]).length, 0);
});

test('nessiImpossibili: accetta i link con source/target come oggetti (post-D3)', () => {
  const nodi = [
    { id: 'A', desc: 'Evento del 1944.' },
    { id: 'B', desc: 'Evento del 1939.' }
  ];
  const out = A.nessiImpossibili(nodi, [{ source: { id: 'A' }, target: { id: 'B' }, rel: 'provoca' }]);
  assert.strictEqual(out.length, 1);
  assert.strictEqual(out[0].livello, 'impossibile');
});

// ── metatesto ───────────────────────────────────────────────────────────
test('togliMeta: via il saluto, la cornice al docente e i confini del ramo', () => {
  const t = 'Ciao! Oggi parliamo della neutralità. La Svizzera non prese parte ai combattimenti. ' +
    'Per questo, questa categoria è separata dalle altre. NON include la difesa militare: quelli sono altri rami.';
  const r = A.togliMeta(t);
  assert.ok(!/Ciao/.test(r.text), 'il saluto se ne va');
  assert.ok(!/questa categoria è separata/i.test(r.text));
  assert.ok(!/NON include/.test(r.text));
  assert.ok(/La Svizzera non prese parte ai combattimenti\./.test(r.text), 'il contenuto storico resta');
  assert.ok(r.tolte.length >= 3, 'e ogni frase tolta è dichiarata');
});

test('togliMeta: non tocca «ramo» e «categoria» usati per il loro significato', () => {
  const t = 'Il ramo di un albero porta le foglie. La categoria grammaticale del nome è variabile.';
  const r = A.togliMeta(t);
  assert.strictEqual(r.text, t);
  assert.strictEqual(r.tolte.length, 0);
});

test('togliMeta: testo vuoto o assente non rompe', () => {
  assert.strictEqual(A.togliMeta('').text, '');
  assert.strictEqual(A.togliMeta(null).text, '');
});

// ── anni ────────────────────────────────────────────────────────────────
test('anni: prende gli anni a quattro cifre, non i numeri qualunque', () => {
  assert.deepStrictEqual(A.anni('Nel 1939 e nel 1945, con 300000 profughi e il 45 per cento.'), [1939, 1945]);
  assert.deepStrictEqual(A.anni('Nessuna data qui.'), []);
});

// ══ IL PASSAGGIO DI COPERTURA (12/9/26) ═════════════════════════════════
// La copertura dice che una parte della fonte non è in mappa; qui si decide
// che cosa rimandare al modello e che cosa accettare di ciò che propone.

const COP = {
  pct: 55,
  pagine: [
    { page: 1, tot: 10, coperte: 8, pct: 80, orfane: ['Frase orfana della pagina uno con parole a sufficienza.'] },
    { page: 4, tot: 11, coperte: 1, pct: 9, orfane: [
      'La Germania aveva bisogno di franchi svizzeri per comprare merci dalle altre nazioni.',
      'Le esportazioni verso le potenze dell Asse raggiunsero il quarantacinque per cento del totale.',
      'La Svizzera continuo a commerciare anche con gli Alleati e in particolare con gli Stati Uniti.'
    ] },
    { page: 5, tot: 12, coperte: 4, pct: 33, orfane: ['Il commercio dell oro presentava gravi problemi morali riconosciuti dopo la guerra.'] },
    { page: 9, tot: 2, coperte: 0, pct: 0, orfane: ['Copertina.', 'Indice.'] }
  ]
};

test('orfanePerPassaggio: prende le pagine scoperte, dalla peggiore, e salta quelle corte', () => {
  const r = A.orfanePerPassaggio(COP);
  assert.deepStrictEqual(r.pagine, [4, 5], 'la 1 è già coperta, la 9 è troppo corta per contare');
  assert.strictEqual(r.frasi[0].page, 4, 'si comincia dalla più scoperta');
  assert.strictEqual(r.frasi.length, 4);
});

test('orfanePerPassaggio: rispetta il tetto di caratteri', () => {
  const r = A.orfanePerPassaggio(COP, { maxCaratteri: 90 });
  assert.ok(r.frasi.length >= 1 && r.frasi.length < 4);
  assert.ok(r.frasi.reduce((a, f) => a + f.text.length, 0) <= 90);
});

test('orfanePerPassaggio: fonte tutta coperta → niente da rimandare', () => {
  const piena = { pagine: [{ page: 1, tot: 10, coperte: 10, pct: 100, orfane: [] }] };
  assert.strictEqual(A.orfanePerPassaggio(piena).frasi.length, 0);
  assert.strictEqual(A.orfanePerPassaggio(null).frasi.length, 0);
});

const CTX = {
  genitori: ['L1_0', 'L1_1'],
  etichette: ['Economia di Guerra', 'Difesa Militare'],
  frasi: COP.pagine[1].orfane
};

test('validaProposte: passa la proposta ancorata al residuo', () => {
  const r = A.validaProposte([{
    parent: 'L1_0', label: 'Bisogno tedesco di valuta',
    desc: 'La Germania aveva bisogno di franchi svizzeri per comprare merci dalle altre nazioni neutrali.',
    evidenza: 'La Germania aveva bisogno di franchi svizzeri per comprare merci'
  }], CTX);
  assert.strictEqual(r.proposte.length, 1);
  assert.strictEqual(r.scartate.length, 0);
});

test('validaProposte: rifiuta genitore inventato, nodo già presente, prova esterna, desc mozza', () => {
  const r = A.validaProposte([
    { parent: 'L1_9', label: 'Nodo orfano', desc: 'Una descrizione abbastanza lunga da superare il minimo di parole.', evidenza: 'La Germania aveva bisogno di franchi svizzeri' },
    { parent: 'L1_0', label: 'economia di guerra', desc: 'Una descrizione abbastanza lunga da superare il minimo di parole.', evidenza: 'La Germania aveva bisogno di franchi svizzeri' },
    { parent: 'L1_0', label: 'Conferenza di Yalta', desc: 'Gli Alleati si divisero le zone di influenza in Europa dopo la fine del conflitto.', evidenza: 'A Yalta nel 1945 Churchill Roosevelt e Stalin si accordarono sulle sfere di influenza' },
    { parent: 'L1_0', label: 'Nodo corto', desc: 'Troppo poco.', evidenza: 'La Germania aveva bisogno di franchi svizzeri' }
  ], CTX);
  assert.strictEqual(r.proposte.length, 0);
  assert.deepStrictEqual(r.scartate.map(x => x.perche),
    ['genitore inesistente', 'nodo già presente', 'prova fuori dal residuo', 'desc troppo corta']);
});

test('validaProposte: due proposte con la stessa etichetta → ne resta una', () => {
  const uguale = {
    parent: 'L1_0', label: 'Bisogno di valuta',
    desc: 'La Germania aveva bisogno di franchi svizzeri per comprare merci dalle altre nazioni.',
    evidenza: 'La Germania aveva bisogno di franchi svizzeri per comprare merci'
  };
  const r = A.validaProposte([uguale, Object.assign({}, uguale)], CTX);
  assert.strictEqual(r.proposte.length, 1);
  assert.strictEqual(r.scartate[0].perche, 'nodo già presente');
});

test('validaProposte: il tetto ferma la crescita della mappa', () => {
  const molte = [1, 2, 3].map(i => ({
    parent: 'L1_0', label: 'Concetto numero ' + i,
    desc: 'La Germania aveva bisogno di franchi svizzeri per comprare merci dalle altre nazioni.',
    evidenza: 'La Germania aveva bisogno di franchi svizzeri per comprare merci'
  }));
  const r = A.validaProposte(molte, Object.assign({ max: 2 }, CTX));
  assert.strictEqual(r.proposte.length, 2);
  assert.strictEqual(r.scartate[0].perche, 'oltre il tetto');
});

// ── cercaBM25: cercare nella fonte (15/9/2026) ──────────────────────────────
// Non è `ancoraNodi` con un altro punteggio: risponde a un'altra domanda (una
// query CORTA del docente, nessun cancello). I numeri del banco stanno nel
// commento sopra la funzione; qui si prova il COMPORTAMENTO che li produce.

const frasiDi = (...testi) => A.frasiDaPagine([{ n: 1, text: testi.join(' ') }],
  { minSentenceWords: 1, maxSentenceChars: 5000 });

test('cercaBM25: non premia la frase CORTA — è il difetto del punteggio vecchio', () => {
  // «parole in comune / parole della frase» dà 1,00 alla riga di tre parole e
  // 0,25 al paragrafo che risponde davvero.
  const frasi = frasiDi(
    'La resistenza elettrica.',
    'La resistenza elettrica di un conduttore cresce con la lunghezza del filo e diminuisce quando la sezione del filo aumenta, a parita di materiale.'
  );
  const out = A.cercaBM25(frasi, 'da che cosa dipende la resistenza elettrica di un conduttore');
  assert.ok(out.length >= 2);
  assert.match(out[0].text, /cresce con la lunghezza/, 'primo deve essere il paragrafo che risponde');
});

test('cercaBM25: la parola RARA pesa piu di quella comune (IDF)', () => {
  const frasi = frasiDi(
    'Il circuito e collegato alla batteria.',
    'Il circuito e collegato alla lampadina.',
    'Il circuito e collegato al reostato.'
  );
  const out = A.cercaBM25(frasi, 'circuito reostato');
  assert.match(out[0].text, /reostato/, '«reostato» compare una volta sola: deve comandare lui, non «circuito»');
});

test('cercaBM25: tiene unita, simboli e cifre — contentWords li scarta', () => {
  const frasi = frasiDi(
    'La tensione si misura in volt e vale dodici unita nel nostro caso.',
    'Una resistenza da 12 ohm limita la corrente nel circuito.'
  );
  for (const q of ['12 ohm', 'resistenza da 12 Ω']) {
    const out = A.cercaBM25(frasi, q);
    assert.ok(out.length, `nessun risultato per «${q}»`);
    assert.match(out[0].text, /12 ohm/, `«${q}» deve trovare la riga con 12 ohm`);
  }
});

test('cercaBM25: nessun cancello — a differenza di ancoraNodi non scarta i deboli', () => {
  const frasi = frasiDi(
    'Il generatore fornisce energia al circuito chiuso e la corrente puo scaldare i conduttori collegati lungo tutto il percorso previsto.'
  );
  // una sola parola in comune su una frase lunga: relMin 0.18 la taglierebbe
  const out = A.cercaBM25(frasi, 'generatore');
  assert.strictEqual(out.length, 1, 'la frase debole deve comunque comparire');
  assert.strictEqual(out[0].hit, 1);
});

test('cercaBM25: deterministico e con tetto rispettato', () => {
  const frasi = frasiDi(...Array.from({ length: 30 }, (_, i) => `La corrente scorre nel ramo numero ${i}.`));
  const a = A.cercaBM25(frasi, 'corrente ramo');
  const b = A.cercaBM25(frasi, 'corrente ramo');
  assert.deepStrictEqual(a, b, 'due passate devono dare la stessa lista');
  assert.ok(a.length <= 20, 'tetto di default 20');
  assert.strictEqual(A.cercaBM25(frasi, 'corrente', { max: 3 }).length, 3);
});

test('cercaBM25: casi vuoti non lanciano', () => {
  const frasi = frasiDi('Una frase qualunque sul circuito elettrico.');
  assert.deepStrictEqual(A.cercaBM25(frasi, ''), []);
  assert.deepStrictEqual(A.cercaBM25(frasi, '   ,,, '), []);
  assert.deepStrictEqual(A.cercaBM25([], 'circuito'), []);
  assert.deepStrictEqual(A.cercaBM25(null, 'circuito'), []);
  assert.deepStrictEqual(A.cercaBM25(frasi, 'parolacheNONesiste'), []);
});

test('cercaBM25 NON tocca ancoraNodi: il cancello dell\'ancora resta dov\'era', () => {
  // Guardia di regressione: la funzione nuova vive accanto, non al posto.
  const frasi = frasiDi('Il circuito chiuso scalda la batteria quando la resistenza e troppo bassa.');
  const estraneo = A.ancoraNodi([{ id: 'x', desc: 'La fotosintesi clorofilliana nelle piante verdi' }], frasi);
  assert.deepStrictEqual(estraneo.perNodo, {}, 'un nodo estraneo non deve ricevere citazioni');
  assert.ok(A.cercaBM25(frasi, 'batteria').length, 'la ricerca invece risponde: e un elenco, non un verdetto');
});

// ── il reranker: che cosa mandargli, che cosa tenere (16/9/26) ──────────────
test('reranker: la domanda è «etichetta. descrizione», la stessa della prova giudicata a mano', () => {
    assert.strictEqual(A.queryReranker({ label: ' Piano Wahlen ', desc: 'Aumentò le coltivazioni. ' }), 'Piano Wahlen. Aumentò le coltivazioni.');
    assert.strictEqual(A.queryReranker({ label: 'Nodo', content: 'solo content' }), 'Nodo. solo content');
});

test('reranker: fino a 120 frasi si mandano tutte; oltre, BM25 fa da setaccio e tiene la frase pertinente', () => {
    const poche = Array.from({ length: 120 }, (_, i) => ({ idx: i, text: 'frase numero ' + i + ' sul tema generico', page: 1 }));
    assert.deepStrictEqual(A.candidatiReranker(poche, { label: 'x', desc: 'y' }), poche.map((f, i) => i));

    const molte = Array.from({ length: 500 }, (_, i) => ({ idx: i, text: 'riga di riempimento ' + i + ' senza argomento preciso', page: 1 + (i % 20) }));
    molte[437] = { idx: 437, text: 'Il piano Wahlen aumentò le superfici coltivate a patate e cereali.', page: 18 };
    const scelte = A.candidatiReranker(molte, { label: 'Piano Wahlen', desc: 'Il piano aumentò le coltivazioni di patate.' });
    assert.ok(scelte.includes(437), 'la frase che parla del nodo deve arrivare al reranker');
    assert.ok(scelte.length <= A.RERANK.prefiltro + Math.ceil(A.RERANK.prefiltro / 3), 'il setaccio deve restare stretto');
    assert.deepStrictEqual(scelte, scelte.slice().sort((a, b) => a - b), 'in ordine di documento');
});

test('reranker: dai voti restano le prime due, anche su un sottoinsieme di frasi, senza soglie di qualità', () => {
    const frasi = ['a', 'b', 'c', 'd', 'e'].map((t, i) => ({ idx: i, text: 'frase ' + t, page: i + 1 }));
    // indici non contigui: il voto k-esimo appartiene a frasi[indici[k]]
    const cit = A.citazioniDaVoti(frasi, [4, 1, 3], [0.97, 0.99, 0.02]);
    assert.deepStrictEqual(cit.map(c => c.idx), [1, 4]);
    assert.deepStrictEqual(cit[0], { idx: 1, text: 'frase b', page: 2, score: 0.99 });
    // pari merito: vince la frase che viene prima nel documento
    assert.deepStrictEqual(A.citazioniDaVoti(frasi, [3, 2, 0], [0.5, 0.5, 0.5]).map(c => c.idx), [0, 2]);
    // la sola rete: sotto 0,01 non si cita, e un voto rotto non conta
    assert.deepStrictEqual(A.citazioniDaVoti(frasi, [0, 1, 2], [0.005, null, NaN]), []);
    assert.deepStrictEqual(A.citazioniDaVoti(frasi, [0, 1], [0.024, 0.009]).map(c => c.idx), [0], '0,024 era la frase giusta più bassa osservata: resta');
    // voti mancanti o più corti degli indici non rompono niente
    assert.deepStrictEqual(A.citazioniDaVoti(frasi, [0, 1], undefined), []);
});

/* Una frase che si interrompe DENTRO un vuoto da riempire non prova niente: il
   fatto è nel vuoto, cioè fuori dal testo. Misurato il 19/9/2026 sulla scheda
   «La Svizzera nella seconda guerra mondiale»: una frase così era citata su due
   nodi. Restano invece il vuoto CHIUSO dentro un periodo completo e la coda di
   un vuoto in testa a una frase che poi un fatto lo dice.
   ⚠️ Si scarta la frase, non si riscrive: le citazioni devono restare verbatim
   o la verifica contro le pagine archiviate le rifiuta. */
test('frasiDaPagine: via la frase che finisce dentro un vuoto da riempire', () => {
  const pagine = A.paginePiatte([
    'Dopo il 1940 la volontà di evitare conflitti con i nuovi padroni dell’Europa (.....................',
    'La Svizzera fu accerchiata dalle forze naziste e dei loro alleati (...............).',
    '............), la precaria situazione alimentare spinse le autorità a porre restrizioni all’afflusso.',
    'Il razionamento alimentare limitò i consumi di pane e carne per tutta la durata della guerra…'
  ]);
  const testi = A.frasiDaPagine(pagine).map(f => f.text);
  assert.ok(!testi.some(t => /padroni dell’Europa/.test(t)), 'la frase troncata nel vuoto non è una prova');
  assert.ok(testi.some(t => /dei loro alleati/.test(t)), 'il vuoto chiuso dentro un periodo completo resta');
  assert.ok(testi.some(t => /precaria situazione alimentare/.test(t)), 'la coda di un vuoto in testa non cancella il fatto che segue');
  assert.ok(testi.some(t => /razionamento alimentare/.test(t)), 'i puntini di sospensione non sono un vuoto');
});
