'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const copy = value => JSON.parse(JSON.stringify(value));
const scripts = {
    regenerate: 'mappai-flashcards-sr.js',   // node e branch (flashcard del nodo e del ramo) sono usciti il 12/10/2026 (0087, lotto 10-modali)
    synthesis: 'mappai-branch-synthesis.js'
};
function fixture(entry, { allowed = false, fallback = false, absent = false } = {}) {
    const calls = { guard: 0, approved: 0, api: 0, key: 0, dom: 0, close: 0, player: 0, confirm: 0 };
    const old = [{ q: 'Domanda già esistente', a1: 'A', a2: 'B', a3: 'C', correct: 1 }];
    const node = { id: 'n', label: 'Oro', desc: 'La Germania riceve valuta.', flashcardTest: copy(old) };
    const set = { id: 'saved', mode: 'quiz', title: 'Già disponibile', items: copy(old), material: node.desc };
    const state = { db: { nodes: [node], links: [], studySets: [set] } };
    const review = { async requireApproved() { calls.approved++; return fallback ? allowed : true; } };
    if (!fallback) review.requireStandalone = async function () { assert.equal(this, review); calls.guard++; return allowed; };
    const win = {
        MappAIReview: absent ? undefined : review,
        getSystemKey: () => { calls.key++; return 'mock-key'; },
        mappaiOccupato: () => false,
        fillPromptTemplate: () => 'Genera domande dal testo.',
        injectClassTuning: p => p,
        fetchModelAPI: async () => { calls.api++; return { candidates: [{ content: { parts: [{ text: JSON.stringify([{ q: 'Nuova domanda', a1: 'X', a2: 'Y', a3: 'Z', correct: 1 }]) }] } }] }; },
        showToast() {}, showAlert(_title, error) { throw new Error(error); }, showLoadingOverlay() {},
        t: (_key, value) => value
    };
    const sandbox = {
        window: win, appState: state, MARKER_JSON: '```json', MARKER_END: '```',
        salvageTruncatedJSON: require('../public/js/mappai-json-salvage.js').salvage,
        confirm: () => { calls.confirm++; return true; }, setTimeout, clearTimeout,
        console: { log() {}, warn() {}, error() {} },
        document: { getElementById(id) {
            calls.dom++;
            if (!allowed && !absent) throw new Error('UI read before standalone review guard');
            if (id === 'branch-synthesis-select') return { value: '' }; // legacy reaches its normal selection validation
            return { checked: false, value: 'Scelta Multipla', remove() { calls.close++; } };
        } }
    };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../public/js', scripts[entry]), 'utf8'), sandbox);
    win.getDescendants = () => [];
    win.renderStudySets = () => {};
    win.openStudyPlayer = () => { calls.player++; };
    win.playNextGlobalQuiz = () => { calls.player++; };
    win.generateDynamicQuiz = async () => { calls.api++; return [{ q: 'Nuova domanda', options: ['X', 'Y', 'Z'], correct: 'X' }]; };
    win.studyConfig = { mode: 'quiz', quantity: 1, timer: false, target: node, scope: 'node' };
    const invoke = {
        regenerate: () => win.regenerateStudySet('saved'),
        synthesis: () => win.generateBranchSynthesisWithAI()
    }[entry];
    return { win, state, calls, node, set, invoke };
}

for (const entry of Object.keys(scripts)) {
    test(`${entry}: standalone refusal precedes model calls, UI changes and use of pre-existing items`, async () => {
        const f = fixture(entry), original = copy(f.state);
        await f.invoke();
        assert.equal(f.calls.guard, 1);
        assert.equal(f.calls.approved, 0, 'the standalone guard owns the decision; G1 must not bypass it');
        for (const key of ['api', 'key', 'dom', 'close', 'player', 'confirm']) assert.equal(f.calls[key], 0, key);
        assert.deepEqual(f.state, original);
    });
    test(`${entry}: an older controller can still deny via requireApproved fallback`, async () => {
        const f = fixture(entry, { fallback: true });
        await f.invoke();
        assert.equal(f.calls.approved, 1);
        assert.equal(f.calls.api, 0);
        assert.equal(f.calls.dom, 0);
        assert.equal(f.calls.player, 0);
    });
}

for (const entry of ['regenerate']) {
    for (const absent of [false, true]) {
        test(`${entry}: ${absent ? 'legacy without controller' : 'explicitly permitted legacy'} keeps the existing generation`, async () => {
            const f = fixture(entry, { allowed: true, absent });
            await f.invoke();
            assert.equal(f.calls.api, 1);
            assert.equal(f.calls.guard, absent ? 0 : 1);
            if (entry === 'regenerate') assert.equal(f.set.items[0].q, 'Nuova domanda');
        });
    }
}

test('synthesis UI permits legacy selection validation and does not redirect the headless pipeline API', async () => {
    const f = fixture('synthesis', { allowed: true });
    await f.invoke();
    assert.equal(f.calls.guard, 1);
    assert.ok(f.calls.dom > 0);
    f.win.MappAIReview.requireApproved = async () => { f.calls.approved++; return false; };
    assert.equal(await f.win.MappAISynthesis.runWholeMap({ apiKey: 'mock-key', silent: true }), null);
    assert.equal(f.calls.guard, 1, 'headless pipeline calls use G1, not the standalone redirect');
    assert.equal(f.calls.approved, 1);
    assert.equal(f.calls.api, 0);
});

/* ── Packet 0042: requireApproved({ quarantena: true }) ──────────────────────
   Il controller vero, la cucitura vera, il core vero. L'opzione lascia passare
   solo quando la quarantena rende G1 facoltativa; senza l'opzione si resta al
   comportamento di oggi; `requireStandalone` («Crea un documento», ADR 0003)
   resta false. */
const RC0042 = require('../public/js/mappai-review-core.js');
const AC0042 = require('../public/js/mappai-affermazioni-core.js');
const FONTI0042 = [{ nome: 'Svizzera.pdf', pages: [{ n: 4, text: 'La Germania era da tempo un importante partner commerciale della Svizzera e fu il principale destinatario delle esportazioni elvetiche negli anni 1940 - 1944. Il commercio con gli Alleati continuò, ma costituiva solo un terzo di quello con la Germania.' }] }];
const mappa0042 = () => ({ nodes: [
    { id: 'ROOT', label: 'Svizzera', level: 0, desc: 'La Svizzera commerciava con la Germania e con gli Alleati durante la guerra.' },
    { id: 'L1', label: 'Commercio', level: 1, desc: 'La Germania era un partner commerciale importante per la Svizzera. Il commercio con gli Alleati valeva la metà di quello tedesco.' }],
    links: [{ source: 'ROOT', target: 'L1', rel: 'include' }], sourcesDict: {} });
// `vecchio`: un progetto nato senza il controllo G1 (gate 3 del 27/09, «La Germania e il Nazismo»): niente rapporto, niente fonti
function guardia0042({ storage = {}, record = false, stato, vecchio = false } = {}) {
    const chiamate = { open: 0, modal: 0, toast: 0 };
    const st = { activeVaultPath: '/vault', db: mappa0042(), sources: [] };
    let review = vecchio ? RC0042.createReview({ db: mappa0042(), sources: [], generationId: 'g', report: {} })
      : RC0042.createReview({ db: mappa0042(), sources: FONTI0042, generationId: 'g', report: { contratto: 'mappai-giudice@2', stato: 'completo',
        copertura: { nodiEsaminati: ['ROOT', 'L1'], nodiSaltati: [] },
        issues: [{ id: 'i-meta', target: { kind: 'node', id: 'L1', field: 'desc' }, problem: 'La fonte dice «costituiva solo un terzo di quello con la Germania».' }] } });
    if (stato) review.initial.status = stato;
    if (record) review.quarantena = AC0042.record(review, st.db);
    st._pipelineManifest = { review };
    const ctx = { console: { log() {}, warn() {}, error() {} }, appState: st, setTimeout, clearTimeout,
        // packet 0089 (ADR 0020): senza chiave sono accese; qui una chiave non data vale '0', «da spento» (inv. 1)
        localStorage: { getItem: k => (k in storage ? storage[k] : (k === 'mappai_affermazioni' || k === 'mappai_quarantena') ? '0' : null), setItem() {} } };
    ctx.window = ctx;
    Object.assign(ctx, { MappAIReviewCore: Object.assign({}, RC0042), MappAIAffermazioniCore: AC0042,
        showToast: () => { chiamate.toast++; }, MappAIPipeline: { openModal: () => { chiamate.modal++; } } });
    vm.createContext(ctx);
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../public/js/mappai-review.js'), 'utf8'), ctx);
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../public/js/mappai-affermazioni.js'), 'utf8'), ctx);
    chiamate.aperture = [];
    ctx.MappAIReview.open = function () { chiamate.open++; chiamate.aperture.push(Array.from(arguments)); };
    return { R: ctx.MappAIReview, chiamate, review, st, ctx };
}
const ACCESA0042 = { mappai_affermazioni: '1', mappai_quarantena: '1' };

test('0042: requireApproved({ quarantena: true }) passa solo quando la quarantena rende G1 facoltativa', async () => {
    // spenta: l'opzione non cambia niente, il Banco si apre come oggi
    const spenta = guardia0042();
    assert.equal(await spenta.R.requireApproved({ quarantena: true }), false);
    assert.equal(spenta.chiamate.open, 1);
    // accesa, G1 in attesa, ancora nessun record: l'opzione passa (il record lo calcola il giro), senza opzione come oggi
    const accesa = guardia0042({ storage: ACCESA0042 });
    assert.equal(await accesa.R.requireApproved({ quarantena: true }), true);
    assert.equal(accesa.chiamate.open, 0);
    assert.equal(await accesa.R.requireApproved(), false);
    assert.equal(accesa.chiamate.open, 1, 'senza l’opzione si apre il Banco, come oggi');
    // solo lo strato, senza quarantena: niente di facoltativo
    const solo = guardia0042({ storage: { mappai_affermazioni: '1' } });
    assert.equal(await solo.R.requireApproved({ quarantena: true }), false);
    // la quarantena accesa ma la revisione spenta non rende niente facoltativo
    const senzaRevisione = guardia0042({ storage: Object.assign({ mappai_review_enabled: '0' }, ACCESA0042) });
    assert.equal(await senzaRevisione.R.requireApproved({ quarantena: true }), false);
    // una revisione che non è in attesa non diventa facoltativa
    const applicando = guardia0042({ storage: ACCESA0042, stato: 'applying' });
    assert.equal(await applicando.R.requireApproved({ quarantena: true }), false);
    // con un record valido il cancello avvolto consente da sé
    const conRecord = guardia0042({ storage: ACCESA0042, record: true });
    assert.equal(conRecord.review.quarantena.completo, true, conRecord.review.quarantena.motivo);
    assert.equal(await conRecord.R.requireApproved({ quarantena: true }), true);
});

test('0042: requireStandalone resta false con la quarantena accesa, con e senza record (ADR 0003)', async () => {
    for (const record of [false, true]) {
        const g = guardia0042({ storage: ACCESA0042, record });
        assert.equal(await g.R.requireStandalone(), false);
        assert.equal(g.chiamate.open + g.chiamate.modal, 1, 'porta al Banco o al pannello di «Genera materiali», mai a una generazione');
    }
    const spenta = guardia0042();
    assert.equal(await spenta.R.requireStandalone(), false);
    assert.equal(spenta.chiamate.open, 1);
});

/* Il censimento: chi chiama requireApproved, e con che cosa. Solo la ripresa di
   Pipeline.run e runApprovedMaterials passano l'opzione; tutti gli altri restano
   come sono. Un chiamante nuovo fa fallire la prova finché non lo si aggiunge qui. */
test('0042: censimento dei chiamanti di requireApproved con il comportamento atteso', () => {
    const JS = path.join(__dirname, '../public/js');
    const trovati = [];
    for (const f of fs.readdirSync(JS).filter(f => f.endsWith('.js') && !f.includes('.bak') && !f.endsWith('.min.js'))) {
        const righe = fs.readFileSync(path.join(JS, f), 'utf8').split('\n');
        righe.forEach((riga, i) => {
            if (/^\s*(\/\/|\*|\/\*)/.test(riga)) return;
            for (const m of riga.matchAll(/requireApproved(\??\.call)?\(([^)]*)\)/g)) trovati.push({ f, argomenti: m[2].trim(), call: !!m[1] });
            for (const m of riga.matchAll(/reviewGuard\.call\(([^)]*)\)/g)) trovati.push({ f, argomenti: 'guardia:' + m[1].trim(), call: true });
        });
    }
    const conta = (f, argomenti) => trovati.filter(x => x.f === f && x.argomenti === argomenti).length;
    assert.equal(conta('mappai-material-pipeline.js', '{ quarantena: true }'), 2, 'la ripresa di Pipeline.run e runApprovedMaterials');
    assert.equal(conta('mappai-material-pipeline.js', ''), 1, 'generaSet: il ripiego di requireStandalone, senza opzione');
    // 0097 (Giacomo, 15/10): il terzo è «Ricontrolla la mappa adesso», il bottone del piè di una G1 approvata e superata
    assert.equal(conta('mappai-review.js', ''), 3, 'requireStandalone, il recupero della bozza e «Ricontrolla la mappa adesso», senza opzione');
    assert.equal(conta('mappai-branch-synthesis.js', ''), 1, 'runWholeMap senza la vista: la chiamata di sempre');
    // giro 5 (F4): runWholeMap con la vista della quarantena (`opts.db`) è la pipeline, e passa l'opzione
    assert.equal(conta('mappai-branch-synthesis.js', '{ quarantena: true }'), 1, 'runWholeMap con la vista: la pipeline');
    assert.equal(conta('mappai-learning-path.js', ''), 1);
    assert.equal(conta('mappai-flashcards-sr.js', 'guardia:window.MappAIReview'), 1, 'la guardia della rigenerazione: requireStandalone prima (nodo e ramo sono usciti il 12/10/2026, 0087 lotto 10-modali)');
    assert.equal(conta('mappai-study-session.js', 'guardia:window.MappAIReview'), 0);
    assert.equal(conta('mappai-branch-synthesis.js', 'guardia:window.MappAIReview'), 1);
    const conOpzione = trovati.filter(x => /quarantena/.test(x.argomenti));
    assert.deepEqual(conOpzione.map(x => x.f).sort(), ['mappai-branch-synthesis.js', 'mappai-material-pipeline.js', 'mappai-material-pipeline.js']);
    assert.equal(trovati.length, 11, 'un chiamante nuovo va censito qui (12 fino al 12/10/2026: le due guardie di nodo e ramo sono uscite con lo 0087, lotto 10-modali; 11 dallo 0097, «Ricontrolla la mappa adesso»): ' + JSON.stringify(trovati));
});

test('0042 giro 4 (E4): requireApproved con l\u2019opzione, sotto quarantena e senza G1 facoltativa, apre il Banco col piano chiesto al motore; altrimenti come oggi', async () => {
    // accesa, ma la revisione non è in attesa: vale il cancello di oggi, e il Banco si alza sopra la console
    const applicando = guardia0042({ storage: ACCESA0042, stato: 'applying' });
    assert.equal(await applicando.R.requireApproved({ quarantena: true }), false);
    assert.equal(applicando.chiamate.aperture.length, 1);
    assert.equal(JSON.stringify(applicando.chiamate.aperture[0].slice(2)), JSON.stringify([{ alza: true }]), 'oggetti di un altro contesto vm: si confronta il JSON');
    // senza l'opzione, sotto quarantena: anche lui si alza (gate 3 del 27/09 — prima due argomenti, e da ELABORA il Banco restava sotto la console)
    const senzaOpzione = guardia0042({ storage: ACCESA0042, stato: 'applying' });
    assert.equal(await senzaOpzione.R.requireApproved(), false);
    assert.equal(JSON.stringify(senzaOpzione.chiamate.aperture[0].slice(2)), JSON.stringify([{ alza: true }]));
    // quarantena spenta, con l'opzione: la chiamata di oggi
    const spenta = guardia0042();
    assert.equal(await spenta.R.requireApproved({ quarantena: true }), false);
    assert.equal(spenta.chiamate.aperture[0].length, 2);
    assert.equal(spenta.chiamate.aperture[0][0], '/vault');
});

/* ── Packet 0042, giro 5 del 26/09 (F4) ───────────────────────────────────────
   La scorciatoia del cancello vale SOLO per la pipeline dei materiali. Con la
   quarantena accesa e un record valido il cancello avvolto consente con
   `reason: 'quarantine'`; senza l'opzione quel consenso non vale e si apre il
   Banco, come prima. Il «Percorso breve» (mappai-learning-path.js, che non si
   tocca) chiama requireApproved() senza opzione: resta chiuso finché G1 non è
   approvata. Prima del giro 5 passava, e generava dalla mappa com'è. */
test('0042 giro 5 (F4): con quarantena accesa e record valido il Percorso breve non passa, la pipeline sì', async () => {
    const g = guardia0042({ storage: ACCESA0042, record: true });
    assert.equal(g.review.quarantena.completo, true, g.review.quarantena.motivo);
    // il cancello avvolto consente per la quarantena…
    const esito = g.ctx.MappAIReviewCore.gate(g.review, g.st.db, g.review.sources);
    assert.equal(esito.allowed, true);
    assert.equal(esito.reason, 'quarantine');
    // …ma senza l'opzione non basta: si apre il Banco, come oggi — sopra la console (gate 3 del 27/09)
    assert.equal(await g.R.requireApproved(), false);
    assert.equal(g.chiamate.open, 1);
    assert.equal(JSON.stringify(g.chiamate.aperture[0].slice(2)), JSON.stringify([{ alza: true }]), 'il Banco col piano del motore');
    // la pipeline passa l'opzione e passa
    assert.equal(await g.R.requireApproved({ quarantena: true }), true);
    assert.equal(g.chiamate.open, 1);
    // il Percorso breve vero, nello stesso contesto: si ferma al Banco, senza arrivare all'elenco delle attività
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../public/js/mappai-learning-path.js'), 'utf8'), g.ctx);
    assert.equal(await g.ctx.MappAILearningPath.open(), false);
    assert.equal(g.chiamate.open, 2, 'il Percorso breve apre il Banco');
    assert.equal(g.chiamate.toast, 0, 'non arriva a cercare le attività approvate');
    // requireStandalone («Crea un documento», ADR 0003) resta chiuso
    assert.equal(await g.R.requireStandalone(), false);
    assert.equal(g.chiamate.open, 3);
    // quarantena spenta, stesso record: il cancello di oggi, il Banco come sempre
    const spenta = guardia0042({ record: true });
    assert.equal(await spenta.R.requireApproved(), false);
    assert.equal(await spenta.R.requireApproved({ quarantena: true }), false);
});

test('0042 giro 5 (F4): runWholeMap passa l’opzione solo con la vista della quarantena; senza, la chiamata di sempre', async () => {
    const f = fixture('synthesis', { allowed: true });
    const argomenti = [];
    f.win.MappAIReview.requireApproved = async function () { argomenti.push(Array.from(arguments)); return false; };
    assert.equal(await f.win.MappAISynthesis.runWholeMap({ apiKey: 'mock-key', silent: true }), null);
    assert.equal(await f.win.MappAISynthesis.runWholeMap({ apiKey: 'mock-key', silent: true, db: { nodes: [], links: [] }, review: {} }), null);
    assert.equal(argomenti.length, 2);
    assert.equal(argomenti[0].length, 0, 'senza vista: requireApproved() senza argomenti, come oggi');
    assert.equal(JSON.stringify(argomenti[1]), JSON.stringify([{ quarantena: true }]), 'con la vista: la pipeline, con l’opzione');
    assert.equal(f.calls.api, 0);
});

/* ── Packet 0042, gate 3 del 27/09 (Giacomo, «La Germania e il Nazismo») ──────
   (a) Un progetto nato senza il controllo G1 — niente rapporto, niente fonti
   nella revisione — non può avere un record completo: G1 non è facoltativa.
   Prima la ripresa passava (`facoltativa` guardava solo interruttori e stato),
   il giro calcolava un record incompleto e il Banco di G1 compariva DOPO
   «Riprendi». (c) Il Banco aperto dal cancello senza l'opzione — «Crea un
   documento» da ELABORA — stava a z 3400 sotto la console: sotto quarantena
   chiede anch'esso il piano al motore. Quarantena spenta: la chiamata di oggi. */
test('0042 gate 3 (a): su un progetto senza rapporto né fonti G1 non è facoltativa, e l’opzione non passa', async () => {
    const g = guardia0042({ storage: ACCESA0042, vecchio: true });
    assert.equal(AC0042.nonCalcolabile(g.review, g.st.db, g.review.sources), 'rapporto_assente');
    assert.equal(g.ctx.MappAIAffermazioni.facoltativa(g.review), false);
    assert.equal(await g.R.requireApproved({ quarantena: true }), false, 'la ripresa si ferma al Banco, prima del giro');
    assert.equal(g.chiamate.open, 1);
    // il progetto di sempre resta facoltativo
    const nuovo = guardia0042({ storage: ACCESA0042 });
    assert.equal(AC0042.nonCalcolabile(nuovo.review, nuovo.st.db, nuovo.review.sources), '');
    assert.equal(nuovo.ctx.MappAIAffermazioni.facoltativa(nuovo.review), true);
    // i motivi sono quelli del record, nello stesso ordine
    const rec = AC0042.record(g.review, g.st.db);
    assert.equal(rec.completo, false);
    assert.equal(rec.motivo, 'rapporto_assente');
    const senzaFonti = RC0042.createReview({ db: mappa0042(), sources: [], generationId: 'g', report: { contratto: 'mappai-giudice@2', stato: 'completo',
        copertura: { nodiEsaminati: ['ROOT', 'L1'], nodiSaltati: [] }, issues: [] } });
    assert.equal(AC0042.nonCalcolabile(senzaFonti, mappa0042(), senzaFonti.sources), 'fonte_vuota');
    assert.equal(AC0042.record(senzaFonti, mappa0042()).motivo, 'fonte_vuota');
    const senzaEsaminati = RC0042.createReview({ db: mappa0042(), sources: FONTI0042, generationId: 'g', report: { contratto: 'mappai-giudice@2', stato: 'completo',
        copertura: { nodiEsaminati: [], nodiSaltati: [] }, issues: [] } });
    assert.equal(AC0042.nonCalcolabile(senzaEsaminati, mappa0042(), senzaEsaminati.sources), 'controllo_non_disponibile');
    assert.equal(AC0042.record(senzaEsaminati, mappa0042()).motivo, 'controllo_non_disponibile');
});

test('0042 gate 3 (c): sotto quarantena il Banco aperto senza l’opzione («Crea un documento» da ELABORA) si alza sopra la console; spenta, come oggi', async () => {
    for (const vecchio of [false, true]) {
        const g = guardia0042({ storage: ACCESA0042, vecchio });
        assert.equal(await g.R.requireApproved(), false);
        assert.equal(JSON.stringify(g.chiamate.aperture[0].slice(2)), JSON.stringify([{ alza: true }]), 'vecchio=' + vecchio);
        const s = guardia0042({ storage: ACCESA0042, vecchio });
        assert.equal(await s.R.requireStandalone(), false);
        assert.equal(JSON.stringify(s.chiamate.aperture[0].slice(2)), JSON.stringify([{ alza: true }]), 'requireStandalone, vecchio=' + vecchio);
    }
    const spenta = guardia0042({ vecchio: true });
    assert.equal(await spenta.R.requireApproved(), false);
    assert.equal(spenta.chiamate.aperture[0].length, 2, 'la chiamata di oggi, due argomenti');
    const soloStrato = guardia0042({ storage: { mappai_affermazioni: '1' } });
    assert.equal(await soloStrato.R.requireApproved(), false);
    assert.equal(soloStrato.chiamate.aperture[0].length, 2, 'solo lo strato, senza quarantena: come oggi');
});
