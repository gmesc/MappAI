'use strict';
/* 0106 (Giacomo, 16/10/2026): «Riprendi» e la G2 lasciata a metà.
   1. con la G2 in attesa, «Riprendi» del modale «pipeline incompleta» riapre il banco della G2 dov'era
      (`Pipeline.completaValidazione`, la strada di «Rivedi contenuti») e non lancia `Pipeline.run` (D1 (a));
   2. la G2 riaperta da «Crea un documento» (`requireStandalone`), chiusa con «più tardi», torna in ELABORA (D2 (a));
   3. «Riprendi › Annulla» ridisegna la console di ELABORA se è aperta (D3 (a)).
   Pipeline e revisione sono i file VERI in una `vm`, su un DOM finto come in tests/materiali-attesa.test.js. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const cheerio = require('cheerio');

const js = f => fs.readFileSync(require.resolve('../public/js/' + f), 'utf8');
const storage = (valori = {}) => ({ getItem: k => (k in valori ? valori[k] : null), setItem() {}, removeItem() {} });
const json = x => JSON.parse(JSON.stringify(x));      /* oggetti di un altro contesto vm */
const PC = require('../public/js/mappai-pipeline-core');

/* Un manifesto con la G1 approvata e la G2 allo stadio dato; i passi B (quiz) già «done»: con la
   revisione B–E producono le bozze PRIMA della G2 (nota dello 0090). Forma di «Elettricità», 16/10. */
function manifesto(stage, conRevisioneG2 = true) {
    const m = PC.createManifest({ quiz: { types: ['open'] } }, { vaultPath: '/vault' });
    m.steps.A.status = 'done';
    m.steps.B.status = 'done';
    m.review = { initial: { status: 'approved' }, approvedRevision: 1, drafts: { B: { 'open-auto': { items: [{ q: 'x' }] } } } };
    if (stage) m.review.final = Object.assign({ stage, items: [{ id: 'i1' }] }, conRevisioneG2 ? { review: { initial: { status: 'awaiting_review' } } } : {});
    return m;
}

function domFinto() {
    const $ = cheerio.load('<html><head></head><body></body></html>'), cache = new WeakMap();
    const document = { addEventListener() {}, removeEventListener() {},
        createElement: tag => wrap($('<' + tag + '></' + tag + '>')[0]),
        querySelector: q => wrap($(q)[0]), querySelectorAll: q => $(q).toArray().map(wrap),
        getElementById: id => wrap($('[id]').toArray().find(n => n.attribs.id === id)) };
    function wrap(node) {
        if (!node) return null;
        if (cache.has(node)) return cache.get(node);
        const style = {};
        const e = { node, style,
            get id() { return $(node).attr('id') || ''; }, set id(v) { $(node).attr('id', v); },
            get className() { return $(node).attr('class') || ''; }, set className(v) { $(node).attr('class', v); },
            get innerHTML() { return $(node).html(); }, set innerHTML(v) { $(node).html(v); },
            get textContent() { return $(node).text(); },
            querySelector: q => wrap($(node).find(q)[0]),
            appendChild(child) { $(node).append(child.node); return child; },
            remove: () => $(node).remove(),
            addEventListener() {}, removeEventListener() {},
            click() { if (e.onclick) return e.onclick(); } };
        cache.set(node, e); return e;
    }
    document.body = wrap($('body')[0]);
    return { document };
}

// ── il modale «Riprendi» della pipeline vera ────────────────────────────────────

function pipeline(m, opz = {}) {
    const dom = domFinto();
    const calls = { run: [], openCurrent: [], open: [], ridisegna: 0, scritture: 0 };
    const win = { t: (_k, f) => f, showToast() {}, showLoadingOverlay() {},
        MappAIPipelineCore: PC,
        MappAIReview: { enabled: () => true, restore: async () => {}, open(vp, mm, o) { calls.open.push(o || null); },
            openCurrent(o) { calls.openCurrent.push(o === undefined ? 'senza' : json(o)); } },
        MappAIAffermazioni: { quarantenaAccesa: () => opz.quarantena !== false, facoltativa: () => false, completo: mm => PC.isComplete(mm) },
        MappAIElaboraConsole: opz.console === false ? undefined : { aperta: () => true, ridisegna() { calls.ridisegna++; return true; } },
        electronAPI: { vaultMaterialsList: async () => ({ ok: true, files: [], manifest: m }),
            saveVaultFile: async () => { calls.scritture++; return { ok: true }; } },
        localStorage: storage(opz.valori || {})
    };
    const st = { rootNodeLabel: 'Elettricità', activeVaultPath: '/vault', db: { nodes: [], links: [], studySets: [] }, sources: [] };
    const sandbox = { window: win, appState: st, document: dom.document, console: { log() {}, info() {}, warn() {}, error() {} },
        setTimeout, clearTimeout, localStorage: storage(opz.valori || {}), StorageManager: { currentProjectId: 'p1' } };
    vm.runInNewContext(js('mappai-material-pipeline.js'), sandbox);
    const P = win.MappAIPipeline;
    P.run = async (config, o) => { calls.run.push(json(o.only)); };
    P.__win = win;
    return { P, calls, d: dom.document };
}

test('D1: G2 in attesa → il modale dice che i materiali aspettano la validazione', async () => {
    const h = pipeline(manifesto('awaiting_review'));
    await h.P.checkResume('/vault');
    const modale = h.d.getElementById('mp-resume');
    assert.ok(modale, 'il modale «Riprendi» c\'è');
    assert.match(modale.textContent, /I materiali aspettano la tua validazione\. Riprenderla\?/);
});

test('D1: G2 in attesa + «Riprendi» → la G2 si riapre con completaValidazione, niente run, niente scritture', async () => {
    for (const [quarantena, atteso] of [[true, { alza: true }], [false, 'senza']]) {
        const h = pipeline(manifesto('awaiting_review'), { quarantena });
        await h.P.checkResume('/vault');
        h.d.getElementById('mpr-yes').click();
        assert.deepEqual(h.calls.run, [], 'Pipeline.run non parte (quarantena ' + quarantena + ')');
        assert.deepEqual(h.calls.openCurrent, [atteso], 'una sola riapertura, la strada di «Rivedi contenuti»');
        assert.equal(h.calls.scritture, 0, 'pipeline.json non si scrive');
        assert.equal(!!h.d.getElementById('mp-resume'), false, 'il modale si chiude');
    }
});

test('D1: col controllo finale interrotto o coi materiali approvati «Riprendi» resta Pipeline.run', async () => {
    const casi = [['checking', true], ['approved', true], ['finalizing', true], ['awaiting_review', false]];
    for (const [stage, conRevisione] of casi) {
        const h = pipeline(manifesto(stage, conRevisione));
        await h.P.checkResume('/vault');
        assert.doesNotMatch(h.d.getElementById('mp-resume').textContent, /aspettano la tua validazione/, stage);
        h.d.getElementById('mpr-yes').click();
        assert.deepEqual(h.calls.run, [['B', 'C', 'D', 'E']], stage + (conRevisione ? '' : ' senza final.review'));
        assert.deepEqual(h.calls.openCurrent, [], stage);
    }
});

test('D1: con «mappai_elabora_attesa» a «0» «Riprendi» riapre comunque la G2 senza run', async () => {
    const h = pipeline(manifesto('awaiting_review'), { valori: { mappai_elabora_attesa: '0' } });
    await h.P.checkResume('/vault');
    h.d.getElementById('mpr-yes').click();
    assert.deepEqual(h.calls.run, []);
    assert.equal(h.calls.openCurrent.length, 1);
});

test('D3: «Annulla» chiude il modale e ridisegna la console di ELABORA aperta; senza console niente', async () => {
    const h = pipeline(manifesto('awaiting_review'));
    await h.P.checkResume('/vault');
    h.d.getElementById('mpr-no').click();
    assert.equal(!!h.d.getElementById('mp-resume'), false);
    assert.equal(h.calls.ridisegna, 1);
    assert.deepEqual(h.calls.run, []);
    assert.deepEqual(h.calls.openCurrent, []);

    const senza = pipeline(manifesto('awaiting_review'), { console: false });
    await senza.P.checkResume('/vault');
    senza.d.getElementById('mpr-no').click();
    assert.equal(!!senza.d.getElementById('mp-resume'), false, 'senza console il modale si chiude e basta');
});

test('D4: tornaInElabora con la mappa già caricata apre ELABORA da lì, senza ricaricare il progetto', () => {
    const h = pipeline(manifesto('awaiting_review'), { console: false });
    const visti = { openProject: [], openFromMap: 0 };
    const win = h.P.__win;
    win.MappAIElabora = { hasMap: () => true, openFromMap() { visti.openFromMap++; }, openProject(id) { visti.openProject.push(id); } };
    assert.equal(h.P.tornaInElabora(), true);
    assert.equal(visti.openFromMap, 1);
    assert.deepEqual(visti.openProject, [], 'niente loadSavedProject: niente lampo della mappa');

    /* senza mappa in memoria (KG, nessun nodo) la strada di prima: openProject del progetto */
    win.MappAIElabora.hasMap = () => false;
    assert.equal(h.P.tornaInElabora(), true);
    assert.deepEqual(visti.openProject, ['p1']);
    assert.equal(visti.openFromMap, 1);
});

test('D4: con la console di ELABORA già aperta si aggiorna e basta', () => {
    const h = pipeline(manifesto('awaiting_review'));
    let aggiorna = 0, apre = 0;
    h.P.__win.MappAIElaboraConsole.aggiorna = () => { aggiorna++; return true; };
    h.P.__win.MappAIElabora = { hasMap: () => true, openFromMap() { apre++; }, openProject() { apre++; } };
    assert.equal(h.P.tornaInElabora(), true);
    assert.equal(aggiorna, 1);
    assert.equal(apre, 0);
});

test('D4: B14 e il dossier non cambiano — `_apriElabora` passa ancora da openProject', () => {
    const src = js('mappai-material-pipeline.js');
    const corpo = src.slice(src.indexOf('function _apriElabora()'), src.indexOf('function _svuotaCrea()'));
    assert.ok(corpo.includes('if (E && id && E.openProject) { E.openProject(id); return true; }'));
    assert.ok(src.includes('function _chiudiCrea() { _svuotaCrea(); return _apriElabora(); }'));
});

// ── requireStandalone della revisione vera ──────────────────────────────────────

function revisione(valori = {}) {
    const calls = { open: [], torna: 0 };
    const st = { activeVaultPath: '/vault', db: { nodes: [{ id: 'a' }], links: [] }, _pipelineManifest: manifesto('awaiting_review') };
    const window = { t: (_k, f) => f, showToast() {}, MappAIMaterialiAttesaCore: require('../public/js/mappai-materiali-attesa-core.js'),
        MappAIPipelineCore: PC, MappAIReviewCore: require('../public/js/mappai-review-core'),
        MappAIAffermazioni: { quarantenaAccesa: () => false },
        MappAIPipeline: { tornaInElabora() { calls.torna++; return true; }, run: async () => {} }, localStorage: storage(valori) };
    const ctx = vm.createContext({ window, appState: st, document: { getElementById: () => null, querySelector: () => null, addEventListener() {} },
        console: { log() {}, warn() {}, info() {}, error() {} }, localStorage: storage(valori), StorageManager: { currentProjectId: 'p1' } });
    vm.runInContext(js('mappai-review.js'), ctx);
    const R = window.MappAIReview;
    R.requireApproved = async () => true;
    R.restore = async () => {};
    R.open = (vp, m, o) => { calls.open.push(o); };
    return { R, calls };
}

test('D2: la G2 riaperta da «Crea un documento» porta dopoChiusura (→ ELABORA) e la continuazione con aElabora', async () => {
    const h = revisione();
    assert.equal(await h.R.requireStandalone(), false);
    const o = h.calls.open[0];
    assert.equal(o.final, true);
    assert.equal(typeof o.dopoChiusura, 'function', '«più tardi» ha dove tornare');
    o.dopoChiusura();
    assert.equal(h.calls.torna, 1, '«più tardi»/ESC/«Chiudi» → tornaInElabora');
    assert.deepEqual(json(o.continua), { aElabora: true });
});

test('D2: con «mappai_elabora_attesa» a «0» requireStandalone apre la G2 come prima', async () => {
    const h = revisione({ mappai_elabora_attesa: '0' });
    await h.R.requireStandalone();
    assert.deepEqual(json(h.calls.open[0]), { final: true });
});

test('B14 resta: la G2 nata da CREA chiude con _chiudiCrea, e la coda di run non cambia', () => {
    const src = js('mappai-material-pipeline.js');
    assert.ok(src.includes("daCrea ? { dopoChiusura: () => _chiudiCrea() } : {},"));
    assert.ok(src.includes("const versoElabora = !daCrea && aElabora === true;"));
});

test('i18n: la chiave del testo nuovo sta nel dizionario inglese', () => {
    const en = fs.readFileSync(require.resolve('../public/traduzioni/en_translations.js'), 'utf8');
    assert.ok(en.includes('\n    mp_resume_g2: "'), 'en: mp_resume_g2');
});
