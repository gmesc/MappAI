'use strict';
/* 0104 (ADR 0023) — il piano della riorganizzazione di «MappAI - file».
   Un caso per riga della batteria del §6 del packet. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const R = require('../public/js/mappai-riordino-core.js');
const FC = require('../public/js/mappai-files-core.js');

const PID = 'proj_1790000000001';
const d = (nome, extra) => Object.assign({ nome, dir: true }, extra || {});
const f = (nome) => ({ nome, dir: false });
const da = (piano, ...seg) => piano.spostamenti.find(s => s.da.join('/') === seg.join('/'));
const conflitto = (piano, ...seg) => piano.conflitti.find(s => s.da.join('/') === seg.join('/'));

/* Il «MappAI - file» di Giacomo al 16/10, ridotto. */
function casaDiGiacomo() {
  return {
    radice: [d('Allievi'), d('Analisi'), d('Archivio'), d('Attività di studio'), d('Classi'), d('Diagnostica'),
      d('ESEMPI'), d('Mappe'), d('Registro consumi AI'), f('APERTUS prova.log'), f('note.rtf'), f('.DS_Store')],
    mappe: {
      voci: [d('4R'), d('Generico'), d('Svizzera piatta'), d('Chat'), f('mm_1a_guerra_mondiale.json'), f('kg_clima.json'), f('altro.txt')],
      progetti: [
        { seg: ['4R', 'Scienze', 'Elettricità'], classDir: '4R', discDir: 'Scienze', materia: 'Scienze', projectId: PID },
        { seg: ['4R', 'Il Nazismo'], classDir: '4R', discDir: null, materia: 'Storia' },
        { seg: ['Generico', 'Il Sale'], classDir: null, discDir: null, materia: 'Scienze' },
        { seg: ['Generico', 'Appunti'], classDir: null, discDir: null, materia: '' },
        { seg: ['Svizzera piatta'], classDir: null, discDir: null }
      ]
    },
    classi: [f('classi.json'), d('4R', { figli: [f('credenziali-4R.pdf'), f('foto.png')] }), d('1A', { figli: [f('credenziali-1A.pdf')] })],
    allievi: [d('Marco', { figli: [d('Mappe'), f('credenziali-Marco.pdf')],
      progetti: [{ nome: 'Frazioni', materia: 'Matematica', projectId: 'proj_1790000000002' }, { nome: 'Diario', materia: '' }] })]
  };
}

test('progetto di classe con materia: Mappe/<classe>/<materia>/<p> → Classi/<classe>/<materia>/<p>, col projectId', () => {
  const p = R.piano(casaDiGiacomo());
  const s = da(p, 'Mappe', '4R', 'Scienze', 'Elettricità');
  assert.deepEqual(s.a, ['Classi', '4R', 'Scienze', 'Elettricità']);
  assert.equal(s.tipo, 'progetto');
  assert.equal(s.projectId, PID);
});

test('progetto di classe senza materia: resta al livello della classe (la materia dichiarata non inventa cartelle)', () => {
  assert.deepEqual(da(R.piano(casaDiGiacomo()), 'Mappe', '4R', 'Il Nazismo').a, ['Classi', '4R', 'Il Nazismo']);
});

test('Generico con materia dichiarata → Classi/Senza classe/<materia>/<p>; senza → Classi/Senza classe/<p> (N4)', () => {
  const p = R.piano(casaDiGiacomo());
  assert.deepEqual(da(p, 'Mappe', 'Generico', 'Il Sale').a, ['Classi', 'Senza classe', 'Scienze', 'Il Sale']);
  assert.deepEqual(da(p, 'Mappe', 'Generico', 'Appunti').a, ['Classi', 'Senza classe', 'Appunti']);
});

test('vault piatto storico → Classi/Senza classe/<p> (N8)', () => {
  assert.deepEqual(da(R.piano(casaDiGiacomo()), 'Mappe', 'Svizzera piatta').a, ['Classi', 'Senza classe', 'Svizzera piatta']);
});

test('Mappe/Senza classe/<materia>/<p> (nato con N5 prima della riorganizzazione) → Classi/Senza classe/<materia>/<p>', () => {
  const p = R.piano({ mappe: { voci: [], progetti: [{ seg: ['Senza classe', 'Storia', 'Roma'], classDir: null, discDir: 'Storia' }] } });
  assert.deepEqual(p.spostamenti[0].a, ['Classi', 'Senza classe', 'Storia', 'Roma']);
});

test('progetto di un allievo con e senza materia: fuori da Mappe/ (N4)', () => {
  const p = R.piano(casaDiGiacomo());
  assert.deepEqual(da(p, 'Allievi', 'Marco', 'Mappe', 'Frazioni').a, ['Allievi', 'Marco', 'Matematica', 'Frazioni']);
  assert.equal(da(p, 'Allievi', 'Marco', 'Mappe', 'Frazioni').projectId, 'proj_1790000000002');
  assert.deepEqual(da(p, 'Allievi', 'Marco', 'Mappe', 'Diario').a, ['Allievi', 'Marco', 'Diario']);
});

test('la «Mappe» vuota di un allievo senza progetti si toglie; la sua cartella no', () => {
  const p = R.piano({ allievi: [d('Anna', { figli: [d('Mappe')], progetti: [], mappeVuota: true })] });
  assert.deepEqual(p.vuoteDaTogliere, [['Allievi', 'Anna', 'Mappe']]);
  assert.deepEqual(p.spostamenti, []);
});

test('credenziali di classe e tessera di allievo → Classi/Credenziali, piatte (bivi 7-8); gli altri file della classe restano', () => {
  const p = R.piano(casaDiGiacomo());
  assert.deepEqual(da(p, 'Classi', '4R', 'credenziali-4R.pdf').a, ['Classi', 'Credenziali', 'credenziali-4R.pdf']);
  assert.deepEqual(da(p, 'Classi', '1A', 'credenziali-1A.pdf').a, ['Classi', 'Credenziali', 'credenziali-1A.pdf']);
  assert.deepEqual(da(p, 'Allievi', 'Marco', 'credenziali-Marco.pdf').a, ['Classi', 'Credenziali', 'credenziali-Marco.pdf']);
  assert.equal(da(p, 'Classi', '4R', 'foto.png'), undefined);
});

test('classi.json → Sistema/classi.json (bivio 6)', () => {
  const s = da(R.piano(casaDiGiacomo()), 'Classi', 'classi.json');
  assert.deepEqual(s.a, ['Sistema', 'classi.json']);
  assert.equal(s.tipo, 'classi-json');
});

test('cartelle di sistema in Sistema/, Diagnostica per prima; Archivio sì, Analisi no (bivi 2-3, N3)', () => {
  const p = R.piano(casaDiGiacomo());
  assert.deepEqual(p.spostamenti[0], { da: ['Diagnostica'], a: ['Sistema', 'Diagnostica'], tipo: 'sistema' });
  for (const n of ['Registro consumi AI', 'Attività di studio', 'Archivio']) assert.deepEqual(da(p, n).a, ['Sistema', n]);
  assert.equal(da(p, 'Analisi'), undefined);
  assert.ok(p.intatti.some(x => x.join('/') === 'Analisi'));
});

test('Giardini: vuota si toglie, piena va in Sistema/Giardini (bivio 4)', () => {
  const vuota = R.piano({ radice: [d('Giardini', { vuota: true })] });
  assert.deepEqual(vuota.spostamenti, []);
  assert.deepEqual(vuota.vuoteDaTogliere, [['Giardini']]);
  const piena = R.piano({ radice: [d('Giardini', { vuota: false }), d('File condivisi')] });
  assert.deepEqual(da(piena, 'Giardini').a, ['Sistema', 'Giardini']);
  assert.deepEqual(da(piena, 'File condivisi').a, ['Sistema', 'File condivisi']);
});

test('le copie mm_/kg_*.json → Sistema/Copie delle mappe (N1); i contenitori di ripiego → Sistema/<nome> (N2)', () => {
  const p = R.piano(casaDiGiacomo());
  assert.deepEqual(da(p, 'Mappe', 'mm_1a_guerra_mondiale.json').a, ['Sistema', 'Copie delle mappe', 'mm_1a_guerra_mondiale.json']);
  assert.deepEqual(da(p, 'Mappe', 'kg_clima.json').a, ['Sistema', 'Copie delle mappe', 'kg_clima.json']);
  assert.deepEqual(da(p, 'Mappe', 'Chat').a, ['Sistema', 'Chat']);
});

test('file e cartelle sconosciuti non si toccano (bivio 5)', () => {
  const p = R.piano(casaDiGiacomo());
  const intatti = p.intatti.map(x => x.join('/'));
  for (const n of ['ESEMPI', 'Analisi', 'APERTUS prova.log', 'note.rtf', 'Mappe/altro.txt']) assert.ok(intatti.includes(n), n);
  assert.ok(!p.spostamenti.some(s => /ESEMPI|APERTUS|rtf|altro\.txt/.test(s.da.join('/'))));
  assert.ok(!intatti.includes('.DS_Store'));
});

test('il log della 010 nella radice → Sistema/Diagnostica', () => {
  assert.deepEqual(da(R.piano({ radice: [f('migrazione-log.json')] }), 'migrazione-log.json').a, ['Sistema', 'Diagnostica', 'migrazione-log.json']);
});

test('conflitto: la destinazione esiste già → il pezzo non si sposta e lo si dice', () => {
  const p = R.piano(casaDiGiacomo(), { esiste: a => a.join('/') === 'Classi/4R/Scienze/Elettricità' });
  assert.equal(da(p, 'Mappe', '4R', 'Scienze', 'Elettricità'), undefined);
  assert.equal(conflitto(p, 'Mappe', '4R', 'Scienze', 'Elettricità').motivo, 'destinazione-esiste');
});

test('conflitto: nome non valido su Windows', () => {
  const p = R.piano({ mappe: { voci: [], progetti: [{ seg: ['4R', 'Che cos\'è?'], classDir: '4R' }] } });
  assert.equal(p.spostamenti.length, 0);
  assert.equal(p.conflitti[0].motivo, 'nome-non-valido');
});

test('conflitto: una classe che si chiama «Credenziali»', () => {
  const p = R.piano({ mappe: { voci: [], progetti: [{ seg: ['Credenziali', 'X'], classDir: 'Credenziali' }] } });
  assert.equal(p.spostamenti.length, 0);
  assert.equal(p.conflitti[0].motivo, 'classe-riservata');
});

test('conflitto: due progetti verso lo stesso posto — va il primo', () => {
  const p = R.piano({ mappe: { voci: [], progetti: [
    { seg: ['Generico', 'Roma'], classDir: null }, { seg: ['Roma'], classDir: null }] } });
  assert.equal(p.spostamenti.length, 1);
  assert.deepEqual(p.spostamenti[0].da, ['Mappe', 'Generico', 'Roma']);
  assert.equal(p.conflitti[0].motivo, 'stessa-destinazione');
});

test('migrazione 010 ancora da fare: radice con le sole cartelle vecchie e vuote, niente progetti → solo sistema', () => {
  const p = R.piano({ radice: [d('Mappe'), d('Classi'), d('Attività di studio'), d('File condivisi'), d('Giardini', { vuota: true })],
    mappe: { voci: [], progetti: [] }, classi: [], allievi: [] });
  assert.deepEqual(p.spostamenti.map(s => s.a.join('/')), ['Sistema/Attività di studio', 'Sistema/File condivisi']);
  assert.deepEqual(p.conflitti, []);
});

test('riorganizzazione già fatta: zero spostamenti', () => {
  const p = R.piano({ radice: [d('Allievi'), d('Classi'), d('Sistema')],
    mappe: null,
    classi: [d('Credenziali', { figli: [f('credenziali-4R.pdf')] }), d('Senza classe'), d('4R', { figli: [d('Scienze')] })],
    allievi: [d('Marco', { figli: [d('Matematica')], progetti: [] })] });
  assert.deepEqual(p.spostamenti, []);
  assert.deepEqual(p.conflitti, []);
  assert.deepEqual(p.cartelle, [['Allievi'], ['Classi'], ['Sistema']]);
});

test('riorganizzazione a metà: solo ciò che resta', () => {
  const p = R.piano({ radice: [d('Allievi'), d('Classi'), d('Sistema'), d('Mappe')],
    mappe: { voci: [d('4R')], progetti: [{ seg: ['4R', 'Storia', 'Roma'], classDir: '4R', discDir: 'Storia' }] },
    classi: [d('Credenziali'), d('4R', { figli: [d('Scienze')] })], allievi: [] });
  assert.deepEqual(p.spostamenti.map(s => s.a.join('/')), ['Classi/4R/Storia/Roma']);
});

test('pianoInverso: gli spostamenti in piedi, rovesciati e in ordine inverso; conflitto se il posto di prima è occupato', () => {
  const registro = { giri: [
    { verso: 'avanti', fatti: [{ da: ['Diagnostica'], a: ['Sistema', 'Diagnostica'], tipo: 'sistema' },
      { da: ['Mappe', '4R', 'X'], a: ['Classi', '4R', 'X'], tipo: 'progetto', projectId: PID }] },
    { verso: 'avanti', fatti: [{ da: ['Mappe', 'Y'], a: ['Classi', 'Senza classe', 'Y'], tipo: 'progetto' }] }] };
  const inv = R.pianoInverso(registro);
  assert.deepEqual(inv.spostamenti.map(s => s.a.join('/')), ['Mappe/Y', 'Mappe/4R/X', 'Diagnostica']);
  assert.equal(inv.spostamenti[1].projectId, PID);
  const occupato = R.pianoInverso(registro, { esiste: a => a.join('/') === 'Mappe/Y' });
  assert.equal(occupato.spostamenti.length, 2);
  assert.equal(occupato.conflitti[0].motivo, 'destinazione-esiste');
  // dopo un ritorno indietro non c'è più niente da rovesciare
  registro.giri.push({ verso: 'indietro', fatti: inv.spostamenti });
  assert.deepEqual(R.pianoInverso(registro).spostamenti, []);
  assert.equal(R.spostamentiFatti(registro).length, 6);
});

test('riepilogo: spostati dall\'ultimo ritorno, rimasti dell\'ultimo giro col motivo', () => {
  assert.equal(R.riepilogo(null), null);
  const reg = { giri: [
    { verso: 'avanti', fine: '2026-10-16T08:00:00Z', fatti: [{ da: ['A'], a: ['S', 'A'] }, { da: ['B'], a: ['S', 'B'] }],
      conflitti: [{ da: ['Mappe', 'X'], motivo: 'destinazione-esiste' }], falliti: [{ da: ['Mappe', 'Y'], errore: 'EXDEV' }] },
    { verso: 'avanti', fine: '2026-10-17T08:00:00Z', fatti: [{ da: ['Mappe', 'Y'], a: ['Classi', 'Y'] }],
      conflitti: [{ da: ['Mappe', 'X'], motivo: 'destinazione-esiste' }], falliti: [] }] };
  const r = R.riepilogo(reg);
  assert.equal(r.spostati, 3);
  assert.equal(r.quando, '2026-10-17T08:00:00Z');
  assert.equal(r.tornataIndietro, false);
  assert.deepEqual(r.rimasti, [{ da: 'Mappe/X', motivo: 'destinazione-esiste' }]);
  reg.giri.push({ verso: 'indietro', fine: '2026-10-18T08:00:00Z', fatti: [{}, {}, {}], conflitti: [], falliti: [] });
  const i = R.riepilogo(reg);
  assert.equal(i.tornataIndietro, true);
  assert.equal(i.spostati, 3);
  assert.deepEqual(i.rimasti, []);
});

test('riparaDir: il vault.json segue il progetto spostato (coppia più lunga), il resto non cambia', () => {
  const coppie = [{ da: '/F/Mappe/4R', a: '/F/Classi/4R' }, { da: '/F/Mappe/4R/Scienze/Elettricità', a: '/F/Classi/4R/Scienze/Elettricità' }];
  assert.equal(R.riparaDir('/F/Mappe/4R/Scienze/Elettricità', coppie), '/F/Classi/4R/Scienze/Elettricità');
  assert.equal(R.riparaDir('/F/Mappe/4R/Scienze/Elettricità/Materiale Studio', coppie), '/F/Classi/4R/Scienze/Elettricità/Materiale Studio');
  assert.equal(R.riparaDir('/F/Mappe/4RB/X', coppie), null);
  assert.equal(R.riparaDir('', coppie), null);
  assert.equal(R.riparaDir('C:\\F\\Mappe\\4R\\X', [{ da: 'C:\\F\\Mappe\\4R', a: 'C:\\F\\Classi\\4R' }]), 'C:\\F\\Classi\\4R\\X');
});

test('assoluto: il separatore della radice', () => {
  assert.equal(R.assoluto('/Users/x/MappAI - file', ['Classi', '4R']), '/Users/x/MappAI - file/Classi/4R');
  assert.equal(R.assoluto('C:\\Users\\x\\MappAI - file', ['Classi', '4R']), 'C:\\Users\\x\\MappAI - file\\Classi\\4R');
});

test('i nomi stanno in FilesCore', () => {
  assert.equal(FC.SUB.system, 'Sistema');
  assert.equal(FC.CREDENZIALI, 'Credenziali');
  assert.equal(FC.SENZA_CLASSE, 'Senza classe');
  assert.deepEqual(FC.RADICE_V2, ['Allievi', 'Classi', 'Sistema']);
  assert.equal(FC.SISTEMA_DA_RADICE[0], 'Diagnostica');
});
