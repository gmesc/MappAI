'use strict';
/*
 * fonti-core.test.js — dove sta il PDF della fonte (packet 0059, ADR 0011 rev. 1).
 * Node puro: la regola di lettura (B2 «per nome»), chi si scrive e dove, quale
 * `vaultRel` entra nell'indice, adottare un file uguale o prendere il primo nome
 * libero, e in quale cartella la revisione trova il PDF di un titolo.
 * L'I/O (ELABORA, `mappai-vault-io.js`) si prova a parte: tests/elabora-fonti.test.js.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const JS = f => path.join(__dirname, '..', 'public', 'js', f);
const FC = require(JS('mappai-fonti-core.js'));
const PC = require(JS('mappai-pipeline-core.js'));
/* La `trovaPdf` VERA della revisione: `pdfPerTitolo` la riceve da fuori, e va
   provata con quella, non solo con una finta che le somiglia. */
const trovaPdf = require(JS('mappai-review-fonte.js')).trovaPdf;

const VAULT = '/Users/prova/Documents/MappAI - file/Mappe/4R/Storia/Guerra Fredda';
const ALTRO = '/Users/prova/Documents/MappAI - file/Mappe/4R/Storia/Guerra Fredda · 02';
/* Le forme degli elenchi come le restituiscono i due IPC (main.js:1285 e :1267). */
const inFonti = name => ({ name, relPath: 'Fonti/' + name, size: 100, ext: (path.extname(name) || '').slice(1).toLowerCase() });
const inAllegatiEl = (name, size) => ({ name, relPath: 'Materiale Studio/' + name, size: size || 100 });
const NFD = s => s.normalize('NFD');

// ── 1. fontiDaRipristinare, casi comuni ─────────────────────────────────────

test('ripristino: con l’indice valgono le sue voci, col testo accanto', () => {
  const indice = { schema: 'mappai-fonti@1', fonti: [{ id: 'src1', tipo: 'pdf', nome: 'x.pdf', vaultRel: 'Fonti/x.pdf', testoRel: 'Fonti/x.txt' }] };
  const voci = FC.fontiDaRipristinare({ indice, fonti: [inFonti('x.pdf'), inFonti('x.txt'), inFonti('fonti.json')] }, VAULT);
  assert.equal(voci.length, 1);
  assert.deepEqual(voci[0], { id: 'src1', type: 'pdf', name: 'x.pdf', vaultRel: 'Fonti/x.pdf', testoRel: 'Fonti/x.txt', vaultDi: VAULT });
});

test('ripristino: una voce dell’indice senza id né tipo prende i valori di prima', () => {
  const voci = FC.fontiDaRipristinare({ indice: { fonti: [{ nome: 'Appunti' }, null] } }, VAULT);
  assert.equal(voci.length, 1);
  assert.equal(voci[0].id, 'src0');
  assert.equal(voci[0].type, 'text');
  assert.equal(voci[0].vaultRel, '');
  assert.equal(voci[0].testoRel, '');
});

test('ripristino: senza indice, i PDF di Fonti/ (gradino 2) — né l’indice né i .txt', () => {
  const voci = FC.fontiDaRipristinare({ indice: null, fonti: [inFonti('y.pdf'), inFonti('y.txt'), inFonti('fonti.json')] }, VAULT);
  assert.deepEqual(voci, [{ id: 'vault-0', type: 'pdf', name: 'y.pdf', vaultRel: 'Fonti/y.pdf', testoRel: '', vaultDi: VAULT }]);
});

test('ripristino: un indice senza l’elenco `fonti` vale come assente (gradino 2)', () => {
  const voci = FC.fontiDaRipristinare({ indice: { schema: 'mappai-fonti@1' }, fonti: [inFonti('y.pdf')] }, VAULT);
  assert.equal(voci.length, 1);
  assert.equal(voci[0].vaultRel, 'Fonti/y.pdf');
});

test('ripristino: solo Allegati/ con un PDF e una foto → il solo PDF, in sola lettura', () => {
  const voci = FC.fontiDaRipristinare({ indice: null, fonti: [], allegati: [inAllegatiEl('x.pdf'), inAllegatiEl('foto.jpg')] }, VAULT);
  assert.equal(voci.length, 1);
  assert.equal(voci[0].name, 'x.pdf');
  assert.equal(voci[0].type, 'pdf');
  assert.equal(voci[0].daAllegati, true);
  assert.equal(voci[0].vaultRel, 'Allegati/x.pdf');
  assert.equal(voci[0].vaultDi, VAULT);
});

test('ripristino: il relPath «Materiale Studio/…» dell’elenco di Allegati/ non si usa, il percorso si ricompone', () => {
  const [v] = FC.fontiDaRipristinare({ allegati: [{ name: 'x.pdf', relPath: 'Materiale Studio/x.pdf', size: 7 }] }, VAULT);
  assert.equal(v.vaultRel, 'Allegati/x.pdf');
  assert.ok(!/Materiale Studio/.test(JSON.stringify(v)));
});

test('ripristino: niente → nessuna voce, anche con argomenti mancanti o storti', () => {
  assert.deepEqual(FC.fontiDaRipristinare({ indice: null, fonti: [], allegati: [] }, VAULT), []);
  assert.deepEqual(FC.fontiDaRipristinare({}, VAULT), []);
  assert.deepEqual(FC.fontiDaRipristinare(undefined, VAULT), []);
  assert.deepEqual(FC.fontiDaRipristinare({ fonti: null, allegati: 'x.pdf' }, VAULT), []);
  assert.deepEqual(FC.fontiDaRipristinare({ fonti: [null, { size: 3 }], allegati: [null, {}] }, VAULT), []);
});

test('ripristino: ogni voce, da qualunque gradino e cartella, porta vaultDi = il vault passato', () => {
  const conIndice = FC.fontiDaRipristinare({
    indice: { fonti: [{ id: 'a', tipo: 'pdf', nome: 'x.pdf', vaultRel: 'Fonti/x.pdf' }, { id: 'b', tipo: 'text', nome: 'Appunti' }] },
    fonti: [inFonti('x.pdf'), inFonti('fonti.json')], allegati: [inAllegatiEl('z.pdf')]
  }, VAULT);
  const senzaIndice = FC.fontiDaRipristinare({ fonti: [inFonti('y.pdf')], allegati: [inAllegatiEl('z.pdf')] }, ALTRO);
  assert.equal(conIndice.length, 3);
  assert.equal(senzaIndice.length, 2);
  assert.ok(conIndice.every(v => v.vaultDi === VAULT));
  assert.ok(senzaIndice.every(v => v.vaultDi === ALTRO));
});

// ── 1-bis. fontiDaRipristinare, B2 «per nome» ───────────────────────────────

test('B2: Fonti/y.pdf e Allegati/x.pdf → tutte e due, x.pdf da Allegati/', () => {
  const voci = FC.fontiDaRipristinare({ fonti: [inFonti('y.pdf')], allegati: [inAllegatiEl('x.pdf')] }, VAULT);
  assert.deepEqual(voci.map(v => v.vaultRel), ['Fonti/y.pdf', 'Allegati/x.pdf']);
  assert.equal(!!voci[0].daAllegati, false);
  assert.equal(voci[1].daAllegati, true);
});

test('B2: Fonti/x.pdf e Allegati/X.pdf → una voce sola, da Fonti/ (senza maiuscole)', () => {
  const voci = FC.fontiDaRipristinare({ fonti: [inFonti('x.pdf')], allegati: [inAllegatiEl('X.pdf')] }, VAULT);
  assert.equal(voci.length, 1);
  assert.equal(voci[0].vaultRel, 'Fonti/x.pdf');
  assert.equal(!!voci[0].daAllegati, false);
});

test('B2: il vault nuovo con la spunta (indice con Fonti/x.pdf, copia in Allegati/) → una voce sola, da Fonti/', () => {
  const indice = { fonti: [{ id: 's1', tipo: 'pdf', nome: 'x.pdf', vaultRel: 'Fonti/x.pdf', testoRel: 'Fonti/x.txt' }] };
  const voci = FC.fontiDaRipristinare({ indice, fonti: [inFonti('x.pdf'), inFonti('x.txt'), inFonti('fonti.json')], allegati: [inAllegatiEl('x.pdf')] }, VAULT);
  assert.equal(voci.length, 1);
  assert.equal(voci[0].id, 's1');
  assert.equal(voci[0].vaultRel, 'Fonti/x.pdf');
});

test('B2: indice con sole voci di testo, Fonti/ senza PDF, Allegati/x.pdf → le voci più x.pdf', () => {
  const indice = { fonti: [{ id: 't1', tipo: 'text', nome: 'Appunti', testoRel: 'Fonti/Appunti.txt' }, { id: 'u1', tipo: 'url', nome: 'https://esempio.ch' }] };
  const voci = FC.fontiDaRipristinare({ indice, fonti: [inFonti('fonti.json'), inFonti('Appunti.txt')], allegati: [inAllegatiEl('x.pdf')] }, VAULT);
  assert.deepEqual(voci.map(v => v.id), ['t1', 'u1', 'allegati-0']);
  assert.equal(voci[2].vaultRel, 'Allegati/x.pdf');
  assert.equal(voci[2].daAllegati, true);
});

test('B2: dopo «Aggiungi PDF» su un vault vecchio si vedono tutte e due; con lo stesso nome una sola', () => {
  const indice = { fonti: [{ id: 'n1', tipo: 'pdf', nome: 'nuovo.pdf', vaultRel: 'Fonti/nuovo.pdf' }] };
  const due = FC.fontiDaRipristinare({ indice, fonti: [inFonti('nuovo.pdf'), inFonti('fonti.json')], allegati: [inAllegatiEl('vecchio.pdf')] }, VAULT);
  assert.deepEqual(due.map(v => v.vaultRel), ['Fonti/nuovo.pdf', 'Allegati/vecchio.pdf']);
  const indice2 = { fonti: [{ id: 'n1', tipo: 'pdf', nome: 'vecchio.pdf', vaultRel: 'Fonti/vecchio.pdf' }] };
  const una = FC.fontiDaRipristinare({ indice: indice2, fonti: [inFonti('vecchio.pdf'), inFonti('fonti.json')], allegati: [inAllegatiEl('vecchio.pdf', 999)] }, VAULT);
  assert.deepEqual(una.map(v => v.vaultRel), ['Fonti/vecchio.pdf']);
});

test('B2: lo stesso nome con l’accento composto da una parte e scomposto dall’altra è lo stesso nome (trappola 25)', () => {
  const nome = 'Élites et Présent.pdf';
  assert.notEqual(NFD(nome), nome);
  const voci = FC.fontiDaRipristinare({ fonti: [inFonti(nome)], allegati: [inAllegatiEl(NFD(nome))] }, VAULT);
  assert.equal(voci.length, 1);
  assert.equal(voci[0].vaultRel, 'Fonti/' + nome);
});

test('B2: un nome solo SIMILE non basta — «x · 02.pdf» in Allegati/ resta visibile accanto a Fonti/x.pdf', () => {
  const voci = FC.fontiDaRipristinare({ fonti: [inFonti('x.pdf')], allegati: [inAllegatiEl('x · 02.pdf')] }, VAULT);
  assert.equal(voci.length, 2);
});

// ── 2. daScrivere ───────────────────────────────────────────────────────────

const PDF_CON_FILE = { isPdf: true, haFile: true };

test('daScrivere: un PDF col suo File e senza vaultRel → sì', () => {
  assert.equal(FC.daScrivere({ ...PDF_CON_FILE, vaultRel: '' }, VAULT), true);
});

test('daScrivere: vaultDi uguale al vault → no; vaultDi di un altro vault → sì (seconda generazione)', () => {
  assert.equal(FC.daScrivere({ ...PDF_CON_FILE, vaultRel: 'Fonti/x.pdf', vaultDi: VAULT }, VAULT), false);
  assert.equal(FC.daScrivere({ ...PDF_CON_FILE, vaultRel: 'Fonti/x.pdf', vaultDi: VAULT }, ALTRO), true);
});

test('daScrivere: lo stesso vault scritto con la barra finale o in un’altra forma Unicode resta lo stesso (trappola 50)', () => {
  assert.equal(FC.daScrivere({ ...PDF_CON_FILE, vaultRel: 'Fonti/x.pdf', vaultDi: VAULT + '/' }, VAULT), false);
  const v = '/Users/prova/Mappe/1A/Francese/Présent';
  assert.equal(FC.daScrivere({ ...PDF_CON_FILE, vaultRel: 'Fonti/x.pdf', vaultDi: NFD(v) }, v), false);
});

test('daScrivere: un vaultRel senza vaultDi → no, come prima dello 0059', () => {
  assert.equal(FC.daScrivere({ ...PDF_CON_FILE, vaultRel: 'Fonti/x.pdf' }, VAULT), false);
});

test('daScrivere: una fonte di Allegati/ non si scrive mai', () => {
  assert.equal(FC.daScrivere({ ...PDF_CON_FILE, daAllegati: true }, VAULT), false);
  assert.equal(FC.daScrivere({ ...PDF_CON_FILE, daAllegati: true, vaultRel: 'Allegati/x.pdf', vaultDi: ALTRO }, VAULT), false);
  assert.equal(FC.daScrivere({ ...PDF_CON_FILE, vaultRel: 'Allegati/x.pdf', vaultDi: ALTRO }, VAULT), false);
  assert.equal(FC.daScrivere({ ...PDF_CON_FILE, vaultRel: 'allegati/x.pdf' }, VAULT), false);
});

test('daScrivere: né una fonte che non è un PDF, né un PDF senza il suo File', () => {
  assert.equal(FC.daScrivere({ isPdf: false, haFile: true }, VAULT), false);
  assert.equal(FC.daScrivere({ isPdf: true, haFile: false }, VAULT), false);
  assert.equal(FC.daScrivere({ isPdf: true, haFile: false, vaultRel: 'Fonti/x.pdf', vaultDi: ALTRO }, VAULT), false);
  assert.equal(FC.daScrivere(null, VAULT), false);
});

// ── il percorso riusato: il vaultRel giusto, il file che non c'è più ────────
/* Il vault eliminato (INSEGNA › Elimina: la cartella va nel Cestino, le fonti
   restano in memoria) e ricreato allo stesso percorso da una generazione con
   lo stesso titolo: `vaultDi` coincide, il file no. Chi chiama calcola
   `presenteQui` dall'elenco di `Fonti/` del vault che scrive. */

test('presenteIn: il file di vaultRel è nell’elenco di Fonti/ (file o nomi, stessa forma); solo un percorso di Fonti/', () => {
  const elenco = [inFonti('x.pdf'), inFonti('fonti.json'), inFonti('x.txt')];
  assert.equal(FC.presenteIn('Fonti/x.pdf', elenco), true);
  assert.equal(FC.presenteIn('Fonti/x.pdf', ['x.pdf']), true, 'anche con elenchi di nomi');
  assert.equal(FC.presenteIn('Fonti/X.PDF', elenco), true, 'senza maiuscole');
  assert.equal(FC.presenteIn('Fonti/Présent.pdf', [NFD('Présent.pdf')]), true, 'accento scomposto: lo stesso nome (trappola 25)');
  assert.equal(FC.presenteIn('Fonti/y.pdf', elenco), false);
  assert.equal(FC.presenteIn('Fonti/x · 02.pdf', elenco), false, 'un nome simile non basta');
  assert.equal(FC.presenteIn('Allegati/x.pdf', [{ name: 'x.pdf' }]), false, 'solo Fonti/');
  assert.equal(FC.presenteIn('', elenco), false);
  assert.equal(FC.presenteIn(undefined, elenco), false);
  assert.equal(FC.presenteIn('Fonti/x.pdf', []), false);
  assert.equal(FC.presenteIn('Fonti/x.pdf', null), false);
});

test('daScrivere: vaultDi di QUESTO vault ma il file qui non c’è → sì (percorso riusato); c’è, o non si sa → no', () => {
  const src = { ...PDF_CON_FILE, vaultRel: 'Fonti/x.pdf', vaultDi: VAULT };
  assert.equal(FC.daScrivere({ ...src, presenteQui: false }, VAULT), true);
  assert.equal(FC.daScrivere({ ...src, presenteQui: false }, VAULT + '/'), true, 'lo stesso vault in un’altra forma');
  assert.equal(FC.daScrivere({ ...src, presenteQui: true }, VAULT), false);
  assert.equal(FC.daScrivere(src, VAULT), false, 'presenteQui assente: come prima, il file c’è');
  // un altro vault: sì, che il file con quel nome ci sia o no (lo decide poi l'adozione)
  assert.equal(FC.daScrivere({ ...src, presenteQui: true }, ALTRO), true);
  // mai senza vaultDi, senza File o da Allegati/, nemmeno col file che manca
  assert.equal(FC.daScrivere({ ...PDF_CON_FILE, vaultRel: 'Fonti/x.pdf', presenteQui: false }, VAULT), false);
  assert.equal(FC.daScrivere({ isPdf: true, haFile: false, vaultRel: 'Fonti/x.pdf', vaultDi: VAULT, presenteQui: false }, VAULT), false);
  assert.equal(FC.daScrivere({ ...PDF_CON_FILE, vaultRel: 'Allegati/x.pdf', vaultDi: VAULT, daAllegati: true, presenteQui: false }, VAULT), false);
});

test('vaultRelPerIndice: mai un vaultRel il cui file qui manca, nemmeno del vault giusto o senza vaultDi', () => {
  const src = { vaultRel: 'Fonti/x.pdf', vaultDi: VAULT };
  assert.equal(FC.vaultRelPerIndice(src, VAULT, false, false), '');
  assert.equal(FC.vaultRelPerIndice(src, VAULT, true, false), '');
  assert.equal(FC.vaultRelPerIndice({ vaultRel: 'Fonti/x.pdf' }, VAULT, false, false), '');
  assert.equal(FC.vaultRelPerIndice(src, VAULT, false, true), 'Fonti/x.pdf');
  assert.equal(FC.vaultRelPerIndice({ vaultRel: 'Fonti/x.pdf' }, VAULT, false, true), 'Fonti/x.pdf');
  // esserci non basta: un vaultRel di un altro vault, o senza vaultDi su un vault nato adesso, resta fuori
  assert.equal(FC.vaultRelPerIndice(src, ALTRO, false, true), '');
  assert.equal(FC.vaultRelPerIndice({ vaultRel: 'Fonti/x.pdf' }, VAULT, true, true), '');
  // presenteQui assente: come prima
  assert.equal(FC.vaultRelPerIndice(src, VAULT, false), 'Fonti/x.pdf');
});

/* `vault-sources-list` salta i nomi che cominciano per «.» (main.js:1291),
   mentre `safeName` il punto lo conserva: «.appunti.pdf» si scrive in Fonti/
   col suo nome, e l'elenco non lo mostra mai. Per quel nome l'elenco non dice
   né sì né no: `presenteIn` risponde undefined, e si fa come prima. */
test('presenteIn: un nome che l’elenco non può mostrare (comincia per «.») → non si sa; daScrivere e vaultRelPerIndice fanno come prima', () => {
  const elenco = [inFonti('x.pdf'), inFonti('fonti.json'), inFonti('x.txt')];   // «.appunti.pdf» c'è, ma l'elenco non lo dice
  assert.equal(FC.presenteIn('Fonti/.appunti.pdf', elenco), undefined);
  assert.equal(FC.presenteIn('Fonti/.appunti.pdf', []), undefined);
  assert.equal(FC.presenteIn('Fonti/appunti.pdf', elenco), false, 'un nome che l’elenco mostra: assente è assente');
  assert.equal(FC.presenteIn('Allegati/.appunti.pdf', elenco), false, 'solo Fonti/');
  const src = { vaultRel: 'Fonti/.appunti.pdf', vaultDi: VAULT };
  const presenteQui = FC.presenteIn(src.vaultRel, elenco);
  assert.equal(FC.daScrivere({ ...PDF_CON_FILE, ...src, presenteQui }, VAULT), false, 'non si riscrive a ogni flush');
  assert.equal(FC.vaultRelPerIndice(src, VAULT, false, presenteQui), 'Fonti/.appunti.pdf', 'resta nell’indice');
  assert.equal(FC.vaultRelPerIndice(src, VAULT, true, presenteQui), 'Fonti/.appunti.pdf', 'anche su un vault nato adesso, col vaultDi giusto');
  // un altro vault resta un altro vault
  assert.equal(FC.daScrivere({ ...PDF_CON_FILE, ...src, presenteQui }, ALTRO), true);
  assert.equal(FC.vaultRelPerIndice(src, ALTRO, false, presenteQui), '');
  // la domanda elementare, che serve anche a chi scrive (ELABORA)
  assert.equal(FC.nomeNascosto('.appunti.pdf'), true);
  assert.equal(FC.nomeNascosto('.DS_Store'), true);
  assert.equal(FC.nomeNascosto('appunti.pdf'), false);
  assert.equal(FC.nomeNascosto('x · .02.pdf'), false, 'solo il primo carattere');
  assert.equal(FC.nomeNascosto(''), false);
  assert.equal(FC.nomeNascosto(undefined), false);
});

// ── vaultRelPerIndice ──────────────────────────────────────────────────────

test('vaultRelPerIndice: vale nell’indice solo il vaultRel del vault che si scrive', () => {
  assert.equal(FC.vaultRelPerIndice({ vaultRel: 'Fonti/x.pdf', vaultDi: VAULT }, VAULT, false), 'Fonti/x.pdf');
  assert.equal(FC.vaultRelPerIndice({ vaultRel: 'Fonti/x.pdf', vaultDi: VAULT }, VAULT, true), 'Fonti/x.pdf');
  assert.equal(FC.vaultRelPerIndice({ vaultRel: 'Fonti/x.pdf', vaultDi: VAULT }, ALTRO, false), '');
  assert.equal(FC.vaultRelPerIndice({ vaultRel: 'Fonti/x.pdf', vaultDi: VAULT }, ALTRO, true), '');
});

test('vaultRelPerIndice: senza vaultDi, vuoto su un vault nato adesso, com’era su un vault che c’era', () => {
  assert.equal(FC.vaultRelPerIndice({ vaultRel: 'Fonti/x.pdf' }, VAULT, true), '');
  assert.equal(FC.vaultRelPerIndice({ vaultRel: 'Fonti/x.pdf' }, VAULT, false), 'Fonti/x.pdf');
});

test('vaultRelPerIndice: senza vaultRel, o senza fonte, niente', () => {
  assert.equal(FC.vaultRelPerIndice({ vaultRel: '', vaultDi: VAULT }, VAULT, false), '');
  assert.equal(FC.vaultRelPerIndice({ name: 'Appunti' }, VAULT, false), '');
  assert.equal(FC.vaultRelPerIndice(null, VAULT, false), '');
});

// ── vaultSpostato ──────────────────────────────────────────────────────────
/* Il vault spostato (INSEGNA › un'altra disciplina, «Organizza i file»): chi
   sposta aggiorna activeVaultPath, non il vaultDi delle fonti. */

test('vaultSpostato: il file c’è qui e non più là → lo stesso vault, spostato', () => {
  const src = { vaultRel: 'Fonti/x.pdf', vaultDi: VAULT };
  assert.equal(FC.vaultSpostato(src, ALTRO, false, { qui: [inFonti('x.pdf'), inFonti('fonti.json')], la: [] }), true);
  assert.equal(FC.vaultSpostato(src, ALTRO, false, { qui: ['x.pdf'], la: [] }), true, 'anche con elenchi di nomi');
  // maiuscole e accento scomposto: lo stesso nome (trappola 25)
  assert.equal(FC.vaultSpostato({ vaultRel: 'Fonti/Présent.pdf', vaultDi: VAULT }, ALTRO, false, { qui: [NFD('présent.pdf')], la: [] }), true);
});

test('vaultSpostato: se il file c’è ancora là è un altro vault; se qui non c’è, niente', () => {
  const src = { vaultRel: 'Fonti/x.pdf', vaultDi: VAULT };
  assert.equal(FC.vaultSpostato(src, ALTRO, false, { qui: [inFonti('x.pdf')], la: [inFonti('x.pdf')] }), false, 'due generazioni di fila');
  assert.equal(FC.vaultSpostato(src, ALTRO, false, { qui: [inFonti('x.pdf')], la: [inFonti('X.PDF')] }), false);
  assert.equal(FC.vaultSpostato(src, ALTRO, false, { qui: [inFonti('y.pdf')], la: [] }), false);
  assert.equal(FC.vaultSpostato(src, ALTRO, false, { qui: [inFonti('x · 02.pdf')], la: [] }), false, 'un nome simile non basta');
  assert.equal(FC.vaultSpostato(src, ALTRO, false, { qui: [], la: [] }), false);
  assert.equal(FC.vaultSpostato(src, ALTRO, false), false);
});

test('vaultSpostato: mai su un vault nato adesso, sullo stesso vault, senza vaultDi o vaultRel, né per Allegati/', () => {
  const E = { qui: [inFonti('x.pdf')], la: [] };
  assert.equal(FC.vaultSpostato({ vaultRel: 'Fonti/x.pdf', vaultDi: VAULT }, ALTRO, true, E), false, 'vault nato adesso');
  assert.equal(FC.vaultSpostato({ vaultRel: 'Fonti/x.pdf', vaultDi: VAULT }, VAULT + '/', false, E), false, 'lo stesso vault');
  assert.equal(FC.vaultSpostato({ vaultRel: 'Fonti/x.pdf' }, ALTRO, false, E), false, 'senza vaultDi');
  assert.equal(FC.vaultSpostato({ vaultRel: '', vaultDi: VAULT }, ALTRO, false, E), false, 'senza vaultRel');
  assert.equal(FC.vaultSpostato({ vaultRel: 'Allegati/x.pdf', vaultDi: VAULT }, ALTRO, false, E), false, 'da Allegati/');
  assert.equal(FC.vaultSpostato({ vaultRel: 'Fonti/x.pdf', vaultDi: VAULT, daAllegati: true }, ALTRO, false, E), false, 'daAllegati');
  assert.equal(FC.vaultSpostato(null, ALTRO, false, E), false);
});

// ── puoScrivereFonti e scriviIndice ─────────────────────────────────────────

test('puoScrivereFonti: vault nuovo, Fonti/ presente, «Aggiungi PDF» → sì; vault vecchio senza Fonti/ → no', () => {
  assert.equal(FC.puoScrivereFonti({ vaultNuovo: true }), true);
  assert.equal(FC.puoScrivereFonti({ fontiPresente: true }), true);
  assert.equal(FC.puoScrivereFonti({ aggiunta: true }), true);
  assert.equal(FC.puoScrivereFonti({ vaultNuovo: false, fontiPresente: false, aggiunta: false }), false);
  assert.equal(FC.puoScrivereFonti({}), false);
  assert.equal(FC.puoScrivereFonti(), false);
});

test('scriviIndice: mai un `fonti: []` dove Fonti/ non c’era; sempre dove c’è', () => {
  // voci vuote su un vault nuovo senza Fonti/: niente indice
  assert.equal(FC.scriviIndice({ voci: [], vaultNuovo: true, fontiPresente: false }), false);
  assert.equal(FC.scriviIndice({ voci: [], pdfScritto: true, fontiPresente: false }), false);
  // voci vuote con Fonti/ presente: sì (il docente può aver tolto tutte le fonti)
  assert.equal(FC.scriviIndice({ voci: [], vaultNuovo: false, fontiPresente: true }), true);
  // con delle voci: vault nuovo o PDF appena scritto
  assert.equal(FC.scriviIndice({ voci: [{ id: 'a' }], vaultNuovo: true }), true);
  assert.equal(FC.scriviIndice({ voci: [{ id: 'a' }], pdfScritto: true }), true);
  // vault vecchio senza Fonti/ e nessun PDF scritto: no, anche con delle voci
  assert.equal(FC.scriviIndice({ voci: [{ id: 'a' }], vaultNuovo: false, fontiPresente: false, pdfScritto: false }), false);
  assert.equal(FC.scriviIndice({}), false);
  assert.equal(FC.scriviIndice({ voci: null, vaultNuovo: true }), false);
});

// ── vociScrivibili ──────────────────────────────────────────────────────────

test('vociScrivibili: fuori le fonti di Allegati/, dentro testo, URL e PDF di Fonti/', () => {
  const fonti = [
    { id: 't', type: 'text', name: 'Appunti' },
    { id: 'u', type: 'url', name: 'https://esempio.ch' },
    { id: 'p', type: 'pdf', name: 'x.pdf', vaultRel: 'Fonti/x.pdf', vaultDi: VAULT },
    { id: 'n', type: 'pdf', name: 'nuovo.pdf' },
    { id: 'a', type: 'pdf', name: 'y.pdf', vaultRel: 'Allegati/y.pdf', daAllegati: true, vaultDi: VAULT },
    { id: 'b', type: 'pdf', name: 'z.pdf', vaultRel: 'Allegati/z.pdf' },
    { id: 'c', type: 'pdf', name: 'w.pdf', daAllegati: true },
    null
  ];
  assert.deepEqual(FC.vociScrivibili(fonti).map(s => s.id), ['t', 'u', 'p', 'n']);
  assert.deepEqual(FC.vociScrivibili(null), []);
  assert.deepEqual(FC.vociScrivibili(undefined), []);
});

test('inAllegati e isPdf: le due domande elementari', () => {
  assert.equal(FC.inAllegati({ daAllegati: true }), true);
  assert.equal(FC.inAllegati({ vaultRel: 'Allegati/x.pdf' }), true);
  assert.equal(FC.inAllegati({ vaultRel: 'Fonti/Allegati/x.pdf' }), false);
  assert.equal(FC.inAllegati({ vaultRel: 'Fonti/x.pdf' }), false);
  assert.equal(FC.inAllegati(null), false);
  assert.equal(FC.isPdf('x.PDF'), true);
  assert.equal(FC.isPdf('x.pdf.txt'), false);
  assert.equal(FC.isPdf(undefined), false);
});

// ── 3. gemelli e sceltaNome ────────────────────────────────────────────────

test('nome: stesso nome e stessi byte → si adotta il file che c’è', () => {
  const esistenti = [{ name: 'x.pdf', size: 100 }, { name: 'fonti.json', size: 20 }];
  const g = FC.gemelli('x.pdf', esistenti, 100);
  assert.deepEqual(g, ['x.pdf']);
  assert.deepEqual(FC.sceltaNome('x.pdf', esistenti, g), { adotta: 'x.pdf' });
});

test('nome: stesso nome e dimensione diversa → nessun gemello, si scrive « · 02»', () => {
  const esistenti = [{ name: 'x.pdf', size: 100 }];
  const g = FC.gemelli('x.pdf', esistenti, 200);
  assert.deepEqual(g, []);
  assert.deepEqual(FC.sceltaNome('x.pdf', esistenti, g), { scrivi: 'x · 02.pdf' });
});

test('nome: stessa dimensione ma byte diversi (lo dice chi chiama) → « · 02»', () => {
  const esistenti = [{ name: 'x.pdf', size: 100 }];
  assert.deepEqual(FC.gemelli('x.pdf', esistenti, 100), ['x.pdf']);
  assert.deepEqual(FC.sceltaNome('x.pdf', esistenti, []), { scrivi: 'x · 02.pdf' });
});

test('nome: « · 02» con gli stessi byte → si adotta « · 02»', () => {
  const esistenti = [{ name: 'x.pdf', size: 100 }, { name: 'x · 02.pdf', size: 200 }];
  const g = FC.gemelli('x.pdf', esistenti, 200);
  assert.deepEqual(g, ['x · 02.pdf']);
  assert.deepEqual(FC.sceltaNome('x.pdf', esistenti, g), { adotta: 'x · 02.pdf' });
});

test('nome: le maiuscole diverse fanno un gemello; il nome adottato è quello sul disco', () => {
  const esistenti = [{ name: 'X.PDF', size: 100 }];
  assert.deepEqual(FC.gemelli('x.pdf', esistenti, 100), ['X.PDF']);
  assert.deepEqual(FC.sceltaNome('x.pdf', esistenti, ['X.PDF']), { adotta: 'X.PDF' });
  // e per `nomeLibero` il nome è occupato
  assert.deepEqual(FC.sceltaNome('x.pdf', esistenti, []), { scrivi: 'x · 02.pdf' });
});

test('nome: la forma scomposta di un accento è lo stesso nome, per i gemelli e per nomeLibero (trappola 25)', () => {
  const nome = 'Présent.pdf';
  const esistenti = [{ name: NFD(nome), size: 100 }];
  assert.deepEqual(FC.gemelli(nome, esistenti, 100), [NFD(nome)]);
  assert.deepEqual(FC.sceltaNome(nome, esistenti, []), { scrivi: 'Présent · 02.pdf' });
});

test('nome: nove collisioni → « · 10», non « · 010»', () => {
  const esistenti = [{ name: 'x.pdf', size: 1 }];
  for (let n = 2; n <= 9; n++) esistenti.push({ name: 'x · 0' + n + '.pdf', size: n });
  assert.equal(esistenti.length, 9);
  assert.deepEqual(FC.gemelli('x.pdf', esistenti, 500), []);
  assert.deepEqual(FC.sceltaNome('x.pdf', esistenti, []), { scrivi: 'x · 10.pdf' });
});

test('nome: l’originale e le 98 varianti « · 02»…« · 99» → null (chi chiama non scrive)', () => {
  const esistenti = [{ name: 'x.pdf', size: 1 }];
  for (let n = 2; n <= 99; n++) esistenti.push({ name: 'x · ' + String(n).padStart(2, '0') + '.pdf', size: 1 });
  assert.equal(esistenti.length, 99);
  assert.equal(PC.nomeLibero('x.pdf', esistenti.map(e => e.name)), null);   // la fonte del «null» è nomeLibero
  assert.equal(FC.sceltaNome('x.pdf', esistenti, []), null);
  // se uno dei 99 ha gli stessi byte, si adotta: il tetto non conta
  assert.deepEqual(FC.sceltaNome('x.pdf', esistenti, ['x · 57.pdf']), { adotta: 'x · 57.pdf' });
});

test('nome: il nome libero si scrive com’è; accetta anche un elenco di sole stringhe', () => {
  assert.deepEqual(FC.sceltaNome('x.pdf', [], []), { scrivi: 'x.pdf' });
  assert.deepEqual(FC.sceltaNome('x.pdf', [{ name: 'y.pdf', size: 1 }], undefined), { scrivi: 'x.pdf' });
  assert.deepEqual(FC.sceltaNome('x.pdf', ['x.pdf'], []), { scrivi: 'x · 02.pdf' });
  assert.deepEqual(FC.sceltaNome('x.pdf', null, null), { scrivi: 'x.pdf' });
});

test('gemelli: solo il nome e le sue varianti numerate, mai un nome che gli somiglia', () => {
  const esistenti = [
    { name: 'x.pdf', size: 100 }, { name: 'x · 02.pdf', size: 100 }, { name: 'x · 010.pdf', size: 100 },
    { name: 'x altro.pdf', size: 100 }, { name: 'xx.pdf', size: 100 }, { name: 'x · 2.pdf', size: 100 },
    { name: 'x.txt', size: 100 }, { name: 'ax.pdf', size: 100 }, { name: 'x · 02 copia.pdf', size: 100 }
  ];
  // « · 010» è la forma del ciclo di prima dello 0059 (al decimo tentativo)
  assert.deepEqual(FC.gemelli('x.pdf', esistenti, 100), ['x.pdf', 'x · 02.pdf', 'x · 010.pdf']);
});

test('gemelli: i caratteri speciali del nome non diventano un’espressione regolare', () => {
  const esistenti = [{ name: 'a+b (1).pdf', size: 5 }, { name: 'aab (1).pdf', size: 5 }, { name: 'a+b (1) · 03.pdf', size: 5 }];
  assert.deepEqual(FC.gemelli('a+b (1).pdf', esistenti, 5), ['a+b (1).pdf', 'a+b (1) · 03.pdf']);
  assert.deepEqual(FC.gemelli('.*.pdf', [{ name: 'qualunque.pdf', size: 5 }], 5), []);
});

test('gemelli: senza una dimensione numerica nessun candidato; elenchi storti non rompono', () => {
  assert.deepEqual(FC.gemelli('x.pdf', [{ name: 'x.pdf' }], undefined), []);
  assert.deepEqual(FC.gemelli('x.pdf', [{ name: 'x.pdf', size: 100 }], NaN), []);
  assert.deepEqual(FC.gemelli('x.pdf', null, 100), []);
  assert.deepEqual(FC.gemelli('x.pdf', [null, { size: 100 }], 100), []);
});

// ── 4. pdfPerTitolo ────────────────────────────────────────────────────────

/* Una `trova` finta, la più stupida possibile: solo il nome identico. La regola
   di B2 non deve dipendere da quanto è furba `trovaPdf`. */
const trovaFinta = (titolo, nomi) => (nomi || []).find(n => n === titolo) || null;

for (const [nomeTrova, trova] of [['trovaPdf vera', trovaPdf], ['trova finta', trovaFinta]]) {
  test(`pdfPerTitolo (${nomeTrova}): prima Fonti/, poi Allegati/, per nome`, () => {
    const T = 'La Svizzera nella seconda guerra mondiale.pdf';
    // titolo in Fonti/
    assert.equal(FC.pdfPerTitolo(T, { fonti: [T, 'fonti.json', 'La Svizzera nella seconda guerra mondiale.txt'], allegati: [] }, trova), 'Fonti/' + T);
    // Fonti/ senza PDF, titolo in Allegati/
    assert.equal(FC.pdfPerTitolo(T, { fonti: ['fonti.json'], allegati: [T, 'foto.jpg'] }, trova), 'Allegati/' + T);
    assert.equal(FC.pdfPerTitolo(T, { allegati: [T] }, trova), 'Allegati/' + T);
    // in tutte e due → Fonti/
    assert.equal(FC.pdfPerTitolo(T, { fonti: [T], allegati: [T] }, trova), 'Fonti/' + T);
    // in nessuna → null
    assert.equal(FC.pdfPerTitolo(T, { fonti: ['Altro.pdf'], allegati: ['Ancora.pdf'] }, trova), null);
    assert.equal(FC.pdfPerTitolo(T, {}, trova), null);
    // Fonti/ con un ALTRO PDF e il titolo solo in Allegati/ → Allegati/ (B2 «per nome»)
    assert.equal(FC.pdfPerTitolo(T, { fonti: ['Appunti del docente.pdf', 'fonti.json'], allegati: [T] }, trova), 'Allegati/' + T);
  });
}

test('pdfPerTitolo: con la trovaPdf vera, il nome equivalente in Allegati/ vince su un altro PDF in Fonti/', () => {
  const T = 'La Svizzera nella seconda guerra mondiale.pdf';
  assert.equal(FC.pdfPerTitolo(T, { fonti: ['Altro.pdf'], allegati: ['la svizzera nella seconda guerra MONDIALE.pdf'] }, trovaPdf),
    'Allegati/la svizzera nella seconda guerra MONDIALE.pdf');
});

test('pdfPerTitolo: accetta anche gli elenchi come li dà il vault ({ name }), non solo i nomi', () => {
  const T = 'x.pdf';
  assert.equal(FC.pdfPerTitolo(T, { fonti: [inFonti('fonti.json')], allegati: [inAllegatiEl(T)] }, trovaPdf), 'Allegati/x.pdf');
  assert.equal(FC.pdfPerTitolo(T, { fonti: [inFonti(T)], allegati: [inAllegatiEl(T)] }, trovaPdf), 'Fonti/x.pdf');
});

test('pdfPerTitolo: senza `trova`, nessun PDF (la revisione mostra il testo archiviato)', () => {
  assert.equal(FC.pdfPerTitolo('x.pdf', { fonti: ['x.pdf'] }), null);
  assert.equal(FC.pdfPerTitolo('x.pdf', { fonti: ['x.pdf'] }, 'non una funzione'), null);
});

// ── interruttore ───────────────────────────────────────────────────────────

test('interruttoreAcceso: acceso di default, spento solo con \'0\'', () => {
  assert.equal(FC.interruttoreAcceso(null), true);
  assert.equal(FC.interruttoreAcceso(undefined), true);
  assert.equal(FC.interruttoreAcceso('1'), true);
  assert.equal(FC.interruttoreAcceso('0'), false);
});

// ── forma del core ────────────────────────────────────────────────────────────

test('core: nel renderer si registra su window e legge PipelineCore AL MOMENTO della chiamata', () => {
  const g = {};
  g.window = g;
  const ctx = vm.createContext(g);
  vm.runInContext(fs.readFileSync(JS('mappai-fonti-core.js'), 'utf8'), ctx);
  const F = g.MappAIFontiCore;
  assert.equal(typeof F, 'object');
  assert.equal(typeof F.sceltaNome, 'function');
  // senza PipelineCore la scelta del nome fallisce rumorosamente, non inventa
  let codice = '';
  try { F.sceltaNome('x.pdf', [], []); } catch (e) { codice = e.code; }
  assert.equal(codice, 'pipeline-core-assente');
  // le regole che non scelgono nomi funzionano senza
  assert.equal(F.fontiDaRipristinare({ allegati: [{ name: 'x.pdf' }] }, VAULT).length, 1);
  // adottare non chiede un nome libero: niente PipelineCore, niente errore
  assert.equal(JSON.stringify(F.sceltaNome('x.pdf', [], ['x.pdf'])), JSON.stringify({ adotta: 'x.pdf' }));
  // arriva DOPO il core: si trova lo stesso
  g.MappAIPipelineCore = PC;
  assert.equal(JSON.stringify(F.sceltaNome('x.pdf', [{ name: 'x.pdf', size: 1 }], [])), JSON.stringify({ scrivi: 'x · 02.pdf' }));
});

test('core: niente pagina, niente disco, niente cassetto del browser; e nessuna seconda nomeLibero', () => {
  const src = fs.readFileSync(JS('mappai-fonti-core.js'), 'utf8');
  const codice = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  for (const vietato of ['document.', 'electronAPI', 'localStorage', 'require(\'fs\')', 'require("fs")']) {
    assert.equal(codice.includes(vietato), false, vietato);
  }
  assert.equal(/function\s+nomeLibero/.test(codice), false);
  assert.ok(/nomeLibero\(/.test(codice));
});

test('core: esporta quello che serve a ELABORA e alla revisione', () => {
  for (const k of ['isPdf', 'inAllegati', 'fontiDaRipristinare', 'nomeNascosto', 'presenteIn', 'daScrivere', 'puoScrivereFonti', 'vociScrivibili',
    'vaultRelPerIndice', 'vaultSpostato', 'scriviIndice', 'gemelli', 'sceltaNome', 'pdfPerTitolo', 'interruttoreAcceso']) {
    assert.equal(typeof FC[k], 'function', k);
  }
});

// ── 0078: il motivo «completa» — Fonti/ alla cartella che non ce l'ha (§4.4) ──
test('0078: puoScrivereFonti — il motivo «completa» apre la scrittura; i motivi di oggi non cambiano', () => {
  assert.equal(FC.puoScrivereFonti({ completa: true }), true);
  assert.equal(FC.puoScrivereFonti({ completa: true, fontiPresente: false, vaultNuovo: false }), true);
  assert.equal(FC.puoScrivereFonti({ completa: false }), false);
  assert.equal(FC.puoScrivereFonti({ vaultNuovo: true }), true);
  assert.equal(FC.puoScrivereFonti({ fontiPresente: true }), true);
  assert.equal(FC.puoScrivereFonti({ aggiunta: true }), true);
  assert.equal(FC.puoScrivereFonti({}), false);
});

test('0078: scriviIndice — «completa» scrive l\'indice solo con delle voci: mai un `fonti: []` dove Fonti/ non c\'era', () => {
  assert.equal(FC.scriviIndice({ voci: [{ id: 'a' }], completa: true, fontiPresente: false }), true);
  assert.equal(FC.scriviIndice({ voci: [], completa: true, fontiPresente: false }), false);
  assert.equal(FC.scriviIndice({ completa: true }), false);
  assert.equal(FC.scriviIndice({ voci: [{ id: 'a' }], completa: false, fontiPresente: false }), false);
  // i chiamanti di oggi: invariati
  assert.equal(FC.scriviIndice({ voci: [{ id: 'a' }], vaultNuovo: false, fontiPresente: false, pdfScritto: false }), false);
  assert.equal(FC.scriviIndice({ voci: [], vaultNuovo: false, fontiPresente: true }), true);
});

test('0078: «completa» non ha gli effetti di vaultNuovo — vaultRelPerIndice e vaultSpostato non lo conoscono', () => {
  // una fonte di prima dello 0059 (senza vaultDi), il cui file c'è: con vaultNuovo il vaultRel cadrebbe
  const src = { vaultRel: 'Fonti/a.pdf' };
  assert.equal(FC.vaultRelPerIndice(src, '/v', false), 'Fonti/a.pdf', 'completa scrive con vaultNuovo = false');
  assert.equal(FC.vaultRelPerIndice(src, '/v', true), '', 'quello che vaultNuovo farebbe');
  assert.equal(FC.vaultRelPerIndice.length, 4, 'la firma non cambia');
  assert.equal(FC.vaultSpostato.length, 4, 'la firma non cambia');
});
