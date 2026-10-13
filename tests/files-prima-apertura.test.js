'use strict';
/*
 * files-prima-apertura.test.js — packet 0088 (beta.6), difetto D4: «Organizza i documenti di MappAI».
 *
 * Prima, il segno `mappai_files_prompted` si scriveva ALL'APERTURA della domanda: chiusa con «Più tardi», con la ×
 * o con ESC non tornava mai più (restava la strada Cabina › Profilo insegnante › Gestione cartelle), e con la
 * Cabina aperta la finestra le restava dietro (z-index fisso 9994, la console sta a 12100 e oltre).
 *
 * Ora il segno si scrive solo a cartella organizzata, oppure con la casella nuova «Non chiederlo più» (che vale con
 * qualunque modo di chiudere); e il piano delle finestre lo chiede il motore dei modali, se ne ha di aperte.
 *
 * Il modulo VERO `mappai-files-settings.js` in una vm con un DOM di cartone: il modulo scrive l'HTML delle sue
 * finestre e poi ne cerca i bottoni per classe, quindi basta rispondere a quelle domande
 * (come tests/invarianti-comportamento.test.js). ⚠️ Negli assert solo booleani, testi e numeri, mai l'elemento.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'mappai-files-settings.js'), 'utf8');
const giro = () => new Promise(r => setImmediate(r));
const SEGNO = 'mappai_files_prompted';

function app(o = {}) {
  const finestre = [];
  const memoria = new Map(Object.entries(o.local || {}));
  const scritture = [];
  function finestra() {
    const e = { style: {}, html: '', figli: {}, rimossa: false, addEventListener() { }, remove() { e.rimossa = true; } };
    Object.defineProperty(e, 'innerHTML', { get: () => e.html, set: v => { e.html = v; } });
    e.querySelector = sel => {
      const cls = sel.replace(/^\./, '');
      if (!e.html.includes('class="' + cls + '"')) return null;
      return e.figli[cls] || (e.figli[cls] = { onclick: null, onchange: null, checked: false, disabled: false, textContent: '' });
    };
    e.zIndex = () => Number((/z-index:(\d+)/.exec(e.style.cssText || '') || [])[1]);
    finestre.push(e);
    return e;
  }
  const chiamate = { filesRootGet: 0, filesRootChoose: 0, filesSetup: 0 };
  const window = {
    showToast() { }, t: (_k, f) => f,
    electronAPI: {
      filesRootGet: async () => { chiamate.filesRootGet++; return { organized: !!o.organizzata, rootDir: '/R' }; },
      filesRootChoose: async () => { chiamate.filesRootChoose++; return { filesRoot: '/Users/x/Documenti' }; },
      filesMigratePreview: async () => ({ success: true, total: 0, byType: [] }),
      filesSetup: async () => { chiamate.filesSetup++; return { success: true, moved: 0 }; }
    }
  };
  if (o.motore) window.MappAIModal = o.motore;
  const document = { readyState: 'complete', createElement: finestra, addEventListener() { }, removeEventListener() { }, body: { appendChild() { } } };
  const localStorage = {
    getItem: k => (memoria.has(k) ? memoria.get(k) : null),
    setItem: (k, v) => { scritture.push([k, String(v)]); memoria.set(k, String(v)); },
    removeItem: k => { scritture.push([k, null]); memoria.delete(k); }
  };
  const ctx = vm.createContext({ window, document, localStorage, setTimeout() { }, console: { log() { }, warn() { }, error() { } } });
  vm.runInContext('let appState = { activeVaultPath: "" };', ctx);
  vm.runInContext(SRC, ctx);
  return {
    window, finestre, memoria, scritture, chiamate,
    chiedi: async () => { window.MappAIFiles.maybePromptFirstRun(); await giro(); await giro(); },
    segno: () => (memoria.has(SEGNO) ? memoria.get(SEGNO) : null),
    scrittureDelSegno: () => scritture.filter(s => s[0] === SEGNO)
  };
}

test('0088 D4: la domanda compare e NON scrive il segno all\'apertura', async () => {
  const a = app();
  await a.chiedi();
  assert.equal(a.finestre.length, 1, 'la finestra c\'è');
  assert.equal(a.finestre[0].html.includes('Organizza i documenti di MappAI'), true);
  assert.equal(a.finestre[0].html.includes('Non chiederlo più'), true, 'la casella nuova');
  assert.equal(a.scrittureDelSegno().length, 0, 'nessuna scrittura del segno');
  assert.equal(a.segno(), null);
});

test('0088 D4: «Più tardi», la × e il resto non scrivono il segno: al prossimo avvio la finestra TORNA', async () => {
  const a = app();
  await a.chiedi();
  a.finestre[0].querySelector('.fx-later').onclick();
  assert.equal(a.finestre[0].rimossa, true, '«Più tardi» chiude');
  assert.equal(a.segno(), null);
  /* il prossimo avvio */
  await a.chiedi();
  assert.equal(a.finestre.length, 2, 'la domanda è tornata');
  a.finestre[1].querySelector('.fx-close').onclick();
  assert.equal(a.finestre[1].rimossa, true, 'la × chiude');
  assert.equal(a.segno(), null);
  await a.chiedi();
  assert.equal(a.finestre.length, 3, 'e torna ancora');
});

test('0088 D4: «Non chiederlo più» scrive il segno subito — vale con qualunque modo di chiudere — e la domanda non torna', async () => {
  const a = app();
  await a.chiedi();
  const mai = a.finestre[0].querySelector('.fx-never');
  mai.checked = true; mai.onchange();
  assert.equal(a.segno(), '1');
  /* chiusa con la ×, senza «Più tardi»: il segno resta */
  a.finestre[0].querySelector('.fx-close').onclick();
  assert.equal(a.segno(), '1');
  const prima = a.chiamate.filesRootGet;
  await a.chiedi();
  assert.equal(a.finestre.length, 1, 'nessuna finestra nuova');
  assert.equal(a.chiamate.filesRootGet, prima, 'e nemmeno la domanda al main');
});

test('0088 D4: spuntare e poi togliere la spunta toglie il segno (ci si può ripensare prima di chiudere)', async () => {
  const a = app();
  await a.chiedi();
  const mai = a.finestre[0].querySelector('.fx-never');
  mai.checked = true; mai.onchange();
  assert.equal(a.segno(), '1');
  mai.checked = false; mai.onchange();
  assert.equal(a.segno(), null);
  await a.chiedi();
  assert.equal(a.finestre.length, 2, 'torna');
});

test('0088 D4: a cartella già organizzata nessuna domanda, e il segno si scrive', async () => {
  const a = app({ organizzata: true });
  await a.chiedi();
  assert.equal(a.finestre.length, 0);
  assert.equal(a.segno(), '1');
});

test('0088 D4: chi ha già il segno dalla beta.5 non rivede la domanda (e il main non viene nemmeno interpellato)', async () => {
  const a = app({ local: { [SEGNO]: '1' } });
  await a.chiedi();
  assert.equal(a.finestre.length, 0);
  assert.equal(a.chiamate.filesRootGet, 0);
});

test('0088 D4: scegliendo la posizione e confermando, la cartella è organizzata: il segno si scrive', async () => {
  const a = app();
  await a.chiedi();
  a.finestre[0].querySelector('.fx-now').onclick();      // «Scegli la posizione»
  await giro(); await giro();
  assert.equal(a.chiamate.filesRootChoose, 1);
  assert.equal(a.segno(), null, 'scelta la cartella ma non ancora confermata: nessun segno');
  a.finestre[1].querySelector('.fx-confirm').onclick();  // «Crea e organizza»
  await giro(); await giro();
  assert.equal(a.chiamate.filesSetup, 1);
  assert.equal(a.segno(), '1');
});

test('0088 D4: annullando la conferma di «Organizza i file» il segno non si scrive: la domanda tornerà', async () => {
  const a = app();
  await a.chiedi();
  a.finestre[0].querySelector('.fx-now').onclick();
  await giro(); await giro();
  a.finestre[1].querySelector('.fx-cancel').onclick();
  assert.equal(a.segno(), null);
  await a.chiedi();
  assert.equal(a.finestre.length, 3);
});

test('0088 D4: con la Cabina aperta (motore con finestre) le finestre stanno SOPRA; senza, restano a 9994', async () => {
  let z = 12100;
  const motore = { aperti: 1, prossimoZ: () => (z += 100) };
  const a = app({ motore });
  await a.chiedi();
  assert.equal(a.finestre[0].zIndex() > 12100, true, 'la domanda sta sopra la console a 12100');
  a.finestre[0].querySelector('.fx-now').onclick();
  await giro(); await giro();
  assert.equal(a.finestre[1].zIndex() > a.finestre[0].zIndex() - 1, true);
  assert.equal(a.finestre[1].zIndex() > 12100, true, 'anche «Organizza i file di MappAI» sta sopra');
  /* la finestra «Cartella documenti» aperta da Gestione cartelle */
  a.window.MappAIFiles.openSettings();
  await giro(); await giro();
  assert.equal(a.finestre[a.finestre.length - 1].zIndex() > 12100, true);

  const b = app();
  await b.chiedi();
  assert.equal(b.finestre[0].zIndex(), 9994, 'senza motore il piano è quello di sempre');
  const c = app({ motore: { aperti: 0, prossimoZ: () => 99999 } });
  await c.chiedi();
  assert.equal(c.finestre[0].zIndex(), 9994, 'motore presente ma senza finestre aperte: 9994');
});
