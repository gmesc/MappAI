const { test } = require('node:test');
const assert = require('node:assert/strict');
const G = require('../public/js/mappai-grounding-core.js');
test('single and double source brackets share resolution, registration and editor identity without changing numeric references', () => {
    const source = { id: 'src-a', idx: 17, title: 'Manuale', text: 'Estratto originale.' };
    const raw = 'Fatto [src-a], ancora [[src-a]], [1] e [src-missing].';
    assert.deepEqual(G.resolveCitations(raw, [source]), { text: 'Fatto [17], ancora [17], [1] e [src-missing].', unknownIds: ['src-missing'] });
    const view = G.referenceView(raw, [source]);
    assert.doesNotMatch(view.text, /src-/);
    assert.equal(view.mapping.length, 2);
    assert.equal(G.restoreReferenceIds(view.text, view.mapping), 'Fatto [[src-a]], ancora [[src-a]], [1] e [[src-missing]].');
    assert.deepEqual(G.citationRegistry(raw, [source]), [{ ...source, idx: 2 }]);
    const extended = G.extendCitations({ kind: 'synthesis', citations: [] }, raw.replace('[src-missing]', ''), [source]);
    assert.equal(extended.citations.length, 1);
    assert.equal(extended.citations[0].idx, 2);
    assert.equal(extended.citations[0].text, source.text);
    assert.deepEqual(extended.additions, extended.citations);
    assert.equal(G.extendCitations({ kind: 'synthesis', citations: [] }, raw, [source]), null, 'unknown references cannot be silently authenticated');
});
test('a teacher correction only authorizes the changed sentences, not unchanged claims in the same field', () => {
    const retained = 'La commissione confermò tutte le accuse.';
    const correction = { origin: 'teacher', choice: 'manual', target: { kind: 'node', id: 'n', field: 'desc' },
        before: 'Il governo nominò il generale. ' + retained,
        after: 'L’Assemblea elesse il generale. ' + retained };
    assert.deepEqual(G.amendmentText(correction), ['L’Assemblea elesse il generale.']);
    const input = G.buildInput({ nodes: [{ id: 'n', desc: correction.after }] }, [{ id: 'n' }], [], { overrides: [correction] });
    const authority = input.material.split('RETTIFICHE DEL DOCENTE')[1];
    assert.ok(authority.includes('L’Assemblea elesse il generale.'));
    assert.ok(!authority.includes(retained));
    assert.deepEqual(G.amendmentText({ ...correction, choice: 'reject' }), []);
    assert.deepEqual(G.amendmentText({ ...correction, before: ['Prima.', retained], after: ['Dopo.', retained] }), ['Dopo.']);
});

const originals = [{ id: 'manuale', nome: 'Manuale', pages: [
    { n: 3, text: 'La BNS acquistò oro.\n\nLa Germania ricevette valuta. Il rapporto riportava accuse.' }
] }];
const node = { id: 'economia', label: 'Economia', desc: 'La BNS acquistò oro dalla Germania fornendole valuta.' };
const chunk = text => ({ title: 'Manuale', source: 'pagina 3', text });
const dbFor = chunks => ({ nodes: [node], sourcesDict: { economia: chunks } });

test('grounding: conserva frammenti distinti della stessa pagina e deduplica solo lo stesso frammento', () => {
    const chunks = [chunk('La BNS acquistò oro.'), chunk('La Germania ricevette valuta.'), chunk('La BNS acquistò oro.')];
    const result = G.buildInput(dbFor(chunks), [node], originals);
    assert.equal(result.sourcesArr.length, 2);
    assert.equal(new Set(result.sourcesArr.map(s => s.id)).size, 2);
    assert.equal(result.unverified.length, 0);
    assert.match(result.material, /La BNS acquistò oro\./);
    assert.match(result.material, /La Germania ricevette valuta\./);
});

test('grounding: a final judge can inspect complete originals without losing stable excerpt identities or silently truncating context', () => {
    const db = dbFor([chunk('La BNS acquistò oro.')]);
    const normal = G.buildInput(db, [node], originals);
    const full = G.buildInput(db, [node], originals, null, { includeOriginalPages: true });
    assert.deepEqual(full.sourcesArr[0], normal.sourcesArr[0]);
    assert.equal(full.sourcesArr.length, 2);
    assert.ok(!normal.sourcesListText.includes('Il rapporto riportava accuse.'));
    assert.ok(full.sourcesListText.includes('Il rapporto riportava accuse.'));
    assert.equal(full.sourcesArr[1].text, originals[0].pages[0].text);
    assert.deepEqual(normal.sourceCoverage, { originalPagesAvailable: 1, fullPagesIncluded: 0 });
    assert.deepEqual(full.sourceCoverage, { originalPagesAvailable: 1, fullPagesIncluded: 1 });
});

test('grounding: stesso numero di pagina e stesso testo in documenti diversi non collassano', () => {
    const sources = [
        { id: 'a', title: 'Volume A', pages: [{ n: 3, text: 'Una frase.' }] },
        { id: 'b', title: 'Volume B', pages: [{ n: 3, text: 'Una frase.' }] }
    ];
    const chunks = ['a', 'b'].map(docId => ({ docId, page: 3, text: 'Una frase.' }));
    const result = G.buildInput(dbFor(chunks), [node], sources);
    assert.equal(result.sourcesArr.length, 2);
    assert.deepEqual(result.sourcesArr.map(s => s.docId), ['a', 'b']);
});

test('grounding: identità ambigua e verbatim dichiarato dal modello non autenticano un estratto', () => {
    const sources = [
        { id: 'a', title: 'Volume', pages: [{ n: 3, text: 'Una frase. Prima fonte.' }] },
        { id: 'b', title: 'Volume', pages: [{ n: 3, text: 'Una frase. Seconda fonte.' }] }
    ];
    const result = G.buildInput(dbFor([
        { page: 3, text: 'Una frase.', verbatim: true },
        { page: 3, text: 'Una frase inventata.', verbatim: true },
        { docId: 'inesistente', page: 3, text: 'Una frase.' }
    ]), [node], sources);
    assert.deepEqual(result.unverified.map(s => s.reason), ['ambiguous-source', 'source-not-matched', 'source-not-matched']);
    assert.ok(!result.nodesListText.includes('Passaggi originali:'));
    // Le pagine originali restano disponibili come contesto, senza attribuire
    // ad alcuna fonte la citazione ambigua o quella inventata dal modello.
    assert.deepEqual(result.sourcesArr.map(s => s.text), ['Una frase. Prima fonte.', 'Una frase. Seconda fonte.']);
    assert.ok(!result.sourcesListText.includes('Una frase inventata.'));
});

test('grounding: il testo visualizzato è quello originale, inclusi spazi e a capo', () => {
    const result = G.buildInput(dbFor([chunk('La BNS acquistò oro. La Germania ricevette valuta.')]), [node], originals);
    assert.equal(result.sourcesArr[0].text, 'La BNS acquistò oro.\n\nLa Germania ricevette valuta.');
    assert.equal(result.sourcesArr[0].verifiedAgainst, 'archived-source-text');
    assert.equal(G.originalExcerpt('Accuse di sostegno.', 'Sostegno.'), null, 'non rende identico un testo con altre maiuscole o significato');
});

test('grounding: preferisce fatti correnti approvati e rettifiche esplicite senza riscrivere la fonte', () => {
    const stale = { ...node, desc: 'La BNS scambiò oro per ottenere valuta.' };
    const override = { origin: 'teacher', choice: 'manual', before: stale.desc, target: { kind: 'node', id: node.id, field: 'desc' },
        after: node.desc, reason: 'Il beneficiario della valuta era la Germania.' };
    const review = { sources: originals, overrides: [override,
        { ...override, target: { kind: 'node', id: 'altro' } },
        { ...override, origin: 'judge', after: 'Cambio non approvato.' }
    ] };
    const result = G.buildInput(dbFor([chunk('La BNS acquistò oro.')]), [stale], [], review);
    assert.match(result.nodesListText, /fornendole valuta/);
    assert.ok(!result.material.includes('per ottenere valuta'));
    assert.equal(result.overrides.length, 1);
    assert.match(result.material, /Rettifica del docente: economia, desc/);
    assert.equal(result.sourcesArr[0].text, 'La BNS acquistò oro.');
    assert.equal(G.materialForNodes(dbFor([]), [node], originals, review), G.buildInput(dbFor([]), [node], originals, review).material);
});

test('grounding: fonti assenti e parafrasi non diventano citazioni', () => {
    const absent = G.buildInput(dbFor([chunk('La BNS acquistò oro.')]), [node], []);
    assert.equal(absent.sourcesArr.length, 0);
    assert.match(absent.material, /Testo originale non disponibile/);
    const paraphrase = G.buildInput(dbFor([{ ...chunk('La BNS acquistò oro.'), parafrasi: true }]), [node], originals);
    assert.ok(!paraphrase.nodesListText.includes('Passaggi originali:'));
    assert.equal(paraphrase.sourcesArr[0].text, originals[0].pages[0].text);
});

test('grounding: risolve soltanto ID del registro e segnala riferimenti inventati', () => {
    const input = G.buildInput(dbFor([chunk('La BNS acquistò oro.')]), [node], originals);
    const id = input.sourcesArr[0].id;
    const resolved = G.resolveCitations('Acquistò oro [[' + id + ']]. Altro [[src-inesistente]]. [[src-inesistente]]', input.sourcesArr);
    assert.equal(resolved.text, 'Acquistò oro [1]. Altro [[src-inesistente]]. [[src-inesistente]]');
    assert.deepEqual(resolved.unknownIds, ['src-inesistente']);
});

test('grounding: only explicit factual amendments have priority, while the complete decision audit remains unchanged', () => {
    const amendment = { origin: 'teacher', choice: 'accept', before: 'La BNS ricevette valuta dalla Germania.', after: node.desc,
        target: { kind: 'node', id: node.id, field: 'desc' } };
    const rejected = { ...amendment, choice: 'reject', after: amendment.before };
    const review = { overrides: [amendment, rejected, { ...amendment, choice: 'manual', after: amendment.before },
        { ...amendment, after: null }, { ...amendment, choice: undefined }, { ...amendment, origin: 'judge' }] };
    const audit = JSON.stringify(review);
    assert.deepEqual(review.overrides.map(G.isTeacherAmendment), [true, false, false, false, false, false]);
    assert.equal(G.isTeacherAmendment({ ...amendment, before: { a: 1, b: 2 }, after: { b: 2, a: 1 } }), false);
    const input = G.buildInput(dbFor([]), [node], originals, review);
    assert.deepEqual(input.overrides, [amendment]);
    assert.match(input.material, /Le fonti originali sono il riferimento fattuale/);
    assert.equal(JSON.stringify(review), audit);
});

test('grounding: readable citation views round-trip known and unknown anchors without reinterpreting numbered references', () => {
    const source = { id: 'src-a', idx: 7, title: 'Manuale', page: 3, text: 'Estratto originale.' };
    const raw = 'Nota [1], etichetta letterale [Fonte 1]. Fatto [[src-a]]. Altro [[src-missing]], ancora [[src-a]].';
    const view = G.referenceView(raw, [source]);
    assert.equal(view.text, 'Nota [1], etichetta letterale [Fonte 1]. Fatto [Fonte 2]. Altro [Fonte da verificare 3], ancora [Fonte 2].');
    assert.deepEqual(view.unknownIds, ['src-missing']);
    assert.equal(G.restoreReferenceIds(view.text, view.mapping), raw);
    assert.equal(G.restoreReferenceIds(view.text.replace('Fatto', 'Fatto corretto'), view.mapping), raw.replace('Fatto', 'Fatto corretto'));
    assert.ok(!G.restoreReferenceIds(view.text.replace('[Fonte 2]', ''), view.mapping).includes('Fatto [[src-a]]'), 'deleting a reference is a deliberate edit');
    view.mapping[0].source.text = 'Editor copy';
    assert.equal(source.text, 'Estratto originale.');
    assert.equal(G.referenceView('[[src-a]] [[src-unknown]]', [source], { sourceLabel: 'Source', unknownLabel: 'Source to verify' }).text, '[Source 1] [Source to verify 2]');
});
