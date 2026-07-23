# Contract: pipeline.json (schema `mappai-pipeline@1`)

File nel root del vault, fonte di verità della ripresa. Scritto via `save-vault-file` a OGNI transizione di stato, PRIMA di avviare lo step successivo.

## Schema

```json
{
  "schema": "mappai-pipeline@1",
  "createdAt": "2026-07-20T10:00:00Z",
  "updatedAt": "2026-07-20T10:12:34Z",
  "config": {
    "classId": "cls_x",
    "className": "2a A",
    "sede": "Bellinzona",
    "quiz": { "types": ["mc", "tf"], "perBranch": 3, "angle": "auto" },
    "nodesheet": { "maxLevel": "all", "fmt": "2x2", "modes": ["title", "keywords"], "causal": true },
    "synthesis": { "audio": true },
    "tuned": false,
    "levelTuned": false
  },
  "steps": {
    "A": { "status": "done", "startedAt": "…", "endedAt": "…", "files": [], "calls": 22 },
    "B": { "status": "done", "files": ["Materiale Studio/Quiz-MC-Fotosintesi.pdf"], "calls": 6 },
    "C": { "status": "failed", "error": "PDF vuoto (0 byte)", "files": [] },
    "D": { "status": "pending", "files": [] }
  }
}
```

## Regole

1. **Stati**: `pending | running | done | failed | skipped`. Transizioni ammesse: `pending→running→done|failed`; `failed→running` (Riprova); `pending→skipped` (sezione non richiesta in config).
2. **Crash detection**: alla riapertura, `running` = crash → normalizzato a `failed` con `error: 'interrotto'`; i `files` già elencati restano validi (scritti prima della transizione).
3. **Ripresa idempotente**: `done` → step saltato SENZA chiamate AI; `failed`/`pending` → rieseguito. B/C/D richiedono `A.status === 'done'`.
4. **Percorsi**: SEMPRE relativi al vault (constitution V). MAI percorsi assoluti nel manifest.
5. **File-first**: un file entra in `files` SOLO dopo scrittura su disco riuscita; la transizione a `done` avviene dopo l'ultimo file.
6. **Forward-compat**: campi ignoti preservati in lettura/riscrittura (parse tollerante, pattern `normalizeRecord` del repo).
7. **Logica pura**: creazione/validazione/transizioni implementate in `mappai-pipeline-core.js` (UMD, zero I/O — il manifest entra ed esce come oggetto; le scritture le fa l'orchestratore via IPC). Test in `tests/pipeline-core.test.js`.

## Nomi file canonici (in `Materiale Studio/`)

```
Quiz-MC-<ramo|Mappa>[ -VERDE].pdf        Quiz-VF-<…>.pdf        Flashcard-<…>.pdf
Foglio-nodi-<modo>[ -VERDE].pdf          # un PDF per modo selezionato
Sintesi[ -VERDE].html                    Sintesi-audio.mp3
```

`safeName()` di files-core su ogni segmento; marcatore ` -VERDE` solo con `tuned` (coerente col design VERDE esistente).
