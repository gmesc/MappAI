const { test } = require('node:test');
const assert = require('node:assert');
const EC = require('../public/js/mappai-enrich-core.js');

// Corpus-fonte realistico (>30 parole-contenuto uniche, >200 char) con frasi distinte.
const CORPUS = [
  'La clorofilla cattura la luce solare nei cloroplasti delle foglie verdi.',
  'Durante la fotosintesi le piante trasformano anidride carbonica e acqua in glucosio.',
  'Il glucosio prodotto fornisce energia chimica immagazzinata dalla pianta.',
  'Le radici assorbono acqua e sali minerali dal terreno umido.',
  'Gli stomi delle foglie regolano lo scambio dei gas con l’atmosfera esterna.',
  'La respirazione cellulare libera l’energia contenuta nel glucosio durante la notte.'
].join('\n');

const norm = s => s.replace(/\s+/g, ' ').trim();

function state(nodes) {
  return { sources: [{ content: CORPUS }], db: { nodes, links: [], sourcesDict: {} } };
}

test('analyzeTextSignals: metriche + segnali azionabili', () => {
  const t = EC.analyzeTextSignals(CORPUS);
  assert.ok(t.words > 40, 'conta le parole');
  assert.ok(t.sentences >= 5, 'conta le frasi');
  assert.ok(t.connectives.esemplificativa.count === 0, 'nessun esempio nel corpus di test');
  // ogni segnale ha osservazione + suggerimento (mai numero nudo)
  assert.ok(t.signals.length > 0, 'produce segnali');
  for (const s of t.signals) {
    assert.ok(s.observation && s.suggestion, 'ogni segnale ha osservazione + azione (FR-005)');
  }
  // "nessun esempio" deve comparire come nudge
  assert.ok(t.signals.some(s => s.key === 'examples_none'));
});

test('analyzeTextSignals: ridondanza = frasi ripetute, trattata come possibile salienza', () => {
  const t = EC.analyzeTextSignals(CORPUS + '\n' + 'La clorofilla cattura la luce solare nei cloroplasti delle foglie verdi.');
  assert.ok(t.redundancy >= 1, 'rileva la frase ripetuta');
  const sig = t.signals.find(s => s.key === 'redundancy');
  assert.ok(sig && /salienza/i.test(sig.suggestion), 'framing: salienza, non rumore');
});

test('analyzeCoverage: nodo povero -> card con residuo VERBATIM dalla fonte', () => {
  const nodes = [
    { id: 'ROOT', level: 0, label: 'Fotosintesi', desc: '' },
    { id: 'N1', level: 1, label: 'Clorofilla', desc: 'La clorofilla e un pigmento.' } // desc corta = povero
  ];
  const cov = EC.analyzeCoverage(nodes, CORPUS);
  assert.ok(cov.hasSource, 'corpus abbastanza grande per la metrica');
  const card = cov.cards.find(c => c.nodeId === 'N1');
  assert.ok(card, 'produce una card per il nodo povero');
  assert.ok(card.residue.length > 0, 'la card ha frasi-residuo');
  // ANTI-FABBRICAZIONE: ogni frase-residuo e substring VERBATIM del corpus
  const flat = norm(CORPUS);
  for (const r of card.residue) {
    assert.ok(flat.includes(norm(r.text)), 'residuo verbatim dalla fonte: ' + r.text);
    assert.ok(r.newWords >= 3, 'porta parole nuove');
  }
});

test('analyzeCoverage: nessuna fonte utile -> nessuna card (mai fabbricata)', () => {
  const nodes = [{ id: 'N1', level: 1, label: 'X', desc: 'breve' }];
  const cov = EC.analyzeCoverage(nodes, 'poco testo');
  assert.strictEqual(cov.hasSource, false);
  assert.strictEqual(cov.cards.length, 0);
});

test('analyzeEnrichment: composizione + structural=[] in Node (delegato al analyzer)', () => {
  const nodes = [
    { id: 'ROOT', level: 0, label: 'Fotosintesi', desc: '' },
    { id: 'N1', level: 1, label: 'Clorofilla', desc: 'La clorofilla e un pigmento.' }
  ];
  const r = EC.analyzeEnrichment(state(nodes));
  assert.ok(r.corpus.hasSource, 'corpus dallo stato');
  assert.ok(r.text && r.coverage && Array.isArray(r.structural), 'tre sezioni');
  assert.strictEqual(r.structural.length, 0, 'structural delegato: vuoto in Node');
  assert.ok(r.coverage.cards.length > 0, 'card di copertura presenti');
});

test('analyzeEnrichment: extraCorpus (aggiungi testo/PDF) chiude gap con citazioni dal materiale aggiunto', () => {
  const nodes = [
    { id: 'ROOT', level: 0, label: 'Fotosintesi', desc: '' },
    { id: 'N2', level: 1, label: 'Traspirazione', desc: 'La traspirazione riguarda le foglie.' }
  ];
  // senza extra: nessuna frase-fonte parla di traspirazione con lessico nuovo
  const before = EC.analyzeEnrichment(state(nodes));
  const cardBefore = before.coverage.cards.find(c => c.nodeId === 'N2');
  // il docente aggiunge un testo/PDF sul tema
  const extra = 'La traspirazione fogliare disperde vapore acqueo attraverso gli stomi e raffredda la pianta nelle giornate calde.';
  const after = EC.analyzeEnrichment(state(nodes), { extraCorpus: extra });
  const cardAfter = after.coverage.cards.find(c => c.nodeId === 'N2');
  assert.ok(cardAfter, 'dopo l’aggiunta compare una card per il nodo');
  const flat = norm(CORPUS + '\n' + extra);
  for (const r of cardAfter.residue) {
    assert.ok(flat.includes(norm(r.text)), 'la citazione viene dal corpus (fonte + materiale aggiunto), verbatim');
  }
  assert.ok(after.corpus.extraAdded, 'flag extraAdded');
  // la nuova card deve attingere dal materiale aggiunto (parola "vapore"/"stomi"/"raffredda")
  const joined = cardAfter.residue.map(r => r.text).join(' ');
  assert.ok(/traspirazione|vapore|stomi|raffredda/i.test(joined), 'cita il materiale aggiunto');
});

test('analyzeCoverage: fonte spessa di char ma povera di lessico (<30 parole uniche) -> hasSource false E zero card (coerente, review 21/7)', () => {
  const thin = ('acqua sole foglia ').repeat(20).trim(); // >200 char, solo 3 parole-contenuto uniche
  const nodes = [{ id: 'N1', level: 1, label: 'Acqua', desc: 'breve' }];
  const cov = EC.analyzeCoverage(nodes, thin);
  assert.strictEqual(cov.hasSource, false, 'corpus troppo magro per misurare l’ancoraggio');
  assert.strictEqual(cov.cards.length, 0, 'niente card word-count-only su corpus non misurabile');
});

test('DEFAULTS esposti e sensati', () => {
  assert.ok(EC.DEFAULTS.poorGroundedness > 0 && EC.DEFAULTS.poorGroundedness < 1);
  assert.ok(EC.DEFAULTS.maxCards > 0);
});
