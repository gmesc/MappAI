'use strict';
/*
 * I materiali di studio e i pannelli che li elencano, VERI (i moduli girano in una
 * vm), davanti a un vault ricevuto da un collega, a un set di `Materiale Studio`
 * passato di mano e a un modello che scrive le domande (25/9/2026).
 *
 * Il DOM è una facciata sottile sopra cheerio (parse5, lo stesso algoritmo di
 * parsing del browser). Le finestre di stampa — `window.open('')` + `document.write`,
 * stessa origine della finestra principale — si catturano e si rileggono con
 * cheerio come documento intero, così un `</style>` o un `</title>` nei dati fa
 * quello che farebbe nel browser. Qui non si prova che un `onerror` NON scatti
 * (cheerio non esegue niente) ma che nell'albero non esista alcun elemento o
 * attributo nato dai dati; i gestori in linea del template, invece, si ESEGUONO
 * in una vm, per vedere che cosa ricevono e che nient'altro giri.
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
const cl = TextUtils.cleanLabel;

// ── gli attrezzi ─────────────────────────────────────────────────────────────

function dom(corpo) {
    const $ = cheerio.load('<html><head></head><body>' + corpo + '</body></html>');
    const cache = new WeakMap();
    function wrap(n) {
        if (!n) return null;
        if (cache.has(n)) return cache.get(n);
        const e = {
            node: n, style: { setProperty() {}, removeProperty() {} }, isConnected: true,
            classList: {
                add: (...c) => { $(n).addClass(c.join(' ')); },
                remove: (...c) => { c.forEach(x => $(n).removeClass(x)); },
                toggle: (c, si) => { $(n).toggleClass(c, si); return $(n).hasClass(c); },
                contains: c => $(n).hasClass(c)
            },
            get innerHTML() { return $(n).html(); }, set innerHTML(v) { $(n).html(String(v)); },
            get textContent() { return $(n).text(); }, set textContent(v) { $(n).text(String(v)); },
            get innerText() { return $(n).text(); }, set innerText(v) { $(n).text(String(v)); },
            get value() { return $(n).val() || ''; }, set value(v) { $(n).val(v); },
            get checked() { return $(n).is(':checked'); },
            set checked(v) { if (v) $(n).attr('checked', ''); else $(n).removeAttr('checked'); },
            get className() { return $(n).attr('class') || ''; }, set className(v) { $(n).attr('class', v); },
            get id() { return $(n).attr('id') || ''; }, set id(v) { $(n).attr('id', v); },
            dataset: new Proxy({}, { get: (_, k) => $(n).attr('data-' + String(k).replace(/[A-Z]/g, m => '-' + m.toLowerCase())) }),
            getAttribute: k => { const v = $(n).attr(k); return v === undefined ? null : v; },
            setAttribute: (k, v) => { $(n).attr(k, String(v)); },
            closest: s => wrap($(n).closest(s)[0]),
            querySelector: s => wrap($(n).find(s)[0]),
            querySelectorAll: s => $(n).find(s).toArray().map(wrap),
            appendChild: c => { $(n).append(c.node); return c; },
            remove: () => { $(n).remove(); },
            addEventListener() {}, removeEventListener() {}, focus() {}, scrollIntoView() {}
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
        addEventListener() {}, removeEventListener() {}
    };
    return { $, wrap, document };
}

function magazzino(iniziale) {
    const m = new Map(Object.entries(iniziale || {}));
    return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, removeItem: k => { m.delete(k); } };
}

/* La finestra di stampa: ciò che il modulo le scrive con document.write. */
function finestre(giri) {
    return () => ({ document: { write: h => giri.finestre.push(h), close() {} }, focus() {}, print() {}, close() {} });
}

/* Nessun elemento attivo e nessun gestore `on…` che non sia del template; nessun
   `style` o link che porti un `url(`/`javascript:`. `script` = quanti <script> il
   template stesso scrive (la timeline ne ha uno suo). */
const ATTIVI = 'script, iframe, object, embed, svg, math, a, form, img, mark, video, audio, base, link';
function soloTemplate($, radice, etichetta, gestori = [], script = 0) {
    const attivi = $(radice).find(ATTIVI).toArray();
    const nostri = attivi.filter(e => e.tagName === 'script').length;
    assert.equal(nostri, script, etichetta + ': <script> in più o in meno');
    const altri = attivi.filter(e => e.tagName !== 'script');
    assert.equal(altri.length, 0, etichetta + ': elemento nato dai dati: ' + altri.map(e => $.html(e)).join(' '));
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

/* Un gestore in linea eseguito come lo esegue il browser: il testo dell'attributo,
   già decodificato dal parser HTML, diventa il corpo di una funzione. Un attributo
   spezzato dai dati dà un errore di sintassi, e la prova cade lì. */
function esegui(codice, globali) {
    const ctx = vm.createContext(Object.assign({}, globali));
    ctx.window = ctx;
    vm.runInContext('(function (event) {\n' + codice + '\n})', ctx).call({}, {});
}

const testi = ($, sel) => $(sel).toArray().map(e => $(e).text());

// ── 1. il quiz: correzione, riepilogo, storico (mappai-study-session.js) ─────

function sessione(opts = {}) {
    const d = dom(`
        <div id="study-quiz-feedback" class="hidden"><div id="study-quiz-feedback-title"></div><p id="study-quiz-feedback-desc"></p></div>
        <div id="study-quiz-options"></div>
        <div id="study-quiz-open" class="flex"><textarea id="study-quiz-textarea"></textarea></div>
        <div id="study-scores-container"></div>
        <div id="study-flashcard-view"></div><div id="study-quiz-view"></div><div id="study-summary-view" class="hidden"></div>
        <div id="study-summary-stats"></div><div id="study-summary-time"></div><div id="study-summary-mistakes"></div>`);
    const g = {
        console: QUIETA, document: d.document, localStorage: opts.magazzino || magazzino(),
        setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, clearInterval() {}, confirm: () => false,
        appState: { db: { nodes: [], links: [], studySets: [] }, userProfile: {} },
        t: (k, f) => f, showToast() {}, safeCreateIcons() {}
    };
    g.window = g; g.self = g;
    vm.createContext(g);
    if (opts.nucleo !== false) vm.runInContext(JS('mappai-html-sicuro.js'), g);
    vm.runInContext(JS('mappai-study-session.js'), g);
    return { ...d, g };
}

const DOMANDA_OSTILE = {
    q: 'Che cosa fa la clorofilla?', options: ['Assorbe la luce', 'Respira'],
    correct: '<img src=x onerror="window.__pwned=1">Assorbe la luce',
    explanation: 'Perché </p><script>window.__pwned=2</script> cattura i fotoni & l\'acqua; $x<y$ resta testo'
};

for (const nucleo of [true, false]) {
    const chi = nucleo ? '' : ' (reader, senza nucleo)';

    test('quiz: la correzione di una risposta mostra risposta e spiegazione del modello come testo' + chi, () => {
        const s = sessione({ nucleo });
        s.g.studyResults = { correct: 0, total: 1, mistakes: [], openAnswers: [] };
        s.g.checkQuizAnswer('Respira', DOMANDA_OSTILE);
        const fb = s.$('#study-quiz-feedback-desc');
        soloTemplate(s.$, fb, 'correzione');
        assert.equal(fb.find('strong').length, 2, 'le etichette in grassetto del template restano');
        assert.equal(fb.find('br').length, 2);
        assert.equal(fb.text(), 'Risposta corretta: ' + DOMANDA_OSTILE.correct + 'Spiegazione: ' + DOMANDA_OSTILE.explanation);
    });

    test('quiz: la risposta aperta mostra la risposta di riferimento come testo' + chi, () => {
        const s = sessione({ nucleo });
        s.g.studyResults = { correct: 0, total: 1, mistakes: [], openAnswers: [] };
        s.g.activeStudySessionItems = [Object.assign({}, DOMANDA_OSTILE, { options: [] })];
        s.g.currentStudyItemIndex = 0;
        s.g.checkOpenAnswer();
        const fb = s.$('#study-quiz-feedback-desc');
        soloTemplate(s.$, fb, 'risposta aperta');
        assert.equal(fb.text(), 'Risposta di riferimento: ' + DOMANDA_OSTILE.correct + 'Spiegazione: ' + DOMANDA_OSTILE.explanation);
    });

    test('quiz: riepilogo degli errori e storico dei punteggi restano testo, anche al riavvio' + chi, () => {
        const titolo = '"><img src=x onerror="window.__pwned=3">Nodo: Clima';
        const disco = magazzino();
        const s = sessione({ nucleo, magazzino: disco });
        s.g.activeStudySetTitle = titolo;
        s.g.studySeconds = 0;
        s.g.studyResults = { mode: 'quiz', type: '<b onclick="window.__pwned=4">Quiz</b>', correct: 0, total: 1, openAnswers: [],
            mistakes: [{ q: '<svg onload="window.__pwned=5">Domanda', correctAnswer: DOMANDA_OSTILE.correct, explanation: DOMANDA_OSTILE.explanation }] };
        s.g.showStudySummary();
        const errori = s.$('#study-summary-mistakes');
        soloTemplate(s.$, errori, 'riepilogo');
        assert.deepEqual(errori.find('p').toArray().map(p => s.$(p).text()),
            ['<svg onload="window.__pwned=5">Domanda', 'Risposta Corretta: ' + DOMANDA_OSTILE.correct, DOMANDA_OSTILE.explanation]);
        // lo storico, subito e dopo un riavvio (app.js lo ridisegna all'avvio dal localStorage)
        const riavvio = sessione({ nucleo, magazzino: disco });
        riavvio.g.updateStudyScoresDisplay();
        for (const [x, quando] of [[s, 'subito'], [riavvio, 'al riavvio']]) {
            const storico = x.$('#study-scores-container');
            soloTemplate(x.$, storico, 'storico ' + quando, ['window.clearStudyScores()']);
            const riga = storico.find('.font-bold.text-slate-800');
            assert.equal(riga.attr('title'), titolo, quando);
            assert.equal(riga.text(), titolo, quando);
            assert.ok(storico.text().includes('<b onclick="window.__pwned=4">Quiz</b>'), quando);
        }
    });
}

// ── 2. il dossier e il foglio dei nodi (mappai-print-dossier.js) ─────────────

const MARK_VECCHIA = '<mark class="bg-black text-white px-1 rounded font-bold">';

function statoOstile() {
    const root = { id: 'root', level: 0, group: 0, label: 'Radice</style><img src=x onerror="window.__pwned=1">', desc: 'La radice' };
    const l1 = { id: 'l1', level: 1, group: 1, label: '<img src=x onerror="window.__pwned=2">Clima',
        desc: 'La luce </p><script>window.__pwned=3</script> & l\'acqua; $x<y$ resta formula' };
    const l2 = { id: 'l2', level: 2, group: 1, label: 'Fotosintesi"><svg onload="window.__pwned=4">',
        desc: 'Foglie <iframe src="javascript:window.__pwned=5"></iframe> verdi' };
    const nome = 'Mappa</title><img src=x onerror="window.__pwned=0">';
    return {
        extractionMode: 'mindmap', rootNodeLabel: nome,
        db: {
            rootNodeLabel: nome, nodes: [root, l1, l2],
            links: [
                { source: 'root', target: 'l1', rel: 'include' },
                { source: 'l1', target: 'l2', rel: '<b onmouseover="window.__pwned=6">causa</b>' },
                { source: 'l2', target: 'root', rel: '<img src=x onerror="window.__pwned=10">' }
            ],
            sourcesDict: { l2: [
                { title: 'T', source: '<i onclick="window.__pwned=7">fonte</i>', text: 'Il sole <img src=x onerror="window.__pwned=8"> scalda', nodeId: 'l2' },
                { title: 'T2', source: 'S', text: 'Il ' + MARK_VECCHIA + 'sole</mark> di sera', nodeId: 'l2' }
            ] },
            // un colore di macro-area che non ha bisogno di `<` per uscire dal suo `style`
            customColors: { 1: 'red;background:url(javascript:window.__pwned=9)' }
        }
    };
}

function dossier(opts = {}) {
    const d = dom('<select id="print-mm-node-select"></select><select id="print-kg-node-select"></select>' +
        '<input type="radio" name="print-mm-scope" value="single"><input type="radio" name="print-mm-scope" value="branch">' +
        '<input type="radio" name="print-kg-scope" value="single"><input type="radio" name="print-kg-scope" value="branch">' +
        '<input type="checkbox" id="print-mm-ascii-diagram" checked><input type="checkbox" id="print-kg-relations" checked>' +
        '<input type="radio" name="print-font-scale" value="1" checked>');
    const st = statoOstile();
    if (opts.kg) st.extractionMode = 'kg';
    const m = opts.kg ? 'kg' : 'mm';
    d.$('#print-' + m + '-node-select').append(d.$('<option selected></option>').attr('value', opts.scelta || 'all'));
    if (opts.ambito) d.$('input[name="print-' + m + '-scope"][value="' + opts.ambito + '"]').attr('checked', '');
    const giri = { finestre: [], toast: [] };
    const g = {
        console: QUIETA, URL, document: d.document, appState: st, localStorage: magazzino(),
        setTimeout: () => 0, clearTimeout() {},
        cleanLabel: cl, colorScale: { 0: '#0f172a', 1: '#ef4444', 2: '#f59e0b', 3: '#10b981' },
        // nell'app arriva da mappai-timeline.js: la `_fontDoc` di questo file sta DENTRO printAllNodeLabels
        _fontDoc: () => '',
        t: (k, f) => f, showToast: (...a) => giri.toast.push(a), safeCreateIcons() {},
        /* `loadMappaiIconBase64` NON c'è, come nell'app: se n'è andata con FISSA
           (8510e1a, 16/8/2026) e fino al 25/9 «Stampa dossier» si fermava con un
           ReferenceError. Senza stub, queste prove dimostrano che ora si compone. */
        getInheritedDatabase: id => {
            const ids = [id], visti = new Set(ids);
            for (let i = 0; i < ids.length; i++) {
                st.db.links.forEach(l => { if (l.source === ids[i] && !visti.has(l.target)) { visti.add(l.target); ids.push(l.target); } });
            }
            return [].concat(...ids.map(x => st.db.sourcesDict[x] || []));
        },
        open: finestre(giri)
    };
    g.window = g; g.self = g;
    vm.createContext(g);
    if (opts.nucleo !== false) {
        vm.runInContext(JS('mappai-html-sicuro.js'), g);
        vm.runInContext(JS('mappai-docedit-core.js'), g);
    }
    vm.runInContext(JS('mappai-doc-head.js'), g);
    vm.runInContext(JS('mappai-study-export-core.js'), g);
    vm.runInContext(JS('mappai-print-dossier.js'), g);
    return { ...d, g, st, giri };
}

async function stampaDossier(opts) {
    const d = dossier(opts);
    await d.g.generateDossierPDFFromOptions();
    assert.deepEqual(d.giri.toast.filter(t => t[1] === 'error'), [], 'il dossier si compone senza errori');
    assert.equal(d.giri.finestre.length, 1, 'una finestra di stampa');
    return { ...d, $d: cheerio.load(d.giri.finestre[0]) };
}

for (const nucleo of [true, false]) {
    const chi = nucleo ? '' : ' (reader, senza nucleo)';

    test('dossier, tutta la mappa: etichette, desc, verbi, fonti e colori del vault restano testo e dati' + chi, async () => {
        const { $d, st } = await stampaDossier({ nucleo });
        const [root, l1, l2] = st.db.nodes;
        soloTemplate($d, $d.root(), 'dossier', ['window.print()']);
        // <title> e piè stampato: il nome non chiude né il titolo né il foglio di stile
        // col «Tutta la mappa» il radio dell'ambito resta sul suo default («ramo»): il dettaglio è la radice
        assert.equal($d('title').text(), 'Dossier-' + st.db.rootNodeLabel + '-' + cl(root.label));
        // il «<» del nome resta «<» a schermo: nel CSS è l'escape `\3c `, e il foglio non si chiude
        assert.ok($d('style').text().includes('Radice\\3c /style>'), 'nel piè stampato il «<» è un escape CSS');
        assert.ok($d('.mm-dh__s').text().includes(cl(root.label)), 'la testata della cornice');
        const titoli = testi($d, '.dossier-title');
        for (const t of [cl(l1.label), cl(l2.label), 'Fonti e Note: ' + cl(l1.label)]) assert.ok(titoli.includes(t), t);
        const desc = testi($d, '.dossier-desc');
        for (const t of [cl(l1.desc), cl(l2.desc)]) assert.ok(desc.includes(t), t);
        assert.ok($d('.ascii-tree').text().includes('[' + st.db.links[1].rel + '] ──> ' + cl(l2.label)));
        assert.ok($d('.dossier-tag').text().includes(cl(root.label)));
        assert.ok($d('.dossier-rel-hint').text().includes('HUB+' + cl(l1.label)));
        assert.ok(testi($d, '.node-group-label').includes(cl(l2.label)));
        const note = testi($d, '.citation-text');
        assert.ok(note.includes('“' + st.db.sourcesDict.l2[0].text + '”'));
        if (nucleo) assert.ok(note.includes('“Il sole di sera”'), 'la <mark> vecchia se ne va dalla stampa');
        assert.ok(testi($d, '.citation-source').includes('<i onclick="window.__pwned=7">fonte</i>'));
        assert.deepEqual(testi($d, '.citation-origin'), [cl(l2.label), cl(l2.label)], 'il nodo d\'origine, nell\'aggregato');
        // la macro-area col colore ostile torna al colore di riserva; le altre restano le loro
        assert.match($d('.dossier-card-header').eq(1).attr('style'), /^background:#6366f1;color:white;$/);
        assert.match($d('.dossier-card-header').eq(0).attr('style'), /^background:#0f172a;/);
    });

    test('dossier, un nodo in KG con le relazioni: verbi ed etichette dei collegamenti sono testo' + chi, async () => {
        const { $d, st } = await stampaDossier({ nucleo, kg: true, scelta: 'l2', ambito: 'single' });
        const [root, l1, l2] = st.db.nodes;
        soloTemplate($d, $d.root(), 'dossier KG', ['window.print()']);
        assert.deepEqual(testi($d, '.rel-word'), ['[' + st.db.links[2].rel + ']', '[' + st.db.links[1].rel + ']']);
        assert.deepEqual(testi($d, '.rel-target'), ['[' + cl(root.label) + ']', '[' + cl(l1.label) + ']']);
        assert.equal($d('.dossier-title').first().text(), cl(l2.label));
        assert.equal($d('.dossier-desc').first().text(), cl(l2.desc));
    });

    test('dossier, un ramo: albero, schede e citazioni del ramo restano testo' + chi, async () => {
        const { $d, st } = await stampaDossier({ nucleo, scelta: 'l1', ambito: 'branch' });
        const l1 = st.db.nodes[1];
        soloTemplate($d, $d.root(), 'dossier ramo', ['window.print()']);
        assert.ok($d('.dossier-tag').text().includes(cl(l1.label) + ' · Diagramma ASCII'));
        assert.ok($d('.dossier-tag').text().includes('Tutte le citazioni del ramo · ' + cl(l1.label)));
        assert.equal($d('.citation-row').length, 4, 'due per nodo, due nell\'aggregato');
    });
}

test('foglio dei nodi: il nome della mappa nel modale è testo', () => {
    const d = dossier();
    d.g.openNodeLabelsPrintModal();
    const modale = d.$('#node-labels-print-modal');
    soloTemplate(d.$, modale, 'foglio dei nodi', [
        "document.getElementById('node-labels-print-modal').remove()", 'window._nlSyncContentLock()', 'window.printAllNodeLabels()']);
    assert.equal(modale.find('.pm-subtitle').text(), d.st.db.rootNodeLabel);
});

// ── 3. la timeline (mappai-timeline.js) ──────────────────────────────────────

function timeline(opts = {}) {
    const d = dom('');
    const giri = { finestre: [], toast: [] };
    const st = { rootNodeLabel: opts.nome, db: { nodes: [{ id: 'r', level: 0, label: 'R', desc: 'Nel 1945 finì' }], links: [], sourcesDict: {},
        timelineEvents: opts.manuali || [] } };
    const g = {
        console: QUIETA, document: d.document, appState: st, setTimeout: () => 0,
        cleanLabel: cl, t: (k, f) => f, showToast: (...a) => giri.toast.push(a), safeCreateIcons() {},
        open: finestre(giri)
    };
    g.window = g; g.self = g;
    vm.createContext(g);
    if (opts.nucleo !== false) {
        vm.runInContext(JS('mappai-html-sicuro.js'), g);
        vm.runInContext(JS('mappai-docedit-core.js'), g);
    }
    vm.runInContext(JS('mappai-doc-head.js'), g);
    vm.runInContext(JS('mappai-timeline-core.js'), g);
    vm.runInContext(JS('mappai-timeline.js'), g);
    return { ...d, g, st, giri };
}

const NOME_OSTILE = 'Guerra</style><img src=x onerror="window.__pwned=0">';
/* date manuali dal vault: l'id finiva in onclick="TL_del('…')" */
const MANUALI = [
    { id: "tlm_1'),alert(1),('", anno: 1945, evento: '<img src=x onerror="window.__pwned=1">Fine della guerra', macroArea: 'Politica', contesto: 'x', origin: 'manual' },
    { id: 'tlm_2" onmouseover="alert(2)', anno: 1946, evento: 'Repubblica', macroArea: 'Politica', origin: 'manual' },
    { id: 'tlm_3&#39;),alert(3),(&#39;', anno: 1947, evento: 'Piano', macroArea: 'Economia', origin: 'student' }
];
const TL_TEMPLATE = ['TL_toggleForm()', 'TL_refresh()', 'TL_live()', 'window.print()', 'window.close()', 'TL_add()', /^TL_del\(/];

test('timeline: il modale «Crea Timeline» mostra il nome della mappa come testo', () => {
    const t = timeline({ nome: NOME_OSTILE });
    t.g.openTimelineGeneratorModal();
    const modale = t.$('#timeline-generator-modal');
    soloTemplate(t.$, modale, 'modale timeline', [
        "document.getElementById('timeline-generator-modal').remove()", 'window.generateTimelineWithAI()']);
    assert.equal(modale.find('.pm-subtitle').text(), cl(NOME_OSTILE));
});

for (const nucleo of [true, false]) {
    test('timeline: nome, eventi, id e colori non escono dal documento; «Rimuovi» riceve l\'id intero' + (nucleo ? '' : ' (reader, senza nucleo)'), () => {
        const t = timeline({ nome: NOME_OSTILE, manuali: MANUALI, nucleo });
        const base = [{ year: 1939, raw: '1939', type: 'year', sortKey: 19390000, nodeLabel: 'Inizio <b>guerra</b>', nodeLevel: 1,
            macroLabel: '<i>Militare</i>', macroColor: 'red;background:url(javascript:window.__pwned=9)',
            chunkText: 'Nel 1939 <img src=x onerror="window.__pwned=8"> iniziò', chunkSource: 'Fonte', chunkTitle: 'T', chunkIdx: 0 }];
        t.g._renderTimeline(base, NOME_OSTILE, { showContext: true });
        const $t = cheerio.load(t.giri.finestre[0]);
        soloTemplate($t, $t.root(), 'timeline', TL_TEMPLATE, 1);
        assert.equal($t('title').text(), 'Timeline — ' + NOME_OSTILE);
        assert.ok($t('style').text().includes('Guerra\\3c /style>'), 'nel piè stampato il «<» è un escape CSS');
        assert.deepEqual(testi($t, '.dossier-title'), ['Inizio <b>guerra</b>', MANUALI[0].evento, 'Repubblica', 'Piano']);
        assert.equal($t('.tl-context-text').first().text(), '“Nel 1939 <img src=x onerror="window.__pwned=8"> iniziò”');
        // il colore ostile torna quello di riserva, le categorie restano le loro
        assert.deepEqual($t('.dossier-card-header').toArray().map(e => e.attribs.style.split(';')[0]),
            ['background:#6366f1', 'background:#4f46e5', 'background:#4f46e5', 'background:#059669']);
        // i bottoni «Rimuovi»: eseguiti davvero, passano l'id e nient'altro
        const rimossi = [];
        let pwned = 0;
        $t('button[onclick^="TL_del"]').each((_, b) => esegui(b.attribs.onclick, { TL_del: id => rimossi.push(id), alert: () => { pwned++; } }));
        assert.deepEqual(rimossi, MANUALI.map(m => m.id));
        assert.equal(pwned, 0);
    });
}

// ── 4. «Documenti salvati» (mappai-menu-hubs.js) ─────────────────────────────

for (const nucleo of [true, false]) {
    test('documenti salvati: titolo, classe e id di un documento restano testo e dato; «Riapri» apre quello giusto' + (nucleo ? '' : ' (senza nucleo)'), () => {
        const doc = { id: 'doc_1" onmouseover="window.__pwned=1', kind: 'dossier', title: '<img src=x onerror="window.__pwned=2">Dossier Nodo — Clima',
            mapName: 'Mappa', cls: '<svg onload="window.__pwned=3">2A', disc: '', date: Date.UTC(2026, 8, 25), html: '<!DOCTYPE html><p>il documento</p>' };
        const d = dom('');
        const giri = { finestre: [] };
        const g = {
            console: QUIETA, document: d.document, localStorage: magazzino({ mappai_saved_documents: JSON.stringify([doc]) }),
            setTimeout: () => 0, clearTimeout() {}, addEventListener() {},
            t: (k, f) => f, showToast() {}, safeCreateIcons() {}, open: finestre(giri)
        };
        g.window = g; g.self = g;
        vm.createContext(g);
        if (nucleo) vm.runInContext(JS('mappai-html-sicuro.js'), g);
        vm.runInContext(JS('mappai-study-export-core.js'), g);
        vm.runInContext(JS('mappai-menu-hubs.js'), g);
        g.openSavedDocsModal();
        const hub = d.$('[data-hub="saved-docs"]');
        soloTemplate(d.$, hub, 'documenti salvati');
        assert.equal(hub.find('span[title]').attr('title'), doc.title);
        assert.equal(hub.find('span[title]').text(), doc.title);
        assert.ok(hub.text().includes(doc.cls));
        assert.deepEqual(hub.find('[data-id]').toArray().map(b => b.attribs['data-id']), [doc.id, doc.id, doc.id]);
        d.wrap(hub.find('.sd-open')[0]).onclick();
        assert.deepEqual(giri.finestre, [doc.html], 'riaperto il documento con quell\'id');
    });
}

// ── 5. i suggerimenti strutturali (mappai-suggestions-panel.js) ──────────────

test('suggerimenti strutturali: gli id dei nodi arrivano ai clic interi, e nient\'altro gira', async () => {
    const ID = { a: "n1'),alert(1),('", b: 'n2" onmouseover="alert(2)', c: 'n3&#39;),alert(3),(&#39;', e: "n4\\');alert(4);//" };
    const d = dom('<div id="structural-suggestions-block" class="hidden"></div><div id="structural-suggestions-list"></div><div id="structural-suggestions-status"></div>');
    const g = {
        console: QUIETA, document: d.document, localStorage: magazzino(), cleanLabel: cl, showToast() {}, safeCreateIcons() {},
        MappAIStructureAnalyzer: {
            SUGGESTION_TYPES: { DUPLICATE_ENTITY: 'duplicate-entity' },
            analyzeCurrentMap: () => ({ suggestions: [{ type: 'god-node', nodeId: ID.a, severity: 'high', message: 'Troppi figli <img src=x onerror=alert(5)>' }], stats: { nodes: 4 } })
        },
        MappAIEntityBackbone: { analyzeCurrentMap: async () => ({ clusters: [{ size: 3, spread: 3, members: [
            { id: ID.b, label: 'Uno', branch: 'R1' }, { id: ID.c, label: 'Due', branch: 'R2' }, { id: ID.e, label: 'Tre', branch: 'R3' }] }] }) },
        fetchEmbeddings() {}
    };
    g.window = g; g.self = g;
    vm.createContext(g);
    vm.runInContext(JS('mappai-suggestions-panel.js'), g);
    await g.renderStructuralSuggestions({ withEmbeddings: true });
    const lista = d.$('#structural-suggestions-list');
    soloTemplate(d.$, lista, 'suggerimenti', [/^window\.executeSidebarSingleClick\(/, /^window\.MappAISuggestionsPanel\.mergeClusterMember\(/]);
    const chiamate = [];
    let pwned = 0;
    const globali = {
        executeSidebarSingleClick: id => chiamate.push(['vai', id]),
        MappAISuggestionsPanel: { mergeClusterMember: (a, b) => chiamate.push(['fondi', a, b]) },
        alert: () => { pwned++; }
    };
    lista.find('button[onclick]').each((_, b) => esegui(b.attribs.onclick, globali));
    assert.equal(pwned, 0);
    assert.deepEqual(chiamate, [
        ['vai', ID.b],
        ['vai', ID.c], ['fondi', ID.c, ID.b],
        ['vai', ID.e], ['fondi', ID.e, ID.b],
        ['vai', ID.a]
    ]);
});

// ── 6. «Cosa studiare ora» (mappai-study-path.js) ────────────────────────────

for (const nucleo of [true, false]) {
    test('cosa studiare ora: l\'id e l\'etichetta del nodo restano dato e testo; il clic porta al nodo giusto' + (nucleo ? '' : ' (reader, senza nucleo)'), () => {
        const nodo = { id: 'x" onmouseover="window.__pwned=1', level: 1, label: '<img src=x onerror="window.__pwned=2">Nodo & co.' };
        const d = dom('');
        const fuoco = [];
        const g = {
            console: QUIETA, document: d.document, cleanLabel: cl, showToast() {}, safeCreateIcons() {},
            appState: { db: { nodes: [{ id: 'root', level: 0, label: 'Radice' }, nodo], links: [] } },
            simulateNodeClick: n => fuoco.push(n.id)
        };
        g.window = g; g.self = g;
        vm.createContext(g);
        if (nucleo) vm.runInContext(JS('mappai-html-sicuro.js'), g);
        vm.runInContext(JS('mappai-study-path.js'), g);
        g.MappAIStudyPath.open();
        const modale = d.$('#sp-modal');
        soloTemplate(d.$, modale, 'cosa studiare ora');
        const voce = modale.find('.sp-item');
        assert.equal(voce.length, 1, 'il nodo senza prerequisito è fra i «Pronti»');
        assert.equal(voce.attr('data-id'), nodo.id);
        assert.equal(voce.find('span').last().text(), cl(nodo.label));
        d.wrap(voce[0]).onclick();
        assert.deepEqual(fuoco, [nodo.id]);
    });
}
