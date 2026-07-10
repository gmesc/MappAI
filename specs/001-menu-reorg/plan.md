# Implementation Plan: Riorganizzazione Menu — Studio Attivo e Output Materiali di Studio

**Branch**: `001-menu-reorg` | **Date**: 2026-07-10 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/001-menu-reorg/spec.md`

## Summary

Due riordini UI senza cambi di comportamento: (1) Cloze, vista Heat map
(padronanza) e vista Mappa lavoro (effort) entrano nel launcher "Studio attivo"
come seconda sezione di card, e i loro tre bottoni flottanti spariscono dal
bordo destro (kill-switch `mappai_legacy_float_btns` per tornare indietro);
i quattro flottanti restanti si compattano verso il basso. (2) Nel menu azioni
rapide nasce la sezione etichettata "Output Materiali di Studio" (Foglio nodi,
Sintesi di ramo, Stampa dossier, Crea Timeline, Jigsaw×3) separata dalle azioni
file/vault. Tutte le etichette nuove bilingui secondo i due meccanismi i18n
di progetto. Dettaglio decisioni: [research.md](research.md).

## Technical Context

**Language/Version**: JavaScript ES2020 (renderer Electron 30, vanilla — no bundler)

**Primary Dependencies**: nessuna nuova; si toccano moduli esistenti
(`mappai-active-study.js`, `mappai-cloze.js`, `mappai-mastery-view.js`,
`mappai-effort-view.js`, `mappai-celeration.js`, `mappai-study-path.js`,
`mappai-palace.js`, `mappai-games.js`), `index.html`, dizionari i18n

**Storage**: N/A (solo un flag booleano in localStorage: `mappai_legacy_float_btns`)

**Testing**: suite Node esistente in `tests/` (nessun nuovo test: zero logica pura
nuova); verifica manuale in Electron (`npm start`) + check coerenza chiavi i18n

**Target Platform**: desktop Electron (macOS/Windows/Linux)

**Project Type**: desktop-app (renderer UI)

**Performance Goals**: nessun requisito nuovo — il launcher resta istantaneo
(costruzione HTML sincrona di ~10 card)

**Constraints**: nessun cambio di comportamento delle 7 funzioni (FR-003/FR-006);
reversibilità via flag (FR-009); offline-first invariato

**Scale/Scope**: ~10 file toccati, ~100 righe modificate, 0 file nuovi

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principio | Esito | Nota |
|---|---|---|
| I. Accessibilità BES/DSA | ✅ | Card launcher = `<button>` reali (tastiera ok), stato viste segnalato con testo oltre che colore; meno bottoni flottanti = meno carico visivo |
| II. Reversibilità | ✅ | Kill-switch `mappai_legacy_float_btns='1'` ripristina la disposizione storica completa (D2/D3) |
| III. Script globali no-build | ✅ | Zero file nuovi; riferimenti lazy `window.MappAICloze && ...` al click; bottoni `type="button"` |
| IV. Dual-provider AI | ✅ N/A | Nessuna chiamata AI |
| V. Integrità vault | ✅ N/A | Nessuna persistenza toccata |
| VI. Logica pura testata | ✅ | Nessuna logica pura nuova; suite esistente deve restare verde; debug-run Electron obbligatorio a fine batch |
| VII. i18n bilingue | ✅ | `ui_output_materials` in ENTRAMBI i dizionari (data-i18n); chiavi `as_*` nuove solo in EN con fallback italiano inline (convenzione `window.t`) |

**Post-design re-check**: invariato, nessuna violazione. Complexity Tracking vuoto.

## Project Structure

### Documentation (this feature)

```text
specs/001-menu-reorg/
├── plan.md              # questo file
├── research.md          # ricognizione codice + 5 decisioni (D1–D5)
├── data-model.md        # nessuna entità dati — file minimo
├── quickstart.md        # guida di verifica manuale end-to-end
└── tasks.md             # output /speckit-tasks (non creato da /speckit-plan)
```

`contracts/`: omesso — la feature non espone interfacce esterne (riordino UI
interno; nessuna API, nessun formato file).

### Source Code (repository root)

```text
public/
├── index.html                        # sezione "Output Materiali di Studio" nel
│                                     #   #floating-actions-menu + riordino voci
├── js/
│   ├── mappai-active-study.js        # openLauncher(): seconda sezione card
│   │                                 #   (Cloze avvio + 2 toggle viste)
│   ├── mappai-cloze.js               # injectBtn() gated dal flag legacy
│   ├── mappai-mastery-view.js        # injectBtn() gated dal flag legacy
│   ├── mappai-effort-view.js         # injectBtn() gated dal flag legacy
│   ├── mappai-celeration.js          # bottom: 148→20 (ternaria flag)
│   ├── mappai-study-path.js          # bottom: 212→84 (ternaria flag)
│   ├── mappai-palace.js              # bottom: 276→148 (ternaria flag)
│   └── mappai-games.js               # bottom: 340→212 (ternaria flag)
└── traduzioni/
    ├── it_translations.js            # + ui_output_materials
    └── en_translations.js            # + ui_output_materials, as_views_header,
                                      #   as_cloze_*, as_heatmap_*, as_effort_*,
                                      #   as_view_on/off
```

**Structure Decision**: nessuna struttura nuova — modifiche puntuali dentro i
moduli esistenti, coerenti col pattern architetturale (script globali caricati
da `index.html`). L'unico stato nuovo è il flag legacy in localStorage.

## Fasi di implementazione (anteprima per /speckit-tasks)

1. **US1 — launcher + flottanti**: sezione card nel launcher (D1) → gate
   `injectBtn` nei 3 moduli (D2) → compattazione 4 posizioni (D3).
2. **US2 — sezione output**: header + riordino voci in `index.html` (D4).
3. **US3 — i18n**: chiavi nei dizionari (D5) + verifica switch IT↔EN.
4. **Verifica**: suite Node verde + quickstart manuale in Electron.

## Complexity Tracking

Nessuna violazione costituzionale da giustificare.
