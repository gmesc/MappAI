'use strict';
/*
 * affermazioni-motore.test.js — la cucitura dello strato delle affermazioni e
 * della quarantena (packet 0042, ADR 0010), in vm, con il manifesto e
 * `electronAPI` iniettati. Il core è quello vero (require); review.js è quello
 * vero, per la scrittura del manifesto.
 *
 * Che cosa si prova:
 *   · da spento il cancello avvolto restituisce lo STESSO oggetto dell'originale
 *     (inv. 1); niente doppio avvolgimento; senza review-core niente avvolgimento;
 *   · il record: scritto da acceso, invalidato quando la mappa cambia durante la
 *     scrittura, invalidato a ogni uscita senza un record nuovo;
 *   · nessuna chiamata AI né al reranker durante `aggiorna`;
 *   · la vista per i materiali, le bozze con una firma diversa, i ricontrolli;
 *   · la guardia statica sulle catture di window.MappAIAffermazioni;
 *   · il caricamento nell'ordine vero di index.html.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const JS = path.join(__dirname, '..', 'public', 'js');
const read = f => fs.readFileSync(path.join(JS, f), 'utf8');
const AC = require(path.join(JS, 'mappai-affermazioni-core.js'));
const RC = require(path.join(JS, 'mappai-review-core.js'));
const PC = require(path.join(JS, 'mappai-pipeline-core.js'));
const copy = x => JSON.parse(JSON.stringify(x));

/* ── la fixture: quattro nodi di «Svizzera e 2a GM», tre pagine di fonte ── */
const SOURCES = [{ nome: 'Svizzera.pdf', pages: [
  { n: 1, text: 'Il 30 agosto 1939 l’Assemblea Federale elesse Henri Guisan Comandante in Capo dell’Esercito Svizzero con il grado di Generale. Prima e durante la Seconda Guerra Mondiale, l’obiettivo principale della Svizzera era quello di conservare l’indipendenza e di restare fuori dal conflitto.' },
  { n: 4, text: 'La Germania era da tempo un importante partner commerciale della Svizzera e fu il principale destinatario delle esportazioni elvetiche negli anni 1940 - 1944. Nonostante le difficoltà di comunicazione e le pressioni di Berlino, il commercio con gli Alleati – in particolare con gli USA – continuò, ma costituiva solo un terzo di quello con la Germania.' },
  { n: 6, text: 'Le accuse principali sono quelle di aver respinto migliaia di rifugiati ebrei, di aver acquistato dai nazisti oro rubato agli ebrei. Inoltre il nostro paese è stato accusato di aver contribuito al prolungamento della guerra con il rifornimento di materiale militare alla Germania.' }] }];
const CONTESTATA = 'Il valore di questo commercio era però basso: era solo un terzo rispetto a quello con la Germania.';
const ANAFORA = 'Questo commercio restava marginale.';
const ALLEATI = 'La Svizzera ha continuato a commerciare con gli Alleati, specialmente con gli USA. ' + CONTESTATA + ' ' + ANAFORA;
const ACCUSE = 'Le critiche principali riguardano il rifiuto di accogliere migliaia di rifugiati ebrei. Inoltre, lo Stato è accusato di aver aiutato la Germania fornendo materiale militare.';
const RETTIFICA = 'Inoltre, la Svizzera è stata accusata di aver prolungato la guerra rifornendo la Germania di materiale militare.';
const ACCUSE_DOCENTE = ACCUSE.replace('Inoltre, lo Stato è accusato di aver aiutato la Germania fornendo materiale militare.', RETTIFICA);
const mappa = () => ({ nodes: [
  { id: 'ROOT', label: 'Svizzera e 2a GM', level: 0, desc: 'Durante la Seconda Guerra Mondiale, la Svizzera ha cercato di conservare l\'indipendenza e di restare fuori dal conflitto.' },
  { id: 'L1_1', label: 'Difesa', level: 1, group: 1, desc: 'Il 30 agosto 1939 l\'Assemblea Federale ha nominato Henri Guisan Comandante in Capo dell\'Esercito Svizzero con il grado di Generale.' },
  { id: 'L1_2', label: 'Commercio con gli Alleati', level: 1, group: 2, desc: ALLEATI },
  { id: 'L1_3', label: 'Accuse', level: 1, group: 3, desc: ACCUSE }],
  links: [{ source: 'ROOT', target: 'L1_1', rel: 'include' }, { source: 'ROOT', target: 'L1_2', rel: 'include' },
    { source: 'ROOT', target: 'L1_3', rel: 'include' }, { source: 'L1_2', target: 'L1_3', rel: 'richiede' }],
  sourcesDict: {} });
function revisione(extraIssues) {
  const report = { contratto: 'mappai-giudice@2', stato: 'completo',
    copertura: { nodiTotali: 4, nodiEsaminati: ['ROOT', 'L1_1', 'L1_2', 'L1_3'], nodiSaltati: [] },
    issues: [
      { id: 'i-alleati', target: { kind: 'node', id: 'L1_2', field: 'desc' }, problem: 'Da ricontrollare: «era solo un terzo rispetto a quello con la Germania».' },
      { id: 'i-militare', target: { kind: 'node', id: 'L1_3', field: 'desc' }, problem: 'La fonte dice che la guerra fu prolungata.' }
    ].concat(extraIssues || []) };
  let r = RC.createReview({ db: mappa(), sources: SOURCES, report, generationId: 'gen-svizzera' });
  return RC.setDecision(r, 'i-militare', 'manual', { text: ACCUSE_DOCENTE });
}
function manifesto(review) {
  const m = PC.createManifest({ quiz: { types: ['mc'], perBranch: 1, angle: 'auto' } }, { vaultPath: '/vault' });
  m.steps.A.status = 'done';
  m.review = review || revisione();
  return m;
}
const ACCESO = { mappai_affermazioni: '1', mappai_quarantena: '1' };
// packet 0089 (ADR 0020): accese se la chiave manca; «da spento» si scrive col '0' esplicito (inv. 1)
const SPENTO = { mappai_affermazioni: '0', mappai_quarantena: '0' };

/* L'ambiente: un contesto vm dove window è il contesto stesso, come nel renderer.
   `MappAIReviewCore` è una COPIA dell'oggetto del modulo: l'avvolgimento del gate
   non tocca il modulo che gli altri test condividono. */
function ambiente(o = {}) {
  const store = new Map(Object.entries(o.storage || {}));
  const scritture = [], chiamate = { ai: 0, rerank: 0, chat: 0, avvia: 0, embeddings: 0 };
  const st = { activeVaultPath: '/vault', db: o.db || mappa(), sources: [] };
  const ctx = { console: { log() {}, info() {}, warn() {}, error() {} }, setTimeout, clearTimeout, appState: st, TextDecoder,
    localStorage: { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)) } };
  ctx.window = ctx;
  ctx.document = { getElementById: () => null };
  if (!o.senzaRC) ctx.MappAIReviewCore = Object.assign({}, RC);
  ctx.MappAIAffermazioniCore = AC;
  ctx.MappAIPipelineCore = PC;
  ctx.fetchModelAPI = async () => { chiamate.ai++; throw new Error('nessuna chiamata AI attesa'); };
  ctx.fetchEmbeddings = async () => { chiamate.embeddings++; throw new Error('nessun embedding atteso'); };
  ctx.MappAIModelli = { acceso: () => true, avvia() { chiamate.avvia++; return { chat: async () => { chiamate.chat++; }, verifica() {} }; } };
  ctx.electronAPI = {
    saveVaultFile: async args => {
      if (args.relPath !== 'pipeline.json') return { ok: true };
      scritture.push(JSON.parse(args.text));
      if (o.durante) o.durante(st, scritture.length);
      if (o.falliscono) return { ok: false, error: 'disco pieno' };
      return { ok: true, version: scritture.length };
    },
    rerankInfomaniak: async () => { chiamate.rerank++; throw new Error('nessun reranker atteso'); }
  };
  vm.createContext(ctx);
  if (!o.senzaReview) vm.runInContext(read('mappai-review.js'), ctx);
  vm.runInContext(read('mappai-affermazioni.js'), ctx);
  return { ctx, st, store, scritture, chiamate, A: ctx.MappAIAffermazioni };
}

test('0089 (ADR 0020): senza chiavi affermazioni e quarantena sono accese (con la revisione accesa); ciascuna si spegne solo col \'0\'; le frasi orfane restano spente', () => {
  const nuovo = ambiente();
  assert.equal(nuovo.A.acceso(), true, 'un docente nuovo: affermazioni accese');
  assert.equal(nuovo.A.quarantenaAccesa(), true, 'un docente nuovo: quarantena accesa');
  assert.equal(ambiente({ storage: { mappai_affermazioni: '0' } }).A.quarantenaAccesa(), false, 'affermazioni a \'0\': niente quarantena');
  const soloQ = ambiente({ storage: { mappai_quarantena: '0' } });
  assert.equal(soloQ.A.acceso(), true);
  assert.equal(soloQ.A.quarantenaAccesa(), false, 'quarantena a \'0\'');
  assert.equal(ambiente({ storage: { mappai_review_enabled: '0' } }).A.quarantenaAccesa(), false, 'revisione spenta: niente quarantena, come prima');
  assert.equal(ambiente({ storage: SPENTO }).A.acceso(), false);
  assert.equal(nuovo.A.orfaneAccese(), false, 'le frasi orfane restano spente senza chiave');
});

/* ── il cancello avvolto ──────────────────────────────────────────────────── */
test('da spento il gate avvolto restituisce l’oggetto === dell’originale; da acceso consente solo col record', async () => {
  const sentinella = { allowed: false, reason: 'awaiting_review' };
  const h = ambiente();
  const avvolto = h.ctx.MappAIReviewCore.gate;
  assert.equal(avvolto.__quarantena, true);
  assert.equal(avvolto.__originale, RC.gate);
  // l'identità, con un originale spia che restituisce sempre lo stesso oggetto
  const spia = ambiente();
  const originale = spia.ctx.MappAIReviewCore.gate.__originale;
  const conSpia = Object.assign({}, RC, { gate: () => sentinella });
  spia.ctx.MappAIReviewCore = conSpia;
  assert.equal(spia.A.avvolgiGate(), true);
  assert.notEqual(conSpia.gate, originale);
  const m = manifesto();
  assert.equal(conSpia.gate(m.review, h.st.db, m.review.sources), sentinella, 'da spento: lo STESSO oggetto');
  // anche con la quarantena accesa, senza record l'esito resta quello di oggi (fallisce chiusa)
  spia.store.set('mappai_affermazioni', '1'); spia.store.set('mappai_quarantena', '1');
  assert.equal(conSpia.gate(m.review, spia.st.db, m.review.sources), sentinella);
  // con il gate vero: da spento l'esito coincide con l'originale
  assert.deepEqual(copy(avvolto(m.review, h.st.db, m.review.sources)), copy(RC.gate(m.review, h.st.db, m.review.sources)));
  // da acceso e con un record valido consente, e dice perché
  for (const [k, v] of Object.entries(ACCESO)) h.store.set(k, v);
  await h.A.aggiorna('/vault', m);
  assert.deepEqual(copy(avvolto(m.review, h.st.db, m.review.sources)), { allowed: true, reason: 'quarantine', quarantine: true });
  // G2 passa {items}: nessuna quarantena
  assert.equal(avvolto(m.review, { items: [] }, m.review.sources).allowed, false);
  // spenta la quarantena, lo stesso record non apre più niente
  h.store.set('mappai_quarantena', '0');
  assert.equal(avvolto(m.review, h.st.db, m.review.sources).allowed, false);
});

test('niente doppio avvolgimento; senza review-core nessun avvolgimento', () => {
  const h = ambiente();
  const avvolto = h.ctx.MappAIReviewCore.gate;
  assert.equal(h.A.avvolgiGate(), true);
  assert.equal(h.ctx.MappAIReviewCore.gate, avvolto, 'un secondo avvolgimento non cambia niente');
  vm.runInContext(read('mappai-affermazioni.js'), h.ctx);   // il modulo caricato due volte (trappola 22)
  assert.equal(h.ctx.MappAIReviewCore.gate, avvolto);
  assert.equal(h.ctx.MappAIReviewCore.gate.__originale, RC.gate);
  const senza = ambiente({ senzaRC: true });
  assert.equal(senza.A.avvolgiGate(), false);
  assert.equal(senza.ctx.MappAIReviewCore, undefined);
});

/* ── il record ────────────────────────────────────────────────────────────── */
test('aggiorna da acceso scrive un record completo in pipeline.json, legato a base e decisioni', async () => {
  const h = ambiente({ storage: ACCESO }), m = manifesto();
  const out = await h.A.aggiorna('/vault', m);
  assert.equal(out, m);
  assert.equal(h.scritture.length, 1);
  const q = h.scritture[0].review.quarantena;
  assert.equal(q.schema, 'mappai-quarantena@1');
  assert.equal(q.completo, true, q.motivo);
  assert.equal(q.baseRevision, m.review.baseRevision);
  assert.equal(q.firma, AC.firma(m.review, h.st.db, h.st.db.causalDoc));
  assert.deepEqual(q.escluse.map(e => [e.nodeId, e.testo, e.corsia]),
    [['L1_2', CONTESTATA, 'fuori-contestata'], ['L1_2', ANAFORA, 'fuori-coesione']]);
  assert.equal(h.chiamate.ai + h.chiamate.rerank + h.chiamate.chat + h.chiamate.avvia + h.chiamate.embeddings, 0);
});

test('una revisione cambiata durante la scrittura invalida il record appena scritto', async () => {
  const h = ambiente({ storage: ACCESO, durante: (st, n) => { if (n === 1) st.db.nodes[1].desc += ' Aggiunta sulla tela.'; } });
  const m = manifesto();
  await h.A.aggiorna('/vault', m);
  assert.equal(h.scritture.length, 2, 'il record valido e poi la sua invalidazione');
  assert.equal(h.scritture[0].review.quarantena.completo, true);
  assert.equal(m.review.quarantena.completo, false);
  assert.equal(m.review.quarantena.motivo, 'cambiato_durante_la_scrittura');
  assert.equal(h.scritture[1].review.quarantena.completo, false);
  assert.equal(h.ctx.MappAIReviewCore.gate(m.review, h.st.db, m.review.sources).allowed, false);
  // anche un cambio di progetto a metà scrittura
  const p = ambiente({ storage: ACCESO, durante: (st, n) => { if (n === 1) st.activeVaultPath = '/altro'; } });
  const m2 = manifesto();
  await p.A.aggiorna('/vault', m2);
  assert.equal(m2.review.quarantena.motivo, 'cambiato_durante_la_scrittura');
});

test('ogni uscita senza un record nuovo invalida quello vecchio; senza un record vecchio, da spento, non si scrive niente', async () => {
  // da spento e senza record: identità, nessuna scrittura
  const zero = ambiente({ storage: SPENTO }), m0 = manifesto();
  assert.equal(await zero.A.aggiorna('/vault', m0), m0);
  assert.equal(zero.scritture.length, 0);
  assert.equal(m0.review.quarantena, undefined);
  // un record valido, poi l'interruttore spento
  const h = ambiente({ storage: ACCESO }), m = manifesto();
  await h.A.aggiorna('/vault', m);
  h.store.set('mappai_affermazioni', '0');
  await h.A.aggiorna('/vault', m);
  assert.deepEqual([m.review.quarantena.completo, m.review.quarantena.motivo], [false, 'spento']);
  assert.equal(h.scritture.at(-1).review.quarantena.motivo, 'spento');
  const n = h.scritture.length;
  await h.A.aggiorna('/vault', m);
  assert.equal(h.scritture.length, n, 'lo stesso motivo non si riscrive');
  // rapporto del Giudice assente
  h.store.set('mappai_affermazioni', '1');
  const senzaRapporto = manifesto(RC.createReview({ db: mappa(), sources: SOURCES, report: {}, generationId: 'g' }));
  senzaRapporto.review.quarantena = copy(m.review.quarantena); senzaRapporto.review.quarantena.completo = true;
  await h.A.aggiorna('/vault', senzaRapporto);
  assert.deepEqual([senzaRapporto.review.quarantena.completo, senzaRapporto.review.quarantena.motivo], [false, 'rapporto_assente']);
  // fonte vuota
  const vuota = manifesto(RC.createReview({ db: mappa(), sources: [], report: revisione().initial.report, generationId: 'g' }));
  await h.A.aggiorna('/vault', vuota);
  assert.deepEqual([vuota.review.quarantena.completo, vuota.review.quarantena.motivo], [false, 'fonte_vuota']);
  // revisione approvata
  const approvata = manifesto(); approvata.review.initial.status = 'approved';
  approvata.review.quarantena = copy(m.review.quarantena); approvata.review.quarantena.completo = true;
  await h.A.aggiorna('/vault', approvata);
  assert.deepEqual([approvata.review.quarantena.completo, approvata.review.quarantena.motivo], [false, 'revisione_non_in_attesa']);
  // la scrittura che fallisce: il record in memoria non vale, e l'errore risale
  const ko = ambiente({ storage: ACCESO, falliscono: true }), mk = manifesto();
  await assert.rejects(ko.A.aggiorna('/vault', mk), /disco pieno/);
  assert.equal(mk.review.quarantena.completo, false);
});

test('aggiorna non chiama nessun modello né il reranker, e nemmeno avvia un giro', async () => {
  const h = ambiente({ storage: ACCESO });
  for (const m of [manifesto(), manifesto(revisione([{ id: 'i-link', target: { kind: 'link', source: 'L1_2', target: 'L1_3', rel: 'richiede', field: '$link' }, after: null, problem: 'Il collegamento non è nella fonte.' }]))]) {
    await h.A.aggiorna('/vault', m);
    assert.equal(m.review.quarantena.completo, true);
  }
  assert.deepEqual(h.chiamate, { ai: 0, rerank: 0, chat: 0, avvia: 0, embeddings: 0 });
  // e nel sorgente non c'è nemmeno la strada: nessun riferimento a modelli, giri o reranker
  const src = read('mappai-affermazioni.js').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  for (const vietato of ['fetchModelAPI', 'rerankInfomaniak', '.chat(', 'MappAIModelli', 'fetchEmbeddings', 'generateGemini', 'generateInfomaniak']) {
    assert.ok(!src.includes(vietato), 'la cucitura non deve contenere ' + vietato);
  }
});

/* ── la vista per i materiali ─────────────────────────────────────────────── */
test('perMateriali: null da spento o con G1 approvata; lancia senza un record valido; la vista toglie il pending e tiene la rettifica', async () => {
  const spento = ambiente({ storage: SPENTO }), m0 = manifesto();
  assert.equal(spento.A.perMateriali(m0), null);
  const h = ambiente({ storage: ACCESO }), m = manifesto();
  assert.throws(() => h.A.perMateriali(m), e => e.code === 'QUARANTENA_NON_VALIDA', 'accesa, G1 in attesa e nessun record: si lancia');
  await h.A.aggiorna('/vault', m);
  const Q = h.A.perMateriali(m);
  assert.ok(Q && Q.db && Q.review && Q.ricevuta);
  const alleati = Q.db.nodes.find(n => n.id === 'L1_2'), accuse = Q.db.nodes.find(n => n.id === 'L1_3');
  assert.equal(alleati.desc, 'La Svizzera ha continuato a commerciare con gli Alleati, specialmente con gli USA.');
  assert.ok(accuse.desc.includes(RETTIFICA), 'la correzione del docente entra');
  assert.equal(Q.review.overrides.length, 1);
  assert.equal(Q.review.overrides[0].after, ACCUSE_DOCENTE);
  assert.equal(Q.firma, m.review.quarantena.firma);
  assert.equal(Q.ricevuta.conteggi.fuori.totale, 2);
  assert.equal(h.st.db.nodes[2].desc, ALLEATI, 'la mappa del docente non cambia');
  const G = require(path.join(JS, 'mappai-grounding-core.js'));
  const materiale = G.buildInput(Q.db, h.st.db.nodes, SOURCES, Q.review).material;
  assert.ok(!materiale.includes(CONTESTATA) && !materiale.includes(ANAFORA));
  assert.match(materiale, /RETTIFICHE DEL DOCENTE[\s\S]*prolungato la guerra/);
  const approvata = manifesto(); approvata.review.initial.status = 'approved';
  assert.equal(h.A.perMateriali(approvata), null);
});

test('perMateriali (giro 2): nessuna frase esclusa in NESSUNA parte del materiale, rettifiche comprese — il docente corregge metà di una frase col «;»', async () => {
  const G = require(path.join(JS, 'mappai-grounding-core.js'));
  const SECONDA = 'nel 1943 gli scambi con gli Alleati superarono quelli con la Germania.';
  const PRIMA = 'La Svizzera ha continuato a commerciare con gli Alleati, specialmente con gli USA; ' + SECONDA + ' ' + ANAFORA;
  const db = mappa();
  db.nodes[2] = Object.assign({}, db.nodes[2], { desc: PRIMA });
  const report = { contratto: 'mappai-giudice@2', stato: 'completo',
    copertura: { nodiTotali: 4, nodiEsaminati: ['ROOT', 'L1_1', 'L1_2', 'L1_3'], nodiSaltati: [] },
    issues: [
      { id: 'i-usa', target: { kind: 'node', id: 'L1_2', field: 'desc' }, problem: 'La fonte non dice che il commercio fosse soprattutto con gli USA.' },
      { id: 'i-1943', target: { kind: 'node', id: 'L1_2', field: 'desc' }, problem: 'La fonte non dice «nel 1943 gli scambi con gli Alleati superarono quelli con la Germania».' }] };
  let rv = RC.createReview({ db, sources: SOURCES, report, generationId: 'gen-svizzera' });
  rv = RC.setDecision(rv, 'i-usa', 'manual', { text: PRIMA.replace('specialmente con gli USA', 'in particolare con il Regno Unito e gli Stati Uniti') });
  const h = ambiente({ storage: ACCESO, db }), m = manifesto(rv);
  await h.A.aggiorna('/vault', m);
  assert.equal(m.review.quarantena.completo, true, m.review.quarantena.motivo);
  const escluse = m.review.quarantena.escluse.map(e => e.testo);
  assert.ok(escluse.includes(SECONDA));
  const Q = h.A.perMateriali(m);
  const materiale = G.buildInput(Q.db, h.st.db.nodes, SOURCES, Q.review).material;
  escluse.forEach(t => assert.ok(!materiale.includes(t), 'fuori dal materiale, rettifiche comprese: ' + t));
  assert.match(materiale.split('RETTIFICHE DEL DOCENTE')[1] || '', /Regno Unito e gli Stati Uniti/, 'la correzione resta una rettifica');
  assert.equal(h.st.db.nodes[2].desc, PRIMA, 'la mappa del docente non cambia');
});

/* ── bozze, ricevute e ricontrolli ────────────────────────────────────────── */
test('invalidaBozze: una firma diversa toglie la bozza e rimette il passo in attesa; con la stessa firma niente cambia', async () => {
  const h = ambiente({ storage: ACCESO }), m = manifesto();
  await h.A.aggiorna('/vault', m);
  const firma = m.review.quarantena.firma, ricevuta = AC.ricevuta(m.review.quarantena);
  m.steps.B.status = 'done';
  m.review.drafts = { B: { 'mc-auto': { id: 's1', items: [], quarantena: ricevuta } }, C: {} };
  assert.equal(h.A.invalidaBozze(m), m, 'stessa firma: lo stesso manifesto');
  const vecchia = Object.assign({}, ricevuta, { firma: 'rev-vecchia' });
  m.review.drafts.B['mc-auto'].quarantena = vecchia;
  m.review.final = { stage: 'awaiting_review', items: [] };
  const pulito = h.A.invalidaBozze(m);
  assert.notEqual(pulito, m);
  assert.deepEqual(copy(pulito.review.drafts.B), {});
  assert.equal(pulito.steps.B.status, 'pending');
  assert.equal(pulito.review.final, undefined, '`final` appiattiva bozze che non valgono più');
  assert.equal(m.steps.B.status, 'done', 'il manifesto di partenza non si tocca');
  // una bozza senza ricevuta sotto quarantena viene da un altro stato: via
  m.review.drafts.B['mc-auto'] = { id: 's1', items: [] };
  assert.deepEqual(copy(h.A.invalidaBozze(m).review.drafts.B), {});
  // un giro consegnato non si tocca
  m.review.final = { stage: 'done' };
  assert.equal(h.A.invalidaBozze(m), m);
  // con G1 approvata le bozze nate sotto quarantena non valgono; quelle senza ricevuta sì
  const approvata = manifesto(); approvata.review.initial.status = 'approved'; approvata.steps.B.status = 'done';
  approvata.review.drafts = { B: { a: { id: 'a', items: [] }, b: { id: 'b', items: [], quarantena: ricevuta } }, C: {} };
  assert.deepEqual(Object.keys(h.A.invalidaBozze(approvata).review.drafts.B), ['a']);
  // G1 in attesa e nessun record valido: decide il cancello di oggi, le bozze restano (trappola 41)
  const senza = manifesto(); senza.review.drafts = { B: { b: { id: 'b', items: [], quarantena: ricevuta } }, C: {} };
  assert.equal(h.A.invalidaBozze(senza), senza);
  // firma esplicita
  assert.equal(h.A.invalidaBozze(approvata, null).review.drafts.B.b, undefined);
  assert.equal(firma.length > 0, true);
});

test('riapertura (0060): nodi e collegamenti in un altro ordine, come li rilegge main.js da Nodi/ — il cancello consente e le bozze restano', async () => {
  const h = ambiente({ storage: ACCESO }), m = manifesto();
  await h.A.aggiorna('/vault', m);
  assert.equal(m.review.quarantena.completo, true, m.review.quarantena.motivo);
  const ricevuta = AC.ricevuta(m.review.quarantena);
  m.steps.B.status = 'done';
  m.review.drafts = { B: { 'mc-auto': { id: 's1', items: [], quarantena: ricevuta } }, C: {} };
  m.review.final = { stage: 'awaiting_review', items: [] };
  // la riapertura: lo stesso contenuto, nodi e collegamenti in un altro ordine
  const riaperta = copy(h.st.db); riaperta.nodes.reverse(); riaperta.links.reverse();
  h.st.db = riaperta;
  // da sola non prova niente: con la firma di prima `consente` dà null e invalidaBozze esce senza toccare (trappola 5)
  assert.equal(h.A.invalidaBozze(m), m);
  assert.deepEqual(copy(h.ctx.MappAIReviewCore.gate(m.review, h.st.db, m.review.sources)), { allowed: true, reason: 'quarantine', quarantine: true });
  // «Riprendi»: un secondo aggiorna ricalcola il record sul db riaperto — stessa firma della ricevuta, bozze intatte
  await h.A.aggiorna('/vault', m);
  assert.equal(m.review.quarantena.firma, ricevuta.firma);
  assert.equal(h.A.invalidaBozze(m), m);
});

test('ricevutaDelleBozze: null senza ricevute, la ricevuta comune, lancia su firme diverse', () => {
  const h = ambiente();
  assert.equal(h.A.ricevutaDelleBozze({ B: {}, C: {} }), null);
  assert.equal(h.A.ricevutaDelleBozze({ B: { a: { items: [] } }, C: {} }), null);
  const r = { firma: 'rev-1', conteggi: {} };
  assert.deepEqual(copy(h.A.ricevutaDelleBozze({ B: { a: { quarantena: r } }, C: {}, D: { data: {}, quarantena: r } })), r);
  assert.throws(() => h.A.ricevutaDelleBozze({ B: { a: { quarantena: r }, b: { quarantena: { firma: 'rev-2' } } }, C: {} }), e => e.code === 'QUARANTENA_BOZZE_MISTE');
  assert.throws(() => h.A.ricevutaDelleBozze({ B: { a: { quarantena: r } }, C: { card: { cards: [] } } }), e => e.code === 'QUARANTENA_BOZZE_MISTE');
});

test('conservaMateriali porta bozze, final e consegne nel ricontrollo e toglie il record; senza niente da portare restituisce next', () => {
  const h = ambiente();
  const next = { initial: { status: 'awaiting_review' } };
  assert.equal(h.A.conservaMateriali({ initial: {} }, next), next);
  const old = { drafts: { B: { a: { id: 'a' } }, C: {} }, final: { stage: 'awaiting_review', review: { id: 'g2' } }, deliveries: [{ final: {} }], quarantena: { firma: 'x' } };
  const out = h.A.conservaMateriali(old, Object.assign({}, next, { quarantena: { firma: 'x' } }));
  assert.deepEqual(copy(out.drafts), old.drafts);
  assert.deepEqual(copy(out.final), old.final);
  assert.deepEqual(copy(out.deliveries), old.deliveries);
  assert.equal(out.quarantena, undefined);
  assert.notEqual(out.final, old.final, 'una copia: il ricontrollo non condivide oggetti con la revisione vecchia');
});

test('facoltativa e completo: G1 in attesa conta come approvata solo per il conto dei passi', () => {
  const h = ambiente({ storage: ACCESO }), m = manifesto();
  assert.equal(h.A.facoltativa(m.review), true);
  h.store.set('mappai_review_enabled', '0');
  assert.equal(h.A.facoltativa(m.review), false, 'con la revisione spenta la quarantena non conta');
  h.store.delete('mappai_review_enabled');
  m.steps.B.status = 'pending';
  assert.equal(h.A.completo(m), false);
  m.config = {}; m.steps.B.status = 'skipped';
  assert.equal(h.A.completo(m), true);
  assert.equal(PC.isComplete(m), false, 'il conto di oggi aspetta G1');
});

/* ── la guardia statica sulle catture ──────────────────────────────────────
   Una cattura al caricamento (`const A = window.MappAIAffermazioni` fuori da una
   funzione) legge il namespace una volta sola: se il file che lo definisce carica
   dopo, resta undefined per sempre, senza errori (inv. 4/5, trappola 51). */
test('nessuna cattura di window.MappAIAffermazioni* né di window.MappAIReviewCore fuori da una funzione', () => {
  const togliCommenti = s => s.replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' ')).replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
  const file = ['mappai-affermazioni.js', 'mappai-affermazioni-ui.js', 'mappai-review.js', 'mappai-material-pipeline.js',
    'mappai-branch-synthesis.js', 'mappai-causal-chains.js', 'mappai-print-dossier.js'];
  const catture = [];
  for (const f of file) {
    togliCommenti(read(f)).split('\n').forEach((riga, i) => {
      if (!/window\.MappAI(?:Affermazioni\w*|ReviewCore)\b/.test(riga)) return;
      const rientro = riga.match(/^\s*/)[0].length;
      // il corpo di un IIFE sta a 2 spazi: lì è permesso solo un accessore `() => window.X`
      if (rientro <= 2 && !/=>\s*window\.MappAI/.test(riga) && !/^\s*window\.MappAI\w*\s*=/.test(riga) && !/^\s*if \(window\.MappAI\w*\) return;/.test(riga)) catture.push(f + ':' + (i + 1));
      if (/(?:const|let|var)\s+[\w$]+\s*=\s*window\.MappAIAffermazioni\w*\s*[;,]/.test(riga) && rientro <= 2) catture.push(f + ':' + (i + 1));
    });
  }
  assert.deepEqual(catture, []);
  // e i file che la usano la leggono davvero al momento della chiamata
  assert.match(read('mappai-review.js'), /opts && opts\.quarantena \? window\.MappAIAffermazioni : null/);
  assert.match(read('mappai-material-pipeline.js'), /const AFF = window\.MappAIAffermazioni;/);
});

/* ── il caricamento nell'ordine vero di index.html ────────────────────────── */
test('index.html: core, cucitura e superfici dopo review.js e material-pipeline.js; caricati nell’ordine vero funzionano', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8').replace(/<!--[\s\S]*?-->/g, '');
  const ordine = [...html.matchAll(/<script\b[^>]*\bsrc="js\/([^"?#]+)[^"]*"/g)].map(m => m[1]);
  const pos = f => ordine.indexOf(f);
  for (const f of ['mappai-affermazioni-core.js', 'mappai-affermazioni.js', 'mappai-affermazioni-ui.js']) {
    assert.ok(pos(f) > pos('mappai-review.js') && pos(f) > pos('mappai-material-pipeline.js') && pos(f) > pos('mappai-review-core.js'), f);
    assert.equal(ordine.filter(x => x === f).length, 1, f + ' una volta sola');
  }
  assert.ok(pos('mappai-affermazioni-core.js') < pos('mappai-affermazioni.js') && pos('mappai-affermazioni.js') < pos('mappai-affermazioni-ui.js'));
  // i marcatori ?v= dei file del packet
  for (const f of ['mappai-affermazioni-core.js', 'mappai-affermazioni.js', 'mappai-affermazioni-ui.js', 'mappai-review.js', 'mappai-material-pipeline.js',
    'mappai-branch-synthesis.js', 'mappai-causal-chains.js', 'mappai-print-dossier.js']) {
    assert.match(html, new RegExp('src="js/' + f.replace(/\./g, '\\.') + '\\?v=[^"]+"'), f + ' senza ?v=');
  }
  // si caricano nell'ordine della pagina i moduli che servono, in un contesto dove window è il globale
  const servono = new Set(['mappai-desc-fidelity.js', 'mappai-grounding-core.js', 'mappai-deepen-core.js', 'mappai-boilerplate-core.js',
    'mappai-anchor-core.js', 'mappai-files-core.js', 'mappai-pipeline-core.js', 'mappai-review-core.js', 'mappai-review-context.js',
    'mappai-material-drafts.js', 'mappai-local-search-core.js', 'mappai-review.js', 'mappai-evidence-core.js', 'mappai-material-pipeline.js',
    'mappai-affermazioni-core.js', 'mappai-affermazioni.js', 'mappai-affermazioni-ui.js']);
  const elementi = new Map();
  const ctx = { console: { log() {}, info() {}, warn() {}, error() {} }, setTimeout, clearTimeout, TextDecoder,
    localStorage: { getItem: () => null, setItem() {} },
    appState: { db: mappa(), activeVaultPath: '/vault', sources: [] },
    document: { getElementById: id => elementi.get(id) || null, createElement: () => ({ style: {}, classList: { add() {}, remove() {} } }),
      body: { appendChild() {} }, addEventListener() {}, querySelector: () => null, querySelectorAll: () => [] } };
  ctx.window = ctx; ctx.self = ctx; ctx.globalThis = ctx;
  vm.createContext(ctx);
  const caricati = ordine.filter(f => servono.has(f));
  assert.equal(caricati.length, servono.size, 'ogni modulo che serve è nella pagina');
  for (const f of caricati) vm.runInContext(read(f), ctx, { filename: f });
  assert.equal(ctx.MappAIReviewCore.gate.__quarantena, true, 'la cucitura ha avvolto il gate dell’oggetto che la pagina usa');
  assert.ok(ctx.MappAIAffermazioni && ctx.MappAIAffermazioniUI && ctx.MappAIAffermazioniCore);
  const A = ctx.MappAIAffermazioniCore;
  assert.deepEqual(copy(A.affermazioni('Prima frase. Seconda frase.').map(a => a.testo)), ['Prima frase.', 'Seconda frase.'], 'il core trova le sue dipendenze nel renderer');
  assert.ok(A.frasiFonte(SOURCES).length > 3);
  // da spento il cancello della pagina dà lo stesso esito di review-core
  const m = manifesto();
  assert.deepEqual(copy(ctx.MappAIReviewCore.gate(m.review, ctx.appState.db, m.review.sources)), copy(RC.gate(m.review, mappa(), m.review.sources)));
});

/* ── il riquadro del Setup ─────────────────────────────────────────────────
   Un DOM minimo su cheerio (la stessa libreria di review-controller): quanto
   basta a montaSetup e disegnaSetup. L'IntersectionObserver è finto: la sua
   funzione si chiama a mano, come quando il Setup torna visibile. */
function setupDom(storage, traduci) {
  const cheerio = require('cheerio');
  const $ = cheerio.load('<html><body><div id="config-ai-modal"><div class="space-y-5">' +
    '<div id="infomaniak-api-key-container" class="hidden space-y-5"><div class="bg-indigo-50"><label><input type="checkbox" id="evidence-toggle"></label></div></div>' +
    '<div id="model-box"></div></div></div><button id="lang-btn-en"></button></body></html>');
  const cache = new WeakMap();
  const wrap = n => {
    if (!n) return null;
    if (cache.has(n)) return cache.get(n);
    const e = { n, listeners: {},
      get parentNode() { return wrap($(n).parent().get(0)); },
      get nextSibling() { return wrap($(n).next().get(0)); },
      get id() { return $(n).attr('id'); }, set id(v) { $(n).attr('id', v); },
      set innerHTML(v) { $(n).html(v); }, get innerHTML() { return $(n).html(); },
      get textContent() { return $(n).text(); },
      insertBefore(nuovo, rif) { if (rif) $(rif.n).before(nuovo.n); else $(n).append(nuovo.n); return nuovo; },
      closest(s) { return wrap($(n).closest(s).get(0)); },
      querySelector(s) { return wrap($(n).find(s).get(0)); },
      addEventListener(k, fn) { this.listeners[k] = fn; } };
    for (const p of ['checked', 'disabled']) Object.defineProperty(e, p, { get() { return $(n).attr(p) !== undefined; }, set(v) { if (v) $(n).attr(p, p); else $(n).removeAttr(p); } });
    cache.set(n, e); return e;
  };
  const osservatori = [];
  const ctx = { console, setTimeout: fn => fn(), localStorage: { getItem: k => (storage.has(k) ? storage.get(k) : null), setItem: (k, v) => storage.set(k, String(v)) },
    document: { getElementById: id => wrap($('#' + id).get(0)), createElement: tag => wrap($('<' + tag + '>').get(0)) },
    IntersectionObserver: class { constructor(fn) { this.fn = fn; osservatori.push(this); } observe(el) { this.el = el; } },
    t: (k, f) => traduci(k, f) };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(read('mappai-affermazioni-ui.js'), ctx);
  return { ctx, $, osservatori, host: () => ctx.document.getElementById('aff-setup') };
}

test('0089 (ADR 0020): un docente nuovo vede nel Setup le spunte accese come il motore; col \'0\' le vede spente; le frasi orfane restano spente', () => {
  const nuovo = setupDom(new Map(), (k, f) => f).host();
  assert.equal(nuovo.querySelector('#aff-layer-toggle').checked, true, 'strato acceso senza chiave');
  assert.equal(nuovo.querySelector('#aff-quarantine-toggle').checked, true, 'quarantena accesa senza chiave');
  assert.equal(nuovo.querySelector('#aff-quarantine-toggle').disabled, false);
  assert.doesNotMatch(nuovo.textContent, /Accendi prima lo strato/);
  assert.equal(nuovo.querySelector('#aff-orphans-toggle').checked, false, 'frasi orfane spente senza chiave');
  const spento = setupDom(new Map([['mappai_affermazioni', '0'], ['mappai_quarantena', '0']]), (k, f) => f).host();
  assert.equal(spento.querySelector('#aff-layer-toggle').checked, false);
  assert.equal(spento.querySelector('#aff-quarantine-toggle').checked, false);
});

test('riquadro del Setup: fuori dal contenitore di Infomaniak, due spunte, e si ricostruisce a ogni apertura', () => {
  // packet 0089: senza chiave sono accese; questa prova parte «da spento», col '0' esplicito
  const storage = new Map([['mappai_affermazioni', '0'], ['mappai_quarantena', '0']]);
  let lingua = 'it';
  const d = setupDom(storage, (k, f) => (lingua === 'en' ? 'EN:' + k : f));
  const host = d.host();
  assert.ok(host, 'montato al caricamento');
  assert.equal(d.$('#aff-setup').prev().attr('id'), 'infomaniak-api-key-container', 'subito dopo il contenitore che col provider Google si nasconde');
  assert.equal(d.$('#infomaniak-api-key-container #aff-setup').length, 0);
  const strato = () => host.querySelector('#aff-layer-toggle'), q = () => host.querySelector('#aff-quarantine-toggle');
  assert.equal(strato().checked, false);
  assert.equal(q().disabled, true, 'la quarantena aspetta lo strato');
  assert.match(host.textContent, /Accendi prima lo strato delle affermazioni/);
  assert.equal(d.$('#aff-setup input[type="checkbox"]').length, 2);
  // accendere lo strato scrive l'interruttore e abilita la quarantena
  strato().checked = true; strato().onchange();
  assert.equal(storage.get('mappai_affermazioni'), '1');
  assert.equal(q().disabled, false);
  q().checked = true; q().onchange();
  assert.equal(storage.get('mappai_quarantena'), '1');
  assert.doesNotMatch(host.textContent, /verificat/, 'nessuna promessa di verifica (inv. 22)');
  // la revisione spenta: la quarantena non serve, e lo si dice
  storage.set('mappai_review_enabled', '0');
  d.osservatori[0].fn([{ isIntersecting: true }]);
  assert.equal(q().disabled, true);
  assert.match(host.textContent, /La revisione dei contenuti è spenta/);
  storage.delete('mappai_review_enabled');
  // cambio di lingua: alla prossima apertura il riquadro è ritradotto (e al clic sulla bandiera)
  lingua = 'en';
  d.osservatori[0].fn([{ isIntersecting: false }]);
  assert.match(host.textContent, /Strato delle affermazioni/, 'nascosto non si ridisegna');
  d.osservatori[0].fn([{ isIntersecting: true }]);
  assert.match(host.textContent, /EN:aff_setup_layer/);
  assert.equal(strato().checked, true, 'le spunte seguono gli interruttori salvati');
  lingua = 'it';
  d.ctx.document.getElementById('lang-btn-en').listeners.click();
  assert.match(host.textContent, /Strato delle affermazioni/);
  // un secondo montaggio non duplica il riquadro
  d.ctx.MappAIAffermazioniUI.montaSetup();
  assert.equal(d.$('[id="aff-setup"]').length, 1);
});
