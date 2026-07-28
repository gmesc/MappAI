# Implementation Plan: MappAI - misuratore

**Branch**: `013-misuratore` | **Date**: 2026-07-28 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/013-misuratore/spec.md`

## Summary

Applicazione Electron autonoma che misura l'accessibilità del materiale didattico generato da MappAI, riproducendo in modo automatico e ripetibile l'assessment scritto a mano il 24/07/2026. Tre schermate: **ANALIZZA** (carica vault o PDF, confronta N elementi, produce un report `.html` editoriale), **ANDAMENTO** (aggrega l'archivio delle analisi su quattro assi), **METODO** (dichiara ogni parametro arbitrario e permette di ritoccarlo).

L'approccio tecnico ruota attorno a tre vincoli che si rinforzano: **i numeri li produce codice puro testato in Node**, l'AI riceve solo numeri già calcolati e scrive prosa; **ogni analisi è uno snapshot congelato** che porta dentro di sé il profilo di parametri completo, così da restare interpretabile e ricalcolabile per sempre; **la documentazione è generata dalla stessa configurazione che governa il calcolo**, così che non possa divergere dal comportamento.

La fase di ricerca ha verificato eseguendo codice sui vault reali che 30 valori della pagina di riferimento sono riproducibili al centesimo, e che i restanti non lo sono perché i parametri del 2026 non furono scritti da nessuna parte — il che è la giustificazione empirica dell'intera user story 8.

## Technical Context

**Language/Version**: JavaScript. Renderer in Vanilla JS senza bundler; core puri in UMD richiamabili da Node 20+ (runtime di Electron 39).

**Primary Dependencies**: Electron 39.x. `js-yaml` per `index.yaml`. PDF.js vendorizzato da MappAI. Icone Lucide vendorizzate. **Nessun Tailwind** (R4), nessuna libreria di grafici (R5), nessuna dipendenza di rete.

**Storage**: filesystem. `MappAI - misuratore - FILE/Upload/` (elementi importati, copiati) e `/Report/` (report `.html` con dati incorporati, più un archivio affiancato per la lettura rapida). Profili di parametri in un file JSON. Nessun dato applicativo in `localStorage` (FR-005) — solo preferenze di finestra.

**Testing**: `node --test`, stessa scelta di MappAI. Cartella `tests/` con fixture ricavate dai vault reali 1A e 1B.

**Target Platform**: desktop macOS (Apple Silicon e Intel), come MappAI. Nessun vincolo che impedisca Windows o Linux, non è un obiettivo di v1.

**Project Type**: applicazione desktop Electron a progetto singolo, indipendente da MappAI a runtime.

**Performance Goals**: analisi di due vault sotto i 5 secondi; estrazione di un PDF da 2 MB sotto i 10 secondi; ANDAMENTO su 100 analisi archiviate sotto i 2 secondi.

**Constraints**: funzionamento completamente offline salvo la chiamata AI opzionale (FR-051). Determinismo assoluto: stesso input, stessi numeri (FR-009). Nessun passo di build.

**Scale/Scope**: utente singolo. Vault fino a ~200 nodi, PDF fino a ~100 pagine, archivio fino a qualche centinaio di analisi. Tre schermate, otto core puri.

## Constitution Check

*GATE: superato con due deroghe esplicite, registrate in Complexity Tracking.*

| Principio | Esito | Come |
|---|---|---|
| **I — Accessibilità BES/DSA** | ✅ | È l'oggetto stesso della feature. Nessuna informazione dal solo colore (FR-052); ogni grafico affiancato dalla tabella equivalente (R5); il componente 8 dell'indice nasce da un vincolo pedagogico reale, il costo inferenziale dei nessi impliciti. |
| **II — Reversibilità e gradualità** | ✅ | Gli snapshot non vengono mai riscritti; modificare un parametro crea un profilo nuovo (FR-055); il predefinito è sempre ripristinabile (FR-056); il ricalcolo crea e non distrugge (FR-058). Le fasi di consegna sotto sono ciascuna utilizzabile da sola. |
| **III — Script globali, no build step** | ✅ | Vanilla JS, core UMD su `window.*`, nessun bundler. **Più stretto della costituzione**: niente Tailwind da CDN, perché il vincolo offline del principio III è oggi violato in MappAI e non va importato (R4). |
| **IV — Dual-provider AI** | ⚠️ **DEROGA** | Solo Google. Vedi Complexity Tracking. |
| **V — Integrità del vault** | ✅ | Il misuratore **non scrive mai** dentro `Mappe/`: legge, copia in `Upload/`, e da lì lavora. Lettura tollerante ai formati legacy (link senza `rel` → `include`). |
| **VI — Logica pura testata** | ✅ | Otto core puri senza DOM né rete, `node --test`, fixture dai vault reali. La verifica di R1 è già di fatto il primo test di integrazione. |
| **VII — i18n bilingue** | ⚠️ **DEROGA** | Solo italiano. Vedi Complexity Tracking. |

### Rivalutazione dopo la Phase 1

Il design non introduce violazioni nuove. Tre punti si sono **rafforzati** passando dai principi ai contratti:

- **Principio VI** — `buildBaseline` lancia se riceve un Δ senza copertura: FR-023 smette di essere una regola che chi scrive il builder deve ricordare e diventa una forma che il dato non può assumere.
- **Principio II** — `mis-profile-core.derive` non ha una variante che modifichi un profilo in loco: la reversibilità è nell'assenza di quella funzione, non nella disciplina di non chiamarla.
- **Principio I** — R5 impone la tabella accanto a ogni grafico, quindi l'ANDAMENTO nasce già leggibile senza vedere le curve.

Un rischio **emerso** dal design e non presente nella spec: `mis-ai-prose.buildPrompt` riceve l'Analisi intera, che al suo interno ha i testi dei nodi dentro le viste appaiate. FR-034 vieta di passarli quando la richiesta riguarda conteggi, ma la struttura dati glieli mette a portata. **Mitigazione da imporre nei task**: `buildPrompt` non riceve l'Analisi ma una proiezione già ripulita, costruita da una funzione separata e testata — così il testo non è raggiungibile per errore invece che vietato per convenzione.

## Project Structure

### Documentation (this feature)

```text
specs/013-misuratore/
├── plan.md              # questo file
├── research.md          # Phase 0 — calibrazione sui vault reali e decisioni tecniche
├── data-model.md        # Phase 1 — entità e schema dello snapshot
├── quickstart.md        # Phase 1 — scenari di validazione eseguibili
├── contracts/           # Phase 1 — API dei core puri, superficie IPC, schema snapshot
└── tasks.md             # Phase 2 — prodotto da /speckit-tasks, NON da questo comando
```

### Source Code (repository root)

```text
MappAI - misuratore/
├── package.json                      # electron 39.x, js-yaml; script start/test/pack
├── main.js                           # processo main: finestre, IPC, tutto l'I/O su disco
├── preload.js                        # contextBridge — unica superficie renderer→main
├── .gitignore                        # esclude "MappAI - misuratore - FILE/"
├── RIUSO.md                          # inventario delle copie da MappAI (R6)
├── public/
│   ├── index.html                    # landing a tre tab
│   ├── report-viewer.html            # finestra che mostra un report generato
│   ├── css/
│   │   └── misuratore.css            # token MappAI scritti a mano (R4)
│   ├── js/
│   │   ├── core/                     # ── logica pura, zero DOM, testata in Node ──
│   │   │   ├── mis-text-core.js      # tokenizzazione, frasi, Gulpease, Flesch-Vacca, sillabe, proxy lessicali
│   │   │   ├── mis-struct-core.js    # metriche di grafo dai nodi e dai link
│   │   │   ├── mis-coverage-core.js  # copertura della fonte (FR-022)
│   │   │   ├── mis-quiz-core.js      # metriche dei set di verifica, somiglianza distrattori
│   │   │   ├── mis-cost-core.js      # abbinamento consumi, costi in CHF (R7)
│   │   │   ├── mis-index-core.js     # indice composito, fattore di sostanza, Δ, ridistribuzione pesi
│   │   │   ├── mis-compare-core.js   # appaiamento concetti, esclusivi, matrice, strategia di resa per N
│   │   │   ├── mis-trend-core.js     # aggregazione dell'archivio sui quattro assi
│   │   │   └── mis-profile-core.js   # profilo di parametri: schema, validazione, ridistribuzione, identificativo
│   │   ├── riuso/                    # ── copie dichiarate da MappAI (R6) ──
│   │   │   ├── it-tokens.js          # da mappai-desc-fidelity.js
│   │   │   ├── edge-families.js      # da mappai-relations.js
│   │   │   ├── quiz-normalize.js     # da mappai-docedit-core.js
│   │   │   └── files-names.js        # da mappai-files-core.js
│   │   ├── vendor/
│   │   │   ├── pdf.min.js            # da MappAI public/js/
│   │   │   ├── lucide.min.js
│   │   │   └── js-yaml.min.js
│   │   ├── ingest/
│   │   │   ├── mis-ingest-vault.js   # vault → elemento + contesto fotografato
│   │   │   ├── mis-ingest-pdf.js     # PDF → blocchi di testo, ricucitura sillabazione (R3)
│   │   │   └── mis-ingest-html.js    # sintesi HTML → blocchi strutturati (R9)
│   │   ├── report/
│   │   │   ├── mis-report-build.js   # analisi → HTML editoriale autoconsistente
│   │   │   ├── mis-report-style.js   # foglio di stile editoriale come stringa
│   │   │   └── mis-report-limits.js  # sezione «limiti» generata dal profilo (FR-054)
│   │   ├── ai/
│   │   │   └── mis-ai-prose.js       # prosa interpretativa + verifica delle cifre citate
│   │   ├── ui/
│   │   │   ├── ui-analizza.js
│   │   │   ├── ui-andamento.js
│   │   │   └── ui-metodo.js          # generato dal profilo, non scritto a mano (FR-054)
│   │   ├── i18n/it.js
│   │   └── app.js                    # bootstrap, commutazione tab, stato
│   └── profili/
│       └── predefinito.json          # indice-accessibilita@1 (Allegato A della spec)
├── tests/
│   ├── fixtures/                     # nodi, links, sintesi ridotti da 1A e 1B
│   ├── text-core.test.js
│   ├── struct-core.test.js
│   ├── index-core.test.js
│   ├── coverage-core.test.js
│   ├── quiz-core.test.js
│   ├── cost-core.test.js
│   ├── compare-core.test.js
│   ├── trend-core.test.js
│   ├── profile-core.test.js
│   ├── riuso-divergenza.test.js      # confronta EDGE_FAMILIES con l'originale MappAI (R6)
│   └── riferimento-2026.test.js      # i 30 valori di SC-001 sui vault reali
└── MappAI - misuratore - FILE/
    ├── Upload/
    └── Report/
```

**Structure Decision**: progetto singolo dentro la root `/MappAI re`, come richiesto, con la cartella dati **dentro** la cartella di progetto. La separazione portante è fra `public/js/core/` — logica pura, senza DOM, senza rete, senza `require` di Electron, l'unica parte coperta da test — e tutto il resto. `main.js` fa esclusivamente I/O e finestre; i core non sanno che esiste un disco. `public/js/riuso/` è tenuto separato da `core/` perché è codice **non nostro**: va aggiornato guardando l'originale, non modificato in loco.

## Fasi di consegna

Ciascuna è utilizzabile da sola e verificabile senza le successive (principio II).

| Fase | Contenuto | User story | Verificabile con |
|---|---|---|---|
| **1** | Guscio Electron, `Upload/` e `Report/`, import vault, elenco elementi e report | US2 | L'app si apre, importa i due vault reali, li elenca dopo un riavvio |
| **2** | Core testo e struttura, report deterministico a 2 elementi | US1 | `riferimento-2026.test.js`: i 30 valori di SC-001 |
| **3** | Profilo di parametri, indice composito, tab METODO generato dal profilo | US8, FR-031/033 | Cambiare un peso e vedere l'indice muoversi; profilo incoerente rifiutato |
| **4** | Estrazione PDF, baseline fonte→prodotto, copertura | US3 | Δ e copertura su `1B` che ha `Fonti/09b_funzioni urbane.pdf` |
| **5** | Lenti quiz, costi, nessi logici, coerenza e ridondanza | US7, FR-024/030-bis | Totali che tornano con `generationUsage` |
| **6** | Confronto a N con le tre strategie di resa | US6 | Report a 2, 4 e 9 elementi senza scorrimento orizzontale |
| **7** | ANDAMENTO | US5 | Tre analisi di registri diversi, quattro assi, avviso sotto le 3 analisi |
| **8** | Prosa AI e verifica delle cifre citate | US4 | Numeri identici prima e dopo la prosa |

La fase 3 arriva presto di proposito: se il profilo di parametri viene aggiunto dopo che esistono analisi, quelle analisi nascono senza profilo incorporato e l'archivio parte già rotto.

## Complexity Tracking

| Violazione | Perché serve | Alternativa più semplice, e perché è stata scartata |
|---|---|---|
| **Principio IV — solo Google, niente Infomaniak** | Il principio esiste per il GDPR sui dati educativi. Qui all'AI arrivano soltanto numeri aggregati e metadati di classe: mai testi di studenti, mai testi di schede, mai nominativi. Lo strumento è interno e non tratta dati di allievi identificabili. Sostenere due provider raddoppierebbe la superficie di test di una funzione opzionale e non essenziale. | Implementare entrambi come impone la costituzione: scartato perché il costo ricade su una funzione che si può disattivare del tutto senza perdere il prodotto, e il rischio che il principio protegge qui non si materializza. **La deroga decade** se all'AI dovessero mai arrivare testi anziché numeri: in quel caso va riaperta prima di procedere. |
| **Principio VII — solo italiano** | Strumento interno con un solo utilizzatore. Le chiavi bilingui costerebbero lavoro su ogni stringa di tre schermate per un beneficio oggi nullo. | i18n completa dal primo giorno: scartata. **Mitigazione adottata**: le stringhe restano centralizzate in `i18n/it.js` invece di essere sparse nel codice, così aggiungere l'inglese in seguito è un file nuovo, non una riscrittura. |
| **Cartella dati dentro la cartella di progetto** | Richiesta esplicita dell'utente, comoda in sviluppo perché tutto sta sotto gli occhi. | Cartella in `~/Documents` come fa MappAI: è la scelta corretta per un'app distribuita, perché dentro un `.app` impacchettato il percorso di progetto è in sola lettura. **Da riaffrontare prima della pacchettizzazione**, non prima. Il codice risolve la radice dati con una sola funzione, così lo spostamento resterà un cambio in un punto. |
| **Copia del codice invece di riuso per riferimento** | Un `require` che risale in `../../public/js/` legherebbe l'avvio del misuratore alla struttura interna di MappAI, che è in pieno refactoring. | Pacchetto condiviso o link: scartati perché richiederebbero di ristrutturare MappAI per servire il misuratore. **Mitigazione**: intestazioni con origine e data, `RIUSO.md`, e un test che rileva la divergenza di `EDGE_FAMILIES` fallendo con l'istruzione di cosa aggiornare. |
