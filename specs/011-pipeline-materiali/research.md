# Research: Pipeline «Genera materiali»

**Date**: 2026-07-20 · **Fonte**: ricognizione multi-agente sul codice (7 agenti Explore, riferimenti file:riga verificati) + decisioni utente D1–D5 (20/7/26). Nessun NEEDS CLARIFICATION residuo.

## R1 — Salvataggio vault automatico (step A)

**Decision**: usare la primitiva IPC `save-vault` (main.js:932, `{folderPath, mapData}`) direttamente, con `folderPath` derivato dalla pipeline: `mapsBaseDir()/<cartellaClasse>/<nomeVault>`. NON passare da `saveMapVault()` (mappai-vault-io.js), che è accoppiata al dialog `pick-folder`.

**Rationale**: `save-vault` è già automatica (mkdir recursive, nessun dialog), sincronizza in place e preserva le cartelle non riscritte (`Allegati/`, `Materiale Studio/`). L'assemblaggio di `mapData` va replicato dalla logica di `saveMapVault` (extractionMode, rootNodeLabel, nodes, links, studySets, ecc.) in una funzione riusabile — unico punto di attenzione.

**Alternatives considered**: (a) riusare `saveMapVault` intera → scartata: apre il dialog nativo; (b) nuovo handler IPC dedicato → scartata: duplicherebbe `save-vault` già completo.

## R2 — Dove scrivere i materiali

**Decision**: `<vault>/Materiale Studio/` con nomi parlanti (`Quiz-MC-<ramo>[-VERDE].pdf`, `Foglio-nodi-<modo>.pdf`, `Sintesi[-VERDE].html`, `Sintesi-audio.mp3`) + manifest `<vault>/pipeline.json`. Scrittura via IPC esistente `save-pdf-to-vault` (base64→file, main.js:777) e un NUOVO IPC generico `save-vault-file` per HTML/MP3/JSON (stessa forma, con sanitizzazione del percorso relativo).

**Rationale**: l'handler `save-vault` preserva già le cartelle non-`.md` → `Materiale Studio/` sopravvive ai salvataggi successivi della mappa (verificato: orphan-cleanup tocca solo `Nodi/*.md`). `save-pdf-to-vault` esiste ma accetta solo un fileName piatto e non sanitizza: il nuovo `save-vault-file` copre sottocartella + sanitizzazione (fix del rischio path-traversal rilevato).

**Alternatives considered**: archivio localStorage `mappai_saved_documents` → SCARTATO come fonte di verità: cap 30 voci + quota-guard che scarta i vecchi; PDF+MP3 lo saturerebbero (un solo audio ≈ 5–8 MB supera la quota tipica di localStorage).

## R3 — PDF dei quiz senza interazione (D4)

**Decision**: refactor di `mappai-quiz-print.js` in builder puri (`buildQuizSetHtml(set)` → stringa; le funzioni `printQuizSet`/`printFlashcardSet` diventano consumer che fanno `window.open` sulla stringa) + NUOVO handler IPC `html-to-pdf` nel main che carica l'HTML in una finestra offscreen e usa `webContents.printToPDF` → base64 → `save-vault-file`.

**Rationale**: la ricognizione conferma che oggi il quiz-print NON produce PDF (window.open + `window.print()`, dialog OS, non headless) e che `printToPDF` non è mai usato nel repo — va aggiunto. Riusare l'HTML esistente = zero re-impaginazione, stessa qualità visiva della stampa manuale.

**Alternatives considered**: (a) jsPDF per i quiz → scartata: re-impaginare da zero ciò che l'HTML fa già bene; (b) chiedere al docente di stampare a mano ogni set → scartata: contraddice il requisito «tutto già salvato».

## R4 — Fogli nodi headless (step C)

**Decision**: rifattorizzare `printAllNodeLabels` in `printAllNodeLabels(opts)`: le 6 opzioni oggi lette dal DOM (`nl-depth`, `nl-fmt`, `nl-layout`, `nl-bg`, `nl-tune-toggle`, `nl-causal-toggle`) diventano campi di `opts` con il DOM come fallback (chiamata dal modale = comportamento invariato). Output: oltre a `doc.save()` (download) esporre il PDF come `doc.output('datauristring')` → base64 per il salvataggio su disco quando `opts.toDisk` è attivo. «Tutti i set» = un PDF per ogni modo selezionato (title/keywords/summary/card ± catena).

**Rationale**: ricognizione: accoppiamento DOM «molto alto» ma le letture sono 6 e concentrate in testa alla funzione — refactor meccanico a basso rischio; `doc.output('datauristring')` già usato per l'archivio (quindi il percorso base64 esiste). Vincolo esistente da rispettare: fmt `3x4` forza layout `title`.

**Alternatives considered**: duplicare la funzione in variante headless → scartata: due copie destinate a divergere (anti-pattern già evitato nel repo, cfr. promptLines della catena).

## R5 — Sintesi + voce headless (step D)

**Decision**: esporre dall'IIFE di `mappai-branch-synthesis.js` un namespace `window.MappAISynthesis` con: `runWholeMap({apiKey, tuned})` (wrapper di `_generateWholeMapSynthesis` con overlay/modale opzionali via `opts.silent`), `buildHtml(data)` (= `_buildSynthesisPrintHtml`), `generateAudio(data)` (= catena `_generateSynthesisAudioWithCues` → `_encodeAudio`, MP3 con lamejs, WAV solo fallback). La pipeline salva HTML + MP3 su disco; il modale risultato NON si apre in modalità pipeline.

**Rationale**: ricognizione: `_synthesizeOnce` è GIÀ pura (zero DOM) e `_generateWholeMapSynthesis` legge solo `appState` — le dipendenze UI sono 2 (overlay + modale finale), gestibili con un flag `silent`. La voce richiede `electronAPI.generateGemini` + chiave `gemini_api_key` (Google-only, bypassa `fetchModelAPI`): il pre-flight del modale la verifica PRIMA di avviare (FR-006). MP3 ≈ 0,5 MB/min vs WAV ≈ 2,9 MB/min → MP3 su disco.

**Alternatives considered**: sintesi per-ramo in pipeline → SCARTATA da decisione D5 (resta manuale); TTS via provider attivo → impossibile: Infomaniak non ha TTS, lo status quo è già Google-only.

## R6 — Quiz per ramo (step B)

**Decision**: riusare `generateDynamicQuiz` (già headless: `{nodeLabel, material, quizType, quantity, angle, apiKey}`) iterando i rami L1 (MindMap) o gli hub (KG), come già fa `generateQuizViaStudy` di MappAI Live. Ogni tipo selezionato (V/F, MC, flashcard) genera set separati; i set entrano ANCHE in `appState.db.studySets` (riusabili in app/Live) e il vault viene risalvato dopo lo step (i set persistono nel vault via `mapData.studySets`).

**Rationale**: motore unico già condiviso in-app/Live (parità di qualità garantita per costruzione); `QUIZ_ANGLES` appena implementato copre «tutti o uno specifico». Flashcard = `FLASHCARD_GENERATOR` esistente, stesso pattern.

**Alternatives considered**: nuovo generatore batch dedicato → scartato: duplicazione del motore appena unificato.

## R7 — Validazione step senza eccezioni (crash-safety)

**Decision**: la pipeline non si fida MAI dell'assenza di errori: ogni step ha un validatore puro in `mappai-pipeline-core.js` — step A: `nodes.length ≥ soglia` (default 5) e presenza L0/L1; step B: `items.length > 0` per set; step C: base64 non vuoto; step D: `rawText` non vuoto (audio opzionale). Step sotto soglia = `failed` nel manifest, con messaggio.

**Rationale**: ricognizione: gli estrattori assorbono TUTTE le eccezioni (`showAlert` + return, sub-step con solo `console.warn`) → `startGeneration` non rigetta mai; lo stato parziale resta in `appState.db`. Anche la risoluzione della Promise NON garantisce il render (setTimeout 200ms non atteso) — irrilevante per la pipeline, che consuma i DATI, ma documentato.

**Alternatives considered**: refactor degli estrattori per propagare errori → scartato in questa feature: tocca il cuore della generazione con rischio regressioni; la validazione dati è sufficiente e additiva.

## R8 — Cartelle di classe + scoperta vault (D1, D2, FR-019)

**Decision**: nome cartella = `safeName('<nickSede>-<classe>')` se la classe ha `sede`, altrimenti `classFolder(classe)` (helper esistente, fallback 'Senza classe'). Nuovo helper puro `mapClassFolder(sede, className)` in files-core. Collisione vault: riuso del pattern `sessionSeq` (suffisso ` · NN`). `get-all-vaults` esteso: primo livello → cartella con `index.yaml` = vault (com'è oggi); cartella SENZA `index.yaml` = contenitore classe → scandire il SUO primo livello per vault. Un solo livello di annidamento, mai ricorsione profonda.

**Rationale**: ricognizione: `get-all-vaults` è flat (readdirSync singolo, filtro `index.yaml`) → i vault annidati sparirebbero da «Riprendi»/progetti (i progetti referenziano il vault per NOME risolto via questa lista). La regola `index.yaml` distingue già oggi vault da non-vault: estenderla di un livello è retrocompatibile per costruzione (i flat restano al primo livello). `folderName` deve restare il basename del vault (unicità garantita dal suffisso progressivo).

**Alternatives considered**: (a) migrare i vault esistenti nelle cartelle classe → SCARTATO (decisione utente: zero migrazione, zero rischio Obsidian); (b) metadato classe dentro index.yaml invece delle cartelle → scartato: l'utente vuole la struttura di cartelle visibile nel Finder.

## R9 — Campo sede sulla classe (D1)

**Decision**: campo `sede` (stringa, opzionale) sull'oggetto classe; tendina nei DUE form (`renderCreate` + `renderEdit` di mappai-live-classes.js — sono form separati, entrambi da toccare) popolata da `MappAITeacherProfile.sediList()`; campo visibile solo se `sediList().length > 0`.

**Rationale**: ricognizione: l'oggetto classe oggi NON ha sede (campi: id, name, gradeNum, section, grade, system, year, students, register, notes); il commento in teacher-profile.js prevede già questa evoluzione («alimentano il selettore sede del form classi»). Pattern d'aggiunta campo documentato (handler `[data-savenames]` centralizzato).

**Alternatives considered**: dedurre la sede dall'unica del profilo quando è una sola → adottato come DEFAULT della tendina, ma il campo esplicito resta necessario per il caso multi-sede.

## R10 — Selezione mappa in Insegna (D3, Fase 3)

**Decision**: nella tabella «Progetti esistenti» di Insegna (funzione LOCALE `renderProjects()` in mappai-landing-teach.js — NON `renderRecentProjects`), il click sulla riga imposta `MappAITeach._selectedProject` (evidenzia; secondo click deseleziona) e ri-renderizza le 3 sezioni con filtro per mappa; «Riprendi» chiama `loadSavedProject`. Kill-switch `mappai_teach_row_select='0'` = click-apre storico. Filtri: materiali per `mapName`; attività per `r.map`; file condivisi per nuovo metadato `mapName` (i legacy senza metadato appaiono solo senza selezione). I materiali su disco entrano nella sezione Materiali via IPC `vault-materials-list` (merge con l'archivio localStorage esistente).

**Rationale**: ricognizione: nessun concetto di selezione esiste oggi (click = `loadSavedProject`); la tabella Insegna è già una funzione locale separata → il cambio non tocca la tabella di Costruisci. `sharedmatList` non ha collegamento mappa → metadato additivo solo sui nuovi upload.

**Alternatives considered**: filtro con dropdown «mappa» invece del click-selezione → scartato: l'utente ha chiesto esplicitamente il click sulla riga (D3 confermata).

## R11 — Preset e stima (FR-002/006, US3)

**Decision**: store localStorage `mappai_material_presets` (array `{id, name, options}`, cap difensivo 50); `options` = SOLO output (mai la classe); versione schema nel record (`v:1`) con degrado a default per opzioni ignote. Stima chiamate = funzione pura nel core: `rami×tipiQuiz + ceil(nodi tenuti/batch) [keywords] + rami+1 [sintesi map-reduce] + blocchi audio`; mostrata nel footer del modale, ricalcolata a ogni cambio opzione.

**Rationale**: i preset sono piccoli (KB) → localStorage appropriato (a differenza dei materiali); la stima è derivabile dai parametri senza chiamate.

**Alternatives considered**: preset su disco → scartato: nessun beneficio, complessità IPC inutile per dati piccoli.

## R12 — Tracciamento consumi

**Decision**: `MappAIUsage.setContext('pipeline', <sub>)` per step (`map`, `quiz_mc`, `quiz_tf`, `flashcards`, `nodesheet`, `synthesis`, `tts`); la tassonomia `CATS` di `mappai-usage-core.js` acquisisce la categoria `pipeline` con le sottovoci.

**Rationale**: il choke point `fetchModelAPI` traccia già tutto; serve solo la categoria per distinguere i consumi pipeline dai flussi manuali nel dashboard ciambelle.

**Alternatives considered**: riusare le categorie esistenti (map/study/materials) → scartato: il docente non potrebbe vedere quanto gli costa una pipeline intera.
