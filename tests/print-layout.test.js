// Le misure dei fogli di stampa (mm/pt) e l'impaginazione del testo nelle carte.
// Sono un contratto: da qui dipendono il foglio HTML (mappai-quiz-print.js) e il
// foglio PDF (mappai-print-dossier.js), che devono uscire IDENTICI.
// La proprietà che conta: al corpo scelto, nessuna carta sborda dal suo spazio —
// è il difetto che tagliava le domande lunghe a metà frase.
const { test } = require('node:test');
const assert = require('node:assert');
const PL = require('../public/js/mappai-print-layout.js');

const HEAD = { root: 'Storia della Svizzera', theme: 'La Svizzera nella Seconda guerra mondiale' };

const CARTE = [
    {
        question: 'Perché la Svizzera, pur essendo circondata da Stati in guerra fra il 1939 e il 1945, riuscì a mantenere formalmente la propria neutralità?',
        answer: 'La neutralità fu mantenuta grazie a una combinazione di deterrenza militare e di concessioni economiche. Il generale Guisan concentrò l\'esercito nel Réduit alpino, rendendo un\'eventuale invasione lunga e costosa.',
        explanation: 'Il prezzo furono le forniture industriali e i transiti ferroviari concessi all\'Asse.'
    },
    { question: 'Che cosa fu il Réduit alpino?', answer: 'La fortificazione delle Alpi in cui Guisan concentrò l\'esercito nel 1940.', explanation: '' },
    { question: 'Chi guidò l\'esercito svizzero?', answer: 'Il generale Henri Guisan.', explanation: '' }
];

// Nessuna carta deve sbordare: si ricalcolano le altezze richieste col risultato
// del fit e si confrontano con lo spazio disponibile.
function nessunoSborda(items, g, head, fit, opts) {
    items = fit.items || items;   // dopo le spiegazioni tolte e gli accorciamenti
    const duplex = !!(opts && opts.duplex);
    const fH = duplex ? g.cardH : g.cardH * fit.split / 100;
    const bH = duplex ? g.cardH : g.cardH - fH;
    const headCpl = PL.charsPerLine(g.cardW - 2 * g.card.padX, g.head, g.headAdvance);
    const headLines = PL.lineCount(head.root, headCpl) + (head.theme ? PL.lineCount(head.theme, headCpl) : 0);
    return items.map((it, i) => {
        const pt = (fit.policy === 'card' && fit.perCard[i])
            ? { q: fit.perCard[i].q, a: fit.perCard[i].a, e: fit.perCard[i].e, head: fit.head }
            : { q: fit.q, a: fit.a, e: fit.e, head: fit.head };
        const n = PL.cardNeeds(it, g, headLines, pt);
        return { i, frontOk: n.front <= fH + 0.01, backOk: n.back <= bH + 0.01 };
    });
}

test('flashGeom: il default è 2×2 verticale, 95×133 mm, corpo fisso 13 pt', () => {
    const g = PL.flashGeom();
    assert.strictEqual(g.key, '2x2v');
    assert.strictEqual(g.landscape, false);
    assert.strictEqual(g.cardW, 94.8);
    assert.strictEqual(g.cardH, 133.3);
    assert.strictEqual(g.perPage, 4);
    assert.strictEqual(g.q, 13);
    assert.strictEqual(g.aStart, 13, 'risposta allo stesso corpo della domanda');
    assert.strictEqual(g.qMax, 13, 'grow:false → non cresce oltre 13 pt');
    // chiave sconosciuta → default (mai una geometria indefinita in stampa)
    assert.strictEqual(PL.flashGeom('inesistente').key, '2x2v');
    // gli altri formati restano
    assert.strictEqual(PL.flashGeom('2x2').landscape, true);
    assert.ok(PL.flashGeom('2x2').qMax > PL.flashGeom('2x2').q, 'senza grow:false il corpo può crescere');
});

test('cardBoxes: carte attaccate, dentro i margini, tutta la pagina coperta', () => {
    const g = PL.flashGeom();
    const b = PL.cardBoxes(g);
    assert.strictEqual(b.length, 4);
    // niente spazi fra le carte (solo la tolleranza di stampa, 0,2 mm)
    assert.ok(b[1].x - (b[0].x + b[0].w) <= 0.21, 'nessun gutter orizzontale');
    assert.ok(b[2].y - (b[0].y + b[0].h) <= 0.21, 'nessun gutter verticale');
    // dentro la pagina
    b.forEach(x => {
        assert.ok(x.x >= g.marginX - 0.01 && x.y >= g.marginY - 0.01);
        assert.ok(x.x + x.w <= g.pageW - g.marginX + 0.01);
        assert.ok(x.y + x.h <= g.pageH - g.marginY + 0.01);
    });
});

test('lineCount / charsPerLine: l\'a-capo si conta in caratteri (font monospazio)', () => {
    // 40 mm a 12 pt: 40 / (0.612 × 12 × 0.352778) = 15 caratteri
    assert.strictEqual(PL.charsPerLine(40, 12, 0.612), 15);
    assert.strictEqual(PL.lineCount('', 20), 0);
    assert.strictEqual(PL.lineCount('ciao', 20), 1);
    // «uno due» (7) · «tre» (+quattro sarebbe 11) · «quattro»
    assert.strictEqual(PL.lineCount('uno due tre quattro', 10), 3);
    assert.strictEqual(PL.lineCount('uno due tre', 10), 2);
    // parola più lunga della riga: viene spezzata su più righe
    assert.strictEqual(PL.lineCount('abcdefghijklmnopqrstuvwxyz', 10), 3);
    assert.strictEqual(PL.lineCount('   spazi    doppi   ', 20), 1);
});

test('clampToLines: accorcia con «…» solo quando serve', () => {
    assert.strictEqual(PL.clampToLines('breve', 20, 3), 'breve');
    const t = PL.clampToLines('una frase molto lunga che non ci sta in due righe corte davvero', 12, 2);
    assert.ok(/…$/.test(t), 'finisce con i puntini');
    assert.ok(PL.lineCount(t, 12) <= 2, 'sta nelle righe concesse');
    assert.strictEqual(PL.clampToLines('qualsiasi', 10, 0), '');
});

test('fitFlash: al corpo scelto NESSUNA carta sborda (il bug delle domande lunghe)', () => {
    const g = PL.flashGeom();
    const fit = PL.fitFlash(CARTE, g, HEAD, {});
    assert.strictEqual(fit.q, 13, 'resta il corpo dichiarato');
    assert.strictEqual(fit.a, 13);
    assert.strictEqual(fit.clip.length, 0, 'nessun testo da accorciare');
    // La spiegazione ha lo stesso corpo della risposta (in corsivo): sulla carta
    // lunga non ci sta più e viene sacrificata — è la degradazione dichiarata.
    assert.ok(fit.dropExpl <= 1, 'al massimo la carta lunga perde la spiegazione');
    // la piega si sposta per fare spazio alla risposta lunga, entro i limiti
    assert.ok(fit.split >= g.splitMin && fit.split <= g.splitMax);
    nessunoSborda(CARTE, g, HEAD, fit).forEach(r => {
        assert.ok(r.frontOk, 'carta ' + r.i + ': domanda dentro la sua metà');
        assert.ok(r.backOk, 'carta ' + r.i + ': risposta dentro la sua metà');
    });
});

test('fitFlash: corpo per carta → le carte brevi restano grandi, nessuna sborda', () => {
    const g = PL.flashGeom('2x2');           // orizzontale, il corpo può crescere
    const fit = PL.fitFlash(CARTE, g, HEAD, { policy: 'card' });
    assert.strictEqual(fit.perCard.length, 3);
    assert.ok(fit.perCard[2].q > fit.perCard[0].q, 'la carta corta usa un corpo più grande');
    nessunoSborda(CARTE, g, HEAD, fit).forEach(r => {
        assert.ok(r.frontOk && r.backOk, 'carta ' + r.i + ' dentro i suoi limiti');
    });
});

test('fitFlash: testo mostruoso → prima cade la spiegazione, poi si accorcia con «…»', () => {
    const g = PL.flashGeom('4x3');           // carte piccole
    const lungo = [{
        question: 'Domanda lunghissima. '.repeat(30),
        answer: 'Risposta ancora più lunga. '.repeat(40),
        explanation: 'Spiegazione che non ci sta. '.repeat(10)
    }];
    const fit = PL.fitFlash(lungo, g, HEAD, {});
    assert.ok(fit.dropExpl > 0, 'la spiegazione viene tolta prima di rimpicciolire oltre il leggibile');
    assert.ok(fit.q >= g.floor, 'mai sotto il corpo minimo assoluto');
    assert.ok(fit.clip.length > 0, 'quello che resta fuori viene accorciato, non tagliato dalla stampante');
    // e dopo l'accorciamento il testo ci sta davvero
    const tagliata = {
        question: PL.clampToLines(lungo[0].question, fit.clip[0].cpl, fit.clip[0].maxLines),
        answer: lungo[0].answer, explanation: ''
    };
    const cpl = PL.charsPerLine(g.cardW - 2 * g.card.padX, fit.q, g.advance);
    assert.ok(PL.lineCount(tagliata.question, cpl) <= fit.clip[0].maxLines + 1);
});

test('fitFlash: fronte/retro → ogni faccia ha la carta INTERA a disposizione', () => {
    const g = PL.flashGeom();
    const piega = PL.fitFlash(CARTE, g, HEAD, {});
    const duplex = PL.fitFlash(CARTE, g, HEAD, { duplex: true });
    assert.strictEqual(duplex.clip.length, 0);
    nessunoSborda(CARTE, g, HEAD, duplex, { duplex: true }).forEach(r => {
        assert.ok(r.frontOk && r.backOk, 'carta ' + r.i + ': faccia intera');
    });
    // con la carta intera c'è più spazio che con la piega
    assert.ok(duplex.q >= piega.q);
});

test('cutLines / cropMarks: linee continue da bordo a bordo, crocini dentro la pagina', () => {
    const g = PL.flashGeom();
    const segs = PL.cutLines(g);
    assert.strictEqual(segs.filter(s => s.kind === 'v').length, g.cols + 1);
    assert.strictEqual(segs.filter(s => s.kind === 'h').length, g.rows + 1);
    const marks = PL.cropMarks(g);
    marks.forEach(m => {
        assert.ok(m.x1 >= 0 && m.y1 >= 0 && m.x2 <= g.pageW && m.y2 <= g.pageH, 'crocino dentro il foglio');
    });
});

// ── Soglia di caratteri ─────────────────────────────────────────────────────
// È la regola che il docente vede nell'editor e che filtra le carte generate in
// automatico. Deve essere VERA: un testo al limite deve entrare davvero.

test('charLimits: il testo al limite entra nella carta senza accorciamenti', () => {
    const g = PL.flashGeom();
    const L = PL.charLimits(g, HEAD);
    assert.ok(L.question >= 100 && L.question <= 400, 'soglia domanda plausibile: ' + L.question);
    assert.strictEqual(L.question % 10, 0, 'numero tondo, facile da ricordare');
    assert.strictEqual(L.answer % 10, 0);
    // testo esattamente al limite → nessun accorciamento, corpo pieno
    const carta = {
        question: 'parola '.repeat(80).slice(0, L.question).trim(),
        answer: 'risposta '.repeat(80).slice(0, L.answer).trim(),
        explanation: 'nota '.repeat(40).slice(0, L.explanation).trim()
    };
    const fit = PL.fitFlash([carta], g, HEAD, {});
    assert.strictEqual(fit.clip.length, 0, 'niente «…» su un testo entro soglia');
    assert.strictEqual(fit.q, g.q, 'resta il corpo dichiarato');
    assert.strictEqual(fit.dropExpl, 0, 'la spiegazione entro soglia resta');
});

test('charLimits: una testata lunga si mangia caratteri della domanda', () => {
    const g = PL.flashGeom();
    const corta = PL.charLimits(g, { root: 'Storia', theme: 'Neutralità' });
    const lunga = PL.charLimits(g, HEAD);
    assert.ok(corta.question > lunga.question, 'più righe di testata = meno spazio per la domanda');
    // e una soglia scritta a mano nel modello vince sul calcolo
    PL.setModel({ flash: { limits: { question: 90, answer: 120 } } }, false);
    const forz = PL.charLimits(PL.flashGeom(), HEAD);
    assert.strictEqual(forz.question, 90);
    assert.strictEqual(forz.answer, 120);
    PL.clearModel();
});

test('overLimit: segnala le carte da accorciare e quale campo sfora', () => {
    const g = PL.flashGeom();
    const L = PL.charLimits(g, HEAD);
    const items = [
        { question: 'corta?', answer: 'corta.' },
        { question: 'x'.repeat(L.question + 50), answer: 'ok' },
        { question: 'ok?', answer: 'y'.repeat(L.answer + 80) },
        { question: 'x'.repeat(L.question + 1), answer: 'y'.repeat(L.answer + 1) }
    ];
    const fuori = PL.overLimit(items, L);
    assert.deepStrictEqual(fuori.map(o => o.i), [1, 2, 3]);
    assert.strictEqual(fuori[0].tooLong, 'domanda');
    assert.strictEqual(fuori[1].tooLong, 'risposta');
    assert.strictEqual(fuori[2].tooLong, 'entrambe');
    assert.strictEqual(PL.overLimit([], L).length, 0);
});

test('etichette vuote: niente «TEMA:» né «RISPOSTA», e la risposta guadagna una riga', () => {
    const g = PL.flashGeom();
    assert.strictEqual(g.labels.themePrefix, '');
    assert.strictEqual(g.labels.answer, '');
    // Il confronto va fatto sull'altezza richiesta dalla metà risposta: le soglie
    // in caratteri sono arrotondate alla decina, e il guadagno di una riga può
    // sparire nell'arrotondamento (o finire alla spiegazione, che ora ha lo
    // stesso corpo della risposta).
    const carta = { question: 'Domanda?', answer: 'Risposta breve.', explanation: '' };
    const pt = { q: g.q, a: g.aStart, e: g.aStart, head: g.head };
    const senza = PL.cardNeeds(carta, g, 2, pt).back;
    PL.setModel({ flash: { labels: { answer: 'Risposta' } } }, false);
    const con = PL.cardNeeds(carta, PL.flashGeom(), 2, pt).back;
    PL.clearModel();
    assert.ok(con > senza, 'l\'etichetta costa spazio: ' + con + ' > ' + senza);
});

test('modello utente: si sovrascrivono i numeri senza toccare il codice', () => {
    const base = PL.flashGeom();
    PL.setModel({ flash: { type: { '2x2v': { q: 11, a: 11, head: 8, min: 8, grow: false } } } }, false);
    const g = PL.flashGeom();
    assert.strictEqual(g.q, 11, 'il modello vince sul default');
    assert.strictEqual(g.cardW, base.cardW, 'la geometria non dichiarata resta quella di default');
    // un modello incoerente viene rifiutato, non applicato a metà
    assert.throws(() => PL.importModel({ flash: { formats: { rotto: { cols: 0, rows: 0 } } } }), /non valido/);
    assert.throws(() => PL.importModel('non è json'), /./);
    PL.clearModel();
    assert.strictEqual(PL.flashGeom().q, 13, 'clearModel riporta ai default');
    // export/import completo
    const json = PL.exportModel();
    assert.ok(JSON.parse(json).flash.formats['2x2v'], 'il modello esportato è leggibile');
    assert.deepStrictEqual(PL.validate(JSON.parse(json)), [], 'il modello esportato è valido');
});

/* ── 0128, allargamento 1 (Giacomo, 27/10, sul mockup: «C») — interlinea 1,6 e spazio +0,25 em ── */
test('0128 · la tipografia scelta: interlinea 1,6 e spazio in più fra le parole 0,25 em, nella geometria', () => {
    assert.strictEqual(PL.DEFAULTS.flash.type.lineH, 1.6);
    assert.strictEqual(PL.DEFAULTS.flash.type.wordSpace, 0.25);
    const g = PL.flashGeom();
    assert.strictEqual(g.lineH, 1.6);
    assert.strictEqual(g.wordSpace, 0.25);
    assert.strictEqual(g.headLineH, 1.3, 'la testata tiene la sua interlinea');
});

test('0128 · uno spazio fra le parole vale più di un carattere: le righe si contano con lo spazio vero', () => {
    const g = PL.flashGeom();
    const sp = PL.spazioIn(g);
    assert.ok(Math.abs(sp - (1 + 0.25 / g.advance)) < 1e-9, 'uno spazio = 1 + 0,25 em / larghezza di un carattere');
    const testo = 'uno due tre quattro cinque sei sette otto nove dieci';
    assert.strictEqual(PL.lineCount(testo, 20), PL.lineCount(testo, 20, 1), 'senza spaceChars resta il conto di prima');
    assert.ok(PL.lineCount(testo, 20, sp) >= PL.lineCount(testo, 20), 'con lo spazio vero non meno righe');
    assert.strictEqual(PL.lineCount('aaaa bbbb', 9, 1), 1);
    assert.strictEqual(PL.lineCount('aaaa bbbb', 9, 1.5), 2, 'mezzo carattere in più e la seconda parola va a capo');
    assert.strictEqual(PL.clampToLines('aaaa bbbb cccc', 9, 1, 1.5), 'aaaa…', 'anche l\'accorciamento conta lo spazio vero');
});

test('0128 · con più aria nessuna carta sborda, e le soglie per l\'AI scendono di conseguenza', () => {
    const g = PL.flashGeom();
    const fit = PL.fitFlash(CARTE, g, HEAD);
    nessunoSborda(CARTE, g, HEAD, fit).forEach((c) => assert.ok(c.frontOk && c.backOk, 'carta ' + c.i));
    const dopo = PL.charLimits(g, HEAD);
    PL.setModel({ flash: { type: { lineH: 1.35, wordSpace: 0 } } }, false);
    const prima = PL.charLimits(PL.flashGeom(), HEAD);
    PL.clearModel();
    assert.ok(dopo.question < prima.question && dopo.answer < prima.answer, `domanda ${prima.question}→${dopo.question}, risposta ${prima.answer}→${dopo.answer}`);
});

/* ── 0128 · il fronte/retro rifinito (Giacomo, 26/10: «Riapro e si rifinisce») ── */
test('0128 · fronte/retro: il margine per la deriva di registro (3 mm) e il tetto del corpo sulla carta intera', () => {
    assert.strictEqual(PL.DEFAULTS.flash.duplex.safe, 3);
    const g = PL.flashGeom();
    assert.strictEqual(g.safe, 3);
    assert.strictEqual(g.qMax, 13, 'nel pieghevole il corpo resta fisso');
    assert.strictEqual(g.qMaxDuplex, 20.8, 'in fronte/retro può crescere fino a 13 × 1,6');
});

test('0128 · backOrder: dietro ogni carta c\'è la sua risposta, per lato lungo e corto, in verticale e in orizzontale', () => {
    const v = PL.flashGeom('2x2v'), o = PL.flashGeom('2x2');
    assert.deepStrictEqual(PL.backOrder(4, v, 'lungo'), [1, 0, 3, 2], 'in piedi, lato lungo: colonne specchiate (come oggi)');
    assert.deepStrictEqual(PL.backOrder(4, v, 'corto'), [2, 3, 0, 1], 'in piedi, lato corto: righe specchiate');
    assert.deepStrictEqual(PL.backOrder(3, v, 'lungo'), [1, 0, null, 2], 'l\'ultima pagina col posto vuoto');
    assert.deepStrictEqual(PL.backOrder(3, v, 'corto'), [2, null, 0, 1]);
    assert.deepStrictEqual(PL.backOrder(4, o, 'lungo'), [2, 3, 0, 1], 'in orizzontale il lato lungo è in alto: righe specchiate');
    assert.deepStrictEqual(PL.backOrder(4, o, 'corto'), [1, 0, 3, 2]);
    assert.deepStrictEqual(PL.backOrder(12, PL.flashGeom('4x3'), 'lungo').slice(0, 4), [8, 9, 10, 11]);
    assert.deepStrictEqual(PL.backOrder(6, PL.flashGeom('2x3'), 'corto'), [4, 5, 2, 3, 0, 1]);
    assert.deepStrictEqual(PL.backOrder(4, v), [1, 0, 3, 2], 'di serie il lato lungo');
    // ogni carta ha un posto solo sul retro, in tutti i formati
    PL.flashFormats().forEach((f) => ['lungo', 'corto'].forEach((l) => {
        const g = PL.flashGeom(f), ord = PL.backOrder(g.perPage, g, l);
        assert.deepStrictEqual(ord.slice().sort((a, b) => a - b), Array.from({ length: g.perPage }, (_, i) => i), f + ' ' + l);
    }));
});

test('0128 · il retro porta la testata e sta dentro il margine: chiede più spazio del retro di prima', () => {
    const g = PL.flashGeom();
    const pt = { q: 13, a: 13, e: 13, head: g.head };
    const prima = PL.cardNeeds(CARTE[0], g, 2, pt);
    const dopo = PL.cardNeeds(CARTE[0], g, 2, pt, { safe: 3 });
    assert.strictEqual(dopo.front, prima.front, 'il fronte non cambia: è lui che si taglia');
    const testata = PL.blockH(2, g.head, g.headLineH) + g.card.headGap;
    assert.ok(dopo.back >= prima.back + 6 + testata - g.card.backPadTop + g.card.padTop - 0.001, 'due margini da 3 mm e la testata in più');
    assert.ok(dopo.aLines >= prima.aLines, 'riga più stretta di 6 mm: non meno righe');
});

test('0128 · fitFlash in fronte/retro rifinito: il corpo cresce sulla carta intera e nessun retro sborda dal margine', () => {
    const g = PL.flashGeom();
    const corte = [{ question: 'Che cos\'è il Réduit?', answer: 'Le Alpi fortificate.' }, { question: 'Chi lo volle?', answer: 'Guisan.' }];
    const vecchio = PL.fitFlash(corte, g, HEAD, { duplex: true });
    const nuovo = PL.fitFlash(corte, g, HEAD, { duplex: true, retro: { safe: g.safe } });
    assert.strictEqual(vecchio.q, 13, 'il retro di prima: corpo fermo');
    assert.strictEqual(nuovo.q, 20.8, 'il retro rifinito: fino al tetto');
    const lunghe = PL.fitFlash(CARTE, g, HEAD, { duplex: true, retro: { safe: g.safe } });
    const pt = { q: lunghe.q, a: lunghe.a, e: lunghe.e, head: lunghe.head };
    lunghe.items.forEach((it, i) => {
        const n = PL.cardNeeds(it, g, lunghe.headLines, lunghe.policy === 'card' ? Object.assign({}, lunghe.perCard[i], { head: lunghe.head }) : pt, { safe: g.safe });
        assert.ok(n.front <= g.cardH + 0.01 && n.back <= g.cardH + 0.01, 'carta ' + i);
    });
});

test('0128 · croce del foglio di prova: al centro della carta, bracci e tacche di millimetro dentro la carta', () => {
    const g = PL.flashGeom();
    const b = PL.cardBoxes(g)[0];
    const c = PL.croce(b);
    assert.strictEqual(c.cx, Math.round((b.x + b.w / 2) * 100) / 100);
    assert.strictEqual(c.cy, Math.round((b.y + b.h / 2) * 100) / 100);
    const tacche = c.segs.filter((s) => s.kind === 'tacca');
    assert.strictEqual(tacche.length, 4 * 5, 'cinque tacche da un millimetro per braccio');
    assert.ok(c.segs.every((s) => s.x1 >= b.x && s.x2 <= b.x + b.w && s.y1 >= b.y && s.y2 <= b.y + b.h), 'tutto dentro la carta');
    assert.ok(c.segs.some((s) => s.kind === 'braccio' && s.y1 === s.y2) && c.segs.some((s) => s.kind === 'braccio' && s.x1 === s.x2));
});

/* ── 0128 · allargamento 2 (Giacomo, 27/10): «non troncare il testo»; minimo «fino a 11pt», poi «Più piccola solo lei, e avviso» ── */
const MOSTRO = { question: 'Una domanda volutamente lunghissima. '.repeat(14).trim(), answer: 'Una risposta altrettanto lunga, che nel pieghevole non può stare a nessun corpo leggibile. '.repeat(3).trim(), explanation: 'E una spiegazione.' };

test('0128 · senzaTagli: le spiegazioni restano e niente «…»; il corpo scende uguale fino a 11 pt', () => {
    const g = PL.flashGeom();
    const prima = PL.fitFlash(CARTE, g, HEAD);
    const dopo = PL.fitFlash(CARTE, g, HEAD, { senzaTagli: true });
    assert.strictEqual(dopo.dropExpl, 0, 'nessuna spiegazione tolta');
    assert.deepStrictEqual(dopo.items.map((c) => c.explanation), CARTE.map((c) => c.explanation), 'le spiegazioni intere');
    assert.deepStrictEqual(dopo.items.map((c) => c.question + c.answer), CARTE.map((c) => c.question + c.answer), 'i testi interi');
    assert.strictEqual(dopo.clip.length, 0);
    assert.ok(dopo.q >= 11 && dopo.q <= 13, 'corpo uguale fra 11 e 13: ' + dopo.q);
    dopo.sotto.forEach((i) => assert.ok(dopo.perCard[i].q < 11 && dopo.perCard[i].q >= 6, 'sotto gli 11 solo da sola: carta ' + i + ' a ' + dopo.perCard[i].q));
    assert.deepStrictEqual(dopo.troppoLunghe, []);
    assert.ok(prima.q >= dopo.q, 'prima teneva il corpo togliendo testo: ' + prima.q + ' / ' + dopo.q);
});

test('0128 · senzaTagli: la carta che non entra a 11 pt scende da sola (mai sotto 6), le altre restano grandi', () => {
    const g = PL.flashGeom();
    const carte = [CARTE[1], CARTE[2], MOSTRO];
    const fit = PL.fitFlash(carte, g, HEAD, { senzaTagli: true });
    assert.deepStrictEqual(fit.sotto, [2], 'solo la carta lunga');
    assert.strictEqual(fit.q, 13, 'le altre al corpo pieno');
    assert.ok(fit.perCard[2].q < 11 && fit.perCard[2].q >= 6, 'la lunga col suo corpo: ' + fit.perCard[2].q);
    assert.strictEqual(fit.items[2].question, MOSTRO.question, 'intera');
    const pt = Object.assign({}, fit.perCard[2], { head: fit.head });
    const n = PL.cardNeeds(fit.items[2], g, fit.headLines, pt);
    assert.ok(n.front <= g.cardH * fit.split / 100 + 0.01 && n.back <= g.cardH - g.cardH * fit.split / 100 + 0.01, 'e ci sta');
    assert.deepStrictEqual(fit.troppoLunghe, []);
});

test('0128 · senzaTagli: oltre i 6 pt (testo enorme) l\'ultima rete resta, ma è segnalata', () => {
    const g = PL.flashGeom();
    const enorme = { question: 'parola '.repeat(900).trim(), answer: 'Sì.', explanation: '' };
    const fit = PL.fitFlash([CARTE[2], enorme], g, HEAD, { senzaTagli: true });
    assert.deepStrictEqual(fit.troppoLunghe, [1]);
    assert.ok(fit.clip.some((c) => c.i === 1), 'accorciata solo lei, e lo si dice');
});

test('0128 · senzaTagliAttivo: acceso di serie, spento solo con «0»', () => {
    assert.strictEqual(typeof PL.senzaTagliAttivo, 'function');
    assert.strictEqual(PL.MIN_SENZA_TAGLI, 11);
});

/* ── 0128 · allargamento 3 (Giacomo, 27/10: «nell'editor se serve inserisci la modifica della dimensione del font per
   aiutare il docente a ottimizzare dimensioni e testi per limitare le troncature») ── */
test('0128 · il corpo scelto dal docente: vale per il 2×2 in piedi, fra 11 e 16 pt, e le soglie lo seguono', () => {
    try {
        const base = PL.charLimits(PL.flashGeom(), HEAD);
        assert.strictEqual(PL.corpo(), null, 'di serie nessuna scelta');
        PL.setCorpo(12);
        const g = PL.flashGeom();
        assert.strictEqual(PL.corpo(), 12);
        assert.strictEqual(g.q, 12); assert.strictEqual(g.aStart, 12); assert.strictEqual(g.qMax, 12);
        /* allargamento 16 (Giacomo, 27/10: «Esce al corpo scelto»): in fronte/retro il corpo scelto non cresce più */
        assert.strictEqual(g.qMaxDuplex, 12, 'in fronte/retro esce al corpo scelto (prima 12 × 1,6 = 19,2)');
        const piu = PL.charLimits(g, HEAD);
        assert.ok(piu.question > base.question && piu.answer > base.answer, 'a 12 pt entra più testo: ' + base.question + '→' + piu.question);
        assert.strictEqual(PL.flashGeom('2x2').q, 18, 'gli altri formati non cambiano');
        PL.setCorpo(30); assert.strictEqual(PL.corpo(), 16, 'mai oltre 16');
        PL.setCorpo(8); assert.strictEqual(PL.corpo(), 11, 'mai sotto il minimo di 11');
    } finally { PL.setCorpo(null); }
    assert.strictEqual(PL.corpo(), null, 'si torna al corpo di serie');
    assert.strictEqual(PL.flashGeom().q, 13);
});

/* ── 0128 · allargamento 5 (Giacomo, 27/10, al gate: «aggiungi anche l'opzione per l'interlinea») ── */
test('0128 · l\'interlinea scelta dal docente: vale per il 2×2 in piedi, fra 1,2 e 2, e le soglie la seguono', () => {
    try {
        const base = PL.charLimits(PL.flashGeom(), HEAD);
        assert.strictEqual(PL.interlinea(), null, 'di serie nessuna scelta');
        assert.strictEqual(PL.flashGeom().lineH, 1.6, 'di serie: il token');
        PL.setInterlinea(1.3);
        assert.strictEqual(PL.flashGeom().lineH, 1.3);
        const piu = PL.charLimits(PL.flashGeom(), HEAD);
        assert.ok(piu.question > base.question && piu.answer > base.answer, 'più stretta, entra più testo: ' + base.question + '→' + piu.question);
        assert.strictEqual(PL.flashGeom('2x2').lineH, 1.6, 'gli altri formati non cambiano');
        PL.setInterlinea(1.6 + 0.1); assert.strictEqual(PL.interlinea(), 1.7, 'a passi di 0,1, senza resti');
        PL.setInterlinea(9); assert.strictEqual(PL.interlinea(), 2, 'mai oltre 2');
        PL.setInterlinea(0.2); assert.strictEqual(PL.interlinea(), 1.2, 'mai sotto 1,2');
    } finally { PL.setInterlinea(null); }
    assert.strictEqual(PL.interlinea(), null, 'si torna all\'interlinea di serie');
    assert.strictEqual(PL.flashGeom().lineH, 1.6);
});
