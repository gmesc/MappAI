'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const Context = require('../public/js/mappai-review-context.js');

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
});
