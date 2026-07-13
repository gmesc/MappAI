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

  // ── Costruisci: calcola buchi/pool e avvia la sessione build ────────────────
  function _launchBuild(cls, p, opts) {
    var c = core();
    var src = sourceText();
    var years = c.extractYears(src);
    var sourceYears = years.map(function (y) { return y.year; });
    var poolKeys = p.map(function (e) { return c.eventKey(e); });
    var gaps = (opts.bsrc === 'free') ? [] : c.buildGaps(src, p);
    var build = {
      gaps: gaps, freeAllowed: opts.bsrc !== 'gaps',
      maxProposals: opts.maxProposals, sourceYears: sourceYears, poolKeys: poolKeys
    };
    window.MappAILive.launchExternal(cls, 'timeline', [], opts.timer, {
      mode: 'build', loginMode: opts.loginMode, hintMode: opts.hintMode, logActivity: 'timeline',
      build: build, onLaunched: function (info) { TL._info = info; _buildDashboard(info); }
    });
  }
  TL._launchBuild = _launchBuild;

  function qrUrl(text, cell) {
    if (typeof qrcode !== 'function') return null;
    var qr = qrcode(0, 'M'); qr.addData(text); qr.make(); return qr.createDataURL(cell || 7, 8);
  }
  function buildStudentUrl(info) {
    var base = (info.urls && info.urls[0]) || ('http://localhost:' + info.port);
    return base + '/public/live/timeline-build.html?s=' + info.token;
  }
  function adminApi(info, p, opts) {
    return fetch('http://127.0.0.1:' + info.port + p, opts).then(function (r) { return r.json().then(function (b) { return { status: r.status, body: b }; }, function () { return { status: r.status, body: null }; }); });
  }

  // ── Dashboard di revisione (polling proposte) ───────────────────────────────
  TL._reviewed = TL._reviewed || {};
  function _buildDashboard(info) {
    var url = buildStudentUrl(info);
    var qr = qrUrl(url);
    var body =
      '<div style="display:flex;gap:20px;flex-wrap:wrap;align-items:flex-start">' +
        '<div style="text-align:center">' +
          (qr ? '<img src="' + qr + '" alt="QR" style="width:180px;height:180px;cursor:zoom-in" id="tl-qr">' : '<div class="muted">QR non disponibile</div>') +
          '<div style="font-size:11px;color:#64748b;margin-top:6px;word-break:break-all;max-width:200px">' + esc(url) + '</div>' +
          '<div style="display:flex;gap:6px;margin-top:10px;justify-content:center">' +
            '<button type="button" id="tl-project" class="tl-toolbtn" style="background:#ede9fe;color:#4f46e5;border:0;border-radius:8px;padding:8px 12px;cursor:pointer;font-weight:700">📽 ' + esc(_t('tl_project', 'Proietta sulla LIM')) + '</button>' +
          '</div>' +
        '</div>' +
        '<div style="flex:1;min-width:280px">' +
          '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">' +
            '<b>' + esc(_t('tl_proposals', 'Proposte')) + '</b><span id="tl-pcount" class="muted"></span></div>' +
          '<div id="tl-proplist" style="max-height:340px;overflow:auto"></div>' +
        '</div>' +
      '</div>' +
      '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px;border-top:1px solid #f1f5f9;padding-top:14px">' +
        '<button type="button" id="tl-openfolder" style="background:#fff;border:1px solid #e2e8f0;color:#334155;border-radius:10px;padding:10px 16px;cursor:pointer;font-weight:700">' + esc(_t('tl_openfolder', 'Apri cartella')) + '</button>' +
        '<button type="button" id="tl-close" style="background:#4f46e5;color:#fff;border:0;border-radius:10px;padding:10px 20px;cursor:pointer;font-weight:800">' + esc(_t('tl_close_report', 'Chiudi e apri report')) + '</button></div>';

    var ov = modal(_t('tl_build_title', 'Costruisci la timeline'), esc(info.name || ''), body);
    if (ov.querySelector('#tl-qr')) ov.querySelector('#tl-qr').onclick = function () { _fullscreenQr(url); };
    ov.querySelector('#tl-project').onclick = function () { TL.openProjection(); };
    ov.querySelector('#tl-openfolder').onclick = function () { if (window.electronAPI && window.electronAPI.liveOpenFolder) window.electronAPI.liveOpenFolder(); };
    ov.querySelector('#tl-close').onclick = function () { _closeBuild(info); };

    _pollProposals(info, ov);
  }

  function _pollProposals(info, ov) {
    if (TL._poll) clearInterval(TL._poll);
    var tick = function () {
      if (!document.getElementById('tl-live-modal')) { clearInterval(TL._poll); TL._poll = null; return; }
      adminApi(info, '/api/status?admin=' + info.adminToken).then(function (r) {
        if (!r.body || !Array.isArray(r.body.proposals)) return;
        _renderProposals(info, r.body.proposals);
      }).catch(function () {});
    };
    tick();
    TL._poll = setInterval(tick, 3000);
  }

  function _renderProposals(info, proposals) {
    var list = document.getElementById('tl-proplist'); if (!list) return;
    document.getElementById('tl-pcount').textContent = proposals.length + ' · ' +
      proposals.filter(function (p) { return p.status === 'approved'; }).length + ' ✓';
    if (!proposals.length) { list.innerHTML = '<div class="muted" style="color:#94a3b8;font-size:12px">' + esc(_t('tl_no_prop', 'Nessuna proposta ancora.')) + '</div>'; return; }
    list.innerHTML = proposals.slice().sort(function (a, b) { return a.anno - b.anno; }).map(function (p) {
      var flags = '';
      if (p.flags && p.flags.duplicate) flags += ' <span style="font-size:9px;background:#f1f5f9;color:#64748b;border-radius:5px;padding:1px 5px">duplicato</span>';
      if (p.flags && p.flags.yearNotInSources) flags += ' <span style="font-size:9px;background:#fef3c7;color:#b45309;border-radius:5px;padding:1px 5px">anno non nelle fonti</span>';
      var actions = p.status === 'pending'
        ? '<button data-approve="' + p.id + '" style="background:#dcfce7;color:#15803d;border:0;border-radius:7px;padding:5px 9px;cursor:pointer;font-weight:700;font-size:12px">✓</button>' +
          '<button data-reject="' + p.id + '" style="background:#fee2e2;color:#b91c1c;border:0;border-radius:7px;padding:5px 9px;cursor:pointer;font-weight:700;font-size:12px;margin-left:4px">✗</button>'
        : '<span style="font-size:11px;font-weight:700;color:' + (p.status === 'approved' ? '#15803d' : '#b91c1c') + '">' + (p.status === 'approved' ? '✓ approvata' : '✗ bocciata') + '</span>';
      return '<div style="display:flex;gap:8px;align-items:center;padding:7px 0;border-bottom:1px solid #f1f5f9">' +
        '<div style="font-weight:900;color:#4f46e5;min-width:44px">' + esc(p.anno) + '</div>' +
        '<div style="flex:1;font-size:13px">' + esc(p.evento) + flags + '</div>' + actions + '</div>';
    }).join('');
    list.querySelectorAll('[data-approve]').forEach(function (b) { b.onclick = function () { _review(info, b.getAttribute('data-approve'), 'approve', proposals); }; });
    list.querySelectorAll('[data-reject]').forEach(function (b) { b.onclick = function () { _review(info, b.getAttribute('data-reject'), 'reject', proposals); }; });
  }

  function _review(info, proposalId, action, proposals) {
    adminApi(info, '/api/review', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ adminToken: info.adminToken, proposalId: proposalId, action: action }) })
      .then(function (r) {
        if (r.status !== 200) { toast(_t('tl_review_err', 'Revisione non riuscita.'), 'error'); return; }
        // approvata → entra nel progetto (attribuita all'autore) una sola volta
        if (action === 'approve' && !TL._reviewed[proposalId]) {
          TL._reviewed[proposalId] = true;
          var pr = (proposals || []).find(function (x) { return x.id === proposalId; }) || r.body.proposal;
          if (pr && window.MappAITimeline) window.MappAITimeline.add({ anno: pr.anno, evento: pr.evento, contesto: pr.contesto || '', origin: 'student', author: pr.author });
        }
        adminApi(info, '/api/status?admin=' + info.adminToken).then(function (s) { if (s.body && s.body.proposals) _renderProposals(info, s.body.proposals); });
      });
  }

  function _closeBuild(info) {
    if (TL._poll) { clearInterval(TL._poll); TL._poll = null; }
    adminApi(info, '/api/close', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ adminToken: info.adminToken }) })
      .then(function () {
        var rep = 'http://127.0.0.1:' + info.port + '/api/report?which=workshop&admin=' + info.adminToken;
        window.open(rep, '_blank');
        closeModal();
        if (window.electronAPI && window.electronAPI.liveStopSession) window.electronAPI.liveStopSession();
        toast(_t('tl_closed', 'Sessione chiusa — report aperto.'), 'success');
      });
  }

  function _fullscreenQr(url) {
    var big = qrUrl(url, 14); if (!big) return;
    var ov = document.createElement('div');
    ov.style.cssText = 'position:fixed;inset:0;z-index:10002;background:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;cursor:zoom-out';
    ov.innerHTML = '<img src="' + big + '" style="width:min(70vh,70vw);image-rendering:pixelated"><div style="font-size:20px;font-weight:800">' + esc(url) + '</div>';
    ov.onclick = function () { ov.remove(); };
    document.body.appendChild(ov);
  }

  // ── Proiezione LIM (US4): timeline che cresce con le proposte approvate ─────
  function _poolToBase() {
    var db = (S() && S().db) || {}; var c = core();
    return (db.timelineAI || []).map(function (e) {
      return {
        year: e.anno, yearEnd: e.annoFine || null, raw: e.dataLabel || String(e.anno),
        type: e.annoFine ? 'range' : 'year', sortKey: e.anno * 10000, nodeLabel: e.evento,
        macroLabel: e.macroArea || '', macroColor: c.categoryColor(e.macroArea),
        chunkText: e.contesto || '', chunkSource: 'Fonte', chunkTitle: 'Evento'
      };
    });
  }
  TL.openProjection = function () {
    var info = TL._info;
    if (!info) { toast(_t('tl_no_session', 'Nessuna sessione attiva.'), 'warning'); return; }
    // seed della base dal pool AI → la proiezione parte dalla timeline esistente
    window.MappAITimeline._lastBase = _poolToBase();
    var url = buildStudentUrl(info);
    var qr = qrUrl(url, 8);
    var ov = document.createElement('div');
    ov.id = 'tl-projection';
    ov.style.cssText = 'position:fixed;inset:0;z-index:10005;background:#f8fafc;overflow:auto;padding:24px 32px';
    ov.innerHTML =
      '<div style="position:fixed;top:16px;right:16px;text-align:center;background:#fff;border:1px solid #e2e8f0;border-radius:14px;padding:10px;box-shadow:0 6px 20px rgba(0,0,0,.1);z-index:2">' +
        (qr ? '<img src="' + qr + '" style="width:150px;height:150px">' : '') +
        '<div style="font-size:11px;color:#4f46e5;font-weight:700;margin-top:4px">' + esc(_t('tl_scan', 'Inquadra per proporre')) + '</div></div>' +
      '<div style="text-align:center;margin-bottom:8px"><div style="font-size:24px;font-weight:900;color:#0f172a">' + esc(info.name || '') + '</div>' +
        '<div style="font-size:12px;color:#64748b" id="tl-proj-count"></div></div>' +
      '<div id="tl-proj-body" style="max-width:960px;margin:0 auto"></div>' +
      '<div style="position:fixed;bottom:14px;left:50%;transform:translateX(-50%);font-size:11px;color:#94a3b8">ESC ' + esc(_t('tl_exit', 'per uscire')) + '</div>';
    document.body.appendChild(ov);

    function rerender() {
      var html = window.MappAITimeline.mergedEventsHtml({ showContext: false, exercise: false });
      var b = document.getElementById('tl-proj-body'); if (b) b.innerHTML = html;
      var cnt = document.getElementById('tl-proj-count');
      if (cnt) cnt.textContent = window.MappAITimeline._lastMergedCount + ' ' + _t('tl_events', 'eventi');
    }
    // stili minimi delle card timeline (il popup normale li ha inline nel doc)
    if (!document.getElementById('tl-proj-style')) {
      var st = document.createElement('style'); st.id = 'tl-proj-style';
      st.textContent = '#tl-proj-body .tl-event{display:flex;margin-bottom:22px;position:relative}' +
        '#tl-proj-body .tl-left{justify-content:flex-end;padding-right:calc(50% + 30px)}' +
        '#tl-proj-body .tl-right{flex-direction:row-reverse;justify-content:flex-end;padding-left:calc(50% + 30px)}' +
        '#tl-proj-body .tl-connector{position:absolute;left:50%;top:14px;transform:translateX(-50%)}' +
        '#tl-proj-body .tl-dot{width:16px;height:16px;border-radius:50%;border:3px solid #fff;box-shadow:0 0 0 2px #cbd5e1}' +
        '#tl-proj-body .dossier-card{background:#fff;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;max-width:380px;width:100%}' +
        '#tl-proj-body .dossier-card-header{padding:10px 14px;display:flex;justify-content:space-between;gap:8px}' +
        '#tl-proj-body .tl-date-label{font-size:18px;font-weight:900;color:#fff}' +
        '#tl-proj-body .dossier-title{font-size:14px;font-weight:700;color:#fff;margin:2px 0 0}' +
        '#tl-proj-body .dossier-level-tag{font-size:9px;color:rgba(255,255,255,.8);text-transform:uppercase}' +
        '#tl-proj-body .tl-event-num,#tl-proj-body .no-print{display:none}' +
        '#tl-proj-body::before{content:"";position:absolute;left:50%;top:120px;bottom:40px;width:2px;background:#e2e8f0}';
      document.head.appendChild(st);
    }
    rerender();

    var seen = TL._reviewed || (TL._reviewed = {});
    var poll = setInterval(function () {
      if (!document.getElementById('tl-projection')) { clearInterval(poll); return; }
      adminApi(info, '/api/status?admin=' + info.adminToken).then(function (r) {
        if (!r.body || !Array.isArray(r.body.proposals)) return;
        var changed = false;
        r.body.proposals.forEach(function (p) {
          if (p.status === 'approved' && !seen[p.id]) {
            seen[p.id] = true;
            if (window.MappAITimeline) window.MappAITimeline.add({ anno: p.anno, evento: p.evento, contesto: p.contesto || '', origin: 'student', author: p.author });
            changed = true;
          }
        });
        if (changed) rerender();
      }).catch(function () {});
    }, 3000);

    function onEsc(e) { if (e.key === 'Escape') { ov.remove(); clearInterval(poll); document.removeEventListener('keydown', onEsc); } }
    document.addEventListener('keydown', onEsc);
  };

  console.log('[MappAITimelineLive] modulo Timeline Live caricato ✓');
})();
