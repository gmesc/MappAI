/*
 * mappai-teach-core.js — logica PURA della landing "Insegna" (testabile in Node)
 * ------------------------------------------------------------------------------
 * Nessun accesso a DOM/localStorage/rete: funzioni deterministiche usate dalla
 * UI (mappai-landing-teach.js) e verificate in tests/teach-core.test.js. La UI
 * fa l'I/O (legge/scrive localStorage, MappAIClasses, appState) e passa dati.
 *
 *  - normGrade         → normalizza un grade per confronto ("1ª Media" ≡ "1a media")
 *  - registryAdd       → registro sessioni: inserisce in testa, cap FIFO, immutabile
 *  - classesForMap     → classi attive su una mappa (chip dei progetti)
 *  - rankMapsForClass  → ordinamento quick-start in 3 fasce {started, sameGrade, others}
 *  - buildSetsIndex    → indice leggero quiz/flashcard per un progetto
 *  - filterByClass     → filtro "Solo classe attiva" per le sezioni Insegna
 *
 * Modulo UMD (pattern di mappai-live-core.js): module.exports per `node --test`,
 * window.MappAITeachCore per il browser.
 */
(function () {
  'use strict';

  var REGISTRY_CAP = 400;

  // ── normGrade ─────────────────────────────────────────────────────────────
  // NFKD → toglie diacritici, ordinali ª/° → 'a', minuscole, spazi collassati.
  // Confronto SEMPRE via questa funzione: "1ª  Media" ≡ "1a media", "2°A" ≡ "2a a".
  function normGrade(s) {
    if (s == null) return '';
    var str = String(s);
    // ̀-ͯ = diacritici combinanti (escape espliciti: niente char letterali fragili nel sorgente)
    try { str = str.normalize('NFKD').replace(/[̀-ͯ]/g, ''); } catch (e) { /* ambienti senza NFKD */ }
    return str
      .replace(/[ªº°]/g, 'a')          // ordinali → 'a' (1ª → 1a)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')     // punteggiatura/simboli → spazio
      .trim()
      .replace(/\s+/g, ' ');
  }

  /* ── nfc: l'accento che il filesystem scrive in un altro modo (15/8) ──────
     macOS scrive i nomi di file e cartella in forma SCOMPOSTA (NFD: «a» + il
     segno d'accento), mentre le stringhe nate in JS e in `appState` sono
     COMPOSTE (NFC: un carattere solo). A schermo sono identiche, per `===` no:
     `'Elettricità' === 'Elettricità'` può essere FALSO. E il sintomo è il
     peggiore possibile — non un errore, ma zero risultati, che sembra una
     risposta. Misurato sui dati veri: filtrando i progetti per la cartella
     «Elettricità - KG» il conto dava 0 in una forma e 13 nell'altra.
     Regola: OGNI confronto fra un nome che viene dal DISCO e un nome tenuto in
     MEMORIA passa di qui, sui due lati. (Guida §8, trappola 25.) */
  function nfc(s) {
    var str = String(s == null ? '' : s);
    try { return str.normalize('NFC'); } catch (e) { return str; }
  }
  /* confronto di nomi: NFC su entrambi i lati. `''` non combacia con `''`
     (due «senza nome» non sono la stessa cosa: lo decide il chiamante). */
  function stessoNome(a, b) {
    var x = nfc(a), y = nfc(b);
    return !!x && x === y;
  }

  function _sameGrade(a, b) {
    var na = normGrade(a), nb = normGrade(b);
    return !!na && na === nb;
  }

  // ── registryAdd ───────────────────────────────────────────────────────────
  // Registro sessioni: nuova voce in testa, cap FIFO. NON muta l'input.
  // entry = {map, projectId?, cls?, activity, date?}. date mancante → 0 (il
  // chiamante passa Date.now(); manteniamo la funzione pura/deterministica).
  function registryAdd(registry, entry, cap) {
    var arr = Array.isArray(registry) ? registry.slice() : [];
    var e = {
      map: entry && entry.map != null ? String(entry.map) : '',
      projectId: entry && entry.projectId != null ? entry.projectId : null,
      cls: entry && entry.cls != null ? entry.cls : null,
      activity: entry && entry.activity != null ? String(entry.activity) : '',
      date: entry && entry.date != null ? entry.date : 0
    };
    arr.unshift(e);
    var limit = cap != null ? cap : REGISTRY_CAP;
    if (arr.length > limit) arr.length = limit;
    return arr;
  }

  // Match fra una voce di registro e un progetto: per projectId se presente su
  // ENTRAMBI, altrimenti per nome mappa. Serve a chip e filtri.
  function _regMatchesProject(regEntry, ref) {
    if (!regEntry || !ref) return false;
    if (regEntry.projectId != null && ref.projectId != null) {
      return regEntry.projectId === ref.projectId;
    }
    var rm = regEntry.map != null ? String(regEntry.map) : '';
    var pm = ref.map != null ? String(ref.map) : '';
    return !!rm && rm === pm;
  }

  // ── classesForMap ─────────────────────────────────────────────────────────
  // Nomi-classe distinti che hanno avviato sessioni su una mappa/progetto.
  // Ignora le voci cls:null. Ordine: prima apparizione (registro già ordinato
  // dal più recente dal chiamante → le classi recenti vengono per prime).
  function classesForMap(registry, ref) {
    if (!Array.isArray(registry) || !ref) return [];
    var out = [];
    var seen = Object.create(null);
    for (var i = 0; i < registry.length; i++) {
      var r = registry[i];
      if (!r || r.cls == null || r.cls === '') continue;
      if (!_regMatchesProject(r, ref)) continue;
      var key = String(r.cls);
      if (seen[key]) continue;
      seen[key] = true;
      out.push(r.cls);
    }
    return out;
  }

  // ── rankMapsForClass ──────────────────────────────────────────────────────
  // Ordina i progetti in 4 fasce per una classe (FR-020). Il totale contiene
  // SEMPRE tutti i progetti (il docente non è mai bloccato). cls = {name, grade}.
  //   started    = già avviati su questa classe (registro, per projectId o map)
  //   sameGrade  = non-started con grade == grade della classe (normGrade)
  //   others     = non-started SENZA grade (generiche, valide per ogni classe)
  //   otherGrade = non-started con grade SETTATO ma != grade classe (di altre
  //                classi) → il picker le nasconde di default. Se la classe non
  //                ha grade non si può giudicare: tutto finisce in others.
  function rankMapsForClass(projects, registry, cls) {
    var list = Array.isArray(projects) ? projects.slice() : [];
    var reg = Array.isArray(registry) ? registry : [];
    var clsName = cls && cls.name != null ? String(cls.name) : null;
    var clsGrade = cls && cls.grade != null ? cls.grade : null;

    var startedIds = Object.create(null);
    if (clsName != null) {
      for (var i = 0; i < reg.length; i++) {
        var r = reg[i];
        if (!r || r.cls == null || String(r.cls) !== clsName) continue;
        // marca i progetti avviati: chiave per id se c'è, altrimenti per nome
        if (r.projectId != null) startedIds['id:' + r.projectId] = true;
        if (r.map != null) startedIds['map:' + String(r.map)] = true;
      }
    }

    function isStarted(p) {
      if (!p) return false;
      if (p.id != null && startedIds['id:' + p.id]) return true;
      if (p.name != null && startedIds['map:' + String(p.name)]) return true;
      return false;
    }

    var started = [], sameGrade = [], others = [], otherGrade = [];
    for (var j = 0; j < list.length; j++) {
      var p = list[j];
      var pGrade = p && p.grade != null && p.grade !== '' ? p.grade : null;
      if (isStarted(p)) started.push(p);
      else if (clsGrade != null && _sameGrade(pGrade, clsGrade)) sameGrade.push(p);
      else if (clsGrade != null && pGrade != null) otherGrade.push(p); // grade di altra classe
      else others.push(p); // senza grade (o classe senza grade) → generica
    }
    return { started: started, sameGrade: sameGrade, others: others, otherGrade: otherGrade };
  }

  // ── buildSetsIndex ────────────────────────────────────────────────────────
  // Indice leggero quiz/flashcard: sostituisce le voci del projectId corrente,
  // preserva quelle di altri progetti. studySets = appState.db.studySets.
  // Non muta prevIndex.
  function buildSetsIndex(prevIndex, projectId, mapName, cls, studySets) {
    var prev = Array.isArray(prevIndex) ? prevIndex : [];
    var kept = prev.filter(function (e) { return !e || e.projectId !== projectId; });
    var fresh = [];
    var sets = Array.isArray(studySets) ? studySets : [];
    for (var i = 0; i < sets.length; i++) {
      var s = sets[i];
      if (!s) continue;
      var type = s.type === 'flashcards' || s.type === 'flashcard' ? 'flashcards'
        : (s.type === 'quiz' ? 'quiz' : (s.cards ? 'flashcards' : 'quiz'));
      fresh.push({
        projectId: projectId != null ? projectId : null,
        mapName: mapName != null ? String(mapName) : '',
        setId: s.id != null ? s.id : ('set_' + i),
        name: s.name || s.title || s.topic || ('Set ' + (i + 1)),
        type: type,
        cls: cls != null ? cls : null,
        date: s.date != null ? s.date : (s.created != null ? s.created : 0)
      });
    }
    return kept.concat(fresh);
  }

  // ── filterByClass ─────────────────────────────────────────────────────────
  // Filtro "Solo classe attiva" per le sezioni Insegna. Un item resta se:
  //   - item.cls === nome classe attiva, OPPURE
  //   - il progetto riferito è nel registro per quella classe, OPPURE
  //   - normGrade(item.grade) == normGrade(grade classe attiva)
  // activeCls null / senza nome / "Generico" (per convenzione: passare null) →
  // items invariati (nessun filtro).
  function filterByClass(items, activeCls, registry, projects) {
    var list = Array.isArray(items) ? items : [];
    if (!activeCls || activeCls.name == null || activeCls.name === '') return list.slice();
    var name = String(activeCls.name);
    var grade = activeCls.grade != null ? activeCls.grade : null;
    var reg = Array.isArray(registry) ? registry : [];

    // progetti (id + nome) avviati su questa classe → per il match via registro
    var startedIds = Object.create(null), startedMaps = Object.create(null);
    for (var i = 0; i < reg.length; i++) {
      var r = reg[i];
      if (!r || r.cls == null || String(r.cls) !== name) continue;
      if (r.projectId != null) startedIds[r.projectId] = true;
      if (r.map != null) startedMaps[String(r.map)] = true;
    }

    return list.filter(function (it) {
      if (!it) return false;
      if (it.cls != null && stessoNome(it.cls, name)) return true;
      if (it.projectId != null && startedIds[it.projectId]) return true;
      var mapRef = it.mapName != null ? it.mapName : it.map;
      if (mapRef != null && startedMaps[String(mapRef)]) return true;
      if (grade != null && _sameGrade(it.grade, grade)) return true;
      return false;
    });
  }

  // ── matchesSelectedProject (011/US5) ──────────────────────────────────────
  // Filtro per la mappa SELEZIONATA in Insegna (click sulla riga progetto).
  // sel = { id, name } | null. null → tutto passa (nessuna selezione).
  // Un item resta se: item.projectId === sel.id, OPPURE (mapName|map) === sel.name.
  // I materiali/condivisi/attività legacy senza projectId né mapRef → esclusi
  // quando c'è una selezione (compaiono solo in vista non-selezionata).
  function matchesSelectedProject(item, sel) {
    if (!sel || (sel.id == null && sel.name == null)) return true;
    if (!item) return false;
    if (item.projectId != null && sel.id != null && String(item.projectId) === String(sel.id)) return true;
    var mapRef = item.mapName != null ? item.mapName : item.map;
    if (mapRef != null && sel.name != null && stessoNome(mapRef, sel.name)) return true;
    return false;
  }

  // ── progettoDelVault (15/8) ───────────────────────────────────────────────
  // La voce di progetto che CORRISPONDE a un vault aperto dal disco. Serve
  // all'adozione dell'identità: `directLoadVault`/`loadMapVault` non toccavano
  // mai `currentProjectId`, quindi il salvataggio scriveva la mappa nuova nella
  // scheda della mappa PRECEDENTE (una voce «2.1 PROJECT E» che puntava a un
  // altro vault — trovata nei dati veri), e a ogni avvio nasceva una scheda in
  // più (46 copie di una stessa mappa).
  // ⚠️ Ogni confronto passa da NFC: i nomi che arrivano dal FILESYSTEM di macOS
  //    portano gli accenti in forma scomposta (NFD), quelli nati in appState in
  //    forma composta. `'Elettricità' === 'Elettricità'` può essere falso pur
  //    essendo la stessa parola — e un filtro non normalizzato risponde «zero»,
  //    che sembra una risposta (trappola §8.25 della guida).
  // pos = { vault, classDir, discDir } — la posizione su disco, già relativa
  // alla base delle mappe (la ricava il chiamante, che ha l'IPC).
  // Ritorna la voce più RECENTE che combacia, o null.
  function progettoDelVault(projects, pos) {
    if (!Array.isArray(projects) || !pos) return null;
    var vault = nfc(pos.vault), cls = nfc(pos.classDir || ''), disc = nfc(pos.discDir || '');
    if (!vault) return null;
    // Priorità: posizione esatta → stessa classe senza materia (voci scritte
    // prima del livello disciplina) → vault flat → solo il nome. A parità di
    // priorità vince la più recente: è quella che l'app aggiornava finora.
    var livelli = [
      function (p) { return nfc(p.vault) === vault && nfc(p.classDir || '') === cls && nfc(p.discDir || '') === disc; },
      function (p) { return cls && nfc(p.vault) === vault && nfc(p.classDir || '') === cls && !p.discDir; },
      function (p) { return nfc(p.vault) === vault && !p.classDir; },
      function (p) { return nfc(p.vault) === vault; }
    ];
    for (var i = 0; i < livelli.length; i++) {
      var meglio = null;
      for (var j = 0; j < projects.length; j++) {
        var p = projects[j];
        if (!p || !livelli[i](p)) continue;
        if (!meglio || (p.date || 0) > (meglio.date || 0)) meglio = p;
      }
      if (meglio) return meglio;
    }
    return null;
  }

  /* ── CREARE NON È APRIRE (0061, 29/09; ADR 0013) ──────────────────────────
     Fino al 28/9 creare una cartella e riaprirne una erano lo stesso gesto: a
     fine generazione l'app chiamava `adottaVault`, che cercava per NOME una voce
     di `tutor_ai_projects` (progettoDelVault, qui sopra: quattro livelli, e
     l'ultimo è «il nome e basta») e ne prendeva l'id. Una mappa nuova col titolo
     di una vecchia ereditava la sua identità: la «Svizzera e 2a GM» generata il
     28/9 in 4R/Storia ha preso `proj_1788975818955`, nato il 9/9 — e con l'id la
     fotografia, i consumi, l'indice dei set, le sessioni.
     Ora chi chiama dice QUALE gesto sta facendo, e questa funzione decide l'id e
     se lo si può scrivere nella cartella (`index.yaml › projectId`):
       · nuova         la cartella nasce per una mappa appena generata. Nessuna
                       ricerca per nome: si tiene l'id solo se è nato in questa
                       generazione (la sua voce manca o non dichiara un vault),
                       altrimenti si conia.
       · per-la-mappa  la cartella nasce per la mappa già in memoria («Esporta
                       nel Vault», il backfill all'apertura): si tiene il suo id,
                       tranne quando così nascerebbero due cartelle vive con lo
                       stesso id — la mappa è legata a un'ALTRA cartella, o
                       un'altra cartella dell'elenco dichiara già quell'id. Allora
                       è una copia, e la copia riceve un id nuovo.
       · apri          si riapre una cartella che c'è già: vince l'id scritto
                       nella cartella, tranne quando la cartella è la copia di
                       quella che sta dove la voce la registra. Senza un id
                       valido, per nome come prima (progettoDelVault, invariata),
                       ma senza adottare la voce che un'altra cartella dell'elenco
                       dichiara già (D3). Una cartella VUOTA e senza id è una
                       creazione: si conia.
       · voce          si riapre una voce di localStorage che porta con sé la sua
                       cartella: l'id resta quello della voce. Se la cartella
                       dichiara un altro id è di un'altra mappa, e la voce la
                       lascia (`stacca`). Senza id nella cartella, la voce ce lo
                       scrive solo se è quella che la posizione riconosce.
     q = { gesto, idCartella, idAttuale, pos: { vault, classDir, discDir },
           fullPath, percorsoPrima, vuota, cartelle }   (cartelle = get-all-vaults)
     Esce { id, fonte, stacca, scrivi }: `id: null` vuol dire «conia» (il core non
     ha l'orologio, il chiamante fa 'proj_' + Date.now()); `fonte` è 'cartella',
     'attuale', 'nome', 'nuovo' o 'copia'; `scrivi` dice se l'id deciso si può
     scrivere nella cartella.
     SCRIVI_NEI_VAULT_VECCHI è il bivio 2 dell'ADR 0013 (Giacomo, 28/9: «A:
     migrazione pigra»): un vault vecchio, riconosciuto per nome, riceve l'id al
     primo salvataggio. `false` = solo le cartelle nate da ora (opzione B). */
  var SCRIVI_NEI_VAULT_VECCHI = true;

  /* La forma dell'id la dice FilesCore (`idProgettoValido`, una fonte sola per
     renderer e main.js — inv. 6), risolto al momento della chiamata: in Node con
     `require`, nel browser da `window` (files-core si carica DOPO teach-core).
     Senza FilesCore nessun id è valido, e si torna al comportamento di prima. */
  function _idProgettoValido(x) {
    var F = null;
    try {
      if (typeof module !== 'undefined' && module.exports && typeof require === 'function') F = require('./mappai-files-core.js');
    } catch (e) { F = null; }
    if (!F && typeof window !== 'undefined') F = window.MappAIFilesCore || null;
    return !!(F && F.idProgettoValido && F.idProgettoValido(x));
  }
  /* Due percorsi della stessa cartella arrivano in forme diverse: dal disco
     scomposti (NFD), dalla memoria composti, a volte con la barra finale. Si
     confrontano nella stessa forma (trappole 25 e 50).
     0061, 30/09: anche le barre. Su Windows lo stesso percorso arriva con `\`
     (nativo) o con `/` (costruito dall'app), a volte misto: si porta tutto a `/`
     su tutti e due i lati, o la cartella in cui la mappa sta già sembrerebbe
     un'altra, e l'esportazione una copia. */
  function _stessoPercorso(a, b) {
    var forma = function (s) { return nfc(s).replace(/\\/g, '/').replace(/\/+$/, ''); };
    var x = forma(a), y = forma(b);
    return !!x && x === y;
  }
  // Una cartella dell'elenco (nome, classe, materia dal disco) sta nella posizione che una voce registra?
  function _stessaPosizione(v, p) {
    return !!v && !!p && !!nfc(v.folderName) && nfc(v.folderName) === nfc(p.vault)
      && nfc(v.classDir || '') === nfc(p.classDir || '') && nfc(v.discDir || '') === nfc(p.discDir || '');
  }

  function identitaDellaCartella(projects, q) {
    q = q || {};
    var voci = Array.isArray(projects) ? projects.filter(Boolean) : [];
    var cartelle = Array.isArray(q.cartelle) ? q.cartelle.filter(Boolean) : [];
    var esito = function (id, fonte, scrivi, stacca) { return { id: id, fonte: fonte, stacca: !!stacca, scrivi: !!scrivi }; };
    var gesto = q.gesto || 'apri';

    if (gesto === 'nuova') {
      // una voce del giro che dichiara già una cartella, anche proprio questa, vuol
      // dire che l'id non è nato con questa creazione
      if (_idProgettoValido(q.idAttuale)) {
        var delGiro = voci.filter(function (p) { return p.id === q.idAttuale; })[0];
        if (!delGiro || !delGiro.vault) return esito(q.idAttuale, 'attuale', true);
      }
      return esito(null, 'nuovo', true);
    }

    if (gesto === 'per-la-mappa') {
      if (!_idProgettoValido(q.idAttuale)) return esito(null, 'nuovo', true);
      if (q.percorsoPrima && !_stessoPercorso(q.percorsoPrima, q.fullPath)) return esito(null, 'copia', true);
      var altrove = cartelle.some(function (c) { return c.projectId === q.idAttuale && !_stessoPercorso(c.fullPath, q.fullPath); });
      return altrove ? esito(null, 'copia', true) : esito(q.idAttuale, 'attuale', true);
    }

    if (gesto === 'voce') {
      var dichiarato = _idProgettoValido(q.idCartella);
      var scrivi = dichiarato ? q.idCartella === q.idAttuale
        : (SCRIVI_NEI_VAULT_VECCHI && (progettoDelVault(voci, q.pos) || {}).id === q.idAttuale);
      return esito(q.idAttuale, 'attuale', scrivi, dichiarato && q.idCartella !== q.idAttuale);
    }

    // apri
    if (_idProgettoValido(q.idCartella)) {
      var suaVoce = voci.filter(function (p) { return p.id === q.idCartella; })[0];
      var copia = !!suaVoce && cartelle.some(function (c) {
        return c.projectId === q.idCartella && !_stessoPercorso(c.fullPath, q.fullPath) && _stessaPosizione(c, suaVoce);
      });
      // anche se nessuna voce ha quell'id: altro computer, app installata contro `dev`, voce potata
      return copia ? esito(null, 'copia', true) : esito(q.idCartella, 'cartella', true);
    }
    // vuota e senza id: è una creazione, e la mappa aperta prima non conta
    if (q.vuota) return esito(null, 'nuovo', true);
    var casaAltrove = {};
    cartelle.forEach(function (c) {
      if (_idProgettoValido(c.projectId) && !_stessoPercorso(c.fullPath, q.fullPath)) casaAltrove[c.projectId] = true;
    });
    var perNome = progettoDelVault(voci.filter(function (p) { return !casaAltrove[p.id]; }), q.pos);
    return perNome ? esito(perNome.id, 'nome', SCRIVI_NEI_VAULT_VECCHI) : esito(null, 'nuovo', SCRIVI_NEI_VAULT_VECCHI);
  }

  // Il gesto di chi CREA una cartella, dal motivo che `ensureProjectVault` riceve.
  function gestoDiCreazione(reason) {
    return (reason === 'open' || reason === 'review') ? 'per-la-mappa' : 'nuova';
  }

  /* La voce che corrisponde a una cartella dell'elenco (INSEGNA, D4). Se la
     cartella dichiara un id valido la risposta è DECISA: l'unica voce con
     quell'id nella stessa posizione della cartella, oppure nessuna — mai
     un'omonima. Senza id valido `{ decisa: false }`, e il chiamante fa il suo
     ripiego di prima. */
  function voceDellaCartella(projects, v) {
    if (!v || !_idProgettoValido(v.projectId)) return { decisa: false };
    var conId = (Array.isArray(projects) ? projects : []).filter(function (p) { return p && p.id === v.projectId; });
    return { decisa: true, voce: (conId.length === 1 && _stessaPosizione(v, conId[0])) ? conId[0] : null };
  }

  // ── anteprimaPotatura (15/8 sera) ────────────────────────────────────────
  // La stessa potatura di vociDaPotare, ma RACCONTATA prima di farla: quante
  // copie per mappa, e il riassunto per la conferma. `pesoDi(id)` la passa il
  // chiamante (nel core non c'è localStorage): null = niente pesi.
  function anteprimaPotatura(projects, keep, pesoDi) {
    var via = vociDaPotare(projects, keep, null);
    var viaSet = {};
    via.forEach(function (id) { viaSet[id] = 1; });
    var perMappa = {};
    var byte = 0;
    (projects || []).forEach(function (p) {
      if (!p || !viaSet[p.id]) return;
      var k = etichettaPotatura(p);
      perMappa[k] = (perMappa[k] || 0) + 1;
      if (pesoDi) { try { byte += pesoDi(p.id) || 0; } catch (e) { } }
    });
    var righe = Object.keys(perMappa)
      .map(function (k) { return { mappa: k, tolte: perMappa[k] }; })
      .sort(function (a, b) { return b.tolte - a.tolte; });
    return { via: via, perMappa: righe, byte: byte };
  }

  // ── vociDaPotare (15/8) ───────────────────────────────────────────────────
  // Le voci di progetto in ECCESSO: per ogni mappa (chiave = vault, NFC) si
  // tengono le `keep` più recenti, il resto è da togliere. Usata dal
  // salvataggio quando localStorage è pieno: si libera lo spazio dei doppioni
  // — che nessuna schermata sa aprire (chi apre passa dal match, che prende
  // sempre la più recente) — invece di fallire a metà. `protectedId` non si
  // tocca mai: è la voce che si sta salvando.
  // ⚠️ La chiave è la POSIZIONE esatta della mappa, come il primo livello di
  // progettoDelVault: vault + classe + disciplina (25/9/2026). Prima era
  // `vault || name`, e `vault` è il NOME della cartella: due «La Carta» di
  // classi diverse si contavano come una mappa sola, e una voce SENZA vault
  // finiva raggruppata per nome — con «Mappa Senza Nome» o due omonime, la più
  // vecchia spariva. Ma una voce senza vault è un progetto solo-localStorage,
  // cioè l'UNICA copia: non è il doppione di niente, e non si pota mai.
  function chiavePotatura(p) {
    if (!p || !p.vault) return null;
    return nfc(p.vault) + '\u0000' + nfc(p.classDir || '') + '\u0000' + nfc(p.discDir || '');
  }
  function etichettaPotatura(p) {
    return [p.vault, p.classDir, p.discDir].filter(Boolean).map(nfc).join(' · ');
  }
  function vociDaPotare(projects, keep, protectedId) {
    if (!Array.isArray(projects)) return [];
    var n = Math.max(1, keep || 1);
    var gruppi = {};
    projects.forEach(function (p) {
      if (!p || !p.id) return;
      var k = chiavePotatura(p);
      if (k == null) return;
      (gruppi[k] = gruppi[k] || []).push(p);
    });
    var via = [];
    Object.keys(gruppi).forEach(function (k) {
      gruppi[k]
        .slice()
        .sort(function (a, b) { return (b.date || 0) - (a.date || 0); })
        .slice(n)
        .forEach(function (p) { if (p.id !== protectedId) via.push(p.id); });
    });
    return via;
  }

  var CORE = {
    normGrade: normGrade,
    registryAdd: registryAdd,
    classesForMap: classesForMap,
    rankMapsForClass: rankMapsForClass,
    buildSetsIndex: buildSetsIndex,
    filterByClass: filterByClass,
    matchesSelectedProject: matchesSelectedProject,
    progettoDelVault: progettoDelVault,
    identitaDellaCartella: identitaDellaCartella,   // 0061: creare non è aprire (ADR 0013)
    gestoDiCreazione: gestoDiCreazione,
    voceDellaCartella: voceDellaCartella,
    SCRIVI_NEI_VAULT_VECCHI: SCRIVI_NEI_VAULT_VECCHI,
    nfc: nfc,
    stessoNome: stessoNome,
    vociDaPotare: vociDaPotare,
    anteprimaPotatura: anteprimaPotatura,
    REGISTRY_CAP: REGISTRY_CAP
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = CORE;
  if (typeof window === 'undefined') return;
  window.MappAITeachCore = CORE;
  console.log('[MappAITeachCore] logica pura landing Insegna caricata');
})();
