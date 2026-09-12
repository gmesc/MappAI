const { test } = require('node:test');
const assert = require('node:assert/strict');
const D = require('../public/js/mappai-material-drafts');
const MR = require('../public/js/mappai-material-review');
const { load } = require('cheerio');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function renderer() {
  const window = { t: (_, fallback) => fallback, MappAIDocEdit: require('../public/js/mappai-docedit-core') };
  const sandbox = { window, appState: { db: { nodes: [], links: [] } }, console: { log() {}, warn() {}, error() {} } };
  vm.createContext(sandbox);
  for (const file of ['mappai-causal-chains.js', 'mappai-branch-synthesis.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../public/js/', file), 'utf8'), sandbox);
  }
  window.MappAICausal.triplesFor = () => { throw new Error('A renderer must not regenerate reviewed triples'); };
  return window.MappAISynthesis.buildHtml;
}
test('review corrections reach the same MC key, flash answer, rubric and synthesis that exporters consume', () => {
  const drafts = { B: {
    mc: { id: 'm', type: 'mc', items: [{ q: 'Chi riceve valuta?', options: ['Svizzera', 'Germania'], correct: 'Svizzera' }] },
    fc: { id: 'f', type: 'flashcards', items: [{ front: 'Che cosa compra la BNS?', back: 'Armi' }] },
    oq: { id: 'o', type: 'open', items: [{ question: 'Chi?', guide: 'Cita Guisan.', lines: 'male' }] }
  }, D: { data: { whole: true, intro: 'Il governo elegge Guisan', sections: [{ rawText: 'Testo', branchLabel: 'Politica' }] } } };
  const items = D.flatten(drafts);
  items.find(it => it.id === 'm-0').correctIndex = 1;
  items.find(it => it.id === 'f-0').answer = 'Oro';
  items.find(it => it.id === 'synthesis-intro').text = 'L’Assemblea elegge Guisan';
  assert.deepEqual(items.find(it => it.id === 'o-0').criteria, ['Cita Guisan.']);
  const changed = D.apply(drafts, items);
  assert.equal(changed.B.mc.items[0].correct, 'Germania');
  assert.equal(changed.B.fc.items[0].back, 'Oro');
  assert.equal(changed.B.oq.items[0].lines, 4);
  assert.equal(changed.D.data.intro, 'L’Assemblea elegge Guisan');
  assert.equal(drafts.B.mc.items[0].correct, 'Svizzera');
});
test('excluding a reviewed item removes its output without replacing it with a new question', () => {
  const drafts = { B: { mc: { id: 'm', type: 'mc', items: [{ q: 'A', options: ['A', 'B'], correct: 'A' }] } },
    E: { chains: { total: 1, rootItems: [{ cause: 'A', effect: 'B', conn: 'causa' }], cross: [], branches: [] } } };
  const out = D.apply(drafts, []);
  assert.equal(out.B.mc.items.length, 0);
  assert.equal(out.E.chains.total, 0);
});

test('synthesis causal boxes are reviewed individually with distinct D scope and use the actual printed connector', () => {
  const source = { id: 'src-gold', idx: 1, title: 'Manuale', source: 'pagina 5', text: 'La Germania ricevette valuta.', verbatim: true };
  const drafts = { D: { data: { branchLabel: 'Economia', mapName: 'Svizzera', rawText: 'La BNS ricevette valuta.', sourcesArr: [source], causalTriples: [
    { cause: 'La BNS vende armi', effect: 'La Svizzera riceve valuta', conn: 'perché', connShow: 'provoca', family: 'trasformazione', origin: 'desc', sourceId: 'economia' },
    { type: 'contrast', a: 'Accoglienza', b: 'Respingimenti', conn: 'ma', connShow: 'NON STAMPATO', family: 'opposizione' },
    { cause: 'NESSO DA ESCLUDERE', effect: 'Effetto', conn: 'causa' }
  ] } }, E: { chains: { rootItems: [{ cause: 'Altra causa', effect: 'Altro effetto', conn: 'causa' }] } } };
  let items = D.flatten(drafts);
  const triples = items.filter(it => it.step === 'D' && it.kind === 'causal');
  assert.equal(triples.length, 3);
  assert.equal(new Set(items.map(it => it.id)).size, items.length, 'no collisions with standalone E chains');
  assert.deepEqual(triples.map(it => it.part), ['whole', 'whole', 'whole']);
  assert.equal(triples[0].text, 'provoca');
  assert.equal(triples[1].text, 'ma');
  assert.equal(triples[0].sourceId, 'economia');
  items.find(it => it.id === 'synthesis-whole').text = 'La Germania ricevette valuta. [1]';
  Object.assign(triples[0], { question: 'La BNS acquista oro', text: 'fornisce', answer: 'Valuta alla Germania' });
  items = items.filter(it => it.id !== triples[2].id);
  const out = D.apply(drafts, items), data = out.D.data;
  assert.equal(data.causalTriples.length, 2);
  assert.equal(data.causalTriples[0].cause, 'La BNS acquista oro');
  assert.equal(data.causalTriples[0].connShow, 'fornisce');
  assert.equal(data.causalTriples[0].effect, 'Valuta alla Germania');
  assert.equal(data.causalTriples[0].origin, 'desc');
  assert.deepEqual(data.sourcesArr, [source], 'approved prose does not rewrite the original source');
  const $ = load(renderer()(data)), body = $('.bs-body').text();
  assert.ok(body.includes('La BNS acquista oro') && body.includes('Valuta alla Germania'));
  assert.ok(!body.includes('La BNS vende armi') && !body.includes('NESSO DA ESCLUDERE'));
  assert.equal($('.bs-citations blockquote').text(), source.text);
  assert.equal(drafts.D.data.causalTriples.length, 3, 'the source draft is not mutated');
});

test('whole synthesis corrections and exclusions invalidate stale HTML blocks without reinserting old quotations or triples', () => {
  const sources = [{ id: 'src-original', idx: 1, title: 'Fonte originale', source: 'pagina 5', text: 'ESTRATTO ORIGINALE CONSERVATO', verbatim: true }];
  const drafts = { D: { data: { whole: true, intro: 'Introduzione', branchLabel: 'Svizzera', mapName: 'Svizzera',
    editedBlocks: [{ tag: 'raw', html: '<p>VECCHIO FRAMMENTO HTML</p><blockquote>VECCHIA CITAZIONE GENERATA</blockquote>' }],
    sections: [
      { branchLabel: 'Ramo escluso', rawText: 'RAMO DA ESCLUDERE', sourcesArr: [], causalTriples: [{ cause: 'CAUSA DEL RAMO ESCLUSO', conn: 'causa', effect: 'Effetto' }] },
      { branchLabel: 'Economia', rawText: 'Testo [1]', sourcesArr: sources, causalTriples: [{ cause: 'CAUSA VECCHIA', conn: 'causa', effect: 'Effetto corretto' }] }
    ] } } };
  const build = renderer();
  assert.ok(load(build(drafts.D.data))('.bs-body').text().includes('VECCHIA CITAZIONE GENERATA'), 'fixture reproduces renderer precedence');
  const items = D.flatten(drafts).filter(it => it.id !== 'synthesis-0');
  const repaired = items.find(it => it.id === 'synthesis-causal-1-0');
  assert.equal(repaired.part, 1);
  repaired.question = 'CAUSA CORRETTA';
  const out = D.apply(drafts, items), data = out.D.data;
  assert.equal(data.sections.length, 1, 'excluding a section also removes its causal box');
  assert.equal(data.editedBlocks, undefined);
  assert.deepEqual(data.sections[0].sourcesArr, sources);
  const $ = load(build(data)), body = $('.bs-body').text();
  assert.ok(body.includes('CAUSA CORRETTA') && body.includes('ESTRATTO ORIGINALE CONSERVATO'));
  assert.ok(!/VECCHIO|VECCHIA|CAUSA VECCHIA|RAMO ESCLUSO/.test(body));
  assert.equal($('.bs-citations blockquote').text(), sources[0].text);
});

test('an unchanged review preserves formatted HTML and source quotations', () => {
  const drafts = { D: { data: { rawText: 'Testo invariato.', sourcesArr: [],
    editedBlocks: [{ tag: 'p', html: '<em>Testo invariato.</em>' }],
    causalTriples: [{ cause: 'Causa', conn: 'provoca', effect: 'Effetto' }] } } };
  const out = D.apply(drafts, D.flatten(drafts));
  assert.deepEqual(out.D.data.editedBlocks, drafts.D.data.editedBlocks);
});

test('a missing numbered citation is a manual-only text issue; neither the reference nor registry is silently changed', () => {
  const drafts = { D: { data: { rawText: 'La Germania ricevette valuta [2]. Poi [2] ricompare.',
    sourcesArr: [{ id: 'src-oro', idx: 1, title: 'Manuale', page: 5, text: 'La Germania ricevette valuta.', verbatim: true }] } } };
  const items = D.flatten(drafts), before = JSON.stringify(items), report = MR.validate(items);
  assert.equal(report.ok, false);
  assert.equal(report.issues.length, 1);
  assert.equal(report.issues[0].target.id, 'synthesis-whole');
  assert.equal(report.issues[0].target.field, 'text');
  assert.equal(report.issues[0].hasProposal, false);
  assert.equal(report.issues[0].after, null);
  assert.equal(report.issues[0].blocking, true);
  assert.ok(report.issues[0].problem.includes('[2]'));
  assert.equal(JSON.stringify(items), before, 'checking is read-only');
  assert.equal(MR.validate([{ id: 'legacy', kind: 'synthesis', text: 'Testo [2].' }]).ok, true, 'legacy items without an explicit registry keep their old contract');
});

test('each synthesis section owns its citation numbers and original metadata through flatten, apply and rendering', () => {
  const sourceA = { id: 'src-a', idx: 1, docId: 'doc-a', title: 'Fonte A', page: 2, source: 'pagina 2', text: 'Primo\n\npassaggio originale.', verbatim: true, verifiedAgainst: 'archived-source-text' };
  const sourceB = { id: 'src-b', idx: 1, docId: 'doc-b', title: 'Fonte B', page: 5, source: 'pagina 5', text: 'Secondo passaggio originale.', verbatim: true, verifiedAgainst: 'archived-source-text' };
  const drafts = { D: { data: { whole: true, intro: 'Panoramica senza richiami.', sections: [
    { branchLabel: 'Area A', rawText: 'Fatto del primo ramo [1].', sourcesArr: [sourceA] },
    { branchLabel: 'Area B', rawText: 'Fatto del secondo ramo [1].', sourcesArr: [sourceB] }
  ] } } };
  const items = D.flatten(drafts), intro = items.find(it => it.part === 'intro'), sections = items.filter(it => typeof it.part === 'number');
  assert.deepEqual(intro.citations, []);
  assert.deepEqual(sections[0].citations, [sourceA]);
  assert.deepEqual(sections[1].citations, [sourceB]);
  assert.notEqual(sections[0].citations, drafts.D.data.sections[0].sourcesArr, 'a review snapshot must not share a mutable registry');
  assert.equal(MR.validate(items).ok, true, 'the same [1] legitimately means different sources in different sections');
  const out = D.apply(drafts, items);
  assert.deepEqual(out.D.data.sections[0].sourcesArr, [sourceA]);
  assert.deepEqual(out.D.data.sections[1].sourcesArr, [sourceB]);
  const $ = load(renderer()(out.D.data));
  assert.deepEqual($('.bs-citations blockquote').map((_, el) => $(el).text()).get(), [sourceA.text, sourceB.text]);
  assert.deepEqual($('.bs-cite-num').map((_, el) => $(el).text()).get(), ['[1]', '[1]']);
  intro.text += ' Un richiamo introdotto [1].';
  const report = MR.validate(items);
  assert.equal(report.ok, false);
  assert.equal(report.issues[0].target.id, 'synthesis-intro', 'overview cannot borrow a branch citation');
});
