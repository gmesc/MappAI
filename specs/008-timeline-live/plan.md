# Implementation Plan: Timeline Live — completa e costruisci la timeline via QR

**Branch**: `008-timeline-live` | **Date**: 2026-07-13 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/008-timeline-live/spec.md`

## Summary

Portare la timeline da documento stampabile ad attività di classe: (1) base dati
in-app — date manuali persistite col progetto, editing dal popup, esercizio
"trova le date" per lo studente singolo, pool AI persistito; (2) attività
"Timeline" in MappAI Live con modalità **Completa** (domande autovalutate
generate dal pool, zero AI) e **Costruisci** (proposte studenti → revisione
docente → persistenza nel progetto), con proiezione LIM; (3) login flessibile
individuale/gruppi per Timeline ed esteso alla Lavagna; (4) tab sidebar "LIM".

Approccio tecnico: nessun server nuovo — la modalità Completa è una sessione
`live-server.js` standard con domande `open`/`mc` arricchite (chiave-anno con
tolleranza, indizio tracciato); la modalità Costruisci è un'estensione additiva
di `live-server.js` (endpoint proposte/revisione attivi solo con
`mode:'build'`). Logica pura nel nuovo core UMD `mappai-timeline-core.js`
(+ estensioni chirurgiche a `mappai-live-core.js`), tutta testata in Node.

## Technical Context

**Language/Version**: JavaScript ES5-ish nel renderer (Vanilla, script globali
`window.*`, NO ES modules), Node.js nel main process. Electron 30.

**Primary Dependencies**: infrastruttura esistente — `live-server.js`
(porte 8767-8777), `collab-server.js` (8766-8776), `mappai-live-core.js`,
`mappai-live-reports.js`, `mappai-live-teacher.js`, `mappai-collab-teacher.js`
(pattern hosts 006), `mappai-timeline.js`, QR vendored
(`public/js/vendor/qrcode-generator.js`). Zero dipendenze nuove.

**Storage**: `appState.db.timelineEvents` (date manuali/studente) e
`appState.db.timelineAI` (pool ultima generazione) — serializzati col progetto
in localStorage (`StorageManager.saveCurrentProject`). Sessioni live su disco
`~/Documents/MappAI - Live/<slug>/` (session.json + students/<id>.json +
proposals nel per-studente), pattern crash-safe esistente. Vault NON toccato.

**Testing**: `node --test` (suite attuale 382/382, deve restare verde).
Nuovo `tests/timeline-core.test.js`; estensioni a `tests/live-core.test.js`,
`tests/live-server.test.js`, `tests/collab-server.test.js`.

**Target Platform**: Electron desktop (macOS/Win/Linux) per il docente;
browser mobile su LAN per gli studenti (pagine self-contained, no Tailwind).

**Project Type**: desktop-app + pagine studente servite da server LAN in-process.

**Performance Goals**: proiezione LIM riflette un'approvazione ≤5s (polling 3s);
lancio attività ≤4 interazioni; generazione domande sincrona e senza AI.

**Constraints**: zero chiamate AI nelle attività (pool pre-esistente);
nessun segreto ai telefoni; sessioni riprendibili stesso token; classi ≤33
identità (limite Live esistente); offline/LAN-only.

**Scale/Scope**: ~2 moduli JS nuovi + 1 pagina studente nuova + ~8 file
modificati; ~40-60 test nuovi attesi.

## Constitution Check

*GATE: verificato contro Constitution v1.0.0 (principi I–VII).*

| Principio | Esito | Note |
|---|---|---|
| I. Accessibilità BES/DSA | ✅ | Indizio "hint ladder" (sempre/su richiesta/mai) e tolleranza ±anni sono valvole BES; card-buco ed errori marcati anche non-cromaticamente (icona/tratteggio); cap domande e proposte per contenere il carico. |
| II. Reversibilità | ✅ | Tutto additivo. Kill-switch `mappai_lim_tab='0'` per il tab LIM (unica modifica a UI esistente). Login Lavagna: default = comportamento storico a gruppi. Endpoint build attivi solo con `mode:'build'`. |
| III. Script globali | ✅ | Nuovi moduli `mappai-timeline-core.js` / `mappai-timeline-teacher.js` su `window.*`, caricati in index.html dopo `app.js`; pattern `_getAppState()` non necessario (uso scope lessicale come i fratelli live). |
| IV. Dual-provider AI | ✅ (n/a) | La feature NON fa chiamate AI (SC-003). Il pool nasce dalla generazione timeline esistente, già dual-provider. Nessun `responseMimeType` introdotto. |
| V. Integrità vault | ✅ | Vault non toccato. Store progetto: campi additivi con init robusto in `loadProject` (progetti legacy → array vuoti, FR-063). |
| VI. Logica pura testata | ✅ | Generazione domande, grading anno/tolleranza, validazione proposte, dedup, gaps → core UMD testati. Debug-run Electron nel quickstart. |
| VII. i18n bilingue | ✅ | Chiavi statiche sidebar in ENTRAMBI i dizionari; stringhe moduli via `window.t('tl_*', 'fallback IT')` + EN in `en_translations.js`; nei core UMD `_tSafe` locale. |

Nessuna violazione → Complexity Tracking vuoto.

## Project Structure

### Documentation (this feature)

```text
specs/008-timeline-live/
├── plan.md              # Questo file
├── research.md          # Fase 0 — decisioni architetturali
├── data-model.md        # Fase 1 — entità e schemi
├── quickstart.md        # Fase 1 — guida di validazione manuale (Electron + 2 device)
├── contracts/
│   └── timeline-live.md # Fase 1 — contratti API/schemi wire
└── tasks.md             # Fase 2 (/speckit-tasks — NON creato da /speckit-plan)
```

### Source Code (repository root)

```text
NUOVI
public/js/mappai-timeline-core.js      # UMD puro: pool, domande, grading anno,
                                       #   distrattori MC, gaps, proposte, dedup
public/js/mappai-timeline-teacher.js   # wizard setup, dashboard (griglia+revisione),
                                       #   proiezione LIM fullscreen, chiusura+report
public/live/timeline-build.html        # pagina studente modalità Costruisci
                                       #   (self-contained, stile student.html)
tests/timeline-core.test.js            # test del core nuovo

MODIFICATI
public/js/mappai-timeline.js           # US1: layer MappAITimeline (date manuali,
                                       #   merge, popup editing, esercizio in-app)
                                       #   + persistenza pool appState.db.timelineAI
public/js/mappai-live-core.js          # gradeAnswer: answerYear/tolleranza/periodi,
                                       #   answerTexts (multi-evento stesso anno);
                                       #   cleanAnswer: hintUsed; computeResults:
                                       #   conteggio indizi; publicQuestions: hint
live-server.js                         # loginMode 'group' su /api/join;
                                       #   mode 'build': /api/propose /api/review
                                       #   + proposte in status/close; allowlist
                                       #   timeline-build.html
collab-server.js                       # loginMode 'individual' su /api/join
                                       #   (roster emoji+numero) — default invariato
main.js                                # pass-through opts nuovi (mode, loginMode,
                                       #   settings) in live-start/collab-start
public/js/mappai-live-teacher.js       # 5ª card "Timeline" nell'hub → openTimelineLiveSetup
public/js/mappai-live-reports.js       # colonna indizi nei 2 report; nuovo
                                       #   buildTimelineWorkshopReportHtml
public/js/mappai-collab-teacher.js     # scelta login al lancio Lavagna;
                                       #   mount pannello nel tab LIM
public/live/student.html               # bottone 💡 indizio + hintUsed nella risposta
public/index.html                      # tab sidebar LIM (bottone + #sidebar-panel-lim)
                                       #   + <script> nuovi moduli
public/js/mappai-ui-modals.js          # switchSidebarTab: caso 'lim'
public/traduzioni/it_translations.js   # chiavi statiche tab LIM
public/traduzioni/en_translations.js   # chiavi statiche + tl_* EN
tests/live-core.test.js                # casi grading anno/hint
tests/live-server.test.js              # casi group-login e build-mode
tests/collab-server.test.js            # casi individual-login
```

**Structure Decision**: si estende l'infrastruttura live esistente (nessun
server nuovo, nessuna porta nuova). La logica di dominio timeline vive nel
core UMD nuovo; le modifiche a moduli esistenti sono chirurgiche e additive,
con default che preservano il comportamento storico.

## Complexity Tracking

Nessuna violazione della costituzione — sezione vuota.
