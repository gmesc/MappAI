'use strict';
/*
 * riassegna-copia-core.test.js — packet 0124, lotto 2 (ADR 0025).
 *
 * Il core puro di «Riassegna…» e «Copia…» nel menu della briciola. Giacomo, 23/10:
 * «I modali devono obbligare a scegliere una classe o un allievo e poi una materia,
 * altrimenti bloccano l'operazione.» Le scelte stanno qui (inv. 4 e 19); `main.js`
 * fa solo I/O e la UI monta il modale.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const RC = require(path.join(__dirname, '..', 'public', 'js', 'mappai-riassegna-copia-core.js'));

const CLASSI = [{ id: 'c4r', name: '4R', sede: '' }, { id: 'c3b', name: '3B', sede: 'Bedigliora' }];
const ALLIEVI = [{ nickname: 'Marco', grade: '4' }];

test('0124 L2 core: le scelte di «Classe o allievo», prima le classi poi gli allievi, nell\'ordine ricevuto', () => {
  const s = RC.scelteChi(CLASSI, ALLIEVI);
  assert.deepEqual(s.map(x => x.valore), ['c:c4r', 'c:c3b', 'a:Marco']);
  assert.deepEqual(s.map(x => x.tipo), ['classe', 'classe', 'allievo']);
  assert.equal(s[1].sede, 'Bedigliora');
  assert.equal(RC.sceltaDa('a:Marco', s).nome, 'Marco');
  assert.equal(RC.sceltaDa('', s), null);
  assert.equal(RC.sceltaDa('c:nessuna', s), null);
  assert.equal(s.some(x => /generico/i.test(x.etichetta)), false, 'niente «Generico» (Giacomo, 24/10)');
});

test('0124 L2 core: la destinazione — classe (con la sede nel nome della cartella) e allievo', () => {
  const s = RC.scelteChi(CLASSI, ALLIEVI);
  assert.deepEqual(RC.destinazione(RC.sceltaDa('c:c4r', s), 'Storia'),
    { base: 'maps', parti: ['4R', 'Storia'], classeNome: '4R', classDir: '4R', allievo: '', materia: 'Storia', discDir: 'Storia' });
  assert.deepEqual(RC.destinazione(RC.sceltaDa('c:c3b', s), 'Geografia').parti, ['Bedigliora-3B', 'Geografia']);
  assert.deepEqual(RC.destinazione(RC.sceltaDa('a:Marco', s), 'Storia'),
    { base: 'students', parti: ['Marco', 'Storia'], classeNome: '', classDir: null, allievo: 'Marco', materia: 'Storia', discDir: 'Storia' });
  assert.equal(RC.destinazione(null, 'Storia'), null);
  assert.equal(RC.destinazione(RC.sceltaDa('c:c4r', s), ''), null);
});

test('0124 L2 core: dove sta un progetto, letto dal suo percorso', () => {
  const basi = { maps: '/C/MappAI - file/Classi', students: '/C/MappAI - file/Allievi' };
  assert.deepEqual(RC.posizioneDi('/C/MappAI - file/Classi/4R/Storia/IL SALE', basi), { base: 'maps', parti: ['4R', 'Storia'] });
  assert.deepEqual(RC.posizioneDi('/C/MappAI - file/Allievi/Marco/Storia/IL SALE', basi), { base: 'students', parti: ['Marco', 'Storia'] });
  assert.deepEqual(RC.posizioneDi('C:\\U\\MappAI - file\\Classi\\4R\\IL SALE', { maps: 'C:\\U\\MappAI - file\\Classi', students: '' }), { base: 'maps', parti: ['4R'] });
  assert.equal(RC.posizioneDi('/Scrivania/IL SALE', basi), null);
});

test('0124 L2 core: l\'obbligo — classe o allievo, poi la materia; la stessa cartella è bloccata', () => {
  const s = RC.scelteChi(CLASSI, ALLIEVI);
  const qui = { base: 'maps', parti: ['4R', 'Storia'] };
  assert.equal(RC.valida(null, '', qui).ok, false);
  assert.match(RC.valida(null, '', qui).motivo, /classe o un allievo/);
  assert.equal(RC.valida(RC.sceltaDa('c:c4r', s), '', qui).ok, false);
  assert.match(RC.valida(RC.sceltaDa('c:c4r', s), '', qui).motivo, /materia/);
  const stesso = RC.valida(RC.sceltaDa('c:c4r', s), 'storia', qui);
  assert.equal(stesso.ok, false, 'maiuscole a parte, è la stessa cartella');
  assert.equal(stesso.motivo, 'Il progetto è già qui.');
  assert.deepEqual(RC.valida(RC.sceltaDa('c:c4r', s), 'Geografia', qui), { ok: true, motivo: '' });
  assert.equal(RC.valida(RC.sceltaDa('a:Marco', s), 'Storia', qui).ok, true, 'Storia di Marco non è Storia della 4R');
});

test('0124 L2 core: la riga del cassetto dopo «Riassegna» dice classe e materia nuove, il resto resta', () => {
  const s = RC.scelteChi(CLASSI, ALLIEVI);
  const riga = { id: 'proj_1', name: 'IL SALE', cls: '4R', clsId: 'c4r', classDir: '4R', disc: 'Storia', discDir: 'Storia', vault: 'IL SALE', tuned: true };
  const a = RC.rigaRiassegnata(riga, RC.destinazione(RC.sceltaDa('c:c3b', s), 'Geografia'), RC.sceltaDa('c:c3b', s));
  assert.deepEqual(a, Object.assign({}, riga, { cls: '3B', clsId: 'c3b', classDir: 'Bedigliora-3B', disc: 'Geografia', discDir: 'Geografia' }));
  const b = RC.rigaRiassegnata(riga, RC.destinazione(RC.sceltaDa('a:Marco', s), 'Storia'), RC.sceltaDa('a:Marco', s));
  assert.equal(b.cls, null); assert.equal(b.clsId, null); assert.equal(b.classDir, null);
  assert.equal(b.disc, 'Storia');
  assert.equal(riga.cls, '4R', 'la riga di partenza non si tocca');
});

test('0124 L2 core: index.yaml dice la classe e la materia nuove, ogni altra riga resta byte per byte', () => {
  const prima = 'projectId: proj_1\nextractionMode: mindmap\nclasse: 4R\nmateria: Storia\nuserProfile:\n  classe: annidata\n';
  assert.equal(RC.indiceConContesto(prima, { classe: '3B', materia: 'Geografia' }),
    'projectId: proj_1\nextractionMode: mindmap\nclasse: 3B\nmateria: Geografia\nuserProfile:\n  classe: annidata\n');
  // le chiavi che mancano vanno in fondo; CRLF e BOM restano
  const crlf = '\uFEFFprojectId: proj_1\r\nrootNodeLabel: X\r\n';
  assert.equal(RC.indiceConContesto(crlf, { classe: '4R', materia: 'Storia' }), '\uFEFFprojectId: proj_1\r\nrootNodeLabel: X\r\nclasse: 4R\r\nmateria: Storia\r\n');
  // un valore che lo YAML leggerebbe male si scrive fra virgolette; l'allievo non ha classe
  assert.equal(RC.indiceConContesto('classe: 4R\n', { classe: '', materia: 'Storia: Medioevo' }), 'classe: ""\nmateria: "Storia: Medioevo"\n');
});

test('0124 L2 core: la scheda dell\'allievo in index.yaml — sostituisce il blocco userProfile, o lo aggiunge; senza la chiave non lo tocca', () => {
  const prima = 'projectId: proj_1\nclasse: 4R\nmateria: Storia\nuserProfile:\n  nickname: ""\n  age: ""\n  grade: ""\n  system: Ticino\ncustomColors: {}\n';
  const gigi = { nickname: 'Gigi', age: '12', grade: '2', system: 'Ticino', note: 'legge piano: frasi brevi' };
  assert.equal(RC.indiceConContesto(prima, { classe: '', materia: 'Scienze', userProfile: gigi }),
    'projectId: proj_1\nclasse: ""\nmateria: Scienze\nuserProfile: {"nickname":"Gigi","age":"12","grade":"2","system":"Ticino","note":"legge piano: frasi brevi"}\ncustomColors: {}\n');
  const vuota = { nickname: '', age: '', grade: '', system: 'Ticino' };
  assert.equal(RC.indiceConContesto('projectId: proj_1\nuserProfile: {"nickname":"Gigi"}\n', { classe: '4R', materia: 'Storia', userProfile: vuota }),
    'projectId: proj_1\nuserProfile: {"nickname":"","age":"","grade":"","system":"Ticino"}\nclasse: 4R\nmateria: Storia\n');
  assert.equal(RC.indiceConContesto('projectId: proj_1\n', { classe: '4R', materia: 'Storia', userProfile: vuota }),
    'projectId: proj_1\nclasse: 4R\nmateria: Storia\nuserProfile: {"nickname":"","age":"","grade":"","system":"Ticino"}\n');
  assert.equal(RC.indiceConContesto(prima, { classe: '4R', materia: 'Storia' }), prima, 'senza userProfile nel contesto la scheda resta');
  const yaml = require('js-yaml');
  assert.deepEqual(yaml.load(RC.indiceConContesto(prima, { classe: '', materia: 'Scienze', userProfile: gigi })).userProfile, gigi, 'js-yaml lo rilegge uguale');
});

test('0124 L2 core: i pezzi del percorso di destinazione sono nomi di cartella, mai percorsi', () => {
  assert.deepEqual(RC.partiSicure(['4R', 'Storia']), ['4R', 'Storia']);
  ['..', '', '.', 'a/b', 'a\\b', null].forEach(p => assert.equal(RC.partiSicure(['4R', p]), null, JSON.stringify(p)));
  assert.equal(RC.partiSicure([]), null);
  assert.equal(RC.partiSicure('4R'), null);
});

test('0124 L2 core: la riga «Andrà in» e «Ora» con le parole delle cartelle', () => {
  assert.equal(RC.dove({ base: 'maps', parti: ['4R', 'Storia'] }, 'IL SALE', { maps: 'Classi', students: 'Allievi' }), 'Classi › 4R › Storia › IL SALE');
  assert.equal(RC.dove({ base: 'students', parti: ['Marco', 'Storia'] }, 'IL SALE', { maps: 'Classi', students: 'Allievi' }), 'Allievi › Marco › Storia › IL SALE');
});
