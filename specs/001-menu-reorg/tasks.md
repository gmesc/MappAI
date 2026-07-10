# Tasks: Riorganizzazione Menu — Studio Attivo e Output Materiali di Studio

**Input**: Design documents from `/specs/001-menu-reorg/`

**Prerequisites**: plan.md, spec.md, research.md (decisioni D1–D5), quickstart.md

**Tests**: nessun task di test automatico — zero logica pura nuova (plan §Constitution
Check VI). La verifica è manuale via quickstart.md + suite Node esistente che deve
restare verde.

**Organization**: task raggruppati per user story, ognuna testabile da sola.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: parallelizzabile (file diversi, nessuna dipendenza)
- **[Story]**: user story di appartenenza (US1, US2, US3)

## Path Conventions

Progetto Electron a script globali: tutto il lavoro è in `public/` (renderer).
Nessun file nuovo.

---

## Phase 1: Setup (Shared Infrastructure)

Nessun task: progetto esistente, zero dipendenze nuove, zero file nuovi.

---

## Phase 2: Foundational (Blocking Prerequisites)

Nessun task bloccante: le tre story sono indipendenti per costruzione.
Convenzione condivisa (da rispettare in tutti i task): il flag legacy si legge
sempre come `localStorage.getItem('mappai_legacy_float_btns') === '1'` (D2).

---

## Phase 3: User Story 1 - Docente trova le attività di studio in un posto solo (Priority: P1) 🎯 MVP

**Goal**: Cloze, Heat map (padronanza) e Mappa lavoro (effort) avviabili dal
launcher Studio attivo; i loro 3 bottoni flottanti spariscono; colonna destra
compattata. Comportamento delle funzioni invariato (FR-001…FR-003, FR-009).

**Independent Test**: quickstart.md §US1 — launcher espone le 3 nuove card
funzionanti; bordo destro senza 📝/🎯/🔥; flag legacy ripristina tutto.

### Implementation for User Story 1

- [X] T001 [US1] In `public/js/mappai-active-study.js`, dentro `ActiveStudy.openLauncher()`: dopo il loop delle card `MODES`, aggiungere un'intestazione di sezione (testo da `window.t('as_views_header', 'Viste ed esercizi rapidi')`) e 3 card nello stesso stile `as-mode-card` ma con classe propria (es. `as-extra-card` + `data-extra="cloze|heatmap|effort"`): Cloze (icona `pencil-line`, title `window.t('as_cloze_title','Cloze — completa le definizioni')`, hint `window.t('as_cloze_hint','Riempi i termini oscurati nelle descrizioni dei nodi.')`), Heat map (icona `target`, title `as_heatmap_title` fallback 'Heat map padronanza', hint `as_heatmap_hint` fallback 'Tinge i nodi: grigio mai studiato, ambra in corso, verde acquisito.'), Mappa lavoro (icona `flame`, title `as_effort_title` fallback 'Mappa lavoro', hint `as_effort_hint` fallback 'Tinge i nodi di indaco in proporzione al lavoro svolto.'). Le card toggle mostrano lo stato corrente nel testo (`window.t('as_view_on','Vista ATTIVA — clicca per spegnere')` / `as_view_off` fallback 'Vista spenta — clicca per accendere') leggendo `window.MappAIMasteryView?.active` / `window.MappAIEffortView?.active`. Click handler (stesso pattern `.as-mode-card`): cloze → `modal.remove()` + `window.MappAICloze && window.MappAICloze.start()`; heatmap → `modal.remove()` + `window.MappAIMasteryView && window.MappAIMasteryView.toggle()`; effort → idem con `MappAIEffortView`. Guard: se il modulo manca, card disabilitata con motivo (pattern `disabled` esistente).
- [X] T002 [P] [US1] In `public/js/mappai-cloze.js`, funzione `injectBtn()`: primo statement `if (localStorage.getItem('mappai_legacy_float_btns') !== '1') return;` (bottone flottante solo in modalità legacy). Commento una riga sul perché (spostato nel launcher Studio attivo).
- [X] T003 [P] [US1] In `public/js/mappai-mastery-view.js`, funzione `injectBtn()`: stesso gate legacy di T002.
- [X] T004 [P] [US1] In `public/js/mappai-effort-view.js`, funzione `injectBtn()`: stesso gate legacy di T002.
- [X] T005 [P] [US1] In `public/js/mappai-celeration.js` (~riga 122): `bottom:148px` → ternaria sul flag legacy: `bottom:${legacy?148:20}px` (costruire la cssText con template literal; `const legacy = localStorage.getItem('mappai_legacy_float_btns')==='1'`).
- [X] T006 [P] [US1] In `public/js/mappai-study-path.js` (~riga 139): `bottom:212px` → ternaria legacy 212:84 (stesso pattern T005).
- [X] T007 [P] [US1] In `public/js/mappai-palace.js` (~riga 216): `bottom:276px` → ternaria legacy 276:148.
- [X] T008 [P] [US1] In `public/js/mappai-games.js` (~riga 4063): `bottom:340px` → ternaria legacy 340:212. Aggiornare il commento-mappa delle posizioni in `mappai-effort-view.js` (riga «bottom:404 — colonna destra già occupata…») alla nuova disposizione.
- [ ] T009 [US1] Verifica quickstart.md §US1 + §Reversibilità in Electron (`npm start`): 3 card funzionanti, flottanti assenti, colonna compattata, flag legacy ripristina posizioni storiche senza sovrapposizioni, mutua esclusione viste preservata.

**Checkpoint**: US1 completa e testabile da sola — MVP.

---

## Phase 4: User Story 2 - Sezione Output Materiali di Studio (Priority: P2)

**Goal**: nel menu azioni rapide, sezione etichettata che raggruppa Foglio nodi,
Sintesi di ramo, Stampa dossier, Crea Timeline e le 3 voci Jigsaw, separata
dalle azioni file/vault (FR-004…FR-006). Ordine da D4.

**Independent Test**: quickstart.md §US2 — sezione visibile, 7 voci dentro,
ogni voce apre il flusso identico a prima.

### Implementation for User Story 2

- [X] T010 [US2] In `public/index.html`, blocco `#floating-actions-menu` (~righe 1354-1418): dopo il divider esistente (`<div class="h-px bg-slate-100 my-1"></div>`, ~riga 1385) inserire header di sezione non interattivo: `<div class="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400" data-i18n="ui_output_materials">Output materiali di studio</div>`. Riordinare le voci della sezione in: Foglio nodi · Sintesi di ramo (AI) (spostata su dalla posizione attuale ~riga 1407) · Stampa dossier · Crea Timeline · Esporta JIGSAW · Ricomponi copie · Revisione lacune. La voce "Studio attivo" scende subito DOPO la sezione (prima di "Annulla"). Nessun attributo `onclick` modificato.
- [ ] T011 [US2] Verifica quickstart.md §US2 in Electron: sezione visibile, ogni voce apre il modale di prima, azioni file/vault separate sopra.

**Checkpoint**: US1 e US2 funzionano indipendentemente.

---

## Phase 5: User Story 3 - Menu coerenti in inglese (Priority: P3)

**Goal**: tutte le etichette nuove/spostate bilingui; switch IT↔EN senza residui
(FR-007). Meccanismi da D5.

**Independent Test**: quickstart.md §US3 — switch EN e ritorno IT + grep chiavi.

### Implementation for User Story 3

- [X] T012 [P] [US3] In `public/traduzioni/it_translations.js`: aggiungere chiave `ui_output_materials: "Output materiali di studio"` (necessaria in ENTRAMBI i dizionari perché usata via `data-i18n`).
- [X] T013 [P] [US3] In `public/traduzioni/en_translations.js`: aggiungere `ui_output_materials: "Study output materials"`, `as_views_header: "Views & quick exercises"`, `as_cloze_title: "Cloze — fill the definitions"`, `as_cloze_hint: "Fill in the hidden terms in the node descriptions."`, `as_heatmap_title: "Mastery heat map"`, `as_heatmap_hint: "Tints nodes: grey never studied, amber in progress, green mastered."`, `as_effort_title: "Work map"`, `as_effort_hint: "Tints nodes indigo in proportion to the work done."`, `as_view_on: "View ON — click to turn off"`, `as_view_off: "View off — click to turn on"`.
- [X] T014 [US3] Verifica quickstart.md §US3: switch lingua EN → controlli → ritorno IT → nessuna etichetta residua in inglese; eseguire i due comandi `grep` del quickstart (`ui_output_materials` presente in entrambi i dizionari; chiavi `as_*` presenti in en_translations.js).

**Checkpoint**: tutte le story indipendentemente funzionanti.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [X] T015 Suite Node completa verde: `npm test` da root (nessuna regressione attesa — nessun modulo testato in Node è stato toccato nella logica).
- [ ] T016 Debug-run Electron completo di quickstart.md incluse le regressioni da escludere (sessione Studio attivo in corso → viste inattive; mappa KG senza root; mappa mai studiata) e zero errori in console.
- [X] T017 Aggiornare `CLAUDE.md` §11 (sessione corrente): riga di stato feature 001-menu-reorg con flag `mappai_legacy_float_btns` documentato nella tabella flag.

---

## Dependencies & Execution Order

### Phase Dependencies

- Phase 1–2: vuote — si parte direttamente dalle story.
- **US1 (Phase 3)**, **US2 (Phase 4)**, **US3 (Phase 5)**: indipendenti tra loro,
  eseguibili in qualunque ordine o in parallelo. Ordine consigliato = priorità.
- **Polish (Phase 6)**: dopo le story che si decide di consegnare.

### User Story Dependencies

- US1: nessuna dipendenza. Le stringhe usano `window.t` con fallback italiano →
  funziona anche senza T013.
- US2: nessuna dipendenza (header visibile in italiano anche senza T012/T013;
  lo switch EN completo arriva con US3).
- US3: nessuna dipendenza tecnica; verifica piena (T014) sensata dopo T001/T010.

### Within Each User Story

- US1: T001 indipendente; T002–T008 tutti [P] tra loro (file diversi);
  T009 per ultimo.
- US2: T010 → T011.
- US3: T012 ∥ T013 → T014.

### Parallel Opportunities

- T002, T003, T004, T005, T006, T007, T008 — 7 task in parallelo (7 file diversi).
- T012 ∥ T013 (2 dizionari diversi).
- US1/US2/US3 parallelizzabili tra loro (nessun file condiviso tranne
  en_translations.js, toccato solo da T013).

---

## Parallel Example: User Story 1

```bash
# Dopo T001, lanciare insieme:
Task: "T002 gate legacy injectBtn in public/js/mappai-cloze.js"
Task: "T003 gate legacy injectBtn in public/js/mappai-mastery-view.js"
Task: "T004 gate legacy injectBtn in public/js/mappai-effort-view.js"
Task: "T005 bottom 148→20 in public/js/mappai-celeration.js"
Task: "T006 bottom 212→84 in public/js/mappai-study-path.js"
Task: "T007 bottom 276→148 in public/js/mappai-palace.js"
Task: "T008 bottom 340→212 in public/js/mappai-games.js"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. T001 → T002–T008 (parallelo) → T009 verifica.
2. **STOP e VALIDATE**: US1 da sola è già consegnabile (launcher unificato,
   canvas pulito, reversibile col flag).

### Incremental Delivery

1. US1 → verifica → consegna (MVP).
2. US2 → verifica → consegna.
3. US3 → verifica → consegna.
4. Polish (T015–T017) → commit finale.

---

## Notes

- Nessun file nuovo: tutte modifiche puntuali a moduli esistenti (costituzione III).
- Ogni task tocca file distinti tranne T001/T008-commento — attenzione se
  parallelizzati con agenti: T008 aggiorna anche un commento in
  `mappai-effort-view.js` (stesso file di T004): eseguire T004 prima di T008
  o accorpare.
- Comportamento funzioni MAI modificato: solo punti d'ingresso e posizioni.
- Commit dopo ogni story o gruppo logico; kill-switch documentato in T017.

---

## Phase 7: Addendum 2026-07-10 — Strumenti nel launcher, landscape, Knowledge Garden (US4)

**Goal**: colonna flottante destra vuota di default; launcher landscape a due
colonne con terza sezione "Strumenti"; via il flottante Memory Dungeon; nuovo
bottone Knowledge Garden nel menu azioni rapide (hook `window.openKnowledgeGardenHub`).

- [X] T018 [US4] In `public/js/mappai-active-study.js`: `buildModal` accetta `opts.maxWidth`; `openLauncher` ristrutturato a griglia landscape (auto-fit 300px) — colonna sinistra "Modalità di studio", colonna destra "Viste ed esercizi rapidi" + "Strumenti" (Cosa studiare ora → `MappAIStudyPath.open()`, Palazzo della Memoria → `MappAIPalace.start()`, Progressi → `MappAICeleration.open()`); modale a 980px.
- [X] T019 [P] [US4] In `public/js/mappai-celeration.js`: gate legacy su `injectBtn()`, posizione storica 148 ripristinata (via ternaria di compattazione).
- [X] T020 [P] [US4] In `public/js/mappai-study-path.js`: gate legacy, posizione storica 212.
- [X] T021 [P] [US4] In `public/js/mappai-palace.js`: gate legacy, posizione storica 276.
- [X] T022 [P] [US4] In `public/js/mappai-games.js` `_injectLauncher()`: gate legacy (flottante Memory Dungeon rimosso di default), posizione storica 340; commento-mappa colonna aggiornato in `mappai-effort-view.js`.
- [X] T023 [US4] In `public/index.html`: bottone "Knowledge Garden" (icona sprout) sotto "Studio attivo" — chiama `window.openKnowledgeGardenHub()` se presente, altrimenti toast `tst_kg_soon`.
- [X] T024 [P] [US4] i18n: `ui_knowledge_garden` + `tt_knowledge_garden` in ENTRAMBI i dizionari; `as_modes_header`, `as_tools_header`, `as_studypath_*`, `as_palace_*`, `as_celeration_*`, `tst_kg_soon` in en_translations.js.
- [ ] T025 [US4] Verifica Electron: launcher landscape (2 colonne, 3 sezioni), 6 ex-flottanti funzionanti dal launcher, colonna destra vuota, bottone Knowledge Garden → toast, flag legacy → 7 flottanti alle posizioni storiche.

---

## Phase 8: Fix critico 2026-07-10 — perdita gerarchia con sessione Studio attivo aperta

**Bug**: le modalità che smontano la mappa (1/2/5/7: link rimossi, livelli/label
alterati) + "Torna alla Home" = `saveCurrentProject()` persisteva lo stato
dell'esercizio e il reload uccideva lo snapshot (solo in memoria) → gerarchia
irrecuperabile. Aggravante: `renderGraph` è monkey-patchato per salvare, quindi
lo stato smontato finiva in localStorage già DURANTE la sessione (autosave
`setInterval` incluso) — un crash a metà sessione aveva lo stesso effetto.

- [X] T026 GUARDIA persistenza in `public/js/mappai-storage-lang.js` `saveCurrentProject()`: se `ActiveStudy.session.active` → return. Protegge TUTTI i percorsi di salvataggio (autosave, renderGraph-patch, chiamate dirette).
- [X] T027 `ActiveStudy.emergencyExit()` in `public/js/mappai-active-study.js`: chiusura sincrona senza modali — salva punteggio pendente (`finishSession(null)`), `doExit()` (ripristino snapshot + cleanup UI), fallback `restoreSnapshot()` se doExit fallisce.
- [X] T028 `emergencyExit()` chiamata prima di ogni sostituzione mappa: `backToLanding` (mappai-ui-canvas.js), `importGraph` (mappai-ui-canvas.js), `loadMapVault` (mappai-vault-io.js), `directLoadVault` (mappai-vault-manager.js).
- [X] T029 Launcher: Cloze e Palazzo della Memoria spostati nella colonna "Modalità di studio" (sotto le 7 numerate); a destra restano Viste (Heat map, Mappa lavoro) e Strumenti (Cosa studiare ora, Progressi).
- [ ] T030 Verifica Electron: avvia modo 5 (intruso) → "Torna alla Home" → riapri progetto → gerarchia INTATTA; idem con import JSON e apertura vault a sessione attiva; autosave durante sessione non sporca localStorage.
