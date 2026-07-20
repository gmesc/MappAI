# Contracts: IPC (main.js ↔ renderer)

Nuovi handler e estensioni. Pattern invariato del repo: `ipcMain.handle` + esposizione in `preload.js` via `contextBridge`. Tutti i path utente sanitizzati (basename/relativo, mai assoluti dal renderer verso zone arbitrarie).

## NUOVO `html-to-pdf`

Converte HTML stampabile in PDF senza interazione (decisione D4).

```
Request : { html: string, options?: { landscape?: bool, pageSize?: 'A4' (default) } }
Response: { ok: true, base64: string } | { ok: false, error: string }
```

- Implementazione: `BrowserWindow` offscreen (`show:false`), `loadURL('data:text/html;…'||loadFile temp)`, attesa `did-finish-load`, `webContents.printToPDF({ pageSize:'A4', printBackground:true, landscape })`, cleanup della finestra in `finally`.
- Nessun accesso rete richiesto dall'HTML (stili inline già nel builder quiz — `QP_BASE_STYLES`).
- Preload: `electronAPI.htmlToPdf(data)`.

## NUOVO `save-vault-file`

Scrittura generica di un file della pipeline dentro il vault (HTML, MP3, JSON manifest, PDF).

```
Request : { vaultPath: string, relPath: string, base64?: string, text?: string }
Response: { ok: true, path: string } | { ok: false, error: string }
```

- `relPath` sanitizzato: niente `..`, niente path assoluti; sottocartelle ammesse solo `Materiale Studio/` e root del vault (`pipeline.json`); `mkdirSync` ricorsivo della sottocartella.
- Uno tra `base64` (binari) e `text` (UTF-8) obbligatorio.
- Nota: `save-pdf-to-vault` esistente resta invariato (retrocompatibilità); il nuovo handler è il percorso canonico della pipeline e CORREGGE la mancanza di sanitizzazione rilevata nella ricognizione.
- Preload: `electronAPI.saveVaultFile(data)`.

## NUOVO `vault-materials-list`

Elenca i materiali su disco di un vault (per la sezione Materiali di Insegna, Fase 3).

```
Request : { vaultPath: string }
Response: { ok: true, manifest: <pipeline.json|null>, files: [{ name, relPath, size, mtime }] }
```

- Cammina SOLO `Materiale Studio/` (primo livello) + legge `pipeline.json` se presente; ritorna `files: []` se la cartella non esiste.
- Preload: `electronAPI.vaultMaterialsList(data)`.

## ESTESO `get-all-vaults` (retrocompatibile)

Scansione a 2 livelli (FR-019, decisione R8):

1. Primo livello di `mapsBaseDir()`: cartella CON `index.yaml` → vault (comportamento storico invariato).
2. Cartella SENZA `index.yaml` → contenitore di classe: scandire il SUO primo livello; ogni sottocartella con `index.yaml` → vault.

```
Response (shape per-vault INVARIATA): { folderName, fullPath, extractionMode, rootNodeLabel, lastUpdated, nickname?, age? }
+ nuovo campo opzionale: classDir?: string   // basename del contenitore, assente per i flat
```

- `folderName` resta il basename del vault (i consumatori esistenti risolvono per nome — unicità garantita dal suffisso progressivo alla creazione).
- Nessuna ricorsione oltre il secondo livello; cartelle note non-vault dentro Mappe (`Chat/`, `Quiz e Flashcard/`, `Studio Attivo/`) escluse con lista di esclusione.

## ESTESO `open-vault` / risoluzione per nome (verifica)

I percorsi che risolvono `vault per NOME → fullPath` passano tutti da `get-all-vaults` → nessun altro cambio necessario. Da verificare in fase di implementazione con grep sui consumer (`directLoadVault`, vault-manager).

## Aggiornamento `mappai-usage-core.js` (non IPC ma contratto dati)

`CATS` acquisisce: `pipeline: { label: 'Pipeline materiali', subs: { map, quiz_mc, quiz_tf, flashcards, nodesheet, synthesis, tts } }`. Record invariati (solo nuova categoria).
