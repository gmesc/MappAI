'use strict';
/* 0087 lotto 10-modifica (Giacomo, 12/10/2026): «ELABORA › Sintesi › Modifica › Editor è il
   percorso giusto, invece gli altri materiali hanno il percorso ELABORA › Foglio nodi › Editor
   e manca lo step del bottone Modifica». Senza file prodotto la riga apre un'ANTEPRIMA con
   «Modifica» (il documento vero per la catena, la scheda per il foglio nodi) e solo «Modifica»
   apre l'editor. Il banco è la console vera (mappai-elabora-console.js) su un DOM finto, come
   in tests/percorso-lettura-workflow.test.js. */
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

/* La console su una mappa con nodi e un nesso causale, senza nessun file prodotto nel vault. */
function banco(opzioni = {}) {
    const dom = domFinto(), calls = { ns: [], cc: [], syn: [], render: 0, notices: [] };
    const state = { extractionMode: 'mindmap', activeVaultPath: '/vault', rootNodeLabel: 'Mappa <prova>',
        db: { nodes: [{ id: 'a', label: 'A', level: 0 }, { id: 'b', label: 'B', level: 1 }], links: [{ source: 'a', target: 'b', rel: 'causa' }], studySets: [] } };
    if (opzioni.causalDoc) state.db.causalDoc = opzioni.causalDoc;
    if (opzioni.nodeSheet) state.db.nodeSheet = opzioni.nodeSheet;
    let schema, box, closeModal;
    function draw(next) {
        dom.document.body.innerHTML = '<div class="mm-box"><div class="mm-console__area">' +
            (next.tela ? '<div class="mm-tela" data-tela="elab"></div>' : '') + '</div></div>';
        return box = dom.document.querySelector('.mm-box');
    }
    const g = { console: { log() {}, warn() {} }, document: dom.document, appState: state, TextDecoder, Uint8Array,
        setTimeout, clearTimeout, atob: s => Buffer.from(s, 'base64').toString('binary'),
        localStorage: { getItem() { return null; }, removeItem() {}, setItem() {} }, sessionStorage: { getItem() { return null; }, setItem() {} },
        showToast: m => calls.notices.push(m),
        MappAIDocEditor: { reset() {}, render() { calls.render++; }, assicuraStili() {}, hasUnsaved: () => false, haDocumento: () => false,
            openNodeSheet(clone) { calls.ns.push(clone || ''); }, openCausal(clone) { calls.cc.push(clone || ''); }, openSynthesis(id) { calls.syn.push(id); } },
        MappAIElabora: { unmountSource() {} },
        MappAIVaults: { quando() { return () => {}; } },
        MappAICausalCore: { countRows: d => (d && d.rows ? d.rows.length : 0), normDoc: d => d, chainsFromDoc: d => ({ total: d.rows.length, daDoc: true }) },
        MappAICausal: { buildForCurrentMap: () => ({ total: 1 }), mapName: () => 'Mappa <prova>',
            buildDocHtml: (chains, nome) => '<html><body><p class="cc">catena ' + (chains.daDoc ? 'dal documento' : 'dalla mappa') + ' · ' + nome + '</p></body></html>' },
        MappAITeach: {
            mappeDelContesto: async () => [{ id: 'v:/vault', nome: 'Mappa <prova>', v: { fullPath: '/vault', extractionMode: 'mindmap' } }],
            mappaCorrente: rows => rows.find(r => r.v.fullPath === state.activeVaultPath),
            tabelleMateriali: rows => [{ id: 'other', titolo: 'Materiali', righe: rows.map(m => ({ id: 'm:' + m.id, celle: [m.titolo] })) }]
        },
        MappAIModal: { open(s) { schema = s; draw(s); s.suApertura(box, draw); return new Promise(resolve => { closeModal = resolve; }); } },
        electronAPI: { vaultMaterialsList: async () => ({ files: [] }), async readVaultFile() { return { ok: false }; } },
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
        bottoni() { return dom.document.querySelectorAll('#ec-file .de-bar button').map(b => b.textContent); },
        async button(label) {
            const b = dom.document.querySelectorAll('#ec-file .de-bar button').find(e => e.textContent === label);
            assert.ok(b, 'bottone ' + label); for (const fn of b.events.click || []) fn(); await settle();
        },
        iframe() { return dom.document.querySelector('#ec-file iframe'); },
        async close() { closeModal(); await settle(); }
    };
}

test('foglio nodi senza PDF: la riga apre la SCHEDA con «Modifica», non l\'editor; «Modifica» apre l\'editor', async () => {
    const h = banco();
    await h.open();
    assert.ok(h.righe().includes('m:ns:'), 'la riga del foglio nodi c\'è: ' + h.righe().join(' '));
    await h.action('m:ns:');
    assert.deepEqual(h.calls.ns, [], 'l\'editor NON si apre al clic sulla riga');
    assert.ok(h.bottoni().includes('Modifica'), 'la barra ha «Modifica»: ' + h.bottoni().join(' · '));
    assert.ok(h.bottoni().includes('Esci'));
    const fr = h.iframe(); assert.ok(fr, 'la scheda sta in un iframe');
    assert.match(fr.srcdoc, /Foglio dei nodi/);
    assert.match(fr.srcdoc, /Nodi della mappa: 2/);
    assert.match(fr.srcdoc, /Nessun foglio salvato ancora/);
    await h.button('Modifica');
    assert.deepEqual(h.calls.ns, [''], 'ora sì: l\'editor del foglio nodi, l\'originale');
    await h.close();
});

test('foglio nodi con card salvate nel progetto: la scheda le conta', async () => {
    const h = banco({ nodeSheet: { cards: [{}, {}, {}], fmt: '3x4' } });
    await h.open();
    await h.action('m:ns:');
    assert.match(h.iframe().srcdoc, /Card salvate nel progetto: 3 \(formato 3x4\)/);
    await h.close();
});

test('catena dei perché senza file: anteprima col documento VERO dalla mappa; col documento salvato, dal documento', async () => {
    const h = banco();
    await h.open();
    assert.ok(h.righe().includes('m:cc:'), 'la riga della catena c\'è: ' + h.righe().join(' '));
    await h.action('m:cc:');
    assert.deepEqual(h.calls.cc, []);
    assert.match(h.iframe().srcdoc, /catena dalla mappa · Mappa <prova>/);
    await h.button('Modifica');
    assert.deepEqual(h.calls.cc, ['']);
    await h.close();

    const h2 = banco({ causalDoc: { rows: [{ a: 1 }, { a: 2 }] } });
    await h2.open();
    await h2.action('m:cc:');
    assert.match(h2.iframe().srcdoc, /catena dal documento/);
    await h2.close();
});

test('senza costruttore della catena si entra in editor come prima (nessuna anteprima vuota)', async () => {
    const h = banco();
    h.g.MappAICausal.buildDocHtml = () => '';
    await h.open();
    await h.action('m:cc:');
    await h.settle();
    assert.deepEqual(h.calls.cc, [''], 'il ripiego: l\'editor diritto');
    await h.close();
});
