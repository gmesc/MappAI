// tests/study-bus.test.js — CORE puro di mappai-study-bus.js (buildSessionRecord)
const test = require('node:test');
const assert = require('node:assert');
const BUS = require('../public/js/mappai-study-bus.js');

test('buildSessionRecord: formato compatibile con analyzeSessions', () => {
  const cur = {
    activity: 'cloze', modeTitle: 'Cloze — completa', project: 'La Fotosintesi',
    startedAt: Date.now() - 90 * 1000,
    entries: [
      { nodeId: 'n1', label: 'Clorofilla', score: 1, rate: 6.2 },
      { nodeId: 'n2', label: 'Stomi', score: 0.5 },
      { nodeId: 'n3', label: 'Glucosio', score: 0 }
    ]
  };
  const rec = BUS.buildSessionRecord(cur);
  const j = rec.jsonRecord;
  assert.strictEqual(j.mode, 'cloze');
  assert.strictEqual(j.modeTitle, 'Cloze — completa');
  assert.strictEqual(j.project, 'La Fotosintesi');
  assert.strictEqual(j.total, 3);
  assert.strictEqual(j.score, 1);                    // solo n1 è >= 0.6
  assert.strictEqual(j.accuracy, 50);                // (100+50+0)/3
  assert.ok(j.durationSec >= 89 && j.durationSec <= 92);
  assert.strictEqual(j.entries.length, 3);
  assert.strictEqual(j.entries[0].isCorrect, true);
  assert.strictEqual(j.entries[0].rate, 6.2);
  assert.strictEqual(j.entries[1].isCorrect, false);
  assert.ok(j.timestamp && j.date && j.time);
  assert.ok(rec.markdownLine.includes('**1/3**'));
  assert.ok(rec.dateStr.match(/^\d{2}-\d{2}-\d{4}$/));
});

test('buildSessionRecord: sessione senza startedAt → durationSec null', () => {
  const rec = BUS.buildSessionRecord({ activity: 'quiz', entries: [{ nodeId: 'a', score: 1 }] });
  assert.strictEqual(rec.jsonRecord.durationSec, null);
  assert.strictEqual(rec.jsonRecord.accuracy, 100);
});

test('clamp01: valori fuori range e non numerici', () => {
  assert.strictEqual(BUS.clamp01(1.5), 1);
  assert.strictEqual(BUS.clamp01(-2), 0);
  assert.strictEqual(BUS.clamp01('x'), 0);
  assert.strictEqual(BUS.clamp01(0.4), 0.4);
});
