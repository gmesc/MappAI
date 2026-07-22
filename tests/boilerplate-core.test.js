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

test('stripBoilerplate MODO A: prefisso comune ma corpo diverso — non divora il corpo', () => {
    const r = BP.stripBoilerplate(PAGES);
    // ogni pagina conserva il proprio corpo distintivo
    assert.ok(r.text.indexOf('cortina') < 0);   // sanity: non inventa
    assert.ok(r.text.indexOf('bipolarismo') >= 0);
    assert.ok(r.text.indexOf('blocco orientale') >= 0);
});
