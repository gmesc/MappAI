'use strict';
/*
 * crea-solo-mappa.test.js — packet 0103 (Giacomo 16/10, strada A).
 * In CREA «solo la mappa» (`mn-genera` senza materiali, `mn-solo-mappa`) fa
 * come il giro coi materiali: niente modale «Per chi è questa mappa?», perché
 * destinatario e materia stanno nel riquadro giallo, e il velo del giro di
 * CREA (0062) dal clic alla mappa.
 * Girano i moduli VERI: il bento (`mappai-costruisci-manifesto.js` +
 * `mappai-bento-composizione.js`) su un DOM cheerio, la presa del velo
 * (`mappai-generazione.js`) e `ensureGenerationContext` presa dal sorgente di
 * `mappai-live-classes.js` (il file intero chiede il DOM dei modali) su uno
 * STORE finto. `startGeneration` (app.js, troppo grande per Node) è un finto
 * che passa l'opzione come la riga vera e FOTOGRAFA lo stato a metà giro.
 * ⚠️ Con cheerio si asserisce solo su booleani, testi e numeri (memoria
 * «Test col DOM finto»).
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const cheerio = require('cheerio');

const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const giro = () => new Promise(r => setImmediate(r));

/* `ensureGenerationContext` vera, dal sorgente: da `STORE.ensureGenerationContext =` al modale */
function sorgenteContesto() {
    const src = read('public/js/mappai-live-classes.js');
    const da = src.indexOf('STORE.ensureGenerationContext = function');
    const a = src.indexOf('// Modale «Per quale classe e disciplina?»');
    assert.equal(da > 0 && a > da, true, 'ensureGenerationContext non trovata in mappai-live-classes.js');
    return src.slice(da, a);
}

/* Lo STORE finto: classi, allievi, contesto attivo (classe XOR allievo) e materia attiva. */
function store(w, classi, allievi) {
    const s = { id: '', allievo: null, disc: '' };
    const chiesti = [];
    const STORE = {
        loaded: true, load: () => Promise.resolve(),
        list: () => classi.slice(), get: id => classi.find(c => c.id === id) || null,
        students: () => allievi.slice(),
        activeId: () => s.id, getActive: () => (s.id ? STORE.get(s.id) : null),
        activeStudentName: () => (s.allievo ? s.allievo.nickname : ''),
        setActive: id => { s.id = id || ''; if (id) s.allievo = null; },
        setActiveStudent: p => { s.allievo = p || null; if (p) s.id = ''; },
        activeDiscipline: () => s.disc, setActiveDiscipline: d => { s.disc = d || ''; },
        disciplineChoices: c => (c && c.materie) || []
    };
    /* il modale: si conta, e risponde come un clic su «Genera» col contesto attivo */
    const _askGenerationContext = cls => { chiesti.push(cls ? cls.id : ''); return Promise.resolve({ classId: s.id, discipline: s.disc }); };
    const fn = new vm.Script('(function (STORE, _askGenerationContext) {' + sorgenteContesto() + '})');
    fn.runInContext(w)(STORE, _askGenerationContext);
    return { STORE, s, chiesti };
}

function crea(opts = {}) {
    const classi = opts.classi || [{ id: 'cls_1', name: '1A', materie: ['Storia'] }, { id: 'cls_2', name: '2B', materie: ['Storia', 'Geografia'] }];
    const allievi = opts.allievi || [{ nickname: 'Lea' }];
    const $ = cheerio.load('<html><head></head><body><div id="generation-details-card"></div><div id="loading-overlay"></div></body></html>');
    const cache = new WeakMap(), ascolti = [];
    const bool = (n, k) => ({ get() { return n.attribs[k] !== undefined; }, set(v) { if (v) $(n).attr(k, ''); else $(n).removeAttr(k); } });
    function wrap(n) {
        if (!n) return null;
        if (cache.has(n)) return cache.get(n);
        const e = {
            node: n, style: {}, dataset: {},
            classList: {
                add: (...c) => { $(n).addClass(c.join(' ')); },
                remove: (...c) => { c.forEach(x => $(n).removeClass(x)); },
                toggle: (c, force) => { const on = force === undefined ? !$(n).hasClass(c) : !!force; if (on) $(n).addClass(c); else $(n).removeClass(c); return on; },
                contains: c => $(n).hasClass(c)
            },
            get innerHTML() { return $(n).html(); }, set innerHTML(v) { $(n).html(String(v)); },
            get textContent() { return $(n).text(); }, set textContent(v) { $(n).text(String(v)); },
            get id() { return $(n).attr('id') || ''; }, set id(v) { $(n).attr('id', String(v)); },
            /* una <select> senza valore scritto vale la sua <option selected>, come nel browser */
            get value() {
                const v = $(n).attr('value');
                if (v !== undefined || n.tagName !== 'select') return v || '';
                return $(n).find('option[selected]').attr('value') || '';
            },
            set value(v) { $(n).attr('value', String(v)); },
            get type() { return $(n).attr('type') || ''; },
            get title() { return $(n).attr('title') || ''; }, set title(v) { $(n).attr('title', String(v)); },
            get parentNode() { return wrap(n.parent); },
            getAttribute: k => { const v = $(n).attr(k); return v === undefined ? null : v; },
            setAttribute: (k, v) => { $(n).attr(k, String(v)); },
            removeAttribute: k => { $(n).removeAttr(k); },
            querySelector: s => wrap($(n).find(s)[0]),
            querySelectorAll: s => $(n).find(s).toArray().map(wrap),
            contains: c => !!c && (c.node === n || $(n).find(c.node).length > 0),
            closest: s => wrap($(n).closest(s)[0]),
            appendChild: c => { $(n).append(c.node); return c; },
            insertBefore: (c, ref) => { if (ref) $(ref.node).before(c.node); else $(n).append(c.node); return c; },
            addEventListener: (tipo, fn) => { ascolti.push({ tipo, fn }); }, removeEventListener() {}, remove: () => { $(n).remove(); }
        };
        for (const k of ['hidden', 'checked', 'disabled']) Object.defineProperty(e, k, bool(n, k));
        cache.set(n, e);
        return e;
    }
    const document = {
        readyState: 'complete', documentElement: wrap($('html')[0]), body: wrap($('body')[0]),
        getElementById: id => wrap($('[id]').toArray().find(el => el.attribs.id === id)),
        createElement: tag => wrap($('<' + tag + '></' + tag + '>')[0]),
        createComment: () => wrap($('<span></span>')[0]),
        querySelector: s => wrap($(s)[0]), querySelectorAll: s => $(s).toArray().map(wrap),
        addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; }
    };
    const storage = new Map(Object.entries(Object.assign({ mappai_bento_default_v1: '1' }, opts.storage || {})));
    const log = { toasts: [], messaggi: [], foto: [], allaMappa: 0 };
    const w = {
        console: { log() {}, warn() {}, error() {}, info() {} }, document,
        setTimeout: () => 0, clearTimeout() {},
        CustomEvent: class { constructor(n, o) { this.type = n; this.detail = o && o.detail; } },
        getComputedStyle: () => ({ position: 'relative' }),
        localStorage: { getItem: k => (storage.has(k) ? storage.get(k) : null), setItem: (k, v) => storage.set(k, String(v)), removeItem: k => storage.delete(k) },
        t: (_k, f) => f, safeCreateIcons() {},
        showToast: (m, tipo) => log.toasts.push({ m, tipo }),
        showLoadingOverlay: m => { log.messaggi.push(m === false ? false : String(m)); },
        MappAIPipeline: { _startFromModal() { log.foto.push('pipeline'); }, _hasOutputNow: () => !!opts.materiali, _interno: false },
        appState: { sources: [], db: { nodes: [], links: [] } }
    };
    w.window = w;
    vm.createContext(w);
    const st = store(w, classi, allievi);
    w.MappAIClasses = st.STORE;
    vm.runInContext(read('public/js/mappai-generazione.js'), w, { filename: 'mappai-generazione.js' });
    const veraAllaMappa = w.MappAIGen.allaMappa;
    w.MappAIGen.allaMappa = () => { log.allaMappa++; veraAllaMappa(); };
    /* `startGeneration` finto: passa l'opzione come `app.js` e fotografa la presa a metà */
    w.startGeneration = async function (options) {
        const genCtx = await w.MappAIClasses.ensureGenerationContext(options && options.contestoDaCrea ? { contestoDaCrea: true } : undefined);
        log.foto.push({
            opzioni: options || null, ctx: genCtx,
            presa: w.MappAIGen.presa(), tela: w.MappAIGen.tela(),
            veloFinestra: document.documentElement.classList.contains('mappai-velo-finestra')
        });
        if (!genCtx) return;
        if (opts.lancia) throw new Error('motore rotto');
        return opts.senzaMappa ? undefined : true;
    };
    w.MappAIBento = require('../public/js/mappai-bento-composizione.js');
    vm.runInContext(read('public/js/mappai-costruisci-manifesto.js'), w, { filename: 'mappai-costruisci-manifesto.js' });
    w.MappAICostruisci.montaBento();
    const spara = (tipo, id) => {
        const target = document.getElementById(id);
        assert.equal(!!target, true, id + ' non montato');
        ascolti.filter(a => a.tipo === tipo).forEach(a => a.fn({ target }));
    };
    const scegli = (id, valore) => { document.getElementById(id).value = valore; spara('change', id); };
    const montaSoloMappa = () => { const b = document.createElement('button'); b.id = 'mn-solo-mappa'; document.body.appendChild(b); };
    return { w, st, log, spara, scegli, montaSoloMappa, generazioni: () => log.foto.filter(f => typeof f === 'object') };
}

/* ── i due ingressi della sola mappa ─────────────────────────────────────── */

for (const ingresso of ['mn-genera', 'mn-solo-mappa']) {
    test('0103: ' + ingresso + ' (solo la mappa) — niente modale, velo del giro di CREA dal clic alla mappa, presa lasciata alla fine', async () => {
        const c = crea();
        if (ingresso === 'mn-solo-mappa') c.montaSoloMappa();
        c.scegli('mp-chi', 'c:cls_1');
        c.spara('click', ingresso);
        await giro();
        const g = c.generazioni();
        assert.equal(g.length, 1, 'una generazione');
        assert.equal(c.st.chiesti.length, 0, 'il modale «Per chi è questa mappa?» non si apre');
        assert.equal(g[0].opzioni && g[0].opzioni.contestoDaCrea, true);
        assert.equal(g[0].ctx.classId, 'cls_1');
        assert.equal(g[0].ctx.discipline, 'Storia');
        assert.equal(g[0].presa, true, 'presa durante la generazione');
        assert.equal(g[0].tela, false, 'fino alla mappa il velo è a tutta finestra');
        assert.equal(g[0].veloFinestra, true);
        assert.equal(c.log.messaggi[0], 'Genero la mappa…');
        assert.equal(c.log.allaMappa, 1, 'il velo cade sulla mappa');
        assert.equal(c.w.MappAIGen.presa(), false, 'a fine giro la presa è lasciata');
        assert.equal(c.w.document.documentElement.classList.contains('mappai-velo-finestra'), false);
    });
}

test('0103: classe a due materie con «Cosa» scelto, allievo — niente modale; la materia è quella della pipeline', async () => {
    const casi = [
        { nome: 'classe 2B, Geografia', chi: 'c:cls_2', cosa: 'Geografia' },
        { nome: 'allievo Lea, Storia', chi: 's:0', cosa: 'Storia' }
    ];
    const misure = [];
    for (const k of casi) {
        const c = crea();
        c.scegli('mp-chi', k.chi);
        c.scegli('mp-disc', k.cosa);
        c.spara('click', 'mn-genera');
        await giro();
        const g = c.generazioni();
        assert.equal(g.length, 1, k.nome + ': una generazione');
        assert.equal(c.st.chiesti.length, 0, k.nome + ': nessun modale');
        /* la pipeline: stesso riquadro giallo, `ensureGenerationContext()` con `_interno` */
        c.w.MappAIPipeline._interno = true;
        const pipe = await c.w.MappAIClasses.ensureGenerationContext();
        c.w.MappAIPipeline._interno = false;
        assert.deepEqual(JSON.parse(JSON.stringify(g[0].ctx)), JSON.parse(JSON.stringify(pipe)), k.nome + ': stesso contesto della pipeline');
        misure.push(k.nome + ' → materia «' + g[0].ctx.discipline + '», materia attiva «' + c.st.s.disc + '»');
    }
    /* la misura del §5: per l'allievo la materia del contesto è vuota (come nella pipeline),
       la materia attiva resta quella del riquadro e la cartella la legge da lì (`_contestoDellaMappa`) */
    assert.deepEqual(misure, [
        'classe 2B, Geografia → materia «Geografia», materia attiva «Geografia»',
        'allievo Lea, Storia → materia «», materia attiva «Storia»'
    ]);
});

test('0103: errore, annullamento o generazione rifiutata — la presa si lascia sempre, il velo non cade sulla mappa', async () => {
    const rotto = crea({ lancia: true });
    rotto.scegli('mp-chi', 'c:cls_1');
    await assert.rejects(rotto.w.MappAICostruisci.generaSoloMappa(), /motore rotto/);
    assert.equal(rotto.w.MappAIGen.presa(), false, 'errore: presa lasciata');
    assert.equal(rotto.log.allaMappa, 0);

    const vuoto = crea({ senzaMappa: true });       // annullata, o `mappaiOccupato`: `startGeneration` ritorna senza valore
    vuoto.scegli('mp-chi', 'c:cls_1');
    await vuoto.w.MappAICostruisci.generaSoloMappa();
    assert.equal(vuoto.generazioni().length, 1);
    assert.equal(vuoto.w.MappAIGen.presa(), false, 'senza mappa: presa lasciata');
    assert.equal(vuoto.log.allaMappa, 0);
});

test('0103: interruttore del velo spento (mappai_velo_finestra=0) — nessuna presa, la sola mappa genera come prima', async () => {
    const c = crea({ storage: { mappai_velo_finestra: '0' } });
    c.scegli('mp-chi', 'c:cls_1');
    c.spara('click', 'mn-genera');
    await giro();
    const g = c.generazioni();
    assert.equal(g.length, 1);
    assert.equal(g[0].presa, false);
    assert.equal(g[0].veloFinestra, false);
    assert.equal(c.log.messaggi.length, 0, 'nessun messaggio in più: il velo lo accende il motore, come prima');
    assert.equal(c.st.chiesti.length, 0, 'il modale resta tolto anche a velo spento');
});

test('0103: mn-solo-mappa passa dal gate del riquadro giallo — senza «Chi», o senza «Cosa» a due materie, avviso e nessuna partenza', async () => {
    const senzaChi = crea();
    senzaChi.montaSoloMappa();
    senzaChi.spara('click', 'mn-solo-mappa');
    await giro();
    assert.equal(senzaChi.generazioni().length, 0);
    assert.equal(senzaChi.w.MappAIGen.presa(), false);
    assert.equal(senzaChi.log.toasts.map(x => x.m).join('|'), 'Scegli prima CHI: una classe o un allievo');

    const senzaCosa = crea();
    senzaCosa.montaSoloMappa();
    senzaCosa.scegli('mp-chi', 'c:cls_2');
    senzaCosa.spara('click', 'mn-solo-mappa');
    await giro();
    assert.equal(senzaCosa.generazioni().length, 0);
    assert.equal(senzaCosa.log.toasts.map(x => x.m).join('|'), 'Scegli anche COSA: la materia della classe');
});

test('0103: coi materiali spuntati «Genera» va ancora alla pipeline', async () => {
    const c = crea({ materiali: true });
    c.scegli('mp-chi', 'c:cls_1');
    c.spara('click', 'mn-genera');
    await giro();
    assert.equal(c.log.foto.join(','), 'pipeline');
    assert.equal(c.w.MappAIGen.presa(), false, 'la presa la prende la pipeline, non il bento');
});

test('0103: ensureGenerationContext senza opzione (percorso di lettura, form vecchio) mostra ancora il modale', async () => {
    const c = crea();
    c.st.STORE.setActive('cls_1');
    await c.w.MappAIClasses.ensureGenerationContext();
    assert.equal(c.st.chiesti.length, 1);
    await c.w.MappAIClasses.ensureGenerationContext({});
    assert.equal(c.st.chiesti.length, 2, 'un oggetto senza contestoDaCrea non toglie il modale');
});

test('0103: app.js passa a ensureGenerationContext solo l\'opzione di chi chiama; i ?v= portano il marcatore 0103', () => {
    const app = read('public/js/app.js');
    assert.equal(/ensureGenerationContext\(\{ contestoDaCrea: !!\(options && options\.contestoDaCrea\) \}\)/.test(app), true);
    const html = read('public/index.html');
    for (const f of ['js/app.js', 'js/mappai-live-classes.js', 'js/mappai-costruisci-manifesto.js', 'js/mappai-material-pipeline.js']) {
        /* la pipeline tiene i marcatori di chi l'ha toccata prima (la prova del velo vuole `?v=0062-`) */
        assert.equal(new RegExp('src="' + f.replace(/\./g, '\\.') + '\\?v=[0-9-]*0103-').test(html), true, f + ' senza il marcatore 0103');
    }
});

/* ── seguito del gate 3 (Giacomo 16/10): coi soli fogli automatici il bottone è «Genera Mappa» ── */

/* la pipeline VERA su un DOM minimo: solo gli elementi che `_readConfig` chiede */
function pipelineVera(storage, spunte) {
    const els = { 'mn-bento': null };
    els['mn-bento'] = { id: 'mn-bento', querySelector: s => (s[0] === '#' ? els[s.slice(1)] || null : null), querySelectorAll: () => [] };
    for (const id of spunte || []) els[id] = { id, checked: true, value: '' };
    const map = new Map(Object.entries(storage || {}));
    const w = {
        console: { log() {}, info() {}, warn() {}, error() {} },
        document: { getElementById: id => els[id] || null, querySelector: () => null, querySelectorAll: () => [], addEventListener() {},
            body: { appendChild() {} }, documentElement: { classList: { toggle() {}, add() {}, remove() {}, contains: () => false } } },
        localStorage: { getItem: k => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)), removeItem: k => map.delete(k) },
        setTimeout, clearTimeout, t: (_k, f) => f, appState: { db: { nodes: [], links: [] }, sources: [] }
    };
    w.window = w;
    vm.createContext(w);
    w.MappAIPipelineCore = require('../public/js/mappai-pipeline-core.js');
    vm.runInContext(read('public/js/mappai-material-pipeline.js'), w, { filename: 'mappai-material-pipeline.js' });
    return w.MappAIPipeline;
}

test('0103 (gate 3): _soloFogliNow — vero coi soli fogli di Differenziazione, falso con un materiale scelto o con un altro Output', () => {
    const casi = [
        ['Differenziazione, niente spuntato', {}, [], true, true],
        ['Differenziazione + sintesi', {}, ['mp-syn-on'], false, true],
        ['Differenziazione + catena', {}, ['mp-ns-causal'], false, true],
        ['Metacomprensione, niente spuntato', { mappai_crea_output: 'metacomprensione' }, [], false, false]
    ];
    const misure = casi.map(([nome, st, sp]) => { const P = pipelineVera(st, sp); return nome + ': ' + P._soloFogliNow() + '/' + P._hasOutputNow(); });
    assert.deepEqual(misure, casi.map(([nome, , , f, h]) => nome + ': ' + f + '/' + h));
});

test('0103 (gate 3): Differenziazione senza materiali — faccia blu «Genera Mappa», il clic resta la pipeline', async () => {
    const c = crea({ materiali: true });
    c.w.MappAIPipeline._soloFogliNow = () => true;
    c.scegli('mp-chi', 'c:cls_1');
    c.w.MappAICostruisci.aggiornaGate();
    const b = c.w.document.getElementById('mn-genera');
    assert.equal(b.querySelector('span').textContent, 'Genera Mappa');
    assert.equal(b.classList.contains('mn-card--mappa'), true);
    c.spara('click', 'mn-genera');
    await giro();
    assert.equal(c.log.foto.join(','), 'pipeline', 'il clic va a _startFromModal: i fogli li fa la pipeline');
    assert.equal(c.st.chiesti.length, 0);
    /* con un materiale scelto torna «Genera materiali» */
    c.w.MappAIPipeline._soloFogliNow = () => false;
    c.w.MappAICostruisci.aggiornaGate();
    assert.equal(b.querySelector('span').textContent, 'Genera materiali');
    assert.equal(b.classList.contains('mn-card--mappa'), false);
});
