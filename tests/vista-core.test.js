// tests/vista-core.test.js — la vista che viaggia col vault (15/8/26)
const test = require('node:test');
const assert = require('node:assert');
const VC = require('../public/js/mappai-vista-core.js');

test('raccogli: prende SOLO le quattro cose che il vault non ha', () => {
    const stato = {
        rootNodeLabel: 'Project E', aiProvider: 'google',
        studioProfile: { gapLayer: 156, focus: { w: 210 } },
        focusTopic: 'solo i circuiti',
        db: {
            nodes: [{ id: 'a' }], links: [{ source: 'a', target: 'b' }],
            timelineEvents: [{ anno: 1800, evento: 'La pila' }],
            timelineAI: [], nodeSheet: { cards: [{ id: 'a', layout: '2x2' }] }
        }
    };
    const v = VC.raccogli(stato);
    assert.strictEqual(v.schema, 'mappai-vista@1');
    assert.deepStrictEqual(Object.keys(v).sort(),
        ['focusTopic', 'nodeSheet', 'salvato', 'schema', 'studioProfile', 'timelineEvents']);
    assert.strictEqual(v.nodes, undefined, 'i nodi restano nel vault, non qui');
});

test('raccogli: tutto vuoto → null, nessun file da scrivere', () => {
    assert.strictEqual(VC.raccogli({ db: { nodes: [], timelineEvents: [] }, focusTopic: '  ' }), null);
    assert.strictEqual(VC.raccogli(null), null);
});

test('applica: riporta la vista e DICE che cosa ha applicato', () => {
    const stato = { db: { nodes: [] } };
    const fatti = VC.applica(stato, {
        schema: 'mappai-vista@1',
        studioProfile: { gapLayer: 96 }, timelineEvents: [{ anno: 1799 }]
    });
    assert.deepStrictEqual(fatti.sort(), ['studioProfile', 'timelineEvents']);
    assert.strictEqual(stato.studioProfile.gapLayer, 96);
    assert.strictEqual(stato.db.timelineEvents.length, 1);
});

test('applica: un campo assente NON azzera quello che lo stato ha già', () => {
    const stato = { focusTopic: 'costruito ora', db: { timelineEvents: [{ anno: 1 }] } };
    VC.applica(stato, { schema: 'mappai-vista@1', studioProfile: { w: 118 } });
    assert.strictEqual(stato.focusTopic, 'costruito ora');
    assert.strictEqual(stato.db.timelineEvents.length, 1);
});

test('applica: uno schema sconosciuto non applica NIENTE (meglio di metà)', () => {
    const stato = { db: {} };
    const fatti = VC.applica(stato, { schema: 'mappai-vista@2', studioProfile: { x: 1 } });
    assert.deepStrictEqual(fatti, []);
    assert.strictEqual(stato.studioProfile, undefined);
});

test('statoSnello: i link tornano coppie di id (era il 48% del foglio)', () => {
    const na = { id: 'a', label: 'A', desc: 'x'.repeat(500) };
    const nb = { id: 'b', label: 'B', desc: 'y'.repeat(500) };
    const stato = { db: { nodes: [na, nb], links: [{ source: na, target: nb, rel: 'causa', index: 0 }] } };
    const s = VC.statoSnello(stato);
    assert.strictEqual(s.db.links[0].source, 'a');
    assert.strictEqual(s.db.links[0].target, 'b');
    assert.strictEqual(s.db.links[0].rel, 'causa');
    assert.strictEqual(s.db.links[0].index, undefined);
    // lo stato VIVO non è stato toccato: D3 ci lavora ancora sopra
    assert.strictEqual(stato.db.links[0].source, na);
    // e il peso scende davvero
    assert.ok(JSON.stringify(s.db.links).length < JSON.stringify(stato.db.links).length / 5);
});

test('statoSnello: link già a id passano invariati (vault appena caricato)', () => {
    const stato = { db: { links: [{ source: 'a', target: 'b', rel: 'include' }] }, rootNodeLabel: 'X' };
    const s = VC.statoSnello(stato);
    assert.deepStrictEqual(s.db.links, [{ source: 'a', target: 'b', rel: 'include' }]);
    assert.strictEqual(s.rootNodeLabel, 'X');
});
