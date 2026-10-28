'use strict';
/*
 * titoli-report-live-0127.test.js — packet 0127: i titoli dei report del LIVE.
 *
 * Giacomo, 25/10/2026: «Il titolo della schermata 'MappAI Live · Report allievi' correggilo in '[Nome progetto] · [Nome dei
 * materiale] · Report allievo'. Questa modifica applicala anche alle schermate degli allievi per le attività LIVE di MappAI re.»
 * Il materiale è «genere e angolo»; il report del docente dice «Report allievi», la scheda del 💾 «Report allievo». Il 26/10:
 * nella scheda il titolo va «al posto del titolo», e cambiano «tutti» i report del docente.
 *
 * Il materiale lo compone l'app alla nascita della sessione e la sessione se lo porta dietro (inv. 20-bis): qui si prova il
 * modulo dei report, il server vero, il passaggio di main.js e i tre lanci.
 */
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const cheerio = require('cheerio');

const ROOT = path.join(__dirname, '..');
const leggi = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const LR = require(path.join(ROOT, 'public/js/mappai-live-reports.js'));
const LC = require(path.join(ROOT, 'public/js/mappai-live-core.js'));
const SC = require(path.join(ROOT, 'public/js/mappai-scelta-core.js'));
const { createLiveServer } = require(path.join(ROOT, 'live-server.js'));

const cartelle = [];
function tmpDir(prefisso) { const d = fs.mkdtempSync(path.join(os.tmpdir(), prefisso)); cartelle.push(d); return d; }
after(() => { for (const d of cartelle) fs.rmSync(d, { recursive: true, force: true }); });

const META = { mapTitle: 'Sistema Albero', activity: 'Quiz', materiale: 'Scelta multipla · Definizione', className: '2A', dateStr: '20/10/2026', durationStr: 'Durata 4 min' };
const STUDENTE = { emoji: '🐝', emojiLabel: 'Ape', num: '10', displayName: '🐝 10', accuracyPct: 50, answered: 2, blankCount: 0, manualCount: 0,
    items: [{ outcome: 'right', text: 'Uno?', yourText: 'Sì', correctText: 'Sì' }, { outcome: 'wrong', text: 'Due?', yourText: 'No', correctText: 'Sì' }] };
// il testo della barra in alto (la riga del titolo, accanto ai bottoni)
const barra = (html) => cheerio.load(html)('.no-print > span').first().text();
const titolo = (html) => cheerio.load(html)('title').text();

// ── Il modulo dei report ────────────────────────────────────────────────────
test('titoloLive: [progetto] · [materiale] · [coda], senza i pezzi vuoti', () => {
    assert.equal(typeof LR.titoloLive, 'function');
    assert.equal(LR.titoloLive(META, 'Report allievi'), 'Sistema Albero · Scelta multipla · Definizione · Report allievi');
    // una sessione nata prima dello 0127 non ha il materiale: dice l'attività
    assert.equal(LR.titoloLive({ mapTitle: 'Sistema Albero', activity: 'Quiz' }, 'Report allievi'), 'Sistema Albero · Quiz · Report allievi');
    assert.equal(LR.titoloLive({ mapTitle: '  ', materiale: ' ', activity: '' }, 'Report allievo'), 'Report allievo');
    assert.equal(LR.titoloLive(null, 'Report domande'), 'Report domande');
});

test('report del docente: «Report allievi» nella barra e nel <title>; il gancio dell\'iPad come prima', () => {
    const h = LR.buildStudentsReportHtml(META, { joined: 1, questionCount: 2, perStudent: [Object.assign({ strengths: [], weaknesses: [] }, STUDENTE)] });
    assert.equal(barra(h), 'Sistema Albero · Scelta multipla · Definizione · Report allievi');
    assert.equal(h.includes('MappAI Live · Report'), false);
    // il <title> dà il nome al PDF: dallo 0128 (allargamento 23, Giacomo: «Come la barra») è il titolo della barra; prima «Sistema Albero — allievi»
    assert.equal(titolo(h), 'Sistema Albero · Scelta multipla · Definizione · Report allievi');
    // `vestiReport` dell'iPad (0126) nasconde la barra trovandoci il bottone di stampa: il titolo non esce due volte
    assert.equal(cheerio.load(h)('.no-print button[onclick*="print"]').length, 1);
});

test('gli altri report del docente: «Report domande», «Report costruzione»; le credenziali come prima', () => {
    const q = LR.buildQuestionsReportHtml(META, {});
    assert.equal(barra(q), 'Sistema Albero · Scelta multipla · Definizione · Report domande');
    assert.equal(titolo(q), 'Sistema Albero · Scelta multipla · Definizione · Report domande', 'dallo 0128 il <title> come la barra; prima «Sistema Albero — domande»');
    // il report delle domande aperte prende il nome del bottone che lo apre (Giacomo, 26/10)
    const s = LR.buildSceltaReportHtml(Object.assign({}, META, { activity: 'Domande aperte', materiale: 'Domande aperte · Causa' }), {});
    assert.equal(barra(s), 'Sistema Albero · Domande aperte · Causa · Report domande');
    assert.equal(titolo(s), 'Sistema Albero · Domande aperte · Causa · Report domande', 'prima «Sistema Albero — domande a scelta»');
    const w = LR.buildTimelineWorkshopReportHtml(Object.assign({}, META, { activity: 'timeline', materiale: 'Timeline' }), {});
    assert.equal(barra(w), 'Sistema Albero · Timeline · Report costruzione');
    const c = LR.buildCredentialCardsHtml({ name: '2A', students: [] });
    assert.equal(barra(c), 'MappAI Live · Credenziali', 'il foglio delle credenziali non è un report di un materiale');
});

test('la scheda dell\'allievo: il titolo grande è «… · Report allievo», sotto classe e data; il nome del file come prima', () => {
    const p = LR.studentSheetParts(META, STUDENTE);
    const $ = cheerio.load('<div class="lr-root">' + p.body + '</div>');
    // 0132: la testata dei materiali (mm-dh) — la classe nel suo chip, sotto il titolo la data
    assert.equal($('.mm-dh__t').text(), 'Sistema Albero · Scelta multipla · Definizione · Report allievo');
    assert.equal($('.mm-dh__s').text(), '20/10/2026', 'l\'attività sta già nel titolo');
    assert.equal($('.mm-dh__c--cls').text(), '2A');
    assert.equal(p.title, '2A Ape 10 Quiz Sistema Albero', 'il nome del file deciso il 20/10');
    const h = LR.buildStudentSheetHtml(META, STUDENTE);
    assert.equal(titolo(h), '2A Ape 10 Quiz Sistema Albero');
    assert.equal(cheerio.load(h)('button').length, 0, 'la scheda resta senza barra dei comandi');
});

/* Allargamento al gate (Giacomo, 27/10): «Se un allievo non risponde a nessuna domanda il report deve mostrare solo il
   testo 'VUOTO' senza la correzione.» Alle domande: «Ogni domanda vuota»; dove: «Report del docente»; «Dentro lo 0127». */
test('allargamento (27/10): nel report del docente una domanda senza risposta dice solo «VUOTO», senza la correzione', () => {
    const items = [
        { outcome: 'blank', text: 'Che cos\'è la radice?', yourText: '', correctText: 'Un organo' },
        { outcome: 'wrong', text: 'Che cos\'è la foglia?', yourText: 'Un seme', correctText: 'Un organo' },
        { outcome: 'right', text: 'Che cos\'è il tronco?', yourText: 'Un fusto', correctText: 'Un fusto' }
    ];
    const allievo = Object.assign({}, STUDENTE, { items, strengths: [], weaknesses: [] });
    const $ = cheerio.load(LR.buildStudentsReportHtml(META, { joined: 1, questionCount: 3, perStudent: [allievo] }));
    // 0132: le domande stanno nella scheda dell'allievo, ognuna col suo riquadro (D2)
    const righe = $('.mm-rp-voce');
    assert.equal(righe.eq(0).find('.mm-rp-ris').first().text(), 'RispostaVUOTO');
    assert.equal(righe.eq(0).find('.mm-rp-ris--ok').length, 0, 'niente «Risposta corretta» sotto una domanda vuota');
    assert.equal(righe.eq(1).find('.mm-rp-ris--ok').text(), 'Risposta correttaUn organo', 'una risposta sbagliata tiene la correzione');
    assert.equal(righe.eq(2).find('.mm-rp-ris').length, 1, 'una risposta giusta: il suo riquadro e basta');
    // la scheda del 💾 non cambia (Giacomo: solo il report del docente)
    const p = LR.studentSheetParts(META, allievo);
    assert.equal(p.body.includes('VUOTO'), false);
    assert.ok(p.body.includes('Un organo'), 'la scheda tiene la risposta corretta anche sotto la domanda vuota');
});

test('allargamento 5 (27/10): la testata dell\'allievo ha un\'icona sola, il numero grande e i dati su una riga', () => {
    const allievo = Object.assign({}, STUDENTE, { blankCount: 1, medianRate: 19.06, strengths: [], weaknesses: [] });
    const $ = cheerio.load(LR.buildStudentsReportHtml(META, { joined: 1, questionCount: 3, perStudent: [allievo] }));
    // 0132: la riga del riepilogo nella veste comune (mm-rp-riga): chi, la percentuale, i dati
    const testa = $('.mm-rp-riga');
    // Giacomo: «non serve inserire 3 volte i riferimenti icona+numero, basta un riferimento solo»
    assert.equal(testa.text().split('🐝').length - 1, 0, 'l\'emoji non è più testo nella testata');
    assert.equal(testa.find('.mm-rp-chi img').length, 1, 'l\'icona è una sola, ed è l\'immagine');
    assert.equal(testa.text().split('10').length - 1, 1, 'il numero una volta sola');
    assert.equal(testa.find('.mm-rp-chi').text().trim(), '10');
    // «sulla stessa riga con un corpo un po' più piccolo»: risposte, in bianco, percentuale, fluenza
    assert.equal(testa.find('.mm-rp-testo').text(), 'accuratezza · risposte 2/3 · 1 in bianco · fluenza 19.1/min');
    assert.equal($('.lr-metrics').length, 0, 'la colonna a destra non c\'è più');
    assert.equal(testa.find('.mm-rp-num').text(), '50%');
    // un allievo col soprannome: il numero e poi il soprannome
    const nick = Object.assign({}, allievo, { displayName: 'Marta' });
    assert.equal(cheerio.load(LR.buildStudentsReportHtml(META, { perStudent: [nick] }))('.mm-rp-chi').text().trim(), '10 · Marta');
});

test('allargamento 5: su disco il gufo è l\'immagine del font, non il testo che Safari disegna a quadrati', () => {
    const $ = cheerio.load(LR.buildStudentsReportHtml(META, { perStudent: [Object.assign({}, STUDENTE, { emoji: '🦉' })] }));
    const img = $('.mm-rp-chi img');
    assert.equal(img.attr('alt'), '🦉');
    const svg = Buffer.from(img.attr('src').replace(/^data:image\/svg\+xml;base64,/, ''), 'base64').toString('utf8');
    assert.equal(svg, leggi('public/fonts/emoji/1f989.svg'), 'lo stesso disegno della pagina del telefono');
    // un\'emoji senza immagine resta testo
    const $2 = cheerio.load(LR.buildStudentsReportHtml(META, { perStudent: [Object.assign({}, STUDENTE, { emoji: '🦖' })] }));
    assert.ok($2('.mm-rp-chi').text().startsWith('🦖 10'), 'l\'emoji resta testo, davanti al numero');
    assert.equal($2('.mm-rp-chi img').length, 0);
});

test('allargamento 5: anche nel report delle domande aperte e della timeline l\'emoji del nome è l\'immagine', () => {
    const scelta = cheerio.load(LR.buildSceltaReportHtml(META, { byStudent: [
        { id: 'a', displayName: '🦉 03', consegnato: true, risposte: [] }, { id: 'b', displayName: 'Anna', consegnato: true, risposte: [] }] }));
    const timeline = cheerio.load(LR.buildTimelineWorkshopReportHtml(META, { byAuthor: { a: { displayName: '🦉 03', proposals: [] } } }));
    for (const [$, chi] of [[scelta, scelta('.mm-rp-chi').eq(0)], [timeline, timeline('.mm-rp-chi').eq(0)]]) {
        assert.equal(chi.find('img').attr('alt'), '🦉');
        assert.equal(chi.text(), ' 03', 'il numero resta testo, l\'emoji non c\'è più come testo');
        assert.ok($.html().includes(leggi('public/fonts/emoji/1f989.svg') ? 'data:image/svg+xml;base64,' : '-'));
    }
    assert.equal(scelta('.mm-rp-chi').eq(1).text(), 'Anna', 'un soprannome resta com\'è');
});

// ── Il server vero ──────────────────────────────────────────────────────────
const QS = [
    { kind: 'mc', text: 'Che cos\'è la radice?', options: ['un organo', 'un frutto'], correct: 0, explanation: 'Un organo.', source: 'map' },
    { kind: 'mc', text: 'Che cos\'è la foglia?', options: ['un organo', 'un seme'], correct: 0, explanation: 'Un organo.', source: 'map' }
];
// `state()` è una vista ridotta della sessione: la verità sta in session.json
const materialeSuDisco = (dir) => JSON.parse(fs.readFileSync(path.join(dir, 'session.json'), 'utf8')).session.materiale;
const ROSTER = [{ emojiKey: 'volpe', emoji: (LC.EMOJI_SET.find(e => e.key === 'volpe') || {}).emoji || '', num: '00', name: '' }];

test('server: il materiale nasce con la sessione, ripulito, e arriva a /api/session, alla scheda e ai report', async () => {
    const dir = tmpDir('live-0127-');
    const srv = createLiveServer({ repoRoot: ROOT, dir, roster: ROSTER, questions: QS,
        session: { name: 'Sistema Albero', activity: 'Quiz', className: '2A', revealAnswers: true, materiale: ' Scelta multipla\n·  Definizione ' } });
    try {
        assert.equal(materialeSuDisco(dir), 'Scelta multipla · Definizione', 'ripulito, e in session.json: una ripresa lo ritrova');
        const port = await srv.listen(0, '127.0.0.1');
        const url = (p) => 'http://127.0.0.1:' + port + p;
        const post = (p, b) => fetch(url(p), { method: 'POST', body: JSON.stringify(b) }).then(r => r.json().catch(() => null));
        const tok = srv.state().session.token, admin = srv.state().session.adminToken;
        const chi = { token: tok, emojiKey: 'volpe', num: '00', deviceId: 'd1' };
        const ses = await fetch(url('/api/session?s=' + tok)).then(r => r.json());
        assert.equal(ses.materiale, 'Scelta multipla · Definizione', 'la seconda strada della scheda lo legge da qui');
        await post('/api/join', chi);
        await post('/api/phase', { adminToken: admin, phase: 'running' });
        await post('/api/answer', Object.assign({ qIdx: 0, choice: 0, ms: 900 }, chi));
        await post('/api/finish', chi);
        const scheda = await fetch(url('/api/my-sheet?s=' + tok + '&emojiKey=volpe&num=00&deviceId=d1')).then(r => r.text());
        assert.equal(cheerio.load(scheda)('.mm-dh__t').text(), 'Sistema Albero · Scelta multipla · Definizione · Report allievo');
        await post('/api/close', { adminToken: admin });
        assert.equal(barra(fs.readFileSync(path.join(dir, 'report-allievi.html'), 'utf8')), 'Sistema Albero · Scelta multipla · Definizione · Report allievi');
        assert.equal(barra(fs.readFileSync(path.join(dir, 'report-domande.html'), 'utf8')), 'Sistema Albero · Scelta multipla · Definizione · Report domande');
    } finally { await srv.stop(); }
});

test('server: senza materiale (sessione di prima) la barra dice l\'attività; troppo lungo si accorcia', async () => {
    const dir = tmpDir('live-0127-vecchia-');
    const srv = createLiveServer({ repoRoot: ROOT, dir, roster: ROSTER, questions: QS, session: { name: 'Sistema Albero', activity: 'Quiz', className: '2A' } });
    try {
        assert.equal(materialeSuDisco(dir), '');
        const port = await srv.listen(0, '127.0.0.1');
        await fetch('http://127.0.0.1:' + port + '/api/close', { method: 'POST', body: JSON.stringify({ adminToken: srv.state().session.adminToken }) });
        assert.equal(barra(fs.readFileSync(path.join(dir, 'report-allievi.html'), 'utf8')), 'Sistema Albero · Quiz · Report allievi');
    } finally { await srv.stop(); }
    const dirLungo = tmpDir('live-0127-lungo-');
    createLiveServer({ repoRoot: ROOT, dir: dirLungo, roster: ROSTER, questions: QS, session: { name: 'X', materiale: 'a'.repeat(300) } });
    assert.equal(materialeSuDisco(dirLungo).length, 120);
});

test('server: una sessione «domande aperte» porta il materiale nel report delle domande', async () => {
    const dir = tmpDir('live-0127-scelta-');
    const pool = SC.poolDaFogli([{ titolo: 'Domande-aperte-Sistema Albero-causa', angle: 'causa', tipo: 'open',
        items: [{ domanda: 'Perché la radice assorbe acqua?', ramo: 'Radici', livello: 'base' }] }]);
    const srv = createLiveServer({ repoRoot: ROOT, dir, roster: ROSTER, questions: pool,
        session: { name: 'Sistema Albero', activity: 'Domande aperte', className: '2A', mode: 'scelta', scelta: { semplice: true }, materiale: 'Domande aperte · Causa' } });
    try {
        const port = await srv.listen(0, '127.0.0.1');
        await fetch('http://127.0.0.1:' + port + '/api/close', { method: 'POST', body: JSON.stringify({ adminToken: srv.state().session.adminToken }) });
        assert.equal(barra(fs.readFileSync(path.join(dir, 'report-scelta.html'), 'utf8')), 'Sistema Albero · Domande aperte · Causa · Report domande');
        assert.equal(barra(fs.readFileSync(path.join(dir, 'report-allievi.html'), 'utf8')), 'Sistema Albero · Domande aperte · Causa · Report allievi');
    } finally { await srv.stop(); }
});

/* Allargamento 2 al gate (Giacomo, 27/10): «il bottone nell'app si chiama 'report allievi' mentre il file si chiama 'report studenti',
   scegli il sostantivo migliore per essere coerente con l'app.» → «report-allievi.html»: le sessioni nuove lo scrivono, le vecchie tengono il loro. */
test('allargamento 2: il server scrive report-allievi.html e lo serve; un report-studenti.html di prima si apre ancora', async () => {
    const dir = tmpDir('live-0127-nome-');
    const srv = createLiveServer({ repoRoot: ROOT, dir, roster: ROSTER, questions: QS, session: { name: 'Sistema Albero', activity: 'Quiz', className: '2A' } });
    try {
        const port = await srv.listen(0, '127.0.0.1');
        const admin = srv.state().session.adminToken;
        const url = (p) => 'http://127.0.0.1:' + port + p;
        await fetch(url('/api/close'), { method: 'POST', body: JSON.stringify({ adminToken: admin }) });
        assert.ok(fs.existsSync(path.join(dir, 'report-allievi.html')));
        assert.equal(fs.existsSync(path.join(dir, 'report-studenti.html')), false, 'il nome vecchio non si scrive più');
        const r = await fetch(url('/api/report?admin=' + admin + '&which=students'));
        assert.equal(r.status, 200);
        assert.equal(barra(await r.text()), 'Sistema Albero · Quiz · Report allievi');
        // una cartella con il solo nome di prima: il bottone apre ancora il report
        fs.renameSync(path.join(dir, 'report-allievi.html'), path.join(dir, 'report-studenti.html'));
        const vecchio = await fetch(url('/api/report?admin=' + admin + '&which=students'));
        assert.equal(vecchio.status, 200);
    } finally { await srv.stop(); }
});

test('allargamento 2: nell\'elenco delle attività il report degli allievi si chiama «Report allievi», col nome nuovo e con quello di prima', () => {
    const FC = require(path.join(ROOT, 'public/js/mappai-files-core.js'));
    assert.deepEqual(FC.reportMeta('report-allievi.html'), { which: 'students', label: 'Report allievi', file: 'report-allievi.html' });
    assert.deepEqual(FC.reportMeta('report-studenti.html'), { which: 'students', label: 'Report allievi', file: 'report-studenti.html' });
    const rec = FC.sessionRecordFrom({ folder: 's', activityType: 'live', session: { session: { name: 'Sistema Albero', activity: 'Quiz' } },
        results: { joined: 1, absent: 0 }, reportFiles: ['report-allievi.html', 'session.json', 'report-domande.html'] });
    assert.deepEqual(rec.reports.map(x => x.label), ['Report domande', 'Report allievi'], 'domande, poi allievi');
});

// ── main.js passa il campo ──────────────────────────────────────────────────
test('main.js: la sessione porta il materiale, e solo come testo', () => {
    const m = leggi('main.js');
    const i = m.indexOf("ipcMain.handle('live-start-session'");
    const corpo = m.slice(i, m.indexOf('roster: Array.isArray(o.roster)', i));
    assert.match(corpo, /materiale: *typeof o\.materiale === 'string' \? o\.materiale : ''/);
});

// ── I lanci dell'app ────────────────────────────────────────────────────────
function caricaScelta() {
    const lanci = [];
    const w = {
        console: { log() { }, warn() { } },
        localStorage: { getItem() { return null; } },
        MappAIScelta: SC,
        MappAILive: { launchExternal(cls, nome, pool, timer, extra) { lanci.push({ nome, extra }); } },
        quizAngleLabel: (k) => ({ causa: 'Causa', definizione: 'Definizione' })[k] || k
    };
    w.window = w;
    vm.runInNewContext(leggi('public/js/mappai-scelta.js'), w);
    return { SA: w.MappAISceltaAttivita, lanci };
}
const voce = (domanda, extra) => Object.assign({ domanda, ramo: 'Radici', livello: 'base' }, extra || {});

test('domande aperte: un foglio di un angolo solo parte con «Domande aperte · [angolo]»', () => {
    const { SA, lanci } = caricaScelta();
    SA.avviaFoglio({ name: '2A' }, { titolo: 'Domande-aperte-Sistema Albero-causa', angle: 'causa', tipo: 'open', items: [voce('Perché uno?'), voce('Perché due?')] });
    assert.equal(lanci.length, 1);
    assert.equal(lanci[0].nome, 'Domande aperte', 'il nome dell\'attività (cartelle, registro) non cambia');
    assert.equal(lanci[0].extra.materiale, 'Domande aperte · Causa');
});

test('domande aperte: angoli misti, «auto» o nessun angolo → «Domande aperte»', () => {
    const { SA, lanci } = caricaScelta();
    SA.avviaFoglio({ name: '2A' }, { titolo: 'Domande-aperte-Sistema Albero-misto', angle: 'auto', tipo: 'open',
        items: [voce('Perché?', { angle: 'causa' }), voce('Che cos\'è?', { angle: 'definizione' })] });
    SA.avviaFoglio({ name: '2A' }, { titolo: 'Domande del docente', angle: '', tipo: 'open', items: [voce('Una domanda mia?')] });
    assert.deepEqual(lanci.map(l => l.extra.materiale), ['Domande aperte', 'Domande aperte']);
});

test('quiz da un set: il materiale è il tipo del set e il suo angolo, e launch lo manda', () => {
    const s = leggi('public/js/mappai-live-teacher.js');
    const lancio = s.slice(s.indexOf('function launch('), s.indexOf('LT._reports = extra.reports'));
    assert.match(lancio, /if \(extra\.materiale\) payload\.materiale = extra\.materiale;/);
    const daSet = s.slice(s.indexOf('function openLiveFromSet('), s.indexOf('// Nodi in scope'));
    // la regola dell'iPad (etAngolo di autotest): niente angolo per «auto» e per l'angolo vuoto, l'etichetta da quizAngleLabel
    assert.match(s, /function _angoloDelSet\(set\) \{\s*return \(set && set\.angle && set\.angle !== 'auto' && window\.quizAngleLabel\) \? window\.quizAngleLabel\(set\.angle\) : '';/);
    assert.match(daSet, /var materiale = \[modeLabel, _angoloDelSet\(set\)\]\.filter\(Boolean\)\.join\(' · '\);/);
    assert.match(daSet, /opz\.materiale = materiale;\s*launch\([^;]*, opz\);/);
});

/* Allargamento 3 (Giacomo, 27/10, al gate): l'angolo si vede nelle due finestre che lanciano un set. Il modulo del docente
   gira nel suo contesto, con un DOM finto che trattiene l'HTML delle finestre fatte a mano. */
function caricaDocente(sets) {
    const aperti = [], html = [];
    const el = () => {
        const e = { style: {}, _t: '', addEventListener() { }, remove() { }, querySelector: () => ({}) };
        Object.defineProperty(e, 'textContent', { set(v) { e._t = String(v); } });
        Object.defineProperty(e, 'innerHTML', {
            get() { return e._t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); },
            set(v) { html.push(v); }
        });
        return e;
    };
    const w = {
        console: { log() { }, warn() { } },
        localStorage: { getItem() { return null; } },
        document: { createElement: el, getElementById: () => null, body: { appendChild() { } }, addEventListener() { } },
        appState: { db: { studySets: sets, nodes: [{ id: 'r', level: 0, label: 'Sistema Albero' }] } },
        MappAILiveCore: LC,
        MappAIModal: { open(schema) { aperti.push(schema); return new Promise(() => { }); } },
        quizAngleLabel: (k) => ({ causa: 'Causa', definizione: 'Definizione' })[k] || k
    };
    w.window = w;
    vm.runInNewContext(leggi('public/js/mappai-live-teacher.js'), w);
    return { L: w.MappAILive, aperti, html };
}
// i nomi come li scrive l'app: «[progetto] — [tipo] · [nome]», e per i set nati con la mappa il nome è la chiave dell'angolo
const setQuiz = (id, angle, n, extra) => Object.assign({ id, mode: 'quiz', type: 'Scelta Multipla', angle, _pipeline: true,
    title: 'Sistema Albero — Scelta Multipla' + (angle && angle !== 'auto' ? ' · ' + angle : ''),
    items: Array.from({ length: n }, (_, k) => ({ q: 'Domanda ' + k })) }, extra || {});

test('«Avvia un\'attività live»: il nome del set senza il progetto, il grigio dice solo quello che il nome non dice', async () => {
    const { L, aperti } = caricaDocente([setQuiz('a', 'definizione', 12), setQuiz('b', 'auto', 3),
        setQuiz('c', 'causa', 10, { title: 'Sistema Albero — Scelta multipla · verifica', type: 'Scelta multipla', _pipeline: false }),
        setQuiz('d', '', 5, { title: 'Domande della fonte', type: 'Aperte', _pipeline: false })]);
    await L.openSetup();
    assert.equal(aperti.length, 1);
    const voci = aperti[0].sezioni.find(s => s.voci).voci;   // l'ultimo set in cima, come prima
    assert.deepEqual(voci.map(v => [v.etichetta, v.sotto]), [
        ['Domande della fonte', 'Aperte · 5 domande'],                // un nome fuori dalla regola resta com'è
        ['Scelta multipla · verifica', 'Causa · 10 domande'],         // creato in ELABORA: il tipo c'è già nel nome
        ['Scelta Multipla', '3 domande'],                             // «auto»: niente angolo
        ['Scelta Multipla · Definizione', '12 domande']]);            // nato con la mappa: la chiave diventa l'etichetta
    // Giacomo, 27/10: «con la mappa» si toglie
    assert.ok(voci.every(v => !v.badge));
});

test('«Avvia quiz live»: il box «Tipo» dice anche l\'angolo; senza angolo come prima', () => {
    const { L, html } = caricaDocente([setQuiz('a', 'definizione', 12), setQuiz('b', 'auto', 3)]);
    L.launchFromSetPrompt('a');
    L.launchFromSetPrompt('b');
    const tipi = html.map(h => ((h.match(/>Tipo<\/span><div[^>]*>([^<]*)<\/div>/) || [])[1]));
    assert.deepEqual(tipi, ['Scelta multipla · Definizione · 12 domande', 'Scelta multipla · 3 domande']);
});

test('timeline: le due partenze dicono «Timeline»; la chiave c\'è in inglese', () => {
    const s = leggi('public/js/mappai-timeline-teacher.js');
    assert.equal((s.match(/materiale: _t\('tl_materiale', 'Timeline'\)/g) || []).length, 2);
    assert.match(leggi('public/traduzioni/en_translations.js'), /tl_materiale: "Timeline",/);
});

test('telefono: la seconda strada della scheda legge il materiale dalla sessione', () => {
    const h = leggi('public/live/student.html');
    const scheda = h.slice(h.indexOf('SCHEDA = {'), h.indexOf('student: {', h.indexOf('SCHEDA = {')));
    assert.match(scheda, /materiale: SESS && SESS\.materiale/);
});

test('index.html: i ?v= dei quattro file portano il segno dello 0127', () => {
    const h = leggi('public/index.html');
    for (const v of ['js/mappai-live-reports.js?v=0116-20261021-11-0127', 'js/mappai-live-teacher.js?v=0119-0122-20261022-4b1-0122-4b2-0127',
        'js/mappai-scelta.js?v=0116-20261021-6-0127', 'js/mappai-timeline-teacher.js?v=ritocchi-0087-20261013-2-0122-4b2-0127',
        'js/mappai-files-core.js?v=0109-0114-20261020-1-0127', 'js/mappai-modal.js?v=0119-0122-20261022-4-0122-4b2-0126-1-0127']) {
        assert.ok(h.includes(v), v);
    }
});

/* allargamento 6 (Giacomo, 27/10): «Allinea lo stile di tutti i modali» a quello della × (il motore, non la finestra di sistema);
   «Ferma server» via dalla barra e dalla finestra della ×; dopo «Chiudi sessione» via «Chiudi pannello»: resta la ×, con una conferma */
test('allargamento 6: nel pannello live nessuna finestra di sistema, le conferme sono del motore', () => {
    const s = leggi('public/js/mappai-live-teacher.js');
    assert.equal(/(^|[^.\w])confirm\(/m.test(s), false, 'niente confirm() nativo');
    const chiudi = s.slice(s.indexOf('function doClose('), s.indexOf('\n  }\n', s.indexOf('function doClose(')));
    const ferma = s.slice(s.indexOf('function doStop('), s.indexOf('\n  }\n', s.indexOf('function doStop(')));
    assert.ok(chiudi.includes('.conferma({'), '«Chiudi sessione» chiede col motore');
    assert.ok(ferma.includes('.conferma({'), 'la chiusura del pannello chiede col motore');
    assert.ok(ferma.includes("t('lv_end_t', 'Chiudere il pannello?')"), 'il titolo della conferma');
    assert.ok(ferma.includes("t('lv_end_d', 'Il server si spegne: gli allievi non vedranno più il risultato e non potranno salvarlo. I report restano nella cartella della sessione.')"), 'il testo');
});

test('allargamento 6: la barra non ha più «Ferma server» né «Chiudi pannello»; la × chiede solo «Chiudi sessione»', () => {
    const s = leggi('public/js/mappai-live-teacher.js');
    const barra = s.slice(s.indexOf('function renderActions('), s.indexOf('function actBtn('));
    assert.equal(barra.includes("'lv-stop'"), false, 'via «Ferma server»');
    assert.equal(barra.includes("'lv-end'"), false, 'via «Chiudi pannello»');
    const fili = s.slice(s.indexOf('function wire('), s.indexOf('function doClose('));
    assert.equal(/lv-stop|lv-end/.test(fili), false);
    const x = s.slice(s.indexOf('function chiudiOChiedi()'), s.indexOf('function closeModal()'));
    assert.equal(x.includes("id: 'ferma'"), false, 'la × non offre più «Ferma server»');
    assert.ok(x.includes("id: 'annulla'") && x.includes("id: 'chiudi'"));
    assert.ok(/if \(_fase\(\) === 'closed'\) return doStop\(\);/.test(x), 'a sessione chiusa la × chiude il pannello, con la sua conferma');
    const en = leggi('public/traduzioni/en_translations.js');
    assert.match(en, /lv_end_t: "Close the panel\?",/);
    assert.match(en, /lv_end_d: "The server shuts down: students will no longer see their result or be able to save it\. The reports stay in the session folder\.",/);
    for (const k of ['lv_stop', 'lv_stop_confirm', 'lv_stop_confirm2', 'lv_x_d_chiusa']) assert.equal(new RegExp('\\n\\s*' + k + ':').test(en), false, k + ' non serve più');
});

/* allargamento 6, al gate (Giacomo, 27/10: «se premo 'chiudi sessione' appare un modale ulteriore di conferma che ha un Z sbagliato perché è
   nascosto sotto la finestra del pannello dell'attività live»; la correzione nel motore, sua scelta). Il pannello è una finestra a mano col piano
   chiesto al motore; la × apre un modale del motore, che si chiude, e la pila resta vuota: il motore ripartiva da 12000 e la conferma dopo
   prendeva un piano più basso del pannello. */
test('allargamento 6: a pila vuota il motore non riparte sotto una finestra a mano ancora aperta', () => {
    const figli = [], tasti = [];
    const mk = (tag) => ({ tag, className: '', innerHTML: '', style: {}, attrs: {}, dataset: {}, children: [],
        setAttribute(k, v) { this.attrs[k] = String(v); }, getAttribute(k) { return this.attrs[k]; }, removeAttribute(k) { delete this.attrs[k]; }, hasAttribute(k) { return k in this.attrs; },
        addEventListener() {}, appendChild(c) { this.children.push(c); }, replaceChild() {}, remove() { const i = figli.indexOf(this); if (i >= 0) figli.splice(i, 1); }, focus() {},
        querySelector: () => null, querySelectorAll: () => [] });
    const vecchi = { window: global.window, document: global.document, raf: global.requestAnimationFrame };
    global.window = { visualViewport: { height: 1000, offsetTop: 0, addEventListener() {}, removeEventListener() {} }, innerHeight: 1000 };
    global.requestAnimationFrame = f => f();
    global.document = { body: { style: {}, get children() { return figli; }, appendChild(e) { figli.push(e); }, querySelector: () => null }, activeElement: null,
        addEventListener(tipo, f) { if (tipo === 'keydown') tasti.push(f); }, removeEventListener(tipo, f) { const i = tasti.indexOf(f); if (i >= 0) tasti.splice(i, 1); },
        createElement: tag => (tag === 'canvas' ? { getContext: () => ({ measureText: s => ({ width: s.length * 10 }) }) } : mk(tag)) };
    try {
        delete require.cache[require.resolve('../public/js/mappai-modal-core.js')]; delete require.cache[require.resolve('../public/js/mappai-modal.js')];
        const Modal = require('../public/js/mappai-modal.js');
        // il pannello live: openModal chiede un piano, MappAIVelo.monta un altro
        const pannello = mk('div'); pannello.style.zIndex = String(Modal.prossimoZ()); pannello.style.zIndex = String(Modal.prossimoZ()); figli.push(pannello);
        const schema = { titolo: 'La sessione è ancora attiva', sezioni: [{ testo: 'x' }], azioni: [{ id: 'chiudi', etichetta: 'Chiudi sessione', ruolo: 'primario' }] };
        Modal.open(schema);
        const x = figli.find(e => (e.className || '').includes('mm-overlay'));
        assert.ok(Number(x.style.zIndex) > Number(pannello.style.zIndex), 'la finestra della × sta sopra il pannello');
        tasti[tasti.length - 1]({ key: 'Escape', preventDefault() {}, stopPropagation() {} });
        assert.equal(Modal.aperti, 0, 'la pila è vuota');
        Modal.conferma({ titolo: 'Chiudere la sessione e generare i report?' });
        const conferma = figli.find(e => (e.className || '').includes('mm-overlay'));
        assert.ok(Number(conferma.style.zIndex) > Number(pannello.style.zIndex), 'la conferma sta sopra il pannello: ' + conferma.style.zIndex + ' contro ' + pannello.style.zIndex);
    } finally {
        global.window = vecchi.window; global.document = vecchi.document; global.requestAnimationFrame = vecchi.raf;
        delete require.cache[require.resolve('../public/js/mappai-modal-core.js')]; delete require.cache[require.resolve('../public/js/mappai-modal.js')];
    }
});

// allargamento 6, al gate (Giacomo, 27/10: «quando fermo un'attività il bottone 'stacca' deve sparire»)
test('allargamento 6: a sessione chiusa la barra non ha «Stacca»', () => {
    const s = leggi('public/js/mappai-live-teacher.js');
    const barra = s.slice(s.indexOf('function renderActions('), s.indexOf('function actBtn('));
    assert.ok(/if \(phase !== 'closed' && !document\.getElementById\('lv-float-panel'\)\) \{/.test(barra), '«Stacca» solo a sessione aperta');
});
