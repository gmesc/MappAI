/* tests/figure-core.test.js — il core puro della lettura delle figure dei PDF (packet 0113, lotto 2; ADR 0024)
 *
 * Qui si fissano, su casi SINTETICI di soli numeri e rettangoli (regola dello 0044: mai trascrizioni di schede altrui):
 * gli stati di pagina (§5.2), i ritagli con soglia, fusione, margine, tetto e ppi (§5.3), il riconoscitore R-D delle formule
 * spezzate, l'interruttore `attiva` (inv. 6), lo smistamento a cinque casi (§5.4), la coda del prompt e il `lettore` bilingue
 * (§5.5), `pulisci` (R7), l'accordo riga per riga R5 con «forse manca», R1 e lo stato del ritaglio (§5.6), R0 (§5.9),
 * i marcatori col segno ⟦da controllare: …⟧ e la legenda (bivio E1), `innesta` per le formule (§5.7), l'identità,
 * `modelloPer` col ripiego sulla tendina, la stima e il payload delle letture. Le fixture del banco arrivano col lotto 7.
 */
const { test } = require('node:test');
const assert = require('node:assert');
const F = require('../public/js/mappai-figure-core.js');
const FILES_CORE = require('../public/js/mappai-files-core.js');

/* ── pagine sintetiche (punti; A4 = 595 × 842) ─────────────────────────────── */
const W = 595, H = 842;
const pagina = (over) => Object.assign({ numero: 1, larghezza: W, altezza: H, caratteri: 1200, immagini: [], righe: [] }, over || {});
// come la p.2 della scheda del banco: uno schema largo e una colonna illustrata, più un'icona sotto il 4 %
const SCHEMA = { x: 40, y: 100, w: 482, h: 217, px: [1071, 483] };          // 20,9 % della pagina
const COLONNA = { x: 300, y: 400, w: 230, h: 143, px: [1025, 637] };        // 6,6 %
const ICONA = { x: 10, y: 10, w: 20, h: 20, px: [400, 400] };               // 0,08 %: via, anche con 400×400 px
const P_RITAGLI = pagina({ numero: 2, immagini: [SCHEMA, COLONNA, ICONA] });
const P_SCANSIONE = pagina({ caratteri: 12, immagini: [{ x: 0, y: 0, w: W, h: H, px: [2480, 3508] }] });
const P_TESTO_IMMAGINI = pagina({ caratteri: 150, immagini: Array.from({ length: 25 }, (_, i) => ({ x: 50, y: 60 + i * 14, w: 480, h: 10, px: [1000, 20] })) });
const P_NULLA = pagina({ immagini: [ICONA] });

test('statoPagina: ritagli, nulla, testo a immagini', () => {
    assert.strictEqual(F.statoPagina(P_RITAGLI).stato, 'ritagli');
    assert.strictEqual(F.statoPagina(P_RITAGLI).tenuti.length, 2, 'l\'icona sotto il 4 % non si tiene, i pixel non la salvano');
    assert.strictEqual(F.statoPagina(P_NULLA).stato, 'nulla');
    const ti = F.statoPagina(P_TESTO_IMMAGINI);
    assert.strictEqual(ti.stato, 'testo-immagini');
    assert.ok(ti.blocchi.length >= 1, 'le righe-immagine si fondono in blocchi');
});

test('statoPagina: una pagina di solo testo non costa nulla', () => {
    const s = F.statoPagina(pagina({ caratteri: 3000 }));
    assert.strictEqual(s.stato, 'nulla');
    assert.strictEqual(s.tenuti.length, 0);
});

test('statiPdf: «scansione» solo se almeno metà delle pagine lo sono; altrimenti figura a tutta pagina = ritaglio', () => {
    const tutto = F.statiPdf([P_SCANSIONE, P_SCANSIONE, P_SCANSIONE, P_SCANSIONE]);
    assert.strictEqual(tutto.pdfScansione, true);
    assert.ok(tutto.stati.every(s => s.stato === 'scansione'));
    const misto = F.statiPdf([P_SCANSIONE, P_RITAGLI, P_NULLA, pagina({ caratteri: 900 })]);
    assert.strictEqual(misto.pdfScansione, false, '1 su 4 non basta');
    assert.strictEqual(misto.stati[0].stato, 'ritagli', 'in un PDF nato digitale la stessa geometria è una figura a tutta pagina');
    assert.strictEqual(misto.stati[0].tuttaPagina, true);
    const meta = F.statiPdf([P_SCANSIONE, P_SCANSIONE, P_RITAGLI, P_NULLA]);
    assert.strictEqual(meta.pdfScansione, true, '2 su 4 = metà: basta');
});

test('ritagli: soglia del 4 %, fusione ≤ 2 pt, ordine dall\'alto, nomi p<N>-<k>', () => {
    const strisce = [{ x: 40, y: 100, w: 482, h: 60, px: [1071, 134] }, { x: 40, y: 161, w: 482, h: 60, px: [1071, 134] }, { x: 40, y: 222, w: 482, h: 60, px: [1071, 134] }];
    const r = F.ritagli(pagina({ numero: 3, immagini: strisce.concat([COLONNA]) }));
    assert.strictEqual(r.length, 2, 'le tre strisce di Word diventano un ritaglio solo');
    assert.strictEqual(r[0].nome, 'p3-1');
    assert.strictEqual(r[0].membri, 3);
    assert.strictEqual(r[1].nome, 'p3-2');
    assert.ok(r[0].rett.y < r[1].rett.y);
    const lontane = F.ritagli(pagina({ immagini: [strisce[0], Object.assign({}, strisce[1], { y: 165 })] }));
    assert.strictEqual(lontane.length, 2, 'a 5 pt di distanza non si fondono');
});

test('ritagli: margine 3 % per lato, tagliato dove c\'è testo tipografico; ppi nativi per asse limitati 110-220', () => {
    const senza = F.ritagli(P_RITAGLI)[0];
    assert.ok(Math.abs(senza.rett.x - (SCHEMA.x - SCHEMA.w * 0.03)) < 0.01, 'margine a sinistra');
    assert.ok(Math.abs(senza.rett.y - (SCHEMA.y - SCHEMA.h * 0.03)) < 0.01, 'margine in alto');
    // una riga di testo subito sopra lo schema: il margine in alto si taglia, gli altri restano
    const riga = { x0: 40, y0: 90, x1: 500, y1: 99, testo: 'Figura 2 — il sistema' };
    const con = F.ritagli(pagina({ numero: 2, immagini: [SCHEMA], righe: [riga] }))[0];
    assert.strictEqual(con.rett.y, SCHEMA.y, 'niente margine sopra: c\'è una riga tipografica');
    assert.ok(Math.abs(con.rett.x - (SCHEMA.x - SCHEMA.w * 0.03)) < 0.01, 'a sinistra il margine resta');
    assert.deepStrictEqual(con.marginiTagliati, ['alto']);
    // la didascalia comincia un decimo di punto più a sinistra dell'immagine: taglia solo «alto», non «sinistra» (le fasce non hanno angoli; lotto 7)
    const quasi = F.ritagli(pagina({ numero: 2, immagini: [SCHEMA], righe: [Object.assign({}, riga, { x0: SCHEMA.x - 0.1 })] }))[0];
    assert.deepStrictEqual(quasi.marginiTagliati, ['alto']);
    // una riga accanto all'immagine, alla sua altezza, taglia il lato suo
    const accanto = F.ritagli(pagina({ numero: 2, immagini: [SCHEMA], righe: [{ x0: 10, y0: 150, x1: 35, y1: 160, testo: 'nota' }] }))[0];
    assert.deepStrictEqual(accanto.marginiTagliati, ['sinistra']);
    // ppi: 1071 px su 482 pt = 160,0 → dentro i limiti; 2480 px su 595 pt = 300 → limitato a 220 (per asse, in proporzione)
    assert.ok(Math.abs(senza.ppi[0] - 1071 / 482 * 72) < 0.01);
    assert.deepStrictEqual(F.ppiLimitato([300, 300]), [220, 220]);
    assert.deepStrictEqual(F.ppiLimitato([72, 72]), [110, 110]);
    assert.deepStrictEqual(F.ppiLimitato([300, 150]), [220, 110]);
    assert.ok(senza.pixel[0] > 0 && senza.pixel[1] > 0);
});

test('ritagli: piano di compressione sotto 1,2 MB — qualità 85 → 65 a scatti di 10, poi ×0,85, al più sei tentativi', () => {
    const piano = F.pianoCompressione();
    assert.strictEqual(piano.length, 6);
    assert.deepStrictEqual(piano.map(p => p.qualita), [85, 75, 65, 65, 65, 65]);
    [1, 1, 1, 0.85, 0.7225, 0.614125].forEach((s, i) => assert.ok(Math.abs(piano[i].scala - s) < 1e-9, 'scala del tentativo ' + (i + 1)));
    assert.strictEqual(F.SOGLIE.MAX_BYTE, 1200 * 1024);
});

test('tetto 6: conta solo i ritagli con chiamate, passano quelli con più parole di Tesseract, la pagina diventa gialla', () => {
    const rit = [];
    for (let k = 1; k <= 8; k++) rit.push({ nome: 'p1-' + k, chiamate: 2, paroleTesseract: k * 3 });
    rit.push({ nome: 'p1-9', chiamate: 0, paroleTesseract: 0 }, { nome: 'p1-10', chiamate: 0, paroleTesseract: 0 });
    const t = F.applicaTetto(rit);
    assert.strictEqual(t.letti.length, 6);
    assert.deepStrictEqual(t.oltreTetto.map(r => r.nome), ['p1-1', 'p1-2'], 'restano fuori i due con meno parole');
    assert.ok(t.oltreTetto.every(r => r.nonLetto === 'oltre il tetto'));
    assert.strictEqual(t.paginaGialla, true);
    assert.strictEqual(t.saltati.length, 2, 'i ritagli a 0 chiamate non contano nel tetto');
    const sotto = F.applicaTetto(rit.slice(0, 6).concat(rit.slice(8)));
    assert.strictEqual(sotto.paginaGialla, false);
});

/* ── R-D: formule spezzate ─────────────────────────────────────────────────── */
const riga = (x0, y0, x1, y1, testo) => ({ x0, y0, x1, y1, testo });
const RIGHE_FORMULE = [
    riga(60, 100, 400, 112, 'Risolvi le seguenti disequazioni'),
    riga(60, 130, 160, 142, '1) 2x + 3 > 7'),
    riga(200, 150, 212, 160, 'x'),            // numeratore
    riga(198, 162, 214, 172, '6'),            // denominatore, impilato
    riga(220, 156, 300, 168, '≤ 5 − x'),
    riga(60, 200, 160, 212, '2) 3x − 1 ≥ 8'),
    riga(60, 700, 400, 712, 'Soluzione in fondo alla pagina'),
    riga(540, 800, 556, 810, '12')            // numero di pagina isolato: non allarga la regione
];
test('regioniFormule: una frazione impilata fa una regione; elenchi, tabelle e colonne di numeri no', () => {
    const f = F.regioniFormule(RIGHE_FORMULE, W, H);
    assert.strictEqual(f.regioni.length, 1);
    assert.ok(f.spezzate >= 2);
    assert.ok(f.regionePagina.y <= 130 && f.regionePagina.y + f.regionePagina.h >= 212, 'la regione prende anche le disequazioni intere vicine');
    assert.ok(f.regionePagina.y + f.regionePagina.h < 700, 'ma non la riga di prosa lontana');
    assert.strictEqual(F.frammento('1.'), false, 'marcatore di elenco');
    assert.strictEqual(F.frammento('a)'), false);
    assert.strictEqual(F.frammento('x'), true);
    assert.strictEqual(F.rigaFormula('2x + 3 > 7'), true);
    assert.strictEqual(F.rigaFormula('Il re dona le terre'), false);
    // tre numeri impilati = tabella
    const colonna = [riga(100, 100, 120, 110, '12'), riga(100, 112, 120, 122, '15'), riga(100, 124, 120, 134, '18'), riga(100, 80, 300, 90, 'gennaio')];
    assert.strictEqual(F.regioniFormule(colonna, W, H).regioni.length, 0);
    // un frammento accanto a parole sulla stessa riga: cella di tabella o elenco, non frazione
    const cella = [riga(60, 100, 70, 110, '1'), riga(80, 100, 300, 110, 'Prima voce dell\'elenco'), riga(60, 115, 70, 125, '2'), riga(80, 115, 300, 125, 'Seconda voce dell\'elenco')];
    assert.strictEqual(F.regioniFormule(cella, W, H).regioni.length, 0);
    assert.strictEqual(F.statoPagina(pagina({ caratteri: 600, righe: RIGHE_FORMULE })).stato, 'formule');
    assert.strictEqual(F.statoPagina(pagina({ caratteri: 600, righe: RIGHE_FORMULE, immagini: [SCHEMA] })).stato, 'ritagli', 'con un ritaglio lo stato è ritagli e le formule restano a parte');
    assert.strictEqual(F.statoPagina(pagina({ caratteri: 600, righe: RIGHE_FORMULE, immagini: [SCHEMA] })).formule.regioni.length, 1);
});

/* ── attiva (inv. 6): un punto solo ────────────────────────────────────────── */
test('attiva: vero solo se mappai_figure ≠ "0" E origine CREA; l\'Output non c\'entra', () => {
    assert.strictEqual(F.attiva(null, 'crea'), true, 'acceso di serie');
    assert.strictEqual(F.attiva('1', 'crea'), true);
    assert.strictEqual(F.attiva('0', 'crea'), false);
    assert.strictEqual(F.attiva('1', 'elabora'), false);
    assert.strictEqual(F.attiva('1', undefined), false);
    assert.strictEqual(F.attiva('1', 'crea', 'metacomprensione'), true);
});

/* ── smista: i cinque casi, nell'ordine ────────────────────────────────────── */
const TIPO = 'Il re dona le terre ai vassalli. I vassalli forniscono cavalieri. Ogni vassallo può donare parte del suo feudo ai valvassori.';
test('smista: formule → 2; doppione → 0; testo nuovo → 2 insieme; foto → 1 al titolare; disegno → 1 poi controllo', () => {
    const base = { formule: false, tesseractCaricato: true, testoTesseract: '', testoTipografico: TIPO, tintePiatte: 0.5 };
    const f = F.smista(Object.assign({}, base, { formule: true, tintePiatte: 0.99 }));
    assert.deepStrictEqual([f.caso, f.chiamate, f.motivo], [1, 2, 'formule']);
    const d = F.smista(Object.assign({}, base, { testoTesseract: 'Il re dona le terre ai vassalli. I vassalli forniscono cavalieri. Ogni vassallo può donare parte del suo feudo' }));
    assert.deepStrictEqual([d.caso, d.chiamate, d.motivo], [2, 0, 'doppione']);
    const t = F.smista(Object.assign({}, base, { testoTesseract: 'IMPERATORE feudi reali VASSALLO valvassino valvassino' }));
    assert.deepStrictEqual([t.caso, t.chiamate, t.motivo, t.insieme], [3, 2, 'testo', true]);
    const foto = F.smista(Object.assign({}, base, { testoTesseract: 'ue ab 12', tintePiatte: 0.52 }));
    assert.deepStrictEqual([foto.caso, foto.chiamate, foto.motivo, foto.controlloDopo], [4, 1, 'foto', true], 'la foto va al titolare una volta (§9.1)');
    const dis = F.smista(Object.assign({}, base, { testoTesseract: '', tintePiatte: 0.75 }));
    assert.deepStrictEqual([dis.caso, dis.chiamate, dis.motivo, dis.controlloDopo], [5, 1, 'disegno', true]);
    assert.strictEqual(F.smista(Object.assign({}, base, { tintePiatte: 0.70 })).caso, 5, '0,70 è già disegno');
    assert.strictEqual(F.smista(Object.assign({}, base, { tintePiatte: 0.68 })).caso, 4, '0,68 (l\'automobile) è foto');
    // il caso 3 viene prima del 4: la foto con didascalie è a toni continui ma porta parole
    const fotoConTesto = F.smista(Object.assign({}, base, { testoTesseract: 'La prova il re appoggia la spada sulla spalla', tintePiatte: 0.52 }));
    assert.strictEqual(fotoConTesto.caso, 3);
});

test('smista: le soglie del doppione (≥ 3 sequenze di tre parole piene, il 90 % già presenti)', () => {
    const d = F.doppione('Il re dona le terre ai vassalli. I vassalli forniscono cavalieri. Ogni vassallo può donare', TIPO);
    assert.strictEqual(d.doppione, true);
    assert.ok(d.sequenze >= 3 && d.quota >= 0.9);
    const poco = F.doppione('vassalli forniscono cavalieri', TIPO);
    assert.strictEqual(poco.doppione, false, 'una sequenza sola non basta');
    const nuovo = F.doppione('IMPERATORE feudi reali VASSALLO valvassore valvassino valvassino valvassino', TIPO);
    assert.strictEqual(nuovo.doppione, false);
    assert.strictEqual(F.SOGLIE.DOPPIONE_SEQUENZE, 3);
    assert.strictEqual(F.SOGLIE.DOPPIONE_QUOTA, 0.9);
    assert.strictEqual(F.SOGLIE.TINTE_PIATTE, 0.7);
});

test('smista: Tesseract non caricato → il caso 2 si salta, i casi 3-5 si decidono dai pixel', () => {
    const base = { formule: false, tesseractCaricato: false, testoTesseract: null, testoTipografico: TIPO };
    assert.strictEqual(F.smista(Object.assign({}, base, { tintePiatte: 0.3 })).caso, 4);
    assert.strictEqual(F.smista(Object.assign({}, base, { tintePiatte: 0.9 })).caso, 5);
    assert.strictEqual(F.smista(Object.assign({}, base, { formule: true, tintePiatte: 0.9 })).caso, 1);
    assert.strictEqual(F.smista(Object.assign({}, base, { tintePiatte: 0.3 })).senzaTesseract, true);
});

test('dopoTitolare: «nessun testo» ferma; testo letto → parte il controllo (la foto passa al caso 3)', () => {
    const foto = F.smista({ formule: false, tesseractCaricato: true, testoTesseract: '', testoTipografico: TIPO, tintePiatte: 0.4 });
    const ferma = F.dopoTitolare(foto, F.lettore('[FOTO]\nnessun testo'));
    assert.deepStrictEqual([ferma.controllo, ferma.chiamate, ferma.fermo], [false, 1, true]);
    const prosegue = F.dopoTitolare(foto, F.lettore('[FOTO]\nCartello: Saline di Bex'));
    assert.deepStrictEqual([prosegue.controllo, prosegue.chiamate, prosegue.caso], [true, 2, 3]);
    const disegno = F.smista({ formule: false, tesseractCaricato: true, testoTesseract: '', testoTipografico: TIPO, tintePiatte: 0.99 });
    assert.strictEqual(F.dopoTitolare(disegno, F.lettore('[SCHEMA]\nA\nB\nC\nD')).controllo, true);
    assert.strictEqual(F.dopoTitolare(disegno, F.lettore('[SCHEMA]\nA\nB\nC\nD')).caso, 5);
    // un caso 3 non passa da qui: le due chiamate partono insieme
    const testo = F.smista({ formule: false, tesseractCaricato: true, testoTesseract: 'valvassino valvassino', testoTipografico: TIPO, tintePiatte: 0.4 });
    assert.strictEqual(F.dopoTitolare(testo, F.lettore('[SCHEMA]\nvalvassino')).controllo, true);
});

/* ── prompt e lettore ──────────────────────────────────────────────────────── */
test('prompt: la coda del core (riga del tipo, «nessun testo») si accoda al testo della console e resiste a un override svuotato', () => {
    const p = F.prompt('FIGURA', 'Trascrivi SOLO ciò che sta nell\'immagine.', { lingua: 'it' });
    assert.ok(p.startsWith('Trascrivi SOLO'));
    assert.ok(/\[SCHEMA\], \[DOCUMENTO\], \[ESERCIZIO\], \[FOTO\], \[TESTO\]/.test(p));
    assert.ok(/nessun testo/.test(p));
    const vuoto = F.prompt('FIGURA', '', { lingua: 'it' });
    assert.ok(/\[SCHEMA\]/.test(vuoto) && /nessun testo/.test(vuoto), 'FIGURA_IT svuotata nell\'override: la riga del tipo c\'è ancora');
    const en = F.prompt('FIGURA', 'Transcribe ONLY what is inside the image.', { lingua: 'en' });
    assert.ok(/\[DIAGRAM\], \[DOCUMENT\], \[EXERCISE\], \[PHOTO\], \[TEXT\]/.test(en) && /no text/.test(en));
    const formule = F.prompt('FORMULE', 'Riscrivi ogni formula in una riga sola.', { lingua: 'it', testoTipografico: '1) 2x + 3 > 7' });
    assert.ok(/--- Testo tipografico della pagina ---\n1\) 2x \+ 3 > 7\n--- fine del testo tipografico ---/.test(formule), 'i delimitatori dell\'àncora');
    assert.ok(!/--- Testo tipografico/.test(p), 'FIGURA non porta l\'àncora');
});

test('lettore bilingue: tag IT ed EN, senza tag → TESTO e giallo, «nessun testo» / «no text»', () => {
    const it = F.lettore('[SCHEMA]\nIMPERATORE\nVASSALLO\nvalvassino\nvalvassino');
    assert.deepStrictEqual([it.tipo, it.senzaTag, it.nessunTesto, it.righe.length], ['SCHEMA', false, false, 4]);
    const en = F.lettore('[DIAGRAM]\nEMPEROR\nVASSAL');
    assert.strictEqual(en.tipo, 'SCHEMA');
    assert.strictEqual(F.lettore('[PHOTO]\nno text').nessunTesto, true);
    assert.strictEqual(F.lettore('[FOTO]\nNessun testo.').nessunTesto, true);
    assert.strictEqual(F.lettore('[FOTO]\nnessun testo').tipo, 'FOTO');
    const senza = F.lettore('Il re dona le terre ai vassalli.\nI vassalli forniscono cavalieri.');
    assert.deepStrictEqual([senza.tipo, senza.senzaTag, senza.righe.length], ['TESTO', true, 2]);
    assert.strictEqual(F.lettore('').nessunTesto, true);
    assert.strictEqual(F.lettore('ESERCIZIO\n1) Osserva i signori').tipo, 'ESERCIZIO', 'anche il tipo nudo in prima riga');
});

test('lettoreFormule: «n) formula → soluzione»', () => {
    const f = F.lettoreFormule('1) 2x + 3 > 7 → S = ]2; +∞[\n2) (x)/(6) ≤ 5 − x\nSoluzione in fondo');
    assert.strictEqual(f.length, 2);
    assert.deepStrictEqual(f[0], { n: '1', formula: '2x + 3 > 7', soluzione: 'S = ]2; +∞[' });
    assert.deepStrictEqual(f[1], { n: '2', formula: '(x)/(6) ≤ 5 − x', soluzione: '' });
});

/* ── pulisci (R7) ──────────────────────────────────────────────────────────── */
test('pulisci: frasi d\'apertura, crediti fotografici e righe già nel tipografico via; nessuno stato; non sulle formule', () => {
    const r = F.pulisci('Ecco la trascrizione:\nIMPERATORE\nIl re dona le terre ai vassalli.\n© Getty Images / foto: Archivio\nvalvassino', TIPO);
    assert.deepStrictEqual(r.righe, ['IMPERATORE', 'valvassino']);
    assert.strictEqual(r.tolte, 3);
    const f = F.pulisci('1) 2x + 3 > 7', '1) 2x + 3 > 7', { formule: true });
    assert.deepStrictEqual(f.righe, ['1) 2x + 3 > 7'], 'sulle risposte FORMULE il tipografico non toglie nulla');
    assert.strictEqual(F.pulisci('Ecco\n\n\nVASSALLO', '').righe.length, 1, 'righe vuote via');
});

/* ── R5 riga per riga, R1, stato ───────────────────────────────────────────── */
const VALVASSINI_4 = 'IMPERATORE\nfeudi reali\nVASSALLO\nvalvassore\nvalvassore\nvalvassino\nvalvassino\nvalvassino\nvalvassino\nIMPERATORE → VASSALLO: dona dei feudi';
const VALVASSINI_3 = 'IMPERATORE\nfeudi reali\nVASSALLO\nvalvassore\nvalvassore\nvalvassino\nvalvassino\nvalvassino\nIMPERATORE → VASSALLO: dona dei feudi';
test('accordo R5: 4 valvassini contro 3 → una riga gialla e ritaglio giallo; con le stesse righe tutto verde', () => {
    const a = F.accordo(F.lettore('[SCHEMA]\n' + VALVASSINI_4), F.lettore('[SCHEMA]\n' + VALVASSINI_3));
    assert.strictEqual(a.modo, 'schema');
    assert.strictEqual(a.righe.filter(r => !r.verde).length, 1);
    assert.strictEqual(a.righe.filter(r => !r.verde)[0].testo, 'valvassino');
    assert.ok(a.etichetteDiverse.some(e => /valvassino 4\/3/.test(e)));
    assert.strictEqual(F.stato({ accordo: a, letture: 2, provider: 'infomaniak' }).stato, 'giallo');
    const uguale = F.accordo(F.lettore('[SCHEMA]\n' + VALVASSINI_4), F.lettore('[SCHEMA]\n' + VALVASSINI_4));
    assert.ok(uguale.righe.every(r => r.verde));
    assert.strictEqual(uguale.forseManca.length, 0);
    assert.strictEqual(F.stato({ accordo: uguale, letture: 2, provider: 'infomaniak' }).stato, 'verde');
});

test('accordo R5: una riga inventata → quella gialla, le altre verdi; le righe solo del controllo sono «forse manca»', () => {
    const tit = F.lettore('[DOCUMENTO]\nA. Se qualcuno dei nostri fedeli chiederà aiuto a un vassallo\nB. Se qualcuno vorrà abbandonare il suo signore\nC. Il signore dona un castello al vassallo fedele');
    const con = F.lettore('[DOCUMENTO]\nA. Se qualcuno dei nostri fedeli chiederà aiuto a un vassallo\nB. Se qualcuno vorrà abbandonare il suo signore\nIl re è proprietario di tutte le terre?');
    const a = F.accordo(tit, con);
    assert.deepStrictEqual(a.righe.map(r => r.verde), [true, true, false]);
    assert.deepStrictEqual(a.forseManca, ['Il re è proprietario di tutte le terre?']);
    assert.strictEqual(F.stato({ accordo: a, letture: 2, provider: 'infomaniak' }).stato, 'giallo');
    // un refuso in una parola piena: gialla (regola stretta: tutte le parole piene devono stare nella riga del controllo)
    const refuso = F.accordo(F.lettore('[TESTO]\nIl vassallo ripone le mani giunte in quelle del re'), F.lettore('[TESTO]\nIl vassallo ripone le mani giunte in quelle del ré'));
    assert.strictEqual(refuso.righe[0].verde, true, '«re» non è una parola piena: la riga è verde');
    const refuso2 = F.accordo(F.lettore('[TESTO]\nIl vassallo ripone le mani giunte'), F.lettore('[TESTO]\nIl vassalo ripone le mani giunte'));
    assert.strictEqual(refuso2.righe[0].verde, false, '«vassallo» ≠ «vassalo»: gialla');
    // il numero d'ordine in testa non conta
    const num = F.accordo(F.lettore('[ESERCIZIO]\n1) Osserva i signori al livello più basso'), F.lettore('[ESERCIZIO]\n1. Osserva i signori al livello più basso'));
    assert.strictEqual(num.righe[0].verde, true);
    // una riga del titolare contenuta in una riga più lunga del controllo (colonne di tabella fuse) è verde
    const fusa = F.accordo(F.lettore('[DOCUMENTO]\nAnnullamento per colpa del vassallo\nPrepotenze dei signori'), F.lettore('[DOCUMENTO]\nAnnullamento per colpa del vassallo Prepotenze dei signori Vigliaccheria dei vassalli'));
    assert.deepStrictEqual(fusa.righe.map(r => r.verde), [true, true]);
});

test('accordo sulle formule: atomi normalizzati col minimo delle due coperture, giallo sotto il 95 %', () => {
    const tit = F.lettore('1) 2x + 3 > 7 → S = ]2; +∞[\n2) (x)/(6) ≤ 5 − x\n3) 3x − 1 ≥ 8');
    const con = F.lettore('1) 2x + 3 > 7 → S = ]2; +∞[\n2) \\frac{x}{6} \\leq 5 - x\n3) 3x − 1 ≥ 9');
    const a = F.accordo(tit, con, { formule: true });
    assert.strictEqual(a.modo, 'formule');
    assert.ok(a.accordoPct >= 50 && a.accordoPct < 95, 'quattro atomi su cinque in comune: ' + a.accordoPct + ' %');
    assert.deepStrictEqual(a.righe.map(r => r.verde), [true, true, false], 'la terza formula diverge: gialla');
    assert.strictEqual(F.stato({ accordo: a, letture: 2, provider: 'infomaniak', formule: true }).stato, 'giallo');
    const inPiu = F.accordo(F.lettore('1) 2x > 4'), F.lettore('1) 2x > 4\n2) x < 1'), { formule: true });
    assert.ok(inPiu.accordoPct <= 50, 'un atomo in più in una sola lettura abbassa l\'accordo (minimo delle coperture)');
    const pari = F.accordo(F.lettore('1) 2x + 3 > 7'), F.lettore('1) 2x+3>7'), { formule: true });
    assert.strictEqual(pari.accordoPct, 100);
    assert.strictEqual(F.stato({ accordo: pari, letture: 2, provider: 'infomaniak', formule: true }).stato, 'verde');
});

test('stato: una lettura sola → non letto; con Google una lettura = giallo, mai verde; vuota → rosso; sotto il 50 % → rosso; R1', () => {
    const uguale = F.accordo(F.lettore('[TESTO]\nIl re dona le terre'), F.lettore('[TESTO]\nIl re dona le terre'));
    assert.strictEqual(F.stato({ accordo: uguale, letture: 1, provider: 'infomaniak' }).stato, 'non letto');
    assert.strictEqual(F.stato({ accordo: null, letture: 1, provider: 'infomaniak', titolare: F.lettore('[TESTO]\nIl re dona le terre') }).stato, 'non letto');
    const google = F.stato({ letture: 1, provider: 'google', titolare: F.lettore('[TESTO]\nIl re dona le terre ai vassalli') });
    assert.strictEqual(google.stato, 'giallo');
    assert.ok(google.righe.every(r => !r.verde), 'con Google ogni riga porta il segno');
    assert.strictEqual(F.stato({ letture: 2, provider: 'infomaniak', titolare: F.lettore('[TESTO]\n'), controllo: F.lettore('[TESTO]\nqualcosa') }).stato, 'rosso');
    const diverso = F.accordo(F.lettore('[TESTO]\nuno due tre quattro\ncinque sei sette otto'), F.lettore('[TESTO]\nnove dieci undici dodici\ntredici quattordici'));
    assert.strictEqual(F.stato({ accordo: diverso, letture: 2, provider: 'infomaniak' }).stato, 'rosso');
    // R1: meno del 40 % delle parole che Tesseract legge (se ne legge almeno 8) → rosso; non sulle formule
    const corto = F.stato({ accordo: uguale, letture: 2, provider: 'infomaniak', paroleTesseract: 20 });
    assert.strictEqual(corto.stato, 'rosso');
    assert.ok(corto.motivi.some(m => /r1/i.test(m)));
    assert.strictEqual(F.stato({ accordo: uguale, letture: 2, provider: 'infomaniak', paroleTesseract: 7 }).stato, 'verde', 'sotto le 8 parole Tesseract non conta');
    assert.strictEqual(F.stato({ accordo: uguale, letture: 2, provider: 'infomaniak', paroleTesseract: 20, formule: true }).stato, 'verde');
});

test('R0: testo a immagini giallo fisso; scansione senza Google rossa «parziale», non entra', () => {
    const ti = F.statoR0('testo-immagini', {});
    assert.deepStrictEqual([ti.stato, ti.entra], ['giallo', true]);
    assert.ok(/OCR locale/.test(ti.nota));
    const sc = F.statoR0('scansione', { google: false });
    assert.deepStrictEqual([sc.stato, sc.entra, sc.nota], ['rosso', false, 'parziale']);
    assert.strictEqual(F.statoR0('scansione', { google: true }).stato, 'giallo', 'con Google una lettura sola: giallo');
});

/* ── marcatori e legenda (bivio E1) ────────────────────────────────────────── */
test('marcatori.figure: una riga per pagina, spazi compattati, segno attorno alla sola parte gialla, legenda solo se c\'è un segno, rosso e non letto fuori', () => {
    const verde = { stato: 'verde', righe: [{ testo: 'IMPERATORE', verde: true }, { testo: 'VASSALLO', verde: true }] };
    const blocco = F.marcatori.figure(2, [verde]);
    assert.strictEqual(blocco, '[Figure della pagina 2] IMPERATORE VASSALLO. [/Figure]', 'l\'ultima frase chiude col punto prima del marcatore (0114, D6)');
    assert.ok(!/\n/.test(blocco));
    const giallo = { stato: 'giallo', righe: [{ testo: 'valvassino', verde: true }, { testo: 'valvassino  valvassino', verde: false }] };
    const conSegno = F.marcatori.figure(2, [verde, giallo, { stato: 'rosso', righe: [{ testo: 'INVENTATO', verde: true }] }, { stato: 'non letto', righe: [] }]);
    assert.ok(conSegno.startsWith('[Figure della pagina 2] ' + F.LEGENDA.it + ' '), 'la legenda in testa, subito dopo il marcatore');
    assert.ok(conSegno.indexOf('⟦da controllare: valvassino valvassino. ⟧') > 0, conSegno);
    assert.ok(!/INVENTATO/.test(conSegno), 'il rosso non entra');
    assert.ok(conSegno.endsWith(' [/Figure]'));
    assert.ok(!/\n/.test(conSegno) && !/ {2}/.test(conSegno));
    assert.strictEqual(F.marcatori.figure(2, [{ stato: 'rosso', righe: [{ testo: 'x', verde: true }] }]), '', 'niente da mettere: niente blocco');
    const en = F.marcatori.figure(3, [giallo], { lingua: 'en' });
    assert.ok(en.startsWith('[Figures of page 3] ' + F.LEGENDA.en + ' '));
    assert.ok(en.endsWith(' [/Figures]'));
    assert.ok(/⟦da controllare: /.test(F.LEGENDA.it) && /usalo solo se il resto della fonte lo conferma/.test(F.LEGENDA.it));
});

test('marcatori.testoImmagini e marcatori.formule; accoda mette il blocco in fondo alla pagina su una riga sua', () => {
    const t = F.marcatori.testoImmagini(7, ['La respirazione  è\nun processo', '', '   ']);
    assert.ok(t.startsWith('[Testo a immagini della pagina 7, OCR locale] '));
    assert.ok(t.endsWith(' [/Testo a immagini]'));
    assert.ok(t.indexOf('⟦da controllare: La respirazione è un processo. ⟧') > 0, 'giallo fisso: ' + t);
    assert.ok(t.indexOf(F.LEGENDA.it) > 0);
    assert.strictEqual(F.marcatori.testoImmagini(7, ['', ' ']), '', 'blocchi vuoti non entrano');
    const f = F.marcatori.formule(5, [{ n: '1', formula: '2x + 3 > 7', soluzione: 'S = ]2; +∞[' }, { n: '', formula: 'x < 1', soluzione: '' }]);
    assert.strictEqual(f, '[Formule della pagina 5] ' + F.LEGENDA.it + ' ⟦da controllare: 1) 2x + 3 > 7 → S = ]2; +∞[ ; x < 1. ⟧ [/Formule]');
    // sulla STESSA riga della pagina (ADR §5.7): su una riga sua il blocco diventa una riga del corpus e il «modo A» di
    // stripBoilerplate gli toglie «[Figure della pagina N] ⟦da controllare…» come intestazione (misurato il 19/10, lotto 7)
    assert.strictEqual(F.marcatori.accoda('riga uno\nriga due  \n', '[Figure della pagina 1] A [/Figure]'), 'riga uno\nriga due [Figure della pagina 1] A [/Figure]');
    assert.strictEqual(F.marcatori.accoda('', '[Figure della pagina 1] A [/Figure]'), '[Figure della pagina 1] A [/Figure]', 'pagina senza testo tipografico: solo il blocco');
    assert.strictEqual(F.marcatori.accoda('testo', ''), 'testo', 'un blocco vuoto non cambia la pagina');
});

/* ── innesta: le formule al posto delle righe spezzate ────────────────────── */
test('innesta: regione verde → frammenti via, la formula dopo la consegna col suo numero, senza numero in fondo, già integra non si inserisce', () => {
    const righe = ['Risolvi le seguenti disequazioni', '1) 2x + 3 > 7', 'x', '6', '≤ 5 − x', '2) 3x − 1 ≥ 8', 'Soluzione in fondo alla pagina'];
    const formule = [{ n: '1', formula: '(x)/(6) ≤ 5 − x', soluzione: '' }, { n: '2', formula: '3x − 1 ≥ 8', soluzione: 'S = [3; +∞[' }, { n: '', formula: 'x > 0', soluzione: '' }];
    const r = F.innesta({ righe, indiciRegione: [1, 2, 3, 4, 5], formule, stato: 'verde', pagina: 4 });
    // «x», «6» sono frammenti; «≤ 5 − x» è un pezzo che la formula letta contiene già; la 2) è già integra nel tipografico e non si inserisce
    assert.deepStrictEqual(r.righe, ['Risolvi le seguenti disequazioni', '1) 2x + 3 > 7', '(x)/(6) ≤ 5 − x', '2) 3x − 1 ≥ 8', 'x > 0', 'Soluzione in fondo alla pagina']);
    assert.strictEqual(r.tolte, 3);
    assert.strictEqual(r.inserite, 2);
    // la regione finisce con un frammento (p.4 di Teoria diseq finisce con due denominatori): le formule senza consegna si accodano lo stesso, in fondo alla regione (lotto 3)
    const coda = F.innesta({ righe: ['Risolvi', '3x − 1 ≥ 8', 'x', '6', 'Soluzione in fondo'], indiciRegione: [1, 2, 3], formule: [{ n: '2', formula: '(x)/(6) ≤ 5 − x', soluzione: '' }, { n: '', formula: 'x > 0', soluzione: '' }], stato: 'verde', pagina: 4 });
    assert.deepStrictEqual(coda.righe, ['Risolvi', '3x − 1 ≥ 8', '2) (x)/(6) ≤ 5 − x', 'x > 0', 'Soluzione in fondo']);
    assert.deepStrictEqual([coda.inserite, coda.tolte], [2, 2]);
    const integra = F.innesta({ righe: ['1) 2x + 3 > 7'], indiciRegione: [0], formule: [{ n: '1', formula: '2x+3 > 7', soluzione: '' }], stato: 'verde', pagina: 4 });
    assert.deepStrictEqual(integra.righe, ['1) 2x + 3 > 7'], 'una formula già integra nel tipografico non si inserisce');
    assert.strictEqual(integra.inserite, 0);
});

test('innesta: regione gialla → nessuna riga tolta, le formule fra [Formule della pagina N]; rossa → testo com\'è', () => {
    const righe = ['1) 2x + 3 > 7', 'x', '6', '≤ 5 − x'];
    const formule = [{ n: '1', formula: '(x)/(6) ≤ 5 − x', soluzione: '' }];
    const g = F.innesta({ righe, indiciRegione: [0, 1, 2, 3], formule, stato: 'giallo', pagina: 5 });
    assert.deepStrictEqual(g.righe.slice(0, 4), righe);
    assert.strictEqual(g.righe[4], '[Formule della pagina 5] ' + F.LEGENDA.it + ' ⟦da controllare: 1) (x)/(6) ≤ 5 − x. ⟧ [/Formule]');
    assert.strictEqual(g.tolte, 0);
    const r = F.innesta({ righe, indiciRegione: [0, 1, 2, 3], formule, stato: 'rosso', pagina: 5 });
    assert.deepStrictEqual(r.righe, righe);
    assert.strictEqual(r.inserite, 0);
});

/* ── identità, modelli, stima, payload, dossier ────────────────────────────── */
test('identita = impronta del PDF + pagina + rettangolo in punti (al decimo); impronta deterministica', () => {
    const id = F.identita('a1b2c3', 2, [40, 100, 482, 217.04]);
    assert.strictEqual(id, 'a1b2c3:p2:40,100,482,217');
    assert.strictEqual(F.identita('a1b2c3', 2, { x: 40, y: 100, w: 482, h: 217 }), id);
    assert.notStrictEqual(F.identita('a1b2c3', 3, [40, 100, 482, 217]), id);
    assert.strictEqual(F.impronta('ciao'), F.impronta('ciao'));
    assert.notStrictEqual(F.impronta('ciao'), F.impronta('ciao '));
    assert.ok(/^[0-9a-f]{8,}$/.test(F.impronta('ciao')));
});

const CATALOGO = [{ id: 'google/gemma-4-31B-it' }, { id: 'Qwen/Qwen3.5-122B-A10B-FP8' }, { id: 'mistralai/Mistral-Small-4-119B-2603' }];
test('modelloPer: Gemma titolare e Qwen controllo su Infomaniak; ripiego sulla tendina se uno manca o è ritirato; Google una lettura gialla; senza chiave la strada locale', () => {
    const coppia = F.modelloPer('FIGURA', 'infomaniak', { infomaniak: 'tok' }, { righe: CATALOGO, tendina: 'mistralai/Mistral-Small-4-119B-2603' });
    assert.deepStrictEqual([coppia.titolare, coppia.controllo, coppia.letture, coppia.ripiego, coppia.locale], [F.MODELLI.TITOLARE, F.MODELLI.CONTROLLO, 2, false, false]);
    const senzaQwen = F.modelloPer('FIGURA', 'infomaniak', { infomaniak: 'tok' }, { righe: CATALOGO.filter(r => !/qwen/i.test(r.id)), tendina: 'mistralai/Mistral-Small-4-119B-2603' });
    assert.deepStrictEqual([senzaQwen.titolare, senzaQwen.controllo, senzaQwen.ripiego], [F.MODELLI.TITOLARE, 'mistralai/Mistral-Small-4-119B-2603', true]);
    const ritirato = F.modelloPer('FIGURA', 'infomaniak', { infomaniak: 'tok' }, { righe: [{ id: 'google/gemma-4-31B-it', infoStatus: 'retired' }, { id: 'Qwen/Qwen3.5-122B-A10B-FP8' }], tendina: 'Qwen/Qwen3.5-122B-A10B-FP8' });
    assert.deepStrictEqual([ritirato.titolare, ritirato.controllo, ritirato.ripiego], ['Qwen/Qwen3.5-122B-A10B-FP8', 'Qwen/Qwen3.5-122B-A10B-FP8', true]);
    assert.strictEqual(F.modelloPer('FIGURA', 'infomaniak', { infomaniak: 'tok' }, CATALOGO).controllo, F.MODELLI.CONTROLLO, 'il catalogo può arrivare come lista');
    assert.strictEqual(F.modelloPer('FIGURA', 'infomaniak', { infomaniak: 'tok' }, null).titolare, F.MODELLI.TITOLARE, 'senza catalogo (rete giù) si prova la coppia com\'è');
    const google = F.modelloPer('FIGURA', 'google', { google: 'k' }, null);
    assert.deepStrictEqual([google.titolare, google.controllo, google.letture, google.sempreGiallo], [F.MODELLI.GOOGLE, null, 1, true]);
    assert.strictEqual(F.modelloPer('SCANSIONE', 'google', { google: 'k' }, null).titolare, F.MODELLI.GOOGLE);
    assert.deepStrictEqual(F.modelloPer('SCANSIONE', 'infomaniak', { infomaniak: 'tok' }, CATALOGO).locale, true, 'la scansione a Infomaniak non va: strada locale');
    assert.deepStrictEqual([F.modelloPer('FIGURA', 'infomaniak', {}, CATALOGO).locale, F.modelloPer('FIGURA', 'infomaniak', {}, CATALOGO).letture], [true, 0]);
    assert.strictEqual(F.modelloPer('FIGURA', 'google', { infomaniak: 'tok' }, null).locale, true, 'mai il token Infomaniak verso Google');
});

test('stima: titolare e controllo sommati, foto e disegni contati come una chiamata (è un tetto), foto e doppioni detti a parte', () => {
    const decisioni = [
        F.smista({ formule: false, tesseractCaricato: true, testoTesseract: 'IMPERATORE valvassino valvassino', testoTipografico: TIPO, tintePiatte: 0.5 }), // testo: 2
        F.smista({ formule: true, tesseractCaricato: true, testoTesseract: '', testoTipografico: TIPO, tintePiatte: 0.9 }),                                    // formule: 2
        F.smista({ formule: false, tesseractCaricato: true, testoTesseract: 'Il re dona le terre ai vassalli. I vassalli forniscono cavalieri. Ogni vassallo può donare', testoTipografico: TIPO, tintePiatte: 0.5 }), // doppione: 0
        F.smista({ formule: false, tesseractCaricato: true, testoTesseract: '', testoTipografico: TIPO, tintePiatte: 0.3 }),                                   // foto: 1
        F.smista({ formule: false, tesseractCaricato: true, testoTesseract: '', testoTipografico: TIPO, tintePiatte: 0.9 })                                    // disegno: 1
    ];
    const prezzi = { titolare: { in: 0.20, out: 0.40 }, controllo: { in: 0.40, out: 3.20 } };
    const s = F.stima(decisioni, prezzi);
    assert.deepStrictEqual([s.daLeggere, s.foto, s.doppioni, s.disegni, s.chiamateMax], [4, 1, 1, 1, 6]);
    assert.strictEqual(s.riga, 'Lettura delle figure: 4 ritagli da leggere (1 foto a una lettura, 1 doppione saltato)');
    assert.ok(s.costoCHF > 0 && s.costoCHF < 0.01, 'qualche decimo di centesimo: ' + s.costoCHF);
    assert.ok(s.costoCHF > F.stima(decisioni, { titolare: prezzi.titolare, controllo: { in: 0, out: 0 } }).costoCHF, 'il controllo pesa');
    assert.strictEqual(F.stima([], prezzi).riga, '', 'senza ritagli nessuna riga');
    assert.strictEqual(F.stima(decisioni, prezzi, { lingua: 'en' }).riga, 'Reading the figures: 4 crops to read (1 photo with one reading, 1 duplicate skipped)');
});

test('payloadLettura: temperatura 0, senza pensiero, penalità spente, 2.048 token in uscita, 60 s, _respectTemp', () => {
    const p = F.payloadLettura();
    assert.strictEqual(p.generationConfig.temperature, 0);
    assert.strictEqual(p.generationConfig._respectTemp, true);
    assert.strictEqual(p.generationConfig.maxOutputTokens, 2048);
    assert.strictEqual(p.penalita, false);
    assert.strictEqual(p.pensiero, false);
    assert.strictEqual(p.attesaMs, 60000);
    assert.strictEqual(p.immagini, true);
    assert.strictEqual(F.SOGLIE.CHIAMATE_IN_VOLO, 3);
});

test('dossier .figure.json: testata per PDF, voci per ritaglio, percorsi solo relativi (inv. 7), riassunto', () => {
    const d = F.dossier.nuovo({ impronta: 'a1b2c3', file: 'Fonti/UDII4.pdf', pagine: 3 });
    assert.deepStrictEqual([d.versione, d.impronta, d.file, d.pagine, d.ritagli.length, d.google], [1, 'a1b2c3', 'Fonti/UDII4.pdf', 3, 0, null]);
    assert.throws(() => F.dossier.nuovo({ impronta: 'x', file: '/Users/qualcuno/Fonti/UDII4.pdf' }), /relativ/i);
    const voce = F.dossier.ritaglio({ identita: 'a1b2c3:p2:40,100,482,217', pagina: 2, rettPt: [40, 100, 482, 217], tipo: 'SCHEMA', motivo: 'testo', caso: 3,
        modelli: { titolare: F.MODELLI.TITOLARE, controllo: F.MODELLI.CONTROLLO }, ppi: [160, 160], qualita: 85, stato: 'giallo',
        letture: { titolare: 'IMPERATORE\nvalvassino', controllo: 'IMPERATORE' }, gialle: ['valvassino'], forseManca: [], testoCorretto: null });
    assert.strictEqual(voce.stato, 'giallo');
    assert.ok(voce.data, 'la data c\'è');
    d.ritagli.push(voce, F.dossier.ritaglio({ identita: 'a1b2c3:p3:1,1,1,1', pagina: 3, rettPt: [1, 1, 1, 1], tipo: null, motivo: 'foto', caso: 4, stato: null, chiamate: 1 }));
    const r = F.dossier.riassumi(d);
    assert.deepStrictEqual([r.stati.gialli, r.stati.verdi, r.saltati, r.ritagli], [1, 0, 1, 2]);
    assert.strictEqual(F.dossier.trova(d, 'a1b2c3:p2:40,100,482,217'), voce, 'la stessa pagina non si legge due volte');
    assert.strictEqual(F.dossier.trova(d, 'altro'), null);
    const nonLetto = F.dossier.ritaglio({ identita: 'z', pagina: 1, rettPt: [0, 0, 1, 1], stato: 'non letto', motivo: 'testo' });
    assert.strictEqual(F.dossier.daRileggere(nonLetto), true, 'un non letto si ritenta al CREA successivo');
    assert.strictEqual(F.dossier.daRileggere(voce), false);
});

test('il core è puro: niente window, niente DOM, niente rete', () => {
    assert.strictEqual(typeof F.VERSIONE, 'string');
    const fs = require('node:fs');
    const src = fs.readFileSync(require.resolve('../public/js/mappai-figure-core.js'), 'utf8');
    assert.ok(!/window\.t\(/.test(src), 'mai window.t diretto: _tSafe');
    assert.ok(!/document\./.test(src));
    assert.ok(!/\bfetch\(/.test(src));
    assert.ok(!/localStorage/.test(src), 'l\'interruttore lo legge il modulo, il core lo riceve');
});

/* ══════════════════════════════════════════════════════════════════════════════
   LOTTO 3 — il ponte: l'opzione `penalita: false` (unica modifica al ponte, ADR §5.5, §9.4).
   Il payload delle letture (`payloadLettura`) tradotto dal ponte VERO in una vm: temperatura 0 rispettata, 2.048 token,
   penalità a 0, immagine come `image_url`, Qwen senza pensiero; senza l'opzione il ponte resta com'era (0,3 / 0,1).
   ══════════════════════════════════════════════════════════════════════════════ */
function ponteVero() {
    const vm = require('node:vm');
    const ctx = { console: { warn() { }, log() { } } }; ctx.window = ctx; ctx.showToast = () => { };
    vm.createContext(ctx);
    vm.runInContext(require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'public', 'js', 'infomaniak_bridge.js'), 'utf8'), ctx);
    return ctx.InfomaniakBridge;
}
test('lotto 3, il ponte: il payload delle letture passa con penalita:false → penalità 0, temperatura 0, 2.048 token, immagine e prompt, Qwen senza pensiero; gli altri chiamanti non cambiano', () => {
    const B = ponteVero();
    const p = F.payloadLettura();
    const payload = { contents: [{ parts: [{ inlineData: { mimeType: p.mime, data: 'QUJD' } }, { text: F.prompt('FIGURA', 'Trascrivi SOLO ciò che sta nell\'immagine.', { lingua: 'it' }) }] }], generationConfig: p.generationConfig };
    const out = JSON.parse(JSON.stringify(B.translatePayload(payload, F.MODELLI.CONTROLLO, { immagini: p.immagini, penalita: p.penalita })));
    assert.deepStrictEqual([out.temperature, out.max_tokens, out.frequency_penalty, out.presence_penalty], [0, 2048, 0, 0]);
    assert.deepStrictEqual(out.chat_template_kwargs, { enable_thinking: false }, 'Qwen senza pensiero');
    assert.strictEqual(out.messages.length, 1);
    assert.deepStrictEqual(out.messages[0].content.map(c => c.type), ['text', 'image_url']);
    assert.strictEqual(out.messages[0].content[1].image_url.url, 'data:image/jpeg;base64,QUJD');
    assert.ok(/\[SCHEMA\], \[DOCUMENTO\]/.test(out.messages[0].content[0].text), 'la coda del core arriva al modello');
    assert.strictEqual(out.response_format, undefined, 'niente schema JSON: testo semplice coi marcatori');
    const gemma = JSON.parse(JSON.stringify(B.translatePayload(payload, F.MODELLI.TITOLARE, { immagini: true, penalita: false })));
    assert.deepStrictEqual([gemma.temperature, gemma.frequency_penalty, gemma.presence_penalty, gemma.chat_template_kwargs], [0, 0, 0, undefined]);
    // senza l'opzione, o con `penalita: true`, il ponte è quello di prima
    const prima = JSON.parse(JSON.stringify(B.translatePayload({ contents: [{ parts: [{ text: 'Ciao' }] }], generationConfig: { maxOutputTokens: 1234, temperature: 0.9 } }, F.MODELLI.TITOLARE)));
    assert.deepStrictEqual(prima, { model: F.MODELLI.TITOLARE, messages: [{ role: 'user', content: 'Ciao' }], temperature: 0.3, max_tokens: 1234, frequency_penalty: 0.3, presence_penalty: 0.1 });
    const conVisione = JSON.parse(JSON.stringify(B.translatePayload(payload, F.MODELLI.CONTROLLO, { immagini: true })));
    assert.deepStrictEqual([conVisione.frequency_penalty, conVisione.presence_penalty], [0.3, 0.1], 'la visione (0066) chiama con immagini:true e tiene le penalità');
    assert.deepStrictEqual([JSON.parse(JSON.stringify(B.translatePayload(payload, F.MODELLI.CONTROLLO, { immagini: true, penalita: true }))).frequency_penalty], [0.3]);
});

/* ══════════════════════════════════════════════════════════════════════════════
   LOTTO 3 — il modulo `mappai-figure.js` in una vm, col core e il ponte VERI, davanti a un pdf.js finto (pagine della
   fixture del banco), un canvas finto (il ritaglio porta il suo nome nel data URL; la quota a tinte piatte viene dalla
   fixture), un Tesseract finto (le parole sintetiche della fixture) e un `electronAPI` finto che registra ogni chiamata.
   ⚠️ Negli assert sul DOM finto solo booleani, testi e numeri, mai l'elemento (trappola dei test col DOM finto).
   ══════════════════════════════════════════════════════════════════════════════ */
const eqJ = (a, b, m) => assert.deepStrictEqual(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(b)), m);
function casaModulo(cfg) {
    cfg = cfg || {};
    const vm = require('node:vm'), fs = require('node:fs'), path = require('node:path');
    const RAD = path.join(__dirname, '..');
    const chiamate = { infomaniak: [], gemini: [], usage: [], toast: [], salvati: [], letti: [] };
    const risposte = cfg.risposte || {};               // { modello: (payload, k) => testo | Promise }
    const ls = Object.assign({}, cfg.localStorage || {});
    const ctx = {
        console: { warn() { }, log() { }, error() { } },
        setTimeout, clearTimeout, Promise, Math, Date, JSON, Object, Array, String, Number, RegExp, Error, Uint8Array, ArrayBuffer,
        performance: { now: () => Date.now() },
        btoa: s => Buffer.from(s, 'binary').toString('base64'), atob: s => Buffer.from(s, 'base64').toString('binary'),
        escape: s => s, decodeURIComponent: s => s,
        localStorage: { getItem: k => (k in ls ? ls[k] : null), setItem: (k, v) => { ls[k] = String(v); } },
        document: { getElementById: () => null, createElement: () => canvasFinto() },
        appState: Object.assign({ aiProvider: 'infomaniak', infomaniakProductId: '105999' }, cfg.appState || {}),
        showToast: (m, tipo) => chiamate.toast.push({ m, tipo }),
        getProviderKey: p => (p === 'infomaniak' ? (cfg.tokenInfomaniak == null ? 'TokInfomaniakDiProva_0123' : cfg.tokenInfomaniak) : (cfg.chiaveGoogle == null ? '' : cfg.chiaveGoogle)),
        getMapLanguage: () => cfg.lingua || 'it',
        systemPromptsConfig: JSON.parse(fs.readFileSync(path.join(RAD, 'prompts_config.json'), 'utf8')),
        MappAIVisioneModello: { modello: () => 'Qwen/Qwen3.5-122B-A10B-FP8' },
        MappAIUsage: { record: r => chiamate.usage.push(r), setContext() { }, current: () => ({ cat: 'pipeline', sub: 'figure' }) },
        MappAICatalogo: require('../public/js/mappai-catalogo-core.js'),
        MappAIFigureCore: F,
        MappAIFilesCore: FILES_CORE,
        electronAPI: {
            listInfomaniakModels: () => Promise.resolve(cfg.catalogo === null ? null : (cfg.catalogo || CATALOGO)),
            generateInfomaniak: ({ apiKey, payload, productId }) => {
                const k = chiamate.infomaniak.push({ apiKey, payload, productId });
                const f = risposte[payload.model] || (() => '[TESTO]\nriga letta');
                return Promise.resolve(f(payload, k)).then(testo => ({ model: payload.model, choices: [{ message: { content: testo }, finish_reason: 'stop' }], usage: { prompt_tokens: 410, completion_tokens: 50, total_tokens: 460 } }));
            },
            generateGemini: ({ apiKey, payload, model }) => {
                const k = chiamate.gemini.push({ apiKey, payload, model });
                const f = risposte[model] || (() => '[TESTO]\nriga letta da Google');
                return Promise.resolve(f(payload, k)).then(testo => ({ candidates: [{ content: { parts: [{ text: testo }] }, finishReason: 'STOP' }], usageMetadata: { promptTokenCount: 1330, candidatesTokenCount: 80, totalTokenCount: 1410 }, modelVersion: model }));
            },
            readVaultFile: d => {
                chiamate.letti.push(d);
                if (cfg.disco) {   // 0114: un disco finto con le stesse guardie di read-vault-file (main.js), condiviso fra due «sedute»
                    const safe = FILES_CORE.sanitizeVaultRelPath(d.relPath), k = d.vaultPath + '|' + safe;
                    if (!safe) return Promise.resolve({ ok: false, error: 'percorso non valido: ' + d.relPath });
                    return Promise.resolve(k in cfg.disco ? { ok: true, base64: Buffer.from(cfg.disco[k]).toString('base64') } : { ok: false, error: 'file non trovato: ' + safe });
                }
                return Promise.resolve(cfg.dossierSuDisco ? { ok: true, base64: Buffer.from(JSON.stringify(cfg.dossierSuDisco)).toString('base64') } : { ok: false, error: 'file non trovato' });
            },
            saveVaultFile: d => {
                chiamate.salvati.push(d);
                if (cfg.disco) {   // come save-vault-file: il percorso passa da FilesCore.sanitizeVaultRelPath, altrimenti rifiuta
                    const safe = FILES_CORE.sanitizeVaultRelPath(d.relPath);
                    if (!safe) return Promise.resolve({ ok: false, error: 'percorso non valido: ' + d.relPath });
                    cfg.disco[d.vaultPath + '|' + safe] = String(d.text);
                }
                return Promise.resolve({ ok: true });
            },
            // la forma vera di files-root-get (main.js): `rootDir` solo coi file organizzati, altrimenti Documenti + «MappAI - file»
            filesRootGet: cfg.radice === undefined ? undefined : () => Promise.resolve(cfg.radiceInfo || (cfg.radice === null
                ? { organized: false, rootDir: null, documentsDir: null }
                : { organized: true, filesRoot: cfg.radice.replace(/\/MappAI - file$/, ''), rootDir: cfg.radice, documentsDir: '/Users/altro/Documents' }))
        }
    };
    ctx.window = ctx; ctx.self = ctx; ctx.globalThis = ctx;
    vm.createContext(ctx);
    vm.runInContext(fs.readFileSync(path.join(RAD, 'public', 'js', 'infomaniak_bridge.js'), 'utf8'), ctx);
    vm.runInContext(fs.readFileSync(path.join(RAD, 'public', 'js', 'mappai-figure.js'), 'utf8'), ctx);
    const M = ctx.MappAIFigure;
    // il canvas finto: ricorda che cosa ci si disegna; il data URL porta la chiave del ritaglio; i pixel seguono la quota della fixture
    function canvasFinto() {
        const c = { width: 1, height: 1, _chiave: null, _tinte: 0.5 };
        c.getContext = () => ({
            fillRect() { }, fillStyle: '',
            drawImage(src) { c._chiave = src._chiave; c._tinte = src._tinte; },
            getImageData(x, y, w, h) {
                const n = w * h, d = new Uint8ClampedArray(n * 4), piatti = Math.ceil(n * c._tinte);
                for (let i = 0; i < n; i++) { const v = i < piatti ? (i % 8) * 32 : 8 + ((i * 7919) % 200); d[i * 4] = v; d[i * 4 + 1] = i < piatti ? 0 : (i * 31) % 256; d[i * 4 + 2] = i < piatti ? 0 : (i * 97) % 256; d[i * 4 + 3] = 255; }
                return { data: d };
            }
        });
        c.toDataURL = () => 'data:image/jpeg;base64,' + Buffer.from(String(c._chiave || 'nessuno')).toString('base64');
        return c;
    }
    M._deps.impronta = () => cfg.impronta || 'impr0113';
    // il pdf finto dalla fixture: ogni pagina rende i ritagli nell'ordine in cui il core li chiede
    function pdfFinto(id) {
        const pdf = pdfDi(id), contatori = {};
        const pagineCore = pdf.elenco.map(paginaCore);
        const doc = { numPages: pdf.elenco.length, getPage: n => Promise.resolve(paginaFinta(n)) };
        function paginaFinta(n) {
            const p = pagineCore[n - 1];
            return { getViewport: () => ({ width: p.larghezza, height: p.altezza, transform: [1, 0, 0, -1, 0, p.altezza] }),
                render: ({ canvasContext, transform }) => {
                    contatori[n] = (contatori[n] || 0) + 1;
                    const x = -transform[4] / transform[0], y = -transform[5] / transform[3];
                    // il ritaglio del core taglia il margine dove c'è testo: si riconosce dall'oggetto che contiene (x, y ≤ oggetto, entro il 3 % + arrotondamento)
                    const crop = SMIST.ritagli.find(r => r.pdf === id && r.pagina === n && r.sorgente === 'xobject' && r.oggettoPt
                        && x <= r.oggettoPt[0] + 0.2 && y <= r.oggettoPt[1] + 0.2 && x >= r.oggettoPt[0] - r.oggettoPt[2] * 0.035 - 0.2 && y >= r.oggettoPt[1] - r.oggettoPt[3] * 0.035 - 0.2);
                    const canvas = canvasContext && canvasContextCanvas(canvasContext);
                    canvas._chiave = crop ? crop.pdf + '|' + crop.nome : id + '|p' + n + '|' + Math.round(x) + ',' + Math.round(y);
                    canvas._tinte = crop ? crop.tintePiatte : 0.5;
                    return { promise: Promise.resolve() };
                }, cleanup() { } };
        }
        const S = F.statiPdf(pagineCore);
        const prova = { versione: M.VERSIONE, impronta: cfg.impronta || 'impr0113', nome: id + '.pdf', numPagine: pdf.elenco.length, pdfScansione: S.pdfScansione, pagineScansione: S.pagineScansione, ms: 0, _pdf: doc,
            pagine: pagineCore.map((p, i) => { const st = S.stati[i]; return { numero: p.numero, larghezza: p.larghezza, altezza: p.altezza, caratteri: p.caratteri, testo: 'tipografico della pagina ' + p.numero, righe: p.righe, stato: st.stato, tuttaPagina: !!st.tuttaPagina, ritagli: F.ritagli(p, { stato: st }), formule: st.formule, blocchi: st.blocchi }; }) };
        return prova;
    }
    const contesti = new WeakMap();
    function canvasContextCanvas(ctx2) { return ctx2._canvas; }
    // il contesto finto deve sapere il suo canvas: lo si aggancia in creaCanvas
    M._deps.creaCanvas = (w, h) => { const c = canvasFinto(); c.width = w; c.height = h; const g = c.getContext(); g._canvas = c; c.getContext = () => g; return c; };
    // Tesseract finto: dal nome del ritaglio alle parole sintetiche della fixture (il tipografico della pagina è «tipografico della pagina N»: nessuna parola in comune → i doppioni si fingono con il testo della pagina)
    const ocrDi = cfg.ocr || (chiave => { const [pdf, nome] = chiave.split('|'); const r = SMIST.ritagli.find(x => x.pdf === pdf && x.nome === nome); return r ? testiSintetici(r).testoTesseract : ''; });
    M._deps.tesseract = () => cfg.senzaTesseract ? null : ({
        createScheduler: () => { const w = []; return { addWorker: x => w.push(x), addJob: (azione, dataUrl) => { const chiave = Buffer.from(dataUrl.slice(dataUrl.indexOf(',') + 1), 'base64').toString(); return Promise.resolve({ data: { text: ocrDi(chiave) } }); }, terminate: () => Promise.resolve() }; },
        createWorker: () => Promise.resolve({ terminate() { } })
    });
    return { M, ctx, chiamate, pdfFinto, ls };
}
// il tipografico delle pagine finte è «tipografico della pagina N»: per i doppioni si passa il testo di pagina della fixture
function provaCon(casa, id, testiPagina) {
    const prova = casa.pdfFinto(id);
    // il tipografico sintetico della fixture (così le pergamene sono doppioni e UDII4 no)
    prova.pagine.forEach(p => {
        const r = SMIST.ritagli.find(x => x.pdf === id && x.pagina === p.numero && x.nelCore);
        if (r) p.testo = testiSintetici(r).testoTipografico;
        if (testiPagina && testiPagina[p.numero]) p.testo = testiPagina[p.numero];
    });
    return prova;
}
// letture sintetiche lunghe quanto basta per la regola R1 (almeno il 40 % delle parole che Tesseract legge sul ritaglio: 112, 36, 114, 332)
const DIDASCALIE = '[FOTO]\nIl re appoggia la spada sulla spalla del cavaliere inginocchiato davanti alla corte riunita nel castello\nLa cerimonia della investitura segna il momento in cui il vassallo riceve il feudo e giura fedeltà al suo signore\nIl giuramento si pronuncia con le mani giunte dentro quelle del signore davanti ai testimoni presenti nella sala';
const SCHEMA_4 = '[SCHEMA]\nIMPERATORE\nfeudi reali\nVASSALLO\nvalvassore\nvalvassore\nvalvassino\nvalvassino\nvalvassino\nvalvassino\ncavalieri e contadini\nterre in cambio di protezione\nIMPERATORE → VASSALLO: dona dei feudi';
const SCHEMA_3 = SCHEMA_4.replace('\nvalvassino\nvalvassino\nvalvassino\nvalvassino', '\nvalvassino\nvalvassino\nvalvassino');
const ESERCIZIO = '[ESERCIZIO]\n' + Array.from({ length: 8 }, (_, i) => (i + 1) + ') Osserva i signori al livello più basso della piramide feudale e spiega con parole tue da chi dipendono e che cosa devono al loro signore in cambio delle terre ricevute').join('\n');
const COLONNA_LETTA = '[DOCUMENTO]\nA. Se qualcuno dei nostri fedeli chiederà aiuto a un vassallo per difendere le sue terre dai nemici\nB. Se qualcuno vorrà abbandonare il suo signore senza una colpa provata davanti ai giudici del regno\nC. Il signore dona un castello al vassallo fedele che lo ha servito con le armi per molti anni\nD. Il vassallo che tradisce perde il feudo e le terre tornano al signore che le aveva concesse';
const GEMMA_UDII4 = { 'p1-1': DIDASCALIE, 'p2-1': SCHEMA_4, 'p2-2': COLONNA_LETTA, 'p3-1': ESERCIZIO };
const QWEN_UDII4 = { 'p1-1': DIDASCALIE, 'p2-1': SCHEMA_3, 'p2-2': COLONNA_LETTA, 'p3-1': ESERCIZIO };
function nomeDiPayload(payload) { const img = payload.messages[0].content.find(c => c.type === 'image_url').image_url.url; const chiave = Buffer.from(img.slice(img.indexOf(',') + 1), 'base64').toString(); return chiave.split('|')[1] || ''; }
function paginaDiPayload(payload) { const m = /^p(\d+)/.exec(nomeDiPayload(payload)); return m ? Number(m[1]) : 0; }

test('lotto 3, il modulo: attiva legge l\'interruttore e l\'origine; spento o fuori da CREA nessuna chiamata; le lingue di Tesseract', () => {
    const casa = casaModulo({ localStorage: { mappai_figure: '0' } });
    assert.strictEqual(casa.M.attiva('crea'), false);
    const prova = provaCon(casa, 'UDII4_Lezione3');
    return casa.M.leggi(prova, { origine: 'crea' }).then(u => {
        assert.strictEqual(u.spento, true);
        assert.strictEqual(casa.chiamate.infomaniak.length + casa.chiamate.gemini.length, 0);
        const casa2 = casaModulo();
        assert.strictEqual(casa2.M.attiva('crea'), true);
        assert.strictEqual(casa2.M.attiva('elabora'), false);
        assert.strictEqual(casa2.M.lingueOcr(), 'ita', 'ita di serie');
        assert.strictEqual(casaModulo({ lingua: 'en' }).M.lingueOcr(), 'ita+eng', 'eng solo con le mappe in inglese');
        return casa2.M.leggi(provaCon(casa2, 'UDII4_Lezione3'), { origine: 'elabora' }).then(u2 => { assert.strictEqual(u2.spento, true); assert.strictEqual(casa2.chiamate.infomaniak.length, 0); });
    });
});

test('lotto 3, il modulo su UDII4: decisioni locali (4 ritagli «testo»), 8 chiamate Infomaniak (titolare e controllo insieme, penalità 0, immagine e prompt della console), Registro «pipeline/figure», blocchi coi marcatori, dossier; la seconda volta zero chiamate', () => {
    const casa = casaModulo({ risposte: { [F.MODELLI.TITOLARE]: p => GEMMA_UDII4[nomeDiPayload(p)], [F.MODELLI.CONTROLLO]: p => QWEN_UDII4[nomeDiPayload(p)] } });
    const prova = provaCon(casa, 'UDII4_Lezione3');
    return casa.M.decidi(prova).then(pr => {
        assert.strictEqual(pr.decisioni.length, 4);
        eqJ(pr.decisioni.map(d => [d.caso, d.chiamate]), [[3, 2], [3, 2], [3, 2], [3, 2]]);
        assert.ok(pr.pagine[0].ritagli[0].immagine && /^data:image\/jpeg;base64,/.test(pr.pagine[0].ritagli[0].immagine.dataUrl));
        assert.strictEqual(pr.pagine[0].ritagli[0].immagine.qualita, 85);
        const avanz = [];
        return casa.M.leggi(pr, { origine: 'crea', nome: 'UDII4_Lezione3.pdf', onProgresso: (k, n) => avanz.push([k, n]) }).then(u => {
            assert.strictEqual(casa.chiamate.gemini.length, 0, 'mai Google su un PDF nato digitale con Infomaniak');
            assert.strictEqual(casa.chiamate.infomaniak.length, 8, 'titolare e controllo per ciascuno dei 4 ritagli');
            const modelli = casa.chiamate.infomaniak.map(c => c.payload.model).sort();
            eqJ(modelli, [F.MODELLI.CONTROLLO, F.MODELLI.CONTROLLO, F.MODELLI.CONTROLLO, F.MODELLI.CONTROLLO, F.MODELLI.TITOLARE, F.MODELLI.TITOLARE, F.MODELLI.TITOLARE, F.MODELLI.TITOLARE]);
            casa.chiamate.infomaniak.forEach(c => {
                eqJ([c.payload.temperature, c.payload.max_tokens, c.payload.frequency_penalty, c.payload.presence_penalty], [0, 2048, 0, 0]);
                assert.strictEqual(c.productId, '105999');
                assert.ok(/^TokInfomaniak/.test(c.apiKey));
                const parti = c.payload.messages[0].content;
                eqJ(parti.map(x => x.type), ['text', 'image_url']);
                assert.ok(parti[0].text.startsWith(casa.ctx.systemPromptsConfig.LETTURA_IMMAGINI_FIGURA_IT), 'il testo della console della chiave FIGURA_IT');
                assert.ok(parti[0].text.indexOf(F.CODA.it.tipo) > 0, 'più la coda del core');
            });
            assert.strictEqual(casa.chiamate.usage.length, 8);
            assert.ok(casa.chiamate.usage.every(r => r.ctx.cat === 'pipeline' && r.ctx.sub === 'figure' && r.provider === 'infomaniak' && r.inTok === 410 && r.outTok === 50));
            eqJ(avanz[avanz.length - 1], [4, 4]);
            // i blocchi: p.2 ha lo schema coi 4 valvassini contro 3 → giallo col segno; p.1 e p.3 verdi
            const p2 = u.pagine.find(p => p.numero === 2);
            assert.ok(p2.blocco.startsWith('[Figure della pagina 2] ' + F.LEGENDA.it + ' '), p2.blocco);
            assert.ok(p2.blocco.indexOf('IMPERATORE feudi reali VASSALLO valvassore valvassore valvassino valvassino valvassino ⟦da controllare: valvassino⟧ cavalieri e contadini') > 0, p2.blocco);
            assert.ok(p2.blocco.endsWith(' [/Figure]'));
            assert.ok(!/\n/.test(p2.blocco), 'una riga sola');
            const p1 = u.pagine.find(p => p.numero === 1);
            assert.strictEqual(p1.blocco, '[Figure della pagina 1] ' + DIDASCALIE.split('\n').slice(1).join(' ') + '. [/Figure]');
            assert.strictEqual(u.pagine.find(p => p.numero === 3).testoSostitutivo, null);
            // il dossier
            const d = u.dossier;
            eqJ([d.versione, d.impronta, d.file, d.pagine, d.ritagli.length], [1, 'impr0113', 'Fonti/UDII4_Lezione3.pdf', 3, 4]);
            eqJ(d.ritagli.map(r => r.stato), ['verde', 'giallo', 'verde', 'verde']);
            eqJ(d.ritagli.map(r => r.chiamate), [2, 2, 2, 2]);
            eqJ(d.ritagli[1].gialle, ['valvassino']);
            assert.ok(d.ritagli.every(r => r.letture.titolare && r.letture.controllo && r.modelli.titolare === F.MODELLI.TITOLARE && r.ppi[0] > 100 && r.qualita === 85));
            assert.ok(d.ritagli.every(r => !/^\//.test(r.identita)));
            eqJ(u.riassunto.chiamate, { [F.MODELLI.TITOLARE]: 4, [F.MODELLI.CONTROLLO]: 4 });
            assert.strictEqual(u.toast, 'Figure: 4 lette, 1 da controllare, 0 escluse, 0 non lette');
            assert.strictEqual(casa.M.dossierDi('impr0113'), d, 'in memoria finché il vault non c\'è');
            // la seconda volta (stesso PDF, altro Output): zero chiamate nuove, stessi blocchi
            return casa.M.leggi(pr, { origine: 'crea', nome: 'UDII4_Lezione3.pdf' }).then(u2 => {
                assert.strictEqual(casa.chiamate.infomaniak.length, 8, 'la stessa pagina non si legge due volte');
                eqJ(u2.pagine.map(p => p.blocco), u.pagine.map(p => p.blocco));
                // il .figure.json si scrive solo quando il vault c'è, con percorsi relativi
                return casa.M.scriviDossier('/tmp/vault-di-prova', 'impr0113').then(res => {
                    eqJ([res.ok, res.relPath], [true, 'Fonti/UDII4_Lezione3.figure.json']);
                    const scritto = JSON.parse(casa.chiamate.salvati[0].text);
                    assert.strictEqual(scritto.file, 'Fonti/UDII4_Lezione3.pdf');
                    assert.ok(!/\/tmp\//.test(casa.chiamate.salvati[0].text), 'mai un percorso assoluto nel dossier');
                    eqJ(scritto.stati, { verdi: 3, gialli: 1, rossi: 0, nonLetti: 0 });
                });
            });
        });
    });
});

test('lotto 3, il modulo sul Miscuglio: il titolo (foto) va al titolare, legge testo → il controllo; la clipart (disegno) «nessun testo» si ferma a 1; 3 chiamate, nessuno stato per la clipart', () => {
    const casa = casaModulo({ risposte: { [F.MODELLI.TITOLARE]: (p, k) => (paginaDiPayload(p) === 1 && k === 1 ? '[TESTO]\nIl miscuglio misterioso' : '[FOTO]\nnessun testo'), [F.MODELLI.CONTROLLO]: () => '[TESTO]\nIl miscuglio misterioso' } });
    const prova = provaCon(casa, '2.2-Il-miscuglio-misterioso');
    return casa.M.decidi(prova).then(pr => {
        eqJ(pr.decisioni.map(d => [d.caso, d.chiamate, d.motivo]), [[4, 1, 'foto'], [5, 1, 'disegno']]);
        return casa.M.leggi(pr, { origine: 'crea', nome: 'miscuglio.pdf' }).then(u => {
            assert.strictEqual(casa.chiamate.infomaniak.length, 3);
            const d = u.dossier;
            eqJ(d.ritagli.map(r => [r.caso, r.chiamate, r.stato]), [[3, 2, 'verde'], [5, 1, null]]);
            assert.ok(/nessun testo/.test(d.ritagli[1].motivo));
            assert.strictEqual(u.pagine[0].blocco, '[Figure della pagina 1] Il miscuglio misterioso. [/Figure]');
            assert.strictEqual(u.riassunto.saltati, 1);
        });
    });
});

test('lotto 3, il modulo: con Google come fornitore Gemini 4 Argon via generateGemini (una lettura, giallo, mai fetchModelAPI); senza chiavi la strada locale («non letto, senza chiave»); mai il token Infomaniak verso Google', () => {
    const casa = casaModulo({ appState: { aiProvider: 'google' }, chiaveGoogle: 'AIzaChiaveGoogleDiProva', tokenInfomaniak: 'TokInfomaniakDiProva_0123', risposte: { [F.MODELLI.GOOGLE]: () => '[SCHEMA]\nIMPERATORE\nVASSALLO' } });
    return casa.M.decidi(provaCon(casa, 'UDII4_Lezione3')).then(pr => casa.M.leggi(pr, { origine: 'crea', nome: 'u.pdf' })).then(u => {
        assert.strictEqual(casa.chiamate.infomaniak.length, 0);
        assert.strictEqual(casa.chiamate.gemini.length, 4, 'una lettura per ritaglio');
        casa.chiamate.gemini.forEach(c => {
            assert.strictEqual(c.model, F.MODELLI.GOOGLE);
            assert.strictEqual(c.apiKey, 'AIzaChiaveGoogleDiProva', 'la chiave Google, mai il token Infomaniak');
            assert.strictEqual(c.payload.generationConfig._respectTemp, undefined, 'le chiavi private del payload non escono');
            eqJ([c.payload.generationConfig.temperature, c.payload.generationConfig.maxOutputTokens], [0, 2048]);
        });
        assert.ok(u.dossier.ritagli.every(r => r.stato === 'giallo' && r.chiamate === 1 && r.modelli.titolare === F.MODELLI.GOOGLE));
        assert.ok(u.pagine[0].blocco.indexOf('⟦da controllare: IMPERATORE VASSALLO. ⟧') > 0, 'con Google tutto porta il segno');
        assert.ok(casa.chiamate.usage.every(r => r.provider === 'google' && r.ctx.sub === 'figure' && r.inTok === 1330));
        const senza = casaModulo({ tokenInfomaniak: '', chiaveGoogle: '' });
        return senza.M.decidi(provaCon(senza, 'UDII4_Lezione3')).then(pr => senza.M.leggi(pr, { origine: 'crea', nome: 'u.pdf' })).then(u2 => {
            assert.strictEqual(senza.chiamate.infomaniak.length + senza.chiamate.gemini.length, 0);
            assert.ok(u2.dossier.ritagli.every(r => r.stato === 'non letto' && r.nota === 'senza chiave'));
            assert.ok(u2.pagine.every(p => p.blocco === ''), 'niente entra senza letture');
        });
    });
});

test('lotto 3, il modulo su una scansione (Aztechi): mai Google da solo; con «Leggi con Google» e la chiave le pagine intere a Gemini col prompt SCANSIONE (giallo); senza, Tesseract e rosso «parziale» fuori dal testo', () => {
    const casa = casaModulo({ chiaveGoogle: 'AIzaChiaveGoogleDiProva', ocr: () => 'parole lette dal solo tesseract sulla pagina', risposte: { [F.MODELLI.GOOGLE]: () => '[TITOLO] Tenochtitlan\n[TESTO] La città sul lago' } });
    const prova = provaCon(casa, 'FOCUS-STORIA-Aztechi');
    assert.strictEqual(prova.pdfScansione, true);
    return casa.M.decidi(prova).then(pr => {
        assert.strictEqual(pr.decisioni.length, 0, 'una scansione non si ritaglia');
        return casa.M.leggi(pr, { origine: 'crea', nome: 'aztechi.pdf' }).then(u => {
            assert.strictEqual(casa.chiamate.gemini.length, 0, 'senza la risposta del docente Google non parte');
            assert.strictEqual(casa.chiamate.infomaniak.length, 0, 'la scansione a Infomaniak non va');
            assert.ok(u.dossier.ritagli.every(r => r.stato === 'rosso' && r.nota === 'parziale' && r.tipo === 'SCANSIONE' && /tesseract/.test(r.letture.titolare)));
            assert.ok(u.pagine.every(p => p.blocco === ''), 'il rosso non entra');
            assert.strictEqual(u.avvisi.scansioni, 4);
            assert.strictEqual(u.dossier.google, null);
            const casa2 = casaModulo({ chiaveGoogle: 'AIzaChiaveGoogleDiProva', risposte: { [F.MODELLI.GOOGLE]: () => '[TITOLO] Tenochtitlan\n[TESTO] La città sul lago' } });
            return casa2.M.decidi(provaCon(casa2, 'FOCUS-STORIA-Aztechi')).then(pr2 => casa2.M.leggi(pr2, { origine: 'crea', nome: 'aztechi.pdf', google: true })).then(u2 => {
                assert.strictEqual(casa2.chiamate.gemini.length, 4, 'quattro pagine intere a Gemini');
                assert.ok(casa2.chiamate.gemini.every(c => c.model === F.MODELLI.GOOGLE && c.payload.contents[0].parts[1].text.startsWith(casa2.ctx.systemPromptsConfig.LETTURA_IMMAGINI_SCANSIONE_IT)));
                assert.ok(u2.dossier.ritagli.every(r => r.stato === 'giallo' && r.chiamate === 1));
                assert.strictEqual(u2.dossier.google, 'si', 'la risposta si ricorda nel .figure.json');
                assert.ok(u2.pagine[0].blocco.indexOf('⟦da controllare: [TITOLO] Tenochtitlan [TESTO] La città sul lago. ⟧') > 0);
                const casa3 = casaModulo({ chiaveGoogle: '' });
                return casa3.M.decidi(provaCon(casa3, 'FOCUS-STORIA-Aztechi')).then(pr3 => casa3.M.leggi(pr3, { origine: 'crea', nome: 'aztechi.pdf', google: true })).then(u3 => {
                    assert.strictEqual(casa3.chiamate.gemini.length, 0, 'senza la chiave Google non parte neanche col sì');
                    assert.ok(u3.dossier.ritagli.every(r => r.stato === 'rosso'));
                });
            });
        });
    });
});

test('lotto 3, il modulo: un errore di rete o un\'attesa oltre il tetto non fermano la generazione (ritaglio «non letto», toast); Tesseract assente → decidono i pixel; «Salta le figure» ferma le chiamate e conserva le fatte', () => {
    const vecchiaAttesa = F.SOGLIE.ATTESA_MS; F.SOGLIE.ATTESA_MS = 40;
    const casa = casaModulo({ risposte: {
        [F.MODELLI.TITOLARE]: (p, k) => (paginaDiPayload(p) === 2 ? new Promise(() => { }) : GEMMA_UDII4[nomeDiPayload(p)]),
        [F.MODELLI.CONTROLLO]: (p) => (paginaDiPayload(p) === 3 ? Promise.reject(new Error('503 TokInfomaniakDiProva_0123 giù')) : QWEN_UDII4[nomeDiPayload(p)]) } });
    return casa.M.decidi(provaCon(casa, 'UDII4_Lezione3')).then(pr => casa.M.leggi(pr, { origine: 'crea', nome: 'u.pdf' })).then(u => {
        F.SOGLIE.ATTESA_MS = vecchiaAttesa;
        const d = u.dossier;
        eqJ(d.ritagli.map(r => r.stato), ['verde', 'non letto', 'non letto', 'non letto'], 'p.2 due attese scadute, p.3 il controllo in errore: una lettura sola');
        assert.ok(/attesa oltre/.test(d.ritagli[1].nota), d.ritagli[1].nota);
        assert.ok(/503/.test(d.ritagli[3].nota) && !/TokInfomaniak/.test(d.ritagli[3].nota), 'il token non finisce nelle note');
        assert.ok(d.ritagli.filter(r => r.stato === 'non letto').every(r => F.dossier.daRileggere(r)), 'si ritentano al CREA successivo');
        assert.strictEqual(u.pagine.find(p => p.numero === 2).blocco, '');
        assert.ok(casa.chiamate.toast.some(t => /non lette/.test(t.m) && t.tipo === 'warning'));
        // Tesseract assente: i casi 3-5 dai pixel (UDII4: tinte 0,52 / 0,61 / 0,70 / 0,74 → foto, foto, disegno, disegno)
        const senza = casaModulo({ senzaTesseract: true });
        return senza.M.decidi(provaCon(senza, 'UDII4_Lezione3')).then(pr => {
            eqJ(pr.decisioni.map(d => [d.caso, d.senzaTesseract]), [[4, true], [4, true], [5, true], [5, true]]);
            // «Salta le figure»: dopo la prima pagina si annulla; le chiamate fatte restano nel dossier
            const casa2 = casaModulo({ risposte: { [F.MODELLI.TITOLARE]: p => GEMMA_UDII4[nomeDiPayload(p)], [F.MODELLI.CONTROLLO]: p => QWEN_UDII4[nomeDiPayload(p)] } });
            let fatte = 0;
            return casa2.M.decidi(provaCon(casa2, 'UDII4_Lezione3')).then(pr2 => casa2.M.leggi(pr2, { origine: 'crea', nome: 'u.pdf', onProgresso: k => { fatte = k; }, annullato: () => fatte >= 1 })).then(u2 => {
                assert.strictEqual(u2.annullato, true);
                assert.ok(casa2.chiamate.infomaniak.length >= 2 && casa2.chiamate.infomaniak.length < 8, 'ferma dopo la prima pagina: ' + casa2.chiamate.infomaniak.length);
                assert.ok(u2.dossier.ritagli.some(r => r.stato === 'verde'), 'i ritagli pagati restano');
            });
        });
    });
});

test('gate 3 (19/10): un 429 di Infomaniak («Rate limit exceeded») si ritenta con attesa, tenendo il posto fra le chiamate in volo; oltre i tentativi il ritaglio resta «non letto»', () => {
    let n = 0;
    const casa = casaModulo({ risposte: { [F.MODELLI.TITOLARE]: p => { n++; if (n <= 2) return Promise.reject(new Error("Infomaniak Error (429): {\"error\":{\"message\":\"Rate limit exceeded, you can contact the support\",\"type\":\"rate_limit_error\"}}")); return GEMMA_UDII4[nomeDiPayload(p)]; }, [F.MODELLI.CONTROLLO]: p => QWEN_UDII4[nomeDiPayload(p)] } });
    casa.M._RITENTI_429.splice(0, 3, 10, 10, 10);
    const t0 = Date.now();
    return casa.M.decidi(provaCon(casa, 'UDII4_Lezione3')).then(pr => casa.M.leggi(pr, { origine: 'crea', nome: 'u.pdf' })).then(u => {
        assert.ok(Date.now() - t0 >= 20, 'ha aspettato prima di ritentare');
        assert.strictEqual(casa.chiamate.infomaniak.length, 10, '8 chiamate più i 2 tentativi ripetuti');
        eqJ(u.dossier.ritagli.map(r => r.stato), ['verde', 'giallo', 'verde', 'verde'], 'nessun ritaglio perso per il 429');
        assert.ok(u.dossier.ritagli.every(r => !r.nota || !/429/.test(r.nota)), 'un 429 superato non lascia una nota');
        // oltre i tre tentativi: «non letto», da ritentare al CREA successivo
        const sempre = casaModulo({ risposte: { [F.MODELLI.TITOLARE]: () => Promise.reject(new Error('Infomaniak Error (429): rate limit')), [F.MODELLI.CONTROLLO]: p => QWEN_UDII4[nomeDiPayload(p)] } });
        sempre.M._RITENTI_429.splice(0, 3, 5, 5, 5);
        return sempre.M.decidi(provaCon(sempre, 'UDII4_Lezione3')).then(pr => sempre.M.leggi(pr, { origine: 'crea', nome: 'u.pdf' })).then(u2 => {
            assert.ok(u2.dossier.ritagli.every(r => r.stato === 'non letto' && /429/.test(r.nota)));
            assert.ok(u2.dossier.ritagli.every(r => F.dossier.daRileggere(r)));
            assert.strictEqual(sempre.chiamate.infomaniak.filter(c => c.payload.model === F.MODELLI.TITOLARE).length, 16, '4 ritagli × 4 tentativi del titolare');
        });
    });
});

test('lotto 3, il modulo: la stima prima del clic coi prezzi del catalogo (titolare e controllo sommati) e, senza decisioni locali, le formule contate a due', () => {
    const casa = casaModulo();
    return casa.M.decidi(provaCon(casa, 'UDII4_Lezione3')).then(pr => casa.M.stima(pr)).then(s => {
        eqJ([s.daLeggere, s.chiamateMax, s.foto, s.doppioni], [4, 8, 0, 0]);
        assert.strictEqual(s.riga, 'Lettura delle figure: 4 ritagli da leggere (0 foto a una lettura, 0 doppioni saltati)');
        assert.ok(s.costoCHF > 0.003 && s.costoCHF < 0.01, 'circa mezzo centesimo coi prezzi veri del catalogo: ' + s.costoCHF);
        eqJ([s.modelli.titolare, s.modelli.controllo, s.modelli.ripiego], [F.MODELLI.TITOLARE, F.MODELLI.CONTROLLO, false]);
        const t = casaModulo();
        let prT;
        return t.M.decidi(provaCon(t, 'Teoria-diseq')).then(pr => { prT = pr; return t.M.stima(pr); }).then(s2 => {
            eqJ(prT.decisioni.map(d => [d.caso, d.chiamate]), [[2, 0], [2, 0], [5, 1]], 'le due pergamene doppioni, la figura ABCD disegno');
            eqJ([s2.daLeggere, s2.doppioni, s2.disegni, s2.chiamateMax], [3, 2, 1, 5], 'ABCD + due pagine di formule; la stima è un tetto');
            assert.strictEqual(s2.riga, 'Lettura delle figure: 3 ritagli da leggere (0 foto a una lettura, 2 doppioni saltati)');
        });
    });
});

test('lotto 3, il modulo su Teoria diseq e Respirazione: le pergamene a 0 chiamate, ABCD 2, le due pagine di formule 2 + 2 col prompt FORMULE e l\'àncora tipografica, le formule verdi innestate; il testo a immagini letto da Tesseract entra giallo coi suoi marcatori', () => {
    const FORMULE = '1) 2x + 3 > 7 → S = ]2; +∞[\n2) (x)/(6) ≤ 5 − x';
    const casa = casaModulo({ risposte: { [F.MODELLI.TITOLARE]: p => (/Testo tipografico della pagina/.test(p.messages[0].content[0].text) ? FORMULE : '[SCHEMA]\nA\nB\nC\nD\nE\nF\nG'), [F.MODELLI.CONTROLLO]: p => (/Testo tipografico della pagina/.test(p.messages[0].content[0].text) ? FORMULE : '[SCHEMA]\nA\nB\nC\nD\nE\nF\nG') } });
    return casa.M.decidi(provaCon(casa, 'Teoria-diseq')).then(pr => casa.M.leggi(pr, { origine: 'crea', nome: 'teoria.pdf' })).then(u => {
        assert.strictEqual(casa.chiamate.infomaniak.length, 6, 'ABCD 2 + formule 2 + 2; le pergamene 0');
        const d = u.dossier;
        eqJ(d.ritagli.map(r => [r.pagina, r.tipo, r.chiamate, r.stato]), [[1, null, 0, null], [3, null, 0, null], [4, 'FORMULE', 2, 'verde'], [5, 'SCHEMA', 2, 'verde'], [5, 'FORMULE', 2, 'verde']]);
        assert.ok(d.ritagli[0].motivo === 'doppione' && d.ritagli[1].motivo === 'doppione');
        const f = casa.chiamate.infomaniak.filter(c => /Testo tipografico della pagina/.test(c.payload.messages[0].content[0].text));
        assert.strictEqual(f.length, 4);
        assert.ok(f.every(c => /Riscrivi ogni formula in una riga sola/.test(c.payload.messages[0].content[0].text)), 'il prompt FORMULE (predefinito del modulo finché il lotto 6 non lo mette in console)');
        assert.ok(f.every(c => /--- fine del testo tipografico ---/.test(c.payload.messages[0].content[0].text)), 'l\'àncora tipografica della regione');
        eqJ(d.ritagli[2].formule, [{ n: '1', formula: '2x + 3 > 7', soluzione: 'S = ]2; +∞[' }, { n: '2', formula: '(x)/(6) ≤ 5 − x', soluzione: '' }]);
        const p4 = u.pagine.find(p => p.numero === 4);
        assert.ok(typeof p4.testoSostitutivo === 'string' && p4.testoSostitutivo.indexOf('(x)/(6) ≤ 5 − x') >= 0, 'regione verde: le formule entrano al posto delle righe spezzate');
        assert.strictEqual(p4.blocco, '', 'niente blocco [Formule] quando la regione è verde');
        assert.ok(u.pagine.find(p => p.numero === 1).blocco === '' && u.pagine.find(p => p.numero === 3).blocco === '', 'i doppioni non portano testo');
        // Respirazione: 8 pagine «testo a immagini» → blocchi a Tesseract, giallo fisso coi marcatori propri; gli xobject passano dallo smistamento
        const r = casaModulo({ ocr: chiave => (/\|p\d+\|/.test(chiave) ? 'La respirazione è un processo che porta ossigeno alle cellule' : ''), risposte: { [F.MODELLI.TITOLARE]: () => '[FOTO]\nnessun testo' } });
        return r.M.decidi(provaCon(r, '3a-Respirazione')).then(pr2 => r.M.leggi(pr2, { origine: 'crea', nome: 'resp.pdf' })).then(u2 => {
            const p1 = u2.pagine.find(p => p.numero === 1);
            assert.ok(p1.blocco.indexOf('[Testo a immagini della pagina 1, OCR locale] ' + F.LEGENDA.it + ' ⟦da controllare: La respirazione è un processo che porta ossigeno alle cellule') >= 0, p1.blocco);
            assert.ok(p1.blocco.endsWith(' [/Testo a immagini]'));
            assert.strictEqual(u2.pagine.filter(p => /Testo a immagini/.test(p.blocco)).length, 8);
            assert.ok(u2.dossier.ritagli.filter(x => x.tipo === 'TESTO-IMMAGINI').every(x => x.stato === 'giallo' && /OCR locale/.test(x.nota)));
            assert.ok(r.chiamate.infomaniak.length >= 1 && r.chiamate.infomaniak.length <= 4, 'le quattro figure vere di Respirazione: foto e disegni al titolare una volta: ' + r.chiamate.infomaniak.length);
        });
    });
});

test('lotto 3, il modulo: la misura col pdf.js vero (CTM, righe, pixel) sul PDF di UDII4, se c\'è sul disco: gli stessi 4 ritagli della fixture, zero chiamate, meno di un secondo', () => {
    const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
    const pdfPath = path.join(os.homedir(), 'Desktop', 'Analisi', 'TEST VISION', 'quattro-problemi-2026-10-17', 'p3-pdfjs', 'pdf', 'UDII4_Lezione3.pdf');
    if (!fs.existsSync(pdfPath)) return;   // la prova vive solo dove c'è il banco
    const casa = casaModulo();
    const lib = require('../public/js/pdf.min.js');
    lib.GlobalWorkerOptions.workerSrc = path.join(__dirname, '..', 'public', 'js', 'vendor', 'pdf.worker.min.js');
    casa.M._deps.pdfjs = () => lib;
    casa.M._deps.impronta = null;   // la strada vera: senza crypto.subtle, l'impronta del core su un campione dei byte
    const t0 = Date.now();
    return casa.M.misura(new Uint8Array(fs.readFileSync(pdfPath)), { nome: 'UDII4_Lezione3.pdf' }).then(m => {
        // misurata a 0,13 s da sola; il tetto è largo perché la suite gira anche in parallelo ad altre sessioni (1,6 s il 19/10 sotto carico)
        assert.ok(Date.now() - t0 < 8000, 'misura in ' + (Date.now() - t0) + ' ms');
        assert.strictEqual(m.numPagine, 3);
        eqJ(m.pagine.map(p => p.stato), ['ritagli', 'ritagli', 'ritagli']);
        const atteso = pdfDi('UDII4_Lezione3').elenco;
        m.pagine.forEach((p, i) => {
            assert.strictEqual(p.ritagli.length, atteso[i].atteso.ritagli.length);
            p.ritagli.forEach((r, k) => [0, 1, 2, 3].forEach(j => assert.ok(Math.abs(r.oggettoPt[j] - atteso[i].atteso.ritagli[k].rettPt[j]) <= 0.11, 'p' + p.numero + ' ' + r.nome + ': ' + r.oggettoPt + ' ≠ ' + atteso[i].atteso.ritagli[k].rettPt)));
            assert.strictEqual(p.caratteri, atteso[i].caratteri, 'lettere e cifre della pagina ' + p.numero);
            assert.strictEqual(p.righe.length, atteso[i].righe.length, 'righe della pagina ' + p.numero);
            assert.ok(p.testo.length > 50 && !/\n/.test(p.testo));
        });
        eqJ(m.pagine[0].ritagli[0].ppiNativi.map(Math.round), [160, 161]);
        assert.strictEqual(casa.chiamate.infomaniak.length + casa.chiamate.gemini.length, 0);
        assert.ok(/^[0-9a-f]+$/.test(m.impronta));
        return m._pdf.destroy();
    });
});

/* ══════════════════════════════════════════════════════════════════════════════
   LOTTO 4 — l'aggancio in app.js: le funzioni VERE `extractPdfPages`, `extractTextFromPDF`, `handlePDFUpload` e
   `processSourceFile` estratte dal sorgente di app.js e messe nella casa del modulo (core, ponte e modulo veri; pdf.js
   finto con una pagina = un pezzo di testo; MappAIPdfTesto vero). Senza modulo o con l'interruttore spento il
   risultato è identico (inv. 1); in CREA i blocchi delle figure entrano nel testo di ogni pagina, sulla stessa riga.
   ══════════════════════════════════════════════════════════════════════════════ */
const TESTI_UDII4 = { 1: 'Il sistema feudale nasce in Europa dopo la caduta dell\'impero romano e organizza la società in gradi di fedeltà personale.',
    2: 'Il re affida le terre ai suoi vassalli, che a loro volta le concedono ai valvassori e ai valvassini in cambio di servizi militari.',
    3: 'Osserva i signori al livello più basso della piramide e spiega da chi dipendono e che cosa devono al loro signore in cambio.' };
function casaApp(cfg) {
    const casa = casaModulo(cfg);
    const vm = require('node:vm'), fs = require('node:fs'), path = require('node:path');
    const RAD = path.join(__dirname, '..');
    const ctx = casa.ctx;
    vm.runInContext(fs.readFileSync(path.join(RAD, 'public', 'js', 'mappai-pdf-testo-core.js'), 'utf8'), ctx);
    ctx.pdfjsLib = { getDocument: () => ({ promise: Promise.resolve({ numPages: 3, getPage: n => Promise.resolve({
        getTextContent: () => Promise.resolve({ items: [{ str: TESTI_UDII4[n], transform: [11, 0, 0, 11, 57, 700], width: 480, height: 11, hasEOL: false }] }),
        getViewport: () => ({ height: 842, width: 595, convertToViewportPoint: (x, y) => [x, 842 - y] }) }) }) }) };
    ctx.updateTokenCounter = () => { }; ctx.safeCreateIcons = () => { }; ctx.handleSourceAutofill = () => { };
    ctx.document.createElement = () => ({ innerHTML: '', className: '', id: '' });
    const src = fs.readFileSync(path.join(RAD, 'public', 'js', 'app.js'), 'utf8');
    const taglio = (da, a) => { const i = src.indexOf(da), j = src.indexOf(a, i); assert.ok(i > 0 && j > i, 'app.js: non trovo ' + da); return src.slice(i, j); };
    vm.runInContext(taglio('window.extractPdfPages = async function', 'window.getSystemKey = function'), ctx);
    const inizio = src.indexOf('window.handlePDFUpload = async function'), fine = src.indexOf('\n}\n', src.indexOf('window.processSourceFile = async function'));
    vm.runInContext(src.slice(inizio, fine + 3), ctx);
    const file = { name: 'UDII4_Lezione3.pdf', size: 123456, arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)) };
    return Object.assign(casa, { file, estrai: (f, o) => ctx.extractPdfPages(f, o), testo: f => ctx.extractTextFromPDF(f) });
}
const RISPOSTE_UDII4 = { [F.MODELLI.TITOLARE]: p => GEMMA_UDII4[nomeDiPayload(p)], [F.MODELLI.CONTROLLO]: p => QWEN_UDII4[nomeDiPayload(p)] };

test('lotto 4: in CREA il testo della pagina 2 di UDII4 contiene i marcatori e i quattro valvassini, sulla stessa riga della pagina, in `pages` e in `testoPerModello`; il corpus dopo stripBoilerplate + stripStructuralLines li conserva (IT ed EN); extractTextFromPDF non cambia', () => {
    const B = require('../public/js/mappai-boilerplate-core.js');
    const giro = lingua => {
        const casa = casaApp({ risposte: RISPOSTE_UDII4, lingua });
        casa.file._figure = provaCon(casa, 'UDII4_Lezione3');
        return casa.M.decidi(casa.file._figure).then(() => casa.estrai(casa.file, { origine: 'crea' })).then(r => {
            const m = F.MARC[lingua].figure;
            assert.strictEqual(r.pages.length, 3);
            const p2 = r.pages[1].text;
            assert.ok(p2.startsWith(TESTI_UDII4[2] + ' ' + m[0].replace('N', '2') + ' '), lingua + ': il blocco accodato sulla stessa riga: ' + p2);
            assert.ok(p2.endsWith(' ' + m[1]) && !/\n/.test(p2));
            assert.strictEqual((p2.match(/valvassino\b/g) || []).length, 4, lingua + ': i quattro valvassini letti (il testo della pagina dice «valvassini»)');
            assert.ok(p2.indexOf('IMPERATORE') > 0 && p2.indexOf('VASSALLO') > 0 && p2.indexOf(F.SEGNO_APRE + 'valvassino' + F.SEGNO_CHIUDE) > 0);
            assert.ok(r.pages[0].text.indexOf(m[0].replace('N', '1')) > 0 && r.pages[2].text.indexOf(m[0].replace('N', '3')) > 0, 'anche p.1 e p.3 hanno il loro blocco');
            assert.strictEqual(r.text, r.pages.map(p => p.text).join('\n'));
            assert.strictEqual(r.testoPerModello.split('\n').length, 3);
            assert.ok(r.testoPerModello.split('\n')[1].indexOf(m[0].replace('N', '2')) > 0, 'anche il testo per il modello porta il blocco');
            // come startGeneration: i filtri del corpus sulla fonte intera
            const dopo = B.stripStructuralLines(B.stripBoilerplate(r.testoPerModello).text).text;
            assert.strictEqual(dopo.split('\n').length, 3, lingua + ': i filtri non tolgono nessuna pagina');
            assert.strictEqual((dopo.match(/valvassino\b/g) || []).length, 4);
            assert.ok(dopo.indexOf(m[0].replace('N', '2')) > 0 && dopo.indexOf(F.LEGENDA[lingua]) > 0);
            assert.strictEqual(casa.chiamate.infomaniak.length, 8);
            assert.ok(!('figure' in r), 'il risultato tiene le cinque chiavi di sempre (guardia del 0045)');
            assert.ok(casa.file._letturaFigure && casa.file._letturaFigure.riassunto.lette === 4, 'l\'esito della lettura resta sul file (per il velo e il toast del lotto 5)');
            return casa.testo(casa.file).then(t => {
                assert.ok(t.indexOf('[Figure') < 0 && t.indexOf('[/Figures]') < 0, 'extractTextFromPDF (ELABORA, Espandi con AI) non legge le figure');
                assert.strictEqual(casa.chiamate.infomaniak.length, 8, 'e non chiama nessuno');
            });
        });
    };
    return giro('it').then(() => giro('en'));
});

test('lotto 4: senza modulo, con `mappai_figure = \'0\'`, o fuori da CREA, extractPdfPages è identico a oggi (stesso risultato, nessuna chiamata, nessuna chiave in più)', () => {
    const base = casaApp({ risposte: RISPOSTE_UDII4 });
    delete base.ctx.MappAIFigure;
    return base.estrai(base.file).then(r0 => {
        const j0 = JSON.stringify(r0);
        assert.ok(j0.indexOf('[Figure') < 0 && !('figure' in r0) && base.file._letturaFigure === undefined);
        assert.strictEqual(r0.pages[1].text, TESTI_UDII4[2]);
        return base.estrai(base.file, { origine: 'crea' }).then(r1 => {
            assert.strictEqual(JSON.stringify(r1), j0, 'senza il modulo (il reader) anche con origine crea');
            const spenta = casaApp({ risposte: RISPOSTE_UDII4, localStorage: { mappai_figure: '0' } });
            spenta.file._figure = provaCon(spenta, 'UDII4_Lezione3');
            return spenta.estrai(spenta.file, { origine: 'crea' }).then(r2 => {
                assert.strictEqual(JSON.stringify(r2), j0, 'interruttore spento');
                assert.strictEqual(spenta.chiamate.infomaniak.length, 0);
                const elabora = casaApp({ risposte: RISPOSTE_UDII4 });
                elabora.file._figure = provaCon(elabora, 'UDII4_Lezione3');
                return elabora.estrai(elabora.file, { origine: 'elabora' }).then(r3 => {
                    assert.strictEqual(JSON.stringify(r3), j0, 'fuori da CREA');
                    assert.strictEqual(elabora.chiamate.infomaniak.length, 0);
                    // mappai_strip_boilerplate = '0' non è una via d'uscita per i marcatori: i blocchi entrano lo stesso
                    const senzaFiltro = casaApp({ risposte: RISPOSTE_UDII4, localStorage: { mappai_strip_boilerplate: '0' } });
                    senzaFiltro.file._figure = provaCon(senzaFiltro, 'UDII4_Lezione3');
                    return senzaFiltro.M.decidi(senzaFiltro.file._figure).then(() => senzaFiltro.estrai(senzaFiltro.file, { origine: 'crea' })).then(r4 => {
                        assert.ok(r4.pages[1].text.indexOf('[Figure della pagina 2]') > 0);
                        assert.strictEqual(r4.testoPerModello, r4.text, 'col filtro spento il testo per il modello è il testo intero, blocchi compresi');
                    });
                });
            });
        });
    });
});

test('lotto 4: handlePDFUpload e processSourceFile fanno la prova a secco al caricamento e la conservano sulla fonte e sul file, senza chiamate; spenta, niente prova; un guasto della prova non ferma il caricamento', () => {
    const casa = casaApp({ risposte: RISPOSTE_UDII4 });
    const provaFinta = provaCon(casa, 'UDII4_Lezione3');
    let chiamateProva = 0;
    casa.M.prova = () => { chiamateProva++; return Promise.resolve(provaFinta); };
    casa.ctx.appState.sources = [{ id: 's1', type: 'pdf' }];
    const input = { files: [casa.file], dataset: { sourceId: 's1' }, parentNode: { appendChild() { } } };
    const tick = () => new Promise(r => setTimeout(r, 20));
    return casa.ctx.handlePDFUpload(input).then(tick).then(() => {
        const s = casa.ctx.appState.sources[0];
        assert.strictEqual(s.content, Object.values(TESTI_UDII4).join('\n'), 'il testo della fonte come oggi, senza blocchi');
        assert.strictEqual(chiamateProva, 1);
        assert.strictEqual(s._figure, provaFinta); assert.strictEqual(casa.file._figure, provaFinta);
        assert.strictEqual(casa.chiamate.infomaniak.length + casa.chiamate.gemini.length, 0, 'la prova a secco non chiama nessuno');
        // processSourceFile (il bottone Documenti)
        const s2 = { id: 's2', type: 'doc' }, statusEl = { innerHTML: '' }, file2 = { name: 'altra.pdf', size: 10, arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)) };
        return casa.ctx.processSourceFile(s2, file2, statusEl).then(tick).then(() => {
            assert.strictEqual(chiamateProva, 2);
            assert.strictEqual(s2._figure, provaFinta); assert.strictEqual(file2._figure, provaFinta);
            assert.ok(/pronto/.test(statusEl.innerHTML));
            // spenta: niente prova
            const spenta = casaApp({ localStorage: { mappai_figure: '0' } });
            let n = 0; spenta.M.prova = () => { n++; return Promise.resolve(provaFinta); };
            spenta.ctx.appState.sources = [{ id: 's1', type: 'pdf' }];
            return spenta.ctx.handlePDFUpload({ files: [spenta.file], dataset: { sourceId: 's1' }, parentNode: { appendChild() { } } }).then(tick).then(() => {
                assert.strictEqual(n, 0);
                assert.strictEqual(spenta.ctx.appState.sources[0]._figure, undefined);
                // un guasto della prova: la fonte si carica lo stesso
                const rotta = casaApp({});
                rotta.M.prova = () => Promise.reject(new Error('pdf.js rotto'));
                rotta.ctx.appState.sources = [{ id: 's1', type: 'pdf' }];
                return rotta.ctx.handlePDFUpload({ files: [rotta.file], dataset: { sourceId: 's1' }, parentNode: { appendChild() { } } }).then(tick).then(() => {
                    assert.strictEqual(rotta.ctx.appState.sources[0].content, Object.values(TESTI_UDII4).join('\n'));
                    assert.strictEqual(rotta.ctx.appState.sources[0]._figure, undefined);
                });
            });
        });
    });
});

/* ══════════════════════════════════════════════════════════════════════════════
   LOTTO 7 — le prove del banco (fixture di soli numeri e rettangoli, regola dello 0044)
   e i casi sintetici del §9.2 dell'ADR 0024.
   `pagine.json`: i descrittori pdf.js dei 9 PDF del banco (114 pagine) con l'atteso delle regole del banco
   (prova B3 del 17/10) e i due delta dell'ADR; le righe portano una CLASSE (L lettere, F formula, X frammento,
   N nessuna), non il testo: qui ogni classe diventa un testo segnaposto che dà lo stesso verdetto ai riconoscitori.
   `smistamento.json`: i 23 ritagli della tornata 4 con le parole di Tesseract, le sequenze già tipografiche, la
   quota a tinte piatte e la risposta vera del titolare; i testi si ricostruiscono dai numeri (parole sintetiche).
   ══════════════════════════════════════════════════════════════════════════════ */
const PAGINE = require('./fixtures/figure/pagine.json');
const SMIST = require('./fixtures/figure/smistamento.json');
const TESTO_CLASSE = { L: 'parola parola parola', F: '2x + 3 > 7', X: 'x', N: '' };
function paginaCore(p) {
    return { numero: p.numero, larghezza: p.larghezza, altezza: p.altezza, caratteri: p.caratteri,
        immagini: p.immagini.map(i => ({ x: i[0], y: i[1], w: i[2], h: i[3], px: i[4] ? [i[4], i[5]] : null })),
        righe: p.righe.map(r => ({ x0: r[0], y0: r[1], x1: r[2], y1: r[3], testo: TESTO_CLASSE[r[4]] })) };
}
const vicino = (a, b, tol) => Math.abs(a - b) <= tol;
const pdfDi = id => PAGINE.pdf.find(p => p.id === id);
const conta = id => { const pdf = pdfDi(id); const pc = pdf.elenco.map(paginaCore); const S = F.statiPdf(pc); return { S, rit: pc.map((p, i) => F.ritagli(p, { stato: S.stati[i] })) }; };

test('pagine.json: le classi delle righe riproducono i riconoscitori del core; 9 PDF, 114 pagine', () => {
    assert.strictEqual(F.frammento(TESTO_CLASSE.X), true); assert.strictEqual(F.rigaFormula(TESTO_CLASSE.X), false);
    assert.strictEqual(F.rigaFormula(TESTO_CLASSE.F), true); assert.strictEqual(F.frammento(TESTO_CLASSE.F), false);
    assert.ok(/\p{L}{3,}/u.test(TESTO_CLASSE.L) && !F.rigaFormula(TESTO_CLASSE.L) && !F.frammento(TESTO_CLASSE.L));
    assert.ok(!F.rigaFormula(TESTO_CLASSE.N) && !F.frammento(TESTO_CLASSE.N) && !/\p{L}{3,}/u.test(TESTO_CLASSE.N));
    assert.strictEqual(PAGINE.pdf.length, 9);
    assert.strictEqual(PAGINE.pdf.reduce((s, p) => s + p.elenco.length, 0), 114);
    const src = JSON.stringify(PAGINE);
    assert.ok(!/\/Users\//.test(src) && !/\.pdf/.test(src), 'niente percorsi');
});

test('pagine.json: su 114 pagine stati, gruppi, tenuti, rettangoli, ppi, blocchi e regioni di formule come l\'atteso del banco (prova a secco, zero chiamate)', () => {
    const t0 = Date.now();
    let pagine = 0, ritagli = 0, maxTenuti = 0;
    PAGINE.pdf.forEach(pdf => {
        const pc = pdf.elenco.map(paginaCore);
        const S = F.statiPdf(pc);
        assert.strictEqual(S.pdfScansione, pdf.pdfScansione, pdf.id + ': pdfScansione');
        pdf.elenco.forEach((p, i) => {
            const a = p.atteso, st = S.stati[i], dove = pdf.id + ' p' + p.numero;
            pagine++;
            assert.strictEqual(st.stato, a.stato, dove + ': stato ' + st.stato + ' ≠ ' + a.stato);
            assert.strictEqual(st.gruppi.length, a.gruppi, dove + ': gruppi');
            assert.strictEqual(st.tenuti.length, a.tenuti, dove + ': tenuti');
            assert.strictEqual(!!st.tuttaPagina, !!a.tuttaPagina, dove + ': figura a tutta pagina');
            maxTenuti = Math.max(maxTenuti, st.tenuti.length);
            const r = F.ritagli(pc[i], { stato: st });
            assert.strictEqual(r.length, a.ritagli.length, dove + ': ritagli ' + r.length + ' ≠ ' + a.ritagli.length);
            r.forEach((x, k) => {
                const e = a.ritagli[k];
                [0, 1, 2, 3].forEach(j => assert.ok(vicino(x.oggettoPt[j], e.rettPt[j], 0.11), dove + ' ' + x.nome + ': rettangolo ' + JSON.stringify(x.oggettoPt) + ' ≠ ' + JSON.stringify(e.rettPt)));
                assert.strictEqual(x.membri, e.membri, dove + ' ' + x.nome + ': membri');
                // i ppi che contano sono quelli limitati 110-220 (i rettangoli della fixture sono al decimo di punto: sui tasselli minuscoli i nativi oscillano)
                const ppiAtteso = F.ppiLimitato(e.ppiNativi);
                assert.ok(vicino(x.ppi[0], ppiAtteso[0], Math.max(1, ppiAtteso[0] * 0.01)) && vicino(x.ppi[1], ppiAtteso[1], Math.max(1, ppiAtteso[1] * 0.01)), dove + ' ' + x.nome + ': ppi ' + x.ppi + ' ≠ ' + ppiAtteso);
                const ppiMax = Math.max(x.ppi[0], x.ppi[1]);
                assert.ok(ppiMax >= F.SOGLIE.PPI_MIN - 0.001 && ppiMax <= F.SOGLIE.PPI_MAX + 0.001, dove + ': ppi limitati (asse maggiore) ' + x.ppi);
                assert.ok(vicino(x.ppi[0] / x.ppi[1], x.ppiNativi[0] / x.ppiNativi[1], 0.002), dove + ': i due assi scalano insieme');
                assert.ok(x.rett.x >= -0.01 && x.rett.y >= -0.01 && x.rett.x + x.rett.w <= p.larghezza + 0.01 && x.rett.y + x.rett.h <= p.altezza + 0.01, dove + ': il ritaglio sta nella pagina');
                assert.ok(x.pixel[0] > 0 && x.pixel[1] > 0);
                ritagli++;
            });
            if (a.stato === 'testo-immagini') assert.strictEqual(st.blocchi.length, a.blocchiTestoImmagini, dove + ': blocchi di testo a immagini');
            assert.strictEqual(st.formule.regioni.length, a.formule.length, dove + ': regioni di formule');
            st.formule.regioni.forEach((q, k) => [q.x, q.y, q.w, q.h].forEach((v, j) => assert.ok(vicino(v, a.formule[k][j], 0.15), dove + ': regione ' + k + ' ' + JSON.stringify([q.x, q.y, q.w, q.h]) + ' ≠ ' + JSON.stringify(a.formule[k]))));
            if (a.regionePagina) { const g = st.formule.regionePagina; [g.x, g.y, g.w, g.h].forEach((v, j) => assert.ok(vicino(v, a.regionePagina[j], 0.15), dove + ': regione di pagina')); }
        });
    });
    assert.strictEqual(pagine, 114);
    assert.strictEqual(ritagli, PAGINE.pdf.reduce((s, p) => s + p.elenco.reduce((t, x) => t + x.atteso.ritagli.length, 0), 0));
    assert.ok(maxTenuti <= F.SOGLIE.TETTO_RITAGLI, 'con la soglia del 4 % nessuna pagina del corpus supera il tetto (massimo ' + maxTenuti + ')');
    assert.ok(Date.now() - t0 < 3000, 'la prova a secco del core su 114 pagine: ' + (Date.now() - t0) + ' ms');
});

test('pagine.json: i numeri dell\'ADR 0024 — UDII4 4 ritagli; Teoria diseq 3 ritagli e 2 pagine di formule; Respirazione 8 pagine a immagini e p.7 senza il riquadro; GEO 73 con p.17 a tutta pagina; Aztechi scansione; Miscuglio e Sale con la regola del 4 %', () => {
    const u = conta('UDII4_Lezione3');
    assert.deepStrictEqual(u.rit.map(r => r.length), [1, 2, 1]);
    assert.deepStrictEqual(u.rit[1].map(r => r.nome), ['p2-1', 'p2-2']);
    assert.ok(u.rit.flat().every(r => r.ppiNativi[0] >= 147 && r.ppiNativi[0] <= 161 && vicino(r.ppi[0], r.ppiNativi[0], 0.01)), 'UDII4 fra 148 e 160 ppi nativi: dentro i limiti, non si ridimensiona');
    // il banco (tornata 4) ritagliava col margine pieno; il core lo taglia dove c'è testo (ADR §5.3): stessa larghezza, altezza minore o uguale
    assert.deepStrictEqual(u.rit.flat().map(r => r.pixel[0]), [1137, 1135, 1086, 1097], 'le larghezze in pixel della tornata 4');
    assert.deepStrictEqual(u.rit.flat().map(r => r.marginiTagliati.indexOf('alto') >= 0), [true, true, true, false], 'tre figure su quattro hanno una riga di testo subito sopra');
    const sale = conta('2.-Sale-e-saline-in-Svizzera').rit.flat();
    assert.deepStrictEqual(sale.map(r => Math.max(r.ppi[0], r.ppi[1])), [220, 110, 150.618], 'ppi nativi 220,1 → 220; 97 → 110; 150,6 com\'è');
    // ogni ritaglio del core sta DENTRO il ritaglio della tornata 4 (margine pieno) e non è più grande
    // (solo i quattro PDF del lancio: Respirazione fu ritagliata dopo, senza margine, per Tesseract)
    SMIST.ritagli.filter(r => r.nelCore && r.sorgente === 'xobject' && r.pdf !== '3a-Respirazione').forEach(r => {
        const mio = conta(r.pdf).rit[r.pagina - 1].find(x => vicino(x.oggettoPt[0], r.oggettoPt[0], 0.11) && vicino(x.oggettoPt[1], r.oggettoPt[1], 0.11));
        assert.ok(mio, r.pdf + ' ' + r.nome + ': il ritaglio del banco c\'è anche nel core');
        assert.ok(mio.rett.x >= r.rettPt[0] - 0.11 && mio.rett.y >= r.rettPt[1] - 0.11 && mio.rett.x + mio.rett.w <= r.rettPt[0] + r.rettPt[2] + 0.11 && mio.rett.y + mio.rett.h <= r.rettPt[1] + r.rettPt[3] + 0.11, r.pdf + ' ' + r.nome + ': dentro il ritaglio del banco');
        assert.ok(mio.pixel[0] <= r.pixel[0] + 1 && mio.pixel[1] <= r.pixel[1] + 1, r.pdf + ' ' + r.nome + ': pixel ' + mio.pixel + ' ≤ ' + r.pixel);
    });
    const t = conta('Teoria-diseq');
    assert.deepStrictEqual(t.S.stati.map(s => s.stato), ['ritagli', 'nulla', 'ritagli', 'formule', 'ritagli', 'nulla']);
    assert.strictEqual(t.rit.flat().length, 3, 'le due pergamene e la figura ABCD; la clipart e l\'automobile stanno sotto il 4 %');
    assert.deepStrictEqual(t.S.stati.map(s => s.formule.regioni.length), [0, 0, 0, 3, 1, 0], 'R-D: le due pagine giuste, zero altrove');
    assert.strictEqual(PAGINE.pdf.filter(p => p.id !== 'Teoria-diseq').every(p => p.elenco.every(x => x.atteso.formule.length === 0)), true, 'zero falsi di R-D sugli altri otto PDF');
    const r = conta('3a-Respirazione');
    assert.strictEqual(r.S.stati.filter(s => s.stato === 'testo-immagini').length, 8);
    assert.strictEqual(r.S.stati[8].stato, 'ritagli');
    assert.strictEqual(r.rit[6].length, 1, 'p.7: il riquadro a quadretti è un pattern di riempimento, pdf.js non lo vede (B3)');
    assert.ok(r.S.stati.filter(s => s.stato === 'testo-immagini').every(s => s.blocchi.length >= 1), 'ogni pagina a immagini ha blocchi per Tesseract');
    const g = conta('I-FASCICOLO-SCHEDE-GEO-2024');
    assert.strictEqual(g.rit.flat().length, 73, '72 oggetti più la figura a tutta pagina di p.17');
    assert.deepStrictEqual([g.S.pdfScansione, g.S.stati[16].stato, g.S.stati[16].tuttaPagina, g.rit[16].length, g.rit[16][0].tuttaPagina], [false, 'ritagli', true, 1, true]);
    assert.strictEqual(g.S.stati.filter(s => s.stato === 'nulla').length, 9, 'le pagine di solo testo non costano nulla');
    const az = conta('FOCUS-STORIA-Aztechi');
    assert.strictEqual(az.S.pdfScansione, true);
    assert.ok(az.S.stati.every(s => s.stato === 'scansione'));
    assert.strictEqual(az.rit.flat().length, 0, 'una scansione non si ritaglia: intera a Google su domanda, altrimenti Tesseract');
    const c = conta('06_clima-e-ambienti');
    assert.deepStrictEqual([c.S.pdfScansione, c.S.stati[15].tuttaPagina, c.S.stati[17].tuttaPagina, c.rit.flat().length], [false, true, true, 28]);
    const m = conta('2.2-Il-miscuglio-misterioso');
    assert.strictEqual(m.rit.flat().length, 2, 'il titolo WordArt (tre strati fusi) e la clipart; la foto del puzzle sta sotto il 4 %');
    assert.strictEqual(m.rit[0][0].membri, 3);
    const puzzle = m.S.stati[0].gruppi.map(x => x.areaPct).filter(x => x < 4 && x > 3);
    assert.strictEqual(puzzle.length, 1, 'il puzzle: 3,8 % della pagina');
    assert.strictEqual(conta('2.-Sale-e-saline-in-Svizzera').rit.flat().length, 3, 'quattro foto nel banco, tre col 4 %');
    assert.strictEqual(conta('2.-La-guerra-fredda').rit.flat().length, 21);
});

/* ── smistamento.json: i testi si ricostruiscono dai numeri ───────────────── */
const LETTERE = 'abcdefghijklmnopqrstuvwxyz';
const parolaN = (pref, n) => pref + LETTERE[n % 26] + LETTERE[Math.floor(n / 26) % 26] + LETTERE[Math.floor(n / 676) % 26];
function testiSintetici(r) {
    const tipo = Array.from({ length: r.tipografico.parole }, (_, i) => parolaN('tipo', i));
    const L = r.doppione.presenti > 0 ? r.doppione.presenti + 2 : 0;      // una sequenza copiata di L parole dà L − 2 trigrammi presenti
    const singole = r.tesseract.piene - r.tesseract.nuove - L;               // parole già nel tipografico ma sparse (dalla fine, a passo 2): nessun trigramma
    const tess = tipo.slice(0, L);
    for (let k = 0; k < singole; k++) tess.push(tipo[tipo.length - 1 - 2 * k]);
    for (let k = 0; k < r.tesseract.nuove; k++) tess.push(parolaN('nuova', k));
    for (let k = 0; k < r.tesseract.parole - r.tesseract.piene; k++) tess.push('ab');
    return { testoTesseract: tess.join(' '), testoTipografico: tipo.join(' ') };
}
const misuraDi = r => Object.assign({ formule: r.sorgente === 'formule', tesseractCaricato: true, tintePiatte: r.tintePiatte }, testiSintetici(r));

test('smistamento.json: i 23 ritagli del banco smistati come il §9.1 dell\'ADR; i numeri della fixture si riproducono col core; dopo il titolare i conti del gate', () => {
    assert.strictEqual(SMIST.ritagli.length, 23);
    const totali = {};
    SMIST.ritagli.forEach(r => {
        const m = misuraDi(r), dove = r.pdf + ' ' + r.nome;
        assert.strictEqual(F.parole(m.testoTesseract).length, r.tesseract.parole, dove + ': parole');
        assert.strictEqual(F.parole(m.testoTesseract).filter(F.parolaPienaLettere).length, r.tesseract.piene, dove + ': parole piene');
        const d = F.doppione(m.testoTesseract, m.testoTipografico);
        assert.deepStrictEqual([d.sequenze, d.presenti], [r.doppione.sequenze, r.doppione.presenti], dove + ': sequenze del doppione');
        const s = F.smista(m);
        assert.deepStrictEqual([s.caso, s.chiamate, s.motivo], [r.atteso.caso, r.atteso.chiamate, r.atteso.motivo], dove + ': smistato ' + JSON.stringify([s.caso, s.chiamate, s.motivo]) + ' atteso ' + JSON.stringify(r.atteso));
        if (s.caso === 3) assert.strictEqual(s.paroleNuove, r.tesseract.nuove, dove + ': parole nuove');
        // la risposta vera del titolare (Gemma 4 31B): «nessun testo» ferma, testo letto chiama il controllo
        if (r.titolare) {
            const dopo = F.dopoTitolare(s, F.lettore('[' + r.titolare.tipo + ']\n' + (r.titolare.nessunTesto ? 'nessun testo' : 'riga letta')));
            assert.strictEqual(dopo.chiamate, r.atteso.dopoTitolare, dove + ': chiamate dopo il titolare');
            if (r.nelCore) totali[r.pdf] = (totali[r.pdf] || 0) + dopo.chiamate;
        } else assert.strictEqual(r.atteso.dopoTitolare, null, dove + ': mai mandato nella tornata 4');
        // Tesseract non caricato: decidono i pixel (formule a parte)
        const senza = F.smista({ formule: m.formule, tesseractCaricato: false, testoTesseract: null, testoTipografico: m.testoTipografico, tintePiatte: r.tintePiatte });
        assert.strictEqual(senza.caso, m.formule ? 1 : r.tintePiatte < F.SOGLIE.TINTE_PIATTE ? 4 : 5, dove + ': senza Tesseract');
    });
    // i conti del gate 3 (ADR §9.1, con la regola del 4 %): UDII4 8; Miscuglio titolo 2 + clipart «nessun testo» 1; Sale e saline 3 «nessun testo»; Teoria diseq pergamene 0 + ABCD 2 + formule 2 + 2
    assert.deepStrictEqual(totali, { 'UDII4_Lezione3': 8, '2.2-Il-miscuglio-misterioso': 3, '2.-Sale-e-saline-in-Svizzera': 3, 'Teoria-diseq': 6 });
    // fuori dal core con la regola del 4 % (nessuna clausola sui pixel): il puzzle, il cristallo, la clipart e l'automobile; il riquadro a quadretti è un pattern che pdf.js non vede
    assert.deepStrictEqual(SMIST.ritagli.filter(r => !r.nelCore).map(r => r.pdf + ' ' + r.nome),
        ['2.2-Il-miscuglio-misterioso p1-3', '2.-Sale-e-saline-in-Svizzera p1-2', 'Teoria-diseq p1-1', 'Teoria-diseq p5-1', '3a-Respirazione p7-2']);
    // le soglie dello smistamento stanno strette sul banco: foto fino a 0,68, disegni da 0,75
    const foto = SMIST.ritagli.filter(r => r.atteso.caso === 4).map(r => r.tintePiatte), disegni = SMIST.ritagli.filter(r => r.atteso.caso === 5).map(r => r.tintePiatte);
    assert.strictEqual(Math.max.apply(null, foto), 0.68);
    assert.strictEqual(Math.min.apply(null, disegni), 0.75);
    // le pergamene sono doppioni al 100 %, i quattro ritagli di UDII4 allo 0 %
    assert.ok(SMIST.ritagli.filter(r => r.atteso.caso === 2).every(r => r.doppione.quota === 1));
    assert.ok(SMIST.ritagli.filter(r => r.pdf === 'UDII4_Lezione3').every(r => r.doppione.presenti === 0));
    // il titolo del Miscuglio: le sue due parole stanno già nel testo della pagina, quindi parte come foto (1) e arriva a 2 dopo la lettura del titolare
    const titolo = SMIST.ritagli.find(r => r.pdf === '2.2-Il-miscuglio-misterioso' && r.nome === 'p1-1');
    assert.deepStrictEqual([titolo.tesseract.piene, titolo.tesseract.nuove, titolo.atteso.caso, titolo.atteso.dopoTitolare], [2, 0, 4, 2]);
});

test('smistamento.json: la stima prima del clic sui ritagli del banco (titolare e controllo sommati, foto e doppioni detti a parte, è un tetto)', () => {
    const decisioni = id => SMIST.ritagli.filter(r => r.pdf === id && r.nelCore).map(r => F.smista(misuraDi(r)));
    const prezzi = { titolare: { in: 0.20, out: 0.40 }, controllo: { in: 0.40, out: 3.20 } };
    const u = F.stima(decisioni('UDII4_Lezione3'), prezzi);
    assert.deepStrictEqual([u.daLeggere, u.foto, u.doppioni, u.chiamateMax], [4, 0, 0, 8]);
    assert.strictEqual(u.riga, 'Lettura delle figure: 4 ritagli da leggere (0 foto a una lettura, 0 doppioni saltati)');
    assert.ok(u.costoCHF > 0.004 && u.costoCHF < 0.008, 'circa mezzo centesimo (ADR §5.1: 0,61 ct misurati): ' + u.costoCHF);
    const t = F.stima(decisioni('Teoria-diseq'), prezzi);
    assert.deepStrictEqual([t.daLeggere, t.doppioni, t.disegni, t.chiamateMax], [3, 2, 1, 5]);
    assert.strictEqual(t.riga, 'Lettura delle figure: 3 ritagli da leggere (0 foto a una lettura, 2 doppioni saltati)');
    const s = F.stima(decisioni('2.-Sale-e-saline-in-Svizzera'), prezzi);
    assert.deepStrictEqual([s.daLeggere, s.foto, s.chiamateMax], [3, 3, 3]);
    assert.ok(s.costoCHF < 0.0005, 'tre foto a una lettura: pochi centesimi di centesimo: ' + s.costoCHF);
    const m = F.stima(decisioni('2.2-Il-miscuglio-misterioso'), prezzi);
    assert.deepStrictEqual([m.daLeggere, m.foto, m.disegni, m.chiamateMax], [2, 1, 1, 2]);
});

/* ── i casi sintetici del §9.2 dell'ADR 0024 ──────────────────────────────── */
test('§9.2: 4 valvassini contro 3 → giallo; una riga inventata → quella gialla, le altre verdi; una lettura sola → non letto', () => {
    const a = F.accordo(F.lettore('[SCHEMA]\n' + VALVASSINI_4), F.lettore('[SCHEMA]\n' + VALVASSINI_3));
    assert.strictEqual(F.stato({ accordo: a, letture: 2, provider: 'infomaniak' }).stato, 'giallo');
    assert.deepStrictEqual(a.righe.filter(r => !r.verde).map(r => r.testo), ['valvassino']);
    const inv = F.accordo(F.lettore('[DOCUMENTO]\nIl signore dona un feudo al vassallo\nIl vassallo giura fedeltà\nIl papa incorona Carlo Magno nel 1066'),
        F.lettore('[DOCUMENTO]\nIl signore dona un feudo al vassallo\nIl vassallo giura fedeltà'));
    assert.deepStrictEqual(inv.righe.map(r => r.verde), [true, true, false]);
    assert.strictEqual(F.stato({ accordo: inv, letture: 2, provider: 'infomaniak' }).stato, 'giallo');
    assert.strictEqual(F.stato({ letture: 1, provider: 'infomaniak', titolare: F.lettore('[SCHEMA]\n' + VALVASSINI_4) }).stato, 'non letto');
});

test('gate 3 (19/10): le stesse formule scritte in due grafie — «S = ]-∞; -5[» con lo spazio, «(x/6)» fra parentesi, «3.x» col punto di moltiplicazione — sono concordi, non rosse', () => {
    // le due letture vere di Teoria diseq p.4 al gate 3 (forme, non contenuti didattici): accordo 29 % → rosso, per la normalizzazione
    const T = F.lettore('1) 2x - 7 > 5x + 8 → S = ]-∞; -5[\n2) 4x + 3 ≥ -2 - x → S = [-1; ∞[\n3) 5 · (x - 2) < 7 · (x + 1) - 1 → S = ]-8; ∞[\n4) (x/6) + (3 - 12x)/4 < (x - 54)/6 + 3/4 → S = ]3; ∞[\n5) (2x - 1)/3 - x ≤ (3 - x)/2 - 2 → S = ]-∞; -1]\n6) 4 - (x/3) ≤ 2x + 1/9 → S = [5/3; ∞[');
    const C = F.lettore('1. 2x - 7 > 5x + 8 → S = ]-∞;-5[\n2. 4x + 3 ≥ -2 - x → S = [-1;∞[\n3. 5·(x - 2) < 7·(x + 1) - 1 → S = ]-8;∞[\n4. (x)/(6) + (3 - 12x)/(4) < (x - 54)/(6) + (3)/(4) → S = ]3;∞[\n5. (2x - 1)/(3) - x ≤ (3 - x)/(2) - 2 → S = ]-∞;-1]\n6. 4 - (x)/(3) ≤ 2x + (1)/(9) → S = [5/3;∞[');
    const a = F.accordo(T, C, { formule: true });
    assert.strictEqual(a.accordoPct, 100, 'solo grafia diversa: ' + JSON.stringify(a.atomi));
    assert.ok(a.righe.every(r => r.verde));
    assert.strictEqual(F.stato({ accordo: a, letture: 2, provider: 'infomaniak', formule: true }).stato, 'verde');
    // l'intervallo non si spezza al «; »; il punto di moltiplicazione «3.x» è «3x»; le parentesi attorno a una frazione semplice cadono
    assert.deepStrictEqual(F.atomiFormula('S = ]-∞; -5['), F.atomiFormula('S = ]-∞;-5['));
    assert.deepStrictEqual(F.atomiFormula('y = 3.x + 6'), F.atomiFormula('y = 3x + 6'));   // («3.x + 6» da sola sarebbe presa per l'esercizio «3.»)
    assert.deepStrictEqual(F.atomiFormula('(x/6) + 1 < 2'), F.atomiFormula('(x)/(6) + 1 < 2'));
    // una differenza vera resta una differenza
    assert.ok(F.accordo(F.lettore('1) 2x > 4 → S = ]2; ∞['), F.lettore('1) 2x > 4 → S = ]3; ∞['), { formule: true }).accordoPct < 100);
});

test('§9.2: formula p5-f1 → giallo (83 %): cinque atomi su sei in comune', () => {
    const T = F.lettore('1) 2x + 3 > 7\n2) (x)/(6) ≤ 5 − x\n3) 3x − 1 ≥ 8\n4) x > 2\n5) 4x < 12\n6) x − 1 ≤ 0');
    const C = F.lettore('1) 2x + 3 > 7\n2) (x)/(6) ≤ 5 − x\n3) 3x − 1 ≥ 8\n4) x > 2\n5) 4x < 12\n6) x − 2 ≤ 0');
    const a = F.accordo(T, C, { formule: true });
    assert.deepStrictEqual(a.atomi, { titolare: 6, controllo: 6, comuni: 5 });
    assert.strictEqual(a.accordoPct, 83);
    assert.deepStrictEqual(a.righe.map(r => r.verde), [true, true, true, true, true, false]);
    assert.strictEqual(F.stato({ accordo: a, letture: 2, provider: 'infomaniak', formule: true }).stato, 'giallo');
    const g = F.innesta({ righe: ['6) x − 1 ≤ 0'], indiciRegione: [0], formule: F.lettoreFormule(T.testo), stato: 'giallo', pagina: 5 });
    assert.strictEqual(g.tolte, 0, 'regione gialla: nessuna riga tipografica si toglie');
    assert.ok(/^\[Formule della pagina 5\] /.test(g.righe[1]) && /⟦da controllare: /.test(g.righe[1]));
});

test('§9.2: «[DIAGRAM]» in prima riga → modo etichette (schema), anche misto con [SCHEMA]', () => {
    const en = F.accordo(F.lettore('[DIAGRAM]\nEMPEROR\nVASSAL\nvavasour\nvavasour'), F.lettore('[DIAGRAM]\nEMPEROR\nVASSAL\nvavasour'));
    assert.strictEqual(en.modo, 'schema');
    assert.ok(en.etichetteDiverse.some(e => /vavasour 2\/1/.test(e)));
    assert.strictEqual(F.accordo(F.lettore('[DIAGRAM]\nA\nB'), F.lettore('[SCHEMA]\nA\nB')).modo, 'schema');
    assert.strictEqual(F.accordo(F.lettore('[DOCUMENT]\nA'), F.lettore('[SCHEMA]\nA')).modo, 'righe');
});

test('§9.2: FIGURA_IT svuotata nell\'override → la riga del tipo c\'è ancora (col testo vero della console e senza)', () => {
    const cfg = JSON.parse(require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'prompts_config.json'), 'utf8'));
    const console_ = cfg.LETTURA_IMMAGINI_FIGURA_IT;
    assert.ok(typeof console_ === 'string' && console_.length > 50, 'il prompt del lotto 1 c\'è');
    const pieno = F.prompt('FIGURA', console_, { lingua: 'it' }), vuoto = F.prompt('FIGURA', '', { lingua: 'it' });
    [pieno, vuoto].forEach(p => {
        assert.ok(p.indexOf(F.CODA.it.tipo) >= 0, 'la riga del tipo');
        assert.ok(p.indexOf(F.CODA.it.nessunTesto) >= 0, 'la riga «nessun testo»');
    });
    assert.ok(pieno.startsWith(console_), 'il testo della console viene prima, intero');
    assert.ok(vuoto.trim().startsWith(F.CODA.it.tipo), 'svuotata: resta la coda del core');
});

test('§9.2: il corpus di CREA dopo stripBoilerplate + stripStructuralLines contiene i marcatori, IMPERATORE, VASSALLO e quattro valvassini; un ritaglio rosso non compare (IT ed EN)', () => {
    const B = require('../public/js/mappai-boilerplate-core.js');
    const verde = { stato: 'verde', righe: [{ testo: 'IMPERATORE', verde: true }, { testo: 'VASSALLO', verde: true }] };
    const giallo = { stato: 'giallo', righe: [{ testo: 'valvassore', verde: true }, { testo: 'valvassino valvassino valvassino valvassino', verde: false }] };
    const rosso = { stato: 'rosso', righe: [{ testo: 'INVENTATO DAL MODELLO', verde: true }] };
    ['it', 'en'].forEach(lingua => {
        // come app.js: una riga per pagina, il blocco accodato alla riga tipografica, le pagine unite con «\n»
        const pagine = [
            'Il sistema feudale nasce in Europa dopo la caduta dell\'impero romano e organizza la società in gradi di fedeltà personale.',
            F.marcatori.accoda('Il re affida le terre ai suoi vassalli, che a loro volta le concedono ai valvassori e ai valvassini in cambio di servizi.', F.marcatori.figure(2, [verde, giallo, rosso], { lingua })),
            'Esercizio: osserva i signori al livello più basso della piramide e spiega da chi dipendono e che cosa devono al loro signore.'
        ];
        const corpus = pagine.join('\n');
        const r = B.stripBoilerplate(corpus);
        const s = B.stripStructuralLines(r.text);
        const testo = s.text, m = F.MARC[lingua].figure;
        assert.ok(testo.indexOf(m[0].replace('N', '2')) >= 0 && testo.indexOf(m[1]) >= 0, lingua + ': i marcatori restano');
        assert.ok(testo.indexOf('IMPERATORE') >= 0 && testo.indexOf('VASSALLO') >= 0, lingua + ': le etichette in maiuscolo restano');
        assert.strictEqual((testo.match(/valvassino/g) || []).length, 4, lingua + ': quattro valvassini, dentro il segno');
        assert.ok(testo.indexOf(F.SEGNO_APRE + 'valvassino valvassino valvassino valvassino. ' + F.SEGNO_CHIUDE) >= 0);
        assert.ok(testo.indexOf(F.LEGENDA[lingua]) >= 0, lingua + ': la legenda del bivio E1 arriva al modello');
        assert.ok(testo.indexOf('INVENTATO') < 0, lingua + ': il rosso non entra');
        assert.strictEqual(r.count + s.count, 0, lingua + ': i filtri non tolgono nulla a tre pagine diverse');
        assert.strictEqual(testo.split('\n').length, 3);
    });
});

test('§9.2: tre pagine identiche → il modo A di stripBoilerplate scatta sul blocco delle figure, ed è accettato (rischio dichiarato, ADR §5.7)', () => {
    const B = require('../public/js/mappai-boilerplate-core.js');
    const verde = { stato: 'verde', righe: [{ testo: 'IMPERATORE', verde: true }, { testo: 'VASSALLO', verde: true }] };
    const riga = 'Il re affida le terre ai suoi vassalli, che a loro volta le concedono ai valvassori e ai valvassini in cambio di servizi militari e fedeltà.';
    const pagine = [1, 2, 3].map(n => F.marcatori.accoda(riga, F.marcatori.figure(n, [verde])));
    assert.ok(pagine.every(p => /\[\/Figure\]$/.test(p)));
    const r = B.stripBoilerplate(pagine.join('\n'));
    assert.ok(r.removed.some(x => x.type === 'footer'), 'tre pagine che finiscono con le stesse parole: il suffisso comune è un piè di pagina per il filtro');
    assert.ok(r.count >= 3);
    assert.ok(!/\[\/Figure\]/.test(r.text), 'il blocco (numero di pagina normalizzato) se ne va: è il prezzo dichiarato, non un difetto del core');
    // con tre pagine diverse il blocco resta (il caso vero: i 20 blocchi del banco escono identici)
    const diverse = ['Prima pagina con un testo suo, lungo quanto basta per contare come riga lunga del filtro dei piè di pagina.',
        F.marcatori.accoda('Seconda pagina con un altro testo, anch\'esso lungo quanto basta per il filtro.', F.marcatori.figure(2, [verde])),
        'Terza pagina con un testo ancora diverso, lungo quanto basta per il filtro dei piè di pagina.'];
    assert.ok(/\[\/Figure\]/.test(B.stripBoilerplate(diverse.join('\n')).text));
});

/* ══════════════════════════════════════════════════════════════════════════════
   LOTTO 5 — la stima prima del clic, il velo con «Salta le figure», la domanda Google, il Registro.
   La casa di app.js (lotto 4) con un DOM finto di soli testi: il contatore dei costi (`#estimator-cost` dentro il suo
   riquadro), il velo (`showLoadingOverlay` registra testo e `onAnnulla`, il bottone `#loading-cancel` c'è finché c'è
   un annullamento), il motore dei modali (`MappAIModal.open` risponde come il docente). Le due chiamate di CREA si
   provano nella stessa sequenza in cui le scrive `startGeneration` (opzioni → extractPdfPages → fineCrea), e il
   sorgente dice che entrambe la usano.
   ══════════════════════════════════════════════════════════════════════════════ */
function domFinto(casa, cfg) {
    cfg = cfg || {};
    const el = {}, velo = [], modali = [], contesti = [];
    const ret = { el, velo, modali, contesti, alVelo: cfg.alVelo || null };
    const nodo = (id, extra) => Object.assign({ id, textContent: '', className: '', title: '', hidden: false }, extra || {});
    el['estimator-cost'] = nodo('estimator-cost', { textContent: '0.0012 CHF' });
    el['estimator-cost'].parentNode = { insertAdjacentElement: (dove, x) => { assert.strictEqual(dove, 'afterend'); el[x.id] = x; x.dove = 'estimator'; x.parentNode = { removeChild: y => { delete el[y.id]; } }; } };
    if (cfg.bento) {   // il bento di CREA: contatore smontato (larghezza zero) e la scheda del documento con la sua riga di stato
        el['estimator-cost'].getBoundingClientRect = () => ({ width: 0, height: 0 });
        el['mn-files'] = nodo('mn-files', { appendChild: x => { el[x.id] = x; x.dove = 'mn-files'; x.parentNode = { removeChild: y => { delete el[y.id]; } }; } });
    }
    casa.ctx.document.getElementById = id => el[id] || null;
    casa.ctx.document.createElement = () => nodo('');
    casa.ctx.showLoadingOverlay = (show, testo, modo, nome, onAnnulla) => {
        velo.push({ show, testo: testo || '', annulla: typeof onAnnulla === 'function' });
        if (show && typeof onAnnulla === 'function') { el['loading-cancel'] = el['loading-cancel'] || nodo('loading-cancel'); el['loading-cancel'].textContent = 'Annulla'; el['loading-cancel'].onclick = onAnnulla; }
        else delete el['loading-cancel'];
        if (ret.alVelo) ret.alVelo(testo || '', onAnnulla);
    };
    casa.ctx.MappAIModal = { open: schema => { modali.push(schema); return Promise.resolve(cfg.risposta === undefined ? null : { azione: cfg.risposta }); } };
    let attuale = { cat: 'pipeline', sub: 'mappa' };
    casa.ctx.MappAIUsage.setContext = (c, s) => { contesti.push([c, s]); attuale = { cat: c, sub: s }; };
    casa.ctx.MappAIUsage.current = () => ({ cat: attuale.cat, sub: attuale.sub });
    return ret;
}
// le due chiamate di CREA come le scrive startGeneration (app.js), sulla fonte `src`
function creaPdf(casa, src) {
    const MF = casa.ctx.MappAIFigure;
    return Promise.resolve(MF && MF.opzioniCrea ? MF.opzioniCrea(src) : null).then(o => casa.estrai(src.file, o || { origine: 'crea' }))
        .then(r => { if (MF && MF.fineCrea) MF.fineCrea(src.file); return r; });
}
// MODEL_KB vero, tagliato dal sorgente di mappai-ui-modals.js (è un `const` di script, non sta su window)
function modelKbVero(ora) {
    const vm = require('node:vm'), fs = require('node:fs'), path = require('node:path');
    const src = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'mappai-ui-modals.js'), 'utf8');
    const i = src.indexOf('const MODEL_KB = {'), j = src.indexOf('\n};', i);
    const RealDate = Date;
    const D = function (...a) { return a.length ? new RealDate(...a) : new RealDate(ora == null ? RealDate.now() : ora); };
    D.now = () => (ora == null ? RealDate.now() : ora); D.UTC = RealDate.UTC;
    const ctx = { Date: D };
    vm.createContext(ctx);
    vm.runInContext(src.slice(i, j + 3).replace('const MODEL_KB', 'globalThis.MODEL_KB'), ctx);
    return ctx.MODEL_KB;
}

test('gate 3 (19/10): nel bento di CREA il contatore dei costi è smontato: la riga della stima va sotto il nome del file nella scheda del documento', () => {
    const casa = casaApp({ risposte: RISPOSTE_UDII4 });
    const dom = domFinto(casa, { bento: true });
    casa.ctx.appState.sources = [{ id: 's1', type: 'pdf', _figure: provaCon(casa, 'UDII4_Lezione3') }];
    return casa.M.decidi(casa.ctx.appState.sources[0]._figure).then(() => casa.M.aggiornaStima()).then(() => {
        const riga = dom.el['figure-stima'];
        assert.ok(riga && riga.dove === 'mn-files', 'la riga nel riquadro dei documenti del bento, non sotto il contatore smontato: ' + (riga && riga.dove));
        assert.ok(/4 ritagli da leggere/.test(riga.textContent));
        const classico = casaApp({ risposte: RISPOSTE_UDII4 });
        const d2 = domFinto(classico);
        classico.ctx.appState.sources = [{ id: 's1', type: 'pdf', _figure: provaCon(classico, 'UDII4_Lezione3') }];
        return classico.M.decidi(classico.ctx.appState.sources[0]._figure).then(() => classico.M.aggiornaStima()).then(() => {
            assert.strictEqual(d2.el['figure-stima'].dove, 'estimator', 'col contatore visibile la riga resta sotto il contatore');
        });
    });
});

test('lotto 5: la riga della stima sotto #estimator-cost, prima del clic, per ogni fonte PDF di CREA; sommata su più PDF; si scrive quando arriva la prova a secco; spenta o senza PDF, niente riga', () => {
    const casa = casaApp({ risposte: RISPOSTE_UDII4 });
    const dom = domFinto(casa);
    const M = casa.M;
    assert.strictEqual(typeof M.aggiornaStima, 'function', 'MappAIFigure.aggiornaStima');
    const pU = provaCon(casa, 'UDII4_Lezione3'), pT = provaCon(casa, 'Teoria-diseq');
    return M.decidi(pU).then(() => M.decidi(pT)).then(() => {
        casa.ctx.appState.sources = [{ id: 's1', type: 'pdf', _figure: pU }, { id: 's2', type: 'text' }];
        return M.aggiornaStima();
    }).then(() => {
        const riga = dom.el['figure-stima'];
        assert.ok(riga, 'la riga sta subito dopo il riquadro di #estimator-cost');
        assert.ok(riga.textContent.startsWith('Lettura delle figure: 4 ritagli da leggere (0 foto a una lettura, 0 doppioni saltati)'), riga.textContent);
        assert.ok(/ · al più 0\.0\d{3} CHF$/.test(riga.textContent), 'coi prezzi del catalogo, in CHF su Infomaniak: ' + riga.textContent);
        assert.strictEqual(casa.chiamate.infomaniak.length + casa.chiamate.gemini.length, 0, 'la stima non chiama nessun modello');
        // due PDF: si sommano (UDII4 4 + Teoria diseq 3, i due doppioni detti a parte)
        casa.ctx.appState.sources.push({ id: 's3', type: 'doc', _figure: pT });
        return M.aggiornaStima();
    }).then(() => {
        assert.ok(dom.el['figure-stima'].textContent.startsWith('Lettura delle figure: 7 ritagli da leggere (0 foto a una lettura, 2 doppioni saltati)'), dom.el['figure-stima'].textContent);
        // senza PDF la riga se ne va
        casa.ctx.appState.sources = [{ id: 's2', type: 'text' }];
        return M.aggiornaStima();
    }).then(() => {
        assert.ok(!dom.el['figure-stima'], 'senza PDF da leggere nessuna riga');
        // spenta: niente riga
        const spenta = casaApp({ localStorage: { mappai_figure: '0' } });
        const d2 = domFinto(spenta);
        spenta.ctx.appState.sources = [{ id: 's1', type: 'pdf', _figure: pU }];
        return spenta.M.aggiornaStima().then(() => assert.ok(!d2.el['figure-stima'], 'interruttore spento'));
    }).then(() => {
        // la prova a secco è asincrona dopo il caricamento: quando arriva, la riga si aggiorna da sé
        const c3 = casaApp({ risposte: RISPOSTE_UDII4 });
        const d3 = domFinto(c3);
        const pr = provaCon(c3, 'UDII4_Lezione3');
        c3.M.prova = () => c3.M.decidi(pr);
        c3.ctx.appState.sources = [{ id: 's1', type: 'pdf' }];
        return c3.ctx.handlePDFUpload({ files: [c3.file], dataset: { sourceId: 's1' }, parentNode: { appendChild() { } } })
            .then(() => new Promise(r => setTimeout(r, 30)))
            .then(() => assert.ok(d3.el['figure-stima'] && /4 ritagli da leggere/.test(d3.el['figure-stima'].textContent), 'handlePDFUpload → la riga'));
    });
});

test('lotto 5: con Google come fornitore la stima prezza Gemini 4 Argon da MODEL_KB, 2/10 USD per milione (4/20 dal 1/12/2026)', () => {
    const kbOggi = modelKbVero(new Date(2026, 9, 19).getTime()), kbDic = modelKbVero(new Date(2026, 11, 1, 0, 0, 1).getTime());
    const A = kbOggi['gemini-4-argon'], A2 = kbDic['gemini-4-argon'];
    assert.ok(A, 'gemini-4-argon in MODEL_KB');
    eqJ([A.inputCost, A.outputCost], [2, 10]);
    eqJ([A2.inputCost, A2.outputCost], [4, 20], 'dal 1/12/2026');
    const casa = casaApp({ appState: { aiProvider: 'google' }, chiaveGoogle: 'AIzaChiaveGoogleDiProva', tokenInfomaniak: '' });
    casa.ctx.MODEL_KB = kbOggi;
    domFinto(casa);
    const pU = provaCon(casa, 'UDII4_Lezione3');
    return casa.M.decidi(pU).then(() => casa.M.stima(pU)).then(s => {
        assert.strictEqual(s.modelli.titolare, F.MODELLI.GOOGLE);
        const atteso = F.stima(pU.decisioni, { titolare: { in: 2, out: 10 }, controllo: { in: 0, out: 0 } }).costoCHF;
        assert.ok(atteso > 0 && Math.abs(s.costoCHF - atteso) < 1e-12, 'il prezzo di MODEL_KB: ' + s.costoCHF + ' contro ' + atteso);
    });
});

test('lotto 5: il velo di CREA dice «Leggo le figure: ritaglio k di N» col bottone «Salta le figure»; a fine lettura il toast «Figure: …»; il Registro ha il contesto pipeline/figure, poi torna quello di prima', () => {
    const casa = casaApp({ risposte: RISPOSTE_UDII4 });
    const dom = domFinto(casa);
    casa.file._figure = provaCon(casa, 'UDII4_Lezione3');
    const src = { id: 's1', type: 'pdf', file: casa.file };
    let bottone = null;
    const vecchio = casa.ctx.showLoadingOverlay;
    casa.ctx.showLoadingOverlay = function () { vecchio.apply(null, arguments); if (dom.el['loading-cancel']) bottone = bottone || dom.el['loading-cancel']; };
    assert.strictEqual(typeof casa.M.opzioniCrea, 'function', 'MappAIFigure.opzioniCrea');
    return casa.M.decidi(casa.file._figure).then(() => creaPdf(casa, src)).then(r => {
        const testi = dom.velo.map(v => v.testo);
        assert.ok(testi.indexOf('Leggo le figure: ritaglio 1 di 4') >= 0, testi.join(' | '));
        assert.ok(testi.indexOf('Leggo le figure: ritaglio 4 di 4') >= 0, testi.join(' | '));
        assert.ok(dom.velo.filter(v => /Leggo le figure/.test(v.testo)).every(v => v.annulla), 'ogni riga del velo porta il suo annullamento');
        assert.ok(bottone && bottone.textContent === 'Salta le figure', 'il bottone del velo si chiama «Salta le figure»');
        assert.ok(!dom.el['loading-cancel'], 'a lettura finita il bottone se ne va');
        assert.ok(r.pages[1].text.indexOf('[Figure della pagina 2]') > 0, 'le figure lette entrano nel testo');
        assert.strictEqual(casa.chiamate.infomaniak.length, 8);
        const t = casa.chiamate.toast.filter(x => /^Figure: /.test(x.m));
        eqJ(t.map(x => x.m), ['Figure: 4 lette, 1 da controllare, 0 escluse, 0 non lette'], 'il toast finale, una volta sola');
        eqJ(dom.contesti, [['pipeline', 'figure'], ['pipeline', 'mappa']], 'setContext prima della lettura, poi quello di prima');
        // un PDF di solo testo: niente velo delle figure, niente toast
        const c2 = casaApp({});
        const d2 = domFinto(c2);
        c2.file._figure = provaCon(c2, 'UDII4_Lezione3');
        c2.file._figure.pagine.forEach(p => { p.stato = 'nulla'; p.ritagli = []; });
        return c2.M.decidi(c2.file._figure).then(() => creaPdf(c2, { id: 's1', type: 'pdf', file: c2.file })).then(() => {
            assert.ok(!d2.velo.some(v => /Leggo le figure/.test(v.testo)), 'nessuna riga del velo');
            assert.ok(!c2.chiamate.toast.some(x => /^Figure/.test(x.m)), 'nessun toast');
        });
    });
});

test('lotto 5: «Salta le figure» prosegue col solo testo tipografico e conserva i ritagli già pagati (la seconda volta non si ripagano)', () => {
    const casa = casaApp({ risposte: RISPOSTE_UDII4 });
    const dom = domFinto(casa, { alVelo: (testo, onAnnulla) => { if (/ritaglio 2 di 4/.test(testo) && onAnnulla) onAnnulla(); } });
    casa.file._figure = provaCon(casa, 'UDII4_Lezione3');
    const src = { id: 's1', type: 'pdf', file: casa.file };
    return casa.M.decidi(casa.file._figure).then(() => creaPdf(casa, src)).then(r => {
        assert.ok(r.text.indexOf('[Figure') < 0 && r.text.indexOf(F.SEGNO_APRE) < 0, 'il testo resta tipografico: ' + r.text);
        eqJ(r.pages.map(p => p.text), Object.values(TESTI_UDII4));
        assert.strictEqual(casa.chiamate.infomaniak.length, 2, 'si ferma dopo la prima pagina (un ritaglio, due letture)');
        const d = casa.M.dossierDi('impr0113');
        assert.ok(d && d.ritagli.some(x => x.stato === 'verde' && x.pagina === 1), 'il ritaglio pagato resta nel dossier');
        assert.ok(casa.chiamate.toast.some(x => /^Figure saltate/.test(x.m)), casa.chiamate.toast.map(x => x.m).join(' | '));
        assert.ok(!casa.chiamate.toast.some(x => /^Figure: /.test(x.m)), 'niente conteggio di letture che non sono entrate');
        // CREA una seconda volta, senza saltare: il ritaglio di p.1 non si ripaga
        dom.velo.length = 0;
        dom.alVelo = null;
        return creaPdf(casa, src);
    }).then(r2 => {
        assert.strictEqual(casa.chiamate.infomaniak.length, 2 + 6, 'p.2 e p.3 (tre ritagli, sei letture); p.1 dal dossier');
        assert.ok(r2.pages[0].text.indexOf('[Figure della pagina 1]') > 0);
    });
});

test('lotto 5: un PDF scansionato con la chiave Google — la domanda dell\'ADR §5.8, «No» di serie, ricordata nel .figure.json; senza chiave nessuna domanda e l\'avviso «K pagine sono scansioni»', () => {
    const giro = (cfg, risposta) => {
        const casa = casaApp(cfg);
        const dom = domFinto(casa, { risposta });
        casa.file._figure = provaCon(casa, 'FOCUS-STORIA-Aztechi');
        casa.file.name = 'aztechi.pdf';
        const src = { id: 's1', type: 'pdf', file: casa.file };
        return casa.M.decidi(casa.file._figure).then(() => creaPdf(casa, src)).then(r => ({ casa, dom, r, src }));
    };
    const G = { chiaveGoogle: 'AIzaChiaveGoogleDiProva', ocr: () => 'parole lette dal solo tesseract', risposte: { [F.MODELLI.GOOGLE]: () => '[TITOLO] Tenochtitlan\n[TESTO] La città sul lago' } };
    // «No» (o la finestra chiusa): nessuna chiamata a Google, l'avviso, la risposta nel dossier
    return giro(G, 'no').then(({ casa, dom, r }) => {
        // 0114 lotto 4 (D5): l'Aztechi non ha testo tipografico, quindi dopo il «No» viene l'avviso del motore (seconda finestra)
        assert.strictEqual(dom.modali.length, 2, 'una domanda, poi l\'avviso della scansione non letta');
        assert.strictEqual(dom.modali[1].titolo, 'Questo PDF non è stato letto');
        const s = dom.modali[0], testo = JSON.stringify(s);
        assert.ok(testo.indexOf('Questo PDF è una scansione (4 pagine). Con Infomaniak lo leggo solo in parte, con un OCR locale. Leggerlo con Google, con la tua chiave? Il testo esce dalla Svizzera.') >= 0, testo);
        assert.ok(testo.indexOf('Non farlo se nel PDF ci sono lavori o nomi di allievi.') >= 0);
        const az = s.azioni.map(a => [a.id, a.etichetta, a.ruolo || '']);
        eqJ(az, [['si', 'Leggi con Google', ''], ['no', 'No, continua senza', 'primario']], '«No» è il primario: di serie');
        assert.strictEqual(casa.chiamate.gemini.length, 0);
        // 0114 lotto 4 (D5): l'avviso prende il posto del toast «K pagine sono scansioni» (che resta per i PDF con testo tipografico)
        assert.ok(!casa.chiamate.toast.some(x => /sono scansioni/.test(x.m)), casa.chiamate.toast.map(x => x.m).join(' | '));
        assert.strictEqual(casa.M.dossierDi('impr0113').google, 'no', 'ricordata nel .figure.json');
        assert.ok(r.text.indexOf('[Figure') < 0, 'il rosso «parziale» non entra');
        // CREA una seconda volta sullo stesso PDF: la risposta si ricorda, nessuna domanda
        dom.modali.length = 0;
        // 0114 lotto 4: la domanda non torna (ricordata); torna l'avviso, perché il PDF resta non letto
        return creaPdf(casa, { id: 's1', type: 'pdf', file: casa.file }).then(() => eqJ(dom.modali.map(m => m.titolo), ['Questo PDF non è stato letto'], 'ricordata per quel PDF'));
    }).then(() => giro(G, undefined)).then(({ casa }) => {
        assert.strictEqual(casa.chiamate.gemini.length, 0, 'finestra chiusa senza risposta = «No»');
        assert.strictEqual(casa.M.dossierDi('impr0113').google, 'no');
    }).then(() => giro(G, 'si')).then(({ casa, r }) => {
        assert.strictEqual(casa.chiamate.gemini.length, 4, '«Leggi con Google»: quattro pagine intere a Gemini 4');
        assert.ok(casa.chiamate.gemini.every(c => c.apiKey === 'AIzaChiaveGoogleDiProva'));
        assert.strictEqual(casa.M.dossierDi('impr0113').google, 'si');
        assert.ok(!casa.chiamate.toast.some(x => /sono scansioni/.test(x.m)), 'letto con Google: niente avviso');
        assert.ok(r.pages[0].text.indexOf('[Figure della pagina 1]') > 0);
    }).then(() => giro({ chiaveGoogle: '', ocr: () => 'parole' }, 'si')).then(({ casa, dom }) => {
        // 0114 lotto 4 (D5): senza la chiave nessuna domanda; l'avviso al posto del toast «K pagine sono scansioni»
        eqJ(dom.modali.map(m => m.titolo), ['Questo PDF non è stato letto'], 'senza la chiave Google nessuna domanda');
        assert.strictEqual(casa.chiamate.gemini.length, 0);
        assert.ok(!casa.chiamate.toast.some(x => /sono scansioni/.test(x.m)));
    }).then(() => {
        // la risposta ricordata nel .figure.json del vault (impronta uguale): nessuna domanda
        const casa = casaApp(Object.assign({}, G, { dossierSuDisco: Object.assign(F.dossier.nuovo({ impronta: 'impr0113', file: 'Fonti/aztechi.pdf', pagine: 4 }), { google: 'si' }) }));
        const dom = domFinto(casa, { risposta: 'no' });
        casa.ctx.appState.activeVaultPath = '/vault/di/prova';
        casa.file._figure = provaCon(casa, 'FOCUS-STORIA-Aztechi');
        casa.file.name = 'aztechi.pdf';
        return casa.M.decidi(casa.file._figure).then(() => creaPdf(casa, { id: 's1', type: 'pdf', file: casa.file })).then(() => {
            assert.strictEqual(dom.modali.length, 0, 'la risposta dal .figure.json del vault');
            assert.strictEqual(casa.chiamate.gemini.length, 4);
            assert.ok(casa.chiamate.letti.every(l => l.vaultPath === '/vault/di/prova' && !/^\//.test(l.relPath)));
        });
    });
});

test('lotto 5: il Registro consumi ha le voci «Lettura delle figure» e la visione in Pipeline materiali; le due chiamate di CREA usano opzioniCrea e fineCrea', () => {
    const U = require('../public/js/mappai-usage-core.js');
    assert.strictEqual(U.subLabel('pipeline', 'figure'), 'Lettura delle figure');
    assert.notStrictEqual(U.subLabel('pipeline', 'visione'), U.CATS.other.subs.misc, 'la visione non è più «Non classificato»');
    const src = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'public', 'js', 'app.js'), 'utf8');
    assert.strictEqual((src.match(/await window\.extractPdfPages\(src\.file, \(await window\.MappAIFigure\?\.opzioniCrea\?\.\(src\)\) \|\| \{ origine: 'crea' \}\);/g) || []).length, 2, 'le due chiamate di CREA');
    assert.strictEqual((src.match(/window\.MappAIFigure\?\.fineCrea\?\.\(src\.file\);/g) || []).length, 2);
    assert.strictEqual((src.match(/extractPdfPages\(src\.file, \{ origine: 'crea' \}\)/g) || []).length, 0);
});

/* ═════════════════════════════════════════════════════════════════════
   LOTTO 6 — testi e caricamento: gli script in index.html, le chiavi `fig_*` nei due dizionari (lessico dell'ADR §5.6),
   i moduli che passano da `_t`/`window.t`, il bundle di Tesseract caricato alla prima lettura
   ═════════════════════════════════════════════════════════════════════ */
function dizionarioDi(nome) {
    const vm = require('node:vm'), fs = require('node:fs'), path = require('node:path');
    const ctx = vm.createContext({ console: { log() { }, warn() { }, error() { } } });
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'public', 'traduzioni', nome), 'utf8') + ';globalThis.__d = ' + nome.replace('.js', '') + ';', ctx);
    return ctx.__d;
}
const leggiRepo = (...p) => require('node:fs').readFileSync(require('node:path').join(__dirname, '..', ...p), 'utf8');

test('lotto 6: index.html carica il core e il modulo subito dopo mappai-visione-modello.js, in quest\'ordine, col marcatore 0113; i file toccati dai lotti 3-5 ne portano il segno', () => {
    const html = leggiRepo('public', 'index.html');
    const srcs = [...html.matchAll(/<script src="(js\/[^"?]+)\?v=([^"]+)"/g)].map(m => ({ f: m[1], v: m[2] }));
    const i = nome => srcs.findIndex(x => x.f === 'js/' + nome);
    const a = i('mappai-visione-modello.js'), c = i('mappai-figure-core.js'), m = i('mappai-figure.js');
    assert.ok(a >= 0 && c === a + 1 && m === a + 2, 'core e modulo devono seguire subito mappai-visione-modello.js (' + [a, c, m] + ')');
    assert.strictEqual((html.match(/js\/mappai-figure(-core)?\.js/g) || []).length, 2, 'né doppi né mancanti');
    assert.ok(i('app.js') < c && i('infomaniak_bridge.js') < c && i('mappai-ui-modals.js') < c, 'il modulo gira dopo app.js, il ponte e i modali');
    for (const f of ['mappai-figure-core.js', 'mappai-figure.js', 'infomaniak_bridge.js', 'app.js', 'mappai-ui-modals.js', 'mappai-usage-core.js']) {
        assert.ok(/(^|-)0113-/.test(srcs[i(f)].v), f + ' senza il marcatore 0113 nel ?v= (' + srcs[i(f)].v + ')');
    }
    // il bundle di Tesseract NON è in index.html: lo carica il modulo alla prima lettura
    assert.ok(!/tesseract\.min\.js/.test(html));
});

test('lotto 6: le chiavi fig_* sono in entrambi i dizionari, con segnaposto uguali; il lessico dell\'ADR §5.6 non usa i colori da soli', () => {
    const it = dizionarioDi('it_translations.js'), en = dizionarioDi('en_translations.js');
    const chiavi = Object.keys(it).filter(k => k.startsWith('fig_')).sort();
    assert.ok(chiavi.length >= 15, 'chiavi fig_* trovate: ' + chiavi.length);
    eqJ(Object.keys(en).filter(k => k.startsWith('fig_')).sort(), chiavi, 'le stesse chiavi in italiano e in inglese');
    const segnaposto = t => (String(t).match(/\{[a-zA-Z]+\}/g) || []).sort();
    for (const k of chiavi) {
        assert.ok(it[k] && en[k], k + ' vuota');
        eqJ(segnaposto(en[k]), segnaposto(it[k]), k + ': segnaposto diversi');
        assert.ok(!/\b(verde|giallo|rosso|green|yellow|red)\b/i.test(it[k] + ' ' + en[k]), k + ': i colori da soli non sono un lessico');
    }
    eqJ([it.fig_stato_concordi, it.fig_stato_divergono, it.fig_stato_escluso, it.fig_stato_non_letto], ['due letture concordi', 'le due letture divergono: controlla', 'escluso', 'non letto']);
    // ogni chiave che il modulo e app.js chiedono esiste, e il fallback italiano è il testo del dizionario italiano
    const usati = [];
    for (const f of ['public/js/mappai-figure.js', 'public/js/app.js']) {
        const src = leggiRepo(...f.split('/'));
        for (const m of src.matchAll(/(?<![\w$.])(?:window\.t|_t)\(\s*'(fig_[a-z_]+)'\s*,\s*('(?:[^'\\]|\\.)*')/g)) usati.push({ f, k: m[1], fallback: eval(m[2]) });
    }
    assert.ok(usati.length >= 11, 'usi di chiavi fig_*: ' + usati.length);
    // il toast d'errore di extractPdfPages (app.js) tiene il fallback in una variabile: stessa regola, controllata a parte
    const appSrc = leggiRepo('public', 'js', 'app.js');
    assert.ok(/window\.t \? window\.t\('fig_err_lettura', _msgFigure\)/.test(appSrc), 'app.js: il toast d\'errore delle figure non passa da window.t');
    assert.strictEqual(eval(appSrc.match(/var _msgFigure = ('(?:[^'\\]|\\.)*');/)[1]), it.fig_err_lettura);
    for (const u of usati) {
        assert.ok(it[u.k] && en[u.k], u.f + ': ' + u.k + ' manca in un dizionario');
        assert.strictEqual(it[u.k], u.fallback, u.f + ': il fallback di ' + u.k + ' diverso dal dizionario italiano');
    }
    // i testi fissi dei lotti 3-5 non sono più letterali nel modulo
    const modulo = leggiRepo('public', 'js', 'mappai-figure.js');
    for (const re of [/toast\('Figure saltate/, /textContent = 'Salta le figure'/, /etichetta: 'Leggi con Google'/, /etichetta: 'No, continua senza'/, /toast\('\{k\} pagine sono scansioni/, /titolo: 'Un PDF scansionato'/, /return 'Figure: '/, /'Figures: '/]) assert.ok(!re.test(modulo), 'resta un testo fisso nel modulo: ' + re);
});

test('lotto 6: con l\'interfaccia in inglese il toast finale e la domanda Google parlano inglese; senza window.t resta l\'italiano', () => {
    const en = dizionarioDi('en_translations.js');
    const casa = casaModulo({ risposte: RISPOSTE_UDII4 });
    casa.ctx.t = (k, f) => (en[k] !== undefined && en[k] !== '' ? en[k] : (f !== undefined ? f : k));
    const pr = provaCon(casa, 'UDII4_Lezione3');
    return casa.M.decidi(pr).then(() => casa.M.leggi(pr, { origine: 'crea', nome: 'UDII4_Lezione3.pdf' })).then(u => {
        assert.strictEqual(u.toast, 'Figures: 4 read, 1 to check, 0 excluded, 0 not read');
        // la domanda Google: titolo, bottoni e testo con {k}
        let aperta = null;
        casa.ctx.MappAIModal = { open: s => { aperta = s; return Promise.resolve({ azione: 'no' }); } };
        return casa.M.domandaGoogle(4).then(si => {
            assert.strictEqual(si, false);
            assert.strictEqual(aperta.titolo, 'A scanned PDF');
            eqJ(aperta.azioni.map(x => x.etichetta), ['Read with Google', 'No, continue without']);
            assert.ok(aperta.sezioni[0].testo.startsWith('This PDF is a scan (4 pages).'), aperta.sezioni[0].testo);
        });
    }).then(() => {
        const it = casaModulo({ risposte: RISPOSTE_UDII4 }), p2 = provaCon(it, 'UDII4_Lezione3');
        return it.M.decidi(p2).then(() => it.M.leggi(p2, { origine: 'crea', nome: 'UDII4_Lezione3.pdf' })).then(u => assert.strictEqual(u.toast, 'Figure: 4 lette, 1 da controllare, 0 escluse, 0 non lette'));
    });
});

test('lotto 6: senza Tesseract nella pagina il modulo ne carica il bundle alla prima lettura, una volta sola', () => {
    const casa = casaModulo({ risposte: RISPOSTE_UDII4 });
    const aggiunti = [];
    let Fake = null;
    casa.ctx.document.head = { appendChild: sc => { aggiunti.push(sc.src); setTimeout(() => { casa.ctx.Tesseract = Fake = { createScheduler: () => ({ addWorker() { }, addJob: () => Promise.resolve({ data: { text: 'IMPERATORE' } }) }), createWorker: () => Promise.resolve({ terminate() { } }) }; sc.onload && sc.onload(); }, 0); } };
    casa.ctx.document.createElement = tag => (tag === 'script' ? {} : { getContext: () => ({}) });
    delete casa.M._deps.tesseract;                     // il Tesseract finto di casaModulo non c'è: vale quello della pagina
    casa.M._deps.tesseract = () => casa.ctx.Tesseract;
    casa.ctx.window.location = { href: 'file:///app/public/index.html' };
    const letture = [];
    return Promise.all([casa.M._deps.caricaTesseract(), casa.M._deps.caricaTesseract()]).then(r => {
        assert.strictEqual(aggiunti.length, 1, 'un solo script anche con due richieste');
        assert.ok(/js\/vendor\/tesseract\/tesseract\.min\.js$/.test(aggiunti[0]), aggiunti[0]);
        assert.ok(r[0] && r[0] === Fake && r[1] === Fake);
        letture.push(r);
        // già presente: non si ricarica
        return casa.M._deps.caricaTesseract();
    }).then(T => {
        assert.strictEqual(T, Fake, 'window.Tesseract c\'è già: lo si restituisce senza altri script');
        assert.strictEqual(aggiunti.length, 1);
    });
});

/* ══ LOTTO 8 — ELABORA, «Testo delle figure» e il .figure.json scritto da flushSourcesToVault ═══════════════
   ELABORA vero (mappai-elabora.js con files-core, pipeline-core e fonti-core) nella casa del modulo, su un DOM
   di cheerio come in tests/elabora-comandi-fonte.test.js. Negli assert sul DOM finto solo booleani, testi e
   numeri, mai l'elemento (un assert fallito su un oggetto del DOM finto fa girare Node all'infinito). */
function domCheerioFig(markup) {
    const cheerio = require('cheerio');
    const $ = cheerio.load(markup), cache = new WeakMap();
    const document = { addEventListener() { }, removeEventListener() { },
        createElement: tag => wrap($('<' + tag + '></' + tag + '>')[0]),
        querySelector: q => wrap($(q)[0]), querySelectorAll: q => $(q).toArray().map(wrap),
        getElementById: id => wrap($('[id]').toArray().find(n => n.attribs.id === id)) };
    function wrap(node) {
        if (!node) return null;
        if (cache.has(node)) return cache.get(node);
        const e = { node, style: {}, dataset: {}, ownerDocument: document,
            get id() { return $(node).attr('id') || ''; }, set id(v) { $(node).attr('id', v); },
            get className() { return $(node).attr('class') || ''; }, set className(v) { $(node).attr('class', v); },
            get innerHTML() { return $(node).html(); }, set innerHTML(v) { $(node).html(v); },
            get textContent() { return $(node).text(); }, set textContent(v) { $(node).text(v); },
            get value() { return $(node).val() || $(node).text(); }, set value(v) { $(node).text(v); },
            get src() { return $(node).attr('src') || ''; }, set src(v) { $(node).attr('src', v); },
            get disabled() { return $(node).attr('disabled') != null; }, set disabled(v) { if (v) $(node).attr('disabled', ''); else $(node).removeAttr('disabled'); },
            get isConnected() { return $(node).closest('html').length > 0; },
            classList: { contains: c => $(node).hasClass(c), add: c => $(node).addClass(c), remove: c => $(node).removeClass(c) },
            querySelector: q => wrap($(node).find(q)[0]), querySelectorAll: q => $(node).find(q).toArray().map(wrap),
            getAttribute: n => $(node).attr(n), setAttribute: (n, v) => $(node).attr(n, v),
            appendChild(child) { $(node).append(child.node); return child; },
            remove: () => $(node).remove(), addEventListener() { }, removeEventListener() { } };
        cache.set(node, e); return e;
    }
    document.head = wrap($('head')[0]); document.body = wrap($('body')[0]); document.documentElement = wrap($('html')[0]);
    return { $, document };
}
function casaElabora(cfg) {
    cfg = cfg || {};
    const casa = casaModulo(cfg);
    const ctx = casa.ctx, vm = require('node:vm'), fs = require('node:fs'), path = require('node:path');
    const RAD = path.join(__dirname, '..');
    const dom = domCheerioFig('<html><head></head><body><div id="elabora-content"></div></body></html>');
    ctx.document = dom.document;                      // il modulo delle figure disegna i canvas con deps.creaCanvas, già sostituito
    const fontiFiles = cfg.fontiFiles || (() => []);
    ctx.electronAPI.vaultSourcesList = ({ vaultPath }) => Promise.resolve({ ok: true, files: fontiFiles(vaultPath) });
    ctx.electronAPI.vaultMaterialsList = () => Promise.resolve({ ok: true, files: [] });
    if (cfg.saveFallisce) { const orig = ctx.electronAPI.saveVaultFile; ctx.electronAPI.saveVaultFile = d => (cfg.saveFallisce(d) ? Promise.reject(new Error('disco pieno')) : orig(d)); }
    ctx.MappAIEnrichCore = { analyzeEnrichment: () => ({ coverage: { cards: [] }, text: { signals: [], words: 120, sentences: 6, connectives: { causale: { count: 0 } } }, structural: [] }) };
    ctx.MappAIDescFidelity = { corpusFromState: s => (s.sources || []).map(x => x.content || '').join('\n\n') };
    ctx.extractTextFromPDF = async () => 'Testo estratto di prova dalla scheda. '.repeat(8);
    const VP = cfg.vaultPath === undefined ? '/Users/prova/Documents/MappAI - file/Classi/4A/Storia/UDII4' : cfg.vaultPath;
    Object.assign(ctx.appState, { sources: [], db: { nodes: [{ id: 'r', label: 'Radice', level: 0 }, { id: 'a', label: 'A', level: 1 }], links: [{ source: 'r', target: 'a' }], studySets: [] },
        activeVaultPath: VP, rootNodeLabel: 'UDII4', extractionMode: 'mindmap' });
    for (const f of ['mappai-files-core.js', 'mappai-pipeline-core.js', 'mappai-fonti-core.js', 'mappai-elabora.js']) vm.runInContext(fs.readFileSync(path.join(RAD, 'public', 'js', f), 'utf8'), ctx);
    const E = ctx.MappAIElabora;
    E.setMode('source');
    const html = () => dom.$('#elab-overlay').html() || '';
    return Object.assign(casa, { E, dom, html, VP });
}
/* una fonte PDF di CREA già letta: la prova a secco sulla fonte e sul file (`_figure`), il dossier in memoria dopo `leggi` */
function fonteLetta(casa, id, nome, opz) {
    const prova = provaCon(casa, id);
    if (opz && opz.impronta) prova.impronta = opz.impronta;
    return casa.M.decidi(prova).then(pr => casa.M.leggi(pr, { origine: 'crea', nome, google: opz && opz.google }).then(u => {
        const file = { name: nome, type: 'application/pdf', size: 1234, arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)) };
        file._figure = pr; file._letturaFigure = u;
        const src = { id: 'source-' + (casa.ctx.appState.sources.length + 1), type: 'pdf', name: nome, content: 'Testo estratto di prova dalla scheda. '.repeat(8), file, _figure: pr };
        casa.ctx.appState.sources.push(src);
        return { src, prova: pr, lettura: u };
    }));
}
function indiceDi(casa, identita) {
    const re = new RegExp('data-fig-k="(\\d+)"[^>]*data-fig-id="' + identita.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '"');
    const m = re.exec(casa.html());
    assert.ok(m, 'ritaglio non in vista: ' + identita);
    return Number(m[1]);
}
const riposoFig = (n = 12) => { let p = Promise.resolve(); for (let i = 0; i < n; i++) p = p.then(() => new Promise(r => setImmediate(r))); return p; };
const FONTI_UDII4 = () => [{ name: 'UDII4_Lezione3.pdf', relPath: 'Fonti/UDII4_Lezione3.pdf', size: 10, ext: 'pdf' }];

test('lotto 8: flushSourcesToVault scrive Fonti/<nome>.figure.json (percorsi relativi) nello stesso passaggio dei .txt e di fonti.json, solo se il vault c\'è; un guasto non ferma i .txt; senza lettura niente file', () => {
    const casa = casaElabora({ risposte: RISPOSTE_UDII4 });
    return fonteLetta(casa, 'UDII4_Lezione3', 'UDII4_Lezione3.pdf').then(() => casa.E.flushSourcesToVault({ vaultNuovo: true })).then(ok => {
        assert.strictEqual(ok, true);
        const rel = casa.chiamate.salvati.map(x => x.relPath);
        assert.ok(rel.includes('Fonti/UDII4_Lezione3.pdf') && rel.includes('Fonti/fonti.json') && rel.some(r => /\.txt$/.test(r)), rel.join(' '));
        const fj = casa.chiamate.salvati.find(x => x.relPath === 'Fonti/UDII4_Lezione3.figure.json');
        assert.ok(fj, 'il .figure.json manca: ' + rel.join(' '));
        assert.strictEqual(fj.vaultPath, casa.VP);
        const d = JSON.parse(fj.text);
        eqJ([d.versione, d.file, d.ritagli.length, d.stati], [1, 'Fonti/UDII4_Lezione3.pdf', 4, { verdi: 3, gialli: 1, rossi: 0, nonLetti: 0 }]);
        assert.ok(!/\/Users\//.test(fj.text), 'nessun percorso assoluto nel .figure.json');
        assert.ok(d.ritagli[1].letture.titolare && d.ritagli[1].letture.controllo && d.ritagli[1].gialle.length === 1, 'le due letture e la riga gialla');
    }).then(() => {
        // un guasto sulla scrittura del .figure.json non ferma .txt e indice
        const casa2 = casaElabora({ risposte: RISPOSTE_UDII4, saveFallisce: d => /\.figure\.json$/.test(d.relPath) });
        return fonteLetta(casa2, 'UDII4_Lezione3', 'UDII4_Lezione3.pdf').then(() => casa2.E.flushSourcesToVault({ vaultNuovo: true })).then(ok2 => {
            assert.strictEqual(ok2, true);
            const rel2 = casa2.chiamate.salvati.map(x => x.relPath);
            assert.ok(rel2.includes('Fonti/fonti.json') && rel2.some(r => /\.txt$/.test(r)), rel2.join(' '));
        });
    }).then(() => {
        // vault che c'era e senza Fonti/: niente, neanche il .figure.json (ADR 0011 rev. 1)
        const casa3 = casaElabora({ risposte: RISPOSTE_UDII4 });
        return fonteLetta(casa3, 'UDII4_Lezione3', 'UDII4_Lezione3.pdf').then(() => casa3.E.flushSourcesToVault({ vaultNuovo: false })).then(ok3 => {
            assert.strictEqual(ok3, false);
            assert.strictEqual(casa3.chiamate.salvati.length, 0);
        });
    }).then(() => {
        // un PDF senza lettura delle figure (nessun dossier in memoria): .txt e indice sì, .figure.json no
        const casa4 = casaElabora({});
        const file = { name: 'solo-testo.pdf', type: 'application/pdf', size: 10, arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)) };
        casa4.ctx.appState.sources.push({ id: 's1', type: 'pdf', name: 'solo-testo.pdf', content: 'parola '.repeat(60), file });
        return casa4.E.flushSourcesToVault({ vaultNuovo: true }).then(ok4 => {
            assert.strictEqual(ok4, true);
            const rel4 = casa4.chiamate.salvati.map(x => x.relPath);
            assert.ok(rel4.includes('Fonti/fonti.json') && !rel4.some(r => /\.figure\.json$/.test(r)), rel4.join(' '));
        });
    });
});

test('lotto 8: la vista «Figure» della fonte — prima i gialli e i «forse manca» con l\'immagine del ritaglio, poi i rossi «esclusi» con la conferma, poi le letture concordi, in fondo foto e «nessun testo» con «Leggi comunque»; il lessico dell\'ADR §5.6, mai i colori da soli; senza letture il segmento non c\'è', () => {
    // UDII4: p1-1 «nessun testo» da tutti e due (saltato), p2-1 giallo (4 valvassini contro 3), p2-2 giallo con un «forse manca» del controllo, p3-1 rosso (lettura vuota del titolare)
    const risposte = {
        [F.MODELLI.TITOLARE]: p => { const n = nomeDiPayload(p); return n === 'p1-1' ? '[FOTO]\nnessun testo' : (n === 'p3-1' ? '' : GEMMA_UDII4[n]); },
        [F.MODELLI.CONTROLLO]: p => { const n = nomeDiPayload(p); return n === 'p1-1' ? '[FOTO]\nnessun testo' : (n === 'p2-2' ? COLONNA_LETTA + '\nE. Il re convoca i vassalli alla dieta di primavera' : QWEN_UDII4[n]); }
    };
    const casa = casaElabora({ risposte, fontiFiles: FONTI_UDII4 });
    return fonteLetta(casa, 'UDII4_Lezione3', 'UDII4_Lezione3.pdf').then(({ lettura }) => {
        eqJ(lettura.dossier.ritagli.map(r => r.stato), [null, 'giallo', 'giallo', 'rosso']);
        assert.ok(lettura.dossier.ritagli[2].forseManca.length === 1);
        casa.E.setSrcView('figure');
        const h = casa.html();
        assert.ok(h.includes('Testo delle figure'), 'la sezione');
        // 0114 lotto 3 (D1): il segmento «Figure» nella testata della fonte NON c'è più — la vista si apre dalla tabella «Figure» della console
        assert.ok(!/setSrcView\((&#39;|&apos;|')figure/.test(h), 'il segmento «Figure» tolto dalla testata (0114 D1)');
        const pos = re => { const m = re.exec(h); return m ? m.index : -1; };
        const iG1 = pos(/data-fig-stato="giallo"/), iR = pos(/data-fig-stato="rosso"/), iV = pos(/data-fig-stato="verde"/), iS = pos(/data-fig-stato="saltato"/);
        assert.ok(iG1 >= 0 && iR > iG1 && iS > iR, 'ordine gialli → rossi → saltati: ' + [iG1, iR, iV, iS].join(' '));
        assert.strictEqual(iV, -1, 'nessun verde in questa lettura');
        // il lessico dell'ADR §5.6
        assert.ok(h.includes('le due letture divergono: controlla') && h.includes('escluso') && h.includes('forse manca'));
        assert.ok(!/>\s*(giallo|rosso|verde)\s*</i.test(h), 'i colori da soli non sono un lessico');
        // i gialli: la riga divergente (il quarto valvassino) segnata, il «forse manca» del controllo, l'immagine del ritaglio accanto
        const gialli = h.slice(iG1, iR);
        // 0114 lotto 3: la riga divergente porta davanti la spunta «va bene» (interruttore di serie 'entrambe')
        assert.ok(/elab-fig-riga-div[^>]*>(<label><input[^>]*> <span[^>]*>va bene<\/span> )?valvassino</.test(gialli), 'la riga divergente');
        assert.ok(/elab-fig-riga-forse[^>]*>.*Il re convoca i vassalli/.test(gialli), 'la riga che ha solo il controllo');
        assert.strictEqual((gialli.match(/data-fig-img=/g) || []).length, 2, 'un\'immagine per ritaglio giallo');
        // il rosso: «escluso», la conferma, «Leggi comunque»; le due letture mostrate
        const rosso = h.slice(iR, iS);
        assert.ok(/figConferma\(/.test(rosso) && /figLeggi\(/.test(rosso) && /Osserva i signori/.test(rosso), rosso.slice(0, 300));
        // la foto «nessun testo» in fondo con «Leggi comunque», senza conferma
        const coda = h.slice(iS);
        assert.ok(/Leggi comunque/.test(coda) && /figLeggi\(/.test(coda) && !/figConferma\(/.test(coda));
        // la casella del testo corretto su ogni ritaglio letto (non sui saltati)
        assert.strictEqual((h.match(/figSalva\(/g) || []).length, 3);
        // nessun elenco dei toponimi nel repo: nessuna parola sottolineata
        assert.ok(!/elab-fig-toponimo/.test(h));
        // le immagini dei ritagli si disegnano dal PDF (ritaglia del modulo), dopo il disegno della vista
        return riposoFig().then(() => {
            const src = casa.dom.$('img[data-fig-img]').first().attr('src') || '';
            assert.ok(src.startsWith('data:image/jpeg'), 'l\'immagine del ritaglio: ' + src.slice(0, 30));
        });
    }).then(() => {
        const vuota = casaElabora({});
        const file = { name: 'solo-testo.pdf', type: 'application/pdf', size: 10, arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)) };
        vuota.ctx.appState.sources.push({ id: 's1', type: 'pdf', name: 'solo-testo.pdf', content: 'parola '.repeat(60), file });
        vuota.E.setSrcView('figure');
        const h2 = vuota.html();
        assert.ok(!h2.includes('Testo delle figure'), 'senza letture la vista «Figure» torna al testo');
    });
});

test('gate 3 (19/10): su una mappa riaperta dal vault la fonte non ha un File: il dossier e il PDF si leggono da Fonti/ con readVaultFile e l\'immagine del ritaglio si disegna lo stesso', () => {
    const prima = casaElabora({ risposte: RISPOSTE_UDII4 });
    return fonteLetta(prima, 'UDII4_Lezione3', 'UDII4_Lezione3.pdf').then(({ lettura }) => {
        const dossier = JSON.parse(JSON.stringify(lettura.dossier));
        // la seduta nuova: niente File, niente prova in memoria, solo il vault (il fake di readVaultFile risponde col dossier per ogni percorso)
        const dopo = casaElabora({ risposte: RISPOSTE_UDII4, dossierSuDisco: dossier });
        dopo.ctx.appState.sources.push({ id: 'source-1', type: 'pdf', name: 'UDII4_Lezione3.pdf', content: 'Testo estratto di prova dalla scheda. '.repeat(8) });
        // pdf.js finto: i byte letti dal vault aprono il documento della fixture (il banco di ELABORA non ha pdf.js)
        dopo.ctx.pdfjsLib = { getDocument: () => ({ promise: Promise.resolve(dopo.pdfFinto('UDII4_Lezione3')._pdf) }) };
        // la prima apertura cerca il dossier nel vault (asincrono) e ridisegna quando arriva; poi si apre il segmento «Figure»
        return Promise.resolve(dopo.E.setSrcView('figure')).then(() => riposoFig(20)).then(() => dopo.E.setSrcView('figure')).then(() => riposoFig(30)).then(() => {
            const h = dopo.html();
            assert.ok(h.includes('Testo delle figure'), 'la sezione c\'è anche senza la prova in memoria');
            const letti = dopo.chiamate.letti.map(d => d.relPath);
            assert.ok(letti.some(r => /\.figure\.json$/.test(r)), 'il dossier dal vault: ' + letti.join(', '));
            assert.ok(letti.some(r => r === 'Fonti/UDII4_Lezione3.pdf'), 'il PDF dal vault, non da un File: ' + letti.join(', '));
            const src = dopo.dom.$('img[data-fig-img]').first().attr('src') || '';
            assert.ok(src.startsWith('data:image/jpeg'), 'l\'immagine del ritaglio: ' + src.slice(0, 30));
            assert.strictEqual(dopo.chiamate.infomaniak.length + dopo.chiamate.gemini.length, 0, 'disegnare non costa chiamate');
        });
    });
});

test('lotto 8: «Leggi comunque» su una foto «nessun testo» la manda al titolare (1 chiamata) e, se legge testo, al controllo (2); l\'esito va nel dossier e nel .figure.json del vault', () => {
    let ancora = true;
    const risposte = {
        [F.MODELLI.TITOLARE]: p => (nomeDiPayload(p) === 'p1-1' && ancora ? '[FOTO]\nnessun testo' : GEMMA_UDII4[nomeDiPayload(p)]),
        [F.MODELLI.CONTROLLO]: p => (nomeDiPayload(p) === 'p1-1' && ancora ? '[FOTO]\nnessun testo' : QWEN_UDII4[nomeDiPayload(p)])
    };
    const casa = casaElabora({ risposte, fontiFiles: FONTI_UDII4 });
    return fonteLetta(casa, 'UDII4_Lezione3', 'UDII4_Lezione3.pdf').then(({ lettura }) => {
        const d = lettura.dossier;
        assert.strictEqual(d.ritagli[0].stato, null);
        assert.strictEqual(casa.chiamate.infomaniak.length, 8);
        casa.E.setSrcView('figure');
        // il titolare dice ancora «nessun testo»: una chiamata e basta, resta saltato
        return casa.E.figLeggi(indiceDi(casa, d.ritagli[0].identita)).then(() => {
            assert.strictEqual(casa.chiamate.infomaniak.length, 9, 'solo il titolare');
            assert.strictEqual(d.ritagli[0].stato, null);
            assert.ok(/nessun testo/.test(d.ritagli[0].motivo));
            ancora = false;
            return casa.E.figLeggi(indiceDi(casa, d.ritagli[0].identita));
        }).then(() => {
            assert.strictEqual(casa.chiamate.infomaniak.length, 11, 'il titolare legge testo → il controllo');
            const v = d.ritagli[0];
            eqJ([v.stato, v.chiamate, v.caso], ['verde', 2, 3]);
            assert.ok(/su richiesta/.test(v.motivo), v.motivo);
            const fj = casa.chiamate.salvati.filter(x => x.relPath === 'Fonti/UDII4_Lezione3.figure.json');
            assert.ok(fj.length >= 1, 'scritto nel vault');
            assert.strictEqual(JSON.parse(fj[fj.length - 1].text).ritagli[0].stato, 'verde');
            assert.ok(fj.every(x => !/\/Users\//.test(x.text)));
            // la vista ora lo dà fra le letture concordi
            const h = casa.html();
            assert.ok(/data-fig-stato="verde"/.test(h) && h.includes('due letture concordi'));
        });
    });
});

test('lotto 8: «Rileggi con Google» su una pagina scansione — la riga d\'avviso dell\'ADR §5.8 prima, poi la pagina intera a Gemini con la chiave Google e mai col token Infomaniak; «No» non chiama; senza la chiave il bottone non c\'è e nessuna chiamata', () => {
    const casa = casaElabora({ chiaveGoogle: 'AIzaChiaveGoogleDiProva', ocr: () => 'parole lette dal solo tesseract sulla pagina', risposte: { [F.MODELLI.GOOGLE]: () => '[TITOLO] Tenochtitlan\n[TESTO] La città sul lago' },
        fontiFiles: () => [{ name: 'aztechi.pdf', relPath: 'Fonti/aztechi.pdf', size: 10, ext: 'pdf' }] });
    let aperta = null;
    casa.ctx.MappAIModal = { open: s => { aperta = s; return Promise.resolve({ azione: 'si' }); } };
    return fonteLetta(casa, 'FOCUS-STORIA-Aztechi', 'aztechi.pdf').then(({ lettura }) => {
        const d = lettura.dossier;
        assert.ok(d.ritagli.length === 4 && d.ritagli.every(r => r.stato === 'rosso' && r.nota === 'parziale'));
        casa.E.setSrcView('figure');
        const h = casa.html();
        assert.ok(/Rileggi con Google/.test(h) && h.includes('escluso') && /parziale/.test(h), 'la pagina scansione esclusa, col bottone');
        return casa.E.figRileggiGoogle(indiceDi(casa, d.ritagli[1].identita)).then(() => {
            assert.ok(aperta && /esce dalla Svizzera/.test(JSON.stringify(aperta)) && /nomi di allievi/.test(JSON.stringify(aperta)), 'la riga d\'avviso prima dell\'invio');
            assert.ok(aperta.azioni.find(a => a.ruolo === 'primario').id !== 'si', 'Google non è mai la scelta di serie');
            assert.strictEqual(casa.chiamate.gemini.length, 1);
            assert.strictEqual(casa.chiamate.infomaniak.length, 0);
            assert.strictEqual(casa.chiamate.gemini[0].apiKey, 'AIzaChiaveGoogleDiProva');
            assert.strictEqual(casa.chiamate.gemini[0].model, F.MODELLI.GOOGLE);
            assert.ok(casa.chiamate.gemini[0].payload.contents[0].parts[1].text.startsWith(casa.ctx.systemPromptsConfig.LETTURA_IMMAGINI_SCANSIONE_IT));
            const v = d.ritagli[1];
            eqJ([v.stato, v.chiamate, v.modelli.titolare, v.tipo], ['giallo', 1, F.MODELLI.GOOGLE, 'SCANSIONE']);
            assert.ok(/Tenochtitlan/.test(v.letture.titolare));
            assert.strictEqual(d.ritagli[0].stato, 'rosso', 'le altre pagine restano come erano');
            assert.ok(casa.chiamate.salvati.some(x => x.relPath === 'Fonti/aztechi.figure.json'), 'scritto nel vault');
            // «No, continua senza» → nessuna chiamata
            casa.ctx.MappAIModal = { open: () => Promise.resolve({ azione: 'no' }) };
            return casa.E.figRileggiGoogle(indiceDi(casa, d.ritagli[2].identita));
        }).then(() => {
            assert.strictEqual(casa.chiamate.gemini.length, 1);
            assert.strictEqual(d.ritagli[2].stato, 'rosso');
        });
    }).then(() => {
        // senza la chiave Google: niente bottone, e la chiamata non parte neanche col token Infomaniak nel cassetto
        const senza = casaElabora({ chiaveGoogle: '', tokenInfomaniak: 'TokInfomaniakDiProva_0123', ocr: () => 'parole lette dal solo tesseract' });
        senza.ctx.MappAIModal = { open: () => Promise.resolve({ azione: 'si' }) };
        return fonteLetta(senza, 'FOCUS-STORIA-Aztechi', 'aztechi.pdf').then(({ lettura }) => {
            senza.E.setSrcView('figure');
            assert.ok(!/figRileggiGoogle\(/.test(senza.html()), 'senza chiave niente bottone');
            return senza.E.figRileggiGoogle(indiceDi(senza, lettura.dossier.ritagli[0].identita)).then(() => {
                assert.strictEqual(senza.chiamate.gemini.length + senza.chiamate.infomaniak.length, 0);
                assert.strictEqual(lettura.dossier.ritagli[0].stato, 'rosso');
            });
        });
    });
});

test('lotto 8: una correzione del docente finisce in testoCorretto, nel .figure.json e nel blocco della pagina alla generazione successiva (senza il segno, zero chiamate); un rosso confermato entra', () => {
    const risposte = { [F.MODELLI.TITOLARE]: p => (nomeDiPayload(p) === 'p3-1' ? '' : GEMMA_UDII4[nomeDiPayload(p)]), [F.MODELLI.CONTROLLO]: p => QWEN_UDII4[nomeDiPayload(p)] };
    const casa = casaElabora({ risposte, fontiFiles: FONTI_UDII4 });
    const CORRETTO = 'IMPERATORE\nVASSALLO\nvalvassore valvassore\nvalvassino valvassino valvassino valvassino';
    return fonteLetta(casa, 'UDII4_Lezione3', 'UDII4_Lezione3.pdf').then(({ prova, lettura }) => {
        const d = lettura.dossier;
        const giallo = d.ritagli.find(r => r.stato === 'giallo'), rosso = d.ritagli.find(r => r.stato === 'rosso');
        assert.ok(giallo && rosso);
        assert.ok(lettura.pagine[1].blocco.indexOf('⟦da controllare: valvassino⟧') > 0, lettura.pagine[1].blocco);
        assert.strictEqual(lettura.pagine[2].blocco, '', 'il rosso non entra');
        casa.E.setSrcView('figure');
        return casa.E.figSalva(indiceDi(casa, giallo.identita), CORRETTO).then(() => {
            assert.strictEqual(giallo.testoCorretto, CORRETTO);
            const fj = casa.chiamate.salvati.filter(x => x.relPath === 'Fonti/UDII4_Lezione3.figure.json');
            assert.strictEqual(fj.length, 1, 'una scrittura del .figure.json');
            assert.ok(JSON.parse(fj[0].text).ritagli.some(r => r.testoCorretto === CORRETTO));
            assert.ok(/corretto dal docente/.test(casa.html()), 'la vista lo dice');
            return casa.E.figConferma(indiceDi(casa, rosso.identita));
        }).then(() => {
            assert.ok(rosso.confermato, 'la conferma resta sulla voce');
            // 0114, dal gate 3 (Giacomo, 21/10): l'etichetta dice «controllata» (era «controllata dal docente»), anche sul rosso confermato
            assert.ok(/elab-fig-badge-ok[^>]*>controllata</.test(casa.html()), 'l\'etichetta «controllata» sul rosso confermato');
            const n = casa.chiamate.infomaniak.length;
            // la generazione successiva (CREA) sulla stessa prova: zero chiamate, il testo corretto senza il segno, il rosso confermato dentro
            return casa.M.leggi(prova, { origine: 'crea', nome: 'UDII4_Lezione3.pdf' }).then(u => {
                assert.strictEqual(casa.chiamate.infomaniak.length, n, 'nessuna chiamata nuova');
                const b2 = u.pagine[1].blocco;
                assert.ok(b2.indexOf('valvassino valvassino valvassino valvassino') > 0 && b2.indexOf('⟦') < 0, b2);
                assert.ok(u.pagine[2].blocco.indexOf('Osserva i signori') > 0, 'il rosso confermato entra con la lettura che c\'è: ' + u.pagine[2].blocco);
                // una correzione vuota la toglie
                return casa.E.figSalva(indiceDi(casa, giallo.identita), '   ').then(() => assert.strictEqual(giallo.testoCorretto, null));
            });
        });
    });
});

/* ══════════════════════════════════════════════════════════════════════════════
   PACKET 0114, LOTTO 1 — ADR 0024 revisione 1, punti 2 e 3: la R5 sulle righe consecutive del controllo, i «forse manca»
   già contenuti in una riga del titolare non si elencano, il giallo controllato dal docente entra senza il segno.
   ══════════════════════════════════════════════════════════════════════════════ */
const R5_GATE = SMIST.r5;
// una riga della fixture («f → c», «s1 s2») diventa testo: ogni parte è fatta di parole sintetiche piene, uguali nelle due letture
function rigaDaParti(riga, parti) {
    return riga.split(' ').map(tok => tok === '→' ? '→' : Array.from({ length: parti[tok] }, (_, k) => parolaN('parte' + tok, k)).join(' ')).join(' ');
}
const letturaDaParti = (caso, chi) => F.lettore('[' + caso.tipo + ']\n' + caso[chi].map(r => rigaDaParti(r, caso.parti)).join('\n'));

test('0114 R5: freccia e frase su una riga del titolare, spezzate su due righe consecutive del controllo → verde, nessun «forse manca»', () => {
    const a = F.accordo(F.lettore('[TESTO]\nFeudi → Consiglio e aiuto'), F.lettore('[TESTO]\nFeudi →\nConsiglio e aiuto'));
    assert.deepStrictEqual(a.righe.map(r => r.verde), [true]);
    assert.strictEqual(a.forseManca.length, 0);
    assert.strictEqual(F.stato({ accordo: a, letture: 2, provider: 'infomaniak' }).stato, 'verde');
    // anche sugli schemi: le righe del controllo prese insieme non contano come etichette sole («consiglio e aiuto 0/1»)
    const s = F.accordo(F.lettore('[SCHEMA]\nFeudi → Consiglio e aiuto'), F.lettore('[SCHEMA]\nFeudi\nConsiglio e aiuto'));
    assert.deepStrictEqual(s.righe.map(r => r.verde), [true]);
    assert.deepStrictEqual(s.etichetteDiverse, []);
    assert.strictEqual(F.stato({ accordo: s, letture: 2, provider: 'infomaniak' }).stato, 'verde');
    // tre righe consecutive (la freccia sola in mezzo) valgono come due
    const tre = F.accordo(F.lettore('[SCHEMA]\nFeudi → Consiglio e aiuto'), F.lettore('[SCHEMA]\nFeudi\n→\nConsiglio e aiuto'));
    assert.deepStrictEqual(tre.righe.map(r => r.verde), [true]);
});

test('0114 R5: quattro frecce spezzate più una riga del solo titolare → giallo con UNA riga gialla', () => {
    const tit = F.lettore('[TESTO]\n' + ['Feudi → Consiglio e aiuto', 'Terre → Cavalieri armati', 'Castello → Difesa del villaggio', 'Decime → Protezione spirituale', 'Mulino del signore riservato'].join('\n'));
    const con = F.lettore('[TESTO]\n' + ['Feudi →', 'Consiglio e aiuto', 'Terre →', 'Cavalieri armati', 'Castello →', 'Difesa del villaggio', 'Decime →', 'Protezione spirituale'].join('\n'));
    const a = F.accordo(tit, con);
    assert.deepStrictEqual(a.righe.map(r => r.verde), [true, true, true, true, false]);
    assert.strictEqual(a.forseManca.length, 0);
    const st = F.stato({ accordo: a, letture: 2, provider: 'infomaniak' });
    assert.strictEqual(st.stato, 'giallo');
    assert.strictEqual(st.righe.filter(r => !r.verde).length, 1);
});

test('0114 R5: righe sparse del controllo non valgono; una riga inventata resta gialla anche se le parole stanno su righe consecutive', () => {
    // la frase della freccia sta tre righe più giù: non sono consecutive (Giacomo, bivio 5: «solo consecutive»)
    const sparse = F.accordo(F.lettore('[TESTO]\nFeudi → Consiglio e aiuto'), F.lettore('[TESTO]\nFeudi →\nCastello del signore\nMulino del villaggio\nConsiglio e aiuto'));
    assert.deepStrictEqual(sparse.righe.map(r => r.verde), [false]);
    // una parola piena che il controllo non ha («cavalli») tiene gialla la riga
    const inventata = F.accordo(F.lettore('[TESTO]\nFeudi → Consiglio e cavalli'), F.lettore('[TESTO]\nFeudi →\nConsiglio e aiuto'));
    assert.deepStrictEqual(inventata.righe.map(r => r.verde), [false]);
    // la finestra non ruba righe già abbinate a un'altra riga del titolare (uno a uno: 4 valvassini contro 3 resta giallo)
    const a = F.accordo(F.lettore('[SCHEMA]\n' + VALVASSINI_4), F.lettore('[SCHEMA]\n' + VALVASSINI_3));
    assert.strictEqual(a.righe.filter(r => !r.verde).length, 1);
    assert.strictEqual(F.stato({ accordo: a, letture: 2, provider: 'infomaniak' }).stato, 'giallo');
});

test('0114 R5: le righe del controllo già contenute in una riga gialla o verde del titolare non sono «forse manca»; le altre sì', () => {
    const tit = F.lettore('[TESTO]\nI vassalli ricevono terre dal signore feudale\nIl castello domina la valle');
    const con = F.lettore('[TESTO]\nI vassalli ricevono terre\nIl castello sorge sulla collina\nIl mulino appartiene al signore');
    const a = F.accordo(tit, con);
    assert.deepStrictEqual(a.righe.map(r => r.verde), [false, false]);
    assert.deepStrictEqual(a.forseManca, ['Il castello sorge sulla collina', 'Il mulino appartiene al signore'], '«I vassalli ricevono terre» sta già nella prima riga del titolare');
});

test('0114 R5 sulla forma dei due schemi del gate 3 (UDII4 p.2): a destra da rosso a giallo con 4 righe, a sinistra giallo senza «forse manca»', () => {
    assert.strictEqual(R5_GATE.casi.length, 2);
    R5_GATE.casi.forEach(caso => {
        const a = F.accordo(letturaDaParti(caso, 'titolare'), letturaDaParti(caso, 'controllo'));
        const st = F.stato({ accordo: a, letture: 2, provider: 'infomaniak' });
        assert.deepStrictEqual({ stato: st.stato, gialle: st.righe.filter(r => !r.verde).length, forseManca: st.forseManca.length }, caso.dopo, caso.nome);
    });
});

test('0114 giallo controllato dal docente: con `confermato` entra come verde, senza il segno; con `righeConfermate` il segno resta solo sulle righe non confermate', () => {
    const { M } = casaModulo();
    const giallo = { stato: 'giallo', righe: [{ testo: 'IMPERATORE', verde: true }, { testo: 'Feudi → Consiglio e aiuto', verde: false }, { testo: 'valvassino', verde: false }] };
    // di partenza: le righe gialle entrano col segno
    const blocco = l => F.marcatori.figure(2, [l], { lingua: 'it' });
    assert.ok(blocco(M.letturaDiVoce(giallo)).indexOf(F.SEGNO_APRE) > 0);
    // figura intera «Va bene così»
    const tutta = M.letturaDiVoce(Object.assign({}, giallo, { confermato: '2026-10-20T10:00:00.000Z' }));
    assert.strictEqual(tutta.stato, 'verde');
    assert.ok(tutta.righe.every(r => r.verde));
    assert.strictEqual(blocco(tutta).indexOf(F.SEGNO_APRE), -1, 'nessun segno: ' + blocco(tutta));
    assert.ok(blocco(tutta).indexOf('Feudi → Consiglio e aiuto') > 0, 'entra con la lettura che ha');
    // riga per riga: solo «valvassino» resta segnata
    const righe = M.letturaDiVoce(Object.assign({}, giallo, { righeConfermate: ['Feudi → Consiglio e aiuto'] }));
    assert.deepStrictEqual(righe.righe.map(r => r.verde), [true, true, false]);
    const b = blocco(righe);
    assert.ok(b.indexOf(F.SEGNO_APRE + 'valvassino. ' + F.SEGNO_CHIUDE) > 0, b);
    assert.strictEqual((b.match(/⟦da controllare: [^…]/g) || []).length, 1, 'un segno solo, attorno a «valvassino»: ' + b);
    // il verde non ha bisogno di conferma e un rosso senza conferma non entra (come oggi)
    assert.strictEqual(M.letturaDiVoce({ stato: 'rosso', righe: [{ testo: 'x', verde: false }] }).stato, 'rosso');
});

test('0114 D6: le citazioni dell\'àncora (mappai-anchor-core.js, solo letto) non portano la coda «⟧ [/Figure]»: il blocco chiude con un confine di frase prima dei marcatori', () => {
    const A = require('../public/js/mappai-anchor-core.js');
    const pagina = 'Il sistema feudale nasce nel regno dei Franchi dopo la morte di Carlo Magno. I vassalli giurano fedeltà al signore.';
    const casi = {
        'giallo senza punto': [{ stato: 'giallo', righe: [{ testo: 'Feudi → Consiglio e aiuto militare al sovrano', verde: false }, { testo: 'Vassalli ricevono terre dal signore feudale', verde: false }] }],
        'giallo col punto': [{ stato: 'giallo', righe: [{ testo: 'I vassalli concedono parte delle terre ai valvassori.', verde: true }, { testo: 'I valvassini lavorano le terre dei valvassori minori.', verde: false }] }],
        'verde senza punto': [{ stato: 'verde', righe: [{ testo: 'Il re concede i feudi ai grandi vassalli del regno', verde: true }] }],
        'giallo con «?»': [{ stato: 'giallo', righe: [{ testo: 'Chi riceveva il feudo dal re di Francia?', verde: false }] }]
    };
    Object.keys(casi).forEach(nome => {
        const b = F.marcatori.figure(2, casi[nome], { lingua: 'it' });
        const frasi = A.frasiDaPagine([{ n: 2, text: F.marcatori.accoda(pagina, b) }]);
        const conCoda = frasi.filter(f => /⟧|\[\/Figure\]/.test(f.text)).map(f => f.text);
        assert.deepStrictEqual(conCoda, [], nome + ': ' + b);
        // il testo letto resta tutto, e il segno si chiude ancora
        assert.ok(b.endsWith(' [/Figure]'), b);
        if (/giallo/.test(nome)) assert.ok(b.indexOf(F.SEGNO_CHIUDE + ' [/Figure]') > 0, b);
    });
    // anche il blocco delle formule e quello del testo a immagini
    const fo = F.marcatori.formule(5, [{ n: 1, formula: '2x + 3 > 7', soluzione: 'S = ]2; +∞[' }], { lingua: 'it' });
    const ti = F.marcatori.testoImmagini(3, ['Il vassallo ripone le mani giunte in quelle del signore'], { lingua: 'it' });
    [fo, ti].forEach(b => assert.deepStrictEqual(A.frasiDaPagine([{ n: 1, text: F.marcatori.accoda(pagina, b) }]).filter(f => /⟧|\[\/(Formule|Testo a immagini)\]/.test(f.text)).map(f => f.text), [], b));
});

/* ══════════════════════════════════════════════════════════════════════════════
   PACKET 0114, LOTTO 2 — il deposito per impronta (ADR 0024 revisione 1, punto 1): `Sistema/Figure/<impronta>.figure.json` nella
   radice di «MappAI - file», scritto appena un ritaglio è letto; si cerca prima lì, poi nel vault; vince la voce più recente.
   ══════════════════════════════════════════════════════════════════════════════ */
const RADICE = '/Users/prova/Documents/MappAI - file';
const DEP = 'Sistema/Figure/impr0113.figure.json';
const nelDeposito = disco => Object.keys(disco).filter(k => k.indexOf(RADICE + '|Sistema/Figure/') === 0);

test('0114 lotto 2: FilesCore apre il solo percorso del deposito delle figure (Giacomo: «apri il percorso»)', () => {
    assert.strictEqual(FILES_CORE.FIGURE, 'Figure');
    assert.strictEqual(FILES_CORE.depositoFigure(), 'Sistema/Figure');
    assert.strictEqual(FILES_CORE.depositoFigure('impr.figure.json'), 'Sistema/Figure/impr.figure.json');
    ['Sistema/Figure/impr0113.figure.json', 'Sistema/Figure/indice.json'].forEach(p => assert.strictEqual(FILES_CORE.sanitizeVaultRelPath(p), p, p));
    ['Sistema/Figure/../x.json', 'Sistema/Figure/a/b.json', 'Sistema/Altro/x.json', 'Sistema/Figure/x.pdf', 'Sistema/x.json', 'Figure/x.json', '/Sistema/Figure/x.json']
        .forEach(p => assert.strictEqual(FILES_CORE.sanitizeVaultRelPath(p), null, p));
});

test('0114 lotto 2: dossier.unisci tiene per ogni ritaglio la voce più recente (data, correzione, conferma) e dice chi va riscritto', () => {
    const vecchio = F.dossier.nuovo({ impronta: 'i1', file: 'Fonti/a.pdf' }), nuovo = F.dossier.nuovo({ impronta: 'i1', file: 'Fonti/a.pdf' });
    vecchio.ritagli = [F.dossier.ritaglio({ identita: 'x', stato: 'giallo', data: '2026-10-19T10:00:00.000Z' }), F.dossier.ritaglio({ identita: 'y', stato: 'verde', data: '2026-10-19T10:00:00.000Z' })];
    nuovo.ritagli = [F.dossier.ritaglio({ identita: 'x', stato: 'giallo', data: '2026-10-19T10:00:00.000Z', confermato: '2026-10-20T09:00:00.000Z' }), F.dossier.ritaglio({ identita: 'z', stato: 'rosso', data: '2026-10-20T08:00:00.000Z' })];
    nuovo.google = 'no';
    const u = F.dossier.unisci(vecchio, nuovo);
    eqJ(u.dossier.ritagli.map(v => v.identita).sort(), ['x', 'y', 'z']);
    assert.strictEqual(u.dossier.ritagli.find(v => v.identita === 'x').confermato, '2026-10-20T09:00:00.000Z', 'la conferma è più recente');
    assert.strictEqual(u.dossier.google, 'no');
    eqJ([u.cambiaA, u.cambiaB], [true, true]);
    const solo = F.dossier.unisci(vecchio, null);
    assert.strictEqual(solo.dossier, vecchio);
    eqJ([solo.cambiaA, solo.cambiaB], [false, true]);
    eqJ(F.dossier.unisci(null, null), { dossier: null, cambiaA: false, cambiaB: false });
});

test('0114 lotto 2: UDII4 letto in una mappa, poi HOME (memoria nuova) e una mappa nuova con lo stesso PDF → zero chiamate e la correzione del docente c\'è', () => {
    const disco = {};
    const casa = casaModulo({ risposte: RISPOSTE_UDII4, disco, radice: RADICE });
    let identitaGiallo;
    return casa.M.decidi(provaCon(casa, 'UDII4_Lezione3')).then(pr => casa.M.leggi(pr, { origine: 'crea', nome: 'UDII4_Lezione3.pdf' })).then(u => {
        assert.strictEqual(casa.chiamate.infomaniak.length, 8);
        const scritture = casa.chiamate.salvati.filter(s => s.vaultPath === RADICE && s.relPath === DEP);
        assert.ok(scritture.length >= 4, 'una scrittura del deposito dopo ogni ritaglio letto: ' + scritture.length);
        assert.ok(JSON.parse(scritture[0].text).ritagli.length < 4, 'la prima scrittura arriva prima della fine del giro');
        const dep = JSON.parse(disco[RADICE + '|' + DEP]);
        eqJ([dep.impronta, dep.file, dep.ritagli.length], ['impr0113', 'Fonti/UDII4_Lezione3.pdf', 4]);
        assert.ok(disco[RADICE + '|' + DEP].indexOf(RADICE) < 0 && !/"\/Users\//.test(disco[RADICE + '|' + DEP]), 'nessun percorso assoluto nel deposito');
        eqJ(JSON.parse(disco[RADICE + '|Sistema/Figure/indice.json']), { 'UDII4_Lezione3.pdf': 'impr0113' });
        identitaGiallo = u.dossier.ritagli[1].identita;
        // in ELABORA il docente corregge lo schema: si scrive nel vault della mappa E nel deposito
        return casa.M.correggi('impr0113', identitaGiallo, 'IMPERATORE VASSALLO scritto dal docente', { vaultPath: '/mappe/Mappa uno' });
    }).then(() => {
        assert.ok(/scritto dal docente/.test(disco['/mappe/Mappa uno|Fonti/UDII4_Lezione3.figure.json']), 'la copia nel vault');
        assert.ok(/scritto dal docente/.test(disco[RADICE + '|' + DEP]), 'il deposito');
        // HOME: `location.reload()` svuota la memoria; resta il disco. Mappa nuova (il vault non c'è ancora) con lo stesso PDF
        const casa2 = casaModulo({ risposte: RISPOSTE_UDII4, disco, radice: RADICE });
        return casa2.M.decidi(provaCon(casa2, 'UDII4_Lezione3')).then(pr => casa2.M.leggi(pr, { origine: 'crea', nome: 'UDII4_Lezione3.pdf' })).then(u2 => {
            assert.strictEqual(casa2.chiamate.infomaniak.length + casa2.chiamate.gemini.length, 0, 'lo stesso PDF non si rilegge e non si ripaga');
            const p2 = u2.pagine.find(p => p.numero === 2);
            assert.ok(p2.blocco.indexOf('IMPERATORE VASSALLO scritto dal docente') > 0, p2.blocco);
            assert.ok(p2.blocco.indexOf(F.SEGNO_APRE) < 0, 'il testo del docente entra senza il segno');
            // e ELABORA, che cerca per nome, trova il dossier dal deposito anche senza il vault della mappa nuova
            return casa2.M.trovaDossier({ nome: 'UDII4_Lezione3.pdf' });
        }).then(d => assert.ok(d && d.ritagli.find(v => v.identita === identitaGiallo).testoCorretto));
    });
});

test('0114 lotto 2: senza radice (reader, prove) o con le figure spente il deposito non si tocca e tutto va come prima', () => {
    const senza = { disco: {} }, nulla = { disco: {} }, spento = { disco: {} };
    const giro = (cfg) => { const casa = casaModulo(Object.assign({ risposte: RISPOSTE_UDII4 }, cfg)); return casa.M.decidi(provaCon(casa, 'UDII4_Lezione3')).then(pr => casa.M.leggi(pr, { origine: 'crea', nome: 'UDII4_Lezione3.pdf' })).then(u => ({ casa, u })); };
    return Promise.all([giro(senza), giro(Object.assign(nulla, { radice: null })), giro(Object.assign(spento, { radice: RADICE, localStorage: { mappai_figure: '0' } }))]).then(r => {
        assert.strictEqual(r[0].casa.chiamate.infomaniak.length, 8);
        assert.strictEqual(r[1].casa.chiamate.infomaniak.length, 8);
        assert.strictEqual(r[2].u.spento, true);
        [senza, nulla, spento].forEach((c, i) => eqJ([i, nelDeposito(c.disco)], [i, []]));
    });
});

test('0114 lotto 2: deposito più recente del vault → vince il deposito e il vault viene riscritto; la risposta «No» a Google sta nel deposito', () => {
    const disco = {};
    const vecchio = F.dossier.nuovo({ impronta: 'impr0113', file: 'Fonti/UDII4_Lezione3.pdf' });
    vecchio.ritagli = [F.dossier.ritaglio({ identita: 'impr0113|2|1', stato: 'giallo', data: '2026-10-19T10:00:00.000Z' })];
    const recente = JSON.parse(JSON.stringify(vecchio));
    recente.ritagli[0].confermato = '2026-10-20T09:00:00.000Z';
    recente.google = 'no';
    disco['/mappe/Mappa uno|Fonti/UDII4_Lezione3.figure.json'] = JSON.stringify(vecchio);
    disco[RADICE + '|' + DEP] = JSON.stringify(recente);
    disco[RADICE + '|Sistema/Figure/indice.json'] = JSON.stringify({ 'UDII4_Lezione3.pdf': 'impr0113' });
    const casa = casaModulo({ disco, radice: RADICE });
    return casa.M.trovaDossier({ nome: 'UDII4_Lezione3.pdf', vaultPath: '/mappe/Mappa uno' }).then(d => {
        assert.strictEqual(d.ritagli[0].confermato, '2026-10-20T09:00:00.000Z');
        assert.strictEqual(d.google, 'no', 'la risposta a Google vale per quel PDF in ogni mappa');
        const nelVault = JSON.parse(disco['/mappe/Mappa uno|Fonti/UDII4_Lezione3.figure.json']);
        assert.strictEqual(nelVault.ritagli[0].confermato, '2026-10-20T09:00:00.000Z', 'il più recente si ricopia nel vault');
    });
});

/* ══════════════════════════════════════════════════════════════════════════════
   PACKET 0114, LOTTO 3 — la vista in ELABORA: la tabella «Figure», la barra sotto la scheda, «Va bene così».
   Il contatore viene da UNA funzione del core (`dossier.daControllare`, §5 del packet, inv. 6); la conferma di una riga
   gialla è `confermaRiga` del modulo, sullo schema di `conferma`.
   ══════════════════════════════════════════════════════════════════════════════ */
test('0114 lotto 3, il core: dossier.daControllare = gialli non controllati + rossi non confermati + non letti; un giallo con tutte le righe gialle in righeConfermate è controllato', () => {
    const D = F.dossier;
    const riga = (testo, verde) => ({ testo, verde });
    const v = {
        gialloNudo: D.ritaglio({ identita: 'g1', stato: 'giallo', righe: [riga('a a', true), riga('b b', false)] }),
        gialloConfermato: D.ritaglio({ identita: 'g2', stato: 'giallo', confermato: '2026-10-20T10:00:00.000Z', righe: [riga('b b', false)] }),
        gialloRigheTutte: D.ritaglio({ identita: 'g3', stato: 'giallo', righe: [riga('a a', true), riga('b  b', false), riga('c c', false)], righeConfermate: ['b b', 'c c'] }),
        gialloRigheMeta: D.ritaglio({ identita: 'g4', stato: 'giallo', righe: [riga('b b', false), riga('c c', false)], righeConfermate: ['b b'] }),
        rossoNudo: D.ritaglio({ identita: 'r1', stato: 'rosso' }),
        rossoConfermato: D.ritaglio({ identita: 'r2', stato: 'rosso', confermato: '2026-10-20T10:00:00.000Z' }),
        verde: D.ritaglio({ identita: 'v1', stato: 'verde' }),
        nonLetto: D.ritaglio({ identita: 'n1', stato: 'non letto' }),
        saltato: D.ritaglio({ identita: 's1', stato: null })
    };
    eqJ(Object.keys(v).map(k => [k, D.controllata(v[k])]), [['gialloNudo', false], ['gialloConfermato', true], ['gialloRigheTutte', true], ['gialloRigheMeta', false],
        ['rossoNudo', false], ['rossoConfermato', true], ['verde', false], ['nonLetto', false], ['saltato', false]]);
    const d = D.nuovo({ impronta: 'x', file: 'Fonti/x.pdf' });
    d.ritagli = Object.values(v);
    assert.strictEqual(D.daControllare(d), 4, 'g1, g4, r1, n1');
    assert.strictEqual(D.daControllare(null), 0);
    assert.strictEqual(D.daControllare({ ritagli: [v.verde, v.saltato, v.gialloConfermato] }), 0);
    // un giallo senza righe (solo le letture grezze) resta da controllare finché non lo si conferma per intero
    assert.strictEqual(D.daControllare({ ritagli: [D.ritaglio({ identita: 'g5', stato: 'giallo', letture: { titolare: 'x', controllo: 'y' } })] }), 1);
});

test('0114 lotto 3, il modulo: confermaRiga aggiunge il testo a righeConfermate (una volta sola), scrive toccato, deposito e vault; con togli lo leva; letturaDiVoce vede la riga verde', () => {
    const disco = {};
    const casa = casaModulo({ risposte: RISPOSTE_UDII4, disco, radice: RADICE });
    return casa.M.decidi(provaCon(casa, 'UDII4_Lezione3')).then(pr => casa.M.leggi(pr, { origine: 'crea', nome: 'UDII4_Lezione3.pdf' })).then(u => {
        const g = u.dossier.ritagli.find(r => r.stato === 'giallo');
        const gialla = g.righe.find(r => r.verde === false);
        assert.ok(g && gialla, 'un giallo con una riga gialla');
        assert.strictEqual(F.dossier.daControllare(u.dossier), 1);
        const prima = casa.chiamate.salvati.length;
        return casa.M.confermaRiga('impr0113', g.identita, '  ' + gialla.testo.replace(/ /g, '  ') + ' ', { vaultPath: '/mappe/Mappa uno' }).then(v => {
            eqJ(v.righeConfermate, [gialla.testo], 'il testo compattato, una volta');
            assert.ok(v.toccato && v.toccato >= v.data, 'toccato scritto');
            assert.ok(!v.confermato, 'la riga non conferma la figura intera');
            return casa.M.confermaRiga('impr0113', g.identita, gialla.testo, { vaultPath: '/mappe/Mappa uno' });
        }).then(v => {
            eqJ(v.righeConfermate, [gialla.testo], 'niente doppioni');
            assert.ok(casa.chiamate.salvati.length > prima, 'scritto dopo il gesto');
            assert.ok(/righeConfermate/.test(disco['/mappe/Mappa uno|Fonti/UDII4_Lezione3.figure.json']), 'la copia nel vault');
            assert.ok(/righeConfermate/.test(disco[RADICE + '|' + DEP]), 'il deposito');
            // l'unica riga gialla è confermata: la figura conta come controllata e entra senza il segno
            assert.strictEqual(F.dossier.daControllare(u.dossier), 0);
            const l = casa.M.letturaDiVoce(g);
            assert.ok(l.righe.every(r => r.verde), 'nessuna riga segnata');
            return casa.M.confermaRiga('impr0113', g.identita, gialla.testo, { vaultPath: '/mappe/Mappa uno', togli: true });
        }).then(v => {
            eqJ(v.righeConfermate, []);
            assert.strictEqual(F.dossier.daControllare(u.dossier), 1, 'tolta la spunta, torna da controllare');
            return casa.M.confermaRiga('impr0113', 'non-esiste', 'x', {}).then(() => assert.fail('doveva rifiutare'), e => assert.ok(/non trovato/.test(e.message)));
        });
    });
});

/* la console di ELABORA (v2) dentro il banco della vista: gli stub sono quelli di tests/elabora-modifica.test.js, ridotti al necessario;
   `schema().tabelle` è l'area con le tabelle «Fonte», «Figure» e i materiali */
function conConsole(casa) {
    const vm = require('node:vm'), fs = require('node:fs'), path = require('node:path');
    const ctx = casa.ctx, calls = { apri: [] };
    let schema = null, box = null;
    /* il DOM finto non ha eventi: qui un bus minimo, perché la vista annuncia (`mappai-figure-cambiata`) e la console ascolta */
    const ascolti = {};
    ctx.document.addEventListener = (tipo, f) => { (ascolti[tipo] = ascolti[tipo] || []).push(f); };
    ctx.document.removeEventListener = (tipo, f) => { ascolti[tipo] = (ascolti[tipo] || []).filter(x => x !== f); };
    ctx.document.dispatchEvent = e => { (ascolti[e.type] || []).slice().forEach(f => f(e)); return true; };
    if (!ctx.CustomEvent) ctx.CustomEvent = function (tipo) { this.type = tipo; };
    function draw(next) {
        casa.dom.document.body.innerHTML = '<div class="mm-box"><div class="mm-console__area">' + (next.tela ? '<div class="mm-tela" data-tela="elab"></div>' : '') + '</div></div>';
        return box = casa.dom.document.querySelector('.mm-box');
    }
    Object.assign(ctx, {
        sessionStorage: { getItem() { return null; }, setItem() { } },
        MappAIDocEditor: { reset() { }, render() { }, assicuraStili() { }, hasUnsaved: () => false, haDocumento: () => false, openSet() { }, openSynthesis() { }, openNodeSheet() { }, openCausal() { } },
        MappAIVaults: { quando() { return () => { }; } },
        MappAIBranchSynthesis: { getData: () => ({ branchLabel: 'Sintesi', mapName: 'UDII4' }) },
        MappAIStudyDocs: { list: () => [], get: () => null },
        MappAICausalCore: { countRows: () => 0, normDoc: d => d, chainsFromDoc: () => ({ total: 0 }) },
        MappAICausal: { buildForCurrentMap: () => ({ total: 0 }), mapName: () => 'UDII4', buildDocHtml: () => '' },
        MappAITeach: {
            mappeDelContesto: async () => [{ id: 'v:' + casa.VP, nome: 'UDII4', v: { fullPath: casa.VP, extractionMode: 'mindmap' } }],
            mappaCorrente: rows => rows.find(r => r.v.fullPath === ctx.appState.activeVaultPath),
            tabelleMateriali: rows => [{ id: 'other', titolo: 'Materiali', colonne: [{}, {}, {}, { larghezza: '200px' }], righe: rows.map(m => ({ id: 'm:' + m.id, celle: [m.titolo] })) }],
            generePerFile: () => ({ label: 'File' })
        },
        MappAIModal: { open(s) { schema = s; draw(s); s.suApertura(box, draw); return new Promise(() => { }); } },
        MappAIDocBar: { nascondiInIframe: () => true, stampaIframe() { return true; } },
        MappAITTS: { stop() { }, mountChip() { return { style: {} }; } },
        MappAIPercorsoLettura: { elaboraMaterials: () => [] }
    });
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'mappai-elabora-console.js'), 'utf8'), ctx);
    const C = ctx.MappAIElaboraConsole;
    return {
        C, calls,
        open: () => { C.open({}); return riposoFig(30); },
        tabelle: () => C.schema().tabelle,
        figure: () => C.schema().tabelle.find(x => x.id === 'g:figure'),
        action: id => { schema.suAzione({ azione: id }, box, draw); return riposoFig(30); }
    };
}

test('0114 lotto 3, la vista: la scheda non ha bottoni dentro, la barra sotto sì; «Va bene così» sul giallo scrive confermato e il badge; la spunta per riga scrive righeConfermate; dal gate 3 del 21/10 la figura controllata si chiude al suo posto, senza sezione sua; il contatore viene dal core; ogni gesto annuncia', () => {
    const risposte = {
        [F.MODELLI.TITOLARE]: p => { const n = nomeDiPayload(p); return n === 'p1-1' ? '[FOTO]\nnessun testo' : (n === 'p3-1' ? '' : GEMMA_UDII4[n]); },
        [F.MODELLI.CONTROLLO]: p => { const n = nomeDiPayload(p); return n === 'p1-1' ? '[FOTO]\nnessun testo' : (n === 'p2-2' ? COLONNA_LETTA + '\nE. Il re convoca i vassalli alla dieta di primavera' : QWEN_UDII4[n]); }
    };
    const casa = casaElabora({ risposte, fontiFiles: FONTI_UDII4 });
    const eventi = [];
    casa.ctx.CustomEvent = function (tipo) { this.type = tipo; };
    casa.ctx.document.dispatchEvent = e => { eventi.push(e.type); return true; };
    const articoli = h => h.match(/<article[\s\S]*?<\/article>/g) || [];
    return fonteLetta(casa, 'UDII4_Lezione3', 'UDII4_Lezione3.pdf').then(({ lettura }) => {
        const d = lettura.dossier, g1 = d.ritagli[1], g2 = d.ritagli[2], rosso = d.ritagli[3];
        eqJ(d.ritagli.map(r => r.stato), [null, 'giallo', 'giallo', 'rosso']);
        eqJ(casa.E.figTabella(), [{ nome: 'UDII4_Lezione3.pdf', daControllare: 3, totale: 4, controllate: 0 }], 'il contatore del core: due gialli e un rosso');
        casa.E.setSrcView('figure');
        let h = casa.html();
        // la scheda: immagine e righe, nessun bottone dentro; la barra sotto, fuori dall'articolo
        assert.strictEqual(articoli(h).length, 4);
        assert.ok(articoli(h).every(a => !/<button/.test(a)), 'nessun bottone dentro la scheda');
        assert.strictEqual((h.match(/data-fig-barra=/g) || []).length, 4, 'una barra per scheda (anche la foto: «Leggi comunque»)');
        // il giallo: «Va bene così» nella barra e la spunta «va bene» sulla riga gialla (interruttore di serie 'entrambe')
        const kG1 = indiceDi(casa, g1.identita);
        // 0118: il blocco della figura scelta porta la classe `elab-fig-sel` (il PDF a destra): gli attributi dopo l'indice sono ammessi
        const bloccoDi = (hh, k) => { const m = new RegExp('<div data-fig-blocco="' + k + '"[^>]*>[\\s\\S]*?data-fig-barra="' + k + '">[\\s\\S]*?</div>').exec(hh); return m ? m[0] : ''; };
        const b1 = bloccoDi(h, kG1);
        assert.ok(/Va bene così/.test(b1) && new RegExp('figConferma\\(' + kG1 + '\\)').test(b1), 'il bottone sul giallo');
        assert.ok(/data-fig-riga="\d+"/.test(b1) && /figVaBeneRiga\(/.test(b1) && /va bene/.test(b1), 'la spunta per riga');
        assert.ok(!/data-fig-controllata/.test(b1));
        const iDa = h.indexOf('Da controllare'), iCo = h.indexOf('Controllate dal docente'), iSz = h.indexOf('Senza lettura');
        assert.ok(iDa >= 0 && iCo < 0 && iSz > iDa, 'ancora nessuna controllata');
        // 0114, dal gate 3 (Giacomo, 21/10): la figura controllata resta al suo posto e si chiude; l'ordine delle schede non cambia
        const ordine = hh => (hh.match(/data-fig-id="[^"]+"/g) || []).join('|'), ordinePrima = ordine(h);
        const art = (hh, kk) => { const m = new RegExp('<article[^>]*data-fig-k="' + kk + '"[\\s\\S]*?</article>').exec(hh); return m ? m[0] : ''; };
        // «Va bene così» sul primo giallo
        return casa.E.figConferma(kG1).then(() => {
            assert.ok(g1.confermato && g1.toccato === g1.confermato, 'confermato con la data');
            assert.ok(eventi.includes('mappai-figure-cambiata'), 'il gesto annuncia (trappola 15)');
            eqJ(casa.E.figTabella()[0].daControllare, 2);
            h = casa.html();
            const kC = indiceDi(casa, g1.identita), b = art(h, kC);
            assert.ok(/>controllata</.test(b) && /data-fig-controllata="1"/.test(b) && /elab-fig-chiusa/.test(b), 'l\'etichetta e la scheda chiusa');
            assert.ok(!new RegExp('data-fig-barra="' + kC + '"').test(h) && !/data-fig-riga/.test(b), 'chiusa: niente barra né spunte');
            assert.ok(h.indexOf('Controllate dal docente') < 0, 'nessuna sezione dedicata');
            assert.strictEqual(ordine(h), ordinePrima, 'la scheda non si sposta');
            assert.ok(!/>\s*(giallo|rosso|verde)\s*</i.test(h), 'i colori da soli non sono un lessico');
            // la spunta su una riga del secondo giallo: la riga ha solo «forse manca» (nessuna riga gialla) → nessuna spunta; si usa la figura intera
            const b2 = bloccoDi(h, indiceDi(casa, g2.identita));
            assert.ok(!/data-fig-riga/.test(b2) && /Va bene così/.test(b2));
            return casa.E.figConferma(indiceDi(casa, g2.identita));
        }).then(() => {
            eqJ(casa.E.figTabella()[0].daControllare, 1, 'resta il rosso');
            // il rosso: «Conferma il testo» nella barra, non nella scheda
            const kR = indiceDi(casa, rosso.identita);
            const bR = bloccoDi(casa.html(), kR);
            assert.ok(/Conferma il testo/.test(bR) && new RegExp('figConferma\\(' + kR + '\\)').test(bR) && /Rileggi/.test(bR));
            return casa.E.figConferma(kR);
        }).then(() => {
            eqJ(casa.E.figTabella()[0].daControllare, 0, 'tutte controllate');
            assert.ok(/>controllata</.test(art(casa.html(), indiceDi(casa, rosso.identita))));
            // nel .figure.json del vault: le due conferme
            const fj = casa.chiamate.salvati.filter(x => x.relPath === 'Fonti/UDII4_Lezione3.figure.json');
            assert.ok(fj.length >= 3);
            assert.strictEqual(JSON.parse(fj[fj.length - 1].text).ritagli.filter(r => r.confermato).length, 3);
        });
    });
});

test('0114 lotto 3, la spunta per riga: su un giallo con una riga gialla la spunta scrive righeConfermate, la figura conta come controllata e il badge appare; levarla la riporta da controllare; con mappai_figure_vabene = \'figura\' nessuna spunta, con \'riga\' nessun «Va bene così»', () => {
    const giro = ls => {
        const casa = casaElabora({ risposte: RISPOSTE_UDII4, fontiFiles: FONTI_UDII4, localStorage: ls });
        return fonteLetta(casa, 'UDII4_Lezione3', 'UDII4_Lezione3.pdf').then(({ lettura }) => ({ casa, g: lettura.dossier.ritagli.find(r => r.stato === 'giallo') }));
    };
    return giro({}).then(({ casa, g }) => {
        const gialla = g.righe.find(r => r.verde === false);
        assert.ok(gialla, 'un giallo con una riga gialla (4 valvassini contro 3)');
        casa.E.setSrcView('figure');
        const k = indiceDi(casa, g.identita);
        let h = casa.html();
        const m = new RegExp('data-fig-riga="(\\d+)"[^>]*onchange="MappAIElabora.figVaBeneRiga\\(' + k + ',(\\d+),this.checked\\)"').exec(h);
        assert.ok(m, 'la spunta sulla riga gialla');
        assert.strictEqual(casa.dom.$('input[data-fig-riga][checked]').length, 0, 'non ancora spuntata');
        return casa.E.figVaBeneRiga(k, +m[2], true).then(v => {
            eqJ(v.righeConfermate, [gialla.testo]);
            assert.ok(F.dossier.controllata(g), 'tutte le righe gialle confermate → controllata');
            eqJ(casa.E.figTabella()[0].daControllare, 0);
            h = casa.html();
            const k2 = indiceDi(casa, g.identita);
            assert.ok(/data-fig-controllata="1"/.test(h) && />controllata</.test(h), 'l\'etichetta');
            // 0114, dal gate 3 (Giacomo, 21/10): controllata, la scheda si chiude; la testata la riapre e la spunta c'è, spuntata
            assert.strictEqual(casa.dom.$('input[data-fig-riga]').length, 0, 'chiusa: le righe non si vedono');
            casa.E.figApri(k2);
            assert.strictEqual(casa.dom.$('input[data-fig-riga][checked]').length, 1, 'riaperta: la spunta è visibile e spuntata');
            assert.ok(new RegExp('figVaBeneRiga\\(' + k2 + ',').test(casa.dom.$('input[data-fig-riga][checked]').attr('onchange') || ''), 'sulla scheda giusta');
            assert.ok(!/Va bene così/.test(h), 'niente «Va bene così» su una figura già controllata riga per riga');
            return casa.E.figVaBeneRiga(k2, +m[2], false);
        }).then(v => {
            eqJ(v.righeConfermate, []);
            eqJ(casa.E.figTabella()[0].daControllare, 1, 'tolta la spunta, torna da controllare');
            assert.ok(/Va bene così/.test(casa.html()));
        });
    }).then(() => giro({ mappai_figure_vabene: 'figura' })).then(({ casa }) => {
        casa.E.setSrcView('figure');
        const h = casa.html();
        assert.ok(!/data-fig-riga/.test(h) && /Va bene così/.test(h), "'figura': solo la figura intera");
    }).then(() => giro({ mappai_figure_vabene: 'riga' })).then(({ casa }) => {
        casa.E.setSrcView('figure');
        const h = casa.html();
        assert.ok(/data-fig-riga/.test(h) && !/Va bene così/.test(h), "'riga': solo le spunte");
    });
});

test('0114 lotto 3, la console: la tabella «Figure» sta subito dopo «Fonte», sempre presente, a quattro colonne come le tabelle dei materiali; una riga per PDF con dossier (nome, lette, da controllare, controllate); a zero «tutte controllate»; la riga apre la vista nella tela', () => {
    const vuota = casaElabora({});
    const file = { name: 'solo-testo.pdf', type: 'application/pdf', size: 10, arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)) };
    vuota.ctx.appState.sources.push({ id: 's1', type: 'pdf', name: 'solo-testo.pdf', content: 'parola '.repeat(60), file });
    const hv = conConsole(vuota);
    return hv.open().then(() => {
        const ids = hv.tabelle().map(x => x.id);
        assert.strictEqual(ids[0], 'g:fonte'); assert.strictEqual(ids[1], 'g:figure');
        const tf = hv.figure();
        eqJ([tf.titolo, tf.righe.length, !!tf.vuota, tf.colonne.length], ['Figure', 0, true, 4], 'senza letture la tabella c\'è, vuota, con la sua riga «Niente da mostrare»');
        eqJ(tf.colonne.map(c => c.etichetta), ['Nome', 'Figure lette', 'Da controllare', 'Controllate dal docente']);
    }).then(() => {
        const risposte = { [F.MODELLI.TITOLARE]: p => (nomeDiPayload(p) === 'p3-1' ? '' : GEMMA_UDII4[nomeDiPayload(p)]), [F.MODELLI.CONTROLLO]: p => QWEN_UDII4[nomeDiPayload(p)] };
        const casa = casaElabora({ risposte, fontiFiles: FONTI_UDII4 });
        return fonteLetta(casa, 'UDII4_Lezione3', 'UDII4_Lezione3.pdf').then(({ lettura }) => {
            const d = lettura.dossier;
            const h = conConsole(casa);
            return h.open().then(() => {
                const tf = h.figure();
                eqJ(tf.righe.map(r => [r.id, r.celle]), [['m:src:fig:0', ['UDII4_Lezione3.pdf', '4', '2', '0']]]);
                // la riga apre la vista «Figure» di quel PDF nella tela
                return h.action('m:src:fig:0').then(() => {
                    const tela = casa.dom.$('.mm-tela').html() || '';
                    assert.ok(tela.includes('Testo delle figure') && /data-fig-barra=/.test(tela), 'la vista nella tela: ' + tela.slice(0, 120));
                    // il giallo confermato e il rosso confermato → «tutte controllate» all'elenco (il gesto annuncia, la console ridisegna)
                    const g = d.ritagli.find(r => r.stato === 'giallo'), r = d.ritagli.find(r => r.stato === 'rosso');
                    // nella console la vista sta nella tela, non nell'overlay: l'indice si legge lì
                    const kIn = id => { const m = new RegExp('data-fig-k="(\\d+)"[^>]*data-fig-id="' + id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '"').exec(casa.dom.$('.mm-tela').html() || ''); assert.ok(m, 'in tela: ' + id); return Number(m[1]); };
                    return casa.E.figConferma(kIn(g.identita)).then(() => casa.E.figConferma(kIn(r.identita)));
                }).then(() => h.action('__esc')).then(() => {
                    eqJ(h.figure().righe.map(r => r.celle), [['UDII4_Lezione3.pdf', '4', 'tutte controllate', '2']]);
                });
            });
        });
    });
});

test('0114 lotto 3 (gate, 20/10): una mappa già in memoria con le fonti vuote (autosalvataggio, o appena generata) — all\'apertura della console le fonti tornano dal vault e le tabelle «Fonte» e «Figure» si riempiono; senza vault o con le fonti già in memoria niente da fare', () => {
    const disco = {};
    const VP = '/Users/prova/Documents/MappAI - file/Classi/4A/Storia/UDII4';
    const d = F.dossier.nuovo({ impronta: 'impr-gate', file: 'Fonti/UDII4_Lezione3.pdf' });
    d.ritagli = [F.dossier.ritaglio({ identita: 'impr-gate|2|1', pagina: 2, stato: 'giallo', righe: [{ testo: 'a a', verde: false }] }), F.dossier.ritaglio({ identita: 'impr-gate|3|1', pagina: 3, stato: 'rosso', confermato: '2026-10-20T10:00:00.000Z' })];
    F.dossier.riassumi(d);
    disco[VP + '|Fonti/fonti.json'] = JSON.stringify({ schema: 'mappai-fonti@1', mappa: 'UDII4', fonti: [{ id: 'source_1', tipo: 'doc', nome: 'UDII4_Lezione3.pdf', vaultRel: 'Fonti/UDII4_Lezione3.pdf', testoRel: 'Fonti/UDII4_Lezione3.txt' }] });
    disco[VP + '|Fonti/UDII4_Lezione3.txt'] = 'Testo della scheda. '.repeat(10);
    disco[VP + '|Fonti/UDII4_Lezione3.figure.json'] = JSON.stringify(d);
    const casa = casaElabora({ disco, vaultPath: VP, fontiFiles: () => [{ name: 'UDII4_Lezione3.pdf', relPath: 'Fonti/UDII4_Lezione3.pdf', size: 10, ext: 'pdf' }, { name: 'fonti.json', relPath: 'Fonti/fonti.json', size: 10, ext: 'json' }] });
    assert.strictEqual(casa.ctx.appState.sources.length, 0, 'la mappa in memoria non ha fonti');
    const h = conConsole(casa);
    return h.open().then(() => riposoFig(40)).then(() => {
        const s = h.C.schema();
        eqJ(s.tabelle.find(t => t.id === 'g:fonte').righe.map(r => r.celle[0]), ['Testo', 'UDII4_Lezione3.pdf'], 'la fonte PDF tornata dal vault');
        eqJ(h.figure().righe.map(r => r.celle), [['UDII4_Lezione3.pdf', '2', '1', '1']], 'la tabella «Figure» piena: un giallo da controllare, un rosso confermato');
        assert.ok(casa.chiamate.letti.some(x => /\.figure\.json$/.test(x.relPath)), 'il dossier letto dal vault');
        assert.strictEqual(casa.chiamate.infomaniak.length + casa.chiamate.gemini.length, 0, 'zero chiamate');
    }).then(() => {
        // senza vault attivo: nessuna lettura dal disco; con le fonti già in memoria: non si toccano
        const senza = casaElabora({ vaultPath: '' });
        const hs = conConsole(senza);
        return hs.open().then(() => riposoFig(20)).then(() => {
            assert.ok(!senza.chiamate.letti.some(x => /fonti\.json$/.test(x.relPath)), 'senza vault niente lettura');
            const piena = casaElabora({ disco, vaultPath: VP });
            const mia = { id: 'mio', type: 'text', name: 'Appunti', content: 'parola '.repeat(30) };
            piena.ctx.appState.sources.push(mia);
            const hp = conConsole(piena);
            return hp.open().then(() => riposoFig(20)).then(() => {
                assert.strictEqual(piena.ctx.appState.sources[0], mia, 'le fonti in memoria restano le sue');
                assert.ok(!piena.chiamate.letti.some(x => /fonti\.json$/.test(x.relPath)), 'con fonti in memoria niente ripristino');
            });
        });
    });
});

test('0114 lotto 4, D9: i worker di Tesseract nascono con user_words_suffix vuoto (ita.traineddata chiede «special-words», che non c\'è: la riga «failed to load ./ita.special-words» non si stampa); il resto delle opzioni come prima', () => {
    const casa = casaModulo();
    const nati = [];
    casa.M._deps.tesseract = () => ({
        createScheduler: () => ({ addWorker() { }, addJob: () => Promise.resolve({ data: { text: '' } }), terminate: () => Promise.resolve() }),
        createWorker: (lingue, oem, opzioni, config) => { nati.push({ lingue, oem, opzioni, config }); return Promise.resolve({ terminate() { } }); }
    });
    return casa.M.decidi(provaCon(casa, 'UDII4_Lezione3')).then(() => {
        assert.strictEqual(nati.length, casa.M.WORKER_OCR, 'uno per worker');
        for (const n of nati) {
            assert.strictEqual(n.lingue, 'ita');
            assert.strictEqual(n.oem, 1);
            assert.strictEqual(!!(n.config && n.config.user_words_suffix === ''), true, 'config di init: user_words_suffix vuoto');
            assert.strictEqual(Object.keys(n.config || {}).length, 1, 'solo quel parametro');
            assert.strictEqual(String(n.opzioni.langPath).endsWith('assets/tesseract'), true);
            assert.strictEqual(n.opzioni.gzip, true);
        }
    });
});

test('0114 lotto 4, D5, il core: scansioneNonLetta solo per un PDF scansione senza Google, senza testo tipografico e senza blocchi entrati; daRileggere con Google rilegge una scansione letta da Tesseract', () => {
    const pagina = (car) => ({ numero: 1, caratteri: car });
    const prova = { pdfScansione: true, pagine: [pagina(0), pagina(0)] };
    const lettura = (google, pagine) => ({ dossier: { google }, pagine: pagine || [{ numero: 1, blocco: '', testoSostitutivo: null }] });
    assert.strictEqual(F.scansioneNonLetta(prova, lettura('no')), true, '«No»: non letto');
    assert.strictEqual(F.scansioneNonLetta(prova, lettura(null)), true, 'senza chiave nessuna domanda: non letto');
    assert.strictEqual(F.scansioneNonLetta(prova, lettura('si')), false, 'letto con Google');
    assert.strictEqual(F.scansioneNonLetta({ pdfScansione: false, pagine: [pagina(0)] }, lettura('no')), false, 'non è un PDF scansione');
    assert.strictEqual(F.scansioneNonLetta({ pdfScansione: true, pagine: [pagina(0), pagina(120)] }, lettura('no')), false, 'c\'è testo tipografico');
    assert.strictEqual(F.scansioneNonLetta(prova, lettura('no', [{ numero: 2, blocco: '[Figure della pagina 2] … ⟧ [/Figure]' }])), false, 'un blocco è entrato');
    assert.strictEqual(F.scansioneNonLetta(prova, lettura('no', [{ numero: 2, blocco: '', testoSostitutivo: 'x ≥ 2' }])), false, 'formule innestate');
    assert.strictEqual(F.scansioneNonLetta(null, null), false);
    assert.strictEqual(F.scansioneNonLetta(prova, null), true, 'senza lettura (modulo guasto a metà) vale la prova');
    const tess = { stato: 'rosso', tipo: 'SCANSIONE', modelli: { titolare: 'tesseract', controllo: null } };
    assert.strictEqual(F.dossier.daRileggere(tess), false, 'senza Google resta com\'è');
    assert.strictEqual(F.dossier.daRileggere(tess, { google: true }), true, 'col «Sì» dopo il «No» si rilegge con Google');
    assert.strictEqual(F.dossier.daRileggere(Object.assign({}, tess, { modelli: { titolare: F.MODELLI.GOOGLE } }), { google: true }), false, 'già letto da Google');
    assert.strictEqual(F.dossier.daRileggere({ stato: 'giallo', tipo: 'FIGURA', modelli: { titolare: 'tesseract' } }, { google: true }), false, 'solo le scansioni');
});

test('0114 lotto 4, D5, il modulo: Aztechi con «No» → l\'avviso del motore (testo, «Leggi con Google», «Ho capito» primario) al posto del toast delle scansioni; «Leggi con Google» cambia il «No» ricordato e la generazione dopo legge con Google; senza chiave solo «Ho capito»; senza motore il toast di prima', () => {
    const giro = (cfg, risposte) => {
        const casa = casaApp(cfg);
        const dom = domFinto(casa, {});
        const coda = risposte.slice();
        casa.ctx.MappAIModal = { open: s => { dom.modali.push(s); const r = coda.shift(); return Promise.resolve(r === undefined ? null : { azione: r }); } };
        casa.file._figure = provaCon(casa, 'FOCUS-STORIA-Aztechi');
        casa.file.name = 'aztechi.pdf';
        const src = { id: 's1', type: 'pdf', file: casa.file };
        return casa.M.decidi(casa.file._figure).then(() => creaPdf(casa, src)).then(r => ({ casa, dom, r, src }));
    };
    const G = { chiaveGoogle: 'AIzaChiaveGoogleDiProva', ocr: () => 'parole lette dal solo tesseract', risposte: { [F.MODELLI.GOOGLE]: () => '[TITOLO] Tenochtitlan\n[TESTO] La città sul lago' } };
    const TESTO = 'Questo PDF è una scansione e non è stato letto: dentro non c\'è testo che la mappa possa usare.';
    return giro(G, ['no', 'ok']).then(({ casa, dom }) => {
        assert.strictEqual(dom.modali.length, 2, 'la domanda, poi l\'avviso');
        const s = dom.modali[1], testo = JSON.stringify(s);
        assert.strictEqual(s.titolo, 'Questo PDF non è stato letto');
        assert.strictEqual(s.sezioni.length, 1, 'un box solo (Giacomo al gate 3)');
        assert.strictEqual(testo.indexOf(TESTO) >= 0, true, testo);
        assert.strictEqual(testo.indexOf('«Rileggi con Google»') >= 0, true, 'la strada di ELABORA, se la mappa nasce da altre fonti');
        assert.strictEqual(testo.indexOf('Il testo esce dalla Svizzera.') >= 0, true, 'la riga d\'avviso di Google');
        eqJ(s.azioni.map(a => [a.id, a.etichetta, a.ruolo || '']), [['si', 'Leggi con Google', ''], ['ok', 'Ho capito', 'primario']]);
        assert.strictEqual(casa.chiamate.toast.some(x => /sono scansioni/.test(x.m)), false, 'l\'avviso prende il posto del toast');
        assert.strictEqual(casa.chiamate.gemini.length, 0);
        assert.strictEqual(casa.M.dossierDi('impr0113').google, 'no', '«Ho capito» non cambia la risposta');
    }).then(() => giro(G, ['no', 'si'])).then(({ casa, dom, src }) => {
        return Promise.resolve().then(() => {
            assert.strictEqual(casa.M.dossierDi('impr0113').google, 'si', '«Leggi con Google» dall\'avviso');
            assert.strictEqual(casa.chiamate.toast.some(x => x.m === 'Alla prossima generazione lo leggo con Google.'), true, casa.chiamate.toast.map(x => x.m).join(' | '));
            dom.modali.length = 0;
            return creaPdf(casa, src);
        }).then(r => {
            assert.strictEqual(dom.modali.length, 0, 'nessuna domanda e nessun avviso la seconda volta');
            assert.strictEqual(casa.chiamate.gemini.length, 4, 'le quattro pagine a Gemini, sopra le letture di Tesseract');
            assert.strictEqual(r.pages[0].text.indexOf('[Figure della pagina 1]') > 0, true);
        });
    }).then(() => giro({ chiaveGoogle: '', ocr: () => 'parole' }, ['ok'])).then(({ casa, dom }) => {
        assert.strictEqual(dom.modali.length, 1, 'senza chiave nessuna domanda, solo l\'avviso');
        const s = dom.modali[0], testo = JSON.stringify(s);
        eqJ(s.azioni.map(a => [a.id, a.ruolo || '']), [['ok', 'primario']]);
        assert.strictEqual(testo.indexOf('Per leggerlo con Google serve la chiave Google nel cassetto.') >= 0, true, testo);
        assert.strictEqual(testo.indexOf('Il testo esce dalla Svizzera.') < 0, true);
        assert.strictEqual(casa.chiamate.toast.some(x => /sono scansioni/.test(x.m)), false);
    }).then(() => giro(G, ['si'])).then(({ casa, dom }) => {
        assert.strictEqual(dom.modali.length, 1, 'letto con Google: nessun avviso');
        assert.strictEqual(casa.chiamate.gemini.length, 4);
    }).then(() => {
        // senza il motore dei modali (o un guasto): il toast di prima, e la generazione non si ferma
        const casa = casaApp({ chiaveGoogle: '', ocr: () => 'parole' });
        domFinto(casa, {});
        delete casa.ctx.MappAIModal;
        casa.file._figure = provaCon(casa, 'FOCUS-STORIA-Aztechi');
        casa.file.name = 'aztechi.pdf';
        return casa.M.decidi(casa.file._figure).then(() => creaPdf(casa, { id: 's1', type: 'pdf', file: casa.file })).then(r => {
            assert.strictEqual(casa.chiamate.toast.some(x => x.m === '4 pagine sono scansioni: le ho lette solo in parte'), true);
            assert.strictEqual(!!r, true);
        });
    }).then(() => {
        const casa = casaApp({ chiaveGoogle: '', ocr: () => 'parole' });
        domFinto(casa, {});
        casa.ctx.MappAIModal = { open: () => { throw new Error('motore rotto'); } };
        casa.file._figure = provaCon(casa, 'FOCUS-STORIA-Aztechi');
        casa.file.name = 'aztechi.pdf';
        return casa.M.decidi(casa.file._figure).then(() => creaPdf(casa, { id: 's1', type: 'pdf', file: casa.file })).then(r => {
            assert.strictEqual(!!r, true, 'un guasto dell\'avviso non ferma la generazione');
            assert.strictEqual(casa.chiamate.toast.some(x => /sono scansioni/.test(x.m)), true);
        });
    });
});

// un PDF minimo di una pagina vuota, scritto a mano (soli numeri e parole: regola dello 0044)
function pdfMinimo() {
    const ogg = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>', '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] >>'];
    let s = '%PDF-1.4\n'; const off = [];
    ogg.forEach((o, i) => { off.push(s.length); s += (i + 1) + ' 0 obj\n' + o + '\nendobj\n'; });
    const xref = s.length;
    s += 'xref\n0 ' + (ogg.length + 1) + '\n0000000000 65535 f \n' + off.map(n => String(n).padStart(10, '0') + ' 00000 n \n').join('');
    s += 'trailer\n<< /Size ' + (ogg.length + 1) + ' /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF\n';
    return new Uint8Array(Buffer.from(s, 'latin1'));
}

test('0114 lotto 4, dal gate (Giacomo: «1a»): la prova a secco col pdf.js vero resta in memoria ma non entra nel salvataggio automatico — una fonte con _figure passa da JSON.stringify, senza il documento pdf.js e senza le immagini dei ritagli', () => {
    const path = require('node:path');
    const casa = casaModulo();
    const lib = require('../public/js/pdf.min.js');
    lib.GlobalWorkerOptions.workerSrc = path.join(__dirname, '..', 'public', 'js', 'vendor', 'pdf.worker.min.js');
    casa.M._deps.pdfjs = () => lib;
    casa.M._deps.impronta = null;
    return casa.M.prova(pdfMinimo(), { nome: 'vuoto.pdf' }).then(p => {
        assert.strictEqual(!!(p && p._pdf && p._pdf.numPages === 1), true, 'il documento pdf.js resta usabile in memoria');
        assert.strictEqual(p.pagine.length, 1);
        const fonte = { id: 's1', type: 'pdf', title: 'vuoto.pdf', _figure: p };
        let testo = null, errore = null;
        try { testo = JSON.stringify({ sources: [fonte] }); } catch (e) { errore = e.message; }
        assert.strictEqual(errore, null, 'il salvataggio automatico non deve fallire: ' + errore);
        assert.strictEqual(testo.indexOf('_figure') < 0, true, 'la prova non entra nel cassetto: ' + testo.slice(0, 200));
        assert.strictEqual(JSON.parse(testo).sources[0].title, 'vuoto.pdf', 'il resto della fonte sì');
        return p._pdf.destroy && p._pdf.destroy();
    });
});

test('0114 lotto 4, dal gate (Giacomo: «2a»): chiuso l\'avviso della scansione, il fuoco non resta su «Genera Mappa» (un Invio non rilancia la generazione), con «Ho capito» e con «Leggi con Google»', () => {
    const giro = (risposte) => {
        const casa = casaApp({ chiaveGoogle: 'AIzaChiaveGoogleDiProva', ocr: () => 'parole' });
        const dom = domFinto(casa, {});
        const coda = risposte.slice();
        let tolto = 0;
        const genera = { id: 'mn-genera', blur() { tolto++; } };
        casa.ctx.document.body = { id: 'body' };
        casa.ctx.MappAIModal = { open: s => { dom.modali.push(s); const r = coda.shift(); casa.ctx.document.activeElement = genera; return Promise.resolve(r === undefined ? null : { azione: r }); } };
        casa.file._figure = provaCon(casa, 'FOCUS-STORIA-Aztechi');
        casa.file.name = 'aztechi.pdf';
        return casa.M.decidi(casa.file._figure).then(() => creaPdf(casa, { id: 's1', type: 'pdf', file: casa.file }))
            .then(() => new Promise(r => setTimeout(r, 10))).then(() => ({ dom, tolto: () => tolto }));
    };
    return giro(['no', 'ok']).then(({ dom, tolto }) => {
        assert.strictEqual(dom.modali.length, 2);
        assert.strictEqual(tolto(), 1, '«Ho capito»: il fuoco lascia «Genera Mappa»');
    }).then(() => giro(['no', 'si'])).then(({ tolto }) => {
        assert.strictEqual(tolto(), 1, '«Leggi con Google»: il fuoco lascia «Genera Mappa»');
    });
});

test('0114 lotto 4, dal gate (Giacomo, 21/10): «Spunta tutte le righe» nella scheda prima di «Testo corretto»; «Va bene così» → etichetta «controllata» e la scheda si chiude AL SUO POSTO (niente sezione «Controllate dal docente»), si riapre dalla testata; immagine sopra e testo sotto; i corpi dalla famiglia dei token', () => {
    // il controllo perde due righe dello schema: il titolare ne ha due gialle
    const CONTROLLO_2 = SCHEMA_4.replace('\ncavalieri e contadini', '').replace('\nterre in cambio di protezione', '');
    const risposte = { [F.MODELLI.TITOLARE]: p => GEMMA_UDII4[nomeDiPayload(p)], [F.MODELLI.CONTROLLO]: p => (nomeDiPayload(p) === 'p2-1' ? CONTROLLO_2 : QWEN_UDII4[nomeDiPayload(p)]) };
    const casa = casaElabora({ risposte, fontiFiles: FONTI_UDII4 });
    const ordine = h => (h.match(/data-fig-id="[^"]+"/g) || []).join('|');
    return fonteLetta(casa, 'UDII4_Lezione3', 'UDII4_Lezione3.pdf').then(({ lettura }) => {
        casa.E.setSrcView('figure');
        const d = lettura.dossier;
        const g = d.ritagli.find(r => r.stato === 'giallo' && (r.righe || []).filter(x => x.verde === false).length >= 2);
        assert.strictEqual(!!g, true, 'un giallo con almeno due righe gialle');
        const gialle = g.righe.filter(x => x.verde === false).map(x => x.testo);
        let h = casa.html();
        const prima = ordine(h);
        const art = kk => { const m = new RegExp('<article[^>]*data-fig-k="' + kk + '"[\\s\\S]*?</article>').exec(casa.html()); return m ? m[0] : ''; };
        let k = indiceDi(casa, g.identita);
        // 1. il bottone per tutte le righe, dentro la scheda, prima di «Testo corretto»
        const a = art(k);
        const iTutte = a.indexOf('Spunta tutte le righe'), iTesto = a.indexOf('Testo corretto');
        assert.strictEqual(iTutte > 0 && iTesto > iTutte, true, 'il bottone prima di «Testo corretto»');
        assert.strictEqual(new RegExp('figVaBeneTutte\\(' + k + '\\)').test(a), true);
        assert.strictEqual(h.indexOf('Controllate dal docente'), -1, 'nessuna sezione dedicata');
        return casa.E.figVaBeneTutte(k).then(v => {
            assert.strictEqual(gialle.every(t => v.righeConfermate.some(x => F.compatta(x) === F.compatta(t))), true, 'tutte le righe gialle');
            assert.strictEqual(v.righeConfermate.length, gialle.length);
            assert.strictEqual(F.dossier.controllata(g), true, 'tutte spuntate → controllata');
            h = casa.html();
            k = indiceDi(casa, g.identita);
            const chiusa = art(k);
            // 2. l'etichetta «controllata», la scheda chiusa al suo posto, niente barra né casella
            assert.strictEqual(/elab-fig-chiusa/.test(chiusa) && /elab-fig-badge-ok[^>]*>controllata</.test(chiusa), true, chiusa.slice(0, 400));
            assert.strictEqual(/textarea/.test(chiusa) || /data-fig-riga/.test(chiusa), false, 'chiusa: niente righe né casella');
            assert.strictEqual(new RegExp('data-fig-barra="' + k + '"').test(h), false, 'chiusa: niente barra');
            assert.strictEqual(ordine(h), prima, 'la scheda non si sposta');
            assert.strictEqual(h.indexOf('Controllate dal docente'), -1);
            // riaprirla dalla testata
            assert.strictEqual(new RegExp('figApri\\(' + k + '\\)').test(chiusa) && /aria-expanded="false"/.test(chiusa), true);
            casa.E.figApri(k);
            const aperta = art(indiceDi(casa, g.identita));
            assert.strictEqual(/textarea/.test(aperta) && /aria-expanded="true"/.test(aperta) && />controllata</.test(aperta), true, 'riaperta, con l\'etichetta');
            // «Va bene così» su un'altra figura gialla: chiusa anche lei, al suo posto
            const altro = d.ritagli.find(r => r.stato === 'giallo' && r !== g);
            return altro ? casa.E.figConferma(indiceDi(casa, altro.identita)).then(() => {
                assert.strictEqual(/elab-fig-chiusa/.test(art(indiceDi(casa, altro.identita))), true, '«Va bene così» chiude la scheda');
                assert.strictEqual(ordine(casa.html()), prima);
            }) : null;
        });
    }).then(() => {
        // 3 e 4. una colonna sola (immagine sopra, centrata) e i corpi dalla famiglia dei token: nessun mezzo punto scritto a mano
        const css = casa.dom.$('#elab-fig-styles').text();
        assert.strictEqual(/\.elab-fig-corpo\{[^}]*flex-direction:column/.test(css), true, 'una colonna');
        assert.strictEqual(/\.elab-fig-imgw\{[^}]*align-self:center/.test(css), true, 'immagine centrata');
        assert.strictEqual(/\.elab-fig-righe\{[^}]*font-size:var\(--mm-fs-lettura\)/.test(css), true, 'i testi da rivedere al corpo di lettura');
        assert.strictEqual(/font-size:\d/.test(css), false, 'nessun corpo scritto a mano: ' + (css.match(/font-size:\d[^;}]*/g) || []).join(' '));
    });
});

/* ── 0118: il PDF originale a destra nella vista «Figure» ── */
const RISPOSTE_0118 = { [F.MODELLI.TITOLARE]: p => (nomeDiPayload(p) === 'p3-1' ? '' : GEMMA_UDII4[nomeDiPayload(p)]), [F.MODELLI.CONTROLLO]: p => QWEN_UDII4[nomeDiPayload(p)] };
const voceDi = (casa, k) => { const h = casa.html(); const m = new RegExp('data-fig-k="' + k + '"[^>]*data-fig-id="([^"]+)"').exec(h); return m ? m[1] : null; };

test('0118: nella vista «Figure» lo split destro è il PDF originale (niente Card/Albero), aperto alla pagina della PRIMA figura col riquadro del ritaglio; un clic su un\'altra scheda porta il PDF alla sua pagina e sposta il riquadro', () => {
    const casa = casaElabora({ risposte: RISPOSTE_0118, fontiFiles: FONTI_UDII4 });
    return fonteLetta(casa, 'UDII4_Lezione3', 'UDII4_Lezione3.pdf').then(({ lettura }) => {
        const d = lettura.dossier;
        casa.E.setSrcView('figure');
        const h = casa.html();
        assert.strictEqual(h.includes('elab-figpdf-pane'), true, 'il pannello del PDF');
        assert.strictEqual(h.includes('PDF originale'), true, 'la testata');
        assert.strictEqual(/setRightView\(/.test(h), false, 'niente segmento Card/Albero');
        assert.strictEqual(h.includes('Analisi &amp; suggerimenti'), false, 'niente analisi');
        assert.strictEqual(/class="elab-stack elab-fig" onclick="MappAIElabora\.figDa\(event\)" onfocusin="MappAIElabora\.figDa\(event\)"/.test(h), true, 'il gesto sul contenitore delle schede');
        // la prima figura della vista = la prima scheda in alto
        const primaId = (/data-fig-id="([^"]+)"/.exec(h) || [])[1];
        const prima = d.ritagli.find(r => r.identita === primaId);
        assert.strictEqual(!!prima, true, 'la prima scheda è un ritaglio del dossier');
        assert.strictEqual(new RegExp('data-figpdf-pagina="' + prima.pagina + '"').test(h), true, 'il pannello nasce alla pagina della prima figura');
        return riposoFig(30).then(() => {
            const st = casa.E.figPdfStato();
            eqJ([st.nome, st.pagine, st.montate, st.pagina, st.sel], ['UDII4_Lezione3.pdf', 3, 3, prima.pagina, prima.identita], 'il PDF intero, alla pagina della prima figura');
            const dim = casa.pdfFinto('UDII4_Lezione3').pagine[prima.pagina - 1];
            const r = prima.rettPt;
            const atteso = { left: r[0] / dim.larghezza * 100, top: r[1] / dim.altezza * 100, width: r[2] / dim.larghezza * 100, height: r[3] / dim.altezza * 100 };
            Object.keys(atteso).forEach(c => assert.strictEqual(Math.abs(st.riquadro[c] - atteso[c]) < 1e-6, true, c + ': ' + st.riquadro[c] + ' ≠ ' + atteso[c]));
            assert.strictEqual(casa.dom.$('[data-fig-blocco].elab-fig-sel').length, 1, 'una scheda scelta');
            // un'altra scheda, su un'altra pagina
            const altra = d.ritagli.find(x => x.pagina !== prima.pagina && x.rettPt);
            const kAltra = indiceDi(casa, altra.identita);
            casa.E.figMostra(kAltra);
            const st2 = casa.E.figPdfStato();
            eqJ([st2.pagina, st2.sel], [altra.pagina, altra.identita], 'il PDF segue la scheda');
            assert.strictEqual(Math.abs(st2.riquadro.left - altra.rettPt[0] / casa.pdfFinto('UDII4_Lezione3').pagine[altra.pagina - 1].larghezza * 100) < 1e-6, true, 'il riquadro si sposta');
            assert.strictEqual(casa.dom.$('[data-fig-blocco="' + kAltra + '"]').hasClass('elab-fig-sel'), true, 'il contorno passa alla scheda nuova');
            // un render (ogni gesto della vista ne fa uno) non perde la scelta né rifà il PDF
            casa.E.setSrcView('figure');
            return riposoFig(10).then(() => {
                const st3 = casa.E.figPdfStato();
                eqJ([st3.pagina, st3.sel, st3.montate], [altra.pagina, altra.identita, 3], 'dopo il ridisegno la scelta resta');
                assert.strictEqual(casa.dom.$('[data-fig-blocco="' + kAltra + '"]').hasClass('elab-fig-sel'), true, 'e il contorno');
            });
        });
    });
});

test('0118: con mappai_figure_pdf_destra = \'0\' la vista «Figure» torna com\'era: a destra Card/Albero, nessun gesto sulle schede, nessun PDF', () => {
    const casa = casaElabora({ risposte: RISPOSTE_0118, fontiFiles: FONTI_UDII4, localStorage: { mappai_figure_pdf_destra: '0' } });
    return fonteLetta(casa, 'UDII4_Lezione3', 'UDII4_Lezione3.pdf').then(() => {
        casa.E.setSrcView('figure');
        const h = casa.html();
        assert.strictEqual(h.includes('elab-figpdf-pane'), false);
        assert.strictEqual(/setRightView\('cards'\)/.test(h) && /setRightView\('tree'\)/.test(h), true, 'Card e Albero');
        assert.strictEqual(h.includes('<div class="elab-stack elab-fig">'), true, 'il contenitore senza gesti');
        return riposoFig(10).then(() => assert.strictEqual(casa.E.figPdfStato().nome, null, 'nessun PDF aperto'));
    });
});

test('0118 (revisione): il PDF a destra si riconosce da impronta e nome — un PDF omonimo con un\'altra impronta (un\'altra mappa) si riapre; il documento della prova a secco non si distrugge mai', () => {
    const casa = casaElabora({ risposte: RISPOSTE_0118, fontiFiles: FONTI_UDII4 });
    return fonteLetta(casa, 'UDII4_Lezione3', 'UDII4_Lezione3.pdf').then(({ src, lettura }) => {
        let distrutto = 0;
        src._figure._pdf.destroy = () => { distrutto++; };
        casa.E.setSrcView('figure');
        return riposoFig(20).then(() => {
            const prima = casa.E.figPdfStato();
            assert.strictEqual(prima.chiave, lettura.dossier.impronta + '|UDII4_Lezione3.pdf');
            lettura.dossier.impronta = 'impr-di-un-altra-mappa';
            casa.E.setSrcView('figure');
            return riposoFig(20).then(() => {
                const dopo = casa.E.figPdfStato();
                eqJ([dopo.chiave, dopo.montate], ['impr-di-un-altra-mappa|UDII4_Lezione3.pdf', 3], 'riaperto, non riusato');
                casa.E.unmountSource();
                eqJ([casa.E.figPdfStato().nome, distrutto], [null, 0], 'chiuso con la console; il documento condiviso resta vivo');
            });
        });
    });
});

test('0118: una figura oltre la pagina 30 si raggiunge — nessun tetto di pagine nel PDF a destra (dossier finto a pagina 34 di 40)', () => {
    const casa = casaElabora({ risposte: RISPOSTE_0118, fontiFiles: FONTI_UDII4 });
    return fonteLetta(casa, 'UDII4_Lezione3', 'UDII4_Lezione3.pdf').then(({ src, lettura }) => {
        const pagina = () => ({ getViewport: () => ({ width: 595, height: 842 }), render: () => ({ promise: Promise.resolve() }), cleanup() { } });
        src._figure._pdf = { numPages: 40, getPage: () => Promise.resolve(pagina()) };
        const lontana = lettura.dossier.ritagli.find(r => r.rettPt);
        lontana.pagina = 34; lontana.rettPt = [100, 200, 50, 80];
        casa.E.setSrcView('figure');
        return riposoFig(30).then(() => {
            casa.E.figMostra(indiceDi(casa, lontana.identita));
            const st = casa.E.figPdfStato();
            eqJ([st.pagine, st.montate, st.pagina], [40, 40, 34], 'le 40 pagine ci sono, la 34 è quella della figura');
            assert.strictEqual(Math.abs(st.riquadro.left - 100 / 595 * 100) < 1e-6 && Math.abs(st.riquadro.top - 200 / 842 * 100) < 1e-6, true, 'il riquadro sulla pagina 34');
        });
    });
});
