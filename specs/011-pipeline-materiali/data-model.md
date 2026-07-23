# Data Model: Pipeline «Genera materiali»

**Date**: 2026-07-20 · Entità e regole di validazione. Gli schemi JSON dettagliati vivono in [contracts/](contracts/).

## 1. PipelineConfig (effimera → serializzata nel manifest)

Configurazione costruita dal modale, input dell'orchestratore.

| Campo | Tipo | Note |
|---|---|---|
| `classId` | string | id della classe destinataria (da `MappAIClasses`) — MAI dentro i preset |
| `className` / `sede` | string | denormalizzati al momento dell'avvio (per naming cartella) |
| `quiz` | object\|null | `{ types: ['mc','tf','flashcards'], perBranch: 1..10, angle: 'auto'\|<chiave QUIZ_ANGLES> }` |
| `nodesheet` | object\|null | `{ maxLevel: 'all'\|number, fmt: '3x4'\|'2x2'\|'2x1', modes: ['title','keywords','summary','card'], causal: bool }` — `3x4` forza `title` (vincolo motore esistente) |
| `synthesis` | object\|null | `{ audio: bool }` — solo mappa intera (D5); `audio` degradato a `false` dal pre-flight se manca chiave Google |
| `tuned` | bool | Taratura VERDE per i materiali (step B/C/D) |
| `levelTuned` | bool | «Adatta al livello» per la mappa (step A) |

**Validazione**: almeno una sezione output attiva; `perBranch ≥ 1`; `modes` non vuoto se `nodesheet` attivo.

## 2. Preset (`mappai_material_presets`, localStorage)

```
{ v: 1, id: 'pr_<ts>', name: string ≤60, createdAt: ISO, options: <PipelineConfig SENZA classId/className/sede> }
```

**Regole**: array cap 50 (FIFO); nomi duplicati ammessi ma sconsigliati (warning non bloccante); opzioni con chiavi ignote all'apply → default + toast informativo (forward-compat, FR spec edge case).

## 3. PipelineManifest (`<vault>/pipeline.json`)

Fonte di verità della ripresa. Schema completo in [contracts/pipeline-manifest.md](contracts/pipeline-manifest.md).

```
{ schema: 'mappai-pipeline@1', createdAt, updatedAt, config: PipelineConfig,
  vaultPath: <relativo a mapsBaseDir>, steps: { A|B|C|D: StepRecord } }
```

**StepRecord**: `{ status: 'pending'|'running'|'done'|'failed'|'skipped', startedAt?, endedAt?, files: [<path relativi al vault>], error?: string, calls?: number }`

**Transizioni ammesse**: `pending→running→done|failed`; `failed→running` (Riprova); `pending→skipped` (output non richiesto). `running` trovato alla riapertura = crash → trattato come `failed` (i file elencati restano validi).

**Invarianti**: scritto su disco a OGNI transizione, PRIMA di avviare lo step successivo; percorsi SEMPRE relativi al vault (constitution V); B/C/D eseguibili solo se `A.status==='done'`.

## 4. MaterialIndexEntry (derivata, non persistita a parte)

La sezione «Materiali di studio» di Insegna elenca i materiali su disco leggendo `pipeline.json` + directory `Materiale Studio/` via IPC `vault-materials-list`. Ogni voce derivata:

| Campo | Origine |
|---|---|
| `kind` | dal nome file/step (`quiz-pdf`, `nodesheet`, `synthesis`, `audio`) |
| `title`, `file` | nome file parlante (con marcatore `[VERDE]` se tarato) |
| `mapName` | `rootNodeLabel` del vault (index.yaml) |
| `cls` | `config.className` dal manifest |
| `date` | mtime del file |

**Regola**: nessun blob in localStorage; l'archivio storico `mappai_saved_documents` resta separato e i due elenchi si fondono a display-time (dedup non necessario: sorgenti disgiunte).

## 5. Classe (estesa — `classi.json`)

Campi esistenti: `id, name, gradeNum, section, grade, system, year, students, register, notes`.

**Nuovo**: `sede?: string` — nick sede dal profilo insegnante; opzionale; impostabile in `renderCreate` E `renderEdit`. Assente/vuota → naming cartella senza prefisso.

## 6. Cartella di classe (filesystem)

```
mapsBaseDir()/
├── <vault legacy flat>/index.yaml            ← invariati, ancora scoperti
└── <safeName(sede-classe | classe)>/         ← contenitore (NESSUN index.yaml)
    ├── <vault mappa 1>/index.yaml
    └── <vault mappa 1 · 02>/index.yaml       ← suffisso progressivo su collisione
```

**Regole di naming** (helper puri in files-core, testati): `mapClassFolder(sede, className)` → `safeName(sede + '-' + className)` se sede, altrimenti `classFolder(className)` (fallback 'Senza classe'); suffisso vault via pattern `sessionSeq` (` · NN`). **Discovery**: cartella con `index.yaml` = vault; senza = contenitore da scandire (1 livello).

## 7. Stato transitorio UI (non persistito)

- `MappAIPipeline._running`: lock singola pipeline (bottone Avvia disabilitato).
- `MappAITeach._selectedProject` (Fase 3): id progetto selezionato in Insegna; `null` = vista classe. Non sopravvive al reload (scelta deliberata: la selezione è un gesto di consultazione).
