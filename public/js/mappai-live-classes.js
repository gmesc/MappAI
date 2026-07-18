/*
 * mappai-live-classes.js — Account classi (roster credenziali) — lato docente
 * ---------------------------------------------------------------------------
 * - window.MappAIClasses: store su DISCO (~/Documents/MappAI - Classi/classi.json)
 *   via IPC live-classes-load/save; fallback localStorage senza electronAPI (iPad).
 *   Persistere su disco (non solo localStorage) serve: le classi devono
 *   sopravvivere al reset profilo, essere portabili, ed essere leggibili quando
 *   si avvia una sessione live.
 * - window.openClassAccountsModal(): lista classi + crea/modifica (nome, anno,
 *   n. allievi → credenziali coppia emoji+numero via MappAILiveCore) + nome
 *   allievo opzionale per riga + stampa foglio credenziali + elimina.
 *
 * Caricare DOPO mappai-live-core.js e mappai-live-reports.js.
 * Le credenziali (identità = emoji+numero) sono generate da MappAILiveCore.buildCredentials.
 */
(function () {
  'use strict';

  var LC = window.MappAILiveCore;
  var LR = window.MappAILiveReports;
  var LS_KEY = 'mappai_classes';
  var ACTIVE_KEY = 'mappai_active_class';
  var t = function (k, f) { return window.t ? window.t(k, f) : f; };

  // Preset di registro linguistico → istruzione per l'AI
  var REGISTERS = {
    semplice: { label: 'Semplice (BES/DSA, primo biennio)', prompt: 'Usa un linguaggio molto semplice: frasi brevi, lessico concreto, un concetto per frase ed esempi dal quotidiano. Adatto a studenti BES/DSA e alle prime classi.' },
    medio: { label: 'Standard (medie / biennio)', prompt: 'Usa un linguaggio chiaro e standard: definizioni precise ma accessibili, periodi di media lunghezza.' },
    ricco: { label: 'Ricco (liceo / triennio)', prompt: 'Usa un linguaggio articolato con terminologia disciplinare completa; sono ammessi periodi complessi e connettivi logici avanzati.' }
  };
  function toast(m, k) { if (window.showToast) window.showToast(m, k || 'info'); else console.log(m); }
  function esc(s) { var d = document.createElement('div'); d.textContent = s == null ? '' : String(s); return d.innerHTML; }
  function hasIPC() { return !!(window.electronAPI && window.electronAPI.liveClassesLoad); }

  var STORE = window.MappAIClasses = {
    data: { schema: 'mappai-classes@1', classes: [] },
    loaded: false
  };

  STORE.load = function () {
    if (hasIPC()) {
      return window.electronAPI.liveClassesLoad().then(function (r) {
        if (r && r.success && r.data) STORE.data = r.data;
        if (!STORE.data.classes) STORE.data.classes = [];
        STORE.loaded = true;
        return STORE.data;
      }).catch(function () { STORE.loaded = true; return STORE.data; });
    }
    try {
      var raw = localStorage.getItem(LS_KEY);
      if (raw) STORE.data = JSON.parse(raw);
    } catch (e) { /* ignora */ }
    if (!STORE.data.classes) STORE.data.classes = [];
    STORE.loaded = true;
    return Promise.resolve(STORE.data);
  };

  STORE.save = function () {
    try { localStorage.setItem(LS_KEY, JSON.stringify(STORE.data)); } catch (e) { /* quota */ }
    if (hasIPC()) return window.electronAPI.liveClassesSave(STORE.data).catch(function (e) { console.warn('[Classi] save', e); });
    return Promise.resolve();
  };

  STORE.list = function () { return (STORE.data && STORE.data.classes) || []; };
  STORE.get = function (id) { return STORE.list().find(function (c) { return c.id === id; }) || null; };

  // ── Classe ATTIVA (governa la taratura AL momento della generazione) ─────
  STORE.activeId = function () { try { return localStorage.getItem(ACTIVE_KEY) || ''; } catch (e) { return ''; } };
  STORE.getActive = function () { var id = STORE.activeId(); return id ? STORE.get(id) : null; };
  // Azzera la classe attiva senza toast/eventi (usato dall'esclusione mutua con lo studente)
  STORE._clearActiveClassSilent = function () { try { localStorage.removeItem(ACTIVE_KEY); } catch (e) {} };
  STORE.setActive = function (id) {
    try { if (id) localStorage.setItem(ACTIVE_KEY, id); else localStorage.removeItem(ACTIVE_KEY); } catch (e) {}
    // esclusione mutua: attivare una classe azzera lo studente attivo (nessun accoppiamento)
    if (id && typeof _setActiveStudent === 'function') _setActiveStudent(null);
    renderChip();
    var c = id ? STORE.get(id) : null;
    if (c) toast(t('cls_active_set', 'Classe attiva: ') + c.name + ' — ' + t('cls_active_note', 'i contenuti AI saranno tarati su questa classe'), 'success');
    else toast(t('cls_active_none', 'Nessuna classe attiva: contenuti AI generici'), 'info');
    // notifica altri moduli (es. Live setup) che la classe attiva è cambiata
    try { document.dispatchEvent(new CustomEvent('mappai-active-class-changed', { detail: { id: id || '' } })); } catch (e) {}
  };

  // Blocco "PROFILO CLASSE" iniettato nei prompt di generazione. '' = generico.
  STORE.buildTuningBlock = function (cls) {
    var c = cls || STORE.getActive();
    if (!c) return '';
    var lines = [];
    var head = [];
    if (c.grade) head.push(String(c.grade).trim());
    if (c.system) head.push(t('cls_system_of', 'livello: ') + c.system);
    if (head.length) lines.push(t('cls_tune_class', 'Classe: ') + head.join(' · ') + '.');
    var reg = c.register && REGISTERS[c.register];
    if (reg) lines.push(reg.prompt);
    if (c.notes && String(c.notes).trim()) lines.push(t('cls_tune_notes', 'Note sulla classe: ') + String(c.notes).trim());
    if (!lines.length) return '';
    lines.push(t('cls_tune_fidelity', 'Resta fedele alla fonte: NON cambiare i fatti, adatta solo COME li esprimi (registro, esempi, lunghezza delle frasi).'));
    return '\n\n--- PROFILO CLASSE (' + t('cls_tune_hdr', 'adatta linguaggio ed esempi a questo pubblico') + ') ---\n' + lines.join('\n');
  };
  // usato da buildSystemInstruction (app.js): blocco della classe ATTIVA
  STORE.tuningForPrompt = function () { return STORE.buildTuningBlock(null); };

  function newId() { return 'cls_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6); }

  // Numero romano (1..13) → intero; null se non valido
  function romanToInt(s) {
    var map = { i: 1, v: 5, x: 10, l: 50, c: 100 };
    var str = String(s || '').toLowerCase(), total = 0, prev = 0;
    for (var i = str.length - 1; i >= 0; i--) {
      var v = map[str[i]];
      if (!v) return null;
      if (v < prev) total -= v; else { total += v; prev = v; }
    }
    return total > 0 && total <= 13 ? total : null;
  }

  // Valida il nome classe: numero arabo o romano + sezione (es. "1° A", "1a A", "II B").
  // Ritorna { ok, grade, section } oppure { ok:false, reason }.
  function validateClassName(raw) {
    var s = String(raw || '').trim();
    if (!s) return { ok: false, reason: 'empty' };
    var m = s.match(/^([0-9]{1,2}|[ivxlcIVXLC]+)\s*([°ºªao\.]*)\s*(.+)$/);
    if (!m) return { ok: false, reason: 'format' };
    var num = m[1], rest = (m[3] || '').trim();
    var grade = /^[0-9]+$/.test(num) ? parseInt(num, 10) : romanToInt(num);
    if (grade == null || grade < 1 || grade > 13) return { ok: false, reason: 'grade' };
    if (!/[a-zA-Z]/.test(rest)) return { ok: false, reason: 'section' };
    return { ok: true, grade: grade, section: rest };
  }

  // ── Modale ────────────────────────────────────────────────────────────────
  function overlay(bodyHtml, maxWidth) {
    closeModal();
    var ov = document.createElement('div');
    ov.id = 'class-accounts-modal';
    ov.style.cssText = 'position:fixed;inset:0;z-index:9992;background:rgba(15,23,42,.5);display:flex;align-items:center;justify-content:center;padding:18px';
    ov.innerHTML = '<div style="background:#f8fafc;border-radius:16px;box-shadow:0 25px 60px -12px rgba(0,0,0,.35);width:min(' + (maxWidth || '720px') + ',96vw);max-height:90vh;overflow-y:auto;padding:20px 24px" role="dialog" aria-modal="true">' +
      '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">' +
      '<div style="display:flex;align-items:center;gap:10px;font-weight:800;font-size:17px;color:#0f172a">' +
      '<i data-lucide="users" style="width:22px;height:22px;color:#4f46e5"></i>' + esc(t('cls_title', 'Account classi e studenti')) + '</div>' +
      '<button type="button" class="cls-close" style="background:none;border:none;cursor:pointer;color:#94a3b8;font-size:22px;line-height:1;padding:4px" aria-label="Chiudi">×</button>' +
      '</div>' + bodyHtml + '</div>';
    ov.addEventListener('click', function (e) { if (e.target === ov) closeModal(); });
    ov.querySelector('.cls-close').onclick = closeModal;
    document.body.appendChild(ov);
    if (window.safeCreateIcons) window.safeCreateIcons();
    return ov;
  }
  function closeModal() { var m = document.getElementById('class-accounts-modal'); if (m) m.remove(); }

  function btn(label, style) {
    return '<button type="button" style="border:none;border-radius:10px;padding:9px 14px;cursor:pointer;font-weight:700;font-size:12px;' + style + '">' + esc(label) + '</button>';
  }
  var PRIMARY = 'background:#4f46e5;color:#fff';
  var GHOST = 'background:#fff;color:#334155;border:1px solid #e2e8f0';
  var DANGER = 'background:#fff;color:#dc2626;border:1px solid #fee2e2';

  // ── Toggle Classi / Studenti (Fase B) ─────────────────────────────────────
  // I profili studente vivono in appState.allProfiles (+ userProfile = scheda
  // ATTIVA per la taratura AI). appState è `let` in app.js → accesso via
  // _getAppState (pattern di dev-console-metrics / mappai-user-profile).
  var _accountTab = 'classi';
  var FLD = 'width:100%;border:1px solid #e2e8f0;border-radius:10px;padding:9px 11px;font:inherit;color:#0f172a;background:#fff';
  function labelSpan(txt) { return '<span style="display:block;font-size:11px;font-weight:700;color:#475569;margin-bottom:4px">' + esc(txt) + '</span>'; }
  // Pallino: grigio = profilo standard · verde = taratura speciale (note BES o registro non standard)
  function _classSpecial(c) { return !!(c && ((c.notes && String(c.notes).trim()) || c.register === 'semplice' || c.register === 'ricco')); }
  function _studentSpecial(p) { return !!(p && p.notes && String(p.notes).trim()); }
  function tuneDot(special) {
    return '<span title="' + esc(special ? t('tune_special', 'Profilo con taratura speciale') : t('tune_standard', 'Profilo standard')) + '" style="display:inline-block;width:9px;height:9px;border-radius:50%;vertical-align:middle;margin-right:6px;background:' + (special ? '#16a34a' : '#cbd5e1') + '"></span>';
  }
  function _getAppState() { try { return (typeof appState !== 'undefined') ? appState : window.appState; } catch (e) { return window.appState; } }
  function _profiles() { var a = _getAppState(); return (a && Array.isArray(a.allProfiles)) ? a.allProfiles : []; }
  function _saveProfiles() {
    var a = _getAppState(); if (!a) return;
    try { localStorage.setItem('mappai_all_profiles', JSON.stringify(a.allProfiles || [])); } catch (e) { /* quota */ }
    if (a.userProfile) { try { localStorage.setItem('mappai_user_profile', JSON.stringify(a.userProfile)); } catch (e) { } }
  }
  function _activeNick() { var a = _getAppState(); return (a && a.userProfile && a.userProfile.nickname) ? a.userProfile.nickname : ''; }
  function _setActiveStudent(p) {
    var a = _getAppState(); if (!a) return;
    a.userProfile = p ? Object.assign({}, p) : { nickname: '', age: '', grade: '', system: 'Ticino' };
    // esclusione mutua: attivare uno studente azzera la classe attiva (silenzioso, no toast)
    if (p && STORE._clearActiveClassSilent) STORE._clearActiveClassSilent();
    _saveProfiles();
    if (window.updateProfilesDropdown) { try { window.updateProfilesDropdown(); } catch (e) { } }
    if (typeof renderChip === 'function') renderChip();
    if (window.refreshLevelTuneRow) window.refreshLevelTuneRow();
  }

  function tabBar(active) {
    var tb = function (id, label) {
      var on = active === id;
      return '<button type="button" data-tab="' + id + '" style="flex:1;border:none;border-bottom:2px solid ' + (on ? '#4f46e5' : 'transparent') + ';background:none;padding:9px 4px;cursor:pointer;font-weight:800;font-size:13px;color:' + (on ? '#4f46e5' : '#94a3b8') + '">' + esc(label) + '</button>';
    };
    return '<div style="display:flex;gap:8px;border-bottom:1px solid #e2e8f0;margin-bottom:14px">' +
      tb('classi', t('cls_tab_classi', 'Classi')) + tb('studenti', t('cls_tab_studenti', 'Studenti')) + '</div>';
  }
  function wireTabs(ov) {
    ov.querySelectorAll('[data-tab]').forEach(function (b) {
      b.onclick = function () { var id = b.getAttribute('data-tab'); _accountTab = id; if (id === 'studenti') renderStudents(); else renderList(); };
    });
  }

  // Lista classi
  function renderList() {
    _accountTab = 'classi';
    var classes = STORE.list();
    var activeId = STORE.activeId();
    var rows = classes.length ? classes.map(function (c) {
      var isActive = c.id === activeId;
      return '<div data-activate="' + c.id + '" style="display:flex;align-items:center;gap:12px;background:' + (isActive ? '#eef2ff' : '#fff') + ';border:1px solid ' + (isActive ? '#4f46e5' : '#e2e8f0') + ';border-radius:12px;padding:12px 14px;margin-bottom:8px;cursor:pointer">' +
        '<i data-lucide="graduation-cap" style="width:20px;height:20px;color:#6366f1;flex-shrink:0"></i>' +
        '<div style="flex:1;min-width:0"><div style="font-weight:800;color:#0f172a">' + tuneDot(_classSpecial(c)) + esc(c.name) + (isActive ? ' <span style="font-size:10px;color:#4f46e5;font-weight:800">(' + esc(t('stu_active', 'attiva')) + ')</span>' : '') + '</div>' +
        '<div style="font-size:11px;color:#94a3b8">' + esc(c.year || '') + ' · ' + (c.students || []).length + ' allievi</div></div>' +
        '<button type="button" data-edit="' + c.id + '" style="' + GHOST + ';border-radius:8px;padding:6px 12px;cursor:pointer;font-size:11px;font-weight:700">' + esc(t('cls_manage', 'Gestisci')) + '</button>' +
        '</div>';
    }).join('') : '<div style="text-align:center;color:#94a3b8;padding:24px 0;font-size:13px">' + esc(t('cls_empty', 'Nessuna classe. Creane una per generare le credenziali degli allievi.')) + '</div>';

    var body = tabBar('classi') +
      '<div style="font-size:12px;color:#64748b;margin-bottom:12px">' +
      esc(t('cls_intro_sel', 'Clicca una classe per renderla ATTIVA (tara la generazione e filtra la sezione Insegna). "Gestisci" per modificarla.')) + '</div>' +
      rows +
      '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-top:14px">' +
      (activeId ? btn(t('cls_generic', 'Generico'), GHOST).replace('<button', '<button data-cgeneric="1"') : '<span></span>') +
      btn('+ ' + t('cls_new', 'Nuova classe'), PRIMARY).replace('<button', '<button data-new="1"') + '</div>';

    var ov = overlay(body);
    wireTabs(ov);
    ov.querySelectorAll('[data-activate]').forEach(function (b) { b.onclick = function () { STORE.setActive(b.getAttribute('data-activate')); renderList(); }; });
    ov.querySelectorAll('[data-edit]').forEach(function (b) { b.onclick = function (e) { e.stopPropagation(); renderEdit(b.getAttribute('data-edit')); }; });
    var gb = ov.querySelector('[data-cgeneric]'); if (gb) gb.onclick = function () { STORE.setActive(''); renderList(); };
    var nb = ov.querySelector('[data-new]'); if (nb) nb.onclick = renderCreate;
  }

  // ── Studenti (profili allievi) — sezione del toggle ───────────────────────
  function renderStudents() {
    _accountTab = 'studenti';
    var profs = _profiles();
    var active = _activeNick();
    var rows = profs.length ? profs.map(function (p, i) {
      var cls = p.classId ? STORE.get(p.classId) : null;
      var sub = [p.grade || '', cls ? cls.name : '', p.age ? p.age + ' ' + t('stu_years', 'anni') : ''].filter(Boolean).join(' · ');
      var isActive = active && p.nickname && p.nickname.toLowerCase() === active.toLowerCase();
      return '<div style="display:flex;align-items:center;gap:12px;background:#fff;border:1px solid ' + (isActive ? '#4f46e5' : '#e2e8f0') + ';border-radius:12px;padding:12px 14px;margin-bottom:8px">' +
        '<i data-lucide="user" style="width:20px;height:20px;color:#6366f1;flex-shrink:0"></i>' +
        '<div style="flex:1;min-width:0"><div style="font-weight:800;color:#0f172a">' + tuneDot(_studentSpecial(p)) + esc(p.nickname || '—') + (isActive ? ' <span style="font-size:10px;color:#4f46e5;font-weight:800">(' + esc(t('stu_active', 'attiva')) + ')</span>' : '') + '</div>' +
        '<div style="font-size:11px;color:#94a3b8">' + esc(sub || '—') + '</div></div>' +
        '<button type="button" data-sedit="' + i + '" style="' + GHOST + ';border-radius:8px;padding:6px 12px;cursor:pointer;font-size:11px;font-weight:700">' + esc(t('cls_manage', 'Gestisci')) + '</button>' +
        '</div>';
    }).join('') : '<div style="text-align:center;color:#94a3b8;padding:24px 0;font-size:13px">' + esc(t('stu_empty', 'Nessuna scheda studente. Creane una per un allievo che segui (es. sostegno).')) + '</div>';
    var body = tabBar('studenti') +
      '<div style="font-size:12px;color:#64748b;margin-bottom:12px">' + esc(t('stu_intro', 'Schede allievo per la taratura AI individuale (utile al docente di sostegno). "Attiva" una scheda per generare al livello di quello studente.')) + '</div>' +
      rows +
      '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-top:14px">' +
      (active ? btn(t('stu_generic', 'Nessuno (generico)'), GHOST).replace('<button', '<button data-sgeneric="1"') : '<span></span>') +
      btn('+ ' + t('stu_new', 'Nuova scheda studente'), PRIMARY).replace('<button', '<button data-snew="1"') + '</div>';
    var ov = overlay(body);
    wireTabs(ov);
    ov.querySelectorAll('[data-sedit]').forEach(function (b) { b.onclick = function () { renderStudentEdit(parseInt(b.getAttribute('data-sedit'), 10)); }; });
    var nb = ov.querySelector('[data-snew]'); if (nb) nb.onclick = renderStudentCreate;
    var gb = ov.querySelector('[data-sgeneric]'); if (gb) gb.onclick = function () { _setActiveStudent(null); renderStudents(); };
  }

  // Form scheda studente (create/edit) — sezioni in card, allineate al modale classi:
  // card bianca "Dati studente" (identità) + card indaco "Taratura AI" (gemella di quella
  // delle classi) che racchiude le note BES/DSA.
  function studentFormBody(p, titleTxt) {
    var classesOpts = '<option value="">' + esc(t('stu_no_class', '— nessuna classe —')) + '</option>' + STORE.list().map(function (c) {
      return '<option value="' + c.id + '"' + (p && p.classId === c.id ? ' selected' : '') + '>' + esc(c.name) + '</option>';
    }).join('');

    // Card bianca identità — stessa veste della card "Nome classe" del modale classi
    var identCard = '<div style="background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:12px 14px;margin-bottom:12px">' +
      '<div style="font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:#475569;margin-bottom:10px">' + esc(t('stu_ident_title', 'Dati studente')) + '</div>' +
      '<div style="display:flex;flex-direction:column;gap:12px">' +
      '<label style="display:block">' + labelSpan(t('stu_nick', 'Nome / nickname allievo')) +
      '<input id="stu-nick" type="text" value="' + esc(p && p.nickname || '') + '" placeholder="' + esc(t('stu_nick_ph', 'Es. Marco')) + '" style="' + FLD + '"></label>' +
      '<div style="display:flex;gap:8px">' +
      '<label style="flex:0 0 100px">' + labelSpan(t('stu_age', 'Età')) + '<input id="stu-age" type="number" inputmode="numeric" min="1" value="' + esc(p && p.age || '') + '" style="' + FLD + '"></label>' +
      '<label style="flex:1;min-width:0">' + labelSpan(t('stu_class', 'Classe di appartenenza')) + '<select id="stu-class" style="' + FLD + '">' + classesOpts + '</select></label></div>' +
      '<label style="display:block">' + labelSpan(t('stu_grade', 'Grado e livello')) +
      '<div style="display:flex;gap:8px">' + gradeSelect('stu-grade-num', p && p.gradeNum != null ? p.gradeNum : '', p && p.system || '') + '<span style="flex:1"></span></div></label>' +
      '</div></div>';

    // Card indaco "Taratura AI" — gemella di quella delle classi: titolo + "?" + hint +
    // box esplicativo a scomparsa + textarea note (bordo indaco come cls-notes)
    var tuningCard = '<div style="background:#eef2ff;border:1px solid #c7d2fe;border-radius:12px;padding:12px 14px;margin-bottom:12px">' +
      '<div style="display:flex;align-items:center;gap:6px;margin-bottom:8px">' +
      '<div style="font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:#4f46e5">' + t('cls_tuning_title', '🎯 Taratura AI') + '</div>' +
      '<button type="button" id="stu-tuning-help" title="' + esc(t('cls_tuning_help_tip', 'Come funziona la taratura?')) + '" style="width:18px;height:18px;border-radius:50%;border:1px solid #a5b4fc;background:#fff;color:#4f46e5;font-weight:800;font-size:11px;line-height:1;cursor:pointer;display:flex;align-items:center;justify-content:center;flex:none;padding:0">?</button>' +
      '</div>' +
      '<div style="font-size:11px;color:#64748b;margin-bottom:10px">' + t('stu_tuning_hint', 'Adatta la generazione AI (mappe, quiz, cloze) a questo studente quando la sua scheda è attiva. Cambia il linguaggio, non i fatti.') + '</div>' +
      '<div id="stu-tuning-explain" style="display:none;background:#fff;border:1px solid #c7d2fe;border-radius:8px;padding:10px 12px;margin-bottom:10px;font-size:12px;line-height:1.55;color:#334155">' +
      t('stu_tuning_explain', 'La taratura non cambia i <b>fatti</b>: cambia solo <b>come</b> l\'AI spiega i contenuti a questo studente.<br><br>' +
        '<b>Grado e livello</b> — regolano profondità e complessità dei contenuti.<br>' +
        '<b>Note</b> — indicazioni libere su bisogni e interessi (es. «DSA, frasi brevi», «esempi dallo sport», «evita metafore astratte»).<br><br>' +
        'Vale per mappe, quiz, cloze e tutor generati quando questa scheda studente è <b>attiva</b>. Le mappe già create non vengono ri-tradotte.') +
      '</div>' +
      '<textarea id="stu-notes" placeholder="' + esc(t('stu_notes_ph', 'Es. dislessia; frasi brevi; esempi concreti')) + '" style="width:100%;min-height:56px;border:1px solid #c7d2fe;border-radius:8px;padding:8px 10px;font:inherit;background:#fff;resize:vertical">' + esc(p && p.notes || '') + '</textarea></div>';

    return '<div style="font-weight:800;font-size:15px;color:#0f172a;margin-bottom:12px">' + esc(titleTxt) + '</div>' +
      identCard + tuningCard;
  }
  function wireStudentForm(ov, p, editIdx) {
    var sHelp = ov.querySelector('#stu-tuning-help');
    if (sHelp) sHelp.onclick = function () {
      var ex = ov.querySelector('#stu-tuning-explain');
      if (ex) ex.style.display = ex.style.display === 'none' ? 'block' : 'none';
    };
    var clsSel = ov.querySelector('#stu-class'), gnSel = ov.querySelector('#stu-grade-num');
    if (clsSel && gnSel) clsSel.onchange = function () {
      var c = clsSel.value ? STORE.get(clsSel.value) : null;
      if (c && c.gradeNum && schoolKeyOf(c.system)) gnSel.value = schoolKeyOf(c.system) + ':' + c.gradeNum;
    };
    var bk = ov.querySelector('[data-back]'); if (bk) bk.onclick = renderStudents;
    var sv = ov.querySelector('[data-ssave]'); if (sv) sv.onclick = function () {
      var nick = (ov.querySelector('#stu-nick').value || '').trim();
      if (!nick) { toast(t('stu_need_nick', 'Inserisci il nome dell\'allievo.'), 'error'); return; }
      var a = _getAppState(); if (!a) { toast('appState non disponibile', 'error'); return; }
      if (!Array.isArray(a.allProfiles)) a.allProfiles = [];
      var dupIdx = a.allProfiles.findIndex(function (x) { return x.nickname && x.nickname.toLowerCase() === nick.toLowerCase(); });
      if (dupIdx >= 0 && dupIdx !== editIdx) { toast(t('stu_dup', 'Esiste già una scheda con questo nome.'), 'error'); return; }
      var pg = parseGradeValue(gnSel.value);
      var classId = clsSel.value || '';
      var cls = classId ? STORE.get(classId) : null;
      var rec = {
        nickname: nick,
        age: (ov.querySelector('#stu-age').value || '').trim(),
        gradeNum: pg.gradeNum || (cls && cls.gradeNum) || null,
        system: pg.system || (cls && cls.system) || '',
        grade: pg.gradeNum ? (String(pg.gradeNum) + 'ª') : ((cls && cls.grade) || ''),
        classId: classId || null,
        notes: (ov.querySelector('#stu-notes').value || '').trim().slice(0, 400)
      };
      var oldNick = (editIdx != null && a.allProfiles[editIdx]) ? a.allProfiles[editIdx].nickname : null;
      var wasActive = _activeNick() && oldNick && oldNick.toLowerCase() === _activeNick().toLowerCase();
      if (editIdx != null && a.allProfiles[editIdx]) a.allProfiles[editIdx] = Object.assign({}, a.allProfiles[editIdx], rec);
      else a.allProfiles.push(rec);
      _saveProfiles();
      if (wasActive) _setActiveStudent(rec);
      toast(t('stu_saved', 'Scheda studente salvata.'), 'success');
      renderStudents();
    };
  }
  function renderStudentCreate() {
    var body = studentFormBody(null, t('stu_new', 'Nuova scheda studente')) +
      '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px">' +
      btn(t('cls_cancel', 'Annulla'), GHOST).replace('<button', '<button data-back="1"') +
      btn(t('stu_create', 'Crea scheda'), PRIMARY).replace('<button', '<button data-ssave="1"') + '</div>';
    var ov = overlay(body, '480px');
    wireStudentForm(ov, null, null);
  }
  function renderStudentEdit(idx) {
    var profs = _profiles();
    var p = profs[idx];
    if (!p) { renderStudents(); return; }
    var active = _activeNick() && p.nickname && p.nickname.toLowerCase() === _activeNick().toLowerCase();
    var body = studentFormBody(p, p.nickname || t('stu_edit', 'Scheda studente')) +
      '<div style="display:flex;gap:8px;justify-content:space-between;margin-top:14px">' +
      btn(t('cls_delete', 'Elimina'), DANGER).replace('<button', '<button data-sdel="1"') +
      '<div style="display:flex;gap:8px">' +
      btn(active ? t('stu_is_active', 'Attiva ✓') : t('stu_activate', 'Attiva per taratura'), active ? GHOST : PRIMARY).replace('<button', '<button data-sactivate="1"') +
      btn(t('cls_save_names', 'Salva'), PRIMARY).replace('<button', '<button data-ssave="1"') +
      '</div></div>';
    var ov = overlay(body, '480px');
    wireStudentForm(ov, p, idx);
    var act = ov.querySelector('[data-sactivate]'); if (act) act.onclick = function () {
      _setActiveStudent(_profiles()[idx]); // attiva la versione SALVATA (non ricarica il form: conserva le modifiche non salvate)
      toast(t('stu_activated', 'Scheda attiva per la taratura.'), 'success');
      act.textContent = t('stu_is_active', 'Attiva ✓'); act.disabled = true; act.style.opacity = '0.65'; act.style.cursor = 'default';
    };
    var del = ov.querySelector('[data-sdel]'); if (del) del.onclick = function () {
      var go = function () { var a = _getAppState(); if (a && a.allProfiles) { if (active) _setActiveStudent(null); a.allProfiles.splice(idx, 1); _saveProfiles(); } renderStudents(); };
      if (window.showConfirm) window.showConfirm(t('stu_del_confirm', 'Eliminare questa scheda studente?'), go);
      else if (confirm(t('stu_del_confirm', 'Eliminare questa scheda studente?'))) go();
    };
  }

  // Nome canonico della classe: grado (numero) + sezione UPPERCASE, senza spazi
  // (es. 1 + "a" → "1A"). Sezione vuota → solo il grado ("1"). Unica fonte del nome.
  function buildClassName(gradeNum, section) {
    var g = parseInt(gradeNum, 10);
    if (!(g >= 1)) return '';
    var s = String(section || '').trim().toUpperCase().replace(/\s+/g, '');
    return String(g) + s;
  }

  // Etichette scuola ↔ valore salvato in c.system
  var SCHOOL_LABEL = { media: 'Scuola Media', liceo: 'Liceo' };

  // Categoria scuola dal system della classe (per preselezionare l'optgroup giusto)
  function schoolKeyOf(system) {
    var s = String(system || '').toLowerCase();
    if (/lice|superior/.test(s)) return 'liceo';
    if (/medi/.test(s)) return 'media';
    return '';
  }

  // "media:2" → { gradeNum:2, system:'Scuola Media', school:'media' }; '' → vuoto
  function parseGradeValue(v) {
    var m = String(v || '').match(/^(media|liceo):([1-4])$/);
    if (!m) return { gradeNum: null, system: '', school: '' };
    return { gradeNum: parseInt(m[2], 10), system: SCHOOL_LABEL[m[1]], school: m[1] };
  }

  // <select> del grado, raggruppato per scuola (Scuola Media / Liceo), classi 1..4.
  // Niente più testo libero sul numero (causa dei nomi ingestibili tipo "1a media").
  // La categoria imposta anche il livello (system). currentGrade+currentSystem
  // preselezionano la voce giusta.
  function gradeSelect(id, currentGrade, currentSystem) {
    var selKey = schoolKeyOf(currentSystem);
    var none = (currentGrade == null || currentGrade === '');
    var opts = '<option value=""' + (none ? ' selected' : '') + '>' + esc(t('cls_grade_pick', '— grado —')) + '</option>';
    ['media', 'liceo'].forEach(function (sk) {
      opts += '<optgroup label="' + esc(t(sk === 'media' ? 'cls_grp_media' : 'cls_grp_liceo', SCHOOL_LABEL[sk])) + '">';
      for (var g = 1; g <= 4; g++) {
        var sel = !none && sk === selKey && String(currentGrade) === String(g);
        opts += '<option value="' + sk + ':' + g + '"' + (sel ? ' selected' : '') + '>' + g + 'ª</option>';
      }
      opts += '</optgroup>';
    });
    return '<select id="' + id + '" style="flex:0 0 168px;border:1px solid #e2e8f0;border-radius:10px;padding:9px 11px;font:inherit;color:#0f172a;background:#fff">' + opts + '</select>';
  }

  // Sezione: forza UPPERCASE nel campo mentre si digita, preservando il cursore.
  function forceUpper(inp) {
    var up = (inp.value || '').toUpperCase();
    if (up === inp.value) return;
    var p = inp.selectionStart;
    inp.value = up;
    try { inp.setSelectionRange(p, p); } catch (e) { /* input senza selezione */ }
  }

  // Form nuova classe — grado a tendina (1-4) + sezione libera UPPERCASE → nome canonico
  function renderCreate() {
    var thisYear = new Date().getFullYear();
    var body = '<div style="display:flex;flex-direction:column;gap:12px">' +
      '<label style="display:block"><span style="display:block;font-size:11px;font-weight:700;color:#475569;margin-bottom:4px">' + esc(t('cls_ident', 'Classe')) + '</span>' +
      '<div style="display:flex;gap:8px">' + gradeSelect('cls-grade-num', '', '') +
      '<input id="cls-section" type="text" maxlength="4" placeholder="' + esc(t('cls_section_ph', 'Sezione (es. A)')) + '" style="flex:1;min-width:0;border:1px solid #e2e8f0;border-radius:10px;padding:9px 11px;font:inherit;color:#0f172a;background:#fff;text-transform:uppercase"></div></label>' +
      '<div id="cls-name-hint" style="font-size:11px;font-weight:600;margin-top:-6px;min-height:14px"></div>' +
      yearField(thisYear) +
      field('cls-count', t('cls_count', 'Numero allievi'), 'number', 'es. 18') +
      '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:6px">' +
      btn(t('cls_cancel', 'Annulla'), GHOST).replace('<button', '<button data-back="1"') +
      btn(t('cls_create', 'Crea classe'), PRIMARY).replace('<button', '<button data-save="1"') +
      '</div></div>';
    var ov = overlay(body, '480px');
    ov.querySelector('[data-back]').onclick = renderList;

    // Anteprima live del nome canonico + avviso duplicato
    var gradeSel = ov.querySelector('#cls-grade-num');
    var sectionInput = ov.querySelector('#cls-section');
    var nameHint = ov.querySelector('#cls-name-hint');
    function refreshNameHint() {
      forceUpper(sectionInput);
      var pg = parseGradeValue(gradeSel.value);
      var nm = buildClassName(pg.gradeNum, sectionInput.value);
      if (!nm) { nameHint.textContent = ''; return; }
      var dup = STORE.list().some(function (c) { return c.name === nm; });
      nameHint.textContent = (dup ? '⚠ ' : '✓ ') + t('cls_name_will', 'Nome classe: ') + nm +
        (pg.system ? ' · ' + pg.system : '') + (dup ? ' — ' + t('cls_dup_short', 'nome già in uso') : '');
      nameHint.style.color = dup ? '#d97706' : '#16a34a';
    }
    gradeSel.addEventListener('change', refreshNameHint);
    sectionInput.addEventListener('input', refreshNameHint);

    // Anno scolastico: [anno1] / [anno2] con auto-riempimento dell'anno successivo
    var y1 = ov.querySelector('#cls-year1'), y2 = ov.querySelector('#cls-year2');
    var y2Auto = true;
    y2.addEventListener('input', function () { y2Auto = false; });
    y1.addEventListener('input', function () {
      var v = parseInt(y1.value, 10);
      if (y2Auto && v >= 1900 && v <= 2200) y2.value = String(v + 1);
    });

    ov.querySelector('[data-save]').onclick = function () {
      var pg = parseGradeValue(gradeSel.value);
      var gradeNum = pg.gradeNum;
      var section = (sectionInput.value || '').trim().toUpperCase().replace(/\s+/g, '');
      var name = buildClassName(gradeNum, section);
      var y1v = (y1.value || '').trim(), y2v = (y2.value || '').trim();
      var year = y1v && y2v ? (y1v + '/' + y2v) : (y1v || y2v || '');
      var count = parseInt(ov.querySelector('#cls-count').value, 10) || 0;
      if (!(gradeNum >= 1 && gradeNum <= 4) || !name) {
        toast(t('cls_need_grade', 'Scegli il grado (1–4).'), 'error'); gradeSel.focus(); return;
      }
      if (STORE.list().some(function (c) { return c.name === name; })) {
        toast(t('cls_dup', 'Esiste già la classe «') + name + t('cls_dup2', '». Cambia grado o sezione.'), 'error');
        sectionInput.focus(); return;
      }
      if (count < 1) { toast(t('cls_need_count', 'Inserisci il numero di allievi.'), 'error'); return; }
      if (count > LC.MAX_IDENTITIES) { toast(t('cls_too_many', 'Numero allievi troppo alto') + ' (max ' + LC.MAX_IDENTITIES + ').', 'error'); return; }
      var cls = { id: newId(), name: name, gradeNum: gradeNum, section: section, grade: String(gradeNum) + 'ª', system: pg.system, year: year, students: LC.buildCredentials(count) };
      STORE.data.classes.push(cls);
      STORE.save();
      renderEdit(cls.id);
    };
  }

  // Campo "Anno scolastico": due input numerici separati da "/"
  function yearField(thisYear) {
    var inStyle = 'flex:1;min-width:0;border:1px solid #e2e8f0;border-radius:10px;padding:9px 11px;font:inherit;color:#0f172a;background:#fff;text-align:center';
    return '<label style="display:block"><span style="display:block;font-size:11px;font-weight:700;color:#475569;margin-bottom:4px">' + esc(t('cls_year', 'Anno scolastico')) + '</span>' +
      '<div style="display:flex;align-items:center;gap:8px">' +
      '<input id="cls-year1" type="number" inputmode="numeric" min="1900" max="2200" placeholder="' + thisYear + '" style="' + inStyle + '">' +
      '<span style="font-weight:800;color:#94a3b8;font-size:16px">/</span>' +
      '<input id="cls-year2" type="number" inputmode="numeric" min="1900" max="2200" placeholder="' + (thisYear + 1) + '" style="' + inStyle + '">' +
      '</div></label>';
  }

  function field(id, label, type, ph) {
    return '<label style="display:block"><span style="display:block;font-size:11px;font-weight:700;color:#475569;margin-bottom:4px">' + esc(label) + '</span>' +
      '<input id="' + id + '" type="' + type + '" placeholder="' + esc(ph) + '" ' + (type === 'number' ? 'inputmode="numeric" min="1"' : '') +
      ' style="width:100%;border:1px solid #e2e8f0;border-radius:10px;padding:9px 11px;font:inherit;color:#0f172a;background:#fff"></label>';
  }

  // Modifica classe: nomi opzionali, credenziali, stampa, elimina
  function renderEdit(id) {
    var c = STORE.get(id);
    if (!c) { renderList(); return; }
    var rows = (c.students || []).map(function (s, i) {
      return '<div style="display:flex;align-items:center;gap:10px;padding:6px 0;border-bottom:1px solid #f1f5f9">' +
        '<span style="font-size:24px;line-height:1;width:32px;text-align:center">' + esc(s.emoji) + '</span>' +
        '<span style="font-weight:800;color:#4f46e5;width:34px">' + esc(s.num) + '</span>' +
        '<input data-name="' + i + '" value="' + esc(s.name || '') + '" placeholder="' + esc(t('cls_name_opt', 'Nome (facoltativo)')) + '" ' +
        'style="flex:1;border:none;border-bottom:1px dashed #cbd5e1;background:transparent;padding:4px 2px;font:inherit;color:#0f172a"></div>';
    }).join('');

    var regOpts = ['', 'semplice', 'medio', 'ricco'].map(function (r) {
      var lbl = r ? REGISTERS[r].label : t('cls_reg_none', '— registro —');
      return '<option value="' + r + '"' + (c.register === r ? ' selected' : '') + '>' + esc(lbl) + '</option>';
    }).join('');
    var tuning = '<div style="background:#eef2ff;border:1px solid #c7d2fe;border-radius:12px;padding:12px 14px;margin-bottom:12px">' +
      '<div style="display:flex;align-items:center;gap:6px;margin-bottom:8px">' +
      '<div style="font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:#4f46e5">' + t('cls_tuning_title', '🎯 Taratura AI') + '</div>' +
      '<button type="button" id="cls-tuning-help" title="' + esc(t('cls_tuning_help_tip', 'Come funziona la taratura?')) + '" style="width:18px;height:18px;border-radius:50%;border:1px solid #a5b4fc;background:#fff;color:#4f46e5;font-weight:800;font-size:11px;line-height:1;cursor:pointer;display:flex;align-items:center;justify-content:center;flex:none;padding:0">?</button>' +
      '</div>' +
      '<div style="font-size:11px;color:#64748b;margin-bottom:10px">' + t('cls_tuning_hint', 'Guida la generazione AI (mappe, quiz, cloze) al livello di questa classe. Adatta il linguaggio, non i fatti.') + '</div>' +
      '<div id="cls-tuning-explain" style="display:none;background:#fff;border:1px solid #c7d2fe;border-radius:8px;padding:10px 12px;margin-bottom:10px;font-size:12px;line-height:1.55;color:#334155">' +
      t('cls_tuning_explain', 'La taratura non cambia i <b>fatti</b>: cambia solo <b>come</b> l\'AI li spiega, per calibrarli su questa classe.<br><br>' +
        '<b>Grado e livello</b> — presi dalla sezione «Nome classe» qui sopra (grado + Scuola Media / Liceo): regolano profondità e complessità dei contenuti.<br>' +
        '<b>Registro</b> — quanto è semplice o ricco il linguaggio (lunghezza frasi, lessico).<br>' +
        '<b>Note</b> — indicazioni libere (es. «3 DSA», «esempi dallo sport», «evita metafore astratte»).<br><br>' +
        'Vale per mappe, quiz, cloze e tutor generati quando questa classe è la <b>classe attiva</b>. Le mappe già create non vengono ri-tradotte.') +
      '</div>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px">' +
      '<select id="cls-register" style="flex:1;min-width:160px;border:1px solid #c7d2fe;border-radius:8px;padding:8px 10px;font:inherit;background:#fff">' + regOpts + '</select></div>' +
      '<textarea id="cls-notes" placeholder="' + t('cls_notes_ph', 'Note di taratura (es. 3 DSA, 2 alloglotti; esempi dallo sport; evita metafore astratte)') + '" style="width:100%;min-height:56px;border:1px solid #c7d2fe;border-radius:8px;padding:8px 10px;font:inherit;background:#fff;resize:vertical">' + esc(c.notes || '') + '</textarea></div>';

    // Editor identità: grado (tendina) + sezione → nome canonico. Serve a sistemare
    // le classi vecchie (nomi liberi) dal menu "Gestisci classi".
    var identEditor = '<div style="background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:12px 14px;margin-bottom:12px">' +
      '<div style="font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:#475569;margin-bottom:8px">' + esc(t('cls_ident_title', 'Nome classe')) + '</div>' +
      '<div style="display:flex;gap:8px;align-items:center">' + gradeSelect('cls-grade-num', c.gradeNum != null ? c.gradeNum : '', c.system || '') +
      '<input id="cls-section" type="text" maxlength="4" value="' + esc(c.section || '') + '" placeholder="' + esc(t('cls_section_ph', 'Sezione (es. A)')) + '" style="flex:1;min-width:0;border:1px solid #e2e8f0;border-radius:10px;padding:8px 10px;font:inherit;background:#fff;text-transform:uppercase"></div>' +
      '<div id="cls-name-hint" style="font-size:11px;font-weight:600;margin-top:6px;min-height:14px;color:#94a3b8"></div>' +
      '<div style="font-size:11px;color:#94a3b8;margin-top:2px">' + esc(t('cls_rename_note', 'Cambiare grado o sezione rinomina la classe. I materiali e le sessioni già create restano legati al vecchio nome.')) + '</div></div>';

    var body = '<div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">' +
      '<div style="flex:1"><div style="font-weight:800;font-size:15px;color:#0f172a">' + esc(c.name) + '</div>' +
      '<div style="font-size:11px;color:#94a3b8">' + esc(c.year || '') + ' · ' + (c.students || []).length + ' allievi</div></div>' +
      btn(t('cls_print', 'Stampa credenziali'), GHOST).replace('<button', '<button data-print="1"') + '</div>' +
      identEditor +
      tuning +
      '<div style="font-size:11px;color:#64748b;margin-bottom:6px">' + esc(t('cls_names_hint', 'Aggiungi i nomi (facoltativo): appariranno nei report al posto di emoji+numero.')) + '</div>' +
      '<div style="max-height:32vh;overflow-y:auto;background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:6px 12px">' + rows + '</div>' +
      '<div style="display:flex;gap:8px;justify-content:space-between;margin-top:14px">' +
      btn(t('cls_delete', 'Elimina classe'), DANGER).replace('<button', '<button data-del="1"') +
      '<div style="display:flex;gap:8px">' +
      btn(t('cls_back', 'Indietro'), GHOST).replace('<button', '<button data-back="1"') +
      btn(t('cls_save_names', 'Salva nomi'), PRIMARY).replace('<button', '<button data-savenames="1"') +
      '</div></div>';

    var ov = overlay(body);
    ov.querySelector('[data-back]').onclick = renderList;
    var helpBtn = ov.querySelector('#cls-tuning-help');
    if (helpBtn) helpBtn.onclick = function () {
      var ex = ov.querySelector('#cls-tuning-explain');
      if (ex) ex.style.display = ex.style.display === 'none' ? 'block' : 'none';
    };

    // Anteprima live del nome canonico (grado + sezione) nell'editor identità
    var idGrade = ov.querySelector('#cls-grade-num');
    var idSection = ov.querySelector('#cls-section');
    var idHint = ov.querySelector('#cls-name-hint');
    if (idGrade && idSection && idHint) {
      var refreshIdent = function () {
        forceUpper(idSection);
        var pg = parseGradeValue(idGrade.value);
        if (!(pg.gradeNum >= 1)) { idHint.textContent = ''; return; }
        var nm = buildClassName(pg.gradeNum, idSection.value);
        var dup = STORE.list().some(function (x) { return x.id !== c.id && x.name === nm; });
        idHint.textContent = (dup ? '⚠ ' : '') + t('cls_name_will', 'Nome classe: ') + nm +
          (pg.system ? ' · ' + pg.system : '') + (dup ? ' — ' + t('cls_dup_short', 'nome già in uso') : '');
        idHint.style.color = dup ? '#d97706' : '#94a3b8';
      };
      idGrade.addEventListener('change', refreshIdent);
      idSection.addEventListener('input', refreshIdent);
      refreshIdent();
    }

    ov.querySelector('[data-savenames]').onclick = function () {
      // identità: grado + sezione → nome canonico (solo se il grado è impostato)
      var nameChanged = false;
      if (idGrade) {
        var pg = parseGradeValue(idGrade.value);
        if (pg.gradeNum >= 1 && pg.gradeNum <= 4) {
          var sec = (idSection.value || '').trim().toUpperCase().replace(/\s+/g, '');
          var nm = buildClassName(pg.gradeNum, sec);
          if (STORE.list().some(function (x) { return x.id !== c.id && x.name === nm; })) {
            toast(t('cls_dup', 'Esiste già la classe «') + nm + t('cls_dup2', '». Cambia grado o sezione.'), 'error');
            return;
          }
          c.gradeNum = pg.gradeNum; c.section = sec;
          c.grade = String(pg.gradeNum) + 'ª';
          if (pg.system) c.system = pg.system;
          if (nm && nm !== c.name) { c.name = nm; nameChanged = true; }
        }
      }
      ov.querySelectorAll('[data-name]').forEach(function (inp) {
        var idx = parseInt(inp.getAttribute('data-name'), 10);
        if (c.students[idx]) c.students[idx].name = (inp.value || '').trim().slice(0, LC.LIMITS.nameMax);
      });
      // taratura AI (grado e livello arrivano dalla sezione "Nome classe")
      c.register = ov.querySelector('#cls-register').value || '';
      c.notes = (ov.querySelector('#cls-notes').value || '').trim().slice(0, 400);
      STORE.save();
      if (STORE.activeId() === c.id) renderChip();
      toast(t('cls_saved', 'Classe salvata.'), 'success');
      if (nameChanged) renderEdit(c.id);
    };
    ov.querySelector('[data-print]').onclick = function () { printCredentials(c); };
    ov.querySelector('[data-del]').onclick = function () {
      if (window.showPrompt) {
        window.showPrompt(t('cls_del_confirm', 'Scrivi "elimina" per cancellare la classe') + ' ' + c.name, '', function (val) {
          if ((val || '').trim().toLowerCase() === 'elimina') doDelete(c.id);
        });
      } else if (confirm(t('cls_del_confirm2', 'Eliminare la classe') + ' ' + c.name + '?')) doDelete(c.id);
    };
  }

  function doDelete(id) {
    STORE.data.classes = STORE.list().filter(function (c) { return c.id !== id; });
    STORE.save();
    renderList();
  }

  function printCredentials(c) {
    if (!LR || !LR.buildCredentialCardsHtml) { toast('Modulo report non caricato.', 'error'); return; }
    var html = LR.buildCredentialCardsHtml(c);
    var w = window.open('', '_blank');
    if (!w) { toast(t('cls_popup', 'Consenti i popup per stampare le credenziali.'), 'error'); return; }
    w.document.write(html); w.document.close();
  }

  // ── Chip "classe attiva" in header + selettore ────────────────────────────
  function renderChip() {
    var host = document.getElementById('header-utils');
    if (!host) return;
    var chip = document.getElementById('active-class-chip');
    var activeStudent = _activeNick();
    var activeClass = STORE.getActive();
    var isActive = !!(activeStudent || activeClass);
    var label = activeStudent || (activeClass ? activeClass.name : t('cls_generic', 'Generico'));
    if (!chip) {
      chip = document.createElement('button');
      chip.id = 'active-class-chip';
      chip.type = 'button';
      chip.className = 'btn_header_setting';
      chip.style.cssText = 'width:auto;gap:6px;padding-left:10px;padding-right:12px;white-space:nowrap';
      chip.onclick = function () { window.openClassAccountsModal(); };
      host.insertBefore(chip, host.firstChild);
    }
    chip.title = t('cls_chip_tip2', 'Contesto attivo (classe o studente) — tara la generazione e filtra la sezione Insegna. Clicca per cambiarlo.');
    chip.innerHTML = '<i data-lucide="graduation-cap" class="nav_util_icon"></i>' +
      '<span style="font-size:12px;font-weight:800;color:' + (isActive ? '#4f46e5' : '#94a3b8') + '">' + esc(label) + '</span>';
    if (window.safeCreateIcons) window.safeCreateIcons();
  }

  // Al primo avvio con classi presenti: proponi la scelta (una volta per sessione)
  function maybePromptLaunch() {
    try { if (sessionStorage.getItem('mappai_class_prompted')) return; } catch (e) {}
    if (!STORE.list().length) return;
    try { sessionStorage.setItem('mappai_class_prompted', '1'); } catch (e) {}
    window.openClassAccountsModal();
  }

  // Entry point — il modale a due tab (Classi / Studenti); il chip lo apre direttamente
  window.openClassAccountsModal = function () {
    if (!LC) { toast('MappAI Live core non caricato.', 'error'); return; }
    var open = function () { if (_accountTab === 'studenti') renderStudents(); else renderList(); };
    if (!STORE.loaded) STORE.load().then(open); else open();
  };
  // Retrocompat: il "cambia classe" ora è lo stesso modale a due tab
  window.openClassSwitcher = function () { window.openClassAccountsModal(); };

  // Precarica lo store all'avvio, poi chip + eventuale selettore
  if (LC) STORE.load().then(function () {
    renderChip();
    if (window.refreshLevelTuneRow) window.refreshLevelTuneRow();
    // il picker al lancio solo sulla landing (non durante una mappa aperta)
    setTimeout(maybePromptLaunch, 800);
  });
  console.log('[MappAIClasses] account classi caricato');
})();
