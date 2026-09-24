'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const cheerio = require('cheerio');
const Core = require('../public/js/mappai-link-editor-core');
const Review = require('../public/js/mappai-review-core');
const ModalCore = require('../public/js/mappai-modal-core');
const Relations = require('../public/js/mappai-relations');
const copy = x => JSON.parse(JSON.stringify(x));
const db = () => ({ nodes: [{ id: 'a', label: 'Gestione dell’accerchiamento' }, { id: 'b', label: 'Diplomazia della neutralità' }],
    links: [{ source: 'a', target: 'b', rel: 'avviene in', isCross: true, bridgeAuthor: 'Docente', evidence: { page: 4 } }], sourcesDict: {} });

test('one relation changes, D3 identities and unrelated metadata survive', () => {
    const data = db(), link = data.links[0];
    link.source = data.nodes[0]; link.target = data.nodes[1];
    const ref = Core.reference(link), changed = Core.withLabel(data, ref, ' influenza ');
    assert.equal(changed.links[0].rel, 'influenza');
    assert.equal(changed.links[0].source, 'a');
    assert.deepEqual(changed.links[0].evidence, { page: 4 });
    assert.equal(changed.links[0].bridgeAuthor, 'Docente');
    assert.equal(link.rel, 'avviene in');
    assert.deepEqual(Core.labels(data, ref), data.nodes.map(n => n.label));
    assert.throws(() => Core.find(changed, ref), /link_changed/);
    data.links.push(copy(link)); assert.throws(() => Core.find(data, ref), /link_changed/);
    data.links[0].id = 'unique'; assert.equal(Core.find(data, Core.reference(link)), link);
});

test('manual decision leaves the map/report/other decisions intact and applies through review', () => {
    const data = db(), ref = Core.reference(data.links[0]);
    let review = Review.createReview({ db: data, sources: [], report: { checkStatus: 'completed', issues: [
        { id: 'other', target: { kind: 'node', id: 'a', field: 'label' }, after: 'Titolo alternativo' }
    ] } });
    review = Review.setDecision(review, 'other', 'reject');
    const old = copy(review);
    const edited = Core.decision(review, data, ref, 'influenza', { problem: 'Docente', now: 'today' });
    assert.deepEqual(review, old);
    assert.equal(data.links[0].rel, 'avviene in');
    assert.deepEqual(edited.initial.decisions.other, old.initial.decisions.other);
    assert.deepEqual(edited.initial.report, old.initial.report);
    assert.equal(Core.draft(edited, ref), 'influenza');
    const result = Review.beginApproval(edited, data, { sources: [] });
    assert.equal(result.ok, true); assert.equal(result.db.links[0].rel, 'influenza');
    assert.equal(Review.gate(edited, data, []).allowed, false, 'saving does not approve');
    const twice = Core.decision(edited, data, ref, 'precede', { problem: 'Docente' });
    assert.equal(twice.initial.issues.length, edited.initial.issues.length);
    assert.equal(Core.draft(twice, ref), 'precede');
    assert.throws(() => Core.decision(review, data, ref, ' ', {}), /empty_review_label/);
    assert.throws(() => Core.decision(review, Core.withLabel(data, ref, 'segue'), { ...ref, rel: 'segue' }, 'precede', {}), /stale_revision/);
});

test('parallel connections cannot acquire an ambiguous identity', () => {
    const data = db(), ref = Core.reference(data.links[0]);
    data.links.push({ source: 'a', target: 'b', rel: 'precede' });
    assert.throws(() => Core.withLabel(data, ref, 'precede'), /ambiguous_label/);
    assert.equal(data.links[0].rel, 'avviene in');
});

test('vault guard accepts an intentional edit but approval is invalid until rechecked; Undo restores it', () => {
    const path = require('node:path'), os = require('node:os'), Store = require('../public/js/mappai-review-store');
    const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'mappai-link-editor-'));
    try {
        const data = db(), ref = Core.reference(data.links[0]);
        const initial = Review.createReview({ db: data, sources: [], report: { checkStatus: 'completed' } });
        const approved = Review.beginApproval(initial, data, { sources: [] });
        const review = Review.completeApproval(approved.review, approved.review.approvedRevision);
        Store.saveManifest(folder, { review }, 0);
        const changed = { ...Core.withLabel(data, ref, 'influenza'), reviewRevision: review.approvedRevision };
        Store.checkMapWrite(folder, changed);
        Store.atomicWrite(path.join(folder, 'fixture.json'), JSON.stringify(changed));
        const reopened = JSON.parse(fs.readFileSync(path.join(folder, 'fixture.json')));
        assert.equal(reopened.links[0].rel, 'influenza');
        assert.equal(Review.gate(review, reopened, []).allowed, false);
        const undone = { ...Core.withLabel(reopened, { ...ref, rel: 'influenza' }, ref.rel), reviewRevision: review.approvedRevision };
        Store.checkMapWrite(folder, undone);
        assert.equal(Review.gate(review, undone, []).allowed, true);
        assert.throws(() => Store.checkMapWrite(folder, { ...changed, reviewRevision: 'old' }), /review-conflict/);
    } finally { fs.rmSync(folder, { recursive: true, force: true }); }
});

// Use the real modal renderer; the small DOM facade only supplies event methods.
function runtime(opts = {}) {
    const $ = cheerio.load('<html><body></body></html>'), wrapped = new WeakMap();
    function wrap(n) {
        if (!n) return null;
        if (wrapped.has(n)) return wrapped.get(n);
        const e = { n, style: {}, listeners: {},
            querySelector: s => wrap($(n).find(s)[0]), querySelectorAll: s => $(n).find(s).toArray().map(wrap),
            appendChild(c) { $(n).append(c.n); }, replaceChildren() { $(n).empty(); },
            setAttribute(k, v) { $(n).attr(k, v); }, getAttribute: k => $(n).attr(k),
            addEventListener(k, fn) { this.listeners[k] = fn; }, focus() {},
            click() { if (!this.disabled) return this.onclick?.(); }
        };
        for (const [key, attr] of [['id', 'id'], ['type', 'type'], ['className', 'class']]) Object.defineProperty(e, key, { get: () => $(n).attr(attr), set: v => $(n).attr(attr, v) });
        Object.defineProperties(e, {
            innerHTML: { get: () => $(n).html(), set: v => $(n).html(v) },
            textContent: { get: () => $(n).text(), set: v => $(n).text(v) },
            value: { get: () => $(n).val(), set: v => $(n).val(v) },
            disabled: { get: () => $(n).attr('disabled') != null, set: v => v ? $(n).attr('disabled', 'disabled') : $(n).removeAttr('disabled') }
        }); wrapped.set(n, e); return e;
    }
    const document = { createElement: tag => wrap($('<' + tag + '>')[0]), getElementById: id => wrap($('#' + id)[0]), addEventListener() {} };
    const st = { db: db(), activeVaultPath: opts.local ? '' : '/fixture' }, calls = [], toasts = [];
    let schema, box, resolve;
    const window = { MappAILinkEditorCore: Core, MappAIRelations: Relations, currentLanguage: opts.lang || 'it',
        t: (key, fallback) => fallback, showToast: (...x) => toasts.push(x),
        MappAIReview: { current: () => undefined, isBusy: () => false },
        buildVaultMapData: () => ({ ...st.db, reviewRevision: 'token' }), renderGraph() {},
        electronAPI: { saveVault: async args => { calls.push(copy(args)); if (opts.switchProject) st.activeVaultPath = '/another'; return opts.fail ? { success: false, error: 'Disco pieno' } : { success: true }; } },
    };
    const ctx = vm.createContext({ window, document, self: window, console, localStorage: { getItem: () => opts.off ? '0' : null }, appState: st,
        StorageManager: { currentProjectId: 'fixture' } });
    window.MappAIModalCore = ModalCore;
    vm.runInContext(fs.readFileSync(require.resolve('../public/js/mappai-modal'), 'utf8'), ctx);
    const renderer = window.MappAIModal;
    window.MappAIModal = { open: s => {
        schema = s; assert.equal(ModalCore.validaSchema(s).ok, true);
        box = renderer.render(s); $('body').append(box.n);
        box.querySelector('[data-azione="__chiudi"]').onclick = () => { $(box.n).remove(); resolve(null); };
        s.suApertura(box); return new Promise(r => { resolve = r; });
    } };
    for (const file of ['mappai-undo', 'mappai-link-editor']) vm.runInContext(fs.readFileSync(require.resolve('../public/js/' + file), 'utf8'), ctx);
    return { st, window, calls, toasts, opts, open: () => window.MappAILinkEditor.open(st.db.links[0]),
        input(value) { const input = box.querySelector('[data-campo="relation"]'); input.value = value; input.listeners.input(); },
        save() { schema.suAzione({ azione: 'save' }); }, cancel() { resolve(null); },
        text: () => $('body').text(), box: () => box };
}
const tick = () => new Promise(resolve => setImmediate(resolve));

test('Nessuna is explicit in review, survives approval and can be changed back', () => {
    const data = db(), ref = Core.reference(data.links[0]);
    const original = Review.createReview({ db: data, sources: [], report: { checkStatus: 'completed' } });
    const edited = Core.decision(original, data, ref, '', { relNone: true, problem: 'Nessuna' });
    assert.equal(Core.draft(edited, ref), ''); assert.equal(Core.draftNone(edited, ref), true);
    assert.equal(data.links[0].rel, ref.rel);
    const result = Review.beginApproval(edited, data, { sources: [] });
    assert.equal(result.ok, true, JSON.stringify(result.conflicts));
    assert.equal(result.db.links[0].rel, ''); assert.equal(result.db.links[0].relNone, true);
    assert.equal(result.review.approvedSnapshot.links[0].rel, '');
    const approved = Review.completeApproval(result.review, result.revision);
    assert.equal(Review.gate(approved, result.db, []).allowed, true);
    const back = Core.decision(edited, data, ref, 'comprende', { problem: 'Rinomina' });
    assert.equal(back.initial.issues.length, 1); assert.equal(Core.draftNone(back, ref), false);
    assert.equal(Review.beginApproval(back, data, { sources: [] }).db.links[0].relNone, undefined);
    const legacy = copy(data); legacy.links[0].rel = '';
    const legacyInclude = copy(legacy); legacyInclude.links[0].rel = 'include';
    assert.equal(Review.revision(legacy, []), Review.revision(legacyInclude, []));
    assert.notEqual(Review.revision(result.db, []), Review.revision(legacy, []));
});

test('Nessuna UI persists, reopens, restores a word, and both Undo steps restore their states', async () => {
    const h = runtime(); let renders = 0;
    h.window.MappAIStudioView = { refreshLinks: () => renders++ };
    const first = h.open(), select = h.box().querySelector('[data-campo="family"]');
    select.value = 'none'; select.listeners.change();
    assert.equal(h.box().querySelector('[data-campo="relation"]').value, '');
    assert.match(h.text(), /Collegamento senza parole/);
    h.save(); await tick(); await first;
    assert.equal(h.calls[0].mapData.links[0].relNone, true); assert.equal(h.st.db.links[0].relNone, true);
    const second = h.open(); assert.equal(h.box().querySelector('[data-campo="family"]').value, 'none');
    h.input('comprende'); h.save(); await tick(); await second;
    assert.equal(h.st.db.links[0].relNone, undefined);
    await h.window.undoLastAction();
    assert.equal(h.st.db.links[0].rel, ''); assert.equal(h.st.db.links[0].relNone, true);
    await h.window.undoLastAction();
    assert.equal(h.st.db.links[0].rel, 'avviene in'); assert.equal(h.st.db.links[0].relNone, undefined);
    assert.equal(renders, 4);
});

test('empty input is blocked in review; explicit Nessuna uses a decision and preserves the map', async () => {
    const h = runtime(); let review = Review.createReview({ db: h.st.db, report: { checkStatus: 'partial' } });
    h.window.MappAIReview.current = () => review;
    h.window.MappAIReview.editLinkLabel = async (ref, value, opts) => {
        const prev = review; review = Core.decision(review, h.st.db, ref, value, opts);
        return () => { review = prev; };
    };
    const pending = h.open(); h.input(''); h.save(); await tick();
    assert.match(h.text(), /scegli «Nessuna»/); assert.equal(review.initial.issues.length, 0);
    const select = h.box().querySelector('[data-campo="family"]'); select.value = 'none'; select.listeners.change();
    h.save(); await tick(); await pending;
    assert.equal(h.calls.length, 0); assert.equal(h.st.db.links[0].rel, 'avviene in');
    const reopened = h.open(); assert.equal(h.box().querySelector('[data-campo="family"]').value, 'none');
    h.cancel(); await reopened;
    await h.window.undoLastAction(); assert.equal(review.initial.issues.length, 0);
});

test('UI preview, cancel and unchanged save have no side effects', async () => {
    const h = runtime(), done = h.open();
    h.input('<img src=x> influenza'); assert.ok(h.text().includes('<img src=x> influenza'));
    assert.equal(h.box().querySelectorAll('img').length, 0);
    h.cancel(); await done; assert.equal(h.calls.length, 0); assert.equal(h.window.undoStack.length, 0);
    const again = h.open(); h.save(); await again; assert.equal(h.calls.length, 0);
});

test('save and scoped Undo both persist; other link metadata stays intact', async () => {
    const h = runtime(), done = h.open(); h.input('influenza'); h.save(); await tick(); await done;
    assert.equal(h.calls[0].mapData.reviewRevision, 'token');
    assert.equal(h.calls[0].mapData.links[0].rel, 'influenza');
    assert.equal(h.st.db.links[0].rel, 'influenza');
    h.st.db.links[0].bridgeAuthor = 'Nuova nota';
    await h.window.undoLastAction();
    assert.equal(h.calls[1].mapData.links[0].rel, 'avviene in');
    assert.equal(h.st.db.links[0].bridgeAuthor, 'Nuova nota');
    assert.equal(h.window.undoStack.length, 0);
});

test('write failure retains draft, map and undo; retry works', async () => {
    const h = runtime({ fail: true }), done = h.open(); h.input('precede'); h.save(); await tick();
    assert.match(h.text(), /Disco pieno/); assert.equal(h.st.db.links[0].rel, 'avviene in');
    assert.equal(h.window.undoStack.length, 0); assert.equal(h.box().querySelector('[data-campo="relation"]').value, 'precede');
    h.opts.fail = false; h.save(); await tick(); await done;
    assert.equal(h.st.db.links[0].rel, 'precede');
});

test('stale project is not modified and stale Undo does not pop history', async () => {
    const h = runtime(), done = h.open(); h.input('precede'); h.st.activeVaultPath = '/other'; h.save(); await tick();
    assert.equal(h.calls.length, 0); assert.match(h.text(), /progetto.*cambiato/); h.cancel(); await done;
    const g = runtime(), saved = g.open(); g.input('precede'); g.save(); await tick(); await saved;
    g.st.activeVaultPath = '/other'; await g.window.undoLastAction();
    assert.equal(g.calls.length, 1); assert.equal(g.window.undoStack.length, 1);
});

test('local map says it is local; switch and busy guard remain available', async () => {
    const h = runtime({ local: true }), done = h.open(); h.input(''); h.save(); await tick(); await done;
    assert.equal(h.calls.length, 0); assert.equal(h.st.db.links[0].rel, '');
    assert.match(h.toasts.at(-1)[0], /Esporta/);
    assert.equal(runtime({ off: true }).window.MappAILinkEditor.enabled(), false);
    const g = runtime(); g.window.MappAIGen = { attiva: () => true }; await g.open();
    assert.match(g.toasts.at(-1)[0], /Attendi/); assert.equal(g.calls.length, 0);
});

test('family selection only suggests; choosing a word updates the complete sentence', async () => {
    const h = runtime(), done = h.open();
    const select = h.box().querySelector('[data-campo="family"]'); select.value = 'sequenza'; select.listeners.change();
    assert.equal(h.box().querySelector('[data-campo="relation"]').value, 'avviene in');
    h.box().querySelectorAll('[data-sez="suggestions"] button').find(b => b.textContent === 'precede').click();
    assert.match(h.box().querySelector('[data-sez="preview"]').textContent, /accerchiamento → precede → Diplomazia/);
    h.cancel(); await done; assert.equal(h.calls.length, 0);
});

test('a pending review uses its decision writer, explains delayed application and never writes the map', async () => {
    const h = runtime(); let review = Review.createReview({ db: h.st.db, sources: [], report: { checkStatus: 'partial' } });
    h.window.MappAIReview.current = () => review;
    h.window.MappAIReview.editLinkLabel = async (ref, value) => {
        const previous = review; review = Core.decision(review, h.st.db, ref, value, { problem: 'Docente' });
        return () => { review = previous; };
    };
    const done = h.open(); assert.match(h.text(), /Salva nella revisione/);
    h.input('influenza'); h.save(); await tick(); await done;
    assert.equal(h.calls.length, 0); assert.equal(h.st.db.links[0].rel, 'avviene in');
    assert.match(h.toasts.at(-1)[0], /Conferma la revisione/);
    const reopened = h.open(); assert.equal(h.box().querySelector('[data-campo="relation"]').value, 'influenza');
    h.cancel(); await reopened;
    await h.window.undoLastAction(); assert.equal(review.initial.issues.length, 0);
});
