'use strict';
/*
 * elabora-comandi-fonte.test.js — packet 0096 (Giacomo, 14/10/2026): i comandi della fonte
 * di ELABORA e la Catena dei perché.
 *   A — la barra dei comandi della fonte sta a destra (`colonna: 'barra'` del motore);
 *   B — «Aggiungi PDF» spento, col fumetto, quando il progetto ha già un PDF;
 *   C — «Esporta evidenziata» apre SEMPRE il menu, col motore (sopra la console), con le due
 *       versioni e la scelta di partenza dalla vista attiva;
 *   D — la Catena ha il fondo piatto degli altri documenti;
 *   E — in ELABORA una barra sola, con «Modalità esercizio» prima di «Stampa».
 * `mappai-elabora.js` gira in una vm davanti a un DOM finto (lo schema di
 * tests/elabora-fonti.test.js). ⚠️ Assert solo su booleani, testi e attributi, mai su un
 * elemento del DOM finto: un assert fallito su un oggetto può far girare Node all'infinito.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const JS = f => fs.readFileSync(path.join(__dirname, '..', 'public', 'js', f), 'utf8');
const J = x => JSON.parse(JSON.stringify(x));

// ── un DOM finto, quanto basta al modale di prima e a pickPdf ───────────────
function domFinto() {
    let body = null;
    function el(tag) {
        const e = {
            tagName: String(tag).toUpperCase(), id: '', style: {}, attributi: {}, figli: [], parentNode: null,
            clic: 0, innerHTML: '', value: '', dataset: {}, _sel: {},
            setAttribute(k, v) { this.attributi[k] = String(v); if (k === 'id') this.id = String(v); },
            getAttribute(k) { return k === 'id' ? (this.id || null) : (k in this.attributi ? this.attributi[k] : null); },
            appendChild(c) { if (c.parentNode) c.remove(); c.parentNode = this; this.figli.push(c); return c; },
            remove() { const p = this.parentNode; if (p) { p.figli = p.figli.filter(x => x !== this); this.parentNode = null; } },
            click() { this.clic++; },
            addEventListener() { }, removeEventListener() { },
            querySelector(sel) { if (!this._sel[sel]) this._sel[sel] = { onclick: null, checked: true, value: '0' }; return this._sel[sel]; },
            querySelectorAll() { return []; }
        };
        return e;
    }
    body = el('body');
    const cerca = (n, id) => { for (const c of n.figli) { if (c.id === id) return c; const x = cerca(c, id); if (x) return x; } return null; };
    const document = {
        body, head: el('head'),
        createElement: tag => el(tag),
        getElementById: id => cerca(body, id),
        addEventListener() { }, removeEventListener() { }
    };
    return { document, body };
}

/* ELABORA vero in una vm. `o.pdf` = quanti PDF ha il progetto; `o.local` = localStorage;
   `o.risposta` = che cosa risponde il menu del motore. */
function elabora(o = {}) {
    const d = domFinto();
    const local = new Map(Object.entries(o.local || {}));
    const avvisi = [], aperti = [], piani = [];
    const sources = [];
    for (let i = 0; i < (o.pdf || 0); i++) {
        sources.push({ id: 'source-' + (i + 1), type: 'pdf', name: 'scheda-' + (i + 1) + '.pdf', content: 'Testo.',
            file: new File([Buffer.from('%PDF-1.4 ' + i)], 'scheda-' + (i + 1) + '.pdf', { type: 'application/pdf' }) });
    }
    const g = {
        console: { log() { }, info() { }, warn() { }, error() { } },
        document: d.document, setTimeout, clearTimeout, File,
        localStorage: { getItem: k => (local.has(k) ? local.get(k) : null), setItem: (k, v) => { local.set(k, String(v)); }, removeItem: k => { local.delete(k); } },
        appState: { sources, db: { nodes: [], links: [], studySets: [] }, activeVaultPath: null, rootNodeLabel: 'Funzioni Urbane', extractionMode: 'mindmap' },
        showToast: (m, k) => avvisi.push({ m: String(m), k }),
        pdfjsLib: {}, jspdf: { jsPDF: function () { } },
        MappAIModal: {
            open(schema) { aperti.push(J(schema)); return Promise.resolve(o.risposta || null); },
            prossimoZ() { const z = 12200 + piani.length * 100; piani.push(z); return z; }
        }
    };
    g.window = g;
    const ctx = vm.createContext(g);
    vm.runInContext(JS('mappai-elabora.js'), ctx);
    return { g, E: g.MappAIElabora, dom: d, local, avvisi, aperti, piani };
}
const riposo = async (n = 8) => { for (let i = 0; i < n; i++) await new Promise(r => setImmediate(r)); };

// ── C — «Esporta evidenziata» chiede il menu al motore ─────────────────────
test('C: con un PDF, «Esporta evidenziata» apre il menu del motore (sopra la console), non un div a z-index 1002', async () => {
    const h = elabora({ pdf: 1 });
    h.E.exportHighlightedPdf();
    await riposo();
    assert.equal(h.aperti.length, 1, 'il menu si chiede a MappAIModal.open');
    assert.equal(!!h.dom.document.getElementById('elab-pdfexp-modal'), false, 'niente overlay scritto a mano');
});

test('C: senza PDF il menu si apre lo stesso, con il solo testo', async () => {
    const h = elabora({ pdf: 0 });
    h.E.exportHighlightedPdf();
    await riposo();
    assert.equal(h.aperti.length, 1, 'il menu si apre anche senza PDF');
});

test('C: la scelta di partenza segue la vista attiva di «Materiale · Fonte»', async () => {
    const h = elabora({ pdf: 1 });
    h.E.exportHighlightedPdf();
    await riposo();
    const campi = h.aperti[0].sezioni[0].campi;
    const v = id => { const c = campi.find(x => x.id === id); return c ? !!c.valore : null; };
    assert.equal(v('ver-testo'), true, 'vista Testo → parte dal solo testo');
    assert.equal(v('ver-pdf'), false);
    h.E.setSrcView('pdf');
    h.E.exportHighlightedPdf();
    await riposo();
    const campi2 = h.aperti[1].sezioni[0].campi;
    assert.equal(!!campi2.find(x => x.id === 'ver-pdf').valore, true, 'vista PDF → parte dal PDF evidenziato');
    assert.equal(!!campi2.find(x => x.id === 'ver-testo').valore, false);
    assert.deepEqual(campi2.filter(x => x.tipo === 'spunta').map(x => [x.id, x.valore]), [['legenda', true], ['moderate', true]],
        'le due spunte, accese, per tutte e due le versioni (D1)');
});

test('C: senza PDF niente scelta della versione, una riga che dice che si esporta il testo', async () => {
    const h = elabora({ pdf: 0 });
    h.E.exportHighlightedPdf();
    await riposo();
    const campi = h.aperti[0].sezioni[0].campi;
    assert.equal(campi.some(x => x.tipo === 'radio'), false);
    assert.equal(campi[0].tipo, 'nota');
    assert.match(campi[0].etichetta, /non ha un PDF/);
    assert.equal(campi.some(x => x.id === 'quale'), false);
});

test('C: «Esporta» col solo testo costruisce il documento con le opzioni; col PDF il velo sta sopra la console', async () => {
    const costruiti = [];
    const h = elabora({ pdf: 1, risposta: { azione: 'si', valori: { 'ver-testo': 'on', legenda: true, moderate: false } } });
    h.g.appState.activeVaultPath = '/Users/prova/Documents/MappAI - file/Mappe/1B/Geografia/PROVA 0096 Funzioni Urbane';
    h.g.MappAIStudyDoc = { buildHtml: o => { costruiti.push(o.titoloFile); return '<html></html>'; }, openDoc() { }, rgba: () => 'rgba(0,0,0,.3)' };
    h.g.MappAIDeepenCore = { splitSentences: s => [s] };
    h.g.MappAIDescFidelity = { corpusFromState: () => 'Una frase della fonte.' };
    h.E.exportHighlightedPdf();
    await riposo();
    assert.deepEqual(costruiti, ['PROVA 0096 Funzioni Urbane - Scheda evidenziata'],
        'il documento del solo testo, col nome del file «[cartella del progetto] - Scheda evidenziata» (gate del 15/10)');

    const veli = [];
    const h2 = elabora({ pdf: 1, risposta: { azione: 'si', valori: { 'ver-pdf': 'on', legenda: true, moderate: true } } });
    const velo = h2.dom.document.createElement('div'); velo.id = 'loading-overlay'; h2.dom.body.appendChild(velo);
    h2.g.showLoadingOverlay = (on, testo) => veli.push([on, testo || '', velo.style.zIndex || '']);
    h2.g.pdfjsLib = { getDocument() { throw new Error('pdf finto'); } };
    h2.g.MappAIStudyDoc = { buildHtml: () => '<html></html>', openDoc() { }, rgba: () => '' };
    h2.E.exportHighlightedPdf();
    await riposo();
    assert.equal(veli.length >= 2, true, 'il velo si accende e si spegne');
    assert.equal(veli[0][0], true);
    assert.match(veli[0][1], /Esporto il PDF evidenziato/);
    assert.equal(Number(veli[0][2]) > 12100, true, 'il velo ha chiesto il piano al motore: ' + veli[0][2]);
});

test('C: interruttore spento → la strada di prima, ma il modale del PDF prende il piano dal motore', async () => {
    const h = elabora({ pdf: 1, local: { mappai_comandi_fonte: '0' } });
    h.E.exportHighlightedPdf();
    await riposo();
    assert.equal(h.aperti.length, 0, 'niente menu nuovo');
    const ov = h.dom.document.getElementById('elab-pdfexp-modal');
    assert.equal(!!ov, true, 'il modale di prima');
    assert.equal(Number(ov.style.zIndex) > 12100, true, 'sopra la console: ' + ov.style.zIndex);
});

// ── B — «Aggiungi PDF» spento quando il progetto ha già un PDF ─────────────
test('B: con un PDF il comando è spento col fumetto; senza PDF, o a interruttore spento, è quello di prima', () => {
    const pdfDi = h => J(h.E.sourceActions()).find(a => a.id === 'src-pdf');
    const con = pdfDi(elabora({ pdf: 1 }));
    assert.equal(con.spento, true);
    assert.match(con.fumetto, /già allegato/);
    const senza = pdfDi(elabora({ pdf: 0 }));
    assert.equal('spento' in senza, false);
    assert.equal('fumetto' in senza, false);
    const vecchio = pdfDi(elabora({ pdf: 1, local: { mappai_comandi_fonte: '0' } }));
    assert.equal('spento' in vecchio, false, 'interruttore spento: sempre premibile');
    assert.deepEqual(J(elabora({ pdf: 0 }).E.sourceActions()).map(a => a.id),
        ['src-questions', 'src-hl', 'src-areas', 'src-text', 'src-pdf'], 'ordine invariato');
});

test('B: pickPdf con un PDF già allegato non apre la finestra di sistema e dice perché', () => {
    const h = elabora({ pdf: 1 });
    h.E.pickPdf();
    assert.equal(h.dom.body.figli.some(x => x.tagName === 'INPUT'), false, 'nessun campo del file');
    assert.equal(h.avvisi.length, 1);
    assert.match(h.avvisi[0].m, /già allegato/);
    const h2 = elabora({ pdf: 0 });
    h2.E.pickPdf();
    const campo = h2.dom.body.figli.find(x => x.tagName === 'INPUT');
    assert.equal(!!campo, true, 'senza PDF la finestra si apre');
    assert.equal(campo.clic, 1);
});

// ── B — il motore sa disegnare un bottone spento col fumetto ───────────────
function motore() {
    const g = { window: {}, requestAnimationFrame: f => f(), console };
    g.document = {
        body: { style: {} }, addEventListener() { },
        createElement: tag => ({ tagName: tag, className: '', innerHTML: '', style: {}, setAttribute() { }, addEventListener() { },
            appendChild() { }, querySelector: () => null, querySelectorAll: () => [] })
    };
    g.self = g;
    vm.createContext(g);
    vm.runInContext(JS('mappai-modal-core.js'), g);
    vm.runInContext(JS('mappai-modal.js'), g);
    return g;
}
test('B: normalizzaBottone conserva spento e fumetto; render scrive disabled e title solo se dichiarati', () => {
    const g = motore();
    const Core = g.MappAIModalCore;
    const n = J(Core.normalizzaBottone({ id: 'x', etichetta: 'Aggiungi PDF', spento: true, fumetto: 'già allegato' }, 0));
    assert.equal(n.spento, true);
    assert.equal(n.fumetto, 'già allegato');
    assert.deepEqual(J(Core.normalizzaBottone(n, 0)), n, 'una seconda passata non cambia niente');
    /* la colonna `barra` è della console: lo schema è quello di ELABORA sulla fonte */
    const html = sez => g.MappAIModal.render({ titolo: 'Prova', taglia: 'xl', layout: 'console', piena: true, tela: { id: 'elab' },
        nav: [{ id: 'n', etichetta: 'Voce' }], sezioni: [{ id: 's', nuda: true, colonna: 'barra', azioni: sez }] }).innerHTML;
    const spento = html([{ id: 'a', etichetta: 'Aggiungi PDF', ruolo: 'primario', spento: true, fumetto: 'Il PDF è già allegato', chiude: false }]);
    assert.match(spento, /data-azione="a" disabled aria-disabled="true" title="Il PDF è già allegato"/);
    assert.equal(/data-primario/.test(spento), false, 'uno spento non è il primario per Invio');
    const acceso = html([{ id: 'a', etichetta: 'Aggiungi PDF', ruolo: 'primario', chiude: false }]);
    assert.match(acceso, /<button type="button" class="mm-btn mm-btn--primario" data-azione="a" data-primario="1">/,
        'senza le due chiavi il bottone è quello di prima, carattere per carattere');
    assert.match(acceso, /<div class="mm-schede-riga"><div class="mm-barra">/, 'la colonna barra: la riga spinta a destra');
});

// ── D — il fondo della Catena ──────────────────────────────────────────────
test('D: la Catena ha il fondo piatto, senza puntini; la sua barra resta nel documento (D2)', () => {
    const g = { window: {}, console };
    g.window = g;
    vm.createContext(g);
    vm.runInContext(JS('mappai-causal-chains.js'), g);
    const html = g.MappAICausal.buildDocHtml({ rootItems: [], branches: [], cross: [], total: 1 }, 'Funzioni Urbane');
    assert.equal(/radial-gradient/.test(html), false, 'niente puntini');
    assert.match(html, /max-width:860px;background:#f8fafc\}/);
    assert.match(html, /cc-ex/, 'la modalità esercizio del documento c\'è ancora');
    assert.match(html, /class="no-print"/, 'la barra interna resta per il file, la finestra a sé e il reader');
    assert.match(html, /<title>Funzioni Urbane - catena perché<\/title>/, 'senza cartella: il nome della mappa');
    g.appState = { activeVaultPath: '/Users/prova/Documents/MappAI - file/Mappe/1B/Geografia/PROVA 0096 Funzioni Urbane' };
    const h2 = g.MappAICausal.buildDocHtml({ rootItems: [], branches: [], cross: [], total: 1 }, 'Funzioni Urbane');
    assert.match(h2, /<title>PROVA 0096 Funzioni Urbane - catena perché<\/title>/, 'con la cartella: il nome della cartella');
    assert.match(h2, /data-t="PROVA 0096 Funzioni Urbane - catena perché" data-te="PROVA 0096 Funzioni Urbane - catena perché - esercizio"/,
        'il bottone della pagina cambia il titolo con la modalità esercizio');
});

// ── A ed E — la console vera, sul DOM finto di tests/elabora-modifica.test.js ──
const cheerio = require('cheerio');
function domCheerio(markup = '<html><head></head><body></body></html>') {
    const $ = cheerio.load(markup), cache = new WeakMap(), listeners = {};
    const document = { addEventListener(n, fn) { (listeners[n] ||= []).push(fn); }, removeEventListener() {},
        createElement: tag => wrap($('<' + tag + '></' + tag + '>')[0]),
        querySelector: q => wrap($(q)[0]), querySelectorAll: q => $(q).toArray().map(wrap),
        getElementById: id => wrap($('[id]').toArray().find(n => n.attribs.id === id)) };
    function wrap(node) {
        if (!node) return null;
        if (cache.has(node)) return cache.get(node);
        const events = {}, style = {}, dataset = {};
        const e = { node, events, style, dataset, ownerDocument: document,
            get id() { return $(node).attr('id') || ''; }, set id(v) { $(node).attr('id', v); },
            get className() { return $(node).attr('class') || ''; }, set className(v) { $(node).attr('class', v); },
            get innerHTML() { return $(node).html(); }, set innerHTML(v) { $(node).html(v); },
            get textContent() { return $(node).text(); }, set textContent(v) { $(node).text(v); },
            get title() { return $(node).attr('title') || ''; }, set title(v) { $(node).attr('title', v); },
            get type() { return $(node).attr('type') || ''; }, set type(v) { $(node).attr('type', v); },
            get isConnected() { return $(node).closest('html').length > 0; },
            get nextSibling() { return wrap($(node).next()[0]); },
            get body() { return wrap($(node).find('body')[0]); },
            classList: { contains: c => $(node).hasClass(c), add: c => $(node).addClass(c), remove: c => $(node).removeClass(c),
                toggle: (c, on) => { const v = on === undefined ? !$(node).hasClass(c) : !!on; if (v) $(node).addClass(c); else $(node).removeClass(c); return v; } },
            querySelector: q => wrap($(node).find(q)[0]), querySelectorAll: q => $(node).find(q).toArray().map(wrap),
            getAttribute: n => $(node).attr(n), setAttribute: (n, v) => $(node).attr(n, v),
            appendChild(child) { $(node).append(child.node); return child; },
            insertBefore(child, other) { if (other) $(other.node).before(child.node); else $(node).append(child.node); return child; },
            replaceWith(other) { $(node).replaceWith(other.node); }, remove: () => $(node).remove(),
            addEventListener(n, fn) { (events[n] ||= []).push(fn); }, removeEventListener() {},
            set srcdoc(html) {
                e._srcdoc = html;
                e.contentDocument = domCheerio(html).document;
                e.contentDocument.location = { href: 'about:srcdoc' };
                queueMicrotask(() => (events.load || []).forEach(fn => fn()));
            },
            get srcdoc() { return e._srcdoc || ''; }
        };
        cache.set(node, e); return e;
    }
    document.head = wrap($('head')[0]); document.body = wrap($('body')[0]); document.documentElement = wrap($('html')[0]);
    return { $, document };
}

/* La console su una mappa con un nesso causale; `o.comandi` = che cosa risponde
   `MappAIElabora.comandiFonte`, `o.pdf` = il progetto ha già un PDF. */
function console0096(o = {}) {
    const dom = domCheerio(), calls = { stampe: [], nomi: [], titoli: [], nascoste: 0 };
    const finestra = {};      /* gli ascoltatori di `afterprint` della finestra principale */
    dom.document.title = 'MappAI — Generatore AI di mappe e grafici di conoscenza';
    const state = { extractionMode: 'mindmap', activeVaultPath: '/vault', rootNodeLabel: 'Funzioni Urbane',
        db: { nodes: [{ id: 'a', label: 'A', level: 0 }, { id: 'b', label: 'B', level: 1 }], links: [{ source: 'a', target: 'b', rel: 'causa' }], studySets: [] } };
    let schema, box, closeModal;
    function draw(next) {
        dom.document.body.innerHTML = '<div class="mm-box"><div class="mm-console__area">' +
            (next.tela ? '<div class="mm-tela" data-tela="elab"></div>' : '') + '</div></div>';
        return box = dom.document.querySelector('.mm-box');
    }
    const comandi = o.comandi !== false;
    const g = { console: { log() {}, warn() {} }, document: dom.document, appState: state, TextDecoder, Uint8Array,
        setTimeout, clearTimeout, queueMicrotask, atob: s => Buffer.from(s, 'base64').toString('binary'),
        localStorage: { getItem() { return null; }, removeItem() {}, setItem() {} }, sessionStorage: { getItem() { return null; }, setItem() {} },
        showToast() {},
        MappAIDocEditor: { reset() {}, render() {}, assicuraStili() {}, hasUnsaved: () => false, haDocumento: () => false,
            openNodeSheet() {}, openCausal() {}, openSynthesis() {} },
        MappAIElabora: { unmountSource() {}, mountSource() {}, renderSource() { return true; },
            comandiFonte: () => comandi, nomeProgetto: () => 'PROVA 0096 Funzioni Urbane',
            sourceActions: () => [
                { id: 'src-questions', etichetta: 'Domande della fonte', icona: 'help-circle' },
                { id: 'src-hl', etichetta: 'Esporta evidenziata', icona: 'file-output' },
                { id: 'src-areas', etichetta: 'Esporta per aree', icona: 'files' },
                { id: 'src-text', etichetta: 'Incolla testo', icona: 'clipboard-paste' },
                o.pdf ? { id: 'src-pdf', etichetta: 'Aggiungi PDF', icona: 'plus', ruolo: 'primario', spento: true, fumetto: 'Il PDF della scheda è già allegato: un progetto ne ha uno solo.' }
                    : { id: 'src-pdf', etichetta: 'Aggiungi PDF', icona: 'plus', ruolo: 'primario' }
            ] },
        MappAIVaults: { quando() { return () => {}; } },
        MappAICausalCore: { countRows: () => 0, normDoc: d => d, chainsFromDoc: () => null },
        MappAICausal: { buildForCurrentMap: () => ({ total: 1 }), mapName: () => 'Funzioni Urbane',
            buildDocHtml: () => '<html><head></head><body><div class="no-print">barra interna</div><div class="cc-legend"></div><span class="cc-conn-txt">perché</span></body></html>' },
        MappAITeach: {
            mappeDelContesto: async () => [{ id: 'v:/vault', nome: 'Funzioni Urbane', v: { fullPath: '/vault', extractionMode: 'mindmap' } }],
            mappaCorrente: rows => rows.find(r => r.v.fullPath === state.activeVaultPath),
            tabelleMateriali: rows => [{ id: 'other', titolo: 'Materiali', righe: rows.map(m => ({ id: 'm:' + m.id, celle: [m.titolo] })) }]
        },
        MappAIModal: { open(s) { schema = s; draw(s); s.suApertura(box, draw); return new Promise(resolve => { closeModal = resolve; }); } },
        electronAPI: { vaultMaterialsList: async () => ({ files: [] }), async readVaultFile() { return { ok: false }; } },
        MappAIDocBar: { nascondiInIframe: () => { calls.nascoste++; return true; },
            stampaIframe(fr, nome) {
                calls.stampe.push(fr.contentDocument.body.classList.contains('cc-ex') ? 'esercizio' : 'intero');
                calls.nomi.push(nome); calls.titoli.push(dom.document.title);
                (finestra.afterprint || []).slice().forEach(fn => fn());      /* la stampa si chiude */
                return true;
            } },
        MappAITTS: { stop() {}, mountChip() { return { style: {} }; } },
        MappAIPercorsoLettura: { elaboraMaterials: () => [] }
    };
    g.window = g;
    g.addEventListener = (n, fn) => { (finestra[n] ||= []).push(fn); };
    g.removeEventListener = (n, fn) => { finestra[n] = (finestra[n] || []).filter(x => x !== fn); };
    vm.runInNewContext(JS('mappai-elabora-console.js'), g);
    const settle = async () => { for (let i = 0; i < 30; i++) await new Promise(r => setTimeout(r, 0)); };
    const nomeBottone = (e) => e.textContent || (e.getAttribute && e.getAttribute('aria-label')) || '';
    return { ...dom, g, calls, settle,
        async open() { g.MappAIElaboraConsole.open({}); await settle(); },
        async action(id) { schema.suAzione({ azione: id }, box, draw); await settle(); },
        sezione(id) { return J(g.MappAIElaboraConsole.schema().sezioni.find(x => x.id === id) || null); },
        /* 0128, allargamento 12: la stampa è un'icona senza testo, il suo nome sta in `aria-label` */
        bottoni() { return dom.document.querySelectorAll('#ec-file .de-bar button').map(nomeBottone); },
        bottone(label) { return dom.document.querySelectorAll('#ec-file .de-bar button').find(e => nomeBottone(e) === label) || null; },
        async premi(label) { const b = this.bottone(label); assert.equal(!!b, true, 'bottone ' + label); for (const fn of b.events.click || []) fn(); await settle(); },
        corpo() { const fr = dom.document.querySelector('#ec-file iframe'); return fr ? fr.contentDocument.body : null; },
        async close() { closeModal(); await settle(); }
    };
}

test('A: sulla fonte i comandi stanno nella colonna «barra» del motore (a destra), nell\'ordine di prima, «Esci» in fondo', async () => {
    const h = console0096({ pdf: true });
    await h.open();
    await h.action('m:src:text');
    const s = h.sezione('src-cmd');
    assert.equal(!!s, true, 'la sezione dei comandi della fonte c\'è');
    assert.equal(s.colonna, 'barra');
    assert.deepEqual(s.azioni.map(a => a.id), ['src-questions', 'src-hl', 'src-areas', 'src-text', 'src-pdf', 'esci-doc']);
    const pdf = s.azioni.find(a => a.id === 'src-pdf');
    assert.equal(pdf.spento, true, 'B: lo spento arriva al motore');
    assert.match(pdf.fumetto, /già allegato/);
    await h.close();
});

test('A: con l\'interruttore spento la sezione è quella di prima (a sinistra)', async () => {
    const h = console0096({ comandi: false });
    await h.open();
    await h.action('m:src:text');
    const s = h.sezione('src-cmd');
    assert.equal(s.colonna, null);
    assert.equal(s.azioni.find(a => a.id === 'src-pdf').spento, false);
    await h.close();
});

/* 0105 (Giacomo, 16/10): una Catena SENZA file non ha più un'anteprima — si apre diritta
   nell'editor, e la «Modalità esercizio» sta nel documento che il suo «Stampa» apre. Le due
   prove E che vivevano su quell'anteprima (barra con interruttore prima di «Stampa», nomi dei
   PDF) diventano queste; l'interruttore resta provato sulla Catena salvata nel vault, qui sotto. */
for (const comandi of [true, false]) {
    test('E (0105): la Catena dalla mappa senza file apre l\'editor, nessuna barra d\'anteprima' + (comandi ? '' : ' (interruttore spento)'), async () => {
        const h = console0096({ comandi });
        const aperte = [];
        h.g.MappAIDocEditor.openCausal = clone => { aperte.push(clone || ''); };
        await h.open();
        await h.action('m:cc:');
        assert.deepEqual(aperte, [''], 'l\'editor della Catena, l\'originale');
        assert.deepEqual(h.bottoni(), [], 'nessuna barra d\'anteprima, quindi nessun interruttore lì');
        await h.close();
    });
}

test('E: una Catena salvata nel vault (prima dello 0096) ha l\'interruttore prima di «Stampa» e niente puntini a schermo', async () => {
    const h = console0096();
    const nome = 'Catena dei perché - Funzioni Urbane.html';
    const vecchia = '<html><head><style>body{background:#fafbff;background-image:radial-gradient(#ddd6fe 1px,transparent 1px)}</style></head>' +
        '<body><div class="no-print">barra interna</div><div class="cc-legend"></div><span class="cc-conn-txt">perché</span></body></html>';
    h.g.MappAITeach.generePerFile = n => /^Catena/i.test(n) ? { icon: 'git-branch', label: 'Catena dei perché' } : { icon: 'file', label: 'File' };
    h.g.electronAPI = {
        vaultMaterialsList: async () => ({ ok: true, files: [{ name: nome, relPath: 'Materiale Studio/' + nome, size: 10, mtime: 1 }] }),
        readVaultFile: async () => ({ ok: true, base64: Buffer.from(vecchia, 'utf8').toString('base64') })
    };
    await h.open();
    /* il file della pipeline si aggancia alla riga della Catena (`_agganciaFile`): il
       clic mostra il FILE, non l'anteprima dalla mappa */
    await h.action('m:cc:');
    const fr0 = h.document.querySelector('#ec-file iframe');
    assert.equal(!!fr0 && /radial-gradient/.test(fr0.srcdoc), true, 'si vede il file del vault, coi suoi puntini nel <style>');
    const b = h.bottoni();
    assert.equal(b.indexOf('Modalità esercizio') >= 0, true, 'l\'interruttore c\'è: ' + b.join(' · '));
    assert.equal(b.indexOf('Modalità esercizio') + 1, b.indexOf('Stampa'), 'subito prima di «Stampa»: ' + b.join(' · '));
    const fr = h.document.querySelector('#ec-file iframe');
    const fondo = fr.contentDocument.getElementById('ec-cc-fondo');
    assert.equal(!!fondo, true, 'la regola che copre i puntini');
    assert.match(fondo.textContent, /@media screen\{body\{background-image:none/);
    await h.premi('Modalità esercizio');
    assert.equal(h.corpo().classList.contains('cc-ex'), true);
    await h.premi('Stampa');
    assert.deepEqual(h.calls.nomi, ['PROVA 0096 Funzioni Urbane - catena perché - esercizio.pdf'], 'anche il file del vault prende il nome della Catena');
    await h.close();
});

// ── G — l'interlinea nel pannello «Leggibilità» (gate del 15/10) ───────────
test('G: il pannello «Leggibilità» dei documenti di studio ha il cursore «Interlinea», un fattore su ogni interlinea di partenza', () => {
    const g = { console, document: { getElementById: () => null } };
    g.window = g;
    vm.createContext(g);
    vm.runInContext(JS('mappai-study-doc.js'), g);
    const html = g.MappAIStudyDoc.buildHtml({ title: 'Scheda con evidenziazioni', mapName: 'Funzioni Urbane', bodyHtml: '<p>Una frase.</p>', lang: 'it' });
    assert.match(html, /<span>Interlinea<\/span><input type="range" id="sd-lh" min="1" max="1\.6" step="0\.05" value="1">/);
    assert.match(html, /\.sd-body p \{[^}]*line-height:calc\(1\.85 \* var\(--sd-lhk, 1\)\)/, 'paragrafi');
    assert.match(html, /\.sd-item \{[^}]*line-height:calc\(1\.7 \* var\(--sd-lhk, 1\)\)/, 'voci');
    assert.match(html, /body\.sd-odys[^{]*\{[^}]*line-height:calc\(2\.05 \* var\(--sd-lhk, 1\)\)/, 'OpenDyslexic');
    assert.match(html, /lh=\$\('sd-lh'\)/);
    assert.match(html, /setProperty\('--sd-lhk',String\(\(lh&&lh\.value\)\|\|1\)\)/, 'il cursore scrive il fattore');
    assert.match(html, /if\(lh\) lh\.addEventListener\('input',sp\)/);
});

test('C: il <title> del documento di studio è il nome del file quando chi lo costruisce lo dichiara', () => {
    const g = { console, document: { getElementById: () => null } };
    g.window = g;
    vm.createContext(g);
    vm.runInContext(JS('mappai-study-doc.js'), g);
    const con = g.MappAIStudyDoc.buildHtml({ title: 'Scheda con evidenziazioni', titoloFile: 'Funzioni Urbane - Scheda evidenziata', bodyHtml: '' });
    assert.match(con, /<title>Funzioni Urbane - Scheda evidenziata<\/title>/);
    assert.match(con, /Scheda con evidenziazioni/, 'il titolo visibile resta');
    const senza = g.MappAIStudyDoc.buildHtml({ title: 'Per aree', bodyHtml: '' });
    assert.match(senza, /<title>Per aree<\/title>/, 'senza titoloFile, come prima');
});
