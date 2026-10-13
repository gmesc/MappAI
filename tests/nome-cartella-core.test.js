'use strict';
/* 0094 (ADR 0021) — il core puro del nome dalla cartella: interruttore, nome libero,
   riparazione dei percorsi di `pipeline.json` (le chiavi misurate sui vault veri il
   13/10), riga del cassetto, nomi provvisori. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const C = require('../public/js/mappai-nome-cartella-core.js');
const FC = require('../public/js/mappai-files-core.js');

const ls = v => ({ getItem: () => (v === undefined ? null : v) });

test('interruttore: acceso se manca o vale 1, spento solo con 0', () => {
  assert.equal(C.acceso(ls(undefined)), true);
  assert.equal(C.acceso(ls('1')), true);
  assert.equal(C.acceso(ls('0')), false);
  assert.equal(C.acceso(null), true);
});

test('nomeLibero: libero, preso, doppioni già numerati, maiuscole e NFC, riservati', () => {
  assert.deepEqual(C.nomeLibero('Elettricità', ['Altro']), { nome: 'Elettricità', suffisso: false });
  assert.deepEqual(C.nomeLibero('Elettricità', ['elettricità']), { nome: 'Elettricità · 02', suffisso: true });
  assert.deepEqual(C.nomeLibero('Elettricità', ['Elettricità', 'Elettricità · 02', 'Elettricità · 04']), { nome: 'Elettricità · 05', suffisso: true });
  assert.equal(C.nomeLibero('Elettricità'.normalize('NFC'), ['Elettricità'.normalize('NFD')]).suffisso, true);
  assert.deepEqual(C.nomeLibero('Generico', [], ['Generico']), { nome: 'Generico · 02', suffisso: true });
});

test('riparaPercorsi: ogni profondità, uguali e prefissi, il resto intatto, versione intatta', () => {
  const V = '/Users/g/Documents/MappAI - file/Mappe/4R/Scienze/Elettricità', N = '/Users/g/Documents/MappAI - file/Mappe/4R/Scienze/Circuiti';
  const m = {
    _storageVersion: 111, vaultPath: V,
    review: { vaultPath: V, projectId: 'proj_1', note: 'Elettricità', final: { review: { vaultPath: V },
      previous: { review: { vaultPath: V }, previous: { review: { vaultPath: V + '/' } } } },
      deliveries: [{ final: { review: { vaultPath: V } } }] },
    modelliGiro: { chiamate: [{ vaultPath: V }, { vaultPath: '/altro' }] },
    file: V + '/Materiale Studio/x.pdf', rel: 'Materiale Studio/x.pdf', simile: V + ' copia'
  };
  const r = C.riparaPercorsi(m, N, V);
  assert.equal(r.cambiati, 8);
  assert.equal(r.manifest.vaultPath, N);
  assert.equal(r.manifest.review.final.previous.previous.review.vaultPath, N);
  assert.equal(r.manifest.review.deliveries[0].final.review.vaultPath, N);
  assert.equal(r.manifest.modelliGiro.chiamate[0].vaultPath, N);
  assert.equal(r.manifest.modelliGiro.chiamate[1].vaultPath, '/altro');
  assert.equal(r.manifest.file, N + '/Materiale Studio/x.pdf');
  assert.equal(r.manifest.rel, 'Materiale Studio/x.pdf');
  assert.equal(r.manifest.simile, V + ' copia', 'un nome che comincia uguale non è un percorso dentro la cartella');
  assert.equal(r.manifest.review.note, 'Elettricità');
  assert.equal(r.manifest._storageVersion, 111);
  assert.equal(m.vaultPath, V, 'l\'originale non cambia');
});

test('riparaPercorsi senza vecchio: i percorsi che il manifesto dichiara (vault copiato, 0095)', () => {
  const m = { vaultPath: '/Users/collega/Mappe/X', review: { vaultPath: 'C:\\Users\\c\\Mappe\\X', final: { review: { vaultPath: '/Users/collega/Mappe/X' } } } };
  const r = C.riparaPercorsi(m, '/Users/g/Mappe/4R/Storia/X', null);
  assert.equal(r.cambiati, 3);
  assert.equal(r.manifest.review.vaultPath, '/Users/g/Mappe/4R/Storia/X');
  assert.equal(C.riparaPercorsi({ vaultPath: '/a' }, '/a', null).cambiati, 0, 'già a posto');
  assert.equal(C.riparaPercorsi(null, '/a').manifest, null);
});

test('rigaRinominata: vault, cartella, vaultPath della lettura, superata; il titolo resta', () => {
  const V = '/r/Mappe/4R/Italiano/Lettura-proj_1', N = '/r/Mappe/4R/Italiano/Il lupo';
  const riga = { id: 'proj_1', name: 'Il lupo e l\'agnello', vault: 'Lettura-proj_1', cartella: 'Mappe/4R/Italiano/Lettura-proj_1', vaultPath: V, superata: { cartella: V, copia: 3 } };
  const r = C.rigaRinominata(riga, { vecchio: V, nuovo: N, radice: '/r' });
  assert.equal(r.vault, 'Il lupo');
  assert.equal(r.cartella, 'Mappe/4R/Italiano/Il lupo');
  assert.equal(r.vaultPath, N);
  assert.equal(r.superata.cartella, N);
  assert.equal(r.name, 'Il lupo e l\'agnello');
  const senza = C.rigaRinominata({ id: 'p', vault: 'A', classDir: '4R' }, { vecchio: '/m/4R/A', nuovo: '/m/4R/B' });
  assert.equal(senza.vault, 'B');
  assert.equal('cartella' in senza, false);
  assert.equal('vaultPath' in senza, false);
});

test('nomi provvisori e proposta dal titolo', () => {
  assert.equal(C.nomeProvvisorio('Lettura-proj_1790000000000'), true);
  assert.equal(C.nomeProvvisorio('Sistema Solare · 02'), true);
  assert.equal(C.nomeProvvisorio('Sistema Solare'), false);
  assert.equal(C.nomeProposto('Lettura-proj_1790000000000', 'Il lupo: e l\'agnello?', FC.vaultFolderName), FC.vaultFolderName('Il lupo: e l\'agnello?'));
  assert.equal(C.nomeProposto('Sistema Solare · 02', 'Sistema Solare', FC.vaultFolderName), '', 'stesso nome senza suffisso: niente da proporre');
  assert.equal(C.nomeProposto('Sistema Solare · 02', 'I pianeti', FC.vaultFolderName), 'I pianeti');
  assert.equal(C.nomeProposto('Sistema Solare', 'I pianeti', FC.vaultFolderName), '', 'un nome normale non si tocca');
  assert.equal(C.nomeProposto('Lettura-proj_1', '', FC.vaultFolderName), '');
});

test('stessoPercorso: barre, NFC, separatore finale', () => {
  assert.equal(C.stessoPercorso('C:\\a\\b\\', 'C:/a/b'), true);
  assert.equal(C.stessoPercorso('/a/é'.normalize('NFD'), '/a/é'), true);
  assert.equal(C.stessoPercorso('', ''), false);
});
