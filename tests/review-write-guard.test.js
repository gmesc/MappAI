'use strict';
/* LA GUARDIA DELLA SCRITTURA (25/9/2026) — l'incidente di «Svizzera e 2a GM».
   Alle 01:20 la copia installata dell'app ha scritto nella cartella di Svizzera
   (versione 16) il manifesto di «Officina Project E» che aveva in memoria
   (versione 176): la revisione di Svizzera è stata sostituita da un rapporto
   «saltato». Qui si prova che il magazzino — l'unico che scrive pipeline.json —
   rifiuta quella scrittura lasciando il file identico byte per byte, e che fa
   passare le sequenze legittime: quelle scritte a mano e quelle del
   controllore VERO (mappai-review.js) attraverso il gestore IPC VERO di main.js.
   Niente Electron, niente rete, niente AI: cartelle temporanee. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const RC = require('../public/js/mappai-review-core.js');
const Store = require('../public/js/mappai-review-store.js');
const PC = require('../public/js/mappai-pipeline-core.js');
const clone = x => JSON.parse(JSON.stringify(x));

const SVIZZERA_DB = {
  nodes: [
    { id: 'root', label: 'Svizzera e 2a GM', desc: 'La Svizzera durante la seconda guerra mondiale.', level: 0 },
    { id: 'neutra', label: 'Neutralità armata', desc: 'Nel 1939 la Svizzera dichiara la neutralità armata.', level: 1 },
    { id: 'ridotto', label: 'Ridotto Nazionale', desc: 'Guisan porta il grosso dell\'esercito nelle Alpi.', level: 1 }
  ],
  links: [{ source: 'root', target: 'neutra', rel: 'comprende' }, { source: 'root', target: 'ridotto', rel: 'comprende' }],
  sourcesDict: {}
};
const SVIZZERA_FONTI = [{ nome: 'Svizzera 1939-1945.pdf', pages: [{ n: 4,
  text: 'Nel 1939 la Svizzera proclama la neutralità armata. Nel 1940 Guisan concentra la difesa nel Ridotto alpino.' }] }];
const SEGNALAZIONI = { stato: 'parziale', issues: [
  { id: 'neutra-data', target: { kind: 'node', id: 'neutra', field: 'desc' },
    after: 'Nel 1939 la Svizzera proclama la neutralità armata.', problem: 'La fonte usa un altro verbo.' },
  { id: 'ridotto-anno', target: { kind: 'node', id: 'ridotto', field: 'desc' }, problem: 'Manca l\'anno del Ridotto.' },
  { id: 'root-neutra', target: { kind: 'link', source: 'root', target: 'neutra', field: 'rel' }, problem: 'Parola del collegamento generica.' }
] };
const OFFICINA_DB = {
  nodes: [
    { id: 'o-root', label: 'Officina Project E', desc: 'Circuiti e corrente elettrica.', level: 0 },
    { id: 'o-corrente', label: 'Corrente', desc: 'La corrente scorre solo in un circuito chiuso.', level: 1 }
  ],
  links: [{ source: 'o-root', target: 'o-corrente', rel: 'comprende' }],
  sourcesDict: {}
};
const OFFICINA_FONTI = [{ nome: 'Officina.pdf', pages: [{ n: 2, text: 'La corrente scorre solo in un circuito chiuso.' }] }];
const SALTATO = { stato: 'saltato', motivoSkip: 'testo della fonte non disponibile' };
const MOTIVO_INCIDENTE = 'review-conflict: i dati in memoria sono del progetto «Officina Project E», non di «Svizzera e 2a GM»; ' +
  'il file sul disco non è stato toccato, riapri il progetto';

// ── Dati: la forma di pipeline.json com'è sul disco di Giacomo ──────────────
function revisioneSvizzera(cartella) {
  let r = RC.createReview({ db: SVIZZERA_DB, sources: SVIZZERA_FONTI, report: SEGNALAZIONI,
    generationId: 'c5692721-svizzera', projectId: 'proj_svizzera', vaultPath: cartella });
  r = RC.setDecision(r, 'neutra-data', 'accept');
  return RC.setDecision(r, 'root-neutra', 'manual', { text: '', relNone: true });   // una scelta «Nessuna»
}
function approvata(db, sources, generationId, cartella) {
  const begun = RC.beginApproval(RC.createReview({ db, sources, generationId, vaultPath: cartella,
    report: { checkStatus: 'completed' } }), db, { sources });
  assert.equal(begun.ok, true);
  return RC.completeApproval(begun.review, begun.review.approvedRevision);
}
function manifestoSvizzera(cartella, review) {
  const m = PC.createManifest({ quiz: { types: ['mc'] } }, { vaultPath: cartella, now: '2026-09-22T19:53:58.690Z' });
  m.steps.A.status = 'done';
  m.review = review || revisioneSvizzera(cartella);
  return m;
}
function manifestoOfficina(cartella, versione) {
  const m = PC.createManifest({ quiz: { types: ['mc', 'open'] } }, { vaultPath: cartella, now: '2026-09-23T22:31:01.573Z' });
  m.steps.A.status = 'done';
  m.review = approvata(OFFICINA_DB, OFFICINA_FONTI, 'ab1a51e9-officina', cartella);
  if (versione != null) m._storageVersion = versione;
  return m;
}
/* La forma del file scritto alle 01:20 (letta dal backup del ripristino): il
   successore che costruisce `requireApproved` — revisione nuova sul db aperto,
   fonti e config del manifesto in memoria, `previous` = la revisione in
   memoria, `vaultPath` della revisione = la cartella aperta. */
function successoreComeRequireApproved(manifest, db, cartellaAperta, report) {
  const previous = clone(manifest.review);
  // come il codice vero: `generationId: s._generationId`, cioè lo STESSO della revisione che segue
  manifest.review = RC.createReview({ db, sources: previous.sources, report, generationId: previous.generationId,
    vaultPath: cartellaAperta, config: manifest.config });
  manifest.review.previous = previous;
  return manifest;
}

// ── Disco ───────────────────────────────────────────────────────────────────
function progetti(t) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'mappai-guardia-'));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const svizzera = path.join(base, 'Mappe', '4R', 'Storia', 'Svizzera e 2a GM');
  const officina = path.join(base, 'Mappe', '4R', 'Scienze', 'Officina Project E');
  fs.mkdirSync(svizzera, { recursive: true });
  fs.mkdirSync(officina, { recursive: true });
  return { base, svizzera, officina };
}
// La storia del file (16 salvataggi) si scrive direttamente: è il punto di partenza.
function sulDisco(cartella, manifest, versione) {
  const m = Object.assign({}, manifest);
  if (versione == null) delete m._storageVersion; else m._storageVersion = versione;
  fs.writeFileSync(path.join(cartella, 'pipeline.json'), JSON.stringify(m, null, 2));
}
function fotografia(cartella) {
  const file = path.join(cartella, 'pipeline.json'), st = fs.statSync(file);
  return { byte: fs.readFileSync(file), ino: st.ino, mtime: st.mtimeMs, elenco: fs.readdirSync(cartella).sort() };
}
function intatto(cartella, prima) {
  const dopo = fotografia(cartella);
  assert.ok(dopo.byte.equals(prima.byte), 'pipeline.json identico byte per byte');
  assert.equal(dopo.ino, prima.ino, 'il file non è stato sostituito');
  assert.equal(dopo.mtime, prima.mtime, 'il file non è stato riscritto');
  assert.deepEqual(dopo.elenco, prima.elenco, 'nessun file temporaneo rimasto nella cartella');
}

// ── Il codice vero: il gestore IPC di main.js e il controllore della revisione ──
function gestoreSalvataggio() {
  const source = fs.readFileSync(path.join(__dirname, '../main.js'), 'utf8');
  const start = source.indexOf("ipcMain.handle('save-vault-file',");
  assert.ok(start > 0, 'main.js ha il gestore save-vault-file');
  let gestore = null;
  const ctx = vm.createContext({ fs, path, Buffer, console, ReviewStore: Store,
    FilesCore: require('../public/js/mappai-files-core.js'),
    ipcMain: { handle: (name, fn) => { if (name === 'save-vault-file') gestore = fn; } } });
  vm.runInContext(source.slice(start, source.indexOf('\n});', start) + 4), ctx);
  return args => gestore({}, args);
}
function controllore(cartellaAperta, gestore, opts = {}) {
  const st = { activeVaultPath: cartellaAperta, db: clone(opts.db || SVIZZERA_DB), sources: [], _pdfPagine: [] };
  const aperte = [];
  const window = {
    MappAIReviewCore: RC, MappAILinkEditorCore: require('../public/js/mappai-link-editor-core.js'),
    t: (_key, fallback) => fallback, getSystemKey: () => 'chiave-di-prova',
    executeJudgePass: async () => clone(opts.report || SALTATO),
    electronAPI: { saveVaultFile: args => gestore(args) }
  };
  const ctx = vm.createContext({ window, appState: st, document: {}, console, TextDecoder, Uint8Array,
    atob: v => Buffer.from(v, 'base64').toString('binary'),
    StorageManager: { currentProjectId: 'proj_svizzera', saveCurrentProject() {} },
    localStorage: { getItem: () => null } });
  vm.runInContext(fs.readFileSync(require.resolve('../public/js/mappai-review.js'), 'utf8'), ctx);
  window.MappAIReview.open = (vaultPath, manifest) => aperte.push({ vaultPath, manifest });   // la finestra non serve qui
  return { R: window.MappAIReview, st, window, aperte };
}

// ════════════════════════════════════════════════════════════════════════════
test('l\'incidente del 25/9: il manifesto di Officina (v176) non entra nella cartella di Svizzera (v16) e il file resta identico', async t => {
  const p = progetti(t);
  sulDisco(p.svizzera, manifestoSvizzera(p.svizzera), 16);
  const prima = fotografia(p.svizzera);
  const colpevole = successoreComeRequireApproved(manifestoOfficina(p.officina, 176), SVIZZERA_DB, p.svizzera, SALTATO);
  // La versione attesa si cercava per PERCORSO: 16, come sul disco. È per questo che passava.
  assert.throws(() => Store.saveManifest(p.svizzera, colpevole, 16), { message: MOTIVO_INCIDENTE });
  // Con Svizzera mai aperta, l'attesa sarebbe stata la SUA, 176: il motivo resta quello vero,
  // non «rapporto aggiornato da un altro salvataggio».
  assert.throws(() => Store.saveManifest(p.svizzera, colpevole, 176), { message: MOTIVO_INCIDENTE });
  intatto(p.svizzera, prima);
  // Attraverso il gestore IPC vero l'errore arriva al renderer con le stesse parole.
  const res = await gestoreSalvataggio()({ vaultPath: p.svizzera, relPath: 'pipeline.json', text: JSON.stringify(colpevole), expectedVersion: 16 });
  assert.deepEqual(clone(res), { ok: false, error: MOTIVO_INCIDENTE });   // l'oggetto nasce in un altro contesto vm
  intatto(p.svizzera, prima);
  // Ognuna delle tre regole, da sola, l'avrebbe fermato.
  const disco = Store.readManifest(p.svizzera);
  assert.equal(RC.conflittoDiScrittura(disco, colpevole, p.svizzera).regola, 'cartella');
  const senzaCartella = Object.assign({}, colpevole, { vaultPath: '' });
  assert.deepEqual(RC.conflittoDiScrittura(disco, senzaCartella, p.svizzera), { regola: 'versione',
    motivo: 'i dati in memoria sono alla versione 176 e il file sul disco alla 16, quindi vengono da un altro progetto ' +
      'o da una copia più recente; il file sul disco non è stato toccato, riapri il progetto' });
  const senzaNiente = Object.assign({}, senzaCartella, { _storageVersion: undefined });
  assert.deepEqual(RC.conflittoDiScrittura(disco, senzaNiente, p.svizzera), { regola: 'revisione',
    motivo: 'la revisione salvata (3 segnalazioni, 2 decisioni) sarebbe sostituita da un\'altra che non la conserva; ' +
      'il file sul disco non è stato toccato, riapri il progetto' });
});

test('lo stesso incidente col codice vero: requireApproved con Officina in memoria e Svizzera aperta viene rifiutato', async t => {
  const p = progetti(t);
  sulDisco(p.svizzera, manifestoSvizzera(p.svizzera), 16);
  const prima = fotografia(p.svizzera);
  const h = controllore(p.svizzera, gestoreSalvataggio());
  assert.equal(await h.R.restore(p.svizzera, Store.readManifest(p.svizzera)), true);   // Svizzera aperta: versione attesa 16
  // Come `Pipeline.run` con `opts.manifest` (material-pipeline.js): il manifesto va in
  // memoria senza che nessuno guardi di quale cartella sia.
  h.st._pipelineManifest = manifestoOfficina(p.officina, 176);
  await assert.rejects(h.R.requireApproved(), { message: MOTIVO_INCIDENTE });
  intatto(p.svizzera, prima);
  assert.equal(h.aperte.length, 0, 'nessuna revisione aperta su dati che non sono sul disco');
});

test('Svizzera com\'è oggi (il file dichiara la cartella di Officina): i suoi salvataggi passano, Officina resta fuori', t => {
  const p = progetti(t);
  // Il ripristino delle 01:31 ha rimesso solo `review`: vaultPath, createdAt e config sono ancora di Officina.
  const oggi = manifestoSvizzera(p.svizzera);
  oggi.vaultPath = p.officina;
  sulDisco(p.svizzera, oggi, 23);
  const letto = Store.readManifest(p.svizzera);
  letto.review = RC.setDecision(letto.review, 'ridotto-anno', 'reject');
  assert.equal(Store.saveManifest(p.svizzera, letto, 23), 24, 'il manifesto riletto dal disco si salva');
  const prima = fotografia(p.svizzera);
  // Qui la regola della cartella non vede niente (Officina = quello che il file dichiara);
  // restano la versione e la revisione.
  const officina = manifestoOfficina(p.officina, 176);
  assert.throws(() => Store.saveManifest(p.svizzera, officina, 24), /versione 176 e il file sul disco alla 24/);
  delete officina._storageVersion;
  assert.throws(() => Store.saveManifest(p.svizzera, officina, 24), /la revisione salvata \(3 segnalazioni, 3 decisioni\) sarebbe sostituita/);
  intatto(p.svizzera, prima);
});

test('una revisione nuova che non conserva quella sul disco viene rifiutata', t => {
  const p = progetti(t);
  sulDisco(p.svizzera, manifestoSvizzera(p.svizzera), 16);
  const prima = fotografia(p.svizzera);
  // Stessa cartella, stessa versione: solo la revisione è di un'altra generazione, senza `previous`.
  const nuova = Store.readManifest(p.svizzera);
  nuova.review = RC.createReview({ db: SVIZZERA_DB, sources: SVIZZERA_FONTI, report: SALTATO, generationId: 'rigenerata', vaultPath: p.svizzera });
  assert.throws(() => Store.saveManifest(p.svizzera, nuova, 16),
    { message: 'review-conflict: la revisione salvata (3 segnalazioni, 2 decisioni) sarebbe sostituita da un\'altra che non la conserva; ' +
      'il file sul disco non è stato toccato, riapri il progetto' });
  // Un `previous` di un'altra generazione non basta: deve essere QUELLA sul disco.
  nuova.review.previous = approvata(OFFICINA_DB, OFFICINA_FONTI, 'ab1a51e9-officina', p.officina);
  assert.throws(() => Store.saveManifest(p.svizzera, nuova, 16), /la revisione salvata/);
  intatto(p.svizzera, prima);
  // Togliere la revisione resta vietato, con il messaggio di sempre.
  assert.throws(() => Store.saveManifest(p.svizzera, { vaultPath: p.svizzera, steps: {} }, 16), /la rigenerazione non può cancellare le decisioni/);
  intatto(p.svizzera, prima);
});

test('il successore legittimo di requireApproved passa (codice vero)', async t => {
  const p = progetti(t);
  sulDisco(p.svizzera, manifestoSvizzera(p.svizzera, approvata(SVIZZERA_DB, SVIZZERA_FONTI, 'c5692721-svizzera', p.svizzera)), 16);
  const h = controllore(p.svizzera, gestoreSalvataggio());
  await h.R.restore(p.svizzera, Store.readManifest(p.svizzera));
  h.st.db.nodes[2].desc = 'Nel 1940 Guisan porta il grosso dell\'esercito nelle Alpi.';   // una modifica vera dopo l'approvazione
  assert.equal(await h.R.requireApproved(), false);
  const disco = Store.readManifest(p.svizzera);
  assert.equal(disco._storageVersion, 17);
  assert.notEqual(disco.review.generationId, 'c5692721-svizzera');
  assert.equal(disco.review.previous.generationId, 'c5692721-svizzera', 'la revisione di prima resta, come `previous`');
  assert.equal(disco.review.previous.initial.status, 'approved');
  assert.equal(disco.review.initial.status, 'awaiting_review');
  assert.equal(h.aperte.length, 1);
});

test('decisione «Nessuna», annullamento e nuovo controllo saltato (mergeRetry) passano (codice vero)', async t => {
  const p = progetti(t);
  sulDisco(p.svizzera, manifestoSvizzera(p.svizzera), 16);
  const h = controllore(p.svizzera, gestoreSalvataggio());
  await h.R.restore(p.svizzera, Store.readManifest(p.svizzera));
  const ref = h.window.MappAILinkEditorCore.reference(h.st.db.links[1]);
  const annulla = await h.R.editLinkLabel(ref, '', { relNone: true });
  let disco = Store.readManifest(p.svizzera);
  assert.equal(disco._storageVersion, 17);
  assert.equal(Object.keys(disco.review.initial.decisions).length, 3);
  await annulla();
  disco = Store.readManifest(p.svizzera);
  assert.equal(disco._storageVersion, 18);
  assert.deepEqual(Object.keys(disco.review.initial.decisions).sort(), ['neutra-data', 'root-neutra']);
  const next = await h.R.retryJudge(p.svizzera, h.st._pipelineManifest);
  disco = Store.readManifest(p.svizzera);
  assert.equal(disco._storageVersion, 19);
  assert.equal(disco.review.generationId, 'c5692721-svizzera');
  assert.equal(disco.review.initial.checkStatus, 'incomplete', 'il controllo saltato resta incompleto');
  assert.equal(disco.review.initial.previousReports.length, 1);
  assert.deepEqual(disco.review.initial.decisions, next.initial.decisions);
  assert.deepEqual(Object.keys(disco.review.initial.decisions).sort(), ['neutra-data', 'root-neutra'], 'le decisioni sopravvivono al nuovo controllo');
});

test('tre decisioni battute in fretta: la coda del controllore vero passa, ed è per lei che una versione più bassa non si rifiuta', async t => {
  const p = progetti(t);
  sulDisco(p.svizzera, manifestoSvizzera(p.svizzera), 16);
  const h = controllore(p.svizzera, gestoreSalvataggio());
  const manifest = Store.readManifest(p.svizzera);
  await h.R.restore(p.svizzera, manifest);
  const visto = [], vero = h.window.electronAPI.saveVaultFile;
  h.window.electronAPI.saveVaultFile = args => {
    visto.push([JSON.parse(args.text)._storageVersion, Store.readManifest(p.svizzera)._storageVersion, args.expectedVersion]);
    return vero(args);
  };
  // Come `decide()` a ogni battuta: `save()` senza attendere il salvataggio precedente.
  const scritture = ['1940', '1940 nelle Alpi', '1940 nel Ridotto alpino'].map(testo => {
    manifest.review = RC.setDecision(manifest.review, 'ridotto-anno', 'manual', { text: 'Nel ' + testo + ' Guisan concentra la difesa.' });
    return h.R.writeManifest(p.svizzera, manifest);
  });
  await Promise.all(scritture);
  // [versione nel manifesto, versione sul disco, versione attesa]: il testo si serializza
  // alla chiamata, prima che la coda risponda. La regola «versione diversa dal disco»
  // avrebbe rifiutato la seconda e la terza battuta. Se un giorno queste righe cambiano,
  // `R.writeManifest` serializza dentro la coda e la regola si può stringere.
  assert.deepEqual(visto, [[16, 16, 16], [16, 17, 17], [16, 18, 18]]);
  const disco = Store.readManifest(p.svizzera);
  assert.equal(disco._storageVersion, 19);
  assert.equal(disco.review.initial.decisions['ridotto-anno'].text, 'Nel 1940 nel Ridotto alpino Guisan concentra la difesa.');
});

test('tre salvataggi in fila, con la versione riportata in memoria come fa il controllore, passano', t => {
  const p = progetti(t);
  sulDisco(p.svizzera, manifestoSvizzera(p.svizzera), 16);
  const m = Store.readManifest(p.svizzera);
  ['accept', 'reject', 'manual'].forEach((choice, i) => {
    m.review = RC.setDecision(m.review, choice === 'accept' ? 'neutra-data' : 'ridotto-anno', choice, { text: 'Nel 1940 Guisan concentra la difesa.' });
    m._storageVersion = Store.saveManifest(p.svizzera, m, m._storageVersion);
    assert.equal(m._storageVersion, 17 + i);
  });
  assert.equal(Store.readManifest(p.svizzera).review.initial.decisions['ridotto-anno'].choice, 'manual');
});

test('una copia vecchia della stessa revisione non torna sul disco', t => {
  const p = progetti(t);
  sulDisco(p.svizzera, manifestoSvizzera(p.svizzera), 16);
  const vecchia = Store.readManifest(p.svizzera);
  const viva = Store.readManifest(p.svizzera);
  ['neutra-data', 'ridotto-anno'].forEach(id => {
    viva.review = RC.setDecision(viva.review, id, 'reject');
    viva._storageVersion = Store.saveManifest(p.svizzera, viva, viva._storageVersion);
  });
  const prima = fotografia(p.svizzera);
  // Un'altra finestra con la copia di prima: porta la SUA versione, 16, e il disco è a 18.
  assert.throws(() => Store.saveManifest(p.svizzera, vecchia, vecchia._storageVersion),
    { message: 'review-conflict: rapporto aggiornato da un altro salvataggio' });
  intatto(p.svizzera, prima);
  // La copia di prima di un successore: anche con la versione attesa aggiornata (quella per
  // percorso), riporterebbe la revisione vecchia al posto della nuova.
  // requireApproved nasce da una modifica VERA del contenuto: la base cambia
  const modificata = clone(SVIZZERA_DB);
  modificata.nodes[1].desc = 'Nel 1939 la Svizzera dichiara di nuovo la neutralità armata.';
  const successore = successoreComeRequireApproved(Store.readManifest(p.svizzera), modificata, p.svizzera, SALTATO);
  assert.equal(successore.review.generationId, viva.review.generationId, 'stesso generationId, come nel codice vero');
  assert.notEqual(successore.review.baseRevision, viva.review.baseRevision);
  successore._storageVersion = Store.saveManifest(p.svizzera, successore, 18);
  const dopo = fotografia(p.svizzera);
  assert.throws(() => Store.saveManifest(p.svizzera, viva, 19), /la revisione salvata \(0 segnalazioni, 0 decisioni\) sarebbe sostituita/);
  intatto(p.svizzera, dopo);
});

test('i manifesti senza versione, e quelli di prima delle versioni, continuano a salvarsi', t => {
  const p = progetti(t);
  // Un vault di prima delle versioni: niente `_storageVersion`, niente `vaultPath`, né sul disco né in memoria.
  const antico = { schema: 'mappai-pipeline@1', steps: { A: { status: 'done', files: [] } }, review: revisioneSvizzera('') };
  delete antico.review.vaultPath;
  sulDisco(p.svizzera, antico);
  const letto = Store.readManifest(p.svizzera);
  letto.review = RC.setDecision(letto.review, 'ridotto-anno', 'reject');
  assert.equal(Store.saveManifest(p.svizzera, letto, 0), 1);
  // Un manifesto appena creato (senza versione) sopra un file senza revisione alla versione 3.
  const senzaRevisione = manifestoSvizzera(p.officina);
  delete senzaRevisione.review;
  sulDisco(p.officina, senzaRevisione, 3);
  const fresco = PC.createManifest({ quiz: { types: ['open'] } }, { vaultPath: p.officina });
  assert.equal(fresco._storageVersion, undefined);
  assert.equal(Store.saveManifest(p.officina, fresco, 3), 4);
  // Una revisione senza `generationId` sul disco non si può confrontare: nessun rifiuto per lei.
  const senzaId = { review: Object.assign(revisioneSvizzera(''), { generationId: undefined }) };
  assert.equal(RC.conflittoDiScrittura(senzaId, { review: revisioneSvizzera('') }, p.svizzera), null);
});

test('la stessa cartella scritta in NFC o NFD, con barre diverse o finali, passa', t => {
  const p = progetti(t);
  const nfd = 'Elettricità - MM'.normalize('NFD'), nfc = nfd.normalize('NFC');
  assert.notEqual(nfd, nfc);
  const cartella = path.join(p.base, 'Mappe', '4R', 'Scienze', nfd);   // come la legge `readdir`
  fs.mkdirSync(cartella, { recursive: true });
  const m = manifestoSvizzera(path.join(p.base, 'Mappe', '4R', 'Scienze', nfc) + path.sep);   // come la tiene la memoria
  assert.equal(Store.saveManifest(cartella, m, 0), 1);
  const letto = Store.readManifest(cartella);
  letto.review = RC.setDecision(letto.review, 'ridotto-anno', 'reject');
  assert.equal(Store.saveManifest(cartella + path.sep, letto, 1), 2);
  // La regola, pura: NFC/NFD, separatori di Windows, barra finale.
  assert.equal(RC.conflittoDiScrittura(null, { vaultPath: '/Mappe/4R/Scienze/' + nfc + '/' }, '/Mappe/4R/Scienze/' + nfd), null);
  assert.equal(RC.conflittoDiScrittura(null, { vaultPath: 'C:\\Mappe\\4R\\' + nfc + '\\' }, 'C:/Mappe/4R/' + nfd), null);
  assert.equal(RC.conflittoDiScrittura({ vaultPath: '/Mappe/' + nfd }, { vaultPath: '/Mappe/' + nfc }, '/Altrove/' + nfc), null,
    'coincide con quello che il file dichiara');
  // Controprova: un'altra cartella resta un'altra cartella.
  assert.equal(RC.conflittoDiScrittura(null, { vaultPath: '/Mappe/4R/Scienze/' + nfc }, '/Mappe/4R/Storia/' + nfc).regola, 'cartella');
});

test('la regola pura: prima scrittura, versioni e revisione', () => {
  const qui = '/Mappe/4R/Storia/Svizzera e 2a GM';
  // La prima scrittura di una cartella: un manifesto nato per lei passa, uno di altrove no.
  assert.equal(RC.conflittoDiScrittura(null, { vaultPath: qui }, qui), null);
  assert.equal(RC.conflittoDiScrittura(null, { vaultPath: '/Mappe/4R/Scienze/Officina Project E' }, qui).motivo,
    'i dati in memoria sono del progetto «Officina Project E», non di «Svizzera e 2a GM»; il file sul disco non è stato toccato, riapri il progetto');
  assert.match(RC.conflittoDiScrittura(null, { vaultPath: qui, _storageVersion: 12 }, qui).motivo, /versione 12 e sul disco il file non c'è/);
  assert.match(RC.conflittoDiScrittura({ vaultPath: qui }, { vaultPath: qui, _storageVersion: 12 }, qui).motivo, /versione 12 e il file sul disco non ne ha,/);
  // Stessa versione o più bassa: passa (la coda); più alta: no.
  assert.equal(RC.conflittoDiScrittura({ _storageVersion: 16 }, { _storageVersion: 16 }, qui), null);
  assert.equal(RC.conflittoDiScrittura({ _storageVersion: 18 }, { _storageVersion: 16 }, qui), null);
  assert.equal(RC.conflittoDiScrittura({ _storageVersion: 16 }, { _storageVersion: '17' }, qui).regola, 'versione');
  // La revisione: stessa generazione passa, successore che la conserva passa, altro no.
  const salvata = { review: { generationId: 'g1', initial: { issues: [{}], decisions: { a: { choice: 'manual' }, b: { choice: 'pending' } } } } };
  assert.equal(RC.conflittoDiScrittura(salvata, { review: { generationId: 'g1' } }, qui), null);
  assert.equal(RC.conflittoDiScrittura(salvata, { review: { generationId: 'g2', previous: { generationId: 'g1' } } }, qui), null);
  assert.equal(RC.conflittoDiScrittura(salvata, { review: { generationId: 'g2', previous: { generationId: 'g0' } } }, qui).motivo,
    'la revisione salvata (1 segnalazione, 1 decisione) sarebbe sostituita da un\'altra che non la conserva; il file sul disco non è stato toccato, riapri il progetto');
  // Stessa generazione ma base diversa (25/9): è un'altra revisione. Passa solo il successore
  // che conserva ESATTAMENTE quella sul disco; la copia vecchia di prima no.
  const conBase = { review: { generationId: 'g1', baseRevision: 'b2', initial: { issues: [], decisions: {} } } };
  assert.equal(RC.conflittoDiScrittura(conBase, { review: { generationId: 'g1', baseRevision: 'b2' } }, qui), null);
  assert.equal(RC.conflittoDiScrittura(conBase, { review: { generationId: 'g1', baseRevision: 'b3', previous: { generationId: 'g1', baseRevision: 'b2' } } }, qui), null);
  assert.equal(RC.conflittoDiScrittura(conBase, { review: { generationId: 'g1', baseRevision: 'b1' } }, qui).regola, 'revisione');
  assert.equal(RC.conflittoDiScrittura(conBase, { review: { generationId: 'g1', baseRevision: 'b3', previous: { generationId: 'g1', baseRevision: 'b1' } } }, qui).regola, 'revisione');
  // Il docente riporta il contenuto alla base: il successore ha la STESSA coppia dell'approvata,
  // e solo `previous` li distingue (seconda revisione, 25/9).
  const approvata = { generationId: 'g1', baseRevision: 'b1', initial: { issues: [], decisions: {} } };
  const riportata = { review: { generationId: 'g1', baseRevision: 'b1', previous: approvata, initial: { issues: [], decisions: {} } } };
  assert.equal(RC.conflittoDiScrittura({ review: approvata }, riportata, qui), null, 'il successore passa');
  assert.equal(RC.conflittoDiScrittura(riportata, { review: approvata }, qui).regola, 'revisione', 'la copia vecchia no');
  assert.equal(RC.conflittoDiScrittura(riportata, { review: { ...riportata.review } }, qui), null, 'la stessa revisione sì');
  // Due cartelle con lo stesso nome: il motivo dice classe e materia.
  assert.match(RC.conflittoDiScrittura(null, { vaultPath: '/Mappe/3B/Storia/Svizzera e 2a GM' }, qui).motivo,
    /progetto «3B › Storia › Svizzera e 2a GM», non di «4R › Storia › Svizzera e 2a GM»/);
  // Senza revisione nel manifesto nuovo decide il magazzino, col suo controllo di sempre.
  assert.equal(RC.conflittoDiScrittura(salvata, {}, qui), null);
});
