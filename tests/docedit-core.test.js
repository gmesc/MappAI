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

test('blocksToHtml: il raw non viene sanitizzato ed esce marcato data-ap-skip', () => {
    const html = D.blocksToHtml([{ tag: 'raw', html: '<div class="x"><span class="y">1</span></div>' }]);
    // contenuto verbatim, dentro l'involucro che i lettori TTS saltano
    assert.strictEqual(html, '<div data-ap-skip><div class="x"><span class="y">1</span></div></div>');
    // idempotente: un secondo giro non annida un altro involucro
    assert.strictEqual(D.blocksToHtml(D.blocksFromHtml(html)), html);
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

// ── blocchi leggibili (definizione unica per TTS, audio e avvisi) ───────────
test('readableBlocks: fuori i raw, fuori i blocchi vuoti, dentro il testo vero', () => {
    const b = [
        { tag: 'h3', html: 'Titolo' },
        { tag: 'raw', html: '<div class="bs-citations"><p>fonte 1</p></div>' },
        { tag: 'p', html: '   ' },                 // vuoto: niente da leggere
        { tag: 'p', html: 'Un <b>paragrafo</b> vero.' },
        { tag: 'li', html: 'una voce' },
        { tag: 'div', html: 'tag non previsto' }   // fuori dallo schema dei blocchi
    ];
    assert.deepStrictEqual(D.readableBlocks(b).map(x => x.tag), ['h3', 'p', 'li']);
    assert.deepStrictEqual(D.readableTexts(b), ['Titolo', 'Un paragrafo vero.', 'una voce']);
});

test('readableTexts: coincide con i blocchi che il generatore audio leggerebbe', () => {
    // la citazione generata è materiale muto: non entra nel parlato
    const b = D.blocksFromHtml(WHOLE_BODY);
    assert.ok(b.some(x => x.tag === 'raw'), 'la fixture contiene un blocco generato');
    assert.ok(D.readableTexts(b).every(t => t && t.trim()), 'nessun testo vuoto fra quelli letti');
    assert.strictEqual(D.readableBlocks(b).length, b.filter(x => x.tag !== 'raw' && D.plainText(x.html).trim()).length);
});

test('speechSignature: uguale se cambia solo la formattazione, diversa se cambia il parlato', () => {
    const a = D.blocksFromHtml(SYNTH_BODY);
    const soloGrassetto = a.slice(); soloGrassetto[0] = { tag: 'h3', html: '<b>Le funzioni urbane</b>' };
    assert.strictEqual(D.speechSignature(a), D.speechSignature(soloGrassetto));
    const altroTag = a.slice(); altroTag[0] = { tag: 'h4', html: 'Le funzioni urbane' };
    assert.notStrictEqual(D.speechSignature(a), D.speechSignature(altroTag), 'il livello di titolo cambia la lettura');
    // un paragrafo svuotato esce dal parlato → firma diversa
    const svuotato = a.slice(); svuotato[1] = { tag: 'p', html: '' };
    assert.notStrictEqual(D.speechSignature(a), D.speechSignature(svuotato));
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

test('setBlockTag: cambia il tipo tenendo il testo, immutabile', () => {
    const blocks = [{ tag: 'p', html: 'Il <b>Ridotto</b> nazionale' }, { tag: 'h3', html: 'Sezione' }];
    const out = D.setBlockTag(blocks, 0, 'blockquote');
    assert.strictEqual(out[0].tag, 'blockquote');
    assert.strictEqual(out[0].html, 'Il <b>Ridotto</b> nazionale');
    assert.strictEqual(blocks[0].tag, 'p');            // l'originale non si tocca
    assert.strictEqual(out[1], blocks[1]);             // gli altri blocchi restano gli stessi
});

test('setBlockTag: il materiale generato non si converte, i tipi ignoti nemmeno', () => {
    const blocks = [{ tag: 'raw', html: '<div>citazioni</div>' }, { tag: 'p', html: 'testo' }];
    assert.strictEqual(D.setBlockTag(blocks, 0, 'p')[0].tag, 'raw');
    assert.strictEqual(D.setBlockTag(blocks, 1, 'script')[1].tag, 'p');
    assert.strictEqual(D.setBlockTag(blocks, 9, 'h3').length, 2);   // indice fuori range: nessun crash
});

test('setBlockTag: da nota a elenco e ritorno, il round-trip HTML regge', () => {
    let b = D.blocksFromHtml('<p>uno</p><blockquote>due</blockquote>');
    b = D.setBlockTag(b, 1, 'li');
    assert.strictEqual(D.blocksToHtml(b), '<p>uno</p><ul><li>due</li></ul>');
    b = D.setBlockTag(b, 1, 'blockquote');
    assert.strictEqual(D.blocksToHtml(b), '<p>uno</p><blockquote>due</blockquote>');
});

test('stepZoom: sale e scende sulla scala, senza uscirne', () => {
    assert.strictEqual(D.stepZoom(1, 1), 1.15);
    assert.strictEqual(D.stepZoom(1, -1), 0.85);
    assert.strictEqual(D.stepZoom(0.85, -1), 0.85);      // fondo scala
    assert.strictEqual(D.stepZoom(1.5, 1), 1.5);         // cima scala
});

test('nearestZoom: valori sporchi o vecchi → il gradino più vicino', () => {
    assert.strictEqual(D.nearestZoom('1.2'), 1.15);
    assert.strictEqual(D.nearestZoom(3), 1.5);
    assert.strictEqual(D.nearestZoom(0.1), 0.85);
    assert.strictEqual(D.nearestZoom('boh'), 1);
    assert.strictEqual(D.nearestZoom(null), 1);
});

/* ═══ DOMANDE APERTE (11/8/26) ════════════════════════════════════════════════
   Un modello a sé, e non un quiz senza opzioni: la ragione per cui esiste è che
   `normItem`/`setField` normalizzano verso la forma del quiz e scarterebbero
   traccia, righe e aree IN SILENZIO — un salvataggio, e il documento tornerebbe
   un quiz vuoto. Questi test sono il recinto attorno a quei tre campi. */
test('normOpenItem: accetta la forma dell\'AI e quella del foglio', () => {
  // forma italiana del modello
  const a = D.normOpenItem({ domanda: 'Spiega X', traccia: 'Deve citare Y', righe: 5, areas: ['Clima'] });
  assert.strictEqual(a.question, 'Spiega X');
  assert.strictEqual(a.guide, 'Deve citare Y');
  assert.strictEqual(a.lines, 5);
  assert.deepStrictEqual(a.areas, ['Clima']);
  // forma del foglio già salvato
  const b = D.normOpenItem({ question: 'Q', guide: 'G', lines: 8, areas: ['A', 'B'] });
  assert.deepStrictEqual(b.areas, ['A', 'B']);
  // i fogli scritti prima delle due aree portano `l1`: non si perde
  assert.deepStrictEqual(D.normOpenItem({ question: 'Q', l1: 'Clima' }).areas, ['Clima']);
});

test('normOpenItem: righe nei limiti, aree senza doppioni e al massimo due', () => {
  assert.strictEqual(D.normOpenItem({ lines: 1 }).lines, 3);     // sotto il minimo
  assert.strictEqual(D.normOpenItem({ lines: 99 }).lines, 12);   // sopra il massimo
  assert.strictEqual(D.normOpenItem({}).lines, null);            // non dichiarato: decide il foglio
  // «Clima + Clima» non è una domanda che collega due aree
  assert.deepStrictEqual(D.normOpenItem({ areas: ['Clima', 'clima'] }).areas, ['Clima']);
  assert.deepStrictEqual(D.normOpenItem({ areas: ['A', 'B', 'C'] }).areas, ['A', 'B']);
});

test('setOpenField: i tre campi si scrivono, e le aree sono un interruttore', () => {
  let items = [D.blankOpenItem()];
  items = D.setOpenField(items, 0, 'question', 'Confronta A e B');
  items = D.setOpenField(items, 0, 'guide', 'Deve dire che…');
  items = D.setOpenField(items, 0, 'lines', '6');
  assert.strictEqual(items[0].question, 'Confronta A e B');
  assert.strictEqual(items[0].guide, 'Deve dire che…');
  assert.strictEqual(items[0].lines, 6);
  // area: si accende, si spegne, e la seconda si aggiunge
  items = D.setOpenField(items, 0, 'area:Clima');
  assert.deepStrictEqual(items[0].areas, ['Clima']);
  items = D.setOpenField(items, 0, 'area:Suolo');
  assert.deepStrictEqual(items[0].areas, ['Clima', 'Suolo']);
  // la terza NON entra e NON sostituisce a sorpresa: si toglie prima
  items = D.setOpenField(items, 0, 'area:Acqua');
  assert.deepStrictEqual(items[0].areas, ['Clima', 'Suolo']);
  items = D.setOpenField(items, 0, 'area:Clima');
  assert.deepStrictEqual(items[0].areas, ['Suolo']);
  // indice fuori range: nessun danno
  assert.strictEqual(D.setOpenField(items, 9, 'question', 'x').length, 1);
});

/* Il difetto che questo previene: usare `setField` (quella del quiz) su un item
   aperto. Non lancia, non avvisa — restituisce un item senza i tre campi. */
test('setField del quiz NON conserva i campi delle domande aperte', () => {
  const dopo = D.setField([{ question: 'Q', guide: 'G', lines: 5, areas: ['A'] }], 0, 'question', 'Q2');
  assert.strictEqual(dopo[0].guide, undefined, 'se un giorno li conservasse, questo test va tolto');
  assert.strictEqual(dopo[0].lines, undefined);
});

test('validateOpenDoc: dice che cosa manca, domanda per domanda', () => {
  const p = D.validateOpenDoc({ items: [{ question: 'Q', guide: '', areas: [] }] });
  assert.ok(p.some(x => /traccia/i.test(x.msg)));
  assert.ok(p.some(x => /macro-area/i.test(x.msg)));
  assert.strictEqual(D.validateOpenDoc({ items: [] })[0].i, -1);
  assert.deepStrictEqual(
    D.validateOpenDoc({ items: [{ question: 'Q', guide: 'G', areas: ['A'] }] }), []);
});

/* Il LIVELLO di una domanda aperta, cambiato a mano nell'editor (13/8/26).
   Lo dichiara l'AI quando genera, ma è chi CORREGGE ad avere l'ultima parola:
   a una domanda d'avvio si aggiunge un collegamento e quella smette di
   esserlo — il foglio delle tracce continuerebbe a dire di sì. */
test('setOpenField: il livello si cambia, e resta ai due valori', () => {
  let items = [D.blankOpenItem()];
  assert.strictEqual(items[0].livello, 'ponte', 'una domanda scritta a mano nasce di ponte');
  items = D.setOpenField(items, 0, 'livello', 'base');
  assert.strictEqual(items[0].livello, 'base');
  items = D.setOpenField(items, 0, 'livello', 'PONTE');
  assert.strictEqual(items[0].livello, 'ponte');
  /* qualunque altra cosa vale ponte: il caso prudente, che non promette
     all'allievo un avvio che non c'è */
  items = D.setOpenField(items, 0, 'livello', 'facile');
  assert.strictEqual(items[0].livello, 'ponte');
});
test('setOpenField: cambiare il livello non tocca il resto della domanda', () => {
  let items = [{ question: 'Perché?', guide: 'traccia', lines: 8, areas: ['Clima'], livello: 'base' }];
  items = D.setOpenField(items, 0, 'livello', 'ponte');
  assert.strictEqual(items[0].question, 'Perché?');
  assert.strictEqual(items[0].guide, 'traccia');
  assert.strictEqual(items[0].lines, 8);
  assert.deepStrictEqual(items[0].areas, ['Clima']);
});
test('normOpenItem: il livello sopravvive al giro archivio → editor → archivio', () => {
  /* è il difetto che questa riga chiude: senza, si perdeva al primo
     salvataggio e il foglio ristampato non lo diceva più */
  const a = D.normOpenItems([{ domanda: 'q', traccia: 't', righe: 5, livello: 'base' }]);
  assert.strictEqual(a[0].livello, 'base');
  const b = D.normOpenItems(a);
  assert.strictEqual(b[0].livello, 'base', 'idempotente');
  assert.strictEqual(D.normOpenItems([{ domanda: 'q' }])[0].livello, 'ponte', 'assente = ponte');
});

// ── i richiami seguono il blocco delle Note (18/8/26) ───────────────────────
const DEC = require('../public/js/mappai-docedit-core.js');

test('togliRichiamiCitazione: via i [n], non gli esponenti', () => {
    // Spegnendo le Note i richiami restano puntati a niente: vanno tolti.
    assert.strictEqual(
        DEC.togliRichiamiCitazione('Il moto <sup>[1]</sup> di cariche <sup>[12]</sup>.'),
        'Il moto  di cariche .');
    // ⚠️ Un <sup> senza parentesi è un ESPONENTE, e in una sintesi di scienze
    // c'è eccome: non si tocca.
    const esp = 'L\'area è 5 m<sup>2</sup> e il volume x<sup>3</sup>.';
    assert.strictEqual(DEC.togliRichiamiCitazione(esp), esp);
});

test('togliRichiamiCitazione: regge attributi, spazi e testo senza richiami', () => {
    assert.strictEqual(DEC.togliRichiamiCitazione('a <sup class="x"> [3] </sup>b'), 'a b');
    assert.strictEqual(DEC.togliRichiamiCitazione('nessun richiamo'), 'nessun richiamo');
    assert.strictEqual(DEC.togliRichiamiCitazione(''), '');
    assert.strictEqual(DEC.togliRichiamiCitazione(null), '');
});
