'use strict';
/*
 * L'albero della barra laterale, l'elenco dei set di studio, i risultati di
 * «Cerca», l'avviso (showToast) e la domanda del collegamento, VERI
 * (mappai-ui-modals.js, mappai-flashcards-sr.js e mappai-search-finder.js girano
 * in una vm), davanti a un vault ricevuto da un collega. Albero e set si
 * ridisegnano da soli a ogni mappa aperta (initD3Visualization, renderGraph).
 *
 * Il DOM è una facciata sottile sopra cheerio (parse5, lo stesso parser del
 * browser), con i clic che risalgono gli antenati come nel browser. Qui non si
 * prova che un `onerror` NON scatti — cheerio non esegue niente — ma che
 * nell'albero prodotto non esista alcun elemento o attributo nato dai dati, e
 * che i clic arrivino alla funzione giusta con l'id ESATTO.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const cheerio = require('cheerio');
const TextUtils = require('../public/js/mappai-text-utils.js');

const JS = f => fs.readFileSync(path.join(__dirname, '..', 'public', 'js', f), 'utf8');
const QUIETA = { log() {}, info() {}, warn() {}, error: (...a) => console.error(...a) };

// ── il DOM finto ──────────────────────────────────────────────────────────────

function dom(corpo) {
    const $ = cheerio.load('<html><body>' + corpo + '</body></html>');
    const cache = new WeakMap(), ascoltiDoc = {};
    function wrap(n) {
        if (!n) return null;
        if (cache.has(n)) return cache.get(n);
        const e = {
            node: n, style: {}, _ascolti: {},
            classList: {
                add: (...c) => { $(n).addClass(c.join(' ')); },
                remove: (...c) => { c.forEach(x => $(n).removeClass(x)); },
                toggle: c => { $(n).toggleClass(c); return $(n).hasClass(c); },
                contains: c => $(n).hasClass(c)
            },
            get id() { return $(n).attr('id') || ''; },
            get className() { return $(n).attr('class') || ''; }, set className(v) { $(n).attr('class', String(v)); },
            get innerHTML() { return $(n).html(); }, set innerHTML(v) { $(n).html(v); },
            get textContent() { return $(n).text(); }, set textContent(v) { $(n).text(v == null ? '' : String(v)); },
            get innerText() { return $(n).text(); }, set innerText(v) { $(n).text(String(v)); },
            get value() { return $(n).val() || ''; }, set value(v) { $(n).val(v); },
            get children() { return $(n).children().toArray().map(wrap); },
            getAttribute: k => { const v = $(n).attr(k); return v === undefined ? null : v; },
            setAttribute: (k, v) => { $(n).attr(k, String(v)); },
            closest: s => wrap($(n).closest(s)[0]),
            querySelector: s => wrap($(n).find(s)[0]),
            querySelectorAll: s => $(n).find(s).toArray().map(wrap),
            appendChild: c => { $(n).append(c.node); return c; },
            addEventListener: (tipo, fn) => { (e._ascolti[tipo] = e._ascolti[tipo] || []).push(fn); },
            remove: () => { $(n).remove(); },
            focus() {}
        };
        cache.set(n, e);
        return e;
    }
    const document = {
        readyState: 'complete',
        getElementById: id => wrap($('[id="' + id + '"]')[0]),
        createElement: tag => wrap($('<' + tag + '></' + tag + '>')[0]),
        querySelectorAll: s => $(s).toArray().map(wrap),
        addEventListener: (tipo, fn) => { (ascoltiDoc[tipo] = ascoltiDoc[tipo] || []).push(fn); }
    };
    /* Un evento che parte dall'elemento e risale gli antenati: `on<tipo>` e gli
       ascolti di ciascuno, poi il documento; `stopPropagation` ferma la salita.
       Gli attributi `on…="…"` scritti nell'HTML NON si eseguono (e non devono
       esistere: li cerca `soloDati`). */
    function evento(el, tipo) {
        const nodo = el && el.node ? el.node : el;
        let fermo = false;
        const ev = { type: tipo, target: wrap(nodo), stopPropagation() { fermo = true; }, preventDefault() {} };
        for (let n = nodo; n && !fermo; n = n.parent) {
            const w = cache.get(n);
            if (!w) continue;
            if (typeof w['on' + tipo] === 'function') w['on' + tipo](ev);
            (w._ascolti[tipo] || []).forEach(fn => fn(ev));
        }
        if (!fermo) (ascoltiDoc[tipo] || []).forEach(fn => fn(ev));
        return fermo;
    }
    return { $, wrap, document, evento };
}

/* Nessun elemento attivo, nessun gestore `on*`, e soltanto gli attributi che il
   template scrive: un `"` che esce da un attributo ne crea di nuovi. */
const ATTIVI = 'script, iframe, object, embed, svg, math, a, form, img, video, audio, link, meta, style, base';
function soloDati($, radice, ammessi, etichetta) {
    assert.equal($(radice).find(ATTIVI).length, 0, etichetta + ': elemento nato dai dati: ' + $(radice).find(ATTIVI).toString().slice(0, 120));
    $(radice).find('*').each((_, el) => {
        for (const k of Object.keys(el.attribs)) {
            assert.ok(!/^on/i.test(k), etichetta + ': gestore in linea <' + el.tagName + ' ' + k + '="' + el.attribs[k] + '">');
            assert.ok(ammessi.has(k), etichetta + ': attributo estraneo <' + el.tagName + ' ' + k + '="' + el.attribs[k] + '">');
        }
    });
}

const EVIL = '<img src=x onerror="window.__pwned=1">';
const SVG = '<svg onload="window.__pwned=2">';
const ID_APICE = "a'),alert(1),('";                            // dentro `'${id}'` senza escape
const ID_BARRA = "b\\');window.__pwned=3;//";                   // `\'` → `\\'`: la stringa si chiude
const ID_VIRG = 'c" onmouseover="window.__pwned=4';             // esce dall'attributo onclick="…"

// ── mappai-ui-modals.js: albero della barra laterale, avviso, domanda del collegamento ──

function modali(opts = {}) {
    const d = dom(`
        <div id="toast-container"></div>
        <h3 id="tree-view-title"></h3><div id="tree-view-container"></div>
        <div id="link-family-modal" class="hidden opacity-0"><div id="link-family-box" class="scale-95">
            <p id="link-family-question"></p><div id="link-family-grid"></div>
            <input id="link-family-input"><div id="link-family-tags" class="hidden"><div id="link-family-chips"></div></div>
            <button id="link-bidir-toggle"></button><button id="link-family-cancel"></button><button id="link-family-ok"></button>
        </div></div>`);
    const st = { db: { nodes: opts.nodes || [], links: opts.links || [], customColors: opts.customColors || {} },
        extractionMode: opts.mode || 'mindmap' };
    const giri = { timer: [], singoli: [], doppi: [] };
    const g = {
        console: QUIETA, document: d.document, appState: st,
        setTimeout: fn => giri.timer.push(fn), clearTimeout() {},
        localStorage: { getItem: () => null },
        t: (k, f) => f, safeCreateIcons() {},
        handleNodeClick: (ev, n) => giri.doppi.push(n)
    };
    g.window = g; g.self = g;
    const ctx = vm.createContext(g);
    if (opts.nucleo !== false) vm.runInContext(JS('mappai-html-sicuro.js'), ctx);
    vm.runInContext(JS('mappai-relations.js'), ctx);
    // come in app.js e mappai-d3-render.js: due `const` di primo livello, non su window
    vm.runInContext(`const EDGE_FAMILIES = window.MappAIRelations.EDGE_FAMILIES;
        const colorScale = { 0: "#0f172a", 1: "#ef4444", 2: "#f59e0b", 3: "#10b981", 4: "#0ea5e9", 5: "#6366f1", 6: "#d946ef", 7: "#8b5cf6" };`, ctx);
    vm.runInContext(JS('mappai-ui-modals.js'), ctx);
    g.executeSidebarSingleClick = id => giri.singoli.push(id);
    const scorri = () => { while (giri.timer.length) giri.timer.shift()(); };
    return { ...d, g, st, giri, scorri };
}

const AMMESSI_ALBERO = new Set(['class', 'style', 'type', 'title', 'aria-label', 'data-albero-apri', 'data-albero-nodo']);
const COLORE = /^background:(#[0-9a-f]{3,8}|rgba?\([\d\s.,%]+\))$/i;

function mappaOstile() {
    return {
        nodes: [
            { id: 'root', level: 0, label: 'Radice', group: 0 },
            { id: ID_VIRG, level: 1, label: EVIL + ' Fotosintesi', group: 1 },
            { id: ID_BARRA, level: 2, label: SVG + ' Clorofilla', group: 1 },
            { id: ID_APICE, level: 1, label: 'Respirazione <b>cellulare</b>', group: 2 },
            { id: 'r2', level: 2, label: 'Mitocondri', group: 2 }
        ],
        customColors: { 1: 'red;background:url(javascript:alert(1))', 2: '#10b981" onmouseover="alert(2)' }
    };
}

test('albero (MindMap): etichette, livelli, colori e id di un vault ostile restano testo e dati', () => {
    const m = modali(mappaOstile());
    m.g.renderTreeView();
    const $ = m.$, box = $('#tree-view-container');
    soloDati($, box, AMMESSI_ALBERO, 'albero');
    // le etichette, intere e come testo
    const nomi = box.find('[data-albero-nodo]').toArray().map(b => $(b).text().replace(/\s+/g, ' ').trim());
    assert.deepEqual(nomi, [EVIL + ' Fotosintesi', 'L2 ' + SVG + ' Clorofilla', 'Respirazione <b>cellulare</b>', 'L2 Mitocondri']);
    assert.equal(box.find('b').length, 0);
    // i colori: quelli ostili si scartano e resta il colore del ramo
    const stili = box.find('[style]').toArray().map(e => e.attribs.style);
    assert.equal(stili.length, 2);
    stili.forEach(s => assert.match(s, COLORE, s));
    assert.deepEqual(stili, ['background:#ef4444', 'background:#f59e0b']);
    // negli attributi data-* soltanto i nostri numeri d'ordine
    box.find('[data-albero-apri], [data-albero-nodo]').each((_, e) => {
        for (const k of ['data-albero-apri', 'data-albero-nodo']) if (k in e.attribs) assert.match(e.attribs[k], /^\d+$/);
    });
    assert.equal(m.g.__pwned, undefined);
});

test('albero (MindMap): pallino, clic e doppio clic arrivano con l\'id ESATTO, e il pallino ferma il clic', () => {
    const m = modali(mappaOstile());
    m.g.renderTreeView();
    const $ = m.$;
    // prima: gli id stavano DENTRO `onclick="…('${id}')"`, e un `"` o un `\'` ne uscivano
    soloDati($, $('#tree-view-container'), AMMESSI_ALBERO, 'albero');
    const pallino = () => $('#tree-view-container [data-albero-apri]').first()[0];
    // il pallino: collassa il ramo giusto, e il clic non sale oltre l'albero
    assert.equal(m.evento(pallino(), 'click'), true, 'stopPropagation come prima');
    assert.ok(m.g.collapsedTreeNodes.has(ID_VIRG));
    assert.deepEqual($('#tree-view-container [data-albero-nodo]').toArray().map(b => $(b).text().trim()).length, 3, 'i figli del ramo chiuso spariscono');
    m.evento(pallino(), 'click');
    assert.ok(!m.g.collapsedTreeNodes.has(ID_VIRG));
    // un clic sul nome (anche sul testo interno): la selezione del nodo, dopo l'attesa del doppio clic
    const nomi = () => $('#tree-view-container [data-albero-nodo]').toArray();
    m.evento($(nomi()[1]).find('span')[0], 'click');
    m.scorri();
    assert.deepEqual(m.giri.singoli, [ID_BARRA]);
    // il doppio clic apre la scheda del nodo vero
    m.evento(nomi()[2], 'dblclick');
    assert.deepEqual(m.giri.doppi.map(n => n.id), [ID_APICE]);
    assert.equal(m.g.__pwned, undefined);
});

test('albero (KG): super-hub e vicini con etichette ostili, i clic con l\'id esatto', () => {
    const nodes = [
        { id: ID_VIRG, level: 1, label: EVIL + ' Hub', group: 1 },
        { id: ID_BARRA, level: 2, label: SVG + ' Vicino', group: 1 },
        { id: ID_APICE, level: 2, label: '<i>Altro</i>', group: 1 }
    ];
    const links = [{ source: ID_VIRG, target: ID_BARRA }, { source: ID_VIRG, target: ID_APICE }];
    const m = modali({ nodes, links, mode: 'kg', customColors: { 1: 'rgba(1,2,3,.5)' } });
    m.g.renderTreeView();
    const $ = m.$, box = $('#tree-view-container');
    soloDati($, box, AMMESSI_ALBERO, 'albero KG');
    assert.equal(box.find('i').length, 0);
    assert.ok(box.text().includes(EVIL + ' Hub (2 conn.)'), box.text());
    assert.ok(box.text().includes('<i>Altro</i>'));
    assert.deepEqual(box.find('[style]').toArray().map(e => e.attribs.style)[0], 'background:rgba(1,2,3,.5)', 'un rgba() vero resta');
    const vicino = box.find('[data-albero-nodo]').toArray().find(b => $(b).text().includes('Vicino'));
    m.evento(vicino, 'dblclick');
    assert.deepEqual(m.giri.doppi.map(n => n.id), [ID_BARRA]);
});

test('showToast: il messaggio è testo (etichette di nodi in undo, «fondi con…», «cambia link»)', () => {
    const m = modali();
    m.g.showToast('Annullato: ' + EVIL, 'error');
    m.g.showToast(SVG + ' & «spostato»', 'success');
    const $ = m.$, box = $('#toast-container');
    soloDati($, box, new Set(['class', 'data-lucide']), 'avviso');
    const testi = box.find('span').toArray().map(s => $(s).text());
    assert.deepEqual(testi, ['Annullato: ' + EVIL, SVG + ' & «spostato»']);
    // la veste di prima: icona e colore per tipo
    assert.deepEqual(box.find('i').toArray().map(i => i.attribs['data-lucide']), ['alert-triangle', 'check-circle']);
    assert.ok($(box.children()[0]).hasClass('bg-red-600') && $(box.children()[1]).hasClass('bg-emerald-600'));
});

test('showLinkFamilyPrompt: le due etichette in <strong> come testo; «{b}» e «$&» nella prima non sono segnaposti', () => {
    const m = modali();
    let scelto = null;
    const a = EVIL + ' {b} $& $\'', b = '<b>Clorofilla</b>';
    m.g.showLinkFamilyPrompt(a, b, (rel, bidir) => { scelto = [rel, bidir]; });
    const $ = m.$, q = $('#link-family-question');
    soloDati($, q, new Set(), 'domanda');
    assert.deepEqual(q.find('strong').toArray().map(s => $(s).text()), [a, b]);
    assert.equal(q.text(), 'Che relazione c\'è tra ' + a + ' e ' + b + '?');
    // il modale funziona come prima: una famiglia, il verbo, conferma
    assert.ok($('#link-family-grid button').length >= 6);
    m.wrap($('#link-family-grid button')[0]).onclick();
    m.wrap($('#link-family-ok')[0]).onclick();
    assert.ok(scelto && typeof scelto[0] === 'string' && scelto[0].length > 0 && scelto[1] === false, JSON.stringify(scelto));
});

// ── mappai-flashcards-sr.js: l'elenco dei set di studio ─────────────────────

function setStudio(sets, opts = {}) {
    const d = dom(`<div id="study-sets-container"><p id="empty-sets-hint"></p></div>`);
    const giri = [];
    const g = {
        console: QUIETA, document: d.document, appState: { db: { nodes: [], links: [], studySets: sets } },
        t: (k, f) => f, safeCreateIcons() {}, setTimeout: () => 0
    };
    g.window = g; g.self = g;
    const ctx = vm.createContext(g);
    if (opts.nucleo !== false) vm.runInContext(JS('mappai-html-sicuro.js'), ctx);
    vm.runInContext(JS('mappai-flashcards-sr.js'), ctx);
    for (const f of ['loadStudySet', 'regenerateStudySet', 'deleteStudySet', 'printFlashcardSet', 'printQuizSet']) g[f] = (...a) => giri.push([f, ...a]);
    g.MappAILive = { launchFromSetPrompt: id => giri.push(['live', id]) };
    return { ...d, g, giri };
}

const AMMESSI_SET = new Set(['class', 'data-lucide', 'title', 'data-set-azione', 'id', 'style']);
const setOstili = () => [
    { id: ID_APICE, mode: 'quiz', title: EVIL + ' Verifica', items: [{}, {}, {}], date: '2026-09-25T10:00:00Z' },
    { id: ID_VIRG, mode: "flashcard'); window.__pwned=5; ('", title: SVG, items: { length: '<img src=x onerror=alert(6)>' }, date: '2026-09-24T10:00:00Z' },
    { id: ID_BARRA, mode: 'flashcard', title: 'Carte <b>vere</b>', items: [{}], date: '2026-09-23T10:00:00Z' }
];

test('set di studio: titolo, numero di domande, modo e id di Materiale Studio/*.json restano testo e dati', () => {
    const s = setStudio(setOstili());
    s.g.renderStudySets();
    const $ = s.$, box = $('#study-sets-container');
    soloDati($, box, AMMESSI_SET, 'set di studio');
    const righe = box.children('div').toArray().map(r => $(r));
    assert.equal(righe.length, 3);
    assert.deepEqual(righe.map(r => r.find('span.font-bold').first().text()), [EVIL + ' Verifica', SVG, 'Carte <b>vere</b>']);
    assert.deepEqual(righe.map(r => r.find('span.text-\\[10px\\]').text().split(' ·')[0]), ['3 domande', '0 domande', '1 domande']);
    // i bottoni portano soltanto il nome della loro azione
    box.find('[data-set-azione]').each((_, b) => assert.match(b.attribs['data-set-azione'], /^(rigenera|elimina|stampa|live)$/));
    assert.deepEqual(righe.map(r => r.find('[data-set-azione="live"]').length), [1, 0, 0], 'il QR solo per i quiz');
    assert.equal(s.g.__pwned, undefined);
});

test('set di studio: ogni bottone chiama la sua funzione con l\'id esatto e non apre il set; la riga sì', () => {
    const s = setStudio(setOstili());
    s.g.renderStudySets();
    const $ = s.$;
    // prima: id e modo stavano dentro `onclick="…('${set.id}')"`, senza nemmeno l'apice protetto
    soloDati($, $('#study-sets-container'), AMMESSI_SET, 'set di studio');
    const riga = i => $('#study-sets-container').children('div').eq(i);
    const clic = (i, azione) => s.evento(azione ? riga(i).find('[data-set-azione="' + azione + '"] i')[0] || riga(i).find('[data-set-azione="' + azione + '"]')[0] : riga(i).find('span.font-bold')[0], 'click');
    assert.equal(clic(0, 'rigenera'), true, 'il bottone ferma il clic, come il suo stopPropagation');
    clic(0, 'elimina');
    clic(0, 'stampa');
    clic(0, 'live');
    clic(1, 'stampa');   // un modo ostile non è «flashcard»: stampa da quiz, come prima
    clic(2, 'stampa');
    clic(2);
    assert.deepEqual(s.giri, [
        ['regenerateStudySet', ID_APICE], ['deleteStudySet', ID_APICE], ['printQuizSet', ID_APICE], ['live', ID_APICE],
        ['printQuizSet', ID_VIRG], ['printFlashcardSet', ID_BARRA], ['loadStudySet', ID_BARRA]
    ]);
    assert.equal(s.g.__pwned, undefined);
});

// ── mappai-search-finder.js: i risultati di «Cerca» ─────────────────────────

function ricerca(opts = {}) {
    const d = dom(`<input id="super-finder-input"><button id="super-finder-clear" class="hidden"></button><div id="super-finder-results"></div>`);
    const st = { db: { nodes: opts.nodes || [], links: opts.links || [], sourcesDict: opts.sourcesDict || {} }, extractionMode: 'mindmap' };
    const giri = { schede: [], focus: [] };
    const g = {
        console: QUIETA, document: d.document, appState: st,
        cleanLabel: TextUtils.cleanLabel, safeCreateIcons() {},
        getInheritedDatabase: id => [].concat(st.db.sourcesDict[id] || []),
        handleNodeClick: (ev, n) => giri.schede.push(n),
        openSourceModal: id => giri.focus.push(id)
        // niente d3: performSearch (l'oscuramento della mappa) esce subito
    };
    g.window = g; g.self = g;
    const ctx = vm.createContext(g);
    if (opts.nucleo !== false) vm.runInContext(JS('mappai-html-sicuro.js'), ctx);
    vm.runInContext(JS('mappai-search-finder.js'), ctx);
    return { ...d, g, st, giri };
}

const AMMESSI_RICERCA = new Set(['class', 'data-lucide', 'data-risultato']);
function mappaDaCercare() {
    const hub = { id: ID_VIRG, level: 1, label: EVIL + ' Sole', desc: 'Il sole <b>scalda</b> & illumina<br>la terra' };
    const altro = { id: ID_APICE, level: 1, label: 'Stelle', desc: 'Il vento del sole ' + SVG + ' arriva' };
    return {
        nodes: [{ id: 'root', level: 0, label: 'Cielo' }, hub, altro],
        sourcesDict: { [ID_APICE]: [{ title: '<i>Nota</i> sul sole', source: 'fonte', text: 'Frase <img src=y onerror=alert(7)> del sole' }] }
    };
}

test('Cerca: macro-area, etichetta, desc e note ostili restano testo; la <mark> evidenzia solo la parola', () => {
    const r = ricerca(mappaDaCercare());
    r.g.performSuperSearch('sole');
    const $ = r.$, box = $('#super-finder-results');
    soloDati($, box, AMMESSI_RICERCA, 'risultati');
    assert.equal(box.find('b, i:not([data-lucide]), br').length, 0);
    const titoli = box.find('h4').toArray().map(h => $(h).text().replace(/\s+/g, ' ').trim());
    assert.deepEqual(titoli, [EVIL + ' Sole (2)', 'Stelle (2)']);
    const anteprime = box.find('p').toArray().map(p => $(p).text());
    assert.deepEqual(anteprime, [
        '"' + EVIL + ' Sole"',
        '" Il sole <b>scalda</b> & illumina<br>la terra"',
        '" Il vento del sole ' + SVG + ' arriva"',
        '"Frase <img src=y onerror=alert(7)> del sole"'
    ]);
    // la <mark> sta solo attorno alla parola cercata, mai dentro un'entità o un tag
    const marcate = box.find('mark').toArray().map(x => $(x).text().toLowerCase());
    assert.ok(marcate.length >= 4 && marcate.every(x => x === 'sole'), JSON.stringify(marcate));
    box.find('[data-risultato]').each((_, e) => assert.match(e.attribs['data-risultato'], /^\d+$/));
});

test('Cerca: la ricerca di «br» non entra nel tag: il <br> del vault resta testo, marcato dentro', () => {
    const r = ricerca(mappaDaCercare());
    r.g.performSuperSearch('br');
    const $ = r.$, box = $('#super-finder-results');
    soloDati($, box, AMMESSI_RICERCA, 'risultati «br»');
    assert.equal(box.find('br, b').length, 0);
    const p = box.find('p').filter((_, e) => $(e).text().includes('illumina'));
    assert.equal(p.text(), '" Il sole <b>scalda</b> & illumina<br>la terra"');
    assert.deepEqual(p.find('mark').toArray().map(x => $(x).text()), ['br']);
});

test('Cerca: il clic su un risultato apre il nodo e la scheda Focus con l\'id ESATTO', () => {
    const r = ricerca(mappaDaCercare());
    r.g.performSuperSearch('sole');
    const $ = r.$;
    // prima: l'id stava dentro `onclick="…n.id==='${item.id}'…"`
    soloDati($, $('#super-finder-results'), AMMESSI_RICERCA, 'risultati');
    const risultati = $('#super-finder-results [data-risultato]').toArray();
    r.evento($(risultati[3]).find('mark')[0], 'click');   // anche un clic sulla parola evidenziata
    r.evento(risultati[0], 'click');
    assert.deepEqual(r.giri.focus, [ID_APICE, ID_VIRG]);
    assert.deepEqual(r.giri.schede.map(n => n && n.id), [ID_APICE, ID_VIRG]);
    assert.equal(r.g.__pwned, undefined);
});

test('Cerca: una MindMap vera (L2 e L3 sotto il loro L1), macro-aree coi nomi del prototipo e note senza testo non la fermano', () => {
    const nodes = [
        { id: 'r', level: 0, label: 'Radice' },
        { id: 'a', level: 1, label: 'Fotosintesi' },
        { id: 'b', level: 2, label: 'Luce del sole' },
        { id: 'c', level: 3, label: 'Fotoni', desc: 'arrivano dal sole' },
        { id: 'k', level: 1, label: 'constructor', desc: 'il sole costruisce' },
        { id: 'p', level: 1, label: '__proto__', desc: 'sole' },
        { id: 'n', level: 1, label: 1789, desc: 'il sole del 1789' }
    ];
    // come dopo la simulazione di D3: estremi oggetto accanto a estremi id
    const links = [{ source: 'r', target: 'a' }, { source: { id: 'a' }, target: { id: 'b' } }, { source: 'b', target: 'c' }];
    const r = ricerca({ nodes, links, sourcesDict: { a: [{ title: 'Il sole', source: 'libro' }] } });
    r.g.performSuperSearch('sole');   // prima: ReferenceError (`l` fuori dal suo find) al primo L2
    const $ = r.$, box = $('#super-finder-results');
    const titoli = box.find('h4').toArray().map(h => $(h).text().replace(/\s+/g, ' ').trim());
    assert.deepEqual(titoli, ['1789 (1)', 'Fotosintesi (3)', '__proto__ (1)', 'constructor (1)']);
    const fotosintesi = $(box.find('h4')[1]).next();
    assert.deepEqual(fotosintesi.find('p').toArray().map(p => $(p).text()), ['""', '"Luce del sole"', '" arrivano dal sole"']);
});

// ── senza il nucleo (il reader dell'iPad copia questi file, non ancora il nucleo) ──

test('senza il nucleo: albero, avviso, domanda, set e ricerca restano sicuri, e la ricerca evidenzia ancora', () => {
    const m = modali({ ...mappaOstile(), nucleo: false });
    m.g.renderTreeView();
    soloDati(m.$, m.$('#tree-view-container'), AMMESSI_ALBERO, 'albero senza nucleo');
    assert.ok(m.$('#tree-view-container').text().includes(EVIL + ' Fotosintesi'));
    m.g.showToast(EVIL);
    assert.equal(m.$('#toast-container span').text(), EVIL);
    m.g.showLinkFamilyPrompt(EVIL, SVG, () => {});
    soloDati(m.$, m.$('#link-family-question'), new Set(), 'domanda senza nucleo');
    const s = setStudio(setOstili(), { nucleo: false });
    s.g.renderStudySets();
    soloDati(s.$, s.$('#study-sets-container'), AMMESSI_SET, 'set senza nucleo');
    const r = ricerca({ ...mappaDaCercare(), nucleo: false });
    r.g.performSuperSearch('sole');
    soloDati(r.$, r.$('#super-finder-results'), AMMESSI_RICERCA, 'ricerca senza nucleo');
    assert.equal(r.$('#super-finder-results mark').first().attr('class'), 'bg-black text-white px-1 rounded font-bold');
    // la stessa uscita del nucleo, parola per parola
    const conNucleo = ricerca(mappaDaCercare());
    conNucleo.g.performSuperSearch('sole');
    assert.equal(r.$('#super-finder-results').text(), conNucleo.$('#super-finder-results').text());
    assert.equal(r.$('#super-finder-results mark').length, conNucleo.$('#super-finder-results mark').length);
    // highlightQuery (per chi la chiama da fuori) passa dall'escape anch'essa
    assert.equal(r.g.highlightQuery('<b>sole</b>', 'sole'), '&#60;b&#62;<mark class="bg-black text-white px-1 rounded font-bold">sole</mark>&#60;/b&#62;');
});

// ── la guardia sul sorgente: le strade vecchie non devono tornare ─────────────

test('sorgente: nei tre file nessun dato dentro un gestore in linea', () => {
    const codice = s => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    for (const f of ['mappai-ui-modals.js', 'mappai-flashcards-sr.js', 'mappai-search-finder.js']) {
        const m = codice(JS(f)).match(/\son[a-z]+="[^"]*\$\{[^"]*"/);
        assert.equal(m, null, f + ': ' + (m && m[0]));
    }
});

test('Cerca: le vecchie <mark> scritte dentro una nota non compaiono nell\'anteprima (seconda revisione, 25/9)', () => {
    const C = 'bg-black text-white px-1 rounded font-bold';
    const r = ricerca({
        nodes: [{ id: 'root', level: 0, label: 'Piante' }, { id: 'n1', level: 1, label: 'Fotosintesi', desc: 'x' }],
        sourcesDict: { n1: [{ title: 'Nota', source: 'fonte', text: 'La <mark class="' + C + '">clorofilla</mark> cattura la luce e produce ossigeno' }] }
    });
    r.g.performSuperSearch('ossigeno');
    const $ = r.$;
    const p = $('#super-finder-results p').filter((_, e) => $(e).text().includes('ossigeno'));
    assert.equal(p.text(), '"La clorofilla cattura la luce e produce ossigeno"');
});
