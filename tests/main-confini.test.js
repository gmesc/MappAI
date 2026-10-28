'use strict';
/*
 * main-confini.test.js — gli sportelli di main.js che toccano il disco non escono dalle cartelle dell'app
 * (packet 0123 lotto 4; 0027).
 *
 * Gli handler VERI ritagliati dal testo di main.js e fatti girare in una vm con `fs` vero su una casa
 * temporanea: «MappAI - file», userData e Documenti sono le radici; `fuori/LaunchAgents` e `fuori/.ssh`
 * stanno fuori. Per ogni sportello un percorso fuori è rifiutato e uno dentro accettato. Il ponte per i
 * progetti salvati fuori con «Esporta nel Vault» (una cartella con l'index.yaml dell'app) ha le sue righe.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');

const ROOT = path.join(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'main.js'), 'utf8');
const js = (n) => require(path.join(ROOT, 'public', 'js', n));
const FilesCore = js('mappai-files-core.js');

function pezzo(da, a) {
    const i = SRC.indexOf(da); assert.ok(i >= 0, 'main.js: ' + da);
    const j = SRC.indexOf(a, i); assert.ok(j > i, 'main.js: ' + a);
    return SRC.slice(i, j);
}
const funzione = (n) => pezzo('function ' + n + '(', '\n}') + '\n}\n';
const sportello = (n) => pezzo("ipcMain.handle('" + n + "',", '\n});') + '\n});\n';

const SPORTELLI = ['save-vault-file', 'read-vault-file', 'pipeline-open-file', 'save-chat-transcript', 'upload-file-gemini', 'parse-docx',
    'immagine-prepara', 'save-vault', 'load-vault', 'write-branch-locks', 'list-vault-subfolders', 'read-study-sessions',
    'vault-materials-list', 'vault-sources-list', 'vault-consegne-list', 'save-quiz-text-response', 'save-study-record',
    'load-dungeon-floors', 'save-dungeon-materials', 'save-dungeon-ruleset', 'save-dungeon-floor', 'export-dungeon-bundle',
    'collab-start-session', 'files-setup', 'pick-folder', 'pick-file', 'files-root-choose', 'delete-vault'];

function mainIn(casa) {
    const handlers = {}, aperti = [], mostrati = [], rete = [], cestinati = [];
    const dialog = { showOpenDialog: async () => ({ canceled: false, filePaths: [mainIn.scelta] }), showSaveDialog: async () => ({ canceled: true }) };
    const ctx = vm.createContext({
        fs, path, Buffer, Date, JSON, crypto, process, console: { log() {}, warn() {}, error() {} },
        Confini: js('mappai-confini-core.js'), FilesCore, ReviewStore: js('mappai-review-store.js'), VisioneCore: js('mappai-visione-core.js'),
        yaml: require('js-yaml'), dialog, mainWindow: null, BrowserWindow: { fromWebContents: () => null },
        require: (m) => m === 'electron' ? { dialog } : require(m),
        ipcMain: { handle: (n, fn) => { handlers[n] = fn; } },
        shell: { openPath: async (p) => { aperti.push(p); return ''; }, showItemInFolder: (p) => { mostrati.push(p); }, trashItem: async (p) => { cestinati.push(p); } },
        https: { request: () => { rete.push(1); throw new Error('nessuna rete nelle prove'); } },
        mammoth: { extractRawText: async () => ({ value: 'testo del docx' }) },
        app: { getPath: () => path.join(casa, 'userData') },
        mappaiRootDir: () => path.join(casa, 'MappAI - file'), documentsDir: () => path.join(casa, 'Documenti'),
        mapsBaseDir: () => path.join(casa, 'MappAI - file', 'Classi'), studentsBaseDir: () => path.join(casa, 'MappAI - file', 'Allievi'),
        ripiegoDir: (n) => path.join(casa, 'MappAI - file', 'Sistema', n),
        // 0124: `cartellaAmmessa` legge `ponteFuori` dalle impostazioni, per le sole cartelle fuori
        readSettings: () => mainIn.impostazioni || {},
        _contaNodiInCartella: () => 0, collabSrv: null
    });
    vm.runInContext(pezzo('/* ── I CONFINI DEL DISCO', 'const ReviewStore = require(')
        + ['_vaultWalkMd', '_vaultPruneEmptyDirs', '_fmDellApp', '_notaDellApp'].map(funzione).join('')
        + "const EST_APRIBILI = " + pezzo("const EST_APRIBILI = ", ';\n').slice('const EST_APRIBILI = '.length) + ';\n'
        + SPORTELLI.map(sportello).join(''), ctx);
    return { h: handlers, aperti, mostrati, rete, cestinati, ctx };
}

function casa(t) {
    const c = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'mappai-0123-confini-')));
    t.after(() => fs.rmSync(c, { recursive: true, force: true }));
    const p = (...s) => path.join(c, ...s);
    const vault = (...s) => { const d = p(...s); fs.mkdirSync(path.join(d, 'Nodi'), { recursive: true }); fs.writeFileSync(path.join(d, 'index.yaml'), 'projectId: proj_1790000000001\nextractionMode: mindmap\nrootNodeLabel: Clima\n'); return d; };
    fs.mkdirSync(p('fuori', 'LaunchAgents'), { recursive: true });
    fs.mkdirSync(p('fuori', '.ssh'), { recursive: true });
    fs.writeFileSync(p('fuori', '.ssh', 'id_ed25519'), 'CHIAVE PRIVATA');
    return { c, p, vault, dentro: vault('MappAI - file', 'Classi', '4R', 'Geografia', 'Clima'), launch: p('fuori', 'LaunchAgents'), ssh: p('fuori', '.ssh') };
}
const FUORI = /fuori dalle cartelle dell'app/;

test('save-vault-file / read-vault-file: LaunchAgents e .ssh rifiutati, il vault dentro accettato', async t => {
    const k = casa(t), m = mainIn(k.c);
    let r = await m.h['save-vault-file']({}, { vaultPath: k.launch, relPath: 'x.plist', text: '<plist/>' });
    assert.equal(r.ok, false); assert.match(r.error, FUORI);
    assert.equal(fs.existsSync(path.join(k.launch, 'x.plist')), false, 'nessun file nato in LaunchAgents');
    // un index.yaml qualunque (una cartella Helm, un altro programma) non basta: servono le chiavi dell'app
    fs.writeFileSync(path.join(k.launch, 'index.yaml'), 'apiVersion: v1\nentries: {}\n');
    r = await m.h['save-vault-file']({}, { vaultPath: k.launch, relPath: 'x.plist', text: '<plist/>' });
    assert.equal(r.ok, false);
    r = await m.h['read-vault-file']({}, { vaultPath: k.ssh, relPath: 'id_ed25519' });
    assert.equal(r.ok, false); assert.match(r.error, FUORI); assert.equal(r.base64, undefined);
    r = await m.h['save-vault-file']({}, { vaultPath: k.dentro, relPath: 'Materiale Studio/Sintesi.html', text: '<h1>Clima</h1>' });
    assert.equal(r.ok, true, r.error);
    r = await m.h['read-vault-file']({}, { vaultPath: k.dentro, relPath: 'Materiale Studio/Sintesi.html' });
    assert.equal(Buffer.from(r.base64, 'base64').toString(), '<h1>Clima</h1>');
    // la radice stessa («MappAI - file», senza index.yaml): le figure scrivono in Sistema/Figure
    r = await m.h['save-vault-file']({}, { vaultPath: k.p('MappAI - file'), relPath: 'Sistema/Figure/indice.json', text: '{}' });
    assert.equal(r.ok, true, r.error);
});

test('save-vault-file: una sottocartella del vault che è un link verso fuori non porta fuori', async t => {
    const k = casa(t), m = mainIn(k.c);
    fs.symlinkSync(k.launch, path.join(k.dentro, 'Materiale Studio'));
    const r = await m.h['save-vault-file']({}, { vaultPath: k.dentro, relPath: 'Materiale Studio/x.plist', text: '<plist/>' });
    assert.equal(r.ok, false); assert.match(r.error, FUORI);
    assert.deepEqual(fs.readdirSync(k.launch), []);
    const l = await m.h['read-vault-file']({}, { vaultPath: k.dentro, relPath: 'Materiale Studio/x.plist' });
    assert.equal(l.ok, false);
});

/* 0124 (ADR 0025): il ponte del lotto 4 dello 0123 è chiuso. Prima questa prova chiedeva
   che un progetto salvato fuori con «Esporta nel Vault» si aprisse e si salvasse ancora;
   con «Esporta» uscito, un progetto fuori sparisce dall'app (Giacomo, 24/10). Il ponte
   torna solo con `ponteFuori: true` nelle impostazioni, o con la cartella scelta col dialogo. */
test('il ponte è chiuso (0124): un progetto salvato fuori con l\'index.yaml dell\'app è rifiutato; torna con ponteFuori o col dialogo', async t => {
    const k = casa(t), m = mainIn(k.c);
    const scrivania = k.vault('Scrivania', 'Clima esportato');
    const indice = fs.readFileSync(path.join(scrivania, 'index.yaml'), 'utf8');
    let r = await m.h['load-vault']({}, scrivania);
    assert.equal(r.success, false); assert.match(r.error, FUORI);
    r = await m.h['save-vault']({}, { folderPath: scrivania, mapData: { rootNodeLabel: 'Clima', extractionMode: 'mindmap', nodes: [{ id: 'a', label: 'Clima', level: 0, group: 0 }], links: [] } });
    assert.equal(r.success, false); assert.match(r.error, FUORI);
    r = await m.h['save-vault-file']({}, { vaultPath: scrivania, relPath: 'Fonti/fonti.json', text: '{}' });
    assert.equal(r.ok, false); assert.match(r.error, FUORI);
    assert.equal(fs.readFileSync(path.join(scrivania, 'index.yaml'), 'utf8'), indice, 'la cartella fuori non si tocca');
    assert.equal(fs.existsSync(path.join(scrivania, 'Fonti', 'fonti.json')), false);
    // l'interruttore rimette il ponte
    mainIn.impostazioni = { ponteFuori: true };
    try {
        r = await m.h['load-vault']({}, scrivania);
        assert.equal(r.success, true, r.error);
    } finally { mainIn.impostazioni = null; }
    // una cartella NUOVA fuori dalle radici no, finché il docente non la sceglie col dialogo
    const nuova = k.p('Scrivania', 'Nuovo progetto');
    r = await m.h['save-vault']({}, { folderPath: nuova, mapData: { rootNodeLabel: 'Nuovo', nodes: [], links: [] } });
    assert.equal(r.success, false); assert.match(r.error, FUORI);
    assert.equal(fs.existsSync(nuova), false, 'la cartella non è nata');
    mainIn.scelta = k.p('Scrivania');
    const scelta = await m.h['pick-folder']();
    assert.equal(scelta.folderPath, k.p('Scrivania'));
    r = await m.h['save-vault']({}, { folderPath: nuova, mapData: { rootNodeLabel: 'Nuovo', nodes: [], links: [] } });
    assert.equal(r.success, true, 'scelta col dialogo: vale per la sessione');
});

test('save-vault: una cartella fuori rifiutata; un\'immagine presa da .ssh non entra in Allegati', async t => {
    const k = casa(t), m = mainIn(k.c);
    let r = await m.h['save-vault']({}, { folderPath: path.join(k.launch, 'Clima'), mapData: { rootNodeLabel: 'x', nodes: [], links: [] } });
    assert.equal(r.success, false); assert.match(r.error, FUORI);
    assert.equal(fs.existsSync(path.join(k.launch, 'Clima')), false);
    fs.writeFileSync(path.join(k.ssh, 'foto.jpg'), 'CHIAVE');
    const foto = k.p('MappAI - file', 'Classi', 'foto buona.jpg'); fs.writeFileSync(foto, 'JPEG');
    r = await m.h['save-vault']({}, { folderPath: k.dentro, mapData: { rootNodeLabel: 'Clima', extractionMode: 'mindmap',
        nodes: [{ id: 'a', label: 'Clima', level: 0, group: 0, images: [path.join(k.ssh, 'foto.jpg'), foto] }], links: [] } });
    assert.equal(r.success, true, r.error);
    const allegati = fs.readdirSync(path.join(k.dentro, 'Allegati'));
    assert.deepEqual(allegati, ['a_1.jpg'], 'entra solo l\'immagine delle cartelle dell\'app');
    assert.equal(fs.readFileSync(path.join(k.dentro, 'Allegati', 'a_1.jpg'), 'utf8'), 'JPEG');
});

test('pipeline-open-file: le consegne che si eseguono si MOSTRANO nel Finder; pdf e immagini si aprono', async t => {
    const k = casa(t), m = mainIn(k.c);
    const cons = path.join(k.dentro, 'Consegne', '4R-07'); fs.mkdirSync(cons, { recursive: true });
    ['x.sh', 'x.command', 'relazione.pdf.exe', 'x.pdf', 'Foto.JPG', 'x.html', 'x.docx'].forEach(n => fs.writeFileSync(path.join(cons, n), 'x'));
    fs.mkdirSync(path.join(cons, 'x.app'));
    fs.symlinkSync(path.join(k.ssh, 'id_ed25519'), path.join(cons, 'chiave.pdf'));
    const prova = async (n) => m.h['pipeline-open-file']({}, { vaultPath: k.dentro, relPath: 'Consegne/4R-07/' + n });
    for (const n of ['x.sh', 'x.command', 'relazione.pdf.exe', 'x.app', 'x.docx']) {
        const r = await prova(n);
        assert.deepEqual({ ok: r.ok, mostrato: r.mostrato }, { ok: true, mostrato: true }, n);
    }
    assert.equal(m.aperti.length, 0, 'nessun file eseguibile passato al sistema');
    assert.equal(m.mostrati.length, 5);
    // un link travestito da pdf che porta in .ssh: la regola risolve il link ed è fuori da Mappe
    const link = await prova('chiave.pdf');
    assert.equal(link.ok, false); assert.equal(m.aperti.length, 0);
    for (const n of ['x.pdf', 'Foto.JPG', 'x.html']) {
        const r = await prova(n);
        assert.equal(r.ok, true); assert.equal(r.mostrato, undefined, n);
    }
    assert.deepEqual(m.aperti.map(p => path.basename(p)), ['x.pdf', 'Foto.JPG', 'x.html']);
    // e fuori da Mappe resta rifiutato come prima
    const r = await m.h['pipeline-open-file']({}, { vaultPath: k.ssh, relPath: 'id_ed25519' });
    assert.equal(r.ok, false);
});

test('save-chat-transcript: `../` nel nome e nella sottocartella resta nel vault; un vault fuori è rifiutato', async t => {
    const k = casa(t), m = mainIn(k.c);
    let r = await m.h['save-chat-transcript']({}, { projectName: 'Clima', targetName: '../../x', textContent: 'ciao', vaultPath: k.dentro, subFolder: '../x' });
    assert.equal(r.success, true, r.error);
    assert.ok(r.path.startsWith(k.dentro + path.sep), r.path);
    assert.equal(path.dirname(path.dirname(r.path)), k.dentro, 'una sottocartella sola, dentro il vault');
    assert.equal(path.basename(path.dirname(r.path)), 'x', 'la sottocartella è «x», senza punti né spazi in testa');
    assert.deepEqual(fs.readdirSync(k.c).sort(), ['MappAI - file', 'fuori'], 'niente nato accanto al vault o in casa');
    r = await m.h['save-chat-transcript']({}, { projectName: 'x', targetName: 'y', textContent: 'z', vaultPath: k.launch });
    assert.equal(r.success, false); assert.match(r.error, FUORI);
    assert.deepEqual(fs.readdirSync(k.launch), []);
});

test('fonti di CREA (upload a Gemini, docx, immagini): conta il tipo, mai una cartella nascosta', async t => {
    const k = casa(t), m = mainIn(k.c);
    await assert.rejects(m.h['upload-file-gemini']({}, { apiKey: 'k', filePath: path.join(k.ssh, 'id_ed25519'), mimeType: 'application/pdf' }));
    fs.writeFileSync(k.p('fuori', 'programma.exe'), 'MZ');
    await assert.rejects(m.h['upload-file-gemini']({}, { apiKey: 'k', filePath: k.p('fuori', 'programma.exe'), mimeType: 'video/mp4' }));
    assert.equal(m.rete.length, 0, 'niente partito verso la rete');
    fs.writeFileSync(path.join(k.ssh, 'x.docx'), 'PK');
    await assert.rejects(m.h['parse-docx']({}, path.join(k.ssh, 'x.docx')));
    fs.writeFileSync(k.p('fuori', 'Verifica.docx'), 'PK');
    assert.equal(await m.h['parse-docx']({}, k.p('fuori', 'Verifica.docx')), 'testo del docx', 'un docx da Scaricati si legge');
    fs.writeFileSync(path.join(k.ssh, 'foto.jpg'), 'x');
    const r = await m.h['immagine-prepara']({}, { path: path.join(k.ssh, 'foto.jpg'), quale: 'scheda' });
    assert.deepEqual({ ok: r.ok, motivo: r.motivo }, { ok: false, motivo: 'fuori' });
});

test('gli altri sportelli del vault: una cartella fuori è rifiutata, quella dentro accettata', async t => {
    const k = casa(t), m = mainIn(k.c);
    const fuori = k.launch, dentro = k.dentro;
    const casi = [
        ['load-vault', (v) => v, (r) => r.success],
        ['write-branch-locks', (v) => ({ folderPath: v, locks: {} }), (r) => r.success],
        ['list-vault-subfolders', (v) => path.dirname(v), (r) => !r.error],
        ['read-study-sessions', (v) => v, (r) => !r.error],
        ['vault-materials-list', (v) => ({ vaultPath: v }), (r) => r.ok],
        ['vault-sources-list', (v) => ({ vaultPath: v }), (r) => r.ok],
        ['vault-consegne-list', (v) => ({ vaultPath: v }), (r) => r.ok],
        ['save-quiz-text-response', (v) => ({ title: 'Q', textContent: 'r', vaultPath: v }), (r) => r.success],
        ['save-study-record', (v) => ({ vaultPath: v, dateStr: '2026-10-23', markdownLine: '- x', jsonRecord: {} }), (r) => r.success],
        ['load-dungeon-floors', (v) => v, (r) => r.success],
        ['save-dungeon-materials', (v) => ({ vaultPath: v, materials: {} }), (r) => r.success],
        ['save-dungeon-ruleset', (v) => ({ vaultPath: v, ruleset: {} }), (r) => r.success],
        ['save-dungeon-floor', (v) => ({ vaultPath: v, plan: { id: 'piano-1' } }), (r) => r.success],
    ];
    fs.mkdirSync(path.join(fuori, 'Nodi'), { recursive: true });
    for (const [n, arg, ok] of casi) {
        const no = await m.h[n]({}, arg(fuori));
        assert.equal(!!ok(no), false, n + ' fuori');
        assert.match(String(no.error || ''), FUORI, n + ' dice perché');
        const si = await m.h[n]({}, arg(dentro));
        assert.equal(!!ok(si), true, n + ' dentro: ' + (si && si.error));
    }
    assert.deepEqual(fs.readdirSync(fuori), ['Nodi'], 'niente scritto in LaunchAgents');
    // export-dungeon-bundle: fuori rifiutato, e gli id sono solo numeri
    let r = await m.h['export-dungeon-bundle']({ sender: null }, { vaultPath: fuori, ids: ['1'] });
    assert.match(r.error, FUORI);
    r = await m.h['export-dungeon-bundle']({ sender: null }, { vaultPath: dentro, ids: ['../../../fuori/.ssh/id_ed25519'] });
    assert.equal(r.success, false); assert.match(r.error, /ids non validi/);
    // write-branch-locks: una chiave di ramo con `../` non scrive fuori da Nodi/
    fs.mkdirSync(path.join(dentro, 'Nodi', 'g1_cause'));
    r = await m.h['write-branch-locks']({}, { folderPath: dentro, locks: { '../..': { editable: false }, g1_cause: { editable: true } } });
    assert.equal(r.success, true);
    assert.equal(fs.existsSync(path.join(path.dirname(dentro), '_lock.yaml')), false);
    assert.equal(fs.existsSync(path.join(dentro, 'Nodi', 'g1_cause', '_lock.yaml')), true);
});

test('collab-start-session e files-setup: una cartella fuori è rifiutata prima di toccare qualunque cosa', async t => {
    const k = casa(t), m = mainIn(k.c);
    let r = await m.h['collab-start-session']({}, { name: 'Lavagna', resumeDir: k.ssh });
    assert.equal(r.success, false); assert.match(r.error, FUORI);
    r = await m.h['files-setup']({}, { filesRoot: k.p('fuori') });
    assert.deepEqual({ success: r.success, error: r.error }, { success: false, error: 'posizione-non-valida' });
    assert.equal(fs.existsSync(k.p('fuori', 'MappAI - file')), false);
    // scelta col dialogo: la sola «MappAI - file» che nascerà lì diventa radice, non tutta la posizione
    mainIn.scelta = k.p('fuori');
    await m.h['files-root-choose']();
    assert.equal(m.ctx.dentroRadici(k.p('fuori', 'MappAI - file', 'Classi')), true);
    assert.equal(m.ctx.dentroRadici(k.p('fuori', '.ssh', 'id_ed25519')), false);
    // pick-file: il solo file scelto
    mainIn.scelta = path.join(k.ssh, 'id_ed25519');
    await m.h['pick-file']();
    assert.equal(m.ctx.dentroRadici(path.join(k.ssh, 'id_ed25519')), true);
    assert.equal(m.ctx.dentroRadici(path.join(k.ssh, 'altro')), false);
});

test('delete-vault: la cartella base scritta con altre maiuscole o con un link resta la base, e non va nel Cestino', async t => {
    const k = casa(t), m = mainIn(k.c);
    const base = k.p('MappAI - file', 'Classi');
    for (const p of [base, base + '/', k.p('MappAI - file', 'classi'), k.p('MappAI - file', 'CLASSI')]) {
        const r = await m.h['delete-vault']({}, { folderPath: p });
        assert.equal(r.success, false, p);
    }
    fs.symlinkSync(base, k.p('scorciatoia'));
    assert.equal((await m.h['delete-vault']({}, { folderPath: k.p('scorciatoia') })).success, false, 'un link alla base');
    assert.deepEqual(m.cestinati, []);
    const r = await m.h['delete-vault']({}, { folderPath: k.dentro });
    assert.equal(r.success, true, 'un progetto dentro sì');
    assert.deepEqual(m.cestinati, [k.dentro]);
});

test('userData non è una radice: le impostazioni dell\'app non si scrivono da save-vault-file', async t => {
    const k = casa(t), m = mainIn(k.c);
    fs.mkdirSync(k.p('userData'), { recursive: true });
    fs.writeFileSync(k.p('userData', 'mappai-settings.json'), '{"filesOrganized":true}');
    assert.equal(m.ctx.dentroRadici(k.p('userData', 'mappai-settings.json')), false);
    const r = await m.h['save-vault-file']({}, { vaultPath: k.p('userData'), relPath: 'mappai-settings.json', text: '{"filesRoot":"/"}' });
    assert.equal(r.ok, false);
    assert.equal(fs.readFileSync(k.p('userData', 'mappai-settings.json'), 'utf8'), '{"filesOrganized":true}');
});

test('main.js: una regola sola — niente più startsWith(base + path.sep) nelle guardie, save-pdf-to-vault tolto, il ripiego della stampa sanificato', () => {
    assert.equal(SRC.indexOf("ipcMain.handle('save-pdf-to-vault'"), -1, 'save-pdf-to-vault tolto');
    const stampa = pezzo("ipcMain.handle('vault-file-print',", '\n});');
    assert.ok(!/openPath\(path\.join\(vaultPath, relPath\)\)/.test(stampa), 'il ripiego non apre relPath così com\'è');
    /* restano: le due risalite che ripuliscono le cartelle vuote (non sono guardie) e i tre controlli che
       tests/rinomina-vault e tests/riordino-main (fuori dal perimetro dello 0123) ritagliano senza gli aiutanti */
    const righe = SRC.split('\n').filter(r => /startsWith\(.*path\.sep\)/.test(r)).map(r => r.trim());
    assert.equal(righe.length, 5, righe.join('\n'));
    assert.equal(righe.filter(r => /^while \(up !== /.test(r)).length, 2, 'le due risalite');
    assert.ok(righe.some(r => /basi\.some\(b => from !== b && from\.startsWith/.test(r)), 'vault-rename');
    assert.equal(righe.filter(r => /^if \(!path\.resolve\((dest|dir)\)\.startsWith/.test(r)).length, 2, 'class-doc-save e student-folder-ensure');
});
