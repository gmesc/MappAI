'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const TC = require('../public/js/mappai-timeline-core.js');

// ── Setup / categorie (T003) ────────────────────────────────────────────────
test('CATEGORIES: 6 macroAree con colore, categoryColor con fallback', () => {
  assert.strictEqual(TC.CATEGORIES.length, 6);
  assert.strictEqual(TC.categoryColor('Militare'), '#dc2626');
  assert.strictEqual(TC.categoryColor('Inesistente'), '#6366f1');
});

// ── normalizeLabel / eventKey / normalizeEvent (T004) ───────────────────────
test('normalizeLabel: accenti piatti, punteggiatura via, cap 40', () => {
  assert.strictEqual(TC.normalizeLabel('Caduta del Müro!'), 'caduta del muro');
  assert.strictEqual(TC.normalizeLabel('Crisi di Cubà'), 'crisi di cuba');
});

test('eventKey: stesso anno + evento equivalente → stessa chiave', () => {
  assert.strictEqual(
    TC.eventKey({ anno: 1962, evento: 'Crisi di Cuba' }),
    TC.eventKey({ anno: 1962, evento: 'crisi di  cuba' })
  );
  assert.notStrictEqual(
    TC.eventKey({ anno: 1962, evento: 'Crisi di Cuba' }),
    TC.eventKey({ anno: 1961, evento: 'Crisi di Cuba' })
  );
});

test('normalizeEvent: anno mancante/fuori range → errore', () => {
  assert.strictEqual(TC.normalizeEvent({ evento: 'X' }).ok, false);
  assert.strictEqual(TC.normalizeEvent({ anno: 999, evento: 'X' }).ok, false);
  assert.strictEqual(TC.normalizeEvent({ anno: 2200, evento: 'X' }).ok, false);
  assert.ok(TC.normalizeEvent({ anno: 1947, evento: 'X' }).ok);
});

test('normalizeEvent: evento vuoto → errore; cap 120', () => {
  assert.strictEqual(TC.normalizeEvent({ anno: 1947, evento: '   ' }).ok, false);
  const long = 'a'.repeat(200);
  assert.strictEqual(TC.normalizeEvent({ anno: 1947, evento: long }).clean.evento.length, 120);
});

test('normalizeEvent: macroArea non valida → vuota; annoFine < anno scartato', () => {
  const r = TC.normalizeEvent({ anno: 1947, evento: 'X', macroArea: 'Sport', annoFine: 1940 });
  assert.strictEqual(r.clean.macroArea, '');
  assert.strictEqual(r.clean.annoFine, null);
  const r2 = TC.normalizeEvent({ anno: 1939, evento: 'WW2', annoFine: 1945 });
  assert.strictEqual(r2.clean.annoFine, 1945);
});

// ── extractYears / buildPool (T005) ─────────────────────────────────────────
test('extractYears: range, anno singolo, dedup, contesto', () => {
  const ys = TC.extractYears('La guerra 1939-1945 finì; poi nel 1947 il Piano; ancora 1947.');
  const years = ys.map(y => y.year);
  assert.ok(years.includes(1939) && years.includes(1947));
  assert.strictEqual(years.filter(y => y === 1947).length, 1); // dedup
  const r = ys.find(y => y.year === 1939);
  assert.strictEqual(r.yearEnd, 1945);
  assert.ok(r.context.length > 0);
});

test('buildPool: merge AI+manuali, dedup, ordine cronologico, correzione vince', () => {
  const ai = [
    { anno: 1962, evento: 'Crisi di Cuba', macroArea: 'Militare' },
    { anno: 1947, evento: 'Piano Marshall', contesto: 'ctx-ai' }
  ];
  const manual = [
    { anno: 1947, evento: 'piano marshall', origin: 'manual', contesto: 'ctx-manuale' }, // dup di 1947
    { anno: 1949, evento: 'Nascita NATO', origin: 'manual' }
  ];
  const pool = TC.buildPool(ai, manual);
  assert.strictEqual(pool.length, 3); // 1947 deduplicato
  assert.deepStrictEqual(pool.map(e => e.anno), [1947, 1949, 1962]); // cronologico
  const p47 = pool.find(e => e.anno === 1947);
  assert.strictEqual(p47.contesto, 'ctx-manuale'); // manuale ha priorità
  assert.strictEqual(pool.find(e => e.anno === 1962).origin, 'ai');
});

test('buildPool: eventi non validi scartati senza rompere', () => {
  const pool = TC.buildPool([{ anno: 1900, evento: 'Ok' }, { evento: 'no-anno' }], []);
  assert.strictEqual(pool.length, 1);
});

// ── buildGaps (T024) ────────────────────────────────────────────────────────
test('buildGaps: anni citati e assenti dal pool, con hint', () => {
  const src = 'Nel 1947 il Piano. Nel 1962 la crisi. Nel 1989 il muro.';
  const pool = TC.buildPool([{ anno: 1947, evento: 'Piano Marshall' }], []);
  const gaps = TC.buildGaps(src, pool);
  const years = gaps.map(g => g.year);
  assert.ok(years.includes(1962) && years.includes(1989));
  assert.ok(!years.includes(1947));
  assert.ok(gaps[0].hint.length > 0);
});

test('US1 flusso: fill di un buco lo rimuove dai gap successivi', () => {
  const src = 'Nel 1947 il Piano. Nel 1962 la crisi.';
  let pool = TC.buildPool([{ anno: 1947, evento: 'Piano Marshall' }], []);
  assert.deepStrictEqual(TC.buildGaps(src, pool).map(g => g.year), [1962]);
  // studente riempie 1962 → entra nel pool → non è più un buco
  pool = TC.buildPool([{ anno: 1947, evento: 'Piano Marshall' }],
                      [{ anno: 1962, evento: 'Crisi di Cuba', origin: 'student' }]);
  assert.deepStrictEqual(TC.buildGaps(src, pool), []);
});

// ── buildQuestions (T014) ───────────────────────────────────────────────────
const POOL = TC.buildPool([
  { anno: 1947, evento: 'Piano Marshall', macroArea: 'Economia', contesto: 'aiuti USA' },
  { anno: 1949, evento: 'Nascita NATO', macroArea: 'Militare' },
  { anno: 1961, evento: 'Muro di Berlino', macroArea: 'Politica' },
  { anno: 1962, evento: 'Crisi di Cuba', macroArea: 'Militare' },
  { anno: 1962, evento: 'Concilio Vaticano II', macroArea: 'Sociale' }
], []);

test('buildQuestions toEvent: answerText + answerTexts multi-evento stesso anno', () => {
  const r = TC.buildQuestions(POOL, { direction: 'toEvent', format: 'open', order: 'chrono' });
  const q62 = r.questions.find(q => q.tlYear === 1962);
  assert.strictEqual(q62.kind, 'open');
  assert.ok(q62.answerTexts.includes('Crisi di Cuba') && q62.answerTexts.includes('Concilio Vaticano II'));
  assert.ok(/quale evento/i.test(q62.text));
});

test('buildQuestions toYear: answerYear + tolleranza + expects year', () => {
  const r = TC.buildQuestions(POOL, { direction: 'toYear', format: 'open', yearTolerance: 5, order: 'chrono' });
  const q = r.questions[0];
  assert.strictEqual(q.expects, 'year');
  assert.strictEqual(q.yearTolerance, 5);
  assert.ok(Number.isInteger(q.answerYear));
});

test('buildQuestions MC: distrattori dal pool, corretto presente, stabile al re-run', () => {
  const opts = { direction: 'toEvent', format: 'mc', order: 'chrono', seed: 'fix' };
  const a = TC.buildQuestions(POOL, opts).questions[0];
  const b = TC.buildQuestions(POOL, opts).questions[0];
  assert.strictEqual(a.kind, 'mc');
  assert.ok(a.options.length >= 2);
  assert.strictEqual(a.options[a.correct], a.answerText || a.options[a.correct]);
  assert.deepStrictEqual(a.options, b.options); // deterministico
});

test('buildQuestions MC toYear: nessun distrattore dentro la tolleranza', () => {
  const r = TC.buildQuestions(POOL, { direction: 'toYear', format: 'mc', yearTolerance: 2, order: 'chrono', seed: 's' });
  const q61 = r.questions.find(q => q.tlYear === 1961);
  // 1962 dista 1 da 1961 → dentro tol 2 → non deve essere opzione
  assert.ok(!q61.options.includes('1962'));
  assert.strictEqual(q61.options[q61.correct], '1961');
});

test('buildQuestions: pool minimo → degrado ad aperta', () => {
  const tiny = TC.buildPool([{ anno: 1500, evento: 'Solo' }], []);
  const r = TC.buildQuestions(tiny, { direction: 'toEvent', format: 'mc' });
  assert.strictEqual(r.questions[0].kind, 'open'); // niente distrattori → open
  assert.strictEqual(r.degraded, true);
});

test('buildQuestions: shuffle deterministico col seed, count rispettato', () => {
  const a = TC.buildQuestions(POOL, { order: 'shuffle', seed: 'x', count: 3 });
  const b = TC.buildQuestions(POOL, { order: 'shuffle', seed: 'x', count: 3 });
  assert.strictEqual(a.questions.length, 3);
  assert.deepStrictEqual(a.questions.map(q => q.tlYear), b.questions.map(q => q.tlYear));
});

test('buildQuestions: hintMode never → nessun hint', () => {
  const r = TC.buildQuestions(POOL, { direction: 'toEvent', hintMode: 'never', order: 'chrono' });
  assert.strictEqual(r.questions[0].hint, null);
});

// ── validateProposal / proposalFlags / countActive (T024) ───────────────────
test('validateProposal: anno fuori range / evento vuoto', () => {
  assert.strictEqual(TC.validateProposal({ anno: 50, evento: 'X' }).ok, false);
  assert.strictEqual(TC.validateProposal({ anno: 1500, evento: '' }).ok, false);
  assert.ok(TC.validateProposal({ anno: 1500, evento: 'Scoperta' }).ok);
});

test('proposalFlags: duplicato su pool e su proposte non-bocciate; anno non in fonti', () => {
  const pool = TC.buildPool([{ anno: 1947, evento: 'Piano Marshall' }], []);
  const proposals = [
    { anno: 1962, evento: 'Crisi di Cuba', status: 'pending', author: 'a' },
    { anno: 1970, evento: 'Bocciata', status: 'rejected', author: 'b' }
  ];
  const sourceYears = [1947, 1962, 1989];
  // duplicato del pool
  assert.ok(TC.proposalFlags({ anno: 1947, evento: 'piano marshall' }, pool, proposals, sourceYears).duplicate);
  // duplicato di proposta pending
  assert.ok(TC.proposalFlags({ anno: 1962, evento: 'crisi di cuba' }, pool, proposals, sourceYears).duplicate);
  // duplicato di proposta BOCCIATA → non conta
  assert.ok(!TC.proposalFlags({ anno: 1970, evento: 'bocciata' }, pool, proposals, sourceYears).duplicate);
  // anno non citato dalle fonti
  assert.ok(TC.proposalFlags({ anno: 1800, evento: 'Nuovo' }, pool, proposals, sourceYears).yearNotInSources);
  assert.ok(!TC.proposalFlags({ anno: 1989, evento: 'Nuovo' }, pool, proposals, sourceYears).yearNotInSources);
});

test('countActive: conta non-bocciate per identità (bocciata libera lo slot)', () => {
  const proposals = [
    { author: 'a', status: 'pending' },
    { author: 'a', status: 'approved' },
    { author: 'a', status: 'rejected' },
    { author: 'b', status: 'pending' }
  ];
  assert.strictEqual(TC.countActive(proposals, 'a'), 2);
  assert.strictEqual(TC.countActive(proposals, 'b'), 1);
});
