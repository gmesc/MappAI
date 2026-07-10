<!--
Sync Impact Report
- Version change: (template) → 1.0.0
- Modified principles: n/a (prima adozione)
- Added sections: Core Principles (7), Vincoli Tecnologici, Workflow di Sviluppo, Governance
- Removed sections: nessuna
- Templates requiring updates:
  ✅ .specify/templates/plan-template.md — Constitution Check legge i gate da questo file a runtime, nessuna modifica necessaria
  ✅ .specify/templates/spec-template.md — nessun riferimento a principi specifici, ok
  ✅ .specify/templates/tasks-template.md — nessun riferimento a principi specifici, ok
- Follow-up TODOs: nessuno
-->

# MappAI Constitution

## Core Principles

### I. Accessibilità BES/DSA prima di tutto
Ogni funzionalità DEVE servire gli utenti target: studenti con dislessia, ADHD,
ipovisione, e le figure professionali che li supportano (docenti, OPI).
- Le superfici di studio leggono sempre `desc || content` (mai il contrario):
  la descrizione ricca è lo strumento principale di studio dello studente BES/DSA.
- Gli errori nell'UI DEVONO essere segnalati anche in modo non cromatico
  (tratteggio, icone, ARIA) — mai solo col colore.
- Il carico cognitivo va limitato per costruzione: cap sugli item per sessione,
  scope per ramo, hint ladder — non lasciato alla buona volontà dello studente.

### II. Reversibilità e gradualità
Ogni modifica DEVE essere reversibile e ben documentata.
- Nuovi comportamenti dietro feature flag `localStorage` (kill-switch documentato,
  default esplicito) finché non validati.
- Backup (`.bak`) prima di sovrascrivere template o config attive.
- Le decisioni di design e lo stato del lavoro vengono registrati in `CLAUDE.md`
  e nei documenti di design (`docs/game-design/`, `docs/rules/`).
Razionale: il progetto è mantenuto da una persona sola; la possibilità di tornare
indietro senza panico vale più della velocità.

### III. Architettura a script globali (no build step)
Il renderer è Vanilla JS senza bundler: NO React, NO Vue, NO ES modules.
- Nuovi file JS = moduli `mappai-*.js` esposti su `window.*`, caricati in
  `index.html` DOPO `app.js` e PRIMA di `admin_prompts.js`.
- Lo stato globale è `appState`; i nodi vivono SEMPRE in `appState.db.nodes`
  (mai `appState.nodes`). `appState` è `let`, non su `window`: dai moduli
  esterni usare il pattern `_getAppState()`.
- Librerie di terze parti vendored in repo (es. three.js) — l'app DEVE
  funzionare offline.
- Bottoni dentro form: sempre `type="button"`.

### IV. Compatibilità dual-provider AI
Le funzioni di generazione DEVONO funzionare su entrambi i provider
(Google Gemini e Infomaniak). Un fix che funziona solo su Google non è accettabile.
- MAI `responseMimeType: "application/json"` nei payload Infomaniak.
- MAI `JSON.parse` diretto su risposte AI: sempre `salvageTruncatedJSON()`.
- Testo utente iniettato nei prompt sanitizzato con
  `.replace(/[`"{}[\]\\]/g, ' ')`.
Razionale: Infomaniak (provider svizzero) è il requisito GDPR per i dati
educativi; Google è il path di qualità. Nessuno dei due è opzionale.

### V. Integrità e retrocompatibilità del vault (DAL Protocol)
Il vault (`~/Documents/MappAI - Vault/`) è dato dell'utente, compatibile
Obsidian (Markdown + frontmatter YAML). Ogni modifica alla persistenza DEVE:
- Gestire i formati legacy (link senza `rel` → `"include"`; fonti senza
  sorgente → `"Originale"`).
- Usare SOLO percorsi relativi alla cartella del vault per gli allegati —
  mai percorsi assoluti locali.
- Non corrompere né perdere vault esistenti: migrazioni additive, mai distruttive.

### VI. Logica pura testata
La logica estraibile (validazione, pathfinding, scoring, parsing) DEVE vivere
in moduli UMD puri testabili in Node (`tests/`), separata dal DOM.
- La suite di test DEVE restare verde: un lavoro non è finito con test rossi.
- Nei moduli testati in Node usare `_tSafe(k, f)` locale, mai `window.t` diretto.
- Dopo ogni batch di modifiche al renderer: debug-run in Electron
  (`npm start`) — i test unit non coprono l'integrazione UI.

### VII. i18n bilingue completa
L'interfaccia è IT/EN; la lingua delle mappe è un'impostazione separata
(`mappai_map_language`).
- Ogni chiave `data-i18n` DEVE esistere in ENTRAMBI i dizionari
  (`public/traduzioni/*_translations.js`), altrimenti lo switch EN→IT non
  ripristina l'italiano.
- Stringhe nei moduli JS: `window.t('chiave', 'fallback italiano')` — il
  fallback inline È il testo italiano, la chiave va solo in `en_translations.js`.
- Vocabolari di relazioni (linking words): unica fonte `EDGE_FAMILIES` in
  `mappai-relations.js` — MAI hardcodare liste di verbi nei prompt.

## Vincoli Tecnologici

- Stack fisso: Electron 30, Node.js (main process), Vanilla JS (renderer),
  D3.js v7, Tailwind via CDN runtime, jsPDF, PDF.js, KaTeX.
- Zone intoccabili senza decisione esplicita dell'utente: sistema di licensing
  (machine-id), cartella `ios/` (Capacitor), file di build.
- CSS: modifiche nel blocco `@layer components` di `index.html`, non in
  `style.css` (guerra di specificità nota: 703 `!important`).
- Modal dinamici creati via JS: classi `.pm-*` di `index.html` + Lucide icons,
  con `window.safeCreateIcons()` dopo l'append al DOM.
- Funzioni che potrebbero migrare su iPadOS: astrarre l'accesso a filesystem/IPC
  via `storageAdapter.js` e annotare un TODO iPadOS.

## Workflow di Sviluppo

- Branch: `main` = baseline stabile; feature branch per lavori non banali;
  merge solo a suite verde e debug-run Electron superato.
- Approccio graduale: batch piccoli, verifica dopo ogni batch, spiegazioni
  chiare — zero panico. Ogni fase consegnabile e reversibile da sola.
- Le fonti di verità contrattuali (es. `VAULT_DUNGEON_MAPS_CONTRACT.md`)
  vincolano l'implementazione: prima si aggiorna il contratto, poi il codice.
- Documentare in `CLAUDE.md` lo stato di sessione: cosa è fatto, cosa è aperto,
  con quali flag.

## Governance

- Questa costituzione prevale sulle altre pratiche in caso di conflitto.
- Unico maintainer e decisore: Giacomo Meschini. Gli agenti AI propongono,
  l'utente decide; le decisioni prese vanno registrate (qui o in `CLAUDE.md`).
- Emendamenti: modifica di questo file con bump di versione semantico
  (MAJOR = rimozione/ridefinizione di principi; MINOR = nuovo principio o
  espansione materiale; PATCH = chiarimenti) e sync del Sync Impact Report.
- Ogni piano generato da spec-kit DEVE passare il Constitution Check contro
  i principi I–VII prima dell'implementazione; le violazioni vanno giustificate
  esplicitamente nella sezione Complexity Tracking del piano.

**Version**: 1.0.0 | **Ratified**: 2026-07-10 | **Last Amended**: 2026-07-10
