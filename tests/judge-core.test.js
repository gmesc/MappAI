'use strict';
/*
 * judge-core.test.js — che cosa si accetta di un verdetto del giudice.
 * I casi sono quelli veri dell'audit sulla Svizzera nella 2a guerra mondiale:
 * il soggetto della valuta ribaltato, la commissione «formata nel 2002», i
 * «militari internati» diventati «soldati prigionieri».
 */
const { test } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const J = require(path.join(__dirname, '..', 'public', 'js', 'mappai-judge-core.js'));

const FRASI = [
  'Per comprare merci dalle altre nazioni, la Germania aveva assolutamente bisogno di divise privilegiate, cioè di moneta svizzera o americana.',
  'Tramite la sua Banca Nazionale, la Svizzera avviò il commercio di oro con la Germania nazista.'
];
const DESC_STORTA = 'La Svizzera aveva bisogno di moneta americana per comprare merci dalle altre nazioni, e la otteneva cedendo oro.';

// ── la prova contraria ──────────────────────────────────────────────────
test('provaContraria: una prova che sta nelle frasi e dice qualcosa di nuovo passa', () => {
  const r = J.provaContraria('la Germania aveva assolutamente bisogno di divise privilegiate', FRASI, DESC_STORTA);
  assert.strictEqual(r.ok, true);
  assert.ok(r.nuove.includes('germania'), 'la parola che la desc non ha è proprio il soggetto vero');
});

test('provaContraria: una prova inventata non passa, per quanto plausibile', () => {
  const r = J.provaContraria('La Banca Nazionale rifiutò sempre l oro proveniente dai campi', FRASI, DESC_STORTA);
  assert.strictEqual(r.ok, false);
  assert.match(r.perche, /non è fra le frasi/);
});

test('provaContraria: stesso lessico resta consultabile ma non autorizza auto-correzione', () => {
  // La provenienza della citazione è verificabile; il suo senso richiede il docente.
  const desc = 'Tramite la sua Banca Nazionale la Svizzera avviò il commercio di oro con la Germania nazista.';
  const r = J.provaContraria('la Svizzera avviò il commercio di oro con la Germania', FRASI, desc);
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.soloProposta, true);
});

test('provaContraria: prove CORTE come quelle vere dell\'audit devono passare', () => {
  const frasi = ['Fra i rifugiati vi erano i militari internati e i disertori stranieri.'];
  const desc = 'La Svizzera accolse soldati prigionieri provenienti dagli eserciti stranieri.';
  const r = J.provaContraria('i militari internati', frasi, desc);
  assert.strictEqual(r.ok, true, 'due parole sole, ma sono esattamente il punto');
});

// ── la chirurgia ────────────────────────────────────────────────────────
test('chirurgia: sostituisce la porzione esatta e lascia il resto intatto', () => {
  const r = J.chirurgia(DESC_STORTA, 'La Svizzera aveva bisogno', 'La Germania aveva bisogno');
  assert.strictEqual(r.ok, true);
  assert.ok(r.nuova.startsWith('La Germania aveva bisogno'));
  assert.ok(/cedendo oro\.$/.test(r.nuova), 'la coda della frase non si tocca');
});

test('chirurgia: ritrova il brano anche se il giudice lo ricopia senza una virgola', () => {
  const desc = 'Nel 2002, la Commissione Bergier, formata da storici, pubblicò il rapporto.';
  const r = J.chirurgia(desc, 'la Commissione Bergier formata da storici', 'la Commissione Bergier, istituita nel 1996');
  assert.strictEqual(r.ok, true);
  assert.ok(/istituita nel 1996/.test(r.nuova));
});

test('chirurgia: rifiuta ciò che non è una forbice', () => {
  assert.match(J.chirurgia(DESC_STORTA, 'La Francia aveva bisogno', 'La Germania').perche, /non compare/);
  assert.match(J.chirurgia(DESC_STORTA, 'La Svizzera', 'La Svizzera').perche, /uguale/);
  assert.match(J.chirurgia(DESC_STORTA, 'La Svizzera', 'La Germania nazista, che dal 1939 conduceva una guerra su più fronti europei').perche, /più lunga/);
  const lungo = DESC_STORTA.split(/\s+/).slice(0, 13).join(' ');
  assert.match(J.chirurgia(DESC_STORTA, lungo, 'poche parole').perche, /troppo lungo/);
});

// ── il verdetto intero ──────────────────────────────────────────────────
const NODI = [{ id: 'N1', label: 'Commercio dell\'oro', desc: DESC_STORTA }];
const CTX = { nodi: NODI, frammenti: { N1: FRASI } };

test('validaVerdetti: il caso vero — soggetto ribaltato, corretto con la forbice', () => {
  const r = J.validaVerdetti([{
    id: 'N1', tipo: 'soggetto-invertito',
    problema: 'la fonte dice che era la Germania ad avere bisogno di valuta',
    prova: 'la Germania aveva assolutamente bisogno di divise privilegiate',
    brano_errato: 'La Svizzera aveva bisogno', con: 'La Germania aveva bisogno'
  }], CTX);
  assert.strictEqual(r.applicati.length, 1);
  assert.ok(/^La Germania aveva bisogno/.test(r.applicati[0].dopo));
  assert.ok(r.applicati[0].prima !== r.applicati[0].dopo);
});

/* ⚠️ «fatto-non-nella-fonte» non esiste più: il giudice vede una finestra e da
   una finestra non si dimostra un'assenza. Vedi mappai-judge-core.js. */
test('validaVerdetti: il tipo ritirato viene scartato come qualunque tipo inventato', () => {
  const r = J.validaVerdetti([{
    id: 'N1', tipo: 'fatto-non-nella-fonte', problema: 'x',
    prova: 'la Germania aveva assolutamente bisogno di divise privilegiate'
  }], CTX);
  assert.strictEqual(r.scartati.length, 1);
  assert.strictEqual(r.scartati[0].perche, 'tipo di difetto non previsto');
});

test('validaVerdetti: un difetto NON locale si segnala e non si tocca', () => {
  const r = J.validaVerdetti([{
    id: 'N1', tipo: 'fatto-contraddetto', problema: 'le frasi dicono un\'altra cosa',
    prova: 'Tramite la sua Banca Nazionale, la Svizzera avviò il commercio di oro',
    brano_errato: 'cedendo oro', con: 'in cambio di merci'
  }], CTX);
  assert.strictEqual(r.applicati.length, 0, 'qui la forbice non si usa nemmeno se il giudice la propone');
  assert.strictEqual(r.segnalati.length, 1);
});

test('validaVerdetti: si scarta il verdetto senza prova, su nodo ignoto o di tipo inventato', () => {
  const r = J.validaVerdetti([
    { id: 'N9', tipo: 'soggetto-invertito', prova: 'la Germania aveva assolutamente bisogno' },
    { id: 'N1', tipo: 'si-legge-male', prova: 'la Germania aveva assolutamente bisogno' },
    { id: 'N1', tipo: 'soggetto-invertito', prova: 'una frase che nella fonte non esiste proprio' }
  ], CTX);
  assert.strictEqual(r.applicati.length, 0);
  assert.strictEqual(r.scartati.length, 3);
  assert.deepStrictEqual(r.scartati.map(x => x.perche),
    ['nodo inesistente', 'tipo di difetto non previsto', 'prova non è fra le frasi mostrate']);
});

test('validaVerdetti: oltre il tetto per ramo si segnala invece di correggere', () => {
  const nodi = [1, 2, 3, 4].map(i => ({ id: 'N' + i, label: 'n' + i, desc: DESC_STORTA }));
  const fr = {}; nodi.forEach(n => { fr[n.id] = FRASI; });
  const v = nodi.map(n => ({
    id: n.id, tipo: 'soggetto-invertito', problema: 'x',
    prova: 'la Germania aveva assolutamente bisogno di divise privilegiate',
    brano_errato: 'La Svizzera aveva bisogno', con: 'La Germania aveva bisogno'
  }));
  const r = J.validaVerdetti(v, { nodi, frammenti: fr });
  assert.strictEqual(r.applicati.length, 3, 'il tetto vale');
  assert.match(r.segnalati[0].perche, /tetto/);
});

// ── i nessi ─────────────────────────────────────────────────────────────
test('validaLink: toglie il verbo a un nesso che non regge', () => {
  const links = [{ source: 'A', target: 'B', rel: 'determina' }];
  const r = J.validaLink([{ source: 'A', target: 'B', valido: false, problema: 'la fonte non lo dice' }], { links });
  assert.strictEqual(r.tolti.length, 1);
  assert.strictEqual(r.tolti[0].rel, 'determina');
});

test('validaLink: non tocca un arco già neutro e non promuove mai', () => {
  const links = [{ source: 'A', target: 'B', rel: 'include' }];
  const r = J.validaLink([{ source: 'A', target: 'B', valido: false }], { links });
  assert.strictEqual(r.tolti.length, 0);
  assert.match(r.scartati[0].perche, /già neutro/);
});

test('validaLink: un arco dichiarato valido non produce nessuna scrittura', () => {
  const links = [{ source: 'A', target: 'B', rel: 'causa' }];
  const r = J.validaLink([{ source: 'A', target: 'B', valido: true }], { links });
  assert.strictEqual(r.tolti.length, 0);
  assert.strictEqual(r.scartati.length, 0, 'un ramo tutto sano esce con zero scritture e zero scarti');
});
