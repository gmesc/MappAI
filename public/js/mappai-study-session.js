// ==========================================
// STUDY SESSION (config, player, punteggi, report) — estratto da app.js
// ==========================================
// Caricato DOPO app.js: appState e gli helper (window.* e bare) si risolvono
// a runtime via scope lessicale globale condiviso.
window.globalQuizQueue = [];

let pendingTopic = null;
window.studyConfig = { mode: 'quiz', quantity: 15, timer: false, target: null, scope: 'all' };

window.generateGlobalFlashcards = function () {
    window.openStudyConfigModal('flashcard');
};

window.generateGlobalQuiz = function () {
    window.openStudyConfigModal('quiz');
};

window.openStudyConfigModal = function (mode, targetNode = null, scope = 'all') {
    window.studyConfig.mode = mode;
    window.studyConfig.target = targetNode;
    window.studyConfig.scope = scope;

    window.selectStudyQuantity(15);
    document.getElementById('study-timer-toggle').checked = false;

    let title = mode === 'quiz' ? 'Configura Quiz' : 'Configura Flashcard';
    if (scope === 'node' && targetNode) title += ` (${targetNode.label})`;
    else if (scope === 'branch' && targetNode) title += ` (Ramo ${targetNode.label})`;

    document.getElementById('study-config-title').innerText = title;

    let iconName = 'brain-circuit';
    if (mode === 'quiz') {
        iconName = scope === 'branch' ? 'layers' : 'graduation-cap';
    } else {
        iconName = scope === 'branch' ? 'network' : 'brain-circuit';
    }
    const iconElem = document.getElementById('study-config-icon');
    if (iconElem) {
        iconElem.setAttribute('data-lucide', iconName);
    }
    const quizTypeContainer = document.getElementById('quiz-type-container');
    if (mode === 'quiz') {
        quizTypeContainer.classList.remove('hidden');
        const angleSel = document.getElementById('study-quiz-angle');
        if (angleSel && window.buildQuizAngleOptions) {
            angleSel.innerHTML = window.buildQuizAngleOptions(window.studyConfig && window.studyConfig.quizAngle);
        }
    } else quizTypeContainer.classList.add('hidden');

    const modal = document.getElementById('study-config-modal');
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    setTimeout(() => modal.classList.remove('opacity-0'), 10);
    window.safeCreateIcons();
};

window.closeStudyConfigModal = function () {
    const modal = document.getElementById('study-config-modal');
    modal.classList.add('opacity-0');
    setTimeout(() => {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }, 200);
};

window.selectStudyQuantity = function (qty) {
    window.studyConfig.quantity = qty;
    document.querySelectorAll('.study-qty-btn').forEach(btn => {
        if (parseInt(btn.dataset.qty) === qty) {
            btn.classList.remove('bg-slate-50', 'text-slate-500', 'border-slate-200');
            btn.classList.add('bg-indigo-50', 'text-indigo-600', 'border-indigo-500');
        } else {
            btn.classList.add('bg-slate-50', 'text-slate-500', 'border-slate-200');
            btn.classList.remove('bg-indigo-50', 'text-indigo-600', 'border-indigo-500');
        }
    });
};

// Generatore quiz riusabile (stesso motore del quiz di Studio, DYNAMIC_QUIZ).
// Ritorna gli item grezzi { q, options[], correct(string|indice), explanation }.
// Usato da MappAI Live per avere quiz della STESSA qualità di quelli in-app
// (domande vere con opzioni + spiegazione), non il formato "completamento".
// Nonce di variazione: codice breve unico per somministrazione, iniettato nel prompt
// ({{nonce}}) per rompere il determinismo del campionamento (stesso materiale + temp bassa
// → altrimenti domande quasi identiche tra sessioni). Vedi diagnosi varietà quiz.
window.quizNonce = function () {
    try { return Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4); }
    catch (e) { return 'v' + (Date.now() % 1000000); }
};
// Temperature dedicata ai quiz: più alta della generazione mappe (0.3) per diversificare
// le formulazioni a parità di materiale. `_respectTemp` segnala al bridge Infomaniak di
// NON forzare 0.3 (di default il bridge ignora la temperature del payload — vedi CLAUDE.md §3).
window.QUIZ_TEMPERATURE = 0.7;

// ── Angolo delle domande (varietà quiz, 20/7) ───────────────────────────────
// 'auto' = misto/rotante (default): il modello varia angolo e sintassi ad ogni
// generazione. Gli altri = taglio UNICO per tutte le domande (verifica mirata).
// hint IT/EN = istruzione concreta iniettata nel prompt (regola 14, lingua mappe).
window.QUIZ_ANGLES = [
    { key: 'auto', hint: '', hintEn: '' },
    { key: 'definizione', hint: 'la DEFINIZIONE: che cos\'è, spiega il concetto', hintEn: 'the DEFINITION: what it is, explaining the concept' },
    { key: 'causa', hint: 'la CAUSA: perché avviene, che cosa lo provoca', hintEn: 'the CAUSE: why it happens, what triggers it' },
    { key: 'conseguenza', hint: 'la CONSEGUENZA: che cosa comporta, che cosa ne deriva', hintEn: 'the CONSEQUENCE: what it entails, what follows from it' },
    { key: 'esempio', hint: 'un ESEMPIO concreto: applicare il concetto a un caso reale della fonte', hintEn: 'a concrete EXAMPLE: applying the concept to a real case from the source' },
    { key: 'confronto', hint: 'un CONFRONTO: differenze e somiglianze fra due elementi del testo', hintEn: 'a COMPARISON: differences and similarities between two elements of the text' },
    { key: 'eccezione', hint: 'un\'ECCEZIONE o un limite: quando NON vale, i casi particolari', hintEn: 'an EXCEPTION or limit: when it does NOT hold, the special cases' },
    { key: 'applicazione', hint: 'un\'APPLICAZIONE/INFERENZA: usare il concetto per dedurre o risolvere un caso', hintEn: 'an APPLICATION/INFERENCE: using the concept to deduce or solve a case' }
];
window.quizAngleLabel = function (key) {
    var m = { auto: 'Automatico (misto)', definizione: 'Definizione', causa: 'Causa', conseguenza: 'Conseguenza', esempio: 'Esempio concreto', confronto: 'Confronto', eccezione: 'Eccezione / limite', applicazione: 'Applicazione / inferenza' };
    return window.t ? window.t('qa_' + key, m[key] || key) : (m[key] || key);
};
window.buildQuizAngleOptions = function (selected) {
    var sel = selected || 'auto';
    return (window.QUIZ_ANGLES || []).map(function (a) {
        return '<option value="' + a.key + '"' + (a.key === sel ? ' selected' : '') + '>' + window.quizAngleLabel(a.key) + '</option>';
    }).join('');
};
// Blocco istruzione da ANTEPORRE al prompt quiz: angolo (misto o forzato) + sintassi
// varia (anti-memorizzazione). Sostituisce il debole "usa il nonce per variare".
window.quizAngleBlock = function (angleKey) {
    var en = (typeof window.getPromptLanguage === 'function') && window.getPromptLanguage() === 'en';
    var a = (window.QUIZ_ANGLES || []).filter(function (x) { return x.key === angleKey; })[0];
    var head;
    if (!a || a.key === 'auto') {
        head = en
            ? 'ANGLE OF THIS SET: vary the angle across the questions (definition, cause, consequence, concrete example, comparison, exception, application/inference) — never two questions on the same aspect.'
            : 'ANGOLO DI QUESTA GENERAZIONE: varia l\'angolo tra le domande (definizione, causa, conseguenza, esempio concreto, confronto, eccezione, applicazione/inferenza) — mai due domande sullo stesso aspetto.';
    } else {
        head = en
            ? 'ANGLE OF THIS SET (mandatory): EVERY question must be built around ' + (a.hintEn || a.key) + '.'
            : 'ANGOLO DI QUESTA GENERAZIONE (obbligatorio): OGNI domanda deve avere come taglio ' + a.hint + '.';
    }
    var syntax = en
        ? ' SYNTACTIC VARIETY: vary the question FORM (open "why/how", completion, concrete case, "which is NOT…", motivated true/false) so students cannot memorize the pattern.'
        : ' VARIETÀ SINTATTICA: varia la FORMA della domanda (aperta "perché/come", completamento, caso concreto, "quale NON…", vero/falso motivato) così gli allievi non memorizzano lo schema.';
    return head + syntax;
};

/* ── L'ANGOLO DI UN MAZZO DI FLASHCARD (20/8 notte) ──────────────────────────
   Terzo gemello sulla STESSA tabella `QUIZ_ANGLES` (gli angoli sono uno solo).
   Fino a oggi `_genFlashcards` l'angolo non lo riceveva: otto spunte facevano
   otto mazzi IDENTICI con otto nomi diversi — per questo le flashcard erano
   escluse dal «Più set per angolo». Ora il taglio è vero, e il blocco deve
   anche SCAVALCARE la riga «VARIA il tipo di domanda (definizione, causa…)»
   che il template FLASHCARD_GENERATOR porta scritta dentro: con un angolo
   forzato quella riga direbbe il contrario (è la trappola già pagata con la
   `varieta` delle domande aperte — ma qui la riga è nel template, quindi si
   nega, non si toglie). */
window.flashcardAngleBlock = function (angleKey) {
    var en = (typeof window.getPromptLanguage === 'function') && window.getPromptLanguage() === 'en';
    var a = (window.QUIZ_ANGLES || []).filter(function (x) { return x.key === angleKey; })[0];
    if (!a || a.key === 'auto') return '';
    return en
        ? ('ANGLE OF THIS DECK (mandatory, overrides any instruction below about varying question types): EVERY card must be built around ' + (a.hintEn || a.key) + '. Vary the WORDING, never the angle.')
        : ('ANGOLO DI QUESTO MAZZO (obbligatorio, scavalca qualunque istruzione sotto sul variare il tipo di domanda): OGNI carta deve avere come taglio ' + a.hint + '. Varia la FORMULAZIONE, mai l\'angolo.');
};

/* ── L'ANGOLO E LA GRADUAZIONE DI UN FOGLIO DI DOMANDE APERTE (13/8 sera) ────
   Gemello di `quizAngleBlock`, e legge la STESSA tabella `QUIZ_ANGLES`: gli
   angoli sono uno solo, e due elenchi divergerebbero al primo aggiunto.
   Ma il testo è diverso, e deve esserlo: la «VARIETÀ SINTATTICA» dei quiz
   propone forme che qui non esistono («quale NON…», vero/falso motivato).
   ⚠️ Il blocco DICHIARA di prevalere sulle indicazioni di varietà del
   template. Serve davvero: chi ha un `prompts_config.json` personale continua
   ad avere la vecchia riga «distribuisci le domande fra…», che direbbe
   l'opposto — e a parità di autorevolezza vince l'ultima letta, cioè quella
   sbagliata. Senza questa clausola l'angolo funzionerebbe solo sui default.  */
window.openQuestionsAngleBlock = function (angleKey, opts) {
    opts = opts || {};
    var en = (typeof window.getPromptLanguage === 'function') && window.getPromptLanguage() === 'en';
    var a = (window.QUIZ_ANGLES || []).filter(function (x) { return x.key === angleKey; })[0];
    var righe = [];
    if (a && a.key !== 'auto') {
        righe.push(en
            ? 'ANGLE OF THIS SHEET (mandatory, overrides any "variety" instruction below): EVERY question must be built around ' + (a.hintEn || a.key) + '. Vary the wording, never the angle.'
            : 'ANGOLO DI QUESTO FOGLIO (obbligatorio, PREVALE su ogni indicazione di varietà più sotto): OGNI domanda deve avere come taglio ' + a.hint + '. Varia la formulazione, mai l\'angolo.');
    }
    /* La graduazione: quante domande d'AVVIO su quante. Si chiede un NUMERO,
       non una percentuale — «il 40% delle domande» è una proporzione che il
       modello deve calcolare mentre scrive, e la sbaglia; «2 domande su 5» è
       un'istruzione che può eseguire e che noi possiamo contare. */
    var nBase = parseInt(opts.base, 10) || 0;
    var tot = parseInt(opts.tot, 10) || 0;
    if (nBase > 0 && tot > 0) {
        righe.push(en
            ? 'GRADING: exactly ' + nBase + ' of the ' + tot + ' questions must be ENTRY questions ("livello":"base"): answerable with ONE concept taken explicitly from the material, by a student who studied only part of the sheet. The other ' + (tot - nBase) + ' are BRIDGE questions ("livello":"ponte"): they require connecting two or more concepts, or applying them to a new case. Declare the level of every question in the "livello" field. Entry questions are NOT trivial or single-word: they still ask to explain, in the student\'s own words.'
            : 'GRADUAZIONE: esattamente ' + nBase + ' domande sulle ' + tot + ' devono essere di AVVIO ("livello":"base"): si rispondono con UN concetto solo, preso esplicitamente dal materiale, da uno studente che ha studiato solo una parte della scheda. Le altre ' + (tot - nBase) + ' sono di PONTE ("livello":"ponte"): richiedono di collegare due o più concetti, o di applicarli a un caso nuovo. Una domanda di avvio NON è banale e non si risponde con una parola: chiede comunque di spiegare con parole proprie, ma su una cosa sola. SCRIVI PER PRIME le ' + nBase + ' domande di avvio, poi le altre, e dichiara il campo "livello" su OGNI domanda.');
    } else if (tot > 0) {
        righe.push(en
            ? 'GRADING: every question is a BRIDGE question ("livello":"ponte"): connecting or applying concepts.'
            : 'GRADUAZIONE: tutte le domande sono di PONTE ("livello":"ponte"): collegano o applicano concetti.');
    }
    return righe.join('\n\n');
};

/* ── LA RICHIESTA DELLA PROVA (11/9) ──────────────────────────────────────────
   Il blocco sta FUORI dal template e PRIMA di esso, come l'angolo: chi ha un
   `prompts_config.json` personale non ha la variabile nuova e la lascerebbe
   cadere in silenzio. Chiede la frase del materiale che rende vera la risposta —
   che poi `verificaEvidenza` controlla davvero. */
window.quizEvidenceBlock = function () {
    var en = (typeof window.getPromptLanguage === 'function') && window.getPromptLanguage() === 'en';
    return en
        ? 'PROOF (mandatory for every question): in the "evidenza" field copy the sentence from the MATERIAL below that makes the correct answer true. Copy it from the material, do not rewrite it and do not summarise it. If no sentence in the material supports an answer, do NOT write that question: write one fewer.'
        : 'LA PROVA (obbligatoria per ogni domanda): nel campo "evidenza" copia la frase del MATERIALE qui sotto che rende vera la risposta esatta. Copiala dal materiale, non riscriverla e non riassumerla. Se nessuna frase del materiale sostiene una risposta, NON scrivere quella domanda: scrivine una in meno.';
};

/* ── LA LUNGHEZZA DELLA RISPOSTA GIUSTA (12/9) ────────────────────────────────
   Misurato su 126 domande vere: la risposta esatta è la più lunga delle tre in
   69 casi, il 55%, quando per caso sarebbe un terzo. Uno studente che non ha
   studiato sceglie la più lunga e prende il punto: la verifica smette di
   misurare ciò che dice di misurare.

   ⚠️ Non si corregge dopo. Il margine mediano è del 3% — la risposta giusta è
   quasi sempre più lunga di POCO — quindi non esiste una soglia che separi le
   domande da buttare da quelle da tenere: con un rapporto a 1,4 si scarterebbe
   UN item su 126, e con una soglia più bassa si butterebbero domande sane. E
   accorciare a macchina la risposta esatta le toglierebbe proprio la parte che
   la rende esatta. Si risolve dove il difetto nasce: nel momento in cui il
   modello scrive le opzioni.

   La causa è meccanica: la risposta giusta deve essere precisa, quindi si porta
   dietro qualificazioni e dettagli; i distrattori sono falsi e non hanno niente
   da specificare. L'istruzione perciò non dice «fai le opzioni della stessa
   lunghezza» (che si ottiene allungando a vuoto) ma «dai a ogni opzione sbagliata
   la SUA qualificazione plausibile». */
window.quizLengthBlock = function () {
    var en = (typeof window.getPromptLanguage === 'function') && window.getPromptLanguage() === 'en';
    return en
        ? 'LENGTH OF THE OPTIONS (mandatory): the correct answer must NOT be the longest or the most detailed one. A wrong option that is short and bare gives the answer away without any knowledge of the subject. Give each wrong option its OWN plausible qualification — a circumstance, a date, a reason, a consequence — drawn from the same topic, so that the three options are comparable in length and in level of detail. If the correct answer needs a qualification to be exact, the wrong ones need one too.'
        : 'LUNGHEZZA DELLE OPZIONI (obbligatoria): la risposta esatta NON deve essere la più lunga né la più dettagliata. Un\'opzione sbagliata corta e spoglia regala la risposta a chi non sa niente della materia. Dai a ogni opzione sbagliata la SUA qualificazione plausibile — una circostanza, una data, un motivo, una conseguenza — presa dallo stesso argomento, così che le tre opzioni siano confrontabili per lunghezza e per grado di dettaglio. Se la risposta esatta ha bisogno di una precisazione per essere esatta, anche le sbagliate ne hanno bisogno.';
};

// La taratura classe è iniettata come ovunque via injectClassTuning.
window.generateDynamicQuiz = async function (opts) {
    opts = opts || {};
    const nodeLabel = opts.nodeLabel || 'Globale';
    const material = (opts.material || '').trim();
    const quizType = opts.quizType || 'Scelta Multipla';
    const quantity = opts.quantity || 3;
    const apiKey = opts.apiKey || (window.getSystemKey && window.getSystemKey());
    if (!apiKey || !material) return [];
    if (window.MappAIUsage) {
        const qt = String(quizType).toLowerCase();
        window.MappAIUsage.setContext(opts.usageCat || 'study',
            opts.usageSub || (qt.indexOf('vero') >= 0 ? 'quiz_tf' : (qt.indexOf('apert') >= 0 ? 'quiz_open' : 'quiz_mc')));
    }
    const nonce = opts.nonce || window.quizNonce();
    const angleBlock = window.quizAngleBlock ? window.quizAngleBlock(opts.angle || 'auto') : '';
    const evBlock = window.quizEvidenceBlock ? window.quizEvidenceBlock() : '';
    /* la regola sulla lunghezza vale solo dove ci sono opzioni da scegliere */
    const lenBlock = (window.quizLengthBlock && !/apert/i.test(String(quizType)))
        ? window.quizLengthBlock() : '';
    const prompt = (angleBlock ? angleBlock + '\n\n' : '') +
        window.fillPromptTemplate("DYNAMIC_QUIZ", { quantity, quizType, nodeLabel, nonce }) +
        (evBlock ? '\n\n' + evBlock : '') +
        (lenBlock ? '\n\n' + lenBlock : '');
    /* ── LA PROVA (11/9) ──────────────────────────────────────────────────────
       `evidenza` = la frase del MATERIALE che rende vera la risposta segnata. Non
       serve al foglio (non viene stampata): serve a poterla CONTROLLARE. Senza,
       il modello costruisce domande su fatti che ha aggiunto di suo e nessuno se
       ne accorge — misurato su una cartella vera: «La Commissione Bergier è stata
       formata nel 2002», mentre la fonte data al 2002 il rapporto.
       ⚠️ `maxItems` non è ornamentale: senza, il modello riempie l'array fino al
       budget e tronca (regola 05), e un campo obbligatorio in più rende quel
       rischio più vicino. */
    const _quante = Math.max(1, parseInt(quantity, 10) || 5);
    const schema = {
        type: "ARRAY",
        maxItems: _quante,
        items: {
            type: "OBJECT",
            properties: {
                q: { type: "STRING" },
                options: { type: "ARRAY", items: { type: "STRING" } },
                correct: { type: "STRING" },
                explanation: { type: "STRING" },
                evidenza: { type: "STRING" }
            },
            required: ["q", "correct", "explanation", "evidenza"]
        }
    };
    try {
        const resp = await window.fetchModelAPI(window.injectClassTuning({
            contents: [{ parts: [{ text: prompt + "\n\nMateriale:\n" + material }] }],
            /* budget largo: il numero di domande lo tiene `maxItems`, questo serve
               solo a non far troncare una risposta verbosa (misurato il 12/9 sulle
               domande aperte: un budget stretto ha perso metà del foglio). Le
               chiamate vere stanno sotto i 900 token. */
            generationConfig: { temperature: opts.temperature || window.QUIZ_TEMPERATURE, maxOutputTokens: window.getMaxOutputTokens(_quante * 450 + 1200), responseMimeType: "application/json", responseSchema: schema, _respectTemp: true }
        }), apiKey);
        const raw = resp && resp.candidates && resp.candidates[0] && resp.candidates[0].content.parts[0].text || '';
        let arr = window.salvageTruncatedJSON(raw.split('```json').join('').split('```').join('').trim());
        if (!Array.isArray(arr)) return [];
        /* ── POST-PRODUZIONE (11/9) ───────────────────────────────────────────
           Fra la risposta del modello e il PDF stampato non c'era NIENTE: la
           risposta esatta usciva dov'era stata scritta, e in una cartella vera
           finiva in seconda posizione 56 volte su 84 (dodici su dodici in un
           foglio). Qui si mettono i due passaggi che mancavano, entrambi
           deterministici e senza chiamate:
             · si scartano le domande la cui `evidenza` non sta nel materiale;
             · si rimescolano le opzioni con un seme fisso, così la stessa
               verifica ristampata resta identica (il docente che ha già
               fotocopiato non si ritrova due versioni in classe). */
        const PC = window.MappAIPipelineCore;
        if (PC && PC.verificaEvidenza) {
            const v = PC.verificaEvidenza(arr, material);
            if (v.scartati.length) {
                console.warn('[Quiz] ' + v.scartati.length + ' domande scartate: la prova citata non è nel materiale');
                v.scartati.forEach(x => console.warn('   · «' + String(x.q).slice(0, 70) + '» → ' + String(x.evidenza).slice(0, 90)));
            }
            arr = v.items;
            const seme = opts.seme || (nodeLabel + '|' + quizType + '|' + (opts.angle || 'auto') + '|' + nonce);
            arr = PC.mescolaOpzioni(arr, seme);
            const pos = PC.posizioniCorrette(arr);
            if (pos.tot >= 4 && pos.maxQuota > 0.6) {
                console.warn('[Quiz] la risposta esatta cade nella stessa posizione nel ' + Math.round(pos.maxQuota * 100) + '% degli item');
            }
            const lun = PC.corretteTroppoLunghe(arr);
            if (lun.tot >= 4 && lun.quota > 0.6) {
                console.warn('[Quiz] la risposta esatta è la più lunga in ' + lun.n + '/' + lun.tot + ' item: si riconosce senza leggere');
            }
        }
        return arr;
    } catch (e) { console.warn('[generateDynamicQuiz]', e && e.message); return []; }
};

window.startStudySession = async function () {
    if (window.mappaiOccupato && window.mappaiOccupato()) return;
    window.closeStudyConfigModal();
    window.studyConfig.timer = document.getElementById('study-timer-toggle').checked;
    if (window.studyConfig.mode === 'quiz') {
        window.studyConfig.quizType = document.getElementById('study-quiz-type').value;
        const _angEl = document.getElementById('study-quiz-angle');
        window.studyConfig.quizAngle = _angEl ? _angEl.value : 'auto';
    }

    let studyText = "";
    let targetLabel = "Globale";

    if (window.studyConfig.scope === 'node' && window.studyConfig.target) {
        const n = window.studyConfig.target;
        studyText = `${n.label}: ${n.desc || n.content}`;
        const isKG = appState.db.extractionMode === 'knowledge_graph';
        const nodePrefix = (isKG && n.level === 1) ? 'Hub' : 'Nodo';
        targetLabel = `${nodePrefix}: ${n.label}`;
    } else if (window.studyConfig.scope === 'branch' && window.studyConfig.target) {
        const root = window.studyConfig.target;
        const branchNodes = [root, ...window.getDescendants(root.id)];
        studyText = branchNodes.map(n => n.label + ": " + (n.desc || n.content)).join('\n');
        targetLabel = `Ramo: ${root.label}`;
    } else {
        studyText = appState.db.nodes.map(n => n.label + ": " + (n.desc || n.content)).join('\n');
    }

    if (!studyText || studyText.trim() === '') {
        window.showToast(window.t('tst_no_study_content', "Nessun contenuto trovato per lo studio."), "error");
        return;
    }

    const apiKey = window.getSystemKey();
    if (!apiKey) { window.showToast(window.t('tst_key_in_settings', "Inserisci API Key nelle impostazioni."), "error"); return; }

    window.showLoadingOverlay(true, window.t('lo_study_gen', "Generazione materiale di studio in corso..."), window.studyConfig.mode === 'quiz' ? 'quiz' : 'flashcard');

    try {
        let items;
        if (window.studyConfig.mode === 'quiz') {
            // Motore CONDIVISO con MappAI Live: un solo punto per il prompt DYNAMIC_QUIZ,
            // nonce, temperature e schema (window.generateDynamicQuiz). Imposta da sé il
            // contesto consumi (study/quiz_*) e ritorna [] su errore.
            items = await window.generateDynamicQuiz({
                nodeLabel: targetLabel,
                material: studyText,
                quizType: window.studyConfig.quizType,
                quantity: window.studyConfig.quantity,
                angle: window.studyConfig.quizAngle || 'auto',
                apiKey: apiKey
            });
        } else {
            // Flashcard: template diverso (FLASHCARD_GENERATOR, schema front/back), resta qui.
            if (window.MappAIUsage) window.MappAIUsage.setContext('study', 'flashcards');
            const _PLfc = window.MappAIPrintLayout;
            // vincolo di stampa (soglia caratteri + niente URL/formule)
            const _regolaFc = _PLfc ? _PLfc.promptRule(_PLfc.flashGeom(), null, window.getMapLanguage ? window.getMapLanguage() : "it") : "";
            const prompt = window.fillPromptTemplate("FLASHCARD_GENERATOR", {
                quantity: window.studyConfig.quantity,
                nodeLabel: targetLabel,
                nonce: window.quizNonce()
            }) + _regolaFc;
            const schema = {
                type: "ARRAY",
                items: {
                    type: "OBJECT",
                    properties: { front: { type: "STRING" }, back: { type: "STRING" } },
                    required: ["front", "back"]
                }
            };
            const response = await window.fetchModelAPI(window.injectClassTuning({
                contents: [{ parts: [{ text: prompt + "\n\nMateriale:\n" + studyText }] }],
                generationConfig: { temperature: window.QUIZ_TEMPERATURE, responseMimeType: "application/json", responseSchema: schema, _respectTemp: true }
            }), apiKey);
            const rawText = response.candidates[0].content.parts[0].text;
            items = salvageTruncatedJSON(rawText.split('```json').join('').split('```').join('').trim());
        }

        if (!Array.isArray(items) || !items.length) {
            window.showLoadingOverlay(false);
            window.showToast(window.t('tst_gen_empty', "Generazione non riuscita: nessuna domanda prodotta."), "error");
            return;
        }
        window.activeStudySessionItems = items;

        appState.db.studySets = appState.db.studySets || [];
        const label = targetLabel;
        window.activeStudySetTitle = label; // titolo corretto in storico e sul bus
        const _setId = 'set_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
        window.activeStudySetId = _setId;   // per "Domande nuove" nel player
        appState.db.studySets.push({
            id: _setId,
            title: label,
            mode: window.studyConfig.mode,
            type: window.studyConfig.quizType || 'Flashcard',
            items: window.activeStudySessionItems,
            // Materiale sorgente per "Rigenera domande nuove" (nuova chiamata AI con nonce
            // fresco, invece del replay verbatim di loadStudySet). Cap difensivo.
            material: String(studyText || '').slice(0, 12000),
            angle: window.studyConfig.quizAngle || 'auto',   // taglio scelto: la rigenerazione lo mantiene
            quantity: window.studyConfig.quantity,
            date: new Date().toISOString()
        });
        if (window.renderStudySets) window.renderStudySets();

        window.currentStudyItemIndex = 0;

        // Initialize results
        window.studyResults = {
            mode: window.studyConfig.mode,
            type: window.studyConfig.quizType || 'Flashcard',
            correct: 0,
            total: window.activeStudySessionItems.length,
            mistakes: [],
            openAnswers: [],
            startTime: Date.now()
        };

        window.openStudyPlayer();

    } catch (err) {
        window.showAlert("Errore Generazione", err.message);
    } finally {
        window.showLoadingOverlay(false);
    }
};

window.studyTimerInterval = null;
window.studySeconds = 0;

window.openStudyPlayer = function () {
    if (!window.activeStudySessionItems || window.activeStudySessionItems.length === 0) {
        window.showToast(window.t('tst_no_questions', "Nessuna domanda generata."), "error");
        return;
    }

    const modal = document.getElementById('study-player-modal');
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    setTimeout(() => modal.classList.remove('opacity-0'), 10);

    let iconName = 'brain-circuit';
    if (window.studyConfig.mode === 'quiz') {
        iconName = window.studyConfig.scope === 'branch' ? 'layers' : 'graduation-cap';
    } else {
        iconName = window.studyConfig.scope === 'branch' ? 'network' : 'brain-circuit';
    }
    const iconElem = document.getElementById('study-player-icon');
    if (iconElem) {
        iconElem.setAttribute('data-lucide', iconName);
    }

    const timerContainer = document.getElementById('study-player-timer-container');
    if (window.studyConfig.timer) {
        timerContainer.classList.remove('hidden');
        window.studySeconds = 0;
        timerContainer.innerText = "00:00";
        if (window.studyTimerInterval) clearInterval(window.studyTimerInterval);
        window.studyTimerInterval = setInterval(() => {
            window.studySeconds++;
            const m = String(Math.floor(window.studySeconds / 60)).padStart(2, '0');
            const s = String(window.studySeconds % 60).padStart(2, '0');
            timerContainer.innerText = `${m}:${s}`;
        }, 1000);
    } else {
        timerContainer.classList.add('hidden');
    }

    document.getElementById('study-flashcard-view').classList.add('hidden');
    document.getElementById('study-quiz-view').classList.add('hidden');
    document.getElementById('study-summary-view').classList.add('hidden');

    // "Domande nuove" nel player: visibile solo se il set attivo è rigenerabile (ha material)
    const regenBtn = document.getElementById('study-player-regen');
    if (regenBtn) {
        const aset = (appState.db.studySets || []).find(s => s.id === window.activeStudySetId);
        const canRegen = !!(aset && aset.material);
        regenBtn.classList.toggle('hidden', !canRegen);
        regenBtn.classList.toggle('flex', canRegen);
    }

    window.renderCurrentStudyItem();
    window.safeCreateIcons();
};

// "Domande nuove" dal player: rigenera il set attivo (nonce fresco) e riparte da capo.
window.regenerateActiveSet = async function () {
    const id = window.activeStudySetId;
    if (!id || typeof window.regenerateStudySet !== 'function') {
        window.showToast(window.t('tst_no_active_set', "Nessun set attivo da rigenerare."), "warning"); return;
    }
    await window.regenerateStudySet(id);
    const set = (appState.db.studySets || []).find(s => s.id === id);
    if (set && Array.isArray(set.items) && set.items.length) {
        window.activeStudySessionItems = set.items;
        window.currentStudyItemIndex = 0;
        window.studyResults = { mode: set.mode, type: set.type, correct: 0, total: set.items.length, mistakes: [], openAnswers: [], startTime: Date.now() };
        document.getElementById('study-flashcard-view').classList.add('hidden');
        document.getElementById('study-quiz-view').classList.add('hidden');
        document.getElementById('study-summary-view').classList.add('hidden');
        window.renderCurrentStudyItem();
        window.safeCreateIcons();
    }
};

window.closeStudyPlayer = function () {
    if (window.studyTimerInterval) clearInterval(window.studyTimerInterval);
    const modal = document.getElementById('study-player-modal');
    modal.classList.add('opacity-0');
    setTimeout(() => {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }, 200);
};

window.renderCurrentStudyItem = function () {
    const item = window.activeStudySessionItems[window.currentStudyItemIndex];
    document.getElementById('study-player-progress').innerText = `${window.currentStudyItemIndex + 1} / ${window.activeStudySessionItems.length}`;

    if (window.studyConfig.mode === 'flashcard') {
        document.getElementById('study-flashcard-view').classList.remove('hidden');
        document.getElementById('study-flashcard-view').classList.add('flex');
        document.getElementById('study-quiz-view').classList.add('hidden');

        document.getElementById('flashcard-front').classList.remove('hidden');
        document.getElementById('flashcard-back-container').classList.add('hidden');
        document.getElementById('flashcard-front-text').innerText = item.front;
        document.getElementById('flashcard-back-text').innerText = item.back;
    } else {
        document.getElementById('study-quiz-view').classList.remove('hidden');
        document.getElementById('study-quiz-view').classList.add('flex');
        document.getElementById('study-flashcard-view').classList.add('hidden');

        document.getElementById('study-quiz-question').innerText = item.q;
        document.getElementById('study-quiz-feedback').classList.add('hidden');

        const isMultiple = item.options && item.options.length > 0;
        const optsContainer = document.getElementById('study-quiz-options');
        const openContainer = document.getElementById('study-quiz-open');

        if (isMultiple) {
            optsContainer.classList.remove('hidden');
            openContainer.classList.add('hidden');
            optsContainer.innerHTML = '';
            item.options.forEach((opt, idx) => {
                const btn = document.createElement('button');
                btn.className = "w-full p-4 bg-white border-2 border-slate-200 rounded-xl text-left hover:border-indigo-400 hover:bg-indigo-50 transition text-slate-700 font-medium";
                btn.innerText = opt;
                btn.onclick = () => window.checkQuizAnswer(opt, item);
                optsContainer.appendChild(btn);
            });
        } else {
            optsContainer.classList.add('hidden');
            openContainer.classList.remove('hidden');
            openContainer.classList.add('flex');
            document.getElementById('study-quiz-textarea').value = '';
        }
    }
};

window.flipFlashcard = function () {
    document.getElementById('flashcard-front').classList.add('hidden');
    document.getElementById('flashcard-back-container').classList.remove('hidden');
    document.getElementById('flashcard-back-container').classList.add('flex');
};

window.checkQuizAnswer = function (selected, item) {
    // Match fuzzy con vincolo di lunghezza: il vecchio includes() bidirezionale
    // dava falsi positivi ("Roma" matchava "Romania").
    const _core = window.MappAIActiveStudyCore;
    const isCorrect = _core
        ? _core.answerMatches(selected, item.correct)
        : String(selected).trim().toLowerCase() === String(item.correct).trim().toLowerCase();

    if (isCorrect) {
        window.studyResults.correct++;
    } else {
        window.studyResults.mistakes.push({
            q: item.q,
            userAnswer: selected,
            correctAnswer: item.correct,
            explanation: item.explanation
        });
    }

    const feedbackTitle = document.getElementById('study-quiz-feedback-title');
    const feedbackDesc = document.getElementById('study-quiz-feedback-desc');

    if (isCorrect) {
        feedbackTitle.innerHTML = '<i data-lucide="check-circle" class="text-emerald-500 w-5 h-5"></i> Esatto!';
        feedbackTitle.className = "font-black mb-3 uppercase tracking-wider text-sm flex items-center justify-center gap-2 text-emerald-600";
    } else {
        feedbackTitle.innerHTML = '<i data-lucide="x-circle" class="text-red-500 w-5 h-5"></i> Sbagliato';
        feedbackTitle.className = "font-black mb-3 uppercase tracking-wider text-sm flex items-center justify-center gap-2 text-red-600";
    }

    feedbackDesc.innerHTML = `<strong>Risposta corretta:</strong> ${item.correct}<br><br><strong>Spiegazione:</strong> ${item.explanation}`;
    document.getElementById('study-quiz-feedback').classList.remove('hidden');
    document.getElementById('study-quiz-options').classList.add('hidden');
    window.safeCreateIcons();
};

window.checkOpenAnswer = function () {
    const item = window.activeStudySessionItems[window.currentStudyItemIndex];
    const userAnswer = document.getElementById('study-quiz-textarea').value || "";

    document.getElementById('study-quiz-open').classList.add('hidden');
    document.getElementById('study-quiz-open').classList.remove('flex');

    const feedbackTitle = document.getElementById('study-quiz-feedback-title');
    const feedbackDesc = document.getElementById('study-quiz-feedback-desc');

    feedbackTitle.innerHTML = '<i data-lucide="info" class="text-indigo-500 w-5 h-5"></i> Verifica la tua risposta';
    feedbackTitle.className = "font-black mb-3 uppercase tracking-wider text-sm flex items-center justify-center gap-2 text-indigo-600";
    feedbackDesc.innerHTML = `<strong>Risposta di riferimento:</strong> ${item.correct}<br><br><strong>Spiegazione:</strong> ${item.explanation}`;

    document.getElementById('study-quiz-feedback').classList.remove('hidden');

    // Inizializza openAnswers se non esiste per sicurezza
    if (!window.studyResults.openAnswers) window.studyResults.openAnswers = [];
    window.studyResults.openAnswers.push({
        q: item.q,
        userAnswer: userAnswer,
        correctAnswer: item.correct,
        explanation: item.explanation
    });

    // Registra comunque nei mistakes per visualizzazione riassunto, ma taggato come risposta aperta
    window.studyResults.mistakes.push({
        q: item.q,
        userAnswer: userAnswer,
        correctAnswer: item.correct,
        explanation: item.explanation,
        isOpen: true
    });

    window.safeCreateIcons();
};

window.nextStudyItem = function (flashcardFeedback = null) {
    if (flashcardFeedback) {
        if (flashcardFeedback === 'easy') {
            window.studyResults.correct++;
        } else {
            const item = window.activeStudySessionItems[window.currentStudyItemIndex];
            window.studyResults.mistakes.push({
                q: item.front,
                correctAnswer: item.back,
                feedback: flashcardFeedback
            });
        }
    }

    window.currentStudyItemIndex++;
    if (window.currentStudyItemIndex < window.activeStudySessionItems.length) {
        window.renderCurrentStudyItem();
    } else {
        window.showStudySummary();
    }
};

window.addStudyScore = function () {
    try {
        if (!window.studyResults) return;

        const score = {
            title: window.activeStudySetTitle || (appState.db && appState.db.name) || "Set di Studio",
            correct: window.studyResults.correct,
            total: window.studyResults.total,
            type: window.studyResults.type || "Quiz",
            date: new Date().toISOString()
        };

        let scores = [];
        try {
            const raw = localStorage.getItem('mappai_study_scores');
            if (raw) scores = JSON.parse(raw);
        } catch (e) {
            console.error("Error reading study scores", e);
        }

        if (!Array.isArray(scores)) scores = [];

        // Add to the beginning (newest first)
        scores.unshift(score);

        // Keep at most 10
        if (scores.length > 10) {
            scores = scores.slice(0, 10);
        }

        localStorage.setItem('mappai_study_scores', JSON.stringify(scores));
        window.updateStudyScoresDisplay();
    } catch (err) {
        console.error("Error saving score to history", err);
    }
};

window.updateStudyScoresDisplay = function () {
    try {
        const container = document.getElementById('study-scores-container');
        if (!container) return;

        let scores = [];
        try {
            const raw = localStorage.getItem('mappai_study_scores');
            if (raw) scores = JSON.parse(raw);
        } catch (e) { }

        if (!Array.isArray(scores) || scores.length === 0) {
            container.innerHTML = `
                <p class="text-[14px] text-slate-400 italic" id="empty-scores-hint">Nessun punteggio registrato. Completa un quiz per iniziare!</p>
            `;
            return;
        }

        container.innerHTML = '';
        scores.forEach(s => {
            const dateStr = new Date(s.date).toLocaleDateString('it-IT', {
                day: '2-digit',
                month: '2-digit',
                hour: '2-digit',
                minute: '2-digit'
            });
            const percent = s.total > 0 ? Math.round((s.correct / s.total) * 100) : 0;

            // Color based on performance
            let bgClass = "bg-rose-50 border-rose-100 text-rose-700";
            let progressColor = "bg-rose-500";
            if (percent >= 80) {
                bgClass = "bg-emerald-50 border-emerald-100 text-emerald-700";
                progressColor = "bg-emerald-500";
            } else if (percent >= 50) {
                bgClass = "bg-amber-50 border-amber-100 text-amber-700";
                progressColor = "bg-amber-500";
            }

            const div = document.createElement('div');
            div.className = `p-2.5 rounded-lg border text-xs flex flex-col gap-1.5 bg-white shadow-sm`;
            div.innerHTML = `
                <div class="flex justify-between items-start">
                    <div class="font-bold text-slate-800 truncate max-w-[140px]" title="${s.title}">${s.title}</div>
                    <span class="px-1.5 py-0.5 rounded text-[9px] font-bold ${bgClass}">${s.correct}/${s.total} (${percent}%)</span>
                </div>
                <div class="w-full bg-slate-100 h-1 rounded-full overflow-hidden">
                    <div class="h-full ${progressColor}" style="width: ${percent}%"></div>
                </div>
                <div class="flex justify-between items-center text-[9px] text-slate-400">
                    <span>${s.type}</span>
                    <span>${dateStr}</span>
                </div>
            `;
            container.appendChild(div);
        });

        // Add a "Cancella storico" button at the end
        const clearDiv = document.createElement('div');
        clearDiv.className = "pt-2 flex justify-end";
        clearDiv.innerHTML = `
            <button onclick="window.clearStudyScores()" class="text-[9px] text-slate-400 hover:text-slate-600 flex items-center gap-1 font-semibold transition">
                <i data-lucide="trash-2" class="w-3 h-3"></i> Cancella Storico
            </button>
        `;
        container.appendChild(clearDiv);

        if (window.safeCreateIcons) window.safeCreateIcons();
    } catch (err) {
        console.error("Error displaying study scores", err);
    }
};

window.clearStudyScores = function () {
    if (confirm("Sei sicuro di voler cancellare tutto lo storico dei punteggi?")) {
        try {
            localStorage.removeItem('mappai_study_scores');
            window.updateStudyScoresDisplay();
            window.showToast(window.t('tst_history_cleared', "Storico cancellato"), "info");
        } catch (e) {
            console.error("Error clearing scores", e);
        }
    }
};

window.autoSaveOpenQuizResponses = async function () {
    if (!window.studyResults || !window.studyResults.openAnswers || window.studyResults.openAnswers.length === 0) return;

    const nickname = appState.userProfile.nickname || "Studente Anonimo";
    const age = appState.userProfile.age || "-";
    const grade = appState.userProfile.grade || "-";
    const system = appState.userProfile.system || "-";
    const title = window.activeStudySetTitle || "Quiz Aperto";

    let txt = `=== RISPOSTE QUIZ APERTO: ${title} ===\n`;
    txt += `Data: ${new Date().toLocaleString()}\n`;
    txt += `Studente: ${nickname} (Età: ${age}, Classe: ${grade}, Sistema: ${system})\n`;
    txt += `--------------------------------------------------\n\n`;

    window.studyResults.openAnswers.forEach((ans, idx) => {
        txt += `[Tutor]: Domanda ${idx + 1}: ${ans.q}\n`;
        txt += `[Studente]: ${ans.userAnswer}\n`;
        txt += `Risposta di riferimento: ${ans.correctAnswer}\n`;
        if (ans.explanation) txt += `Spiegazione: ${ans.explanation}\n`;
        txt += `\n`;
    });

    txt += `--------------------------------------------------\n`;
    txt += `Fine della sessione di quiz aperto.\n`;

    try {
        if (window.electronAPI && window.electronAPI.saveQuizTextResponse) {
            await window.electronAPI.saveQuizTextResponse({
                title: title,
                textContent: txt,
                vaultPath: appState.activeVaultPath
            });
            window.showToast(window.t('tst_answers_saved', "Risposte salvate con successo nel tuo Vault!"), "success");
        }
    } catch (e) {
        console.error("Errore durante il salvataggio automatico delle risposte del quiz aperto:", e);
    }
};

// Il quiz/flashcard configurato era l'unica attività INVISIBILE a padronanza e
// meta-analisi (scriveva solo i 10 score in localStorage): ora passa dal bus come
// tutte le altre. Attribuzione: nodo/ramo target esplicito → label dal titolo del
// set → nodo radice. Su KG senza radice e senza target si rinuncia (meglio nessun
// dato che un pinpoint fantasma).
window.recordStudySessionOnBus = function () {
    try {
        if (!window.MappAIStudyBus || !window.studyResults || !window.studyResults.total) return;
        const cl = window.cleanLabel || (s => String(s || '').trim());
        let node = (window.studyConfig && window.studyConfig.target) ? window.studyConfig.target : null;
        if (!node) {
            const title = String(window.activeStudySetTitle || '');
            const m = title.match(/^(?:Nodo|Hub|Ramo):\s*(.+)$/);
            if (m) {
                const label = m[1].trim().toLowerCase();
                node = (appState.db.nodes || []).find(n => cl(n.label).toLowerCase() === label) || null;
            }
        }
        if (!node) node = (appState.db.nodes || []).find(n => n.level === 0) || null;
        if (!node) return;
        const score = window.studyResults.correct / window.studyResults.total;
        let rate;
        if (window.studyConfig && window.studyConfig.timer && window.studySeconds > 0) {
            rate = window.studyResults.correct / Math.max(window.studySeconds / 60, 2 / 60);
        }
        const activity = window.studyResults.mode === 'flashcard' ? 'flashcard-set' : 'quiz-set';
        const modeTitle = (window.studyResults.mode === 'flashcard' ? 'Flashcard' : 'Quiz') +
            ' — ' + (window.activeStudySetTitle || 'sessione');
        window.MappAIStudyBus.begin(activity, modeTitle);
        window.MappAIStudyBus.record(node.id, cl(node.label), activity, { score: score, rate: rate });
        window.MappAIStudyBus.end();
    } catch (e) { console.warn('[StudySession] bus record', e); }
};

window.showStudySummary = function () {
    if (window.studyTimerInterval) clearInterval(window.studyTimerInterval);

    // Salva il punteggio nello storico
    window.addStudyScore();

    // Padronanza + sessioni.jsonl via bus (meta-analisi docente)
    window.recordStudySessionOnBus();

    // Se ci sono risposte aperte, salvale automaticamente come file di chat .txt nel Vault
    if (window.studyResults && window.studyResults.openAnswers && window.studyResults.openAnswers.length > 0) {
        window.autoSaveOpenQuizResponses();
    }

    document.getElementById('study-flashcard-view').classList.add('hidden');
    document.getElementById('study-quiz-view').classList.add('hidden');
    document.getElementById('study-summary-view').classList.remove('hidden');
    document.getElementById('study-summary-view').classList.add('flex');

    const statsText = `Hai completato la sessione! Score: <b class="text-indigo-600">${window.studyResults.correct} / ${window.studyResults.total}</b>`;
    document.getElementById('study-summary-stats').innerHTML = statsText;

    const m = Math.floor(window.studySeconds / 60);
    const s = window.studySeconds % 60;
    document.getElementById('study-summary-time').innerText = `Tempo: ${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;

    const mistakesContainer = document.getElementById('study-summary-mistakes');
    mistakesContainer.innerHTML = '';

    if (window.studyResults.mistakes.length === 0) {
        mistakesContainer.innerHTML = '<p class="text-sm text-emerald-600 font-bold text-center py-4">Ottimo lavoro! Nessun errore rilevato. 🎉</p>';
    } else {
        window.studyResults.mistakes.forEach(m => {
            const div = document.createElement('div');
            div.className = "p-3 bg-white border border-slate-200 rounded-xl shadow-sm";
            div.innerHTML = `
                <p class="text-xs font-black text-slate-800 mb-1">${m.q}</p>
                <p class="text-[10px] text-red-500 mb-2"><b>Risposta Corretta:</b> ${m.correctAnswer}</p>
                ${m.explanation ? `<p class="text-[9px] text-slate-500 italic bg-slate-50 p-2 rounded border border-slate-100">${m.explanation}</p>` : ''}
            `;
            mistakesContainer.appendChild(div);
        });
    }
    window.safeCreateIcons();
};

window.saveStudyReport = async function () {
    const apiKey = window.getSystemKey();
    if (!appState.activeVaultPath) {
        window.showToast(window.t('tst_no_vault', "Nessun Vault attivo. Collega o crea un Vault per salvare."), "warning");
        return;
    }

    window.showLoadingOverlay(true, window.t('lo_report_save', "Salvataggio report nel Vault..."));

    const m = Math.floor(window.studySeconds / 60);
    const s = window.studySeconds % 60;
    const timeStr = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;

    let reportText = `# Report Sessione di Studio\n`;
    reportText += `Data: ${new Date().toLocaleString()}\n`;
    reportText += `Modalità: ${window.studyResults.mode}\n`;
    reportText += `Tipo: ${window.studyResults.type}\n`;
    reportText += `Score: ${window.studyResults.correct} / ${window.studyResults.total}\n`;
    reportText += `Tempo Impiegato: ${timeStr}\n\n`;
    reportText += `## Analisi Errori / Ripasso\n\n`;

    if (window.studyResults.mistakes.length === 0) {
        reportText += "Nessun errore! Eccellente preparazione.\n";
    } else {
        window.studyResults.mistakes.forEach((m, idx) => {
            reportText += `### Errore ${idx + 1}\n`;
            reportText += `**Domanda:** ${m.q}\n`;
            reportText += `**Risposta Corretta:** ${m.correctAnswer}\n`;
            if (m.explanation) reportText += `**Spiegazione:** ${m.explanation}\n`;
            reportText += `\n---\n\n`;
        });
    }

    try {
        const projectName = appState.db.rootNodeLabel || "Progetto_Senza_Nome";
        const res = await window.electronAPI.saveChatTranscript({
            projectName: projectName,
            targetName: `Report_Studio_${window.studyResults.mode}`,
            textContent: reportText,
            vaultPath: appState.activeVaultPath,
            subFolder: 'Quiz e Flashcard'
        });

        if (res.success) {
            window.showToast(window.t('tst_report_saved', "Report salvato con successo nel Vault!"), "success");
        } else {
            throw new Error(res.error);
        }
    } catch (err) {
        window.showAlert("Errore Salvataggio", err.message);
    } finally {
        window.showLoadingOverlay(false);
    }
};
