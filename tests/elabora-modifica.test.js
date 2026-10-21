'use strict';
/* Packet 0105 (Giacomo, 16/10/2026): in ELABORA «un materiale senza PDF si apre subito
   nell'editor, mentre con il PDF resta l'anteprima col bottone 'Modifica'». Rovescia il lotto
   10-modifica dello 0087 (12/10), che apriva prima un'anteprima al volo. Vale per tutti i
   materiali senza file prodotto (foglio dei nodi, Catena dei perché, domande aperte, sintesi,
   insiemi di domande); uscendo dall'editor si torna all'ELENCO, non a un'anteprima. Il banco è
   la console vera (mappai-elabora-console.js) su un DOM finto, come in
   tests/percorso-lettura-workflow.test.js. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const cheerio = require('cheerio');

function domFinto(markup = '<html><head></head><body></body></html>') {
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
            get value() { return $(node).val(); }, set value(v) { $(node).val(v); },
            get isConnected() { return $(node).closest('html').length > 0; },
            get nextSibling() { return wrap($(node).next()[0]); },
            classList: { contains: c => $(node).hasClass(c), add: c => $(node).addClass(c), remove: c => $(node).removeClass(c) },
            querySelector: q => wrap($(node).find(q)[0]), querySelectorAll: q => $(node).find(q).toArray().map(wrap),
            getAttribute: n => $(node).attr(n), setAttribute: (n, v) => $(node).attr(n, v),
            appendChild(child) { $(node).append(child.node); return child; },
            insertBefore(child, other) { if (other) $(other.node).before(child.node); else $(node).append(child.node); return child; },
            replaceWith(other) { $(node).replaceWith(other.node); }, remove: () => $(node).remove(),
            addEventListener(n, fn) { (events[n] ||= []).push(fn); }, removeEventListener() {},
            set srcdoc(html) {
                e._srcdoc = html;
                e.contentDocument = domFinto(html).document;
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

/* La console su una mappa con nodi, un nesso causale, una sintesi in memoria, un foglio di
   domande aperte in archivio e un set di domande; nessun file nel vault, salvo `opzioni.files`. */
function banco(opzioni = {}) {
    const dom = domFinto(), calls = { ns: [], cc: [], syn: [], oq: [], set: [], render: 0, notices: [], read: [] };
    const state = { extractionMode: 'mindmap', activeVaultPath: '/vault', rootNodeLabel: 'Mappa prova',
        db: { nodes: [{ id: 'a', label: 'A', level: 0 }, { id: 'b', label: 'B', level: 1 }], links: [{ source: 'a', target: 'b', rel: 'causa' }],
            studySets: [{ id: 's1', type: 'quiz', date: '2026-10-16', items: [{ q: 'Una?' }] }] } };
    let schema, box, closeModal, aperto = false;
    function draw(next) {
        dom.document.body.innerHTML = '<div class="mm-box"><div class="mm-console__area">' +
            (next.tela ? '<div class="mm-tela" data-tela="elab"></div>' : '') + '</div></div>';
        return box = dom.document.querySelector('.mm-box');
    }
    const apri = (lista, x) => { lista.push(x); aperto = true; return true; };
    const g = { console: { log() {}, warn() {} }, document: dom.document, appState: state, TextDecoder, Uint8Array,
        setTimeout, clearTimeout, atob: s => Buffer.from(s, 'base64').toString('binary'),
        localStorage: { getItem() { return null; }, removeItem() {}, setItem() {} }, sessionStorage: { getItem() { return null; }, setItem() {} },
        showToast: m => calls.notices.push(m),
        MappAIDocEditor: { reset() { aperto = false; }, render() { calls.render++; }, assicuraStili() {}, hasUnsaved: () => false,
            haDocumento: () => (opzioni.rinuncia ? false : aperto),
            openNodeSheet(clone) { apri(calls.ns, clone || ''); }, openCausal(clone) { apri(calls.cc, clone || ''); },
            openSynthesis(id) { apri(calls.syn, id); }, openOpenQuestions(id) { return opzioni.rinuncia ? false : apri(calls.oq, id); },
            openSet(id) { if (!opzioni.rinuncia) apri(calls.set, id); } },
        MappAIElabora: { unmountSource() {} },
        MappAIVaults: { quando() { return () => {}; } },
        MappAIBranchSynthesis: { getData: () => ({ branchLabel: 'Sintesi della mappa', mapName: 'Mappa prova' }) },
        /* `get` dà la sorgente d'archivio: con lei l'anteprima al volo dello 0087 si costruiva davvero */
        MappAIStudyDocs: { list: () => [{ id: 'd1', kind: 'quizpaper', mapName: 'Mappa prova', title: 'Domande aperte', date: '2026-10-16' }],
            get: id => ({ id, html: '<html><body><p>sorgente ' + id + '</p></body></html>' }) },
        MappAICausalCore: { countRows: d => (d && d.rows ? d.rows.length : 0), normDoc: d => d, chainsFromDoc: d => ({ total: d.rows.length, daDoc: true }) },
        MappAICausal: { buildForCurrentMap: () => ({ total: 1 }), mapName: () => 'Mappa prova',
            buildDocHtml: () => '<html><body><p class="cc">catena</p></body></html>' },
        MappAITeach: {
            mappeDelContesto: async () => [{ id: 'v:/vault', nome: 'Mappa prova', v: { fullPath: '/vault', extractionMode: 'mindmap' } }],
            mappaCorrente: rows => rows.find(r => r.v.fullPath === state.activeVaultPath),
            tabelleMateriali: rows => [{ id: 'other', titolo: 'Materiali', righe: rows.map(m => ({ id: 'm:' + m.id, celle: [m.titolo] })) }],
            generePerFile: n => (/^Foglio-nodi/i.test(n) ? { label: 'Foglio nodi' } : { label: 'File' })
        },
        MappAIModal: { open(s) { schema = s; draw(s); s.suApertura(box, draw); return new Promise(resolve => { closeModal = resolve; }); } },
        electronAPI: { vaultMaterialsList: async () => ({ files: opzioni.files || [] }),
            async readVaultFile(a) { calls.read.push(a && a.relPath); return { ok: false }; } },
        MappAIDocBar: { nascondiInIframe: () => true, stampaIframe() { return true; } },
        MappAITTS: { stop() {}, mountChip() { return { style: {} }; } },
        MappAIPercorsoLettura: { elaboraMaterials: () => [] }
    };
    g.window = g;
    vm.runInNewContext(fs.readFileSync(require.resolve('../public/js/mappai-elabora-console'), 'utf8'), g);
    const settle = async () => { for (let i = 0; i < 30; i++) await new Promise(r => setTimeout(r, 0)); };
    return { ...dom, g, state, calls, settle,
        async open() { g.MappAIElaboraConsole.open({}); await settle(); },
        righe() { return g.MappAIElaboraConsole.schema().tabelle.flatMap(tb => tb.righe.map(r => r.id)); },
        async action(id) { schema.suAzione({ azione: id }, box, draw); await settle(); },
        /* l'anteprima al volo (0087) stava in un iframe dentro `#ec-file` con la sua barra */
        anteprima() { return !!this.document.querySelector('#ec-file iframe'); },
        editorAperto() { return !!this.document.querySelector('#elab-doc-host'); },
        bottoni() { return dom.document.querySelectorAll('#ec-file .de-bar button').map(b => b.textContent); },
        async close() { closeModal(); await settle(); }
    };
}

const SENZA_FILE = [
    ['m:ns:', 'ns', ''],
    ['m:cc:', 'cc', ''],
    ['m:syn:current', 'syn', 'current'],
    ['m:oq:d1', 'oq', 'd1'],
    ['m:set:s1', 'set', 's1']
];

for (const [riga, quale, arg] of SENZA_FILE) {
    test('0105 · ' + riga + ' senza file: il clic sulla riga apre DIRITTO l\'editor, nessuna anteprima', async () => {
        const h = banco();
        await h.open();
        assert.ok(h.righe().includes(riga), 'la riga c\'è: ' + h.righe().join(' '));
        await h.action(riga);
        assert.deepEqual(h.calls[quale], [arg], 'l\'editor giusto si apre al primo clic');
        assert.equal(h.anteprima(), false, 'nessuna anteprima intermedia');
        assert.equal(h.bottoni().includes('Modifica'), false, 'nessun «Modifica» da premere');
        assert.equal(h.editorAperto(), true, 'la tela ospita l\'editor');
        await h.close();
    });

    test('0105 · ' + riga + ' senza file: ESC dall\'editor torna all\'ELENCO in un colpo', async () => {
        const h = banco();
        await h.open();
        await h.action(riga);
        await h.action('__esc');
        assert.equal(h.anteprima(), false, 'non si torna a un\'anteprima');
        assert.equal(h.editorAperto(), false, 'l\'editor non c\'è più');
        assert.equal(h.calls[quale].length, 1, 'l\'editor non si riapre da solo');
        await h.close();
    });
}

test('0105 · se l\'editor rinuncia ad aprirsi: ritorno all\'elenco, mai un\'anteprima né un\'area vuota', async () => {
    for (const riga of ['m:oq:d1', 'm:set:s1']) {
        const h = banco({ rinuncia: true });
        await h.open();
        await h.action(riga);
        assert.equal(h.anteprima(), false, riga + ': nessuna anteprima di ripiego');
        assert.equal(h.editorAperto(), false, riga + ': nessun editor vuoto');
        await h.close();
    }
});

test('0105 · un foglio dei nodi CON file prodotto resta com\'era: si guarda il file, l\'editor non si apre', async () => {
    const h = banco({ files: [{ name: 'Foglio-nodi-Mappa prova.pdf', relPath: 'Materiali/Foglio-nodi-Mappa prova.pdf', mtime: 1 }] });
    await h.open();
    await h.action('m:ns:');
    assert.deepEqual(h.calls.ns, [], 'l\'editor NON si apre');
    assert.deepEqual(h.calls.read, ['Materiali/Foglio-nodi-Mappa prova.pdf'], 'si legge il file per mostrarlo');
    await h.close();
});
