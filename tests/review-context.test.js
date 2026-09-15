'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const Context = require('../public/js/mappai-review-context.js');
const Review = require('../public/js/mappai-review-core.js');

const db = () => ({
    nodes: [
        { id: 'ROOT', label: 'Svizzera e 2a GM', level: 0 },
        { id: 'L1_0', label: 'Neutralità Svizzera', level: 1, group: '1' },
        { id: 'L1_1', label: 'Difesa Militare Svizzera', level: 1, group: 2 },
        { id: 'n1', label: 'Pieni poteri', level: 2, group: 1 },
        { id: 'n2', label: 'Ridotto nazionale', level: 2, group: '2' },
        { id: 'orphan', label: 'Senza gruppo', level: 2 }
    ],
    customColors: { 1: '#eeeeee' }
});
const palette = { 1: '#ef4444', 2: '#f59e0b', 0: '#0f172a' };
const itemIssue = id => ({ target: { kind: 'item', id, field: 'question' } });
const review = items => ({ baseSnapshot: { items } });
const describeItem = (item, drafts, graph = db()) => Context.createIndex(graph, drafts, palette).describe(itemIssue(item.id), review([item]));
const areaIds = description => description.areas.map(a => a.id);

test('coverage lists only residuals and distinguishes uncertain, missing and invalid verdicts without changing the report', () => {
    const items = ['done', 'uncertain', 'missing', 'invalid', 'technical'].map(id => ({ id, kind: 'flashcard' }));
    const report = { coverage: { expectedIds: items.map(i => i.id), checkedIds: ['done'], skipped: [{ id: 'technical', reason: 'Unavailable' }], claims: [
        { itemId: 'done', field: 'answer', text: 'Verified', status: 'supported', checked: true },
        { itemId: 'uncertain', field: 'guide', text: 'Same statement', status: 'uncertain', checked: false },
        { itemId: 'uncertain', field: 'guide', text: 'Same statement', status: 'uncertain', checked: false },
        { itemId: 'uncertain', field: 'criteria', text: 'Same statement', status: 'uncertain', checked: false },
        { itemId: 'missing', field: 'text', text: 'No answer', status: 'missing', checked: false },
        { itemId: 'invalid', field: 'answer', text: 'No valid source reference', status: 'supported', checked: false }
    ] }, batches: [{ ids: ['technical'], error: 'HTTP 400' }] };
    const before = JSON.stringify({ report, items }), rows = Context.incompleteMaterials(report, items);
    assert.deepEqual(rows.map(r => r.id), ['uncertain', 'missing', 'invalid', 'technical']);
    assert.equal(rows[0].claims.length, 2, 'separate fields remain identifiable');
    assert.deepEqual(rows.slice(0, 3).map(r => r.claims[0].status), ['uncertain', 'missing', 'unverified']);
    assert.equal(rows[3].error, 'HTTP 400'); assert.equal(rows[3].claims.length, 0);
    assert.equal(JSON.stringify({ report, items }), before);
});

test('coverage supports older reports, absent items and contradictory completion data without inventing a pass', () => {
    assert.equal(Context.incompleteMaterials({ reason: 'Offline' }, [{ id: 'a' }])[0].reason, 'Offline');
    const rows = Context.incompleteMaterials({ coverage: { expectedIds: ['a'], checkedIds: ['a'], skipped: [{ id: 'gone' }],
        claims: [{ itemId: 'a', text: 'Uncertain despite checkedIds', checked: false, status: 'uncertain' }] } }, [{ id: 'a' }]);
    assert.equal(rows.length, 2); assert.equal(rows[0].item, null); assert.equal(rows[1].id, 'a');
});

test('map nodes use their L1 group and custom map colours, including light grey', () => {
    const describe = Context.createIndex(db(), {}, palette).describe;
    const result = describe({ target: { kind: 'node', id: 'n1' } });
    assert.deepEqual(result.areas, [{ id: '1', label: 'Neutralità Svizzera', color: '#eeeeee' }]);
    assert.equal(result.scope, 'area');
    assert.equal(result.materialKind, null);
    assert.equal(describe({ target: { kind: 'node', id: 'n2' } }).areas[0].color, '#f59e0b');
});

test('a cross-area link includes both endpoint areas and deduplicates same-area endpoints', () => {
    const graph = db(); graph.links = [{ id: 'cross', source: 'n1', target: 'n2' }];
    const describe = Context.createIndex(graph, {}, palette).describe;
    assert.deepEqual(areaIds(describe({ target: { kind: 'link', source: { id: 'n1' }, target: 'n2' } })), ['1', '2']);
    assert.deepEqual(areaIds(describe({ target: { kind: 'link', source: 'L1_0', target: 'n1' } })), ['1']);
    assert.deepEqual(areaIds(describe({ target: { kind: 'link', id: 'cross', field: 'rel' } })), ['1', '2']);
});

test('overview and missing context remain distinct without inventing an area', () => {
    const describe = Context.createIndex(db(), {}, palette).describe;
    assert.equal(describe({ target: { kind: 'node', id: 'ROOT' } }).scope, 'overview');
    for (const id of ['orphan', 'removed']) {
        const result = describe({ target: { kind: 'node', id } });
        assert.equal(result.scope, 'unknown'); assert.deepEqual(result.areas, []);
    }
    const intro = describeItem({ id: 'intro', kind: 'synthesis', step: 'D', part: 'intro', title: 'Panoramica' });
    assert.equal(intro.scope, 'overview'); assert.deepEqual(intro.areas, []);
    const whole = describeItem({ id: 'whole', kind: 'synthesis', step: 'D', part: 'whole', title: 'Svizzera e 2a GM' });
    assert.equal(whole.scope, 'overview');
});

test('legacy question metadata supports a branch name and nonuniform area arrays', () => {
    assert.deepEqual(areaIds(describeItem({ id: 'mc1', kind: 'mc', ramo: 'Neutralità Svizzera' })), ['1']);
    const open = describeItem({ id: 'open1', kind: 'open', l1: 'Neutralità Svizzera',
        areas: ['Neutralità Svizzera', { id: 'L1_1' }, 'missing', 'Neutralità Svizzera'] });
    assert.deepEqual(areaIds(open), ['1', '2']);
    assert.equal(open.materialLabel, 'Domanda aperta');
    assert.deepEqual(areaIds(describeItem({ id: 'flash', kind: 'flashcard', areas: 'Difesa Militare Svizzera' })), ['2']);
});

test('node provenance maps deterministically while question and source text cannot assign topics', () => {
    const withNodes = describeItem({ id: 'q', kind: 'mc', sourceNodeIds: ['n1', 'n2', 'missing'], fromNode: { id: 'n1' } });
    assert.deepEqual(areaIds(withNodes), ['1', '2']);
    const unknown = describeItem({ id: 'q', kind: 'mc', question: 'Neutralità Svizzera', title: 'Difesa Militare Svizzera',
        evidence: { text: 'Ridotto nazionale' }, citations: [{ text: 'Neutralità Svizzera' }] });
    assert.equal(unknown.scope, 'unknown'); assert.deepEqual(unknown.areas, []);
});

test('material chips distinguish six types and relations inside a synthesis', () => {
    for (const kind of ['mc', 'open', 'flashcard', 'synthesis', 'nodesheet', 'causal']) {
        const result = describeItem({ id: kind, kind, step: kind === 'causal' ? 'E' : 'B' });
        assert.equal(result.materialKind, kind);
        assert.equal(result.materialLabelKey, 'rv_material_' + kind);
    }
    const relation = describeItem({ id: 'synthesis-causal-1-1', kind: 'causal', step: 'D', title: 'Difesa Militare Svizzera',
        sourceId: 'n1', targetId: 'n2' });
    assert.equal(relation.materialKind, 'synthesis'); assert.equal(relation.relation, true);
    assert.deepEqual(areaIds(relation), ['1', '2']);
});

test('old node-sheet drafts recover node IDs only when row identity still agrees', () => {
    const item = { id: 'nodesheet-title-0', kind: 'nodesheet', step: 'C', draftKey: 'title', cardIndex: 0, question: 'Pieni poteri' };
    const drafts = { C: { title: { cards: [{ id: 'n1', label: 'Pieni poteri' }] } } };
    assert.deepEqual(areaIds(describeItem(item, drafts)), ['1']);
    drafts.C.title.cards = [{ id: 'n2', label: 'Ridotto nazionale' }];
    assert.equal(describeItem(item, drafts).scope, 'unknown');
});

test('legacy synthesis and causal drafts recover explicit provenance without trusting shifted rows', () => {
    const row = { cause: 'Uno', effect: 'Due', conn: 'quindi', sourceId: 'n1', targetId: 'n2' };
    const item = { id: 'causal-cross-0', kind: 'causal', step: 'E', draftKey: 'cross', rowIndex: 0, question: 'Uno', answer: 'Due', text: 'quindi' };
    const drafts = { E: { chains: { cross: [row] } }, D: { data: { sections: [{ branchLabel: 'Neutralità Svizzera' }] } } };
    assert.deepEqual(areaIds(describeItem(item, drafts)), ['1', '2']);
    assert.deepEqual(areaIds(describeItem({ id: 'synthesis-0', kind: 'synthesis', step: 'D', part: 0 }, drafts)), ['1']);
    drafts.E.chains.cross[0] = { ...row, cause: 'Un’altra causa' };
    assert.equal(describeItem(item, drafts).scope, 'unknown');
});

test('a quiz falls back to its stable draft item ID, never to the whole set’s source nodes', () => {
    const item = { id: 'set1-0', kind: 'mc', step: 'B', draftKey: 'mc-auto' };
    const drafts = { B: { 'mc-auto': { id: 'set1', sourceNodeIds: ['n1', 'n2'], items: [{ ramo: 'Neutralità Svizzera' }] } } };
    assert.deepEqual(areaIds(describeItem(item, drafts)), ['1']);
    drafts.B['mc-auto'].items = [];
    assert.equal(describeItem(item, drafts).scope, 'unknown');
});

test('unsafe or absent colours use a neutral fallback without exposing CSS injection', () => {
    const graph = db(); graph.customColors = { 1: '#fff; background:url(https://invalid.example)' };
    const describe = Context.createIndex(graph).describe;
    assert.equal(describe({ target: { kind: 'node', id: 'n1' } }).areas[0].color, '#64748b');
    graph.customColors = { 1: 'rgb(128, 128, 128)' };
    assert.equal(Context.createIndex(graph).describe({ target: { kind: 'node', id: 'n1' } }).areas[0].color, 'rgb(128, 128, 128)');
});

test('ambiguous area names cannot attach a question to an arbitrary group', () => {
    const graph = db(); graph.nodes.push({ id: 'duplicate', level: 1, group: 3, label: 'Neutralità Svizzera' });
    assert.equal(describeItem({ id: 'q', kind: 'mc', ramo: 'Neutralità Svizzera' }, {}, graph).scope, 'unknown');
    assert.deepEqual(areaIds(describeItem({ id: 'q', kind: 'mc', sourceNodeIds: ['n1'] }, {}, graph)), ['1']);
});

test('context resolution never mutates snapshots, drafts, issues, or returned area records', () => {
    const graph = db(), drafts = { C: { title: { cards: [{ id: 'n1', label: 'Pieni poteri' }] } } };
    const current = review([{ id: 'q', kind: 'mc', sourceNodeIds: ['n1'] }]), issue = itemIssue('q');
    const before = JSON.stringify([graph, drafts, current, issue, palette]);
    const describe = Context.createIndex(graph, drafts, palette).describe;
    describe(issue, current).areas[0].label = 'Changed outside the helper';
    assert.equal(describe(issue, current).areas[0].label, 'Neutralità Svizzera');
    assert.equal(JSON.stringify([graph, drafts, current, issue, palette]), before);
});

test('browser entry exposes the same dependency-free API', () => {
    const context = vm.createContext({});
    vm.runInContext(fs.readFileSync(require.resolve('../public/js/mappai-review-context.js'), 'utf8'), context);
    assert.equal(typeof context.MappAIReviewContext.createIndex, 'function');
    assert.equal(context.MappAIReviewContext.createIndex().describe({}).scope, 'unknown');
    assert.equal(typeof context.MappAIReviewContext.occurrenceSnapshot, 'function');
    assert.equal(typeof context.MappAIReviewContext.searchOccurrences, 'function');
});

test('occurrence search finds unflagged materials and exposes each editable field without inflating the item count', () => {
    const items = [
        { id: 'mc', kind: 'mc', question: 'Quale percorso?', options: ['Gli elettroni sono veloci.', 'Gli elettroni non sono veloci.'], explanation: 'Elettroni troppo veloci.' },
        { id: 'open', kind: 'open', guide: 'Descrivere gli elettroni troppo veloci.', criteria: ['Descrivere gli elettroni troppo veloci.'] },
        { id: 'synthesis', kind: 'synthesis', text: 'Gli elettroni diventano molto veloci.' },
        { id: 'flash', kind: 'flashcard', answer: 'Elettroni veloci.' },
        { id: 'causal', kind: 'causal', question: 'Elettroni veloci', text: 'quindi', answer: 'il cavo si scalda' }
    ];
    const saved = JSON.stringify(items), found = Context.searchOccurrences(items, 'elettroni veloci');
    assert.equal(found.valid, true); assert.equal(found.totalItems, 5); assert.equal(found.matches.length, 5);
    assert.deepEqual(found.matches[0].fields.map(field => [field.field, field.index]), [['options', 0], ['options', 1], ['explanation', null]]);
    assert.deepEqual(found.matches[1].fields.map(field => field.field), ['guide', 'criteria']);
    assert.equal(found.matches[0].fields[1].text, 'Gli elettroni non sono veloci.', 'candidates include negations for the teacher to assess, without declaring them errors');
    assert.equal(JSON.stringify(items), saved);
});

test('occurrences require whole words in the same field or alternative, without inferred synonyms or topic groupings', () => {
    const items = [
        { id: 'right', text: 'La pila chiude il circuito.' },
        { id: 'substring', text: 'Il pilastro elettrico.' },
        { id: 'split', question: 'La pila', answer: 'chiude il circuito.' },
        { id: 'options', options: ['La pila', 'Il circuito'] },
        { id: 'compound', text: 'Il cortocircuito scalda il cavo.', areas: ['pila circuito'] },
        { id: 'spread', text: 'Il corto produce calore. Un secondo circuito è aperto.' }
    ];
    assert.deepEqual(Context.searchOccurrences(items, 'pila circuito').matches.map(row => row.id), ['right']);
    assert.equal(Context.searchOccurrences(items, 'pil').matches.length, 0);
    assert.equal(Context.searchOccurrences(items, 'corto circuito', { mode: 'phrase' }).matches.length, 0);
    assert.deepEqual(Context.searchOccurrences(items, 'corto circuito').matches.map(row => row.id), ['spread']);
    assert.equal(Context.searchOccurrences(items, '   ').valid, false);
    assert.equal(Context.searchOccurrences(items, '.*').valid, false);
    assert.deepEqual(Context.searchOccurrences(items, 'pila', { excludedIds: ['right', 'split', 'options'] }).matches, []);
});

test('Unicode phrase search returns original text offsets, tolerates equivalent spacing and apostrophes, and never emits HTML', () => {
    const original = '⚡ L’elettricita\u0300\n\t  e\u0300 utile. <img src=x onerror=alert(1)> Elettricità.';
    const phrase = Context.searchOccurrences([{ id: '<script>', text: original }], "l'elettricità è", { mode: 'phrase' });
    assert.equal(phrase.matches.length, 1);
    const hit = phrase.matches[0].fields[0];
    assert.equal(hit.text, original);
    assert.deepEqual(hit.ranges.map(([start, end]) => original.slice(start, end)), ['L’elettricita\u0300\n\t  e\u0300']);
    const words = Context.searchOccurrences([{ id: '<script>', text: original }], 'ELETTRICITÀ').matches[0].fields[0];
    assert.deepEqual(words.ranges.map(([start, end]) => original.slice(start, end)), ['elettricita\u0300', 'Elettricità']);
    assert.equal(Context.searchOccurrences([{ id: 'xss', text: original }], '<img src=x onerror=alert(1)>', { mode: 'phrase' }).matches[0].fields[0].text, original);
    assert.equal(Context.searchOccurrences([{ id: 'regex', text: 'a.b a+b' }], 'a.b', { mode: 'phrase' }).matches[0].fields[0].ranges.length, 1);
    assert.equal(Context.searchOccurrences([{ id: 'astral', text: '𐐀𐐁 𐐀' }], '𐐀', { mode: 'phrase' }).matches[0].fields[0].ranges.length, 1);
});

test('phrase highlighting keeps offsets after Unicode Prepend clusters that contain whitespace', () => {
    for (const prefix of ['\u0600', '\u070f', '\u08e2', '\u{110bd}', '\u{111c2}']) {
        for (const spaces of [' \t ', ' \u00a0 \t', '\r\n\t ']) {
            const text = prefix + spaces + 'FINE';
            const match = Context.searchOccurrences([{ id: 'unicode', text }], 'fine', { mode: 'phrase' }).matches[0].fields[0];
            assert.deepEqual(match.ranges, [[text.length - 4, text.length]], JSON.stringify(text));
        }
    }
});

test('occurrence search ignores stale MC answer and open criteria aliases, preserving canonical editable fields', () => {
    const items = [
        { id: 'mc', kind: 'mc', options: ['Motore elettrico', 'Motore termico'], correctIndex: 1, answer: 'Motore a benzina', correct: 'Motore a benzina' },
        { id: 'open', kind: 'open', criteria: ['Menzionare gli ioni.'], criteri: ['Menzionare gli elettroni.'] }
    ];
    assert.equal(Context.searchOccurrences(items, 'benzina').matches.length, 0);
    assert.equal(Context.searchOccurrences(items, 'elettroni').matches.length, 0);
    assert.deepEqual(Context.searchOccurrences(items, 'termico').matches[0].fields.map(row => row.field), ['options']);
    assert.deepEqual(Context.searchOccurrences(items, 'ioni').matches[0].fields.map(row => row.field), ['criteria']);
});

function occurrenceReview() {
    const items = [
        { id: 'manual', kind: 'synthesis', text: 'Gli elettroni passano nel liquido.' },
        { id: 'accept', kind: 'synthesis', text: 'Gli elettroni passano nel liquido.' },
        { id: 'pending', kind: 'synthesis', text: 'Gli elettroni passano nel liquido.' },
        { id: 'excluded', kind: 'synthesis', text: 'Gli elettroni passano nel liquido.' }
    ];
    const issues = items.map(item => ({ id: item.id, target: { kind: 'item', id: item.id, field: item.id === 'excluded' ? '$item' : 'text' },
        after: item.id === 'excluded' ? null : 'Gli elettroni passano nel cavo.' }));
    let review = Review.createReview({ db: { items }, sources: [], report: { checkStatus: 'completed', issues } });
    review = Review.setDecision(review, 'manual', 'manual', { text: 'Gli elettroni percorrono il circuito esterno.' });
    review = Review.setDecision(review, 'accept', 'accept');
    review = Review.setDecision(review, 'excluded', 'accept');
    return { items, review };
}

test('occurrence snapshots include saved manual and accepted changes while unrelated decisions are pending, without changing approval or coverage', () => {
    const { items, review } = occurrenceReview(), saved = JSON.stringify({ items, review });
    assert.equal(Review.preview(review, { items }).ok, false);
    const snapshot = Context.occurrenceSnapshot(review, items, Review);
    assert.equal(snapshot.ok, true); assert.equal(snapshot.hasPending, true);
    assert.deepEqual(snapshot.excludedIds, ['excluded']);
    assert.deepEqual(Context.searchOccurrences(snapshot.items, 'liquido').matches.map(row => row.id), ['pending']);
    assert.deepEqual(Context.searchOccurrences(snapshot.items, 'cavo').matches.map(row => row.id), ['accept']);
    assert.deepEqual(Context.searchOccurrences(snapshot.items, 'circuito esterno').matches.map(row => row.id), ['manual']);
    assert.equal(JSON.stringify({ items, review }), saved);
    snapshot.items[0].text = 'A consumer edited the snapshot.';
    assert.equal(JSON.stringify({ items, review }), saved);
});

test('occurrence snapshots refuse conflicting decisions and stale revisions instead of searching misleading originals', () => {
    let { items, review } = occurrenceReview();
    review = Review.addIssue(review, { id: 'conflict', target: { kind: 'item', id: 'manual', field: 'text' }, after: 'Un’altra versione.' });
    review = Review.setDecision(review, 'conflict', 'accept');
    const conflict = Context.occurrenceSnapshot(review, items, Review);
    assert.equal(conflict.ok, false); assert.deepEqual(conflict.items, []);
    assert.equal(conflict.error, 'conflicting-decisions'); assert.ok(conflict.conflicts.some(row => row.code === 'conflicting_decisions'));
    const clean = occurrenceReview(), changed = clean.items.map(item => ({ ...item, text: item.text + ' Modificato.' }));
    assert.equal(Context.occurrenceSnapshot(clean.review, changed, Review).ok, false);
    assert.equal(Context.occurrenceSnapshot(null, [], Review).error, 'invalid-review');
});

test('occurrence snapshots also search already approved archives without restoring an excluded item', () => {
    let { items, review } = occurrenceReview();
    review = Review.setDecision(review, 'pending', 'reject');
    const approved = Review.beginApproval(review, { items });
    assert.equal(approved.ok, true);
    review = Review.completeApproval(approved.review, approved.revision);
    const snapshot = Context.occurrenceSnapshot(JSON.parse(JSON.stringify(review)), approved.db.items, Review);
    assert.equal(snapshot.ok, true); assert.equal(snapshot.hasPending, false);
    assert.deepEqual(snapshot.excludedIds, ['excluded']);
    assert.deepEqual(Context.searchOccurrences(snapshot.items, 'liquido').matches.map(row => row.id), ['pending']);
    assert.equal(Context.occurrenceSnapshot(review, items, Review).ok, false, 'an approved archive requires the approved persisted items');
});
