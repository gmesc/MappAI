# Data Model — Landing "Costruisci / Insegna" (005)

Tutti gli store sono localStorage del renderer, tranne il kill-switch (file in
userData letto dal main). Tutte le aggiunte sono ADDITIVE: nessun campo esistente
cambia significato, nessuna migrazione distruttiva.

## 1. Voce progetto — `tutor_ai_projects` (ESTESA)

Array esistente di metadati progetto; snapshot completo separato in
`localStorage[<projectId>]` (invariato).

```js
{
  id: 'proj_1720000000000',
  name: 'La Fotosintesi',
  date: 1720000000000,        // ultima modifica (esistente)
  created: 1719000000000,     // creazione (esistente)
  cls: '1ª A' | null,         // classe al primo salvataggio (esistente, congelata)
  nodesCount: 77,             // esistente
  type: 'mindmap' | 'kg',     // esistente
  vault: 'fotosintesi' | null,// esistente
  grade: '1ª media' | null    // NUOVO — testo libero ≤40 char, assegnato dal menu
                              //   in Costruisci o ereditato dal chip in Insegna
}
```

**Regole**:
- `grade` assente/null = progetto "senza grade" → in Insegna eredita (e salva) il
  grade della classe attiva alla prima selezione (FR-022).
- Confronto grade SEMPRE via `normGrade()` (NFKD, minuscole, ª/°→a, spazi
  collassati) — mai `===` sul raw.

## 2. Registro sessioni — `mappai_session_registry` (NUOVO)

Array FIFO, cap 400 voci (le più vecchie scartate in coda).

```js
{
  map: 'La Fotosintesi',        // rootNodeLabel al momento dell'avvio
  projectId: 'proj_…' | null,   // StorageManager.currentProjectId se disponibile
  cls: '1ª A' | null,           // null = sessione senza classe (nessun chip)
  activity: 'lavagna' | 'live' | 'materiali',
  date: 1720000000000
}
```

**Scrittura** (solo ad avvio RIUSCITO della sessione):
- Lavagna: `openCollabHub` dopo `collab-start-session` ok.
- Studio attivo live: wizard dopo `live-start-session` ok.
- Materiali: alla pubblicazione/avvio server (quick-start e pannello).

**Letture**:
- `classesForMap(registry, map|projectId)` → chip classi in "Progetti esistenti".
- `rankMapsForClass(projects, registry, cls)` → ordinamento quick-start.

## 3. Indice set — `mappai_studysets_index` (NUOVO)

Array di descrittori leggeri; MAI derivato riparsando snapshot.

```js
{
  projectId: 'proj_…',
  mapName: 'La Fotosintesi',
  setId: 'set_…',              // id del set dentro appState.db.studySets
  name: 'Quiz cellula',        // nome/titolo del set
  type: 'quiz' | 'flashcards',
  cls: '1ª A' | null,          // classe attiva al salvataggio del progetto
  date: 1720000000000
}
```

**Scrittura**: dentro `StorageManager.saveCurrentProject()` — rimuove le voci del
`projectId` corrente e le riscrive da `appState.db.studySets` (in memoria).
La guardia Studio-attivo in testa alla funzione protegge anche l'indice.
**Conseguenza documentata**: progetti salvati prima della feature compaiono dopo
il primo risalvataggio (FR-014).

## 4. Documento archiviato — `mappai_saved_documents` (ESTESO)

Store esistente (mappai-study-export-core.js). Cambiano solo:

```js
kind: 'synthesis' | 'dossier' | 'nodesheet' | 'timeline'   // +2 kind NUOVI
// DOCS_CAP: 12 → 30
```

Il resto invariato: `{id, kind, title, mapName, cls, date, html}`, dedup per
`kind|title|mapName`, quota-guard che scarta i più vecchi. `saveDoc` oggi
coercizza kind≠'synthesis' a 'dossier' → la coercizione va sostituita con una
allowlist dei 4 kind.

## 5. Preferenze landing (NUOVE, banali)

```js
localStorage['mappai_landing_mode']       = 'build' | 'teach'   // default 'build'
localStorage['mappai_teach_class_filter'] = 'all' | 'active'    // default 'all'
```

## 6. Kill-switch launcher — `<userData>/mappai-settings.json` (NUOVO)

Letto SYNC dal main a `app.whenReady()`, try/catch, assente = `{}`.

```json
{ "legacyLauncher": true }
```

`true` → comportamento storico (`createLauncherWindow()` all'avvio).
Assente/false → `createWindow()` diretto.

## 7. Classe (ESISTENTE, sola lettura)

`~/Documents/MappAI - Classi/classi.json` via `MappAIClasses`:
`{id, name, grade, system, register, notes, students…}`. Questa feature LEGGE
`name` e `grade`; nessuna modifica allo store classi.

## Relazioni

```
Classe (grade) ──── normGrade ────┐
                                  ├──> rankMapsForClass ──> elenco quick-start
Progetto (grade) ── normGrade ────┘
Progetto (id/name) <── registro sessioni (map/projectId, cls) ──> chip classi
Progetto (id) <── indice set (projectId) ──> sezione Quiz & flashcard
Progetto (name) <── documento archiviato (mapName) ──> sezione Materiali
```

## Invarianti

1. La landing Insegna legge SOLO metadati (progetti, registro, indice, list()
   dell'archivio) — mai `localStorage[<projectId>]` (snapshot) e mai `doc.html`
   prima del click di apertura.
2. Voci di registro con `cls: null` non producono chip e non entrano nel filtro
   "Solo classe attiva".
3. Chip su "Generico" + filtro "Solo classe attiva" = nessun filtro (edge case
   della spec).
4. Nessuno store nuovo viene scritto durante una sessione di Studio attivo
   (guardia esistente in saveCurrentProject).
