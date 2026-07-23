'use strict';
/*
 * usage-core.test.js — logica pura registro consumi AI, headless.
 * Copre: integrità tassonomia, normalizeRecord (fallback cat/sub/tokens),
 * costOf (google USD→CHF, infomaniak CHF diretto, kb sconosciuto),
 * aggregate (totali, byCat/bySub/byModel/byProvider, unknownModels),
 * listProjects/filterByProject, donut* (ordinamento, filtro zero), fmt.
 */
const { test } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const U = require(path.join(__dirname, '..', 'public', 'js', 'mappai-usage-core.js'));

// ── Tassonomia ──────────────────────────────────────────────────────────
test('CATS: ogni categoria ha label e almeno una sottocategoria', () => {
    const cats = Object.keys(U.CATS);
    assert.ok(cats.length >= 5);
    cats.forEach(c => {
        assert.ok(U.CATS[c].label, c + ' senza label');
        assert.ok(Object.keys(U.CATS[c].subs).length >= 1, c + ' senza subs');
    });
    assert.strictEqual(U.catLabel('map'), 'Generazione mappa');
    assert.strictEqual(U.subLabel('materials', 'timeline'), 'Timeline');
    // categoria pipeline (011) con le 7 sottovoci per step
    assert.strictEqual(U.catLabel('pipeline'), 'Pipeline materiali');
    assert.strictEqual(U.subLabel('pipeline', 'quiz_mc'), 'Quiz a scelta multipla');
    assert.strictEqual(U.subLabel('pipeline', 'tts'), 'Voce naturale');
    // fallback su categoria/sotto sconosciute
    assert.strictEqual(U.catLabel('boh'), U.CATS.other.label);
    assert.strictEqual(U.subLabel('map', 'boh'), U.CATS.other.subs.misc);
});

// ── normalizeRecord ─────────────────────────────────────────────────────
test('normalizeRecord: fallback e coercizioni', () => {
    const r = U.normalizeRecord({ provider: 'x', model: null, inTok: '100', outTok: -5, cat: 'nope', sub: 'nope', project: '  ' });
    assert.strictEqual(r.provider, 'google');
    assert.strictEqual(r.model, '?');
    assert.strictEqual(r.inTok, 100);
    assert.strictEqual(r.outTok, 0);
    assert.strictEqual(r.cat, 'other');
    assert.strictEqual(r.sub, 'misc');
    assert.strictEqual(r.project, 'Senza titolo');
    // sub valida della sua categoria resta
    const r2 = U.normalizeRecord({ cat: 'map', sub: 'kg_community', inTok: 1, outTok: 1 });
    assert.strictEqual(r2.sub, 'kg_community');
    // sub di un'ALTRA categoria non passa
    const r3 = U.normalizeRecord({ cat: 'map', sub: 'timeline', inTok: 1, outTok: 1 });
    assert.strictEqual(r3.sub, 'misc');
});

// ── costOf ──────────────────────────────────────────────────────────────
test('costOf: google converte USD→CHF, infomaniak resta CHF', () => {
    const kb = { inputCost: 1.0, outputCost: 4.0 }; // per 1M token
    const g = U.costOf(U.normalizeRecord({ provider: 'google', inTok: 1e6, outTok: 5e5 }), kb, 0.9);
    assert.ok(Math.abs(g.inCost - 0.9) < 1e-9);
    assert.ok(Math.abs(g.outCost - 1.8) < 1e-9);
    assert.ok(Math.abs(g.total - 2.7) < 1e-9);
    assert.strictEqual(g.known, true);
    const i = U.costOf(U.normalizeRecord({ provider: 'infomaniak', inTok: 1e6, outTok: 5e5 }), kb, 0.9);
    assert.ok(Math.abs(i.inCost - 1.0) < 1e-9);   // tasso NON applicato
    assert.ok(Math.abs(i.outCost - 2.0) < 1e-9);
    // kb sconosciuto → costo 0 ma known=false
    const u = U.costOf(U.normalizeRecord({ inTok: 1000, outTok: 1000 }), null, 0.9);
    assert.strictEqual(u.total, 0);
    assert.strictEqual(u.known, false);
    // tasso non valido → 1
    const t = U.costOf(U.normalizeRecord({ provider: 'google', inTok: 1e6, outTok: 0 }), kb, 0);
    assert.ok(Math.abs(t.inCost - 1.0) < 1e-9);
});

// ── aggregate ───────────────────────────────────────────────────────────
const RECS = [
    { ts: '2026-07-15T10:00:00Z', provider: 'google', model: 'gemini-2.5-flash', inTok: 1000, outTok: 500, cat: 'map', sub: 'mm_phase1', project: 'Fotosintesi', projectId: 'p1' },
    { ts: '2026-07-15T10:01:00Z', provider: 'google', model: 'gemini-2.5-flash', inTok: 2000, outTok: 1000, cat: 'map', sub: 'mm_phase3', project: 'Fotosintesi', projectId: 'p1' },
    { ts: '2026-07-15T10:02:00Z', provider: 'infomaniak', model: 'gemma-4', inTok: 500, outTok: 200, cat: 'materials', sub: 'timeline', project: 'Fotosintesi', projectId: 'p1' },
    { ts: '2026-07-15T11:00:00Z', provider: 'google', model: 'gemini-2.5-pro', inTok: 300, outTok: 100, cat: 'tutor', sub: 'sidebar', project: 'Rivoluzione', projectId: 'p2' },
    { ts: '2026-07-15T11:05:00Z', provider: 'google', model: 'gemini-2.5-flash', inTok: 0, outTok: 0, cat: 'map', sub: 'mm_phase1', project: 'Rivoluzione', projectId: 'p2' } // zero-token: ignorato
];
const KB = {
    'gemini-2.5-flash': { inputCost: 0.15, outputCost: 0.60 },
    'gemini-2.5-pro': { inputCost: 1.25, outputCost: 10.0 },
    'gemma-4': { inputCost: 0.20, outputCost: 0.40 }
};
const lookup = (m) => KB[m] || null;

test('aggregate: totali, categorie, sottocategorie, modelli, provider', () => {
    const agg = U.aggregate(RECS, { kbLookup: lookup, usdChf: 0.9 });
    assert.strictEqual(agg.totals.calls, 4);              // zero-token escluso
    assert.strictEqual(agg.totals.inTok, 3800);
    assert.strictEqual(agg.totals.outTok, 1800);
    // byCat
    assert.strictEqual(agg.byCat.map.calls, 2);
    assert.strictEqual(agg.byCat.map.inTok, 3000);
    assert.ok(agg.byCat.map.bySub.mm_phase1 && agg.byCat.map.bySub.mm_phase3);
    assert.strictEqual(agg.byCat.materials.bySub.timeline.calls, 1);
    // byModel con provider
    assert.strictEqual(agg.byModel['gemini-2.5-flash'].calls, 2);
    assert.strictEqual(agg.byModel['gemma-4'].provider, 'infomaniak');
    // byProvider
    assert.strictEqual(agg.byProvider.google.calls, 3);
    assert.strictEqual(agg.byProvider.infomaniak.calls, 1);
    // costi: google in CHF col tasso, infomaniak diretto
    const flashCost = ((3000 / 1e6) * 0.15 + (1500 / 1e6) * 0.60) * 0.9;
    assert.ok(Math.abs(agg.byModel['gemini-2.5-flash'].total - flashCost) < 1e-9);
    const gemmaCost = (500 / 1e6) * 0.20 + (200 / 1e6) * 0.40;
    assert.ok(Math.abs(agg.byModel['gemma-4'].total - gemmaCost) < 1e-9);
    assert.deepStrictEqual(agg.unknownModels, []);
});

test('aggregate: modello fuori KB finisce in unknownModels con costo 0', () => {
    const agg = U.aggregate([{ provider: 'google', model: 'misterioso', inTok: 100, outTok: 100, cat: 'map', sub: 'mm_phase1' }], { kbLookup: () => null, usdChf: 0.9 });
    assert.deepStrictEqual(agg.unknownModels, ['misterioso']);
    assert.strictEqual(agg.totals.total, 0);
    assert.strictEqual(agg.totals.inTok, 100);
});

// ── progetti ────────────────────────────────────────────────────────────
test('listProjects/filterByProject: raggruppa per projectId, ordina per recenza', () => {
    const list = U.listProjects(RECS);
    assert.strictEqual(list.length, 2);
    assert.strictEqual(list[0].label, 'Rivoluzione'); // più recente
    assert.strictEqual(list[1].calls, 3);
    const only = U.filterByProject(RECS, list[1].key);
    assert.strictEqual(only.length, 3);
    // senza projectId → chiave per label
    const anon = U.listProjects([{ inTok: 1, outTok: 0, project: 'X' }, { inTok: 1, outTok: 0, project: 'X' }]);
    assert.strictEqual(anon.length, 1);
    assert.strictEqual(anon[0].calls, 2);
});

// ── donut ───────────────────────────────────────────────────────────────
test('donutByCat/BySub/ByModel: ordinati per valore, zero esclusi', () => {
    const agg = U.aggregate(RECS, { kbLookup: lookup, usdChf: 0.9 });
    const d1 = U.donutByCat(agg);
    assert.ok(d1.length >= 2);
    for (let i = 1; i < d1.length; i++) assert.ok(d1[i - 1].value >= d1[i].value);
    const d2 = U.donutBySub(agg, 'map');
    assert.strictEqual(d2.length, 2);
    assert.strictEqual(U.donutBySub(agg, 'live').length, 0);
    const dm = U.donutByModel(agg);
    assert.strictEqual(dm.length, 3);
    // tutti unknown → valori 0 → donut vuota
    const agg0 = U.aggregate(RECS, { kbLookup: () => null, usdChf: 0.9 });
    assert.strictEqual(U.donutByCat(agg0).length, 0);
});

// ── formattazione ───────────────────────────────────────────────────────
test('fmtChf/fmtTok', () => {
    assert.strictEqual(U.fmtChf(0), '0.00 CHF');
    assert.strictEqual(U.fmtChf(0.0042), '0.0042 CHF');
    assert.strictEqual(U.fmtChf(1.5), '1.50 CHF');
    assert.strictEqual(U.fmtTok(1234567), "1'234'567");
});
