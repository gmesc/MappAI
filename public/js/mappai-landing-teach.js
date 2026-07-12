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
  function readMode() { try { return localStorage.getItem(LS_MODE) === 'teach' ? 'teach' : 'build'; } catch (e) { return 'build'; } }
  function readFilter() { try { return localStorage.getItem(LS_FILTER) === 'active' ? 'active' : 'all'; } catch (e) { return 'all'; } }
  function regRead() { try { return JSON.parse(localStorage.getItem(LS_REGISTRY) || '[]'); } catch (e) { return []; } }
  function regWrite(arr) { try { localStorage.setItem(LS_REGISTRY, JSON.stringify(arr)); } catch (e) { /* quota */ } }
  function setsRead() { try { return JSON.parse(localStorage.getItem(LS_SETS) || '[]'); } catch (e) { return []; } }
  function projectsRead() { try { return JSON.parse(localStorage.getItem('tutor_ai_projects') || '[]'); } catch (e) { return []; } }
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
    var segB = document.getElementById('landing-mode-build');
    var segT = document.getElementById('landing-mode-teach');
    var clsFilter = document.getElementById('teach-class-filter');
    if (build) build.classList.toggle('hidden', mode !== 'build');
    if (teach) teach.classList.toggle('hidden', mode !== 'teach');
    if (segB) segB.classList.toggle('active', mode === 'build');
    if (segT) segT.classList.toggle('active', mode === 'teach');
    if (clsFilter) clsFilter.classList.toggle('hidden', mode !== 'teach');
    applyFilterSeg();
    if (mode === 'build') renderBuildProjects();
    else refresh();
  }

  function applyFilterSeg() {
    var f = readFilter();
    var a = document.getElementById('teach-filter-all');
    var c = document.getElementById('teach-filter-class');
    if (a) a.classList.toggle('active', f === 'all');
    if (c) c.classList.toggle('active', f === 'active');
  }

  function setMode(m) {
    try { localStorage.setItem(LS_MODE, m === 'teach' ? 'teach' : 'build'); } catch (e) { }
    applyMode();
  }

  function setClassFilter(f) {
    try { localStorage.setItem(LS_FILTER, f === 'active' ? 'active' : 'all'); } catch (e) { }
    applyFilterSeg();
    refresh();
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
    if (window.StorageManager && StorageManager.renderRecentProjects) {
      StorageManager.renderRecentProjects('recent-projects-container', { gradeMenu: true });
    }
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
    return '<div class="max-w-2xl mx-auto mb-6"><div class="flex flex-wrap gap-3">' +
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
      quickStartBar() +
      sectionShell('teach-projects', 'folder-open', _t('ui_teach_projects', 'Progetti esistenti'), 'teach-projects-body') +
      sectionShell('teach-materials', 'file-text', _t('ui_teach_materials', 'Materiali di studio'), 'teach-materials-body', docs.length) +
      sectionShell('teach-sharedmat', 'share-2', _t('ui_teach_sharedmat', 'File condivisi'), 'teach-sharedmat-body') +
      sectionShell('teach-sets', 'layers', _t('ui_teach_sets', 'Quiz & flashcard'), 'teach-sets-body', sets.length);
    // Progetti (renderer unico + filtro classe)
    if (window.StorageManager && StorageManager.renderRecentProjects) {
      StorageManager.renderRecentProjects('teach-projects-body', {
        classChips: true,
        onlyIds: allowedProjectIds(),
        emptyMsg: _t('lt_no_projects_class', 'Nessun progetto per questa classe. Mostra tutto per vederli tutti.')
      });
    }
    renderMaterials(docs);
    renderSharedMat();
    renderSets(sets);
    if (window.safeCreateIcons) window.safeCreateIcons();
  }

  // ── File condivisi (libreria "Materiali docente", IPC su disco) ────────────
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
    var addBar = '<div class="flex items-center gap-2 px-2 pb-2">' +
      '<button type="button" onclick="window.MappAITeach.shareFromPc()" class="inline-flex items-center gap-1.5 text-[11.5px] font-bold text-white bg-green-600 hover:bg-green-700 rounded-lg px-3 py-1.5">' +
      '<i data-lucide="upload" class="w-3.5 h-3.5"></i>' + esc(_t('lt_sm_add', 'Condividi da PC')) + '</button>' +
      '<button type="button" onclick="window.MappAITeach.openSharedFolder()" title="' + esc(_t('lt_sm_folder', 'Apri cartella')) + '" class="inline-flex items-center text-slate-400 hover:text-indigo-500 rounded-lg p-1.5">' +
      '<i data-lucide="folder" class="w-4 h-4"></i></button></div>';
    window.electronAPI.sharedmatList().then(function (r) {
      var items = (r && r.success && r.items) ? r.items : [];
      if (!items.length) {
        body.innerHTML = addBar + '<p class="text-xs text-slate-400 italic px-2 py-2">' +
          esc(_t('lt_sm_empty', 'Nessun file condiviso. Usa “Condividi da PC” per inviare una scheda o un documento agli allievi via QR.')) + '</p>';
        if (window.safeCreateIcons) window.safeCreateIcons();
        return;
      }
      body.innerHTML = addBar + items.map(function (it) {
        var chips = (it.sharedClasses || []).map(function (c) {
          return '<span class="inline-flex items-center gap-1 text-[10px] font-semibold text-indigo-500"><i data-lucide="graduation-cap" class="w-3 h-3"></i>' + esc(c) + '</span>';
        }).join(' ');
        return '<div class="flex items-center gap-2 px-2 py-2 border-b border-slate-100 hover:bg-indigo-50 rounded-lg">' +
          '<i data-lucide="' + smIcon(it.ext) + '" class="w-4 h-4 text-indigo-400 shrink-0"></i>' +
          '<span class="flex-1 min-w-0"><span class="block text-[12.5px] font-bold text-slate-700 truncate" title="' + esc(it.name) + '">' + esc(it.name) + '</span>' +
          '<span class="block text-[10px] text-slate-400 truncate">' + esc(smHuman(it.size)) + '</span></span>' +
          chips +
          '<button type="button" onclick="window.MappAITeach.shareFile(\'' + esc(it.id) + '\')" title="' + esc(_t('lt_sm_share', 'Condividi via QR')) + '" class="inline-flex items-center text-green-600 hover:text-green-700 rounded-lg p-1.5"><i data-lucide="qr-code" class="w-4 h-4"></i></button>' +
          '<button type="button" onclick="window.MappAITeach.removeSharedFile(\'' + esc(it.id) + '\')" title="' + esc(_t('lt_sm_delete', 'Elimina')) + '" class="inline-flex items-center text-slate-300 hover:text-red-500 rounded-lg p-1.5"><i data-lucide="trash-2" class="w-4 h-4"></i></button>' +
          '</div>';
      }).join('');
      if (window.safeCreateIcons) window.safeCreateIcons();
    }).catch(function () { body.innerHTML = addBar; if (window.safeCreateIcons) window.safeCreateIcons(); });
  }

  function shareFromPc() {
    if (!window.electronAPI || !window.electronAPI.sharedmatAdd) { toast(_t('lt_sm_desktop', 'Disponibile solo nell\'app desktop.'), 'warning'); return; }
    window.electronAPI.sharedmatAdd().then(function (r) {
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
    var go = function () { window.electronAPI.sharedmatRemove({ id: id }).then(function () { renderSharedMat(); }); };
    if (window.showConfirm) window.showConfirm(_t('lt_sm_del_confirm', 'Eliminare questo file dalla libreria? (la copia inviata agli allievi resta scaricata)'), go);
    else if (confirm(_t('lt_sm_del_confirm', 'Eliminare questo file dalla libreria?'))) go();
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
    var list = filterItems(docs.map(function (d) { return Object.assign({}, d, { mapName: d.mapName }); }));
    if (!list.length) {
      body.innerHTML = '<p class="text-xs text-slate-400 italic px-2 py-2">' +
        esc(_t('lt_no_materials', 'Nessun materiale archiviato. Genera una Sintesi, un Dossier, un Foglio nodi o una Timeline: compariranno qui.')) + '</p>';
      return;
    }
    body.innerHTML = list.map(function (d) {
      var meta = KIND_META[d.kind] || KIND_META.dossier;
      var dt = d.date ? new Date(d.date).toLocaleDateString('it-CH', { day: '2-digit', month: 'short', year: 'numeric' }) : '';
      var cls = d.cls
        ? '<span class="inline-flex items-center gap-1 text-[10px] font-semibold text-indigo-500"><i data-lucide="graduation-cap" class="w-3 h-3"></i>' + esc(d.cls) + '</span>'
        : '';
      return '<div class="flex items-center gap-2 px-2 py-2 border-b border-slate-100 hover:bg-indigo-50 rounded-lg cursor-pointer" onclick="window.MappAITeach.openDoc(\'' + esc(d.id) + '\')">' +
        '<i data-lucide="' + meta.icon + '" class="w-4 h-4 text-indigo-400 shrink-0"></i>' +
        '<span class="flex-1 min-w-0"><span class="block text-[12.5px] font-bold text-slate-700 truncate" title="' + esc(d.title) + '">' + esc(d.title) + '</span>' +
        '<span class="block text-[10px] text-slate-400 truncate">' + esc(_t(KIND_META[d.kind] ? 'lt_kind_' + d.kind : 'lt_kind_dossier', meta.label)) + (d.mapName ? ' · ' + esc(d.mapName) : '') + '</span></span>' +
        cls + '<span class="text-[10px] text-slate-400 shrink-0">' + esc(dt) + '</span>' +
        '<i data-lucide="external-link" class="w-3.5 h-3.5 text-indigo-400 shrink-0"></i></div>';
    }).join('');
  }

  function renderSets(sets) {
    var body = document.getElementById('teach-sets-body');
    if (!body) return;
    var list = filterItems(sets.slice());
    if (!list.length) {
      body.innerHTML = '<p class="text-xs text-slate-400 italic px-2 py-2">' +
        esc(_t('lt_no_sets', 'Nessun quiz o flashcard. Generali su una mappa e risalva il progetto: compariranno qui.')) + '</p>';
      return;
    }
    body.innerHTML = list.map(function (s) {
      var icon = s.type === 'flashcards' ? 'copy' : 'help-circle';
      var typeLbl = s.type === 'flashcards' ? _t('lt_type_flashcards', 'Flashcard') : _t('lt_type_quiz', 'Quiz');
      var dt = s.date ? new Date(s.date).toLocaleDateString('it-CH', { day: '2-digit', month: 'short', year: 'numeric' }) : '';
      var cls = s.cls
        ? '<span class="inline-flex items-center gap-1 text-[10px] font-semibold text-indigo-500"><i data-lucide="graduation-cap" class="w-3 h-3"></i>' + esc(s.cls) + '</span>'
        : '';
      return '<div class="flex items-center gap-2 px-2 py-2 border-b border-slate-100 hover:bg-indigo-50 rounded-lg cursor-pointer" onclick="window.MappAITeach.openSet(\'' + esc(s.projectId) + '\')">' +
        '<i data-lucide="' + icon + '" class="w-4 h-4 text-indigo-400 shrink-0"></i>' +
        '<span class="flex-1 min-w-0"><span class="block text-[12.5px] font-bold text-slate-700 truncate" title="' + esc(s.name) + '">' + esc(s.name) + '</span>' +
        '<span class="block text-[10px] text-slate-400 truncate">' + esc(typeLbl) + (s.mapName ? ' · ' + esc(s.mapName) : '') + '</span></span>' +
        cls + '<span class="text-[10px] text-slate-400 shrink-0">' + esc(dt) + '</span>' +
        '<i data-lucide="play-circle" class="w-3.5 h-3.5 text-indigo-400 shrink-0"></i></div>';
    }).join('');
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
      return '<button type="button" class="lt-doc" data-id="' + esc(d.id) + '" style="width:100%;text-align:left;display:flex;align-items:center;gap:9px;padding:10px 12px;border:1px solid #e2e8f0;border-radius:10px;background:#fff;cursor:pointer;margin-bottom:6px">' +
        '<i data-lucide="' + meta.icon + '" style="width:16px;height:16px;color:#4f46e5;flex:0 0 auto"></i>' +
        '<span style="flex:1;min-width:0"><span style="display:block;font-weight:700;font-size:13px;color:#0f172a;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(d.title) + '</span>' +
        (d.mapName ? '<span style="display:block;font-size:10px;color:#94a3b8">' + esc(d.mapName) + '</span>' : '') + '</span></button>';
    }).join('');
    var ov = makeOverlay('folder-down', _t('lt_pick_doc', 'Scegli il materiale'), inner, '520px');
    ov.querySelectorAll('.lt-doc').forEach(function (b) {
      b.onclick = function () {
        var d = window.MappAIStudyDocs.get(b.dataset.id);
        ov.remove(); cb(d);
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
    toggleBuildProjects: toggleBuildProjects,
    toggleSection: toggleSection,
    refresh: refresh,
    quickStart: quickStart,
    editGrade: editGrade,
    openDoc: openDoc,
    openSet: openSet,
    logSession: logSession,
    shareFromPc: shareFromPc,
    shareFile: shareFile,
    removeSharedFile: removeSharedFile,
    openSharedFolder: openSharedFolder,
    _regRead: regRead,
    _regWrite: regWrite
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
  document.addEventListener('mappai-active-class-changed', function () { if (readMode() === 'teach') refresh(); });
  document.addEventListener('mappai-sharedmat-changed', function () { if (readMode() === 'teach') renderSharedMat(); });

  console.log('[MappAITeach] landing Costruisci/Insegna caricata');
})();
