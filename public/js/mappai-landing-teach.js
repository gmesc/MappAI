/*
 * mappai-landing-teach.js — UI della landing "Costruisci / Insegna" (005)
 * -----------------------------------------------------------------------
 * Controlla il toggle di modalità sotto l'hero, la sezione progetti
 * collassabile di Costruisci (con assegnazione grade), le tre sezioni
 * collassabili di Insegna (Progetti / Materiali / Quiz & flashcard), il
 * filtro "Solo classe attiva" e i tre avvii rapidi QR.
 *
 * Logica pura → mappai-teach-core.js (MappAITeachCore). Qui solo I/O e DOM.
 * Dipendenze globali: StorageManager.renderRecentProjects/loadProject,
 * MappAIClasses, MappAIStudyDocs, MappAIStudyExport.openPrintable,
 * window.openCollabHub, MappAILive.openSetup/openMaterials/publishHtml,
 * window.safeCreateIcons. Caricato DOPO mappai-teach-core.js.
 */
(function () {
  'use strict';

  var LS_MODE = 'mappai_landing_mode';        // 'build' | 'teach'
  var LS_FILTER = 'mappai_teach_class_filter'; // 'all' | 'active'
  var LS_REGISTRY = 'mappai_session_registry';
  var LS_SETS = 'mappai_studysets_index';

  function _t(k, f) { return window.t ? window.t(k, f) : f; }
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  var CORE = function () { return window.MappAITeachCore; };

  // ── localStorage I/O ───────────────────────────────────────────────────────
  /* '' = landing VUOTA: nessun tab scelto. È lo stato di partenza (2/8) — a
     schermo restano il marchio, il chip del contesto, la Cabina e il selettore,
     e nient'altro finché non si dice che cosa si viene a fare. Prima qualunque
     valore non riconosciuto ripiegava su 'build', quindi lo stato vuoto non
     poteva esistere. */
  function readMode() {
    try {
      var m = localStorage.getItem(LS_MODE);
      return (m === 'teach' || m === 'elabora' || m === 'build') ? m : '';
    } catch (e) { return ''; }
  }
  function readFilter() { try { return localStorage.getItem(LS_FILTER) === 'active' ? 'active' : 'all'; } catch (e) { return 'all'; } }
  function regRead() { try { return JSON.parse(localStorage.getItem(LS_REGISTRY) || '[]'); } catch (e) { return []; } }
  function regWrite(arr) { try { localStorage.setItem(LS_REGISTRY, JSON.stringify(arr)); } catch (e) { /* quota */ } }
  function setsRead() { try { return JSON.parse(localStorage.getItem(LS_SETS) || '[]'); } catch (e) { return []; } }
  function projectsRead() {
    var arr;
    try { arr = JSON.parse(localStorage.getItem('tutor_ai_projects') || '[]'); } catch (e) { return []; }
    // Heal (#2, 22/7): risolve p.cls dal p.clsId congelato quando il nome mancava
    // al primo salvataggio (store classi async non ancora caricato). Scrive UNA
    // volta → la classe compare nei chip e nel filtro anche dopo il boot.
    try {
      if (window.MappAIClasses && window.MappAIClasses.get) {
        var changed = false;
        arr.forEach(function (p) {
          if ((!p.cls || p.cls === '') && p.clsId) {
            var c = window.MappAIClasses.get(p.clsId);
            if (c && c.name) { p.cls = c.name; changed = true; }
          }
        });
        if (changed) localStorage.setItem('tutor_ai_projects', JSON.stringify(arr));
      }
    } catch (e) { /* best-effort */ }
    return arr;
  }
  function activeClass() { try { return (window.MappAIClasses && window.MappAIClasses.getActive()) || null; } catch (e) { return null; } }
  function classList() { try { return (window.MappAIClasses && window.MappAIClasses.list()) || []; } catch (e) { return []; } }

  // Registro sessioni: scrittura pubblica (chiamata da collab/live teacher).
  function logSession(entry) {
    var core = CORE();
    if (!core) return;
    // cls non passata → classe attiva (Generico = null → nessun chip).
    var defCls = null;
    try { var ac = activeClass(); defCls = ac && ac.name ? ac.name : null; } catch (e2) { }
    var e = {
      map: entry && entry.map != null ? entry.map : '',
      projectId: entry && entry.projectId != null ? entry.projectId : (window.StorageManager && StorageManager.currentProjectId) || null,
      cls: entry && entry.cls !== undefined ? entry.cls : defCls,
      activity: entry && entry.activity != null ? entry.activity : '',
      date: Date.now()
    };
    regWrite(core.registryAdd(regRead(), e));
    if (readMode() === 'teach') refresh();
  }

  // ── Toggle di modalità ─────────────────────────────────────────────────────
  function applyMode() {
    var mode = readMode();
    var build = document.getElementById('build-content');
    var teach = document.getElementById('teach-content');
    var elab = document.getElementById('elabora-content');
    var segB = document.getElementById('landing-mode-build');
    var segT = document.getElementById('landing-mode-teach');
    var segE = document.getElementById('landing-mode-elabora');
    var clsFilter = document.getElementById('teach-class-filter');
    var quickActions = document.getElementById('landing-quick-actions');
    var metaLinks = document.getElementById('landing-meta-links');
    if (build) build.classList.toggle('hidden', mode !== 'build');
    if (teach) teach.classList.toggle('hidden', mode !== 'teach');
    if (elab) elab.classList.toggle('hidden', mode !== 'elabora');
    if (segB) segB.classList.toggle('active', mode === 'build');
    if (segT) segT.classList.toggle('active', mode === 'teach');
    if (segE) segE.classList.toggle('active', mode === 'elabora');
    if (clsFilter) clsFilter.classList.toggle('hidden', mode !== 'teach');
    /* Landing vuota: spariscono anche gli avvii rapidi e i link in fondo —
       appartengono a COSTRUISCI, non alla schermata d'ingresso. */
    var vuota = !mode;
    if (quickActions) quickActions.classList.toggle('hidden', mode === 'elabora' || vuota);
    if (metaLinks) metaLinks.classList.toggle('hidden', mode === 'elabora' || vuota);
    applyFilterSeg();
    // Lasciando ELABORA: smonta l'overlay fullscreen (portal a livello di body).
    if (mode !== 'elabora' && window.MappAIElabora && window.MappAIElabora.teardown) window.MappAIElabora.teardown();
    /* COSTRUISCI non ha più niente da rendere: è il modulo di generazione, e
       basta (la lista dei progetti è stata eliminata il 3/8). */
    if (mode === 'teach') { refresh(); _ensureFreshAndRerender(); }
    else if (mode === 'elabora' && window.MappAIElabora) { window.MappAIElabora.open(); _ensureFreshAndRerender(); }
  }

  // #3 (22/7): il primo render di Insegna/ELABORA usa stato che arriva ASINCRONO —
  // scansione vault su disco (validVaultFolders), store classi (IPC), liste materiali.
  // Entrando in modalità ri-sincronizza quei dati e RIRENDE una volta pronti, così
  // non serve un refresh manuale per vedere l'ultimo vault/i file appena generati.
  var _freshBusy = false;
  function _ensureFreshAndRerender() {
    if (_freshBusy) return; _freshBusy = true;
    var tasks = [];
    try { if (window.StorageManager && StorageManager.syncValidVaults) tasks.push(StorageManager.syncValidVaults()); } catch (e) { }
    try { if (window.MappAIClasses && window.MappAIClasses.load && !window.MappAIClasses.loaded) tasks.push(window.MappAIClasses.load()); } catch (e) { }
    var done = function () {
      _freshBusy = false;
      var m = readMode();
      if (m === 'teach') refresh();
      else if (m === 'elabora' && window.MappAIElabora) window.MappAIElabora.render();
    };
    if (!tasks.length) { _freshBusy = false; return; }
    Promise.all(tasks).then(done).catch(function () { _freshBusy = false; });
  }

  // Filtro classe CONDIVISO (Insegna + Costruisci + Elabora): stessi segmenti stile
  function applyFilterSeg() {
    var f = readFilter();
    [['teach-filter-all', 'teach-filter-class'], ['build-filter-all', 'build-filter-class'], ['elab-filter-all', 'elab-filter-class']].forEach(function (pair) {
      var a = document.getElementById(pair[0]); var c = document.getElementById(pair[1]);
      if (a) a.classList.toggle('active', f === 'all');
      if (c) c.classList.toggle('active', f === 'active');
    });
  }

  /* `voce` = la mappa su cui riaprire la console, quando si torna alla landing
     dopo esserne usciti (segnalibro, vedi `_consBack`). */
  function setMode(m, voce) {
    // ELABORA (co-docente): senza mappa caricata mostra il selettore progetti
    // (empty-state con lista) → scegli una mappa da elaborare. Nessun blocco.
    /* INSEGNA non è più un tab della landing (2/8): apre la CONSOLE a tutto
       schermo. Kill-switch `mappai_teach_console='0'` → le tre sezioni di prima. */
    if (m === 'teach' && consoleAttiva() && window.MappAIModal) {
      /* La landing SOTTO va su COSTRUISCI. Prima `setMode` usciva senza
         scrivere la modalità, quindi «sotto resta com'era»: chi entrava in
         INSEGNA da ELABORA, chiudendo la console si ritrovava in ELABORA — ed è
         quello che Giacomo vedeva tornando dalla mappa con HOME. La console è a
         tutto schermo: quello che sta sotto non è una scelta dell'utente, è
         solo dove si atterra quando la si chiude. */
      try { localStorage.setItem(LS_MODE, 'build'); } catch (e) { }
      applyMode();
      refresh();                 // le viste della classe si montano da qui
      _ensureFreshAndRerender();
      /* Il rail deve marcare INSEGNA, non il «build» qui sopra — che è dove si
         atterra CHIUDENDO la console, non dove si è. Lo legge la veste dal
         riquadro appena aperto (mappai-console-manifesto.js). */
      try { document.documentElement.dataset.manSezionePendente = 'teach'; } catch (e) { }
      openConsoleInsegna(voce);
      return;
    }
    /* '' = torna alla landing vuota. Prima qualunque valore diverso da
       teach/elabora finiva su 'build', quindi `setMode('')` accendeva
       COSTRUISCI: la funzione non sapeva dire lo stato in cui l'app si apre. */
    var mm = (m === 'teach' || m === 'elabora' || m === 'build') ? m : '';
    try { localStorage.setItem(LS_MODE, mm); } catch (e) { }
    applyMode();
  }

  function setClassFilter(f) {
    try { localStorage.setItem(LS_FILTER, f === 'active' ? 'active' : 'all'); } catch (e) { }
    applyFilterSeg();
    var mode = readMode();
    /* in COSTRUISCI non c'è più un elenco da filtrare: uscire qui, altrimenti
       si finirebbe a ridisegnare INSEGNA stando in un'altra modalità */
    if (mode === 'build' || !mode) return;
    if (mode === 'elabora' && window.MappAIElabora) window.MappAIElabora.render();
    else refresh();
  }

  /* «Progetti salvati» di COSTRUISCI non esiste più (3/8): le mappe già fatte si
     aprono da ELABORA e da INSEGNA, che le leggono dal DISCO. Le due funzioni
     restano come no-op perché sono esposte su `MappAITeach` e qualcuno potrebbe
     ancora chiamarle (l'`onclick` del markup è sparito con la sezione). */
  function toggleBuildProjects() { /* sezione eliminata */ }
  function renderBuildProjects() { /* sezione eliminata */ }

  // ── Progetti in ELABORA: stesso layout tabella di Insegna (Tipo/Titolo/Classe/
  //    Data), MA senza «Riprendi» né QR; click riga → carica + elabora (openProject).
  // ELABORA «Progetti esistenti» — stessa fonte di verità = disco (22/7), come
  // Insegna: filtro classe + chip coerenti col contenitore di classe reale.
  var _elabVaults = [];

  /* ── IL GENERE DELLE MAPPE, LETTO DAL DISCO (Giacomo, 8/8 notte) ───────────
     `index.yaml` dice se una mappa è una MindMap o un Knowledge Graph, e
     `get-all-vaults` lo restituisce in `extractionMode`. Ma i picker che
     elencano i PROGETTI di localStorage hanno in mano solo `p.type`, che le
     mappe generate senza progetto non hanno: da lì l'icona delle MindMap su un
     KG. Qui si tiene una cache nome→genere, riempita ogni volta che qualcuno
     legge i vault (INSEGNA, ELABORA, la console): i picker la interrogano e
     ripiegano su `p.type` solo se non c'è ancora passato nessuno.
     ⚠️ La chiave è il nome della CARTELLA del vault quando il progetto la
     dichiara, e il nome della mappa altrimenti: due mappe omonime in classi
     diverse condividono la seconda chiave, e in quel caso vince l'ultima
     letta. È il compromesso di un picker che elenca progetti, non cartelle. */
  var _generi = {};
  function _gk(x) { return String(x == null ? '' : x).trim().toLowerCase(); }
  function _segnaGeneri(vaults) {
    (vaults || []).forEach(function (v) {
      if (!v) return;
      var g = v.extractionMode === 'kg' ? 'kg' : (v.extractionMode === 'mindmap' ? 'mindmap' : '');
      if (!g) return;
      if (v.folderName) _generi[_gk(v.folderName)] = g;
      if (v.rootNodeLabel) _generi[_gk(v.rootNodeLabel)] = g;
    });
  }
  /* il genere di un progetto: prima il disco, poi quello che il progetto dice */
  function _tipoDi(p) {
    if (!p) return 'mindmap';
    return _generi[_gk(p.vault)] || _generi[_gk(p.name)] || (p.type === 'kg' ? 'kg' : 'mindmap');
  }
  var _elabContainer = 'elab-projects';
  function renderElaboraProjects(containerId) {
    _elabContainer = containerId || 'elab-projects';
    var body = document.getElementById(_elabContainer);
    if (!body) return;
    if (!window.electronAPI || !window.electronAPI.getAllVaults) { renderElaboraProjectsLocal(body); return; }
    window.electronAPI.getAllVaults().then(function (vaults) {
      _segnaGeneri(vaults);
      renderElaboraProjectsDisk(body, vaults || []);
    }).catch(function () { renderElaboraProjectsLocal(body); });
  }
  function renderElaboraProjectsDisk(body, vaults) {
    var core = CORE();
    var reg = regRead();
    var norm = (core && core.normGrade) ? core.normGrade : function (x) { return String(x == null ? '' : x).toLowerCase().trim(); };
    _elabVaults = filterVaults(vaults);
    if (!_elabVaults.length) {
      body.innerHTML = '<p class="text-xs text-slate-400 italic px-2 py-2">' + esc(_t('el_no_projects', 'Nessuna mappa salvata da elaborare.')) + '</p>';
      return;
    }
    body.innerHTML = fileTable(_elabVaults.map(function (rec, i) {
      var v = rec.v, p = rec.p;
      var meta = TYPE_META[v.extractionMode === 'kg' ? 'kg' : 'mindmap'];
      var chips = vaultChips(rec);
      var tuned = !!(p && p.tuned);
      var dot = '<span class="inline-block w-2 h-2 rounded-full shrink-0 ' + (tuned ? 'bg-emerald-500' : 'bg-slate-300') + '"></span>';
      var block = actIcon('folder', _t('lt_open_finder', 'Apri nel Finder'), "window.MappAITeach.elabFinder(" + i + ")", null, false) +
        actIcon('trash-2', _t('rp_delete', 'Elimina'), "window.MappAITeach.elabDelete(" + i + ")", 'text-slate-300 hover:text-red-500', false);
      var assign = "window.MappAITeach.assignElab(" + i + ")";
      return fileRow({
        tipo: tipoCell(meta.icon, meta.label, meta.full),
        title: v.rootNodeLabel || v.folderName, titleTip: (v.rootNodeLabel || v.folderName), dot: dot,
        cls: classCell(chips, assign), disc: vaultDisc(rec), assign: assign,
        date: dateCell(v.lastUpdated ? new Date(v.lastUpdated).getTime() : 0),
        block: block,
        onClick: "window.MappAITeach.elabOpen(" + i + ")",
        selected: false
      });
    }).join(''), true);
    if (window.safeCreateIcons) window.safeCreateIcons();
  }
  function _elabRec(i) { return _elabVaults[i] || null; }
  function elabOpen(i) {
    var r = _elabRec(i); if (!r) return;
    if (r.p && window.MappAIElabora && window.MappAIElabora.openProject) return window.MappAIElabora.openProject(r.p.id);
    // Vault orfano: carica dal disco poi entra in ELABORA sulla mappa corrente.
    if (window.directLoadVault) {
      window.directLoadVault(r.v.fullPath);
      setTimeout(function () { if (window.MappAIElabora && window.MappAIElabora.openFromMap) window.MappAIElabora.openFromMap(); }, 450);
    }
  }
  function elabFinder(i) {
    var r = _elabRec(i); if (!r) return;
    if (window.electronAPI && window.electronAPI.pipelineOpenFolder) window.electronAPI.pipelineOpenFolder({ folderPath: r.v.fullPath });
    else toast(_t('fx_desktop', 'Disponibile solo nell\'app desktop.'), 'warning');
  }
  function elabDelete(i) {
    var r = _elabRec(i); if (!r) return;
    var title = r.v.rootNodeLabel || r.v.folderName;
    confirmDeleteText(title, function () {
      var purgeLocal = function () {
        if (!r.p) return;
        try { var arr = projectsRead().filter(function (x) { return x.id !== r.p.id; }); localStorage.setItem('tutor_ai_projects', JSON.stringify(arr)); localStorage.removeItem(r.p.id); } catch (e) { }
      };
      if (window.electronAPI && window.electronAPI.deleteVault) {
        window.electronAPI.deleteVault({ folderPath: r.v.fullPath }).then(function (res) {
          if (res && res.success) { toast(_t('lt_vault_deleted', 'Cartella spostata nel Cestino.'), 'success'); purgeLocal(); renderElaboraProjects(_elabContainer); }
          else toast((res && res.error) || _t('lt_vault_del_fail', 'Impossibile eliminare la cartella.'), 'error');
        }).catch(function () { toast(_t('lt_vault_del_fail', 'Impossibile eliminare la cartella.'), 'error'); });
      } else { purgeLocal(); renderElaboraProjects(_elabContainer); }
    });
  }
  // ── Assegnazione a posteriori di classe e disciplina (29/7, solo ELABORA) ──
  // Una mappa generata senza contesto (o generata prima di questa funzione) resta
  // senza materia: i badge «GENERICO»/«MATERIA?» la segnalano e aprono questo
  // modale. Assegnare SPOSTA la cartella su disco — la cartella è la fonte di
  // verità del resto della UI, un campo che la contraddicesse tornerebbe a
  // mostrare il badge al render successivo.
  function _classesForAssign() {
    try { return (window.MappAIClasses && window.MappAIClasses.list()) || []; } catch (e) { return []; }
  }
  function _discChoices(cls) {
    try {
      var CL = window.MappAIClasses;
      return (CL && CL.disciplineChoices) ? CL.disciplineChoices(cls) : [];
    } catch (e) { return []; }
  }
  function assignElab(i) {
    var rec = _elabRec(i);
    if (!rec) return;
    _openAssignModal(rec, function () { renderElaboraProjects(_elabContainer); });
  }
  // Variante localStorage-only (browser senza Electron): stesso modale, ma senza
  // spostamento su disco — c'è solo il progetto.
  function assignElabLocal(id) {
    var p = projectsRead().find(function (x) { return x.id === id; });
    if (!p) return;
    _openAssignModal({ v: null, p: p }, function () { renderElaboraProjects(_elabContainer); });
  }

  function _openAssignModal(rec, onDone) {
    var p = rec.p, v = rec.v;
    var title = (v && (v.rootNodeLabel || v.folderName)) || (p && p.name) || _t('lt_this_map', 'questa mappa');
    var classes = _classesForAssign();
    var curClsId = (p && p.clsId) || '';
    // Se il progetto non porta l'id ma il nome, recupera l'id dalla lista.
    if (!curClsId && p && p.cls) {
      var byName = classes.find(function (c) { return c.name === p.cls; });
      if (byName) curClsId = byName.id;
    }
    var curDisc = (p && p.disc) || (v && v.discDir ? prettyClass(v.discDir) : '');
    if (!MM()) return;

    function scelteDisc(clsId) {
      var cls = clsId ? (window.MappAIClasses && window.MappAIClasses.get(clsId)) : null;
      var choices = cls ? _discChoices(cls) : [];
      // Disciplina già assegnata ma non più in elenco: resta selezionabile, così
      // aprire il modale «per sbaglio» non la cancella.
      if (curDisc && choices.indexOf(curDisc) < 0) choices = choices.concat([curDisc]);
      return choices;
    }
    function schema(clsId, disc) {
      var choices = scelteDisc(clsId);
      return {
        titolo: _t('lt_assign_title', 'Assegna classe e disciplina'),
        sottotitolo: title, icona: 'book-open', taglia: 'm',
        sezioni: [{
          titolo: _t('lt_assign_sez', 'Destinazione'),
          campi: [
            {
              id: 'classe', tipo: 'scelta', etichetta: _t('rp_class', 'Classe'), valore: clsId,
              opzioni: [{ valore: '', etichetta: _t('lt_assign_noclass', '— nessuna classe (generico) —') }]
                .concat(classes.map(function (c) { return { valore: c.id, etichetta: c.name }; }))
            },
            {
              id: 'disc', tipo: 'scelta', etichetta: _t('rp_disc', 'Disciplina'), valore: disc,
              /* senza classe non esiste una cartella-disciplina: invece di un
                 campo grigio, l'unica voce dice che cosa manca */
              opzioni: [{
                valore: '', etichetta: clsId
                  ? _t('lt_assign_nodisc', '— nessuna disciplina —')
                  : _t('lt_assign_needclass', '— scegli prima la classe —')
              }].concat(clsId ? choices : [])
            }
          ]
        }],
        nota: _t('lt_assign_hint', 'La cartella della mappa viene spostata in Mappe/<classe>/<disciplina>. I materiali già dentro il vault la seguono.'),
        azioni: [
          { id: 'no', etichetta: _t('lt_cancel', 'Annulla') },
          { id: 'ok', etichetta: _t('lt_assign_go', 'Assegna'), ruolo: 'primario' }
        ]
      };
    }
    var s = schema(curClsId, curDisc);
    s.suAzione = function (ev, box, ridisegna) {
      if (ev.azione !== '__campo' || ev.campo !== 'classe') return;
      var clsId = ev.valori.classe;
      // la disciplina scelta resta solo se la nuova classe la insegna
      var disc = scelteDisc(clsId).indexOf(ev.valori.disc) >= 0 ? ev.valori.disc : '';
      ridisegna(schema(clsId, disc));
    };
    MM().open(s).then(function (r) {
      if (!r || r.azione !== 'ok') return;
      var clsId = r.valori.classe || '';
      _applyAssignment(rec, clsId, clsId ? (r.valori.disc || '') : '').then(function (ok) {
        if (ok) toast(_t('lt_assign_done', 'Mappa riassegnata.'), 'success');
        if (onDone) onDone();
      });
    });
  }

  // Sposta la cartella (se c'è) e riallinea i metadati del progetto.
  function _applyAssignment(rec, clsId, disc) {
    var fc = FCore();
    var cls = clsId && window.MappAIClasses && window.MappAIClasses.get ? window.MappAIClasses.get(clsId) : null;
    var classDir = (cls && cls.name && fc) ? fc.mapClassFolder(cls.sede, cls.name) : '';
    var discDir = (classDir && fc) ? fc.disciplineFolder(disc) : '';
    var p = rec.p, v = rec.v;

    var writeMeta = function (folderName, fullPath) {
      if (!p) return;
      try {
        var arr = projectsRead();
        var t = arr.find(function (x) { return x.id === p.id; });
        if (t) {
          t.cls = cls ? cls.name : null;
          t.clsId = cls ? cls.id : null;
          t.classDir = classDir || null;
          t.disc = disc || null;
          t.discDir = discDir || null;
          if (folderName) t.vault = folderName;
          localStorage.setItem('tutor_ai_projects', JSON.stringify(arr));
        }
      } catch (e) { /* best-effort */ }
      // Mappa aperta in questo momento → allinea lo stato, altrimenti il prossimo
      // autosave riscriverebbe il vecchio percorso.
      try {
        if (fullPath && typeof StorageManager !== 'undefined' && StorageManager.currentProjectId === p.id) {
          var st = window.appState || null;
          if (st) { st.activeVaultPath = fullPath; st.activeVaultClassDir = classDir || null; st.activeVaultDiscDir = discDir || null; }
        }
      } catch (e) { /* appState lessicale: best-effort */ }
    };

    if (!v || !v.fullPath || !window.electronAPI || !window.electronAPI.vaultRelocate) {
      writeMeta(null, null);   // browser / progetto senza cartella: solo metadati
      return Promise.resolve(true);
    }
    return window.electronAPI.vaultRelocate({ folderPath: v.fullPath, classDir: classDir, discDir: discDir })
      .then(function (res) {
        if (!res || !res.success) {
          toast((res && res.error) || _t('lt_assign_fail', 'Impossibile spostare la cartella della mappa.'), 'error');
          return false;
        }
        writeMeta(res.folderName, res.fullPath);
        /* la cartella si è spostata: ogni elenco che la mostra è stantio (9/8) */
        try { if (window.MappAIVaults) window.MappAIVaults.segnala('mappa-spostata', { vaultPath: res.fullPath }); } catch (e) { }
        return true;
      })
      .catch(function () { toast(_t('lt_assign_fail', 'Impossibile spostare la cartella della mappa.'), 'error'); return false; });
  }

  // Fallback senza Electron: elenco dal solo localStorage.
  function renderElaboraProjectsLocal(body) {
    var projects = projectsRead();
    var allow = allowedProjectIds();
    if (Array.isArray(allow) && allow.length) { var set = {}; allow.forEach(function (i) { set[i] = 1; }); projects = projects.filter(function (p) { return set[p.id]; }); }
    if (!projects.length) {
      body.innerHTML = '<p class="text-xs text-slate-400 italic px-2 py-2">' + esc(_t('el_no_projects', 'Nessuna mappa salvata da elaborare.')) + '</p>';
      return;
    }
    var core = CORE();
    var reg = regRead();
    var norm = (core && core.normGrade) ? core.normGrade : function (x) { return String(x == null ? '' : x).toLowerCase().trim(); };
    body.innerHTML = fileTable(projects.map(function (p) {
      var meta = TYPE_META[p.type === 'kg' ? 'kg' : 'mindmap'];
      var chips = [], seen = {};
      var push = function (c) { if (c == null || c === '') return; var k = norm(c) || String(c); if (seen[k]) return; seen[k] = 1; chips.push(c); };
      push(p.cls);
      if (core && core.classesForMap) core.classesForMap(reg, { projectId: p.id, map: p.name }).forEach(push);
      var dot = '<span class="inline-block w-2 h-2 rounded-full shrink-0 ' + (p.tuned ? 'bg-emerald-500' : 'bg-slate-300') + '"></span>';
      var block = actIcon('folder', p.vault ? _t('lt_open_finder', 'Apri nel Finder') : _t('lt_no_vault', 'Nessuna cartella vault su disco'), "window.MappAITeach.openProjectFolder('" + p.id + "')", null, !p.vault) +
        actIcon('trash-2', _t('rp_delete', 'Elimina'), "window.MappAITeach.deleteProject('" + p.id + "')", 'text-slate-300 hover:text-red-500', false);
      var assign = "window.MappAITeach.assignElabLocal('" + p.id + "')";
      return fileRow({
        tipo: tipoCell(meta.icon, meta.label, meta.full),
        title: p.name, titleTip: p.name, dot: dot,
        cls: classCell(chips, assign), disc: p.disc || prettyClass(p.discDir || ''), assign: assign,
        date: dateCell(p.date),
        block: block,
        onClick: "window.MappAIElabora && window.MappAIElabora.openProject('" + p.id + "')",
        selected: false
      });
    }).join(''), true);
  }

  // ── Filtro "Solo classe attiva" → id progetti ammessi ──────────────────────
  // null = nessun filtro (mostra tutto).
  function allowedProjectIds() {
    if (readFilter() !== 'active') return null;
    var ac = activeClass();
    if (!ac || !ac.name) return null; // Generico → nessun filtro
    var core = CORE();
    if (!core) return null;
    var reg = regRead();
    var items = projectsRead().map(function (p) {
      return { id: p.id, cls: p.cls, grade: p.grade, projectId: p.id, mapName: p.name };
    });
    var kept = core.filterByClass(items, ac, reg, projectsRead());
    return kept.map(function (i) { return i.id; });
  }

  // ── US5: mappa selezionata (click sulla riga «Progetti esistenti») ─────────
  // _selectedProject = { id, name } | null. Filtra le 3 sezioni sulla mappa scelta.
  // Non sopravvive al reload (gesto di consultazione). Kill-switch storico:
  // mappai_teach_row_select='0' → click sulla riga APRE la mappa (comportamento pre-011).
  var _selectedProject = null;
  var _diskCache = {};   // id materiale-disco → { vaultPath, relPath }
  function rowSelectEnabled() { try { return localStorage.getItem('mappai_teach_row_select') !== '0'; } catch (e) { return true; } }
  function selectProject(id) {
    var p = projectsRead().find(function (x) { return x.id === id; });
    if (!p) return;
    if (_selectedProject && _selectedProject.id === id) _selectedProject = null;   // 2° click → deseleziona
    else _selectedProject = { id: p.id, name: p.name };
    window.MappAITeach._selectedProject = _selectedProject;
    refresh();
  }
  function filterBySelection(items) {
    if (!_selectedProject) return items;
    var core = CORE();
    if (!core || !core.matchesSelectedProject) return items;
    return (items || []).filter(function (it) { return core.matchesSelectedProject(it, _selectedProject); });
  }
  // Materiali su disco (Materiale Studio/) del vault del progetto selezionato.
  function _diskKind(name) {
    var n = String(name || '');
    if (/\.mp3$|\.m4a$|\.wav$/i.test(n)) return { icon: 'volume-2', label: 'Audio' };
    /* MC e V/F PRIMA del ramo generico: sono due fogli diversi, si stampano in
       momenti diversi, e il nome li distingue già (buildFileName) */
    if (/^Quiz-MC-/i.test(n)) return { icon: 'list-checks', label: 'Quiz MC' };
    if (/^Quiz-VF-/i.test(n)) return { icon: 'check-check', label: 'Quiz V/F' };
    if (/^Quiz-/i.test(n)) return { icon: 'list-checks', label: 'Quiz' };
    if (/^Flashcard-/i.test(n)) return { icon: 'copy', label: 'Flashcard' };
    /* «Foglio-nodi-card», «Foglio nodi (rivisto)»: il separatore cambia col
       tipo di foglio, quindi non si può pretendere il trattino */
    if (/^Foglio.?nodi/i.test(n)) return { icon: 'scissors', label: 'Foglio nodi' };
    /* ⚠️ LA SINTESI CON LA VOCE PRIMA DI QUELLA NUDA, e non è un dettaglio:
       `^Sintesi` combacia anche con «Sintesi-voce-…», quindi messa per prima si
       mangerebbe l'altra e i due file tornerebbero nello stesso elenco — cioè
       la separazione fra ELABORA (dove si corregge) e INSEGNA (dove si
       consegna) sparirebbe, in silenzio. È lo stesso ordine che vale sopra per
       `Quiz-MC` e `Quiz-VF` rispetto a `Quiz`.
       `voce: true` è ciò che i due elenchi interrogano per sapere quale delle
       due nature hanno in mano: leggerlo dal nome ogni volta vorrebbe dire
       riscrivere la stessa espressione in tre posti. */
    if (/^Sintesi-voce\b/i.test(n)) return { icon: 'volume-2', label: 'Sintesi con voce', voce: true };
    if (/^Sintesi/i.test(n)) return { icon: 'sparkles', label: 'Sintesi' };
    /* «Catena-dei-perche-<Mappa> -VERDE.pdf» dalla pipeline, «Catena dei perché
       (rivista).html» dall'editor: stesso materiale, due produttori, due
       separatori — quindi `.?` come per il foglio dei nodi, mai un trattino
       preteso. E ci si ferma a «perch»: l'accento finale c'è o non c'è a
       seconda di chi ha scritto il nome, e non è quello a distinguere il
       genere. Senza questa riga i tre nomi cadevano in «File» e il docente li
       cercava fra i suoi materiali senza trovarli. */
    if (/^Catena.?dei.?perch/i.test(n)) return { icon: 'git-branch', label: 'Catena dei perché' };
    /* «Domande-aperte-<Mappa>.pdf» (11/8): il foglio su cui lo studente SCRIVE.
       Senza questa riga cadrebbe in «File» e il docente lo cercherebbe fra i
       suoi materiali senza trovarlo — è successo alla catena dei perché. */
    if (/^Domande.?aperte/i.test(n)) return { icon: 'pen-line', label: 'Domande aperte' };
    /* i .json sono i SET salvati (quiz, flashcard): materiale di lavoro
       dell'app, non un documento da portare in classe — si dicono per quello
       che sono e la console li mette in fondo */
    if (/\.json$/i.test(n)) return { icon: 'braces', label: 'Dati', dati: true };
    return { icon: 'file', label: 'File' };
  }
  function _diskMaterialsFor(p) {
    if (!p || !p.vault || !window.electronAPI || !window.electronAPI.getAllVaults || !window.electronAPI.vaultMaterialsList) return Promise.resolve([]);
    return window.electronAPI.getAllVaults().then(function (all) {
      var v = (all || []).find(function (x) { return x.folderName === p.vault; });
      if (!v) return [];
      return window.electronAPI.vaultMaterialsList({ vaultPath: v.fullPath }).then(function (res) {
        if (!res || !res.ok) return [];
        return (res.files || []).map(function (f) {
          var id = 'disk:' + f.relPath;
          _diskCache[id] = { vaultPath: v.fullPath, relPath: f.relPath };
          return { id: id, _disk: true, title: f.name, mapName: p.name, cls: p.cls, disc: p.disc || prettyClass(p.discDir || ''), projectId: p.id, date: f.mtime };
        });
      });
    }).catch(function () { return []; });
  }
  function openDiskFile(id) {
    var d = _diskCache[id];
    if (!d) return;
    if (window.electronAPI && window.electronAPI.pipelineOpenFile) window.electronAPI.pipelineOpenFile({ vaultPath: d.vaultPath, relPath: d.relPath });
    else toast(_t('fx_desktop', 'Disponibile solo nell\'app desktop.'), 'warning');
  }
  /* Elimina un materiale che sta SUL DISCO (2/8). Prima non c'era: il cestino
     esisteva solo sulle righe d'archivio e toglieva la voce da localStorage,
     lasciando il file nella cartella — «elimino e resta lì». Il file va nel
     Cestino di sistema, non cancellato: un materiale di classe si recupera. */
  function deleteDiskFile(id) {
    var d = _diskCache[id];
    if (!d) return;
    var api = window.electronAPI;
    if (!api || !api.deleteVaultFile) { toast(_t('fx_desktop', 'Disponibile solo nell\'app desktop.'), 'warning'); return; }
    var nome = d.relPath.split('/').pop();
    confirmDeleteText(nome, function () {
      api.deleteVaultFile({ vaultPath: d.vaultPath, relPath: d.relPath }).then(function (res) {
        if (res && res.ok) {
          delete _diskCache[id];
          try { if (window.MappAIVaults) window.MappAIVaults.segnala('file-eliminato', { vaultPath: d.vaultPath, relPath: d.relPath }); } catch (e) { }
          toast(_t('lt_file_trashed', 'Spostato nel Cestino.'), 'success');
          refresh();
        } else {
          toast(_t('lt_file_del_ko', 'Non è stato possibile eliminare il file') +
            (res && res.error ? ': ' + res.error : ''), 'error');
        }
      });
    });
  }

  // ── Layout condiviso: ogni sezione è una <table table-fixed> con <colgroup>
  // a larghezze fisse → intestazioni e righe condividono le STESSE colonne
  // (vera semantica tabellare: header sopra la loro colonna, nessuno slittamento
  // se cambia il numero di bottoni report). 19/7. ──────────────────────────
  var TD = 'px-2 py-2 align-middle';
  var TH = 'px-2 py-2 text-[9px] font-bold uppercase tracking-wider text-slate-400 whitespace-nowrap';
  function th(label, align) { return '<th class="' + TH + ' ' + (align || 'text-left') + '">' + esc(label) + '</th>'; }
  function td(inner, extra) { return '<td class="' + TD + (extra ? ' ' + extra : '') + '">' + (inner == null ? '' : inner) + '</td>'; }
  function fmtDate(ts) {
    if (!ts) return '';
    try {
      var d = new Date(ts);
      var p = function (n) { return String(n).padStart(2, '0'); };
      return p(d.getDate()) + '/' + p(d.getMonth() + 1) + '/' + d.getFullYear();
    } catch (e) { return ''; }
  }
  // Contenuto cella TIPO: icona + etichetta breve maiuscola (troncata dalla td).
  function tipoCell(icon, label, title) {
    return '<span class="flex items-center gap-1 text-indigo-400 min-w-0" title="' + esc(title || label) + '">' +
      '<i data-lucide="' + icon + '" class="w-3.5 h-3.5 shrink-0"></i>' +
      '<span class="text-[9px] font-bold uppercase tracking-tight truncate">' + esc(label) + '</span></span>';
  }
  // Badge di assegnazione mancante (29/7, solo ELABORA): cliccabile, apre il
  // modale «Assegna classe e disciplina». `assign` = codice JS del click; senza,
  // la cella resta il trattino inerte di prima (INSEGNA invariata).
  function missingBadge(label, tone, assign, tip) {
    var c = tone === 'red'
      ? 'text-red-700 bg-red-50 ring-1 ring-inset ring-red-200 hover:bg-red-100'
      : 'text-slate-500 bg-slate-100 ring-1 ring-inset ring-slate-200 hover:bg-slate-200';
    return '<button type="button" onclick="event.stopPropagation();' + assign + '" title="' + esc(tip) + '"' +
      ' class="inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wide rounded-full px-1.5 py-0.5 transition ' + c + '">' +
      '<i data-lucide="' + (tone === 'red' ? 'alert-circle' : 'circle-dashed') + '" class="w-2.5 h-2.5 shrink-0"></i>' + esc(label) + '</button>';
  }
  // Contenuto cella CLASSE: chip singolo/lista o trattino.
  function classCell(names, assign) {
    var arr = (names == null) ? [] : (Array.isArray(names) ? names : [names]);
    arr = arr.filter(function (x) { return x != null && x !== ''; });
    if (!arr.length) {
      return assign
        ? missingBadge(_t('lt_badge_generic', 'Generico'), 'grey', assign, _t('lt_badge_generic_tip', 'Nessuna classe assegnata. Clicca per assegnarla.'))
        : '<span class="text-slate-300">—</span>';
    }
    return '<span class="flex flex-wrap gap-1 min-w-0">' + arr.slice(0, 2).map(function (c) {
      return '<span class="inline-flex items-center gap-1 text-[9px] font-semibold text-indigo-600 bg-indigo-50 rounded-full px-1.5 py-0.5 max-w-full"><i data-lucide="graduation-cap" class="w-2.5 h-2.5 shrink-0"></i><span class="truncate">' + esc(c) + '</span></span>';
    }).join('') + (arr.length > 2 ? '<span class="text-[9px] text-slate-400">+' + (arr.length - 2) + '</span>' : '') + '</span>';
  }
  // Contenuto cella DISCIPLINA (29/7): chip ambra, gemello di quello della classe
  // ma con colore proprio — a colpo d'occhio si distingue "1A" da "Storia".
  function discCell(name, assign) {
    var n = (name == null) ? '' : String(name).trim();
    if (!n) {
      return assign
        ? missingBadge(_t('lt_badge_nodisc', 'Materia?'), 'red', assign, _t('lt_badge_nodisc_tip', 'Nessuna disciplina assegnata. Clicca per assegnarla.'))
        : '<span class="text-slate-300">—</span>';
    }
    return '<span class="inline-flex items-center gap-1 text-[9px] font-semibold text-amber-700 bg-amber-50 rounded-full px-1.5 py-0.5 max-w-full" title="' + esc(n) + '">' +
      '<i data-lucide="book-open" class="w-2.5 h-2.5 shrink-0"></i><span class="truncate">' + esc(n) + '</span></span>';
  }
  // Disciplina di una mappa: dal progetto localStorage (id, poi nome). '' se ignota.
  // Usata dalle righe che non portano la disciplina con sé (materiali d'archivio,
  // file condivisi, sessioni) ma sanno da quale mappa vengono.
  function discOfMap(mapName, projectId) {
    try {
      var arr = projectsRead();
      var p = projectId ? arr.find(function (x) { return x.id === projectId; }) : null;
      if (!p && mapName) p = arr.find(function (x) { return x.name === mapName; });
      if (!p) return '';
      return p.disc || prettyClass(p.discDir || '') || '';
    } catch (e) { return ''; }
  }
  // Disciplina di una riga-vault su disco: la CARTELLA è la fonte di verità
  // (come per la classe), col nome del progetto come ripiego.
  function vaultDisc(rec) {
    if (rec.v && rec.v.discDir) return prettyClass(rec.v.discDir);
    return (rec.p && rec.p.disc) || '';
  }
  // Contenuto cella DATA.
  function dateCell(ts) { return '<span class="text-[10px] text-slate-400 tabular-nums whitespace-nowrap">' + esc(fmtDate(ts)) + '</span>'; }
  // Bottone icona azione (PLAY/QR/FOLDER/BIN…). disabled → grigio inerte.
  function actIcon(icon, tip, onclick, color, disabled) {
    var cls = disabled ? 'text-slate-200 cursor-not-allowed'
      : (color || 'text-slate-400 hover:text-indigo-500');
    var handler = (disabled || !onclick) ? '' : ' onclick="event.stopPropagation();' + onclick + '"';
    return '<button type="button"' + handler + (disabled ? ' disabled' : '') +
      ' title="' + esc(tip) + '" class="inline-flex items-center rounded-lg p-1.5 transition ' + cls + '">' +
      '<i data-lucide="' + icon + '" class="w-4 h-4"></i></button>';
  }
  // Cella TITOLO (bollino opzionale + sottotitolo).
  function titleTd(o) {
    // titleHtmlExtra: badge accanto al titolo (es. «3 da rivedere» sui fogli
    // flashcard con carte oltre la soglia di caratteri). HTML già costruito.
    return td('<div class="flex items-center gap-1.5 min-w-0" title="' + esc(o.titleTip || o.title) + '">' + (o.dot || '') +
      '<div class="min-w-0"><div class="text-[12px] font-bold text-slate-700 truncate">' + esc(o.title) +
      (o.titleHtmlExtra || '') + '</div>' +
      (o.sub ? '<div class="text-[10px] text-slate-400 truncate">' + o.sub + '</div>' : '') + '</div></div>');
  }
  // ── Tabella sezioni "file" (Progetti · Materiali · Quiz cartacei) ──────────
  // 29/7: colonna DISCIPLINA dopo CLASSE. Il numero di <col> DEVE restare uguale
  // al numero di <th> e di <td> per riga (regola §10.15) — se ne aggiungi una,
  // toccale tutte e tre.
  var FILE_COLS = '<colgroup><col style="width:88px"><col><col style="width:118px"><col style="width:118px"><col style="width:100px"><col style="width:150px"></colgroup>';
  function fileHead() {
    return '<thead class="sticky top-0 bg-white z-10"><tr class="border-b border-slate-200">' +
      th(_t('rp_type', 'Tipo')) + th(_t('rp_title', 'Titolo')) + th(_t('rp_class', 'Classe')) +
      th(_t('rp_disc', 'Disciplina')) +
      th(_t('lt_col_date', 'Data')) + '<th class="' + TH + '"></th></tr></thead>';
  }
  function fileRow(o) {
    var click = o.onClick ? ' onclick="' + o.onClick + '"' : '';
    var cur = o.onClick ? ' cursor-pointer' : '';
    var sel = o.selected ? ' bg-indigo-100 ring-1 ring-inset ring-indigo-300' : '';
    return '<tr class="border-b border-slate-100 hover:bg-indigo-50 transition' + cur + sel + '"' + click + '>' +
      td(o.tipo, 'overflow-hidden') + titleTd(o) + td(o.cls) + td(discCell(o.disc, o.assign)) + td(o.date) +
      td('<div class="flex justify-end items-center gap-0.5">' + (o.block || '') + '</div>', 'text-right') + '</tr>';
  }
  function fileTable(rowsHtml, scroll) {
    var t = '<table class="w-full table-fixed border-collapse">' + FILE_COLS + fileHead() + '<tbody>' + rowsHtml + '</tbody></table>';
    /* `.mm-tab-wrap` è il contenitore-tabella del motore — bordo, raggio e
       scorrimento sono gli stessi degli elenchi delle console. Prima questa
       tabella si disegnava il suo contenitore, quindi la stessa cosa aveva due
       vesti a seconda di dove la si guardava.
       Il tetto di altezza resta dichiarato qui: nel motore lo dà il layout della
       console, che sulla landing non c'è. */
    return scroll
      ? '<div class="mm-tab-wrap" style="max-height:340px;scrollbar-gutter:stable">' + t + '</div>'
      : t;
  }
  // ── Tabella "Attività di studio e report": Tipo · Titolo · Classe ·
  // Partecipanti · Data · Report(bottoni) · Finder ──────────────────────────
  var ACT_COLS = '<colgroup><col style="width:88px"><col><col style="width:80px"><col style="width:112px"><col style="width:104px"><col style="width:64px"><col style="width:196px"><col style="width:44px"></colgroup>';
  function actHead() {
    return '<thead class="sticky top-0 bg-white z-10"><tr class="border-b border-slate-200">' +
      th(_t('rp_type', 'Tipo')) + th(_t('rp_title', 'Titolo')) + th(_t('rp_class', 'Classe')) +
      th(_t('rp_disc', 'Disciplina')) +
      th(_t('lt_col_date', 'Data')) + th(_t('lt_col_part_short', 'Part.')) + th(_t('lt_col_report', 'Report')) +
      '<th class="' + TH + '"></th></tr></thead>';
  }
  function actTableRow(o) {
    return '<tr class="border-b border-slate-100 hover:bg-indigo-50 transition">' +
      td(o.tipo, 'overflow-hidden') + titleTd(o) + td(o.cls) + td(discCell(o.disc)) + td(o.date) + td(o.partic) +
      td('<div class="flex flex-wrap items-center gap-1">' + (o.reports || '') + '</div>') +
      td(o.folder, 'text-right') + '</tr>';
  }
  function actTable(rowsHtml) {
    return '<table class="w-full table-fixed border-collapse">' + ACT_COLS + actHead() + '<tbody>' + rowsHtml + '</tbody></table>';
  }
  // Conferma "forte" per l'eliminazione: l'utente digita il NOME esatto della voce.
  function confirmDeleteText(name, onOk) {
    var title = _t('lt_del_type_title', 'Conferma eliminazione');
    var desc = _t('lt_del_type_desc', 'Per eliminare scrivi qui sotto il nome esatto:') + ' “' + name + '”';
    var giusto = function (val) {
      return !!val && String(val).trim().toLowerCase() === String(name).trim().toLowerCase();
    };
    var sbagliato = function () {
      toast(_t('lt_del_type_mismatch', 'Il testo non corrisponde: eliminazione annullata.'), 'warning');
    };
    if (window.MappAIModal) {
      window.MappAIModal.open({
        titolo: title, icona: 'trash-2', taglia: 's',
        sezioni: [{ testo: desc, campi: [{ id: 'nome', etichetta: name }] }],
        azioni: [
          { id: 'no', etichetta: _t('lt_cancel', 'Annulla') },
          { id: 'si', etichetta: _t('lt_sm_delete', 'Elimina'), ruolo: 'distruttivo', icona: 'trash-2' }
        ]
      }).then(function (r) {
        if (!r || r.azione !== 'si') return;
        if (giusto(r.valori.nome)) onOk(); else sbagliato();
      });
      return;
    }
    if (window.showPrompt) {
      window.showPrompt(title, '', function (val) {
        if (giusto(val)) onOk(); else sbagliato();
      }, desc);
    } else if (confirm(desc)) { onOk(); }
  }

  // ── Modalità Insegna: rendering ────────────────────────────────────────────
  function sectionShell(id, icon, title, bodyId, count) {
    var badge = (count != null && count > 0)
      ? '<span style="font-size:11px;font-weight:700;color:#4f46e5;background:#eef2ff;border-radius:999px;padding:1px 8px">' + count + '</span>' : '';
    return '<div class="teach-section-card">' +
      '<button type="button" onclick="window.MappAITeach.toggleSection(\'' + id + '\')" ' +
      'class="w-full flex items-center justify-between px-5 py-3 bg-slate-50 hover:bg-indigo-50 transition-colors">' +
      '<span class="flex items-center gap-2 text-sm font-bold text-slate-600">' +
      '<i data-lucide="' + icon + '" class="w-4 h-4 text-indigo-400"></i>' + esc(title) + ' ' + badge + '</span>' +
      '<i id="' + id + '-chevron" data-lucide="chevron-down" class="w-4 h-4 text-slate-400 transition-transform" style="transform:rotate(180deg)"></i>' +
      '</button>' +
      '<div id="' + bodyId + '" class="px-3 py-3">' + '</div>' +
      '</div>';
  }

  function toggleSection(id) {
    var body = document.getElementById(id + '-body');
    var chev = document.getElementById(id + '-chevron');
    if (!body) return;
    var hidden = body.classList.toggle('hidden');
    if (chev) chev.style.transform = hidden ? 'rotate(0deg)' : 'rotate(180deg)';
  }

  function quickStartBar() {
    var qs = function (kind, icon, label) {
      return '<button type="button" class="teach-qs-btn" onclick="window.MappAITeach.quickStart(\'' + kind + '\')">' +
        '<i data-lucide="' + icon + '" class="w-7 h-7"></i><span>' + esc(label) + '</span></button>';
    };
    return '<div class="max-w-[806px] mx-auto mb-6"><div class="flex flex-wrap gap-3">' +
      qs('collab', 'presentation', _t('ui_qs_collab', 'Lavagna interattiva')) +
      qs('live', 'radio', _t('ui_qs_live', 'Studio attivo live')) +
      qs('materials', 'folder-down', _t('ui_qs_materials', 'Materiali di studio')) +
      '</div></div>';
  }

  function refresh() {
    var host = document.getElementById('teach-content');
    if (!host) return;
    var sets = setsRead();
    var docs = (window.MappAIStudyDocs && window.MappAIStudyDocs.list()) ? window.MappAIStudyDocs.list() : [];
    host.innerHTML =
      quickStartBar() + filesBar() +
      sectionShell('teach-projects', 'folder-open', _t('ui_teach_projects', 'Progetti esistenti'), 'teach-projects-body') +
      sectionShell('teach-materials', 'file-text', _t('ui_teach_materials', 'Materiali di studio'), 'teach-materials-body', docs.filter(function (d) { return PAPER_KINDS.indexOf(d.kind) < 0; }).length) +
      sectionShell('teach-quizpaper', 'printer', _t('ui_teach_quizpaper', 'Quiz cartacei'), 'teach-quizpaper-body', docs.filter(function (d) { return PAPER_KINDS.indexOf(d.kind) >= 0; }).length) +
      sectionShell('teach-lavagna', 'presentation', _t('ui_teach_lavagna', 'Lavagna interattiva'), 'teach-lavagna-body') +
      sectionShell('teach-activities', 'clipboard-list', _t('ui_teach_activities', 'Attività di studio e report'), 'teach-activities-body');
    renderProjects();
    renderMaterials(docs);
    renderQuizPaper(docs);
    renderActivities(sets);
    if (window.safeCreateIcons) window.safeCreateIcons();
  }

  // Barra "Cartella documenti" (010): entra nelle impostazioni di organizzazione file.
  function filesBar() {
    if (!window.MappAIFiles) return '';
    return '<div class="max-w-[806px] mx-auto mb-4 flex justify-end">' +
      '<button type="button" onclick="window.MappAIFiles.openSettings()" class="inline-flex items-center gap-1.5 text-[11.5px] font-semibold text-slate-500 hover:text-indigo-600 border border-slate-200 hover:border-indigo-300 rounded-lg px-3 py-1.5 bg-white">' +
      '<i data-lucide="folder-cog" class="w-3.5 h-3.5"></i>' + esc(_t('ui_files_folder', 'Cartella documenti')) + '</button></div>';
  }

  // ── Progetti esistenti (mappe salvate) — layout unificato ──────────────────
  var TYPE_META = {
    kg: { icon: 'network', label: 'KG', full: 'Knowledge Graph' },
    mindmap: { icon: 'git-merge', label: 'MM', full: 'Mappa Mentale' }
  };
  // FONTE DI VERITÀ = DISCO (22/7). L'elenco legge le cartelle vault reali via
  // get-all-vaults (incluse le annidate nei contenitori di classe), unite ai
  // metadati localStorage (id/classe/tuning) quando un progetto corrisponde. I
  // file .json sciolti in Mappe (esportazioni singole) restano fuori. Fallback
  // al solo localStorage se l'API Electron non è disponibile (browser statico).
  var _projVaults = [];   // cache dell'ultimo render disco: idx → { v, p }
  function FCore() { try { return window.MappAIFilesCore || null; } catch (e) { return null; } }
  function prettyClass(dir) { return String(dir || '').replace(/_/g, ' '); }
  // Match progetto localStorage ↔ vault su disco per folderName + classDir.
  // Legacy (progetto senza classDir) → match sul solo folderName.
  function matchProjectToVault(projects, v) {
    // Match stretto: stessa cartella, stessa classe, stessa disciplina (29/7) —
    // due mappe omonime in discipline diverse della stessa classe sono distinte.
    var byAll = projects.find(function (p) {
      return p.vault === v.folderName && (p.classDir || null) === (v.classDir || null) && (p.discDir || null) === (v.discDir || null);
    });
    if (byAll) return byAll;
    // Progetti scritti prima del livello disciplina: hanno classDir ma non discDir.
    var byBoth = projects.find(function (p) {
      return p.vault === v.folderName && (p.classDir || null) === (v.classDir || null) && !p.discDir;
    });
    if (byBoth) return byBoth;
    if (v.classDir) return null;
    return projects.find(function (p) { return p.vault === v.folderName && !p.classDir; }) || null;
  }
  // Progetti localStorage privi di cartella su disco (per la barra "Riordina").
  function orphanProjects() {
    return projectsRead().filter(function (p) {
      var hasSnap = false; try { hasSnap = !!localStorage.getItem(p.id); } catch (e) { }
      return !p.vault && hasSnap;
    });
  }

  // Merge disco↔localStorage + filtro "solo classe attiva". Ritorna [{v,p}].
  // Condiviso da Insegna e ELABORA (stessa fonte di verità = disco).
  function filterVaults(vaults) {
    var projects = projectsRead();
    var fc = FCore();
    var allow = allowedProjectIds();
    var allowSet = Array.isArray(allow) ? (function () { var s = {}; allow.forEach(function (i) { s[i] = 1; }); return s; })() : null;
    var acFolder = null;
    if (readFilter() === 'active') { var ac = activeClass(); if (ac && ac.name && fc) acFolder = fc.mapClassFolder(ac.sede, ac.name); }
    var out = [];
    (vaults || []).forEach(function (v) {
      var p = matchProjectToVault(projects, v);
      if (allowSet) {
        var ok = (p && allowSet[p.id]) || (acFolder && v.classDir === acFolder);
        if (!ok) return;
      }
      out.push({ v: v, p: p });
    });
    return out;
  }
  // Chip classe di una riga disco = SOLO il contenitore di classe reale su disco
  // (fonte di verità). Niente p.cls né registro sessioni: erano fonti stale che
  // mostravano classi inesistenti (es. «IV media») incoerenti con la cartella.
  // Vault flat (senza classDir) → nessun chip (mappa non assegnata a una classe).
  function vaultChips(rec) {
    return rec.v.classDir ? [prettyClass(rec.v.classDir)] : [];
  }

  function renderProjects() {
    var body = document.getElementById('teach-projects-body');
    if (!body) return;
    if (!window.electronAPI || !window.electronAPI.getAllVaults) { renderProjectsLocal(body); return; }
    window.electronAPI.getAllVaults().then(function (vaults) {
      _segnaGeneri(vaults);
      renderProjectsDisk(body, vaults || []);
    }).catch(function () { renderProjectsLocal(body); });
  }

  function backfillBar() {
    var orphans = orphanProjects();
    if (!orphans.length || !window.electronAPI || !window.electronAPI.saveVault) return '';
    return '<div class="flex items-center justify-between gap-2 px-3 py-2 mb-1 bg-amber-50 border border-amber-200 rounded-lg">' +
      '<span class="text-[11px] text-amber-700 font-semibold">' +
      esc(_t('lt_backfill_hint', '{n} mappe non hanno ancora una cartella su disco.').replace('{n}', orphans.length)) + '</span>' +
      '<button type="button" onclick="window.MappAITeach.backfillVaults()" class="inline-flex items-center gap-1.5 text-[11px] font-bold text-white bg-amber-600 hover:bg-amber-700 rounded-lg px-2.5 py-1 shrink-0">' +
      '<i data-lucide="folder-plus" class="w-3.5 h-3.5"></i>' + esc(_t('lt_backfill_btn', 'Riordina cartelle')) + '</button></div>';
  }

  function renderProjectsDisk(body, vaults) {
    var core = CORE();
    var reg = regRead();
    var norm = (core && core.normGrade) ? core.normGrade : function (x) { return String(x == null ? '' : x).toLowerCase().trim(); };

    _projVaults = filterVaults(vaults);

    if (!_projVaults.length) {
      body.innerHTML = backfillBar() + '<p class="text-xs text-slate-400 italic px-2 py-2">' +
        esc(readFilter() === 'active'
          ? _t('lt_no_projects_class', 'Nessun progetto per questa classe. Mostra tutto per vederli tutti.')
          : _t('lt_no_projects_disk', 'Nessuna mappa nella cartella Mappe. Genera una mappa per crearne una.')) + '</p>';
      if (window.safeCreateIcons) window.safeCreateIcons();
      return;
    }

    var rows = _projVaults.map(function (rec, i) {
      var v = rec.v, p = rec.p;
      var meta = TYPE_META[v.extractionMode === 'kg' ? 'kg' : 'mindmap'];
      var chips = vaultChips(rec);
      var tuned = !!(p && p.tuned);
      var dot = '<span class="inline-block w-2 h-2 rounded-full shrink-0 ' + (tuned ? 'bg-emerald-500' : 'bg-slate-300') + '" title="' + esc(tuned ? _t('rp_tuned_yes', 'Generazione tarata') : _t('rp_tuned_no', 'Generazione standard')) + '"></span>';
      var selected = !!(p && _selectedProject && _selectedProject.id === p.id);
      // Riga con progetto collegato → SELEZIONA (filtra le sezioni). Vault orfano
      // (nessun progetto localStorage) → click APRE direttamente.
      var onClick = (p && rowSelectEnabled())
        ? "window.MappAITeach.selectProject('" + p.id + "')"
        : "window.MappAITeach.projOpen(" + i + ")";
      return fileRow({
        tipo: tipoCell(meta.icon, meta.label, meta.full),
        title: v.rootNodeLabel || v.folderName, titleTip: (v.rootNodeLabel || v.folderName), dot: dot,
        cls: classCell(chips), disc: vaultDisc(rec), date: dateCell(v.lastUpdated ? new Date(v.lastUpdated).getTime() : 0),
        block: projBlockDisk(i),
        onClick: onClick,
        selected: selected
      });
    }).join('');
    body.innerHTML = backfillBar() + fileTable(rows, true);
    if (window.safeCreateIcons) window.safeCreateIcons();
  }

  function projBlockDisk(i) {
    return actIcon('play-circle', _t('rp_resume', 'Riprendi'), "window.MappAITeach.projOpen(" + i + ")", 'text-indigo-500 hover:text-indigo-700', false) +
      actIcon('qr-code', _t('lt_share_vault_qr', 'Condividi la cartella vault (QR)'), "window.MappAITeach.projQr(" + i + ")", 'text-green-600 hover:text-green-700', false) +
      actIcon('folder', _t('lt_open_finder', 'Apri nel Finder'), "window.MappAITeach.projFinder(" + i + ")", null, false) +
      actIcon('trash-2', _t('rp_delete', 'Elimina'), "window.MappAITeach.projDelete(" + i + ")", 'text-slate-300 hover:text-red-500', false);
  }
  function _projRec(i) { return _projVaults[i] || null; }
  function projOpen(i) {
    var r = _projRec(i); if (!r) return;
    if (r.p && window.loadSavedProject) return window.loadSavedProject(r.p.id);
    if (window.directLoadVault) window.directLoadVault(r.v.fullPath);
  }
  function projFinder(i) {
    var r = _projRec(i); if (!r) return;
    if (window.electronAPI && window.electronAPI.pipelineOpenFolder) window.electronAPI.pipelineOpenFolder({ folderPath: r.v.fullPath });
    else toast(_t('fx_desktop', 'Disponibile solo nell\'app desktop.'), 'warning');
  }
  function projQr(i) {
    var r = _projRec(i); if (!r) return;
    var name = r.p ? r.p.name : (r.v.rootNodeLabel || r.v.folderName);
    if (window.MappAILive && window.MappAILive.shareVaultZipQr) window.MappAILive.shareVaultZipQr(r.v.folderName, name);
    else toast(_t('lv_electron', 'Richiede l\'app desktop.'), 'warning');
  }
  function projDelete(i) {
    var r = _projRec(i); if (!r) return;
    var title = r.v.rootNodeLabel || r.v.folderName;
    confirmDeleteText(title, function () {
      var purgeLocal = function () {
        if (!r.p) return;
        try {
          var arr = projectsRead().filter(function (x) { return x.id !== r.p.id; });
          localStorage.setItem('tutor_ai_projects', JSON.stringify(arr));
          localStorage.removeItem(r.p.id);
        } catch (e) { }
      };
      if (window.electronAPI && window.electronAPI.deleteVault) {
        window.electronAPI.deleteVault({ folderPath: r.v.fullPath }).then(function (res) {
          if (res && res.success) { toast(_t('lt_vault_deleted', 'Cartella spostata nel Cestino.'), 'success'); purgeLocal(); refresh(); }
          else toast((res && res.error) || _t('lt_vault_del_fail', 'Impossibile eliminare la cartella.'), 'error');
        }).catch(function () { toast(_t('lt_vault_del_fail', 'Impossibile eliminare la cartella.'), 'error'); });
      } else { purgeLocal(); refresh(); }
    });
  }

  // Backfill (decisione 2): crea in blocco le cartelle mancanti per i progetti
  // localStorage senza vault, dagli snapshot appState su disco — SENZA toccare la
  // mappa aperta. Nesting per classe (clsId → classe) e collisione « · 0N ».
  function _mapDataFromSnapshot(snap) {
    return {
      extractionMode: snap.extractionMode,
      rootNodeLabel: snap.rootNodeLabel,
      nodes: (snap.db && snap.db.nodes) || [],
      links: (snap.db && snap.db.links) || [],
      studySets: (snap.db && snap.db.studySets) || [],
      userProfile: snap.userProfile,
      aiProvider: snap.aiProvider,
      generationUsage: snap.generationUsage,
      customColors: (snap.db && snap.db.customColors) || {}
    };
  }
  async function backfillVaults() {
    var fc = FCore();
    if (!window.electronAPI || !window.electronAPI.saveVault || !window.electronAPI.filesRootGet || !fc) {
      toast(_t('fx_desktop', 'Disponibile solo nell\'app desktop.'), 'warning'); return;
    }
    var todo = orphanProjects();
    if (!todo.length) { toast(_t('lt_backfill_none', 'Tutte le mappe hanno già una cartella.'), 'info'); return; }
    if (window.showLoadingOverlay) window.showLoadingOverlay(true, _t('lt_backfill_run', 'Riordino le cartelle…'));
    var created = 0;
    try {
      var info = await window.electronAPI.filesRootGet();
      var base = info && info.mapsBaseDir;
      var all = [];
      try { all = (await window.electronAPI.getAllVaults()) || []; } catch (e) { all = []; }
      var projects = projectsRead();
      for (var k = 0; k < todo.length; k++) {
        var p = todo[k];
        var snap = null; try { snap = JSON.parse(localStorage.getItem(p.id) || 'null'); } catch (e) { snap = null; }
        if (!snap || !snap.db || !snap.db.nodes || !snap.db.nodes.length) continue;
        var cls = (p.clsId && window.MappAIClasses && window.MappAIClasses.get) ? window.MappAIClasses.get(p.clsId) : null;
        var classDir = (cls && cls.name) ? fc.mapClassFolder(cls.sede, cls.name) : null;
        // Disciplina congelata sul progetto (29/7); se manca, e la classe ne insegna
        // una sola, quella. Con 2+ discipline e nessuna registrata NON si indovina:
        // il vault resta figlio diretto della classe.
        var discName = p.disc || '';
        if (!discName && cls && window.MappAIClasses && window.MappAIClasses.disciplinesOf) {
          var dl = window.MappAIClasses.disciplinesOf(cls);
          if (dl.length === 1) discName = dl[0];
        }
        var discDir = classDir ? fc.disciplineFolder(discName) : '';
        var vaultName = fc.vaultFolderName(snap.rootNodeLabel || p.name || 'Mappa');
        var siblings = all.filter(function (v) {
          return (v.classDir || null) === (classDir || null) && (v.discDir || '') === (discDir || '');
        }).map(function (v) { return v.folderName; });
        var finalName = vaultName;
        if (siblings.indexOf(vaultName) >= 0 && fc.sessionSeq) {
          var seq = fc.sessionSeq(siblings, vaultName, ' · ');
          var n = Math.max(2, (seq.maxSeq || 0) + 1);
          finalName = vaultName + ' · ' + String(n).padStart(2, '0');
        }
        var folderPath = [base].concat(fc.mapVaultParents(classDir, discDir), [finalName]).join('/');
        var res = null;
        try { res = await window.electronAPI.saveVault({ folderPath: folderPath, mapData: _mapDataFromSnapshot(snap) }); } catch (e) { res = null; }
        if (res && res.success) {
          var proj = projects.find(function (x) { return x.id === p.id; });
          if (proj) { proj.vault = finalName; proj.classDir = classDir; proj.discDir = discDir || null; if (discName) proj.disc = discName; }
          all.push({ folderName: finalName, classDir: classDir, discDir: discDir || null });
          created++;
        }
      }
      localStorage.setItem('tutor_ai_projects', JSON.stringify(projects));
    } catch (e) { console.warn('[autovault] backfill fallito:', e && e.message); }
    if (window.showLoadingOverlay) window.showLoadingOverlay(false);
    toast(_t('lt_backfill_done', '{n} cartelle create.').replace('{n}', created), 'success');
    refresh();
  }

  // Fallback senza Electron (browser statico): elenco dal solo localStorage.
  function renderProjectsLocal(body) {
    var projects = projectsRead();
    var allow = allowedProjectIds();
    if (Array.isArray(allow)) { var set = {}; allow.forEach(function (i) { set[i] = 1; }); projects = projects.filter(function (p) { return set[p.id]; }); }
    if (!projects.length) {
      body.innerHTML = '<p class="text-xs text-slate-400 italic px-2 py-2">' +
        esc(_t('lt_no_projects_class', 'Nessun progetto per questa classe. Mostra tutto per vederli tutti.')) + '</p>';
      return;
    }
    var core = CORE();
    var reg = regRead();
    var norm = (core && core.normGrade) ? core.normGrade : function (x) { return String(x == null ? '' : x).toLowerCase().trim(); };
    body.innerHTML = fileTable(projects.map(function (p) {
      var meta = TYPE_META[p.type === 'kg' ? 'kg' : 'mindmap'];
      var chips = [], seen = {};
      var push = function (c) { if (c == null || c === '') return; var k = norm(c) || String(c); if (seen[k]) return; seen[k] = 1; chips.push(c); };
      push(p.cls);
      if (core && core.classesForMap) core.classesForMap(reg, { projectId: p.id, map: p.name }).forEach(push);
      var dot = '<span class="inline-block w-2 h-2 rounded-full shrink-0 ' + (p.tuned ? 'bg-emerald-500' : 'bg-slate-300') + '" title="' + esc(p.tuned ? _t('rp_tuned_yes', 'Generazione tarata') : _t('rp_tuned_no', 'Generazione standard')) + '"></span>';
      var onClick = rowSelectEnabled()
        ? "window.MappAITeach.selectProject('" + p.id + "')"
        : "window.loadSavedProject('" + p.id + "')";
      return fileRow({
        tipo: tipoCell(meta.icon, meta.label, meta.full),
        title: p.name, titleTip: p.name, dot: dot,
        cls: classCell(chips), disc: p.disc || prettyClass(p.discDir || ''), date: dateCell(p.date),
        block: projBlock(p),
        onClick: onClick,
        selected: !!(_selectedProject && _selectedProject.id === p.id)
      });
    }).join(''), true);
  }
  function projBlock(p) {
    var hasVault = !!p.vault;
    return actIcon('play-circle', _t('rp_resume', 'Riprendi'), "window.loadSavedProject('" + p.id + "')", 'text-indigo-500 hover:text-indigo-700', false) +
      actIcon('qr-code', hasVault ? _t('lt_share_vault_qr', 'Condividi la cartella vault (QR)') : _t('lt_no_vault', 'Nessuna cartella vault su disco'), "window.MappAITeach.shareProjectZip('" + p.id + "')", 'text-green-600 hover:text-green-700', !hasVault) +
      actIcon('folder', hasVault ? _t('lt_open_finder', 'Apri nel Finder') : _t('lt_no_vault', 'Nessuna cartella vault su disco'), "window.MappAITeach.openProjectFolder('" + p.id + "')", null, !hasVault) +
      actIcon('trash-2', _t('rp_delete', 'Elimina'), "window.MappAITeach.deleteProject('" + p.id + "')", 'text-slate-300 hover:text-red-500', false);
  }
  function deleteProjectRow(id) {
    var p = projectsRead().find(function (x) { return x.id === id; });
    if (!p) return;
    confirmDeleteText(p.name, function () {
      var projects = projectsRead().filter(function (x) { return x.id !== id; });
      try { localStorage.setItem('tutor_ai_projects', JSON.stringify(projects)); localStorage.removeItem(id); } catch (e) { }
      refresh();
    });
  }
  function openProjectFolder(id) {
    var p = projectsRead().find(function (x) { return x.id === id; });
    if (!p || !p.vault) { toast(_t('lt_no_vault', 'Nessuna cartella vault su disco'), 'warning'); return; }
    if (window.electronAPI && window.electronAPI.openVaultFolder) window.electronAPI.openVaultFolder({ vaultName: p.vault });
    else toast(_t('fx_desktop', 'Disponibile solo nell\'app desktop.'), 'warning');
  }
  function shareProjectZip(id) {
    var p = projectsRead().find(function (x) { return x.id === id; });
    if (!p || !p.vault) { toast(_t('lt_no_vault', 'Nessuna cartella vault su disco'), 'warning'); return; }
    if (window.MappAILive && window.MappAILive.shareVaultZipQr) window.MappAILive.shareVaultZipQr(p.vault, p.name);
    else toast(_t('lv_electron', 'Richiede l\'app desktop.'), 'warning');
  }
  function openMapsFolder() {
    if (window.electronAPI && window.electronAPI.openMapsFolder) window.electronAPI.openMapsFolder();
    else toast(_t('fx_desktop', 'Disponibile solo nell\'app desktop.'), 'warning');
  }

  // ── File condivisi (libreria "Materiali docente", IPC su disco) ────────────
  /* ⚠️ 13/8/26 — «FILE CONDIVISI» PENSIONATA (decisione di Giacomo).
     Qui vivevano la libreria dei file condivisi e la sua vista: `renderSharedMat`
     scriveva in `#teach-sharedmat-body`, un contenitore che il markup non ha mai
     avuto dopo il riordino della landing. Quindi si poteva CONDIVIDERE un file
     ma non vederlo né toglierlo: restava condiviso, e l'unico modo di
     accorgersene era aprire la cartella nel Finder.
     Non è stata ricostruita altrove perché la stessa cosa si fa già in
     MappAI Live › Materiali di studio, con «Aggiungi file…»: là il file entra
     nel server della sessione e gli allievi lo scaricano senza login. Quello che
     sparisce è la LIBRERIA persistente (una copia del file più lo storico delle
     classi con cui era stato condiviso), che nessuna schermata mostrava.
     ⚠️ I file già copiati NON vengono toccati: restano in
     «MappAI - file/File condivisi/», raggiungibili dal Finder. */

  function filterItems(items) {
    if (readFilter() !== 'active') return items;
    var ac = activeClass();
    if (!ac || !ac.name) return items;
    var core = CORE();
    if (!core) return items;
    return core.filterByClass(items, ac, regRead(), projectsRead());
  }

  var KIND_META = {
    synthesis: { icon: 'sparkles', label: 'Sintesi' },
    dossier: { icon: 'files', label: 'Dossier' },
    nodesheet: { icon: 'scissors', label: 'Foglio nodi' },
    timeline: { icon: 'gantt-chart', label: 'Timeline' },
    quizpaper: { icon: 'list-checks', label: 'Quiz' },
    flashsheet: { icon: 'copy', label: 'Flashcard' },
    /* `causal` è un genere d'archivio ammesso da sempre (DOC_KINDS in
       mappai-study-export-core.js) ma qui non c'era: cadeva sul ripiego
       `dossier` e la riga diceva «Dossier» con l'icona sbagliata. Stessa
       parola e stessa icona del file su disco (`_diskKind`), altrimenti lo
       stesso materiale si chiama in due modi a seconda di dove è archiviato. */
    causal: { icon: 'git-branch', label: 'Catena dei perché' }
  };
  // I fogli cartacei hanno una sezione propria: si stampano (con o senza
  // soluzioni) e si condividono via QR, non si "aprono" come un dossier.
  var PAPER_KINDS = ['quizpaper', 'flashsheet'];

  // File su disco che appartengono alla sezione «Quiz cartacei» (e non ai Materiali).
  function _isPaperFile(name) { return /^(Quiz|Flashcard)-/i.test(String(name || '')); }

  // ── Quiz cartacei (fogli stampabili generati dall'editor documenti) ────────
  // Sorgente doppia, come i Materiali: archivio localStorage + file su disco del
  // vault della mappa selezionata (Quiz-*/Flashcard-* in Materiale Studio/).
  function renderQuizPaper(docs) {
    var body = document.getElementById('teach-quizpaper-body');
    if (!body) return;
    var archive = filterBySelection(filterItems((docs || [])
      .filter(function (d) { return PAPER_KINDS.indexOf(d.kind) >= 0; })
      .map(function (d) { return Object.assign({}, d); })));
    var p = _selectedProject ? projectsRead().find(function (x) { return x.id === _selectedProject.id; }) : null;
    if (p && p.vault) {
      _paintQuizPaper(body, archive);
      _diskMaterialsFor(p).then(function (disk) {
        _paintQuizPaper(body, archive.concat(disk.filter(function (f) { return _isPaperFile(f.title); })));
      });
    } else {
      _paintQuizPaper(body, archive);
    }
  }
  function _paintQuizPaper(body, list) {
    if (!list.length) {
      body.innerHTML = '<p class="text-xs text-slate-400 italic px-2 py-2">' +
        esc(_t('lt_no_quizpaper', 'Nessun quiz cartaceo. Genera un quiz e rivedilo in ELABORA → Documenti: il foglio comparirà qui, pronto da stampare o condividere.')) + '</p>';
      return;
    }
    body.innerHTML = fileTable(list.map(_quizPaperRowHtml).join(''), true);
    if (window.safeCreateIcons) window.safeCreateIcons();
  }
  function _quizPaperRowHtml(d) {
    if (d._disk) {
      var dk = _diskKind(d.title);
      return fileRow({
        tipo: tipoCell(dk.icon, dk.label, dk.label),
        title: d.title, titleTip: d.title, sub: d.mapName ? esc(d.mapName) : '',
        cls: classCell(d.cls), disc: d.disc || discOfMap(d.mapName, d.projectId), date: dateCell(d.date),
        block: actIcon('printer', _t('lt_qp_open_file', 'Apri il file (stampa dal visualizzatore)'), "window.MappAITeach.openDiskFile('" + esc(d.id) + "')", 'text-indigo-500 hover:text-indigo-700', false) +
          actIcon('folder', _t('lt_open_finder', 'Apri nel Finder'), "window.MappAITeach.openDiskFile('" + esc(d.id) + "')", null, false) +
          actIcon('trash-2', _t('lt_file_delete', 'Sposta il file nel Cestino'), "window.MappAITeach.deleteDiskFile('" + esc(d.id) + "')", 'text-slate-300 hover:text-red-500', false),
        onClick: "window.MappAITeach.openDiskFile('" + esc(d.id) + "')"
      });
    }
    var meta = KIND_META[d.kind] || KIND_META.quizpaper;
    var typeLbl = _t('lt_kind_' + d.kind, meta.label);
    var isPdf = d.kind === 'flashsheet';   // foglio flashcard = PDF: niente QR, niente varianti
    // Badge «da rivedere»: il foglio contiene carte con più caratteri di quanti
    // ne entrino nella carta stampata. Si sistemano in ELABORA → Documenti.
    var over = parseInt(d.overLimit, 10) || 0;
    var badge = over
      ? '<span class="ml-2 inline-flex items-center gap-1 rounded-full bg-orange-100 text-orange-800 ' +
        'text-[10px] font-bold px-2 py-0.5 align-middle" title="' +
        esc(_t('lt_over_tip', '{n} carte superano la soglia di caratteri: rivedile in ELABORA → Documenti').replace('{n}', over)) +
        '">' + over + ' ' + esc(_t('lt_over_badge', 'da rivedere')) + '</span>'
      : '';
    return fileRow({
      tipo: tipoCell(meta.icon, typeLbl, typeLbl),
      title: d.title, titleHtmlExtra: badge, titleTip: d.title, sub: d.mapName ? esc(d.mapName) : '',
      cls: classCell(d.cls), disc: d.disc || discOfMap(d.mapName, d.projectId), date: dateCell(d.date),
      block:
        actIcon('printer', _t('lt_qp_print', 'Stampa (con o senza soluzioni)'), "window.MappAITeach.printQuizPaper('" + esc(d.id) + "')", 'text-indigo-500 hover:text-indigo-700', false) +
        actIcon('qr-code', isPdf ? _t('lt_doc_no_qr_short', 'Non condivisibile via QR') : _t('lt_sm_share', 'Condividi via QR'), "window.MappAITeach.shareQuizPaper('" + esc(d.id) + "')", 'text-green-600 hover:text-green-700', isPdf) +
        actIcon('folder', _t('lt_open_docs_folder', 'Apri la cartella documenti'), "window.MappAITeach.openMapsFolder()", null, false) +
        actIcon('trash-2', _t('lt_sm_delete', 'Elimina'), "window.MappAITeach.deleteDoc('" + esc(d.id) + "')", 'text-slate-300 hover:text-red-500', false),
      onClick: "window.MappAITeach.printQuizPaper('" + esc(d.id) + "')"
    });
  }

  // Stampa di un quiz cartaceo: modale «con o senza soluzioni». La sorgente del
  // quiz viaggia dentro il foglio (<script id="qp-set">) → si ricostruisce la
  // variante voluta senza dover riaprire la mappa che l'ha generato.
  function printQuizPaper(id) {
    var doc = window.MappAIStudyDocs && window.MappAIStudyDocs.get(id);
    if (!doc) { toast(_t('lt_qp_missing', 'Documento non trovato.'), 'warning'); return; }
    if (doc.pdf) { window.open(doc.pdf, '_blank'); return; }
    var QP = window.MappAIQuizPrint;
    var set = QP && QP.setFromHtml && QP.setFromHtml(doc.html);
    if (!set) { _openPrintableHtml(doc.html); return; }   // foglio vecchio senza sorgente
    _paperModal(doc.title, function (withAnswers) {
      _openPrintableHtml(QP.buildQuizSetHtml(set, { includeAnswers: withAnswers, mapName: doc.mapName }));
    });
  }
  function _openPrintableHtml(html) {
    if (window.MappAIStudyExport && window.MappAIStudyExport.openPrintable) return window.MappAIStudyExport.openPrintable(html, {});
    var w = window.open('', '_blank');
    if (!w) { toast(_t('tst_popup_blocked', 'Popup bloccato.'), 'warning'); return; }
    w.document.write(html); w.document.close();
  }
  // Condivisione QR: agli allievi va SEMPRE la copia senza soluzioni.
  function shareQuizPaper(id) {
    var doc = window.MappAIStudyDocs && window.MappAIStudyDocs.get(id);
    if (!doc || !doc.html) { toast(_t('lt_doc_no_qr', 'Questo materiale non è condivisibile via QR (solo i documenti HTML lo sono).'), 'warning'); return; }
    var QP = window.MappAIQuizPrint;
    var set = QP && QP.setFromHtml && QP.setFromHtml(doc.html);
    var html = set ? QP.buildQuizSetHtml(set, { includeAnswers: false, includeBar: false, mapName: doc.mapName }) : doc.html;
    if (window.MappAILive && window.MappAILive.shareDocQr) {
      /* Il nome della MAPPA entra nel file: dal 13/8 il titolo di una copia è
         «Domande Aperte - <nome>» (senza mappa), e due mappe con lo stesso nome
         di copia si sovrascriverebbero il file nella sessione Materiali. */
      window.MappAILive.shareDocQr(_safeFile((doc.mapName ? doc.mapName + ' - ' : '') + doc.title) + '.html', html);
      // 'materiali' (non 'materials'): è la chiave che FilesCore.activityLabel conosce.
      try { logSession({ activity: 'materiali', map: doc.mapName || '', cls: doc.cls || null }); } catch (e) { }
    } else {
      toast(_t('lv_electron', 'Richiede l\'app desktop.'), 'warning');
    }
  }
  function _safeFile(s) { return String(s || 'Quiz').replace(/[\\/:*?"<>|]/g, '-').slice(0, 80); }
  // Modale a due opzioni (stile .pm-* dell'app).
  function _paperModal(title, onPick) {
    var old = document.getElementById('qp-print-modal'); if (old) old.remove();
    var m = document.createElement('div');
    m.id = 'qp-print-modal';
    m.className = 'fixed inset-0 z-[1200] flex items-center justify-center';
    /* Il piano si CHIEDE al motore. Un modale a `z-[1200]` aperto da dentro una
       console — che è un modale del motore a 12100 con riquadro opaco a tutto
       schermo — nasce SOTTO e non si vede mai: è il difetto che rendeva muto
       «Stampa» sui quiz in ELABORA, e questa è la stessa forma, raggiungibile
       da «Quiz cartacei» nella console INSEGNA. */
    try { if (window.MappAIModal && MappAIModal.prossimoZ) m.style.zIndex = String(MappAIModal.prossimoZ()); } catch (e) { }
    m.innerHTML = '<div class="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"></div>' +
      '<div class="relative bg-white rounded-2xl shadow-2xl w-[92vw] max-w-[520px] p-6 space-y-5">' +
      '<div class="flex items-center gap-3">' +
      '<div class="pm-icon-wrap"><i data-lucide="printer" class="w-5 h-5 text-indigo-600"></i></div>' +
      '<div><div class="pm-title">' + esc(_t('lt_qp_print_t', 'Stampa il quiz')) + '</div>' +
      '<div class="pm-subtitle">' + esc(title) + '</div></div></div>' +
      '<div class="pm-section"><p class="pm-body-text">' +
      esc(_t('lt_qp_hint', 'La copia per gli allievi non contiene il foglio soluzioni. Quella del docente lo aggiunge in coda, su una pagina a parte.')) + '</p></div>' +
      '<div class="flex gap-3">' +
      '<button type="button" id="qp-x" class="pm-btn-cancel">' + esc(_t('lt_cancel', 'Annulla')) + '</button>' +
      '<button type="button" id="qp-without" class="pm-btn-cancel">' + esc(_t('lt_qp_without', 'Senza soluzioni')) + '</button>' +
      '<button type="button" id="qp-with" class="pm-btn-primary">' + esc(_t('lt_qp_with', 'Con soluzioni')) + '</button>' +
      '</div></div>';
    document.body.appendChild(m);
    if (window.safeCreateIcons) window.safeCreateIcons();
    var prevFocus = document.activeElement;
    function onKey(e) { if (e.key === 'Escape') { e.stopPropagation(); close(); } }
    function close() {
      document.removeEventListener('keydown', onKey, true);
      m.remove();
      try { if (prevFocus && prevFocus.focus) prevFocus.focus(); } catch (e) { }
    }
    document.addEventListener('keydown', onKey, true);
    m.querySelector('#qp-x').onclick = close;
    m.querySelector('.absolute').onclick = close;
    m.querySelector('#qp-with').onclick = function () { close(); onPick(true); };
    m.querySelector('#qp-without').onclick = function () { close(); onPick(false); };
    setTimeout(function () { var b = m.querySelector('#qp-with'); if (b) b.focus(); }, 20);
  }

  function renderMaterials(docs) {
    var body = document.getElementById('teach-materials-body');
    if (!body) return;
    // Archivio localStorage (filtro classe + selezione mappa). I fogli cartacei
    // hanno la loro sezione: qui non compaiono due volte.
    var archive = filterBySelection(filterItems((docs || [])
      .filter(function (d) { return PAPER_KINDS.indexOf(d.kind) < 0; })
      .map(function (d) { return Object.assign({}, d); })));
    // Con una mappa selezionata: fonde i materiali su DISCO del suo vault (pipeline 011).
    var p = _selectedProject ? projectsRead().find(function (x) { return x.id === _selectedProject.id; }) : null;
    if (p && p.vault) {
      _paintMaterials(body, archive);   // dipingi subito l'archivio
      // I fogli Quiz-*/Flashcard-* stanno nella sezione «Quiz cartacei»: qui
      // comparirebbero una seconda volta.
      _diskMaterialsFor(p).then(function (disk) {
        _paintMaterials(body, archive.concat(disk.filter(function (f) { return !_isPaperFile(f.title); })));
      });
    } else {
      _paintMaterials(body, archive);
    }
  }
  function _materialRowHtml(d) {
    if (d._disk) {
      var dk = _diskKind(d.title);
      var block =
        actIcon('play-circle', _t('lt_open', 'Apri'), "window.MappAITeach.openDiskFile('" + esc(d.id) + "')", 'text-indigo-500 hover:text-indigo-700', false) +
        actIcon('folder', _t('lt_open_finder', 'Apri nel Finder'), "window.MappAITeach.openDiskFile('" + esc(d.id) + "')", null, false) +
        actIcon('trash-2', _t('lt_file_delete', 'Sposta il file nel Cestino'), "window.MappAITeach.deleteDiskFile('" + esc(d.id) + "')", 'text-slate-300 hover:text-red-500', false);
      return fileRow({
        tipo: tipoCell(dk.icon, dk.label, dk.label),
        title: d.title, titleTip: d.title, sub: d.mapName ? esc(d.mapName) : '',
        cls: classCell(d.cls), disc: d.disc || discOfMap(d.mapName, d.projectId), date: dateCell(d.date), block: block,
        onClick: "window.MappAITeach.openDiskFile('" + esc(d.id) + "')"
      });
    }
    var meta = KIND_META[d.kind] || KIND_META.dossier;
    var typeLbl = _t(KIND_META[d.kind] ? 'lt_kind_' + d.kind : 'lt_kind_dossier', meta.label);
    var isNode = d.kind === 'nodesheet';
    var block2 =
      actIcon('play-circle', _t('lt_open', 'Apri'), "window.MappAITeach.openDoc('" + esc(d.id) + "')", 'text-indigo-500 hover:text-indigo-700', false) +
      actIcon('qr-code', isNode ? _t('lt_doc_no_qr_short', 'Non condivisibile via QR') : _t('lt_sm_share', 'Condividi via QR'), "window.MappAITeach.shareDoc('" + esc(d.id) + "')", 'text-green-600 hover:text-green-700', isNode) +
      actIcon('folder', _t('lt_open_docs_folder', 'Apri la cartella documenti'), "window.MappAITeach.openMapsFolder()", null, false) +
      actIcon('trash-2', _t('lt_sm_delete', 'Elimina'), "window.MappAITeach.deleteDoc('" + esc(d.id) + "')", 'text-slate-300 hover:text-red-500', false);
    return fileRow({
      tipo: tipoCell(meta.icon, typeLbl, typeLbl),
      title: d.title, titleTip: d.title, sub: d.mapName ? esc(d.mapName) : '',
      cls: classCell(d.cls), disc: d.disc || discOfMap(d.mapName, d.projectId), date: dateCell(d.date), block: block2,
      onClick: "window.MappAITeach.openDoc('" + esc(d.id) + "')"
    });
  }
  function _paintMaterials(body, list) {
    if (!list.length) {
      body.innerHTML = '<p class="text-xs text-slate-400 italic px-2 py-2">' +
        esc(_t('lt_no_materials', 'Nessun materiale archiviato. Genera una Sintesi, un Dossier, un Foglio nodi o una Timeline: compariranno qui.')) + '</p>';
      return;
    }
    body.innerHTML = fileTable(list.map(_materialRowHtml).join(''), true);
    if (window.safeCreateIcons) window.safeCreateIcons();
  }

  // Condivide un materiale archiviato via QR (Materiali di MappAI Live). Solo HTML.
  function shareDoc(id) {
    var doc = window.MappAIStudyDocs && window.MappAIStudyDocs.get(id);
    if (!doc || !doc.html) { toast(_t('lt_doc_no_qr', 'Questo materiale non è condivisibile via QR (solo i documenti HTML lo sono).'), 'warning'); return; }
    if (!(window.MappAILive && window.MappAILive.publishHtml)) { toast(_t('lv_electron', 'Richiede l\'app desktop.'), 'warning'); return; }
    /* col nome della mappa davanti: i titoli delle copie (13/8) non la portano
       più — senza, due mappe con la stessa copia si sovrascriverebbero il file */
    var fname = ((doc.mapName ? doc.mapName + ' - ' : '') + (doc.title || 'materiale'))
      .replace(/[^\w\-]+/g, '_').slice(0, 60) + '.html';
    Promise.resolve(window.MappAILive.publishHtml(fname, doc.html)).then(function () {
      logSession({ map: doc.mapName || '', activity: 'materiali' });
      if (window.MappAILive.openMaterials) window.MappAILive.openMaterials();
    });
  }

  // Elimina un materiale ARCHIVIATO (con conferma).
  // ⚠️ L'archivio vive in localStorage e non sa quali file siano stati scritti
  // nel vault: qui si toglie la voce, non il file. Quello si toglie dalla sua
  // riga «da disco», col cestino (deleteDiskFile) — e il messaggio lo dice,
  // perché «elimina» che lascia il file nella cartella è una bugia.
  function deleteDoc(id) {
    var doc = window.MappAIStudyDocs && window.MappAIStudyDocs.get(id);
    var name = (doc && doc.title) || _t('lt_this_material', 'questo materiale');
    confirmDeleteText(name, function () {
      if (window.MappAIStudyDocs && window.MappAIStudyDocs.remove) window.MappAIStudyDocs.remove(id);
      var docs = (window.MappAIStudyDocs && window.MappAIStudyDocs.list()) || [];
      renderMaterials(docs);
      renderQuizPaper(docs);   // stessa lista: senza questo la riga eliminata resta a video
      if (window.safeCreateIcons) window.safeCreateIcons();
    });
  }

  // ── Registro attività di studio + report (010) ────────────────────────────
  // Una riga per SOMMINISTRAZIONE: attività · ramo/mappa · data · partecipanti/
  // totale · link a ogni report. Fonte = disco (IPC), sopravvive a clear localStorage.
  function activeClassName() { var ac = activeClass(); return ac && ac.name ? ac.name : null; }
  function normName(s) { return String(s == null ? '' : s).normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim(); }

  // Etichetta attività lato registro per la Lavagna (activityLabel('lavagna'))
  var LAVAGNA_LABEL = 'Lavagna';
  function renderActivities(sets) {
    var body = document.getElementById('teach-activities-body');
    var lav = document.getElementById('teach-lavagna-body');
    if (!body) return;
    var setsHtml = savedSetsHtml(sets);
    var lavEmpty = function () {
      if (lav) { lav.innerHTML = '<p class="text-xs text-slate-400 italic px-2 py-2">' + esc(_t('lt_no_lavagna', 'Nessuna sessione di lavagna interattiva. Avviala da «Lavagna interattiva» con una classe: qui compariranno le sessioni salvate.')) + '</p>'; }
    };
    if (!window.electronAPI || !window.electronAPI.studySessionsList) {
      body.innerHTML = '<p class="text-xs text-slate-400 italic px-2 py-2">' +
        esc(_t('lt_activities_desktop', 'Il registro delle attività somministrate è disponibile nell\'app desktop.')) + '</p>' + setsHtml;
      lavEmpty();
      if (window.safeCreateIcons) window.safeCreateIcons();
      return;
    }
    body.innerHTML = '<p class="text-xs text-slate-400 italic px-2 py-2">' + esc(_t('lt_activities_loading', 'Carico le attività…')) + '</p>';
    if (lav) lav.innerHTML = '<p class="text-xs text-slate-400 italic px-2 py-2">' + esc(_t('lt_activities_loading', 'Carico le attività…')) + '</p>';
    window.electronAPI.studySessionsList().then(function (res) {
      var rows = (res && res.success && res.rows) ? res.rows : [];
      // filtro "solo classe attiva"
      if (readFilter() === 'active') {
        var acn = normName(activeClassName());
        if (acn) rows = rows.filter(function (r) { return normName(r.className) === acn; });
      }
      // US5: filtro sulla mappa selezionata (le righe attività hanno il campo .map)
      rows = filterBySelection(rows);
      // La Lavagna interattiva ha una sezione dedicata (stesse colonne).
      var lavRows = rows.filter(function (r) { return r.activity === LAVAGNA_LABEL; });
      var actRows = rows.filter(function (r) { return r.activity !== LAVAGNA_LABEL; });
      if (lav) {
        lav.innerHTML = lavRows.length ? actTable(lavRows.map(activityRow).join('')) : '';
        if (!lavRows.length) lavEmpty();
      }
      if (!actRows.length) {
        body.innerHTML = '<p class="text-xs text-slate-400 italic px-2 py-2">' +
          esc(_t('lt_no_activities', 'Nessuna attività somministrata. Avvia un quiz, un tutor o una timeline con una classe: qui compariranno le somministrazioni con i loro report.')) + '</p>' + setsHtml;
        if (window.safeCreateIcons) window.safeCreateIcons();
        return;
      }
      body.innerHTML = actTable(actRows.map(activityRow).join('')) + setsHtml;
      if (window.safeCreateIcons) window.safeCreateIcons();
    }).catch(function () {
      body.innerHTML = '<p class="text-xs text-slate-400 italic px-2 py-2">' + esc(_t('lt_no_activities', 'Nessuna attività somministrata.')) + '</p>' + setsHtml;
      lavEmpty();
      if (window.safeCreateIcons) window.safeCreateIcons();
    });
  }

  var ACT_ICON = { Quiz: 'help-circle', 'Vero-Falso': 'check-circle', Cloze: 'pencil-line', Domande: 'message-circle-question', 'Tutor AI': 'message-square', Timeline: 'gantt-chart', Lavagna: 'presentation' };
  // Report → etichetta breve del bottone (chiave i18n · fallback IT).
  var WHICH_LBL = { questions: 'lt_rep_answers', students: 'lt_rep_students', tutor: 'lt_rep_tutor', workshop: 'lt_rep_workshop' };
  var WHICH_FB = { questions: 'Risposte', students: 'Allievi', tutor: 'Tutor', workshop: 'Costruzione' };
  function activityRow(r) {
    var scope = r.scope ? esc(r.scope) : esc(_t('lt_whole_map', 'Tutta la mappa'));
    var icon = ACT_ICON[r.activity] || 'clipboard-list';
    var typeLbl = r.activity || _t('lt_activity', 'Attività');
    var partic = (r.total > 0 || r.participants > 0)
      ? '<span class="inline-flex items-center gap-1 text-[10px] font-semibold text-slate-500 whitespace-nowrap" title="' + esc(_t('lt_participants', 'Partecipanti')) + '"><i data-lucide="users" class="w-3 h-3 shrink-0"></i>' + (r.participants || 0) + '/' + (r.total || 0) + '</span>'
      : '<span class="text-slate-300">—</span>';
    var reports = (r.reports && r.reports.length)
      ? r.reports.map(function (rep) {
          var lbl = _t(WHICH_LBL[rep.which] || '', WHICH_FB[rep.which] || rep.label);
          return '<button type="button" onclick="event.stopPropagation();window.MappAITeach.openReport(\'' + esc(encodeURIComponent(rep.file)) + '\')" class="inline-flex items-center gap-1 text-[10px] font-bold text-indigo-600 hover:text-white hover:bg-indigo-500 border border-indigo-200 rounded-md px-1.5 py-1 transition-colors">' +
            '<i data-lucide="file-text" class="w-3 h-3 shrink-0"></i>' + esc(lbl) + '</button>';
        }).join('')
      : '<span class="text-[10px] text-slate-400 italic">' + esc(_t('lt_no_report', 'Nessun report')) + '</span>';
    var folderBtn = r.dir
      ? actIcon('folder', _t('lt_open_finder', 'Apri nel Finder'), "window.MappAITeach.openActivityFolder('" + esc(encodeURIComponent(r.dir)) + "')", null, false)
      : '';
    return actTableRow({
      tipo: tipoCell(icon, typeLbl, typeLbl),
      title: r.map || r.activity || '', titleTip: r.activity + (r.map ? ' · ' + r.map : ''),
      sub: '<i data-lucide="target" class="w-2.5 h-2.5 inline align-middle"></i> ' + scope,
      cls: classCell(r.className), disc: discOfMap(r.map, null), partic: partic, date: dateCell(r.date),
      reports: reports, folder: folderBtn
    });
  }
  function openActivityFolder(dirEnc) {
    var dir = decodeURIComponent(dirEnc);
    if (window.electronAPI && window.electronAPI.studySessionOpenFolder) {
      window.electronAPI.studySessionOpenFolder({ dir: dir }).then(function (rr) {
        if (!rr || !rr.success) toast(_t('lt_folder_missing', 'Cartella non disponibile.'), 'warning');
      });
    } else toast(_t('fx_desktop', 'Disponibile solo nell\'app desktop.'), 'warning');
  }

  // Sottolista muta: quiz/flashcard SALVATI ma non somministrati (riapribili).
  function savedSetsHtml(sets) {
    var list = filterItems((sets || []).slice());
    if (!list.length) return '';
    var rows = list.map(function (s) {
      var icon = s.type === 'flashcards' ? 'copy' : 'help-circle';
      var typeLbl = s.type === 'flashcards' ? _t('lt_type_flashcards', 'Flashcard') : _t('lt_type_quiz', 'Quiz');
      return '<div class="flex items-center gap-2 px-2 py-1.5 hover:bg-indigo-50 rounded-lg cursor-pointer" onclick="window.MappAITeach.openSet(\'' + esc(s.projectId) + '\')">' +
        '<i data-lucide="' + icon + '" class="w-3.5 h-3.5 text-slate-400 shrink-0"></i>' +
        '<span class="flex-1 min-w-0 text-[12px] font-semibold text-slate-600 truncate" title="' + esc(s.name) + '">' + esc(s.name) + '</span>' +
        '<span class="text-[10px] text-slate-400">' + esc(typeLbl) + (s.mapName ? ' · ' + esc(s.mapName) : '') + '</span>' +
        '<i data-lucide="play-circle" class="w-3.5 h-3.5 text-indigo-300 shrink-0"></i></div>';
    }).join('');
    return '<div class="mt-2 pt-2 border-t border-slate-100">' +
      '<div class="text-[10px] font-bold uppercase tracking-wide text-slate-400 px-2 mb-1">' + esc(_t('lt_saved_sets', 'Quiz e flashcard salvati (riapribili)')) + '</div>' + rows + '</div>';
  }

  function openReport(fileEnc) {
    var file = decodeURIComponent(fileEnc);
    if (window.electronAPI && window.electronAPI.studyReportOpen) {
      window.electronAPI.studyReportOpen(file).then(function (r) {
        if (!r || !r.success) toast(_t('lt_report_missing', 'Report non disponibile.'), 'warning');
      });
    } else { toast(_t('fx_desktop', 'Disponibile solo nell\'app desktop.'), 'warning'); }
  }

  function openDoc(id) {
    var doc = window.MappAIStudyDocs && window.MappAIStudyDocs.get(id);
    if (!doc) { toast(_t('lt_doc_missing', 'Documento non disponibile.'), 'warning'); return; }
    if (doc.pdf) { window.open(doc.pdf, '_blank'); return; } // Foglio nodi (PDF)
    if (!doc.html) { toast(_t('lt_doc_missing', 'Documento non disponibile.'), 'warning'); return; }
    if (window.MappAIStudyExport && window.MappAIStudyExport.openPrintable) {
      window.MappAIStudyExport.openPrintable(doc.html, { successMsg: null });
    } else {
      var w = window.open('', '_blank'); if (w) { w.document.write(doc.html); w.document.close(); }
    }
  }

  function openSet(projectId) {
    if (window.StorageManager && StorageManager.loadProject) StorageManager.loadProject(projectId);
  }

  // ── Avvio rapido QR ────────────────────────────────────────────────────────
  function toast(msg, level) { if (window.showToast) window.showToast(msg, level || 'info'); }

  /* Le finestre di questa landing passano tutte dal MOTORE (2/8): taglia,
     ESC, focus trap, ritorno del fuoco e ruoli dei bottoni arrivano da lì una
     volta sola. Prima erano `makeOverlay`, che non aveva né trap né ritorno
     del fuoco — un modale da cui si usciva col Tab e non si tornava indietro. */
  function MM() { return window.MappAIModal; }

  // Step 1: scelta classe. cb(cls|null) — null = "senza classe".
  function pickClass(cb) {
    if (!MM()) return;
    var classes = classList();
    var sezioni = classes.length
      ? [{
        voci: classes.map(function (c) {
          return {
            id: 'cls-' + c.id, etichetta: c.name, icona: 'graduation-cap',
            sotto: [c.grade, c.system].filter(Boolean).join(' · ')
          };
        })
      }]
      : [{
        testo: _t('lt_no_classes', 'Non hai ancora creato classi. Creane una per tarare le attività, oppure continua senza classe.'),
        azioni: [{ id: 'nuova', etichetta: _t('lt_create_class', 'Crea una classe'), ruolo: 'primario', icona: 'plus' }]
      }];
    MM().open({
      titolo: _t('lt_pick_class', 'Scegli la classe'), icona: 'users', taglia: 's',
      invio: false, sezioni: sezioni,
      azioni: [{ id: 'senza', etichetta: _t('lt_without_class', 'Continua senza classe') }]
    }).then(function (r) {
      if (!r) return;                                   // ESC o velo: non si prosegue
      if (r.azione === 'senza') return cb(null);
      if (r.azione === 'nuova') { if (window.openClassAccountsModal) window.openClassAccountsModal(); return; }
      var id = r.azione.slice(4);
      try { window.MappAIClasses.setActive(id); } catch (e) { }
      cb(window.MappAIClasses.get(id) || null);
    });
  }

  // Step 2: scelta mappa a 3 fasce. cb(project).
  function pickMap(cls, cb) {
    var core = CORE();
    var projects = projectsRead();
    if (!projects.length) { toast(_t('lt_no_maps', 'Nessuna mappa salvata. Creane una in modalità Costruisci.'), 'warning'); return; }
    if (!MM()) return;
    var ranked = core ? core.rankMapsForClass(projects, regRead(), cls || {}) : { started: [], sameGrade: [], others: projects };
    var otherGrade = (ranked.otherGrade || []);
    // Mappe assegnate ad ALTRE classi: nascoste di default (il docente non è
    // bloccato → un comando per mostrarle). Se non c'è nessun'altra mappa da
    // mostrare sopra, si aprono subito così il picker non resta vuoto.
    var mostraAltre = !(ranked.started.length || ranked.sameGrade.length || ranked.others.length);

    function voce(p) {
      return {
        id: 'map-' + p.id, etichetta: p.name, badge: p.grade || '',
        icona: _tipoDi(p) === 'kg' ? 'network' : 'git-merge'
      };
    }
    function fascia(chiave, ripiego, arr) {
      return arr.length ? [{ gruppo: _t(chiave, ripiego) }].concat(arr.map(voce)) : [];
    }
    function schema() {
      var voci = fascia('lt_band_started', 'Già usate con la classe', ranked.started)
        .concat(fascia('lt_band_grade', 'Stesso grado', ranked.sameGrade))
        .concat(fascia('lt_band_others', 'Mappe generiche', ranked.others));
      if (otherGrade.length && mostraAltre) {
        voci = voci.concat(fascia('lt_band_other_grade_h', 'Assegnate ad altre classi', otherGrade));
      }
      var sezioni = [{ voci: voci }];
      if (otherGrade.length && !mostraAltre) {
        sezioni.push({
          azioni: [{
            id: 'altre', chiude: false, icona: 'chevron-right',
            etichetta: _t('lt_band_other_grade', 'Mappe di altre classi') + ' (' + otherGrade.length + ')'
          }]
        });
      }
      return {
        titolo: _t('lt_pick_map', 'Scegli la mappa'), icona: 'git-merge',
        taglia: 'm', invio: false, sezioni: sezioni
      };
    }
    var s = schema();
    s.suAzione = function (ev, box, ridisegna) {
      if (ev.azione === 'altre') { mostraAltre = true; ridisegna(schema()); }
    };
    MM().open(s).then(function (r) {
      if (!r || r.azione.indexOf('map-') !== 0) return;
      var id = r.azione.slice(4);
      cb(projects.find(function (x) { return x.id === id; }));
    });
  }

  // Step 2 (Materiali): scelta documento archiviato. cb(doc).
  function pickDoc(cls, cb) {
    // Solo documenti HTML: i PDF (Foglio nodi) non sono pubblicabili via QR
    // (restano riapribili dalla sezione Materiali). getDoc per leggere kind/pdf
    // sarebbe pesante → list() non porta pdf, quindi filtriamo i nodesheet.
    var docs = ((window.MappAIStudyDocs && window.MappAIStudyDocs.list()) || [])
      .filter(function (d) { return d.kind !== 'nodesheet'; });
    var list = filterItemsForClass(docs, cls);
    if (!list.length) { toast(_t('lt_no_docs', 'Nessun materiale condivisibile. Genera una Sintesi, un Dossier o una Timeline.'), 'warning'); return; }
    if (!MM()) return;

    function schema() {
      return {
        titolo: _t('lt_pick_doc', 'Scegli il materiale'), icona: 'folder-down',
        taglia: 'm', invio: false,
        sezioni: [list.length
          ? {
            voci: list.map(function (d) {
              var meta = KIND_META[d.kind] || KIND_META.dossier;
              return {
                id: 'doc-' + d.id, etichetta: d.title, sotto: d.mapName || '', icona: meta.icon,
                azioni: [{
                  id: 'del-' + d.id, etichetta: _t('lt_sm_delete', 'Elimina'),
                  icona: 'trash-2', ruolo: 'distruttivo'
                }]
              };
            })
          }
          : { testo: _t('lt_docs_empty', 'Nessun materiale rimasto.') }]
      };
    }
    var s = schema();
    s.suAzione = function (ev, box, ridisegna) {
      if (ev.azione.indexOf('del-') !== 0) return;
      var id = ev.azione.slice(4);
      MM().conferma({
        titolo: _t('lt_doc_del_title', 'Eliminare questo materiale?'),
        testo: _t('lt_doc_del_confirm', 'Eliminare questo materiale dall\'archivio? (l\'operazione non si può annullare)'),
        conferma: _t('lt_sm_delete', 'Elimina'), distruttivo: true
      }).then(function (si) {
        if (!si) return;
        if (window.MappAIStudyDocs && window.MappAIStudyDocs.remove) window.MappAIStudyDocs.remove(id);
        list = list.filter(function (d) { return d.id !== id; });
        if (window.MappAITeach && window.MappAITeach.refresh) window.MappAITeach.refresh();
        ridisegna(schema());
      });
    };
    MM().open(s).then(function (r) {
      if (!r || r.azione.indexOf('doc-') !== 0) return;
      cb(window.MappAIStudyDocs.get(r.azione.slice(4)));
    });
  }

  // filtro soft per il picker documenti: se una classe è scelta, prima quelli
  // della classe, ma li mostra TUTTI (non bloccare).
  function filterItemsForClass(docs, cls) {
    if (!cls || !cls.name) return docs.slice();
    var core = CORE();
    if (!core) return docs.slice();
    var match = core.filterByClass(docs, cls, regRead(), projectsRead());
    var rest = docs.filter(function (d) { return match.indexOf(d) < 0; });
    return match.concat(rest);
  }

  // Eredità grade (FR-022): progetto senza grade + classe con grade → salva.
  function inheritGrade(project, cls) {
    if (!project || project.grade || !cls || !cls.grade) return;
    var projects = projectsRead();
    var p = projects.find(function (x) { return x.id === project.id; });
    if (p && !p.grade) {
      p.grade = cls.grade;
      try { localStorage.setItem('tutor_ai_projects', JSON.stringify(projects)); } catch (e) { }
      project.grade = cls.grade;
    }
  }

  function quickStart(kind) {
    pickClass(function (cls) {
      if (kind === 'materials') {
        pickDoc(cls, function (doc) {
          if (!doc || !doc.html) { toast(_t('lt_doc_missing', 'Documento non disponibile.'), 'warning'); return; }
          /* col nome della mappa davanti: i titoli delle copie (13/8) non la
             portano più — senza, due mappe con la stessa copia si
             sovrascriverebbero il file nella sessione Materiali */
          var fname = ((doc.mapName ? doc.mapName + ' - ' : '') + (doc.title || 'materiale'))
            .replace(/[^\w\-]+/g, '_').slice(0, 60) + '.html';
          if (window.MappAILive && window.MappAILive.publishHtml) {
            Promise.resolve(window.MappAILive.publishHtml(fname, doc.html)).then(function () {
              logSession({ map: doc.mapName || '', cls: cls ? cls.name : null, activity: 'materiali' });
              if (window.MappAILive.openMaterials) window.MappAILive.openMaterials();
            });
          } else { toast(_t('lv_electron', 'Richiede l\'app desktop.'), 'warning'); }
        });
        return;
      }
      // Lavagna / Live: richiedono la mappa caricata
      pickMap(cls, function (project) {
        if (!project) return;
        inheritGrade(project, cls);
        if (window.StorageManager && StorageManager.loadProject) StorageManager.loadProject(project.id);
        setTimeout(function () {
          if (kind === 'collab') {
            if (window.openCollabHub) window.openCollabHub();
            else toast(_t('lt_hub_missing', 'Funzione non disponibile.'), 'warning');
          } else if (kind === 'live') {
            if (window.MappAILive && window.MappAILive.openSetup) window.MappAILive.openSetup();
            else toast(_t('lv_electron', 'Richiede l\'app desktop.'), 'warning');
          }
        }, 120);
      });
    });
  }

  // ── Assegnazione grade (Costruisci, US4) ───────────────────────────────────
  function editGrade(projectId) {
    var projects = projectsRead();
    var p = projects.find(function (x) { return x.id === projectId; });
    if (!p) return;
    var core = CORE();
    // gradi unici dalle classi (dedup via normGrade)
    var seen = Object.create(null), grades = [];
    classList().forEach(function (c) {
      if (!c.grade) return;
      var k = core ? core.normGrade(c.grade) : c.grade;
      if (seen[k]) return; seen[k] = true; grades.push(c.grade);
    });
    if (!MM()) return;
    var attuale = function (g) { return core ? core.normGrade(g) === core.normGrade(p.grade || '') : g === p.grade; };
    var sezioni = [];
    // I gradi delle classi sono scorciatoie, non un elenco da scorrere: stanno
    // in fila come bottoni brevi, e quello in uso porta la spunta.
    if (grades.length) {
      sezioni.push({
        titolo: _t('lt_grade_from_classes', 'Dalle tue classi'),
        azioni: grades.map(function (g) {
          return { id: 'g-' + g, etichetta: g, icona: attuale(g) ? 'check' : '' };
        })
      });
    }
    sezioni.push({
      titolo: _t('lt_grade_custom', 'Grado personalizzato'),
      campi: [{ id: 'grado', etichetta: _t('lt_grade_ph', 'Es. 1ª media'), valore: p.grade || '' }]
    });
    var azioni = [];
    if (p.grade) azioni.push({ id: 'via', etichetta: _t('lt_grade_remove', 'Rimuovi grado'), ruolo: 'distruttivo' });
    azioni.push({ id: 'salva', etichetta: _t('lt_grade_save', 'Salva'), ruolo: 'primario' });

    var save = function (val) {
      p.grade = (val || '').trim().slice(0, 40) || null;
      try { localStorage.setItem('tutor_ai_projects', JSON.stringify(projects)); } catch (e) { }
      renderBuildProjects();
    };
    MM().open({
      titolo: _t('lt_grade_title', 'Grado di ') + (p.name || ''),
      icona: 'graduation-cap', taglia: 's', sezioni: sezioni, azioni: azioni
    }).then(function (r) {
      if (!r) return;
      if (r.azione === 'via') return save('');
      if (r.azione === 'salva') return save(r.valori.grado);
      if (r.azione.indexOf('g-') === 0) return save(r.azione.slice(2));
    });
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     CONSOLE «INSEGNA» (2/8/26)
     Sostituisce le tre sezioni della landing. Il difetto che risolve, notato da
     Giacomo: scegliere una classe NON restringeva i materiali — restavano
     visibili quelli di tutte le mappe. Qui il percorso è quello vero del
     lavoro: chip classe·materia → la MAPPA nella colonna → i materiali del suo
     vault → il materiale scelto nella tela, con la sua barra.
     Kill-switch `mappai_teach_console='0'` → landing storica a tre sezioni.
     ═══════════════════════════════════════════════════════════════════════════ */
  var _cons = { voce: '', mat: null, materiali: null, mappe: null, sessioni: null, report: null, stampabili: null, lavLogin: '', lavRete: '' };
  /* Le viste della classe che la console ospita nella tela: id della voce →
     contenitore che la landing riempie già. Una sola fonte, così la console non
     può puntare a una sezione che non esiste. */
  var VISTE_CLASSE = [
    { id: 'lavagna', icona: 'presentation', chiave: 'lt_v_lavagna', testo: 'Lavagna' },
    { id: 'live', icona: 'radio', chiave: 'lt_v_live', testo: 'Attività LIVE' },
    { id: 'stampabili', icona: 'printer', chiave: 'lt_v_stampabili', testo: 'Stampabili' }
  ];
  function _vistaClasse(id) { return VISTE_CLASSE.find(function (v) { return v.id === id; }) || null; }

  function consoleAttiva() {
    try { return localStorage.getItem('mappai_teach_console') !== '0'; } catch (e) { return true; }
  }
  function _consClasse() { var c = activeClass(); return c && c.name ? c : null; }
  function _consMateria() {
    try { return (window.MappAIClasses && window.MappAIClasses.activeDiscipline) ? window.MappAIClasses.activeDiscipline() : ''; }
    catch (e) { return ''; }
  }

  /* ── CABLAGGIO console-bento (6/8) — dietro flag, OPT-IN, default OFF ────────
     `mappai_console_bento_app='1'` accende la veste nuova (cascata «Cosa/A chi/
     Materia» al posto del chip; poi area a bento, poi via il rail). Spenta =
     console INSEGNA identica a oggi. Va accesa e provata in Electron. */
  /* ⚠️ IL FLAG È IN PENSIONE (14/8 sera): il suo «passo indietro» era il rail
     delle tre forme, che non esiste più — a '0' la landing sarebbe rimasta
     senza modo di cambiare sezione. Risponde sempre di sì; la funzione resta
     perché la chiamano da più punti. */
  function _bentoApp() { return true; }
  /* gli allievi per la colonna «A chi?»: i profili studente (taratura), nome +
     grado. Picking → `setActiveStudent` (esclude la classe attiva). */
  function _allieviProfili() {
    try {
      var a = (typeof appState !== 'undefined') ? appState : window.appState;
      var arr = (a && Array.isArray(a.allProfiles)) ? a.allProfiles : [];
      return arr.filter(function (p) { return p && p.nickname; }).map(function (p) {
        return { nick: p.nickname, label: p.nickname + (p.grade ? ' — ' + p.grade : ''), p: p };
      });
    } catch (e) { return []; }
  }
  /* «+ Nuova materia»: chiede il label e procede. Usa il prompt dell'app se c'è. */
  function _promptNuovaMateria(cb) {
    var q = _t('lt_cons_nuova_materia_q', 'Nome della nuova materia');
    if (window.showPrompt) { try { return window.showPrompt(q, '', function (v) { if (v && String(v).trim()) cb(String(v).trim()); }); } catch (e) { } }
    var v = null; try { v = window.prompt(q); } catch (e) { }
    if (v && String(v).trim()) cb(String(v).trim());
  }
  /* Le mappe della console vengono dal DISCO, non da localStorage.
     ⚠️ Era il difetto della prima versione, visto da Giacomo in Electron: i
     materiali comparivano per una classe sola. Motivo: partivo dai progetti in
     localStorage e cercavo il vault per `p.vault`, che le mappe più vecchie non
     hanno — mentre INSEGNA legge il disco, che è la fonte di verità (§ auto-vault).
     Qui si fa lo stesso: si elencano i vault e si aggancia il progetto se c'è. */
  function _consMappe() {
    return _cons.mappe || [];
  }
  function _consCaricaMappe() {
    var api = window.electronAPI;
    var projects = projectsRead();
    if (!api || !api.getAllVaults) {
      // browser statico: restano i soli progetti salvati
      return Promise.resolve(projects.map(function (p) {
        return { id: 'p:' + p.id, nome: p.name, type: p.type, p: p, v: null, cls: p.cls || '', disc: p.disc || '' };
      }));
    }
    return api.getAllVaults().then(function (all) {
      _segnaGeneri(all);
      return (all || []).map(function (v) {
        var p = matchProjectToVault(projects, v);
        return {
          id: p ? 'p:' + p.id : 'v:' + v.fullPath,
          nome: (p && p.name) || v.rootNodeLabel || v.folderName,
          /* IL GENERE LO DICE IL DISCO (Giacomo, 8/8 notte: un KG mostrava
             l'icona delle MindMap). `index.yaml` porta `extractionMode` e
             `get-all-vaults` lo restituisce già: prima si ripiegava su
             'mindmap' e una mappa senza progetto in localStorage — la
             maggioranza, in Electron — veniva dichiarata MindMap per
             difetto. Il disco vince sul campo del progetto per la stessa
             regola che vale per classe e materia: la cartella è la fonte di
             verità, il campo del progetto è il ripiego di chi non ha Electron.
             Il genere non è solo l'icona: da lì dipende «Elabora», che sulle
             MindMap c'è e sui KG no. */
          type: (v.extractionMode === 'kg' ? 'kg' : (v.extractionMode === 'mindmap' ? 'mindmap' : null))
            || (p && p.type) || 'mindmap',
          p: p, v: v,
          /* ── UN VAULT ARRIVATO DA FUORI (Giacomo, 9/8) ────────────────────
             Ordine: la CARTELLA (fonte di verità dove c'è) → il progetto in
             localStorage → quello che il vault DICHIARA in `index.yaml`.
             L'ultimo gradino è la novità e serve al vault di un collega: sta in
             `Mappe/` senza cartelle di classe, quindi le prime due strade non
             dicono niente e la mappa risultava «senza materia».
             ⚠️ `sconosciuta` marca ciò che questo docente non ha nel proprio
             profilo: la classe di un collega non è una classe sua, e la mappa
             va trattata come GENERICA invece di restare invisibile (vedi
             `_filtraContesto`). */
          cls: (p && p.cls) || prettyClass(v.classDir || '') || (v.classeDichiarata || ''),
          disc: (p && p.disc) || prettyClass(v.discDir || '') || (v.materiaDichiarata || ''),
          daFuori: !v.classDir && !!(v.classeDichiarata || v.materiaDichiarata)
        };
      });
    }).catch(function () { return []; });
  }
  /* Il chip NON è un filtro cosmetico: è il contesto della console, e la colonna
     mostra solo ciò che gli appartiene. */
  /* Le classi e le materie che QUESTO docente ha davvero. Una mappa che parla di
     una classe o di una materia che lui non ha — tipicamente il vault di un
     collega — non appartiene a nessun suo contesto: è GENERICA, e come tale
     compare quando il contesto è Generico. Prima sparivano del tutto: il filtro
     confrontava con la classe attiva e non trovava mai una corrispondenza, e non
     esisteva un contesto in cui la mappa potesse comparire (Giacomo, 9/8). */
  function _classiMie() {
    try { return ((window.MappAIClasses && MappAIClasses.list()) || []).map(function (c) { return normName(c.name); }); }
    catch (e) { return []; }
  }
  function _materieMie() {
    var out = [];
    try {
      var CL = window.MappAIClasses;
      (CL && CL.list() || []).forEach(function (c) {
        ((CL.disciplinesOf && CL.disciplinesOf(c)) || []).forEach(function (d) { out.push(normName(d)); });
      });
      var prof = (window.MappAITeacherProfile && MappAITeacherProfile.disciplineList()) || [];
      prof.forEach(function (d) { out.push(normName(d)); });
    } catch (e) { }
    return out;
  }
  /* la mappa come la vede QUESTO docente: se dichiara una classe o una materia
     che non gli appartiene, per lui è generica */
  function _comeLaVedo(m) {
    var mie = _classiMie(), mat = _materieMie();
    return {
      cls: (m.cls && mie.indexOf(normName(m.cls)) >= 0) ? m.cls : '',
      disc: (m.disc && mat.indexOf(normName(m.disc)) >= 0) ? m.disc : ''
    };
  }
  function _filtraContesto(list) {
    var cls = _consClasse(), mat = _consMateria();
    return (list || []).filter(function (m) {
      var v = _comeLaVedo(m);
      if (cls && normName(v.cls) !== normName(cls.name)) return false;
      if (mat && normName(v.disc) !== normName(mat)) return false;
      return true;
    });
  }
  function _consFiltrate() { return _filtraContesto(_consMappe()); }
  function _consMappaScelta() {
    if (!_cons.voce) return null;
    return _consMappe().find(function (m) { return m.id === _cons.voce; }) || null;
  }

  /* La chiave con cui si riconosce lo STESSO documento scritto in due grafie:
     via l'estensione, i separatori (trattini, lineette, spazi) diventano uno
     spazio solo, tutto in minuscolo. «Foglio nodi — Mappa (rivisto)» e
     «Foglio-nodi-Mappa (rivisto).pdf» collassano sulla stessa stringa. Il
     GENERE entra nella chiave: due documenti diversi con un titolo simile non
     devono nascondersi a vicenda. */
  function _chiaveDoc(nome, genere) {
    var n = String(nome || '').replace(/\.[A-Za-z0-9]+$/, '')
      .replace(/[\u2010-\u2015\-_]+/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
    return String(genere || '').toLowerCase() + '|' + n;
  }

  /* I materiali di UNA mappa: quelli archiviati (localStorage) e quelli che
     stanno nella cartella. Due mondi che non si parlano — qui si vedono
     insieme, che è il punto della console. */
  function _consCaricaMateriali(m) {
    var core = CORE();
    var p = m.p || { id: '', name: m.nome };
    var arch = ((window.MappAIStudyDocs && window.MappAIStudyDocs.list()) || []).filter(function (d) {
      return core && core.matchesSelectedProject && p.id
        ? core.matchesSelectedProject(d, { id: p.id, name: p.name })
        : normName(d.mapName || '') === normName(m.nome);
    }).map(function (d) {
      var meta = KIND_META[d.kind] || KIND_META.dossier;
      return {
        id: 'arc:' + d.id, archivio: true, docId: d.id, kind: d.kind,
        titolo: d.title, icona: meta.icon, data: d.date,
        tipo: _t(KIND_META[d.kind] ? 'lt_kind_' + d.kind : 'lt_kind_dossier', meta.label),
        /* classe e materia: quelle registrate col documento, e se mancano
           quelle della mappa da cui viene — è la stessa coppia, letta da due
           posti diversi a seconda di chi l'ha scritta */
        cls: d.cls || m.cls || '', disc: d.disc || m.disc || '',
        /* ⚠️ «Modificabile» NON è un sinonimo di «viene dall'archivio». Questa
           voce può portare un PDF già finito (il foglio dei nodi rivisto lo
           archivia come data-URI): dire «Modificabile» su una riga che non si
           può correggere è una bugia, e in INSEGNA — dove si va a PRENDERE un
           documento — è pure inutile. Si dice che cosa si ha in mano. */
        formato: d.hasPdf ? 'PDF' : (d.hasHtml ? 'HTML' : ''),
        qr: d.kind !== 'nodesheet' && d.hasHtml
      };
    });
    /* i file del vault si leggono dal percorso VERO del vault (che il disco ci
       ha già dato), non ricercandolo per nome: è il passaggio che perdeva le
       mappe senza `p.vault` registrato */
    var api = window.electronAPI;
    var suDisco = (m.v && api && api.vaultMaterialsList)
      ? api.vaultMaterialsList({ vaultPath: m.v.fullPath }).then(function (res) {
        if (!res || !res.ok) return [];
        return (res.files || []).map(function (f) {
          var id = 'disk:' + f.relPath;
          _diskCache[id] = { vaultPath: m.v.fullPath, relPath: f.relPath };
          return { id: id, name: f.name, date: f.mtime };
        });
      }).catch(function () { return []; })
      : Promise.resolve([]);
    return suDisco.then(function (disk) {
      /* ── UN DOCUMENTO, UNA RIGA (11/8/26) ────────────────────────────────
         L'archivio e la cartella sono due mondi che non si parlano, e questa
         console li mostra insieme — è il suo scopo. Ma quando lo STESSO
         documento sta in tutti e due (il foglio dei nodi rivisto viene
         archiviato come PDF *e* scritto nel vault) uscivano due righe: una col
         nome del file e i suoi comandi, l'altra col titolo dell'archivio e
         NESSUN comando, perché una voce d'archivio non ha un percorso da aprire.
         Una riga che non offre niente è peggio di una riga che manca.
         Vince il FILE: in INSEGNA si va a prendere un documento, e il file è la
         forma in cui lo si prende. La voce d'archivio resta dov'è l'unico modo
         di raggiungere quel documento (vault di un collega, file cancellato).
         ⚠️ Il confronto è sul nome NORMALIZZATO più il genere: l'archivio
         scrive «Foglio nodi — <Mappa> (rivisto)» e il disco
         «Foglio-nodi-<Mappa> (rivisto).pdf» — stessa cosa, due grafie. Il
         genere è la rete: senza, due documenti diversi con un titolo simile si
         nasconderebbero a vicenda. */
      var sulDisco = {};
      disk.forEach(function (f) {
        sulDisco[_chiaveDoc(f.name, (_diskKind(f.name) || {}).label)] = 1;
      });
      arch = arch.filter(function (a) { return !sulDisco[_chiaveDoc(a.titolo, a.tipo)]; });
      var tutti = arch.concat(disk.map(function (f) {
        var dk = _diskKind(f.name);
        return {
          id: f.id, archivio: false, titolo: f.name, icona: dk.icon,
          data: f.date, tipo: dk.label, dati: !!dk.dati, voce: !!dk.voce,
          qr: /\.html?$/i.test(f.name),
          // un file sul disco eredita classe e materia dalla mappa che lo contiene
          cls: m.cls || '', disc: m.disc || ''
        };
      }));
      /* i file di lavoro (i set .json) scendono in fondo: chi apre questa vista
         cerca un documento da usare in classe, non lo stato interno dell'app */
      return tutti.filter(function (x) { return !x.dati; })
        .concat(tutti.filter(function (x) { return x.dati; }));
    });
  }

  /* I materiali si guardano per GENERE, non tutti impilati: chi cerca la
     sintesi di un ramo non vuole scorrere venti quiz. Un elenco per tipo, con le
     colonne che si ordinano e si allargano come nel resto della console, e i
     file di lavoro (.json) chiusi in fondo. */
  var GRUPPI_MAT = [
    /* Un gruppo solo per le due nature della sintesi — l'editabile e la copia
       con la voce — perché per chi guarda sono lo stesso materiale. A separarle
       è la CONSOLE, non l'elenco: INSEGNA mostra solo quella con la voce,
       ELABORA solo l'editabile (vedi `_natura`). */
    { id: 'sintesi', chiave: 'lt_g_sintesi', testo: 'Sintesi', tipi: ['Sintesi', 'Sintesi con voce'] },
    { id: 'fogli', chiave: 'lt_g_fogli', testo: 'Fogli dei nodi', tipi: ['Foglio nodi'] },
    /* elenco suo: finché non c'era, i file della catena finivano in «Altri
       materiali» insieme a tutto ciò che il classificatore non sa nominare */
    { id: 'catena', chiave: 'lt_g_catena', testo: 'Catena dei perché', tipi: ['Catena dei perché'] },
    /* ── UN ELENCO SOLO PER I QUIZ (11/8/26, richiesta di Giacomo) ───────────
       Erano quattro (scelta multipla · vero/falso · altri quiz · domande
       aperte): quattro intestazioni da scorrere per una domanda sola — «che
       verifica ho per questa mappa?» — e su un progetto normale ognuna portava
       una o due righe. Ora sono un elenco, e a distinguere i generi è il NOME
       della riga, che è esattamente la parola che li nomina («Scelta Multipla»,
       «Vero o Falso», «Domande Aperte»).
       ⚠️ Le domande aperte stavano fuori per una ragione vera — si
       somministrano e si correggono in un altro modo — ma quella distinzione la
       fa il foglio, non l'elenco. */
    {
        id: 'quiz', chiave: 'lt_g_quiz_tutti', testo: 'Quiz',
        tipi: ['Quiz MC', 'Quiz V/F', 'Quiz', 'Domande aperte']
    },
    { id: 'flash', chiave: 'lt_g_flash', testo: 'Flashcard', tipi: ['Flashcard'] },
    { id: 'altro', chiave: 'lt_g_altro', testo: 'Altri materiali', tipi: null },
    { id: 'dati', chiave: 'lt_g_dati', testo: 'File di lavoro', tipi: ['Dati'], chiusa: true }
  ];
  /* Che cosa si ha in mano, in una parola. Due domande in una colonna sola:
     il FORMATO per i file del vault (è un PDF che si stampa? una pagina HTML
     che si condivide?) e la NATURA per le voci dell'archivio, che un'estensione
     non ce l'hanno perché non sono ancora un file: si aprono nell'editor. */
  function _formatoMateriale(m) {
    if (!m) return '—';
    /* ⚠️ «Modificabile» si legge da `modificabile`, non da `archivio` (11/8/26).
       `archivio` dice DA DOVE viene la riga (una voce dell'archivio dei set);
       la domanda che questa colonna pone è un'altra — «lo posso correggere?» —
       e la risposta è sì anche per la sintesi (un file HTML del vault), le
       domande aperte (una voce d'archivio di un altro genere) e il foglio dei
       nodi (la mappa stessa). Confondere le due cose faceva scrivere «PDF» su
       righe che il bottone «Modifica» ce l'avevano eccome. */
    if (m.modificabile) return _t('lt_tipo_edit', 'Modificabile');
    /* Una voce d'archivio dichiara da sé che cosa porta (PDF o HTML): non si
       deduce dal titolo, che un'estensione non ce l'ha. */
    if (m.formato) return m.formato;
    var e = /\.([A-Za-z0-9]+)$/.exec(String(m.titolo || ''));
    return e ? e[1].toUpperCase() : _t('lt_tipo_file', 'File');
  }
  /* ══ QUALE DELLE DUE SINTESI SI VEDE QUI ══════════════════════════════════
     Dal 10/8 la sintesi esce in due file: `Sintesi-<Mappa>.html` (editabile) e
     `Sintesi-voce-<Mappa>.html` (con l'MP3 dentro, ~8 MB, da consegnare).
     Mostrarli entrambi ovunque significherebbe due righe che si somigliano e
     nessun modo di sapere dal nome quale serve. Quindi ognuna delle due console
     mostra la natura che le compete:
       · INSEGNA  → solo quella CON LA VOCE: lì si consegna e si stampa;
       · ELABORA  → solo l'EDITABILE: lì si corregge, e il file da 8 MB non si
                    apre nell'editor.
     ⚠️ Il filtro vale SOLO sulle sintesi. Ogni altro materiale (quiz, fogli,
     catena, flashcard) esiste in un esemplare solo e passa da entrambe: un
     filtro scritto come «tieni ciò che è di questa console» avrebbe fatto
     sparire tutto il resto.
     La regola sta QUI e non nei due chiamanti perché è una sola decisione: se
     domani cambia, cambia in un posto. */
  function filtraSintesi(lista, dove) {
    return (lista || []).filter(function (m) {
      var eSintesi = m.tipo === 'Sintesi' || m.tipo === 'Sintesi con voce';
      if (!eSintesi) return true;
      /* Le voci d'ARCHIVIO non sono file e non hanno una natura: sono la
         sorgente che si corregge, quindi appartengono a ELABORA. */
      if (m.archivio) return dove === 'elabora';
      return dove === 'insegna' ? !!m.voce : !m.voce;
    });
  }

  /* La larghezza della colonna dei comandi, misurata sul CONTENUTO e uguale per
     tutte le tabelle della vista (12/8/26).
     Il conto è quello vero del layout: bottone 34 (`.mm-cella-az
     .mm-btn--icona`), gap 4, imbottitura della cella 12+12 (`.mm-tab td`).
       1 comando → 58 · 2 → 96 · 3 → 134 · 4 → 172
     Erano 88px fissi, tarati su due bottoni: col terzo (scarica · cartella ·
     cestino) il bottone c'era, si poteva perfino cliccare a metà, ma non si
     vedeva — ed è il modo peggiore in cui un comando può mancare, perché non
     sembra un difetto, sembra che la funzione non ci sia.
     ⚠️ Si misura su TUTTE le righe della vista e non su quelle del singolo
     gruppo: gli elenchi stanno impilati, e se ognuno prendesse la sua misura le
     colonne non si allineerebbero da una tabella all'altra. */
  function _larghezzaComandi(lista, dove) {
    var n = (lista || []).reduce(function (max, m) {
      var q = 0;
      if (m.clonabile && dove === 'elabora') q++;
      if (!m.archivio && _diskCache[m.id] && dove !== 'elabora') q += 3;   /* stampa + scarica + cartella */
      if (m.clone) q++;                                                    /* cestino */
      return Math.max(max, q);
    }, 1);
    return (n * 34 + (n - 1) * 4 + 24) + 'px';
  }

  /* `dove` = quale console sta chiedendo gli elenchi ('insegna' | 'elabora').
     Serve solo a scegliere quale delle due sintesi mostrare (vedi
     `filtraSintesi`): tutto il resto — i gruppi per genere, le colonne che si
     spengono quando non variano, i comandi di riga — è identico, ed è il motivo
     per cui questa funzione è UNA. ELABORA la chiama attraverso
     `MappAITeach.tabelleMateriali`; ricopiarla avrebbe voluto dire due elenchi
     da tenere allineati a ogni ritocco di una colonna. */
  function _consTabelleMateriali(lista, conMappa, dove) {
    lista = lista || _cons.materiali || [];
    lista = filtraSintesi(lista, dove || 'insegna');
    /* ── LE VOCI D'ARCHIVIO DEI FOGLI CARTACEI NON SI MOSTRANO IN INSEGNA ────
       (decisione di Giacomo, 13/8). INSEGNA elenca i FILE — ciò che si prende
       in mano per stamparlo o consegnarlo; la SORGENTE di quiz e flashcard
       vive in ELABORA, dove ha il suo cestino e il suo clona. Qui una voce
       d'archivio compariva in due casi, entrambi sbagliati: quando il file
       c'era (la dedup per nome non fonde i titoli dei quiz: ordine diverso,
       genere diverso → riga DOPPIA) e quando il file era stato cancellato dal
       Finder (riga di un materiale che non esiste più, senza nessun comando).
       ⚠️ Vale per i SOLI `PAPER_KINDS`: timeline, dossier e catena una
       sorgente in ELABORA non ce l'hanno — nascosti qui diventerebbero
       irraggiungibili. E anche fra i cartacei restano le voci che portano un
       PDF PROPRIO (`formato: 'PDF'`, il foglio flashcard archiviato come
       data-URI): quelle si aprono dall'archivio stesso, un file nel vault non
       l'hanno mai avuto, e toglierle qui le renderebbe irraggiungibili.
       Kill-switch `mappai_archivio_insegna='1'` → comportamento storico. */
    var _archInsegna = '0';
    try { _archInsegna = localStorage.getItem('mappai_archivio_insegna') || '0'; } catch (e) { }
    if (dove !== 'elabora' && _archInsegna !== '1') {
      lista = lista.filter(function (m) {
        return !(m.archivio && PAPER_KINDS.indexOf(m.kind) >= 0 && m.formato !== 'PDF');
      });
    }
    var noti = {};
    GRUPPI_MAT.forEach(function (g) { (g.tipi || []).forEach(function (t) { noti[t] = 1; }); });
    /* ⚠️ I `.json` non si mostrano in INSEGNA (12/8/26). Sono i set di studio
       come li salva l'app — stato interno, non un documento da portare in
       classe. Il gruppo «File di lavoro» resta dichiarato in `GRUPPI_MAT` ma
       qui non riceve righe, e un gruppo senza righe non si disegna. Il file non
       si tocca: sparisce dall'elenco e resta raggiungibile dalla cartella. */
    if (dove !== 'elabora') lista = lista.filter(function (m) { return !m.dati; });
    /* ── LA COLONNA DEI COMANDI È LA STESSA IN TUTTE LE TABELLE (12/8/26) ────
       Gli elenchi per genere stanno IMPILATI uno sotto l'altro, e finché ognuno
       si misurava la sua ultima colonna le colonne non si allineavano fra loro:
       «Tipo» e «Data» cadevano a x diverse in ogni tabella, e una pila di
       tabelle disallineate si legge come un difetto. Il conto si fa UNA volta,
       sul massimo di TUTTE le righe della vista. */
    var azTutte = _larghezzaComandi(lista, dove);
    return GRUPPI_MAT.map(function (g) {
      /* ⚠️ I `.json` NON entrano in «Stampabili» (11/8/26). Sono i set di studio
         come li salva l'app — stato interno, non un documento da portare in
         classe — e in un elenco che risponde a «che cosa stampo adesso» sono
         righe che non si stampano. Prima stavano in un elenco loro, chiuso
         («File di lavoro»); con un elenco solo quel riparo non c'è più, e
         mescolarli in fondo li avrebbe solo resi rumore.
         Restano raggiungibili dalla cartella: il file non si tocca, sparisce
         dall'elenco. */
      var righe = lista.filter(function (m) {
        return g.tipi ? g.tipi.indexOf(m.tipo) >= 0 : !noti[m.tipo];
      });
      if (!righe.length) return null;
      /* La colonna «Tipo» NON ripete il genere: quello lo dice già il titolo
         dell'elenco, e scriverlo a ogni riga sarebbe spazio tolto al nome.
         Dice invece che COSA si ha in mano — un PDF, una pagina HTML, o un set
         ancora modificabile — che è l'unica cosa che le colonne non dicevano.
         Serve perché nello stesso elenco convivono due nature: il file finito
         nel vault («Quiz-MC-….pdf») e la voce dell'archivio che si può ancora
         correggere («Sistema Terra — Scelta Multipla»), e a occhio erano
         indistinguibili. */
      /* ⚠️ CLASSE E MATERIA SI MOSTRANO SOLO SE VARIANO. Erano incondizionate
         (richiesta del 2/8: «sono le due coordinate con cui il docente ritrova
         le cose»), ma dentro UNA mappa quelle coordinate sono il contesto in cui
         si è già — la briciola dice «Insegna › A chi? › Il Clima» — e le due
         colonne ripetevano «4R» e «Geografia» su ogni riga di ogni elenco,
         portandosi via 270px per non dire niente. La regola non è «toglierle in
         questa vista» ma quella generale: una colonna che ha lo stesso valore in
         tutte le righe non è informazione. Così restano dove servono davvero —
         gli Stampabili di una classe, che uniscono più mappe — senza che nessuno
         debba ricordarsi di accenderle. */
      var distinti = function (campo) {
        var visti = {}, n = 0;
        righe.forEach(function (m) {
          var v = m[campo] || '—';
          if (!visti[v]) { visti[v] = 1; n++; }
        });
        return n;
      };
      var conClasse = distinti('cls') > 1;
      var conMateria = distinti('disc') > 1;
      /* Larghezze rimisurate col contenuto vero: «Tipo» porta PDF · HTML · JSON
         e la parola più lunga è «Modificabile», «Data» una data in cifre. I 132
         e i 120 di prima erano tarati su una tabella a tutta larghezza; dentro
         una colonna del bento sfondavano il riquadro. */
      /* ── LE LARGHEZZE, MISURATE SUL CONTENUTO ────────────────────────────
         Space Mono a 12px è monospaziato: un carattere vale ~7,2px. Alla
         parola più lunga si sommano l'imbottitura della cella (12+12) e la
         freccia dell'ordinamento (~16), che occupa il suo posto anche da
         spenta — se non lo si conta, l'intestazione balla al primo clic.
           TIPO  «Modificabile» = 12 char → 87 + 24 + 16 ≈ 130
           DATA  «11/08/2026»   = 10 char → 72 + 24 + 16 ≈ 116
         I 118 e 104 di prima erano tarati su parole più corte e stringevano
         entrambe le colonne. */
      var colonne = [{ etichetta: _t('lt_col_nome', 'Nome'), larghezza: '' }];
      colonne.push({ etichetta: _t('lt_col_tipo', 'Tipo'), larghezza: '130px' });
      /* nella vista di classe la mappa di provenienza è l'informazione che
         manca di più: senza, due «Sintesi -VERDE.html» sono indistinguibili */
      if (conMappa) colonne.push({ etichetta: _t('lt_col_mappa', 'Mappa'), larghezza: '190px' });
      if (conClasse) colonne.push({ etichetta: _t('rp_class', 'Classe'), larghezza: '96px' });
      if (conMateria) colonne.push({ etichetta: _t('rp_disc', 'Materia'), larghezza: '130px' });
      colonne.push({ etichetta: _t('lt_col_data', 'Data'), larghezza: '116px' });
      /* Due comandi per riga, non uno: la cella cresce di conseguenza. */
      /* ── LA COLONNA DEI COMANDI SI MISURA, NON SI INDOVINA (11/8/26) ──────
         Erano 88px fissi, tarati su DUE comandi. Oggi una riga può averne tre
         (scarica · cartella · cestino) e il terzo finiva TAGLIATO: il bottone
         c'era, si poteva perfino cliccare a metà, ma non si vedeva — ed è il
         modo peggiore in cui un comando può mancare, perché non sembra un
         difetto, sembra che la funzione non ci sia.
         Il conto è quello vero del layout: bottone 34 (`.mm-cella-az
         .mm-btn--icona`), gap 4, imbottitura della cella 12+12 (`.mm-tab td`).
         ⚠️ Si misura sul MASSIMO delle righe, non sulla prima: in un elenco
         convivono voci d'archivio (un comando) e file (tre), e dimensionare
         sulla prima riga taglierebbe tutte le altre. */
      colonne.push({ etichetta: '', ordinabile: false, larghezza: azTutte });
      return {
        id: 'g:' + g.id, titolo: _t(g.chiave, g.testo), chiusa: !!g.chiusa,
        colonne: colonne,
        righe: righe.map(function (m) {
          var celle = [m.titolo, _formatoMateriale(m)];
          if (conMappa) celle.push(m.mappa || '—');
          if (conClasse) celle.push(m.cls || '—');
          if (conMateria) celle.push(m.disc || '—');
          celle.push(m.data ? fmtDate(m.data) : '—');
          /* «Nel Finder» prima del cestino: si arriva al file vero senza passare
             dall'anteprima, ed è il gesto che serve per allegarlo a una mail o
             passarlo con AirDrop.
             ⚠️ Solo per i materiali che un file ce l'hanno: le voci d'archivio
             vivono in localStorage e non hanno niente da mostrare in una
             cartella — un comando che non può riuscire è peggio di un comando
             che manca. */
          var az = [];
          /* ⚠️ I comandi del FILE (scarica, cartella) stanno in INSEGNA e non in
             ELABORA. Là la riga È il file — è la cosa che si prende in mano per
             stamparla o allegarla a una mail; qui la riga è la SORGENTE, e i
             suoi gesti sono aprirla, copiarla, correggerla. Mescolarli faceva
             comparire due icone su alcune righe di ELABORA e nessuna sulle
             altre, che a occhio si legge come un difetto. */
          if (!m.archivio && _diskCache[m.id] && dove !== 'elabora') {
            /* La STAMPA per prima: è il gesto per cui questo elenco esiste. */
            az.push({
              id: 'st:' + m.id, icona: 'printer', ruolo: 'quieto', soloIcona: true,
              etichetta: _t('lt_print', 'Stampa')
            });
            az.push({
              id: 'dl:' + m.id, icona: 'download', ruolo: 'quieto', soloIcona: true,
              etichetta: _t('lt_dl', 'Scarica una copia')
            });
            az.push({
              id: 'fnd:' + m.id, icona: 'folder-open', ruolo: 'quieto', soloIcona: true,
              etichetta: _t('lt_open_finder', 'Apri nel Finder')
            });
          }
          /* ⚠️ NIENTE CESTINO SULL'ORIGINALE (decisione di Giacomo, 11/8/26).
             Una sorgente originale è il documento della mappa: eliminarla da un
             elenco vorrebbe dire buttare il lavoro da cui nascono tutte le
             copie, e con un gesto che sta accanto a «Apri». Si eliminano i
             CLONI — che si creano apposta e si buttano apposta — e i FILE, che
             si rifanno rigenerando.
             `dallaMappa` = si ricostruisce dalla mappa ogni volta (foglio dei
             nodi, catena): lì il cestino non avrebbe nemmeno un oggetto da
             togliere. */
          /* «Clona»: una seconda copia editabile, per scelta esplicita invece
             che per accumulo. Solo su ciò che una sorgente ce l'ha — clonare un
             file non vuol dire niente — e solo in ELABORA, che è dove si
             corregge: in INSEGNA la riga è il documento da portare in classe.
             La regola del nome vive in `mappai-clona-core.js`.
             ⚠️ `clonabile` lo dichiara la CONSOLE, genere per genere, e non si
             deduce da `modificabile`: clonare un set è copiare un oggetto in
             memoria, clonare una sintesi è copiare un FILE del vault, clonare
             le domande aperte è copiare una voce d'archivio. Dove la copia non
             è ancora implementata il bottone non c'è — un comando che non può
             riuscire è peggio di un comando che manca. */
          if (m.clonabile && dove === 'elabora') {
            az.push({
              id: 'clona:' + m.id, icona: 'copy', ruolo: 'quieto', soloIcona: true,
              etichetta: _t('lt_sm_clone', 'Fai una copia')
            });
          }
          /* 🐛 `dallaMappa` vale ANCHE per le copie (dice il genere, non il ruolo):
             usarlo qui lasciava senza cestino le copie del foglio dei nodi e
             della catena, che sono proprio quelle che si buttano. Un documento
             è l'ORIGINALE quando non ha un nome di copia. */
          var originale = !m.clone;
          if (!originale) {
            az.push({
              id: 'del:' + m.id, icona: 'trash-2', ruolo: 'quieto', soloIcona: true,
              etichetta: _t('lt_sm_delete', 'Elimina')
            });
          }
          celle.push({ azioni: az });
          return { id: 'm:' + m.id, chiude: false, celle: celle };
        })
      };
    }).filter(Boolean);
  }

  /* La vista «mappa scelta» a BENTO (flag mappai_console_bento_app): il D1
     dell'officina in produzione. Riga 1 = i comandi (forma `azione`), riga 2 =
     box `materiali` (le stesse `tabelle` del motore, IMPILATE in una colonna:
     a metà larghezza il nome del file si troncava). Il motore disegna da
     `s.bento`; il CONTENUTO dei materiali resta `s.tabelle`.
     ⚠️ PUNTO FERMO (Giacomo, 13/8): questa forma resta. I comandi sono QUATTRO
     — Mappa · Elabora · QR · Cartella — e diventano tre sui Knowledge Graph,
     dove «Elabora» non ha un bersaglio. Le tabelle non tornano su due colonne. */
  function _consBentoMappa(s, p) {
    var soloKg = p.type === 'kg';
    var gen = soloKg ? 'network' : 'git-merge';   /* icona del genere, come la sidebar */
    var az = [
      { id: 'apri', et: _t('lt_cons_apri_mappa', 'Mappa'), forma: 'azione', icona: gen, aiuto: _t('lt_cons_tip_apri', 'Apre la visualizzazione della mappa.') }
    ];
    /* ELABORA solo sulle MindMap (come nel ramo storico): su un KG il suo
       empty-state finisce nella landing nascosta dietro la mappa. */
    if (!soloKg) az.push({ id: 'elabora', et: _t('lt_cons_elabora', 'Elabora'), forma: 'azione', icona: 'hexagon', aiuto: _t('lt_cons_tip_elab', 'Apre ELABORA sulla fonte e sui documenti di questa mappa.') });
    az.push({ id: 'qr', et: 'QR', forma: 'azione', icona: 'qr-code', chiude: false, aiuto: _t('lt_cons_tip_qr', 'Condivide un materiale di questa mappa con la classe via codice QR.') });
    az.push({ id: 'cartella', et: _t('lt_cons_cartella', 'Cartella'), forma: 'azione', icona: 'folder', chiude: false, aiuto: _t('lt_cons_tip_folder', 'Apre la cartella del vault nel Finder.') });
    var vuoto = _cons.materiali === null
      ? _t('lt_cons_carico_mat', 'Cerco i materiali di questa mappa…')
      : _t('lt_no_materials', 'Nessun materiale archiviato. Genera una Sintesi, un Dossier, un Foglio nodi o una Timeline: compariranno qui.');
    s.bento = [
      {
        id: 'mappa-azioni', nuda: true, span: 4, altezza: 145,
        stile: { bg: 'transparent', testo: '#404040', bordoPx: 0 },
        bottoni: { bg: '#f1f4f8', testo: '#404040', hoverBg: '#41e6aa', hoverTesto: '#0b0b0b' },
        layout: { colonneVoci: az.length },
        voci: az
      },
      {
        id: 'mappa-materiali', nuda: true, span: 4,
        stile: { bg: 'transparent', testo: '#404040', bordoPx: 0 },
        voci: [{ id: 'mat', et: _t('lt_cons_materiali_gr', 'Materiali'), forma: 'materiali', vuoto: vuoto }]
      }
    ];
    if (_cons.materiali && _cons.materiali.length) {
      var tabsB = _consTabelleMateriali();
      /* il filtro delle voci d'archivio cartacee (13/8) può svuotare tutto:
         senza tabelle il box dei materiali mostra il messaggio `vuoto`,
         non un'area bianca */
      if (tabsB.length) s.tabelle = tabsB;
    }
  }

  function _consSchema() {
    var cls = _consClasse(), mat = _consMateria();
    var progetti = _consFiltrate();
    var p = _consMappaScelta();

    var nav = [{ gruppo: _t('lt_cons_mappe', 'Mappe') }];
    if (_cons.mappe === null) {
      nav.push({ id: 'vuoto', etichetta: _t('lt_cons_cerco', 'Cerco le mappe…'), icona: 'loader' });
    } else if (!progetti.length) {
      nav.push({ id: 'vuoto', etichetta: _t('lt_cons_nessuna', 'Nessuna mappa'), icona: 'circle-dashed' });
    } else {
      progetti.forEach(function (x) {
        nav.push({
          id: x.id, etichetta: x.nome, attiva: _cons.voce === x.id,
          icona: x.type === 'kg' ? 'network' : 'git-merge',
          /* «NUOVO» = generato in questa sessione e mai ancora aperto. La lista
             è la stessa di ELABORA (`MappAIGen`): il bollino sparisce dai due
             elenchi insieme, al primo clic. */
          badge: (window.MappAIGen && MappAIGen.eNuovo && MappAIGen.eNuovo(x)) ? _t('ec_nuovo', 'NUOVO') : ''
        });
      });
    }
    /* Le viste della classe sono quelle che la landing sa già disegnare.
       «File condivisi» non c'è più: pensionata il 13/8 (vedi la nota dove
       stava il suo codice). */
    nav.push({ gruppo: _t('lt_cons_materiali_gr', 'Materiali') });
    VISTE_CLASSE.forEach(function (v) {
      nav.push({ id: v.id, etichetta: _t(v.chiave, v.testo), icona: v.icona, attiva: _cons.voce === v.id });
    });

    var s = {
      titolo: _t('ui_landing_teach', 'Insegna'),
      icona: 'presentation', taglia: 'xl', layout: 'console', piena: true,
      invio: false, veloChiude: false,
      /* col cablaggio bento il chip sparisce: il contesto classe·materia vive nel
         percorso (Cosa · A chi? · Materia), montato dopo il render da `montaCascata` */
      contesto: _bentoApp() ? [] : [
        { id: 'classe', icona: 'graduation-cap', vuoto: !cls, etichetta: cls ? cls.name : _t('lt_cons_classe_vuota', 'Classe') },
        { id: 'materia', icona: 'book-open', vuoto: !mat, etichetta: mat || _t('lt_cons_materia_vuota', 'Materia') }
      ],
      nav: nav,
      /* Con un documento aperto la colonna si ritira: lo schermo è tutto per il
         foglio che si sta guardando. Chiudendo l'anteprima torna (richiesta di
         Giacomo, 2/8) — la maniglia resta lì per riaprirla comunque. */
      navChiusa: !!_cons.mat,
      /* niente «Chiudi» in testata: la × c'è già, e due uscite a due centimetri
         l'una dall'altra sono due modi di sbagliare (decisione del 2/8 su F2) */
      sezioni: []
    };

    /* ① un materiale aperto: la tela lo mostra e la barra prende il posto dei
       filtri — Salva · Stampa · QR · Chiudi, gli stessi comandi della finestra
       staccata (token --mm-doc-*), qui come azioni del motore. */
    if (_cons.mat) {
      s.sottotitolo = (p ? p.nome + ' · ' : '') + _cons.mat.titolo;
      s.sezioni.push({
        id: 'barra', colonna: 'barra',
        azioni: [
          { id: 'ind', etichetta: _t('lt_cons_indietro', 'Indietro'), icona: 'arrow-left', chiude: false },
          { id: 'stampa', etichetta: _t('lt_cons_stampa', 'Stampa'), icona: 'printer', ruolo: 'primario', chiude: false },
          { id: 'qr', etichetta: _t('lt_cons_qr', 'Condividi (QR)'), icona: 'qr-code', chiude: false },
          { id: 'finder', etichetta: _t('lt_open_finder', 'Apri nel Finder'), icona: 'folder', chiude: false }
        ]
      });
      s.tela = { id: 'doc', segnaposto: _t('lt_cons_carico', 'Apro il materiale…') };
      return s;
    }

    /* ② una mappa scelta: i suoi materiali, e gli avvii rapidi che prima
       stavano in fondo alla landing senza sapere di quale mappa parlassero. */
    if (p) {
      s.sottotitolo = p.nome + (cls ? ' · ' + cls.name : '');
      /* Col cablaggio bento la vista «mappa scelta» diventa il D1 dell'officina:
         una riga di 4 comandi (Mappa · Elabora · QR · Cartella) al posto del
         banner, e i materiali a due colonne. Il ramo storico resta sotto. */
      if (_bentoApp()) { _consBentoMappa(s, p); return s; }
      /* UNA riga di comandi, senza riquadro: aprire la mappa, la sua cartella,
         elaborarla e lanciarci sopra un'attività sono la stessa famiglia di
         gesti (spezzarli in due riquadri grigi li faceva sembrare due decisioni
         diverse). «Studio attivo» e «Lavagna» qui avviano un'attività NUOVA. */
      /* ELABORA lavora solo sulle MindMap (`MappAIElabora.hasMap`): su un
         Knowledge Graph il suo empty-state finisce dentro la landing, che in
         quel momento è nascosta dietro la mappa — il bottone sembrava aprire la
         mappa e basta. Meglio non offrirlo, e dire perché. */
      var azioni = [
        { id: 'apri', etichetta: _t('lt_cons_apri_mappa', 'Mappa'), icona: 'map', ruolo: 'primario' },
        { id: 'cartella', etichetta: _t('lt_cons_finder', 'Finder'), icona: 'folder', chiude: false }
      ];
      var soloKg = p.type === 'kg';
      if (!soloKg) azioni.push({ id: 'elabora', etichetta: _t('lt_cons_elabora', 'Elabora'), icona: 'wand-2' });
      azioni.push({ id: 'live', etichetta: _t('ui_qs_live', 'Studio attivo'), icona: 'radio' });
      azioni.push({ id: 'collab', etichetta: _t('ui_qs_collab', 'Lavagna'), icona: 'presentation' });
      s.sezioni.push({
        id: 'comandi', nuda: true, azioni: azioni,
        sotto: soloKg ? _t('lt_cons_no_elab', 'ELABORA lavora sulle MindMap: questa è un Knowledge Graph.') : ''
      });
      if (_cons.materiali === null) {
        s.sezioni.push({ id: 'attesa', nuda: true, testo: _t('lt_cons_carico_mat', 'Cerco i materiali di questa mappa…') });
      } else if (!_cons.materiali.length) {
        s.sezioni.push({
          id: 'vuoti', nuda: true,
          testo: _t('lt_no_materials', 'Nessun materiale archiviato. Genera una Sintesi, un Dossier, un Foglio nodi o una Timeline: compariranno qui.')
        });
      } else {
        s.tabelle = _consTabelleMateriali();
        /* Il filtro delle voci d'archivio cartacee (13/8) può svuotare TUTTE
           le tabelle pur con materiali in lista (mappa senza vault, solo fogli
           generati): senza questo ramo l'area resterebbe BIANCA, che si legge
           come un difetto — si dice invece che qui non c'è niente. */
        if (!s.tabelle.length) {
          s.tabelle = undefined;
          s.sezioni.push({
            id: 'vuoti', nuda: true,
            testo: _t('lt_no_materials', 'Nessun materiale archiviato. Genera una Sintesi, un Dossier, un Foglio nodi o una Timeline: compariranno qui.')
          });
        }
      }
      return s;
    }

    /* ③ le viste della classe: qui il motore non sa disegnare (sono le tabelle
       che la landing già produce), quindi la tela le ospita così come sono. */
    var vista = _vistaClasse(_cons.voce);
    if (vista) {
      s.sottotitolo = _t(vista.chiave, vista.testo) + ' · ' + (cls ? cls.name : _t('lt_cons_tutte', 'Tutte le classi'));
      if (vista.id === 'lavagna') _vistaLavagna(s, cls);
      else if (vista.id === 'live') _vistaLive(s);
      else _vistaStampabili(s);
      return s;
    }

    /* ④ nessuna voce scelta: si dice che cosa fare. Col cablaggio bento l'area
       resta vuota (il sottotitolo dice già di scegliere una mappa): il paragrafo
       «Da dove si comincia» era testo di corollario che Giacomo ha chiesto di
       togliere. Il ramo storico lo mantiene. */
    s.sottotitolo = cls
      ? cls.name + (mat ? ' · ' + mat : '') + ' · ' + progetti.length + ' ' + _t('lt_cons_mappe_min', 'mappe')
      : _t('lt_cons_scegli_classe', 'Scegli una classe per restringere le mappe');
    if (!_bentoApp()) {
      s.sezioni.push({
        id: 'intro', titolo: _t('lt_cons_dainiziare', 'Da dove si comincia'),
        testo: _t('lt_cons_intro', 'Scegli una mappa nella colonna: sotto compaiono i materiali del suo vault — sintesi, quiz, fogli, fonte originale — e ognuno si apre qui dentro, pronto da stampare o da condividere via QR.')
      });
    }
    return s;
  }

  /* Tutte le tabelle dell'area console partono COLLASSATE (Giacomo, 8/8): il
     docente apre il genere che gli serve invece di scorrere sei elenchi già
     aperti. Vale per OGNI vista (materiali, Live, Lavagna, Stampabili) perché
     filtra lo schema quando lo si apre/ridisegna, non dentro ogni produttore.
     Solo le tabelle con titolo si collassano (senza, non c'è su cosa cliccare). */
  function _consChiuse() {
    var sc = _consSchema();
    (sc.tabelle || []).forEach(function (t) { if (t && t.titolo) t.chiusa = true; });
    return sc;
  }

  /* ── Le tre viste della colonna «Materiali» ──────────────────────────────
     Prima clonavano l'innerHTML delle sezioni della landing dentro la tela:
     funzionava, ma erano tabelle di un'altra pagina prestate a questa — senza
     ordinamento, senza colonne regolabili, e legate a contenitori che potevano
     non esistere. Ora sono schemi veri del motore. */

  // ① LAVAGNA: le due scelte del vecchio wizard, le sessioni da riprendere e le
  //    tessere della classe. Avviare da qui è avviare davvero: `CT.avvia`.
  function _vistaLavagna(s, cls) {
    var sess = _cons.sessioni;
    s.sezioni.push({
      id: 'lav-opz', nuda: true, titolo: _t('lt_lav_nuova', 'Nuova sessione'),
      campi: [
        {
          id: 'login', tipo: 'scelta', etichetta: _t('cl_login', 'Accesso allievi'),
          valore: _cons.lavLogin || 'group',
          opzioni: [
            { valore: 'group', etichetta: _t('cl_login_grp', 'A gruppi (3 emoji)') },
            { valore: 'individual', etichetta: _t('cl_login_ind', 'Individuale (roster della classe attiva)') }
          ]
        },
        {
          id: 'rete', tipo: 'scelta', etichetta: _t('lt_lav_rete', 'Rete degli allievi'),
          valore: _cons.lavRete || (window.MappAINetMode ? window.MappAINetMode.get() : 'lan'),
          opzioni: [
            { valore: 'lan', etichetta: _t('lt_lav_lan', 'Wi-Fi dell’aula') },
            { valore: 'web', etichetta: _t('lt_lav_web', 'Internet condiviso') }
          ],
          aiuto: _t('cl_net_note', 'Rete: usa l’hotspot del PC o un router d’aula. Le reti scolastiche spesso bloccano il traffico tra dispositivi.')
        }
      ],
      azioni: [
        { id: 'lav-start', etichetta: _t('lt_lav_avvia', 'Avvia la Lavagna'), icona: 'play', ruolo: 'primario', chiude: false },
        { id: 'lav-cred', etichetta: _t('lt_lav_cred', 'Foglio credenziali'), icona: 'id-card', chiude: false }
      ],
      sotto: cls ? '' : _t('lt_lav_senza_classe', 'Senza una classe attiva è disponibile solo l’accesso a gruppi.')
    });
    if (sess === null) {
      s.sezioni.push({ id: 'lav-attesa', nuda: true, testo: _t('lt_lav_cerco', 'Cerco le sessioni salvate…') });
      return;
    }
    if (!sess.length) return;
    s.tabelle = [{
      id: 'lav-sess', titolo: _t('lt_lav_riprendi', 'Sessioni da riprendere'),
      colonne: [
        { etichetta: _t('lt_col_mappa', 'Mappa'), larghezza: '' },
        { etichetta: _t('rp_class', 'Classe'), larghezza: '120px' },
        { etichetta: _t('rp_disc', 'Materia'), larghezza: '150px' },
        { etichetta: _t('lt_col_data', 'Data'), larghezza: '120px' },
        { etichetta: _t('lt_col_gruppi', 'Gruppi'), larghezza: '90px' },
        { etichetta: _t('lt_col_accesso', 'Accesso'), larghezza: '125px' }
      ],
      /* del session.json si mostra SOLO ciò che serve a riconoscerla: dentro ci
         sono anche i token della sessione, che non hanno niente da fare in una
         tabella */
      righe: sess.map(function (x) {
        return {
          id: 'res:' + x.dir, chiude: false,
          celle: [
            x.name || 'Lavagna', x.className || '—',
            /* la materia non sta nella sessione: si ricava dalla mappa, che è
               l'unico posto dove quella coppia è registrata */
            discOfMap(x.name, null) || '—',
            x.startedAt ? fmtDate(x.startedAt) : '—',
            String(x.groupCount || 0),
            x.loginMode === 'individual' ? _t('cl_login_ind_s', 'individuale') : _t('cl_login_grp_s', 'gruppi')
          ]
        };
      })
    }];
  }

  // ② ATTIVITÀ LIVE: da dove si lancia, e che cosa è già stato fatto.
  function _vistaLive(s) {
    s.sezioni.push({
      id: 'live-avvii', nuda: true, titolo: _t('lt_live_nuova', 'Nuova attività'),
      azioni: [
        { id: 'live-quiz', etichetta: _t('lt_live_quiz', 'Quiz a distanza'), icona: 'list-checks', ruolo: 'primario', chiude: false },
        { id: 'live-tutor', etichetta: _t('lt_live_tutor', 'Rispondi e Domanda'), icona: 'message-square', chiude: false }
      ],
      testo: _t('lt_live_intro', 'Gli allievi entrano dal telefono con le loro credenziali: il quiz si corregge da sé, la scrittura col tutor consegna testo e trascrizione.')
    });
    var reg = _cons.report;
    if (reg === null) { s.sezioni.push({ id: 'live-attesa', nuda: true, testo: _t('lt_live_cerco', 'Cerco i report…') }); return; }
    if (!reg.length) { s.sezioni.push({ id: 'live-vuoto', nuda: true, testo: _t('lt_live_nessuno', 'Nessuna attività svolta finora.') }); return; }
    s.tabelle = [{
      id: 'live-rep', titolo: _t('lt_live_report', 'Attività già svolte'),
      colonne: [
        { etichetta: _t('lt_col_attivita', 'Attività'), larghezza: '150px' },
        { etichetta: _t('lt_col_mappa', 'Mappa'), larghezza: '' },
        { etichetta: _t('rp_class', 'Classe'), larghezza: '120px' },
        { etichetta: _t('rp_disc', 'Materia'), larghezza: '150px' },
        { etichetta: _t('lt_col_data', 'Data'), larghezza: '120px' },
        { etichetta: _t('lt_col_part', 'Partecipanti'), larghezza: '115px' },
        { etichetta: '', larghezza: '58px', ordinabile: false }
      ],
      righe: reg.map(function (r, i) {
        return {
          id: 'rep:' + i, chiude: false,
          celle: [
            r.activity || '—', r.map || '—', r.cls || '—',
            r.disc || discOfMap(r.map, null) || '—',
            r.date ? fmtDate(r.date) : '—',
            (r.joined != null ? r.joined : '—') + (r.total ? '/' + r.total : ''),
            {
              azioni: [{
                id: 'repdir:' + i, icona: 'folder', ruolo: 'quieto', soloIcona: true,
                etichetta: _t('lt_open_finder', 'Apri nel Finder')
              }]
            }
          ]
        };
      })
    }];
  }

  // ③ STAMPABILI: tutto ciò che è già stato prodotto per le mappe del contesto,
  //    per genere. Copre la CLASSE, non la singola mappa: è il posto dove si va
  //    quando si prepara la lezione e non si sa ancora da quale mappa pescare.
  function _vistaStampabili(s) {
    var tutti = _cons.stampabili;
    if (tutti === null) { s.sezioni.push({ id: 'st-attesa', nuda: true, testo: _t('lt_cons_carico_mat', 'Cerco i materiali di questa mappa…') }); return; }
    if (!tutti.length) { s.sezioni.push({ id: 'st-vuoto', nuda: true, testo: _t('lt_no_materials', 'Nessun materiale archiviato. Genera una Sintesi, un Dossier, un Foglio nodi o una Timeline: compariranno qui.') }); return; }
    s.tabelle = _consTabelleMateriali(tutti, true);
    /* stesso rimedio della vista mappa: il filtro dei cartacei d'archivio può
       svuotare tutte le tabelle — meglio dirlo che lasciare l'area bianca */
    if (!s.tabelle.length) {
      s.tabelle = undefined;
      s.sezioni.push({ id: 'st-vuoto', nuda: true, testo: _t('lt_no_materials', 'Nessun materiale archiviato. Genera una Sintesi, un Dossier, un Foglio nodi o una Timeline: compariranno qui.') });
    }
  }

  function _consTela() {
    var box = document.querySelector('.mm-box');
    return box ? box.querySelector('[data-tela]') : null;
  }
  /* Il documento entra in un iframe: è l'unico modo di mostrare un foglio di
     stampa (col SUO CSS) senza che le sue regole colino nella console. */
  /* ⚠️ Il foglio si porta dentro la SUA barra di comandi: giusta quando lo si
     apre da solo (è il file che finisce sul computer dello studente), di troppo
     qui, dove sopra c'è già quella della console — due barre impilate. La
     spegne `MappAIDocBar.nascondiInIframe` al `load`: si agisce da FUORI e non
     si evita di emetterla perché i file sono già scritti sul disco e nessuno li
     riscriverà. Vale per `srcdoc` (stessa origine); con un `src` `data:`
     l'origine è opaca, la funzione risponde `false` e la barra doppia resta —
     meno grave che non mostrare il documento.
     ECCEZIONE `#ap-audio`, e vale SOLO per l'audio INCORPORATO: la voce
     naturale dei materiali condivisi con la classe viaggia dentro il documento
     come `data:` URI, si suona da quella barra e la barra della console non sa
     suonarla — meglio due barre che un audio irraggiungibile.
     La sintesi scritta nel VAULT è un altro caso: il suo `<source>` punta
     all'MP3 fratello con un percorso RELATIVO (vault leggero, l'audio è un file
     a sé). Dentro `srcdoc` un percorso relativo non ha un URL su cui
     risolversi, quindi quel player resta muto comunque: tenerne la barra
     rimetterebbe la barra doppia su quasi tutte le sintesi, cioè il difetto che
     questo blocco esiste per togliere. Quindi si guarda il `src`, non la
     presenza dell'elemento. */
  /* `read-vault-file` ritorna SOLO base64 (è nato per i PDF). Il testo va
     decodificato come UTF-8: `atob` da solo rompe gli accenti («Elettricità» →
     «ElettricitÃ»), e il vecchio `decodeURIComponent(escape(atob(…)))` lancia su
     certe sequenze di byte invece di degradare. */
  function _testoDaBase64(b64) {
    try {
      var bin = atob(b64);
      var buf = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
      return new TextDecoder('utf-8').decode(buf);
    } catch (e) { return ''; }
  }
  /* `true` solo quando l'audio della voce naturale sta DENTRO il documento
     (`data:`), cioè quando la barra che se lo porta dietro ha davvero qualcosa
     da suonare. Un `<source src="Sintesi-audio-….mp3">` è il riferimento al
     file fratello nel vault: in `srcdoc` non si risolve e resta muto.
     ⚠️ Si legge l'ATTRIBUTO, non la proprietà `.src`: la proprietà risolve da
     sé il percorso relativo e restituirebbe sempre un URL assoluto — non
     direbbe mai «non è `data:`», e il controllo non distinguerebbe niente. */
  function _audioIncorporato(doc) {
    var a = doc.getElementById('ap-audio');
    if (!a) return false;
    var s = a.getAttribute('src') || '';
    if (!s) { var so = a.querySelector('source'); s = (so && so.getAttribute('src')) || ''; }
    return /^data:/i.test(s.trim());
  }
  function _consMostra(html, src) {
    var tela = _consTela(); if (!tela) return;
    tela.innerHTML = '';
    var f = document.createElement('iframe');
    f.style.cssText = 'width:100%;height:100%;border:0;background:#fff';
    f.addEventListener('load', function () {
      if (!window.MappAIDocBar || !window.MappAIDocBar.nascondiInIframe) return;
      var d = null;
      try { d = f.contentDocument; } catch (e) { return; }   /* origine opaca */
      /* La taglia del testo PRIMA dell'eccezione qui sotto, e prima di ogni
         ritorno: le sintesi scritte prima del 10/8 portano i corpi vecchi, e
         qui si vedrebbero più piccole che in ELABORA — due superfici che
         mostrano LO STESSO file in due taglie. Non fa nulla sui documenti già
         nuovi, e nulla su ciò che non è una sintesi. */
      if (window.MappAIDocBar.scalaTesto) window.MappAIDocBar.scalaTesto(f);
      if (d && _audioIncorporato(d)) {
        /* Barra del documento snellita, non tolta: è l'unica che suona l'MP3
           incorporato, ma marchio e «Stampa» li ha già la barra di sopra. */
        if (window.MappAIDocBar.snellisciInIframe) window.MappAIDocBar.snellisciInIframe(f);
        return;
      }
      window.MappAIDocBar.nascondiInIframe(f);
    });
    if (src) f.src = src; else f.srcdoc = html || '';
    tela.appendChild(f);
  }
  function _consApriMateriale() {
    var m = _cons.mat; if (!m) return;
    if (m.archivio) {
      var d = window.MappAIStudyDocs && window.MappAIStudyDocs.get(m.docId);
      if (d && d.html) return _consMostra(d.html);
      if (d && d.pdf) return _consMostra(null, d.pdf);
      return _consMostra('<p style="font-family:monospace;padding:24px">' +
        esc(_t('lt_doc_missing', 'Documento non disponibile.')) + '</p>');
    }
    var loc = _diskCache[m.id];
    var api = window.electronAPI;
    if (!loc || !api || !api.readVaultFile) {
      return _consMostra('<p style="font-family:monospace;padding:24px">' +
        esc(_t('fx_desktop', 'Disponibile solo nell\'app desktop.')) + '</p>');
    }
    api.readVaultFile({ vaultPath: loc.vaultPath, relPath: loc.relPath }).then(function (res) {
      if (!res || !res.ok) {
        return _consMostra('<p style="font-family:monospace;padding:24px">' +
          esc(_t('lt_cons_ko', 'Non riesco ad aprire questo file') + (res && res.error ? ': ' + res.error : '')) + '</p>');
      }
      /* ⚠️ Un HTML entra come TESTO (`srcdoc`), non come `data:` URI: un
         `data:` ha origine OPACA e da fuori non si tocca — lì
         `nascondiInIframe` risponde `false` e la barra doppia resta. Ed è il
         caso normale di questa console, dove i materiali vengono dal disco.
         PDF e audio restano `data:`: vanno al visualizzatore di Chromium, che
         `srcdoc` non sa costruire. */
      if (/\.html?$/i.test(loc.relPath)) return _consMostra(_testoDaBase64(res.base64));
      var mime = /\.pdf$/i.test(loc.relPath) ? 'application/pdf'
        : /\.mp3$/i.test(loc.relPath) ? 'audio/mpeg' : 'application/octet-stream';
      _consMostra(null, 'data:' + mime + ';base64,' + res.base64);
    });
  }
  /* La tela serve solo all'ANTEPRIMA di un documento: le tre viste della classe
     sono schemi del motore, non più HTML preso in prestito dalla landing. */
  function _consDipingiTela() {
    if (_cons.mat) _consApriMateriale();
  }

  /* `voceIniziale` = la mappa da riaprire (segnalibro). Si applica DOPO la
     scansione del disco: prima che le mappe siano arrivate quell'id non esiste
     ancora, e sceglierlo non avrebbe effetto. */
  /* La console INSEGNA aperta si aggiorna da FUORI quando il disco cambia: il suo
     `ridisegna` vive dentro `openConsoleInsegna`, quindi si lascia qui un appiglio
     (impostato all'apertura, azzerato alla chiusura). Senza, una mappa generata
     mentre la console è aperta non compariva fino a riaprirla. */
  var _consAggiorna = null;
  function openConsoleInsegna(voceIniziale) {
    if (!MM()) { setMode('teach'); return; }
    /* ⚠️ La console DICHIARA la sua sezione, e deve farlo QUI: `setMode('teach')`
       lo faceva per conto suo, ma chi apre la console per altre strade — il
       segnalibro dell'uscita verso una mappa, una chiamata diretta — la lasciava
       muta, e la briciola in alto non sapeva dove si era: mostrava il solo
       «Cosa» invece di «Insegna». */
    try { document.documentElement.dataset.manSezionePendente = 'teach'; } catch (e) { }
    _cons = { voce: '', mat: null, materiali: null, mappe: null, sessioni: null, report: null, stampabili: null, lavLogin: '', lavRete: '' };
    var ridisegnaCons = null;

    function rifai() { if (ridisegnaCons) { var box = ridisegnaCons(_consChiuse()); _consDipingiTela(); montaCascata(box); } }
    /* La cascata del percorso al posto del chip (Cosa · A chi? · Materia · mappa),
       dietro il flag `mappai_console_bento_app`. Si rimonta a ogni rifai (le tendine
       si ricostruiscono con lo stato aggiornato). Riusa la logica del chip: classe,
       materia e allievo attivi filtrano le mappe come `__ctx-classe`. */
    /* ── UNA SOLA toolbar per tutte le sezioni — UN SOLO MECCANISMO (8/8 sera) ──
       Prima c'erano due strade per la stessa barra: INSEGNA SPOSTAVA il nodo
       `#header-utils` dentro la testata della console (`_huEmbed`, con
       `_huRestore` alla chiusura), mentre ELABORA e la Cabina ricostruiscono le
       briciole sul posto con `montaPercorso(box, spec)`. Stesso risultato a
       schermo, due implementazioni da tenere allineate — e la strada «sposta il
       nodo» è quella che si era già rotta: `#header-utils` è condiviso con la
       landing e `mappai-console-manifesto.js` reagisce a ogni mutazione del DOM
       → rimpallo, renderer bloccato.
       Ora INSEGNA fa come le altre: **niente nodi spostati**. Le briciole
       nascono in `.mm-head__testi` e il pallino della testata è già il bottone
       Cabina. L'allineamento con la landing non è più una taratura: la regola
       `padding-left:28px` + `align-items:center` in console-manifesto.css vale
       per la testata di OGNI console → INSEGNA coincide per costruzione.
       ⚠️ Se serve rimettere mano qui: la via giusta è aggiungere alla testata
       della console, non trasferirle un nodo della landing. */
    function _huRestore() {
      /* la landing riprende la barra: l'evento forza `montaCascataLanding`
         (stile-manifesto) a ricostruirla con le SUE callback azzerando la firma.
         Resta anche senza spostamenti: chiudendo la console la landing torna
         visibile e le sue briciole vanno ridipinte sullo stato aggiornato. */
      try { document.dispatchEvent(new CustomEvent('mappai-active-class-changed')); } catch (e) { }
    }
    function montaCascata(node) {
      if (!_bentoApp()) return;
      var CB = window.MappAIConsoleBento;
      /* il box è quello passato dal render (motore.ridisegna restituisce il NUOVO
         box a ogni giro): querySelector prenderebbe il primo, sbagliato se più
         console sono impilate */
      if (!node || !CB || !CB.montaPercorso || !CB.specContesto) return;
      var CL = window.MappAIClasses; if (!CL) return;
      var p = _consMappaScelta();
      function reset(fn) { try { fn(); } catch (e) { } _cons.voce = ''; _cons.mat = null; _cons.materiali = null; rifai(); }
      /* la rivelazione progressiva e le etichette-valore le calcola specContesto
         dallo stato (uguale a landing e console). Cambiare il destinatario azzera
         la materia (Giacomo): torna il prompt «Materia». */
      var _cbCtx = {
        onCosa: function (m) {
          try {
            if (m === 'teach') return;                 // già in INSEGNA
            setMode(m);                                // porta la landing sotto su Crea/Elabora
            /* la console INSEGNA è un overlay a schermo pieno: cambiare la
               sezione sotto NON basta, va CHIUSA o si resta "bloccati" in
               INSEGNA (Giacomo, bug 2). Si esce per la sua stessa via
               (`.mm-close` = `__chiudi` → `chiudi(null)`): il `.then` di open()
               atterra sulla landing già portata su Crea/Elabora, senza
               segnalibro (quello serve solo all'uscita verso una mappa). */
            var x = node && node.querySelector && node.querySelector('[data-azione="__chiudi"]');
            if (x) x.click();
          } catch (e) { }
        },
        onGenerico: function () { reset(function () { CL.setActive(''); if (CL.setActiveStudent) CL.setActiveStudent(null); if (CL.setActiveDiscipline) CL.setActiveDiscipline(''); }); },
        onClasse: function (c) { reset(function () { CL.setActive(c.id); if (CL.setActiveStudent) CL.setActiveStudent(null); if (CL.setActiveDiscipline) CL.setActiveDiscipline(''); }); },
        onAllievo: function (pp) { reset(function () { if (CL.setActiveStudent) CL.setActiveStudent(pp); if (CL.setActiveDiscipline) CL.setActiveDiscipline(''); }); },
        onMateria: function (m) { reset(function () { CL.setActiveDiscipline(m); }); },
        onNuovaMateria: function () { _promptNuovaMateria(function (v) { reset(function () { CL.setActiveDiscipline(v); }); }); }
      };
      var livelli = CB.specContesto(_cbCtx);
      /* ── LA BRICIOLA SI COMPLETA QUANDO SCEGLI UN PROGETTO (Giacomo, 14/8) ──
         Finché non hai scelto, in alto resta la sola prima domanda: le altre due
         sono scese in testa alla COLONNA, dove filtrano l'elenco, e tenerle
         anche qui sarebbe lo stesso comando in due posti mentre si sta ancora
         cercando. Scelto il progetto, la testata dice il percorso INTERO —
         Insegna › classe › materia › progetto — e ogni pezzo resta cliccabile.
         L'ultima briciola ha un MENU (le mappe del filtro): è la via breve per
         passare da una mappa all'altra senza tornare alla colonna. */
      if (!p) livelli = livelli.slice(0, 1);
      else {
        var _altre = _consFiltrate();
        /* ⚠️ Il menu solo se c'è davvero altro fra cui scegliere: dopo
           l'allineamento il filtro si stringe spesso su UNA mappa, e una
           tendina con una voce sola — già spuntata — si legge come rotta.
           Con una sola mappa la briciola resta un'etichetta; per allargare c'è
           «mostra tutti» in fondo ai filtri. */
        livelli.push(_altre.length > 1
          ? {
            et: p.nome,
            menu: {
              tipo: 'lista',
              voci: _altre.map(function (mm2) {
                return {
                  et: mm2.nome, on: mm2.id === p.id,
                  onPick: function () { if (mm2.id !== p.id) scegliMappa(mm2.id); }
                };
              })
            }
          }
          : { statico: p.nome, qui: true });
      }
      /* ⚠️ `node` = il BOX: montaPercorso marca il box `mn-percorso` (la veste
         allora NON gli rimette il chip) e ne toglie l'eventuale chip. Nessun
         `testiEl`: le briciole vanno in `.mm-head__testi` della testata, come
         in ELABORA e nella Cabina — un solo meccanismo. */
      CB.montaPercorso(node, { livelli: livelli });
      /* Le stesse due domande in testa alla COLONNA, dove sta l'elenco che
         filtrano (14/8). Stesse callback della briciola: un solo stato, due
         rese — e chi apre INSEGNA vede subito che l'elenco si può restringere. */
      if (CB.montaFiltriSidebar) {
        var _tot = _consMappe().length, _vis = _consFiltrate().length;
        CB.montaFiltriSidebar(node, _cbCtx, { visibili: _vis, totale: _tot });
      }
    }
    function scegliMappa(id) {
      _cons.voce = id; _cons.mat = null; _cons.materiali = null;
      var _m0 = (_consMappe() || []).filter(function (x) { return x.id === id; })[0] || null;
      /* Scegliere una mappa ALLINEA il filtro alla sua classe e materia (stessa
         regola di ELABORA, 14/8): senza, la briciola in alto resterebbe sulla
         domanda «A chi?» mentre a schermo c'è già il progetto — e la sequenza
         non si completerebbe mai. */
      if (_m0 && MappAITeach.allineaContestoA) { try { MappAITeach.allineaContestoA(_m0); } catch (e) { } }
      /* visto: il bollino «NUOVO» sparisce al PRIMO clic */
      try { if (_m0 && window.MappAIGen && MappAIGen.visto) MappAIGen.visto(_m0); } catch (e) { }
      rifai();
      var m = _consMappaScelta();
      if (!m) return;
      _consCaricaMateriali(m).then(function (list) {
        if (_cons.voce !== id) return;          // nel frattempo ha cambiato mappa
        _cons.materiali = list; rifai();
      });
    }
    /* Ogni vista della classe si carica i suoi dati quando la si apre, non
       all'apertura della console: leggere il disco tre volte per una vista che
       forse nessuno guarderà è tempo tolto all'attesa che conta. */
    function scegliVista(v) {
      if (v === 'lavagna' && _cons.sessioni === null) {
        var CT = window.MappAICollabTeacher;
        (CT && CT.sessioni ? CT.sessioni() : Promise.resolve([])).then(function (list) {
          _cons.sessioni = list || [];
          if (_cons.voce === 'lavagna') rifai();
        });
      }
      if (v === 'live' && _cons.report === null) {
        var api = window.electronAPI;
        (api && api.studySessionsList ? api.studySessionsList() : Promise.resolve({ success: false }))
          .then(function (r) {
            var l = (r && (r.sessions || r.records)) || [];
            /* la Lavagna ha la sua vista: qui restano quiz e tutor */
            _cons.report = l.filter(function (x) { return !/lavagna/i.test(String(x.activity || '')); });
            if (_cons.voce === 'live') rifai();
          }).catch(function () { _cons.report = []; if (_cons.voce === 'live') rifai(); });
      }
      if (v === 'stampabili' && _cons.stampabili === null) {
        var mappe = _consFiltrate();
        if (!mappe.length) { _cons.stampabili = []; rifai(); return; }
        Promise.all(mappe.map(function (m) {
          return _consCaricaMateriali(m).then(function (list) {
            return list.map(function (x) { x.mappa = m.nome; return x; });
          }).catch(function () { return []; });
        })).then(function (gruppi) {
          _cons.stampabili = gruppi.reduce(function (a, b) { return a.concat(b); }, []);
          if (_cons.voce === 'stampabili') rifai();
        });
      }
    }
    var s = _consChiuse();
    /* Le mappe arrivano dal disco: la console si apre subito e la colonna si
       riempie quando la scansione risponde — senza che l'utente tocchi niente. */
    /* rilettura dal disco, riusabile: la usa l'apertura e la usa il canale
       «le cartelle sono cambiate» */
    function _consRileggi(poi) {
      return _consCaricaMappe().then(function (list) {
        _cons.mappe = list;
        _cons.materiali = null;         /* i materiali della mappa scelta: riletti alla bisogna */
        _cons.stampabili = null;
        if (poi) poi(list);
        return list;
      });
    }
    _consAggiorna = function () {
      if (!ridisegnaCons) return;
      _consRileggi(function () {
        var m = _consMappaScelta();
        if (m) { _consCaricaMateriali(m).then(function (l) { _cons.materiali = l; rifai(); }); }
        else rifai();
      });
    };
    s.suApertura = function (box, ridisegna) {
      ridisegnaCons = ridisegna;
      montaCascata(box);              // il percorso c'è già all'apertura, prima che arrivino le mappe
      _consCaricaMappe().then(function (list) {
        _cons.mappe = list;
        /* la mappa del segnalibro può non esserci più (cartella spostata o
           eliminata mentre si era altrove): allora si apre la console e basta */
        if (voceIniziale && list.some(function (m) { return m.id === voceIniziale; })) scegliMappa(voceIniziale);
        else rifai();
      });
    };
    s.suAzione = function (ev, box, ridisegna) {
      ridisegnaCons = ridisegna;
      var id = ev.azione;

      /* ESC a strati: prima si chiude il documento, poi la console. Chiudere
         tutto al primo ESC farebbe perdere il posto in cui si stava lavorando. */
      /* ESC chiude il MATERIALE aperto nella tela, e basta: senza materiale non
         fa niente (decisione di Giacomo, 10/8). Prima usciva dalla console, e
         siccome entrando in INSEGNA la landing sotto viene messa su COSTRUISCI
         — un dettaglio interno, «è dove si atterra chiudendola» — un ESC
         distratto sbatteva in CREA. Dalla sezione si esce dal percorso in alto,
         che è un gesto deliberato. */
      if (id === '__esc') { if (_cons.mat) { _cons.mat = null; rifai(); } return false; }

      if (id === '__nav') {
        var v = ev.voce;
        if (v === 'vuoto') return;
        if (v.indexOf('p:') === 0 || v.indexOf('v:') === 0) return scegliMappa(v);
        _cons.voce = v; _cons.mat = null; rifai();
        scegliVista(v);
        return;
      }

      // ── Lavagna ───────────────────────────────────────────────────────────
      if (id === 'lav-start' || id.indexOf('res:') === 0) {
        _cons.lavLogin = ev.valori.login || 'group';
        _cons.lavRete = ev.valori.rete || 'lan';
        try { if (window.MappAINetMode) window.MappAINetMode.set(_cons.lavRete); } catch (e) { }
        var CT = window.MappAICollabTeacher;
        if (!CT || !CT.avvia) { toast(_t('lv_electron', 'Richiede l\'app desktop.'), 'warning'); return; }
        return CT.avvia({
          loginMode: _cons.lavLogin, netMode: _cons.lavRete,
          resumeDir: id.indexOf('res:') === 0 ? id.slice(4) : ''
        });
      }
      if (id === 'lav-cred') {
        var CL = window.MappAIClasses;
        var attiva = CL && CL.getActive && CL.getActive();
        if (!attiva) { toast(_t('lt_lav_no_classe', 'Scegli prima una classe nel chip in alto.'), 'warning'); return; }
        if (!CL.saveCredentialsPdf) { toast(_t('lv_electron', 'Richiede l\'app desktop.'), 'warning'); return; }
        return CL.saveCredentialsPdf(attiva, { avvisa: true }).then(function (out) {
          /* la cartella delle classi sta fuori da Mappe: ha il suo comando, non
             quello dei vault */
          if (out && out.success && window.electronAPI && window.electronAPI.classDocOpen) {
            window.electronAPI.classDocOpen({ dir: out.dir });
          }
        });
      }

      // ── Attività LIVE ─────────────────────────────────────────────────────
      if (id === 'live-quiz') {
        if (window.MappAILive && window.MappAILive.openSetup) window.MappAILive.openSetup();
        else toast(_t('lv_electron', 'Richiede l\'app desktop.'), 'warning');
        return;
      }
      if (id === 'live-tutor') {
        if (window.MappAITutor && window.MappAITutor.openSetup) window.MappAITutor.openSetup();
        else toast(_t('lv_electron', 'Richiede l\'app desktop.'), 'warning');
        return;
      }
      if (id.indexOf('rep:') === 0 || id.indexOf('repdir:') === 0) {
        var idx = Number(id.slice(id.indexOf(':') + 1));
        var rec = (_cons.report || [])[idx];
        if (!rec) return;
        if (id.indexOf('repdir:') === 0) {
          if (window.electronAPI && window.electronAPI.studySessionOpenFolder) {
            window.electronAPI.studySessionOpenFolder({ dir: rec.dir });
          }
          return;
        }
        /* un clic sulla riga apre il PRIMO report: sono più d'uno per sessione
           (domande, studenti, tutor) e sceglierli tutti da una riga sola
           vorrebbe dire un menu — si aprono dalla cartella */
        var primo = (rec.reports || [])[0];
        if (primo && window.electronAPI && window.electronAPI.studyReportOpen) {
          window.electronAPI.studyReportOpen({ file: primo.file });
        } else {
          toast(_t('lt_live_no_report', 'Questa sessione non ha report da aprire.'), 'warning');
        }
        return;
      }
      /* il chip è il contesto: cambiarlo ricostruisce la colonna, non la vista */
      if (id === '__ctx-classe') {
        return pickClass(function (c) {
          try { window.MappAIClasses.setActive(c ? c.id : ''); } catch (e) { }
          /* La materia resta solo se la NUOVA classe la insegna: tenerla
             comunque svuoterebbe la colonna senza dire perché, azzerarla sempre
             farebbe ricominciare anche a chi insegna la stessa materia in due
             classi (stessa regola di «Assegna classe e disciplina»). */
          try {
            var mat = _consMateria();
            if (mat) {
              var CL = window.MappAIClasses;
              var ok = c && CL.disciplineChoices && CL.disciplineChoices(c).indexOf(mat) >= 0;
              if (!ok) CL.setActiveDiscipline('');
            }
          } catch (e) { }
          _cons.voce = ''; _cons.mat = null; _cons.materiali = null; rifai();
        });
      }
      if (id === '__ctx-materia') return _consPickMateria(rifai);

      if (id === 'ind') { _cons.mat = null; rifai(); return; }
      if (id === 'stampa') return _consStampa();
      if (id === 'qr') return _consQr();
      if (id === 'finder') {
        if (_cons.mat && !_cons.mat.archivio) openDiskFile(_cons.mat.id);
        else openMapsFolder();
        return;
      }
      /* ⚠️ «Mappa», «Elabora», «Studio attivo» e «Lavagna» NON passano di qui:
         sono azioni CONCLUSIVE (portano fuori dalla console) e il motore, per
         quelle, chiude e restituisce l'esito al chiamante senza chiamare il
         gestore. Stavano qui, quindi nessuna delle quattro faceva niente: si
         chiudeva la console e sotto riappariva la landing com'era — che se si
         veniva da ELABORA sembrava «si apre ELABORA» (Giacomo, 2/8).
         Ora vivono nel `.then()` di `open()`, che è dove il motore le consegna. */
      if (id === 'cartella') {
        var mm2 = _consMappaScelta();
        if (mm2 && mm2.v && window.electronAPI && window.electronAPI.pipelineOpenFolder) {
          window.electronAPI.pipelineOpenFolder({ folderPath: mm2.v.fullPath });
        } else openMapsFolder();
        return;
      }

      if (id.indexOf('m:') === 0) {
        var mid = id.slice(2);
        _cons.mat = (_cons.materiali || []).find(function (x) { return x.id === mid; }) || null;
        rifai();
        return;
      }
      /* «Apri nel Finder» su una riga: si va al FILE, non all'anteprima. È un
         comando di riga, quindi NON conclude — si apre la cartella e la console
         resta dov'era. */
      if (id.indexOf('fnd:') === 0) {
        var fid = id.slice(4);
        var loc = _diskCache[fid], api = window.electronAPI;
        if (!loc || !api || !api.pipelineOpenFile) {
          toast(_t('fx_desktop', 'Disponibile solo nell\'app desktop.'), 'warning');
          return;
        }
        Promise.resolve(api.pipelineOpenFile({ vaultPath: loc.vaultPath, relPath: loc.relPath }))
          .then(function (res) {
            if (res && res.ok === false) toast(_t('ec_finder_ko', 'Non riesco ad aprire questo file dalla cartella.'), 'warning');
          })
          .catch(function () { toast(_t('ec_finder_ko', 'Non riesco ad aprire questo file dalla cartella.'), 'warning'); });
        return;
      }
      /* «Stampa»: il dialogo di stampa di sistema sul file vero.
         ⚠️ NON si passa da `iframe.print()`: un PDF vive in un iframe a origine
         opaca e quella chiamata lancia SecurityError senza dire niente (è il
         difetto già annotato in `stampaIframe`, che su un PDF torna `false`).
         Il main apre il file in una finestra e stampa di là; se non ci riesce
         lo apre nell'applicazione di sistema E LO DICE, invece di lasciare il
         docente davanti a un bottone che sembra rotto. */
      if (id.indexOf('st:') === 0) {
        var pid = id.slice(3);
        var loc1 = _diskCache[pid], api1 = window.electronAPI;
        if (!loc1 || !api1 || !api1.vaultFilePrint) {
          toast(_t('fx_desktop', 'Disponibile solo nell\'app desktop.'), 'warning'); return;
        }
        api1.vaultFilePrint({ vaultPath: loc1.vaultPath, relPath: loc1.relPath })
          .then(function (res) {
            if (!res || res.ok === false) { toast(_t('lt_print_ko', 'Non riesco a stampare questo file.'), 'warning'); return; }
            if (res.aperto) toast(_t('lt_print_aperto', 'L\'ho aperto nell\'applicazione di sistema: stampalo da lì.'), 'info');
          })
          .catch(function () { toast(_t('lt_print_ko', 'Non riesco a stampare questo file.'), 'warning'); });
        return;
      }
      /* «Scarica una copia»: il dialogo di sistema chiede nome e posizione, e
         il main copia. ⚠️ Non si indovina ~/Downloads: su una macchina
         configurata diversamente è il posto sbagliato, e non si potrebbe
         rinominare il file mentre lo si salva — che è proprio ciò che serve
         quando lo si sta per allegare a una mail. Annullare NON è un errore. */
      if (id.indexOf('dl:') === 0) {
        var lid = id.slice(3);
        var loc0 = _diskCache[lid], api0 = window.electronAPI;
        if (!loc0 || !api0 || !api0.vaultFileDownload) {
          toast(_t('fx_desktop', 'Disponibile solo nell\'app desktop.'), 'warning'); return;
        }
        api0.vaultFileDownload({ vaultPath: loc0.vaultPath, relPath: loc0.relPath })
          .then(function (res) {
            if (!res || res.ok === false) { toast(_t('lt_dl_ko', 'Non riesco a scaricare questo file.'), 'warning'); return; }
            if (res.annullato) return;              /* ha cambiato idea: nessun avviso */
            toast(_t('lt_dl_ok', '✓ Copia scaricata'), 'success');
          })
          .catch(function () { toast(_t('lt_dl_ko', 'Non riesco a scaricare questo file.'), 'warning'); });
        return;
      }
      if (id.indexOf('del:') === 0) {
        var did = id.slice(4);
        var m = (_cons.materiali || []).find(function (x) { return x.id === did; });
        if (!m) return;
        return confirmDeleteText(m.titolo, function () {
          var poi = function () {
            _cons.materiali = (_cons.materiali || []).filter(function (x) { return x.id !== did; });
            rifai();
          };
          if (m.archivio) {
            if (window.MappAIStudyDocs && window.MappAIStudyDocs.remove) window.MappAIStudyDocs.remove(m.docId);
            poi();
          } else {
            var loc = _diskCache[m.id], api = window.electronAPI;
            if (!loc || !api || !api.deleteVaultFile) { toast(_t('fx_desktop', 'Disponibile solo nell\'app desktop.'), 'warning'); return; }
            api.deleteVaultFile({ vaultPath: loc.vaultPath, relPath: loc.relPath }).then(function (res) {
              if (res && res.ok) {
                delete _diskCache[m.id];
                try { if (window.MappAIVaults) window.MappAIVaults.segnala('file-eliminato', { vaultPath: loc.vaultPath, relPath: loc.relPath }); } catch (e) { }
                toast(_t('lt_file_trashed', 'Spostato nel Cestino.'), 'success'); poi();
              }
              else toast(_t('lt_file_del_ko', 'Non è stato possibile eliminare il file') + (res && res.error ? ': ' + res.error : ''), 'error');
            });
          }
        });
      }
    };
    MM().open(s).then(function (r) {
      /* la barra unica torna alla landing (era dentro la testata della console):
         va rimessa PRIMA di leggere lo stato, e comunque prima di ogni ramo —
         la console si sta chiudendo in tutti i casi */
      _huRestore();
      _consAggiorna = null;            /* la console si stacca dal canale del disco */
      /* la mappa scelta si legge PRIMA di azzerare lo stato: dopo il reset
         `_consMappaScelta()` non saprebbe più di quale mappa si parlava */
      var scelta = _consMappaScelta();
      _cons = { voce: '', mat: null, materiali: null, mappe: null, sessioni: null, report: null, stampabili: null, lavLogin: '', lavRete: '' };
      if (!r) return;                                   // × , ESC o velo
      if (r.azione === 'apri') {
        if (!_consCarica(scelta)) { toast(_t('lt_cons_apri_ko', 'Non riesco ad aprire questa mappa.'), 'warning'); return; }
        /* si esce verso la mappa: chi torna con HOME deve ritrovare la console
           dov'era, non la landing */
        _consSegna(scelta ? scelta.id : '');
        return;
      }
      if (r.azione === 'live' || r.azione === 'collab') {
        _consSegna(scelta ? scelta.id : '');
        _consAvvia(scelta, r.azione);
        return;
      }
      /* «Elabora» NON lascia il segnalibro: porta a un'altra superficie della
         landing, e tornarci è esattamente quello che si è chiesto. */
      if (r.azione === 'elabora') _consAvvia(scelta, r.azione);
    });
    _consDipingiTela();
  }

  // Selettore della materia: le materie della classe attiva, o quelle del profilo.
  function _consPickMateria(poi) {
    var cls = _consClasse();
    var scelte = [];
    try {
      var CL = window.MappAIClasses;
      scelte = (CL && CL.disciplineChoices) ? CL.disciplineChoices(cls || {}) : [];
    } catch (e) { scelte = []; }
    MM().open({
      titolo: _t('lt_cons_pick_materia', 'Scegli la materia'), icona: 'book-open', taglia: 's', invio: false,
      sezioni: [scelte.length
        ? { voci: scelte.map(function (d) { return { id: 'd:' + d, etichetta: d, icona: 'book-open' }; }) }
        : { testo: _t('lt_cons_no_materie', 'Questa classe non dichiara materie: le aggiungi nel profilo insegnante.') }],
      azioni: [{ id: 'tutte', etichetta: _t('lt_cons_tutte_materie', 'Tutte le materie') }]
    }).then(function (r) {
      if (!r) return;
      var val = r.azione === 'tutte' ? '' : (r.azione.indexOf('d:') === 0 ? r.azione.slice(2) : null);
      if (val === null) return;
      try { window.MappAIClasses.setActiveDiscipline(val); } catch (e) { }
      if (poi) poi();
    });
  }

  function _consStampa() {
    var tela = _consTela(); var f = tela && tela.querySelector('iframe');
    if (!f) return;
    try { f.contentWindow.focus(); f.contentWindow.print(); }
    catch (e) { toast(_t('lt_cons_stampa_ko', 'La stampa non è disponibile per questo materiale.'), 'warning'); }
  }
  /* Condivide UN materiale via QR: pubblica su MappAI Live e apre i Materiali.
     Archivio → shareDoc; disco → deve essere HTML (un PDF non si serve inline). */
  function _consShareMat(m) {
    if (!m) return;
    if (m.archivio) return shareDoc(m.docId);
    var loc = _diskCache[m.id];
    if (!loc || !window.MappAILive || !window.MappAILive.publishHtml || !window.electronAPI || !window.electronAPI.readVaultFile) {
      toast(_t('lv_electron', 'Richiede l\'app desktop.'), 'warning'); return;
    }
    if (!/\.html?$/i.test(loc.relPath)) { toast(_t('lt_cons_qr_ko', 'Solo i materiali in HTML si condividono via QR.'), 'warning'); return; }
    window.electronAPI.readVaultFile({ vaultPath: loc.vaultPath, relPath: loc.relPath }).then(function (res) {
      if (!res || !res.ok) return;
      var html = _testoDaBase64(res.base64);
      var nome = m.titolo.replace(/[^\w\-.]+/g, '_');
      Promise.resolve(window.MappAILive.publishHtml(nome, html)).then(function () {
        if (window.MappAILive.openMaterials) window.MappAILive.openMaterials();
      });
    });
  }
  /* QR: col materiale aperto (barra) lo condivide; dalla riga comandi della
     mappa non c'è un materiale «corrente» → si sceglie quale condividere. */
  function _consQr() {
    if (_cons.mat) return _consShareMat(_cons.mat);
    /* Il picker elenca SOLO ciò che si può davvero condividere (`m.qr`): prima
       offriva anche i PDF, che dopo la scelta rispondevano con un rifiuto —
       un comando che non può riuscire è peggio di un comando che manca.
       ⚠️ Le voci d'archivio cartacee che le TABELLE di INSEGNA nascondono
       (13/8) qui RESTANO, per scelta: la tabella risponde a «che file ho», il
       picker a «che cosa mando agli allievi» — e l'HTML d'archivio è proprio
       la copia senza soluzioni che si manda. */
    var lista = (_cons.materiali || []).filter(function (m) { return m.qr; });
    if (!lista.length) {
      toast(_t('lt_cons_qr_vuoto', 'Nessun materiale da condividere: genera prima una Sintesi, un Foglio nodi o una Timeline.'), 'warning');
      return;
    }
    MM().open({
      titolo: _t('lt_cons_qr_pick', 'Condividi un materiale via QR'), icona: 'qr-code', taglia: 's', invio: false,
      sezioni: [{ voci: lista.map(function (m) { return { id: 'q:' + m.id, etichetta: m.titolo, seconda: m.mappa || '', icona: 'file-text' }; }) }]
    }).then(function (r) {
      if (!r || !r.azione || r.azione.indexOf('q:') !== 0) return;
      var m = lista.filter(function (x) { return x.id === r.azione.slice(2); })[0];
      if (m) _consShareMat(m);
    });
  }
  /* Aprire la mappa segue la stessa strada delle righe di INSEGNA: il progetto
     salvato se c'è, altrimenti il vault dal disco (le mappe senza progetto in
     localStorage esistono, ed erano proprio quelle che la console non vedeva). */
  function _consCarica(m) {
    if (!m) return false;
    if (m.p && window.loadSavedProject) { window.loadSavedProject(m.p.id); return true; }
    if (m.p && window.StorageManager && StorageManager.loadProject) { StorageManager.loadProject(m.p.id); return true; }
    if (m.v && window.directLoadVault) { window.directLoadVault(m.v.fullPath); return true; }
    return false;
  }
  /* Riceve la mappa invece di ricavarsela: quando arriva qui la console è già
     chiusa e lo stato azzerato. */
  /* `appState` è una `let` di app.js, non sta su window (regola nota). */
  function _appState() {
    try { return (typeof appState !== 'undefined') ? appState : window.appState; }
    catch (e) { return window.appState; }
  }
  /* La mappa CHIESTA è davvero quella caricata? Il confronto non è sul numero
     di nodi (una mappa precedente ne ha anche lei) ma sull'identità: l'id del
     progetto o il percorso del vault. */
  function _consEccoLa(m) {
    var s = _appState();
    if (m.p && window.StorageManager && StorageManager.currentProjectId === m.p.id) return true;
    if (m.v && s && s.activeVaultPath && String(s.activeVaultPath) === String(m.v.fullPath)) return true;
    return false;
  }
  /* ⚠️ `_consCarica` NON è sempre sincrono: `loadSavedProject` lo è, ma
     `directLoadVault` legge dal disco via IPC — ed è la strada delle mappe che
     un progetto in localStorage non ce l'hanno, cioè la maggioranza in Electron.
     Agire subito (o dopo 120ms a caso) significava decidere guardando la mappa
     PRECEDENTE: con una mappa già aperta ELABORA si apriva su quella, poi il
     caricamento finiva e riportava al canvas — «il bottone porta alla mappa».
     Qui si aspetta l'identità giusta, con un tetto oltre il quale si rinuncia. */
  function _consQuandoPronta(m, poi) {
    var giri = 0;
    var passo = function () {
      if (_consEccoLa(m)) return poi();
      if (++giri > 60) { toast(_t('lt_cons_apri_ko', 'Non riesco ad aprire questa mappa.'), 'warning'); return; }
      setTimeout(passo, 80);                        // ~5s al massimo
    };
    passo();
  }

  function _consAvvia(m, kind) {
    if (!m) return;
    /* ⚠️ LE UNICHE QUATTRO AZIONI DI INSEGNA CHE TOCCANO `appState` (14/8):
       aprire la mappa, ELABORA, Studio attivo, Lavagna — tutte caricano una
       mappa. Tutto il RESTO di questa console passa dal disco (elenca i vault,
       apre PDF e HTML nell'iframe, stampa, QR, Finder) e durante una
       generazione resta usabile: è la ragione per cui il blocco è qui, sulle
       quattro, e non sulla sezione intera. */
    if (window.mappaiOccupato && window.mappaiOccupato()) return;
    _consCarica(m);
    _consQuandoPronta(m, function () {
      if (kind === 'elabora') {
        /* la condizione la dichiara ELABORA stessa (`hasMap` è esportata), non
           una sua copia qui: su un KG il suo empty-state finirebbe dentro la
           landing, nascosta dietro la mappa, e il bottone sembrerebbe morto */
        var EL = window.MappAIElabora;
        if (EL && EL.hasMap && !EL.hasMap()) {
          toast(_t('lt_cons_no_elab', 'ELABORA lavora sulle MindMap: questa è un Knowledge Graph.'), 'warning');
          return;
        }
        return setMode('elabora');
      }
      if (kind === 'collab' && window.openCollabHub) return window.openCollabHub();
      if (kind === 'live' && window.MappAILive && window.MappAILive.openSetup) return window.MappAILive.openSetup();
      toast(_t('lt_hub_missing', 'Funzione non disponibile.'), 'warning');
    });
  }

  // ── Contesto delle mappe: classe · materia · allievo ───────────────────────
  // Serve ai Consumi della Cabina (2/8), che devono poter filtrare le chiamate
  // AI per classe, per allievo e per materia — dati che il registro NON porta
  // (un record ha solo il progetto). Vive qui perché qui vivono già le due cose
  // che servono: il match progetto↔vault e la regola che la CARTELLA su disco è
  // la fonte di verità (il campo del progetto è solo il ripiego di chi non ha
  // Electron). Chiave = la stessa di MappAIUsageCore.projectKey.
  //   contestoDelleMappe(vaults) → { byKey, classi, materie, allievi }
  function contestoDelleMappe(vaults) {
    var projects = projectsRead();
    var byKey = {}, classi = {}, materie = {}, allievi = {};
    function segna(p, classe, materia, allievo) {
      var rec = { classe: classe || '', materia: materia || '', allievo: allievo || '' };
      if (p && p.id != null) byKey[String(p.id)] = rec;
      if (p && p.name) byKey['label:' + p.name] = rec;   // record senza projectId
      if (rec.classe) classi[rec.classe] = 1;
      if (rec.materia) materie[rec.materia] = 1;
      if (rec.allievo) allievi[rec.allievo] = 1;
    }
    // 1) dal disco: la cartella dice dove la mappa vive davvero
    (vaults || []).forEach(function (v) {
      var p = matchProjectToVault(projects, v);
      if (!p) return;
      segna(p, prettyClass(v.classDir || '') || p.cls || '',
        prettyClass(v.discDir || '') || p.disc || '', v.studentDir || '');
    });
    // 2) i progetti che il disco non ha (browser, vault cancellato) tengono
    //    quello che si sono congelati alla creazione
    projects.forEach(function (p) {
      if (p.id != null && byKey[String(p.id)]) return;
      segna(p, p.cls || prettyClass(p.classDir || ''), p.disc || prettyClass(p.discDir || ''), '');
    });
    var ord = function (o) { return Object.keys(o).sort(function (a, b) { return a.localeCompare(b, 'it'); }); };
    return { byKey: byKey, classi: ord(classi), materie: ord(materie), allievi: ord(allievi) };
  }

  /* ── Segnalibro della console ─────────────────────────────────────────────
     Uscire dalla console per aprire una mappa e poi tornare indietro con HOME
     passa da un `location.reload()` (backToLanding): niente sopravvive tranne
     lo storage. Qui si annota da DOVE si era usciti, così al ritorno si riapre
     la console sulla stessa mappa invece di atterrare sulla landing.
     `sessionStorage`: vale per questa finestra e non si trascina al riavvio. */
  var SS_BACK = 'mappai_teach_console_back';
  function _consSegna(voce) {
    try { sessionStorage.setItem(SS_BACK, voce || ''); } catch (e) { }
  }
  function _consBack() {
    try {
      var v = sessionStorage.getItem(SS_BACK);
      sessionStorage.removeItem(SS_BACK);   // si consuma una volta sola
      return v || '';
    } catch (e) { return ''; }
  }

  // ── Init ───────────────────────────────────────────────────────────────────
  function init() {
    var back = _consBack();
    if (back !== '' && consoleAttiva() && window.MappAIModal) { setMode('teach', back); return; }
    /* Si riparte SEMPRE dalla landing vuota, non dall'ultimo tab aperto: la
       schermata d'ingresso è una domanda («che cosa vieni a fare?»), non la
       ripresa di ieri. Unica eccezione: il segnalibro qui sopra, che riporta alla
       console da cui si era usciti per aprire una mappa. */
    try { localStorage.setItem(LS_MODE, ''); } catch (e) { }
    _contestoVuotoAlLancio();
    applyMode();
  }

  /* ── IL CONTESTO NON SI EREDITA DAL LANCIO PRECEDENTE (Giacomo, 8/8 notte) ──
     Rovescia la decisione del 3/8 («i chip restano in localStorage e sopravvivono
     alla chiusura»): riaprendo l'app le briciole mostravano «4R › Geografia», la
     classe di ieri, e si lavorava dentro un contesto che nessuno aveva scelto in
     questa sessione. Ora al lancio la topbar dice «Elabora › A chi?» e la materia
     compare solo dopo aver scelto il destinatario.
     ⚠️ Si azzera al LANCIO, non a ogni `init()`: `backToLanding` fa
     `location.reload()`, e il reload ripassa da qui — senza la guardia, tornare
     alla landing da una mappa butterebbe via la classe appena scelta. Il
     marcatore sta in `sessionStorage`, che sopravvive al reload e muore col
     processo: in Electron ogni lancio è una sessione nuova, che è esattamente il
     confine chiesto.
     ⚠️ Va azzerato ANCHE il flag sticky del percorso: dice «A chi? l'ho già
     scelto» e senza toglierlo la briciola mostrerebbe «Generico» e rivelerebbe
     «Materia» — cioè un contesto scelto, che è ciò che si vuole evitare.
     ⚠️ L'allievo attivo non è una chiave sua: è `appState.userProfile.nickname`.
     Si usa il gesto che esiste già (`setActiveStudent(null)`, lo stesso del
     bottone «Generico»), che azzera il profilo ATTIVO e non tocca le schede
     salvate in `allProfiles`. Cancellarle sarebbe perdere dati. */
  var LS_BOOT = 'mappai_contesto_azzerato';
  function _contestoVuotoAlLancio() {
    try {
      if (sessionStorage.getItem(LS_BOOT) === '1') return;   /* già fatto: è un reload */
      sessionStorage.setItem(LS_BOOT, '1');
    } catch (e) { return; }                                   /* senza sessionStorage non si azzera a ogni render */
    var CL = window.MappAIClasses;
    try { if (CL && CL.setActiveDiscipline) CL.setActiveDiscipline(''); } catch (e) { }
    /* ⚠️ Silenzioso: è l'app che si azzera all'avvio, non l'utente che sceglie —
       e l'avviso «Nessuna classe attiva» accoglieva con un cartello su un gesto
       che nessuno aveva fatto (rilievo di Giacomo, 14/8). */
    try { if (CL && CL.setActive) CL.setActive('', { silenzioso: true }); } catch (e) { }
    try { if (CL && CL.setActiveStudent) CL.setActiveStudent(null); } catch (e) { }
    try { localStorage.removeItem('mappai_bento_achi'); } catch (e) { }
  }

  window.MappAITeach = {
    init: init,
    contestoDelleMappe: contestoDelleMappe,
    /* ── Le MAPPE del contesto, per chi le vuole fuori da INSEGNA (8/8 notte) ──
       La briciola «progetto» di ELABORA ha bisogno delle stesse tre cose che la
       console INSEGNA ha già: l'elenco delle mappe (dal DISCO, coi progetti
       agganciati), il filtro per classe+materia attive e il caricamento che
       ASPETTA l'identità giusta. Sono esposte, non ricopiate: un secondo elenco
       delle stesse mappe divergerebbe al primo ritocco — ed è esattamente
       l'errore che aveva fatto comparire i materiali di una classe sola.
         mappeDelContesto()      → Promise<[{id,nome,type,p,v,cls,disc}]> filtrate
         mappaCorrente(list)     → la voce di list che è caricata ADESSO, o null
         apriMappa(m, poi)       → carica e chiama `poi` quando c'è davvero */
    /* il genere di un file del vault dal suo NOME (Quiz-MC-…, Sintesi -VERDE.html…):
       la regola vive qui da luglio e la usa INSEGNA; esposta perché la colonna di
       ELABORA elenca gli stessi file e due classificatori divergerebbero (9/8) */
    generePerFile: _diskKind,
    /* Gli elenchi dei materiali, per chi non è INSEGNA. ELABORA disegna le
       STESSE tabelle — stessi gruppi, stesse colonne, stessi comandi di riga —
       e cambia solo quale delle due sintesi vede (`dove`). Esportata perché
       l'alternativa era ricopiarla: due elenchi che si somigliano oggi e
       divergono al primo ritocco di una colonna.
         tabelleMateriali(lista, conMappa, dove) → [{id, titolo, colonne, righe}]
       `lista` = materiali nella forma di `_diskMaterialsFor`
                 ({id, titolo, tipo, data, archivio, voce, cls, disc, mappa}). */
    tabelleMateriali: _consTabelleMateriali,
    /* Quale delle due sintesi compete a una console. Esportata insieme alla
       precedente: chi costruisce una lista per conto suo deve poter applicare
       la stessa regola senza riscriverla. */
    filtraSintesi: filtraSintesi,
    /* La conferma a DIGITAZIONE del nome esatto (regola §10.15): ogni
       eliminazione della landing passa da qui, e ora anche il cestino delle
       tabelle in ELABORA v2 — la regola è una, il posto è uno. */
    confirmDeleteText: confirmDeleteText,
    mappeDelContesto: function () {
      return _consCaricaMappe().then(function (all) { return _filtraContesto(all); });
    },
    /* Quante ce ne sono in TUTTO, filtro a parte (14/8). Serve alla riga del
       conto sotto i filtri della sidebar: senza il totale, «3 progetti» non
       distingue un filtro che ne nasconde nove da un archivio con tre mappe. */
    mappeTotali: function () {
      return _consCaricaMappe().then(function (all) { return (all || []).length; });
    },
    /* Il contesto di UNA mappa, come lo vede il filtro (classe e materia lette
       dalla cartella su disco). Esposto perché scegliere un progetto ALLINEA il
       filtro a quel progetto (decisione di Giacomo, 14/8): senza, la briciola
       direbbe una classe e a schermo ce ne sarebbe un'altra. */
    contestoDiMappa: function (m) {
      var v = _comeLaVedo(m || {});
      return { cls: v.cls || '', disc: v.disc || '' };
    },
    /* Allinea il contesto attivo a quella mappa. La classe si cerca per NOME
       (la cartella porta il nome, non l'id) e se non è una classe di questo
       docente si resta su Generico: inventare un id non esistente
       spegnerebbe la taratura senza dirlo. */
    allineaContestoA: function (m) {
      try {
        var CL = window.MappAIClasses; if (!CL) return;
        var v = _comeLaVedo(m || {});
        var c = (CL.list() || []).filter(function (x) { return normName(x.name) === normName(v.cls || ''); })[0] || null;
        if (CL.activeStudentName && CL.activeStudentName()) return;   /* un allievo attivo comanda: non lo si scavalca */
        if ((c ? c.id : '') !== CL.activeId()) CL.setActive(c ? c.id : '', { silenzioso: true });
        if ((v.disc || '') !== CL.activeDiscipline()) CL.setActiveDiscipline(v.disc || '');
      } catch (e) { }
    },
    mappaCorrente: function (list) {
      return (list || []).filter(function (m) { return _consEccoLa(m); })[0] || null;
    },
    apriMappa: function (m, poi) {
      if (!m) return false;
      if (_consEccoLa(m)) { if (poi) poi(); return true; }   /* già quella: niente da caricare */
      if (!_consCarica(m)) return false;
      _consQuandoPronta(m, function () { if (poi) poi(); });
      return true;
    },
    setMode: setMode,
    /* readMode e applyMode sono esposte perché la VESTE della landing (il rail
       delle tre forme, mappai-stile-manifesto.js) deve sapere in che modalità
       siamo e ridipingersi dopo ogni cambio. applyMode è l'unico rendez-vous
       che ogni cambio attraversa: chi la avvolge non deve indovinare un tick. */
    readMode: readMode,
    applyMode: applyMode,
    setClassFilter: setClassFilter,
    allowedProjectIds: allowedProjectIds,
    renderElaboraProjects: renderElaboraProjects,
    toggleBuildProjects: toggleBuildProjects,
    toggleSection: toggleSection,
    refresh: refresh,
    quickStart: quickStart,
    editGrade: editGrade,
    openDoc: openDoc,
    shareDoc: shareDoc,
    deleteDoc: deleteDoc,
    printQuizPaper: printQuizPaper,
    shareQuizPaper: shareQuizPaper,
    openSet: openSet,
    openReport: openReport,
    logSession: logSession,
    deleteProject: deleteProjectRow,
    openProjectFolder: openProjectFolder,
    shareProjectZip: shareProjectZip,
    projOpen: projOpen,
    projFinder: projFinder,
    projQr: projQr,
    projDelete: projDelete,
    elabOpen: elabOpen,
    elabFinder: elabFinder,
    elabDelete: elabDelete,
    assignElab: assignElab,
    assignElabLocal: assignElabLocal,
    backfillVaults: backfillVaults,
    selectProject: selectProject,
    openDiskFile: openDiskFile,
    deleteDiskFile: deleteDiskFile,
    openConsole: openConsoleInsegna,
    _consSchema: _consSchema,   // hook: si valida lo schema senza aprire la console
    _selectedProject: null,
    openMapsFolder: openMapsFolder,
    openActivityFolder: openActivityFolder,
    _regRead: regRead,
    _regWrite: regWrite
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
  document.addEventListener('mappai-active-class-changed', function () { if (readMode() === 'teach') refresh(); });
  /* ── LE CARTELLE SONO CAMBIATE: si rilegge (Giacomo, 9/8) ──────────────────
     Prima ogni elenco leggeva il disco una volta, all'apertura: una mappa appena
     generata non compariva, una cartella spostata restava dov'era, un file
     eliminato lasciava la riga. Ora chi scrive lo dichiara sul canale e qui si
     ridisegna la superficie VISIBILE — le altre rileggeranno da sé quando si
     aprono, e rileggere costa 1-7ms su 28 vault (misurato in Electron).
     ⚠️ Si azzerano anche le cache che rappresentano il disco: i generi delle
     mappe e la corrispondenza materiale→file, o resterebbero le vecchie mentre
     la tabella mostra le nuove. */
  if (window.MappAIVaults) {
    window.MappAIVaults.quando(function () {
      _generi = {};
      _diskCache = {};
      if (_consAggiorna) _consAggiorna();        /* console INSEGNA aperta */
      var m = readMode();
      if (m === 'teach') refresh();
      else if (m === 'elabora') renderElaboraProjects();
      try { if (window.StorageManager && StorageManager.syncValidVaults) StorageManager.syncValidVaults(); } catch (e) { }
    });
  }

  console.log('[MappAITeach] landing Costruisci/Insegna caricata');
})();
