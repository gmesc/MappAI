'use strict';
/*
 * briciola-azioni-0124.test.js — packet 0124, lotto 2 (ADR 0025).
 *
 * Il menu della briciola del progetto (ELABORA e INSEGNA): via i nomi degli altri
 * progetti, in fondo «Rinomina…», «Riassegna…», «Copia…». I due modali nuovi
 * (`mappai-riassegna-copia.js`), nel motore, con un `MappAIModal` finto che registra lo
 * schema: sottotitoli di Giacomo, veste «grande», «Classe o allievo» e «Materia»
 * obbligatori, bottone spento col motivo, niente «Generico», elenchi in ordine. Poi il
 * giro: la mappa aperta si salva prima; Riassegna sposta, ripara i riferimenti e la riga;
 * Copia copia con un id nuovo; la console segue (`dopo`).
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const JS = (f) => fs.readFileSync(path.join(ROOT, 'public', 'js', f), 'utf8');
const HTML = fs.readFileSync(path.join(ROOT, 'public', 'index.html'), 'utf8');

/* ── il modulo vero in una vm ─────────────────────────────────────────────── */
function modulo(o = {}) {
  const schemi = [], chiamate = [], avvisi = [], segnali = [];
  const store = new Map(Object.entries(o.local || {}));
  const risposte = o.risposte || [];
  const classi = [{ id: 'c4r', name: '4R', sede: '' }, { id: 'c10', name: '10A', sede: '' }, { id: 'c3b', name: '3B', sede: 'Bedigliora' }];
  const g = {
    console: { log() {}, warn() {}, error() {} },
    localStorage: { getItem: k => store.has(k) ? store.get(k) : null, setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) },
    showToast: (m, k) => avvisi.push(k + ':' + m),
    MappAIModal: {
      open: (s) => {
        schemi.push(s);
        const r = risposte.shift();
        return Promise.resolve(typeof r === 'function' ? r(s) : r);
      }
    },
    MappAIClasses: {
      list: () => classi, get: id => classi.find(c => c.id === id) || null,
      disciplineChoices: c => c && c.id === 'c4r' ? ['Storia', 'Geografia', 'arte'] : ['Scienze'],
      setActive() {}, setActiveStudent() {}, setActiveDiscipline() {}, activeStudentName: () => ''
    },
    MappAITeacherProfile: { disciplineList: () => ['Storia', 'Musica'] },
    MappAIConsoleBento: require(path.join(ROOT, 'public', 'js', 'mappai-console-bento.js')),
    MappAIFilesCore: require(path.join(ROOT, 'public', 'js', 'mappai-files-core.js')),
    MappAINomeCartellaCore: require(path.join(ROOT, 'public', 'js', 'mappai-nome-cartella-core.js')),
    MappAIVaults: { segnala: (m, d) => segnali.push([m, d]) },
    MappAIRinomina: { riparaRiferimenti: async (x) => { chiamate.push(['ripara', x]); return { ok: true }; } },
    buildVaultMapData: () => ({ nodes: [] }),
    electronAPI: {
      filesRootGet: async () => ({ mapsBaseDir: '/C/MappAI - file/Classi', studentsBaseDir: '/C/MappAI - file/Allievi' }),
      saveVault: async (x) => { chiamate.push(['saveVault', x.folderPath]); return o.salvaKo ? { success: false } : { success: true }; },
      vaultRelocate: async (x) => { chiamate.push(['relocate', x]); return { success: true, fullPath: '/C/MappAI - file/Classi/' + x.parti.join('/') + '/IL SALE', folderName: 'IL SALE' }; },
      vaultCopy: async (x) => { chiamate.push(['copy', x]); return { ok: true, folderPath: '/C/MappAI - file/Classi/' + x.parti.join('/') + '/IL SALE', folderName: 'IL SALE' }; }
    },
    appState: Object.assign({ allProfiles: [{ nickname: 'Zoe' }, { nickname: 'anna' }], activeVaultPath: null }, o.appState || {}),
    StorageManager: { currentProjectId: 'proj_1', idInCartella: null, saveCurrentProject() { chiamate.push(['saveCurrentProject']); } },
    mappaiOccupato: () => false
  };
  g.window = g;
  const ctx = vm.createContext(g);
  vm.runInContext(JS('mappai-riassegna-copia-core.js'), ctx);
  vm.runInContext(JS('mappai-riassegna-copia.js'), ctx);
  return { g, schemi, chiamate, avvisi, segnali, store };
}
const PROGETTO = { vaultPath: '/C/MappAI - file/Classi/4R/Storia/IL SALE', nome: 'IL SALE', titolo: 'Il sale', projectId: 'proj_1', idRiga: 'proj_1' };
const primario = (s) => s.azioni.find(a => a.ruolo === 'primario');
const campo = (s, id) => s.sezioni.flatMap(x => x.campi || []).find(c => c.id === id);
const dati = (s) => s.sezioni.flatMap(x => x.dati || []).map(d => d.etichetta + ': ' + d.valore);
const piatto = (x) => JSON.parse(JSON.stringify(x));

test('0124 L2 modale Riassegna: sottotitolo di Giacomo, veste grande, campi obbligatori, bottone spento, niente Generico, elenchi in ordine', async () => {
  const h = modulo({ risposte: [null] });
  await h.g.MappAIRiassegnaCopia.apri('riassegna', PROGETTO);
  const s = h.schemi[0];
  assert.equal(s.titolo, 'Riassegna il progetto');
  assert.equal(s.sottotitolo, 'Cambia cartella del progetto');
  assert.equal(s.veste, 'grande');
  const chi = campo(s, 'chi');
  assert.equal(chi.obbligatorio, true);
  assert.deepEqual(piatto(chi.opzioni.map(x => x.etichetta)), ['scegli', '3B', '4R', '10A', 'anna (allievo)', 'Zoe (allievo)']);
  assert.equal(chi.opzioni.some(x => /generico/i.test(x.etichetta)), false);
  assert.equal(campo(s, 'materia').obbligatorio, true);
  assert.deepEqual(piatto(campo(s, 'materia').opzioni.map(x => x.valore)), [''], 'senza «Classe o allievo» nessuna materia');
  assert.equal(primario(s).spento, true);
  assert.equal(primario(s).fumetto, 'Scegli una classe o un allievo.');
  assert.ok(dati(s).includes('Ora: Classi › 4R › Storia › IL SALE'), dati(s).join(' | '));
  assert.deepEqual(h.chiamate, [], 'annullato: niente salvato, niente spostato');
});

test('0124 L2 modale Riassegna: scelta la classe, le sue materie in ordine; con la materia il bottone si accende; la stessa cartella resta spenta', async () => {
  const h = modulo({ risposte: [null] });
  await h.g.MappAIRiassegnaCopia.apri('riassegna', PROGETTO);
  const s = h.schemi[0];
  let ridisegnato = null;
  s.suAzione({ azione: '__campo', campo: 'chi', valori: { chi: 'c:c4r', materia: '' } }, null, (n) => { ridisegnato = n; });
  assert.deepEqual(piatto(campo(ridisegnato, 'materia').opzioni.map(x => x.etichetta)), ['scegli', 'arte', 'Geografia', 'Storia']);
  assert.equal(primario(ridisegnato).fumetto, 'Scegli la materia.');
  s.suAzione({ azione: '__campo', campo: 'materia', valori: { chi: 'c:c4r', materia: 'Storia' } }, null, (n) => { ridisegnato = n; });
  assert.equal(primario(ridisegnato).spento, true);
  assert.equal(primario(ridisegnato).fumetto, 'Il progetto è già qui.');
  s.suAzione({ azione: '__campo', campo: 'materia', valori: { chi: 'c:c4r', materia: 'Geografia' } }, null, (n) => { ridisegnato = n; });
  assert.ok(!primario(ridisegnato).spento);
  assert.ok(dati(ridisegnato).includes('Andrà in: Classi › 4R › Geografia › IL SALE'), dati(ridisegnato).join(' | '));
  s.suAzione({ azione: '__campo', campo: 'chi', valori: { chi: 'a:anna', materia: 'Geografia' } }, null, (n) => { ridisegnato = n; });
  assert.deepEqual(piatto(campo(ridisegnato, 'materia').opzioni.map(x => x.valore)), ['', 'Musica', 'Storia'], 'allievo: le materie del profilo; la materia che non c\'è più si perde');
  assert.equal(campo(ridisegnato, 'materia').valore, '');
});

test('0124 L2 Riassegna, mappa aperta: prima si salva, poi si sposta, si riparano i riferimenti e la riga del cassetto', async () => {
  const righe = [{ id: 'proj_1', name: 'IL SALE', cls: '4R', clsId: 'c4r', classDir: '4R', disc: 'Storia', discDir: 'Storia', vault: 'IL SALE' }];
  const h = modulo({ appState: { activeVaultPath: PROGETTO.vaultPath }, local: { tutor_ai_projects: JSON.stringify(righe) },
    risposte: [{ azione: 'ok', valori: { chi: 'c:c3b', materia: 'Scienze' } }] });
  let seguito = null;
  const r = await h.g.MappAIRiassegnaCopia.apri('riassegna', PROGETTO, { dopo: (x) => { seguito = x; } });
  assert.ok(r && r.success, JSON.stringify(r));
  assert.deepEqual(h.chiamate.map(c => c[0]), ['saveCurrentProject', 'saveVault', 'relocate', 'ripara']);
  assert.deepEqual(piatto(h.chiamate[2][1]), { folderPath: PROGETTO.vaultPath, base: 'maps', parti: ['Bedigliora-3B', 'Scienze'],
    dichiara: { classe: '3B', materia: 'Scienze', userProfile: { nickname: '', age: '', grade: '', system: 'Ticino' } }, projectId: 'proj_1' },
    'verso una classe la scheda si svuota (Giacomo, 24/10)');
  assert.deepEqual(piatto(h.chiamate[3][1]), { vecchio: PROGETTO.vaultPath, nuovo: '/C/MappAI - file/Classi/Bedigliora-3B/Scienze/IL SALE', idRiga: 'proj_1' });
  const riga = JSON.parse(h.store.get('tutor_ai_projects'))[0];
  assert.equal(riga.cls, '3B'); assert.equal(riga.clsId, 'c3b'); assert.equal(riga.classDir, 'Bedigliora-3B'); assert.equal(riga.disc, 'Scienze');
  assert.equal(h.g.appState.vaultClasse, '3B'); assert.equal(h.g.appState.vaultMateria, 'Scienze');
  assert.deepEqual(h.segnali.map(x => x[0]), ['mappa-spostata']);
  assert.equal(seguito.fullPath, '/C/MappAI - file/Classi/Bedigliora-3B/Scienze/IL SALE');
  assert.equal(seguito.modo, 'riassegna');
});

test('0124 L2 Riassegna: se la mappa aperta non si salva, non si sposta niente', async () => {
  const h = modulo({ appState: { activeVaultPath: PROGETTO.vaultPath }, salvaKo: true, risposte: [{ azione: 'ok', valori: { chi: 'c:c3b', materia: 'Scienze' } }] });
  const r = await h.g.MappAIRiassegnaCopia.apri('riassegna', PROGETTO);
  assert.equal(r, false);
  assert.equal(h.chiamate.some(c => c[0] === 'relocate'), false);
  assert.ok(h.avvisi.some(a => /^error:/.test(a)));
});

test('0124 L2 modale Copia: il suo sottotitolo; copia con un id nuovo verso un allievo; la console passa alla copia', async () => {
  const h = modulo({ risposte: [(s) => { assert.equal(s.titolo, 'Copia il progetto'); assert.equal(s.sottotitolo, 'Copia tutto il progetto nella cartella di un altra destinazione'); return { azione: 'ok', valori: { chi: 'a:Zoe', materia: 'Musica' } }; }] });
  let seguito = null;
  const r = await h.g.MappAIRiassegnaCopia.apri('copia', PROGETTO, { dopo: (x) => { seguito = x; } });
  assert.ok(r && r.ok, JSON.stringify(r));
  const c = piatto(h.chiamate.find(x => x[0] === 'copy')[1]);
  assert.match(c.projectId, /^proj_\d+$/);
  assert.notEqual(c.projectId, 'proj_1');
  assert.deepEqual(Object.assign({}, c, { projectId: 'x' }), { src: PROGETTO.vaultPath, base: 'students', parti: ['Zoe', 'Musica'], nome: 'IL SALE', projectId: 'x',
    dichiara: { classe: '', materia: 'Musica', userProfile: { nickname: 'Zoe' } } }, 'verso un allievo la sua scheda (Giacomo, 24/10)');
  assert.equal(h.chiamate.some(x => x[0] === 'relocate' || x[0] === 'ripara'), false, 'l\'originale non si tocca');
  assert.deepEqual(h.segnali.map(x => x[0]), ['mappa-creata']);
  assert.equal(seguito.modo, 'copia');
  assert.equal(seguito.fullPath, '/C/MappAI - file/Classi/Zoe/Musica/IL SALE');
});

test('0124 L2: l\'interruttore mappai_riassegna_copia — acceso salvo «0»', () => {
  assert.equal(modulo().g.MappAIRiassegnaCopia.attivo(), true);
  assert.equal(modulo({ local: { mappai_riassegna_copia: '0' } }).g.MappAIRiassegnaCopia.attivo(), false);
});

/* ── le briciole e i file ─────────────────────────────────────────────────── */
function briciola(src, da) {
  const i = src.indexOf(da); assert.ok(i >= 0, da);
  return src.slice(i, i + 3200);
}
test('0124 L2 briciola ELABORA e INSEGNA: niente nomi di altri progetti, in fondo Rinomina, Riassegna, Copia', () => {
  const casi = [
    [JS('mappai-elabora-console.js'), '0094 (S7): «Rinomina…» in fondo al menu del progetto'],
    [JS('mappai-landing-teach.js'), '0094 (S7): «Rinomina…» in fondo al menu della briciola']
  ];
  for (const [src, da] of casi) {
    const b = briciola(src, da);
    assert.match(b, /voci: \[\]/, 'il menu non elenca altri progetti');
    assert.match(b, /nuovo: _azioni/, 'le azioni in fondo');
    assert.match(b, /rc_riassegna_voce', 'Riassegna…'/);
    assert.match(b, /rc_copia_voce', 'Copia…'/);
    assert.equal(/\.map\(function \(m2\)/.test(b), false, 'nessun elenco di mappe nel menu');
  }
});

test('0124 L2: «+ Nuova materia» non c\'è più in briciole, sidebar, landing (e i suoi gestori sono usciti)', () => {
  ['mappai-console-bento.js', 'mappai-landing-teach.js', 'mappai-elabora-console.js', 'mappai-stile-manifesto.js'].forEach(f => {
    const s = JS(f);
    assert.equal(/Nuova materia'|onNuovaMateria|_promptNuovaMateria/.test(s), false, f);
  });
});

test('0124 L2: il menu della briciola sa mettere più azioni in fondo (CSS: un filetto solo)', () => {
  assert.match(JS('mappai-console-bento.js'), /Array\.isArray\(menuSpec\.nuovo\)/);
  const css = fs.readFileSync(path.join(ROOT, 'public', 'css', 'mappai-console-manifesto.css'), 'utf8');
  assert.match(css, /\.mn-bric-menu__nuovo \+ \.mn-bric-menu__nuovo[^{]*\{[^}]*border-top:\s*none/);
});

test('0124 L2: index.html carica il core e il modulo dopo la rinomina, prima di admin_prompts', () => {
  const a = HTML.indexOf('js/mappai-rinomina.js'), b = HTML.indexOf('js/mappai-riassegna-copia-core.js'), c = HTML.indexOf('js/mappai-riassegna-copia.js'), d = HTML.indexOf('admin_prompts.js');
  assert.ok(a > 0 && b > a && c > b && d > c, [a, b, c, d].join(' '));
});
