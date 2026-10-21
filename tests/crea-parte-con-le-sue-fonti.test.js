'use strict';
/*
 * crea-parte-con-le-sue-fonti.test.js — packet 0101.
 * Il caso vero del 14/10: in ELABORA si lavora su un progetto (le sue fonti
 * entrano in `appState.sources` senza una riga in CREA), poi in CREA si genera
 * un progetto nuovo da un altro PDF. Prima dello 0101 le fonti di ELABORA
 * restavano nel cassetto: il vault nuovo le riceveva in `Fonti/` e il giro per
 * fase rifiutava per una foto che CREA non mostrava.
 * CREA è il bento vero (`mappai-costruisci-manifesto.js` +
 * `mappai-bento-composizione.js`) col core vero (`mappai-fonti-core.js`) su un
 * DOM cheerio. ⚠️ Con cheerio si asserisce solo su booleani, testi e numeri
 * (memoria «Test col DOM finto»).
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const cheerio = require('cheerio');

const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

/* il predicato del giro per fase, com'è in `public/js/app.js:1483-1484` */
const rifiutaGiroPerFase = sources => (sources || []).some(s => ['audio', 'video', 'youtube', 'image'].includes(s.type) ||
    (s.type === 'doc' && s.file && !/\.(pdf|txt|docx)$/i.test(s.file.name)));

function riga(id, titolo, campo) {
    return '<div id="' + id + '" class="source-entry"><div class="flex-grow"><div class="font-bold">' + titolo + '</div>' + campo + '</div></div>';
}

function crea() {
    const righe =
        riga('source_pdfcrea', 'Documenti (.pdf, .txt)', '<input type="file" data-source-id="source_pdfcrea">') +
        riga('source_extra2', 'Documenti (.pdf, .txt)', '<input type="file" data-source-id="source_extra2">') +
        riga('source_audiovuoto', 'File Audio', '<input type="file" data-source-id="source_audiovuoto">') +
        riga('source_testo', 'Testo Libero', '<textarea data-source-id="source_testo"></textarea>');
    const $ = cheerio.load('<html><head></head><body><div id="generation-details-card"></div>' +
        '<form id="setup-form"><div class="source-buttons-container"></div><div id="sources-container">' + righe + '</div></form></body></html>');
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
            get value() { return n.tagName === 'textarea' ? $(n).text() : ($(n).attr('value') || ''); },
            set value(v) { if (n.tagName === 'textarea') $(n).text(String(v)); else $(n).attr('value', String(v)); },
            get type() { return $(n).attr('type') || ''; },
            get title() { return $(n).attr('title') || ''; }, set title(v) { $(n).attr('title', String(v)); },
            get parentNode() { return wrap(n.parent); },
            get nextSibling() { return wrap(n.next); },
            insertBefore: (c, ref) => { if (ref) $(ref.node).before(c.node); else $(n).append(c.node); return c; },
            getAttribute: k => { const v = $(n).attr(k); return v === undefined ? null : v; },
            setAttribute: (k, v) => { $(n).attr(k, String(v)); },
            removeAttribute: k => { $(n).removeAttr(k); },
            querySelector: s => wrap($(n).find(s)[0]),
            querySelectorAll: s => $(n).find(s).toArray().map(wrap),
            contains: c => !!c && (c.node === n || $(n).find(c.node).length > 0),
            closest: s => wrap($(n).closest(s)[0]),
            appendChild: c => { $(n).append(c.node); return c; },
            addEventListener: (tipo, fn) => { ascolti.push({ n, tipo, fn }); }, remove: () => { $(n).remove(); }
        };
        for (const k of ['hidden', 'checked', 'disabled']) Object.defineProperty(e, k, bool(n, k));
        cache.set(n, e);
        return e;
    }
    const document = {
        readyState: 'complete', documentElement: wrap($('html')[0]), body: wrap($('body')[0]),
        getElementById: id => wrap($('[id]').toArray().find(el => el.attribs.id === id)),
        createElement: tag => wrap($('<' + tag + '></' + tag + '>')[0]),
        querySelector: s => wrap($(s)[0]), querySelectorAll: s => $(s).toArray().map(wrap),
        addEventListener() {}, removeEventListener() {}
    };
    const storage = new Map([['mappai_bento_default_v1', '1']]);
    const chiamate = [];
    const pdf = name => ({ name, size: 1000, type: 'application/pdf', arrayBuffer: async () => new ArrayBuffer(0) });
    const w = {
        console: { log() {}, warn() {}, error() {}, info() {} }, document,
        setTimeout: () => 0, clearTimeout() {},
        localStorage: { getItem: k => (storage.has(k) ? storage.get(k) : null), setItem: (k, v) => storage.set(k, String(v)), removeItem: k => storage.delete(k) },
        t: (_k, f) => f, safeCreateIcons() {}, showToast() {},
        startGeneration() { chiamate.push('startGeneration'); },
        MappAIPipeline: { _startFromModal() { chiamate.push('_startFromModal'); }, _hasOutputNow: () => true }
    };
    w.window = w;
    /* il cassetto come lo lascia la sera del 14/10 */
    w.appState = { sources: [
        /* «Aggiungi PDF» di ELABORA: il File sta nella cache di ELABORA, non qui */
        { id: 'elab_pdf_1', type: 'pdf', name: '3. 1a Guerra Mondiale.pdf', content: 'La prima guerra mondiale…', file: null, origin: 'elabora' },
        /* una foto ripristinata da `Fonti/` di un dossier */
        { id: 'vault-1', type: 'image', name: 'foto.jpg', content: '', vaultRel: 'Fonti/foto.jpg', vaultDi: '/x/Dossier' },
        /* le fonti di CREA */
        { id: 'source_pdfcrea', type: 'doc', content: '', file: pdf('Teoria diseq.pdf') },
        { id: 'source_extra2', type: 'doc', content: '', file: pdf('Esercizi.pdf') },     // file 2 di una scelta multipla: riga col campo vuoto
        { id: 'source_audiovuoto', type: 'audio', content: '', file: null },               // Finder annullato
        { id: 'source_testo', type: 'text', content: '', file: null }
    ] };
    /* `removeSource` com'è in `app.js:1280-1285` */
    w.removeSource = id => {
        w.appState.sources = w.appState.sources.filter(s => s.id !== id);
        document.getElementById(id).remove();
    };
    vm.createContext(w);
    w.MappAIFontiCore = require('../public/js/mappai-fonti-core.js');
    w.MappAIBento = require('../public/js/mappai-bento-composizione.js');
    vm.runInContext(read('public/js/mappai-costruisci-manifesto.js'), w, { filename: 'mappai-costruisci-manifesto.js' });
    w.MappAICostruisci.montaBento();
    /* il primo file scelto nel Finder sta nel campo della sua riga */
    document.getElementById('source_pdfcrea').querySelector('input[type="file"]').files = [w.appState.sources[2].file];
    const clic = id => {
        const target = document.getElementById(id);
        assert.equal(!!target, true, id + ' non montato');
        ascolti.filter(a => a.tipo === 'click').forEach(a => a.fn({ target }));
    };
    const scrivi = (id, testo) => { document.getElementById(id).querySelector('textarea').value = testo; };
    const ids = () => w.appState.sources.map(s => s.id).join(',');
    return { w, clic, scrivi, ids, chiamate, rigaC: id => !!document.getElementById(id) };
}

test('0101: «Genera» in CREA dopo ELABORA — restano solo le fonti di CREA, il giro per fase non rifiuta', () => {
    const c = crea();
    c.scrivi('source_testo', 'Una disequazione è una disuguaglianza fra due espressioni.');
    assert.equal(rifiutaGiroPerFase(c.w.appState.sources), true, 'la scena di partenza deve far rifiutare il giro');
    c.clic('mn-genera');
    assert.equal(c.ids(), 'source_pdfcrea,source_extra2,source_testo');
    assert.equal(rifiutaGiroPerFase(c.w.appState.sources), false);
    assert.equal(c.rigaC('source_audiovuoto'), false, 'la riga audio vuota esce con la sua voce');
    assert.equal(c.rigaC('source_pdfcrea'), true);
    /* senza classe scelta il controllo del contesto ferma la partenza: la potatura
       è avvenuta prima, e non fa danno (quelle fonti CREA non le mostrava) */
    assert.equal(c.chiamate.length, 0);
});

test('0101: «Solo la mappa» pota allo stesso modo; il testo libero vuoto esce', () => {
    const c = crea();
    /* «Genera solo la mappa» non è nel bento di serie: lo si monta come fa la composizione */
    const b = c.w.document.createElement('button'); b.id = 'mn-solo-mappa';
    c.w.document.body.appendChild(b);
    /* 0103: anche il modulo passa dal gate del riquadro giallo, quindi si sceglie «Chi» */
    c.w.document.getElementById('mp-chi').value = 'c:cls_prova';
    c.clic('mn-solo-mappa');
    assert.equal(c.ids(), 'source_pdfcrea,source_extra2');
    assert.equal(c.chiamate.join(','), 'startGeneration');
});

test('0101: i bottoni dei preset non toccano il cassetto', () => {
    const c = crea();
    const prima = c.ids();
    const b = c.w.document.querySelector('[data-preset]');
    assert.equal(!!b, true, 'un bottone dei preset nel bento');
    if (!b.id) b.setAttribute('id', 'prova-preset');
    c.clic(b.id);
    assert.equal(c.ids(), prima);
});

test('0101: senza il core non si toglie niente (nel dubbio)', () => {
    const c = crea();
    c.w.MappAIFontiCore = null;
    assert.equal(c.w.MappAICostruisci.soloFontiDiCrea(), 0);
    assert.equal(c.w.appState.sources.length, 6);
});
