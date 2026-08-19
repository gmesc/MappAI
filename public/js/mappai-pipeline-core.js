/*
 * mappai-pipeline-core.js — logica PURA della pipeline «Genera materiali» (011)
 * -----------------------------------------------------------------------
 * Nessun accesso a fs/DOM/rete: solo funzioni deterministiche condivise tra
 * l'orchestratore UI (mappai-material-pipeline.js) e i test Node. Il manifest
 * entra ed esce come oggetto; le scritture su disco le fa l'orchestratore via IPC.
 *
 *  - createManifest / stepTransition / normalizeOnLoad → schema + macchina a stati
 *  - validateMapResult / validateQuizItems / validatePdfB64 / validateSynthesis
 *  - estimateCalls                → stima chiamate AI per la config
 *  - buildFileName                → nomi file canonici (con marcatore -VERDE)
 *  - presetNormalize / presetFromConfig → preset riusabili (US3)
 *
 * UMD: module.exports per Node, window.MappAIPipelineCore per il browser.
 * Constitution VI: logica pura testata (tests/pipeline-core.test.js).
 */
(function () {
  'use strict';

  var SCHEMA = 'mappai-pipeline@1';
  /* E = «Catena dei perché», materiale INDIPENDENTE (5/8, decisione di Giacomo).
     Prima la catena era un'opzione dei fogli nodi (`nodesheet.causal`) e le sue
     pagine finivano dentro quel PDF: non la si poteva avere senza chiedere anche
     i fogli. Ora è un passo suo, con un PDF suo in «Materiale Studio/».
     ⚠️ Lo schema resta `@1` e i manifest già su disco non hanno la chiave E:
     `normalizeOnLoad` la aggiunge come 'skipped', altrimenti `isComplete`
     leggerebbe `undefined` e una pipeline finita risulterebbe da riprendere. */
  var STEPS = ['A', 'B', 'C', 'D', 'E'];

  // Riuso safeName da files-core (già caricato in index.html PRIMA di questo file;
  // require in Node). Fallback locale se assente, per non accoppiare i test.
  var FC = (function () {
    try {
      if (typeof require !== 'undefined' && typeof window === 'undefined') return require('./mappai-files-core.js');
    } catch (e) { /* noop */ }
    return (typeof window !== 'undefined' && window.MappAIFilesCore) ? window.MappAIFilesCore : null;
  })();
  function _safeName(s, fb) {
    if (FC && FC.safeName) return FC.safeName(s, fb);
    var out = String(s == null ? '' : s)
      .replace(/[\/\\:*?"<>|\x00-\x1f]/g, ' ').replace(/\s+/g, ' ').trim()
      .replace(/[. ]+$/, '');
    return out || (fb || '');
  }

  function clone(o) { return o == null ? o : JSON.parse(JSON.stringify(o)); }
  function nowIso(now) {
    if (now) return String(now);
    try { return new Date().toISOString(); } catch (e) { return ''; }
  }

  /* «C'è almeno un materiale da produrre?» — UNA definizione.
     Stava scritta a mano in tre punti dell'orchestratore (avvio, stima, preset):
     aggiungendo la catena come materiale indipendente bisognava ricordarsi di
     tutti e tre, e chi ne dimentica uno ottiene un bottone che parte e non
     produce niente. Sta qui perché è la stessa domanda che decide quali step
     nascono 'pending' in `createManifest`, ed è ciò che il bento chiede per
     sapere se il suo bottone dice «Genera materiali» o «Genera Mappa». */
  function hasOutput(config) {
    if (!config) return false;
    return !!(config.quiz || config.nodesheet || config.synthesis || config.causal);
  }

  // ── Manifest: creazione ─────────────────────────────────────────────────
  // I passi non richiesti dalla config nascono 'skipped'; A è sempre 'pending'.
  function createManifest(config, opts) {
    opts = opts || {};
    var stamp = nowIso(opts.now);
    config = config || {};
    var steps = {};
    steps.A = { status: 'pending', files: [] };
    steps.B = { status: config.quiz ? 'pending' : 'skipped', files: [] };
    steps.C = { status: config.nodesheet ? 'pending' : 'skipped', files: [] };
    steps.D = { status: config.synthesis ? 'pending' : 'skipped', files: [] };
    steps.E = { status: config.causal ? 'pending' : 'skipped', files: [] };
    return {
      schema: SCHEMA,
      createdAt: stamp,
      updatedAt: stamp,
      config: clone(config),
      vaultPath: opts.vaultPath || '',
      steps: steps
    };
  }

  // ── Manifest: macchina a stati ──────────────────────────────────────────
  var ALLOWED = {
    pending: ['running', 'skipped'],
    running: ['done', 'failed'],
    failed: ['running'],
    done: [],
    skipped: []
  };

  // Ritorna un NUOVO manifest con la transizione applicata; lancia su transizione
  // vietata o su avvio di B/C/D senza A done. extra = { now, files, calls, error }.
  function stepTransition(manifest, step, status, extra) {
    if (!manifest || !manifest.steps || !manifest.steps[step]) {
      throw new Error('step sconosciuto: ' + step);
    }
    extra = extra || {};
    var m = clone(manifest);
    var rec = m.steps[step];
    var from = rec.status;
    if ((ALLOWED[from] || []).indexOf(status) < 0) {
      throw new Error('transizione vietata: ' + step + ' ' + from + '→' + status);
    }
    if (status === 'running' && step !== 'A' && (!m.steps.A || m.steps.A.status !== 'done')) {
      throw new Error('step ' + step + ' richiede A done');
    }
    rec.status = status;
    if (status === 'running') {
      rec.startedAt = nowIso(extra.now);
      delete rec.error;
      rec.files = [];   // tentativo fresco: rigenera tutti i file dello step (retry pulito)
    }
    if (status === 'done' || status === 'failed') rec.endedAt = nowIso(extra.now);
    if (extra.files) rec.files = extra.files.slice();
    if (typeof extra.calls === 'number') rec.calls = extra.calls;
    if (extra.error != null) rec.error = String(extra.error);
    m.updatedAt = nowIso(extra.now);
    return m;
  }

  // Alla riapertura: 'running' = crash → 'failed' con error 'interrotto'.
  // I file già elencati restano validi (scritti prima della transizione).
  // Forward-compat: campi ignoti preservati dalla clone JSON.
  function normalizeOnLoad(manifest) {
    var m = clone(manifest);
    if (!m || !m.steps) return m;
    STEPS.forEach(function (k) {
      /* ⚠️ Retro-compatibilità (DAL Protocol): i manifest scritti prima dello
         step E non hanno quella chiave. Senza questo fallback `isComplete`
         troverebbe `undefined` — né done né skipped — e una pipeline conclusa
         verrebbe riproposta come «da riprendere» a ogni apertura del vault. */
      if (!m.steps[k]) { m.steps[k] = { status: 'skipped', files: [] }; return; }
      var rec = m.steps[k];
      if (rec.status === 'running') { rec.status = 'failed'; rec.error = 'interrotto'; }
    });
    return m;
  }

  // Tutti i passi non-skipped sono done? → pipeline completa.
  function isComplete(manifest) {
    if (!manifest || !manifest.steps) return false;
    return STEPS.every(function (k) {
      var st = manifest.steps[k] && manifest.steps[k].status;
      return st === 'done' || st === 'skipped';
    });
  }

  // ── Validatori di step (crash-safety, research R7) ──────────────────────
  // La pipeline non si fida MAI dell'assenza di errori: convalida i DATI.
  function validateMapResult(db, minNodes) {
    minNodes = (typeof minNodes === 'number') ? minNodes : 5;
    if (!db || !Array.isArray(db.nodes)) return { ok: false, error: 'nessun nodo generato' };
    var nodes = db.nodes;
    if (nodes.length < minNodes) return { ok: false, error: 'mappa troppo piccola (' + nodes.length + ' < ' + minNodes + ' nodi)' };
    // Presenza L0/L1 SOLO se i livelli esistono (KG può non averli).
    var levels = nodes.map(function (n) { return n && n.level; }).filter(function (l) { return typeof l === 'number'; });
    if (levels.length && !levels.some(function (l) { return l === 0 || l === 1; })) {
      return { ok: false, error: 'nessun nodo radice/L1' };
    }
    return { ok: true, nodes: nodes.length };
  }

  function validateQuizItems(items) {
    if (!Array.isArray(items) || items.length === 0) return { ok: false, error: 'quiz vuoto (0 item)' };
    return { ok: true, count: items.length };
  }

  /* ══ LA GRADUAZIONE DI UN FOGLIO DI DOMANDE (13/8 sera) ═══════════════════
     Un foglio in cui OGNI domanda richiede tutta la scheda è un foglio su cui
     l'allievo che ne sa metà scrive zero righe — e da un foglio bianco non si
     impara niente. Servono domande d'AVVIO: quelle che si risolvono con UN
     concetto ripreso da ciò che il testo dice, senza collegarne altri.

     ⚠️ La facilità è definita per COSA SERVE PER RISPONDERE, non per una
     percentuale di contenuti: «bastano il 50% dei contenuti» è una richiesta
     che un modello linguistico non sa verificare — non conta i concetti di una
     scheda, e obbedirebbe a parole. «Una domanda risolvibile con un concetto
     solo» invece è una proprietà della domanda, che il modello può DICHIARARE
     item per item (`livello`) e che qui si CONTA.
       · base  → un concetto, esplicito nel testo: chi ha studiato metà scheda
                 può rispondere;
       · ponte → collega due o più concetti, o applica a un caso nuovo.
     La proporzione la chiede il docente in percentuale; qui diventa un numero
     di domande, che è ciò che si può controllare.                            */
  function quotaBase(n, pct) {
    var tot = Math.max(0, parseInt(n, 10) || 0);
    var p = parseInt(pct, 10);
    if (isNaN(p)) p = 0;
    p = Math.max(0, Math.min(100, p));
    if (!tot || !p) return 0;
    /* si ARROTONDA, ma con una rete ai due estremi: una percentuale > 0 deve
       dare almeno una domanda d'avvio (altrimenti la leva non fa nulla e
       sembra rotta), e sotto il 100% almeno una domanda ponte deve restare */
    var b = Math.round(tot * p / 100);
    if (p > 0 && b < 1) b = 1;
    if (p < 100 && b >= tot) b = tot - 1;
    return b;
  }
  /* Che cosa è arrivato davvero: il modello dichiara, noi contiamo. Serve a
     dirlo (nel foglio soluzioni, nel registro) invece di fidarsi. */
  function contaGraduazione(items) {
    var base = 0, ponte = 0;
    (items || []).forEach(function (it) {
      if (it && String(it.livello || it.level || '').toLowerCase() === 'base') base++;
      else ponte++;
    });
    return { base: base, ponte: ponte, tot: base + ponte };
  }
  /* Le domande d'avvio PRIMA, dentro il loro gruppo. Un foglio si comincia da
     ciò che si sa: iniziare con la domanda più difficile è il modo più rapido
     per far smettere di provare.
     ⚠️ L'ordine si rimescola SOLO dentro lo stesso gruppo (`aree`/`l1`): il
     foglio è organizzato per macro-area, e un riordino globale lo scomporrebbe.
     Stabile: a parità di livello resta l'ordine di generazione. */
  function ordinaGraduazione(items) {
    var arr = (items || []).slice();
    var gruppi = [], indice = {};
    arr.forEach(function (it, i) {
      var k = String((it && (it.l1 || (it.areas || [])[0])) || '');
      if (!(k in indice)) { indice[k] = gruppi.length; gruppi.push([]); }
      gruppi[indice[k]].push({ it: it, i: i });
    });
    var fuori = [];
    gruppi.forEach(function (g) {
      g.map(function (x, j) { return { x: x, j: j }; })
        .sort(function (a, b) {
          var la = String((a.x.it && a.x.it.livello) || '').toLowerCase() === 'base' ? 0 : 1;
          var lb = String((b.x.it && b.x.it.livello) || '').toLowerCase() === 'base' ? 0 : 1;
          return (la - lb) || (a.j - b.j);
        })
        .forEach(function (o) { fuori.push(o.x.it); });
    });
    return fuori;
  }

  function validatePdfB64(b64) {
    if (typeof b64 !== 'string') return { ok: false, error: 'PDF assente' };
    var s = /^data:/i.test(b64) && b64.indexOf(',') >= 0 ? b64.slice(b64.indexOf(',') + 1) : b64;
    if (s.length < 100) return { ok: false, error: 'PDF vuoto (0 byte)' };
    return { ok: true };
  }

  // data = forma _lastSynthesis. Due varianti:
  //  - ramo singolo: { rawText, sourcesArr }
  //  - mappa intera: { whole:true, intro, sections:[{ rawText | failed }] }
  // ⚠️ `whole` è un FLAG booleano, NON testo: mai usarlo come contenuto.
  function validateSynthesis(data) {
    if (!data) return { ok: false, error: 'sintesi vuota' };
    var parts = [];
    if (data.rawText) parts.push(String(data.rawText));
    if (data.intro) parts.push(String(data.intro));
    if (Array.isArray(data.sections)) {
      data.sections.forEach(function (s) {
        if (s && (s.rawText || s.text || s.body)) parts.push(String(s.rawText || s.text || s.body));
      });
    }
    var text = parts.join(' ').trim();
    if (text.length < 20) return { ok: false, error: 'sintesi senza testo' };
    return { ok: true };
  }

  /* ══ PIÙ SET PER ANGOLO ════════════════════════════════════════════════════
     Gli angoli sono quelli del motore dei quiz (`QUIZ_ANGLES` in
     mappai-study-session.js): qui stanno le sole CHIAVI, e si leggono da lì
     quando la finestra c'è — un secondo elenco divergerebbe al primo angolo
     aggiunto. `auto` resta fuori di proposito: un foglio «misto» in mezzo ai
     sette angolati confonde il profilo di chi poi sceglie fra le versioni. */
  var _ANGOLI_FALLBACK = ['definizione', 'causa', 'conseguenza', 'esempio', 'confronto', 'eccezione', 'applicazione'];
  function angoliMulti() {
    var src = (typeof window !== 'undefined' && window.QUIZ_ANGLES) || null;
    if (!src || !src.length) return _ANGOLI_FALLBACK.slice();
    return src.map(function (a) { return a && a.key; })
      .filter(function (k) { return k && k !== 'auto'; });
  }
  /* Il nome dell'angolo nel FILE e nel titolo: la CHIAVE, breve e minuscola —
     `Domande-aperte-<Mappa>-causa`. Non l'etichetta a schermo, che direbbe
     «Esempio concreto» e produrrebbe `…-Automatico (misto).pdf`. `auto` si
     legge «misto», ed è la convenzione che Giacomo usava già a mano. */
  function nomeAngolo(k) { return String(k || '') === 'auto' ? 'misto' : String(k || ''); }

  /* QUALI angoli: le spunte del box. Non c'è più un interruttore generale —
     spegnere tutte le caselle È lo spegnimento, e una casella per angolo dice
     anche QUALI, cosa che un interruttore solo non poteva dire. */
  function angoliScelti(quiz) {
    var disp = angoliMulti();
    var a = (quiz && Array.isArray(quiz.angoli)) ? quiz.angoli : null;
    if (!a) return [];                       /* niente scelte = nessuna variante */
    return disp.filter(function (k) { return a.indexOf(k) >= 0; });   /* ordine dichiarato */
  }

  /* Su quali generi si applica: solo dove un angolo cambia davvero la domanda.
     Flashcard e vero/falso restano a una generazione sola. */
  var _VALID_MULTI = ['open', 'mc'];
  function multiTypes(quiz) {
    var m = (quiz && Array.isArray(quiz.multi)) ? quiz.multi : [];
    var types = (quiz && quiz.types) || [];
    /* senza nemmeno un angolo spuntato non c'è niente da moltiplicare: il
       genere torna a una generazione sola (e la stima lo dice) */
    if (!angoliScelti(quiz).length) return [];
    return m.filter(function (t, i) {
      return _VALID_MULTI.indexOf(t) >= 0 && m.indexOf(t) === i && types.indexOf(t) >= 0;
    });
  }

  // ── Stima chiamate AI ───────────────────────────────────────────────────
  // mapStats = { branches, nodes, willGenerateMap?, keywordBatch?, audioBlocks? }
  function estimateCalls(config, mapStats) {
    config = config || {}; mapStats = mapStats || {};
    var branches = mapStats.branches || 0;
    var nodes = mapStats.nodes || 0;
    var A = 0, B = 0, C = 0, D = 0, E = 0;   /* E resta 0: la catena è deterministica */
    // A: informativa (multi-pass ~ rami + 2); non vincolante.
    if (mapStats.willGenerateMap !== false) A = branches ? (branches + 2) : 3;
    /* B: rami × tipi quiz selezionati — e un tipo generato per angolo conta
       una volta per angolo (è la ragione per cui la stima è nel modale: sette
       fogli costano sette volte). */
    if (config.quiz) {
      var multi = multiTypes(config.quiz);
      var nAng = angoliScelti(config.quiz).length;
      var singoli = (config.quiz.types || []).filter(function (t) { return multi.indexOf(t) < 0; }).length;
      B = branches * (singoli + multi.length * nAng);
    }
    // C: keyword AI = ceil(nodi/batch) SOLO se un modo le richiede.
    if (config.nodesheet) {
      var modes = config.nodesheet.modes || [];
      if (modes.indexOf('keywords') >= 0 || modes.indexOf('card') >= 0) {
        C = Math.ceil((nodes || 1) / (mapStats.keywordBatch || 12));
      }
    }
    // D: mappa intera map-reduce = rami + 1; + blocchi audio.
    if (config.synthesis) {
      D = (branches || 1) + 1;
      if (config.synthesis.audio) D += (mapStats.audioBlocks || 1);
    }
    /* E: la «Catena dei perché» si ricava dai verbi dei link e dai connettivi
       nelle descrizioni — zero chiamate AI. Sta nella stima con il suo 0 perché
       il docente veda che quel materiale non costa nulla. */
    return { total: A + B + C + D + E, perStep: { A: A, B: B, C: C, D: D, E: E } };
  }

  /* ══ I NOMI DEI MATERIALI — una convenzione sola ═══════════════════════════
     Forma:  <Tipo>-<Mappa>[-<dettaglio>][-<nome del docente>][ -VERDE].<est>

     Perché il TIPO resta in testa, e non è un'abitudine: la colonna di ELABORA
     e quella di INSEGNA riconoscono un file dal suo prefisso (`/^Quiz-MC-/`,
     `/^Sintesi/`, `/^Foglio.?nodi/` in `_diskKind`). Spostare il tipo altrove
     spegnerebbe in un colpo il raggruppamento per genere e il bottone
     «Modifica», che è l'unico ingresso all'editor per un documento su disco.

     Perché la MAPPA entra in tutti i nomi: `Sintesi.html`, `Sintesi-audio.mp3`,
     `Catena-dei-perche.pdf` e `Foglio-nodi-<layout>.pdf` non la portavano.
     Dentro un vault non serviva — un vault è una mappa sola — ma questi file
     escono dal vault: si stampano, si mandano per posta, finiscono su una
     chiavetta insieme a quelli di altre mappe, e lì «Sintesi.html» non dice
     più niente.

     Il DETTAGLIO è ciò che distingue due materiali dello stesso tipo della
     stessa mappa quando lo decide il motore, non il docente: il layout del
     foglio dei nodi, il ramo di una sintesi.

     ⚠️ UNA sola grafia per la taratura: ` -VERDE`. Ne circolavano cinque
     (` -VERDE`, `-[VERDE]`, ` [VERDE]`, e in due casi nessuna).                */

  var SUFFISSO_TARATO = ' -VERDE';

  /* ══ IL CARATTERE NEL NOME DEL FILE (18/8/26) ══════════════════════════════
     Ogni materiale generato finisce con « - <Carattere>»: `Quiz-MC-Il Clima -
     TestMe Sans.pdf`. Chiesto da Giacomo, e la ragione si vede aprendo una
     cartella di classe: da fuori un PDF non dice con che carattere è stato
     scritto, e da quando il carattere si sceglie quella è una proprietà del
     materiale — la stessa verifica che si fa aprendo il file, scritta nel nome.

     ⚠️ CONSEGUENZA DA CONOSCERE: due generazioni della stessa cosa in caratteri
     diversi non si sovrascrivono più, restano affiancate. È voluto (sono due
     materiali diversi: uno lo si consegna a chi legge bene, l'altro no), ma
     vuol dire che cambiando carattere la cartella cresce invece di aggiornarsi.

     Il carattere arriva da FUORI, come le metriche del foglio: questo modulo è
     puro e gira in Node, non può leggere `window`. Chi lo conosce
     (mappai-font.js) lo annuncia una volta; chi costruisce un nome per un
     DOCUMENTO con un carattere suo lo passa in `opts.font` e vince su quello. */
  var _fontEtichetta = '';
  function setFontEtichetta(nome) { _fontEtichetta = String(nome == null ? '' : nome).trim(); }
  function fontEtichetta() { return _fontEtichetta; }

  /* prefisso · estensione · se il tipo accetta un dettaglio dal motore */
  var GENERI = {
    quiz_mc: { pre: 'Quiz-MC', est: '.pdf' },
    quiz_tf: { pre: 'Quiz-VF', est: '.pdf' },
    flashcards: { pre: 'Flashcard', est: '.pdf' },
    nodesheet: { pre: 'Foglio-nodi', est: '.pdf', dettaglio: true },
    synthesis: { pre: 'Sintesi', est: '.html', dettaglio: true },
    /* La sintesi con la VOCE dentro (10/8/26). Sono due file distinti, non due
       stati dello stesso file:
         · `Sintesi-<Mappa>.html`        — senza audio, EDITABILE, vive in ELABORA
         · `Sintesi-voce-<Mappa>.html`   — con l'MP3 in base64 (~8 MB), si
                                           consegna, e si vede solo in INSEGNA
       ⚠️ Il marcatore sta IN TESTA, attaccato al tipo, e non dopo il nome della
       mappa: è la classificazione a chiederlo. Il genere di un file si deduce
       dal suo nome con espressioni ancorate all'inizio (`_diskKind`), e una
       regola che dovesse scavalcare un nome di mappa di lunghezza ignota per
       trovare «voce» sarebbe fragile. È lo stesso precedente di `Quiz-MC` e
       `Quiz-VF`, che sono due prefissi e non un `Quiz` con un suffisso.
       ⚠️ Chi classifica deve mettere `^Sintesi-voce-` PRIMA di `^Sintesi`, o la
       regola generica cattura anche questi e i due file tornano nello stesso
       elenco — cioè la separazione ELABORA/INSEGNA sparisce. */
    synthesis_voice: { pre: 'Sintesi-voce', est: '.html', dettaglio: true },
    /* Le DOMANDE APERTE (11/8/26). Sono il genere che gli altri quiz non
       coprono: nessuna opzione da scegliere, lo studente SCRIVE — e la carta
       gli lascia le righe per farlo. Vive nel box «Quiz» del bento perché per
       il docente è la stessa scelta («che verifica preparo?»), ma NON è un set
       giocabile: non entra in `studySets` (il player e l'editor si aspettano
       delle opzioni, e un item senza opzioni li romperebbe in silenzio).
       ⚠️ Prefisso senza accenti come `Catena-dei-perche`, per la stessa
       ragione: questi file finiscono su chiavette e cartelle condivise. */
    open_questions: { pre: 'Domande-aperte', est: '.pdf' },
    /* senza accenti per scelta: il file finisce anche su chiavette e cartelle
       condivise, dove una «é» diventa un problema di qualcun altro */
    causal: { pre: 'Catena-dei-perche', est: '.pdf' },
    /* Il DOSSIER non era nella convenzione (11/8/26): il suo nome se lo scriveva
       da sé, e siccome lo ricavava da un campo che non esiste
       (`appState.db.title`) usciva sempre il ripiego — «Dossier Progetto MappAI
       MM», che non nomina né la mappa né il documento. `dettaglio` perché un
       dossier può essere di un NODO o di un RAMO: «Dossier-<Mappa>-<Nodo>». */
    dossier: { pre: 'Dossier', est: '.pdf', dettaglio: true },
    tts: { pre: 'Sintesi-audio', est: '.mp3' },
    /* LA MAPPA ESPORTATA (17/8, rilievo di Giacomo). Era l'unico materiale
       fuori dalla convenzione: usciva `MappAI_Mappa_1787004725715.pdf` — un
       marchio, una parola generica e un timestamp, cioè un nome che non dice né
       QUALE mappa né di che genere, e che in una cartella di download si
       riconosce solo aprendolo.
       ⚠️ Due prefissi e non uno con un suffisso, per la stessa ragione di
       `Quiz-MC`/`Quiz-VF` e di `Sintesi-voce`: il genere si deduce dall'INIZIO
       del nome, e una regola che dovesse scavalcare un nome di mappa di
       lunghezza ignota sarebbe fragile. */
    map_mm: { pre: 'MM', est: '.pdf' },
    map_kg: { pre: 'KG', est: '.pdf' }
  };

  /* opts = { mappa, dettaglio, nome }
     `label` conserva il significato storico per non cambiare sotto i piedi ai
     chiamanti che non sono ancora passati a `opts`: per quiz e flashcard era il
     nome della mappa, per il foglio dei nodi il layout. Chi passa `opts.mappa`
     ottiene la forma nuova; chi non lo passa ottiene quella di prima. */
  /* ⚠️ `tuned` NON PRODUCE PIÙ IL SUFFISSO ` -VERDE` (10/8/26, decisione di
     Giacomo). Il marcatore aveva un mestiere preciso: far convivere nello stesso
     vault la versione standard e quella tarata per una classe inclusiva. Quel
     mestiere è finito quando la taratura ha smesso di essere una scelta e ha
     cominciato ad applicarsi DA SÉ leggendo il contesto attivo (5/8): di
     generazioni ce n'è una sola, quindi non c'è più niente da distinguere.
     ⚠️ La conseguenza da conoscere: due generazioni della stessa mappa producono
     ora lo stesso nome, e la seconda sovrascriverebbe la prima. È sicuro solo
     finché vale la premessa di sopra — chi reintroducesse due varianti della
     stessa mappa deve reintrodurre anche un modo di distinguerle.
     Il parametro resta nella firma, e `SUFFISSO_TARATO` resta esportato: i file
     GIÀ SU DISCO il marcatore ce l'hanno, e chi li rilegge — `_tarato()`
     nell'editor documenti — deve continuare a riconoscerlo e a conservarlo. */
  function buildFileName(kind, label, tuned, opts) {
    opts = opts || {};
    var g = GENERI[kind];
    var green = '';
    if (!g) return _safeName(opts.nome || label, 'file') + green;

    var mappa = _safeName(opts.mappa, '');
    var dettaglio = _safeName(opts.dettaglio, '');
    /* Retrocompatibilità: senza `opts.mappa` il vecchio `label` torna dov'era. */
    if (!mappa && !dettaglio && label != null && label !== '') {
      if (g.dettaglio) dettaglio = _safeName(label, '');
      else mappa = _safeName(label, '');
    }
    var pezzi = [g.pre];
    if (mappa) pezzi.push(mappa);
    if (dettaglio && g.dettaglio) pezzi.push(dettaglio);
    var nome = _safeName(opts.nome, '');
    if (nome) pezzi.push(nome);
    /* Il carattere in coda, separato da uno spazio-trattino-spazio: si legge
       come un'etichetta e non come un altro pezzo del nome (che sono uniti dal
       solo trattino). `opts.font` batte l'annuncio: un documento con un
       carattere suo porta il SUO nel nome, non quello dell'app. */
    var fnt = _safeName(opts.font != null ? opts.font : _fontEtichetta, '');
    /* ⚠️ Il trattino separa i pezzi, quindi un pezzo che ne contiene uno non
       rompe niente ma rende il nome ambiguo a rileggerlo: si accetta, perché
       ripulirlo cambierebbe i titoli scelti dal docente senza dirglielo. */
    return pezzi.join('-') + (fnt ? ' - ' + fnt : '') + green + g.est;
  }

  /* Il nome della MAPPA esportata: `MM-<Mappa>.pdf` o `KG-<Mappa>.svg`.
     L'estensione è un parametro e non una proprietà del genere, perché lo
     stesso disegno esce in tre formati (PDF vettoriale, SVG, PNG) e sono la
     stessa cosa in tre vesti — tre generi per tre estensioni vorrebbe dire sei
     voci in `GENERI` per due modalità.
     `mode` è `appState.extractionMode`: tutto ciò che non è `mindmap` è un KG,
     che è la stessa regola già usata altrove (una modalità nuova erediterebbe
     KG, e allora si aggiungerà un prefisso suo). */
  function buildMapExportName(mode, mappa, est, opts) {
    var kind = (String(mode || '') === 'mindmap') ? 'map_mm' : 'map_kg';
    var nome = buildFileName(kind, null, false, opts || { mappa: mappa });
    var e = String(est || '');
    if (!e) return nome;
    if (e.charAt(0) !== '.') e = '.' + e;
    return nome.replace(/\.[A-Za-z0-9]+$/, '') + e;
  }

  /* ══ COLLISIONI — `Materiale Studio/` non ne aveva nessuna protezione ══════
     Un nome già presente veniva sovrascritto in silenzio: nessun avviso,
     nessun suffisso, nessun errore — il docente se ne accorgeva aprendo la
     cartella. `Fonti/` invece disambigua da sempre con « · 02», e questa è la
     stessa forma, perché due grafie per lo stesso mestiere sono due cose da
     tenere allineate.
     Puro: riceve l'elenco dei nomi già presenti, non guarda il disco.          */
  function nomeLibero(nome, esistenti) {
    var lista = (esistenti || []).map(function (x) { return String(x || '').toLowerCase(); });
    if (lista.indexOf(String(nome || '').toLowerCase()) < 0) return nome;
    var m = /^(.*?)(\.[A-Za-z0-9]+)?$/.exec(String(nome || ''));
    var base = (m && m[1]) || String(nome || '');
    var est = (m && m[2]) || '';
    for (var n = 2; n <= 99; n++) {
      var cand = base + ' · ' + (n < 10 ? '0' + n : String(n)) + est;
      if (lista.indexOf(cand.toLowerCase()) < 0) return cand;
    }
    return null;   /* 98 varianti dello stesso nome: chi chiama deve dirlo, non insistere */
  }

  // ── Preset riusabili (US3) — SOLO output, mai la classe ─────────────────
  /* ⚠️ `open` (domande aperte) è dei tipi VALIDI dall'11/8: questa lista filtra
     i preset, e un tipo che non c'è viene scartato IN SILENZIO — il preset si
     salverebbe con la spunta accesa e si riaprirebbe senza. */
  var _VALID_TYPES = ['mc', 'tf', 'flashcards', 'open'];
  var _VALID_FMT = ['3x4', '2x2', '2x1'];
  var _VALID_MODES = ['title', 'keywords', 'summary', 'card'];

  // Estrae le opzioni di output da una config (strippa classId/className/sede).
  function presetFromConfig(config) {
    config = config || {};
    var o = {};
    if (config.quiz) o.quiz = { types: (config.quiz.types || []).slice(), perBranch: config.quiz.perBranch || 3, angle: config.quiz.angle || 'auto', multi: multiTypes(config.quiz), angoli: angoliScelti(config.quiz) };
    if (config.nodesheet) o.nodesheet = { maxLevel: config.nodesheet.maxLevel || 'all', fmt: config.nodesheet.fmt || '2x2', modes: (config.nodesheet.modes || []).slice(), causal: !!config.nodesheet.causal };
    if (config.synthesis) o.synthesis = { audio: !!config.synthesis.audio };
    o.causal = !!config.causal;
    o.tuned = !!config.tuned;
    o.levelTuned = !!config.levelTuned;
    return o;   // nessun campo classe
  }

  // Normalizza un record preset (schema v1): opzioni ignote → default; niente classe.
  function presetNormalize(record) {
    record = record || {};
    var o = record.options || {};
    var opt = {};
    if (o.quiz) {
      opt.quiz = {
        types: (Array.isArray(o.quiz.types) ? o.quiz.types : []).filter(function (t) { return _VALID_TYPES.indexOf(t) >= 0; }),
        perBranch: Math.max(1, Math.min(10, parseInt(o.quiz.perBranch, 10) || 3)),
        angle: o.quiz.angle || 'auto',
        multi: [], angoli: angoliScelti(o.quiz)
      };
      if (!opt.quiz.types.length) opt.quiz.types = ['mc'];
      /* `multi` si filtra DOPO i tipi: un preset che chiede più set per un
         genere non spuntato chiede una generazione che non avverrà. */
      opt.quiz.multi = multiTypes({ multi: o.quiz.multi, types: opt.quiz.types, angoli: opt.quiz.angoli });
    }
    if (o.nodesheet) {
      opt.nodesheet = {
        maxLevel: (o.nodesheet.maxLevel === 'all' || typeof o.nodesheet.maxLevel === 'number') ? o.nodesheet.maxLevel : 'all',
        fmt: _VALID_FMT.indexOf(o.nodesheet.fmt) >= 0 ? o.nodesheet.fmt : '2x2',
        modes: (Array.isArray(o.nodesheet.modes) ? o.nodesheet.modes : []).filter(function (m) { return _VALID_MODES.indexOf(m) >= 0; }),
        causal: !!o.nodesheet.causal
      };
      if (!opt.nodesheet.modes.length) opt.nodesheet.modes = ['title'];
    }
    if (o.synthesis) opt.synthesis = { audio: !!o.synthesis.audio };
    /* ⚠️ La catena era `nodesheet.causal`: i preset salvati prima del 5/8 la
       portano ancora là dentro. Si legge da entrambi i posti, altrimenti chi
       aveva un preset con la catena la perderebbe senza accorgersene. */
    opt.causal = !!(o.causal || (o.nodesheet && o.nodesheet.causal));
    opt.tuned = !!o.tuned;
    opt.levelTuned = !!o.levelTuned;
    delete opt.classId; delete opt.className; delete opt.sede;   // difesa: mai la classe
    return {
      v: 1,
      id: record.id || ('pr_' + (record.createdAt || nowIso())),
      name: String(record.name == null ? '' : record.name).slice(0, 60) || 'Preset',
      createdAt: record.createdAt || nowIso(),
      options: opt
    };
  }

  // Aggiunge un preset alla lista con cap FIFO (default 50): scarta i più vecchi.
  function presetListPush(list, record, cap) {
    cap = cap || 50;
    var arr = (Array.isArray(list) ? list : []).map(presetNormalize);
    arr.push(presetNormalize(record));
    if (arr.length > cap) arr = arr.slice(arr.length - cap);
    return arr;
  }

  var CORE = {
    SCHEMA: SCHEMA,
    STEPS: STEPS,
    presetFromConfig: presetFromConfig,
    presetNormalize: presetNormalize,
    presetListPush: presetListPush,
    createManifest: createManifest,
    stepTransition: stepTransition,
    normalizeOnLoad: normalizeOnLoad,
    isComplete: isComplete,
    validateMapResult: validateMapResult,
    validateQuizItems: validateQuizItems,
    validatePdfB64: validatePdfB64,
    validateSynthesis: validateSynthesis,
    quotaBase: quotaBase,
    contaGraduazione: contaGraduazione,
    ordinaGraduazione: ordinaGraduazione,
    estimateCalls: estimateCalls,
    angoliMulti: angoliMulti, angoliScelti: angoliScelti, multiTypes: multiTypes, nomeAngolo: nomeAngolo,
    buildFileName: buildFileName, setFontEtichetta: setFontEtichetta, fontEtichetta: fontEtichetta,
    buildMapExportName: buildMapExportName,
    nomeLibero: nomeLibero,
    GENERI: GENERI,
    SUFFISSO_TARATO: SUFFISSO_TARATO,
    hasOutput: hasOutput
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = CORE;
  if (typeof window === 'undefined') return;
  window.MappAIPipelineCore = CORE;
  console.log('[MappAIPipelineCore] logica pura pipeline materiali caricata');
})();
