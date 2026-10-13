'use strict';
/*
 * config-core.test.js — il formato del file «MappAI - configurazione» (packet 0064,
 * versione 1), provato sul core puro `mappai-config-core.js`.
 *
 * Il file è un contratto con il generatore esterno al repo
 * (`~/Documents/MappAI - demo Bedigliora/genera-configurazioni.js`): un JSON con
 * token e Product ID Infomaniak, modello e fasi. Il core non lancia mai, non
 * modifica il suo ingresso e, quando rifiuta, restituisce SOLO un codice: nessun
 * valore del file (il token meno di tutti) finisce in un risultato d'errore.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const Core = require('../public/js/mappai-config-core.js');

const TOKEN = 'QzX9wKtokenDiProvaPerLaDemo_0123456789';
const PREFISSO = TOKEN.slice(0, 6);

function base(over) {
  const f = {
    formato: 'mappai-configurazione',
    versione: 1,
    nome: 'BEDIGLIORA_001',
    fornitore: 'infomaniak',
    infomaniak: { token: TOKEN, productId: '105999' },
    modello: 'google/gemma-4-31B-it',
    fasi: {
      mappa: 'google/gemma-4-31B-it',
      materiali: 'google/gemma-4-31B-it',
      embeddings: 'bge_multilingual_gemma2',
      giudice: null,
      reranking: 'BAAI/bge-reranker-v2-m3'
    },
    visione: 'mistralai/Ministral-3-14B-Instruct-2512',
    creato: '2026-09-30',
    nota: 'File personale: contiene una chiave…'
  };
  return Object.assign(f, over || {});
}
const testo = o => JSON.stringify(o);
const leggi = o => Core.leggi(typeof o === 'string' ? o : testo(o));
const J = x => JSON.parse(JSON.stringify(x));

test('le costanti del formato', () => {
  assert.equal(Core.FORMATO, 'mappai-configurazione');
  assert.equal(Core.VERSIONE, 1);
  assert.deepEqual(J(Core.ESTENSIONI), ['.mappai-config', '.json']);
  assert.equal(Core.TETTO_BYTE, 65536);
  assert.equal(typeof Core.leggi, 'function');
});

test('un file valido del generatore → ok, i campi, nessun avviso', () => {
  const r = leggi(base());
  assert.equal(r.ok, true);
  assert.deepEqual(Object.keys(r.dati).sort(), ['fasi', 'modello', 'nome', 'productId', 'token', 'visione']);
  assert.equal(r.dati.nome, 'BEDIGLIORA_001');
  assert.equal(r.dati.token, TOKEN);
  assert.equal(r.dati.productId, '105999');
  assert.equal(r.dati.modello, 'google/gemma-4-31B-it');
  assert.equal(r.dati.visione, 'mistralai/Ministral-3-14B-Instruct-2512');
  assert.deepEqual(J(r.dati.fasi), {
    mappa: 'google/gemma-4-31B-it', materiali: 'google/gemma-4-31B-it',
    embeddings: 'bge_multilingual_gemma2', giudice: null, reranking: 'BAAI/bge-reranker-v2-m3'
  });
  assert.deepEqual(J(r.avvisi), []);
});

test('productId numero → stringa', () => {
  const r = leggi(base({ infomaniak: { token: TOKEN, productId: 105999 } }));
  assert.equal(r.ok, true);
  assert.equal(r.dati.productId, '105999');
});

test('un BOM in testa non rende il file illeggibile', () => {
  const r = Core.leggi('﻿' + testo(base()));
  assert.equal(r.ok, true);
});

const ERRORI = [
  ['illeggibile', 'testo non stringa (null)', null],
  ['illeggibile', 'testo non stringa (numero)', 42],
  ['illeggibile', 'testo vuoto', ''],
  ['illeggibile', 'non JSON', 'questo non è JSON {'],
  ['illeggibile', 'JSON troncato', testo(base()).slice(0, 60)],
  ['illeggibile', 'oltre TETTO_BYTE', testo(base({ nota: 'x'.repeat(70000) }))],
  ['formato', 'formato diverso', base({ formato: 'altro' })],
  ['formato', 'formato assente', (() => { const f = base(); delete f.formato; return f; })()],
  ['formato', 'JSON che non è un oggetto', '[1,2,3]'],
  ['formato', 'JSON null', 'null'],
  ['versione', 'versione assente', (() => { const f = base(); delete f.versione; return f; })()],
  ['versione', 'versione stringa "1"', base({ versione: '1' })],
  ['versione', 'versione 0', base({ versione: 0 })],
  ['versione', 'versione negativa', base({ versione: -1 })],
  ['versione', 'versione decimale', base({ versione: 1.5 })],
  ['versione-nuova', 'versione 2', base({ versione: 2 })],
  ['fornitore', 'fornitore google', base({ fornitore: 'google' })],
  ['fornitore', 'fornitore assente', (() => { const f = base(); delete f.fornitore; return f; })()],
  ['token', 'blocco infomaniak assente', (() => { const f = base(); delete f.infomaniak; return f; })()],
  ['token', 'token assente', base({ infomaniak: { productId: '105999' } })],
  ['token', 'token numero', base({ infomaniak: { token: 12345678901234567890123, productId: '105999' } })],
  ['token', 'token con uno spazio', base({ infomaniak: { token: TOKEN.slice(0, 10) + ' ' + TOKEN.slice(10), productId: '105999' } })],
  ['token', 'token corto (19 caratteri)', base({ infomaniak: { token: TOKEN.slice(0, 19), productId: '105999' } })],
  ['product', 'productId assente', base({ infomaniak: { token: TOKEN } })],
  ['product', 'productId con lettere', base({ infomaniak: { token: TOKEN, productId: '10a999' } })],
  ['product', 'productId di due cifre', base({ infomaniak: { token: TOKEN, productId: '12' } })],
  ['product', 'productId di 13 cifre', base({ infomaniak: { token: TOKEN, productId: '1234567890123' } })],
  ['product', 'productId decimale', base({ infomaniak: { token: TOKEN, productId: 105999.5 } })],
  ['product', 'productId negativo', base({ infomaniak: { token: TOKEN, productId: -105999 } })]
];

for (const [codice, caso, ingresso] of ERRORI) {
  test(`errore «${codice}»: ${caso}`, () => {
    const r = typeof ingresso === 'string' || ingresso === null || typeof ingresso === 'number'
      ? Core.leggi(ingresso) : leggi(ingresso);
    assert.equal(r.ok, false);
    assert.equal(r.codice, codice);
    const s = JSON.stringify(r);
    assert.equal(s.includes(PREFISSO), false, 'un risultato d\'errore non porta il token');
    assert.equal(s.includes('105999'), false, 'né il Product ID');
  });
}

test('l\'ordine delle regole: versione prima del fornitore, fornitore prima del token', () => {
  assert.equal(leggi(base({ versione: 2, fornitore: 'google' })).codice, 'versione-nuova');
  assert.equal(leggi(base({ fornitore: 'google', infomaniak: {} })).codice, 'fornitore');
  assert.equal(leggi(base({ infomaniak: { token: 'corto', productId: 'x' } })).codice, 'token');
  assert.equal(leggi(base({ formato: 'x', versione: 2 })).codice, 'formato');
});

test('nome non conforme o assente → stringa vuota, senza errore', () => {
  assert.equal(leggi(base({ nome: 'BEDIGLIORA 001' })).dati.nome, '');
  assert.equal(leggi(base({ nome: 'x'.repeat(41) })).dati.nome, '');
  assert.equal(leggi(base({ nome: 7 })).dati.nome, '');
  const f = base(); delete f.nome;
  const r = leggi(f);
  assert.equal(r.ok, true);
  assert.equal(r.dati.nome, '');
  assert.deepEqual(J(r.avvisi), []);
});

test('modello assente → stringa vuota, senza avviso', () => {
  const f = base(); delete f.modello;
  const r = leggi(f);
  assert.equal(r.ok, true);
  assert.equal(r.dati.modello, '');
  assert.deepEqual(J(r.avvisi), []);
});

test('modello con uno spazio → vuoto e avviso modello-ignorato, ok resta vero', () => {
  const r = leggi(base({ modello: 'google/gemma 4' }));
  assert.equal(r.ok, true);
  assert.equal(r.dati.modello, '');
  assert.deepEqual(J(r.avvisi), ['modello-ignorato']);
  const n = leggi(base({ modello: 42 }));
  assert.equal(n.dati.modello, '');
  assert.deepEqual(J(n.avvisi), ['modello-ignorato']);
  assert.deepEqual(J(leggi(base({ modello: 'ab' })).avvisi), ['modello-ignorato']);
});

test('fasi assenti → null, senza avviso', () => {
  const f = base(); delete f.fasi;
  const r = leggi(f);
  assert.equal(r.ok, true);
  assert.equal(r.dati.fasi, null);
  assert.deepEqual(J(r.avvisi), []);
});

test('fasi senza embeddings → null e avviso fasi-ignorate, ok vero', () => {
  const f = base(); delete f.fasi.embeddings;
  const r = leggi(f);
  assert.equal(r.ok, true);
  assert.equal(r.dati.fasi, null);
  assert.deepEqual(J(r.avvisi), ['fasi-ignorate']);
  assert.equal(r.dati.token, TOKEN, 'il resto del file vale');
});

test('fasi con mappa non conforme → null e avviso fasi-ignorate', () => {
  const f = base(); f.fasi.mappa = 'google/gemma 4';
  const r = leggi(f);
  assert.equal(r.ok, true);
  assert.equal(r.dati.fasi, null);
  assert.deepEqual(J(r.avvisi), ['fasi-ignorate']);
});

test('fasi che non sono un oggetto → null e avviso fasi-ignorate', () => {
  for (const v of ['google/gemma-4-31B-it', ['a'], 3]) {
    const r = leggi(base({ fasi: v }));
    assert.equal(r.ok, true);
    assert.equal(r.dati.fasi, null);
    assert.deepEqual(J(r.avvisi), ['fasi-ignorate']);
  }
});

test('giudice e reranking assenti → null; giudice non conforme → fasi-ignorate', () => {
  const f = base(); delete f.fasi.giudice; delete f.fasi.reranking;
  const r = leggi(f);
  assert.equal(r.ok, true);
  assert.equal(r.dati.fasi.giudice, null);
  assert.equal(r.dati.fasi.reranking, null);
  const g = base(); g.fasi.giudice = 'un giudice';
  const s = leggi(g);
  assert.equal(s.dati.fasi, null);
  assert.deepEqual(J(s.avvisi), ['fasi-ignorate']);
});

test('una chiave sconosciuta dentro fasi si tralascia', () => {
  const f = base(); f.fasi.traduttore = 'google/gemma-4-31B-it';
  const r = leggi(f);
  assert.equal(r.ok, true);
  assert.deepEqual(Object.keys(r.dati.fasi).sort(), ['embeddings', 'giudice', 'mappa', 'materiali', 'reranking']);
  assert.deepEqual(J(r.avvisi), []);
});

test('i due avvisi insieme, nell\'ordine: modello poi fasi', () => {
  const f = base({ modello: 'a b c' }); delete f.fasi.materiali;
  assert.deepEqual(J(leggi(f).avvisi), ['modello-ignorato', 'fasi-ignorate']);
});

test('visione (v4): assente o null → vuoto senza avviso', () => {
  const f = base(); delete f.visione;
  const r = leggi(f);
  assert.equal(r.ok, true);
  assert.equal(r.dati.visione, '');
  assert.deepEqual(J(r.avvisi), []);
  const n = leggi(base({ visione: null }));
  assert.equal(n.ok, true);
  assert.equal(n.dati.visione, '');
  assert.deepEqual(J(n.avvisi), []);
});

test('visione (v4) con uno spazio o non stringa → vuoto e avviso visione-ignorata, ok resta vero', () => {
  for (const v of ['mistralai/Ministral 3', 42, 'ab', { id: 'x' }]) {
    const r = leggi(base({ visione: v }));
    assert.equal(r.ok, true);
    assert.equal(r.dati.visione, '');
    assert.deepEqual(J(r.avvisi), ['visione-ignorata']);
    assert.equal(r.dati.token, TOKEN, 'il resto del file vale');
  }
});

test('i tre avvisi insieme, nell\'ordine: modello, fasi, visione', () => {
  const f = base({ modello: 'a b', visione: 'c d' }); delete f.fasi.mappa;
  assert.deepEqual(J(leggi(f).avvisi), ['modello-ignorato', 'fasi-ignorate', 'visione-ignorata']);
});

test('campi sconosciuti ignorati', () => {
  const r = leggi(base({ extra: { a: 1 }, chiaveGoogle: 'x', creato: 5 }));
  assert.equal(r.ok, true);
  assert.deepEqual(Object.keys(r.dati).sort(), ['fasi', 'modello', 'nome', 'productId', 'token', 'visione']);
});

test('TETTO_BYTE si misura in byte: caratteri accentati contano di più', () => {
  // ~33.000 «è» = ~66.000 byte ma solo ~33.000 caratteri
  const r = leggi(base({ nota: 'è'.repeat(33000) }));
  assert.equal(r.ok, false);
  assert.equal(r.codice, 'illeggibile');
  const s = leggi(base({ nota: 'è'.repeat(30000) }));
  assert.equal(s.ok, true);
});

test('nessun risultato d\'errore porta il token o i suoi primi 6 caratteri', () => {
  for (const [, , ingresso] of ERRORI) {
    const r = typeof ingresso === 'string' || ingresso === null || typeof ingresso === 'number'
      ? Core.leggi(ingresso) : leggi(ingresso);
    const s = JSON.stringify(r);
    assert.equal(s.includes(PREFISSO), false);
  }
});

test('il core non lancia mai', () => {
  for (const x of [undefined, {}, [], () => 1, Symbol('x'), '{"formato":', '{}', '""', 'true']) {
    assert.doesNotThrow(() => Core.leggi(x));
    assert.equal(Core.leggi(x).ok, false);
  }
});

test('l\'ingresso non cambia e due letture danno lo stesso risultato', () => {
  const t = testo(base());
  const copia = t.slice();
  const a = Core.leggi(t);
  const b = Core.leggi(t);
  assert.equal(t, copia);
  assert.deepEqual(J(a), J(b));
  a.dati.fasi.mappa = 'altro';
  a.avvisi.push('x');
  assert.equal(Core.leggi(t).dati.fasi.mappa, 'google/gemma-4-31B-it', 'nessuno stato condiviso fra le letture');
  assert.deepEqual(J(Core.leggi(t).avvisi), []);
});
