'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const copy = value => JSON.parse(JSON.stringify(value));
const scripts = {
    node: 'mappai-flashcards-sr.js', branch: 'mappai-flashcards-sr.js', regenerate: 'mappai-flashcards-sr.js',
    study: 'mappai-study-session.js', synthesis: 'mappai-branch-synthesis.js'
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
    win.closeStudyConfigModal = () => { calls.close++; };
    win.openStudyPlayer = () => { calls.player++; };
    win.playNextGlobalQuiz = () => { calls.player++; };
    win.generateDynamicQuiz = async () => { calls.api++; return [{ q: 'Nuova domanda', options: ['X', 'Y', 'Z'], correct: 'X' }]; };
    win.studyConfig = { mode: 'quiz', quantity: 1, timer: false, target: node, scope: 'node' };
    const invoke = {
        node: () => win.generateFlashcardForNode(node), branch: () => win.generateBranchFlashcards(node),
        regenerate: () => win.regenerateStudySet('saved'), study: () => win.startStudySession(),
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

for (const entry of ['node', 'branch', 'regenerate', 'study']) {
    for (const absent of [false, true]) {
        test(`${entry}: ${absent ? 'legacy without controller' : 'explicitly permitted legacy'} keeps the existing generation`, async () => {
            const f = fixture(entry, { allowed: true, absent });
            await f.invoke();
            assert.equal(f.calls.api, 1);
            assert.equal(f.calls.guard, absent ? 0 : 1 + (entry === 'branch' ? 1 : 0));
            if (entry === 'node') { assert.equal(f.node.flashcardTest[0].q, 'Nuova domanda'); assert.equal(f.state.db.studySets.length, 2); }
            if (entry === 'regenerate') assert.equal(f.set.items[0].q, 'Nuova domanda');
            if (entry === 'branch' || entry === 'study') assert.equal(f.calls.player, 1);
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
