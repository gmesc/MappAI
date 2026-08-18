// Test del CATALOGO DEI CARATTERI (mappai-font-core.js): chi vince fra la
// scelta del documento e quella dell'app, lo stack CSS, e le due metriche da
// cui dipende l'impaginazione dei fogli stampabili.
const { test } = require('node:test');
const assert = require('node:assert');
const F = require('../public/js/mappai-font-core.js');
const PL = require('../public/js/mappai-print-layout.js');

// ── il catalogo ─────────────────────────────────────────────────────────────
test('catalogo: i quattro caratteri, Space Mono per primo e come default', () => {
    const ids = F.elenco().map(f => f.id);
    assert.deepStrictEqual(ids, ['space-mono', 'testme-sans', 'testme-alt', 'atkinson']);
    assert.strictEqual(F.DEFAULT, 'space-mono');
    assert.ok(F.valido('atkinson'));
    assert.ok(!F.valido('opendyslexic'), 'OpenDyslexic è in pensione');
    assert.ok(!F.valido(''));
});

test('font(): un id ignoto NON lancia, ripiega sul default', () => {
    // Un documento salvato con un carattere che poi esce dal catalogo deve
    // restare apribile: la sua sorgente non si può perdere per una veste.
    assert.strictEqual(F.font('mai-esistito').id, 'space-mono');
    assert.strictEqual(F.font(null).id, 'space-mono');
    assert.strictEqual(F.font('testme-alt').id, 'testme-alt');
});

// ── chi comanda ─────────────────────────────────────────────────────────────
test('risolvi: il documento vince sull app, l app vince sul default', () => {
    assert.strictEqual(F.risolvi('atkinson', 'testme-sans'), 'atkinson');
    assert.strictEqual(F.risolvi('', 'testme-sans'), 'testme-sans');
    assert.strictEqual(F.risolvi(null, null), 'space-mono');
    // un id sporco nel documento non deve trascinarsi dietro il default:
    // sotto c'è comunque la scelta dell'app
    assert.strictEqual(F.risolvi('boh', 'atkinson'), 'atkinson');
});

// ── lo stack ────────────────────────────────────────────────────────────────
test('stackDi: le emoji stanno DENTRO lo stack, prima del ripiego generico', () => {
    const s = F.stackDi('testme-sans');
    assert.match(s, /^'TestMe Sans',/);
    const iEmoji = s.indexOf('Noto Color Emoji');
    const iRipiego = s.indexOf('sans-serif');
    assert.ok(iEmoji > 0, 'Noto Color Emoji manca dallo stack: ' + s);
    assert.ok(iEmoji < iRipiego, 'le emoji devono precedere il ripiego generico');
    assert.match(F.stackDi('space-mono'), /monospace$/);
});

test('facce: una regola per taglio, e solo per i tagli che esistono', () => {
    const sm = F.facce('space-mono');
    assert.strictEqual((sm.match(/@font-face/g) || []).length, 2, 'Space Mono: normale + grassetto');
    const atk = F.facce('atkinson');
    assert.strictEqual((atk.match(/@font-face/g) || []).length, 4, 'Atkinson ha anche i corsivi');
    assert.match(atk, /font-style:italic/);
    // TestMe il corsivo non ce l'ha: non va promesso
    assert.ok(!F.facce('testme-sans').includes('italic'));
    assert.strictEqual(F.haCorsivo('testme-sans'), false);
    assert.strictEqual(F.haCorsivo('atkinson'), true);
});

test('facce: il prefisso del percorso è governabile (documento esportato)', () => {
    assert.match(F.facce('atkinson', 'fonts/'), /url\('fonts\/Atkinson-Regular\.ttf'\)/);
    assert.match(F.facce('atkinson', 'https://x/'), /url\('https:\/\/x\/Atkinson-Regular\.ttf'\)/);
});

// ── le metriche del foglio ──────────────────────────────────────────────────
test('metriche: ogni carattere dichiara advance e headAdvance', () => {
    for (const f of F.elenco()) {
        const m = F.metriche(f.id);
        assert.ok(m.advance > 0.3 && m.advance < 1.0, f.id + ' advance ' + m.advance);
        assert.ok(m.headAdvance > 0.3 && m.headAdvance < 1.2, f.id + ' headAdvance ' + m.headAdvance);
    }
    assert.strictEqual(F.metriche('space-mono').mono, true);
    assert.strictEqual(F.metriche('atkinson').mono, false);
});

test('metriche: headAdvance NON si deriva da advance + letter-spacing', () => {
    // È la trappola che questa feature deve evitare. Il foglio calcolava
    // headAdvance = advance + headLetterSpacing (0,06): con Space Mono regge
    // perché è monospazio, sui proporzionali no — le maiuscole sono molto più
    // larghe della media e la testata sborderebbe.
    const LS = PL.get().flash.type.headLetterSpacing;
    assert.strictEqual(LS, 0.06, 'il letter-spacing della testata è cambiato: rimisurare i font');
    for (const id of ['testme-sans', 'testme-alt', 'atkinson']) {
        const m = F.metriche(id);
        assert.ok(m.headAdvance > m.advance + LS + 0.05,
            id + ': la somma darebbe ' + (m.advance + LS).toFixed(3) +
            ' dove ne servono ' + m.headAdvance);
    }
});

test('metriche: Space Mono resta esattamente com era (fogli già stampati)', () => {
    // Il foglio è tarato su questi numeri da sempre; cambiarli ricomporrebbe
    // carte che oggi escono giuste.
    const m = F.metriche('space-mono');
    assert.strictEqual(m.advance, PL.get().flash.type.advance);
    // flashGeom arrotonda a due decimali (r2), il catalogo tiene la somma esatta
    assert.strictEqual(Math.round(m.headAdvance * 100) / 100, PL.flashGeom('2x2').headAdvance);
});

test('metriche: i caratteri nuovi stanno più stretti di Space Mono nel corpo', () => {
    // Misurato sul testo vero dei vault: è il motivo per cui la geometria
    // reggeva anche senza toccarla, e per cui vale la pena tararla.
    const sm = F.metriche('space-mono').advance;
    for (const id of ['testme-sans', 'testme-alt', 'atkinson']) {
        assert.ok(F.metriche(id).advance < sm, id + ' non è più stretto di Space Mono');
    }
});

// ── il legame col foglio ────────────────────────────────────────────────────
test('charsPerLine segue l advance del carattere scelto', () => {
    // Con un advance più stretto entrano più caratteri per riga → il motore
    // può tenere il corpo più grande, che è lo scopo dei caratteri nuovi.
    const largh = 120; // mm
    const nSpaceMono = PL.charsPerLine(largh, 12, F.metriche('space-mono').advance);
    const nAtkinson = PL.charsPerLine(largh, 12, F.metriche('atkinson').advance);
    assert.ok(nAtkinson > nSpaceMono,
        'Atkinson ' + nAtkinson + ' non supera Space Mono ' + nSpaceMono);
});

// ── il legame col foglio: le metriche si annunciano, non si indovinano ──────
test('print-layout: setFontMetrics governa advance e headAdvance', () => {
    const base = PL.flashGeom('2x2');
    assert.strictEqual(base.advance, 0.612, 'senza annuncio vale Space Mono');

    const atk = F.metriche('atkinson');
    PL.setFontMetrics(atk);
    const g = PL.flashGeom('2x2');
    assert.strictEqual(g.advance, atk.advance);
    assert.strictEqual(g.headAdvance, atk.headAdvance);
    // ⚠️ la testata NON è la somma: con la somma verrebbe 0,545 e sborderebbe
    assert.notStrictEqual(g.headAdvance, g.advance + g.headLetterSpacing);

    PL.setFontMetrics(null);
    assert.strictEqual(PL.flashGeom('2x2').advance, 0.612, 'si torna al default');
});

test('print-layout: un annuncio senza headAdvance ricade sulla somma (storico)', () => {
    PL.setFontMetrics({ advance: 0.5 });
    const g = PL.flashGeom('2x2');
    assert.strictEqual(g.advance, 0.5);
    assert.strictEqual(g.headAdvance, 0.56, 'somma advance + letterSpacing');
    PL.setFontMetrics(null);
});

test('nodesheet: col carattere più stretto entrano PIÙ caratteri per riga', () => {
    const NS = require('../public/js/mappai-nodesheet-core.js');
    const sm = NS.charLimits('2x2', 'card', 'Il Clima').titleCpl;
    NS.setFontMetrics(F.metriche('atkinson'));
    const atk = NS.charLimits('2x2', 'card', 'Il Clima').titleCpl;
    NS.setFontMetrics(null);
    assert.ok(atk > sm, 'Atkinson ' + atk + ' non supera Space Mono ' + sm);
    assert.strictEqual(NS.charLimits('2x2', 'card', 'Il Clima').titleCpl, sm, 'ripristino');
});

test('un annuncio sporco non rompe il foglio: si torna al default', () => {
    [null, undefined, {}, { advance: 0 }, { advance: -1 }].forEach(function (m) {
        PL.setFontMetrics(m);
        assert.strictEqual(PL.flashGeom('2x2').advance, 0.612, 'con ' + JSON.stringify(m));
    });
});

// ── il carattere è parte della SORGENTE del documento (inv. 18) ─────────────
test('docedit: il carattere si salva col documento e sopravvive al giro', () => {
    const D = require('../public/js/mappai-docedit-core.js');
    const set = { id: 's1', title: 'Q', items: [{ q: 'a', a1: 'x', a2: 'y', a3: 'z', correct: 1 }] };

    assert.strictEqual(D.docFromSet(set).font, '', 'senza scelta: comanda la Cabina');
    assert.strictEqual(D.docFromSet({ ...set, font: 'atkinson' }).font, 'atkinson');

    const doc = D.docFromSet(set);
    doc.font = 'testme-alt';
    assert.strictEqual(D.applyToSet(set, doc).font, 'testme-alt');

    // ⚠️ togliere il carattere DEVE scriversi: se si saltasse il caso vuoto,
    // «Come l'app» non riporterebbe niente indietro e il comando sembrerebbe rotto
    doc.font = '';
    assert.strictEqual(D.applyToSet(set, doc).font, '');
});

test('docedit: la normalizzazione del documento regge il doppio giro', () => {
    const D = require('../public/js/mappai-docedit-core.js');
    const set = { id: 's1', title: 'Q', font: 'atkinson',
                  items: [{ q: 'a', a1: 'x', a2: 'y', a3: 'z', correct: 1 }] };
    const uno = D.applyToSet(set, D.docFromSet(set));
    const due = D.applyToSet(uno, D.docFromSet(uno));
    assert.strictEqual(due.font, 'atkinson');
});

// ── i byte che un documento si porta dentro ─────────────────────────────────
test('catalogo: ogni carattere dichiara i byte da incorporare', () => {
    // Senza, il documento chiede il carattere a un percorso — e nella finestra
    // che produce il PDF (origine `data:`) quel caricamento è BLOCCATO: il PDF
    // esce col ripiego mentre l'app lo mostra giusto. Misurato il 18/8.
    for (const f of F.elenco()) {
        assert.ok(f.incorpora, f.id + ' senza modulo dei byte');
        assert.match(f.incorpora, /^vendor\/.*-incorpora\.js$/, f.id);
        assert.ok(f.incorporaGlobale, f.id + ' senza nome globale');
    }
});

test('catalogo: i moduli dei byte esistono davvero su disco', () => {
    // Un percorso che punta a un file che non c'è degrada in silenzio nel
    // ripiego, cioè nel difetto che questi byte servono a chiudere.
    const fs = require('fs'), path = require('path');
    for (const f of F.elenco()) {
        const p = path.join(__dirname, '..', 'public', 'js', f.incorpora);
        assert.ok(fs.existsSync(p), 'manca ' + f.incorpora + ' — rigenera con tools/font/prepara-font.py');
        const src = fs.readFileSync(p, 'utf8');
        assert.ok(src.includes(f.incorporaGlobale), f.incorpora + ' non espone ' + f.incorporaGlobale);
        assert.ok(src.includes('data:font/woff;base64,'), f.incorpora + ': i byte non ci sono');
    }
});

// ── chi ha scelto, e chi seguiva l'app ──────────────────────────────────────
test('il marcatore distingue «l ho scelto io» da «seguivo l app»', () => {
    // Da fuori i due casi si assomigliano — è lo stesso --doc-font — ma vanno
    // trattati all'opposto: una scelta non si tocca mai, un documento che
    // seguiva l'app si riallinea quando il carattere dell'app cambia.
    // (Il marcatore lo emette MappAIFont.styleDocumento, che vive nel browser;
    //  qui si prova la regola su cui si basa.)
    assert.strictEqual(F.valido('atkinson'), true, 'scelta esplicita → marcatore');
    assert.strictEqual(F.valido(''), false, 'nessuna scelta → niente marcatore');
    assert.strictEqual(F.valido(undefined), false);
    assert.strictEqual(F.valido('mai-esistito'), false, 'un id sporco non è una scelta');
});
