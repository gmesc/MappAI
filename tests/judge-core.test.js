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

test('Nessuna is not a positive verdict and rejects unsolicited judgments', () => {
  const link = { source: 'A', target: 'B', rel: '', relNone: true };
  const result = J.validaLink([{ source: 'A', target: 'B', rel: '', valido: true }], { links: [link] });
  assert.strictEqual(result.esaminati.length, 0); assert.strictEqual(result.saltati.length, 0);
  assert.strictEqual(result.tolti.length, 0); assert.strictEqual(result.scartati.length, 1);
  assert.strictEqual(J.validaLink([], { links: [{ ...link, rel: 'causa' }] }).saltati.length, 1,
    'a malformed none flag cannot silence a real relation');
});

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

// ── fonte intera: provenienza risolta localmente, mai prosa del modello ──
const PASSAGGIO = {
  id: 'giro-20260925:p2:0', text: FRASI[0], sourceId: 'fonte-originale', sourceRevision: 'rev-2',
  recordId: 'pagina-due', page: 2, pageIndex: 1, start: 0, end: FRASI[0].length,
  title: 'La Svizzera nella seconda guerra mondiale', origin: 'original', citabile: true
};
function fonteCtx(extra = {}) {
  return {
    nodi: [{ id: 'A', label: 'Economia di guerra', desc: DESC_STORTA },
      { id: 'B', label: 'Concetto organizzativo', desc: 'Una categoria per raggruppare i fatti.' }],
    links: [{ source: 'A', target: 'B', rel: 'richiede', isCross: true }],
    registro: { schema: 'mappai-fonti-giudice@1', revisione: 'giro-20260925', passaggi: [PASSAGGIO] },
    ...extra
  };
}
function linkFonte(extra = {}) {
  return { source: 'A', target: 'B', rel: 'richiede', esito: 'sostenuto',
    problema: 'La fonte sostiene questa direzione.', prove: [PASSAGGIO.id], ...extra };
}
function difettoFonte(extra = {}) {
  return { id: 'A', tipo: 'soggetto-invertito', problema: 'Il soggetto nella fonte è la Germania.',
    prove: [PASSAGGIO.id], brano_errato: 'La Svizzera aveva bisogno', con: 'La Germania aveva bisogno', ...extra };
}

test('fonte intera: prova globale su pagina 2 e nodo senza citazioni; esame non equivale a certificazione', () => {
  const ctx = fonteCtx();
  const before = JSON.stringify(ctx);
  const r = J.validaFonteIntera({ nodi: [], link: [linkFonte()] }, ctx);
  assert.deepStrictEqual(r.nodiEsaminati, ['A', 'B']);
  assert.strictEqual(r.esitiLink.length, 1);
  assert.strictEqual(r.esitiLink[0].evidenze[0].text, FRASI[0]);
  assert.strictEqual(r.esitiLink[0].evidenze[0].page, 2);
  assert.strictEqual(r.esitiLink[0].evidenze[0].docId, 'fonte-originale');
  assert.strictEqual(r.esitiLink[0].evidenze[0].sourceRevision, 'rev-2');
  assert.strictEqual(r.esitiLink[0].evidenze[0].evidenzaId, PASSAGGIO.id);
  assert.strictEqual(r.linkEsaminati.length, 1);
  assert.strictEqual(r.correzioni.length + r.segnalati.length + r.linkTolti.length, 0);
  assert.strictEqual(JSON.stringify(ctx), before, 'nessuna mutazione dei nodi, link o prove');
  // Un ID reale garantisce soltanto provenienza: questo test non misura il
  // sostegno semantico, deliberatamente non deducibile da confronto di stringhe.
});

test('fonte intera: contraddetto produce solo una proposta compatibile con la revisione', () => {
  const ctx = fonteCtx();
  const r = J.validaFonteIntera({ nodi: [difettoFonte()], link: [linkFonte({ esito: 'contraddetto' })] }, ctx);
  assert.strictEqual(r.correzioni.length, 1);
  assert.strictEqual(r.correzioni[0].soloProposta, true);
  assert.match(r.correzioni[0].dopo, /^La Germania aveva bisogno/);
  assert.strictEqual(ctx.nodi[0].desc, DESC_STORTA);
  assert.strictEqual(r.linkTolti.length, 1);
  assert.strictEqual(r.linkTolti[0].soloProposta, true);
  assert.strictEqual(r.linkTolti[0].isCross, true);
  assert.strictEqual(r.linkTolti[0].prova_source, FRASI[0]);
  assert.strictEqual(r.linkTolti[0].prova_target, FRASI[0]);
  assert.strictEqual(r.linkTolti[0].evidenze.source[0].recordId, 'pagina-due');
  assert.strictEqual(r.linkTolti[0].evidenze.target[0].verbatim, true);
  assert.strictEqual(ctx.links[0].rel, 'richiede');
});

test('fonte intera: non verificabile senza prove resta un residuo distinto dallo scarto tecnico', () => {
  const r = J.validaFonteIntera({ nodi: [], link: [linkFonte({ esito: 'non_verificabile',
    problema: 'Il documento non permette di stabilire la direzione.', prove: [] })] }, fonteCtx());
  assert.strictEqual(r.esitiLink[0].esito, 'non_verificabile');
  assert.deepStrictEqual(r.esitiLink[0].evidenze, []);
  assert.strictEqual(r.linkSaltati[0].esito, 'non_verificabile');
  assert.strictEqual(r.linkEsaminati.length + r.linkTolti.length + r.scartati.length, 0);
});

test('fonte intera: ID ignoti, vecchia revisione, titoli, generato e teacher non diventano prove', () => {
  const impostori = [
    ['id-inventato', PASSAGGIO],
    ['giro-20260924:p2:0', PASSAGGIO],
    [PASSAGGIO.id, { ...PASSAGGIO, text: PASSAGGIO.title, citabile: false }],
    [PASSAGGIO.id, { ...PASSAGGIO, text: DESC_STORTA, origin: 'generated' }],
    [PASSAGGIO.id, { ...PASSAGGIO, origin: 'teacher' }],
    [PASSAGGIO.id, { ...PASSAGGIO, sourceRevision: '' }]
  ];
  for (const [id, p] of impostori) {
    const ctx = fonteCtx(); ctx.registro.passaggi = [p];
    const r = J.validaFonteIntera({ nodi: [difettoFonte({ prove: [id] })], link: [linkFonte({ prove: [id] })] }, ctx);
    assert.strictEqual(r.scartati.length, 2, id + ' / ' + p.origin);
    assert.strictEqual(r.nodiSaltati.length, 1);
    assert.strictEqual(r.linkSaltati.length, 1);
    assert.strictEqual(r.correzioni.length + r.linkTolti.length + r.esitiLink.length, 0);
  }
});

test('fonte intera: nessun ripiego su citazioni o valido legacy, anche se il testo esiste nella fonte', () => {
  for (const campo of ['prova', 'prova_source', 'prova_target', 'valido']) {
    const r = J.validaFonteIntera({ nodi: [difettoFonte({ [campo]: FRASI[0] })],
      link: [linkFonte({ [campo]: campo === 'valido' ? true : FRASI[0] })] }, fonteCtx());
    assert.strictEqual(r.scartati.length, 2);
    assert.ok(r.scartati.every(v => /legacy/.test(v.perche)));
  }
  const r = J.validaFonteIntera({ nodi: [], link: [linkFonte({ prove: undefined })] }, fonteCtx());
  assert.match(r.scartati[0].perche, /identificativi/);
});

test('fonte intera: terne esatte, omissioni e duplicati non diventano controlli riusciti', () => {
  const ctx = fonteCtx({ links: [
    { source: 'A', target: 'B', rel: 'richiede' },
    { source: 'A', target: 'B', rel: 'determina' },
    { source: 'B', target: 'A', rel: 'segue' }
  ] });
  const r = J.validaFonteIntera({ nodi: [], link: [
    linkFonte(), linkFonte(),
    linkFonte({ source: 'fuori-lotto' }),
    linkFonte({ rel: undefined }),
    linkFonte({ rel: 'causa' })
  ] }, ctx);
  assert.strictEqual(r.linkEsaminati.length, 0);
  assert.strictEqual(r.linkSaltati.length, 3);
  assert.match(r.linkSaltati[0].motivo, /duplicati/);
  assert.match(r.linkSaltati[1].motivo, /nessun verdetto/);
  assert.strictEqual(r.scartati.length, 5);
});

test('fonte intera: finding invalido isola il nodo, preserva altre proposte e rifiuta tipi non previsti', () => {
  const r = J.validaFonteIntera({ nodi: [difettoFonte(),
    difettoFonte({ tipo: 'fatto-non-nella-fonte', problema: 'La categoria non compare letteralmente.' }),
    difettoFonte({ id: 'estraneo' })], link: [linkFonte()] }, fonteCtx());
  assert.strictEqual(r.correzioni.length, 1);
  assert.deepStrictEqual(r.nodiEsaminati, ['B']);
  assert.strictEqual(r.nodiSaltati[0].id, 'A');
  assert.strictEqual(r.scartati.length, 2);
  assert.match(r.nodiSaltati[0].motivo, /tipo di difetto/);
  const duplicati = J.validaFonteIntera({ nodi: [difettoFonte(), difettoFonte()], link: [linkFonte()] }, fonteCtx());
  assert.strictEqual(duplicati.correzioni.length, 0);
  assert.match(duplicati.nodiSaltati[0].motivo, /duplicata/);
});

test('fonte intera: motivi vuoti, prove duplicate ed esiti inventati sono scarti tecnici', () => {
  for (const extra of [
    { problema: '   ' }, { esito: 'vero' }, { prove: [] },
    { prove: [PASSAGGIO.id, PASSAGGIO.id] }, { prove: [PASSAGGIO] }
  ]) {
    const r = J.validaFonteIntera({ nodi: [], link: [linkFonte(extra)] }, fonteCtx());
    assert.strictEqual(r.linkSaltati.length, 1);
    assert.strictEqual(r.scartati.length, 1);
    assert.strictEqual(r.esitiLink.length, 0);
  }
});

test('fonte intera: risposta incompleta o registro ambiguo falliscono esplicitamente', () => {
  for (const data of [null, {}, { nodi: [] }, { nodi: [], link: {} }, { nodi: {}, link: [] }]) {
    assert.throws(() => J.validaFonteIntera(data, fonteCtx()), /elenchi nodi e link/);
  }
  assert.throws(() => J.validaFonteIntera({ nodi: [], link: [] }, fonteCtx({ registro: {} })), /registro/);
  const ctx = fonteCtx(); ctx.registro.passaggi = [PASSAGGIO, PASSAGGIO];
  assert.throws(() => J.validaFonteIntera({ nodi: [], link: [] }, ctx), /duplicati/);
});

test('fonte intera: Nessuna non richiede un verdetto e non produce falsa copertura positiva', () => {
  const r = J.validaFonteIntera({ nodi: [], link: [linkFonte({ rel: '' })] }, fonteCtx({
    links: [{ source: 'A', target: 'B', rel: '', relNone: true }]
  }));
  assert.strictEqual(r.esitiLink.length + r.linkEsaminati.length + r.linkSaltati.length + r.linkTolti.length, 0);
  assert.strictEqual(r.scartati.length, 1);
});

test('fonte intera: registro Evidence reale risolve reference e respinge il medesimo ID dopo cambio fonte', () => {
  const E = require('../public/js/mappai-evidence-core.js');
  const source = { id: 'documento', title: 'Scheda.pdf', origin: 'reference',
    pages: [{ n: 1, text: 'Scheda' }, { n: 2, text: FRASI[0] }] };
  const registro = E.registroGiudice([source]);
  const p = registro.passaggi.find(x => x.page === 2);
  const titolo = registro.passaggi.find(x => x.page === 1);
  const valida = prove => J.validaFonteIntera({ nodi: [], link: [linkFonte({ prove })] }, fonteCtx({ registro }));
  assert.strictEqual(valida([p.id]).esitiLink[0].evidenze[0].text, FRASI[0]);
  assert.match(valida([titolo.id]).scartati[0].perche, /non ammesso/);
  const aggiornata = E.registroGiudice([{ ...source, pages: [source.pages[0], { n: 2, text: FRASI[0] + ' Un nuovo dettaglio.' }] }]);
  const r = J.validaFonteIntera({ nodi: [], link: [linkFonte({ prove: [p.id] })] }, fonteCtx({ registro: aggiornata }));
  assert.match(r.scartati[0].perche, /revisione diversa/);
  assert.strictEqual(r.linkEsaminati.length, 0);
});

// ── packet 0026: i lotti che corrono fino al tetto ─────────────────────────
// Le tre firme di V8 del 25/9, ricostruite: JSON seguito da spazio bianco
// senza fine, in tre punti diversi della risposta.
const SPAZI = ' '.repeat(58000);
const V1 = difettoFonte({ problema: 'La fonte dice “la Germania”, non «la Svizzera»: il soggetto è \\"girato\\".' });
const L1 = linkFonte();
const FIRME = {
  'stringa aperta': JSON.stringify({ nodi: [V1] }).slice(0, -1) + ',"link":[' + JSON.stringify(L1) +
    ',{"source":"A","target":"B","rel":"richiede","esito":"sostenuto","problema":"Il testo' + SPAZI,
  'virgola finale': '{"nodi":[' + JSON.stringify(V1) + '],"link":[' + JSON.stringify(L1) + '],' + SPAZI,
  'oggetto non chiuso': '{\n"nodi":[\n' + JSON.stringify(V1) + '\n],\n"link":[\n' + JSON.stringify(L1) + '\n]' + '\n'.repeat(66) + SPAZI
};
const FIRMA_V8 = { 'stringa aperta': /Unterminated string/, 'virgola finale': /double-quoted property name/, 'oggetto non chiuso': /Expected ',' or '}'/ };

for (const [nome, raw] of Object.entries(FIRME)) {
  test('0026 analizzaRisposta: «' + nome + '» tiene i verdetti chiusi e si dichiara non integra', () => {
    assert.throws(() => JSON.parse(raw.trim()), FIRMA_V8[nome], 'la firma del 25/9 è riprodotta');
    const a = J.analizzaRisposta(raw);
    assert.strictEqual(a.integra, false);
    assert.strictEqual(a.data.nodi.length, 1);
    assert.strictEqual(a.data.nodi[0].problema, V1.problema, 'virgolette tipografiche e scappate intatte');
    assert.strictEqual(a.data.link.length, 1, 'l’oggetto con la stringa aperta cade, non si richiude');
    assert.deepStrictEqual(a.data.link[0], L1);
    assert.ok(a.posizione >= 0);
    assert.strictEqual(a.completi.nodi, true);
    assert.strictEqual(a.completi.link, nome !== 'stringa aperta');
  });
}

test('0026 analizzaRisposta: una risposta integra resta integra, una non-JSON non inventa dati', () => {
  const ok = J.analizzaRisposta('```json\n' + JSON.stringify({ nodi: [], link: [L1] }) + '\n```');
  assert.strictEqual(ok.integra, true); assert.strictEqual(ok.data.link.length, 1);
  const no = J.analizzaRisposta('risposta non JSON');
  assert.strictEqual(no.integra, false); assert.strictEqual(no.data, null);
  const tronca = J.analizzaRisposta('{"nodi":[{"id":"A","tipo":"soggetto-invertito","problema":"Il sogg');
  assert.deepStrictEqual(tronca.data, { nodi: [], link: [] });
  assert.strictEqual(tronca.completi.nodi, false);
});

test('0026 estrattoGrezzo: corse di spazi compresse, solo testo del modello e numeri', () => {
  const raw = FIRME['stringa aperta'];
  const a = J.analizzaRisposta(raw);
  const e = J.estrattoGrezzo(raw, { outTok: 4096, tetto: 4096, posizione: a.posizione, errore: a.errore,
    apiKey: 'segreta', payload: { chiave: 'segreta' } });
  assert.strictEqual(e.lunghezza, raw.length);
  assert.strictEqual(e.outTok, 4096); assert.strictEqual(e.tetto, 4096);
  assert.ok(e.inizio.startsWith('{"nodi"') && e.inizio.length <= 620);
  assert.match(e.fine, /⟨… 58\.000 spazi …⟩/, 'la coda è la corsa intera, contata per intero');
  assert.match(e.inizio, /Il testo ⟨… 58\.000 spazi …⟩/);
  assert.match(e.attorno, /⟨… /);
  assert.match(J.estrattoGrezzo('x' + SPAZI + 'y', {}).inizio, /⟨… 58\.000 spazi …⟩/);
  const chiavi = Object.keys(e).sort();
  chiavi.forEach(k => assert.ok(['attorno', 'errore', 'fine', 'inizio', 'lunghezza', 'outTok', 'posizione', 'tetto'].includes(k), k));
  assert.ok(!JSON.stringify(e).includes('segreta'), 'niente credenziali né payload');
  assert.ok(JSON.stringify(e).length < 3000);
});

test('0026 validaFonteIntera: con «nodi» incompleto i nodi non citati sono saltati, non esaminati', () => {
  const r = J.validaFonteIntera({ nodi: [difettoFonte()], link: [] }, fonteCtx({ completi: { nodi: false, link: false } }));
  assert.deepStrictEqual(r.nodiEsaminati, ['A']);
  assert.strictEqual(r.nodiSaltati.length, 1); assert.strictEqual(r.nodiSaltati[0].id, 'B');
  assert.match(r.nodiSaltati[0].motivo, /interrotta/);
  assert.match(r.linkSaltati[0].motivo, /interrotta/);
  const intera = J.validaFonteIntera({ nodi: [difettoFonte()], link: [] }, fonteCtx());
  assert.deepStrictEqual(intera.nodiEsaminati, ['A', 'B'], 'una risposta integra resta com’era');
});

function rapporto(extra = {}) {
  const terne = [{ source: 'A', target: 'B', rel: 'richiede' }];
  return { contratto: 'mappai-giudice@2', fonte: { revisione: 'rev-1' }, modello: { provider: 'infomaniak', model: 'gemma' },
    esitiRami: [
      { id: 'A', lotto: 1, stato: 'completato', nodi: ['A'], terne },
      { id: 'B', lotto: 2, stato: 'errore', tecnico: 'tetto', nodi: ['B'], terne: [] },
      { id: 'C', lotto: 3, stato: 'parziale', tecnico: 'analisi', nodi: ['C'], terne: [] }
    ],
    segnalati: [{ id: 'A', lotto: 1, problema: 'x' }, { id: 'C', lotto: 3, problema: 'parziale' }],
    correzioni: [], scartati: [], linkTolti: [], esitiLink: [{ source: 'A', target: 'B', rel: 'richiede', lotto: 1 }],
    copertura: { nodiEsaminati: ['A', 'C'], nodiSaltati: [{ id: 'B', lotto: 2 }], linkEsaminati: [{ source: 'A', target: 'B', rel: 'richiede', lotto: 1 }], linkSaltati: [] },
    ...extra };
}
function attuale(extra = {}) {
  return { contratto: 'mappai-giudice@2', revisione: 'rev-1', modello: { provider: 'infomaniak', model: 'gemma' },
    lotti: [{ lotto: 1, id: 'A', nodi: ['A'], terne: [{ source: 'A', target: 'B', rel: 'richiede' }] },
      { lotto: 2, id: 'B', nodi: ['B'], terne: [] }, { lotto: 3, id: 'C', nodi: ['C'], terne: [] }], ...extra };
}

test('0026 pianoRipresa: rifà solo i lotti tecnici e riporta intatti i verdetti degli altri', () => {
  const p = J.pianoRipresa(rapporto(), attuale());
  assert.strictEqual(p.modo, 'mirata');
  assert.deepStrictEqual(p.rifare, [2, 3]);
  assert.deepStrictEqual(Object.keys(p.riusati), ['1']);
  assert.deepStrictEqual(p.riusati[1].righe.segnalati, [{ id: 'A', lotto: 1, problema: 'x' }]);
  assert.deepStrictEqual(p.riusati[1].righe.copertura.nodiEsaminati, ['A']);
  assert.strictEqual(p.riusati[1].righe.copertura.linkEsaminati.length, 1);
  assert.strictEqual(p.riusati[1].righe.esitiLink.length, 1);
});

test('0026 pianoRipresa: fonte, contratto, modello o lotti diversi → rifà tutto e dice perché', () => {
  const casi = [
    [null, attuale(), /nessun rapporto/],
    [rapporto({ contratto: 'mappai-giudice@1' }), attuale(), /contratto/],
    [rapporto(), attuale({ revisione: 'rev-2' }), /fonte/],
    [rapporto({ modello: undefined }), attuale(), /non registrato/],
    [rapporto(), attuale({ modello: { provider: 'infomaniak', model: 'mistral' } }), /modello diverso/],
    [rapporto(), attuale({ lotti: attuale().lotti.slice(0, 2) }), /lotti diversi/],
    [rapporto(), attuale({ lotti: [{ ...attuale().lotti[0], nodi: ['A', 'Z'] }, ...attuale().lotti.slice(1)] }), /lotti diversi/]
  ];
  for (const [r, a, motivo] of casi) {
    const p = J.pianoRipresa(r, a);
    assert.strictEqual(p.modo, 'completa'); assert.match(p.motivo, motivo);
    assert.deepStrictEqual(p.rifare, a.lotti.map(l => l.lotto));
  }
});
