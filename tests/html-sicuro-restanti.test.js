'use strict';
/*
 * I sink HTML che restavano dopo il ramo «rinforzo» (packet 0033), VERI: i moduli
 * girano in una vm davanti a dati ostili — quello che scrive un ALLIEVO e arriva
 * nell'app del docente, un vault o un JSON passato da un collega, un link o un QR
 * preparato apposta (25/9/2026).
 *
 * Il DOM è una facciata sottile sopra cheerio (parse5, lo stesso algoritmo di
 * parsing del browser). In più fa ciò che il browser fa DAVVERO con il documento
 * vivo: un `<img>` che non carica esegue il suo `onerror` e un `<svg>` il suo
 * `onload` — anche se l'elemento non è mai entrato nella pagina (un `<div>`
 * staccato con `innerHTML`). I payload chiamano `alert`: ogni chiamata è un
 * codice girato. Il documento di DOMParser, invece, è INERTE, come nel browser:
 * non carica immagini e non ha gestori. I gestori in linea del template si
 * ESEGUONO in una vm, per vedere che cosa ricevono e che nient'altro giri.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const cheerio = require('cheerio');

const ROOT = path.join(__dirname, '..');
const JS = f => fs.readFileSync(path.join(ROOT, 'public', 'js', f), 'utf8');
// gli avvisi attesi non sporcano l'uscita della suite; gli errori sì
const QUIETA = { log() {}, info() {}, warn() {}, error: (...a) => console.error(...a) };

// ── gli attrezzi ─────────────────────────────────────────────────────────────

/* Un gestore in linea eseguito come lo esegue il browser: il testo dell'attributo,
   già decodificato dal parser HTML, diventa il corpo di una funzione. Un attributo
   spezzato dai dati dà un errore di sintassi, e la prova cade lì. */
function esegui(codice, globali) {
    const ctx = vm.createContext(Object.assign({}, globali));
    ctx.window = ctx;
    return vm.runInContext('(function (event) {\n' + codice + '\n})', ctx).call({}, {});
}

// `innerHTML = null` è la stringa vuota, `undefined` la parola: [LegacyNullToEmptyString]
const html = v => (v === null ? '' : String(v));

/* giri.pwned conta gli `alert` dei payload scattati nel documento VIVO. */
function dom(corpo, giri) {
    const $ = cheerio.load('<html><head></head><body>' + corpo + '</body></html>');
    const cache = new WeakMap(), ascolti = new Map(), delDocumento = {};
    function scatta(n) {
        $(n).find('img[onerror], svg[onload]').each((_, el) => {
            esegui(el.attribs.onerror || el.attribs.onload, { alert: () => { giri.pwned++; } });
        });
    }
    function wrap(n) {
        if (!n) return null;
        if (cache.has(n)) return cache.get(n);
        const e = {
            node: n, style: { setProperty() {}, removeProperty() {} }, isConnected: true, offsetHeight: 0,
            classList: {
                add: (...c) => { $(n).addClass(c.join(' ')); },
                remove: (...c) => { c.forEach(x => $(n).removeClass(x)); },
                toggle: (c, si) => { $(n).toggleClass(c, si); return $(n).hasClass(c); },
                contains: c => $(n).hasClass(c)
            },
            get innerHTML() { return $(n).html(); },
            set innerHTML(v) { $(n).html(html(v)); scatta(n); },
            get textContent() { return $(n).text(); }, set textContent(v) { $(n).text(String(v)); },
            get innerText() { return $(n).text(); }, set innerText(v) { $(n).text(String(v)); },
            get value() { return $(n).val() || ''; }, set value(v) { $(n).val(v); },
            get checked() { return $(n).is(':checked'); },
            get className() { return $(n).attr('class') || ''; }, set className(v) { $(n).attr('class', v); },
            get id() { return $(n).attr('id') || ''; }, set id(v) { $(n).attr('id', v); },
            dataset: new Proxy({}, { get: (_, k) => $(n).attr('data-' + String(k).replace(/[A-Z]/g, m => '-' + m.toLowerCase())) }),
            getAttribute: k => { const v = $(n).attr(k); return v === undefined ? null : v; },
            setAttribute: (k, v) => { $(n).attr(k, String(v)); },
            closest: s => wrap($(n).closest(s)[0]),
            querySelector: s => wrap($(n).find(s)[0]),
            querySelectorAll: s => $(n).find(s).toArray().map(wrap),
            appendChild: c => { $(n).append(c.node); scatta(c.node); return c; },
            remove: () => { $(n).remove(); },
            addEventListener: (tipo, fn) => { const k = tipo + '|'; if (!ascolti.has(n)) ascolti.set(n, {}); (ascolti.get(n)[k] = ascolti.get(n)[k] || []).push(fn); },
            removeEventListener() {}, focus() {}, scrollIntoView() {}
        };
        cache.set(n, e);
        return e;
    }
    const document = {
        readyState: 'complete',
        documentElement: { style: { setProperty() {} } },
        get body() { return wrap($('body')[0]); },
        getElementById: id => wrap($('[id="' + String(id).replace(/"/g, '\\"') + '"]')[0]),
        createElement: tag => wrap($('<' + tag + '></' + tag + '>')[0]),
        querySelector: s => wrap($(s)[0]),
        querySelectorAll: s => $(s).toArray().map(wrap),
        addEventListener: (tipo, fn) => { (delDocumento[tipo] = delDocumento[tipo] || []).push(fn); },
        removeEventListener() {}
    };
    /* Un clic che risale dall'elemento fino al documento, come nel browser; si
       aspettano i gestori asincroni. */
    async function clic(el) {
        const ev = { target: el, preventDefault() {}, stopPropagation() {} };
        const giri2 = [];
        for (let n = el.node; n; n = n.parent) {
            const l = ascolti.get(n);
            if (l && l['click|']) l['click|'].forEach(fn => giri2.push(fn(ev)));
            if (cache.has(n) && typeof cache.get(n).onclick === 'function') giri2.push(cache.get(n).onclick(ev));
        }
        (delDocumento.click || []).forEach(fn => giri2.push(fn(ev)));
        await Promise.all(giri2);
    }
    return { $, wrap, document, clic };
}

/* Il documento INERTE di DOMParser: un cheerio a parte, dove niente scatta. */
function domParserInerte(giri) {
    return class DOMParser {
        parseFromString(sorgente) {
            giri.inerti++;
            const $i = cheerio.load(String(sorgente));
            const el = n => ({
                set innerHTML(v) { $i(n).html(html(v)); },
                get innerHTML() { return $i(n).html(); },
                get textContent() { return $i(n).text(); },
                get innerText() { return $i(n).text(); }
            });
            return { body: el($i('body')[0]), createElement: tag => el($i('<' + tag + '></' + tag + '>')[0]) };
        }
    };
}

/* Nessun elemento attivo e nessun gestore `on…` che non sia del template; nessun
   `style` o link che porti un `url(`/`javascript:`. */
const ATTIVI = 'script, iframe, object, embed, svg, math, a, form, img, video, audio, base, link, style';
function soloTemplate($, radice, etichetta, gestori = []) {
    const attivi = $(radice).find(ATTIVI).toArray();
    assert.equal(attivi.length, 0, etichetta + ': elemento nato dai dati: ' + attivi.map(e => $.html(e)).join(' '));
    $(radice).find('*').each((_, el) => {
        for (const [k, v] of Object.entries(el.attribs)) {
            if (/^on/i.test(k)) {
                assert.ok(gestori.some(g => (g instanceof RegExp ? g.test(v) : g === v)),
                    etichetta + ': gestore nato dai dati <' + el.tagName + ' ' + k + '="' + v + '">');
            }
            if (/^(style|href|src|action|formaction|srcdoc)$/i.test(k) && /javascript:|url\(|expression\(/i.test(v)) {
                assert.fail(etichetta + ': ' + k + ' ostile su <' + el.tagName + '>: ' + v);
            }
        }
    });
}

const IMG = '<img src=x onerror="alert(1)">';
const SVG = '"><svg onload=alert(2)>';
const APICE = "'),alert(3),('";

// ── 1. meta-analisi docente: la modalità del tutor scritta nel vault dell'allievo ──
// mappai-meta-analysis.js:~384 → la dashboard (finestra principale) e il report
// (document.write in una finestra della stessa origine)

function metaAnalisi() {
    const giri = { pwned: 0, finestre: [] };
    const d = dom('', giri);
    const vault = {
        rootNodeLabel: 'Fotosintesi',
        nodes: [{ id: 'n1', label: 'Luce', level: 1, desc: 'La luce' }, { id: 'n2', label: 'Clorofilla', level: 2, desc: 'Il pigmento' }],
        links: [{ source: 'n1', target: 'n2', rel: 'include' }],
        branchLocks: { L1_luce: { owner: 'Gruppo 1', editable: true } },
        // i turni dell'allievo col tutor: il `mode` lo scrive la SUA app, e il file è suo
        tutorState: { sidebar: { history: [
            { role: 'user', mode: IMG, parts: [{ text: 'perché la luce serve?' }] },
            { role: 'user', mode: SVG, parts: [{ text: 'e il pigmento?' }] },
            { role: 'user', mode: APICE, parts: [{ text: 'altro' }] },
            { role: 'user', mode: 'socratic', parts: [{ text: 'come funziona?' }] }
        ] } }
    };
    const g = {
        console: QUIETA, document: d.document, Promise,
        showToast() {}, safeCreateIcons() {},
        open: () => ({ document: { write: h => giri.finestre.push(h), close() {} } }),
        electronAPI: {
            pickFolder: async () => ({ folderPath: '/Classe 3A' }),
            listVaultSubfolders: async () => ({ folders: [{ path: '/Classe 3A/Gruppo 1' }] }),
            loadVault: async () => ({ success: true, data: vault }),
            readStudySessions: async () => ({ sessions: [], mastery: null })
        }
    };
    g.window = g; g.self = g;
    vm.createContext(g);
    vm.runInContext(JS('mappai-chat-analysis.js'), g);
    vm.runInContext(JS('mappai-meta-analysis.js'), g);
    return { ...d, g, giri };
}

test('meta-analisi: le modalità del tutor scritte dall\'allievo sono testo, nella dashboard e nel report', async () => {
    const t = metaAnalisi();
    // la strada vera: il modale, la cartella dei vault, la dashboard
    t.g.MappAIMetaAnalysis.openModal();
    await t.clic(t.wrap(t.$('#meta-go')[0]));
    const dash = t.$('#meta-dashboard');
    assert.equal(dash.length, 1, 'la dashboard si apre');
    await t.clic(t.wrap(dash.find('[data-nav="0"]')[0]));
    const riga = dash.find('#dash-content p').filter((_, p) => /^Per modalità:/.test(t.$(p).text()));
    assert.equal(riga.length, 1, 'la riga «Per modalità» c\'è');
    for (const m of [IMG, SVG, APICE]) assert.ok(riga.text().includes(m + ' (1 turni'), 'la modalità si legge com\'è scritta: ' + m);
    assert.match(riga.text(), /Socratico \(1 turni, ragionamento 0\)/, 'le modalità note hanno la loro etichetta');
    soloTemplate(t.$, dash, 'dashboard');
    // «Stampa / PDF»: lo stesso studente nel report, riletto come documento intero
    await t.clic(t.wrap(dash.find('#dash-print')[0]));
    assert.equal(t.giri.finestre.length, 1);
    const $r = cheerio.load(t.giri.finestre[0]);
    soloTemplate($r, $r('body'), 'report', ['window.print()']);
    assert.ok($r('body').text().includes(IMG + ' (1 turni'));
    assert.equal(t.giri.pwned, 0, 'nessun payload è scattato');
});

// ── 2. menu contestuale: autore e stato dei ponti JIGSAW (mappai-context-menu.js:~114) ──

function menuContestuale(nucleo, setAcceso = true) {
    const giri = { pwned: 0 };
    const d = dom('<div id="context-menu" class="hidden"></div>', giri);
    const g = {
        console: QUIETA, document: d.document, innerWidth: 1280, innerHeight: 800,
        appState: { db: { nodes: [], links: [] }, studentMode: false, extractionMode: 'kg' },
        // docente: modalità JIGSAW spenta → il menu di ratifica del ponte
        MappAIJigsaw: { isEnabled: () => false },
        // il set del lavoro a gruppi è parcheggiato di default (ADR 0007): qui si
        // prova il suo menu, quindi il set è acceso (salvo il test del parcheggio)
        MappAISetGruppi: { on: () => setAcceso },
        t: (k, f) => f, safeCreateIcons() {}, showToast() {}
    };
    g.window = g; g.self = g;
    vm.createContext(g);
    if (nucleo) vm.runInContext(JS('mappai-html-sicuro.js'), g);
    vm.runInContext(JS('mappai-context-menu.js'), g);
    return { ...d, g, giri };
}

for (const nucleo of [true, false]) {
    test('menu del ponte: autore, stato e motivazione scritti dall\'allievo sono testo; le quattro voci restano quelle' + (nucleo ? '' : ' (reader, senza nucleo)'), async () => {
        const t = menuContestuale(nucleo);
        const ponte = { source: 'a', target: 'b', rel: 'causa', isBridge: true,
            bridgeAuthor: IMG + 'Gruppo 2', bridgeStatus: SVG, justification: 'Perché ' + APICE + ' <b>sì</b> & basta' };
        t.g.showContextMenu({ preventDefault() {}, stopPropagation() {}, clientX: 20, clientY: 20 }, 'link', ponte);
        const menu = t.$('#context-menu');
        const voci = /^window\.ctxAction\('(ratify_bridge|reject_bridge|rename_link|delete_link)'\)$/;
        soloTemplate(t.$, menu, 'menu del ponte', [voci]);
        assert.equal(menu.find('b').length, 0, 'nemmeno la formattazione della motivazione diventa HTML');
        const righe = menu.find('div').toArray().map(e => t.$(e).text());
        assert.ok(righe.includes('Autore: ' + ponte.bridgeAuthor + ' · stato: ' + ponte.bridgeStatus), JSON.stringify(righe));
        assert.ok(righe.includes('"' + ponte.justification + '"'), 'la motivazione si legge com\'è scritta');
        // le voci, eseguite come al clic: chiedono le quattro azioni del ponte e nient'altro
        const azioni = [];
        menu.find('[onclick]').each((_, el) => esegui(el.attribs.onclick, { ctxAction: a => azioni.push(a), alert: () => { t.giri.pwned++; } }));
        assert.deepEqual(azioni, ['ratify_bridge', 'reject_bridge', 'rename_link', 'delete_link']);
        assert.equal(t.giri.pwned, 0, 'nessun payload è scattato');
    });
}

test('menu del ponte: col set del lavoro a gruppi parcheggiato (ADR 0007) il ponte ha il menu dei collegamenti normali', () => {
    const t = menuContestuale(true, false);
    const ponte = { source: 'a', target: 'b', rel: 'causa', isBridge: true, bridgeAuthor: 'Gruppo 2', bridgeStatus: 'proposed' };
    t.g.showContextMenu({ preventDefault() {}, stopPropagation() {}, clientX: 20, clientY: 20 }, 'link', ponte);
    const menu = t.$('#context-menu');
    assert.ok(!/Ponte inter-area/.test(menu.text()), 'nessun menu di ratifica');
    const azioni = [];
    menu.find('[onclick]').each((_, el) => { const m = /ctxAction\('([a-z_]+)'\)/.exec(el.attribs.onclick || ''); if (m) azioni.push(m[1]); });
    assert.ok(!azioni.includes('ratify_bridge') && !azioni.includes('reject_bridge'), 'niente Ratifica né Rifiuta: ' + azioni.join(','));
});

// ── 3. testo da un HTML che non è nostro: «Chatta e Scrivi» e stripHTML ──────
// mappai-tutor-teacher.js:~97 (stripHtmlLocal) e mappai-text-utils.js:~86 (stripHTML)

function magazzino(iniziale) {
    const m = new Map(Object.entries(iniziale || {}));
    return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, removeItem: k => { m.delete(k); } };
}

function tutorDocente(classe) {
    const giri = { pwned: 0, inerti: 0, avvii: [] };
    const d = dom('', giri);
    const g = {
        console: QUIETA, document: d.document, DOMParser: domParserInerte(giri),
        localStorage: magazzino(), setTimeout: () => 0, clearTimeout() {},
        appState: { rootNodeLabel: 'Fotosintesi', extractionMode: 'mindmap', aiProvider: 'google', db: { links: [], nodes: [
            { id: 'r', level: 0, group: 0, label: 'Fotosintesi' },
            // la desc viene dal vault, che si passa fra colleghi
            { id: 'n1', level: 1, group: 1, label: 'Luce', desc: 'La luce ' + IMG + ' eccita la clorofilla' },
            { id: 'n2', level: 2, group: 1, label: 'Clorofilla', desc: 'pigmento' }
        ] } },
        cleanLabel: s => String(s || ''), showToast() {}, safeCreateIcons() {}, t: (k, f) => f,
        aiProvidersAvailable: () => ['google'], aiProviderLabel: p => p, getProviderKey: () => 'chiave',
        MappAIClasses: { list: () => [classe], getActive: () => null },
        electronAPI: { tutorStartSession: async a => { giri.avvii.push(a); return { success: false, error: 'fine della prova' }; } }
    };
    g.window = g; g.self = g;
    vm.createContext(g);
    vm.runInContext(JS('mappai-html-sicuro.js'), g);
    vm.runInContext(JS('mappai-tutor-teacher.js'), g);
    return { ...d, g, giri };
}

test('Chatta e Scrivi: la desc del vault entra nel prompt come testo, letta in un documento inerte; l\'id della classe resta un dato', async () => {
    const classe = { id: 'c1" onmouseover="alert(4)', name: '3A ' + IMG, students: [{ emojiKey: 'gatto', num: 1, name: 'Ada' }] };
    const t = tutorDocente(classe);
    t.g.MappAITutor.openSetup();
    const modale = t.$('#tutorq-modal');
    assert.equal(modale.length, 1, 'il modale si apre');
    soloTemplate(t.$, modale, 'Chatta e Scrivi');
    assert.equal(modale.find('#tq-class option').attr('value'), classe.id, 'l\'id della classe esce intero dall\'attributo');
    await t.clic(t.wrap(modale.find('#tq-start')[0]));
    assert.equal(t.giri.avvii.length, 1, 'la sessione parte con la classe giusta (id ritrovato dal valore della tendina)');
    const si = t.giri.avvii[0].systemInstruction;
    assert.match(si, /\nCONTESTO: La luce {2}eccita la clorofilla\n/);
    assert.doesNotMatch(si, /<img|onerror/);
    assert.ok(t.giri.inerti > 0, 'la desc si legge nel documento di DOMParser');
    assert.equal(t.giri.pwned, 0, 'nessun payload è scattato');
});

function testoUtils() {
    const giri = { pwned: 0, inerti: 0 };
    const d = dom('', giri);
    const g = { console: QUIETA, document: d.document, DOMParser: domParserInerte(giri) };
    g.window = g; g.self = g;
    vm.createContext(g);
    vm.runInContext(fs.readFileSync(path.join(ROOT, 'public', 'js', 'mappai-text-utils.js'), 'utf8'), g);
    return { g, giri };
}

test('stripHTML: niente scatta, e restituisce lo stesso testo di prima (un <div>, non il body di un documento)', () => {
    const t = testoUtils();
    assert.equal(t.g.stripHTML('Prima ' + IMG + SVG + ' dopo'), 'Prima "> dopo');
    assert.equal(t.giri.pwned, 0, 'nessun payload è scattato');
    assert.ok(t.giri.inerti > 0, 'il testo si ricava nel documento di DOMParser');
    // lo stesso parsing a frammento del <div> di prima: spazi in testa, <title> e <style> restano
    const casi = [
        ['  <b>Ciao</b> mondo', '  Ciao mondo'],
        ['<title>T</title><style>a{}</style>corpo', 'Ta{}corpo'],
        ['A &amp; B &lt;tag&gt;<br>fine', 'A & B <tag>fine'],
        ['<p>uno</p>\n<ul><li>due</li></ul>', 'uno\ndue'],
        ['', ''], [null, ''], [undefined, 'undefined'], [42, '42']
    ];
    for (const [dato, atteso] of casi) assert.equal(t.g.stripHTML(dato), atteso, JSON.stringify(dato));
    assert.equal(t.g.MappAITextUtils.stripHTML, t.g.stripHTML);
});

// ── 5. «Revisione mappa»: id ed etichette nel pannello (mappai-correction-mode.js:~86-88) ──

function revisioneMappa(nucleo) {
    const giri = { pwned: 0, scritti: [] };
    const d = dom('', giri);
    const st = { rootNodeLabel: 'Fotosintesi', activeVaultPath: '/vault', extractionMode: 'mindmap', db: {
        nodes: [
            { id: 'r', level: 0, group: 0, label: 'Fotosintesi' },
            { id: 'a', level: 1, group: 1, label: 'Luce' },
            { id: 'b', level: 2, group: 1, label: 'Clorofilla &amp; co' },
            { id: 'c', level: 2, group: 1, label: 'Sali &amp; minerali' }
        ],
        links: [{ source: 'r', target: 'a', rel: 'include' }, { source: 'a', target: 'b', rel: 'include' }, { source: 'a', target: 'c', rel: 'include' }]
    } };
    const g = {
        console: QUIETA, document: d.document, appState: st, t: (k, f) => f, showToast() {}, safeCreateIcons() {},
        electronAPI: { saveVaultFile: a => { giri.scritti.push(a); return Promise.resolve({ ok: true }); } }
    };
    g.window = g; g.self = g;
    vm.createContext(g);
    if (nucleo) vm.runInContext(JS('mappai-html-sicuro.js'), g);
    vm.runInContext(JS('mappai-correction-core.js'), g);
    vm.runInContext(JS('mappai-correction-mode.js'), g);
    return { ...d, g, st, giri };
}

for (const nucleo of [true, false]) {
    test('Revisione mappa: id ed etichette dei nodi sono testo nel pannello, e la nota torna intera dal campo' + (nucleo ? '' : ' (senza nucleo)'), async () => {
        const t = revisioneMappa(nucleo);
        assert.ok(t.g.MappAICorrection.start());
        // le correzioni fatte sulla mappa di un vault ricevuto
        const db = t.st.db;
        db.nodes[1].label = IMG + 'Luce';                                                   // rename
        db.links[1].rel = 'causa';                                                         // retype-rel (nota = etichette)
        db.nodes.push({ id: SVG, level: 2, group: 1, label: 'Nuovo' });                    // add-node (id ostile)
        db.links.push({ source: 'a', target: SVG, rel: 'include' });
        db.links.push({ source: 'r', target: 'c', rel: 'causa', isCross: true });          // add-rel
        t.g.MappAICorrection.review();
        const modale = t.$('#correction-modal');
        assert.equal(modale.length, 1, 'il pannello si apre');
        soloTemplate(t.$, modale, 'revisione mappa');
        const celle = modale.find('tbody tr').toArray().map(tr => t.$(tr).find('td').eq(1).text());
        const nota = IMG + 'Luce → Clorofilla &amp; co';
        for (const atteso of ['a', 'a→b · ' + nota, SVG, 'r→c · Fotosintesi → Sali &amp; minerali']) {
            assert.ok(celle.includes(atteso), 'si legge «' + atteso + '» in ' + JSON.stringify(celle));
        }
        const campi = modale.find('input.cr-note').toArray().map(i => t.$(i).val());
        assert.ok(campi.includes(nota), 'la nota nel campo è quella vera: ' + JSON.stringify(campi));
        // «Salva log nel vault»: le note si rileggono DAI CAMPI e finiscono in correzioni.json
        await t.clic(t.wrap(modale.find('#cr-save')[0]));
        assert.equal(t.giri.scritti.length, 1);
        const log = JSON.parse(t.giri.scritti[0].text);
        assert.equal(log.ops.find(o => o.op === 'retype-rel').note, nota, 'la nota non si corrompe passando dall\'attributo');
        assert.equal(t.giri.pwned, 0, 'nessun payload è scattato');
    });
}

// ── 6. la pagina del file per l'allievo: il parametro `f` dell'URL (public/live/file.html:~103) ──

function paginaFile(nomeFile, testoDelFile) {
    const giri = { pwned: 0, richieste: [] };
    const $p = cheerio.load(fs.readFileSync(path.join(ROOT, 'public', 'live', 'file.html'), 'utf8'));
    const codice = $p('body script').last().html();
    $p('body script').remove();
    const d = dom($p('body').html(), giri);
    const g = {
        console: QUIETA, document: d.document, URLSearchParams,
        location: { search: '?s=' + encodeURIComponent('tok-123') + '&f=' + encodeURIComponent(nomeFile) },
        fetch: url => {
            giri.richieste.push(url);
            return Promise.resolve({ json: async () => ({ files: [] }), text: async () => testoDelFile || '' });
        }
    };
    g.window = g; g.self = g;
    vm.createContext(g);
    vm.runInContext(codice, g);
    return { ...d, g, giri };
}

test('pagina del file: il nome che arriva dall\'URL resta nell\'attributo `alt` e nel titolo, come testo', async () => {
    for (const nome of ['x" onerror="alert(1)" y=".png', "a' onerror='alert(2)' b='.jpg", 'foto <b>1</b> & co.png']) {
        const t = paginaFile(nome);
        const img = t.$('#preview img');
        assert.equal(img.length, 1, 'l\'anteprima dell\'immagine c\'è');
        assert.deepEqual(Object.keys(img[0].attribs).sort(), ['alt', 'src'], 'solo i due attributi del template: ' + JSON.stringify(img[0].attribs));
        assert.equal(img.attr('alt'), nome);
        assert.equal(img.attr('src'), '/files/' + encodeURIComponent(nome) + '?s=tok-123&inline=1');
        assert.equal(t.$('#title').text(), nome);
        assert.equal(t.$('#save').attr('download'), nome);
        assert.equal(t.giri.pwned, 0, 'nessun payload è scattato: ' + nome);
    }
    // un file di testo: il contenuto si legge com'è, nel <pre>
    const testo = 'riga 1 ' + IMG + SVG + ' & fine';
    const t = paginaFile('appunti "x".txt', testo);
    await new Promise(r => setImmediate(r));
    await new Promise(r => setImmediate(r));
    assert.equal(t.$('#preview pre').text(), testo);
    assert.equal(t.$('#preview img, #preview svg').length, 0);
    assert.equal(t.giri.pwned, 0);
});
