/*
 * mappai-timeline-teacher.js — attività "Timeline" di MappAI Live (008)
 * ----------------------------------------------------------------------------
 * Wizard di setup (Completa / Costruisci), dashboard docente, proiezione LIM.
 * Riusa l'infrastruttura di mappai-live-teacher.js (MappAILive.launchExternal)
 * e la logica pura di mappai-timeline-core.js. Zero chiamate AI (pool dal progetto).
 */
(function () {
  'use strict';
  var TL = window.MappAITimelineLive = window.MappAITimelineLive || {};

  function S() { try { return (typeof appState !== 'undefined') ? appState : window.appState; } catch (e) { return window.appState; } }
  function core() { return window.MappAITimelineCore; }
  function _t(k, f) { try { return window.t ? window.t(k, f) : f; } catch (e) { return f; } }
  function esc(s) { var d = document.createElement('div'); d.textContent = s == null ? '' : String(s); return d.innerHTML; }
  function toast(m, k) { if (window.showToast) window.showToast(m, k || 'info'); else console.log(m); }

  // Pool = date dell'ultima generazione AI + manuali/studente, deduplicato.
  function pool() {
    var db = (S() && S().db) || {};
    var c = core();
    if (!c) return [];
    return c.buildPool(db.timelineAI || [], db.timelineEvents || []);
  }
  // Testo sorgente (per gaps/sourceYears in Costruisci).
  function sourceText() {
    try { return window.MappAITimeline ? window.MappAITimeline._sourceText() : ''; } catch (e) { return ''; }
  }

  function closeModal() { var m = document.getElementById('tl-live-modal'); if (m) m.remove(); }
  function modal(title, subtitle, bodyHtml) {
    closeModal();
    var ov = document.createElement('div');
    ov.id = 'tl-live-modal';
    ov.style.cssText = 'position:fixed;inset:0;z-index:10000;background:rgba(15,23,42,.55);display:flex;align-items:center;justify-content:center;padding:16px;font-family:inherit';
    ov.innerHTML =
      '<div style="background:#fff;border-radius:18px;max-width:640px;width:100%;max-height:90vh;overflow:auto;padding:24px 26px;box-shadow:0 20px 60px rgba(0,0,0,.3)">' +
        '<div style="display:flex;align-items:center;gap:12px;margin-bottom:6px">' +
          '<div style="width:40px;height:40px;border-radius:12px;background:#eef2ff;display:flex;align-items:center;justify-content:center"><i data-lucide="calendar-clock" style="color:#4f46e5"></i></div>' +
          '<div><div style="font-weight:800;font-size:17px;color:#0f172a">' + esc(title) + '</div>' +
          '<div style="font-size:12px;color:#64748b">' + esc(subtitle || '') + '</div></div>' +
        '</div>' +
        '<div id="tl-live-body" style="margin-top:14px">' + bodyHtml + '</div>' +
      '</div>';
    document.body.appendChild(ov);
    ov.addEventListener('click', function (e) { if (e.target === ov) closeModal(); });
    if (window.safeCreateIcons) window.safeCreateIcons();
    return ov;
  }

  // ── Entry: guard pool → wizard ──────────────────────────────────────────────
  TL.openSetup = function () {
    var p = pool();
    if (!p.length) {
      var b = '<p style="font-size:13.5px;color:#334155;line-height:1.6">' +
        esc(_t('tl_need_pool', 'Nessuna data disponibile. Genera prima la Timeline della mappa: le date estratte (e quelle che aggiungi a mano) diventano le domande dell\'attività.')) + '</p>' +
        '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px">' +
        '<button type="button" id="tl-cancel" style="background:#fff;border:1px solid #e2e8f0;color:#334155;border-radius:10px;padding:10px 16px;cursor:pointer;font-weight:700">' + esc(_t('tl_cancel', 'Annulla')) + '</button>' +
        '<button type="button" id="tl-gen" style="background:#4f46e5;color:#fff;border:0;border-radius:10px;padding:10px 20px;cursor:pointer;font-weight:800">' + esc(_t('tl_generate', 'Genera la Timeline')) + '</button></div>';
      var ov = modal(_t('tl_title', 'Timeline live'), _t('tl_sub_nopool', 'Serve un pool di date'), b);
      ov.querySelector('#tl-cancel').onclick = closeModal;
      ov.querySelector('#tl-gen').onclick = function () { closeModal(); if (window.openTimelineGeneratorModal) window.openTimelineGeneratorModal(); };
      return;
    }
    _wizard(p);
  };

  function _wizard(p) {
    var classes = (window.MappAIClasses && window.MappAIClasses.list()) || [];
    var activeId = (window.MappAIClasses && window.MappAIClasses.activeId && window.MappAIClasses.activeId()) || '';
    var classOpts = classes.map(function (c) {
      return '<option value="' + c.id + '"' + (c.id === activeId ? ' selected' : '') + '>' + esc(c.name) + (c.year ? ' (' + esc(c.year) + ')' : '') + ' · ' + (c.students || []).length + '</option>';
    }).join('');
    var classField = classes.length
      ? '<select id="tl-class" class="tl-in">' + classOpts + '</select>'
      : '<div style="font-size:12px;color:#b45309;background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:10px 12px">' +
        esc(_t('tl_no_class', 'Nessuna classe. Creala in Profilo → Account classi.')) + '</div>';

    var body = '<style>' +
      '.tl-in{width:100%;border:1px solid #e2e8f0;border-radius:10px;padding:9px 11px;font:inherit;color:#0f172a;background:#fff}' +
      '.tl-lab{display:block;font-size:11px;font-weight:700;color:#475569;margin:12px 0 4px}' +
      '.tl-cards{display:flex;gap:8px}.tl-cards button{flex:1;border:2px solid #e2e8f0;background:#fff;border-radius:12px;padding:12px;cursor:pointer;text-align:left}' +
      '.tl-cards button.sel{border-color:#4f46e5;background:#eef2ff}.tl-cards b{display:block;font-size:13px;color:#0f172a;margin-bottom:3px}.tl-cards span{font-size:11px;color:#64748b}' +
      '.tl-row{display:flex;gap:12px}.tl-row>div{flex:1}</style>' +

      '<span class="tl-lab">' + esc(_t('tl_class', 'Classe')) + '</span>' + classField +

      '<span class="tl-lab">' + esc(_t('tl_mode', 'Modalità')) + '</span>' +
      '<div class="tl-cards" id="tl-mode">' +
        '<button type="button" data-m="complete" class="sel"><b>' + esc(_t('tl_m_complete', 'Completa la timeline')) + '</b><span>' + esc(_t('tl_m_complete_d', 'Domande autovalutate: dato l\'anno l\'evento, o viceversa.')) + '</span></button>' +
        '<button type="button" data-m="build"><b>' + esc(_t('tl_m_build', 'Costruisci la timeline')) + '</b><span>' + esc(_t('tl_m_build_d', 'Gli allievi propongono le date mancanti; tu approvi.')) + '</span></button>' +
      '</div>' +

      '<span class="tl-lab">' + esc(_t('tl_login', 'Accesso allievi')) + '</span>' +
      '<select id="tl-login" class="tl-in">' +
        '<option value="individual">' + esc(_t('tl_login_ind', 'Individuale (emoji + numero)')) + '</option>' +
        '<option value="group">' + esc(_t('tl_login_grp', 'A gruppi (nickname)')) + '</option>' +
      '</select>' +

      // Opzioni Completa
      '<div id="tl-opts-complete">' +
        '<div class="tl-row">' +
          '<div><span class="tl-lab">' + esc(_t('tl_dir', 'Direzione')) + '</span>' +
            '<select id="tl-dir" class="tl-in"><option value="mixed">' + esc(_t('tl_dir_mixed', 'Mista')) + '</option>' +
            '<option value="toEvent">' + esc(_t('tl_dir_toevent', 'Anno → Evento')) + '</option>' +
            '<option value="toYear">' + esc(_t('tl_dir_toyear', 'Evento → Anno')) + '</option></select></div>' +
          '<div><span class="tl-lab">' + esc(_t('tl_format', 'Risposta')) + '</span>' +
            '<select id="tl-format" class="tl-in"><option value="open">' + esc(_t('tl_fmt_open', 'Aperta')) + '</option>' +
            '<option value="mc">' + esc(_t('tl_fmt_mc', 'Scelta multipla')) + '</option></select></div>' +
        '</div>' +
        '<div class="tl-row">' +
          '<div><span class="tl-lab">' + esc(_t('tl_hint', 'Indizio dalla fonte')) + '</span>' +
            '<select id="tl-hint" class="tl-in"><option value="onrequest">' + esc(_t('tl_hint_req', 'Su richiesta 💡')) + '</option>' +
            '<option value="always">' + esc(_t('tl_hint_always', 'Sempre visibile')) + '</option>' +
            '<option value="never">' + esc(_t('tl_hint_never', 'Mai')) + '</option></select></div>' +
          '<div><span class="tl-lab">' + esc(_t('tl_tol', 'Tolleranza anni')) + '</span>' +
            '<select id="tl-tol" class="tl-in"><option value="2">± 2</option><option value="0">' + esc(_t('tl_tol_exact', 'Esatto')) + '</option><option value="5">± 5</option></select></div>' +
        '</div>' +
        '<div class="tl-row">' +
          '<div><span class="tl-lab">' + esc(_t('tl_order', 'Ordine')) + '</span>' +
            '<select id="tl-order" class="tl-in"><option value="shuffle">' + esc(_t('tl_order_shuffle', 'Mescolato')) + '</option><option value="chrono">' + esc(_t('tl_order_chrono', 'Cronologico')) + '</option></select></div>' +
          '<div><span class="tl-lab">' + esc(_t('tl_qty', 'N. domande')) + '</span><input id="tl-qty" type="number" class="tl-in" value="8" min="1" max="' + p.length + '" inputmode="numeric"></div>' +
        '</div>' +
      '</div>' +

      // Opzioni Costruisci
      '<div id="tl-opts-build" style="display:none">' +
        '<div class="tl-row">' +
          '<div><span class="tl-lab">' + esc(_t('tl_build_src', 'Cosa proporre')) + '</span>' +
            '<select id="tl-bsrc" class="tl-in"><option value="both">' + esc(_t('tl_bsrc_both', 'Buchi + proposta libera')) + '</option>' +
            '<option value="gaps">' + esc(_t('tl_bsrc_gaps', 'Solo buchi dalla fonte')) + '</option>' +
            '<option value="free">' + esc(_t('tl_bsrc_free', 'Solo proposta libera')) + '</option></select></div>' +
          '<div><span class="tl-lab">' + esc(_t('tl_maxprop', 'Max proposte / allievo')) + '</span><input id="tl-maxprop" type="number" class="tl-in" value="3" min="1" max="10" inputmode="numeric"></div>' +
        '</div>' +
      '</div>' +

      '<div class="tl-row"><div><span class="tl-lab">' + esc(_t('tl_timer', 'Timer (min, 0 = nessuno)')) + '</span><input id="tl-timer" type="number" class="tl-in" value="0" min="0" inputmode="numeric"></div><div></div></div>' +

      '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:18px">' +
        '<button type="button" id="tl-cancel" style="background:#fff;border:1px solid #e2e8f0;color:#334155;border-radius:10px;padding:10px 16px;cursor:pointer;font-weight:700">' + esc(_t('tl_cancel', 'Annulla')) + '</button>' +
        '<button type="button" id="tl-go" style="background:#4f46e5;color:#fff;border:0;border-radius:10px;padding:10px 20px;cursor:pointer;font-weight:800">' + esc(_t('tl_go', 'Avvia sessione')) + '</button></div>';

    var ov = modal(_t('tl_title', 'Timeline live'), esc(p.length) + ' ' + esc(_t('tl_dates', 'date disponibili')), body);
    var mode = 'complete';
    ov.querySelectorAll('#tl-mode button').forEach(function (b) {
      b.onclick = function () {
        mode = b.getAttribute('data-m');
        ov.querySelectorAll('#tl-mode button').forEach(function (x) { x.classList.toggle('sel', x === b); });
        ov.querySelector('#tl-opts-complete').style.display = mode === 'complete' ? '' : 'none';
        ov.querySelector('#tl-opts-build').style.display = mode === 'build' ? '' : 'none';
      };
    });
    ov.querySelector('#tl-cancel').onclick = closeModal;
    ov.querySelector('#tl-go').onclick = function () {
      var cls = classes.find(function (c) { return c.id === (ov.querySelector('#tl-class') && ov.querySelector('#tl-class').value); });
      if (!cls) { toast(_t('tl_pick_class', 'Scegli o crea una classe.'), 'error'); return; }
      var loginMode = ov.querySelector('#tl-login').value;
      var timer = Math.max(0, parseInt(ov.querySelector('#tl-timer').value, 10) || 0);
      if (mode === 'complete') {
        _launchComplete(cls, p, {
          direction: ov.querySelector('#tl-dir').value,
          format: ov.querySelector('#tl-format').value,
          hintMode: ov.querySelector('#tl-hint').value,
          yearTolerance: parseInt(ov.querySelector('#tl-tol').value, 10),
          order: ov.querySelector('#tl-order').value,
          count: Math.max(1, parseInt(ov.querySelector('#tl-qty').value, 10) || 8),
          loginMode: loginMode, timer: timer
        });
      } else {
        if (TL._launchBuild) TL._launchBuild(cls, p, {
          bsrc: ov.querySelector('#tl-bsrc').value,
          maxProposals: Math.max(1, parseInt(ov.querySelector('#tl-maxprop').value, 10) || 3),
          hintMode: ov.querySelector('#tl-hint').value,
          loginMode: loginMode, timer: timer
        });
        else toast(_t('tl_build_soon', 'Modalità Costruisci non ancora disponibile.'), 'warning');
      }
    };
  }

  // ── Completa: genera domande dal pool e avvia (zero AI) ──────────────────────
  function _launchComplete(cls, p, opts) {
    var c = core();
    var built = c.buildQuestions(p, {
      direction: opts.direction, format: opts.format, hintMode: opts.hintMode,
      yearTolerance: opts.yearTolerance, order: opts.order, count: opts.count,
      seed: (S().rootNodeLabel || 'timeline') + ':' + Date.now()
    });
    if (!built.questions.length) { toast(_t('tl_no_q', 'Pool insufficiente per generare domande.'), 'error'); return; }
    if (built.degraded) toast(_t('tl_degraded', 'Poche date: alcune domande a scelta multipla sono diventate aperte.'), 'info');
    window.MappAILive.launchExternal(cls, 'timeline', built.questions, opts.timer, {
      mode: 'quiz', loginMode: opts.loginMode, hintMode: opts.hintMode, logActivity: 'timeline'
    });
  }

  console.log('[MappAITimelineLive] modulo Timeline Live caricato ✓');
})();
