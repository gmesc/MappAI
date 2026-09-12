// Il foglio quiz è l'UNICA resa del documento: schermo, stampa, PDF, QR e vault
// passano tutti da buildQuizSetHtml. Questi test lo caricano in una sandbox con i
// soli globali che usa (window/appState/showToast) e verificano le due proprietà
// da cui dipende l'hub documenti: normalizzazione degli item storici e round-trip
// della sorgente incorporata nel foglio (<script id="qp-set">).
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const D = require('../public/js/mappai-docedit-core.js');
// Le misure del foglio vivono nel modulo di layout: senza, il builder non sa
// quanto è grande una carta (nell'app lo carica index.html prima di questo file).
const PL = require('../public/js/mappai-print-layout.js');
// La topbar del foglio è UNA per tutti i documenti stampabili (2/8): senza il
// modulo il builder emette il foglio senza barra, che è ciò che serve al PDF.
const DB = require('../public/js/mappai-doc-bar.js');

function loadQuizPrint() {
    const win = { MappAIDocEdit: D, MappAIPrintLayout: PL, MappAIDocBar: DB };
    const sandbox = {
        window: win, appState: { db: { studySets: [] }, nodes: [] },
        showToast: () => { }, cleanLabel: s => s, console,
        Date: Date, JSON: JSON, Object: Object, Array: Array, String: String,
    };
    sandbox.globalThis = sandbox;
    vm.createContext(sandbox);
    const src = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'mappai-quiz-print.js'), 'utf8');
    vm.runInContext(src, sandbox);
    win.__appState = sandbox.appState;   // hook di test: la mappa si popola da qui
    return win;
}

const W = loadQuizPrint();

// Set nella forma prodotta da generateDynamicQuiz (q/correct), quella che l'app
// salva davvero in appState.db.studySets.
const RAW = {
    id: 'set_1', title: 'Funzioni Urbane — Scelta Multipla', mode: 'quiz', type: 'Scelta Multipla',
    items: [
        { q: 'Qual è una attività della funzione industriale?', correct: 'Produce ricchezza.', explanation: 'Sta nel testo.', options: ['Costruisce case.', 'Produce ricchezza.'] },
        { q: 'Dove stanno le industrie?', correct: 2, explanation: '', options: ['In centro.', 'In periferia.'] }
    ]
};

test('buildQuizSetHtml: le domande in forma q/correct finiscono nel foglio (bug storico)', () => {
    const html = W.buildQuizSetHtml(RAW, { mapName: 'Funzioni Urbane', now: '01/01/2026' });
    assert.ok(/Qual è una attività della funzione industriale\?/.test(html), 'domanda presente');
    assert.ok(/In periferia\./.test(html));
    assert.ok(!/—<\/span>/.test(html), 'nessuna soluzione «—»');
    const key = html.split('answer-key')[1] || '';
    assert.ok(/Produce ricchezza\./.test(key), 'soluzione 1 nel foglio soluzioni');
    assert.ok(/In periferia\./.test(key), 'soluzione 2 risolta dall\'indice 1-based');
});

test('buildQuizSetHtml: includeAnswers:false toglie il foglio soluzioni e le domande restano', () => {
    const withA = W.buildQuizSetHtml(RAW, {});
    const noA = W.buildQuizSetHtml(RAW, { includeAnswers: false });
    assert.ok(/class="answer-key"/.test(withA));
    assert.ok(!/class="answer-key"/.test(noA));
    assert.ok(/Dove stanno le industrie\?/.test(noA), 'le domande restano');
});

// La copia per gli allievi viaggia via QR: le soluzioni non devono esistere
// nemmeno nel sorgente HTML (un «visualizza sorgente» le mostrerebbe).
test('buildQuizSetHtml: la copia senza soluzioni non incorpora risposte né spiegazioni', () => {
    const noA = W.buildQuizSetHtml(RAW, { includeAnswers: false });
    assert.ok(!/id="qp-set"/.test(noA), 'nessuna sorgente JSON incorporata');
    assert.ok(!/Sta nel testo\./.test(noA), 'nessuna spiegazione');
    assert.ok(!/correctIndex/.test(noA), 'nessun indice della risposta corretta');
    assert.strictEqual(W.MappAIQuizPrint.setFromHtml(noA), null);
    // la copia del docente invece la conserva (serve a ristampare le due varianti)
    assert.ok(/id="qp-set"/.test(W.buildQuizSetHtml(RAW, {})));
});

test('buildQuizSetHtml: includeBar:false toglie la barra di stampa (serve per il PDF)', () => {
    assert.ok(/window.print\(\)/.test(W.buildQuizSetHtml(RAW, {})));
    assert.ok(!/window.print\(\)/.test(W.buildQuizSetHtml(RAW, { includeBar: false })));
});

test('setFromHtml: la sorgente incorporata torna indietro identica', () => {
    const html = W.buildQuizSetHtml(RAW, {});
    const back = W.MappAIQuizPrint.setFromHtml(html);
    assert.strictEqual(back.items.length, 2);
    assert.strictEqual(back.title, RAW.title);
    assert.strictEqual(back.items[0].question, RAW.items[0].q);
    assert.strictEqual(back.items[0].correctIndex, 1);
    // e ricostruendo il foglio dalla sorgente si ottiene lo stesso documento
    const again = W.buildQuizSetHtml(back, { mapName: 'X', now: 'Y' });
    assert.ok(/Qual è una attività della funzione industriale\?/.test(again));
});

test('setFromHtml: regge virgolette, tag e </script> dentro il testo delle domande', () => {
    const nasty = {
        id: 'n', title: 'Quiz "difficile" & <b>strano</b>', mode: 'quiz', type: 'MC',
        items: [{
            q: 'Che cosa fa </script><script>alert(1)</script> nel testo?',
            correct: 'Niente', options: ['Niente', 'Tutto "davvero"'], explanation: 'a < b & c > d'
        }]
    };
    const html = W.buildQuizSetHtml(nasty, {});
    // il blocco JSON non deve chiudersi prima del tempo: un solo </script> di chiusura
    const block = html.split('id="qp-set">')[1].split('</script>')[0];
    assert.ok(!/<\/script>/i.test(block), 'nessuna chiusura anticipata dentro il JSON');
    const back = W.MappAIQuizPrint.setFromHtml(html);
    assert.strictEqual(back.items[0].question, nasty.items[0].q);
    assert.strictEqual(back.items[0].options[1], 'Tutto "davvero"');
    // e il testo visibile resta escapato (niente HTML iniettato nel foglio)
    assert.ok(!/<script>alert\(1\)<\/script> nel testo/.test(html.split('id="qp-set"')[0]));
});

test('setFromHtml: null su un documento che non è un foglio quiz', () => {
    assert.strictEqual(W.MappAIQuizPrint.setFromHtml('<html><body>ciao</body></html>'), null);
    assert.strictEqual(W.MappAIQuizPrint.setFromHtml(''), null);
});

test('buildFlashcardSetHtml: front/back storici finiscono sulla carta', () => {
    const html = W.buildFlashcardSetHtml({ id: 'f', title: 'F', mode: 'flashcard', items: [{ front: 'Domanda?', back: 'Risposta.' }] }, {});
    assert.ok(/Domanda\?/.test(html));
    assert.ok(/Risposta\./.test(html));
    assert.ok(!/>—</.test(html), 'niente retro vuoto');
});

// ── Testata della carta: ROOT + macro-area ───────────────────────────────────
// Una carta ritagliata perde il foglio: deve dire da sola mappa e ramo. La
// macro-area si risale dalla gerarchia, il progressivo «01 · Domanda» sparisce.

const MAPPA = {
    nodes: [
        { id: 'r', label: 'Le funzioni urbane', level: 0 },
        { id: 'a', label: 'Funzione industriale', level: 1 },
        { id: 'b', label: 'Industrie in periferia', level: 2 }
    ],
    links: [{ source: 'r', target: 'a' }, { source: 'a', target: 'b' }]
};
function withMap() { W.__appState.db = Object.assign({ studySets: [] }, MAPPA); }
function noMap() { W.__appState.db = { studySets: [] }; }

const FC = { id: 'f1', mode: 'flashcard', items: [{ front: 'Dove stanno le industrie?', back: 'In periferia.' }] };

test('cardHeader: dal titolo del set risale alla macro-area L1', () => {
    withMap();
    const h = W.MappAIQuizPrint.cardHeader({ title: 'Nodo: Industrie in periferia' }, {});
    assert.strictEqual(h.root, 'Le funzioni urbane');
    assert.strictEqual(h.theme, 'Funzione industriale');
    // un nodo già L1 è la propria macro-area
    assert.strictEqual(W.MappAIQuizPrint.cardHeader({ title: 'Ramo: Funzione industriale' }, {}).theme, 'Funzione industriale');
});

test('cardHeader: nessun nodo corrispondente → resta il titolo del set; mai la radice ripetuta', () => {
    withMap();
    assert.strictEqual(W.MappAIQuizPrint.cardHeader({ title: 'Ramo: Ramo sparito' }, {}).theme, 'Ramo sparito');
    // set di tutta la mappa: riga 2 vuota, non «TEMA: Le funzioni urbane»
    assert.strictEqual(W.MappAIQuizPrint.cardHeader({ title: 'Le funzioni urbane' }, {}).theme, '');
    // un titolo libero non è un tema: non finisce sulla carta
    assert.strictEqual(W.MappAIQuizPrint.cardHeader({ title: 'Domande della scheda' }, {}).theme, '');
    // e opts forza entrambi i valori (pipeline / editor documenti)
    const forced = W.MappAIQuizPrint.cardHeader({ title: 'Nodo: Industrie in periferia' }, { rootLabel: 'X', theme: 'Y' });
    assert.strictEqual(forced.root, 'X');
    assert.strictEqual(forced.theme, 'Y');
});

test('buildFlashcardSetHtml: la carta porta mappa e area tematica, senza etichette', () => {
    withMap();
    const html = W.buildFlashcardSetHtml(Object.assign({ title: 'Nodo: Industrie in periferia' }, FC), {});
    assert.ok(/Le funzioni urbane/.test(html), 'riga 1 = etichetta del ROOT');
    assert.ok(/class="fc-theme">Funzione industriale</.test(html), 'riga 2 = sola area tematica');
    assert.ok(!/TEMA:/.test(html), 'nessun prefisso «TEMA:» (aria in più)');
    assert.ok(!/class="fc-lbl"/.test(html), 'nessuna etichetta «RISPOSTA» sopra il retro');
    assert.ok(!/01 · Domanda/.test(html), 'niente progressivo');
    assert.ok(/dashed #ff8a00/.test(html), 'bordo di taglio come il foglio nodi');
});

// ── Geometria del foglio: gemello del foglio dei nodi ────────────────────────
// A4 con margini 15/10 mm, carte affiancate SENZA spazi, bordo tratteggiato
// arancione di taglio. Le misure sono un contratto: la stampa dipende da queste.

test('flashSheet: il default è 2×2 VERTICALE (95×133 mm, 13 pt) e riempie l\'A4 senza spazi', () => {
    const g = W.MappAIQuizPrint.flashSheet();
    assert.strictEqual(g.key, '2x2v');
    assert.strictEqual(g.landscape, false);
    assert.strictEqual(g.perPage, 4);
    // (210 − 2×10) / 2 = 95 → 94.8 con la tolleranza di stampa (0,2 mm)
    assert.strictEqual(g.cardW, 94.8);
    // (297 − 2×15) / 2 = 133.5 → 133.3
    assert.strictEqual(g.cardH, 133.3);
    // corpo FISSO: domanda 13 pt, risposta 13 pt, nessuna crescita
    assert.strictEqual(g.q, 13);
    assert.strictEqual(g.qMax, 13, 'grow:false → il corpo non cresce');
    assert.strictEqual(g.aStart, 13, 'risposta allo stesso corpo della domanda');
    assert.ok(g.cardH * g.rows <= g.pageH - 30, 'le righe non sfondano la pagina');
    assert.ok(g.cardW * g.cols <= g.pageW - 20, 'le colonne non sfondano la pagina');
    // chiave sconosciuta → default, mai geometria indefinita
    assert.strictEqual(W.MappAIQuizPrint.flashSheet('9x9').key, '2x2v');
    // il 2×2 orizzontale resta disponibile: 138.5×90 → 138.3×89.8
    const l = W.MappAIQuizPrint.flashSheet('2x2');
    assert.strictEqual(l.landscape, true);
    assert.strictEqual(l.cardW, 138.3);
    assert.strictEqual(l.cardH, 89.8);
    assert.ok(W.MappAIQuizPrint.flashSheets().indexOf('4x3') >= 0);
});

test('buildFlashcardSetHtml: pagina verticale, griglia senza gutter, margini ridotti', () => {
    withMap();
    const html = W.buildFlashcardSetHtml(Object.assign({ title: 'Nodo: Industrie in periferia' }, FC), {});
    assert.ok(/@page \{ size: A4 portrait; margin: 15mm 10mm; \}/.test(html), 'A4 verticale, margini del foglio nodi');
    assert.ok(/grid-template-columns:repeat\(2, 94\.8mm\)/.test(html));
    assert.ok(/grid-auto-rows:133\.3mm/.test(html));
    assert.ok(/gap:0/.test(html), 'nessuno spazio fra le carte');
    // margine superiore ridotto del 60%: 3,7 → 1,5 mm (domanda) · 3,2 → 1,3 mm (risposta)
    assert.ok(/\.fc-front \{[^}]*padding:1\.5mm 4mm 2\.5mm/.test(html));
    assert.ok(/\.fc-back  \{[^}]*padding:1\.3mm 4mm 2\.5mm/.test(html));
    // intestazione e istruzioni restano a schermo: il foglio stampato è solo carte
    assert.ok(/<div class="no-print">\s*<div class="fc-screen-head">/.test(html));
    /* Lo CHROME di questo foglio è SUO (scorporato l'11/8/26): il materiale da
       ritagliare resta com'è mentre le testate degli altri documenti vengono
       riordinate. Se una regola .qp-* tornasse qui dentro, quel riordino
       ricomincerebbe a cambiare anche il foglio delle flashcard — che è
       esattamente ciò che lo scorporo impedisce. */
    assert.ok(!/class="qp-/.test(html), 'nessun uso di classi .qp-* nel markup');
    assert.ok(!/\.qp-(header|title|subtitle|badge|footer) *\{/.test(html),
        'nessuna regola .qp-* inclusa nel foglio flashcard');
    // e il verticale resta a un parametro di distanza
    assert.ok(/@page \{ size: A4 portrait/.test(W.buildFlashcardSetHtml(FC, { sheet: '2x4' })));
});

test('buildFlashcardSetHtml: senza mappa in memoria la carta non stampa una riga TEMA vuota', () => {
    noMap();
    const html = W.buildFlashcardSetHtml(Object.assign({ title: 'Flashcard' }, FC), { mapName: 'Mappa X' });
    assert.ok(!/TEMA:/.test(html), 'riga 2 assente se la macro-area non è risolvibile');
    assert.ok(/Mappa X/.test(html), 'riga 1 ripiega sul nome mappa passato dal chiamante');
    noMap();
});


/* ── La sorgente nel vault (6/9) ─────────────────────────────────────────── */
test('scriviSorgente: gemello .html in Materiale Studio/Sorgenti/, stesso stem del PDF', async () => {
    const scritti = [];
    W.electronAPI = { saveVaultFile: async (p) => { scritti.push(p); return { ok: true }; } };
    const html = W.buildOpenQuestionsHtml({ title: 'T', items: [{ question: 'Q?' }], angle: 'causa' }, { mapName: 'M', now: '01/01/2026', includeBar: false });
    const r = await W.MappAIQuizPrint.scriviSorgente('/v', 'Domande-aperte-Il Clima-causa - TM Sans.pdf', html);
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.relPath, 'Materiale Studio/Sorgenti/Domande-aperte-Il Clima-causa - TM Sans.html');
    assert.strictEqual(scritti[0].relPath, r.relPath);
    assert.ok(/id="qp-set"/.test(scritti[0].text), 'il gemello porta la sorgente');
    const set = W.MappAIQuizPrint.setFromHtml(scritti[0].text);
    assert.strictEqual(set.angle, 'causa', 'e da lì si rilegge, angolo compreso');
    /* senza vault o senza IPC non scrive e lo dice */
    assert.strictEqual((await W.MappAIQuizPrint.scriviSorgente('', 'x.pdf', html)).ok, false);
    delete W.electronAPI;
});

test('buildOpenQuestionsHtml: con `risposta` il foglio è COMPILATO e senza soluzioni', () => {
    const set = { title: 'T', items: [{ question: 'Q?', guide: 'traccia segreta', risposta: 'La mia risposta' }, { question: 'R?' }] };
    const html = W.buildOpenQuestionsHtml(set, { mapName: 'M', now: '01/01/2026', includeBar: false, includeAnswers: false });
    assert.ok(/La mia risposta/.test(html), 'la risposta al posto delle righe');
    assert.strictEqual((html.match(/height:26px/g) || []).length, 4, 'le righe vuote restano solo sulla domanda senza risposta');
    assert.ok(!/traccia segreta/.test(html) && !/answer-key/.test(html) && !/qp-set/.test(html), 'niente tracce, niente sorgente');
    const doc = W.buildOpenQuestionsHtml({ title: 'T', items: [{ question: 'Q?' }] }, { mapName: 'M', now: '01/01/2026' });
    assert.ok(!/oq-risposta/.test(doc), 'senza `risposta` il foglio è quello di sempre');
});

test('quiz: spiegazioni visibili nelle soluzioni e struttura navigabile per titoli e liste', () => {
    const { load } = require('cheerio');
    const $ = load(W.buildQuizSetHtml(RAW, { includeBar: false }));
    assert.strictEqual($('main').length, 1);
    assert.strictEqual($('h1').length, 1);
    assert.strictEqual($('main > h2').text(), 'Domande');
    assert.strictEqual($('.quiz-item h3').length, 2);
    assert.strictEqual($('.quiz-options[role="list"] > li').length, 4);
    assert.strictEqual($('.quiz-options > li').first().find('[aria-hidden="true"]').length, 0, 'la lettera della scelta deve poter essere letta');
    assert.strictEqual($('.answer-key .quiz-explanation').text(), 'Spiegazione: Sta nel testo.');
    assert.strictEqual($('.quiz-item .quiz-explanation').length, 0);
    $('section[aria-labelledby], ol[aria-labelledby]').each((_, el) => {
        assert.strictEqual($('#' + $(el).attr('aria-labelledby')).length, 1, 'ogni riferimento punta a un titolo esistente');
    });
    assert.ok($.html().includes('font-size:12pt'), 'testo delle opzioni in punti leggibili');
});

test('quiz e flashcard: il round-trip conserva identità, evidenze, revisioni e altri metadati', () => {
    const set = { ...RAW, angle: 'confronto', sourceRevision: 'rev-2', review: { status: 'approved' },
        items: [{ ...RAW.items[0], id: 'item-uno', nodeIds: ['economia'], evidenza: [{ sourceId: 'src-uno', page: 5, text: 'Fonte esatta.' }],
            g2: { status: 'teacher-override', issueId: 'issue-7' } }] };
    for (const builder of [W.buildQuizSetHtml, W.buildFlashcardSetHtml]) {
        const back = W.MappAIQuizPrint.setFromHtml(builder(set, { includeBar: false }));
        assert.strictEqual(back.angle, set.angle);
        assert.strictEqual(back.sourceRevision, set.sourceRevision);
        assert.deepStrictEqual(back.review, set.review);
        assert.strictEqual(back.items[0].id, 'item-uno');
        assert.deepStrictEqual(back.items[0].nodeIds, ['economia']);
        assert.deepStrictEqual(back.items[0].evidenza, set.items[0].evidenza);
        assert.deepStrictEqual(back.items[0].g2, set.items[0].g2);
    }
});

test('aperte: anche un unico criterio breve resta visibile e semantico, senza perdere i metadati', () => {
    const { load } = require('cheerio');
    const X = loadQuizPrint();
    X.MappAIPipelineCore = require('../public/js/mappai-pipeline-core.js');
    const set = { id: 'aperte', angle: 'definizione', sourceRevision: 'rev-3',
        items: [{ id: 'guisan', question: 'Chi fu eletto generale?', criteri: ['Cita Guisan.'], guide: 'Cita Guisan.', evidenza: { page: 2 } }] };
    const html = X.buildOpenQuestionsHtml(set, { includeBar: false });
    const $ = load(html);
    assert.strictEqual($('.oq-criteria[role="list"] > li').text(), 'Cita Guisan.');
    assert.strictEqual($('.oq-item h3').text().trim(), set.items[0].question);
    assert.strictEqual($('main').length, 1);
    const back = X.MappAIQuizPrint.setFromHtml(html);
    assert.strictEqual(back.sourceRevision, 'rev-3');
    assert.strictEqual(back.items[0].id, 'guisan');
    assert.deepStrictEqual(back.items[0].evidenza, { page: 2 });
});

test('flashcard: ogni carta è un articolo con titolo e testo del retro accessibili', () => {
    const { load } = require('cheerio');
    const $ = load(W.buildFlashcardSetHtml({ id: 'flash', title: 'Economia', mode: 'flashcard',
        items: [{ front: 'Chi ricevette valuta?', back: 'La Germania.', explanation: 'La BNS acquistò oro dalla Germania.' }] }, {}));
    assert.strictEqual($('main article.fc-card').length, 1);
    assert.strictEqual($('article h2').text(), 'Chi ricevette valuta?');
    assert.strictEqual($('article .fc-a').text(), 'La Germania.');
    assert.strictEqual($('article .fc-e').text(), 'La BNS acquistò oro dalla Germania.');
    assert.strictEqual($('#' + $('article').attr('aria-labelledby')).length, 1);
});
