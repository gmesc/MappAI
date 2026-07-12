# Research — Landing "Costruisci / Insegna" (005)

Tutte le incognite tecniche risolte con esplorazione del codice (12/7/26).
Nessun NEEDS CLARIFICATION residuo.

## R1 — Bypass del launcher e reversibilità

**Decisione**: `app.whenReady()` in `main.js` chiama `createWindow()` direttamente
invece di `createLauncherWindow()`. Il launcher NON viene eliminato: `launcher.html`,
`createLauncherWindow()` e l'IPC `launcher-return` (uscita segreta 5 click) restano
intatti. Kill-switch: all'avvio il main legge (sync, con try/catch) il file
`<userData>/mappai-settings.json`; se `{"legacyLauncher": true}` → comportamento
storico (launcher all'avvio). Documentato in CLAUDE.md.

**Rationale**: il main process non può leggere localStorage del renderer al boot —
serve un canale che esista prima della finestra. Un file JSON in userData è
sincrono, banale, senza nuove dipendenze. L'uscita segreta continua a funzionare
(il docente può sempre raggiungere lo Studio anche senza menu).

**Alternative considerate**: flag localStorage letto via IPC dopo la creazione di
una finestra nascosta (complesso, finestra fantasma); variabile d'ambiente (non
utilizzabile dai docenti); rimozione secca del launcher (viola Principio II).

## R2 — Dove vive il toggle e come si sdoppia la landing

**Decisione**: il contenuto di `#landing-view` sotto l'hero viene avvolto in due
contenitori: `#build-content` (tutto l'esistente: form fonti, tema, densità, ecc.)
e `#teach-content` (nuovo, vuoto in HTML, popolato via JS). Il toggle
Costruisci/Insegna + il toggle filtro classe stanno in una barra subito sotto
l'hero. Lo switch aggiunge/rimuove `hidden` sui due contenitori. Stato in
`localStorage 'mappai_landing_mode'` (`'build'` default | `'teach'`).

**Rationale**: zero rischi sul flusso di generazione (il DOM esistente non si
sposta, si nasconde); l'hero resta fuori dai contenitori → identica per requisito.

**Alternative**: due pagine HTML separate (duplica hero e script loading — fragile);
ricostruire la landing da zero (viola gradualità).

## R3 — Registro sessioni

**Decisione**: `localStorage 'mappai_session_registry'` — array di voci
`{map, projectId?, cls, activity, date}` con cap 400 (FIFO). Helper puri in un
nuovo modulo UMD `public/js/mappai-teach-core.js` (`registryAdd`, `classesForMap`,
`rankMapsForClass`, `normGrade`, …) testati in Node. Scrittura nei tre punti di
avvio sessione: hub Lavagna (`openCollabHub` → avvio riuscito), wizard Studio
attivo live (avvio sessione riuscito), pannello/quick-start Materiali
(pubblicazione/avvio server).

**Rationale**: tutte le sessioni partono dal renderer → localStorage basta; niente
IPC nuovo. Cap 400 ≈ anni di lezioni, quota trascurabile (voci ~100 byte).

**Alternative**: file su disco via IPC (serve solo se si vorrà sincronizzare tra
macchine — migrazione futura possibile, la API del core resta identica); ricavare
le associazioni dalle cartelle sessione su disco (fragile: rename/cancellazioni,
parsing di nomi cartella).

## R4 — Grade sul progetto e confronto "stesso grade"

**Decisione**: nuovo campo `grade` (stringa libera, max 40 char, come il campo
`grade` delle classi) sulle voci di `tutor_ai_projects`. Il confronto usa
`normGrade()` nel core: NFKD, minuscole, `ª/°→a`, spazi collassati — stesso
approccio di `normalizeClassName` in mappai-live-core.js ("2ª A" ≡ "2a A").
Il menu di assegnazione propone i grade delle classi esistenti + testo libero.

**Rationale**: il grade delle classi è già testo libero — inutile inventare una
tassonomia; la normalizzazione risolve i mismatch tipografici reali.

**Alternative**: enum fisso di gradi (non copre i sistemi scolastici svizzeri
misti già presenti nel campo `system` delle classi); confronto esatto (fallisce
su "1a media" vs "1ª Media").

## R5 — Indice Quiz & flashcard

**Decisione**: `localStorage 'mappai_studysets_index'` — array di voci
`{projectId, mapName, setId, name, type, cls, date}`. Scritto (rigenerato per il
progetto corrente) dentro `StorageManager.saveCurrentProject()` leggendo
`appState.db.studySets` GIÀ in memoria — mai riparsando snapshot. La guardia
Studio-attivo esistente in testa a saveCurrentProject protegge anche l'indice.

**Rationale**: saveCurrentProject è il choke point di ogni persistenza (autosave
via monkey-patch di renderGraph incluso); il costo è riscrivere un array di
poche decine di voci. I progetti legacy compaiono al primo risalvataggio, come
da spec (FR-014).

**Alternative**: migrazione una-tantum che apre tutti gli snapshot (esclusa:
parsing di MB, rischio quota — la stessa ragione per cui `p.vault` fu migrato
con cautela una sola volta).

## R6 — Estensione archivio documenti

**Decisione**: in `mappai-study-export-core.js`: `DOCS_CAP` 12→30; `saveDoc`
accetta i nuovi `kind` `'nodesheet'` e `'timeline'` (oggi normalizza tutto a
synthesis/dossier — va rimossa la coercizione binaria). Hook nei generatori:
il Foglio nodi (mappai-print-dossier.js) e `_renderTimeline`
(mappai-timeline.js) chiamano `MappAIStudyDocs.save({kind, title, mapName, html})`
subito dopo aver costruito l'HTML completo, come già fanno Sintesi e Dossier.
La quota-guard esistente (`_docsWrite`: scarta i più vecchi finché entra) copre
già FR-012 — nessun lavoro nuovo.

**Rationale**: riusa l'infrastruttura del commit 716c41b senza cambiarne il
contratto; la sezione Materiali della landing legge `MappAIStudyDocs.list()`
(già metadata-only).

## R7 — Quick-start: dipendenze dei tre flussi

**Decisione** (verificato nel codice):
- **Lavagna** (`openCollabHub`) e **Studio attivo live** (`openLiveSetup`,
  privata) richiedono la mappa caricata (overlay sul root; domande dal grafo)
  → flusso: classe → mappa → `StorageManager.loadProject(id)` (sincrono) →
  apertura hub/wizard.
- **Materiali** (`openMaterialsPanel`, privata) NON richiede la mappa (server
  file + QR) → flusso: classe → scelta documento archiviato (filtrato) →
  `MappAILive.publishHtml(...)` → pannello con QR.
- `openLiveSetup` e `openMaterialsPanel` sono private nel modulo live-teacher:
  vanno esposte con due one-liner (`window.MappAILive.openSetup/openMaterials`).

**Rationale**: riusa i wizard esistenti (zero duplicazione di UI); il caricamento
implicito è già sincrono su localStorage.

**Alternative**: reimplementare mini-wizard dedicati nella landing (duplicazione
vietata dal buon senso e dal Principio II).

## R8 — Rendering sezioni e riuso del drawer

**Decisione**: `renderRecentProjects` (mappai-storage-lang.js) viene
parametrizzata sul contenitore di destinazione e su opzioni di colonna
(`{gradeMenu:true}` in Costruisci, `{classChips:true}` in Insegna) mantenendo
il layout tabellare esistente. Il markup del drawer `#projects-bar` viene
rimosso da index.html; il corpo della tabella si renderizza dentro le sezioni
collassabili. Le sezioni collassabili riusano il pattern visivo dei modali hub
(mappai-menu-hubs.js) portato inline sulla landing; tooltip via `data-tip`
(MappAITips, già globale).

**Rationale**: una sola funzione di rendering per le due modalità = una sola
fonte di verità per righe/azioni; il layout richiesto dall'utente È quello del
drawer attuale.

## R9 — Nuovo modulo UI e ordine di caricamento

**Decisione**: un solo file UI nuovo `public/js/mappai-landing-teach.js`
(toggle, sezioni Insegna, picker classe/mappa, quick-start) + un core puro
`public/js/mappai-teach-core.js` (UMD, testato: registro, ranking, normGrade,
index ops, filtro per classe). Caricati in index.html dopo `app.js` (core prima
della UI), prima di `admin_prompts.js` — regola §10.2.

**Rationale**: separazione logica pura/DOM da Principio VI; un modulo UI unico
evita di spargere la landing su cinque file.

## R10 — i18n

**Decisione**: toggle e titoli di sezione presenti nell'HTML statico → chiavi
`data-i18n` in ENTRAMBI i dizionari. Stringhe generate da JS (righe, popup,
empty state) → `window.t('chiave', 'fallback IT')` con chiave solo in
en_translations.js. Regola VII/13 — nessuna eccezione.
