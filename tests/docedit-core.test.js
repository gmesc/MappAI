const { test } = require('node:test');
const assert = require('node:assert');
const D = require('../public/js/mappai-docedit-core.js');

// Set reale (archivio MappAI): forma q/correct/options/explanation.
const QUIZ_SET = {
    id: 'set_1784825797204_pp4nn',
    title: 'Funzioni Urbane — Scelta Multipla',
    mode: 'quiz',
    type: 'Scelta Multipla',
    angle: 'ripasso',
    items: [
        {
            q: 'Qual è una delle attività principali della funzione industriale urbana?',
            correct: 'Produce ricchezza e crea posti di lavoro.',
            explanation: 'Il testo dice che produce ricchezza.',
            options: ['Fa costruire solo case in centro.', 'Produce ricchezza e crea posti di lavoro.', 'Si occupa solo di vendere prodotti già pronti.']
        },
        { q: 'Dove si trovano spesso le industrie?', correct: 2, explanation: '', options: ['In centro.', 'In periferia.'] }
    ]
};

const FLASH_SET = {
    id: 'set_flash_1', title: 'Funzioni Urbane — Flashcard', mode: 'flashcard', type: 'Flashcard',
    items: [{ front: 'Funzione turistica?', back: 'Attività di viaggi e svago.' }]
};

// ── normalizzazione ─────────────────────────────────────────────────────────
test('docFromSet: forma q/correct → forma unica con correctIndex', () => {
    const doc = D.docFromSet(QUIZ_SET);
    assert.strictEqual(doc.kind, 'quiz');
    assert.strictEqual(doc.quizType, 'mc');
    assert.strictEqual(doc.items.length, 2);
    assert.strictEqual(doc.items[0].correctIndex, 1);
    assert.strictEqual(doc.items[0].answer, 'Produce ricchezza e crea posti di lavoro.');
    assert.strictEqual(doc.items[0].question, 'Qual è una delle attività principali della funzione industriale urbana?');
});

// Quiz per NODO/RAMO (mappai-flashcards-sr.js): opzioni come campi a1/a2/a3 e
// `correct` numerico 1-based. Il player in-app legge fc.a1/a2/a3 → il round-trip
// deve restituire ESATTAMENTE quella forma, o il quiz si rompe nell'app.
const NODE_SET = {
    id: 'set_node_1', title: 'Nodo: Funzione industriale', mode: 'quiz', type: 'Multiple Choice',
    nodeQuiz: true, material: 'testo del nodo',
    items: [
        { q: 'Che cosa produce?', a1: 'Ricchezza', a2: 'Solo case', a3: 'Nulla', correct: 1 },
        { q: 'Dove sta?', a1: 'In centro', a2: 'In periferia', a3: 'Ovunque', correct: 2 }
    ]
};

test('docFromSet: la forma a1/a2/a3 diventa opzioni vere, non una risposta numerica', () => {
    const doc = D.docFromSet(NODE_SET);
    assert.strictEqual(doc.shape, 'aN');
    assert.deepStrictEqual(doc.items[0].options, ['Ricchezza', 'Solo case', 'Nulla']);
    assert.strictEqual(doc.items[0].correctIndex, 0);
    assert.strictEqual(doc.items[0].answer, 'Ricchezza');
    assert.strictEqual(doc.items[1].correctIndex, 1);
    assert.strictEqual(doc.items[1].answer, 'In periferia');
});

test('applyToSet: i quiz per nodo tornano in a1/a2/a3 con correct 1-based', () => {
    const doc = D.docFromSet(NODE_SET);
    doc.items = D.setField(doc.items, 0, 'option:2', 'Disoccupazione');
    doc.items = D.setField(doc.items, 1, 'correctIndex', 2);
    const out = D.applyToSet(NODE_SET, doc);
    assert.strictEqual(out.items[0].a1, 'Ricchezza');
    assert.strictEqual(out.items[0].a3, 'Disoccupazione');
    assert.strictEqual(out.items[0].correct, 1, 'indice 1-based, non testo');
    assert.strictEqual(out.items[1].correct, 3);
    assert.ok(!('options' in out.items[0]), 'niente array options in un set a1/a2/a3');
    assert.strictEqual(out.nodeQuiz, true, 'i flag del set sopravvivono');
    assert.strictEqual(out.material, 'testo del nodo');
});

test('shapeOfItems: distingue i due formati, default options', () => {
    assert.strictEqual(D.shapeOfItems(NODE_SET.items), 'aN');
    assert.strictEqual(D.shapeOfItems(QUIZ_SET.items), 'options');
    assert.strictEqual(D.shapeOfItems([]), 'options');
});

test('normItem: legge anche `stem` (quiz del dungeon)', () => {
    const n = D.normItem({ stem: 'Che cosa?', a1: 'x', a2: 'y', correct: 2 });
    assert.strictEqual(n.question, 'Che cosa?');
    assert.deepStrictEqual(n.options, ['x', 'y']);
    assert.strictEqual(n.correctIndex, 1);
});

test('correctIndexOf: accetta anche indice 1-based come stringa/numero', () => {
    assert.strictEqual(D.correctIndexOf(['a', 'b', 'c'], 'B'), 1);
    assert.strictEqual(D.correctIndexOf(['a', 'b', 'c'], 3), 2);
    assert.strictEqual(D.correctIndexOf(['a', 'b'], 'zzz'), -1);
});

test('docFromSet: flashcard front/back riconosciute', () => {
    const doc = D.docFromSet(FLASH_SET);
    assert.strictEqual(doc.kind, 'flashcards');
    assert.strictEqual(doc.items[0].question, 'Funzione turistica?');
    assert.strictEqual(doc.items[0].answer, 'Attività di viaggi e svago.');
});

test('isTrueFalse: Vero/Falso riconosciuto, MC no', () => {
    assert.ok(D.isTrueFalse([{ q: 'x', options: ['Vero', 'Falso'], correct: 'Vero' }]));
    assert.ok(D.isTrueFalse([{ q: 'x', options: ['False', 'True'], correct: 'True' }]));
    assert.ok(!D.isTrueFalse(QUIZ_SET.items));
});

test('applyToSet: round-trip senza perdere i campi non gestiti e con lo stesso id', () => {
    const doc = D.docFromSet(QUIZ_SET);
    doc.items = D.setField(doc.items, 0, 'question', 'Domanda riscritta dal docente?');
    const out = D.applyToSet(QUIZ_SET, doc);
    assert.strictEqual(out.id, QUIZ_SET.id, 'stesso id → aggiorna, non duplica');
    assert.strictEqual(out.angle, 'ripasso', 'campo non gestito preservato');
    assert.strictEqual(out.items[0].q, 'Domanda riscritta dal docente?');
    assert.strictEqual(out.items[0].correct, 'Produce ricchezza e crea posti di lavoro.');
    // la forma di storage resta quella storica: niente correctIndex nel set
    assert.ok(!('correctIndex' in out.items[0]));
});

test('applyToSet: flashcard tornano a front/back', () => {
    const doc = D.docFromSet(FLASH_SET);
    const out = D.applyToSet(FLASH_SET, doc);
    assert.strictEqual(out.items[0].front, 'Funzione turistica?');
    assert.strictEqual(out.items[0].back, 'Attività di viaggi e svago.');
});

// ── operazioni di lista ─────────────────────────────────────────────────────
test('insert/remove/move sono immutabili', () => {
    const doc = D.docFromSet(QUIZ_SET);
    const before = doc.items.length;
    const added = D.insertAt(doc.items, 1, D.blankItemFor(doc));
    assert.strictEqual(doc.items.length, before, 'originale intatto');
    assert.strictEqual(added.length, before + 1);
    assert.strictEqual(D.removeAt(added, 1).length, before);
    const moved = D.moveItem(doc.items, 0, 1);
    assert.strictEqual(moved[1].question, doc.items[0].question);
});

test('blankItemFor: V/F genera Vero/Falso, MC eredita il numero di opzioni', () => {
    const tf = D.blankItemFor({ kind: 'quiz', quizType: 'tf', items: [] });
    assert.deepStrictEqual(tf.options, ['Vero', 'Falso']);
    const mc = D.blankItemFor(D.docFromSet(QUIZ_SET));
    assert.strictEqual(mc.options.length, 2, 'eredita dall\'ultimo item');
});

test('setField: cambiare il testo dell\'opzione corretta aggiorna answer', () => {
    const doc = D.docFromSet(QUIZ_SET);
    const items = D.setField(doc.items, 0, 'option:1', 'Crea lavoro e ricchezza.');
    assert.strictEqual(items[0].answer, 'Crea lavoro e ricchezza.');
    const items2 = D.setField(items, 0, 'correctIndex', 2);
    assert.strictEqual(items2[0].answer, 'Si occupa solo di vendere prodotti già pronti.');
});

test('removeOption: riallinea correctIndex e non scende sotto 2 opzioni', () => {
    const doc = D.docFromSet(QUIZ_SET);
    const items = D.removeOption(doc.items, 0, 0);        // tolgo la prima, la corretta era 1
    assert.strictEqual(items[0].options.length, 2);
    assert.strictEqual(items[0].correctIndex, 0);
    const items2 = D.removeOption(items, 0, 0);
    assert.strictEqual(items2[0].options.length, 2, 'minimo 2 opzioni');
});

test('validateDoc: segnala domanda vuota, opzione vuota, nessuna corretta', () => {
    const doc = { kind: 'quiz', items: [{ question: '', options: ['a', ''], correct: 'zzz' }] };
    const codes = D.validateDoc(doc).map(p => p.code);
    assert.ok(codes.includes('no-question'));
    assert.ok(codes.includes('blank-option'));
    assert.ok(codes.includes('no-correct'));
});

// ── stile inline ────────────────────────────────────────────────────────────
test('sanitizeInline: tiene b/i/u/sup/br e il colore, butta il resto', () => {
    const out = D.sanitizeInline('<b>Ciao</b> <i>mondo</i> <u>qui</u><br><sup>[1]</sup>');
    assert.strictEqual(out, '<b>Ciao</b> <i>mondo</i> <u>qui</u><br><sup>[1]</sup>');
    assert.strictEqual(D.sanitizeInline('<strong>a</strong><em>b</em>'), '<b>a</b><i>b</i>');
});

test('sanitizeInline: un solo a capo per Invio, niente <br> fantasma in coda', () => {
    // Chromium, premendo Invio a fine blocco, inserisce due <br> (uno è l'artefatto
    // che tiene visibile la riga): nel foglio diventerebbero righe vuote.
    assert.strictEqual(D.sanitizeInline('Prima riga.<br><br>Seconda riga.'), 'Prima riga.<br>Seconda riga.');
    assert.strictEqual(D.sanitizeInline('Testo.<br>'), 'Testo.');
    assert.strictEqual(D.sanitizeInline('Testo.<br><br>'), 'Testo.');
    assert.strictEqual(D.sanitizeInline('A<br>B'), 'A<br>B', 'un a capo vero resta');
});

test('sanitizeInline: span solo con colore valido, normalizzato in hex', () => {
    assert.strictEqual(D.sanitizeInline('<span style="color:#F00">x</span>'), '<span style="color:#ff0000">x</span>');
    assert.strictEqual(D.sanitizeInline('<span style="color: rgb(79, 70, 229)">x</span>'), '<span style="color:#4f46e5">x</span>');
    assert.strictEqual(D.sanitizeInline('<span class="pippo">x</span>'), 'x', 'span senza colore → via il tag, resta il testo');
    assert.strictEqual(D.sanitizeInline('<span style="font-size:40px">x</span>'), 'x', 'la dimensione non è modificabile');
});

test('sanitizeInline: <font color> di execCommand diventa span colorato', () => {
    assert.strictEqual(D.sanitizeInline('<font color="#dc2626">rosso</font>'), '<span style="color:#dc2626">rosso</span>');
    assert.strictEqual(D.sanitizeInline('<font face="Arial">x</font>'), 'x', 'font senza colore → solo testo');
});

test('sanitizeInline: neutralizza script, style e attributi pericolosi', () => {
    const out = D.sanitizeInline('<script>alert(1)</script><b onclick="evil()">ok</b><img src=x onerror=1>');
    assert.ok(!/script/i.test(out.replace('alert(1)', '')), 'nessun tag script');
    assert.ok(!/onclick|onerror/i.test(out), 'nessun handler');
    assert.ok(/<b>ok<\/b>/.test(out));
});

test('sanitizeInline: uno span scartato non chiude quello colorato che lo contiene', () => {
    const out = D.sanitizeInline('<span style="color:#dc2626">rosso <span class="x">dentro</span> ancora rosso</span> fuori');
    assert.strictEqual(out, '<span style="color:#dc2626">rosso dentro ancora rosso</span> fuori');
    // stesso caso con <font> senza colore (execCommand a volte lo produce)
    assert.strictEqual(
        D.sanitizeInline('<span style="color:#059669">a<font face="X">b</font>c</span>'),
        '<span style="color:#059669">abc</span>');
});

test('sanitizeInline: chiude i tag rimasti aperti e scarta le chiusure orfane', () => {
    assert.strictEqual(D.sanitizeInline('<b>testo'), '<b>testo</b>');
    assert.strictEqual(D.sanitizeInline('testo</b>'), 'testo');
});

test('sanitizeInline: non ri-escapa le entità già presenti', () => {
    assert.strictEqual(D.sanitizeInline('Roma &amp; Milano'), 'Roma &amp; Milano');
    assert.strictEqual(D.sanitizeInline('5 < 7'), '5 &lt; 7');
});

test('plainText: toglie i tag e normalizza gli spazi', () => {
    assert.strictEqual(D.plainText('<b>La</b> citt&agrave;<br> <i>alta</i>'), 'La citt&agrave; alta');
    assert.strictEqual(D.plainText('<p>uno   due</p>'), 'uno due');
    assert.strictEqual(D.plainText('Roma &amp; Milano'), 'Roma & Milano', 'le entità base sono decodificate');
});

test('normColor: hex corto, hex lungo, rgb; scarta il resto', () => {
    assert.strictEqual(D.normColor('#abc'), '#aabbcc');
    assert.strictEqual(D.normColor('#4F46E5'), '#4f46e5');
    assert.strictEqual(D.normColor('rgb(0,0,0)'), '#000000');
    assert.strictEqual(D.normColor('red'), null);
    assert.strictEqual(D.normColor('javascript:alert(1)'), null);
});

// ── blocchi sintesi ─────────────────────────────────────────────────────────
const SYNTH_BODY = '<h3>Le funzioni urbane</h3><p>La città <b>concentra</b> attività<sup>[1]</sup>.</p>' +
    '<ul><li>industria</li><li>turismo</li></ul><h4>Nota</h4><p></p>';

test('blocksFromHtml: estrae h3/p/li/h4, salta i blocchi vuoti', () => {
    const b = D.blocksFromHtml(SYNTH_BODY);
    assert.deepStrictEqual(b.map(x => x.tag), ['h3', 'p', 'li', 'li', 'h4']);
    assert.ok(/<sup>\[1\]<\/sup>/.test(b[1].html), 'la citazione sopravvive');
    assert.ok(/<b>concentra<\/b>/.test(b[1].html));
});

test('blocksToHtml: ricompone e raggruppa i <li> consecutivi in un solo <ul>', () => {
    const html = D.blocksToHtml(D.blocksFromHtml(SYNTH_BODY));
    assert.ok(/<ul><li>industria<\/li><li>turismo<\/li><\/ul>/.test(html));
    assert.strictEqual((html.match(/<ul>/g) || []).length, 1);
    assert.ok(/<h3>Le funzioni urbane<\/h3>/.test(html));
    // round-trip stabile: i tag di blocco restano quelli che il TTS si aspetta
    assert.deepStrictEqual(D.blocksFromHtml(html).map(x => x.tag), ['h3', 'p', 'li', 'li', 'h4']);
});

test('blocksToHtml: lo stile inline aggiunto dal docente sopravvive, il resto no', () => {
    const blocks = [{ tag: 'p', html: '<span style="color:#dc2626">rosso</span> <div>x</div>' }];
    const html = D.blocksToHtml(blocks);
    assert.ok(/<span style="color:#dc2626">rosso<\/span>/.test(html));
    assert.ok(!/<div>/.test(html));
});

// Sintesi «tutta la mappa»: le citazioni stanno DENTRO il corpo, sezione per
// sezione. Devono sopravvivere all'editing, al loro posto.
const WHOLE_BODY = '<h3>Panoramica</h3><p>Introduzione [1].</p>' +
    '<h3>Industria</h3><p>Testo del ramo [2].</p>' +
    '<div class="bs-citations"><div class="bs-citations-title">Fonti</div>' +
    '<div class="bs-cite-row"><span class="bs-cite-num">1</span><span class="bs-cite-text">Scheda pag. 12</span></div></div>' +
    '<h3>Turismo</h3><p>Altro ramo.</p>';

test('blocksFromHtml: i div generati diventano blocchi raw, in ordine di documento', () => {
    const b = D.blocksFromHtml(WHOLE_BODY);
    assert.deepStrictEqual(b.map(x => x.tag), ['h3', 'p', 'h3', 'p', 'raw', 'h3', 'p']);
    assert.ok(/bs-citations/.test(b[4].html));
});

test('blocksToHtml: il blocco raw torna verbatim e resta in mezzo alle sezioni', () => {
    const blocks = D.blocksFromHtml(WHOLE_BODY);
    blocks[3] = { tag: 'p', html: 'Testo <b>riscritto</b> dal docente [2].' };
    const html = D.blocksToHtml(blocks);
    assert.ok(/bs-cite-text">Scheda pag\. 12/.test(html), 'citazione preservata');
    assert.ok(html.indexOf('bs-citations') > html.indexOf('riscritto'), 'resta dopo la sezione a cui appartiene');
    assert.ok(html.indexOf('bs-citations') < html.indexOf('Turismo'), 'e prima della sezione seguente');
    assert.ok(/<b>riscritto<\/b>/.test(html));
});

test('blocksToHtml: il raw non viene sanitizzato (è HTML generato, non input)', () => {
    const html = D.blocksToHtml([{ tag: 'raw', html: '<div class="x"><span class="y">1</span></div>' }]);
    assert.strictEqual(html, '<div class="x"><span class="y">1</span></div>');
});

test('blocksFromHtml: div annidati chiusi correttamente', () => {
    const b = D.blocksFromHtml('<div class="out"><div class="in">a</div>b</div><p>dopo</p>');
    assert.deepStrictEqual(b.map(x => x.tag), ['raw', 'p']);
    assert.strictEqual(b[0].html, '<div class="out"><div class="in">a</div>b</div>');
    assert.strictEqual(D.plainText(b[1].html), 'dopo');
});

test('audioStale: i blocchi raw non contano (non vengono letti ad alta voce)', () => {
    const a = D.blocksFromHtml(WHOLE_BODY);
    const b = a.filter(x => x.tag !== 'raw');
    assert.ok(!D.audioStale(a, b), 'togliere una citazione non invalida l\'audio');
});

test('audioStale: cambio di testo o di numero blocchi invalida l\'audio', () => {
    const a = D.blocksFromHtml(SYNTH_BODY);
    assert.ok(!D.audioStale(a, D.blocksFromHtml(SYNTH_BODY)), 'identico → audio valido');
    const b = a.slice(); b[0] = { tag: 'h3', html: 'Titolo nuovo' };
    assert.ok(D.audioStale(a, b));
    assert.ok(D.audioStale(a, a.slice(0, 3)));
    // solo grassetto in più = stesso testo letto → audio ancora buono
    const c = a.slice(); c[0] = { tag: 'h3', html: '<b>Le funzioni urbane</b>' };
    assert.ok(!D.audioStale(a, c));
});

// ── cronologia ──────────────────────────────────────────────────────────────
test('createHistory: undo restituisce lo stato precedente, cap rispettato', () => {
    const h = D.createHistory(3);
    h.push({ n: 1 }, 'uno'); h.push({ n: 2 }, 'due'); h.push({ n: 3 }, 'tre'); h.push({ n: 4 }, 'quattro');
    assert.strictEqual(h.size(), 3, 'cap 3');
    assert.strictEqual(h.peekLabel(), 'quattro');
    assert.deepStrictEqual(h.undo().state, { n: 4 });
    assert.ok(h.canUndo());
    h.undo(); h.undo();
    assert.ok(!h.canUndo());
    assert.strictEqual(h.undo(), null);
});

test('createHistory: lo snapshot è una copia (mutare dopo non lo cambia)', () => {
    const h = D.createHistory();
    const st = { items: [{ q: 'a' }] };
    h.push(st, 'x');
    st.items[0].q = 'modificato';
    assert.strictEqual(h.undo().state.items[0].q, 'a');
});

// ── colori e formati ────────────────────────────────────────────────────────
test('pushColorSlot: dedup, ultimo in testa, cap 5', () => {
    let s = D.DEFAULT_SLOTS.slice();
    s = D.pushColorSlot(s, '#dc2626');
    assert.strictEqual(s[0], '#dc2626');
    assert.strictEqual(s.length, 5);
    assert.strictEqual(s.filter(c => c === '#dc2626').length, 1, 'nessun doppione');
    assert.deepStrictEqual(D.pushColorSlot(s, 'nonvalido'), s.slice(0, 5));
});

test('flashPages: conteggio pagine per formato, doppio col retro', () => {
    assert.strictEqual(D.flashPages(5, '2x2', false), 2);
    assert.strictEqual(D.flashPages(5, '2x2', true), 4);
    assert.strictEqual(D.flashPages(12, '4x3', false), 1);
    assert.strictEqual(D.flashPages(13, '4x3', false), 2);
    assert.strictEqual(D.flashPages(3, '2x1', false), 2);
    assert.strictEqual(D.flashPages(0, '2x2', false), 0);
});

test('backsideOrder: ogni riga specchiata (stampa fronte/retro sul lato lungo)', () => {
    assert.deepStrictEqual(D.backsideOrder(4, '2x2'), [1, 0, 3, 2]);
    assert.deepStrictEqual(D.backsideOrder(3, '2x2'), [1, 0, null, 2]);
    assert.deepStrictEqual(D.backsideOrder(2, '2x1'), [1, 0]);
    assert.deepStrictEqual(D.backsideOrder(12, '4x3').slice(0, 4), [3, 2, 1, 0]);
});

test('flashFmt: formato sconosciuto → 2x2', () => {
    assert.strictEqual(D.flashFmt('9x9'), '2x2');
    assert.strictEqual(D.flashFmt('4x3'), '4x3');
});
