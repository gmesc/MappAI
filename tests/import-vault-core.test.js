/* 0095 — il piano puro dell'importazione di un vault (ADR 0021).
   Il nome libero è quello VERO della rinomina (0094, `MappAINomeCartellaCore`). */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const vm = require('node:vm');

const JS = p => path.join(__dirname, '..', 'public', 'js', p);
const IV = require(JS('mappai-import-vault-core.js'));
const FILES = require(JS('mappai-files-core.js'));

/* il nome libero è quello della rinomina (0094): `MappAINomeCartellaCore.nomeLibero` → { nome, suffisso } */
const NC = require(JS('mappai-nome-cartella-core.js'));
const nomeLibero = (nome, fratelli) => NC.nomeLibero(nome, fratelli, []);

const CLASSI = [{ name: '3A', sede: '' }, { name: '4R', sede: '' }];
const MATERIE = ['Storia', 'Italiano'];
const base = (over) => Object.assign({
    indice: { projectId: 'proj_1790000000000', classe: '3A', materia: 'Storia', rootNodeLabel: 'La Rivoluzione francese' },
    nomeOrigine: 'La Rivoluzione francese',
    cartelle: [], voci: [], classi: CLASSI, materieMie: MATERIE, nomeLibero, ora: () => 1795000000000
}, over || {});

test('1 · classe e materia del docente: Mappe/<classe>/<materia>/<nome>, niente che manca', () => {
    const p = IV.pianoImport(base());
    assert.deepEqual(p.mancano, []);
    assert.deepEqual(p.destinazione.segmenti, ['3A', 'Storia', 'La Rivoluzione francese']);
    assert.equal(p.destinazione.classDir, '3A');
    assert.equal(p.destinazione.discDir, 'Storia');
    assert.equal(p.destinazione.suffisso, false);
    assert.equal(p.titolo, 'La Rivoluzione francese');
    assert.equal(p.classe.mia, true);
    assert.equal(p.materia.mia, true);
});

test('1 · maiuscole e forma Unicode non contano; vince la grafia del docente', () => {
    const p = IV.pianoImport(base({ indice: { classe: '3a', materia: 'storia' } }));
    assert.deepEqual(p.mancano, []);
    assert.deepEqual(p.destinazione.segmenti.slice(0, 2), ['3A', 'Storia']);
    const nfd = 'Educazione civica'.normalize('NFD') + ' e societa\u0300';
    const p2 = IV.pianoImport(base({ materieMie: ['Educazione civica e società'], indice: { classe: '3A', materia: nfd } }));
    assert.deepEqual(p2.mancano, []);
    assert.equal(p2.materia.nome, 'Educazione civica e società');
});

test('1 · senza classe: <base>/Senza classe/<nome> (0104, N5: era Generico), e la materia non fa cartella', () => {
    const p = IV.pianoImport(base({ indice: { classe: '', materia: '' } }));
    assert.deepEqual(p.destinazione.segmenti, ['Senza classe', 'La Rivoluzione francese']);
    assert.equal(p.destinazione.classDir, null);
    assert.deepEqual(p.mancano, []);
    const q = IV.pianoImport(base({ indice: { classe: '', materia: 'Geografia' } }));
    assert.deepEqual(q.destinazione.segmenti, ['Senza classe', 'La Rivoluzione francese']);
    assert.deepEqual(q.mancano, ['materia']);
});

test('1 · che cosa manca: la materia, la classe, tutte e due (D1: la classe resta una cartella)', () => {
    const m = IV.pianoImport(base({ indice: { classe: '3A', materia: 'Geografia' } }));
    assert.deepEqual(m.mancano, ['materia']);
    assert.deepEqual(m.destinazione.segmenti, ['3A', 'Geografia', 'La Rivoluzione francese']);
    const c = IV.pianoImport(base({ indice: { classe: '2B', materia: 'Storia' } }));
    assert.deepEqual(c.mancano, ['classe']);
    assert.deepEqual(c.destinazione.segmenti, ['2B', 'Storia', 'La Rivoluzione francese']);
    assert.equal(c.classe.mia, false);
    const cm = IV.pianoImport(base({ indice: { classe: '2B', materia: 'Geografia' } }));
    assert.deepEqual(cm.mancano, ['classe', 'materia']);
    assert.deepEqual(cm.destinazione.segmenti, ['2B', 'Geografia', 'La Rivoluzione francese']);
});

test('1 · la sede della classe del docente entra nella cartella della classe', () => {
    const p = IV.pianoImport(base({ classi: [{ name: '3A', sede: 'Bedigliora' }] }));
    assert.deepEqual(p.destinazione.segmenti.slice(0, 2), ['Bedigliora-3A', 'Storia']);
});

test('1 · il nome è quello della cartella importata, ripulito con la regola dei nomi', () => {
    const p = IV.pianoImport(base({ nomeOrigine: 'Rivoluzione: 1789?' }));
    assert.equal(p.destinazione.nome, FILES.vaultFolderName('Rivoluzione: 1789?'));
    assert.equal(p.destinazione.nome, 'Rivoluzione 1789');
    /* senza nome della cartella: il titolo della mappa */
    const q = IV.pianoImport(base({ nomeOrigine: '' }));
    assert.equal(q.destinazione.nome, 'La Rivoluzione francese');
});

test('1 · nome già usato nella destinazione: « · 02», poi « · 03»; altrove non conta', () => {
    const cartelle = [
        { folderName: 'La Rivoluzione francese', classDir: '3A', discDir: 'Storia' },
        { folderName: 'Altra mappa', classDir: '3A', discDir: 'Storia' },
        { folderName: 'La Rivoluzione francese · 07', classDir: '3A', discDir: 'Italiano' }
    ];
    const p = IV.pianoImport(base({ cartelle }));
    assert.equal(p.destinazione.nome, 'La Rivoluzione francese · 02');
    assert.equal(p.destinazione.suffisso, true);
    assert.equal(p.destinazione.segmenti[2], 'La Rivoluzione francese · 02');
    cartelle.push({ folderName: 'La Rivoluzione francese · 02', classDir: '3A', discDir: 'Storia' });
    assert.equal(IV.pianoImport(base({ cartelle })).destinazione.nome, 'La Rivoluzione francese · 03');
    /* maiuscole e forma diverse nel nome e nella cartella della classe: è lo stesso nome */
    const q = IV.pianoImport(base({ cartelle: [{ folderName: 'LA RIVOLUZIONE FRANCESE', classDir: '3a', discDir: 'storia' }] }));
    assert.equal(q.destinazione.nome, 'La Rivoluzione francese · 02');
    /* stesso nome in un'altra materia: libero */
    const r = IV.pianoImport(base({ indice: { classe: '3A', materia: 'Italiano' }, cartelle: [{ folderName: 'La Rivoluzione francese', classDir: '3A', discDir: 'Storia' }] }));
    assert.equal(r.destinazione.nome, 'La Rivoluzione francese');
    assert.equal(r.destinazione.suffisso, false);
});

test('1 · l\'id si tiene se nessuna cartella e nessuna voce del cassetto ce l\'ha', () => {
    const p = IV.pianoImport(base({ cartelle: [{ folderName: 'X', projectId: 'proj_1780000000000' }], voci: [{ id: 'proj_1781000000000' }] }));
    assert.deepEqual(p.id, { valore: 'proj_1790000000000', tenuto: true, motivo: 'tenuto' });
});

test('1 · l\'id occupato da una cartella o da una voce: uno nuovo, valido e libero', () => {
    const daCartella = IV.pianoImport(base({ cartelle: [{ folderName: 'X', projectId: 'proj_1790000000000' }] }));
    assert.equal(daCartella.id.tenuto, false);
    assert.equal(daCartella.id.motivo, 'occupato');
    assert.equal(daCartella.id.valore, 'proj_1795000000000');
    assert.ok(FILES.idProgettoValido(daCartella.id.valore));
    const daVoce = IV.pianoImport(base({ voci: [{ id: 'proj_1790000000000' }, { id: 'proj_1795000000000' }] }));
    assert.equal(daVoce.id.motivo, 'occupato');
    assert.equal(daVoce.id.valore, 'proj_1795000000001');
});

test('1 · vault senza id valido (beta 1-5, o un valore scritto a mano): ne riceve uno', () => {
    ['', undefined, 'tutor_ai_projects', 'proj_12'].forEach(idSorgente => {
        const p = IV.pianoImport(base({ indice: { projectId: idSorgente, classe: '3A', materia: 'Storia' } }));
        assert.equal(p.id.tenuto, false);
        assert.equal(p.id.motivo, 'assente');
        assert.ok(FILES.idProgettoValido(p.id.valore));
    });
});

test('1 · «Scegli tu»: una classe e una materia del docente, o Generico; una classe non sua si rifiuta', () => {
    const cartelle = [{ folderName: 'La Rivoluzione francese', classDir: '4R', discDir: 'Italiano' }];
    const p = IV.pianoImport(base({ indice: { classe: '2B', materia: 'Geografia' }, cartelle }));
    const q = { classi: CLASSI, cartelle, nomeLibero };
    const d = IV.destinazioneScelta(p, { classe: '4r', materia: 'Italiano' }, q);
    assert.deepEqual(d.segmenti, ['4R', 'Italiano', 'La Rivoluzione francese · 02']);
    assert.equal(d.suffisso, true);
    const g = IV.destinazioneScelta(p, { classe: '', materia: 'Italiano' }, q);
    assert.deepEqual(g.segmenti, ['Senza classe', 'La Rivoluzione francese']);   // 0104, N5: era Generico
    const senzaMateria = IV.destinazioneScelta(p, { classe: '3A', materia: '' }, q);
    assert.deepEqual(senzaMateria.segmenti, ['3A', 'La Rivoluzione francese']);
    assert.throws(() => IV.destinazioneScelta(p, { classe: '2B', materia: 'Storia' }, q), /non del docente/);
});

test('1 · indiceConId: projectId in testa, le altre righe identiche', () => {
    const vecchio = 'extractionMode: mindmap\nrootNodeLabel: La Rivoluzione\nclasse: 4R\nmateria: Geografia\ngenerationUsage:\n  costRecords:\n    - projectId: proj_1700000000000\n      runId: g1\nlastUpdated: 2026-09-01\n';
    const nuovo = IV.indiceConId(vecchio, 'proj_1795000000000');
    assert.equal(nuovo, 'projectId: proj_1795000000000\n' + vecchio);
    /* un id già in testa si sostituisce, quello annidato nei consumi no */
    const due = IV.indiceConId(nuovo, 'proj_1796000000000');
    assert.equal(due, 'projectId: proj_1796000000000\n' + vecchio);
    assert.match(due, /    - projectId: proj_1700000000000/);
    /* classe e materia di chi l'ha fatto restano (D2) */
    assert.match(due, /^classe: 4R$/m);
    assert.match(due, /^materia: Geografia$/m);
});

test('1 · indiceConId: anche un index.yaml che yaml.load non legge; CRLF, BOM e «---» si rispettano', () => {
    const rotto = 'rootNodeLabel: Titolo: con due punti: rotto\nuserProfile: {"nickname": "Ugo"\nclasse: 3A\n';
    const out = IV.indiceConId(rotto, 'proj_1795000000000');
    assert.equal(out, 'projectId: proj_1795000000000\n' + rotto);
    const crlf = IV.indiceConId('\uFEFFprojectId: "proj_1700000000000"\r\nclasse: 3A\r\n', 'proj_1795000000000');
    assert.equal(crlf, '\uFEFFprojectId: proj_1795000000000\r\nclasse: 3A\r\n');
    const doc = IV.indiceConId('---\nclasse: 3A', 'proj_1795000000000');
    assert.equal(doc, '---\nprojectId: proj_1795000000000\nclasse: 3A\n');
    assert.equal(IV.indiceConId('', 'proj_1795000000000'), 'projectId: proj_1795000000000\n');
    assert.throws(() => IV.indiceConId('classe: 3A\n', 'tutor_ai_projects'), /id non valido/);
});

test('1 · vecchiDelManifesto: la sorgente e il vaultPath in cima, senza doppioni né vuoti', () => {
    assert.deepEqual(IV.vecchiDelManifesto({ vaultPath: '/Users/collega/Mappe/4R/Geo/X' }, '/Users/me/Downloads/X/'),
        ['/Users/me/Downloads/X', '/Users/collega/Mappe/4R/Geo/X']);
    assert.deepEqual(IV.vecchiDelManifesto({ vaultPath: '/a/X/' }, '/a/X'), ['/a/X']);
    assert.deepEqual(IV.vecchiDelManifesto({ vaultPath: '' }, '/a/X'), ['/a/X']);
    assert.deepEqual(IV.vecchiDelManifesto(null, '/a/X'), ['/a/X']);
});

test('1 · D10: gli id vecchi del vault sono quelli di index.yaml e del manifesto (lettura, revisione), validi e diversi dal nuovo', () => {
    const man = { reading: { projectId: 'proj_1791447609803' }, review: { projectId: 'proj_1791447609803' } };
    assert.deepEqual(IV.idVecchiDelVault('proj_1791447609803', man, 'proj_1795000000000'), ['proj_1791447609803']);
    /* index senza id (beta 1-5), la revisione ne dichiara uno: è il vecchio del vault */
    assert.deepEqual(IV.idVecchiDelVault('', { review: { projectId: 'proj_1791818366293' } }, 'proj_1795000000000'), ['proj_1791818366293']);
    /* id tenuto: niente da sostituire; forme non valide ignorate */
    assert.deepEqual(IV.idVecchiDelVault('proj_1791447609803', man, 'proj_1791447609803'), []);
    assert.deepEqual(IV.idVecchiDelVault('tutor_ai_projects', { review: { projectId: 'x' } }, 'proj_1795000000000'), []);
    assert.deepEqual(IV.idVecchiDelVault(undefined, null, 'proj_1795000000000'), []);
});

test('1 · D10: sostituisciId cambia solo i token interi uguali a un id vecchio', () => {
    const t = '{"projectId":"proj_1791447609803","altro":"proj_1780000000000","lungo":"proj_17914476098031","dentro":"xproj_1791447609803","path":"/M/Lettura-proj_1791447609803/x"}';
    const r = IV.sostituisciId(t, ['proj_1791447609803'], 'proj_1795000000000');
    assert.equal(r.cambi, 2);
    assert.equal(r.testo, '{"projectId":"proj_1795000000000","altro":"proj_1780000000000","lungo":"proj_17914476098031","dentro":"xproj_1791447609803","path":"/M/Lettura-proj_1795000000000/x"}');
    assert.deepEqual(IV.sostituisciId(t, [], 'proj_1795000000000'), { testo: t, cambi: 0 });
    assert.equal(IV.sostituisciId(t, ['proj_1791447609803'], 'non valido').cambi, 0);
});
