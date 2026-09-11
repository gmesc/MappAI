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
