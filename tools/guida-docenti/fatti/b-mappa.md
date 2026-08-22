# B — LA MAPPA sul canvas (fatti letti dal codice, 22/8/2026)

> Sola lettura del repo in `main` (HEAD e35db8f). Ogni etichetta è trascritta com'è nel codice;
> dove l'HTML dice una cosa e il dizionario italiano un'altra, a schermo **vince il dizionario**
> (`changeLanguage` gira all'avvio — `mappai-storage-lang.js:864` — e riscrive ogni `data-i18n` /
> `data-i18n-title` con `it_translations.js` quando la chiave esiste: `mappai-storage-lang.js:721-734`).
> Le stringhe `window.t('chiave','fallback')` seguono la stessa regola (`i18n-helper.js:18-25`):
> prima il dizionario IT, poi il fallback inline.

## 1. Etichette ESATTE a schermo

### 1a. La barra della mappa (`#map-control-card`, `public/index.html:1530-1612`)
In basso al centro del canvas. Dopo la potatura del 16/8 (HANDOFF §3 «LA BARRA DELLA MAPPA») ha
**tre bottoni e uno slider**.

| Etichetta | Tooltip (title) a schermo | Selettore | Dove |
|---|---|---|---|
| «CENTRA» | «Centra e resetta la vista» | primo `button` di `#map-control-card`, `onclick="window.resetZoom()"` | `index.html:1537-1542`; chiave `ui_center_caps`/`tt_center_view` = stessi testi (`it_translations.js:379,277`) |
| «MAPPA» → «ALBERO» → «FASCI» → «DAG» (ciclo) | «Cambia vista (Mappa / Albero / Fasci / DAG)» | `#card-btn-layout`, testo in `#layout-label-text` | `index.html:1546-1552`; etichetta scritta da `updateLayoutButtonLabel` (`mappai-d3-render.js:1725-1760`), nomi motori in `nomeMotore` (`mappai-studio-view.js:396-401`) |
| «INTERE» → «NO» → «BREVI» (ciclo delle linking words) | **«Mostra o nascondi le parole sugli archi»** (dizionario `tt_toggle_labels`, `it_translations.js:278`; l'HTML dice «Linking words: niente, brevi o intere» ma viene sovrascritto) | `#card-btn-labels`, testo in `#labels-label-text` | `index.html:1562-1569`; etichetta scritta da `aggiornaBottoneTesto` (`mappai-d3-render.js:1752-1770`): `sv_no`/`sv_brevi`/`sv_intere` → «no»/«brevi»/«intere» in MAIUSCOLO |
| «Mostra fino al livello» + scritta «tutti» oppure «0–N» | (sull'etichetta) «Filtro di vista: nasconde i nodi più profondi senza cancellarli. La profondità dei DATI si imposta con «Genera fino a» nella config AI.» | `#level-filter-control` › `#level-slider` (range 0…max) + `#level-slider-val` | `index.html:1588-1596`; scritta da `aggiornaScrittaLivelli` (`mappai-d3-render.js:1846-1861`) |
| «Min Link» + contatore | — | `#min-link-control` › `#node-filter-slider` — **solo Knowledge Graph** | `index.html:1575-1583`; mostrato/nascosto in `mappai-ui-canvas.js:256-275` |

Stato colore: LAYOUT diventa indaco quando non è su «MAPPA» (`d3-render.js:1729-1731`); TESTO diventa
rosso quando le parole sono spente (`d3-render.js:1763`).

### 1b. Menu «Azioni rapide» (`#floating-actions-menu`, in basso a sinistra, `index.html:1455-1526`)
Si apre col bottone `#floating-actions-toggle` (title «Azioni Rapide», icona `log-out`, `index.html:1523-1526`).

| Etichetta a schermo | Tooltip | Selettore / azione | Riga |
|---|---|---|---|
| «Materiali di studio» | «Stampati e attività JIGSAW dalla mappa» | `openStudyMaterialsModal()` | `index.html:1463`; dizionario `ui_materials_hub`, `tt_materials_hub` (`it_translations.js:473,476`) |
| «MappAI Live» | **«Attività via QR: quiz live, lavagna collaborativa, materiali scaricabili»** (dizionario `tt_live_hub`, `it_translations.js:185`) | `openLiveHub()` | `index.html:1466` |
| «Studio attivo» | «Attività di studio, viste e strumenti» | `ActiveStudy.openLauncher()` | `index.html:1469` |
| «Knowledge Garden» | «Knowledge Garden: crea, condividi ed esplora i giardini della classe» | `openKnowledgeGardenHub()` | `index.html:1472` |
| «Graph manager» | «Salva, apri, importa ed esporta la mappa» | `openGraphManagerModal()` | `index.html:1475` |
| «Sincronizza Vault» | «Sincronizza modifiche nel Vault» | `#sync-vault-btn` → `saveMapVault()`; **nascosto** finché la mappa non è legata a una cartella (`mappai-vault-io.js:114-118, 221`) | `index.html:1480-1483` |
| «Revisione» | «Revisione mappa: raccogli correzioni annotate come ground-truth» | `MappAICorrection.start()` | `index.html:1485` |
| **«Elabora (co-docente)»** (dizionario `ui_elabora_hub`, `it_translations.js:474`; l'HTML dice «Co-docente (Elabora)») | «Elabora: analizza la scheda e arricchisci la mappa con citazioni dalla fonte» | `MappAIElabora.openFromMap()` | `index.html:1488-1490` |
| «Annulla» + contatore | «Nulla da annullare» / «Annulla: <ultima azione>» | `#undo-action-btn` → `undoLastAction()` (disabilitato a 0) | `index.html:1513-1516`; `mappai-undo.js:78-81` |
| **«Home»** (dizionario `back_to_home`, `it_translations.js:119`; l'HTML dice «Torna alla Home») | «Nuovo Progetto» | `onclick="window.backToLanding()"` | `index.html:1517-1519` |

Nel modale «Materiali di studio» (`mappai-menu-hubs.js:156-175`) la card della mappa si chiama
«Esporta PDF mappa» (fallback `ui_export_pdf_btn`, non nel dizionario IT) con tooltip
**«Esporta la mappa visibile in formato PDF»** (dizionario `tt_export_pdf`, `it_translations.js:311`).
Nel «Graph manager» (`mappai-menu-hubs.js:275-289`): sezione «Vault (salvataggio consigliato)» con
«Esporta nel Vault» (tooltip **«Salva come Vault Markdown»**, `it_translations.js:262`) e «Importa dal
Vault»; sezione «File JSON» con «Importa JSON», «Unisci Mappe», «Esporta Appunti».

### 1c. La sidebar (`#sidebar`, `index.html:1102-1175`)
- Testata: `#sidebar-subtitle` = titolo del progetto (default «Mappa Senza Nome»), riga cliccabile
  `#project-title-container` con title «Nome del progetto — clicca per rinominarlo» (`index.html:1116-1120`)
  → modale «Modifica Titolo Progetto» (`lbl_edit_project_title`, `it_translations.js:522`) con «Annulla»/«Salva».
- Maniglia `#sidebar-resizer`, title «Trascina per ridimensionare» (`index.html:1105`).
- Bottone nascondi/mostra `#sidebar-toggle-btn`, title «Nascondi/Mostra Sidebar» (`index.html:1446`).
- Sette tab a icona, **solo tooltip** (nessun testo): `#sidebar-tab-structure` «Indice» (`:1132`),
  `#sidebar-tab-notes` «Note» (`:1137`), `#sidebar-tab-study` «Studio» (`:1142`), `#sidebar-tab-finder`
  «Finder» (`:1147`), `#sidebar-tab-tutor` «Tutor AI» (`:1152`), `#sidebar-tab-lim` «LIM» (`:1159`),
  `#sidebar-tab-vista` «Vista studio» (`:1169`). Switch in `switchSidebarTab` (`mappai-ui-modals.js:514-540`).
- Tab Indice: titolo dell'albero `#tree-view-title` = «Macro-aree» (MindMap) o «Super-hub» (KG) —
  `mappai-ui-modals.js:613`; KG mostra i primi 8 hub per grado (`:632`). Sotto: bottone «Lavagna QR»
  (`index.html:1214`), poi `#node-details` con «Nessun nodo selezionato» e «Usa il tasto Sinistro per leggere
  i contenuti dei nodi e il tasto destro per modificarli.» (`index.html:1222-1225`).
- Tab Note: «Raccoglitore» / «Nessuna nota presente.» (`index.html:1300-1314`).
- Tab Finder: placeholder «Super ricerca universale...», hint «Cerca in etichette, descrizioni, citazioni
  e fonti esterne.» (`it_translations.js:449`), «Inizia a digitare...».

### 1d. Il pannello «Vista studio» (tab `#sidebar-panel-vista`, `mappai-studio-view.js`)
**Forma «mappa libera»** (`pannelloMappa`, `:438-510`): titolo «Vista studio»; «Vista» con quattro
scelte «Mappa · Albero · DAG · Fasci» (`MOTORI`, `:396`); testo «Stai guardando la mappa libera. Scegli
Albero, DAG o Fasci per passare alla vista di studio.»; «Mostra fino al livello» (gemello della barra,
`data-sv-map="depth"`); «Linking words» con «no · brevi · intere»; «Testo dei nodi» e «Testo linking
words» (slider 50–250 %, passo 5, `:513-517`); spunte «Blocca i nodi dove sono» (PIN) e «Attrazione fra
i nodi» (ATTR); bottone `#sv-map-pdf` «Esporta PDF della mappa»; bottone `#sv-reset` «Ripristina il
layout fissato» con nota «Rimette i nodi dove li avevi lasciati con «Fissa Layout».» oppure «Nessun
layout fissato per questa mappa: si crea col tasto destro sullo sfondo → «Fissa Layout».».

**Forma «dentro la vista»** (`buildControls`, `:541-590`): «Motore» (Mappa/Albero/DAG/Fasci),
«Orientamento» («dall'alto ↓» / «da sinistra →»), «Archi usati» («Solo gerarchia» · «Gerarchia + cross» ·
«Solo relazioni» · «Tutti gli archi» · «+ comunità» secondo i dati), «Linking words», «Gerarchia visiva»
(«no · foglie · livello · + taglia»), «Evidenzia al passaggio» («niente · vicini · parentela»), «Mostra
fino al livello», «Spazio fra livelli» (20–260), «Spazio fra card» (6–110), «Larghezza card» (80–320),
«Altezza card» (30–120), «Testo dei nodi» (8–22), «Testo linking words» (7–18), spunte «Frecce separate
sul nodo» e «Bande delle macro-aree», bottone `#sv-pdf` «Esporta PDF (A4)» (nel focus: «Esporta PDF del
Focus» + «Chiudi il focus»), «Ripristina default · <Motore>», pieghevole «Altre opzioni» con «Altri
motori» («Anelli · Colonne · Percorso · Matrice»), «Instradamento archi» («curva · dritto · ortogonale»),
«Ponticelli agli incroci»; nota finale «Tasto destro su una card: Descrizione, Focus sui vicini o sulla
parentela.».
Toast all'ingresso manuale: «Vista studio: deterministica, da leggere. Il layout libero resta sotto.»
(`:1124`, fallback `tst_studio_on`). Toast PDF: «PDF esportato» / «Export PDF fallito: …».
Menu contestuale su una card (`:760-785`): «Descrizione», «Focus: vicini diretti», «Focus: parentela»,
«Anelli da qui» (non nel focus), «Copia etichetta». Testata del focus: «Focus attivo» + «vicini» / «parentela».

### 1e. Clic sinistro su un nodo — la scheda
Due cose insieme (`handleNodeClick`, `mappai-ui-canvas.js:323-512`):
1. nel tab Indice `#node-details`: «Livello N», chip «IMPARATO» / «RIPASSO» / «DA STUDIARE», titolo,
   immagine, descrizione (o «Nessuna descrizione.»), link «File:» / «Link:», bottone «Fonti e Note
   Approfondite» con badge numerico, bottone verde **«Mettiti alla prova (Genera Quiz)»** (`:468-478`);
2. il modale **«Scheda Focus»** `#source-modal` (`openSourceModal`, `:515-720`; markup `index.html:1633-1680`):
   sottotitolo «Scheda Focus - Livello N» (`:563`), parentela «L1: … > L2: …», matita title «Modifica nodo»
   (tooltip stilizzato «Modifica questo nodo: nome, contenuto, colore, link, immagini e documenti.»),
   X chiudi; barra strumenti `#modal-a11y-toolbar` con «Riga di Lettura», «Attiva/Disattiva
   Sillabazione» (dizionario `tt_hyphenation`, `it_translations.js:350`), «Aumenta Spaziatura
   Caratteri», «Zoom Testo» e lo slot voce; corpo con descrizione, «File Locale:» / «Collegamento
   Esterno:», immagini in griglia, sezione «Fonti e Note Approfondite (N)» (chiusa di default, ogni nota
   = numero + «Titolo | sorgente» + citazione; fallback «Estratto Fonte» / «Documento», `:613-640`),
   sezione «Tutor AI del Nodo» con «Avvia Sessione», placeholder «Rispondi al tutor...», title «Resetta Chat» (`:647-680`).

### 1f. Tasto destro su un nodo (`showContextMenu`, `mappai-context-menu.js:61-111`) — `#context-menu`
Ordine a schermo (testi risolti col dizionario IT):
«Leggi ad alta voce» · intestazione «Stato di Studio» · «Da studiare» · «Ripasso necessario» · «Imparato!» ·
«Azzera Semaforo» · intestazione «Editor Mappa» · «Espandi da Fonte» · «Edit Contenuto» · «Rinomina» ·
**«Aggiungi Figlio»** (dizionario `ctx_add_child`, `it_translations.js:147`; fallback «Crea Figlio») ·
«Crea Link» · «Fondi con...» (ambra) · «Cambia Link» (azzurro, **solo MindMap**, `:90`) · intestazione
«Spaced Repetition» · **«Crea Flashcard (Nodo)»** · **«Crea Flashcard (Ramo)»** · **«Genera Quiz (Nodo)»** ·
**«Genera Quiz (Ramo)»** (dizionario `:149-152`; i fallback dicono «Flashcard Nodo», «Quiz Nodo»…) ·
«Elimina Nodo» (rosso).
Conferma eliminazione: titolo «Elimina Nodo», testo «Sei sicuro di voler eliminare questo nodo e tutti i
link connessi?» (`:322`). Prompt rinomina: «Nuova etichetta del nodo:» (`:284`). Prompt figlio: «Nome del
nuovo nodo figlio:» (`:291,301`).

### 1g. Tasto destro su un arco (`:112-148`)
«Rinomina Relazione» · «Elimina Link». Se l'arco è suggerito dall'AI: intestazione «🤖 Link AI
Suggerito», «Valida Correlazione», «Rimuovi Link AI». Prompt rinomina: «Etichetta relazione (lascia vuoto
per nascondere la label):» (`:344`).

### 1h. Tasto destro sullo sfondo (`:149-167`)
MindMap: «Nuovo Nodo» · «Centra Vista» · «Fissa Layout» (indaco, grassetto). KG: «Nuovo Hub» · «Nuovo
Nodo» · «Centra Vista» · «Fissa Layout». Prompt: «Nome del nuovo nodo:», «Nome del nuovo Super-Hub:»,
«Nome del nuovo nodo isolato:». Toast di «Fissa Layout»: «Layout Salvato (Snapshot creato)!»
(`mappai-ui-canvas.js:1007`, fallback `tst_layout_snapshot`).

### 1i. Banner delle modalità a due clic (`#mode-hint`, `index.html:1618-1620`)
- «MODALITÀ COLLEGAMENTO: Clicca sul nodo di destinazione» (`mappai-context-menu.js:296`)
- «FONDI: "<A>" — Clicca il nodo di destinazione (ESC per annullare)» (`mappai-node-merge.js:9`)
- «CAMBIA LINK: "<A>" — Clicca il nuovo nodo genitore (ESC per annullare)» (`mappai-node-merge.js:128`)
- Conferma del fondi: «Fondi "<A>" in "<B>"?» / «I figli di "<A>" diventeranno figli di "<B>". L'operazione
  non è annullabile.» (`mappai-node-merge.js:30-34`). Toast: «"<A>" fuso in "<B>"» (`:114`), «"<A>" spostato
  sotto "<B>"» (`:199`).

### 1j. Modale «Collega nodi» (`#link-family-modal`, `index.html:1735-1776`; `showLinkFamilyPrompt`, `mappai-ui-modals.js:138-230`)
Titolo «Collega nodi»; domanda «Che relazione c'è tra **A** e **B**?»; lista verticale delle famiglie di
relazione (colorate, con 3 parole d'esempio); «Scegli o scrivi la tua etichetta:» con chip; bottone
«Bidirezionale» + «per relazioni simmetriche (si oppone a…)»; campo «Etichetta relazione», placeholder
«es. causa, include, precede…»; «Annulla» / «Salva».

### 1k. Modale «Modifica nodo» (`#edit-node-modal`, `index.html:2172-2384`; `mappai-edit-modal.js`)
Titolo «Modifica nodo»; pipetta colore (title «Colore del nodo»); **«Nome Nodo/Hub»** (dizionario
`lbl_node_name`, `it_translations.js:219`; l'HTML dice «Nome nodo»); «Contenuto» + «Ripristina Testo AI»
(compare solo se il testo è stato modificato a mano); «COLLEGAMENTI (Web o File)» con placeholder
«https://... oppure file:///...» e bottone «aggiungi»; «IMMAGINI» con «Incolla URL immagine...», «oppure»,
file picker; «Colore nodo/hub» con 12 swatch (title «Cyber Cyan», «Electric Blue», … «Dark Mode»); «Icone
modifiche» con spunte «Testo», «Immagini», link, file; «Annulla» / **«Salva Modifiche»** (dizionario
`btn_salva`, `it_translations.js:523`; l'HTML dice «Salva»). Toast: «Testo ripristinato alla versione AI.».

### 1l. Modale «Espandi da Fonte» (`#contextual-ai-extension-modal`, `index.html:2386-2455`)
«Nodo da espandere:» + nome; tab «Testo / URL» e «Carica PDF»; testo «Incolla qui il contenuto o
l'indirizzo web che l'IA deve usare per generare nuovi rami figli.»; placeholder «Incolla qui testo o
URL...»; «Seleziona un file PDF» / «Il testo verrà estratto localmente prima…» / «Scegli File»;
«Annulla» / «Espandi». Alert: «Seleziona prima un file PDF.», «Inserisci del testo, un URL o carica un
PDF per l'espansione.», «Inserisci la API Key di Google Gemini nelle impostazioni.»
(`mappai-contextual-ai.js:33-63`). Toast: «Nessun nuovo concetto trovato nel materiale.» (`:94`),
«Espansione completata: aggiunti N nuovi nodi.» (`:146`).

### 1m. Strumenti compensativi (`#a11y-panel-toggle`, `index.html:3498-3501`; pannello `#a11y-panel`, `:3508-3528`)
Bottone a occhio, title «Strumenti Compensativi». Voci: «Inverti Colori» · «Riduci Contrasti» ·
«Contrasti Elevati» · «Scala di Grigi» · «Interlinea Testo» (dopo il clic diventa «INTERLINEA x2.0»,
«x2.5», «x1.5» — `mappai-a11y.js:66-70`) · «Riga di Lettura» · «Testo x1» → «Testo x1.5» → «Testo x2»
(`:88-95`) · «Ascolto Testo».

### 1n. Multi-selezione (`mappai-multiselect.js:86-100`)
SHIFT+clic aggiunge, CTRL/⌘+clic toglie (`mappai-ui-canvas.js:356-365`). Badge «1 nodo selezionato» /
«N nodi selezionati» con bottone «Deseleziona (ESC)».

## 2. Gesti → che cosa succede

| Gesto | Funzione | Effetto visibile | Su disco / localStorage |
|---|---|---|---|
| clic «CENTRA» | `resetZoom` (`mappai-ui-canvas.js:756-759`) | transizione 750 ms a zoom 1, origine | — |
| clic LAYOUT | `toggleLayout` (`mappai-d3-render.js:1579-1621`) → `MappAIStudioLayouts.cicloStudio` (`mappai-studio-layouts.js:1574-1580`): `Mappa → Albero(td) → Fasci → DAG → Mappa` | entra/cambia l'overlay a card `#studio-overlay` sopra `#d3-container` (`mappai-studio-view.js:310-322`); uscendo dal DAG si torna al canvas libero | profilo utente `mappai_studio_profile`; `layoutMode` nel progetto (autosave) |
| clic TESTO | `toggleLabels` (`:1774-1779`): `off → short → full → off` | parole sugli archi sparite / troncate a 14 caratteri / intere (max 40, `CAP_REL` in `mappai-studio-draw.js:154`) | `mappai_map_rel_labels` (`:1790`) |
| slider livelli | `onLevelSliderInput` (`:1863-1871`) → `applyVisualFilters` (`:1803-1840`) | nasconde nodi con `level > N` e i loro archi (non li cancella); in vista studio ricalcola il layout sul sottografo | — |
| clic sinistro su nodo | `handleNodeClick` (`mappai-ui-canvas.js:323`) | zoom 1.5× sul nodo (`:383`), vicini evidenziati e resto sbiadito, scheda in sidebar + modale «Scheda Focus» | — |
| clic sullo sfondo | `handleBackgroundClick` (`mappai-d3-render.js:1892-1904`) | annulla evidenziazione, chiude menu, annulla Collega/Fondi/Cambia Link | — |
| trascinare un nodo | `dragended` (`mappai-d3-render.js:989-1035`) | con attrazione accesa e PIN spento il nodo **torna alla fisica** appena lasciato; con PIN acceso (o attrazione spenta) resta dove lo si posa; il nodo radice (L0) è sempre al centro | posizioni nel progetto via autosave; nel vault solo all'uscita/sincronizzazione |
| spunta «Blocca i nodi dove sono» | `applyPinning` (`:1040-1062`) | azzera le forze, tutti i nodi fissi | — |
| spunta «Attrazione fra i nodi» | `toggleAttraction` (`:1065-1085`) | spegne/accende le forze | — |
| tasto destro sfondo → «Fissa Layout» | `salvaLayout` (`mappai-ui-canvas.js:991-1009`) | salva `savedX/savedY` + pin, toast | `saveCurrentProject` subito |
| pannello Vista studio → «Ripristina il layout fissato» | `applyPinnedLayout` (`mappai-d3-render.js:1563-1577`) | nodi rimessi sullo snapshot | — |
| «Rinomina» / «Edit Contenuto» → «Salva Modifiche» | `saveEditNode` (`mappai-edit-modal.js:206-250`) | label/desc/urls/images/colore della macro-area aggiornati; ridisegno; scheda riaperta | `saveCurrentProject` (`:249`); le immagini caricate da file restano **base64** in memoria finché non si scrive il vault (`:177-187`), poi diventano `../Allegati/<file>` (`main.js:1568`) |
| «Crea Link» → clic su destinazione → famiglia → «Salva» | `handleNodeClick` ramo `linkingState` (`mappai-ui-canvas.js:341-360`) | nuovo arco con verbo scelto; «Bidirezionale» = curva con due frecce | autosave |
| «Fondi con...» → clic B → conferma | `executeMerge` (`mappai-node-merge.js:44-115`) | figli di A sotto B, A sparisce, colori ricalcolati; snapshot di annulla (`:47`) | autosave |
| «Cambia Link» → clic nuovo genitore → famiglia | `executeRelink` (`:136-200`) | A e il suo ramo spostati sotto il nuovo genitore, livelli e colore ricalcolati | autosave |
| «Elimina Nodo» → conferma | `ctxAction('delete_node')` (`mappai-context-menu.js:320-333`) | nodo e archi rimossi; snapshot di annulla | autosave |
| «Annulla» (menu azioni) | `undoLastAction` (`mappai-undo.js:47-69`) | ripristina nodi/archi/fonti/colori dell'ultimo snapshot; toast «Annullato: …» | — |
| «Espandi da Fonte» → «Espandi» | `executeContextualAIExtension` (`mappai-contextual-ai.js:31-150`) | chiamata AI; nuovi nodi figli del nodo scelto; toast con il conteggio | autosave |
| «Mettiti alla prova (Genera Quiz)» | `generateAIQuiz` (`mappai-ai-tutor.js:625`) | modale AI «Generazione Quiz in corso...» → una domanda a scelta multipla sul nodo | — |
| «Esporta PDF della mappa» / card «Esporta PDF mappa» | `exportPDF` (`mappai-d3-render.js:1337-1441`) | PDF **vettoriale** dell'intero canvas (la pagina prende la misura del disegno, non A4); toast «PDF vettoriale esportato!»; in caso di errore ripiego raster con toast «PDF vettoriale non disponibile — uso la cattura schermo» | file `MM-<Mappa>-<grado>-NN.pdf` (o `KG-…`) via `_studyMapPdfName` (`:1276-1319`) + `buildMapExportName` (`mappai-pipeline-core.js:524`); scaricato con `pdf.save` → cartella Download (HANDOFF §3 «La mappa esportata…», provato in Electron); copia archiviata nei «Documenti di studio» (`_archiveMapPdf`, `:1323-1333`) |
| «Esporta PDF (A4)» (vista studio) | `exportViewPdf` (`mappai-studio-view.js:1083-1097`) | PDF A4 orizzontale della vista a card | `Studio-<Mappa>-<motore>.pdf`; nel focus `Focus-<nodo>-vicini|parentela.pdf` |
| «Esporta nel Vault» | `saveMapVault` (`mappai-vault-io.js:75-127`) | chiede una cartella, scrive il vault, toast «Vault creato e collegato!», compare «Sincronizza Vault» | `index.yaml`, `vista.json`, `links.json`, `Nodi/*.md`, `Allegati/` (`main.js:1404-1461`) |
| «Home» | `backToLanding` (`mappai-ui-canvas.js:278-311`) | esce dalla vista studio, salva il progetto, **riscrive il vault** se la mappa ne ha uno (attesa max 4 s), poi ricarica l'app sulla landing | `saveCurrentProject` + `saveVault` |
| (nessun gesto) | autosave `setInterval` (`mappai-storage-lang.js:656-664`) | — | `tutor_ai_projects` in localStorage ogni **120 s**, sospeso durante una generazione; inoltre dopo ogni `renderGraph` (`mappai-d3-render.js:1907-1912`) |

## 3. Limiti numerici e default
- Zoom del canvas: rotella/pinch fra **0.1× e 5×** (`mappai-d3-render.js:132`); clic su un nodo porta a 1.5×.
- Slider livelli: `min 0`, `max = max(livello più profondo, 5)` (`:828-839`); in fondo alla corsa dice «tutti».
  ⚠️ Il numero **non si copia** fra barra e vista studio: nella vista il livello è la profondità
  topologica, e alla stessa tacca Albero/DAG/Fasci mostrano quantità diverse (HANDOFF §3).
- Linking words «brevi»: 14 caratteri; «intere»: 40 (`mappai-studio-draw.js:154`).
- Scale del testo sul canvas: 50–250 %, passo 5 % (`mappai-studio-view.js:513-517`), default 100 %,
  ricordate in `mappai_map_fs_node` / `mappai_map_fs_rel`.
- Taratura per motore (HANDOFF §3, tabella): Albero e DAG card 176×120, testo 22, livelli 260·28, parole
  intere; Fasci card 80×30, testo 11, parole spente.
- Annulla: **10** passi (`mappai-undo.js:9`).
- Autosave: ogni 120 s + dopo ogni ridisegno.
- Uscita con «Home»: attende il salvataggio del vault al massimo **4 s** (`mappai-ui-canvas.js:306`).
- Menu contestuale: larghezza 224 px, pressione lunga su touch **500 ms** (`mappai-context-menu.js:41`).
- Indice KG: primi 8 hub per grado (`mappai-ui-modals.js:632`).
- Interlinea: 1.5 → 2.0 → 2.5; zoom testo: 1 → 1.5 → 2 (ricordato in `mappai-a11y-zoom`).
- Formati accettati da «Espandi da Fonte»: testo libero, URL, PDF (`index.html:2410-2440`). Nel modale
  modifica: link `https://…`/`file:///…`, immagini da URL o da file `image/*` (`index.html:2256-2266`).
- Export mappa: PDF vettoriale, SVG (`exportSVG`, `:1506`), PNG istantanea (`exportSnapshot`, `:1131`),
  JSON (`exportGraph`, `mappai-ui-canvas.js:1011`: nome `mm_<titolo>.json` / `kg_<titolo>.json`).
- Nessun costo/quota è mostrato sul canvas; le sole chiamate AI di quest'area sono «Espandi da Fonte»,
  «Mettiti alla prova», il tutor del nodo e i quiz/flashcard del menu (una chiamata ciascuno, senza contatore a schermo).

## 4. Percorso tipico del docente (storyboard)
1. Mappa appena generata o aperta: si apre **in ALBERO** con l'Indice nella sidebar
   (`riprendi`, `mappai-studio-view.js:1146-1165`). Screenshot: `#studio-overlay` + `#card-btn-layout` che dice «ALBERO».
2. Clic su `#card-btn-layout` tre volte: «FASCI» → «DAG» → «MAPPA» (il canvas libero con i nodi tondi).
3. Sul canvas libero: trascinare `#level-slider` da «tutti» a «0–2»: i rami profondi spariscono.
4. Clic su `#card-btn-labels`: «INTERE» → «NO» (bottone rosso) → «BREVI».
5. Clic sinistro su un nodo L2: zoom, vicini evidenziati, si apre `#source-modal` «Scheda Focus - Livello 2»
   con parentela e «Fonti e Note Approfondite (N)»; chiudere con la X o ESC.
6. Tasto destro sullo stesso nodo → `#context-menu`: screenshot del menu intero (da «Leggi ad alta voce» a «Elimina Nodo»).
7. «Edit Contenuto» → `#edit-node-modal`: cambiare il «Contenuto», «Salva Modifiche».
8. «Crea Link» → banner «MODALITÀ COLLEGAMENTO…» → clic su un altro nodo → `#link-family-modal` «Collega nodi»
   → scegliere una famiglia → «Salva»: compare l'arco con la parola.
9. Tasto destro sullo sfondo → «Fissa Layout» → toast «Layout Salvato (Snapshot creato)!».
10. Tab `#sidebar-tab-vista` → «Albero» nel gruppo «Vista» → la vista entra; «Esporta PDF (A4)» → toast «PDF esportato».
11. Bottone occhio `#a11y-panel-toggle` → `#a11y-panel`: «Testo x1» → «Testo x1.5»; «Riga di Lettura».
12. `#floating-actions-toggle` → «Home» (tooltip «Nuovo Progetto»): salva e torna alla landing.

## 5. Prerequisiti e stati
- **La mappa deve avere nodi**: `toggleLayout` esce se non c'è la `simulation` (`d3-render.js:1580`);
  `enter()` della vista studio esce senza nodi (`studio-view.js:1101`).
- **Slider livelli solo in MindMap**; in KG al suo posto c'è «Min Link» (`mappai-ui-canvas.js:256-275`).
  «Cambia Link» non compare in KG (`context-menu.js:90`); sullo sfondo in KG compare «Nuovo Hub».
- **Chiave AI**: «Espandi da Fonte» si ferma con l'alert «Inserisci la API Key di Google Gemini nelle
  impostazioni.» (`contextual-ai.js:60-63`); è bloccata anche mentre una generazione è in corso
  (`mappaiOccupato`, `:32`). Stessa guardia su «Home» (`ui-canvas.js:285`): durante una generazione il
  bottone non fa nulla.
- **Strumenti compensativi**: il bottone a occhio compare **solo** con la mappa aperta e nessuna console
  davanti (`a11yInReadingContext`, `mappai-a11y.js:285-310`); fuori dal contesto è `display:none` e gli
  effetti (inversione, riga, zoom) si sospendono e tornano al rientro (`:313-350`). Kill-switch
  `mappai_a11y_everywhere='1'` = comportamento storico.
- La barra strumenti dentro la «Scheda Focus» (`#modal-a11y-toolbar`) è **nascosta** se il carattere
  dell'app è quello di default: compare solo con un carattere ad alta leggibilità scelto in Cabina
  (`mappai-ui-canvas.js:700-704`).
- **«Sincronizza Vault»** è nascosto finché la mappa non è legata a una cartella (vault creato dalla
  generazione — `ensureProjectVault`, `vault-io.js:141-200`, cartella `Mappe/<classe>/<disciplina>/<titolo>`
  o `Mappe/Generico/` — oppure «Esporta nel Vault»).
- **«Ripristina il layout fissato»** è a opacità ridotta e la nota dice come crearlo se non c'è uno snapshot
  (`studio-view.js:439, 497-505`).
- **«Annulla»** parte disabilitato con title «Nulla da annullare» (`index.html:1513`).
- **«Ripristina Testo AI»** nel modale modifica compare solo se il testo è stato cambiato a mano.
- Un nodo L0 (radice) è sempre riportato al centro quando la fisica è accesa (`d3-render.js:1013-1033`).
- Tab «LIM»: nascosto solo con `mappai_lim_tab='0'` (`ui-modals.js:543-552`), quindi di default c'è.
- Il PDF vettoriale richiede svg2pdf caricato; se manca, ripiego raster (cattura della finestra, solo Electron).

## 6. «NON ESISTE» (o non più)
- **FISSA** (bottone della barra, gestore dei layout salvati): **pensionato per intero** il 16/8
  (HANDOFF §3 tabella «Che cosa è uscito»: 996 righe di `app.js`, due modali). Resta solo «Fissa Layout»
  nel tasto destro sullo sfondo + «Ripristina il layout fissato» nel pannello.
- **PIN e ATTR come bottoni della barra**: usciti; vivono come due spunte nel pannello Vista studio
  (`grep card-btn-physics public/index.html` → vuoto; `applyPinning` legge un bottone che non c'è,
  `d3-render.js:1042`).
- **RIORDINA, +/− distanza, +/− testo, PATH, LINK (tutti/gerarchia/cross)**: fuori dalla barra; il
  Pathfinder è cancellato (`d3-render.js:1881-1889`); `LINK_VIS_STATES` è codice senza ingresso (`:1874-1879`).
- **Bottoni zoom +/−**: non esistono nella barra; lo zoom è solo rotella/pinch e «CENTRA».
- **Ricerca nella barra**: no; la ricerca è il tab «Finder» della sidebar.
- **Ciclo lungo del LAYOUT** (Orbita · Radiale · Separato · Personale): solo col kill-switch
  `mappai_layout_ciclo_storico='1'` (`d3-render.js:1603-1604`), spento di default.
- **Glossario** (`#card-btn-glossary`): classe `hidden` (`index.html:1604`).
- **Timeline nella barra**: spostata in «Materiali di studio» → «Crea Timeline» (`index.html:1601`).
- **Font OpenDyslexic** negli strumenti compensativi: uscito il 18/8, si sceglie in Cabina › Aspetto e
  leggibilità (`index.html:3503-3507`).
- **Modalità studente** (`appState.studentMode`): «va in pensione» (`app.js:113-135`); il flag non si
  accende più da nessuna superficie, quindi i rami `!appState.studentMode` del menu e della scheda sono sempre visibili.
- **Sillabazione vera**: `toggleHyphenation` mette solo la classe CSS `hyphens-auto-force` (motore del
  sistema); il sillabatore Hypher è commentato (`mappai-a11y.js:18-34`).
- **Una seconda scheda per la vista studio**: «Descrizione» su una card apre la stessa «Scheda Focus»
  (`studio-view.js:948-956`).
- **Fondi con…/Cambia Link in KG**: «Fondi con…» sì; «Cambia Link» no.
- **Contatore di costi/token sul canvas**: nessuno.
- **Drawer «progetti» sul canvas**: `toggleProjectsBar` è un no-op (`storage-lang.js:650-654`).

## 7. Parole da NON usare con i docenti
| Nel codice | Nella guida |
|---|---|
| canvas / D3 / force layout / simulation | «la mappa», «la mappa libera» (i nodi che si muovono da soli) |
| vault | «la cartella della mappa» (sul computer, dentro «Documenti › MappAI - file › Mappe») |
| sync / Sincronizza Vault | «salva la cartella» — ma l'etichetta a schermo resta «Sincronizza Vault»: citarla tra virgolette |
| vista studio / overlay / motore (td, dag, fasci) | «la vista ordinata a schede»; «Albero», «DAG», «Fasci» solo come nomi sul bottone; spiegare DAG come «schema con anche i collegamenti trasversali» |
| linking words / rel / arco / link | «le parole sui collegamenti», «le frecce», «i collegamenti» |
| cross-link / isCross | «collegamenti trasversali fra rami» |
| L0 / L1 / L2… / livello | «il titolo», «le macro-aree», «i sotto-argomenti»; «livello» va bene solo con la scritta dello slider |
| KG / Knowledge Graph / hub / Super-Hub | «mappa a rete» (vs «mappa ad albero»); «nodo centrale» |
| MindMap / MM | «mappa ad albero», «mappa mentale» |
| nodo / card | «voce della mappa» o «scheda» (la card della vista ordinata) |
| pin / fx,fy / attrazione / fisica | «blocca le voci dove sono», «le voci si attirano/si respingono» |
| snapshot / layout fissato | «la disposizione salvata» |
| merge / relink | «unisci due voci», «sposta una voce sotto un'altra» |
| kill-switch / flag / localStorage | non nominarli: sono interruttori per chi sviluppa |
| console (Cabina/INSEGNA) / bento / manifesto | «la schermata», «la pagina iniziale» |
| IPC / Electron / main process / CDP | «l'app» |
| profilo (della vista studio) | «le impostazioni della vista» |
| a11y / compensativi | «strumenti per leggere meglio» — l'etichetta ufficiale «Strumenti Compensativi» si può citare |
| PDF vettoriale / raster / svg2pdf | «PDF nitido a qualunque ingrandimento» vs «PDF-fotografia dello schermo» |
| focus / focus-map | «lo zoom su una voce e i suoi vicini» |
| Scheda Focus | è il titolo a schermo: citarla così, spiegando «la scheda di una voce» |
| sourcesDict / chunks / inheritedNotes | «le frasi prese dalla fonte» (a schermo «Fonti e Note Approfondite») |
| jigsaw / ponte inter-area / ratifica | non spiegare in quest'area (compare solo se l'attività JIGSAW è accesa) |
| studentMode | non esiste più: non nominarlo |

## 8. Dubbi (non verificati nell'app viva)
- **ESC per annullare Fondi/Cambia Link**: il banner lo promette (`node-merge.js:9,128`) ma non ho trovato
  un `keydown` che chiami `cancelMergeMode`/`cancelRelinkMode` (grep su `public/js`: solo
  `handleBackgroundClick` e i gestori interni). ESC chiama `closeActiveModals` (`app.js:112-114`), che
  non tocca `mergeState`. Da provare in Electron: forse l'annullamento avviene solo col clic sullo sfondo.
- **Dove finisce il PDF di `pdf.save`**: in `main.js` non c'è un gestore `will-download`; il file esce
  nella cartella Download secondo HANDOFF §3 («il file esce davvero in Download»), non l'ho rimisurato.
- **Il title di TESTO**: a schermo dovrebbe essere «Mostra o nascondi le parole sugli archi» (dizionario)
  e non «Linking words: niente, brevi o intere» (HTML); dipende dal fatto che `changeLanguage` giri prima
  che la barra sia visibile — da confermare con uno screenshot del tooltip.
- **«Home» vs «Torna alla Home»**: stessa dinamica (dizionario `back_to_home: "Home"`): da confermare a schermo.
- **Tooltip stilizzati** (`data-tip`, `MappAITips`): non ho verificato se il `title` nativo resti attivo
  accanto a quello stilizzato (matita della Scheda Focus, pipetta del colore).
- **Ordine reale delle famiglie nel modale «Collega nodi»** e le loro etichette italiane vivono in
  `mappai-relations.js` (`EDGE_FAMILIES`), fuori dalla mia area: non le ho trascritte.
- **Cartella del vault automatico**: letta da `ensureProjectVault` (`vault-io.js:141-200`) e da
  `mapsBaseDir` (`main.js:237`): «Documenti › MappAI - Vault» se i file non sono «organizzati», altrimenti
  la sottocartella «Mappe» della cartella madre scelta. Il nome esatto della cartella madre (`FilesCore.ROOT_FOLDER`)
  non l'ho letto.
- **Il tab «Tutor AI» e il tab «Studio» della sidebar** sono di altre aree: ne ho riportato solo i tooltip.
- Non ho aperto l'app: le righe sono vere a HEAD e35db8f, i comportamenti sono letti, non osservati.
