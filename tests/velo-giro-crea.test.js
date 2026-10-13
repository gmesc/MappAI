'use strict';
/*
 * 0062 — Il velo del giro di CREA: tutta la finestra, fondo pieno, fino alla fine del giro.
 * Girano in Node i moduli VERI: `mappai-generazione.js` (la presa), `mappai-lavori.js` (lo spinner
 * della topbar), `mappai-material-pipeline.js` (`Pipeline.run`, `mappaiOccupato`) e la funzione
 * `window.showLoadingOverlay` presa dal sorgente di `mappai-ui-canvas.js` (il file intero chiede il
 * canvas). Il DOM è finto e piccolo: elementi per id, classi, figli del body.
 * La generazione della mappa (`startGeneration`, in app.js) è sostituita da un finto che FOTOGRAFA lo
 * stato a metà giro e poi si ferma come farebbe il motore: `showLoadingOverlay(false)` + `MappAIGen.fine()`.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const read = p => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

/* ── il DOM finto ─────────────────────────────────────────────────────────── */
function classi() {
    const s = new Set();
    return { add: c => s.add(c), remove: c => s.delete(c), contains: c => s.has(c),
        toggle: (c, on) => { if (on === undefined ? !s.has(c) : on) s.add(c); else s.delete(c); return s.has(c); },
        get value() { return [...s].join(' '); } };
}
function dom() {
    const ids = new Map();
    const osservatori = new Set();
    const avvisa = () => osservatori.forEach(o => o._cb([]));
    function el(tag) {
        const e = { tagName: tag, style: {}, classList: classi(), children: [], parentNode: null, textContent: '',
            attrs: {}, setAttribute(k, v) { this.attrs[k] = String(v); if (k === 'id') this.id = v; }, getAttribute(k) { return this.attrs[k]; },
            appendChild(c) { if (c.parentNode) c.parentNode.removeChild(c); this.children.push(c); c.parentNode = this; if (c.id) ids.set(c.id, c); avvisa(); return c; },
            insertBefore(c, rif) { if (c.parentNode) c.parentNode.removeChild(c); const i = this.children.indexOf(rif); this.children.splice(i < 0 ? this.children.length : i, 0, c); c.parentNode = this; if (c.id) ids.set(c.id, c); avvisa(); return c; },
            removeChild(c) { this.children = this.children.filter(x => x !== c); c.parentNode = null; avvisa(); return c; },
            remove() { if (this.id && ids.get(this.id) === this) ids.delete(this.id); if (this.parentNode) this.parentNode.removeChild(this); },
            querySelector() { return el('span'); }, querySelectorAll() { return []; }, addEventListener() {} };
        return e;
    }
    const html = el('html'), body = el('body');
    html.dataset = { app: 'docente' };
    const document = {
        documentElement: html, body, head: el('head'), readyState: 'complete',
        getElementById: id => ids.get(id) || null,
        createElement: el, createComment: () => el('#comment'),
        querySelector: () => null, querySelectorAll: () => [],
        addEventListener() {}, dispatchEvent() { return true; }
    };
    const crea = (id, padre) => { const e = el('div'); e.id = id; (padre || body).appendChild(e); return e; };
    const landing = crea('landing-view');
    crea('build-content', landing);
    const velo = crea('loading-overlay');
    crea('loading-desc', velo); crea('loading-title', velo);
    class MutationObserver { constructor(cb) { this._cb = cb; } observe() { osservatori.add(this); } disconnect() { osservatori.delete(this); } }
    return { document, crea, MutationObserver, osservatori };
}

/* La funzione vera `window.showLoadingOverlay` (e il suo `_veloAnnulla`) dal sorgente di mappai-ui-canvas.js. */
function sorgenteVelo() {
    const src = read('public/js/mappai-ui-canvas.js');
    const da = src.indexOf('function _veloAnnulla(');
    const a = src.indexOf('window.setSidebarProjectTitle');
    assert.ok(da > 0 && a > da, 'showLoadingOverlay non trovata in mappai-ui-canvas.js');
    return 'var loadingInterval = null, loadingSeconds = 0;\n' + src.slice(da, a);
}

function contesto(opts = {}) {
    const d = dom();
    const store = new Map(Object.entries(opts.storage || {}));
    const log = { toasts: [], foto: [], errori: [] };
    const ctx = vm.createContext({
        document: d.document, MutationObserver: d.MutationObserver, console: { log() {}, info() {}, warn() {}, error(...a) { log.errori.push(a.join(' ')); } },
        localStorage: { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) },
        setTimeout, clearTimeout, setInterval: () => 1, clearInterval() {},
        CustomEvent: class { constructor(n, o) { this.type = n; this.detail = o && o.detail; } },
        getComputedStyle: e => ({ position: e.style.position || 'static', display: e.style.display || 'block', zIndex: e.style.zIndex || 'auto' }),
        appState: { db: { nodes: [], links: [] }, rootNodeLabel: 'PROVA 0062', sources: [] },
        loadingMessagesConfig: { default: ['…'] }
    });
    ctx.window = ctx;
    ctx.loadingMessagesConfig = { default: ['…'] };
    Object.assign(ctx, {
        showToast: (m, t) => log.toasts.push({ m, t }), t: (k, f) => f, getSystemKey: () => 'chiave-finta',
        MappAIModal: { prossimoZ: () => 12100 }
    });
    vm.runInContext(read('public/js/mappai-generazione.js'), ctx);
    vm.runInContext(sorgenteVelo(), ctx);
    vm.runInContext(read('public/js/mappai-lavori.js'), ctx);
    if (opts.pipeline) vm.runInContext(read('public/js/mappai-material-pipeline.js'), ctx);
    const velo = () => d.document.getElementById('loading-overlay');
    return { w: ctx, d, log, store, velo, acceso: () => velo().classList.contains('visible'),
        nellArea: () => velo().parentNode && velo().parentNode.id === 'build-content',
        classeHtml: () => d.document.documentElement.classList.contains('mappai-velo-finestra') };
}

/* Il motore a fine mappa: «ho finito» (il velo) e il lucchetto della generazione si apre. */
function fineMappa(w) { w.showLoadingOverlay(false); w.MappAIGen.fine(); }

/* ── la presa ─────────────────────────────────────────────────────────────── */

test('la presa: interruttore acceso se manca, «0» lo spegne; non tocca attiva() né mappaiOccupato()', () => {
    const c = contesto({ pipeline: true });
    const G = c.w.MappAIGen;
    assert.equal(G.presa(), false);
    const n = G.prendi();
    assert.ok(n > 0);
    assert.equal(G.presa(), true);
    assert.equal(c.classeHtml(), true);
    /* trappola del passo A: la presa non è una generazione e non chiude il lucchetto */
    assert.equal(G.attiva(), false);
    assert.equal(c.w.mappaiOccupato(), false);
    G.lascia(n);
    assert.equal(G.presa(), false);
    assert.equal(c.classeHtml(), false);

    const spento = contesto({ storage: { mappai_velo_finestra: '0' } });
    assert.equal(spento.w.MappAIGen.prendi(), 0);
    assert.equal(spento.w.MappAIGen.presa(), false);
    assert.equal(spento.classeHtml(), false);
});

test('il rilascio di una presa vecchia non spegne il velo di quella nuova («Continua»)', () => {
    const c = contesto();
    const G = c.w.MappAIGen;
    const vecchia = G.prendi();
    const nuova = G.prendi();
    c.w.showLoadingOverlay(true, 'Scrivo la sintesi…');
    G.lascia(vecchia);
    assert.equal(G.presa(), true);
    assert.equal(c.acceso(), true);
    G.lascia(nuova);
    assert.equal(G.presa(), false);
    assert.equal(c.acceso(), false, 'lasciare la presa spegne il velo');
});

test('con la presa il velo non scende in CREA; senza presa sì (come prima)', () => {
    const c = contesto();
    const G = c.w.MappAIGen;
    G.inizia('mappa', 'mindmap');
    assert.equal(c.nellArea(), true, 'senza presa: dentro #build-content, come prima');
    G.fine();
    assert.equal(c.nellArea(), false);
    const n = G.prendi();
    G.inizia('mappa', 'mindmap');
    G.veloNellArea();
    assert.equal(c.nellArea(), false, 'con la presa: resta nel body');
    assert.equal(G.attiva(), true, 'la generazione vera resta quella che chiude il lucchetto');
    G.fine(); G.lascia(n);
});

/* ── showLoadingOverlay ───────────────────────────────────────────────────── */

test('showLoadingOverlay(false): con la presa il velo resta, senza la presa si spegne; senza MappAIGen (reader) come prima', () => {
    const c = contesto();
    const n = c.w.MappAIGen.prendi();
    c.w.showLoadingOverlay(true, 'Genero la mappa…');
    c.w.showLoadingOverlay(false);
    assert.equal(c.acceso(), true);
    c.w.MappAIGen.lascia(n);
    assert.equal(c.acceso(), false);
    c.w.showLoadingOverlay(true, 'x');
    c.w.showLoadingOverlay(false);
    assert.equal(c.acceso(), false);

    const reader = contesto();
    delete reader.w.MappAIGen;
    reader.w.showLoadingOverlay(true, 'x');
    reader.w.showLoadingOverlay(false);
    assert.equal(reader.acceso(), false);
});

/* ── lo spinner della topbar ──────────────────────────────────────────────── */

test('lo spinner della topbar: con la presa un false intermedio non chiude il lavoro; il rilascio sì', () => {
    const c = contesto();
    const L = c.w.MappAILavori;
    const n = c.w.MappAIGen.prendi();
    c.w.showLoadingOverlay(true, 'Genero la mappa…');
    assert.equal(L.attivi().length, 1);
    c.w.showLoadingOverlay(false);
    assert.equal(L.attivi().length, 1, 'fra la mappa e il passo B il lavoro resta vivo');
    c.w.showLoadingOverlay(true, 'Genero i quiz…');
    assert.equal(L.attivi().length, 1, 'il passo dopo è una fase dello stesso lavoro');
    c.w.MappAIGen.lascia(n);
    assert.equal(L.attivi().length, 0);
    /* senza presa (ELABORA, INSEGNA): come prima */
    c.w.showLoadingOverlay(true, 'x');
    c.w.showLoadingOverlay(false);
    assert.equal(L.attivi().length, 0);
});

test('lo spinner della topbar non dice il falso: un nome preso dal testo segue le fasi del giro, poi resta il titolo del progetto', () => {
    const c = contesto();
    const L = c.w.MappAILavori;
    c.w.appState.rootNodeLabel = '';
    const n = c.w.MappAIGen.prendi();
    c.w.showLoadingOverlay(true, 'Genero la mappa…');
    assert.equal(L.attivi()[0].nome, 'Genero la mappa…');
    c.w.showLoadingOverlay(true, 'Controllo i materiali prima della consegna…');
    assert.equal(L.attivi()[0].nome, 'Controllo i materiali prima della consegna…', 'il gate dello 0090 vedeva ancora «Genero la mappa…»');
    c.w.appState.rootNodeLabel = 'PROVA 0062 — velo';
    c.w.showLoadingOverlay(false);
    c.w.showLoadingOverlay(true, 'Scrivo la sintesi…');
    assert.equal(L.attivi()[0].nome, 'PROVA 0062 — velo');
    c.w.appState.rootNodeLabel = 'Un altro progetto';
    c.w.showLoadingOverlay(true, 'Genero i quiz…');
    assert.equal(L.attivi()[0].nome, 'PROVA 0062 — velo', 'il titolo, una volta preso, resta (regola del 17/8)');
    c.w.MappAIGen.lascia(n);
    /* senza presa (ELABORA): la regola del 17/8 com'era — il nome di partenza resta */
    c.w.appState.rootNodeLabel = '';
    c.w.showLoadingOverlay(true, 'Fase uno…');
    c.w.showLoadingOverlay(true, 'Fase due…');
    assert.equal(L.attivi()[0].nome, 'Fase uno…');
    c.w.showLoadingOverlay(false);
});

test('(b) alla mappa il velo cade e il giro continua con lo spinner nel cerchio bianco sulla tela', async () => {
    const c = contesto();
    const G = c.w.MappAIGen, L = c.w.MappAILavori;
    const n = G.prendi('velo');
    c.w.showLoadingOverlay(true, 'Genero la mappa…');
    assert.equal(c.acceso(), true);
    assert.equal(G.tela(), false);
    /* il motore a fine mappa: «ho finito» e la tela al posto della landing */
    c.w.showLoadingOverlay(false);
    c.d.document.getElementById('landing-view').style.display = 'none';
    G.allaMappa();
    assert.equal(G.tela(), true);
    assert.equal(G.presa(), true, 'il giro non è finito');
    assert.equal(c.acceso(), false, 'il velo è caduto sulla mappa');
    assert.equal(c.classeHtml(), false);
    c.w.showLoadingOverlay(true, 'Scrivo la sintesi…');
    assert.equal(c.acceso(), false, 'i passi dopo la mappa non rialzano il velo');
    assert.equal(c.d.document.getElementById('loading-desc').textContent, 'Scrivo la sintesi…');
    await new Promise(r => setTimeout(r, 650));          // l'indicatore si annuncia dopo 600 ms
    const ind = c.d.document.getElementById('mn-lavori');
    assert.equal(L.attivi().length, 1);
    assert.equal(ind.classList.contains('is-on'), true, 'sulla tela lo spinner si vede');
    assert.equal(ind.classList.contains('is-tela'), true, 'nel cerchio bianco');
    G.lascia(n);
    assert.equal(L.attivi().length, 0);
    assert.equal(ind.classList.contains('is-on'), false);
    assert.equal(G.tela(), false);
    /* prendi('tela'): «Continua» comincia senza velo */
    const m = G.prendi('tela');
    c.w.showLoadingOverlay(true, 'Genero i quiz…');
    assert.equal(c.acceso(), false);
    assert.equal(c.classeHtml(), false);
    G.lascia(m);
    const css = read('public/js/mappai-lavori.js');
    assert.match(css, /#mn-lavori\.is-tela\{top:24px;right:24px;width:48px;height:48px/);
});

/* ── il giro: Pipeline.run ────────────────────────────────────────────────── */

function conMappaFinta(c, dopo) {
    c.w.startGeneration = async () => {
        c.w.MappAIGen.inizia('PROVA 0062', 'mindmap');
        c.log.foto.push({ presa: c.w.MappAIGen.presa(), attiva: c.w.MappAIGen.attiva(), interno: c.w.MappAIPipeline._interno, velo: c.acceso() });
        fineMappa(c.w);
        c.log.foto.push({ veloDopoLaMappa: c.acceso(), nellArea: c.nellArea(), lavori: c.w.MappAILavori.attivi().length });
        if (dopo) dopo();
        throw new Error('fine della prova');
    };
}

test('un run daCrea prende la presa all’avvio e la lascia nel finally anche su errore; il velo resta fra la mappa e il passo dopo', async () => {
    const c = contesto({ pipeline: true });
    conMappaFinta(c);
    await c.w.MappAIPipeline.run({ quiz: { types: ['mc'] } }, { daCrea: true });
    assert.deepEqual(c.log.foto[0], { presa: true, attiva: true, interno: true, velo: true }, 'il passo A parte: la presa non lo blocca');
    assert.deepEqual(c.log.foto[1], { veloDopoLaMappa: true, nellArea: false, lavori: 1 });
    assert.equal(c.w.MappAIGen.presa(), false, 'il finally lascia la presa');
    assert.equal(c.acceso(), false, 'e il velo cade');
    assert.equal(c.classeHtml(), false);
    assert.ok(c.log.toasts.some(t => /fine della prova/.test(t.m)), 'l’errore si dice come prima');
});

test('un run senza daCrea (ELABORA, INSEGNA) prende la presa sulla tela: nessun velo, nemmeno dentro CREA; lo spinner resta', async () => {
    const c = contesto({ pipeline: true });
    conMappaFinta(c);
    await c.w.MappAIPipeline.run({ quiz: { types: ['mc'] } }, {});
    assert.deepEqual(c.log.foto[0], { presa: true, attiva: true, interno: true, velo: false }, 'gate 12/10: il velo vecchio si vedeva in CREA');
    assert.deepEqual(c.log.foto[1], { veloDopoLaMappa: false, nellArea: false, lavori: 1 });
    assert.equal(c.w.MappAIGen.presa(), false);
    /* la rigenerazione del dossier (`_veloLibero`) tiene il suo velo, come prima: nessuna presa */
    const d = contesto({ pipeline: true });
    conMappaFinta(d);
    d.w.MappAIPipeline._veloLibero = true;
    await d.w.MappAIPipeline.run({ quiz: { types: ['mc'] } }, {});
    assert.equal(d.log.foto[0].presa, false);
    assert.equal(d.log.foto[0].velo, true);
});

test('interruttore spento: un run daCrea non prende la presa', async () => {
    const c = contesto({ pipeline: true, storage: { mappai_velo_finestra: '0' } });
    conMappaFinta(c);
    await c.w.MappAIPipeline.run({ quiz: { types: ['mc'] } }, { daCrea: true });
    assert.equal(c.log.foto[0].presa, false);
    assert.equal(c.classeHtml(), false);
});

test('con un Banco aperto il velo resta sotto: il Banco sale sopra e la presa si lascia quando esce dalla pagina', async () => {
    const c = contesto({ pipeline: true });
    let banco = null;
    conMappaFinta(c, () => {
        c.w.showLoadingOverlay(true, 'Controllo i materiali…');
        banco = c.d.crea('mappai-teacher-review');
        banco.style.zIndex = '3400';
    });
    const prima = c.d.osservatori.size;   // quello dello spinner della topbar, che resta
    await c.w.MappAIPipeline.run({ quiz: { types: ['mc'] } }, { daCrea: true });
    assert.equal(c.w.MappAIGen.presa(), true, 'run è finito ma il Banco è aperto: la presa resta');
    assert.equal(c.acceso(), true);
    assert.equal(banco.style.zIndex, '12100', 'il Banco sale sopra il velo dal motore');
    banco.remove();
    assert.equal(c.w.MappAIGen.presa(), false, 'il Banco è uscito: la presa è lasciata');
    assert.equal(c.acceso(), false);
    assert.equal(c.d.osservatori.size, prima, 'l’osservatore del Banco si è spento');
});

test('(b) un «Continua» (con o senza daCrea) comincia sulla tela; con un Banco aperto sulla tela la presa si lascia subito', async () => {
    const c = contesto({ pipeline: true });
    const visti = [];
    let banco = null;
    /* il giro si ferma presto (senza manifesto); prima che il `finally` decida, si apre un Banco */
    c.w.showToast = () => {
        visti.push({ presa: c.w.MappAIGen.presa(), tela: c.w.MappAIGen.tela(), velo: c.acceso() });
        if (!banco) { banco = c.d.crea('mappai-teacher-review'); banco.style.zIndex = '3400'; }
    };
    await c.w.MappAIPipeline.run({ quiz: { types: ['mc'] } }, { daCrea: true, only: ['B'] });
    assert.deepEqual(visti[0], { presa: true, tela: true, velo: false });
    assert.equal(c.w.MappAIGen.presa(), false, 'sulla tela il Banco non trattiene la presa');
    assert.equal(banco.style.zIndex, '3400', 'e non serve alzarlo: il velo non c’è');
    /* il «Continua» di G1 (mappai-review.js) rilancia `run` SENZA daCrea: sulla tela anche lui */
    banco.remove();
    await c.w.MappAIPipeline.run({ quiz: { types: ['mc'] } }, { only: ['B'] });
    assert.deepEqual(visti[1], { presa: true, tela: true, velo: false }, 'lo spinner torna nel cerchio bianco');
});

/* ── il CSS ───────────────────────────────────────────────────────────────── */

test('il CSS del velo pieno sta sotto html[data-app="docente"].mappai-velo-finestra: fixed, inset 0, 9999, fondo pieno, niente sfocatura', () => {
    const css = read('public/css/style.css');
    const m = css.match(/html\[data-app="docente"\]\.mappai-velo-finestra #loading-overlay \{([^}]*)\}/);
    assert.ok(m, 'regola mancante');
    const r = m[1];
    assert.match(r, /position:\s*fixed/);
    assert.match(r, /inset:\s*0/);
    assert.match(r, /z-index:\s*9999/);
    assert.match(r, /background:\s*var\(--mm-fondo,\s*#ffffff\)/);
    assert.match(r, /backdrop-filter:\s*none/);
    /* la regola vecchia resta com'era: a interruttore spento vale lei */
    assert.match(css, /#loading-overlay \{\s*position: fixed;\s*inset: 0;\s*background: rgba\(255, 255, 255, 0\.95\);\s*backdrop-filter: blur\(16px\);\s*z-index: 9999;/);
});

test('i ?v= dei file toccati portano il marcatore 0062 in index.html', () => {
    const html = read('public/index.html');
    ['css/style.css', 'js/mappai-generazione.js', 'js/mappai-ui-canvas.js', 'js/mappai-lavori.js', 'js/mappai-material-pipeline.js']
        .forEach(f => assert.match(html, new RegExp(f.replace(/[.]/g, '\\.') + '\\?v=0062-'), f));
});
