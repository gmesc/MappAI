/*
 * Packet 0132 — uno stile per tutti i report (docente e allievo, Electron e iPad).
 * Giacomo, 27/10: «Il foglio delle aperte ma con un corpo del titolo di 3pt più grandi»; «13px ma aumenta l'interlinea»;
 * «Interlinea delle risposte: 2,0»; «accetto tutte le proposte grafiche della versione 0132, correggi la versione del report
 * del tutor e inserisci nella testata della pagina la stessa barra presente in tutte le altre pagine dei report e inserisci
 * il nome del reporto coerentemente a come è strutturato per tutti gli altri report». Al «vai» (28/10): «🦄 02» nel Tutor.
 */
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const crypto = require('node:crypto');

const ROOT = path.join(__dirname, '..');
const DH = require(path.join(ROOT, 'public/js/mappai-doc-head.js'));
const LR = require(path.join(ROOT, 'public/js/mappai-live-reports.js'));
const TR = require(path.join(ROOT, 'public/js/mappai-tutor-reports.js'));
const leggi = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

function caricaQP() {
    const win = { MappAIDocHead: DH, MappAIDocEdit: require(path.join(ROOT, 'public/js/mappai-docedit-core.js')),
        MappAIPrintLayout: require(path.join(ROOT, 'public/js/mappai-print-layout.js')), MappAIDocBar: require(path.join(ROOT, 'public/js/mappai-doc-bar.js')) };
    const sb = { window: win, appState: { db: { studySets: [] }, nodes: [] }, showToast() { }, cleanLabel: s => s, console: { log() { }, warn() { } },
        Date, JSON, Object, Array, String };
    sb.globalThis = sb;
    vm.createContext(sb);
    vm.runInContext(leggi('public/js/mappai-quiz-print.js'), sb);
    return win;
}
const QP = caricaQP();

/* ── i dati: quelli del mockup (dati veri, ridotti) ──────────────────────────────────────────────────────── */
const META = { mapTitle: 'Elettricità', materiale: 'Scelta multipla · Definizione', activity: 'Quiz', className: '4R', dateStr: '27/10/2026', durationStr: '12 min' };
const it = (o) => Object.assign({ outcome: 'right', text: 'Che cos\'è la corrente?', yourText: 'Un flusso di cariche', correctText: 'Un flusso di cariche' }, o);
const allievo = (o) => Object.assign({ displayName: '🦄 02', emoji: '🦄', num: '02', answered: 3, blankCount: 1, manualCount: 0, hintsUsed: 0,
    accuracyPct: 33, medianRate: 4.2, strengths: ['Circuiti'], weaknesses: ['Tensione'],
    items: [it({}), it({ outcome: 'wrong', yourText: 'Una pila', text: 'Che cos\'è un generatore?', correctText: 'Una macchina' }),
        it({ outcome: 'blank', yourText: '', text: 'Che cos\'è un conduttore?', correctText: 'Un metallo' })] }, o);
const RIS = { joined: 2, questionCount: 3, perStudent: [allievo({}), allievo({ displayName: '🦊 07', emoji: '🦊', num: '07', accuracyPct: 67 })],
    perQuestion: [{ text: 'Che cos\'è la corrente?', right: 1, wrong: 1, blank: 0, manual: 0, pctRight: 50, pctWrong: 50, pctBlank: 0, pctManual: 0, l1Label: 'Circuiti' }] };
const SCELTA = { joined: 1, consegnato: 1, angoli: [{ angle: 'causa', allievi: 1, evitatoDa: 0, scelteTotali: 2 }], aree: [{ ramo: 'Cause', sceltaDa: 1, evitataDa: 0 }],
    byStudent: [{ id: 'u', displayName: '🦄 02', consegnato: true, aree: ['Cause'], profilo: { conteggio: { scritte: 1, lette: 2 }, righe: [{ angle: 'causa', scelte: 1, totale: 2 }] },
        risposte: [{ testo: 'Perché scoppia la guerra?', angle: 'causa', risposta: 'Per l\'attentato di Sarajevo', corretta: null, chip: 'subito' }],
        note: 'Ci ho messo tanto.' }] };
const TIMELINE = { counts: { total: 2, approved: 1, rejected: 1, pending: 0 }, approved: [{ anno: 1914, evento: 'Sarajevo', contesto: 'L\'attentato' }],
    byAuthor: { u: { displayName: '🦄 02', proposals: [{ anno: 1914, evento: 'Sarajevo', status: 'approved' }, { anno: 1920, evento: 'Fine', status: 'rejected' }] } } };
const TUTOR = { session: { name: 'Fine Impero Romano', className: '2A', topic: 'Le cause', mode: 'socratic', cap: 10, writingBrief: 'Scrivi perché cade l\'Impero.',
    startedAt: Date.UTC(2026, 9, 27, 9, 0) },
    students: [{ identity: { emojiKey: 'unicorno', num: '02' }, name: '', submitted: true, neverChatted: false, used: 2, cap: 10,
        submissionText: 'Per le invasioni.', transcript: [{ role: 'student', text: 'Perché?' }, { role: 'tutor', text: 'Che cosa dice la fonte?' }] }] };

const REPORT_LIVE = () => [
    ['Report allievi', LR.buildStudentsReportHtml(META, RIS), 'Report allievi'],
    ['Report allievi (flashcard)', LR.buildStudentsReportHtml(META, { joined: 1, questionCount: 3, perStudent: [allievo({ flashcard: true })] }), 'Report allievi'],
    ['Report allievo (iPad)', LR.buildStudentsReportHtml(META, { joined: 1, questionCount: 3, perStudent: [allievo({})] }, { unAllievo: true }), 'Report allievo'],
    ['Report domande (quiz)', LR.buildQuestionsReportHtml(META, RIS), 'Report domande'],
    ['Report domande (aperte, a scelta)', LR.buildSceltaReportHtml(META, SCELTA), 'Report domande'],
    ['Report costruzione', LR.buildTimelineWorkshopReportHtml(META, TIMELINE), 'Report costruzione'],
    ['Scheda del 💾', LR.buildStudentSheetHtml(META, allievo({}), {}), 'Report allievo']
];
const stili = (h) => (h.match(/<style>[\s\S]*?<\/style>/g) || []).join('\n').replace(/@font-face\{[^}]*\}/g, '');
const corpi = (css) => new Set((css.match(/font-size:\s*[0-9.]+(px|pt)/g) || []).map(x => x.replace(/\s/g, '')));

/* ── 1. la veste nasce in un posto solo ──────────────────────────────────────────────────────────────── */
test('MappAIDocHead: titolo dei report a 24 px (18 pt, 3 pt sopra i 15 del foglio), interlinea delle risposte 2', () => {
    assert.ok(DH.REPORT, 'MappAIDocHead.REPORT esiste');
    assert.strictEqual(DH.REPORT.titolo, 24);
    assert.strictEqual(DH.REPORT.rispostaInterlinea, 2);
    assert.strictEqual(DH.REPORT.risposta, 13, 'la risposta resta a 13 px');
    assert.ok(DH.stile({ report: true }).includes('.mm-dh__t { font-size:24px; }'));
    assert.ok(!DH.stile().includes('font-size:24px'), 'senza `report` il titolo resta a 20');
    assert.strictEqual(typeof DH.stileReport, 'function');
});

test('i numeri della veste sono quelli del foglio delle aperte (invariante 6)', () => {
    const css = DH.stileReport({ accento: '#0f766e', fondoAccento: '#f0fdfa' });
    const foglio = QP.buildOpenQuestionsHtml({ id: 'a', title: 'T', items: [{ question: 'Perché?', risposta: 'Così.', areas: ['Cause'] }] },
        { mapName: 'M', now: '01/01/2026', includeBar: false, includeAnswers: false });
    const regola = (sel) => (new RegExp('\\' + sel + '\\{([^}]*)\\}').exec(css) || [])[1] || '';
    assert.ok(regola('.mm-rp-occ').includes('font-size:11px') && /font-size:11px[^"]*text-transform:uppercase/.test(foglio.replace(/\s+/g, '')), 'occhiello 11 px maiuscolo');
    assert.ok(regola('.mm-rp-dom').includes('font-size:13pt') && regola('.mm-rp-dom').includes('line-height:1.55') && /font-size:13pt;font-weight:bold/.test(foglio.replace(/\s+/g, '')), 'domanda 13 pt, 1,55');
    assert.ok(regola('.mm-rp-ris').includes('font-size:13px') && regola('.mm-rp-ris').includes('border-left:3px solid #0f766e') && regola('.mm-rp-ris').includes('background:#f0fdfa'), 'riquadro');
    assert.ok(regola('.mm-rp-ris').includes('line-height:2'), 'D1: interlinea 2,0');
    assert.ok(regola('.mm-rp-sez').includes('font-size:15px') && regola('.mm-rp-sez').includes('font-weight:900'), 'titolo di sezione = .oq-section-title');
    assert.ok(regola('.mm-rp-card').includes('border-radius:12px') && regola('.mm-rp-card').includes('padding:18px 22px') && regola('.mm-rp-card').includes('border-left:4px solid #0f766e'), 'scheda = .oq-item');
    assert.ok(/body\{[^}]*font-size:12pt[^}]*max-width:800px/.test(css), 'corpo 12 pt, larghezza 800');
    assert.ok(/body\{font-family:var\(--doc-font, 'Space Mono'\), 'MappAI Emoji'/.test(css), 'le emoji nello stack effettivo del corpo');
});

/* ── 2. i materiali non cambiano ─────────────────────────────────────────────────────────────────────── */
const h16 = (s) => crypto.createHash('sha256').update(s).digest('hex').slice(0, 16);
test('i materiali escono identici a main (impronte prese prima del codice, 28/10)', () => {
    const APERTE = { id: 'a', title: 'Le cause', items: [{ question: 'Perché?', lines: 4, areas: ['Cause'] }, { question: 'Come?', guide: 'traccia' }] };
    const QUIZ = { id: 'q', title: 'Quiz', mode: 'quiz', type: 'Scelta Multipla', items: [{ q: 'Chi?', correct: 'Io', explanation: 'Sì.', options: ['Tu', 'Io'] }] };
    const atteso = {
        stile: '42482219b357328e', stileTeal: '5fb66f9fb4b22372', stileSenzaPagina: '40a5477eb5b3c38b',
        aperteVuoto: '729be70bdab71842', aperteVuotoSenzaBarra: 'cf88e024e62135dc', aperteCompilato: '9fdacd87f13cdb7f',
        quiz: '51dab1ed64c8a03d', credenziali: '9c7392212e5da596'
    };
    const oggi = {
        stile: h16(DH.stile()), stileTeal: h16(DH.stile({ accento: '#0f766e', mappa: 'Mappa', logo: '' })), stileSenzaPagina: h16(DH.stile({ pagina: false })),
        aperteVuoto: h16(QP.buildOpenQuestionsHtml(APERTE, { mapName: 'Mappa', now: '01/01/2026' })),
        aperteVuotoSenzaBarra: h16(QP.buildOpenQuestionsHtml(APERTE, { mapName: 'Mappa', now: '01/01/2026', includeBar: false, includeAnswers: false })),
        aperteCompilato: h16(QP.buildOpenQuestionsHtml({ id: 'p', title: 'P', items: [{ question: 'Perché?', risposta: 'Perché sì.' }] },
            { mapName: 'M', now: '01/01/2026', includeBar: false, includeAnswers: false })),
        quiz: h16(QP.buildQuizSetHtml(QUIZ, { mapName: 'Mappa', now: '01/01/2026' })),
        credenziali: h16(LR.buildCredentialCardsHtml({ name: '2A', year: '2026', students: [{ emoji: '🦊', num: '07', name: 'Ada' }] }).replace(/generato il [0-9/: ]+/, 'generato il X'))
    };
    assert.deepStrictEqual(oggi, atteso);
});

/* ── 3. ogni report ha la veste ──────────────────────────────────────────────────────────────────────── */
test('i report del LIVE: testata mm-dh col titolo dello 0127 a 24 px, niente lr-header, solo i corpi della veste', () => {
    const ammessi = corpi(DH.stile({ report: true }) + DH.stileReport({}));
    for (const [nome, h, coda] of REPORT_LIVE()) {
        const titolo = 'Elettricità · Scelta multipla · Definizione · ' + coda;
        assert.ok(h.includes('<h1 class="mm-dh__t">' + titolo + '</h1>'), nome + ': il titolo grande');
        assert.ok(stili(h).includes('.mm-dh__t { font-size:24px; }'), nome + ': a 24 px');
        assert.ok(!h.includes('lr-header') && !/class="lr-(?!root")/.test(h), nome + ': niente classi lr-* (la radice del telefono a parte)');
        const fuori = [...corpi(stili(h).replace(/\.lr-root\{font-family[^}]*\}/, ''))].filter(c => !ammessi.has(c));
        assert.deepStrictEqual(fuori, [], nome + ': corpi fuori dalla veste nel CSS');
        const inLinea = [...corpi((h.split('<main>')[1] || h).replace(/<style>[\s\S]*?<\/style>/g, ''))].filter(c => !ammessi.has(c));
        assert.deepStrictEqual(inLinea, [], nome + ': corpi fuori dalla veste negli stili in linea');
    }
});

test('la barra «Stampa / PDF · Chiudi» resta quella di sempre, e il <title> è il titolo della barra (0128, allargamento 23)', () => {
    for (const [nome, h, coda] of REPORT_LIVE().slice(0, 6)) {
        const titolo = 'Elettricità · Scelta multipla · Definizione · ' + coda;
        assert.ok(h.includes(LR.barraReport(titolo)), nome + ': la barra');
        assert.ok(h.includes('<title>' + titolo + '</title>'), nome + ': il <title>');
        assert.ok(/<div class="mm-dh-pie no-print">MappAI Live · generato il /.test(h), nome + ': il piè a schermo è no-print');
        assert.ok(/@page \{ size:A4;/.test(h), nome + ': la pagina A4 col piè «pagina n di N»');
    }
});

test('D1: ogni riquadro di risposta è a 13 px con interlinea 2,0, compreso il foglio delle aperte compilato; il foglio vuoto resta a 1,6', () => {
    for (const [nome, h] of REPORT_LIVE()) {
        if (!h.includes('class="mm-rp-ris')) continue;
        assert.ok(/\.mm-rp-ris\{[^}]*font-size:13px;line-height:2;/.test(stili(h)), nome);
    }
    const compilato = (report) => QP.buildOpenQuestionsHtml({ id: 'p', title: 'P', items: [{ question: 'Perché?', risposta: 'Così.' }] },
        { mapName: 'M', now: '01/01/2026', includeBar: false, includeAnswers: false, report });
    assert.ok(/class="oq-risposta"[^>]*font-size:13px; line-height:2;/.test(compilato(true).replace(/\s+/g, ' ')), 'compilato, report: 2');
    assert.ok(compilato(true).includes('.mm-dh__t { font-size:24px; }'), 'compilato, report: titolo a 24');
    assert.ok(/class="oq-risposta"[^>]*line-height:1.6;/.test(compilato(false).replace(/\s+/g, ' ')), 'senza report: 1,6');
});

test('D2: nei report di classe una scheda per allievo, con dentro le sue domande separate da un filo', () => {
    const h = LR.buildStudentsReportHtml(META, RIS);
    const schede = h.split(/<section class="mm-rp-card[^"]*">/).slice(1);
    assert.strictEqual(schede.length, 2, 'due allievi, due schede');
    for (const s of schede) assert.strictEqual((s.split('</section>')[0].match(/class="mm-rp-voce"/g) || []).length, 4, 'tre domande + forti e deboli');
    assert.ok(stili(h).includes('.mm-rp-voce{border-top:1px solid #e2e8f0'), 'il filo fra le domande');
    assert.ok(h.includes('<span class="mm-rp-et">Risposta</span>') && h.includes('<span class="mm-rp-et">Risposta corretta</span>Una macchina'), 'le etichette dei riquadri');
    /* 0127, gate del 27/10: la domanda vuota dice solo «VUOTO», senza correzione */
    assert.ok(h.includes('<b>VUOTO</b>') && !h.includes('Un metallo'), 'VUOTO senza correzione');
    const sc = LR.buildSceltaReportHtml(META, SCELTA);
    assert.strictEqual(sc.split(/<section class="mm-rp-card[^"]*">/).length - 1, 3, 'scelta: i tagli, le aree, un allievo');
});

/* gate del 28/10 (Giacomo): «nel report allievi l'intestazione della pagina ha un problema di formattazione perché si spezza su due
   fogli». La scheda di un allievo (più lunga di una pagina) col «non spezzarti» si portava dietro mezza testata. */
test('la stampa: le schede lunghe si spezzano fra le domande; testata, riepilogo e ogni domanda restano interi', () => {
    const css = DH.stileReport({});
    assert.ok(css.includes('.mm-dh{page-break-inside:avoid;break-inside:avoid}'), 'la testata intera');
    assert.ok(css.includes('.mm-rp-card--lunga{page-break-inside:auto;break-inside:auto}'), 'la scheda lunga si spezza');
    assert.ok(/\.mm-rp-voce\{[^}]*break-inside:avoid\}/.test(css) && /\.mm-rp-riep\{[^}]*break-inside:avoid\}/.test(css), 'domanda e riepilogo interi');
    const classe = LR.buildStudentsReportHtml(META, RIS);
    assert.strictEqual((classe.match(/<section class="mm-rp-card mm-rp-card--lunga">/g) || []).length, 2, 'le due schede degli allievi');
    assert.strictEqual((classe.match(/<div class="mm-rp-riep">/g) || []).length, 2, 'il riepilogo in un blocco');
    const uno = LR.buildStudentsReportHtml(META, { joined: 1, questionCount: 3, perStudent: [allievo({})] }, { unAllievo: true });
    assert.ok(!uno.includes('class="mm-rp-card mm-rp-card--lunga"'), 'la scheda di un allievo: una scheda per domanda, nessuna lunga');
    assert.strictEqual((TR.buildTutorReportHtml(TUTOR).match(/class="mm-rp-card mm-rp-card--lunga"/g) || []).length, 1, 'il Tutor: la scheda dell\'allievo con la chat');
    assert.ok(LR.buildSceltaReportHtml(META, SCELTA).includes('<section class="mm-rp-card mm-rp-card--lunga"><div class="mm-rp-riep">'), 'domande a scelta');
});

test('D2: le decisioni di prima restano — aperte semplici senza percentuale (0116), flashcard a parole (0128)', () => {
    const aperte = LR.buildStudentsReportHtml(META, { joined: 1, questionCount: 3, perStudent: [allievo({ soloAperte: true, items: [it({ outcome: 'manual' })] })] });
    assert.ok(!/class="mm-rp-num"/.test(aperte) && /mm-rp-pill--mano"[^>]*>●</.test(aperte) && !/da correggere/i.test(aperte), '0116: niente percentuale né «da correggere», la risposta scritta col ●');
    const fc = LR.buildStudentsReportHtml(META, { joined: 1, questionCount: 3, perStudent: [allievo({ flashcard: true })] });
    assert.ok(fc.includes('<span class="mm-rp-et">La tua scelta</span>') && fc.includes('sapevo e ricordavo') && !fc.includes('accuratezza') && fc.includes('title="Carta 1"'), '0128: le carte');
    assert.ok(fc.includes('#047857'), 'accento smeraldo scuro delle flashcard');
});

test('D3: con { unAllievo: true } e un allievo solo, la sua scheda intera (come il 💾); con due allievi il report di classe', () => {
    const uno = LR.buildStudentsReportHtml(META, { joined: 1, questionCount: 3, perStudent: [allievo({})] }, { unAllievo: true });
    assert.ok(uno.includes('<title>Elettricità · Scelta multipla · Definizione · Report allievo</title>'));
    assert.strictEqual(uno.split('<section class="mm-rp-card">').length - 1, 4, 'il riepilogo + una scheda per domanda');
    assert.ok(!uno.includes('fluenza') && !uno.includes('Punti di forza'), 'niente misure del docente');
    /* la scheda dell'allievo non è il report del docente: la domanda vuota porta la risposta corretta (0127) */
    assert.ok(uno.includes('<span class="mm-rp-et">Risposta</span>— vuoto') && uno.includes('Un metallo') && !uno.includes('VUOTO'));
    const due = LR.buildStudentsReportHtml(META, RIS, { unAllievo: true });
    assert.ok(due.includes('Report allievi</title>'), 'con due allievi resta il report di classe');
});

test('la scheda del 💾: la stessa veste nella radice del telefono (niente regole su body), il carattere del docente resta', () => {
    const p = LR.studentSheetParts(META, allievo({}), {});
    assert.ok(!/(^|[}\s])body\{/.test(p.css), 'nessuna regola su body nella radice');
    assert.ok(p.css.includes('.lr-root{font-family:var(--live-font,\'Space Mono\'),var(--emoji,\'MappAI Emoji\')'), 'il carattere del docente');
    assert.ok(!/@page/.test(p.css), 'il telefono stampa la sua radice');
    assert.ok(p.body.includes('<h1 class="mm-dh__t">Elettricità · Scelta multipla · Definizione · Report allievo</h1>'));
});

/* ── 4. il carattere dentro i file del server ────────────────────────────────────────────────────────── */
test('Space Mono e MappAI Emoji dentro i file scritti in Node (server Live e Tutor)', () => {
    const SM = /@font-face\{font-family:'Space Mono';src:url\(data:font\/woff;base64,[A-Za-z0-9+/=]{1000,}/;
    const EM = /@font-face\{font-family:'MappAI Emoji';src:url\(data:font\/woff;base64,/;
    for (const [nome, h] of REPORT_LIVE().slice(0, 6).concat([['Tutor', TR.buildTutorReportHtml(TUTOR)]])) {
        assert.ok(SM.test(h), nome + ': Space Mono');
        assert.ok(EM.test(h), nome + ': MappAI Emoji');
    }
});

/* ── 5. il Tutor come gli altri (D4) ─────────────────────────────────────────────────────────────────── */
test('D4: il report del Tutor ha la barra dei report del LIVE, il titolo «[mappa] · Chiedi e Rispondi · Report tutor», l\'allievo «🦄 02»', () => {
    const h = TR.buildTutorReportHtml(TUTOR);
    const titolo = 'Fine Impero Romano · Chiedi e Rispondi · Report tutor';
    assert.ok(h.includes(LR.barraReport(titolo)), 'la barra, carattere per carattere');
    assert.ok(h.includes('<h1 class="mm-dh__t">' + titolo + '</h1>'), 'lo stesso titolo grande');
    assert.ok(stili(h).includes('.mm-dh__t { font-size:24px; }'));
    assert.ok(!h.includes('tr-noprint') && !h.includes('tr-header'), 'niente riquadro centrato né testata vecchia');
    assert.ok(h.includes('<title>Chiedi e Rispondi — Fine Impero Romano</title>'), 'il <title> (nome del PDF) non cambia');
    assert.ok(!h.includes('unicorno 02'), 'non più il nome interno');
    assert.ok(/<img class="mm-rp-emoji" alt="🦄" src="data:image\/svg\+xml;base64,[^"]+"> 02/.test(h), 'l\'emoji come immagine, poi il numero');
    assert.ok(h.includes('<span class="mm-rp-et">Testo consegnato</span>Per le invasioni.') && h.includes('<span class="mm-rp-et">Tutor</span>Che cosa dice la fonte?'));
    const ammessi = corpi(DH.stile({ report: true }) + DH.stileReport({}));
    assert.deepStrictEqual([...corpi(stili(h))].filter(c => !ammessi.has(c)), [], 'solo i corpi della veste');
    assert.ok(/\.mm-rp-ris\{[^}]*font-size:13px;line-height:2;/.test(stili(h)), 'D1');
});

/* gate del 28/10 (Giacomo, sul PDF del report del Tutor): «il colore dell'area del testo consegnato usando il verde, lo stesso che usi
   per le riposte giuste nei report di Scelta Multipla»; «la testata deve avere scritto in piccolo 'Consegna:' e poi il testo della
   consegna con il font con la dimensione dei titoli delle testate»; «Tutto il report deve avere l'impianto del layout come gli altri report» */
test('il Tutor al gate: testo consegnato in verde, la consegna nella testata, una colonna sola come gli altri report', () => {
    const h = TR.buildTutorReportHtml(TUTOR);
    assert.ok(h.includes('<div class="mm-rp-ris mm-rp-ris--ok"><span class="mm-rp-et">Testo consegnato</span>Per le invasioni.</div>'), 'il verde delle giuste');
    const testa = (h.match(/<div class="mm-dh">[\s\S]*?<\/div><\/div>(?=<h2)/) || [])[0] || '';
    assert.ok(testa.includes('<span class="tr-cons__et">Consegna:</span><span class="tr-cons__t">Scrivi perché cade l&#39;Impero.</span>') ||
        testa.includes('<span class="tr-cons__et">Consegna:</span><span class="tr-cons__t">Scrivi perché cade l\'Impero.</span>'), 'la consegna dentro la testata');
    assert.ok(/\.tr-cons__t\{[^}]*font-size:24px/.test(stili(h)) && /\.tr-cons__et\{[^}]*font-size:11px/.test(stili(h)), '«Consegna:» piccolo, il testo come il titolo');
    assert.ok(!h.includes('>La consegna</h2>'), 'niente più sezione a parte');
    assert.ok(!h.includes('tr-cols') && !h.includes('tr-col"'), 'una colonna sola');
    assert.ok(/<div class="mm-rp-riep">[\s\S]*?<span class="mm-rp-num"[^>]*>2\/10<\/span><span class="mm-rp-testo">scambi col tutor<\/span>/.test(h), 'il riepilogo come gli altri');
    assert.strictEqual((h.match(/<div class="mm-rp-voce/g) || []).length, 2, 'il prodotto e il processo, separati da un filo');
});

test('D4: senza i moduli del LIVE accanto il report del Tutor esce lo stesso (con il titolo, senza barra)', () => {
    const src = leggi('public/js/mappai-tutor-reports.js');
    assert.ok(src.includes("'./mappai-live-reports.js'") && src.includes("'./mappai-live-core.js'") && src.includes("'./mappai-doc-head.js'"), 'li cerca accanto');
    assert.ok(/catch \(e\) \{ return null; \}/.test(src), 'e se non ci sono non cade');
});

/* ── 6. contrasti (invariante 16) ────────────────────────────────────────────────────────────────────── */
function lum(hex) {
    let x = hex.replace('#', '');
    if (x.length === 3) x = x.split('').map(d => d + d).join('');
    const c = x.match(/../g).map(x => parseInt(x, 16) / 255).map(v => v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
const contrasto = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
test('contrasti ≥ 4,5:1 sul fondo che si vede: esiti, quadratini, occhielli', () => {
    const css = DH.stileReport({});
    for (const k of ['ok', 'ko', 'vuota', 'mano']) {
        const es = new RegExp('\\.mm-rp-esito--' + k + '\\{color:(#[0-9a-f]{6});background:(#[0-9a-f]{6})').exec(css);
        assert.ok(es && contrasto(es[1], es[2]) >= 4.5, 'esito ' + k + ': ' + (es && contrasto(es[1], es[2]).toFixed(2)));
        const pi = new RegExp('\\.mm-rp-pill--' + k + ',[^{]*\\{background:(#[0-9a-f]{6});color:(#[0-9a-f]{3,6})\\}').exec(css);
        /* la deroga di Giacomo (gate del 28/10, «Chiaro per tutti»): il quadratino delle giuste ha il verde del filo, ✓ bianco a 3,30:1 */
        if (k === 'ok') { assert.ok(pi && pi[1] === '#16a34a' && contrasto(pi[1], pi[2]).toFixed(2) === '3.30', 'quadratino ok: il verde del filo'); continue; }
        assert.ok(pi && contrasto(pi[1], pi[2]) >= 4.5, 'quadratino ' + k + ': ' + (pi && contrasto(pi[1], pi[2]).toFixed(2)));
    }
    for (const acc of ['#4f46e5', '#0f766e', '#047857']) assert.ok(contrasto(acc, '#ffffff') >= 4.5, 'occhiello ' + acc);
});

/* gate del 28/10 (Giacomo): «in tutti i report il verde per i quadratini che riassumo le risposte giuste/sbagliate/in bianco [...]
   devono avere lo stesso tipo di verde applicato alla linea verde verticale del campo delle risposte giuste»; poi «Chiaro per tutti» */
test('il verde dei quadratini delle giuste è quello del filo delle risposte giuste', () => {
    const css = DH.stileReport({});
    const filo = (/\.mm-rp-ris--ok\{border-left-color:(#[0-9a-f]{6})/.exec(css) || [])[1];
    const quadratino = (/\.mm-rp-pill--ok,[^{]*\{background:(#[0-9a-f]{6})/.exec(css) || [])[1];
    assert.strictEqual(filo, '#16a34a');
    assert.strictEqual(quadratino, filo);
});

/* gate del 28/10 (Giacomo): «alle linee verticali dei campi della risposta e a tutti i quadratini o le barre che usano il verde
   applica il verde chiaro che usavi precedentemente» — nei report delle aperte il filo dei riquadri e le barre erano verde acqua */
test('un verde solo: il filo dei riquadri delle risposte e le barre delle aperte hanno il verde dei report', () => {
    const V = DH.REPORT.verde;
    assert.strictEqual(V, '#16a34a');
    const sc = LR.buildSceltaReportHtml(META, SCELTA);
    assert.ok(new RegExp('\\.mm-rp-ris\\{[^}]*border-left:3px solid ' + V + ';').test(stili(sc)), 'il filo delle risposte');
    assert.ok(sc.includes('width:100%;background:' + V + '"') || sc.includes('background:' + V + '"></span>'), 'le barre');
    assert.ok(!/background:#0f766e"><\/span>/.test(sc), 'nessuna barra verde acqua');
    assert.ok(/\.mm-rp-card\{[^}]*border-left:4px solid #0f766e/.test(stili(sc)), 'la scheda tiene il verde acqua del genere');
    const foglio = (report) => QP.buildOpenQuestionsHtml({ id: 'p', title: 'P', items: [{ question: 'Perché?', risposta: 'Così.' }] },
        { mapName: 'M', now: '01/01/2026', includeBar: false, includeAnswers: false, report }).replace(/\s+/g, ' ');
    assert.ok(new RegExp('class="oq-risposta"[^>]*border-left:3px solid ' + V + ';').test(foglio(true)), 'il foglio compilato dell\'iPad');
    assert.ok(/class="oq-risposta"[^>]*border-left:3px solid #0f766e;/.test(foglio(false)), 'senza report il foglio di sempre');
});

/* ── 7. i posti dove si carica ───────────────────────────────────────────────────────────────────────── */
test('il telefono: la pagina carica la testata prima dei report, il server la serve', () => {
    const st = leggi('public/live/student.html');
    const dh = st.indexOf('/public/js/mappai-doc-head.js'), lr = st.indexOf("'/public/js/mappai-live-reports.js'");
    assert.ok(dh > 0 && dh < lr, 'la testata prima del modulo dei report');
    assert.ok(/'\/public\/js\/mappai-doc-head\.js',/.test(leggi('live-server.js')), 'nell\'elenco dei file serviti');
});

test('doc-head: il commento di testa non dice più che i report sono una famiglia a parte', () => {
    const src = leggi('public/js/mappai-doc-head.js');
    assert.ok(!src.includes('i report (Live,\n * Tutor, Consumi) sono una famiglia a parte'));
    assert.ok(src.includes('stileReport') && src.includes('0132'));
});

test('index.html: il segno 0132 nel ?v= dei quattro file cambiati (come prefisso, senza la virgoletta)', () => {
    const h = leggi('public/index.html');
    for (const f of ['js/mappai-doc-head.js', 'js/mappai-live-reports.js', 'js/mappai-quiz-print.js', 'js/mappai-tutor-reports.js']) {
        assert.ok(new RegExp('src="' + f.replace(/[.]/g, '\\.') + '\\?v=[^"]*0132-1').test(h), f);
    }
});
