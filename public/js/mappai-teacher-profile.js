/*
 * mappai-teacher-profile.js — Profilo INSEGNANTE (lato docente)
 * ---------------------------------------------------------------------------
 * Fase A della riorganizzazione profili (18/7/26). Il bottone header che prima
 * apriva "Profilo Studente" ora apre QUESTO modale con le info dell'insegnante:
 *   - nickname / ID
 *   - sedi di lavoro (opzione singola / multipla + nickname delle sedi)
 *   - discipline (singola / multiple)
 *   - ora di classe (sì/no)
 * Questi campi diventeranno FILTRI nella sezione "Insegna" (fasi successive) e
 * alimentano il selettore sede del form classi + i tag disciplina in Costruisci.
 *
 * ⚠️ NON tocca appState.userProfile / allProfiles: quella è la taratura STUDENTE
 * (usata da mm/kg-extraction, tutor, study). I profili studente restano gestiti
 * da mappai-user-profile.js (raggiungibili dal bottone "Profili studente" qui;
 * la Fase B li sposta nel toggle Classi/Studenti di Account classi).
 *
 * Store: localStorage 'mappai_teacher_profile'. Namespace: window.MappAITeacherProfile.
 * Caricare DOPO mappai-user-profile.js.
 */
(function () {
  'use strict';
  var LS = 'mappai_teacher_profile';
  var t = function (k, f) { return window.t ? window.t(k, f) : f; };
  function esc(s) { var d = document.createElement('div'); d.textContent = s == null ? '' : String(s); return d.innerHTML; }
  function toast(m, k) { if (window.showToast) window.showToast(m, k || 'info'); else console.log(m); }

  var DEFAULT = { nickname: '', sediMode: 'single', sedi: [], disciplineMode: 'single', discipline: [], oraDiClasse: false };

  function clean(d) {
    d = d || {};
    return {
      nickname: d.nickname != null ? String(d.nickname) : '',
      sediMode: d.sediMode === 'multi' ? 'multi' : 'single',
      sedi: Array.isArray(d.sedi) ? d.sedi.slice() : [],
      disciplineMode: d.disciplineMode === 'multi' ? 'multi' : 'single',
      discipline: Array.isArray(d.discipline) ? d.discipline.slice() : [],
      oraDiClasse: !!d.oraDiClasse
    };
  }

  var STORE = window.MappAITeacherProfile = { data: null };
  STORE.load = function () {
    try { var r = localStorage.getItem(LS); STORE.data = clean(r ? JSON.parse(r) : DEFAULT); }
    catch (e) { STORE.data = clean(DEFAULT); }
    return STORE.data;
  };
  STORE.get = function () { if (!STORE.data) STORE.load(); return STORE.data; };
  STORE.save = function () { try { localStorage.setItem(LS, JSON.stringify(STORE.data)); } catch (e) { /* quota */ } };

  // Helper per le fasi successive (form classi sede, Costruisci disciplina, filtri Insegna)
  STORE.sediList = function () {
    var d = STORE.get();
    var arr = (d.sedi || []).map(function (s) { return String(s).trim(); }).filter(Boolean);
    return d.sediMode === 'multi' ? arr : arr.slice(0, 1);
  };
  STORE.disciplineList = function () {
    var d = STORE.get();
    var arr = (d.discipline || []).map(function (s) { return String(s).trim(); }).filter(Boolean);
    return d.disciplineMode === 'multi' ? arr : arr.slice(0, 1);
  };
  STORE.hasOraDiClasse = function () { return !!STORE.get().oraDiClasse; };
  STORE.hasMultiSedi = function () { return STORE.get().sediMode === 'multi' && STORE.sediList().length > 1; };

  // ── Modale ────────────────────────────────────────────────────────────────
  var PRIMARY = 'background:#4f46e5;color:#fff', GHOST = 'background:#fff;color:#334155;border:1px solid #e2e8f0';
  var INP = 'width:100%;border:1px solid #e2e8f0;border-radius:10px;padding:9px 11px;font:inherit;color:#0f172a;background:#fff';

  function overlay(bodyHtml, maxWidth) {
    closeModal();
    var ov = document.createElement('div');
    ov.id = 'teacher-profile-modal';
    ov.style.cssText = 'position:fixed;inset:0;z-index:9992;background:rgba(15,23,42,.5);display:flex;align-items:center;justify-content:center;padding:18px';
    ov.innerHTML = '<div style="background:#f8fafc;border-radius:16px;box-shadow:0 25px 60px -12px rgba(0,0,0,.35);width:min(' + (maxWidth || '520px') + ',96vw);max-height:90vh;overflow-y:auto;padding:20px 24px" role="dialog" aria-modal="true">' +
      '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">' +
      '<div style="display:flex;align-items:center;gap:10px;font-weight:800;font-size:17px;color:#0f172a">' +
      '<i data-lucide="id-card" style="width:22px;height:22px;color:#4f46e5"></i>' + esc(t('tp_title', 'Profilo insegnante')) + '</div>' +
      '<button type="button" class="tp-close" style="background:none;border:none;cursor:pointer;color:#94a3b8;font-size:22px;line-height:1;padding:4px" aria-label="Chiudi">×</button>' +
      '</div><div id="tp-body"></div></div>';
    ov.addEventListener('click', function (e) { if (e.target === ov) closeModal(); });
    document.body.appendChild(ov);
    ov.querySelector('.tp-close').onclick = closeModal;
    if (window.safeCreateIcons) window.safeCreateIcons();
    return ov;
  }
  function closeModal() { var m = document.getElementById('teacher-profile-modal'); if (m) m.remove(); }

  function fieldLabel(txt) { return '<span style="display:block;font-size:11px;font-weight:700;color:#475569;margin-bottom:4px">' + esc(txt) + '</span>'; }
  function modeBtn(key, val, active, label) {
    return '<button type="button" data-mode="' + key + '" data-val="' + val + '" style="flex:1;border:1px solid ' + (active ? '#4f46e5' : '#e2e8f0') + ';background:' + (active ? '#eef2ff' : '#fff') + ';color:' + (active ? '#4f46e5' : '#334155') + ';border-radius:8px;padding:7px 10px;cursor:pointer;font-size:12px;font-weight:700">' + esc(label) + '</button>';
  }
  function listRow(key, v, ph) {
    return '<div style="display:flex;gap:6px" data-row="' + key + '"><input type="text" data-list="' + key + '" value="' + esc(v || '') + '" placeholder="' + esc(ph) + '" style="' + INP + '">' +
      '<button type="button" data-del-row="' + key + '" title="' + esc(t('tp_remove', 'Rimuovi')) + '" style="' + GHOST + ';border-radius:8px;padding:0 12px;cursor:pointer;color:#dc2626;font-weight:800">×</button></div>';
  }
  // Sezione lista (sedi/discipline): radio singola/multipla + input
  function listSection(key, mode, items, labelSingle, labelMulti, phSingle, phMulti) {
    var isMulti = mode === 'multi';
    var radios = '<div style="display:flex;gap:8px;margin-bottom:8px">' +
      modeBtn(key, 'single', !isMulti, labelSingle) + modeBtn(key, 'multi', isMulti, labelMulti) + '</div>';
    if (!isMulti) {
      var v = items && items[0] || '';
      return radios + '<input type="text" data-list="' + key + '" value="' + esc(v) + '" placeholder="' + esc(phSingle) + '" style="' + INP + '">';
    }
    var arr = (items && items.length) ? items : [''];
    return radios + '<div data-listwrap="' + key + '" style="display:flex;flex-direction:column;gap:6px">' +
      arr.map(function (x) { return listRow(key, x, phMulti); }).join('') + '</div>' +
      '<button type="button" data-add="' + key + '" style="margin-top:6px;' + GHOST + ';border-radius:8px;padding:6px 10px;cursor:pointer;font-size:12px;font-weight:700">+ ' + esc(t('tp_add', 'Aggiungi')) + '</button>';
  }

  window.showTeacherProfileModal = function () {
    var S = clean(STORE.get());
    var ov = overlay('');
    var body = ov.querySelector('#tp-body');

    function readList(key) {
      S[key] = Array.prototype.map.call(body.querySelectorAll('[data-list="' + key + '"]'), function (i) { return i.value; });
    }
    function readState() {
      var nk = body.querySelector('#tp-nickname'); if (nk) S.nickname = nk.value;
      readList('sedi'); readList('discipline');
      var oc = body.querySelector('#tp-ora'); if (oc) S.oraDiClasse = oc.checked;
    }
    function persist() {
      S.sedi = (S.sedi || []).map(function (s) { return String(s).trim(); }).filter(Boolean);
      S.discipline = (S.discipline || []).map(function (s) { return String(s).trim(); }).filter(Boolean);
      STORE.data = clean(S); STORE.save();
    }
    function render() {
      body.innerHTML =
        '<label style="display:block;margin-bottom:14px">' + fieldLabel(t('tp_nickname', 'Nickname / ID insegnante')) +
          '<input type="text" id="tp-nickname" value="' + esc(S.nickname) + '" placeholder="' + esc(t('tp_nickname_ph', 'Es. Prof. Rossi')) + '" style="' + INP + '"></label>' +
        '<div style="margin-bottom:14px">' + fieldLabel(t('tp_sedi', 'Sedi di lavoro')) +
          listSection('sedi', S.sediMode, S.sedi, t('tp_single_sede', 'Una sede'), t('tp_multi_sede', 'Più sedi'), t('tp_sede_ph', 'Nome sede (facoltativo)'), t('tp_sede_ph2', 'Nickname sede')) + '</div>' +
        '<div style="margin-bottom:14px">' + fieldLabel(t('tp_discipline', 'Discipline')) +
          listSection('discipline', S.disciplineMode, S.discipline, t('tp_single_disc', 'Una disciplina'), t('tp_multi_disc', 'Più discipline'), t('tp_disc_ph', 'Es. Storia'), t('tp_disc_ph2', 'Disciplina')) + '</div>' +
        '<label style="display:flex;align-items:center;gap:8px;margin-bottom:12px;cursor:pointer">' +
          '<input type="checkbox" id="tp-ora"' + (S.oraDiClasse ? ' checked' : '') + ' style="width:16px;height:16px;accent-color:#4f46e5">' +
          '<span style="font-size:13px;font-weight:600;color:#334155">' + esc(t('tp_ora', 'Ho un\'ora di classe')) + '</span></label>' +
        '<div style="font-size:11px;color:#94a3b8;margin-bottom:16px">' + esc(t('tp_filters_note', 'Discipline, sedi e ora di classe diventano filtri nella sezione Insegna.')) + '</div>' +
        '<button type="button" data-save style="width:100%;' + PRIMARY + ';border:none;border-radius:10px;padding:11px;cursor:pointer;font-weight:800;font-size:14px">' + esc(t('tp_save', 'Salva profilo')) + '</button>';
      bind();
      if (window.safeCreateIcons) window.safeCreateIcons();
    }
    function bind() {
      body.querySelectorAll('[data-mode]').forEach(function (b) {
        b.onclick = function () { readState(); S[b.getAttribute('data-mode') + 'Mode'] = b.getAttribute('data-val'); render(); };
      });
      body.querySelectorAll('[data-add]').forEach(function (b) {
        b.onclick = function () { readState(); var key = b.getAttribute('data-add'); S[key] = S[key].concat(['']); render(); };
      });
      body.querySelectorAll('[data-del-row]').forEach(function (b) {
        b.onclick = function () {
          readState();
          var key = b.getAttribute('data-del-row'), row = b.parentNode, wrap = row.parentNode;
          var i = Array.prototype.indexOf.call(wrap.children, row);
          if (i >= 0) { S[key].splice(i, 1); if (!S[key].length) S[key] = ['']; }
          render();
        };
      });
      var sv = body.querySelector('[data-save]'); if (sv) sv.onclick = function () { readState(); persist(); toast(t('tp_saved', 'Profilo insegnante salvato.'), 'success'); closeModal(); };
    }
    render();
  };

  STORE.load();
  console.log('[MappAITeacherProfile] profilo insegnante caricato');
})();
