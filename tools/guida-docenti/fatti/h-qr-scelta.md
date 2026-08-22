# H — Le attività via QR: «Domande a scelta» (fatti letti dal codice, 22/8/2026)

> Stato: **sperimentale**. HANDOFF §0 punto 0 e §5: «Niente di tutto questo è mai girato in
> Electron» — misurato solo nei test puri, in tre banchi (`public/dev/scelta-harness.html`) e in
> revisione avversaria. Acceso di default (`mappai_domande_scelta` ≠ `'0'`,
> `public/js/mappai-scelta.js:31`), ma nell'appendice della guida va detto che non è
> collaudato in classe.

Tutte le righe citate sono verificate con `sed`/`grep` il 22/8/2026 su `main` (HEAD e35db8f).

---

## 1. Etichette ESATTE a schermo

### 1a. Da dove si entra (tre porte)

| Etichetta | Dove | file:riga |
|---|---|---|
| «MappAI Live» (bottone barra mappa, icona `radio`) — tooltip «Attività via QR: quiz live, lavagna collaborativa, materiali scaricabili» | `public/index.html` bottone `onclick="window.openLiveHub()"`, `data-i18n="ui_live_hub"`, `data-i18n-title="tt_live_hub"` | `public/index.html:1469-1470`; testo tooltip IT in `public/traduzioni/it_translations.js:185` (l'attributo `title` statico nell'HTML dice invece «MappAI Live: quiz, lavagna collaborativa e materiali via QR» — lo sovrascrive `changeLanguage`) |
| Hub «MappAI Live» (titolo modale `#live-hub-modal`) — intro «Attività di classe via QR: gli allievi entrano dal telefono sulla rete d'aula.» | `openHubMenu()` | `public/js/mappai-live-teacher.js:100-111` |
| Card «Domande a scelta» — sottotitolo «Gli allievi leggono i richiami della mappa e scelgono a quali rispondere» — fumetto «Nessuna generazione: usa i fogli «Domande aperte» e i set a scelta multipla già nel vault. Il taglio di ogni domanda resta nascosto: alla consegna si scopre quali tipi di richiamo funzionano per ciascuno.» | sesta card `.lh-card` del hub, compare SOLO se `_sceltaOn()` | `mappai-live-teacher.js:109` (card), `:118` (clic → `MappAISceltaAttivita.apriLive()`), `:95-98` (`_sceltaOn`) |
| INSEGNA › vista «Attività LIVE» › sezione «Nuova attività» › azione «Domande a scelta» (icona `list-checks`, non primaria). Intro della sezione: «Gli allievi entrano dal telefono con le loro credenziali: il quiz si corregge da sé, la scrittura col tutor consegna testo e trascrizione.» | console INSEGNA, vista `id:'live'` | `public/js/mappai-landing-teach.js:1869` (voce nav «Attività LIVE»), `:2700-2709` (`_vistaLive`: azioni «Quiz a distanza» · «Rispondi e Domanda» · «Domande a scelta»), `:3146-3151` (dispatch → `apriLive()`) |
| Sidebar «Attività da LIM» (`#sidebar-panel-lim`) › sezione «Attività live» › card «Domande a scelta» con lo stesso sottotitolo | `renderLimSidebarTab()` | `public/js/mappai-collab-teacher.js:414-431` |
| «Studio attivo» (bottone barra mappa, icona `puzzle`, tooltip «Attività di studio, viste e strumenti») → launcher «Studio attivo — scegli un'attività» › sezione «Attività di studio» › card «Domande a scelta» e «Quiz a scelta» (guscio in-app, SENZA QR) | `ActiveStudy.openLauncher()` | `public/index.html:1472-1473`; `public/js/mappai-active-study.js:111-121` (card), `:181-182` (clic → `apriInApp('open'|'mc')`) |

Fumetti delle due card del launcher (`data-tip`, `mappai-active-study.js:115,120`):
- «Leggi i richiami della mappa e scegli a quali rispondere: alla fine scopri quali tipi di richiamo ti accendono.»
- «Come «Domande a scelta», ma si risponde scegliendo fra le opzioni: la correzione è immediata.»

Card spente (grigio, `disabled`, testo del motivo sotto il titolo, `mappai-active-study.js:114,119`):
- «Nessun foglio «Domande aperte» per questa mappa: generali da CREA (box «Più set per angolo») o da ELABORA › «Crea un documento».»
- «Nessun set a scelta multipla per questa mappa: generali da CREA (box «Più set per angolo»).»

### 1b. Il modale di setup (Live) — `apriLive()`, `mappai-scelta.js:110-201`

Modale del motore (`MappAIModal.open`), titolo «Domande a scelta», icona `list-checks`, taglia `m`; **una sola sezione** «Il materiale» (`:185-190`).

| Etichetta | Tipo | Default | file:riga |
|---|---|---|---|
| Riga del preventivo: «{n} domande da {k} fogli. Ogni allievo ne legge una per argomento, per taglio e per genere.» · seguita da « · <nome classe>». Se c'è un genere solo si aggiunge « — solo domande a scelta multipla.» oppure « — solo domande aperte.» | testo sezione | — | `:165-173`, `:189` |
| «Domande aperte (N)» — aiuto «Si scrive la risposta: la corregge il docente.» | radio gruppo `gen`, **selezionata** | sì | `:132-134` |
| «Quiz a scelta (N)» — aiuto «Si sceglie fra le opzioni: la correzione è nel dato.» | radio | no | `:135-137` |
| «Tutt'e due (N+M)» — aiuto «Ogni allievo legge domande di entrambi i generi.» | radio | no | `:138-141` |
| ⚠️ le tre radio compaiono SOLO se il pool ha ENTRAMBI i generi (`if (q.open && q.mc)`) | | | `:131` |
| «Argomenti da scegliere (almeno)» | numero 1-20 | **2** | `:145`; default `CFG_DEFAULT.minimoAree` `mappai-scelta-core.js:68` |
| «Risposte da scrivere (almeno)» | numero 1-30 | **3** | `:146`; `core.js:67` |
| «Alla consegna mostra il profilo dei tagli» | spunta | **ON** | `:147`; `core.js:71` |
| «Campo «Osservazioni» in fondo» | spunta | **ON** | `:148`; `core.js:70` |
| «Chiedi «perché questa no?» su una evitata» | spunta | OFF | `:149`; `core.js:73` |
| «Autovalutazione per risposta» | spunta | OFF | `:150`; `core.js:74` |
| «Secondo giro su una domanda evitata» | spunta | OFF | `:151`; `core.js:75` |
| «Correggi subito (solo scelta multipla)» — aiuto «Dopo ogni risposta l'allievo vede se è giusta, con la spiegazione. La domanda si chiude: una risposta già corretta non si ripensa.» | spunta, **OFF di default**; compare solo se `feedbackDisponibile()` (kill-switch `mappai_quiz_live_feedback` ≠ `'0'`) E il pool ha domande a scelta multipla | OFF | `:153-162`; `:37` |
| «Annulla» (ruolo quieto) · «Avvia con QR» (primario) | bottoni piè | — | `:192-194` |

Toast/avvisi del setup:
- Avviso (modale `MM.avviso`, icona `list-checks`) titolo «Non ci sono ancora domande per questa mappa», testo «Genera i materiali da CREA (box «Più set per angolo») oppure da ELABORA › «Crea un documento».» — `mappai-scelta.js:113-118`.
- Toast warning «Scegli prima una classe: gli allievi entrano con le loro credenziali.» — `:122`.
- Toast warning «Quel genere non ha domande per questa mappa.» — `:198`.
- Toast warning «MappAI Live richiede l'app desktop.» — `:205` (fuori da Electron).
- Toast error «Errore avvio server» (o l'errore del main) — `mappai-live-teacher.js:341`.
- Toast success «Sessione RIPRESA: il QR precedente è ancora valido» — `:346`.

### 1c. La dashboard del docente — `dashBodyHtml()`, `mappai-live-teacher.js:386-404`

| Etichetta | Selettore | file:riga |
|---|---|---|
| Titolo modale «Sessione live» (icona `radio`) | `#live-hub-modal` | `:415` |
| QR 210×210 px (`img#lv-qr`, `cursor:zoom-in`) + sotto gli URL LAN in chiaro + «Clic sul QR per proiettarlo (LIM)» | `#lv-qr` | `:388-393` |
| «QR non disponibile» (se manca la libreria `qrcode`) | — | `:389` |
| «Allievi» + badge fase `#lv-phase` («attesa» · «in corso» · «chiusa») + contatore `#lv-count` «N/M entrati» | | `:395-397`, `:554`, `:568` |
| «In attesa degli allievi…» | `#lv-rosterlist` | `:399` |
| Riga allievo: emoji · numero · nome · stato: «—» (assente) · «N risposte» · «✓ consegnato» · bottone «Sblocca» (title «Sblocca (device staccato)») | `.lv-rel` | `:569-576` |
| Riquadro ambra «Rete: usa l'hotspot del PC o un router d'aula. Le reti scolastiche spesso bloccano il traffico tra dispositivi.» | | `:401` |
| Azioni in fase **attesa**: «Avvia domande» (verde) · «Stacca» · «Ferma server» | `#lv-run`, `#lv-detach`, `#lv-stop` | `:465`, `:486-491` |
| Azioni in fase **in corso**: badge timer «⏱ m:ss» (solo con durata > 0) · «Chiudi sessione» (rosso) · «Stacca» · «Ferma server» | `#lv-timerbadge`, `#lv-close` | `:467-468`, `:556-562` |
| Azioni in fase **chiusa**: «Report domande a scelta» (indaco) · «Apri cartella» · «Chiudi pannello» | `#lv-rep-x0`, `#lv-folder`, `#lv-end` | `:474-484` |
| Conferme native (`confirm()`): «Chiudere la sessione e generare i report?» · «Fermare il server? Le risposte restano su disco.» | | `:508`, `:528` |
| Toast: «Sessione chiusa — report pronti» · «Server fermato — i dati restano nella cartella della sessione» · «La sessione resta ATTIVA. Per riprenderla: «Studio attivo live» nella sidebar.» (quando si chiude il modale con la sessione viva) · «Pannello staccato: la mappa è di nuovo utilizzabile.» | | `:510`, `:532`, `:66`, `:458` |
| Pannello staccato `#lv-float-panel` (in basso a destra, `width:min(420px,92vw)`): testata «Sessione live» + bottoni «–» (title «Riduci») e «×» (title «Riporta al centro») | `.lv-fp-collapse`, `.lv-fp-dock` | `:431-456` |

⚠️ La dashboard ha **una casa per volta**: «Stacca» chiude il modale e apre il pannello; «×» del pannello riapre il modale (`_chiudiFloat`, `:413`, `:424-427`, `:455`). Il bottone «Stacca» compare solo quando la dashboard sta nel modale (`:485-490`). Commit e35db8f.

### 1d. La pagina dell'allievo — `public/live/scelta.html` (+ `mappai-scelta-view.js`)

Login (`#login`, `scelta.html:36-55`): titolo «Domande a scelta» · riga «<classe> · <mappa>» · «Emoji» (griglia 4 colonne, 12 animali) · «Il tuo numero» (placeholder «es. 07», 2 cifre) · bottone «Entra». Login a gruppi (solo se `loginMode==='group'`, mai impostato da questo flusso): «Nome del gruppo» (placeholder «es. I Galli»).
Errori (`#login-err`): «Link non valido. Riscansiona il QR.» · «Sessione non raggiungibile.» · «Connessione assente. Sei sulla rete della classe?» · «Scegli emoji e numero.» · «Scrivi il nome del gruppo.» · «Già in uso su un altro dispositivo.» · «Non sei nell'elenco della classe.» · «Accesso non riuscito.» (`scelta.html:72-77`, `:94-103`). `alert('Consegna non riuscita. Riprova.')` (`:153`).

I tre passi (`mappai-scelta-view.js`, `monta()` `:148`):

**① AREE** — hint «Scegli gli argomenti su cui ti senti più sicuro: leggerai solo le domande di quelli.» (`:239`); contatore «N argomento/argomenti su M · K domande da leggere» (`:246-248`); ogni area col numero di «domande» (`:256`); se la mappa non dichiara i rami: «Questa mappa non dichiara i suoi argomenti: si passa direttamente alle domande.» (`:271`); bottone «Vai alle domande» (`:273`); conferma sotto il minimo: «Hai scelto un argomento solo, ne sono consigliati {m}.» / «Hai scelto {n} argomenti su {m} consigliati.» / «Gli argomenti scelti non hanno domande.» + «Vai avanti lo stesso?» (`:281-284`).

**② LEGGI E SCEGLI** — hint «Leggi ogni domanda e dì che cosa ti fa venire in mente. Poi prendi quelle a cui vuoi rispondere.» (`:295`); contatore «Lette: n/tot · scelte: n su minimo» (`:300-302`); comando «‹ Cambia argomenti» (`:305`); per domanda: «Che cosa ti fa venire in mente?» (`:336`) + i **quattro chip di attivazione** «mi viene in mente subito» · «so da dove partire» · «mi dice qualcosa, ma vago» · «non mi accende niente» (`:129-132`) + campo «…oppure scrivilo con parole tue (facoltativo)» (`:358`) + bottone «Rispondo a questa» / «✓ La rispondo — tocca per lasciarla» (`:380-381`); gruppo «Altre domande» per le domande senza ramo (`:398`); «Comincia a rispondere» (`:406`); «Non hai preso nessuna domanda: non ci sarà niente a cui rispondere.» + «Vai avanti lo stesso?» (`:409-410`); «Gli argomenti scelti non hanno domande: torna indietro e scegline altri.» (`:394`).

**③ RISPONDI** — una domanda alla volta: «Domanda X di Y» (`:434-435`), «Torna alle domande» (`:425,436`), «Domanda precedente» / «Domanda successiva» (`:517,520`); campo «La tua risposta» (textarea, `aria-label`, `:465`) oppure le opzioni come bottoni-radio (`.sc-opt`, `:450-461`); «Leggendola avevi detto:» + chip (`:510`); se «Autovalutazione» acceso: «Quanto ti senti sicuro di questa risposta?» con «sicuro» · «così così» · «ho tirato a indovinare» (`:484-487`); se «Correggi subito» acceso, sotto la domanda il riquadro `role="status"` «Giusto» / «Sbagliato — corretta: …» + spiegazione (`:470-481`) e le opzioni si disabilitano (`:455`); «Osservazioni — perché proprio queste? (facoltativo)» (`:532`); bottone «Consegna» (`:539`); conferma «Hai scritto {n} risposte su {m} chieste.» / «Hai preso {n} domande senza rispondere.» + «Consegni lo stesso?» (`:543-546`).

**ESITO** (`mostraEsito`, `:580-650`): «Consegnato» · «{n} risposte scritte su {tot} domande.» · se reveal: «Le domande che hai scelto avevano questi tagli» con barre per angolo (Definizione · Causa · Conseguenza · Esempio concreto · Confronto · Eccezione / limite · Applicazione / inferenza — etichette da `window.quizAngleLabel`, `public/js/mappai-study-session.js:111-112`; «taglio non dichiarato» / «misto» `scelta-view.js:136-137`) · «Non hai preso nessuna domanda di questo taglio: {a}.» · «Una che non hai preso» · «Perché questa no?» (campo) · «Prova a rispondere anche a questa» (bottone).

Pool vuoto: «Non ci sono ancora domande per questa mappa. Generale con «Genera materiali», poi torna qui.» (`:554`).

### 1e. Il report — `buildSceltaReportHtml`, `public/js/mappai-live-reports.js:314-406`
Titolo «Report domande a scelta»; sezioni: «I tagli — chi li ha evitati del tutto» (barra «evitato da N/M · scelte totali K»), «Le aree — dove la classe non si sente sicura» («scelta da N/M»; se i fogli non hanno il ramo: «I fogli non dichiarano la macro-area.»), una scheda per allievo («consegnato» / «non consegnato» · «aree: …» · «N/M a scelta multipla · K scritte · L lette» oppure «N risposte scritte · L lette»), risposte con segno ✓ ✗ · e «giusta: …», «Richiami che non hanno acceso niente», «Perché questa no», «Osservazioni».

---

## 2. Gesti → che cosa succede

| Gesto | Funzione | Effetto visibile | Su disco / localStorage |
|---|---|---|---|
| Hub Live › card «Domande a scelta» (o INSEGNA › Attività LIVE › «Domande a scelta», o sidebar LIM) | `MappAISceltaAttivita.apriLive()` `mappai-scelta.js:110` | legge i fogli (`leggiFogli` `:52-104`: i fogli «Domande aperte» dall'**archivio** `MappAIStudyDocs` — localStorage `DOCS_KEY`, `public/js/mappai-study-export-core.js:89-101` — filtrati per `mapName === rootNodeLabel` e titolo `/domande.?aperte/i`; i set a scelta multipla da `appState.db.studySets` con `mode==='quiz'` e >2 opzioni); apre il modale §1b | niente |
| «Avvia con QR» | `avvia()` `:203-226` → `MappAILive.launchExternal` → `launch()` `mappai-live-teacher.js:315-352` → IPC `live-start-session` `main.js:2396-2446` | il modale si chiude, si apre la dashboard «Sessione live» col QR; toast «Sessione RIPRESA…» se ha ritrovato una cartella aperta | cartella `Attività di studio/<Classe>/<AAAA-MM-GG · Domande a scelta (o Quiz a scelta) · <Mappa> · NN>/` (`main.js:2405-2408`, `public/js/mappai-files-core.js:237-247`, `:258-267` progressivo NN); dentro: `session.json`, `questions.json` (il pool INTERO con soluzioni e angoli, `live-server.js:163-176`), `students/` (`:91`). In localStorage nessuna scrittura (solo il registro INSEGNA via `MappAITeach.logSession({activity:'scelta'})`, `mappai-live-teacher.js:345`) |
| Il nome dell'attività | `avvia()` `:210-212` | «Domande a scelta» se il genere scelto è aperte o tutt'e due; «Quiz a scelta» se solo scelta multipla | entra nel nome cartella e nel registro |
| Allievo inquadra il QR | `GET /` → 302 su `/public/live/scelta.html?s=<token>` `live-server.js:385-391` | pagina di login | sul telefono `localStorage.mappai_live_device` (id dispositivo, `scelta.html:62-65`) |
| «Entra» | `POST /api/join` `live-server.js:~486-530` | il pool **campionato e ripulito** (`SC.pubblico`: niente angolo, niente soluzioni) + stato + verdetti | `students/<emoji-num>.json` con `poolIds` (`:210-223`) |
| Ogni tocco sul telefono (chip, prendi, risposta, area) | `onCambia` → `POST /api/stato` con lo **stato intero** (debounce 600 ms) `scelta.html:117-127`, `live-server.js:587-641` | pallino di sincronia; se «Correggi subito» e la domanda è MC: torna il `verdetto` | `students/<id>.json` (`stato`, `verdetti`) |
| «Consegna» | `POST /api/finish` `live-server.js:683-716` | schermata «Consegnato» + profilo dei tagli (solo se `reveal`) | `finishedAt` nel file studente |
| Docente «Avvia domande» | `POST /api/phase {running}` `mappai-live-teacher.js:498-502`, `live-server.js:719-731` | badge «in corso»; se durata > 0 parte il timer | `session.json` (`phase`, `runningAt`, `endsAt`) |
| «Chiudi sessione» → conferma | `POST /api/close` → `closeSession()` `live-server.js:314-375` | badge «chiusa», bottone «Report domande a scelta» | `results.json` + `report-scelta.html` nella cartella sessione (`:365-366`) |
| «Report domande a scelta» | `window.open('http://127.0.0.1:<porta>/api/report?admin=…&which=scelta')` `mappai-live-teacher.js:512-515`, `live-server.js:467-476` | il report HTML si apre in una finestra | — (già scritto) |
| «Apri cartella» | IPC `live-open-folder` `main.js:2462-2467` | Finder sulla cartella della sessione | — |
| «Ferma server» / «Chiudi pannello» → conferma | `doStop()` `:526-533` → IPC `live-stop-session` `main.js:2448-2454` | dashboard chiusa, toast «Server fermato…» | nulla viene cancellato |
| «Stacca» | `_staccaDash()` `:428-459` | il modale sparisce, pannello in basso a destra, la mappa torna cliccabile | — |
| Chiudere il modale con la × (o ESC) a sessione viva | `closeModal()` `:61-68` | toast «La sessione resta ATTIVA…»; il server continua | — |
| Riaprire «MappAI Live» con una sessione viva | `openLiveHub()` `:81-92` → `liveSessionInfo` | si salta il hub e si riapre direttamente la dashboard | — |
| Launcher Studio attivo › «Domande a scelta» / «Quiz a scelta» | `apriInApp(tipo)` `mappai-scelta.js:288-406` | modale XL col percorso a tre passi, senza QR né classe; ESC chiede conferma (`sporco:true`) | bozza in localStorage `mappai_scelta_bozza_<open|mc>_<id progetto>` (`:238-251`), cancellata alla consegna (`:361`); la consegna scrive via `MappAIStudyBus` in `Studio Attivo/sessioni.jsonl` e padronanza per nodo (`:379-405`) |

Polling della dashboard: ogni **3 s** su `http://127.0.0.1:<porta>/api/status?admin=<adminToken>` (`mappai-live-teacher.js:536-548`).

---

## 3. Limiti numerici e default

- **Porta del server**: la prima libera fra **8767 e 8777** (`main.js:2426-2429`); ascolta su `0.0.0.0`; gli URL del QR sono `http://<IP LAN IPv4>:<porta>` per ogni interfaccia non interna, altrimenti `http://localhost:<porta>` (`lanUrls`, `main.js:2091-2101`). Il QR usa `urls[0]` (`studentUrl`, `mappai-live-teacher.js:360`).
- **Token**: nel QR `?s=<token>` di **10 caratteri** base64url; `adminToken` di **16** per il docente, «mai nel QR» (`live-server.js:53`, `:157-158`, `:18`).
- **Identità allievo**: 12 emoji × numeri 00-10 = **132 identità** (`mappai-live-core.js:34-49`); login a gruppi non usato in questo flusso (`loginMode` resta `individual`, `live-server.js:138`).
- **Campionamento**: **una domanda per (ramo × angolo × genere)** con seme = identità dello studente (`unaPerAngolo`, `mappai-scelta-core.js:297-321`; server `poolDi`, `live-server.js:210-223`). Scala dichiarata in HANDOFF §3: 5 domande × 7 angoli = 35 per ramo, ~175 su 5 macro-aree → 35 campionate, 14 da leggere con due aree; «Tutt'e due» raddoppia (14 → 28).
- **I 7 angoli** («tagli»): definizione · causa · conseguenza · esempio · confronto · eccezione · applicazione (`public/js/mappai-study-session.js:101-110`).
- **Default del setup** (`CFG_DEFAULT`, `mappai-scelta-core.js:66-76`): minimo risposte **3**, aree minime **2**, soglia per mostrare il passo aree **2** aree con nome, osservazioni ON, reveal ON, perché-no OFF, autovalutazione OFF, secondo giro OFF; numeri normalizzati nell'intervallo 0-50 (`:81-82`); input del modale 1-20 e 1-30.
- **«Correggi subito»**: spunta OFF di default (`mappai-scelta.js:159`), server `feedbackImmediato: cfg.feedbackImmediato === true` (`live-server.js:149`); una risposta già corretta è definitiva — `/api/answer` risponde **409 `already-graded`** (`:667-670`), `/api/stato` rimette le risposte vecchie sopra quelle in arrivo (`:611-616`). Il verdetto è solo sulle MC (`SC.corretta`, `core.js:329-333`).
- **Timer**: `durationMin` passato come `0` da `avvia()` (`mappai-scelta.js:221`, quarto argomento) → **nessun limite di tempo** per questa attività; il campo timer non c'è nel modale.
- **Debounce autosave** sul telefono: 600 ms (`scelta.html:116-117`, `:133`).
- **Nessun costo AI**: l'attività non chiama nessun modello (`mappai-scelta.js:1-18`, card tip «Nessuna generazione»). Il costo sta a monte, nella generazione dei materiali (HANDOFF §3 «Più set per angolo»: stima `B 8` senza angoli · `B 56` con tutti e sette, su 4 rami).
- **Formati letti**: fogli «Domande aperte» solo dall'**archivio HTML** in localStorage (`hasHtml`, `kind==='quizpaper'`) — non dai PDF del vault (`mappai-scelta.js:10-14`); set MC da `set-*.json` del vault già in `appState.db.studySets`; Vero/Falso **esclusi** (`:91-94`).
- **Fase attesa**: il server accetta `/api/stato` anche in fase `lobby` (nessun controllo `not-running` in `/api/stato`, `live-server.js:596-603`, a differenza di `/api/answer` `:653`) — l'allievo può quindi cominciare a leggere prima di «Avvia domande». ⚠️ Dubbio: verificare nell'app vera se la view mostra le domande già in lobby (la pagina non controlla `phase`: `scelta.html:106-110`).

---

## 4. Percorso tipico del docente (storyboard)

1. Aprire la mappa (vault) per cui sono stati generati i fogli «Domande aperte» e/o i set a scelta multipla (CREA › box «Più set per angolo», HANDOFF §3 `:352-366`). Verifica: INSEGNA › Materiali elenca `Domande-aperte-<Mappa>-definizione.pdf` … (HANDOFF §5 `:2076-2078`).
2. Avere una **classe attiva** (sidebar LIM › «Classe attiva», `mappai-collab-teacher.js:437`); altrimenti toast «Scegli prima una classe…».
3. Clic sul bottone **«MappAI Live»** nella barra della mappa (`index.html:1469`) → modale «MappAI Live» con le 6 card.
4. Clic sulla card **«Domande a scelta»** (sesta) → modale «Domande a scelta» / «Il materiale»: riga «N domande da K fogli…», radio del genere (se i generi sono due), i due numeri, le cinque spunte, eventuale «Correggi subito (solo scelta multipla)».
5. Clic **«Avvia con QR»** → modale «Sessione live»: QR, URL LAN, «Allievi» con badge «attesa», riquadro ambra sulla rete, bottoni «Avvia domande» · «Stacca» · «Ferma server».
6. (Facoltativo) clic sul QR → QR a tutto schermo per la LIM (`openQrFull`, `mappai-live-teacher.js:361`).
7. Gli allievi inquadrano il QR sulla **stessa Wi-Fi** → `scelta.html`: scelgono emoji + numero → «Entra». In dashboard la riga passa da «—» a «0 risposte», contatore «N/M entrati».
8. Clic **«Avvia domande»** → badge «in corso». (⚠️ vedi §3 ultimo punto: la lettura potrebbe essere già possibile prima.)
9. Clic **«Stacca»** → il modale sparisce, pannello fluttuante in basso a destra, toast «Pannello staccato: la mappa è di nuovo utilizzabile.»; «–» riduce, «×» riporta al centro.
10. Sul telefono: ① aree → ② lettura con i quattro chip e «Rispondo a questa» → ③ una domanda alla volta → «Consegna» → «Consegnato» con il profilo dei tagli. In dashboard: «✓ consegnato».
11. Clic **«Chiudi sessione»** → conferma «Chiudere la sessione e generare i report?» → badge «chiusa», bottoni «Report domande a scelta» · «Apri cartella» · «Chiudi pannello»; toast «Sessione chiusa — report pronti».
12. Clic **«Report domande a scelta»** → si apre `report-scelta.html`; «Apri cartella» → Finder su `Attività di studio/<Classe>/<data · attività · mappa · NN>/`. La sessione compare poi in INSEGNA › Attività LIVE › «Attività già svolte» (colonne Attività · Mappa · Classe · Materia · Data · Partecipanti · icona cartella «Apri nel Finder», `mappai-landing-teach.js:2713-2742`; il registro legge i `session.json` su disco, `main.js:3381-3416`).

---

## 5. Prerequisiti e stati

- **App desktop (Electron)**: fuori da Electron → toast «MappAI Live richiede l'app desktop.» (`mappai-scelta.js:205`, `mappai-live-teacher.js:317`).
- **Una mappa aperta**: senza nodi, «MappAI Live» dà toast «Apri una mappa per usare MappAI Live.» (`mappai-live-teacher.js:82-85`); «Studio attivo» dà «Apri una mappa per usare lo studio attivo» (`mappai-active-study.js:93`).
- **Materiali già generati** per QUESTA mappa (`mapName` uguale a `rootNodeLabel`, `mappai-scelta.js:44-49`): senza, avviso «Non ci sono ancora domande per questa mappa» con la strada; nel launcher le card sono spente col motivo.
- **Classe attiva** con allievi (roster emoji+numero): senza, toast «Scegli prima una classe…». Gli allievi non in elenco vedono «Non sei nell'elenco della classe.» (`scelta.html:97`).
- **Rete**: telefoni e PC sulla stessa rete locale; l'app stessa avverte «Rete: usa l'hotspot del PC o un router d'aula. Le reti scolastiche spesso bloccano il traffico tra dispositivi.» Nessuna chiave AI e nessun provider necessari per la sessione.
- **Kill-switch** (HANDOFF §2 `:305-306`): `mappai_domande_scelta='0'` toglie la card dal hub, la voce da INSEGNA (⚠️ vedi §8) e le due card dal launcher; `mappai_quiz_live_feedback='0'` toglie la spunta «Correggi subito». Entrambi accesi di default.
- **Sessione già in corso**: riaprendo «MappAI Live» si torna alla dashboard; alla riapertura dell'app, `live-start-session` **riprende** l'ultima cartella non chiusa della stessa classe/mappa/giorno con lo stesso token e QR (`progressiveSessionDir`, `main.js:2379-2393`, `:2405-2408`; `live-server.js:105-126`), toast «Sessione RIPRESA…». Una sessione «a scelta» senza `questions.json` non riparte: `throw 'sessione «a scelta» irrecuperabile…'` (`live-server.js:112-114`).
- **Rientro dell'allievo**: stesso telefono (stesso `deviceId`) → ritrova le SUE domande (`poolIds` persistiti) e il punto dov'era (`fase` nello stato); altro telefono con la stessa identità → «Già in uso su un altro dispositivo.» finché il docente non preme «Sblocca».

---

## 6. NON ESISTE

- **Modalità Internet (relay)**: il selettore «WiFi aula / Internet» (`public/js/mappai-net-mode.js:55-56`) NON compare nel modale di «Domande a scelta» (`apriLive` non lo rende; `launch()` legge solo il valore salvato in localStorage, `mappai-live-teacher.js:339`). E anche dove compare non funziona: `docs/relay-deployment-plan.md:3-5,33-41` — stato «IN ARCHIVIO», `live.insegnai.ch` non esiste in DNS; con `netMode:'web'` il main ripiega sulla LAN con toast «Relay non raggiungibile: sessione avviata in modalità WiFi aula» (`main.js:2119-2136`, `mappai-net-mode.js:82-85`). Nella guida: **solo stessa Wi-Fi**.
- **Timer / durata**: non c'è un campo durata per questa attività (`avvia()` passa `0`).
- **Login a gruppi, indizi, «Salta»**: appartengono al quiz classico (`student.html`) e alla Timeline, non a `scelta.html`.
- **«Correggi subito» nel quiz classico «Studio attivo live»**: nessun setup lo imposta — `feedbackImmediato` è scritto solo da `mappai-scelta.js:224` (grep su `public/js/*.js` e `main.js`); il codice di verdetto in `public/live/student.html:93-100, 478+` e in `/api/answer` non ha quindi un interruttore raggiungibile dal docente. ⚠️ Dubbio, vedi §8.
- **Report «Report domande» / «Report allievi»** (heatmap + schede): solo per il quiz classico; in modalità scelta esiste il solo «Report domande a scelta» (`live-server.js:314-366`, `mappai-live-teacher.js:474-478`).
- **Correzione automatica delle domande aperte**: non esiste — il report mostra il testo scritto con segno «·», e «la corregge il docente» (`mappai-live-reports.js:370-372`, `mappai-scelta.js:134`).
- **Il Palazzo della Memoria nel guscio in-app**: non portato (HANDOFF §3 `:466-467`).
- **Le sette modalità storiche di Studio attivo e il Cloze**: cancellate (HANDOFF §0 punto 0, `mappai-active-study.js` = solo launcher, 191 righe). I bottoni flottanti storici solo con `mappai_legacy_float_btns='1'`.
- **Menu «Riprendi» esplicito per una sessione Live**: esiste solo per la Lavagna (`main.js:2223-2229`, `:2298`); per Live la ripresa è automatica (ultima cartella non chiusa) oppure tramite il hub che rileva la sessione viva.
- **Una «Domande a scelta» senza classe**: via QR no (serve il roster); senza classe c'è solo il guscio in-app dal launcher.
- **Lavagna e Tutor** (fuori dalla guida): «Lavagna collaborativa — I gruppi propongono nodi dal telefono, live sulla mappa» (`mappai-live-teacher.js:105`); «Chatta e Scrivi (Tutor AI) — Ogni allievo chatta col tutor sull'argomento e consegna un testo suo» (`:107`; in INSEGNA si chiama «Rispondi e Domanda», `mappai-landing-teach.js:2705`).

---

## 7. Parole da NON usare con i docenti

| Nel codice / nei documenti | Nella guida |
|---|---|
| vault | la cartella della mappa (in `Mappe/`) |
| hub Live / `openLiveHub` | la finestra «MappAI Live» |
| console INSEGNA / vista `live` | la sezione INSEGNA › «Attività LIVE» |
| launcher di Studio attivo | la finestra «Studio attivo» |
| guscio in-app | la versione senza QR, da soli sul computer |
| pool / pool campionato | l'insieme delle domande / le domande che toccano a ciascun allievo |
| campionamento `unaPerAngolo` | «ogni allievo riceve una domanda per argomento e per tipo di richiamo» |
| angolo / taglio | il tipo di richiamo (definizione, causa, conseguenza, esempio, confronto, eccezione, applicazione) — a schermo l'allievo legge «taglio» solo alla fine |
| ramo / macro-area / L1 | l'argomento (le grandi voci della mappa) |
| chip di attivazione | i quattro bottoni «che cosa ti fa venire in mente?» |
| `letture` / `risposte` (i due registri dello stato) | ciò che ha acceso leggendo · ciò che ha risposto |
| reveal / profilo | il riepilogo dei tipi di richiamo alla consegna |
| token, adminToken | il codice nel QR / (non nominare) |
| porta 8767 | (non nominare; dire «l'indirizzo sotto il QR») |
| LAN, IPv4, hotspot | la rete Wi-Fi dell'aula / la connessione condivisa dal PC |
| relay, variante WEB, modalità Internet | «da fuori scuola: non disponibile» |
| kill-switch, flag, localStorage | un interruttore nascosto (non nominare nella guida) |
| `session.json`, `students/*.json`, `results.json` | i file della sessione (non aprirli a mano) |
| report-scelta.html | il «Report domande a scelta» |
| dashboard (che si stacca) | la finestra «Sessione live» / il pannello in basso a destra |
| polling | (non nominare: «si aggiorna da sola») |
| fase lobby/running/closed | «attesa» · «in corso» · «chiusa» (sono già le parole a schermo) |
| quizpaper / archivio `MappAIStudyDocs` | i fogli «Domande aperte» salvati dall'app |
| set MC / `studySets` | i quiz a scelta multipla della mappa |
| Electron / IPC / main process | «l'app sul computer» |
| KG / MindMap | la mappa |
| bento / box «Più set per angolo» | il riquadro «Più set per angolo» nella schermata CREA |
| MappAIStudyBus / sessioni.jsonl / padronanza | il registro personale dello studio (versione senza QR) |

---

## 8. Dubbi

1. **«session.json senza token»**: il brief lo dava per fatto, ma `persist()` scrive l'oggetto `session` INTERO, che contiene `token` e `adminToken` (`live-server.js:157-158`, `:179-185`). Non ho trovato nessuna riga che li tolga prima della scrittura. Per la guida: il file sta sul computer del docente e non va condiviso; non scrivere che è «senza token».
2. **INSEGNA › «Domande a scelta» e il kill-switch**: HANDOFF §2 dice che `mappai_domande_scelta='0'` toglie anche la voce da INSEGNA; in `_vistaLive` (`mappai-landing-teach.js:2706`) l'azione è aggiunta senza controllare `attiva()` — il clic finirebbe in `apriLive()`, che non controlla il flag. Da verificare nell'app.
3. **Lettura in fase «attesa»**: `/api/stato` non rifiuta in `lobby` e `scelta.html` non guarda `phase`; è possibile che l'allievo lavori già prima di «Avvia domande». Non verificato nell'app vera.
4. **«Correggi subito» sul quiz classico**: il server e `student.html` lo supportano, ma nessun modale del quiz classico espone la spunta. Probabile che la pipeline di `student.html` sia raggiungibile solo in test; da confermare.
5. **Mai girato in Electron** (HANDOFF §0 punto 0, §5 `:2023-2061`): ogni etichetta qui sopra è letta dal codice, non vista su uno schermo; gli screenshot potrebbero scoprire differenze di impaginazione (es. la riga del preventivo, le radio del genere).
6. **Il nome della cartella** — risolto: `activityLabel` (`mappai-files-core.js:221-233`) rimappa solo le chiavi note (`quiz`, `tutor`, `lavagna`, `live`→«Studio attivo»…); «Domande a scelta» e «Quiz a scelta» non sono in `ACT` e passano così come sono (prima lettera maiuscola). Cartella attesa: `Attività di studio/<Classe>/AAAA-MM-GG · Domande a scelta · <Mappa> · NN/`. Vale solo con la cartella madre «MappAI - file» organizzata (`filesOrganized()`, `main.js:225-228`); altrimenti la base storica è `Documents/MappAI - Live/<slug>` (`main.js:2346`, `:2404`).
7. **Il titolo a schermo in INSEGNA «Quiz a distanza» / «Rispondi e Domanda»** (`mappai-landing-teach.js:2704-2705`) differisce dalle card del hub («Studio attivo live» / «Chatta e Scrivi (Tutor AI)»): due nomi per la stessa cosa, da non mescolare nella guida.
8. **Tradotte in EN**: le chiavi `ds_*`, `sc_*`, `lt_live_scelta`, `lv_detach` esistono in `en_translations.js` (es. `:1770-1798`); i fallback italiani sono inline nei moduli (regola 13). Non ho verificato ogni singola chiave.
