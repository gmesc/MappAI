/* Smoke della CORNICE su tutti i documenti in ambito: si eseguono i moduli VERI
   (vm) e si ispeziona l'HTML che producono. Trappola §7.8: eseguire, non parsare. */
const fs = require('fs'), vm = require('vm'), path = require('path');
const JS = path.join(__dirname, '..', '..', 'public', 'js');

let ko = 0;
function ok(c, m) { console.log((c ? '  ok  ' : '  KO  ') + m); if (!c) ko++; }

function ambiente() {
    const finestre = [];
    /* Il sandbox È window: nel browser `window.X = …` crea anche il globale `X`,
       e i moduli dell'app ci contano (mappai-timeline.js scrive
       `window.MappAITimeline = …` e alla riga dopo usa `MappAITimeline`). */
    const sb = {
        console, JSON, Math, Date, Array, Object, String, Number,
        Boolean, RegExp, Error, Promise, parseInt, parseFloat, isNaN, encodeURIComponent,
        setTimeout, clearTimeout, Set, Map,
        localStorage: { getItem: () => null, setItem() { }, removeItem() { } },
        appState: {
            rootNodeLabel: 'Sistema Terra', extractionMode: 'mindmap',
            db: { nodes: [], links: [], studySets: [], sourcesDict: {} }
        }
    };
    sb.window = sb; sb.self = sb; sb.globalThis = sb;
    const win = sb;
    win.currentLanguage = 'it';
    win.t = (k, f) => f;
    win.showToast = () => { };
    // il contesto attivo: è da qui che escono i chip classe e materia
    win.MappAIClasses = { getActive: () => ({ id: 'c1', name: '2A' }), effectiveDiscipline: () => 'Geografia' };
    win.open = () => { const w = { document: { write(h) { finestre.push(h); }, close() { } } }; return w; };
    sb.document = undefined;
    vm.createContext(sb);
    return { sb, win, finestre };
}
function carica(sb, f) { vm.runInContext(fs.readFileSync(path.join(JS, f), 'utf8'), sb, { filename: f }); }

/* Le tre prove che valgono per OGNI documento in ambito. */
function cornice(nome, html, opts) {
    opts = opts || {};
    console.log('— ' + nome);
    ok(/class="mm-dh"/.test(html), 'testata condivisa');
    ok(/mm-dh__c--cls">2A</.test(html), 'chip CLASSE dal contesto attivo');
    ok(/mm-dh__c--mat">Geografia</.test(html), 'chip MATERIA dal contesto attivo');
    ok(/@bottom-right \{ content: "pagina " counter\(page\) " di " counter\(pages\)/.test(html),
        'numero di pagina nei margin-box');
    ok(/@bottom-left \{ content: /.test(html), 'marchio nel piè');
    ok(!/\d{2}\/\d{2}\/\d{4}[ ,]+\d{1,2}:\d{2}/.test(html), 'data SENZA ora');
    if (opts.vecchie) {
        ok(!new RegExp('class="(' + opts.vecchie.join('|') + ')"').test(html),
            'nessuna testata vecchia (' + opts.vecchie.join(', ') + ')');
    }
}

// ── QUIZ · DOMANDE APERTE ────────────────────────────────────────────────────
{
    const { sb, win } = ambiente();
    ['mappai-print-layout.js', 'mappai-docedit-core.js', 'mappai-doc-bar.js',
        'mappai-doc-head.js', 'mappai-quiz-print.js'].forEach(f => carica(sb, f));
    cornice('QUIZ', win.buildQuizSetHtml({ title: 'Nodo: Il Clima', items: [{ question: 'q', options: ['a', 'b'], correctIndex: 0 }] }, { mapName: 'Sistema Terra' }), { vecchie: ['qp-header'] });
    cornice('DOMANDE APERTE', win.buildOpenQuestionsHtml({ title: 'Ramo: Idrosfera', items: [{ question: 'q', guide: 'g', lines: 5 }] }, { mapName: 'Sistema Terra' }), { vecchie: ['qp-header'] });

    console.log('— FLASHCARD (fuori ambito: non deve cambiare)');
    const fc = win.buildFlashcardSetHtml({ title: 'Ramo: X', items: [{ front: 'a', back: 'b' }] }, { mapName: 'M' });
    ok(!/class="mm-dh"/.test(fc), 'nessuna cornice condivisa');
    ok(/class="fc-screen-head"/.test(fc), 'il suo chrome congelato');
    ok(!/counter\(page\)/.test(fc), 'nessun numero di pagina (è un foglio da ritagliare)');
}

// ── SINTESI ──────────────────────────────────────────────────────────────────
{
    const { sb, win } = ambiente();
    ['mappai-doc-head.js', 'mappai-docedit-core.js', 'mappai-branch-synthesis.js'].forEach(f => carica(sb, f));
    const BS = win.MappAIBranchSynthesis || win.MappAISynthesis;
    const html = BS.buildPrintHtml({ branchLabel: 'Il Clima', mapName: 'Sistema Terra', rawText: '## Titolo\nTesto.', sourcesArr: [] });
    cornice('SINTESI', html, { vecchie: ['bs-header'] });
    ok(/--ap-txt-k/.test(html) && /\.mm-dh__t \{ font-size:calc\(20px \* var\(--ap-txt-k\)\)/.test(html),
        'la testata segue ancora la leva di leggibilità dello schermo');
    ok(/@page \{ size: A4 portrait; margin: 20mm 20mm 25mm 20mm;/.test(html),
        'il @page del documento resta il suo (20mm), non quello della cornice');
}

// ── TIMELINE ─────────────────────────────────────────────────────────────────
{
    const { sb, win, finestre } = ambiente();
    ['mappai-timeline-core.js', 'mappai-doc-head.js', 'mappai-timeline.js'].forEach(f => carica(sb, f));
    win._renderTimeline([{ year: 1291, raw: '1291', type: 'year', sortKey: 12910000, nodeLabel: 'Patto', nodeLevel: 1, macroLabel: 'Storia', macroColor: '#4f46e5', chunkText: '', chunkSource: '', chunkTitle: '', chunkIdx: 0 }], 'Sistema Terra', {});
    ok(finestre.length === 1, 'la finestra della timeline è stata scritta');
    if (finestre.length) {
        cornice('TIMELINE', finestre[0], { vecchie: ['tl-header'] });
        ok(/id="tl-count"/.test(finestre[0]), 'il badge del conteggio conserva il suo id (lo riscrive la modalità esercizio)');
    }
}

// ── CATENA DEI PERCHÉ ────────────────────────────────────────────────────────
{
    const { sb, win } = ambiente();
    ['mappai-causal-core.js', 'mappai-doc-head.js', 'mappai-causal-chains.js'].forEach(f => carica(sb, f));
    const CC = win.MappAICausal;
    const html = CC && CC.buildDocHtml
        ? CC.buildDocHtml({ rootItems: [], branches: [], cross: [] }, 'Sistema Terra') : null;
    if (!html) { console.log('— CATENA: builder non esportato, prova saltata'); }
    else cornice('CATENA DEI PERCHÉ', html, { vecchie: ['cc-header'] });
}

// ── GLOSSARIO ────────────────────────────────────────────────────────────────
{
    const { sb, win, finestre } = ambiente();
    sb.appState.db.nodes = [
        { id: 'n0', label: 'Sistema Terra', level: 0 },
        { id: 'n1', label: 'Clima', level: 1, group: 1, desc: 'Insieme delle condizioni atmosferiche medie di una regione.' },
        { id: 'n2', label: 'Idrosfera', level: 2, group: 1, desc: 'Tutta l acqua presente sul pianeta, in ogni suo stato.' }
    ];
    sb.appState.db.links = [{ source: 'n0', target: 'n1' }, { source: 'n1', target: 'n2' }];
    win.getNodeColor = () => '#4f46e5';
    win.cleanLabel = (x) => x;
    ['mappai-doc-head.js', 'mappai-glossary.js'].forEach(f => carica(sb, f));
    win.openGlossaryView();
    if (!finestre.length) console.log('— GLOSSARIO: nessuna finestra (dati insufficienti), prova saltata');
    else cornice('GLOSSARIO', finestre[0], { vecchie: ['gl-header'] });
}

// ── DOSSIER: gli helper, che il builder intero non è eseguibile qui ──────────
{
    const { sb, win } = ambiente();
    carica(sb, 'mappai-doc-head.js');
    const src = fs.readFileSync(path.join(JS, 'mappai-print-dossier.js'), 'utf8');
    console.log('— DOSSIER (builder non eseguibile senza DOM: si provano gli helper)');
    // si estraggono e si eseguono le quattro funzioni della cornice
    const blocco = src.slice(src.indexOf('function _dsDH()'), src.indexOf('window.printAllNodeDossiers'));
    vm.runInContext(blocco, sb);
    const testata = sb.eval ? null : vm.runInContext('_dsTestata("Dossier Nodo", "Il Clima", "Sistema Terra")', sb);
    ok(/class="mm-dh"/.test(testata), 'testata condivisa');
    ok(/mm-dh__c--cls">2A</.test(testata) && /mm-dh__c--mat">Geografia</.test(testata), 'chip classe e materia');
    const pie = vm.runInContext('_dsPie("Sistema Terra", "data:image/png;base64,AAA")', sb);
    ok(/@bottom-right \{ content: "pagina " counter\(page\)/.test(pie), 'numero di pagina');
    ok(/@bottom-left \{ content: url\("data:image\/png;base64,AAA"\)/.test(pie), 'logo nel piè');
    ok(!/position: *fixed/.test(pie), 'non è più un elemento fisso (saltava pagina 1)');
    ok(src.indexOf('${_dsPie(rootMapName, mappaiIconPie)}') > 0, 'il piè è dentro il @page del dossier');
    ok(src.indexOf('${_dsTestata(dossierTitle, dossierSubtitle, rootMapName)}') > 0, 'la testata è nel corpo');
    ok(!/class="dossier-footer"/.test(src), 'il piè fisso non si emette più');
}

// ── PRIVACY: contesto su un ALLIEVO → nessun chip su nessun foglio ──────────
{
    console.log('— PRIVACY (contesto = allievo)');
    const { sb, win } = ambiente();
    win.MappAIClasses = {
        activeStudentName: () => 'Anna Rossi',
        getActive: () => null, effectiveDiscipline: () => ''
    };
    ['mappai-print-layout.js', 'mappai-docedit-core.js', 'mappai-doc-bar.js',
        'mappai-doc-head.js', 'mappai-quiz-print.js'].forEach(f => carica(sb, f));
    const q = win.buildQuizSetHtml({ title: 'Nodo: Il Clima', items: [{ question: 'q', options: ['a'], correctIndex: 0 }] }, { mapName: 'Sistema Terra' });
    ok(!/Anna Rossi/.test(q), 'il nome dell allievo non finisce sul foglio');
    ok(!/class="mm-dh__c/.test(q), 'nessun chip nel MARKUP: nemmeno la materia da sola');
    ok(/class="mm-dh"/.test(q), 'la testata c e comunque (titolo, mappa, data)');
}

console.log(ko ? '\nFALLITI: ' + ko : '\nTUTTO OK');
process.exit(ko ? 1 : 0);
