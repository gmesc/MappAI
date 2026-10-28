'use strict';
/*
 * La scheda del nodo, la scheda Focus e il tutor, VERI (mappai-ui-canvas.js e
 * mappai-ai-tutor.js girano in una vm), davanti a un vault ricevuto da un collega
 * e a un modello pilotato da un PDF di terzi. Il DOM è una facciata sottile sopra
 * cheerio (parse5, lo stesso algoritmo di parsing del browser): qui non si prova
 * che un `onerror` NON scatti — cheerio non esegue niente — ma che nell'albero
 * prodotto non esista alcun elemento o attributo nato dai dati.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const cheerio = require('cheerio');
const TextUtils = require('../public/js/mappai-text-utils.js');

const JS = f => fs.readFileSync(path.join(__dirname, '..', 'public', 'js', f), 'utf8');
// gli avvisi attesi («link non aperto») non sporcano l'uscita della suite; gli errori sì
const QUIETA = { log() {}, info() {}, warn() {}, error: (...a) => console.error(...a) };

/* I gestori in linea ammessi sono quelli scritti LETTERALMENTE nei template dei
   due file: testo fisso, nessun dato dentro. Un `${…}` in un gestore vale solo se
   a schermo è diventato un numero (l'indice dell'opzione del quiz): un URL, un id
   o un testo del modello lì dentro non passa. */
const gestoreDelTemplate = (() => {
    const letterali = new Set(), schemi = [];
    for (const f of ['mappai-ui-canvas.js', 'mappai-ai-tutor.js']) {
        for (const m of JS(f).matchAll(/\son[a-z]+="([^"]*)"/g)) {
            if (!m[1].includes('${')) { letterali.add(m[1]); continue; }
            schemi.push(new RegExp('^' + m[1].split(/\$\{[^}]*\}/).map(s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\d+') + '$'));
        }
    }
    return v => letterali.has(v) || schemi.some(r => r.test(v));
})();

function dom(corpo) {
    const $ = cheerio.load('<html><body>' + corpo + '</body></html>');
    const cache = new WeakMap(), ascolti = {};
    function wrap(n) {
        if (!n) return null;
        if (cache.has(n)) return cache.get(n);
        const e = {
            node: n, style: {}, scrollTop: 0, scrollHeight: 0,
            classList: {
                add: (...c) => { $(n).addClass(c.join(' ')); },
                remove: (...c) => { c.forEach(x => $(n).removeClass(x)); },
                toggle: c => { $(n).toggleClass(c); return $(n).hasClass(c); },
                contains: c => $(n).hasClass(c)
            },
            get innerHTML() { return $(n).html(); }, set innerHTML(v) { $(n).html(v); },
            get textContent() { return $(n).text(); }, set textContent(v) { $(n).text(v); },
            set innerText(v) { $(n).text(v); },
            get value() { return $(n).val() || ''; }, set value(v) { $(n).val(v); },
            getAttribute: k => { const v = $(n).attr(k); return v === undefined ? null : v; },
            setAttribute: (k, v) => { $(n).attr(k, String(v)); },
            closest: s => wrap($(n).closest(s)[0]),
            querySelector: s => wrap($(n).find(s)[0]),
            querySelectorAll: s => $(n).find(s).toArray().map(wrap),
            appendChild: c => { $(n).append(c.node); return c; },
            remove: () => { $(n).remove(); },
            scrollIntoView() {}
        };
        cache.set(n, e);
        return e;
    }
    const document = {
        readyState: 'complete',
        documentElement: { style: { setProperty() {} } },
        getElementById: id => wrap($('[id="' + String(id).replace(/"/g, '\\"') + '"]')[0]),
        createElement: tag => wrap($('<' + tag + '></' + tag + '>')[0]),
        querySelectorAll: s => $(s).toArray().map(wrap),
        addEventListener: (tipo, fn) => { (ascolti[tipo] = ascolti[tipo] || []).push(fn); }
    };
    // un clic che risale fino al documento, come nel browser
    const clic = el => (ascolti.click || []).forEach(fn => fn({ target: el, preventDefault() {} }));
    return { $, wrap, document, ascolti, clic };
}

/* Nessun elemento attivo e nessun attributo `on*` che non sia del template. */
function soloTemplate($, radice, etichetta) {
    assert.equal($(radice).find('script, iframe, object, embed, svg, math, a, form').length, 0, etichetta + ': elemento attivo');
    $(radice).find('*').each((_, el) => {
        for (const [k, v] of Object.entries(el.attribs)) {
            if (/^on/i.test(k)) assert.ok(gestoreDelTemplate(v), etichetta + ': gestore nato dai dati <' + el.tagName + ' ' + k + '="' + v + '">');
            if (/^(href|action|formaction|srcdoc)$/i.test(k)) assert.fail(etichetta + ': attributo ' + k + ' su <' + el.tagName + '>');
        }
    });
}

// ── la scheda del nodo e la scheda Focus (mappai-ui-canvas.js) ───────────────

function canvas(opts = {}) {
    const d = dom(`
        <div id="node-details"></div>
        <div id="source-modal" class="hidden opacity-0"><div id="source-modal-content-box" class="scale-95">
            <div id="source-modal-header"><div id="source-modal-kinship" class="hidden"></div>
                <h3 id="source-modal-title"></h3><p id="source-modal-subtitle"></p></div>
            <div id="source-modal-body"></div></div></div>`);
    const st = { db: { nodes: opts.nodes || [], links: opts.links || [], sourcesDict: opts.sourcesDict || {}, customColors: {} },
        extractionMode: opts.mode || 'mindmap', studentMode: false, rootNodeLabel: 'Mappa' };
    const giri = { esterni: [], toast: [], lightbox: [], finestre: [], salvati: 0 };
    const g = {
        console: QUIETA, URL, document: d.document, appState: st,
        setTimeout: () => 0, setInterval: () => 0, clearInterval() {},
        cleanLabel: TextUtils.cleanLabel, colorScale: ['#222222', '#333333', '#444444', '#555555', '#666666'],
        hideContextMenu() {}, linkingState: { active: false },
        // la classe NATIVA del browser: sta sull'oggetto globale, e `saveCurrentProject` non ce l'ha
        StorageManager: function StorageManager() {},
        t: (k, f) => f, showToast: (...a) => giri.toast.push(a), safeCreateIcons() {},
        openLightbox: src => giri.lightbox.push(src),
        getInheritedDatabase: id => [].concat(st.db.sourcesDict[id] || []),   // come app.js: gli oggetti VERI
        electronAPI: { openExternal: url => { giri.esterni.push(url); return Promise.resolve({ success: true }); } },
        open: (...a) => giri.finestre.push(a),
        showPrompt: (msg, attuale, cb) => cb(opts.nuovoTitolo)
    };
    g.window = g; g.self = g;
    const ctx = vm.createContext(g);
    // il nostro StorageManager è una `const` LESSICALE (mappai-storage-lang.js): non sta su window
    vm.runInContext('const StorageManager = { saveCurrentProject() { window.__salvati = (window.__salvati || 0) + 1; } };', ctx);
    if (opts.nucleo !== false) vm.runInContext(JS('mappai-html-sicuro.js'), ctx);
    // la ricerca vera (highlightQuery): è lei che il vecchio openSourceModal usava per riscrivere le note
    vm.runInContext(JS('mappai-search-finder.js'), ctx);
    st.searchQuery = opts.q || '';
    vm.runInContext(JS('mappai-ui-canvas.js'), ctx);
    return { ...d, g, st, giri };
}

const EVIL = '<img src=x onerror="window.__pwned=1">';
function nodoOstile() {
    return {
        id: 'n1\' onmouseover="window.__pwned=2', level: 2,
        label: EVIL + ' Fotosintesi',
        desc: 'La luce </div><script>window.__pwned=3</script> & l\'acqua; $x<y$ resta formula\nseconda riga',
        image: 'x" onerror="window.__pwned=4',
        images: ['x" onerror="window.__pwned=4', "javascript:window.__pwned=5'"],
        urls: ["javascript:window.__pwned=6", "https://example.org/a?b=1&c='2'", 'file:///Users/docente/Documenti/Verifica finale.pdf', "x');window.__pwned=7;//"]
    };
}

test('scheda del nodo: etichetta, desc, immagini e link di un vault ostile restano testo e dati', () => {
    const n = nodoOstile();
    const c = canvas({ nodes: [n], sourcesDict: { [n.id]: [{ title: 'T', source: 'S', text: 'frase' }] } });
    c.g.handleNodeClick({ stopPropagation() {} }, n, true, true);
    const $ = c.$, box = $('#node-details');
    soloTemplate($, box, 'scheda del nodo');
    assert.equal(box.find('h2').text(), TextUtils.cleanLabel(n.label));
    assert.equal(box.find('.whitespace-pre-wrap').text(), TextUtils.cleanLabel(n.desc));
    // due immagini (la prima + le altre), con la src ESATTA e il solo gestore del template
    const imgs = box.find('img').toArray();
    assert.equal(imgs.length, 2);
    assert.deepEqual(imgs.map(i => i.attribs.src), [n.image, n.images[1]]);
    imgs.forEach(i => assert.deepEqual(Object.keys(i.attribs).sort(), ['class', 'data-mappai-lightbox', 'onerror', 'src']));
    // i link: il valore sta, intero, in data-mappai-link
    assert.deepEqual(box.find('[data-mappai-link]').toArray().map(e => e.attribs['data-mappai-link']), n.urls);
    assert.equal(box.find('[data-mappai-fonti]').attr('data-mappai-fonti'), n.id);
    assert.equal(c.g.__pwned, undefined);
});

test('scheda del nodo: i clic passano dall\'ascolto delegato, e solo i link ammessi escono dall\'app', () => {
    const n = nodoOstile();
    const c = canvas({ nodes: [n], sourcesDict: { [n.id]: [{ title: 'T', source: 'S', text: 'frase' }] } });
    c.g.handleNodeClick({ stopPropagation() {} }, n, true, true);
    const link = c.$('#node-details [data-mappai-link]').toArray().map(c.wrap);
    link.forEach(l => c.clic(l.querySelector('span') || l));   // anche un clic sul testo interno risale al link
    assert.deepEqual(c.giri.esterni, [new URL(n.urls[1]).href, 'file:///Users/docente/Documenti/Verifica%20finale.pdf']);
    assert.equal(c.giri.toast.length, 2, 'due link rifiutati, due avvisi');
    assert.ok(c.giri.toast.every(t => t[1] === 'error'));
    assert.deepEqual(c.giri.finestre, [], 'dentro Electron nessun window.open di riserva');
    c.clic(c.wrap(c.$('#node-details img')[1]));
    assert.deepEqual(c.giri.lightbox, [n.images[1]]);
    // «Fonti e Note Approfondite» apre la scheda Focus del nodo giusto, anche con un id ostile
    c.clic(c.wrap(c.$('#node-details [data-mappai-fonti]')[0]));
    assert.equal(c.$('#source-modal-title').text(), TextUtils.cleanLabel(n.label));
    assert.ok(!c.$('#source-modal').hasClass('hidden'));
});

test('openCustomLink: la strada comune (anche la modifica del nodo) rifiuta ciò che lancia programmi', () => {
    const c = canvas();
    for (const u of ['javascript:alert(1)', ' JaVa\tScRiPt:alert(1)', 'smb://server/share', 'file:///Applications/Calculator.app/', 'file:///tmp/x.command', 'data:text/html,x']) c.g.openCustomLink(u);
    assert.deepEqual(c.giri.esterni, []);
    assert.equal(c.giri.toast.length, 6);
    assert.match(c.giri.toast[3][0], /documenti, immagini, audio e video/, 'un file: rifiutato dice perché');
    c.g.openCustomLink('mailto:giacomo@insegnai.ch');
    assert.deepEqual(c.giri.esterni, ['mailto:giacomo@insegnai.ch']);
    // fuori da Electron (reader, banco nel browser) si apre una scheda, senza opener
    delete c.g.electronAPI;
    c.g.openCustomLink('https://example.org');
    c.g.openCustomLink('javascript:alert(1)');
    assert.deepEqual(c.giri.finestre, [['https://example.org/', '_blank', 'noopener']]);
});

test('scheda Focus: desc, frasi della fonte e parentela passano dall\'escape; la ricerca evidenzia sul testo', () => {
    const padre = { id: 'p', level: '1"><img src=x onerror=alert(1)>', label: '<b>Padre</b>' };
    const n = { id: 'c', level: 2, label: EVIL, desc: 'La <b>luce</b> & il sole\nsole di sera',
        urls: ["x');alert(1);//"], images: ['x" onerror="alert(2)'] };
    const nota = { title: '<i>Titolo</i>', source: '<u>fonte</u>', text: 'Il sole <img src=x onerror=alert(3)> scalda', verbatim: true };
    const c = canvas({ nodes: [padre, n], links: [{ source: 'p', target: 'c' }], sourcesDict: { c: [nota] }, q: 'sole' });
    c.g.openSourceModal('c');
    const $ = c.$, body = $('#source-modal-body');
    soloTemplate($, body, 'scheda Focus');
    soloTemplate($, $('#source-modal-kinship'), 'parentela');
    assert.equal($('#source-modal-kinship').text(), 'L1"><img src=x onerror=alert(1)>: <b>Padre</b>');
    assert.equal($('#source-modal-kinship').find('img, b').length, 0);
    const desc = body.find('.desc-text');
    assert.equal(desc.find('b').length, 0);
    assert.equal(desc.find('br').length, 1, 'l\'a capo resta un <br>');
    assert.equal(desc.text(), 'La <b>luce</b> & il solesole di sera');
    assert.deepEqual(desc.find('mark').toArray().map(m => $(m).text()), ['sole', 'sole']);
    const testoNota = body.find('.note-text');
    assert.equal(testoNota.text(), '"Il sole <img src=x onerror=alert(3)> scalda"');
    assert.equal(testoNota.find('mark').text(), 'sole');
    assert.equal(body.find('.note-entry p span').first().text().includes('<i>Titolo</i>'), true);
    assert.deepEqual(body.find('[data-mappai-link]').toArray().map(e => e.attribs['data-mappai-link']), n.urls);
    assert.deepEqual(body.find('img').toArray().map(e => e.attribs.src), n.images);
});

test('scheda Focus: la frase verbatim della fonte NON si prende più la <mark> nei dati (e quelle vecchie spariscono a schermo)', () => {
    const vecchia = '<mark class="bg-black text-white px-1 rounded font-bold">';
    const nota = { title: 'T', source: 'S', text: 'Il sole scalda la terra', verbatim: true };
    const sporca = { title: 'T', source: 'S', text: 'La ' + vecchia + vecchia + 'terra</mark></mark> gira' };
    const n = { id: 'c', level: 1, label: 'Sole', desc: 'desc' };
    const c = canvas({ nodes: [n], sourcesDict: { c: [nota, sporca] }, q: 'terra' });
    c.g.openSourceModal('c');
    c.g.openSourceModal('c');
    assert.equal(nota.text, 'Il sole scalda la terra', 'il dato resta verbatim');
    assert.equal(sporca.text, 'La ' + vecchia + vecchia + 'terra</mark></mark> gira', 'il dato su disco non si tocca');
    const note = c.$('#source-modal-body .note-text').toArray().map(e => c.$(e));
    assert.equal(note[1].text(), '"La terra gira"');
    assert.equal(note[1].find('mark').length, 1, 'resta solo la <mark> della ricerca di adesso');
});

test('rinomina: il progetto si salva davvero (la const lessicale, non la classe nativa su window)', () => {
    const c = canvas({ nuovoTitolo: 'Nuovo titolo', mode: 'kg' });
    c.g.startEditingTitle();
    assert.equal(c.st.rootNodeLabel, 'Nuovo titolo');
    assert.equal(c.g.__salvati, 1, 'saveCurrentProject chiamato una volta');
    assert.equal(c.giri.toast.at(-1)[1], 'success');
});

test('senza il nucleo (una copia che non lo carica ancora) la scheda resta sicura: tutto testo, solo web e posta', () => {
    const n = nodoOstile();
    const c = canvas({ nodes: [n], nucleo: false });
    c.g.handleNodeClick({ stopPropagation() {} }, n, true, true);
    soloTemplate(c.$, c.$('#node-details'), 'scheda senza nucleo');
    assert.equal(c.$('#node-details h2').text(), TextUtils.cleanLabel(n.label));
    // 25/9: l'iPad copia questo file prima del nucleo; senza, nessun link si apriva, neanche https
    c.g.openCustomLink('https://example.org');
    c.g.openCustomLink('mailto:giacomo@insegnai.ch');
    assert.deepEqual(c.giri.esterni, ['https://example.org/', 'mailto:giacomo@insegnai.ch']);
    for (const u of ['javascript:alert(1)', 'file:///tmp/x.command', 'data:text/html,x', 'smb://s/x']) c.g.openCustomLink(u);
    assert.deepEqual(c.giri.esterni, ['https://example.org/', 'mailto:giacomo@insegnai.ch'], 'il resto resta chiuso');
    assert.equal(c.giri.toast.length, 4, 'il docente sa quali link non si sono aperti');
});

test('addL1Input: il valore iniziale resta dentro value=""', () => {
    const c = canvas();
    c.$('body').append('<div id="l1-inputs-container"></div><select id="extraction-mode"><option value="mindmap" selected>mm</option></select>');
    c.g.addL1Input('"><img src=x onerror=alert(1)>');
    const input = c.$('#l1-inputs-container input');
    assert.equal(input.attr('value'), '"><img src=x onerror=alert(1)>');
    assert.equal(c.$('#l1-inputs-container img').length, 0);
});

// ── il tutor (mappai-ai-tutor.js) ─────────────────────────────────────────────

function tutor(opts = {}) {
    const d = dom(`
        <input id="ai-sidebar-input"><div id="sidebar-tutor-chat-history"></div><div id="sidebar-tutor-modes"></div>
        <div id="node-tutor-start"></div><div id="node-tutor-chat-area" class="hidden"></div>
        <div id="node-tutor-chat-history"></div><input id="node-tutor-input"><div id="node-tutor-modes"></div>
        <div id="ai-modal" class="hidden"></div><div id="ai-modal-content-box"></div><div id="ai-modal-title"></div>
        <div id="ai-modal-body"></div><div id="tts-button"></div>`);
    const giri = { voce: [], trascritti: [], payload: [], vivi: [], inerti: 0 };
    /* il documento INERTE di createHTMLDocument: qui un cheerio a parte */
    d.document.implementation = { createHTMLDocument: () => {
        giri.inerti++;
        const $i = cheerio.load('');
        return { createElement: () => ({ set innerHTML(v) { $i('body').html(v); }, get textContent() { return $i('body').text(); } }) };
    } };
    const crea = d.document.createElement;
    d.document.createElement = tag => { giri.vivi.push(tag); return crea(tag); };
    const risposte = [].concat(opts.risposte || []);
    const g = {
        console: QUIETA, URL, document: d.document, setTimeout: () => 0,
        appState: { db: { nodes: [{ id: 'n1', label: 'Nodo', desc: 'Desc <img src=x onerror=alert(1)> del nodo' }], links: [] },
            language: 'it', extractionMode: 'mindmap', aiProvider: 'google' },
        MARKER_HTML: '```html', MARKER_END: '```', MARKER_JSON: '```json',
        // stripHTML passa da un <div> del documento VIVO: se il tutor lo chiama ancora, lo si vede qui
        stripHTML: s => { giri.vivi.push('stripHTML'); return String(s); },
        editTarget: null, currentNode: null,
        initD3Visualization() {}, renderGraph() {}, cleanLabel: TextUtils.cleanLabel,
        salvageTruncatedJSON: s => JSON.parse(s),
        SpeechSynthesisUtterance: function (testo) { this.text = testo; },
        t: (k, f) => f, showToast() {}, safeCreateIcons() {}, getSystemKey: () => 'chiave',
        fillPromptTemplate: () => '', injectClassTuning: p => p,
        fetchModelAPI: async p => { giri.payload.push(p); return { candidates: [{ content: { parts: [{ text: risposte.shift() }] } }] }; },
        speechSynthesis: { speaking: false, cancel() {}, speak: u => giri.voce.push(u.text) },
        electronAPI: { saveChatTranscript: async a => { giri.trascritti.push(a.textContent); return { success: true }; } }
    };
    g.window = g; g.self = g;
    vm.createContext(g);
    if (opts.nucleo !== false) vm.runInContext(JS('mappai-html-sicuro.js'), g);
    vm.runInContext(JS('mappai-ai-tutor.js'), g);
    return { ...d, g, giri };
}

test('tutor della barra: l\'HTML chiesto dal prompt resta, quello ostile no; la domanda dell\'utente è testo', async () => {
    const risposta = '```html\n<p onclick="x()">Ciao <strong>studente</strong></p><ul><li>uno</li></ul><img src=x onerror=alert(1)><a href="javascript:alert(2)">qui</a>\n```';
    const t = tutor({ risposte: [risposta] });
    t.$('#ai-sidebar-input').val('<img src=y onerror=alert(3)> che cos\'è?');
    await t.g.sendSidebarTutorMessage();
    const chat = t.$('#sidebar-tutor-chat-history');
    soloTemplate(t.$, chat, 'barra del tutor');
    assert.equal(chat.find('img').length, 0);
    assert.equal(chat.find('[class*="man-verde"] p').text(), '<img src=y onerror=alert(3)> che cos\'è?');
    const bolla = chat.find('.markdown-body').last();
    assert.equal(bolla.html(), '<p>Ciao <strong>studente</strong></p><ul><li>uno</li></ul>qui');
    // il contesto mandato al modello: la desc del vault, senza tag e senza passare dal documento vivo
    assert.match(t.giri.payload[0].contents[0].parts[0].text, /- NODO \[Nodo\]: Desc {2}del nodo/);
    // la voce: il testo esatto in data-tutor-voce, letto senza tag
    const voce = chat.find('[data-tutor-voce]').last();
    assert.equal(voce.attr('data-tutor-voce'), risposta);
    t.clic(t.wrap(voce[0]));
    assert.equal(t.giri.voce.length, 1);
    assert.ok(!t.giri.voce[0].includes('<'), t.giri.voce[0]);
    assert.match(t.giri.voce[0], /Ciao studente/);
    // i trascritti si ricavano in un documento inerte, mai con stripHTML
    await new Promise(r => setImmediate(r));
    assert.equal(t.giri.trascritti.length, 2);
    assert.ok(t.giri.trascritti.every(x => !/<img/.test(x)), JSON.stringify(t.giri.trascritti));
    assert.deepEqual(t.giri.vivi, []);
    assert.ok(t.giri.inerti > 0);
});

test('tutor del nodo: grassetti e a capo come prima; l\'attacco `&#39;` al vecchio onclick è solo testo', async () => {
    const risposta = "**Bravo**, *quasi*\nriprova &#39;);window.__pwned=1;// <img src=x onerror=alert(1)>";
    const t = tutor({ risposte: [risposta] });
    t.g.editTarget = { id: 'n1', label: 'Nodo', desc: 'desc' };
    t.g.startNodeTutor();
    const chat = t.$('#node-tutor-chat-history');
    assert.equal(chat.find('.markdown-body strong').text(), 'modalità', 'il saluto tiene il suo grassetto');
    await t.g.sendNodeTutorMessage('Iniziamo <b>subito</b>');
    soloTemplate(t.$, chat, 'chat del nodo');
    assert.equal(chat.find('.bg-emerald-500 p').text(), 'Iniziamo <b>subito</b>');
    const bolla = chat.find('.markdown-body').last();
    // il `&#39;` è un carattere del testo: a schermo un apice, e nessun codice
    assert.equal(bolla.html(), "<strong>Bravo</strong>, <em>quasi</em><br>riprova ');window.__pwned=1;// ");
    assert.equal(bolla.find('strong').text(), 'Bravo');
    assert.equal(bolla.find('em').text(), 'quasi');
    assert.equal(bolla.find('br').length, 1);
    assert.equal(bolla.find('img').length, 0);
    assert.equal(chat.find('[data-tutor-voce]').last().attr('data-tutor-voce'), risposta);
    assert.deepEqual(t.giri.vivi, []);
});

test('tutor del nodo: lo storico che arriva dal VAULT si ridisegna senza eseguire niente', () => {
    const t = tutor();
    t.g.editTarget = { id: 'n1', label: 'Nodo', desc: 'desc' };
    t.g.setTutorState({ nodes: { n1: { mode: 'socratic', turns: 1, history: [
        { role: 'user', parts: [{ text: "CONTESTO NODO [x]: y\n\nL'utente dice: <img src=x onerror=alert(1)>ciao" }] },
        { role: 'model', parts: [{ text: '<p style="x">ok</p><script>alert(2)</script><svg onload=alert(3)>' }] }
    ] } } });
    t.g.startNodeTutor();
    const chat = t.$('#node-tutor-chat-history');
    soloTemplate(t.$, chat, 'storico dal vault');
    assert.equal(chat.find('.bg-slate-800 p').text(), '<img src=x onerror=alert(1)>ciao');
    assert.equal(chat.find('.markdown-body').html(), '<p>ok</p>');
});

test('quiz del nodo: domanda, opzioni e spiegazione del modello passano dalla lista bianca', async () => {
    const quiz = { question: '<img src=x onerror=alert(1)>Che cosa fa la <b>clorofilla</b>?',
        options: ['<script>alert(2)</script>Assorbe la luce', 'Respira'], correctIndex: 0,
        explanation: '<a href="javascript:alert(3)">Perché</a> cattura i fotoni' };
    const t = tutor({ risposte: [JSON.stringify(quiz)] });
    t.g.currentNode = { id: 'n1', label: 'Clorofilla', desc: 'desc', studyStatus: 'none' };
    await t.g.generateAIQuiz();
    const body = t.$('#ai-modal-body');
    assert.equal(body.find('h3').html(), 'Che cosa fa la <b>clorofilla</b>?');
    assert.deepEqual(body.find('.quiz-option').toArray().map(o => t.$(o).text().replace(/\s+/g, ' ').trim()), ['A Assorbe la luce', 'B Respira']);
    t.g.selectQuizAnswer(1);
    soloTemplate(t.$, body, 'quiz');
    assert.match(body.find('#quiz-feedback').text(), /Perché cattura i fotoni/);
    assert.equal(body.find('img, script, a').length, 0);
});

test('tutor senza il nucleo: tutto resta testo (via più severa), la chat non si rompe', async () => {
    const t = tutor({ nucleo: false, risposte: ['<p>ok</p><img src=x onerror=alert(1)>'] });
    t.$('#ai-sidebar-input').val('domanda');
    await t.g.sendSidebarTutorMessage();
    const bolla = t.$('#sidebar-tutor-chat-history .markdown-body').last();
    assert.equal(bolla.text(), '<p>ok</p><img src=x onerror=alert(1)>');
    assert.equal(bolla.find('img, p').length, 0);
});

// ── la guardia sul sorgente: le strade vecchie non devono tornare ─────────────

test('sorgente: niente valori dei dati negli onclick, niente window.StorageManager, niente stripHTML nel tutor', () => {
    const canvasJs = JS('mappai-ui-canvas.js'), tutorJs = JS('mappai-ai-tutor.js');
    const codice = s => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    assert.doesNotMatch(codice(canvasJs), /onclick="window\.(openCustomLink|openLightbox|openSourceModal)\(/);
    assert.doesNotMatch(codice(canvasJs), /window\.StorageManager/);
    assert.doesNotMatch(codice(canvasJs), /db\.text\s*=/);
    assert.doesNotMatch(codice(tutorJs), /onclick="window\.readTextAloud/);
    assert.doesNotMatch(codice(tutorJs), /\bstripHTML\(/);
});

// ── il prompt del tutor su Infomaniak (25/9) ──────────────────────────────────
test('tutor del nodo su Infomaniak: senza la variante _INFOMANIAK usa il prompt socratico standard', async () => {
    const chieste = [];
    for (const provider of ['infomaniak', 'google']) {
        const t = tutor({ risposte: ['ok'] });
        t.g.appState.aiProvider = provider;
        // come i file di prompt veri: le varianti _INFOMANIAK non esistono → stringa vuota
        t.g.fillPromptTemplate = k => { chieste.push(provider + ':' + k); return /INFOMANIAK/.test(k) ? '' : 'PROMPT ' + k; };
        t.g.editTarget = { id: 'n1', label: 'Nodo', desc: 'desc' };
        t.g.startNodeTutor();
        await t.g.sendNodeTutorMessage('ciao');
        const p = t.giri.payload[0];
        const sistema = JSON.stringify(p.systemInstruction || p.contents);
        assert.match(sistema, /PROMPT SOCRATIC_TUTOR_IT/, provider + ': il tutor deve avere il suo prompt di sistema');
    }
    // su Infomaniak si chiede prima la variante, poi si ripiega; su Google solo lo standard
    assert.deepEqual(chieste.filter(k => /:SOCRATIC_TUTOR/.test(k)),
        ['infomaniak:SOCRATIC_TUTOR_INFOMANIAK_IT', 'infomaniak:SOCRATIC_TUTOR_IT', 'google:SOCRATIC_TUTOR_IT']);
});
