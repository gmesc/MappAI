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

// ── mapClassFolder / vaultFolderName (011) ──────────────────────────────
test('mapClassFolder: con sede → "sede-classe", senza sede → classe', () => {
  assert.strictEqual(FC.mapClassFolder('Bellinzona', '2ª A'), 'Bellinzona-2ª A');
  assert.strictEqual(FC.mapClassFolder('', '2ª A'), '2ª A');
  assert.strictEqual(FC.mapClassFolder(null, '1ª B'), '1ª B');
  assert.strictEqual(FC.mapClassFolder('Locarno', ''), 'Locarno');      // sede senza classe
  assert.strictEqual(FC.mapClassFolder('', ''), 'Senza classe');        // niente → fallback
  // caratteri illegali sanitizzati in entrambi i segmenti
  assert.strictEqual(FC.mapClassFolder('Se/de', '2:A'), 'Se de-2 A');
});

// ── disciplineFolder / mapVaultParents (29/7) ───────────────────────────
test('disciplineFolder: nome FS-safe, vuoto = nessun livello', () => {
  assert.strictEqual(FC.disciplineFolder('Storia'), 'Storia');
  assert.strictEqual(FC.disciplineFolder('Ed. fisica'), 'Ed. fisica');
  assert.strictEqual(FC.disciplineFolder('Storia/Geo'), 'Storia Geo');
  assert.strictEqual(FC.disciplineFolder(''), '');
  assert.strictEqual(FC.disciplineFolder(null), '');
});

test('mapVaultParents: flat / classe / classe+disciplina', () => {
  assert.deepStrictEqual(FC.mapVaultParents(null, 'Storia'), []);      // senza classe niente disciplina
  assert.deepStrictEqual(FC.mapVaultParents('', 'Storia'), []);
  assert.deepStrictEqual(FC.mapVaultParents('Bellinzona-2A', ''), ['Bellinzona-2A']);
  assert.deepStrictEqual(FC.mapVaultParents('2A', 'Storia'), ['2A', 'Storia']);
  assert.deepStrictEqual(FC.mapVaultParents('2A', 'Sto/ria'), ['2A', 'Sto ria']);
});

test('vaultFolderName: titolo mappa FS-safe, fallback "Mappa"', () => {
  assert.strictEqual(FC.vaultFolderName('La Fotosintesi'), 'La Fotosintesi');
  assert.strictEqual(FC.vaultFolderName(''), 'Mappa');
  assert.strictEqual(FC.vaultFolderName(null), 'Mappa');
  assert.strictEqual(FC.vaultFolderName('Storia: 1848'), 'Storia 1848');
});

// ── sanitizeVaultRelPath (011) ──────────────────────────────────────────
test('sanitizeVaultRelPath: ammette root e Materiale Studio/, nega traversal', () => {
  assert.strictEqual(FC.sanitizeVaultRelPath('pipeline.json'), 'pipeline.json');
  assert.strictEqual(FC.sanitizeVaultRelPath('Materiale Studio/Quiz-MC-Fotosintesi.pdf'), 'Materiale Studio/Quiz-MC-Fotosintesi.pdf');
  assert.strictEqual(FC.sanitizeVaultRelPath('Materiale Studio\\Sintesi -VERDE.html'), 'Materiale Studio/Sintesi -VERDE.html'); // backslash → slash
  // illegali
  assert.strictEqual(FC.sanitizeVaultRelPath('../secret'), null);
  assert.strictEqual(FC.sanitizeVaultRelPath('Materiale Studio/../../etc/passwd'), null);
  assert.strictEqual(FC.sanitizeVaultRelPath('/absolute/path'), null);
  assert.strictEqual(FC.sanitizeVaultRelPath('C:\\Windows\\x'), null);
  assert.strictEqual(FC.sanitizeVaultRelPath('Nodi/hack.md'), null);       // sottocartella non ammessa
  assert.strictEqual(FC.sanitizeVaultRelPath('Materiale Studio/sub/deep.pdf'), null); // troppo profondo
  assert.strictEqual(FC.sanitizeVaultRelPath(''), null);
  assert.strictEqual(FC.sanitizeVaultRelPath(null), null);
});

// ── Fonti/ (22/7/26 — PDF originali per anteprima ELABORA) ──────────────
test('sanitizeVaultRelPath: ammette Fonti/<file>, nega traversal e profondità', () => {
  assert.strictEqual(FC.sanitizeVaultRelPath('Fonti/scheda-carta.pdf'), 'Fonti/scheda-carta.pdf');
  assert.strictEqual(FC.sanitizeVaultRelPath('Fonti\\La Svizzera.pdf'), 'Fonti/La Svizzera.pdf'); // backslash → slash
  assert.strictEqual(FC.sanitizeVaultRelPath('Fonti/../secret.pdf'), null);
  assert.strictEqual(FC.sanitizeVaultRelPath('Fonti/sub/deep.pdf'), null);   // troppo profondo
  assert.strictEqual(FC.sanitizeVaultRelPath('fonti/x.pdf'), null);          // case-sensitive: solo 'Fonti'
});

test('VAULT_CONTAINER_EXCLUDE: contenitori di sistema', () => {
  assert.ok(FC.VAULT_CONTAINER_EXCLUDE.indexOf('Chat') >= 0);
  assert.ok(FC.VAULT_CONTAINER_EXCLUDE.indexOf('Quiz e Flashcard') >= 0);
  assert.ok(FC.VAULT_CONTAINER_EXCLUDE.indexOf('Studio Attivo') >= 0);
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

test('sessionSeq: progressivo somministrazioni (00 → 01 → …)', () => {
  const base = '2026-07-15 · Quiz · Fotosintesi';
  // nessuna cartella ancora → prima somministrazione = "00"
  let r = FC.sessionSeq([], base, ' · ');
  assert.strictEqual(r.next, '00');
  assert.strictEqual(r.last, null);
  assert.strictEqual(r.maxSeq, -1);
  // esiste la 00 → prossima 01, last = la 00
  r = FC.sessionSeq([base + ' · 00'], base, ' · ');
  assert.strictEqual(r.next, '01');
  assert.strictEqual(r.last, base + ' · 00');
  // 00 e 02 presenti (buco) → prossima 03 (max+1, non riempie i buchi), last = la 02
  r = FC.sessionSeq([base + ' · 02', base + ' · 00'], base, ' · ');
  assert.strictEqual(r.next, '03');
  assert.strictEqual(r.last, base + ' · 02');
  // separatore storico a trattino
  const slug = 'fotosintesi-quiz-1a-15-07-2026';
  assert.strictEqual(FC.sessionSeq([slug + '-00'], slug, '-').next, '01');
  // cartelle di ALTRE attività/mappe non interferiscono
  r = FC.sessionSeq(['2026-07-15 · Quiz · Altra · 00', '2026-07-15 · Cloze · Fotosintesi · 00'], base, ' · ');
  assert.strictEqual(r.next, '00');
  assert.strictEqual(r.last, null);
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

// ── Mappe di un profilo ALLIEVO (2/8) ──────────────────────────────────────
test('le mappe di un allievo vivono nella sua cartella, non fra quelle di classe', () => {
    const basi = { maps: '/F/Mappe', students: '/F/Allievi' };
    assert.strictEqual(FC.mapVaultRoot(basi, 'Anna Rossi'), '/F/Allievi/Anna Rossi/Mappe');
    assert.strictEqual(FC.mapVaultRoot(basi, ''), '/F/Mappe', 'senza allievo si resta in Mappe');
    // dentro la cartella di un allievo il percorso è già personale: niente
    // livello classe/disciplina (i due contesti si escludono a vicenda)
    assert.deepStrictEqual(FC.mapVaultParentsFor('Anna Rossi', '2A', 'Storia'), []);
    assert.deepStrictEqual(FC.mapVaultParentsFor('', '2A', 'Storia'), ['2A', 'Storia']);
    // un nome che tenterebbe di risalire resta UN segmento: safeName toglie i
    // separatori, quindi il percorso non può uscire da «Allievi»
    const furbo = FC.mapVaultRoot(basi, '../fuori');
    assert.ok(furbo.startsWith('/F/Allievi/'), furbo);
    assert.strictEqual(furbo.split('/').length, '/F/Allievi/x/Mappe'.split('/').length, 'nessun livello in più');
});

test('«Allegati» è scrivibile dalla pipeline, la risalita no', () => {
    assert.strictEqual(FC.sanitizeVaultRelPath('Allegati/fonte.pdf'), 'Allegati/fonte.pdf');
    assert.strictEqual(FC.sanitizeVaultRelPath('Fonti/fonte.pdf'), 'Fonti/fonte.pdf');
    assert.strictEqual(FC.sanitizeVaultRelPath('Allegati/../../fuori.pdf'), null);
    assert.strictEqual(FC.sanitizeVaultRelPath('Altro/fonte.pdf'), null);
});

test('«Allievi» è una sottocartella di MappAI - file, ma non una da migrare', () => {
    assert.strictEqual(FC.SUB.students, 'Allievi');
    assert.ok(!FC.LEGACY.some(l => l.sub === 'students'), 'nasce ora: non c’è nulla da spostarci dentro');
});
