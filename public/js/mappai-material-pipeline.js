/*
 * mappai-material-pipeline.js — orchestratore UI della pipeline «Genera materiali» (011)
 * -----------------------------------------------------------------------
 * window.MappAIPipeline: modale di configurazione, pre-flight/stima, orchestratore
 * a step (A mappa → B quiz → C fogli nodi → D sintesi+voce), riepilogo/riprova.
 *
 * La logica pura (naming, manifest, transizioni, stima, validazioni) vive in
 * mappai-pipeline-core.js. Questo modulo fa SOLO orchestrazione + I/O via IPC.
 * main.js resta un wrapper sottile: qui l'assemblaggio dati, lì solo fs/finestre.
 */
(function () {
  'use strict';
  if (typeof window === 'undefined') return;

  function PC() { return window.MappAIPipelineCore; }
  function FC() { return window.MappAIFilesCore; }
  function _configRoot() { return document.getElementById('mp-modal') || document; }
  function _configElement(id) { const root = _configRoot(); return root === document || root.id === id ? document.getElementById(id) : root.querySelector('#' + id); }
  function _t(k, f) { return window.t ? window.t(k, f) : f; }
  function _state() { try { return (typeof appState !== 'undefined') ? appState : window.appState; } catch (e) { return window.appState; } }
  function _esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
  function _toast(m, t) { if (window.showToast) window.showToast(m, t || 'info'); }
  function _now() { try { return new Date().toISOString(); } catch (e) { return ''; } }
  function _icons() { if (window.safeCreateIcons) window.safeCreateIcons(); }
  function _clean(s) { return window.cleanLabel ? window.cleanLabel(s) : String(s || '').trim(); }

  const Pipeline = { _running: false, _interno: false, _identita: null };

  /* ══ IL LUCCHETTO (13/8) ═════════════════════════════════════════════════
     Da quando il velo copre la sola area di CREA, il docente può girare per
     l'app mentre la pipeline lavora — e potrebbe chiedere un'altra generazione.
     Due chiamate all'AI in parallelo non si romperebbero a vicenda, ma la
     seconda cambierebbe `appState` sotto i piedi della prima: è esattamente il
     guasto che questo giro chiude. Quindi finché la pipeline gira, l'app non
     accetta lavoro nuovo — e lo DICE, invece di non fare niente.
     ⚠️ `_interno` esiste perché lo step A chiama `startGeneration` da dentro:
     senza, la pipeline bloccherebbe sé stessa. Si alza e si abbassa attorno a
     quella chiamata, che parte in modo SINCRONO — nessun gesto dell'utente può
     infilarsi in mezzo e passare per interno. */
  Pipeline.occupata = function () { return !!Pipeline._running && !Pipeline._interno; };
  /* Aperta al banco (`tools/smoke/pipeline-lucchetto.js`): la regola più
     importante di questo modulo non si può provare dall'esterno senza una via
     d'accesso, e senza una prova torna a rompersi in silenzio. */
  Pipeline._sentinella = { identita: function () { return _identita(); }, controlla: function () { return _controllaIdentita(); } };
  Pipeline._branchMaterial = _branchMaterial;   // per il banco tools/smoke/evidenze-ramo.js
  window.mappaiOccupato = function () {
    /* ⚠️ Anche una generazione MM/KG NUDA occupa l'app (14/8): non passa da
       `Pipeline._running` (la pipeline è un'altra cosa) e fino a ieri i sedici
       guardiani sparsi per l'app — apri progetto, apri vault, importa, unisci,
       tutor, quiz, sintesi, timeline, espandi — non la vedevano. Una riga qui
       li copre tutti; il motivo lo dice `MappAIGen`, che sa anche COSA sta
       generando. */
    if (window.MappAIGen && window.MappAIGen.attiva()) {
      _toast(window.MappAIGen.motivo(), 'warning');
      return true;
    }
    if (!window.MappAIPipeline || !window.MappAIPipeline.occupata()) return false;
    _toast(_t('mp_busy_lock', 'Pipeline occupata, riprova più tardi.'), 'warning');
    return true;
  };

  /* ══ LA SENTINELLA D'IDENTITÀ ════════════════════════════════════════════
     IL DIFETTO CHE CHIUDE: la cartella di destinazione (`vaultPath`) si fissa
     all'inizio, ma i materiali si costruiscono LEGGENDO `appState` passo per
     passo — nodi, set di studio, titolo. Se nel frattempo la mappa aperta
     cambiava, i quiz della mappa NUOVA finivano nel vault della VECCHIA, in
     silenzio: nessun errore, file plausibili, cartella sbagliata.
     Il blocco del cambio mappa (in `_bloccoCaricamenti`) chiude la porta
     principale; questa è la rete sotto. Prima di ogni passo si controlla che la
     mappa sia ancora QUELLA — e se non lo è la pipeline si ferma e lo dice, con
     il manifesto già scritto su disco: da lì «Riprendi» ricomincia dal passo
     giusto. Fermarsi rumorosamente è l'unico esito onesto: proseguire vorrebbe
     dire scrivere materiali che non corrispondono a niente. */
  function _identita() {
    var st = _state() || {};
    return {
      titolo: st.rootNodeLabel || '',
      vault: st.activeVaultPath || '',
      nodi: ((st.db && st.db.nodes) || []).length,
      progetto: (typeof StorageManager !== 'undefined' && StorageManager.currentProjectId) || ''
    };
  }
  function _controllaIdentita() {
    var a = Pipeline._identita, b = _identita();
    if (!a) return;
    /* Il NUMERO dei nodi non entra nel confronto: la pipeline stessa lo cambia
       (i set di studio finiscono in `db.studySets`, e certi passi ritoccano il
       grafo). Contano il titolo, la cartella e l'id del progetto — cioè
       l'identità, non il contenuto. */
    /* NFC sul nome della cartella: il vault arriva dal disco (accento
       scomposto) e il confronto con quello in memoria (composto) direbbe
       «mappa cambiata» su una mappa che non è cambiata — e la pipeline si
       fermerebbe a metà per niente (guida §8.25). */
    var _n = (x) => (window.MappAITeachCore && window.MappAITeachCore.nfc)
      ? window.MappAITeachCore.nfc(x) : String(x == null ? '' : x);
    if (a.titolo === b.titolo && _n(a.vault) === _n(b.vault) && a.progetto === b.progetto) return;
    throw new Error(_t('mp_mappa_cambiata',
      'La mappa aperta è cambiata mentre la pipeline lavorava: mi fermo qui per non scrivere i materiali nella cartella sbagliata. Riapri quella mappa e usa «Riprendi».'));
  }


  // ── Stato mappa: rami L1 (MindMap) / hub (KG) ──────────────────────────
  function _branchNodes() {
    const db = _state().db || {};
    const nodes = db.nodes || [];
    const isMM = _state().extractionMode === 'mindmap';
    let branches = isMM ? nodes.filter(n => (n.level || 0) === 1) : nodes.filter(n => (n.level || 0) <= 1);
    if (!branches.length && nodes.length) branches = [nodes[0]];
    return branches;
  }
  /* Quante frasi di CONTENUTO ha la fonte di questa generazione. Le conta
     l'àncora coi suoi filtri di sempre (≥5 parole, via intestazioni ricorrenti e
     consegne degli esercizi): è il denominatore del budget, e deve essere lo
     stesso numero che l'àncora userà poi per la copertura — un secondo conteggio
     scritto qui divergerebbe al primo ritocco (inv. 6).
     Senza fonte leggibile torna {} e il budget dice «sconosciuto» invece di
     inventare un verdetto. */
  function _fonteStats() {
    try {
      const A = window.MappAIAnchorCore;
      if (!A || typeof A.frasiDaPagine !== 'function') return {};
      const src = (window.MappAIReview && window.MappAIReview.sources && window.MappAIReview.sources())
        || _state()._generationSources || _state().sources || [];
      const pagine = [];
      (src || []).forEach(o => {
        if (typeof o === 'string') { pagine.push({ n: 0, text: o }); return; }
        const pp = (o && o.pages && o.pages.length) ? o.pages : [{ n: (o && o.page) || 0, text: (o && (o.content || o.text)) || '' }];
        pp.forEach(pg => pagine.push({ n: pg.n || pg.page || 0, text: pg.text || pg.content || '' }));
      });
      if (!pagine.some(pg => String(pg.text || '').trim())) return {};
      return { frasi: A.frasiDaPagine(pagine).length };
    } catch (e) { return {}; }
  }

  function _mapStats() {
    const nodes = (_state().db && _state().db.nodes) || [];
    return { branches: _branchNodes().length, nodes: nodes.length, willGenerateMap: true };
  }
  function _mapName() {
    return _state().rootNodeLabel || (window._getTimelineProjectName ? window._getTimelineProjectName() : 'MappAI') || 'MappAI';
  }

  // Materiale di studio del ramo: nodo + discendenti (label: desc), come il quiz in-app.
  /* ⚠️ UN RAMO PUÒ DICHIARARE IL SUO MATERIALE (20/8). Serve alle sorgenti che
     non vengono dalla mappa — oggi una FOTOGRAFIA letta dal motore locale, di
     cui il materiale è la scheda che il docente ha corretto. Il ramo finto la
     porta in `_materiale` e qui si crede a lui: senza, `getDescendants` di un
     id che nella mappa non esiste tornerebbe vuoto e il materiale sarebbe una
     riga sola col titolo. */
  function _branchMaterial(branch) {
    if (branch && typeof branch._materiale === 'string') return branch._materiale.slice(0, 12000);
    const kids = (window.getDescendants ? window.getDescendants(branch.id) : []) || [];
    const all = [branch].concat(kids);
    /* Le evidenze (ADR 0002, passo 3): con l'interruttore acceso e un indice in memoria il
       materiale del ramo è il pacchetto di frasi vere della fonte, non le desc con i passaggi.
       Un ramo di cui la fonte non parla resta SENZA materiale e il giro lo salta (riga 831):
       è la fedeltà che si misura al passo 6, non un guasto da coprire con le desc. */
    const EV = window.MappAIEvidence;
    if (EV && EV.acceso && EV.acceso() && EV.indice && EV.indice() && typeof EV.materialeRamo === 'function') {
      const r = EV.materialeRamo(all);
      if (r) {
        console.info('[Evidenze] ' + _clean(branch.label) + ': ' + r.unita + ' unità, ' + r.scartate + ' scartate, ' + r.caratteri + ' car' + (r.unita ? '' : ' · ramo senza evidenze: salta'));
        return r.materiale;
      }
    }
    const srcs = window.MappAIReview ? window.MappAIReview.sources() : _state().sources;
    if (window.MappAIGroundingCore) {
      const res = window.MappAIGroundingCore.buildInput(_state().db, all, srcs,
        window.MappAIReview && window.MappAIReview.current(), { passaggi: _passaggiDelRamo(all, srcs) });
      /* Si dice quanti ne sono entrati: senza questa riga il capovolgimento
         tornerebbe in silenzio il giorno in cui le fonti non arrivano più fin qui
         (su un progetto riaperto dal vault le pagine ci sono solo se torna anche
         `pipeline.json`). Zero passaggi su una fonte che esiste è un sintomo. */
      console.info('[Passaggi] ' + _clean(branch.label) + ': +' + res.sourceCoverage.passaggiAggiunti +
        ' dalla fonte (' + res.sourceCoverage.originalPagesAvailable + ' pagine disponibili) · materiale ' + res.material.length + ' car');
      return res.material;
    }
    return all.map(n => _clean(n.label) + ': ' + (n.desc || n.content || '')).join('\n');
  }

  /* ── LE FRASI DELLA FONTE CHE PARLANO DI QUESTO RAMO (16/9/26) ─────────────
     Il materiale di un ramo era: le desc dei suoi nodi + le citazioni che
     l'àncora aveva attaccato a quei nodi. Due testi che si somigliano per
     costruzione (vedi il commento lungo in `mappai-grounding-core.js`), e una
     fonte che resta fuori: sui due progetti «Officina» solo 59-61 frasi di
     contenuto su 120 finiscono in una citazione — metà del PDF non arriva a
     nessun generatore.
     Qui si chiede a `cercaBM25` — la stessa funzione del pannello di ricerca,
     misurata al 88,9%/96,3% di Recall@5 — dove si parla di questo ramo, con una
     query corta fatta delle ETICHETTE dei suoi nodi. Misurato per ramo sui tre
     progetti veri: +11% / +67% di materiale, e da 13 a 95 parole di contenuto
     che il generatore non aveva mai visto — «carbone, derivati del petrolio,
     materie prime», «30 agosto 1939», «la convenzione dell'Aia consente agli
     stati neutrali il libero commercio». Sono esattamente gli appigli che un
     ANGOLO diverso dalla definizione può mordere.
     `buildInput` le verifica contro le pagine archiviate: quello che qui è un
     elenco di candidati, di là diventa una citazione o niente.
     ⚠️ `n: i` invece del numero di pagina vero: a `frasiDaPagine` serve solo che
     due pagine diverse abbiano indici diversi (riconosce le intestazioni dalla
     frase che torna su tre pagine), e la pagina vera la ritrova `buildInput`. */
  const PASSAGGI_PER_RAMO = 8;
  function _passaggiDelRamo(nodi, srcs) {
    if (localStorage.getItem('mappai_passaggi_ramo') === '0') return [];
    const A = window.MappAIAnchorCore, G = window.MappAIGroundingCore;
    if (!A || !A.cercaBM25 || !G) return [];
    try {
      const pagine = G.sourcePages(srcs).map((p, i) => ({ n: i, text: p.text }));
      if (!pagine.length) return [];
      const query = nodi.map(n => _clean(n.label)).join(' ');
      return A.cercaBM25(A.frasiDaPagine(pagine), query, { max: PASSAGGI_PER_RAMO }).map(h => h.text);
    } catch (e) {
      console.warn('[Pipeline] passaggi del ramo non recuperati:', e);
      return [];
    }
  }

  // ── Conversione item quiz → forma stampabile (question/correctIndex) ────
  // generateDynamicQuiz produce { q, options, correct(str), explanation }; il
  // builder PDF legge { question, options, correctIndex }. In-app resta la forma q/correct.
  function _toPrintItems(items) {
    return (items || []).map(it => {
      const opts = Array.isArray(it.options) ? it.options : [];
      let ci = -1;
      const corr = String(it.correct == null ? '' : it.correct).trim().toLowerCase();
      for (let i = 0; i < opts.length; i++) { if (String(opts[i]).trim().toLowerCase() === corr) { ci = i; break; } }
      if (ci < 0) { const nn = parseInt(it.correct, 10); if (!isNaN(nn) && nn >= 1 && nn <= opts.length) ci = nn - 1; }
      return Object.assign({}, it, { question: it.q || it.question || '', options: opts, correctIndex: ci, explanation: it.explanation || '', answer: it.correct });
    });
  }
  function _flashToPrintItems(items) {
    return (items || []).map(it => Object.assign({}, it, { question: it.front || it.q || '', answer: it.back || it.correct || '', explanation: it.explanation || '' }));
  }

  /* ── LA CARTELLA SI ADOTTA, NON SI SCRIVE E BASTA (11/9/26) ──────────────
     Qui c'era `_state().activeVaultPath = vaultPath;` e nient'altro, in due
     punti. Il percorso veniva scritto, ma NON `activeVaultClassDir` /
     `activeVaultDiscDir` né l'identità del progetto — e `StorageManager
     .adottaVault` esiste dal 15 agosto proprio per questo: il suo commento dice
     «erano il residuo della mappa precedente, e l'autosave li congelava nella
     voce sbagliata».

     CHE COSA È COSTATO (mappa «SVIZZERA e 2a GM», 11 settembre, misurato sui
     file). La generazione aveva prodotto sei macro-aree. Nel vault, alla fine,
     c'erano 14 nodi — ed erano quelli di UN'ALTRA MAPPA, del 9 settembre: i
     `set-*.json` salvati alle 09:40 portano dentro le date del 9/9 21:22-21:28.
     Due progetti si contendevano la stessa cartella e ha vinto il vecchio,
     perché `progettoDelVault` (mappai-teach-core.js) sceglie per POSIZIONE
     (vault + classe + disciplina) e poi per data: un progetto la cui posizione
     non è mai stata registrata perde contro uno che ce l'ha.

     La stessa mancanza spiega il secondo sintomo, il messaggio rosso «la mappa è
     cambiata mentre la pipeline lavorava»: l'identità si fotografa poco più
     sotto (`Pipeline._identita = _identita()`), e fotografare un id di progetto
     che non è ancora stato deciso significa vederlo cambiare al passo dopo.
     Una causa sola, due guasti.

     ⚠️ `adottaVault` è asincrona e va attesa PRIMA della fotografia. */
  async function _adottaLaCartella(vaultPath) {
    _state().activeVaultPath = vaultPath;
    try {
      if (typeof StorageManager !== 'undefined' && StorageManager.adottaVault) {
        await StorageManager.adottaVault(vaultPath, _state());
      }
    } catch (e) { if (_state()._reviewRequested || _state()._pipelineManifest?.review) throw e; console.warn('[Pipeline] adozione della cartella non riuscita:', e && e.message); }
  }

  // ── IPC helpers ─────────────────────────────────────────────────────────
  // le due basi (Mappe e Allievi) arrivano insieme: quale delle due si usa lo
  // decide il contesto attivo, non il chiamante
  let _basi = null;
  async function _mapsBase() { _basi = await window.electronAPI.filesRootGet(); return _basi.mapsBaseDir; }
  async function _writeManifest(vaultPath, manifest) {
    let r;
    try { r = window.MappAIReview ? await window.MappAIReview.writeManifest(vaultPath, manifest)
      : await window.electronAPI.saveVaultFile({ vaultPath, relPath: 'pipeline.json', text: JSON.stringify(manifest, null, 2), expectedVersion: manifest._storageVersion || 0 });
      if (!r || !r.ok) throw new Error((r && r.error) || 'Salvataggio pipeline non riuscito');
    } catch (error) { error.code = 'REVIEW_PERSISTENCE_FAILED'; throw error; }
    if (r.version != null) manifest._storageVersion = r.version;
    /* Il manifest si riscrive a OGNI transizione di step: è il punto che sa
       sempre che sul disco è comparso qualcosa di nuovo, quindi è da qui che si
       avvisa chi mostra elenchi (9/8). Le notifiche si raggruppano nel canale,
       quindi otto file di fila non fanno otto ridisegni. */
    try { if (window.MappAIVaults) window.MappAIVaults.segnala('materiali-generati', { vaultPath: vaultPath }); } catch (e) { }
    return r;
  }
  function _recordFile(manifest, step, relPath) {
    const m = JSON.parse(JSON.stringify(manifest));
    const gia = m.steps[step].files || [];
    /* Lo STESSO percorso non si annota due volte. `stepTransition` azzera la
       lista a ogni tentativo, quindi fra un tentativo e l'altro non ci sono
       doppioni; ma dentro un solo passo un file può essere riscritto — la
       sintesi lo è, per agganciare la voce — e senza questa guardia il
       riepilogo conterebbe un materiale che sul disco non esiste. */
    m.steps[step].files = (gia.indexOf(relPath) >= 0) ? gia : gia.concat([relPath]);
    m.updatedAt = _now();
    return m;
  }
  /* Qui stava `_conEstensione`, che allineava l'estensione del file audio a
     quella del blob: `buildFileName('tts', …)` promette `.mp3`, ma la voce torna
     in WAV quando l'encoder lamejs non è caricato, e un WAV dentro un file
     `.mp3` è una bugia che paga chi apre il documento.
     Dal 10/8 non serve più: l'audio non si scrive come file a sé — vive dentro
     l'HTML con la voce, dove il tipo viaggia nel `data:` URI e lo dichiara
     `audio.mime`, che è la fonte giusta per la stessa ragione di prima. */
  function _blobToB64(blob) {
    return new Promise((res, rej) => {
      const fr = new FileReader();
      fr.onload = () => { const s = String(fr.result); res(s.slice(s.indexOf(',') + 1)); };
      fr.onerror = rej;
      fr.readAsDataURL(blob);
    });
  }

  // Cartella vault della mappa dentro il contenitore di classe, con suffisso su collisione.
  async function _resolveFolderPath(cls) {
    const base = await _mapsBase();
    /* Senza classe → null: il contenitore lo decide FilesCore.mapVaultParents
       (dal 15/8 sera «Generico»). Prima qui usciva 'Senza classe' — un
       contenitore che get-all-vaults leggeva come una classe fantasma. */
    const classFolder = cls ? FC().mapClassFolder(cls.sede, cls.name) : null;
    // Livello disciplina (29/7): quella della generazione in corso se coerente con
    // la classe scelta nel modale della pipeline, altrimenti l'unica della classe.
    let discName = '';
    try {
      const CL = window.MappAIClasses;
      if (cls && CL) {
        const choices = CL.disciplineChoices ? CL.disciplineChoices(cls) : [];
        const cur = _state().generationDiscipline || (CL.activeDiscipline ? CL.activeDiscipline() : '');
        if (choices.length === 1) discName = choices[0];
        else if (cur && choices.indexOf(cur) >= 0) discName = cur;
      }
    } catch (e) { discName = ''; }
    const discFolder = FC().disciplineFolder(discName);
    const vaultName = FC().vaultFolderName(_state().rootNodeLabel);
    let siblings = [];
    try {
      const all = await window.electronAPI.getAllVaults();
      siblings = (all || []).filter(v => (v.classDir || null) === (classFolder || null) && (v.discDir || '') === (discFolder || '')).map(v => v.folderName);
    } catch (e) { siblings = []; }
    let finalName = vaultName;
    if (siblings.indexOf(vaultName) >= 0) {
      const seq = FC().sessionSeq(siblings, vaultName, ' · ');
      const n = Math.max(2, (seq.maxSeq || 0) + 1);
      finalName = vaultName + ' · ' + String(n).padStart(2, '0');
    }
    /* Con un profilo ALLIEVO attivo la mappa (e i suoi materiali) vivono nella
       sua cartella, non fra quelle di classe — stessa regola dell'auto-vault. */
    let allievo = '';
    try { const CL2 = window.MappAIClasses; allievo = (CL2 && CL2.activeStudentName) ? CL2.activeStudentName() : ''; } catch (e) { allievo = ''; }
    const radice = FC().mapVaultRoot
      ? FC().mapVaultRoot({ maps: base, students: _basi && _basi.studentsBaseDir }, allievo)
      : base;
    const parents = FC().mapVaultParentsFor
      ? FC().mapVaultParentsFor(allievo, classFolder, discFolder)
      : FC().mapVaultParents(classFolder, discFolder);
    return [radice].concat(parents, [finalName]).join('/');
  }

  // ── Overlay progressivo ──────────────────────────────────────────────────
  /* ══ IL VELO STA NELL'AREA DI CREA, NON SULLO SCHERMO (13/8) ═════════════
     Richiesta di Giacomo: mentre la pipeline lavora — e può volerci qualche
     minuto — il docente deve poter passare a ELABORA o INSEGNA. Con un velo
     `position:fixed` a tutto schermo l'app era bloccata: nemmeno la topbar si
     raggiungeva.
     ⚠️ Non si disegna un secondo velo: si SPOSTA quello vero dentro il
     contenitore di CREA e gli si mette `--in-area` (position:absolute). Così
     restano il suo cronometro e i suoi messaggi che ruotano — e, soprattutto,
     quando CREA viene nascosta il velo sparisce CON LEI, senza una riga di
     codice che lo sappia: è il contenitore a governarlo. Alla fine torna dove
     stava, come i comandi delle impostazioni AI nella Cabina. */
  var _veloSegno = null;
  /* ⚠️ Una sola implementazione, in `mappai-generazione.js`: la usano la
     pipeline E le generazioni MM/KG nude. Due copie si sarebbero contese lo
     stesso nodo (`#loading-overlay`) e il suo segnaposto di ritorno. */
  /* `_veloLibero`: chi lancia la pipeline da FUORI CREA (la rigenerazione del
     dossier parte da ELABORA) lo alza — il velo resta a tutto schermo invece
     di sparire dentro `#build-content`, che lì è nascosto (trappola nota). */
  Pipeline._veloLibero = false;
  function _veloNellArea() { if (Pipeline._veloLibero) return; if (window.MappAIGen) window.MappAIGen.veloNellArea(); }
  function _veloACasa() { if (window.MappAIGen) window.MappAIGen.veloACasa(); }
  /* `nome` = che cosa si sta creando, per l'indicatore nella barra in alto
     (`mappai-lavori.js`). Il velo lo dice a modo suo («Genero le domande…»);
     nella barra serve il NOME del materiale, che è quello che si sta
     aspettando — e dal 13/8 il velo vive dentro l'area di CREA, quindi chi si
     sposta altrove non lo vede più. */
  function _overlay(msg, nome) {
    if (!window.showLoadingOverlay) return;
    if (msg === false) { window.showLoadingOverlay(false); _veloACasa(); return; }
    _veloNellArea();
    window.showLoadingOverlay(true, msg, 'default', nome);
  }
  function _setContext(sub) { if (window.MappAIUsage) window.MappAIUsage.setContext('pipeline', sub); }

  // ══════════════════════════════════════════════════════════════════════
  // STEP B — quiz / flashcard per ramo, un set (e un PDF) per tipo
  // ══════════════════════════════════════════════════════════════════════
  async function _genFlashcards(material, nodeLabel, quantity, apiKey, opts) {
    opts = opts || {};
    const nonce = window.quizNonce ? window.quizNonce() : String(Date.now());
    // Vincolo di stampa nel prompt: genera già corto invece di far accorciare
    // tutto al docente dopo (e vieta URL/formule, che sulla carta non entrano).
    const PLx = window.MappAIPrintLayout;
    const regola = PLx ? PLx.promptRule(PLx.flashGeom(), null, window.getMapLanguage ? window.getMapLanguage() : 'it') : '';
    /* L'ANGOLO (20/8): il blocco sta FUORI e PRIMA del template — vale anche
       per chi ha un prompts_config.json personale — e scavalca la riga
       «VARIA il tipo» che il template porta dentro (vedi flashcardAngleBlock). */
    const blocco = (opts.angolo && window.flashcardAngleBlock) ? window.flashcardAngleBlock(opts.angolo) : '';
    const prompt = (blocco ? blocco + '\n\n' : '') +
      window.fillPromptTemplate('FLASHCARD_GENERATOR', { quantity, nodeLabel, nonce }) + regola;
    /* ⚠️ `maxItems` E budget di uscita, tutti e due (regola 05). Uno schema array
       senza tetto fa riempire l'array fino al budget, e senza `maxOutputTokens`
       il budget è il massimo del modello. Misurato l'11/9 sul registro consumi di
       Giacomo: due chiamate delle domande aperte con **63.437 e 63.493 token di
       uscita** contro i 400-700 normali — il modello ha scritto fino a esaurire
       i 65.536 di gemini-2.5-flash, e quella risposta è poi arrivata troncata.
       Le stesse due righe mancavano anche qui.
       ⚠️ Il tetto lo mette `maxItems`, NON il budget: una volta che il numero di
       item è vincolato, il budget deve solo essere abbastanza largo da non
       tagliare. Vedi `_genOpenQuestions` per che cosa succede quando è stretto. */
    const quante = Math.max(1, parseInt(quantity, 10) || 5);
    const schema = { type: 'ARRAY', maxItems: quante, items: { type: 'OBJECT', properties: { front: { type: 'STRING' }, back: { type: 'STRING' } }, required: ['front', 'back'] } };
    let payload = { contents: [{ parts: [{ text: prompt + '\n\nMateriale:\n' + material }] }], generationConfig: { temperature: window.QUIZ_TEMPERATURE || 0.7, maxOutputTokens: window.getMaxOutputTokens(quante * 160 + 600), responseMimeType: 'application/json', responseSchema: schema, _respectTemp: true } };
    if (window.injectClassTuning) payload = window.injectClassTuning(payload);
    const resp = await window.fetchModelAPI(payload, apiKey);
    const raw = resp && resp.candidates && resp.candidates[0] && resp.candidates[0].content.parts[0].text || '';
    const arr = window.salvageTruncatedJSON(raw.split('```json').join('').split('```').join('').trim());
    return Array.isArray(arr) ? arr.slice(0, quante) : [];
  }

  /* Le DOMANDE APERTE (11/8/26). Stesso schema di `_genFlashcards`: prompt dal
     pannello admin (`OPEN_QUESTIONS_GENERATOR`, categoria STUDY) e ripiego
     inline se il template manca — un vault vecchio o un `prompts_config.json`
     personalizzato non devono far fallire uno step.
     ⚠️ La MACRO-AREA non si chiede all'AI e non passa da un resolver: qui il
     ramo lo sappiamo già, è quello per cui stiamo generando (`_branchNodes`).
     Chiederlo al modello vorrebbe dire poter ricevere un nome che nella mappa
     non esiste. */
  /* ── IL RAMO COMPAGNO ─────────────────────────────────────────────────────
     Le domande aperte possono coinvolgere DUE macro-aree (Giacomo, 11/8): è ciò
     che le rende domande di ragionamento invece che di richiamo — «confronta»,
     «spiega come X influisce su Y» pretendono che due pezzi della mappa si
     tocchino.
     Il secondo ramo NON si chiede all'AI e non si prende a caso: si prende
     quello che nella MAPPA è davvero collegato al primo — si contano i link fra
     i due sottoalberi (i cross-link di un KG, i rimandi di una MindMap) e vince
     il più connesso. A pari merito, e quando nessun collegamento esiste, il
     ramo successivo: due aree vicine nell'ordine della mappa sono quasi sempre
     due aree che si parlano, ed è meglio di un accostamento casuale.
     ⚠️ Deterministico: la stessa mappa dà sempre le stesse coppie. */
  function _ramoCompagno(branch, branches) {
    if (!branches || branches.length < 2) return null;
    const idx = branches.findIndex(b => b.id === branch.id);
    const succ = branches[(idx + 1) % branches.length];
    try {
      const db = _state().db || {};
      const links = db.links || [];
      const setOf = (b) => {
        const kids = (window.getDescendants ? window.getDescendants(b.id) : []) || [];
        const s = new Set([b.id]);
        kids.forEach(n => s.add(n.id));
        return s;
      };
      const mio = setOf(branch);
      const idOf = (x) => (x && typeof x === 'object') ? x.id : x;
      let best = null, bestN = 0;
      branches.forEach(alt => {
        if (alt.id === branch.id) return;
        const suo = setOf(alt);
        let n = 0;
        links.forEach(l => {
          const a = idOf(l.source), b2 = idOf(l.target);
          if ((mio.has(a) && suo.has(b2)) || (suo.has(a) && mio.has(b2))) n++;
        });
        if (n > bestN) { bestN = n; best = alt; }
      });
      if (best) return best;
    } catch (e) { /* la mappa non si lascia interrogare: resta il successivo */ }
    return succ && succ.id !== branch.id ? succ : null;
  }

  /* ── I DOPPIONI DENTRO IL FOGLIO (difetto 8, 11/9) ───────────────────────
     Ogni ramo viene generato da una chiamata che non sa che cosa hanno prodotto
     le altre. Misurato su una cartella vera: nel foglio «causa» TRE domande su
     dodici chiedevano perché fu adottato il Piano Wahlen, e altre tre perché fu
     accettato l'oro nazista. Il codice di variazione nel prompt fa cambiare la
     formulazione, non l'argomento.
     Si pota QUI, dove il foglio è completo e si vedono tutti i rami insieme —
     dentro la singola chiamata il doppione non esiste ancora.
     ⚠️ NON si confrontano fogli di ANGOLI diversi: «Che cos'è il razionamento»
     e «Perché fu introdotto il razionamento» si somigliano molto ed è esattamente
     ciò che i sette angoli devono produrre. Il confronto resta dentro il foglio. */
  /* La lunghezza della risposta giusta, misurata sul FOGLIO intero (12/9): è la
     granularità giusta, perché il difetto è statistico e una singola chiamata
     per ramo non lo mostra. Si dice al docente solo quando lo scarto dal caso è
     largo: con tre opzioni la risposta esatta è la più lunga un terzo delle
     volte anche quando nessuno bara. */
  function _guardaLunghezze(raw, etichetta) {
    try {
      const PCv = PC();
      if (!PCv || !PCv.corretteTroppoLunghe) return;
      const r = PCv.corretteTroppoLunghe(raw);
      if (r.tot < 6) return;
      if (r.quota - r.atteso < 0.2) return;
      console.warn('[Materiali] ' + etichetta + ': la risposta esatta è la più lunga in ' +
        r.n + ' domande su ' + r.tot + ' (' + Math.round(r.quota * 100) + '%, per caso sarebbe ' +
        Math.round(r.atteso * 100) + '%) — si riconosce senza leggere');
      _toast(_t('mp_lung', 'In «{f}» la risposta giusta è la più lunga in {n} domande su {t}: controllale')
        .replace('{f}', etichetta).replace('{n}', r.n).replace('{t}', r.tot), 'warning');
    } catch (e) { /* la misura è un di più */ }
  }

  function _potaDoppioni(raw, etichetta) {
    try {
      const PCv = PC();
      if (!PCv || !PCv.deduplicaDomande) return raw;
      const r = PCv.deduplicaDomande(raw);
      if (r.scartati.length) {
        console.warn('[Materiali] ' + etichetta + ': ' + r.scartati.length +
          ' domande doppie tolte dal foglio');
        r.scartati.forEach(x => console.warn('   · «' + String(x.q).slice(0, 70) + '»'));
      }
      return r.items;
    } catch (e) { return raw; }
  }

  function _complementaryQuestions(type, branchLabel, manifest) {
    if (type !== 'mc' && type !== 'open') return [];
    const other = type === 'mc' ? 'open' : 'mc';
    const drafts = manifest && manifest.review && manifest.review.drafts && manifest.review.drafts.B;
    let sets = drafts ? Object.values(drafts).filter(s => s.type === other) : [];
    if (!manifest) {
      sets = ((_state().db || {}).studySets || []).filter(s => s && s.type === _QT[other].typeLabel);
      if (other === 'open') {
        const docs = window.MappAIStudyDocs, print = window.MappAIQuizPrint;
        if (docs && docs.list && print && print.setFromHtml) {
          (docs.list() || []).filter(d => d.kind === 'quizpaper' && d.mapName === _mapName()).forEach(d => {
            const full = docs.get ? docs.get(d.id) : d;
            const set = full && print.setFromHtml(full.html);
            if (set && set.type === _QT.open.typeLabel) sets.push(set);
          });
        }
      }
    } else if (!drafts) {
      sets = ((_state().db || {}).studySets || []).filter(s => s && s._pipeline && s.type === _QT[other].typeLabel);
    }
    return sets.flatMap(s => s.items || []).filter(Boolean).filter(it => {
      const areas = it.areas || [];
      return it.ramo === branchLabel || it.l1 === branchLabel || areas.indexOf(branchLabel) >= 0;
    });
  }

  function _withoutCrossFormatCopies(items, related) {
    const result = PC().removeCrossFormatCopies(items, related);
    if (result.removed.length) _toast(_t('mp_cross_format_copies', '{n} domande identiche all’altro formato escluse. Controlla la copertura del lotto.')
      .replace('{n}', result.removed.length), 'warning');
    return result.items;
  }

  /* Che cosa si chiede in «criteri»: elementi SPUNTABILI, non una risposta. */
  function _bloccoCriteri() {
    var en = (typeof window.getPromptLanguage === 'function') && window.getPromptLanguage() === 'en';
    return en
        ? 'SHAPE OF THE MARKING GUIDE: write "traccia" as 2 or 3 SHORT sentences, each one a single element a teacher can tick off on its own — «Names X.» «Links X to Y.» «Gives an example taken from the source.» One sentence, one element, full stop at the end of each. That is what lets a teacher give partial credit to an answer that is half right. Never write one long sentence containing everything.'
        : 'FORMA DELLA TRACCIA DI CORREZIONE: scrivi la «traccia» come 2 o 3 frasi BREVI, ognuna un elemento che il docente può spuntare da solo — «Nomina X.» «Collega X a Y.» «Porta un esempio preso dalla fonte.» Una frase, un elemento, punto fermo alla fine di ognuna. È questo che permette di dare un punteggio parziale a una risposta giusta a metà. Non scrivere mai un unico periodo lungo che contiene tutto.';
  }

  /* Le etichette dei nodi che stanno nel materiale: servono a CONTARE quante
     cose distinte una domanda chiama davvero in causa, invece di credere
     all'etichetta che il modello si è dato. Il materiale è fatto di righe
     «Etichetta: descrizione» (vedi `_branchMaterial`). */
  function _etichetteDaMateriale(material) {
    var out = [];
    String(material || '').split('\n').forEach(function (r) {
      var i = r.indexOf(':');
      if (i < 3 || i > 70) return;
      var et = r.slice(0, i).trim();
      if (et && et.length >= 4 && out.indexOf(et) < 0) out.push(et);
    });
    return out;
  }

  async function _genOpenQuestions(material, nodeLabel, quantity, apiKey, opts) {
    opts = opts || {};
    const nonce = window.quizNonce ? window.quizNonce() : String(Date.now());
    /* Il secondo tema e il suo materiale entrano nel prompt SOLO se ci sono: su
       una mappa a un ramo solo la domanda «collega le due aree» non avrebbe
       senso, e chiederlo lo stesso produrrebbe accostamenti inventati. */
    const areaB = opts.areaB || '';
    /* ── ANGOLO E GRADUAZIONE, IN TESTA AL PROMPT (13/8 sera) ────────────────
       L'angolo scelto dal docente non arrivava fin qui: restava nel modale e
       finiva solo ai quiz a scelta multipla. Misurato sugli otto fogli di
       Giacomo: il set «esempi concreti» non conteneva un solo esempio, quello
       «definizioni» era il meno definitorio di tutti, e la prima domanda era la
       stessa in quattro set diversi — otto estrazioni dello stesso foglio.
       ⚠️ Il blocco sta FUORI dal template e PRIMA di esso, non dentro: così
       vale anche per chi ha un `prompts_config.json` personale, che una
       variabile nuova non ce l'ha e la lascerebbe cadere in silenzio.
       Il numero di domande d'avvio è già calcolato (`opts.base`): al modello si
       danno numeri, non percentuali da calcolare mentre scrive. */
    const blocco = (window.openQuestionsAngleBlock)
      ? window.openQuestionsAngleBlock(opts.angolo || 'auto', { base: opts.base || 0, tot: quantity })
      : '';
    let prompt = '';
    try {
      prompt = window.fillPromptTemplate('OPEN_QUESTIONS_GENERATOR', {
        quantity, nodeLabel, nonce,
        areaB: areaB,
        /* La riga «VARIETÀ COGNITIVA» del template vale SOLO senza un angolo
           scelto: con l'angolo direbbe il contrario di ciò che si è chiesto. */
        varieta: (opts.angolo && opts.angolo !== 'auto') ? ''
          : (((typeof window.getPromptLanguage === 'function') && window.getPromptLanguage() === 'en')
            ? 'COGNITIVE VARIETY: spread the questions across explaining a process, comparing two elements, cause and effect, applying an example to a new case. '
            : 'VARIETÀ COGNITIVA: distribuisci le domande fra spiegazione di un processo, confronto fra due elementi, causa-conseguenza, esempio da applicare a un caso nuovo. '),
        /* il blocco delle DUE AREE è un pezzo di prompt, non un flag: senza
           secondo ramo sparisce del tutto invece di restare come istruzione a
           vuoto */
        dueAree: areaB
          ? ('\n\nDUE MACRO-AREE. Il materiale qui sotto viene da due aree della mappa: ' +
            '«' + nodeLabel + '» e «' + areaB + '». La maggior parte delle domande resta su ' +
            '«' + nodeLabel + '». Collega le due aree soltanto se il materiale sostiene un ' +
            'collegamento utile all’obiettivo; non forzare un ponte per completare una quota. ' +
            'Mai più di due aree per domanda.\n' +
            'In «aree» elenca le macro-aree che quella domanda richiede davvero: una sola, ' +
            'oppure entrambe. Usa ESATTAMENTE questi nomi: «' + nodeLabel + '», «' + areaB + '».')
          : ''
      }) || '';
    }
    catch (e) { prompt = ''; }
    /* il blocco precede SEMPRE, anche il prompt di ripiego qui sotto */
    if (prompt.trim() && blocco) prompt = blocco + '\n\n' + prompt;
    if (!prompt.trim()) {
      prompt = (blocco ? blocco + '\n\n' : '') +
        'Genera ' + quantity + ' DOMANDE APERTE di verifica basate ESCLUSIVAMENTE su questo materiale.\n' +
        'Codice di variazione: ' + nonce + '.\n' +
        'Una domanda aperta non ha opzioni: lo studente scrive con parole sue. Chiedi di SPIEGARE, ' +
        'CONFRONTARE, GIUSTIFICARE o RICOSTRUIRE, mai una parola singola da ricordare. Frasi brevi, ' +
        'una sola cosa chiesta per domanda (studenti BES/DSA).\n' +
        'Per ognuna scrivi anche «traccia» (che cosa deve contenere una risposta corretta, 1-2 frasi) ' +
        'e «righe» (quante righe servono per rispondere: 3 breve, 5 spiegazione, 8 confronto).\n' +
        'e «aree» (le macro-aree che la domanda richiede: una, o al massimo due)\n' +
        'e «livello» ("base" se si risponde con un concetto solo, "ponte" se ne collega due o più).\n' +
        'Restituisci SOLO un JSON: [{"domanda":"…","traccia":"…","righe":5,"aree":["…"],"livello":"base"}]\n' +
        'Usa l\'italiano. Il tema del ramo è: \'' + nodeLabel + '\'.' +
        (areaB ? ('\nLa seconda area è \'' + areaB + '\': puoi collegarla solo se utile e sostenuto dal materiale.') : '');
    }
    /* LA FORMA DELLA TRACCIA si chiede FUORI dal template, come l'angolo: chi ha
       un `prompts_config.json` personale non ha la chiave nuova e la lascerebbe
       cadere in silenzio. In fondo a ENTRAMBI i prompt, template e ripiego: il
       ripiego chiede «1-2 frasi» e senza questo blocco i suoi fogli sarebbero
       gli unici senza griglia di correzione. */
    prompt += '\n\n' + _bloccoCriteri();
    /* L'ANGOLO PER DOMANDA nei fogli misti (16/9). Con un angolo scelto vale per
       tutte; con `auto` il foglio era UNO e senza taglio per domanda, e la
       sessione a tre colori dell'allievo («la stessa domanda in tutti i tagli»)
       ne vedeva uno solo. Un campo `enum` corto, non long-form: non gonfia la
       risposta (vedi il commento su `criteri` qui sotto). */
    const misto = !opts.angolo || opts.angolo === 'auto';
    const angoliOq = PC().angoliMulti();
    if (misto) prompt += '\n\n' + ((window.getPromptLanguage && window.getPromptLanguage() === 'en')
      ? 'For each question write in «angolo» the angle it takes, one of: ' + angoliOq.join(', ') + '.'
      : 'Per ogni domanda scrivi in «angolo» il taglio che prende, uno fra: ' + angoliOq.join(', ') + '.');
    prompt += '\n\n' + PC().questionRoleBlock('open', opts.complementary, window.getPromptLanguage && window.getPromptLanguage() === 'en');
    /* ⚠️ vedi `_genFlashcards`: senza `maxItems` e senza `maxOutputTokens` il
       modello riempie fino al massimo suo. È QUI che è successo per davvero —
       63.437 token in una chiamata sola.

       ⚠️ POI HO ALZATO DUE VOLTE IL TETTO INSEGUENDO LA CAUSA SBAGLIATA, e il
       registro consumi lo dice riga per riga. Per chiamata di domande aperte:

         fino all'11/9 ore 00   mediana 445-712 token, MAI una sopra 2.500
         11/9 ore 10 (tetto 2.880)   12 chiamate su 49 al tetto
         11/9 ore 22 (tetto 8.400)   28 su 103 al tetto
         11/9 ore 23 (tetto 8.400)    6 su 42 al tetto

       Prima che aggiungessi il campo `criteri`, nessuna chiamata superava gli
       850 token: finivano da sole. Non era il tetto a essere stretto, era la
       richiesta a essere diventata dieci volte più grande. Alzare il tetto
       spostava il muro; il campo l'ho tolto (vedi lo schema qui sotto), e il
       budget torna a tre volte la spesa vera per item più il margine. Il tetto
       assoluto resta quello di `getMaxOutputTokens` (16.384), lontanissimo dai
       65.536 della fuga. */
    const quanteOq = Math.max(1, parseInt(quantity, 10) || 5);
    const schema = {
      type: 'ARRAY', maxItems: quanteOq, items: {
        type: 'OBJECT',
        properties: {
          domanda: { type: 'STRING' }, traccia: { type: 'STRING' }, righe: { type: 'INTEGER' },
          /* ⚠️ ANCHE GLI ARRAY ANNIDATI VOGLIONO IL TETTO (12/9). Il tetto
             sull'array esterno non protegge quelli dentro: il modello può
             scrivere TRE domande e riempire i loro `criteri` fino a esaurire il
             budget. Il numero è quello che il prompt già dichiara: mai più di
             due aree. */
          aree: { type: 'ARRAY', maxItems: 2, items: { type: 'STRING' } },
          /* ⚠️ IL CAMPO `criteri` È STATO TOLTO DALLO SCHEMA (12/9), ed è la
             stessa medicina che la Fase 1 ha preso a giugno per la `desc`: un
             campo long-form dentro uno schema fa scrivere il modello fino a
             esaurire il budget, e `maxItems`/`maxLength` su Gemini sono
             richieste, non leggi — lo dice già il commento di `schemaL1`.
             MISURATO sul registro consumi: prima che aggiungessi `criteri`, le
             chiamate delle domande aperte non superavano mai **850 token**;
             dopo, sei-dodici chiamate per generazione arrivavano al tetto,
             qualunque tetto — 2.880 prima, 8.400 poi. Le domande di quei fogli
             andavano perse.
             I criteri però servono, e si ottengono senza un secondo campo:
             si chiede che la TRACCIA sia fatta di due o tre frasi brevi, ognuna
             un elemento spuntabile, e `criteriDaItem` la divide. Un campo solo,
             la stessa griglia sul foglio. */
          /* `enum` invece di una stringa libera: senza, arrivano «facile»,
             «medio», «base/ponte» — e chi conta non riconosce più niente. */
          livello: { type: 'STRING', enum: ['base', 'ponte'] },
          ...(misto ? { angolo: { type: 'STRING', enum: angoliOq } } : {})
        },
        /* ⚠️ `livello` è OBBLIGATORIO, e la prima prova con l'AI vera dice
           perché: da opzionale il modello semplicemente non lo emetteva —
           l'istruzione «2 su 5 di avvio» veniva letta, e il campo che la rende
           verificabile spariva. Tutte le domande cadevano su «ponte» e la leva
           sembrava non fare niente. */
        required: misto ? ['domanda', 'traccia', 'livello', 'angolo'] : ['domanda', 'traccia', 'livello']
      }
    };
    let payload = {
      contents: [{ parts: [{ text: prompt + '\n\nMateriale:\n' + material }] }],
      generationConfig: { temperature: window.QUIZ_TEMPERATURE || 0.7, maxOutputTokens: window.getMaxOutputTokens(quanteOq * 600 + 1200), responseMimeType: 'application/json', responseSchema: schema, _respectTemp: true }
    };
    if (window.injectClassTuning) payload = window.injectClassTuning(payload);
    const resp = await window.fetchModelAPI(payload, apiKey);
    const raw = resp && resp.candidates && resp.candidates[0] && resp.candidates[0].content.parts[0].text || '';
    const arr = window.salvageTruncatedJSON(raw.split('```json').join('').split('```').join('').trim());
    if (!Array.isArray(arr)) return [];
    /* Alla forma del foglio si passa QUI e non nel builder: il builder è puro e
       riceve già `{question, guide, lines, areas}` da chiunque lo chiami.
       ⚠️ Le AREE dichiarate dal modello si FILTRANO contro i due nomi veri: se
       ne inventa una terza — o storpia un titolo — sul foglio comparirebbe un
       kicker che nella mappa non esiste. Quel che resta dopo il filtro è la
       verità; se non resta niente, l'area è quella per cui stiamo generando. */
    const ammesse = [nodeLabel].concat(areaB ? [areaB] : []);
    const etichette = _etichetteDaMateriale(material).concat(ammesse);
    const norm = (x) => String(x == null ? '' : x).replace(/\s+/g, ' ').trim().toLowerCase();
    return arr.filter(x => x && x.domanda).slice(0, quanteOq).map(x => {
      let aree = Array.isArray(x.aree) ? x.aree : [];
      aree = aree.map(a => ammesse.find(v => norm(v) === norm(a))).filter(Boolean);
      /* mai più di due, ed è la regola dichiarata nel prompt: se il modello ne
         manda tre, si tengono le prime due nell'ordine in cui le ha messe */
      aree = aree.slice(0, 2);
      if (!aree.length) aree = [nodeLabel];
      /* Il livello si NORMALIZZA a due valori: qualunque altra cosa il modello
         scriva («facile», «medio») vale ponte — cioè il caso prudente, quello
         che non promette all'allievo una domanda d'avvio che non lo è. */
      let liv = String(x.livello || '').trim().toLowerCase() === 'base' ? 'base' : 'ponte';
      /* ⚠️ POI SI CONTA (11/9). L'etichetta la dichiarava il modello e nessuno
         la verificava: nei fogli veri una «avvio» chiedeva di distinguere i
         principi storici della neutralità dalla dichiarazione formale — due
         concetti, non uno. Qui si conta quante etichette del materiale la
         domanda nomina davvero, e la conta scavalca la dichiarazione. Se non
         ne nomina nessuna la conta non decide e resta quella del modello. */
      try {
        const PCv = PC();
        if (PCv && PCv.livelloVerificato) liv = PCv.livelloVerificato(x, etichette, liv);
      } catch (e) { /* resta la dichiarazione */ }
      return {
        question: String(x.domanda),
        guide: String(x.traccia || ''),
        criteri: (PC() && PC().criteriDaItem) ? PC().criteriDaItem({ guide: x.traccia }) : [],
        lines: x.righe,
        areas: aree,
        livello: liv,
        /* un angolo fuori elenco non si inventa: resta `auto`, e il reader lo tratta come misto */
        angle: misto ? (angoliOq.indexOf(String(x.angolo || '').trim().toLowerCase()) >= 0 ? String(x.angolo).trim().toLowerCase() : 'auto') : opts.angolo
      };
    });
  }

  /* Quante domande d'avvio, se nessuno lo dice. 40% = due su cinque: un foglio
     che si può cominciare anche sapendo una parte, senza smettere di chiedere
     i collegamenti. È un DEFAULT, non una regola: la leva è nel modale. */
  const QUOTA_BASE_DEF = 40;

  const _QT = {
    mc: { quizType: 'Scelta multipla con 3 opzioni brevi e plausibili, una sola corretta', kind: 'quiz_mc', sub: 'quiz_mc', mode: 'quiz', typeLabel: 'Scelta Multipla' },
    /* ⚠️ `tf` NON è più fra i tipi che «Genera materiali» produce (19/8): la sua
       casella è uscita dal bento e dal modale. La spec resta perché `generaSet`
       la usa ancora — il gesto singolo di ELABORA «Crea un documento → Vero o
       Falso» continua a funzionare, ed è l'unico modo di ottenerne uno. */
    tf: { quizType: 'Vero o Falso — ogni domanda è un\'AFFERMAZIONE da valutare; il campo "correct" vale "Vero" oppure "Falso"', kind: 'quiz_tf', sub: 'quiz_tf', mode: 'quiz', typeLabel: 'Vero o Falso' },
    flashcards: { kind: 'flashcards', sub: 'flashcards', mode: 'flashcard', typeLabel: 'Flashcard' },
    /* `documento: true` = NON è un set giocabile, è un foglio e basta. Il player
       di studio e l'editor dei documenti si aspettano delle opzioni e un indice
       della risposta esatta: un item senza opzioni li romperebbe in silenzio —
       quindi le domande aperte non entrano in `studySets`. Restano un PDF nel
       vault (e una voce d'archivio per INSEGNA), che è esattamente il loro uso:
       si stampano e si distribuiscono. */
    open: { kind: 'open_questions', sub: 'quiz_open', typeLabel: 'Domande aperte', documento: true }
  };

  async function _stepB(vaultPath, manifest, config, apiKey, counter) {
    const finalizing = !!(manifest.review && manifest.review.final && manifest.review.final.stage === 'finalizing');
    if (!finalizing) manifest = PC().stepTransition(manifest, 'B', 'running', { now: _now() });
    await _writeManifest(vaultPath, manifest);
    try {
      const branches = _branchNodes();
      const mapName = _mapName();
      // MC prima delle aperte: il secondo formato conosce ciò che il primo verifica già.
      const types = (config.quiz.types || []).filter(t => _QT[t]).sort((a, b) => (a === 'mc' ? -1 : b === 'mc' ? 1 : 0));
      const perBranch = Math.max(1, config.quiz.perBranch || 3);
      const angle = config.quiz.angle || 'auto';
      /* «Più set per angolo»: i generi elencati qui si generano una volta per
         ogni angolo SPUNTATO nel box, invece che una sola. Il filtro contro i
         tipi spuntati e la regola «senza angoli non si moltiplica» stanno nel
         core, che è anche ciò che legge la stima: una seconda regola scritta
         qui direbbe un giorno un numero diverso da quello mostrato. */
      const multi = PC().multiTypes(config.quiz);
      const saltati = [];
      for (let ti = 0; ti < types.length; ti++) {
        const t = types[ti];
        const spec = _QT[t];
        _setContext(spec.sub);
        /* PER-TIPO (dossier, 20/8): angoli, quantità e categorie scelti nella
           scheda di validazione, genere per genere. Con la forma per-tipo
           assente si ricade sulle leve globali del bento (è il percorso della
           mappa, invariato). Le CATEGORIE filtrano i rami: su un dossier i
           rami SONO i blocchi della scheda (id `fonte_<blocco>`). */
        const angoli = (multi.indexOf(t) >= 0) ? PC().angoliPerTipo(config.quiz, t) : [angle];
        const quanti = PC().quantiPerTipo ? PC().quantiPerTipo(config.quiz, t, perBranch) : perBranch;
        const catT = (config.dossier && PC().categoriePerTipo) ? PC().categoriePerTipo(config.quiz, t) : null;
        const ramiT = catT ? branches.filter(b => catT.indexOf(String(b.id).replace(/^fonte_/, '')) >= 0) : branches;
        /* ADR 0003: il documento singolo chiede UN'area (`quiz.area` = l'id del
           ramo). Si filtra qui, senza toccare `ramiT`, che serve ancora al ramo
           COMPAGNO delle domande aperte — come nel gesto singolo, che lo prende
           fra tutti i rami. Senza area, il lotto di sempre. Con un'area che non
           c'è più, `ramiA` è vuoto e il giro non genera nulla. */
        const ramiA = (config.quiz && config.quiz.area) ? ramiT.filter(b => String(b.id) === String(config.quiz.area)) : ramiT;
        for (let ai = 0; ai < angoli.length; ai++) {
          const ang = angoli[ai];
          /* Il nome della variante è la CHIAVE dell'angolo, non l'etichetta a
             schermo: `Domande-aperte-<Mappa>-causa`. È la convenzione del gesto
             singolo (`_generaVarianti`) e quella che Giacomo usava a mano. */
          const nomeVar = (angoli.length > 1) ? PC().nomeAngolo(ang) : '';
          /* ADR 0003: il nome scritto dal docente nel wizard si affianca
             all'angolo. UNA costante per titolo, clone e nome file (inv. 6):
             ELABORA ricava il nome atteso del file dal `clone` del set (e, per
             le domande aperte, dal titolo d'archivio) — se divergessero, il
             file resterebbe orfano nella console. Nei lotti di «Genera
             materiali» `quiz.nome` non c'è, e resta il solo `nomeVar`. */
          const etichetta = [nomeVar, config.quiz && config.quiz.nome].filter(Boolean).join(' · ');
          try {
          _overlay(_t('mp_step_b', 'Genero i quiz…') + ' (' + spec.typeLabel +
            (nomeVar ? ' · ' + nomeVar + ' ' + (ai + 1) + '/' + angoli.length : '') + ')');
          const draftKey = t + '-' + ang;
          const cached = manifest.review && manifest.review.drafts.B[draftKey];
          if (finalizing && cached && cached.published) continue;
          if (finalizing && !cached) throw new Error('Bozza mancante: ' + draftKey);
          const raw = cached ? JSON.parse(JSON.stringify(cached.items)) : [];
          let requestedCount = 0;
          for (let bi = 0; bi < (cached ? 0 : ramiA.length); bi++) {
            const b = ramiA[bi];
            const material = _branchMaterial(b);
            if (!material.trim()) continue;
            requestedCount += quanti;
            const complementary = _complementaryQuestions(t, _clean(b.label), manifest);
            counter.calls++;
            if (t === 'open') {
              /* il ramo COMPAGNO entra nel materiale: è ciò che permette le
                 domande che collegano due macro-aree (Giacomo, 11/8) */
              const comp = _ramoCompagno(b, ramiT);
              const materialeB = comp ? _branchMaterial(comp) : '';
              const insieme = materialeB
                ? (material + '\n\n--- ALTRA AREA: ' + _clean(comp.label) + ' ---\n' + materialeB)
                : material;
              /* l'angolo e la quota d'avvio valgono anche qui: la pipeline usa
                 `config.quiz.angle` (già scelto nel bento) e la quota di
                 default — è la stessa generazione, e due tarature diverse fra
                 «Genera materiali» e il gesto singolo si noterebbero subito */
              const items = await _genOpenQuestions(insieme, _clean(b.label), quanti, apiKey,
                { areaB: comp ? _clean(comp.label) : '', angolo: ang,
                  base: PC().quotaBase(quanti, config.quiz.base != null ? config.quiz.base : QUOTA_BASE_DEF), complementary });
              /* le AREE le porta già l'item (filtrate contro i nomi veri in
                 `_genOpenQuestions`): qui si tiene `l1` come area principale, che
                 è quella per cui stiamo generando */
              /* `ramo` è la macro-area DA CUI viene la domanda, dichiarata qui —
                 dove si sa — e non ricavata dopo: chi legge il foglio (le
                 attività di studio) raggruppa per ramo, e in coda al ciclo
                 l'informazione non c'è più. */
              _withoutCrossFormatCopies(items, complementary).forEach(it => raw.push(Object.assign({ l1: _clean(b.label), ramo: _clean(b.label) }, it)));
            } else if (t === 'flashcards') {
              const items = await _genFlashcards(material, _clean(b.label), quanti, apiKey, { angolo: ang });
              items.forEach(it => raw.push(Object.assign({ ramo: _clean(b.label) }, it)));
            } else {
              const items = await window.generateDynamicQuiz({ nodeLabel: _clean(b.label), material, quizType: spec.quizType, quantity: quanti, angle: ang, apiKey, usageCat: 'pipeline', usageSub: spec.sub, complementary });
              _withoutCrossFormatCopies(items || [], complementary).forEach(it => raw.push(Object.assign({ ramo: _clean(b.label) }, it)));
            }
          }
          if (!cached) raw.splice(0, raw.length, ..._potaDoppioni(raw, spec.typeLabel + (nomeVar ? ' · ' + nomeVar : '')));
          if (spec.mode === 'quiz') _guardaLunghezze(raw, spec.typeLabel + (nomeVar ? ' · ' + nomeVar : ''));
          if (!cached && requestedCount && !raw.length) throw new Error(_t('mp_batch_empty', 'Nessuna domanda utilizzabile per {f}. Il lotto resta da completare.').replace('{f}', spec.typeLabel));
          if (!raw.length) continue;
          if (!cached && raw.length < requestedCount) _toast(_t('mp_batch_short', '{f}: {n} domande utilizzabili sulle {t} richieste. Verifica gli obiettivi rimasti scoperti.')
            .replace('{f}', spec.typeLabel).replace('{n}', raw.length).replace('{t}', requestedCount), 'warning');
          const setId = cached ? cached.id : 'set_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
          const setTitle = mapName + ' — ' + spec.typeLabel + (etichetta ? ' · ' + etichetta : '');
          /* Il DOCUMENTO segue la convenzione dei cloni («Domande Aperte -
             causa»), la stessa del gesto singolo: è da lì che ELABORA ricava il
             nome della variante. Con la forma della pipeline le sette varianti
             si leggevano tutte «Domande Aperte». */
          const titoloDoc = _titoloDoc(spec, etichetta, mapName);
          raw.forEach((it, i) => { if (!it.id) it.id = setId + '-' + i; });
          if (manifest.review && !finalizing) {
            manifest.review.drafts.B[draftKey] = { id: setId, type: t, angle: ang, title: titoloDoc, items: raw,
              generation: cached ? cached.generation : { requested: requestedCount, produced: raw.length }, revision: manifest.review.approvedRevision };
            await _writeManifest(vaultPath, manifest);
            continue;
          }

          /* ── I materiali-DOCUMENTO escono qui: PDF e basta ────────────────────
             Le domande aperte non sono un set giocabile (vedi `_QT.open`), quindi
             saltano `studySets` e tutto ciò che ne dipende — il player, l'editor,
             il ri-salvataggio del vault. Producono il foglio, lo archiviano per
             INSEGNA e passano al tipo successivo. */
          if (spec.documento) {
            const htmlOq = window.buildOpenQuestionsHtml({ id: setId, title: titoloDoc, type: spec.typeLabel, items: raw, angle: ang,
              generation: cached ? cached.generation : { requested: requestedCount, produced: raw.length } },
              { mapName, includeBar: false });
            const pdfOq = await window.electronAPI.htmlToPdf({ html: htmlOq, options: { landscape: false } });
            if (!pdfOq || !pdfOq.ok) throw new Error('PDF domande aperte non generato: ' + ((pdfOq && pdfOq.error) || '?'));
            const vOq = PC().validatePdfB64(pdfOq.base64);
            if (!vOq.ok) throw new Error(spec.typeLabel + ': ' + vOq.error);
            const nomeOq = PC().buildFileName(spec.kind, null, config.tuned, { mappa: mapName, nome: etichetta });
            const relOq = 'Materiale Studio/' + nomeOq;
            const wOq = await window.electronAPI.saveVaultFile({ vaultPath, relPath: relOq, base64: pdfOq.base64 });
            if (!wOq || !wOq.ok) throw new Error('Scrittura domande aperte fallita: ' + ((wOq && wOq.error) || '?'));
            manifest = _recordFile(manifest, 'B', relOq);
            await _writeManifest(vaultPath, manifest);
            /* In ARCHIVIO va l'HTML, non il PDF: da lì INSEGNA sa ristampare la
               versione SENZA tracce di correzione (il foglio porta la sua
               sorgente incorporata) — da un PDF non si ricava più niente.
               ⚠️ `kind: 'quizpaper'` è ciò che lo fa comparire in «Quiz
               cartacei»: un genere nuovo lì dentro non sarebbe elencato da
               nessuna delle viste esistenti. */
            try {
              if (window.MappAIStudyDocs) {
                window.MappAIStudyDocs.save({
                  kind: 'quizpaper', title: titoloDoc, html: htmlOq,
                  mapName: mapName, cls: config.className || '', disc: config.disc || ''
                });
              }
          } catch (e) { /* l'archivio è un di più: il file nel vault c'è già */ }
            /* Il gemello `.html` nel vault (6/9): la sorgente viaggia con la
               cartella, non solo con questo computer. Dopo PDF e archivio; un
               errore qui non porta via niente. */
            try {
              if (window.MappAIQuizPrint && window.MappAIQuizPrint.scriviSorgente) await window.MappAIQuizPrint.scriviSorgente(vaultPath, nomeOq, htmlOq);
            } catch (e) { console.warn('[Pipeline] sorgente domande aperte:', e && e.message); }
          if (manifest.review) { manifest.review.drafts.B[draftKey].published = true; await _writeManifest(vaultPath, manifest); }
          continue;
        }

        // Set in-app (forma q/correct o front/back) + persistenza vault
        /* ⚠️ `clone` è il campo da cui ELABORA legge il nome della variante (e
           `buildFileName` il nome del file): senza, i sette set per angolo si
           chiamavano tutti «Scelta Multipla». */
        const set = { id: setId, title: setTitle, mode: spec.mode, type: spec.typeLabel, items: raw, angle: ang, quantity: quanti, date: _now(), clone: etichetta, _pipeline: true,
          generation: cached ? cached.generation : { requested: requestedCount, produced: raw.length } };
        _state().db.studySets = _state().db.studySets || [];
        set.reviewRevision = manifest.review && manifest.review.approvedRevision;
        const existingSet = _state().db.studySets.findIndex(x => x.id === set.id);
        if (existingSet >= 0) _state().db.studySets[existingSet] = set; else _state().db.studySets.push(set);
        // PDF (forma stampabile)
        const printItems = (t === 'flashcards') ? _flashToPrintItems(raw) : _toPrintItems(raw);
        // SOGLIA CARATTERI (solo flashcard). Le carte oltre soglia si stampano
        // lo stesso — il motore le fa entrare rimpicciolendo o accorciando — ma
        // il docente viene avvisato: le controlla e le sistema in ELABORA →
        // Documenti, dove ogni carta ha il contatore, e ristampa da lì.
        let scartate = [];
        if (t === 'flashcards') {
          try {
            const PL = window.MappAIPrintLayout, QP2 = window.MappAIQuizPrint;
            if (PL) {
              const head = (QP2 && QP2.cardHeader) ? QP2.cardHeader({ title: setTitle }, { rootLabel: mapName }) : null;
              const lim = PL.charLimits(PL.flashGeom(), head);
              const norm = printItems.map(it => ({
                question: String(it.question || ''),
                answer: String(it.options?.[it.correctIndex] || it.answer || '')
              }));
              scartate = PL.overLimit(norm, lim);
              if (scartate.length) {
                // Segnate nel set: INSEGNA mostra il badge sulla riga del
                // materiale e l'editor le elenca in cima al foglio.
                set._overLimit = scartate.length;
                console.warn('[Pipeline] ' + scartate.length + ' carte oltre soglia (' +
                  lim.question + '/' + lim.answer + ' caratteri): stampate comunque, da rivedere.');
                _toast(_t('mp_cards_over', '{n} carte superano la soglia di caratteri: controllale in ELABORA → Documenti')
                  .replace('{n}', scartate.length), 'warning');
              }
            }
          } catch (e) { /* soglia non applicabile: si stampa tutto, come prima */ }
        }
        const printSet = Object.assign({}, set, { title: setTitle, items: printItems });
        const html = (t === 'flashcards')
          ? window.buildFlashcardSetHtml(printSet, { mapName, includeBar: false })
          : window.buildQuizSetHtml(printSet, { mapName, includeBar: false });
        // Il foglio flashcard è orizzontale (carte affiancate come il foglio nodi):
        // l'orientamento lo dichiara la geometria del foglio, non questo call site.
        const QP = window.MappAIQuizPrint;
        const landscape = (t === 'flashcards') && !!(QP && QP.flashSheet && QP.flashSheet().landscape);
        const pdf = await window.electronAPI.htmlToPdf({ html, options: { landscape } });
        if (!pdf || !pdf.ok) throw new Error('PDF quiz non generato: ' + ((pdf && pdf.error) || '?'));
        const v = PC().validatePdfB64(pdf.base64);
        if (!v.ok) throw new Error('Quiz ' + spec.typeLabel + ': ' + v.error);
        /* La mappa entra nel nome per la stessa ragione degli altri materiali:
           questi file escono dal vault (si stampano, si mandano, finiscono su
           una chiavetta) e lì il solo tipo non basta più a riconoscerli.
           Forma esplicita `opts.mappa` invece del vecchio `label`: qui il
           risultato è identico, ma i cinque nomi della pipeline si leggono ora
           tutti allo stesso modo. */
        const fileName = PC().buildFileName(spec.kind, null, config.tuned, { mappa: mapName, nome: etichetta });
        const rel = 'Materiale Studio/' + fileName;
        const w = await window.electronAPI.saveVaultFile({ vaultPath, relPath: rel, base64: pdf.base64 });
        if (!w || !w.ok) throw new Error('Scrittura quiz fallita: ' + ((w && w.error) || '?'));
        manifest = _recordFile(manifest, 'B', rel);
        if (manifest.review) {
          const savedSet = await window.electronAPI.saveVault({ folderPath: vaultPath, mapData: window.buildVaultMapData() });
          if (!savedSet || !savedSet.success) throw new Error((savedSet && savedSet.error) || 'Set non salvato');
          manifest.review.drafts.B[draftKey].published = true;
        }
        await _writeManifest(vaultPath, manifest);
          } catch (e) {
            /* Un angolo che fallisce NON porta via gli altri sei: si segna e si
               continua (è la stessa forma delle varianti del gesto singolo).
               Con un angolo solo non c'è niente da salvare: l'errore risale e
               fa fallire lo step, come prima. */
            if (manifest.review || angoli.length === 1) throw e;
            saltati.push(spec.typeLabel + ' · ' + nomeVar + ': ' + (e && e.message ? e.message : String(e)));
          }
        }
      }
      if (saltati.length) {
        console.warn('[Pipeline] varianti non riuscite:\n' + saltati.join('\n'));
        _toast(_t('mp_multi_saltati', '{n} varianti non generate: le altre ci sono')
          .replace('{n}', saltati.length), 'warning');
      }
      // Ri-salva il vault: i set persistono nel mapData.studySets
      if (!manifest.review || finalizing) {
        const saved = await window.electronAPI.saveVault({ folderPath: vaultPath, mapData: window.buildVaultMapData() });
        if (!saved || !saved.success) throw new Error((saved && saved.error) || 'Set non salvati');
      }
      if (window.renderStudySets) { try { window.renderStudySets(); } catch (e) {} }
      if (!finalizing) manifest = PC().stepTransition(manifest, 'B', 'done', { now: _now(), calls: counter.calls });
    } catch (e) {
      if (finalizing || e.code === 'REVIEW_PERSISTENCE_FAILED') throw e;
      manifest = PC().stepTransition(manifest, 'B', 'failed', { now: _now(), error: e.message || String(e) });
    }
    await _writeManifest(vaultPath, manifest);
    return manifest;
  }

  // ══════════════════════════════════════════════════════════════════════
  // STEP C — fogli nodi, un PDF per modo selezionato
  // ══════════════════════════════════════════════════════════════════════
  async function _stepC(vaultPath, manifest, config) {
    const finalizing = !!(manifest.review && manifest.review.final && manifest.review.final.stage === 'finalizing');
    if (!finalizing) manifest = PC().stepTransition(manifest, 'C', 'running', { now: _now() });
    await _writeManifest(vaultPath, manifest);
    try {
      const ns = config.nodesheet;
      const mapName = _mapName();
      let modes = (ns.modes || []).slice();
      if (ns.fmt === '3x4') modes = ['title'];   // vincolo motore: 3x4 = solo titolo
      modes = modes.filter((m, i) => modes.indexOf(m) === i);
      if (!modes.length) modes = ['title'];
      _setContext('nodesheet');
      for (let i = 0; i < modes.length; i++) {
        const layout = modes[i];
        const cached = manifest.review && manifest.review.drafts.C[layout];
        if (finalizing && cached && cached.published) continue;
        if (finalizing && (!cached || !cached.cards.length)) continue;
        _overlay(_t('mp_step_c', 'Preparo i fogli nodi…') + ' (' + layout + ')');
        const res = await window.printAllNodeLabels({
          draftOnly: !!manifest.review && !finalizing,
          cards: finalizing ? cached.cards : undefined,
          depth: ns.maxLevel || 'all',
          fmt: ns.fmt || '2x2',
          layout,
          bg: 'none',
          tuned: !!config.tuned,
          /* ⚠️ La catena NON entra più nel PDF dei fogli nodi: dal 5/8 è un
             materiale suo (step E) con un file suo. Passarla anche qui la
             stamperebbe due volte, in due posti diversi.
             Il flusso MANUALE del foglio nodi conserva la sua opzione: è
             `printAllNodeLabels` a non cambiare, è la pipeline che non la chiede. */
          causal: false,
          toDisk: { vaultPath }
        });
        if (!res || !res.ok) throw new Error('Foglio nodi (' + layout + ') non generato');
        if (manifest.review && !finalizing) {
          manifest.review.drafts.C[layout] = { cards: res.cards }; await _writeManifest(vaultPath, manifest); continue;
        }
        const v = PC().validatePdfB64(res.base64);
        if (!v.ok) throw new Error('Foglio nodi (' + layout + '): ' + v.error);
        /* Il layout scende da `label` a `opts.dettaglio`: resta ciò che
           distingue due fogli della STESSA mappa, ma smette di occupare il
           posto del nome della mappa — che prima non compariva affatto
           («Foglio-nodi-card.pdf» non dice di che cosa sono le card). */
        const fileName = PC().buildFileName('nodesheet', null, config.tuned, { mappa: mapName, dettaglio: layout });
        const rel = 'Materiale Studio/' + fileName;
        const w = await window.electronAPI.saveVaultFile({ vaultPath, relPath: rel, base64: res.base64 });
        if (!w || !w.ok) throw new Error('Scrittura foglio nodi fallita: ' + ((w && w.error) || '?'));
        manifest = _recordFile(manifest, 'C', rel);
        if (manifest.review) manifest.review.drafts.C[layout].published = true;
        await _writeManifest(vaultPath, manifest);
      }
      if (!finalizing) manifest = PC().stepTransition(manifest, 'C', 'done', { now: _now() });
    } catch (e) {
      if (finalizing || e.code === 'REVIEW_PERSISTENCE_FAILED') throw e;
      manifest = PC().stepTransition(manifest, 'C', 'failed', { now: _now(), error: e.message || String(e) });
    }
    await _writeManifest(vaultPath, manifest);
    return manifest;
  }

  // ══════════════════════════════════════════════════════════════════════
  // STEP D — sintesi mappa intera (HTML) + voce naturale (MP3, degradabile)
  // ══════════════════════════════════════════════════════════════════════
  async function _stepD(vaultPath, manifest, config, apiKey) {
    const finalizing = !!(manifest.review && manifest.review.final && manifest.review.final.stage === 'finalizing');
    if (finalizing && (!manifest.review.drafts.D || manifest.review.drafts.D.published)) return manifest;
    if (!finalizing) manifest = PC().stepTransition(manifest, 'D', 'running', { now: _now() });
    await _writeManifest(vaultPath, manifest);
    try {
      _setContext('synthesis');
      _overlay(_t('mp_step_d', 'Scrivo la sintesi…'));
      const mapName = _mapName();
      const data = manifest.review && manifest.review.drafts.D ? manifest.review.drafts.D.data : await window.MappAISynthesis.runWholeMap({ apiKey, tuned: !!config.tuned, silent: true });
      /* DOSSIER: la sintesi si apre con la FOTO della fonte (21/8). L'immagine
         viaggia nei DATI e non negli opts del chiamante, o sparirebbe al primo
         salvataggio dall'editor (inv. 18). */
      if (config.dossier && config.dossier.fotoB64) {
        data.foto = {
          b64: config.dossier.fotoB64,
          mime: config.dossier.mime || 'image/jpeg',
          titolo: config.dossier.titolo || mapName
        };
      }
      const v = PC().validateSynthesis(data);
      if (!v.ok) throw new Error('Sintesi: ' + v.error);
      if (manifest.review && !finalizing) {
        manifest.review.drafts.D = { data };
        manifest = PC().stepTransition(manifest, 'D', 'done', { now: _now() });
        await _writeManifest(vaultPath, manifest); return manifest;
      }
      const htmlName = PC().buildFileName('synthesis', null, config.tuned, { mappa: mapName });
      const relHtml = 'Materiale Studio/' + htmlName;
      /* ══ DUE FILE, NON DUE STATI DELLO STESSO (10/8/26) ═══════════════════
         La sintesi esce in due esemplari, con due mestieri diversi:
           · `Sintesi-<Mappa>.html`      senza audio — è quello EDITABILE, lo
                                         apre l'editor di ELABORA, ed è l'unico
                                         che il docente corregge;
           · `Sintesi-voce-<Mappa>.html` con l'MP3 dentro in base64 — si
                                         consegna, si vede solo in INSEGNA, e
                                         NON si modifica.
         Prima era un file solo, riscritto due volte per agganciargli l'audio.
         Non reggeva: correggere il testo voleva dire o perdere la voce o
         portarsela dietro dentro un documento da 8 MB che si riapre a ogni
         ritocco. Separandoli, l'editabile resta leggero (~60 KB) e la copia con
         la voce è un prodotto finito, che si rigenera quando serve.
         ⚠️ L'MP3 NON si scrive più come file a sé: vive dentro l'HTML con la
         voce. Un file audio accanto serviva a tenere leggero il documento, e
         quel motivo è caduto insieme al file unico.
         L'ordine resta lo stesso, e per la stessa ragione: prima l'editabile,
         poi l'audio, poi la copia con la voce. La voce è degradabile (FR-006,
         fallisce senza fermare il passo), quindi se salta resta comunque il
         documento buono — semplicemente senza la copia parlante. */
      const scriviHtml = async function (rel, opts) {
        const html = window.MappAISynthesis.buildHtml(data, opts);
        const r = await window.electronAPI.saveVaultFile({ vaultPath, relPath: rel, text: html });
        if (!r || !r.ok) throw new Error('Scrittura sintesi fallita: ' + ((r && r.error) || '?'));
      };
      await scriviHtml(relHtml);
      manifest = _recordFile(manifest, 'D', relHtml);
      await _writeManifest(vaultPath, manifest);
      // Voce: degradabile (FR-006) → fallimento = nota, NON step failed.
      if (config.synthesis.audio) {
        try {
          _setContext('tts');
          _overlay(_t('mp_step_d_audio', 'Genero la voce naturale…'));
          const audio = await window.MappAISynthesis.generateAudio(data);
          const b64 = await _blobToB64(audio.blob);
          /* La COPIA CON LA VOCE: un secondo file, non una riscrittura del
             primo. L'editabile scritto poco fa resta com'è — leggero e senza
             audio — e questo gli si affianca col suo nome.
             Passano anche i `cues`: sono i tempi di inizio di ogni blocco, cioè
             ciò che tiene il karaoke allineato alla voce. La pipeline finora li
             buttava via, e la copia nel vault leggeva peggio di quella scaricata
             a mano dallo stesso motore.
             ⚠️ Degradabile come la voce: se questa scrittura fallisce, tutti i
             materiali sono già al loro posto e si perde solo la copia parlante,
             che si rigenera dall'editor quando serve. */
          try {
            /* ⚠️ L'AUDIO VA DENTRO IL DOCUMENTO (decisione di Giacomo, 10/8/26),
               non in un file accanto. Un HTML che PUNTA all'MP3 fratello
               funziona solo finché i due file restano nella stessa cartella, e
               in tutti gli altri casi la voce sparisce senza dirlo — perché il
               documento ripiega da solo sulla voce di sistema quando l'audio non
               carica. Casi che contano:
                 · condivisione via QR — si pubblica il solo HTML, e il
                   riferimento relativo sul server non risolve;
                 · il file mandato per posta o con AirDrop, da solo;
                 · l'anteprima nell'app, dove il documento entra come `srcdoc` e
                   un percorso relativo non ha da dove risolversi.
               Il prezzo è il peso: un MP3 da 6 MB porta l'HTML da 60 KB a 8,3 MB
               (in base64 cresce di un terzo). È il motivo per cui questo file è
               SEPARATO dall'editabile: chi corregge il testo non deve riaprire
               8 MB a ogni ritocco, e chi consegna vuole un file che basti a sé. */
            const audioDataUri = 'data:' + (audio.mime || 'audio/mpeg') + ';base64,' + b64;
            const voceName = PC().buildFileName('synthesis_voice', null, config.tuned, { mappa: mapName });
            const relVoce = 'Materiale Studio/' + voceName;
            await scriviHtml(relVoce, { audioDataUri: audioDataUri, audioMime: audio.mime, cues: audio.cues });
            manifest = _recordFile(manifest, 'D', relVoce);
            await _writeManifest(vaultPath, manifest);
          } catch (he) {
            if (he.code === 'REVIEW_PERSISTENCE_FAILED') throw he;
            manifest.steps.D.audioNote = _t('mp_audio_unlinked', 'voce generata, ma la copia parlante non è stata scritta: ') + (he.message || he);
          }
        } catch (ae) {
          if (ae.code === 'REVIEW_PERSISTENCE_FAILED') throw ae;
          manifest.steps.D.audioNote = 'voce non generata: ' + (ae.message || ae);
          _toast(_t('mp_audio_degraded', 'Sintesi salvata; voce non generata (' + (ae.message || ae) + ')'), 'warning');
        }
      }
      if (finalizing) manifest.review.drafts.D.published = true;
      if (!finalizing) manifest = PC().stepTransition(manifest, 'D', 'done', { now: _now() });
    } catch (e) {
      if (finalizing || e.code === 'REVIEW_PERSISTENCE_FAILED') throw e;
      manifest = PC().stepTransition(manifest, 'D', 'failed', { now: _now(), error: e.message || String(e) });
    }
    await _writeManifest(vaultPath, manifest);
    return manifest;
  }

  // ══════════════════════════════════════════════════════════════════════
  // STEP E — «Catena dei perché»: materiale INDIPENDENTE, PDF suo
  // ══════════════════════════════════════════════════════════════════════
  /* Decisione di Giacomo (5/8). Prima era un'opzione dei fogli nodi e le sue
     pagine finivano in coda a quel PDF: per avere la catena bisognava chiedere
     anche i fogli, e chi apriva la cartella non trovava un file che si chiamasse
     come la cosa che cercava.
     Zero chiamate AI: i nessi si ricavano dai verbi dei link e dai connettivi
     nelle descrizioni (`chainsForOutput`), e se il docente ha rivisto la catena
     in ELABORA vale la SUA versione — la stessa funzione che usano il documento
     a schermo e l'editor, così le tre rese non possono divergere. */
  async function _stepE(vaultPath, manifest, config) {
    const finalizing = !!(manifest.review && manifest.review.final && manifest.review.final.stage === 'finalizing');
    if (finalizing && (!manifest.review.drafts.E || manifest.review.drafts.E.published)) return manifest;
    const CC = window.MappAICausal;
    if (!CC || !CC.chainsForOutput || !CC.buildDocHtml) {
      manifest = PC().stepTransition(manifest, 'E', 'skipped', { now: _now() });
      manifest.steps.E.note = 'modulo «Catena dei perché» non disponibile';
      await _writeManifest(vaultPath, manifest);
      return manifest;
    }
    /* Nessun nesso non è un ERRORE: è una mappa con verbi generici. Si dichiara
       e si va avanti — pending→skipped è una transizione lecita, running→skipped
       no, quindi il controllo va fatto PRIMA di mettere lo step in corso. */
    let chains = null;
    try { chains = manifest.review && manifest.review.drafts.E ? manifest.review.drafts.E.chains : CC.chainsForOutput(); } catch (e) { chains = null; }
    if (!chains || !chains.total) {
      if (finalizing) return manifest;
      manifest = PC().stepTransition(manifest, 'E', 'skipped', { now: _now() });
      manifest.steps.E.note = _t('mp_causal_empty', 'nessun nesso causa-effetto nella mappa: catena non generata');
      await _writeManifest(vaultPath, manifest);
      _toast(_t('mp_causal_empty_toast', 'Catena dei perché non generata: la mappa non ha nessi causa-effetto riconoscibili'), 'warning');
      return manifest;
    }
    if (!finalizing) manifest = PC().stepTransition(manifest, 'E', 'running', { now: _now() });
    await _writeManifest(vaultPath, manifest);
    try {
      _overlay(_t('mp_step_e', 'Preparo la catena dei perché…'));
      if (manifest.review && !finalizing) {
        manifest.review.drafts.E = { chains };
        manifest = PC().stepTransition(manifest, 'E', 'done', { now: _now() });
        await _writeManifest(vaultPath, manifest); return manifest;
      }
      const html = CC.buildDocHtml(chains, CC.mapName ? CC.mapName() : '');
      if (!html || html.length < 200) throw new Error('documento vuoto');
      /* PDF dallo STESSO html del documento stampabile (via la finestra
         offscreen di `html-to-pdf`), non da un jsPDF costruito a parte: una
         resa sola per schermo, stampa e cartella. */
      /* A4 verticale: il documento della catena è una colonna di righe
         «causa → connettivo → effetto», non una tabella larga. */
      const pdf = await window.electronAPI.htmlToPdf({ html, options: { pageSize: 'A4', landscape: false } });
      if (!pdf || !pdf.ok || !pdf.base64) throw new Error((pdf && pdf.error) || 'PDF non prodotto');
      const v = PC().validatePdfB64(pdf.base64);
      if (!v.ok) throw new Error(v.error);
      /* Il nome della mappa lo dà `_mapName()`, non `CC.mapName()` che intitola
         il documento: i nomi dei file della pipeline hanno una fonte sola,
         altrimenti due materiali della stessa mappa si chiamerebbero in due modi
         e nella cartella non risulterebbero più fratelli. */
      const rel = 'Materiale Studio/' + PC().buildFileName('causal', null, config.tuned, { mappa: _mapName() });
      const w = await window.electronAPI.saveVaultFile({ vaultPath, relPath: rel, base64: pdf.base64 });
      if (!w || !w.ok) throw new Error('Scrittura catena fallita: ' + ((w && w.error) || '?'));
      manifest = _recordFile(manifest, 'E', rel);
      await _writeManifest(vaultPath, manifest);
      if (finalizing) manifest.review.drafts.E.published = true;
      if (!finalizing) manifest = PC().stepTransition(manifest, 'E', 'done', { now: _now() });
    } catch (e) {
      if (finalizing || e.code === 'REVIEW_PERSISTENCE_FAILED') throw e;
      manifest = PC().stepTransition(manifest, 'E', 'failed', { now: _now(), error: e.message || String(e) });
    }
    await _writeManifest(vaultPath, manifest);
    return manifest;
  }

  // ══════════════════════════════════════════════════════════════════════
  // Orchestratore
  // ══════════════════════════════════════════════════════════════════════
  /* Esegue un passo e confronta i file che ha scritto con quelli che risultavano
     scritti PRIMA (il manifest li elenca, e `stepTransition` azzera la lista a
     ogni nuovo tentativo). Quello che c'era e non c'è più è un ORFANO: sta
     ancora nella cartella ma nessuno lo produce più.
     Serve perché i nomi dei materiali sono cambiati — la mappa entra nel nome —
     e una pipeline ripresa da un manifest scritto prima riscrive gli stessi
     materiali con nomi nuovi, lasciando accanto quelli vecchi. Non li cancello:
     un foglio può essere già stato stampato o corretto a mano, e cancellare in
     silenzio i file di qualcun altro è peggio del disordine. Ma non li lascio
     nemmeno sparire dal racconto: finiscono nel manifest e nel riepilogo.
     Vale per qualunque cambio di nome futuro, non solo per quello di oggi: il
     confronto è fra due elenchi, non fra due convenzioni scritte a mano. */
  async function _passo(vaultPath, manifest, step, esegui) {
    /* La sentinella sta QUI, non ai quattro punti di chiamata: un passo nuovo
       la eredita senza che nessuno debba ricordarsene. */
    _controllaIdentita();
    if (manifest.review && window.MappAIReviewCore && !window.MappAIReviewCore.gate(manifest.review, _state().db, manifest.review.sources).allowed) throw new Error('I contenuti sono cambiati dopo la revisione');
    const prima = ((manifest.steps[step] || {}).files || []).slice();
    const m = await esegui();
    const dopo = ((m.steps[step] || {}).files || []);
    const orfani = prima.filter(p => dopo.indexOf(p) < 0);
    if (!orfani.length) return m;
    m.steps[step].orfani = orfani;
    console.warn('[Pipeline] ' + step + ': file della versione precedente rimasti nella cartella →', orfani);
    await _writeManifest(vaultPath, m);
    return m;
  }

  // opts: { only?: ['B','C','D','E'] per Riprova; vaultPath?, manifest? per ripresa }
  async function _finishReviewed(vaultPath, manifest, config, apiKey, counter) {
    const MR = window.MappAIMaterialReview, RC = window.MappAIReviewCore, MD = window.MappAIMaterialDrafts;
    if (!MR || !RC || !MD) throw new Error('Controllo finale non caricato');
    if (!PC().STEPS.filter(s => s !== 'A').every(s => ['done', 'skipped'].includes(manifest.steps[s].status))) { _overlay(false); _openSummary(vaultPath, manifest, config); return null; }
    const review = manifest.review;
    const material = window.MappAIGroundingCore.buildInput(_state().db, _state().db.nodes, review.sources, review, { includeOriginalPages: true });
    if (!review.final) {
      review.final = { stage: 'checking', items: MD.flatten(review.drafts), revision: review.approvedRevision };
      await _writeManifest(vaultPath, manifest);
    }
    let final = review.final;
    if (final.stage === 'done') return manifest;
    if (final.stage === 'checking') {
      _overlay(_t('rv_check_final', 'Controllo i materiali prima della consegna…'));
      const report = await MR.check(final.items, { review, apiKey, material, aiContext: config.aiContext,
        onProgress: progress => _overlay(_t('rv_check_final', 'Controllo i materiali prima della consegna…') + (typeof progress === 'string' ? ' ' + progress : '')) });
      final.review = RC.createReview({ db: { items: final.items }, sources: review.sources, report,
        generationId: review.generationId + '-materials', vaultPath, config });
      final.stage = 'awaiting_review';
      if (!final.review.initial.issues.length && final.review.initial.checkStatus === 'completed') {
        const approved = RC.beginApproval(final.review, { items: final.items }, { sources: review.sources });
        if (!approved.ok) throw new Error('Il controllo finale non consente la prosecuzione');
        final.review = approved.review;
        await _writeManifest(vaultPath, manifest);
        final.review = RC.completeApproval(approved.review, approved.review.approvedRevision);
        final.stage = 'approved';
      }
      await _writeManifest(vaultPath, manifest);
    }
    if (final.stage === 'awaiting_review') {
      _overlay(false);
      window.MappAIReview.open(vaultPath, manifest, { final: true, onContinue: m => Pipeline.run(m.config, { only: ['B', 'C', 'D', 'E'], vaultPath, manifest: m }) });
      return null;
    }
    if (final.stage === 'approved') {
      const valid = MR.validate ? MR.validate(final.items) : { ok: true };
      if (!valid.ok) throw new Error('Restano materiali incompleti: correggili o escludili prima della consegna');
      manifest.review.drafts = MD.apply(review.drafts, final.items);
      final.stage = 'finalizing';
      await _writeManifest(vaultPath, manifest);
    }
    // Same builders as the legacy pipeline; every input is now a persisted,
    // approved draft. Per-document publication flags make retries idempotent.
    if (config.quiz) manifest = await _passo(vaultPath, manifest, 'B', () => _stepB(vaultPath, manifest, config, apiKey, counter));
    if (config.nodesheet) manifest = await _passo(vaultPath, manifest, 'C', () => _stepC(vaultPath, manifest, config));
    if (config.synthesis) manifest = await _passo(vaultPath, manifest, 'D', () => _stepD(vaultPath, manifest, config, apiKey));
    if (config.causal && manifest.steps.E.status !== 'skipped') manifest = await _passo(vaultPath, manifest, 'E', () => _stepE(vaultPath, manifest, config));
    manifest.review.final.stage = 'done';
    manifest.review.final.completedAt = _now();
    await _writeManifest(vaultPath, manifest);
    return manifest;
  }

  Pipeline.run = async function (config, opts) {
    if (Pipeline._running) { _toast(_t('mp_busy', 'Una pipeline è già in corso'), 'warning'); return; }
    opts = opts || {};
    config = JSON.parse(JSON.stringify(config || {}));
    if (opts.manifest && opts.manifest.review && window.MappAIReview) {
      _state()._pipelineManifest = opts.manifest;
      if (!await window.MappAIReview.requireApproved()) return;
    }
    Pipeline._running = true;
    const counter = { calls: 0 };
    const previousAIContext = _state()._reviewAIContext;
    /* Su un DOSSIER i fogli dei nodi e la catena dei perché non hanno senso
       (i «nodi» sono i blocchi della scheda): si forzano spenti QUI, non solo
       nella UI — una config arrivata da un'altra strada non deve produrre
       documenti vuoti (invariante 21, versione dati). */
    if (config.dossier) { config.nodesheet = null; config.causal = null; }
    /* ⚠️ Stesso congelamento del gesto singolo, e qui pesa di più: gli step A-D
       durano minuti e fanno decine di chiamate. Il contesto si scatta PRIMA di
       tutto e vale fino alla fine — cambiare classe mentre gira non tara più
       metà dei materiali su un altro pubblico. */
    try {
      const cls = config.classId ? (window.MappAIClasses && window.MappAIClasses.get(config.classId)) : null;
      if (!opts.manifest) {
        config.className = cls ? cls.name : (config.className || '');
        config.sede = cls ? (cls.sede || '') : '';
      }
      if (window.MappAITune && window.MappAITune.congela) config.tuningContext = window.MappAITune.congela(config.tuningContext);
      if (!config.aiContext) {
        const provider = _state().aiProvider || 'google';
        const modelElement = document.getElementById('model-select');
        config.aiContext = { provider, model: (modelElement && modelElement.value) || localStorage.getItem(provider === 'infomaniak' ? 'infomaniak_selected_model' : 'gemini_selected_model') || '' };
      }
      _state()._reviewAIContext = config.aiContext;
      const apiKey = window.getSystemKey ? window.getSystemKey() : '';
      const finalReady = opts.manifest && opts.manifest.review && opts.manifest.review.final && ['approved', 'finalizing', 'done'].includes(opts.manifest.review.final.stage);
      if (!apiKey && !finalReady) throw new Error(_t('tst_need_key', "Inserisci un'API Key per continuare"));

      if (opts.presetId) _rememberUsedPreset(config, opts.presetId);
      let vaultPath = opts.vaultPath || null;
      let manifest = opts.manifest || null;

      // ── STEP A (salta se si sta riprendendo / riprovando singoli step) ──
      const doA = !opts.only;
      if (doA && config.dossier) {
        /* ══ IL DOSSIER DI FONTE (20/8) ═══════════════════════════════════════
           Con `config.dossier` (la scheda di analisi confermata dal docente) lo
           step A NON genera una mappa: il grafo del dossier È la scheda —
           root = il titolo della fonte, un ramo per blocco, `desc` = il testo
           del blocco. Deterministico, zero AI.
           PERCHÉ un grafo e non un vault vuoto: un vault senza nodi rompe chi
           lo apre (la console di ELABORA chiede `db.nodes.length`, la pipeline
           genera PER RAMO). Coi blocchi come rami, B e D girano come su una
           mappa qualsiasi e nessuna superficie ha bisogno di una guardia. */
        _overlay(_t('mp_step_dossier', 'Preparo il dossier della fonte…'));
        const VC = window.MappAIVisioneCore;
        if (!VC || !VC.nodiDaScheda) throw new Error('visione-core non caricato');
        const g = VC.nodiDaScheda(config.dossier);
        const st = _state();
        st.rootNodeLabel = config.dossier.titolo || 'Fonte';
        st.extractionMode = 'mindmap';
        st.db = { nodes: g.nodes, links: g.links, sourcesDict: {}, studySets: [], customColors: {} };
        /* Identità NUOVA, esplicita (invariante 20): la rete di
           `saveCurrentProject` scatta solo se la scheda vecchia dichiara un
           vault diverso — e una mappa mai salvata su disco non lo dichiara.
           Un dossier che erediti l'id della mappa aperta prima finirebbe
           scritto nella SUA scheda. */
        if (typeof StorageManager !== 'undefined') StorageManager.currentProjectId = null;

        vaultPath = await _resolveFolderPath(cls);
        const srD = await window.electronAPI.saveVault({ folderPath: vaultPath, mapData: window.buildVaultMapData() });
        if (!srD || !srD.success) throw new Error(_t('mp_vault_fail', 'Salvataggio vault fallito'));
        await _adottaLaCartella(vaultPath);
        manifest = PC().createManifest(config, { now: _now(), vaultPath });
        manifest = PC().stepTransition(manifest, 'A', 'running', { now: _now() });
        await _writeManifest(vaultPath, manifest);

        /* IL DOCUMENTO DELL'ANALISI — la sorgente prima della resa (inv. 18):
           prima la voce d'archivio con la scheda incorporata (riapribile e
           ricorreggibile), poi il PDF nel vault. Un PDF che non esce non
           porta via la scheda. */
        try {
          const htmlAn = window.buildAnalisiFonteHtml(config.dossier, {
            mapName: st.rootNodeLabel, includeBar: false,
            classe: config.className || '', materia: config.disc || ''
          });
          if (window.MappAIStudyDocs) {
            window.MappAIStudyDocs.save({
              kind: 'analisi', title: 'Analisi della fonte — ' + st.rootNodeLabel,
              html: htmlAn, mapName: st.rootNodeLabel,
              cls: config.className || '', disc: config.disc || ''
            });
          }
          const pdfAn = await window.electronAPI.htmlToPdf({ html: htmlAn, options: { landscape: false } });
          if (pdfAn && pdfAn.ok) {
            const nomeAn = PC().buildFileName('analisi_fonte', null, config.tuned, { mappa: st.rootNodeLabel });
            const wAn = await window.electronAPI.saveVaultFile({ vaultPath, relPath: 'Materiale Studio/' + nomeAn, base64: pdfAn.base64 });
            if (wAn && wAn.ok) { manifest = _recordFile(manifest, 'A', 'Materiale Studio/' + nomeAn); }
          } else {
            console.warn('[Pipeline] PDF analisi non generato:', pdfAn && pdfAn.error);
          }
        } catch (e) { console.warn('[Pipeline] analisi della fonte:', e && e.message); }

        /* LA FOTO PIENA in Allegati/ (fase 3): la scheda porta un JPEG da 900px
           (quota localStorage), che PROIETTATO a una LIM sgrana. Il vault deve
           bastare a sé per la lezione (inv. 7) — quindi l'originale entra qui,
           best-effort: una foto che non si copia non ferma il dossier. */
        try {
          const srcFoto = (_state().sources || []).find(x => x && x._scheda === config.dossier);
          const fFoto = srcFoto && srcFoto.file;
          if (fFoto && typeof fFoto.arrayBuffer === 'function') {
            const buf = new Uint8Array(await fFoto.arrayBuffer());
            let bin = '';
            for (let bi2 = 0; bi2 < buf.length; bi2 += 0x8000) bin += String.fromCharCode.apply(null, buf.subarray(bi2, bi2 + 0x8000));
            const ext = (String(fFoto.name || '').match(/\.[a-z0-9]+$/i) || ['.jpg'])[0];
            const FCx = window.MappAIFilesCore;
            const nomeFoto = ((FCx && FCx.safeName) ? FCx.safeName(st.rootNodeLabel, 'fonte') : 'fonte') + ext.toLowerCase();
            await window.electronAPI.saveVaultFile({ vaultPath, relPath: 'Allegati/' + nomeFoto, base64: btoa(bin), ifAbsent: true });
          }
        } catch (e) { console.warn('[Pipeline] foto originale non copiata:', e && e.message); }
        manifest = PC().stepTransition(manifest, 'A', 'done', { now: _now() });
        await _writeManifest(vaultPath, manifest);
        try { if (window.MappAIVaults) window.MappAIVaults.segnala('mappa-creata', { vaultPath: vaultPath }); } catch (e) { }
      } else if (doA) {
        _overlay(_t('mp_step_a', 'Genero la mappa…'));
        _setContext('map');
        /* ⚠️ Impostare `.checked` da JS NON scatena `onchange`: il toggle si
           vedeva acceso ma `MappAITune.levelArmed` restava falso, quindi la
           taratura non finiva nel prompt. Si arma il motore direttamente e la
           spunta lo segue.
           `armLevel(true)` = «semplifica comunque»: chi accende la taratura qui
           chiede una mappa leggibile, quindi il registro SEMPLICE (BES/DSA)
           vince sul preset del profilo, fosse anche «standard» o «ricco». */
        const lt = document.getElementById('level-tune-toggle');
        const _ltPrima = lt ? lt.checked : false;
        const _tunePrima = window.MappAITune
            ? { armed: window.MappAITune.levelArmed, forza: window.MappAITune.levelForceSimple } : null;
        if (lt) lt.checked = !!config.levelTuned;
        if (window.MappAITune) {
            if (config.levelTuned) window.MappAITune.armLevel(true);
            else window.MappAITune.disarmLevel();
        }
        try {
            Pipeline._interno = true;          // la pipeline non blocca sé stessa
            await window.startGeneration();
        } finally {
            Pipeline._interno = false;
            /* La taratura vale per QUESTA mappa, non per il resto della sessione:
               lasciarla armata farebbe uscire semplificata anche la prossima
               generazione fatta a mano, senza che nessuno l'abbia chiesto. */
            if (lt) lt.checked = _ltPrima;
            if (window.MappAITune && _tunePrima) {
                window.MappAITune.levelArmed = _tunePrima.armed;
                window.MappAITune.levelForceSimple = _tunePrima.forza;
            }
        }
        const mv = PC().validateMapResult(_state().db);
        if (!mv.ok) throw new Error(_t('mp_map_fail', 'Mappa non valida: ') + mv.error);
        vaultPath = await _resolveFolderPath(cls);
        const sr = await window.electronAPI.saveVault({ folderPath: vaultPath, mapData: window.buildVaultMapData() });
        if (!sr || !sr.success) throw new Error(_t('mp_vault_fail', 'Salvataggio vault fallito'));
        await _adottaLaCartella(vaultPath);
        manifest = PC().createManifest(config, { now: _now(), vaultPath });
        manifest = PC().stepTransition(manifest, 'A', 'running', { now: _now() });
        await _writeManifest(vaultPath, manifest);
        /* La fonte originale, se chiesta: subito dopo il vault, prima dei
           materiali. Se fallisce non ferma la pipeline — è una copia di
           cortesia, non un passo della generazione. */
        if (config.sourcePdf && window.MappAIElabora && window.MappAIElabora.copySourcesTo) {
          try { await window.MappAIElabora.copySourcesTo(vaultPath, 'Allegati'); } catch (e) { }
        }
        manifest = PC().stepTransition(manifest, 'A', 'done', { now: _now() });
        await _writeManifest(vaultPath, manifest);
      }
      if (!vaultPath || !manifest) throw new Error('Stato pipeline incompleto');
      if (window.MappAITune && window.MappAITune.congela && config.tuningContext) window.MappAITune.congela(config.tuningContext);
      manifest.config = config;
      if (window.MappAIReview) {
        manifest = await window.MappAIReview.checkpoint(vaultPath, manifest);
        if (manifest.review && !window.MappAIReviewCore.gate(manifest.review, _state().db, manifest.review.sources).allowed) {
          _overlay(false); window.MappAIReview.open(vaultPath, manifest); return;
        }
        if (manifest.review && !manifest.review.drafts) {
          manifest.review.drafts = { B: {}, C: {} };
          await _writeManifest(vaultPath, manifest);
        }
      }

      /* Da qui in poi i passi leggono `appState`: si fotografa l'identità della
         mappa e la si ricontrolla prima di ognuno. */
      Pipeline._identita = _identita();

      const wants = function (s) { return !opts.only || opts.only.indexOf(s) >= 0; };
      // Un tentativo su uno step failed → resettalo a running via failed→running dentro _stepX.
      if (config.quiz && wants('B') && !['done', 'skipped'].includes(manifest.steps.B.status)) manifest = await _passo(vaultPath, manifest, 'B', () => _stepB(vaultPath, manifest, config, apiKey, counter));
      if (config.nodesheet && wants('C') && !['done', 'skipped'].includes(manifest.steps.C.status)) manifest = await _passo(vaultPath, manifest, 'C', () => _stepC(vaultPath, manifest, config));
      if (config.synthesis && wants('D') && !['done', 'skipped'].includes(manifest.steps.D.status)) manifest = await _passo(vaultPath, manifest, 'D', () => _stepD(vaultPath, manifest, config, apiKey));
      if (config.causal && wants('E') && manifest.steps.E && !['done', 'skipped'].includes(manifest.steps.E.status)) manifest = await _passo(vaultPath, manifest, 'E', () => _stepE(vaultPath, manifest, config));

      if (manifest.review) {
        const completed = await _finishReviewed(vaultPath, manifest, config, apiKey, counter);
        if (!completed) return;
        manifest = completed;
      }

      // Rendi i set quiz/flashcard accessibili SUBITO dalla pagina Insegna
      // (indice mappai_studysets_index + progetto) senza attendere un autosave:
      // il docente li trova pronti sia a mappa aperta sia in Insegna (openSet).
      try { if (typeof StorageManager !== 'undefined' && StorageManager.saveCurrentProject) StorageManager.saveCurrentProject(); } catch (e) { /* best-effort */ }
      if (window.MappAITeach && window.MappAITeach.refresh) { try { window.MappAITeach.refresh(); } catch (e) {} }

      _overlay(false);
      _openSummary(vaultPath, manifest, config);
    } catch (err) {
      _overlay(false);
      _toast(_t('mp_error', 'Pipeline interrotta: ') + (err.message || err), 'error');
      console.error('[MappAIPipeline]', err);
    } finally {
      _state()._reviewAIContext = previousAIContext;
      Pipeline._running = false;
      Pipeline._interno = false;
      Pipeline._identita = null;
      /* SEMPRE, anche su errore: un contesto rimasto gelato tarerebbe di
         nascosto tutto il resto della sessione */
      try { if (window.MappAITune && window.MappAITune.scongela) window.MappAITune.scongela(); } catch (e) { }
      _veloACasa();      // anche su errore: un velo orfano dentro CREA resterebbe lì
    }
  };

  // ══════════════════════════════════════════════════════════════════════
  // Modale di configurazione
  // ══════════════════════════════════════════════════════════════════════
  function _classOptions() {
    const list = (window.MappAIClasses && window.MappAIClasses.list) ? window.MappAIClasses.list() : [];
    const active = (window.MappAIClasses && window.MappAIClasses.getActive) ? window.MappAIClasses.getActive() : null;
    let html = '<option value="">' + _esc(_t('mp_no_class', 'Senza classe')) + '</option>';
    list.forEach(c => {
      const sel = (active && active.id === c.id) ? ' selected' : '';
      const sede = c.sede ? (' · ' + _esc(c.sede)) : '';
      html += '<option value="' + _esc(c.id) + '"' + sel + '>' + _esc(c.name) + sede + '</option>';
    });
    return html;
  }
  function _levelOptions() {
    const nodes = (_state().db && _state().db.nodes) || [];
    let maxLv = 0; nodes.forEach(n => { if ((n.level || 0) > maxLv) maxLv = (n.level || 0); });
    let html = '<option value="all" selected>' + _esc(_t('mp_all_levels', 'Tutti i livelli')) + '</option>';
    for (let lv = 1; lv <= Math.min(maxLv, 5); lv++) html += '<option value="' + lv + '">' + _esc(_t('mp_upto_level', 'Fino al livello')) + ' ' + lv + '</option>';
    return html;
  }

  // ── Preset (US3) — localStorage 'mappai_material_presets', mai la classe ──
  function _presetKey() { return 'mappai_material_presets'; }
  function _loadPresets() {
    try { const a = JSON.parse(localStorage.getItem(_presetKey()) || '[]'); return Array.isArray(a) ? a.map(p => PC().presetNormalize(p)) : []; }
    catch (e) { return []; }
  }
  function _savePresets(list) { try { localStorage.setItem(_presetKey(), JSON.stringify(list)); } catch (e) {} }
  function _presetOptions() {
    const list = _loadPresets();
    if (!list.length) return '<option value="">' + _esc(_t('mp_no_presets', 'Nessun preset salvato')) + '</option>';
    return list.map(p => '<option value="' + _esc(p.id) + '">' + _esc(p.name) + '</option>').join('');
  }
  function _refreshPresetSelect() { const s = _configElement('mp-preset'); if (s) s.innerHTML = _presetOptions(); }

  // Una proposta nuova, senza riscrivere le opzioni dei preset personali o dei manifest.
  var CHIAVE_PRESET_ATTIVO = 'mappai_preset_attivo';
  var PRESET_LOTTO_ID = 'mappai-first-batch-v1';
  const LAST_USED_PRESET = 'mappai_material_last_used';
  function _lastUsedPreset() {
    try { return JSON.parse(localStorage.getItem(LAST_USED_PRESET) || 'null'); } catch (_) { return null; }
  }
  function _rememberUsedPreset(config, presetId) {
    if (!presetId || !_loadPresets().some(p => p.id === presetId)) return;
    localStorage.setItem(LAST_USED_PRESET, JSON.stringify({ presetId, options: PC().presetFromConfig(config) }));
    localStorage.setItem(CHIAVE_PRESET_ATTIVO, presetId);
  }
  function _ensureInitialBatch() {
    const list = _loadPresets();
    let p = list.find(x => x.id === PRESET_LOTTO_ID);
    if (!p) {
      p = PC().presetNormalize({ id: PRESET_LOTTO_ID, name: _t('mp_first_batch', 'Primo lotto'),
        createdAt: _now(), options: PC().initialBatchOptions() });
      // Non eliminare il preset più vecchio per inserire una proposta dell'app.
      _savePresets([p].concat(list));

    }
    return p;
  }
  Pipeline.assicuraPresetDefault = function () {
    const initial = _ensureInitialBatch();
    const list = _loadPresets();
    let selected = null;
    try { selected = localStorage.getItem(CHIAVE_PRESET_ATTIVO); } catch (e) { }
    // Un vecchio Default resta valido; nessuna migrazione delle scelte del docente.
    const used = _lastUsedPreset();
    const usedPreset = used?.options && list.find(x => x.id === used.presetId);
    const active = usedPreset || list.find(x => x.id === selected) || list.find(x => x.name.toLowerCase() === 'default') || initial;
    _refreshPresetSelect();
    const sel = _configElement('mp-preset');
    if (sel) { sel.value = active.id; Pipeline._applyPreset({ silenzioso: true }); }
    if (usedPreset) {
      _applyOptions(PC().presetNormalize({ options: used.options }).options);
      return Object.assign({}, active, { usedForGeneration: true });
    }
    return active;
  };
  Pipeline.applyInitialBatch = function () {
    const initial = _ensureInitialBatch();
    _refreshPresetSelect();
    const sel = _configElement('mp-preset');
    if (sel) { sel.value = initial.id; Pipeline._applyPreset(); }
  };

  function _applyOptions(o) {
    const set = (id, v) => { const e = _configElement(id); if (e) e.checked = !!v; };
    const val = (id, v) => { const e = _configElement(id); if (e && v != null) e.value = v; };
    set('mp-quiz-on', !!o.quiz);
    set('mp-qt-mixed', !!o.quiz?.mixed);
    val('mp-fc-count', PC().quantiPerTipo(o.quiz, 'flashcards', o.quiz?.perBranch || 5));
    if (o.sourcePdf !== undefined) set('mp-src-pdf', !!o.sourcePdf);   /* il preset dice anche del PDF allegato (7/9) */
    if (o.quiz) { set('mp-qt-mc', !o.quiz.mixed && o.quiz.types.indexOf('mc') >= 0); set('mp-qt-fc', o.quiz.types.indexOf('flashcards') >= 0); set('mp-qt-open', !o.quiz.mixed && o.quiz.types.indexOf('open') >= 0); val('mp-perbranch', o.quiz.perBranch); val('mp-angle', o.quiz.angle);
      const ang = PC().multiTypes(o.quiz).length ? (o.quiz.angoli || []) : [];
      PC().angoliMulti().forEach(k => set('mp-ang-' + k, ang.indexOf(k) >= 0)); }
    if (!o.quiz) ['mp-qt-mc', 'mp-qt-open', 'mp-qt-fc'].forEach(id => set(id, false));
    set('mp-ns-on', !!o.nodesheet);
    if (!o.nodesheet) ['mp-ns-title', 'mp-ns-keywords', 'mp-ns-summary', 'mp-ns-card'].forEach(id => set(id, false));
    if (o.nodesheet) { val('mp-ns-level', o.nodesheet.maxLevel === 'all' ? 'all' : String(o.nodesheet.maxLevel)); val('mp-ns-fmt', o.nodesheet.fmt); set('mp-ns-title', o.nodesheet.modes.indexOf('title') >= 0); set('mp-ns-keywords', o.nodesheet.modes.indexOf('keywords') >= 0); set('mp-ns-summary', o.nodesheet.modes.indexOf('summary') >= 0); set('mp-ns-card', o.nodesheet.modes.indexOf('card') >= 0); }
    /* la catena è fuori da `nodesheet` dal 5/8; `presetNormalize` la legge anche
       dai preset vecchi, qui basta il campo nuovo */
    set('mp-ns-causal', !!o.causal);
    set('mp-syn-on', !!o.synthesis);
    if (o.synthesis) set('mp-syn-audio', o.synthesis.audio);
    // «Adatta alla classe»: master + ambito derivati da tuned/levelTuned del preset.
    const adaptOn = !!(o.tuned || o.levelTuned);
    set('mp-adapt-on', adaptOn);
    let scope = 'both';
    if (o.levelTuned && !o.tuned) scope = 'map';
    else if (o.tuned && !o.levelTuned) scope = 'materials';
    const r = _configRoot().querySelector('input[name="mp-adapt-scope"][value="' + scope + '"]');
    if (r) r.checked = true;
    _syncSections(); Pipeline._reestimate();
  }

  Pipeline._applyPreset = function (opts) {
    const s = _configElement('mp-preset');
    if (!s || !s.value) { _toast(_t('mp_pick_preset', 'Scegli un preset dalla lista'), 'warning'); return; }
    const p = _loadPresets().filter(x => x.id === s.value)[0]; if (!p) return;
    _applyOptions(p.options || {});
    /* ⚠️ `.checked = x` da JS non scatena `change` (trappola 10): senza questa
       riga il preset appena applicato non finirebbe nella memoria dei box
       nascosti, e al riavvio tornerebbe quello di prima. */
    try { if (!(opts && opts.silenzioso) && _configRoot() === document && window.MappAICostruisci && window.MappAICostruisci.memorizza) window.MappAICostruisci.memorizza(); } catch (e) { }
    /* Applicato al BOOT (il preset «Default») non si annuncia: un toast a ogni
       avvio per una cosa che l'utente non ha chiesto è rumore. Applicato col
       bottone sì: lì è la risposta al suo gesto. */
    if (!(opts && opts.silenzioso)) {
      /* scelto A MANO: da qui in poi è questo che governa gli avvii successivi */
      try { localStorage.setItem(CHIAVE_PRESET_ATTIVO, p.id); } catch (e) { }
      _toast(_t('mp_applied', 'Preset applicato: ') + p.name, 'success');
    }
  };

  Pipeline._savePreset = function () {
    const cfg = _readConfig(); if (!cfg) return;
    // window.prompt NON è supportato in Electron → prompt custom dell'app.
    const commit = function (name) {
      name = String(name == null ? '' : name).trim();
      if (!name) { _toast(_t('mp_preset_noname', 'Serve un nome per il preset'), 'warning'); return; }
      let list = _loadPresets();
      list = PC().presetListPush(list, { name: name, createdAt: _now(), options: PC().presetFromConfig(cfg) }, 50);
      _savePresets(list); _refreshPresetSelect();
      const saved = list[list.length - 1], select = _configElement('mp-preset');
      if (select) select.value = saved.id;
      localStorage.setItem(CHIAVE_PRESET_ATTIVO, saved.id);
      _toast(_t('mp_preset_saved', 'Preset salvato'), 'success');
    };
    if (window.showPrompt) window.showPrompt(_t('mp_preset_name', 'Nome del preset'), '', commit, _t('mp_preset_name_desc', 'Salva le opzioni correnti (senza la classe) per riusarle.'));
    else commit(window.prompt ? window.prompt(_t('mp_preset_name', 'Nome del preset:'), '') : '');
  };

  Pipeline._deletePreset = function () {
    const s = _configElement('mp-preset'); if (!s || !s.value) { _toast(_t('mp_pick_preset', 'Scegli un preset dalla lista'), 'warning'); return; }
    const list = _loadPresets().filter(x => x.id !== s.value);
    if (_lastUsedPreset()?.presetId === s.value) localStorage.removeItem(LAST_USED_PRESET);
    _savePresets(list); _refreshPresetSelect();
    _toast(_t('mp_preset_deleted', 'Preset eliminato'), 'info');
  };

  Pipeline.openModal = function (options) {
    Pipeline._reviewTarget = options && options.fromApproved && _state()._pipelineManifest?.review ? { vaultPath: _state().activeVaultPath, revision: _state()._pipelineManifest.review.approvedRevision } : null;
    if (Pipeline._running) { _toast(_t('mp_busy', 'Una pipeline è già in corso'), 'warning'); return; }
    if (!Pipeline._reviewTarget && (!_state().sources || !_state().sources.length)) {
      _toast(_t('mp_need_source', 'Carica almeno una fonte prima di generare i materiali'), 'warning');
      return;
    }
    const currentConfig = _readConfig();
    const currentPresetId = _configElement('mp-preset')?.value;
    const old = _configElement('mp-modal'); if (old) old.remove();
    // Opzione checkbox leggibile (label slate-700 12.5px).
    const chk = (id, label, checked) =>
      '<label class="flex items-center gap-2 cursor-pointer select-none">' +
      '<input type="checkbox" id="' + id + '"' + (checked ? ' checked' : '') + ' class="w-[16px] h-[16px] accent-indigo-600 shrink-0">' +
      '<span class="text-[12.5px] font-semibold text-slate-700">' + _esc(label) + '</span></label>';
    // Header di sezione attivabile: checkbox + titolo bold leggibile.
    const secHeader = (id, label) =>
      '<label class="flex items-center gap-2.5 cursor-pointer select-none">' +
      '<input type="checkbox" id="' + id + '" checked class="w-[17px] h-[17px] accent-indigo-600 shrink-0">' +
      '<span class="text-[13.5px] font-bold text-slate-800">' + _esc(label) + '</span></label>';
    // Etichetta inline di un campo (leggibile).
    const fld = (label, inner) =>
      '<label class="flex items-center gap-2 text-[12px] font-semibold text-slate-600">' + _esc(label) + ' ' + inner + '</label>';
    // Radio di scelta ambito (Adatta alla classe): label bold + descrizione grigia.
    const adaptRadio = (val, label, desc, checked) =>
      '<label class="flex items-start gap-2 cursor-pointer select-none">' +
      '<input type="radio" name="mp-adapt-scope" value="' + val + '"' + (checked ? ' checked' : '') + ' class="mt-1 accent-indigo-600 shrink-0">' +
      '<span><span class="text-[12.5px] font-semibold text-slate-700">' + _esc(label) + '</span> ' +
      '<span class="text-[11px] text-slate-400">— ' + _esc(desc) + '</span></span></label>';
    const SEL = 'px-2.5 py-1.5 rounded-lg border border-slate-200 text-[12px] font-semibold text-slate-700 bg-white';
    const SECT = 'bg-slate-50 rounded-xl px-4 py-3.5 border border-slate-100';
    const SUBTITLE = 'block text-[10.5px] font-bold uppercase tracking-widest text-slate-400 mb-2';

    const modal = document.createElement('div');
    modal.id = 'mp-modal';
    modal.className = 'fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-[3200] flex items-center justify-center p-4';
    modal.innerHTML =
      '<div class="bg-white rounded-2xl shadow-2xl w-[94vw] max-w-[600px] max-h-[90vh] overflow-y-auto p-6 relative">' +
        '<button type="button" id="mp-close" class="absolute top-5 right-5 text-slate-400 hover:text-slate-600"><i data-lucide="x" class="w-5 h-5"></i></button>' +
        '<div class="flex items-center gap-3 mb-5"><div class="pm-icon-wrap"><i data-lucide="package" class="w-5 h-5 text-indigo-600"></i></div>' +
          '<div><div class="pm-title">' + _esc(_t('mp_title', 'Genera materiali')) + '</div>' +
          '<div class="pm-subtitle">' + _esc(_t('mp_subtitle', 'Mappa + quiz + fogli nodi + sintesi, archiviati nel vault')) + '</div></div></div>' +
        '<div class="space-y-3">' +
          // Classe + Preset (riga compatta)
          '<div class="' + SECT + '"><span class="' + SUBTITLE + '">' + _esc(_t('mp_class', 'Classe destinataria')) + '</span>' +
            '<select id="mp-class" class="w-full ' + SEL + '">' + _classOptions() + '</select>' +
            '<span class="' + SUBTITLE + '" style="margin-top:12px">' + _esc(_t('mp_presets', 'Preset')) + '</span>' +
            '<div class="flex gap-2 items-center flex-wrap">' +
              '<select id="mp-preset" class="flex-1 min-w-[150px] ' + SEL + '">' + _presetOptions() + '</select>' +
              '<button type="button" id="mp-preset-apply" class="pm-btn-cancel" style="flex:none;padding:6px 12px">' + _esc(_t('mp_apply', 'Applica')) + '</button>' +
              '<button type="button" id="mp-preset-save" class="pm-btn-cancel" style="flex:none;padding:6px 12px">' + _esc(_t('mp_save', 'Salva')) + '</button>' +
              '<button type="button" id="mp-preset-del" class="pm-btn-cancel" style="flex:none;padding:6px 12px">' + _esc(_t('mp_delete', 'Elimina')) + '</button>' +
            '</div></div>' +
          // Quiz
          '<div class="' + SECT + '">' + secHeader('mp-quiz-on', _t('mp_quiz', 'Quiz e flashcard')) +
            '<div id="mp-quiz-body" class="mt-3 space-y-3">' +
              '<div class="flex gap-x-5 gap-y-2 flex-wrap">' + chk('mp-qt-mixed', _t('mp_mixed_set', 'Lotto misto'), true) + chk('mp-qt-mc', _t('mp_qt_mc', 'Scelta multipla'), false) + chk('mp-qt-fc', _t('mp_qt_fc', 'Flashcard'), false) + chk('mp-qt-open', _t('mp_qt_open', 'Domande aperte'), false) + '</div>' +
              '<p class="text-sm text-slate-600">' + _esc(_t('mp_mixed_set_help', 'Lotto misto: 2 MC e 2 aperte per ramo. Per quantità e angolazioni personalizzate scegli i formati separati.')) + '</p>' +
              '<div class="flex gap-5 items-center flex-wrap">' +
                fld(_t('mp_perbranch', 'Per ramo'), '<input type="number" id="mp-perbranch" min="1" max="10" value="2" class="w-[56px] ' + SEL + '">') +
                fld(_t('mp_flashcard_count', 'Flashcard per ramo'), '<input type="number" id="mp-fc-count" min="1" max="30" value="5" class="w-[56px] ' + SEL + '">') +
                fld(_t('mp_angle', 'Angolo'), '<select id="mp-angle" class="' + SEL + '">' + (window.buildQuizAngleOptions ? window.buildQuizAngleOptions('auto') : '<option value="auto">auto</option>') + '</select>') +
              '</div>' +
              '<details><summary>' + _esc(_t('mp_multi_optional', 'Varianti aggiuntive per angolazione')) + '</summary><div class="flex gap-x-5 gap-y-2 flex-wrap">' +
                PC().angoliMulti().map(k => chk('mp-ang-' + k, window.quizAngleLabel ? window.quizAngleLabel(k) : k, false)).join('') +
              '</div></details></div></div>' +
          // Foglio nodi
          '<div class="' + SECT + '">' + secHeader('mp-ns-on', _t('mp_nodesheet', 'Fogli nodi')) +
            '<div id="mp-ns-body" class="mt-3 space-y-3">' +
              '<div class="flex gap-5 items-center flex-wrap">' +
                fld(_t('mp_level', 'Livello'), '<select id="mp-ns-level" class="' + SEL + '">' + _levelOptions() + '</select>') +
                fld(_t('mp_fmt', 'Formato'), '<select id="mp-ns-fmt" class="' + SEL + '"><option value="3x4">3×4</option><option value="2x2" selected>2×2</option><option value="2x1">2×1</option></select>') +
              '</div>' +
              '<div class="flex gap-x-5 gap-y-2 flex-wrap">' + chk('mp-ns-title', _t('mp_mode_title', 'Titolo'), true) + chk('mp-ns-keywords', _t('mp_mode_kw', 'Parole chiave'), false) + chk('mp-ns-summary', _t('mp_mode_summary', 'Da completare'), false) + chk('mp-ns-card', _t('mp_mode_card', 'Scheda'), false) + '</div>' +
              chk('mp-ns-causal', _t('mp_causal', 'Includi «Catena dei perché»'), false) + '</div></div>' +
          // Sintesi
          '<div class="' + SECT + '">' + secHeader('mp-syn-on', _t('mp_synthesis', 'Sintesi della mappa')) +
            '<div id="mp-syn-body" class="mt-3">' + chk('mp-syn-audio', _t('mp_audio', 'Voce naturale (audio MP3)'), false) + '</div></div>' +
          /* Fonte originale accanto ai materiali. Il default cambia col contesto:
             per una CLASSE no — il PDF di partenza è già nelle mani del docente e
             duplicarlo in ogni vault di classe riempie il disco; per un ALLIEVO
             sì — la sua cartella deve bastare a sé stessa, perché è quello che
             gli si consegna. */
          '<div class="' + SECT + '">' +
            chk('mp-src-pdf', _t('mp_src_pdf', 'Salva la fonte originale in «Allegati»'), _pdfDefault()) +
            '<p class="text-[11px] text-slate-500 leading-relaxed mt-2 ml-[26px]">' +
              _esc(_t('mp_src_pdf_help', 'Il PDF di partenza resta nel vault, accanto ai materiali generati.')) +
            '</p></div>' +
          // Adatta alla classe (C): master + ambito. La classe attiva è già il contesto
          // base ovunque; qui scegli cosa affinare IN PIÙ (mappa e/o materiali).
          '<div class="' + SECT + '">' +
            '<label class="flex items-center gap-2.5 cursor-pointer select-none">' +
              '<input type="checkbox" id="mp-adapt-on" class="w-[17px] h-[17px] accent-indigo-600 shrink-0">' +
              '<span class="text-[13.5px] font-bold text-slate-800">' + _esc(_t('mp_adapt', 'Adatta alla classe')) + ' <span id="mp-adapt-cls" class="text-indigo-600"></span></span>' +
            '</label>' +
            '<div id="mp-adapt-body" class="mt-3 space-y-2">' +
              '<p class="text-[11px] text-slate-500 leading-relaxed">' + _esc(_t('mp_adapt_help', 'La classe attiva è già il contesto di base. Scegli cosa affinare in più:')) + '</p>' +
              adaptRadio('map', _t('mp_adapt_map', 'Solo la mappa'), _t('mp_adapt_map_desc', 'profondità e complessità dei contenuti sul grado'), false) +
              adaptRadio('materials', _t('mp_adapt_materials', 'Solo i materiali'), _t('mp_adapt_materials_desc', 'registro e note su quiz, fogli e sintesi → file [VERDE]'), false) +
              adaptRadio('both', _t('mp_adapt_both', 'Entrambi'), _t('mp_adapt_both_desc', 'mappa sul grado + materiali [VERDE]'), true) +
            '</div></div>' +
        '</div>' +
        // Footer
        '<div class="mt-5 pt-4 border-t border-slate-100">' +
          '<div id="mp-estimate" class="text-[12px] font-semibold text-slate-600 mb-3"></div>' +
          '<div class="flex gap-3"><button type="button" id="mp-cancel" class="pm-btn-cancel">' + _esc(_t('ui_cancel', 'Annulla')) + '</button>' +
          '<button type="button" id="mp-start" class="pm-btn-primary" style="flex:1;justify-content:center"><i data-lucide="play" class="w-4 h-4"></i> ' + _esc(_t('mp_start', 'Avvia')) + '</button></div></div>' +
      '</div>';
    document.body.appendChild(modal);
    _icons();

    modal.querySelector('#mp-close').onclick = () => modal.remove();
    modal.querySelector('#mp-cancel').onclick = () => modal.remove();
    modal.querySelector('#mp-start').onclick = () => Pipeline._startFromModal();
    modal.querySelector('#mp-preset-apply').onclick = () => Pipeline._applyPreset();
    modal.querySelector('#mp-preset-save').onclick = () => Pipeline._savePreset();
    modal.querySelector('#mp-preset-del').onclick = () => Pipeline._deletePreset();
    modal.addEventListener('change', event => { if (event.target.id === 'mp-preset') Pipeline._applyPreset(); Pipeline._syncQuizSelection(event.target.id); _syncSections(); Pipeline._reestimate(); });
    modal.addEventListener('input', () => Pipeline._reestimate());
    const esc = (e) => { if (e.key === 'Escape') { modal.remove(); document.removeEventListener('keydown', esc); } };
    document.addEventListener('keydown', esc);
    Pipeline.assicuraPresetDefault();
    if (currentConfig) {
      _applyOptions(PC().presetFromConfig(currentConfig));
      if (currentPresetId) _configElement('mp-preset').value = currentPresetId;
    }
    _syncSections();
    Pipeline._reestimate();
  };

  Pipeline._syncQuizSelection = function (changedId) {
    const mixed = _configElement('mp-qt-mixed');
    if (!mixed) return;
    const separate = ['mp-qt-mc', 'mp-qt-open'];
    if (separate.includes(changedId) && _configElement(changedId)?.checked) mixed.checked = false;
    if (mixed.checked) {
      separate.forEach(id => { const field = _configElement(id); if (field) field.checked = false; });
      const quantity = _configElement('mp-perbranch'), angle = _configElement('mp-angle');
      if (quantity) quantity.value = 2;
      if (angle) angle.value = 'auto';
      PC().angoliMulti().forEach(key => { const field = _configElement('mp-ang-' + key); if (field) field.checked = false; });
    }
    ['mp-perbranch', 'mp-angle'].forEach(id => { const field = _configElement(id); if (field) field.disabled = mixed.checked; });
    const flashCount = _configElement('mp-fc-count');
    if (flashCount) flashCount.disabled = !_configElement('mp-qt-fc')?.checked;
    const variants = !mixed.checked && separate.some(id => _configElement(id)?.checked);
    PC().angoliMulti().forEach(key => { const field = _configElement('mp-ang-' + key); if (field) field.disabled = !variants; });
  };

  function _syncSections() {
    Pipeline._syncQuizSelection();
    const on = (id) => { const e = _configElement(id); return e ? e.checked : false; };
    const body = (id, vis) => { const e = _configElement(id); if (e) e.style.display = vis ? '' : 'none'; };
    body('mp-quiz-body', on('mp-quiz-on'));
    body('mp-ns-body', on('mp-ns-on'));
    body('mp-syn-body', on('mp-syn-on'));
    body('mp-adapt-body', on('mp-adapt-on'));
    // Nome classe nel master toggle «Adatta alla classe».
    const sel = _configElement('mp-class');
    const lbl = _configElement('mp-adapt-cls');
    if (sel && lbl) {
      const cls = (sel.value && window.MappAIClasses && window.MappAIClasses.get) ? window.MappAIClasses.get(sel.value) : null;
      lbl.textContent = cls ? cls.name : '';
    }
  }

  /* Legge la config dai campi `mp-*`, ovunque siano montati: il MODALE storico
     oppure il BENTO di COSTRUISCI in stile manifesto (#mn-bento), che porta gli
     stessi id apposta. Una lettura sola per due superfici: una copia qui
     divergerebbe al primo campo aggiunto. Null se non c'è nessuna delle due. */
  function _readConfig() {
    const g = (id) => _configElement(id);
    if (!g('mp-modal') && !g('mn-bento')) return null;
    const on = (id) => g(id) && g(id).checked;
    // «Adatta alla classe»: master + ambito → levelTuned (mappa) e/o tuned (materiali VERDE).
    const adaptOn = !!on('mp-adapt-on');
    const scopeEl = _configRoot().querySelector('input[name="mp-adapt-scope"]:checked');
    const scope = adaptOn ? (scopeEl ? scopeEl.value : 'both') : 'none';
    const cfg = {
      classId: (g('mp-class') && g('mp-class').value) || '',
      levelTuned: adaptOn && (scope === 'map' || scope === 'both'),
      tuned: adaptOn && (scope === 'materials' || scope === 'both')
    };
    if (on('mp-quiz-on')) {
      const mixed = !!on('mp-qt-mixed');
      const types = mixed ? ['mc', 'open'] : [];
      if (!mixed && on('mp-qt-mc')) types.push('mc');
      if (on('mp-qt-fc')) types.push('flashcards');
      if (!mixed && on('mp-qt-open')) types.push('open');
      if (types.length) {
        cfg.quiz = { types, perBranch: Math.max(1, Math.min(10, parseInt(g('mp-perbranch').value, 10) || 2)), angle: (g('mp-angle') && g('mp-angle').value) || 'auto' };
        /* «Più set per angolo»: un materiale per ognuno degli angoli spuntati
           invece che uno solo, per i generi che lo ammettono (aperte, MC). Le
           caselle-angolo vivono nel BENTO (vista estesa) e nel modale storico
           non esistono: senza angoli `multiTypes` ritorna [] e la generazione
           resta quella di sempre — la strada vecchia non cambia (inv. 1).
           Il filtro contro `types` lo fa il core: chiedere più set per un genere
           non spuntato sarebbe una generazione che non avviene. */
        const multi = ['open', 'mc'];
        /* gli angoli si leggono dalle caselle, non da un elenco scritto qui:
           l'elenco vero è `QUIZ_ANGLES`, e una copia divergerebbe (inv. 6) */
        const angoli = PC().angoliMulti().filter(k => on('mp-ang-' + k));
        cfg.quiz.angoli = angoli;
        cfg.quiz.multi = PC().multiTypes({ multi, types, angoli });
        if (mixed) Object.assign(cfg.quiz, { mixed: true, perBranch: 2, angle: 'auto', multi: [], angoli: [] });
        if (g('mp-fc-count')) cfg.quiz.perTipo = { flashcards: Math.max(1, Math.min(30, parseInt(g('mp-fc-count').value, 10) || 5)) };
      }
    }
    if (on('mp-ns-on')) {
      const modes = [];
      if (on('mp-ns-title')) modes.push('title');
      if (on('mp-ns-keywords')) modes.push('keywords');
      if (on('mp-ns-summary')) modes.push('summary');
      if (on('mp-ns-card')) modes.push('card');
      const lvRaw = g('mp-ns-level') && g('mp-ns-level').value;
      /* `causal: false` fisso: dal 5/8 la catena è un materiale suo (step E) e
         non una coda del PDF dei fogli. Il campo resta nella forma per non
         cambiare la firma di `printAllNodeLabels`, che il flusso manuale usa. */
      cfg.nodesheet = { maxLevel: (lvRaw === 'all' || !lvRaw) ? 'all' : parseInt(lvRaw, 10), fmt: (g('mp-ns-fmt') && g('mp-ns-fmt').value) || '2x2', modes: modes.length ? modes : ['title'], causal: false };
    }
    if (on('mp-syn-on')) cfg.synthesis = { audio: !!on('mp-syn-audio') };
    /* materiale INDIPENDENTE: si spunta e si ottiene, senza chiedere i fogli nodi */
    cfg.causal = !!on('mp-ns-causal');
    cfg.sourcePdf = !!on('mp-src-pdf');
    return cfg;
  }

  /* «C'è almeno un materiale da produrre?» — la definizione vive in
     `PipelineCore.hasOutput` (pura, testata): è la stessa domanda che decide
     quali step nascono 'pending' nel manifest, e prima stava scritta a mano in
     tre punti di questo file. `_hasOutputNow()` la applica a ciò che è a schermo,
     ed è quello che il bento chiede per sapere se il suo bottone dice «Genera
     materiali» o «Genera Mappa» — così il bento non deve sapere quali campi sono
     materiali (alla prossima aggiunta le due liste divergerebbero). */
  function _hasOutput(cfg) { return PC().hasOutput(cfg); }
  Pipeline._hasOutputNow = function () { return _hasOutput(_readConfig()); };

  /* Con un profilo ALLIEVO attivo la fonte si conserva di default: la sua
     cartella è ciò che gli si consegna e deve bastare a sé stessa. Per una
     classe no — il PDF di partenza il docente ce l'ha già, e copiarlo in ogni
     vault riempie il disco senza dare niente in più. */
  function _pdfDefault() {
    try {
      var CL = window.MappAIClasses;
      return !!(CL && CL.activeStudentName && CL.activeStudentName());
    } catch (e) { return false; }
  }

  Pipeline._reestimate = function () {
    const el = _configElement('mp-estimate'); if (!el) return;
    const cfg = _readConfig(); if (!cfg) return;
    if (!_hasOutput(cfg)) { el.innerHTML = _esc(_t('mp_pick_one', 'Attiva almeno una sezione di output.')); return; }
    const est = PC().estimateCalls(cfg, _mapStats());
    el.innerHTML = _esc(_t('mp_estimate', 'Stima chiamate AI') + ': ~' + est.total) +
      ' <span style="opacity:.6">(A ' + est.perStep.A + ' · B ' + est.perStep.B + ' · C ' + est.perStep.C + ' · D ' + est.perStep.D + ')</span>' + (window.MappAIReview && window.MappAIReview.enabled() ? ' <span>' + _esc(_t('rv_estimate_checks', '+ controlli sui contenuti')) + '</span>' : '')
      + _budgetHtml(cfg);
  };

  /* ── IL BUDGET, accanto alla stima ─────────────────────────────────────────
     La stima dice quanto COSTA; questo dice se la fonte REGGE quello che si sta
     per chiedere. Sta nello stesso elemento e nello stesso ciclo perché è la
     stessa domanda in due metà, e perché un secondo riquadro sarebbe un secondo
     posto da guardare.
     NON blocca e non cambia le spunte: fa VEDERE il rapporto prima di generare.
     Con 47 frasi e 252 domande il docente sa, e decide lui. */
  /* «1 angolazioni» non si dice, e «una angolazione» nemmeno — in italiano
     l'articolo si elide davanti a vocale. Una riga d'avviso che sgrammatica si
     legge come un difetto dell'app prima ancora del suo contenuto. */
  function _angoliDette(n) {
    return n === 1 ? _t('mp_budget_ang_1', 'un\u2019angolazione') : n + ' ' + _t('mp_budget_ang_n', 'angolazioni');
  }
  // In italiano il decimale è la VIRGOLA: «2.4 per frase» è un numero inglese.
  function _num(x) {
    try { return Number(x).toLocaleString(window.appLang === 'en' ? 'en-US' : 'it-IT'); }
    catch (e) { return String(x); }
  }

  function _budgetHtml(cfg) {
    const b = PC().budgetDallaFonte(cfg, _mapStats(), _fonteStats());
    if (b.verdetto === 'sconosciuto' || !b.domande) return '';
    const riga = _t('mp_budget', 'La fonte ha {frasi} frasi di contenuto: {domande} domande sono {rapporto} per frase')
      .replace('{frasi}', _num(b.frasi)).replace('{domande}', _num(b.domande))
      .replace('{rapporto}', b.frasiPerDomanda >= 1
        ? _t('mp_budget_ogni', 'una ogni ') + _num(b.frasiPerDomanda)
        : _num(b.domandePerFrase) + _t('mp_budget_per', ''));
    if (b.verdetto === 'ok') return '<div style="opacity:.6;margin-top:4px">' + _esc(riga) + '</div>';
    const colore = b.verdetto === 'eccessivo' ? '#b91c1c' : '#b45309';
    const consiglio = b.bastanoGliAngoli
      ? _t('mp_budget_angoli', 'Con {n} invece di {tot} le domande poggiano su contenuto diverso.')
        .replace('{n}', _angoliDette(b.angoliConsigliati)).replace('{tot}', _angoliDette(b.angoli))
      : _t('mp_budget_meno', 'Questa fonte ne regge circa {tetto}: prova {n} e {per} per ramo.')
        .replace('{tetto}', _num(b.tetto)).replace('{n}', _angoliDette(b.angoliConsigliati)).replace('{per}', b.perRamoConsigliato);
    return '<div style="color:' + colore + ';margin-top:4px;font-weight:700">' + _esc(riga) + '</div>'
      + '<div style="color:' + colore + ';opacity:.85">' + _esc(consiglio) + '</div>';
  }

  // A new material job keeps the approved map and the previous delivery.
  Pipeline.runApprovedMaterials = async function (config, target, presetId) {
    const st = _state(), old = st._pipelineManifest;
    if (Pipeline._running || !old?.review || !await window.MappAIReview.requireApproved()) return;
    if (target && (target.vaultPath !== st.activeVaultPath || target.revision !== old.review.approvedRevision)) {
      _toast(_t('rv_conflict', 'Il contenuto è cambiato: riapri il controllo prima di continuare.'), 'warning'); return;
    }
    if (old.review.final && old.review.final.stage !== 'done') { window.MappAIReview.openCurrent(); return; }
    const manifest = PC().createManifest(config, { now: _now(), vaultPath: st.activeVaultPath });
    manifest.steps.A = JSON.parse(JSON.stringify(old.steps.A));
    manifest._storageVersion = old._storageVersion;
    manifest.review = JSON.parse(JSON.stringify(old.review));
    if (manifest.review.final) {
      manifest.review.deliveries = (manifest.review.deliveries || []).concat([{
        config: old.config, steps: old.steps, final: manifest.review.final
      }]);
    }
    delete manifest.review.final;
    manifest.review.drafts = { B: {}, C: {} };
    await Pipeline.run(config, { only: ['B', 'C', 'D', 'E'], vaultPath: st.activeVaultPath, manifest, presetId });
  };

  // Pre-flight + avvio dal modale.
  Pipeline._startFromModal = function () {
    const cfg = _readConfig();
    if (!cfg) return;
    /* Con una FOTO fra le fonti gli output sono fissi (vedi sotto): la guardia
       «attiva almeno una sezione» vale solo per la generazione dalla mappa. */
    const schedeFoto = Pipeline._reviewTarget ? [] : _schedeImmagini();
    if (!schedeFoto.length && !_hasOutput(cfg)) { _toast(_t('mp_pick_one', 'Attiva almeno una sezione di output.'), 'warning'); return; }
    const apiKey = window.getSystemKey ? window.getSystemKey() : '';
    if (!apiKey) { _toast(_t('tst_need_key', "Inserisci un'API Key per continuare"), 'error'); return; }
    // Voce: richiede la chiave Google diretta → altrimenti deseleziona con avviso (FR-006).
    if (cfg.synthesis && cfg.synthesis.audio) {
      let gk = ''; try { gk = localStorage.getItem('gemini_api_key') || ''; } catch (e) {}
      if (!gk) { cfg.synthesis.audio = false; _toast(_t('mp_no_google', 'Voce naturale disattivata: serve la chiave Google (Gemini). La sintesi sarà solo testo.'), 'warning'); }
    }
    const presetId = _configElement('mp-preset')?.value;
    const modal = document.getElementById('mp-modal'); if (modal) modal.remove();
    /* ── LE IMMAGINI FANNO DOSSIER (20/8) ────────────────────────────────────
       Ogni fonte-immagine con la scheda confermata diventa un DOSSIER suo: un
       vault col titolo della fonte, la scheda come documento, e gli output
       spuntati generati dai blocchi. In SEQUENZA — `run` ha il lucchetto — e
       un dossier che fallisce non porta via gli altri (trappola 36).
       ⚠️ Con immagini presenti NON si genera anche la mappa dalle altre fonti:
       un bottone deve fare una cosa prevedibile, e quale delle due «vince»
       sarebbe un mistero. Se ci sono fonti di testo, lo si dice. */
    const schede = schedeFoto;
    if (Pipeline._reviewTarget) {
      const target = Pipeline._reviewTarget; Pipeline._reviewTarget = null;
      Pipeline.runApprovedMaterials(cfg, target, presetId); return;
    }
    if (!schede.length) { Pipeline.run(cfg, { presetId }); return; }
    (async () => {
      if (_haAltreFonti()) {
        _toast(_t('mp_dossier_solo', 'Con delle immagini caricate si generano i DOSSIER delle fonti: le altre fonti non entrano (generale separatamente).'), 'info');
      }
      /* ── GLI OUTPUT DI UN DOSSIER SONO FISSI (20/8, richiesta di Giacomo):
         una foto genera automaticamente TUTTI i materiali previsti per le
         fonti iconografiche — flashcard, domande aperte, sintesi — senza
         niente da spuntare. Le spunte del box «Output automatici» restano la
         leva della generazione NORMALE (dalla mappa). La voce naturale segue
         la spunta: è l'unico output che costa in modo visibile. */
      /* Le OPZIONI le porta la SCHEDA (fase 3): quante per categoria, quali
         categorie, quali angoli — per genere. Una scheda senza opzioni (fase
         2, o confermata senza toccare niente) genera i tre output di default:
         è lo stesso comportamento di prima, dichiarato qui. */
      const cfgDossier = (sch) => {
        const op = sch.opzioni || {};
        const oq = op.oq || {}, fc = op.fc || {};
        const types = [];
        if (oq.on !== false) types.push('open');
        if (fc.on !== false) types.push('flashcards');
        /* un genere si MOLTIPLICA solo se ha degli angoli scelti: senza, resta
           una generazione sola ad angolo misto (multiTypes chiede angoli). */
        const multi = [];
        if ((oq.angoli || []).length) multi.push('open');
        if ((fc.angoli || []).length) multi.push('flashcards');
        return Object.assign({}, cfg, {
          quiz: types.length ? {
            types: types, perBranch: 3, angle: 'auto',
            multi: multi,
            angoli: (oq.angoli || []).concat(fc.angoli || []),
            angoliPerTipo: { open: oq.angoli || [], flashcards: fc.angoli || [] },
            perTipo: { open: oq.n, flashcards: fc.n },
            catPerTipo: { open: oq.cat || null, flashcards: fc.cat || null }
          } : null,
          synthesis: (op.syn === false) ? null : { audio: !!(cfg.synthesis && cfg.synthesis.audio) },
          dossier: sch
        });
      };
      /* `run` non rilancia (il suo catch fa il toast): qui si va solo in
         sequenza — un dossier fallito ha già detto la sua, e i successivi
         partono lo stesso (trappola 36). */
      for (const sch of schede) {
        await Pipeline.run(cfgDossier(sch));
      }
      if (schede.length > 1) {
        _toast(_t('mp_dossier_fine', '{n} dossier lavorati — l\'esito di ognuno è nel suo riepilogo')
          .replace('{n}', schede.length), 'info');
      }
    })();
  };
  /* Le schede confermate delle fonti-immagine di CREA. Le scrive
     `handleImageSource` (app.js) su `src._scheda`; un'immagine caricata ma
     con la scheda annullata NON fa dossier — e lo si dice al momento giusto,
     non qui. */
  function _schedeImmagini() {
    const s = _state();
    /* la foto arriva dal bottone «Documenti» (autoriconosciuta): il marcatore
       è la SCHEDA, non il tipo della fonte */
    return ((s && s.sources) || [])
      .filter(x => x && x._scheda)
      .map(x => x._scheda);
  }
  function _haAltreFonti() {
    const s = _state();
    return ((s && s.sources) || []).some(x => {
      if (!x || x._scheda) return false;
      if (x.file) return true;
      const el = document.querySelector('[data-source-id="' + x.id + '"]');
      return !!(el && String(el.value || '').trim());
    });
  }

  // ══════════════════════════════════════════════════════════════════════
  // Riepilogo finale + Riprova per step
  // ══════════════════════════════════════════════════════════════════════
  Pipeline._lastRun = null;
  function _stepLabel(s) {
    return { A: _t('mp_lbl_a', 'Mappa'), B: _t('mp_lbl_b', 'Quiz e flashcard'), C: _t('mp_lbl_c', 'Fogli nodi'),
             D: _t('mp_lbl_d', 'Sintesi'), E: _t('mp_lbl_e', 'Catena dei perché') }[s] || s;
  }
  function _statusChip(st) {
    const m = { done: ['check', '#16a34a', _t('mp_done', 'fatto')], failed: ['alert-triangle', '#dc2626', _t('mp_failed', 'errore')], skipped: ['minus', '#94a3b8', _t('mp_skipped', 'saltato')], pending: ['clock', '#94a3b8', _t('mp_pending', 'in attesa')], running: ['loader', '#4f46e5', _t('mp_running', 'in corso')] };
    const c = m[st] || m.pending;
    return '<span style="display:inline-flex;align-items:center;gap:5px;color:' + c[1] + ';font-weight:700"><i data-lucide="' + c[0] + '" class="w-4 h-4"></i>' + _esc(c[2]) + '</span>';
  }

  function _openSummary(vaultPath, manifest, config) {
    Pipeline._lastRun = { vaultPath, manifest, config };
    const old = document.getElementById('mp-summary'); if (old) old.remove();
    const rows = PC().STEPS.map(s => {
      const rec = manifest.steps[s] || { status: 'skipped', files: [] };
      const nfiles = (rec.files || []).length;
      const retry = (rec.status === 'failed' && s !== 'A')
        ? '<button type="button" class="pm-btn-cancel mp-retry" data-step="' + s + '" style="padding:4px 10px;font-size:11px"><i data-lucide="rotate-cw" class="w-3.5 h-3.5"></i> ' + _esc(_t('mp_retry', 'Riprova')) + '</button>'
        : '';
      const err = rec.status === 'failed' && rec.error ? '<div class="pm-option-desc" style="color:#dc2626;margin-top:2px">' + _esc(rec.error) + '</div>' : '';
      const note = rec.audioNote ? '<div class="pm-option-desc" style="color:#b45309;margin-top:2px">' + _esc(rec.audioNote) + '</div>' : '';
      /* I file della versione precedente restano nella cartella (vedi `_passo`):
         detto qui, perché è l'unico momento in cui il docente sta guardando che
         cosa è stato prodotto — e senza, li troverebbe da solo settimane dopo
         senza sapere quale dei due sia quello buono. */
      const orf = (rec.orfani && rec.orfani.length)
        ? '<div class="pm-option-desc" style="color:#b45309;margin-top:2px">' +
            _esc(_t('mp_orfani', 'Col nome vecchio, ancora nella cartella: ') +
                 rec.orfani.map(p => String(p).split('/').pop()).join(', ')) + '</div>'
        : '';
      return '<div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid #f1f5f9">' +
        '<div><div style="font-weight:800;color:#334155;font-size:13px">' + _esc(_stepLabel(s)) + '</div>' +
        '<div class="pm-option-desc">' + (nfiles ? (nfiles + ' ' + _esc(_t('mp_files', 'file'))) : '') + '</div>' + err + note + orf + '</div>' +
        '<div style="display:flex;align-items:center;gap:10px">' + _statusChip(rec.status) + retry + '</div></div>';
    }).join('');

    const modal = document.createElement('div');
    modal.id = 'mp-summary';
    modal.className = 'fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-[3200] flex items-center justify-center p-4';
    modal.innerHTML =
      '<div class="bg-white rounded-2xl shadow-2xl w-[92vw] max-w-[520px] p-7 relative">' +
        '<button type="button" id="mps-close" class="absolute top-5 right-5 text-slate-400 hover:text-slate-600"><i data-lucide="x" class="w-5 h-5"></i></button>' +
        '<div class="flex items-center gap-3 mb-3"><div class="pm-icon-wrap"><i data-lucide="clipboard-check" class="w-5 h-5 text-indigo-600"></i></div>' +
          '<div class="pm-title">' + _esc(_t('mp_summary', 'Materiali generati')) + '</div></div>' +
        '<div>' + rows + '</div>' +
        '<div class="flex gap-3 mt-5"><button type="button" id="mps-folder" class="pm-btn-cancel"><i data-lucide="folder-open" class="w-4 h-4"></i> ' + _esc(_t('mp_open_folder', 'Apri cartella')) + '</button>' +
        '<button type="button" id="mps-ok" class="pm-btn-primary" style="flex:1;justify-content:center">' + _esc(_t('ui_ok', 'Chiudi')) + '</button></div>' +
      '</div>';
    document.body.appendChild(modal);
    _icons();
    modal.querySelector('#mps-close').onclick = () => modal.remove();
    modal.querySelector('#mps-ok').onclick = () => modal.remove();
    modal.querySelector('#mps-folder').onclick = () => { if (window.electronAPI && window.electronAPI.pipelineOpenFolder) window.electronAPI.pipelineOpenFolder({ folderPath: vaultPath }); };
    modal.querySelectorAll('.mp-retry').forEach(btn => {
      btn.onclick = () => { const step = btn.getAttribute('data-step'); modal.remove(); Pipeline.run(config, { only: [step], vaultPath, manifest }); };
    });
  }

  // ══════════════════════════════════════════════════════════════════════
  // US2 — ripresa idempotente dopo crash
  // ══════════════════════════════════════════════════════════════════════
  // Chiamata all'apertura di un vault: se pipeline.json non è tutto-done,
  // normalizza (running→failed) e propone di riprendere (salta gli step done).
  Pipeline.checkResume = async function (vaultPath) {
    try {
      if (!vaultPath || Pipeline._running) return;
      if (!(window.electronAPI && window.electronAPI.vaultMaterialsList)) return;
      const res = await window.electronAPI.vaultMaterialsList({ vaultPath });
      if (!res || !res.ok || !res.manifest) return;
      let manifest = res.manifest;
      if (!PC() || manifest.schema !== PC().SCHEMA) return;
      if (window.MappAIReview && manifest.review) {
        await window.MappAIReview.restore(vaultPath, manifest);
        if (manifest.review.initial.status !== 'approved') { window.MappAIReview.open(vaultPath, manifest); return; }
      }
      if (PC().isComplete(manifest)) return;   // niente da riprendere
      manifest = PC().normalizeOnLoad(manifest);   // running (crash) → failed
      _confirmResume(vaultPath, manifest);
    } catch (e) { /* silenzioso: la ripresa non deve mai bloccare il load */ }
  };

  function _confirmResume(vaultPath, manifest) {
    const old = document.getElementById('mp-resume'); if (old) old.remove();
    const modal = document.createElement('div');
    modal.id = 'mp-resume';
    modal.className = 'fixed inset-0 bg-slate-900/70 backdrop-blur-sm z-[3200] flex items-center justify-center p-4';
    modal.innerHTML =
      '<div class="bg-white rounded-2xl shadow-2xl w-[90vw] max-w-[420px] p-6 relative">' +
        '<div class="flex items-center gap-3 mb-3"><div class="pm-icon-wrap"><i data-lucide="rotate-cw" class="w-5 h-5 text-indigo-600"></i></div>' +
        '<div class="pm-title">' + _esc(_t('mp_resume', 'Riprendi')) + '</div></div>' +
        '<p class="pm-body-text mb-4">' + _esc(_t('mp_resume_prompt', 'Questo vault ha una pipeline materiali incompleta. Riprenderla?')) + '</p>' +
        '<div class="flex gap-3"><button type="button" id="mpr-no" class="pm-btn-cancel">' + _esc(_t('ui_cancel', 'Annulla')) + '</button>' +
        '<button type="button" id="mpr-yes" class="pm-btn-primary" style="flex:1;justify-content:center"><i data-lucide="play" class="w-4 h-4"></i> ' + _esc(_t('mp_resume', 'Riprendi')) + '</button></div>' +
      '</div>';
    document.body.appendChild(modal);
    _icons();
    modal.querySelector('#mpr-no').onclick = () => modal.remove();
    /* Tutti i passi tranne A (la mappa c'è già: è il vault che stiamo aprendo).
       La lista si ricava da `PC().STEPS` e non si scrive a mano: era ferma a
       B·C·D e la «Catena dei perché», nata dopo, non veniva MAI ripresa — una
       pipeline interrotta lì restava incompleta a ogni riapertura del vault,
       senza che il bottone «Riprendi» potesse chiuderla. */
    modal.querySelector('#mpr-yes').onclick = () => { modal.remove(); Pipeline.run(manifest.config || {}, { only: PC().STEPS.filter(s => s !== 'A'), vaultPath, manifest }); };
  }

  /* ══ UN SET SOLO, SU RICHIESTA (13/8) ════════════════════════════════════
     La pipeline genera i materiali di TUTTA la mappa all'inizio. Questo è il
     gesto singolo: «Crea un documento → Quiz o flashcard → con l'AI», dove il
     docente sceglie tipo, quante domande, su quale area e con che angolazione.

     ⚠️ Vive QUI e non in un modulo suo perché è lo STESSO motore dello step B:
     stessi generatori, stessa forma del set, stesso builder di PDF, stesso
     `buildFileName`. Scritto altrove sarebbero due strade che divergono al
     primo ritocco — e la prima cosa che divergerebbe è il NOME dei file, cioè
     ciò da cui INSEGNA riconosce il genere di un materiale.

     La taratura per la classe (o per l'allievo) non si passa: la mettono i
     generatori stessi via `injectClassTuning`, che legge il contesto attivo.

     opts: { tipo:'mc'|'tf'|'flashcards'|'open', nome, quantita, area, angolo }
       · `area` = id di una macro-area, oppure '' / 'all' per tutta la mappa
       · `nome` = la SOLA parte personalizzabile del nome del file
     → { ok, setId?, titolo?, file?, errore? }                                */
  /* ── LE REGOLE DEL NOME, IN UN POSTO SOLO ─────────────────────────────────
     Le usano il gesto con l'AI (`generaSet`) e il foglio scritto a mano
     (`nuovoFoglioAperte`): il titolo di una copia È ciò da cui ELABORA la
     riconosce, e due compositori di titoli divergerebbero al primo ritocco.
     Senza nome resta la forma storica della pipeline («<Mappa> — <Genere>»),
     così rigenerare l'originale AGGIORNA la sua voce invece di affiancarne
     una seconda; con un nome vale la convenzione dei cloni. */
  function _titoloDoc(spec, nome, mapName) {
    const CLN = window.MappAIClona;
    return (nome && CLN && CLN.etichetta)
      ? CLN.etichetta(spec.typeLabel, nome)
      : (mapName + ' — ' + spec.typeLabel);
  }
  /* Il nome già preso si rifiuta PRIMA di spendere token (o di aprire un
     editor su un documento che ne rimpiazzerebbe un altro): la dedup
     dell'archivio è per `kind|title|mapName`, quindi lo stesso titolo
     SOSTITUISCE in silenzio una copia magari corretta a mano — e il file, che
     porta lo stesso nome, idem. Torna il messaggio, o '' se il nome è libero. */
  function _nomeGiaPreso(spec, nome, mapName) {
    const CLN = window.MappAIClona;
    if (!nome || !CLN || !CLN.chiave) return '';
    let presi = [];
    if (spec.documento) {
      try {
        const base = CLN.etichetta(spec.typeLabel, '');
        presi = ((window.MappAIStudyDocs && window.MappAIStudyDocs.list()) || [])
          .filter(d => d && d.kind === 'quizpaper' && d.mapName === mapName &&
            String(d.title || '').indexOf(base + ' - ') === 0)
          .map(d => String(d.title).slice(base.length + 3));
      } catch (e) { presi = []; }
    } else {
      presi = ((_state().db && _state().db.studySets) || [])
        .filter(x => x && x.type === spec.typeLabel && x.clone)
        .map(x => x.clone);
    }
    return presi.some(x => CLN.chiave(x) === CLN.chiave(nome))
      ? _t('cq_nome_preso', 'C\'è già una copia con questo nome: eliminala in ELABORA o scegli un altro nome.')
      : '';
  }

  /* ══ UN FOGLIO DI DOMANDE APERTE SCRITTO A MANO (13/8 sera) ═══════════════
     Era l'unico genere che NON si poteva creare a mano: il percorso «Le scrivo
     io» rispondeva «per ora si scrivono partendo da un foglio generato», cioè
     obbligava a spendere una chiamata AI per poi cancellarne il contenuto.
     La causa è la stessa che rende speciale questo genere ovunque: le domande
     aperte non entrano in `studySets` (il player pretende delle opzioni),
     quindi non esisteva un «set vuoto» da creare — la loro sorgente è la VOCE
     D'ARCHIVIO, cioè il foglio HTML con le domande incorporate.
     Qui il foglio vuoto si scrive: una domanda in bianco, archiviata, che
     l'editor riapre come qualunque altra. Il PDF non si scrive ora — lo fa
     «Crea PDF» dall'editor, che è il gesto che pubblica (modello dei tre gesti
     del 13/8: salvare non è pubblicare).
     opts: { nome } → { ok, docId?, titolo?, errore? }                        */
  Pipeline.nuovoFoglioAperte = function (opts) {
    opts = opts || {};
    const spec = _QT.open;
    if (window.mappaiOccupato && window.mappaiOccupato()) return { ok: false, errore: 'occupata' };
    if (!window.buildOpenQuestionsHtml || !window.MappAIStudyDocs) {
      return { ok: false, errore: _t('cq_no_motore_gen', 'Il generatore non è disponibile.') };
    }
    const DE = window.MappAIDocEdit;
    const mapName = _mapName();
    const CLN = window.MappAIClona;
    const nome = (CLN && CLN.pulisci) ? CLN.pulisci(opts.nome) : String(opts.nome || '').trim();
    const preso = _nomeGiaPreso(spec, nome, mapName);
    if (preso) return { ok: false, errore: preso };

    const titolo = _titoloDoc(spec, nome, mapName);
    /* ⚠️ Senza nome il titolo è quello della pipeline, e la dedup lo farebbe
       RIMPIAZZARE: un foglio vuoto scritto sopra uno generato con l'AI. Se
       quella voce esiste già, il nome diventa obbligatorio — è la stessa
       domanda che «Fai una copia» pone da sempre. */
    if (!nome) {
      let gia = false;
      try {
        gia = ((window.MappAIStudyDocs.list && window.MappAIStudyDocs.list()) || [])
          .some(d => d && d.kind === 'quizpaper' && d.mapName === mapName && d.title === titolo);
      } catch (e) { gia = false; }
      if (gia) return { ok: false, errore: _t('cq_serve_nome', 'Questa mappa ha già un foglio di domande aperte: dai un nome a questo per distinguerlo (per esempio «recupero»).') };
    }

    /* Una domanda in bianco, non zero: `setFromHtml` richiede almeno un item
       per riconoscere la sorgente incorporata — con l'elenco vuoto il foglio
       si riaprirebbe «senza domande» e l'editor lo direbbe non correggibile.
       La forma dell'item la dà il core (`blankOpenItem`), che è lo stesso che
       usa «aggiungi domanda» dentro l'editor. */
    const vuoto = (DE && DE.blankOpenItem) ? DE.blankOpenItem() : { question: '', guide: '', lines: null, areas: [] };
    const setId = 'set_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
    const html = window.buildOpenQuestionsHtml(
      { id: setId, title: titolo, type: spec.typeLabel, items: [vuoto] },
      { mapName: mapName, includeBar: false });
    let docId = null;
    try { docId = window.MappAIStudyDocs.save({ kind: 'quizpaper', title: titolo, html: html, mapName: mapName }); }
    catch (e) { docId = null; }
    if (!docId) return { ok: false, errore: _t('cq_no_archivio', 'Non riesco a salvare il foglio: l\'archivio dei documenti è pieno.') };
    /* gli elenchi già aperti (ELABORA, INSEGNA) si ridisegnano: senza, il
       foglio nuovo comparirebbe al giro dopo */
    try { if (window.MappAIVaults) window.MappAIVaults.segnala('materiali-generati', { vaultPath: _state().activeVaultPath || '' }); } catch (e) { }
    return { ok: true, docId: docId, titolo: titolo };
  };

  /* ── ADR 0003: la config di un DOCUMENTO SINGOLO ──────────────────────────
     Su un progetto con la revisione approvata «Crea un documento» non viene
     più rifiutato: è un lotto di UN genere, e passa dalla pipeline (velo,
     controllo dei contenuti, revisione dei materiali). Qui le scelte del
     wizard di crea-quiz diventano la STESSA forma che `_readConfig` legge dal
     modale e dal bento — una forma sola, così `Pipeline.run` e il passo B non
     hanno un secondo lettore (inv. 6). `tf` la pipeline non lo conosce (uscito
     dal bento il 19/8): null, e il gesto singolo resta quello di ieri.
     `area` e `nome` sono i due campi in più, e li legge solo il passo B: il
     filtro dei rami e l'etichetta di titolo e nome file. La classe: quella
     scelta nel modale se è aperto, altrimenti la classe attiva della landing,
     come fa `_classOptions`; se non c'è, stringa vuota — «senza classe». */
  const GENERI_DOCUMENTO = { mc: 'mc', open: 'open', flashcards: 'flashcards' };
  function _classeAttiva() {
    const sel = _configElement('mp-class');
    if (sel && sel.value) return String(sel.value);
    try {
      const CL = window.MappAIClasses, a = CL && CL.getActive ? CL.getActive() : null;
      return (a && a.id) ? String(a.id) : '';
    } catch (e) { return ''; }
  }
  /* Le angolazioni SPECIFICHE fra quelle spuntate nel wizard. «auto» resta
     fuori per disegno del core (`angoliMulti()` lo esclude): è l'angolo BASE,
     non una variante, e `nomeAngolo('auto')` lo chiama «misto». Chi chiama lo
     sa e lo dice al docente, invece di far sparire un foglio in silenzio. */
  function _angoliSpecifici(angoli) {
    return (Array.isArray(angoli) ? angoli : []).filter(k => k && k !== 'auto');
  }
  Pipeline._angoliSpecifici = _angoliSpecifici;   // per il wizard e per il banco

  /* La revisione di questo progetto, se è approvata: è la condizione che manda
     un documento singolo dalla pipeline invece che dal gesto di ieri. UNA
     funzione, usata dal bivio e dal wizard (`viaRevisione`): due copie della
     stessa condizione divergerebbero al primo ritocco (inv. 6). */
  function _revisioneChiusa() {
    const R = window.MappAIReview, rv = R && R.current && R.current();
    return (rv && rv.initial && rv.initial.status === 'approved') ? rv : null;
  }
  /* Il wizard lo chiede PRIMA di generare: se la risposta è sì, chiama una
     volta sola con tutte le angolazioni, invece di una per angolo. */
  Pipeline.viaRevisione = function () {
    const rv = _revisioneChiusa();
    return !!(rv && (!rv.final || rv.final.stage === 'done'));
  };
  function _configDaDocumento(opts, spec) {
    opts = opts || {};
    const genere = spec ? GENERI_DOCUMENTO[opts.tipo] : null;
    if (!genere) return null;
    /* PIÙ ANGOLAZIONI IN UN GIRO SOLO (21/9). Il wizard le generava una per
       chiamata: con la revisione, la prima apriva il controllo dei materiali e
       tutte le altre trovavano quel giro aperto — tre fogli chiesti, uno solo
       fatto, e per giunta senza un avviso (misurato dal vivo). La pipeline sa
       già fare N set in un giro (`angoli` + `multi`, passo B): qui si traduce,
       non si reinventa. Un'angolazione sola torna a essere l'angolo base. */
    const specifici = _angoliSpecifici(opts.angoli);
    const multiplo = specifici.length > 1;
    const quiz = {
      types: [genere],
      perBranch: Math.max(1, Math.min(10, parseInt(opts.quantita, 10) || 1)),
      angle: multiplo ? 'auto' : (specifici.length === 1 ? specifici[0] : (opts.angolo || 'auto')),
      angoli: multiplo ? specifici.slice() : [],
      multi: multiplo ? [genere] : [],
      area: (opts.area && opts.area !== 'all') ? opts.area : null,
      /* col giro multiplo il nome dell'angolo lo mette il passo B (`nomeVar`):
         qui va il nome NUDO del docente, o i fogli si chiamerebbero
         «causa · prova - causa» */
      nome: String((multiplo && opts.nomeBase != null ? opts.nomeBase : opts.nome) || '').trim()
    };
    /* la quota d'avvio delle domande aperte: il passo B la legge da
       `quiz.base` — senza, il cursore del wizard sarebbe un comando inerte */
    if (opts.base != null && Number.isFinite(Number(opts.base))) quiz.base = Number(opts.base);
    return { classId: opts.classId || _classeAttiva() || '', levelTuned: false, tuned: !!opts.tuned, quiz };
  }
  Pipeline._configDaDocumento = _configDaDocumento;   // per il banco (pipeline-lucchetto)

  Pipeline.generaSet = async function (opts) {
    opts = opts || {};
    const explicitSource = !!(opts.sorgente && String(opts.sorgente.materiale || '').trim());
    const spec = _QT[opts.tipo];
    if (!spec) return { ok: false, errore: 'tipo sconosciuto: ' + opts.tipo };
    if (window.mappaiOccupato && window.mappaiOccupato()) return { ok: false, errore: 'occupata' };
    const apiKey = window.getSystemKey ? window.getSystemKey() : '';
    if (!apiKey) return { ok: false, errore: _t('tst_need_key', "Inserisci un'API Key per continuare") };
    /* ADR 0003: su un progetto revisionato il documento singolo è un lotto di un genere.
       Passa dalla pipeline — velo, controllo dei contenuti, revisione — invece di essere
       rifiutato. Con un giro finale ancora aperto si riapre quello, come prima. */
    const R = window.MappAIReview, rv = _revisioneChiusa();
    if (!explicitSource && rv) {
      if (rv.final && rv.final.stage !== 'done') { await R.requireStandalone(); return { ok: false, errore: 'revisione-in-corso' }; }
      const cfg = _configDaDocumento(opts, spec);
      if (cfg) {
        const target = { vaultPath: _state().activeVaultPath, revision: rv.approvedRevision };
        await Pipeline.runApprovedMaterials(cfg, target);
        return { ok: true, viaPipeline: true };
      }
    }
    if (!explicitSource && window.MappAIReview && !await (window.MappAIReview.requireStandalone ? window.MappAIReview.requireStandalone() : window.MappAIReview.requireApproved())) return { ok: false, errore: 'revisione-pendente' };

    const vaultPath = _state().activeVaultPath || '';
    const mapName = _mapName();
    const quantita = Math.max(1, Math.min(30, parseInt(opts.quantita, 10) || 2));
    const angle = opts.angolo || 'auto';
    /* Le domande d'AVVIO: la percentuale la sceglie il docente, il numero per
       ramo lo fa il core (`quotaBase`) — al modello si danno numeri. */
    const pctBase = (opts.base != null) ? opts.base : QUOTA_BASE_DEF;
    const baseRamo = PC().quotaBase(quantita, pctBase);
    /* Il nome passa da `MappAIClona.pulisci` UNA volta: è lo stesso nome che
       finisce nel titolo d'archivio (che `pulisci` tronca a 40) e nel nome del
       file — se i due divergono, ELABORA non aggancia più il file alla riga
       della copia e l'originale se lo prende. */
    const CLN = window.MappAIClona;
    const nome = (CLN && CLN.pulisci) ? CLN.pulisci(opts.nome) : String(opts.nome || '').trim();

    /* Su quale materiale: una macro-area sola, o tutte. Il materiale è quello
       del ramo — nodo più discendenti — come nello step B e come il quiz in-app.
       ── LA SORGENTE ESPLICITA (20/8) ──────────────────────────────────────
       `opts.sorgente = { etichetta, materiale }` sostituisce i rami: è la
       strada di una FOTOGRAFIA letta dal motore locale, il cui materiale è la
       scheda corretta dal docente. Sta QUI, a monte del ciclo, e non in un
       secondo generatore, per la ragione di sempre: generare, nominare e
       archiviare un foglio ha UN proprietario (invariante 6) — la prima cosa a
       divergere sarebbe il NOME dei file, cioè ciò da cui INSEGNA riconosce un
       materiale. E siccome il taglio è sopra il `for`, vale per TUTTI i generi:
       domande aperte e flashcard escono dallo stesso interruttore. */
    const sorg = opts.sorgente && String(opts.sorgente.materiale || '').trim()
      ? { id: 'sorgente:esplicita', label: String(opts.sorgente.etichetta || '').trim() || mapName,
          _materiale: String(opts.sorgente.materiale) }
      : null;
    const tutte = sorg ? [sorg] : _branchNodes();
    const scelte = (!sorg && opts.area && opts.area !== 'all')
      ? tutte.filter(b => b.id === opts.area)
      : tutte;
    if (!scelte.length) return { ok: false, errore: _t('cq_no_area', 'Questa mappa non ha aree da cui generare.') };

    const preso = _nomeGiaPreso(spec, nome, mapName);
    if (preso) return { ok: false, errore: preso };

    Pipeline._running = true;                 // il lucchetto vale anche per il gesto singolo
    /* ⚠️ IL CONTESTO SI CONGELA QUI (14/8). Sotto c'è una chiamata all'AI PER
       RAMO, e la taratura si rilegge a ogni chiamata: cambiando classe da
       ELABORA o INSEGNA mentre questo gira, il foglio usciva metà tarato per
       una classe e metà per un'altra. E la voce d'archivio, che senza `cls`/
       `disc` li prende dal contesto ATTIVO, finiva etichettata con la classe
       che c'era alla FINE. Uno scatto all'inizio, usato per tutto. */
    var gelo = (window.MappAITune && window.MappAITune.congela) ? window.MappAITune.congela() : null;
    try {
      _overlay(_t('cq_genero', 'Genero le domande…'),
        spec.typeLabel + (nome ? ' · ' + nome : '') + ' — ' + mapName);
      _setContext(spec.sub);
      const raw = [];
      let requestedCount = 0;
      for (let i = 0; i < scelte.length; i++) {
        const b = scelte[i];
        const material = _branchMaterial(b);
        if (!material.trim()) continue;
        requestedCount += quantita;
        const complementary = sorg ? [] : _complementaryQuestions(opts.tipo, _clean(b.label));
        if (opts.tipo === 'open') {
          const comp = _ramoCompagno(b, tutte);
          const materialeB = comp ? _branchMaterial(comp) : '';
          const insieme = materialeB
            ? (material + '\n\n--- ALTRA AREA: ' + _clean(comp.label) + ' ---\n' + materialeB)
            : material;
          /* La quota si calcola PER RAMO, non sul totale del foglio: le
             domande di un ramo si somministrano insieme, e una quota globale
             potrebbe metterle tutte d'avvio in un'area e nessuna in un'altra. */
          const items = await _genOpenQuestions(insieme, _clean(b.label), quantita, apiKey,
            { areaB: comp ? _clean(comp.label) : '', angolo: angle, base: baseRamo, complementary });
          _withoutCrossFormatCopies(items, complementary).forEach(it => raw.push(Object.assign({ l1: _clean(b.label), ramo: _clean(b.label) }, it)));
        } else if (opts.tipo === 'flashcards') {
          const items = await _genFlashcards(material, _clean(b.label), quantita, apiKey);
          items.forEach(it => raw.push(it));
        } else {
          const items = await window.generateDynamicQuiz({
            nodeLabel: _clean(b.label), material, quizType: spec.quizType,
            quantity: quantita, angle, apiKey, usageCat: 'pipeline', usageSub: spec.sub, complementary
          });
          _withoutCrossFormatCopies(items || [], complementary).forEach(it => raw.push(Object.assign({ ramo: _clean(b.label) }, it)));
        }
      }
      raw.splice(0, raw.length, ..._potaDoppioni(raw, spec.typeLabel + (nome ? ' · ' + nome : '')));
      if (spec.mode === 'quiz') _guardaLunghezze(raw, spec.typeLabel + (nome ? ' · ' + nome : ''));
      if (!raw.length) return { ok: false, errore: _t('cq_vuoto', 'L\'AI non ha prodotto domande utilizzabili: riprova, magari con un\'area più ricca.') };
      const generation = { requested: requestedCount, produced: raw.length };
      if (raw.length < requestedCount) _toast(_t('mp_batch_short', '{f}: {n} domande utilizzabili sulle {t} richieste. Verifica gli obiettivi rimasti scoperti.')
        .replace('{f}', spec.typeLabel).replace('{n}', raw.length).replace('{t}', requestedCount), 'warning');
      /* Le domande d'avvio in testa al loro ramo: un foglio si comincia da ciò
         che si sa. L'ordine si rimescola solo DENTRO il ramo (il foglio resta
         organizzato per macro-area). */
      if (opts.tipo === 'open' && PC().ordinaGraduazione) raw.splice(0, raw.length, ...PC().ordinaGraduazione(raw));

      const setId = 'set_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
      const titolo = mapName + ' — ' + spec.typeLabel + (nome ? ' · ' + nome : '');
      /* ⚠️ Il nome scelto dal docente viaggia in `clone`, che è già il campo
         della «parte personalizzabile» del nome file: `buildFileName` lo mette
         in coda al nome canonico, e l'editor lo ritrova per le stampe
         successive. Un campo nuovo avrebbe voluto dire una seconda convenzione
         accanto a quella che tutto il resto dell'app già legge. */
      const fileName = PC().buildFileName(spec.kind, null, false, { mappa: mapName, nome: nome });
      const rel = 'Materiale Studio/' + fileName;

      // ── le domande aperte sono un FOGLIO, non un set giocabile (vedi _QT.open)
      if (spec.documento) {
        /* Il TITOLO segue la convenzione dei cloni (`MappAIClona.etichetta`,
           «Domande Aperte - <nome>»): è da lì che ELABORA ricava il nome della
           copia (`_cloneDalTitolo`) — e con esso il cestino e il clona sulla
           riga. Col titolo di prima («<Mappa> — Domande aperte · <nome>») il
           documento si vedeva ma non era riconosciuto come copia, e due copie
           si contendevano la stessa voce. SENZA nome resta la forma della
           pipeline: così rigenerare l'originale AGGIORNA la voce esistente
           (la dedup dell'archivio è per kind|title|mapName) invece di
           affiancarne una seconda. */
        const titoloDoc = _titoloDoc(spec, nome, mapName);
        /* `intro` = la fonte iconografica da cui il foglio nasce (20/8): il
           builder la mette in testa E dentro la sorgente incorporata, così
           l'immagine sopravvive alla riapertura nell'editor. */
        const html = window.buildOpenQuestionsHtml(
          { id: setId, title: titoloDoc, type: spec.typeLabel, items: raw, angle: angle, intro: opts.intro || null, generation },
          { mapName, includeBar: false });
        /* La SORGENTE si salva PRIMA della RESA. L'archivio porta l'HTML con
           dentro le domande — è ciò che si riapre e si corregge in ELABORA;
           il PDF è una resa. Prima l'ordine era rovesciato: un `htmlToPdf`
           che non rispondeva usciva di qui e buttava via minuti di
           generazione AI — il materiale «non compariva da nessuna parte». */
        let inArchivio = false;
        try {
          if (window.MappAIStudyDocs) {
            /* classe e materia CONGELATE, non quelle attive adesso: senza,
               l'etichetta della riga direbbe il contesto di fine pipeline */
            const idDoc = window.MappAIStudyDocs.save({
              kind: 'quizpaper', title: titoloDoc, html: html, mapName: mapName,
              cls: gelo ? gelo.nome : undefined, disc: gelo ? gelo.disc : undefined
            });
            /* `save` può scartare in silenzio (quota localStorage piena): si
               RILEGGE — «in archivio» deve voler dire che c'è, non che la
               chiamata non ha lanciato. */
            inArchivio = !!(idDoc && (!window.MappAIStudyDocs.get || window.MappAIStudyDocs.get(idDoc)));
          }
        } catch (e) { /* senza archivio resta il PDF: si prova comunque */ }
        /* il gemello `.html` nel vault (6/9): stesso stem del PDF, in Sorgenti/ */
        try {
          if (vaultPath && window.MappAIQuizPrint && window.MappAIQuizPrint.scriviSorgente) await window.MappAIQuizPrint.scriviSorgente(vaultPath, fileName, html);
        } catch (e) { console.warn('[Pipeline] sorgente domande aperte:', e && e.message); }
        /* La resa: se fallisce si AVVISA (`pdfErrore` arriva al toast del
           chiamante), senza toccare la sorgente appena scritta. */
        let pdf = null, pdfErrore = '';
        try {
          pdf = (window.electronAPI && window.electronAPI.htmlToPdf)
            ? await window.electronAPI.htmlToPdf({ html, options: { landscape: false } })
            : null;
          if (!pdf || !pdf.ok) pdfErrore = (pdf && pdf.error) || 'PDF non generato';
          else if (PC().validatePdfB64) {
            const v = PC().validatePdfB64(pdf.base64);
            if (!v.ok) { pdfErrore = v.error || 'PDF non valido'; pdf = null; }
          }
        } catch (e) { pdfErrore = e.message || String(e); pdf = null; }
        let fileScritto = false;
        if (!pdfErrore && vaultPath) {
          try {
            const w = await window.electronAPI.saveVaultFile({ vaultPath, relPath: rel, base64: pdf.base64 });
            fileScritto = !(w && w.ok === false);
            if (!fileScritto) pdfErrore = 'scrittura fallita' + ((w && w.error) ? ': ' + w.error : '');
          } catch (e) { pdfErrore = e.message || String(e); }
        }
        /* Detto agli elenchi già aperti, come nel ramo dei set: senza, il
           materiale nuovo compare al giro dopo. */
        try { if (window.MappAIVaults) window.MappAIVaults.segnala('materiali-generati', { vaultPath: vaultPath }); } catch (e) { }
        if (!inArchivio && !fileScritto) return { ok: false, errore: pdfErrore || 'PDF non generato' };
        /* `pdfErrore` solo se un vault c'era: senza vault il PDF non è promesso
           e il toast giusto è quello del vault mancante, non un guasto. */
        return { ok: true, titolo: titoloDoc, file: fileScritto ? fileName : '', pdfErrore: vaultPath ? pdfErrore : '', generation };
      }

      // ── set EDITABILE (è da questi che nascono i quiz live) + PDF nel vault
      const set = {
        id: setId, title: titolo, mode: spec.mode, type: spec.typeLabel,
        items: raw, angle: angle, quantity: quantita, date: _now(), clone: nome, generation
      };
      _state().db.studySets = _state().db.studySets || [];
      _state().db.studySets.push(set);

      const printItems = (opts.tipo === 'flashcards') ? _flashToPrintItems(raw) : _toPrintItems(raw);
      const printSet = { title: titolo, items: printItems };
      const html = (opts.tipo === 'flashcards')
        ? window.buildFlashcardSetHtml(printSet, { mapName, includeBar: false })
        : window.buildQuizSetHtml(printSet, { mapName, includeBar: false });
      const QP = window.MappAIQuizPrint;
      const landscape = (opts.tipo === 'flashcards') && !!(QP && QP.flashSheet && QP.flashSheet().landscape);
      /* Anche qui la resa non fa cadere il gesto: il SET è già in `studySets`
         (la sorgente prima della resa) — un `htmlToPdf` che lancia faceva
         uscire dal catch un «errore» su un set appena creato e rimasto lì. */
      let pdfOk = false, pdfErrore = '';
      try {
        const pdf = (window.electronAPI && window.electronAPI.htmlToPdf)
          ? await window.electronAPI.htmlToPdf({ html, options: { landscape } })
          : null;
        if (!pdf || !pdf.ok) pdfErrore = (pdf && pdf.error) || 'PDF non generato';
        else if (vaultPath) {
          const w = await window.electronAPI.saveVaultFile({ vaultPath, relPath: rel, base64: pdf.base64 });
          pdfOk = !(w && w.ok === false);
          if (!pdfOk) pdfErrore = 'scrittura fallita' + ((w && w.error) ? ': ' + w.error : '');
        }
      } catch (e) { pdfErrore = e.message || String(e); }
      try { if (typeof StorageManager !== 'undefined' && StorageManager.saveCurrentProject) StorageManager.saveCurrentProject(); } catch (e) { }
      try { if (vaultPath) await window.electronAPI.saveVault({ folderPath: vaultPath, mapData: window.buildVaultMapData() }); } catch (e) { }
      /* Detto agli elenchi già aperti: senza, il materiale nuovo compare al
         giro dopo e sembra che «ci metta molto». */
      try { if (window.MappAIVaults) window.MappAIVaults.segnala('materiali-generati', { vaultPath: vaultPath }); } catch (e) { }
      if (window.renderStudySets) { try { window.renderStudySets(); } catch (e) { } }
      /* `pdfErrore` solo se un vault c'era: senza vault il PDF non è promesso
         e il toast giusto è quello del vault mancante, non un guasto. */
      return { ok: true, setId: setId, titolo: titolo, file: (pdfOk && vaultPath) ? fileName : '', pdfErrore: vaultPath ? pdfErrore : '', generation };
    } catch (e) {
      return { ok: false, errore: e.message || String(e) };
    } finally {
      Pipeline._running = false;
      /* si scongela SEMPRE: un contesto che resta gelato dopo un errore
         tarerebbe di nascosto tutto il resto della sessione */
      try { if (window.MappAITune && window.MappAITune.scongela) window.MappAITune.scongela(); } catch (e) { }
      _overlay(false);
    }
  };

  /* ══ RIGENERA I MATERIALI DA UNA SCHEDA CORRETTA (21/8) ═══════════════════
     Il gesto dell'editor della fonte: il docente corregge la scheda e i
     materiali si RIFANNO, sovrascrivendo i precedenti. Riusa `run` con
     `only:['B','D']` su un manifest fresco (uno step `done` non torna
     `running`: ALLOWED.done = [] — serve un manifest in cui B e D siano
     ancora `pending`). Precondizioni: la mappa del dossier è APERTA
     (`activeVaultPath` = quel vault) — B genera dai rami del grafo corrente.
     Le OPZIONI (angoli, quantità, categorie) vengono dal `pipeline.json` del
     vault, MAI dalla scheda riletta: `qp-scheda` non le porta (trappola 3
     della ricognizione). */
  Pipeline.rigeneraDossier = async function (scheda) {
    if (Pipeline._running) { _toast(_t('mp_busy', 'Una pipeline è già in corso'), 'warning'); return { ok: false }; }
    const st = _state();
    const vaultPath = st.activeVaultPath;
    const VC = window.MappAIVisioneCore;
    if (!vaultPath || !window.electronAPI || !window.electronAPI.vaultMaterialsList) {
      _toast(_t('mp_rig_no_vault', 'Apri prima la mappa del dossier: i materiali vivono nel suo vault.'), 'warning');
      return { ok: false };
    }
    if (!VC || !scheda || !VC.schedaPronta(scheda)) {
      _toast(_t('mp_rig_scheda', 'La scheda è troppo vuota per generare.'), 'warning');
      return { ok: false };
    }
    /* config originale dal manifest del vault: porta quiz/synthesis/classe */
    let vecchio = null;
    try {
      const res = await window.electronAPI.vaultMaterialsList({ vaultPath });
      vecchio = res && res.manifest;
    } catch (e) { /* senza manifest si va coi default */ }
    const base = (vecchio && vecchio.config) || {};
    const config = Object.assign({}, base, {
      dossier: scheda,
      /* default del dossier se il manifest non c'era: gli output sono FISSI
         (flashcard + domande aperte + sintesi, decisione 20/8) */
      quiz: base.quiz || { types: ['open', 'flashcards'], perBranch: 3, angle: 'auto' },
      synthesis: base.synthesis || { audio: false }
    });

    /* identità e grafo PRIMA di `run` (la sentinella dell'identità scatta sui
       cambi DURANTE): il grafo del dossier È la scheda. */
    const vecchiaMappa = st.rootNodeLabel;
    st.rootNodeLabel = String(scheda.titolo || vecchiaMappa || 'Fonte');
    const g = VC.nodiDaScheda(scheda);
    st.db.nodes = g.nodes; st.db.links = g.links;
    /* i set della pipeline precedente si TOLGONO, o _stepB li accoda ai vecchi */
    st.db.studySets = (st.db.studySets || []).filter(x => !x || !x._pipeline);
    try { await window.electronAPI.saveVault({ folderPath: vaultPath, mapData: window.buildVaultMapData() }); } catch (e) { }

    /* il documento dell'analisi si RIFÀ qui (è roba dello step A, che non
       rigira): voce d'archivio aggiornata (dedup kind|title|mapName) + PDF
       sovrascritto nel vault. */
    try {
      const htmlAn = window.buildAnalisiFonteHtml(scheda, {
        mapName: st.rootNodeLabel, includeBar: false,
        classe: config.className || '', materia: config.disc || ''
      });
      if (window.MappAIStudyDocs) {
        window.MappAIStudyDocs.save({
          kind: 'analisi', title: 'Analisi della fonte — ' + st.rootNodeLabel,
          html: htmlAn, mapName: st.rootNodeLabel,
          cls: config.className || '', disc: config.disc || ''
        });
      }
      const pdfAn = await window.electronAPI.htmlToPdf({ html: htmlAn, options: { landscape: false } });
      if (pdfAn && pdfAn.ok) {
        const nomeAn = PC().buildFileName('analisi_fonte', null, config.tuned, { mappa: st.rootNodeLabel });
        await window.electronAPI.saveVaultFile({ vaultPath, relPath: 'Materiale Studio/' + nomeAn, base64: pdfAn.base64 });
      }
    } catch (e) { console.warn('[Pipeline] analisi non rifatta:', e && e.message); }

    /* manifest FRESCO con A già done (i file di A restano quelli di prima) */
    let manifest = PC().createManifest(config, { now: _now(), vaultPath });
    manifest = PC().stepTransition(manifest, 'A', 'running', { now: _now() });
    manifest = PC().stepTransition(manifest, 'A', 'done', { now: _now() });
    try { if (vecchio && vecchio.steps && vecchio.steps.A && vecchio.steps.A.files) manifest.steps.A.files = vecchio.steps.A.files.slice(); } catch (e) { }

    if (vecchio && vecchio.review) {
      manifest._storageVersion = vecchio._storageVersion;
      manifest.review = JSON.parse(JSON.stringify(vecchio.review));
      manifest.review.previousFinal = manifest.review.final;
      delete manifest.review.final;
      manifest.review.drafts = { B: {}, C: {} };
    }
    Pipeline._veloLibero = true;
    try {
      await Pipeline.run(config, { only: ['B', 'D'], vaultPath, manifest });
    } finally {
      Pipeline._veloLibero = false;
    }

    /* titolo cambiato = file nuovi con nome nuovo: i VECCHI di B e D si
       portano nel Cestino (deleteVaultFile passa da shell.trashItem), o
       resterebbero accanto ai nuovi come materiali fantasma. */
    const currentFinal = st._pipelineManifest && st._pipelineManifest.review && st._pipelineManifest.review.final;
    if ((!manifest.review || (currentFinal && currentFinal.stage === 'done')) && vecchio && vecchiaMappa && vecchiaMappa !== st.rootNodeLabel &&
        window.electronAPI.deleteVaultFile) {
      const vecchiFile = ['B', 'D'].reduce(function (a, k) {
        const f = vecchio.steps && vecchio.steps[k] && vecchio.steps[k].files;
        return a.concat(f || []);
      }, []);
      const vecchioAn = 'Materiale Studio/' + PC().buildFileName('analisi_fonte', null, base.tuned, { mappa: vecchiaMappa });
      vecchiFile.push(vecchioAn);
      for (const rel of vecchiFile) {
        try { await window.electronAPI.deleteVaultFile({ vaultPath, relPath: rel }); } catch (e) { }
      }
    }
    try { if (window.MappAIVaults) window.MappAIVaults.segnala('materiali-generati', { vaultPath: vaultPath }); } catch (e) { }
    return { ok: true };
  };

  window.MappAIPipeline = Pipeline;
  console.log('[MappAIPipeline] orchestratore pipeline materiali caricato');
})();
