// Test per mappai-desc-fidelity.js — groundedness deterministica delle desc.
// Fixture prese dal bug reale "desc romanzate" (5 lug 2026): il modello
// scriveva metafore/motivazioni non presenti nella fonte.
const test = require('node:test');
const assert = require('node:assert');

const DF = require('../public/js/mappai-desc-fidelity.js');

test('contentWords: scarta stopword e parole corte, tiene i numeri', () => {
    const ws = DF.contentWords("La Svizzera accolse anche 21'000 ebrei durante la guerra");
    assert.ok(ws.includes('svizzera'));
    assert.ok(ws.includes('ebrei'));
    assert.ok(ws.includes('21'));
    assert.ok(!ws.includes('anche'));     // stopword
    assert.ok(!ws.includes('durante'));   // stopword
    assert.ok(!ws.includes('la'));        // troppo corta
});

test('groundedness: desc copiata dalla fonte → 1', () => {
    const source = 'Il piano Wahlen del 1940 aumentò la superficie coltivata per garantire autarchia alimentare';
    const desc = 'Il piano Wahlen del 1940 aumentò la superficie coltivata';
    assert.strictEqual(DF.groundedness(desc, source), 1);
});

test('groundedness: match per radice (flessioni italiane)', () => {
    const source = 'La Germania minacciava di occupare la Svizzera';
    const desc = "Il rischio di occupazione tedesca della Svizzera";
    // "occupazione" ↔ "occupare" via radice a 6 char, "tedesca" NON c'è
    const score = DF.groundedness(desc, source);
    assert.ok(score >= 0.5, `atteso >= 0.5, ottenuto ${score}`);
});

test('groundedness: desc romanzata (caso funambolo) → punteggio basso', () => {
    const source = "l'obiettivo principale della Svizzera era quello di conservare l'indipendenza";
    const desc = "La diplomazia svizzera operò come un funambolo tra l'Asse e gli Alleati: ogni concessione fatta a una parte veniva bilanciata da un gesto verso l'altra per mantenere stabile la posizione di neutralità.";
    const score = DF.groundedness(desc, source);
    assert.ok(score < 0.4, `desc drammatizzata dovrebbe stare sotto 0.4, ottenuto ${score}`);
});

test('groundedness: desc fedele al chunk → punteggio alto', () => {
    const source = "Anche 21'000 ebrei si rifugiarono nel nostro Paese per sfuggire alle leggi razziali del regime nazista";
    const desc = "In quel periodo 21'000 ebrei si rifugiarono per sfuggire alle leggi razziali naziste.";
    const score = DF.groundedness(desc, source);
    assert.ok(score >= 0.7, `desc fedele dovrebbe stare sopra 0.7, ottenuto ${score}`);
});

test('groundedness: desc vuota → null', () => {
    assert.strictEqual(DF.groundedness('', 'un testo fonte qualsiasi'), null);
    assert.strictEqual(DF.groundedness(null, 'un testo fonte qualsiasi'), null);
});

test('groundedness: accetta indice pre-costruito', () => {
    const idx = DF.buildSourceIndex('La neutralità armata della Svizzera durante il conflitto mondiale');
    assert.strictEqual(DF.groundedness('neutralità armata della Svizzera', idx),
        DF.groundedness('neutralità armata della Svizzera', 'La neutralità armata della Svizzera durante il conflitto mondiale'));
});

const CORPUS = `La Svizzera mantenne la neutralità armata durante la seconda guerra mondiale.
Il generale Guisan ordinò la mobilitazione dell'esercito e la strategia del Ridotto nazionale sulle Alpi.
Il piano Wahlen aumentò la superficie coltivata per garantire autarchia alimentare alla popolazione civile.
Anche 21'000 ebrei si rifugiarono nel nostro Paese per sfuggire alle leggi razziali del regime nazista.
Le banche svizzere accettarono oro dalla Germania, transazioni criticate dagli Alleati dopo il conflitto.
Il razionamento limitò i consumi di pane, carne e combustibile per tutta la durata della guerra.`;

test('analyzeNodes: separa nodi fedeli da nodi romanzati', () => {
    const nodes = [
        { id: 'A', label: 'Ridotto Nazionale', level: 2, desc: 'Il generale Guisan ordinò la mobilitazione e la strategia del Ridotto nazionale sulle Alpi.' },
        { id: 'B', label: 'Equilibrio Strategico', level: 5, desc: 'La diplomazia operò come un funambolo: ogni scelta era guidata dal terrore di una decisione improvvisa del nemico, un compromesso necessario per la sopravvivenza dello Stato.' },
        { id: 'ROOT', label: 'Root', level: 0, desc: 'ignorato: level 0' }
    ];
    const res = DF.analyzeNodes(nodes, CORPUS);
    assert.ok(res, 'corpus sufficiente → risultato non null');
    assert.strictEqual(res.count, 2);
    const a = res.rows.find(r => r.id === 'A');
    const b = res.rows.find(r => r.id === 'B');
    assert.ok(a.score > b.score, `fedele (${a.score}) deve battere romanzato (${b.score})`);
    assert.strictEqual(res.worst[0].id, 'B');
    assert.ok(res.below >= 1, 'il nodo romanzato deve stare sotto soglia');
});

test('analyzeNodes: corpus troppo piccolo → null', () => {
    assert.strictEqual(DF.analyzeNodes([{ id: 'A', level: 2, desc: 'x y z' }], 'poche parole'), null);
});

test('corpusFromState: unisce sources, sourcesDict e chunks', () => {
    const state = {
        sources: [{ content: 'testo fonte' }],
        db: {
            sourcesDict: { N1: [{ text: 'estratto dal dizionario fonti' }] },
            nodes: [{ id: 'N1', chunks: ['citazione verbatim dal documento'] }]
        }
    };
    const corpus = DF.corpusFromState(state);
    assert.ok(corpus.includes('testo fonte'));
    assert.ok(corpus.includes('estratto dal dizionario fonti'));
    assert.ok(corpus.includes('citazione verbatim dal documento'));
});
