# Implementation Plan: Tutor AI via QR — "Chatta e Scrivi"

**Branch**: `007-tutor-qr` | **Date**: 2026-07-12 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/007-tutor-qr/spec.md`

## Summary

Quinta attività live: lo studente entra da telefono via QR con le credenziali di
classe, chatta col **Tutor AI** sull'argomento assegnato (modalità e cap scambi
fissati dal docente), poi redige e consegna un **testo personale**. Il **PC
docente fa da tramite AI** (la chiave non lascia mai il main process); il tutor
**non redige mai il testo**. Il docente riceve, per studente, **testo +
trascrizione** (processo, non solo prodotto). Nuovo `tutor-server.js` fratello di
live/collab, helper AI condiviso estratto dagli IPC esistenti, logica pura
(cap/coda/validazione) in modulo UMD testato.

## Technical Context

**Language/Version**: JavaScript ES2020 (renderer Vanilla JS `window.*`, no bundler); Node.js (Electron 30 main + tutor-server.js HTTP puro)

**Primary Dependencies**: Electron 30, axios (già usato per le chiamate AI), qrcode-generator (vendored). Nessuna dipendenza nuova.

**Storage**: file su disco `~/Documents/MappAI - Tutor/<sessione>/` (session.json, students/<id>.json, results.json + report HTML); credenziali da `MappAIClasses`. Nessun localStorage per i dati docente sensibili (solo bozza/mirror sul telefono studente).

**Testing**: `npm test` (node --test); nuovi `tests/tutor-core.test.js` (logica pura) e `tests/tutor-server.test.js` (endpoint, come live-server.test.js); debug-run Electron per UI + chiamate AI reali.

**Target Platform**: desktop (Electron, server LAN); telefoni studente sul browser via LAN

**Project Type**: desktop-app + LAN server (pattern dei fratelli garden/collab/live)

**Performance Goals**: coda AI serializzata (SC-006); cap per studente blocca prima della chiamata (SC-002); risposte tutor brevi (~400 token)

**Constraints**: chiave API mai servita ai telefoni (FR-013/SC-003); istruzioni tutor solo lato server (FR-014); dual-provider Google/Infomaniak (Costituzione IV); trascrizioni solo su disco (FR-016); i18n bilingue; suite verde; ogni modifica reversibile

**Scale/Scope**: classe ~25 studenti, cap 3-20 scambi, 1 argomento per sessione (v1)

## Constitution Check

*GATE: Constitution v1.0.0 — PASS (pre-research e post-design).*

| Principio | Esito | Note |
|---|---|---|
| I. Accessibilità BES/DSA | ✅ | Attività studente semplice a 3 fasi; pagina in stile MappAI ad alta leggibilità; il tutor adatta al profilo/taratura classe; TTS riusabile |
| II. Reversibilità e gradualità | ✅ | Nuovi file + nuovo server, additivi; la card hub è nuova, non altera le attività esistenti; kill-switch sulla card se serve |
| III. Script globali, no build | ✅ | `mappai-tutor-*.js` su `window.*`; server HTTP puro Node; pagina studente self-contained |
| IV. Dual-provider AI | ✅ | Il proxy usa il provider attivo (Google/Infomaniak) con le sue regole (no responseMimeType su Infomaniak, salvage non serve — è chat testuale) |
| V. Integrità vault (DAL) | ✅ | Il vault NON è toccato; i dati vivono in `~/Documents/MappAI - Tutor/` (come Live/Lavagna) |
| VI. Logica pura testata | ✅ | cap/coda/validazione/publicState/assemblaggio report in `mappai-tutor-core.js` UMD + test; server con test endpoint |
| VII. i18n bilingue | ✅ | Pagina studente e wizard IT+EN; `data-i18n` per statico, `window.t` per JS |

**Nota provider (IV)**: la chiamata di chat passa dal proxy con il formato del
provider attivo. Su Infomaniak niente `responseMimeType`; risposta testuale
(non JSON) → nessun `salvageTruncatedJSON` necessario. Nessuna violazione →
Complexity Tracking vuota.

## Project Structure

### Documentation (this feature)

```text
specs/007-tutor-qr/
├── spec.md · plan.md · research.md · data-model.md · quickstart.md
├── contracts/api-and-ai.md
├── checklists/requirements.md
└── tasks.md   (/speckit-tasks)
```

### Source Code (repository root)

```text
main.js                                   # MODIFICA: estrai helper callModel({provider,apiKey,payload,...})
                                          #   riusato dagli IPC generate-gemini/infomaniak; IPC
                                          #   tutor-start/stop-session, -session-info, -open-folder;
                                          #   il tutor-server chiama callModel in-process (chiave in main)
tutor-server.js                           # NUOVO: createTutorServer(opts) — /api/session, /api/join,
                                          #   /api/tutor (chat, cap+coda), /api/draft, /api/submit,
                                          #   /api/status (admin), /api/reopen (admin), /api/close;
                                          #   autosave students/<id>.json; ripresa crash-safe
public/
├── tutor/student.html                    # NUOVO: pagina studente 3 fasi (login → Esplora → Scrivi → Consegna)
├── js/
│   ├── mappai-tutor-core.js              # NUOVO (UMD puro): canSpend, validateMessage, publicState,
│   │   #   buildTranscript, computeTutorResults (report per-studente)
│   ├── mappai-tutor-teacher.js           # NUOVO: openTutorSetup (wizard), dashboard griglia+polling,
│   │   #   costruzione system instruction (fillPromptTemplate: mode+anti-redazione+contesto+taratura),
│   │   #   chiusura → report; card nell'hub live
│   ├── mappai-tutor-reports.js           # NUOVO (UMD): HTML report per-studente (testo + trascrizione)
│   ├── mappai-live-teacher.js            # MODIFICA: nuova card "Chatta e Scrivi" in openLiveHub
│   └── (preload.js)                      # MODIFICA: espone gli IPC tutor-*
├── traduzioni/{it,en}_translations.js    # MODIFICA: chiavi wizard/studente
tests/
├── tutor-core.test.js                    # NUOVO: logica pura
└── tutor-server.test.js                  # NUOVO: endpoint (join/tutor/cap/submit/reopen/close)
```

**Structure Decision**: quinto server fratello + moduli `mappai-tutor-*` a script
globali. L'unica modifica invasiva è l'estrazione di `callModel` in main.js
(refactor conservativo: gli IPC esistenti lo richiamano, comportamento
invariato). Vault e attività esistenti intatti.

## Design decisions (da research.md)

1. **R1** proxy AI: `callModel` in main, chiave confinata al main, mai servita ai telefoni.
2. **R2** `tutor-server.js` fratello, porte 8769-8779, cartella `MappAI - Tutor/`.
3. **R3** system instruction costruita nel renderer all'avvio e passata al server (thin server, telefono non altera).
4. **R4** cap/coda/validazione/publicState in `mappai-tutor-core.js` testato; maxTokens ~400.
5. **R5** identità = Account classi (`mappai-live-core` + `MappAIClasses`).
6. **R6** `public/tutor/student.html` a 3 fasi, bozza/chat resilienti al rientro.
7. **R7** report processo+prodotto (`mappai-tutor-reports.js`), dashboard polling.
8. **R8** card nell'hub live + registro sessioni `logSession('tutor')`.
9. **R9** provider attivo dell'app; trascrizioni solo su disco.
10. **R10** i18n regola 13.

## Complexity Tracking

Nessuna violazione — tabella vuota.
