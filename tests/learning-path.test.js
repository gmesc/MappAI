const { test } = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('cheerio');
const P = require('../public/js/mappai-learning-path.js');
const R = require('../public/js/mappai-review-core.js');

function approve(db, sources) {
  const review = R.createReview({ db, sources, checkStatus: 'completed' });
  const started = R.beginApproval(review, db);
  return R.completeApproval(started.review, started.revision);
}
function fixture() {
  const sources = [{ id: 'manuale', title: 'Manuale', pages: [{ n: 5, text: 'La BNS acquistò oro.\n\nLa Germania ricevette valuta.' }] }];
  const items = [
    { id: 'mc-1', kind: 'mc', draftKey: 'quiz-1', question: 'Chi ricevette valuta?', options: ['La Germania.', 'La BNS.'], correctIndex: 0,
      explanation: 'La BNS acquistò oro dalla Germania fornendole valuta.', evidenza: 'La BNS acquistò oro. La Germania ricevette valuta.' },
    { id: 'open-1', kind: 'open', question: 'Chi fu eletto generale?', areas: ['Difesa'], guide: 'Guida docente: Cita Guisan.', criteria: ['Cita Guisan.'] },
    { id: 'flash-1', kind: 'flashcard', question: 'Che cosa acquistò la BNS?', answer: 'Oro.', areas: ['Economia'], evidenza: 'Una citazione inventata.' },
    { id: 'text-1', kind: 'synthesis', text: 'Una sintesi approvata.' }
  ];
  const db = { nodes: [{ id: 'root', label: 'Svizzera', desc: 'Fatti approvati.' }], links: [],
    studySets: [{ id: 'quiz-1', title: 'Economia', items: [{ id: 'mc-1', question: 'VECCHIA DOMANDA NON APPROVATA' }, { id: 'old', question: 'Vecchio esercizio' }] }] };
  const review = approve(db, sources);
  review.final = { stage: 'done', items, review: approve({ items }, sources) };
  return { db, review };
}
function path(f, options = {}) {
  return P.createPath(f.db, f.review, { id: 'test-path', objective: 'Riconoscere i soggetti degli scambi.', ids: ['mc-1', 'open-1'], max: 2, ...options });
}

test('percorso: seleziona solo esercizi finali approvati, mai set vecchi o testi non attività', () => {
  const f = fixture(), available = P.approvedItems(f.db, f.review);
  assert.deepEqual(available.map(it => it.id), ['mc-1', 'open-1', 'flash-1']);
  assert.equal(available[0].question, 'Chi ricevette valuta?');
  assert.deepEqual(available[0].areas, ['Economia']);
  for (const stage of ['pending', 'reviewing', 'finalizing']) {
    f.review.final.stage = stage;
    assert.deepEqual(P.approvedItems(f.db, f.review), []);
  }
  f.review.final.stage = 'approved';
  assert.equal(P.approvedItems(f.db, f.review).length, 3);
});

test('percorso: modifiche semantiche a mappa o item invalidano la selezione', () => {
  const f = fixture();
  f.db.nodes[0].desc = 'Un nuovo fatto da approvare.';
  assert.deepEqual(P.approvedItems(f.db, f.review), []);
  const g = fixture();
  g.review.final.items[0].correctIndex = 1;
  assert.deepEqual(P.approvedItems(g.db, g.review), []);
});

test('percorso: gli aiuti originali vengono verificati; una guida docente non diventa aiuto', () => {
  const f = fixture(), items = P.approvedItems(f.db, f.review);
  assert.equal(items[0].help.origin, 'source');
  assert.equal(items[0].help.text, 'La BNS acquistò oro.\n\nLa Germania ricevette valuta.');
  assert.equal(items[0].help.page, 5);
  assert.equal(items[1].help.text, '');
  assert.equal(items[2].help.text, '', 'una falsa citazione non diventa fonte');
  const edited = path(f, { helps: { 'mc-1': 'Cerca il soggetto che riceve valuta.' } });
  assert.deepEqual(edited.items[0].help, { origin: 'teacher', text: 'Cerca il soggetto che riceve valuta.' });
});

test('percorso: richiede obiettivo, selezione esistente e numero entro il limite', () => {
  const f = fixture();
  assert.throws(() => path(f, { objective: '' }));
  assert.throws(() => path(f, { ids: ['old'] }));
  assert.throws(() => path(f, { ids: [] }));
  assert.throws(() => path(f, { max: 1 }));
  assert.equal(path(f, { ids: ['mc-1', 'mc-1'] }).items.length, 1);
});

test('percorso: modalità diverse preservano lo stesso obiettivo, item e chiavi', () => {
  const f = fixture();
  for (const mode of ['supported', 'independent', 'deeper']) {
    const selected = path(f, { mode });
    const $ = load(P.buildHtml(selected));
    assert.equal(selected.objective, 'Riconoscere i soggetti degli scambi.');
    assert.equal(selected.items[0].correctIndex, 0);
    assert.equal($('main .activity').length, 2);
    assert.equal($('.activity input[type=radio]').length, 2);
    assert.equal($('.activity textarea').length, mode === 'deeper' ? 4 : 2);
    assert.equal($('.activity .hint').length, 1);
    assert.ok(!$('.activity').text().includes('Guida docente'));
    assert.ok($('.feedback').text().includes('Cita Guisan.'));
    $('textarea').each((_, el) => assert.equal($('label[for="' + $(el).attr('id') + '"]').length, 1));
    assert.equal($('#sp-large').attr('aria-pressed'), 'false');
    assert.equal($('script[src],link[href^="http"]').length, 0, 'il documento funziona offline');
    assert.equal($('meta[name=mappai-source-revision]').attr('content'), f.review.approvedRevision);
  }
});

test('percorso: HTML e metadati non permettono iniezioni da obiettivo, item o aiuto', () => {
  const f = fixture(), p = path(f, { objective: '</script><script>alert(1)</script>', helps: { 'mc-1': '<img src=x onerror=alert(2)>' }, language: 'en' });
  const html = P.buildHtml(p), $ = load(html);
  assert.equal($('img').length, 0);
  assert.equal($('script').length, 2);
  assert.equal($('html').attr('lang'), 'en');
  assert.equal($('#sp-print').text(), 'Print');
  assert.deepEqual(JSON.parse($('#mappai-learning-path').text()), p);
});

test('percorso: salva HTML nel progetto e nell’archivio, conservando revisione e contenuti approvati', async () => {
  const f = fixture(), p = path(f), writes = [], archives = [];
  p.items[0].question = 'Non deve sostituire la domanda approvata.';
  const result = await P.save(p, { ...f, vaultPath: '/progetto', api: { saveVaultFile: async data => { writes.push(data); return { ok: true }; } },
    docs: { save: data => { archives.push(data); return 'doc-1'; } } });
  assert.equal(result.archived, true);
  assert.equal(writes.length, 1);
  assert.equal(writes[0].relPath, 'Materiale Studio/Percorso-test-path.html');
  assert.equal(archives[0].kind, 'dossier');
  assert.equal(result.path.items[0].question, 'Chi ricevette valuta?');
  assert.ok(writes[0].text.includes(f.review.approvedRevision));
});

test('percorso: nessuna scrittura se non approvato, e nessuna falsa conferma se il salvataggio fallisce', async () => {
  const f = fixture(), p = path(f); let writes = 0, archives = 0;
  const c = { ...f, vaultPath: '/progetto', api: { saveVaultFile: async () => { writes++; return { ok: false, error: 'disco pieno' }; } }, docs: { save: () => archives++ } };
  await assert.rejects(P.save(p, c), /disco pieno/);
  assert.equal(archives, 0);
  f.review.final.stage = 'awaiting_review';
  await assert.rejects(P.save(p, c));
  assert.equal(writes, 1);
});

test('percorso: un errore della cache non nasconde il file già scritto nella cartella', async () => {
  const f = fixture();
  const result = await P.save(path(f), { ...f, vaultPath: '/progetto', api: { saveVaultFile: async () => ({ ok: true }) }, docs: { save: () => { throw new Error('quota'); } } });
  assert.equal(result.ok, true);
  assert.equal(result.archived, false);
});
