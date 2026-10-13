const { test } = require('node:test');
const assert = require('node:assert');
const BP = require('../public/js/mappai-boilerplate-core.js');

// ── Modo B: righe corte ripetute standalone ─────────────────────────────
const SHEET = [
    'Storia IV Media    La Guerra Fredda    pag. 1',
    'La Guerra Fredda fu un lungo periodo di tensione tra USA e URSS.',
    'Il Piano Marshall finanziò la ricostruzione europea.',
    'Storia IV Media    La Guerra Fredda    pag. 2',
    'La cortina di ferro divise l\'Europa in due blocchi.',
    'La guerra di Corea fu il primo grande conflitto.',
    'Storia IV Media    La Guerra Fredda    pag. 3',
    'La crisi di Cuba portò il mondo sull\'orlo della guerra nucleare.'
].join('\n');

test('findRepeatedLines: intestazione standalone rilevata, numeri di pagina collassati', () => {
    const reps = BP.findRepeatedLines(SHEET);
    assert.strictEqual(reps.length, 1);
    assert.strictEqual(reps[0].count, 3);
    assert.ok(/storia iv media/.test(reps[0].key));
    assert.ok(reps[0].key.indexOf('#') >= 0);
});

test('stripBoilerplate: rimuove le intestazioni standalone, conserva il contenuto', () => {
    const r = BP.stripBoilerplate(SHEET);
    assert.ok(r.text.indexOf('Storia IV Media') < 0);
    assert.ok(r.text.indexOf('Piano Marshall') >= 0);
    assert.ok(r.text.indexOf('crisi di Cuba') >= 0);
});

test('findRepeatedLines: non tocca le frasi normali ripetute poche volte', () => {
    const reps = BP.findRepeatedLines('Frase uno.\nFrase due.\nRipetuta.\nRipetuta.');
    assert.strictEqual(reps.length, 0);
});

test('findRepeatedLines: ignora le righe lunghe (frasi vere) anche se ripetute', () => {
    const longLine = 'Questa e una frase molto lunga con parecchie parole che supera il limite massimo di quattordici parole previsto.';
    const reps = BP.findRepeatedLines([longLine, 'X', longLine, 'Y', longLine].join('\n'));
    assert.strictEqual(reps.length, 0);
});

test('stripBoilerplate: testo senza boilerplate resta invariato', () => {
    const t = 'Prima frase.\nSeconda frase.\nTerza frase.';
    assert.strictEqual(BP.stripBoilerplate(t).text, t);
    assert.strictEqual(BP.stripBoilerplate(t).count, 0);
});

test('findRepeatedLines: righe di soli numeri non contano come intestazione', () => {
    assert.strictEqual(BP.findRepeatedLines('1\n2\n3\n4').length, 0);
});

// ── Modo A: header come PREFISSO di ogni riga-pagina (estrazione reale MappAI:
//    items.join(" ")+"\n" → una riga per pagina) ──────────────────────────
const HEADER = 'Storia IV Media La Guerra Fredda pag. …';
const PAGES = [
    HEADER + ' LA GUERRA FREDDA A. Le due superpotenze Al termine della Seconda guerra mondiale l\'Europa impoverita e semidistrutta non fu piu in grado di svolgere azione guida.',
    HEADER + ' B. La rottura tra le superpotenze e la creazione di due blocchi contrapposti il bipolarismo Durante la Seconda guerra mondiale USA e URSS avevano combattuto insieme.',
    HEADER + ' 1. Gli USA e il piano Marshall il blocco occidentale Al termine della guerra l\'Europa versava in condizioni economiche e sociali estremamente difficili gente impoverita.',
    HEADER + ' 2. L\'URSS e il blocco orientale I paesi liberati dall\'Armata Rossa furono trasformati in repubbliche popolari con governi comunisti stati satelliti dell\'Unione Sovietica.'
].join('\n');

test('stripBoilerplate MODO A: header ripetuto come prefisso di ogni pagina rimosso', () => {
    const r = BP.stripBoilerplate(PAGES);
    assert.ok(r.count >= 4, 'header rimosso da tutte le pagine, count=' + r.count);
    assert.ok(r.text.indexOf('Storia IV Media') < 0, 'header via');
    assert.ok(r.text.indexOf('La Guerra Fredda pag') < 0, 'prefisso via');
    // il contenuto resta
    assert.ok(r.text.indexOf('LA GUERRA FREDDA A. Le due superpotenze') >= 0);
    assert.ok(r.text.indexOf('piano Marshall') >= 0);
    assert.ok(r.text.indexOf('repubbliche popolari') >= 0);
    // ha registrato un header
    assert.ok(r.removed.some(x => x.type === 'header'));
});

test('stripBoilerplate MODO A: pagina singola (no ripetizione) non tocca nulla', () => {
    const one = HEADER + ' Un solo contenuto di pagina senza ripetizioni di alcun genere qui presente.';
    const r = BP.stripBoilerplate(one);
    assert.strictEqual(r.count, 0);
    assert.ok(r.text.indexOf('Storia IV Media') >= 0);
});

test('stripBoilerplate MODO A: prefisso a COPERTURA massima, non il più lungo raro', () => {
    // Bug reale (guerra fredda, 26 pag): un prefisso più lungo ricorreva 3× per
    // coincidenza (tabella) → veniva scelto lui e l'header restava sulle altre 23.
    const H = 'Storia IV Media La Guerra Fredda pag. …';
    const pages = [];
    for (let i = 0; i < 10; i++) pages.push(H + ' Contenuto pagina numero ' + i + ' con parole diverse e lunghezza sufficiente per una pagina vera.');
    pages[3] = H + ' Tabella dati riga uno due tre quattro cinque sei sette otto nove dieci undici.';
    pages[7] = H + ' Tabella dati riga alfa beta gamma delta epsilon zeta eta theta iota kappa lambda.';
    const r = BP.stripBoilerplate(pages.join('\n'));
    assert.ok(r.count >= 10, 'header tolto da tutte le 10 pagine, count=' + r.count);
    assert.ok(r.text.indexOf('Storia IV Media') < 0, 'header via da tutte');
    assert.ok(r.text.indexOf('Tabella dati') >= 0, '«Tabella dati» è corpo, resta');
    const head = r.removed.find(x => x.type === 'header');
    assert.strictEqual(head.count, 10);
});

test('stripBoilerplate MODO A: prefisso comune ma corpo diverso — non divora il corpo', () => {
    const r = BP.stripBoilerplate(PAGES);
    // ogni pagina conserva il proprio corpo distintivo
    assert.ok(r.text.indexOf('cortina') < 0);   // sanity: non inventa
    assert.ok(r.text.indexOf('bipolarismo') >= 0);
    assert.ok(r.text.indexOf('blocco orientale') >= 0);
});

// ── #1: righe STRUTTURALI (domande/titoli/vuote di una scheda) ──────────────
test('isStructuralLine: riconosce domande, Doc.N, titoli ALL-CAPS, righe vuote', () => {
    assert.ok(BP.isStructuralLine('1) Durante le lezioni precedenti formula la tua ipotesi.'));
    assert.ok(BP.isStructuralLine('2. Riassumi schematicamente le ipotesi della classe.'));
    assert.ok(BP.isStructuralLine('Doc. 1 Da cosa dipende il fatto di avere capelli lisci o ricci?'));
    assert.ok(BP.isStructuralLine('Documento 2 Spiega cosa sono gli alleli.'));
    assert.ok(BP.isStructuralLine('LA GUERRA FREDDA'));
    assert.ok(BP.isStructuralLine('...................................................'));
    assert.ok(BP.isStructuralLine('______________________________'));
});

test('isStructuralLine: NON tocca la prosa, "E. coli", anni, frasi normali', () => {
    assert.ok(!BP.isStructuralLine('L\'apparato radicale svolge funzioni di assorbimento idrico e minerale.'));
    assert.ok(!BP.isStructuralLine('E. coli è un batterio comune nell\'intestino.'));   // stem a lettera singola: NON toccato
    assert.ok(!BP.isStructuralLine('Nel 2026. la situazione cambiò radicalmente ancora.'));
    assert.ok(!BP.isStructuralLine('Gli USA erano uno stato liberal-democratico.'));   // acronimo, ma frase lunga
    assert.ok(!BP.isStructuralLine(''));
});

test('stripStructuralLines: toglie domande e vuoti, conserva il contenuto', () => {
    const sheet = [
        'LA GUERRA FREDDA',
        'Al termine della guerra l\'Europa era impoverita e semidistrutta.',
        '1) Formula la tua ipotesi personale.',
        '...................................................',
        'Doc. 2 Spiega cosa sono gli alleli del gene tipo di capelli.',
        'Gli alleli sono versioni alternative di uno stesso gene.'
    ].join('\n');
    const r = BP.stripStructuralLines(sheet);
    assert.strictEqual(r.count, 4);
    assert.ok(r.text.indexOf('impoverita e semidistrutta') >= 0);   // contenuto conservato
    assert.ok(r.text.indexOf('versioni alternative') >= 0);
    assert.ok(r.text.indexOf('Formula la tua ipotesi') < 0);        // domanda rimossa
    assert.ok(r.text.indexOf('Doc. 2') < 0);                         // riferimento rimosso
    assert.ok(r.text.indexOf('LA GUERRA FREDDA') < 0);              // titolo rimosso
});

// ── 0043: una riga strutturale è una riga CORTA ─────────────────────────────
//    L'estrazione dei PDF dà una riga per pagina: una pagina che comincia con un
//    titolo numerato («2. L'economia svizzera…») combaciava con la regola B e
//    spariva intera. 'stem' e 'riferimento' si tolgono solo fino a 25 parole con
//    lettere o cifre; un gruppo di puntini non è una parola.
const parole = (t) => t.trim().split(/\s+/).filter(w => /[0-9A-Za-zÀ-ſ]/.test(w)).length;

const PAGINA_SVIZZERA = '2. L\'economia svizzera durante la Seconda Guerra Mondiale La Svizzera, circondata dalle ' +
    'potenze dell\'Asse, dipendeva dall\'estero per il carbone, il ferro e buona parte dei generi alimentari. ' +
    'Per sopravvivere il Consiglio federale negoziò accordi commerciali con la Germania e con gli Alleati, ' +
    'mentre il Piano Wahlen estese le coltivazioni a ogni superficie disponibile, dai parchi ai campi sportivi.';
const PAGINA_CERESIO = '04. RETE ALIMENTARE DEL LAGO CERESIO Nel lago Ceresio le alghe microscopiche del fitoplancton ' +
    'sono mangiate dallo zooplancton, che a sua volta nutre i pesci piccoli come l\'alborella; i pesci piccoli ' +
    'sono preda del persico e del luccio, e alla fine della catena si trovano gli uccelli acquatici come lo svasso.';
const PAGINA_DOC = 'Doc. 1 Le leggi di Mendel Gregor Mendel incrociò piante di pisello che differivano per un solo ' +
    'carattere, come il colore dei semi, e osservò che nella prima generazione compariva soltanto uno dei due ' +
    'caratteri, mentre nella seconda generazione ricompariva anche l\'altro in circa un quarto delle piante.';

test('0043: le righe-pagina lunghe restano (sono pagine, non stem)', () => {
    for (const [nome, pagina] of [['Svizzera', PAGINA_SVIZZERA], ['Ceresio', PAGINA_CERESIO], ['Doc. 1', PAGINA_DOC]]) {
        assert.ok(parole(pagina) >= 40, nome + ': la riga di prova ha 40+ parole, ne ha ' + parole(pagina));
        const testo = ['Prima pagina di prosa senza numeri davanti.', pagina, 'Ultima pagina di prosa.'].join('\n');
        const r = BP.stripStructuralLines(testo);
        assert.strictEqual(r.count, 0, nome + ': nessuna riga tolta');
        assert.strictEqual(r.text, testo, nome + ': il testo resta identico');
    }
});

test('0043: la riga-pagina lunga resta «stem»/«riferimento» per structuralKind e isStructuralLine (risposta invariata)', () => {
    assert.strictEqual(BP.structuralKind(PAGINA_SVIZZERA), 'stem');
    assert.strictEqual(BP.structuralKind(PAGINA_CERESIO), 'stem');
    assert.strictEqual(BP.structuralKind(PAGINA_DOC), 'riferimento');
    assert.strictEqual(BP.isStructuralLine(PAGINA_SVIZZERA), true);
    assert.strictEqual(BP.isStructuralLine(PAGINA_CERESIO), true);
    assert.strictEqual(BP.isStructuralLine(PAGINA_DOC), true);
});

test('0043: gli stem di oggi si tolgono ancora, anche uno di 20 parole', () => {
    const stem20 = '3. Spiega con parole tue perché la Svizzera, pur restando neutrale, dovette commerciare con la Germania durante la guerra mondiale.';
    assert.strictEqual(parole(stem20), 20);
    const righe = [
        '1) Durante le lezioni precedenti formula la tua ipotesi.',
        '2. Riassumi schematicamente le ipotesi della classe.',
        'Doc. 1 Da cosa dipende il fatto di avere capelli lisci o ricci?',
        stem20
    ];
    const r = BP.stripStructuralLines(['Prosa che resta.'].concat(righe).join('\n'));
    assert.strictEqual(r.count, 4);
    assert.strictEqual(r.text, 'Prosa che resta.');
});

test('0043: i puntini non sono parole — «4. Qual è…» con 5 gruppi di puntini si toglie', () => {
    const riga = '4. Qual è, a tuo avviso, l\'opinione dell\'autore del testo? ' + Array(5).fill('..........').join(' ');
    assert.strictEqual(parole(riga), 10);
    const r = BP.stripStructuralLines('Prosa.\n' + riga);
    assert.strictEqual(r.count, 1);
    assert.strictEqual(r.text, 'Prosa.');
});

test('0043: il confine è 25 parole — 25 (più puntini) si toglie, 26 resta', () => {
    const base = ['1)'].concat(Array.from({ length: 24 }, (_, i) => 'parola' + String.fromCharCode(97 + (i % 26))));
    const r25 = base.join(' ') + ' ' + Array(12).fill('.....').join(' ');
    const r26 = base.concat(['ancora']).join(' ');
    assert.strictEqual(parole(r25), 25);
    assert.strictEqual(parole(r26), 26);
    assert.strictEqual(BP.stripStructuralLines(r25).count, 1, '25 parole: stem, si toglie');
    assert.strictEqual(BP.stripStructuralLines(r26).count, 0, '26 parole: resta');
    // la soglia si sposta con opts.maxWords
    assert.strictEqual(BP.stripStructuralLines(r26, { maxWords: 26 }).count, 1);
    assert.strictEqual(BP.stripStructuralLines(r25, { maxWords: 14 }).count, 0);
});

test('0043: una riga di puntini spaziati con più di 25 gruppi si toglie (regola A senza limite)', () => {
    const riga = Array(40).fill('.').join(' ') + ' … … …';
    assert.strictEqual(BP.structuralKind(riga), 'spazio');
    const r = BP.stripStructuralLines('Prosa.\n' + riga);
    assert.strictEqual(r.count, 1);
    assert.strictEqual(r.text, 'Prosa.');
});

test('0043: { maxWords: Infinity } riproduce il comportamento di prima (ogni riga strutturale via)', () => {
    const testo = [
        'LA GUERRA FREDDA',
        PAGINA_SVIZZERA,
        'Prosa di contenuto che resta sempre.',
        PAGINA_CERESIO,
        '1) Formula la tua ipotesi personale.',
        '...................................................',
        PAGINA_DOC,
        '',
        'Gli alleli sono versioni alternative di uno stesso gene.'
    ].join('\n');
    const righe = testo.split('\n');
    const atteso = righe.filter(l => !BP.isStructuralLine(l));
    const attesiTolti = righe.filter(l => BP.isStructuralLine(l)).map(l => l.trim().slice(0, 60));
    const r = BP.stripStructuralLines(testo, { maxWords: Infinity });
    assert.strictEqual(r.text, atteso.join('\n'));
    assert.strictEqual(r.count, 6);
    assert.deepStrictEqual(r.removed, attesiTolti);
    // col default le tre pagine restano
    const d = BP.stripStructuralLines(testo);
    assert.strictEqual(d.count, 3);
    assert.ok(d.text.indexOf('L\'economia svizzera') >= 0 && d.text.indexOf('RETE ALIMENTARE') >= 0 && d.text.indexOf('leggi di Mendel') >= 0);
});
