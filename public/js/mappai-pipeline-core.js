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

  /* ══ LA POSIZIONE DELLA RISPOSTA GIUSTA (11/9/26) ══════════════════════════
     Misurato su una cartella vera: nel foglio «applicazione» tutte e DODICI le
     risposte esatte erano la seconda opzione; su 84 domande, 56. E in 54 su 84
     la risposta esatta era anche la più lunga delle tre. Uno studente impara la
     regolarità in due minuti e risponde senza sapere la storia: la verifica
     smette di misurare ciò che dice di misurare.

     Il difetto non è del modello — che ha una sua inclinazione e la avrà sempre
     — ma del fatto che fra la sua risposta e il PDF stampato NON C'È NIENTE.
     Qui si mette quel niente.

     ⚠️ Il seme viene dall'id del set, non da Math.random: la stessa verifica
     ristampata deve dare lo STESSO foglio, altrimenti il docente che ristampa
     dopo aver fotocopiato si ritrova due versioni in classe. */
  function semeDa(str) {
    var h = 2166136261;                       // FNV-1a: corto, stabile, senza dipendenze
    var s = String(str == null ? '' : str);
    for (var i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
    }
    return h >>> 0;
  }

  function _rng(seed) {
    var x = (seed >>> 0) || 1;
    return function () {                      // xorshift32: deterministico e sufficiente
      x ^= x << 13; x >>>= 0;
      x ^= x >>> 17;
      x ^= x << 5; x >>>= 0;
      return x / 4294967296;
    };
  }

  /* Rimescola le opzioni di ogni item e RISCRIVE `correct` di conseguenza.
     Accetta le due forme che convivono nell'app: `{options:[], correct}` dei
     quiz dinamici e `{a1,a2,a3, correct:<indice 1-based>}` del quiz per nodo.
     Un item la cui risposta esatta non si riconosce fra le opzioni NON viene
     toccato: mescolarlo lo renderebbe irrecuperabile. */
  function mescolaOpzioni(items, seme) {
    var rnd = _rng(semeDa(seme));
    return (items || []).map(function (it, n) {
      if (!it) return it;
      var tri = (it.a1 != null && it.a2 != null && it.a3 != null);
      var opts = tri ? [it.a1, it.a2, it.a3] : (Array.isArray(it.options) ? it.options.slice() : null);
      if (!opts || opts.length < 2) return it;

      var ci = _indiceCorretta(it, opts);
      if (ci < 0) return it;                  // chiave non riconosciuta: si lascia com'è

      var ord = opts.map(function (t, i) { return { t: t, i: i, k: rnd() }; });
      ord.sort(function (a, b) { return (a.k - b.k) || (a.i - b.i); });
      var nuovo = ord.map(function (o) { return o.t; });
      var ni = ord.findIndex(function (o) { return o.i === ci; });

      var out = Object.assign({}, it);
      if (tri) { out.a1 = nuovo[0]; out.a2 = nuovo[1]; out.a3 = nuovo[2]; out.correct = ni + 1; }
      else { out.options = nuovo; out.correct = nuovo[ni]; out.correctIndex = ni; }
      out._mescolato = true;
      return out;
    });
  }

  // Dov'è la risposta esatta fra le opzioni: per testo, per indice 1-based, per
  // lettera («B»). Sono le tre convenzioni che i modelli usano davvero.
  function _indiceCorretta(it, opts) {
    var c = it.correct;
    if (typeof it.correctIndex === 'number' && it.correctIndex >= 0 && it.correctIndex < opts.length) return it.correctIndex;
    if (c == null) return -1;
    var s = String(c).trim();
    for (var i = 0; i < opts.length; i++) {
      if (String(opts[i]).trim().toLowerCase() === s.toLowerCase()) return i;
    }
    var n = parseInt(s, 10);
    if (!isNaN(n) && n >= 1 && n <= opts.length) return n - 1;
    if (/^[A-Za-z]$/.test(s)) {
      var k = s.toUpperCase().charCodeAt(0) - 65;
      if (k >= 0 && k < opts.length) return k;
    }
    return -1;
  }

  // Distribuzione delle posizioni: serve al rapporto, non alla correzione.
  function posizioniCorrette(items) {
    var pos = {}, tot = 0, ignoti = 0;
    (items || []).forEach(function (it) {
      var opts = (it && it.a1 != null) ? [it.a1, it.a2, it.a3] : (it && Array.isArray(it.options) ? it.options : null);
      if (!opts) { ignoti++; return; }
      var i = _indiceCorretta(it, opts);
      if (i < 0) { ignoti++; return; }
      pos[i] = (pos[i] || 0) + 1; tot++;
    });
    var max = 0;
    Object.keys(pos).forEach(function (k) { if (pos[k] > max) max = pos[k]; });
    return { pos: pos, tot: tot, ignoti: ignoti, maxQuota: tot ? max / tot : 0 };
  }

  /* Quante volte la risposta esatta è anche la più lunga: l'altro indizio che si
     legge senza sapere la storia. Si MISURA e si segnala; non si accorcia da
     soli, perché tagliare la risposta giusta le toglie la parte che la rende
     giusta, e non si scarta l'item, perché il margine mediano è del 3% e non
     esiste una soglia che separi le domande da buttare da quelle sane
     (misurato su 126 domande vere: con rapporto 1,4 si scarterebbe UN item).
     Il difetto si corregge nel prompt — `quizLengthBlock` — e questa funzione
     è il modo per sapere se l'istruzione ha morso.

     ⚠️ Il numero da guardare non è la quota ma lo SCARTO DAL CASO: con tre
     opzioni la risposta esatta è la più lunga un terzo delle volte anche quando
     nessuno bara. «Il 55%» non dice niente finché non lo si mette accanto al
     33% che ci si aspetta. */
  function corretteTroppoLunghe(items) {
    var n = 0, tot = 0, atteso = 0, margini = [];
    (items || []).forEach(function (it) {
      var opts = (it && it.a1 != null) ? [it.a1, it.a2, it.a3] : (it && Array.isArray(it.options) ? it.options : null);
      if (!opts || opts.length < 2) return;
      var i = _indiceCorretta(it, opts);
      if (i < 0) return;
      tot++;
      atteso += 1 / opts.length;
      var len = function (x) { return String(x || '').trim().length; };
      var mia = len(opts[i]);
      var piuLunga = Math.max.apply(null, opts.filter(function (_, k) { return k !== i; }).map(len));
      if (mia > piuLunga) n++;
      if (piuLunga > 0) margini.push(mia / piuLunga);
    });
    margini.sort(function (a, b) { return a - b; });
    return {
      n: n, tot: tot,
      quota: tot ? n / tot : 0,
      atteso: tot ? atteso / tot : 0,
      margineMediano: margini.length ? margini[Math.floor(margini.length / 2)] : 1
    };
  }

  /* ══ LA PROVA (11/9/26) ═════════════════════════════════════════════════════
     Al modello si chiede, per ogni domanda, anche la FRASE del materiale che
     rende vera la risposta. Qui si controlla che quella frase esista davvero nel
     materiale: se non c'è, la domanda è costruita su qualcosa che il modello ha
     aggiunto di suo e viene scartata.

     Esempi che questo filtro ferma, presi da una cartella vera: «La Commissione
     Bergier è stata formata nel 2002» (la fonte data al 2002 il RAPPORTO), e una
     domanda la cui risposta segnata descriveva il comportamento degli altri
     paesi invece di quello della Svizzera.

     ⚠️ Il confronto è LESSICALE e generoso (parole in comune, non la stringa
     identica): il modello riformula sempre un po', e pretendere la citazione
     esatta scarterebbe anche le domande buone. Serve a fermare l'invenzione, non
     a certificare la verità. */
  function verificaEvidenza(items, materiale, opts) {
    var o = Object.assign({ soglia: 0.6, minParole: 3 }, opts || {});
    var idx = _indiceParole(materiale);
    var tenuti = [], scartati = [];
    (items || []).forEach(function (it) {
      var ev = it && (it.evidenza || it.evidence);
      if (!ev) { tenuti.push(it); return; }        // senza campo: comportamento di prima
      var w = _parole(ev);
      if (w.length < o.minParole) { tenuti.push(it); return; }
      var hit = 0;
      for (var i = 0; i < w.length; i++) if (idx[w[i]]) hit++;
      var q = hit / w.length;
      if (q >= o.soglia) tenuti.push(it);
      else scartati.push({ q: it.q || it.question || it.domanda || '', evidenza: ev, quota: Number(q.toFixed(2)) });
    });
    return { items: tenuti, scartati: scartati };
  }

  /* ══ DOMANDE RIPETUTE (difetto 8, 11/9) ════════════════════════════════════
     Ogni foglio nasce senza sapere che cosa c'e negli altri, e dentro lo stesso
     foglio senza tenere il conto degli argomenti gia toccati. Misurato su una
     cartella vera: nel foglio «causa» TRE domande su dodici chiedevano perche fu
     adottato il Piano Wahlen, altre tre perche fu accettato l'oro nazista; e la
     parola «oro» compariva in 37 consegne su 84.
     Il codice di variazione che il programma mette nel prompt fa cambiare la
     FORMULAZIONE, non l'argomento: due domande diverse a parole sullo stesso
     fatto restano la stessa domanda per chi studia. */

  /* Le parole che in una CONSEGNA non dicono di che cosa si parla. Solo quelle
     lunghe almeno quattro lettere, perche le piu corte `_parole` le scarta gia.
     ⚠️ Senza questa lista due riformulazioni della stessa domanda si fermavano
     a 0,40 di somiglianza — sotto qualunque soglia utile — perche «perche»,
     «durante», «quale», «venne» contavano come contenuto quanto «Wahlen». */
  var VUOTE = {};
  ('perche perché quale quali quando dove cosa quanto quanta quanti quante come ' +
   'della dello degli delle nella nello negli nelle sulla sullo sugli sulle ' +
   'dalla dallo dagli dalle alla allo agli quest questo questa questi queste ' +
   'quello quella quelli quelle durante secondo mediante tramite verso senza ' +
   'sopra sotto dopo prima ancora anche invece oltre circa presso ' +
   'essere stato stata stati state avere aveva avevano viene vengono venne ' +
   'vennero sono erano fosse furono siano possono puo può deve devono ' +
   'spiega descrivi indica elenca illustra racconta scrivi ' +
   'altro altra altri altre ogni tutto tutta tutti tutte molto molta molti molte').split(' ')
    .forEach(function (w) { VUOTE[w] = 1; });

  function _paroleUtili(t) {
    return _parole(t).filter(function (w) { return !VUOTE[w]; });
  }

  // Quanto due domande si somigliano: parole-contenuto in comune sul totale
  // (Jaccard, senza le parole vuote). Deterministico, nessuna dipendenza.
  function similitudine(a, b) {
    var A = {}, B = {}, na = 0, nb = 0;
    _paroleUtili(a).forEach(function (w) { if (!A[w]) { A[w] = 1; na++; } });
    _paroleUtili(b).forEach(function (w) { if (!B[w]) { B[w] = 1; nb++; } });
    if (!na || !nb) return 0;
    var com = 0;
    Object.keys(A).forEach(function (w) { if (B[w]) com++; });
    return com / (na + nb - com);
  }

  /* Toglie le domande troppo simili: a una gia fatta altrove (`gia`) o a una
     gia tenuta in questo stesso foglio.

     ⚠️ SOGLIA 0,7, e non piu in basso. Misurato: due riformulazioni della stessa
     domanda stanno a 0,80, ma «Che cos'e il razionamento?» e «Perche fu
     introdotto il razionamento?» stanno a 0,67 e sono DUE DOMANDE DIVERSE — la
     prima chiede una definizione, la seconda una causa. Con una soglia piu bassa
     il programma avrebbe cancellato proprio cio che i sette angoli servono a
     produrre.

     ⚠️ Per la stessa ragione `gia` deve contenere SOLO le domande dello STESSO
     angolo: fra un foglio «definizione» e un foglio «causa» la ripetizione del
     tema e voluta, non un difetto. Lo decide il chiamante, che sa di che foglio
     si tratta.

     Si tiene la PRIMA: nei fogli per angolo l'ordine e quello di generazione, e
     la prima e quella che il modello ha ritenuto piu centrale. */
  function deduplicaDomande(items, opts) {
    var o = Object.assign({ gia: [], soglia: 0.7 }, opts || {});
    var testo = function (x) {
      return String((x && (x.q || x.question || x.domanda)) || '');
    };
    var tenuti = [], scartati = [];
    (items || []).forEach(function (it) {
      var t = testo(it);
      if (!t) { tenuti.push(it); return; }
      var gemella = null;
      for (var i = 0; i < o.gia.length; i++) {
        if (similitudine(t, o.gia[i]) >= o.soglia) { gemella = o.gia[i]; break; }
      }
      if (!gemella) {
        for (var j = 0; j < tenuti.length; j++) {
          if (similitudine(t, testo(tenuti[j])) >= o.soglia) { gemella = testo(tenuti[j]); break; }
        }
      }
      if (gemella) scartati.push({ q: t, come: gemella });
      else tenuti.push(it);
    });
    return { items: tenuti, scartati: scartati };
  }

  /* ══ L'ETICHETTA «AVVIO» (difetto 9, 11/9) ═════════════════════════════════
     Ogni domanda aperta e classificata «avvio» (si risponde con un concetto
     solo) o «ponte» (bisogna collegarne due). Serve a garantire che chi ha
     studiato meta scheda possa comunque cominciare. Ma l'etichetta la DICHIARA
     il modello e nessuno la verifica: nei fogli veri una «avvio» chiedeva di
     distinguere i principi storici della neutralita dalla dichiarazione
     formale — due concetti, non uno.
     Qui si CONTA invece di credere: quante macro-aree o nodi della mappa la
     domanda chiama davvero in causa. Da due in su e «ponte», e questa conta
     scavalca la dichiarazione.
     ⚠️ Se la domanda non nomina nessuna etichetta riconoscibile la conta non
     decide, e resta quello che il modello ha dichiarato: meglio l'etichetta
     incerta di una sbagliata al contrario. */
  var VERBI_PONTE = /\b(confronta|confrontando|paragona|metti in relazione|collega|differenz[ae]|somiglianz[ae]|in che cosa differiscono|rispetto a)\b/i;

  function livelloVerificato(item, etichette, dichiarato) {
    var t = String((item && (item.domanda || item.q || item.question)) || '');
    if (!t) return dichiarato || 'ponte';
    var parole = {};
    _parole(t).forEach(function (w) { parole[w] = 1; });
    var visti = {}, n = 0;
    (etichette || []).forEach(function (et) {
      var pe = _parole(et);
      if (!pe.length) return;
      // l'etichetta e «nominata» se TUTTE le sue parole-contenuto sono nella domanda
      for (var i = 0; i < pe.length; i++) if (!parole[pe[i]]) return;
      var k = pe.join(' ');
      if (visti[k]) return;
      visti[k] = 1; n++;
    });
    if (n >= 2) return 'ponte';
    if (VERBI_PONTE.test(t)) return 'ponte';
    if (n === 1) return 'base';
    return dichiarato || 'ponte';
  }

  /* ══ I CRITERI DI CORREZIONE (difetto 10, 11/9) ════════════════════════════
     Sotto ogni domanda aperta c'e una traccia per chi corregge: dice che cosa
     deve contenere la risposta giusta, in un BLOCCO UNICO. Un blocco unico non
     si puo spuntare a pezzi — o la risposta gli assomiglia o no — quindi non
     dice che cosa fare di una risposta giusta a meta, ne come distinguere un
     errore di storia da una difficolta a scrivere. Per un allievo con
     difficolta espressive quella distinzione e tutto.
     Due o tre criteri separati, ognuno verificabile da solo, danno al docente
     il credito parziale senza inventare una rubrica.
     ⚠️ Il ripiego non e vuoto: se il modello manda solo la traccia, la si
     spezza nelle sue frasi. Una traccia di due frasi da due criteri veri; una
     di una frase da un criterio solo, ed e onesto cosi. */
  function criteriDaItem(item) {
    if (!item) return [];
    var c = item.criteri || item.criteria;
    if (Array.isArray(c)) {
      var puliti = c.map(function (x) { return String(x == null ? '' : x).trim(); }).filter(Boolean);
      if (puliti.length) return puliti.slice(0, 4);
    }
    var g = String(item.guide || item.traccia || '').trim();
    if (!g) return [];
    return g.split(/(?<=[.;])\s+/).map(function (x) { return x.trim(); })
      .filter(function (x) { return x.length > 12; }).slice(0, 4);
  }

  function _parole(t) {
    return String(t == null ? '' : t).toLowerCase().match(/[a-zàèéìòóùü0-9]{4,}/g) || [];
  }
  function _indiceParole(t) {
    var idx = {};
    _parole(t).forEach(function (w) { idx[w] = 1; });
    return idx;
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

  /* Su quali generi si applica: solo dove un angolo cambia davvero la domanda. */
  /* `flashcards` è entrato il 20/8 notte (fase 3): l'angolo è diventato VERO
     anche per le carte (`flashcardAngleBlock`), quindi moltiplicarle non
     produce più mazzi identici. Il vero/falso resta fuori. */
  var _VALID_MULTI = ['open', 'mc', 'flashcards'];
  /* Le scelte PER GENERE del dossier (20/8): quante domande, quali categorie
     (= blocchi della scheda), quali angoli. Con la forma per-tipo assente si
     ricade sulle leve globali — è ciò che tiene vivo il percorso della mappa. */
  function angoliPerTipo(quiz, t) {
    var per = quiz && quiz.angoliPerTipo && quiz.angoliPerTipo[t];
    if (Array.isArray(per)) {
      var disp = angoliMulti();
      return disp.filter(function (k) { return per.indexOf(k) >= 0; });
    }
    return angoliScelti(quiz);
  }
  function quantiPerTipo(quiz, t, fallback) {
    var per = quiz && quiz.perTipo && quiz.perTipo[t];
    var n = parseInt(per, 10);
    return (n >= 1 && n <= 30) ? n : fallback;
  }
  function categoriePerTipo(quiz, t) {
    var per = quiz && quiz.catPerTipo && quiz.catPerTipo[t];
    return Array.isArray(per) ? per.filter(Boolean) : null;   /* null = tutte */
  }
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
    /* L'ANALISI DELLA FONTE (20/8): la scheda a quattro blocchi di una fonte
       iconografica — il documento da cui nasce un DOSSIER. */
    analisi_fonte: { pre: 'Analisi-fonte', est: '.pdf' },
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
  /* ⚠️ `tf` non c'è più (19/8, Giacomo): la pipeline non genera quiz Vero/Falso.
     Un preset salvato prima che lo chieda lo perde qui, in silenzio e per
     disegno — se restasse, «Genera materiali» produrrebbe un materiale che
     nessuna casella può più chiedere. Il PREFISSO `Quiz-VF` resta in `GENERI`:
     i fogli già sul disco vanno ancora riconosciuti e riaperti. */
  var _VALID_TYPES = ['mc', 'flashcards', 'open'];
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
    semeDa: semeDa, mescolaOpzioni: mescolaOpzioni, posizioniCorrette: posizioniCorrette,
    similitudine: similitudine, deduplicaDomande: deduplicaDomande,
    livelloVerificato: livelloVerificato, criteriDaItem: criteriDaItem,
    corretteTroppoLunghe: corretteTroppoLunghe, verificaEvidenza: verificaEvidenza,
    angoliMulti: angoliMulti, angoliScelti: angoliScelti, multiTypes: multiTypes, nomeAngolo: nomeAngolo,
    angoliPerTipo: angoliPerTipo, quantiPerTipo: quantiPerTipo, categoriePerTipo: categoriePerTipo,
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
