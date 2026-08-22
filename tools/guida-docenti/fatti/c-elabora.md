# ELABORA — la schermata dei materiali (fatti letti dal codice, 22/8/2026)

Tutto ciò che segue viene dal codice di `main`, con `file:riga`. Le etichette fra «…» sono
trascritte ESATTAMENTE come compaiono (le stringhe `t('chiave', 'fallback')` hanno il fallback
italiano come testo vivo: `it_translations.js` non le sovrascrive — verificato con grep su
`mm_salva_*`, `lt_del_type_*`, `lt_g_*`, `ec_n_*`, `qa_*`: nessuna chiave presente).
Stato acceso/spento: `docs/HANDOFF.md` §2 (righe 285-320) e §3 («ELABORA — console» 1121-1126,
«CREA UN DOCUMENTO» 1394-1440, «L'EDITOR» 744-807, «Sezioni» 529-545, «VOCE NATURALE» 969-1119).

File dell'area: `public/js/mappai-elabora-console.js` (2997 righe, la schermata),
`mappai-crea-quiz.js` (560, il percorso «Crea un documento → quiz»), `mappai-doc-editor.js`
(3933, l'editor), `mappai-branch-synthesis.js` (2083, sintesi e voce), `mappai-pipeline-core.js`
(nomi dei file), `mappai-files-core.js` (file dei set), `mappai-study-export-core.js` (archivio),
`mappai-clona-core.js` (copie), `mappai-landing-teach.js` (tabelle e classificatore dei file),
`mappai-elabora.js` (la vecchia pagina: oggi serve solo per la FONTE dentro la console).

---

## 1. Etichette ESATTE a schermo

### 1.1 Come si entra
| Etichetta | Dove / selettore | file:riga |
|---|---|---|
| «Crea» · «Elabora» · «Insegna» | i tre segmenti della landing: `#landing-mode-build`, `#landing-mode-elabora`, `#landing-mode-teach` (classe `.landing-mode-seg`, dentro `#landing-mode-bar`) | `public/index.html:630-646` |
| «Cosa» → voci «Crea» · «Elabora» · «Insegna» | il percorso (briciole) in cima alle console; «Elabora» e «Insegna» sono **bloccate** mentre si genera | `public/js/mappai-console-bento.js:913-916` |
| «Sto generando «<nome>»: si riapre appena è pronta.» / «Generazione in corso: si riapre appena è pronta.» | il motivo del blocco (tooltip/toast) | `public/js/mappai-generazione.js:154-158` |
| «Co-docente (Elabora)» — title «Elabora: analizza la scheda e arricchisci la mappa con citazioni dalla fonte» | bottone nel menu flottante della mappa `#floating-actions-menu` (in basso a sinistra, `#floating-actions-container`) | `public/index.html:1457-1459, 1491-1493` |
| «Elabora» — aiuto «Apre ELABORA sulla fonte e sui documenti di questa mappa.» | azione della console INSEGNA sulla mappa scelta | `public/js/mappai-landing-teach.js:2435, 2558` |

### 1.2 La console ELABORA (schema `_schemaV2`)
| Etichetta | Dove | file:riga |
|---|---|---|
| «Elabora» (titolo console, icona `wand-2`, taglia xl, layout `console`, a tutto schermo) | testata | `mappai-elabora-console.js:1206-1215` |
| «Progetti» (intestazione colonna sinistra, con contatore) | nav | `:1164` |
| «NUOVO» (badge sulla riga di un progetto generato in questa sessione e mai aperto) | nav | `:1157` |
| «Cerco i progetti…» · «— nessun progetto per questa classe e materia —» | nav, riga informativa | `:1174-1175` |
| «Fonte» (prima tabella) · colonna «Nome» | tabella | `:1193-1194` |
| «Testo» · «PDF N» (righe della fonte) | tabella Fonte | `:548, 556` |
| «Sintesi» · «Fogli dei nodi» · «Catena dei perché» · «Quiz» · «Flashcard» · «Altri materiali» · «File di lavoro» | intestazioni dei gruppi (le stesse di INSEGNA) | `mappai-landing-teach.js:2114-2140` |
| «Scelta Multipla» · «Vero o Falso» · «Quiz» · «Domande Aperte» · «Flashcard» · «Sintesi» · «Foglio dei nodi» · «Catena dei perché» (+ « - <nome copia>») | titoli delle righe-sorgente | `mappai-elabora-console.js:407-424` |
| «Fai una copia» (icona `copy`) · «Elimina» (icona `trash-2`, solo sulle copie) | comandi di riga in ELABORA | `mappai-landing-teach.js:2391-2405` |
| «Crea nuovo» (icona `plus`, primario) | bottone sotto le tabelle | `mappai-elabora-console.js:1240` |
| «Esci» (icona `x`) | fila comandi sopra la FONTE aperta | `:1229` |
| «nel vault» | sottotitolo delle voci-file nella colonna (v1, ancora emesso da `_vociDisco`) | `:302` |

### 1.3 Popup «Crea un documento» (`_popupCrea`, modale a lista)
| Etichetta | Note | file:riga |
|---|---|---|
| «Crea un documento» (titolo, icona `plus`) | | `:1820` |
| «Foglio dei nodi» — «Le card dei nodi, pronte da ritagliare. Si costruisce dalla mappa: non serve generarlo prima.» — badge «dalla mappa» | se non si può: «La mappa non ha nodi da stampare.» | `:158-165, 1816` |
| «Catena dei perché» — «I nessi causali della mappa messi in fila. Come il foglio dei nodi, si ricava dalla mappa al volo.» — badge «dalla mappa» | se non si può: «Questa mappa non dichiara nessi causali.» | `:166-173` |
| «Sintesi» — «Il testo disteso di un ramo o dell'intera mappa, scritto dall'AI con le citazioni alle fonti. Poi si rivede qui.» — badge «con l'AI» | se non si può: «Il generatore delle sintesi non è caricato.» / «La mappa non ha nodi da sintetizzare.» | `:188-198, 1814` |
| «Quiz, Domande aperte e Flashcard» — «Scelta multipla, Vero/Falso, domande aperte o flashcard: le scrivi tu o le genera l'AI.» — badge «tu o l'AI» | se non si può: «Il percorso «crea un quiz» non è caricato.» | `:203-207, 1815` |
| «Non disponibile.» · «Non riesco ad aprire questo documento.» | toast di ripiego | `:1827, 1831` |

### 1.4 Percorso quiz (`mappai-crea-quiz.js`)
| Passo | Etichette | file:riga |
|---|---|---|
| 1 — «Che tipo di quiz» (icona `list-checks`) | «Scelta multipla» — «Una domanda, tre risposte, una sola giusta.» · «Vero o Falso» — «Affermazioni da giudicare. Le più rapide da correggere in classe.» · «Domande aperte» — «Si risponde scrivendo: il foglio porta le righe e, per te, le tracce di correzione.» · «Flashcard» — «Carte domanda/risposta da ritagliare.» | `:49-59, 95` |
| 2 — titolo = il tipo scelto | «Le scrivo io» — «Si apre l'editor con un foglio vuoto: si aggiungono le domande una a una.» · «Le genera l'AI» — «Dalla mappa, con il linguaggio tarato sulla classe o sull'allievo attivo.» | `:114-117` |
| 2-bis — «Da che cosa» (SOLO Domande aperte e Flashcard, SOLO con le fonti iconografiche accese) | «Dalla mappa» — «Il materiale sono le macro-aree e le loro schede.» · «Da un'immagine» — «Una fonte iconografica letta sul tuo computer: la leggi, correggi il contesto, e le domande nascono da lì.» · «Dalla stessa immagine» (sotto: il titolo della scheda già corretta; compare solo se esiste) | `:137-175` |
| 3 — «Genera con l'AI» (icona `sparkles`) | gruppo «Che cosa chiedono» → campo «Su quale area» (scelta: «Tutta la mappa» + le macro-aree) — oppure, da immagine, gruppo «Da quale fonte» → dato «Titolo della fonte» + «Le domande nascono dal contesto e dalla descrizione che hai appena confermato.» | `:188-192, 230-243` |
| | gruppo «Angolazioni» (non per Flashcard): «Che cosa devono chiedere le domande. Ogni angolazione spuntata produce un FOGLIO SUO sullo stesso materiale: è il modo di preparare due versioni della stessa verifica. «Automatico» distribuisce i tipi di ragionamento dentro un foglio solo.» — 8 spunte su 2 colonne: «Automatico (misto)» · «Definizione» · «Causa» · «Conseguenza» · «Esempio concreto» · «Confronto» · «Eccezione / limite» · «Applicazione / inferenza» | `:244-256`; etichette in `mappai-study-session.js:111-113` |
| | stima sotto le spunte: «Un foglio · circa {c} chiamate all'AI» / «{f} fogli · circa {c} chiamate all'AI» / «Nessuna angolazione scelta: spuntane almeno una.» | `:262-266` |
| | gruppo «Quante e come graduate»: «Quante domande per area» (da immagine: «Quante domande») · solo Domande aperte: «Domande d'avvio (%)» con aiuto «Quante domande si possono risolvere con UN concetto solo, da chi ha studiato una parte della scheda. Le altre chiedono di collegare due o più concetti. Sul foglio degli allievi la differenza non si vede: compare solo sulle tue tracce di correzione.» | `:269-287` |
| | gruppo «Come si chiama il file»: «Nome (facoltativo)» con aiuto «Il nome del file lo compone MappAI — «{es}» — così le tabelle riconoscono il genere del materiale. Qui si scrive solo la parte che distingue questo foglio dagli altri.» ({es} = es. `Domande-aperte-Elettricità-verifica di ottobre.pdf`; segnaposto «verifica di ottobre») | `:290-297, 352-357` |
| | bottoni «Annulla» · «Genera» (icona `sparkles`) | `:307-308` |
| | senza spunte: toast «Spunta almeno un'angolazione: è quella che dice che cosa chiedere.» e il modale si riapre com'era | `:318-320` |
| «Le scrivo io» → «Come si chiama» | gruppo «Come si chiama il file», campo «Nome (facoltativo)» (stesso aiuto), bottoni «Annulla» · «Crea» (icona `plus`) | `:488-500` |
| Toast di esito | «✓ {titolo} — si corregge in ELABORA, si stampa da INSEGNA ({file})» · «✓ {titolo} — si corregge in ELABORA. Senza un vault sul disco il PDF non è stato scritto.» · «✓ {titolo} — si corregge in ELABORA. Il PDF non è stato scritto: {err}» · «✓ {n} fogli su {tot} — si correggono in ELABORA, si stampano da INSEGNA: {lista}» (+ « — non riuscite: {lista} ({err})») · «Nessun foglio generato ({n} tentativi). {err}» · «Generazione non riuscita.» · «✓ {titolo} — scrivi le domande, poi «Crea PDF» per stamparlo.» · «Apri prima una mappa.» · «Il generatore non è disponibile.» · «L'editor dei documenti non è caricato.» | `:404-523` |
| Rifiuti del motore | «Inserisci un'API Key per continuare» · «Questa mappa non ha aree da cui generare.» · «C'è già una copia con questo nome: eliminala in ELABORA o scegli un altro nome.» · «Questa mappa ha già un foglio di domande aperte: dai un nome a questo per distinguerlo (per esempio «recupero»).» · velo «Genero le domande…» | `mappai-material-pipeline.js:1855, 1896, 1919-1975` |

### 1.5 Generatore della sintesi (`openBranchSynthesisModal`, modale «vecchio stile» `.pm-*`)
| Etichetta | file:riga |
|---|---|
| «Sintesi materiale» (titolo) + nome mappa (sottotitolo); testo «L'AI scrive una sintesi narrativa del ramo scelto, con citazioni numerate che rimandano alle fonti originali della mappa.» | `mappai-branch-synthesis.js:356-365` |
| sezione «Ramo da sintetizzare» → `#branch-synthesis-select` con «Tutta la mappa (N nodi)» + le macro-aree | `:330, 366-370` |
| «Taratura AI · <contesto>» (spunta `#bs-tune-toggle`, SOLO se il profilo attivo è «speciale») — tooltip «Genera una versione adattata al profilo (registro, note) del contesto attivo. Il file avrà il suffisso [VERDE].» ⚠️ il suffisso NON viene più scritto (vedi §6) | `:336-342` |
| «Annulla» · «Genera Sintesi» (icona `zap`) | `:372-376` |
| velo: «Sintesi» · «Sintesi della mappa in corso…» · «Sintesi ramo» · «Scrivo la panoramica…» · «Panoramica» · «Sintesi di questo ramo non riuscita — riprova sul ramo singolo.» | `:460-592` |
| modale di risultato: «Sintesi: <ramo>» / «Sintesi della mappa: …» — bottoni «Chiudi» · «Stampa» · «Rivedi e salva» (icona `pencil-line`, porta nell'editor dentro la console) | `:620-680` |
| toast «L'editor dei documenti non è caricato.» (`bs_no_editor`) | `:1434-1442` |

### 1.6 L'anteprima di un documento nella tela (sola lettura)
| Etichetta | Dove | file:riga |
|---|---|---|
| «Modifica» — tip «Questo file è stato prodotto da un set ancora modificabile: aprilo nell'editor.» (quiz/flashcard con file) · tip «Apri questa sintesi nell'editor per rivederla.» (sintesi) | barra `.de-bar` sopra l'iframe | `mappai-elabora-console.js:1513-1530` |
| «Stampa» · «HTML» (solo file .html; tip «Scarica il documento come file unico, con la voce naturale incorporata: si manda all'allievo e funziona da solo.») · «Apri nel Finder» · «Esci» (tip «Chiudi il documento e torna alle tabelle.») | barra | `:1550-1587` |
| «mostrato in <carattere>» — tip «Il file ha ancora il carattere di quando è stato scritto: qui lo vedi con quello scelto in Cabina. Si allinea salvandolo dall'editor.» | nota accanto al titolo | `:1674-1686` |
| anteprima di un set d'archivio: «Modifica» (tip «Apri questo set nell'editor per correggerlo.») · «Stampa» · «Esci» | | `:1759-1771` |
| «Questo set non è più nella mappa.» · «Non riesco a costruire l'anteprima di questo set.» · «Non riesco ad aprire questo file» · «Apro…» · «Non riesco a stampare questo documento da qui: aprilo dalla cartella.» · «Non riesco ad aprire questo file dalla cartella.» · «Disponibile solo nell'app desktop.» | toast | `:1462-1580, 1719-1732` |
| «✓ HTML scaricato» · «✓ HTML scaricato — con la voce naturale incorporata» · «✓ HTML scaricato — senza voce naturale: l'…» | toast dell'«HTML» | `:1377-1403` |

### 1.7 L'editor — barra `.de-bar` (`_docBar`)
Ordine da sinistra a destra (`mappai-doc-editor.js:2479-2550`):
| Elemento | Etichetta / tooltip | file:riga |
|---|---|---|
| «‹ Documenti» | SOLO fuori dalla console (nella console non c'è) | `:2498-2499` |
| titolo + pallino «•» `#de-dirty` | il pallino si accende con modifiche non salvate | `:2500` |
| barra stile (solo Sintesi): «B» («Grassetto») · «I» («Corsivo») · «U» («Sottolineato») · `#de-color` («Colore del testo») · pipetta («Pipetta: prendi un colore dallo schermo») · «Colore salvato N» | `:2648-2660` |
| «Sezioni n/m» (`<details class="de-sez">`, solo sintesi di RAMO che ha quelle sezioni) — tip «Che cosa entra nel foglio oltre al testo: la catena dei perché e le note delle fonti.» — dentro: spunte «Catena dei perché» (tip «Il riquadro con i nessi causa-effetto del ramo, in coda al foglio. Spento, non compare né nell'HTML né nel PDF.») · «Note» (tip «Le fonti citate, in coda al foglio. Spente, spariscono anche i richiami [1] [2] dal testo — altrimenti resterebbero puntati a niente.») | `:2590-2632` |
| tendina carattere `.de-font` — «Come l'app · <carattere>» + «Space Mono» · «TM Sans» · «TM Alt» · «Atkinson Hyperlegible» — tip «Il carattere di QUESTO documento. A differenza della dimensione dell'anteprima, finisce anche nel foglio stampato e nel PDF.» (aria «Carattere del documento») | `:2562-2577`; nomi in `mappai-font-core.js:81,108,125,141` |
| zoom «−» · «100%» · «+» — tip «Quanto è grande il foglio a schermo. Non cambia nulla di quello che esce dalla stampante.»; aria «Rimpicciolisci l'anteprima» / «Torna alla dimensione normale» / «Ingrandisci l'anteprima» | `:2633-2645` |
| «Annulla» (icona `undo-2`; tip «Annulla l'ultima operazione») | `:2511` |
| «Voce» (icona `headphones`; SOLO Sintesi; tip «Registra la lettura ad alta voce con la voce naturale di Google: resta dentro l'HTML e nel PDF. Utile agli allievi dislessici.») | `:2512-2516` |
| «HTML» (icona `file-code-2`; Sintesi e Catena; tip «Scarica la pagina HTML: conserva il lettore audio» / Catena: «Scarica la pagina HTML: dentro c'è anche la modalità esercizio») | `:2517-2522` |
| «Stampa» (icona `printer`; tip «Apre la stampa su una copia effimera: non lascia file nella cartella») | `:2527-2529` |
| «Crea PDF» (icona `file-down`; tip «Scrive il PDF nella cartella della mappa: da lì compare fra i materiali di INSEGNA») | `:2535-2537` |
| `#de-exit` (primario): «Esci» (icona `log-out`) oppure «Salva ed Esci» (icona `save`) — tip «Torna indietro: non c'è niente da salvare» / «Salva il documento e torna indietro. Il PDF per INSEGNA lo fa «Crea PDF»» | `:2541-2545, 2687-2689` |

### 1.8 Modali e toast dell'editor
| Etichetta | Quando | file:riga |
|---|---|---|
| «Che nome dai a questo materiale?» — «La prima parte del nome la mette MappAI: dice che materiale è e di quale mappa. Tu aggiungi come lo riconoscerai — puoi anche lasciare vuoto.» — segnaposto «ripasso finale, verifica 2B, …» — «Annulla» · «Salva e stampa» — sotto il campo il nome risultante, e «un file con questo nome c'è già» in ambra | «Crea PDF» su un documento senza nome di copia | `:1565-1605` |
| «Un file con questo nome c'è già» — ««{n}» è già nella cartella della mappa. Posso sovrascriverlo — quello che c'è ora si perde — oppure salvare accanto come «{a}».» — «Annulla» · «Salva accanto» · «Sovrascrivi» (variante senza alternativa: «…ci sono già troppe varianti dello stesso nome per aggiungerne un'altra…») | collisione | `:1610-1650` |
| «Questa mappa non ha ancora una cartella: stampo senza salvare il file.» · «Fuori dall'app desktop non posso salvare il file: stampo e basta.» | niente vault / browser | `:1744-1745` |
| «✓ {n} salvato in Materiale Studio» (+ « — il testo è cambiato: la voce naturale va rigenerata») · «Salvataggio nel vault non riuscito» | dopo «Crea PDF» | `:1784-1812` |
| «Il documento ha dei problemi:» … «Stampare comunque?» / «Stampa comunque» | Stampa e Crea PDF con campi vuoti | `:1857-1870` |
| «Stampa il quiz» — «Il foglio soluzioni va in una pagina a parte, in coda.» — «Con soluzioni» («Copia del docente: domande + foglio soluzioni.») · «Senza soluzioni» («Copia per gli allievi: solo le domande.») | Stampa di un quiz | `:1938-1942` |
| «Stampa le domande aperte» — «Le tracce di correzione vanno in una pagina a parte, in coda.» — «Con le tracce» («Copia del docente: domande + tracce di correzione.») · «Senza tracce» («Copia per gli allievi: solo le domande e le righe per scrivere.») | Stampa domande aperte | `:1953-1957` |
| «Foglio flashcard» — «A4 verticale, 4 carte per foglio, con linee di taglio.» — spunta «Pagina retro separata (stampa fronte/retro)» («Senza: domanda sopra e risposta sotto, con la piega a metà carta.») | Stampa flashcard | `:1969-1972` |
| «Popup bloccato» | la finestra di stampa non si apre | `:1932` |
| «✓ Documento salvato» (+ «N domande» / «N carte») · «✓ Sintesi salvata — il testo rivisto vale per stampa, PDF e condivisione» · «✓ Sintesi salvata nella cartella della mappa» · «✓ Sintesi salvata — il testo è cambiato: la voce naturale va rigenerata» · «✓ Foglio nodi salvato — {n} card» · «✓ Catena salvata — {n} nessi, validi per stampa, PDF e vault» | Salva ed Esci per genere | `:1181, 1263, 1339, 1408-1409, 849, 646` |
| «Salvataggio non riuscito: resto nel documento.» · «Salvataggio non riuscito» · «Archivio dei documenti non disponibile.» | | `:932, 1177, 1157` |
| «La mappa aperta è cambiata: questo documento appartiene a un'…» | si salva con un'altra mappa sotto | `:617, 840, 1242, 1307` |
| «Questo set non è più nella mappa (eliminato o mappa ricaricata). Vuoi aggiungerlo di nuovo?» / «Aggiungilo» | | `:1253-1254` |
| «Ci sono modifiche non salvate. Uscire comunque?» / «Esci senza salvare» | «‹ Documenti» fuori console | `:881-882` |
| «Niente da annullare» · «Annullato: <operazione>» | Annulla | `:964, 978` |
| «Salvi le modifiche?» — «Hai modifiche non salvate in «<documento>».» — «Torna indietro» · «Esci senza salvare» · «Salva» | ESC / cambio voce nella console | `mappai-modal.js:1069-1081` |

### 1.9 Editor per genere (le etichette dentro il foglio)
- **Quiz / Vero-Falso / Flashcard**: «Domanda N», «Sposta su», «Sposta giù», «Aggiungi qui sotto», «Elimina», «Scrivi qui la domanda…», «Segna come risposta corretta» / «Risposta corretta», «Eliminare la domanda» / «Elimina», «Titolo del documento»; sulle carte il contatore con tip «Caratteri della domanda e della risposta rispetto al massimo che entra nella carta stampata» (`mappai-doc-editor.js:1019-1021, 2745, 2795-2847`).
- **Domande aperte**: «Aree» (max 2 → «Al massimo due aree per domanda: togline una.»; «La mappa non dichiara macro-aree.»), livello «Avvio» / «Ponte» (tip «Si risponde con UN concetto solo: la può affrontare anche chi ha studiato una parte della scheda…» / «Richiede di collegare due o più concetti, o di applicarli a un caso nuovo.»), «Righe» (tip «Quante righe lo studente ha per rispondere: 3 breve, 5 spiegazione, 8 confronto.»), «Traccia» (segnaposto «Che cosa deve contenere una risposta corretta (compare solo nella tua copia)…»), nota «Le tracce di correzione non compaiono nella copia degli allievi: le stampi solo tu, in coda al foglio. Le righe sono lo spazio vero che lo studente avrà per rispondere.», «+ domanda» (`:2767-2830`).
- **Foglio dei nodi**: «Formato foglio» con tre bottoni «3 × 4» («12 per foglio · solo titolo») · «2 × 2» («4 per foglio») · «2 × 1» («2 per foglio»); «Profondità» → «Tutti i livelli» / «Fino al livello N»; spunta «Quadretti 5 mm»; «A tutte le card» → «Solo titolo» («il titolo torna al centro della card») · «Titolo + spazio» («righe vuote da riempire a mano») · «Titolo + parole chiave» («fino a 7 parole, una per riga») · «Titolo + descrizione» («il testo della scheda, giustificato»); «Parole chiave con AI» (tip «Riempie le card «parole chiave» ancora vuote…»); sottotitolo «A4 orizzontale, card da ritagliare»; «+» con tip «Aggiungi un contenuto sotto il titolo» (`:2966-3113`). Toast: «Con 3 × 4 entra solo il titolo: {n} card hanno perso il contenuto sotto (torna a 2 × 2 per riaverlo).», «Sette parole chiave sono il massimo che entra nella card.», «Togliere questa card dal foglio? Il nodo resta nella mappa.» / «Togli la card», «Card ripristinate: {n}.», «Serve la chiave AI: le parole chiave si possono comunque scrivere a mano.», «Genero le parole chiave…», «Parole chiave riempite su {n} card — controllale prima di stampare.», «Foglio riallineato alla mappa: {a} card nuove, {r} rimosse.», stampa: «{n} card hanno più testo di quanto entra nella card stampata: uscirebbero tagliate.» «Card:» «Stampare comunque?» / «Stampa comunque» (`:507-870`).
- **Catena dei perché**: sezioni «In generale» · «Ponti tra i rami»; «Nessun nesso causa-effetto trovato: servono verbi significativi sui link o connettivi (perché, quindi…) nelle descrizioni.»; «La catena non ha più nessi: aggiungine almeno uno prima di salvare.» (`:552-629`).
- **Sintesi**: «Nessuna sintesi disponibile: generane una dal menu «Materiali di studio».», «La sintesi non contiene testo editabile.», «La sintesi non ha più testo: aggiungi almeno un paragrafo prima di salvare.», «Questa è la copia con la voce, da consegnare: si corregge la sintesi normale e poi si rigenera la voce.», «Non riesco a leggere questo documento dalla cartella della mappa.», «Seleziona prima il testo da formattare», «Pipetta non disponibile in questa finestra» (`:341-414, 1104-1128, 1313`).

### 1.10 Voce naturale (bottone «Voce» → `generateSynthesisAudio`)
| Etichetta | file:riga |
|---|---|
| «Salva prima le modifiche: la voce naturale registra il testo com'è adesso.» · «Genera prima una sintesi» · «La voce naturale richiede l'app desktop…» · «Serve la chiave API Google (Gemini) per la voce naturale» · «Nessun testo da leggere» | `mappai-branch-synthesis.js:1960-1967, 1750-1754` |
| preavviso «Registrare la voce naturale?» (icona `headphones`): «{n} blocchi di testo da leggere» oppure «{n} blocchi da leggere — {p} già pronti dalla volta scorsa» · «circa {n} chiamate all'AI» · «circa {n} minuti, per il limite di {r} chiamate al minuto» + «Una sintesi di tutta la mappa è lunga: se ti serve solo una parte, registra la sintesi di un RAMO. Puoi annullare mentre registra, e i blocchi già fatti non si ripagano finché non chiudi l'app.» — bottone «Registra» | `:1917-1956` |
| velo «Voce naturale» · «Genero audio N/M» · «attendo {s}s (limite del provider)» · «limite raggiunto, riprendo fra {s}s» · «Comprimo l'…» · bottone «Annulla» → «Sto annullando…» · «Registrazione annullata» | `:1640-1703, 1842`; `mappai-ui-canvas.js:94` |
| «Hai esaurito la quota GIORNALIERA del modello vocale. Oggi non si può registrare: riprova domani, oppure cambia modello nelle impostazioni (ogni modello ha un contatore suo).» · «Il provider continua a rifiutare le richieste: riprova fra qualche minuto.» · «Risposta senza audio (modello TTS non disponibile con questa chiave?)» · «Audio non generato» · «Voce registrata, ma {n} blocchi non sono stati letti (di solito titoli di una parola sola): » | `:1695-1706, 1837, 1995, 2015` |
| «✓ Voce registrata — copia parlante scritta: <nome file>» · «Voce registrata, ma non ho una cartella dove scrivere la copia parlante: resta nel documento aperto.» · «Voce registrata, ma la copia parlante non è stata scritta: …» · «Il generatore della voce naturale non è caricato.» | `mappai-doc-editor.js:2110, 2171, 2192, 2197` |
| «Voce naturale pronta» — «Scegli come consegnare l'audio. L'HTML con audio incorporato si ascolta anche offline: l'allievo lo salva sul telefono.» — «Condividi sintesi + audio (QR)» (solo se Live c'è) · «Scarica HTML + audio» · «Scarica solo audio (WAV)» — «Il testo è cambiato dopo la registrazione: rigenera la voce naturale.» · «✓ Audio scaricato» · «✓ HTML con audio scaricato» | `mappai-branch-synthesis.js:1870-1900` |
| dall'editor, «HTML»: «✓ HTML scaricato — con la voce naturale incorporata» · «✓ HTML scaricato — il lettore audio resta funzionante» · «HTML senza voce naturale: il testo è cambiato dopo la registrazione, va rigenerata.» | `mappai-doc-editor.js:2221-2235` |

### 1.11 Copie ed eliminazioni
| Etichetta | file:riga |
|---|---|
| «Fai una copia» (titolo, icona `copy`) — campo «Nome della copia — distingue anche il file nella cartella» (proposto: «2», «3», … il primo numero libero) — bottone «Crea la copia» | `mappai-elabora-console.js:743-747`; `mappai-clona-core.js:83-90` |
| «Esiste già una copia con questo nome.» · «Serve un nome: è ciò che distingue la copia dall'originale.» · «Questo documento non si può ancora copiare.» · «Questo documento non è più nella mappa.» · «La copia non è disponibile qui.» · «Non riesco a scrivere la copia.» · «La sorgente di questo documento non è più leggibile.» · «Copia creata: <Genere - nome>» | `:725-864` |
| «Questo è il documento originale della mappa: si eliminano le copie, non lui.» · «Conferma eliminazione» — «Per eliminare scrivi qui sotto il nome esatto:» “<nome>” — «Annulla» · «Elimina» — «Il testo non corrisponde: eliminazione annullata.» — «Spostato nel Cestino.» / «Copia eliminata.» / «Non è stato possibile eliminare il file» / «La conferma di eliminazione non è disponibile qui.» | `:2693-2723, 874-895`; `mappai-landing-teach.js:765-781` |

### 1.12 Analisi della fonte (dossier iconografico, dentro ELABORA)
«Analisi della fonte» (tipo di riga), «Apri la scheda di analisi» (sulla foto in anteprima), «Questo documento non porta con sé la scheda: si può stampare, ma non correggere.», «Rigenerare i materiali?» — «Domande aperte, flashcard e sintesi si RIFANNO dalla scheda corretta e sovrascrivono i file attuali nel vault. Servono alcune chiamate all'AI e qualche minuto.» — «Annulla» · «Rigenera»; «Materiali rigenerati dalla scheda corretta.», «Scheda corretta: archivio e PDF aggiornati.», «Scheda corretta e salvata in archivio.», «Scheda salvata, ma il PDF non si è rifatto: …», «Salvataggio non riuscito: archivio pieno?» (`mappai-elabora-console.js:684, 1906, 2434-2518`). È l'UNICO posto dell'area in cui esiste un «Rigenera».

---

## 2. Gesti → che cosa succede

### 2.1 Entrare e scegliere il progetto
- Clic su `#landing-mode-elabora` → `MappAITeach.setMode('elabora')` (`index.html:637`) → `MappAIElabora.open()` (`mappai-landing-teach.js:117`) → `MappAIElaboraConsole.open()` (`mappai-elabora.js:94-96`; `_bentoApp()` risponde sempre sì, `mappai-elabora-console.js:46-52`). La console si apre **vuota**: nessun documento, colonna «Progetti» a sinistra (`:1852-1868`, `:1247-1250`).
- Dalla mappa: «Co-docente (Elabora)» → `openFromMap()` nasconde `#map-view`, mostra la landing e chiama `setMode('elabora')` (`mappai-elabora.js:1964-1971`).
- Clic su un progetto nella colonna → `_cambiaMappa(m)`: azzera l'editor, allinea classe e materia alla cartella del progetto (`MappAITeach.allineaContestoA`), carica la mappa con `MappAITeach.apriMappa`, rilegge i file di `Materiale Studio/` (`:2118-2146`, `:2906-2925`). Il badge «NUOVO» sparisce al primo clic (`:2915`).
- L'elenco dei progetti è filtrato per classe+materia del percorso in alto (`mappeDelContesto`, `:2147-2150`); cambiare classe o materia svuota tutto e rilegge (`:1934-1975`).

### 2.2 Le tabelle
- Prima tabella «Fonte»: «Testo» + un rigo per ogni PDF caricato (`:543-556`). Clic → la fonte si apre NELLA tela, con i suoi comandi sopra (evidenziazione, domande scheda… eseguiti da `mappai-elabora.js`) e «Esci» (`:1216-1231`, `:2300-2310`).
- Poi i gruppi per genere da `MappAITeach.tabelleMateriali(lista, false, 'elabora')` (`:1188-1203`; `mappai-landing-teach.js:2218-2419`). In ELABORA ogni riga è la **sorgente** (set modificabile, voce d'archivio, file .html della sintesi); quando esiste anche il file prodotto, la riga li fonde (`_materiali`, `:570-597`). I `.json` dei set e `Sintesi-voce-*.html` **non** si elencano (`:258-272`).
- Clic su una riga → `_apriDocV2`: anteprima nella tela (iframe `srcdoc` per gli HTML, visore PDF per i PDF) con barra «Modifica · Stampa · HTML · Apri nel Finder · Esci» (`:2603-2680`, `:1443-1600`). «Modifica» → editor al posto dell'anteprima (`:2405-2425`). ESC/«Esci» dall'editor → torna all'anteprima **rinfrescata** (file riletto); da lì un altro ESC → elenco (`:2547-2566`, `:2881-2890`). I documenti nati da «Crea nuovo» e le sintesi non hanno anteprima: un ESC solo ed esci (`_haAnteprima`, `:2547-2551`).
- Gruppi piegati: memoria in `sessionStorage` (`_salvaChiusi`, `:977`).

### 2.3 «Crea nuovo» → «Crea un documento»
- «Foglio dei nodi» / «Catena dei perché» → editor diretto (`DEd().openNodeSheet()` / `openCausal()`), niente AI, niente file finché non si preme «Crea PDF» (`:1828-1832`, `mappai-doc-editor.js:491-541`). Il foglio rivisto si salva nel PROGETTO (`_leggiDoc(s.db,'nodeSheet')`, `causalDoc`) (`:497, 546`).
- «Sintesi» → `openBranchSynthesisModal()` → «Genera Sintesi» → chiamata AI (template `BRANCH_SYNTHESIS`, temperatura 0,4; tutta la mappa = una passata per ramo + panoramica) → modale di risultato, già **archiviata** in `localStorage` (`_saveSynthesisDoc`, `mappai-branch-synthesis.js:621`) ma **senza file** → «Rivedi e salva» apre l'editor nella console (`:651-680`).
- «Quiz, Domande aperte e Flashcard» → `MappAICreaQuiz.apri()` (sopra, §1.4). «Le genera l'AI» → `Pipeline.generaSet` una volta per angolazione, in sequenza (`mappai-crea-quiz.js:374-411`); ogni set va in `appState.db.studySets`, nel progetto (localStorage) e nel vault; il PDF viene scritto subito in `Materiale Studio/` (toast «si stampa da INSEGNA ({file})»); il **primo** foglio si apre nell'editor (`:459-463`). Le domande aperte non sono un set: vanno nell'archivio `MappAIStudyDocs` come `quizpaper` con le domande incorporate nell'HTML (`mappai-doc-editor.js:216-228`). «Le scrivo io» → set vuoto (MC: 1 domanda con 3 opzioni; V/F: opzioni «Vero»/«Falso»; flashcard: 1 carta) salvato in progetto + vault (`mappai-crea-quiz.js:525-549`), oppure foglio di domande aperte vuoto in archivio (`Pipeline.nuovoFoglioAperte`, `mappai-material-pipeline.js:1868-1917`).

### 2.4 I tre gesti dell'editor (HANDOFF:744-758, codice `mappai-doc-editor.js`)
| Gesto | Funzione | Effetto | Su disco / memoria |
|---|---|---|---|
| «Salva ed Esci» | `esci()` → `_salvaDoveVive()` → `save()` (`:927-945`, `:1720-1731`) | salva la sorgente; non chiede nome; non contesta campi vuoti | quiz/flash: set nel progetto (`StorageManager.saveCurrentProject`) e nel vault come `set-<id>.json` (`mappai-files-core.js:387-390`); foglio nodi/catena: nel progetto; domande aperte/sintesi d'archivio: `localStorage['mappai_saved_documents']`; sintesi aperta DA un file: riscrive **quel** file (`_origine()`, `:1437-1439`, `:1382-1411`) |
| «Stampa» | `print()` → `_problemiAccettati` → `_stampaOra(null)` (`:1841-1852`) | contesta i campi vuoti; apre la stampa di una copia effimera (quiz/aperte/sintesi/catena: finestra; foglio nodi/flashcard: jsPDF → dialogo di sistema) | **nessun file** |
| «Crea PDF» | `creaPdf()` → `_problemiAccettati` → `_salvaConNome()` (`:947-954`, `:1740-1815`) | chiede il nome (solo se il documento non ha già un nome di copia), salva la sorgente, controlla le collisioni, scrive | `Materiale Studio/<nome>` via `electronAPI.saveVaultFile`; nodesheet = jsPDF; catena/quiz/flash/aperte = `htmlToPdf` (ripiego `.html` se il motore manca, `:1705-1714`); sintesi = `.html`. Poi `MappAIVaults.segnala('file-scritto')` → INSEGNA lo vede |
| «Voce» | `voceNaturale()` (`:2107-2138`) | registra con Google TTS, deposita il blob nel documento, scrive la copia parlante | `Materiale Studio/Sintesi-voce-<Mappa>[ - Carattere].html` (sovrascrive a ogni ri-registrazione, `:2160-2195`); cache clip in `<userData>/tts-cache/` (HANDOFF:1097-1113) |
| «HTML» | `exportHtml()` (`:2203`) | scarica il documento come file unico (con audio se c'è) | cartella Download del sistema |
| «Sezioni» | `mostraSezione(campo, on)` (`:117-125`) | accende/spegne «Catena dei perché» e «Note» in coda; vale per HTML, PDF, stampa; segna il documento da salvare | nel documento (`_syn.data.mostraCausale/mostraNote`) |
| tendina carattere | `setFont(id)` (`:127-134`) | carattere di QUESTO documento, finisce nel PDF e nel nome del file (` - TM Sans`) | nel documento |
| «−»/«+» | `zoomStep` (`:83-90`) | solo a schermo | `localStorage['mappai_doc_zoom_<genere>']` |
| ESC | motore modali → `__esc` → console (`mappai-modal.js:853-858`; `mappai-elabora-console.js:2881-2890`) | editor → anteprima (o elenco se non c'è anteprima) → elenco; con modifiche: «Salvi le modifiche?». Senza documento aperto ESC NON chiude la console | — |
| «Fai una copia» | `_clonaV2` (`:723-790`) | set → duplicato in memoria + progetto; sintesi → file riletto e riscritto col nome nuovo (mai sopra uno esistente); foglio nodi/catena → documento di progetto; domande aperte → voce d'archivio | come sopra |
| «Elimina» (solo copie) | `_delV2` / `_elCopia` (`:2684-2727`, `:871-900`) | conferma a digitazione del nome; file → **Cestino** del sistema (`deleteVaultFile`) | — |

### 2.5 Convenzione dei nomi (`buildFileName`, `mappai-pipeline-core.js:487-517`)
`<Prefisso>-<Mappa>[-<dettaglio>][-<nome del docente>][ - <Carattere>].<est>` — i pezzi uniti da «-», il carattere staccato da « - ».
| genere | prefisso | est | dettaglio |
|---|---|---|---|
| Quiz a scelta multipla | `Quiz-MC` | .pdf | — |
| Vero/Falso | `Quiz-VF` | .pdf | — |
| Flashcard | `Flashcard` | .pdf | — |
| Domande aperte | `Domande-aperte` | .pdf | — (l'angolazione va nel «nome»: `-causa`, `-misto`…) |
| Foglio dei nodi | `Foglio-nodi` | .pdf | il contenuto delle card: `title` / `keywords` / `card` / `summary` / `misto` (`mappai-doc-editor.js:1476-1483`) |
| Sintesi (editabile) | `Sintesi` | .html | il ramo (vuoto per tutta la mappa) |
| Sintesi con voce | `Sintesi-voce` | .html | idem |
| Catena dei perché | `Catena-dei-perche` | .pdf | — |
| Analisi della fonte | `Analisi-fonte` | .pdf | — |
| (da altre aree) dossier `Dossier`, audio `Sintesi-audio.mp3`, mappa `MM`/`KG` | | | `:414-445` |
File di set: `set-<id>.json` (`mappai-files-core.js:387-390`). Collisioni: «Salva accanto» produce « · 02» … « · 99» (`nomeLibero`, `mappai-pipeline-core.js:536-547`).
Esempi VERI dal vault di prova (`…/Mappe/4R/Scienze/Elettricità - MM/Materiale Studio/`): `Quiz-MC-Elettricità - TestMe Sans.pdf`, `Quiz-MC-Elettricità-causa - TestMe Sans.pdf`, `Quiz-VF-Elettricità - TestMe Sans.pdf`, `Domande-aperte-Elettricità-applicazione.pdf`, `Domande-aperte-Elettricità-causa - TestMe Sans.pdf`, `Flashcard-Elettricità.pdf`, `Foglio-nodi-Elettricità-card.pdf`, `Foglio-nodi-Elettricità-keywords.pdf`, `Foglio-nodi-Elettricità-title.pdf`, `Sintesi-Elettricità - TestMe Sans.html`, `set-set_1787003034580_p9oys.json`. (Non di ELABORA: `MM-Elettricità-00.pdf`, `Studio-Elettricità-dag.pdf`, `Focus-Resistenza Elettrica-parentela.pdf` — escono dalla mappa e dalla Vista studio, `mappai-studio-view.js:1089-1096`.)

### 2.6 Archivio ↔ disco
- Archivio `MappAIStudyDocs`: `localStorage['mappai_saved_documents']`, **30 voci al massimo**, dedup per `genere|titolo|mappa` (rigenerare sostituisce), scarta i più vecchi se la quota è piena (`mappai-study-export-core.js:91-178`). Contiene sintesi, dossier, fogli nodi, timeline, catena, fogli quiz (`quizpaper`), fogli flashcard, analisi.
- Set (quiz/flashcard): `appState.db.studySets` → progetto in localStorage + `set-<id>.json` nel vault, col marchio `_mappa`; al caricamento si scartano quelli di un'altra mappa e i doppioni per id; i file orfani vanno nel Cestino (HANDOFF:809-835; `mappai-files-core.js:400-430`).
- Regola delle due console: ELABORA elenca le **sorgenti**, INSEGNA i **file**; la sintesi editabile sta in ELABORA, quella con la voce in INSEGNA (`filtraSintesi`, `mappai-landing-teach.js:2177-2186`; HANDOFF:1121-1126).

---

## 3. Limiti numerici e default
| Che cosa | Valore | file:riga |
|---|---|---|
| «Quante domande per area» | default **5**, min 1, max **30** | `mappai-crea-quiz.js:275-277` |
| «Domande d'avvio (%)» (solo aperte) | default **40**, 0-100 | `:284-286` |
| Angolazioni | 8 spunte; default «Automatico (misto)»; non per Flashcard | `:193-203, 251-254` |
| Stima chiamate | fogli × rami (rami = n. macro-aree, oppure 1 se un'area sola o da immagine) | `:215-219` |
| «Tutta la mappa (N nodi)» nella sintesi | N = nodi della mappa | `mappai-branch-synthesis.js:330` |
| Preavviso della voce | solo da **12 blocchi** in su | `:1921` |
| Limite TTS | **10 chiamate/minuto** (`mappai_tts_rpm`), latenza stimata 4 s/chiamata | `:1563-1569`; `mappai-usage-core.js:283-293` |
| Modello TTS / voce / ripiego | `gemini-2.5-flash-preview-tts` · «Kore» · `gemini-3.1-flash-tts-preview` (`mappai_tts_model`, `mappai_tts_voice`, `mappai_tts_model_alt`) | `:1931-1932`; HANDOFF:303-309 |
| Cache clip | `<userData>/tts-cache/`, potata a **7 giorni** | HANDOFF:1097-1113 |
| Cronologia «Annulla» | 20 passi | `mappai-doc-editor.js:213, 520` |
| Zoom anteprima | 0,85 · 1 · 1,15 · 1,3 · 1,5 | `mappai-docedit-core.js:577` |
| Scala automatica del foglio (`--de-lad`) | 1 · 1,3 (≥1120 px) · 1,6 (≥1360) · 1,85 (≥1700) · 2 (≥1900) · 2,4 (≥2300) | `mappai-doc-editor.js:3628-3633` |
| Foglio dei nodi | formati 3×4 (12, solo titolo) · 2×2 (4) · 2×1 (2); default 2×2, «Solo titolo», «Tutti i livelli»; max **7** parole chiave | `mappai-nodesheet-core.js:66-70`; `mappai-doc-editor.js:512-516, 730` |
| Domande aperte | max **2** aree per domanda; righe 3/5/8 | `:2767, 2813` |
| Flashcard stampate | A4 verticale, 4 carte per foglio | `:1969` |
| Archivio | 30 voci | `mappai-study-export-core.js:92` |
| Collisioni | fino a « · 99» | `mappai-pipeline-core.js:536-547` |
| Copie | nome proposto «2»…«99» | `mappai-clona-core.js:83-90` |
| Costo mostrato | solo «circa N chiamate all'AI» (quiz) e «circa N chiamate · circa M minuti» (voce); nessun prezzo in CHF in quest'area | |
| Formati accettati | ELABORA non carica file: legge la fonte già in `appState.sources` (testo, PDF) | `mappai-elabora-console.js:143-150` |

---

## 4. Percorso tipico del docente (storyboard)
1. Landing → clic su `#landing-mode-elabora` «Elabora». Si vede: console «Elabora» a tutto schermo, percorso in alto («Cosa › A chi? › classe › materia › progetto»), colonna «Progetti» a sinistra, area vuota (`mappai-elabora-console.js:1206-1250`).
2. Colonna → clic sul progetto «Elettricità - MM» (riga `prog:<id>`, eventuale badge «NUOVO»). Si vede: briciola «… · apro…», poi le tabelle «Fonte», «Sintesi», «Fogli dei nodi», «Catena dei perché», «Quiz», «Flashcard» e il bottone «Crea nuovo».
3. Clic su «Crea nuovo» → modale «Crea un documento» con le 4 card e i badge «dalla mappa» / «con l'AI» / «tu o l'AI».
4. Clic su «Quiz, Domande aperte e Flashcard» → modale «Che tipo di quiz» → clic «Domande aperte».
5. Modale «Domande aperte» → clic «Le genera l'AI» → (se le fonti iconografiche sono accese) modale «Da che cosa» → «Dalla mappa».
6. Modale «Genera con l'AI»: «Su quale area» = «Tutta la mappa»; in «Angolazioni» spuntare «Causa» e «Conseguenza» (togliere «Automatico (misto)»); la riga sotto dice «2 fogli · circa 10 chiamate all'AI» (5 macro-aree); «Quante domande per area» 5; «Domande d'avvio (%)» 40; «Nome (facoltativo)» vuoto → «Genera».
7. Velo «Genero le domande…» due volte; toast «✓ 2 fogli su 2 — si correggono in ELABORA, si stampano da INSEGNA: Causa · Conseguenza». Nelle tabelle compaiono «Domande Aperte - causa» e «Domande Aperte - conseguenza» (file `Domande-aperte-Elettricità-causa - TestMe Sans.pdf`, …-conseguenza). L'editor si apre sul primo.
8. Nell'editor: barra `.de-bar` con titolo, «Annulla», «Stampa», «Crea PDF», «Esci»; ogni domanda con «Aree», «Avvio/Ponte», «Righe», «Traccia». Correggere una traccia → il pallino si accende e il bottone diventa «Salva ed Esci».
9. Clic «Crea PDF» → (campi vuoti? «Il documento ha dei problemi:» … «Stampa comunque») → il file porta già il nome di copia, quindi niente domanda sul nome → «Un file con questo nome c'è già» → «Sovrascrivi» → toast «✓ Domande-aperte-Elettricità-causa - TestMe Sans.pdf salvato in Materiale Studio».
10. Clic «Esci» → anteprima del PDF nella tela con «Modifica · Stampa · Apri nel Finder · Esci»; ESC → elenco.
11. (Sintesi) «Crea nuovo» → «Sintesi» → modale «Sintesi materiale» → «Ramo da sintetizzare» = «Tutta la mappa (N nodi)» → «Genera Sintesi» → modale «Sintesi della mappa: …» → «Rivedi e salva» → editor con B/I/U, «Sezioni 2/2» (solo su un ramo), «Voce», «HTML». Clic «Voce» → «Registrare la voce naturale?» («78 blocchi di testo da leggere · circa 79 chiamate all'AI · circa 12 minuti…») → «Registra» → velo «Genero audio 1/78» con «Annulla» → toast «✓ Voce registrata — copia parlante scritta: Sintesi-voce-Elettricità - TestMe Sans.html» → «Voce naturale pronta» con «Scarica HTML + audio».
12. Tabelle → icona «Fai una copia» su «Scelta Multipla» → modale «Fai una copia» (nome proposto «2») → «Crea la copia» → riga «Scelta Multipla - 2» con icona «Elimina».

---

## 5. Prerequisiti e stati
- **Solo app desktop** per tutto ciò che scrive o legge file: «Crea PDF», «Voce» (copia parlante), «Apri nel Finder», copie di sintesi, eliminazioni → altrimenti «Disponibile solo nell'app desktop.» / «Fuori dall'app desktop non posso salvare il file: stampo e basta.» (`mappai-elabora-console.js:798, 1462, 2700`; `mappai-doc-editor.js:1745`).
- **Un progetto scelto** nella colonna: senza, l'area resta vuota e non c'è «Crea nuovo» (`_progettoDelContesto`, `:1236-1248`). Il progetto deve avere una cartella (`activeVaultPath`) perché il PDF venga scritto: altrimenti «…Senza un vault sul disco il PDF non è stato scritto.» / «Questa mappa non ha ancora una cartella: stampo senza salvare il file.».
- **Chiave AI** (provider attivo, `getSystemKey()`): per «Le genera l'AI» → «Inserisci un'API Key per continuare»; per «Parole chiave con AI» → «Serve la chiave AI: le parole chiave si possono comunque scrivere a mano.»; per la voce serve la chiave **Google** → «Serve la chiave API Google (Gemini) per la voce naturale».
- **Nessuna generazione in corso**: la voce «Elabora» del percorso è bloccata col motivo «Sto generando «…»: si riapre appena è pronta.» (`mappai-console-bento.js:907-916`); `generaSet` risponde «occupata» (`mappai-material-pipeline.js:1923`).
- «Catena dei perché» compare disattiva se la mappa non ha nessi causali (seconda riga = «Questa mappa non dichiara nessi causali.»); «Foglio dei nodi» se non ci sono nodi.
- Il passo «Da che cosa» esiste solo con `mappai_visione` acceso (default acceso, HANDOFF:302) e solo per Domande aperte e Flashcard (`mappai-crea-quiz.js:137-143`).
- «Taratura AI» nel modale della sintesi compare solo se `MappAITune.isSpecialActive()` (profilo speciale attivo, pallino verde); per i quiz la taratura si applica da sé dal contesto attivo, senza comando (`mappai-branch-synthesis.js:335-342`; `mappai-material-pipeline.js` generaSet riga +55 `MappAITune.congela()`).
- «Sezioni» compare solo su una sintesi di **ramo** che abbia catena o note (`mappai-doc-editor.js:2590-2594`); la tendina del carattere solo se `mappai_font_selettore` è acceso (default acceso) (`:2562-2564`).
- «Voce» c'è sempre sulla sintesi, ma con modifiche non salvate risponde «Salva prima le modifiche…» e non chiama l'AI (`mappai-branch-synthesis.js:1963-1968`).
- Una sintesi aperta dalla copia con voce non è modificabile: «Questa è la copia con la voce, da consegnare…» (`mappai-doc-editor.js:393`).

---

## 6. NON ESISTE (con la prova)
- **Un bottone «Salva» da solo** nella barra dell'editor: i bottoni sono Annulla · (Voce) · (HTML) · Stampa · Crea PDF · Esci/Salva ed Esci (`mappai-doc-editor.js:2479-2550`). «Salva» compare solo nel dialogo «Salvi le modifiche?».
- **«Rigenera» nella barra dell'editor**: non c'è (stessa barra). Esiste SOLO «Rigenera» nel piè dell'editor della scheda di analisi (dossier iconografico) col modale «Rigenerare i materiali?» (`mappai-elabora-console.js:2479-2500`).
- **«‹ Documenti»** dentro la console: nascosto (`:2498`); «Nel vault»: tolto il 9/8 (`:2523-2527`).
- **La vecchia colonna a sette gruppi** e il flag `mappai_elabora_v2`: potati il 13/8 (`mappai-elabora-console.js:1250-1256`; HANDOFF:1121-1126).
- **Il suffisso ` -VERDE` sui file nuovi**: `buildFileName` non lo scrive più dal 10/8 (`mappai-pipeline-core.js:474-486`); resta riconosciuto sui file vecchi. ⚠️ Il tooltip «Il file avrà il suffisso [VERDE].» della spunta «Taratura AI» (`mappai-branch-synthesis.js:338`) è **falso** oggi.
- **Un interruttore «Adatta» in ELABORA**: «Adatta» è l'interruttore `mn-livello` dei riquadri di CREA (`mappai-bento-composizione.js:289`); qui la taratura è automatica.
- **Angolazioni per le Flashcard** nel percorso «Crea un documento»: escluse (`mappai-crea-quiz.js:193-199`). (Nota: il riquadro «Più set per angolo» di CREA invece dal 20/8 le moltiplica, `mappai-pipeline-core.js:296-300` — due comportamenti diversi nelle due aree.)
- **Vero/Falso da CREA → «Genera materiali»**: non più (`mappai-material-pipeline.js` `_QT` commento 19/8); l'UNICA strada per un V/F è ELABORA → «Crea un documento → Vero o Falso».
- **Dossier, Timeline, Focus, Vista studio, mappa esportata** nel popup «Crea un documento»: le card sono quattro (`TIPI`, `mappai-elabora-console.js:158-207`). I loro file (`Dossier-…`, `Studio-…`, `Focus-…`, `MM-…`) compaiono in ELABORA solo sotto «Altri materiali».
- **«Audio voce naturale»** nel modale di risultato della sintesi: tolto il 17/8 (`mappai-branch-synthesis.js:651-660`); la voce si registra solo dall'editor.
- **Un MP3 accanto al documento** da «Voce»: no, l'audio va dentro `Sintesi-voce-<Mappa>.html` (`mappai-doc-editor.js:2150-2158`).
- **Consegna di un audio parziale** dopo «Annulla»: no (HANDOFF:1068-1076).
- **Eliminare l'originale** di un documento: solo le copie hanno il cestino (`mappai-landing-teach.js:2383-2405`; toast «Questo è il documento originale della mappa…»).
- **Cestino/scarica/Finder come icone di riga** in ELABORA: solo in INSEGNA (`:2356-2369`); in ELABORA restano «Fai una copia» e «Elimina» (copie).
- **Caricare una fonte nuova** da ELABORA: la console non ha un bottone di upload; mostra le fonti già in memoria (`_pdf()`, `:143-150`). (La v1 `mappai-elabora.js` ha «aggiungi PDF» fra i comandi della fonte, ma è un'azione sulla fonte, non un ingresso dell'area.)
- **ESC che chiude la console**: senza documento aperto ESC non fa nulla (`mappai-elabora-console.js:2881-2886`).
- **«Sezioni» sulla sintesi di tutta la mappa**: no (`mappai-doc-editor.js:2590-2594`).
- **Un prezzo in CHF** in quest'area: nessuna stringa di costo; solo «chiamate all'AI» e minuti.

---

## 7. Parole da NON usare con i docenti → come dirle
| gergo | nella guida |
|---|---|
| vault / `activeVaultPath` | «la cartella della mappa» (l'app stessa dice così; il sottocartella si chiama `Materiale Studio`) |
| console (ELABORA/INSEGNA/Cabina) | «la schermata ELABORA» |
| bento / box | «i riquadri di CREA» |
| kill-switch / flag / localStorage | non nominarli; al massimo «impostazione» |
| tela (`mm-tela`) | «l'area del documento», «a destra» |
| nav / colonna / sidebar | «la colonna di sinistra con i progetti» |
| briciole / percorso / `montaPercorso` | «il percorso in alto (Cosa › A chi? › classe › materia › progetto)» |
| set / `studySets` | «il quiz (o le flashcard) modificabile»; dire «set» solo se si cita un toast che lo contiene |
| archivio / `MappAIStudyDocs` | «la memoria dell'app» (i documenti restano anche senza file) |
| clone / `clonabile` | «copia» (l'app dice «Fai una copia») |
| pipeline / `generaSet` | «la generazione dei materiali» |
| KG / Knowledge Graph | «mappa a rete» (MindMap = «mappa ad albero») |
| L1 / macro-aree / `_branchNodes` | «le macro-aree» o «i rami principali» (l'app dice «macro-aree», «Su quale area») |
| cross-link / ponti | «ponti tra i rami» (etichetta vera della catena) |
| rel / linking words / verbi sui link | «le parole sulle frecce» |
| angolo / `QUIZ_ANGLES` / chiave `auto` | «angolazione»; «misto» solo come parola che finisce nel nome del file |
| taratura / `tuned` / VERDE / `MappAITune` | «adattamento al profilo della classe» (l'app dice «Taratura AI») — non parlare di «VERDE» |
| TTS / `generateSynthesisAudio` / blob / cue / karaoke | «la voce naturale», «il testo che si evidenzia mentre legge» |
| 429 / rate limit / quota / rpm | «il limite di chiamate al minuto» / «la quota giornaliera» (parole del toast) |
| IPC / `electronAPI` / `saveVaultFile` / headless / `htmlToPdf` | «l'app desktop»; «MappAI scrive il PDF» |
| srcdoc / iframe | «l'anteprima» |
| dirty / `_dirty` | «modifiche non salvate» (il pallino) |
| `_voce`, `disk:`, `set:`, `syn:` | mai |
| dossier iconografico / visione / scheda | «l'analisi di una foto (fonte iconografica)» |
| desc / content / label | «la scheda del nodo», «il titolo» |
| `--de-lad` / scala / container query | «il foglio si ingrandisce da solo con la finestra» |
| jsPDF / printToPDF | «il PDF» |
| Cestino (`deleteVaultFile`) | «finisce nel Cestino del computer» (è vero: non si cancella) |

---

## 8. Dubbi (non verificati)
- **Nomi di esempio con suffissi che il codice non produce da solo**: `Foglio-nodi-Elettricità-title-L2.pdf`, `Foglio-nodi-Elettricità-card-L2-desc.pdf`, `Foglio-nodi-Elettricità-title - TestMe Sans-3x4-L2.pdf`, `Flashcard-Elettricità - Fronte:Retro - TestMe Sans.pdf`. `buildFileName` mette il dettaglio `title/card/keywords/misto` e poi il «nome» scelto dal docente: quei `-L2`, `-3x4-L2`, `-desc`, `- Fronte:Retro` sono con ogni probabilità testo digitato a mano in «Che nome dai a questo materiale?» (il «3x4-L2» dopo il carattere dice che il file è stato rinominato o generato con una versione precedente). Da confermare con Giacomo prima di mostrarli come «nomi che fa l'app».
- **`Sintesi-Elettricità - TestMe Sans.html` pesa 8,6 MB**: la sintesi editabile dovrebbe essere leggera (l'audio va in `Sintesi-voce-…`). Possibile che contenga l'audio incorporato (salvata dopo una registrazione in una versione precedente) — non ho aperto il file.
- **Il velo con «Annulla»**: `showLoadingOverlay(…, onAnnulla)` e l'etichetta «Sto annullando…» sono in `mappai-ui-canvas.js:94`; l'etichetta iniziale del bottone («Annulla») non l'ho letta riga per riga.
- **Comportamento in Electron delle varianti multiple e del passo «Da che cosa»**: HANDOFF §5 (2007-2100) li segna «DA PROVARE IN ELECTRON»; le etichette sono certe, l'esito a schermo no.
- **La riga «nel vault»** (`ec_dal_vault`, `:302`) viene da `_vociDisco`, codice della colonna v1: non ho verificato se nella tela v2 quella sotto-etichetta compaia ancora da qualche parte.
- **Il numero di macro-aree** usato nella stima («circa N chiamate») per Elettricità: dipende dai nodi L1 del vault (non contati).
- **Traduzioni EN** dell'area: non verificate (la guida è in italiano; il fallback italiano è il testo che si vede con l'interfaccia in italiano).
- **Flashcard da immagine**: il passo «Da che cosa» le include (`GENERI_IMMAGINE`), ma non ho seguito `generaSet` per confermare che il materiale dell'immagine arrivi davvero al prompt delle carte.
