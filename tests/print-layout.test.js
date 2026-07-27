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
