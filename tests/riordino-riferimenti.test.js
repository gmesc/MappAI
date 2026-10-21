'use strict';
/* 0104 (ADR 0023) — mappai-riordino.js in una vm, con mappai-rinomina.js VERO (0094):
   dopo la riorganizzazione la riga del cassetto, la fotografia di «Riprendi» e la
   padronanza puntano alla cartella nuova; una volta sola; il ritorno indietro segue. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const FilesCore = require('../public/js/mappai-files-core.js');
const NomeCartellaCore = require('../public/js/mappai-nome-cartella-core.js');
const RiordinoCore = require('../public/js/mappai-riordino-core.js');
const RIN = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'mappai-rinomina.js'), 'utf8');
const RIO = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'mappai-riordino.js'), 'utf8');

const ROOT = '/u/Documents/MappAI - file';
const PID = 'proj_1790000000001', PID2 = 'proj_1790000000002';
const VECCHIO = ROOT + '/Mappe/4R/Scienze/Elettricità', NUOVO = ROOT + '/Classi/4R/Scienze/Elettricità';
const SALE_V = ROOT + '/Mappe/Generico/Il Sale', SALE_N = ROOT + '/Classi/Senza classe/Scienze/Il Sale';

function registroAvanti() {
  return { id: 'riordino-1', versione: 1, giri: [{ verso: 'avanti', fatti: [
    { da: ['Diagnostica'], a: ['Sistema', 'Diagnostica'], tipo: 'sistema' },
    { da: ['Mappe', '4R', 'Scienze', 'Elettricità'], a: ['Classi', '4R', 'Scienze', 'Elettricità'], tipo: 'progetto', projectId: PID },
    { da: ['Mappe', 'Generico', 'Il Sale'], a: ['Classi', 'Senza classe', 'Scienze', 'Il Sale'], tipo: 'progetto' }
  ], conflitti: [], falliti: [] }] };
}

function finestra(opz) {
  const local = new Map(Object.entries(opz.local || {}));
  const segnali = [];
  let stato = { ok: true, struttura: 2, acceso: true, rootDir: ROOT, registro: opz.registro };
  const g = {
    console: { log() {}, warn() {}, error() {} }, setTimeout, clearTimeout, TextDecoder, Uint8Array, Promise,
    atob: s => Buffer.from(s, 'base64').toString('binary'),
    localStorage: { getItem: k => (local.has(k) ? local.get(k) : null), setItem: (k, v) => local.set(k, String(v)), removeItem: k => local.delete(k) },
    addEventListener() {},
    MappAINomeCartellaCore: NomeCartellaCore, MappAIFilesCore: FilesCore, MappAIRiordinoCore: RiordinoCore,
    MappAIVaults: { segnala: (m) => segnali.push(m) },
    electronAPI: {
      async strutturaStato() { return JSON.parse(JSON.stringify(stato)); },
      async readVaultFile() { return { ok: false, error: 'file non trovato' }; },   // pipeline.json: già riparato da main.js
      async saveVaultFile() { throw new Error('non deve scrivere'); }
    }
  };
  g.window = g;
  vm.createContext(g);
  vm.runInContext('var appState = { activeVaultPath: null }; var StorageManager = { currentProjectId: null, idInCartella: null, _radice: ' + JSON.stringify(ROOT) + ' };', g);
  vm.runInContext(RIN, g);
  vm.runInContext(RIO, g);
  return { g, local, segnali, cambia: s => { stato = Object.assign({}, stato, s); }, righe: () => JSON.parse(local.get('tutor_ai_projects')) };
}

function cassetto() {
  return {
    tutor_ai_projects: JSON.stringify([
      { id: PID, name: 'Elettricità', vault: 'Elettricità', classDir: '4R', discDir: 'Scienze', cartella: 'Mappe/4R/Scienze/Elettricità' },
      { id: PID2, name: 'Il Sale', vault: 'Il Sale', classDir: null, discDir: null, vaultPath: SALE_V },
      { id: 'proj_1790000000009', name: 'Altro', vault: 'Altro', classDir: '1A', cartella: 'Mappe/1A/Altro' }
    ]),
    [PID]: JSON.stringify({ activeVaultPath: VECCHIO, _pipelineManifest: { vaultPath: VECCHIO } }),
    [PID2]: JSON.stringify({ activeVaultPath: SALE_V }),
    ['mappai_mastery::' + VECCHIO]: '{"n1":3}'
  };
}

test('dopo la riorganizzazione: cassetto, fotografia e padronanza puntano alla cartella nuova', async () => {
  const f = finestra({ registro: registroAvanti(), local: cassetto() });
  const r = await f.g.MappAIRiordino.applica();
  assert.equal(r.applicati, 2);
  const [el, sale, altro] = f.righe();
  assert.equal(el.cartella, 'Classi/4R/Scienze/Elettricità');
  assert.equal(el.classDir, '4R'); assert.equal(el.discDir, 'Scienze');
  assert.equal(sale.vaultPath, SALE_N, 'trovata per percorso: la cartella non aveva un id');
  assert.equal(sale.classDir, null); assert.equal(sale.discDir, 'Scienze');
  assert.equal(altro.cartella, 'Mappe/1A/Altro', 'una riga che non c\'entra non si tocca');
  const foto = JSON.parse(f.local.get(PID));
  assert.equal(foto.activeVaultPath, NUOVO);
  assert.equal(foto._pipelineManifest.vaultPath, NUOVO);
  assert.equal(JSON.parse(f.local.get(PID2)).activeVaultPath, SALE_N);
  assert.equal(f.local.get('mappai_mastery::' + NUOVO), '{"n1":3}');
  assert.equal(f.local.has('mappai_mastery::' + VECCHIO), false);
  assert.deepEqual(f.segnali, ['riorganizzata']);
});

test('una volta sola: al secondo caricamento non si rifà niente', async () => {
  const f = finestra({ registro: registroAvanti(), local: cassetto() });
  await f.g.MappAIRiordino.applica();
  const dopo = f.local.get('tutor_ai_projects');
  const r = await f.g.MappAIRiordino.applica();
  assert.equal(r.applicati, 0);
  assert.equal(f.local.get('tutor_ai_projects'), dopo);
  assert.equal(JSON.parse(f.local.get('mappai_riordino_applicato'))['riordino-1'], 3);
});

test('il ritorno indietro (stesso registro, giro «indietro») rimette i riferimenti', async () => {
  const reg = registroAvanti();
  const f = finestra({ registro: reg, local: cassetto() });
  await f.g.MappAIRiordino.applica();
  const inv = RiordinoCore.pianoInverso(reg);
  reg.giri.push({ verso: 'indietro', fatti: inv.spostamenti, conflitti: [], falliti: [] });
  f.cambia({ registro: reg, struttura: 1, acceso: false });
  const r = await f.g.MappAIRiordino.applica();
  assert.equal(r.applicati, 2);
  const [el, sale] = f.righe();
  assert.equal(el.cartella, 'Mappe/4R/Scienze/Elettricità');
  assert.equal(el.classDir, '4R'); assert.equal(el.discDir, 'Scienze');
  assert.equal(sale.vaultPath, SALE_V);
  assert.equal(sale.classDir, null); assert.equal(sale.discDir, null);
  assert.equal(JSON.parse(f.local.get(PID)).activeVaultPath, VECCHIO);
  assert.equal(f.local.get('mappai_mastery::' + VECCHIO), '{"n1":3}');
});

test('una riga senza id né percorso si riconosce dalla sua fotografia (gate del 16/10)', async () => {
  const local = cassetto();
  const righe = JSON.parse(local.tutor_ai_projects);
  righe[1] = { id: 'proj_1792000000001', name: 'Il Sale', vault: 'Il Sale', classDir: null, discDir: null };   // niente vaultPath, niente cartella
  local.tutor_ai_projects = JSON.stringify(righe);
  local['proj_1792000000001'] = JSON.stringify({ activeVaultPath: SALE_V });
  const f = finestra({ registro: registroAvanti(), local });
  await f.g.MappAIRiordino.applica();
  assert.equal(JSON.parse(f.local.get('proj_1792000000001')).activeVaultPath, SALE_N);
  const sale = f.righe().find(p => p.id === 'proj_1792000000001');
  assert.equal(sale.discDir, 'Scienze');
});

test('senza registro, o senza l\'app: niente', async () => {
  const f = finestra({ registro: null, local: cassetto() });
  assert.equal((await f.g.MappAIRiordino.applica()).applicati, 0);
});

test('posizione: classe e materia dalla cartella nuova', () => {
  const f = finestra({ registro: null });
  const P = a => JSON.parse(JSON.stringify(f.g.MappAIRiordino.posizione(a)));
  assert.deepEqual(P(['Classi', '4R', 'Scienze', 'X']), { classDir: '4R', discDir: 'Scienze' });
  assert.deepEqual(P(['Classi', '4R', 'X']), { classDir: '4R', discDir: null });
  assert.deepEqual(P(['Classi', 'Senza classe', 'X']), { classDir: null, discDir: null });
  assert.deepEqual(P(['Allievi', 'Marco', 'Matematica', 'X']), { classDir: null, discDir: 'Matematica' });
  assert.deepEqual(P(['Mappe', 'Generico', 'X']), { classDir: null, discDir: null });
  assert.deepEqual(P(['Mappe', 'X']), { classDir: null, discDir: null });
});
