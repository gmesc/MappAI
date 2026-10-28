'use strict';
/*
 * main-scritture.test.js — le scritture del vault non lasciano il vault peggio di com'era (packet 0123 lotto 4; 0032).
 *
 * Il codice VERO di main.js, ritagliato dal testo e fatto girare in una vm su cartelle temporanee (come
 * review-store, identita-cartella, riordino-main): mai `require('main.js')`.
 *   1. `save-vault` toglieva gli orfani di `Nodi/` PRIMA di scrivere i nodi, con `unlink`, e anche le note di
 *      Obsidian del docente: un nodo dal nome troppo lungo (ENAMETOOLONG) a metà ciclo lasciava il vault mutilato;
 *   2. le scritture erano `writeFileSync` dirette: un `links.json` troncato non si apriva più;
 *   3. i ripieghi `unlinkSync` (set di studio senza Cestino, `vista.json`);
 *   4. EXDEV: la copia fra dischi fallita lasciava la copia parziale; «Organizza i file» segnava comunque fatto;
 *   5. `vault-relocate` lasciava in `pipeline.json` il percorso vecchio.
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
const FilesCore = require(path.join(ROOT, 'public', 'js', 'mappai-files-core.js'));
const ReviewStore = require(path.join(ROOT, 'public', 'js', 'mappai-review-store.js'));
const NomeCartellaCore = require(path.join(ROOT, 'public', 'js', 'mappai-nome-cartella-core.js'));
const Confini = require(path.join(ROOT, 'public', 'js', 'mappai-confini-core.js'));

function pezzo(da, a) {
    const i = SRC.indexOf(da); assert.ok(i >= 0, 'main.js: ' + da);
    const j = SRC.indexOf(a, i); assert.ok(j > i, 'main.js: ' + a);
    return SRC.slice(i, j);
}
const funzione = (n) => pezzo('function ' + n + '(', '\n}') + '\n}\n';
const sportello = (n) => pezzo("ipcMain.handle('" + n + "',", '\n});') + '\n});\n';

/* main.js in una vm: `fsFinto` per far fallire una chiamata a comando; la casa è la sola radice. */
function mainIn(casa, opts = {}) {
    const handlers = {};
    const cestino = [];
    const ctx = vm.createContext({
        fs: opts.fs || fs, path, Buffer, Date, JSON, crypto, process, Confini, FilesCore, ReviewStore, NomeCartellaCore,
        yaml: require('js-yaml'), console: { log() {}, warn() {}, error() {} },
        ipcMain: { handle: (n, fn) => { handlers[n] = fn; } },
        app: { getPath: () => path.join(casa, 'userData') },
        mappaiRootDir: () => path.join(casa, 'MappAI - file'), documentsDir: () => path.join(casa, 'Documenti'),
        mapsBaseDir: () => path.join(casa, 'MappAI - file', 'Classi'),
        // 0124: vault-relocate conosce anche Allievi/, ricontrolla i pezzi col core e registra la cartella vecchia
        studentsBaseDir: () => path.join(casa, 'MappAI - file', 'Allievi'),
        RiassegnaCopiaCore: require(path.join(ROOT, 'public', 'js', 'mappai-riassegna-copia-core.js')), _cartelleRinominate: new Map(),
        _contaNodiInCartella: () => 0,
        shell: { trashItem: async (p) => { if (opts.cestinoNegato) throw new Error('Cestino negato'); cestino.push(p); fs.rmSync(p, { recursive: true }); } },
        _imp: opts.impostazioni || {}
    });
    vm.runInContext(pezzo('/* ── I CONFINI DEL DISCO', "const ReviewStore = require(")
        + ['_vaultWalkMd', '_vaultPruneEmptyDirs', '_fmDellApp', '_notaDellApp', 'copyRecursiveSync', 'moveDirSafe', '_riparaPipelineSpostata'].map(funzione).join('')
        + ['save-vault', 'load-vault', 'vault-relocate'].map(sportello).join(''), ctx);
    return { h: handlers, cestino, ctx };
}

function casa(t) {
    const c = fs.mkdtempSync(path.join(os.tmpdir(), 'mappai-0123-scritture-'));
    t.after(() => fs.rmSync(c, { recursive: true, force: true }));
    return c;
}
/* Fotografia di una cartella: percorso relativo → impronta. */
function impronta(dir) {
    const out = {};
    (function giro(d, rel) {
        if (!fs.existsSync(d)) return;
        fs.readdirSync(d, { withFileTypes: true }).forEach(e => {
            const p = path.join(d, e.name), r = rel ? rel + '/' + e.name : e.name;
            if (e.isDirectory()) giro(p, r);
            else out[r] = crypto.createHash('sha1').update(fs.readFileSync(p)).digest('hex');
        });
    })(dir, '');
    return out;
}
const MAPPA = (etichette) => ({
    rootNodeLabel: 'Clima', extractionMode: 'mindmap', projectId: 'proj_1790000000001',
    nodes: etichette.map((l, i) => ({ id: 'n' + i, label: l, desc: 'Testo ' + l + '.', level: i ? 1 : 0, group: i })),
    links: etichette.slice(1).map((l, i) => ({ source: 'n0', target: 'n' + (i + 1), rel: 'comprende' }))
});
const OBSIDIAN = '---\ntags: [clima, idee]\naliases: [appunti]\n---\n\n# Le mie idee sul clima\n\nNota scritta a mano in Obsidian.\n';

test('save-vault: un nodo dal nome troppo lungo a metà ciclo lascia tutti i file di prima, e la nota di Obsidian resta', async t => {
    const c = casa(t), m = mainIn(c);
    const v = path.join(c, 'MappAI - file', 'Classi', '4R', 'Geografia', 'Clima');
    let r = await m.h['save-vault']({}, { folderPath: v, mapData: MAPPA(['Clima', 'Atmosfera', 'Oceani', 'Ghiacci']) });
    assert.equal(r.success, true, r.error);
    // i file di prima sono di un minuto fa: quello del nome nuovo sarà il più recente
    const unMinutoFa = new Date(Date.now() - 60000);
    fs.readdirSync(path.join(v, 'Nodi')).forEach(n => fs.utimesSync(path.join(v, 'Nodi', n), unMinutoFa, unMinutoFa));
    fs.writeFileSync(path.join(v, 'Nodi', 'mie idee.md'), OBSIDIAN);
    fs.mkdirSync(path.join(v, 'Nodi', 'Diario'));
    fs.writeFileSync(path.join(v, 'Nodi', 'Diario', '2026-10-23.md'), '# Oggi\n\nsenza frontmatter\n');
    const prima = impronta(v);
    // rinomino due nodi (i loro file cambiano nome) e il terzo ha un nome oltre il limite del disco
    const dopo = MAPPA(['Clima', 'Atmosfera e venti', 'x'.repeat(300), 'Ghiacciai']);
    r = await m.h['save-vault']({}, { folderPath: v, mapData: dopo });
    assert.equal(r.success, false, 'il nome troppo lungo fa fallire il salvataggio');
    assert.match(r.error, /ENAMETOOLONG|name too long/i);
    const ora = impronta(v);
    Object.keys(prima).forEach(f => assert.ok(f in ora, 'c\'è ancora: ' + f));
    assert.equal(ora['Nodi/mie idee.md'], prima['Nodi/mie idee.md'], 'la nota di Obsidian è intatta');
    assert.equal(ora['links.json'], prima['links.json'], 'i file scritti prima del guasto sono interi (atomici)');
    assert.deepEqual(Object.keys(ora).filter(f => /\.tmp$/.test(f)), [], 'nessun temporaneo orfano');
    // e il vault si riapre con i nodi di prima
    const l = await m.h['load-vault']({}, v);
    assert.equal(l.success, true, l.error);
    const nodi = Array.from(l.data.nodes, n => n.id + ':' + n.label).sort();
    assert.deepEqual(nodi, ['n0:Clima', 'n1:Atmosfera e venti', 'n2:Oceani', 'n3:Ghiacci'],
        'quattro nodi, uno per id: del nodo rinominato prima del guasto vale il file più recente, la nota non è un nodo');
});

test('una nota di Obsidian in Nodi/ (con frontmatter, o con --- nel testo) non diventa un nodo, e la mappa si salva ancora', async t => {
    const c = casa(t), m = mainIn(c);
    const v = path.join(c, 'MappAI - file', 'Classi', '4R', 'Geografia', 'Clima');
    await m.h['save-vault']({}, { folderPath: v, mapData: MAPPA(['Clima', 'Atmosfera']) });
    fs.writeFileSync(path.join(v, 'Nodi', 'mie idee.md'), OBSIDIAN);
    fs.writeFileSync(path.join(v, 'Nodi', 'separatori.md'), 'Titolo\n---\nsezione\n---\naltro\n');
    fs.writeFileSync(path.join(v, 'Nodi', 'zettel.md'), '---\nid: 202610231200\ntags: [zettel]\n---\n\nUna nota con un id suo, senza etichetta.\n');
    const l = await m.h['load-vault']({}, v);
    assert.deepEqual(Array.from(l.data.nodes, n => n.label).sort(), ['Atmosfera', 'Clima']);
    const r = await m.h['save-vault']({}, { folderPath: v, mapData: Object.assign(MAPPA(['Clima']), { nodes: l.data.nodes, links: l.data.links }) });
    assert.equal(r.success, true, r.error);
    assert.ok(['mie idee.md', 'separatori.md', 'zettel.md'].every(n => fs.existsSync(path.join(v, 'Nodi', n))), 'le note restano');
});

test('un nodo dal nome lungo, ma dentro il limite del disco, si scrive ancora (il temporaneo ha un nome corto)', async t => {
    const c = casa(t), m = mainIn(c);
    const v = path.join(c, 'MappAI - file', 'Classi', '4R', 'Geografia', 'Clima');
    const lunga = 'L'.repeat(244);   // «l…l_n1.md» = 250 byte: sotto i 255 del disco
    const r = await m.h['save-vault']({}, { folderPath: v, mapData: MAPPA(['Clima', lunga]) });
    assert.equal(r.success, true, r.error);
    assert.ok(fs.readdirSync(path.join(v, 'Nodi')).some(n => n.length === 250));
});

test('save-vault riuscito: gli orfani dell\'app vanno in .vecchi/ (fuori da Nodi/), le note del docente restano dove sono', async t => {
    const c = casa(t), m = mainIn(c);
    const v = path.join(c, 'MappAI - file', 'Classi', '4R', 'Geografia', 'Clima');
    await m.h['save-vault']({}, { folderPath: v, mapData: MAPPA(['Clima', 'Atmosfera', 'Oceani']) });
    fs.writeFileSync(path.join(v, 'Nodi', 'mie idee.md'), OBSIDIAN);
    const vecchio = fs.readdirSync(path.join(v, 'Nodi')).find(n => n.startsWith('atmosfera_'));
    const testoVecchio = fs.readFileSync(path.join(v, 'Nodi', vecchio), 'utf8');
    const r = await m.h['save-vault']({}, { folderPath: v, mapData: MAPPA(['Clima', 'Atmosfera e venti', 'Oceani']) });
    assert.equal(r.success, true, r.error);
    const nodi = fs.readdirSync(path.join(v, 'Nodi')).sort();
    assert.ok(nodi.includes('mie idee.md'), 'la nota di Obsidian resta in Nodi/');
    assert.ok(!nodi.includes(vecchio), 'il file del nome vecchio non è più fra i nodi');
    assert.ok(nodi.some(n => n.startsWith('atmosfera_e_venti_')));
    assert.equal(fs.readFileSync(path.join(v, '.vecchi', 'Nodi', vecchio), 'utf8'), testoVecchio, 'messo da parte, non cancellato');
    const l = await m.h['load-vault']({}, v);
    assert.deepEqual(Array.from(l.data.nodes, n => n.label).filter(x => /Atmosfera/.test(x)), ['Atmosfera e venti'], 'il nodo vecchio non torna in mappa');
    // un secondo giro con lo stesso orfano dal nome uguale non sovrascrive quello già messo da parte
    await m.h['save-vault']({}, { folderPath: v, mapData: MAPPA(['Clima', 'Atmosfera', 'Oceani']) });
    await m.h['save-vault']({}, { folderPath: v, mapData: MAPPA(['Clima', 'Atmosfera e venti', 'Oceani']) });
    assert.ok(fs.existsSync(path.join(v, '.vecchi', 'Nodi', vecchio.replace(/\.md$/, ' (2).md'))));
});

test('scriviAtomico: un rename che fallisce lascia il file vecchio intatto e nessun temporaneo', async t => {
    const c = casa(t);
    const fsFinto = Object.assign({}, fs, { renameSync: (a, b) => { if (/links\.json$/.test(b)) throw Object.assign(new Error('EIO finto'), { code: 'EIO' }); return fs.renameSync(a, b); } });
    const v = path.join(c, 'MappAI - file', 'Classi', 'Senza classe', 'Storia', 'Guisan');
    let r = await mainIn(c).h['save-vault']({}, { folderPath: v, mapData: MAPPA(['Guisan', 'Ridotto']) });
    assert.equal(r.success, true, r.error);
    const prima = fs.readFileSync(path.join(v, 'links.json'));
    r = await mainIn(c, { fs: fsFinto }).h['save-vault']({}, { folderPath: v, mapData: MAPPA(['Guisan', 'Ridotto', 'Rapporto del Grütli']) });
    assert.equal(r.success, false);
    assert.deepEqual(fs.readFileSync(path.join(v, 'links.json')), prima, 'links.json di prima, intero');
    assert.deepEqual(fs.readdirSync(v).filter(n => /\.tmp$/.test(n)), [], 'nessun temporaneo orfano');
});

test('set di studio senza Cestino e vista.json tolta: in .vecchi/, mai cancellati', async t => {
    const c = casa(t), m = mainIn(c, { cestinoNegato: true });
    const v = path.join(c, 'MappAI - file', 'Classi', '4R', 'Storia', 'Svizzera');
    const set = (id, titolo) => ({ id, type: 'quiz', title: titolo, items: [{ q: 'Chi?', a: 'Guisan' }] });
    const conSet = Object.assign(MAPPA(['Svizzera', 'Ridotto']), { studySets: [set('set_1', 'Uno'), set('set_2', 'Due')], vista: { studio: { aperta: true } } });
    let r = await m.h['save-vault']({}, { folderPath: v, mapData: conSet });
    assert.equal(r.success, true, r.error);
    const studio = path.join(v, 'Materiale Studio');
    const fileSet2 = fs.readdirSync(studio).find(n => fs.readFileSync(path.join(studio, n), 'utf8').includes('"set_2"'));
    assert.ok(fileSet2);
    const vista = fs.readFileSync(path.join(v, 'vista.json'));
    r = await m.h['save-vault']({}, { folderPath: v, mapData: Object.assign(MAPPA(['Svizzera', 'Ridotto']), { studySets: [set('set_1', 'Uno')], vista: null }) });
    assert.equal(r.success, true, r.error);
    await new Promise(res => setTimeout(res, 20));   // la potatura dei set è asincrona (il Cestino)
    assert.equal(fs.existsSync(path.join(studio, fileSet2)), false, 'il set tolto non è più fra i materiali');
    assert.ok(fs.existsSync(path.join(v, '.vecchi', 'Materiale Studio', fileSet2)), 'il set tolto è in .vecchi/');
    assert.equal(fs.existsSync(path.join(v, 'vista.json')), false, 'vista.json non c\'è più');
    assert.deepEqual(fs.readFileSync(path.join(v, '.vecchi', 'vista.json')), vista, 'vista.json è in .vecchi/');
});

test('main.js: nessun unlinkSync su un file dell\'utente — restano solo i file dell\'app', () => {
    const righe = SRC.split('\n').map((r, i) => ({ r, n: i + 1 })).filter(x => /unlinkSync\(/.test(x.r));
    // i cinque dell'app: il temporaneo della visione, la cache della voce (tre), il registro errori, il segnaposto di sessione
    const ammessi = [/unlinkSync\(fuori\)/, /unlinkSync\(f\);?\s*\}/, /unlinkSync\(vecchio\.file\)/, /unlinkSync\(v\.file\)/, /fs\.existsSync\(f\)\) fs\.unlinkSync\(f\)/];
    righe.forEach(x => assert.ok(ammessi.some(re => re.test(x.r)), 'unlinkSync non ammesso a main.js:' + x.n + ' → ' + x.r.trim()));
    assert.equal(righe.length, 6, 'i sei unlinkSync dei file dell\'app (visione, tre della cache TTS, registro errori, sessione)');
});

test('vault-relocate fra due dischi: la copia fallita a metà si toglie, l\'origine resta intera', async t => {
    const c = casa(t);
    const base = path.join(c, 'MappAI - file', 'Classi');
    const v = path.join(base, '4R', 'Storia', 'Svizzera');
    await mainIn(c).h['save-vault']({}, { folderPath: v, mapData: MAPPA(['Svizzera', 'Ridotto', 'Guisan']) });
    const prima = impronta(v);
    const fsFinto = Object.assign({}, fs, {
        renameSync: (a, b) => { if (a === v) throw Object.assign(new Error('EXDEV finto'), { code: 'EXDEV' }); return fs.renameSync(a, b); },
        cpSync: (a, b, o) => { fs.mkdirSync(b, { recursive: true }); fs.writeFileSync(path.join(b, 'index.yaml'), 'mezzo'); throw Object.assign(new Error('ENOSPC finto'), { code: 'ENOSPC' }); }
    });
    const r = await mainIn(c, { fs: fsFinto }).h['vault-relocate']({}, { folderPath: v, classDir: '4S', discDir: 'Storia' });
    assert.equal(r.success, false);
    assert.deepEqual(impronta(v), prima, 'l\'origine è intera');
    assert.equal(fs.existsSync(path.join(base, '4S', 'Storia', 'Svizzera')), false, 'la copia parziale è stata tolta');
});

test('vault-relocate: pipeline.json resta com\'era (la mappa aperta lo ha in memoria; 0032 punto 5 rinviato)', async t => {
    const c = casa(t), m = mainIn(c);
    const base = path.join(c, 'MappAI - file', 'Classi');
    const v = path.join(base, '4R', 'Storia', 'Svizzera');
    await m.h['save-vault']({}, { folderPath: v, mapData: MAPPA(['Svizzera', 'Ridotto']) });
    ReviewStore.saveManifest(v, { vaultPath: v, steps: { sintesi: { file: path.join(v, 'Materiale Studio', 'Sintesi.pdf') } } }, 0);
    const prima = fs.readFileSync(path.join(v, 'pipeline.json'));
    const r = await m.h['vault-relocate']({}, { folderPath: v, classDir: '4S', discDir: 'Storia' });
    assert.equal(r.success, true, r.error);
    const nuovo = path.join(base, '4S', 'Storia', 'Svizzera');
    assert.equal(r.fullPath, nuovo);
    assert.deepEqual(fs.readFileSync(path.join(nuovo, 'pipeline.json')), prima, 'la versione e il percorso che ha in memoria la mappa aperta');
});

test('moveDirSafe fra due dischi: copia fallita → via la copia parziale, origine intatta, l\'errore sale', t => {
    const c = casa(t);
    const da = path.join(c, 'Documenti', 'MappAI - Vault', 'Clima'), a = path.join(c, 'MappAI - file', 'Mappe', 'Clima');
    fs.mkdirSync(path.join(da, 'Nodi'), { recursive: true });
    fs.writeFileSync(path.join(da, 'index.yaml'), 'rootNodeLabel: Clima\n');
    fs.writeFileSync(path.join(da, 'Nodi', 'a.md'), '# a\n');
    const prima = impronta(da);
    let n = 0;
    const fsFinto = Object.assign({}, fs, {
        renameSync: () => { throw Object.assign(new Error('EXDEV finto'), { code: 'EXDEV' }); },
        copyFileSync: (x, y) => { if (++n > 1) throw Object.assign(new Error('ENOSPC finto'), { code: 'ENOSPC' }); return fs.copyFileSync(x, y); }
    });
    const m = mainIn(c, { fs: fsFinto });
    assert.throws(() => m.ctx.moveDirSafe(da, a), /ENOSPC/);
    assert.deepEqual(impronta(da), prima);
    assert.equal(fs.existsSync(a), false);
});
