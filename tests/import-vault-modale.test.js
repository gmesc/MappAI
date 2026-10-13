/* 0095 — il flusso di «Importa dal Vault» nella UI (ADR 0021): i moduli VERI
   (FilesCore, il core dei nomi dello 0094 per il nome libero, il core e la UI dell'import) in
   una `vm`, con un motore dei modali finto che registra che cosa gli si chiede
   di disegnare e risponde come il docente, e IPC finti. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const vm = require('node:vm');

const JS = p => path.join(__dirname, '..', 'public', 'js', p);

function banco(o) {
    o = o || {};
    const store = Object.assign({}, o.ls || {});
    const reg = { modali: [], conferme: [], avvisi: [], copie: [], toast: [], salvaClassi: 0 };
    /* D8: i tre campi del modale come li vede il DOM (il motore li monta dentro `open`) */
    const dom = o.dom || null;
    const campoDom = (sel) => { const m = /data-campo="([^"]+)"/.exec(String(sel)); return (dom && m && dom[m[1]]) || null; };
    const ctx = {
        console: { log() {}, info() {}, warn() {}, error() {} },
        setTimeout, clearTimeout,
        document: { getElementById: () => null, querySelector: (sel) => campoDom(sel), querySelectorAll: () => [], addEventListener() {} },
        appState: { rootNodeLabel: '', db: { nodes: [], links: [], studySets: [] }, sources: [] },
        localStorage: {
            getItem: k => (k in store ? store[k] : null),
            setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; }
        }
    };
    ctx.window = ctx;
    vm.createContext(ctx);
    ['mappai-files-core.js', 'mappai-nome-cartella-core.js', 'mappai-import-vault-core.js', 'mappai-import-vault.js']
        .forEach(f => vm.runInContext(fs.readFileSync(JS(f), 'utf8'), ctx, { filename: f }));
    ctx.t = (k, f) => f;
    ctx.showToast = (m, k) => reg.toast.push({ m, k });
    ctx.showLoadingOverlay = () => {};
    const profilo = { discipline: (o.materieProfilo || ['Storia']).slice(), nickname: 'G' };
    ctx.MappAITeacherProfile = {
        get: () => profilo, disciplineList: () => profilo.discipline.slice(),
        salva: (S) => { profilo.discipline = S.discipline.slice(); return S; }
    };
    const classi = o.classi || [{ name: '3A', sede: '', disciplines: ['Storia'] }];
    ctx.MappAIClasses = {
        list: () => classi,
        disciplinesOf: c => (Array.isArray(c.disciplines) ? c.disciplines : []),
        save: () => { reg.salvaClassi++; return Promise.resolve({ success: true }); }
    };
    const risposte = (o.risposte || []).slice();
    ctx.MappAIModal = {
        open: (s) => { reg.modali.push(s); return Promise.resolve(risposte.shift() || null); },
        conferma: (c) => { reg.conferme.push(c); return Promise.resolve(o.conferma !== false); },
        avviso: (a) => { reg.avvisi.push(a); return Promise.resolve({ azione: 'ok' }); }
    };
    const info = Object.assign({ ok: true, haIndice: true, dentro: false, nome: 'I fiumi',
        indice: { classe: '3A', materia: 'Storia', rootNodeLabel: 'I fiumi' } }, o.info || {});
    ctx.electronAPI = o.senzaIpc ? { getAllVaults: async () => [] } : {
        importVaultInfo: async ({ src }) => { reg.infoSrc = src; return info; },
        getAllVaults: async () => (o.cartelle || []),
        importVaultCopy: async (d) => { reg.copie.push(d); return o.copiaKo ? { ok: false, error: o.copiaKo } : { ok: true, folderPath: '/M/' + [d.classDir || 'Generico', d.discDir, d.nome].filter(Boolean).join('/'), percorsi: 0 }; }
    };
    return { ctx, reg, profilo, classi, IV: ctx.MappAIImportVault, store, dom };
}
const IMPORTA = { azione: 'importa', valori: {} };
const testi = s => JSON.stringify(s.sezioni);

test('3 · niente che manca: il modale dice dove va e «Importa» copia lì con un id valido', async () => {
    const b = banco({ risposte: [IMPORTA] });
    const r = await b.IV.importa('/Scaricati/I fiumi');
    assert.equal(b.reg.modali.length, 1);
    const s = b.reg.modali[0];
    assert.equal(s.titolo, 'Importa un vault');
    assert.match(testi(s), /Il vault va in Mappe › 3A › Storia › I fiumi\./);
    assert.ok(!/iv_proposta/.test(testi(s)), 'nessuna scelta da fare');
    assert.equal(b.reg.copie.length, 1);
    const c = b.reg.copie[0];
    assert.equal(c.src, '/Scaricati/I fiumi');
    assert.equal(c.classDir, '3A');
    assert.equal(c.discDir, 'Storia');
    assert.equal(c.nome, 'I fiumi');
    assert.match(c.projectId, /^proj_\d{10,16}$/);
    assert.equal(r.folderPath, '/M/3A/Storia/I fiumi');
    assert.deepEqual(b.profilo.discipline, ['Storia']);
    assert.equal(b.reg.toast.pop().k, 'success');
});

test('3 · la materia manca: la proposta è la prima e già scelta; la materia va nel profilo e nella classe', async () => {
    const b = banco({ info: { indice: { classe: '3A', materia: 'Geografia', rootNodeLabel: 'I fiumi' } }, risposte: [{ azione: 'importa', valori: { iv_proposta: 'on' } }] });
    const r = await b.IV.importa('/Scaricati/I fiumi');
    const campi = b.reg.modali[0].sezioni[1].campi;
    assert.equal(campi[0].id, 'iv_proposta');
    assert.equal(campi[0].valore, true, 'la proposta è preselezionata');
    assert.equal(campi[0].etichetta, 'Aggiungi la materia e crea la cartella');
    assert.match(campi[0].aiuto, /Aggiungi «Geografia» alle tue materie\. Il vault va in Mappe › 3A › Geografia › I fiumi\./);
    assert.equal(campi[1].id, 'iv_scelta');
    assert.equal(b.reg.copie[0].discDir, 'Geografia');
    assert.equal(r.folderPath, '/M/3A/Geografia/I fiumi');
    assert.deepEqual(b.profilo.discipline, ['Storia', 'Geografia']);
    assert.deepEqual(b.classi[0].disciplines, ['Storia', 'Geografia']);
    assert.equal(b.reg.salvaClassi, 1);
});

test('3 · la classe manca (D1): si crea solo la cartella, la mappa comparirà sotto «Generico», nessuna classe nuova', async () => {
    const b = banco({ info: { indice: { classe: '4R', materia: 'Storia', rootNodeLabel: 'I fiumi' } }, risposte: [IMPORTA] });
    await b.IV.importa('/Scaricati/I fiumi');
    const campi = b.reg.modali[0].sezioni[1].campi;
    assert.equal(campi[0].etichetta, 'Crea la cartella della classe');
    assert.match(campi[0].aiuto, /La classe «4R» non è fra le tue: si crea solo la sua cartella, e la mappa ti comparirà sotto «Generico»\./);
    assert.equal(b.reg.copie[0].classDir, '4R');
    assert.equal(b.reg.copie[0].discDir, 'Storia');
    assert.equal(b.classi.length, 1, 'nessuna classe nasce dall\'import');
    assert.equal(b.reg.salvaClassi, 0);
    assert.deepEqual(b.profilo.discipline, ['Storia']);
});

test('3 · classe e materia mancanti: la materia entra solo nel profilo, la classe del collega resta una cartella', async () => {
    const b = banco({ info: { indice: { classe: '4R', materia: 'Geografia', rootNodeLabel: 'I fiumi' } }, risposte: [IMPORTA] });
    await b.IV.importa('/Scaricati/I fiumi');
    assert.match(b.reg.modali[0].sezioni[1].campi[0].aiuto, /Aggiungi «Geografia».*La classe «4R» non è fra le tue/);
    assert.deepEqual(b.profilo.discipline, ['Storia', 'Geografia']);
    assert.deepEqual(b.classi[0].disciplines, ['Storia'], 'la classe 3A non c\'entra');
    assert.equal(b.reg.copie[0].classDir, '4R');
});

test('3 · «Scegli tu»: una classe e una materia del docente; col nome già usato l\'avviso prima di copiare', async () => {
    const cartelle = [{ folderName: 'I fiumi', classDir: '3A', discDir: 'Storia' }];
    const b = banco({ cartelle, info: { indice: { classe: '4R', materia: 'Geografia', rootNodeLabel: 'I fiumi' } },
        risposte: [{ azione: 'importa', valori: { iv_scelta: 'on', iv_classe: '3A', iv_materia: 'Storia' } }] });
    const r = await b.IV.importa('/Scaricati/I fiumi');
    assert.equal(b.reg.conferme.length, 1);
    assert.match(b.reg.conferme[0].testo, /Questo nome esiste già, potrai modificarlo in seguito o tenere la numerazione automatica\. Il vault si chiamerà «I fiumi · 02»\./);
    assert.equal(b.reg.copie[0].nome, 'I fiumi · 02');
    assert.equal(b.reg.copie[0].classDir, '3A');
    assert.equal(r.folderPath, '/M/3A/Storia/I fiumi · 02');
    assert.deepEqual(b.profilo.discipline, ['Storia'], 'con «Scegli tu» non si aggiunge niente');
    /* le tendine: Generico + le classi del docente; nessuna materia + le sue */
    const campi = b.reg.modali[0].sezioni[1].campi;
    /* JSON: gli array nati nella vm hanno un altro prototipo */
    assert.deepEqual(JSON.parse(JSON.stringify(campi[2].opzioni.map(o => o.valore))), ['', '3A']);
    assert.deepEqual(JSON.parse(JSON.stringify(campi[3].opzioni.map(o => o.valore))), ['', 'Storia']);
});

test('3 · «Scegli tu» e l\'avviso rifiutato: nessuna copia', async () => {
    const b = banco({ cartelle: [{ folderName: 'I fiumi', classDir: '3A', discDir: 'Storia' }], conferma: false,
        info: { indice: { classe: '4R', materia: '', rootNodeLabel: 'I fiumi' } },
        risposte: [{ azione: 'importa', valori: { iv_scelta: 'on', iv_classe: '3A', iv_materia: 'Storia' } }] });
    const r = await b.IV.importa('/Scaricati/I fiumi');
    assert.deepEqual(JSON.parse(JSON.stringify(r)), { annullato: true });
    assert.equal(b.reg.copie.length, 0);
});

test('3 · nome già usato con la proposta: l\'avviso sta nel modale', async () => {
    const b = banco({ cartelle: [{ folderName: 'I fiumi', classDir: '3A', discDir: 'Storia' }], risposte: [IMPORTA] });
    await b.IV.importa('/Scaricati/I fiumi');
    assert.match(testi(b.reg.modali[0]), /Questo nome esiste già, potrai modificarlo in seguito o tenere la numerazione automatica\. Il vault si chiamerà «I fiumi · 02»\./);
    assert.equal(b.reg.copie[0].nome, 'I fiumi · 02');
});

test('3 · «Annulla» non copia niente e non tocca il profilo', async () => {
    const b = banco({ info: { indice: { classe: '3A', materia: 'Geografia' } }, risposte: [null] });
    const r = await b.IV.importa('/Scaricati/I fiumi');
    assert.equal(r.annullato, true);
    assert.equal(b.reg.copie.length, 0);
    assert.deepEqual(b.profilo.discipline, ['Storia']);
});

test('3 · una copia non riuscita: messaggio, e la materia NON entra nel profilo', async () => {
    const b = banco({ copiaKo: 'esiste', info: { indice: { classe: '3A', materia: 'Geografia' } }, risposte: [IMPORTA] });
    const r = await b.IV.importa('/Scaricati/I fiumi');
    assert.equal(r.annullato, true);
    assert.deepEqual(b.profilo.discipline, ['Storia']);
    assert.deepEqual(b.reg.toast.pop(), { m: 'Nel frattempo è comparsa una cartella con lo stesso nome: riprova.', k: 'error' });
});

test('3 · l\'id: si tiene se è libero, uno nuovo se un\'altra cartella ce l\'ha', async () => {
    const libero = banco({ info: { indice: { classe: '3A', materia: 'Storia', projectId: 'proj_1790000000000' } }, risposte: [IMPORTA] });
    await libero.IV.importa('/S/I fiumi');
    assert.equal(libero.reg.copie[0].projectId, 'proj_1790000000000');
    const preso = banco({ cartelle: [{ folderName: 'Altro', classDir: '3A', discDir: 'Storia', projectId: 'proj_1790000000000' }],
        info: { indice: { classe: '3A', materia: 'Storia', projectId: 'proj_1790000000000' } }, risposte: [IMPORTA] });
    await preso.IV.importa('/S/I fiumi');
    assert.notEqual(preso.reg.copie[0].projectId, 'proj_1790000000000');
    assert.match(preso.reg.copie[0].projectId, /^proj_\d{10,16}$/);
    const voce = banco({ ls: { tutor_ai_projects: JSON.stringify([{ id: 'proj_1790000000000' }]) },
        info: { indice: { classe: '3A', materia: 'Storia', projectId: 'proj_1790000000000' } }, risposte: [IMPORTA] });
    await voce.IV.importa('/S/I fiumi');
    assert.notEqual(voce.reg.copie[0].projectId, 'proj_1790000000000');
});

test('4 · D3, D4 e la strada di prima: già in Mappe/ si apre dov\'è; senza index.yaml un avviso; senza IPC come oggi', async () => {
    const dentro = banco({ info: { dentro: true } });
    assert.deepEqual(JSON.parse(JSON.stringify(await dentro.IV.importa('/M/3A/Storia/X'))), { folderPath: '/M/3A/Storia/X', dossier: false });
    assert.equal(dentro.reg.modali.length + dentro.reg.copie.length, 0);
    const vuota = banco({ info: { haIndice: false, indice: {} } });
    assert.equal((await vuota.IV.importa('/S/Vuota')).annullato, true);
    assert.equal(vuota.reg.avvisi.length, 1);
    assert.equal(vuota.reg.avvisi[0].testo, 'Questa cartella non è un vault di MappAI (manca index.yaml).');
    assert.equal(vuota.reg.copie.length, 0);
    const vecchia = banco({ senzaIpc: true });
    assert.deepEqual(JSON.parse(JSON.stringify(await vecchia.IV.importa('/S/X'))), { folderPath: '/S/X' });
});

test('4 · l\'interruttore mappai_nome_da_cartella: spento solo con \'0\'', () => {
    assert.equal(banco().IV.attivo(), true);
    assert.equal(banco({ ls: { mappai_nome_da_cartella: '1' } }).IV.attivo(), true);
    assert.equal(banco({ ls: { mappai_nome_da_cartella: '0' } }).IV.attivo(), false);
});

test('3 · le chiavi iv_* usate dal modulo ci sono tutte in en_translations.js', () => {
    const src = fs.readFileSync(JS('mappai-import-vault.js'), 'utf8');
    const usate = Array.from(new Set((src.match(/t\('iv_[a-z_]+'/g) || []).map(s => s.slice(3, -1))));
    const en = fs.readFileSync(path.join(__dirname, '..', 'public', 'traduzioni', 'en_translations.js'), 'utf8');
    assert.ok(usate.length > 20);
    usate.forEach(k => assert.match(en, new RegExp('\\n\\s*' + k + ':'), k));
});

/* ── lotto 4: `loadMapVault` VERA, ritagliata da mappai-vault-io.js ─────────── */
function loadMapVaultVera(o) {
    const src = fs.readFileSync(JS('mappai-vault-io.js'), 'utf8');
    const a = src.indexOf('window.loadMapVault = async function');
    const b = src.indexOf('window.handleImportClick');
    assert.ok(a > 0 && b > a);
    const reg = { aperte: [], importate: [], alert: [] };
    const ctx = {
        console: { log() {}, warn() {}, error() {} },
        appState: {},
        window: {
            mappaiOccupato: () => false,
            showLoadingOverlay() {}, showToast() {}, t: (k, f) => f,
            showAlert: (t, m) => reg.alert.push(m),
            electronAPI: {
                pickFolder: async () => ({ canceled: false, folderPath: '/S/I fiumi' }),
                /* il caricamento si ferma qui: basta sapere QUALE cartella si apre */
                loadVault: async (p) => { reg.aperte.push(p); return { success: false, error: 'fermo' }; }
            }
        }
    };
    if (o.modulo !== false) {
        ctx.window.MappAIImportVault = {
            attivo: () => o.attivo !== false,
            importa: async (p) => { reg.importate.push(p); return o.esito; }
        };
    }
    vm.createContext(ctx);
    vm.runInContext(src.slice(a, b), ctx);
    return { fn: ctx.window.loadMapVault, reg };
}

test('4 · «Importa dal Vault» apre la COPIA; annullato non apre niente; spento o senza modulo apre la cartella dov\'è', async () => {
    const copia = loadMapVaultVera({ esito: { folderPath: '/M/4R/Geografia/I fiumi' } });
    await copia.fn();
    assert.deepEqual(copia.reg.importate, ['/S/I fiumi']);
    assert.deepEqual(copia.reg.aperte, ['/M/4R/Geografia/I fiumi']);
    const annullato = loadMapVaultVera({ esito: { annullato: true } });
    await annullato.fn();
    assert.equal(annullato.reg.aperte.length, 0);
    assert.equal(annullato.reg.alert.length, 0);
    const spento = loadMapVaultVera({ attivo: false, esito: { folderPath: '/NO' } });
    await spento.fn();
    assert.equal(spento.reg.importate.length, 0);
    assert.deepEqual(spento.reg.aperte, ['/S/I fiumi']);
    const senza = loadMapVaultVera({ modulo: false });
    await senza.fn();
    assert.deepEqual(senza.reg.aperte, ['/S/I fiumi']);
});

test('3 · D8: con la proposta scelta le tendine sono bloccate; «Scegli tu» le sblocca, tornare alla proposta le riblocca', async () => {
    const dom = { iv_scelta: { checked: false }, iv_classe: { disabled: false }, iv_materia: { disabled: false } };
    const b = banco({ dom, info: { indice: { classe: '3A', materia: 'Geografia' } }, risposte: [null] });
    await b.IV.importa('/S/I fiumi');
    assert.equal(dom.iv_classe.disabled, true, 'bloccate all\'apertura');
    assert.equal(dom.iv_materia.disabled, true);
    const s = b.reg.modali[0];
    assert.equal(typeof s.suAzione, 'function');
    const box = { querySelector: sel => b.ctx.document.querySelector(sel) };
    dom.iv_scelta.checked = true;
    s.suAzione({ azione: '__campo', campo: 'iv_scelta' }, box);
    assert.equal(dom.iv_classe.disabled, false, '«Scegli tu» le sblocca');
    assert.equal(dom.iv_materia.disabled, false);
    dom.iv_scelta.checked = false;
    s.suAzione({ azione: '__campo', campo: 'iv_proposta' }, box);
    assert.equal(dom.iv_classe.disabled, true, 'la proposta le riblocca');
    /* un'azione che non è un cambio di campo non tocca niente */
    dom.iv_scelta.checked = true;
    s.suAzione({ azione: 'importa' }, box);
    assert.equal(dom.iv_classe.disabled, true);
});

test('3 · D9: il dossier da foto lo dice l\'import, alla copia e alla cartella già in Mappe/', async () => {
    const copia = banco({ info: { indice: { classe: '3A', materia: 'Storia', dossier: 'true' } }, risposte: [IMPORTA] });
    assert.equal((await copia.IV.importa('/S/Foto')).dossier, true);
    const dentro = banco({ info: { dentro: true, indice: { dossier: 'true' } } });
    assert.equal((await dentro.IV.importa('/M/3A/Storia/Foto')).dossier, true);
    const mappa = banco({ risposte: [IMPORTA] });
    assert.equal((await mappa.IV.importa('/S/I fiumi')).dossier, false);
});

test('4 · D9: loadMapVault apre il dossier importato (INSEGNA + «Proietta»), dopo il caricamento riuscito', () => {
    const src = fs.readFileSync(JS('mappai-vault-io.js'), 'utf8');
    const corpo = src.slice(src.indexOf('window.loadMapVault = async function'), src.indexOf('window.handleImportClick'));
    const apre = corpo.indexOf('await window.MappAIImportVault.apriDossier(result.folderPath, appState.rootNodeLabel)');
    assert.ok(apre > 0);
    assert.ok(corpo.lastIndexOf('if (imp && imp.dossier && window.MappAIImportVault', apre) > corpo.indexOf('checkResume(result.folderPath)'),
        'dopo il caricamento riuscito, solo per un dossier dell\'import');
    assert.ok(apre < corpo.indexOf('window.showAlert("Errore Caricamento"'), 'nel ramo del successo');
});

test('4 · D11: prima INSEGNA sulla voce del progetto (contesto allineato), poi «Proietta» sopra; senza INSEGNA solo «Proietta»', async () => {
    const b = banco({ info: { indice: { classe: '4R', materia: 'Scienze', dossier: 'true' } }, materieProfilo: ['Storia', 'Scienze'], risposte: [IMPORTA] });
    const ordine = [];
    b.ctx.MappAIProiezione = { apri: (o) => ordine.push(['proietta', o.mapName, o.vaultPath]) };
    const voce = { id: 'v:/M/4R/Scienze/I fiumi', v: { fullPath: '/M/4R/Scienze/I fiumi' } };
    b.ctx.MappAITeach = {
        allineaContestoA: (m) => ordine.push(['contesto', m.cls, m.disc]),
        mappeDelContesto: async () => [{ id: 'v:/altro', v: { fullPath: '/altro' } }, voce],
        mappaCorrente: () => null,
        setMode: (m, v) => ordine.push(['setMode', m, v])
    };
    const r = await b.IV.importa('/S/I fiumi');
    assert.equal(r.dossier, true);
    await b.IV.apriDossier(r.folderPath, 'I fiumi');
    assert.deepEqual(JSON.parse(JSON.stringify(ordine)), [
        ['contesto', '4R', 'Scienze'],
        ['setMode', 'teach', 'v:/M/4R/Scienze/I fiumi'],
        ['proietta', 'I fiumi', '/M/4R/Scienze/I fiumi']
    ]);
    /* senza INSEGNA: solo «Proietta», come prima */
    const solo = banco();
    const o2 = [];
    solo.ctx.MappAIProiezione = { apri: (o) => o2.push(o.vaultPath) };
    await solo.IV.apriDossier('/M/X', 'X');
    assert.deepEqual(JSON.parse(JSON.stringify(o2)), ['/M/X']);
    /* senza «Proietta» non si apre niente */
    assert.equal(await banco().IV.apriDossier('/M/X', 'X'), false);
});
