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
  function readMode() { try { var m = localStorage.getItem(LS_MODE); return (m === 'teach' || m === 'elabora') ? m : 'build'; } catch (e) { return 'build'; } }
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
    if (quickActions) quickActions.classList.toggle('hidden', mode === 'elabora');
    if (metaLinks) metaLinks.classList.toggle('hidden', mode === 'elabora');
    applyFilterSeg();
    // Lasciando ELABORA: smonta l'overlay fullscreen (portal a livello di body).
    if (mode !== 'elabora' && window.MappAIElabora && window.MappAIElabora.teardown) window.MappAIElabora.teardown();
    if (mode === 'build') renderBuildProjects();
    else if (mode === 'teach') { refresh(); _ensureFreshAndRerender(); }
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

  function setMode(m) {
    // ELABORA (co-docente): senza mappa caricata mostra il selettore progetti
    // (empty-state con lista) → scegli una mappa da elaborare. Nessun blocco.
    var mm = (m === 'teach' || m === 'elabora') ? m : 'build';
    try { localStorage.setItem(LS_MODE, mm); } catch (e) { }
    applyMode();
  }

  function setClassFilter(f) {
    try { localStorage.setItem(LS_FILTER, f === 'active' ? 'active' : 'all'); } catch (e) { }
    applyFilterSeg();
    var mode = readMode();
    if (mode === 'build') renderBuildProjects();
    else if (mode === 'elabora' && window.MappAIElabora) window.MappAIElabora.render();
    else refresh();
  }

  function toggleBuildProjects() {
    var body = document.getElementById('build-projects-body');
    var chev = document.getElementById('build-projects-chevron');
    if (!body) return;
    var open = body.classList.toggle('hidden') === false;
    if (chev) chev.style.transform = open ? 'rotate(180deg)' : 'rotate(0deg)';
    if (open) renderBuildProjects();
  }

  // ── Modalità Costruisci: sezione progetti (con menu grade) ──────────────────
  function renderBuildProjects() {
    // StorageManager è const lessicale (NON su window) → guardia con typeof, non window.
    if (typeof StorageManager !== 'undefined' && StorageManager.renderRecentProjects) {
      // Picker: filtro-classe che non trova mappe → mostra tutte (mai lista vuota).
      var ids = allowedProjectIds();
      if (Array.isArray(ids) && ids.length === 0) ids = null;
      StorageManager.renderRecentProjects('recent-projects-container', { gradeMenu: true, onlyIds: ids });
    }
  }

  // ── Progetti in ELABORA: stesso layout tabella di Insegna (Tipo/Titolo/Classe/
  //    Data), MA senza «Riprendi» né QR; click riga → carica + elabora (openProject).
  // ELABORA «Progetti esistenti» — stessa fonte di verità = disco (22/7), come
  // Insegna: filtro classe + chip coerenti col contenitore di classe reale.
  var _elabVaults = [];
  var _elabContainer = 'elab-projects';
  function renderElaboraProjects(containerId) {
    _elabContainer = containerId || 'elab-projects';
    var body = document.getElementById(_elabContainer);
    if (!body) return;
    if (!window.electronAPI || !window.electronAPI.getAllVaults) { renderElaboraProjectsLocal(body); return; }
    window.electronAPI.getAllVaults().then(function (vaults) {
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
      return fileRow({
        tipo: tipoCell(meta.icon, meta.label, meta.full),
        title: v.rootNodeLabel || v.folderName, titleTip: (v.rootNodeLabel || v.folderName), dot: dot,
        cls: classCell(chips), date: dateCell(v.lastUpdated ? new Date(v.lastUpdated).getTime() : 0),
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
      return fileRow({
        tipo: tipoCell(meta.icon, meta.label, meta.full),
        title: p.name, titleTip: p.name, dot: dot,
        cls: classCell(chips), date: dateCell(p.date),
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
    if (/^Quiz-/i.test(n)) return { icon: 'list-checks', label: 'Quiz' };
    if (/^Flashcard-/i.test(n)) return { icon: 'copy', label: 'Flashcard' };
    if (/^Foglio-nodi-/i.test(n)) return { icon: 'scissors', label: 'Foglio nodi' };
    if (/^Sintesi/i.test(n)) return { icon: 'sparkles', label: 'Sintesi' };
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
          return { id: id, _disk: true, title: f.name, mapName: p.name, cls: p.cls, date: f.mtime };
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
  // Contenuto cella CLASSE: chip singolo/lista o trattino.
  function classCell(names) {
    var arr = (names == null) ? [] : (Array.isArray(names) ? names : [names]);
    arr = arr.filter(function (x) { return x != null && x !== ''; });
    if (!arr.length) return '<span class="text-slate-300">—</span>';
    return '<span class="flex flex-wrap gap-1 min-w-0">' + arr.slice(0, 2).map(function (c) {
      return '<span class="inline-flex items-center gap-1 text-[9px] font-semibold text-indigo-600 bg-indigo-50 rounded-full px-1.5 py-0.5 max-w-full"><i data-lucide="graduation-cap" class="w-2.5 h-2.5 shrink-0"></i><span class="truncate">' + esc(c) + '</span></span>';
    }).join('') + (arr.length > 2 ? '<span class="text-[9px] text-slate-400">+' + (arr.length - 2) + '</span>' : '') + '</span>';
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
    return td('<div class="flex items-center gap-1.5 min-w-0" title="' + esc(o.titleTip || o.title) + '">' + (o.dot || '') +
      '<div class="min-w-0"><div class="text-[12px] font-bold text-slate-700 truncate">' + esc(o.title) + '</div>' +
      (o.sub ? '<div class="text-[10px] text-slate-400 truncate">' + o.sub + '</div>' : '') + '</div></div>');
  }
  // ── Tabella sezioni "file" (Progetti · Materiali · File condivisi) ──────────
  var FILE_COLS = '<colgroup><col style="width:88px"><col><col style="width:118px"><col style="width:100px"><col style="width:150px"></colgroup>';
  function fileHead() {
    return '<thead class="sticky top-0 bg-white z-10"><tr class="border-b border-slate-200">' +
      th(_t('rp_type', 'Tipo')) + th(_t('rp_title', 'Titolo')) + th(_t('rp_class', 'Classe')) +
      th(_t('lt_col_date', 'Data')) + '<th class="' + TH + '"></th></tr></thead>';
  }
  function fileRow(o) {
    var click = o.onClick ? ' onclick="' + o.onClick + '"' : '';
    var cur = o.onClick ? ' cursor-pointer' : '';
    var sel = o.selected ? ' bg-indigo-100 ring-1 ring-inset ring-indigo-300' : '';
    return '<tr class="border-b border-slate-100 hover:bg-indigo-50 transition' + cur + sel + '"' + click + '>' +
      td(o.tipo, 'overflow-hidden') + titleTd(o) + td(o.cls) + td(o.date) +
      td('<div class="flex justify-end items-center gap-0.5">' + (o.block || '') + '</div>', 'text-right') + '</tr>';
  }
  function fileTable(rowsHtml, scroll) {
    var t = '<table class="w-full table-fixed border-collapse">' + FILE_COLS + fileHead() + '<tbody>' + rowsHtml + '</tbody></table>';
    return scroll ? '<div class="overflow-y-auto max-h-[340px]" style="scrollbar-gutter:stable">' + t + '</div>' : t;
  }
  // ── Tabella "Attività di studio e report": Tipo · Titolo · Classe ·
  // Partecipanti · Data · Report(bottoni) · Finder ──────────────────────────
  var ACT_COLS = '<colgroup><col style="width:88px"><col><col style="width:80px"><col style="width:104px"><col style="width:64px"><col style="width:196px"><col style="width:44px"></colgroup>';
  function actHead() {
    return '<thead class="sticky top-0 bg-white z-10"><tr class="border-b border-slate-200">' +
      th(_t('rp_type', 'Tipo')) + th(_t('rp_title', 'Titolo')) + th(_t('rp_class', 'Classe')) +
      th(_t('lt_col_date', 'Data')) + th(_t('lt_col_part_short', 'Part.')) + th(_t('lt_col_report', 'Report')) +
      '<th class="' + TH + '"></th></tr></thead>';
  }
  function actTableRow(o) {
    return '<tr class="border-b border-slate-100 hover:bg-indigo-50 transition">' +
      td(o.tipo, 'overflow-hidden') + titleTd(o) + td(o.cls) + td(o.date) + td(o.partic) +
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
    if (window.showPrompt) {
      window.showPrompt(title, '', function (val) {
        if (val && String(val).trim().toLowerCase() === String(name).trim().toLowerCase()) onOk();
        else toast(_t('lt_del_type_mismatch', 'Il testo non corrisponde: eliminazione annullata.'), 'warning');
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
      sectionShell('teach-materials', 'file-text', _t('ui_teach_materials', 'Materiali di studio'), 'teach-materials-body', docs.length) +
      sectionShell('teach-sharedmat', 'share-2', _t('ui_teach_sharedmat', 'File condivisi'), 'teach-sharedmat-body') +
      sectionShell('teach-activities', 'clipboard-list', _t('ui_teach_activities', 'Attività di studio e report'), 'teach-activities-body');
    renderProjects();
    renderMaterials(docs);
    renderSharedMat();
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
    var byBoth = projects.find(function (p) {
      return p.vault === v.folderName && (p.classDir || null) === (v.classDir || null);
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
        cls: classCell(chips), date: dateCell(v.lastUpdated ? new Date(v.lastUpdated).getTime() : 0),
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
        var vaultName = fc.vaultFolderName(snap.rootNodeLabel || p.name || 'Mappa');
        var siblings = all.filter(function (v) { return classDir ? (v.classDir === classDir) : (!v.classDir); }).map(function (v) { return v.folderName; });
        var finalName = vaultName;
        if (siblings.indexOf(vaultName) >= 0 && fc.sessionSeq) {
          var seq = fc.sessionSeq(siblings, vaultName, ' · ');
          var n = Math.max(2, (seq.maxSeq || 0) + 1);
          finalName = vaultName + ' · ' + String(n).padStart(2, '0');
        }
        var folderPath = classDir ? (base + '/' + classDir + '/' + finalName) : (base + '/' + finalName);
        var res = null;
        try { res = await window.electronAPI.saveVault({ folderPath: folderPath, mapData: _mapDataFromSnapshot(snap) }); } catch (e) { res = null; }
        if (res && res.success) {
          var proj = projects.find(function (x) { return x.id === p.id; });
          if (proj) { proj.vault = finalName; proj.classDir = classDir; }
          all.push({ folderName: finalName, classDir: classDir });
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
        cls: classCell(chips), date: dateCell(p.date),
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
  var _smCache = [];
  function smIcon(ext) {
    ext = String(ext || '').toLowerCase();
    if (ext === 'pdf') return 'file-text';
    if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp'].indexOf(ext) >= 0) return 'image';
    if (['doc', 'docx'].indexOf(ext) >= 0) return 'file-type';
    if (['xls', 'xlsx', 'csv'].indexOf(ext) >= 0) return 'sheet';
    if (['ppt', 'pptx'].indexOf(ext) >= 0) return 'presentation';
    return 'paperclip';
  }
  function smHuman(n) { if (n == null) return ''; if (n < 1024) return n + ' B'; if (n < 1048576) return (n / 1024).toFixed(0) + ' KB'; return (n / 1048576).toFixed(1) + ' MB'; }

  function renderSharedMat() {
    var body = document.getElementById('teach-sharedmat-body');
    if (!body) return;
    if (!window.electronAPI || !window.electronAPI.sharedmatList) {
      body.innerHTML = '<p class="text-xs text-slate-400 italic px-2 py-2">' +
        esc(_t('lt_sm_desktop', 'Disponibile solo nell\'app desktop.')) + '</p>';
      return;
    }
    var addBar = '<div class="flex items-center gap-2 px-3 pt-1 pb-2">' +
      '<button type="button" onclick="window.MappAITeach.shareFromPc()" class="inline-flex items-center gap-1.5 text-[11.5px] font-bold text-white bg-green-600 hover:bg-green-700 rounded-lg px-3 py-1.5">' +
      '<i data-lucide="upload" class="w-3.5 h-3.5"></i>' + esc(_t('lt_sm_add', 'Condividi da PC')) + '</button>' +
      '<button type="button" onclick="window.MappAITeach.openSharedFolder()" title="' + esc(_t('lt_sm_folder', 'Apri cartella')) + '" class="inline-flex items-center text-slate-400 hover:text-indigo-500 rounded-lg p-1.5">' +
      '<i data-lucide="folder" class="w-4 h-4"></i></button></div>';
    window.electronAPI.sharedmatList().then(function (r) {
      var items = (r && r.success && r.items) ? r.items : [];
      _smCache = items;
      items = filterBySelection(items);   // US5: filtra sulla mappa selezionata (metadato mapName)
      if (!items.length) {
        body.innerHTML = addBar + '<p class="text-xs text-slate-400 italic px-2 py-2">' +
          esc(_t('lt_sm_empty', 'Nessun file condiviso. Usa “Condividi da PC” per inviare una scheda o un documento agli allievi via QR.')) + '</p>';
        if (window.safeCreateIcons) window.safeCreateIcons();
        return;
      }
      body.innerHTML = addBar + fileTable(items.map(function (it) {
        var extLbl = String(it.ext || 'file').toUpperCase().slice(0, 4);
        var block =
          actIcon('play-circle', _t('lt_open', 'Apri'), "window.MappAITeach.openSharedFile('" + esc(it.id) + "')", 'text-indigo-500 hover:text-indigo-700', false) +
          actIcon('qr-code', _t('lt_sm_share', 'Condividi via QR'), "window.MappAITeach.shareFile('" + esc(it.id) + "')", 'text-green-600 hover:text-green-700', false) +
          actIcon('folder', _t('lt_open_finder', 'Apri nel Finder'), "window.MappAITeach.openSharedFolder()", null, false) +
          actIcon('trash-2', _t('lt_sm_delete', 'Elimina'), "window.MappAITeach.removeSharedFile('" + esc(it.id) + "')", 'text-slate-300 hover:text-red-500', false);
        return fileRow({
          tipo: tipoCell(smIcon(it.ext), extLbl, it.ext || ''),
          title: it.name, titleTip: it.name,
          sub: esc(smHuman(it.size) + (it.mapName ? ' · ' + it.mapName : '')),
          cls: classCell(it.sharedClasses || []), date: dateCell(it.addedAt),
          block: block
        });
      }).join(''), true);
      if (window.safeCreateIcons) window.safeCreateIcons();
    }).catch(function () { body.innerHTML = addBar; if (window.safeCreateIcons) window.safeCreateIcons(); });
  }

  function shareFromPc() {
    if (!window.electronAPI || !window.electronAPI.sharedmatAdd) { toast(_t('lt_sm_desktop', 'Disponibile solo nell\'app desktop.'), 'warning'); return; }
    // US5: se una mappa è selezionata, il file condiviso porta il suo nome (metadato).
    var mapName = _selectedProject ? _selectedProject.name : '';
    window.electronAPI.sharedmatAdd({ mapName: mapName }).then(function (r) {
      if (!r || !r.success) { if (r && !r.canceled) toast((r && r.error) || 'Errore', 'error'); return; }
      renderSharedMat();
      if (r.added && r.added.length && window.MappAILive && window.MappAILive.shareFile) {
        window.MappAILive.shareFile(r.added[0].id).then(function () { renderSharedMat(); });
      }
    });
  }
  function shareFile(id) {
    if (window.MappAILive && window.MappAILive.shareFile) window.MappAILive.shareFile(id).then(function () { renderSharedMat(); });
    else toast(_t('lt_sm_desktop', 'Disponibile solo nell\'app desktop.'), 'warning');
  }
  function removeSharedFile(id) {
    if (!window.electronAPI || !window.electronAPI.sharedmatRemove) return;
    var it = _smCache.find(function (x) { return x.id === id; });
    var name = (it && it.name) || _t('lt_this_file', 'questo file');
    confirmDeleteText(name, function () {
      window.electronAPI.sharedmatRemove({ id: id }).then(function () { renderSharedMat(); });
    });
  }
  function openSharedFile(id) {
    if (window.electronAPI && window.electronAPI.sharedmatOpenFile) window.electronAPI.sharedmatOpenFile({ id: id });
    else toast(_t('fx_desktop', 'Disponibile solo nell\'app desktop.'), 'warning');
  }
  function openSharedFolder() { if (window.electronAPI && window.electronAPI.sharedmatOpenFolder) window.electronAPI.sharedmatOpenFolder(); }

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
    timeline: { icon: 'gantt-chart', label: 'Timeline' }
  };

  function renderMaterials(docs) {
    var body = document.getElementById('teach-materials-body');
    if (!body) return;
    // Archivio localStorage (filtro classe + selezione mappa).
    var archive = filterBySelection(filterItems((docs || []).map(function (d) { return Object.assign({}, d); })));
    // Con una mappa selezionata: fonde i materiali su DISCO del suo vault (pipeline 011).
    var p = _selectedProject ? projectsRead().find(function (x) { return x.id === _selectedProject.id; }) : null;
    if (p && p.vault) {
      _paintMaterials(body, archive);   // dipingi subito l'archivio
      _diskMaterialsFor(p).then(function (disk) { _paintMaterials(body, archive.concat(disk)); });
    } else {
      _paintMaterials(body, archive);
    }
  }
  function _materialRowHtml(d) {
    if (d._disk) {
      var dk = _diskKind(d.title);
      var block =
        actIcon('play-circle', _t('lt_open', 'Apri'), "window.MappAITeach.openDiskFile('" + esc(d.id) + "')", 'text-indigo-500 hover:text-indigo-700', false) +
        actIcon('folder', _t('lt_open_finder', 'Apri nel Finder'), "window.MappAITeach.openDiskFile('" + esc(d.id) + "')", null, false);
      return fileRow({
        tipo: tipoCell(dk.icon, dk.label, dk.label),
        title: d.title, titleTip: d.title, sub: d.mapName ? esc(d.mapName) : '',
        cls: classCell(d.cls), date: dateCell(d.date), block: block,
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
      cls: classCell(d.cls), date: dateCell(d.date), block: block2,
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
    var fname = (doc.title || 'materiale').replace(/[^\w\-]+/g, '_').slice(0, 40) + '.html';
    Promise.resolve(window.MappAILive.publishHtml(fname, doc.html)).then(function () {
      logSession({ map: doc.mapName || '', activity: 'materiali' });
      if (window.MappAILive.openMaterials) window.MappAILive.openMaterials();
    });
  }

  // Elimina un materiale archiviato (con conferma).
  function deleteDoc(id) {
    var doc = window.MappAIStudyDocs && window.MappAIStudyDocs.get(id);
    var name = (doc && doc.title) || _t('lt_this_material', 'questo materiale');
    confirmDeleteText(name, function () {
      if (window.MappAIStudyDocs && window.MappAIStudyDocs.remove) window.MappAIStudyDocs.remove(id);
      var docs = (window.MappAIStudyDocs && window.MappAIStudyDocs.list()) || [];
      renderMaterials(docs);
      if (window.safeCreateIcons) window.safeCreateIcons();
    });
  }

  // ── Registro attività di studio + report (010) ────────────────────────────
  // Una riga per SOMMINISTRAZIONE: attività · ramo/mappa · data · partecipanti/
  // totale · link a ogni report. Fonte = disco (IPC), sopravvive a clear localStorage.
  function activeClassName() { var ac = activeClass(); return ac && ac.name ? ac.name : null; }
  function normName(s) { return String(s == null ? '' : s).normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim(); }

  function renderActivities(sets) {
    var body = document.getElementById('teach-activities-body');
    if (!body) return;
    var setsHtml = savedSetsHtml(sets);
    if (!window.electronAPI || !window.electronAPI.studySessionsList) {
      body.innerHTML = '<p class="text-xs text-slate-400 italic px-2 py-2">' +
        esc(_t('lt_activities_desktop', 'Il registro delle attività somministrate è disponibile nell\'app desktop.')) + '</p>' + setsHtml;
      if (window.safeCreateIcons) window.safeCreateIcons();
      return;
    }
    body.innerHTML = '<p class="text-xs text-slate-400 italic px-2 py-2">' + esc(_t('lt_activities_loading', 'Carico le attività…')) + '</p>';
    window.electronAPI.studySessionsList().then(function (res) {
      var rows = (res && res.success && res.rows) ? res.rows : [];
      // filtro "solo classe attiva"
      if (readFilter() === 'active') {
        var acn = normName(activeClassName());
        if (acn) rows = rows.filter(function (r) { return normName(r.className) === acn; });
      }
      // US5: filtro sulla mappa selezionata (le righe attività hanno il campo .map)
      rows = filterBySelection(rows);
      if (!rows.length) {
        body.innerHTML = '<p class="text-xs text-slate-400 italic px-2 py-2">' +
          esc(_t('lt_no_activities', 'Nessuna attività somministrata. Avvia un quiz, un tutor o una timeline con una classe: qui compariranno le somministrazioni con i loro report.')) + '</p>' + setsHtml;
        if (window.safeCreateIcons) window.safeCreateIcons();
        return;
      }
      body.innerHTML = actTable(rows.map(activityRow).join('')) + setsHtml;
      if (window.safeCreateIcons) window.safeCreateIcons();
    }).catch(function () {
      body.innerHTML = '<p class="text-xs text-slate-400 italic px-2 py-2">' + esc(_t('lt_no_activities', 'Nessuna attività somministrata.')) + '</p>' + setsHtml;
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
      cls: classCell(r.className), partic: partic, date: dateCell(r.date),
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

  // Overlay generico (pattern .pm-* compatibile con il resto dell'app).
  function makeOverlay(titleIcon, title, innerHtml, maxW) {
    var ov = document.createElement('div');
    ov.className = 'mappai-teach-overlay';
    ov.style.cssText = 'position:fixed;inset:0;z-index:9992;background:rgba(15,23,42,.45);display:flex;align-items:center;justify-content:center;padding:18px';
    ov.innerHTML = '<div role="dialog" aria-modal="true" style="background:#f8fafc;border-radius:16px;box-shadow:0 25px 60px -12px rgba(0,0,0,.35);width:min(' + (maxW || '560px') + ',94vw);max-height:88vh;overflow-y:auto;padding:20px 22px">' +
      '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">' +
      '<div style="display:flex;align-items:center;gap:9px;font-weight:800;font-size:16px;color:#0f172a"><i data-lucide="' + titleIcon + '" style="width:20px;height:20px;color:#4f46e5"></i>' + esc(title) + '</div>' +
      '<button type="button" class="teach-close" aria-label="Chiudi" style="background:none;border:none;cursor:pointer;color:#94a3b8;font-size:22px;line-height:1;padding:4px">×</button></div>' +
      innerHtml + '</div>';
    ov.addEventListener('click', function (e) { if (e.target === ov) ov.remove(); });
    ov.querySelector('.teach-close').onclick = function () { ov.remove(); };
    var escH = function (e) { if (e.key === 'Escape') { ov.remove(); document.removeEventListener('keydown', escH); } };
    document.addEventListener('keydown', escH);
    document.body.appendChild(ov);
    if (window.safeCreateIcons) window.safeCreateIcons();
    return ov;
  }

  // Step 1: scelta classe. cb(cls|null) — null = "senza classe".
  function pickClass(cb) {
    var classes = classList();
    var rows;
    if (!classes.length) {
      rows = '<p style="font-size:13px;color:#64748b;line-height:1.6;margin-bottom:12px">' +
        esc(_t('lt_no_classes', 'Non hai ancora creato classi. Creane una per tarare le attività, oppure continua senza classe.')) + '</p>' +
        '<button type="button" class="lt-newclass" style="width:100%;padding:11px;border:none;border-radius:10px;background:#4f46e5;color:#fff;font-weight:700;cursor:pointer;margin-bottom:8px">' +
        esc(_t('lt_create_class', 'Crea una classe')) + '</button>';
    } else {
      rows = classes.map(function (c) {
        var sub = [c.grade, c.system].filter(Boolean).join(' · ');
        return '<button type="button" class="lt-cls" data-id="' + esc(c.id) + '" style="width:100%;text-align:left;display:flex;align-items:center;gap:10px;padding:11px 12px;border:1px solid #e2e8f0;border-radius:10px;background:#fff;cursor:pointer;margin-bottom:7px">' +
          '<i data-lucide="graduation-cap" style="width:18px;height:18px;color:#4f46e5;flex:0 0 auto"></i>' +
          '<span style="flex:1;min-width:0"><span style="display:block;font-weight:700;font-size:13.5px;color:#0f172a">' + esc(c.name) + '</span>' +
          (sub ? '<span style="display:block;font-size:11px;color:#94a3b8">' + esc(sub) + '</span>' : '') + '</span></button>';
      }).join('');
    }
    var footer = '<button type="button" class="lt-noclass" style="width:100%;padding:10px;border:1px dashed #cbd5e1;border-radius:10px;background:#f8fafc;color:#64748b;font-weight:600;cursor:pointer;margin-top:4px">' +
      esc(_t('lt_without_class', 'Continua senza classe')) + '</button>';
    var ov = makeOverlay('users', _t('lt_pick_class', 'Scegli la classe'), rows + footer, '460px');
    ov.querySelectorAll('.lt-cls').forEach(function (b) {
      b.onclick = function () {
        var c = window.MappAIClasses.get(b.dataset.id);
        try { window.MappAIClasses.setActive(b.dataset.id); } catch (e) { }
        ov.remove(); cb(c || null);
      };
    });
    var nc = ov.querySelector('.lt-noclass'); if (nc) nc.onclick = function () { ov.remove(); cb(null); };
    var newc = ov.querySelector('.lt-newclass'); if (newc) newc.onclick = function () { ov.remove(); if (window.openClassAccountsModal) window.openClassAccountsModal(); };
  }

  // Step 2: scelta mappa a 3 fasce. cb(project).
  function pickMap(cls, cb) {
    var core = CORE();
    var projects = projectsRead();
    if (!projects.length) { toast(_t('lt_no_maps', 'Nessuna mappa salvata. Creane una in modalità Costruisci.'), 'warning'); return; }
    var ranked = core ? core.rankMapsForClass(projects, regRead(), cls || {}) : { started: [], sameGrade: [], others: projects };
    var band = function (titleKey, titleFallback, arr) {
      if (!arr.length) return '';
      return '<div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#94a3b8;margin:12px 0 6px">' + esc(_t(titleKey, titleFallback)) + '</div>' +
        arr.map(function (p) {
          var isKg = p.type === 'kg';
          return '<button type="button" class="lt-map" data-id="' + esc(p.id) + '" style="width:100%;text-align:left;display:flex;align-items:center;gap:9px;padding:10px 12px;border:1px solid #e2e8f0;border-radius:10px;background:#fff;cursor:pointer;margin-bottom:6px">' +
            '<i data-lucide="' + (isKg ? 'network' : 'git-merge') + '" style="width:16px;height:16px;color:#4f46e5;flex:0 0 auto"></i>' +
            '<span style="flex:1;min-width:0;font-weight:700;font-size:13px;color:#0f172a;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(p.name) + '</span>' +
            (p.grade ? '<span style="font-size:10px;color:#94a3b8">' + esc(p.grade) + '</span>' : '') + '</button>';
        }).join('');
    };
    var inner = band('lt_band_started', 'Già usate con la classe', ranked.started) +
      band('lt_band_grade', 'Stesso grado', ranked.sameGrade) +
      band('lt_band_others', 'Altre mappe', ranked.others);
    var ov = makeOverlay('git-merge', _t('lt_pick_map', 'Scegli la mappa'), inner, '520px');
    ov.querySelectorAll('.lt-map').forEach(function (b) {
      b.onclick = function () {
        var p = projects.find(function (x) { return x.id === b.dataset.id; });
        ov.remove(); cb(p);
      };
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
    var inner = list.map(function (d) {
      var meta = KIND_META[d.kind] || KIND_META.dossier;
      return '<div class="lt-doc-row" data-id="' + esc(d.id) + '" style="display:flex;align-items:center;gap:6px;margin-bottom:6px">' +
        '<button type="button" class="lt-doc" data-id="' + esc(d.id) + '" title="' + esc(_t('lt_sm_share', 'Condividi via QR')) + '" style="flex:1;min-width:0;text-align:left;display:flex;align-items:center;gap:9px;padding:10px 12px;border:1px solid #e2e8f0;border-radius:10px;background:#fff;cursor:pointer">' +
        '<i data-lucide="' + meta.icon + '" style="width:16px;height:16px;color:#4f46e5;flex:0 0 auto"></i>' +
        '<span style="flex:1;min-width:0"><span style="display:block;font-weight:700;font-size:13px;color:#0f172a;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(d.title) + '</span>' +
        (d.mapName ? '<span style="display:block;font-size:10px;color:#94a3b8">' + esc(d.mapName) + '</span>' : '') + '</span>' +
        '<i data-lucide="qr-code" style="width:15px;height:15px;color:#16a34a;flex:0 0 auto"></i></button>' +
        '<button type="button" class="lt-doc-del" data-id="' + esc(d.id) + '" title="' + esc(_t('lt_sm_delete', 'Elimina')) + '" style="border:1px solid #fecaca;background:#fff;border-radius:10px;padding:9px 10px;cursor:pointer;color:#ef4444;flex:0 0 auto"><i data-lucide="trash-2" style="width:15px;height:15px"></i></button>' +
        '</div>';
    }).join('');
    var ov = makeOverlay('folder-down', _t('lt_pick_doc', 'Scegli il materiale'), inner, '520px');
    ov.querySelectorAll('.lt-doc').forEach(function (b) {
      b.onclick = function () {
        var d = window.MappAIStudyDocs.get(b.dataset.id);
        ov.remove(); cb(d);
      };
    });
    ov.querySelectorAll('.lt-doc-del').forEach(function (b) {
      b.onclick = function () {
        var id = b.dataset.id;
        var go = function () {
          if (window.MappAIStudyDocs && window.MappAIStudyDocs.remove) window.MappAIStudyDocs.remove(id);
          var row = ov.querySelector('.lt-doc-row[data-id="' + id + '"]'); if (row) row.remove();
          if (!ov.querySelector('.lt-doc-row')) { ov.remove(); toast(_t('lt_docs_empty', 'Nessun materiale rimasto.'), 'info'); }
          if (window.MappAITeach && window.MappAITeach.refresh) window.MappAITeach.refresh();
        };
        var msg = _t('lt_doc_del_confirm', 'Eliminare questo materiale dall\'archivio? (l\'operazione non si può annullare)');
        if (window.showConfirm) window.showConfirm(msg, go);
        else if (confirm(msg)) go();
      };
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
          var fname = (doc.title || 'materiale').replace(/[^\w\-]+/g, '_').slice(0, 40) + '.html';
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
    var opts = grades.map(function (g) {
      return '<button type="button" class="lt-grade" data-g="' + esc(g) + '" style="display:inline-flex;align-items:center;gap:6px;padding:8px 12px;border:1px solid ' + (core && core.normGrade(g) === core.normGrade(p.grade || '') ? '#4f46e5' : '#e2e8f0') + ';border-radius:10px;background:#fff;cursor:pointer;font-weight:600;font-size:13px;color:#0f172a">' + esc(g) + '</button>';
    }).join('');
    var inner = (grades.length ? '<div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:14px">' + opts + '</div>' : '') +
      '<label style="display:block;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#94a3b8;margin-bottom:6px">' + esc(_t('lt_grade_custom', 'Grado personalizzato')) + '</label>' +
      '<div style="display:flex;gap:8px"><input type="text" class="lt-grade-input" maxlength="40" value="' + esc(p.grade || '') + '" placeholder="' + esc(_t('lt_grade_ph', 'Es. 1ª media')) + '" style="flex:1;border:1px solid #c7d2fe;border-radius:10px;padding:9px 11px;font:inherit;background:#fff">' +
      '<button type="button" class="lt-grade-save" style="border:none;border-radius:10px;padding:9px 16px;background:#4f46e5;color:#fff;font-weight:700;cursor:pointer">' + esc(_t('lt_grade_save', 'Salva')) + '</button></div>' +
      (p.grade ? '<button type="button" class="lt-grade-clear" style="margin-top:10px;border:none;background:none;color:#ef4444;font-size:12px;font-weight:600;cursor:pointer">' + esc(_t('lt_grade_remove', 'Rimuovi grado')) + '</button>' : '');
    var ov = makeOverlay('graduation-cap', _t('lt_grade_title', 'Grado di ') + (p.name || ''), inner, '440px');
    var save = function (val) {
      p.grade = (val || '').trim().slice(0, 40) || null;
      try { localStorage.setItem('tutor_ai_projects', JSON.stringify(projects)); } catch (e) { }
      ov.remove(); renderBuildProjects();
    };
    ov.querySelectorAll('.lt-grade').forEach(function (b) { b.onclick = function () { save(b.dataset.g); }; });
    var inp = ov.querySelector('.lt-grade-input');
    var sv = ov.querySelector('.lt-grade-save'); if (sv) sv.onclick = function () { save(inp ? inp.value : ''); };
    var cl = ov.querySelector('.lt-grade-clear'); if (cl) cl.onclick = function () { save(''); };
    if (inp) inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') save(inp.value); });
  }

  // ── Init ───────────────────────────────────────────────────────────────────
  function init() {
    applyMode();
  }

  window.MappAITeach = {
    init: init,
    setMode: setMode,
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
    openSet: openSet,
    openReport: openReport,
    logSession: logSession,
    shareFromPc: shareFromPc,
    shareFile: shareFile,
    removeSharedFile: removeSharedFile,
    openSharedFolder: openSharedFolder,
    openSharedFile: openSharedFile,
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
    backfillVaults: backfillVaults,
    selectProject: selectProject,
    openDiskFile: openDiskFile,
    _selectedProject: null,
    openMapsFolder: openMapsFolder,
    openActivityFolder: openActivityFolder,
    _regRead: regRead,
    _regWrite: regWrite
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
  document.addEventListener('mappai-active-class-changed', function () { if (readMode() === 'teach') refresh(); });
  document.addEventListener('mappai-sharedmat-changed', function () { if (readMode() === 'teach') renderSharedMat(); });

  console.log('[MappAITeach] landing Costruisci/Insegna caricata');
})();
