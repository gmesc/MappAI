'use strict';
/*
 * pipeline-core.test.js — logica pura pipeline «Genera materiali» (011), headless.
 * Copre: manifest (creazione, transizioni ammesse/vietate, crash-detection,
 * forward-compat), validatori step, stima chiamate, nomi file canonici.
 */
const { test } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const PC = require(path.join(__dirname, '..', 'public', 'js', 'mappai-pipeline-core.js'));

const NOW = '2026-07-20T10:00:00.000Z';
const fullConfig = {
  className: '2ª A', tuned: false,
  quiz: { types: ['mc', 'tf'], perBranch: 3, angle: 'auto' },
  nodesheet: { maxLevel: 'all', fmt: '2x2', modes: ['title', 'keywords'], causal: true },
  synthesis: { audio: true }
};

// ── createManifest ──────────────────────────────────────────────────────
test('createManifest: schema, A pending, B/C/D pending se richiesti', () => {
  const m = PC.createManifest(fullConfig, { now: NOW, vaultPath: 'Mappe/2ª A/Foto' });
  assert.strictEqual(m.schema, 'mappai-pipeline@1');
  assert.strictEqual(m.createdAt, NOW);
  assert.strictEqual(m.vaultPath, 'Mappe/2ª A/Foto');
  assert.strictEqual(m.steps.A.status, 'pending');
  assert.strictEqual(m.steps.B.status, 'pending');
  assert.strictEqual(m.steps.C.status, 'pending');
  assert.strictEqual(m.steps.D.status, 'pending');
});

test('createManifest: sezioni non richieste → skipped', () => {
  const m = PC.createManifest({ quiz: { types: ['mc'] } }, { now: NOW });
  assert.strictEqual(m.steps.A.status, 'pending');
  assert.strictEqual(m.steps.B.status, 'pending');
  assert.strictEqual(m.steps.C.status, 'skipped');
  assert.strictEqual(m.steps.D.status, 'skipped');
});

// ── stepTransition: ammesse ─────────────────────────────────────────────
test('stepTransition: A pending→running→done, timestamp + calls', () => {
  let m = PC.createManifest(fullConfig, { now: NOW });
  m = PC.stepTransition(m, 'A', 'running', { now: NOW });
  assert.strictEqual(m.steps.A.status, 'running');
  assert.strictEqual(m.steps.A.startedAt, NOW);
  m = PC.stepTransition(m, 'A', 'done', { now: NOW, calls: 22, files: [] });
  assert.strictEqual(m.steps.A.status, 'done');
  assert.strictEqual(m.steps.A.calls, 22);
  assert.strictEqual(m.steps.A.endedAt, NOW);
});

test('stepTransition: failed→running (Riprova) pulisce error', () => {
  let m = PC.createManifest(fullConfig, { now: NOW });
  m = PC.stepTransition(m, 'A', 'running', { now: NOW });
  m = PC.stepTransition(m, 'A', 'done', { now: NOW });
  m = PC.stepTransition(m, 'C', 'running', { now: NOW });
  m = PC.stepTransition(m, 'C', 'failed', { now: NOW, error: 'PDF vuoto' });
  assert.strictEqual(m.steps.C.status, 'failed');
  assert.strictEqual(m.steps.C.error, 'PDF vuoto');
  m = PC.stepTransition(m, 'C', 'running', { now: NOW });   // Riprova
  assert.strictEqual(m.steps.C.status, 'running');
  assert.strictEqual(m.steps.C.error, undefined);           // error pulito
});

test('stepTransition: immutabile (non muta l\'input)', () => {
  const m0 = PC.createManifest(fullConfig, { now: NOW });
  const m1 = PC.stepTransition(m0, 'A', 'running', { now: NOW });
  assert.strictEqual(m0.steps.A.status, 'pending');   // originale intatto
  assert.strictEqual(m1.steps.A.status, 'running');
});

// ── stepTransition: vietate ─────────────────────────────────────────────
test('stepTransition: transizioni vietate lanciano', () => {
  let m = PC.createManifest(fullConfig, { now: NOW });
  assert.throws(() => PC.stepTransition(m, 'A', 'done', { now: NOW }), /vietata/);      // pending→done
  m = PC.stepTransition(m, 'A', 'running', { now: NOW });
  m = PC.stepTransition(m, 'A', 'done', { now: NOW });
  assert.throws(() => PC.stepTransition(m, 'A', 'running', { now: NOW }), /vietata/);    // done→running
  assert.throws(() => PC.stepTransition(m, 'Z', 'running', { now: NOW }), /sconosciuto/);
});

test('stepTransition: B/C/D richiedono A done', () => {
  let m = PC.createManifest(fullConfig, { now: NOW });
  assert.throws(() => PC.stepTransition(m, 'B', 'running', { now: NOW }), /richiede A done/);
  m = PC.stepTransition(m, 'A', 'running', { now: NOW });
  assert.throws(() => PC.stepTransition(m, 'B', 'running', { now: NOW }), /richiede A done/);
  m = PC.stepTransition(m, 'A', 'done', { now: NOW });
  const ok = PC.stepTransition(m, 'B', 'running', { now: NOW });   // ora ammesso
  assert.strictEqual(ok.steps.B.status, 'running');
});

// ── crash detection ─────────────────────────────────────────────────────
test('normalizeOnLoad: running → failed "interrotto", file preservati', () => {
  let m = PC.createManifest(fullConfig, { now: NOW });
  m = PC.stepTransition(m, 'A', 'running', { now: NOW });
  m = PC.stepTransition(m, 'A', 'done', { now: NOW });
  m = PC.stepTransition(m, 'B', 'running', { now: NOW, files: ['Materiale Studio/Quiz-MC-X.pdf'] });
  const norm = PC.normalizeOnLoad(m);
  assert.strictEqual(norm.steps.A.status, 'done');       // done intatto
  assert.strictEqual(norm.steps.B.status, 'failed');     // running → failed
  assert.strictEqual(norm.steps.B.error, 'interrotto');
  assert.deepStrictEqual(norm.steps.B.files, ['Materiale Studio/Quiz-MC-X.pdf']); // file validi
});

test('normalizeOnLoad + forward-compat: campi ignoti preservati', () => {
  let m = PC.createManifest(fullConfig, { now: NOW });
  m.steps.A.futuroCampo = { x: 1 };            // campo di una versione futura
  m.extraTopLevel = 'boh';
  const norm = PC.normalizeOnLoad(m);
  assert.deepStrictEqual(norm.steps.A.futuroCampo, { x: 1 });
  assert.strictEqual(norm.extraTopLevel, 'boh');
});

test('isComplete: tutti done|skipped', () => {
  let m = PC.createManifest({ quiz: { types: ['mc'] } }, { now: NOW });  // C,D skipped
  assert.strictEqual(PC.isComplete(m), false);
  m = PC.stepTransition(m, 'A', 'running', { now: NOW });
  m = PC.stepTransition(m, 'A', 'done', { now: NOW });
  m = PC.stepTransition(m, 'B', 'running', { now: NOW });
  m = PC.stepTransition(m, 'B', 'done', { now: NOW });
  assert.strictEqual(PC.isComplete(m), true);
});

// ── validatori ──────────────────────────────────────────────────────────
test('validateMapResult: soglia nodi + presenza radice', () => {
  assert.strictEqual(PC.validateMapResult(null).ok, false);
  assert.strictEqual(PC.validateMapResult({ nodes: [] }).ok, false);
  const few = { nodes: [{ level: 0 }, { level: 1 }] };
  assert.strictEqual(PC.validateMapResult(few).ok, false);              // < 5
  const good = { nodes: [{ level: 0 }, { level: 1 }, { level: 1 }, { level: 2 }, { level: 2 }] };
  assert.strictEqual(PC.validateMapResult(good).ok, true);
  const noRoot = { nodes: [{ level: 2 }, { level: 3 }, { level: 2 }, { level: 3 }, { level: 2 }] };
  assert.strictEqual(PC.validateMapResult(noRoot).ok, false);           // livelli ma nessun L0/L1
  const kgNoLevels = { nodes: [{}, {}, {}, {}, {}, {}] };
  assert.strictEqual(PC.validateMapResult(kgNoLevels).ok, true);        // KG senza livelli passa sul conteggio
  assert.strictEqual(PC.validateMapResult({ nodes: [{ level: 0 }, {}, {}] }, 3).ok, true); // soglia custom
});

test('validateQuizItems / validatePdfB64 / validateSynthesis', () => {
  assert.strictEqual(PC.validateQuizItems([]).ok, false);
  assert.strictEqual(PC.validateQuizItems([{ q: 1 }]).ok, true);
  assert.strictEqual(PC.validatePdfB64('').ok, false);
  assert.strictEqual(PC.validatePdfB64('x'.repeat(50)).ok, false);
  assert.strictEqual(PC.validatePdfB64('x'.repeat(200)).ok, true);
  assert.strictEqual(PC.validatePdfB64('data:application/pdf;base64,' + 'A'.repeat(200)).ok, true);
  assert.strictEqual(PC.validateSynthesis(null).ok, false);
  assert.strictEqual(PC.validateSynthesis({ rawText: '   ' }).ok, false);
  assert.strictEqual(PC.validateSynthesis({ rawText: 'Un testo di sintesi abbastanza lungo.' }).ok, true);
  // Mappa intera: whole=true (FLAG, non testo) + sezioni con rawText → deve passare
  assert.strictEqual(PC.validateSynthesis({ whole: true, intro: '', sections: [{ rawText: 'Sezione con contenuto sufficiente per il ramo.' }] }).ok, true);
  assert.strictEqual(PC.validateSynthesis({ whole: true, intro: 'Panoramica introduttiva della mappa.', sections: [] }).ok, true);
  // whole=true ma nessun testo reale → fallisce (non deve scambiare il flag per contenuto)
  assert.strictEqual(PC.validateSynthesis({ whole: true, intro: '', sections: [{ failed: true }] }).ok, false);
});

// ── file-first / resume / retry (US2) ───────────────────────────────────
test('stepTransition: running resetta i file (retry pulito), done li tiene', () => {
  let m = PC.createManifest(fullConfig, { now: NOW });
  m = PC.stepTransition(m, 'A', 'running', { now: NOW });
  m = PC.stepTransition(m, 'A', 'done', { now: NOW });
  m = PC.stepTransition(m, 'C', 'running', { now: NOW });
  m.steps.C.files = ['Materiale Studio/parziale.pdf'];   // file parziale scritto pre-crash
  m = PC.stepTransition(m, 'C', 'failed', { now: NOW, error: 'boom' });
  assert.deepStrictEqual(m.steps.C.files, ['Materiale Studio/parziale.pdf']); // failed conserva
  m = PC.stepTransition(m, 'C', 'running', { now: NOW });   // Riprova
  assert.deepStrictEqual(m.steps.C.files, []);               // reset per rigenerare
});

test('resume: step done NON si ritocca; solo failed/pending ripartono (guardia orchestratore)', () => {
  // Simula un manifest post-crash: A done, B done, C running (crash), D pending.
  let m = PC.createManifest(fullConfig, { now: NOW });
  m = PC.stepTransition(m, 'A', 'running', { now: NOW });
  m = PC.stepTransition(m, 'A', 'done', { now: NOW, calls: 20 });
  m = PC.stepTransition(m, 'B', 'running', { now: NOW });
  m = PC.stepTransition(m, 'B', 'done', { now: NOW, files: ['Materiale Studio/Quiz-MC-X.pdf'], calls: 6 });
  m = PC.stepTransition(m, 'C', 'running', { now: NOW });
  const norm = PC.normalizeOnLoad(m);
  assert.strictEqual(norm.steps.A.status, 'done');
  assert.strictEqual(norm.steps.A.calls, 20);      // i calls NON cambiano → zero chiamate ripetute
  assert.strictEqual(norm.steps.B.status, 'done');
  assert.strictEqual(norm.steps.C.status, 'failed'); // crash → failed
  assert.strictEqual(norm.steps.D.status, 'pending');
  // La ripresa può transire C failed→running e D pending→running; B done resta done.
  assert.doesNotThrow(() => PC.stepTransition(norm, 'C', 'running', { now: NOW }));
  assert.doesNotThrow(() => PC.stepTransition(norm, 'D', 'running', { now: NOW }));
  assert.throws(() => PC.stepTransition(norm, 'B', 'running', { now: NOW }), /vietata/); // done→running vietato
});

// ── estimateCalls ───────────────────────────────────────────────────────
test('estimateCalls: rami × tipi + keyword + sintesi + audio', () => {
  const e = PC.estimateCalls(fullConfig, { branches: 4, nodes: 40, audioBlocks: 3 });
  // A = 4+2 = 6 ; B = 4 rami × 2 tipi = 8 ; C = ceil(40/12) = 4 ; D = 4+1 + 3 audio = 8
  assert.strictEqual(e.perStep.A, 6);
  assert.strictEqual(e.perStep.B, 8);
  assert.strictEqual(e.perStep.C, 4);
  assert.strictEqual(e.perStep.D, 8);
  assert.strictEqual(e.total, 26);
});

test('estimateCalls: senza keyword C=0; senza audio D senza blocchi', () => {
  const cfg = { quiz: { types: ['mc'] }, nodesheet: { modes: ['title'] }, synthesis: { audio: false } };
  const e = PC.estimateCalls(cfg, { branches: 3, nodes: 30 });
  assert.strictEqual(e.perStep.B, 3);      // 3 × 1
  assert.strictEqual(e.perStep.C, 0);      // solo title → niente AI
  assert.strictEqual(e.perStep.D, 4);      // 3+1, no audio
});

// ── preset (US3) ────────────────────────────────────────────────────────
test('presetFromConfig: strippa classId/className/sede, tiene solo output', () => {
  const o = PC.presetFromConfig({ classId: 'cls_x', className: '2ª A', sede: 'Bellinzona', tuned: true, levelTuned: false, quiz: { types: ['mc', 'tf'], perBranch: 4, angle: 'causa' }, synthesis: { audio: true } });
  assert.strictEqual(o.classId, undefined);
  assert.strictEqual(o.className, undefined);
  assert.strictEqual(o.sede, undefined);
  assert.deepStrictEqual(o.quiz.types, ['mc', 'tf']);
  assert.strictEqual(o.quiz.perBranch, 4);
  assert.strictEqual(o.tuned, true);
  assert.strictEqual(o.synthesis.audio, true);
  assert.strictEqual(o.nodesheet, undefined);   // non richiesto → assente
});

test('presetNormalize: schema v1, opzioni ignote → default, no classe', () => {
  const p = PC.presetNormalize({ name: 'X'.repeat(80), options: { classId: 'leak', quiz: { types: ['mc', 'bogus'], perBranch: 99, angle: 'causa' }, nodesheet: { fmt: 'weird', modes: ['title', 'nope'], maxLevel: 3 } } });
  assert.strictEqual(p.v, 1);
  assert.strictEqual(p.name.length, 60);                 // cap nome
  assert.ok(p.id.indexOf('pr_') === 0);
  assert.deepStrictEqual(p.options.quiz.types, ['mc']);  // 'bogus' scartato
  assert.strictEqual(p.options.quiz.perBranch, 10);      // clamp 1..10
  assert.strictEqual(p.options.nodesheet.fmt, '2x2');    // 'weird' → default
  assert.deepStrictEqual(p.options.nodesheet.modes, ['title']); // 'nope' scartato
  assert.strictEqual(p.options.nodesheet.maxLevel, 3);
  assert.strictEqual(p.options.classId, undefined);      // classe mai nei preset
});

test('presetNormalize: quiz senza tipi validi → default mc; modes vuoti → title', () => {
  const p = PC.presetNormalize({ name: 'Y', options: { quiz: { types: ['zzz'] }, nodesheet: { modes: [] } } });
  assert.deepStrictEqual(p.options.quiz.types, ['mc']);
  assert.deepStrictEqual(p.options.nodesheet.modes, ['title']);
});

test('presetListPush: cap FIFO 50 scarta i più vecchi', () => {
  let list = [];
  for (let i = 0; i < 55; i++) list = PC.presetListPush(list, { name: 'p' + i, createdAt: NOW, options: {} }, 50);
  assert.strictEqual(list.length, 50);
  assert.strictEqual(list[0].name, 'p5');    // i primi 5 scartati
  assert.strictEqual(list[49].name, 'p54');
});

// ── buildFileName ───────────────────────────────────────────────────────
test('buildFileName: nomi canonici + marcatore VERDE', () => {
  assert.strictEqual(PC.buildFileName('quiz_mc', 'Fotosintesi', false), 'Quiz-MC-Fotosintesi.pdf');
  assert.strictEqual(PC.buildFileName('quiz_tf', 'Fotosintesi', true), 'Quiz-VF-Fotosintesi -VERDE.pdf');
  assert.strictEqual(PC.buildFileName('flashcards', 'Ramo X', false), 'Flashcard-Ramo X.pdf');
  assert.strictEqual(PC.buildFileName('nodesheet', 'keywords', true), 'Foglio-nodi-keywords -VERDE.pdf');
  assert.strictEqual(PC.buildFileName('synthesis', null, false), 'Sintesi.html');
  assert.strictEqual(PC.buildFileName('synthesis', null, true), 'Sintesi -VERDE.html');
  assert.strictEqual(PC.buildFileName('tts', null, true), 'Sintesi-audio.mp3');
  // segmenti con caratteri illegali sanitizzati
  assert.strictEqual(PC.buildFileName('quiz_mc', 'A/B:C', false), 'Quiz-MC-A B C.pdf');
});
