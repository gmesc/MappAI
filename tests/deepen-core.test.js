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

// ── assignResidues (P1-bis: argmax globale) ─────────────────────────────────
// Regressione del bug reale (mappa "Storia della Carta" 2A): la frase sui magli
// di Fabriano condivide "martello di legno"+"artigiani" con "Produzione Papiro"
// → col retrieval per-foglia indipendente finiva depositata ANCHE lì.
const PAPIRO = { id: 'PAP', parentText: 'Produzione Papiro. Gli artigiani tagliavano il fusto della pianta in strisce sottili, le incrociavano e le schiacciavano con un martello di legno prima di incollarle in rotoli.' };
const MAGLI = { id: 'MAG', parentText: 'Pila a Magli Idraulici. Gli artigiani di Fabriano utilizzarono l\'energia dei fiumi per azionare grandi martelli di legno, chiamati magli, che sminuzzavano i tessuti rapidamente.' };
const FRASE_MAGLI = 'Gli artigiani di Fabriano usarono l\'energia dei fiumi per azionare grandi martelli di legno chiamati magli che sminuzzavano gli stracci in una pasta finissima.';
const FRASE_PAPIRO = 'Il fusto del papiro veniva raccolto lungo il Nilo in estate e i rotoli misuravano fino a venti metri.';

test('assignResidues: la frase va SOLO alla foglia a pertinenza massima (argmax)', () => {
    // sanity del bug: senza argmax la frase magli passerebbe il gate anche sul papiro
    const soloPapiro = DC.residueSentences(PAPIRO.parentText, FRASE_MAGLI);
    assert.strictEqual(soloPapiro.length, 1, 'per-foglia indipendente: il papiro la accetterebbe (il bug)');
    // con la gara globale vince il nodo magli
    const out = DC.assignResidues([PAPIRO, MAGLI], [FRASE_MAGLI, FRASE_PAPIRO].join('\n'));
    assert.ok(!out.has('PAP') || !out.get('PAP').includes('magli'), 'il papiro NON riceve la frase magli');
    assert.match(out.get('MAG') || '', /magli/, 'la foglia magli la riceve');
    assert.match(out.get('PAP') || '', /Nilo/, 'il papiro riceve il SUO residuo');
});

test('assignResidues: assorbitore (eligible:false) vince → frase scartata, non dirottata', () => {
    const out = DC.assignResidues(
        [PAPIRO, { ...MAGLI, eligible: false }],
        FRASE_MAGLI);
    assert.strictEqual(out.has('MAG'), false, 'gli assorbitori non producono materiale');
    assert.strictEqual(out.has('PAP'), false, 'la frase non ricade sul secondo classificato fuori tema');
});

test('assignResidues: assorbitore che contiene già la frase la assorbe (pertinenza 1.0, zero novità)', () => {
    const covered = { id: 'COV', parentText: FRASE_MAGLI, eligible: false };
    const out = DC.assignResidues([PAPIRO, covered], FRASE_MAGLI);
    assert.strictEqual(out.size, 0, 'frase già coperta da un nodo della mappa → sparisce');
});

// Finding review 21/7/26 (major): il padre a desc RICCA vinceva sulla propria
// foglia corta per copertura di superficie e la frase — con informazione nuova
// per tutta la mappa — moriva. Ora: vittoria assorbitore "di superficie"
// (pertinenza < absorberClaimMin, novità alta) → ripiego sull'eligible migliore.
test('assignResidues: assorbitore vince di superficie (<0.5) → ripiega sulla foglia eligible', () => {
    const PADRE_RICCO = { id: 'PADRE', eligible: false, parentText: 'Innovazioni di Fabriano. Le innovazioni di Fabriano comprendono la pila a magli idraulici che sminuzzava gli stracci con energia dei fiumi, la colla animale ricavata dalle pelli che rendeva la carta impermeabile, e la filigrana coi fili metallici come marchio di fabbrica contro i falsi.' };
    const FOGLIA_CORTA = { id: 'FOGLIA', eligible: true, parentText: 'Pila a Magli Idraulici. Attrezzo di Fabriano.' };
    const FRASE = 'La pila a magli idraulici riduceva gli stracci in pasta in poche ore mentre la pestatura a mano richiedeva giorni di lavoro.';
    // guardia sul setup: il padre deve battere STRETTAMENTE la foglia, sotto 0.5
    const relP = DC.lexicalOverlap(FRASE, PADRE_RICCO.parentText);
    const relF = DC.lexicalOverlap(FRASE, FOGLIA_CORTA.parentText);
    assert.ok(relP.covered / relP.total > relF.covered / relF.total, 'setup: padre sopra la foglia');
    assert.ok(relP.covered / relP.total < 0.5, 'setup: padre sotto absorberClaimMin');
    const out = DC.assignResidues([PADRE_RICCO, FOGLIA_CORTA], FRASE);
    assert.match(out.get('FOGLIA') || '', /pestatura/, 'la frase ripiega sulla foglia, non muore');
});

test('assignResidues: a parità di pertinenza un eligible batte un assorbitore', () => {
    const A = { id: 'ABS', eligible: false, parentText: 'Pila a Magli. Martelli di legno azionati dai fiumi che sminuzzavano gli stracci.' };
    const E = { id: 'ELI', eligible: true, parentText: 'Pila a Magli. Martelli di legno azionati dai fiumi che sminuzzavano gli stracci.' };
    const F = 'I martelli di legno della pila sminuzzavano gli stracci producendo pasta finissima in poche ore di lavoro.';
    const out = DC.assignResidues([A, E], F);
    assert.match(out.get('ELI') || '', /finissima/, 'stesso testo → vince il deposito, non lo scarto');
});

// ── isNearDuplicate (P3: gate globale) ──────────────────────────────────────
test('isNearDuplicate: coppia reale D5/D7 della mappa 2A catturata', () => {
    const d5 = 'Diffusione in Europa Grazie ai mercanti arabi che percorrevano le rotte commerciali della Via della Seta, la carta iniziò il suo viaggio verso l\'Europa. Questo commercio permise la diffusione della tecnologia di produzione della carta e del materiale stesso nel continente europeo.';
    const d7 = 'Viaggio della carta in Europa Grazie ai mercanti arabi che viaggiavano lungo le rotte commerciali della Via della Seta, la carta iniziò il suo viaggio verso l\'Europa. Questo processo di diffusione permise alla tecnologia della carta di raggiungere nuove regioni e culture.';
    assert.ok(DC.isNearDuplicate(d7, [d5]) >= 0, 'D7 riconosciuto quasi-duplicato di D5');
});

test('isNearDuplicate: contenuti distinti passano', () => {
    const a = 'La cellulosa è la fibra vegetale estratta dal legno degli alberi nelle cartiere moderne.';
    const b = 'La filigrana era un marchio di fabbrica creato con fili metallici nei setacci.';
    assert.strictEqual(DC.isNearDuplicate(a, [b]), -1);
});

test('jaccardSim: identici → 1, disgiunti → 0', () => {
    assert.strictEqual(DC.jaccardSim('pasta di legno cotta', 'pasta di legno cotta'), 1);
    assert.strictEqual(DC.jaccardSim('pasta di legno', 'filigrana controluce'), 0);
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
