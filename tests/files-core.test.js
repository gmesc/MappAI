'use strict';
/*
 * files-core.test.js — logica pura organizzazione file (010), headless.
 * Copre: safeName (FS-safe, conserva accenti/trattini), isoDate, classFolder,
 * activityLabel, sessionFolderName/RelPath (gerarchia per-classe ISO),
 * planMigration (ribucketing sessioni per classe + flat), sessionRecordFrom
 * (participants/total su forme live E tutor + ordine report).
 */
const { test } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const FC = require(path.join(__dirname, '..', 'public', 'js', 'mappai-files-core.js'));

// ── safeName ────────────────────────────────────────────────────────────
test('safeName: rimuove solo illegali, conserva accenti/spazi/trattini', () => {
  assert.strictEqual(FC.safeName('1ª A'), '1ª A');
  assert.strictEqual(FC.safeName('Vero-Falso'), 'Vero-Falso');
  assert.strictEqual(FC.safeName('a/b:c*d?e"f<g>h|i\\j'), 'a b c d e f g h i j');
  assert.strictEqual(FC.safeName('trailing dot.'), 'trailing dot');
  assert.strictEqual(FC.safeName('   '), '');             // vuoto senza fallback
  assert.strictEqual(FC.safeName('', 'Mappa'), 'Mappa');  // fallback custom
});

// ── isoDate ─────────────────────────────────────────────────────────────
test('isoDate: AAAA-MM-GG zero-padded, ordinabile', () => {
  assert.strictEqual(FC.isoDate(new Date(2026, 6, 5)), '2026-07-05');   // luglio = mese 6
  assert.strictEqual(FC.isoDate('2026-01-09T10:00:00'), '2026-01-09');
  assert.match(FC.isoDate(), /^\d{4}-\d{2}-\d{2}$/);                     // default = oggi
  assert.match(FC.isoDate('non-una-data'), /^\d{4}-\d{2}-\d{2}$/);       // fallback
});

// ── classFolder / activityLabel ─────────────────────────────────────────
test('classFolder: vuoto → "Senza classe"', () => {
  assert.strictEqual(FC.classFolder('2ª B'), '2ª B');
  assert.strictEqual(FC.classFolder(''), 'Senza classe');
  assert.strictEqual(FC.classFolder(null), 'Senza classe');
});

test('activityLabel: codici noti + Title Case fallback', () => {
  assert.strictEqual(FC.activityLabel('quiz'), 'Quiz');
  assert.strictEqual(FC.activityLabel('Vero/Falso'), 'Vero-Falso');
  assert.strictEqual(FC.activityLabel('tutor'), 'Tutor AI');
  assert.strictEqual(FC.activityLabel('costruzione'), 'Timeline');
  assert.strictEqual(FC.activityLabel('bislacca'), 'Bislacca');
  assert.strictEqual(FC.activityLabel(''), 'Attività');
});

// ── sessionFolderName / sessionRelPath ──────────────────────────────────
test('sessionFolderName: data · attività · mappa (+ ramo)', () => {
  const n = FC.sessionFolderName({ date: new Date(2026, 6, 12), activity: 'quiz', map: 'Fotosintesi' });
  assert.strictEqual(n, '2026-07-12 · Quiz · Fotosintesi');
  const withScope = FC.sessionFolderName({ date: new Date(2026, 6, 12), activity: 'tutor', map: 'Svizzera', scope: 'Neutralità' });
  assert.strictEqual(withScope, '2026-07-12 · Tutor AI · Svizzera — Neutralità');
});

test('sessionFolderName: deterministico (resume idempotente)', () => {
  const a = FC.sessionFolderName({ date: '2026-07-12T09:00', activity: 'quiz', map: 'X' });
  const b = FC.sessionFolderName({ date: '2026-07-12T15:30', activity: 'quiz', map: 'X' });
  assert.strictEqual(a, b);  // stesso giorno → stessa cartella
});

test('sessionRelPath: Attività di studio/<Classe>/<sessione>', () => {
  const segs = FC.sessionRelPath({ className: '1ª A', date: new Date(2026, 6, 12), activity: 'quiz', map: 'Fotosintesi' });
  assert.deepStrictEqual(segs, ['Attività di studio', '1ª A', '2026-07-12 · Quiz · Fotosintesi']);
  const noClass = FC.sessionRelPath({ className: '', date: new Date(2026, 6, 12), activity: 'quiz', map: 'X' });
  assert.strictEqual(noClass[1], 'Senza classe');
});

// ── planMigration ───────────────────────────────────────────────────────
test('planMigration: sessioni ribucketate per classe, flat wholesale', () => {
  const plan = FC.planMigration([
    { old: 'MappAI - Live', sub: 'activity', kind: 'sessions', children: [
      { folder: 'foto-quiz-1a-12-07-2026', className: '1ª A' },
      { folder: 'orfano-quiz-x', className: '' }
    ] },
    { old: 'MappAI - Vault', sub: 'maps', kind: 'vault', children: [
      { folder: 'La Fotosintesi' }
    ] }
  ]);
  // sessione con classe
  assert.deepStrictEqual(plan.moves[0], {
    from: ['MappAI - Live', 'foto-quiz-1a-12-07-2026'],
    to: ['Attività di studio', '1ª A', 'foto-quiz-1a-12-07-2026']
  });
  // sessione senza classe → "Senza classe"
  assert.strictEqual(plan.moves[1].to[1], 'Senza classe');
  // vault → Mappe wholesale (nessun bucket classe)
  assert.deepStrictEqual(plan.moves[2], {
    from: ['MappAI - Vault', 'La Fotosintesi'],
    to: ['Mappe', 'La Fotosintesi']
  });
  // le dir includono i bucket-classe
  const dirKeys = plan.dirs.map(d => d.join('/'));
  assert.ok(dirKeys.indexOf('Attività di studio/1ª A') >= 0);
  assert.ok(dirKeys.indexOf('Mappe') >= 0);
});

// ── sessionRecordFrom ───────────────────────────────────────────────────
test('sessionRecordFrom: forma LIVE (joined/absent) + report ordinati', () => {
  const rec = FC.sessionRecordFrom({
    folder: 's1', activityType: 'live',
    session: { session: { name: 'Fotosintesi', activity: 'Quiz', className: '1ª A', scope: '', startedAt: 1000, closedAt: 2000 }, roster: new Array(12).fill(0), students: new Array(11).fill(0), questionCount: 10 },
    results: { joined: 11, absent: 1, questionCount: 10 },
    reportFiles: ['report-studenti.html', 'session.json', 'report-domande.html']
  });
  assert.strictEqual(rec.map, 'Fotosintesi');
  assert.strictEqual(rec.activity, 'Quiz');
  assert.strictEqual(rec.scope, '');                 // tutta la mappa
  assert.strictEqual(rec.participants, 11);
  assert.strictEqual(rec.total, 12);
  assert.strictEqual(rec.closed, true);
  assert.strictEqual(rec.date, 2000);                // closedAt vince
  // domande prima di studenti; session.json escluso
  assert.deepStrictEqual(rec.reports.map(r => r.which), ['questions', 'students']);
});

test('sessionRecordFrom: forma TUTOR (students vs roster) + scope', () => {
  const rec = FC.sessionRecordFrom({
    folder: 's2', activityType: 'tutor',
    session: { session: { name: 'Svizzera', className: '1ª A', topic: 'Neutralità', scope: 'Neutralità', startedAt: 5000 }, roster: new Array(20).fill(0), students: new Array(2).fill(0) },
    results: { students: [1, 2] },
    reportFiles: ['report-tutor.html', 'results.json']
  });
  assert.strictEqual(rec.activity, 'Tutor AI');      // da activityType (session.activity assente)
  assert.strictEqual(rec.scope, 'Neutralità');
  assert.strictEqual(rec.participants, 2);           // students joined
  assert.strictEqual(rec.total, 20);                 // roster
  assert.strictEqual(rec.closed, false);             // niente closedAt
  assert.strictEqual(rec.date, 5000);                // startedAt
  assert.deepStrictEqual(rec.reports.map(r => r.file), ['report-tutor.html']);
});
