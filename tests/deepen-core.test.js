// tests/deepen-core.test.js — logica pura Fase 3.7 rivista (P1 residuo + P2 anti-parafrasi)
// Copre: lexicalOverlap/containment, residueSentences (on-topic + novità + dedup),
// paraphraseVerdict (accept/parafrasi/poco-nuovo), filterProposedChildren (covered
// cumulativo che uccide i fratelli quasi-identici).
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const DC = require(path.join(__dirname, '..', 'public', 'js', 'mappai-deepen-core.js'));

// ── lexicalOverlap ──────────────────────────────────────────────────────────
test('lexicalOverlap: containment alto quando il testo è dentro il coperto', () => {
    const covered = 'Gli Alamanni portarono i loro dialetti germanici nella Svizzera settentrionale.';
    const child = 'Gli Alamanni portarono dialetti germanici nella Svizzera.';
    const ov = DC.lexicalOverlap(child, covered);
    assert.ok(ov.containment >= 0.8, `containment atteso alto, avuto ${ov.containment}`);
});

test('lexicalOverlap: parole nuove riconosciute e deduplicate', () => {
    const ov = DC.lexicalOverlap('La filigrana usava fili metallici come marchio', 'La filigrana è un disegno');
    assert.ok(ov.newWords.includes('metallici'));
    assert.ok(ov.newWords.includes('marchio'));
    assert.strictEqual(new Set(ov.newWords).size, ov.newWords.length); // uniche
});

test('lexicalOverlap: stemming italiano copre le flessioni', () => {
    // "coltivazione" vs "coltivare" → stessa radice 6 char "coltiv"
    const ov = DC.lexicalOverlap('La coltivazione dei campi', 'tecniche per coltivare i campi');
    assert.ok(ov.containment >= 0.9, `flessioni coperte, containment ${ov.containment}`);
});

// ── residueSentences (P1) ────────────────────────────────────────────────────
test('residueSentences: tiene frasi on-topic con info nuova, scarta la parafrasi del padre', () => {
    const parent = 'Filigrana. I cartai di Fabriano inserivano fili metallici nei setacci per lasciare un disegno visibile controluce.';
    const corpus = [
        'La filigrana di Fabriano fu introdotta nel Duecento e serviva a certificare il formato del foglio.', // on-topic + NUOVO (Duecento, certificare, formato)
        'I cartai di Fabriano inserivano fili metallici nei setacci per un disegno controluce.',              // parafrasi del padre → scartata
        'Il commercio delle spezie arricchì Venezia nel Trecento.'                                            // off-topic → scartata
    ].join('\n');
    const res = DC.residueSentences(parent, corpus);
    assert.strictEqual(res.length, 1, 'una sola frase-residuo attesa');
    assert.match(res[0], /Duecento|certificare|formato/);
});

test('residueSentences: nessun residuo → array vuoto (niente da approfondire)', () => {
    const parent = 'Alpeggio: pascolo estivo in alta montagna dove il bestiame veniva portato a nutrirsi.';
    const corpus = 'Il pascolo estivo in alta montagna serviva a nutrire il bestiame durante l\'estate.'; // tutto già nel padre
    assert.strictEqual(DC.buildResidueMaterial(parent, corpus), '');
});

test('residueSentences: dedup fra frasi che portano lo stesso residuo', () => {
    const parent = 'Battaglia del Talas: scontro tra Cinesi e Arabi.';
    const corpus = [
        'Nel 751 i cartai cinesi catturati rivelarono il segreto.',
        'Nel 751 i cartai cinesi catturati svelarono il segreto.' // stesso residuo (solo un verbo diverso) → deduplicata
    ].join('\n');
    const res = DC.residueSentences(parent, corpus);
    assert.strictEqual(res.length, 1, 'le due frasi portano lo stesso residuo → una sola tenuta');
});

// ── paraphraseVerdict (P2) ───────────────────────────────────────────────────
test('paraphraseVerdict: parafrasi del padre → reject', () => {
    const parent = 'Gli Alamanni portarono i loro dialetti germanici nell\'altopiano settentrionale, germanizzando la regione.';
    const child = 'Gli Alamanni portarono i dialetti germanici nell\'altopiano settentrionale.';
    const v = DC.paraphraseVerdict(child, parent);
    assert.strictEqual(v.accept, false);
    assert.strictEqual(v.reason, 'parafrasi');
});

test('paraphraseVerdict: sotto-concetto con dato nuovo → accept', () => {
    const parent = 'La produzione di latticini divenne importante nelle Alpi.';
    const child = 'Il formaggio a pasta dura si conservava per mesi ed era barattato con sale e cereali.';
    const v = DC.paraphraseVerdict(child, parent);
    assert.strictEqual(v.accept, true, `atteso accept, reason=${v.reason} cont=${v.containment}`);
});

test('paraphraseVerdict: testo vuoto → reject', () => {
    assert.strictEqual(DC.paraphraseVerdict('', 'qualcosa').accept, false);
});

// ── filterProposedChildren — cluster di fratelli quasi identici ──────────────
// P2 lessicale cattura le parafrasi ad ALTO overlap di lessico (i fratelli che
// riusano le stesse parole del primo). I quasi-duplicati raccontati con lessico
// molto diverso restano fuori portata del metodo puro → dominio del dedup
// semantico/embedding (proposta P3), non di questo verdetto.
test('filterProposedChildren: covered cumulativo uccide i fratelli parafrasi (caso Talas)', () => {
    const parent = 'La carta fu inventata in Cina e tenuta segreta per secoli.';
    const children = [
        { label: 'Battaglia del Talas', desc: 'Nel 751 al fiume Talas gli Arabi catturarono i maestri cartai cinesi.' },
        { label: 'Cattura dei cartai', desc: 'Nel 751 al Talas gli Arabi catturarono i cartai cinesi prigionieri.' },
        { label: 'Maestri presi', desc: 'I maestri cartai cinesi furono catturati al Talas nel 751 dagli Arabi.' }
    ];
    const { accepted, rejected } = DC.filterProposedChildren(children, parent);
    assert.strictEqual(accepted.length, 1, 'solo il primo passa; i due gemelli cadono sul covered cumulativo');
    assert.strictEqual(rejected.length, 2);
    assert.ok(rejected.every(r => r._verdict.accept === false));
});

test('filterProposedChildren: figli genuinamente distinti passano tutti', () => {
    const parent = 'La produzione moderna della carta parte dal legno.';
    const children = [
        { label: 'Cellulosa', desc: 'La cellulosa è la fibra vegetale estratta dal legno degli alberi.' },
        { label: 'Sbiancamento', desc: 'La pasta di legno viene lavata e sbiancata con agenti chimici.' },
        { label: 'Bobine', desc: 'I rulli velocissimi arrotolano chilometri di carta asciutta in bobine giganti.' }
    ];
    const { accepted } = DC.filterProposedChildren(children, parent);
    assert.strictEqual(accepted.length, 3);
});

// ── override soglie ──────────────────────────────────────────────────────────
test('opts: soglia containment abbassata rende più severo il verdetto', () => {
    const parent = 'I monaci copiavano libri antichi negli scriptorium salvando la cultura.';
    const child = 'Nei monasteri i monaci trascrivevano opere antiche preservando testi.';
    const lenient = DC.paraphraseVerdict(child, parent, { maxContainment: 0.9 });
    const strict = DC.paraphraseVerdict(child, parent, { maxContainment: 0.2 });
    assert.ok(strict.accept === false);
    assert.ok(lenient.containment === strict.containment); // stessa misura, soglia diversa
});
