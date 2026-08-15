/*
 * mappai-files-core.js — logica PURA dell'organizzazione file (010)
 * -----------------------------------------------------------------------
 * Nessun accesso a fs/DOM/rete: solo funzioni deterministiche condivise tra
 * main.js (costruzione path, piano migrazione, parsing sessioni) e il
 * renderer (registro attività). Testabile con `node --test`.
 *
 *  - ROOT_FOLDER / SUB            → nome cartella madre unica + sottocartelle
 *  - slug / safeName              → slug filename-safe · nome cartella leggibile FS-safe
 *  - isoDate                      → AAAA-MM-GG (ordina cronologicamente in Finder)
 *  - classFolder / activityLabel  → segmento classe · etichetta attività leggibile
 *  - sessionFolderName            → "2026-07-12 · Quiz · Fotosintesi (— ramo)"
 *  - sessionRelPath               → Attività di studio/<Classe>/<cartella sessione>
 *  - LEGACY / planMigration       → mappa cartelle storiche → nuova struttura + piano move
 *  - REPORT_FILES / sessionRecordFrom → riga del registro attività (Part 3)
 *
 * UMD: module.exports per Node, window.MappAIFilesCore per il browser.
 */
(function () {
  'use strict';

  // Cartella madre unica scelta dall'utente. Le sottocartelle vivono dentro.
  var ROOT_FOLDER = 'MappAI - file';
  var SUB = {
    maps: 'Mappe',                 // ex "MappAI - Vault" (Obsidian)
    activity: 'Attività di studio', // sessioni live/tutor/lavagna + report
    shared: 'File condivisi',      // ex "MappAI - Materiali docente"
    classes: 'Classi',             // ex "MappAI - Classi"
    gardens: 'Giardini',           // ex "MappAI - Knowledge Garden"
    /* Allievi (2/8): una cartella per allievo, dove finisce la sua tessera di
       accesso. Non ha una cartella storica da cui migrare — nasce qui, e chi ha
       già migrato non ce l'ha: si crea alla prima scrittura, non al setup. */
    students: 'Allievi'
  };

  // Cartelle storiche in ~/Documents → destinazione nella nuova struttura.
  // kind: 'sessions' = ha sottocartelle-sessione da ribucketare per classe;
  //       'flat' = si sposta l'intero contenuto nella sub; 'vault' = idem (Mappe).
  var LEGACY = [
    { old: 'MappAI - Vault', sub: 'maps', kind: 'vault' },
    { old: 'MappAI - Live', sub: 'activity', kind: 'sessions' },
    { old: 'MappAI - Tutor', sub: 'activity', kind: 'sessions' },
    { old: 'MappAI - Lavagna', sub: 'activity', kind: 'sessions' },
    { old: 'MappAI - Knowledge Garden', sub: 'gardens', kind: 'flat' },
    { old: 'MappAI - Materiali docente', sub: 'shared', kind: 'flat' },
    { old: 'MappAI - Classi', sub: 'classes', kind: 'flat' }
  ];

  function slug(s) {
    return String(s == null ? '' : s).toLowerCase().normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'x';
  }

  // Nome cartella/file LEGGIBILE ma FS-safe: conserva spazi e accenti, rimuove
  // solo i caratteri illegali su macOS/Windows e il punto/spazio finale.
  function safeName(s, fallback) {
    var out = String(s == null ? '' : s)
      .replace(/[\/\\:*?"<>|\u0000-\u001f]/g, ' ')
      .replace(/\s+/g, ' ').trim()
      .replace(/[. ]+$/, '');
    return out || (fallback || '');   // niente 'x' implicito: il chiamante sceglie il fallback
  }

  function pad2(n) { return String(n).padStart(2, '0'); }

  // AAAA-MM-GG dalla data (ms, Date o ISO); default = ora.
  function isoDate(d) {
    var x = d ? new Date(d) : new Date();
    if (isNaN(x.getTime())) x = new Date();
    return x.getFullYear() + '-' + pad2(x.getMonth() + 1) + '-' + pad2(x.getDate());
  }

  function classFolder(className) {
    return safeName(className, 'Senza classe');
  }

  // ── Naming cartelle di classe / vault mappa (011) ───────────────────────
  // Nome cartella-classe che contiene i vault-mappa: "<sede>-<classe>" se la
  // classe ha una sede, altrimenti solo la classe (fallback 'Senza classe').
  function mapClassFolder(sede, className) {
    var s = safeName(sede, '');
    if (s) {
      var hasClass = className != null && String(className).trim() !== '';
      return safeName(hasClass ? (s + '-' + className) : s, 'Senza classe');
    }
    return classFolder(className);
  }

  // Nome cartella del vault-mappa dal titolo del progetto (fallback 'Mappa').
  function vaultFolderName(rootLabel) {
    return safeName(rootLabel, 'Mappa');
  }

  /* ── IL TITOLO DEL PROGETTO (14/8) ────────────────────────────────────────
     Il titolo del progetto E il nome della cartella del vault sono LA STESSA
     COSA (`vaultFolderName` lo prende di lì): quindi il titolo non può contenere
     ciò che una cartella non ammette. Prima la ripulitura viveva sparsa — un
     `replace` nel ramo KG di `startGeneration`, `safeName` al momento di scrivere
     su disco — e chi scriveva il titolo a mano ne restava fuori: da un PDF
     nasceva un progetto «Il Clima.pdf», e la cartella si chiamava così.
     Qui la regola è una sola, pura e provata.

     `titoloDaFile` = dal NOME DI UN FILE: toglie l'estensione e rende i
     separatori dei file (trattino basso, trattino) spazi, perché in un nome di
     file stanno al posto degli spazi. `titoloProgetto` = da un titolo QUALUNQUE
     (scritto a mano o dedotto): toglie una coda che è chiaramente un'estensione
     e sanifica per il filesystem, ma NON tocca i trattini — «Storia 1914-1918»
     è un titolo, non un nome di file. */
  var ESTENSIONI = [
    'pdf', 'doc', 'docx', 'odt', 'rtf', 'txt', 'md', 'csv', 'tsv', 'epub',
    'ppt', 'pptx', 'xls', 'xlsx', 'json', 'html', 'htm', 'xml',
    'mp3', 'wav', 'm4a', 'aac', 'ogg', 'flac', 'mp4', 'mov', 'webm', 'mkv', 'avi',
    'png', 'jpg', 'jpeg', 'webp', 'gif'
  ];
  var RE_EST = new RegExp('\\.(' + ESTENSIONI.join('|') + ')\\s*$', 'i');

  function titoloProgetto(raw, fallback) {
    var s = String(raw == null ? '' : raw).trim();
    /* Due giri: «appunti.pdf.pdf» capita, e una coda sola lascerebbe l'altra. */
    for (var i = 0; i < 2 && RE_EST.test(s); i++) s = s.replace(RE_EST, '').trim();
    return safeName(s, fallback == null ? '' : fallback);
  }

  function titoloDaFile(fileName, fallback) {
    var s = String(fileName == null ? '' : fileName).trim();
    /* qui l'estensione si toglie SEMPRE, anche se non è fra quelle note: è un
       nome di file, l'ultimo punto è l'estensione per definizione */
    s = s.replace(/\.[^/.\s]{1,8}\s*$/, '');
    s = s.replace(/[_-]+/g, ' ');
    return titoloProgetto(s, fallback);
  }

  // Segmento DISCIPLINA dentro il contenitore di classe (29/7). '' = nessun
  // livello disciplina → il vault resta figlio diretto della classe (comportamento
  // storico, mai rotto per le classi senza discipline assegnate).
  function disciplineFolder(discipline) {
    return safeName(discipline, '');
  }

  /* «Generico» (15/8 sera): il contenitore dei vault SENZA classe. Prima
     restavano piatti in Mappe/, mescolati agli export .json; ora stanno in
     Mappe/Generico/<vault>. È un NOME RISERVATO, dichiarato qui e basta:
     chi scrive lo usa (mapVaultParents), chi legge lo RITRADUCE in classDir
     null (classDirDaCartella) — perché get-all-vaults deduce la classe dalla
     POSIZIONE, e senza la ritraduzione «Generico» diventerebbe una classe
     fantasma nei chip e nei filtri, e i progetti generici (classDir null)
     perderebbero la loro mappa. Sotto Generico NON ci sono sottocartelle di
     materia. Non è in VAULT_CONTAINER_EXCLUDE: va scandito come contenitore. */
  var GENERICO = 'Generico';

  // Il lettore ritraduce il nome del contenitore in classDir: Generico → null.
  function classDirDaCartella(nome) {
    var n = String(nome == null ? '' : nome);
    if (!n || n === GENERICO) return null;
    return n;
  }

  // Segmenti RELATIVI a Mappe/ del vault di una mappa:
  //   [Generico] senza classe · [classe] · [classe, disciplina]
  // Unica fonte del nesting: renderer (auto-vault, backfill, pipeline) e main.js
  // costruiscono il path da qui, non concatenando a mano. I vault piatti già
  // su disco (comportamento storico) restano leggibili: qui si decide solo dove
  // vanno quelli NUOVI.
  function mapVaultParents(classDir, discipline) {
    var c = safeName(classDir, '');
    if (!c) return [GENERICO];
    var d = disciplineFolder(discipline);
    return d ? [c, d] : [c];
  }

  /* Radice del vault di una mappa (2/8). Con un profilo ALLIEVO attivo le mappe
     non stanno in «Mappe» insieme a quelle di classe: vivono dentro la cartella
     di quell'allievo, «Allievi/<nome>/Mappe». Il motivo è di sostanza, non di
     ordine — una mappa fatta per un allievo con misure compensative è materiale
     suo, e mescolarla a quelle della classe ne perde la destinazione.
     Classe e allievo si escludono a vicenda (lo impone già il contesto attivo),
     quindi con l'allievo non c'è nesting di classe/disciplina.
     `basi` = { maps, students } da `files-root-get`. */
  function mapVaultRoot(basi, allievo) {
    var a = safeName(allievo, '');
    if (!a || !basi || !basi.students) return (basi && basi.maps) || '';
    return [basi.students, a, SUB.maps].join('/');
  }
  /* I segmenti di classe/disciplina valgono SOLO fuori dalla cartella di un
     allievo: dentro, il percorso è già personale. */
  function mapVaultParentsFor(allievo, classDir, discipline) {
    return safeName(allievo, '') ? [] : mapVaultParents(classDir, discipline);
  }

  // Sanitizzazione del percorso relativo scritto dentro un vault dalla pipeline
  // (constitution V). Ammessi SOLO: un file nel root del vault (es. pipeline.json),
  // un file dentro 'Materiale Studio/' oppure dentro 'Fonti/' (PDF originali
  // delle fonti, 22/7/26 — anteprima ELABORA persistente). Nega `..`, path
  // assoluti, drive Windows, caratteri illegali. Ritorna il path normalizzato
  // (forward slash) o null se illegale — il chiamante (main.js) NON reimplementa
  // le regole.
  function sanitizeVaultRelPath(relPath) {
    var raw = String(relPath == null ? '' : relPath).replace(/\\/g, '/').trim();
    if (!raw) return null;
    if (raw.charAt(0) === '/' || /^[a-zA-Z]:/.test(raw)) return null;   // assoluto / drive
    var segs = raw.split('/').filter(function (s) { return s !== '' && s !== '.'; });
    if (!segs.length || segs.indexOf('..') >= 0) return null;
    for (var i = 0; i < segs.length; i++) {
      if (safeName(segs[i], '') !== segs[i]) return null;              // illegali / trailing
    }
    if (segs.length === 1) return segs[0];                            // file nel root
    /* 'Allegati' (2/8): il PDF ORIGINALE della fonte, quando la pipeline è
       chiesta di conservarlo accanto ai materiali. È la cartella che il
       contratto del vault già prevede per i media, e resta separata da 'Fonti',
       dove ELABORA mette gli originali che gli servono per l'anteprima. */
    if (segs.length === 2 && (segs[0] === 'Materiale Studio' || segs[0] === 'Fonti' || segs[0] === 'Allegati')) return segs.join('/');
    return null;
  }

  // Cartelle note NON-vault dentro Mappe/: escluse dalla scansione a 2 livelli
  // (contenitori di sistema, mai vault) — main.js importa questa costante.
  var VAULT_CONTAINER_EXCLUDE = ['Chat', 'Quiz e Flashcard', 'Studio Attivo'];

  // Codici attività → etichetta leggibile. Passa-attraverso in Title Case se ignoto.
  var ACT = {
    quiz: 'Quiz', 'vero-falso': 'Vero-Falso', cloze: 'Cloze',
    domande: 'Domande', 'domande-mie': 'Domande',
    tutor: 'Tutor AI', 'chatta-e-scrivi': 'Tutor AI',
    lavagna: 'Lavagna', timeline: 'Timeline', costruzione: 'Timeline',
    materiali: 'Materiali', live: 'Studio attivo'
  };
  function activityLabel(a) {
    var k = slug(a);
    if (ACT[k]) return ACT[k];
    var raw = safeName(a, '');
    return raw ? raw.charAt(0).toUpperCase() + raw.slice(1) : 'Attività';
  }

  // Nome cartella sessione: "2026-07-12 · Quiz · Fotosintesi" (+ " — <ramo>").
  // Deterministico da (date, activity, map, scope) → resume idempotente nello stesso giorno.
  function sessionFolderName(o) {
    o = o || {};
    var base = [isoDate(o.date), activityLabel(o.activity), safeName(o.map, 'Mappa')].join(' · ');
    if (o.scope) base += ' — ' + safeName(o.scope, '');
    return safeName(base, 'sessione');
  }

  // Path RELATIVO alla cartella madre: Attività di studio/<Classe>/<cartella sessione>.
  function sessionRelPath(o) {
    return [SUB.activity, classFolder(o && o.className), sessionFolderName(o)];
  }

  // Progressivo somministrazioni: più quiz per la stessa classe/mappa lo STESSO giorno
  // non devono ricadere sulla stessa cartella (→ ripresa della sessione precedente,
  // spesso già CHIUSA). Dato l'elenco delle cartelle già presenti nel genitore e il
  // nome base (senza suffisso), ritorna { next, last, maxSeq }:
  //   next  = suffisso NN (≥2 cifre) della PROSSIMA somministrazione ('00' se è la prima)
  //   last  = nome cartella col seq più alto già presente (null se nessuna) → il chiamante
  //           decide se RIPRENDERLA (crash-safe, se ancora aperta) o crearne una nuova
  //   maxSeq= seq massimo trovato (-1 se nessuna)
  // Match solo su "<baseName><sep><cifre>" → cartelle di attività diverse non interferiscono.
  function sessionSeq(existing, baseName, sep) {
    sep = (sep == null) ? ' · ' : sep;
    var esc = function (s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); };
    var rx = new RegExp('^' + esc(baseName) + esc(sep) + '(\\d{2,})$');
    var max = -1, last = null;
    (existing || []).forEach(function (nm) {
      var m = String(nm).match(rx);
      if (m) { var n = parseInt(m[1], 10); if (n > max) { max = n; last = String(nm); } }
    });
    return { next: String(max + 1).padStart(2, '0'), last: last, maxSeq: max };
  }

  // ── Piano di migrazione ─────────────────────────────────────────────────
  // Input: array descrittivo di ciò che è su disco (main.js lo costruisce con fs):
  //   [{ old:'MappAI - Live', kind:'sessions', sub:'activity',
  //      children:[{ folder:'foo-quiz-1a-...', className:'1ª A' }] }, ...]
  // Output: { moves:[{ from:['MappAI - Live','foo...'], to:['Attività di studio','1ª A','foo...'] }],
  //           dirs:[['Attività di studio','1ª A'], ...] }  — path relativi (array di segmenti).
  function planMigration(legacyOnDisk) {
    var moves = [], dirSet = Object.create(null), dirs = [];
    function ensureDir(segs) {
      var key = segs.join('/');
      if (dirSet[key]) return;
      dirSet[key] = true; dirs.push(segs);
    }
    (legacyOnDisk || []).forEach(function (L) {
      var subName = SUB[L.sub] || L.sub;
      if (L.kind === 'sessions') {
        ensureDir([subName]);
        (L.children || []).forEach(function (c) {
          var cls = classFolder(c.className);
          ensureDir([subName, cls]);
          moves.push({ from: [L.old, c.folder], to: [subName, cls, c.folder] });
        });
      } else {
        // flat/vault: sposta l'INTERO contenuto della cartella dentro la sub.
        ensureDir([subName]);
        (L.children || []).forEach(function (c) {
          moves.push({ from: [L.old, c.folder], to: [subName, c.folder] });
        });
      }
    });
    return { moves: moves, dirs: dirs };
  }

  // ── Registro attività (Part 3) ──────────────────────────────────────────
  var REPORT_FILES = {
    'report-domande.html': { which: 'questions', label: 'Report domande' },
    'report-studenti.html': { which: 'students', label: 'Report studenti' },
    'report-costruzione.html': { which: 'workshop', label: 'Report costruzione' },
    'report-tutor.html': { which: 'tutor', label: 'Report tutor' }
  };
  function reportMeta(fileName) {
    if (REPORT_FILES[fileName]) {
      return { which: REPORT_FILES[fileName].which, label: REPORT_FILES[fileName].label, file: fileName };
    }
    // report-<x>.html sconosciuto → etichetta dal nome
    var m = /^report-(.+)\.html$/i.exec(fileName);
    var lab = m ? m[1].replace(/[-_]+/g, ' ') : fileName;
    return { which: slug(lab), label: 'Report ' + lab, file: fileName };
  }

  // Costruisce la riga del registro da (session.json, results.json, file report).
  //   o: { folder, activityType, session (obj json), results (obj|null), reportFiles ([nomi]) }
  // participants/total robusti alle due forme (live: joined/absent; tutor: students/roster).
  function sessionRecordFrom(o) {
    o = o || {};
    var json = o.session || {};
    var s = json.session || json;            // session.json annida in .session
    var res = o.results || null;
    var roster = Array.isArray(json.roster) ? json.roster.length
      : (res && typeof res.joined === 'number' && typeof res.absent === 'number' ? res.joined + res.absent : null);
    var joinedArr = Array.isArray(json.students) ? json.students.length
      : (Array.isArray(res && res.students) ? res.students.length : null);
    var participants = res && typeof res.joined === 'number' ? res.joined
      : (joinedArr != null ? joinedArr : 0);
    var total = roster != null ? roster : (participants || 0);

    var reports = (o.reportFiles || [])
      .filter(function (f) { return /^report-.*\.html$/i.test(f); })
      .map(reportMeta)
      // ordine stabile: domande, studenti, poi il resto
      .sort(function (a, b) {
        var rank = { questions: 0, students: 1, workshop: 2, tutor: 2 };
        return (rank[a.which] == null ? 9 : rank[a.which]) - (rank[b.which] == null ? 9 : rank[b.which]);
      });

    return {
      folder: o.folder || '',
      activityType: o.activityType || '',
      activity: activityLabel(s.activity || o.activityType),
      map: safeName(s.name, '') || '',
      scope: s.scope ? safeName(s.scope, '') : '',   // '' = tutta la mappa
      className: s.className || '',
      date: s.closedAt || s.startedAt || s.runningAt || null,
      closed: !!s.closedAt,
      participants: participants,
      total: total,
      reports: reports
    };
  }

  var CORE = {
    ROOT_FOLDER: ROOT_FOLDER,
    SUB: SUB,
    LEGACY: LEGACY,
    slug: slug,
    safeName: safeName,
    isoDate: isoDate,
    classFolder: classFolder,
    mapClassFolder: mapClassFolder,
    vaultFolderName: vaultFolderName,
    titoloProgetto: titoloProgetto,
    titoloDaFile: titoloDaFile,
    disciplineFolder: disciplineFolder,
    GENERICO: GENERICO,
    classDirDaCartella: classDirDaCartella,
    mapVaultParents: mapVaultParents,
    mapVaultRoot: mapVaultRoot,
    mapVaultParentsFor: mapVaultParentsFor,
    sanitizeVaultRelPath: sanitizeVaultRelPath,
    VAULT_CONTAINER_EXCLUDE: VAULT_CONTAINER_EXCLUDE,
    activityLabel: activityLabel,
    sessionFolderName: sessionFolderName,
    sessionRelPath: sessionRelPath,
    sessionSeq: sessionSeq,
    planMigration: planMigration,
    REPORT_FILES: REPORT_FILES,
    reportMeta: reportMeta,
    sessionRecordFrom: sessionRecordFrom
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = CORE;
  if (typeof window === 'undefined') return;
  window.MappAIFilesCore = CORE;
  console.log('[MappAIFilesCore] logica pura organizzazione file caricata');
})();
