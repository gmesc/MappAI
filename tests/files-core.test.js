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

test('mapVaultParents: Generico / classe / classe+disciplina', () => {
  // 15/8 sera: senza classe il vault va in Mappe/Generico/, non più piatto —
  // e senza classe non c'è disciplina (Generico non ha sottocartelle di materia)
  assert.deepStrictEqual(FC.mapVaultParents(null, 'Storia'), ['Generico']);
  assert.deepStrictEqual(FC.mapVaultParents('', 'Storia'), ['Generico']);
  assert.deepStrictEqual(FC.mapVaultParents(''), [FC.GENERICO]);
  assert.deepStrictEqual(FC.mapVaultParents('Bellinzona-2A', ''), ['Bellinzona-2A']);
  assert.deepStrictEqual(FC.mapVaultParents('2A', 'Storia'), ['2A', 'Storia']);
  assert.deepStrictEqual(FC.mapVaultParents('4R', 'Scienze'), ['4R', 'Scienze']);
  assert.deepStrictEqual(FC.mapVaultParents('2A', 'Sto/ria'), ['2A', 'Sto ria']);
});

test('GENERICO è un nome riservato: chi legge lo ritraduce in classDir null', () => {
  assert.strictEqual(FC.GENERICO, 'Generico');
  assert.strictEqual(FC.classDirDaCartella('Generico'), null);
  assert.strictEqual(FC.classDirDaCartella(FC.GENERICO), null);
  assert.strictEqual(FC.classDirDaCartella('4R'), '4R');
  assert.strictEqual(FC.classDirDaCartella('Bellinzona-2A'), 'Bellinzona-2A');
  assert.strictEqual(FC.classDirDaCartella(''), null);
  assert.strictEqual(FC.classDirDaCartella(null), null);
  // Generico non è un contenitore di sistema: va scandito, non escluso
  assert.strictEqual(FC.VAULT_CONTAINER_EXCLUDE.indexOf('Generico'), -1);
  // andata e ritorno: quello che lo scrittore mette, il lettore lo toglie
  assert.strictEqual(FC.classDirDaCartella(FC.mapVaultParents('')[0]), null);
});

test('vaultFolderName: titolo mappa FS-safe, fallback "Mappa"', () => {
  assert.strictEqual(FC.vaultFolderName('La Fotosintesi'), 'La Fotosintesi');
  assert.strictEqual(FC.vaultFolderName(''), 'Mappa');
  assert.strictEqual(FC.vaultFolderName(null), 'Mappa');
  assert.strictEqual(FC.vaultFolderName('Storia: 1848'), 'Storia 1848');
});

// ── titolo del progetto = nome della cartella del vault (14/8) ──────────
test('titoloProgetto: via l\'estensione, via i simboli che una cartella non ammette', () => {
  assert.strictEqual(FC.titoloProgetto('Il Clima.pdf'), 'Il Clima');
  assert.strictEqual(FC.titoloProgetto('Il Clima.PDF'), 'Il Clima');
  assert.strictEqual(FC.titoloProgetto('appunti.pdf.pdf'), 'appunti');   // doppia coda
  assert.strictEqual(FC.titoloProgetto('Storia: 1848/49'), 'Storia 1848 49');
  assert.strictEqual(FC.titoloProgetto('  spazi  in mezzo  '), 'spazi in mezzo');
  // un titolo NON è un nome di file: i trattini restano
  assert.strictEqual(FC.titoloProgetto('Storia 1914-1918'), 'Storia 1914-1918');
  // un punto che non è un'estensione nota non si tocca
  assert.strictEqual(FC.titoloProgetto('Guerra 1914. Le cause'), 'Guerra 1914. Le cause');
  // niente da salvare → il fallback lo sceglie il chiamante
  assert.strictEqual(FC.titoloProgetto('???', 'Mappa'), 'Mappa');
  assert.strictEqual(FC.titoloProgetto('', 'Mappa'), 'Mappa');
  assert.strictEqual(FC.titoloProgetto(null, ''), '');
});

test('titoloDaFile: estensione via SEMPRE, separatori del file → spazi', () => {
  assert.strictEqual(FC.titoloDaFile('Il Clima.pdf'), 'Il Clima');
  assert.strictEqual(FC.titoloDaFile('storia_del_papiro.docx'), 'storia del papiro');
  assert.strictEqual(FC.titoloDaFile('scheda-4R-clima.PDF'), 'scheda 4R clima');
  assert.strictEqual(FC.titoloDaFile('lezione.xyz'), 'lezione');        // estensione non nota
  assert.strictEqual(FC.titoloDaFile('Guerra 1914. Le cause.pdf'), 'Guerra 1914. Le cause');
  assert.strictEqual(FC.titoloDaFile('note:2/3.txt'), 'note 2 3');      // simboli fuori
  assert.strictEqual(FC.titoloDaFile('', 'Mappa'), 'Mappa');
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
  // Sorgenti/ (6/9): l'UNICA sottocartella ammessa, un livello solo — i gemelli .html dei fogli
  assert.strictEqual(FC.sanitizeVaultRelPath('Materiale Studio/Sorgenti/Domande-aperte-Il Clima-causa.html'), 'Materiale Studio/Sorgenti/Domande-aperte-Il Clima-causa.html');
  assert.strictEqual(FC.sanitizeVaultRelPath('Materiale Studio/Sorgenti/x/y.html'), null);
  assert.strictEqual(FC.sanitizeVaultRelPath('Fonti/Sorgenti/y.html'), null);
  assert.strictEqual(FC.SORGENTI, 'Sorgenti');
  assert.strictEqual(FC.sanitizeVaultRelPath(''), null);
  assert.strictEqual(FC.sanitizeVaultRelPath(null), null);
});

// ── Il carattere nel nome del file (7/9/26) ──────────────────────────────
test('senzaCarattere: toglie solo un suffisso noto, riconosce le etichette vecchie', () => {
  assert.deepStrictEqual(FC.senzaCarattere('Quiz-MC-Il Clima - TM Sans.pdf'), { stem: 'Quiz-MC-Il Clima', carattere: 'TM Sans', est: '.pdf' });
  assert.deepStrictEqual(FC.senzaCarattere('Domande-aperte-Elettricità-causa - TestMe Sans.pdf'), { stem: 'Domande-aperte-Elettricità-causa', carattere: 'TestMe Sans', est: '.pdf' });
  assert.deepStrictEqual(FC.senzaCarattere('Sintesi-Il Clima -VERDE.html'), { stem: 'Sintesi-Il Clima -VERDE', carattere: '', est: '.html' });
  assert.deepStrictEqual(FC.senzaCarattere('Quiz-MC-Clima-verifica ottobre - TM Alt.pdf'), { stem: 'Quiz-MC-Clima-verifica ottobre', carattere: 'TM Alt', est: '.pdf' });
  assert.deepStrictEqual(FC.senzaCarattere('Quiz-MC-Clima - Comic Sans.pdf'), { stem: 'Quiz-MC-Clima - Comic Sans', carattere: '', est: '.pdf' }, 'un carattere ignoto non è un suffisso');
  assert.deepStrictEqual(FC.senzaCarattere('Quiz-MC-Clima - Comic Sans.pdf', ['Comic Sans']).carattere, 'Comic Sans', 'ma si può annunciare');
});

test('variantiDaPotare: lo stesso documento in un altro carattere sì, una copia con un nome suo no', () => {
  const dir = ['Quiz-MC-Clima.pdf', 'Quiz-MC-Clima - TestMe Sans.pdf', 'Quiz-MC-Clima - TM Sans.pdf', 'Quiz-MC-Clima-verifica ottobre - TM Sans.pdf',
    'Quiz-VF-Clima - TM Sans.pdf', 'Sintesi-Clima - TM Sans.html', 'Quiz-MC-Clima - TM Sans.html', 'set-1.json'];
  assert.deepStrictEqual(FC.variantiDaPotare(dir, 'Quiz-MC-Clima - TM Sans.pdf').sort(), ['Quiz-MC-Clima - TestMe Sans.pdf', 'Quiz-MC-Clima.pdf']);
  assert.deepStrictEqual(FC.variantiDaPotare(dir, 'Quiz-MC-Clima - Atkinson Hyperlegible.pdf').sort(), ['Quiz-MC-Clima - TM Sans.pdf', 'Quiz-MC-Clima - TestMe Sans.pdf', 'Quiz-MC-Clima.pdf']);
  assert.deepStrictEqual(FC.variantiDaPotare(dir, 'Quiz-MC-Clima.pdf').sort(), ['Quiz-MC-Clima - TM Sans.pdf', 'Quiz-MC-Clima - TestMe Sans.pdf']);
  assert.deepStrictEqual(FC.variantiDaPotare(dir, 'Sintesi-Clima - TM Alt.html'), ['Sintesi-Clima - TM Sans.html'], 'stessa estensione soltanto');
  assert.deepStrictEqual(FC.variantiDaPotare(dir, 'set-1.json'), []);
  assert.deepStrictEqual(FC.variantiDaPotare(dir, 'senza-estensione'), []);
});

// ── Scambio con MappAI studente (7/9/26) ─────────────────────────────────
test('relVaultStudente: la mappa e i materiali sì; vista, Studio Attivo, Chat, Fonti, pipeline no', () => {
  assert.strictEqual(FC.relVaultStudente('index.yaml'), 'index.yaml');
  assert.strictEqual(FC.relVaultStudente('links.json'), 'links.json');
  assert.strictEqual(FC.relVaultStudente('Nodi/Elettricità.md'), 'Nodi/Elettricità.md');
  assert.strictEqual(FC.relVaultStudente('Nodi/ramo/foglia.md'), 'Nodi/ramo/foglia.md');
  assert.strictEqual(FC.relVaultStudente('Materiale Studio\\Sintesi-Clima - TM Sans.html'), 'Materiale Studio/Sintesi-Clima - TM Sans.html');   // backslash → slash
  assert.strictEqual(FC.relVaultStudente('Materiale Studio/Quiz-MC-x.pdf'), null, 'da Materiale Studio nessun PDF');
  assert.strictEqual(FC.relVaultStudente('Materiale Studio/Sorgenti/Domande-aperte-x-causa.html'), 'Materiale Studio/Sorgenti/Domande-aperte-x-causa.html');
  assert.strictEqual(FC.relVaultStudente('Allegati/fonte.pdf'), 'Allegati/fonte.pdf');
  ['vista.json', 'qualita.json', 'fonti_e_link.txt', 'pipeline.json', 'chat_state.json', 'Studio Attivo/sessioni.jsonl', 'Studio Attivo/Prove/x/risposte.pdf',
   'Chat/x.md', 'Fonti/x.pdf', 'Consegne/1A-12/x.pdf', '.DS_Store', 'Materiale Studio/.nascosto', 'Nodi/a/b/c.md', 'Nodi/x.txt',
   '../index.yaml', 'Materiale Studio/../vista.json', '/abs/index.yaml', ''].forEach(r => {
    assert.strictEqual(FC.relVaultStudente(r), null, r + ' non deve passare');
  });
});

test('materialeSoloDocente: elenco CHIUSO (16/9) — da «Materiale Studio» solo sintesi, audio, set; un genere nuovo resta al docente', () => {
  ['Flashcard-La carta - TM Sans.pdf', 'Foglio-nodi-La carta-title - TM Sans.pdf', 'Quiz-MC-La carta-causa - TM Sans.pdf',
   'Quiz-VF-Il Clima -VERDE.pdf', 'Domande-aperte-La carta-esempio - TM Sans.pdf', 'MM-Elettricità - TM Sans-4ª-00.pdf',
   'Focus-Temperatura-parentela.pdf', 'Studio-Il Clima-fasci.pdf', 'Catena-dei-perche-La carta - TM Sans.pdf',
   'Analisi-della-fonte-x.pdf', 'Sintesi-La carta.pdf', 'MM-Elettricità.svg', 'MM-Elettricità.png',
   'Domande-aperte-La carta-esempio - TM Sans.html', 'Dossier-La carta.html', 'Genere-nuovo-di-domani.html', 'appunti.json'].forEach(n => {
    assert.strictEqual(FC.materialeSoloDocente(n), true, n);
    assert.strictEqual(FC.relVaultStudente('Materiale Studio/' + n), null, n + ' non viaggia');
  });
  ['Sintesi-La carta - TM Sans.html', 'Sintesi-voce-Il Clima.html', 'Sintesi-audio-Il Clima.mp3', 'set-set_1788.json',
   'Il Clima_set_1788.json'].forEach(n => {
    assert.strictEqual(FC.materialeSoloDocente(n), false, n);
    assert.strictEqual(FC.relVaultStudente('Materiale Studio/' + n), 'Materiale Studio/' + n, n + ' viaggia');
  });
  assert.strictEqual(FC.relVaultStudente('Allegati/Storia della CARTA.pdf'), 'Allegati/Storia della CARTA.pdf', 'la scheda didattica originale viaggia');
  assert.strictEqual(FC.relVaultStudente('Materiale Studio/Sorgenti/Domande-aperte-La carta-causa - TM Sans.html'), 'Materiale Studio/Sorgenti/Domande-aperte-La carta-causa - TM Sans.html', 'il gemello è la sorgente delle prove');
  assert.strictEqual(FC.relVaultStudente('Materiale Studio/Sorgenti/Quiz-MC-La carta-causa.html'), null, 'da Sorgenti solo le domande aperte');
});

test('sanitizeVaultRelPath: ammette Consegne/<studente>/<file>, tre segmenti esatti', () => {
  assert.strictEqual(FC.sanitizeVaultRelPath('Consegne/1A-12/Domande · Clima · 00 - risposte.pdf'), 'Consegne/1A-12/Domande · Clima · 00 - risposte.pdf');
  assert.strictEqual(FC.sanitizeVaultRelPath('Consegne/x.pdf'), null);
  assert.strictEqual(FC.sanitizeVaultRelPath('Consegne/1A-12/sub/x.pdf'), null);
  assert.strictEqual(FC.CONSEGNE, 'Consegne');
});

test('identitaStudente: numero solo cifre, classe [1-4][A-Z] maiuscola, id = classe-numero', () => {
  assert.deepStrictEqual(FC.identitaStudente('4517', '1a'), { numero: '4517', classe: '1A', id: '1A-4517' });
  assert.deepStrictEqual(FC.identitaStudente(' 12 ', ' 4R'), { numero: '12', classe: '4R', id: '4R-12' });
  [['', '1A'], ['12', ''], ['12', '5A'], ['12', '1'], ['12', '1AB'], ['12', '1à'], ['ab', '1A'], ['12/3', '1A'], ['1234567890123', '1A'], [null, null]].forEach(c => {
    assert.strictEqual(FC.identitaStudente(c[0], c[1]), null, JSON.stringify(c));
  });
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

/* ══ I FILE DEI SET DI STUDIO ════════════════════════════════════════════════
   Nati dai NOVE file trovati in «Project E» il 17/8: tre di un'altra mappa
   («Elettricità», id identici a quelli del suo vault) e tre in doppia copia,
   lasciati indietro dalla rinomina del progetto. I dati qui sotto sono quelli
   veri, id compresi.                                                          */

test('nomeFileSet: il nome viene dall\'ID, non dal titolo che la rinomina cambia', () => {
    const prima = { id: 'set_1785417432805_ljgwl', title: '2.1 Project E — Flashcard' };
    const dopo  = { id: 'set_1785417432805_ljgwl', title: 'Project E — Flashcard' };
    assert.strictEqual(FC.nomeFileSet(prima), FC.nomeFileSet(dopo),
        'rinominare il progetto non deve produrre un secondo file per lo stesso set');
    assert.strictEqual(FC.nomeFileSet(dopo), 'set-set_1785417432805_ljgwl.json');
});

test('nomeFileSet: un id sporco non evade dalla cartella', () => {
    // punti e barre spariscono: nessun modo di scrivere fuori dalla cartella
    assert.strictEqual(FC.nomeFileSet({ id: '../../fuori' }), 'set-fuori.json');
    assert.strictEqual(FC.nomeFileSet({}), 'set-senza-id.json');
});

test('setsDelVault: scarta i set marcati per un\'ALTRA mappa', () => {
    const sets = [
        { id: 'a', title: 'Project E — Flashcard', _mappa: 'Project E' },
        { id: 'b', title: 'Elettricità — Flashcard', _mappa: 'Elettricità' }
    ];
    const out = FC.setsDelVault(sets, 'Project E');
    assert.deepStrictEqual(out.map(s => s.id), ['a']);
});

test('setsDelVault: un set SENZA marchio si accetta (i file vecchi non ce l\'hanno)', () => {
    const sets = [{ id: 'a', title: 'Project E — Flashcard' }];
    assert.strictEqual(FC.setsDelVault(sets, 'Project E').length, 1);
});

test('setsDelVault: deduplica per id, e vince il primo letto', () => {
    const sets = [
        { id: 'x', title: 'Project E — Flashcard' },          // project_e___…
        { id: 'x', title: '2.1 Project E — Flashcard' }       // 2_1_project_e___…
    ];
    const out = FC.setsDelVault(sets, 'Project E');
    assert.strictEqual(out.length, 1);
    assert.strictEqual(out[0].title, 'Project E — Flashcard');
});

test('setsDelVault: il caso VERO di Project E — da 9 set a 3', () => {
    const disco = [
        { id: 'set_1785417432805_ljgwl', title: 'Project E — Flashcard' },
        { id: 'set_1785417343004_0cp8w', title: 'Project E — Scelta Multipla' },
        { id: 'set_1785417395741_kpmgp', title: 'Project E — Vero o Falso' },
        { id: 'set_1785407316896_0p2lu', title: 'Elettricità — Flashcard', _mappa: 'Elettricità' },
        { id: 'set_1785407229397_25xmi', title: 'Elettricità — Scelta Multipla', _mappa: 'Elettricità' },
        { id: 'set_1785407278165_k32el', title: 'Elettricità — Vero o Falso', _mappa: 'Elettricità' },
        { id: 'set_1785417432805_ljgwl', title: '2.1 Project E — Flashcard' },
        { id: 'set_1785417343004_0cp8w', title: '2.1 Project E — Scelta Multipla' },
        { id: 'set_1785417395741_kpmgp', title: '2.1 Project E — Vero o Falso' }
    ];
    assert.strictEqual(FC.setsDelVault(disco, 'Project E').length, 3);
});

test('setsDelVault: il confronto fra nomi di mappa regge accenti e maiuscole', () => {
    const nfd = 'Elettricità';   // accento scomposto, come lo scrive macOS
    const nfc = 'Elettricità';
    const sets = [{ id: 'a', title: 'x', _mappa: nfd }];
    assert.strictEqual(FC.setsDelVault(sets, nfc).length, 1,
        'stessa mappa scritta nelle due forme: non va scartata');
});

test('setFileDaPotare: il file col nome vecchio dello stesso set se ne va', () => {
    const sets = [{ id: 'x', title: 'Project E — Flashcard' }];
    const suDisco = [
        { nome: 'set-x.json', id: 'x' },
        { nome: '2_1_project_e___flashcard_x.json', id: 'x' }
    ];
    assert.deepStrictEqual(FC.setFileDaPotare(suDisco, sets), ['2_1_project_e___flashcard_x.json']);
});

test('setFileDaPotare: se ne va anche il set che non è più fra i nostri', () => {
    const sets = [{ id: 'x' }];
    const suDisco = [{ nome: 'set-x.json', id: 'x' }, { nome: 'elettricit____flashcard_y.json', id: 'y' }];
    assert.deepStrictEqual(FC.setFileDaPotare(suDisco, sets), ['elettricit____flashcard_y.json']);
});

test('setFileDaPotare: con ZERO set non si pota niente', () => {
    // Un salvataggio che arriva senza set non deve svuotare la cartella.
    const suDisco = [{ nome: 'set-x.json', id: 'x' }, { nome: 'set-y.json', id: 'y' }];
    assert.deepStrictEqual(FC.setFileDaPotare(suDisco, []), []);
});

/* ══ MATERIALI CHE NOMINANO UN'ALTRA MAPPA ═══════════════════════════════════
   I casi qui sotto sono TUTTI veri, presi dai vault di Giacomo il 17/8: quelli
   che vanno segnalati e — soprattutto — quelli che una ricerca ingenua segnala
   a torto. La prima ricognizione ne diede 28: quattro veri e ventiquattro no. */

test('materialeEstraneo: il caso VERO — un PDF di Elettricità dentro Project E', () => {
    assert.strictEqual(
        FC.materialeEstraneo('Quiz-MC-Elettricità -VERDE.pdf', 'Project E', ['Elettricità', 'Il Clima']),
        'Elettricità');
});

test('materialeEstraneo: «Clima» dentro «Il Clima» NON è un estraneo', () => {
    // Esiste davvero una mappa «Clima» accanto a «Il Clima»: senza questa
    // regola tutti i materiali di «Il Clima» risultavano estranei.
    assert.strictEqual(
        FC.materialeEstraneo('Quiz-MC-Il Clima -VERDE.pdf', 'Il Clima', ['Clima']), '');
    assert.strictEqual(
        FC.materialeEstraneo('Studio-Il Clima-td-00.pdf', 'Il Clima', ['Clima']), '');
});

test('materialeEstraneo: un file che nomina la MIA mappa è di casa', () => {
    assert.strictEqual(
        FC.materialeEstraneo('Domande-aperte-Project E-causa.pdf', 'Project E', ['Elettricità']), '');
});

test('materialeEstraneo: un Focus porta il nome di un NODO, non di una mappa', () => {
    const altre = ['Geografia Fisica'];
    assert.strictEqual(
        FC.materialeEstraneo('Focus-Geografia Fisica-parentela.pdf', '4-6 Geografie', altre),
        'Geografia Fisica', 'senza l\'elenco dei nodi si segnala, ed è giusto');
    assert.strictEqual(
        FC.materialeEstraneo('Focus-Geografia Fisica-parentela.pdf', '4-6 Geografie', altre,
            ['Geografia Fisica', 'Clima']),
        '', 'se quel nodo esiste nella mappa, il file è di casa');
});

test('materialeEstraneo: il nome deve comparire come PAROLA, non dentro un\'altra', () => {
    // «Roma» non deve far scattare «Romagna»
    assert.strictEqual(FC.materialeEstraneo('Quiz-MC-Romagna.pdf', 'Storia', ['Romani']), '');
});

test('materialeEstraneo: le etichette corte non si usano (troppi falsi)', () => {
    assert.strictEqual(FC.materialeEstraneo('Quiz-MC-Il Po -VERDE.pdf', 'Fiumi', ['Po']), '');
});

test('materialeEstraneo: accenti nelle due forme, stessa mappa', () => {
    const nfd = 'Elettricità';   // scomposto, come lo scrive a volte macOS
    assert.strictEqual(FC.materialeEstraneo('Quiz-MC-Elettricità -VERDE.pdf', nfd, ['Il Clima']), '',
        'la mia mappa scritta nell\'altra forma non rende il file estraneo');
});

test('materialeEstraneo: un foglio nodi SENZA il nome della mappa non si può giudicare', () => {
    // È il difetto corretto il 17/8 in print-dossier: un nome muto non dice
    // niente, né a favore né contro. Non si segnala: non si sa.
    assert.strictEqual(FC.materialeEstraneo('Foglio-nodi-card -VERDE.pdf', 'Project E', ['Elettricità']), '');
});

test('nomeDiceLaMappa: un\'etichetta cambiata nel tempo si riconosce lo stesso', () => {
    // Il vault dichiara «1-2 Orientarsi nel Paesaggio», i suoi materiali dicono
    // solo «Orientarsi nel Paesaggio»: un confronto secco li darebbe per muti.
    assert.strictEqual(
        FC.nomeDiceLaMappa('Quiz-MC-Orientarsi nel Paesaggio -VERDE.pdf', '1-2 Orientarsi nel Paesaggio'), true);
});

test('nomeDiceLaMappa: muto è quello che non nomina nulla della mappa', () => {
    assert.strictEqual(FC.nomeDiceLaMappa('Foglio-nodi-card -VERDE.pdf', 'Project E'), false);
    assert.strictEqual(FC.nomeDiceLaMappa('Sintesi -VERDE.html', 'Il Clima'), false);
});

test('nomeDiceLaMappa: i numeri di capitolo non contano come nome', () => {
    // «5-6» non deve bastare a dire che il file è di «5-6 Morfologia…»
    assert.strictEqual(FC.nomeDiceLaMappa('Foglio-nodi-card -VERDE.pdf', '5-6 Morfologia & Demografia'), false);
    assert.strictEqual(FC.nomeDiceLaMappa('Quiz-MC-Morfologia & Demografia -VERDE.pdf', '5-6 Morfologia & Demografia'), true);
});

// ══ LA RETE DI SICUREZZA DEL VAULT (12/9/26) ════════════════════════════
// L'11 settembre una cartella con 42 nodi si è ritrovata con 14 e nessuno se
// n'è accorto. La soglia va tarata su quel caso e su ciò che NON deve scattare.

test('serveIstantanea: il caso vero (42 → 14) fa scattare la copia', () => {
  const r = FC.serveIstantanea(42, 14);
  assert.strictEqual(r.serve, true);
  assert.strictEqual(r.persi, 28);
  assert.match(r.perche, /da 42 a 14/);
});

test('serveIstantanea: un ritocco normale non fa scattare niente', () => {
  assert.strictEqual(FC.serveIstantanea(40, 39).serve, false, 'un nodo tolto a mano');
  assert.strictEqual(FC.serveIstantanea(40, 30).serve, false, 'un quarto in meno: ancora una potatura');
  assert.strictEqual(FC.serveIstantanea(42, 42).serve, false, 'nessun cambiamento');
  assert.strictEqual(FC.serveIstantanea(14, 42).serve, false, 'la mappa cresce');
});

test('serveIstantanea: servono ENTRAMBE le condizioni, quota e differenza', () => {
  /* con la sola quota, una mappa di tre nodi che ne perde uno (67%) farebbe una
     copia a ogni ritocco; con la sola differenza, duecento nodi che ne perdono
     otto verrebbero copiati per un'inezia */
  assert.strictEqual(FC.serveIstantanea(3, 2).serve, false, 'quota bassa ma differenza minima');
  assert.strictEqual(FC.serveIstantanea(200, 192).serve, false, 'differenza grande ma quota alta');
  assert.strictEqual(FC.serveIstantanea(20, 12).serve, true, 'entrambe: 60% e otto in meno');
});

test('serveIstantanea: una cartella vuota è una mappa nuova, non un restringimento', () => {
  assert.strictEqual(FC.serveIstantanea(0, 14).serve, false);
  assert.strictEqual(FC.serveIstantanea(null, 14).serve, false);
});

test('istantaneeDaPotare: tiene le ultime tre e ignora ciò che non è una data', () => {
  const nomi = ['20260901-101010', '20260902-101010', '20260903-101010', '20260904-101010', 'appunti', '.DS_Store'];
  assert.deepStrictEqual(FC.istantaneeDaPotare(nomi), ['20260901-101010'], 'via la più vecchia');
  assert.deepStrictEqual(FC.istantaneeDaPotare(nomi, 10), [], 'sotto il tetto non si pota');
  assert.deepStrictEqual(FC.istantaneeDaPotare([]), []);
});
