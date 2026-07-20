'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const C = require('../public/js/mappai-cloze.js');

test('makeCloze: oscura le etichette presenti (parole intere)', () => {
  const r = C.makeCloze('Il Glucosio deriva dalla Fotosintesi.', ['Glucosio', 'Fotosintesi']);
  assert.deepEqual(r.blanks.sort(), ['Fotosintesi', 'Glucosio']);
  // i segmenti ricostruiscono il testo
  const recon = r.segments.map(s => s.text != null ? s.text : s.blank).join('');
  assert.equal(recon, 'Il Glucosio deriva dalla Fotosintesi.');
});

test('makeCloze: confini di parola — non oscura dentro un\'altra parola', () => {
  const r = C.makeCloze('Roma e Romania.', ['Roma']);
  assert.deepEqual(r.blanks, ['Roma']);          // solo "Roma" intero
  const blanksText = r.segments.filter(s => s.blank != null).map(s => s.blank);
  assert.deepEqual(blanksText, ['Roma']);
  assert.ok(r.segments.some(s => s.text && s.text.includes('Romania'))); // "Romania" resta nel testo
});

test('makeCloze: scarta termini < 4 caratteri', () => {
  const r = C.makeCloze('Il re va a casa.', ['re', 'va']);
  assert.equal(r.blanks.length, 0);
});

test('makeCloze: rispetta il tetto max (con contesto fra i termini)', () => {
  // termini distanziati (>MIN_GAP di testo fra loro) → il cap max è il vincolo
  const r = C.makeCloze('Il termine Alfa arriva presto, poi il termine Beta segue lento, infine il termine Gamma chiude tutto.',
    ['Alfa', 'Beta', 'Gamma', 'Delta'], { max: 2 });
  assert.equal(r.blanks.length, 2);
});

test('makeCloze: buchi troppo vicini (lista tutta oscurata) → scartati per spaziatura', () => {
  // "colla animale, filigrana, marchio di fabbrica": 3 label attaccate da ", "
  const r = C.makeCloze('Usarono colla animale, filigrana, marchio di fabbrica come marchi.',
    ['colla animale', 'filigrana', 'marchio di fabbrica'], { max: 3 });
  assert.ok(r.blanks.length < 3, 'la lista fitta non deve oscurare tutti i termini: ' + JSON.stringify(r.blanks));
  // fra due buchi rimasti c'è testo di contesto
  const segs = r.segments;
  for (let i = 1; i < segs.length; i++) {
    if (segs[i].blank && segs[i - 1].blank) assert.fail('due buchi consecutivi senza testo');
  }
});

test('makeCloze: niente match → nessun blank', () => {
  const r = C.makeCloze('Testo senza concetti collegati.', ['Inesistente']);
  assert.equal(r.blanks.length, 0);
  assert.equal(r.segments.length, 1);
});

test('isCloseMatch: esatto, case e accenti', () => {
  assert.ok(C.isCloseMatch('glucosio', 'Glucosio'));
  assert.ok(C.isCloseMatch('neutralita', 'Neutralità'));
});

test('isCloseMatch: plurale/troncamento e refuso piccolo', () => {
  assert.ok(C.isCloseMatch('glucosi', 'Glucosio'));   // troncamento
  assert.ok(C.isCloseMatch('glukosio', 'Glucosio'));  // 1 refuso
});

test('isCloseMatch: vuoto o lontano → false', () => {
  assert.equal(C.isCloseMatch('', 'Glucosio'), false);
  assert.equal(C.isCloseMatch('xyz', 'Glucosio'), false);
});

test('levenshtein: distanze base', () => {
  assert.equal(C.levenshtein('casa', 'casa'), 0);
  assert.equal(C.levenshtein('casa', 'cassa'), 1);
  assert.equal(C.levenshtein('', 'abc'), 3);
});

test('makeCloze: back-compat senza seed → termini più lunghi primi', () => {
  // 4 candidati, max 2 → i due più lunghi (Delta/Gamma per lunghezza pari usa ordine desc stabile)
  const r = C.makeCloze('Alfa Beta Gamma Delta Epsilon.', ['Alfa', 'Beta', 'Gamma', 'Delta', 'Epsilon'], { max: 2 });
  assert.equal(r.blanks.length, 2);
  // Epsilon (7) è il più lungo → deve essere tra i buchi
  assert.ok(r.blanks.includes('Epsilon'));
});

test('makeCloze: seed → deterministico a parità di seed, varia tra seed diversi', () => {
  const terms = ['Alfa', 'Beta', 'Gamma', 'Delta', 'Epsilon', 'Zeta', 'Omega'];
  const text = 'Alfa Beta Gamma Delta Epsilon Zeta Omega insieme.';
  const a1 = C.makeCloze(text, terms, { max: 2, seed: 'sessione-1' }).blanks.join('|');
  const a2 = C.makeCloze(text, terms, { max: 2, seed: 'sessione-1' }).blanks.join('|');
  assert.equal(a1, a2, 'stesso seed → stessi buchi (riproducibile per ripasso)');
  // almeno un seed su alcuni produce una selezione diversa dal default
  const def = C.makeCloze(text, terms, { max: 2 }).blanks.join('|');
  const seeds = ['s1', 's2', 's3', 's4', 's5', 's6', 's7'];
  const anyDifferent = seeds.some(s => C.makeCloze(text, terms, { max: 2, seed: s }).blanks.join('|') !== def);
  assert.ok(anyDifferent, 'almeno un seed varia la selezione rispetto al default');
});

test('makeCloze: seed non rompe non-sovrapposizione né il tetto max', () => {
  const terms = ['Fotosintesi', 'Glucosio', 'Clorofilla', 'Luce', 'Acqua'];
  const r = C.makeCloze('La Fotosintesi usa Luce, Acqua e Clorofilla per il Glucosio.', terms, { max: 3, seed: 'x' });
  assert.ok(r.blanks.length <= 3);
  // i blank sono termini reali presenti nel testo
  r.blanks.forEach(b => assert.ok('La Fotosintesi usa Luce, Acqua e Clorofilla per il Glucosio.'.includes(b)));
});

// ── Buchi-connettivo (19/7/26): la relazione come blank ──────────────────
const CAUSAL = require('../public/js/mappai-causal-core.js'); // stessa fonte usata lazy dal core

test('makeCloze connectives: oscura il connettivo causale se distanziato (max 1 per item)', () => {
  // connettivo con >MIN_GAP di testo dai concetti → sopravvive alla spaziatura
  const text = 'La Fotosintesi cattura la luce del sole, quindi le foglie producono lo zucchero necessario.';
  const r = C.makeCloze(text, ['Fotosintesi', 'zucchero'], { max: 3, connectives: true });
  const connBlanks = r.blanks.filter(b => /quindi/i.test(b));
  assert.equal(connBlanks.length, 1, 'il connettivo distanziato deve essere tra i buchi');
  const recon = r.segments.map(s => s.text != null ? s.text : s.blank).join('');
  assert.equal(recon, text);
  const allConn = r.blanks.filter(b => CAUSAL.CONNECTIVES.some(c => c.re.test(' ' + b + ' ')));
  assert.ok(allConn.length <= 1);
});

test('makeCloze connectives: concetto ADIACENTE al connettivo → tiene il concetto, non il connettivo (item non perso)', () => {
  // "Fotosintesi quindi" (1 char) — il concetto è primario, il connettivo cade
  const text = 'Il Glucosio deriva dalla Fotosintesi quindi la pianta cresce con la Clorofilla.';
  const r = C.makeCloze(text, ['Glucosio', 'Fotosintesi', 'Clorofilla'], { max: 3, connectives: true });
  assert.ok(r.blanks.length - r.connCount >= 1, 'almeno un concetto deve restare (item non deve collassare)');
  // niente due buchi consecutivi
  for (let i = 1; i < r.segments.length; i++) {
    if (r.segments[i].blank && r.segments[i - 1].blank) assert.fail('due buchi consecutivi');
  }
});

test('makeCloze: senza opts.connectives comportamento storico (nessun buco-connettivo)', () => {
  const text = 'Il Glucosio deriva dalla Fotosintesi quindi la pianta cresce.';
  const r = C.makeCloze(text, ['Glucosio', 'Fotosintesi'], { max: 3 });
  assert.ok(!r.blanks.some(b => /quindi/i.test(b)));
});

test('isConnMatch: equivalenti nello stesso gruppo accettati', () => {
  assert.ok(C.isConnMatch('poiché', 'perché'));
  assert.ok(C.isConnMatch('dato che', 'perché'));
  assert.ok(C.isConnMatch('perciò', 'quindi'));
  assert.ok(C.isConnMatch('di conseguenza', 'quindi'));
  assert.ok(C.isConnMatch('anziché', 'invece di'));
  assert.ok(C.isConnMatch('perche', 'perché'), 'refuso senza accento accettato');
});

test('isConnMatch: direzione inversa RIFIUTATA («quindi» non vale per «perché»)', () => {
  assert.ok(!C.isConnMatch('quindi', 'perché'));
  assert.ok(!C.isConnMatch('perché', 'quindi'));
  assert.ok(!C.isConnMatch('invece di', 'perché'));
});

test('isConnMatch: superficie con articolo («grazie ai») risolta sul connettivo base', () => {
  assert.ok(C.isConnMatch('grazie a', 'grazie ai'));
  assert.ok(!C.isConnMatch('parola qualunque', 'grazie ai'));
});

test('isConnMatch: fallback isCloseMatch sui concetti (non-connettivi)', () => {
  assert.ok(C.isConnMatch('glucosio', 'Glucosio'));
  assert.ok(!C.isConnMatch('amido', 'Glucosio'));
});

test('isConnMatch: superficie ELISA («Invece dell\'») risolta sul gruppo di «invece di»', () => {
  assert.ok(C.isConnMatch('anziché', "Invece dell'"));
  assert.ok(C.isConnMatch('a differenza di', "Invece dell'"));
  assert.ok(!C.isConnMatch('perché', "Invece dell'"));
});

test('isConnMatch: una frase che CONTIENE un connettivo non è un connettivo', () => {
  assert.ok(!C.isConnMatch('la pianta quindi', 'quindi'));
});

// ── Fix review 19/7/26 sera ──────────────────────────────────────────────
test('isConnMatch: etichetta che INIZIA con un connettivo NON è un connettivo', () => {
  assert.ok(!C.isConnMatch('poiché', 'Perché scoppiò la guerra'));
  assert.ok(!C.isConnMatch('thanks to', 'Grazie alla Fotosintesi'));
  assert.ok(!C.isConnMatch('a causa di', 'A causa del clima rigido'));
});

test('isConnMatch: risposta-frase che inizia col connettivo RIFIUTATA', () => {
  assert.ok(!C.isConnMatch('perché la luce attiva', 'perché'));
  assert.ok(!C.isConnMatch('quindi la pressione aumenta e il vulcano erutta', 'perciò'));
});

test('isConnMatch: classe grammaticale separa verbi/avverbi/preposizioni', () => {
  assert.ok(!C.isConnMatch('quindi', 'provocò'));      // avverbio ≠ verbo transitivo
  assert.ok(!C.isConnMatch('causò', 'quindi'));
  assert.ok(!C.isConnMatch('a causa di', 'perché'));   // preposizione ≠ congiunzione
  // dentro la stessa classe l'equivalenza resta
  assert.ok(C.isConnMatch('poiché', 'perché'));
  assert.ok(C.isConnMatch('perciò', 'quindi'));
});

test('isConnMatch: sinonimi answer-only — «causa/genera/porta a» valgono per «provocò»', () => {
  assert.ok(C.isConnMatch('causa', 'provocò'));
  assert.ok(C.isConnMatch('genera', 'provocò'));
  assert.ok(C.isConnMatch('porta a', 'causò'));
  assert.ok(C.isConnMatch('determina', 'portò a'));
});

test('answerOnly: mai usati per ESTRARRE (né triple né candidati cloze)', () => {
  const CC = require('../public/js/mappai-causal-core.js');
  // estrazione: «causa» presente resta escluso (omografo sostantivo)
  assert.equal(CC.extractDescTriples('Il freddo intenso causa la carestia nel paese.').length, 0);
  // candidato cloze: nessun buco su «porta a» presente
  const r = C.makeCloze('Il sentiero porta a valle il viandante stanco.', ['Viandante'], { max: 3, connectives: true });
  assert.ok(!r.blanks.some(b => /porta/i.test(b)));
});

test('makeCloze connectives: virgola FUORI dal blank («quindi,» → «quindi»)', () => {
  const r = C.makeCloze('Il ghiaccio fondeva, quindi, il livello del mare saliva piano.', [], { max: 3, connectives: true });
  assert.equal(r.blanks.length, 1);
  assert.equal(r.blanks[0], 'quindi');
});

test('makeCloze connectives: il concetto vince sul connettivo annidato nella label', () => {
  const text = 'Il capitolo Portò alla caduta spiega la fine di Roma antica nel dettaglio.';
  const r = C.makeCloze(text, ['Portò alla caduta', 'Roma antica'], { max: 3, connectives: true });
  assert.ok(r.blanks.includes('Portò alla caduta'), 'label intera come blank');
  assert.ok(!r.blanks.includes('Portò alla'), 'nessun moncone di connettivo');
});

test('makeCloze: connCount valorizzato + flag isConn sul segmento', () => {
  const text = 'La Fotosintesi produce zuccheri perché la luce attiva la Clorofilla.';
  const r = C.makeCloze(text, ['Fotosintesi', 'Clorofilla'], { max: 3, connectives: true });
  assert.equal(r.connCount, 1);
  const connSegs = r.segments.filter(s => s.isConn);
  assert.equal(connSegs.length, 1);
  assert.ok(/perch/i.test(connSegs[0].blank));
  // senza connectives: connCount 0, nessun isConn
  const r2 = C.makeCloze(text, ['Fotosintesi'], { max: 3 });
  assert.equal(r2.connCount, 0);
  assert.ok(!r2.segments.some(s => s.isConn));
});

// ── Credito parziale su concetto multi-parola (issue 5, 19/7/26) ─────────
test('clozeBlankScore: prefisso di termine multi-parola → 0.5 + complemento mancante', () => {
  assert.deepEqual(C.clozeBlankScore('pianta', 'pianta acquatica'), { score: 0.5, missing: 'acquatica' });
  assert.deepEqual(C.clozeBlankScore('marchio', 'marchio di fabbrica'), { score: 0.5, missing: 'di fabbrica' });
  assert.deepEqual(C.clozeBlankScore('marchio di', 'marchio di fabbrica'), { score: 0.5, missing: 'fabbrica' });
});

test('clozeBlankScore: match pieno = 1, termine singolo o errato = 0', () => {
  assert.equal(C.clozeBlankScore('pianta acquatica', 'pianta acquatica').score, 1);
  assert.equal(C.clozeBlankScore('Pianta Acquatica', 'pianta acquatica').score, 1); // accenti/maiuscole
  assert.equal(C.clozeBlankScore('acquatica', 'pianta acquatica').score, 0);        // non è prefisso
  assert.equal(C.clozeBlankScore('cellulosa', 'glucosio').score, 0);                // termine singolo
  assert.equal(C.clozeBlankScore('sbagliato', 'pianta acquatica').score, 0);
});

test('clozeBlankScore: sui buchi-relazione niente parziale (conn:true)', () => {
  assert.equal(C.clozeBlankScore('parola', 'a causa di', { conn: true }).score, 0); // no prefisso sui connettivi
  assert.equal(C.clozeBlankScore('poiché', 'perché', { conn: true }).score, 1);     // equivalente pieno
});

// ── Fix batch review telefono #2 (19/7/26 sera) ──────────────────────────
test('clozeBlankScore: prefisso di sola parola-funzione NON dà mezzo punto', () => {
  assert.equal(C.clozeBlankScore('il', 'il re').score, 0);
  assert.equal(C.clozeBlankScore('la', 'la Rivoluzione francese').score, 0);
  assert.equal(C.clozeBlankScore('the', 'the Empire').score, 0);
  // ma un prefisso di contenuto sì
  assert.equal(C.clozeBlankScore('Rivoluzione', 'Rivoluzione francese').score, 0.5);
});

test('clozeBlankScore: confine di parola (niente prefisso di lettere)', () => {
  assert.equal(C.clozeBlankScore('piant', 'pianta acquatica').score, 0); // non è parola intera
});

// ── Cloze a SCELTA (3 opzioni, tap) — 19/7/26 sera ───────────────────────
test('makeCloze choices: ogni buco ha 3 opzioni con la soluzione dentro (case uniforme)', () => {
  const text = 'Gli Egizi usavano il papiro, una pianta acquatica del Nilo, per scrivere testi.';
  const r = C.makeCloze(text, ['papiro', 'pianta acquatica', 'pergamena', 'tavoletta', 'stilo'], { max: 3, seed: 's', choices: true });
  const blanks = r.segments.filter(s => s.blank);
  assert.ok(blanks.length >= 1);
  const norm = x => x.toLowerCase();
  blanks.forEach(s => {
    assert.equal(s.choices.length, 3);
    // la soluzione (superficie) è tra le opzioni a meno del CASE (opzioni Title Case)
    assert.ok(s.choices.map(norm).includes(norm(s.blank)), 'la soluzione deve essere tra le opzioni');
    assert.equal(new Set(s.choices.map(norm)).size, 3, 'opzioni distinte');
    // tell di maiuscola: tutte le opzioni iniziano in maiuscola (nessuna tradisce)
    s.choices.forEach(o => assert.ok(/^[A-ZÀ-Þ]/.test(o), 'opzione non capitalizzata: ' + o));
  });
});

test('makeCloze choices: distrattori-concetto sono altre etichette, non nel testo', () => {
  const text = 'La Fotosintesi cattura la luce e produce lo zucchero necessario alla crescita.';
  const r = C.makeCloze(text, ['Fotosintesi', 'zucchero', 'Clorofilla', 'Respirazione'], { max: 2, seed: 'q', choices: true });
  const seg = r.segments.find(s => s.blank && !s.isConn);
  seg.choices.filter(o => o !== seg.blank).forEach(d => {
    assert.ok(text.toLowerCase().indexOf(d.toLowerCase()) < 0, 'distrattore ' + d + ' non deve essere nel testo');
  });
});

test('makeCloze choices: distrattori-relazione STESSA classe, famiglie diverse (preposizione)', () => {
  // «invece di» (prep, opposizione): esistono preposizioni di altre famiglie
  // (a causa di=trasformazione, grazie a=dipendenza) → distrattori plausibili
  // preposizione connettiva DISTANZIATA dai concetti (altrimenti la spaziatura la scarta)
  const text = 'La ricchezza crebbe invece della miseria, e col tempo i mercati e i commerci fiorirono ovunque nel regno.';
  const r = C.makeCloze(text, ['mercati', 'commerci', 'porto', 'fiera', 'dogana'], { max: 3, seed: 'r', connectives: true, choices: true });
  const seg = r.segments.find(s => s.blank && s.isConn);
  assert.ok(seg, 'buco-relazione presente');
  assert.equal(seg.choices.length, 3);
  const low = seg.choices.map(x => x.toLowerCase());
  assert.ok(low.some(o => o.indexOf('invece') === 0), 'soluzione «invece …» presente: ' + JSON.stringify(seg.choices));
  // distrattori = preposizioni di ALTRE famiglie (grammaticalmente plausibili)
  assert.ok(low.some(o => o.indexOf('a causa') === 0 || o.indexOf('grazie') === 0), 'distrattore prep altra famiglia');
});

test('makeCloze choices: connettivo CONGIUNZIONE (perché) → nessun distrattore stessa-classe altra-famiglia → buco-relazione scartato in modalità scelta', () => {
  // le congiunzioni causali sono tutte «trasformazione»: niente distrattore
  // grammaticalmente plausibile di ALTRA famiglia → il buco-relazione non diventa a scelta
  const text = 'La carta economica si diffuse ovunque perché la pergamena costosa restava rara e preziosa.';
  const r = C.makeCloze(text, ['carta economica', 'pergamena costosa', 'papiro', 'tavoletta', 'stracci'], { max: 3, seed: 'r', connectives: true, choices: true });
  const connSeg = r.segments.find(s => s.blank && s.isConn);
  assert.strictEqual(connSeg, undefined, 'il buco-congiunzione non deve avere opzioni banali');
  // resta almeno un concetto a scelta
  assert.ok(r.segments.some(s => s.blank && s.choices));
});

test('makeCloze choices: deterministico a parità di seed', () => {
  const text = 'La Fotosintesi produce lo zucchero per la crescita continua della pianta verde.';
  const a = C.makeCloze(text, ['Fotosintesi', 'zucchero', 'Clorofilla', 'radice'], { max: 2, seed: 'z', choices: true });
  const b = C.makeCloze(text, ['Fotosintesi', 'zucchero', 'Clorofilla', 'radice'], { max: 2, seed: 'z', choices: true });
  assert.deepEqual(a.segments.filter(s => s.blank).map(s => s.choices),
    b.segments.filter(s => s.blank).map(s => s.choices));
});
