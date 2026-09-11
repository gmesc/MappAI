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

/* ── DOMANDE APERTE (11/8) ──────────────────────────────────────────────
   Sono un tipo di quiz per la CONFIGURAZIONE (stessa spunta, stesso box del
   bento, stesso conto delle chiamate) ma un DOCUMENTO per la pipeline: non
   entrano in `studySets`. Qui si fissa la parte che vive nel core — il conto e
   il nome — perché è quella su cui poggiano le altre due. */
test('estimateCalls: le domande aperte contano come ogni altro tipo di quiz', () => {
  const cfg = { quiz: { types: ['mc', 'open'] } };
  const e = PC.estimateCalls(cfg, { branches: 5, nodes: 0, willGenerateMap: false });
  assert.strictEqual(e.perStep.B, 10);     // 5 rami × 2 tipi
  assert.strictEqual(e.total, 10);
});

/* ⚠️ Il prefisso è SENZA accenti e con i trattini, come `Catena-dei-perche`:
   questi file finiscono su chiavette e cartelle condivise. E sta in TESTA
   perché è da lì che `_diskKind` riconosce il genere — se cambia, il foglio
   torna a comparire fra i «File» e il docente non lo trova più. */
test('buildFileName: il foglio delle domande aperte', () => {
  assert.strictEqual(
    PC.buildFileName('open_questions', null, false, { mappa: 'Il Clima' }),
    'Domande-aperte-Il Clima.pdf');
  assert.strictEqual(
    PC.buildFileName('open_questions', null, false, { mappa: 'Il Clima', nome: 'verifica di maggio' }),
    'Domande-aperte-Il Clima-verifica di maggio.pdf');
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
/* ⚠️ CAMBIO DI COMPORTAMENTO (10/8): il suffisso ` -VERDE` NON si scrive più.
   Distingueva la versione tarata per una classe inclusiva da quella standard;
   da quando la taratura si applica da sé leggendo il contesto attivo, di
   generazioni ce n'è una sola e non c'è più niente da distinguere. `tuned`
   resta nella firma — i chiamanti non cambiano — ma non produce nulla. */
test('buildFileName: nomi canonici, e `tuned` non aggiunge più il marcatore', () => {
  assert.strictEqual(PC.buildFileName('quiz_mc', 'Fotosintesi', false), 'Quiz-MC-Fotosintesi.pdf');
  assert.strictEqual(PC.buildFileName('quiz_tf', 'Fotosintesi', true), 'Quiz-VF-Fotosintesi.pdf');
  assert.strictEqual(PC.buildFileName('flashcards', 'Ramo X', false), 'Flashcard-Ramo X.pdf');
  assert.strictEqual(PC.buildFileName('nodesheet', 'keywords', true), 'Foglio-nodi-keywords.pdf');
  assert.strictEqual(PC.buildFileName('synthesis', null, false), 'Sintesi.html');
  // stesso nome con e senza taratura: è la conseguenza dichiarata del cambio
  assert.strictEqual(PC.buildFileName('synthesis', null, true), 'Sintesi.html');
  // segmenti con caratteri illegali sanitizzati
  assert.strictEqual(PC.buildFileName('quiz_mc', 'A/B:C', false), 'Quiz-MC-A B C.pdf');
});

/* I DUE file della sintesi (10/8). Non sono due stati dello stesso documento:
   l'editabile vive in ELABORA, quello con la voce si consegna e si vede solo in
   INSEGNA. Il marcatore «voce» sta IN TESTA, attaccato al tipo, perché è da lì
   che `_diskKind` riconosce il genere — come `Quiz-MC` e `Quiz-VF`, che sono
   due prefissi e non un `Quiz` con un suffisso.
   Se questo test cade, i due file tornano nello stesso elenco e la separazione
   fra le due console sparisce senza un errore. */
test('buildFileName: la sintesi editabile e quella con la voce hanno nomi distinti', () => {
  assert.strictEqual(
    PC.buildFileName('synthesis', null, false, { mappa: 'Il Clima' }),
    'Sintesi-Il Clima.html');
  assert.strictEqual(
    PC.buildFileName('synthesis_voice', null, false, { mappa: 'Il Clima' }),
    'Sintesi-voce-Il Clima.html');
  // il nome scelto dal docente si accoda, e non sposta il marcatore dalla testa
  assert.strictEqual(
    PC.buildFileName('synthesis_voice', null, false, { mappa: 'Il Clima', nome: 'ripasso di maggio' }),
    'Sintesi-voce-Il Clima-ripasso di maggio.html');
  // la regola specifica deve poter vincere su quella generica: `^Sintesi-voce-`
  // combacia, e `^Sintesi` combacia comunque — l'ordine è tutto
  const conVoce = PC.buildFileName('synthesis_voice', null, false, { mappa: 'X' });
  assert.ok(/^Sintesi-voce-/.test(conVoce));
  assert.ok(/^Sintesi/.test(conVoce), 'la regola generica cattura anche questo: va messa DOPO');
});

/* Il nome dell'MP3 resta definito, ma dal 10/8 la pipeline non scrive più
   l'audio come file separato: vive dentro l'HTML con la voce. Il genere resta
   qui perché i vault esistenti quei file ce li hanno, e chi li elenca deve
   continuare a saperli nominare. */
test('buildFileName: il nome dell\'MP3 (file dei vault storici)', () => {
  assert.strictEqual(PC.buildFileName('tts', null, false), 'Sintesi-audio.mp3');
  assert.strictEqual(PC.buildFileName('tts', null, true), 'Sintesi-audio.mp3');
});

/* La forma nuova: <Tipo>-<Mappa>[-<dettaglio>][-<nome del docente>] */
test('buildFileName: mappa, dettaglio e nome scelto dal docente', () => {
  assert.strictEqual(
    PC.buildFileName('quiz_mc', null, true, { mappa: 'Il Clima', nome: 'ripasso finale' }),
    'Quiz-MC-Il Clima-ripasso finale.pdf');
  assert.strictEqual(
    PC.buildFileName('synthesis', null, false, { mappa: 'Il Clima' }),
    'Sintesi-Il Clima.html');
  assert.strictEqual(
    PC.buildFileName('synthesis', null, false, { mappa: 'Il Clima', dettaglio: 'Venti', nome: 'per Anna' }),
    'Sintesi-Il Clima-Venti-per Anna.html');
  assert.strictEqual(
    PC.buildFileName('nodesheet', null, true, { mappa: 'Il Clima', dettaglio: 'card' }),
    'Foglio-nodi-Il Clima-card.pdf');
  assert.strictEqual(
    PC.buildFileName('causal', null, false, { mappa: 'Il Clima' }),
    'Catena-dei-perche-Il Clima.pdf');
  assert.strictEqual(
    PC.buildFileName('tts', null, false, { mappa: 'Il Clima' }),
    'Sintesi-audio-Il Clima.mp3');
  // il nome del docente passa dalla stessa sanitizzazione dei nomi di file
  assert.strictEqual(
    PC.buildFileName('flashcards', null, false, { mappa: 'A', nome: 'B/C' }),
    'Flashcard-A-B C.pdf');
});

/* Il TIPO deve restare in testa: è così che `_diskKind` riconosce un file, e da
   quel riconoscimento dipendono il raggruppamento della colonna e il bottone
   «Modifica». Se questo test cade, la colonna smette di sapere che cos'ha in
   mano — e lo fa in silenzio, mostrando tutto come «File». */
test('buildFileName: i nomi nuovi restano riconoscibili dal classificatore', () => {
  const RX = [
    [/\.mp3$|\.m4a$|\.wav$/i, 'Audio'],
    [/^Quiz-MC-/i, 'Quiz MC'], [/^Quiz-VF-/i, 'Quiz V/F'],
    [/^Flashcard-/i, 'Flashcard'], [/^Foglio.?nodi/i, 'Foglio nodi'],
    /* ⚠️ L'ORDINE È LA REGOLA: `^Sintesi-voce` PRIMA di `^Sintesi`, che
       combacia anche con quella. Invertirli fa sparire la distinzione fra il
       file editabile e la copia con la voce — cioè la separazione fra ELABORA e
       INSEGNA — e lo fa in silenzio, perché un nome viene comunque classificato.
       Questa lista è lo specchio di `_diskKind` (mappai-landing-teach.js): se
       cambia una, deve cambiare l'altra. */
    [/^Sintesi-voce\b/i, 'Sintesi con voce'],
    [/^Sintesi/i, 'Sintesi'], [/^Catena.dei.perche/i, 'Catena dei perché'],
    [/^Domande.?aperte/i, 'Domande aperte']
  ];
  const atteso = {
    quiz_mc: 'Quiz MC', quiz_tf: 'Quiz V/F', flashcards: 'Flashcard',
    nodesheet: 'Foglio nodi', synthesis: 'Sintesi',
    synthesis_voice: 'Sintesi con voce',
    causal: 'Catena dei perché', tts: 'Audio',
    open_questions: 'Domande aperte'
  };
  Object.keys(atteso).forEach((kind) => {
    const nome = PC.buildFileName(kind, null, true, { mappa: 'Il Clima', dettaglio: 'card', nome: 'per Anna' });
    const trovato = RX.find((r) => r[0].test(nome));
    assert.ok(trovato, 'non classificato: ' + nome);
    assert.strictEqual(trovato[1], atteso[kind], nome);
  });
  /* La prova che l'ordine conta: con la regola generica per prima, la copia con
     la voce si classifica come una sintesi normale — nessun errore, solo la
     distinzione persa. */
  const alContrario = [[/^Sintesi/i, 'Sintesi'], [/^Sintesi-voce\b/i, 'Sintesi con voce']];
  const conVoce = PC.buildFileName('synthesis_voice', null, false, { mappa: 'Il Clima' });
  assert.strictEqual(alContrario.find((r) => r[0].test(conVoce))[1], 'Sintesi',
    'se questo cambia, la regola generica ha smesso di catturare: rivedere il commento sopra');
});

test('nomeLibero: disambigua con « · 02» come già fa Fonti/', () => {
  assert.strictEqual(PC.nomeLibero('Sintesi-A.html', []), 'Sintesi-A.html');
  assert.strictEqual(PC.nomeLibero('Sintesi-A.html', ['altro.pdf']), 'Sintesi-A.html');
  assert.strictEqual(PC.nomeLibero('Sintesi-A.html', ['Sintesi-A.html']), 'Sintesi-A · 02.html');
  assert.strictEqual(
    PC.nomeLibero('Sintesi-A.html', ['Sintesi-A.html', 'Sintesi-A · 02.html']),
    'Sintesi-A · 03.html');
  // il confronto ignora maiuscole e minuscole: su macOS il filesystem fa lo stesso
  assert.strictEqual(PC.nomeLibero('Sintesi-A.html', ['sintesi-a.html']), 'Sintesi-A · 02.html');
  // un nome senza estensione resta trattabile
  assert.strictEqual(PC.nomeLibero('appunti', ['appunti']), 'appunti · 02');
});

/* ═══ STEP E — «Catena dei perché» come materiale INDIPENDENTE (5/8) ══════════
   Prima era `nodesheet.causal` e le sue pagine finivano in coda al PDF dei fogli
   nodi: per avere la catena bisognava chiedere anche i fogli. Ora è un passo suo
   con un file suo. Lo schema resta @1, quindi la retro-compatibilità dei manifest
   già scritti è parte del contratto — non un dettaglio. */
test('E nasce pending se la catena è richiesta, skipped altrimenti', () => {
    const conCatena = PC.createManifest({ causal: true }, { now: 'T' });
    assert.strictEqual(conCatena.steps.E.status, 'pending');
    const senza = PC.createManifest({ quiz: { types: ['mc'] } }, { now: 'T' });
    assert.strictEqual(senza.steps.E.status, 'skipped');
});

test('la catena NON accende i fogli nodi: sono due materiali distinti', () => {
    const m = PC.createManifest({ causal: true }, { now: 'T' });
    assert.strictEqual(m.steps.C.status, 'skipped', 'nessun foglio nodi richiesto');
    assert.strictEqual(m.steps.E.status, 'pending');
});

test('un manifest scritto PRIMA dello step E resta completo (non si riapre)', () => {
    /* il caso vero: un vault già lavorato. Senza il fallback, isComplete
       leggerebbe `undefined` su E e la ripresa riproporrebbe una pipeline finita */
    const vecchio = {
        schema: PC.SCHEMA, createdAt: 'T', updatedAt: 'T', config: {}, vaultPath: '/v',
        steps: {
            A: { status: 'done', files: [] }, B: { status: 'done', files: [] },
            C: { status: 'skipped', files: [] }, D: { status: 'done', files: [] }
        }
    };
    const n = PC.normalizeOnLoad(vecchio);
    assert.strictEqual(n.steps.E.status, 'skipped', 'E riempita come saltata');
    assert.strictEqual(PC.isComplete(n), true, 'la pipeline resta conclusa');
});

test('la catena non costa chiamate AI: E vale 0 e non gonfia il totale', () => {
    const stats = { branches: 4, nodes: 40, willGenerateMap: false };
    const senza = PC.estimateCalls({ quiz: { types: ['mc'] } }, stats);
    const con = PC.estimateCalls({ quiz: { types: ['mc'] }, causal: true }, stats);
    assert.strictEqual(con.perStep.E, 0);
    assert.strictEqual(con.total, senza.total, 'i nessi si ricavano dal grafo, non dall\'AI');
});

test('il file della catena ha un nome senza accenti', () => {
    assert.strictEqual(PC.buildFileName('causal', null, false), 'Catena-dei-perche.pdf');
    /* senza accenti per scelta: il file finisce anche su chiavette e cartelle
       condivise, dove una «é» diventa un problema di qualcun altro.
       `tuned` non aggiunge più nulla (vedi il cambio del 10/8). */
    assert.strictEqual(PC.buildFileName('causal', null, true), 'Catena-dei-perche.pdf');
});

test('un preset porta la catena, e la legge anche dai preset vecchi', () => {
    const o = PC.presetFromConfig({ causal: true });
    assert.strictEqual(o.causal, true);
    /* preset salvati prima del 5/8: la catena stava sotto nodesheet */
    const migrato = PC.presetNormalize({ name: 'vecchio', options: { nodesheet: { modes: ['card'], causal: true } } });
    assert.strictEqual(migrato.options.causal, true, 'la catena non si perde silenziosamente');
    const pulito = PC.presetNormalize({ name: 'senza', options: { quiz: { types: ['mc'] } } });
    assert.strictEqual(pulito.options.causal, false);
});

/* ═══ «C'è almeno un materiale?» ══════════════════════════════════════════════
   Una definizione sola: la stessa che decide gli step del manifest e la faccia
   del bottone del bento (verde «Genera materiali» / blu «Genera Mappa»). */
test('hasOutput riconosce ogni materiale, catena compresa', () => {
    assert.strictEqual(PC.hasOutput({ quiz: { types: ['mc'] } }), true);
    assert.strictEqual(PC.hasOutput({ nodesheet: { modes: ['card'] } }), true);
    assert.strictEqual(PC.hasOutput({ synthesis: { audio: false } }), true);
    assert.strictEqual(PC.hasOutput({ causal: true }), true, 'la catena è un materiale');
});

test('senza materiali hasOutput è falso: è lo stato «solo la mappa»', () => {
    assert.strictEqual(PC.hasOutput({}), false);
    assert.strictEqual(PC.hasOutput({ classId: 'c1', tuned: true, sourcePdf: true }), false);
    assert.strictEqual(PC.hasOutput(null), false);
});

/* ═══ IL PRESET «Default» (11/8) ══════════════════════════════════════════════
   Dall'11/8 i box delle opzioni stanno nella vista estesa: la configurazione di
   partenza non viene più dalle spunte del markup — nessuno le vede — ma da un
   preset. Queste sono le due proprietà da cui dipende che funzioni. */
test('preset: «open» è un tipo valido, o le domande aperte si perdono al salvataggio', () => {
  const n = PC.presetNormalize({ options: { quiz: { types: ['mc', 'open', 'inesistente'] } } });
  assert.deepStrictEqual(n.options.quiz.types, ['mc', 'open'],
    'se «open» cade, il preset si salva con la spunta accesa e si riapre senza');
});

test('preset: il giro config → preset → config conserva Default per intero', () => {
  const cfg = {
    quiz: { types: ['mc', 'open'], perBranch: 3, angle: 'auto' },
    nodesheet: { maxLevel: 'all', fmt: '2x2', modes: ['title'], causal: false },
    synthesis: { audio: true },      // la voce naturale
    causal: true,                    // deterministica: zero chiamate AI
    tuned: true, levelTuned: true,   // ⚠️ da qui `_applyPreset` deriva «Adatta alla classe»
    classId: 'c1', className: '2A'   // la classe NON deve entrare nel preset
  };
  const o = PC.presetFromConfig(cfg);
  assert.deepStrictEqual(o.quiz.types, ['mc', 'open']);
  assert.strictEqual(o.synthesis.audio, true);
  assert.strictEqual(o.causal, true);
  assert.strictEqual(o.tuned, true);
  assert.strictEqual(o.levelTuned, true);
  assert.strictEqual(o.classId, undefined, 'un preset non porta la classe');
  // e sopravvive alla normalizzazione con cui viene riletto da localStorage
  const r = PC.presetNormalize({ name: 'Default', options: o }).options;
  assert.deepStrictEqual(r.quiz.types, ['mc', 'open']);
  assert.strictEqual(r.synthesis.audio, true);
  assert.strictEqual(r.causal, true);
});

/* Il DOSSIER entra nella convenzione dei nomi (11/8/26).
   Prima se lo scriveva da sé, ricavandolo da un campo che non esiste
   (`appState.db.title`): il ripiego scattava sempre e ogni dossier si chiamava
   «Dossier Progetto MappAI MM» — un nome che non dice né quale mappa né quale
   documento, e che il dialogo di salvataggio proponeva tale e quale. */
test('buildFileName: il dossier segue la convenzione, col nodo come dettaglio', () => {
    assert.strictEqual(
        PC.buildFileName('dossier', null, false, { mappa: 'La Politica Svizzera' }),
        'Dossier-La Politica Svizzera.pdf');
    assert.strictEqual(
        PC.buildFileName('dossier', null, false, { mappa: 'La Politica Svizzera', dettaglio: 'Consiglio federale' }),
        'Dossier-La Politica Svizzera-Consiglio federale.pdf');
});

/* ══ LA GRADUAZIONE DI UN FOGLIO DI DOMANDE (13/8/26) ═══════════════════════
   Un foglio in cui ogni domanda richiede tutta la scheda lascia in bianco chi
   ne sa metà. La quota d'AVVIO è la leva; qui si prova che diventa un numero
   sensato in tutti i casi limite — perché è quel numero, non la percentuale,
   che finisce nel prompt. */
test('quotaBase: la percentuale diventa un numero di domande', () => {
    assert.strictEqual(PC.quotaBase(5, 40), 2);
    assert.strictEqual(PC.quotaBase(5, 0), 0);
    assert.strictEqual(PC.quotaBase(10, 50), 5);
    assert.strictEqual(PC.quotaBase(3, 33), 1);
});
test('quotaBase: una percentuale > 0 dà sempre almeno una domanda d\'avvio', () => {
    /* con 5 domande e il 10% l\'arrotondamento darebbe 0: la leva sembrerebbe
       rotta proprio a chi l\'ha spostata di poco */
    assert.strictEqual(PC.quotaBase(5, 10), 1);
    assert.strictEqual(PC.quotaBase(20, 1), 1);
});
test('quotaBase: sotto il 100% resta sempre almeno una domanda di ponte', () => {
    assert.strictEqual(PC.quotaBase(5, 95), 4);
    assert.strictEqual(PC.quotaBase(5, 100), 5);   /* il 100% è una scelta esplicita */
    assert.strictEqual(PC.quotaBase(1, 90), 0);    /* con UNA domanda, il ponte vince */
});
test('quotaBase: valori sporchi non producono NaN nel prompt', () => {
    assert.strictEqual(PC.quotaBase(5, null), 0);
    assert.strictEqual(PC.quotaBase(5, 'abc'), 0);
    assert.strictEqual(PC.quotaBase(5, -20), 0);
    assert.strictEqual(PC.quotaBase(5, 500), 5);
    assert.strictEqual(PC.quotaBase(0, 50), 0);
});
test('contaGraduazione: si CONTA quello che il modello ha dichiarato', () => {
    const items = [{ livello: 'base' }, { livello: 'ponte' }, { livello: 'BASE' }, {}, { livello: 'facile' }];
    /* «facile» e il livello assente valgono ponte: il caso prudente, che non
       promette un avvio che non c'è */
    assert.deepStrictEqual(PC.contaGraduazione(items), { base: 2, ponte: 3, tot: 5 });
    assert.deepStrictEqual(PC.contaGraduazione([]), { base: 0, ponte: 0, tot: 0 });
});
test('ordinaGraduazione: l\'avvio prima, ma solo DENTRO il suo ramo', () => {
    const items = [
        { question: 'A1', l1: 'Clima', livello: 'ponte' },
        { question: 'A2', l1: 'Clima', livello: 'base' },
        { question: 'B1', l1: 'Venti', livello: 'ponte' },
        { question: 'B2', l1: 'Venti', livello: 'base' }
    ];
    const out = PC.ordinaGraduazione(items).map(x => x.question);
    /* i rami restano separati e nell'ordine in cui sono arrivati: un riordino
       globale scomporrebbe il foglio, che è organizzato per macro-area */
    assert.deepStrictEqual(out, ['A2', 'A1', 'B2', 'B1']);
});
test('ordinaGraduazione: è stabile a parità di livello', () => {
    const items = [
        { question: 'x', l1: 'C', livello: 'ponte' },
        { question: 'y', l1: 'C', livello: 'ponte' },
        { question: 'z', l1: 'C', livello: 'ponte' }
    ];
    assert.deepStrictEqual(PC.ordinaGraduazione(items).map(x => x.question), ['x', 'y', 'z']);
});
test('ordinaGraduazione: senza `l1` il gruppo lo dà la prima area', () => {
    const items = [
        { question: 'p', areas: ['Venti'], livello: 'ponte' },
        { question: 'q', areas: ['Venti'], livello: 'base' }
    ];
    assert.deepStrictEqual(PC.ordinaGraduazione(items).map(x => x.question), ['q', 'p']);
});

/* ══ IL NOME DELLA MAPPA ESPORTATA (17/8) ════════════════════════════════════
   Era l'unico materiale fuori dalla convenzione: usciva
   `MappAI_Mappa_1787004725715.pdf` — un marchio, una parola generica e un
   timestamp, cioè un nome che non dice né quale mappa né di che genere.      */

test('buildMapExportName: MM per una MindMap, KG per tutto il resto', () => {
    assert.strictEqual(PC.buildMapExportName('mindmap', 'Il Clima', '.pdf'), 'MM-Il Clima.pdf');
    assert.strictEqual(PC.buildMapExportName('kg', 'Project E', '.pdf'), 'KG-Project E.pdf');
});

test('buildMapExportName: una modalità sconosciuta cade su KG, non su un nome muto', () => {
    assert.strictEqual(PC.buildMapExportName('', 'Il Clima', '.pdf'), 'KG-Il Clima.pdf');
    assert.strictEqual(PC.buildMapExportName(undefined, 'Il Clima', '.pdf'), 'KG-Il Clima.pdf');
});

test('buildMapExportName: lo stesso disegno in tre formati, un nome solo', () => {
    // PDF vettoriale, SVG e PNG sono la stessa cosa in tre vesti: il genere non
    // cambia, cambia l'estensione — per questo `est` è un parametro.
    const b = m => PC.buildMapExportName('mindmap', 'Elettricità', m);
    assert.strictEqual(b('.pdf'), 'MM-Elettricità.pdf');
    assert.strictEqual(b('.svg'), 'MM-Elettricità.svg');
    assert.strictEqual(b('png'), 'MM-Elettricità.png', 'il punto lo mette lui se manca');
});

test('buildMapExportName: senza estensione resta quella del genere', () => {
    assert.strictEqual(PC.buildMapExportName('mindmap', 'Il Clima', ''), 'MM-Il Clima.pdf');
});

test('buildMapExportName: il prefisso sta in TESTA, come Quiz-MC e Sintesi-voce', () => {
    // Il genere di un file si deduce dall'inizio del nome: una regola che
    // dovesse scavalcare un nome di mappa di lunghezza ignota sarebbe fragile.
    assert.ok(PC.buildMapExportName('mindmap', 'Una Mappa Dal Nome Molto Lungo', '.pdf').startsWith('MM-'));
    assert.ok(PC.buildMapExportName('kg', 'Una Mappa Dal Nome Molto Lungo', '.pdf').startsWith('KG-'));
});

/* ══ PIÙ SET PER ANGOLO (19/8) ═══════════════════════════════════════════════
   Un genere marcato «multi» si genera una volta per ogni angolo: la stima deve
   dirlo PRIMA, perché è la leva con cui si decide se vale la spesa. */

test('angoliMulti: sette angoli, senza «auto»', () => {
    const a = PC.angoliMulti();
    assert.strictEqual(a.length, 7);
    assert.ok(a.indexOf('auto') < 0, '«misto» in mezzo agli angolati confonde il profilo di chi sceglie');
    assert.ok(a.indexOf('causa') >= 0 && a.indexOf('eccezione') >= 0);
});

test('nomeAngolo: la CHIAVE nel nome del file, e auto si legge «misto»', () => {
    assert.strictEqual(PC.nomeAngolo('causa'), 'causa');
    assert.strictEqual(PC.nomeAngolo('auto'), 'misto');
});

const TUTTI = PC.angoliMulti();

test('angoliScelti: le caselle spuntate, nell\'ordine dichiarato', () => {
    assert.deepStrictEqual(PC.angoliScelti({ angoli: ['esempio', 'causa'] }), ['causa', 'esempio'],
        'l\'ordine è quello di QUIZ_ANGLES, non quello in cui si spunta');
    assert.deepStrictEqual(PC.angoliScelti({ angoli: ['bogus'] }), [], 'un angolo che non esiste non si genera');
    assert.deepStrictEqual(PC.angoliScelti({}), [], 'senza caselle non c\'è niente da moltiplicare');
});

test('multiTypes: solo generi validi, spuntati, senza doppioni, e con almeno un angolo', () => {
    const A = { angoli: TUTTI };
    assert.deepStrictEqual(PC.multiTypes({ multi: ['open', 'mc'], types: ['open', 'mc', 'tf'], ...A }), ['open', 'mc']);
    assert.deepStrictEqual(PC.multiTypes({ multi: ['open', 'open'], types: ['open'], ...A }), ['open'], 'niente doppioni');
    assert.deepStrictEqual(PC.multiTypes({ multi: ['open', 'mc'], types: ['open'], ...A }), ['open'],
        'un genere non spuntato non si genera: chiederne sette copie sarebbe una generazione che non avviene');
    /* dal 20/8 notte le FLASHCARD si moltiplicano per angolo (l'angolo è
       diventato vero: `flashcardAngleBlock`); il vero/falso resta fuori */
    assert.deepStrictEqual(PC.multiTypes({ multi: ['tf', 'flashcards'], types: ['tf', 'flashcards'], ...A }), ['flashcards'],
        'le flashcard si moltiplicano; il vero/falso resta a una generazione');
    assert.deepStrictEqual(PC.multiTypes({ multi: ['open'], types: ['open'], angoli: [] }), [],
        'spegnere tutte le caselle È lo spegnimento: non c\'è più un interruttore generale');
});

test('per-tipo (dossier, 20/8): angoli, quantità e categorie per genere, con ricaduta sulle leve globali', () => {
    const q = {
        angoli: ['causa', 'esempio'],
        angoliPerTipo: { open: ['causa'], flashcards: ['confronto', 'inesistente'] },
        perTipo: { open: 4, flashcards: 99 },          /* 99 = fuori tetto → ricade */
        catPerTipo: { open: ['identita', 'critica'] }
    };
    assert.deepStrictEqual(PC.angoliPerTipo(q, 'open'), ['causa']);
    assert.deepStrictEqual(PC.angoliPerTipo(q, 'flashcards'), ['confronto'], 'un angolo inesistente si scarta');
    assert.deepStrictEqual(PC.angoliPerTipo(q, 'mc'), ['causa', 'esempio'], 'senza per-tipo valgono le globali');
    assert.strictEqual(PC.quantiPerTipo(q, 'open', 3), 4);
    assert.strictEqual(PC.quantiPerTipo(q, 'flashcards', 3), 3, 'fuori tetto → il fallback');
    assert.deepStrictEqual(PC.categoriePerTipo(q, 'open'), ['identita', 'critica']);
    assert.strictEqual(PC.categoriePerTipo(q, 'flashcards'), null, 'null = tutte');
});

test('estimateCalls: ogni angolo spuntato è una generazione in più', () => {
    const stats = { branches: 5, willGenerateMap: false };
    const solo = PC.estimateCalls({ quiz: { types: ['open', 'mc'] } }, stats);
    assert.strictEqual(solo.perStep.B, 10, '5 rami × 2 generi, nessun angolo spuntato');
    const sette = PC.estimateCalls({ quiz: { types: ['open', 'mc'], multi: ['open'], angoli: TUTTI } }, stats);
    assert.strictEqual(sette.perStep.B, 5 * (1 + 7), 'mc singolo + open per sette angoli');
    const due = PC.estimateCalls({ quiz: { types: ['open', 'mc'], multi: ['open', 'mc'], angoli: ['causa', 'esempio'] } }, stats);
    assert.strictEqual(due.perStep.B, 5 * 4, 'due angoli su due generi');
    const tutto = PC.estimateCalls({ quiz: { types: ['open', 'mc'], multi: ['open', 'mc'], angoli: TUTTI } }, stats);
    assert.strictEqual(tutto.perStep.B, 5 * 14, 'il default: due generi per sette angoli');
});

test('preset: generi e angoli sopravvivono al round-trip, filtrati', () => {
    const o = PC.presetFromConfig({ quiz: { types: ['open', 'mc'], perBranch: 5, angle: 'auto', multi: ['open'], angoli: ['causa'] } });
    assert.deepStrictEqual(o.quiz.multi, ['open']);
    assert.deepStrictEqual(o.quiz.angoli, ['causa']);
    const n = PC.presetNormalize({ name: 'X', options: { quiz: { types: ['open'], multi: ['open', 'mc', 'bogus'], angoli: ['causa', 'bogus'] } } });
    assert.deepStrictEqual(n.options.quiz.multi, ['open'],
        'un preset che chiede più set per un genere non spuntato chiede una generazione che non avverrà');
    assert.deepStrictEqual(n.options.quiz.angoli, ['causa']);
});

// ══ POST-PRODUZIONE QUIZ (11/9/26) ═════════════════════════════════════
// Difetto misurato: 56 risposte esatte su 84 in seconda posizione, 12 su 12
// in un foglio; e domande costruite su fatti assenti dal materiale.

const setMC = [
  { q: 'D1', options: ['a', 'b', 'c'], correct: 'b' },
  { q: 'D2', options: ['d', 'e', 'f'], correct: 'e' },
  { q: 'D3', options: ['g', 'h', 'i'], correct: 'h' },
  { q: 'D4', options: ['l', 'm', 'n'], correct: 'm' },
  { q: 'D5', options: ['o', 'p', 'q'], correct: 'p' },
  { q: 'D6', options: ['r', 's', 't'], correct: 's' }
];

test('mescolaOpzioni: la risposta resta la stessa, la posizione cambia', () => {
  const out = PC.mescolaOpzioni(setMC, 'set_abc');
  assert.strictEqual(out.length, setMC.length);
  out.forEach((it, i) => {
    assert.strictEqual(it.correct, setMC[i].correct, 'la risposta esatta non cambia mai');
    assert.deepStrictEqual([...it.options].sort(), [...setMC[i].options].sort(), 'stesse opzioni');
    assert.strictEqual(it.options[it.correctIndex], it.correct, 'l\'indice punta alla risposta');
  });
  const prima = PC.posizioniCorrette(setMC);
  const dopo = PC.posizioniCorrette(out);
  assert.strictEqual(prima.maxQuota, 1, 'in partenza erano tutte in seconda posizione');
  assert.ok(dopo.maxQuota < 1, 'dopo il mescolamento non più');
});

test('mescolaOpzioni: stesso seme, stesso foglio (ristampabile)', () => {
  const a = PC.mescolaOpzioni(setMC, 'set_abc');
  const b = PC.mescolaOpzioni(setMC, 'set_abc');
  const c = PC.mescolaOpzioni(setMC, 'set_xyz');
  assert.deepStrictEqual(a, b, 'ristampare dà lo stesso ordine');
  assert.notDeepStrictEqual(a.map(x => x.options), c.map(x => x.options), 'un altro set no');
});

test('mescolaOpzioni: forma a tre campi (a1/a2/a3 + indice 1-based)', () => {
  const items = [{ q: 'D', a1: 'uno', a2: 'due', a3: 'tre', correct: 2 }];
  const out = PC.mescolaOpzioni(items, 's');
  const opts = [out[0].a1, out[0].a2, out[0].a3];
  assert.strictEqual(opts[out[0].correct - 1], 'due', 'l\'indice segue la risposta');
  assert.deepStrictEqual([...opts].sort(), ['due', 'tre', 'uno']);
});

test('mescolaOpzioni: chiave non riconoscibile → item intatto', () => {
  const items = [{ q: 'D', options: ['a', 'b'], correct: 'zzz' }];
  const out = PC.mescolaOpzioni(items, 's');
  assert.deepStrictEqual(out[0], items[0], 'meglio non toccarlo che romperlo');
});

test('posizioniCorrette: legge testo, indice e lettera', () => {
  const r = PC.posizioniCorrette([
    { options: ['a', 'b', 'c'], correct: 'c' },
    { options: ['a', 'b', 'c'], correct: 2 },
    { options: ['a', 'b', 'c'], correct: 'B' },
    { options: ['a', 'b', 'c'], correct: '???' }
  ]);
  assert.strictEqual(r.tot, 3);
  assert.strictEqual(r.ignoti, 1);
  assert.strictEqual(r.pos[1], 2, 'due in seconda posizione (indice 1)');
});

test('corretteTroppoLunghe: segnala quando la risposta esatta è la più lunga', () => {
  const r = PC.corretteTroppoLunghe([
    { options: ['si', 'una risposta molto piu lunga delle altre', 'no'], correct: 'una risposta molto piu lunga delle altre' },
    { options: ['si', 'no', 'forse'], correct: 'no' }
  ]);
  assert.strictEqual(r.n, 1);
  assert.strictEqual(r.tot, 2);
});

test('verificaEvidenza: scarta la domanda costruita su un fatto assente', () => {
  const materiale = 'La Commissione Bergier pubblico il rapporto finale nel 2002 dopo anni di lavoro. ' +
    'La Banca Nazionale accettava oro tedesco e forniva valuta.';
  const items = [
    { q: 'Quando fu pubblicato il rapporto?', evidenza: 'La Commissione Bergier pubblico il rapporto finale nel 2002' },
    { q: 'Quando fu formata la Commissione?', evidenza: 'La Commissione Bergier fu formata nel 1996 con mandato parlamentare straordinario' }
  ];
  const r = PC.verificaEvidenza(items, materiale);
  assert.strictEqual(r.items.length, 1);
  assert.strictEqual(r.scartati.length, 1);
  assert.ok(/formata/.test(r.scartati[0].evidenza));
});

test('verificaEvidenza: senza il campo evidenza tiene tutto (retrocompatibile)', () => {
  const r = PC.verificaEvidenza([{ q: 'D' }, { q: 'E' }], 'qualunque materiale');
  assert.strictEqual(r.items.length, 2);
  assert.strictEqual(r.scartati.length, 0);
});
