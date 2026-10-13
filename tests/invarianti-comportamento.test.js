'use strict';
/*
 * invarianti-comportamento.test.js — i dati che arrivano davvero (25/9/26).
 *
 * PERCHÉ esiste questo file. L'audit del 25/9/26 ha trovato siti che sbagliavano
 * in silenzio: nessuno lanciava un errore, si vedevano solo come dati che non
 * arrivavano. Qui si prova che il dato arriva dove deve. Ogni prova falliva prima
 * della sua correzione; dove invece si fissa un comportamento rimasto identico
 * apposta, lo dice il commento sopra la prova.
 *
 * Il trucco comune: nell'app `appState` è un `let` e `StorageManager` una `const`
 * LESSICALI, e su `window` non ci sono (su `window.StorageManager` c'è anzi la
 * classe nativa di Chromium). In una sandbox `vm` un `let` dichiarato con
 * `runInContext` è lessicale allo stesso modo: il modulo lo vede per nome, e
 * `window.appState` resta undefined come nel renderer vero.
 */
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const leggi = f => fs.readFileSync(path.join(__dirname, '..', 'public', 'js', f), 'utf8');
const SILENZIO = { log() { }, warn() { }, error() { }, info() { } };
const giro = async () => { for (let k = 0; k < 5; k++) await new Promise(r => setImmediate(r)); };

/* ── Invariante 3: StorageManager lessicale ───────────────────────────────── */

test('consumi: il projectId viene dallo StorageManager lessicale, non dalla classe nativa su window', () => {
    const cassetto = {};
    const localStorage = { getItem: k => (k in cassetto ? cassetto[k] : null), setItem: (k, v) => { cassetto[k] = String(v); } };
    // come in Chromium: su window c'è la classe nativa, che non ha currentProjectId
    const window = { localStorage, StorageManager: function StorageManager() { } };
    new Function('window', 'localStorage', 'appState', 'StorageManager', leggi('mappai-usage-tracker.js'))(
        window, localStorage, { rootNodeLabel: 'Il Clima' }, { currentProjectId: 'proj_42' });
    window.MappAIUsage.record({ provider: 'google', model: 'gemini', inTok: 10, outTok: 5 });
    const riga = JSON.parse(cassetto.mappai_usage_log)[0];
    assert.strictEqual(riga.projectId, 'proj_42', 'era sempre null: il cruscotto Consumi non sapeva di che progetto fosse');
    assert.strictEqual(riga.project, 'Il Clima');
});

/* ── Invariante 3: appState lessicale ─────────────────────────────────────── */

test('prompt disciplinare: il grado del profilo entra nel prompt', () => {
    const window = { fillPromptTemplate: (chiave, variabili) => 'Storia.' + variabili.profile };
    const ctx = vm.createContext({ window, document: { addEventListener() { } }, setTimeout() { }, console: SILENZIO });
    vm.runInContext('let appState = { userProfile: { grade: "3a Media" } };', ctx);
    vm.runInContext(leggi('mappai-disciplines.js'), ctx);
    window.activeDiscipline = 'storia';
    assert.match(window.buildDisciplineSystemPrompt(), /scuola media/, 'il grado non entrava mai');
    // un grado salvato come numero non deve fermare la generazione (il ramo è nuovo)
    vm.runInContext('appState.userProfile.grade = 3;', ctx);
    assert.strictEqual(window.buildDisciplineSystemPrompt(), 'Storia.');
});

test('cartella documenti: dopo la migrazione la mappa aperta punta alla cartella NUOVA', async () => {
    const VECCHIA = '/Users/x/Documents/MappAI - Vault/Il Clima';
    const NUOVA = '/Users/x/Documenti/MappAI - file/Mappe/Il Clima';
    /* Un DOM di cartone: il modulo scrive l'HTML delle sue finestre e poi ne
       cerca i bottoni per classe; basta rispondere a quelle domande. */
    const finestre = [];
    function finestra() {
        const e = { style: {}, html: '', figli: {}, addEventListener() { }, remove() { } };
        Object.defineProperty(e, 'innerHTML', { get: () => e.html, set: v => { e.html = v; } });
        e.querySelector = sel => {
            const cls = sel.replace(/^\./, '');
            if (!e.html.includes('class="' + cls + '"')) return null;
            return e.figli[cls] || (e.figli[cls] = { onclick: null, checked: true, disabled: false, textContent: '' });
        };
        finestre.push(e);
        return e;
    }
    const window = {
        showToast() { },
        electronAPI: {
            filesRootGet: async () => ({ organized: false }),
            filesRootChoose: async () => ({ filesRoot: '/Users/x/Documenti' }),
            filesMigratePreview: async () => ({ success: true, total: 1, byType: [{ from: 'MappAI - Vault', to: 'Mappe', count: 1 }] }),
            filesSetup: async () => ({ success: true, moved: 1, vaultMap: { [VECCHIA]: NUOVA } })
        }
    };
    const document = { readyState: 'complete', createElement: finestra, addEventListener() { }, removeEventListener() { }, body: { appendChild() { } } };
    const ctx = vm.createContext({ window, document, localStorage: { getItem: () => '1', setItem() { } }, setTimeout() { }, console: SILENZIO });
    vm.runInContext('let appState = { activeVaultPath: ' + JSON.stringify(VECCHIA) + ' };', ctx);
    vm.runInContext(leggi('mappai-files-settings.js'), ctx);

    window.MappAIFiles.openSettings();
    await giro();
    finestre[0].querySelector('.fx-choose').onclick();       // «Scegli la posizione»
    await giro();
    finestre[1].querySelector('.fx-confirm').onclick();      // «Crea e organizza», con «sposta» spuntato
    await giro();
    assert.strictEqual(vm.runInContext('appState.activeVaultPath', ctx), NUOVA,
        'restava la cartella vecchia: il salvataggio successivo mirava a una cartella spostata');
});

/* ── Il prompt non dipende dal provider (comportamento IDENTICO, fissato) ───
   `fillPromptTemplate` aveva un ramo che con Infomaniak cercava prima le
   varianti `<chiave>_INFOMANIAK`; leggeva `window.appState` e non è mai scattato.
   Tolto il 25/9/26. Questa prova passava anche prima: fissa che «correggere» la
   guardia non riaccenda il ramo, e con lui le varianti di un override vecchio. */

test('prompt: con Infomaniak il template è lo stesso, e una variante _INFOMANIAK vecchia resta ignorata', () => {
    const window = { currentLanguage: 'it' };
    const ctx = vm.createContext({ window, document: { readyState: 'complete', addEventListener() { } }, localStorage: { getItem: () => null }, console: SILENZIO });
    vm.runInContext('let appState = { aiProvider: "infomaniak" };', ctx);
    vm.runInContext(leggi('admin_prompts.js'), ctx);
    window.systemPromptsConfig = { DISCIPLINE_STORIA_IT: 'Storia{{profile}}', DISCIPLINE_STORIA_INFOMANIAK_IT: 'VECCHIO' };
    assert.strictEqual(window.fillPromptTemplate('DISCIPLINE_STORIA', { profile: ' (media)' }), 'Storia (media)');
});

/* ── Invariante 8: le risposte AI passano da salvageTruncatedJSON ─────────── */

// ciò che esce dalla sandbox ha i prototipi dell'ALTRO realm: deepStrictEqual li distingue
const fuori = x => JSON.parse(JSON.stringify(x));

function sandboxAI(risposta, extra) {
    const toasts = [], avvisi = [];
    const window = Object.assign({
        getSystemKey: () => 'chiave', showLoadingOverlay() { }, fillPromptTemplate: () => 'prompt',
        fetchModelAPI: async () => ({ candidates: [{ content: { parts: [{ text: risposta }] } }] }),
        showToast: (msg, tipo) => toasts.push([tipo, msg]), showAlert: (titolo, msg) => avvisi.push([titolo, msg]),
        t: (k, f) => f, safeCreateIcons() { }, updateDegreeStats() { }, renderTreeView() { }
    }, extra.window);
    const ctx = vm.createContext(Object.assign({ window, console: SILENZIO, setTimeout() { } }, extra.globali));
    vm.runInContext(leggi('mappai-json-salvage.js'), ctx);     // come in index.html: prima di tutti
    vm.runInContext('let appState = ' + JSON.stringify(extra.appState) + '; let simulation = 1; var ridisegni = 0;' +
        'function initD3Visualization() { ridisegni++; } function cleanLabel(s) { return s; }' +
        'const MIND_MAP_SYSTEM_INSTRUCTION = "mm", KNOWLEDGE_GRAPH_SYSTEM_INSTRUCTION = "kg";' +
        'function buildSystemInstruction(b) { return b; }', ctx);
    return { ctx, window, toasts, avvisi, stato: () => vm.runInContext('appState', ctx), ridisegni: () => vm.runInContext('ridisegni', ctx) };
}

function correlazioni(risposta) {
    const s = sandboxAI(risposta, { appState: { db: { nodes: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }, { id: 'c', label: 'C' }], links: [] } } });
    vm.runInContext(leggi('mappai-merge-validate.js'), s.ctx);
    return s;
}

test('correlazioni AI: da una lista troncata si tengono le correlazioni complete', async () => {
    const s = correlazioni('[{"source":"a","target":"b","rel":"causa"},{"source":"b","target":"c","rel":"prece');
    await s.window.aiCrossLink(new Set(['a']), new Set(['b', 'c']));
    assert.deepStrictEqual(fuori(s.stato().db.links.map(l => [l.source, l.target, l.rel])), [['a', 'b', '🤖 causa']]);
    assert.strictEqual(s.toasts[0][0], 'success', 'con JSON.parse una risposta troncata era un errore');
    assert.strictEqual(s.ridisegni(), 1);
});

test('correlazioni AI: una risposta illeggibile dà lo stesso errore di prima, e la mappa non cambia', async () => {
    const s = correlazioni('Non ho trovato correlazioni utili.');
    await s.window.aiCrossLink(new Set(['a']), new Set(['b']));
    assert.strictEqual(s.toasts[0][0], 'error');
    assert.match(s.toasts[0][1], /^Errore AI cross-linking: /);
    assert.strictEqual(s.stato().db.links.length, 0);
    // e la risposta vuota resta «nessuna correlazione», come prima
    const vuota = correlazioni('');
    await vuota.window.aiCrossLink(new Set(['a']), new Set(['b']));
    assert.deepStrictEqual(vuota.toasts, [['info', "Nessuna correlazione trovata dall'AI."]]);
});

/* ── La regola dei bottoni nei form ───────────────────────────────────────── */

test('lenti: ogni bottone del pannello è type="button" (sta dentro #setup-form)', () => {
    const pannello = { innerHTML: '' };
    const document = {
        getElementById: id => (id === 'lenses-panel' ? pannello : null),
        createElement: () => ({}), head: { appendChild() { } }, addEventListener() { }
    };
    const window = {};
    vm.runInContext(leggi('mappai-lenses.js'), vm.createContext({ window, document, console: SILENZIO }));
    window.renderLensesUI();
    const bottoni = pannello.innerHTML.match(/<button\b[^>]*>/g) || [];
    assert.ok(bottoni.length > 10, 'preset e lenti ci sono');
    assert.deepStrictEqual(bottoni.filter(b => !/\stype="button"/.test(b)), [],
        'un <button> senza tipo dentro un form è un bottone d\'invio: il primo preset diventava il predefinito del form');
});
