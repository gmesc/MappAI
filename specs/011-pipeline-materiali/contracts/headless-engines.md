# Contract: motori resi headless (Fase 1)

Refactor SENZA cambio di output: le superfici UI esistenti chiamano le stesse funzioni con le stesse opzioni di prima (lette dal DOM); la pipeline le chiama con opzioni esplicite. Regola: MAI duplicare il motore — una funzione, due consumer.

## 1. `mappai-quiz-print.js` — builder puri

```
window.buildQuizSetHtml(set, opts?)      → string   // HTML completo stampabile (quiz + soluzioni)
window.buildFlashcardSetHtml(set, opts?) → string   // HTML flashcard 2 colonne
```

- `printQuizSet(setId)` / `printFlashcardSet(setId)` diventano: risolvi set → `buildXxxHtml` → `window.open` + `document.write` (comportamento utente INVARIATO).
- I builder non toccano il DOM del documento principale; stili inline (`QP_BASE_STYLES`) inclusi nella stringa.
- Consumer pipeline: `buildQuizSetHtml(set)` → IPC `html-to-pdf` → `save-vault-file`.

## 2. `mappai-print-dossier.js` — foglio nodi parametrico

```
window.printAllNodeLabels(opts?)
opts = {
  depth?: 'all'|number,           // default: DOM nl-depth, poi 'all'
  fmt?: '3x4'|'2x2'|'2x1',        // default: DOM nl-fmt, poi '3x4'
  layout?: 'title'|'summary'|'keywords'|'card',   // default: DOM nl-layout, poi 'title'
  bg?: 'none'|'grid',
  tuned?: bool,                    // arma MappAITune per le keyword AI
  causal?: bool,                   // pagine Catena dei perché in coda
  toDisk?: { vaultPath: string }   // presente → NIENTE doc.save(); ritorna/salva base64
}
→ Promise<{ ok: bool, base64?: string, fileName: string }>
```

- Vincolo motore preservato: `fmt==='3x4'` forza `layout='title'`.
- Chiamata dal modale = `printAllNodeLabels()` senza argomenti → legge il DOM come oggi (zero regressioni).
- «Tutti i set» in pipeline = N chiamate, una per modo.

## 3. `mappai-branch-synthesis.js` — namespace esposto

```
window.MappAISynthesis = {
  runWholeMap({ apiKey, tuned?, silent? }) → Promise<data|null>,
    // data = forma _lastSynthesis (whole/intro/sections | rawText/sourcesArr) — invariata
    // silent: true → nessun overlay, nessun modale risultato (modalità pipeline)
  buildHtml(data, opts?) → string,          // = _buildSynthesisPrintHtml
  generateAudio(data) → Promise<{ blob, mime, ext, cues }>   // Google-only; throw se manca chiave
}
```

- Il flusso manuale esistente (modale sintesi) NON cambia: continua a usare gli entry attuali.
- La pipeline: `runWholeMap({silent:true, tuned})` → `buildHtml` → `save-vault-file` (HTML); `generateAudio` → blob→base64 → `save-vault-file` (MP3). Errore audio ≠ errore step D: l'audio è degradabile (spec FR-006), il testo no.

## 4. `mappai-vault-io.js` — assemblaggio mapData riusabile

```
window.buildVaultMapData() → object    // estratto dall'attuale saveMapVault (stessi campi)
```

- `saveMapVault()` (con dialog) la usa; la pipeline la usa con `electronAPI.saveVault({ folderPath: <auto>, mapData: buildVaultMapData() })`.

## 5. `mappai-files-core.js` — naming (puro, testato)

```
mapClassFolder(sede, className) → string   // safeName('<sede>-<classe>') | classFolder(className)
vaultFolderName(rootLabel)      → string   // safeName, fallback 'Mappa'
// collisioni: riuso sessionSeq(existingNames, baseName) → ' · NN'
```

## 6. Stima chiamate (`mappai-pipeline-core.js`, puro)

```
estimateCalls(config, mapStats) → { total, perStep: {A,B,C,D} }
// mapStats = { branches, nodes } — A: da modalità generazione (informativa, non vincolante);
// B: branches × types × 1; C: keywords ? ceil(nodesKept/batch) : 0; D: branches+1 (map-reduce) + audioBlocks
```
