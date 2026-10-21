'use strict';
/*
 * piccoli-difetti-0110.test.js — packet 0110 (Giacomo 17/10, D1-D4).
 * Tre difetti piccoli, ciascuno con la sua prova:
 *  1. ELABORA aggancia il file di un materiale (set, Sintesi, Analisi della
 *     fonte) a qualunque carattere sia stato scritto: `_nomiAttesi` costruiva
 *     il nome col carattere ATTUALE dell'app e lo confrontava esatto. Il banco
 *     `consoleVera` di clona-core.test.js lasciava il carattere vuoto, ed è per
 *     questo che la suite non lo vedeva: qui il carattere è «Space Mono» e i
 *     file sul disco sono in «Atkinson Hyperlegible», come sul vault vero.
 *  2. INSEGNA: per una lettura il primo bottone dice «Lettura».
 *  3. CREA: coi soli fogli dei nodi automatici il suggerimento del bottone
 *     dice che escono anche i fogli.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const giro = () => new Promise(r => setImmediate(r));

// ── 1. ELABORA ──────────────────────────────────────────────────────────────
/* La console VERA in una vm coi core veri, come `consoleVera` di
   clona-core.test.js, più il carattere dell'app e l'archivio dei documenti. */
const MAPPA = '1a Guerra Mondiale';
function consoleVera(sets, o) {
    const g = {
        console: { log() { }, info() { }, warn() { }, error() { } },
        localStorage: { getItem: () => null, setItem() { }, removeItem() { } },
        sessionStorage: { getItem: () => null, setItem() { }, removeItem() { } },
        setTimeout, clearTimeout,
        appState: {
            sources: [], rootNodeLabel: MAPPA, activeVaultPath: '/prova/vault',
            db: { nodes: [{ id: 'r', label: MAPPA, level: 0 }], links: [], studySets: sets }
        },
        electronAPI: { vaultMaterialsList: async () => ({ ok: true, files: o.disco }) },
        MappAIStudyDocs: { list: () => o.docs || [], get: () => null }
    };
    g.window = g;
    const ctx = vm.createContext(g);
    ['mappai-files-core.js', 'mappai-pipeline-core.js', 'mappai-docedit-core.js', 'mappai-clona-core.js', 'mappai-elabora-console.js']
        .forEach(f => vm.runInContext(read('public/js/' + f), ctx));
    g.MappAIPipelineCore.setFontEtichetta(o.font === undefined ? 'Space Mono' : o.font);
    return g;
}
async function righe(sets, o) {
    const g = consoleVera(sets, o);
    g.MappAIElaboraConsole.materiali();                      // avvia la lettura del disco (asincrona)
    for (let i = 0; i < 5; i++) await giro();
    return JSON.parse(JSON.stringify(g.MappAIElaboraConsole.materiali()));
}
const file = (name, mtime) => ({ name, relPath: 'Materiale Studio/' + name, mtime: mtime || 1 });
const setMC = (id, clone) => ({ id, title: MAPPA + ' — Scelta Multipla · ' + clone, type: 'Scelta Multipla', mode: 'quiz',
    clone, angle: clone, date: '2026-10-10', items: [{ question: 'Q?', options: ['A', 'B'], correctIndex: 0 }] });
const relDi = (rr, id) => (rr.find(r => r.id === id) || {}).relPath;

test('0110 difetto 1: il quiz «causa» scritto in Atkinson si aggancia con l\'app in Space Mono (il caso del vault vero)', async () => {
    const rr = await righe([setMC('causa', 'causa'), setMC('def', 'definizione')], { disco: [
        file('Quiz-MC-1a Guerra Mondiale-causa - Atkinson Hyperlegible.pdf'),
        file('Quiz-MC-1a Guerra Mondiale-definizione - Atkinson Hyperlegible.pdf')] });
    assert.equal(relDi(rr, 'set:causa'), 'Materiale Studio/Quiz-MC-1a Guerra Mondiale-causa - Atkinson Hyperlegible.pdf');
    assert.equal(relDi(rr, 'set:def'), 'Materiale Studio/Quiz-MC-1a Guerra Mondiale-definizione - Atkinson Hyperlegible.pdf');
});

test('0110 D1: lo stesso documento in due caratteri — vince quello attuale, se no il più recente', async () => {
    const conAttuale = await righe([setMC('causa', 'causa')], { disco: [
        file('Quiz-MC-1a Guerra Mondiale-causa - Atkinson Hyperlegible.pdf', 9),
        file('Quiz-MC-1a Guerra Mondiale-causa - Space Mono.pdf', 1)] });
    assert.equal(relDi(conAttuale, 'set:causa'), 'Materiale Studio/Quiz-MC-1a Guerra Mondiale-causa - Space Mono.pdf');
    const senzaAttuale = await righe([setMC('causa', 'causa')], { disco: [
        file('Quiz-MC-1a Guerra Mondiale-causa - TM Sans.pdf', 3),
        file('Quiz-MC-1a Guerra Mondiale-causa - Atkinson Hyperlegible.pdf', 7)] });
    assert.equal(relDi(senzaAttuale, 'set:causa'), 'Materiale Studio/Quiz-MC-1a Guerra Mondiale-causa - Atkinson Hyperlegible.pdf');
});

test('0110: i file di prima — senza carattere nel nome, e col « -VERDE» storico — si agganciano ancora', async () => {
    const nudo = await righe([setMC('causa', 'causa')], { disco: [file('Quiz-MC-1a Guerra Mondiale-causa.pdf')] });
    assert.equal(relDi(nudo, 'set:causa'), 'Materiale Studio/Quiz-MC-1a Guerra Mondiale-causa.pdf');
    const verde = await righe([setMC('causa', 'causa')], { disco: [file('Quiz-MC-1a Guerra Mondiale-causa - Atkinson Hyperlegible -VERDE.pdf')] });
    assert.equal(relDi(verde, 'set:causa'), 'Materiale Studio/Quiz-MC-1a Guerra Mondiale-causa - Atkinson Hyperlegible -VERDE.pdf');
});

test('0110 D2: anche la Sintesi e l\'Analisi della fonte in un altro carattere si agganciano', async () => {
    const rr = await righe([], {
        docs: [{ id: 'sy1', kind: 'synthesis', title: 'Sintesi della mappa', mapName: MAPPA, hasHtml: true, date: '2026-10-10' },
               { id: 'an1', kind: 'analisi', title: 'Analisi', mapName: MAPPA, hasHtml: true, date: '2026-10-10' }],
        disco: [file('Sintesi-1a Guerra Mondiale - Atkinson Hyperlegible.html'),
                file('Analisi-fonte-1a Guerra Mondiale - Atkinson Hyperlegible.pdf')] });
    assert.equal(relDi(rr, 'syn:sy1'), 'Materiale Studio/Sintesi-1a Guerra Mondiale - Atkinson Hyperlegible.html');
    assert.equal(relDi(rr, 'an:an1'), 'Materiale Studio/Analisi-fonte-1a Guerra Mondiale - Atkinson Hyperlegible.pdf');
});

test('0110 (guardia): una copia col suo nome non ruba il file dell\'originale, e due set con lo stesso nome non agganciano', async () => {
    const orig = { id: 'o', title: MAPPA + ' — Scelta Multipla', type: 'Scelta Multipla', mode: 'quiz', date: '2026-10-10',
        items: [{ question: 'Q?', options: ['A', 'B'], correctIndex: 0 }] };
    const rr = await righe([orig, setMC('causa', 'causa')], { disco: [file('Quiz-MC-1a Guerra Mondiale - Atkinson Hyperlegible.pdf')] });
    assert.equal(relDi(rr, 'set:o'), 'Materiale Studio/Quiz-MC-1a Guerra Mondiale - Atkinson Hyperlegible.pdf');
    assert.equal(relDi(rr, 'set:causa'), undefined);
    const doppi = await righe([setMC('a', 'causa'), setMC('b', 'Causa')], { disco: [file('Quiz-MC-1a Guerra Mondiale-causa - Atkinson Hyperlegible.pdf')] });
    assert.equal(relDi(doppi, 'set:a'), undefined);
    assert.equal(relDi(doppi, 'set:b'), undefined);
});

// ── 2. INSEGNA ──────────────────────────────────────────────────────────────
/* Il sorgente di una funzione del modulo, per nome, con le graffe contate
   (stringhe e commenti saltati). */
function funzione(src, nome) {
    const da = src.indexOf('function ' + nome + '(');
    assert.ok(da >= 0, nome + ' non trovata');
    let i = src.indexOf('{', da), prof = 0;
    for (; i < src.length; i++) {
        const c = src[i];
        if (c === '/' && src[i + 1] === '/') { i = src.indexOf('\n', i); continue; }
        if (c === '/' && src[i + 1] === '*') { i = src.indexOf('*/', i) + 1; continue; }
        if (c === '\'' || c === '"') { for (i++; src[i] !== c; i++) if (src[i] === '\\') i++; continue; }
        if (c === '{') prof++;
        if (c === '}' && --prof === 0) return src.slice(da, i + 1);
    }
    throw new Error(nome + ': graffe non chiuse');
}
function bentoInsegna(p) {
    const src = read('public/js/mappai-landing-teach.js');
    const g = {
        _t: (k, f) => f, _scambioOn: () => true, _cons: { materiali: [] }, _consTabelleMateriali: () => [], _consTabellaConsegne: () => null,
        window: {}
    };
    vm.createContext(g);
    vm.runInContext(funzione(src, '_letturaDi') + '\n' + funzione(src, '_consBentoMappa'), g);
    const s = {};
    g._consBentoMappa(s, p);
    return s.bento[0].voci[0];
}

test('0110 D3: INSEGNA — per una lettura il primo bottone dice «Lettura», per una mappa «Mappa»', () => {
    const lettura = bentoInsegna({ id: 'p', type: 'lettura', v: { extractionMode: 'lettura' } });
    assert.equal(lettura.id, 'apri', 'il clic resta quello di oggi');
    assert.equal(lettura.et, 'Lettura');
    assert.equal(lettura.aiuto, 'Apre la lettura in ELABORA.');
    assert.equal(lettura.icona, 'book-open');
    const mappa = bentoInsegna({ id: 'p', type: 'mindmap', v: { extractionMode: 'mindmap' } });
    assert.equal(mappa.et, 'Mappa');
    assert.equal(mappa.aiuto, 'Apre la visualizzazione della mappa.');
});

test('0110 D3: INSEGNA — anche la vista senza bento (oggi non raggiungibile) dice «Lettura» per una lettura', () => {
    const corpo = funzione(read('public/js/mappai-landing-teach.js'), '_consSchema');
    const riga = corpo.split('\n').find(r => /id: 'apri'/.test(r)) || '';
    assert.match(riga, /lt_cons_apri_lettura/);
    assert.match(riga, /book-open/);
});

test('0110: le chiavi nuove in inglese', () => {
    const en = read('public/traduzioni/en_translations.js');
    for (const k of ['lt_cons_apri_lettura', 'lt_cons_tip_apri_lettura', 'mn_solo_fogli_tip']) assert.match(en, new RegExp('\\b' + k + ':'));
});

// ── 3. CREA ─────────────────────────────────────────────────────────────────
/* Il banco `crea()` di crea-solo-mappa.test.js (bento VERO su un DOM cheerio),
   preso dal suo sorgente per non tenerne una seconda copia. */
function bancoCrea() {
    const src = read('tests/crea-solo-mappa.test.js');
    const da = src.indexOf('function sorgenteContesto');
    const a = src.indexOf('/* ── i due ingressi');
    assert.ok(da > 0 && a > da, 'il banco di crea-solo-mappa.test.js è cambiato');
    return new Function('require', 'read', 'vm', 'assert', 'cheerio', src.slice(da, a) + '\nreturn crea;')(
        require, read, vm, assert, require('cheerio'));
}

test('0110 D4: CREA — coi soli fogli automatici il suggerimento dice che escono anche i fogli', () => {
    const crea = bancoCrea();
    const c = crea({ materiali: true });
    c.w.MappAIPipeline._soloFogliNow = () => true;
    c.scegli('mp-chi', 'c:cls_1');
    c.w.MappAICostruisci.aggiornaGate();
    const b = c.w.document.getElementById('mn-genera');
    assert.equal(b.querySelector('span').textContent, 'Genera Mappa');
    assert.equal(b.title, 'Genera Mappa — solo i fogli dei nodi automatici: genera la mappa e i fogli');
    assert.equal(b.getAttribute('aria-label'), b.title);
    /* senza nessun materiale resta il suggerimento di oggi */
    const c2 = crea();
    c2.scegli('mp-chi', 'c:cls_1');
    c2.w.MappAICostruisci.aggiornaGate();
    assert.equal(c2.w.document.getElementById('mn-genera').title, 'Genera Mappa — nessun materiale spuntato: genera la sola mappa');
});

test('0110 D6 (gate 3): CREA — l\'avviso della voce prende tutta la riga del box e il corpo delle etichette dei materiali', () => {
    const html = read('public/index.html');
    const regola = (html.match(/#mn-voce-riga\s*\{[^}]*\}/) || [''])[0];
    assert.match(regola, /grid-column:\s*1\s*\/\s*-1/, 'una riga intera della griglia a tre colonne, non una cella');
    assert.match(regola, /font-size:\s*var\(--bn-fs-voce\)/, 'lo stesso corpo delle etichette (.mn-op span)');
    /* le etichette usano proprio quel token */
    assert.match(read('public/css/mappai-stile-manifesto.css'), /\.manifesto \.mn-op span \{[^}]*font-size: var\(--bn-fs-voce\)/);
    /* la riga è ancora dentro la griglia delle spunte, subito dopo «Voce naturale» */
    assert.match(read('public/js/mappai-costruisci-manifesto.js'), /v\.id === 'mp-syn-audio' \? rigaVoce\(\)/);
});

test('0110 D5 (gate 3): CREA — il bottone è blu appena il box dei materiali è vuoto, anche senza «Chi», e torna verde con una spunta', () => {
    const crea = bancoCrea();
    const c = crea();                                        // nessun materiale, «Chi» non scelto
    const b = c.w.document.getElementById('mn-genera');
    c.w.MappAICostruisci.aggiornaGate();
    assert.equal(b.classList.contains('mn-card--mappa'), true, 'blu senza «Chi»');
    assert.equal(b.classList.contains('mn-card--spento'), true, 'ma spento: il riquadro giallo non è completo');
    assert.equal(b.querySelector('span').textContent, 'Genera Mappa');
    assert.equal(b.title, 'Genera Mappa — Scegli prima CHI: una classe o un allievo');
    /* i soli fogli automatici contano come box vuoto */
    c.w.MappAIPipeline._hasOutputNow = () => true;
    c.w.MappAIPipeline._soloFogliNow = () => true;
    c.w.MappAICostruisci.aggiornaGate();
    assert.equal(b.classList.contains('mn-card--mappa'), true, 'blu coi soli fogli, senza «Chi»');
    /* una spunta nel box: torna verde, sempre spento */
    c.w.MappAIPipeline._soloFogliNow = () => false;
    c.w.MappAICostruisci.aggiornaGate();
    assert.equal(b.classList.contains('mn-card--mappa'), false, 'verde con una spunta');
    assert.equal(b.classList.contains('mn-card--spento'), true);
    assert.equal(b.querySelector('span').textContent, 'Genera materiali');
});
