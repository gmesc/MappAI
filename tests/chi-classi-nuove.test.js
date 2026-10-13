'use strict';
/*
 * 0093, lotto A — una classe creata (o rinominata, o eliminata) in Cabina si vede
 * subito in «Chi:» di CREA, senza riaprire l'app; la voce vuota dice «scegli»,
 * senza lineette.
 *
 * Il bento vero (`mappai-costruisci-manifesto.js` + `mappai-bento-composizione.js`)
 * su un DOM cheerio, avviato da `avvio()` come nell'app: è lì che si ascoltano gli
 * eventi. `mappai-live-classes.js` annuncia ogni scrittura con
 * `mappai-profili-cambiati` (STORE.save → _annuncia): qui l'evento si spara a mano.
 * ⚠️ Con cheerio si asserisce solo su booleani, testi e attributi: un `assert` che
 * fallisce su un elemento del DOM finto fa girare Node all'infinito.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const cheerio = require('cheerio');

const ROOT = path.join(__dirname, '..');
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');

function crea(classi) {
    const $ = cheerio.load('<html class="manifesto"><head></head><body><div id="generation-details-card"></div></body></html>');
    const cache = new WeakMap(), ascoltiDoc = {};
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
            get value() { return $(n).attr('value') || ''; }, set value(v) { $(n).attr('value', String(v)); },
            get type() { return $(n).attr('type') || ''; },
            get title() { return $(n).attr('title') || ''; }, set title(v) { $(n).attr('title', String(v)); },
            getAttribute: k => { const v = $(n).attr(k); return v === undefined ? null : v; },
            setAttribute: (k, v) => { $(n).attr(k, String(v)); },
            removeAttribute: k => { $(n).removeAttr(k); },
            querySelector: s => wrap($(n).find(s)[0]),
            querySelectorAll: s => $(n).find(s).toArray().map(wrap),
            contains: c => !!c && (c.node === n || $(n).find(c.node).length > 0),
            closest: s => wrap($(n).closest(s)[0]),
            appendChild: c => { $(n).append(c.node); return c; },
            insertBefore: c => { $(n).prepend(c.node); return c; },
            addEventListener() {}, removeEventListener() {}, remove: () => { $(n).remove(); }
        };
        for (const k of ['hidden', 'checked', 'disabled']) Object.defineProperty(e, k, bool(n, k));
        cache.set(n, e);
        return e;
    }
    const documentElement = wrap($('html')[0]);
    const document = {
        readyState: 'complete', documentElement, body: wrap($('body')[0]),
        getElementById: id => wrap($('[id]').toArray().find(el => el.attribs.id === id)),
        createElement: tag => wrap($('<' + tag + '></' + tag + '>')[0]),
        querySelector: s => wrap($(s)[0]), querySelectorAll: s => $(s).toArray().map(wrap),
        addEventListener: (tipo, fn) => { (ascoltiDoc[tipo] = ascoltiDoc[tipo] || []).push(fn); },
        removeEventListener() {}
    };
    const storage = new Map(Object.entries({ mappai_bento_default_v1: '1' }));
    const w = {
        console: { log() {}, warn() {}, error() {}, info() {} }, document,
        setTimeout: () => 0, clearTimeout() {},
        localStorage: { getItem: k => (storage.has(k) ? storage.get(k) : null), setItem: (k, v) => storage.set(k, String(v)), removeItem: k => storage.delete(k) },
        t: (_k, f) => f, safeCreateIcons() {}, showToast() {},
        MappAIClasses: { list: () => classi.slice(), students: () => [], activeId: () => '', activeStudentName: () => '' }
    };
    w.window = w;
    vm.createContext(w);
    w.MappAIBento = require('../public/js/mappai-bento-composizione.js');
    vm.runInContext(read('public/js/mappai-costruisci-manifesto.js'), w, { filename: 'mappai-costruisci-manifesto.js' });
    const spara = tipo => (ascoltiDoc[tipo] || []).forEach(fn => fn({ type: tipo }));
    const opzioni = () => $('#mp-chi option').toArray().map(o => $(o).text());
    return { spara, opzioni, ascolta: tipo => (ascoltiDoc[tipo] || []).length > 0, montato: () => $('#mp-chi').length === 1 };
}

test('A: una classe creata dopo il montaggio compare in «Chi:» con mappai-profili-cambiati', () => {
    const classi = [];
    const c = crea(classi);
    assert.equal(c.montato(), true, '«Chi:» non è montato');
    assert.equal(c.ascolta('mappai-profili-cambiati'), true, 'il bento non ascolta mappai-profili-cambiati');
    assert.deepEqual(c.opzioni(), ['scegli']);
    classi.push({ id: 'cls_1', name: '4R' });           // «Crea classe» in Cabina
    c.spara('mappai-profili-cambiati');
    assert.deepEqual(c.opzioni(), ['scegli', '4R']);
    classi[0].name = '4S';                                // rinominata
    c.spara('mappai-profili-cambiati');
    assert.deepEqual(c.opzioni(), ['scegli', '4S']);
    classi.length = 0;                                    // eliminata
    c.spara('mappai-profili-cambiati');
    assert.deepEqual(c.opzioni(), ['scegli']);
});

test('A: la voce vuota di «Chi:» è «scegli», senza lineette, anche in inglese', () => {
    const src = read('public/js/mappai-costruisci-manifesto.js');
    assert.equal(src.includes("t('mn_chi_vuoto', 'scegli')"), true);
    assert.equal(src.includes("'— scegli —'"), false);
    assert.equal(/\bmn_chi_vuoto:\s*"choose",/.test(read('public/traduzioni/en_translations.js')), true);
});
