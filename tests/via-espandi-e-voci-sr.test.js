'use strict';
/*
 * via-espandi-e-voci-sr.test.js — packet 0083 (con lo 0084 fuso), 07/10/2026.
 *
 * PERCHÉ esiste. Dal menu del nodo partivano due strade che mettevano testo
 * dell'AI nella mappa o generavano materiali dalla mappa senza passare dal Banco:
 * «Espandi da Fonte» (nodi nuovi scritti dal modello, subito nella mappa) e le
 * quattro voci «Spaced Repetition» (quiz e flashcard da `n.desc`, cioè un
 * materiale da un materiale: inv. 22, ADR 0012). Giacomo le ha tolte, con la
 * finestra «Configura Quiz» che solo loro aprivano. Qui si prova che non tornano.
 *
 * Una cosa RESTA apposta: `closeStudyConfigModal`. Il reader dell'iPad copia
 * `mappai-study-session.js` e ha un `#study-config-modal` vuoto con l'attributo
 * `hidden` (non la classe): il primo Esc di `app.js` la chiama.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const leggi = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');
const SILENZIO = { log() { }, info() { }, warn() { }, error() { } };

/* ── 1. Il menu del nodo ─────────────────────────────────────────────────── */

const TOLTE = ['expand_ai', 'generate_flashcard', 'generate_flashcard_branch', 'test_flashcard', 'test_flashcard_branch'];

function menu({ studentMode = false, extractionMode = 'mindmap' } = {}) {
    const chiamate = [];
    const el = { innerHTML: '', offsetHeight: 300, style: {}, classList: { add() { }, remove() { } } };
    const spia = nome => (...a) => { chiamate.push(nome); };
    const g = {
        console: SILENZIO, innerWidth: 1280, innerHeight: 800,
        document: { getElementById: id => (id === 'context-menu' ? el : null), addEventListener() { } },
        appState: { db: { nodes: [], links: [] }, studentMode, extractionMode },
        t: (k, f) => f, safeCreateIcons() { },
        // se una voce tolta tornasse, chiamerebbe una di queste
        openContextualAIExtensionModal: spia('openContextualAIExtensionModal'),
        openStudyConfigModal: spia('openStudyConfigModal')
    };
    g.window = g; g.self = g;
    vm.createContext(g);
    vm.runInContext(leggi('public', 'js', 'mappai-context-menu.js'), g);
    const nodo = { id: 'n1', label: 'Tema', level: 1 };
    const evento = { preventDefault() { }, stopPropagation() { }, clientX: 10, clientY: 10 };
    g.window.showContextMenu(evento, 'node', nodo);
    const azioni = [...el.innerHTML.matchAll(/ctxAction\('([a-z_]+)'\)/g)].map(m => m[1]);
    return { g, el, azioni, chiamate, evento, nodo };
}

for (const studentMode of [false, true]) {
    test(`menu del nodo (${studentMode ? 'studente' : 'docente'}): né «Espandi da Fonte» né «Spaced Repetition»`, () => {
        const m = menu({ studentMode });
        for (const a of TOLTE) assert.ok(!m.azioni.includes(a), `azione tolta ancora nel menu: ${a}`);
        assert.ok(!/Spaced Repetition/.test(m.el.innerHTML), 'intestazione «Spaced Repetition» ancora nel menu');
        assert.ok(!/Espandi da Fonte/.test(m.el.innerHTML));
    });
}

// Le voci tolte erano le sole nascoste allo studente: dopo, il menu del nodo è lo
// stesso per docente e studente (prima il docente ne aveva cinque in più).
for (const extractionMode of ['mindmap', 'kg']) {
    test(`menu del nodo (${extractionMode}): docente e studente vedono le stesse voci`, () => {
        assert.deepEqual(menu({ studentMode: true, extractionMode }).azioni, menu({ studentMode: false, extractionMode }).azioni);
    });
}

test('menu del nodo (docente, MindMap): le altre voci restano tutte', () => {
    const m = menu();
    for (const a of ['tts', 'rsvp', 'status_todo', 'status_review', 'status_done', 'status_none',
        'edit', 'rename', 'add_child', 'link', 'merge', 'relink', 'delete_node']) {
        assert.ok(m.azioni.includes(a), `voce sparita: ${a}`);
    }
    assert.ok(/Editor Mappa/.test(m.el.innerHTML));
});

test('ctxAction con le cinque azioni tolte: non lancia e non apre niente', () => {
    const m = menu();
    for (const a of TOLTE) {
        m.g.window.showContextMenu(m.evento, 'node', m.nodo);   // ctxTarget parte null
        assert.doesNotThrow(() => m.g.window.ctxAction(a), a);
    }
    assert.deepEqual(m.chiamate, []);
});

/* ── 2. La sessione di studio senza «Configura Quiz» ─────────────────────── */

function sessione(modale) {
    const g = {
        console: SILENZIO, setTimeout: f => f(), clearTimeout() { }, setInterval() { return 0; }, clearInterval() { },
        document: { getElementById: id => (id === 'study-config-modal' ? modale : null), querySelectorAll: () => [], addEventListener() { } },
        appState: { db: { nodes: [], links: [], studySets: [] } },
        t: (k, f) => f
    };
    g.window = g; g.self = g;
    vm.createContext(g);
    vm.runInContext(leggi('public', 'js', 'mappai-study-session.js'), g);
    return g;
}

test('sessione di studio: le funzioni della finestra «Configura Quiz» non ci sono più', () => {
    const g = sessione(null);
    for (const f of ['openStudyConfigModal', 'selectStudyQuantity', 'startStudySession', 'generateGlobalQuiz', 'generateGlobalFlashcards']) {
        assert.equal(typeof g.window[f], 'undefined', `${f} c'è ancora`);
    }
    for (const f of ['generateDynamicQuiz', 'openStudyPlayer', 'regenerateActiveSet', 'recordStudySessionOnBus']) {
        assert.equal(typeof g.window[f], 'function', `${f} è sparita`);
    }
    assert.equal(typeof g.window.studyConfig, 'object');
});

test('sessione di studio: closeStudyConfigModal resta e chiude il segnaposto del reader senza lanciare', () => {
    const classi = new Set();
    const modale = { classList: { add: (...c) => c.forEach(x => classi.add(x)), remove: (...c) => c.forEach(x => classi.delete(x)) } };
    const g = sessione(modale);
    assert.equal(typeof g.window.closeStudyConfigModal, 'function');
    assert.doesNotThrow(() => g.window.closeStudyConfigModal());
    assert.ok(classi.has('hidden'), 'dopo la chiusura il segnaposto ha la classe hidden');
});

/* ── 3. index.html e il modulo ───────────────────────────────────────────── */

test('il modulo di «Espandi da Fonte» non esiste più', () => {
    assert.equal(fs.existsSync(path.join(ROOT, 'public', 'js', 'mappai-contextual-ai.js')), false);
});

test('index.html: niente finestre «Espandi» e «Configura Quiz», niente script del modulo; il player resta', () => {
    const html = leggi('public', 'index.html');
    assert.ok(!/id="contextual-ai-extension-modal"/.test(html), '#contextual-ai-extension-modal ancora in index.html');
    assert.ok(!/id="study-config-modal"/.test(html), '#study-config-modal ancora in index.html');
    assert.ok(!/mappai-contextual-ai\.js/.test(html), 'script mappai-contextual-ai.js ancora in index.html');
    assert.ok(/id="study-player-modal"/.test(html), '#study-player-modal sparito');
});

/* ── 4. I dizionari ──────────────────────────────────────────────────────── */

function dizionari() {
    const ctx = vm.createContext({});
    for (const f of ['it_translations.js', 'en_translations.js']) vm.runInContext(leggi('public', 'traduzioni', f), ctx);
    return { it: vm.runInContext('it_translations', ctx), en: vm.runInContext('en_translations', ctx) };
}

const CHIAVI_COPPIA = ['ui_node_to_expand', 'ctx_exp_tab_text', 'ui_load_pdf', 'ctx_exp_desc_text', 'ui_select_pdf',
    'ui_pdf_local_extract', 'ui_choose_file', 'ui_expand', 'ctx_exp_title', 'ctx_exp_ph_text', 'ctx_expand',
    'ui_config_session', 'ui_how_study', 'ui_quiz_type', 'ui_multiple_choice', 'ui_true_false', 'ui_open_answer',
    'ui_quiz_angle', 'ui_quantity', 'ui_fluency_timer', 'ctx_flashcard_nodo', 'ctx_flashcard_ramo', 'ctx_quiz_nodo',
    'ctx_quiz_ramo'];
const CHIAVI_SOLO_EN = ['ctx_expand_source', 'tst_no_new_concepts', 'tst_expand_done', 'tst_expand_parziale',
    'tst_gen_empty', 'tst_no_study_content'];

test('dizionari: le chiavi usate solo dal codice tolto non ci sono più, né in it né in en', () => {
    const { it, en } = dizionari();
    const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
    const restano = [
        ...CHIAVI_COPPIA.filter(k => own(it, k)).map(k => 'it:' + k),
        ...CHIAVI_COPPIA.concat(CHIAVI_SOLO_EN).filter(k => own(en, k)).map(k => 'en:' + k)
    ];
    assert.deepEqual(restano, []);
    // e quelle che hanno altri chiamanti restano
    for (const k of ['btn_cancel']) { assert.ok(own(it, k) && own(en, k), k); }
    for (const k of ['lo_study_gen', 'tst_key_in_settings', 'tst_set_no_material']) assert.ok(own(en, k), k);
});

test('i testi non indicano più comandi che non ci sono', () => {
    const { it, en } = dizionari();
    const sr = leggi('public', 'js', 'mappai-flashcards-sr.js');
    const ripiego = (sr.match(/t\('tst_set_no_material',\s*"([^"]*)"\)/) || [])[1];
    assert.ok(ripiego, 'ripiego italiano di tst_set_no_material non trovato');
    const testi = {
        'it.guide_step5_desc': it.guide_step5_desc, 'en.guide_step5_desc': en.guide_step5_desc,
        'it.study_sr_desc': it.study_sr_desc, 'en.study_sr_desc': en.study_sr_desc,
        'en.tst_set_no_material': en.tst_set_no_material, 'it.tst_set_no_material (ripiego)': ripiego
    };
    for (const [dove, s] of Object.entries(testi)) {
        assert.equal(typeof s, 'string', dove);
        assert.ok(!/espansione|expand|tasto destro|right-click|nodo\/ramo|node\/branch/i.test(s), `${dove}: «${s}»`);
    }
    assert.match(it.study_sr_desc, /Crea nuovo/);
    assert.match(en.study_sr_desc, /New document/);
    assert.match(ripiego, /Crea nuovo/);
    assert.match(en.tst_set_no_material, /New document/);
});
