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
  STORE.setActive = function (id) {
    try { if (id) localStorage.setItem(ACTIVE_KEY, id); else localStorage.removeItem(ACTIVE_KEY); } catch (e) {}
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
      '<i data-lucide="users" style="width:22px;height:22px;color:#4f46e5"></i>' + esc(t('cls_title', 'Account classi')) + '</div>' +
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

  // Lista classi
  function renderList() {
    var classes = STORE.list();
    var rows = classes.length ? classes.map(function (c) {
      return '<div style="display:flex;align-items:center;gap:12px;background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:12px 14px;margin-bottom:8px">' +
        '<i data-lucide="graduation-cap" style="width:20px;height:20px;color:#6366f1;flex-shrink:0"></i>' +
        '<div style="flex:1;min-width:0"><div style="font-weight:800;color:#0f172a">' + esc(c.name) + '</div>' +
        '<div style="font-size:11px;color:#94a3b8">' + esc(c.year || '') + ' · ' + (c.students || []).length + ' allievi</div></div>' +
        '<button type="button" data-edit="' + c.id + '" style="' + GHOST + ';border-radius:8px;padding:6px 12px;cursor:pointer;font-size:11px;font-weight:700">' + esc(t('cls_manage', 'Gestisci')) + '</button>' +
        '</div>';
    }).join('') : '<div style="text-align:center;color:#94a3b8;padding:24px 0;font-size:13px">' + esc(t('cls_empty', 'Nessuna classe. Creane una per generare le credenziali degli allievi.')) + '</div>';

    var body = '<div style="font-size:12px;color:#64748b;margin-bottom:12px">' +
      esc(t('cls_intro', 'Ogni allievo entra nelle attività live con: nome classe + emoji personale + numero. Le credenziali sono generate qui.')) + '</div>' +
      rows +
      '<div style="display:flex;justify-content:flex-end;margin-top:14px">' + btn('+ ' + t('cls_new', 'Nuova classe'), PRIMARY).replace('<button', '<button data-new="1"') + '</div>';

    var ov = overlay(body);
    ov.querySelectorAll('[data-edit]').forEach(function (b) { b.onclick = function () { renderEdit(b.getAttribute('data-edit')); }; });
    var nb = ov.querySelector('[data-new]'); if (nb) nb.onclick = renderCreate;
  }

  // Form nuova classe
  function renderCreate() {
    var thisYear = new Date().getFullYear();
    var body = '<div style="display:flex;flex-direction:column;gap:12px">' +
      field('cls-name', t('cls_name', 'Nome classe'), 'text', 'es. 2ª A') +
      '<div id="cls-name-hint" style="font-size:11px;font-weight:600;margin-top:-6px;min-height:14px"></div>' +
      yearField(thisYear) +
      field('cls-count', t('cls_count', 'Numero allievi'), 'number', 'es. 18') +
      '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:6px">' +
      btn(t('cls_cancel', 'Annulla'), GHOST).replace('<button', '<button data-back="1"') +
      btn(t('cls_create', 'Crea classe'), PRIMARY).replace('<button', '<button data-save="1"') +
      '</div></div>';
    var ov = overlay(body, '480px');
    ov.querySelector('[data-back]').onclick = renderList;

    // Nome: hint live (verde valido / ambra formato errato)
    var nameInput = ov.querySelector('#cls-name');
    var nameHint = ov.querySelector('#cls-name-hint');
    function refreshNameHint() {
      var v = (nameInput.value || '').trim();
      if (!v) { nameHint.textContent = ''; return; }
      if (validateClassName(v).ok) {
        nameHint.textContent = '✓ ' + t('cls_name_ok', 'Formato valido');
        nameHint.style.color = '#16a34a';
      } else {
        nameHint.textContent = '⚠ ' + t('cls_name_bad', 'Usa numero + sezione, es. «2ª A» o «II B».');
        nameHint.style.color = '#d97706';
      }
    }
    nameInput.addEventListener('input', refreshNameHint);

    // Anno scolastico: [anno1] / [anno2] con auto-riempimento dell'anno successivo
    var y1 = ov.querySelector('#cls-year1'), y2 = ov.querySelector('#cls-year2');
    var y2Auto = true;
    y2.addEventListener('input', function () { y2Auto = false; });
    y1.addEventListener('input', function () {
      var v = parseInt(y1.value, 10);
      if (y2Auto && v >= 1900 && v <= 2200) y2.value = String(v + 1);
    });

    ov.querySelector('[data-save]').onclick = function () {
      var name = (nameInput.value || '').trim();
      var y1v = (y1.value || '').trim(), y2v = (y2.value || '').trim();
      var year = y1v && y2v ? (y1v + '/' + y2v) : (y1v || y2v || '');
      var count = parseInt(ov.querySelector('#cls-count').value, 10) || 0;
      if (!name) { toast(t('cls_need_name', 'Inserisci il nome della classe.'), 'error'); return; }
      if (!validateClassName(name).ok) {
        toast(t('cls_name_bad', 'Nome classe: usa numero + sezione, es. «2ª A» o «II B».'), 'error');
        refreshNameHint(); nameInput.focus(); return;
      }
      if (count < 1) { toast(t('cls_need_count', 'Inserisci il numero di allievi.'), 'error'); return; }
      if (count > LC.MAX_IDENTITIES) { toast(t('cls_too_many', 'Numero allievi troppo alto') + ' (max ' + LC.MAX_IDENTITIES + ').', 'error'); return; }
      var cls = { id: newId(), name: name, grade: name, year: year, students: LC.buildCredentials(count) };
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

    var sysOpts = ['', 'Scuola Media', 'Scuola Media Superiore'].map(function (s) {
      return '<option value="' + esc(s) + '"' + (c.system === s ? ' selected' : '') + '>' + (s || t('cls_level_none', '— livello —')) + '</option>';
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
        '<b>Classe</b> — a chi ti rivolgi (ereditato dal nome della classe; puoi affinarlo).<br>' +
        '<b>Livello</b> — Scuola Media o Superiore: regola profondità e complessità dei contenuti.<br>' +
        '<b>Registro</b> — quanto è semplice o ricco il linguaggio (lunghezza frasi, lessico).<br>' +
        '<b>Note</b> — indicazioni libere (es. «3 DSA», «esempi dallo sport», «evita metafore astratte»).<br><br>' +
        'Vale per mappe, quiz, cloze e tutor generati quando questa classe è la <b>classe attiva</b>. Le mappe già create non vengono ri-tradotte.') +
      '</div>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px">' +
      '<input id="cls-grade" value="' + esc(c.grade || c.name || '') + '" placeholder="' + t('cls_grade_ph', 'Classe (es. 1ª media)') + '" style="flex:1;min-width:150px;border:1px solid #c7d2fe;border-radius:8px;padding:8px 10px;font:inherit;background:#fff">' +
      '<select id="cls-system" style="flex:1;min-width:130px;border:1px solid #c7d2fe;border-radius:8px;padding:8px 10px;font:inherit;background:#fff">' + sysOpts + '</select>' +
      '<select id="cls-register" style="flex:1;min-width:160px;border:1px solid #c7d2fe;border-radius:8px;padding:8px 10px;font:inherit;background:#fff">' + regOpts + '</select></div>' +
      '<textarea id="cls-notes" placeholder="' + t('cls_notes_ph', 'Note di taratura (es. 3 DSA, 2 alloglotti; esempi dallo sport; evita metafore astratte)') + '" style="width:100%;min-height:56px;border:1px solid #c7d2fe;border-radius:8px;padding:8px 10px;font:inherit;background:#fff;resize:vertical">' + esc(c.notes || '') + '</textarea></div>';

    var body = '<div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">' +
      '<div style="flex:1"><div style="font-weight:800;font-size:15px;color:#0f172a">' + esc(c.name) + '</div>' +
      '<div style="font-size:11px;color:#94a3b8">' + esc(c.year || '') + ' · ' + (c.students || []).length + ' allievi</div></div>' +
      btn(t('cls_print', 'Stampa credenziali'), GHOST).replace('<button', '<button data-print="1"') + '</div>' +
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
    ov.querySelector('[data-savenames]').onclick = function () {
      ov.querySelectorAll('[data-name]').forEach(function (inp) {
        var idx = parseInt(inp.getAttribute('data-name'), 10);
        if (c.students[idx]) c.students[idx].name = (inp.value || '').trim().slice(0, LC.LIMITS.nameMax);
      });
      // taratura AI
      c.grade = (ov.querySelector('#cls-grade').value || '').trim().slice(0, 40);
      c.system = ov.querySelector('#cls-system').value || '';
      c.register = ov.querySelector('#cls-register').value || '';
      c.notes = (ov.querySelector('#cls-notes').value || '').trim().slice(0, 400);
      STORE.save();
      if (STORE.activeId() === c.id) renderChip();
      toast(t('cls_saved', 'Classe salvata.'), 'success');
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
    var active = STORE.getActive();
    var label = active ? active.name : t('cls_generic', 'Generico');
    if (!chip) {
      chip = document.createElement('button');
      chip.id = 'active-class-chip';
      chip.type = 'button';
      chip.className = 'btn_header_setting';
      chip.style.cssText = 'width:auto;gap:6px;padding-left:10px;padding-right:12px;white-space:nowrap';
      chip.onclick = openClassSwitcher;
      host.insertBefore(chip, host.firstChild);
    }
    chip.title = t('cls_chip_tip', 'Classe attiva — governa la taratura dei contenuti AI. Clicca per cambiarla.');
    chip.innerHTML = '<i data-lucide="graduation-cap" class="nav_util_icon"></i>' +
      '<span style="font-size:12px;font-weight:800;color:' + (active ? '#4f46e5' : '#94a3b8') + '">' + esc(label) + '</span>';
    if (window.safeCreateIcons) window.safeCreateIcons();
  }

  function openClassSwitcher() {
    var classes = STORE.list();
    var activeId = STORE.activeId();
    var items = classes.map(function (c) {
      var sel = c.id === activeId;
      var tune = [c.grade, c.register && REGISTERS[c.register] ? REGISTERS[c.register].label.split(' (')[0] : ''].filter(Boolean).join(' · ');
      return '<button type="button" data-id="' + c.id + '" style="display:flex;align-items:center;gap:12px;text-align:left;width:100%;background:' + (sel ? '#eef2ff' : '#fff') + ';border:2px solid ' + (sel ? '#4f46e5' : '#e2e8f0') + ';border-radius:12px;padding:13px 16px;cursor:pointer;margin-bottom:8px">' +
        '<i data-lucide="graduation-cap" style="width:22px;height:22px;color:#4f46e5;flex-shrink:0"></i>' +
        '<div style="flex:1"><div style="font-weight:800;color:#0f172a">' + esc(c.name) + '</div>' +
        '<div style="font-size:11px;color:#94a3b8">' + esc(tune || c.year || (c.students || []).length + ' allievi') + '</div></div>' +
        (sel ? '<i data-lucide="check" style="width:18px;height:18px;color:#4f46e5"></i>' : '') + '</button>';
    }).join('');
    var generic = '<button type="button" data-id="" style="display:flex;align-items:center;gap:12px;text-align:left;width:100%;background:' + (!activeId ? '#eef2ff' : '#fff') + ';border:2px solid ' + (!activeId ? '#4f46e5' : '#e2e8f0') + ';border-radius:12px;padding:13px 16px;cursor:pointer;margin-bottom:8px">' +
      '<i data-lucide="circle-slash" style="width:22px;height:22px;color:#94a3b8;flex-shrink:0"></i>' +
      '<div style="flex:1"><div style="font-weight:800;color:#0f172a">' + t('cls_generic', 'Generico') + '</div>' +
      '<div style="font-size:11px;color:#94a3b8">' + t('cls_generic_d', 'Nessuna taratura: contenuti AI standard') + '</div></div>' +
      (!activeId ? '<i data-lucide="check" style="width:18px;height:18px;color:#4f46e5"></i>' : '') + '</button>';

    var body = '<div style="font-size:12px;color:#64748b;margin-bottom:12px">' +
      t('cls_switch_intro', 'Scegli la classe con cui lavori adesso: mappe, quiz e cloze verranno generati al suo livello.') + '</div>' +
      generic + items +
      (classes.length ? '' : '<div style="text-align:center;color:#94a3b8;font-size:12px;margin:8px 0">' + t('cls_switch_empty', 'Nessuna classe ancora. Creane una in Account classi.') + '</div>') +
      '<div style="display:flex;justify-content:flex-end;margin-top:6px">' + btn(t('cls_manage_all', 'Gestisci classi'), GHOST).replace('<button', '<button data-manage="1"') + '</div>';
    var ov = overlay(body, '480px');
    // titolo del modale
    var titleEl = ov.querySelector('div[role="dialog"] > div');
    ov.querySelectorAll('[data-id]').forEach(function (b) {
      b.onclick = function () { STORE.setActive(b.getAttribute('data-id')); closeModal(); };
    });
    var mng = ov.querySelector('[data-manage]');
    if (mng) mng.onclick = function () { renderList(); };
    if (window.safeCreateIcons) window.safeCreateIcons();
  }

  // Al primo avvio con classi presenti: proponi la scelta (una volta per sessione)
  function maybePromptLaunch() {
    try { if (sessionStorage.getItem('mappai_class_prompted')) return; } catch (e) {}
    if (!STORE.list().length) return;
    try { sessionStorage.setItem('mappai_class_prompted', '1'); } catch (e) {}
    openClassSwitcher();
  }

  // Entry point
  window.openClassAccountsModal = function () {
    if (!LC) { toast('MappAI Live core non caricato.', 'error'); return; }
    var open = function () { renderList(); };
    if (!STORE.loaded) STORE.load().then(open); else open();
  };
  window.openClassSwitcher = function () {
    if (!STORE.loaded) STORE.load().then(openClassSwitcher); else openClassSwitcher();
  };

  // Precarica lo store all'avvio, poi chip + eventuale selettore
  if (LC) STORE.load().then(function () {
    renderChip();
    // il picker al lancio solo sulla landing (non durante una mappa aperta)
    setTimeout(maybePromptLaunch, 800);
  });
  console.log('[MappAIClasses] account classi caricato');
})();
