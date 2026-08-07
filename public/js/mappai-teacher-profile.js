/*
 * mappai-teacher-profile.js — Profilo INSEGNANTE (lato docente)
 * ---------------------------------------------------------------------------
 * PRIMA SUPERFICIE MIGRATA AL MOTORE DEI MODALI (2/8/26). Il modale non è più
 * HTML scritto a mano con stili inline: è uno SCHEMA che `mappai-modal.js`
 * disegna. Da qui arrivano gratis taglia, contratto tastiera (ESC, Invio, focus
 * trap, ritorno del fuoco), ruoli dei bottoni e i token .mm-*.
 *
 * Nel passaggio entra il disegno della Cabina E1 (console-mockup, 2/8):
 *   - SEDI e MATERIE sono elenchi a cui si aggiungono voci: chi insegna in due
 *     istituti o in tre materie non deve più sceglierne una e correggere a mano;
 *   - «Ora di classe» sta FUORI dalle materie — non ha contenuti disciplinari e
 *     produce materiali di altro genere: dentro l'elenco l'AI la tratterebbe
 *     come una materia;
 *   - RUOLO «Docente di sostegno / OPI» è il gate dei profili individuali degli
 *     allievi: quei dati sono sensibili e si aprono dichiarando il ruolo che li
 *     giustifica.
 * `STORE.sezioni()` restituisce le sezioni: la console «Cabina» le monterà così
 * come sono, senza riscriverle.
 *
 * ⚠️ NON tocca appState.userProfile / allProfiles: quella è la taratura STUDENTE
 * (usata da mm/kg-extraction, tutor, study), gestita da mappai-user-profile.js.
 *
 * Store: localStorage 'mappai_teacher_profile'. Namespace: window.MappAITeacherProfile.
 * Caricare DOPO mappai-user-profile.js.
 */
(function () {
  'use strict';
  var LS = 'mappai_teacher_profile';
  var t = function (k, f) { return window.t ? window.t(k, f) : f; };
  function toast(m, k) { if (window.showToast) window.showToast(m, k || 'info'); else console.log(m); }

  var DEFAULT = {
    nickname: '', anno: '',
    sediMode: 'multi', sedi: [],
    disciplineMode: 'multi', discipline: [],
    oraDiClasse: false, oraDiClasseCls: '',
    ruolo: 'materia', sostegnoEnte: ''
  };

  function lista(v) {
    return (Array.isArray(v) ? v : []).map(function (s) { return String(s).trim(); }).filter(Boolean);
  }

  function clean(d) {
    d = d || {};
    return {
      nickname: d.nickname != null ? String(d.nickname) : '',
      anno: d.anno != null ? String(d.anno) : '',
      /* i due «Mode» restano per i profili scritti prima dell'elenco: non
         governano più niente (un elenco tiene una voce come ne tiene cinque),
         ma toglierli farebbe perdere il round-trip di uno store già su disco */
      sediMode: d.sediMode === 'single' ? 'single' : 'multi',
      sedi: lista(d.sedi),
      disciplineMode: d.disciplineMode === 'single' ? 'single' : 'multi',
      discipline: lista(d.discipline),
      oraDiClasse: !!d.oraDiClasse,
      oraDiClasseCls: d.oraDiClasseCls != null ? String(d.oraDiClasseCls) : '',
      ruolo: d.ruolo === 'sostegno' ? 'sostegno' : 'materia',
      sostegnoEnte: d.sostegnoEnte != null ? String(d.sostegnoEnte) : ''
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

  /* Helper letti dal resto dell'app (form classi → sede, generazione →
     disciplina, filtri di INSEGNA). Restituiscono TUTTE le voci: con l'elenco
     non esiste più un «modo singolo» che ne nascondeva le altre. */
  STORE.sediList = function () { return lista(STORE.get().sedi); };
  STORE.disciplineList = function () { return lista(STORE.get().discipline); };
  STORE.hasOraDiClasse = function () { return !!STORE.get().oraDiClasse; };
  STORE.hasMultiSedi = function () { return STORE.sediList().length > 1; };
  /* Il ruolo dichiarato è il gate dei profili individuali degli allievi. */
  STORE.isSostegno = function () { return STORE.get().ruolo === 'sostegno'; };

  // ── Lo schema ─────────────────────────────────────────────────────────────

  /* L'anno scolastico comincia in agosto: a settembre 2026 il default è
     2026/2027, a marzo 2027 è ancora quello. Un anno già scelto ma fuori
     dalla finestra resta in elenco — non si cancella la scelta di qualcuno. */
  function anniScolastici(scelto) {
    var d = new Date(), base = d.getMonth() >= 7 ? d.getFullYear() : d.getFullYear() - 1;
    var out = [];
    for (var i = -1; i <= 2; i++) out.push((base + i) + '/' + (base + i + 1));
    if (scelto && out.indexOf(scelto) < 0) out.unshift(scelto);
    return out;
  }

  function nomiClassi() {
    try {
      var l = (window.MappAIClasses && window.MappAIClasses.list) ? window.MappAIClasses.list() : [];
      return l.map(function (c) { return c.name; }).filter(Boolean);
    } catch (e) { return []; }
  }

  STORE.sezioni = function (S) {
    S = S || STORE.get();
    var sostegno = S.ruolo === 'sostegno';
    var classi = nomiClassi();

    var oraCampi = [{
      id: 'ora-classe', tipo: 'spunta', valore: !!S.oraDiClasse,
      etichetta: t('tp_ora', 'Sono docente di classe'),
      aiuto: t('tp_ora_aiuto', 'Aggiunge «Ora di classe» fra le materie selezionabili, con materiali non disciplinari.')
    }];
    /* la classe di riferimento si chiede solo a chi ha detto di averne una, e
       solo se esistono classi fra cui scegliere */
    if (S.oraDiClasse && classi.length) {
      oraCampi.push({
        id: 'ora-quale', tipo: 'scelta', valore: S.oraDiClasseCls,
        etichetta: t('tp_ora_quale', 'Classe di cui sei docente'),
        opzioni: [{ valore: '', etichetta: t('tp_nessuna', '— nessuna —') }].concat(classi)
      });
    }

    var ruoloCampi = [
      {
        id: 'ruolo-materia', tipo: 'radio', gruppo: 'ruolo', valore: !sostegno,
        etichetta: t('tp_ruolo_materia', 'Docente di materia'),
        aiuto: t('tp_ruolo_materia_aiuto', 'Si lavora per classe: mappe, materiali e attività sono della classe.')
      },
      {
        id: 'ruolo-sostegno', tipo: 'radio', gruppo: 'ruolo', valore: sostegno,
        etichetta: t('tp_ruolo_sostegno', 'Docente di sostegno / OPI'),
        aiuto: t('tp_ruolo_sostegno_aiuto', 'Sblocca i profili dei singoli allievi: taratura, misure compensative e materiali individuali.')
      }
    ];
    if (sostegno) {
      ruoloCampi.push({
        id: 'sostegno-ente', valore: S.sostegnoEnte,
        etichetta: t('tp_ente', 'Servizio o istituto di riferimento'),
        aiuto: t('tp_ente_aiuto', 'Compare nell’intestazione dei materiali individuali.')
      });
    }

    var sez = [
      {
        id: 'chi', titolo: t('tp_sez_chi', 'Chi sei'),
        campi: [
          { id: 'nome', valore: S.nickname, etichetta: t('tp_nome', 'Nome e cognome') },
          {
            id: 'anno', tipo: 'scelta', valore: S.anno,
            etichetta: t('tp_anno', 'Anno scolastico'), opzioni: anniScolastici(S.anno)
          }
        ]
      },
      {
        id: 'sedi', titolo: t('tp_sedi', 'Sedi'),
        campi: [{
          id: 'sedi', tipo: 'elenco', valori: S.sedi,
          etichetta: t('tp_sedi_lbl', 'Sedi in cui insegni'),
          aggiungi: t('tp_sedi_add', 'Aggiungi sede'),
          aiuto: t('tp_sedi_aiuto', 'Ogni classe dichiara la sua: qui stanno tutte quelle fra cui scegliere.')
        }]
      },
      {
        id: 'materie', titolo: t('tp_materie', 'Materie'),
        campi: [{
          id: 'materie', tipo: 'elenco', valori: S.discipline,
          etichetta: t('tp_materie_lbl', 'Materie che insegni'),
          aggiungi: t('tp_materie_add', 'Aggiungi materia'),
          aiuto: t('tp_materie_aiuto', 'Da qui vengono i nomi che compaiono in tutta l’app: nelle classi, nel chip di contesto e nelle cartelle su disco.')
        }]
      },
      { id: 'ora', titolo: t('tp_ora_sez', 'Ora di classe'), campi: oraCampi },
      { id: 'ruolo', titolo: t('tp_ruolo', 'Ruolo professionale'), largo: true, campi: ruoloCampi }
    ];

    if (sostegno) {
      sez.push({
        id: 'allievi', accento: true, largo: true,
        titolo: t('tp_allievi', 'Profili individuali degli allievi'),
        /* ⚠️ Prima diceva «non entrano mai nelle chiamate all'AI»: non è vero
           delle NOTE, che con la taratura attiva finiscono nel prompt
           (app.js → MappAITune.activeTuningBlock). Il nome dell'allievo, quello
           sì, non parte mai. Su una frase che parla di dati sensibili la
           precisione non è un dettaglio di stile. */
        testo: t('tp_allievi_testo', 'Attivi perché il ruolo dichiarato è «Docente di sostegno / OPI». I profili vivono sul tuo computer. Quando la taratura è attiva, nel prompt entrano età, grado e le note che scrivi qui — mai il nome dell’allievo.'),
        azioni: [{ id: 'apri-prof', etichetta: t('tp_allievi_apri', 'Gestisci profili'), icona: 'user-round' }]
      });
    }
    return sez;
  };

  function schema(S) {
    return {
      titolo: t('tp_title', 'Profilo insegnante'),
      sottotitolo: t('tp_sub', 'Sedi, materie e ruolo: da qui vengono i nomi che il resto dell’app usa'),
      icona: 'id-card',
      taglia: 'l', layout: 'due',
      /* dati in scrittura: il clic sul velo non deve buttare via il profilo */
      sporco: true, veloChiude: false,
      sezioni: STORE.sezioni(S),
      azioni: [
        { id: 'no', etichetta: t('tp_annulla', 'Annulla') },
        { id: 'salva', etichetta: t('tp_save', 'Salva profilo'), ruolo: 'primario', icona: 'save' }
      ],
      nota: t('tp_filters_note', 'Materie, sedi e ora di classe diventano filtri nella sezione Insegna.')
    };
  }

  /* I valori dei campi tornano dal motore già raccolti. Gli ELENCHI non sono
     campi di modulo: li tiene S, che è la fonte durante tutta la sessione. */
  function assorbi(S, v) {
    if (!v) return S;
    if (v.nome !== undefined) S.nickname = v.nome;
    if (v.anno !== undefined) S.anno = v.anno;
    S.oraDiClasse = !!v['ora-classe'];
    if (v['ora-quale'] !== undefined) S.oraDiClasseCls = v['ora-quale'];
    if (v['sostegno-ente'] !== undefined) S.sostegnoEnte = v['sostegno-ente'];
    S.ruolo = v['ruolo-sostegno'] ? 'sostegno' : 'materia';
    return S;
  }

  function elencoDi(S, chiave) { return chiave === 'sedi' ? S.sedi : S.discipline; }

  /* Le tre operazioni del profilo, esposte perché la console «Cabina» monta le
     STESSE sezioni: se le riscrivesse, due superfici che dicono la stessa cosa
     divergerebbero al primo ritocco. */
  STORE.assorbi = assorbi;
  STORE.salva = function (S) { STORE.data = clean(S); STORE.save(); return STORE.data; };
  /* «+» e «×» degli elenchi: la finestrella che chiede il valore è la stessa
     ovunque, e chi la usa deve solo dire cosa fare dopo. */
  STORE.comandoElenco = function (S, id, poi) {
    if (id.indexOf('__piu-') === 0) {
      var k = id.slice(6);
      return window.MappAIModal.chiedi({
        titolo: k === 'sedi' ? t('tp_sedi_add', 'Aggiungi sede') : t('tp_materie_add', 'Aggiungi materia'),
        etichetta: k === 'sedi' ? t('tp_sede_ph2', 'Nome della sede') : t('tp_disc_ph2', 'Nome della materia'),
        conferma: t('tp_aggiungi', 'Aggiungi')
      }).then(function (val) {
        val = String(val || '').trim();
        if (!val) return;
        var arr = elencoDi(S, k);
        if (arr.indexOf(val) < 0) arr.push(val);
        if (poi) poi();
      });
    }
    if (id.indexOf('__via-') === 0) {
      var resto = id.slice(6), i = resto.indexOf(':');
      if (i < 0) return;
      var arr2 = elencoDi(S, resto.slice(0, i)), j = arr2.indexOf(resto.slice(i + 1));
      if (j >= 0) { arr2.splice(j, 1); if (poi) poi(); }
    }
  };

  window.showTeacherProfileModal = function () {
    if (!window.MappAIModal) { toast(t('tp_no_engine', 'Motore dei modali non caricato.'), 'error'); return; }
    var S = clean(STORE.get());

    function suAzione(ev, box, ridisegna) {
      var id = ev.azione;
      assorbi(S, ev.valori);

      if (id === '__campo') {
        /* solo i campi che cambiano la FORMA della finestra la ridisegnano:
           farlo a ogni uscita da un campo la farebbe ballare sotto le dita */
        if (ev.campo === 'ruolo-materia' || ev.campo === 'ruolo-sostegno' || ev.campo === 'ora-classe') {
          ridisegna(schema(S));
        }
        return;
      }
      if (id.indexOf('__piu-') === 0) {
        var k = id.slice(6);
        window.MappAIModal.chiedi({
          titolo: k === 'sedi' ? t('tp_sedi_add', 'Aggiungi sede') : t('tp_materie_add', 'Aggiungi materia'),
          etichetta: k === 'sedi' ? t('tp_sede_ph2', 'Nome della sede') : t('tp_disc_ph2', 'Nome della materia'),
          conferma: t('tp_aggiungi', 'Aggiungi')
        }).then(function (val) {
          val = String(val || '').trim();
          if (!val) return;
          var arr = elencoDi(S, k);
          if (arr.indexOf(val) < 0) arr.push(val);
          ridisegna(schema(S));
        });
        return;
      }
      if (id.indexOf('__via-') === 0) {
        var resto = id.slice(6), i = resto.indexOf(':');
        if (i < 0) return;
        var arr2 = elencoDi(S, resto.slice(0, i)), j = arr2.indexOf(resto.slice(i + 1));
        if (j >= 0) { arr2.splice(j, 1); ridisegna(schema(S)); }
      }
    }

    var s = schema(S);
    s.suAzione = suAzione;
    window.MappAIModal.open(s).then(function (r) {
      if (!r || r.azione === 'no') return;            // annullato, ESC o velo
      assorbi(S, r.valori);
      STORE.data = clean(S); STORE.save();
      toast(t('tp_saved', 'Profilo insegnante salvato.'), 'success');
      /* «Gestisci profili» salva e passa la mano: i profili degli allievi sono
         un'altra superficie, e nessuno vuole perdere il profilo appena scritto
         per andarli a vedere */
      if (r.azione === 'apri-prof' && window.showUserProfileModal) window.showUserProfileModal();
    });
  };

  STORE.load();
  console.log('[MappAITeacherProfile] profilo insegnante caricato');
})();
