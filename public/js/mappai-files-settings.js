/*
 * mappai-files-settings.js — UI "Cartella documenti" (010)
 * -----------------------------------------------------------------------
 * Chiede al docente DOVE creare la cartella madre unica "MappAI - file" e,
 * su conferma, migra i dati storici (~/Documents/MappAI - *) nella nuova
 * struttura. Tutto passa dagli IPC di main.js (filesRootGet/Choose/
 * MigratePreview/Setup/OpenRoot). Su browser (no electronAPI) degrada a nota.
 *
 * API: window.MappAIFiles.openSettings() · maybePromptFirstRun() (una volta).
 * Solo I/O + DOM: la logica pura è in mappai-files-core.js (lato main).
 */
(function () {
  'use strict';

  var LS_PROMPTED = 'mappai_files_prompted';
  function _t(k, f) { return window.t ? window.t(k, f) : f; }
  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function api() { return (window.electronAPI && window.electronAPI.filesRootGet) ? window.electronAPI : null; }
  function toast(m, l) { if (window.showToast) window.showToast(m, l || 'info'); }

  // Overlay minimale (pattern .pm-* compatibile col resto dell'app).
  function overlay(titleIcon, title, innerHtml, maxW) {
    var ov = document.createElement('div');
    ov.className = 'mappai-files-overlay';
    ov.style.cssText = 'position:fixed;inset:0;z-index:9994;background:rgba(15,23,42,.5);display:flex;align-items:center;justify-content:center;padding:18px';
    ov.innerHTML = '<div role="dialog" aria-modal="true" style="background:#f8fafc;border-radius:16px;box-shadow:0 25px 60px -12px rgba(0,0,0,.4);width:min(' + (maxW || '540px') + ',95vw);max-height:88vh;overflow-y:auto;padding:22px 24px">' +
      '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">' +
      '<div style="display:flex;align-items:center;gap:9px;font-weight:800;font-size:16px;color:#0f172a"><i data-lucide="' + titleIcon + '" style="width:20px;height:20px;color:#4f46e5"></i>' + esc(title) + '</div>' +
      '<button type="button" class="fx-close" aria-label="Chiudi" style="background:none;border:none;cursor:pointer;color:#94a3b8;font-size:22px;line-height:1;padding:4px">×</button></div>' +
      '<div class="fx-body">' + innerHtml + '</div></div>';
    ov.addEventListener('click', function (e) { if (e.target === ov) ov.remove(); });
    ov.querySelector('.fx-close').onclick = function () { ov.remove(); };
    var escH = function (e) { if (e.key === 'Escape') { ov.remove(); document.removeEventListener('keydown', escH); } };
    document.addEventListener('keydown', escH);
    document.body.appendChild(ov);
    if (window.safeCreateIcons) window.safeCreateIcons();
    return ov;
  }

  var btnPrimary = 'border:none;border-radius:10px;padding:11px 18px;background:#4f46e5;color:#fff;font-weight:700;cursor:pointer;font-size:13.5px';
  var btnGhost = 'border:1px solid #cbd5e1;border-radius:10px;padding:10px 16px;background:#fff;color:#475569;font-weight:600;cursor:pointer;font-size:13px';

  // Passo 2: anteprima migrazione + conferma.
  function showSetupConfirm(filesRoot) {
    window.electronAPI.filesMigratePreview().then(function (pv) {
      var lines = (pv && pv.success && pv.byType && pv.byType.length)
        ? pv.byType.map(function (x) { return '<li style="margin:2px 0">' + esc(x.from) + ' → <b>' + esc(x.to) + '</b> <span style="color:#94a3b8">(' + x.count + ')</span></li>'; }).join('')
        : '<li style="color:#94a3b8;list-style:none">' + esc(_t('fx_nothing_move', 'Nessun dato storico da spostare.')) + '</li>';
      var hasData = pv && pv.success && pv.total > 0;
      var inner =
        '<p style="font-size:13.5px;color:#334155;line-height:1.6;margin-bottom:12px">' +
        esc(_t('fx_will_create', 'Creerò la cartella')) + ' <b>MappAI - file</b> ' + esc(_t('fx_in', 'in')) +
        ':<br><code style="font-size:12px;color:#4f46e5;word-break:break-all">' + esc(filesRoot) + '</code></p>' +
        (hasData
          ? '<div style="background:#eef2ff;border:1px solid #c7d2fe;border-radius:10px;padding:12px 14px;margin-bottom:12px">' +
            '<div style="font-size:12px;font-weight:700;color:#4338ca;margin-bottom:6px">' + esc(_t('fx_move_title', 'Sposto i dati esistenti')) + '</div>' +
            '<ul style="font-size:12.5px;color:#334155;padding-left:18px;margin:0">' + lines + '</ul>' +
            '<label style="display:flex;align-items:center;gap:8px;margin-top:10px;font-size:12.5px;color:#334155;cursor:pointer">' +
            '<input type="checkbox" class="fx-migrate" checked style="width:16px;height:16px">' + esc(_t('fx_do_move', 'Sposta ora i dati esistenti nella nuova cartella')) + '</label>' +
            '<p style="font-size:11.5px;color:#b45309;background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:8px 10px;margin:10px 0 0">' +
            esc(_t('fx_obsidian_warn', 'Se apri il Vault in Obsidian, dopo lo spostamento riaprilo da MappAI - file/Mappe.')) + '</p></div>'
          : '') +
        '<div style="display:flex;justify-content:flex-end;gap:10px;margin-top:6px">' +
        '<button type="button" class="fx-cancel" style="' + btnGhost + '">' + esc(_t('fx_cancel', 'Annulla')) + '</button>' +
        '<button type="button" class="fx-confirm" style="' + btnPrimary + '">' + esc(_t('fx_confirm', 'Crea e organizza')) + '</button></div>';
      var ov = overlay('folder-cog', _t('fx_setup_title', 'Organizza i file di MappAI'), inner, '560px');
      ov.querySelector('.fx-cancel').onclick = function () { ov.remove(); };
      ov.querySelector('.fx-confirm').onclick = function () {
        var mig = ov.querySelector('.fx-migrate');
        var doMove = mig ? mig.checked : false;
        var btn = ov.querySelector('.fx-confirm'); btn.disabled = true; btn.textContent = _t('fx_working', 'Sto organizzando…');
        window.electronAPI.filesSetup({ filesRoot: filesRoot, migrate: doMove }).then(function (r) {
          if (!r || !r.success) { toast((r && r.error) || _t('fx_err', 'Errore durante l\'organizzazione'), 'error'); btn.disabled = false; btn.textContent = _t('fx_confirm', 'Crea e organizza'); return; }
          // best-effort: aggiorna il path del vault attualmente caricato se è stato spostato
          try {
            if (r.vaultMap && window.appState && window.appState.activeVaultPath && r.vaultMap[window.appState.activeVaultPath]) {
              window.appState.activeVaultPath = r.vaultMap[window.appState.activeVaultPath];
            }
          } catch (e) { }
          ov.remove();
          toast(_t('fx_done', 'Fatto! I documenti di MappAI ora vivono in una cartella sola.') + (r.moved ? ' (' + r.moved + ' ' + _t('fx_moved', 'spostati') + ')' : ''), 'success');
          if (window.MappAITeach && window.MappAITeach.refresh) window.MappAITeach.refresh();
        });
      };
    });
  }

  // Modale principale (stato + azioni).
  function openSettings() {
    if (!api()) { toast(_t('fx_desktop', 'Disponibile solo nell\'app desktop.'), 'warning'); return; }
    window.electronAPI.filesRootGet().then(function (st) {
      var inner;
      if (st && st.organized) {
        inner = '<p style="font-size:13.5px;color:#334155;line-height:1.6;margin-bottom:14px">' +
          esc(_t('fx_current', 'Tutti i documenti di MappAI sono organizzati in una cartella sola:')) +
          '<br><code style="font-size:12px;color:#4f46e5;word-break:break-all">' + esc(st.rootDir || '') + '</code></p>' +
          '<div style="display:flex;gap:10px;flex-wrap:wrap">' +
          '<button type="button" class="fx-open" style="' + btnPrimary + '"><i data-lucide="folder-open" style="width:15px;height:15px;vertical-align:-2px;margin-right:5px"></i>' + esc(_t('fx_open', 'Apri la cartella')) + '</button>' +
          '<button type="button" class="fx-change" style="' + btnGhost + '">' + esc(_t('fx_change', 'Cambia posizione')) + '</button></div>' +
          '<p style="font-size:11.5px;color:#94a3b8;margin-top:14px;line-height:1.5">' + esc(_t('fx_structure', 'Struttura: Mappe · Attività di studio · File condivisi · Classi · Giardini.')) + '</p>';
      } else {
        inner = '<p style="font-size:13.5px;color:#334155;line-height:1.6;margin-bottom:8px">' +
          esc(_t('fx_intro', 'Scegli dove MappAI deve raccogliere TUTTI i documenti che produce (mappe, report delle attività, file condivisi, classi) in una sola cartella "MappAI - file".')) + '</p>' +
          '<p style="font-size:12px;color:#94a3b8;line-height:1.5;margin-bottom:16px">' +
          esc(_t('fx_intro2', 'Oggi sono sparsi in più cartelle dentro Documenti. Finché non scegli, nulla cambia.')) + '</p>' +
          '<div style="display:flex;justify-content:flex-end"><button type="button" class="fx-choose" style="' + btnPrimary + '"><i data-lucide="folder-plus" style="width:15px;height:15px;vertical-align:-2px;margin-right:5px"></i>' + esc(_t('fx_choose', 'Scegli la posizione')) + '</button></div>';
      }
      var ov = overlay('folder-cog', _t('fx_title', 'Cartella documenti'), inner, '540px');
      var open = ov.querySelector('.fx-open'); if (open) open.onclick = function () { window.electronAPI.filesOpenRoot(); };
      var choose = ov.querySelector('.fx-choose'); if (choose) choose.onclick = function () { doChoose(ov); };
      var change = ov.querySelector('.fx-change'); if (change) change.onclick = function () { doChoose(ov); };
    });
  }

  function doChoose(parentOv) {
    window.electronAPI.filesRootChoose().then(function (r) {
      if (!r || r.canceled || !r.filesRoot) return;
      if (parentOv) parentOv.remove();
      showSetupConfirm(r.filesRoot);
    });
  }

  // Prompt gentile al primo avvio (una volta sola per installazione).
  function maybePromptFirstRun() {
    if (!api()) return;
    try { if (localStorage.getItem(LS_PROMPTED) === '1') return; } catch (e) { return; }
    window.electronAPI.filesRootGet().then(function (st) {
      if (st && st.organized) { try { localStorage.setItem(LS_PROMPTED, '1'); } catch (e) { } return; }
      try { localStorage.setItem(LS_PROMPTED, '1'); } catch (e) { }
      var inner = '<p style="font-size:13.5px;color:#334155;line-height:1.6;margin-bottom:16px">' +
        esc(_t('fx_fr_body', 'Vuoi che MappAI raccolga tutti i suoi documenti (mappe, report, file condivisi, classi) in una sola cartella a tua scelta? Potrai spostare anche quelli già esistenti.')) + '</p>' +
        '<div style="display:flex;justify-content:flex-end;gap:10px">' +
        '<button type="button" class="fx-later" style="' + btnGhost + '">' + esc(_t('fx_later', 'Più tardi')) + '</button>' +
        '<button type="button" class="fx-now" style="' + btnPrimary + '">' + esc(_t('fx_setup_now', 'Scegli la posizione')) + '</button></div>';
      var ov = overlay('folder-cog', _t('fx_fr_title', 'Organizza i documenti di MappAI'), inner, '500px');
      ov.querySelector('.fx-later').onclick = function () { ov.remove(); };
      ov.querySelector('.fx-now').onclick = function () { doChoose(ov); };
    });
  }

  window.MappAIFiles = { openSettings: openSettings, maybePromptFirstRun: maybePromptFirstRun };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { setTimeout(maybePromptFirstRun, 1500); });
  else setTimeout(maybePromptFirstRun, 1500);

  console.log('[MappAIFiles] impostazioni cartella documenti caricate');
})();
