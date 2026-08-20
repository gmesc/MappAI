#!/usr/bin/env node
/* BANCO — dalla SCHEDA DI ANALISI al DOSSIER e ai materiali, col motore VERO (20/8).
   Fa girare `MappAIPipeline` con un finto `window`: IPC finti, `fetchModelAPI`
   finta, e i core veri (visione, clona, pipeline). È il pezzo che nessun test
   puro esegue — le due catene:
     · il DOSSIER: scheda → grafo dei blocchi → vault → documento «Analisi
       della fonte» → flashcard e domande aperte generate DAI BLOCCHI;
     · il gesto di ELABORA (fase 1): scheda → sorgente esplicita → un foglio
       per angolo, con l'immagine incorporata e la sorgente riapribile.

   Le cose che possono rompersi in silenzio, e che qui si provano:
     1. la scheda CORRETTA a mano è quella che arriva al generatore (non
        l'ipotesi del modello);
     2. il dossier ha un'identità SUA (inv. 20) e il suo grafo È la scheda;
     3. l'analisi si archivia PRIMA del PDF (inv. 18) e si rilegge
        (`schedaFromAnalisiHtml`);
     4. su un dossier fogli-nodi e catena sono FORZATI spenti (inv. 21);
     5. tre angoli → tre fogli con tre nomi; l'immagine è nell'HTML e nella
        sorgente incorporata; la DESCRIZIONE non finisce sul foglio allievi.

   ⚠️ Che cosa NON prova: Gemini (nessuna rete — un banco che dipende da un
   servizio esterno fallisce per il motivo sbagliato), `sips`, la superficie,
   il PDF vero. E soprattutto NON prova la cosa che conta di più: se il
   contesto proposto dal modello sia GIUSTO — quello lo dice solo un docente
   che guarda la sua fonte, ed è il motivo per cui la scheda si corregge.
   Uso: node tools/smoke/visione-fogli.js                                     */
'use strict';
const path = require('path');
const RADICE = path.join(__dirname, '..', '..');
let ko = 0;
function ok(cond, msg) { console.log((cond ? '  ok  ' : '  KO  ') + msg); if (!cond) ko++; }

/* ── il minimo perché i moduli si carichino ───────────────────────────────── */
const nulla = { classList: { add() { }, remove() { } }, style: {}, appendChild() { }, addEventListener() { } };
global.window = {};
global.document = {
    getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
    createElement: () => Object.assign({ set textContent(v) { this.innerHTML = String(v); } }, nulla),
    addEventListener() { }, body: nulla
};
global.localStorage = { _d: {}, getItem(k) { return this._d[k] == null ? null : this._d[k]; }, setItem(k, v) { this._d[k] = String(v); }, removeItem(k) { delete this._d[k]; } };
window.localStorage = global.localStorage;
global.navigator = { platform: 'MacIntel' };

const VC = require(path.join(RADICE, 'public', 'js', 'mappai-visione-core.js'));
window.MappAIVisioneCore = VC;
window.MappAIPipelineCore = require(path.join(RADICE, 'public', 'js', 'mappai-pipeline-core.js'));
window.MappAIClona = require(path.join(RADICE, 'public', 'js', 'mappai-clona-core.js'));
window.salvageTruncatedJSON = (s) => { try { return JSON.parse(s); } catch (e) { return null; } };

/* ── la mappa aperta (per il gesto di ELABORA) ────────────────────────────── */
window.appState = {
    rootNodeLabel: 'Il Monachesimo',
    activeVaultPath: '/finto/vault/Il Monachesimo',
    extractionMode: 'mindmap',
    db: { nodes: [{ id: 'n0', level: 0, label: 'Il Monachesimo' }, { id: 'n1', level: 1, label: 'La regola' }], studySets: [] }
};
/* `StorageManager` è una const lessicale nell'app (inv. 3): qui un finto
   globale basta — il banco misura che il dossier NON erediti l'id. */
global.StorageManager = { currentProjectId: 'proj_vecchio', saveCurrentProject() { } };
window.getSystemKey = () => 'chiave-finta';
window.getDescendants = () => [];
window.cleanLabel = (x) => String(x || '');
window.quizNonce = () => 'nonce';
window.showToast = () => { };
window.showLoadingOverlay = () => { };
window.safeCreateIcons = () => { };
window.t = (k, f) => f;
window.QUIZ_TEMPERATURE = 0.7;
window.fillPromptTemplate = () => '';
window.openQuestionsAngleBlock = (ang) => 'ANGOLO: ' + ang;
window.MappAIPrintLayout = require(path.join(RADICE, 'public', 'js', 'mappai-print-layout.js'));
/* `_resolveFolderPath` compone il percorso del vault con FilesCore vero */
window.MappAIFilesCore = require(path.join(RADICE, 'public', 'js', 'mappai-files-core.js'));
window.buildVaultMapData = () => ({ nodes: window.appState.db.nodes, links: window.appState.db.links || [] });

/* ── che cosa il modello ha DAVVERO ricevuto ──────────────────────────────── */
const materiali = [];
window.fetchModelAPI = async function (payload) {
    const testo = payload.contents[0].parts[0].text;
    materiali.push(testo);
    const domande = /DOMANDE APERTE|domande aperte/i.test(testo) || /traccia/i.test(testo);
    const dati = domande
        ? [{ domanda: 'Che cosa vuole ottenere questa fonte?', traccia: 'La persuasione.', righe: 5, aree: [], livello: 'base' }]
        : [{ front: 'Che genere di fonte è?', back: 'Un manifesto' }];
    return { candidates: [{ content: { parts: [{ text: JSON.stringify(dati) }] } }] };
};
window.injectClassTuning = (p) => p;

/* ── il disco e l'archivio, finti ─────────────────────────────────────────── */
const scritti = [];
const vaults = [];
const archivio = [];
window.electronAPI = {
    htmlToPdf: async () => ({ ok: true, base64: 'JVBERi0xLjQK' + 'A'.repeat(400) }),
    saveVaultFile: async ({ vaultPath, relPath }) => { scritti.push(vaultPath + '::' + relPath); return { ok: true }; },
    saveVault: async ({ folderPath }) => { vaults.push(folderPath); return { success: true }; },
    getAllVaults: async () => [],
    filesRootGet: async () => ({ mapsBaseDir: '/finto/Mappe' })
};
window.MappAIStudyDocs = {
    save(d) { archivio.push(d); return 'doc' + archivio.length; },
    get(id) { return archivio[Number(String(id).replace('doc', '')) - 1] || null; },
    list() { return archivio.map((d, i) => ({ id: 'doc' + (i + 1), kind: d.kind, title: d.title, mapName: d.mapName, hasHtml: true })); }
};
window.MappAIVaults = { segnala() { } };
window.MappAITune = { congela: () => null, scongela() { } };
require(path.join(RADICE, 'public', 'js', 'mappai-quiz-print.js'));
require(path.join(RADICE, 'public', 'js', 'mappai-material-pipeline.js'));
const P = window.MappAIPipeline;

/* ── LA SCHEDA: l'ipotesi del modello, CORRETTA dal docente ───────────────── */
const GREZZA = VC.normalizzaAnalisi(JSON.stringify({
    identita: { genere: 'Manifesto', titolo: 'Sottoscrivete!', autore: '', data: '1936', luogo: 'Italia', tecnica: 'Litografia' },
    osservazione: { descrizione: 'Un soldato indica l\'osservatore su fondo rosso.', testo: 'SOTTOSCRIVETE AL PRESTITO', iconografia: 'Elmetto, tricolore.', linguaggioVisivo: 'Figura vista dal basso, campitura piatta.', tipografia: 'Maiuscolo pieno, corpo enorme.' },
    interpretazione: { corrente: 'Futurismo', committente: '', destinatario: 'Civili adulti — il soldato guarda dritto chi legge', finalita: 'Persuadere — imperativo nello slogan e dito puntato', strategie: 'Appello al dovere — il gesto e il maiuscolo', diffusione: '' },
    critica: { prova: 'Lo Stato aveva bisogno di fondi dai civili.', tace: 'Le condizioni reali del fronte.' }
}), window.salvageTruncatedJSON);
const SCHEDA = Object.assign({ titolo: 'Sottoscrivete al prestito', fotoB64: 'RkFLRUpQRUc=', mime: 'image/jpeg' }, GREZZA);
/* il docente CORREGGE: la data del modello era sbagliata */
SCHEDA.identita = Object.assign({}, SCHEDA.identita, { data: '1917' });

(async function () {
    console.log('\n── LA REGOLA DELL\'APPIGLIO, sulla risposta grezza ──');
    ok(GREZZA.interpretazione.corrente === '', '«Futurismo» senza appiglio è stato SCARTATO dalla normalizzazione');
    ok(GREZZA.interpretazione.finalita.includes('—'), 'la finalità con l\'appiglio è rimasta');

    console.log('\n── IL DOSSIER: scheda → vault → analisi → output ──');
    await P.run({
        classId: '', quiz: { types: ['flashcards', 'open'], perBranch: 2, angle: 'auto' },
        nodesheet: { fmt: '2x2' },            /* spuntato per sbaglio: va forzato spento */
        causal: true,
        synthesis: null,
        dossier: SCHEDA
    });

    /* `saveVault` gira due volte (la creazione + il ri-salvataggio dei set a
       fine step B): conta il PERCORSO, non il numero di chiamate */
    ok(vaults.length >= 1 && vaults[0].includes('Sottoscrivete al prestito'),
        'il vault del dossier porta il TITOLO della fonte: ' + vaults[0]);
    ok(StorageManager.currentProjectId !== 'proj_vecchio',
        '⚠️ identità NUOVA (inv. 20): il dossier non si scrive nella scheda della mappa di prima');
    const st = window.appState;
    ok(st.rootNodeLabel === 'Sottoscrivete al prestito', 'la mappa a schermo è il dossier');
    ok(st.db.nodes.length === 5 && st.db.nodes[0].level === 0,
        'il grafo È la scheda: root + 4 blocchi (' + st.db.nodes.length + ' nodi)');
    ok(st.db.nodes.some(n => n.desc && n.desc.includes('1917')),
        '⚠️ la CORREZIONE del docente è nei rami (1917, non 1936)');

    const docAn = archivio.find(d => d.kind === 'analisi');
    ok(!!docAn, 'l\'analisi è in ARCHIVIO (la sorgente prima della resa, inv. 18)');
    const rilettura = window.schedaFromAnalisiHtml(docAn ? docAn.html : '');
    ok(!!(rilettura && rilettura.identita && rilettura.identita.data === '1917'),
        'la scheda si RILEGGE dal documento: si riapre e si ricorregge');
    ok(!!(rilettura && rilettura.fotoB64 === 'RkFLRUpQRUc='), 'l\'immagine viaggia nella sorgente');
    ok(scritti.some(x => /Analisi-fonte-/.test(x)), 'il PDF dell\'analisi è nel vault');

    ok(!scritti.some(x => /Foglio-nodi/.test(x)) && !scritti.some(x => /Catena/.test(x)),
        '⚠️ fogli-nodi e catena FORZATI spenti su un dossier (inv. 21)');
    ok(scritti.some(x => /Flashcard-/.test(x)), 'le flashcard del dossier sono nel vault');
    ok(scritti.some(x => /Domande-aperte-/.test(x)), 'le domande aperte del dossier sono nel vault');
    /* ogni ramo del dossier è UN blocco: la data sta nel ramo «identità», la
       finalità in quello dell'interpretazione — messaggi diversi */
    ok(materiali.some(m => m.includes('1917')) && materiali.some(m => m.includes('Persuadere')),
        'i generatori hanno ricevuto i BLOCCHI corretti, non l\'ipotesi del modello');
    ok(!materiali.some(m => m.includes('1936')),
        '⚠️ la data SBAGLIATA del modello non arriva a nessun generatore');

    console.log('\n── IL GESTO DI ELABORA (fase 1): un foglio per angolo ──');
    /* si torna alla mappa vera: il gesto singolo lavora nel vault aperto */
    window.appState.rootNodeLabel = 'Il Monachesimo';
    window.appState.activeVaultPath = '/finto/vault/Il Monachesimo';
    window.appState.extractionMode = 'mindmap';
    window.appState.db = { nodes: [{ id: 'n0', level: 0, label: 'Il Monachesimo' }, { id: 'n1', level: 1, label: 'La regola' }], studySets: [] };
    const MAT = VC.materialeDaScheda(SCHEDA);
    const INTRO = {
        fotoB64: SCHEDA.fotoB64, mime: SCHEDA.mime, titolo: SCHEDA.titolo,
        contesto: VC.contestoBreve(SCHEDA),
        descrizione: VC.testoBlocco(SCHEDA, 'osservazione')
    };
    const prima = archivio.length;
    for (const a of ['causa', 'conseguenza', 'confronto']) {
        const r = await P.generaSet({
            tipo: 'open', nome: SCHEDA.titolo + ' - ' + a, quantita: 3, area: 'all', angolo: a,
            sorgente: { etichetta: SCHEDA.titolo, materiale: MAT }, intro: INTRO
        });
        ok(r && r.ok, 'angolo «' + a + '»: foglio generato' + (r && r.errore ? ' — ' + r.errore : ''));
    }
    const fogli = archivio.slice(prima).filter(d => d.kind === 'quizpaper');
    ok(fogli.length === 3 && new Set(fogli.map(d => d.title)).size === 3,
        'tre angoli → tre fogli con tre titoli distinti');
    const html = fogli[0].html || '';
    ok(html.includes('data:image/jpeg;base64,' + SCHEDA.fotoB64), 'l\'immagine è INCORPORATA nel foglio');
    ok(html.includes('1917'), 'il contesto breve (con la data corretta) è in testa');
    const rip = window.MappAIQuizPrint.setFromHtml(html);
    ok(!!(rip && rip.intro && rip.intro.fotoB64 === SCHEDA.fotoB64),
        'l\'intro sta nella SORGENTE: l\'editor non perde l\'immagine al salvataggio');
    const senzaSol = window.buildOpenQuestionsHtml(
        { id: 'x', title: 'prova', intro: rip.intro, items: rip.items }, { includeAnswers: false, includeBar: false });
    ok(!senzaSol.includes('SOTTOSCRIVETE AL PRESTITO'),
        '⚠️ l\'OSSERVAZIONE non compare sulla copia degli allievi (risposta a metà delle domande)');

    console.log('\n── LA RETE: una sorgente vuota non fa sparire la mappa ──');
    const r2 = await P.generaSet({ tipo: 'flashcards', nome: 'dalla mappa', quantita: 2, area: 'all', angolo: 'auto', sorgente: { etichetta: '', materiale: '   ' } });
    ok(r2 && r2.ok, 'con una sorgente vuota si generano dai rami come sempre');

    console.log('\n' + (ko ? '  ' + ko + ' CONTROLLI FALLITI' : '  TUTTO OK'));
    process.exit(ko ? 1 : 0);
})();
