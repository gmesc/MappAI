# i — Privacy e dati: che cosa esce davvero verso Gemini/Infomaniak e che cosa resta sul computer

> Letto dal codice il 22/8/2026. Integra `e-cabina.md §1.10` (che dava solo i titoli), `g-disco.md`
> (cartelle), `h-qr-scelta.md §8.1` (token in `session.json`), `f-visione-dossier.md` (foto).
> Qui ci sono: i TESTI INTEGRALI di «Privacy» e «Termini & Condizioni», le porte d'uscita dal
> computer, e per ogni gesto che chiama l'AI che cosa entra nel payload — con file:riga.

## 0. Le porte d'uscita dal computer (tutte)

Nel main Electron le uniche chiamate HTTP verso fuori sono queste (`grep axios\.|https\.request|fetch(` su `main.js`):

| Porta | Verso | Che cosa porta | File:riga |
|---|---|---|---|
| `callGemini` | `https://generativelanguage.googleapis.com/v1beta/models/<modello>:generateContent?key=<CHIAVE>` | il payload (prompt + fonti); la chiave viaggia **nella query string dell'URL** (è il formato dell'API Google); timeout 10 min | `main.js:314-339` (URL `:316`, post `:325-328`) |
| `callInfomaniakChat` | `https://api.infomaniak.com/2/ai/<productId>/openai/v1/chat/completions` | il payload tradotto in formato OpenAI; chiave in header `Authorization: Bearer`; `stream=true` forzato | `main.js:368-382` |
| `list-models` / `list-infomaniak-models` | stessi host, `/models` | solo la chiave (per riempire la tendina «Modello AI») | `main.js:588-596`, `:537-548` |
| `upload-file-gemini` (File API) | `generativelanguage.googleapis.com/upload/v1beta/files?key=…` | **il file intero** (audio, video, documento) in upload «resumable»; `display_name` = nome del file | `main.js:3456-3510` (nome file `:3507`) |
| `fetch-url` | **l'URL che il docente incolla** | MappAI scarica la pagina dal computer del docente (User-Agent finto Chrome/Windows), toglie script/nav/footer, tiene al massimo **50 000 caratteri**, timeout 10 s; su Wikipedia prende solo `#mw-content-text p` | `main.js:3557-3580` |
| `generate-embeddings-*` | Google `batchEmbedContents` / Infomaniak `/embeddings` | testi dei nodi — **ma è dietro un interruttore spento** (§6) | `main.js:476-533` |
| relay «Internet» | `wss://live.insegnai.ch` (default) | apre un canale in uscita SOLO se nel wizard si sceglie «Internet» invece di «WiFi aula» (§2.6) | `main.js:185-195`, `:2103-2135` |

Non c'è nessun altro traffico: `grep -n -i "autoUpdater|analytics|sentry|telemetry|checkForUpdates" main.js` → vuoto. Non c'è un account MappAI né un server MappAI: l'unico IPC «get-machine-id» (`main.js:3540-3552`, MAC + modello CPU) serve al velo «Sblocca Software» e viene confrontato **in locale** con un hash SHA-256 (`index.html:385-410`); non parte mai. Le chiamate dal renderer passano TUTTE da `window.fetchModelAPI` (`app.js:674`), che sceglie il provider (`:724-745`) e registra i token (`:748-763`); l'unica eccezione è il Tutor QR, la cui chiamata parte dal main (`main.js:2930-2947`).

Un dettaglio da non raccontare ma da sapere: `generate-gemini` scrive un file di stato `.gemini_status.json` **nella cartella dell'app** (`main.js:348-351`) con `state`, `model`, `message` («Richiesta inviata a Google...») — non contiene fonti.

## 1. Etichette ESATTE a schermo

### 1.1 Cabina › «Privacy» — testo integrale (`mappai-cabina.js:475-504`)
Nessuna chiave `cb_*` esiste in `it_translations.js`, quindi a schermo compare esattamente il fallback qui sotto.

- «Dove vivono i dati» (`:478`, sezione larga): «Sul tuo computer, in cartelle che puoi aprire dal Finder: mappe e vault, materiali, sessioni delle attività, profili di classi e allievi, registro dei consumi. Non c’è un account MappAI, non c’è un server di MappAI, non c’è sincronizzazione.» (`:479`)
- «Che cosa esce dal computer» (`:482`): «Solo quello che mandi a generare: il testo delle fonti che hai caricato e le istruzioni del prompt, verso il provider AI attivo (Google Gemini, oppure Infomaniak che tiene i dati in Svizzera). Nient’altro parte da solo.» (`:483`)
- «I profili degli allievi» (`:486`): «Quando la taratura è attiva, nel prompt entrano età, grado, sistema scolastico e le note che hai scritto nella scheda (per una classe: grado, registro e note). Il NOME dell’allievo non entra mai. Le note servono a cambiare come l’AI scrive: scrivici i bisogni linguistici, non le diagnosi.» (`:487`)
- «Le attività in classe» (`:490`): «Lavagna, quiz LIVE e Tutor restano sulla rete locale: i telefoni parlano col tuo computer, non con Internet, e le risposte finiscono in una cartella tua. L’eccezione è il Tutor QR, dove i messaggi che gli allievi scrivono vengono inoltrati all’AI per ottenere la risposta.» (`:491`)
- «Il registro degli errori» (`:494`): «Quando qualcosa va storto MappAI scrive una riga in «Diagnostica», sul tuo computer: messaggio, file e riga, provider e modello attivi, titolo della mappa aperta. Non contiene il testo delle fonti né i profili di allievi e classi, e non parte da solo — lo si allega alla segnalazione, che spedisci tu dal tuo programma di posta. Si svuota dalla Cabina, in «Segnalazione».» (`:495`)
- «Cancellare» (`:498`): «Le cartelle sono file normali: si eliminano dal Finder e spariscono davvero. Le identità degli allievi (emoji + numero) esistono solo dentro la classe, sul tuo disco, e si rigenerano quando vuoi.» (`:499`) — con il bottone «Apri la cartella dei consumi» (icona `folder-open`, `:500`).
- Nota in calce: «Sintesi informativa, non un contratto. Per le condizioni complete: insegnai.ch — giacomo@insegnai.ch» (`:502`).

### 1.2 Cabina › «Termini & Condizioni» — testo integrale (`mappai-cabina.js:449-473`)
- «Che cos’è MappAI» (`:452`): «Uno strumento di lavoro per chi insegna: genera mappe e materiali a partire da fonti che scegli tu, e li scrive sul tuo computer. Non è un registro, non è una piattaforma didattica e non ospita nulla in rete per conto tuo.» (`:453`)
- «I contenuti li scrive un modello» (`:456`): «Mappe, quiz, sintesi e risposte del tutor arrivano da un modello linguistico: possono contenere errori, omissioni e semplificazioni sbagliate anche quando la fonte è corretta. Ogni materiale va riletto prima di darlo alla classe. La responsabilità di quello che consegni resta di chi insegna.» (`:457`)
- «Chiave AI e costi» (`:460`): «La chiave API è tua e resta sul tuo computer: le chiamate le paghi al provider che hai scelto, secondo le sue tariffe. MappAI misura token e costo stimato in «Consumi AI», ma non fattura, non rivende e non fa da intermediario.» (`:461`)
- «Uso con gli allievi» (`:464`): «Lavagna, attività LIVE e Tutor QR aprono un server sul tuo computer a cui i dispositivi si collegano via Wi-Fi. Chi somministra l’attività risponde dei dati che raccoglie e delle regole del proprio istituto: prima di usarle con minori, verifica cosa prevede la tua scuola.» (`:465`)
- «Le fonti che carichi» (`:468`): «Carichi tu i PDF, i link e i testi: assicurati di averne il diritto. I materiali generati ne sono una rielaborazione e ne seguono i vincoli — un capitolo sotto copyright non diventa libero perché ci hai fatto una mappa.» (`:469`)
- Nota in calce: identica a Privacy (`:471`).

Il commento sopra le due viste (`:446-448`) dichiara l'intento: «Il testo dice quello che il codice fa davvero … Non sostituisce il testo legale pubblicato dall'autore.»

### 1.3 Altre etichette di quest'area
| Etichetta | Dove | File:riga |
|---|---|---|
| «Profili individuali degli allievi» + «Attivi perché il ruolo dichiarato è «Docente di sostegno / OPI». I profili vivono sul tuo computer. Quando la taratura è attiva, nel prompt entrano età, grado e le note che scrivi qui — mai il nome dell’allievo.» + bottone «Gestisci profili» | Cabina › Profilo insegnante, solo col ruolo sostegno/OPI | `mappai-teacher-profile.js:176-186` |
| «Nome / nickname allievo» (placeholder «Es. Marco») · «Età» · «Classe di appartenenza» · «Grado e livello» | scheda allievo | `mappai-live-classes.js:453-459` |
| «🎯 Taratura AI» · tooltip «Come funziona la taratura?» · «Adatta la generazione AI (mappe, quiz, cloze) a questo studente quando la sua scheda è attiva. Cambia il linguaggio, non i fatti.» | card nella scheda allievo | `:463-467` |
| box «?»: «La taratura non cambia i **fatti**: cambia solo **come** l'AI spiega i contenuti a questo studente. **Grado e livello** — regolano profondità e complessità dei contenuti. **Note** — indicazioni libere su bisogni e interessi (es. «DSA, frasi brevi», «esempi dallo sport», «evita metafore astratte»). Vale per mappe, quiz, cloze e tutor generati quando questa scheda studente è **attiva**. Le mappe già create non vengono ri-tradotte.» | idem | `:471-475` |
| «Preset di taratura» (tendina «— registro —» / semplice / medio / ricco) | idem | `:481-486` |
| textarea classe, placeholder «Note di taratura (es. 3 DSA, 2 alloglotti; esempi dallo sport; evita metafore astratte)» | scheda classe | `:795` |
| «Nome (facoltativo)» — il nome dell'allievo accanto a emoji+numero nel roster | scheda classe › credenziali | `:864` |
| toggle «Adatta <contesto>» (`#level-tune-toggle`), title «Per fonti esterne (articoli, video) non scritte per la classe: le descrizioni vengono generate al livello del contesto attivo. Non serve per schede già tarate dal docente.»; senza contesto: «nessun contesto attivo» | CREA (form storico `#level-tune-row`) | `index.html:834-844`, `it_translations.js:363-364`, `app.js:1778-1789` |
| «Download contenuti dal Web...» (velo) · toast «Errore caricamento URL: <motivo>» | fonte URL | `app.js:1323`, `:1333` |
| «MappAI: Caricamento AUDIO nel Cloud AI...» (anche VIDEO/DOC) · toast «Errore upload <tipo>: …» | fonti audio/video/altri documenti | `app.js:1408`, `:1459` |
| «Estrazione testo dal PDF locale...» · «Estrazione testo dal documento Word...» | fonti PDF/DOCX | `app.js:1342`, `:1376` |
| «MP3, WAV, AAC... MappAI ascolterà il file.» · «MP4, MOV, WEBM... MappAI vedrà il file.» · «Testi (PDF incluso) e IMMAGINI: una foto diventa un dossier di fonte.» · placeholder «https://youtube.com/watch?v=...» + «MappAI estrarrà i contenuti audio/visivi del video.» | note sotto i campi fonte (form storico) | `app.js:970`, `:973`, `:985`, `:979` |
| «Rete studenti» · «WiFi aula» · «Internet» · hint «Gli allievi usano la LORO connessione (dati o WiFi qualunque): la sessione passa dal relay MappAI su server svizzero. Serve internet sul PC.» | wizard Lavagna, Tutor QR («Chatta e Scrivi»), Timeline | `mappai-net-mode.js:52-58`; montato in `mappai-collab-teacher.js:177`, `mappai-tutor-teacher.js:219`, `mappai-timeline-teacher.js:139` |
| toast «Relay non raggiungibile: sessione avviata in modalità WiFi aula» | dopo l'avvio se il relay non risponde | `mappai-net-mode.js:82-86` |
| «Serve la chiave API Google (Gemini) per la voce naturale» | voce naturale con Infomaniak attivo | `mappai-branch-synthesis.js:1752` |
| «Questo dossier: circa {n} chiamate all'AI» · «Che cosa sai di questa fonte?» | scheda foto | `mappai-visione.js:313`, `:653` |
| errore interno 'provider infomaniak non supportato' (foto con Infomaniak) | — (non è un'etichetta a schermo pulita: NON TROVATA la frase tradotta) | `mappai-visione.js:48-52` |

## 2. Gesti → che cosa ESCE / che cosa RESTA

Legenda: **ESCE** = nel payload verso il provider attivo. **RESTA** = solo su disco/localStorage.

| Gesto | ESCE verso l'AI | NON esce | Resta su disco / localStorage | Dove si legge |
|---|---|---|---|---|
| **Genera mappa** (CREA) | il **testo** delle fonti: testo libero `[FONTE TESTO]`, pagina web scaricata dal PC `[FONTE WEB <url>]`, PDF estratto in locale con pdf.js `[FONTE PDF <nome file>]`, TXT, DOCX estratto nel main `[FONTE DOCX <nome>]`; per **altri documenti non-PDF** (csv, md, rtf…) il file intero in base64 `inline_data`; per **audio/video** il file intero via File API (`file_data`). Più: il **titolo della mappa** (`{{rootNodeLabel}}`, 12 volte nei template; `mm-extraction.js:33,56`), il **focus/lenti** sanitizzati (`:58,239,575`), il blocco disciplina (se attiva), la **taratura** (§2.2) e le regole di accessibilità (lette dal registro della classe). Intestazioni/piè di pagina ricorrenti vengono TOLTI prima (`app.js:1473-1493`, default ON). | nome del docente, nome della classe (salvo il caso di §2.2), nome dell'allievo, la chiave degli altri provider, la cartella dove sta il file | vault in `Mappe/…` (vedi g-disco); `Registro consumi AI/consumi-ai.jsonl` con `project` = titolo mappa | `app.js:1312-1466` (loop fonti), `:1473-1493`, `mappai-mm-extraction.js:23-60` |
| **Fonte YouTube** | **solo la stringa dell'URL** nel prompt: `textParts.push("[FONTE YOUTUBE]: " + url)` — nessun download, nessun upload, nessuna trascrizione | il video | — | `app.js:1338-1340` |
| **Fonte URL** | il testo della pagina (≤ 50 000 caratteri) scaricata **dal computer del docente** (non da Gemini) | — | — | `main.js:3557-3580`, `app.js:1320-1337` |
| **Foto → «Analizza»** (fonti iconografiche, solo Google) | l'immagine ridotta a 1600 px come `inlineData` + il **nome del file** + la nota del docente («Che cosa sai di questa fonte?») + taratura | — | copia ridotta effimera in `userData/visione-tmp/` cancellata subito (f-visione) | `mappai-visione.js:116-159` (payload `:130-137`), `:48-52` |
| **Materiali** (quiz, flashcard, domande aperte, schede) | per ogni ramo: etichette + `desc` del ramo e dei discendenti (tetto **12 000 caratteri**) + taratura | fonti originali (non rilette), nomi | PDF/HTML nel vault | `mappai-material-pipeline.js:123-128`, `:288`, `:430-431` |
| **Sintesi di ramo** | etichette + `desc` dei nodi **e gli estratti delle fonti** collegati (`sourcesDict`) + la catena causale deterministica + taratura | — | sintesi archiviata (c-elabora) | `mappai-branch-synthesis.js:396-430`, `_buildSourcesAndContent` |
| **Voce naturale** (TTS) | i blocchi di testo della **sintesi generata** (non la fonte), al modello `gemini-2.5-flash-preview-tts`, voce `Kore`; **solo Google** | — | audio in cache su disco (IPC `tts-cache-*`, `main.js:2719-2749`) | `mappai-branch-synthesis.js:1752-1770` |
| **Espandi da Fonte** (nodo) | etichetta e id del nodo, **tutte le etichette** dei nodi esistenti, il testo/PDF incollato (`sourceContent`) + system instruction con taratura | — | — | `mappai-contextual-ai.js:69-86` |
| **Tutor AI del nodo** (desktop) | etichetta + `desc` del nodo, gli **estratti delle fonti** del nodo («FONTI/ESTRATTI DISPONIBILI»), la macro-area (MM) o il super-hub (KG), la storia della chat, la modalità; **se c'è una scheda allievo attiva: `L'utente è <nickname>, ha <età> anni, frequenta la classe <grado> nel sistema: <sistema>`** (⚠️ vedi §8.1) + taratura | — | trascrizione in `<vault>/Chat/<Mappa>_nodo_<etichetta>_<GG-MM-AAAA>.txt` (append, automatica a ogni scambio) | `mappai-ai-tutor.js:490-529`, `:563`, `:585-594`; transcript `:140-160`, `:333`; `main.js:1266-1292` |
| **Tutor AI della sidebar** («Tutor AI») | al PRIMO messaggio **tutta la mappa**: ogni nodo come `- NODO [etichetta]: desc`; poi solo le domande; system «Sei un Tutor per studenti. Hai accesso all'intero contesto del progetto dell'utente…» + taratura | fonti originali, nomi | `<vault>/Chat/<Mappa>_sidebar_<data>.txt` | `mappai-ai-tutor.js:205-215`, `:226-238`, `:268-269` |
| «Mettiti alla prova (Genera Quiz)» | prompt sul nodo + taratura | — | — | `mappai-ai-tutor.js:654-664` |
| **Tutor QR «Chatta e Scrivi»** (allievi dal telefono) | system: titolo mappa, argomento assegnato, `desc` del nodo (≤ 900 caratteri), fino a 25 sottotemi, la consegna di scrittura, la taratura di classe; poi la **chat dell'allievo** (trascrizione + nuovo messaggio). **Niente nome, emoji o numero dell'allievo** nel payload | la chiave (resta nel main, mai ai telefoni) | `Attività di studio/<classe>/<sessione>/session.json` con **`token` e `adminToken`** + roster (emoji, numero, nome facoltativo); `students/<id>.json` con la trascrizione intera; consumi registrati `cat: tutor, sub: qr` | `mappai-tutor-teacher.js:127-139`, `mappai-tutor-core.js:73-100`, `tutor-server.js:14-17`, `:172-177`, `:140-152`, `persistStudent`; `main.js:2911-2947` |
| **Domande/Quiz a scelta, Lavagna, Timeline, Proietta** | **nulla**: nessun `callModel`/`fetchModelAPI` in `live-server.js` | tutto | sessione su disco (h-qr §8.1: `session.json` con i token) | `grep callModel live-server.js` → vuoto |
| **Tendina «Modello AI»** | la sola chiave (lista modelli) | — | `gemini_selected_model` / `infomaniak_selected_model` | `main.js:588-596`, `:537-548` |

### 2.1 Che cosa contiene SEMPRE una chiamata (la busta)
`fetchModelAPI` (`app.js:674-775`): il `payload` così com'è costruito dal chiamante; il modello scelto nella tendina (o quello salvato, o il default `gemini-2.0-flash` / `mistral-small-4-119B-2603`, `:675-683`); su Gemini 2.5/3 con budget ≤ 12 288 token spegne il «thinking» (`:697-706`). Su Infomaniak il bridge trasforma `systemInstruction` in un messaggio `role: system` (`infomaniak_bridge.js:13-16`) e fissa `temperature` 0,3. Nessun identificativo del computer, del docente o della classe viene aggiunto dalla busta.

### 2.2 La taratura: che cosa entra ESATTAMENTE nel prompt
- È un blocco di testo accodato al `systemInstruction` da `injectClassTuning` (`app.js:1794-1804`) o da `buildSystemInstruction` (`:1580-1594`), solo se «armata» (`classTuningPrompt`, `:1749-1772`; il testo viene congelato a inizio generazione, `:1519`).
- **Allievo attivo** (`activeTuningBlock`, `app.js:1711-1740`): «--- TARATURA STUDENTE (adatta linguaggio ed esempi a questo allievo) --- Adatta il linguaggio a uno studente di <età> anni, classe <grado> (<sistema>).» + preset di registro + «Note sull'allievo: <note>.» + «Resta fedele ai fatti, adatta solo COME li esprimi.». Il nickname serve SOLO come interruttore (`:1715`): **non viene scritto**.
- **Classe attiva** (`buildTuningBlock`, `mappai-live-classes.js:137-156`): «--- PROFILO CLASSE (adatta linguaggio ed esempi a questo pubblico) ---» + «Classe: <grado> · livello: <sistema>.» + «Disciplina: <materia>.» + preset di registro + «Note sulla classe: <note>» + frase di fedeltà. **Il nome della classe, del docente e degli allievi non c'è.**
- **Solo livello** (toggle «Adatta», `levelBlock`, `app.js:1632-1660`): «Destinatari: studenti di <grado> · <sistema>.». ⚠️ Per una classe usa `c.grade || c.name` (`:1639`): se il grado è vuoto entra il **nome della classe**, che però è sempre «grado+sezione» tipo «2A» (`mappai-live-classes.js:602-607`), non un nome di persona.
- **Disciplina attiva** (`mappai-disciplines.js:110-140`): template disciplinare + «Profilo destinatario: studente di scuola media (12-15 anni)…» dedotto dal **grado** dell'allievo. Anche **le regole di accessibilità** (`app.js:1813-1850`) leggono il **registro** della classe attiva.

### 2.3 Che cosa resta sul computer e basta
- **Chiave API**: campo password → `localStorage.gemini_api_key` / `infomaniak_api_key` (`storageAdapter.js:64-80`; il Portachiavi iOS vale solo in Capacitor); letta da `getSystemKey` (`app.js:545-553`). Va al provider a ogni chiamata (URL per Google, header per Infomaniak), mai altrove.
- **Registro consumi**: `Registro consumi AI/consumi-ai.jsonl` (o `Documenti/MappAI - Consumi AI/`), una riga per chiamata con `ts, provider, model, inTok, outTok, cat, sub, project (titolo mappa), projectId` — mai i costi, mai i prompt (`mappai-usage-tracker.js:47-63`, `main.js:2620-2638`).
- **Registro errori**: `Diagnostica/errori.jsonl` (rotazione 1 MB → `errori-precedenti.jsonl`), contesto = `provider, modello, mappa (titolo ≤ 80 car.), vista` (`mappai-errori.js:72-87`, `main.js:2773-2797`); copia degli ultimi 50 in `localStorage.mappai_errori_recenti`. Si allega a mano alla mail.
- **Profili**: `localStorage.mappai_teacher_profile`, `mappai_user_profile`, `mappai_all_profiles`, `mappai_classes` + `Classi/classi.json` (e-cabina §2).
- **Sessioni in classe**: cartelle `Attività di studio/…` (g-disco); i server ascoltano su `0.0.0.0` (`live-server.js:762`, `tutor-server.js:395`), porte Tutor 8769-8779 (`main.js:2950-2953`).

## 3. Limiti numerici e default
| Cosa | Valore | File:riga |
|---|---|---|
| Pagina web scaricata | max **50 000** caratteri, timeout **10 s** | `main.js:3576`, `:3563` |
| Timeout chiamata Gemini | **600 s** (10 min) | `main.js:327` |
| Desc del nodo nel Tutor QR | **≤ 900** caratteri; sottotemi ≤ 25 / 500 caratteri | `mappai-tutor-teacher.js:132-146` |
| Materiale per ramo (quiz ecc.) | **12 000** caratteri | `mappai-material-pipeline.js:124-127` |
| Tutor nodo su Infomaniak | risposta max **400** token | `mappai-ai-tutor.js:590` |
| Foto per la lettura | ridotta a **1600 px**, PNG; copia per i fogli 900 px JPEG | f-visione (`main.js:659-698`) |
| Voce naturale | **10 chiamate/min** (`mappai_tts_rpm`), modelli `gemini-2.5-flash-preview-tts` + ripiego | c-elabora; HANDOFF:314,317 |
| Registro errori | 1 MB per file, 200 righe, copia 50 in localStorage | `main.js:2781`, `mappai-errori.js:35` |
| Formati accettati (form storico) | audio `audio/*`; video `video/*`; documenti `.pdf,.txt,.csv,.md,.rtf,.docx,.jpg,.jpeg,.png,.heic,.heif` | `app.js:970-985` |
| Relay «Internet» | default `wss://live.insegnai.ch`, sovrascrivibile da `MAPPAI_RELAY_URL` o `userData/mappai-settings.json`; fallback LAN | `main.js:185-195`, `:2118-2135` |

## 4. Percorso tipico del docente (storyboard)
1. Cabina (ingranaggio in alto) › voce «Privacy» (`mappai-cabina.js:52`) → le sei schede di §1.1; clic «Apri la cartella dei consumi» → Finder su `Registro consumi AI/`.
2. Cabina › «Termini & Condizioni» (`:51`) → le cinque schede di §1.2.
3. Cabina › «Impostazioni AI»: «Google Gemini» / «Infomaniak (CH)», campo «Inserisci chiave Google Gemini...», nota «API key salvata localmente.» (e-cabina §1.4) — qui si mostra CHE la chiave resta nel computer.
4. CREA › «Documenti» → scegliere un PDF: velo «Estrazione testo dal PDF locale...» (il testo si estrae nel PC) → «Genera».
5. CREA › fonte URL → velo «Download contenuti dal Web...» (la pagina la scarica il PC).
6. CREA › audio o video → velo «MappAI: Caricamento AUDIO nel Cloud AI...» (qui il FILE INTERO va a Google).
7. Cabina › Classi › scheda classe › textarea «Note di taratura (…)» e tendina registro → mostrare che cosa entra (§2.2) — niente nomi.
8. Cabina › Allievi › «Nome / nickname allievo», «Età», «Grado e livello», «🎯 Taratura AI» → «?» apre il box esplicativo.
9. Mappa › sidebar «Tutor AI» → prima domanda: parte tutta la mappa (non le fonti); file `Chat/…txt` nel vault.
10. INSEGNA › Tutor QR «Chatta e Scrivi» wizard → «Rete studenti»: «WiFi aula» (tutto in aula) vs «Internet» (relay); avviare → i messaggi degli allievi vanno all'AI, la cartella `Attività di studio/…` contiene `session.json` e `students/*.json`.
11. Cabina › «Consumi AI» → tabella token per mappa (e-cabina §1.5): la prova visiva del registro.
12. Cabina › «Segnalazione» → «Diagnostica», il registro errori da allegare a mano.

## 5. Prerequisiti e stati
- **Senza chiave** nessuna chiamata parte: `getSystemKey` vuoto → toast «Inserisci un'API Key AI per continuare.» (`app.js:1246`, e-cabina §5); tendina «Nessun modello (manca API Key)».
- **Foto e voce naturale**: solo con **Google** attivo (`mappai-visione.js:48-52`; `mappai-branch-synthesis.js:1752`).
- **Embeddings/dedup semantico**: solo con `mappai_semantic_dedup_enabled='1'` (spento).
- **Taratura nel prompt**: solo con classe o allievo ATTIVO e il materiale/la generazione che la arma; senza contesto il toggle «Adatta» è spento con «nessun contesto attivo» (`app.js:1778-1789`).
- **«Internet» nei wizard**: visibile di default (`mappai_web_mode !== '0'`, `mappai-net-mode.js:30-32`), selezione di default «WiFi aula» (`:34-37`); se il relay non risponde la sessione parte comunque in aula col toast di §1.3.
- **Sezione allievi in Cabina › Profilo**: solo col ruolo «Docente di sostegno / OPI» (`mappai-teacher-profile.js:176`).

## 6. NON ESISTE
- **Nessun consenso/informativa al primo avvio**: `grep -n -i "privacy|consenso|accetto|gdpr" public/index.html` → vuoto. L'informativa vive solo nelle due viste della Cabina.
- **Nessuna telemetria, nessun aggiornamento automatico, nessun account**: grep in `main.js` vuoto (§0).
- **Nessuna trascrizione/lettura di YouTube**: al modello arriva solo l'URL (`app.js:1338-1340`). La nota a schermo «MappAI estrarrà i contenuti audio/visivi del video.» (`app.js:979`) **non è coperta dal codice**: non descriverla come funzione.
- **Nessun «modello locale»**: la foto la legge Gemini via `fetchModelAPI` (`mappai-visione.js:136`; HANDOFF:134-137 «il motore locale Ollama … è stato TOLTO»). ⚠️ `GUIDA-ARCHITETTO.md:255` dice ancora «prima di andare al modello locale»: è una riga vecchia, non seguirla. Il pannello «modelli GGUF» (`mappai-npc-admin.js`, `index.html:3637-3669`) sta nella dashboard admin nascosta del Dungeon pensionato: non è per i docenti.
- **Embeddings** (Google `gemini-embedding-001` / Infomaniak `bge-multilingual-gemma2`): codice vivo in `main.js:476-533` ma chiamato solo da `fetchEmbeddings` dietro `mappai_semantic_dedup_enabled === '1'` (`mappai-generation-support.js:686-690`) → di default non parte nulla.
- **Triage MM** (pre-pass AI): `getMMLogic` legge `mappai_mm_triage_enabled === '1'` (`app.js:356`) → spento.
- **Nessuna cancellazione dei file caricati su Google**: `grep -n "files/|deleteFile|DELETE" app.js main.js` → nessuna chiamata di delete dopo l'upload File API. Quanto restano sui server Google non si legge nel codice (§8).
- **Nessun costo nel registro**: solo token (`main.js:2620-2623`).
- **Il Tutor QR non manda nomi/emoji all'AI** (`mappai-tutor-core.js:73-100`); ma **`session.json` contiene i token** (`tutor-server.js:140-152`; h-qr §8.1): non scrivere «senza token».
- **Nessun Portachiavi su desktop** (`storageAdapter.js:64-80`).

## 7. Parole da NON usare con i docenti
| Nel codice | Nella guida |
|---|---|
| payload, prompt, systemInstruction | «la richiesta che parte verso l'AI» / «le istruzioni che MappAI scrive all'AI» |
| provider, Google Gemini / Infomaniak | «il servizio AI: Google, oppure Infomaniak (svizzero)» |
| API key, token (di accesso), Product ID | «la chiave personale» (Infomaniak: «chiave e numero del prodotto») |
| token (conteggio), inTok/outTok | «quanto testo è passato» (a schermo resta «Token») |
| File API, upload resumable, inline_data, inlineData, file_data | «il file intero viene mandato a Google» |
| fetch-url, cheerio, scraping | «MappAI scarica la pagina dal tuo computer e ne tiene il testo» |
| taratura armata, injectClassTuning, registro (semplice/medio/ricco) | «l'adattamento alla classe o all'allievo» / «il preset di taratura» (a schermo: «Taratura AI») |
| sourcesDict, chunks, desc | «gli estratti della fonte» / «la descrizione del nodo» |
| localStorage | «la memoria interna dell'app» |
| JSONL, `consumi-ai.jsonl`, `errori.jsonl` | «il registro dei consumi» / «il registro degli errori» (cartelle «Registro consumi AI», «Diagnostica») |
| relay, wss, LAN, 0.0.0.0, porta | «WiFi aula» / «Internet (passa da un server svizzero)» — le due etichette a schermo |
| token/adminToken di sessione, session.json | «i file della sessione: restano sul tuo computer, non condividerli» |
| machine-id, hash, SECRET_SALT | «il codice di sblocco legato a questo computer» |
| embeddings, dedup semantico, thinkingBudget, kill-switch | (non nominare) |
| vault | «la cartella della mappa» |

## 8. Dubbi
1. **Il nickname nel Tutor del nodo.** Letto nel codice, non provato a schermo: `mappai-ai-tutor.js:524-529` scrive «L'utente è <nickname>, ha <età> anni…» nel template `SOCRATIC_TUTOR_*` quando `appState.userProfile.nickname` è valorizzato. Contraddice «Il NOME dell'allievo non entra mai» (`mappai-cabina.js:487`) e la frase di `mappai-teacher-profile.js:184`. Va detto al maintainer prima di scrivere la guida: o si corregge il codice, o la guida deve dire «nel tutor del nodo entra anche il nickname». Non ho verificato se il nickname sia un nome vero o di fantasia: la UI suggerisce «Es. Marco».
2. **«Infomaniak che tiene i dati in Svizzera»**: è un'affermazione del testo Privacy, non verificabile dal codice (l'host è `api.infomaniak.com`).
3. **Quanto restano i file audio/video sui server Google** (File API) e se vengono usati per addestramento: non nel codice; dipende dai termini di Google per la chiave del docente.
4. **Il nome della classe nel prompt «solo livello»** (`app.js:1639`, `c.grade || c.name`): non ho riprodotto una classe senza grado; con il form attuale il grado è obbligatorio (tendina 1-4), quindi il caso è teorico.
5. **La pagina web con login/cookie**: `fetch-url` scarica anonimo; una pagina dietro login torna come errore o come pagina di login. Non provato.
6. **Modalità «Internet»**: la memoria di progetto dice che `live.insegnai.ch` non è in DNS; il codice fa fallback in aula con toast. Non ho provato a schermo quale dei due scenari si vede oggi.
7. **Form storico vs manifesto**: le note «MappAI ascolterà il file» ecc. stanno nel form storico (`app.js:970-985`); non ho verificato quali di esse il manifesto CREA rimonti a schermo (a-landing-crea §1 è la fonte per le etichette visibili).
8. **`.gemini_status.json` nell'app impacchettata**: `__dirname` è dentro `app.asar` (sola lettura) → la scrittura fallisce in silenzio (try/catch). Non verificato sul build.
