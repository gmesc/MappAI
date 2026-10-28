'use strict';
/* 0090 (Giacomo, 12/10/2026): in ELABORA i materiali in attesa di validazione col chip «Completa
   validazione» che riapre la G2 dov'era (parte A); chiudendo la revisione si torna sempre in ELABORA
   (parte B); il modale «Genera materiali» dice la G2 in attesa (parte C) e la taratura della classe
   (parte D, T1 (a)). Il core è puro; console, revisione e pipeline sono i file VERI in una `vm`,
   su un DOM finto come in tests/elabora-modifica.test.js. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const cheerio = require('cheerio');
const C = require('../public/js/mappai-materiali-attesa-core.js');

const js = f => fs.readFileSync(require.resolve('../public/js/' + f), 'utf8');
const storage = (valori = {}) => ({ getItem: k => (k in valori ? valori[k] : null), setItem() {}, removeItem() {} });
const json = x => JSON.parse(JSON.stringify(x));      /* oggetti di un altro contesto vm */

function manifesto(config, stage = 'awaiting_review', steps = {}) {
    const st = { A: { status: 'done' }, B: { status: config.quiz ? 'pending' : 'skipped' }, C: { status: config.nodesheet ? 'pending' : 'skipped' },
        D: { status: config.synthesis ? 'pending' : 'skipped' }, E: { status: config.causal ? 'pending' : 'skipped' } };
    Object.assign(st, steps);
    return { config, steps: st, review: { approvedRevision: 1, final: stage ? { stage, items: [] } : undefined } };
}
const MC_FC_SYN = { quiz: { types: ['mc', 'flashcards'] }, synthesis: { audio: false } };

// ── il core ─────────────────────────────────────────────────────────────────────

test('core: G2 in attesa con MC + flashcard + sintesi → tre righe col chip, nelle categorie giuste', () => {
    const r = C.righe(manifesto(MC_FC_SYN));
    assert.deepEqual(r.map(x => x.tipo), ['Sintesi', 'Quiz MC', 'Flashcard']);
    assert.deepEqual(r.map(x => x.id), ['att:syn', 'att:mc', 'att:fc']);
    assert.ok(r.every(x => x.chip === true));
    assert.deepEqual(r.map(x => x.nome), ['Sintesi', 'Scelta Multipla', 'Flashcard']);
});

test('core: con la G2 «done», senza revisione, senza G2 o in un progetto di lettura → nessuna riga', () => {
    assert.deepEqual(C.righe(manifesto(MC_FC_SYN, 'done')), []);
    assert.deepEqual(C.righe(manifesto(MC_FC_SYN, null)), []);
    assert.deepEqual(C.righe({ config: MC_FC_SYN, steps: {} }), []);
    assert.deepEqual(C.righe(null), []);
    assert.deepEqual(C.righe(Object.assign(manifesto(MC_FC_SYN), { reading: {} })), []);
    for (const s of ['checking', 'approved', 'finalizing']) assert.deepEqual(C.righe(manifesto(MC_FC_SYN, s)), [], s);
});

test('core: il lotto misto dà Scelta Multipla e Domande Aperte; fogli e catena le loro righe; i passi «done» (bozze) non contano', () => {
    const tutto = { quiz: { types: ['mc', 'open'], mixed: true }, nodesheet: { modes: ['title'] }, causal: true };
    assert.deepEqual(C.righe(manifesto(tutto)).map(x => x.tipo), ['Foglio nodi', 'Catena dei perché', 'Quiz MC', 'Domande aperte']);
    /* gate 0090: con la revisione i passi B–E producono le bozze e sono «done» PRIMA della G2 */
    const bozze = manifesto(MC_FC_SYN, 'awaiting_review', { B: { status: 'done' }, D: { status: 'done' } });
    assert.deepEqual(C.righe(bozze).map(x => x.tipo), ['Sintesi', 'Quiz MC', 'Flashcard']);
    assert.equal(C.eRiga('att:mc'), true);
    assert.equal(C.eRiga('set:mc'), false);
});

test('core: gli interruttori sono accesi salvo «0»; senza storage o con un errore, spenti', () => {
    assert.equal(C.acceso(storage()), true);
    assert.equal(C.acceso(storage({ mappai_elabora_attesa: '0' })), false);
    assert.equal(C.acceso(null), false);
    assert.equal(C.acceso({ getItem() { throw new Error('x'); } }), false);
    assert.equal(C.tarAcceso(storage()), true);
    assert.equal(C.tarAcceso(storage({ mappai_modale_taratura: '0' })), false);
    assert.equal(C.tarAcceso(storage({ mappai_elabora_attesa: '0' })), true, 'i due interruttori sono indipendenti');
});

test('core: la taratura dice se la classe ce l\'ha oppure no; senza classe niente', () => {
    assert.equal(C.taratura('', true), null);
    const si = C.taratura('3A', true), no = C.taratura('3A', false);
    assert.equal(si.attiva, true); assert.equal(si.chiave, 'mp_adapt_on_cls'); assert.match(si.riserva, /\{nome\} ha una taratura/);
    assert.equal(no.attiva, false); assert.equal(no.chiave, 'mp_adapt_off_cls'); assert.match(no.riserva, /\{nome\} non ha una taratura/);
});

test('i18n: le chiavi nuove stanno nei due dizionari', () => {
    const it = fs.readFileSync(require.resolve('../public/traduzioni/it_translations.js'), 'utf8');
    const en = fs.readFileSync(require.resolve('../public/traduzioni/en_translations.js'), 'utf8');
    for (const k of ['ea_chip', 'mp_g2_attesa', 'mp_adapt_on_cls', 'mp_adapt_off_cls']) {
        assert.match(it, new RegExp('\\n    ' + k + ': "'), 'it: ' + k);
        assert.match(en, new RegExp('\\n    ' + k + ': "'), 'en: ' + k);
    }
});

// ── il DOM finto ────────────────────────────────────────────────────────────────

function domFinto(markup = '<html><head></head><body></body></html>') {
    const $ = cheerio.load(markup), cache = new WeakMap(), listeners = {};
    const document = { addEventListener(n, fn) { (listeners[n] ||= []).push(fn); }, removeEventListener() {},
        createElement: tag => wrap($('<' + tag + '></' + tag + '>')[0]),
        querySelector: q => wrap($(q)[0]), querySelectorAll: q => $(q).toArray().map(wrap),
        getElementById: id => wrap($('[id]').toArray().find(n => n.attribs.id === id)) };
    function wrap(node) {
        if (!node) return null;
        if (cache.has(node)) return cache.get(node);
        const events = {}, style = {};
        const e = { node, events, style, ownerDocument: document,
            get id() { return $(node).attr('id') || ''; }, set id(v) { $(node).attr('id', v); },
            get className() { return $(node).attr('class') || ''; }, set className(v) { $(node).attr('class', v); },
            get innerHTML() { return $(node).html(); }, set innerHTML(v) { $(node).html(v); },
            get textContent() { return $(node).text(); }, set textContent(v) { $(node).text(v); },
            get value() { return $(node).val() || ''; }, set value(v) { $(node).val(String(v)); },
            get checked() { return $(node).attr('checked') !== undefined; }, set checked(v) { if (v) $(node).attr('checked', 'checked'); else $(node).removeAttr('checked'); },
            get disabled() { return $(node).attr('disabled') !== undefined; }, set disabled(v) { if (v) $(node).attr('disabled', 'disabled'); else $(node).removeAttr('disabled'); },
            get firstChild() { return wrap($(node).children()[0]); },
            get children() { return $(node).children().toArray().map(wrap); },
            querySelector: q => wrap($(node).find(q)[0]), querySelectorAll: q => $(node).find(q).toArray().map(wrap),
            getAttribute: n => $(node).attr(n), setAttribute: (n, v) => $(node).attr(n, v),
            contains: o => !!o && (o.node === node || $(node).find(o.node).length > 0),
            appendChild(child) { $(node).append(child.node); return child; },
            insertBefore(child, other) { if (other) $(other.node).before(child.node); else $(node).append(child.node); return child; },
            remove: () => $(node).remove(),
            addEventListener(n, fn) { (events[n] ||= []).push(fn); }, removeEventListener() {},
            click() { if (e.onclick) return e.onclick(); }
        };
        cache.set(node, e); return e;
    }
    document.head = wrap($('head')[0]); document.body = wrap($('body')[0]); document.documentElement = wrap($('html')[0]);
    return { $, document };
}

// ── parte A e C: la console di ELABORA ──────────────────────────────────────────

/* `tabelleMateriali` finta con la forma di quella vera (landing-teach): un elenco per tipo,
   colonne Nome · Tipo · Data · comandi, righe `m:<id>` con le celle in quell'ordine. */
function tabelleFinte(rows) {
    const tipi = [...new Set(rows.map(m => m.tipo))];
    return tipi.map(tipo => ({ id: 'g:' + tipo, titolo: tipo,
        colonne: [{ etichetta: 'Nome', larghezza: '' }, { etichetta: 'Tipo', larghezza: '130px' }, { etichetta: 'Data', larghezza: '116px' }, { etichetta: '', larghezza: '58px' }],
        righe: rows.filter(m => m.tipo === tipo).map(m => ({ id: 'm:' + m.id, celle: [m.titolo, 'PDF', '—', { azioni: [] }] })) }));
}
function console0090(manifest, valori = {}) {
    const dom = domFinto(), calls = { completa: 0 };
    const state = { extractionMode: 'mindmap', activeVaultPath: '/vault', rootNodeLabel: 'Mappa', _pipelineManifest: manifest,
        db: { nodes: [{ id: 'a', label: 'A', level: 0 }], links: [], studySets: [] } };
    let schema, box, closeModal;
    function draw() { dom.document.body.innerHTML = '<div class="mm-box"><div class="mm-console__area"></div></div>'; return box = dom.document.querySelector('.mm-box'); }
    const g = { console: { log() {}, warn() {} }, document: dom.document, appState: state, TextDecoder, Uint8Array, setTimeout, clearTimeout,
        localStorage: storage(valori), sessionStorage: storage(), showToast() {},
        MappAIMaterialiAttesaCore: C,
        MappAIPipeline: { openModal() {}, completaValidazione() { calls.completa++; } },
        MappAIDocEditor: { reset() {}, render() {}, assicuraStili() {}, hasUnsaved: () => false, haDocumento: () => false },
        MappAIElabora: { unmountSource() {} }, MappAIVaults: { quando() { return () => {}; } },
        MappAITeach: { mappeDelContesto: async () => [{ id: 'v:/vault', nome: 'Mappa', v: { fullPath: '/vault', extractionMode: 'mindmap' } }],
            mappaCorrente: rows => rows.find(r => r.v.fullPath === state.activeVaultPath), tabelleMateriali: rows => tabelleFinte(rows) },
        MappAIModal: { open(s) { schema = s; draw(s); s.suApertura(box, draw); return new Promise(r => { closeModal = r; }); } },
        electronAPI: { vaultMaterialsList: async () => ({ files: [] }), async readVaultFile() { return { ok: false }; } },
        MappAIPercorsoLettura: { elaboraMaterials: () => [] }
    };
    g.window = g;
    vm.runInNewContext(js('mappai-elabora-console.js'), g);
    const settle = async () => { for (let i = 0; i < 30; i++) await new Promise(r => setTimeout(r, 0)); };
    return { g, state, calls, settle,
        async open() { g.MappAIElaboraConsole.open({}); await settle(); },
        tabelle() { return json(g.MappAIElaboraConsole.schema().tabelle); },
        async action(id) { schema.suAzione({ azione: id }, box, draw); await settle(); },
        async navVoce(v) { schema.suAzione({ azione: '__nav', voce: v }, box, draw); await settle(); },
        async close() { closeModal(); await settle(); } };
}

test('A: le righe in attesa stanno nella tabella della loro categoria, col chip «Completa validazione»', async () => {
    const h = console0090(manifesto(MC_FC_SYN));
    await h.open();
    const tabs = h.tabelle();
    const riga = (tipo, id) => tabs.find(t => t.id === 'g:' + tipo).righe.find(r => r.id === id);
    for (const [tipo, id, nome] of [['Sintesi', 'm:att:syn', 'Sintesi'], ['Quiz MC', 'm:att:mc', 'Scelta Multipla'], ['Flashcard', 'm:att:fc', 'Flashcard']]) {
        const r = riga(tipo, id);
        assert.ok(r, tipo + ': ' + JSON.stringify(tabs.map(t => t.id)));
        assert.equal(r.celle[0], nome, 'il nome normale del materiale');
        assert.equal(r.celle[1], '—', 'niente «Tipo»: non è un file');
        assert.deepEqual(r.celle[3], { azioni: [{ id: 'chip:att:' + id.slice(6), etichetta: 'Completa validazione', ruolo: 'secondario' }] });
    }
    /* la colonna delle azioni è larga per il chip, in tutte le tabelle */
    for (const t of tabs.filter(t => t.id !== 'g:fonte')) assert.ok(parseInt(t.colonne[3].larghezza, 10) >= 190, t.id + ' ' + t.colonne[3].larghezza);
    await h.close();
});

test('A: il clic sul nome e il clic sul chip riaprono la G2 (una strada sola: completaValidazione)', async () => {
    const h = console0090(manifesto(MC_FC_SYN));
    await h.open();
    await h.action('m:att:mc');
    await h.action('chip:att:syn');
    assert.equal(h.calls.completa, 2);
    await h.close();
});

test('A: con la G2 validata, senza G2 o con l\'interruttore a «0» le righe in attesa non ci sono', async () => {
    for (const [m, v] of [[manifesto(MC_FC_SYN, 'done'), {}], [manifesto(MC_FC_SYN, null), {}], [manifesto(MC_FC_SYN), { mappai_elabora_attesa: '0' }]]) {
        const h = console0090(m, v);
        await h.open();
        const ids = h.tabelle().flatMap(t => t.righe.map(r => r.id));
        assert.ok(!ids.some(id => /att:/.test(id)), ids.join(' '));
        assert.ok(h.tabelle().every(t => !t.colonne.some(c => parseInt(c.larghezza, 10) >= 190)), 'colonne come prima');
        await h.close();
    }
});

test('C: la voce «Più materiali insieme» dice la G2 in attesa; senza, la descrizione di prima', () => {
    const batch = h => h.g.MappAIElaboraConsole.tipi.find(x => x.id === 'batch');
    const att = console0090(manifesto(MC_FC_SYN));
    assert.match(batch(att).desc(), /aspettano la tua validazione/);
    const no = console0090(manifesto(MC_FC_SYN, 'done'));
    assert.match(batch(no).desc(), /in un giro solo/);
    const spento = console0090(manifesto(MC_FC_SYN), { mappai_elabora_attesa: '0' });
    assert.match(batch(spento).desc(), /in un giro solo/);
});

test('B: la console aperta si aggiorna (`aggiorna`), chiusa no', async () => {
    const h = console0090(manifesto(MC_FC_SYN));
    assert.equal(h.g.MappAIElaboraConsole.aggiorna(), false);
    await h.open();
    assert.equal(h.g.MappAIElaboraConsole.aggiorna(), true);
    await h.close();
});

// ── parte B: openCurrent riporta a ELABORA ─────────────────────────────────────

function revisione(valori = {}) {
    const calls = { open: [], torna: 0 };
    const st = { activeVaultPath: '/vault', db: { nodes: [{ id: 'a' }], links: [] }, _pipelineManifest: manifesto(MC_FC_SYN) };
    st._pipelineManifest.review.initial = { status: 'approved' };
    st._pipelineManifest.review.final.review = { initial: { status: 'awaiting_review' } };
    const window = { t: (_k, f) => f, MappAIMaterialiAttesaCore: C, MappAIPipelineCore: require('../public/js/mappai-pipeline-core'),
        MappAIReviewCore: require('../public/js/mappai-review-core'),
        MappAIPipeline: { tornaInElabora() { calls.torna++; return true; }, run: async () => {} }, localStorage: storage(valori) };
    const ctx = vm.createContext({ window, appState: st, document: { getElementById: () => null, querySelector: () => null, addEventListener() {} },
        console: { log() {}, warn() {}, info() {}, error() {} }, localStorage: storage(valori), StorageManager: { currentProjectId: 'p' } });
    vm.runInContext(js('mappai-review.js'), ctx);
    const R = window.MappAIReview;
    R.checkpoint = async () => {};
    R.open = (vp, m, o) => { calls.open.push(o); };
    return { R, calls };
}

test('B: openCurrent passa dopoChiusura (→ ELABORA) e la continuazione con aElabora; con «0» come prima', async () => {
    const h = revisione();
    await h.R.openCurrent();
    const o = h.calls.open[0];
    assert.equal(o.final, true);
    assert.deepEqual(json(o.continua), { aElabora: true });
    o.dopoChiusura();
    assert.equal(h.calls.torna, 1, '«più tardi»/ESC → tornaInElabora');
    await h.R.openCurrent({ alza: true });
    assert.equal(h.calls.open[1].alza, true, 'il piano chiesto al motore resta');
    assert.equal(typeof h.calls.open[1].dopoChiusura, 'function');

    const spento = revisione({ mappai_elabora_attesa: '0' });
    await spento.R.openCurrent();
    assert.deepEqual(json(spento.calls.open[0]), { final: true }, 'come prima');
});

test('B: la continuazione di default della revisione porta `continua` a Pipeline.run (le due strade, con e senza veste)', () => {
    const src = js('mappai-review.js');
    const conContinua = src.split('\n').filter(r => /\(resume \|\| hasResume\(\)\) && window\.MappAIPipelineCore\.hasOutput\(manifest\.config\)\) await window\.MappAIPipeline\.run\(manifest\.config, Object\.assign\(\{ only: \['B', 'C', 'D', 'E'\], vaultPath, manifest \}, options\.continua \|\| \{\}\)\)/.test(r));
    assert.equal(conContinua.length, 2);
    /* gate 0090 (Giacomo, «riporti sempre a ELABORA»): «Chiudi» senza niente da continuare fa la strada di «più tardi» */
    assert.equal(src.split('\n').filter(r => /^\s+else dopoChiusura\(\);/.test(r)).length, 2);
});

// ── parte B, C, D: la pipeline vera ────────────────────────────────────────────

function pipeline(opz = {}) {
    const dom = domFinto(), calls = { openProject: [], openFromMap: 0, aggiorna: 0, openCurrent: [] };
    const classi = [{ id: 'c1', name: '3A', notes: 'lenti nella lettura' }, { id: 'c2', name: '4B' }];
    const win = { t: (_k, f) => f, showToast() {}, showLoadingOverlay() {}, MappAIMaterialiAttesaCore: C,
        MappAIPipelineCore: require('../public/js/mappai-pipeline-core'),
        MappAIClasses: { list: () => classi, getActive: () => classi.find(c => c.id === opz.attiva) || null, get: id => classi.find(c => c.id === id) || null,
            classSpecial: c => !!(c && ((c.notes && String(c.notes).trim()) || c.register === 'semplice' || c.register === 'ricco')) },
        MappAIElabora: { openProject(id) { calls.openProject.push(id); }, openFromMap() { calls.openFromMap++; } },
        MappAIElaboraConsole: { aperta: () => !!opz.consoleAperta, aggiorna() { calls.aggiorna++; return true; } },
        MappAIReview: { enabled: () => true, openCurrent(o) { calls.openCurrent.push(o === undefined ? 'senza' : json(o)); } },
        MappAIAffermazioni: { quarantenaAccesa: () => !!opz.quarantena },
        localStorage: storage(opz.valori || {})
    };
    const st = { rootNodeLabel: 'Mappa', activeVaultPath: '/vault', db: { nodes: [], links: [], studySets: [] }, sources: [], _pipelineManifest: opz.manifest || null };
    const sandbox = { window: win, appState: st, document: dom.document, console: { log() {}, info() {}, warn() {}, error() {} },
        setTimeout, clearTimeout, localStorage: storage(opz.valori || {}), StorageManager: { currentProjectId: 'progetto-1' } };
    vm.runInNewContext(js('mappai-material-pipeline.js'), sandbox);
    return { P: win.MappAIPipeline, calls, dom, st };
}

test('B: tornaInElabora — console aperta: si aggiorna e basta; chiusa: la strada di B14 (openProject del progetto)', () => {
    const aperta = pipeline({ consoleAperta: true });
    assert.equal(aperta.P.tornaInElabora(), true);
    assert.equal(aperta.calls.aggiorna, 1);
    assert.deepEqual(aperta.calls.openProject, []);
    const chiusa = pipeline();
    assert.equal(chiusa.P.tornaInElabora(), true);
    assert.deepEqual(chiusa.calls.openProject, ['progetto-1']);
});

test('una strada sola: completaValidazione è openCurrent, con alza sotto quarantena; runApprovedMaterials la usa', () => {
    const q = pipeline({ quarantena: true });
    q.P.completaValidazione();
    assert.deepEqual(q.calls.openCurrent, [{ alza: true }]);
    const n = pipeline();
    n.P.completaValidazione();
    assert.deepEqual(n.calls.openCurrent, ['senza']);
    const src = js('mappai-material-pipeline.js');
    const corpo = src.slice(src.indexOf('Pipeline.runApprovedMaterials = async function'), src.indexOf('Pipeline._startFromModal = function'));
    assert.ok(corpo.includes('Pipeline.completaValidazione();'));
    assert.ok(!corpo.includes('openCurrent('), 'nessuna seconda chiamata diretta');
});

test('B: la coda di run apre ELABORA con aElabora; B14 (daCrea) resta com\'era', () => {
    const src = js('mappai-material-pipeline.js');
    assert.ok(src.includes("if (opts.aElabora === true && !aperto) aperto = _tornaInElabora();"));
    assert.ok(src.includes("if (dopoG2DaCrea) { _svuotaCrea(); if (!aperto) aperto = _apriElabora(); }"));
    assert.ok(src.includes("daCrea ? { dopoChiusura: () => _chiudiCrea() } : {},"));
    assert.ok(src.includes("const versoElabora = !daCrea && aElabora === true;"));
    assert.ok(src.includes("_finishReviewed(vaultPath, manifest, config, apiKey, counter, giro, Q, opts.daCrea === true, opts.aElabora === true)"));
});

test('C: con la G2 in attesa il modale da ELABORA dice l\'avviso, offre «Completa validazione» e non lascia avviare', () => {
    const h = pipeline({ manifest: manifesto(MC_FC_SYN) });
    h.P.openModal({ fromApproved: true });
    const d = h.dom.document;
    const box = d.getElementById('mp-g2-attesa');
    assert.ok(!!box, 'l\'avviso c\'è');
    assert.match(box.textContent, /aspettano la tua validazione/);
    assert.equal(d.getElementById('mp-start').disabled, true);
    assert.equal(d.getElementById('mp-start').style.cursor, 'not-allowed', '«Avvia» si vede spento');
    assert.equal(d.getElementById('mp-g2-attesa').style.opacity, undefined, 'l\'avviso resta pieno');
    const sezioni = d.querySelector('#mp-modal .space-y-3').children;   /* le sezioni del modale, non i corpi annidati */
    assert.ok(sezioni.length > 1);
    assert.ok(sezioni.filter(e => e.id !== 'mp-g2-attesa').every(e => e.style.opacity === '0.45'), 'le sezioni si vedono spente');
    assert.equal(d.getElementById('mp-quiz-on').disabled, true);
    assert.equal(d.getElementById('mp-g2-completa').disabled, false);
    d.getElementById('mp-g2-completa').click();
    assert.equal(!!d.getElementById('mp-modal'), false, 'il modale si chiude');
    assert.deepEqual(h.calls.openCurrent, ['senza']);
});

test('C: senza G2 in attesa, o con l\'interruttore a «0», il modale è quello di prima', () => {
    for (const [m, v] of [[manifesto(MC_FC_SYN, 'done'), {}], [manifesto(MC_FC_SYN), { mappai_elabora_attesa: '0' }]]) {
        const h = pipeline({ manifest: m, valori: v });
        h.P.openModal({ fromApproved: true });
        assert.equal(!!h.dom.document.getElementById('mp-g2-attesa'), false);
        assert.equal(h.dom.document.getElementById('mp-start').disabled, false);
    }
});

test('D: «Adatta alla classe» dice se la classe ha una taratura, e parte acceso solo se ce l\'ha', () => {
    const con = pipeline({ manifest: manifesto(MC_FC_SYN, 'done'), attiva: 'c1' });
    con.P.openModal({ fromApproved: true });
    const d = con.dom.document;
    assert.match(d.getElementById('mp-adapt-tar').textContent, /^La classe 3A ha una taratura/);
    assert.equal(d.getElementById('mp-adapt-on').checked, true);

    const senza = pipeline({ manifest: manifesto(MC_FC_SYN, 'done'), attiva: 'c2' });
    senza.P.openModal({ fromApproved: true });
    assert.match(senza.dom.document.getElementById('mp-adapt-tar').textContent, /^La classe 4B non ha una taratura/);
    assert.equal(senza.dom.document.getElementById('mp-adapt-on').checked, false);
});

test('D: con «mappai_modale_taratura» a «0» il riquadro è quello di prima', () => {
    const h = pipeline({ manifest: manifesto(MC_FC_SYN, 'done'), attiva: 'c1', valori: { mappai_modale_taratura: '0' } });
    h.P.openModal({ fromApproved: true });
    assert.equal(!!h.dom.document.getElementById('mp-adapt-tar'), false);
});

test('D: il profilo della classe non si tocca dal modale', () => {
    const src = js('mappai-material-pipeline.js');
    const parte = src.slice(src.indexOf('function _tarAcceso()'), src.indexOf('function _scriviTaratura()') + 600);
    assert.ok(!/MappAIClasses\.(save|update|set|upsert)/.test(parte));
});

// ── 0094, lotto F: il difetto 9 della guida (ELABORA giudicava «in attesa» il progetto sbagliato) ─────

test('F2 core: il manifesto conta solo per il suo progetto (id o cartella); senza progetto come prima', () => {
    const m = (pid, vp) => Object.assign(manifesto(MC_FC_SYN), { vaultPath: vp, review: Object.assign(manifesto(MC_FC_SYN).review, { projectId: pid, vaultPath: vp }) });
    const el = { projectId: 'proj_1791852544512', vaultPath: '/Mappe/4R/Scienze/Elettricità' };
    assert.equal(C.diQuestoProgetto(m('proj_1791886237327', '/Mappe/4R/Scienze/Circuiti e grandezze'), el), false, 'il manifesto di «Circuiti» non è di «Elettricità»');
    assert.equal(C.g2InAttesa(m('proj_1791886237327', '/Mappe/4R/Scienze/Circuiti e grandezze'), el), false);
    assert.equal(C.righe(m('proj_1791886237327', '/Mappe/4R/Scienze/Circuiti e grandezze'), el).length, 0);
    assert.equal(C.diQuestoProgetto(m('proj_1791852544512', '/Mappe/4R/Scienze/Vecchio nome'), el), true, 'rinominata dal Finder: l\'id basta');
    assert.equal(C.diQuestoProgetto(m('proj_altro', '/Mappe/4R/Scienze/Elettricità/'), el), true, 'copia di prova: la cartella basta');
    assert.equal(C.diQuestoProgetto(manifesto(MC_FC_SYN), el), true, 'manifesto vecchio, senza id né cartella');
    assert.equal(C.g2InAttesa(m('x', '/y')), true, 'senza progetto: come prima');
});

function due(opz) {
    /* «Circuiti e grandezze» caricato (G2 aperta), «Elettricità» scelta (G2 chiusa sul disco) */
    const CIRC = '/Mappe/4R/Scienze/Circuiti e grandezze', EL = '/Mappe/4R/Scienze/Elettricità';
    const mCirc = Object.assign(manifesto(MC_FC_SYN), { vaultPath: CIRC }); mCirc.review.projectId = 'proj_circ'; mCirc.review.vaultPath = CIRC;
    const mEl = Object.assign(manifesto(MC_FC_SYN, 'done'), { vaultPath: EL }); mEl.review.projectId = 'proj_el'; mEl.review.vaultPath = EL;
    const h = console0090(opz.memoria === 'circ' ? mCirc : mEl);
    h.state.activeVaultPath = opz.attiva === 'el' ? EL : CIRC;
    h.g.StorageManager = { currentProjectId: opz.attiva === 'el' ? 'proj_el' : 'proj_circ' };
    vm.runInNewContext('var StorageManager = window.StorageManager;', h.g);
    h.g.electronAPI.vaultMaterialsList = async ({ vaultPath }) => ({ files: [], manifest: vaultPath === EL ? mEl : mCirc });
    const mappe = [{ id: 'v:' + CIRC, nome: 'Circuiti e grandezze', v: { fullPath: CIRC, extractionMode: 'mindmap', folderName: 'Circuiti e grandezze' } },
        { id: 'v:' + EL, nome: 'Elettricità', v: { fullPath: EL, extractionMode: 'mindmap', folderName: 'Elettricità' } }];
    h.g.MappAITeach.mappeDelContesto = async () => mappe;
    h.g.MappAITeach.apriMappa = opz.apriMappa || (() => false);
    let spec = null;
    h.g.MappAIConsoleBento = { specContesto: () => [{ et: 'Elabora' }, { et: '4R' }, { et: 'Scienze' }], montaPercorso: (_box, s) => { spec = s; } };
    return Object.assign(h, { EL, CIRC, mappe, spec: () => spec });
}

test('F2: «Elettricità» aperta col manifesto di «Circuiti» rimasto in memoria → nessuna riga in attesa, «Più materiali insieme» libero', async () => {
    const h = due({ attiva: 'el', memoria: 'circ' });
    await h.open();
    const ids = h.tabelle().flatMap(t => t.righe.map(r => r.id));
    assert.ok(!ids.some(id => /att:/.test(id)), ids.join(' '));
    assert.match(h.g.MappAIElaboraConsole.tipi.find(x => x.id === 'batch').desc(), /in un giro solo/);
    await h.close();
});

test('F2: «Circuiti» aperta col suo manifesto → le righe in attesa ci sono ancora', async () => {
    const h = due({ attiva: 'circ', memoria: 'circ' });
    await h.open();
    const ids = h.tabelle().flatMap(t => t.righe.map(r => r.id));
    assert.ok(ids.includes('m:att:syn'), ids.join(' '));
    await h.close();
});

test('F2: il modale «Genera materiali» non si spegne per il manifesto di un altro progetto', () => {
    const m = manifesto(MC_FC_SYN); m.review.projectId = 'proj_circ'; m.vaultPath = '/circuiti';
    const h = pipeline({ manifest: m });
    h.P.openModal({ fromApproved: true });
    assert.equal(!!h.dom.document.getElementById('mp-g2-attesa'), false, 'nessun avviso: il manifesto è di «Circuiti», aperta è «/vault»');
});

test('F3: se il caricamento del progetto scelto non riesce, la briciola torna al progetto davvero aperto', async () => {
    const h = due({ attiva: 'circ', memoria: 'circ' });
    await h.open();
    const ultimo = () => { const l = h.spec().livelli; return l[l.length - 1]; };
    assert.equal(ultimo().et || ultimo().statico, 'Circuiti e grandezze');
    /* il clic su «Elettricità» nella colonna: apriMappa dice di no */
    const sch = h.g.MappAIElaboraConsole.schema();
    assert.ok(sch.nav.some(v => v.id === 'prog:v:' + h.EL));
    await h.navVoce('prog:v:' + h.EL);
    assert.equal(ultimo().et || ultimo().statico, 'Circuiti e grandezze', 'la briciola dice il progetto aperto, non quello rifiutato');
    await h.close();
});

test('0094 S7: la briciola del progetto in ELABORA porta «Rinomina…» in fondo, ma non per una lettura', async () => {
    for (const lettura of [false, true]) {
        const h = due({ attiva: 'circ', memoria: 'circ' });
        h.g.MappAITeach.perRinomina = m => ({ vaultPath: m.v.fullPath, nome: m.v.folderName, lettura });
        await h.open();
        const l = h.spec().livelli, ultimo = l[l.length - 1];
        /* 0124: le azioni in fondo al menu sono un elenco («Rinomina…», poi «Riassegna…» e «Copia…») */
        const azioni = [].concat((ultimo.menu && ultimo.menu.nuovo) || []);
        if (lettura) assert.equal(azioni.length, 0, 'lettura: niente «Rinomina…»');
        else assert.equal(azioni[0].et, 'Rinomina…');
        await h.close();
    }
});
