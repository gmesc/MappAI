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
  var ACTIVE_DISC_KEY = 'mappai_active_discipline';
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
    _annuncia();
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
  /* `opts.silenzioso` = cambia il contesto SENZA dirlo. L'avviso è la risposta a
     un GESTO («ho scelto Generico»): all'avvio, dove il contesto si azzera da sé
     (`_contestoVuotoAlLancio`), diventa un cartello che nessuno ha chiesto e che
     accoglie l'utente con una cosa che non ha fatto. Chip ed evento restano:
     quelli dicono lo stato, e lo stato è cambiato davvero. */
  STORE.setActive = function (id, opts) {
    try { if (id) localStorage.setItem(ACTIVE_KEY, id); else localStorage.removeItem(ACTIVE_KEY); } catch (e) {}
    // esclusione mutua: attivare una classe azzera lo studente attivo (nessun accoppiamento)
    if (id && typeof _setActiveStudent === 'function') _setActiveStudent(null);
    renderChip();
    var c = id ? STORE.get(id) : null;
    var muto = !!(opts && opts.silenzioso);
    if (muto) { /* niente avviso */ }
    else if (c) toast(t('cls_active_set', 'Classe attiva: ') + c.name + ' — ' + t('cls_active_note', 'i contenuti AI saranno tarati su questa classe'), 'success');
    else toast(t('cls_active_none', 'Nessuna classe attiva: contenuti AI generici'), 'info');
    // notifica altri moduli (es. Live setup) che la classe attiva è cambiata
    try { document.dispatchEvent(new CustomEvent('mappai-active-class-changed', { detail: { id: id || '' } })); } catch (e) {}
  };

  // ── Discipline della classe (29/7) ────────────────────────────────────────
  // Il profilo insegnante elenca LE discipline che insegna; la classe dichiara
  // QUALI di quelle si insegnano lì. La disciplina scelta diventa un livello di
  // cartella dentro il contenitore di classe (Mappe/<classe>/<disciplina>/).
  // Classe senza discipline → nessun livello, comportamento storico intatto.
  STORE.disciplinesOf = function (cls) {
    var c = cls || null;
    if (!c) return [];
    var arr = Array.isArray(c.disciplines) ? c.disciplines : (c.discipline ? [c.discipline] : []);
    return arr.map(function (s) { return String(s == null ? '' : s).trim(); }).filter(Boolean);
  };
  // Discipline proposte al docente per una classe: quelle della classe; se la
  // classe non ne dichiara nessuna si ripiega sull'elenco del profilo insegnante
  // (così la funzione è usabile anche prima di aver compilato le classi).
  STORE.disciplineChoices = function (cls) {
    var own = STORE.disciplinesOf(cls);
    if (own.length) return own;
    try {
      var TP = window.MappAITeacherProfile;
      return (TP && TP.disciplineList) ? TP.disciplineList() : [];
    } catch (e) { return []; }
  };
  // Disciplina ATTIVA: scelta al momento della generazione, ricordata finché non
  // cambia. Vive fuori dall'oggetto classe (è un contesto, non un dato di classe).
  STORE.activeDiscipline = function () { try { return localStorage.getItem(ACTIVE_DISC_KEY) || ''; } catch (e) { return ''; } };
  STORE.setActiveDiscipline = function (d) {
    try { if (d) localStorage.setItem(ACTIVE_DISC_KEY, String(d)); else localStorage.removeItem(ACTIVE_DISC_KEY); } catch (e) {}
    renderChip();
    try { document.dispatchEvent(new CustomEvent('mappai-active-discipline-changed', { detail: { discipline: d || '' } })); } catch (e) {}
  };
  // Disciplina COERENTE con la classe attiva: se quella memorizzata non è (più)
  // fra le scelte della classe, non vale — evita di annidare i vault sotto una
  // disciplina che quella classe non insegna.
  STORE.effectiveDiscipline = function (cls) {
    var c = cls || STORE.getActive();
    if (!c) return '';
    var choices = STORE.disciplineChoices(c);
    if (!choices.length) return '';
    if (choices.length === 1) return choices[0];
    var cur = STORE.activeDiscipline();
    return choices.indexOf(cur) >= 0 ? cur : '';
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
    var disc = STORE.effectiveDiscipline(c);
    if (disc) lines.push(t('cls_tune_disc', 'Disciplina: ') + disc + '.');
    var reg = c.register && REGISTERS[c.register];
    if (reg) lines.push(reg.prompt);
    if (c.notes && String(c.notes).trim()) lines.push(t('cls_tune_notes', 'Note sulla classe: ') + String(c.notes).trim());
    if (!lines.length) return '';
    lines.push(t('cls_tune_fidelity', 'Resta fedele alla fonte: NON cambiare i fatti, adatta solo COME li esprimi (registro, esempi, lunghezza delle frasi).'));
    return '\n\n--- PROFILO CLASSE (' + t('cls_tune_hdr', 'adatta linguaggio ed esempi a questo pubblico') + ') ---\n' + lines.join('\n');
  };
  // usato da buildSystemInstruction (app.js): blocco della classe ATTIVA
  STORE.tuningForPrompt = function () { return STORE.buildTuningBlock(null); };
  /* Il preset di registro è lo stesso per classi e allievi: `MappAITune` lo
     chiede da qui invece di tenersi la sua copia dei tre testi. */
  STORE.registerPrompt = function (k) { return (k && REGISTERS[k]) ? REGISTERS[k].prompt : ''; };
  STORE.REGISTERS = REGISTERS;

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
  // Azione di INVIO della schermata corrente: le liste (Classi/Studenti) la
  // impostano su «conferma e chiudi» — la selezione è già applicata al clic, e
  // all'avvio di MappAI il picker si toglie di mezzo con un tasto. I form
  // (crea/modifica) la lasciano vuota: lì Invio resta il tasto dei campi.
  var _onEnter = null;
  var _keyHandler = null;

  function _bindEnter(ov) {
    if (_keyHandler) document.removeEventListener('keydown', _keyHandler, true);
    _keyHandler = function (e) {
      // Invio anche dal tastierino numerico; `keyCode` come rete per le tastiere
      // (e i telecomandi da lavagna) che non riempiono `key`.
      var isEnter = (e.key === 'Enter' || e.code === 'Enter' || e.code === 'NumpadEnter' || e.keyCode === 13);
      if (!isEnter || e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return;
      if (!document.getElementById('class-accounts-modal')) return;
      if (!_onEnter) return;
      // Invio dentro un campo appartiene al campo, non al modale.
      var el = e.target;
      if (el && el.closest && el.closest('input,textarea,select,[contenteditable="true"]')) return;
      e.preventDefault(); e.stopPropagation();
      _onEnter();
    };
    document.addEventListener('keydown', _keyHandler, true);
    // Senza fuoco dentro il modale i tasti finirebbero alla pagina sotto.
    setTimeout(function () {
      try {
        var card = ov.querySelector('[role="dialog"]');
        if (card && !ov.contains(document.activeElement)) { card.tabIndex = -1; card.focus({ preventScroll: true }); }
      } catch (e) { /* fuoco best-effort */ }
    }, 0);
  }

  /* Questo modale è ancora scritto a mano e sta a 9992; il motore parte da
     12000. Aperto DALLA Cabina finirebbe quindi dietro la console che l'ha
     chiamato — lo stesso difetto che il 2/8 nascondeva la conferma di
     eliminazione. Finché non è migrato, si mette sopra la pila del motore.

     ⚠️ Il ripiego è 10050 e NON 9992, e questo numero è costato un'ora di lavoro
     perso a Giacomo (4/8). `#loading-overlay` — il velo di caricamento, bianco al
     95% con blur — sta a **9999** (style.css §9). Il modale «Per quale classe e
     disciplina?» si apre da `startGeneration`, che la pipeline chiama DOPO aver
     alzato quel velo: a 9992 finiva sette punti sotto, invisibile e non
     cliccabile. La sua promise non veniva mai risolta, quindi il `finally` di
     `Pipeline.run` non girava e `_running` restava true: da quel momento
     nessuna generazione ripartiva più, per nessuna classe.
     Chi cambia questo numero controlli prima il velo: dev'essere SOPRA.
     Piantato in tests/bento-composizione.test.js. */
  function _zSopraMotore() {
    try {
      var MM = window.MappAIModal;
      if (MM && MM.aperti > 0 && MM.prossimoZ) return MM.prossimoZ();
    } catch (e) { /* motore assente */ }
    return 10050;
  }

  /* Chi sta guardando questi dati da un'altra superficie (la console «Cabina»)
     deve accorgersi che sono cambiati: senza, la riga eliminata resta a schermo
     finché non si ricarica la pagina — che è quello che Giacomo ha dovuto fare
     con cmd+R. L'evento parte da un posto solo, dopo ogni scrittura. */
  function _annuncia() {
    try { document.dispatchEvent(new CustomEvent('mappai-profili-cambiati')); } catch (e) { }
  }

  /* Le due colonne cadono a una sola su finestra stretta: il riquadro è
     `min(820px, 96vw)`, quindi senza questa regola su uno schermo piccolo si
     avrebbero due colonne da 200px invece di una leggibile. Sta in un foglio
     perché una media query non si scrive in uno stile inline. */
  function _stile2col() {
    if (document.getElementById('cls-2col-style')) return;
    var s = document.createElement('style');
    s.id = 'cls-2col-style';
    s.textContent = '@media (max-width: 760px){.cls-2col{grid-template-columns:1fr !important}}';
    document.head.appendChild(s);
  }

  /* Il titolo lo dichiara la SCHERMATA, non il contenitore: «Account classi e
     studenti» in testa a un modulo di creazione dice dove sei, non che cosa
     stai facendo — e il titolo vero finiva ripetuto dentro il corpo, in un
     carattere più piccolo di quello dell'intestazione. */
  function overlay(bodyHtml, maxWidth, titolo) {
    closeModal();
    _stile2col();
    _onEnter = null;   // ogni schermata dichiara la sua (default: Invio non fa nulla)
    var ov = document.createElement('div');
    ov.id = 'class-accounts-modal';
    ov.style.cssText = 'position:fixed;inset:0;z-index:' + _zSopraMotore() + ';background:rgba(15,23,42,.5);display:flex;align-items:center;justify-content:center;padding:18px';
    ov.innerHTML = '<div style="background:#f8fafc;border-radius:16px;box-shadow:0 25px 60px -12px rgba(0,0,0,.35);width:min(' + (maxWidth || '720px') + ',96vw);max-height:90vh;overflow-y:auto;padding:20px 24px" role="dialog" aria-modal="true">' +
      '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">' +
      '<div style="display:flex;align-items:center;gap:10px;font-weight:800;font-size:17px;color:#0f172a">' +
      '<i data-lucide="users" style="width:22px;height:22px;color:#4f46e5"></i>' + esc(titolo || t('cls_title', 'Account classi e studenti')) + '</div>' +
      '<button type="button" class="cls-close" style="background:none;border:none;cursor:pointer;color:#94a3b8;font-size:22px;line-height:1;padding:4px" aria-label="Chiudi">×</button>' +
      '</div>' + bodyHtml + '</div>';
    ov.addEventListener('click', function (e) { if (e.target === ov) closeModal(); });
    ov.querySelector('.cls-close').onclick = closeModal;
    document.body.appendChild(ov);
    if (window.safeCreateIcons) window.safeCreateIcons();
    _bindEnter(ov);
    return ov;
  }
  function closeModal() {
    var m = document.getElementById('class-accounts-modal'); if (m) m.remove();
    if (_keyHandler) { document.removeEventListener('keydown', _keyHandler, true); _keyHandler = null; }
    _onEnter = null;
  }

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
  function _studentSpecial(p) {
    return !!(p && ((p.notes && String(p.notes).trim()) || p.register === 'semplice' || p.register === 'ricco'));
  }
  function tuneDot(special) {
    return '<span title="' + esc(special ? t('tune_special', 'Profilo con taratura speciale') : t('tune_standard', 'Profilo standard')) + '" style="display:inline-block;width:9px;height:9px;border-radius:50%;vertical-align:middle;margin-right:6px;background:' + (special ? '#16a34a' : '#cbd5e1') + '"></span>';
  }
  function _getAppState() { try { return (typeof appState !== 'undefined') ? appState : window.appState; } catch (e) { return window.appState; } }
  function _profiles() { var a = _getAppState(); return (a && Array.isArray(a.allProfiles)) ? a.allProfiles : []; }
  function _saveProfiles() {
    var a = _getAppState(); if (!a) return;
    try { localStorage.setItem('mappai_all_profiles', JSON.stringify(a.allProfiles || [])); } catch (e) { /* quota */ }
    if (a.userProfile) { try { localStorage.setItem('mappai_user_profile', JSON.stringify(a.userProfile)); } catch (e) { } }
    _annuncia();
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
        '<div style="font-size:11px;color:#94a3b8">' + esc(c.year || '') + ' · ' + (c.students || []).length + ' allievi' +
        (STORE.disciplinesOf(c).length ? ' · ' + esc(STORE.disciplinesOf(c).join(', ')) : '') + '</div></div>' +
        '<button type="button" data-edit="' + c.id + '" style="' + GHOST + ';border-radius:8px;padding:6px 12px;cursor:pointer;font-size:11px;font-weight:700">' + esc(t('cls_manage', 'Gestisci')) + '</button>' +
        '</div>';
    }).join('') : '<div style="text-align:center;color:#94a3b8;padding:24px 0;font-size:13px">' + esc(t('cls_empty', 'Nessuna classe. Creane una per generare le credenziali degli allievi.')) + '</div>';

    var body = tabBar('classi') +
      '<div style="font-size:12px;color:#64748b;margin-bottom:12px">' +
      esc(t('cls_intro_sel', 'Clicca una classe per renderla ATTIVA (tara la generazione e filtra la sezione Insegna). "Gestisci" per modificarla. Premi Invio per confermare e chiudere.')) + '</div>' +
      rows +
      '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-top:14px">' +
      (activeId ? btn(t('cls_generic', 'Generico'), GHOST).replace('<button', '<button data-cgeneric="1"') : '<span></span>') +
      btn('+ ' + t('cls_new', 'Nuova classe'), PRIMARY).replace('<button', '<button data-new="1"') + '</div>';

    var ov = overlay(body);
    // Invio = «va bene così»: la classe evidenziata è già quella attiva (il clic
    // la imposta), quindi confermare vuol dire chiudere e proseguire.
    _onEnter = closeModal;
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
      /* La riga È il comando di attivazione: attivare una scheda è ciò che si
         viene a fare qui, e prima costava quattro clic (Gestisci → Attiva per
         taratura → Salva → chiudi). «Gestisci» resta per il resto. */
      return '<div data-spick="' + i + '" role="button" tabindex="0"' +
        ' title="' + esc(t('stu_pick_tip', 'Attiva questa scheda per la taratura')) + '"' +
        ' style="display:flex;align-items:center;gap:12px;background:#fff;border:1px solid ' + (isActive ? '#4f46e5' : '#e2e8f0') + ';border-radius:12px;padding:12px 14px;margin-bottom:8px;cursor:pointer">' +
        '<i data-lucide="user" style="width:20px;height:20px;color:#6366f1;flex-shrink:0"></i>' +
        '<div style="flex:1;min-width:0"><div style="font-weight:800;color:#0f172a">' + tuneDot(_studentSpecial(p)) + esc(p.nickname || '—') + (isActive ? ' <span style="font-size:10px;color:#4f46e5;font-weight:800">(' + esc(t('stu_active', 'attiva')) + ')</span>' : '') + '</div>' +
        '<div style="font-size:11px;color:#94a3b8">' + esc(sub || '—') + '</div></div>' +
        '<button type="button" data-sedit="' + i + '" style="' + GHOST + ';border-radius:8px;padding:6px 12px;cursor:pointer;font-size:11px;font-weight:700">' + esc(t('cls_manage', 'Gestisci')) + '</button>' +
        '</div>';
    }).join('') : '<div style="text-align:center;color:#94a3b8;padding:24px 0;font-size:13px">' + esc(t('stu_empty', 'Nessuna scheda studente. Creane una per un allievo che segui (es. sostegno).')) + '</div>';
    var body = tabBar('studenti') +
      '<div style="font-size:12px;color:#64748b;margin-bottom:12px">' + esc(t('stu_intro', 'Schede allievo per la taratura AI individuale (utile al docente di sostegno). "Attiva" una scheda per generare al livello di quello studente. Premi Invio per confermare e chiudere.')) + '</div>' +
      rows +
      '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-top:14px">' +
      (active ? btn(t('stu_generic', 'Nessuno (generico)'), GHOST).replace('<button', '<button data-sgeneric="1"') : '<span></span>') +
      btn('+ ' + t('stu_new', 'Nuova scheda studente'), PRIMARY).replace('<button', '<button data-snew="1"') + '</div>';
    var ov = overlay(body);
    _onEnter = closeModal;   // come nelle classi: Invio conferma la scheda attiva e chiude
    wireTabs(ov);
    /* clic sulla riga = attiva quella scheda. Il bottone «Gestisci» ferma la
       propagazione: sta DENTRO la riga, e senza questo aprire la gestione
       cambierebbe anche il contesto attivo — due effetti per un clic solo. */
    ov.querySelectorAll('[data-spick]').forEach(function (r) {
      var attiva = function () {
        var i = parseInt(r.getAttribute('data-spick'), 10);
        var p = _profiles()[i];
        if (!p) return;
        _setActiveStudent(p);
        toast(t('stu_activated', 'Scheda attiva per la taratura.'), 'success');
        renderStudents();
      };
      r.onclick = attiva;
      r.onkeydown = function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); attiva(); } };
    });
    ov.querySelectorAll('[data-sedit]').forEach(function (b) {
      b.onclick = function (e) {
        e.stopPropagation();
        renderStudentEdit(parseInt(b.getAttribute('data-sedit'), 10));
      };
    });
    var nb = ov.querySelector('[data-snew]'); if (nb) nb.onclick = renderStudentCreate;
    var gb = ov.querySelector('[data-sgeneric]'); if (gb) gb.onclick = function () { _setActiveStudent(null); renderStudents(); };
  }

  // Form scheda studente (create/edit) — sezioni in card, allineate al modale classi:
  // card bianca "Dati studente" (identità) + card indaco "Taratura AI" (gemella di quella
  // delle classi) che racchiude le note BES/DSA.
  function studentFormBody(p) {
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
      /* Il PRESET del registro è lo stesso delle classi (`REGISTERS`): un
         allievo si tara con le stesse parole con cui si tara una classe, e due
         vocabolari paralleli per la stessa scelta divergerebbero al primo
         ritocco. Sta sopra le note perché è la scelta grossa; le note
         aggiustano il resto. */
      '<label style="display:block;margin-bottom:8px">' + labelSpan(t('stu_register', 'Preset di taratura')) +
      '<select id="stu-register" style="width:100%;border:1px solid #c7d2fe;border-radius:8px;padding:8px 10px;font:inherit;background:#fff">' +
      ['', 'semplice', 'medio', 'ricco'].map(function (r) {
        var lbl = r ? REGISTERS[r].label : t('cls_reg_none', '— registro —');
        return '<option value="' + r + '"' + ((p && p.register) === r ? ' selected' : '') + '>' + esc(lbl) + '</option>';
      }).join('') + '</select></label>' +
      '<textarea id="stu-notes" placeholder="' + esc(t('stu_notes_ph', 'Es. dislessia; frasi brevi; esempi concreti')) + '" style="width:100%;min-height:56px;border:1px solid #c7d2fe;border-radius:8px;padding:8px 10px;font:inherit;background:#fff;resize:vertical">' + esc(p && p.notes || '') + '</textarea></div>';

    /* Taglia L (820) a DUE COLONNE: identità a sinistra, taratura a destra.
       Impilate, la taratura finiva sotto la piega e si compilava senza vedere
       la scheda a cui si riferisce. Le colonne cadono a una sola sotto i 720px
       (`--una-col`), altrimenti su uno schermo stretto sarebbero due colonne
       strette invece di una leggibile. */
    /* niente titolo qui dentro: lo porta l'intestazione del modale */
    return '<div class="cls-2col" style="display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:12px;align-items:start">' +
      identCard + tuningCard + '</div>';
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
        register: (ov.querySelector('#stu-register') || {}).value || '',
        notes: (ov.querySelector('#stu-notes').value || '').trim().slice(0, 400)
      };
      var oldNick = (editIdx != null && a.allProfiles[editIdx]) ? a.allProfiles[editIdx].nickname : null;
      var wasActive = _activeNick() && oldNick && oldNick.toLowerCase() === _activeNick().toLowerCase();
      if (editIdx != null && a.allProfiles[editIdx]) a.allProfiles[editIdx] = Object.assign({}, a.allProfiles[editIdx], rec);
      else a.allProfiles.push(rec);
      _saveProfiles();
      if (wasActive) _setActiveStudent(rec);
      /* La cartella dell'allievo nasce col profilo: le mappe generate con questa
         scheda attiva ci finiscono dentro, e chi la apre deve trovarla già lì. */
      STORE.ensureStudentFolder(nick);
      /* L'allievo che appartiene a una classe ha già un'identità nel roster:
         quella è la sua tessera, e ora ce l'ha anche nella sua cartella. */
      var suaClasse = classId ? STORE.get(classId) : null;
      if (suaClasse && Array.isArray(suaClasse.students)) {
        var i = suaClasse.students.findIndex(function (x) {
          return String(x.name || '').trim().toLowerCase() === nick.toLowerCase();
        });
        if (i >= 0) saveStudentCredentialPdf(suaClasse, i);
      }
      toast(t('stu_saved', 'Scheda studente salvata.'), 'success');
      renderStudents();
    };
  }
  function renderStudentCreate() {
    var body = studentFormBody(null) +
      '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px">' +
      btn(t('cls_cancel', 'Annulla'), GHOST).replace('<button', '<button data-back="1"') +
      btn(t('stu_create', 'Crea scheda'), PRIMARY).replace('<button', '<button data-ssave="1"') + '</div>';
    var ov = overlay(body, '820px', t('stu_new_title', 'Nuovo profilo allievo'));
    wireStudentForm(ov, null, null);
  }
  function renderStudentEdit(idx) {
    var profs = _profiles();
    var p = profs[idx];
    if (!p) { renderStudents(); return; }
    var active = _activeNick() && p.nickname && p.nickname.toLowerCase() === _activeNick().toLowerCase();
    var body = studentFormBody(p) +
      '<div style="display:flex;gap:8px;justify-content:space-between;margin-top:14px">' +
      btn(t('cls_delete', 'Elimina'), DANGER).replace('<button', '<button data-sdel="1"') +
      '<div style="display:flex;gap:8px">' +
      btn(active ? t('stu_is_active', 'Attiva ✓') : t('stu_activate', 'Attiva per taratura'), active ? GHOST : PRIMARY).replace('<button', '<button data-sactivate="1"') +
      btn(t('cls_save_names', 'Salva'), PRIMARY).replace('<button', '<button data-ssave="1"') +
      '</div></div>';
    var ov = overlay(body, '820px', t('stu_edit_title', 'Profilo allievo') + ' · ' + (p.nickname || ''));
    wireStudentForm(ov, p, idx);
    var act = ov.querySelector('[data-sactivate]'); if (act) act.onclick = function () {
      _setActiveStudent(_profiles()[idx]); // attiva la versione SALVATA (non ricarica il form: conserva le modifiche non salvate)
      toast(t('stu_activated', 'Scheda attiva per la taratura.'), 'success');
      act.textContent = t('stu_is_active', 'Attiva ✓'); act.disabled = true; act.style.opacity = '0.65'; act.style.cursor = 'default';
    };
    var del = ov.querySelector('[data-sdel]'); if (del) del.onclick = function () {
      var go = function () { var a = _getAppState(); if (a && a.allProfiles) { if (active) _setActiveStudent(null); a.allProfiles.splice(idx, 1); _saveProfiles(); } renderStudents(); };
      /* ⚠️ `showConfirm(title, message, onConfirm)` vuole TRE argomenti: qui
         gliene arrivavano due, quindi la funzione finiva stampata come messaggio
         e `onConfirm` restava undefined — il modale appariva sotto (z-index del
         confirm storico) e «Conferma» non cancellava niente.
         Col motore: pila e z-index li gestisce lui, e il fuoco non si posa mai
         sul distruttivo. */
      var msg = t('stu_del_confirm', 'Eliminare questa scheda studente?');
      if (window.MappAIModal) {
        window.MappAIModal.conferma({
          titolo: msg, icona: 'trash-2', distruttivo: true,
          testo: t('stu_del_note', 'La scheda serve solo alla taratura: le mappe già generate restano dove sono.'),
          conferma: t('cls_delete', 'Elimina')
        }).then(function (si) { if (si) go(); });
      } else if (window.showConfirm) {
        window.showConfirm(t('stu_del_title', 'Elimina la scheda'), msg, go);
      } else if (confirm(msg)) go();
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
    /* Taglia L a due colonne, come la scheda allievo: a sinistra CHI è la
       classe (identità e anno), a destra DOVE e COSA si insegna. Le materie
       sono un elenco di pillole che cresce, e in colonna unica spingeva
       «Numero allievi» sotto la piega. */
    var colSx = '<div style="display:flex;flex-direction:column;gap:12px">' +
      '<label style="display:block"><span style="display:block;font-size:11px;font-weight:700;color:#475569;margin-bottom:4px">' + esc(t('cls_ident', 'Classe')) + '</span>' +
      '<div style="display:flex;gap:8px">' + gradeSelect('cls-grade-num', '', '') +
      '<input id="cls-section" type="text" maxlength="4" placeholder="' + esc(t('cls_section_ph', 'Sezione (es. A)')) + '" style="flex:1;min-width:0;border:1px solid #e2e8f0;border-radius:10px;padding:9px 11px;font:inherit;color:#0f172a;background:#fff;text-transform:uppercase"></div></label>' +
      '<div id="cls-name-hint" style="font-size:11px;font-weight:600;margin-top:-6px;min-height:14px"></div>' +
      yearField(thisYear) +
      field('cls-count', t('cls_count', 'Numero allievi'), 'number', 'es. 18') +
      '</div>';
    /* Sedi e materie compaiono solo se il profilo insegnante le dichiara: se
       non ci sono, la seconda colonna sarebbe un vuoto accanto al modulo —
       allora la scheda torna a una colonna sola. */
    var dx = sedeField('') + disciplineField([]);
    var colDx = dx ? '<div style="display:flex;flex-direction:column;gap:12px">' + dx + '</div>' : '';
    /* La taratura sta SOTTO le due colonne e larga quanto il modale: non è un
       dato dell'identità della classe, è come l'AI le parlerà — e le note sono
       un campo di testo, che in mezza colonna si scrive male. */
    var body = '<div class="cls-2col" style="display:grid;grid-template-columns:' + (colDx ? 'minmax(0,1fr) minmax(0,1fr)' : '1fr') + ';gap:12px;align-items:start;margin-bottom:12px">' +
      colSx + colDx + '</div>' +
      classTuningCard(null) +
      '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px">' +
      btn(t('cls_cancel', 'Annulla'), GHOST).replace('<button', '<button data-back="1"') +
      btn(t('cls_create', 'Crea classe'), PRIMARY).replace('<button', '<button data-save="1"') +
      '</div>';
    var ov = overlay(body, '820px', t('cls_new_title', 'Nuovo profilo classe'));
    ov.querySelector('[data-back]').onclick = renderList;
    wireDisciplineField(ov);
    wireTuningHelp(ov);

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
      var sedeEl = ov.querySelector('#cls-sede');
      var regEl = ov.querySelector('#cls-register'), noteEl = ov.querySelector('#cls-notes');
      var cls = {
        id: newId(), name: name, gradeNum: gradeNum, section: section, grade: String(gradeNum) + 'ª',
        system: pg.system, year: year, sede: (sedeEl && sedeEl.value) || '',
        /* la taratura si scrive alla nascita: prima bisognava riaprire la
           classe per dargliela, e chi non lo faceva generava senza saperlo */
        register: (regEl && regEl.value) || '',
        notes: (noteEl && (noteEl.value || '').trim().slice(0, 400)) || '',
        disciplines: readDisciplines(ov), students: LC.buildCredentials(count)
      };
      STORE.data.classes.push(cls);
      STORE.save();
      // il foglio delle credenziali nasce con la classe, senza che nessuno lo chieda
      saveCredentialsPdf(cls, { avvisa: true });
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

  /* ── Card «Taratura AI» della classe ─────────────────────────────────────
     Estratta da «Gestisci» (2/8) perché serve anche alla CREAZIONE: prima si
     creava la classe e la si doveva riaprire per dirle com'è fatta — e chi non
     la riapriva generava materiali senza taratura senza saperlo. Una sola
     scrittura, due schermate. */
  function classTuningCard(c) {
    c = c || {};
    var regOpts = ['', 'semplice', 'medio', 'ricco'].map(function (r) {
      var lbl = r ? REGISTERS[r].label : t('cls_reg_none', '— registro —');
      return '<option value="' + r + '"' + (c.register === r ? ' selected' : '') + '>' + esc(lbl) + '</option>';
    }).join('');
    return '<div style="background:#eef2ff;border:1px solid #c7d2fe;border-radius:12px;padding:12px 14px;margin-bottom:12px">' +
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
  }
  /* Il «?» apre la spiegazione: sta qui perché lo usano entrambe le schermate. */
  function wireTuningHelp(ov) {
    var b = ov.querySelector('#cls-tuning-help');
    if (!b) return;
    b.onclick = function () {
      var ex = ov.querySelector('#cls-tuning-explain');
      if (ex) ex.style.display = ex.style.display === 'none' ? 'block' : 'none';
    };
  }

  // Campo «Sede» (011/US4): tendina dalle sedi del profilo insegnante. Visibile
  // SOLO se il profilo ha almeno una sede → altrimenti stringa vuota (naming senza prefisso).
  function sedeField(current) {
    var sedi = (window.MappAITeacherProfile && window.MappAITeacherProfile.sediList) ? window.MappAITeacherProfile.sediList() : [];
    if (!sedi.length) return '';
    var opts = '<option value="">' + esc(t('cls_sede_none', '— sede —')) + '</option>' +
      sedi.map(function (s) { return '<option value="' + esc(s) + '"' + (current === s ? ' selected' : '') + '>' + esc(s) + '</option>'; }).join('');
    return '<label style="display:block"><span style="display:block;font-size:11px;font-weight:700;color:#475569;margin-bottom:4px">' + esc(t('cls_sede', 'Sede')) + '</span>' +
      '<select id="cls-sede" style="width:100%;border:1px solid #e2e8f0;border-radius:10px;padding:9px 11px;font:inherit;background:#fff">' + opts + '</select></label>';
  }

  // Campo «Discipline» (29/7): quali delle discipline del profilo insegnante si
  // insegnano in questa classe. Visibile SOLO se il profilo ne dichiara almeno una
  // (come sedeField) → chi insegna una materia sola non vede nulla di nuovo.
  // Le discipline già sulla classe ma non più nel profilo restano in elenco
  // (spuntate): toglierle dal profilo non deve orfanizzare le cartelle esistenti.
  function disciplineField(current) {
    var TP = window.MappAITeacherProfile;
    var fromProfile = (TP && TP.disciplineList) ? TP.disciplineList() : [];
    var cur = (current || []).map(function (s) { return String(s).trim(); }).filter(Boolean);
    var all = fromProfile.slice();
    cur.forEach(function (d) { if (all.indexOf(d) < 0) all.push(d); });
    if (!all.length) return '';
    var boxes = all.map(function (d) {
      var on = cur.indexOf(d) >= 0;
      return '<label style="display:inline-flex;align-items:center;gap:6px;background:#fff;border:1px solid ' + (on ? '#4f46e5' : '#e2e8f0') + ';border-radius:999px;padding:5px 11px;cursor:pointer;font-size:12px;font-weight:700;color:' + (on ? '#4f46e5' : '#334155') + '">' +
        '<input type="checkbox" data-disc value="' + esc(d) + '"' + (on ? ' checked' : '') + ' style="width:14px;height:14px;accent-color:#4f46e5">' + esc(d) + '</label>';
    }).join('');
    return '<label style="display:block"><span style="display:block;font-size:11px;font-weight:700;color:#475569;margin-bottom:4px">' + esc(t('cls_disc', 'Discipline insegnate in questa classe')) + '</span>' +
      '<div id="cls-disc-wrap" style="display:flex;flex-wrap:wrap;gap:6px">' + boxes + '</div>' +
      '<div style="font-size:11px;color:#94a3b8;margin-top:5px">' + esc(t('cls_disc_hint', 'Le mappe generate finiscono in una cartella per disciplina dentro la classe. Con due o più discipline la generazione chiede quale.')) + '</div></label>';
  }
  // Legge le discipline spuntate nel form (array). Nessun campo → array vuoto.
  function readDisciplines(ov) {
    var out = [];
    ov.querySelectorAll('[data-disc]').forEach(function (i) { if (i.checked) out.push(i.value); });
    return out;
  }
  // Aggiorna il colore della pillola al clic (feedback immediato).
  function wireDisciplineField(ov) {
    ov.querySelectorAll('[data-disc]').forEach(function (i) {
      i.onchange = function () {
        var lab = i.parentNode;
        lab.style.borderColor = i.checked ? '#4f46e5' : '#e2e8f0';
        lab.style.color = i.checked ? '#4f46e5' : '#334155';
      };
    });
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

    var tuning = classTuningCard(c);

    // Editor identità: grado (tendina) + sezione → nome canonico. Serve a sistemare
    // le classi vecchie (nomi liberi) dal menu "Gestisci classi".
    var identEditor = '<div style="background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:12px 14px;margin-bottom:12px">' +
      '<div style="font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:#475569;margin-bottom:8px">' + esc(t('cls_ident_title', 'Nome classe')) + '</div>' +
      '<div style="display:flex;gap:8px;align-items:center">' + gradeSelect('cls-grade-num', c.gradeNum != null ? c.gradeNum : '', c.system || '') +
      '<input id="cls-section" type="text" maxlength="4" value="' + esc(c.section || '') + '" placeholder="' + esc(t('cls_section_ph', 'Sezione (es. A)')) + '" style="flex:1;min-width:0;border:1px solid #e2e8f0;border-radius:10px;padding:8px 10px;font:inherit;background:#fff;text-transform:uppercase"></div>' +
      '<div id="cls-name-hint" style="font-size:11px;font-weight:600;margin-top:6px;min-height:14px;color:#94a3b8"></div>' +
      '<div style="font-size:11px;color:#94a3b8;margin-top:2px;margin-bottom:8px">' + esc(t('cls_rename_note', 'Cambiare grado o sezione rinomina la classe. I materiali e le sessioni già create restano legati al vecchio nome.')) + '</div>' +
      sedeField(c.sede) + disciplineField(STORE.disciplinesOf(c)) + '</div>';

    /* il nome della classe non si ripete qui: lo porta l'intestazione */
    var body = '<div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">' +
      '<div style="flex:1"><div style="font-size:11px;color:#94a3b8">' + esc(c.year || '') + ' · ' + (c.students || []).length + ' allievi</div></div>' +
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

    var ov = overlay(body, null, t('cls_edit_title', 'Profilo classe') + ' · ' + c.name);
    ov.querySelector('[data-back]').onclick = renderList;
    wireDisciplineField(ov);
    wireTuningHelp(ov);

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
      /* Dare un nome a un'identità È creare l'account di quell'allievo: da quel
         momento ha una tessera sua, in «Allievi/<nome>/». Si riscrive solo per
         chi è cambiato — con 25 allievi, rigenerare 25 PDF a ogni salvataggio
         sarebbe un'attesa per niente. */
      var nuovi = [];
      ov.querySelectorAll('[data-name]').forEach(function (inp) {
        var idx = parseInt(inp.getAttribute('data-name'), 10);
        if (!c.students[idx]) return;
        var prima = c.students[idx].name || '';
        var dopo = (inp.value || '').trim().slice(0, LC.LIMITS.nameMax);
        c.students[idx].name = dopo;
        if (dopo && dopo !== prima) nuovi.push(idx);
      });
      // taratura AI (grado e livello arrivano dalla sezione "Nome classe")
      c.register = ov.querySelector('#cls-register').value || '';
      c.notes = (ov.querySelector('#cls-notes').value || '').trim().slice(0, 400);
      var sedeEl = ov.querySelector('#cls-sede');   // 011/US4: sede (se il profilo ne ha)
      if (sedeEl) c.sede = sedeEl.value || '';
      // Discipline (29/7): solo se il campo esiste — un profilo senza discipline
      // non deve azzerare quelle già assegnate alla classe.
      if (ov.querySelector('[data-disc]')) c.disciplines = readDisciplines(ov);
      STORE.save();
      /* i nomi appena scritti vanno sulle tessere: senza questa riscrittura il
         PDF resterebbe quello del giorno della creazione, con «Nome: ____» */
      saveCredentialsPdf(c);
      nuovi.forEach(function (i) { saveStudentCredentialPdf(c, i); });
      if (STORE.activeId() === c.id) renderChip();
      toast(t('cls_saved', 'Classe salvata.'), 'success');
      if (nameChanged) renderEdit(c.id);
    };
    ov.querySelector('[data-print]').onclick = function () { printCredentials(c); };
    ov.querySelector('[data-del]').onclick = function () {
      /* ⚠️ Passava da `showPrompt`, che è un modale del markup fermo a z-9999:
         aperto sopra questa finestra (che a sua volta si alza sopra la console)
         finiva DIETRO — il bottone sembrava non fare niente. Col motore la pila
         la governa lui, e la finestra è dove ci si aspetta che sia. */
      var chiedi = t('cls_del_confirm', 'Scrivi "elimina" per cancellare la classe') + ' ' + c.name;
      if (window.MappAIModal) {
        window.MappAIModal.chiedi({
          titolo: t('cls_del_title', 'Elimina la classe'),
          etichetta: chiedi, conferma: t('cls_delete', 'Elimina')
        }).then(function (val) {
          if ((val || '').trim().toLowerCase() === 'elimina') doDelete(c.id);
        });
      } else if (window.showPrompt) {
        window.showPrompt(chiedi, '', function (val) {
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

  /* ── Foglio credenziali su disco, da solo (2/8) ────────────────────────────
     Le credenziali servono STAMPATE, e finora esistevano solo finché il docente
     si ricordava di aprirle e mandarle in stampa. Adesso il PDF si scrive da
     sé nella cartella della classe appena la classe si salva, e si riscrive
     quando cambiano i nomi: chi cerca le tessere di 2A le trova in
     «Classi/2A/credenziali-2A.pdf», non in una finestra da riaprire.
     Silenzioso: se qualcosa manca (browser, modulo report) non disturba. */
  function saveCredentialsPdf(c, opts) {
    var api = window.electronAPI;
    if (!c || !c.name || !LR || !LR.buildCredentialCardsHtml) return Promise.resolve(null);
    if (!api || !api.htmlToPdf || !api.classDocSave) return Promise.resolve(null);
    var html = LR.buildCredentialCardsHtml(c, { perPdf: true });
    return api.htmlToPdf({ html: html, options: { pageSize: 'A4' } }).then(function (res) {
      if (!res || !res.ok || !res.base64) throw new Error((res && res.error) || 'PDF non generato');
      return api.classDocSave({
        scope: 'class', name: c.name,
        fileName: 'credenziali-' + c.name + '.pdf', base64: res.base64
      });
    }).then(function (out) {
      if (out && out.success && opts && opts.avvisa) {
        toast(t('cls_cred_saved', 'Foglio credenziali salvato in Classi/') + c.name, 'success');
      }
      return out;
    }).catch(function (e) {
      if (opts && opts.avvisa) toast(t('cls_cred_ko', 'Foglio credenziali non salvato: ') + e.message, 'warning');
      return null;
    });
  }
  /* Un allievo ha la SUA tessera: chi arriva a metà anno se la porta via senza
     il foglio di tutta la classe. Vive in «Allievi/<nome>/», fuori dalla
     cartella di classe, perché segue la persona e non il gruppo. */
  function saveStudentCredentialPdf(c, idx, opts) {
    var api = window.electronAPI;
    var s = c && c.students && c.students[idx];
    if (!s || !LR || !LR.buildCredentialCardsHtml) return Promise.resolve(null);
    if (!api || !api.htmlToPdf || !api.classDocSave) return Promise.resolve(null);
    var etichetta = (s.name || '').trim() || (s.emojiKey || ('allievo-' + (idx + 1)));
    var solo = { name: c.name, year: c.year, students: [s] };
    var html = LR.buildCredentialCardsHtml(solo, { perPdf: true });
    return api.htmlToPdf({ html: html, options: { pageSize: 'A4' } }).then(function (res) {
      if (!res || !res.ok || !res.base64) throw new Error((res && res.error) || 'PDF non generato');
      return api.classDocSave({
        scope: 'student', name: etichetta,
        fileName: 'credenziali-' + etichetta + '.pdf', base64: res.base64
      });
    }).then(function (out) {
      if (out && out.success && opts && opts.avvisa) {
        toast(t('cls_cred_stud_saved', 'Tessera salvata in Allievi/') + etichetta, 'success');
      }
      return out;
    }).catch(function () { return null; });
  }
  /* Nome del profilo ALLIEVO attivo ('' se il contesto è una classe o generico).
     Serve fuori di qui: le mappe generate con un allievo attivo vanno nella SUA
     cartella, non in «Mappe» insieme a quelle della classe. */
  STORE.activeStudentName = function () { return _activeNick(); };

  /* ── Le schede allievo, viste da fuori (2/8) ─────────────────────────────
     La console «Cabina» elenca classi E allievi in due tabelle. I profili
     vivono in `appState.allProfiles`, che è dietro una `let` lessicale: senza
     questi tre accessi ogni chiamante rifarebbe il pattern `_getAppState`, e
     con esso la sua copia delle regole (chi è attivo, cosa conta come taratura
     speciale). Una fonte sola. */
  STORE.students = function () { return _profiles().slice(); };
  STORE.setActiveStudent = function (p) { _setActiveStudent(p || null); };
  /* Pallino: verde = questo profilo cambia davvero come scrive l'AI. */
  STORE.classSpecial = _classSpecial;
  STORE.studentSpecial = _studentSpecial;
  /* Le schermate di gestione, aperte dal punto giusto invece che dalla prima
     schermata del modale a due tab. */
  STORE.openClassEdit = function (id) {
    var go = function () { if (STORE.get(id)) renderEdit(id); else renderList(); };
    if (!STORE.loaded) STORE.load().then(go); else go();
  };
  STORE.openClassCreate = function () {
    if (!STORE.loaded) STORE.load().then(renderCreate); else renderCreate();
  };
  STORE.openStudentEdit = function (idx) { renderStudentEdit(idx); };
  STORE.openStudentCreate = function () { renderStudentCreate(); };
  /* Chi apre questo modale da sopra (la Cabina) deve poterlo chiudere: senza,
     ESC chiuderebbe la console sotto e lascerebbe questa finestra orfana. */
  STORE.closeModal = closeModal;

  /* La cartella dell'allievo esiste appena il profilo esiste: chi la apre dopo
     una generazione deve trovarla, non scoprire che nasce solo quando qualcosa
     ci viene scritto dentro. */
  STORE.ensureStudentFolder = function (nome) {
    var api = window.electronAPI;
    var n = String(nome || '').trim();
    if (!n || !api || !api.classDocSave) return Promise.resolve(null);
    return api.studentFolderEnsure ? api.studentFolderEnsure({ name: n }) : Promise.resolve(null);
  };
  STORE.saveCredentialsPdf = saveCredentialsPdf;
  STORE.saveStudentCredentialPdf = saveStudentCredentialPdf;

  // ── Contesto di generazione: classe + disciplina (29/7) ───────────────────
  // Chiamato da startGeneration PRIMA di spendere token. Risolve:
  //   { classId, className, discipline }  → prosegui
  //   null                                → il docente ha annullato
  // Chiede SOLO quando serve davvero: classe attiva con 2+ discipline. Una sola
  // disciplina (o nessuna) → nessun modale, esattamente come prima.
  /* ⚠️ SI CHIEDE SEMPRE (14/8, decisione di Giacomo). Prima si chiedeva solo
     quando la classe attiva insegnava 2+ materie e nessuna era già scelta: nel
     caso normale la generazione partiva su un contesto DEDOTTO — e quel
     contesto tara l'AI e decide in quale cartella finisce la mappa. Da oggi il
     contesto della generazione è una scelta ESPLICITA, fatta una volta e poi
     congelata (`MappAITune.congela`) per tutta la lavorazione.
     Il modale arriva già compilato col contesto attivo: nel caso normale è un
     clic su «Genera», non un questionario.
     «Generico» resta una risposta valida, e deve: al primo avvio non esistono
     classi, e senza quella via d'uscita l'app non genererebbe finché non se ne
     crea una.
     Kill-switch `mappai_gen_ctx_sempre='0'` → si torna a chiedere solo quando
     serve (comportamento storico). */
  STORE.ensureGenerationContext = function () {
    var ready = STORE.loaded ? Promise.resolve() : STORE.load();
    return ready.then(function () {
      var cls = STORE.getActive();
      var ctx = function (c, d) {
        return { classId: (c && c.id) || '', className: (c && c.name) || '', discipline: d || '' };
      };
      var sempre = true;
      try { sempre = localStorage.getItem('mappai_gen_ctx_sempre') !== '0'; } catch (e) { }
      /* ⚠️ Non durante la PIPELINE. Lo step A chiama `startGeneration` da
         dentro, e il destinatario la pipeline l'ha già chiesto nella sua
         configurazione (`mp-class`): un secondo modale in mezzo a un flusso
         automatico chiederebbe due volte la stessa cosa — e nel migliore dei
         casi resterebbe lì ad aspettare una risposta che nessuno sta guardando. */
      try { if (window.MappAIPipeline && window.MappAIPipeline._interno) sempre = false; } catch (e) { }

      if (!sempre) {
        var choices0 = cls ? STORE.disciplineChoices(cls) : [];
        if (!cls) return ctx(null, '');
        if (choices0.length <= 1) {
          var only = choices0[0] || '';
          if (only !== STORE.activeDiscipline()) STORE.setActiveDiscipline(only);
          return ctx(cls, only);
        }
        var att0 = STORE.activeDiscipline();
        if (att0 && choices0.indexOf(att0) >= 0) return ctx(cls, att0);
      }

      return _askGenerationContext(cls).then(function (res) {
        if (!res) return null;                                  // annullato: niente generazione
        /* Con un ALLIEVO attivo il contesto è lui, e la mappa va nella SUA
           cartella: scegliere una classe lo azzererebbe (esclusione mutua) e
           la destinazione cambierebbe senza che nessuno l'abbia chiesto.
           `res.allievo` = «lascia le cose come stanno». */
        if (!res.allievo && res.classId !== STORE.activeId()) STORE.setActive(res.classId);
        STORE.setActiveDiscipline(res.discipline);
        var c2 = res.allievo ? null : (STORE.get(res.classId) || null);
        return ctx(c2, res.discipline);
      });
    });
  };

  // Modale «Per quale classe e disciplina?». Le due tendine sono legate: cambiando
  // classe si ricaricano le sue discipline (mai una disciplina che quella classe
  // non insegna).
  /* Le materie proponibili per un destinatario: quelle della CLASSE se c'è
     (una classe insegna le sue), altrimenti quelle dichiarate nel profilo
     insegnante — che è l'unico elenco che esiste per «Generico» e per un
     allievo. Una fonte sola per entrambi i casi. */
  function _materiePer(c) {
    if (c) return STORE.disciplineChoices(c) || [];
    try {
      return (window.MappAITeacherProfile && window.MappAITeacherProfile.disciplineList
        ? window.MappAITeacherProfile.disciplineList() : []) || [];
    } catch (e) { return []; }
  }

  function _askGenerationContext(cls) {
    return new Promise(function (resolve) {
      var sel = function (id, label, optsHtml) {
        return '<label style="display:block;margin-bottom:12px">' + labelSpan(label) +
          '<select id="' + id + '" style="' + FLD + '">' + optsHtml + '</select></label>';
      };
      var nick = _activeNick();
      var scelto = nick ? 'stud:' : ((cls && cls.id) || '');
      /* Tre famiglie nello stesso elenco, ed è giusto che siano lì: sono le tre
         risposte possibili alla domanda «per chi è questa mappa». */
      var classOpts = '';
      if (nick) classOpts += '<option value="stud:" selected>' +
        esc(t('cls_gen_stud', 'Allievo: ') + nick) + '</option>';
      classOpts += '<option value=""' + (scelto === '' ? ' selected' : '') + '>' +
        esc(t('cls_gen_generico', 'Generico (nessuna classe)')) + '</option>';
      classOpts += STORE.list().map(function (c) {
        return '<option value="' + c.id + '"' + (c.id === scelto ? ' selected' : '') + '>' + esc(c.name) + '</option>';
      }).join('');
      var last = STORE.activeDiscipline();
      var choices = _materiePer(nick ? null : cls);
      var nessuna = '<option value=""' + (last ? '' : ' selected') + '>' +
        esc(t('cls_gen_nodisc', '— nessuna materia —')) + '</option>';
      var discOpts = nessuna + choices.map(function (d) {
        return '<option value="' + esc(d) + '"' + (d === last ? ' selected' : '') + '>' + esc(d) + '</option>';
      }).join('');
      var body = '<div style="font-weight:800;font-size:15px;color:#0f172a;margin-bottom:6px">' + esc(t('cls_gen_title2', 'Per chi è questa mappa?')) + '</div>' +
        '<div style="font-size:12px;color:#64748b;margin-bottom:14px">' + esc(t('cls_gen_hint2', 'Questa scelta tara il linguaggio dell\'AI e decide in quale cartella finisce la mappa. Resta ferma per tutta la generazione.')) + '</div>' +
        sel('gen-class', t('cls_gen_dest', 'Destinatario'), classOpts) +
        sel('gen-disc', t('cls_gen_mat', 'Materia'), discOpts) +
        '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:6px">' +
        btn(t('cls_cancel', 'Annulla'), GHOST).replace('<button', '<button data-gcancel="1"') +
        btn(t('cls_gen_go', 'Genera'), PRIMARY).replace('<button', '<button data-gok="1"') + '</div>';
      var ov = overlay(body, '440px');
      var done = false;
      var finish = function (v) { if (done) return; done = true; closeModal(); resolve(v); };
      // Chiudere dal velo / dalla ✕ equivale ad annullare: senza questo la promise
      // resterebbe appesa e la generazione non ripartirebbe mai.
      ov.addEventListener('click', function (e) { if (e.target === ov) finish(null); });
      var x = ov.querySelector('.cls-close'); if (x) x.onclick = function () { finish(null); };
      var cSel = ov.querySelector('#gen-class'), dSel = ov.querySelector('#gen-disc');
      /* le due tendine restano legate: cambiando destinatario si ricaricano le
         SUE materie — mai una materia che quella classe non insegna */
      cSel.onchange = function () {
        var v = cSel.value;
        var c2 = (v && v !== 'stud:') ? STORE.get(v) : null;
        var ch2 = _materiePer(c2);
        dSel.innerHTML = '<option value="">' + esc(t('cls_gen_nodisc', '— nessuna materia —')) + '</option>' +
          ch2.map(function (d) { return '<option value="' + esc(d) + '">' + esc(d) + '</option>'; }).join('');
      };
      var esito = function () {
        var v = cSel.value;
        return { classId: (v === 'stud:') ? '' : v, allievo: v === 'stud:', discipline: dSel.value || '' };
      };
      ov.querySelector('[data-gcancel]').onclick = function () { finish(null); };
      ov.querySelector('[data-gok]').onclick = function () { finish(esito()); };
      _onEnter = function () { finish(esito()); };
    });
  }

  /* ── Il contesto attivo nell'header: CHIP classe · materia ─────────────────
     Era un bottone rettangolare che portava tutto in una sola etichetta e si
     apriva su una schermata sola. Ora è lo STESSO chip che le console hanno in
     testata (`MappAIModal.chipContesto`): due metà, ognuna col suo selettore —
     è la stessa informazione, e non può avere due vesti.
     La prima metà porta l'ALLIEVO quando è lui il contesto: classe e allievo si
     escludono a vicenda, quindi una sola delle due è piena per volta. */
  function _pickContesto() {
    var voci = [{
      id: 'ctx:', etichetta: t('cls_generic', 'Generico'), icona: 'circle-dashed',
      sotto: t('cb_generico_sotto', 'Nessuna taratura: l’AI scrive senza un destinatario preciso.')
    }];
    STORE.list().forEach(function (c) {
      var d = [];
      if (c.grade) d.push(c.grade);
      if (STORE.disciplinesOf(c).length) d.push(STORE.disciplinesOf(c).join(' · '));
      voci.push({ id: 'ctx:c:' + c.id, etichetta: c.name, icona: 'graduation-cap', sotto: d.join(' · ') });
    });
    _profiles().forEach(function (p, i) {
      if (!p.nickname) return;
      var cls = p.classId ? STORE.get(p.classId) : null;
      voci.push({
        id: 'ctx:s:' + i, etichetta: p.nickname, icona: 'user-round',
        sotto: [p.grade || '', cls ? cls.name : ''].filter(Boolean).join(' · ')
      });
    });
    window.MappAIModal.open({
      titolo: t('cls_chip_pick', 'Contesto di lavoro'), icona: 'graduation-cap', taglia: 's', invio: false,
      sezioni: [{
        testo: t('cls_chip_intro', 'Tara ogni generazione: registro, densità e attenzioni con cui l’AI scrive.'),
        voci: voci
      }],
      azioni: [{ id: 'gestisci', etichetta: t('cb_gestisci', 'Gestisci classi e allievi'), icona: 'users' }]
    }).then(function (r) {
      if (!r) return;
      if (r.azione === 'gestisci') return window.openClassAccountsModal();
      var v = String(r.azione || '').slice(4);
      if (v.indexOf('s:') === 0) { _setActiveStudent(_profiles()[parseInt(v.slice(2), 10)] || null); return; }
      if (v.indexOf('c:') === 0) { _setActiveStudent(null); STORE.setActive(v.slice(2)); return; }
      _setActiveStudent(null); STORE.setActive('');
    });
  }

  function _pickMateria() {
    var cls = STORE.getActive();
    var scelte = STORE.disciplineChoices(cls || {}) || [];
    if (!scelte.length) {
      toast(t('cls_chip_no_materie', 'Nessuna materia: aggiungile nel profilo insegnante.'), 'warning');
      return;
    }
    var att = STORE.activeDiscipline();
    window.MappAIModal.open({
      titolo: t('lt_cons_pick_materia', 'Scegli la materia'), icona: 'book-open', taglia: 's', invio: false,
      sezioni: [{
        voci: scelte.map(function (d) {
          return { id: 'd:' + d, etichetta: d, icona: 'book-open', attiva: d === att };
        })
      }],
      azioni: [{ id: 'tutte', etichetta: t('lt_cons_tutte_materie', 'Tutte le materie') }]
    }).then(function (r) {
      if (!r) return;
      STORE.setActiveDiscipline(r.azione === 'tutte' ? '' : String(r.azione).slice(2));
      renderChip();
    });
  }

  function renderChip() {
    var host = document.getElementById('header-utils');
    if (!host) return;
    var vecchio = document.getElementById('active-class-chip');
    var allievo = _activeNick(), classe = STORE.getActive();
    var materia = classe ? STORE.effectiveDiscipline(classe) : '';

    /* Senza motore resta il bottone di prima: l'header non deve restare muto
       se il kill-switch dei modali è spento. */
    if (!window.MappAIModal || !window.MappAIModal.chipContesto) {
      if (!vecchio) {
        vecchio = document.createElement('button');
        vecchio.id = 'active-class-chip';
        vecchio.type = 'button';
        vecchio.className = 'btn_header_setting';
        vecchio.style.cssText = 'width:auto;gap:6px;padding-left:10px;padding-right:12px;white-space:nowrap';
        vecchio.onclick = function () { window.openClassAccountsModal(); };
        host.insertBefore(vecchio, host.firstChild);
      }
      vecchio.innerHTML = '<i data-lucide="graduation-cap" class="nav_util_icon"></i>' +
        '<span style="font-size:12px;font-weight:800">' + esc(allievo || (classe ? classe.name : t('cls_generic', 'Generico'))) + '</span>';
      if (window.safeCreateIcons) window.safeCreateIcons();
      return;
    }

    var nodo = chipNodo();
    if (!nodo) return;
    nodo.id = 'active-class-chip';
    if (vecchio) vecchio.replaceWith(nodo); else host.insertBefore(nodo, host.firstChild);
    if (window.safeCreateIcons) window.safeCreateIcons();
  }

  /* Il chip come NODO, senza il posto dove va (5/8). Serve perché lo stesso chip
     compare in due posti — la barra della landing e la testata di una console —
     e deve essere lo STESSO: due costruzioni divergono al primo ritocco, e qui
     divergere vuol dire mostrare due contesti diversi nella stessa schermata.
     Chi lo monta gli dà l'id (uno solo può portare `active-class-chip`). */
  function chipNodo() {
    if (!window.MappAIModal || !window.MappAIModal.chipContesto) return null;
    var allievo = _activeNick(), classe = STORE.getActive();
    var materia = classe ? STORE.effectiveDiscipline(classe) : '';
    var nodo = window.MappAIModal.chipContesto([
      {
        id: 'chi', icona: allievo ? 'user-round' : 'graduation-cap', vuoto: !allievo && !classe,
        etichetta: allievo || (classe ? classe.name : t('cb_ctx_classe_vuota', 'Classe'))
      },
      {
        id: 'mat', icona: 'book-open', vuoto: !materia,
        etichetta: materia || t('cb_ctx_materia_vuota', 'Materia')
      }
    ]);
    nodo.title = t('cls_chip_tip2', 'Contesto attivo (classe o allievo, materia) — tara la generazione e filtra la sezione Insegna.');
    nodo.addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('[data-azione]');
      if (!b) return;
      var a = b.getAttribute('data-azione');
      if (a === '__ctx-chi') _pickContesto();
      else if (a === '__ctx-mat') _pickMateria();
    });
    return nodo;
  }

  /* ⚠️ Il selettore al lancio NON esiste più (2/8). Chiedere il contesto a ogni
     avvio era una domanda a cui l'app sapeva già rispondere: la classe, l'allievo
     e la materia attivi vivono in localStorage e sopravvivono alla chiusura. Ora
     si riparte dall'ultima scelta e la si legge nel chip dell'header, che è anche
     il posto da cui si cambia. (Il flag di sessione `mappai_class_prompted` non
     serve più a niente: se ne trovi ancora in giro, è un residuo.) */

  // Entry point — il modale a due tab (Classi / Studenti); il chip lo apre direttamente
  window.openClassAccountsModal = function () {
    if (!LC) { toast('MappAI Live core non caricato.', 'error'); return; }
    var open = function () { if (_accountTab === 'studenti') renderStudents(); else renderList(); };
    if (!STORE.loaded) STORE.load().then(open); else open();
  };
  // Retrocompat: il "cambia classe" ora è lo stesso modale a due tab
  window.openClassSwitcher = function () { window.openClassAccountsModal(); };

  /* il chip come nodo, per chi lo deve montare altrove (la testata delle console) */
  STORE.chipNodo = chipNodo;

  // Precarica lo store all'avvio, poi disegna il chip col contesto di ieri
  if (LC) STORE.load().then(function () {
    renderChip();
    if (window.refreshLevelTuneRow) window.refreshLevelTuneRow();
  });
  console.log('[MappAIClasses] account classi caricato');
})();
