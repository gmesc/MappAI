/* 0095 — la copia di un vault in Mappe/ (ADR 0021): `importaVaultInfo` e
   `importaVaultCopia` VERE, ritagliate da main.js ed eseguite su cartelle
   temporanee. La sorgente deve restare identica byte per byte. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const vm = require('node:vm');
const crypto = require('node:crypto');

const ROOT = path.join(__dirname, '..');
const FilesCore = require(path.join(ROOT, 'public', 'js', 'mappai-files-core.js'));

function funzioniVere() {
    const src = fs.readFileSync(path.join(ROOT, 'main.js'), 'utf8');
    const a = src.indexOf('function importaDentroDi(');
    const b = src.indexOf("ipcMain.handle('import-vault-info'");
    assert.ok(a > 0 && b > a, 'le funzioni dell\'import stanno in main.js, prima dei loro handler');
    const ctx = {
        fs, path, FilesCore, yaml: require('js-yaml'), console,
        NomeCartellaCore: require(path.join(ROOT, 'public', 'js', 'mappai-nome-cartella-core.js')),
        require: (p) => require(p.startsWith('./') ? path.join(ROOT, p) : p)
    };
    vm.createContext(ctx);
    vm.runInContext(src.slice(a, b) + ';this.info = importaVaultInfo; this.copia = importaVaultCopia; this.dentro = importaDentroDi;', ctx);
    return ctx;
}
const F = funzioniVere();

function impronta(dir) {
    const out = {};
    (function giro(d, rel) {
        fs.readdirSync(d, { withFileTypes: true }).forEach(e => {
            const p = path.join(d, e.name), r = rel ? rel + '/' + e.name : e.name;
            if (e.isDirectory()) { out[r + '/'] = 'dir'; giro(p, r); }
            else out[r] = crypto.createHash('sha1').update(fs.readFileSync(p)).digest('hex');
        });
    })(dir, '');
    return out;
}

function banco() {
    const t = fs.mkdtempSync(path.join(os.tmpdir(), 'mappai-0095-'));
    const maps = path.join(t, 'MappAI - file', 'Mappe');
    const students = path.join(t, 'MappAI - file', 'Allievi');
    fs.mkdirSync(maps, { recursive: true });
    const fuori = path.join(t, 'Scaricati');
    fs.mkdirSync(fuori);
    return { t, maps, students, fuori, dove: { maps, students } };
}

const VECCHIO = '/Users/collega/Documents/MappAI - file/Mappe/4R/Geografia/I fiumi';
function vaultDiProva(dir, opts) {
    opts = opts || {};
    fs.mkdirSync(path.join(dir, 'Nodi'), { recursive: true });
    fs.mkdirSync(path.join(dir, 'Fonti'), { recursive: true });
    fs.mkdirSync(path.join(dir, 'Allegati'), { recursive: true });
    const index = (opts.projectId ? 'projectId: ' + opts.projectId + '\n' : '') +
        'extractionMode: mindmap\nrootNodeLabel: I fiumi\nclasse: 4R\nmateria: Geografia\n' +
        'generationUsage:\n  costRecords:\n    - projectId: proj_1700000000000\n      runId: g1\nlastUpdated: 2026-09-01T10:00:00.000Z\n';
    fs.writeFileSync(path.join(dir, 'index.yaml'), opts.index != null ? opts.index : index);
    fs.writeFileSync(path.join(dir, 'links.json'), '[]');
    fs.writeFileSync(path.join(dir, 'Nodi', 'Il Po.md'), '---\nid: n1\n---\nIl Po nasce dal Monviso.\n');
    fs.writeFileSync(path.join(dir, 'Fonti', 'fiumi.pdf'), crypto.randomBytes(300000));
    fs.writeFileSync(path.join(dir, 'Allegati', 'foto.png'), crypto.randomBytes(2000));
    if (opts.pipeline !== false) {
        fs.writeFileSync(path.join(dir, 'pipeline.json'), JSON.stringify({
            schema: 'mappai-pipeline@1', vaultPath: VECCHIO,
            review: { vaultPath: VECCHIO, final: { review: { vaultPath: VECCHIO } }, deliveries: [{ final: { review: { vaultPath: VECCHIO } } }] },
            modelliGiro: { chiamate: [{ vaultPath: '' }, { vaultPath: VECCHIO }, { vaultPath: '/altro/vault' }] }
        }, null, 2));
    }
    return dir;
}

test('2 · info: index.yaml letto (anche riga per riga), e se la cartella sta già in Mappe/ o in Allievi/', () => {
    const b = banco();
    const src = vaultDiProva(path.join(b.fuori, 'I fiumi'));
    const i = F.info(src, b.dove);
    assert.equal(i.ok, true);
    assert.equal(i.haIndice, true);
    assert.equal(i.dentro, false);
    assert.equal(i.nome, 'I fiumi');
    assert.equal(i.indice.classe, '4R');
    assert.equal(i.indice.materia, 'Geografia');
    assert.equal(i.indice.rootNodeLabel, 'I fiumi');
    assert.equal(i.indice.projectId, undefined);
    assert.equal(i.indice.dossier, undefined);
    /* D9: un dossier da foto lo dice index.yaml */
    const foto = vaultDiProva(path.join(b.fuori, 'Foto'), { index: 'rootNodeLabel: Foto\ndossier: true\nclasse: 3A\n' });
    assert.equal(F.info(foto, b.dove).indice.dossier, 'true');
    /* un index.yaml che yaml.load non legge: riga per riga */
    const rotto = vaultDiProva(path.join(b.fuori, 'Rotto'), { index: 'projectId: "proj_1790000000000"\nrootNodeLabel: Titolo: rotto: davvero\nuserProfile: {"a": 1\nclasse: 3A\nmateria: Storia\n' });
    const r = F.info(rotto, b.dove);
    assert.equal(r.indice.projectId, 'proj_1790000000000');
    assert.equal(r.indice.classe, '3A');
    assert.equal(r.indice.materia, 'Storia');
    /* già dentro: Mappe/ e Allievi/ */
    const inMappe = vaultDiProva(path.join(b.maps, '3A', 'Storia', 'Già qui'));
    assert.equal(F.info(inMappe, b.dove).dentro, true);
    const inAllievi = vaultDiProva(path.join(b.students, 'Ugo', 'Mappe', 'Sua'));
    assert.equal(F.info(inAllievi, b.dove).dentro, true);
    /* una cartella d'archivio accanto a Mappe/ NON è dentro: si importa (D3) */
    const arch = vaultDiProva(path.join(b.t, 'MappAI - file', 'Archivio', 'Mappe fino al 28-09-2026', '4R', 'Vecchia'));
    assert.equal(F.info(arch, b.dove).dentro, false);
    /* senza index.yaml (D4) e cartella che non c'è */
    fs.mkdirSync(path.join(b.fuori, 'Vuota'));
    assert.equal(F.info(path.join(b.fuori, 'Vuota'), b.dove).haIndice, false);
    assert.equal(F.info(path.join(b.fuori, 'Nessuna'), b.dove).ok, false);
});

test('2 · copia: tutta la cartella in Mappe/<classe>/<materia>/<nome>, con l\'id e i percorsi; la sorgente identica', async () => {
    const b = banco();
    const src = vaultDiProva(path.join(b.fuori, 'I fiumi'));
    const prima = impronta(src);
    const r = await F.copia({ src, classDir: '4R', discDir: 'Geografia', nome: 'I fiumi', projectId: 'proj_1795000000000' }, b.dove);
    assert.equal(r.ok, true, r.error);
    const dest = path.join(b.maps, '4R', 'Geografia', 'I fiumi');
    assert.equal(r.folderPath, dest);
    assert.deepEqual(impronta(src), prima, 'la sorgente non cambia di un byte');
    /* tutto copiato: i file uguali, tranne index.yaml e pipeline.json */
    const dopo = impronta(dest);
    assert.deepEqual(Object.keys(dopo).sort(), Object.keys(prima).sort());
    Object.keys(prima).filter(k => k !== 'index.yaml' && k !== 'pipeline.json').forEach(k => assert.equal(dopo[k], prima[k], k));
    /* index.yaml: l'id in testa, classe e materia di chi l'ha fatto (D2), il resto identico */
    const idx = fs.readFileSync(path.join(dest, 'index.yaml'), 'utf8');
    assert.equal(idx, 'projectId: proj_1795000000000\n' + fs.readFileSync(path.join(src, 'index.yaml'), 'utf8'));
    assert.equal(require('js-yaml').load(idx).projectId, 'proj_1795000000000');
    /* pipeline.json: i percorsi del vault sulla copia; vuoti e altri vault no (D6) */
    const man = JSON.parse(fs.readFileSync(path.join(dest, 'pipeline.json'), 'utf8'));
    assert.equal(r.percorsi, 5);
    assert.equal(man.vaultPath, dest);
    assert.equal(man.review.vaultPath, dest);
    assert.equal(man.review.final.review.vaultPath, dest);
    assert.equal(man.review.deliveries[0].final.review.vaultPath, dest);
    assert.deepEqual(man.modelliGiro.chiamate.map(c => c.vaultPath), ['', dest, '/altro/vault']);
});

test('2 · copia senza classe: Mappe/Generico/<nome>; senza pipeline.json va bene lo stesso', async () => {
    const b = banco();
    const src = vaultDiProva(path.join(b.fuori, 'Sola'), { pipeline: false, projectId: 'proj_1790000000000' });
    const r = await F.copia({ src, classDir: null, discDir: '', nome: 'Sola', projectId: 'proj_1790000000000' }, b.dove);
    assert.equal(r.ok, true, r.error);
    assert.equal(r.folderPath, path.join(b.maps, 'Generico', 'Sola'));
    assert.equal(r.percorsi, 0);
    const idx = fs.readFileSync(path.join(r.folderPath, 'index.yaml'), 'utf8');
    assert.equal(idx.split('\n').filter(l => l.startsWith('projectId:')).length, 1);
    assert.ok(!fs.existsSync(path.join(r.folderPath, 'pipeline.json')));
});

test('2 · i rifiuti: non-vault, dentro, esiste, dentro-se-stessa, id; nessuna scrittura', async () => {
    const b = banco();
    fs.mkdirSync(path.join(b.fuori, 'Vuota'));
    assert.equal((await F.copia({ src: path.join(b.fuori, 'Vuota'), nome: 'Vuota', projectId: 'proj_1795000000000' }, b.dove)).error, 'non-vault');
    const inMappe = vaultDiProva(path.join(b.maps, '3A', 'Storia', 'Già qui'));
    assert.equal((await F.copia({ src: inMappe, classDir: '3A', discDir: 'Storia', nome: 'Altro', projectId: 'proj_1795000000000' }, b.dove)).error, 'dentro');
    const src = vaultDiProva(path.join(b.fuori, 'I fiumi'));
    assert.equal((await F.copia({ src, classDir: '3A', discDir: 'Storia', nome: 'X', projectId: 'tutor_ai_projects' }, b.dove)).error, 'id');
    /* la destinazione c'è già: non si tocca niente di quello che c'era */
    const occupata = path.join(b.maps, '3A', 'Storia', 'I fiumi');
    fs.mkdirSync(occupata, { recursive: true });
    fs.writeFileSync(path.join(occupata, 'mio.txt'), 'mio');
    const e = await F.copia({ src, classDir: '3A', discDir: 'Storia', nome: 'I fiumi', projectId: 'proj_1795000000000' }, b.dove);
    assert.equal(e.error, 'esiste');
    assert.deepEqual(fs.readdirSync(occupata), ['mio.txt']);
    /* una cartella scelta che contiene Mappe/: si copierebbe dentro se stessa */
    const madre = path.join(b.t, 'MappAI - file');
    fs.writeFileSync(path.join(madre, 'index.yaml'), 'rootNodeLabel: x\n');
    const s = await F.copia({ src: madre, classDir: null, discDir: '', nome: 'Madre', projectId: 'proj_1795000000000' }, b.dove);
    assert.equal(s.error, 'dentro-se-stessa');
    assert.ok(!fs.existsSync(path.join(b.maps, 'Generico', 'Madre')));
});

test('2 · un errore a metà copia non lascia una cartella mezza', async (t) => {
    const b = banco();
    const src = vaultDiProva(path.join(b.fuori, 'Rotta'));
    /* un file illeggibile: la copia si ferma lì */
    const chiuso = path.join(src, 'Allegati', 'chiuso.bin');
    fs.writeFileSync(chiuso, 'x');
    fs.chmodSync(chiuso, 0o000);
    try {
        let leggibile = true; try { fs.readFileSync(chiuso); } catch (e) { leggibile = false; }
        if (leggibile) { t.skip('da root il permesso non ferma niente: la prova non direbbe nulla'); return; }
        const r = await F.copia({ src, classDir: '4R', discDir: 'Geografia', nome: 'Rotta', projectId: 'proj_1795000000000' }, b.dove);
        assert.equal(r.ok, false);
        assert.match(r.error, /^copia: /);
        assert.ok(!fs.existsSync(path.join(b.maps, '4R', 'Geografia', 'Rotta')), 'niente cartella mezza');
    } finally { fs.chmodSync(chiuso, 0o644); }
});

test('2 · main.js: l\'import non tocca altro che le sue funzioni e i suoi due handler', () => {
    const src = fs.readFileSync(path.join(ROOT, 'main.js'), 'utf8');
    assert.equal((src.match(/ipcMain\.handle\('import-vault-(info|copy)'/g) || []).length, 2);
    const pre = fs.readFileSync(path.join(ROOT, 'public', 'js', 'preload.js'), 'utf8');
    assert.match(pre, /importVaultInfo: \(data\) => ipcRenderer\.invoke\('import-vault-info', data\)/);
    assert.match(pre, /importVaultCopy: \(data\) => ipcRenderer\.invoke\('import-vault-copy', data\)/);
});

test('2 · D10: con un id nuovo, l\'id vecchio sparisce da tutti i file di testo della copia (la lettura); la sorgente e i binari restano', async () => {
    const b = banco();
    const X = 'proj_1791447609803', Z = 'proj_1780000000000', NUOVO = 'proj_1795000000000';
    const src = path.join(b.fuori, 'Lettura-' + X);
    vaultDiProva(src, { pipeline: false, index: 'projectId: ' + X + '\nextractionMode: lettura\nrootNodeLabel: Volpe\nclasse: 1A\nmateria: Italiano\n' });
    fs.writeFileSync(path.join(src, 'pipeline.json'), JSON.stringify({
        vaultPath: VECCHIO, reading: { kind: 'percorso-lettura', projectId: X, percorsoId: 'p1' },
        review: { projectId: X, vaultPath: VECCHIO }, altro: { projectId: Z }
    }, null, 2));
    fs.mkdirSync(path.join(src, 'Materiale Studio', 'Sorgenti'), { recursive: true });
    fs.writeFileSync(path.join(src, 'Materiale Studio', 'Sorgenti', 'Percorso-lettura-p1.json'), JSON.stringify({ projectId: X, percorsoId: 'p1' }));
    fs.writeFileSync(path.join(src, 'Materiale Studio', 'Verifica.html'), '<html data-progetto="' + X + '">' + X + '</html>');
    fs.writeFileSync(path.join(src, 'Allegati', 'dati.bin'), Buffer.from('xx ' + X + ' xx'));
    const prima = impronta(src);
    const r = await F.copia({ src, classDir: '1A', discDir: 'Italiano', nome: 'Lettura-' + X, projectId: NUOVO }, b.dove);
    assert.equal(r.ok, true, r.error);
    assert.deepEqual(impronta(src), prima, 'la sorgente non cambia');
    assert.ok(r.idCambiati >= 4, 'index.yaml, pipeline.json, il percorso e la verifica');
    const d = r.folderPath;
    const man = JSON.parse(fs.readFileSync(path.join(d, 'pipeline.json'), 'utf8'));
    assert.equal(man.reading.projectId, NUOVO);
    assert.equal(man.review.projectId, NUOVO);
    assert.equal(man.review.vaultPath, d);
    assert.equal(man.altro.projectId, Z, 'un altro progetto non si tocca');
    assert.equal(JSON.parse(fs.readFileSync(path.join(d, 'Materiale Studio', 'Sorgenti', 'Percorso-lettura-p1.json'), 'utf8')).projectId, NUOVO);
    assert.ok(!fs.readFileSync(path.join(d, 'Materiale Studio', 'Verifica.html'), 'utf8').includes(X));
    assert.ok(fs.readFileSync(path.join(d, 'Allegati', 'dati.bin')).includes(X), 'i file non di testo restano com\'erano');
    const idx = fs.readFileSync(path.join(d, 'index.yaml'), 'utf8');
    assert.equal(idx.split('\n').filter(l => l.startsWith('projectId:')).join(), 'projectId: ' + NUOVO);
    /* l'apertura della lettura controlla questo (openVault, mappai-percorso-lettura.js) */
    const draft = JSON.parse(fs.readFileSync(path.join(d, 'Materiale Studio', 'Sorgenti', 'Percorso-lettura-p1.json'), 'utf8'));
    assert.ok(draft.projectId === NUOVO && draft.projectId === man.reading.projectId && man.review.projectId === draft.projectId && man.review.vaultPath === d);
});

test('2 · D10: id tenuto, niente da sostituire; senza id in index.yaml vale quello della revisione', async () => {
    const b = banco();
    const tenuto = vaultDiProva(path.join(b.fuori, 'Tenuto'), { projectId: 'proj_1790000000000' });
    const r1 = await F.copia({ src: tenuto, classDir: '3A', discDir: 'Storia', nome: 'Tenuto', projectId: 'proj_1790000000000' }, b.dove);
    assert.equal(r1.idCambiati, 0);
    const senza = vaultDiProva(path.join(b.fuori, 'Senza'), { pipeline: false });
    fs.writeFileSync(path.join(senza, 'pipeline.json'), JSON.stringify({ vaultPath: VECCHIO, review: { projectId: 'proj_1791818366293', vaultPath: VECCHIO } }));
    const r2 = await F.copia({ src: senza, classDir: '3A', discDir: 'Storia', nome: 'Senza', projectId: 'proj_1795000000000' }, b.dove);
    assert.equal(JSON.parse(fs.readFileSync(path.join(r2.folderPath, 'pipeline.json'), 'utf8')).review.projectId, 'proj_1795000000000');
});
