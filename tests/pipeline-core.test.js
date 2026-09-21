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
/* Solo per COSTRUIRE un materiale vero nei casi degli identificatori (21/9/26):
   il formato degli id ha una fonte sola (evidence-core, invariante 6), e la
   regex di `idEvidenze` va misurata contro quella, non contro una riga scritta
   a mano nel test — che invecchierebbe per conto suo. Il core della pipeline
   NON dipende da questi due moduli: qui si leggono, di là no. */
const EC = require(path.join(__dirname, '..', 'public', 'js', 'mappai-evidence-core.js'));
const LS = require(path.join(__dirname, '..', 'public', 'js', 'mappai-local-search-core.js'));

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

// ══ GLI IDENTIFICATORI DELLA PROVA (21/9/26, passo 4 del piano Evidence) ═════
// Quando il materiale ELENCA le prove, la porta si rovescia: entra solo chi ne
// porta una, e la si verifica per uguaglianza. Il materiale qui sotto è quello
// vero, costruito dai due core che lo costruiscono nell'app.

const FRASI_FONTE = [
  'Un circuito e chiuso quando la corrente puo percorrere tutto il tragitto dal ' +
  'generatore al ricevitore e tornare indietro senza interruzioni.',
  'Puo anche capitare che un circuito sia perfettamente chiuso e collegato a dovere, ' +
  'e tuttavia la batteria cominci a riscaldarsi in modo anomalo.',
  'La resistenza di un conduttore si misura in ohm e cresce con la lunghezza del filo.'
];

function materialeConEvidenze() {
  const stato = {
    sources: [{ id: 'src-1', title: 'Elettricita.pdf', pages: [{ n: 4, text: FRASI_FONTE.join(' ') }] }],
    db: { nodes: [], links: [] }
  };
  const pacchetto = EC.costruisciPacchetto({
    records: LS.snapshot(stato).records, query: 'circuito chiuso corrente batteria'
  });
  return EC.materialeRamo({
    area: 'Elettricita', nodi: [{ label: 'Corto circuito' }], pacchetto: pacchetto
  }).materiale;
}

test('idEvidenze: gli id di un materiale vero, in ordine di comparsa e senza doppioni', () => {
  const m = materialeConEvidenze();
  const ids = PC.idEvidenze(m);
  assert.ok(ids.length >= 2, 'il materiale di prova porta almeno due evidenze');
  ids.forEach(x => assert.ok(/^ev-[0-9a-f]{16}-\d+$/.test(x), 'forma dell id: ' + x));
  let prec = -1;
  ids.forEach(x => { const i = m.indexOf('[[' + x + ']]'); assert.ok(i > prec, 'ordine di comparsa'); prec = i; });
  // lo stesso materiale due volte non raddoppia l'elenco
  assert.deepStrictEqual(PC.idEvidenze(m + '\n' + m), ids);
});

test('idEvidenze: vuoto, non stringa, o senza identificatori → elenco vuoto', () => {
  ['', 'AREA: Elettricita\nCONCETTI DEL RAMO: Corto circuito', null, undefined, 42, {},
    ['[[ev-626f5dbd6c6c4bff-206]]'],
    '[[ev-626f5dbd6c6c4b-206]]',      // 14 esadecimali: non è la forma
    '[[ev-NONESADECIMALE12-206]]',
    '[[ev-626f5dbd6c6c4bff]]'         // senza il numero dell'unità
  ].forEach(x => assert.deepStrictEqual(PC.idEvidenze(x), [], JSON.stringify(x)));
});

test('verificaEvidenza con id: tiene la domanda che porta un identificatore dell elenco', () => {
  const m = materialeConEvidenze();
  const ids = PC.idEvidenze(m);
  const r = PC.verificaEvidenza([
    { q: 'Quando un circuito e chiuso?', evidenzaId: ids[0] },
    { q: 'Perche la batteria si scalda?', evidenzaId: '[[' + ids[1] + ']]' },  // parentesi riportate: forma, non dato
    { q: 'In inglese il campo si chiama cosi', evidenceId: ids[0] }
  ], m);
  assert.strictEqual(r.items.length, 3);
  assert.strictEqual(r.scartati.length, 0);
});

test('verificaEvidenza con id: senza identificatore la domanda è scartata e contata', () => {
  const m = materialeConEvidenze();
  const r = PC.verificaEvidenza([
    { q: 'Domanda senza prova' },
    { q: 'Domanda con il campo vuoto', evidenzaId: '   ' }
  ], m);
  assert.strictEqual(r.items.length, 0);
  assert.strictEqual(r.scartati.length, 2);
  r.scartati.forEach(x => assert.strictEqual(x.motivo, 'id-assente'));
  assert.strictEqual(r.scartati[0].q, 'Domanda senza prova');
});

test('verificaEvidenza con id: un identificatore inventato non passa', () => {
  const m = materialeConEvidenze();
  const inventato = 'ev-0123456789abcdef-99';
  assert.strictEqual(m.indexOf(inventato), -1, 'l id inventato non sta nel materiale');
  const r = PC.verificaEvidenza([{ q: 'Domanda inventata', evidenzaId: inventato }], m);
  assert.strictEqual(r.items.length, 0);
  assert.strictEqual(r.scartati[0].motivo, 'id-sconosciuto');
  assert.strictEqual(r.scartati[0].evidenza, inventato);
});

test('verificaEvidenza con id: la frase copiata al posto dell identificatore è uno scarto a sé', () => {
  const m = materialeConEvidenze();
  const r = PC.verificaEvidenza([{ q: 'Quando un circuito e chiuso?', evidenza: FRASI_FONTE[0] }], m);
  assert.strictEqual(r.items.length, 0, 'la frase giusta senza id non basta più');
  assert.strictEqual(r.scartati.length, 1);
  assert.strictEqual(r.scartati[0].motivo, 'id-frase-copiata');
  assert.ok(/circuito e chiuso/.test(r.scartati[0].evidenza));
});

/* L'ARRAY `prove` (21/9, packet 0008). Le domande APERTE nascono dal materiale
   di due rami — il ramo e il suo compagno — e portano fino a due identificatori,
   uno per area. Basta che UNO sia nell'elenco perché la domanda risulti provata:
   pretenderli entrambi vorrebbe dire scartare ogni domanda che tocca un'area di
   cui la fonte parla poco, che è il contrario di ciò che si voleva. */

test('verificaEvidenza con id: nell array prove basta UN identificatore valido', () => {
  const m = materialeConEvidenze();
  const ids = PC.idEvidenze(m);
  const inventato = 'ev-0123456789abcdef-99';
  const r = PC.verificaEvidenza([
    { domanda: 'Due prove, una buona', prove: [ids[0], inventato] },
    { domanda: 'Due prove buone', prove: [ids[0], ids[1]] },
    { domanda: 'Una sola, buona', prove: [ids[1]] },
    { domanda: 'Con le parentesi riportate', prove: ['[[' + ids[0] + ']]'] }
  ], m);
  assert.strictEqual(r.items.length, 4, 'una prova valida basta');
  assert.strictEqual(r.scartati.length, 0);
});

test('verificaEvidenza con id: prove vuoto o tutto inventato non è una prova', () => {
  const m = materialeConEvidenze();
  const inventato = 'ev-0123456789abcdef-99';
  const r = PC.verificaEvidenza([
    { domanda: 'Array vuoto', prove: [] },
    { domanda: 'Solo invenzioni', prove: [inventato, 'ev-0123456789abcdef-98'] }
  ], m);
  assert.strictEqual(r.items.length, 0);
  assert.deepStrictEqual(r.scartati.map(x => x.motivo), ['id-assente', 'id-sconosciuto']);
  assert.strictEqual(r.scartati[0].q, 'Array vuoto', 'il testo della domanda aperta si legge');
  assert.ok(r.scartati[1].evidenza.indexOf(inventato) >= 0, 'lo scarto dice quali id erano');
});

/* IL FOGLIO OSSERVATO (21/9, packet 0008). Flashcard e domande aperte NON
   scartano: `verificaEvidenza` le conta e basta, e alla traccia arriva un foglio
   in cui `tenute` è lo stesso elenco di `ricevute` e `scartati` è vuoto. Il
   riassunto deve classificare ogni pezzo lo stesso — «con un identificatore
   valido» è il numero che porta il senso, e «scartate 0» è il disegno. */

test('riassuntoScarti: un foglio OSSERVATO (niente scartato) classifica lo stesso ogni pezzo', () => {
  const ID = (n) => 'ev-626f5dbd6c6c4bff-' + n;
  const carte = [
    { front: 'Con la prova', back: 'x', evidenzaId: ID(12) },
    { front: 'Senza la prova', back: 'y' }
  ];
  const r = PC.riassuntoScarti({
    interruttore: 'acceso', fogli: [{
      area: 'Corto circuito', tipo: 'Flashcard', ids: [ID(12), ID(13)],
      ricevute: carte, tenute: carte, scartati: []
    }]
  });
  const c = r.totali;
  assert.strictEqual(c.ricevute, 2);
  assert.strictEqual(c.tenute, 2, 'niente è stato tolto');
  assert.strictEqual(c.scartate, 0, 'zero scartate: la porta è aperta, non un punteggio pieno');
  assert.strictEqual(c.conId, 1, 'e il numero che conta esce giusto lo stesso');
  assert.strictEqual(c.prove.assente, 1);
  assert.deepStrictEqual(c.perMotivo, {});
  assert.strictEqual(c.idsServiti, 2);
  assert.strictEqual(c.idsUsati, 1, 'un identificatore su due ha prodotto una carta');
  assert.deepStrictEqual(r.fogli[0].tenute.map(t => t.q), ['Con la prova', 'Senza la prova'],
    'il fronte della carta è il suo testo');
});

test('riassuntoScarti: nel foglio osservato la prova può venire dall array delle aperte', () => {
  const ID = (n) => 'ev-626f5dbd6c6c4bff-' + n;
  const domande = [
    { question: 'Provata a meta', prove: ['ev-0123456789abcdef-99', ID(12)] },
    { question: 'Provata per la seconda area', prove: [ID(13)] },
    { question: 'Senza prova', prove: [] }
  ];
  const r = PC.riassuntoScarti({
    interruttore: 'acceso', fogli: [{
      area: 'Corto circuito', tipo: 'Domande aperte', ids: [ID(12), ID(13)],
      ricevute: domande, tenute: domande, scartati: []
    }]
  });
  assert.strictEqual(r.totali.ricevute, 3);
  assert.strictEqual(r.totali.conId, 2, 'un id valido basta, anche se non è il primo');
  assert.strictEqual(r.totali.prove.assente, 1);
  assert.strictEqual(r.totali.idsUsati, 2);
  assert.strictEqual(r.totali.scartate, 0);
});

test('verificaEvidenza senza id nel materiale: il contratto di oggi non cambia', () => {
  const materiale = 'La Commissione Bergier pubblico il rapporto finale nel 2002 dopo anni di lavoro.';
  const r = PC.verificaEvidenza([
    { q: 'Senza campo', evidenzaId: 'ev-0123456789abcdef-1' },   // l id qui non è una prova: nessuno lo elenca
    { q: 'Con la frase giusta', evidenza: 'La Commissione Bergier pubblico il rapporto finale nel 2002' },
    { q: 'Con una frase inventata', evidenza: 'La Commissione Bergier fu formata nel 1996 con mandato parlamentare straordinario' }
  ], materiale);
  assert.strictEqual(r.items.length, 2, 'passa chi non ha il campo e chi cita davvero');
  assert.strictEqual(r.scartati.length, 1);
  assert.strictEqual(r.scartati[0].motivo, undefined, 'la strada vecchia conta la quota, non il motivo');
  assert.ok(r.scartati[0].quota >= 0);
});

// ══ LA MISURA (21/9/26, passo 6) ═════════════════════════════════════════
// Il riassunto di un giro di domande e il confronto fra due giri. I dati che
// entrano sono quelli che l'unico punto di scarto ha in mano: le domande
// ricevute, quelle tenute, quelle scartate con il motivo che `_verificaPerId`
// ha già scritto, e gli identificatori che il materiale elencava.

const ID = (n) => 'ev-626f5dbd6c6c4bff-' + n;
const foglioAcceso = (area, extra) => Object.assign({
  area: area, tipo: 'Scelta Multipla', angolo: 'causa',
  ids: [ID(12), ID(13), ID(14)], caratteri: 4210, query: 'query del ramo', unitaScartate: 2,
  ricevute: [{ q: 'D1' }, { q: 'D2' }, { q: 'D3' }, { q: 'D4' }],
  tenute: [{ q: 'D1', evidenzaId: ID(12) }, { q: 'D2', evidenzaId: ID(12) }],
  scartati: [
    { q: 'D3', evidenza: '', motivo: 'id-assente' },
    { q: 'D4', evidenza: ID(99), motivo: 'id-sconosciuto' }
  ]
}, extra || {});
const foglioSpento = (area, extra) => Object.assign({
  area: area, tipo: 'Scelta Multipla', angolo: 'causa', ids: [], caratteri: 3120,
  ricevute: [{ q: 'D1' }, { q: 'D2' }, { q: 'D3' }],
  tenute: [{ q: 'D1', evidenza: 'una frase delle descrizioni' }, { q: 'D2' }],
  scartati: [{ q: 'D3', evidenza: 'una frase che nel materiale non c e', quota: 0.3 }]
}, extra || {});

test('riassuntoScarti: conta ricevute, tenute e scartate per motivo, e classifica la prova', () => {
  const r = PC.riassuntoScarti({
    runId: 'giro-1', progetto: 'Svizzera e 2a GM', interruttore: 'acceso',
    provider: 'infomaniak', modello: 'modello-finto', fogli: [foglioAcceso('Neutralità armata')]
  });
  assert.strictEqual(r.schema, PC.SCHEMA_MISURA);
  assert.strictEqual(r.interruttore, 'acceso');
  assert.strictEqual(r.progetto, 'Svizzera e 2a GM');
  const t = r.totali;
  assert.strictEqual(t.ricevute, 4);
  assert.strictEqual(t.tenute, 2);
  assert.strictEqual(t.scartate, 2);
  assert.strictEqual(t.conId, 2, 'le due tenute portano un id dell elenco');
  assert.deepStrictEqual(t.prove, { id: 2, frase: 0, assente: 0 });
  assert.deepStrictEqual(t.perMotivo, { 'id-assente': 1, 'id-sconosciuto': 1 });
  assert.strictEqual(t.idsServiti, 3);
  assert.strictEqual(t.idsUsati, 1, 'due domande sulla stessa evidenza usano UNA evidenza');
  assert.strictEqual(t.rami, 1);
  assert.strictEqual(t.fogli, 1);
  // la voce del foglio resta leggibile: chi è stato scartato, e perché
  assert.strictEqual(r.fogli[0].scartate[1].motivo, 'id-sconosciuto');
  assert.strictEqual(r.fogli[0].tenute[0].prova, 'id');
  assert.strictEqual(r.fogli[0].pacchetto.unitaScartate, 2);
});

test('riassuntoScarti: lo scarto della strada vecchia ha una chiave sua, e la prova è una frase', () => {
  const r = PC.riassuntoScarti({ interruttore: 'spento', fogli: [foglioSpento('Neutralità armata')] });
  assert.strictEqual(r.interruttore, 'spento');
  assert.strictEqual(r.totali.conId, 0, 'senza elenco nessuna domanda può portare un id');
  assert.deepStrictEqual(r.totali.prove, { id: 0, frase: 1, assente: 1 });
  assert.deepStrictEqual(r.totali.perMotivo, { [PC.MOTIVO_SOMIGLIANZA]: 1 });
  assert.strictEqual(r.totali.idsServiti, 0);
});

test('riassuntoScarti: due fogli dello stesso ramo fanno UN nodo, e gli id serviti non si contano due volte', () => {
  const r = PC.riassuntoScarti({
    interruttore: 'acceso',
    fogli: [foglioAcceso('Neutralità armata'), foglioAcceso('Neutralità armata', { tipo: 'Vero o Falso', angolo: 'effetto' })]
  });
  assert.strictEqual(r.nodi.length, 1);
  assert.strictEqual(r.nodi[0].fogli, 2);
  assert.deepStrictEqual(r.nodi[0].tipi, ['Scelta Multipla', 'Vero o Falso']);
  assert.strictEqual(r.nodi[0].conto.ricevute, 8);
  assert.strictEqual(r.nodi[0].conto.idsServiti, 3, 'i due fogli servono lo stesso pacchetto');
  assert.strictEqual(r.totali.fogli, 2);
  assert.strictEqual(r.totali.rami, 1);
});

test('riassuntoScarti: un giro vuoto o storto non lancia', () => {
  [undefined, null, {}, { fogli: null }, { fogli: [null, 42] }].forEach(x => {
    const r = PC.riassuntoScarti(x);
    assert.strictEqual(r.schema, PC.SCHEMA_MISURA);
    assert.strictEqual(r.totali.ricevute, 0);
  });
});

test('confrontaGiri: i due numeri sui soli nodi in comune, e gli altri dichiarati', () => {
  const spento = PC.riassuntoScarti({
    progetto: 'Svizzera e 2a GM', interruttore: 'spento', modello: 'stesso',
    fogli: [foglioSpento('Neutralità armata'), foglioSpento('Politica d asilo')]
  });
  const acceso = PC.riassuntoScarti({
    progetto: 'Svizzera e 2a GM', interruttore: 'acceso', modello: 'stesso',
    fogli: [foglioAcceso('Neutralità armata'), foglioAcceso('Oro della Reichsbank')]
  });
  const v = PC.confrontaGiri(spento, acceso);
  assert.strictEqual(v.comuni, 1);
  assert.deepStrictEqual(v.soloA, ['Politica d asilo']);
  assert.deepStrictEqual(v.soloB, ['Oro della Reichsbank']);
  // i totali NON comprendono i nodi fuori dal confronto
  assert.strictEqual(v.totali.a.ricevute, 3);
  assert.strictEqual(v.totali.b.ricevute, 4);
  assert.strictEqual(v.totali.a.conId, 0);
  assert.strictEqual(v.totali.b.conId, 2);
  assert.strictEqual(v.totali.a.perMotivo[PC.MOTIVO_SOMIGLIANZA], 1);
  assert.strictEqual(v.totali.b.perMotivo['id-assente'], 1);
  assert.strictEqual(v.totali.fedelta.a.quota, 0, 'spento nessuna prova si verifica per uguaglianza');
  assert.strictEqual(v.totali.fedelta.b.quota, 1);
  assert.strictEqual(v.totali.copertura.a.serviti, 0);
  assert.deepStrictEqual(v.totali.copertura.b, { usati: 1, serviti: 3, quota: Number((1 / 3).toFixed(3)) });
  assert.strictEqual(v.nodi[0].area, 'Neutralità armata');
  assert.deepStrictEqual(v.avvisi, [], 'niente da segnalare: stessa mappa, stesso modello, interruttori diversi');
});

test('confrontaGiri: l accento scomposto non fa perdere il nodo (trappola 25)', () => {
  const a = PC.riassuntoScarti({ interruttore: 'spento', fogli: [foglioSpento('Neutralità armata'.normalize('NFC'))] });
  const b = PC.riassuntoScarti({ interruttore: 'acceso', fogli: [foglioAcceso('Neutralità armata'.normalize('NFD'))] });
  const v = PC.confrontaGiri(a, b);
  assert.strictEqual(v.comuni, 1, 'NFC e NFD sono lo stesso nodo');
  assert.deepStrictEqual(v.soloA, []);
  assert.deepStrictEqual(v.soloB, []);
});

test('confrontaGiri: dice quando il confronto non misura ciò che sembra', () => {
  const a = PC.riassuntoScarti({ progetto: 'Mappa A', interruttore: 'acceso', modello: 'uno', fogli: [foglioAcceso('Ramo')] });
  const b = PC.riassuntoScarti({
    progetto: 'Mappa B', interruttore: 'acceso', modello: 'due',
    fogli: [foglioAcceso('Ramo'), foglioAcceso('Ramo', { tipo: 'Vero o Falso' })]
  });
  const detto = PC.confrontaGiri(a, b).avvisi.join(' | ');
  assert.match(detto, /stesso stato \(acceso\)/);
  assert.match(detto, /progetti diversi/);
  assert.match(detto, /modelli diversi/);
  assert.match(detto, /1 fogli nel primo giro e 2 nel secondo/);
});

test('confrontaGiri: senza nodi in comune lo dice invece di stampare zeri', () => {
  const a = PC.riassuntoScarti({ interruttore: 'spento', fogli: [foglioSpento('Uno')] });
  const b = PC.riassuntoScarti({ interruttore: 'acceso', fogli: [foglioAcceso('Due')] });
  const v = PC.confrontaGiri(a, b);
  assert.strictEqual(v.comuni, 0);
  assert.match(v.avvisi.join(' | '), /nessun nodo in comune/);
});

// ══ DOMANDE RIPETUTE · ETICHETTA «AVVIO» · CRITERI (11/9/26) ════════════
// Difetti 8, 9 e 10: tre domande su dodici sullo stesso fatto, l'etichetta
// dichiarata dal modello e mai verificata, la traccia in un blocco unico.

test('similitudine: riconosce due domande sullo stesso fatto, non due sul tema', () => {
  const a = 'Perché fu adottato il Piano Wahlen durante la guerra?';
  const b = 'Per quale motivo venne adottato il Piano Wahlen nella guerra?';
  const c = 'Che cosa prevedeva il razionamento alimentare?';
  assert.ok(PC.similitudine(a, b) > 0.7, 'stessa domanda riformulata');
  assert.ok(PC.similitudine(a, c) < 0.3, 'domanda diversa sullo stesso tema');
  assert.strictEqual(PC.similitudine('', 'qualcosa'), 0);
});

/* Il confine che conta davvero: i sette angoli chiedono la stessa cosa da tagli
   diversi, e quella ripetizione è voluta. Se la soglia la mangiasse, il
   programma cancellerebbe proprio ciò che deve produrre. */
test('deduplicaDomande: definizione e causa sullo stesso tema NON sono doppioni', () => {
  const items = [
    { q: 'Che cos\'è il razionamento alimentare?' },
    { q: 'Perché fu introdotto il razionamento alimentare?' }
  ];
  assert.ok(PC.similitudine(items[0].q, items[1].q) > 0.6, 'si somigliano parecchio…');
  assert.strictEqual(PC.deduplicaDomande(items).items.length, 2, '…ma restano due domande');
});

test('deduplicaDomande: toglie la ripetizione dentro il foglio, tiene la prima', () => {
  const items = [
    { q: 'Perché fu adottato il Piano Wahlen durante la guerra?' },
    { q: 'Che cosa prevedeva il razionamento alimentare in Svizzera?' },
    { q: 'Per quale motivo venne adottato il Piano Wahlen nella guerra?' }
  ];
  const r = PC.deduplicaDomande(items);
  assert.strictEqual(r.items.length, 2);
  assert.strictEqual(r.items[0].q, items[0].q, 'resta la prima, non l\'ultima');
  assert.strictEqual(r.scartati.length, 1);
});

test('deduplicaDomande: toglie anche la domanda già fatta in un altro foglio', () => {
  const gia = ['Perché la Svizzera accettò l\'oro tedesco durante il conflitto?'];
  const items = [
    { q: 'Per quale ragione la Svizzera accettò oro tedesco nel conflitto?' },
    { q: 'Quali erano i compiti della commissione Bergier?' }
  ];
  const r = PC.deduplicaDomande(items, { gia });
  assert.strictEqual(r.items.length, 1);
  assert.ok(/Bergier/.test(r.items[0].q));
});

test('deduplicaDomande: senza domande precedenti e senza ripetizioni non tocca nulla', () => {
  const items = [{ q: 'Prima domanda sulla neutralità armata svizzera.' }, { q: 'Seconda domanda sul razionamento del pane.' }];
  assert.strictEqual(PC.deduplicaDomande(items).items.length, 2);
});

test('livelloVerificato: due macro-aree nominate → ponte, anche se dichiarata avvio', () => {
  const et = ['Economia di Guerra', 'Politica dei Profughi', 'Difesa Militare'];
  const due = { domanda: 'Spiega come l\'economia di guerra influenzò la politica dei profughi.' };
  assert.strictEqual(PC.livelloVerificato(due, et, 'base'), 'ponte', 'la conta scavalca la dichiarazione');
});

test('livelloVerificato: una sola area → avvio, anche se dichiarata ponte', () => {
  const et = ['Economia di Guerra', 'Politica dei Profughi'];
  const una = { domanda: 'Che cosa comprendeva l\'economia di guerra svizzera?' };
  assert.strictEqual(PC.livelloVerificato(una, et, 'ponte'), 'base');
});

test('livelloVerificato: un verbo di confronto basta a fare ponte', () => {
  const et = ['Economia di Guerra'];
  const q = { domanda: 'Confronta il razionamento e la campicoltura: che cosa cambia?' };
  assert.strictEqual(PC.livelloVerificato(q, et, 'base'), 'ponte');
});

test('livelloVerificato: nessuna etichetta riconosciuta → resta la dichiarazione', () => {
  const et = ['Economia di Guerra'];
  const q = { domanda: 'Descrivi un episodio significativo avvenuto nel periodo.' };
  assert.strictEqual(PC.livelloVerificato(q, et, 'base'), 'base');
  assert.strictEqual(PC.livelloVerificato(q, et, 'ponte'), 'ponte');
  assert.strictEqual(PC.livelloVerificato({ domanda: '' }, et, 'base'), 'base');
});

test('criteriDaItem: usa i criteri quando ci sono', () => {
  const c = PC.criteriDaItem({ criteri: ['Cita il piano Wahlen', 'Collega la campicoltura al cibo', '  '] });
  assert.deepStrictEqual(c, ['Cita il piano Wahlen', 'Collega la campicoltura al cibo']);
});

test('criteriDaItem: senza criteri spezza la traccia nelle sue frasi', () => {
  const c = PC.criteriDaItem({ guide: 'Deve citare il piano Wahlen. Deve collegarlo alla scarsità di cibo.' });
  assert.strictEqual(c.length, 2);
  assert.ok(/Wahlen/.test(c[0]) && /cibo/.test(c[1]));
});

test('criteriDaItem: una traccia di una frase dà un criterio solo, e va bene', () => {
  assert.strictEqual(PC.criteriDaItem({ guide: 'Deve spiegare che cosa fu la mobilitazione generale.' }).length, 1);
  assert.deepStrictEqual(PC.criteriDaItem({}), []);
  assert.deepStrictEqual(PC.criteriDaItem(null), []);
});

// ══ LA LUNGHEZZA DELLA RISPOSTA GIUSTA (12/9/26) ════════════════════════
// Misurato su 126 domande vere: la risposta esatta è la più lunga nel 55% dei
// casi, quando per caso sarebbe un terzo. Il margine mediano è però del 3%,
// quindi non si scarta e non si accorcia: si misura, e si corregge nel prompt.

test('corretteTroppoLunghe: misura la quota E il caso con cui va confrontata', () => {
  const tre = (a, b, c, giusta) => ({ options: [a, b, c], correct: giusta });
  const r = PC.corretteTroppoLunghe([
    tre('si', 'una risposta molto piu lunga delle altre due', 'no', 'una risposta molto piu lunga delle altre due'),
    tre('si', 'no', 'forse', 'no'),
    tre('alfa', 'beta', 'gamma', 'beta')
  ]);
  assert.strictEqual(r.n, 1);
  assert.strictEqual(r.tot, 3);
  assert.ok(Math.abs(r.atteso - 1 / 3) < 0.001, 'con tre opzioni il caso vale un terzo');
});

test('corretteTroppoLunghe: il margine mediano dice quanto è marcato il difetto', () => {
  const pari = PC.corretteTroppoLunghe([
    { options: ['dodici car.', 'dodici car.', 'dodici car.'], correct: 'dodici car.' }
  ]);
  assert.ok(Math.abs(pari.margineMediano - 1) < 0.001, 'opzioni della stessa misura → margine 1');
  const sbilanciato = PC.corretteTroppoLunghe([
    { options: ['no', 'una risposta lunga il doppio abbondante', 'si'], correct: 'una risposta lunga il doppio abbondante' }
  ]);
  assert.ok(sbilanciato.margineMediano > 2, 'qui il difetto si vede a occhio');
});

test('corretteTroppoLunghe: senza item riconoscibili non inventa numeri', () => {
  const r = PC.corretteTroppoLunghe([{ options: ['a', 'b'], correct: 'zzz' }, {}]);
  assert.strictEqual(r.tot, 0);
  assert.strictEqual(r.quota, 0);
  assert.strictEqual(r.margineMediano, 1);
});

// ── IL BUDGET DALLA FONTE (16/9/2026) ───────────────────────────────────────
// La prova che conta non è un caso inventato: è che la funzione classifichi i
// TRE PROGETTI VERI come sono stati misurati sui loro dati.
// Formula verificata su di essi: rami × per-ramo × (tipi singoli + tipi × angoli).

const quiz7 = (perBranch) => ({ quiz: { types: ['mc', 'open'], perBranch,
  multi: ['mc', 'open'], angoli: ['definizione', 'causa', 'conseguenza', 'esempio', 'confronto', 'eccezione', 'applicazione'] } });

test('budget: Officina Elettrica — 120 frasi di contenuto, 16 domande → sostenibile', () => {
  const b = PC.budgetDallaFonte(
    { quiz: { types: ['mc', 'open'], perBranch: 1, multi: [], angoli: [] } },
    { branches: 8, nodes: 53 }, { frasi: 120 });
  assert.strictEqual(b.domande, 16);
  assert.strictEqual(b.verdetto, 'ok');
  assert.ok(b.frasiPerDomanda >= 7, `7,5 frasi per domanda, non ${b.frasiPerDomanda}`);
});

test('budget: Officina Project E — 120 frasi, 168 domande → eccessivo', () => {
  const b = PC.budgetDallaFonte(quiz7(2), { branches: 6, nodes: 53 }, { frasi: 120 });
  assert.strictEqual(b.domande, 168, 'la formula deve riprodurre il numero vero');
  assert.strictEqual(b.verdetto, 'eccessivo');
  assert.ok(b.frasiPerDomanda < 1.5);
});

test('budget: Svizzera e 2a GM — 47 frasi, 252 domande → il caso peggiore', () => {
  const b = PC.budgetDallaFonte(quiz7(3), { branches: 6, nodes: 46 }, { frasi: 47 });
  assert.strictEqual(b.verdetto, 'eccessivo');
  assert.ok(b.frasiPerDomanda < 0.3, `${b.frasiPerDomanda} domande per frase`);
  // 47 frasi ne reggono 15, non 252
  assert.strictEqual(b.tetto, 15);
});

test('budget: la leva proposta sono gli ANGOLI, non la copertura dei rami', () => {
  const b = PC.budgetDallaFonte(quiz7(2), { branches: 6, nodes: 53 }, { frasi: 120 });
  assert.ok(b.angoliConsigliati < 7, 'deve proporre meno angoli');
  assert.ok(b.angoliConsigliati >= 1, 'mai zero: si genera comunque qualcosa');
  // con gli angoli consigliati si sta sotto il tetto
  const dopo = 6 * 2 * (0 + 2 * b.angoliConsigliati);
  assert.ok(dopo <= b.tetto, `${dopo} domande contro un tetto di ${b.tetto}`);
});

test('budget: quando gli angoli non bastano, scende il per-ramo', () => {
  // fonte piccolissima: anche un angolo solo produce troppo
  const b = PC.budgetDallaFonte(quiz7(5), { branches: 8, nodes: 40 }, { frasi: 20 });
  assert.strictEqual(b.angoliConsigliati, 1);
  assert.ok(b.perRamoConsigliato < 5, 'deve scendere anche il per-ramo');
  assert.strictEqual(b.bastanoGliAngoli, false);
});

test('budget: il verdetto guarda le DOMANDE, non il foglio dei nodi', () => {
  // il foglio dei nodi è 1:1 con la mappa: 53 fogli non competono per la materia
  const soloFogli = PC.budgetDallaFonte({ nodesheet: { modes: ['card'] } },
    { branches: 6, nodes: 53 }, { frasi: 47 });
  assert.strictEqual(soloFogli.verdetto, 'ok');
  assert.strictEqual(soloFogli.domande, 0);
  assert.strictEqual(soloFogli.altri, 53, 'si contano lo stesso, per dire la massa');
});

test('budget: senza fonte misurata non inventa un verdetto', () => {
  const b = PC.budgetDallaFonte(quiz7(3), { branches: 6, nodes: 46 }, {});
  assert.strictEqual(b.verdetto, 'sconosciuto');
  assert.strictEqual(b.frasiPerDomanda, null);
  assert.strictEqual(b.tetto, 0);
});

test('budget: senza quiz non c\'e niente da limitare', () => {
  const b = PC.budgetDallaFonte({}, { branches: 6, nodes: 46 }, { frasi: 47 });
  assert.strictEqual(b.domande, 0);
  assert.strictEqual(b.verdetto, 'ok');
});
