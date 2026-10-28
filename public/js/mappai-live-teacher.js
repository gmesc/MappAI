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
 * liveMaterials*. Riusa MappAILiveCore (domande/l1)
 * (MC ancorati al contenuto).
 * Caricare DOPO mappai-live-core.js, mappai-live-classes.js.
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

  /* 0122 lotto 4b1: sfondo bloccato, Esc, piano e «un velo solo» li fa `MappAIVelo.monta` (mappai-velo.js),
     lo stesso per tutti i velini fatti a mano; qui c'era una copia locale di `congela` (lotto 2). */
  function modal(icon, title, bodyHtml, maxWidth) {
    closeModal();
    var ov = document.createElement('div');
    ov.id = 'live-hub-modal';
    ov.className = 'mm-velo';   /* 0122: il velo del motore, scuro e sfumato */
    /* ⚠️ Il piano si CHIEDE al motore (`prossimoZ`): un 9991 fisso finisce
       DIETRO la console di INSEGNA, che parte da 12000 — il QR si apriva
       davvero, invisibile sotto. */
    var _z = 9991;
    try { if (window.MappAIModal && window.MappAIModal.prossimoZ) _z = window.MappAIModal.prossimoZ(); } catch (e) { }
    ov.style.cssText = 'position:fixed;inset:0;z-index:' + _z + ';display:flex;align-items:center;justify-content:center;padding:18px';
    /* 0122 (lotto 2): il box porta il vestito «grande» del motore (mappai-modal-tokens.css) e la
       testata è quella del motore — icona nuda, titolo alla stessa quota, × da 44 */
    ov.innerHTML = '<div class="mm-box--grande" style="background:#f8fafc;border-radius:var(--mm-r-box, 16px);box-shadow:0 25px 60px -12px rgba(0,0,0,.35);width:min(' + (maxWidth || 'var(--mm-l)') + ',96vw);max-height:90vh;overflow-y:auto;padding:var(--mm-pad, 22px)" role="dialog" aria-modal="true">' +
      '<div class="mm-head"><div class="mm-head__ico"><i data-lucide="' + icon + '"></i></div>' +
      '<div class="mm-head__testi"><div class="mm-title">' + esc(title) + '</div></div>' +
      '<button type="button" class="mm-close lh-close" aria-label="Chiudi">&times;</button></div>' + bodyHtml + '</div>';
    ov.addEventListener('click', function (e) { if (e.target === ov) chiudiOChiedi(); });
    ov.querySelector('.lh-close').onclick = chiudiOChiedi;
    document.body.appendChild(ov);
    if (window.MappAIVelo) window.MappAIVelo.monta(ov, chiudiOChiedi);
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
  /* 0116, gate del 21/10 (Giacomo): «Se schiaccio il bottone 'x' con una
     sessione aperta deve mostrare un modale con le opzioni 'chiudi sessione',
     'ferma server', 'annulla'; se schiaccio 'chiudi sessione' o 'ferma server'
     allora chiedi la conferma». Senza sessione la × chiude e basta.
     0127, gate del 27/10 (Giacomo): via «Ferma server», e dopo «Chiudi sessione» via «Chiudi pannello».
     A sessione aperta la × offre «Chiudi sessione» o «Annulla»; a sessione chiusa chiude il pannello, cioè
     spegne il server, con la sua conferma. */
  function chiudiOChiedi() {
    var MM = window.MappAIModal;
    if (!(LT._dashOpen && LT.info) || !MM || !MM.open) return closeModal();
    if (_fase() === 'closed') return doStop();
    MM.open({
      titolo: t('lv_x_t', 'La sessione è ancora attiva'), icona: 'radio', taglia: 's',
      sezioni: [{ testo: t('lv_x_d', 'Gli allievi stanno ancora rispondendo. Che cosa vuoi fare?') }],
      azioni: [{ id: 'annulla', etichetta: t('ds_annulla', 'Annulla'), ruolo: 'quieto' },
        { id: 'chiudi', etichetta: t('lv_close', 'Chiudi sessione'), ruolo: 'primario' }]
    }).then(function (r) {
      if (r && r.azione === 'chiudi') doClose();
    });
  }
  function closeModal() {
    var m = document.getElementById('live-hub-modal'); if (m) m.remove();
    stopPolling();
    if (LT._dashOpen) {
      LT._dashOpen = false;
      if (LT.info) toast(t('lv_dash_closed', 'La sessione resta ATTIVA. Per riprenderla: «Studio attivo live» nella sidebar.'), 'info');
    }
  }

  function card(icon, title, desc, tip, act) {
    return '<button type="button" class="lh-card" ' + (act ? 'data-act="' + esc(act) + '" ' : '') + (tip ? 'data-tip="' + esc(tip) + '" ' : '') +
      'style="display:flex;align-items:center;gap:14px;text-align:left;background:#fff;border:1px solid var(--mm-bordo, #cbd5e1);border-radius:14px;padding:16px 18px;cursor:pointer;width:100%">' +
      '<div style="width:44px;height:44px;border-radius:12px;background:#eef2ff;display:flex;align-items:center;justify-content:center;flex-shrink:0">' +
      '<i data-lucide="' + icon + '" style="width:22px;height:22px;color:#4f46e5"></i></div>' +
      '<div style="flex:1"><div style="font-weight:800;color:var(--mm-testo, #404040);font-size:15px">' + esc(title) + '</div>' +
      '<div style="font-size:12px;color:var(--mm-testo-3, #64748b);margin-top:2px">' + esc(desc) + '</div></div>' +
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
      if (info && info.success) { await _riaggancia(info); return; }
    }
    openHubMenu();
  };

  /* 0131 (Giacomo, 27/10: «Sì a (c)»): una sessione «Costruisci» della Timeline ha il suo pannello. Qui si apriva
     quello del quiz, coi bottoni del quiz («Avvia domande», «Report domande», «Report allievi»), che la Timeline
     non ha. La modalità la dice il server (`/api/status` → session.mode), come in `renderActions`. */
  function _riaggancia(info) {
    LT.info = info;
    var TLL = window.MappAITimelineLive;
    if (!TLL || !TLL.riaggancia) { openDashboard(); return Promise.resolve(); }
    return fetch('http://127.0.0.1:' + info.port + '/api/status?admin=' + encodeURIComponent(info.adminToken))
      .then(function (r) { return r.json(); })
      .then(function (s) {
        var ses = s && s.session;
        if (ses && ses.mode === 'build') TLL.riaggancia(info, ses.phase); else openDashboard();
      }, function () { openDashboard(); });
  }

  // «Domande a scelta» (19/8): la card compare solo se il modulo c'è ed è
  // acceso — un kill-switch che lascia la card aprirebbe il vuoto.
  /* 0116: la stessa leva di prima («Correggi subito» nel modale delle domande a
     scelta, `mappai-scelta.js`): `mappai_quiz_live_feedback='0'` la spegne */
  function _feedbackOn() {
    try { return localStorage.getItem('mappai_quiz_live_feedback') !== '0'; } catch (e) { return true; }
  }
  function _sceltaOn() {
    return !!(window.MappAISceltaAttivita && window.MappAISceltaAttivita.attiva());
  }

  /* 0122 (Giacomo, 22/10): «questo modale deve mostrare le card con i titoli e le desc uguali a quelle
     visibili nella sidebar» — le stesse chiavi `lim_card_*` della tab Attività live; l'ordine resta
     quello dello 0116 (quiz, board, materials, tutor) */
  function openHubMenu() {
    var body = '<p style="font-size:13px;color:#475569;line-height:1.55;margin:0 0 14px">' +
      t('lv_hub_intro', 'Attività di classe via QR: gli allievi entrano dal telefono sulla rete d\'aula.') + '</p>' +
      '<div style="display:flex;flex-direction:column;gap:10px">' +
      card('radio', t('lim_card_live', 'Esercizi'), t('lim_card_live_d', 'QuizMC, Domande aperte o Domande al volo.'), t('lv_card_quiz_tip', 'Ogni allievo risponde dal telefono; a fine sessione due report: heatmap domande e schede individuali.'), 'quiz') +
      /* 0116, gate del 21/10 (Giacomo): via «Domande aperte» (i fogli partono dal menu
         di «Studio attivo live») e via «Timeline» */
      card('presentation', t('lim_card_board', 'Mappa'), t('lim_card_board_d', 'Mappe condivise'), '', 'board') +
      card('qr-code', t('lim_card_mat', 'Invia file'), t('lim_card_mat_d', 'Scegli dalle risorse salvate'), t('lv_card_mat_tip', 'Gli allievi scaricano dispense, sintesi e PDF inquadrando il QR.'), 'materials') +
      card('message-circle', t('lim_card_tutor', 'Interroga'), t('lim_card_tutor_d', 'Domanda con risposta assistita'), t('lv_card_tutor_tip', 'Il tutor guida senza mai scrivere il testo; al docente arrivano testo + trascrizione. Cap di scambi per contenere i costi.'), 'tutor') +
      '</div>';
    var ov = modal('radio', t('lv_hub_title', 'MappAI Live'), body, 'var(--mm-m)');
    /* i clic vanno per `data-act`, non per posizione: un elenco che perde o
       guadagna una card non sposta i clic delle altre (0116) */
    var azioni = {
      quiz: function () { openLiveSetup(); },
      board: function () { closeModal(); if (window.openCollabHub) window.openCollabHub(); else toast('Mappa LIVE non disponibile', 'error'); },
      materials: function () { openMaterialsPanel(); },
      tutor: function () { closeModal(); if (window.MappAITutor) window.MappAITutor.open(); else toast('Chiedi e Rispondi non disponibile', 'error'); }
    };
    ov.querySelectorAll('.lh-card').forEach(function (c) {
      var fn = azioni[c.getAttribute('data-act')];
      if (fn) c.onclick = fn;
    });
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
     compare in questo elenco. Un posto per comporre, uno per lanciare.
     ⚠️ 0116 (Giacomo, 20/10/2026): le «domande mie» tornano, come domande
     APERTE scritte una per riga nel menu — niente editor, niente generazione. */
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
  /* 0127: l'angolo di un set con la regola dell'iPad (niente angolo per «auto» e per l'angolo vuoto);
     lo dicono la riga del set nel menu, il box «Tipo» e il titolo dei report */
  function _angoloDelSet(set) {
    return (set && set.angle && set.angle !== 'auto' && window.quizAngleLabel) ? window.quizAngleLabel(set.angle) : '';
  }
  /* 0127 (Giacomo, 27/10): nel menu il nome del set senza il progetto, che si ripeteva su ogni riga. I nomi
     seguono «[progetto] — [tipo] · [nome]» (set nati con la mappa e «Crea un documento»); per i set nati con
     la mappa il nome è la chiave dell'angolo, e si scrive con la sua etichetta. Un nome fuori regola resta com'è. */
  function _nomeDelSet(set, tipo, progetto) {
    var n = String(set.title || '');
    var pre = progetto + ' — ';
    if (progetto && n.indexOf(pre) === 0) n = n.slice(pre.length);
    if (set.angle && n === tipo + ' · ' + set.angle) n = [tipo, _angoloDelSet(set)].filter(Boolean).join(' · ');
    return n || tipo;
  }
  /* ⚠️ LA GUARDIA STA QUI, non nei chiamanti (21/8/26). `openLiveHub` la
     faceva già, ma la sidebar LIM e la console di INSEGNA chiamano
     `MappAILive.openSetup()` DIRITTO: con una sessione in corso offrivano di
     sceglierne un'altra, e alla gestione non si tornava più. Un posto solo,
     tre ingressi coperti. */
  async function openLiveSetup() {
    if (window.electronAPI && window.electronAPI.liveSessionInfo) {
      var att = await window.electronAPI.liveSessionInfo();
      if (att && att.success) { await _riaggancia(att); return; }
    }
    var MM = window.MappAIModal;
    var sets = _setLive();
    /* 0116: nel menu anche i fogli di domande aperte (D6) e le domande scritte
       dal docente al momento (D5, rovescia la decisione del 13/8 «un posto per
       comporre, uno per lanciare»: Giacomo, 20/10/2026). Le aperte partono
       come il bottone «Domande aperte»: un foglio, tutte le domande. */
    var SA = window.MappAISceltaAttivita;
    var fogli = (SA && SA.fogliAperti && _sceltaOn()) ? SA.fogliAperti() : [];   /* `mappai_domande_scelta='0'` le spegne */
    if (!MM) {                       /* ripiego: senza motore si va sull'ultimo set */
      if (!sets.length) { toast(t('lv_nessun_set', 'Nessun quiz pronto per questa mappa.'), 'warning'); return; }
      openLiveFromSet(sets[sets.length - 1]);
      return;
    }
    var sezioni = [];
    var progetto = rootLabel();
    if (sets.length) sezioni.push({
      titolo: t('lv_sez_mc', 'Quiz a scelta multipla'),
      voci: sets.slice().reverse().map(function (x) {
        var tipo = x.type || t('lv_m_mc', 'Scelta multipla');
        var nome = _nomeDelSet(x, tipo, progetto);
        /* la riga grigia dice solo quello che il nome non dice già; «con la mappa» è uscita (Giacomo, 27/10) */
        var sotto = [tipo, _angoloDelSet(x)].filter(function (p) { return p && nome.toLowerCase().indexOf(p.toLowerCase()) < 0; });
        sotto.push(x.items.length + ' ' + t('lv_questions', 'domande'));
        return { id: 'set:' + x.id, icona: 'list-checks', etichetta: nome, sotto: sotto.join(' · ') };
      })
    });
    if (fogli.length) sezioni.push({
      titolo: t('lv_sez_aperte', 'Domande aperte'),
      voci: fogli.map(function (f, k) {
        return {
          id: 'foglio:' + k, icona: 'pencil-line',
          etichetta: f.titolo,
          sotto: f.items.length + ' ' + t('lv_questions', 'domande') + ' · ' + t('lv_aperte_tutte', 'ogni allievo risponde a tutte')
        };
      })
    });
    if (!sets.length && !fogli.length) sezioni.push({
      testo: t('lv_nessun_set_d2', 'Questa mappa non ha ancora quiz né fogli di domande aperte: li trovi fra i materiali generati con la mappa, o li crei in ELABORA → «Crea un documento». Intanto puoi scrivere qui sotto le tue domande.')
    });
    sezioni.push({
      titolo: t('lv_sez_mie', 'Le tue domande'),
      campi: [{ id: 'mie', tipo: 'area', cresce: true, etichetta: t('lv_mie_et', 'Una domanda per riga'), valore: '' }],
      azioni: [{ id: 'mie', etichetta: t('lv_mie_avvia', 'Avvia queste domande'), ruolo: 'primario' }],
      sotto: t('lv_mie_d', 'Partono come domande aperte: ogni allievo risponde a tutte.')
    });
    MM.open({
      titolo: t('lv_scegli_set_t', 'Avvia un\'attività live'), icona: 'radio', taglia: 'm', invio: false,
      veste: 'grande',   /* 0122: famiglia C e icona nuda, come le altre tre finestre delle Attività live */
      sezioni: [{ testo: t('lv_scegli_set_d', 'Le domande ci sono già: nessuna generazione davanti alla classe.') }].concat(sezioni)
    }).then(function (r) {
      if (!r || !r.azione) return;
      if (r.azione.indexOf('set:') === 0) {
        var id = r.azione.slice(4);
        var set = sets.filter(function (x) { return x.id === id; })[0];
        if (set) openLiveFromSet(set);
        return;
      }
      if (r.azione.indexOf('foglio:') === 0) {
        var f = fogli[parseInt(r.azione.slice(7), 10)];
        if (f) _avviaAperte(f);
        return;
      }
      if (r.azione === 'mie') {
        var righe = _righeDomande((r.valori || {}).mie);
        if (!righe.length) { toast(t('lv_mie_vuote', 'Scrivi almeno una domanda, una per riga.'), 'warning'); return; }
        _avviaAperte({ titolo: t('lv_mie_titolo', 'Domande del docente'), angle: '', tipo: 'open',
          items: righe.map(function (q) { return { domanda: q }; }) });
      }
    });
  }

  /* 0116: le righe non vuote di un testo, una domanda per riga (D8) */
  function _righeDomande(testo) {
    return String(testo || '').split(/\r?\n/).map(function (x) { return x.replace(/\s+/g, ' ').trim(); })
      .filter(function (x) { return x.length > 0; });
  }
  /* 0116: un foglio di domande aperte (della mappa o scritto qui) parte come il
     bottone «Domande aperte». Senza classe attiva: un avviso, non un toast
     verde (voce 42). */
  function _avviaAperte(foglio) {
    var SA = window.MappAISceltaAttivita;
    if (!SA || !SA.avviaFoglio) { toast(t('hub_fn_missing', 'Funzione non disponibile'), 'error'); return; }
    var cls = _classeDelProgetto();
    if (!cls) { _avvisoClasse(); return; }
    SA.avviaFoglio(cls, foglio);
  }
  /* 0116, gate del 21/10 (Giacomo): «siamo già dentro un progetto che ha una
     classe e una materia». La classe è quella del progetto aperto (`classe:`
     di index.yaml, o la cartella `<classe>/<materia>/<mappa>`), non la classe
     attiva; la classe attiva resta solo come ripiego. */
  function _nomeClasseDelProgetto() {
    var st = S() || {};
    return String(st.vaultClasse || st.activeVaultClassDir || '').trim();
  }
  function _classeDelProgetto() {
    var C = window.MappAIClasses;
    var nome = _nomeClasseDelProgetto();
    var tutte = (C && C.list && C.list()) || [];
    if (nome) {
      var c = tutte.filter(function (x) { return x && x.name === nome; })[0];
      if (c) return c;
    }
    return (C && C.getActive) ? C.getActive() : null;
  }
  function _avvisoClasse() {
    var MM = window.MappAIModal;
    var nome = _nomeClasseDelProgetto();
    var testo = nome
      ? t('lv_classe_manca_d', 'Il progetto è della classe {c}, che non è fra le classi di MappAI: creala in Account classi, con le credenziali degli allievi.').replace('{c}', nome)
      : t('lv_progetto_senza_classe', 'Questo progetto non ha una classe: gli allievi entrano con le credenziali di una classe.');
    if (MM && MM.avviso) MM.avviso({ titolo: t('lv_classe_t', 'Manca la classe'), icona: 'graduation-cap', testo: testo });
    else toast(testo, 'error');
  }


  function openLiveFromSet(set) {
    if (!set || !Array.isArray(set.items) || !set.items.length) { toast(t('lv_set_empty', 'Questo set non ha domande.'), 'error'); return; }
    var mode = /ver|v\/f|\btf\b|true|fals/i.test(String(set.type || set.quizType || '')) ? 'tf' : 'mc';
    var modeLabel = mode === 'tf' ? t('lv_m_tf', 'Vero / Falso') : t('lv_m_mc', 'Scelta multipla');
    /* 0127: il materiale = il tipo del set e il suo angolo; lo mostra il box «Tipo» e va nei titoli dei report */
    var materiale = [modeLabel, _angoloDelSet(set)].filter(Boolean).join(' · ');
    var classes = (window.MappAIClasses && window.MappAIClasses.list()) || [];
    /* 0116: la tendina parte sulla classe del progetto aperto, non sulla classe attiva */
    var delProgetto = _classeDelProgetto();
    var activeId = (delProgetto && delProgetto.id) || (window.MappAIClasses && window.MappAIClasses.activeId && window.MappAIClasses.activeId()) || '';
    var classOpts = classes.map(function (c) { return '<option value="' + c.id + '"' + (c.id === activeId ? ' selected' : '') + '>' + esc(c.name) + (c.year ? ' (' + esc(c.year) + ')' : '') + ' · ' + (c.students || []).length + '</option>'; }).join('');
    var classField = classes.length
      ? '<select id="lvs-class" class="lv-in">' + classOpts + '</select>'
      : '<div style="font-size:12px;color:#b45309;background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:10px 12px">' +
        t('lv_no_class', 'Nessuna classe. Creala in Profilo → Account classi.') +
        ' <button type="button" id="lvs-goclass" style="background:none;border:0;color:#4f46e5;font-weight:700;cursor:pointer;text-decoration:underline">' + t('lv_open_class', 'Apri Account classi') + '</button></div>';
    /* 11/10 (0087 lotto 10b): il campo del motore — neutro senza bordo, 40/12, al mouse bianco col bordo, a fuoco l'anello --mm-focus */
    var body = '<style>.lv-in{width:100%;height:var(--mm-ctl-h, 40px);border:var(--mm-bordo-spessore, 1px) solid transparent;border-radius:var(--mm-r-campo, 10px);padding:0 12px;font:inherit;font-size:var(--mm-ctl-fs, 12px);color:var(--mm-testo, #404040);background:var(--mm-neutro, #f1f4f8)}' +
      '.lv-in:hover:not(:focus){background:var(--mm-fondo, #fff);border-color:var(--mm-bordo, #cbd5e1)}.lv-in:focus{outline:none;box-shadow:0 0 0 2px var(--mm-focus, #ea580c)}' +
      '.lv-lab{display:block;font-size:11px;font-weight:700;color:#475569;margin:12px 0 4px}</style>' +
      '<div style="font-size:12px;color:#475569;background:#f1f5f9;border-radius:10px;padding:10px 12px">' +
        t('lv_from_set_hint', 'Avvia una sessione live con le domande GIÀ pronte di questo set — nessuna nuova generazione AI.') + '</div>' +
      '<span class="lv-lab">' + t('lv_class', 'Classe') + '</span>' + classField +
      '<div style="display:flex;gap:12px"><div style="flex:1"><span class="lv-lab">' + t('lv_qtype', 'Tipo') + '</span>' +
        '<div style="border:1px solid var(--mm-bordo, #cbd5e1);border-radius:10px;padding:9px 11px;font-weight:700;color:#4f46e5;background:#eef2ff">' + esc(materiale) + ' · ' + set.items.length + ' ' + t('lv_questions', 'domande') + '</div></div>' +
      '<div style="flex:1"><span class="lv-lab">' + t('lv_timer', 'Timer (min, 0 = nessuno)') + '</span><input id="lvs-timer" type="number" class="lv-in" value="0" min="0" inputmode="numeric"></div></div>' +
      '<label style="display:flex;align-items:flex-start;gap:8px;margin-top:14px;cursor:pointer;font-size:12px;color:#475569;line-height:1.4">' +
        '<input type="checkbox" id="lvs-reveal" checked style="width:16px;height:16px;margin-top:1px;accent-color:#4f46e5;flex-shrink:0">' +
        '<span>' + t('lv_reveal', 'A fine sessione mostra allo studente le soluzioni (giuste/sbagliate + spiegazione), salvabili sul suo dispositivo.') + '</span></label>' +
      /* 0116 (D9): «Correggi subito» viene qui dal modale delle domande a scelta.
         Spenta di serie, e non è timidezza: con la correzione immediata si smette
         di ragionare e si prova finché non diventa verde. Solo scelta multipla:
         una risposta già corretta non si ripensa (la regola vive nel server). */
      (_feedbackOn() && mode === 'mc'
        ? '<label style="display:flex;align-items:flex-start;gap:8px;margin-top:10px;cursor:pointer;font-size:12px;color:#475569;line-height:1.4">' +
          '<input type="checkbox" id="lvs-feedback" style="width:16px;height:16px;margin-top:1px;accent-color:#4f46e5;flex-shrink:0">' +
          '<span><b>' + t('ds_feedback', 'Correggi subito') + '</b> — ' + t('ds_feedback_d', 'Dopo ogni risposta l\'allievo vede se è giusta, con la spiegazione. La domanda si chiude: una risposta già corretta non si ripensa.') + '</span></label>'
        : '') +
      '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:18px">' +
      '<button type="button" id="lvs-back" style="background:#fff;border:1px solid var(--mm-bordo, #cbd5e1);color:var(--mm-testo, #404040);border-radius:10px;padding:10px 16px;cursor:pointer;font-weight:700">' + t('lv_back', 'Indietro') + '</button>' +
      '<button type="button" id="lvs-go" style="background:#4f46e5;color:#fff;border:0;border-radius:10px;padding:10px 20px;cursor:pointer;font-weight:800">' + t('lv_go', 'Avvia sessione') + '</button></div>';
    var ov = modal('radio', t('lv_from_set_title', 'Avvia quiz live'), body, 'var(--mm-m)');
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
      var fb = ov.querySelector('#lvs-feedback');
      var opz = (fb && fb.checked) ? { feedbackImmediato: true } : {};
      opz.materiale = materiale;
      launch(cls, mode === 'tf' ? 'Vero-Falso' : 'Quiz', qs, timer, opz);
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

  // MC / V/F: ancorati al contenuto del nodo

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
    // Il carattere del docente (Cabina › Aspetto e leggibilità) viaggia con la sessione: l'allievo lo eredita (0112)
    try { if (window.MappAIFont && window.MappAIFont.attivo) payload.font = window.MappAIFont.attivo() || ''; } catch (e) { /* senza carattere: Space Mono */ }
    // Timeline Live (008): mode/loginMode/hintMode/build pass-through (default = quiz storico).
    if (extra.mode) payload.mode = extra.mode;
    if (extra.loginMode) payload.loginMode = extra.loginMode;
    if (extra.hintMode) payload.hintMode = extra.hintMode;
    if (extra.build) payload.build = extra.build;
    if (extra.scelta) payload.scelta = extra.scelta;
    if (extra.feedbackImmediato) payload.feedbackImmediato = true;
    // 0127: genere e angolo per i titoli dei report («[Progetto] · [Materiale] · Report allievi»)
    if (extra.materiale) payload.materiale = extra.materiale;
    // quali report sa produrre QUESTA sessione: la dashboard è una sola, ma
    // «domande» e «allievi» non esistono fuori dal quiz
    LT._reports = extra.reports || null;
    LT._lastStatus = null; _curPhase = null;   // 0116: la fase della sessione di prima non deve decidere i bottoni di questa
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
    ov.innerHTML = '<img src="' + big + '" alt="QR" style="width:min(70vh,70vw);image-rendering:pixelated"><div style="font-size:22px;font-weight:800;color:var(--mm-testo, #404040)">' + esc(url) + '</div>';
    ov.onclick = function () { ov.remove(); };
    document.body.appendChild(ov);
  }

  // ── Dashboard ─────────────────────────────────────────────────────────────
  /* ══ LA DASHBOARD HA DUE CASE, MAI DUE COPIE (21/8/26) ═══════════════════
     Richiesta di Giacomo: mentre il server è in piedi deve poter guardare la
     mappa. Il modale la copre, quindi la dashboard si STACCA in un pannello
     fluttuante — è lo stesso gesto che la Lavagna ha dal 12/7
     (`openFloatingPanel` in collab-teacher): stessa forma, così non si
     imparano due modi di fare la stessa cosa.

     ⚠️ Si SPOSTA, non si duplica: il corpo usa `id` (`lv-qr`, `lv-rosterlist`,
     `lv-actions`…) e due host vivi darebbero id ripetuti, con `getElementById`
     che ne servirebbe uno solo — il roster si aggiornerebbe in una copia e
     l'altra resterebbe ferma a mentire. Un host per volta: o il modale, o il
     pannello. (La Lavagna può averne due perché usa CLASSI e tiene l'elenco
     degli host: là serviva, qui no.) */
  function dashBodyHtml(url, qrSrc) {
    return '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:18px;align-items:start">' +
      '<div style="text-align:center">' +
      (qrSrc ? '<img id="lv-qr" src="' + qrSrc + '" alt="QR" style="width:210px;height:210px;image-rendering:pixelated;border-radius:12px;border:1px solid var(--mm-bordo, #cbd5e1);cursor:zoom-in">'
             : '<div style="color:#b45309;font-size:12px">QR non disponibile</div>') +
      '<div style="font-size:12px;color:#475569;margin-top:6px;word-break:break-all">' + LT.info.urls.map(esc).join('<br>') + '</div>' +
      (window.MappAINetMode ? window.MappAINetMode.lanLineHtml(LT.info) : '') +
      '<div style="font-size:11px;color:var(--mm-testo-3, #64748b);margin-top:4px">' + t('lv_qr_hint', 'Clic sul QR per proiettarlo (LIM)') + '</div></div>' +
      '<div><div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">' +
      '<span style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--mm-testo-3, #64748b)">' + t('lv_roster', 'Allievi') + '</span>' +
      '<span id="lv-phase" style="font-size:11px;font-weight:700;padding:2px 8px;border-radius:999px;background:#eef2ff;color:#4f46e5"></span>' +
      '<span style="flex:1"></span><span id="lv-count" style="font-size:11px;color:var(--mm-testo-3, #64748b)"></span></div>' +
      '<div id="lv-rosterlist" style="display:flex;flex-direction:column;gap:5px;max-height:320px;overflow-y:auto">' +
      '<div style="color:var(--mm-testo-3, #64748b);font-size:12.5px">' + t('lv_waiting', 'In attesa degli allievi…') + '</div></div></div></div>' +
      '<div style="background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:8px 12px;font-size:11.5px;color:#92400e;margin-top:14px">' +
      t('lv_net_note', 'Rete: usa l\'hotspot del PC o un router d\'aula. Le reti scolastiche spesso bloccano il traffico tra dispositivi.') + '</div>' +
      '<div id="lv-actions" style="display:flex;gap:8px;margin-top:14px;flex-wrap:wrap;align-items:center"></div>';
  }

  /* La fase da cui ripartire quando la dashboard cambia casa: senza, staccando
     durante le domande si tornerebbe a mostrare «Avvia domande». */
  function _fase() {
    try { return (LT._lastStatus && LT._lastStatus.session && LT._lastStatus.session.phase) || _curPhase || 'lobby'; }
    catch (e) { return 'lobby'; }
  }

  function openDashboard() {
    _chiudiFloat();                       // una casa per volta
    var url = studentUrl();
    var ov = modal('radio', t('lv_dash_title', 'Sessione live'), dashBodyHtml(url, qrDataUrl(url)));
    var qrImg = ov.querySelector('#lv-qr');
    if (qrImg) qrImg.onclick = function () { openQrFull(url); };
    LT._dashOpen = true;
    renderActions(_fase());
    startPolling();
  }

  // ── Pannello fluttuante: la stessa dashboard, fuori dal modale ────────────
  function _chiudiFloat() {
    var fp = document.getElementById('lv-float-panel');
    if (fp) fp.remove();
  }
  function _staccaDash() {
    var fase = _fase();
    LT._dashOpen = false;                 // sposto: non è un'uscita, niente avviso
    closeModal();                         // ⚠️ ferma anche il polling: si riaccende in fondo
    _chiudiFloat();
    var url = studentUrl();
    var fp = document.createElement('div');
    fp.id = 'lv-float-panel';
    fp.style.cssText = 'position:fixed;right:18px;bottom:18px;z-index:9985;width:min(420px,92vw);' +
      'max-height:86vh;overflow:auto;background:#f8fafc;border:1px solid var(--mm-bordo, #cbd5e1);border-radius:14px;' +
      'box-shadow:0 20px 50px -12px rgba(0,0,0,.35)';
    fp.innerHTML = '<div style="display:flex;align-items:center;gap:8px;padding:9px 12px;background:#eef2ff;position:sticky;top:0">' +
      '<i data-lucide="radio" style="width:16px;height:16px;color:#4f46e5"></i>' +
      '<span style="flex:1;font-weight:800;font-size:13px;color:var(--mm-testo, #404040)">' + esc(t('lv_dash_title', 'Sessione live')) + '</span>' +
      '<button type="button" class="lv-fp-collapse" title="' + esc(t('lv_collapse', 'Riduci')) + '" style="background:none;border:0;cursor:pointer;color:#64748b;font-size:16px;line-height:1;padding:2px 6px">–</button>' +
      '<button type="button" class="lv-fp-dock" title="' + esc(t('lv_dock', 'Riporta al centro')) + '" style="background:none;border:0;cursor:pointer;color:var(--mm-testo-3, #64748b);font-size:18px;line-height:1;padding:2px 6px">×</button>' +
      '</div><div class="lv-fp-body" style="padding:14px 16px">' + dashBodyHtml(url, qrDataUrl(url)) + '</div>';
    document.body.appendChild(fp);
    if (window.safeCreateIcons) window.safeCreateIcons();
    var qrImg = fp.querySelector('#lv-qr');
    if (qrImg) qrImg.onclick = function () { openQrFull(url); };
    fp.querySelector('.lv-fp-collapse').onclick = function () {
      var b = fp.querySelector('.lv-fp-body'), btn = fp.querySelector('.lv-fp-collapse');
      var chiuso = b.style.display === 'none';
      b.style.display = chiuso ? '' : 'none';
      btn.textContent = chiuso ? '–' : '+';
    };
    fp.querySelector('.lv-fp-dock').onclick = function () { openDashboard(); };
    renderActions(fase);
    startPolling();
    toast(t('lv_staccata', 'Pannello staccato: la mappa è di nuovo utilizzabile.'), 'info');
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
      /* 0116, gate del 21/10 (Giacomo: «I pannelli di gestione delle attività live
         'Domande aperte' e 'QuizMC' devono essere uguali»): due bottoni per tutti e
         due, «Report domande» e «Report allievi». La modalità la dice il SERVER
         (`/api/status` → session.mode): `LT._reports` lo scrive solo `launch`, e a
         una sessione già in corso ci si riaggancia senza passare di lì. */
      var modo = (LT._lastStatus && LT._lastStatus.session && LT._lastStatus.session.mode) || (LT.info && LT.info.mode) || '';
      var aScelta = modo === 'scelta' || !!(LT._reports && LT._reports[0] && LT._reports[0].which === 'scelta');
      var reps = aScelta ? [{ which: 'scelta', label: t('lv_rep_q', 'Report domande') }, { which: 'students', label: t('lv_rep_s', 'Report allievi') }]
        : (LT._reports && LT._reports.length && modo !== 'quiz') ? LT._reports : null;
      LT._reports = reps;
      if (reps) {
        reps.forEach(function (r, i) { html += actBtn('lv-rep-x' + i, r.label, '#4f46e5', '#fff'); });
      } else {
        html += actBtn('lv-rep-q', t('lv_rep_q', 'Report domande'), '#4f46e5', '#fff');
        html += actBtn('lv-rep-s', t('lv_rep_s', 'Report allievi'), '#4f46e5', '#fff');
      }
      html += actBtn('lv-folder', (window.tApriCartella ? window.tApriCartella() : t('lv_folder', 'Apri cartella')), 'var(--mm-neutro, #f1f4f8)', 'var(--mm-testo, #404040)');
    }
    /* «Stacca» solo quando la dashboard sta nel modale: dentro il pannello
       fluttuante il gesto inverso è già la × della sua testata. 0127, gate del 27/10 (Giacomo: «quando fermo
       un'attività il bottone 'stacca' deve sparire»): solo a sessione aperta. */
    if (phase !== 'closed' && !document.getElementById('lv-float-panel')) {
      html += '<span style="flex:1"></span>' +
        actBtn('lv-detach', t('lv_detach', 'Stacca'), 'var(--mm-neutro, #f1f4f8)', 'var(--mm-testo, #404040)');
    }
    box.innerHTML = html;
    wire(phase);
  }
  function actBtn(id, label, bg, fg) {
    return '<button type="button" id="' + id + '" style="background:' + bg + ';color:' + fg + ';border:0;border-radius:10px;padding:9px 15px;cursor:pointer;font-weight:700;font-size:var(--mm-btn-fs)">' + esc(label) + '</button>';
  }
  function wire(phase) {
    var det = document.getElementById('lv-detach');
    if (det) det.onclick = _staccaDash;
    var run = document.getElementById('lv-run');
    if (run) run.onclick = function () {
      fetch('http://127.0.0.1:' + LT.info.port + '/api/phase', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ adminToken: LT.info.adminToken, phase: 'running' }) })
        .then(function () { renderActions('running'); });
    };
    var close = document.getElementById('lv-close');
    if (close) close.onclick = function () { doClose(); };
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
  }
  /* «Chiudi sessione»: le consegne si fermano e i report si scrivono; il server
     resta su (gli allievi vedono l'esito, il docente apre i report). 0127: la conferma è del motore, come la × */
  function doClose(chiedi) {
    if (!LT.info) return Promise.resolve();
    var chiesto = chiedi === false ? Promise.resolve(true) : window.MappAIModal.conferma({
      titolo: t('lv_close_confirm', 'Chiudere la sessione e generare i report?'), icona: 'radio', conferma: t('lv_close', 'Chiudi sessione') });
    return chiesto.then(function (si) { return si ? _chiudiSessione() : false; });
  }
  function _chiudiSessione() {
    return fetch('http://127.0.0.1:' + LT.info.port + '/api/close', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ adminToken: LT.info.adminToken }) })
      .then(function () { renderActions('closed'); toast(t('lv_closed', 'Sessione chiusa — report pronti'), 'success'); return true; })
      .catch(function () { return false; });
  }
  /* «Ferma server». ⚠️ 0116, gate del 21/10: prima spegneva e basta, con la
     sessione ancora aperta sul disco — niente report, e rilanciando la stessa
     attività lo stesso giorno l'app la RIPRENDEVA, con le consegne di prima
     (Giacomo: «la riapro la sessione mostra ancora i dati delle consegne»). Ora
     una sessione non chiusa si chiude, coi suoi report, e poi il server si spegne.
     0127, gate del 27/10: è la × a sessione chiusa, e la conferma è del motore. */
  function doStop() {
    return window.MappAIModal.conferma({
      titolo: t('lv_end_t', 'Chiudere il pannello?'), icona: 'radio', conferma: t('lv_end', 'Chiudi pannello'),
      testo: t('lv_end_d', 'Il server si spegne: gli allievi non vedranno più il risultato e non potranno salvarlo. I report restano nella cartella della sessione.')
    }).then(function (si) { if (si) _fermaServer(); return !!si; });   // 0131: chi chiede sa se il server si è spento
  }
  function _fermaServer() {
    var aperta = LT.info && _fase() !== 'closed';
    var prima = aperta ? doClose(false) : Promise.resolve();
    prima.then(function () {
      stopPolling();
      if (window.electronAPI.liveStopSession) window.electronAPI.liveStopSession();
      LT.info = null; LT._lastStatus = null; LT._reports = null; _curPhase = null;   // la sessione dopo parte da zero
      LT._dashOpen = false; closeModal(); _chiudiFloat();
      toast(t('lv_stopped', 'Server fermato — i dati restano nella cartella della sessione'), 'success');
    });
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
      return '<div style="display:flex;align-items:center;gap:8px;background:#fff;border:1px solid var(--mm-bordo, #cbd5e1);border-radius:10px;padding:6px 10px">' +
        '<span style="font-size:18px">' + esc(r.emoji) + '</span><span style="font-weight:700;color:#4f46e5;width:26px">' + esc(r.num) + '</span>' +
        '<span style="flex:1;font-size:12px;color:var(--mm-testo, #404040)">' + esc(r.name || '') + '</span>' + status + relBtn + '</div>';
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
    /* kill-switch dello scambio con MappAI studente (7/9): il server parte senza le rotte */
    try { if (localStorage.getItem('mappai_scambio_studente') === '0') opts.scambio = false; } catch (e) { }
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
      ? files.map(function (f) { return '<div style="display:flex;align-items:center;gap:8px;background:#fff;border:1px solid var(--mm-bordo, #cbd5e1);border-radius:10px;padding:7px 10px;font-size:var(--mm-fs-testo)"><span style="flex:1;word-break:break-all">' + esc(f.file) + '</span><span style="color:var(--mm-testo-3, #64748b)">' + Math.max(1, Math.round(f.size / 1024)) + ' KB</span></div>'; }).join('')
      : '<div style="color:var(--mm-testo-3, #64748b);font-size:var(--mm-fs-testo)">' + t('lv_no_files', 'Nessun file. Aggiungine con il bottone qui sotto.') + '</div>';
    var body = '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:18px;align-items:start">' +
      '<div style="text-align:center">' + (qrSrc ? '<img id="lv-mqr" src="' + qrSrc + '" style="width:200px;height:200px;image-rendering:pixelated;border-radius:12px;border:1px solid var(--mm-bordo, #cbd5e1);cursor:zoom-in">' : '') +
      '<div style="font-size:var(--mm-ctl-fs);color:#475569;margin-top:6px;word-break:break-all">' + LT.matInfo.urls.map(esc).join('<br>') + '</div>' +
      (window.MappAINetMode ? window.MappAINetMode.lanLineHtml(LT.matInfo) : '') +
      '<div style="font-size:var(--mm-fs-label);color:var(--mm-testo-3, #64748b);margin-top:4px">' + t('lv_mat_hint', 'Gli allievi scaricano senza login') + '</div>' +
      '<div style="font-size:var(--mm-fs-label);color:var(--mm-testo-3, #64748b);margin-top:2px">' + t('lv_mat_app', 'Questo QR è per i telefoni. Per l\'app MappAI studente usa «Vault su iPad» in INSEGNA.') + '</div></div>' +
      '<div><div style="font-size:var(--mm-fs-sez);font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--mm-testo-3, #64748b);margin-bottom:8px">' + t('lv_files', 'File pubblicati') + '</div>' +
      '<div id="lv-filelist" style="display:flex;flex-direction:column;gap:5px">' + list + '</div></div></div>' +
      '<div style="display:flex;gap:8px;margin-top:16px;flex-wrap:wrap">' +
      actBtn('lv-madd', t('lv_add_file', 'Aggiungi file…'), '#4f46e5', '#fff') +
      actBtn('lv-mstop', t('lv_mstop', 'Ferma server materiali'), '#f1f5f9', '#64748b') +
      '<span style="flex:1"></span>' + actBtn('lv-mback', t('lv_back', 'Indietro'), 'var(--mm-neutro, #f1f4f8)', 'var(--mm-testo, #404040)') + '</div>';
    var ov = modal('folder-down', t('lv_mat_title', 'Invia file'), body, 'var(--mm-m)');   /* 0122 (Giacomo, 22/10): come la card */
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
  /* 0131: «Chiudi pannello» per chi ha un pannello suo (la Timeline «Costruisci»): stessa conferma, stesso
     spegnimento, `LT.info` azzerato. `{ chiusa: true }` = la sessione è già chiusa: `_fermaServer` non la
     richiude (un secondo /api/close e un secondo toast). Risponde se il server si è spento. */
  window.MappAILive.chiudiPannello = function (o) {
    if (o && o.chiusa) { LT._lastStatus = null; _curPhase = 'closed'; }
    return doStop();
  };
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
      '<div id="mai-stu-pdf" style="position:fixed;left:0;right:0;bottom:0;z-index:2147483000;background:#ffffff;border-top:1px solid var(--mm-bordo, #cbd5e1);box-shadow:0 -6px 18px rgba(15,23,42,.08);padding:10px 14px calc(10px + env(safe-area-inset-bottom));display:flex;flex-direction:column;align-items:center;gap:5px;font-family:system-ui,-apple-system,Segoe UI,sans-serif">' +
      '<div style="display:flex;gap:8px;width:100%;max-width:440px">' +
      '<button onclick="window.print()" style="flex:1;background:#4f46e5;color:#fff;border:none;border-radius:12px;padding:13px 14px;font-size:15px;font-weight:800;cursor:pointer">' + esc(label) + '</button>' +
      '<button onclick="window.__maiSaveHtml()" style="flex:1;background:#eef2ff;color:#4338ca;border:1px solid #c7d2fe;border-radius:12px;padding:13px 14px;font-size:15px;font-weight:800;cursor:pointer">' + esc(labelHtml) + '</button>' +
      '</div>' +
      '<div style="font-size:11.5px;color:var(--mm-testo-3, #64748b);text-align:center">' + esc(hint) + '</div>' +
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
    var isVault = /\.zip$/i.test(String(name || ''));   // il vault per l'app MappAI studente (0098)
    var qrSrc = qrDataUrl(url, 9);
    var body = '<div style="text-align:center">' +
      (qrSrc ? '<img id="lv-docqr" src="' + qrSrc + '" style="width:230px;height:230px;image-rendering:pixelated;border-radius:12px;border:1px solid var(--mm-bordo, #cbd5e1);cursor:zoom-in">' : '<div style="color:#b45309">QR non disponibile</div>') +
      '<div style="font-size:12px;color:#475569;margin-top:8px;word-break:break-all">' + esc(url) + '</div>' +
      (isVault ? '' : '<div style="font-size:11px;color:var(--mm-testo-3, #64748b);margin-top:4px">' + t('sd_qr_hint', 'Gli allievi inquadrano il QR e aprono il documento (nessun login)') + '</div>') +
      '<div style="font-size:11px;color:var(--mm-testo-3, #64748b);margin-top:2px">' + (isVault
        ? t('sd_qr_studente', 'Nell\'app MappAI studente: Docente › Ricevi un vault e inquadra il QR, oppure Inserisci link e scrivi questo indirizzo')
        : t('sd_qr_doc_telefoni', 'Questo QR è per i telefoni. Per l\'app MappAI studente usa «Vault su iPad» in INSEGNA.')) + '</div></div>' +
      '<div style="display:flex;gap:8px;margin-top:16px;justify-content:flex-end">' +
      actBtn('lv-docqr-close', t('lv_back', 'Indietro'), 'var(--mm-neutro, #f1f4f8)', 'var(--mm-testo, #404040)') + '</div>';
    var ov = modal('qr-code', isVault ? t('sd_qr_title_vault', 'Condividi Vault su iPad') : t('sd_qr_title', 'Condividi documento'), body, 'var(--mm-s)');
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
      /* il QR nomina la mappa (0109): il server dà il vault solo a `<token>-<chiave>`
         della mappa esposta, mai a un QR di documento né a quello di un'altra mappa */
      var fileUrl = base + '/files/' + encodeURIComponent(r.file) + '?s=' + info.token + '-' + window.MappAIFilesCore.chiaveVault(vaultName);
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
