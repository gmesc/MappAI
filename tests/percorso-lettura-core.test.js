'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');
const C = require('../public/js/mappai-percorso-lettura-core.js');
const clone = value => JSON.parse(JSON.stringify(value));
function freeze(value) {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}
function draft() {
  const source = { sourceId: 'fonte-1', sourceRevision: 1,
    provenance: { kind: 'text', name: 'Racconto', originalPath: 'Fonti/racconto.txt' }, paragraphs: [
      { id: 'p1', type: 'heading', text: 'Il ritorno', emphasis: [] },
      { id: 'p2', type: 'dialogue', text: '«Torno domani», disse Ada.\nPoi partì.', emphasis: [{ start: 1, end: 6, kind: 'em' }] },
      { id: 'p3', type: 'paragraph', text: 'Bruno aspettò due giorni.  Infine tornò a casa.', emphasis: [] }
    ] };
  const activities = [
    { id: 'a1', revision: 1, format: 'mc', question: 'Quando promette di tornare Ada?',
      operation: 'informazioni-esplicite', difficulty: 'base', reference: { scope: 'passages', paragraphIds: ['p2'] },
      options: [{ id: 'o1', text: 'Domani.' }, { id: 'o2', text: 'Oggi.' }, { id: 'o3', text: 'Tra due giorni.' }, { id: 'o4', text: 'Mai.' }],
      teacher: { correctOptionId: 'o1', answer: 'Il giorno dopo.', criteria: ['Distinguere la promessa dall’attesa.'],
        evidence: [{ paragraphId: 'p2', quote: 'Torno domani', sourceId: 'fonte-1' }],
        distractors: [{ optionId: 'o2', reason: 'Confonde i tempi.' }, { optionId: 'o3', reason: 'Riprende la durata dell’attesa.' },
          { optionId: 'o4', reason: 'Confonde intenzione ed esito.' }] } },
    { id: 'a2', revision: 1, format: 'open', question: 'Spiega il rapporto fra promessa e attesa.', lines: 5,
      operation: 'inferenze', difficulty: 'avanzata', reference: { scope: 'passages', paragraphIds: ['p2', 'p3'] },
      teacher: { answer: 'La promessa non viene mantenuta nel tempo indicato.', criteria: ['Collegare i due passaggi.'],
        evidence: [{ paragraphId: 'p3', quote: 'aspettò due giorni', sourceId: 'fonte-1' }] } },
    { id: 'a3', revision: 1, format: 'open', question: 'Qual è la funzione del titolo?', lines: 4,
      operation: 'senso-funzione', difficulty: 'intermedia', reference: { scope: 'whole', paragraphIds: [] },
      teacher: { answer: 'Richiama il ritorno atteso e quello effettivo.', criteria: ['Riferirsi al racconto.'], evidence: [] } }
  ];
  return { kind: 'percorso-lettura', schemaVersion: 1, projectId: 'project-1', percorsoId: 'percorso-1',
    title: 'Promesse e attese', language: 'it', source, activities, sequence: C.initialSequence(source.paragraphs, activities) };
}
async function receipts(d = draft()) {
  return Promise.all(d.activities.map(async a => ({ activityId: a.id, fingerprint: await C.activityFingerprint(d, a.id),
    state: 'approvato', confirmed: true, persisted: true, pending: false, excluded: false })));
}
function invalid(fn, path) {
  assert.throws(fn, e => e.code === 'invalid_reading_path' && (!path || e.path.includes(path)));
}

test('contratto Node/browser senza DOM, mappa o accesso allo storage; fallback i18n locale', async () => {
  const code = fs.readFileSync(require.resolve('../public/js/mappai-percorso-lettura-core.js'), 'utf8');
  const sandbox = { crypto: webcrypto, TextEncoder, window: { t: (_key, fallback) => fallback } };
  vm.runInNewContext(code, sandbox);
  const browser = sandbox.MappAIPercorsoLetturaCore;
  assert.equal(browser.validateDraft(draft()), true);
  assert.equal(await browser.sourceFingerprint(draft()), await C.sourceFingerprint(draft()));
  assert.match(await browser.sourceFingerprint(draft()), /^sha256-[a-f0-9]{64}$/);
  invalid(() => browser.validateDraft({}), 'draft.schema');
  const noCrypto = { TextEncoder };
  vm.runInNewContext(code, noCrypto);
  await assert.rejects(noCrypto.MappAIPercorsoLetturaCore.sourceFingerprint(draft()), /fingerprint.crypto/);
});

test('testo canonico preservato esattamente: dialoghi, enfasi, spazi e a capo', () => {
  const d = freeze(draft()), publicData = C.projectPublicContent(d, ['a1', 'a2', 'a3']);
  assert.equal(C.validateDraft(d), true); assert.equal(C.validatePublicContent(publicData), true);
  assert.deepEqual(publicData.source.paragraphs, d.source.paragraphs);
  assert.equal(d.db, undefined);
});

test('versione fissa: aiuti esclusi rimossi dai dati pubblici, conservati nella fotografia privata e sensibili all’impronta', async () => {
  const d = draft(); d.activities[0].help = 'Rileggi il dialogo.';
  const before = await C.activityFingerprint(d, 'a1'); d.activities[0].includeHelp = false;
  assert.notEqual(await C.activityFingerprint(d, 'a1'), before);
  const frozen = await C.freezeVersion(d, ['a1'], await receipts(d), { verificaId: 'v1', versioneId: 'x1',
    title: 'Prova', createdAt: '2026-10-09T12:00:00.000Z', print: { includeHelp: false } });
  assert.equal(frozen.assigned.content.activities[0].help, undefined);
  assert.equal(frozen.guide.draft.activities[0].help, 'Rileggi il dialogo.');
  d.activities[0].question += ' Modificata.'; d.activities[0].help = 'Altro aiuto.';
  assert.equal(await C.verifyAssigned(frozen.assigned), true);
  assert.equal(JSON.stringify(frozen.assigned).includes('Rileggi il dialogo.'), false);
});

test('chevron indipendenti: cambiano la sequenza, mai fonte, ID, opzioni o revisione', () => {
  const d = freeze(draft());
  const moved = C.moveBlock(d, 3, -1);
  assert.deepEqual(moved.sequence[2], { kind: 'activity', activityId: 'a1' });
  assert.deepEqual(moved.source, d.source); assert.deepEqual(moved.activities, d.activities);
  const textMoved = C.moveBlock(moved, 1, -1);
  assert.deepEqual(textMoved.source, d.source);
  assert.deepEqual(C.moveBlock(d, 0, -1), d);
  invalid(() => C.moveBlock(d, -1, 1), 'move.index');
  invalid(() => C.moveBlock(d, 1, 2), 'move.direction');
});

test('ID duplicati, insicuri, rimandi orfani e sequenze incomplete non vengono riparati silenziosamente', () => {
  const changes = [
    d => { d.percorsoId = '../altro'; },
    d => { d.source.paragraphs[1].id = 'p1'; },
    d => { d.activities[1].id = 'a1'; },
    d => { d.activities[0].options[1].id = 'o1'; },
    d => { d.activities[0].reference.paragraphIds = ['mancante']; },
    d => { d.activities[0].reference.paragraphIds = ['p2', 'p2']; },
    d => { d.activities[0].reference.paragraphIds = []; },
    d => { d.activities[2].reference.paragraphIds = ['p1']; },
    d => { d.sequence.pop(); },
    d => { d.sequence.push(d.sequence[0]); },
    d => { d.source.sourceRevision = 0; },
    d => { d.activities[0].revision = 1.2; },
    d => { d.schemaVersion = 2; }
  ];
  changes.forEach(change => { const d = draft(); change(d); invalid(() => C.validateDraft(d)); });
});

test('MC: quattro alternative, chiave presente, tre motivazioni distinte e punteggiatura uniforme', () => {
  for (const change of [
    d => d.activities[0].options.pop(),
    d => { d.activities[0].teacher.correctOptionId = 'o5'; },
    d => d.activities[0].teacher.distractors.pop(),
    d => { d.activities[0].teacher.distractors[0].optionId = 'o1'; },
    d => { d.activities[0].options[2].text = 'Due giorni'; }
  ]) { const d = draft(); change(d); invalid(() => C.validateDraft(d)); }
  const d = draft();
  ['Punto.', 'Domanda?', 'Esclama!', 'Sospeso…'].forEach((text, i) => { d.activities[0].options[i].text = text; });
  assert.equal(C.validateDraft(d), true);
});

test('enfasi: niente HTML, intervalli fuori testo o confini che tagliano caratteri Unicode', () => {
  for (const emphasis of [[{ start: -1, end: 5, kind: 'em' }], [{ start: 1, end: 100, kind: 'em' }],
    [{ start: 1, end: 3, kind: 'script' }], [{ start: 0, end: 1, kind: 'em' }]]) {
    const d = draft(); d.source.paragraphs[0].text = '𝒜 testo'; d.source.paragraphs[0].emphasis = emphasis;
    invalid(() => C.validateDraft(d));
  }
  const d = draft(); d.source.paragraphs[0].text = '𝒜 testo';
  d.source.paragraphs[0].emphasis = [{ start: 0, end: 2, kind: 'strong' }];
  assert.equal(C.validateDraft(d), true);
});

test('tre difficoltà e otto operazioni validate; fonte vuota e formati sconosciuti respinti', () => {
  const d = draft();
  for (const operation of C.OPERATIONS) for (const difficulty of C.DIFFICULTIES) {
    d.activities[0].operation = operation; d.activities[0].difficulty = difficulty;
    assert.equal(C.validateDraft(d), true);
  }
  for (const [key, value] of [['format', 'flashcard'], ['difficulty', 'L1'], ['operation', 'immagine']]) {
    const d = draft(); d.activities[0][key] = value; invalid(() => C.validateDraft(d));
  }
  d.source.paragraphs = []; invalid(() => C.validateDraft(d), 'source.paragraphs');
});

test('proiezione pubblica per lista positiva anche nei campi annidati', () => {
  const d = draft(), secret = 'SEGRETO_NON_CONSEGNARE';
  d.pipeline = { secret }; d.source.provenance.secret = secret;
  d.source.paragraphs[0].teacherNotes = secret;
  d.activities.forEach(a => { a.teacher.answer = secret; a.internal = secret; a.review = { secret }; });
  d.activities[0].options[0].explanation = secret;
  const publicData = C.projectPublicContent(d, ['a1', 'a2']);
  const json = JSON.stringify(publicData);
  assert.equal(json.includes(secret), false); assert.equal(json.includes('correctOptionId'), false);
  assert.equal(json.includes('teacher'), false); assert.equal(json.includes('provenance'), false);
  assert.equal(publicData.activities.length, 2); assert.equal(publicData.source.paragraphs.length, 3);
});

test('validatore pubblico rifiuta campi riservati o futuri, anche nascosti in opzioni, rimandi e sequenza', () => {
  for (const inject of [
    c => { c.teacher = 'segreto'; }, c => { c.source.provenance = 'segreto'; },
    c => { c.source.paragraphs[0].answer = 'segreto'; },
    c => { c.activities[0].correctOptionId = 'o1'; },
    c => { c.activities[0].options[0].correct = true; },
    c => { c.activities[0].reference.quote = 'Torno domani'; },
    c => { c.sequence[0].metadata = 'segreto'; }
  ]) {
    const c = C.projectPublicContent(draft(), ['a1']); inject(c); invalid(() => C.validatePublicContent(c));
  }
});

test('composizione: selezione ordinata, nessuna perdita dei passaggi intercalati', () => {
  const d = C.moveBlock(C.moveBlock(draft(), 3, -1), 2, -1);
  const c = C.projectPublicContent(d, ['a3', 'a1']);
  assert.deepEqual(c.activities.map(a => a.id), ['a3', 'a1']);
  assert.deepEqual(c.sequence.filter(b => b.kind === 'activity').map(b => b.activityId), ['a3', 'a1']);
  assert.deepEqual(c.sequence.filter(b => b.kind === 'paragraph').map(b => b.paragraphId), ['p1', 'p2', 'p3']);
  invalid(() => C.projectPublicContent(d, ['a1', 'a1']), 'duplicate');
  invalid(() => C.projectPublicContent(d, ['sconosciuta']), 'unknown');
});

test('Vai al testo locale, multiplo e globale risolve identità, senza coordinate o citazioni risolutive', () => {
  const content = C.projectPublicContent(draft(), ['a1', 'a2', 'a3']);
  assert.deepEqual(C.resolveReference(content, 'a1').paragraphs.map(p => p.id), ['p2']);
  assert.deepEqual(C.resolveReference(content, 'a2').paragraphs.map(p => p.id), ['p2', 'p3']);
  assert.deepEqual(C.resolveReference(content, 'a3').paragraphs.map(p => p.id), ['p1', 'p2', 'p3']);
  invalid(() => C.resolveReference(content, 'manca'), 'activityId');
});

test('copie isolate: modificare bozza, selezione o un rimando risolto non cambia il contenuto consegnabile', () => {
  const d = draft(), c = C.projectPublicContent(d, ['a1']), saved = clone(c);
  d.source.paragraphs[1].text = 'Testo nuovo'; d.activities[0].question = 'Altra domanda';
  C.resolveReference(c, 'a1').paragraphs[0].text = 'Mutazione locale';
  assert.deepEqual(c, saved);
  c.activities[0].options[0].text = 'Modificata.';
  assert.equal(d.activities[0].options[0].text, 'Domani.');
});

test('impronta: ordini delle chiavi JSON equivalenti; riordino didattico e font non invalidano la rilettura', async () => {
  const d = draft(), fingerprint = await C.activityFingerprint(d, 'a1');
  const reordered = Object.fromEntries(Object.entries(d).reverse());
  assert.equal(await C.activityFingerprint(reordered, 'a1'), fingerprint);
  const moved = C.moveBlock(d, 3, -1); moved.printSettings = { fontSize: 20 };
  assert.equal(await C.activityFingerprint(moved, 'a1'), fingerprint);
  assert.equal(await C.sourceFingerprint(moved), await C.sourceFingerprint(d));
});

test('impronta: fonte, ordine canonico, chiave, criteri, opzioni, rimandi e progetto invalidano', async () => {
  const original = await C.activityFingerprint(draft(), 'a1');
  for (const change of [
    d => { d.source.paragraphs[1].text += ' Davvero.'; },
    d => d.source.paragraphs.reverse(),
    d => { d.source.sourceRevision++; },
    d => { d.activities[0].question += ' Spiega.'; },
    d => { d.activities[0].options[0].text = 'Subito.'; },
    d => { d.activities[0].teacher.criteria.push('Nuovo criterio.'); },
    d => { d.activities[0].teacher.answer = 'Risposta rivista.'; },
    d => { d.activities[0].reference.paragraphIds = ['p3']; },
    d => { d.projectId = 'project-2'; },
    d => { d.activities[0].teacher.correctOptionId = 'o2'; d.activities[0].teacher.distractors[0].optionId = 'o1'; }
  ]) { const d = draft(); change(d); assert.notEqual(await C.activityFingerprint(d, 'a1'), original); }
});

test('pool riletto: rivisto e approvato ammessi; AI positiva e correzione salvata senza clic non bastano', async () => {
  const d = draft(), records = await receipts(d); records[1].state = 'rivisto';
  assert.deepEqual((await C.selectReviewed(freeze(d), ['a2', 'a1'], freeze(records))).map(a => a.id), ['a2', 'a1']);
  for (const change of [
    c => { c.confirmed = false; }, c => { delete c.confirmed; }, c => { c.persisted = false; },
    c => { c.pending = true; }, c => { c.excluded = true; }, c => { c.state = 'da-rivedere'; },
    c => { c.state = 'verified'; }, c => { c.fingerprint = 'vecchia'; }
  ]) {
    const rec = await receipts(); change(rec[0]);
    await assert.rejects(C.selectReviewed(draft(), ['a1'], rec), e => e.code === 'invalid_reading_path');
  }
  await assert.rejects(C.selectReviewed(draft(), ['a1'], []));
});

test('conferme scadute dopo correzione o cambio fonte bloccano la selezione', async () => {
  const d = draft(), records = await receipts(d);
  d.activities[0].teacher.criteria.push('Criterio nuovo.');
  await assert.rejects(C.selectReviewed(d, ['a1'], records), /stale/);
  assert.equal((await C.selectReviewed(d, ['a2'], records)).length, 1);
  d.source.paragraphs[2].text += ' Fine.';
  await assert.rejects(C.selectReviewed(d, ['a2'], records), /stale/);
});

test('selezione asincrona usa la fotografia iniziale, senza contaminazioni da callback tardive', async () => {
  const d = draft(), records = await receipts(d), ids = ['a1', 'a2'];
  const pending = C.selectReviewed(d, ids, records);
  d.activities[1].id = 'altra'; d.activities[1].question = 'Mutata'; ids[1] = 'altra'; records[1].excluded = true;
  const result = await pending;
  assert.deepEqual(result.map(a => a.id), ['a1', 'a2']);
  assert.equal(result[1].question, 'Spiega il rapporto fra promessa e attesa.');
});

test('indice locale piccolo, senza fonte, HTML, guida, pipeline o snapshot', () => {
  const d = draft(), secret = 'DATI_PRIVATI_NON_IN_INDICE';
  d.source.paragraphs[1].text += secret.repeat(10000); d.pipeline = { secret }; d.html = secret;
  const index = C.localIndex(d), json = JSON.stringify(index);
  assert.equal(json.includes(secret), false); assert.ok(json.length < 600);
  assert.equal(index.sourcePath, 'Materiale Studio/Sorgenti/Percorso-lettura-percorso-1.json');
  assert.equal(index.extractionMode, 'lettura');
  assert.deepEqual(Object.keys(index).sort(), ['kind', 'schemaVersion', 'extractionMode', 'projectId', 'percorsoId',
    'title', 'language', 'sourceId', 'sourceRevision', 'sourcePath'].sort());
});

function sourceInput(kind = 'text') {
  return { projectId: 'proj_1790000000000', percorsoId: 'percorso', sourceId: 'fonte', title: 'Una lettura', language: 'it',
    kind, name: 'Racconto.' + (kind === 'text' ? 'txt' : kind),
    text: '  Un titolo\r\nUna parola spez-\r\nzata.\r\n \t\r\n«𝒜 & <b>non è markup</b>».  \rFine.',
    pages: [{ n: 1, text: '  Un titolo\r\nUna parola spez-\r\nzata.' }, { n: 2, text: '«𝒜 & <b>non è markup</b>».  \rFine.' }] };
}

test('importazione: testo originale e pagine integri; i ritorni singoli e la sillabazione non sono riscritti', () => {
  for (const kind of ['text', 'pdf', 'docx']) {
    const input = freeze(sourceInput(kind)); let n = 0;
    const imported = C.importSource(input, () => 'blocco-' + (++n));
    assert.equal(imported.source.provenance.originalText, input.text);
    assert.deepEqual(imported.source.provenance.pages, input.pages);
    assert.deepEqual(imported.source.paragraphs.map(p => p.text),
      ['  Un titolo\nUna parola spez-\nzata.', '«𝒜 & <b>non è markup</b>».  \nFine.']);
    assert.deepEqual(imported.source.paragraphs.map(p => p.id), ['blocco-1', 'blocco-2']);
    assert.ok(imported.source.paragraphs.every(p => p.type === 'paragraph' && !p.emphasis.length));
    assert.equal(imported.source.provenance.structureConfirmed, false);
    assert.equal(imported.source.provenance.emphasisRecovered, false);
    assert.equal(imported.activities.length, 0);
    assert.deepEqual(imported.sequence, [{ kind: 'paragraph', paragraphId: 'blocco-1' }, { kind: 'paragraph', paragraphId: 'blocco-2' }]);
    imported.source.provenance.pages[0].text = 'Modifica esterna';
    assert.equal(input.pages[0].text, '  Un titolo\r\nUna parola spez-\r\nzata.');
  }
});

test('importazione: fonte vuota, formati sconosciuti, pagine e ID invalidi non creano una bozza utilizzabile', () => {
  for (const change of [input => { input.text = ' \r\n\t '; }, input => { input.kind = 'image'; },
    input => { input.pages = 'una pagina'; }, input => { input.pages[0].n = 0; },
    input => { input.pages[0].n = 1.5; }, input => { input.pages[0].text = 42; }]) {
    const input = sourceInput(); change(input); let n = 0;
    invalid(() => C.importSource(input, () => 'p' + (++n)));
  }
  invalid(() => C.importSource(sourceInput(), () => 'duplicato'), 'duplicate');
  invalid(() => C.importSource(sourceInput(), () => '../passaggio'));
  invalid(() => C.importSource(sourceInput(), null), 'import.ids');
});

test('G1 testuale: ordine canonico esplicito, struttura ed enfasi tornano agli stessi paragrafi senza mutare originale e sequenza', () => {
  const input = draft(); input.source.provenance.originalText = 'Originale archiviato, mai riscritto.';
  const d = freeze(input), db = C.sourceReviewDb(d);
  assert.deepEqual(db.items.map(p => [p.id, p.order]), [['p1', 0], ['p2', 1], ['p3', 2]]);
  db.items[0].blockType = 'paragraph'; db.items[0].emphasis = [{ start: 0, end: 2, kind: 'strong' }];
  db.items[2].text += ' Fine.';
  db.items[0].order = 1; db.items[1].order = 2; db.items[2].order = 0;
  db.items.reverse();
  const changed = C.applySourceReview(d, freeze(db));
  assert.deepEqual(changed.source.paragraphs.map(p => p.id), ['p3', 'p1', 'p2']);
  assert.equal(changed.source.paragraphs[0].text, 'Bruno aspettò due giorni.  Infine tornò a casa. Fine.');
  assert.deepEqual(changed.source.paragraphs[1].emphasis, [{ start: 0, end: 2, kind: 'strong' }]);
  assert.deepEqual(changed.source.paragraphs[2], d.source.paragraphs[1]);
  assert.deepEqual(changed.source.provenance, d.source.provenance);
  assert.deepEqual(changed.sequence, d.sequence); assert.deepEqual(changed.activities, d.activities);
  // Il lifecycle della revisione è del controller, non della trasformazione pura.
  assert.equal(changed.source.sourceRevision, d.source.sourceRevision);
});

test('G1 testuale: identità, ordine ed enfasi incoerenti bloccano il ritorno alla fonte', () => {
  const d = freeze(draft());
  for (const change of [db => { db.items[0].id = 'estraneo'; }, db => { db.items.pop(); },
    db => { db.items[1].id = db.items[0].id; }, db => { db.items[1].order = 0; },
    db => { db.items[0].order = -1; }, db => { db.items[0].order = 3; },
    db => { db.items[0].order = .5; }, db => { db.items[0].kind = 'map-node'; },
    db => { db.items[0].originalText = 'Una fonte diversa'; },
    db => { db.items[0].emphasis = [{ start: 0, end: 500, kind: 'em' }]; }]) {
    const db = C.sourceReviewDb(d); change(db); invalid(() => C.applySourceReview(d, db));
  }
  const changedText = C.sourceReviewDb(d); changedText.items[1].text = 'Una frase di uguale lunghezza con un significato diverso.';
  changedText.items[1].emphasis = [];
  invalid(() => C.applySourceReview(d, changedText), 'sourceReview.emphasis.recheck');
});

test('impronta della bozza completa: copie JSON equivalenti, metadati privati inclusi e fotografia prima delle attese', async () => {
  const d = draft(), before = await C.draftFingerprint(d);
  assert.equal(await C.draftFingerprint(Object.fromEntries(Object.entries(d).reverse())), before);
  for (const change of [x => { x.title += ' — modificato'; }, x => { x.source.provenance.originalText = 'Altro originale'; },
    x => { x.source.provenance.pages = [{ n: 2, text: 'Una pagina diversa.' }]; },
    x => { x.printSettings = { fontSize: 24 }; }, x => { x.activities[0].teacher.answer += ' Altra lettura.'; },
    x => { x.sequence.reverse(); }, x => { x.source.paragraphs.reverse(); }]) {
    const changed = draft(); change(changed); assert.notEqual(await C.draftFingerprint(changed), before);
  }
  const pending = C.draftFingerprint(d);
  d.source.paragraphs[2].text = 'Modifica tardiva'; d.activities[0].teacher.answer = 'Risposta tardiva';
  assert.equal(await pending, before);
});

test('G2: proiezione del Banco conserva identità opzioni, rimandi e guida privata senza vincolare le righe', () => {
  const input = draft(); input.activities[1].lines = 100;
  input.activities[0].teacher.teaching = { strategy: 'Confrontare promessa e attesa.' };
  input.activities[0].teacher.design = { misconception: 'La durata dell’attesa diventa la promessa.' };
  const d = freeze(input), db = C.activitiesReviewDb(d);
  assert.deepEqual(db.items.map(item => item.kind), ['mc', 'open', 'open']);
  assert.deepEqual(db.items[0].optionIds, ['o1', 'o2', 'o3', 'o4']);
  assert.deepEqual(db.items[0].options, d.activities[0].options.map(option => option.text));
  assert.equal(db.items[0].correctIndex, 0); assert.equal(db.items[0].explanation, d.activities[0].teacher.answer);
  assert.equal(db.items[1].guide, d.activities[1].teacher.answer);
  assert.equal(db.items[1].reading.lines, 100); assert.equal(Object.hasOwn(db.items[1], 'lines'), false);
  assert.equal(Object.hasOwn(db.items[0], 'revision'), false);
  assert.deepEqual(C.applyActivitiesReview(d, freeze(db)), d);
  const projected = C.activitiesReviewDb(d);
  projected.items[0].reading.teacher.teaching.strategy = 'Modifica locale.';
  projected.items[0].optionIds[0] = 'altro';
  assert.equal(d.activities[0].teacher.teaching.strategy, 'Confrontare promessa e attesa.');
  assert.equal(d.activities[0].options[0].id, 'o1');
});

test('G2: modifiche lette dal disco riproducono la stessa proiezione e il recupero non incrementa due volte la revisione', () => {
  const d = freeze(draft()), edited = C.activitiesReviewDb(d);
  edited.items[0].question = 'Che giorno indica la promessa di Ada?';
  edited.items[0].options[0] = 'Il giorno successivo.';
  edited.items[0].explanation = 'Ada promette di tornare il giorno successivo.';
  edited.items[0].criteria = ['Citare la promessa di Ada.', 'Distinguere promessa e attesa.'];
  edited.items[1].question = 'Come si collegano la promessa e i giorni di attesa?';
  edited.items[1].guide = 'L’attesa dura più del tempo promesso.';
  edited.items[1].criteria = ['Confrontare i due tempi del racconto.'];
  freeze(edited);
  const applied = C.applyActivitiesReview(d, edited), disk = JSON.parse(JSON.stringify(applied));
  assert.deepEqual(C.activitiesReviewDb(disk), edited);
  assert.deepEqual(C.applyActivitiesReview(disk, edited), disk);
  assert.deepEqual(applied.activities.map(activity => activity.revision), [2, 2, 1]);
  assert.deepEqual(applied.activities[0].options.map(option => option.id), d.activities[0].options.map(option => option.id));
  assert.equal(applied.activities[0].teacher.correctOptionId, 'o1');
  assert.deepEqual(applied.activities[0].teacher.distractors, d.activities[0].teacher.distractors);
  assert.deepEqual(applied.activities[0].teacher.evidence, d.activities[0].teacher.evidence);
  assert.deepEqual(applied.source, d.source); assert.deepEqual(applied.sequence, d.sequence);
});

test('G2: esclusione rimuove solo attività e relativo blocco, ordine del Banco non riordina la bozza intercalata', () => {
  const d = freeze(C.moveBlock(C.moveBlock(draft(), 3, -1), 2, -1));
  const db = C.activitiesReviewDb(d); db.items.reverse();
  assert.deepEqual(C.applyActivitiesReview(d, db), d);
  db.items = db.items.filter(item => item.id !== 'a2');
  const result = C.applyActivitiesReview(d, db);
  assert.deepEqual(result.activities.map(a => a.id), ['a1', 'a3']);
  assert.deepEqual(result.sequence, d.sequence.filter(block => block.activityId !== 'a2'));
  assert.deepEqual(result.source, d.source);
  const empty = C.applyActivitiesReview(d, { items: [] });
  assert.deepEqual(empty.activities, []);
  assert.deepEqual(empty.sequence, d.sequence.filter(block => block.kind === 'paragraph'));
});

test('G2: chiave MC e dati non editabili non possono essere alterati senza nuova verifica', () => {
  const d = freeze(draft());
  const attacks = [
    [db => { db.items[0].correctIndex = 1; db.items[0].explanation = 'Nuova chiave dichiarata corretta.'; }, 'correctIndex.recheck'],
    [db => { db.items[0].correctIndex = '0'; }, 'correctIndex.recheck'],
    [db => db.items[0].optionIds.reverse(), 'optionIds'],
    [db => { db.items[0].reading.reference.paragraphIds = ['p3']; }, 'metadata'],
    [db => { db.items[0].reading.operation = 'inferenze'; }, 'metadata'],
    [db => { db.items[0].reading.difficulty = 'avanzata'; }, 'metadata'],
    [db => { db.items[0].reading.teacher.evidence[0].quote = 'Citazione inventata.'; }, 'metadata'],
    [db => { db.items[0].reading.teacher.distractors[0].reason = 'Nuova motivazione.'; }, 'metadata'],
    [db => { db.items[1].reading.lines = 2; }, 'metadata'],
    [db => { db.items[0].kind = 'open'; }, 'identity'],
    [db => { db.items[0].id = 'altra-attivita'; }, 'identity']
  ];
  for (const [edit, path] of attacks) {
    const db = C.activitiesReviewDb(d); edit(db);
    invalid(() => C.applyActivitiesReview(d, db), path);
  }
});

test('G2: struttura, campi mancanti e tipi non validi vengono respinti senza coercizioni', () => {
  const d = freeze(draft());
  for (const edit of [
    db => { db.extra = true; }, db => { db.items[0].answer = 'Campo estraneo.'; },
    db => { delete db.items[0].explanation; }, db => { delete db.items[1].guide; },
    db => { db.items[0].criteria = 'Un criterio.'; }, db => { db.items[0].criteria = [12]; },
    db => { db.items[0].criteria = ['']; }, db => { db.items[0].question = ' '; },
    db => { db.items[0].options[1] = 12; }, db => { db.items[0].options[1] = 'Senza punto'; },
    db => { db.items[0].options.splice(2); }, db => { db.items[1].guide = null; },
    db => { db.items.push(clone(db.items[0])); }
  ]) {
    const db = C.activitiesReviewDb(d); edit(db);
    invalid(() => C.applyActivitiesReview(d, db));
  }
});

test('versione fissa: soltanto domande rilette, guida coerente separata e impronta verificabile', async () => {
  const d = draft(), ids = ['a1', 'a2'];
  const receipts = await Promise.all(ids.map(async activityId => ({ activityId, confirmed: true, persisted: true,
    pending: false, excluded: false, state: 'rivisto', fingerprint: await C.activityFingerprint(d, activityId) })));
  const options = { verificaId: 'v-1', versioneId: 'ed-1', title: 'La promessa', createdAt: '2026-10-08T10:00:00.000Z', print: { mode: 'questions-only' } };
  const promise = C.freezeVersion(d, ids, receipts, options);
  d.activities[0].teacher.answer = 'Mutazione tardiva'; ids.pop(); options.title = 'Tardivo';
  const packet = await promise;
  assert.equal(packet.assigned.title, 'La promessa'); assert.equal(packet.assigned.content.activities.length, 2);
  assert.equal(packet.guide.draft.activities[0].teacher.answer, 'Il giorno dopo.');
  assert.equal(packet.assigned.fingerprint, packet.guide.fingerprint);
  assert.equal(packet.guide.print.mode, 'questions-only');
  assert.ok(!JSON.stringify(packet.assigned).includes('Distinguere la promessa'));
  assert.ok(!JSON.stringify(packet.assigned).includes('teacher'));
  assert.ok(!JSON.stringify(packet.assigned).includes('originalPath'));
  assert.equal(await C.verifyAssigned(packet.assigned), true);
  const changed = clone(packet.assigned); changed.content.activities[0].question += ' Cambiata';
  await assert.rejects(C.verifyAssigned(changed), /assigned.changed/);
  const extra = clone(packet.assigned); extra.teacher = { answer: 'Riservato' };
  assert.throws(() => C.validateAssigned(extra), /assigned/);
  assert.equal(packet.paths.public, 'Materiale Studio/Percorso-lettura-v-1-ed-1.json');
  assert.match(packet.paths.guide, /Sorgenti/);
});

test('versione fissa: niente selezioni vuote, ricevute obsolete, escluse o non persistite', async () => {
  const d = draft(), o = { verificaId: 'v-1', versioneId: 'ed-1', title: 'Verifica', createdAt: '2026-10-08T10:00:00.000Z' };
  const r = { activityId: 'a1', confirmed: true, persisted: true, pending: false, excluded: false,
    state: 'approvato', fingerprint: await C.activityFingerprint(d, 'a1') };
  await assert.rejects(C.freezeVersion(d, [], [], o), /version.empty/);
  for (const delta of [{ excluded: true }, { persisted: false }, { confirmed: false }, { fingerprint: 'vecchio' }]) {
    await assert.rejects(C.freezeVersion(d, ['a1'], [{ ...r, ...delta }], o), /confirmations/);
  }
  await assert.rejects(C.freezeVersion(d, ['a1'], [r], { ...o, versioneId: '../private' }), /version/);
});


test('G2: tre alternative decise dal docente, esclusioni e recupero conservano le decisioni e la revisione letta dal disco', () => {
  const R = require('../public/js/mappai-review-core'), d = draft(), db = C.activitiesReviewDb(d);
  let r = R.createReview({ db, sources: [], report: { checkStatus: 'incomplete', issues: [] }, generationId: 'g2-three' });
  r = R.addIssue(r, { id: 'teacher-options', origin: 'teacher', blocking: true, target: { kind: 'item', id: 'a1', field: 'options' } });
  r = R.setDecision(r, 'teacher-options', 'manual', { text: ['Domani.', 'Oggi.', 'Fra due giorni.'] });
  r = R.setItemExcluded(r, 'a3', true);
  const before = clone(r);
  const begun = C.beginActivitiesApproval(d, r, db, { manualReview: true }, R);
  assert.equal(begun.ok, true);
  const saved = C.applyActivitiesReview(d, begun.db), readback = C.activitiesReviewDb(saved);
  assert.equal(saved.activities[0].options.length, 3);
  assert.deepEqual(saved.activities[0].teacher.distractors.map(o => o.optionId), ['o2', 'o3']);
  assert.deepEqual(saved.activities.map(a => a.id), ['a1', 'a2']);
  assert.deepEqual(begun.review.initial.decisions, before.initial.decisions);
  assert.deepEqual(r, before);
  assert.equal(begun.review.approvedRevision, R.revision(readback, []));
  const retryBeforeWrite = C.beginActivitiesApproval(d, begun.review, db, {}, R);
  assert.equal(retryBeforeWrite.ok, true);
  assert.deepEqual(retryBeforeWrite.db, begun.db);
  const retryAfterWrite = C.beginActivitiesApproval(saved, begun.review, readback, {}, R);
  assert.equal(retryAfterWrite.ok, true);
  const completed = R.completeApproval(retryAfterWrite.review, R.revision(readback, []));
  assert.equal(R.gate(completed, readback, []).allowed, true);
  const stale = clone(begun.review); stale.approvedRevision = 'wrong';
  assert.throws(() => C.beginActivitiesApproval(d, stale, db, {}, R), /snapshot/);
  assert.equal(C.beginActivitiesApproval(d, r, db, {}, R).ok, false, 'Il controllo incompleto richiede ancora conferma manuale');
});


test('G2: recupera solo la formattazione obsoleta rimossa da un vecchio commit interrotto', () => {
  const R = require('../public/js/mappai-review-core'), d = draft();
  d.activities[1].inline = { question: '<b>' + d.activities[1].question + '</b>' };
  const db = C.activitiesReviewDb(d);
  let r = R.createReview({ db, sources: [], report: { checkStatus: 'incomplete', issues: [] }, generationId: 'g2-inline' });
  r = R.addIssue(r, { id: 'teacher-question', origin: 'teacher', blocking: true, target: { kind: 'item', id: 'a2', field: 'question' } });
  r = R.setDecision(r, 'teacher-question', 'manual', { text: 'Consegna riscritta dal docente.' });
  const old = R.beginApproval(r, db, { manualReview: true }), saved = C.applyActivitiesReview(d, old.db), disk = C.activitiesReviewDb(saved);
  assert.notEqual(R.revision(disk, []), old.review.approvedRevision);
  const recovered = C.recoverActivitiesApproval(old.review, disk, R);
  assert.deepEqual(recovered.initial, old.review.initial);
  assert.equal(recovered.readingProjectionRecovery.previousApprovedRevision, old.review.approvedRevision);
  assert.equal(C.beginActivitiesApproval(saved, recovered, disk, {}, R).ok, true);
  assert.equal(R.gate(R.completeApproval(recovered, R.revision(disk, [])), disk, []).allowed, true);
  const unrelated = clone(disk); unrelated.items[0].question = 'Altra modifica non decisa';
  assert.throws(() => C.recoverActivitiesApproval(old.review, unrelated, R), /snapshot/);
  assert.equal(old.review.approvedSnapshot.items.find(i => i.id === 'a2').reading.inline.question, d.activities[1].inline.question);
});
