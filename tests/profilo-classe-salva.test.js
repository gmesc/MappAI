'use strict';
/*
 * 0093, lotto F — «Profilo classe»: il bottone si chiama «Salva» (salva tutto il profilo,
 * non solo i nomi), e uscire con modifiche non salvate chiede che cosa farne.
 * Visto dalla guida: spuntare «Storia» e premere «Indietro» non salvava niente, senza avviso.
 *
 * Il modulo VERO `mappai-live-classes.js` (con `mappai-live-core.js`) in una vm, su un DOM
 * cheerio: qui serve che ogni campo abbia il SUO valore e la SUA spunta, perché la domanda
 * nasce dal confronto dei campi. Il motore dei modali è finto e risponde come gli si dice.
 * ⚠️ Con cheerio si asserisce solo su booleani, testi e attributi: un `assert` che fallisce
 * su un elemento del DOM finto fa girare Node all'infinito.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const cheerio = require('cheerio');

const ROOT = path.join(__dirname, '..');
const JS = f => fs.readFileSync(path.join(ROOT, 'public', 'js', f), 'utf8');
const giro = async () => { for (let i = 0; i < 6; i++) await new Promise(r => setImmediate(r)); };

function carica(risposta) {
    const $ = cheerio.load('<html><head></head><body></body></html>');
    const cache = new WeakMap();
    const bool = (n, k) => ({ get() { return n.attribs[k] !== undefined; }, set(v) { if (v) $(n).attr(k, ''); else $(n).removeAttr(k); } });
    function wrap(n) {
        if (!n) return null;
        if (cache.has(n)) return cache.get(n);
        const e = {
            node: n, style: {}, dataset: {}, parentNode: null,
            classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
            get innerHTML() { return $(n).html(); }, set innerHTML(v) { $(n).html(String(v)); },
            get textContent() { return $(n).text(); }, set textContent(v) { $(n).text(String(v)); },
            get id() { return $(n).attr('id') || ''; }, set id(v) { $(n).attr('id', String(v)); },
            get name() { return $(n).attr('name') || ''; },
            get value() { return $(n).attr('value') || ''; }, set value(v) { $(n).attr('value', String(v)); },
            get type() { return $(n).attr('type') || ''; },
            getAttribute: k => { const v = $(n).attr(k); return v === undefined ? null : v; },
            setAttribute: (k, v) => { $(n).attr(k, String(v)); },
            querySelector: s => wrap($(n).find(s)[0]),
            querySelectorAll: s => $(n).find(s).toArray().map(wrap),
            addEventListener() {}, removeEventListener() {}, focus() {},
            appendChild: c => { $(n).append(c.node); return c; },
            remove: () => { $(n).remove(); }
        };
        for (const k of ['hidden', 'checked', 'disabled']) Object.defineProperty(e, k, bool(n, k));
        Object.defineProperty(e, 'parentNode', { get: () => wrap(n.parent) });
        cache.set(n, e);
        return e;
    }
    const domande = [], scritti = [];
    const document = {
        readyState: 'complete', head: wrap($('head')[0]), body: wrap($('body')[0]),
        createElement: tag => wrap($('<' + tag + '></' + tag + '>')[0]),
        getElementById: id => wrap($('[id]').toArray().find(el => el.attribs.id === id)),
        querySelector: s => wrap($(s)[0]), addEventListener() {}, removeEventListener() {}, dispatchEvent() {}
    };
    const window = {
        t: (_k, f) => f, showToast() {}, safeCreateIcons() {},
        MappAITeacherProfile: { disciplineList: () => ['Scienze', 'Matematica', 'Storia'] },
        MappAIModal: { aperti: 0, prossimoZ: () => 12300,
            chiediSalvataggio: async o => { domande.push(o); return risposta.valore; } },
        electronAPI: {
            liveClassesLoad: async () => ({ success: true, data: { schema: 'mappai-classes@1', classes: [
                { id: 'c4r', name: '4R', gradeNum: 4, section: 'R', system: 'Ticino', year: '2026/2027', students: [{ n: 1 }],
                    disciplines: ['Scienze', 'Matematica'], register: '', notes: '' }] } }),
            liveClassesSave: async d => { scritti.push(JSON.parse(JSON.stringify(d))); return { success: true }; }
        }
    };
    const ctx = vm.createContext({
        window, document, console: { log() {}, warn() {}, error() {} }, setTimeout, CustomEvent: function (n) { this.type = n; },
        localStorage: { getItem: () => null, setItem() {}, removeItem() {} }
    });
    vm.runInContext('let appState = ' + JSON.stringify({ allProfiles: [], userProfile: {} }) + ';', ctx);
    vm.runInContext(JS('mappai-live-core.js'), ctx);
    window.MappAILiveReports = { buildCredentialCardsHtml: () => '' };
    vm.runInContext(JS('mappai-live-classes.js'), ctx);
    const S = window.MappAIClasses;
    const aperta = () => $('#class-accounts-modal').length > 0;
    const finestra = () => document.getElementById('class-accounts-modal');
    const spunta = (d, on) => { finestra().querySelectorAll('[data-disc]').find(i => i.value === d).checked = on; };
    const bottoni = () => $('#class-accounts-modal button').toArray().map(b => $(b).text().trim());
    const discipline = () => S.list()[0].disciplines.join(',');
    return { S, domande, scritti, aperta, finestra, spunta, bottoni, discipline };
}

test('F: il bottone si chiama «Salva», non «Salva nomi»', async () => {
    const t = carica({ valore: 'annulla' }); await t.S.load();
    t.S.openClassEdit('c4r');
    assert.equal(t.bottoni().includes('Salva'), true, t.bottoni().join(' | '));
    assert.equal(t.bottoni().includes('Salva nomi'), false);
});

test('F: «Indietro» senza modifiche esce senza chiedere', async () => {
    const t = carica({ valore: 'annulla' }); await t.S.load();
    t.S.openClassEdit('c4r');
    t.finestra().querySelector('[data-back]').onclick();
    await giro();
    assert.equal(t.domande.length, 0);
    assert.equal(t.aperta(), false);
});

test('F: con una disciplina spuntata «Indietro» chiede; «Torna indietro» resta nella schermata', async () => {
    const r = { valore: 'annulla' }, t = carica(r); await t.S.load();
    t.S.openClassEdit('c4r');
    t.spunta('Storia', true);
    t.finestra().querySelector('[data-back]').onclick();
    await giro();
    assert.equal(t.domande.length, 1);
    assert.equal(t.domande[0].nome, '4R');
    assert.equal(t.aperta(), true);
    assert.equal(t.discipline(), 'Scienze,Matematica');
});

test('F: «Esci senza salvare» esce e non salva', async () => {
    const t = carica({ valore: 'esci' }); await t.S.load();
    t.S.openClassEdit('c4r');
    t.spunta('Storia', true);
    t.finestra().querySelector('[data-back]').onclick();
    await giro();
    assert.equal(t.aperta(), false);
    assert.equal(t.discipline(), 'Scienze,Matematica');
    assert.equal(t.scritti.length, 0);
});

test('F: «Salva» dalla domanda salva la disciplina ed esce', async () => {
    const t = carica({ valore: 'salva' }); await t.S.load();
    t.S.openClassEdit('c4r');
    t.spunta('Storia', true);
    t.finestra().querySelector('[data-back]').onclick();
    await giro();
    assert.equal(t.aperta(), false);
    assert.equal(t.discipline(), 'Scienze,Matematica,Storia');
    assert.equal(t.scritti.length > 0, true, 'scritto su disco');
});

test('F: la × chiede come «Indietro»; dopo «Salva» dal bottone non chiede più', async () => {
    const t = carica({ valore: 'annulla' }); await t.S.load();
    t.S.openClassEdit('c4r');
    t.spunta('Storia', true);
    t.finestra().querySelector('.cls-close').onclick();
    await giro();
    assert.equal(t.domande.length, 1);
    assert.equal(t.aperta(), true);
    t.finestra().querySelector('[data-savenames]').onclick();
    assert.equal(t.discipline(), 'Scienze,Matematica,Storia');
    t.finestra().querySelector('.cls-close').onclick();
    await giro();
    assert.equal(t.domande.length, 1, 'niente da salvare: nessuna seconda domanda');
    assert.equal(t.aperta(), false);
});

test('F: la chiave nuova è solo in inglese', () => {
    const en = fs.readFileSync(path.join(ROOT, 'public/traduzioni/en_translations.js'), 'utf8');
    const it = fs.readFileSync(path.join(ROOT, 'public/traduzioni/it_translations.js'), 'utf8');
    assert.equal(/\bcls_save: "Save",/.test(en), true);
    assert.equal(/\bcls_save:/.test(it), false);
});
