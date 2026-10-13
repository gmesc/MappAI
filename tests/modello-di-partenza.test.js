'use strict';
/*
 * 0093, lotto B — con Infomaniak il modello lo sceglie il docente dal catalogo
 * (Giacomo, 13/10: «il modello lo imposta lo user quando inserisce le credenziali»).
 * Niente nome fisso che può non esistere: finché il docente non sceglie, la tendina
 * dice «— scegli un modello —» e una generazione si ferma chiedendo di sceglierlo.
 * Google resta com'era (`gemini-2.0-flash` come ripiego).
 *
 * Le funzioni vere (`renderModelSelect`, il ramo iniziale di `fetchModelAPI`, il
 * `providerConfig` del tutor) si estraggono dal sorgente e girano in una vm con un
 * DOM minimo: i tre file sono troppo grandi per caricarli interi in Node.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');
const MORTO = /mistral-small-4-119B-2603/i;

function fetta(src, da, a) {
    const i = src.indexOf(da);
    assert.ok(i >= 0, 'non trovo: ' + da);
    const j = src.indexOf(a, i);
    assert.ok(j > i, 'non trovo la fine: ' + a);
    return src.slice(i, j);
}

/* ── un <select> minimo, con optgroup e option ── */
function domMinimo() {
    function el(tag) {
        const e = {
            tagName: tag.toUpperCase(), children: [], parent: null, value: '', textContent: '', label: '',
            title: '', disabled: false, _selected: false,
            appendChild(c) { c.parent = e; e.children.push(c); return c; },
            insertBefore(c, ref) { c.parent = e; const k = e.children.indexOf(ref); e.children.splice(k < 0 ? 0 : k, 0, c); return c; },
            set innerHTML(_v) { e.children = []; }
        };
        Object.defineProperty(e, 'selected', {
            get() { return e._selected; },
            set(v) { if (v) tutte(radice(e)).forEach(o => { o._selected = false; }); e._selected = !!v; }
        });
        return e;
    }
    function radice(e) { while (e.parent) e = e.parent; return e; }
    function tutte(s) { const out = []; (function giu(n) { n.children.forEach(c => { if (c.tagName === 'OPTION') out.push(c); else giu(c); }); })(s); return out; }
    const select = el('select');
    Object.defineProperty(select, 'options', { get() { return tutte(select); } });
    Object.defineProperty(select, 'value', {
        get() { const o = tutte(select).find(x => x._selected) || tutte(select)[0]; return o ? o.value : ''; },
        set(v) { const o = tutte(select).find(x => x.value === v); tutte(select).forEach(x => { x._selected = false; }); if (o) o._selected = true; }
    });
    return { select, document: { createElement: el } };
}

function renderer(provider) {
    const src = read('public/js/mappai-ui-modals.js');
    const codice = fetta(src, 'function renderModelSelect(', '\nwindow.refreshGeminiModels');
    const { select, document } = domMinimo();
    const ctx = { document, appState: { aiProvider: provider }, window: { t: (_k, f) => f }, CAP_LABELS: {} };
    vm.createContext(ctx);
    vm.runInContext(codice + '\nthis.renderModelSelect = renderModelSelect;', ctx);
    return { render: (models, cur) => ctx.renderModelSelect(models, select, cur), select };
}

const CATALOGO = [{ id: 'google/gemma-4-31B-it', displayName: 'Gemma 4' }, { id: 'mistralai/Mistral-Small-4-119B-2603', displayName: 'Mistral Small 4' }];

test('B: Infomaniak senza scelta → «— scegli un modello —» selezionata, valore vuoto, nessuna voce morta', () => {
    const r = renderer('infomaniak');
    r.render(CATALOGO, '');
    const testi = r.select.options.map(o => o.textContent);
    assert.equal(r.select.value, '');
    assert.equal(testi[0], '— scegli un modello —');
    assert.equal(r.select.options[0].disabled, true, 'la voce vuota non si sceglie dalla tendina');
    assert.equal(testi.some(x => /Non disponibile/.test(x)), false);
    assert.equal(testi.some(x => MORTO.test(x)), false);
});

test('B: Infomaniak con una scelta salvata nel catalogo la seleziona; una scelta salvata assente la mostra come oggi', () => {
    const r = renderer('infomaniak');
    r.render(CATALOGO, 'google/gemma-4-31B-it');
    assert.equal(r.select.value, 'google/gemma-4-31B-it');
    assert.equal(r.select.options.some(o => o.value === ''), false);
    r.render(CATALOGO, 'vecchio/modello-tolto');
    assert.equal(r.select.value, 'vecchio/modello-tolto');
    assert.equal(r.select.options.some(o => /vecchio\/modello-tolto — Non disponibile nel catalogo aggiornato/.test(o.textContent)), true);
});

test('B: Google invariato — senza scelta prende la prima voce, senza voce vuota', () => {
    const r = renderer('google');
    r.render([{ id: 'gemini-2.0-flash', displayName: 'Gemini 2.0 Flash', kb: { tier: '⚡ Veloce', free: true, caps: ['text'] } }], '');
    assert.equal(r.select.value, 'gemini-2.0-flash');
    assert.equal(r.select.options.some(o => o.value === ''), false);
});

test('B: all\'avvio il modello di partenza di Infomaniak è vuoto, quello di Google resta gemini-2.0-flash', () => {
    const src = read('public/js/mappai-storage-lang.js');
    assert.equal(/const defaultModel = isInfomaniak \? '' : 'gemini-2\.0-flash';/.test(src), true);
    assert.equal(MORTO.test(src), false);
});

/* il ramo iniziale di fetchModelAPI, fino alla prima riga dopo la scelta del modello */
function fetchIniziale(provider, salvato) {
    const src = read('public/js/app.js');
    const corpo = fetta(src, 'window.fetchModelAPI = async function', '    // ── Gemini 2.5+');
    const chiamate = [];
    const ctx = {
        appState: { aiProvider: provider },
        document: { getElementById: () => null },
        localStorage: { getItem: k => (k === 'infomaniak_selected_model' || k === 'gemini_selected_model') ? (salvato || null) : null },
        window: { t: (_k, f) => f, electronAPI: { generateInfomaniak: x => chiamate.push(x), generateGemini: x => chiamate.push(x) } }
    };
    vm.createContext(ctx);
    vm.runInContext(corpo.replace('window.fetchModelAPI = async function', 'this.f = async function') +
        '\n    return { provider, model };\n};', ctx);
    return { run: () => ctx.f({ contents: [] }, 'chiave'), chiamate };
}

test('B: fetchModelAPI su Infomaniak senza modello si ferma con un messaggio leggibile e non chiama nessuno', async () => {
    const f = fetchIniziale('infomaniak', '');
    await assert.rejects(f.run(), { message: 'Scegli il modello AI prima di generare.' });
    assert.equal(f.chiamate.length, 0);
});

test('B: fetchModelAPI — Infomaniak con scelta la usa; Google senza scelta usa gemini-2.0-flash', async () => {
    const info = await fetchIniziale('infomaniak', 'google/gemma-4-31B-it').run();
    assert.equal(info.provider + ' ' + info.model, 'infomaniak google/gemma-4-31B-it');
    const goo = await fetchIniziale('google', '').run();
    assert.equal(goo.provider + ' ' + goo.model, 'google gemini-2.0-flash');
});

test('B: app.js non contiene più il nome morto; la modifica sta tutta nel ramo `if (!model)`', () => {
    assert.equal(MORTO.test(read('public/js/app.js')), false);
});

test('B: il tutor senza modello Infomaniak non inventa un nome e «Avvia» si ferma col messaggio', () => {
    const src = read('public/js/mappai-tutor-teacher.js');
    assert.equal(MORTO.test(src), false);
    const codice = fetta(src, 'function providerConfig(override)', '\n    // ── Wizard');
    const mk = (provider, salvato) => {
        const ctx = {
            S: () => ({ aiProvider: provider, infomaniakProductId: '123' }),
            document: { getElementById: () => null },
            localStorage: { getItem: k => (/selected_model$/.test(k) ? (salvato || null) : null) },
            window: { getProviderKey: () => 'chiave' }
        };
        vm.createContext(ctx);
        vm.runInContext(codice + '\nthis.pc = providerConfig;', ctx);
        return ctx.pc();
    };
    assert.equal(mk('infomaniak', '').model, null);
    assert.equal(mk('infomaniak', 'google/gemma-4-31B-it').model, 'google/gemma-4-31B-it');
    assert.equal(mk('google', '').model, 'gemini-2.0-flash');
    assert.equal(/if \(!pc\.model\) \{ toast\(t\('modello_da_scegliere'/.test(src), true);
});

test('B: la chiave nuova è solo in inglese', () => {
    assert.equal(/\bmodello_da_scegliere:/.test(read('public/traduzioni/en_translations.js')), true);
    assert.equal(/\bmodello_da_scegliere:/.test(read('public/traduzioni/it_translations.js')), false);
});

/* Gate di Giacomo (13/10): da CREA senza modello comparivano DUE avvisi — «Scegli il modello AI prima di
   generare.» dal motore della mappa e poi «Pipeline interrotta: … mappa troppo piccola». Ora `Pipeline.run`
   si ferma prima di tutto: un avviso solo, nessuna generazione, nessun velo. */
function pipeline(provider, o = {}) {
    const store = new Map(Object.entries(o.storage || {}));
    const toasts = [], generazioni = [];
    const sel = { value: o.scelto || '' };
    const ctx = vm.createContext({
        console: { log() {}, info() {}, warn() {}, error() {} }, setTimeout, clearTimeout,
        localStorage: { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) },
        document: { getElementById: id => (id === 'model-select' ? sel : null), querySelector: () => null, querySelectorAll: () => [],
            addEventListener() {}, readyState: 'complete', documentElement: { classList: { add() {}, remove() {}, contains: () => false } } },
        appState: { aiProvider: provider, db: { nodes: [], links: [] }, rootNodeLabel: 'PROVA 0093', sources: [] },
        CustomEvent: class { constructor(n) { this.type = n; } }
    });
    ctx.window = ctx;
    Object.assign(ctx, { showToast: (m, t) => toasts.push({ m: String(m), t }), t: (_k, f) => f, getSystemKey: () => 'chiave-finta',
        startGeneration: async () => { generazioni.push(1); throw new Error('fine della prova'); } });
    if (o.modelliPerFase) ctx.MappAIModelli = { acceso: () => true, avvia: () => null };
    vm.runInContext(read('public/js/mappai-material-pipeline.js'), ctx);
    return { run: (cfg, op) => ctx.MappAIPipeline.run(cfg || { quiz: { types: ['mc'] } }, op || { daCrea: true }), toasts, generazioni, w: ctx };
}

test('B (gate): da CREA con Infomaniak senza modello, Pipeline.run si ferma prima: un avviso solo, nessuna generazione', async () => {
    const p = pipeline('infomaniak');
    await p.run();
    assert.equal(p.generazioni.length, 0, 'il motore della mappa non parte');
    assert.equal(p.toasts.length, 1);
    assert.equal(p.toasts[0].m, 'Scegli il modello AI prima di generare.');
    assert.equal(p.toasts[0].t, 'error');
    assert.equal(p.w.MappAIPipeline._running, false, 'il lucchetto non resta chiuso');
});

test('B (gate): con un modello scelto (tendina o salvato), con Google o coi modelli per fase si parte come prima', async () => {
    for (const p of [pipeline('infomaniak', { scelto: 'google/gemma-4-31B-it' }),
        pipeline('infomaniak', { storage: { infomaniak_selected_model: 'google/gemma-4-31B-it' } }),
        pipeline('google'), pipeline('infomaniak', { modelliPerFase: true })]) {
        await p.run();
        assert.equal(p.toasts.some(t => /Scegli il modello/.test(t.m)), false);
    }
    const p = pipeline('infomaniak', { scelto: 'google/gemma-4-31B-it' });
    await p.run();
    assert.equal(p.generazioni.length, 1, 'il motore della mappa parte');
});
