'use strict';
/*
 * ordine-elenchi-0124.test.js — packet 0124, lotto 2.
 *
 * Giacomo, 24/10: «negli elenchi dei menu a tendina di CHI e COSA (nel box di CREA,
 * nella sidebar, e nelle briciole) mostra gli elenchi di calssi e materie sempre e solo
 * in ordine alfabetico o numerico crescente.» E: «togli «+ Nuova materia» da INSEGNA,
 * ELABORA e CREA.»
 *
 * Una regola sola (`MappAIConsoleBento.ordinaElenco`, inv. 6), provata qui; `specContesto`
 * (briciole, sidebar, briciola della landing) la usa, e la usa il box di CREA.
 * L'ordine salvato (classi.json, profilo) non cambia: si ordina solo quel che si mostra.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const CB = require('../public/js/mappai-console-bento.js');

test('0124 L2 ordine: crescente «naturale» — i numeri come numeri, maiuscole e accenti non contano', () => {
  const classi = ['3B', '10A', '2a', '1C'];
  assert.deepEqual(CB.ordinaElenco(classi), ['1C', '2a', '3B', '10A']);
  assert.deepEqual(classi, ['3B', '10A', '2a', '1C'], 'l\'elenco di partenza non si tocca');
  assert.deepEqual(CB.ordinaElenco(['storia', 'Geografia', 'Éducation civique', 'Arte']), ['Arte', 'Éducation civique', 'Geografia', 'storia']);
  const oggetti = [{ id: 'x', name: '4R' }, { id: 'y', name: '1A' }];
  assert.deepEqual(CB.ordinaElenco(oggetti, 'name').map(o => o.id), ['y', 'x']);
  assert.deepEqual(CB.ordinaElenco(null), []);
});

/* specContesto legge window, localStorage e document quando la si chiama: qui finti */
function conAmbiente(attiva, fn) {
  const prima = { window: global.window, localStorage: global.localStorage, document: global.document };
  const classi = [{ id: 'a', name: '3B' }, { id: 'b', name: '10A' }, { id: 'c', name: '2a' }];
  global.localStorage = { getItem: () => '1', setItem() {} };
  global.document = { querySelectorAll: () => [], documentElement: { dataset: {} } };
  global.window = {
    MappAIClasses: {
      list: () => classi, getActive: () => attiva ? classi[0] : null, activeDiscipline: () => '', activeStudentName: () => '',
      disciplineChoices: () => ['storia', 'Geografia', 'Arte']
    },
    MappAITeacherProfile: { disciplineList: () => ['Scienze', 'arte', 'Musica'] },
    appState: { allProfiles: [{ nickname: 'Zoe' }, { nickname: 'anna', grade: '3' }] }
  };
  try { return fn(); } finally { Object.assign(global, prima); if (prima.window === undefined) delete global.window; if (prima.localStorage === undefined) delete global.localStorage; if (prima.document === undefined) delete global.document; }
}
const cb = { onGenerico() {}, onClasse() {}, onAllievo() {}, onMateria() {}, onNuovaMateria() {} };

test('0124 L2 ordine: specContesto (briciole e sidebar) — classi, allievi e materie in ordine; «Generico» in testa', () => {
  conAmbiente(true, () => {
    const liv = CB.specContesto(cb, { sempre: true });
    const achi = liv.find(l => l.menu && l.menu.tipo === 'colonne');
    assert.deepEqual(achi.menu.colonne[0].voci.map(v => v.et), ['Generico']);
    assert.deepEqual(achi.menu.colonne[1].voci.map(v => v.et), ['2a', '3B', '10A']);
    assert.deepEqual(achi.menu.colonne[2].voci.map(v => v.et), ['anna — 3', 'Zoe']);
    const mat = liv[liv.length - 1];
    assert.deepEqual(mat.menu.voci.map(v => v.et), ['Arte', 'Geografia', 'storia']);
  });
});

test('0124 L2: niente «+ Nuova materia» nel menu «Materia», con o senza classe', () => {
  [true, false].forEach(attiva => conAmbiente(attiva, () => {
    const mat = CB.specContesto(cb, { sempre: true }).slice(-1)[0];
    assert.ok(!mat.menu.nuovo, 'classe attiva: ' + attiva);
    if (!attiva) assert.deepEqual(mat.menu.voci.map(v => v.et), ['arte', 'Musica', 'Scienze']);
  }));
});

test('0124 L2 ordine: il box di CREA passa dalla stessa regola (classi, allievi, materie)', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'mappai-costruisci-manifesto.js'), 'utf8');
  const corpo = (nome) => { const i = src.indexOf('function ' + nome + '('); assert.ok(i >= 0, nome); return src.slice(i, src.indexOf('\n    }\n', i)); };
  assert.match(corpo('opzioniClassi'), /ordinaElenco\(/);
  assert.match(corpo('materieDi'), /ordinaElenco\(/);
  const chi = src.slice(src.indexOf("t('mn_chi_vuoto', 'scegli')"), src.indexOf("t('mn_chi_vuoto', 'scegli')") + 1500);
  assert.equal((chi.match(/ordinaElenco\(/g) || []).length >= 2, true, 'classi e allievi del campo «Chi»');
});
