# 🔍 Audit Backend — MappAI Swiss Edition
> Analisi statica pura — nessuna modifica al codice. Data: 28-05-2026.

---

## 1. ANALISI DI main.js (964 righe, 40 KB)

### BrowserWindow create
Una **sola** finestra viene creata tramite `createWindow()`:

```
new BrowserWindow({
  width: 1280,
  height: 800,
  title: "MappAI",
  webPreferences: {
    nodeIntegration: false,       ✅ SICURO
    contextIsolation: true,       ✅ SICURO
    preload: 'public/js/preload.js'
  }
})
```
- Nessuna finestra secondaria o finestra di dialogo dedicata.
- `mainWindow` è una variabile globale esposta nel modulo — non è isolata.

---

### IPC Handlers registrati (tutti via `ipcMain.handle`)

| Canale | Riga | Descrizione |
|--------|------|-------------|
| `generate-gemini` | 90 | Proxy HTTP verso Google Generative Language API. Riceve `{ apiKey, payload, model }`. Usa axios con timeout 10 min. Scrive `.gemini_status.json` nella root dell'app come file di stato. |
| `generate-infomaniak` | 120 | Proxy streaming verso Infomaniak `/chat/completions`. Legge lo stream SSE (`data:` events), ricostruisce la risposta in formato OpenAI standard. |
| `list-infomaniak-models` | 197 | GET `/openai/v1/models` su Infomaniak. Usa `https.request` nativo (non axios). Timeout 30s con `req.abort()` ⚠️. |
| `list-models` | 248 | GET lista modelli Gemini filtrati per `generateContent`. Usa `https.request` nativo. Timeout 30s con `req.abort()` ⚠️. |
| `open-external` | 286 | Apre una URL nel browser di sistema via `shell.openExternal`. |
| `capture-page` | 296 | Screenshot dell'intera finestra Electron via `mainWindow.capturePage()`. Ritorna dataURL. |
| `save-map-json` | 303 | Salva la mappa come JSON singolo in `~/Documents/MappAI - Vault/`. Filename auto-generato da `extractionMode` + `rootNodeLabel`. |
| `save-pdf-to-vault` | 327 | Salva un PDF (passato come base64) nel Vault. |
| `save-chat-transcript` | 351 | Salva trascrizioni chat tutor come `.txt` in sottocartella `Chat/`. Append se il file esiste già. |
| `save-quiz-text-response` | 383 | Salva risposta testo quiz come `.txt` in `Quiz e Flashcard/`. |
| `save-vault` | 412 | **Principale salvataggio strutturato (DAL)**. Scrive: `index.yaml`, `links.json`, un `.md` per nodo in `Nodi/`, immagini in `Allegati/`, `fonti_e_link.txt`, `chat_state.json`, set di studio in `Materiale Studio/`. Ritorna `upgrades` (mappa ID→path immagini). |
| `load-vault` | 604 | Caricamento inverso del Vault. Legge `index.yaml`, `links.json`, tutti i `.md` in `Nodi/`, `chat_state.json`, JSON in `Materiale Studio/`. Parser manuale YAML line-by-line (non usa libreria YAML). |
| `get-all-vaults` | 735 | Scansiona `~/Documents/MappAI - Vault/` e ritorna lista di Vault con metadati (da `index.yaml`). Ordinati per `lastUpdated` desc. |
| `pick-folder` | 776 | Dialog nativo `showOpenDialog` per selezione cartella. |
| `open-save-folder` | 789 | Apre `~/Documents/MappAI - Vault/` in Finder/Explorer. |
| `upload-file-gemini` | 799 | Upload resumable a Google File API (per audio/video). Implementa il protocollo a 2 fasi (start → upload). |
| `pick-file` | 859 | Dialog nativo `showOpenDialog` per selezione file singolo. |
| `parse-docx` | 873 | Estrae testo raw da DOCX via `mammoth`. |
| `get-machine-id` | 883 | Genera un Machine ID deterministico: MAC address + modello CPU → SHA-256 → 10 chars. Usato per il licensing offline. |
| `fetch-url` | 900 | Scraping HTTP di URL pubbliche via axios + cheerio. Gestione speciale per Wikipedia (`#mw-content-text p`). Limite 50.000 chars. |
| `load-prompts` | 927 | Carica `prompts_config.json` dalla root app, poi overlays con versione personalizzata dall'utente da `userData/`. |
| `save-prompts` | 953 | Salva prompt personalizzati in `userData/prompts_config.json`. |

**Totale: 22 handler IPC**

---

### Moduli Node.js usati

| Modulo | Tipo | Scopo |
|--------|------|-------|
| `fs` | Nativo | File system completo (read/write/mkdir/exists/stat) |
| `path` | Nativo | Gestione percorsi |
| `https` | Nativo | HTTP/S per 2 handler (`list-*`) |
| `os` | Nativo | MAC address e info CPU (machine-id) |
| `crypto` | Nativo | SHA-256 per machine-id |
| `app`, `BrowserWindow`, `ipcMain`, `dialog`, `shell` | Electron | API principali |

### Moduli npm esterni

| Modulo | Versione | Scopo reale |
|--------|---------|-------------|
| `axios` | ^1.16.0 | HTTP client per Gemini e Infomaniak (`generate-*`, `fetch-url`) |
| `cheerio` | ^1.2.0 | HTML parsing/scraping per `fetch-url` |
| `mammoth` | ^1.12.0 | Estrazione testo da DOCX |

### Blocchi commentati / TODO / FIXME
- **Zero** commenti TODO, FIXME o HACK in `main.js`.
- Alcuni commenti inline descrittivi ("// Phase 1", "// Phase 2") senza debito tecnico.

### API deprecated
- ⚠️ **`req.abort()`** usato 2 volte (righe 240, 281) — deprecata in Node.js 14+. La versione corrente dovrebbe usare `AbortController` e `signal`. Funziona ancora ma potrebbe causare warning in future versioni di Electron.
- ⚠️ **Parser YAML manuale**: `load-vault` e `get-all-vaults` parsano `index.yaml` con split righe e indexOf(':') invece di una libreria YAML. Funziona ma è fragile se i valori contengono `:`.

### File creati/scritti che potrebbero non esistere
- `.gemini_status.json` nella root `__dirname` (riga 91) — scritto direttamente nella cartella dell'app, non in `userData`. In ambiente produzione `.app` potrebbe essere nella posizione sbagliata o generare errori di permesso.

---

## 2. ANALISI DI storageAdapter.js (1.272 righe, 64 KB)

### Scopo architetturale
Questo file è un **polyfill** intelligente: se l'app è in Electron, non fa nulla (early return). Se è su iPadOS/Capacitor o browser, **sostituisce integralmente** `window.electronAPI` con implementazioni alternative che usano:
- **IndexedDB** per storage locale (chiavi/valori)
- **Capacitor Filesystem API** per file system su iPad
- **localStorage** come fallback browser
- Chiamate HTTP dirette (fetch) per le API AI su iPad

### Struttura del Vault (come vengono salvati i dati)

```
~/Documents/MappAI - Vault/
└── [NomeVault]/               ← cartella per mappa
    ├── index.yaml             ← metadati mappa (extractionMode, rootNodeLabel, etc.)
    ├── links.json             ← array di relazioni {source, target, rel, isCross}
    ├── fonti_e_link.txt       ← indice testuale di tutti i link esterni
    ├── chat_state.json        ← stato sessione tutor AI
    ├── Nodi/                  ← un .md per nodo con frontmatter YAML
    │   ├── {label}_{id}.md
    │   └── ...
    ├── Allegati/              ← immagini estratte dai nodi (base64 → file)
    │   └── {nodeId}_{idx}.jpg
    ├── Materiale Studio/      ← quiz e flashcard come JSON
    │   └── {title}_{id}.json
    └── Chat/                  ← trascrizioni chat (append)
        └── {progetto}_{data}.txt
```

### Operazioni esposte verso il renderer

Il polyfill implementa le stesse firme di `window.electronAPI`:

| Funzione | Descrizione iPad |
|----------|-----------------|
| `getAllVaults` | Scansione ricorsiva via Capacitor Filesystem |
| `loadVault` | Lettura `index.yaml` + `links.json` + `Nodi/*.md` via Capacitor |
| `saveVault` | Scrittura intera struttura vault via Capacitor |
| `saveMapJSON` | Salva JSON mappa in IndexedDB (fallback browser) |
| `saveChatTranscript` | Salva `.txt` in `Chat/` via Capacitor |
| `saveQuizTextResponse` | Salva quiz in `Quiz e Flashcard/` |
| `loadPrompts` | Legge da IndexedDB + overlay personalizzati |
| `savePrompts` | Scrive in IndexedDB |
| `pickFolder` | Su iPad: dialog custom popup (no filesystem API nativa) |
| `pickFile` | File picker nativo via `<input type=file>` |
| `getPathForFile` | Ritorna il nome del file (no percorso assoluto su iPad) |
| `openSaveFolder` | No-op su iPad (non applicabile) |
| `parseDocx` | Carica mammoth.js dinamicamente via CDN, poi processa |
| `listInfomaniakModels` | fetch diretto verso Infomaniak API |
| `listModels` | fetch diretto verso Google API |
| `generateInfomaniak` | fetch diretto con mock stream |
| `generateGemini` | fetch diretto verso Google API |
| `fetchUrl` | fetch diretto (CORS potrebbe bloccare su web) |
| `uploadFileGemini` | fetch diretto per upload resumable |
| `getMachineId` | Genera ID da `navigator.userAgent` (non deterministico) |
| `openExternal` | `window.open(url, '_blank')` |
| `capturePage` | `html2canvas` caricato dinamicamente via CDN |

### Meccanismo di storage
- Su Electron: **fs nativo** (via IPC → main.js)
- Su Capacitor/iPad: **Capacitor Filesystem** + **IndexedDB** per settings
- Su browser: **localStorage** + **IndexedDB**
- Non usa `electron-store`

### Funzioni duplicate o evolutive
- **`loadVault` / `saveVault`** esistono sia in `main.js` (Electron) che in `storageAdapter.js` (Capacitor). Le implementazioni sono parallele ma non condividono codice — rischio di divergenza.
- `loadMammothLibrary()` e `loadHtml2Canvas()` caricano librerie da CDN a runtime — dipendenza da connettività internet per funzionalità di base su iPad.

---

## 3. ANALISI DI preload.js (28 righe)

### API esposte via contextBridge

```js
window.electronAPI = {
  generateGemini, generateInfomaniak,
  listModels, listInfomaniakModels,
  saveMapJSON, openSaveFolder,
  uploadFileGemini, getPathForFile,
  parseDocx, pickFile,
  getMachineId,
  saveChatTranscript, saveQuizTextResponse,
  savePDFToVault,
  saveVault, loadVault, pickFolder,
  fetchUrl, getAllVaults,
  loadPrompts, savePrompts,
  openExternal, capturePage
}  // 23 metodi totali
```

### Corrispondenza preload ↔ main.js

| Metodo preload | Handler main.js | Stato |
|----------------|----------------|-------|
| `generateGemini` | `generate-gemini` | ✅ |
| `generateInfomaniak` | `generate-infomaniak` | ✅ |
| `listModels` | `list-models` | ✅ |
| `listInfomaniakModels` | `list-infomaniak-models` | ✅ |
| `saveMapJSON` | `save-map-json` | ✅ |
| `openSaveFolder` | `open-save-folder` | ✅ |
| `uploadFileGemini` | `upload-file-gemini` | ✅ |
| `getPathForFile` | *(webUtils.getPathForFile — Electron API diretta)* | ✅ |
| `parseDocx` | `parse-docx` | ✅ |
| `pickFile` | `pick-file` | ✅ |
| `getMachineId` | `get-machine-id` | ✅ |
| `saveChatTranscript` | `save-chat-transcript` | ✅ |
| `saveQuizTextResponse` | `save-quiz-text-response` | ✅ |
| `savePDFToVault` | `save-pdf-to-vault` | ✅ |
| `saveVault` | `save-vault` | ✅ |
| `loadVault` | `load-vault` | ✅ |
| `pickFolder` | `pick-folder` | ✅ |
| `fetchUrl` | `fetch-url` | ✅ |
| `getAllVaults` | `get-all-vaults` | ✅ |
| `loadPrompts` | `load-prompts` | ✅ |
| `savePrompts` | `save-prompts` | ✅ |
| `openExternal` | `open-external` | ✅ |
| `capturePage` | `capture-page` | ✅ |

**Corrispondenza: 23/23 ✅ — Perfetta. Nessun canale orfano.**

### API mai chiamate da app.js

Controllando l'uso in tutti i file renderer:

| Metodo | app.js | storageAdapter.js | admin_prompts.js | Totale |
|--------|--------|-------------------|------------------|--------|
| `getMachineId` | 0 | 3 | 0 | **3** (usato) |
| `loadPrompts` | 0 | 0 | 15 | **15** (usato) |
| `savePrompts` | 0 | 0 | 3 | **3** (usato) |
| `savePDFToVault` | 1 | 0 | 0 | 1 (usato) |

> Tutti i 23 metodi sono usati da almeno uno dei file renderer. **Nessun metodo orphan.**

---

## 4. ANALISI DI prompts_config.json (36 KB)

### Struttura
- **32 chiavi** totali — tutte stringhe (prompt testuali)
- Struttura **flat** (nessuna nidificazione)
- Naming convention: `{FEATURE}_{LINGUA}` (es. `MIND_MAP_FULL_TREE_IT`)
- Lingue presenti: **IT** e **EN** per ogni prompt → 16 coppie

### Prompt configurati per funzione

| Feature | IT | EN | Note |
|---------|----|----|------|
| `MIND_MAP_FULL_TREE` | ✅ | ✅ | Generazione mappa mentale completa |
| `KNOWLEDGE_GRAPH_FULL_TREE` | ✅ | ✅ | Generazione KG completo |
| `L1_MACRO_CATEGORIES` | ✅ | ✅ | Generazione categorie macro L1 |
| `MIND_MAP_BRANCH` | ✅ | ✅ | Espansione ramo mappa mentale (teacher) |
| `MIND_MAP_BRANCH_INFOMANIAK` | ✅ | ✅ | Versione branch per Infomaniak (più corta) |
| `KNOWLEDGE_GRAPH_SINGLE` | ✅ | ✅ | Generazione singolo nodo KG |
| `SEMANTIC_CORRELATION` | ✅ | ✅ | Correlazione semantica tra nodi |
| `SINGLE_QUIZ_TUTOR` | ✅ | ✅ | Quiz singola domanda |
| `SOCRATIC_TUTOR` | ✅ | ✅ | Tutor socratico interattivo |
| `SOTA_SECOND_BRAIN` | ✅ | ✅ | Analisi Second Brain (teacher) |
| `SOTA_SECOND_BRAIN_STUDENT` | ✅ | ✅ | Versione studente |
| `MIND_MAP_BRANCH_STUDENT` | ✅ | ✅ | Espansione ramo (studente) |
| `MIND_MAP_BRANCH_STUDENT_INFOMANIAK` | ✅ | ✅ | Versione Infomaniak studente |
| `KNOWLEDGE_GRAPH_SINGLE_STUDENT` | ✅ | ✅ | KG singolo nodo studente |
| `DYNAMIC_QUIZ` | ✅ | ✅ | Quiz adattivo |
| `FLASHCARD_GENERATOR` | ✅ | ✅ | Generatore flashcard |

### Prompt duplicati o simili
- `MIND_MAP_BRANCH` e `MIND_MAP_BRANCH_INFOMANIAK`: versione corta deliberata per Infomaniak (698 vs 1.900 chars) — non è un errore, è una scelta architetturale per rispettare i limiti di context window del modello.
- `SOTA_SECOND_BRAIN` (1.382 chars) e `SOTA_SECOND_BRAIN_STUDENT` (495 chars): versioni docente/studente con toni diversi — corretto.
- **Nessun prompt identico duplicato.**

### Modelli AI hardcoded
- Nel `prompts_config.json`: **nessun nome di modello** hardcoded.
- In `app.js`: katalogo hardcoded con modelli come `gemini-3.1-pro`, `gemini-3-flash`, `gemini-3.1-flash-lite` — ⚠️ questi modelli **non esistono ancora** (sono nomi speculativi). I modelli reali (`gemini-2.0-flash`, `gemini-2.5-flash`, etc.) sono anche presenti e corretti.

---

## 5. DIPENDENZE npm (package.json)

### Scripts npm
```json
"start": "electron ."        → Avvio dev (usa sorgenti live)
"pack":  "electron-builder --dir"  → Build senza installer (solo .app)
"dist":  "electron-builder"  → Build completa con installer DMG/AppImage
```
> ⚠️ Mancano script comuni: `lint`, `test`, `clean`. Nessun sistema di testing configurato.

### devDependencies

| Pacchetto | Versione | Stato |
|-----------|---------|-------|
| `electron` | ^30.0.0 | ✅ Stabile (v30.5.1 installata) |
| `electron-builder` | ^24.13.3 | ✅ Corrente |

### dependencies (runtime, incluse nell'app)

| Pacchetto | Versione | Usata dove | Note |
|-----------|---------|-----------|------|
| `axios` | ^1.16.0 | `main.js` (generate-gemini, generate-infomaniak, fetch-url) | ✅ Necessaria |
| `cheerio` | ^1.2.0 | `main.js` (fetch-url) | ✅ Necessaria |
| `mammoth` | ^1.12.0 | `main.js` (parse-docx) | ✅ Necessaria |
| `hyphenation.it` | ^0.2.1 | `public/js/it.js` (incluso via `<script>`) | ⚠️ La libreria npm non è importata da `main.js` — i file `hypher.js` e `it.js` in `public/js/` sono copie locali già incluse via `<script>`. La dipendenza npm è **ridondante** |
| `hypher` | ^0.2.5 | `public/js/hypher.js` (copia locale) | ⚠️ Stessa situazione di `hyphenation.it` — ridondante come dipendenza npm |

### Dipendenze mancanti (usate ma non dichiarate)
- Nessuna — tutte le librerie vendor (D3, jsPDF, Lucide, Tailwind) sono incluse come file locali in `public/js/`.

### Versioni problematiche
- `axios ^1.16.0` è recente e stabile.
- `electron ^30.0.0` — V8 aggiornato, nessun problema noto.

---

## 6. CARTELLA .agents/

### Struttura
```
.agents/
├── rules/       (8 file .md)
│   ├── aggiornamento-app.md
│   ├── check-funzioni-ipad.md
│   ├── dal-integrity-skill.md
│   ├── electron-packaging-skill.md
│   ├── graphify.md
│   ├── mapp-ai-backup.md
│   ├── multi-provider-ai-bridge.md
│   └── secure-backup-skill.md
└── workflows/   (2 file .md)
    ├── graphify.md
    └── standardize-modals.md
```

### Natura dei file
Questi file sono **artefatti dell'IDE Antigravity** — non fanno parte dell'applicazione MappAI a runtime. Sono regole e workflow per l'agente AI (Antigravity) che assiste lo sviluppo:
- `rules/`: linee guida comportamentali per l'assistente (come aggiornare la pack, come fare backup, compatibilità iPad, ecc.)
- `workflows/`: istruzioni step-by-step per operazioni ricorrenti

> **Non appartengono al codice distribuito** dell'app ma sono utili per lo sviluppo. Andrebbero ignorati da `.gitignore` se il repo è pubblico (contengono logica interna del workflow di sviluppo).

---

## 7. CARTELLA ios/ (struttura)

### Dati dimensionali
| Sottocartella | Dimensione | File |
|--------------|-----------|------|
| `ios/DerivedData/` | **322 MB** | ~migliaia (build Xcode) |
| `ios/App/` | ~27 MB | 701 file totali (senza DerivedData) |
| `ios/capacitor-cordova-ios-plugins/` | ~piccola | plugin nativi |

### Tecnologia
Il progetto iOS è generato da **Capacitor** (v3/v4) — confermato da:
- `ios/App/App/capacitor.config.json`
- `ios/App/App/config.xml` (Cordova compat layer)
- `ios/App/App.xcworkspace/` (workspace Xcode standard)
- `ios/App/Pods/` (CocoaPods per dipendenze native)
- Cartella `capacitor-cordova-ios-plugins/`

### File di build da gitignorare
| Percorso | Dimensione | Da gitignorare? |
|----------|-----------|----------------|
| `ios/DerivedData/` | 322 MB | ⚠️ **SÌ — assolutamente.** File di build Xcode, non versionabili |
| `ios/App/Pods/` | ~15 MB | ⚠️ **SÌ** — dipendenze CocoaPods, vanno rigenerati con `pod install` |
| `ios/App/App.xcworkspace/xcuserdata/` | piccola | ⚠️ **SÌ** — preferenze utente Xcode |

---

## 8. SICUREZZA BASE

### API key hardcoded
- **Nessuna API key hardcoded** trovata in `main.js`, `app.js`, `storageAdapter.js`, o nei file di configurazione.
- Le chiavi vengono passate **a runtime** dal renderer (dove l'utente le inserisce) via IPC.
- Il file `.gemini_status.json` scritto in `__dirname` non contiene chiavi, solo stati (`started/completed/error`).

### nodeIntegration / contextIsolation
```
nodeIntegration: false   ✅ CORRETTO — il renderer non ha accesso a Node.js
contextIsolation: true   ✅ CORRETTO — JS del renderer isolato da preload
```
**Configurazione di sicurezza Electron: ottimale.**

### Pattern `Bearer` / token
- In `main.js`, `Bearer ${apiKey}` è usato correttamente (interpolazione di variabile, non valore hardcoded).
- Nessun token statico trovato.

### Rischi residui di sicurezza
1. ⚠️ Il canale `fetch-url` esegue scraping HTTP di qualsiasi URL passata dal renderer. Se il renderer venisse compromesso, potrebbe essere usato per fare richieste arbitrarie dalla macchina dell'utente (SSRF locale).
2. ⚠️ Le API key vengono trasmesse dal renderer a main via IPC come plaintext nel payload. Non sono persistite su disco (sicuro), ma transitano in chiaro nel canale IPC.
3. ℹ️ `open-external` non valida che l'URL sia HTTP/HTTPS — teoricamente potrebbe aprire protocolli arbitrari (`file://`, `javascript:`, ecc.) se il renderer invia URL malevoli.

---

## 9. RIEPILOGO FINALE

### Complessità reale del backend

> **MEDIA-ALTA**

Il `main.js` è sorprendentemente **ben strutturato** per un progetto solo. È lineare (nessuna dipendenza circolare), tutti gli handler sono funzioni autonome, e la separazione renderer/main è rispettata. La complessità reale deriva da:
- La **duplicazione architetturale** Electron ↔ Capacitor gestita da `storageAdapter.js` (1.272 righe di polyfill)
- Il **DAL manuale** per il Vault (parser YAML homemade, sistema di file complesso)
- L'**assenza di testing** su qualsiasi layer

### 3 rischi tecnici principali

**🔴 RISCHIO 1 — Divergenza DAL Electron vs Capacitor**  
La logica di `save-vault` / `load-vault` è implementata due volte: in `main.js` (Electron) e in `storageAdapter.js` (Capacitor). Se si modifica una, l'altra deve essere aggiornata manualmente. Un bug in una porta solo ad andare fuori sync.

**🔴 RISCHIO 2 — Parser YAML manuale fragile**  
`load-vault` e `get-all-vaults` parsano `index.yaml` con `split('\n')` e `indexOf(':')`. Se un valore contiene `:` (es. una URL in `rootNodeLabel`, o un timestamp ISO), il parsing silenziosamente fallisce. Non esiste validazione.

**🟠 RISCHIO 3 — `req.abort()` deprecated + nessun test**  
Due handler (`list-infomaniak-models`, `list-models`) usano `req.abort()` deprecata. Il progetto non ha nessun test automatizzato (unit, integration, e2e). Qualsiasi refactoring del DAL è cieco.

### Priorità di refactoring backend (lista ordinata)

1. **Unificare la logica DAL** — Estrarre le funzioni `save-vault` / `load-vault` in un modulo condiviso, evitando la duplicazione Electron/Capacitor.

2. **Sostituire il parser YAML manuale** — Integrare la libreria `js-yaml` (già disponibile in `node_modules` come dipendenza transitiva) al posto del parsing line-by-line.

3. **Risolvere `req.abort()`** — Sostituire con `AbortController` + `signal` in entrambi gli handler HTTP nativi.

4. **Rimuovere `hypher` e `hyphenation.it` da `dependencies`** — Sono già incluse come file locali; le voci in `package.json` sono ridondanti e aumentano inutilmente il peso del bundle.

5. **Aggiungere script `test` e `lint`** — Anche solo `eslint` per il lint di `main.js` e i file renderer.

6. **Aggiungere `ios/DerivedData/` e `ios/App/Pods/` al `.gitignore`** — 322+ MB di artefatti Xcode nel repo.

7. **Validare `open-external` e `fetch-url`** — Aggiungere allowlist di protocolli (`http:`, `https:` only) per ridurre la superficie di attacco SSRF.

---

> **Report generato da analisi statica — nessun file modificato.**
