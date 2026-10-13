'use strict';
/*
 * affermazioni-core.test.js — lo strato delle affermazioni e la quarantena
 * (packet 0042, ADR 0010). Il core è puro: qui si prova in Node, senza DOM.
 *
 * Le frasi vengono da «Svizzera e 2a GM» (la copia di pipeline.json misurata il
 * 26/9), ridotte a una mappa di otto nodi e a cinque pagine di fonte. Niente
 * percorsi, niente nomi di persone oltre a quelli della storia.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const JS = path.join(__dirname, '..', 'public', 'js');
const A = require(path.join(JS, 'mappai-affermazioni-core.js'));
const RC = require(path.join(JS, 'mappai-review-core.js'));
const EC = require(path.join(JS, 'mappai-evidence-core.js'));
const PC = require(path.join(JS, 'mappai-pipeline-core.js'));

/* ── la fonte: cinque pagine della scheda, con i separatori svizzeri ── */
const SOURCES = [{ nome: 'La Svizzera nella seconda guerra mondiale.pdf', pages: [
  { n: 1, text: 'Il 30 agosto 1939 l’Assemblea Federale elesse Henri Guisan Comandante in Capo dell’Esercito Svizzero con il grado di Generale. ' +
    'Prima e durante la Seconda Guerra Mondiale, l’obiettivo principale della Svizzera era quello di conservare l’indipendenza e di restare fuori dal conflitto.' },
  { n: 3, text: '- pianificò l’approvvigionamento alimentare della popolazione con l’adozione, già a partire dal 1939, del piano Wahlen, che prevedeva l’estensione della campicoltura e un sofisticato sistema di razionamento; ' +
    'ogni terreno coltivabile ancora disponibile fu seminato per assicurare sufficienti provvigioni di cibo;' },
  { n: 4, text: 'La Germania era da tempo un importante partner commerciale della Svizzera e fu il principale destinatario delle esportazioni elvetiche negli anni 1940 - 1944. ' +
    'Nonostante le difficoltà di comunicazione e le pressioni di Berlino, il commercio con gli Alleati – in particolare con gli USA – continuò, ma costituiva solo un terzo di quello con la Germania. ' +
    'I principali beni esportati erano macchinari, merci in ferro e acciaio, attrezzi e utensili, veicoli e prodotti chimici.' },
  { n: 5, text: 'Tramite la sua Banca Nazionale, la Svizzera avviò il commercio di oro con la Germania nazista. ' +
    'La Confederazione Elvetica accolse circa 300\'000 persone, che hanno trovato protezione in Svizzera. ' +
    'Anche 21\'000 ebrei si rifugiarono nel nostro Paese per sfuggire alle leggi razziali del regime nazista.' },
  { n: 6, text: 'Le accuse principali sono quelle di aver respinto migliaia di rifugiati ebrei, di aver acquistato dai nazisti oro rubato agli ebrei e di aver rifiutato di restituire i depositi fatti nelle banche svizzere da investitori poi deceduti durante il conflitto bellico. ' +
    'Inoltre il nostro paese è stato accusato di aver contribuito al prolungamento della guerra con il rifornimento di materiale militare alla Germania.' }
] }];

/* ── la mappa: otto nodi di Svizzera, le desc come le ha scritte il generatore ── */
const RAZIONAMENTO = 'Il sistema di razionamento è un metodo di distribuzione controllata del cibo. ' +
  'Questo sistema è stato introdotto all\'interno del piano Wahlen per gestire le scorte limitate. ' +
  'Per far funzionare questo meccanismo, lo Stato ha chiesto alla popolazione di fare scorta di cibo e ha regolato le quantità disponibili per ogni persona.';
const ACCUSE = 'La Svizzera è stata oggetto di diverse accuse riguardanti il suo comportamento durante il conflitto. ' +
  'Le critiche principali riguardano il rifiuto di accogliere migliaia di rifugiati ebrei, l\'acquisto di oro rubato dai nazisti e il mancato rimborso di depositi bancari a eredi di persone morte in guerra. ' +
  'Inoltre, lo Stato è accusato di aver aiutato la Germania fornendo materiale militare.';
const ACCUSE_DOCENTE = ACCUSE.replace('Inoltre, lo Stato è accusato di aver aiutato la Germania fornendo materiale militare.',
  'Inoltre, la Svizzera è stata accusata di aver prolungato la guerra rifornendo la Germania di materiale militare.');
/* giro 5 (F1): una riscrittura VERA della frase militare, che del passo contestato («Inoltre, lo Stato è
   accusato di aver aiutato la Germania fornendo materiale militare.») non tiene nessuna parola piena;
   ACCUSE_DOCENTE invece ne tiene 5 su 7 (0,71) e lo riprende ancora */
const ACCUSE_RISCRITTA = ACCUSE.replace('Inoltre, lo Stato è accusato di aver aiutato la Germania fornendo materiale militare.',
  'Per la fonte la Confederazione contribuì anche a prolungare il conflitto con i rifornimenti al Reich.');
const DIFESA = 'Questa categoria descrive come la Svizzera ha protetto i suoi confini. ' +
  'Il 30 agosto 1939 l\'Assemblea Federale ha nominato Henri Guisan Comandante in Capo dell\'Esercito Svizzero con il grado di Generale.';
const DIFESA_DOCENTE = DIFESA.replace('ha protetto i suoi confini.', 'ha protetto i suoi confini con l\'esercito.');
const PROFUGHI = 'La Svizzera accolse circa 300.000 persone e 21.000 ebrei. ' +
  'Fino al 1943, la Svizzera accolse solo militari e rifugiati politici, respingendo molti ebrei.';
const ALLEATI = 'La Svizzera ha continuato a commerciare con gli Alleati, specialmente con gli USA. ' +
  'Il valore di questo commercio era però basso: era solo un terzo rispetto a quello con la Germania.';

function mappa() {
  return {
    nodes: [
      { id: 'ROOT', label: 'Svizzera e 2a GM', level: 0, desc: 'Durante la Seconda Guerra Mondiale, la Svizzera ha perseguito una rigorosa neutralità per preservare l\'indipendenza.' },
      { id: 'L1_1', label: 'Difesa Militare', level: 1, desc: DIFESA },
      { id: 'L1_2_L2_B', label: 'Sistema di razionamento', level: 2, desc: RAZIONAMENTO },
      { id: 'L1_2_C2', label: 'Esportazioni verso la Germania', level: 2, desc: 'La Germania era un partner commerciale molto importante per la Svizzera. ' +
        'Tra il 1940 e il 1944, la Germania è stata il paese che ha comprato più prodotti svizzeri. ' +
        'La Svizzera vendeva soprattutto macchinari, veicoli, prodotti chimici e merci in ferro e acciaio.' },
      { id: 'L1_2_C3', label: 'Commercio con gli Alleati', level: 2, desc: ALLEATI },
      { id: 'L1_3', label: 'Finanza Internazionale', level: 1, desc: 'La Banca Nazionale svizzera commerciò oro con la Germania nazista. Parte di questo oro era frutto di rapina.' },
      { id: 'L1_4', label: 'Politica dei Profughi', level: 1, desc: PROFUGHI },
      { id: 'L1_5_L2_A', label: 'Accuse principali', level: 2, desc: ACCUSE }
    ],
    links: [
      { source: 'ROOT', target: 'L1_1', rel: 'include' },
      { source: 'ROOT', target: 'L1_3', rel: 'include' },
      { source: 'ROOT', target: 'L1_4', rel: 'include' },
      { source: 'L1_3', target: 'L1_5_L2_A', rel: 'richiede' }
    ]
  };
}
const ESAMINATI = ['ROOT', 'L1_1', 'L1_2_L2_B', 'L1_2_C2', 'L1_2_C3', 'L1_4', 'L1_5_L2_A'];
function rapporto(extra) {
  return Object.assign({
    contratto: 'mappai-giudice@2', stato: 'parziale',
    copertura: { nodiTotali: 8, nodiEsaminati: ESAMINATI.slice(), nodiSaltati: [{ id: 'L1_3', label: 'Finanza Internazionale', motivo: 'tempo scaduto', lotto: 8 }] },
    issues: [
      // pending, cita fra virgolette la frase che contesta (dal rapporto vero)
      { id: 'i-razionamento', target: { kind: 'node', id: 'L1_2_L2_B', field: 'desc' },
        problem: '"Il sistema di razionamento" è stato introdotto per gestire le scorte limitate di cibo. Tuttavia, non è vero che questo sistema fosse usato solo per distribuire cibo.' },
      // pending, nessuna virgoletta: si localizza per sovrapposizione
      { id: 'i-profughi', target: { kind: 'node', id: 'L1_4', field: 'desc' },
        problem: 'La descrizione afferma che la Svizzera accolse circa 300.000 persone e 21.000 ebrei, ma le fonti non menzionano un numero specifico di ebrei accolti.' },
      // pending su un nodo che il Giudice NON ha esaminato: vince la corsia 1
      { id: 'i-oro', target: { kind: 'node', id: 'L1_3', field: 'desc' }, problem: 'La fonte non parla di rapina in questi termini.' },
      // pending su un collegamento
      { id: 'i-link', target: { kind: 'link', source: 'L1_3', target: 'L1_5_L2_A', rel: 'richiede', field: '$link' }, after: null,
        problem: 'Il collegamento non è sostenuto dalla fonte.' },
      // pending, aperta dal docente
      { id: 'i-docente', origin: 'teacher', target: { kind: 'node', id: 'L1_2_C3', field: 'desc' },
        problem: 'Da ricontrollare: «era solo un terzo rispetto a quello con la Germania».' },
      // decise dal docente
      { id: 'i-militare', target: { kind: 'node', id: 'L1_5_L2_A', field: 'desc' }, problem: 'La fonte dice che la guerra fu prolungata, non solo che la Germania fu aiutata.' },
      { id: 'i-categoria', target: { kind: 'node', id: 'L1_1', field: 'desc' }, problem: 'La categoria non dice con che cosa.' },
      { id: 'i-neutralita', target: { kind: 'node', id: 'ROOT', field: 'desc' }, problem: 'La neutralità non era rigorosa.' }
    ]
  }, extra || {});
}
function revisione(opts) {
  const o = opts || {};
  let r = RC.createReview({ db: o.db || mappa(), sources: o.sources || SOURCES, report: o.report === undefined ? rapporto() : o.report, generationId: 'gen-svizzera' });
  if (o.decidi !== false) {
    r = RC.setDecision(r, 'i-militare', 'manual', { text: ACCUSE_DOCENTE });
    r = RC.setDecision(r, 'i-categoria', 'manual', { text: DIFESA_DOCENTE });
    r = RC.setDecision(r, 'i-neutralita', 'reject');
  }
  return r;
}
const ADESSO = '2026-09-26T12:00:00.000Z';
const riga = (c, nodeId, inizio) => c.righe.find(r => r.nodeId === nodeId && r.testo.startsWith(inizio));

/* ── affermazioni e impronte ─────────────────────────────────────────────── */
test('affermazioni: le frasi dello splitter unico, un frammento con «:» unito alla frase che segue, intervalli nel testo ORIGINALE', () => {
  const testo = 'Il valore di questo commercio era però basso:\n  era solo un terzo  rispetto a quello con la Germania. Poi il commercio riprese.';
  const a = A.affermazioni(testo);
  assert.equal(a.length, 2);
  assert.equal(a[0].testo, 'Il valore di questo commercio era però basso:\n  era solo un terzo  rispetto a quello con la Germania.');
  assert.equal(testo.slice(a[0].start, a[0].end), a[0].testo);
  assert.equal(testo.slice(a[1].start, a[1].end), 'Poi il commercio riprese.');
  // due frammenti con «:» di fila: una frase sola
  assert.equal(A.affermazioni('Tre misure: la prima: la mobilitazione generale del 1939.').length, 1);
  // un «:» in coda al testo resta da solo
  assert.deepEqual(A.affermazioni('Le misure furono queste:').map(x => x.testo), ['Le misure furono queste:']);
  assert.deepEqual(A.affermazioni(''), []);
  // lo splitter è quello del 0030: «Fig. 1» e «G. Guisan» non spezzano
  assert.equal(A.affermazioni('Il generale G. Guisan guidò l\'esercito. Poi arrivò la pace.').length, 2);
});

test('impronta: stabile fra NFC e NFD e fra spazi diversi; cambia col testo', () => {
  const nfc = 'La neutralità perché così.'.normalize('NFC'), nfd = nfc.normalize('NFD');
  assert.notEqual(nfc, nfd);
  assert.equal(A.impronta(nfc), A.impronta(nfd));
  assert.equal(A.impronta('  La   neutralità\nperché così. '), A.impronta(nfc));
  assert.notEqual(A.impronta('La neutralità perché cosí.'), A.impronta(nfc));
  assert.match(A.impronta(nfc), /^r1-[0-9a-f]{16}-\d+$/);
  // l'elenco delle impronte della mappa: nodo per nodo, frase per frase
  const imp = A.impronte(mappa());
  assert.equal(imp.length, A.affermazioniDb(mappa()).length);
  assert.deepEqual(imp[0], ['ROOT', A.impronta(mappa().nodes[0].desc)]);
});

test('frasi della fonte: àncora per il testo, id uguali a quelli che EvidenceCore mette nelle evidenze', () => {
  const frasi = A.frasiFonte(SOURCES);
  assert.ok(frasi.length >= 10, 'le frasi di contenuto delle cinque pagine');
  // l'intestazione delle consegne e le righe corte non entrano: frasiDaPagine le scarta
  assert.ok(frasi.every(f => f.text.split(/\s+/).length >= 5));
  assert.deepEqual([...new Set(frasi.map(f => f.page))].sort((a, b) => a - b), [1, 3, 4, 5, 6]);
  const indice = EC.costruisciIndice(SOURCES, { adesso: ADESSO });
  let confrontate = 0;
  frasi.forEach(f => {
    const pac = EC.costruisciPacchetto({ records: indice.records, query: f.text, tetto: { unita: 20, caratteri: 100000 } });
    const u = pac.unita.find(x => x.text === f.text);
    if (!u) return;
    confrontate++;
    assert.equal(f.id, u.id, 'id di «' + f.text.slice(0, 40) + '…»');
    assert.equal(f.page, u.page);
    assert.equal(f.sourceId, u.sourceId);
  });
  assert.ok(confrontate >= frasi.length - 1, 'quasi ogni frase si ritrova nelle evidenze (' + confrontate + '/' + frasi.length + ')');
  assert.deepEqual(A.frasiFonte([]), []);
  assert.deepEqual(A.frasiFonte(undefined), []);
});

/* ── organizzativa, elementi chiave, anafora ─────────────────────────────── */
test('organizzativa: la prima famiglia col verbo che presenta; la seconda solo senza numeri né nomi propri', () => {
  assert.equal(A.organizzativa('Questa categoria spiega come la Svizzera ha gestito i rapporti con gli altri Stati.'), true);
  assert.equal(A.organizzativa('In questo ramo si descrivono le misure difensive.'), true);
  assert.equal(A.organizzativa('Questo gruppo ha studiato i documenti e i fatti per capire cosa fosse accaduto.'), false, 'gli storici, non la mappa');
  assert.equal(A.organizzativa('Include i trattati di pace e i rapporti diplomatici.'), true);
  assert.equal(A.organizzativa('Include i trattati di pace e i rapporti con l\'Italia e la Germania.'), false, 'nomi propri: afferma dei fatti');
  assert.equal(A.organizzativa('Comprende 3 fasi della mobilitazione.'), false, 'un numero');
  assert.equal(A.organizzativa('Il tema riguarda la vita quotidiana durante il conflitto.'), true);
  assert.equal(A.organizzativa('Le critiche principali riguardano il rifiuto di accogliere migliaia di rifugiati ebrei.'), false, 'il verbo non è in testa');
  assert.equal(A.organizzativa('This section covers the daily life during the war.'), true);
  assert.equal(A.organizzativa('Covers the 1939 mobilisation of Switzerland.'), false);
  assert.equal(A.organizzativa('This section covers the daily life during the war.', 'it'), false, 'lingua italiana: niente regole inglesi');
  assert.equal(A.organizzativa('Questa categoria spiega le misure.', 'en'), false);
  assert.equal(A.organizzativa('- Questa sezione presenta le misure difensive.'), true, 'frammento d\'elenco normalizzato');
});

test('elementiChiave: numeri, percentuali, anni, date, nomi propri non a inizio frase, sigle; frammenti d\'elenco normalizzati', () => {
  assert.deepEqual(A.elementiChiave('La Svizzera accolse circa 300.000 persone e 21.000 ebrei.'), ['300000', '21000', 'svizzera'], 'la seconda parola non è l\'inizio della frase');
  assert.deepEqual(A.elementiChiave('Svizzera e Germania commerciavano.'), ['germania'], 'la prima sì');
  assert.deepEqual(A.elementiChiave('Accolse circa 300\'000 persone.'), ['300000'], 'separatore svizzero delle migliaia');
  assert.deepEqual(A.elementiChiave('Le due potenze dell’Asse (Germania e Italia) ricevevano il 45% delle esportazioni negli anni 1940 - 1942.'),
    ['45%', '1940', '1942', 'asse', 'germania', 'italia']);
  assert.deepEqual(A.elementiChiave('Il 30 agosto 1939 fu nominato Henri Guisan.'), ['30 agosto', '1939', 'henri', 'guisan']);
  assert.deepEqual(A.elementiChiave('1. settembre 1939: la Germania invade la Polonia.'), ['1 settembre', '1939', 'germania', 'polonia'], '«1.» è una data, non un elenco');
  assert.deepEqual(A.elementiChiave('Commerciò con gli Alleati, specialmente con gli USA.'), ['alleati', 'usa']);
  assert.deepEqual(A.elementiChiave('Negli U.S.A. la guerra continuò.'), ['usa']);
  assert.deepEqual(A.elementiChiave('- fece depositare esplosivo nelle gallerie nel 1940'), ['1940']);
  assert.deepEqual(A.elementiChiave('- Germania: principale partner.'), [], 'dopo il trattino la prima parola è l\'inizio della frase');
  assert.deepEqual(A.elementiChiave('Gli svizzeri le travestirono come case coloniche.'), [], 'l\'aggettivo minuscolo non è un nome');
  // in inglese: la prima parola resta fuori
  assert.deepEqual(A.elementiChiave('Switzerland traded with the USA in 1944.'), ['1944', 'usa']);
});

test('anafora: la frase che non si regge senza la precedente', () => {
  ['Questo sistema è stato introdotto.', 'Queste persone sono i profughi.', 'Tale misura venne allentata.',
    'Grazie a queste misure, la Svizzera voleva.', 'In questo modo, le basi restavano impenetrabili.',
    'Per questo la Svizzera accettò.', 'These measures were relaxed.', 'Such a plan was dangerous.']
    .forEach(t => assert.equal(A.anafora(t), true, t));
  ['Per far funzionare questo meccanismo, lo Stato chiese.', 'Questione aperta.', 'Thisbe was there.',
    'La Svizzera accolse molti profughi.'].forEach(t => assert.equal(A.anafora(t), false, t));
});

/* ── vicina ──────────────────────────────────────────────────────────────── */
test('vicina: la migliore per BM25 con metà delle parole piene e tutti gli elementi chiave; mai una prova', () => {
  const frasi = A.frasiFonte(SOURCES);
  const v = A.vicina('La Germania era un partner commerciale molto importante per la Svizzera.', frasi);
  assert.ok(v && /partner commerciale della Svizzera/.test(v.testo));
  assert.match(v.id, /^ev-/); assert.equal(v.page, 4);
  const anni = A.vicina('Tra il 1940 e il 1944, la Germania è stata il paese che ha comprato più prodotti svizzeri.', frasi);
  assert.ok(!anni || /1940 - 1944/.test(anni.testo), 'se c\'è, è la frase con tutti e due gli anni');
  // 300'000 e 21'000 stanno in due frasi diverse della fonte: nessuna ha TUTTI gli elementi chiave
  assert.equal(A.vicina('La Svizzera accolse circa 300.000 persone e 21.000 ebrei.', frasi), null);
  assert.ok(A.vicina('La Confederazione accolse circa 300.000 persone, che trovarono protezione in Svizzera.', frasi));
  // un anno diverso basta a non essere vicina
  assert.equal(A.vicina('Il 30 agosto 1940 l\'Assemblea Federale elesse Henri Guisan Comandante in Capo dell\'Esercito.', frasi), null);
  assert.ok(A.vicina('Il 30 agosto 1939 l\'Assemblea Federale elesse Henri Guisan Comandante in Capo dell\'Esercito.', frasi));
  assert.equal(A.vicina('Frase qualsiasi.', []), null);
  // la risposta non dice «verificata»: niente campo di verità
  assert.equal(Object.keys(v).some(k => /verific|vera|support/i.test(k)), false);
});

/* ── passo contestato e confermata ───────────────────────────────────────── */
test('passoContestato: i cinque modi, sulle frasi di Svizzera', () => {
  const issue = (desc, extra) => Object.assign({ target: { kind: 'node', id: 'x', field: 'desc' }, before: desc, after: null, hasProposal: false, problem: '' }, extra);
  // manuale: dove il docente ha cambiato, allargato alla frase intera
  let p = A.passoContestato(issue(ACCUSE), { choice: 'manual', text: ACCUSE_DOCENTE });
  assert.equal(p.modo, 'manuale');
  assert.deepEqual(p.passi.map(x => x.testo), ['Inoltre, lo Stato è accusato di aver aiutato la Germania fornendo materiale militare.']);
  // proposta: dove il Giudice cambierebbe
  p = A.passoContestato(issue(PROFUGHI, { hasProposal: true, after: PROFUGHI.replace('respingendo molti ebrei', 'respingendo numerosi ebrei') }), { choice: 'pending' });
  assert.equal(p.modo, 'proposta');
  assert.deepEqual(p.passi.map(x => x.testo), ['Fino al 1943, la Svizzera accolse solo militari e rifugiati politici, respingendo molti ebrei.']);
  // citato: fra virgolette doppie, e fra apici singoli senza farsi ingannare dagli apostrofi
  p = A.passoContestato(issue(RAZIONAMENTO, { problem: '"Il sistema di razionamento" è stato introdotto per gestire le scorte limitate di cibo.' }));
  assert.equal(p.modo, 'citato');
  // giro 2: il problema ripete anche le parole piene della seconda frase («introdotto… gestire le scorte limitate»,
  // 0,63): il passo si allarga a lei, ed è un passo solo perché le due frasi sono contigue
  assert.deepEqual(p.passi.map(x => x.testo), ['Il sistema di razionamento è un metodo di distribuzione controllata del cibo. ' +
    'Questo sistema è stato introdotto all\'interno del piano Wahlen per gestire le scorte limitate.']);
  p = A.passoContestato(issue(RAZIONAMENTO, { problem: 'La fonte non indica che il sistema di razionamento sia servito a \'gestire le scorte limitate\', ma lo cita come parte dell\'approvvigionamento.' }));
  assert.equal(p.modo, 'citato');
  assert.equal(p.passi[0].testo, 'Questo sistema è stato introdotto all\'interno del piano Wahlen per gestire le scorte limitate.');
  // sovrapposizione, verso 'frase': l'unica frase con metà delle sue parole piene nel problema
  p = A.passoContestato(issue(PROFUGHI, { problem: 'La descrizione afferma che la Svizzera accolse circa 300.000 persone e 21.000 ebrei, ma le fonti non menzionano un numero specifico di ebrei accolti.' }));
  assert.equal(p.modo, 'sovrapposizione'); assert.equal(p.verso, 'frase');
  assert.deepEqual(p.passi.map(x => x.testo), ['La Svizzera accolse circa 300.000 persone e 21.000 ebrei.']);
  // nodo: il problema parla d'altro (dal rapporto vero, su un nodo che non c'entrava)
  p = A.passoContestato(issue(RAZIONAMENTO, { problem: 'Tuttavia, non è vero che ha commercio liberamente con tutti i paesi belligeranti.' }));
  assert.equal(p.modo, 'nodo');
  assert.equal(p.passi[0].testo, RAZIONAMENTO);
  assert.equal('verso' in p, false);
  // nodo anche quando due frasi superano la soglia e nell'altro verso nessuna stacca la seconda
  p = A.passoContestato(issue(PROFUGHI, { problem: 'La Svizzera accolse 300.000 persone e 21.000 ebrei; fino al 1943 accolse solo militari e rifugiati politici respingendo ebrei.' }));
  assert.equal(p.modo, 'nodo');
  // un inserimento puro cade sulla frase in cui si inserisce
  p = A.passoContestato(issue('Prima frase del nodo. Seconda frase del nodo.'), { choice: 'manual', text: 'Prima frase del nodo. Frase nuova. Seconda frase del nodo.' });
  assert.equal(p.modo, 'manuale'); assert.equal(p.passi.length, 1);
  assert.equal(A.passoContestato(issue(''), {}).modo, 'nodo');
});

test('passoContestato: la sovrapposizione nel verso problema→frase, col margine sulla seconda frase (casi di Svizzera)', () => {
  const issue = (desc, problem) => ({ target: { kind: 'node', id: 'x', field: 'desc' }, before: desc, after: null, hasProposal: false, problem });
  // I problemi veri di questi casi erano troncati dal vecchio maxLength del Giudice: qui sono chiusi col punto,
  // come li scrive il Giudice di oggi (su un problema troncato la sovrapposizione non si usa: test sotto).
  // L1_3_L2_A: nessuna frase ha metà delle sue parole nel problema, ma il problema sta quasi tutto nella seconda
  // (0,44 contro 0,22): è la frase che il docente ha poi corretto
  const ORO = 'La Svizzera, tramite la sua Banca Nazionale, scambiò l\'oro della Germania nazista con moneta svizzera o americana. ' +
    'Questo scambio era necessario perché la Germania aveva bisogno di divise privilegiate, cioè monete accettate da altri paesi, per comprare merci. ' +
    'Altri paesi neutrali come Svezia e Portogallo rifiutavano l\'oro tedesco, rendendo la Svizzera l\'unico partner possibile per queste transazioni.';
  let p = A.passoContestato(issue(ORO, 'La descrizione presenta lo scambio come \'necessario\' per la Germania, mentre la fonte dice che la Germania ne aveva \'assolutamente bisogno\', spostando l\'enfasi sulla necessità oggettiva dello scambio piuttosto che su un accordo di necessità.'));
  assert.equal(p.modo, 'sovrapposizione'); assert.equal(p.verso, 'problema');
  assert.deepEqual(p.passi.map(x => x.testo), ['Questo scambio era necessario perché la Germania aveva bisogno di divise privilegiate, cioè monete accettate da altri paesi, per comprare merci.']);
  // L1_0_L2_A_D3: il problema contesta la definizione dell'Assemblea Federale (0,75 contro 0,13)
  const MANDATO = 'Il Consiglio Federale ha scritto la dichiarazione di neutralità grazie a un mandato speciale. ' +
    'Questo mandato è un incarico ufficiale dato dall\'Assemblea Federale, l\'organo che rappresenta il popolo e i cantoni, per gestire la situazione di guerra.';
  p = A.passoContestato(issue(MANDATO, 'La fonte non definisce l\'Assemblea Federale come l\'organo che rappresenta il popolo e i cantoni.'));
  assert.equal(p.modo, 'sovrapposizione'); assert.equal(p.verso, 'problema');
  assert.equal(p.passi.length, 1); assert.ok(p.passi[0].testo.startsWith('Questo mandato è un incarico'));
  // L1_1_L2_B_D2: due frasi hanno metà delle loro parole nel problema (la data vera e il nesso inventato);
  // il problema sta per metà nella terza e per un quarto nella prima: si prende la terza
  const RISERVISTI = 'La Germania aveva annesso l\'Austria nel 1938. L\'annessione è l\'atto con cui uno Stato prende possesso di un altro territorio. ' +
    'Questo evento ha spinto la Svizzera a chiamare i riservisti per sorvegliare i confini con la Germania nel marzo 1939.';
  p = A.passoContestato(issue(RISERVISTI, 'La Svizzera non ha chiamato i riservisti nel marzo 1939 per sorvegliare i confini con la Germania a causa dell\'annessione dell\'Austria. L\'annessione dell\'Austria è avvenuta nel 1938, ma la Svizzera ha chiamato i riservisti a svolgere la manutenzione.'));
  assert.equal(p.modo, 'sovrapposizione'); assert.equal(p.verso, 'problema');
  // giro 2: al passo scelto si aggiunge la prima frase (metà delle sue parole nel problema, e il 1938 che il
  // problema ripete); la seconda, la definizione, resta fuori dal passo
  assert.deepEqual(p.passi.map(x => x.testo.slice(0, 23)), ['La Germania aveva annes', 'Questo evento ha spinto']);
  // il margine: L1_2_C1, il problema sta di più nella seconda frase (0,31) ma il docente ha corretto la terza (0,19);
  // senza un distacco di 0,2 non si sceglie, e resta tutto il nodo
  const AIA = 'La convenzione dell’Aia è un accordo internazionale. Questo accordo permette agli stati neutrali di commerciare liberamente con i paesi in guerra. ' +
    'Grazie a questa regola, la Svizzera ha potuto vendere merci e armamenti agli stati che combattevano.';
  p = A.passoContestato(issue(AIA, 'La convenzione dell’Aia permette agli stati neutrali il libero commercio con i paesi in guerra, inclusa la vendita di armamenti. Tuttavia, la Svizzera non ha venduto armamenti agli Alleati.'));
  assert.equal(p.modo, 'nodo');
  // e con due frasi alla pari (L1_1_L2_A_D1, 0,28 e 0,28) nemmeno
  const POTERI = 'L\'Assemblea Federale ha dato pieni poteri al Consiglio Federale, ovvero il governo della Svizzera. ' +
    'Grazie a questi poteri speciali, il governo ha potuto gestire l\'emergenza e inviare agli altri Stati una dichiarazione di neutralità il 31 agosto 1939.';
  p = A.passoContestato(issue(POTERI, 'Il testo non attribuisce al Consiglio Federale il compito di inviare una dichiarazione di neutralità agli altri Stati. Il Consiglio Federale ha il compito di difendere la neutralità svizzera, ma non è detto che abbia inviato una dichiarazione.'));
  assert.equal(p.modo, 'nodo');
});

test('passoContestato: su un problema TRONCATO niente sovrapposizione, tutto il nodo (giro 1, segnalazione 30302d di Svizzera)', () => {
  assert.equal(A.troncato('La fonte non lo dice.'), false);
  assert.equal(A.troncato('La fonte dice «assolutamente bisogno»'), false);
  assert.equal(A.troncato('Non è la fonte (pagina 4) '), false);
  assert.equal(A.troncato('La Svizzera ha chiamato i riservisti a svolgere la man'), true);
  assert.equal(A.troncato('attribuisce le restrizioni all\'ingresso dei e '), true);
  assert.equal(A.troncato('E poi si interrompe…'), true);
  assert.equal(A.troncato('E poi si interrompe...'), true);
  assert.equal(A.troncato(''), false);
  // L1_4: il problema contesta la prima frase E le restrizioni (seconda frase), ma il testo è tagliato a 220
  // caratteri proprio lì. La sovrapposizione vedeva solo la prima; ora esce tutto il nodo
  const L1_4 = 'La Svizzera accolse circa 300.000 persone e 21.000 ebrei. Dopo il 1940, le autorità posero restrizioni all\'ingresso dei profughi per evitare conflitti con i nazisti e a causa della mancanza di cibo. ' +
    'Fino al 1943, la Svizzera accolse solo militari e rifugiati politici, respingendo molti ebrei. La politica divenne più generosa solo quando la vittoria tedesca non era più possibile.';
  const PROBLEMA = 'La descrizione afferma che la Svizzera accolse circa 300.000 persone e 21.000 ebrei, ma le fonti non menzionano un numero specifico di ebrei accolti. Inoltre, la descrizione attribuisce le restrizioni all\'ingresso dei e ';
  const issue = problem => ({ target: { kind: 'node', id: 'L1_4', field: 'desc' }, before: L1_4, after: null, hasProposal: false, problem });
  let p = A.passoContestato(issue(PROBLEMA));
  assert.equal(p.modo, 'nodo');
  assert.equal(p.passi[0].testo, L1_4);
  // chiuso al punto della prima parte, lo stesso problema si localizza sulla prima frase (verso 'frase')
  p = A.passoContestato(issue('La descrizione afferma che la Svizzera accolse circa 300.000 persone e 21.000 ebrei, ma le fonti non menzionano un numero specifico di ebrei accolti.'));
  assert.equal(p.modo, 'sovrapposizione'); assert.equal(p.verso, 'frase');
  // manuale, proposta e citato non guardano la chiusura del problema
  p = A.passoContestato(issue('«Dopo il 1940, le autorità posero restrizioni all\'ingresso dei profughi» non è nella fonte e poi'));
  assert.equal(p.modo, 'citato');
  assert.ok(p.passi[0].testo.startsWith('Dopo il 1940'));
});

test('confermata: la regola di GroundingCore.isTeacherAmendment — solo ciò che non ha cambiato il testo', () => {
  const i = { target: { kind: 'node', id: 'x', field: 'desc' }, before: ACCUSE, after: null, hasProposal: false };
  assert.equal(A.confermata(i, { choice: 'reject' }), true);
  assert.equal(A.confermata(i, { choice: 'manual', text: ACCUSE }), true, '«Modifica» con il testo di prima');
  assert.equal(A.confermata(i, { choice: 'manual', text: ACCUSE_DOCENTE }), false);
  assert.equal(A.confermata(i, { choice: 'manual' }), false, 'senza testo è ancora da decidere');
  assert.equal(A.confermata(i, { choice: 'accept' }), false, 'senza proposta non c\'è niente da applicare');
  assert.equal(A.confermata(Object.assign({}, i, { hasProposal: true, after: ACCUSE }), { choice: 'accept' }), true);
  assert.equal(A.confermata(Object.assign({}, i, { hasProposal: true, after: ACCUSE_DOCENTE }), { choice: 'accept' }), false);
  assert.equal(A.confermata({ target: { kind: 'link', field: '$link' }, before: { source: 'a', target: 'b' }, after: null, hasProposal: true }, { choice: 'accept' }), false, 'una rimozione non è una conferma');
  assert.equal(A.confermata(i, { choice: 'pending' }), false);
  assert.equal(A.confermata(i, undefined), false);
});

/* ── le corsie ───────────────────────────────────────────────────────────── */
test('corsie: l\'ordine esatto del §4 — del docente, non esaminata, contestata, di servizio, vicina, senza', () => {
  const review = revisione(), db = mappa();
  const c = A.corsie({ review, db });
  assert.deepEqual(c.conflitti, []);
  // 2 · il nodo non esaminato esce tutto, anche se ha una segnalazione pending: vince la corsia 2
  c.righe.filter(r => r.nodeId === 'L1_3').forEach(r => { assert.equal(r.corsia, 'fuori-non-esaminata'); assert.equal(r.origine, 'copertura'); });
  assert.deepEqual(c.nonEsaminati, ['L1_3']);
  assert.deepEqual(c.daGiriPrecedenti, [], 'un giro solo');
  // 3 · pending del Giudice: esce il passo citato, non il nodo
  const raz0 = riga(c, 'L1_2_L2_B', 'Il sistema di razionamento');
  assert.equal(raz0.corsia, 'fuori-contestata'); assert.equal(raz0.origine, 'giudice'); assert.equal(raz0.issueId, 'i-razionamento');
  assert.equal(riga(c, 'L1_2_L2_B', 'Per far funzionare').corsia !== 'fuori-contestata', true, 'la frase non contestata resta');
  const pro0 = riga(c, 'L1_4', 'La Svizzera accolse circa');
  assert.equal(pro0.corsia, 'fuori-contestata');
  assert.equal(riga(c, 'L1_4', 'Fino al 1943').corsia, 'senza');
  // 3 · pending aperta dal docente: origine «docente»
  const all = riga(c, 'L1_2_C3', 'Il valore di questo commercio');
  assert.equal(all.corsia, 'fuori-contestata'); assert.equal(all.origine, 'docente');
  // 1 · la frase riscritta dal docente resta come sua, anche se è organizzativa (1 viene prima di 4)
  assert.equal(riga(c, 'L1_1', 'Questa categoria descrive').corsia, 'docente');
  assert.equal(riga(c, 'L1_5_L2_A', 'Inoltre, la Svizzera è stata accusata').corsia, 'docente');
  // la vecchia frase del docente non c'è più: il db è quello CORRETTO
  assert.equal(riga(c, 'L1_5_L2_A', 'Inoltre, lo Stato'), undefined);
  // 5 · vicina; 6 · senza
  assert.equal(riga(c, 'L1_2_C2', 'La Germania era un partner').corsia, 'vicina');
  assert.ok(riga(c, 'L1_2_C2', 'La Germania era un partner').vicina.id.startsWith('ev-'));
  // un «Mantieni» non cambia niente: la frase resta e si giudica come le altre
  assert.ok(['vicina', 'senza'].includes(riga(c, 'ROOT', 'Durante la Seconda').corsia));
  // collegamento pending fuori; nessuna etichetta segnalata
  assert.deepEqual(c.linkEsclusi, [{ source: 'L1_3', target: 'L1_5_L2_A', rel: 'richiede', issueId: 'i-link' }]);
  assert.equal(c.etichetteSegnalate, 0);
  assert.deepEqual(c.modi, { manuale: 0, proposta: 0, citato: 2, sovrapposizione: 1, nodo: 0 });
  assert.deepEqual(c.superate, []);
  // 4 · di servizio, senza una decisione del docente davanti
  const c2 = A.corsie({ review: RC.setDecision(revisione({ decidi: false }), 'i-categoria', 'reject'), db });
  assert.equal(riga(c2, 'L1_1', 'Questa categoria descrive').corsia, 'servizio');
  // la mappa viva non si tocca
  assert.deepEqual(db, mappa());
});

test('corsie: il passo che non si ritrova — superato se una decisione presa ha cambiato la desc, altrimenti fuori il nodo', () => {
  // (a) il docente ha già riscritto quella frase (i-militare) senza riprenderne il passo: la segnalazione è
  // superata e non esclude niente. Con ACCUSE_DOCENTE, che lo riprende ancora (0,71), non lo sarebbe (giro 5, F1).
  const report = rapporto();
  report.issues.push({ id: 'i-accuse-pending', target: { kind: 'node', id: 'L1_5_L2_A', field: 'desc' },
    problem: '«Inoltre, lo Stato è accusato di aver aiutato la Germania fornendo materiale militare» non è nella fonte.' });
  const riscritta = () => RC.setDecision(revisione({ report }), 'i-militare', 'manual', { text: ACCUSE_RISCRITTA });
  const c = A.corsie({ review: riscritta(), db: mappa() });
  assert.equal(c.righe.filter(r => r.nodeId === 'L1_5_L2_A' && A.FUORI.includes(r.corsia)).length, 0);
  assert.deepEqual(c.superate, ['i-accuse-pending']);
  assert.equal(c.passiNonRitrovati, 1);
  const cRip = A.corsie({ review: revisione({ report }), db: mappa() });
  assert.deepEqual(cRip.superate, [], 'la frase del docente riprende ancora il passo: non è superata');
  assert.equal(riga(cRip, 'L1_5_L2_A', 'Inoltre, la Svizzera è stata accusata').corsia, 'fuori-contestata');
  const rec = A.record(riscritta(), mappa(), { adesso: ADESSO });
  assert.deepEqual(rec.superate, ['i-accuse-pending']);
  assert.equal(rec.conteggi.superate, 1, 'la ricevuta la conta');
  assert.equal(A.ricevuta(rec).conteggi.superate, 1);
  // (b) un passo di due frasi sopravvissuto a metà: esce la frase rimasta, e la segnalazione non è superata
  const repB = rapporto();
  repB.issues.push({ id: 'i-accuse-due', target: { kind: 'node', id: 'L1_5_L2_A', field: 'desc' },
    problem: '«Le critiche principali riguardano il rifiuto di accogliere migliaia di rifugiati ebrei» e «Inoltre, lo Stato è accusato di aver aiutato la Germania fornendo materiale militare» non sono nella fonte.' });
  const cB = A.corsie({ review: revisione({ report: repB }), db: mappa() });
  assert.equal(riga(cB, 'L1_5_L2_A', 'Le critiche principali').corsia, 'fuori-contestata');
  assert.equal(riga(cB, 'L1_5_L2_A', 'Le critiche principali').issueId, 'i-accuse-due');
  // giro 5 (F1): la frase militare del docente riprende ancora la seconda frase citata (0,71): esce anche lei
  assert.equal(riga(cB, 'L1_5_L2_A', 'Inoltre, la Svizzera è stata accusata').corsia, 'fuori-contestata');
  assert.equal(riga(cB, 'L1_5_L2_A', 'Inoltre, la Svizzera è stata accusata').ritoccata, true);
  assert.notEqual(riga(cB, 'L1_5_L2_A', 'La Svizzera è stata oggetto').corsia, 'fuori-contestata');
  assert.deepEqual(cB.superate, []);
  // con la riscrittura vera resta del docente: del passo è rimasta solo la prima frase citata
  const cB2 = A.corsie({ review: RC.setDecision(revisione({ report: repB }), 'i-militare', 'manual', { text: ACCUSE_RISCRITTA }), db: mappa() });
  assert.equal(riga(cB2, 'L1_5_L2_A', 'Per la fonte la Confederazione').corsia, 'docente');
  assert.equal(riga(cB2, 'L1_5_L2_A', 'Le critiche principali').corsia, 'fuori-contestata');
  // (c) giro 3, D1: il docente TOGLIE con «Modifica» la frase contestata, senza scriverne un'altra, e una seconda
  // segnalazione aperta cita la stessa frase. Il passo non c'è più e una decisione presa ha cambiato la desc:
  // la segnalazione è superata, e il resto del nodo resta nei materiali (prima usciva tutto il nodo)
  const repC = rapporto();
  repC.issues.push({ id: 'i-c2-taglio', target: { kind: 'node', id: 'L1_2_C2', field: 'desc' }, problem: 'Frase da togliere.' },
    { id: 'i-c2-pending', target: { kind: 'node', id: 'L1_2_C2', field: 'desc' },
      problem: 'La fonte non dice «Tra il 1940 e il 1944, la Germania è stata il paese che ha comprato più prodotti svizzeri».' });
  const C2 = mappa().nodes[3].desc;
  const TOLTA = 'Tra il 1940 e il 1944, la Germania è stata il paese che ha comprato più prodotti svizzeri.';
  const rC = RC.setDecision(revisione({ report: repC }), 'i-c2-taglio', 'manual', { text: C2.replace(TOLTA + ' ', '') });
  assert.equal(RC.decisionOutcome(rC.initial.issues.find(i => i.id === 'i-c2-taglio'), rC.initial.decisions['i-c2-taglio']), 'edited');
  const cC = A.corsie({ review: rC, db: mappa() });
  const righeC2 = cC.righe.filter(r => r.nodeId === 'L1_2_C2');
  assert.equal(righeC2.length, 2);
  righeC2.forEach(r => { assert.equal(A.FUORI.includes(r.corsia), false, r.testo); assert.equal(r.issueId, null); });
  assert.equal(righeC2.some(r => r.corsia === 'docente'), false, 'nessuna frase nuova: il nodo non ha testo del docente');
  assert.deepEqual(cC.superate, ['i-c2-pending']);
  assert.equal(cC.esitiSegnalazioni['i-c2-pending'], 'superata');
  const recC = A.record(rC, mappa(), { adesso: ADESSO });
  assert.equal(recC.completo, true, recC.motivo);
  assert.equal(recC.escluse.some(e => e.nodeId === 'L1_2_C2'), false, 'il resto del nodo resta nei materiali');
  assert.equal(recC.svuotati.includes('L1_2_C2'), false);
  assert.equal(recC.conteggi.superate, 1, 'la ricevuta la conta');
  const vistaC = A.vistaDb(A.correggi(rC, mappa()).db, recC).nodes.find(n => n.id === 'L1_2_C2');
  assert.ok(!vistaC.desc.includes(TOLTA) && /partner commerciale/.test(vistaC.desc) && /macchinari/.test(vistaC.desc));
  // (d) nessuna decisione ha cambiato la desc e il passo non si ritrova (qui: la mappa passata alle corsie non è
  // quella della segnalazione — il record la rifiuterebbe prima, «mappa_cambiata»): non si sa dove sia finito, esce il nodo
  const repD = rapporto();
  repD.issues.push({ id: 'i-c2-pending', target: { kind: 'node', id: 'L1_2_C2', field: 'desc' },
    problem: 'La fonte non dice «Tra il 1940 e il 1944, la Germania è stata il paese che ha comprato più prodotti svizzeri».' });
  const altrove = mappa(); altrove.nodes[3].desc = C2.replace(TOLTA, 'Tra il 1940 e il 1944 la Germania comprò molti prodotti svizzeri.');
  const cD = A.corsie({ review: revisione({ report: repD }), db: altrove });
  const righeD = cD.righe.filter(r => r.nodeId === 'L1_2_C2');
  assert.equal(righeD.length, 3);
  righeD.forEach(r => { assert.equal(r.corsia, 'fuori-contestata'); assert.equal(r.modo, 'nodo'); });
  assert.deepEqual(cD.superate, []);
});

test('corsie: il testo del docente resta nei nodi non esaminati e sotto una segnalazione \'nodo\', anche quando riprende la desc base (giro 6, G1)', () => {
  const rep = rapporto();
  // L1_3 non è stato esaminato, ma il docente ne ha corretto una frase
  rep.issues.push({ id: 'i-oro-docente', target: { kind: 'node', id: 'L1_3', field: 'desc' }, problem: 'Rapina: la fonte parla di oro sottratto alle vittime dei campi.' });
  // su L1_5_L2_A una segnalazione aperta che non si localizza: esce il nodo, tranne il testo del docente
  rep.issues.push({ id: 'i-accuse-vaga', target: { kind: 'node', id: 'L1_5_L2_A', field: 'desc' }, problem: 'Tono troppo netto.' });
  let r = RC.setDecision(revisione({ report: rep }), 'i-militare', 'manual', { text: ACCUSE_RISCRITTA });
  const ORO = mappa().nodes[5].desc;
  r = RC.setDecision(r, 'i-oro-docente', 'manual', { text: ORO.replace('Parte di questo oro era frutto di rapina.', 'Parte di questo oro era stato sottratto alle vittime dei campi di concentramento.') });
  const c = A.corsie({ review: r, db: mappa() });
  assert.equal(riga(c, 'L1_3', 'Parte di questo oro era stato sottratto').corsia, 'docente');
  assert.equal(riga(c, 'L1_3', 'La Banca Nazionale').corsia, 'fuori-non-esaminata');
  assert.equal(c.modi.nodo, 1);
  c.righe.filter(r => r.nodeId === 'L1_5_L2_A').forEach(x => {
    if (x.testo.startsWith('Per la fonte la Confederazione')) assert.equal(x.corsia, 'docente');
    else assert.equal(x.corsia, 'fuori-contestata');
  });
  const rec = A.record(r, mappa(), { adesso: ADESSO });
  assert.equal(rec.completo, true);
  assert.deepEqual(rec.svuotati, [], 'un nodo con una frase del docente che non riprende la desc base non si svuota');
  assert.equal(rec.escluse.some(e => /sottratto alle vittime|rifornimenti al Reich/.test(e.testo)), false);
  assert.equal(rec.conteggi.docente, 3);
  // giro 6 (G1): la frase ritoccata dal docente che riprende ancora una frase base (ACCUSE_DOCENTE, 0,71)
  // RESTA — il Giudice non ha detto quale frase contesta, e la quarantena si fida del testo del docente.
  // (Col giro 5, F2, usciva anche lei e il nodo si svuotava.)
  const r2 = RC.setDecision(r, 'i-militare', 'manual', { text: ACCUSE_DOCENTE });
  const c2 = A.corsie({ review: r2, db: mappa() });
  const doc = riga(c2, 'L1_5_L2_A', 'Inoltre, la Svizzera è stata accusata');
  assert.ok(A.contenimento('Inoltre, lo Stato è accusato di aver aiutato la Germania fornendo materiale militare.', doc.testo) >= A.CONTENIMENTO,
    'il caso è quello vero: la frase del docente riprende la frase base');
  assert.equal(doc.corsia, 'docente');
  assert.ok(!doc.ritoccata);
  c2.righe.filter(x => x.nodeId === 'L1_5_L2_A' && x !== doc).forEach(x => assert.equal(x.corsia, 'fuori-contestata', x.testo));
  assert.equal(c2.esitiSegnalazioni['i-accuse-vaga'], 'fuori');
  const rec2 = A.record(r2, mappa(), { adesso: ADESSO });
  assert.deepEqual(rec2.svuotati, [], 'il nodo non si svuota: resta la frase del docente');
  assert.equal(rec2.escluse.some(e => /Inoltre, la Svizzera è stata accusata/.test(e.testo)), false);
  // la frase di L1_3 (nodo non esaminato) resta del docente: la corsia 1 vince sulla 2
  assert.equal(riga(c2, 'L1_3', 'Parte di questo oro era stato sottratto').corsia, 'docente');
  // la controparte (F1, resta com'è): con un passo INDIVIDUATO — qui citato fra virgolette — la stessa
  // frase del docente, che lo riprende per contenimento, esce
  const rep3 = rapporto();
  rep3.issues.push({ id: 'i-accuse-citata', target: { kind: 'node', id: 'L1_5_L2_A', field: 'desc' },
    problem: 'La fonte non dice «Inoltre, lo Stato è accusato di aver aiutato la Germania fornendo materiale militare».' });
  const c3 = A.corsie({ review: revisione({ report: rep3 }), db: mappa() });
  const doc3 = riga(c3, 'L1_5_L2_A', 'Inoltre, la Svizzera è stata accusata');
  assert.equal(doc3.corsia, 'fuori-contestata');
  assert.equal(doc3.ritoccata, true);
  assert.equal(c3.esitiSegnalazioni['i-accuse-citata'], 'ritoccata');
  // e con le due segnalazioni aperte sullo stesso nodo, in qualunque ordine, vince quella che sa che cosa contesta
  [['i-accuse-vaga', 'i-accuse-citata'], ['i-accuse-citata', 'i-accuse-vaga']].forEach(ordine => {
    const rep4 = rapporto();
    ordine.forEach(id => rep4.issues.push(id === 'i-accuse-vaga'
      ? { id, target: { kind: 'node', id: 'L1_5_L2_A', field: 'desc' }, problem: 'Tono troppo netto.' }
      : rep3.issues.find(i => i.id === 'i-accuse-citata')));
    const c4 = A.corsie({ review: revisione({ report: rep4 }), db: mappa() });
    const doc4 = riga(c4, 'L1_5_L2_A', 'Inoltre, la Svizzera è stata accusata');
    assert.equal(doc4.corsia, 'fuori-contestata', ordine.join(' → '));
    assert.equal(doc4.issueId, 'i-accuse-citata', ordine.join(' → '));
  });
});

test('copertura: un nodo è esaminato se l\'ha letto almeno un giro di questa revisione; la ricevuta dice quanti vengono da giri precedenti', () => {
  // primo giro: tutti e otto i nodi letti (contratto vecchio, senza `contratto`); secondo giro: L1_3 saltato
  const primo = rapporto({ contratto: undefined, copertura: { nodiTotali: 8, nodiEsaminati: ESAMINATI.concat(['L1_3']), nodiSaltati: [] } });
  delete primo.contratto;
  const r1 = RC.createReview({ db: mappa(), sources: SOURCES, report: primo, generationId: 'gen-svizzera' });
  const r2 = RC.createReview({ db: mappa(), sources: SOURCES, report: rapporto(), generationId: 'gen-svizzera' });
  const unita = RC.mergeRetry(r1, r2);
  assert.equal(unita.initial.previousReports.length, 1);
  const cop = A.copertura(unita, mappa());
  assert.deepEqual(cop.nonEsaminati, []);
  assert.deepEqual(cop.daGiriPrecedenti, ['L1_3']);
  assert.equal(cop.giri, 2);
  // ora la segnalazione pending su L1_3 esce per il suo passo, non per la copertura
  const c = A.corsie({ review: unita, db: mappa() });
  assert.equal(c.righe.filter(x => x.corsia === 'fuori-non-esaminata').length, 0);
  const rec = A.record(unita, mappa(), { adesso: ADESSO });
  assert.equal(rec.conteggi.esaminatiDaGiriPrecedenti, 1);
  assert.equal(A.ricevuta(rec).conteggi.esaminatiDaGiriPrecedenti, 1);
  assert.deepEqual(rec.nonEsaminati, []);
  // un giro senza `copertura` non dice che cosa ha letto; un giro @2 senza `nodiEsaminati` nemmeno
  const muto = Object.assign({}, r2, { initial: Object.assign({}, r2.initial, { previousReports: [{ stato: 'parziale', rami: 3 }] }) });
  assert.deepEqual(A.copertura(muto, mappa()).nonEsaminati, ['L1_3']);
  const v2vuoto = Object.assign({}, r2, { initial: Object.assign({}, r2.initial, { report: { contratto: 'mappai-giudice@2', copertura: { nodiSaltati: [] } } }) });
  assert.equal(A.copertura(v2vuoto, mappa()).esaminati.length, 0);
  // un giro vecchio senza `nodiEsaminati`: conta chi non è fra i saltati
  const vecchio = Object.assign({}, r2, { initial: Object.assign({}, r2.initial, { report: { copertura: { nodiSaltati: [{ id: 'L1_4' }] } } }) });
  assert.deepEqual(A.copertura(vecchio, mappa()).nonEsaminati, ['L1_4']);
  // nessun giro: nessun nodo esaminato
  const nessuno = Object.assign({}, r2, { initial: Object.assign({}, r2.initial, { report: null, previousReports: [] }) });
  assert.equal(A.copertura(nessuno, mappa()).rapporto, false);
});

test('coesione: sulle coppie misurate in Svizzera, a cascata, solo dopo un\'esclusione, mai sulla frase del docente', () => {
  const r = (nodeId, testo, corsia) => ({ nodeId, testo, corsia, origine: corsia.startsWith('fuori') ? 'giudice' : corsia === 'docente' ? 'docente' : null, issueId: corsia.startsWith('fuori') ? 'i1' : null });
  const righe = [
    r('L1_2_L2_B', 'Il sistema di razionamento è un metodo di distribuzione controllata del cibo.', 'fuori-contestata'),
    r('L1_2_L2_B', 'Questo sistema è stato introdotto all\'interno del piano Wahlen per gestire le scorte limitate.', 'senza'),
    r('L1_2_L2_B', 'Per far funzionare questo meccanismo, lo Stato ha chiesto alla popolazione di fare scorta di cibo.', 'senza'),
    r('L1_0_L2_B_D1', 'La Svizzera ha accolto circa 300.000 persone in fuga dalla guerra.', 'fuori-contestata'),
    r('L1_0_L2_B_D1', 'Queste persone sono i profughi, cioè individui che devono lasciare il proprio paese.', 'vicina'),
    r('L1_0_L2_B_D1', 'Tale condizione durò fino alla fine del conflitto.', 'senza'),
    r('L1_0_L2_B_D1', 'Questa politica di asilo fu influenzata dal timore di un\'invasione.', 'docente'),
    r('L1_0_L2_B_D1', 'Tale timore svanì solo nel 1944.', 'senza'),
    r('L1_2_L2_A', 'Il piano Wahlen è un progetto iniziato nel 1939 per garantire il cibo agli svizzeri.', 'senza'),
    r('L1_2_L2_A', 'Questo piano prevedeva l\'estensione della campicoltura.', 'senza')
  ];
  assert.equal(A.coesione(righe), 3);
  assert.equal(righe[1].corsia, 'fuori-coesione'); assert.equal(righe[1].issueId, 'i1');
  assert.equal(righe[2].corsia, 'senza', '«Per far funzionare» non è un\'anafora');
  assert.equal(righe[4].corsia, 'fuori-coesione');
  assert.equal(righe[5].corsia, 'fuori-coesione', 'a cascata: «Tale condizione» riprende la frase appena uscita');
  assert.equal(righe[6].corsia, 'docente', 'la frase del docente resta anche se comincia con un\'anafora');
  assert.equal(righe[7].corsia, 'senza', 'e interrompe la catena: la frase dopo non riprende più un\'esclusione');
  assert.equal(righe[9].corsia, 'senza', 'un\'anafora senza esclusione davanti resta');
  // nella corsia vera la coppia del razionamento esce per coesione quando il problema cita la prima frase e non
  // ripete la seconda (con il problema del rapporto vero, che la ripete, dal giro 2 esce come contestata: test sotto)
  const rep = rapporto();
  rep.issues[0] = Object.assign({}, rep.issues[0], { problem: '«Il sistema di razionamento è un metodo di distribuzione controllata del cibo» non è nella fonte.' });
  const c = A.corsie({ review: revisione({ report: rep }), db: mappa() });
  assert.equal(riga(c, 'L1_2_L2_B', 'Il sistema di razionamento').corsia, 'fuori-contestata');
  assert.equal(riga(c, 'L1_2_L2_B', 'Questo sistema').corsia, 'fuori-coesione');
  assert.equal(c.coesione, 1);
  const vero = A.corsie({ review: revisione(), db: mappa() });
  assert.equal(riga(vero, 'L1_2_L2_B', 'Questo sistema').corsia, 'fuori-contestata');
  assert.equal(vero.coesione, 0);
});

/* ── la vista ────────────────────────────────────────────────────────────── */
test('vistaDb: stesso riferimento senza esclusioni; desc e content tolti per sottostringa, con elenchi e $$…$$; lancia se la frase non c\'è', () => {
  const db = mappa();
  assert.equal(A.vistaDb(db, null), db);
  assert.equal(A.vistaDb(db, { escluse: [], linkEsclusi: [], causalDocScartato: false }), db);
  const DESC = 'Premessa del circuito.\n- La legge di Ohm: $$V = R \\cdot I$$ vale per i conduttori.\n- La potenza vale $$P = V I$$ in watt.\nFine del paragrafo.';
  const f = A.affermazioni(DESC).map(a => a.testo);
  assert.deepEqual(f, ['Premessa del circuito.', '- La legge di Ohm: $$V = R \\cdot I$$ vale per i conduttori.', '- La potenza vale $$P = V I$$ in watt.', 'Fine del paragrafo.']);
  const fis = { nodes: [{ id: 'n', label: 'Circuito', desc: DESC, content: DESC }, { id: 'm', label: 'Altro', desc: 'Resta com\'è.' }],
    links: [{ source: 'n', target: 'm', rel: 'causa' }, { source: 'm', target: 'n', rel: 'include' }], causalDoc: { sections: [] } };
  const v = A.vistaDb(fis, { escluse: [{ nodeId: 'n', testo: f[2] }], linkEsclusi: [{ source: 'n', target: 'm', rel: 'causa' }], causalDocScartato: true });
  assert.notEqual(v, fis);
  assert.equal(v.nodes[0].desc, 'Premessa del circuito.\n- La legge di Ohm: $$V = R \\cdot I$$ vale per i conduttori.\nFine del paragrafo.');
  assert.equal(v.nodes[0].content, v.nodes[0].desc);
  assert.equal(v.nodes[1], fis.nodes[1], 'gli altri nodi restano gli stessi riferimenti');
  assert.deepEqual(v.links, [{ source: 'm', target: 'n', rel: 'include' }]);
  assert.equal('causalDoc' in v, false);
  assert.equal(fis.nodes[0].desc, DESC, 'il db di partenza non cambia'); assert.ok(fis.causalDoc);
  // l'ultima frase: si mangia lo spazio prima
  assert.equal(A.vistaDb(fis, { escluse: [{ nodeId: 'n', testo: f[3] }] }).nodes[0].desc.endsWith('in watt.'), true);
  // tutte le frasi: il nodo si svuota, content compreso
  const vuoto = A.vistaDb(fis, { escluse: f.map(t => ({ nodeId: 'n', testo: t })) }).nodes[0];
  assert.equal(vuoto.desc, ''); assert.equal(vuoto.content, '');
  // una frase che non si ritrova (o un nodo che non c'è) fa lanciare
  assert.throws(() => A.vistaDb(fis, { escluse: [{ nodeId: 'n', testo: 'Una frase che non c\'è.' }] }), /frase_esclusa_non_trovata/);
  assert.throws(() => A.vistaDb(fis, { escluse: [{ nodeId: 'zz', testo: f[0] }] }), /frase_esclusa_non_trovata/);
  // una sottostringa dentro un'altra frase non conta: deve stare a un confine
  assert.throws(() => A.vistaDb(fis, { escluse: [{ nodeId: 'n', testo: 'circuito.' }] }), /frase_esclusa_non_trovata/);
});

/* ── il record, la firma, il cancello ────────────────────────────────────── */
test('record: completo sulla mappa di Svizzera, con escluse, conteggi, svuotati e firma; la vista si costruisce', () => {
  const review = revisione(), db = mappa();
  const rec = A.record(review, db, { adesso: ADESSO });
  assert.equal(rec.schema, 'mappai-quarantena@1');
  assert.equal(rec.completo, true); assert.equal(rec.motivo, '');
  assert.equal(rec.baseRevision, review.baseRevision);
  assert.equal(rec.firma, A.firma(review, db, db.causalDoc));
  assert.equal(rec.etichetteSegnalate, 0);
  assert.ok(rec.frasiFonte > 0);
  assert.equal(rec.data, ADESSO);
  assert.deepEqual(rec.svuotati, ['L1_3']);
  assert.deepEqual(rec.nonEsaminati, ['L1_3']);
  assert.equal(rec.causalDocScartato, false);
  assert.ok(rec.escluse.every(e => ['nodeId', 'testo', 'corsia', 'origine', 'issueId'].every(k => k in e)));
  assert.equal(rec.conteggi.fuori.nonEsaminate, 2);
  // giro 2: «Questo sistema…» ripete il problema del razionamento, ed esce come contestata, non più per coesione
  assert.equal(rec.conteggi.fuori.coesione, 0);
  assert.equal(rec.conteggi.fuori.totale, rec.escluse.length);
  assert.ok(rec.conteggi.caratteri.tenuti < rec.conteggi.caratteri.totali);
  // la vista: la frase pending manca, la rettifica del docente c'è, la mappa viva no
  const cor = A.correggi(review, db);
  const vista = A.vistaDb(cor.db, rec);
  const acc = vista.nodes.find(n => n.id === 'L1_5_L2_A').desc;
  assert.ok(acc.includes('rifornendo la Germania di materiale militare'));
  assert.ok(!vista.nodes.find(n => n.id === 'L1_2_L2_B').desc.includes('Il sistema di razionamento è un metodo'));
  assert.equal(vista.nodes.find(n => n.id === 'L1_3').desc, '');
  assert.equal(vista.links.some(l => l.source === 'L1_3' && l.target === 'L1_5_L2_A'), false);
  assert.ok(cor.overrides.some(o => o.issueId === 'i-militare' && o.choice === 'manual'));
  assert.equal(db.nodes.find(n => n.id === 'L1_5_L2_A').desc, ACCUSE);
  // regge il salvataggio in pipeline.json
  assert.deepEqual(JSON.parse(JSON.stringify(rec)), rec);
});

test('record: ogni via d\'uscita è un record incompleto col motivo', () => {
  const review = revisione(), db = mappa();
  const motivo = (r, d, o) => A.record(r, d, Object.assign({ adesso: ADESSO }, o)).motivo;
  assert.equal(motivo(null, db), 'revisione_non_valida');
  assert.equal(motivo(Object.assign({}, review, { initial: Object.assign({}, review.initial, { status: 'approved' }) }), db), 'revisione_non_in_attesa');
  assert.equal(motivo(review, { items: [] }), 'mappa_non_valida');
  const cambiata = mappa(); cambiata.nodes[0].desc += ' Una frase in più.';
  assert.equal(motivo(review, cambiata), 'mappa_cambiata');
  assert.equal(motivo(revisione({ report: null, decidi: false }), db), 'rapporto_assente');
  assert.equal(motivo(revisione({ report: rapporto({ copertura: { nodiEsaminati: [], nodiSaltati: [] } }) }), db), 'controllo_non_disponibile');
  assert.equal(motivo(revisione({ sources: [] }), db), 'fonte_vuota');
  const inv = A.invalido('spento', review, { adesso: ADESSO });
  assert.equal(inv.completo, false); assert.equal(inv.motivo, 'spento'); assert.equal(inv.baseRevision, review.baseRevision);
  assert.equal(A.ricevuta(inv), null);
});

test('firma: cambia con le decisioni, con la mappa, con il documento dei nessi; regge il JSON', () => {
  const review = revisione(), db = mappa();
  const f = A.firma(review, db, null);
  assert.equal(A.firma(JSON.parse(JSON.stringify(review)), JSON.parse(JSON.stringify(db)), null), f);
  assert.notEqual(A.firma(RC.setDecision(review, 'i-razionamento', 'reject'), db, null), f);
  const altra = mappa(); altra.nodes[1].desc = DIFESA_DOCENTE;
  assert.notEqual(A.firma(review, altra, null), f);
  assert.notEqual(A.firma(review, db, { sections: [{ id: 'root', kind: 'root', rows: [] }] }), f);
});

test('firma (giro 3, D6): cambia con la copertura del Giudice — un «Riprova» che allarga i nodi esaminati, con le stesse segnalazioni', () => {
  const db = mappa(), r0 = revisione();   // L1_3 «Finanza Internazionale» non esaminato
  const rec0 = A.record(r0, db, { adesso: ADESSO });
  assert.equal(rec0.completo, true, rec0.motivo);
  assert.deepEqual(rec0.nonEsaminati, ['L1_3']);
  // il ricontrollo esamina anche L1_3 e non trova niente di nuovo: issues e decisioni restano le stesse
  const piu = rapporto({ copertura: { nodiTotali: 8, nodiEsaminati: ESAMINATI.concat('L1_3'), nodiSaltati: [] } });
  const r1 = RC.mergeRetry(r0, RC.createReview({ db, sources: SOURCES, report: piu, generationId: 'gen-svizzera' }));
  assert.deepEqual(r1.initial.issues, r0.initial.issues, 'stesse segnalazioni');
  assert.deepEqual(r1.initial.decisions, r0.initial.decisions, 'stesse decisioni');
  const rec1 = A.record(r1, db, { adesso: ADESSO });
  assert.deepEqual(rec1.nonEsaminati, []);
  assert.notEqual(A.firma(r1, db, null), A.firma(r0, db, null), 'la copertura sta nella firma');
  assert.notEqual(rec1.firma, rec0.firma, 'le bozze nate col record vecchio non valgono più');
  // il record vecchio non apre più il cancello, quello nuovo sì
  assert.equal(A.consente(Object.assign({}, r1, { quarantena: rec0 }), db), null);
  assert.deepEqual(A.consente(Object.assign({}, r1, { quarantena: rec1 }), db), { allowed: true, reason: 'quarantine', quarantine: true });
  // un ricontrollo che non allarga l'unione (esamina solo nodi già letti) lascia la firma com'era
  const meno = rapporto({ copertura: { nodiTotali: 8, nodiEsaminati: ['ROOT'], nodiSaltati: [] } });
  const r2 = RC.mergeRetry(r1, RC.createReview({ db, sources: SOURCES, report: meno, generationId: 'gen-svizzera' }));
  assert.equal(A.firma(r2, db, null), A.firma(r1, db, null));
});

test('consente: {allowed, reason, quarantine} solo con un record completo e fresco; null in ogni altro caso', () => {
  const db = mappa();
  const base = revisione();
  const conRecord = r => Object.assign({}, r, { quarantena: A.record(r, db, { adesso: ADESSO }) });
  const buona = conRecord(base);
  assert.deepEqual(A.consente(buona, db), { allowed: true, reason: 'quarantine', quarantine: true });
  assert.deepEqual(A.consente(JSON.parse(JSON.stringify(buona)), JSON.parse(JSON.stringify(db))), { allowed: true, reason: 'quarantine', quarantine: true });
  assert.deepEqual(A.consente(buona, db, buona.sources), { allowed: true, reason: 'quarantine', quarantine: true });
  // senza record
  assert.equal(A.consente(base, db), null);
  // stantio: il record viene da un'altra base
  assert.equal(A.consente(Object.assign({}, buona, { quarantena: Object.assign({}, buona.quarantena, { baseRevision: 'r1-altra' }) }), db), null);
  // il db non è più quello della base (una modifica sulla tela)
  const tela = mappa(); tela.nodes[2].desc = RAZIONAMENTO.replace('controllata', 'equa');
  assert.equal(A.consente(buona, tela), null);
  // firma diversa: una decisione cambiata dopo il record
  assert.equal(A.consente(Object.assign(RC.setDecision(base, 'i-razionamento', 'reject'), { quarantena: buona.quarantena }), db), null);
  // stato 'applying' e 'approved'
  assert.equal(A.consente(Object.assign({}, buona, { initial: Object.assign({}, buona.initial, { status: 'applying' }) }), db), null);
  // G2 passa {items}
  assert.equal(A.consente(buona, { items: [] }), null);
  // record incompleto
  assert.equal(A.consente(Object.assign({}, buona, { quarantena: Object.assign({}, buona.quarantena, { completo: false }) }), db), null);
  // controllo non disponibile
  assert.equal(A.consente(Object.assign({}, buona, { initial: Object.assign({}, buona.initial, { checkStatus: 'unavailable' }) }), db), null);
  // nessun nodo esaminato, nessun rapporto
  const cieca = conRecord(revisione({ report: rapporto({ copertura: { nodiEsaminati: [], nodiSaltati: [] } }) }));
  assert.equal(A.consente(cieca, db), null);
  assert.equal(A.consente(Object.assign({}, buona, { initial: Object.assign({}, buona.initial, { report: null }) }), db), null);
  // un'etichetta segnalata
  const rep = rapporto(); rep.issues.push({ id: 'i-etichetta', target: { kind: 'node', id: 'L1_4', field: 'label' }, problem: 'Etichetta imprecisa.' });
  const etichetta = conRecord(revisione({ report: rep }));
  assert.equal(etichetta.quarantena.etichetteSegnalate, 1); assert.equal(etichetta.quarantena.completo, true);
  assert.equal(A.consente(etichetta, db), null);
  // fonte vuota
  const muta = conRecord(revisione({ sources: [] }));
  assert.equal(muta.quarantena.motivo, 'fonte_vuota');
  assert.equal(A.consente(muta, db), null);
  assert.equal(A.consente(Object.assign({}, buona, { quarantena: Object.assign({}, buona.quarantena, { frasiFonte: 0 }) }), db), null);
  // conflitto di preview: due decisioni che riscrivono la stessa frase in due modi
  const repC = rapporto();
  repC.issues.push({ id: 'i-c1', target: { kind: 'node', id: 'L1_2_C2', field: 'desc' }, problem: 'Uno.' },
    { id: 'i-c2', target: { kind: 'node', id: 'L1_2_C2', field: 'desc' }, problem: 'Due.' });
  let conf = revisione({ report: repC });
  const C2 = mappa().nodes[3].desc;
  conf = RC.setDecision(conf, 'i-c1', 'manual', { text: C2.replace('molto importante', 'importante') });
  conf = RC.setDecision(conf, 'i-c2', 'manual', { text: C2.replace('molto importante', 'decisivo') });
  assert.equal(A.correggi(conf, db).ok, false);
  const recConf = A.record(conf, db, { adesso: ADESSO });
  assert.equal(recConf.motivo, 'conflitti');
  const forzato = Object.assign({}, conf, { quarantena: Object.assign({}, buona.quarantena, { firma: A.firma(conf, db, db.causalDoc) }) });
  assert.equal(A.consente(forzato, db), null, 'anche con un record che sembra buono');
  // revisione non valida
  assert.equal(A.consente(null, db), null);
  assert.equal(A.consente({ schema: 'altro' }, db), null);
});

test('completo: delega a PipelineCore.isComplete, con G1 in attesa contato come approvato', () => {
  const steps = { A: { status: 'done', files: [] }, B: { status: 'done', files: [] }, C: { status: 'skipped', files: [] },
    D: { status: 'skipped', files: [] }, E: { status: 'skipped', files: [] } };
  const manifest = { schema: PC.SCHEMA, config: {}, steps, review: { schema: RC.SCHEMA, initial: { status: 'awaiting_review' } } };
  assert.equal(PC.isComplete(manifest), false, 'oggi: G1 in attesa, pipeline da riprendere');
  assert.equal(A.completo(manifest), true, 'con la quarantena: G1 facoltativo');
  assert.equal(manifest.review.initial.status, 'awaiting_review', 'il manifesto non cambia');
  const aperto = JSON.parse(JSON.stringify(manifest)); aperto.steps.B.status = 'pending';
  assert.equal(A.completo(aperto), false);
  // delega vera: la risposta è quella di PC.isComplete, letto al momento della chiamata
  const originale = PC.isComplete, visti = [];
  try {
    PC.isComplete = m => { visti.push(m.review ? m.review.initial.status : null); return 'da-PC'; };
    assert.equal(A.completo(manifest), 'da-PC');
    assert.equal(A.completo({ steps }), 'da-PC');
  } finally { PC.isComplete = originale; }
  assert.deepEqual(visti, ['approved', null]);
});

test('ricevuta: null senza un record completo; con il record, che cosa è passato e perché', () => {
  assert.equal(A.ricevuta(null), null);
  assert.equal(A.ricevuta({ schema: 'mappai-quarantena@1', completo: false }), null);
  assert.equal(A.ricevuta({ schema: 'altro', completo: true }), null);
  const review = revisione(), rec = A.record(review, mappa(), { adesso: ADESSO });
  const r = A.ricevuta(rec);
  assert.equal(r.revision, review.baseRevision); assert.equal(r.firma, rec.firma);
  assert.deepEqual(r.conteggi, rec.conteggi); assert.notEqual(r.conteggi, rec.conteggi);
  assert.equal(r.escluse.length, rec.escluse.length);
  // giro 7 (H9): per ogni frase esclusa anche la segnalazione, il modo, la via e se era testo del docente
  assert.deepEqual(Object.keys(r.escluse[0]).sort(), ['corsia', 'issueId', 'modo', 'nodeId', 'origine', 'ritoccata', 'testo', 'via']);
  assert.deepEqual(r.svuotati, ['L1_3']); assert.equal(r.data, ADESSO);
});

/* ── Packet 0042, giro 7 del 26/09 ────────────────────────────────────────── */
test('ricevuta (giro 7, H9): ogni frase esclusa con segnalazione, modo, via e ritoccata; le segnalazioni superate e senza effetto con l\'esito', () => {
  // una segnalazione superata (il docente ha riscritto la frase militare senza riprenderne il passo),
  // una in modo 'nodo' su un nodo di solo testo del docente, e la frase ritoccata che esce (i-accuse-citata)
  const report = rapporto();
  report.issues.push({ id: 'i-accuse-pending', target: { kind: 'node', id: 'L1_5_L2_A', field: 'desc' },
    problem: '«Inoltre, lo Stato è accusato di aver aiutato la Germania fornendo materiale militare» non è nella fonte.' },
    { id: 'i-difesa-vaga', target: { kind: 'node', id: 'L1_1', field: 'desc' }, problem: 'Tono troppo netto' });
  let rv = RC.setDecision(revisione({ report }), 'i-militare', 'manual', { text: ACCUSE_RISCRITTA });
  rv = RC.setDecision(rv, 'i-categoria', 'manual', { text: 'La Confederazione difese i confini con l\'esercito di milizia. Il generale fu scelto dal Parlamento nel 1939.' });
  const rec = A.record(rv, mappa(), { adesso: ADESSO });
  assert.equal(rec.completo, true, rec.motivo);
  assert.equal(rec.regole, A.REGOLE);
  assert.deepEqual(rec.segnalazioniSenzaEffetto, [{ issueId: 'i-accuse-pending', esito: 'superata' }, { issueId: 'i-difesa-vaga', esito: 'docente' }]);
  const r = A.ricevuta(rec);
  assert.equal(r.regole, A.REGOLE);
  assert.deepEqual(r.segnalazioniSenzaEffetto, rec.segnalazioniSenzaEffetto);
  assert.notEqual(r.segnalazioniSenzaEffetto, rec.segnalazioniSenzaEffetto, 'una copia');
  rec.escluse.forEach((e, k) => {
    const x = r.escluse[k];
    assert.deepEqual([x.nodeId, x.testo, x.corsia, x.origine, x.issueId, x.modo, x.via, x.ritoccata],
      [e.nodeId, e.testo, e.corsia, e.origine, e.issueId == null ? null : e.issueId, e.modo || null, e.via || null, !!e.ritoccata]);
  });
  const citata = r.escluse.find(e => e.nodeId === 'L1_2_L2_B');
  assert.deepEqual([citata.issueId, citata.modo, citata.via, citata.ritoccata], ['i-razionamento', 'citato', 'frammento', false]);
  // la frase ritoccata dal docente che riprende un passo citato ancora aperto: la ricevuta lo dice
  const rep3 = rapporto();
  rep3.issues.push({ id: 'i-accuse-citata', target: { kind: 'node', id: 'L1_5_L2_A', field: 'desc' },
    problem: 'La fonte non dice «Inoltre, lo Stato è accusato di aver aiutato la Germania fornendo materiale militare».' });
  const r3 = A.ricevuta(A.record(revisione({ report: rep3 }), mappa(), { adesso: ADESSO }));
  const ritoccata = r3.escluse.find(e => e.testo.startsWith('Inoltre, la Svizzera è stata accusata'));
  assert.deepEqual([ritoccata.issueId, ritoccata.modo, ritoccata.ritoccata], ['i-accuse-citata', 'citato', true]);
  assert.equal(A.ricevuta(A.invalido('spento', rv)), null);
  assert.deepEqual(A.invalido('spento', rv).segnalazioniSenzaEffetto, []);
});

test('REGOLE (giro 7, H8): la versione delle regole sta nella firma, nel record e nella ricevuta; un record nato con regole diverse non consente', () => {
  assert.match(A.REGOLE, /^mappai-quarantena-regole@\d+$/);
  const db = mappa(), rv = revisione();
  const rec = A.record(rv, db, { adesso: ADESSO });
  assert.equal(rec.regole, A.REGOLE);
  assert.equal(rec.firma, A.firma(rv, db, db.causalDoc, A.REGOLE));
  const vecchie = 'mappai-quarantena-regole@6';
  assert.notEqual(A.firma(rv, db, db.causalDoc, vecchie), rec.firma, 'le regole stanno nel valore firmato');
  const buona = Object.assign({}, rv, { quarantena: rec });
  assert.deepEqual(A.consente(buona, db), { allowed: true, reason: 'quarantine', quarantine: true });
  // un record scritto con le regole di prima: firma e versione diverse
  const vecchio = Object.assign({}, rec, { regole: vecchie, firma: A.firma(rv, db, db.causalDoc, vecchie) });
  assert.equal(A.consente(Object.assign({}, rv, { quarantena: vecchio }), db), null);
  // anche con la sola firma di prima (un record senza versione, come quelli del giro 6)
  const senzaVersione = Object.assign({}, rec, { firma: A.firma(rv, db, db.causalDoc, vecchie) });
  delete senzaVersione.regole;
  assert.equal(A.consente(Object.assign({}, rv, { quarantena: senzaVersione }), db), null);
  // e con la firma giusta ma la versione sbagliata
  assert.equal(A.consente(Object.assign({}, rv, { quarantena: Object.assign({}, rec, { regole: vecchie }) }), db), null);
});

/* ── giro di correzione 1 (26/09) ────────────────────────────────────────── */
test('copertura dei collegamenti: un verbo che nessun giro ha esaminato esce dai links della vista (Ridotto nazionale, «sfrutta»)', () => {
  const db = mappa();
  db.links.push({ source: 'L1_1', target: 'L1_4', rel: 'sfrutta' },          // elencato in ogni giro, mai esaminato
    { source: 'L1_2_C2', target: 'L1_2_C3', rel: 'precede' },                  // saltato nell'ultimo giro, esaminato in uno precedente
    { source: 'L1_4', target: 'L1_5_L2_A', rel: 'causa' },                     // mai esaminato, ma il docente ne ha riscritto il verbo
    { source: 'ROOT', target: 'L1_2_C2', rel: 'include' });                    // neutro: il Giudice non lo chiede
  const salta = rel => ({ source: rel[0], target: rel[1], rel: rel[2], motivo: 'tempo scaduto' });
  const SALTATI = [['L1_1', 'L1_4', 'sfrutta'], ['L1_4', 'L1_5_L2_A', 'causa'], ['L1_3', 'L1_5_L2_A', 'richiede']].map(salta);
  const primo = rapporto({ copertura: { nodiTotali: 8, nodiEsaminati: ESAMINATI.slice(), nodiSaltati: [],
    linkEsaminati: [{ source: 'L1_2_C2', target: 'L1_2_C3', rel: 'precede' }], linkSaltati: SALTATI } });
  const ultimo = rapporto();
  ultimo.copertura = Object.assign({}, ultimo.copertura, { linkEsaminati: [], linkSaltati: SALTATI.concat([salta(['L1_2_C2', 'L1_2_C3', 'precede'])]) });
  ultimo.issues.push({ id: 'i-rel', target: { kind: 'link', source: 'L1_4', target: 'L1_5_L2_A', rel: 'causa', field: 'rel' }, problem: 'Il verbo non è nella fonte.' });
  let r = RC.mergeRetry(RC.createReview({ db, sources: SOURCES, report: primo, generationId: 'g' }),
    RC.createReview({ db, sources: SOURCES, report: ultimo, generationId: 'g' }));
  r = RC.setDecision(r, 'i-rel', 'manual', { text: 'precede' });
  const c = A.corsie({ review: r, db });
  assert.deepEqual(c.conflitti, []);
  assert.deepEqual(c.linkEsclusi, [
    { source: 'L1_3', target: 'L1_5_L2_A', rel: 'richiede', issueId: 'i-link' },            // la segnalazione aperta, una volta sola
    { source: 'L1_1', target: 'L1_4', rel: 'sfrutta', issueId: null, origine: 'copertura' }
  ]);
  assert.equal(c.linkNonEsaminati, 1);
  const rec = A.record(r, db, { adesso: ADESSO });
  assert.equal(rec.completo, true);
  assert.equal(rec.conteggi.linkNonEsaminati, 1); assert.equal(rec.conteggi.linkEsclusi, 2);
  const vista = A.vistaDb(A.correggi(r, db).db, rec);
  assert.equal(vista.links.some(l => l.source === 'L1_1' && l.target === 'L1_4'), false);
  assert.ok(vista.links.some(l => l.source === 'L1_2_C2' && l.target === 'L1_2_C3' && l.rel === 'precede'));
  assert.ok(vista.links.some(l => l.source === 'L1_4' && l.target === 'L1_5_L2_A' && l.rel === 'precede'), 'il verbo del docente resta');
  assert.ok(vista.links.some(l => l.source === 'ROOT' && l.target === 'L1_2_C2'), 'il neutro resta');
  // un giro senza gli elenchi dei collegamenti non ne dice niente: nessuna esclusione per copertura
  assert.equal(A.corsie({ review: revisione(), db: mappa() }).linkNonEsaminati, 0);
  assert.deepEqual(A.copertura(revisione(), mappa()).linkNonEsaminati, []);
});

test('documento dei nessi: una riga da una frase esclusa lo scarta anche con i capi brevi; un nodo senza esclusioni no', () => {
  const CC = require(path.join(JS, 'mappai-causal-core.js'));
  const FONTE = [{ nome: 'f.pdf', pages: [{ n: 1, text: 'Durante la guerra la Svizzera introdusse il razionamento del cibo per tutta la popolazione civile e militare.' }] }];
  const base = () => ({ nodes: [{ id: 'ROOT', label: 'Svizzera', level: 0, desc: 'La Confederazione restò neutrale per tutta la durata del conflitto.' },
    { id: 'X', label: 'Economia di guerra', level: 1, desc: 'La guerra provocò la fame. Il razionamento del cibo valeva per tutta la popolazione.' },
    { id: 'Y', label: 'Razionamento', level: 1, desc: 'Il razionamento permise la sopravvivenza.' }],
    links: [{ source: 'ROOT', target: 'X', rel: 'include' }, { source: 'ROOT', target: 'Y', rel: 'include' }] });
  const conDoc = () => { const d = base(); d.causalDoc = CC.docFromChains(CC.buildChains({ nodes: d.nodes, links: d.links }), {}); return d; };
  const righe = conDoc().causalDoc.sections.flatMap(s => s.rows.map(x => [x.left, x.conn, x.right, x.origin]));
  assert.ok(righe.some(x => x[0] === 'La guerra' && x[2] === 'la fame' && x[3] === 'desc'), 'capi di 9 e 7 caratteri');
  const esito = problem => {
    const db = conDoc();
    const report = { contratto: 'mappai-giudice@2', stato: 'completo', copertura: { nodiEsaminati: ['ROOT', 'X', 'Y'], nodiSaltati: [] },
      issues: [{ id: 'i1', target: { kind: 'node', id: problem[0], field: 'desc' }, problem: problem[1] }] };
    const rv = RC.createReview({ db, sources: FONTE, report, generationId: 'g' });
    const rec = A.record(rv, db, { adesso: ADESSO });
    assert.equal(rec.completo, true, rec.motivo);
    return { rec, vista: A.vistaDb(A.correggi(rv, db).db, rec) };
  };
  // la frase «La guerra provocò la fame.» è contestata: il documento esce, il passo E ricostruisce dalla vista
  let e = esito(['X', 'La fonte non dice «La guerra provocò la fame».']);
  assert.deepEqual(e.rec.escluse.map(x => x.testo), ['La guerra provocò la fame.']);
  assert.equal(e.rec.causalDocScartato, true);
  assert.equal('causalDoc' in e.vista, false);
  // un'altra frase dello stesso nodo: il nodo ha esclusioni, e l'estrattore dei nessi spezza a modo suo → esce
  e = esito(['X', 'La fonte non dice «Il razionamento del cibo valeva per tutta la popolazione».']);
  assert.equal(e.rec.causalDocScartato, true);
  // un'esclusione in un nodo che nel documento non ha righe: il documento resta
  // (la regola vecchia sui capi di almeno 12 caratteri resta: «il razionamento» in una frase esclusa di
  // ROOT scarterebbe anche lui, per prudenza; qui la frase di ROOT non condivide capi con le righe)
  e = esito(['ROOT', 'La fonte non dice «La Confederazione restò neutrale per tutta la durata del conflitto».']);
  assert.deepEqual(e.rec.escluse.map(x => x.nodeId), ['ROOT']);
  assert.equal(e.rec.causalDocScartato, false);
  assert.ok(e.vista.causalDoc);
});

test('le righe escluse dicono come sono state localizzate: «nodo» quando il controllo non ha indicato la frase', () => {
  const rep = rapporto();
  rep.issues.push({ id: 'i-accuse-vaga', target: { kind: 'node', id: 'L1_5_L2_A', field: 'desc' }, problem: 'Tono troppo netto.' });
  const r = revisione({ report: rep });
  const c = A.corsie({ review: r, db: mappa() });
  assert.equal(riga(c, 'L1_2_L2_B', 'Il sistema di razionamento').modo, 'citato');
  assert.equal(riga(c, 'L1_4', 'La Svizzera accolse circa').modo, 'sovrapposizione');
  assert.equal(riga(c, 'L1_5_L2_A', 'La Svizzera è stata oggetto').modo, 'nodo');
  assert.equal(riga(c, 'L1_3', 'La Banca Nazionale').modo, null, 'non esaminata: nessuna segnalazione');
  assert.equal(riga(c, 'L1_2_L2_B', 'Questo sistema').modo, 'citato', 'giro 2: il passo citato si allarga alla frase che il problema ripete');
  const rec = A.record(r, mappa(), { adesso: ADESSO });
  assert.equal(rec.escluse.find(e => e.testo.startsWith('La Svizzera è stata oggetto')).modo, 'nodo');
  // il passo che non si ritrova in un nodo che nessuna decisione presa ha cambiato: esce il nodo, ed è «nodo»
  // (giro 3, D1: con una decisione che l'ha cambiato, anche solo togliendo, la segnalazione è superata — vedi sopra)
  const repC = rapporto();
  repC.issues.push({ id: 'i-c2-pending', target: { kind: 'node', id: 'L1_2_C2', field: 'desc' },
    problem: 'La fonte non dice «Tra il 1940 e il 1944, la Germania è stata il paese che ha comprato più prodotti svizzeri».' });
  const altrove = mappa();
  altrove.nodes[3].desc = altrove.nodes[3].desc.replace('Tra il 1940 e il 1944, la Germania', 'Negli anni di guerra la Germania');
  A.corsie({ review: revisione({ report: repC }), db: altrove }).righe.filter(x => x.nodeId === 'L1_2_C2').forEach(x => assert.equal(x.modo, 'nodo'));
});

/* ── giro 2 del 26/09 ────────────────────────────────────────────────────── */
test('passoContestato (giro 2): un problema intero che contesta due frasi le prende tutte e due — la data ripetuta e le parole', () => {
  // L1_1_L2_A di Svizzera: il problema contesta la data della nomina E la frase sulla carica
  const COMANDO = 'Il 30 agosto 1939 l\'Assemblea Federale ha nominato Henri Guisan Comandante in Capo dell\'Esercito Svizzero con il grado di Generale. ' +
    'Questa carica militare è speciale perché in Svizzera esiste solo durante i periodi di guerra per guidare le difese del Paese.';
  const issue = problem => ({ target: { kind: 'node', id: 'L1_1_L2_A', field: 'desc' }, before: COMANDO, after: null, hasProposal: false, problem });
  let p = A.passoContestato(issue('La fonte non indica la data del 30 agosto 1939 per la nomina di Guisan. Inoltre la descrizione afferma che questa carica militare esiste in Svizzera solo durante i periodi di guerra per guidare le difese del Paese, ma la fonte non lo dice.'));
  assert.equal(p.modo, 'sovrapposizione');
  assert.deepEqual(p.passi.map(x => x.testo), [COMANDO], 'la frase della data è dentro il passo');
  // la sola seconda obiezione: il passo resta sulla seconda frase (niente date, poche parole in comune con la prima)
  p = A.passoContestato(issue('La descrizione afferma che questa carica militare esiste in Svizzera solo durante i periodi di guerra per guidare le difese del Paese, ma la fonte non lo dice.'));
  assert.deepEqual(p.passi.map(x => x.testo.slice(0, 22)), ['Questa carica militare']);
  // anche per 'citato': la citazione prende la seconda frase, la data ripetuta porta dentro la prima
  p = A.passoContestato(issue('La fonte non dice «questa carica militare è speciale perché in Svizzera esiste solo durante i periodi di guerra», e nemmeno il 30 agosto 1939.'));
  assert.equal(p.modo, 'citato');
  assert.deepEqual(p.passi.map(x => x.testo), [COMANDO]);
  // 'manuale', 'proposta' e 'nodo' non si allargano: dicono già dove, o prendono già tutto
  p = A.passoContestato(issue('Il 30 agosto 1939 è la data giusta, ma la carica non è speciale.'),
    { choice: 'manual', text: COMANDO.replace('è speciale perché in Svizzera esiste', 'in Svizzera esiste') });
  assert.equal(p.modo, 'manuale');
  assert.deepEqual(p.passi.map(x => x.testo.slice(0, 22)), ['Questa carica militare']);
});

test('corsie (giro 2): una frase aggiunta al passo che una decisione ha già tolto non fa uscire tutto il nodo', () => {
  const A1 = 'Il 30 agosto 1939 l\'Assemblea Federale nominò Henri Guisan generale.';
  const B1 = 'Nel 1939 la Svizzera mobilitò l\'esercito.', C1 = 'La neutralità fu dichiarata subito.';
  const db = { nodes: [{ id: 'ROOT', label: 'Svizzera', level: 0, desc: 'La Svizzera restò neutrale.' },
    { id: 'N', label: 'Mobilitazione', level: 1, desc: A1 + ' ' + B1 + ' ' + C1 }], links: [{ source: 'ROOT', target: 'N', rel: 'include' }] };
  const report = { contratto: 'mappai-giudice@2', stato: 'completo', copertura: { nodiEsaminati: ['ROOT', 'N'], nodiSaltati: [] }, issues: [
    { id: 'i-via', target: { kind: 'node', id: 'N', field: 'desc' }, problem: 'La mobilitazione non è in questa scheda.' },
    { id: 'i-data', target: { kind: 'node', id: 'N', field: 'desc' }, problem: 'La fonte non dice «Il 30 agosto 1939 l\'Assemblea Federale nominò Henri Guisan generale».' }] };
  const rv = RC.setDecision(RC.createReview({ db, sources: SOURCES, report, generationId: 'g' }), 'i-via', 'manual', { text: A1 + ' ' + C1 });
  const passo = A.passoContestato(rv.initial.issues.find(i => i.id === 'i-data'));
  assert.equal(passo.modo, 'citato');
  assert.deepEqual(passo.aggiunte.map(x => x.testo), [B1], 'il 1939 ripetuto porta dentro la seconda frase');
  const c = A.corsie({ review: rv, db });
  assert.equal(riga(c, 'N', 'Il 30 agosto').corsia, 'fuori-contestata');
  assert.equal(riga(c, 'N', 'La neutralità').corsia === 'fuori-contestata', false, 'la frase che il problema non tocca resta');
  assert.equal(c.passiNonRitrovati, 0);
});

test('corsie (giro 2): che cosa fa ai materiali ogni segnalazione aperta — fuori, superata, sul testo del docente, su un nodo senza testo', () => {
  const db = mappa();
  db.nodes.push({ id: 'VUOTO', label: 'Nodo senza testo', level: 2, desc: '' });
  const rep = rapporto();
  rep.copertura.nodiEsaminati = ESAMINATI.concat(['VUOTO']);
  rep.issues.push(
    // su ROOT, che il docente ha riscritto per intero: il controllo segnala il nodo senza dire quale frase
    { id: 'i-root-vaga', target: { kind: 'node', id: 'ROOT', field: 'desc' }, problem: 'Tono troppo netto.' },
    // sulla frase che il docente ha già cambiato in L1_5_L2_A: il passo non c'è più
    { id: 'i-accuse-vecchia', target: { kind: 'node', id: 'L1_5_L2_A', field: 'desc' },
      problem: 'La fonte non dice «Inoltre, lo Stato è accusato di aver aiutato la Germania fornendo materiale militare».' },
    { id: 'i-vuoto', target: { kind: 'node', id: 'VUOTO', field: 'desc' }, problem: 'Manca la descrizione.' });
  let r = revisione({ db, report: rep, decidi: false });
  r = RC.setDecision(r, 'i-militare', 'manual', { text: ACCUSE_RISCRITTA });
  r = RC.setDecision(r, 'i-categoria', 'manual', { text: DIFESA_DOCENTE });
  const ROOT_DOCENTE = 'Nel conflitto la Confederazione restò fuori dagli schieramenti, con molte ambiguità.';
  r = RC.setDecision(r, 'i-neutralita', 'manual', { text: ROOT_DOCENTE });
  const c = A.corsie({ review: r, db });
  assert.equal(c.esitiSegnalazioni['i-razionamento'], 'fuori');
  assert.equal(c.esitiSegnalazioni['i-profughi'], 'fuori');
  assert.equal(c.esitiSegnalazioni['i-oro'], 'fuori', 'nodo non esaminato: le sue frasi escono');
  assert.equal(c.esitiSegnalazioni['i-docente'], 'fuori');
  assert.equal(c.esitiSegnalazioni['i-root-vaga'], 'docente', 'ROOT contiene solo testo del docente: non toglie niente');
  assert.equal(c.esitiSegnalazioni['i-accuse-vecchia'], 'superata');
  assert.equal(c.esitiSegnalazioni['i-vuoto'], 'vuoto');
  assert.deepEqual(c.senzaEffetto.sort(), ['i-root-vaga', 'i-vuoto']);
  assert.equal(riga(c, 'ROOT', 'Nel conflitto').corsia, 'docente');
  const rec = A.record(r, db, { adesso: ADESSO });
  assert.equal(rec.completo, true, rec.motivo);
  assert.equal(rec.conteggi.senzaEffetto, 2);
  assert.equal(rec.conteggi.superate, 1);
  assert.deepEqual(A.ricevuta(rec).conteggi, rec.conteggi, 'il riepilogo li legge dalla ricevuta');
  // giro 6 (G1): anche la riscrittura di ROOT che riprende ancora la desc base («…una neutralità
  // apparentemente rigorosa per preservare l'indipendenza») è testo del docente, e sotto una segnalazione
  // 'nodo' resta: la segnalazione non toglie niente (col giro 5, F2, usciva ed era «ritoccata»)
  const r2 = RC.setDecision(r, 'i-neutralita', 'manual', { text: 'Durante la Seconda Guerra Mondiale, la Svizzera ha perseguito una neutralità apparentemente rigorosa per preservare l\'indipendenza.' });
  const c2 = A.corsie({ review: r2, db });
  assert.equal(c2.esitiSegnalazioni['i-root-vaga'], 'docente');
  assert.equal(riga(c2, 'ROOT', 'Durante').corsia, 'docente');
  assert.ok(!riga(c2, 'ROOT', 'Durante').ritoccata);
});

test('documento dei nessi (giro 2): una riga nata da una frase che una decisione presa ha cambiato lo scarta, anche senza esclusioni', () => {
  const CC = require(path.join(JS, 'mappai-causal-core.js'));
  const FONTE = [{ nome: 'f.pdf', pages: [{ n: 1, text: 'Durante la guerra la Svizzera introdusse il razionamento del cibo per tutta la popolazione civile e militare.' }] }];
  const base = () => ({ nodes: [{ id: 'ROOT', label: 'Svizzera', level: 0, desc: 'La Confederazione restò neutrale per tutta la durata del conflitto.' },
    { id: 'X', label: 'Economia di guerra', level: 1, desc: 'La guerra provocò la fame. Il razionamento del cibo valeva per tutta la popolazione.' },
    { id: 'Y', label: 'Razionamento', level: 1, desc: 'Il razionamento permise la sopravvivenza.' }],
    links: [{ source: 'ROOT', target: 'X', rel: 'include' }, { source: 'ROOT', target: 'Y', rel: 'include' }] });
  // il documento salvato in ELABORA mentre G1 aspettava: nasce dal testo NON corretto della mappa aperta
  const conDoc = ritocca => { const d = base(); d.causalDoc = CC.docFromChains(CC.buildChains({ nodes: d.nodes, links: d.links }), {}); if (ritocca) ritocca(d.causalDoc); return d; };
  const esito = (nuovoTesto, ritocca, nodo = 'X') => {
    const db = conDoc(ritocca);
    const report = { contratto: 'mappai-giudice@2', stato: 'completo', copertura: { nodiEsaminati: ['ROOT', 'X', 'Y'], nodiSaltati: [] },
      issues: [{ id: 'i1', target: { kind: 'node', id: nodo, field: 'desc' }, problem: 'La fonte non parla di fame.' }] };
    const rv = RC.setDecision(RC.createReview({ db, sources: FONTE, report, generationId: 'g' }), 'i1', 'manual', { text: nuovoTesto });
    const rec = A.record(rv, db, { adesso: ADESSO });
    assert.equal(rec.completo, true, rec.motivo);
    assert.deepEqual(rec.escluse, [], 'niente è escluso: la decisione è presa');
    return rec;
  };
  // la frase «La guerra provocò la fame.» è stata corretta dal docente: la riga «La guerra → la fame» è vecchia
  let rec = esito('La guerra provocò la carestia. Il razionamento del cibo valeva per tutta la popolazione.');
  assert.equal(rec.causalDocScartato, true);
  assert.equal(rec.causalDocMotivo, 'decisione_descrizione');
  // giro 3, D2: la correzione tocca l'altra frase del nodo, ma il NODO ha righe nel documento: il documento esce
  // (prima restava: la riga del nesso era ancora nel testo della vista)
  rec = esito('La guerra provocò la fame. Il razionamento del cibo valeva per ogni cittadino.');
  assert.equal(rec.causalDocScartato, true);
  assert.equal(rec.causalDocMotivo, 'decisione_descrizione');
  // anche una riga riscritta dal docente in ELABORA: il nodo è stato cambiato da una decisione presa
  rec = esito('La guerra provocò la fame. Il razionamento del cibo valeva per ogni cittadino.', doc => {
    doc.sections.forEach(s => s.rows.forEach(x => { if (x.origin === 'desc' && x.right === 'la fame') x.right = 'la fame e la miseria nelle città'; }));
  });
  assert.equal(rec.causalDocScartato, true);
  // una decisione su un nodo che nel documento non compare (ROOT non ha nessi): il documento resta
  rec = esito('La Confederazione restò neutrale per tutto il conflitto.', null, 'ROOT');
  assert.equal(rec.causalDocScartato, false);
  assert.equal(rec.causalDocMotivo, null);
  // la stessa funzione per il blocco del Banco, sulle corsie
  const db = conDoc();
  const rv = RC.setDecision(RC.createReview({ db, sources: FONTE, generationId: 'g', report: { contratto: 'mappai-giudice@2', stato: 'completo',
    copertura: { nodiEsaminati: ['ROOT', 'X', 'Y'], nodiSaltati: [] }, issues: [{ id: 'i1', target: { kind: 'node', id: 'X', field: 'desc' }, problem: 'x.' }] } }),
  'i1', 'manual', { text: 'La guerra provocò la carestia. Il razionamento del cibo valeva per tutta la popolazione.' });
  assert.equal(A.documentoNessiScartato(A.corsie({ review: rv, db }), db), true);
  assert.equal(A.documentoNessiScartato(A.corsie({ review: rv, db: base() }), base()), false, 'senza documento: niente da scartare');
});

test('documento dei nessi (giro 3, D2): una decisione presa che toglie il «quindi» o cambia un verbo scarta il documento, col motivo', () => {
  const CC = require(path.join(JS, 'mappai-causal-core.js'));
  const FONTE = [{ nome: 'f.pdf', pages: [{ n: 1, text: 'Durante la guerra la Svizzera introdusse il razionamento del cibo per tutta la popolazione civile e militare.' }] }];
  const NESSO = 'La guerra bloccò i commerci con l\'estero, quindi mancarono le materie prime.';
  const SENZA_QUINDI = 'La guerra bloccò i commerci con l\'estero e mancarono le materie prime.';
  const RESTO = ' Il razionamento del cibo valeva per tutta la popolazione.';
  const conDoc = () => {
    const d = { nodes: [{ id: 'ROOT', label: 'Svizzera', level: 0, desc: 'La Confederazione restò neutrale per tutta la durata del conflitto.' },
      { id: 'X', label: 'Economia di guerra', level: 1, desc: NESSO + RESTO },
      { id: 'Y', label: 'Razionamento', level: 1, desc: 'Lo Stato distribuiva tessere per il cibo.' }],
      links: [{ source: 'ROOT', target: 'X', rel: 'include' }, { source: 'ROOT', target: 'Y', rel: 'include' }, { source: 'X', target: 'Y', rel: 'causa' }] };
    d.causalDoc = CC.docFromChains(CC.buildChains({ nodes: d.nodes, links: d.links }), {});
    return d;
  };
  const righe = conDoc().causalDoc.sections.flatMap(s => s.rows);
  assert.ok(righe.some(x => x.origin === 'desc' && x.conn === 'quindi' && x.nodeLabel === 'Economia di guerra'));
  assert.ok(righe.some(x => x.origin === 'link' && x.left === 'Economia di guerra' && x.right === 'Razionamento' && x.conn === 'causa'));
  const issues = [
    { id: 'i-quindi', target: { kind: 'node', id: 'X', field: 'desc' }, problem: 'La fonte non dice che la mancanza di materie prime fosse una conseguenza.' },
    { id: 'i-rel', target: { kind: 'link', source: 'X', target: 'Y', rel: 'causa', field: 'rel' }, after: 'precede', problem: 'Non è una causa.' },
    { id: 'i-link', target: { kind: 'link', source: 'X', target: 'Y', rel: 'causa', field: '$link' }, after: null, problem: 'Il collegamento non è sostenuto.' },
    { id: 'i-root-link', target: { kind: 'link', source: 'ROOT', target: 'Y', rel: 'include', field: 'rel' }, after: 'contiene', problem: 'Verbo da precisare.' }];
  const esito = decidi => {
    const db = conDoc();
    let rv = RC.createReview({ db, sources: FONTE, generationId: 'g', report: { contratto: 'mappai-giudice@2', stato: 'completo',
      copertura: { nodiEsaminati: ['ROOT', 'X', 'Y'], nodiSaltati: [] }, issues: JSON.parse(JSON.stringify(issues)) } });
    rv = decidi(rv);
    // le segnalazioni non decise qui si mantengono: niente di aperto, niente di escluso
    for (const i of rv.initial.issues) if (!rv.initial.decisions[i.id]) rv = RC.setDecision(rv, i.id, 'reject');
    const rec = A.record(rv, db, { adesso: ADESSO });
    assert.equal(rec.completo, true, rec.motivo);
    assert.deepEqual(rec.escluse, []);
    assert.deepEqual(rec.linkEsclusi, []);
    return { rec, rv, db };
  };
  // tutto mantenuto: il documento resta
  assert.equal(esito(rv => rv).rec.causalDocScartato, false);
  // il docente toglie il «quindi»: i due capi della riga sono ancora nel testo corretto (la regola del giro 2 non
  // se ne accorgeva), ma il nesso non c'è più — il documento esce
  let e = esito(rv => RC.setDecision(rv, 'i-quindi', 'manual', { text: SENZA_QUINDI + RESTO }));
  const vista = A.vistaDb(A.correggi(e.rv, e.db).db, e.rec);
  const testoX = vista.nodes.find(n => n.id === 'X').desc.toLowerCase();
  assert.ok(testoX.includes('la guerra bloccò i commerci con l\'estero') && testoX.includes('mancarono le materie prime') && !testoX.includes('quindi'));
  assert.equal(e.rec.causalDocScartato, true);
  assert.equal(e.rec.causalDocMotivo, 'decisione_descrizione');
  assert.equal('causalDoc' in vista, false, 'i materiali ricostruiscono i nessi dalla vista');
  assert.equal(A.ricevuta(e.rec).causalDocMotivo, 'decisione_descrizione', 'la ricevuta dice il motivo');
  // il verbo del collegamento cambiato («causa» → «precede»), accettando la proposta
  e = esito(rv => RC.setDecision(rv, 'i-rel', 'accept'));
  assert.equal(e.rec.causalDocScartato, true);
  assert.equal(e.rec.causalDocMotivo, 'decisione_collegamento');
  // «nessuna parola» sul collegamento, e il collegamento tolto: lo stesso
  e = esito(rv => RC.setDecision(rv, 'i-rel', 'manual', { text: '', relNone: true }));
  assert.equal(e.rec.causalDocMotivo, 'decisione_collegamento');
  e = esito(rv => RC.setDecision(rv, 'i-link', 'accept'));
  assert.equal(e.rec.causalDocMotivo, 'decisione_collegamento');
  // un verbo cambiato su un collegamento che nel documento non compare («include» non fa nessi): il documento resta
  e = esito(rv => RC.setDecision(rv, 'i-root-link', 'accept'));
  assert.equal(e.rec.causalDocScartato, false);
  // la stessa regola per il blocco del Banco, sulle corsie
  const db = conDoc();
  const rv = RC.setDecision(RC.createReview({ db, sources: FONTE, generationId: 'g', report: { contratto: 'mappai-giudice@2', stato: 'completo',
    copertura: { nodiEsaminati: ['ROOT', 'X', 'Y'], nodiSaltati: [] }, issues: JSON.parse(JSON.stringify(issues.slice(0, 1))) } }),
  'i-quindi', 'manual', { text: SENZA_QUINDI + RESTO });
  assert.equal(A.motivoDocumentoNessi(A.corsie({ review: rv, db }), db), 'decisione_descrizione');
});

test('rettifiche (giro 2): riportate alla vista — la metà contestata di una frase col «;» non rientra dalle RETTIFICHE DEL DOCENTE', () => {
  const G = require(path.join(JS, 'mappai-grounding-core.js'));
  const CONTESTATA = 'nel 1943 gli scambi con gli Alleati superarono quelli con la Germania.';
  const PRIMA = 'La Svizzera ha continuato a commerciare con gli Alleati, specialmente con gli USA; ' + CONTESTATA +
    ' Questo scambio è avvenuto nonostante le pressioni della Germania.';
  const DOPO = PRIMA.replace('specialmente con gli USA', 'in particolare con il Regno Unito e gli Stati Uniti');
  const db = { nodes: [{ id: 'ROOT', label: 'Svizzera', level: 0, desc: 'La Svizzera restò neutrale durante la guerra.' },
    { id: 'C3', label: 'Commercio con gli Alleati', level: 1, desc: PRIMA },
    { id: 'L', label: 'Accuse', level: 1, desc: 'La Svizzera fu accusata di aver aiutato la Germania.' }],
    links: [{ source: 'ROOT', target: 'C3', rel: 'include' }, { source: 'C3', target: 'L', rel: 'causa' }] };
  const report = { contratto: 'mappai-giudice@2', stato: 'completo',
    copertura: { nodiEsaminati: ['ROOT', 'C3', 'L'], nodiSaltati: [], linkEsaminati: [{ source: 'C3', target: 'L', rel: 'causa' }], linkSaltati: [] },
    issues: [
      { id: 'i-usa', target: { kind: 'node', id: 'C3', field: 'desc' }, problem: 'La fonte non dice che il commercio fosse soprattutto con gli USA.' },
      { id: 'i-tieni', target: { kind: 'node', id: 'C3', field: 'desc' }, problem: 'Il tono è troppo netto.' },
      { id: 'i-1943', target: { kind: 'node', id: 'C3', field: 'desc' }, problem: 'La fonte non dice «nel 1943 gli scambi con gli Alleati superarono quelli con la Germania».' },
      { id: 'i-rel', target: { kind: 'link', source: 'C3', target: 'L', rel: 'causa', field: 'rel' }, after: 'precede', problem: 'Non è una causa.' },
      { id: 'i-link', target: { kind: 'link', source: 'C3', target: 'L', rel: 'causa', field: '$link' }, after: null, problem: 'Il collegamento non è sostenuto.' }] };
  let rv = RC.createReview({ db, sources: SOURCES, report, generationId: 'g' });
  rv = RC.setDecision(rv, 'i-usa', 'manual', { text: DOPO });
  rv = RC.setDecision(rv, 'i-tieni', 'manual', { text: PRIMA });   // «Modifica» col testo di prima: non è una rettifica
  rv = RC.setDecision(rv, 'i-rel', 'accept');
  const rec = A.record(rv, db, { adesso: ADESSO });
  assert.equal(rec.completo, true, rec.motivo);
  assert.ok(rec.escluse.some(e => e.testo === CONTESTATA));
  const cor = A.correggi(rv, db), vista = A.vistaDb(cor.db, rec);
  // prima del giro 2: la rettifica rimetteva la frase intera, seconda metà compresa
  const vecchie = G.buildInput(vista, vista.nodes, SOURCES, Object.assign({}, rv, { overrides: cor.overrides })).material;
  assert.ok(vecchie.split('RETTIFICHE DEL DOCENTE')[1].includes('superarono'), 'il difetto del giro 1, riprodotto');
  const nuove = A.rettifiche(cor.overrides, rec, vista);
  const materiale = G.buildInput(vista, vista.nodes, SOURCES, Object.assign({}, rv, { overrides: nuove })).material;
  rec.escluse.forEach(e => assert.ok(!materiale.includes(e.testo), 'nessuna frase esclusa nel materiale, rettifiche comprese: ' + e.testo));
  assert.match(materiale.split('RETTIFICHE DEL DOCENTE')[1], /Regno Unito e gli Stati Uniti/, 'la correzione del docente resta una rettifica');
  // il verbo corretto di un collegamento che la vista toglie non rientra
  assert.equal(nuove.some(o => o.target.kind === 'link'), false);
  assert.equal(cor.overrides.some(o => o.target.kind === 'link'), true);
  // la decisione che non ha cambiato il testo resta com'era: togliendole una frase diventerebbe una rettifica vuota
  const tieni = cor.overrides.find(o => o.issueId === 'i-tieni');
  assert.ok(tieni && tieni.after === tieni.before);
  assert.equal(nuove.find(o => o.issueId === 'i-tieni'), tieni);
  assert.equal(materiale.split('[Rettifica del docente: C3').length - 1, 1, 'una rettifica sola sul nodo, quella vera');
  // senza esclusioni sul nodo la rettifica resta lo stesso oggetto
  const senza = A.rettifiche(cor.overrides, { escluse: [], linkEsclusi: [] }, cor.db);
  assert.deepEqual(senza.map((o, i) => o === cor.overrides[i]), cor.overrides.map(() => true));
});

test('rettifiche (giro 3, D3): togliere una frase esclusa non incolla la frase col «;» a quella che segue — il testo del docente resta parola per parola', () => {
  const G = require(path.join(JS, 'mappai-grounding-core.js'));
  const seg = s => Array.from(new Intl.Segmenter('it', { granularity: 'sentence' }).segment(s), x => x.segment.trim()).filter(Boolean);
  const CONTESTATA = 'nel 1943 gli scambi con gli Alleati superarono quelli con la Germania.';
  const DOPO_IL_TAGLIO = 'Il commercio passava soprattutto per il porto di Genova.';   // tenuta: niente anafora
  const PRIMA = 'La Svizzera ha continuato a commerciare con gli Alleati, specialmente con gli USA; ' + CONTESTATA + ' ' + DOPO_IL_TAGLIO +
    ' Nel 1944 gli scambi calarono; ' + 'nel 1945 si fermarono del tutto.';
  const DOCENTE = 'La Svizzera ha continuato a commerciare con gli Alleati, in particolare con il Regno Unito e gli Stati Uniti;';
  const DOPO = PRIMA.replace('La Svizzera ha continuato a commerciare con gli Alleati, specialmente con gli USA;', DOCENTE)
    .replace('Nel 1944 gli scambi calarono;', 'Nel 1944 gli scambi con gli Alleati calarono;');
  const db = { nodes: [{ id: 'ROOT', label: 'Svizzera', level: 0, desc: 'La Svizzera restò neutrale durante la guerra.' },
    { id: 'C3', label: 'Commercio con gli Alleati', level: 1, desc: PRIMA }],
    links: [{ source: 'ROOT', target: 'C3', rel: 'include' }] };
  const report = { contratto: 'mappai-giudice@2', stato: 'completo', copertura: { nodiEsaminati: ['ROOT', 'C3'], nodiSaltati: [] },
    issues: [
      { id: 'i-usa', target: { kind: 'node', id: 'C3', field: 'desc' }, problem: 'La fonte non dice che il commercio fosse soprattutto con gli USA.' },
      { id: 'i-1943', target: { kind: 'node', id: 'C3', field: 'desc' }, problem: 'La fonte non dice «nel 1943 gli scambi con gli Alleati superarono quelli con la Germania».' },
      { id: 'i-1945', target: { kind: 'node', id: 'C3', field: 'desc' }, problem: 'La fonte non dice «nel 1945 si fermarono del tutto».' }] };
  let rv = RC.createReview({ db, sources: SOURCES, report, generationId: 'g' });
  rv = RC.setDecision(rv, 'i-usa', 'manual', { text: DOPO });
  const rec = A.record(rv, db, { adesso: ADESSO });
  assert.equal(rec.completo, true, rec.motivo);
  assert.deepEqual(rec.escluse.map(e => e.testo).sort(), [CONTESTATA, 'nel 1945 si fermarono del tutto.'].sort(), 'la frase dopo il taglio resta');
  const cor = A.correggi(rv, db), vista = A.vistaDb(cor.db, rec);
  const nuove = A.rettifiche(cor.overrides, rec, vista, cor.db);
  const r = nuove.find(o => o.issueId === 'i-usa');
  // un a capo al posto della frase tolta: il Segmenter spezza lì, e nessuna sua frase è nuova
  seg(r.after).forEach(s => assert.ok(DOPO.includes(s), 'ogni frase della rettifica sta, parola per parola, nel testo del docente: ' + s));
  assert.equal(r.after, DOCENTE + '\n' + DOPO_IL_TAGLIO + ' Nel 1944 gli scambi con gli Alleati calarono;');
  const materiale = G.buildInput(vista, vista.nodes, SOURCES, Object.assign({}, rv, { overrides: nuove })).material;
  const blocco = materiale.split('RETTIFICHE DEL DOCENTE')[1];
  rec.escluse.forEach(e => assert.ok(!materiale.includes(e.testo), 'nessuna frase esclusa passa: ' + e.testo));
  assert.ok(blocco.includes(DOCENTE), 'la correzione del docente, parola per parola');
  assert.ok(blocco.includes('Nel 1944 gli scambi con gli Alleati calarono;'));
  assert.doesNotMatch(blocco, /Stati Uniti; Il commercio|Uniti;\s+Il commercio/, 'la frase col «;» non si incolla a quella che seguiva la frase tolta');
  assert.doesNotMatch(blocco, /Genova/, 'la frase tenuta, identica a prima, non è una rettifica');
  // prima del giro 3 il taglio lasciava uno spazio: «…Stati Uniti; Il commercio passava…», UNA frase nuova per il Segmenter
  const incollata = DOCENTE + ' ' + DOPO_IL_TAGLIO;
  assert.equal(seg(incollata).length, 1, 'il difetto, riprodotto: il Segmenter non spezza sul «;»');
  // il ripiego, quando nella decisione la frase esclusa è spezzata in un altro modo («Da notare:» si unisce alla
  // frase che segue, e la frase esclusa non è più un'affermazione intera): dal testo corretto, con gli a capo
  const storta = Object.assign({}, cor.overrides.find(o => o.issueId === 'i-usa'), { after: DOPO.replace(CONTESTATA, 'Da notare: ' + CONTESTATA) });
  assert.ok(!A.affermazioni(storta.after).some(a => a.testo === CONTESTATA));
  const [rip] = A.rettifiche([storta], rec, vista, cor.db);
  rec.escluse.forEach(e => assert.ok(!rip.after.includes(e.testo), 'nemmeno dal ripiego: ' + e.testo));
  const corretto = cor.db.nodes.find(n => n.id === 'C3').desc;
  seg(rip.after).forEach(s => assert.ok(corretto.includes(s), 'dal testo corretto, senza giunzioni: ' + s));
});

test('dipendenze lette al momento della chiamata: il file si carica anche senza i core accanto', () => {
  const vm = require('node:vm'), fs = require('node:fs');
  const ctx = { console };
  ctx.globalThis = ctx; ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(JS, 'mappai-affermazioni-core.js'), 'utf8'), ctx);
  assert.ok(ctx.MappAIAffermazioniCore, 'si registra su window');
  assert.equal(ctx.MappAIAffermazioniCore.SCHEMA, 'mappai-quarantena@1');
  assert.equal(ctx.MappAIAffermazioniCore.vistaDb(null, null), null, 'una funzione senza dipendenze gira');
  assert.throws(() => ctx.MappAIAffermazioniCore.impronta('x'), 'senza MappAIReviewCore la chiamata fallisce allora, non al caricamento');
  ctx.MappAIReviewCore = RC;
  assert.equal(ctx.MappAIAffermazioniCore.impronta('x'), A.impronta('x'), 'e trova il core appena c\'è');
  // nessuna chiamata AI né reranker nel core
  const src = fs.readFileSync(path.join(JS, 'mappai-affermazioni-core.js'), 'utf8');
  assert.equal(/fetchModelAPI|rerankInfomaniak|giro\.chat|electronAPI|localStorage|document\./.test(src), false);
});

/* ── Packet 0042, giro 4 del 26/09 ────────────────────────────────────────── */
/* I due ritocchi di Svizzera che il giro 3 lasciava ai materiali: il docente ha
   cambiato una parola della frase contestata, la segnalazione aperta risultava
   «superata» e il passo contestato arrivava intatto ai generatori. */
const MANDATO_PRIMA = 'Il Consiglio Federale ha scritto la dichiarazione di neutralità grazie a un mandato speciale.';
const MANDATO = 'Questo mandato è un incarico ufficiale dato dall\'Assemblea Federale, l\'organo che rappresenta il popolo e i cantoni, per gestire la situazione di guerra.';
const MANDATO_DOCENTE = MANDATO.replace('è un incarico', 'è stato un incarico');
const DEPOSITI_PRIMA = 'Le banche svizzere ricevettero accuse gravi riguardanti i depositi di denaro fatti da investitori stranieri.';
const DEPOSITI = 'In particolare, lo Stato svizzero è stato accusato di aver rifiutato di restituire i soldi depositati nelle banche da persone che erano poi morte durante il conflitto bellico della Seconda Guerra Mondiale.';
const DEPOSITI_PROPOSTA = DEPOSITI.replace('lo Stato svizzero è stato accusato', 'le banche svizzere sono state accusate');
function mappaRitocchi() {
  return { nodes: [
    { id: 'ROOT', label: 'Svizzera e 2a GM', level: 0, desc: 'Durante la Seconda Guerra Mondiale, la Svizzera ha perseguito una rigorosa neutralità per preservare l\'indipendenza.' },
    { id: 'L1_0_L2_A_D3', label: 'Mandato del Consiglio Federale', level: 3, desc: MANDATO_PRIMA + ' ' + MANDATO },
    { id: 'L1_3_L2_B', label: 'Gestione depositi bancari', level: 2, desc: DEPOSITI_PRIMA + ' ' + DEPOSITI }],
  links: [{ source: 'ROOT', target: 'L1_0_L2_A_D3', rel: 'include' }, { source: 'ROOT', target: 'L1_3_L2_B', rel: 'include' }] };
}
function revisioneRitocchi(extra) {
  const report = { contratto: 'mappai-giudice@2', stato: 'completo',
    copertura: { nodiEsaminati: ['ROOT', 'L1_0_L2_A_D3', 'L1_3_L2_B'], nodiSaltati: [] },
    issues: [
      // decisa con «Modifica»: «è» → «è stato», «l'organo che rappresenta il popolo e i cantoni» resta
      { id: 'i-mandato-deciso', target: { kind: 'node', id: 'L1_0_L2_A_D3', field: 'desc' },
        problem: 'La fonte non definisce l\'Assemblea Federale come \'l\'organo che rappresenta il popolo e i cantoni\'.' },
      // aperta, da un altro giro: la stessa contestazione (localizzata per sovrapposizione, verso problema→frase)
      { id: 'i-mandato', target: { kind: 'node', id: 'L1_0_L2_A_D3', field: 'desc' },
        problem: 'La fonte non definisce l\'Assemblea Federale come l\'organo che rappresenta il popolo e i cantoni.' },
      // decisa accettando la proposta: «lo Stato svizzero» → «le banche svizzere», il resto uguale
      { id: 'i-depositi-proposta', target: { kind: 'node', id: 'L1_3_L2_B', field: 'desc' }, after: DEPOSITI_PRIMA + ' ' + DEPOSITI_PROPOSTA,
        problem: 'La descrizione attribuisce l\'accusa di non restituire i depositi allo Stato svizzero, mentre la fonte parla genericamente di accuse relative alle banche svizzere.' },
      // aperta, cita il passo (troncata come nel rapporto vero): il rifiuto di restituire i soldi non è nella fonte
      { id: 'i-depositi', target: { kind: 'node', id: 'L1_3_L2_B', field: 'desc' },
        problem: '\'Lo Stato svizzero è stato accusato di aver rifiutato di restituire i soldi depositati nelle banche da persone che erano poi morte durante il conflitto\' non è un fatto sostenuto dalla fonte. La fonte menziona solo che \'i responsabili sviz' }
    ].concat((extra && extra.issues) || []) };
  let r = RC.createReview({ db: mappaRitocchi(), sources: SOURCES, report, generationId: 'gen-svizzera' });
  r = RC.setDecision(r, 'i-mandato-deciso', 'manual', { text: MANDATO_PRIMA + ' ' + MANDATO_DOCENTE });
  r = RC.setDecision(r, 'i-depositi-proposta', 'accept');
  return r;
}

test('corsie (giro 4, E1 → giro 5, F1): la frase ritoccata che riprende ancora il passo contestato esce anche se è del docente — L1_0_L2_A_D3 e L1_3_L2_B di Svizzera', () => {
  const rv = revisioneRitocchi(), c = A.corsie({ review: rv, db: mappaRitocchi() });
  // le due frasi ritoccate: fuori, per la segnalazione aperta, e lo si dice
  for (const [nodo, inizio, issue] of [['L1_0_L2_A_D3', 'Questo mandato è stato', 'i-mandato'], ['L1_3_L2_B', 'In particolare, le banche svizzere', 'i-depositi']]) {
    const r = riga(c, nodo, inizio);
    assert.ok(r, nodo);
    assert.equal(r.corsia, 'fuori-contestata', nodo + ': ' + r.testo);
    assert.equal(r.issueId, issue);
    assert.equal(r.via, 'contenimento', 'riprende il passo, non è il passo parola per parola');
    assert.equal(r.ritoccata, true, 'era testo del docente');
    assert.equal(c.esitiSegnalazioni[issue], 'ritoccata');
  }
  assert.deepEqual(c.superate, [], 'nessuna segnalazione «superata»: il passo c\'è ancora');
  // il resto del testo del docente e la frase non contestata restano
  assert.notEqual(A.FUORI.includes(riga(c, 'L1_0_L2_A_D3', 'Il Consiglio Federale').corsia), true);
  // il record e la vista: la parte contestata non arriva ai materiali
  const rec = A.record(rv, mappaRitocchi(), { adesso: ADESSO });
  assert.equal(rec.completo, true, rec.motivo);
  const esclusa = rec.escluse.find(e => e.nodeId === 'L1_0_L2_A_D3');
  assert.equal(esclusa.testo, MANDATO_DOCENTE);
  assert.deepEqual(esclusa.passi, [MANDATO], 'il record porta il passo com\'era, per le rettifiche');
  assert.equal(esclusa.ritoccata, true);
  assert.equal(esclusa.via, 'contenimento');
  assert.equal(rec.conteggi.perContenimento, 2); assert.equal(rec.conteggi.ritoccate, 2); assert.equal(rec.conteggi.perFrammento, 0);
  const vista = A.vistaDb(A.correggi(rv, mappaRitocchi()).db, rec);
  const testo = vista.nodes.map(n => n.desc).join('\n');
  assert.ok(!testo.includes('l\'organo che rappresenta il popolo e i cantoni'));
  assert.ok(!testo.includes('di aver rifiutato di restituire i soldi'));
  assert.ok(testo.includes(MANDATO_PRIMA), 'la frase non contestata resta');
  // L1_3_L2_B: il frammento citato non si ritrova più parola per parola (la proposta ha cambiato il soggetto),
  // ma la frase che lo conteneva sì, per contenimento — col solo frammento sarebbe stata «superata»
  assert.equal(A.passoContestato(rv.initial.issues.find(i => i.id === 'i-depositi')).modo, 'citato');
  assert.ok(!A.normalizza(DEPOSITI_PROPOSTA).toLowerCase().includes('lo stato svizzero è stato accusato'));
});

test('corsie (giro 5, F1): le due riscritture vere di Svizzera si PERDONO (fallire chiusa); la riscrittura che non riprende il passo resta, e la segnalazione è superata', () => {
  // L1_4 di Svizzera: 0,73 nel verso passo→frase, sopra la soglia — resta fuori finché la segnalazione è aperta
  const PASSO_L1_4 = 'Fino al 1943, la Svizzera accolse solo militari e rifugiati politici, respingendo molti ebrei.';
  const RISCRITTA = 'Secondo la scheda, fino al 1943 le autorità federali e cantonali accolsero soltanto rifugiati politici, militari internati e disertori, respingendo numerosi ebrei.';
  const conTesto = testo => {
    const report = rapporto();
    report.issues.push({ id: 'i-profughi-deciso', target: { kind: 'node', id: 'L1_4', field: 'desc' }, problem: 'La fonte non dice che furono accolti solo militari e rifugiati politici.' },
      { id: 'i-profughi-aperta', target: { kind: 'node', id: 'L1_4', field: 'desc' },
        problem: 'Il documento sostiene che la Svizzera abbia respinto un numero altissimo di ebrei fino al 1943, ma non conferma che abbia accolto solo militari e rifugiati politici, escludendo altri profughi.' });
    return RC.setDecision(revisione({ report }), 'i-profughi-deciso', 'manual', { text: PROFUGHI.replace(PASSO_L1_4, testo) });
  };
  const c = A.corsie({ review: conTesto(RISCRITTA), db: mappa() });
  const r = riga(c, 'L1_4', 'Secondo la scheda');
  assert.equal(r.corsia, 'fuori-contestata');
  assert.equal(r.ritoccata, true);
  assert.equal(r.via, 'contenimento');
  assert.equal(c.esitiSegnalazioni['i-profughi-aperta'], 'ritoccata');
  assert.ok(!c.superate.includes('i-profughi-aperta'));
  assert.equal(Math.round(A.contenimento(PASSO_L1_4, RISCRITTA) * 100) / 100, 0.73);
  // L1_3_L2_A di Svizzera: 0,67, la seconda riscrittura persa
  const PASSO_ORO = 'La Svizzera, tramite la sua Banca Nazionale, scambiò l\'oro della Germania nazista con moneta svizzera o americana.';
  const ORO_RISCRITTA = 'La Svizzera, tramite la sua Banca Nazionale, avviò il commercio di oro con la Germania nazista, la quale necessitava di divise privilegiate per comprare merci da altre nazioni.';
  assert.equal(Math.round(A.contenimento(PASSO_ORO, ORO_RISCRITTA) * 100) / 100, 0.67);
  assert.ok(A.contenimento(PASSO_ORO, ORO_RISCRITTA) >= A.CONTENIMENTO);
  // una riscrittura che del passo tiene una parola piena sola (0,09): resta del docente, e la segnalazione è superata
  const VERA = 'In quegli anni la politica d\'asilo della Confederazione fu molto restrittiva.';
  assert.ok(A.contenimento(PASSO_L1_4, VERA) < A.CONTENIMENTO / 2);
  const c2 = A.corsie({ review: conTesto(VERA), db: mappa() });
  assert.equal(riga(c2, 'L1_4', 'In quegli anni').corsia, 'docente');
  assert.equal(c2.esitiSegnalazioni['i-profughi-aperta'], 'superata');
  // la frase AGGIUNTA al passo (`_estendi`) e ritoccata dal docente: il giro 4 la lasciava sua, il giro 5 la
  // tiene fuori (L1_2_L2_B di Svizzera, «…le scorte alimentari limitate»): riprende una frase base contestata
  const rep2 = rapporto();
  rep2.issues.push({ id: 'i-scorte', target: { kind: 'node', id: 'L1_2_L2_B', field: 'desc' }, problem: 'Le scorte non erano limitate in quel senso.' },
    { id: 'i-solo', target: { kind: 'node', id: 'L1_2_L2_B', field: 'desc' },
      problem: '"Il sistema di razionamento" è stato introdotto per gestire le scorte limitate di cibo. Tuttavia, non è vero che questo sistema fosse usato solo per distribuire cibo: serviva anche a regolare le quantità disponibili per ogni persona.' });
  let rv2 = revisione({ report: rep2 });
  rv2 = RC.setDecision(rv2, 'i-scorte', 'manual', { text: RAZIONAMENTO.replace('per gestire le scorte limitate.', 'per gestire le scorte alimentari limitate.') });
  const passo = A.passoContestato(rv2.initial.issues.find(i => i.id === 'i-solo'));
  assert.equal(passo.modo, 'citato');
  assert.ok(passo.aggiunte.some(x => x.testo.startsWith('Questo sistema è stato introdotto')), 'la frase sulle scorte è un\'aggiunta');
  const c3 = A.corsie({ review: rv2, db: mappa() });
  assert.equal(riga(c3, 'L1_2_L2_B', 'Il sistema di razionamento').corsia, 'fuori-contestata');
  assert.equal(riga(c3, 'L1_2_L2_B', 'Questo sistema è stato introdotto').corsia, 'fuori-contestata');
  assert.equal(riga(c3, 'L1_2_L2_B', 'Questo sistema è stato introdotto').ritoccata, true);
});

test('corsie (giro 4, E1): il passo si cerca NORMALIZZATO — lo stesso testo con l\'accento scomposto o due spazi si ritrova, non è «superato»', () => {
  const report = rapporto();
  report.issues.push({ id: 'i-accuse-altro', target: { kind: 'node', id: 'L1_5_L2_A', field: 'desc' }, problem: 'La prima frase è troppo generica.' },
    { id: 'i-critiche', target: { kind: 'node', id: 'L1_5_L2_A', field: 'desc' },
      problem: 'La fonte non dice «Le critiche principali riguardano il rifiuto di accogliere migliaia di rifugiati ebrei».' });
  const CRITICHE = 'Le critiche principali riguardano il rifiuto di accogliere migliaia di rifugiati ebrei, l\'acquisto di oro rubato dai nazisti e il mancato rimborso di depositi bancari a eredi di persone morte in guerra.';
  // la decisione cambia la prima frase e riscrive la seconda con un accento scomposto (NFD) e due spazi
  const scomposta = CRITICHE.normalize('NFD').replace('principali riguardano', 'principali  riguardano');
  assert.notEqual(scomposta, CRITICHE);
  const testo = ACCUSE.replace('La Svizzera è stata oggetto di diverse accuse riguardanti il suo comportamento durante il conflitto.',
    'La Svizzera fu accusata per il suo comportamento durante la guerra.').replace(CRITICHE, scomposta);
  let rv = revisione({ report });
  rv = RC.setDecision(rv, 'i-accuse-altro', 'manual', { text: testo });
  const c = A.corsie({ review: rv, db: mappa() });
  const r = c.righe.find(x => x.nodeId === 'L1_5_L2_A' && A.normalizza(x.testo) === A.normalizza(CRITICHE));
  assert.ok(r, 'la frase c\'è, scritta in un\'altra forma');
  assert.equal(r.corsia, 'fuori-contestata');
  assert.equal(r.issueId, 'i-critiche');
  assert.equal(r.via, 'frammento', 'trovata col frammento citato, nella forma normalizzata');
  assert.deepEqual(c.superate, []);
});

test('vista (giro 4, E2): al posto della frase tolta un a capo — la catena dei perché ricostruita dalla vista non ha triple nuove', () => {
  const CC = require(path.join(JS, 'mappai-causal-core.js'));
  const A1 = 'La siccità ridusse i raccolti nelle valli alpine;';
  const B = 'il governo impose il razionamento del pane;';
  const C = 'quindi i prezzi del grano salirono molto.';
  const db = { nodes: [{ id: 'ROOT', label: 'Svizzera', level: 0, desc: 'La Svizzera restò neutrale durante la guerra.' },
    { id: 'E', label: 'Economia di guerra', level: 1, desc: A1 + ' ' + B + ' ' + C }],
    links: [{ source: 'ROOT', target: 'E', rel: 'include' }] };
  const report = { contratto: 'mappai-giudice@2', stato: 'completo', copertura: { nodiEsaminati: ['ROOT', 'E'], nodiSaltati: [] },
    issues: [{ id: 'i-pane', target: { kind: 'node', id: 'E', field: 'desc' }, problem: 'La fonte non dice «il governo impose il razionamento del pane».' }] };
  const rv = RC.createReview({ db, sources: SOURCES, report, generationId: 'g' });
  const rec = A.record(rv, db, { adesso: ADESSO });
  assert.equal(rec.completo, true, rec.motivo);
  assert.deepEqual(rec.escluse.map(e => e.testo), [B]);
  const vista = A.vistaDb(A.correggi(rv, db).db, rec);
  const chiavi = x => CC.dedupe(CC.extractDescTriples(x.desc, x.id, x.label)).map(t => JSON.stringify([t.cause || t.a, t.conn, t.effect || t.b]));
  const prima = new Set(chiavi(db.nodes[1]));
  const nuove = chiavi(vista.nodes[1]).filter(k => !prima.has(k));
  assert.deepEqual(nuove, [], 'nessuna tripla che la mappa non aveva');
  const catena = CC.buildChains({ nodes: vista.nodes, links: vista.links });
  assert.equal(catena.total, 0, 'la catena della vista non ha nessi');
  assert.equal(vista.nodes[1].desc, A1 + '\n' + C, 'un a capo, non uno spazio');
  // il difetto di prima, riprodotto: con uno spazio «A; quindi C» diventava una tripla nuova «siccità → prezzi»
  assert.equal(CC.extractDescTriples(A1 + ' ' + C, 'E', 'Economia di guerra').length, 1);
});

test('rettifiche (giro 4, E2): after e before si tagliano nello stesso modo — nel blocco non compare il frammento «A;» che il docente non ha scritto', () => {
  const G = require(path.join(JS, 'mappai-grounding-core.js'));
  const A1 = 'La Svizzera commerciava con gli Alleati;';
  const B = 'nel 1943 gli scambi con gli Alleati superarono quelli con la Germania;';
  const C = 'gli scambi passavano per il porto di Genova.';
  const D = 'Nel 1944 gli scambi calarono.';
  const D2 = 'Nel 1944 gli scambi con gli Alleati calarono.';
  const PRIMA = [A1, B, C, D].join(' ');
  const db = { nodes: [{ id: 'ROOT', label: 'Svizzera', level: 0, desc: 'La Svizzera restò neutrale durante la guerra.' },
    { id: 'C3', label: 'Commercio con gli Alleati', level: 1, desc: PRIMA }], links: [{ source: 'ROOT', target: 'C3', rel: 'include' }] };
  const report = { contratto: 'mappai-giudice@2', stato: 'completo', copertura: { nodiEsaminati: ['ROOT', 'C3'], nodiSaltati: [] },
    issues: [
      { id: 'i-1944', target: { kind: 'node', id: 'C3', field: 'desc' }, problem: 'Non dice con chi calarono gli scambi.' },
      { id: 'i-1943', target: { kind: 'node', id: 'C3', field: 'desc' }, problem: 'La fonte non dice «nel 1943 gli scambi con gli Alleati superarono quelli con la Germania».' }] };
  let rv = RC.createReview({ db, sources: SOURCES, report, generationId: 'g' });
  rv = RC.setDecision(rv, 'i-1944', 'manual', { text: PRIMA.replace(D, D2) });
  const rec = A.record(rv, db, { adesso: ADESSO });
  assert.equal(rec.completo, true, rec.motivo);
  assert.deepEqual(rec.escluse.map(e => e.testo), [B]);
  const cor = A.correggi(rv, db), vista = A.vistaDb(cor.db, rec);
  const nuove = A.rettifiche(cor.overrides, rec, vista, cor.db);
  const blocco = G.buildInput(vista, vista.nodes, SOURCES, Object.assign({}, rv, { overrides: nuove })).material.split('RETTIFICHE DEL DOCENTE')[1];
  assert.ok(blocco.includes(D2), 'la correzione del docente resta una rettifica');
  assert.ok(!blocco.includes(A1), 'il frammento «A;» non diventa testo del docente');
  assert.ok(!blocco.includes(C), 'nemmeno la frase dopo il taglio');
  assert.ok(!blocco.includes(B));
  // il difetto, riprodotto: tagliando solo `after`, il Segmenter vedeva «A;» e «C» come frasi nuove
  const soloAfter = Object.assign({}, nuove[0], { before: cor.overrides[0].before });
  assert.ok(G.amendmentText(soloAfter).includes(A1));
  // con una quasi-copia del docente il passo si taglia dal `before` (il record lo porta in `passi`):
  // l'unica modifica del docente cade su una frase esclusa, e la rettifica non resta
  const rq = revisioneRitocchi(), recq = A.record(rq, mappaRitocchi(), { adesso: ADESSO });
  const corq = A.correggi(rq, mappaRitocchi()), vistaq = A.vistaDb(corq.db, recq);
  const nuoveq = A.rettifiche(corq.overrides, recq, vistaq, corq.db);
  const bloccoq = G.buildInput(vistaq, vistaq.nodes, SOURCES, Object.assign({}, rq, { overrides: nuoveq })).material.split('RETTIFICHE DEL DOCENTE')[1] || '';
  assert.ok(!bloccoq.includes(MANDATO_PRIMA), 'la frase non toccata non diventa una rettifica');
  assert.ok(!bloccoq.includes('l\'organo che rappresenta'));
  assert.ok(!bloccoq.includes('Le banche svizzere ricevettero'));
});

/* ── Packet 0042, giro 5 del 26/09 ────────────────────────────────────────── */
/* La quarantena deve fallire CHIUSA. Il giro 4 cercava il passo contestato solo
   nel nodo bersaglio, parola per parola o come quasi-copia (0,8 nei due sensi):
   due revisori hanno mostrato che la frase contestata accorciata, allungata,
   fusa, spezzata, con una premessa lunga, riscritta tranne la clausola
   contestata, copiata con i trattini morbidi di un PDF o spostata in un altro
   nodo arrivava ai materiali, e la segnalazione risultava «superata». */
test('normalizza (giro 5, F1): toglie il trattino morbido e i caratteri a larghezza zero; impronte e contenimento li ignorano', () => {
  const pulita = 'Questo mandato è un incarico ufficiale.';
  const sporca = 'Questo man­dato è un inca­rico​ uffi‌ciale‍.﻿';
  assert.equal(A.normalizza(sporca), pulita);
  assert.equal(A.impronta(sporca), A.impronta(pulita));
  assert.equal(A.contenimento(MANDATO, MANDATO.replace('incarico', 'inca­rico').replace('Assemblea', 'Assem­blea')), 1);
  // il difetto di prima: «inca» e «rico» erano due parole, e il passo non si riprendeva tutto
  const DC = require(path.join(JS, 'mappai-deepen-core.js'));
  assert.ok(DC.lexicalOverlap(MANDATO, MANDATO.replace('incarico', 'inca­rico')).containment < 1);
});

test('CONTENIMENTO (giro 5, F1): la soglia prende tutti i casi dei revisori del giro 4; le due riscritture vere di Svizzera stanno sopra e si perdono', () => {
  assert.equal(A.CONTENIMENTO, 0.5);
  const q = f => A.contenimento(MANDATO, f);
  const revisori = {
    accorciata: 'Il mandato venne dall\'Assemblea Federale, l\'organo che rappresenta il popolo e i cantoni.',
    allungata: MANDATO.replace('per gestire la situazione di guerra.', 'per gestire la situazione di guerra, per difendere i confini nazionali e per coordinare l\'economia.'),
    fusa: MANDATO_PRIMA.replace(/\.$/, '') + ', e questo mandato è un incarico ufficiale dato dall\'Assemblea Federale, l\'organo che rappresenta il popolo e i cantoni, per gestire la situazione di guerra.',
    premessa: 'Secondo il manuale di storia svizzera adottato dalla scuola media, questo mandato è un incarico ufficiale dato dall\'Assemblea Federale, l\'organo che rappresenta il popolo e i cantoni, per gestire la situazione di guerra.',
    resto: 'Si trattava di un compito formale affidato dall\'Assemblea Federale, l\'organo che rappresenta il popolo e i cantoni, in vista del conflitto.'
  };
  for (const [nome, f] of Object.entries(revisori)) assert.ok(q(f) >= A.CONTENIMENTO, nome + ' ' + q(f));
  assert.equal(q(revisori.resto), 0.5, 'il caso più basso: la soglia non può stare sopra');
  // spezzata in due: la seconda metà, con la clausola contestata, da sola non arriva alla soglia; la coppia sì
  const A1 = 'Questo mandato è un incarico ufficiale dato dall\'Assemblea Federale.', B1 = 'L\'Assemblea è l\'organo che rappresenta il popolo e i cantoni.';
  assert.ok(q(B1) < A.CONTENIMENTO && q(B1) >= A.CONTENIMENTO / 2);
  assert.ok(q(A1 + ' ' + B1) >= A.CONTENIMENTO);
  // le riscritture vere di Svizzera (verso passo→frase): sopra la soglia, perse
  assert.ok(A.contenimento('Fino al 1943, la Svizzera accolse solo militari e rifugiati politici, respingendo molti ebrei.',
    'Secondo la scheda, fino al 1943 le autorità federali e cantonali accolsero soltanto rifugiati politici, militari internati e disertori, respingendo numerosi ebrei.') >= A.CONTENIMENTO);
  // una riscrittura che non riprende il passo resta sotto
  assert.ok(q('Il mandato fu conferito dal Parlamento per affrontare la guerra.') < A.CONTENIMENTO);
});

function conMandato(testo, opts) {
  const o = opts || {};
  const extra = { issues: (o.issues || []) };
  let r = revisioneRitocchi(extra);
  if (o.citato) r.initial.issues.find(i => i.id === 'i-mandato').problem = 'La fonte non definisce l\'Assemblea Federale come «l\'organo che rappresenta il popolo e i cantoni».';
  r = RC.setDecision(r, 'i-mandato-deciso', 'manual', { text: testo });
  return r;
}
const vistaDi = (rv, db) => { const rec = A.record(rv, db || mappaRitocchi(), { adesso: ADESSO }); assert.equal(rec.completo, true, rec.motivo); return { rec, vista: A.vistaDb(A.correggi(rv, db || mappaRitocchi()).db, rec) }; };
const piatto = t => A.normalizza(t).toLowerCase().replace(/[’]/g, '\'');

test('corsie (giro 5, F1): i casi dei revisori del giro 4 — la clausola contestata non arriva mai ai materiali, in modo sovrapposizione e citato', () => {
  const casi = {
    ritocco: MANDATO_PRIMA + ' ' + MANDATO_DOCENTE,
    accorciata: MANDATO_PRIMA + ' Il mandato venne dall\'Assemblea Federale, l\'organo che rappresenta il popolo e i cantoni.',
    allungata: MANDATO_PRIMA + ' ' + MANDATO.replace('per gestire la situazione di guerra.', 'per gestire la situazione di guerra, per difendere i confini nazionali e per coordinare l\'economia.'),
    fusa: MANDATO_PRIMA.replace(/\.$/, '') + ', e questo mandato è un incarico ufficiale dato dall\'Assemblea Federale, l\'organo che rappresenta il popolo e i cantoni, per gestire la situazione di guerra.',
    spezzata: MANDATO_PRIMA + ' Questo mandato è un incarico ufficiale dato dall\'Assemblea Federale. L\'Assemblea è l\'organo che rappresenta il popolo e i cantoni.',
    premessa: MANDATO_PRIMA + ' Secondo il manuale di storia svizzera adottato dalla scuola media, questo mandato è un incarico ufficiale dato dall\'Assemblea Federale, l\'organo che rappresenta il popolo e i cantoni, per gestire la situazione di guerra.',
    resto: MANDATO_PRIMA + ' Si trattava di un compito formale affidato dall\'Assemblea Federale, l\'organo che rappresenta il popolo e i cantoni, in vista del conflitto.',
    trattini: MANDATO_PRIMA + ' ' + MANDATO.replace('incarico', 'inca­rico').replace('rappresenta', 'rappre­senta'),
    apostrofi: MANDATO_PRIMA + ' ' + MANDATO_DOCENTE.replace(/'/g, '’')
  };
  for (const citato of [false, true]) {
    for (const [nome, testo] of Object.entries(casi)) {
      const rv = conMandato(testo, { citato });
      assert.equal(A.passoContestato(rv.initial.issues.find(i => i.id === 'i-mandato')).modo, citato ? 'citato' : 'sovrapposizione');
      const c = A.corsie({ review: rv, db: mappaRitocchi() });
      assert.ok(!c.superate.includes('i-mandato'), nome + ': non è superata');
      // con i trattini morbidi la frase, normalizzata, È quella di prima: non è testo nuovo del docente
      assert.equal(c.esitiSegnalazioni['i-mandato'], nome === 'trattini' ? 'fuori' : 'ritoccata', nome);
      const { vista } = vistaDi(rv);
      const testoVista = piatto(vista.nodes.find(n => n.id === 'L1_0_L2_A_D3').desc);
      assert.ok(!testoVista.includes('rappresenta il popolo'), nome + (citato ? ' (citato)' : '') + ': ' + testoVista);
      if (nome !== 'fusa') assert.ok(testoVista.includes(piatto(MANDATO_PRIMA)), nome + ': la frase non contestata resta');
    }
    // la riscrittura vera: la segnalazione è superata e il testo del docente va ai materiali
    const vera = conMandato(MANDATO_PRIMA + ' Il mandato fu conferito dal Parlamento per affrontare la guerra.', { citato });
    const cv = A.corsie({ review: vera, db: mappaRitocchi() });
    assert.equal(cv.esitiSegnalazioni['i-mandato'], 'superata');
    assert.ok(vistaDi(vera).vista.nodes.find(n => n.id === 'L1_0_L2_A_D3').desc.includes('conferito dal Parlamento'));
  }
});

test('corsie (giro 5, F1): il passo SPOSTATO in un altro nodo con una decisione esce anche lì, e la segnalazione non è superata', () => {
  const ROOT = mappaRitocchi().nodes[0].desc;
  for (const citato of [false, true]) {
    let rv = conMandato(MANDATO_PRIMA, { citato, issues: [{ id: 'i-root', target: { kind: 'node', id: 'ROOT', field: 'desc' }, problem: 'Troppo generico.' }] });
    rv = RC.setDecision(rv, 'i-root', 'manual', { text: ROOT + ' Il mandato era un incarico ufficiale dato dall\'Assemblea Federale, l\'organo che rappresenta il popolo e i cantoni, per gestire la situazione di guerra.' });
    const c = A.corsie({ review: rv, db: mappaRitocchi() });
    const spostata = riga(c, 'ROOT', 'Il mandato era');
    assert.equal(spostata.corsia, 'fuori-contestata', citato ? 'citato' : 'sovrapposizione');
    assert.equal(spostata.issueId, 'i-mandato');
    assert.equal(spostata.ritoccata, true);
    assert.equal(spostata.via, citato ? 'frammento' : 'contenimento');
    assert.ok(!c.superate.includes('i-mandato'));
    assert.equal(riga(c, 'ROOT', 'Durante').corsia === 'fuori-contestata', false, 'il resto di ROOT resta');
    const testoVista = vistaDi(rv).vista.nodes.map(n => piatto(n.desc)).join('\n');
    assert.ok(!testoVista.includes('rappresenta il popolo'));
  }
});

/* Giro 7 (H7, al posto del «frammento su TUTTA la mappa» del giro 5): il frammento citato toglie una
   riga di un nodo che nessuna decisione ha toccato solo se copre almeno metà delle parole piene della sua
   frase base, oppure se la riga riprende quella frase base (τc). Un frammento breve e comune non svuota
   le frasi di un nodo che parla d'altro; nel bersaglio e nei nodi cambiati vale sempre. */
function conAltro(desc, problem) {
  const db = mappaRitocchi();
  db.nodes.push({ id: 'ALTRO', label: 'Assemblea Federale', level: 1, desc });
  db.links.push({ source: 'ROOT', target: 'ALTRO', rel: 'include' });
  const report = { contratto: 'mappai-giudice@2', stato: 'completo',
    copertura: { nodiEsaminati: ['ROOT', 'L1_0_L2_A_D3', 'L1_3_L2_B', 'ALTRO'], nodiSaltati: [] },
    issues: [{ id: 'i-citato', target: { kind: 'node', id: 'L1_0_L2_A_D3', field: 'desc' }, problem }] };
  return { db, rv: RC.createReview({ db, sources: SOURCES, report, generationId: 'g' }) };
}
test('corsie (giro 7, H7): il frammento citato fuori dal bersaglio toglie una riga solo se copre metà della sua frase base o se la riga la riprende', () => {
  const ORGANO = 'La fonte non definisce l\'Assemblea Federale come «l\'organo che rappresenta il popolo e i cantoni».';
  // (a) il frammento copre 4 parole piene su 14 della frase base (0,29), e la frase di ALTRO riprende la frase base
  // per 0,29 da sola e 0,43 con la frase accanto: resta — il frammento vale nel bersaglio, non qui
  assert.ok(A.contenimento(MANDATO, 'l\'organo che rappresenta il popolo e i cantoni') < A.CONTENIMENTO);
  const a = conAltro('L\'Assemblea Federale si riunisce a Berna. È l’organo che rappresenta il popolo e i cantoni nella Confederazione.', ORGANO);
  assert.equal(A.passoContestato(a.rv.initial.issues[0]).modo, 'citato');
  const ca = A.corsie({ review: a.rv, db: a.db });
  assert.notEqual(riga(ca, 'ALTRO', 'È l’organo').corsia, 'fuori-contestata', 'col giro 5 usciva');
  assert.notEqual(riga(ca, 'ALTRO', 'L\'Assemblea Federale si riunisce').corsia, 'fuori-contestata');
  const nelBersaglio = riga(ca, 'L1_0_L2_A_D3', 'Questo mandato');
  assert.equal(nelBersaglio.corsia, 'fuori-contestata');
  assert.equal(nelBersaglio.via, 'frammento');
  assert.equal(vistaDi(a.rv, a.db).rec.conteggi.perFrammento, 1, 'solo la frase del bersaglio');
  // (b) un frammento che copre più di metà della sua frase base: esce anche la frase di ALTRO che lo contiene
  const LUNGO = 'La fonte non dice «Questo mandato è un incarico ufficiale dato dall\'Assemblea Federale, l\'organo che rappresenta il popolo».';
  assert.ok(A.contenimento(MANDATO, 'Questo mandato è un incarico ufficiale dato dall\'Assemblea Federale, l\'organo che rappresenta il popolo') >= A.CONTENIMENTO);
  const b = conAltro('Il Parlamento si riunisce a Berna. Si sa che questo mandato è un incarico ufficiale dato dall’Assemblea Federale, l’organo che rappresenta il popolo.', LUNGO);
  const cb = A.corsie({ review: b.rv, db: b.db });
  const altrove = riga(cb, 'ALTRO', 'Si sa che');
  assert.equal(altrove.corsia, 'fuori-contestata');
  assert.equal(altrove.issueId, 'i-citato');
  assert.notEqual(riga(cb, 'ALTRO', 'Il Parlamento si riunisce').corsia, 'fuori-contestata', 'la frase che non lo contiene resta');
  // (c) il frammento breve in un nodo che una decisione ha CAMBIATO: vale anche lì (il passo spostato)
  const report = { contratto: 'mappai-giudice@2', stato: 'completo',
    copertura: { nodiEsaminati: ['ROOT', 'L1_0_L2_A_D3', 'L1_3_L2_B'], nodiSaltati: [] },
    issues: [{ id: 'i-citato', target: { kind: 'node', id: 'L1_0_L2_A_D3', field: 'desc' }, problem: ORGANO },
      { id: 'i-root', target: { kind: 'node', id: 'ROOT', field: 'desc' }, problem: 'Troppo generico.' }] };
  let rc = RC.createReview({ db: mappaRitocchi(), sources: SOURCES, report, generationId: 'g' });
  rc = RC.setDecision(rc, 'i-root', 'manual', { text: mappaRitocchi().nodes[0].desc + ' Il Parlamento è l\'organo che rappresenta il popolo e i cantoni.' });
  const cc = A.corsie({ review: rc, db: mappaRitocchi() });
  const spostato = riga(cc, 'ROOT', 'Il Parlamento è');
  assert.equal(spostato.corsia, 'fuori-contestata');
  assert.equal(spostato.via, 'frammento');
  assert.equal(spostato.ritoccata, true);
});

test('corsie (giro 5, F1): la coppia prende la frase spezzata, non la frase accanto che ripete una parola sola del passo (L1_4 di Svizzera)', () => {
  const PASSO_L1_4 = 'Fino al 1943, la Svizzera accolse solo militari e rifugiati politici, respingendo molti ebrei.';
  const RISCRITTA = 'Secondo la scheda, fino al 1943 le autorità federali e cantonali accolsero soltanto rifugiati politici, militari internati e disertori, respingendo numerosi ebrei.';
  const DOPO = 'Quando la possibilità di una vittoria tedesca apparve ormai scongiurata, le restrizioni furono allentate e la Svizzera adottò un atteggiamento più generoso nell\'accoglienza.';
  const report = rapporto();
  report.issues.push({ id: 'i-deciso', target: { kind: 'node', id: 'L1_4', field: 'desc' }, problem: 'Da riscrivere.' },
    { id: 'i-aperta', target: { kind: 'node', id: 'L1_4', field: 'desc' },
      problem: 'Il documento sostiene che la Svizzera abbia respinto un numero altissimo di ebrei fino al 1943, ma non conferma che abbia accolto solo militari e rifugiati politici, escludendo altri profughi.' });
  const rv = RC.setDecision(revisione({ report }), 'i-deciso', 'manual', { text: PROFUGHI.replace(PASSO_L1_4, RISCRITTA + ' ' + DOPO) });
  const c = A.corsie({ review: rv, db: mappa() });
  assert.equal(riga(c, 'L1_4', 'Secondo la scheda').corsia, 'fuori-contestata');
  assert.equal(riga(c, 'L1_4', 'Quando la possibilità').corsia, 'docente', 'la frase accanto non esce con lei');
  assert.ok(A.contenimento(PASSO_L1_4, DOPO) < A.CONTENIMENTO / 2, 'ripete soltanto «Svizzera»');
});

test('corsie (giro 6, G1): con \'nodo\' il testo scritto o ritoccato dal docente resta, anche quando riprende una frase base del nodo — in coppia o spostato in un altro nodo', () => {
  const report = rapporto();
  report.issues.push({ id: 'i-vaga', target: { kind: 'node', id: 'L1_2_C3', field: 'desc' }, problem: 'Tono troppo netto' },
    { id: 'i-c3', target: { kind: 'node', id: 'L1_2_C3', field: 'desc' }, problem: 'Da riscrivere.' });
  const base = rapporto().issues.filter(i => i.id !== 'i-docente');
  report.issues = base.concat(report.issues.filter(i => i.id === 'i-vaga' || i.id === 'i-c3'));
  const con = testo => RC.setDecision(revisione({ report }), 'i-c3', 'manual', { text: testo });
  assert.equal(A.passoContestato(report.issues.find(i => i.id === 'i-vaga')).modo, 'nodo', 'problema troncato: non si localizza');
  // la frase sul valore del commercio spezzata in due dal docente: insieme riprendono la frase base
  // (col giro 5, F2, uscivano in coppia e la segnalazione era «ritoccata»)
  const SPEZZATA = 'La Svizzera ha continuato a commerciare con gli Alleati, specialmente con gli USA. Il valore di questo commercio era però basso. Era solo un terzo rispetto a quello con la Germania.';
  const c = A.corsie({ review: con(SPEZZATA), db: mappa() });
  assert.ok(A.contenimento('Il valore di questo commercio era però basso: era solo un terzo rispetto a quello con la Germania.',
    'Il valore di questo commercio era però basso. Era solo un terzo rispetto a quello con la Germania.') >= A.CONTENIMENTO);
  assert.equal(riga(c, 'L1_2_C3', 'La Svizzera ha continuato').corsia, 'fuori-contestata', 'la frase base tenuta tale e quale esce');
  assert.equal(riga(c, 'L1_2_C3', 'La Svizzera ha continuato').modo, 'nodo');
  assert.equal(riga(c, 'L1_2_C3', 'Il valore di questo commercio').corsia, 'docente');
  assert.equal(riga(c, 'L1_2_C3', 'Era solo un terzo').corsia, 'docente');
  assert.equal(c.esitiSegnalazioni['i-vaga'], 'fuori');
  // la frase base SPOSTATA PAROLA PER PAROLA dal docente in un altro nodo con una sua decisione:
  // col giro 6 restava come «testo del docente»; col giro 7 (H6) non lo è — il docente non l'ha scritta — ed esce
  const SPOSTATA = 'Il valore di questo commercio era però basso: era solo un terzo rispetto a quello con la Germania.';
  const rs = RC.setDecision(con('La Svizzera ha continuato a commerciare con gli Alleati, specialmente con gli USA.'),
    'i-categoria', 'manual', { text: DIFESA + ' ' + SPOSTATA });
  const cs = A.corsie({ review: rs, db: mappa() });
  const spostata = riga(cs, 'L1_1', 'Il valore di questo commercio');
  assert.equal(spostata.corsia, 'fuori-contestata');
  assert.equal(spostata.modo, 'nodo');
  assert.equal(spostata.issueId, 'i-vaga');
  assert.equal(spostata.bersaglio, 'L1_2_C3');
  assert.equal(riga(cs, 'L1_1', 'Questa categoria descrive').corsia !== 'fuori-contestata', true, 'il resto di L1_1 resta');
  assert.equal(riga(cs, 'L1_2_C3', 'La Svizzera ha continuato').corsia, 'fuori-contestata');
  // una riscrittura che non riprende nessuna frase base resta
  const NUOVA = 'Gli scambi con Londra e Washington proseguirono a fatica.';
  const c2 = A.corsie({ review: con(NUOVA), db: mappa() });
  assert.equal(riga(c2, 'L1_2_C3', 'Gli scambi con Londra').corsia, 'docente');
  assert.equal(c2.esitiSegnalazioni['i-vaga'], 'docente');
});

test('documento dei nessi (giro 5, F3): «contiene una frase» solo quando la riga la contiene; la riga che viene soltanto dal nodo dice «tocca un nodo»', () => {
  const CC = require(path.join(JS, 'mappai-causal-core.js'));
  const FONTE = [{ nome: 'f.pdf', pages: [{ n: 1, text: 'Durante la guerra la Svizzera introdusse il razionamento del cibo per tutta la popolazione civile e militare.' }] }];
  const base = () => ({ nodes: [{ id: 'ROOT', label: 'Svizzera', level: 0, desc: 'La Confederazione restò neutrale per tutta la durata del conflitto.' },
    { id: 'X', label: 'Economia di guerra', level: 1, desc: 'La guerra provocò la fame. Il razionamento del cibo valeva per tutta la popolazione.' }],
    links: [{ source: 'ROOT', target: 'X', rel: 'include' }] });
  const motivo = problem => {
    const db = base(); db.causalDoc = CC.docFromChains(CC.buildChains({ nodes: db.nodes, links: db.links }), {});
    const report = { contratto: 'mappai-giudice@2', stato: 'completo', copertura: { nodiEsaminati: ['ROOT', 'X'], nodiSaltati: [] },
      issues: [{ id: 'i1', target: { kind: 'node', id: 'X', field: 'desc' }, problem }] };
    const rec = A.record(RC.createReview({ db, sources: FONTE, report, generationId: 'g' }), db, { adesso: ADESSO });
    assert.equal(rec.completo, true, rec.motivo);
    return rec.causalDocMotivo;
  };
  assert.equal(motivo('La fonte non dice «La guerra provocò la fame».'), 'frase_esclusa');
  assert.equal(motivo('La fonte non dice «Il razionamento del cibo valeva per tutta la popolazione».'), 'nodo_con_esclusioni');
});

/* ── Packet 0042, giro 7 del 26/09: i ritocchi naturali del docente e gli artefatti del PDF ── */
test('corsie (giro 7, H1): la frase contestata spezzata in TRE frasi brevi (0,43 + 0,21 + 0,21) non arriva ai materiali; la frase accanto con una parola sola resta', () => {
  const P1 = 'Questo mandato era un incarico ufficiale per gestire la situazione di guerra.';
  const P2 = 'Lo ha dato l\'Assemblea Federale.';
  const P3 = 'Si tratta dell\'organo che rappresenta i cantoni.';
  const q = t => A.contenimento(MANDATO, t);
  assert.deepEqual([P1, P2, P3].map(t => Math.round(q(t) * 100) / 100), [0.43, 0.21, 0.21]);
  assert.ok(q(P1 + ' ' + P2) >= A.CONTENIMENTO && q(P2 + ' ' + P3) < A.CONTENIMENTO);
  for (const citato of [false, true]) {
    const rv = conMandato(MANDATO_PRIMA + ' ' + P1 + ' ' + P2 + ' ' + P3, { citato });
    assert.equal(A.passoContestato(rv.initial.issues.find(i => i.id === 'i-mandato')).modo, citato ? 'citato' : 'sovrapposizione');
    const c = A.corsie({ review: rv, db: mappaRitocchi() });
    for (const inizio of ['Questo mandato era', 'Lo ha dato', 'Si tratta dell']) {
      const r = riga(c, 'L1_0_L2_A_D3', inizio);
      assert.equal(r.corsia, 'fuori-contestata', inizio + (citato ? ' (citato)' : ''));
      assert.equal(r.issueId, 'i-mandato');
      assert.equal(r.ritoccata, true, 'è testo del docente, e riprende il passo');
    }
    assert.notEqual(riga(c, 'L1_0_L2_A_D3', 'Il Consiglio Federale').corsia, 'fuori-contestata', 'la frase che non riprende il passo resta');
    assert.equal(c.esitiSegnalazioni['i-mandato'], 'ritoccata');
    const { rec, vista } = vistaDi(rv);
    const testo = piatto(vista.nodes.find(n => n.id === 'L1_0_L2_A_D3').desc);
    assert.ok(!testo.includes('rappresenta i cantoni') && !testo.includes('assemblea federale'), testo);
    assert.ok(testo.includes(piatto(MANDATO_PRIMA)));
    assert.ok(rec.conteggi.perFinestra >= 2, 'le due frasi brevi entrano solo dentro una finestra');
  }
  // il prezzo si paga solo con una parte vera del passo: la frase accanto con UNA parola del passo resta,
  // anche quando è l'unica parola che alla ripresa manca (L1_0_L2_A_D3: «mandato» nella frase di prima)
  const resto = conMandato(MANDATO_PRIMA + ' Si trattava di un compito formale affidato dall\'Assemblea Federale, l\'organo che rappresenta il popolo e i cantoni, in vista del conflitto.');
  const cr = A.corsie({ review: resto, db: mappaRitocchi() });
  assert.equal(riga(cr, 'L1_0_L2_A_D3', 'Si trattava').corsia, 'fuori-contestata');
  assert.notEqual(riga(cr, 'L1_0_L2_A_D3', 'Il Consiglio Federale').corsia, 'fuori-contestata');
});

test('normalizza (giro 7, H2): NFKC e TUTTI i caratteri di formato (U+2060, U+00AD, U+200E…) e U+034F; il passo ritoccato così resta il passo, non testo del docente', () => {
  const pulita = 'Questo mandato è un incarico ufficiale.';
  for (const sporca of ['Questo man\u2060dato è un inca\u00ADrico ufficiale.', 'Questo mandato è un incarico u\uFB03ciale.',
    '\u200EQuesto mandato è un incarico\u00A0ufficiale.\u2060', 'Questo mandato e\u0300 un inca\u034Frico ufficiale.']) {
    assert.equal(A.normalizza(sporca), pulita, JSON.stringify(sporca));
    assert.equal(A.impronta(sporca), A.impronta(pulita));
    assert.equal(A.contenimento(MANDATO, sporca.replace(/\.$/, '') + ' dato dall\'Assemblea Federale.'), A.contenimento(MANDATO, 'Questo mandato è un incarico ufficiale dato dall\'Assemblea Federale.'));
  }
  // il passo contestato ricopiato da un PDF col word joiner e col trattino morbido: è la stessa frase, non
  // un ritocco del docente — esce come frase base, e la segnalazione non diventa «ritoccata»
  for (const citato of [false, true]) {
    const sporco = MANDATO.replace('incarico', 'inca\u00ADrico').replace('rappresenta', 'rappre\u2060senta').replace('cantoni', 'can\u2060toni');
    const rv = conMandato(MANDATO_PRIMA + ' ' + sporco, { citato });
    const c = A.corsie({ review: rv, db: mappaRitocchi() });
    const r = riga(c, 'L1_0_L2_A_D3', 'Questo mandato');
    assert.equal(r.corsia, 'fuori-contestata');
    assert.ok(!r.ritoccata, 'normalizzata, è la frase di prima');
    assert.equal(c.esitiSegnalazioni['i-mandato'], 'fuori');
  }
  // il frammento citato si ritrova nel testo com'è, anche con la legatura e il word joiner in mezzo
  const issue = { before: 'Prima frase qui. Il mandato è u\uFB03ciale e rappre\u2060senta il popolo e i cantoni.', problem: 'Non è vero che «il mandato è ufficiale e rappresenta il popolo».' };
  const p = A.passoContestato(issue);
  assert.equal(p.modo, 'citato');
  assert.equal(p.passi.length, 1);
  assert.ok(p.passi[0].testo.startsWith('Il mandato'));
});

test('corsie (giro 7, H3): con un passo individuato la frase base si cerca in TUTTI i nodi — la copia identica nel figlio _D che nessuna decisione ha toccato esce', () => {
  const COPIA = 'La Svizzera accolse circa 300.000 persone e 21.000 ebrei.';
  const db = mappa();
  db.nodes.push({ id: 'L1_4_D1', label: 'Numeri dell\'accoglienza', level: 2, desc: 'I profughi arrivarono da tutta Europa. ' + COPIA });
  db.links.push({ source: 'L1_4', target: 'L1_4_D1', rel: 'approfondisce' });
  const report = rapporto({ copertura: { nodiTotali: 9, nodiEsaminati: ESAMINATI.concat(['L1_4_D1']), nodiSaltati: [{ id: 'L1_3', motivo: 'tempo scaduto' }] } });
  const rv = revisione({ db, report });
  assert.equal(A.passoContestato(rv.initial.issues.find(i => i.id === 'i-profughi')).modo, 'sovrapposizione');
  const c = A.corsie({ review: rv, db });
  const copia = riga(c, 'L1_4_D1', 'La Svizzera accolse');
  assert.equal(copia.corsia, 'fuori-contestata', 'col giro 6 restava nei materiali');
  assert.equal(copia.issueId, 'i-profughi');
  assert.equal(copia.via, 'frase');
  assert.equal(copia.bersaglio, 'L1_4');
  assert.notEqual(riga(c, 'L1_4_D1', 'I profughi arrivarono').corsia, 'fuori-contestata');
  const rec = A.record(rv, db, { adesso: ADESSO });
  assert.equal(rec.completo, true, rec.motivo);
  const vista = A.vistaDb(A.correggi(rv, db).db, rec);
  assert.ok(vista.nodes.every(n => !String(n.desc).includes('21.000 ebrei')));
  // con 'nodo' la ricerca resta sul bersaglio e sui nodi cambiati: la copia nel figlio non toccato resta
  const repN = rapporto({ copertura: report.copertura });
  repN.issues = repN.issues.filter(i => i.id !== 'i-profughi').concat([{ id: 'i-profughi-vaga', target: { kind: 'node', id: 'L1_4', field: 'desc' }, problem: 'Numeri da ricontrollare' }]);
  const cn = A.corsie({ review: revisione({ db, report: repN }), db });
  assert.equal(riga(cn, 'L1_4', 'La Svizzera accolse').corsia, 'fuori-contestata');
  assert.notEqual(riga(cn, 'L1_4_D1', 'La Svizzera accolse').corsia, 'fuori-contestata');
});

test('passoContestato e corsie (giro 7, H4): con \'proposta\' il problema che contesta due frasi le toglie tutte e due, anche se la proposta ne corregge una', () => {
  const S1 = 'Nel 1939 il generale Guisan fu eletto dal Consiglio Federale.';
  const S2 = 'Guisan comandò l\'esercito svizzero fino al 1950.';
  const S3 = 'La mobilitazione coinvolse tutti i soldati.';
  const before = S1 + ' ' + S2 + ' ' + S3;
  const after = S1.replace('dal Consiglio Federale', 'dall\'Assemblea Federale') + ' ' + S2 + ' ' + S3;
  const conProblema = problem => {
    const db = { nodes: [{ id: 'ROOT', label: 'Svizzera', level: 0, desc: 'La Svizzera restò neutrale durante la guerra.' }, { id: 'G', label: 'Guisan', level: 1, desc: before }],
      links: [{ source: 'ROOT', target: 'G', rel: 'include' }] };
    const report = { contratto: 'mappai-giudice@2', stato: 'completo', copertura: { nodiEsaminati: ['ROOT', 'G'], nodiSaltati: [] },
      issues: [{ id: 'i-guisan', target: { kind: 'node', id: 'G', field: 'desc' }, after, problem }] };
    return { db, rv: RC.createReview({ db, sources: SOURCES, report, generationId: 'g' }) };
  };
  for (const problem of [
    'Guisan fu eletto dall\'Assemblea Federale, non dal Consiglio Federale; e la fonte non dice che «Guisan comandò l\'esercito svizzero fino al 1950».',
    'Guisan fu eletto dall\'Assemblea Federale, non dal Consiglio Federale; e la fonte non dice che comandò l\'esercito fino al 1950.'
  ]) {
    const { db, rv } = conProblema(problem);
    const issue = rv.initial.issues[0];
    assert.equal(issue.hasProposal, true);
    const p = A.passoContestato(issue);
    assert.equal(p.modo, 'proposta');
    assert.ok(p.passi.some(x => x.testo.includes('fino al 1950')), 'la seconda frase contestata entra nel passo');
    assert.ok(!p.passi.some(x => x.testo.includes('mobilitazione')), 'la terza no');
    const c = A.corsie({ review: rv, db });
    assert.equal(riga(c, 'G', 'Nel 1939').corsia, 'fuori-contestata');
    assert.equal(riga(c, 'G', 'Guisan comandò').corsia, 'fuori-contestata', 'col giro 6 arrivava ai materiali');
    assert.notEqual(riga(c, 'G', 'La mobilitazione').corsia, 'fuori-contestata');
    assert.equal(riga(c, 'G', 'Guisan comandò').modo, 'proposta');
  }
  // con le virgolette il record porta il frammento, come per 'citato'
  assert.deepEqual(A.passoContestato(conProblema('La fonte non dice che «Guisan comandò l\'esercito svizzero fino al 1950».').rv.initial.issues[0]).frammenti,
    ['Guisan comandò l\'esercito svizzero fino al 1950']);
});

test('corsie (giro 7, H5): con \'nodo\' sul bersaglio sbagliato esce anche la frase dell\'altro nodo di cui parla il problema — il caso 899d5 di Svizzera', () => {
  const ECONOMIA = 'La Svizzera adottò il piano Wahlen per garantire il cibo alla popolazione. Questo piano prevedeva l\'estensione della campicoltura, cioè la coltivazione della terra. Lo Stato usò un sistema di razionamento per dividere le provvigioni in modo controllato. Ogni terreno disponibile fu seminato e i cittadini dovettero fare scorta di cibo per evitare la fame durante il conflitto.';
  const BELLIGERANTI = 'La convenzione dell’Aia è un accordo internazionale. Questo accordo permette agli stati neutrali di commerciare liberamente con i paesi in guerra. Grazie a questa regola, la Svizzera ha potuto vendere merci e armamenti agli stati che combattevano.';
  const db = { nodes: [
    { id: 'ROOT', label: 'Svizzera e 2a GM', level: 0, desc: 'La Confederazione restò fuori dal conflitto e difese la sua indipendenza.' },
    { id: 'L1_2', label: 'Economia di Guerra', level: 1, desc: ECONOMIA },
    { id: 'L1_2_C1', label: 'Commercio con i belligeranti', level: 2, desc: BELLIGERANTI },
    { id: 'L1_2_L2_B', label: 'Sistema di razionamento', level: 2, desc: RAZIONAMENTO }],
  links: [{ source: 'ROOT', target: 'L1_2', rel: 'include' }, { source: 'L1_2', target: 'L1_2_C1', rel: 'include' }, { source: 'L1_2', target: 'L1_2_L2_B', rel: 'include' }] };
  // il problema com'è nel rapporto vero (troncato dal vecchio maxLength del Giudice)
  const PROBLEMA = 'La Svizzera ha adottato misure per conservare la sua neutralità durante la Seconda Guerra Mondiale. Tuttavia, non è vero che ha commercio liberamente con tutti i paesi belligeranti';
  const report = { contratto: 'mappai-giudice@2', stato: 'completo', copertura: { nodiEsaminati: ['ROOT', 'L1_2', 'L1_2_C1', 'L1_2_L2_B'], nodiSaltati: [] },
    issues: [{ id: 'issue-r1-899d5add967e2c2f-1236', target: { kind: 'node', id: 'L1_2', field: 'desc' }, problem: PROBLEMA, type: 'fatto-contraddetto' }] };
  const rv = RC.createReview({ db, sources: SOURCES, report, generationId: 'g' });
  assert.equal(A.passoContestato(rv.initial.issues[0]).modo, 'nodo');
  const c = A.corsie({ review: rv, db });
  c.righe.filter(r => r.nodeId === 'L1_2').forEach(r => { assert.equal(r.corsia, 'fuori-contestata'); assert.equal(r.modo, 'nodo'); });
  const altrove = riga(c, 'L1_2_C1', 'Questo accordo permette');
  assert.equal(altrove.corsia, 'fuori-contestata', 'col giro 6 restava nei materiali');
  assert.deepEqual([altrove.issueId, altrove.modo, altrove.via, altrove.bersaglio], ['issue-r1-899d5add967e2c2f-1236', 'nodo', 'problema', 'L1_2']);
  // la regola della misura: 0,71 delle parole piene della frase nel problema, contro 0,14 della migliore del bersaglio
  const quota = t => require(path.join(JS, 'mappai-deepen-core.js')).lexicalOverlap(A.normalizza(t), A.normalizza(PROBLEMA)).containment;
  assert.ok(quota(altrove.testo) >= 0.5);
  assert.ok(quota(altrove.testo) - Math.max(...A.affermazioni(ECONOMIA).map(a => quota(a.testo))) >= 0.2);
  assert.deepEqual(A.altroveNelProblema(PROBLEMA, c.righe, 'L1_2').map(r => r.testo), [altrove.testo]);
  // la frase che la segue («Grazie a questa regola…») esce per coesione; la prima di L1_2_C1 e l'altro nodo restano
  assert.equal(riga(c, 'L1_2_C1', 'Grazie a questa regola').corsia, 'fuori-coesione');
  assert.notEqual(riga(c, 'L1_2_C1', 'La convenzione').corsia, 'fuori-contestata');
  c.righe.filter(r => r.nodeId === 'L1_2_L2_B').forEach(r => assert.ok(!A.FUORI.includes(r.corsia), r.testo));
  assert.equal(A.record(rv, db, { adesso: ADESSO }).conteggi.perProblema, 1);
});

test('corsie (giro 7, H6): con \'nodo\' resta il testo che il docente ha davvero scritto — non la frase base spostata parola per parola né quella «promossa» dall\'unione col frammento che finisce con «:»', () => {
  const CAUSE = 'Le cause erano due: la crisi economica. La paura dell\'invasione spinse il governo ad agire. Il governo rafforzò l\'esercito.';
  assert.deepEqual(A.affermazioni(CAUSE).map(a => a.testo), ['Le cause erano due: la crisi economica.', 'La paura dell\'invasione spinse il governo ad agire.', 'Il governo rafforzò l\'esercito.']);
  const db = () => ({ nodes: [{ id: 'ROOT', label: 'Svizzera', level: 0, desc: 'La Svizzera restò neutrale durante la guerra.' },
    { id: 'C', label: 'Cause', level: 1, desc: CAUSE }], links: [{ source: 'ROOT', target: 'C', rel: 'include' }] });
  const con = testo => {
    const report = { contratto: 'mappai-giudice@2', stato: 'completo', copertura: { nodiEsaminati: ['ROOT', 'C'], nodiSaltati: [] },
      issues: [{ id: 'i-taglio', target: { kind: 'node', id: 'C', field: 'desc' }, problem: 'Da rivedere.' },
        { id: 'i-vaga', target: { kind: 'node', id: 'C', field: 'desc' }, problem: 'Tono troppo netto' }] };
    return RC.setDecision(RC.createReview({ db: db(), sources: SOURCES, report, generationId: 'g' }), 'i-taglio', 'manual', { text: testo });
  };
  // il docente toglie «la crisi economica.»: il frammento con «:» si unisce alla frase che segue, e l'unione
  // è «nuova» per l'impronta — ma contiene parola per parola una frase base del nodo: non l'ha scritta lui
  const promossa = A.corsie({ review: con('Le cause erano due: La paura dell\'invasione spinse il governo ad agire. Il governo rafforzò l\'esercito.'), db: db() });
  const unione = riga(promossa, 'C', 'Le cause erano due:');
  assert.equal(unione.corsia, 'fuori-contestata', 'col giro 6 restava come testo del docente');
  assert.equal(unione.ritoccata, true);
  assert.equal(unione.modo, 'nodo');
  assert.equal(promossa.esitiSegnalazioni['i-vaga'], 'fuori', 'non «ritoccata»: con \'nodo\' non c\'è un passo a cui somigliare');
  // la riscrittura vera resta
  const vera = A.corsie({ review: con('Le cause erano due: la crisi e il timore di un attacco tedesco. Il governo rafforzò l\'esercito.'), db: db() });
  assert.equal(riga(vera, 'C', 'Le cause erano due:').corsia, 'docente');
  assert.equal(riga(vera, 'C', 'Il governo rafforzò').corsia, 'fuori-contestata', 'la frase base tenuta tale e quale esce');
  // una frase base ritoccata dal docente (una parola) resta: la quarantena si fida del testo che ha scritto
  const ritocco = A.corsie({ review: con(CAUSE.replace('spinse il governo', 'spinse il Consiglio federale')), db: db() });
  assert.equal(riga(ritocco, 'C', 'La paura dell\'invasione').corsia, 'docente');
});

test('corsie (giro 7, H10): esito «docente» solo se nessuna riga del bersaglio è fuori; altrimenti «docente-in-parte»', () => {
  // L1_5_L2_A tutto del docente; una segnalazione citata aperta toglie la sua frase militare (ritoccata), una 'nodo' no
  const TUTTO = 'La Svizzera fu criticata per il suo comportamento nella guerra. Inoltre, la Svizzera è stata accusata di aver prolungato la guerra rifornendo la Germania di materiale militare.';
  const rep = rapporto();
  rep.issues.push({ id: 'i-accuse-citata', target: { kind: 'node', id: 'L1_5_L2_A', field: 'desc' },
    problem: 'La fonte non dice «Inoltre, lo Stato è accusato di aver aiutato la Germania fornendo materiale militare».' },
  { id: 'i-accuse-vaga', target: { kind: 'node', id: 'L1_5_L2_A', field: 'desc' }, problem: 'Tono troppo netto' });
  const rv = RC.setDecision(revisione({ report: rep }), 'i-militare', 'manual', { text: TUTTO });
  const c = A.corsie({ review: rv, db: mappa() });
  assert.equal(c.esitiSegnalazioni['i-accuse-citata'], 'ritoccata');
  assert.equal(c.esitiSegnalazioni['i-accuse-vaga'], 'docente-in-parte', 'col giro 6 diceva «docente»: il testo del nodo resta nei materiali, e non era vero');
  assert.ok(c.senzaEffetto.includes('i-accuse-vaga'));
  assert.deepEqual(A.record(rv, mappa(), { adesso: ADESSO }).segnalazioniSenzaEffetto.find(x => x.issueId === 'i-accuse-vaga'), { issueId: 'i-accuse-vaga', esito: 'docente-in-parte' });
  // senza la citata, niente del nodo è fuori: «docente»
  const rep2 = rapporto(); rep2.issues.push(rep.issues.find(i => i.id === 'i-accuse-vaga'));
  const c2 = A.corsie({ review: RC.setDecision(revisione({ report: rep2 }), 'i-militare', 'manual', { text: TUTTO }), db: mappa() });
  assert.equal(c2.esitiSegnalazioni['i-accuse-vaga'], 'docente');
});
test('corsie (giro 8, I3): H5 vale solo per le segnalazioni del Giudice — quella «Modifica del docente» non toglie le frasi di altri nodi', () => {
  const db = () => ({ nodes: [
    { id: 'ROOT', label: 'Svizzera e 2a GM', level: 0, desc: 'La Confederazione restò fuori dal conflitto.' },
    { id: 'X', label: 'Commercio con i belligeranti', level: 1, desc: 'La Svizzera vendeva merci agli stati in guerra. Le esportazioni crebbero negli anni del conflitto.' },
    { id: 'Y', label: 'Economia', level: 1, desc: 'Il commercio con i belligeranti fu regolato da accordi. La Banca Nazionale comprò oro.' }],
  links: [{ source: 'ROOT', target: 'X', rel: 'include' }, { source: 'ROOT', target: 'Y', rel: 'include' }] });
  const PROBLEMA = 'Modifica del docente: Commercio con i belligeranti';
  const con = origin => {
    const report = { contratto: 'mappai-giudice@2', stato: 'completo', copertura: { nodiEsaminati: ['ROOT', 'X', 'Y'], nodiSaltati: [] },
      issues: [{ id: 'i-x', origin, target: { kind: 'node', id: 'X', field: 'desc' }, problem: PROBLEMA }] };
    return RC.createReview({ db: db(), sources: SOURCES, report, generationId: 'g' });
  };
  const ALTRA = 'Il commercio con i belligeranti fu regolato da accordi.';
  // la frase di Y sta nel problema per metà delle sue parole piene: per il Giudice «parla di un altro nodo»
  assert.deepEqual(A.altroveNelProblema(PROBLEMA, A.corsie({ review: con('judge'), db: db() }).righe, 'X').map(r => r.testo), [ALTRA]);
  const docente = con('teacher');
  assert.equal(docente.initial.issues[0].origin, 'teacher');
  assert.equal(A.passoContestato(docente.initial.issues[0]).modo, 'nodo');
  const c = A.corsie({ review: docente, db: db() });
  c.righe.filter(r => r.nodeId === 'X').forEach(r => { assert.equal(r.corsia, 'fuori-contestata'); assert.equal(r.origine, 'docente'); });
  assert.notEqual(riga(c, 'Y', 'Il commercio').corsia, 'fuori-contestata', 'col giro 7 usciva');
  assert.equal(A.record(docente, db(), { adesso: ADESSO }).conteggi.perProblema, 0);
  // la stessa segnalazione dal Giudice: la frase di Y esce, via 'problema'
  const g = A.corsie({ review: con('judge'), db: db() });
  const altrove = riga(g, 'Y', 'Il commercio');
  assert.deepEqual([altrove.corsia, altrove.via, altrove.bersaglio], ['fuori-contestata', 'problema', 'X']);
});

/* ── Packet 0041: le frasi della fonte rimaste fuori dalla mappa (regola v2) ──
   Le frasi della fonte e le affermazioni vengono da Svizzera (la copia misurata
   il 26/9), ridotte: ogni frase si confronta con l'UNIONE delle affermazioni più
   vicine in tutta la mappa, e gli elementi chiave si cercano in tutta la mappa. */
const ORF_DB = { nodes: [
  { id: 'R', label: 'Svizzera e 2a GM', level: 0, desc: 'Durante la Seconda Guerra Mondiale la Svizzera restò neutrale.' },
  { id: 'G', label: 'Henri Guisan', level: 1, desc: 'Il 30 agosto 1939 l\'Assemblea Federale ha nominato Henri Guisan Comandante in Capo dell\'Esercito Svizzero con il grado di Generale.' },
  { id: 'M', label: 'Misure di Mobilitazione', level: 1, desc: 'Per proteggere il territorio, lo Stato ha decretato la mobilitazione generale, che significa chiamare tutti i soldati al servizio.' },
  { id: 'T', label: 'Blocchi Toblerone', level: 2, desc: 'I blocchi Toblerone erano distese di blocchi di cemento triangolari costruiti lungo i confini. ' +
    'La Svizzera eresse queste opere di sbarramento per rallentare l\'avanzata dei carri armati tedeschi verso il territorio svizzero.' },
  { id: 'C', label: 'Convenzione dell\'Aia', level: 2, desc: 'La convenzione dell’Aia è un accordo internazionale. Questo accordo permette agli stati neutrali di commerciare liberamente con i paesi in guerra. ' +
    'Grazie a questa regola, la Svizzera ha potuto vendere merci e armamenti agli stati che combattevano.' },
  { id: 'E', label: 'Esportazioni verso l\'Asse', level: 2, desc: 'Tra il 1940 e il 1944, la Germania è stata il paese che ha comprato più prodotti svizzeri. ' +
    'Le esportazioni svizzere andavano soprattutto alle due potenze dell\'Asse, Germania e Italia.' },
  { id: 'B', label: 'Commissione Bergier', level: 1, desc: 'La commissione Bergier, formata da storici, esaminò le accuse sulla condotta della Svizzera. ' +
    'Il rapporto conclusivo della commissione Bergier è stato pubblicato nel 2002.' },
  { id: 'D', label: 'Fortezze Camuffate', level: 2, desc: 'Queste basi facevano parte del Ridotto nazionale, un piano per resistere in caso di invasione.' },
  { id: 'P', label: 'Profughi', level: 2, desc: 'La Svizzera ha accolto circa 300.000 persone.' },
  { id: 'Q', label: 'Ebrei in fuga', level: 2, desc: 'Fra loro c\'erano 21.000 ebrei.' },
  { id: 'L', label: 'Leggi razziali', level: 2, desc: 'Scappavano dalle leggi razziali del regime nazista.' },
  { id: 'W', label: 'Piano Wahlen', level: 2, desc: 'Il piano prevedeva l\'estensione della campicoltura in ogni terreno disponibile.' }
] };
const ORF_AFFS = A.affermazioniDb(ORF_DB), ORF_ETICHETTE = ORF_DB.nodes.map(n => n.label);
const ORF_AC = require(path.join(JS, 'mappai-anchor-core.js'));
function unaFrase(text, opts) {
  return A.frasiOrfane(Object.assign({ frasi: [{ id: 'ev-f', page: 4, text, sourceId: 'src' }], affs: ORF_AFFS, etichette: ORF_ETICHETTE }, opts || {}));
}
const statoDi = o => (o.coperte === 1 ? 'coperta' : o.mancanti.length ? 'mancanti' : o.orfane.length ? 'orfana' : '?');

test('frasiOrfane (0041): una parafrasi con gli stessi elementi è coperta — Guisan, tobleroni, convenzione dell’Aia, Bergier 2002', () => {
  [
    'Il 30 agosto 1939 l’Assemblea Federale elesse Henri Guisan Comandante in Capo dell’Esercito Svizzero con il grado di Generale.',
    'distese di blocchi di cemento triangolari (detti anche “tobleroni”) furono erette per rallentare l’avanzata dei carri armati tedeschi;',
    'La convenzione dell’Aia consente agli stati neutrali il libero commercio con i paesi in guerra, compresa la vendita di armamenti.',
    'Queste accuse sono state esaminate dalla commissione Bergier, formata da storici, che ha prodotto un rapporto conclusivo nel 2002.'
  ].forEach(t => {
    const o = unaFrase(t);
    assert.equal(statoDi(o), 'coperta', t);
    assert.deepEqual([o.mancanti, o.orfane, o.totali], [[], [], { mancanti: 0, orfane: 0 }]);
  });
  // «eletto» / «nominato» il 30 agosto 1939: con la data sbagliata nella mappa, la data della fonte manca
  const altraData = A.affermazioniDb({ nodes: [{ id: 'G', label: 'Henri Guisan', desc: ORF_DB.nodes[1].desc.replace('1939', '1940') }] });
  const g = A.frasiOrfane({ frasi: [{ id: 'g', page: 1, text: 'Il 30 agosto 1939 l’Assemblea Federale elesse Henri Guisan Comandante in Capo dell’Esercito Svizzero con il grado di Generale.' }],
    affs: altraData, etichette: ['Henri Guisan'] });
  assert.deepEqual(g.mancanti.map(r => r.elementi), [['1939']]);
});

test('frasiOrfane (0041): «45% delle esportazioni… 1940-1942» contro «Tra il 1940 e il 1944…» — mancano 45% e 1942, col nodo vicino', () => {
  const o = unaFrase('Le due potenze dell’Asse (Germania e Italia) erano destinatarie del 45% delle esportazioni svizzere negli anni 1940 - 1942.');
  assert.equal(statoDi(o), 'mancanti');
  const r = o.mancanti[0];
  assert.deepEqual(r.elementi, ['45%', '1942']);
  assert.deepEqual(r.elementiTesto, ['45%', '1942']);
  assert.equal(r.nodoVicino, 'E');
  assert.match(r.affermazioneVicina, /potenze dell'Asse|Tra il 1940 e il 1944/);
  assert.ok(r.contenimento >= A.SOGLIA_ORFANE);
  assert.deepEqual([r.fid, r.page], ['ev-f', 4]);
  assert.equal(r.text, 'Le due potenze dell’Asse (Germania e Italia) erano destinatarie del 45% delle esportazioni svizzere negli anni 1940 - 1942.', 'il testo resta quello della fonte');
});

test('frasiOrfane (0041): il frammento d’elenco perde il segno iniziale prima del confronto', () => {
  ['- decretò la mobilitazione generale;', '- Decretò la mobilitazione generale;', '• Decretò la mobilitazione generale;', 'a) Decretò la mobilitazione generale;']
    .forEach(t => assert.equal(statoDi(unaFrase(t)), 'coperta', t));
  // il testo mostrato resta quello della fonte, col trattino
  const o = unaFrase('- informò la popolazione sul comportamento da adottare in caso di raid aereo.');
  assert.equal(o.orfane[0].text, '- informò la popolazione sul comportamento da adottare in caso di raid aereo.');
});

test('frasiOrfane (0041): «informò la popolazione sul comportamento da adottare in caso di raid aereo» è orfana, e senza un nodo vicino', () => {
  const o = unaFrase('- informò la popolazione sul comportamento da adottare in caso di raid aereo.');
  assert.equal(statoDi(o), 'orfana');
  const r = o.orfane[0];
  assert.ok(r.contenimento < A.SOGLIA_ORFANE);
  assert.deepEqual(r.elementi, []);
  // giro di correzione del 27/09: «Fortezze Camuffate» è la prima per BM25 solo per «caso» — non è il posto del fatto
  assert.equal(ORF_AC.cercaBM25(ORF_AFFS.map(a => ({ text: a.testo })), A.normalizza('informò la popolazione sul comportamento da adottare in caso di raid aereo.'), { max: 1 })
    .map(h => ORF_AFFS[h.idx].nodeId)[0], 'D', 'la controprova: per BM25 il primo è il nodo D');
  assert.deepEqual([r.nodoVicino, r.affermazioneVicina], [null, null], 'una parola in comune non fa un nodo vicino');
  // un'orfana porta anche gli elementi che mancano
  const n = unaFrase('Nel 1914 lo Stato informò la popolazione sul comportamento da adottare in caso di raid aereo.');
  assert.equal(statoDi(n), 'orfana');
  assert.deepEqual(n.orfane[0].elementi, ['1914']);
  // una mappa senza affermazioni: tutto orfano, senza nodo vicino
  const vuota = A.frasiOrfane({ frasi: [{ id: 'x', page: 1, text: 'La Svizzera restò neutrale durante tutta la guerra.' }], affs: [] });
  assert.deepEqual(vuota.orfane.map(r => [r.nodoVicino, r.contenimento]), [[null, 0]]);
});

test('frasiOrfane (0041, regola v2): la frase spezzata in tre nodi si confronta con l’UNIONE delle affermazioni vicine', () => {
  const t = 'La Svizzera accolse circa 300\'000 persone in fuga, tra cui 21\'000 ebrei che scappavano dalle leggi razziali del regime nazista.';
  assert.equal(statoDi(unaFrase(t)), 'coperta', 'tre affermazioni in tre nodi, insieme');
  assert.equal(A.VICINE_ORFANE, 3);
  assert.equal(A.SOGLIA_ORFANE, 0.4);
  // con UNA sola affermazione (la regola scartata il 27/09) la stessa frase risultava orfana
  assert.equal(statoDi(unaFrase(t, { vicine: 1 })), 'orfana');
  // la soglia si può alzare per la misura
  assert.equal(statoDi(unaFrase(t, { soglia: 0.99 })), 'orfana');
});

test('frasiOrfane (0041): gli elementi chiave si cercano in tutta la mappa, titoli compresi, nella stessa forma', () => {
  const t = 'Il piano Wahlen prevedeva l’estensione della campicoltura in ogni terreno disponibile.';
  assert.equal(statoDi(unaFrase(t)), 'coperta', '«Wahlen» sta nel titolo del nodo');
  assert.deepEqual(unaFrase(t, { etichette: [] }).mancanti.map(r => r.elementiTesto), [['Wahlen']], 'senza i titoli manca');
  // «300'000» nella fonte e «300.000» nella mappa sono lo stesso numero; elementi di due lettere non contano
  assert.equal(statoDi(unaFrase('La Svizzera accolse circa 300\'000 persone in fuga, tra cui 21\'000 ebrei che scappavano dalle leggi razziali del regime nazista.')), 'coperta');
  const due = A.frasiOrfane({ frasi: [{ id: 'x', page: 1, text: 'Le due potenze dell’Asse (Ge rmania e Italia) destinarono le esportazioni svizzere alla guerra.' }],
    affs: ORF_AFFS, etichette: ORF_ETICHETTE });
  assert.ok(![].concat(due.mancanti, due.orfane).some(r => r.elementi.indexOf('ge') >= 0), '«Ge» del PDF spezzato non è un elemento');
});

test('frasiOrfane (0041): ogni gruppo in ordine di fonte e di pagina, al più 12; `totali` conta tutto', () => {
  const frasi = [];
  for (let i = 0; i < 15; i++) frasi.push({ id: 'o' + i, page: 30 - i, sourceId: 'src', text: 'Il bollettino numero ' + i + ' informò la popolazione sul comportamento da adottare in caso di raid aereo.' });
  for (let i = 0; i < 14; i++) frasi.push({ id: 'm' + i, page: 20 - i, sourceId: 'src', text: 'Le due potenze dell’Asse (Germania e Italia) erano destinatarie del ' + (50 + i) + '% delle esportazioni svizzere negli anni 1940 - 1944.' });
  frasi.push({ id: 'prima', page: 99, sourceId: 'altra', text: 'Il bollettino speciale informò la popolazione sul comportamento da adottare in caso di raid aereo.' });
  const o = A.frasiOrfane({ frasi, affs: ORF_AFFS, etichette: ORF_ETICHETTE });
  assert.equal(A.MAX_ORFANE, 12);
  assert.deepEqual(o.totali, { mancanti: 14, orfane: 16 });
  assert.equal(o.orfane.length, 12);
  assert.equal(o.mancanti.length, 12);
  assert.deepEqual(o.orfane.map(r => r.page), [16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27], 'prima la fonte che compare per prima, poi la pagina');
  assert.deepEqual(o.mancanti.map(r => r.page), [7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18]);
  assert.deepEqual(o.mancanti[0].elementi, ['63%']);
  const tutto = A.frasiOrfane({ frasi, affs: ORF_AFFS, etichette: ORF_ETICHETTE, max: Infinity });
  assert.equal(tutto.orfane.length + tutto.mancanti.length + tutto.coperte, frasi.length);
  assert.equal(tutto.orfane[tutto.orfane.length - 1].fid, 'prima', 'la seconda fonte viene dopo la prima');
  assert.deepEqual(A.frasiOrfane({}), { coperte: 0, mancanti: [], orfane: [], totali: { mancanti: 0, orfane: 0 } });
});

test('frasiOrfane (0041): sulle frasi di `frasiFonte` gli id sono quelli delle evidenze, e `vicina` resta la regola del 0042', () => {
  const frasi = A.frasiFonte([{ nome: 'Svizzera.pdf', pages: [
    { n: 3, text: '- informò la popolazione sul comportamento da adottare in caso di raid aereo. ' +
      '- decretò la mobilitazione generale (come era accaduto nel 1914), estendendo la preparazione delle reclute;' }] }]);
  const o = A.frasiOrfane({ frasi, affs: ORF_AFFS, etichette: ORF_ETICHETTE, max: Infinity });
  const righe = [].concat(o.mancanti, o.orfane);
  assert.equal(righe.length + o.coperte, frasi.length);
  righe.forEach(r => { const f = frasi.find(x => x.id === r.fid); assert.ok(f && f.page === 3 && f.text === r.text); });
  assert.ok(o.orfane.some(r => /raid aereo/.test(r.text)));
  assert.ok(righe.some(r => /1914/.test(r.text) && r.elementi.indexOf('1914') >= 0), 'il 1914 manca nella mappa');
  // `vicina` non ha opzioni nuove: una frase a cui manca un numero resta senza vicina
  const fonte = A.frasiFonte(SOURCES);
  assert.equal(A.vicina('La Svizzera accolse circa 300.000 persone e 21.000 ebrei.', fonte), null);
  assert.equal(A.vicina('La Svizzera accolse circa 300.000 persone e 21.000 ebrei.', fonte, { elementi: false }), null);
});

/* ── 0041, giro di correzione del 27/09 ─────────────────────────────────────────
   Tre difetti della revisione: la voce d'elenco corta non si confrontava
   (splitter a 5 parole piene) e, confrontata, l'unione la dava ripresa con due
   parole prese da due nodi estranei; il nodo vicino era il primo per BM25 anche
   con una sola parola in comune. */
const ORF_CORTE_DB = { nodes: [
  { id: 'W', label: 'Piano Wahlen', desc: 'Il piano Wahlen prevedeva l\'aumento delle zone coltivate per nutrire la popolazione.' },
  { id: 'C', label: 'Ridotto nazionale', desc: 'Il Ridotto nazionale era il cuore della difesa nelle Alpi.' },
  { id: 'M', label: 'Misure di Mobilitazione', desc: 'Per proteggere il territorio, lo Stato ha decretato la mobilitazione generale, che significa chiamare tutti i soldati al servizio.' },
  { id: 'T', label: 'Blocchi Toblerone', desc: 'La Svizzera eresse queste opere di sbarramento per rallentare l\'avanzata dei carri armati tedeschi.' },
  { id: 'S', label: 'Scorte', desc: 'Alla popolazione fu chiesto di fare scorta di cibo.' }
] };
const ORF_CORTE_AFFS = A.affermazioniDb(ORF_CORTE_DB);
const FINANZIAMENTI = '- aumentò i finanziamenti alla difesa;';

test('frasiOrfane (0041, giro di correzione): la frase corta si confronta con UNA affermazione — «- aumentò i finanziamenti alla difesa;» resta fuori', () => {
  assert.equal(A.CORTA_ORFANE, 5);
  const o = A.frasiOrfane({ frasi: [{ id: 'fin', page: 2, text: FINANZIAMENTI }], affs: ORF_CORTE_AFFS, etichette: ORF_CORTE_DB.nodes.map(n => n.label) });
  assert.equal(statoDi(o), 'orfana');
  assert.equal(o.orfane[0].contenimento, 0.33, 'la migliore affermazione da sola: una parola piena su tre');
  assert.deepEqual([o.orfane[0].nodoVicino, o.orfane[0].affermazioneVicina], [null, null], '«aumento» e «difesa» stanno in due nodi estranei');
  // la controprova: l'UNIONE delle tre affermazioni più vicine (la regola per le frasi lunghe) la dava ripresa
  const lista = ORF_CORTE_AFFS.map(a => ({ text: a.testo }));
  const unione = ORF_AC.cercaBM25(lista, A.normalizza('aumentò i finanziamenti alla difesa;'), { max: A.VICINE_ORFANE }).map(h => lista[h.idx].text).join(' ');
  assert.ok(A.contenimento('aumentò i finanziamenti alla difesa;', unione) >= A.SOGLIA_ORFANE, 'con l’unione sarebbe stata «ripresa»');
  // le voci corte che la mappa riprende davvero, in UNA affermazione, restano riprese
  ['- fece costruire opere di sbarramento:', 'alla popolazione fu detto di fare scorta di cibo;', '- decretò la mobilitazione generale;']
    .forEach(t => assert.equal(statoDi(A.frasiOrfane({ frasi: [{ id: 'x', page: 3, text: t }], affs: ORF_CORTE_AFFS })), 'coperta', t));
});

test('frasiFonte (0041, giro di correzione): `minParole` porta dentro le voci d’elenco corte; senza, le frasi del 0042 con gli stessi id', () => {
  assert.equal(A.MIN_PAROLE_ORFANE, 3);
  const fonte = [{ nome: 'Svizzera.pdf', pages: [{ n: 2, text: 'Per fronteggiare la minaccia di invasione, la Confederazione Elvetica prese anche altre risoluzioni: ' +
    FINANZIAMENTI + ' - decretò la mobilitazione generale (come era accaduto nel 1914), estendendo la preparazione delle reclute;' }] }];
  const base = A.frasiFonte(fonte), corte = A.frasiFonte(fonte, { minParole: A.MIN_PAROLE_ORFANE });
  assert.deepEqual(A.frasiFonte(fonte, {}), base, 'senza `minParole` non cambia niente');
  assert.equal(base.some(f => /finanziamenti/.test(f.text)), false, 'con 5 parole piene la voce corta non c’è');
  const fin = corte.find(f => /finanziamenti/.test(f.text));
  assert.ok(fin, 'con 3 sì');
  assert.equal(fin.text, FINANZIAMENTI);
  assert.equal(fin.id, A.idFrase(fin.sourceId, fin.page, fin.text), 'lo stesso id delle evidenze');
  base.forEach(f => assert.ok(corte.some(g => g.id === f.id && g.text === f.text && g.page === f.page), f.text));
  assert.equal(corte.length, base.length + 1);
  // e sull'elenco: la voce corta è l'unica riga nuova, fuori dalla mappa e senza nodo; le altre righe sono quelle di prima
  const elenco = frasi => { const o = A.frasiOrfane({ frasi, affs: ORF_CORTE_AFFS, etichette: ORF_CORTE_DB.nodes.map(n => n.label), max: Infinity }); return [].concat(o.orfane, o.mancanti); };
  const prima = elenco(base), dopo = elenco(corte);
  assert.deepEqual(dopo.filter(r => r.fid !== fin.id), prima);
  assert.deepEqual(dopo.filter(r => r.fid === fin.id).map(r => [r.text, r.nodoVicino, r.contenimento]), [[FINANZIAMENTI, null, 0.33]]);
});

test('frasiOrfane (0041, giro di correzione): il nodo vicino chiede due parole piene non generiche in comune', () => {
  const db = { nodes: [
    { id: 'E', label: 'Respingimento degli ebrei', desc: 'Durante la guerra la Svizzera respinse un numero molto alto di ebrei che cercavano rifugio.' },
    { id: 'P', label: 'Accoglienza profughi', desc: 'La Svizzera ha accolto circa 300.000 persone in fuga dalla guerra.' },
    { id: 'N', label: 'Neutralità', desc: 'La Svizzera ha scelto la neutralità.' },
    { id: 'B', label: 'Banche', desc: 'Le banche della Svizzera accettarono oro tedesco.' },
    { id: 'L', label: 'Politica d’asilo', desc: 'La politica divenne più generosa solo alla fine.' }] };
  const affs = A.affermazioniDb(db), et = db.nodes.map(n => n.label);
  const riga = (t, a) => { const o = A.frasiOrfane({ frasi: [{ id: 'x', page: 6, text: t }], affs: a || affs, etichette: et }); return o.orfane[0] || o.mancanti[0] || null; };
  // ripresa in parte: «respinse», «numero», «ebrei» in comune → il nodo c'è, anche se la frase è fuori
  const ebrei = riga('La delicatissima situazione in cui si trovava la Svizzera non deve farci dimenticare che il nostro paese respinse un numero difficilmente valutabile di ebrei :');
  assert.ok(ebrei.contenimento < A.SOGLIA_ORFANE);
  assert.deepEqual([ebrei.nodoVicino, ebrei.affermazioneVicina], ['E', db.nodes[0].desc]);
  // una parola per affermazione: niente nodo
  assert.equal(riga('Tuttavia la politica d’asilo adottata dalla Svizzera è controversa .').nodoVicino, null);
  // «svizzera» sta in quattro affermazioni su cinque: è generica, e con «guerra» non fa due parole
  const t = 'La Svizzera restò fuori dalla guerra per tutta la sua durata grazie alla fortuna.';
  const DC = require(path.join(JS, 'mappai-deepen-core.js'));
  assert.equal(DC.lexicalOverlap(A.normalizza(t), A.normalizza(db.nodes[1].desc)).covered, 2, 'la controprova: due parole in comune con «Accoglienza profughi»');
  assert.equal(riga(t).nodoVicino, null);
  // in una mappa dove «svizzera» compare in meno di tre affermazioni non è generica: il nodo c'è
  const poche = A.affermazioniDb({ nodes: [db.nodes[1], db.nodes[4]] });
  assert.equal(riga(t, poche).nodoVicino, 'P');
  assert.equal(A.COMUNI_NODO, 2);
});

/* ── la firma stabile (packet 0060) ──────────────────────────────────────────
   Alla riapertura main.js rilegge Nodi/ con readdirSync: l'ordine dei nodi è
   quello dei nomi di file (etichetta + id), non quello della generazione. */
const invertita = db => { const c = JSON.parse(JSON.stringify(db)); c.nodes.reverse(); c.links.reverse(); return c; };
const perEtichetta = db => {
  const c = JSON.parse(JSON.stringify(db));
  c.nodes.sort((x, y) => (x.label < y.label ? -1 : x.label > y.label ? 1 : 0));
  return c;
};
const CONSENTE = { allowed: true, reason: 'quarantine', quarantine: true };

test('firma (0060): non dipende dall’ordine di nodi e collegamenti — invertiti, per etichetta come i file di Nodi/, con due etichette uguali', () => {
  const rv = revisione(), db = mappa();
  const f = A.firma(rv, db, null);
  assert.equal(A.firma(rv, invertita(db), null), f);
  assert.equal(A.firma(rv, perEtichetta(db), null), f);
  // due etichette uguali: un ordine per etichetta non basterebbe
  const doppia = mappa(); doppia.nodes[3].label = doppia.nodes[4].label;
  assert.equal(A.firma(rv, invertita(doppia), null), A.firma(rv, doppia, null));
  // la mappa viva non si tocca
  assert.deepEqual(db, mappa());
});

test('consente (0060): un record scritto su un ordine consente con i nodi in un altro — la riapertura non chiude il cancello', () => {
  const rv = revisione(), db = mappa();
  const rec = A.record(rv, db, { adesso: ADESSO });
  assert.equal(rec.completo, true, rec.motivo);
  const conRecord = Object.assign({}, rv, { quarantena: rec });
  assert.deepEqual(A.consente(conRecord, db), CONSENTE);
  assert.deepEqual(A.consente(conRecord, invertita(db)), CONSENTE);
  assert.deepEqual(A.consente(conRecord, perEtichetta(db)), CONSENTE);
  assert.deepEqual(db, mappa());
});

test('firma (0060): l’ordine delle segnalazioni resta contenuto — invertite, la firma cambia', () => {
  const rv = revisione(), db = mappa();
  const inv = Object.assign({}, rv, { initial: Object.assign({}, rv.initial, { issues: rv.initial.issues.slice().reverse() }) });
  assert.notEqual(A.firma(inv, db, null), A.firma(rv, db, null));
});

test('firma (0060): l’ordine delle frasi DENTRO un nodo è contenuto — scambiate, cambiano firma e revisione', () => {
  const rv = revisione(), db = mappa(), sc = mappa();
  const fr = A.affermazioni(sc.nodes[3].desc).map(a => a.testo);
  assert.ok(fr.length >= 2);
  sc.nodes[3].desc = [fr[1], fr[0]].concat(fr.slice(2)).join(' ');
  assert.notEqual(RC.revision(sc, SOURCES), RC.revision(db, SOURCES));
  assert.notEqual(A.firma(rv, sc, null), A.firma(rv, db, null));
});

test('REGOLE (0060): @9 — la firma non dipende più dall’ordine dei nodi, e un record @8 non consente', () => {
  assert.equal(A.REGOLE, 'mappai-quarantena-regole@9');
});

test('record (0060): il contenuto non dipende dall’ordine dei nodi — invertiti o per etichetta cambia solo l’ordine degli array', () => {
  const rv = revisione(), db = mappa();
  const chiaviOrdinate = (k, v) => (v && typeof v === 'object' && !Array.isArray(v)
    ? Object.keys(v).sort().reduce((o, c) => { o[c] = v[c]; return o; }, {}) : v);
  const canonico = rec => {
    const r = JSON.parse(JSON.stringify(rec));
    delete r.firma;
    ['escluse', 'linkEsclusi', 'svuotati', 'nonEsaminati', 'superate', 'segnalazioniSenzaEffetto']
      .forEach(k => { r[k] = r[k].map(x => JSON.stringify(x, chiaviOrdinate)).sort(); });
    return r;
  };
  const r0 = A.record(rv, db, { adesso: ADESSO });
  assert.equal(r0.completo, true, r0.motivo);
  assert.ok(r0.escluse.length >= 2 && new Set(r0.escluse.map(e => e.nodeId)).size >= 2, 'escluse su più nodi: l’ordine conta');
  for (const altro of [invertita(db), perEtichetta(db)]) {
    const r = A.record(rv, altro, { adesso: ADESSO });
    assert.deepEqual(canonico(r), canonico(r0));
    assert.deepEqual(r.conteggi, r0.conteggi);
  }
});
