'use strict';
/*
 * causal-core.test.js — logica pura «Catena dei perché», headless.
 * Copre: extractDescTriples (direzione ce/ec, contrasti, connettivo a inizio
 * frase, frammenti scartati, cap lunghezza), extractLinkTriples (familyMap,
 * famiglie non-catena escluse, source/target a oggetto), buildParentMap/l1Of,
 * dedupe, buildChains (raggruppamento per ramo, ponti cross, cap per ramo),
 * promptBlock (righe formattate, '' se vuoto, cap).
 */
const { test } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const C = require(path.join(__dirname, '..', 'public', 'js', 'mappai-causal-core.js'));

// ── extractDescTriples ──────────────────────────────────────────────────
test('desc: "quindi" = causa a sinistra, effetto a destra', () => {
    const t = C.extractDescTriples('I magli sminuzzavano i tessuti in poco tempo quindi la pasta era molto fine.', 'N1', 'Magli');
    assert.strictEqual(t.length, 1);
    assert.ok(t[0].cause.includes('magli sminuzzavano'));
    assert.ok(t[0].effect.includes('pasta era molto fine'));
    assert.strictEqual(t[0].conn, 'quindi');
    assert.strictEqual(t[0].origin, 'desc');
    assert.strictEqual(t[0].nodeId, 'N1');
});

test('desc: "perché" inverte — causa a destra', () => {
    const t = C.extractDescTriples('Gli italiani scartarono l\'amido di grano perché attirava gli insetti.', 'N2', 'Colla');
    assert.strictEqual(t.length, 1);
    assert.ok(t[0].cause.includes('attirava gli insetti'));
    assert.ok(t[0].effect.includes('amido di grano'));
});

test('desc: grazie a / thanks to stay in prose when inversion would require grammatical rewriting', () => {
    for (const text of [
        "L'auto elettrica è un veicolo che funziona grazie all'energia elettrica.",
        'La carta arrivò in Europa grazie ai mercanti arabi lungo la Via della Seta.',
        'Thanks to the powerful electric motor, the vehicle accelerates quickly.',
        'The vehicle accelerates quickly thanks to the powerful electric motor.'
    ]) assert.strictEqual(C.extractDescTriples(text).length, 0, text);
});

test('desc: "invece di" = contrasto senza direzione', () => {
    const t = C.extractDescTriples('Usarono la gelatina animale invece di usare l\'amido di grano degli Arabi.');
    assert.strictEqual(t.length, 1);
    assert.strictEqual(t[0].type, 'contrast');
    assert.ok(t[0].a.includes('gelatina'));
    assert.ok(t[0].b.includes('amido'));
});

test('desc: connettivo a INIZIO frase → spezza alla prima virgola', () => {
    const t = C.extractDescTriples('Invece di pestare gli stracci a mano, usarono l\'energia dei fiumi.');
    assert.strictEqual(t.length, 1);
    assert.ok(t[0].a.includes('pestare gli stracci'));
    assert.ok(t[0].b.includes('energia dei fiumi'));
});

test('desc: frammenti corti scartati, una tripla max per frase', () => {
    assert.strictEqual(C.extractDescTriples('Sì perché no.').length, 0);
    const t = C.extractDescTriples('Il fiume mosse i magli quindi la pasta divenne fine perché i magli erano pesanti.');
    assert.strictEqual(t.length, 1); // primo match vince, non due
});

test('desc: più frasi → più triple; lati cappati a 140 char', () => {
    const long = 'x'.repeat(200);
    const t = C.extractDescTriples('A causa della forte pioggia, il raccolto marcì nei campi. La ' + long + ' storia continuò quindi tutto cambiò per sempre.');
    assert.strictEqual(t.length, 2);
    // "A causa di Y, X" a inizio frase: Y è la CAUSA (non invertire)
    assert.ok(t[0].cause.includes('forte pioggia'));
    assert.ok(t[0].effect.includes('raccolto marcì'));
    assert.ok(t[1].cause.length <= 141); // 140 + ellissi
});

test('desc: "Quindi X" a inizio frase (causa nella frase prima) → scartato', () => {
    assert.strictEqual(C.extractDescTriples('Quindi tutto il paese cambiò per sempre.').length, 0);
});

test('desc: lati anaforici/copula senza contenuto scartati', () => {
    assert.strictEqual(C.extractDescTriples('La formula restò segreta per molti secoli quindi questo avvenne.').length, 0);
    assert.strictEqual(C.extractDescTriples('È separata perché rappresenta il punto di svolta.').length, 0);
    // ma un'anafora CON contenuto proprio passa
    const ok = C.extractDescTriples('Questo miglioramento era importante perché rendeva la carta più adatta alla scrittura.');
    assert.strictEqual(ok.length, 1);
});

test('buildChains: desc del ROOT → rootItems, non nei ponti', () => {
    const nodes = NODES.concat();
    nodes[0] = { ...nodes[0], desc: 'La carta si diffuse in Europa perché i mercanti arabi la portarono lungo la Via della Seta.' };
    const res = C.buildChains({ nodes, links: LINKS });
    assert.strictEqual(res.rootItems.length, 1);
    assert.strictEqual(res.rootItems[0].conn, 'perché');
    assert.strictEqual(res.cross.length, 1); // solo il ponte dai link
    assert.strictEqual(res.total, 4);
});

test('desc EN: because/led to/instead of', () => {
    const t1 = C.extractDescTriples('The formula stayed secret because revealing it meant death.');
    assert.strictEqual(t1.length, 1);
    assert.ok(t1[0].cause.includes('revealing it'));
    const t2 = C.extractDescTriples('The battle led to the capture of the papermakers.');
    assert.strictEqual(t2[0].family, 'trasformazione'); // allineato alla tassonomia ('porta a')
});

test('desc EN: passivi "caused/enabled/allowed by" NON estratti (inversione causa/effetto)', () => {
    assert.strictEqual(C.extractDescTriples('The damage caused by the storm was enormous.').length, 0);
    assert.strictEqual(C.extractDescTriples('The reforms enabled by the treaty changed trade.').length, 0);
    assert.strictEqual(C.extractDescTriples('The refugees were allowed to settle in the valley.').length, 0);
    // l'attivo continua a funzionare
    const ok = C.extractDescTriples('The storm caused enormous damage to the coastal villages.');
    assert.strictEqual(ok.length, 1);
    assert.ok(ok[0].cause.includes('The storm'));
});

test('desc: articoli composti — "invece della/dello" interi, mai spezzati dentro la parola', () => {
    const t = C.extractDescTriples('Usarono il nastro adesivo invece della colla vinilica tradizionale.');
    assert.strictEqual(t.length, 1);
    assert.ok(t[0].b.startsWith('colla'), 'residuo articolo nel lato b: ' + t[0].b);
    const t2 = C.extractDescTriples('Scelsero il legno invece dei mattoni rossi per la casa.');
    assert.strictEqual(t2.length, 1);
    assert.ok(t2[0].b.startsWith('mattoni'));
});

test('desc: omografi nominali "la causa"/"la porta a" NON estratti', () => {
    assert.strictEqual(C.extractDescTriples('Il freddo intenso fu la causa principale della ritirata.').length, 0);
    assert.strictEqual(C.extractDescTriples('Il custode chiuse la porta a chiave prima di uscire.').length, 0);
    // il passato remoto verbale resta attivo
    const ok = C.extractDescTriples('La siccità causò una grave carestia in tutto il paese.');
    assert.strictEqual(ok.length, 1);
});

test('desc: "per questo motivo" consuma anche motivo/ragione', () => {
    const t = C.extractDescTriples('La carta era economica e per questo motivo la scrittura si diffuse ovunque.');
    assert.strictEqual(t.length, 1);
    assert.ok(t[0].effect.startsWith('la scrittura'), 'motivo non consumato: ' + t[0].effect);
});

test('desc: connShow — tripla "perché" normalizzata mostra connettivo causa-prima', () => {
    const t = C.extractDescTriples('Gli italiani scartarono l\'amido perché attirava molti insetti.');
    assert.strictEqual(t[0].connShow, 'quindi');
    assert.strictEqual(t[0].conn, 'perché'); // originale conservato
});

test('desc: abbreviazioni (d.C.) non spezzano la frase', () => {
    const t = C.extractDescTriples('Nata nel 105 d.C., la carta si diffuse perché i mercanti arabi la portarono in Europa.');
    assert.strictEqual(t.length, 1);
    assert.ok(t[0].cause.includes('mercanti arabi'));
});

test('desc: "ec" a metà frase — causa tagliata alla prima virgola (coda scartata)', () => {
    const t = C.extractDescTriples('La tecnica si diffuse perché i mercanti arabi la portarono in Europa, rivoluzionando la cultura europea.');
    assert.strictEqual(t.length, 1);
    assert.ok(!t[0].cause.includes('rivoluzionando'), 'coda non tagliata: ' + t[0].cause);
});

test('desc: soggetto ANAFORICO ("La sua…") scartato — Catena senza soggetto', () => {
    // Caso reale «la CARTA»: il lato causa perde il soggetto (Cai Lun) → estratto
    // fuori dal nodo è incomprensibile. Meglio nessun nesso (§8-9).
    const t = C.extractDescTriples('La sua posizione a corte gli permise di sviluppare questa invenzione rivoluzionaria.');
    assert.strictEqual(t.length, 0, 'lato con possessivo iniziale senza soggetto va scartato');
});

test('desc: clitici penzolanti rimossi in coda al lato (soggetto nominato)', () => {
    const t = C.extractDescTriples('Cai Lun a corte gli permise di sviluppare la carta.');
    assert.strictEqual(t.length, 1);
    assert.ok(!/\sgli$/.test(t[0].cause), 'clitico pendente: ' + t[0].cause);
});

test('desc: «permette/permise di + infinito» → connShow completo, conn normalizzato', () => {
    const t = C.extractDescTriples('Cai Lun a corte permise di sviluppare la carta.');
    assert.strictEqual(t.length, 1);
    assert.strictEqual(t[0].conn, 'permise', 'conn resta normalizzato (dedup + gruppi cloze)');
    assert.strictEqual(t[0].connShow, 'permise di', 'display: connettivo completo con «di»');
    // il formattatore di riga usa connShow → "… → permise di → …"
    assert.ok(C.promptLines([t[0]])[0].includes('permise di'), 'promptLines mostra il connettivo completo');
});

// ── extractLinkTriples ──────────────────────────────────────────────────
const NODES = [
    { id: 'ROOT', label: 'Carta', level: 0, group: 0 },
    { id: 'A', label: 'Ramo A', level: 1, group: 1 },
    { id: 'B', label: 'Ramo B', level: 1, group: 2 },
    { id: 'A1', label: 'Magli idraulici', level: 2, group: 1, desc: 'Usarono i fiumi quindi il lavoro divenne veloce.' },
    { id: 'A2', label: 'Pasta fine', level: 2, group: 1 },
    { id: 'B1', label: 'Battaglia del Talas', level: 2, group: 2 }
];
const LINKS = [
    { source: 'ROOT', target: 'A', rel: 'include' },
    { source: 'ROOT', target: 'B', rel: 'include' },
    { source: 'A', target: 'A1', rel: 'include' },
    { source: 'A', target: 'A2', rel: 'include' },
    { source: 'B', target: 'B1', rel: 'include' },
    { source: 'A1', target: 'A2', rel: 'causa' },       // catena nel ramo A
    { source: 'B1', target: 'A2', rel: 'porta a' },     // ponte tra rami
    { source: 'A2', target: 'B1', rel: 'è simile a' }   // analogia: NON catena
];

test('link: solo famiglie di catena, include/analogia esclusi', () => {
    const t = C.extractLinkTriples(NODES, LINKS);
    assert.strictEqual(t.length, 2);
    assert.ok(t.every(x => x.origin === 'link'));
    const conns = t.map(x => x.conn).sort();
    assert.deepStrictEqual(conns, ['causa', 'porta a']);
});

test('link: familyMap iniettata vince sul fallback', () => {
    const t = C.extractLinkTriples(NODES, LINKS, { 'è simile a': 'trasformazione' });
    assert.strictEqual(t.length, 1); // solo il verbo mappato; causa/porta a non nel map iniettato
    assert.strictEqual(t[0].conn, 'è simile a');
});

test('link: source/target come oggetti D3 gestiti', () => {
    const t = C.extractLinkTriples(NODES, [{ source: { id: 'A1' }, target: { id: 'A2' }, rel: 'causa' }]);
    assert.strictEqual(t.length, 1);
    assert.strictEqual(t[0].cause, 'Magli idraulici');
});

// ── parent map / l1Of / buildChains ─────────────────────────────────────
test('buildParentMap + l1Of risalgono al ramo L1', () => {
    const pm = C.buildParentMap(NODES, LINKS);
    const byId = {}; NODES.forEach(n => byId[n.id] = n);
    assert.strictEqual(C.l1Of('A2', pm, byId), 'A');
    assert.strictEqual(C.l1Of('B1', pm, byId), 'B');
    assert.strictEqual(C.l1Of('ROOT', pm, byId), null);
});

test('buildChains: gruppi per ramo + ponte in cross + desc triple nel ramo giusto', () => {
    const res = C.buildChains({ nodes: NODES, links: LINKS });
    assert.strictEqual(res.cross.length, 1);           // B1 → porta a → A2
    assert.strictEqual(res.cross[0].conn, 'porta a');
    const brA = res.branches.find(b => b.id === 'A');
    assert.ok(brA, 'ramo A presente');
    // nel ramo A: link causa (A1→A2) + desc tripla di A1 ("quindi")
    assert.strictEqual(brA.items.length, 2);
    assert.ok(brA.items.some(t => t.origin === 'link'));
    assert.ok(brA.items.some(t => t.origin === 'desc' && t.conn === 'quindi'));
    assert.strictEqual(res.total, 3);
});

test('buildChains: cap per ramo con truncated valorizzato', () => {
    const nodes = [{ id: 'L1X', label: 'X', level: 1, group: 1 }];
    const links = [{ source: 'ROOT', target: 'L1X', rel: 'include' }];
    for (let i = 0; i < 50; i++) {
        nodes.push({ id: 'n' + i, label: 'Nodo ' + i, level: 2, group: 1, desc: 'Il fatto numero ' + i + ' accadde quindi la cosa ' + i + ' cambiò molto.' });
        links.push({ source: 'L1X', target: 'n' + i, rel: 'include' });
    }
    nodes.push({ id: 'ROOT', label: 'R', level: 0, group: 0 });
    const res = C.buildChains({ nodes, links });
    const br = res.branches.find(b => b.id === 'L1X');
    assert.strictEqual(br.items.length, C.MAX_PER_BRANCH);
    assert.strictEqual(br.truncated, 10);
});

test('dedupe: stessa tripla una volta sola', () => {
    const t = { cause: 'A', conn: 'causa', effect: 'B', family: 'trasformazione', origin: 'link' };
    assert.strictEqual(C.dedupe([t, { ...t }]).length, 1);
});

test('dedupe: contrasti simmetrici (A↔B e B↔A) contati una volta', () => {
    const t1 = { type: 'contrast', a: 'Alfa', b: 'Beta', conn: 'si oppone a', family: 'opposizione', origin: 'link' };
    const t2 = { type: 'contrast', a: 'Beta', b: 'Alfa', conn: 'si oppone a', family: 'opposizione', origin: 'link' };
    assert.strictEqual(C.dedupe([t1, t2]).length, 1);
});

test('buildChains: rootItems e cross cappati con truncated valorizzato', () => {
    const nodes = [];
    for (let i = 0; i < 50; i++) nodes.push({ id: 'k' + i, label: 'K' + i, level: 2, desc: 'Il fattore numero ' + i + ' agì con forza quindi il risultato numero ' + i + ' arrivò presto.' });
    // nessuna gerarchia → l1Of null per tutti → tutto in rootItems
    const res = C.buildChains({ nodes, links: [] });
    assert.strictEqual(res.rootItems.length, C.MAX_PER_BRANCH);
    assert.strictEqual(res.rootTruncated, 10);
});

test('buildParentMap: i link isCross non rubano la parentela', () => {
    const nodes = [
        { id: 'R', label: 'R', level: 0 },
        { id: 'A', label: 'A', level: 1 }, { id: 'B', label: 'B', level: 1 },
        { id: 'A1', label: 'A1', level: 2 }, { id: 'B2', label: 'B2', level: 3 },
        { id: 'B1', label: 'B1', level: 2 }
    ];
    const links = [
        { source: 'A1', target: 'B2', rel: 'richiede', isCross: true },  // PRIMA nell'array
        { source: 'R', target: 'A' }, { source: 'R', target: 'B' },
        { source: 'A', target: 'A1' }, { source: 'B', target: 'B1' },
        { source: 'B1', target: 'B2' }
    ];
    const pm = C.buildParentMap(nodes, links);
    assert.strictEqual(pm['B2'], 'B1', 'cross-link ha rubato la parentela');
});

test('extractLinkTriples con la REL_FAMILY_MAP REALE (tassonomia in mappai-relations.js)', () => {
    // mappai-relations è un IIFE su window → caricalo in sandbox
    const fs = require('fs');
    const src = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'mappai-relations.js'), 'utf8');
    const w = {};
    new Function('window', src)(w);
    const R = w.MappAIRelations;
    assert.ok(R && R.REL_FAMILY_MAP, 'REL_FAMILY_MAP non esposta');
    const nodes = [{ id: 'X', label: 'X', level: 2 }, { id: 'Y', label: 'Y', level: 2 }];
    const t = C.extractLinkTriples(nodes, [
        { source: 'X', target: 'Y', rel: 'porta a' },        // trasformazione nella tassonomia
        { source: 'X', target: 'Y', rel: 'fa parte di' }     // appartenenza: esclusa
    ], R.REL_FAMILY_MAP);
    assert.strictEqual(t.length, 1);
    assert.strictEqual(t[0].family, 'trasformazione');
    // coerenza fallback ↔ tassonomia sui verbi condivisi (regola 12: no divergenze)
    for (const verb of Object.keys(C.FALLBACK_FAMILY_MAP)) {
        if (R.REL_FAMILY_MAP[verb]) {
            assert.strictEqual(C.FALLBACK_FAMILY_MAP[verb], R.REL_FAMILY_MAP[verb],
                'divergenza fallback/tassonomia sul verbo: ' + verb);
        }
    }
});

// ── promptBlock ─────────────────────────────────────────────────────────
test('promptBlock: righe → e ↔, header presente, \'\' se vuoto', () => {
    const blk = C.promptBlock(NODES.filter(n => n.group === 1 || n.level === 0), LINKS);
    assert.ok(blk.includes('NESSI CAUSA-EFFETTO'));
    assert.ok(blk.includes('- Magli idraulici → causa → Pasta fine'));
    assert.ok(blk.includes('→ quindi →')); // dalla desc di A1
    assert.strictEqual(C.promptBlock([{ id: 'z', label: 'Z', level: 2 }], []), '');
});

test('promptBlock: cap rispettato', () => {
    const nodes = [];
    for (let i = 0; i < 30; i++) nodes.push({ id: 'n' + i, label: 'N' + i, level: 2, desc: 'Il fattore ' + i + ' agì quindi il risultato ' + i + ' arrivò presto.' });
    const blk = C.promptBlock(nodes, [], null, 5);
    assert.strictEqual((blk.match(/^- /gm) || []).length, 5);
});

// ── connGroup / connEquivalents (buchi-relazione del cloze) ──────────────
test('connGroup: superficie intera → gruppo; frase o label → null', () => {
    assert.ok(C.connGroup('perché'));
    assert.strictEqual(C.connGroup('poiché'), C.connGroup('perché'));      // stesso gruppo
    assert.notStrictEqual(C.connGroup('quindi'), C.connGroup('perché'));   // direzione diversa
    assert.notStrictEqual(C.connGroup('a causa di'), C.connGroup('perché')); // classe diversa (prep≠conj)
    assert.strictEqual(C.connGroup('Perché scoppiò la guerra'), null);     // label che INIZIA con connettivo
    assert.strictEqual(C.connGroup('poiché la luce colpisce'), null);      // frase
});

test('connEquivalents: include forme articolate + answerOnly + bilingue', () => {
    const ga = C.connEquivalents('Grazie ai');
    assert.ok(ga.includes('grazie a') && ga.includes('grazie agli') && ga.includes('grazie alla'));
    assert.ok(ga.includes('thanks to'));                       // bilingue
    const prov = C.connEquivalents('provocò');
    assert.ok(prov.includes('causa') && prov.includes('genera'));  // answerOnly (sinonimi presente)
    assert.strictEqual(C.connEquivalents('Perché scoppiò la guerra').length, 0); // non-connettivo → []
});

// ── DOCUMENTO EDITABILE (editor «Catena dei perché» di ELABORA) ──────────────
const CHAINS_FIXTURE = () => C.buildChains({
    nodes: [
        { id: 'r', label: 'Radice', level: 0 },
        { id: 'a', label: 'Industria', level: 1, group: 1 },
        { id: 'b', label: 'Città', level: 2, group: 1, desc: 'La città cresce perché l\'industria crea lavoro.' },
        { id: 'c', label: 'Agricoltura', level: 1, group: 2 }
    ],
    links: [
        { source: 'r', target: 'a', rel: 'fa parte di' }, { source: 'r', target: 'c', rel: 'fa parte di' },
        { source: 'a', target: 'b', rel: 'causa' }, { source: 'a', target: 'c', rel: 'si oppone a' }
    ]
});

test('docFromChains: una sezione per ramo + ponti, righe a tre campi fissi', () => {
    const doc = C.docFromChains(CHAINS_FIXTURE(), { root: 'In generale', cross: 'Ponti tra i rami' });
    const kinds = doc.sections.map(s => s.kind);
    assert.ok(kinds.includes('branch') && kinds.includes('cross'));
    assert.strictEqual(doc.sections[doc.sections.length - 1].label, 'Ponti tra i rami');
    const r = doc.sections[0].rows[0];
    assert.deepStrictEqual(Object.keys(r).sort(), ['conn', 'family', 'left', 'nodeLabel', 'origin', 'right', 'type']);
    assert.ok(r.left && r.right && r.conn, 'la riga arriva già compilata dall\'estrazione');
});

test('rowFromTriple/tripleFromRow: il contrasto conserva a/b, la causa cause/effect', () => {
    const contrasto = C.rowFromTriple({ type: 'contrast', a: 'Pace', b: 'Guerra', conn: 'invece di', family: 'opposizione', origin: 'link' });
    assert.strictEqual(contrasto.type, 'contrast');
    assert.strictEqual(contrasto.left, 'Pace');
    const t = C.tripleFromRow(contrasto);
    assert.strictEqual(t.a, 'Pace'); assert.strictEqual(t.b, 'Guerra');
    assert.ok(!('cause' in t), 'un contrasto non diventa una causa');
    const causa = C.tripleFromRow(C.rowFromTriple({ cause: 'Pioggia', effect: 'Piena', conn: 'provoca', family: 'trasformazione', origin: 'desc' }));
    assert.strictEqual(causa.cause, 'Pioggia');
    assert.strictEqual(causa.connShow, 'provoca');
});

test('rowFromTriple: famiglia sconosciuta → trasformazione, provenienza inventata → manual', () => {
    const r = C.rowFromTriple({ cause: 'a', effect: 'b', conn: 'x', family: 'colore-strano', origin: 'chissà' });
    assert.strictEqual(r.family, 'trasformazione');
    assert.strictEqual(r.origin, 'manual');
});

test('chainsFromDoc: round-trip dal documento ai builder, righe incomplete scartate', () => {
    const doc = C.docFromChains(CHAINS_FIXTURE(), {});
    const back = C.chainsFromDoc(doc);
    assert.strictEqual(back.total, C.countRows(doc));
    // una riga senza il lato destro non è un nesso: non arriva alla stampa
    const rotto = C.setRowField(doc, 0, 0, 'right', '');
    assert.strictEqual(C.chainsFromDoc(rotto).total, back.total - 1);
});

test('operazioni sulle righe: immutabili, e non escono dalla sezione', () => {
    const doc = C.docFromChains(CHAINS_FIXTURE(), {});
    const dopo = C.setRowField(doc, 0, 0, 'conn', 'quindi');
    assert.strictEqual(doc.sections[0].rows[0].conn, 'causa', 'l\'originale non viene toccato');
    assert.strictEqual(dopo.sections[0].rows[0].conn, 'quindi');
    // famiglia e tipo passano dalla whitelist
    assert.strictEqual(C.setRowField(doc, 0, 0, 'family', 'inventata').sections[0].rows[0].family, 'trasformazione');
    assert.strictEqual(C.setRowField(doc, 0, 0, 'type', 'contrast').sections[0].rows[0].type, 'contrast');
    // campo non previsto: nessun effetto
    assert.strictEqual(C.setRowField(doc, 0, 0, 'origin', 'link').sections[0].rows[0].origin, doc.sections[0].rows[0].origin);
    // su/giù ai bordi non perde righe
    const n = doc.sections[0].rows.length;
    assert.strictEqual(C.moveRow(doc, 0, 0, -1).sections[0].rows.length, n);
    assert.strictEqual(C.moveRow(doc, 0, n - 1, 1).sections[0].rows.length, n);
    assert.strictEqual(C.removeRow(doc, 0, 0).sections[0].rows.length, n - 1);
    assert.strictEqual(C.insertRow(doc, 0, 0).sections[0].rows.length, n + 1);
    assert.strictEqual(C.insertRow(doc, 0, 0).sections[0].rows[1].origin, 'manual', 'la riga nuova è del docente');
});

test('normDoc/validateDoc: le righe vuote spariscono, quelle a metà vengono segnalate', () => {
    const doc = C.docFromChains(CHAINS_FIXTURE(), {});
    const conVuota = C.insertRow(doc, 0, 0);
    assert.strictEqual(C.validateDoc(conVuota).length, 1, 'la riga vuota è un problema da mostrare');
    assert.strictEqual(C.countRows(C.normDoc(conVuota)), C.countRows(doc), 'ma al salvataggio esce da sola');
    const mezza = C.setRowField(doc, 0, 0, 'conn', '');
    assert.ok(/connettivo/.test(C.validateDoc(mezza)[0].msg));
    // una sezione svuotata del tutto non resta come titolo orfano
    let vuoto = doc;
    doc.sections[0].rows.forEach(() => { vuoto = C.removeRow(vuoto, 0, 0); });
    assert.ok(C.normDoc(vuoto).sections.every(s => s.rows.length));
});
