# 🔍 Audit Frontend — MappAI Swiss Edition
> Analisi statica pura — nessuna modifica al codice. Data: 28-05-2026.

---

## 1. STRUTTURA GENERALE

### Root del progetto (file non di struttura standard)

| File | Dimensione | Nota |
|------|-----------|------|
| `main.js` | 40 KB / 963 righe | ✅ Main process Electron — legittimo |
| `package.json` | 4 KB | ✅ Configurazione npm — legittimo |
| `package-lock.json` | 164 KB | ✅ Lockfile — legittimo |
| `prompts_config.json` | 36 KB | ✅ Configurazione AI — legittimo |
| `.gitignore` | 4 KB | ✅ — legittimo |
| **`spinner.jsx`** | 8 KB | ⚠️ **File JSX nella root** — non è un componente React integrato nel progetto; sembra uno snippet di lavoro abbandonato |
| **`refactor.py`** | 12 KB | ⚠️ Script di refactoring passato — non fa parte dell'app |
| **`refactor_html.py`** | 4 KB | ⚠️ Script passato |
| **`replace_rings.py`** | 4 KB | ⚠️ Script passato |
| **`update_css_comments.py`** | 12 KB | ⚠️ Script passato |
| **`update_manual_file.py`** | 4 KB | ⚠️ Script passato |
| **`add_step_title.py`** | 4 KB | ⚠️ Script passato |
| **`apply_css_manual.py`** | 4 KB | ⚠️ Script passato |
| **`apply_input_label_sm.py`** | 4 KB | ⚠️ Script passato |
| **`clean_css.py`** | 4 KB | ⚠️ Script passato |
| **`extract_texts.py`** | 4 KB | ⚠️ Script passato |
| **`finalize_refactor.py`** | 4 KB | ⚠️ Script passato |
| **`fix_html_classes.py`** | 4 KB | ⚠️ Script passato |
| **`inject_tailwind.py`** | 4 KB | ⚠️ Script passato |
| **`mask_icon.py`** | 4 KB | ⚠️ Script passato |
| **`parse_css.js`** | 4 KB | ⚠️ Script di analisi passato — non importato da nessuna parte |
| **`parse_drawer.py`** | 4 KB | ⚠️ Script passato |
| **`parse_html_elements.py`** | 4 KB | ⚠️ Script passato |
| **`parse_html_sections.py`** | 4 KB | ⚠️ Script passato |
| **`parse_html_texts.py`** | 4 KB | ⚠️ Script passato |
| **`parse_landing.py`** | 4 KB | ⚠️ Script passato |
| **`parse_landing_2.py`** | 4 KB | ⚠️ Script passato |
| **`patch_dossier.py`** | 8 KB | ⚠️ Script di patch sessione corrente |
| **`patch_dossier2.py`** | 4 KB | ⚠️ Script di patch sessione corrente |
| **`crash_funzionamento_00.txt`** | 144 KB | ⚠️ **Log di crash** — file di debug, non appartiene al repo |
| **`Senior Frontend Developer.txt`** | 8 KB | ⚠️ Documento di testo (job posting?) — non appartiene al progetto |
| **`power _keys.rtf`** | 4 KB | ⚠️ **File RTF** — appunti personali, non appartiene al progetto |
| **`build_result.json`** | 4 KB | ⚠️ Output di build — da escludere o gitignorare |
| **`generatore_sblocchi_MappAI.html`** | 8 KB | ⚠️ HTML standalone non collegato all'app principale |
| `implementation_plan*.md` (×8) | vari | ⚠️ Piani di implementazione vecchi — non fa parte dell'app |
| `MappAI_Product_Sheet.md` | 8 KB | ℹ️ Documentazione — non dannoso |
| `merge_logic_analysis.md` | 4 KB | ℹ️ Documento tecnico di analisi — non dannoso |
| `cli_printing_press_ideas.md` | 8 KB | ℹ️ Note di brainstorming |

> **Conteggio file "estranei" nella root**: ~25 file non necessari per il funzionamento dell'app.

---

## 2. ANALISI FRONTEND (cartella `public/`)

### File HTML

| File | Dimensione | Righe | Descrizione |
|------|-----------|-------|-------------|
| `public/index.html` | 204 KB | **3.245** | ✅ File principale dell'app. Contiene tutta la struttura UI: sidebar, modali, pannelli, canvas D3, overlay. |
| `public/index_classi_nuove_modifiche_manual.html` | 188 KB | 2.967 | ⚠️ **Backup/fork** di `index.html` con sole 608 righe di diff — versione di "lavoro manuale" probabilmente abbandonata. Non è referenziato da `main.js` né da nessun altro file. |
| `public/map_font_config.html` | 196 KB | 2.937 | ⚠️ **Backup/fork** quasi identico a `index.html` (2.737 righe di diff dal `index_classi`, simile in struttura). Non è referenziato da `main.js`. Probabilmente uno snapshot per test tipografici. |

> ⚠️ Solo `index.html` è l'entry point reale (dichiarato in `main.js`). Gli altri due HTML sono **ridondanti**.

### File CSS

| File | Dimensione | Righe | Descrizione |
|------|-----------|-------|-------------|
| `public/css/style.css` | 76 KB | **2.723** | ✅ CSS principale attivo |
| `public/css/style.css.bak_1779657330` | 68 KB | 2.437 | ⚠️ Backup automatico — 766 righe di diff con l'attuale. Da eliminare |
| `public/css/style_refactored.css.bak` | 68 KB | 2.439 | ⚠️ Backup "refactored" — quasi identico al bak precedente (solo 59 righe di diff tra i due). Da eliminare |

> L'attuale `style.css` è ~286 righe più grande dei backup — le modifiche sono state accumulate direttamente senza un sistema di versioning.

### File JavaScript (renderer process)

| File | Dimensione | Righe | Descrizione |
|------|-----------|-------|-------------|
| `public/js/app.js` | 524 KB | **12.177** | ✅ Nucleo completo dell'app: logica grafo D3, AI, modali, import/export, KG, study mode, dossier PDF, etc. |
| `public/js/storageAdapter.js` | 64 KB | 1.272 | ✅ Astrazione storage Electron/Capacitor. Gestisce file I/O, vault, JSON |
| `public/js/admin_prompts.js` | 16 KB | 360 | ✅ UI per gestione dei prompt AI nel pannello admin |
| `public/js/infomaniak_bridge.js` | 8 KB | 121 | ✅ Bridge API verso Infomaniak AI |
| `public/js/infomaniak_bridge.js.bak` | 8 KB | ~121 | ⚠️ **Backup** — identico o quasi all'originale. Da eliminare |
| `public/js/preload.js` | 4 KB | 27 | ✅ Preload script Electron (IPC bridge) |
| `public/js/hypher.js` | 8 KB | 194 | ✅ Libreria sillabazione (dipendenza di `it.js`) |
| `public/js/it.js` | 4 KB | 18 | ✅ Regole di sillabazione italiana (usata da hypher) |
| `public/traduzioni/it_translations.js` | 16 KB | ~400 | ✅ Dizionario traduzioni italiano |
| `public/traduzioni/en_translations.js` | 16 KB | ~400 | ✅ Dizionario traduzioni inglese |

### Librerie minificate (vendor, incluse via `<script>`)

| File | Dimensione | Importata in `index.html`? |
|------|-----------|---------------------------|
| `public/js/tailwind.js` | 400 KB | ✅ Sì (riga 16) |
| `public/js/d3.v7.min.js` | 276 KB | ✅ Sì (riga 28) |
| `public/js/lucide.min.js` | 392 KB | ✅ Sì (riga 31) |
| `public/js/jspdf.umd.min.js` | 356 KB | ✅ Sì (riga 22) |
| `public/js/pdf.min.js` | 276 KB | ✅ Sì (riga 19) |
| `public/js/svg2pdf.umd.min.js` | 88 KB | ⚠️ **NON referenziata** in `index.html`. Usata indirettamente via fallback in `app.js` (L12032) ma il bundle non viene mai caricato. |

### File JSX fuori posto

| File | Descrizione |
|------|-------------|
| **`spinner.jsx`** (root) | File JSX da 8 KB nella root del progetto. Non c'è React o Vite configurato — non viene compilato né importato. Snippet abbandonato. |

---

## 3. COMPONENTI E DIPENDENZE

### Catena di import in `index.html`
```
index.html
 ├── js/tailwind.js         (vendor, via <script>)
 ├── js/pdf.min.js          (vendor, via <script>)
 ├── js/jspdf.umd.min.js    (vendor, via <script>)
 ├── js/d3.v7.min.js        (vendor, via <script>)
 ├── js/lucide.min.js       (vendor, via <script>)
 ├── traduzioni/it_translations.js
 ├── traduzioni/en_translations.js
 ├── js/hypher.js
 ├── js/it.js
 ├── js/infomaniak_bridge.js
 ├── js/storageAdapter.js
 ├── js/app.js              (file principale, caricato DOPO storageAdapter)
 └── js/admin_prompts.js
```

### File mai importati
| File | Motivo |
|------|--------|
| `js/svg2pdf.umd.min.js` | Non incluso in nessun `<script>` tag |
| `public/map_font_config.html` | Non referenziato da `main.js` o `index.html` |
| `public/index_classi_nuove_modifiche_manual.html` | Non referenziato da `main.js` o `index.html` |
| `parse_css.js` (root) | Non importato da nessuno |

### Librerie via `<script>` invece che npm
Tutte le librerie vendor (Tailwind, D3, Lucide, jsPDF, pdf.min) sono incluse come file locali via `<script>` tag invece che tramite npm + bundler. Questa scelta è **deliberata per Electron** (no CSP issues, funziona offline) ma comporta:
- Aggiornamenti manuali
- Nessun tree-shaking
- Tailwind caricato in runtime play-mode (lento su cold start)

---

## 4. DUPLICAZIONI E RIDONDANZE

### File HTML
| Coppia | Differenza | Giudizio |
|--------|-----------|----------|
| `index.html` vs `index_classi_nuove_modifiche_manual.html` | 608 righe di diff | ⚠️ Fork di lavoro — va eliminato o unito |
| `index.html` vs `map_font_config.html` | Strutturalmente molto diverso | ⚠️ Versione sperimentale — non collegata |

### File CSS
| Coppia | Differenza | Giudizio |
|--------|-----------|----------|
| `style.css` vs `style.css.bak_1779657330` | 766 righe | ⚠️ Backup obsoleto |
| `style.css.bak_*` vs `style_refactored.css.bak` | Solo 59 righe | ⚠️ Quasi identici — doppione di doppione |

### File JS
| Coppia | Giudizio |
|--------|----------|
| `infomaniak_bridge.js` vs `infomaniak_bridge.js.bak` | ⚠️ Backup diretto |

### Funzioni definite più volte
- `app.js` contiene **196 funzioni su `window`** e **298 function declarations** totali. Data la dimensione (12.177 righe in un unico file monolitico), è **probabile** la presenza di funzioni duplicate o varianti evolutive non rimosse, ma richiederebbe un'analisi AST approfondita per quantificarle.

---

## 5. FILE ESTRANEI AL FRONTEND

### Categoria: Script Python di refactoring (20 file)
Questi file erano strumenti di migrazione/patch usati in sessioni passate. Non fanno parte dell'app.

| File | Azione consigliata |
|------|-------------------|
| `refactor.py`, `refactor_html.py` | Spostare in `/tools/` o eliminare |
| `clean_css.py`, `update_css_comments.py` | Spostare in `/tools/` |
| `patch_dossier.py`, `patch_dossier2.py` | Eliminare (usa specifici di sessione) |
| Tutti gli altri `*.py` | Spostare in `/tools/` o eliminare |

### Categoria: Documenti e note
| File | Azione consigliata |
|------|-------------------|
| `crash_funzionamento_00.txt` (144 KB) | Eliminare dal repo — aggiungere `*.txt` al gitignore |
| `Senior Frontend Developer.txt` | Eliminare — non pertinente |
| `power _keys.rtf` | Eliminare — appunti personali |
| `implementation_plan_*.md` (×8 nella root) | Spostare in `/docs/` o eliminare |
| `MappAI_Product_Sheet.md` | Spostare in `/docs/` |
| `Aggiornamento MappAI*.md` | Spostare in `/docs/` o eliminare |

### Categoria: File di build / artefatti
| File | Azione consigliata |
|------|-------------------|
| `build_result.json` | Aggiungere al `.gitignore` |
| `generatore_sblocchi_MappAI.html` | Spostare in `/tools/` se ancora utile |

---

## 6. RIEPILOGO FINALE

### Conteggi

| Metrica | Valore |
|--------|--------|
| File totali nel progetto (senza `node_modules`, `dist`, `.git`) | **9.233** |
| File tracciati da git | **6.777** |
| File nell'app `public/` attivi e necessari | ~15 |
| File nella root estranei all'app | ~25 |
| File CSS ridondanti | 2 (backup) |
| File HTML ridondanti | 2 (backup/fork) |
| File JS ridondanti | 2 (bak + svg2pdf non caricato) |
| File `.py` nella root | **~20** |

### Priorità di refactoring consigliata

1. **🔴 PRIORITÀ ALTA — `app.js` (12.177 righe)**: Il monolite principale è il rischio tecnico più grande. Andrebbe decomposto in moduli (ES modules o IIFE) per funzionalità: `graph.js`, `ai.js`, `pdf.js`, `modals.js`, `study.js`, ecc.

2. **🔴 PRIORITÀ ALTA — Eliminare file HTML duplicati**: `index_classi_nuove_modifiche_manual.html` e `map_font_config.html` non vengono caricati dall'app ma occupano ~400 KB e causano confusione.

3. **🟠 PRIORITÀ MEDIA — Eliminare backup CSS**: `style.css.bak_*` e `style_refactored.css.bak` — 140 KB di rumore.

4. **🟠 PRIORITÀ MEDIA — Pulire la root**: Spostare tutti i `.py` in `/tools/`, tutti i `.md` documentali in `/docs/`, eliminare i file di crash e personali.

5. **🟡 PRIORITÀ BASSA — Risoluzione `svg2pdf.umd.min.js`**: O includerlo correttamente in `index.html` o rimuoverlo. Il fallback in `app.js` non funziona se il bundle non è caricato.

6. **🟡 PRIORITÀ BASSA — Tailwind Play CDN**: Valutare la build di Tailwind CSS standalone (CLI) per migliorare i tempi di avvio — il runtime play-mode è lento.

7. **🟢 PRIORITÀ BASSA — `.gitignore` esteso**: Aggiungere pattern per `*.bak`, `*.txt` (opzionale), `build_result.json`, `*.py` nella root (se spostati).

---

## 7. GITIGNORE

### Contenuto attuale
```gitignore
# Dependencies
node_modules/
npm-debug.log*
yarn-debug.log*
yarn-error.log*

# Build outputs
dist/
release/
out/
*.dmg
*.AppImage
*.exe
*.zip

# OS files
.DS_Store
Thumbs.db

# IDEs
.vscode/
.idea/
*.swp

# Application state
*.log
app_data/
temp/

# Graphify
graphify-out/

# Generated Artifacts and Reports
implementation_plan.md
ipad_compatibility_report.md
xcode console.md
Xcode report *
*report*.md
*console*.md
```

### Problemi riscontrati

| Problema | Dettaglio |
|---------|----------|
| ⚠️ **`.DS_Store` è tracciato** | `.DS_Store` è nel `.gitignore` ma risulta **presente nel repo** sia in root che in `public/` e `dist/`. Va rimosso con `git rm --cached .DS_Store` |
| ⚠️ **`dist/` è nel `.gitignore` ma i file `dist/` sono "untracked ignored"** | I file `dist/` non sono tracciati correttamente — l'intera cartella dist è ignorata (OK) ma alcuni file come `.DS_Store` dentro dist emergono come ignored untracked |
| ⚠️ **`ios/` NON è nel `.gitignore`** | La cartella `ios/` (progetto Xcode/Capacitor) è tracciata da git. Contiene `DerivedData/` e file di build Xcode che tipicamente si gitignora. Va valutato se tenerla o escluderla |
| ⚠️ **`*.bak` non è nel `.gitignore`** | I file `.bak` (CSS e JS) sono tracciati da git — andrebbero aggiunti al gitignore o eliminati |
| ⚠️ **`*.py` nella root non è nel `.gitignore`** | I 20 script Python sono tracciati da git — se si spostano in `/tools/`, aggiungere la regola appropriata |
| ⚠️ **`crash_funzionamento_00.txt`** | È tracciato da git pur essendo un log di crash. Il pattern `*.log` nel gitignore copre `.log` ma non `.txt` |
| ✅ **`graphify-out/` è nel `.gitignore`** | Corretto |
| ✅ **`node_modules/` è nel `.gitignore`** | Corretto |

---

> **Report generato da analisi statica — nessun file modificato.**
