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
 *   - «Ora di classe» stava FUORI dalle materie — non ha contenuti disciplinari e
 *     produce materiali di altro genere. Dal 12/10/26 (0088, D3) non è più sullo
 *     schermo, come «Servizio o istituto di riferimento»: nessuno leggeva quei dati;
 *   - RUOLO «Docente di sostegno / OPI»: dal 12/10/26 non sblocca più niente (le
 *     schede allievo si creano con qualunque ruolo), mostra solo la scorciatoia
 *     «Gestisci profili».
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
      /* Un anno già scelto non si tocca. Vuoto vale «quello in corso»: è ciò che la
         tendina mostra già, e se lo store dicesse '' un profilo mai salvato risultava
         «modificato» al primo clic, con il falso «Uscire senza salvare?» (0088, D2). */
      anno: d.anno != null && String(d.anno) !== '' ? String(d.anno) : annoCorrente(),
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
  /* Il ruolo dichiarato non è più un gate (0088): resta la scorciatoia alle schede. */
  STORE.isSostegno = function () { return STORE.get().ruolo === 'sostegno'; };

  // ── Lo schema ─────────────────────────────────────────────────────────────

  /* L'anno scolastico comincia in agosto: a settembre 2026 il default è
     2026/2027, a marzo 2027 è ancora quello. Un anno già scelto ma fuori
     dalla finestra resta in elenco — non si cancella la scelta di qualcuno. */
  function annoBase() {
    var d = new Date();
    return d.getMonth() >= 7 ? d.getFullYear() : d.getFullYear() - 1;
  }
  function annoCorrente() { var base = annoBase(); return base + '/' + (base + 1); }
  function anniScolastici(scelto) {
    var base = annoBase();
    var out = [];
    for (var i = -1; i <= 2; i++) out.push((base + i) + '/' + (base + i + 1));
    if (scelto && out.indexOf(scelto) < 0) out.unshift(scelto);
    return out;
  }

  /* ⚠️ «Ora di classe» (spunta e classe) e «Servizio o istituto di riferimento»
     NON sono più sullo schermo (0088, D3): promettevano effetti — le materie con
     l'«Ora di classe», l'intestazione dei materiali individuali — che nessuno
     legge. I dati restano in `DEFAULT` e in `clean`, così un profilo già su
     disco non perde niente: è il precedente di `sediMode` e `disciplineMode`. */
  STORE.sezioni = function (S) {
    S = S || STORE.get();
    var sostegno = S.ruolo === 'sostegno';

    var ruoloCampi = [
      {
        id: 'ruolo-materia', tipo: 'radio', gruppo: 'ruolo', valore: !sostegno,
        etichetta: t('tp_ruolo_materia', 'Docente di materia'),
        aiuto: t('tp_ruolo_materia_aiuto', 'Si lavora per classe: mappe, materiali e attività sono della classe.')
      },
      {
        id: 'ruolo-sostegno', tipo: 'radio', gruppo: 'ruolo', valore: sostegno,
        etichetta: t('tp_ruolo_sostegno', 'Docente di sostegno / OPI'),
        aiuto: t('tp_ruolo_sostegno_aiuto', 'Mostra qui la scorciatoia alle schede dei singoli allievi. Le schede si creano comunque dalla voce «Allievi», con qualunque ruolo.')
      }
    ];

    var sez = [
      {
        /* «Chi sei» è larga, coi due campi affiancati: tolta «Ora di classe» (0088, D3) le tre sezioni piccole
           lasciavano un buco a destra di «Materie». Così «Sedi» e «Materie», i due elenchi, stanno in riga. */
        id: 'chi', titolo: t('tp_sez_chi', 'Chi sei'), largo: true, colonne: 2,
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
        testo: t('tp_allievi_testo', 'I profili vivono sul tuo computer. Quando la taratura è attiva, nel prompt entrano età, grado e le note che scrivi qui — mai il nome dell’allievo.'),
        /* `chiude:false`: senza, il motore conclude la finestra al clic e il «Uscire
           senza salvare?» non scatta mai. La Cabina porta alla voce «Allievi» (D1). */
        azioni: [{ id: 'apri-prof', etichetta: t('tp_allievi_apri', 'Gestisci profili'), icona: 'user-round', chiude: false }]
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
      nota: t('tp_filters_note', 'Materie e sedi diventano filtri nella sezione Insegna.')
    };
  }

  /* I valori dei campi tornano dal motore già raccolti. Gli ELENCHI non sono
     campi di modulo: li tiene S, che è la fonte durante tutta la sessione. */
  function assorbi(S, v) {
    if (!v) return S;
    if (v.nome !== undefined) S.nickname = v.nome;
    if (v.anno !== undefined) S.anno = v.anno;
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
        if (ev.campo === 'ruolo-materia' || ev.campo === 'ruolo-sostegno') {
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
    });
  };

  STORE.load();
  console.log('[MappAITeacherProfile] profilo insegnante caricato');
})();
