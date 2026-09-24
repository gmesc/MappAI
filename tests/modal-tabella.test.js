const test = require('node:test');
const assert = require('node:assert/strict');
const Core = require('../public/js/mappai-modal-core.js');
let tab;
const documentEvents = {};
global.window = {};
global.requestAnimationFrame = f => f();
global.document = {
    body: { style: {} },
    addEventListener: (n, f) => { documentEvents[n] = f; },
    createElement: tag => tag === 'canvas' ? { getContext: () => ({ measureText: s => ({ width: s.length * 10 }) }) } : ({ className: '', innerHTML: '', setAttribute() {}, addEventListener() {},
        querySelector: () => null, querySelectorAll: s => s === '.mm-tab' && tab ? [tab] : [] })
};
const Modal = require('../public/js/mappai-modal.js');
function cell(text, value) {
    const attrs = value === undefined ? {} : { 'data-ordine': value === null ? '' : String(value) };
    return { textContent: text, hasAttribute: k => k in attrs, getAttribute: k => attrs[k] };
}
function row(id, text, value, fixed = false) {
    return { id, cells: [cell(text, value)], hasAttribute: k => k === 'data-fissa' && fixed };
}
function table(rows, widths = [200, 150]) {
    const events = {}, heads = widths.map(w => ({ attrs: { 'aria-sort': 'none' },
        getAttribute(k) { return this.attrs[k]; }, setAttribute(k, v) { this.attrs[k] = v; },
        getBoundingClientRect: () => ({ width: w }) }));
    const cols = widths.map(w => ({ style: { width: w + 'px' } }));
    const body = { rows, appendChild(r) { this.rows = this.rows.filter(x => x !== r).concat(r); } };
    return { events, heads, cols, tBodies: [body], style: {}, isConnected: true, offsetWidth: 350,
        getBoundingClientRect: () => ({ width: 350 }),
        closest: () => null, querySelector: () => ({}),
        querySelectorAll: s => s === 'col' ? cols : s.startsWith('th') ? heads : [],
        addEventListener: (n, f) => { events[n] = f; } };
}
function sort(t, i = 0) {
    const button = { getAttribute: () => String(i), closest: () => t.heads[i] };
    t.events.click({ target: { closest: () => button } });
}
function render(spec) { return Modal.render({ titolo: 'Prova', tabella: { colonne: ['Data', 'Altro'], righe: [], ...spec } }); }

test('valori semantici, riepilogo e stato sopravvivono alla doppia normalizzazione', () => {
    const r = [{ testo: '02/01/26, 11:30', ordine: 1767359400000 }, { testo: '—', ordine: null }];
    r.id = 'all'; r.fissa = true;
    const stato = { larghezze: [150, 170] };
    const n = Core.normalizzaTabella(Core.normalizzaTabella({ colonne: ['A', 'B'], righe: [r], colonneIndipendenti: true, statoColonne: stato }));
    assert.equal(n.righe[0].fissa, true);
    assert.equal(n.righe[0][0].ordine, 1767359400000);
    assert.equal(n.righe[0][1].ordine, null);
    assert.equal(n.statoColonne, stato);
    assert.equal(Core.normalizzaTabella({ colonne: ['A'] }).colonneIndipendenti, false);
});

test('date tra anni/mesi/ore: riepilogo primo, assenze ultime in entrambi i versi', () => {
    tab = table([
        row('missing', '—', null), row('jan', '02/01/26, 12:00', Date.UTC(2026, 0, 2, 11)),
        row('all', 'Tutte le mappe', undefined, true), row('dec', '31/12/25, 23:00', Date.UTC(2025, 11, 31, 22)),
        row('early', '02/01/26, 11:30', Date.UTC(2026, 0, 2, 10, 30))
    ]);
    const stato = { larghezze: [200, 150] };
    render({ colonneIndipendenti: true, statoColonne: stato });
    sort(tab);
    assert.deepEqual(tab.tBodies[0].rows.map(r => r.id), ['all', 'dec', 'early', 'jan', 'missing']);
    sort(tab);
    assert.deepEqual(tab.tBodies[0].rows.map(r => r.id), ['all', 'jan', 'early', 'dec', 'missing']);
    assert.deepEqual(stato.ordine, { colonna: 0, verso: -1 });
    tab = table([row('early', 'a', 1), row('jan', 'b', 2), row('all', '', undefined, true)]);
    render({ colonneIndipendenti: true, statoColonne: stato });
    assert.deepEqual(tab.tBodies[0].rows.map(r => r.id), ['all', 'jan', 'early']);
});

test('trascinamento indipendente: altra colonna identica, totale e stato aggiornati alla riapertura', () => {
    tab = table([]);
    const stato = { larghezze: [200, 150] };
    render({ colonneIndipendenti: true, statoColonne: stato });
    const grip = { getAttribute: () => '0', closest: () => tab.heads[0] };
    tab.events.mousedown({ target: { closest: () => grip }, preventDefault() {}, stopPropagation() {}, clientX: 50 });
    documentEvents.mousemove({ clientX: 110 }); documentEvents.mouseup();
    assert.deepEqual(tab.cols.map(c => c.style.width), ['260px', '150px']);
    assert.equal(tab.style.width, '410px');
    tab = table([]);
    render({ colonneIndipendenti: true, statoColonne: stato });
    assert.deepEqual(tab.cols.map(c => c.style.width), ['260px', '150px']);
});

test('markup contiene chiavi numeriche, titolo completo e maniglia anche sull’ultima colonna', () => {
    tab = null;
    const r = [{ testo: '02/01/26, 11:30', ordine: 123 }, 'Nome completo']; r.fissa = true;
    const html = render({ righe: [r], colonneIndipendenti: true }).innerHTML;
    assert.match(html, /data-ordine="123"/);
    assert.match(html, /data-fissa="true"/);
    assert.match(html, /title="Nome completo"/);
    assert.match(html, /data-grip="1"/);
    const legacy = render({ righe: [['a', 'b']] }).innerHTML;
    assert.doesNotMatch(legacy, /data-fissa|data-ordine|data-grip="1"/);
});


test('doppio clic ricalcola tutte le larghezze e conserva ordine e stato al ridisegno', () => {
    global.getComputedStyle = () => ({ font: '12px sans-serif', textTransform: 'none', letterSpacing: '0', paddingLeft: '12', paddingRight: '12' });
    const a = row('a', 'Contenuto lungo', 2), b = row('b', 'Breve', 1);
    a.cells.push(cell('Altro')); b.cells.push(cell('B'));
    for (const r of [a,b]) for (const c of r.cells) { c.querySelector = () => null; c.tagName = 'TD'; }
    tab = table([a,b]); tab.rows = [a,b];
    const stato = { larghezze: [300, 280] };
    render({ colonneIndipendenti: true, statoColonne: stato });
    const button = { getAttribute: () => '0', closest: () => tab.heads[0] };
    tab.events.click({ detail: 1, target: { closest: () => button } });
    tab.events.click({ detail: 2, target: { closest: () => button } });
    tab.events.dblclick({ target: { closest: () => tab.heads[0] }, preventDefault() {} });
    const expected = [Math.ceil('Contenuto lungo'.length * 10 * 1.1 + 24), Math.ceil('Altro'.length * 10 * 1.1 + 24)];
    assert.deepEqual(stato.larghezze, expected);
    assert.deepEqual(tab.tBodies[0].rows.map(r=>r.id), ['a','b']);
    assert.equal(stato.ordine, undefined);
    assert.equal(tab.heads[0].attrs['aria-sort'], 'none');
    tab = table([a,b]);
    render({ colonneIndipendenti: true, statoColonne: stato });
    assert.deepEqual(tab.cols.map(c=>parseFloat(c.style.width)), expected);
    tab = table([a,b]); render({});
    assert.equal(tab.events.dblclick, undefined, 'default delle altre tabelle invariato');
});
