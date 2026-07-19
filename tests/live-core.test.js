'use strict';
/*
 * live-core.test.js — logica pura MappAI Live, headless (node --test)
 * Copre: credenziali, publicQuestions (strip soluzioni), tf/mc, buildL1Resolver,
 * gradeAnswer (tutti i tipi + blank/skip/manual), computeResults (heatmap +
 * schede, esclusione topic per domande senza nodeId, soglie forti/deboli).
 */
const { test } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const LC = require(path.join(__dirname, '..', 'public', 'js', 'mappai-live-core.js'));

// ── Credenziali ──────────────────────────────────────────────────────────
test('buildCredentials: coppie uniche, numero 00..NUM_MAX, ordine randomizzato', () => {
  const c = LC.buildCredentials(15);
  assert.strictEqual(c.length, 15);
  // unicità coppie (emoji, numero)
  const keys = c.map(x => x.emojiKey + '-' + x.num);
  assert.strictEqual(new Set(keys).size, keys.length);
  // ogni coppia valida: numero 00..NUM_MAX (2 cifre), emojiKey nel set
  const validKeys = new Set(LC.EMOJI_SET.map(e => e.key));
  c.forEach(x => {
    assert.strictEqual(x.num.length, 2);
    const nn = Number(x.num);
    assert.ok(nn >= 0 && nn <= LC.NUM_MAX);
    assert.ok(validKeys.has(x.emojiKey));
    assert.ok(x.emoji);
  });
});

test('buildCredentials: rng deterministico → riproducibile e NON sequenziale', () => {
  const seeded = (seed) => { let s = seed >>> 0; return () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; }; };
  const a = LC.buildCredentials(20, seeded(42)).map(x => x.emojiKey + '-' + x.num);
  const b = LC.buildCredentials(20, seeded(42)).map(x => x.emojiKey + '-' + x.num);
  assert.deepStrictEqual(a, b); // stesso seed → stesso risultato
  // randomizzato: NON è il vecchio schema sequenziale (primi 12 tutti num 00)
  const allFirst12Zero = LC.buildCredentials(20, seeded(42)).slice(0, 12).every(x => x.num === '00');
  assert.ok(!allFirst12Zero);
});

test('buildCredentials: 132 = pool completo (tutte le coppie, nessuna mancante)', () => {
  const c = LC.buildCredentials(132);
  const pairs = new Set(c.map(x => x.emojiKey + '-' + x.num));
  assert.strictEqual(pairs.size, 132);
});

test('buildCredentials: clamp a MAX_IDENTITIES (132)', () => {
  const c = LC.buildCredentials(500);
  assert.strictEqual(c.length, LC.MAX_IDENTITIES);
  assert.strictEqual(c.length, 132);
});

test('buildCredentials: 0 / negativi → vuoto', () => {
  assert.strictEqual(LC.buildCredentials(0).length, 0);
  assert.strictEqual(LC.buildCredentials(-3).length, 0);
});

test('identityKey: stabile, num a 2 cifre', () => {
  assert.strictEqual(LC.identityKey('volpe', '7'), 'volpe-07');
  assert.strictEqual(LC.identityKey('volpe', '07'), 'volpe-07');
  assert.strictEqual(LC.identityKey('volpe', 3), 'volpe-03');
});

test('normalizeClassName: accenti/spazi/case equivalenti', () => {
  assert.strictEqual(LC.normalizeClassName('2ª A'), LC.normalizeClassName('2a a'));
  assert.strictEqual(LC.normalizeClassName('  Terza  B  '), 'terza b');
});

test('displayName: nome se presente, altrimenti emoji+numero', () => {
  assert.strictEqual(LC.displayName({ emojiKey: 'volpe', num: '07', name: 'Sara' }), 'Sara');
  assert.strictEqual(LC.displayName({ emojiKey: 'volpe', num: '07', name: '' }), '🦊 07');
  assert.strictEqual(LC.displayName({ emojiKey: 'volpe', num: '3' }), '🦊 03');
});

// ── Validazione + publicQuestions ─────────────────────────────────────────
function mcQ(over) {
  return Object.assign({
    kind: 'mc', text: 'Capitale d\'Italia?', options: ['Roma', 'Milano', 'Napoli'],
    correct: 0, nodeId: 'n1', nodeLabel: 'Italia', l1Id: 'L1', l1Label: 'Geografia', source: 'map'
  }, over || {});
}

test('validateQuestion: mc valido / correct fuori range', () => {
  assert.ok(LC.validateQuestion(mcQ()).ok);
  assert.ok(!LC.validateQuestion(mcQ({ correct: 9 })).ok);
  assert.ok(!LC.validateQuestion(mcQ({ options: ['solo-una'] })).ok);
});

test('validateQuestion: tf richiede statementTrue boolean', () => {
  assert.ok(LC.validateQuestion({ kind: 'tf', text: 'Il Sole è una stella', statementTrue: true }).ok);
  assert.ok(!LC.validateQuestion({ kind: 'tf', text: 'x', statementTrue: 'yes' }).ok);
});

test('validateQuestion: cloze richiede almeno un blank', () => {
  assert.ok(LC.validateQuestion({ kind: 'cloze', segments: [{ text: 'La ' }, { blank: 'clorofilla' }] }).ok);
  assert.ok(!LC.validateQuestion({ kind: 'cloze', segments: [{ text: 'niente blank' }] }).ok);
});

test('publicQuestions: strippa correct (mc), termine blank (cloze), answerText (open)', () => {
  const full = [
    mcQ(),
    { kind: 'cloze', text: '', segments: [{ text: 'La ' }, { blank: 'clorofilla' }, { text: ' cattura la luce' }], nodeLabel: 'Foto' },
    { kind: 'open', text: 'Spiega la fotosintesi', answerText: 'processo che converte luce in energia', nodeLabel: 'Foto' },
    { kind: 'tf', text: 'Il Sole è una stella', proposed: 'vero', statementTrue: true }
  ];
  const pub = LC.publicQuestions(full);
  assert.strictEqual(pub[0].correct, undefined);
  assert.deepStrictEqual(pub[0].options, ['Roma', 'Milano', 'Napoli']);
  // cloze: blank diventa solo lunghezza, nessun termine
  const blankSeg = pub[1].segments.find(s => s.blank);
  assert.strictEqual(blankSeg.blank.len, 'clorofilla'.length);
  assert.strictEqual(blankSeg.blank.term, undefined);
  // open: niente answerText
  assert.strictEqual(pub[2].answerText, undefined);
  // tf: proposed resta ma statementTrue sparisce
  assert.strictEqual(pub[3].proposed, 'vero');
  assert.strictEqual(pub[3].statementTrue, undefined);
});

// ── mcFromItem / tfFromMc ─────────────────────────────────────────────────
test('mcFromItem: item generatore (correct 1-based) → mc 0-based', () => {
  const q = LC.mcFromItem({ stem: 'La Bergier indagò', a1: 'imparziale', a2: 'processo', a3: 'confini', correct: 1 });
  assert.strictEqual(q.kind, 'mc');
  assert.strictEqual(q.correct, 0); // 1-based 1 → 0-based 0
  assert.strictEqual(q.options.length, 3);
});

test('tfFromMc: pick<0.5 → statement vero; pick>=0.5 → distrattore falso', () => {
  const mc = mcQ();
  const tVero = LC.tfFromMc(mc, 0.1);
  assert.strictEqual(tVero.statementTrue, true);
  assert.strictEqual(tVero.proposed, 'Roma');
  const tFalso = LC.tfFromMc(mc, 0.9);
  assert.strictEqual(tFalso.statementTrue, false);
  assert.notStrictEqual(tFalso.proposed, 'Roma');
});

// ── buildL1Resolver ───────────────────────────────────────────────────────
test('buildL1Resolver: nodo profondo → L1; orfano → null; cross-link ignorati', () => {
  const nodes = [
    { id: 'root', level: 0 }, { id: 'A', level: 1, label: 'Ramo A' },
    { id: 'B', level: 2 }, { id: 'C', level: 3 }, { id: 'orfano', level: 2 }
  ];
  const links = [
    { source: 'root', target: 'A' }, { source: 'A', target: 'B' },
    { source: 'B', target: 'C' }, { source: 'C', target: 'orfano', isCross: true }
  ];
  const l1 = LC.buildL1Resolver(nodes, links);
  assert.deepStrictEqual(l1('C'), { id: 'A', label: 'Ramo A' });
  assert.deepStrictEqual(l1('A'), { id: 'A', label: 'Ramo A' });
  assert.strictEqual(l1('root'), null);
  // orfano ha solo un cross-link entrante (ignorato) → nessun genitore gerarchico
  assert.strictEqual(l1('orfano'), null);
});

// ── gradeAnswer ───────────────────────────────────────────────────────────
test('gradeAnswer tf/mc: giusto/sbagliato/blank/skip', () => {
  const tf = { kind: 'tf', statementTrue: true };
  assert.strictEqual(LC.gradeAnswer(tf, { choice: true }).outcome, 'right');
  assert.strictEqual(LC.gradeAnswer(tf, { choice: false }).outcome, 'wrong');
  assert.strictEqual(LC.gradeAnswer(tf, { skipped: true }).outcome, 'blank');
  assert.strictEqual(LC.gradeAnswer(tf, null).outcome, 'blank');

  const mc = mcQ();
  assert.strictEqual(LC.gradeAnswer(mc, { choice: 0 }).outcome, 'right');
  assert.strictEqual(LC.gradeAnswer(mc, { choice: 2 }).outcome, 'wrong');
});

test('gradeAnswer cloze: credito parziale, right solo se tutti', () => {
  const q = { kind: 'cloze', segments: [{ blank: 'clorofilla' }, { blank: 'luce' }] };
  assert.strictEqual(LC.gradeAnswer(q, { blanks: ['clorofilla', 'luce'] }).outcome, 'right');
  const part = LC.gradeAnswer(q, { blanks: ['clorofilla', 'sbagliato'] });
  assert.strictEqual(part.outcome, 'wrong');
  assert.strictEqual(part.score, 0.5);
  assert.strictEqual(LC.gradeAnswer(q, { blanks: ['', ''] }).outcome, 'blank');
});

test('gradeAnswer cloze: tollera refuso/accento (BES/DSA)', () => {
  const q = { kind: 'cloze', segments: [{ blank: 'clorofilla' }] };
  assert.strictEqual(LC.gradeAnswer(q, { blanks: ['Clorofila'] }).outcome, 'right'); // refuso 1
});

test('gradeAnswer open: con answerText fuzzy; senza → manual', () => {
  const withAns = { kind: 'open', answerText: 'Roma' };
  assert.strictEqual(LC.gradeAnswer(withAns, { text: 'roma' }).outcome, 'right');
  assert.strictEqual(LC.gradeAnswer(withAns, { text: 'Milano' }).outcome, 'wrong');
  assert.strictEqual(LC.gradeAnswer(withAns, { text: '' }).outcome, 'blank');
  const noAns = { kind: 'open', answerText: null };
  const m = LC.gradeAnswer(noAns, { text: 'una risposta lunga' });
  assert.strictEqual(m.outcome, 'manual');
  assert.strictEqual(m.score, null);
});

// ── rateFromMs ────────────────────────────────────────────────────────────
test('rateFromMs: item/min, cap 30, null se <=0', () => {
  assert.strictEqual(LC.rateFromMs(6000), 10);   // 6s → 10/min
  assert.strictEqual(LC.rateFromMs(500), 30);    // 0.5s → capped 30
  assert.strictEqual(LC.rateFromMs(0), null);
  assert.strictEqual(LC.rateFromMs(-5), null);
});

// ── computeResults ────────────────────────────────────────────────────────
function sampleQuestions() {
  return [
    mcQ({ idx: 0, nodeId: 'nA', l1Id: 'L1', l1Label: 'Geografia', correct: 0 }),
    mcQ({ idx: 1, nodeId: 'nA', l1Id: 'L1', l1Label: 'Geografia', text: 'Fiume di Roma?', options: ['Tevere', 'Po'], correct: 0 }),
    mcQ({ idx: 2, nodeId: 'nB', l1Id: 'L2', l1Label: 'Storia', text: 'Anno unità?', options: ['1861', '1945'], correct: 0 }),
    { idx: 3, kind: 'open', text: 'Commenta', answerText: null, nodeId: null, source: 'custom' } // custom senza nodeId
  ];
}

test('computeResults: heatmap conteggi + %, blank = risposta mancante', () => {
  const qs = sampleQuestions();
  const students = [
    { emojiKey: 'volpe', num: '00', name: 'Sara', answers: { 0: { choice: 0, ms: 4000 }, 1: { choice: 0, ms: 3000 }, 2: { choice: 1, ms: 5000 }, 3: { text: 'un commento', ms: 8000 } } },
    { emojiKey: 'panda', num: '00', name: '', answers: { 0: { choice: 1, ms: 6000 }, 2: { choice: 0, ms: 4000 }, 3: { text: 'altro', ms: 5000 } } } // q1 mancante = blank
  ];
  const r = LC.computeResults(qs, students, LC.buildCredentials(3));
  assert.strictEqual(r.joined, 2);
  assert.strictEqual(r.absent, 1); // roster 3, joined 2
  // Q0: Sara giusto, Panda sbagliato
  assert.strictEqual(r.perQuestion[0].right, 1);
  assert.strictEqual(r.perQuestion[0].wrong, 1);
  assert.strictEqual(r.perQuestion[0].pctRight, 50);
  // Q1: Sara giusto, Panda non ha risposto → blank
  assert.strictEqual(r.perQuestion[1].right, 1);
  assert.strictEqual(r.perQuestion[1].blank, 1);
  // Q3 custom aperta senza soluzione, entrambi hanno scritto → manual
  assert.strictEqual(r.perQuestion[3].manual, 2);
});

test('computeResults: domanda custom senza nodeId esclusa dai topic', () => {
  const qs = sampleQuestions();
  const students = [{ emojiKey: 'volpe', num: '00', name: 'Sara',
    answers: { 0: { choice: 0, ms: 4000 }, 1: { choice: 0, ms: 3000 }, 2: { choice: 0, ms: 5000 }, 3: { text: 'un commento', ms: 8000 } } }];
  const r = LC.computeResults(qs, students, null);
  const sara = r.perStudent[0];
  // topic solo da L1/L2 (nodi nA/nB), MAI dalla custom senza nodeId
  const topicLabels = sara.topics.map(t => t.l1Label).sort();
  assert.deepStrictEqual(topicLabels, ['Geografia', 'Storia']);
  // la domanda manual non entra in accuratezza
  assert.strictEqual(sara.manualCount, 1);
});

test('computeResults: soglie forti (≥0.8, ≥2 item) e deboli (<0.5)', () => {
  const qs = sampleQuestions();
  // Sara: Geografia 2/2 giusti (forte), Storia 0/1 (debole)
  const students = [{ emojiKey: 'volpe', num: '00', name: 'Sara',
    answers: { 0: { choice: 0, ms: 4000 }, 1: { choice: 0, ms: 3000 }, 2: { choice: 1, ms: 5000 } } }];
  const r = LC.computeResults(qs, students, null);
  const sara = r.perStudent[0];
  assert.ok(sara.strengths.includes('Geografia'));
  assert.ok(sara.weaknesses.includes('Storia'));
  assert.strictEqual(sara.accuracyPct, 67); // 2 giusti su 3 gradabili
});

test('computeResults: medianRate calcolato dai tempi delle risposte gradabili', () => {
  const qs = [mcQ({ idx: 0, nodeId: 'nA', correct: 0 })];
  const students = [{ emojiKey: 'volpe', num: '00', answers: { 0: { choice: 0, ms: 6000 } } }];
  const r = LC.computeResults(qs, students, null);
  assert.strictEqual(r.perStudent[0].medianRate, 10); // 6s → 10/min
});

test('cleanAnswer: sanifica per tipo, respinge choice fuori range', () => {
  const mc = mcQ();
  assert.deepStrictEqual(LC.cleanAnswer(mc, { choice: 1, ms: 3000 }), { ms: 3000, choice: 1 });
  assert.strictEqual(LC.cleanAnswer(mc, { choice: 9, ms: 100 }), null);
  assert.deepStrictEqual(LC.cleanAnswer(mc, { skipped: true, ms: 200 }), { skipped: true, ms: 200 });
  const tf = { kind: 'tf', statementTrue: true };
  assert.strictEqual(LC.cleanAnswer(tf, { choice: 'sì' }), null);
  assert.deepStrictEqual(LC.cleanAnswer(tf, { choice: false, ms: 500 }), { ms: 500, choice: false });
});

// ── Timeline Live (008): grading anni, answerTexts, hint ────────────────────
test('gradeAnswer open answerYear: esatto/±tol/oltre/non-numerico', () => {
  const q = { kind: 'open', answerYear: 1947, yearTolerance: 2 };
  assert.strictEqual(LC.gradeAnswer(q, { text: '1947' }).outcome, 'right');
  assert.strictEqual(LC.gradeAnswer(q, { text: '1949' }).outcome, 'right'); // dist 2 ≤ tol
  assert.strictEqual(LC.gradeAnswer(q, { text: '1945' }).outcome, 'right'); // dist 2
  assert.strictEqual(LC.gradeAnswer(q, { text: '1950' }).outcome, 'wrong'); // dist 3
  assert.strictEqual(LC.gradeAnswer(q, { text: 'boh' }).outcome, 'wrong');
  assert.strictEqual(LC.gradeAnswer(q, { text: '' }).outcome, 'blank');
});

test('gradeAnswer open periodo: dentro [inizio-tol, fine+tol]', () => {
  const q = { kind: 'open', answerYear: 1939, answerYearEnd: 1945, yearTolerance: 0 };
  assert.strictEqual(LC.gradeAnswer(q, { text: '1942' }).outcome, 'right'); // dentro il periodo
  assert.strictEqual(LC.gradeAnswer(q, { text: '1945' }).outcome, 'right');
  assert.strictEqual(LC.gradeAnswer(q, { text: '1946' }).outcome, 'wrong');
});

test('gradeAnswer open answerTexts: corretto se indovina UNO qualsiasi', () => {
  const q = { kind: 'open', answerTexts: ['Crisi di Cuba', 'Concilio Vaticano II'] };
  assert.strictEqual(LC.gradeAnswer(q, { text: 'Crisi di Cuba' }).outcome, 'right');
  assert.strictEqual(LC.gradeAnswer(q, { text: 'concilio vaticano II' }).outcome, 'right'); // fuzzy sul secondo
  assert.strictEqual(LC.gradeAnswer(q, { text: 'Rivoluzione francese' }).outcome, 'wrong');
});

test('open senza campi timeline → comportamento identico a prima (answerText / manual)', () => {
  assert.strictEqual(LC.gradeAnswer({ kind: 'open', answerText: 'Roma' }, { text: 'roma' }).outcome, 'right');
  assert.strictEqual(LC.gradeAnswer({ kind: 'open' }, { text: 'x' }).outcome, 'manual');
});

test('cleanAnswer: hintUsed preservato solo se true (shape legacy invariata)', () => {
  const q = { kind: 'open' };
  assert.deepStrictEqual(LC.cleanAnswer(q, { text: 'x', ms: 100 }), { ms: 100, text: 'x' });
  assert.deepStrictEqual(LC.cleanAnswer(q, { text: 'x', ms: 100, hintUsed: true }), { ms: 100, hintUsed: true, text: 'x' });
});

test('publicQuestions timeline: passa hint/expects/tlYear, strippa answerYear/answerTexts/answerText', () => {
  const pub = LC.publicQuestions([{
    kind: 'open', text: 'In che anno?', hint: 'contesto', expects: 'year', tlYear: 1947,
    answerYear: 1947, answerTexts: ['x'], answerText: 'x'
  }])[0];
  assert.strictEqual(pub.hint, 'contesto');
  assert.strictEqual(pub.expects, 'year');
  assert.strictEqual(pub.tlYear, 1947);
  assert.strictEqual(pub.answerYear, undefined);
  assert.strictEqual(pub.answerTexts, undefined);
  assert.strictEqual(pub.answerText, undefined);
});

test('computeResults: aggrega hintsUsed per studente e hintCount per domanda', () => {
  const qs = [
    { idx: 0, kind: 'open', answerText: 'A', tlYear: 1900 },
    { idx: 1, kind: 'open', answerYear: 1950, yearTolerance: 0, tlYear: 1950 }
  ];
  const students = [{ emojiKey: 'volpe', num: '01', answers: {
    0: { text: 'A', ms: 1000, hintUsed: true },
    1: { text: '1950', ms: 1000 }
  } }];
  const r = LC.computeResults(qs, students, [{ emojiKey: 'volpe', num: '01' }]);
  assert.strictEqual(r.perStudent[0].hintsUsed, 1);
  assert.strictEqual(r.perQuestion[0].hintCount, 1);
  assert.strictEqual(r.perQuestion[1].hintCount, 0);
  assert.strictEqual(r.perQuestion[0].tlYear, 1900);
});
