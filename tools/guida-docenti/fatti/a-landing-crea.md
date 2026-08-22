# Fatti dal codice — LANDING e CREA (veste «manifesto»)

> Letto il 22/8/2026 su `main` (HEAD e35db8f). Ogni fatto porta `file:riga`. Le etichette sono
> trascritte ESATTAMENTE come stanno nel codice (fallback italiano di `window.t()` o testo del
> markup / dizionario `it_translations.js`). Dove non ho trovato l'etichetta scrivo «NON TROVATA».

## 0. Che cosa c'è acceso (default di `main`) — la cornice

| interruttore | stato | prova |
|---|---|---|
| `mappai_stile_manifesto` | **acceso** (assente ≠ `'0'`) | `public/index.html:76` (boot inline) · `docs/HANDOFF.md:296` |
| `mappai_vista_ridotta` | **spento** (assente ≠ `'1'`) → si vede la **vista completa** col mega-bento intero | `public/index.html:77`; `public/js/mappai-vista-ridotta.js:35` (`attiva()` = `=== '1'`) |
| `mappai_bento_layout` | assente → comanda la composizione del file `mappai-bento-composizione.js` | `docs/HANDOFF.md:297` |
| `mappai_gen_ctx_sempre` | **acceso** → «Per chi è questa mappa?» chiesto SEMPRE prima di generare | `public/js/mappai-live-classes.js:1126`; `docs/HANDOFF.md:312` |
| `mappai_lavori_barra` | **acceso** → spinner + nome del lavoro nella barra in alto | `docs/HANDOFF.md:309` |
| `mappai_visione` | **acceso** → «Documenti» accetta anche le foto (→ scheda → dossier) | `docs/HANDOFF.md:315`; `public/js/app.js:1068-1076` |
| `mappai_autovault` | **acceso** (assente ≠ `'0'`) → a fine generazione la cartella della mappa si crea da sé | `public/js/mappai-vault-io.js:139-143` |
| `mappai_kg_community_mode` | **spento** → KG «classico» (single/multi-pass) di default | `public/js/app.js:1530-1540` |
| `mappai_teach_console` | acceso (INSEGNA è una console) — fuori area | `docs/HANDOFF.md:298` |

La combo **SHIFT+CTRL+L,K,J,H** accende/spegne la **vista ridotta** (`mappai-vista-ridotta.js:11`,
toast «Vista ridotta attiva: solo PDF, tipo di mappa e genera.» / «Vista completa ripristinata.»
`:404-405`). **È un NON-obiettivo della guida**: di default è spenta e la schermata è quella completa.

---

## 1. Etichette ESATTE a schermo

### 1.1 La barra in alto (landing, tutte le sezioni)
| etichetta | dove / selettore | file:riga |
|---|---|---|
| «Cabina» (aria-label) · title «Cabina — profilo, AI, consumi, guida» — il pallino a sinistra, 28px dal bordo, icona nascosta nella veste | `#btn-cabina` in `#header-utils` | `public/index.html:620-622`; CSS `mappai-stile-manifesto.css:144` |
| Nome della sezione: «Crea» · «Elabora» · «Insegna» · «Cabina» (role=heading) | `#mn-sezione` (appeso a `#header-utils`) | `public/js/mappai-stile-manifesto.js:124-128, 131-140`; dizionario `it_translations.js:9-11` |
| Briciola «Cosa» (prima di scegliere) → poi «Crea»/«Elabora»/«Insegna» (nome della sezione in cui sei); voci del menu: «Crea» · «Elabora» · «Insegna»; separatore «›» | `nav.mn-percorso` in `#header-utils`, voci `button.mn-bric-menu__it`, menu `aria-haspopup="true"` | `public/js/mappai-console-bento.js:892-917, 944-955, 981-984` |
| In CREA si monta **solo** la briciola «Cosa» (`livelli.slice(0,1)`): «A chi?» e «Materia» NON compaiono in alto (stanno nel box giallo) | `#header-utils` | `public/js/mappai-stile-manifesto.js:218-222` |
| Fuori da CREA la cascata continua: «A chi?» → (valore: nome classe / nickname allievo / «Generico») con menu a tre colonne «Generico» · le classi · gli allievi («nick — grado»); poi «Materia» → (materia scelta) con voce «+ Nuova materia» (solo senza classe) | idem | `public/js/mappai-console-bento.js:919-932` |
| Voce bloccata durante una generazione: classe `is-bloccata`, icona Lucide `lock`, `title` = motivo, aria-label «Elabora — Sto generando «<nome>»: si riapre appena è pronta.» | `.mn-bric-menu__it.is-bloccata` | `public/js/mappai-console-bento.js:786-796`; motivo in `public/js/mappai-generazione.js:151-157` |
| Chip classe/materia dell'header: **nascosto in CREA** (`html.mn-costruisci #active-class-chip`) | `#active-class-chip` | `public/css/mappai-stile-manifesto.css:250-253`; `mappai-stile-manifesto.js:240` |
| Indicatore dei lavori: spinner + nome del lavoro, a destra a 28px; `title` = elenco dei lavori (uno per riga); aria-label «In lavorazione: <nomi>»; badge «+N» se più lavori; ripiego del nome «MappAI sta lavorando» | `#mn-lavori` (`.mn-lav__n`, `.mn-lav__piu`, `.mn-lav__s`) | `public/js/mappai-lavori.js:31-34, 133-150` |

### 1.2 La landing VUOTA (prima pagina)
| etichetta | selettore | file:riga |
|---|---|---|
| «MappAI» (il marchio gigante, logo 150px + parola, al 40% dell'altezza) | `#landing-brand` / `h1.hero_title_main` | `public/index.html:606`; CSS `mappai-stile-manifesto.css:182-199` |
| La barra dei tre bottoni `#landing-mode-bar` (Crea/Elabora/Insegna, `index.html:631-646`) è **nascosta** nella veste: si entra in una sezione dal menu «Cosa» della briciola | `#landing-mode-bar` | `public/css/mappai-stile-manifesto.css:184, 293` |
| Cassetto insegnai.ch (linguetta viola in basso, visibile SOLO sulla pagina vuota): «Chi ha creato MappAI?», «Feedback & Bug» (bottone → Cabina › feedback), link «insegnai.ch», «giacomo@insegnai.ch» | `#insegnai-drawer`, `#insegnai-drawer-tab` | `public/index.html:481-560`; CSS `:302-307` |
| La landing si apre **vuota**: `readMode()` restituisce `''` se la chiave `mappai_landing_mode` non è tra `build/elabora/teach`; la sezione NON si ricorda | — | `public/js/mappai-landing-teach.js:36-41`; `docs/HANDOFF.md:694-697` |

### 1.3 CREA — riga delle fonti (moduli «nudi» `upload` + `elenco`)
I cinque bottoni-fonte mostrano **solo l'icona** finché non ci passi sopra; il `title`/`aria-label` è il testo del bottone (`mappai-stile-manifesto.js:291-303`).

| etichetta | selettore | file:riga |
|---|---|---|
| «Documenti» (bottone grande, nel modulo `upload`) | `#btn-src-doc.btn_selezione_input` | `public/index.html:706-718`; `it_translations.js:212` |
| «URL Web» · «YouTube» · «Audio» · «Testo» (nel box «INPUT», etichette riscritte «URL» · «YouTube» · «Audio» · «Testo libero» dal bento) | `#btn-src-url` · `#btn-src-youtube` · `#btn-src-audio` · `#btn-src-text` | `public/index.html:677-729`; etichette bento `mappai-bento-composizione.js:304-311, 614-617` |
| Riga-fonte creata da `addSource`: titoli «Documenti (.pdf, .txt, .csv, .md)» · «File PDF» · «File Audio» · «File Video» · «Link Web» · «Video YouTube» · «Testo Libero» | `.source-entry` in `#sources-container` | `public/js/app.js:965-985` |
| Nota sotto «Documenti»: «Testi (PDF incluso) e IMMAGINI: una foto diventa un dossier di fonte.» | `p` nella riga | `public/js/app.js:984` |
| Note sotto gli altri: «MP3, WAV, AAC... MappAI ascolterà il file.» · «MP4, MOV, WEBM... MappAI vedrà il file.» · «MappAI analizzerà i contenuti della pagina web.» · «MappAI estrarrà i contenuti audio/visivi del video.» | idem | `public/js/app.js:968-977` |
| Placeholder: «https://...» (URL) · «https://youtube.com/watch?v=...» (YouTube) · «Incolla qui i tuoi appunti...» (Testo) | `input[type=url]`, `textarea` | `public/js/app.js:974, 977, 980` |
| Stato del file: «Lettura file...» → «<nome> (<n> MB) pronto.» / «<nome> (<n> MB) caricato.» / «Errore lettura.» | `#status-<id>` | `public/js/app.js:1066, 1086-1093` |
| Stato di una foto: «Analisi in corso…» → «<nome> — scheda confermata: farà un dossier» / «<nome> — scheda annullata: togli la fonte o ricaricala» | idem | `public/js/app.js:1105, 1120, 1128` |
| Cestino della riga (icona `trash-2`, senza testo) | `button` nella riga → `removeSource` | `public/js/app.js:987` |
| Elenco delle fonti caricate (tabella: nome · peso «33,1 MB»/«12 KB»/«N parole»/genere); bottone-pallino «Togli il file» (title + aria-label) | `#mn-files` `.mn-files__box`, `.mn-togli` | `public/js/mappai-costruisci-manifesto.js:76-128, 302-309` |
| Testo del box vuoto dell'elenco link/video/audio: «Le fonti scelte qui a sinistra compaiono in questo elenco.» · ripiego «Scegli una fonte qui a sinistra: il campo per incollare il link o il testo compare qui.» | box `input-box` | `mappai-bento-composizione.js:267`; `mappai-costruisci-manifesto.js:899` |
| Testo del box «Testo libero» vuoto: «Premi «Testo» fra le fonti: qui compare l'area dove incollare gli appunti.» · titolo del posto «Testo libero (area di scrittura)» | box `testo` | `mappai-bento-composizione.js:275-276, 640-641` |

### 1.4 CREA — riga del genere (moduli «nudi» `genere` + `genere-opz`)
| etichetta | selettore | file:riga |
|---|---|---|
| «Mappa Mentale» · «Knowledge Graph» (due bottoni, `active` su quello scelto) | `#mode-mindmap` · `#mode-kg` (`.mode-buttons-container`) | `public/index.html:742-768` |
| «Tema Centrale:» + campo placeholder «Es. Rivoluzione Francese, Fotosintesi...» (solo MindMap) | `#step-root-container` → `#root-node-name` (dentro `#mn-genere-dx`) | `public/index.html:783-788`; `mappai-costruisci-manifesto.js:191-202` |
| «Numero di Concetti/Entità (Livello 2)» + valore «20», slider «10»…«35» (solo KG) · nota «Numero di concetti/entità da generare all'interno del grafo relazionale (consigliato 15-25 per grafi ordinati, fino a 30+ per grafi completi).» · tooltip `data-tip` «Solo per Knowledge Graph. Quanti concetti/entità generare nel grafo: 15-25 per grafi ordinati, 30+ per grafi più completi.» | `#step-kg-density-container`, `#kg-nodes-slider`, `#kg-nodes-val` | `public/index.html:947-966` |
| Con una FOTO fra le fonti MM/KG e il tema si spengono (opacità 0,4) col title «Con una fonte iconografica si genera il DOSSIER: la mappa e il tema non servono — il titolo viene dalla scheda.» | `#mode-mindmap`, `#mode-kg`, `#root-node-name` | `public/js/mappai-visione.js:598-615` |
| I titoli di passo del form storico («Carica le tue Fonti», «Cosa desideri generare?», «Tema Centrale e Macro-Aree», «Impostazioni generazione») sono **nascosti** nella veste | `.step_container` | `public/css/mappai-stile-manifesto.css:1019` |

### 1.5 CREA — il BOX GIALLO del contesto (modulo `ctx`, icona `graduation-cap`)
| etichetta | selettore | file:riga |
|---|---|---|
| «Chi:» tendina: «— scegli —» · optgroup «Classi» (nomi classe) · optgroup «Allievi» (nickname); aria-label «Chi: classe o allievo destinatario» | `#mp-chi` | `mappai-bento-composizione.js:94, 546`; `mappai-costruisci-manifesto.js:393-410, 498` |
| «Cosa:» tendina: «— scegli prima «Chi» —» · «— nessuna materia nel profilo —» · «— scegli —» + materie; aria-label «Cosa: materia» | `#mp-disc` | `mappai-bento-composizione.js:96`; `mappai-costruisci-manifesto.js:503, 1048-1061` |
| Tooltip (aiuto) «Per chi è questa mappa: una classe o un singolo allievo. Decide la cartella dove finiscono i materiali e la taratura con cui l'AI scrive.» / «La materia della classe scelta. Serve alla cartella (Mappe/classe/materia) e al taglio disciplinare del prompt.» | idem | `mappai-bento-composizione.js:94, 96` |

### 1.6 CREA — il bottone che conclude (modulo `azioni`, verde #41e6aa)
| etichetta | selettore | file:riga |
|---|---|---|
| «Genera materiali» (verde, icona `package`) — quando c'è almeno un output spuntato | `#mn-genera` | `mappai-costruisci-manifesto.js:1125`; `it_translations.js:442` |
| «Genera Mappa» (classe `mn-card--mappa`, icona `git-merge`) — quando NESSUN materiale è spuntato; title «Genera Mappa — nessun materiale spuntato: genera la sola mappa» | `#mn-genera.mn-card--mappa` | `mappai-costruisci-manifesto.js:1120-1144` |
| Spento (classe `mn-card--spento`, `disabled`) col motivo nel title/aria-label: «Genera materiali — Scegli prima CHI: una classe o un allievo» oppure «… — Scegli anche COSA: la materia della classe»; lo stesso motivo esce come toast al clic | `#mn-genera`, `#mn-bento.mn-manca-ctx` | `mappai-costruisci-manifesto.js:1090-1094, 1141-1147, 938-943` |
| Il bottone storico `#generate-btn` «Genera Mappa» e `#generate-materials-btn` «Genera materiali» (form) sono **nascosti** nella veste | — | `public/css/mappai-stile-manifesto.css:706-707`; markup `index.html:1008-1030` |

### 1.7 CREA — il bento delle OPZIONI (tutti visibili di default; fondo scuro = nascondibili SOLO in vista ridotta)
Composizione: `public/js/mappai-bento-composizione.js:530-642` (ordine: `output` · `preset` · `quiz` · `ns` · `src` · `multi` · `modalita` · `focus` · `macroaree` · `input` · `input-box` · `testo`). Verificato con Node (`MappAIBento.MODULI`): 18 moduli, 12 marcati nascondibili, nessuno nascosto finché `html.mappai-ridotta` è assente (`mappai-stile-manifesto.css:1261`).

| box (titolo ESATTO) | voci e etichette ESATTE | default | file:riga |
|---|---|---|---|
| «Output automatici» (icona `package-check`, 3 colonne) | spunte «Scelta multipla» · «Flashcard» · «Domande aperte» · «Sintesi» · «Voce naturale» | MC ✔, Flashcard ✘, Aperte ✔, Sintesi ✘, Voce ✘ (dal markup); poi il preset «Default» applicato UNA volta: `types: ['mc','open']`, `synthesis.audio:false` | composizione `:591-594`; render `:539-540, 571`; preset `mappai-material-pipeline.js:1200-1213` |
| «Preset» (icona `bookmark`) | tendina «— nessun preset —» + preset salvati (fra cui «Default»); bottoni «Applica» · «Salva» · «Elimina» | — | `mappai-costruisci-manifesto.js:446-449, 506-515`; nome «Default» `pipeline.js:1191` |
| «Quiz» (icona `activity`) | campo numero «Domande a ramo» (min 1 · max 10) | valore markup 5; preset Default `perBranch: 5` | `:523-524`; `pipeline.js:1207`; `bento-composizione.js:603-604` |
| «Fogli nodi» (icona `layout-grid`) | spunte «Scheda» · «Parole chiave» · «Da completare»; tendine «Livello» («tutti», L1…L5) · «Formato» («3×4» · «2×2» · «2×1») | spunte ✘; Livello «tutti»; Formato «2×2»; la spunta «Titolo» NON è montata → la pipeline ripiega su «titolo» | `:605-607`; `:441-445, 529-531`; `bento-composizione.js:163` |
| «Fonte & Sintesi» (icona `paperclip`) | spunte «Allega PDF» · «Catena perché» | Allega PDF ✔ SOLO con un allievo attivo (`_pdfDefault`), altrimenti ✘; Catena ✘ dal markup, ✔ dal preset Default (`causal: true`) | `:608-609`; `pipeline.js:1578-1584, 1210` |
| «Più set per angolo» (icona `layers`, riga intera, 3 colonne) | spunte «Domande aperte» · «Scelta multipla» (i generi) + 7 angoli «Definizione» · «Causa» · «Conseguenza» · «Esempio concreto» · «Confronto» · «Eccezione / limite» · «Applicazione / inferenza» | **tutte accese**; i 7 angoli si disabilitano se nessuno dei due generi è spunto | `:613-617`; `mappai-costruisci-manifesto.js:542-546, 565, 1179-1184`; `docs/HANDOFF.md:352-358` |
| «Modalità» (icona `book-open`, in colonna) | riga «MindMap» con segmento «Normale» · «Adattiva»; riga «Multi-pass» con «Single» · «Multi»; riga «Profondità» con «auto» · «manuale»; riga «Livello» tendina «L2 — essenziale» · «L3 — consigliato» · «L4 — dettagliato» · «L5 — massimo»; riga «Adatta linguaggio» con spunta «Adatta» + chip del contesto; riga «KG (A/B)» con «KG A» · «KG B» | Adattiva · Multi · **Profondità auto** (prima apertura, chiave `mappai_bento_default_v1`) · Livello L5 (markup `selected`) · Adatta ✔ solo se c'è un contesto attivo · KG **B** (storico) | markup `index.html:866-945`; default `mappai-costruisci-manifesto.js:812-843`; composizione `:618-636` |
| «FOCUS» (icona `settings`) | textarea placeholder «Su cosa deve concentrarsi l'AI?» (`#focus-input`); «Lenti» (`#lenses-panel`, **nascosto** nel markup `index.html:841-848`); `#discipline-picker` (Disciplina) | — | `index.html:825-829`; composizione `:642-646` |
| «Macro-aree» (riga intera) | «Definisci le macro-aree per organizzare lo studio:» · bottone «Aggiungi Manualmente» · campo «Es. Cause» · toggle «Genera Macro-Aree in automatico» (✔). In KG `setMode` riscrive: «Definisci i concetti chiave attorno a cui costruire le relazioni:» · «Aggiungi hub tematico» · «Genera altri hub tematici in automatico»; in MM dopo il primo `setMode`: «Inserisci le macro-aree tematiche che ti interessano:» · «Nuova macro-area» · «Genera altre macro-aree in automatico» | toggle auto ✔ | `index.html:791-823`; `mappai-ui-canvas.js:807-825`; composizione `:650-652` |
| «INPUT» (icona `sparkles`, testo bianco) | bottoni «URL» · «YouTube» · «Audio» · «Testo libero» (vedi 1.3) | — | composizione `:653-657` |
| (box senza titolo) elenco link/video/audio | le righe-fonte non-file con i loro campi | — | `:661-664` |
| (box senza titolo) «Testo libero (area di scrittura)» | la textarea del testo; cresce fino a 30 righe | — | `:672-673` |

Tooltip dei comandi del box «Modalità» (attributo `data-tip`, testo ESATTO):
- «Profondità»: «Fino a che livello di dettaglio MappAI genera i rami; il dettaglio più fine confluisce nelle descrizioni. «Automatica»: MappAI sceglie il livello dal tipo di scheda. Diverso da «Mostra fino a», che è solo un filtro di vista.» (`index.html:874`)
- «auto»: «Attiva o disattiva la scelta automatica della profondità. Se attiva, MappAI analizza la scheda e decide il livello giusto, e il menu sotto si disattiva.» · «manuale»: «Scegli tu il livello massimo dei rami, col menu qui sotto.» (`:889-897`)
- menu livello: «Livello massimo dei rami quando la profondità automatica è spenta: L2 essenziale, L3 consigliato, fino a L5 massimo.» (`:901`)
- riga verde sotto (quando auto è acceso): «MappAI sceglie la profondità dal tipo di scheda. Il menu è disattivato.» (`#auto-depth-hint`, `:908-911`)
- «Multi-Pass»: «OFF: genera tutta la mappa in una volta (più veloce, adatto a schede brevi). ON (consigliato): genera a fasi sequenziali per mappe grandi senza saturare la memoria.» (`:917`)
- «MindMap»: «Normale: costruzione classica della mappa. Adattiva (consigliata): analizza il tipo di scheda e adatta la profondità — meno rami inventati su schede povere di contenuto.» (`:927`)
- «KG (A/B)»: «Solo per Knowledge Graph. A: BERT Community (hub + comunità GraphRAG, relazioni più ricche). B: MappAI classico (single/multi-pass).» (`:937`)
- «Adatta» (title della riga): «Per fonti esterne (articoli, video) non scritte per la classe: le descrizioni vengono generate al livello del contesto attivo. Non serve per schede già tarate dal docente.» (`:832-834`)

### 1.8 CREA — i tre avvii in fondo e il link
| etichetta | selettore | file:riga |
|---|---|---|
| «Nuovo Progetto» (dizionario `btn_new_project`; il markup porta «Nuovo Grafo», ma `changeLanguage` gira al boot e scrive il dizionario) · «Apri Vault» · «Apri JSON» — icona sola, testo al passaggio; title = testo | `#qa-mappa-manuale` · `#qa-apri-vault` · `#qa-apri-json` in `#landing-quick-actions` | `public/index.html:1053-1068`; `it_translations.js:179-180, 521`; boot `mappai-storage-lang.js:864` |
| «Analisi (docente)» · title «Meta-analisi dei vault degli studenti — feedback e neurofeedback (docente)» | `#meta-analisi-docente` | `public/index.html:1073-1077` |

### 1.9 Il modale «Per chi è questa mappa?»
| etichetta | selettore | file:riga |
|---|---|---|
| Titolo «Per chi è questa mappa?» · sottotitolo «Questa scelta tara il linguaggio dell'AI e decide in quale cartella finisce la mappa. Resta ferma per tutta la generazione.» | overlay 440px (motore `overlay()` di live-classes) | `public/js/mappai-live-classes.js:1200-1201` |
| Tendina «Destinatario»: «Allievo: <nick>» (se c'è un allievo attivo) · «Generico (nessuna classe)» · le classi | `#gen-class` | `:1178-1187, 1202` |
| Tendina «Materia»: «— nessuna materia —» + materie della classe (o del profilo insegnante) | `#gen-disc` | `:1190-1197, 1203` |
| Bottoni «Annulla» · «Genera» (Invio = Genera; clic sul velo o ✕ = annulla) | `[data-gcancel]`, `[data-gok]` | `:1205-1214, 1234-1236` |

### 1.10 Il velo (overlay) e i toast della generazione
| etichetta | selettore | file:riga |
|---|---|---|
| Titolo «MappAI sta elaborando...» (markup) → dal primo secondo «MappAI sta lavorando... (Ns)» | `#loading-title` | `index.html:2787`; `mappai-ui-canvas.js:132, 143` |
| Descrizione di partenza «Interpretazione delle fonti con Gemini» | `#loading-desc` | `index.html:2788` |
| Fasi annunciate (MM multi-pass, default): «Inizializzazione elaborazione Mappa Mentale...» → «Google Studio: Analisi introduttiva dell'argomento principale...» → «Google Studio: Individuazione delle Macro-Categorie...» → «Mappa HD: espansione dei rami...» → «Mappa HD - Fase 3/3: Generazione Ramo "<ramo>" (Ramo i/N)...» → «Mappa HD - Fase 3.7: approfondimento ramo "<ramo>"...» | idem | `app.js:1498`; `mappai-mm-extraction.js:30, 54, 152, 806`; `mappai-generation-support.js:1899` |
| Fasi KG classico: «Google Studio: Analisi e formattazione Knowledge Graph...» (single) · «Fase 1/3 (HD): Estrazione dei Concetti e dei Super-Hub...» · «Fase 2/3 (HD): Mappatura e Connessione Relazionale...» · «Fase 3/3 (HD): Arricchimento dettagli (Batch i/N)...» (multi) | idem | `mappai-kg-extraction.js:98, 474, 537, 640` |
| Messaggi che ruotano ogni 4 s SOLO se nessuno passa un testo (es. «MappAI sta leggendo i tuoi documenti...», «Individuazione dei concetti centrali...») | `loadingMessagesConfig` | `mappai-ui-canvas.js:13-30, 112-131` |
| Bottone «Annulla» sul velo: compare SOLO se chi chiama passa `onAnnulla` — `startGeneration` NON lo passa → la generazione MM/KG **non ha un Annulla** | `#loading-cancel` | `mappai-ui-canvas.js:75-91, 99, 1498` |
| Toast pre-volo: «Inserisci un'API Key AI per continuare.» · «Inserisci il nome del nodo centrale per la mappa.» · «Il nome del nodo centrale non può essere fatto solo di simboli: diventa anche il nome della cartella.» · «Inserisci almeno una fonte testuale o un file valido per generare la mappa.» · «Errore caricamento URL: …» · «Errore di estrazione dal PDF: …» · «Errore di estrazione dal DOCX: …» · «Errore upload <tipo>: …» | toast | `app.js:1244, 1250, 1290, 1471, 1333, 1349, 1388, 1460` |
| Toast pre-volo pipeline: «Attiva almeno una sezione di output.» · «Inserisci un'API Key per continuare» · «Voce naturale disattivata: serve la chiave Google (Gemini). La sintesi sarà solo testo.» · «Con delle immagini caricate si generano i DOSSIER delle fonti: le altre fonti non entrano (generale separatamente).» | toast | `mappai-material-pipeline.js:1604-1610, 1625` |
| Lucchetto: «Sto generando «<nome>»: si riapre appena è pronta.» / «Generazione in corso: si riapre appena è pronta.» · «Pipeline occupata, riprova più tardi.» | toast warning | `mappai-generazione.js:151-157`; `pipeline.js:43-56` |
| Fine, se ti sei spostato: «Il progetto «<nome>» è pronto: lo trovi negli elenchi, marcato NUOVO.» (success) | toast | `mappai-ui-canvas.js:233-236` |
| Bollino «NUOVO» sulle righe degli elenchi di ELABORA/INSEGNA finché non apri il progetto | badge riga | `mappai-landing-teach.js:2483-2486`; `mappai-generazione.js:39-50, 107-140` |

---

## 2. Gesti → che cosa succede

| gesto | funzione | effetto visibile | su disco / localStorage |
|---|---|---|---|
| Apri l'app | boot inline → `MappAIManifesto.avvio` | landing vuota: marchio centrato + barra con Cabina e «Cosa». `html.mn-boot` tiene la landing invisibile finché il bento non è montato (tetto 1,5 s) | legge `mappai_stile_manifesto`, `mappai_vista_ridotta` (`index.html:74-90`) |
| Briciola «Cosa» › «Crea» | `cb.onCosa('build')` → `vaiA` → `MappAITeach.setMode('build')` | compare CREA (il mega-bento); nome «Crea» in barra | `mappai_landing_mode='build'` (`mappai-landing-teach.js:18`; `stile-manifesto.js:100-103, 205`) |
| Clic «Documenti» | `addSource('doc')` patchato da `apriSubitoIlFinder` → `input.click()` | il Finder si apre SUBITO; la riga-fonte è marcata `mn-src-file` e nascosta; il file compare nell'elenco `#mn-files` con il peso | niente su disco; `appState.sources` (`mappai-costruisci-manifesto.js:228-252`; CSS `:431`) |
| Scelta del file | `handleFileUpload` → `processSourceFile` | «Lettura file...» → «<nome> (<n> MB) pronto.»; PDF/TXT/MD/CSV/RTF letti sul computer; più file = più righe | `src.content` in memoria (`app.js:1140-1194, 1059-1094`) |
| Scelta di una foto (jpg/jpeg/png/heic/heif) | `leggiImmagineSorgente` → `MappAIVisione.nuovaScheda` | si apre la SCHEDA DI ANALISI (superficie di validazione, fuori area); confermata → «scheda confermata: farà un dossier»; MM/KG e tema si spengono | `src._scheda` in memoria (`app.js:1096-1137`) |
| Clic «URL»/«YouTube»/«Audio»/«Testo libero» | `addSource(tipo)` | compare una riga con il campo nel box dell'elenco (URL/YouTube) o nel box «Testo libero» (textarea); Audio apre il Finder | `appState.sources` |
| «Mappa Mentale» / «Knowledge Graph» | `setMode` | MM: campo «Tema Centrale:»; KG: slider «Numero di Concetti/Entità»; cambiano i testi del box «Macro-aree» | `#extraction-mode` (`mappai-ui-canvas.js:785-830`) |
| Spunte/tendine del bento | `change` → `sincronizzaBento` + `memorizza` | il bottone cambia faccia («Genera materiali» ⇄ «Genera Mappa»); gli angoli si spengono senza generi | `mappai_bento_scelte` (tutto tranne chi/cosa/classe/preset) (`mappai-costruisci-manifesto.js:1203-1234, 960-967`) |
| «Chi:» / «Cosa:» nel box giallo | `scriviContesto` → `MappAIClasses.setActive/SetActiveStudent/SetActiveDiscipline` | diventa il contesto ATTIVO dell'app (vale anche in ELABORA/INSEGNA); cambiare «Chi» azzera la materia se la nuova classe non la fa | `mappai_active_class`, `mappai_active_discipline` (`:975-1000`) |
| «Salva» preset | `Pipeline._savePreset` | prompt «Nome del preset» («Salva le opzioni correnti (senza la classe) per riusarle.») → «Preset salvato» | `mappai_material_presets` (`pipeline.js:1358-1365`) |
| Clic «Genera Mappa» (blu) | `startGeneration` (`app.js:1196`) | 1) lucchetto `mappaiOccupato` · 2) modale «Per chi è questa mappa?» (sempre) · 3) controlli chiave/tema/fonti · 4) velo DENTRO l'area di CREA (`MappAIGen.inizia` → `veloNellArea`) · 5) `MappAITune.congela()` · 6) estrazione · 7) `finally`: `MappAIGen.fine()`, `scongela()` · 8) `mappaPronta()`: se sei ancora in CREA passa al canvas, altrimenti toast «…marcato NUOVO» | a fine generazione `ensureProjectVault` crea `<root>/Mappe/<Classe>/<Materia>/<Titolo>/` (o `Mappe/Generico/<Titolo>/`, o cartella dell'allievo) con `index.yaml`, `links.json`, `Nodi/*.md`; omonimi → « · 02» (`app.js:1884`; `mappai-vault-io.js:130-175`; `main.js:1404-1460`) |
| Clic «Genera materiali» (verde) | `Pipeline._startFromModal` → `Pipeline.run(cfg)` (step A mappa → B quiz → C fogli → D sintesi → E catena) | stesse fasi + materiali; la pipeline **non** richiede il modale «Per chi» (ha già il box giallo, `_interno`) | manifesto `pipeline.json` a ogni passo; materiali in `Materiale Studio/` del vault (`pipeline.js:1597-1620`; `docs/HANDOFF.md:1275-1280`; `mappai-files-core.js:193, 361`) |
| Con una foto confermata + «Genera materiali» | `_startFromModal` ramo dossier | un DOSSIER per foto (vault col titolo della scheda, output fissi: aperte + flashcard + sintesi); le altre fonti NON entrano | `pipeline.js:1612-1660` |
| Durante la generazione: briciola «Cosa» | `specContesto` | «Crea» resta scegliibile; «Elabora» e «Insegna» grigie con lucchetto e motivo; i tre avvii in fondo spariscono (`html.mappai-genera`) | `style.css:1657`; `console-bento.js:911-917` |
| Durante la generazione: HOME / apri progetto / apri vault / importa… | `mappaiOccupato()` in 16 guardiani + `backToLanding` | toast col motivo, niente succede | `mappai-ui-canvas.js:278-284`; `pipeline.js:43-56` |
| «Nuovo Progetto» | `startEmptyMap` | mappa vuota sul canvas | — |
| «Apri Vault» | `loadMapVault` | finestra nativa di scelta cartella → carica la mappa | legge `index.yaml`/`links.json`/`Nodi/` |
| «Apri JSON» | `openJSONUploader` → `importGraph` | scelta di un `.json` esportato | `#landing-import accept=".json"` (`index.html:1033`) |

---

## 3. Limiti numerici e default

| che cosa | valore | file:riga |
|---|---|---|
| Formati accettati da «Documenti» | `.pdf,.txt,.csv,.md,.rtf,.docx,.jpg,.jpeg,.png,.heic,.heif` (input multiplo) | `app.js:984` |
| Letti sul computer (testo estratto prima dell'AI) | `.pdf` (PDF.js, tutte le pagine `app.js:535`), `.txt` `.md` `.csv` `.rtf` | `app.js:1077-1082` |
| `.docx` | estratto in `startGeneration` via `electronAPI.parseDocx` («solo nella versione Desktop») | `app.js:1376-1392` |
| Altri documenti non-PDF (es. `.rtf` già letto? no: rientra nel ramo testo) / Audio / Video | caricati al Cloud AI di Google (File API) al momento della generazione — «MappAI: Caricamento AUDIO nel Cloud AI...» | `app.js:1408-1463` |
| Audio: `accept="audio/*"` multiplo; Video: `accept="video/*"` (il bottone Video NON è in landing: vedi §6) | `app.js:970, 973` |
| Tetto di dimensione di un file | **nessun tetto nel renderer**; in `main.js:975-976` un cap di **50 MB** («file troppo grande (N MB)») su un handler di lettura file (DUBBIO: non ho verificato quale canale lo usa) | `main.js:975-976` |
| Contesto massimo mostrato dalla stima token (solo nel form storico, oggi non montata) | Google: flash 1M, pro 2M, gemma 8K; Infomaniak: Apertus 65.536, Gemma 100.000, Qwen 200.000, Kimi 256.000 | `app.js:851-879` |
| Tema centrale (MM) | obbligatorio; ripulito da estensione e simboli (`titoloProgetto`); solo simboli → toast e stop | `app.js:1248-1251, 1279-1294` |
| Titolo (KG) | facoltativo: focus → nome del primo file → vuoto | `app.js:1253-1268` |
| KG: concetti | slider **10–35**, default **20** | `index.html:954` |
| MM: profondità | menu L2…L5, markup `selected` = **L5**; `getGenDepth` legge `mappai_gen_depth` o 5; con «auto» acceso + verdetto del triage comanda `essentialDepth` (1–5) | `index.html:903-906`; `mappai-generation-support.js:2014-2030` |
| Default della prima apertura del bento | Adattiva · Multi · Profondità auto · Adatta (se c'è contesto) · KG B | `mappai-costruisci-manifesto.js:804-843` |
| Macro-aree L1 generate | tetto **3–7**, atomiche (schema L1) | `CLAUDE.md` §11 nota 7/6; prompt `prompts_config.json` (non riletto) |
| Quiz «Domande a ramo» | min 1 · max 10; default 5 (preset Default) | `mappai-costruisci-manifesto.js:524`; `pipeline.js:1207` |
| Fogli nodi «Formato» | 3×4 · **2×2** · 2×1 card per A4 | `:529-531` |
| Stima chiamate (formula) | A = rami+2 (o 3) · B = rami × (tipi singoli + tipi «per angolo» × n. angoli) · C = ceil(nodi/batch) solo con parole chiave AI · E = 0 (catena deterministica) | `mappai-pipeline-core.js:333-350` |
| Esempio misurato (HANDOFF) | su 4 rami con MC+aperte: `B 8` senza angoli · `B 40` con cinque · `B 56` con sette | `docs/HANDOFF.md:363-365` |
| Box elenco/testo libero | crescono fino a **30 righe**, poi scorrono | `bento-composizione.js:256, 273` |
| Indicatore dei lavori | compare dopo **600 ms**, non si riarma fra le fasi; `+N` se più lavori | `mappai-lavori.js:34, 152-161` |
| Velo | cronometro «(Ns)» ogni secondo; messaggi di compagnia ogni **4 s** | `mappai-ui-canvas.js:122-133` |
| Bollino NUOVO | al massimo **20** progetti in coda | `mappai-generazione.js:45` |
| Cartella radice dei file | `MappAI - file/` con sotto `Mappe/`, `Classi/`, `Allievi/`, `Attività di studio/`, `File condivisi/`, `Giardini/` (storica: `~/Documents/MappAI - Vault`) | `mappai-files-core.js:23-33`; `main.js:237` |

---

## 4. Percorso tipico del docente (storyboard degli screenshot)

1. **Apri MappAI** → landing vuota: marchio «MappAI» al centro (`#landing-brand`), in alto a sinistra il pallino «Cabina» (`#btn-cabina`), accanto la briciola «Cosa» (`nav.mn-percorso`); in basso a sinistra la linguetta viola del cassetto insegnai (`#insegnai-drawer-tab`).
2. **Clic su «Cosa»** → menu con «Crea» · «Elabora» · «Insegna» (`.mn-bric-menu__it`). Clic «Crea».
3. **CREA** → il marchio sparisce, in barra «Crea»; sotto: riga 1 = bottone «Documenti» (icona) + elenco vuoto (`#mn-files`); riga 2 = «Mappa Mentale»/«Knowledge Graph» + «Tema Centrale:»; riga 3 = box giallo «Chi:»/«Cosa:» + card verde spenta «Genera materiali» (title: «… — Scegli prima CHI: una classe o un allievo»); sotto, i box «Output automatici», «Preset», «Quiz», «Fogli nodi», «Fonte & Sintesi», «Più set per angolo», «Modalità», «FOCUS», «Macro-aree», «INPUT», l'elenco dei link, «Testo libero».
4. **Clic «Documenti»** (`#btn-src-doc`) → si apre subito il Finder; scegli il PDF → riga nell'elenco con nome e peso («Scheda.pdf · 1,2 MB») e il pallino «Togli il file».
5. **Scrivi il tema** in «Tema Centrale:» (`#root-node-name`, placeholder «Es. Rivoluzione Francese, Fotosintesi...»). (Per un KG: clic «Knowledge Graph» e regola lo slider 10–35.)
6. **Box giallo**: «Chi:» → scegli la classe (optgroup «Classi») o l'allievo («Allievi»); «Cosa:» → la materia. La card verde si accende e dice «Genera materiali» (con gli output del preset Default: Scelta multipla + Domande aperte + Catena perché) — oppure «Genera Mappa» (blu) se togli tutte le spunte in «Output automatici», «Fogli nodi», «Fonte & Sintesi».
7. *(facoltativo)* **«Modalità»**: lascia Adattiva · Multi · Profondità auto; **«Più set per angolo»**: togli gli angoli che non vuoi (ogni angolo = una generazione in più).
8. **Clic sulla card verde** → (solo «Genera Mappa») modale «Per chi è questa mappa?» già compilato → «Genera». Il velo scende DENTRO l'area di CREA: «MappAI sta lavorando... (12s)» con le fasi («Google Studio: Individuazione delle Macro-Categorie...», «Mappa HD - Fase 3/3: Generazione Ramo "Cause" (Ramo 1/5)...»). In barra, a destra, lo spinner col nome del progetto (`#mn-lavori`).
9. **Mentre lavora**: clic su «Cosa» → «Elabora» e «Insegna» grigie col lucchetto e il title «Sto generando «<tema>»: si riapre appena è pronta.»; i tre avvii in fondo sono spariti.
10. **Fine** → se sei rimasto in CREA l'app passa al canvas della mappa (titolo nella testata della sidebar); la cartella `Mappe/<Classe>/<Materia>/<Tema>/` è stata creata. Se eri altrove: toast «Il progetto «<tema>» è pronto: lo trovi negli elenchi, marcato NUOVO.» e il bollino «NUOVO» in ELABORA/INSEGNA.

---

## 5. Prerequisiti e stati

| pezzo | serve | come appare se manca |
|---|---|---|
| Qualunque generazione | una chiave AI (Cabina › «Impostazioni AI», campo `#gemini-api-key-input` `index.html:2920`; vista `id:'ai'` `mappai-cabina.js:44`) | toast «Inserisci un'API Key AI per continuare.» (`app.js:1244`); nel bento nessun lucchetto preventivo |
| Card «Genera materiali» accesa | «Chi» scelto; e «Cosa» se la classe ha materie proponibili (allievo: materia facoltativa) | card grigia `mn-card--spento`, `disabled`, title col motivo; clic → toast dello stesso motivo (`mappai-costruisci-manifesto.js:1076-1147`) |
| «Genera Mappa» (MM) | tema centrale non vuoto | toast «Inserisci il nome del nodo centrale per la mappa.» |
| Qualunque generazione | almeno una fonte con testo/file | toast «Inserisci almeno una fonte testuale o un file valido per generare la mappa.» |
| «Voce naturale» | chiave Google (Gemini) diretta | si disattiva da sola con toast (`pipeline.js:1608-1610`) |
| Riga «Adatta» | un contesto attivo (classe o allievo) | spunta disabilitata, «nessun contesto attivo» nel chip `#level-tune-ctx` (DUBBIO: testo esatto non letto; `mappai-costruisci-manifesto.js:828-831`) |
| «Chi»/«Cosa» popolati | classi create (Cabina/INSEGNA) e materie nel profilo insegnante | «— scegli —» e «— nessuna materia nel profilo —» (`:393, 1053`) |
| Il modale «Per chi è questa mappa?» | sempre (kill-switch acceso) tranne dentro la pipeline (`_interno`) | con `'0'` si chiede solo per classe con 2+ materie senza scelta (`live-classes.js:1118-1145`) |
| Una seconda generazione / aprire un'altra mappa | nessuna generazione in corso | toast col motivo (`MappAIGen.motivo()`), voci della briciola con lucchetto |
| Indicatore dei lavori | la barra con la Cabina (landing o testata di una console); sulla mappa nuda non c'è | `mappai-lavori.js:108-117` |
| Passaggio automatico al canvas a fine generazione | nessuna console visibile (`display`), cioè sei rimasto in CREA | altrimenti toast «…marcato NUOVO» (`mappai-ui-canvas.js:220-237`) |
| Lettura `.docx` | app desktop (Electron) | toast «Errore di estrazione dal DOCX: Estrazione DOCX supportata solo nella versione Desktop.» (`app.js:1384-1389`) |
| Cartella della mappa su disco | Electron + cartella madre scelta (`filesRootGet`); nodi > 0 | `ensureProjectVault` ritorna `null` senza errore (`mappai-vault-io.js:141-144, 163`) |
| Le foto come fonte | `mappai_visione` acceso + `MappAIVisioneCore.accetta(ext)` | con `'0'` la foto NON apre la scheda (DUBBIO: non ho letto che cosa fa allora) |

---

## 6. «NON ESISTE» (o non si vede di default)

1. **Il preventivo «Stima chiamate AI: ~N (A · B · C · D)» NON è a schermo in CREA.** La voce `mp-estimate` (e `mn-stima`, la stima token/costi) stanno nell'inventario ma **non in nessun modulo** della composizione: verificato con Node su `MappAIBento.MODULI` (fuori: `mp-class, mp-adapt-on, mp-adapt-scope, mp-quiz-on, mp-angle, mp-ns-on, mp-ns-title, mp-estimate, mn-solo-mappa, mn-stima, mn-apri-vault, mn-apri-json, mn-analisi, mn-selftest`). `Pipeline._reestimate` esce subito se `#mp-estimate` non c'è (`pipeline.js:1589`). Il `seFuori` della voce lo dichiara: «⚠️ si sceglie senza vedere quanto costa» (`bento-composizione.js:182`). I numeri «B 8 / B 40 / B 56» di HANDOFF:363 sono misurati nell'harness, non visti a schermo. ⇒ Nella guida NON descrivere un «circa N chiamate» visibile, a meno che l'Officina non l'abbia montato in `mappai_bento_layout` su quel computer.
2. **Nessuna tendina «Angolo»** nel box Quiz: voce `mp-angle` fuori composizione dal 19/8 (`bento-composizione.js:120`, HANDOFF:366-368).
3. **Nessun bottone «Genera solo la mappa»**: `mn-solo-mappa` fuori composizione; è la stessa card che cambia faccia (`bento-composizione.js:186-188`).
4. **Nessun bottone «Video»** in landing: `addSource('video')` esiste (`app.js:971-973`) ma nessun `#btn-src-video` nel markup (`index.html:675-729`) né voce nel bento. (YouTube sì.)
5. **Nessuna «Lenti di estrazione» a vista**: il pannello `#lenses-panel` e il suo bottone «▸ Personalizza extraction lenses» sono dentro un `div.hidden` (`index.html:841-848`); la voce `mn-lenti` è montata in FOCUS ma il pannello resta `hidden` (DUBBIO: non ho verificato se `spostaStrumenti` toglie `hidden`).
6. **Nessun elenco «Progetti salvati» in CREA**: eliminato il 3/8; le mappe si aprono da ELABORA («Progetti esistenti», da `getAllVaults` `mappai-landing-teach.js:236-243`) e da INSEGNA (`index.html:1039-1042`).
7. **Nessun modale «Genera materiali»** con la veste accesa: `#generate-materials-btn` nascosto (`mappai-stile-manifesto.css:706-707`); `Pipeline.openModal` vive solo per la veste spenta.
8. **Nessuna barra Crea/Elabora/Insegna** e **nessun «rail»**: `#landing-mode-bar` nascosto (CSS `:184, 293`), il rail è pensionato (`stile-manifesto.js:170-180`); l'unica via è la briciola «Cosa».
9. **Nessun «Annulla» sul velo** per la generazione MM/KG (`_veloAnnulla` senza `onAnnulla`, `mappai-ui-canvas.js:75-79`).
10. **Nessun drag & drop** dei file sulla landing: `grep dragover|'drop'` vuoto in `app.js`, `mappai-ui-canvas.js`, `mappai-stile-manifesto.js`, `mappai-costruisci-manifesto.js`, `index.html`.
11. **Nessun tetto di dimensione dichiarato** per i file nel renderer (vedi §3).
12. **La modalità studente (combo storica) è in pensione**: la combo SHIFT+CTRL+L,K,J,H accende la vista ridotta (`mappai-vista-ridotta.js:13-20`).
13. **«Consumi AI»** non è più in landing (vive in Cabina, `index.html:1078-1080`).
14. **La spunta «Titolo» dei fogli nodi** e le spunte-madre «Quiz e flashcard»/«Fogli nodi»/«Adatta alla classe» sono montate **nascoste** o non montate: non si vedono (`bento-composizione.js:548-556, 563-566`).
15. **Il KG «Community» (A)** non è il default: `mappai_kg_community_mode` spento; «KG A» nel segmento scrive il flag ma il default resta «B» (`app.js:1530-1540`; `mappai-costruisci-manifesto.js:821-823`).

---

## 7. Parole da NON usare con i docenti → come dirlo

| gergo nel codice | nella guida |
|---|---|
| vault | «la cartella della mappa» (dentro `Mappe/`) |
| landing | «la schermata iniziale» |
| veste manifesto / mega-bento / bento / box / modulo / card | «la schermata CREA» · «il riquadro …» (es. «il riquadro giallo», «il riquadro Output automatici») · «il bottone verde» |
| briciola / cascata / percorso | «il menu «Cosa» in alto» |
| console (ELABORA/INSEGNA) | «la sezione ELABORA», «la sezione INSEGNA» |
| Cabina | va bene «Cabina» (è l'etichetta a schermo): «il pallino in alto a sinistra» |
| kill-switch / flag / localStorage | non nominare; al più «impostazione» |
| contesto (attivo) / destinatario | «per chi è la mappa: la classe, l'allievo, o nessuno (Generico)» |
| KG / Knowledge Graph | tenere l'etichetta «Knowledge Graph» ma spiegarla: «una rete di concetti collegati, senza un tema al centro» |
| MM / MindMap | «Mappa Mentale» (etichetta a schermo) |
| L1 / L2…L5, macro-aree, rami | «i rami principali» (L1) · «quanto in profondità scende la mappa» (L2…L5) |
| multi-pass / single-pass | «a tappe (consigliato) oppure in un colpo solo» |
| triage / Adattiva | «Adattiva: legge prima che tipo di scheda è e regola la profondità» |
| deepening / Fase 3.7 / nodi `_D` | «l'approfondimento dei rami» (non spiegare le fasi) |
| cross-link | «collegamenti fra rami diversi» |
| pipeline (dei materiali) | «la generazione dei materiali» |
| step A/B/C/D/E, manifest, `pipeline.json` | «la mappa, poi i quiz, i fogli, la sintesi, la catena dei perché» |
| preset | «un insieme di scelte salvato con un nome» |
| angolo / «Più set per angolo» | etichetta a schermo «Più set per angolo»: «una versione delle domande per ogni taglio (definizione, causa…)» |
| scheda (visione) / dossier | «la scheda della foto» · «il dossier della fonte» |
| token / chiamate AI / stima | «quanto costa in richieste all'AI» (ma vedi §6.1: non si vede) |
| provider / Gemini / Infomaniak | «il servizio AI scelto in Cabina» |
| velo / overlay / spinner | «la schermata di attesa» · «la girandola in alto a destra» |
| lucchetto / `mappaiOccupato` | «mentre MappAI genera, alcune cose si bloccano e te lo dicono» |
| toast | «un avviso che compare un attimo» |
| appState / IPC / electronAPI / DOM / id | mai |
| Officina §7 / composizione | mai |
| combo / vista ridotta | mai (non-obiettivo) |

---

## 8. Dubbi (non verificati)

1. **Etichetta del riquadro «Adatta» senza contesto** («nessun contesto attivo»): citata nel commento `mappai-costruisci-manifesto.js:828-831`, non ho letto dove `#level-tune-ctx` viene scritto (`MappAITune`).
2. **Cap 50 MB** in `main.js:975-976`: non ho verificato quale canale IPC lo applica (potrebbe essere la lettura del PDF locale o un altro handler).
3. **`mn-lenti` in FOCUS**: il pannello `#lenses-panel` è `hidden` nel markup; non ho verificato se `spostaStrumenti` lo mostra quando lo monta nel box.
4. **«Nuovo Progetto» vs «Nuovo Grafo»**: il dizionario vince se `changeLanguage` gira al boot (`mappai-storage-lang.js:864`); da confermare a schermo.
5. **Titolo del box `ctx`** (giallo): `titolo: ''` → nessun titolo; a schermo ci sono solo «Chi:» e «Cosa:». Da confermare che l'icona `graduation-cap` si veda.
6. **Ordine visivo** dei 18 moduli: griglia 4 colonne; gli span (output 4, preset 1, quiz 1, ns 1, src 1, multi 4, modalita 1, focus 3, macroaree 4, input 1, input-box 3, testo 4) — non ho misurato in Electron.
7. **Override dell'Officina**: se su quel computer esiste `mappai_bento_layout` in localStorage, la composizione può essere diversa da quella del file (compreso `mp-estimate` montato). Prima degli screenshot: `localStorage.removeItem('mappai_bento_layout')` o verificare.
8. **Fonti `.rtf`/`.csv`/`.md` al momento della generazione**: `processSourceFile` le legge, ma in `startGeneration` il ramo `doc` non-PDF/TXT/DOCX le spedisce come `inline_data` base64 (`app.js:1394-1406`) invece del testo già estratto — non ho verificato se `src.content` venga usato altrove.
9. **Cosa succede a una foto con `mappai_visione='0'`**: non letto.
10. **Il nome del lavoro nello spinner** per «Genera Mappa» = `appState.rootNodeLabel` (ripiego): per un KG senza titolo sarebbe «MappAI sta lavorando» — da vedere.
11. **Le voci «+ Nuova materia» e la cascata «A chi?»/«Materia»** appaiono in ELABORA/INSEGNA, non in CREA: fuori area, non verificate a schermo.
