#!/usr/bin/env node
/* BANCO — da un'IMMAGINE ai fogli, col motore VERO (20/8).
   Fa girare `MappAIPipeline.generaSet` con un finto `window`: IPC finti,
   `fetchModelAPI` finta, e i core veri (visione, clona, pipeline). È il pezzo
   che nessun test puro esegue — la catena scheda → materiale → foglio per
   angolo → archivio → nome del file.

   Prova le cinque cose che possono rompersi in silenzio:
     1. la scheda CORRETTA a mano è quella che arriva al generatore (non la
        lettura grezza del modello);
     2. tre angoli producono TRE fogli con tre nomi distinti (uno solo, e il
        secondo si rifiuterebbe di nascere per nome già preso);
     3. l'immagine è INCORPORATA nell'HTML di ognuno — un foglio di domande su
        una fonte che l'allievo non vede non serve a niente;
     4. l'intro sta anche nella SORGENTE incorporata, o l'editor la perde al
        primo salvataggio (invariante 18);
     5. le FLASHCARD dalla stessa scheda escono dallo stesso interruttore.

   ⚠️ Che cosa NON prova: Ollama (un banco che dipende da un server esterno
   fallisce per il motivo sbagliato), `sips`, la superficie dei tre passi, il
   PDF vero. Quelli stanno nella lista «da provare in Electron».
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

/* ── la mappa aperta: serve solo come CASA dei materiali ──────────────────── */
window.appState = {
    rootNodeLabel: 'Il Monachesimo',
    activeVaultPath: '/finto/vault/Il Monachesimo',
    extractionMode: 'mindmap',
    db: { nodes: [{ id: 'n0', level: 0, label: 'Il Monachesimo' }, { id: 'n1', level: 1, label: 'La regola' }], studySets: [] }
};
window.getSystemKey = () => 'chiave-finta';
window.getDescendants = () => [];
window.cleanLabel = (x) => String(x || '');
window.quizNonce = () => 'nonce';
window.showToast = () => { };
window.showLoadingOverlay = () => { };
window.safeCreateIcons = () => { };
window.t = (k, f) => f;
window.QUIZ_TEMPERATURE = 0.7;

/* i due generatori passano da `fillPromptTemplate`: senza template si usa il
   ripiego inline, che è esattamente il caso di un `prompts_config.json` vecchio */
window.fillPromptTemplate = () => '';
window.openQuestionsAngleBlock = (ang) => 'ANGOLO: ' + ang;
/* il foglio flashcard vuole le sue misure: si carica il modulo VERO, o
   `generaSet` si ferma prima di scrivere il PDF (ed è giusto così) */
window.MappAIPrintLayout = require(path.join(RADICE, 'public', 'js', 'mappai-print-layout.js'));

/* ── che cosa il modello ha DAVVERO ricevuto ──────────────────────────────── */
const materiali = [];
window.fetchModelAPI = async function (payload) {
    const testo = payload.contents[0].parts[0].text;
    materiali.push(testo);
    const domande = /DOMANDE APERTE|domande aperte/i.test(testo) || /traccia/i.test(testo);
    const dati = domande
        ? [{ domanda: 'Che cosa suggerisce la scena?', traccia: 'La gerarchia.', righe: 5, aree: [], livello: 'base' }]
        : [{ front: 'Chi è raffigurato?', back: 'Un abate' }];
    return { candidates: [{ content: { parts: [{ text: JSON.stringify(dati) }] } }] };
};
window.injectClassTuning = (p) => p;

/* ── il disco e l'archivio, finti ─────────────────────────────────────────── */
const scritti = [];
const archivio = [];
window.electronAPI = {
    htmlToPdf: async () => ({ ok: true, base64: 'JVBERi0xLjQK' + 'A'.repeat(400) }),
    saveVaultFile: async ({ relPath }) => { scritti.push(relPath); return { ok: true }; },
    saveVault: async () => ({ ok: true })
};
window.MappAIStudyDocs = {
    save(d) { archivio.push(d); return 'doc' + archivio.length; },
    get(id) { return archivio[Number(String(id).replace('doc', '')) - 1] || null; },
    list() { return archivio.map((d, i) => ({ id: 'doc' + (i + 1), kind: d.kind, title: d.title, mapName: d.mapName, hasHtml: true })); }
};
window.MappAIVaults = { segnala() { } };
window.buildQuizSetHtml = () => '<html></html>';
window.buildFlashcardSetHtml = () => '<html></html>';
require(path.join(RADICE, 'public', 'js', 'mappai-quiz-print.js'));
require(path.join(RADICE, 'public', 'js', 'mappai-material-pipeline.js'));
const P = window.MappAIPipeline;

/* ── LA SCHEDA, corretta dal docente ──────────────────────────────────────── */
const LETTURA = { descrizione: 'Un uomo in tunica scura consegna un rotolo a due figure inginocchiate davanti a un edificio con archi.', contesto: 'Forse l\'incoronazione di Carlo Magno nell\'anno 800.' };
const SCHEDA = {
    titolo: 'Miniatura della regola',
    /* il docente CANCELLA l'ipotesi del modello e scrive quella vera: è il
       gesto per cui la scheda esiste */
    contesto: 'Miniatura del XII secolo: un abate consegna la regola ai monaci.',
    descrizione: LETTURA.descrizione,
    fotoB64: 'RkFLRUpQRUc=', mime: 'image/jpeg'
};
const MATERIALE = VC.materialeDaScheda(SCHEDA);

(async function () {
    console.log('\n── DA UN\'IMMAGINE: le domande aperte, un foglio per angolo ──');

    const angoli = ['causa', 'conseguenza', 'confronto'];
    for (const a of angoli) {
        const r = await P.generaSet({
            tipo: 'open', nome: SCHEDA.titolo + ' - ' + a, quantita: 3, area: 'all', angolo: a,
            sorgente: { etichetta: SCHEDA.titolo, materiale: MATERIALE },
            intro: { fotoB64: SCHEDA.fotoB64, mime: SCHEDA.mime, titolo: SCHEDA.titolo, contesto: SCHEDA.contesto, descrizione: SCHEDA.descrizione }
        });
        ok(r && r.ok, 'angolo «' + a + '»: foglio generato' + (r && r.errore ? ' — ' + r.errore : ''));
    }

    // 1. la scheda corretta è quella che arriva al modello
    const primo = materiali[0] || '';
    ok(primo.includes('Miniatura del XII secolo'), 'il CONTESTO corretto dal docente arriva al generatore');
    ok(!primo.includes('Forse l\'incoronazione'), '⚠️ l\'ipotesi CANCELLATA dal docente non arriva al generatore');
    ok(!primo.includes('La regola'), 'il materiale è la FONTE, non le macro-aree della mappa');

    // 2. tre fogli, tre nomi
    ok(archivio.length === 3, 'tre angoli → tre voci d\'archivio (trovate ' + archivio.length + ')');
    const titoli = archivio.map(d => d.title);
    ok(new Set(titoli).size === 3, 'i tre titoli sono distinti: ' + titoli.join(' · '));
    ok(titoli.every(x => x.includes(SCHEDA.titolo)), 'ogni titolo dice DA QUALE fonte viene');
    const pdf = scritti.filter(x => /Domande/i.test(x));
    ok(new Set(pdf).size === 3, 'tre file distinti nel vault (trovati ' + new Set(pdf).size + ')');

    // 3-4. l'immagine sul foglio E nella sorgente
    const html = archivio[0].html || '';
    ok(html.includes('data:image/jpeg;base64,' + SCHEDA.fotoB64), 'l\'immagine è INCORPORATA nel foglio');
    ok(html.includes('Miniatura del XII secolo'), 'il contesto è in testa al foglio');
    const rip = window.MappAIQuizPrint.setFromHtml(html);
    ok(!!(rip && rip.intro && rip.intro.fotoB64 === SCHEDA.fotoB64),
        '⚠️ l\'intro sta nella SORGENTE: l\'editor non perde l\'immagine al primo salvataggio');
    ok(!!(rip && rip.intro && rip.intro.descrizione), 'la descrizione viaggia col documento (serve alle tracce)');

    // la descrizione NON sta sul foglio degli allievi: è la risposta a metà delle domande
    const senzaSol = window.buildOpenQuestionsHtml(
        { id: 'x', title: 'prova', intro: rip.intro, items: rip.items }, { includeAnswers: false, includeBar: false });
    ok(!senzaSol.includes(SCHEDA.descrizione),
        '⚠️ la DESCRIZIONE non compare sulla copia degli allievi');
    ok(senzaSol.includes('Miniatura del XII secolo'), 'il contesto invece sì: è la cornice della verifica');

    // 5. le flashcard dalla STESSA scheda
    console.log('\n── DALLA STESSA SCHEDA: le flashcard ──');
    const prima = window.appState.db.studySets.length;
    const rf = await P.generaSet({
        tipo: 'flashcards', nome: SCHEDA.titolo, quantita: 4, area: 'all', angolo: 'auto',
        sorgente: { etichetta: SCHEDA.titolo, materiale: MATERIALE }
    });
    ok(rf && rf.ok, 'flashcard generate dalla stessa sorgente' + (rf && rf.errore ? ' — ' + rf.errore : ''));
    ok(window.appState.db.studySets.length === prima + 1, 'il set è nel vault (è giocabile, non è un foglio)');
    const ultimo = window.appState.db.studySets[window.appState.db.studySets.length - 1];
    ok(ultimo.clone === SCHEDA.titolo, 'il set porta il nome della fonte in `clone` (ELABORA lo legge da lì)');
    ok(materiali[materiali.length - 1].includes('Miniatura del XII secolo'),
        'anche le flashcard nascono dalla scheda, non da una seconda lettura');

    // il caso che rompe tutto in silenzio: una sorgente vuota deve tornare ai rami
    console.log('\n── LA RETE: una sorgente vuota non fa sparire la mappa ──');
    const r2 = await P.generaSet({ tipo: 'flashcards', nome: 'dalla mappa', quantita: 2, area: 'all', angolo: 'auto', sorgente: { etichetta: '', materiale: '   ' } });
    ok(r2 && r2.ok, 'con una sorgente vuota si generano dai rami come sempre');

    console.log('\n' + (ko ? '  ' + ko + ' CONTROLLI FALLITI' : '  TUTTO OK'));
    process.exit(ko ? 1 : 0);
})();
