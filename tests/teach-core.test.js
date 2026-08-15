'use strict';
/*
 * teach-core.test.js — logica pura landing "Insegna", headless (node --test)
 * Copre: normGrade (equivalenze tipografiche), registryAdd (cap+immutabilità),
 * classesForMap (dedup, legacy), rankMapsForClass (3 fasce, mai vuoto),
 * buildSetsIndex (merge per projectId), filterByClass (attiva/Generico/null).
 */
const { test } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const TC = require(path.join(__dirname, '..', 'public', 'js', 'mappai-teach-core.js'));

// ── normGrade ──────────────────────────────────────────────────────────────
test('normGrade: equivalenze tipografiche', () => {
  assert.strictEqual(TC.normGrade('1ª  Media'), TC.normGrade('1a media'));
  assert.strictEqual(TC.normGrade('2ª A'), TC.normGrade('2a A'));
  assert.strictEqual(TC.normGrade('  3ª Liceo '), TC.normGrade('3a liceo'));
  assert.strictEqual(TC.normGrade(null), '');
  assert.strictEqual(TC.normGrade(undefined), '');
  // gradi diversi NON collidono
  assert.notStrictEqual(TC.normGrade('1a media'), TC.normGrade('2a media'));
});

test('normGrade: diacritici', () => {
  // à/è normalizzati coerentemente (usato per confronti, non per display)
  assert.strictEqual(TC.normGrade('École'), TC.normGrade('ecole'));
});

// ── registryAdd ──────────────────────────────────────────────────────────────
test('registryAdd: inserisce in testa, non muta input, cap FIFO', () => {
  const reg0 = [];
  const reg1 = TC.registryAdd(reg0, { map: 'A', cls: '1A', activity: 'lavagna', date: 1 });
  assert.strictEqual(reg0.length, 0);          // input non mutato
  assert.strictEqual(reg1.length, 1);
  assert.strictEqual(reg1[0].map, 'A');
  const reg2 = TC.registryAdd(reg1, { map: 'B', cls: '2A', activity: 'live', date: 2 });
  assert.strictEqual(reg2[0].map, 'B');        // più recente in testa
  assert.strictEqual(reg2[1].map, 'A');
});

test('registryAdd: cap rispettato', () => {
  let reg = [];
  for (let i = 0; i < 10; i++) reg = TC.registryAdd(reg, { map: 'M' + i, activity: 'x' }, 5);
  assert.strictEqual(reg.length, 5);
  assert.strictEqual(reg[0].map, 'M9');        // ultimo inserito
});

test('registryAdd: normalizza campi mancanti', () => {
  const reg = TC.registryAdd([], { map: 'A', activity: 'lavagna' });
  assert.strictEqual(reg[0].cls, null);
  assert.strictEqual(reg[0].projectId, null);
  assert.strictEqual(reg[0].date, 0);
});

// ── classesForMap ────────────────────────────────────────────────────────────
test('classesForMap: dedup, ignora cls null, match per projectId poi map', () => {
  const reg = [
    { map: 'Fotosintesi', projectId: 'p1', cls: '1A', activity: 'lavagna' },
    { map: 'Fotosintesi', projectId: 'p1', cls: '1A', activity: 'live' },   // dup
    { map: 'Fotosintesi', projectId: 'p1', cls: '2B', activity: 'live' },
    { map: 'Fotosintesi', projectId: 'p1', cls: null, activity: 'materiali' }, // ignorata
    { map: 'Altro', projectId: 'p2', cls: '3C', activity: 'lavagna' }
  ];
  const chips = TC.classesForMap(reg, { projectId: 'p1', map: 'Fotosintesi' });
  assert.deepStrictEqual(chips, ['1A', '2B']);
});

test('classesForMap: legacy senza projectId → match per nome mappa', () => {
  const reg = [{ map: 'Storia', cls: '4D', activity: 'lavagna' }];
  const chips = TC.classesForMap(reg, { map: 'Storia' });
  assert.deepStrictEqual(chips, ['4D']);
  assert.deepStrictEqual(TC.classesForMap(reg, { map: 'Altra' }), []);
});

// ── rankMapsForClass ─────────────────────────────────────────────────────────
test('rankMapsForClass: 3 fasce, totale = tutti i progetti', () => {
  const projects = [
    { id: 'p1', name: 'A', grade: '1ª media' },
    { id: 'p2', name: 'B', grade: '1a media' },   // stesso grade tipograficamente
    { id: 'p3', name: 'C', grade: '3a liceo' },
    { id: 'p4', name: 'D' }                        // senza grade → others
  ];
  const reg = [{ projectId: 'p1', map: 'A', cls: '1A', activity: 'lavagna' }];
  const r = TC.rankMapsForClass(projects, reg, { name: '1A', grade: '1a media' });
  assert.deepStrictEqual(r.started.map(p => p.id), ['p1']);
  assert.deepStrictEqual(r.sameGrade.map(p => p.id), ['p2']);   // non-started, grade uguale
  assert.deepStrictEqual(r.others.map(p => p.id), ['p4']);      // senza grade → generica
  assert.deepStrictEqual(r.otherGrade.map(p => p.id), ['p3']);  // grade di altra classe
  assert.strictEqual(r.started.length + r.sameGrade.length + r.others.length + r.otherGrade.length, 4);
});

test('rankMapsForClass: nessun grade classe → started + others', () => {
  const projects = [{ id: 'p1', name: 'A', grade: '1a media' }, { id: 'p2', name: 'B' }];
  const r = TC.rankMapsForClass(projects, [], { name: 'X' });
  assert.strictEqual(r.started.length, 0);
  assert.strictEqual(r.sameGrade.length, 0);
  assert.strictEqual(r.others.length, 2);
});

test('rankMapsForClass: started per nome mappa (progetto senza id nel registro)', () => {
  const projects = [{ id: 'p1', name: 'Fotosintesi', grade: '2a' }];
  const reg = [{ map: 'Fotosintesi', cls: '2A', activity: 'lavagna' }];
  const r = TC.rankMapsForClass(projects, reg, { name: '2A', grade: '2a' });
  assert.strictEqual(r.started.length, 1);
});

// ── buildSetsIndex ───────────────────────────────────────────────────────────
test('buildSetsIndex: sostituisce le voci del projectId, preserva le altre', () => {
  const prev = [
    { projectId: 'p1', setId: 's-old', name: 'Vecchio', type: 'quiz' },
    { projectId: 'p2', setId: 's-keep', name: 'Altro', type: 'flashcards' }
  ];
  const sets = [
    { id: 's1', name: 'Quiz cellula', type: 'quiz' },
    { id: 's2', type: 'flashcards', cards: [] }
  ];
  const idx = TC.buildSetsIndex(prev, 'p1', 'Bio', '1A', sets);
  // p2 preservato
  assert.ok(idx.some(e => e.setId === 's-keep'));
  // p1 vecchio rimosso
  assert.ok(!idx.some(e => e.setId === 's-old'));
  // p1 nuovi presenti
  const p1 = idx.filter(e => e.projectId === 'p1');
  assert.strictEqual(p1.length, 2);
  assert.strictEqual(p1[0].name, 'Quiz cellula');
  assert.strictEqual(p1[0].mapName, 'Bio');
  assert.strictEqual(p1[0].cls, '1A');
});

test('buildSetsIndex: inferenza tipo da cards, nome di fallback', () => {
  const idx = TC.buildSetsIndex([], 'p1', 'M', null, [{ id: 'x', cards: [1] }]);
  assert.strictEqual(idx[0].type, 'flashcards');
  assert.ok(idx[0].name); // nome mai vuoto
});

// ── filterByClass ────────────────────────────────────────────────────────────
test('filterByClass: match per cls, registro o grade', () => {
  const items = [
    { id: 'a', cls: '1A' },                       // match diretto per nome
    { id: 'b', projectId: 'p9' },                 // match via registro
    { id: 'c', grade: '1a media' },               // match via grade
    { id: 'd', cls: '9Z', grade: '5a' }           // nessun match
  ];
  const reg = [{ projectId: 'p9', map: 'X', cls: '1A', activity: 'lavagna' }];
  const out = TC.filterByClass(items, { name: '1A', grade: '1ª media' }, reg, []);
  assert.deepStrictEqual(out.map(i => i.id).sort(), ['a', 'b', 'c']);
});

test('filterByClass: classe attiva null o senza nome → invariato', () => {
  const items = [{ id: 'a' }, { id: 'b' }];
  assert.strictEqual(TC.filterByClass(items, null, [], []).length, 2);
  assert.strictEqual(TC.filterByClass(items, { name: '' }, [], []).length, 2);
});

test('filterByClass: match via mapName (documenti/set)', () => {
  const items = [{ id: 'doc1', mapName: 'Storia' }];
  const reg = [{ map: 'Storia', cls: '4D', activity: 'materiali' }];
  const out = TC.filterByClass(items, { name: '4D' }, reg, []);
  assert.strictEqual(out.length, 1);
});

// ── matchesSelectedProject (011/US5) ──────────────────────────────────────
test('matchesSelectedProject: sel null → tutto passa', () => {
  assert.strictEqual(TC.matchesSelectedProject({ mapName: 'X' }, null), true);
  assert.strictEqual(TC.matchesSelectedProject({ mapName: 'X' }, { id: null, name: null }), true);
});

test('matchesSelectedProject: match per projectId poi mapName', () => {
  const sel = { id: 'p1', name: 'Fotosintesi' };
  assert.strictEqual(TC.matchesSelectedProject({ projectId: 'p1' }, sel), true);   // per id
  assert.strictEqual(TC.matchesSelectedProject({ mapName: 'Fotosintesi' }, sel), true); // per nome mappa
  assert.strictEqual(TC.matchesSelectedProject({ map: 'Fotosintesi' }, sel), true);     // campo map
  assert.strictEqual(TC.matchesSelectedProject({ projectId: 'p2', mapName: 'Altro' }, sel), false);
  assert.strictEqual(TC.matchesSelectedProject({}, sel), false);   // legacy senza metadato → escluso con selezione
  assert.strictEqual(TC.matchesSelectedProject(null, sel), false);
});

/* ── UN DOCUMENTO, UNA RIGA (11/8/26) ────────────────────────────────────────
   In INSEGNA l'archivio e la cartella si mostrano insieme — è lo scopo della
   console. Ma lo STESSO documento può stare in tutti e due (il foglio dei nodi
   rivisto viene archiviato come PDF *e* scritto nel vault), e uscivano due
   righe: una col nome del file e i suoi comandi, l'altra col titolo
   dell'archivio e NESSUN comando. La chiave qui sotto è ciò che le riconosce
   come la stessa cosa: due grafie, un documento. */
const _teachSrc = require('fs').readFileSync(
    require('path').join(__dirname, '..', 'public/js/mappai-landing-teach.js'), 'utf8');
const _chiaveDoc = new Function(
    _teachSrc.slice(_teachSrc.indexOf('function _chiaveDoc'),
        _teachSrc.indexOf('/* I materiali di UNA mappa')) + '; return _chiaveDoc;')();

test('_chiaveDoc: archivio e disco collassano sullo stesso documento', () => {
    assert.strictEqual(
        _chiaveDoc('Foglio nodi — La Politica Svizzera (rivisto)', 'Foglio nodi'),
        _chiaveDoc('Foglio-nodi-La Politica Svizzera (rivisto).pdf', 'Foglio nodi'),
        'lineetta lunga, trattini ed estensione non fanno due documenti');
    assert.strictEqual(
        _chiaveDoc('Sintesi — Il Clima', 'Sintesi'),
        _chiaveDoc('Sintesi-Il Clima.html', 'Sintesi'));
});

test('_chiaveDoc: il GENERE è la rete contro i falsi positivi', () => {
    /* Senza il genere nella chiave, due documenti con un titolo simile si
       nasconderebbero a vicenda — e in INSEGNA sparire è peggio che comparire
       due volte. */
    assert.notStrictEqual(
        _chiaveDoc('Il Clima', 'Quiz MC'),
        _chiaveDoc('Il Clima', 'Sintesi'));
    // e due rese diverse dello stesso genere restano documenti diversi
    assert.notStrictEqual(
        _chiaveDoc('Foglio nodi — Mappa (rivisto)', 'Foglio nodi'),
        _chiaveDoc('Foglio-nodi-Mappa-card.pdf', 'Foglio nodi'));
});

// ── progettoDelVault: l'adozione dell'identità (15/8) ────────────────────────
test('progettoDelVault: la posizione esatta vince, e a parità vince la più recente', () => {
    const P = [
        { id: 'a', vault: 'Il Clima', classDir: '4R', discDir: 'Geografia', date: 10 },
        { id: 'b', vault: 'Il Clima', classDir: '4R', discDir: 'Geografia', date: 20 },
        { id: 'c', vault: 'Il Clima', classDir: null, discDir: null, date: 99 },
    ];
    const hit = TC.progettoDelVault(P, { vault: 'Il Clima', classDir: '4R', discDir: 'Geografia' });
    assert.strictEqual(hit.id, 'b', 'stessa posizione, data più alta');
    // vault flat: la voce senza classe, non la gemella di 4R
    assert.strictEqual(TC.progettoDelVault(P, { vault: 'Il Clima' }).id, 'c');
});

test('progettoDelVault: NFC — il nome del filesystem (NFD) trova la voce nata in appState (NFC)', () => {
    /* macOS scrive gli accenti scomposti nei nomi di cartella; appState li ha
       composti. Senza normalizzazione il filtro rispondeva ZERO sui dati veri
       (0 contro 13 voci per «Elettricità - KG»). */
    const nfd = 'Elettricità - KG'.normalize('NFD');
    const P = [{ id: 'x', vault: 'Elettricità - KG'.normalize('NFC'), classDir: '4R', discDir: 'Scienze', date: 1 }];
    const hit = TC.progettoDelVault(P, { vault: nfd, classDir: '4R', discDir: 'Scienze' });
    assert.ok(hit && hit.id === 'x');
});

test('progettoDelVault: voce pre-disciplina (classDir sì, discDir no) e ripiego sul solo nome', () => {
    const P = [
        { id: 'vecchia', vault: 'La Carta', classDir: '2A', discDir: null, date: 5 },
        { id: 'altra', vault: 'La Carta', classDir: '1B', discDir: 'Storia', date: 9 },
    ];
    // vault ora annidato a 3 livelli, la voce è di prima del livello disciplina
    assert.strictEqual(TC.progettoDelVault(P, { vault: 'La Carta', classDir: '2A', discDir: 'Storia' }).id, 'vecchia');
    // posizione mai vista → il solo nome, la più recente
    assert.strictEqual(TC.progettoDelVault(P, { vault: 'La Carta', classDir: '9Z', discDir: 'Arte' }).id, 'altra');
    assert.strictEqual(TC.progettoDelVault(P, { vault: 'Mai vista' }), null);
});

// ── vociDaPotare: i doppioni da liberare quando lo spazio finisce ────────────
test('vociDaPotare: tiene le keep più recenti per mappa, mai la voce protetta', () => {
    const P = [
        { id: 'a1', vault: 'Il Clima', date: 1 }, { id: 'a2', vault: 'Il Clima', date: 2 },
        { id: 'a3', vault: 'Il Clima', date: 3 },
        { id: 'b1', vault: 'La Carta', date: 1 },
    ];
    assert.deepStrictEqual(TC.vociDaPotare(P, 1).sort(), ['a1', 'a2']);
    assert.deepStrictEqual(TC.vociDaPotare(P, 2), ['a1']);
    // la voce che si sta salvando non si pota nemmeno se è la più vecchia
    assert.deepStrictEqual(TC.vociDaPotare(P, 1, 'a1'), ['a2']);
    // NFC anche qui: le due forme dello stesso nome sono UN gruppo
    const Q = [
        { id: 'n1', vault: 'Présent'.normalize('NFC'), date: 1 },
        { id: 'n2', vault: 'Présent'.normalize('NFD'), date: 2 },
    ];
    assert.deepStrictEqual(TC.vociDaPotare(Q, 1), ['n1']);
});
