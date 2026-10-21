/* 0118 — la maniglia montata (mappai-maniglia.js) e la barra fra fonte e analisi in ELABORA (mappai-elabora.js) */
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const vm = require('node:vm'), fs = require('node:fs'), path = require('node:path');
const RAD = path.join(__dirname, '..');
const leggi = f => fs.readFileSync(path.join(RAD, 'public', f), 'utf8');

/* un elemento finto quanto basta alla maniglia: classi, stile con variabili, attributi, eventi */
function elemento(larghezza) {
    const classi = new Set(), attr = {}, ascolti = {}, vars = {};
    return {
        clientWidth: larghezza || 0, tabIndex: -1, title: '', inert: false,
        classList: { add: (...c) => c.forEach(x => classi.add(x)), remove: (...c) => c.forEach(x => classi.delete(x)), contains: c => classi.has(c), toggle: (c, si) => { if (si === undefined ? !classi.has(c) : si) classi.add(c); else classi.delete(c); } },
        style: { setProperty: (k, v) => { vars[k] = v; }, getPropertyValue: k => vars[k] || '' },
        setAttribute: (k, v) => { attr[k] = String(v); }, getAttribute: k => (k in attr ? attr[k] : null),
        addEventListener: (n, f) => { (ascolti[n] = ascolti[n] || []).push(f); },
        removeEventListener: (n, f) => { ascolti[n] = (ascolti[n] || []).filter(x => x !== f); },
        emetti: (n, e) => (ascolti[n] || []).slice().forEach(f => f(Object.assign({ preventDefault() { }, button: 0, pointerId: 1 }, e))),
        quanti: n => (ascolti[n] || []).length,
        setPointerCapture() { }, getBoundingClientRect: () => ({ left: 0, width: larghezza || 0 }),
        _vars: vars
    };
}
function casaManiglia(cfg) {
    cfg = cfg || {};
    const ls = Object.assign({}, cfg.localStorage || {});
    const ctx = { console, Math, JSON, Object, Number, String, Set,
        localStorage: { getItem: k => (k in ls ? ls[k] : null), setItem: (k, v) => { ls[k] = String(v); } },
        matchMedia: q => ({ matches: !!(cfg.stretta && q === '(max-width: 900px)') }) };
    ctx.window = ctx; ctx.self = ctx;
    vm.createContext(ctx);
    vm.runInContext(leggi('js/mappai-maniglia-core.js'), ctx);
    vm.runInContext(leggi('js/mappai-maniglia.js'), ctx);
    const cont = elemento(1000), pan = elemento(), man = elemento();
    const monta = () => ctx.MappAIManiglia.monta({ contenitore: cont, pannello: pan, maniglia: man, chiave: 'mappai_elabora_fonte', variabile: '--elab-fonte-w', lato: 'sinistra',
        minPannello: 280, minAltro: 320, predefinita: 0.535, stretta: '(max-width: 900px)', etichette: { apri: 'Riapri', sposta: 'Sposta' } });
    return { ctx, ls, cont, pan, man, monta };
}

test('monta: separatore con ARIA, la larghezza dalla preferenza (predefinita 53,5%), il secondo montaggio non raddoppia i gestori', () => {
    const c = casaManiglia();
    const k = c.monta();
    assert.strictEqual(c.man.getAttribute('role'), 'separator');
    assert.strictEqual(c.man.getAttribute('aria-orientation'), 'vertical');
    assert.strictEqual(c.man.tabIndex, 0);
    assert.strictEqual(c.cont._vars['--elab-fonte-w'], '53.50%');
    assert.strictEqual(c.man.getAttribute('aria-valuenow'), '54');
    assert.strictEqual(c.man.title, 'Sposta');
    assert.strictEqual(c.monta() === k, true, 'stesso controllo');
    assert.strictEqual(c.man.quanti('pointerdown') + c.man.quanti('keydown'), 2, 'un gestore per tipo');
    k.smonta();
    assert.strictEqual(c.man.quanti('pointerdown') + c.man.quanti('keydown') + c.man.quanti('pointerup'), 0, 'smonta toglie i gestori');
});

test('trascinare: oltre il 10% sposta e salva; sotto il 10% «sta chiudendo» e al rilascio la fonte si chiude (inert, 0%, linguetta) e si riaprirà alla larghezza di prima; un clic sulla linguetta la riapre', () => {
    const c = casaManiglia({ localStorage: { mappai_elabora_fonte: '{"frazione":0.6,"chiusa":false}' } });
    c.monta();
    assert.strictEqual(c.cont._vars['--elab-fonte-w'], '60.00%');
    c.man.emetti('pointerdown', { clientX: 600 });
    assert.strictEqual(c.cont.classList.contains('is-trascinando'), true);
    c.man.emetti('pointermove', { clientX: 450 });
    c.man.emetti('pointerup', {});
    assert.strictEqual(c.cont._vars['--elab-fonte-w'], '45.00%');
    assert.deepStrictEqual(JSON.parse(c.ls.mappai_elabora_fonte), { frazione: 0.45, chiusa: false });
    assert.strictEqual(c.cont.classList.contains('is-trascinando'), false);
    // verso il bordo sinistro
    c.man.emetti('pointerdown', { clientX: 450 });
    c.man.emetti('pointermove', { clientX: 60 });
    assert.strictEqual(c.cont.classList.contains('sta-chiudendo'), true, 'sotto il 10% sta chiudendo');
    c.man.emetti('pointerup', {});
    assert.strictEqual(c.cont.classList.contains('is-pannello-chiuso'), true);
    assert.strictEqual(c.cont.classList.contains('sta-chiudendo'), false);
    assert.strictEqual(c.pan.inert, true, 'la fonte chiusa non prende il fuoco');
    assert.strictEqual(c.cont._vars['--elab-fonte-w'], '0%');
    assert.strictEqual(c.man.getAttribute('aria-valuenow'), '0');
    assert.strictEqual(c.man.title, 'Riapri');
    assert.deepStrictEqual(JSON.parse(c.ls.mappai_elabora_fonte), { frazione: 0.45, chiusa: true }, 'si riaprirà a 45%, non a 6%');
    // clic (meno di 3 px) sulla linguetta
    c.man.emetti('pointerdown', { clientX: 5 });
    c.man.emetti('pointermove', { clientX: 7 });
    c.man.emetti('pointerup', {});
    assert.strictEqual(c.cont.classList.contains('is-pannello-chiuso'), false);
    assert.strictEqual(c.pan.inert, false);
    assert.strictEqual(c.cont._vars['--elab-fonte-w'], '45.00%');
    // clic sulla maniglia APERTA: niente
    c.man.emetti('pointerdown', { clientX: 450 });
    c.man.emetti('pointerup', {});
    assert.strictEqual(c.cont.classList.contains('is-pannello-chiuso'), false);
});

test('trascinare oltre i minimi: il rilascio rispetta 280 px di fonte e 320 px di analisi', () => {
    const c = casaManiglia();
    c.monta();
    c.man.emetti('pointerdown', { clientX: 535 });
    c.man.emetti('pointermove', { clientX: 950 });
    c.man.emetti('pointerup', {});
    assert.strictEqual(c.cont._vars['--elab-fonte-w'], '68.00%');
    c.man.emetti('pointerdown', { clientX: 680 });
    c.man.emetti('pointermove', { clientX: 150 });
    c.man.emetti('pointerup', {});
    assert.strictEqual(c.cont._vars['--elab-fonte-w'], '28.00%');
});

test('tastiera: ← stringe la fonte, → la allarga, Invio la chiude e la riapre; chiusa, ← non fa niente e → la riapre', () => {
    const c = casaManiglia({ localStorage: { mappai_elabora_fonte: '{"frazione":0.5,"chiusa":false}' } });
    c.monta();
    c.man.emetti('keydown', { key: 'ArrowLeft' });
    assert.strictEqual(c.cont._vars['--elab-fonte-w'], '45.00%');
    c.man.emetti('keydown', { key: 'ArrowRight' });
    c.man.emetti('keydown', { key: 'ArrowRight' });
    assert.strictEqual(c.cont._vars['--elab-fonte-w'], '55.00%');
    c.man.emetti('keydown', { key: 'Enter' });
    assert.strictEqual(c.cont.classList.contains('is-pannello-chiuso'), true);
    c.man.emetti('keydown', { key: 'ArrowLeft' });
    assert.strictEqual(c.cont.classList.contains('is-pannello-chiuso'), true, '← verso il bordo: resta chiusa');
    c.man.emetti('keydown', { key: 'ArrowRight' });
    assert.strictEqual(c.cont.classList.contains('is-pannello-chiuso'), false);
    assert.strictEqual(c.cont._vars['--elab-fonte-w'], '55.00%');
    assert.deepStrictEqual(JSON.parse(c.ls.mappai_elabora_fonte), { frazione: 0.55, chiusa: false });
});

test('il montaggio non si anima: `is-montando` c\'è mentre si applica la larghezza e si toglie subito dopo aver fissato il layout (misurato in Electron il 21/10: senza, la colonna scivolava a ogni render)', () => {
    const c = casaManiglia({ localStorage: { mappai_elabora_fonte: '{"frazione":0.4,"chiusa":false}' } });
    const visti = [];
    const set = c.cont.style.setProperty;
    c.cont.style.setProperty = (k, v) => { visti.push([v, c.cont.classList.contains('is-montando')]); set(k, v); };
    let letto = false;
    Object.defineProperty(c.cont, 'offsetWidth', { get() { letto = c.cont.classList.contains('is-montando'); return 1000; } });
    c.monta();
    assert.deepStrictEqual(visti, [['40.00%', true]], 'la larghezza si scrive con le transizioni spente');
    assert.strictEqual(letto, true, 'il layout si fissa prima di riaccenderle');
    assert.strictEqual(c.cont.classList.contains('is-montando'), false);
    // un gesto dopo il montaggio si anima di nuovo (niente is-montando)
    visti.length = 0;
    c.man.emetti('keydown', { key: 'ArrowRight' });
    assert.deepStrictEqual(visti, [['45.00%', false]]);
});

test('la media query «stretta» ha UN ascoltatore per il modulo: al cambio si riapplicano i controlli ancora nel documento', () => {
    const c = casaManiglia({ localStorage: { mappai_elabora_fonte: '{"frazione":0.5,"chiusa":true}' } });
    let stretta = false; const ascolti = [];
    c.ctx.matchMedia = () => ({ get matches() { return stretta; }, addEventListener: (n, f) => ascolti.push(f) });
    c.man.isConnected = true;
    c.monta();
    assert.strictEqual(c.pan.inert, true);
    // un secondo montaggio (il ridisegno) non aggiunge ascoltatori
    const cont2 = elemento(1000), pan2 = elemento(), man2 = elemento(); man2.isConnected = true;
    c.ctx.MappAIManiglia.monta({ contenitore: cont2, pannello: pan2, maniglia: man2, chiave: 'mappai_elabora_fonte', variabile: '--elab-fonte-w', stretta: '(max-width: 900px)' });
    assert.strictEqual(ascolti.length, 1);
    c.man.isConnected = false;   // il primo è stato sostituito dal ridisegno
    stretta = true; ascolti[0]();
    assert.strictEqual(pan2.inert, false, 'sotto i 900 px la fonte non resta inert');
    assert.strictEqual(cont2.classList.contains('is-pannello-chiuso'), false);
    assert.strictEqual(c.pan.inert, true, 'quello staccato non si tocca più');
});

test('sotto i 900 px (colonne impilate) una fonte chiusa nella preferenza non si chiude e non diventa inert', () => {
    const c = casaManiglia({ stretta: true, localStorage: { mappai_elabora_fonte: '{"frazione":0.5,"chiusa":true}' } });
    c.monta();
    assert.strictEqual(c.cont.classList.contains('is-pannello-chiuso'), false);
    assert.strictEqual(c.pan.inert, false);
});

test('localStorage che non risponde: la preferenza resta in memoria per questa apertura, il montaggio dopo un ridisegno la ritrova', () => {
    const c = casaManiglia();
    c.ctx.localStorage = { getItem() { throw new Error('bloccato'); }, setItem() { throw new Error('bloccato'); } };
    c.monta();
    c.man.emetti('keydown', { key: 'Enter' });
    assert.strictEqual(c.cont.classList.contains('is-pannello-chiuso'), true);
    // il ridisegno: elementi nuovi, stessa chiave
    const cont2 = elemento(1000), pan2 = elemento(), man2 = elemento();
    c.ctx.MappAIManiglia.monta({ contenitore: cont2, pannello: pan2, maniglia: man2, chiave: 'mappai_elabora_fonte', variabile: '--elab-fonte-w', lato: 'sinistra', minPannello: 280, minAltro: 320, predefinita: 0.535 });
    assert.strictEqual(cont2.classList.contains('is-pannello-chiuso'), true);
});

/* ── ELABORA: la barra nell'HTML, i due interruttori, il rimontaggio dopo `render` ── */
function domCheerio(markup) {
    const cheerio = require('cheerio');
    const $ = cheerio.load(markup), cache = new WeakMap();
    const document = { addEventListener() { }, removeEventListener() { }, dispatchEvent() { return true; },
        createElement: tag => wrap($('<' + tag + '></' + tag + '>')[0]),
        querySelector: q => wrap($(q)[0]), querySelectorAll: q => $(q).toArray().map(wrap),
        getElementById: id => wrap($('[id]').toArray().find(n => n.attribs.id === id)) };
    function wrap(node) {
        if (!node) return null;
        if (cache.has(node)) return cache.get(node);
        const ascolti = {};
        const e = { node, ownerDocument: document, dataset: {}, clientWidth: 1000,
            style: { setProperty: (k, v) => $(node).attr('data-var' + k, v) },
            get id() { return $(node).attr('id') || ''; }, set id(v) { $(node).attr('id', v); },
            get className() { return $(node).attr('class') || ''; }, set className(v) { $(node).attr('class', v); },
            get innerHTML() { return $(node).html(); }, set innerHTML(v) { $(node).html(v); },
            get textContent() { return $(node).text(); }, set textContent(v) { $(node).text(v); },
            get isConnected() { return $(node).closest('html').length > 0; },
            get title() { return $(node).attr('title') || ''; }, set title(v) { $(node).attr('title', v); },
            get inert() { return $(node).attr('inert') != null; }, set inert(v) { if (v) $(node).attr('inert', ''); else $(node).removeAttr('inert'); },
            get tabIndex() { return Number($(node).attr('tabindex') || -1); }, set tabIndex(v) { $(node).attr('tabindex', String(v)); },
            classList: { contains: c => $(node).hasClass(c), add: (...c) => c.forEach(x => $(node).addClass(x)), remove: (...c) => c.forEach(x => $(node).removeClass(x)), toggle: (c, si) => $(node).toggleClass(c, si) },
            querySelector: q => wrap($(node).find(q)[0]), querySelectorAll: q => $(node).find(q).toArray().map(wrap),
            getAttribute: n => $(node).attr(n), setAttribute: (n, v) => $(node).attr(n, v),
            appendChild(child) { $(node).append(child.node); return child; },
            remove: () => $(node).remove(),
            addEventListener: (n, f) => { (ascolti[n] = ascolti[n] || []).push(f); }, removeEventListener() { },
            quanti: n => (ascolti[n] || []).length };
        cache.set(node, e); return e;
    }
    document.head = wrap($('head')[0]); document.body = wrap($('body')[0]); document.documentElement = wrap($('html')[0]);
    return { $, document };
}
function casaElabora(cfg) {
    cfg = cfg || {};
    const ls = Object.assign({}, cfg.localStorage || {});
    const dom = domCheerio('<html><head></head><body><div id="elabora-content"></div><div id="ec-src"></div></body></html>');
    const ctx = { console: { warn() { }, log() { }, error() { } }, setTimeout, clearTimeout, Promise, Math, Date, JSON, Object, Array, String, Number, RegExp, Error, Set, Map,
        localStorage: { getItem: k => (k in ls ? ls[k] : null), setItem: (k, v) => { ls[k] = String(v); }, removeItem: k => { delete ls[k]; } },
        document: dom.document, matchMedia: () => ({ matches: false }),
        appState: { sources: [{ id: 's1', type: 'text', name: 'Scheda', content: 'Il feudo era una terra concessa dal signore al vassallo. '.repeat(10) }],
            db: { nodes: [{ id: 'r', label: 'Radice', level: 0 }, { id: 'a', label: 'A', level: 1 }], links: [{ source: 'r', target: 'a' }], studySets: [] },
            activeVaultPath: null, rootNodeLabel: 'Prova', extractionMode: 'mindmap' },
        electronAPI: { vaultSourcesList: () => Promise.resolve({ ok: true, files: [] }), vaultMaterialsList: () => Promise.resolve({ ok: true, files: [] }) },
        MappAIEnrichCore: { analyzeEnrichment: () => ({ coverage: { cards: [] }, text: { signals: [], words: 120, sentences: 6, connectives: { causale: { count: 0 } } }, structural: [] }) },
        MappAIDescFidelity: { corpusFromState: s => (s.sources || []).map(x => x.content || '').join('\n\n') } };
    ctx.window = ctx; ctx.self = ctx; ctx.globalThis = ctx;
    vm.createContext(ctx);
    const files = ['js/mappai-files-core.js', 'js/mappai-pipeline-core.js', 'js/mappai-fonti-core.js'].concat(cfg.senzaManiglia ? [] : ['js/mappai-maniglia-core.js', 'js/mappai-maniglia.js']).concat(['js/mappai-elabora.js']);
    files.forEach(f => vm.runInContext(leggi(f), ctx));
    const E = ctx.MappAIElabora;
    E.mountSource(dom.document.getElementById('ec-src'), { view: 'text' });
    return { ctx, ls, dom, E, html: () => dom.$('#ec-src').html() || '' };
}

test('ELABORA: con l\'interruttore acceso la barra è la maniglia, montata dopo il disegno e RIMONTATA dopo ogni render, alla larghezza della preferenza', () => {
    const c = casaElabora({ localStorage: { mappai_elabora_fonte: '{"frazione":0.4,"chiusa":false}' } });
    const $ = c.dom.$;
    assert.strictEqual($('#ec-src .elab-split.elab-split-man').length, 1);
    assert.strictEqual($('#ec-src .elab-divider').length, 0, 'niente barra fissa');
    const man = $('#ec-src .elab-maniglia');
    assert.strictEqual(man.length, 1);
    assert.strictEqual(man.attr('role'), 'separator');
    assert.strictEqual(man.attr('aria-valuenow'), '40');
    assert.strictEqual($('#ec-src .elab-split-man').attr('data-var--elab-fonte-w'), '40.00%');
    assert.strictEqual(/Sposta il confine fra fonte e analisi/.test(man.attr('title') || ''), true);
    assert.strictEqual($('#ec-src .elab-split-man').hasClass('elab-scuoti'), true, 'il chip si scuote alla prima apparizione');
    // un render riscrive #ec-src: la maniglia nuova è montata di nuovo, il chip non si scuote più
    c.ls.mappai_elabora_fonte = '{"frazione":0.4,"chiusa":true}';
    c.E.renderSource();
    const man2 = $('#ec-src .elab-maniglia');
    assert.strictEqual(man2.attr('role'), 'separator', 'rimontata');
    assert.strictEqual($('#ec-src .elab-split-man').hasClass('is-pannello-chiuso'), true, 'lo stato viene dalla preferenza, non dal DOM');
    assert.strictEqual($('#ec-src .elab-split-man > .elab-pane').first().attr('inert') != null, true, 'la fonte chiusa è inert');
    assert.strictEqual($('#ec-src .elab-split-man').hasClass('elab-scuoti'), false);
});

test('ELABORA: con mappai_elabora_maniglia = \'0\' torna la barra fissa di 9 px; senza il modulo la barra c\'è ma non si monta', () => {
    const spenta = casaElabora({ localStorage: { mappai_elabora_maniglia: '0' } });
    assert.strictEqual(spenta.dom.$('#ec-src .elab-split-man').length, 0);
    assert.strictEqual(spenta.dom.$('#ec-src .elab-divider .elab-grip').length, 1, 'la barra di prima');
    assert.strictEqual(spenta.dom.$('#ec-src .elab-maniglia').length, 0);
    const senza = casaElabora({ senzaManiglia: true });
    assert.strictEqual(senza.dom.$('#ec-src .elab-maniglia').length, 0, 'senza MappAIManiglia mai una maniglia muta');
    assert.strictEqual(senza.dom.$('#ec-src .elab-divider .elab-grip').length, 1, 'torna la barra di prima');
});

test('ELABORA, vista «PDF» (gate 3, 21/10: «quando restringo l\'immagine si deforma»): pagine a proporzioni fisse; a colonna cambiata e barra ferma si ridisegnano alla larghezza nuova, al loro posto; non durante il trascinamento', async () => {
    const c = casaElabora();
    const ctx = c.ctx, $ = c.dom.$;
    // un PDF finto di 3 pagine 600×800: si contano i disegni e la loro scala
    const disegni = [];
    const pagina = n => ({ getViewport: ({ scale }) => ({ width: 600 * scale, height: 800 * scale, transform: [scale, 0, 0, -scale, 0, 800 * scale] }),
        render: ({ viewport }) => { disegni.push([n, Math.round(viewport.width)]); return { promise: Promise.resolve() }; },
        getTextContent: () => Promise.resolve({ items: [] }) });
    ctx.pdfjsLib = { getDocument: () => ({ promise: Promise.resolve({ numPages: 3, getPage: n => Promise.resolve(pagina(n)) }) }) };
    let osserva = null;
    ctx.ResizeObserver = function (f) { osserva = f; this.observe = () => { }; this.disconnect = () => { osserva = null; }; };
    ctx.devicePixelRatio = 1;
    const doc = c.dom.document, crea = doc.createElement;
    doc.createElement = tag => { const e = crea(tag); if (tag === 'canvas') e.getContext = () => ({}); return e; };
    ctx.appState.sources.push({ id: 's2', type: 'pdf', name: 'Scheda.pdf', file: { name: 'Scheda.pdf', type: 'application/pdf', size: 9, arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)) } });
    const pausa = ms => new Promise(r => setTimeout(r, ms));
    c.E.mountSource(doc.getElementById('ec-src'), { view: 'pdf' });
    await pausa(20);
    const scroll = doc.getElementById('elab-pdf-scroll');
    const wraps = () => $('#elab-pdf-scroll .elab-pdf-pagewrap').toArray().map(n => doc.querySelector ? n : n);
    assert.strictEqual(wraps().length, 3);
    const stile = i => doc.querySelectorAll('#elab-pdf-scroll .elab-pdf-pagewrap')[i].style;
    assert.deepStrictEqual([stile(0).width, stile(0).aspectRatio, stile(0).height], ['972px', '600 / 800', undefined], 'larghezza in px, proporzioni fisse, nessuna altezza fissa');
    assert.deepStrictEqual(disegni, [[1, 972], [2, 972], [3, 972]]);
    assert.strictEqual(typeof osserva, 'function', 'la colonna è osservata');
    // la colonna si stringe mentre si trascina: niente ridisegno finché la barra è in mano
    scroll.clientWidth = 600;
    $('#ec-src .elab-split').addClass('is-trascinando');
    scroll.closest = q => ($('#ec-src .elab-split').hasClass('is-trascinando') && q === '.is-trascinando' ? {} : null);
    osserva();
    await pausa(400);
    assert.strictEqual(disegni.length, 3, 'durante il trascinamento nessun ridisegno');
    // barra lasciata: le tre pagine si ridisegnano a 572 px, al loro posto (stessi elementi)
    $('#ec-src .elab-split').removeClass('is-trascinando');
    await pausa(300);
    assert.deepStrictEqual(disegni.slice(3), [[1, 572], [2, 572], [3, 572]]);
    assert.strictEqual(stile(1).width, '572px');
    assert.strictEqual($('#elab-pdf-scroll .elab-pdf-pagewrap').length, 3, 'le stesse pagine, non ricostruite');
    assert.strictEqual($('#elab-pdf-scroll .elab-pdf-pagewrap').first().children('canvas').length, 1, 'un canvas per pagina: il vecchio sostituito');
    // un cambio sotto i 12 px non ridisegna
    scroll.clientWidth = 608; osserva(); await pausa(400);
    assert.strictEqual(disegni.length, 6);
});

test('ELABORA, CSS: la maniglia solo sopra i 900 px, colori dai token (--mm-ok, --eline, --efaint), chip e linguetta come il Banco; sotto i 900 px nascosta', () => {
    const c = casaElabora();
    const css = c.dom.$('#elab-styles').text();
    const sopra = (/@media \(min-width:901px\)\{([\s\S]*?)\n {8}\}/.exec(css) || [])[1] || '';
    assert.strictEqual(/\.elab-split-man\{[^}]*grid-template-columns:var\(--elab-fonte-w,53\.5%\) minmax\(0,1fr\)/.test(sopra), true, 'la larghezza dalla variabile');
    assert.strictEqual(/is-pannello-chiuso>\.elab-maniglia\{[^}]*background:var\(--mm-ok,#059669\)/.test(sopra), true, 'la linguetta verde');
    assert.strictEqual(/\.elab-maniglia::after\{[^}]*background:var\(--efaint\)/.test(sopra), true, 'il chip grigio dal token');
    assert.strictEqual(/elab-scuoti>\.elab-maniglia::after\{animation:mm-chip-nudge/.test(sopra), true, 'la scossa del chip comune');
    assert.strictEqual(/@media \(max-width:900px\)\{[^\n]*\.elab-divider,\.elab-maniglia\{display:none\}/.test(css), true, 'sotto i 900 px nascosta');
    assert.strictEqual(/prefers-reduced-motion:reduce\)\{\.elab-split-man/.test(css), true, 'niente movimento con «riduci movimento»');
});
