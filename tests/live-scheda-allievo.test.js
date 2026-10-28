'use strict';
/*
 * Packet 0112 — il PDF che l'allievo salva dal telefono.
 *
 * Prima il bottone «Salva il mio risultato» stampava la pagina intera del
 * telefono (colonna stretta, titolo della pagina come nome del file:
 * «MappAI Live — Quiz.pdf»). Ora stampa una SCHEDA fatta come quella del
 * report del docente — stessa intestazione, stessa card, stessi quadratini e
 * righe D1, D2… — senza fluenza né punti di forza e deboli, e il file si chiama
 * «2A Coccinella 08 Quiz 1a Guerra Mondiale».
 *
 * La scheda sta in `mappai-live-reports.js`, accanto al report del docente:
 * una sola fonte (inv. 6). Qui si prova anche che il report del docente è
 * rimasto identico, carattere per carattere.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const cheerio = require('cheerio');

const ROOT = path.join(__dirname, '..');
const leggi = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const LR = require(path.join(ROOT, 'public/js/mappai-live-reports.js'));

const META = { mapTitle: '1a Guerra Mondiale', activity: 'Quiz', className: '2A', dateStr: '20/10/2026', durationStr: 'Durata 4 min' };
const ITEMS = [
    { outcome: 'right', text: 'Domanda uno?', yourText: 'Risposta A', correctText: 'Risposta A' },
    { outcome: 'wrong', text: 'Domanda due <b>?</b>', yourText: 'Sbagliata', correctText: 'Giusta', explanation: 'Perché sì.' },
    { outcome: 'blank', text: 'Domanda tre?', yourText: '', correctText: 'Quella' },
    { outcome: 'manual', text: 'Domanda quattro?', yourText: 'Testo libero', correctText: '' },
    { outcome: 'wrong', text: 'Domanda cinque?', yourText: 'Parziale', correctText: 'Completa', missing: ['a', 'b'] }
];
const RESULTS = {
    joined: 2, questionCount: 5, perStudent: [
        { emoji: '🐝', num: '10', displayName: '🐝 10', accuracyPct: 33, answered: 4, blankCount: 1, manualCount: 1, hintsUsed: 2, medianRate: 30, strengths: ['Cause'], weaknesses: ['Date'], items: ITEMS },
        { emoji: '🦊', num: '02', displayName: 'Anna', accuracyPct: 90, answered: 5, blankCount: 0, manualCount: 0, hintsUsed: 0, medianRate: null, strengths: [], weaknesses: [], items: ITEMS.slice(0, 2) }
    ]
};
const STUDENTE = { emoji: '🐝', emojiLabel: 'Ape', num: '10', displayName: '🐝 10', accuracyPct: 33, answered: 4, blankCount: 1, manualCount: 1, items: ITEMS };

/* Fino al 0132 qui si provava che il report del docente restava identico, carattere per carattere (impronta del
   20/10, con le correzioni dello 0127 e dello 0128). Il packet 0132 (Giacomo, 27/10: «accetto tutte le proposte grafiche
   della versione 0132»; al «vai» del 28/10: «riallinea le prove vecchie che controllano i valori di prima») gli dà la
   veste di tutti i report: si prova che il report dice le stesse cose, nella veste nuova. */
test('il report del docente: una scheda per allievo, nell\'ordine di accuratezza, con le stesse cose di prima (veste dello 0132)', () => {
    const h = LR.buildStudentsReportHtml(META, RESULTS);
    assert.ok(h.includes('<title>1a Guerra Mondiale · Quiz · Report allievi</title>'), 'il <title> dello 0128');
    assert.ok(h.includes('<h1 class="mm-dh__t">1a Guerra Mondiale · Quiz · Report allievi</h1>'), 'il titolo dello 0127');
    const schede = h.split(/<section class="mm-rp-card[^"]*">/).slice(1).map(x => x.split('</section>')[0]);
    assert.equal(schede.length, 2);
    // in ordine di accuratezza: prima Anna (90%), poi 🐝 10 (33%)
    assert.ok(schede[0].includes('02 · Anna') && schede[0].includes('>90%</span>') && schede[0].includes('fluenza —'));
    assert.ok(schede[1].includes('>33%</span>') && schede[1].includes('risposte 4/5 · 1 in bianco · 1 da correggere · 💡 2 indizi · fluenza 30.0/min'));
    // 0127, gate del 27/10: la domanda senza risposta dice solo «VUOTO», senza la correzione
    assert.ok(schede[1].includes('<span class="mm-rp-et">Risposta</span><b>VUOTO</b></div>') && !schede[1].includes('Quella'));
    assert.ok(schede[1].includes('Punti di forza') && schede[1].includes('Cause') && schede[1].includes('Date'), 'forti e deboli: misure del docente');
});

test('il nome del file: [classe] [nome emoji] [numero] [tipo e nome dei quiz]', () => {
    assert.equal(typeof LR.studentSheetName, 'function');
    assert.equal(LR.studentSheetName({ className: '2A', emojiLabel: 'Coccinella', num: '08', activity: 'Quiz', title: '1a Guerra Mondiale' }), '2A Coccinella 08 Quiz 1a Guerra Mondiale');
    // il nome non porta i caratteri che i file non accettano, e non ha né data né estensione
    assert.equal(LR.studentSheetName({ className: '3 B', emojiLabel: 'Polpo', num: '04', activity: 'Quiz', title: 'Roma/Grecia: “Quiz”?' }), '3 B Polpo 04 Quiz RomaGrecia “Quiz”');
    // un pezzo che manca non lascia spazi doppi
    assert.equal(LR.studentSheetName({ className: '', emojiLabel: 'Volpe', num: '07', activity: '', title: 'Clima' }), 'Volpe 07 Clima');
});

test('la scheda dell\'allievo: la sua scheda come nel report (veste dello 0132), senza fluenza né punti di forza e deboli', () => {
    assert.equal(typeof LR.studentSheetParts, 'function');
    const p = LR.studentSheetParts(META, STUDENTE);
    const $ = cheerio.load('<div class="lr-root">' + p.body + '</div>');
    assert.equal($('.mm-dh').length, 1);
    // dal 0127 (Giacomo, 26/10: «Al posto del titolo»): il titolo è «[progetto] · [materiale] · Report allievo», sotto classe e data
    assert.equal($('.mm-dh__t').text(), '1a Guerra Mondiale · Quiz · Report allievo');
    assert.equal($('.mm-dh__s').text(), '20/10/2026', 'la data; la durata è del docente');
    assert.equal($('.mm-dh__c--cls').text(), '2A');
    assert.equal(/Schede individuali/.test(p.body), false, 'è la scheda di UN allievo');
    assert.equal($('.mm-rp-card').length, 6, 'il riepilogo e una scheda per domanda');
    assert.equal($('.mm-rp-strip .mm-rp-pill').length, 5, 'un quadratino per domanda');
    assert.equal($('.mm-rp-pill--ok').length, 1);
    assert.equal($('.mm-rp-pill--ko').length, 2);
    // la struttura di ogni risposta: occhiello · domanda · riquadro della risposta · (riquadro della risposta corretta) · spiegazione
    const r2 = $('.mm-rp-card').eq(2);
    assert.equal(r2.find('.mm-rp-occ span').eq(0).text(), 'Domanda 2');
    assert.equal(r2.find('.mm-rp-et').eq(0).text(), 'Risposta');
    assert.equal(r2.find('.mm-rp-ris--ko').text(), 'RispostaSbagliata');
    assert.equal(r2.find('.mm-rp-ris--ok').text(), 'Risposta correttaGiusta');
    assert.equal(r2.find('.mm-rp-spieg').text(), 'Perché sì.');
    // una risposta giusta non ha il riquadro della risposta corretta
    assert.equal($('.mm-rp-card').eq(1).find('.mm-rp-ris').length, 1);
    // una in bianco dice «— vuoto» e porta la risposta corretta («VUOTO» senza correzione è solo del report del docente, 0127)
    assert.equal($('.mm-rp-card').eq(3).find('.mm-rp-ris--vuota').text(), 'Risposta— vuoto');
    assert.equal($('.mm-rp-card').eq(3).find('.mm-rp-ris--ok').text(), 'Risposta correttaQuella');
    assert.equal($('.mm-rp-num').text(), '33%');
    assert.equal(/fluenza/i.test(p.body), false, 'niente fluenza');
    assert.equal(/Punti di forza|Punti deboli/.test(p.body), false, 'niente punti di forza e deboli');
    assert.match($('.mm-rp-riga .mm-rp-testo').text(), /accuratezza/);
    // il testo è testo, mai HTML
    assert.equal($('.mm-rp-dom b').length, 0, 'il <b> della domanda è rimasto testo');
    assert.ok($('.mm-rp-dom').eq(1).text().includes('Domanda due <b>?</b>'));
    // il piè c'è
    assert.equal($('.mm-dh-pie').length, 1);
});

test('lo stile della scheda sta sotto .lr-root: sulla pagina del telefono non si tocca il body', () => {
    const p = LR.studentSheetParts(META, STUDENTE);
    assert.equal(/(^|[}\s])body\s*\{/.test(p.css), false, 'una regola su body si applicherebbe a tutta la pagina');
    assert.match(p.css, /\.lr-root\{/);
    assert.match(p.css, /\.mm-rp-card\{/);
    // le misure della veste dei report (0132): etichette 11 px maiuscole, risposte 13 px a interlinea 2, spiegazione 13 px in corsivo
    const cl = (sel) => (p.css.match(new RegExp('\\' + sel + '\\{([^}]*)\\}')) || [])[1] || '';
    assert.match(cl('.mm-rp-et'), /font-size:11px/);
    assert.match(cl('.mm-rp-et'), /text-transform:uppercase/);
    assert.match(cl('.mm-rp-et'), /font-weight:700/);
    assert.match(cl('.mm-rp-ris'), /font-size:13px;line-height:2;/);
    assert.match(cl('.mm-rp-ris--ok .mm-rp-et'), /color:#15803d/);
    assert.match(cl('.mm-rp-spieg'), /font-size:13px/);
    assert.match(cl('.mm-rp-spieg'), /font-style:italic/);
    assert.match(p.title, /^2A Ape 10 Quiz 1a Guerra Mondiale$/);
});

test('la scheda come documento intero: titolo = nome del file, nessuna barra dei comandi', () => {
    const h = LR.buildStudentSheetHtml(META, STUDENTE);
    const $ = cheerio.load(h);
    assert.match($('title').text(), /^2A Ape 10 Quiz 1a Guerra Mondiale$/);
    assert.equal($('button').length, 0, 'in un PDF non si clicca');
    assert.equal($('.mm-dh').length, 1);
});

test('la pagina dello studente stampa la scheda, col nome giusto, non la pagina intera', () => {
    const h = leggi('public/live/student.html');
    assert.match(h, /studentSheetParts\(/);
    assert.match(h, /window\.open\('\/api\/my-sheet\?s='/, 'la scheda è una pagina vera del server, con il titolo già dentro');
    assert.equal(/document\.write\(/.test(h), false, 'niente finestra riempita a mano: iOS la stampava bianca');
    const corpo = h.slice(h.indexOf('function stampaScheda()'));
    assert.ok(corpo.indexOf('window.open(') > 0 && corpo.indexOf('window.open(') < corpo.indexOf('caricaReport()'), 'si apre nel gesto del tocco, prima di aspettare la rete');
    assert.match(h, /document\.title *= *[a-zA-Z_.]*/);
    assert.match(h, /afterprint/);
    assert.match(h, /id="print-sheet"|'print-sheet'/);
    assert.match(h, /@media print[^{]*\{[^}]*#print-sheet/s, 'in stampa si vede solo la scheda');
    assert.match(h, /mappai-live-reports\.js/);
    // il bottone non stampa più «la pagina»: passa dalla scheda
    assert.equal(/\$\('result-save'\)\.onclick *= *function *\(\) *\{ *window\.print\(\); *\};/.test(h), false);
});

test('il numero nella pagina d\'attesa non sta più nel font delle emoji', () => {
    const h = leggi('public/live/student.html');
    assert.match(h, /id="lobby-num"/);
    assert.match(h, /\$\('lobby-num'\)\.textContent/);
    assert.equal(/\$\('lobby-who'\)\.textContent *= *[^;]*IDENT\.num/.test(h), false, 'il numero non va più dentro lobby-who');
});

test('il server LAN serve il generatore dei report', () => {
    assert.match(leggi('live-server.js'), /'\/public\/js\/mappai-live-reports\.js'/);
});

test('schermata finale del telefono: domande e risposte a 22px, titolo largo il 90% dello schermo', () => {
    const h = leggi('public/live/student.html');
    for (const cl of ['.rq-q', '.rq-a', '.rq-c']) {
        const m = h.match(new RegExp('\\' + cl + ' *\\{([^}]*)\\}'));
        assert.ok(m, cl + ' non trovata');
        assert.match(m[1], /font-size: *22px/, cl + ' deve avere la dimensione che aveva «Hai finito!»');
    }
    assert.match(h, /function fitTitolo\(\)/);
    assert.match(h, /0\.9 \* document\.documentElement\.clientWidth/);
    assert.match(h, /fitTitolo\(\);\s*\n\s*\}\s*\n\s*\$\('review'\)/, 'showDone deve chiamarla dopo aver scritto il titolo');
    assert.match(h, /window\.addEventListener\('resize', fitTitolo\)/);
});

test('schermo dell\'allievo: titoletti 18px MAIUSCOLO bold, testi 22px normali, spiegazione 18px corsivo grigio scuro', () => {
    const h = leggi('public/live/student.html');
    const cl = (sel) => (h.match(new RegExp('\\' + sel + ' *\\{([^}]*)\\}')) || [])[1] || '';
    assert.match(cl('.rq-t'), /text-transform: *uppercase/);
    assert.match(cl('.rq-t'), /font-weight: *700/);
    assert.match(cl('.rq-t'), /font-size: *18px/);
    assert.match(cl('.rq-t.rq-tc'), /color: *#16a34a/);
    assert.match(cl('.rq-a'), /font-size: *22px/);
    assert.match(cl('.rq-a'), /font-weight: *400/);
    assert.match(cl('.rq-c'), /font-size: *22px/);
    assert.match(cl('.rq-c'), /font-weight: *400/);
    assert.match(cl('.rq-c'), /color: *#16a34a/);
    assert.match(cl('.rq-e'), /font-size: *18px/);
    assert.match(cl('.rq-e'), /font-style: *italic/);
    // grigio più scuro di quello di prima (#64748b)
    assert.match(cl('.rq-e'), /color: *#475569/);
    // le righe: titoletto, testo, titoletto verde, testo verde
    assert.match(h, /'<div class="rq-t">Tua risposta<\/div>'/);
    assert.match(h, /<div class="rq-t rq-tc">Risposta corretta:<\/div><div class="rq-c">/);
});
