'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm');
const J = require('../public/js/mappai-judge-core.js');
const w = {}; w.window = w; vm.createContext(w);
vm.runInContext(fs.readFileSync(require.resolve('../public/js/infomaniak_bridge.js'), 'utf8'), w);
test('bridge conserva enum e limiti del contratto anche nel fallback', () => {
    const schema = { type: 'OBJECT', required: ['link'], properties: { link: { type: 'ARRAY', minItems: 1, maxItems: 29,
        items: { type: 'STRING', enum: ['causa', 'precede'], maxLength: 40 } } } };
    const out = w.InfomaniakBridge._geminiSchemaToJsonSchema(schema);
    assert.equal(out.properties.link.maxItems, 29);
    assert.deepEqual(Array.from(out.properties.link.items.enum), ['causa', 'precede']);
    assert.match(w.InfomaniakBridge._schemaToExample(schema), /causa/);
    const payload = { contents: [{ role: 'user', parts: [{ text: 'Verifica i nessi.' }] }], generationConfig: { responseMimeType: 'application/json', responseSchema: schema } };
    const native = w.InfomaniakBridge.translatePayload(payload, 'mistralai/Mistral-Small-4-119B-2603');
    assert.equal(native.response_format.json_schema.schema.properties.link.maxItems, 29);
    const fallback = w.InfomaniakBridge.translatePayload(payload, 'Qwen/Qwen3.5');
    assert.match(JSON.stringify(fallback.messages), /precede/);
    assert.equal(w.InfomaniakBridge._schemaToExample({ type: 'ARRAY', maxItems: 0, items: { type: 'STRING' } }), '[]');
});
const phrase = 'La corrente elettrica attraversa il circuito e produce calore.';
const links = Array.from({ length: 29 }, (_, i) => ({ source: 'a' + i, target: 'b' + i, rel: 'causa' }));
const frammenti = Object.fromEntries(links.flatMap(l => [[l.source, [phrase]], [l.target, [phrase]]]));
const verdicts = () => links.map(l => ({ ...l, valido: true, prova_source: phrase, prova_target: phrase }));
test('29 nessi: solo risposte con prove valide contano, omissioni e conflitti restano residui', () => {
    const run = v => J.validaLink(v, { links, frammenti });
    assert.equal(run(verdicts()).esaminati.length, 29);
    assert.equal(run(verdicts().slice(1)).saltati.length, 1);
    const invalid = verdicts(); invalid[0].prova_source = 'inventata';
    assert.equal(run(invalid).esaminati.length, 28);
    assert.equal(run([...verdicts(), verdicts()[0]]).esaminati.length, 29);
    assert.equal(run([...verdicts(), { ...verdicts()[0], valido: false }]).esaminati.length, 28);
    assert.equal(run([{ ...verdicts()[0], source: 'estraneo' }]).esaminati.length, 0);
    const negative = verdicts(); negative[0].valido = false;
    assert.equal(run(negative).tolti.length, 1);
    negative[0].prova_target = 'non presente';
    assert.equal(run(negative).tolti.length, 0);
    negative[0].valido = 'false';
    assert.equal(run(negative).esaminati.length, 28);
});
test('relazioni parallele richiedono identità esplicita', () => {
    const parallel = [links[0], { ...links[0], rel: 'precede' }];
    const v = { ...verdicts()[0] }; delete v.rel;
    assert.equal(J.validaLink([v], { links: parallel, frammenti }).esaminati.length, 0);
    assert.equal(J.validaLink(verdicts().slice(0, 1), { links: parallel, frammenti }).esaminati.length, 1);
});

test('errori osservati nel retry reale restano rifiutati senza indovinare identità o citazioni', () => {
    for (const change of [
        { rel: 'soggetto-invertito' }, { source: phrase },
        { source: '"a0"', target: '"b0"', rel: '"causa"' },
        { prova_source: '[Fonte.pdf — pagina 1] ' + phrase },
        { prova_target: 'La corrente (...) produce calore.' },
        { prova_source: '', prova_target: '' }
    ]) {
        const r = J.validaLink([{ ...verdicts()[0], ...change }], { links: [links[0]], frammenti });
        assert.equal(r.esaminati.length, 0, JSON.stringify(change));
        assert.equal(r.saltati.length, 1);
    }
});
