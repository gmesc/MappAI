const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const S = require('../public/js/core/mis-struct-core.js');
const T = require('../public/js/core/mis-text-core.js');
const EF = require('../public/js/riuso/edge-families.js');

const FIX = path.join(__dirname, 'fixtures');
function nodiFixture(cls) {
    const d = path.join(FIX, cls, 'Nodi');
    return fs.readdirSync(d).filter(f => f.endsWith('.md')).sort()
        .map(f => S.parseNode(fs.readFileSync(path.join(d, f), 'utf8'), f));
}
function linksFixture(cls) {
    return JSON.parse(fs.readFileSync(path.join(FIX, cls, 'links.json'), 'utf8'));
}

// ── parseNode ──────────────────────────────────────────────────────────────
test('parseNode legge il frontmatter e separa il corpo', () => {
    const n = S.parseNode('---\nid: "L1_1"\nlabel: "Accumulo"\nlevel: 2\nparent: "L1_0"\n---\n\n# Accumulo\n\nTesto del nodo.');
    assert.strictEqual(n.id, 'L1_1');
    assert.strictEqual(n.label, 'Accumulo');
    assert.strictEqual(n.level, 2);
    assert.strictEqual(n.parent, 'L1_0');
    assert.strictEqual(n.corpo, 'Testo del nodo.');
});

test('parseNode toglie la riga del titolo markdown — definizione calibrata', () => {
    const n = S.parseNode('---\nlevel: 1\n---\n\n# Titolo Lungo Del Nodo\n\nCorpo.');
    assert.strictEqual(n.corpo, 'Corpo.', 'il titolo non deve finire nel corpo');
    assert.ok(!/Titolo Lungo/.test(n.corpo));
});

test('parseNode non lancia su un nodo senza frontmatter', () => {
    const n = S.parseNode('Solo testo, nessun frontmatter.');
    assert.strictEqual(n.level, null);
    assert.strictEqual(n.corpo, 'Solo testo, nessun frontmatter.');
});

test('parseNode gestisce un nodo col solo frontmatter e corpo vuoto', () => {
    const n = S.parseNode('---\nid: "X"\nlevel: 3\n---\n');
    assert.strictEqual(n.corpo, '');
    assert.strictEqual(n.level, 3);
});

// ── Link e DAL Protocol (principio V) ──────────────────────────────────────
test('un link senza rel vale «include»', () => {
    const l = S.normalizeLinks([{ source: 'a', target: 'b' }]);
    assert.strictEqual(l[0].rel, 'include');
});

test('normalizeLinks accetta sia l’array sia { links: [...] }', () => {
    assert.strictEqual(S.normalizeLinks([{ source: 'a', target: 'b' }]).length, 1);
    assert.strictEqual(S.normalizeLinks({ links: [{ source: 'a', target: 'b' }] }).length, 1);
    assert.strictEqual(S.normalizeLinks(null).length, 0);
});

test('normalizeLinks risolve i riferimenti già oggetto (grafo D3 serializzato)', () => {
    const l = S.normalizeLinks([{ source: { id: 'a' }, target: { id: 'b' }, rel: 'causa' }]);
    assert.strictEqual(l[0].source, 'a');
    assert.strictEqual(l[0].target, 'b');
});

// ── graphMetrics ───────────────────────────────────────────────────────────
test('graphMetrics conta livelli, macro-aree e profondità', () => {
    const g = S.graphMetrics(nodiFixture('1A'), linksFixture('1A'));
    assert.strictEqual(g.nodiTotali, 7);
    assert.strictEqual(g.macroAree, 2);
    assert.strictEqual(g.profonditaMax, 3);
});

test('graphMetrics separa i legami ricchi dai generici', () => {
    const g = S.graphMetrics([], [
        { source: 'a', target: 'b', rel: 'include' },
        { source: 'a', target: 'c', rel: 'causa' },
        { source: 'a', target: 'd' },
    ]);
    assert.strictEqual(g.links, 3);
    assert.strictEqual(g.relRicchi, 1, 'solo «causa» è ricco');
    assert.strictEqual(g.genericiPct, 66.7);
});

test('graphMetrics su un grafo senza link non lancia', () => {
    const g = S.graphMetrics(nodiFixture('1B'), []);
    assert.strictEqual(g.links, 0);
    assert.strictEqual(g.genericiPct, null);
});

// ── wordsPerNode: deviazione DI POPOLAZIONE ────────────────────────────────
test('wordsPerNode usa la deviazione di popolazione, non quella campionaria', () => {
    // Su [10, 20]: popolazione = 5, campionaria ≈ 7,07.
    const nodi = [
        { level: 1, corpo: new Array(11).join('x ') },
        { level: 1, corpo: new Array(21).join('x ') },
    ];
    const w = S.wordsPerNode(nodi, T.tokenize);
    assert.strictEqual(w.tutti.devStd, 5);
});

test('wordsPerNode raggruppa per livello e raccoglie i nodi senza livello', () => {
    const w = S.wordsPerNode([
        { level: 1, corpo: 'una due tre' },
        { level: 2, corpo: 'una due' },
        { level: null, corpo: 'una' },
    ], T.tokenize);
    assert.strictEqual(w.perLivello['1'].n, 1);
    assert.strictEqual(w.perLivello['2'].n, 1);
    assert.strictEqual(w.perLivello['senza'].n, 1);
    assert.strictEqual(w.tutti.n, 3);
});

test('wordsPerNode su elenco vuoto restituisce null invece di NaN', () => {
    assert.strictEqual(S.wordsPerNode([], T.tokenize).tutti, null);
});

// ── causalStructure: tassonomia INIETTATA (R6) ─────────────────────────────
test('causalStructure conta come logici solo causa, dipendenza e opposizione', () => {
    const c = S.causalStructure([
        { source: 'a', target: 'b', rel: 'causa' },        // logico
        { source: 'a', target: 'c', rel: 'richiede' },     // logico
        { source: 'a', target: 'd', rel: 'si oppone a' },  // logico
        { source: 'a', target: 'e', rel: 'include' },      // generico
        { source: 'a', target: 'f', rel: 'comprende' },    // gerarchia
    ], EF);
    assert.strictEqual(c.legamiLogici, 3);
    assert.strictEqual(c.totale, 5);
    assert.strictEqual(c.quotaLegamiLogici, 60);
});

test('«include» non conta mai come nesso logico', () => {
    // È la rel gerarchica di default: contarla premierebbe ogni albero.
    assert.strictEqual(EF.isLogica('include'), false);
    assert.strictEqual(EF.isGenerica('include'), true);
});

test('causalStructure senza legami dichiara il motivo invece di dare zero', () => {
    const c = S.causalStructure([], EF);
    assert.strictEqual(c.quotaLegamiLogici, null);
    assert.ok(c.motivo);
});

test('la tassonomia è iniettata: passandone una diversa il risultato cambia', () => {
    // È ciò che rende possibile a riuso-divergenza.test.js accorgersi che la
    // copia da MappAI è invecchiata.
    const finta = { famigliaDi: () => 'altro', isLogica: () => true, isGenerica: () => false };
    const links = [{ source: 'a', target: 'b', rel: 'include' }];
    assert.strictEqual(S.causalStructure(links, EF).quotaLegamiLogici, 0);
    assert.strictEqual(S.causalStructure(links, finta).quotaLegamiLogici, 100);
});

// ── siblingRedundancy ──────────────────────────────────────────────────────
test('due fratelli con lo stesso scheletro di frase risultano ridondanti', () => {
    const nodi = [
        { id: 'p', label: 'Padre', corpo: 'padre', level: 1 },
        { id: 'a', label: 'Musei', parent: 'p', level: 2,
          corpo: 'I musei sono spazi culturali presenti nelle citta e sono una rappresentazione della funzione culturale urbana.' },
        { id: 'b', label: 'Teatri', parent: 'p', level: 2,
          corpo: 'I teatri sono spazi culturali presenti nelle citta e sono una rappresentazione della funzione culturale urbana.' },
    ];
    const r = S.siblingRedundancy(nodi, [], { ngramDim: 4, tokenize: T.tokenize });
    assert.ok(r.mediaSovrapposizione > 0.5,
        'scheletro condiviso: attesa alta sovrapposizione, ottenuta ' + r.mediaSovrapposizione);
});

test('due fratelli che dicono cose diverse non risultano ridondanti', () => {
    const nodi = [
        { id: 'p', label: 'Padre', corpo: 'padre', level: 1 },
        { id: 'a', parent: 'p', level: 2, corpo: 'Le banche gestiscono il denaro e concedono prestiti alle imprese.' },
        { id: 'b', parent: 'p', level: 2, corpo: 'I parchi offrono verde, ombra e spazi dove i bambini giocano.' },
    ];
    const r = S.siblingRedundancy(nodi, [], { ngramDim: 4, tokenize: T.tokenize });
    assert.ok(r.mediaSovrapposizione < 0.1, 'ottenuta ' + r.mediaSovrapposizione);
});

test('senza coppie di fratelli la ridondanza dichiara il motivo', () => {
    const r = S.siblingRedundancy([{ id: 'a', corpo: 'solo', level: 1 }], [],
        { ngramDim: 4, tokenize: T.tokenize });
    assert.strictEqual(r.mediaSovrapposizione, null);
    assert.ok(r.motivo);
});

test('il genitore si ricava dai link quando il frontmatter non lo dice', () => {
    const nodi = [
        { id: 'p', corpo: 'padre', level: 1 },
        { id: 'a', corpo: 'uno due tre quattro cinque sei', level: 2 },
        { id: 'b', corpo: 'uno due tre quattro cinque sei', level: 2 },
    ];
    const r = S.siblingRedundancy(nodi, [
        { source: 'p', target: 'a' }, { source: 'p', target: 'b' },
    ], { ngramDim: 4, tokenize: T.tokenize });
    assert.strictEqual(r.coppie, 1);
    assert.strictEqual(r.mediaSovrapposizione, 1);
});

// ── Determinismo (FR-009) ──────────────────────────────────────────────────
test('due esecuzioni sullo stesso vault danno gli stessi numeri', () => {
    const n = nodiFixture('1B'), l = linksFixture('1B');
    assert.deepStrictEqual(S.graphMetrics(n, l), S.graphMetrics(n, l));
    assert.deepStrictEqual(S.wordsPerNode(n, T.tokenize), S.wordsPerNode(n, T.tokenize));
});
