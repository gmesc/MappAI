// Test del core del FOGLIO DEI NODI (mappai-nodesheet-core.js): geometria,
// soglie di caratteri, modello delle card e riallineamento con la mappa.
const { test } = require('node:test');
const assert = require('node:assert');
const NS = require('../public/js/mappai-nodesheet-core.js');

// ── geometria ───────────────────────────────────────────────────────────────
test('geom: la griglia riempie A4 orizzontale con margini 10/15', () => {
    const g = NS.geom('2x2');
    assert.strictEqual(g.cols, 2);
    assert.strictEqual(g.rows, 2);
    assert.strictEqual(g.perPage, 4);
    // (297 - 20) / 2 = 138.5 · (210 - 30) / 2 = 90
    assert.ok(Math.abs(g.cardW - 138.5) < 0.001, 'cardW ' + g.cardW);
    assert.ok(Math.abs(g.cardH - 90) < 0.001, 'cardH ' + g.cardH);
});

test('geom: formato ignoto → 2x2; 3x4 non ammette contenuto sotto il titolo', () => {
    assert.strictEqual(NS.fmtOf('boh'), '2x2');
    assert.strictEqual(NS.allowsContent('3x4'), false);
    assert.strictEqual(NS.allowsContent('2x1'), true);
    assert.strictEqual(NS.geom('3x4').perPage, 12);
});

test('pages: 13 card in 3x4 = 2 pagine', () => {
    assert.strictEqual(NS.pages(13, '3x4'), 2);
    assert.strictEqual(NS.pages(0, '2x2'), 0);
    assert.strictEqual(NS.pages(4, '2x2'), 1);
    assert.strictEqual(NS.pages(5, '2x2'), 2);
});

// ── soglie di caratteri ─────────────────────────────────────────────────────
test('charLimits: la card grande tiene più testo di quella piccola', () => {
    const big = NS.charLimits('2x1', 'title', '');
    const small = NS.charLimits('3x4', 'title', '');
    assert.ok(big.title > small.title, big.title + ' > ' + small.title);
    assert.ok(small.title >= 10);
});

test('charLimits: dando un contenuto alla card, il titolo perde spazio', () => {
    const solo = NS.charLimits('2x2', 'title', 'Fotosintesi clorofilliana');
    const conKw = NS.charLimits('2x2', 'keywords', 'Fotosintesi clorofilliana');
    assert.ok(conKw.title < solo.title, 'titolo con contenuto sotto: ' + conKw.title + ' vs ' + solo.title);
    assert.ok(conKw.keywords > 0 && conKw.keywords <= NS.MAX_KEYWORDS);
    assert.ok(conKw.keyword > 0);
});

test('charLimits: un titolo lungo mangia le righe delle parole chiave', () => {
    const corto = NS.charLimits('2x2', 'keywords', 'Acqua');
    const lungo = NS.charLimits('2x2', 'keywords', 'Le reazioni della fase oscura del ciclo di Calvin nelle piante');
    assert.ok(lungo.keywords <= corto.keywords, lungo.keywords + ' <= ' + corto.keywords);
});

test('charLimits: in 3x4 il tipo di contenuto è ignorato (solo titolo)', () => {
    const a = NS.charLimits('3x4', 'keywords', 'Nodo');
    assert.strictEqual(a.keywords, 0);
    assert.strictEqual(a.desc, 0);
});

test('charLimits: la scheda con descrizione dichiara righe e caratteri > 0', () => {
    const c = NS.charLimits('2x1', 'card', 'Titolo breve');
    assert.ok(c.descLines > 3, 'righe desc ' + c.descLines);
    assert.ok(c.desc > 100, 'caratteri desc ' + c.desc);
});

// ── modello ─────────────────────────────────────────────────────────────────
test('normCard: tipo sconosciuto → solo titolo, keyword ripulite e capped a 7', () => {
    const c = NS.normCard({
        id: 'n1', label: '  Fotosintesi   clorofilliana ', layout: 'bogus',
        keywords: ['  luce ', '', 'acqua', 'CO2', 'a', 'b', 'c', 'd', 'e']
    });
    assert.strictEqual(c.layout, 'title');
    assert.strictEqual(c.label, 'Fotosintesi clorofilliana');
    assert.strictEqual(c.keywords.length, 7);
    assert.strictEqual(c.keywords[0], 'luce');
    // La riga vuota resta nel modello (è quella che il docente sta scrivendo):
    // sparirebbe sotto le dita al primo tasto. Fuori solo alla stampa.
    assert.strictEqual(c.keywords[1], '');
    assert.deepStrictEqual(NS.filledKeywords(c.keywords), ['luce', 'acqua', 'CO2', 'a', 'b', 'c']);
});

test('parola chiave appena aggiunta: la riga vuota sopravvive alla modifica', () => {
    let cards = [NS.normCard({ id: 'a', label: 'A', layout: 'keywords' })];
    cards = NS.addKeyword(cards, 0, '');
    assert.strictEqual(cards[0].keywords.length, 1);
    cards = NS.setKeyword(cards, 0, 0, 'scritta a mano');
    assert.deepStrictEqual(cards[0].keywords, ['scritta a mano']);
    // e una riga rimasta vuota non finisce sulla card stampata
    cards = NS.addKeyword(cards, 0, '');
    const print = NS.toPrintCards({ fmt: '2x2', cards: cards });
    assert.deepStrictEqual(print[0].keywords, ['scritta a mano']);
});

test('validateDoc: parole chiave tutte vuote = nessuna parola chiave', () => {
    const codes = NS.validateDoc({ fmt: '2x2', cards: [{ id: 'a', label: 'A', layout: 'keywords', keywords: ['', ''] }] }).map(p => p.code);
    assert.deepStrictEqual(codes, ['no-keywords']);
});

test('docFromNodes: 3x4 forza «solo titolo» anche se ne chiedi un altro', () => {
    const nodes = [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }];
    const doc = NS.docFromNodes(nodes, { fmt: '3x4', layout: 'keywords' });
    assert.strictEqual(doc.fmt, '3x4');
    assert.ok(doc.cards.every(c => c.layout === 'title'));
});

test('docFromNodes: parole chiave e descrizioni passate per id finiscono nelle card', () => {
    const nodes = [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }];
    const doc = NS.docFromNodes(nodes, {
        fmt: '2x2', layout: 'keywords',
        keywords: { a: ['uno', 'due'] }, descs: { b: 'testo' }
    });
    assert.deepStrictEqual(doc.cards[0].keywords, ['uno', 'due']);
    assert.strictEqual(doc.cards[1].desc, 'testo');
});

test('setLayout: il prefill riempie solo i campi ancora vuoti', () => {
    let cards = [NS.normCard({ id: 'a', label: 'A' }), NS.normCard({ id: 'b', label: 'B', keywords: ['mia'], layout: 'keywords' })];
    cards = NS.setLayout(cards, 0, 'keywords', { keywords: ['x', 'y'] });
    cards = NS.setLayout(cards, 1, 'keywords', { keywords: ['sostituite?'] });
    assert.deepStrictEqual(cards[0].keywords, ['x', 'y']);
    assert.deepStrictEqual(cards[1].keywords, ['mia'], 'quello che ha scritto il docente non si tocca');
});

test('setLayout / setFmt: 3x4 riporta tutte le card a «solo titolo»', () => {
    let doc = NS.docFromNodes([{ id: 'a', label: 'A' }], { fmt: '2x2', layout: 'card' });
    assert.strictEqual(doc.cards[0].layout, 'card');
    doc = NS.setFmt(doc, '3x4');
    assert.strictEqual(doc.cards[0].layout, 'title');
});

test('parole chiave: aggiungi, modifica, elimina (max 7)', () => {
    let cards = [NS.normCard({ id: 'a', label: 'A', layout: 'keywords' })];
    for (let i = 0; i < 9; i++) cards = NS.addKeyword(cards, 0, 'k' + i);
    assert.strictEqual(cards[0].keywords.length, 7);
    cards = NS.setKeyword(cards, 0, 1, '  nuova   parola ');
    assert.strictEqual(cards[0].keywords[1], 'nuova parola');
    cards = NS.removeKeyword(cards, 0, 0);
    assert.strictEqual(cards[0].keywords.length, 6);
    assert.strictEqual(cards[0].keywords[0], 'nuova parola');
});

test('moveCard: sposta senza uscire dai bordi', () => {
    let cards = ['a', 'b', 'c'].map(id => NS.normCard({ id: id, label: id }));
    cards = NS.moveCard(cards, 2, 0);
    assert.deepStrictEqual(cards.map(c => c.id), ['c', 'a', 'b']);
    cards = NS.moveCard(cards, 0, -5);
    assert.deepStrictEqual(cards.map(c => c.id), ['c', 'a', 'b']);
});

// ── riallineamento con la mappa ─────────────────────────────────────────────
test('syncCards: nodi nuovi in coda, nodi spariti fuori, testi rivisti intatti', () => {
    const cards = [
        NS.normCard({ id: 'a', label: 'Titolo accorciato', layout: 'keywords', keywords: ['x'] }),
        NS.normCard({ id: 'via', label: 'Nodo cancellato' })
    ];
    const nodes = [{ id: 'a', label: 'Titolo lunghissimo originale' }, { id: 'nuovo', label: 'Nuovo' }];
    const out = NS.syncCards(cards, nodes);
    assert.strictEqual(out.added, 1);
    assert.strictEqual(out.removed, 1);
    assert.deepStrictEqual(out.cards.map(c => c.id), ['a', 'nuovo']);
    assert.strictEqual(out.cards[0].label, 'Titolo accorciato', 'il titolo del docente non viene riscritto');
    assert.strictEqual(out.cards[0].layout, 'keywords');
    assert.strictEqual(out.cards[1].layout, 'title');
});

test('syncCards: le card tolte a mano non tornano da sole', () => {
    const nodes = [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }];
    const out = NS.syncCards([NS.normCard({ id: 'a', label: 'A' })], nodes, { exclude: ['b'] });
    assert.deepStrictEqual(out.cards.map(c => c.id), ['a']);
    assert.strictEqual(out.added, 0);
});

// ── soglie sulle card vere ──────────────────────────────────────────────────
test('overFields: titolo enorme → fuori soglia; titolo normale → dentro', () => {
    const ok = NS.normCard({ id: 'a', label: 'Fotosintesi' });
    const ko = NS.normCard({ id: 'b', label: 'parola '.repeat(60) });
    assert.deepStrictEqual(NS.overFields(ok, '2x2'), []);
    assert.deepStrictEqual(NS.overFields(ko, '2x2'), ['title']);
});

test('overFields: troppe parole chiave per lo spazio rimasto', () => {
    const L = NS.charLimits('2x2', 'keywords', 'Titolo');
    const kws = [];
    for (let i = 0; i < NS.MAX_KEYWORDS; i++) kws.push('k' + i);
    const c = NS.normCard({ id: 'a', label: 'Titolo', layout: 'keywords', keywords: kws });
    const expected = kws.length > L.keywords ? ['keywords'] : [];
    assert.deepStrictEqual(NS.overFields(c, '2x2'), expected);
    // una parola chiave più larga della card sfora sempre
    const wide = NS.normCard({ id: 'b', label: 'T', layout: 'keywords', keywords: ['x'.repeat(L.keyword + 5)] });
    assert.deepStrictEqual(NS.overFields(wide, '2x2'), ['keywords']);
});

test('overFields: descrizione oltre lo spazio della scheda', () => {
    const L = NS.charLimits('2x2', 'card', 'Titolo');
    const c = NS.normCard({ id: 'a', label: 'Titolo', layout: 'card', desc: 'x'.repeat(L.desc + 50) });
    assert.deepStrictEqual(NS.overFields(c, '2x2'), ['desc']);
    const ok = NS.normCard({ id: 'b', label: 'Titolo', layout: 'card', desc: 'x'.repeat(Math.max(1, L.desc - 50)) });
    assert.deepStrictEqual(NS.overFields(ok, '2x2'), []);
});

test('overCards: elenca indice e campo di ogni card fuori soglia', () => {
    const cards = [
        NS.normCard({ id: 'a', label: 'Corto' }),
        NS.normCard({ id: 'b', label: 'lungo '.repeat(80) })
    ];
    const over = NS.overCards(cards, '2x2');
    assert.strictEqual(over.length, 1);
    assert.strictEqual(over[0].i, 1);
    assert.deepStrictEqual(over[0].fields, ['title']);
});

// ── uscite ──────────────────────────────────────────────────────────────────
test('toPrintCards: i campi che il tipo non usa non viaggiano verso la stampa', () => {
    const doc = {
        fmt: '2x2', cards: [
            { id: 'a', label: 'A', layout: 'title', keywords: ['fantasma'], desc: 'fantasma' },
            { id: 'b', label: 'B', layout: 'keywords', keywords: ['vera'], desc: 'fantasma' },
            { id: 'c', label: 'C', layout: 'card', keywords: ['fantasma'], desc: 'vera' }
        ]
    };
    const out = NS.toPrintCards(doc);
    assert.deepStrictEqual(out[0].keywords, []);
    assert.strictEqual(out[0].desc, '');
    assert.deepStrictEqual(out[1].keywords, ['vera']);
    assert.strictEqual(out[1].desc, '');
    assert.strictEqual(out[2].desc, 'vera');
    assert.deepStrictEqual(out[2].keywords, []);
});

test('validateDoc: segnala card senza titolo e contenuti dichiarati ma vuoti', () => {
    const doc = {
        fmt: '2x2', cards: [
            { id: 'a', label: '', layout: 'title' },
            { id: 'b', label: 'B', layout: 'keywords', keywords: [] },
            { id: 'c', label: 'C', layout: 'card', desc: '' },
            { id: 'd', label: 'D', layout: 'title' }
        ]
    };
    const codes = NS.validateDoc(doc).map(p => p.code);
    assert.deepStrictEqual(codes, ['no-title', 'no-keywords', 'no-desc']);
    assert.deepStrictEqual(NS.validateDoc({ fmt: '2x2', cards: [] }).map(p => p.code), ['empty']);
});

test('countsByLayout: riepilogo dei tipi di contenuto sul foglio', () => {
    const cards = [
        { layout: 'title' }, { layout: 'title' }, { layout: 'keywords' }, { layout: 'card' }, { layout: 'nope' }
    ];
    assert.deepStrictEqual(NS.countsByLayout(cards), { title: 3, summary: 0, keywords: 1, card: 1 });
});

test('normDoc: documento salvato malandato → forma valida senza eccezioni', () => {
    const d = NS.normDoc({ fmt: 'zzz', bg: 'boh', depth: null, cards: [{ id: 1, label: 5 }] });
    assert.strictEqual(d.fmt, '2x2');
    assert.strictEqual(d.bg, 'none');
    assert.strictEqual(d.depth, 'all');
    assert.strictEqual(d.cards[0].label, '5');
    assert.deepStrictEqual(NS.normDoc(null).cards, []);
});


/* ══ IL BOTTONE «PAROLE CHIAVE CON AI» (19/8) ════════════════════════════════
   Non faceva niente, e la ragione è la trappola 27: cercava le card «parole
   chiave» ancora VUOTE, ma dare quel contenuto a una card la riempie subito col
   ripiego deterministico — quindi quella lista era quasi sempre vuota e il
   bottone rispondeva «niente da fare». */

test('keywordTargets: i buchi e tutte le card «parole chiave»', () => {
    const cards = [
        { id: 'a', label: 'A', layout: 'title' },
        { id: 'b', label: 'B', layout: 'keywords', keywords: ['fusto', 'radici'] },
        { id: 'c', label: 'C', layout: 'keywords', keywords: [] },
        { id: 'd', label: 'D', layout: 'card', desc: 'testo' }
    ];
    const r = NS.keywordTargets(cards);
    assert.deepStrictEqual(r.conKw, [1, 2], 'tutte quelle col contenuto «parole chiave»');
    assert.deepStrictEqual(r.vuote, [2], 'solo il buco vero');
});

test('keywordTargets: il caso NORMALE è «piene» — è quello che rendeva morto il bottone', () => {
    const piene = [{ id: 'b', label: 'B', layout: 'keywords', keywords: ['x'] }];
    const r = NS.keywordTargets(piene);
    assert.deepStrictEqual(r.vuote, [], 'nessun buco: guardando solo qui il bottone non aveva mai niente da fare');
    assert.deepStrictEqual(r.conKw, [0], '…e invece c\'è una card su cui l\'AI ha senso');
});

test('keywordTargets: parole vuote in mezzo contano come buco', () => {
    // `addKeyword` aggiunge una riga VUOTA da compilare: una card così è un buco
    const r = NS.keywordTargets([{ id: 'b', label: 'B', layout: 'keywords', keywords: ['', '  '] }]);
    assert.deepStrictEqual(r.vuote, [0]);
});

test('keywordTargets: senza card «parole chiave» non c\'è niente da fare', () => {
    const r = NS.keywordTargets([{ id: 'a', label: 'A', layout: 'title' }]);
    assert.deepStrictEqual(r, { conKw: [], vuote: [] });
});

/* 0122, lotto 3 (Giacomo, 22/10, sul banco del Foglio: «Scelgo la E: interlinea 24 px fissa, a
   sinistra»): il passo di riga della descrizione era una costante in mm, 6,35, in tutti i formati.
   0128, allargamento 1 (Giacomo, 27/10, sui due mockup: «C», «+3 nel 2×1, +2 nel 2×2»): il passo è il
   più largo fra quei 6,35 mm e il corpo × 1,6, lo spazio fra le parole ha +0,25 em, e le descrizioni
   crescono a 13 pt nel 2×2 e 16 nel 2×1 (le parole chiave a 15 e 18). */
test('charLimits: il passo della descrizione è il più largo fra 6,35 mm e corpo × 1,6 — 9 righe nel 2x2, 17 nel 2x1', () => {
    assert.equal(NS.DESC_LINE_MM, 6.35, 'il fisso dello 0122 resta il minimo');
    assert.equal(NS.DESC_LINE_K, 1.6);
    assert.equal(NS.DESC_WORD_EM, 0.25);
    assert.equal(NS.descPasso(11), 6.35, 'a 11 pt il fisso è già più largo (1,64)');
    assert.ok(Math.abs(NS.descPasso(13) - 1.6 * 13 * NS.PT2MM) < 1e-9, 'a 13 pt: 7,34 mm');
    assert.ok(Math.abs(NS.descPasso(16) - 1.6 * 16 * NS.PT2MM) < 1e-9, 'a 16 pt: 9,03 mm');
    const due = NS.charLimits('2x2', 'card', 'Materiali conduttori');
    const uno = NS.charLimits('2x1', 'card', 'Materiali conduttori');
    assert.equal(due.descLines, 9, '2x2: 72 mm a passi di 7,34 (prima 11 a passi di 6,35)');
    assert.equal(uno.descLines, 17, '2x1: 160 mm a passi di 9,03 (prima 25)');
    assert.equal(due.descCpl, 43, '2x2 a 13 pt, con lo spazio in più (prima 50 a 11 pt)');
    assert.equal(uno.descCpl, 35, '2x1 a 16 pt, con lo spazio in più (prima 44 a 13 pt)');
});

test('0128 · i corpi delle schede: descrizioni 13 e 16 pt, parole chiave 15 e 18; il 3x4 non cambia', () => {
    assert.equal(NS.geom('2x2').descPt, 13);
    assert.equal(NS.geom('2x2').kwPt, 15);
    assert.equal(NS.geom('2x1').descPt, 16);
    assert.equal(NS.geom('2x1').kwPt, 18);
    assert.equal(NS.geom('3x4').kwPt, 12);
    assert.equal(NS.geom('3x4').descPt, 11);
    assert.equal(NS.geom('2x2').titlePt, 28, 'i titoli restano');
    assert.equal(NS.geom('2x1').cardTitlePt, 24, 'i titoli restano');
});

/* 0128, allargamento 3: il corpo delle descrizioni e delle parole chiave scelto dal docente nell'editor */
test('0128 · setCorpi: descrizioni e parole chiave per formato, fra 11 e 20 pt; capacità e geometria lo seguono', () => {
    try {
        const prima = NS.charLimits('2x1', 'card', 'Materiali conduttori');
        assert.deepStrictEqual(NS.corpi(), {}, 'di serie nessuna scelta');
        NS.setCorpi({ '2x1': { desc: 14, kw: 16 } });
        assert.strictEqual(NS.geom('2x1').descPt, 14);
        assert.strictEqual(NS.geom('2x1').kwPt, 16);
        assert.strictEqual(NS.geom('2x2').descPt, 13, 'l\'altro formato non cambia');
        const dopo = NS.charLimits('2x1', 'card', 'Materiali conduttori');
        assert.ok(dopo.desc > prima.desc, 'a 14 pt entra più testo: ' + prima.desc + '→' + dopo.desc);
        NS.setCorpi({ '2x2': { desc: 40, kw: 2 } });
        assert.strictEqual(NS.geom('2x2').descPt, 20, 'mai oltre 20');
        assert.strictEqual(NS.geom('2x2').kwPt, 11, 'mai sotto 11');
        assert.strictEqual(NS.geom('3x4').kwPt, 12, 'il 3×4 (solo titolo) non si tocca');
    } finally { NS.setCorpi(null); }
    assert.strictEqual(NS.geom('2x1').descPt, 16);
});

/* 0128, allargamento 5 (Giacomo, 27/10, al gate: «aggiungi anche l'opzione per l'interlinea») */
test('0128 · setInterlinea: il passo della descrizione è corpo × interlinea, fra 1,2 e 2; di serie non cambia nulla', () => {
    try {
        const prima = NS.charLimits('2x1', 'card', 'Materiali conduttori');
        assert.strictEqual(NS.interlinea(), null, 'di serie nessuna scelta');
        assert.ok(Math.abs(NS.descPasso(16) - 1.6 * 16 * 0.352778) < 1e-9, 'di serie: corpo × 1,6');
        assert.strictEqual(NS.descPasso(11), 6.35, 'di serie a 11 pt: il minimo fisso dello 0122');
        NS.setInterlinea(1.4);
        assert.strictEqual(NS.interlinea(), 1.4);
        assert.ok(Math.abs(NS.descPasso(16) - 1.4 * 16 * 0.352778) < 1e-9);
        assert.ok(NS.descPasso(11) < 6.35, 'scelta, il minimo fisso non la ferma');
        const dopo = NS.charLimits('2x1', 'card', 'Materiali conduttori');
        assert.ok(dopo.desc > prima.desc && dopo.descLines > prima.descLines, 'più stretta, più righe: ' + prima.desc + '→' + dopo.desc);
        NS.setInterlinea(1.6 + 0.1); assert.strictEqual(NS.interlinea(), 1.7, 'a passi di 0,1, senza resti');
        NS.setInterlinea(5); assert.strictEqual(NS.interlinea(), 2, 'mai oltre 2');
        NS.setInterlinea(0.5); assert.strictEqual(NS.interlinea(), 1.2, 'mai sotto 1,2');
    } finally { NS.setInterlinea(null); }
    assert.strictEqual(NS.interlinea(), null);
    assert.strictEqual(NS.charLimits('2x1', 'card', 'Materiali conduttori').desc, 530, 'si torna al foglio di serie');
});
