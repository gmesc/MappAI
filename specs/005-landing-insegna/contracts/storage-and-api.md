# Contracts — Landing "Costruisci / Insegna" (005)

Contratti fra i moduli (API `window.*`) e verso gli store. Gli schemi dati
completi sono in [data-model.md](../data-model.md) — qui firme e garanzie.

## 1. Core puro — `window.MappAITeachCore` (NUOVO, UMD)

File: `public/js/mappai-teach-core.js`. Zero DOM, zero localStorage: le funzioni
ricevono e ritornano dati — la UI fa I/O. Testato in `tests/teach-core.test.js`.

```js
MappAITeachCore = {
  // Normalizzazione grade: NFKD, minuscole, ª/°→a, spazi collassati.
  // normGrade('1ª  Media') === normGrade('1a media') → true
  normGrade(s) → string,

  // Registro: aggiunge in testa, applica cap 400, ritorna il NUOVO array.
  // Non muta l'input. entry senza date → Date.now() del chiamante.
  registryAdd(registry, entry, cap?) → registry',

  // Classi attive su una mappa (per chip): dedup per nome classe,
  // match per projectId SE presente su entrambi, altrimenti per map (nome).
  // Ignora voci cls:null.
  classesForMap(registry, {projectId?, map?}) → string[],

  // Ordinamento quick-start (FR-020): ritorna i progetti in 3 fasce
  // { started: [...], sameGrade: [...], others: [...] } — mai vuoto il totale.
  // cls = {name, grade}; usa normGrade; started = presenti nel registro per
  // quella classe (per projectId o map).
  rankMapsForClass(projects, registry, cls) → {started, sameGrade, others},

  // Indice set: costruisce le voci per UN progetto dai suoi studySets in
  // memoria; merge = voci altrui preservate, voci del projectId sostituite.
  buildSetsIndex(prevIndex, projectId, mapName, cls, studySets) → index',

  // Filtro "Solo classe attiva" per le tre sezioni Insegna.
  // items generici con campi {cls?, grade?, projectId?, mapName?/map?}.
  // Regola: match se cls === classe attiva (nome), OPPURE il progetto riferito
  // è nel registro per quella classe, OPPURE normGrade coincide.
  // activeCls null/Generico → ritorna items invariati.
  filterByClass(items, activeCls, registry, projects) → items'
}
```

**Garanzie**: funzioni pure (stesso input → stesso output), nessuna mutazione
degli argomenti, tolleranti a campi mancanti (voci legacy).

## 2. UI landing — `window.MappAITeach` (NUOVO)

File: `public/js/mappai-landing-teach.js`.

```js
MappAITeach = {
  init(),                    // chiamata a DOMContentLoaded: applica modalità
                             //   salvata, monta toggle, renderizza sezioni
  setMode('build'|'teach'),  // switch + persist 'mappai_landing_mode'
  refresh(),                 // ri-renderizza le sezioni Insegna (dopo save/
                             //   sessione/cambio classe attiva)
  quickStart('collab'|'materials'|'live')  // flusso FR-019
}
```

**Eventi ascoltati**: `mappai-active-class-changed` (già emesso dal chip) →
`refresh()` se filtro 'active'.

## 3. Esposizioni nuove su moduli esistenti

```js
// mappai-live-teacher.js (one-liner, funzioni già esistenti ma private)
window.MappAILive.openSetup()      // wizard Studio attivo live (richiede mappa caricata)
window.MappAILive.openMaterials()  // pannello Materiali (NON richiede mappa)

// mappai-storage-lang.js — firma estesa RETROCOMPATIBILE:
StorageManager.renderRecentProjects(container?, opts?)
//   senza argomenti = comportamento di default (sezione Costruisci)
//   opts = { gradeMenu: bool, classChips: bool }
```

## 4. Hook archivio (chiamate nuove a API esistente)

```js
// mappai-print-dossier.js (dopo la costruzione dell'HTML del Foglio nodi):
MappAIStudyDocs.save({ kind: 'nodesheet', title, mapName, html });
// mappai-timeline.js (dentro _renderTimeline, dopo fullHtml):
MappAIStudyDocs.save({ kind: 'timeline', title, mapName, html });
```

`MappAIStudyDocs.save` accetta i 4 kind (allowlist) e cap 30 — vedi data-model §4.

## 5. Scritture registro (chiamate nei 3 punti di avvio)

```js
// dopo l'avvio RIUSCITO della sessione (mai su errore/annulla):
const reg = MappAITeachCore.registryAdd(_regRead(), {
  map: rootLabel(), projectId: StorageManager.currentProjectId || null,
  cls: activeOrChosenClassName, activity: 'lavagna'|'live'|'materiali',
  date: Date.now()
});
_regWrite(reg);   // helper I/O in mappai-landing-teach.js, esposto se serve
```

## 6. Main process — kill-switch

```js
// main.js, app.whenReady():
const settings = readSettingsSafe(path.join(app.getPath('userData'), 'mappai-settings.json'));
settings.legacyLauncher === true ? createLauncherWindow() : createWindow();
// launcher.html, createLauncherWindow, IPC 'launcher-choice'/'launcher-return': INTATTI
```

## 7. Chiavi i18n (prefissi riservati alla feature)

- `data-i18n` statici: `ui_landing_build`, `ui_landing_teach`,
  `ui_teach_filter_all`, `ui_teach_filter_class`, `ui_teach_projects`,
  `ui_teach_materials`, `ui_teach_sets`, `ui_build_projects`, `ui_qs_collab`,
  `ui_qs_materials`, `ui_qs_live` (+ tooltip `tt_*`) — in ENTRAMBI i dizionari.
- Stringhe JS: prefisso `lt_*` via `window.t('lt_…', 'fallback IT')` — chiave
  solo in en_translations.js.
