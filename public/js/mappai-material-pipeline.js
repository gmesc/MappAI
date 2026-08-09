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
  function _t(k, f) { return window.t ? window.t(k, f) : f; }
  function _state() { try { return (typeof appState !== 'undefined') ? appState : window.appState; } catch (e) { return window.appState; } }
  function _esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
  function _toast(m, t) { if (window.showToast) window.showToast(m, t || 'info'); }
  function _now() { try { return new Date().toISOString(); } catch (e) { return ''; } }
  function _icons() { if (window.safeCreateIcons) window.safeCreateIcons(); }
  function _clean(s) { return window.cleanLabel ? window.cleanLabel(s) : String(s || '').trim(); }

  const Pipeline = { _running: false };

  // ── Stato mappa: rami L1 (MindMap) / hub (KG) ──────────────────────────
  function _branchNodes() {
    const db = _state().db || {};
    const nodes = db.nodes || [];
    const isMM = _state().extractionMode === 'mindmap';
    let branches = isMM ? nodes.filter(n => (n.level || 0) === 1) : nodes.filter(n => (n.level || 0) <= 1);
    if (!branches.length && nodes.length) branches = [nodes[0]];
    return branches;
  }
  function _mapStats() {
    const nodes = (_state().db && _state().db.nodes) || [];
    return { branches: _branchNodes().length, nodes: nodes.length, willGenerateMap: true };
  }
  function _mapName() {
    return _state().rootNodeLabel || (window._getTimelineProjectName ? window._getTimelineProjectName() : 'MappAI') || 'MappAI';
  }

  // Materiale di studio del ramo: nodo + discendenti (label: desc), come il quiz in-app.
  function _branchMaterial(branch) {
    const kids = (window.getDescendants ? window.getDescendants(branch.id) : []) || [];
    const all = [branch].concat(kids);
    return all.map(n => _clean(n.label) + ': ' + (n.desc || n.content || '')).join('\n').slice(0, 12000);
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
      return { question: it.q || it.question || '', options: opts, correctIndex: ci, explanation: it.explanation || '', answer: it.correct };
    });
  }
  function _flashToPrintItems(items) {
    return (items || []).map(it => ({ question: it.front || it.q || '', answer: it.back || it.correct || '', explanation: '' }));
  }

  // ── IPC helpers ─────────────────────────────────────────────────────────
  // le due basi (Mappe e Allievi) arrivano insieme: quale delle due si usa lo
  // decide il contesto attivo, non il chiamante
  let _basi = null;
  async function _mapsBase() { _basi = await window.electronAPI.filesRootGet(); return _basi.mapsBaseDir; }
  async function _writeManifest(vaultPath, manifest) {
    const r = await window.electronAPI.saveVaultFile({ vaultPath, relPath: 'pipeline.json', text: JSON.stringify(manifest, null, 2) });
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
  /* ⚠️ `buildFileName('tts', …)` promette `.mp3`, ma la voce torna in WAV
     quando l'encoder lamejs non è caricato (`_encodeAudio` in
     mappai-branch-synthesis.js sceglie MP3 «se possibile»): un WAV scritto
     dentro un file `.mp3` è una bugia che paga chi apre il documento. Comanda
     l'estensione dichiarata dal blob, non la tabella dei generi. */
  function _conEstensione(nome, ext) {
    const e = String(ext || '').replace(/^\./, '');
    if (!e) return nome;
    return String(nome).replace(/\.[A-Za-z0-9]+$/, '.' + e);
  }
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
    const classFolder = cls ? FC().mapClassFolder(cls.sede, cls.name) : FC().classFolder('');
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
      siblings = (all || []).filter(v => v.classDir === classFolder && (v.discDir || '') === (discFolder || '')).map(v => v.folderName);
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
  function _overlay(msg) {
    if (!window.showLoadingOverlay) return;
    if (msg === false) window.showLoadingOverlay(false);
    else window.showLoadingOverlay(true, msg);
  }
  function _setContext(sub) { if (window.MappAIUsage) window.MappAIUsage.setContext('pipeline', sub); }

  // ══════════════════════════════════════════════════════════════════════
  // STEP B — quiz / flashcard per ramo, un set (e un PDF) per tipo
  // ══════════════════════════════════════════════════════════════════════
  async function _genFlashcards(material, nodeLabel, quantity, apiKey) {
    const nonce = window.quizNonce ? window.quizNonce() : String(Date.now());
    // Vincolo di stampa nel prompt: genera già corto invece di far accorciare
    // tutto al docente dopo (e vieta URL/formule, che sulla carta non entrano).
    const PLx = window.MappAIPrintLayout;
    const regola = PLx ? PLx.promptRule(PLx.flashGeom(), null, window.getMapLanguage ? window.getMapLanguage() : 'it') : '';
    const prompt = window.fillPromptTemplate('FLASHCARD_GENERATOR', { quantity, nodeLabel, nonce }) + regola;
    const schema = { type: 'ARRAY', items: { type: 'OBJECT', properties: { front: { type: 'STRING' }, back: { type: 'STRING' } }, required: ['front', 'back'] } };
    let payload = { contents: [{ parts: [{ text: prompt + '\n\nMateriale:\n' + material }] }], generationConfig: { temperature: window.QUIZ_TEMPERATURE || 0.7, responseMimeType: 'application/json', responseSchema: schema, _respectTemp: true } };
    if (window.injectClassTuning) payload = window.injectClassTuning(payload);
    const resp = await window.fetchModelAPI(payload, apiKey);
    const raw = resp && resp.candidates && resp.candidates[0] && resp.candidates[0].content.parts[0].text || '';
    const arr = window.salvageTruncatedJSON(raw.split('```json').join('').split('```').join('').trim());
    return Array.isArray(arr) ? arr : [];
  }

  const _QT = {
    mc: { quizType: 'Scelta multipla con 3 opzioni brevi e plausibili, una sola corretta', kind: 'quiz_mc', sub: 'quiz_mc', mode: 'quiz', typeLabel: 'Scelta Multipla' },
    tf: { quizType: 'Vero o Falso — ogni domanda è un\'AFFERMAZIONE da valutare; il campo "correct" vale "Vero" oppure "Falso"', kind: 'quiz_tf', sub: 'quiz_tf', mode: 'quiz', typeLabel: 'Vero o Falso' },
    flashcards: { kind: 'flashcards', sub: 'flashcards', mode: 'flashcard', typeLabel: 'Flashcard' }
  };

  async function _stepB(vaultPath, manifest, config, apiKey, counter) {
    manifest = PC().stepTransition(manifest, 'B', 'running', { now: _now() });
    await _writeManifest(vaultPath, manifest);
    try {
      const branches = _branchNodes();
      const mapName = _mapName();
      const types = (config.quiz.types || []).filter(t => _QT[t]);
      const perBranch = Math.max(1, config.quiz.perBranch || 3);
      const angle = config.quiz.angle || 'auto';
      for (let ti = 0; ti < types.length; ti++) {
        const t = types[ti];
        const spec = _QT[t];
        _setContext(spec.sub);
        _overlay(_t('mp_step_b', 'Genero i quiz…') + ' (' + spec.typeLabel + ')');
        const raw = [];
        for (let bi = 0; bi < branches.length; bi++) {
          const b = branches[bi];
          const material = _branchMaterial(b);
          if (!material.trim()) continue;
          counter.calls++;
          if (t === 'flashcards') {
            const items = await _genFlashcards(material, _clean(b.label), perBranch, apiKey);
            items.forEach(it => raw.push(it));
          } else {
            const items = await window.generateDynamicQuiz({ nodeLabel: _clean(b.label), material, quizType: spec.quizType, quantity: perBranch, angle, apiKey, usageCat: 'pipeline', usageSub: spec.sub });
            (items || []).forEach(it => raw.push(it));
          }
        }
        if (!raw.length) continue;   // tipo senza risultati: salta, non fallisce lo step
        // Set in-app (forma q/correct o front/back) + persistenza vault
        const setId = 'set_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
        const setTitle = mapName + ' — ' + spec.typeLabel;
        const set = { id: setId, title: setTitle, mode: spec.mode, type: spec.typeLabel, items: raw, angle, quantity: perBranch, date: _now(), _pipeline: true };
        _state().db.studySets = _state().db.studySets || [];
        _state().db.studySets.push(set);
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
        const printSet = { title: setTitle, items: printItems };
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
        const fileName = PC().buildFileName(spec.kind, null, config.tuned, { mappa: mapName });
        const rel = 'Materiale Studio/' + fileName;
        const w = await window.electronAPI.saveVaultFile({ vaultPath, relPath: rel, base64: pdf.base64 });
        if (!w || !w.ok) throw new Error('Scrittura quiz fallita: ' + ((w && w.error) || '?'));
        manifest = _recordFile(manifest, 'B', rel);
        await _writeManifest(vaultPath, manifest);
      }
      // Ri-salva il vault: i set persistono nel mapData.studySets
      try { await window.electronAPI.saveVault({ folderPath: vaultPath, mapData: window.buildVaultMapData() }); } catch (e) { /* best-effort */ }
      if (window.renderStudySets) { try { window.renderStudySets(); } catch (e) {} }
      manifest = PC().stepTransition(manifest, 'B', 'done', { now: _now(), calls: counter.calls });
    } catch (e) {
      manifest = PC().stepTransition(manifest, 'B', 'failed', { now: _now(), error: e.message || String(e) });
    }
    await _writeManifest(vaultPath, manifest);
    return manifest;
  }

  // ══════════════════════════════════════════════════════════════════════
  // STEP C — fogli nodi, un PDF per modo selezionato
  // ══════════════════════════════════════════════════════════════════════
  async function _stepC(vaultPath, manifest, config) {
    manifest = PC().stepTransition(manifest, 'C', 'running', { now: _now() });
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
        _overlay(_t('mp_step_c', 'Preparo i fogli nodi…') + ' (' + layout + ')');
        const res = await window.printAllNodeLabels({
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
        await _writeManifest(vaultPath, manifest);
      }
      manifest = PC().stepTransition(manifest, 'C', 'done', { now: _now() });
    } catch (e) {
      manifest = PC().stepTransition(manifest, 'C', 'failed', { now: _now(), error: e.message || String(e) });
    }
    await _writeManifest(vaultPath, manifest);
    return manifest;
  }

  // ══════════════════════════════════════════════════════════════════════
  // STEP D — sintesi mappa intera (HTML) + voce naturale (MP3, degradabile)
  // ══════════════════════════════════════════════════════════════════════
  async function _stepD(vaultPath, manifest, config, apiKey) {
    manifest = PC().stepTransition(manifest, 'D', 'running', { now: _now() });
    await _writeManifest(vaultPath, manifest);
    try {
      _setContext('synthesis');
      _overlay(_t('mp_step_d', 'Scrivo la sintesi…'));
      const mapName = _mapName();
      const data = await window.MappAISynthesis.runWholeMap({ apiKey, tuned: !!config.tuned, silent: true });
      const v = PC().validateSynthesis(data);
      if (!v.ok) throw new Error('Sintesi: ' + v.error);
      const htmlName = PC().buildFileName('synthesis', null, config.tuned, { mappa: mapName });
      const relHtml = 'Materiale Studio/' + htmlName;
      /* Il documento si scrive DUE volte, ed è la scelta voluta.
         L'HTML e l'MP3 sono file fratelli e finora non si conoscevano: chi
         apriva la sintesi non sapeva che accanto c'era la voce naturale — cioè
         il materiale pagato in token restava invisibile a chi lo riceve.
         Per agganciarli serve scrivere nell'HTML il nome dell'audio, ma quel
         nome si può scrivere con onestà solo DOPO che l'MP3 è davvero sul
         disco: la voce è degradabile (FR-006, fallisce senza fermare il passo),
         quindi calcolarne il nome prima significherebbe consegnare agli allievi
         un documento che punta a un file che non c'è.
         Ordine: HTML nudo → audio → riscrittura dell'HTML col riferimento.
         Costa una scrittura di una stringa che è già in memoria, non una
         seconda generazione; e se la riscrittura fallisce resta valido il
         documento di prima, che semplicemente non richiama la voce. */
      const scriviHtml = async function (opts) {
        const html = window.MappAISynthesis.buildHtml(data, opts);
        const r = await window.electronAPI.saveVaultFile({ vaultPath, relPath: relHtml, text: html });
        if (!r || !r.ok) throw new Error('Scrittura sintesi fallita: ' + ((r && r.error) || '?'));
      };
      await scriviHtml();
      manifest = _recordFile(manifest, 'D', relHtml);
      await _writeManifest(vaultPath, manifest);
      // Voce: degradabile (FR-006) → fallimento = nota, NON step failed.
      if (config.synthesis.audio) {
        try {
          _setContext('tts');
          _overlay(_t('mp_step_d_audio', 'Genero la voce naturale…'));
          const audio = await window.MappAISynthesis.generateAudio(data);
          const b64 = await _blobToB64(audio.blob);
          /* L'audio prende il marcatore ` -VERDE` del testo che pronuncia: un
             vault può contenere «Sintesi …» e «Sintesi … -VERDE» insieme, e con
             un solo nome d'audio la seconda passata sovrascriveva la prima
             lasciando la voce accoppiata al testo sbagliato. */
          const audioName = _conEstensione(PC().buildFileName('tts', null, config.tuned, { mappa: mapName }), audio.ext);
          const relAudio = 'Materiale Studio/' + audioName;
          const wa = await window.electronAPI.saveVaultFile({ vaultPath, relPath: relAudio, base64: b64 });
          if (!wa || !wa.ok) throw new Error((wa && wa.error) || 'scrittura audio');
          manifest = _recordFile(manifest, 'D', relAudio);
          await _writeManifest(vaultPath, manifest);
          /* Ora l'MP3 esiste: l'HTML può dirlo. `audioSrc` è un percorso
             RELATIVO — i due file stanno nella stessa cartella, quindi è il
             solo nome — codificato come segmento d'URL perché spazi, «·» e
             accenti nel nome della mappa non spezzino né l'indirizzo né
             l'attributo che lo contiene.
             Passano anche i `cues`: sono i tempi di inizio di ogni blocco, cioè
             ciò che tiene il karaoke allineato alla voce. La pipeline finora li
             buttava via, e la copia nel vault leggeva peggio di quella scaricata
             a mano dallo stesso motore.
             ⚠️ Riscrittura degradabile come la voce: tutti i materiali sono già
             al loro posto, qui si perderebbe solo il collegamento. */
          try {
            /* ⚠️ Il nome viaggia GREZZO: a codificarlo è chi costruisce l'URL
               (`_relUrl` nel generatore del documento). Codificarlo anche qui
               produceva `%2520` al posto di `%20` — un file che non esiste — e
               il guasto sarebbe stato MUTO, perché il documento ripiega da solo
               sulla voce di sistema quando l'audio non carica. Un codificatore
               solo, nel punto in cui l'indirizzo si scrive. */
            await scriviHtml({ audioSrc: audioName, audioMime: audio.mime, cues: audio.cues });
          } catch (he) {
            manifest.steps.D.audioNote = _t('mp_audio_unlinked', 'voce salvata, ma il documento non la richiama: ') + (he.message || he);
          }
        } catch (ae) {
          manifest.steps.D.audioNote = 'voce non generata: ' + (ae.message || ae);
          _toast(_t('mp_audio_degraded', 'Sintesi salvata; voce non generata (' + (ae.message || ae) + ')'), 'warning');
        }
      }
      manifest = PC().stepTransition(manifest, 'D', 'done', { now: _now() });
    } catch (e) {
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
    try { chains = CC.chainsForOutput(); } catch (e) { chains = null; }
    if (!chains || !chains.total) {
      manifest = PC().stepTransition(manifest, 'E', 'skipped', { now: _now() });
      manifest.steps.E.note = _t('mp_causal_empty', 'nessun nesso causa-effetto nella mappa: catena non generata');
      await _writeManifest(vaultPath, manifest);
      _toast(_t('mp_causal_empty_toast', 'Catena dei perché non generata: la mappa non ha nessi causa-effetto riconoscibili'), 'warning');
      return manifest;
    }
    manifest = PC().stepTransition(manifest, 'E', 'running', { now: _now() });
    await _writeManifest(vaultPath, manifest);
    try {
      _overlay(_t('mp_step_e', 'Preparo la catena dei perché…'));
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
      manifest = PC().stepTransition(manifest, 'E', 'done', { now: _now() });
    } catch (e) {
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
  Pipeline.run = async function (config, opts) {
    if (Pipeline._running) { _toast(_t('mp_busy', 'Una pipeline è già in corso'), 'warning'); return; }
    opts = opts || {};
    Pipeline._running = true;
    const counter = { calls: 0 };
    try {
      const cls = config.classId ? (window.MappAIClasses && window.MappAIClasses.get(config.classId)) : null;
      config.className = cls ? cls.name : (config.className || '');
      config.sede = cls ? (cls.sede || '') : '';
      const apiKey = window.getSystemKey ? window.getSystemKey() : '';
      if (!apiKey) throw new Error(_t('tst_need_key', "Inserisci un'API Key per continuare"));

      let vaultPath = opts.vaultPath || null;
      let manifest = opts.manifest || null;

      // ── STEP A (salta se si sta riprendendo / riprovando singoli step) ──
      const doA = !opts.only;
      if (doA) {
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
            await window.startGeneration();
        } finally {
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
        _state().activeVaultPath = vaultPath;
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

      const wants = function (s) { return !opts.only || opts.only.indexOf(s) >= 0; };
      // Un tentativo su uno step failed → resettalo a running via failed→running dentro _stepX.
      if (config.quiz && wants('B') && manifest.steps.B.status !== 'done') manifest = await _passo(vaultPath, manifest, 'B', () => _stepB(vaultPath, manifest, config, apiKey, counter));
      if (config.nodesheet && wants('C') && manifest.steps.C.status !== 'done') manifest = await _passo(vaultPath, manifest, 'C', () => _stepC(vaultPath, manifest, config));
      if (config.synthesis && wants('D') && manifest.steps.D.status !== 'done') manifest = await _passo(vaultPath, manifest, 'D', () => _stepD(vaultPath, manifest, config, apiKey));
      if (config.causal && wants('E') && manifest.steps.E && manifest.steps.E.status !== 'done') manifest = await _passo(vaultPath, manifest, 'E', () => _stepE(vaultPath, manifest, config));

      // Rendi i set quiz/flashcard accessibili SUBITO dalla pagina Insegna
      // (indice mappai_studysets_index + progetto) senza attendere un autosave:
      // il docente li trova pronti sia a mappa aperta sia in Insegna (openSet).
      try { if (window.StorageManager && StorageManager.saveCurrentProject) StorageManager.saveCurrentProject(); } catch (e) { /* best-effort */ }
      if (window.MappAITeach && window.MappAITeach.refresh) { try { window.MappAITeach.refresh(); } catch (e) {} }

      _overlay(false);
      _openSummary(vaultPath, manifest, config);
    } catch (err) {
      _overlay(false);
      _toast(_t('mp_error', 'Pipeline interrotta: ') + (err.message || err), 'error');
      console.error('[MappAIPipeline]', err);
    } finally {
      Pipeline._running = false;
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
  function _refreshPresetSelect() { const s = document.getElementById('mp-preset'); if (s) s.innerHTML = _presetOptions(); }

  Pipeline._applyPreset = function () {
    const s = document.getElementById('mp-preset');
    if (!s || !s.value) { _toast(_t('mp_pick_preset', 'Scegli un preset dalla lista'), 'warning'); return; }
    const p = _loadPresets().filter(x => x.id === s.value)[0]; if (!p) return;
    const o = p.options || {};
    const set = (id, v) => { const e = document.getElementById(id); if (e) e.checked = !!v; };
    const val = (id, v) => { const e = document.getElementById(id); if (e && v != null) e.value = v; };
    set('mp-quiz-on', !!o.quiz);
    if (o.quiz) { set('mp-qt-mc', o.quiz.types.indexOf('mc') >= 0); set('mp-qt-tf', o.quiz.types.indexOf('tf') >= 0); set('mp-qt-fc', o.quiz.types.indexOf('flashcards') >= 0); val('mp-perbranch', o.quiz.perBranch); val('mp-angle', o.quiz.angle); }
    set('mp-ns-on', !!o.nodesheet);
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
    const r = document.querySelector('input[name="mp-adapt-scope"][value="' + scope + '"]');
    if (r) r.checked = true;
    _syncSections(); Pipeline._reestimate();
    _toast(_t('mp_applied', 'Preset applicato: ') + p.name, 'success');
  };

  Pipeline._savePreset = function () {
    const cfg = _readConfig(); if (!cfg) return;
    if (!_hasOutput(cfg)) { _toast(_t('mp_pick_one', 'Attiva almeno una sezione di output.'), 'warning'); return; }
    // window.prompt NON è supportato in Electron → prompt custom dell'app.
    const commit = function (name) {
      name = String(name == null ? '' : name).trim();
      if (!name) { _toast(_t('mp_preset_noname', 'Serve un nome per il preset'), 'warning'); return; }
      let list = _loadPresets();
      list = PC().presetListPush(list, { name: name, createdAt: _now(), options: PC().presetFromConfig(cfg) }, 50);
      _savePresets(list); _refreshPresetSelect();
      _toast(_t('mp_preset_saved', 'Preset salvato'), 'success');
    };
    if (window.showPrompt) window.showPrompt(_t('mp_preset_name', 'Nome del preset'), '', commit, _t('mp_preset_name_desc', 'Salva le opzioni correnti (senza la classe) per riusarle.'));
    else commit(window.prompt ? window.prompt(_t('mp_preset_name', 'Nome del preset:'), '') : '');
  };

  Pipeline._deletePreset = function () {
    const s = document.getElementById('mp-preset'); if (!s || !s.value) { _toast(_t('mp_pick_preset', 'Scegli un preset dalla lista'), 'warning'); return; }
    const list = _loadPresets().filter(x => x.id !== s.value);
    _savePresets(list); _refreshPresetSelect();
    _toast(_t('mp_preset_deleted', 'Preset eliminato'), 'info');
  };

  Pipeline.openModal = function () {
    if (Pipeline._running) { _toast(_t('mp_busy', 'Una pipeline è già in corso'), 'warning'); return; }
    if (!_state().sources || !_state().sources.length) {
      _toast(_t('mp_need_source', 'Carica almeno una fonte prima di generare i materiali'), 'warning');
      return;
    }
    const old = document.getElementById('mp-modal'); if (old) old.remove();
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
              '<div class="flex gap-x-5 gap-y-2 flex-wrap">' + chk('mp-qt-mc', _t('mp_qt_mc', 'Scelta multipla'), true) + chk('mp-qt-tf', _t('mp_qt_tf', 'Vero/Falso'), false) + chk('mp-qt-fc', _t('mp_qt_fc', 'Flashcard'), false) + '</div>' +
              '<div class="flex gap-5 items-center flex-wrap">' +
                fld(_t('mp_perbranch', 'Per ramo'), '<input type="number" id="mp-perbranch" min="1" max="10" value="3" class="w-[56px] ' + SEL + '">') +
                fld(_t('mp_angle', 'Angolo'), '<select id="mp-angle" class="' + SEL + '">' + (window.buildQuizAngleOptions ? window.buildQuizAngleOptions('auto') : '<option value="auto">auto</option>') + '</select>') +
              '</div></div></div>' +
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
    modal.addEventListener('change', () => { _syncSections(); Pipeline._reestimate(); });
    modal.addEventListener('input', () => Pipeline._reestimate());
    const esc = (e) => { if (e.key === 'Escape') { modal.remove(); document.removeEventListener('keydown', esc); } };
    document.addEventListener('keydown', esc);
    _syncSections();
    Pipeline._reestimate();
  };

  function _syncSections() {
    const on = (id) => { const e = document.getElementById(id); return e ? e.checked : false; };
    const body = (id, vis) => { const e = document.getElementById(id); if (e) e.style.display = vis ? '' : 'none'; };
    body('mp-quiz-body', on('mp-quiz-on'));
    body('mp-ns-body', on('mp-ns-on'));
    body('mp-syn-body', on('mp-syn-on'));
    body('mp-adapt-body', on('mp-adapt-on'));
    // Nome classe nel master toggle «Adatta alla classe».
    const sel = document.getElementById('mp-class');
    const lbl = document.getElementById('mp-adapt-cls');
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
    const g = (id) => document.getElementById(id);
    if (!g('mp-modal') && !g('mn-bento')) return null;
    const on = (id) => g(id) && g(id).checked;
    // «Adatta alla classe»: master + ambito → levelTuned (mappa) e/o tuned (materiali VERDE).
    const adaptOn = !!on('mp-adapt-on');
    const scopeEl = document.querySelector('input[name="mp-adapt-scope"]:checked');
    const scope = adaptOn ? (scopeEl ? scopeEl.value : 'both') : 'none';
    const cfg = {
      classId: (g('mp-class') && g('mp-class').value) || '',
      levelTuned: adaptOn && (scope === 'map' || scope === 'both'),
      tuned: adaptOn && (scope === 'materials' || scope === 'both')
    };
    if (on('mp-quiz-on')) {
      const types = [];
      if (on('mp-qt-mc')) types.push('mc');
      if (on('mp-qt-tf')) types.push('tf');
      if (on('mp-qt-fc')) types.push('flashcards');
      if (types.length) cfg.quiz = { types, perBranch: Math.max(1, Math.min(10, parseInt(g('mp-perbranch').value, 10) || 3)), angle: (g('mp-angle') && g('mp-angle').value) || 'auto' };
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
    const el = document.getElementById('mp-estimate'); if (!el) return;
    const cfg = _readConfig(); if (!cfg) return;
    if (!_hasOutput(cfg)) { el.innerHTML = _esc(_t('mp_pick_one', 'Attiva almeno una sezione di output.')); return; }
    const est = PC().estimateCalls(cfg, _mapStats());
    el.innerHTML = _esc(_t('mp_estimate', 'Stima chiamate AI') + ': ~' + est.total) +
      ' <span style="opacity:.6">(A ' + est.perStep.A + ' · B ' + est.perStep.B + ' · C ' + est.perStep.C + ' · D ' + est.perStep.D + ')</span>';
  };

  // Pre-flight + avvio dal modale.
  Pipeline._startFromModal = function () {
    const cfg = _readConfig();
    if (!cfg) return;
    if (!_hasOutput(cfg)) { _toast(_t('mp_pick_one', 'Attiva almeno una sezione di output.'), 'warning'); return; }
    const apiKey = window.getSystemKey ? window.getSystemKey() : '';
    if (!apiKey) { _toast(_t('tst_need_key', "Inserisci un'API Key per continuare"), 'error'); return; }
    // Voce: richiede la chiave Google diretta → altrimenti deseleziona con avviso (FR-006).
    if (cfg.synthesis && cfg.synthesis.audio) {
      let gk = ''; try { gk = localStorage.getItem('gemini_api_key') || ''; } catch (e) {}
      if (!gk) { cfg.synthesis.audio = false; _toast(_t('mp_no_google', 'Voce naturale disattivata: serve la chiave Google (Gemini). La sintesi sarà solo testo.'), 'warning'); }
    }
    const modal = document.getElementById('mp-modal'); if (modal) modal.remove();
    Pipeline.run(cfg);
  };

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

  window.MappAIPipeline = Pipeline;
  console.log('[MappAIPipeline] orchestratore pipeline materiali caricato');
})();
