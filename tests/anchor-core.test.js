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
/* il costruttore VERO dei blocchi delle figure, per la prova incrociata dello 0120 (solo letto) */
const F = require(path.join(__dirname, '..', 'public', 'js', 'mappai-figure-core.js'));

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

/* ── I SEGNI DELLE FIGURE NELLE CITAZIONI (packet 0120, 21/10/2026) ────────
   Dal 0113 (ADR 0024 §5.7) la pagina porta in coda, sulla stessa riga, il blocco
   `[Figure della pagina N] … [/Figure]` con la legenda e il segno ⟦da controllare: …⟧
   attorno alle righe gialle. L'àncora taglia al punto e non li conosceva: sulle due
   mappe del banco dello 0120, 6 citazioni su 104 portavano un marcatore, in quattro
   forme. I testi qui sotto sono le pagine VERE di quel banco (dati di prova, non di
   Giacomo), accorciate. Decisione D1 (Giacomo, 21/10): il testo letto dalle figure,
   giallo compreso, resta citabile — senza i segni. */
const SEGNI_FIG = /\[\/?(?:Figure|Figures|Testo a immagini|Text as images|Formule|Formulas)|⟦|⟧|testo letto da un'immagine|text read from an image/;
const LEGENDA_FIG = '⟦da controllare: …⟧ = testo letto da un\'immagine, incerto: usalo solo se il resto della fonte lo conferma.';
const testiFig = pagine => A.frasiDaPagine(pagine).map(f => f.text);

test('0120, forma 1: il segno giallo DENTRO il blocco è un confine — «…aiuto⟧ Il sistema feudale» e «…valvassino ⟦da controllare:» non escono più', () => {
  const p2 = 'I feudi non erano ereditari, cioè non passavano da padre in figlio, ma ogni vassallo doveva dimostrare di essere fedele al re per poter sperare di ottenere più a lungo il feudo. [Figure della pagina 2] ' + LEGENDA_FIG + ' IMPERATORE feudi reali VASSALLO valvassore valvassore valvassino valvassino valvassino valvassino ⟦da controllare: IMPERATORE → VASSALLO: L\'imperatore dona delle terre (feudi) ai vassalli. VASSALLO → IMPERATORE: I vassalli forniscono all\'imperatore un numero di cavalieri proporzionato alla grandezza dei loro feudi. VASSALLO → valvassore: Ogni vassallo può donare parte del suo feudo ai valvassori, i quali, a loro volta, ne possono donare parte ai valvassini.⟧ Feudi → Consiglio e aiuto Feudi → Consiglio e aiuto Feudi → Consiglio e aiuto Feudi → Consiglio e aiuto ⟦da controllare: Feudi → Consiglio e aiuto Feudi → Consiglio e aiuto Feudi → Consiglio e aiuto Feudi → Consiglio e aiuto⟧ Il sistema feudale spesso viene descritto come una piramide: al vertice vi sarebbe il re, poi verrebbero i grandi feudatari, i loro vassalli con i vassalli dei vassalli, e sotto a tutti i contadini, tenuti a pagare tributi e a prestare servizi. Il disegno qui a sinistra, benché molto semplificato, mostra come in realtà la situazione fosse ben più complessa. [/Figure]';
  const t = testiFig([{ n: 2, text: p2 }]);
  assert.ok(t.length >= 6, 'le frasi della pagina ci sono: ' + t.length);
  t.forEach(s => assert.ok(!SEGNI_FIG.test(s), 'frase con un marcatore: «' + s + '»'));
  assert.ok(t.includes('IMPERATORE feudi reali VASSALLO valvassore valvassore valvassino valvassino valvassino valvassino'), 'le etichette verdi dello schema, senza il segno che le seguiva');
  assert.ok(t.some(s => s.startsWith('Il sistema feudale spesso viene descritto come una piramide:')), 'la frase dopo il segno comincia da sé');
  assert.ok(t.some(s => s.startsWith('Ogni vassallo può donare parte del suo feudo ai valvassori') && s.endsWith('ai valvassini.')), 'l\'ultima riga gialla chiude col suo punto, senza ⟧');
  /* D1: il testo giallo resta citabile, pulito — come oggi, senza i segni rotti */
  assert.ok(t.includes('Feudi → Consiglio e aiuto Feudi → Consiglio e aiuto Feudi → Consiglio e aiuto Feudi → Consiglio e aiuto'), 'la riga gialla è una frase a sé, senza segni');
});

test('0120, forma 2: «…non sarà più valido.⟧ « A.» — il segno subito dopo il punto è un confine', () => {
  const p3 = 'Carlo Magno e il sistema feudale ESERCIZIO: Riempi la piramide seguente indicando con i loro nomi i vari gradi del sistema feudale: [Figure della pagina 3] ' + LEGENDA_FIG + ' 1 Osserva i signori al livello più basso. Sono proprietari di tutte le terre di cui dispongono? 2 Il re è proprietario di tutte le terre di cui dispone? ⟦da controllare: Riportiamo due capitolari (leggi del regno dei Franchi) che risalgono ai primi anni del XI secolo e si occupano dei problemi che sorgono nel rapporto tra signore e vassallo, in particolare dei diritti e doveri di ciascuno, e dei casi in cui il legame contratto col giuramento contro non sarà più valido.⟧ « A. Se qualcuno dei nostri fedeli, volendo combattere contro un avversario, avrà chiesto aiuto ad uno dei suoi vassalli e costui non vorrà soccorrerlo e si dimostrerà negligente, gli tolga il beneficio che deteneva e lo dia a un altro che gli sia fedele. B. Se qualcuno vorrà abbandonare il suo signore, potrà farlo solo per un giusto motivo. [/Figure]';
  const t = testiFig([{ n: 3, text: p3 }]);
  t.forEach(s => assert.ok(!SEGNI_FIG.test(s), 'frase con un marcatore: «' + s + '»'));
  assert.ok(t.some(s => s.startsWith('Riportiamo due capitolari') && s.endsWith('non sarà più valido.')), 'la frase gialla finisce al suo punto');
  assert.ok(!t.some(s => /« A\.$/.test(s)), 'nessuna frase finisce con l\'etichetta « A.»');
  assert.ok(t.some(s => /Se qualcuno dei nostri fedeli/.test(s)), 'il capitolare A resta una frase');
});

test('0120, forma 3: l\'apertura «[Figure della pagina 2]» non entra nella prima frase di un blocco pulito (giallo confermato)', () => {
  const p2 = 'Ogni vassallo doveva dimostrare di essere fedele al re per poter sperare di ottenere più a lungo il feudo. [Figure della pagina 2] IMPERATORE feudi reali VASSALLO valvassore valvassore valvassino valvassino valvassino valvassino IMPERATORE → VASSALLO: L\'imperatore dona delle terre (feudi) ai vassalli. VASSALLO → IMPERATORE: I vassalli forniscono all\'imperatore un numero di cavalieri proporzionato alla grandezza dei loro feudi. [/Figure]';
  const t = testiFig([{ n: 2, text: p2 }]);
  t.forEach(s => assert.ok(!SEGNI_FIG.test(s), 'frase con un marcatore: «' + s + '»'));
  assert.ok(t.some(s => s.startsWith('IMPERATORE feudi reali VASSALLO')), 'la prima frase del blocco comincia dal contenuto');
  assert.ok(!t.some(s => s.startsWith('[Figure')), 'nessuna frase comincia col marcatore');
});

test('0120, forma 4: la pagina che finisce senza punto, poi il marcatore e la legenda — la legenda non è una frase citabile; la coda «⟧ [/Figure]» sparisce (con e senza lo spazio dello 0114)', () => {
  const corpo = 'Il vassallo si impegnava a obbedire alla chiamata alle armi del re fornendogli una squadra di cavalieri (da 10 a 50), proporzionata alla vastità del suo feudo. In questo consisteva il punto più importante del sistema [Figure della pagina 1] ' + LEGENDA_FIG + ' La prova: il re appoggia la spada sulla spalla del vassallo. Ciò ricorda il fatto che, nelle antiche famiglie combattenti, l\'investitura avveniva quando il vassallo era appena un adolescente e il signore gli assestava un colpo fortissimo sulla spalla per assicurarsi che l\'addestramento militare lo avesse reso robusto. ⟦da controllare: Il bacio: con esso il re (o il capofamiglia) promette al vassallo la sua eterna protezione.';
  ['⟧ [/Figure]', ' ⟧ [/Figure]'].forEach(coda => {
    const t = testiFig([{ n: 1, text: corpo + coda }]);
    t.forEach(s => assert.ok(!SEGNI_FIG.test(s), 'frase con un marcatore: «' + s + '»'));
    /* il frammento tipografico «In questo consisteva il punto più importante del sistema» ha 4 parole piene:
       sotto il minimo, cade come ogni frammento; se restasse, resterebbe pulito */
    t.filter(s => /consisteva il punto/.test(s)).forEach(s => assert.strictEqual(s, 'In questo consisteva il punto più importante del sistema'));
    assert.ok(!t.some(s => /usalo solo se il resto della fonte|testo letto da un/.test(s)), 'la legenda parla al modello, non è una prova');
    /* «il re appoggia la spada sulla spalla del vassallo.» ha 4 parole piene e cade come ogni frammento corto: il contenuto verde citabile è la frase lunga */
    assert.ok(t.some(s => s.startsWith('Ciò ricorda il fatto che, nelle antiche famiglie combattenti') && s.endsWith('reso robusto.')), 'il contenuto verde della figura resta citabile');
    assert.ok(t.includes('con esso il re (o il capofamiglia) promette al vassallo la sua eterna protezione.'), 'l\'ultima riga gialla chiude col suo punto, senza la coda');
  });
});

test('0120: i blocchi costruiti dal costruttore VERO (figure, testo a immagini, formule; IT e EN) non lasciano nessun pezzo nelle frasi', () => {
  const verde = { stato: 'verde', righe: [{ testo: 'Il re affida le terre ai suoi vassalli in cambio di fedeltà e servizio militare.', verde: true }] };
  const giallo = { stato: 'giallo', righe: [{ testo: 'IMPERATORE', verde: true }, { testo: 'I valvassini dipendono dai valvassori e devono loro aiuto e consiglio.', verde: false }] };
  const rosso = { stato: 'rosso', righe: [{ testo: 'INVENTATO DAL MODELLO che non deve comparire da nessuna parte.', verde: true }] };
  const riga = 'Il sistema feudale nasce in Europa dopo la caduta dell\'impero romano e organizza la società in gradi di fedeltà personale.';
  ['it', 'en'].forEach(lingua => {
    const pagine = [
      { n: 1, text: F.marcatori.accoda(riga, F.marcatori.figure(1, [verde, giallo, rosso], { lingua })) },
      { n: 2, text: F.marcatori.accoda(riga, F.marcatori.testoImmagini(2, ['La respirazione cellulare è un processo che avviene in tutti gli esseri viventi.'], { lingua })) },
      { n: 3, text: F.marcatori.accoda(riga, F.marcatori.formule(3, [{ n: 1, formula: '2x + 3 > 7', soluzione: 'S = ]2; +∞[' }], { lingua })) },
      { n: 4, text: F.marcatori.accoda('', F.marcatori.figure(4, [verde], { lingua })) }
    ];
    pagine.forEach(p => assert.ok(/\[/.test(p.text), 'il costruttore ha messo il blocco (' + lingua + ')'));
    const t = testiFig(pagine);
    t.forEach(s => assert.ok(!SEGNI_FIG.test(s), lingua + ': frase con un marcatore: «' + s + '»'));
    assert.ok(t.includes(verde.righe[0].testo), lingua + ': la riga verde è citabile');
    assert.ok(t.includes(giallo.righe[1].testo), lingua + ': la riga gialla è citabile, senza il segno (D1)');
    assert.ok(t.some(s => /respirazione cellulare/.test(s)), lingua + ': il testo a immagini è citabile');
    assert.ok(!t.some(s => /INVENTATO/.test(s)), lingua + ': il rosso non entra nel blocco, quindi nemmeno qui');
    assert.ok(!t.some(s => /usalo solo se|use it only if/.test(s)), lingua + ': la legenda non è una frase');
    /* rilettura dello 0120: le frasi sotto le 5 parole cadono PRIMA delle asserzioni qui sopra, quindi un pezzo di
       marcatore non riconosciuto poteva sopravvivere senza farsi vedere. Si guarda allora ciò che togliMarcatori
       toglie davvero: ogni forma del costruttore vero deve stare in `tolti`, e nessun segmento porta un pezzo. */
    const tolti = [];
    pagine.forEach(p => {
      const r = A.togliMarcatori(p.text);
      /* le quadre di un intervallo («]2; +∞[») sono contenuto: si cercano i pezzi dei marcatori, non le parentesi */
      r.segmenti.forEach(s => assert.ok(!/\[\/?(?:Figure|Figures|Testo|Text|Formule|Formulas)|⟦|⟧/.test(s), lingua + ': segmento con un pezzo di marcatore: «' + s + '»'));
      tolti.push(...r.tolti);
    });
    const M = F.MARC[lingua];
    [M.figure[0].replace('N', '1'), M.figure[1], M.testoImmagini[0].replace('N', '2'), M.testoImmagini[1], M.formule[0].replace('N', '3'), M.formule[1], F.SEGNO_APRE, F.SEGNO_CHIUDE, F.LEGENDA[lingua]]
      .forEach(forma => assert.ok(tolti.includes(forma), lingua + ': la forma «' + forma + '» del costruttore vero non è riconosciuta'));
  });
});

test('0120: togliMarcatori — senza marcatori il testo passa INTATTO (gli id delle evidenze non si muovono); con i marcatori ogni pezzo è contiguo', () => {
  const liscio = 'Una frase senza marcatori.  Con due spazi, e un\'altra frase dopo. ';
  assert.deepStrictEqual(A.togliMarcatori(liscio), { segmenti: [liscio], tolti: [] });
  assert.deepStrictEqual(A.togliMarcatori(''), { segmenti: [], tolti: [] });
  assert.deepStrictEqual(A.togliMarcatori(null), { segmenti: [], tolti: [] });
  const t = 'Prima. [Figure della pagina 7] ' + LEGENDA_FIG + ' Verde uno. ⟦da controllare: Giallo due.⟧ Verde tre. [/Figure]';
  const r = A.togliMarcatori(t);
  assert.deepStrictEqual(r.segmenti, ['Prima.', 'Verde uno.', 'Giallo due.', 'Verde tre.']);
  assert.deepStrictEqual(r.tolti, ['[Figure della pagina 7]', LEGENDA_FIG, '⟦da controllare: ', '⟧', '[/Figure]']);
  r.segmenti.forEach(s => assert.ok(t.indexOf(s) >= 0, 'ogni segmento è un pezzo contiguo del testo'));
  /* le tre famiglie, in inglese, e il numero di pagina a più cifre */
  const en = A.togliMarcatori('[Figures of page 12] ⟦da controllare: …⟧ = text read from an image, uncertain: use it only if the rest of the source confirms it. One. [/Figures] [Text as images of page 3, local OCR] ⟦da controllare: Two.⟧ [/Text as images] [Formulas of page 5] ⟦da controllare: 1) x > 2⟧ [/Formulas]');
  assert.deepStrictEqual(en.segmenti, ['One.', 'Two.', '1) x > 2']);
  assert.strictEqual(en.tolti.length, 11, 'tre aperture, tre chiusure, la legenda, due segni che aprono e due che chiudono');
  /* due passate, stesso risultato */
  assert.deepStrictEqual(A.togliMarcatori(t), r);
});

test('0120: la stessa frase scritta due volte sulla pagina è UNA prova per nodo, e il posto va alla frase dopo', () => {
  const riga = 'I vassalli forniscono al re un numero di cavalieri proporzionato alla grandezza dei loro feudi.';
  const altra = 'Il vassallo riceve dal re un feudo e in cambio promette fedeltà e cavalieri.';
  const f = A.frasiDaPagine([{ n: 2, text: riga + ' ' + riga + ' ' + altra }]);
  assert.strictEqual(f.length, 3, 'le tre frasi ci sono, la copia compresa');
  const q = A.ancoraNodi([{ id: 'n', desc: 'I vassalli forniscono cavalieri al re, in numero proporzionato ai feudi ricevuti in cambio di fedeltà.' }], f).perNodo.n;
  assert.strictEqual(q.length, 2);
  assert.strictEqual(q[0].text, riga);
  assert.strictEqual(q[1].text, altra, 'la seconda citazione è l\'altra frase, non la copia');
  /* rilettura dello 0120: la copia saltata è la STESSA prova, quindi conta come coperta — altrimenti la copertura
     cala e il passaggio di copertura rimanda al modello una frase che la mappa cita già */
  const anc = A.ancoraNodi([{ id: 'n', desc: 'I vassalli forniscono cavalieri al re, in numero proporzionato ai feudi ricevuti in cambio di fedeltà.' }], f);
  assert.deepStrictEqual(Object.keys(anc.usate).map(Number).sort(), [0, 1, 2], 'la copia (idx 1) è usata, non orfana');
  const cop = A.copertura(f, anc.usate);
  assert.strictEqual(cop.pct, 100);
  assert.deepStrictEqual(cop.pagine[0].orfane, []);
});

test('0120: fuori da un blocco delle figure le parentesi ⟦ ⟧ sono testo (parte intera, logica): la pagina passa intatta', () => {
  const mate = 'La parte intera ⟦x⟧ di un numero reale x è il più grande intero minore o uguale a x. Per esempio ⟦3,7⟧ vale 3 e ⟦−1,2⟧ vale −2 secondo la definizione data.';
  assert.deepStrictEqual(A.togliMarcatori(mate), { segmenti: [mate], tolti: [] });
  const t = testiFig([{ n: 1, text: mate }]);
  assert.strictEqual(t.length, 2);
  assert.ok(t[0].startsWith('La parte intera ⟦x⟧'), 'la prima frase è intera, con le sue parentesi');
  /* dentro un blocco il segno resta un confine, anche sulla stessa pagina */
  const conBlocco = mate + ' [Figure della pagina 1] ' + LEGENDA_FIG + ' Il grafico mostra la funzione a gradini della parte intera fra meno due e due. ⟦da controllare: Gli scalini salgono di uno a ogni intero positivo del piano.⟧ [/Figure]';
  const r = A.togliMarcatori(conBlocco);
  assert.ok(r.tolti.includes('[Figure della pagina 1]') && r.tolti.includes('[/Figure]'));
  assert.ok(r.segmenti.includes('Gli scalini salgono di uno a ogni intero positivo del piano.'), 'la riga gialla del blocco è un segmento a sé');
});
