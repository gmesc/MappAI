/*
 * mappai-live-teacher.js — MappAI Live, lato docente (hub QR)
 * -----------------------------------------------------------
 * - window.openLiveHub(): hub con le card delle attività — Studio attivo live (quiz/
 *   domande via QR) · Lavagna collaborativa (→ openCollabHub esistente) ·
 *   Materiali di studio (download via QR, no login).
 * - openLiveSetup(): wizard — classe → modalità (V/F | scelta multipla |
 *   domande personalizzate) → scope (mappa/ramo L1) → quantità/timer
 *   → genera domande (nodeId + l1 su ognuna) → avvia sessione.
 * - Dashboard: QR + URL + proiettore, griglia roster (polling 3s diretto
 *   a 127.0.0.1:<port>/api/status con adminToken), avvia domande, countdown,
 *   chiudi → report domande/studenti.
 * - openMaterialsPanel(): server materiali, QR, lista file, aggiungi file.
 *
 * IPC (preload): liveStartSession/liveStopSession/liveSessionInfo/liveOpenFolder,
 * liveMaterials*. Riusa MappAILiveCore (domande/l1), MappAIGames.genQuizForNode
 * (MC ancorati al contenuto).
 * Caricare DOPO mappai-live-core.js, mappai-live-classes.js, mappai-games.js.
 */
(function () {
  'use strict';

  var LC = window.MappAILiveCore;
  var t = function (k, f) { return window.t ? window.t(k, f) : f; };
  function toast(m, k) { if (window.showToast) window.showToast(m, k || 'info'); else console.log(m); }
  function esc(s) { var d = document.createElement('div'); d.textContent = s == null ? '' : String(s); return d.innerHTML; }
  function S() { try { return (typeof appState !== 'undefined') ? appState : window.appState; } catch (e) { return window.appState; } }

  var LT = window.MappAILiveTeacher = { info: null, matInfo: null, _pollTimer: null, _timerTimer: null, _lastStatus: null };

  // ── Modale base (stesso linguaggio visivo degli hub) ──────────────────────
  function modal(icon, title, bodyHtml, maxWidth) {
    closeModal();
    var ov = document.createElement('div');
    ov.id = 'live-hub-modal';
    /* ⚠️ Il piano si CHIEDE al motore (`prossimoZ`): un 9991 fisso finisce
       DIETRO la console di INSEGNA, che parte da 12000 — il QR si apriva
       davvero, invisibile sotto. */
    var _z = 9991;
    try { if (window.MappAIModal && window.MappAIModal.prossimoZ) _z = window.MappAIModal.prossimoZ(); } catch (e) { }
    ov.style.cssText = 'position:fixed;inset:0;z-index:' + _z + ';background:rgba(15,23,42,.5);display:flex;align-items:center;justify-content:center;padding:18px';
    ov.innerHTML = '<div style="background:#f8fafc;border-radius:16px;box-shadow:0 25px 60px -12px rgba(0,0,0,.35);width:min(' + (maxWidth || '780px') + ',96vw);max-height:90vh;overflow-y:auto;padding:20px 24px" role="dialog" aria-modal="true">' +
      '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">' +
      '<div style="display:flex;align-items:center;gap:10px;font-weight:800;font-size:17px;color:#0f172a">' +
      '<i data-lucide="' + icon + '" style="width:22px;height:22px;color:#4f46e5"></i>' + esc(title) + '</div>' +
      '<button type="button" class="lh-close" style="background:none;border:none;cursor:pointer;color:#94a3b8;font-size:22px;line-height:1;padding:4px" aria-label="Chiudi">×</button>' +
      '</div>' + bodyHtml + '</div>';
    ov.addEventListener('click', function (e) { if (e.target === ov) closeModal(); });
    ov.querySelector('.lh-close').onclick = closeModal;
    document.body.appendChild(ov);
    if (window.safeCreateIcons) window.safeCreateIcons();
    return ov;
  }
  /* ⚠️ Chiudere il modale della DASHBOARD non chiude la sessione — il server
     resta in ascolto e gli allievi rispondono ancora. Due conseguenze che
     vivono entrambe qui, perché questo è l'unico imbuto da cui i modali di
     questo file spariscono:
       · il polling va fermato (girava a vuoto ogni 3s su nodi già rimossi);
       · va DETTO che la sessione continua, e da dove si torna a gestirla —
         una finestra che sparisce senza dire niente si legge come «finito». */
  function closeModal() {
    var m = document.getElementById('live-hub-modal'); if (m) m.remove();
    stopPolling();
    if (LT._dashOpen) {
      LT._dashOpen = false;
      if (LT.info) toast(t('lv_dash_closed', 'La sessione resta ATTIVA. Per riprenderla: «Studio attivo live» nella sidebar.'), 'info');
    }
  }

  function card(icon, title, desc, tip) {
    return '<button type="button" class="lh-card" ' + (tip ? 'data-tip="' + esc(tip) + '" ' : '') +
      'style="display:flex;align-items:center;gap:14px;text-align:left;background:#fff;border:1px solid #e2e8f0;border-radius:14px;padding:16px 18px;cursor:pointer;width:100%">' +
      '<div style="width:44px;height:44px;border-radius:12px;background:#eef2ff;display:flex;align-items:center;justify-content:center;flex-shrink:0">' +
      '<i data-lucide="' + icon + '" style="width:22px;height:22px;color:#4f46e5"></i></div>' +
      '<div style="flex:1"><div style="font-weight:800;color:#0f172a;font-size:15px">' + esc(title) + '</div>' +
      '<div style="font-size:12px;color:#94a3b8;margin-top:2px">' + esc(desc) + '</div></div>' +
      '<i data-lucide="chevron-right" style="width:18px;height:18px;color:#cbd5e1"></i></button>';
  }

  // ── Entry point ───────────────────────────────────────────────────────────
  window.openLiveHub = async function () {
    var st = S();
    if (!st || !st.db || !st.db.nodes || !st.db.nodes.length) {
      toast(t('lv_need_map', 'Apri una mappa per usare MappAI Live.'), 'warning'); return;
    }
    // sessione quiz già attiva? → vai alla dashboard
    if (window.electronAPI && window.electronAPI.liveSessionInfo) {
      var info = await window.electronAPI.liveSessionInfo();
      if (info && info.success) { LT.info = info; openDashboard(); return; }
    }
    openHubMenu();
  };

  // «Domande a scelta» (19/8): la card compare solo se il modulo c'è ed è
  // acceso — un kill-switch che lascia la card aprirebbe il vuoto.
  function _sceltaOn() {
    return !!(window.MappAISceltaAttivita && window.MappAISceltaAttivita.attiva());
  }

  function openHubMenu() {
    var body = '<p style="font-size:13px;color:#475569;line-height:1.55;margin:0 0 14px">' +
      t('lv_hub_intro', 'Attività di classe via QR: gli allievi entrano dal telefono sulla rete d\'aula.') + '</p>' +
      '<div style="display:flex;flex-direction:column;gap:10px">' +
      card('radio', t('lv_card_quiz', 'Studio attivo live'), t('lv_card_quiz_d', 'Quiz V/F, scelta multipla o domande tue — con report finali'), t('lv_card_quiz_tip', 'Ogni allievo risponde dal telefono; a fine sessione due report: heatmap domande e schede individuali.')) +
      card('presentation', t('lv_card_board', 'Lavagna collaborativa'), t('lv_card_board_d', 'I gruppi propongono nodi dal telefono, live sulla mappa'), '') +
      card('folder-down', t('lv_card_mat', 'Materiali di studio'), t('lv_card_mat_d', 'Pubblica file scaricabili via QR (senza login)'), t('lv_card_mat_tip', 'Gli allievi scaricano dispense, sintesi e PDF inquadrando il QR.')) +
      card('message-circle', t('lv_card_tutor', 'Chatta e Scrivi (Tutor AI)'), t('lv_card_tutor_d', 'Ogni allievo chatta col tutor sull\'argomento e consegna un testo suo'), t('lv_card_tutor_tip', 'Il tutor guida senza mai scrivere il testo; al docente arrivano testo + trascrizione. Cap di scambi per contenere i costi.')) +
      card('calendar-clock', t('lv_card_timeline', 'Timeline'), t('lv_card_timeline_d', 'Completa o costruisci insieme la timeline della mappa'), t('lv_card_timeline_tip', 'Due modalità: Completa (domande autovalutate sulle date) o Costruisci (gli allievi propongono le date mancanti, tu approvi). Zero costi AI.')) +
      (_sceltaOn() ? card('list-checks', t('lv_card_scelta', 'Domande a scelta'), t('lv_card_scelta_d', 'Gli allievi leggono i richiami della mappa e scelgono a quali rispondere'), t('lv_card_scelta_tip', 'Nessuna generazione: usa i fogli «Domande aperte» e i set a scelta multipla già nel vault. Il taglio di ogni domanda resta nascosto: alla consegna si scopre quali tipi di richiamo funzionano per ciascuno.')) : '') +
      '</div>';
    var ov = modal('radio', t('lv_hub_title', 'MappAI Live'), body, '560px');
    var cards = ov.querySelectorAll('.lh-card');
    cards[0].onclick = function () { openLiveSetup(); };
    cards[1].onclick = function () { closeModal(); if (window.openCollabHub) window.openCollabHub(); else toast('Lavagna non disponibile', 'error'); };
    cards[2].onclick = function () { openMaterialsPanel(); };
    cards[3].onclick = function () { closeModal(); if (window.MappAITutor) window.MappAITutor.open(); else toast('Chatta e Scrivi non disponibile', 'error'); };
    cards[4].onclick = function () { closeModal(); if (window.MappAITimelineLive) window.MappAITimelineLive.openSetup(); else toast(t('hub_fn_missing', 'Funzione non disponibile'), 'error'); };
    if (cards[5]) cards[5].onclick = function () { closeModal(); if (window.MappAISceltaAttivita) window.MappAISceltaAttivita.apriLive(); else toast(t('hub_fn_missing', 'Funzione non disponibile'), 'error'); };
    if (window.safeCreateIcons) window.safeCreateIcons();
  }

  // ── Setup quiz ────────────────────────────────────────────────────────────
  function rootLabel() {
    var st = S();
    var root = (st.db.nodes || []).find(function (n) { return n.level === 0; });
    return (root && window.cleanLabel ? window.cleanLabel(root.label) : (root && root.label)) || st.rootNodeLabel || 'Mappa';
  }

  /* ══ AVVIA UNA LIVE — SOLO DA SET GIÀ PRONTI (13/8/26) ═══════════════════
     Qui c'era il wizard che GENERAVA le domande al momento: si sceglieva tipo,
     ambito, quantità e angolazione, e l'AI lavorava con la classe che guardava.
     Tolto su decisione di Giacomo: i set esistono già — li produce la pipeline
     alla creazione della mappa, o il docente in ELABORA → «Crea un documento».
     Il senso di averli è proprio non dover generare davanti alla classe.

     ⚠️ I quiz live nascono SOLO dai file editabili (`appState.db.studySets`),
     mai dai PDF esportati: da un PDF non si ricavano più gli item, e un foglio
     stampato non è una sorgente. Chi vuole una live da una verifica vecchia
     riapre la mappa che la contiene.

     Restano fuori di proposito: la generazione AI (era il punto), il Cloze
     (già nascosto dal 20/7) e le «domande mie» scritte lì per lì — il posto per
     scriverle è ELABORA → «Crea un documento» → «Le scrivo io», e da lì il set
     compare in questo elenco. Un posto per comporre, uno per lanciare. */
  /* ⚠️ Con il wizard sono uscite anche le funzioni che generavano: `scopedNodes`,
     `generateCloze`, `generateQuizAI`, `generateQuizViaStudy`, `generateAndLaunch`
     e l'editor delle domande scritte a mano (208 righe). Restano `dynItemToLive`
     e `attachL1`, che servono a TRADURRE un set esistente in domande live — cioè
     l'unica strada rimasta. */
  function _setLive() {
    var sets = (S() && S().db && S().db.studySets) || [];
    return sets.filter(function (x) {
      /* i set giocabili in una live sono i QUIZ: le flashcard non hanno una
         risposta da valutare, le domande aperte non entrano in studySets */
      return x && Array.isArray(x.items) && x.items.length && (x.mode || 'quiz') === 'quiz';
    });
  }
  /* ⚠️ LA GUARDIA STA QUI, non nei chiamanti (21/8/26). `openLiveHub` la
     faceva già, ma la sidebar LIM e la console di INSEGNA chiamano
     `MappAILive.openSetup()` DIRITTO: con una sessione in corso offrivano di
     sceglierne un'altra, e alla gestione non si tornava più. Un posto solo,
     tre ingressi coperti. */
  async function openLiveSetup() {
    if (window.electronAPI && window.electronAPI.liveSessionInfo) {
      var att = await window.electronAPI.liveSessionInfo();
      if (att && att.success) { LT.info = att; openDashboard(); return; }
    }
    var MM = window.MappAIModal;
    var sets = _setLive();
    if (!MM) {                       /* ripiego: senza motore si va sull'ultimo set */
      if (!sets.length) { toast(t('lv_nessun_set', 'Nessun quiz pronto per questa mappa.'), 'warning'); return; }
      openLiveFromSet(sets[sets.length - 1]);
      return;
    }
    if (!sets.length) {
      MM.avviso({
        titolo: t('lv_nessun_set_t', 'Nessun quiz pronto'), icona: 'radio',
        testo: t('lv_nessun_set_d', 'Le attività live partono da un quiz già pronto. Ne trovi fra i materiali generati con la mappa, oppure ne crei uno in ELABORA → «Crea un documento» → «Quiz o flashcard»: scritto da te o generato dall\'AI, con calma, prima della lezione.')
      });
      return;
    }
    MM.open({
      titolo: t('lv_scegli_set_t', 'Avvia un\'attività live'), icona: 'radio', taglia: 'm', invio: false,
      sezioni: [{
        testo: t('lv_scegli_set_d', 'Le domande ci sono già: nessuna generazione davanti alla classe.'),
        voci: sets.slice().reverse().map(function (x) {
          var tipo = x.type || t('lv_m_mc', 'Scelta multipla');
          return {
            id: 'set:' + x.id, icona: 'list-checks',
            etichetta: x.title || tipo,
            sotto: tipo + ' · ' + x.items.length + ' ' + t('lv_questions', 'domande'),
            badge: x._pipeline ? t('lv_da_pipeline', 'con la mappa') : ''
          };
        })
      }]
    }).then(function (r) {
      if (!r || !r.azione || r.azione.indexOf('set:') !== 0) return;
      var id = r.azione.slice(4);
      var set = sets.filter(function (x) { return x.id === id; })[0];
      if (set) openLiveFromSet(set);
    });
  }


  function openLiveFromSet(set) {
    if (!set || !Array.isArray(set.items) || !set.items.length) { toast(t('lv_set_empty', 'Questo set non ha domande.'), 'error'); return; }
    var mode = /ver|v\/f|\btf\b|true|fals/i.test(String(set.type || set.quizType || '')) ? 'tf' : 'mc';
    var modeLabel = mode === 'tf' ? t('lv_m_tf', 'Vero / Falso') : t('lv_m_mc', 'Scelta multipla');
    var classes = (window.MappAIClasses && window.MappAIClasses.list()) || [];
    var activeId = (window.MappAIClasses && window.MappAIClasses.activeId && window.MappAIClasses.activeId()) || '';
    var classOpts = classes.map(function (c) { return '<option value="' + c.id + '"' + (c.id === activeId ? ' selected' : '') + '>' + esc(c.name) + (c.year ? ' (' + esc(c.year) + ')' : '') + ' · ' + (c.students || []).length + '</option>'; }).join('');
    var classField = classes.length
      ? '<select id="lvs-class" class="lv-in">' + classOpts + '</select>'
      : '<div style="font-size:12px;color:#b45309;background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:10px 12px">' +
        t('lv_no_class', 'Nessuna classe. Creala in Profilo → Account classi.') +
        ' <button type="button" id="lvs-goclass" style="background:none;border:0;color:#4f46e5;font-weight:700;cursor:pointer;text-decoration:underline">' + t('lv_open_class', 'Apri Account classi') + '</button></div>';
    var body = '<style>.lv-in{width:100%;border:1px solid #e2e8f0;border-radius:10px;padding:9px 11px;font:inherit;color:#0f172a;background:#fff}' +
      '.lv-lab{display:block;font-size:11px;font-weight:700;color:#475569;margin:12px 0 4px}</style>' +
      '<div style="font-size:12px;color:#475569;background:#f1f5f9;border-radius:10px;padding:10px 12px">' +
        t('lv_from_set_hint', 'Avvia una sessione live con le domande GIÀ pronte di questo set — nessuna nuova generazione AI.') + '</div>' +
      '<span class="lv-lab">' + t('lv_class', 'Classe') + '</span>' + classField +
      '<div style="display:flex;gap:12px"><div style="flex:1"><span class="lv-lab">' + t('lv_qtype', 'Tipo') + '</span>' +
        '<div style="border:1px solid #e2e8f0;border-radius:10px;padding:9px 11px;font-weight:700;color:#4f46e5;background:#eef2ff">' + esc(modeLabel) + ' · ' + set.items.length + ' ' + t('lv_questions', 'domande') + '</div></div>' +
      '<div style="flex:1"><span class="lv-lab">' + t('lv_timer', 'Timer (min, 0 = nessuno)') + '</span><input id="lvs-timer" type="number" class="lv-in" value="0" min="0" inputmode="numeric"></div></div>' +
      '<label style="display:flex;align-items:flex-start;gap:8px;margin-top:14px;cursor:pointer;font-size:12px;color:#475569;line-height:1.4">' +
        '<input type="checkbox" id="lvs-reveal" checked style="width:16px;height:16px;margin-top:1px;accent-color:#4f46e5;flex-shrink:0">' +
        '<span>' + t('lv_reveal', 'A fine sessione mostra allo studente le soluzioni (giuste/sbagliate + spiegazione), salvabili sul suo dispositivo.') + '</span></label>' +
      '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:18px">' +
      '<button type="button" id="lvs-back" style="background:#fff;border:1px solid #e2e8f0;color:#334155;border-radius:10px;padding:10px 16px;cursor:pointer;font-weight:700">' + t('lv_back', 'Indietro') + '</button>' +
      '<button type="button" id="lvs-go" style="background:#4f46e5;color:#fff;border:0;border-radius:10px;padding:10px 20px;cursor:pointer;font-weight:800">' + t('lv_go', 'Avvia sessione') + '</button></div>';
    var ov = modal('radio', t('lv_from_set_title', 'Avvia quiz live'), body, '560px');
    var gc = ov.querySelector('#lvs-goclass');
    if (gc) gc.onclick = function () { closeModal(); if (window.openClassAccountsModal) window.openClassAccountsModal(); };
    ov.querySelector('#lvs-back').onclick = closeModal;
    ov.querySelector('#lvs-go').onclick = function () {
      var cls = classes.length ? classes.find(function (c) { return c.id === ov.querySelector('#lvs-class').value; }) : null;
      if (!cls) { toast(t('lv_pick_class', 'Scegli o crea una classe.'), 'error'); return; }
      var timer = Math.max(0, parseInt(ov.querySelector('#lvs-timer').value, 10) || 0);
      var rev = ov.querySelector('#lvs-reveal');
      var node0 = { id: '', label: set.title || rootLabel() };
      var qs = [];
      set.items.forEach(function (it) {
        var node = it.nodeId ? { id: it.nodeId, label: it.nodeLabel || set.title } : node0;
        var lq = dynItemToLive(it, node, mode);
        if (lq) qs.push(lq);
      });
      qs = attachL1(qs);
      if (!qs.length) { toast(t('lv_set_unmappable', 'Le domande di questo set non sono compatibili con la modalità live.'), 'error'); return; }
      LT._scope = '';                       // set = intera mappa
      LT._revealAnswers = !rev || rev.checked;
      launch(cls, mode === 'tf' ? 'Vero-Falso' : 'Quiz', qs, timer);
    };
  }

  // Nodi in scope con contenuto sufficiente

  function attachL1(questions) {
    var l1 = LC.buildL1Resolver(S().db.nodes || [], S().db.links || []);
    questions.forEach(function (q) {
      if (!q.nodeId) return;
      var r = l1(q.nodeId);
      if (r) { q.l1Id = r.id; q.l1Label = window.cleanLabel ? window.cleanLabel(r.label) : r.label; }
    });
    return questions;
  }

  // Cloze: riusa makeCloze scoped (zero AI). Allineato al Cloze di Studio attivo
  // (19/7/26): buchi-RELAZIONE («perché/quindi/invece di») + concetti. Il grading
  // avviene lato SERVER (live-core, senza window/causal-core) → precalcolo QUI la
  // lista `accept` degli equivalenti e la attacco al blank; resta lato server
  // (publicQuestions non la copia), come il termine-soluzione.

  // MC / V/F: genera con MappAIGames.genQuizForNode (ancorato al contenuto)

  // MC / V/F con la STESSA qualità del quiz in-app (DYNAMIC_QUIZ per-nodo):
  // domande vere con opzioni + V/F nativo, ancorate al contenuto del nodo.
  function clean(s) { return window.cleanLabel ? window.cleanLabel(s) : String(s || '').trim(); }
  function norm(s) { return LC.normalize ? LC.normalize(s) : String(s || '').toLowerCase().trim(); }

  function dynItemToLive(it, node, mode) {
    if (!it || !it.q) return null;
    var q = LC.sanitizeText(it.q, LC.LIMITS.textMax);
    if (!q) return null;
    if (mode === 'tf') {
      var c = norm(it.correct);
      var opts0 = Array.isArray(it.options) ? it.options.map(norm) : [];
      // "vero"/"true"/"corretto" → affermazione VERA; altrimenti falsa
      var isTrue = /(^|\b)(vero|true|v|si|s|corretto|giusto|esatto)(\b|$)/.test(c) ||
                   (opts0.length === 2 && c === opts0[0] && /ver|tru/.test(opts0[0]));
      return { kind: 'tf', text: q, proposed: q, statementTrue: !!isTrue, explanation: it.explanation ? String(it.explanation) : undefined, nodeId: node.id, nodeLabel: clean(node.label), source: 'map' };
    }
    var opts = (Array.isArray(it.options) ? it.options : []).map(function (o) { return LC.sanitizeText(o, LC.LIMITS.optionMax); }).filter(Boolean).slice(0, LC.LIMITS.optionsMax);
    if (opts.length < 2) return null;
    // indice del corretto: match sulla stringa, poi eventuale indice numerico
    var ci = -1;
    for (var i = 0; i < opts.length; i++) { if (norm(opts[i]) === norm(it.correct)) { ci = i; break; } }
    if (ci < 0) { var nn = parseInt(it.correct, 10); if (!isNaN(nn)) ci = (nn >= 1 && nn <= opts.length) ? nn - 1 : (nn >= 0 && nn < opts.length ? nn : -1); }
    if (ci < 0) return null;   // non mappabile → scarta (qualità > quantità)
    // Rimescola le opzioni: rompe la memorizzazione posizionale (anche su item ricorrenti)
    var sh = LC.shuffleOptions(opts, ci);
    return { kind: 'mc', text: q, options: sh.options, correct: sh.correct, explanation: it.explanation ? String(it.explanation) : undefined, nodeId: node.id, nodeLabel: clean(node.label), source: 'map' };
  }


  // 010: etichetta leggibile del ramo coperto ('' = tutta la mappa) → session.json.



  // ── Editor domande personalizzate ─────────────────────────────────────────




  // ── Avvio sessione ────────────────────────────────────────────────────────
  function launch(cls, activity, questions, timer, extra) {
    if (!window.electronAPI || !window.electronAPI.liveStartSession) {
      toast(t('lv_electron', 'MappAI Live richiede l\'app desktop.'), 'warning'); return Promise.resolve(null);
    }
    extra = extra || {};
    var payload = {
      name: rootLabel(), activity: activity, className: cls.name,
      scope: LT._scope || '',   // 010: ramo coperto per il registro attività
      durationMin: timer || 0,
      revealAnswers: LT._revealAnswers !== false,   // report profilo con soluzioni (default ON)
      roster: (cls.students || []).map(function (s) { return { emojiKey: s.emojiKey, emoji: s.emoji, num: s.num, name: s.name || '' }; }),
      questions: questions
    };
    // Timeline Live (008): mode/loginMode/hintMode/build pass-through (default = quiz storico).
    if (extra.mode) payload.mode = extra.mode;
    if (extra.loginMode) payload.loginMode = extra.loginMode;
    if (extra.hintMode) payload.hintMode = extra.hintMode;
    if (extra.build) payload.build = extra.build;
    if (extra.scelta) payload.scelta = extra.scelta;
    if (extra.feedbackImmediato) payload.feedbackImmediato = true;
    // quali report sa produrre QUESTA sessione: la dashboard è una sola, ma
    // «domande» e «allievi» non esistono fuori dal quiz
    LT._reports = extra.reports || null;
    // Variante WEB: la scelta WiFi/Internet del wizard viaggia nello start IPC
    if (window.MappAINetMode) payload.netMode = window.MappAINetMode.get();
    return window.electronAPI.liveStartSession(payload).then(function (r) {
      if (!r || !r.success) { toast((r && r.error) || t('lv_start_err', 'Errore avvio server'), 'error'); return null; }
      if (window.MappAINetMode) window.MappAINetMode.checkFallback(r);
      LT.info = r; closeModal();
      // Registro sessioni (005): la mappa risulta "avviata" su questa classe.
      try { if (window.MappAITeach) window.MappAITeach.logSession({ map: rootLabel(), activity: extra.logActivity || 'live' }); } catch (e) { }
      if (r.resumed) toast(t('lv_resumed', 'Sessione RIPRESA: il QR precedente è ancora valido'), 'success');
      // La modalità Costruisci ha una sua dashboard (revisione proposte); le altre
      // usano la dashboard standard con i due report.
      if (extra.onLaunched) extra.onLaunched(r); else openDashboard();
      return r;
    });
  }

  // ── QR ────────────────────────────────────────────────────────────────────
  function qrDataUrl(text, cell) {
    if (typeof qrcode !== 'function') return null;
    var qr = qrcode(0, 'M'); qr.addData(text); qr.make();
    return qr.createDataURL(cell || 7, 8);
  }
  function studentUrl() { return (LT.info.urls && LT.info.urls[0]) || ('http://localhost:' + LT.info.port); }
  function openQrFull(url) {
    var big = qrDataUrl(url, 14); if (!big) return;
    var ov = document.createElement('div');
    var _zf = 10001;
    try { if (window.MappAIModal && window.MappAIModal.prossimoZ) _zf = window.MappAIModal.prossimoZ(); } catch (e) { }
    ov.style.cssText = 'position:fixed;inset:0;z-index:' + _zf + ';background:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;cursor:zoom-out';
    ov.innerHTML = '<img src="' + big + '" alt="QR" style="width:min(70vh,70vw);image-rendering:pixelated"><div style="font-size:22px;font-weight:800;color:#0f172a">' + esc(url) + '</div>';
    ov.onclick = function () { ov.remove(); };
    document.body.appendChild(ov);
  }

  // ── Dashboard ─────────────────────────────────────────────────────────────
  function openDashboard() {
    var url = studentUrl();
    var qrSrc = qrDataUrl(url);
    var body = '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:18px;align-items:start">' +
      '<div style="text-align:center">' +
      (qrSrc ? '<img id="lv-qr" src="' + qrSrc + '" alt="QR" style="width:210px;height:210px;image-rendering:pixelated;border-radius:12px;border:1px solid #e2e8f0;cursor:zoom-in">'
             : '<div style="color:#b45309;font-size:12px">QR non disponibile</div>') +
      '<div style="font-size:12px;color:#475569;margin-top:6px;word-break:break-all">' + LT.info.urls.map(esc).join('<br>') + '</div>' +
      (window.MappAINetMode ? window.MappAINetMode.lanLineHtml(LT.info) : '') +
      '<div style="font-size:11px;color:#94a3b8;margin-top:4px">' + t('lv_qr_hint', 'Clic sul QR per proiettarlo (LIM)') + '</div></div>' +
      '<div><div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">' +
      '<span style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#94a3b8">' + t('lv_roster', 'Allievi') + '</span>' +
      '<span id="lv-phase" style="font-size:11px;font-weight:700;padding:2px 8px;border-radius:999px;background:#eef2ff;color:#4f46e5"></span>' +
      '<span style="flex:1"></span><span id="lv-count" style="font-size:11px;color:#94a3b8"></span></div>' +
      '<div id="lv-rosterlist" style="display:flex;flex-direction:column;gap:5px;max-height:320px;overflow-y:auto">' +
      '<div style="color:#94a3b8;font-size:12.5px">' + t('lv_waiting', 'In attesa degli allievi…') + '</div></div></div></div>' +
      '<div style="background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:8px 12px;font-size:11.5px;color:#92400e;margin-top:14px">' +
      t('lv_net_note', 'Rete: usa l\'hotspot del PC o un router d\'aula. Le reti scolastiche spesso bloccano il traffico tra dispositivi.') + '</div>' +
      '<div id="lv-actions" style="display:flex;gap:8px;margin-top:14px;flex-wrap:wrap;align-items:center"></div>';
    var ov = modal('radio', t('lv_dash_title', 'Sessione live'), body);
    var qrImg = ov.querySelector('#lv-qr');
    if (qrImg) qrImg.onclick = function () { openQrFull(url); };
    LT._dashOpen = true;
    renderActions('lobby');
    startPolling();
  }

  function renderActions(phase) {
    var box = document.getElementById('lv-actions'); if (!box) return;
    var html = '';
    if (phase === 'lobby') {
      html += actBtn('lv-run', t('lv_run', 'Avvia domande'), '#16a34a', '#fff');
    } else if (phase === 'running') {
      html += '<span id="lv-timerbadge" style="font-size:13px;font-weight:800;color:#4f46e5"></span><span style="flex:1"></span>';
      html += actBtn('lv-close', t('lv_close', 'Chiudi sessione'), '#7f1d1d', '#fecaca');
    } else if (phase === 'closed') {
      /* ⚠️ `LT._reports` lo scrive `launch`, ma a una sessione già in corso ci
         si riaggancia SENZA passare di lì (openLiveHub dopo un riavvio): la
         modalità arriva con l'info del server, e da quella si deduce. */
      var reps = (LT._reports && LT._reports.length) ? LT._reports
        : (LT.info && LT.info.mode === 'scelta') ? [{ which: 'scelta', label: t('ds_report', 'Report domande a scelta') }] : null;
      LT._reports = reps;
      if (reps) {
        reps.forEach(function (r, i) { html += actBtn('lv-rep-x' + i, r.label, '#4f46e5', '#fff'); });
      } else {
        html += actBtn('lv-rep-q', t('lv_rep_q', 'Report domande'), '#4f46e5', '#fff');
        html += actBtn('lv-rep-s', t('lv_rep_s', 'Report allievi'), '#4f46e5', '#fff');
      }
      html += actBtn('lv-folder', t('lv_folder', 'Apri cartella'), '#f1f5f9', '#334155');
      html += actBtn('lv-end', t('lv_end', 'Chiudi pannello'), '#f1f5f9', '#334155');
    }
    if (phase !== 'closed') { html += '<span style="flex:1"></span>' + actBtn('lv-stop', t('lv_stop', 'Ferma server'), '#f1f5f9', '#64748b'); }
    box.innerHTML = html;
    wire(phase);
  }
  function actBtn(id, label, bg, fg) {
    return '<button type="button" id="' + id + '" style="background:' + bg + ';color:' + fg + ';border:0;border-radius:10px;padding:9px 15px;cursor:pointer;font-weight:700;font-size:12.5px">' + esc(label) + '</button>';
  }
  function wire(phase) {
    var run = document.getElementById('lv-run');
    if (run) run.onclick = function () {
      fetch('http://127.0.0.1:' + LT.info.port + '/api/phase', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ adminToken: LT.info.adminToken, phase: 'running' }) })
        .then(function () { renderActions('running'); });
    };
    var close = document.getElementById('lv-close');
    if (close) close.onclick = function () {
      if (!confirm(t('lv_close_confirm', 'Chiudere la sessione e generare i report?'))) return;
      fetch('http://127.0.0.1:' + LT.info.port + '/api/close', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ adminToken: LT.info.adminToken }) })
        .then(function () { renderActions('closed'); toast(t('lv_closed', 'Sessione chiusa — report pronti'), 'success'); });
    };
    (LT._reports || []).forEach(function (r, i) {
      var b = document.getElementById('lv-rep-x' + i);
      if (b) b.onclick = function () { window.open('http://127.0.0.1:' + LT.info.port + '/api/report?admin=' + encodeURIComponent(LT.info.adminToken) + '&which=' + encodeURIComponent(r.which), '_blank'); };
    });
    var rq = document.getElementById('lv-rep-q');
    if (rq) rq.onclick = function () { window.open('http://127.0.0.1:' + LT.info.port + '/api/report?admin=' + encodeURIComponent(LT.info.adminToken) + '&which=questions', '_blank'); };
    var rs = document.getElementById('lv-rep-s');
    if (rs) rs.onclick = function () { window.open('http://127.0.0.1:' + LT.info.port + '/api/report?admin=' + encodeURIComponent(LT.info.adminToken) + '&which=students', '_blank'); };
    var folder = document.getElementById('lv-folder');
    if (folder) folder.onclick = function () { if (window.electronAPI.liveOpenFolder) window.electronAPI.liveOpenFolder(); };
    var stop = document.getElementById('lv-stop');
    if (stop) stop.onclick = doStop;
    var end = document.getElementById('lv-end');
    if (end) end.onclick = doStop;
  }
  function doStop() {
    if (!confirm(t('lv_stop_confirm', 'Fermare il server? Le risposte restano su disco.'))) return;
    stopPolling();
    if (window.electronAPI.liveStopSession) window.electronAPI.liveStopSession();
    LT.info = null; closeModal();
    toast(t('lv_stopped', 'Server fermato — i dati restano nella cartella della sessione'), 'success');
  }

  // ── Polling stato (3 s, diretto con adminToken) ──────────────────────────
  function startPolling() {
    stopPolling();
    var tick = function () {
      if (!LT.info) return;
      fetch('http://127.0.0.1:' + LT.info.port + '/api/status?admin=' + encodeURIComponent(LT.info.adminToken))
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (data) {
          if (data) { LT._lastStatus = data; renderRoster(data); syncPhase(data.session.phase); updateCountdown(data); }
        }).catch(function () {})
        .then(function () { LT._pollTimer = setTimeout(tick, 3000); });
    };
    tick();
  }
  function stopPolling() { if (LT._pollTimer) { clearTimeout(LT._pollTimer); LT._pollTimer = null; } }

  var _curPhase = null;
  function syncPhase(phase) {
    var badge = document.getElementById('lv-phase');
    if (badge) badge.textContent = phase === 'running' ? t('lv_ph_running', 'in corso') : phase === 'closed' ? t('lv_ph_closed', 'chiusa') : t('lv_ph_lobby', 'attesa');
    if (phase !== _curPhase) { _curPhase = phase; renderActions(phase); }
  }
  function updateCountdown(data) {
    var el = document.getElementById('lv-timerbadge');
    if (!el) return;
    if (data.msLeft == null) { el.textContent = ''; return; }
    var s = Math.floor(data.msLeft / 1000);
    el.textContent = '⏱ ' + Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  }
  function renderRoster(data) {
    var box = document.getElementById('lv-rosterlist'); if (!box) return;
    var roster = data.roster || [];
    var cnt = document.getElementById('lv-count');
    if (cnt) cnt.textContent = data.joined + '/' + roster.length + ' ' + t('lv_joined', 'entrati');
    if (!roster.length) return;
    box.innerHTML = roster.map(function (r) {
      var status = !r.present ? '<span style="color:#cbd5e1">—</span>'
        : r.finished ? '<span style="color:#166534;font-weight:700">✓ ' + t('lv_done', 'consegnato') + '</span>'
        : '<span style="color:#4f46e5;font-weight:700">' + r.answered + ' ' + t('lv_ans', 'risposte') + '</span>';
      var relBtn = (r.present && !r.finished) ? '<button type="button" class="lv-rel" data-e="' + r.emojiKey + '" data-n="' + r.num + '" title="' + t('lv_release', 'Sblocca (device staccato)') + '" style="background:#f1f5f9;color:#64748b;border:0;border-radius:6px;padding:3px 8px;cursor:pointer;font-size:10px;font-weight:700">' + t('lv_unlock', 'Sblocca') + '</button>' : '';
      return '<div style="display:flex;align-items:center;gap:8px;background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:6px 10px">' +
        '<span style="font-size:18px">' + esc(r.emoji) + '</span><span style="font-weight:700;color:#4f46e5;width:26px">' + esc(r.num) + '</span>' +
        '<span style="flex:1;font-size:12px;color:#334155">' + esc(r.name || '') + '</span>' + status + relBtn + '</div>';
    }).join('');
    box.querySelectorAll('.lv-rel').forEach(function (b) {
      b.onclick = function () {
        fetch('http://127.0.0.1:' + LT.info.port + '/api/release', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ adminToken: LT.info.adminToken, emojiKey: b.dataset.e, num: b.dataset.n }) });
      };
    });
  }

  // ── Materiali ─────────────────────────────────────────────────────────────
  // Avvio (o riuso) del server materiali — punto unico: porta la scelta
  // WiFi/Internet del toggle e mostra il toast se il relay è in fallback.
  function ensureMatServer() {
    if (LT.matInfo) return Promise.resolve(LT.matInfo);
    var opts = { name: rootLabel() };
    if (window.MappAINetMode) opts.netMode = window.MappAINetMode.get();
    return window.electronAPI.liveMaterialsStart(opts).then(function (r) {
      if (r && r.success) {
        LT.matInfo = r;
        if (window.MappAINetMode) window.MappAINetMode.checkFallback(r);
      }
      return r;
    });
  }

  async function openMaterialsPanel() {
    if (!window.electronAPI || !window.electronAPI.liveMaterialsStart) { toast(t('lv_electron', 'MappAI Live richiede l\'app desktop.'), 'warning'); return; }
    var info = await window.electronAPI.liveMaterialsInfo();
    if (info && info.success) LT.matInfo = info;
    else {
      info = await ensureMatServer();
      if (!info || !info.success) { toast((info && info.error) || 'Errore avvio server', 'error'); return; }
    }
    renderMaterials();
  }

  function renderMaterials() {
    var url = (LT.matInfo.urls && LT.matInfo.urls[0]) || ('http://localhost:' + LT.matInfo.port);
    var qrSrc = qrDataUrl(url);
    var files = LT.matInfo.files || [];
    var list = files.length
      ? files.map(function (f) { return '<div style="display:flex;align-items:center;gap:8px;background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:7px 10px;font-size:12.5px"><span style="flex:1;word-break:break-all">' + esc(f.file) + '</span><span style="color:#94a3b8">' + Math.max(1, Math.round(f.size / 1024)) + ' KB</span></div>'; }).join('')
      : '<div style="color:#94a3b8;font-size:12.5px">' + t('lv_no_files', 'Nessun file. Aggiungine con il bottone qui sotto.') + '</div>';
    var body = '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:18px;align-items:start">' +
      '<div style="text-align:center">' + (qrSrc ? '<img id="lv-mqr" src="' + qrSrc + '" style="width:200px;height:200px;image-rendering:pixelated;border-radius:12px;border:1px solid #e2e8f0;cursor:zoom-in">' : '') +
      '<div style="font-size:12px;color:#475569;margin-top:6px;word-break:break-all">' + LT.matInfo.urls.map(esc).join('<br>') + '</div>' +
      (window.MappAINetMode ? window.MappAINetMode.lanLineHtml(LT.matInfo) : '') +
      '<div style="font-size:11px;color:#94a3b8;margin-top:4px">' + t('lv_mat_hint', 'Gli allievi scaricano senza login') + '</div></div>' +
      '<div><div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#94a3b8;margin-bottom:8px">' + t('lv_files', 'File pubblicati') + '</div>' +
      '<div id="lv-filelist" style="display:flex;flex-direction:column;gap:5px">' + list + '</div></div></div>' +
      '<div style="display:flex;gap:8px;margin-top:16px;flex-wrap:wrap">' +
      actBtn('lv-madd', t('lv_add_file', 'Aggiungi file…'), '#4f46e5', '#fff') +
      actBtn('lv-mstop', t('lv_mstop', 'Ferma server materiali'), '#f1f5f9', '#64748b') +
      '<span style="flex:1"></span>' + actBtn('lv-mback', t('lv_back', 'Indietro'), '#f1f5f9', '#334155') + '</div>';
    var ov = modal('folder-down', t('lv_mat_title', 'Materiali di studio'), body, '620px');
    var qrImg = ov.querySelector('#lv-mqr'); if (qrImg) qrImg.onclick = function () { openQrFull(url); };
    ov.querySelector('#lv-madd').onclick = function () {
      window.electronAPI.liveMaterialsAdd().then(function (r) {
        if (r && r.success) { LT.matInfo.files = r.files; renderMaterials(); toast(t('lv_added', 'File aggiunti') + ': ' + (r.added || 0), 'success'); }
        else if (r && !r.canceled) toast((r && r.error) || 'Errore', 'error');
      });
    };
    ov.querySelector('#lv-mstop').onclick = function () {
      if (window.electronAPI.liveMaterialsStop) window.electronAPI.liveMaterialsStop();
      LT.matInfo = null; closeModal(); toast(t('lv_mstopped', 'Server materiali fermato'), 'success');
    };
    ov.querySelector('#lv-mback').onclick = openHubMenu;
  }

  // Helper pubblico: pubblica un HTML generato (dossier, sintesi…) come materiale
  window.MappAILive = window.MappAILive || {};
  // Esposizione per la landing "Insegna" (005): avvio diretto del wizard Studio
  // attivo live e del pannello Materiali dai quick-start QR.
  window.MappAILive.openSetup = function () { return openLiveSetup(); };
  window.MappAILive.openMaterials = function () { return openMaterialsPanel(); };
  // QR dal tab Studio: avvia la Live riusando gli item di un set già generato
  // (bypassa angolo/scope/quantità; tipo V/F o MC preselezionato dal set).
  window.MappAILive.launchFromSetPrompt = function (setId) {
    var sets = (S() && S().db && S().db.studySets) || [];
    var set = setId ? sets.find(function (s) { return s.id === setId; }) : sets[sets.length - 1];
    if (!set) { toast(t('lv_set_missing', 'Set non trovato.'), 'error'); return; }
    openLiveFromSet(set);
  };
  // Timeline Live (008): avvia una sessione con domande già pronte (dal pool
  // timeline) + opzioni extra (mode/loginMode/hintMode/build). Riusa launch →
  // dashboard standard per Completa; onLaunched custom per Costruisci.
  window.MappAILive.launchExternal = function (cls, activity, questions, timer, extra) {
    return launch(cls, activity, questions, timer, extra);
  };
  window.MappAILive.openDashboard = function () { return openDashboard(); };
  window.MappAILive.publishHtml = function (filename, html) {
    if (!window.electronAPI || !window.electronAPI.liveMaterialsAddHtml) { toast(t('lv_electron', 'MappAI Live richiede l\'app desktop.'), 'warning'); return Promise.resolve(); }
    var ensure = ensureMatServer();
    return ensure.then(function () { return window.electronAPI.liveMaterialsAddHtml({ filename: filename, html: html }); })
      .then(function (r) { if (r && r.success) { LT.matInfo.files = r.files; toast(t('lv_published', 'Pubblicato') + ': ' + (r.file || filename), 'success'); } return r; });
  };

  // Barra "Salva come PDF" per la copia SERVITA agli studenti (mobile-first):
  // sul telefono window.print() → "Salva su File" come PDF (iOS e Android). La
  // copia locale del docente resta intatta: la barra vive solo nel file servito.
  // È no-print (non finisce nel PDF) e lascia spazio in fondo per non coprire il testo.
  function _injectStudentSaveBar(html) {
    var label = t('sd_save_pdf', 'Salva come PDF');
    var labelHtml = t('sd_save_html', 'Salva HTML');
    var hint = t('sd_save_pdf_hint', 'Sul telefono scegli “Salva su File” per tenere PDF o HTML (l\'HTML conserva l\'ascolto)');
    // window.__maiSaveHtml scarica il documento AUTO-CONTENUTO (lettore + eventuale
    // audio incorporato) come .html: l'allievo lo tiene sul device e lo riapre offline.
    var saveScript =
      '<script>window.__maiSaveHtml=function(){try{' +
      'var h="<!DOCTYPE html>\\n"+document.documentElement.outerHTML;' +
      'var b=new Blob([h],{type:"text/html"});var u=URL.createObjectURL(b);' +
      'var a=document.createElement("a");a.href=u;' +
      'var ttl=(document.title||"sintesi").replace(/[^a-z0-9\\-_ ]/gi,"").replace(/\\s+/g," ").trim()||"sintesi";' +
      'a.download=ttl+".html";document.body.appendChild(a);a.click();a.remove();' +
      'setTimeout(function(){URL.revokeObjectURL(u);},6000);' +
      '}catch(e){alert("Salvataggio non riuscito");}};<\/script>';
    var bar =
      '<style>@media print{#mai-stu-pdf{display:none!important}}</style>' +
      '<div id="mai-stu-pdf-spacer" style="height:92px"></div>' +
      '<div id="mai-stu-pdf" style="position:fixed;left:0;right:0;bottom:0;z-index:2147483000;background:#ffffff;border-top:1px solid #e2e8f0;box-shadow:0 -6px 18px rgba(15,23,42,.08);padding:10px 14px calc(10px + env(safe-area-inset-bottom));display:flex;flex-direction:column;align-items:center;gap:5px;font-family:system-ui,-apple-system,Segoe UI,sans-serif">' +
      '<div style="display:flex;gap:8px;width:100%;max-width:440px">' +
      '<button onclick="window.print()" style="flex:1;background:#4f46e5;color:#fff;border:none;border-radius:12px;padding:13px 14px;font-size:15px;font-weight:800;cursor:pointer">' + esc(label) + '</button>' +
      '<button onclick="window.__maiSaveHtml()" style="flex:1;background:#eef2ff;color:#4338ca;border:1px solid #c7d2fe;border-radius:12px;padding:13px 14px;font-size:15px;font-weight:800;cursor:pointer">' + esc(labelHtml) + '</button>' +
      '</div>' +
      '<div style="font-size:11.5px;color:#94a3b8;text-align:center">' + esc(hint) + '</div>' +
      '</div>' + saveScript;
    return /<\/body>/i.test(html) ? html.replace(/<\/body>/i, bar + '</body>') : (html + bar);
  }

  // QR RAPIDO di un singolo documento: pubblica l'HTML sul server materiali e
  // mostra il QR che punta DIRETTAMENTE al file (?s=token → apertura inline).
  window.MappAILive.shareDocQr = function (filename, html) {
    if (!window.electronAPI || !window.electronAPI.liveMaterialsAddHtml) { toast(t('lv_electron', 'MappAI Live richiede l\'app desktop.'), 'warning'); return Promise.resolve(); }
    var studentHtml = _injectStudentSaveBar(html);
    var ensure = ensureMatServer();
    return ensure.then(function () { return window.electronAPI.liveMaterialsAddHtml({ filename: filename, html: studentHtml }); })
      .then(function (r) {
        if (!r || !r.success) { toast((r && r.error) || t('lv_electron', 'Errore'), 'error'); return r; }
        LT.matInfo.files = r.files;
        var info = LT.matInfo;
        // web mode: path espliciti sull'ORIGIN del relay (mai su /j/<code>)
        var base = (window.MappAINetMode ? window.MappAINetMode.baseForPaths(info) : (info.urls && info.urls[0])) || ('http://localhost:' + info.port);
        var fileUrl = base + '/files/' + encodeURIComponent(r.file) + '?s=' + info.token;
        openDocQr(fileUrl, r.file);
        return r;
      });
  };

  // Dialog QR di un documento: QR grande + URL + apri a schermo intero.
  function openDocQr(url, name) {
    var qrSrc = qrDataUrl(url, 9);
    var body = '<div style="text-align:center">' +
      (qrSrc ? '<img id="lv-docqr" src="' + qrSrc + '" style="width:230px;height:230px;image-rendering:pixelated;border-radius:12px;border:1px solid #e2e8f0;cursor:zoom-in">' : '<div style="color:#b45309">QR non disponibile</div>') +
      '<div style="font-size:12px;color:#475569;margin-top:8px;word-break:break-all">' + esc(url) + '</div>' +
      '<div style="font-size:11px;color:#94a3b8;margin-top:4px">' + t('sd_qr_hint', 'Gli allievi inquadrano il QR e aprono il documento (nessun login)') + '</div></div>' +
      '<div style="display:flex;gap:8px;margin-top:16px;justify-content:flex-end">' +
      actBtn('lv-docqr-close', t('lv_back', 'Indietro'), '#f1f5f9', '#334155') + '</div>';
    var ov = modal('qr-code', t('sd_qr_title', 'Condividi documento'), body, '440px');
    var img = ov.querySelector('#lv-docqr'); if (img) img.onclick = function () { openQrFull(url); };
    ov.querySelector('#lv-docqr-close').onclick = closeModal;
  }

  // Nome della classe attiva (chip storico); null = Generico (nessun chip).
  function activeClassName() {
    try { var a = window.MappAIClasses && window.MappAIClasses.getActive(); return a && a.name ? a.name : null; }
    catch (e) { return null; }
  }

  // Condivide via QR la CARTELLA VAULT di una mappa come .zip scaricabile (19/7):
  // zip del vault nella cartella servita dal server Materiali, poi QR al file .zip
  // (download, nessun login). Usato dalla sezione "Progetti esistenti" (Insegna).
  window.MappAILive = window.MappAILive || {};
  window.MappAILive.shareVaultZipQr = function (vaultName, displayName) {
    if (!window.electronAPI || !window.electronAPI.zipVaultToMaterials) { toast(t('lv_electron', 'MappAI Live richiede l\'app desktop.'), 'warning'); return Promise.resolve(); }
    toast(t('lt_zip_building', 'Preparo la cartella vault…'), 'info');
    return ensureMatServer().then(function (info) {
      if (!info || !info.success) { toast((info && info.error) || t('lv_electron', 'Errore'), 'error'); return null; }
      return window.electronAPI.zipVaultToMaterials({ vaultName: vaultName });
    }).then(function (r) {
      if (!r) return null;
      if (!r.success) {
        toast(r.error === 'cartella-non-trovata' ? t('lt_no_vault', 'Nessuna cartella vault su disco') : (r.error || t('lv_electron', 'Errore')), 'error');
        return r;
      }
      LT.matInfo.files = r.files;
      var info = LT.matInfo;
      var base = (window.MappAINetMode ? window.MappAINetMode.baseForPaths(info) : (info.urls && info.urls[0])) || ('http://localhost:' + info.port);
      var fileUrl = base + '/files/' + encodeURIComponent(r.file) + '?s=' + info.token;
      openDocQr(fileUrl, r.file);
      return r;
    });
  };

  /* ⚠️ Qui stava `MappAILive.shareFile`, che pubblicava un file della LIBRERIA
     «File condivisi». Pensionata il 13/8 con la libreria stessa: la si poteva
     riempire e non svuotare, perché la vista che la elencava era orfana da
     settimane. Per mettere un file in mano alla classe resta «Aggiungi file…»
     qui sotto, che lo copia nel server della sessione. */

  console.log('[MappAILiveTeacher] hub MappAI Live caricato');
})();
