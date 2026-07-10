# Research — Riorganizzazione Menu (001-menu-reorg)

Nessun `NEEDS CLARIFICATION` nel Technical Context: stack noto, feature interamente
interna al renderer. La ricerca si riduce alla ricognizione del codice esistente
(fatta leggendo i moduli reali) e a 5 decisioni di design.

## Ricognizione — dove vive oggi ogni cosa

| Cosa | File | Dettaglio |
|---|---|---|
| Launcher Studio attivo | `public/js/mappai-active-study.js` | `ActiveStudy.openLauncher()` costruisce card HTML da `MODES` e chiama `buildModal(...)`; già i18n via `window.t` |
| Cloze | `public/js/mappai-cloze.js` | `window.MappAICloze.start()`; bottone flottante `#cz-btn` iniettato da `injectBtn()` a `bottom:20px` |
| Heat map (padronanza) | `public/js/mappai-mastery-view.js` | `window.MappAIMasteryView.toggle()`; bottone `#mv-btn` a `bottom:84px` |
| Mappa lavoro (effort) | `public/js/mappai-effort-view.js` | `window.MappAIEffortView.toggle()`; bottone `#ev-btn` a `bottom:404px`; disattiva MasteryView quando si attiva (mutua esclusione) |
| Altri flottanti colonna destra | `mappai-celeration.js` (148) · `mappai-study-path.js` (212) · `mappai-palace.js` (276) · `mappai-games.js` (340) | posizioni hardcoded nei rispettivi `injectBtn()` |
| Menu azioni rapide | `public/index.html` §`#floating-actions-menu` (~riga 1354) | voci output mescolate a file/vault; ordine attuale: …vault/import… ─divider─ Foglio nodi · Stampa dossier · Crea Timeline · JIGSAW×3 · Studio attivo · Sintesi di ramo · Annulla ─divider─ Torna alla Home |
| i18n | `public/traduzioni/*_translations.js` | HTML statico via `data-i18n` (chiave in ENTRAMBI i dizionari); stringhe JS via `window.t('chiave','fallback it')` (chiave solo in EN) |

Ordine di caricamento script: `mappai-active-study.js` viene PRIMA di
mastery/effort/cloze — irrilevante perché il launcher referenzia i moduli
solo al click (`window.MappAICloze && ...`), mai al load.

`studentMode`: nessuno dei tre moduli spostati ha gating per modalità studente
(bottoni oggi sempre visibili) → FR-008 soddisfatto senza lavoro.

## Decisioni

### D1 — Come esporre le 3 funzioni nel launcher
**Decision**: seconda sezione nel launcher, sotto le 7 modalità: intestazione
"Viste ed esercizi rapidi" + 3 card nello stesso stile `as-mode-card`.
Cloze = card "avvia" (chiude il modale, `MappAICloze.start()`).
Heat map / Mappa lavoro = card toggle: mostrano lo stato corrente (attiva/spenta)
con testo + colore bordo (segnale non solo cromatico: cambia anche l'etichetta),
al click attivano/disattivano e chiudono il modale.
**Rationale**: riusa `buildModal`/pattern card esistente, zero nuovi file,
distinzione sessioni-vs-viste chiesta dallo scenario US1-1.
**Alternatives considered**: (a) aggiungere le 3 voci a `MODES` come modi 8-10 —
scartata: `MODES` alimenta metriche/mastery/report, le viste non sono sessioni;
(b) sottomenu separato nel menu azioni rapide — scartata: il documento chiede
esplicitamente "menu Studio Attivo".

### D2 — Rimozione bottoni flottanti + reversibilità
**Decision**: flag `mappai_legacy_float_btns` (localStorage). Default assente =
nuovo comportamento: `injectBtn()` di cloze/mastery/effort ritorna subito.
Con flag `'1'` i tre bottoni tornano alle posizioni storiche E i quattro moduli
restanti mantengono le posizioni storiche.
**Rationale**: principio costituzionale II (reversibilità via kill-switch);
un solo flag letto da 6 moduli, modifiche a una riga ciascuno.
**Alternatives considered**: rimozione secca del codice — scartata (non
reversibile senza revert git); flag per-modulo — scartata (3 flag da ricordare).

### D3 — Compattazione colonna destra
**Decision**: con il nuovo default, i 4 flottanti restanti scalano in giù:
celeration 148→20, study-path 212→84, palace 276→148, games 340→212
(ternaria sul flag D2: legacy = posizioni storiche).
**Rationale**: rimuovendo bottom:20/84 la colonna resterebbe sospesa a 128px
dall'angolo — contraddice l'obiettivo "bordo destro più pulito" (SC-002).
**Alternatives considered**: lasciare i buchi — scartata per resa visiva;
helper condiviso di posizionamento — scartata (over-engineering per 6 ternarie).

### D4 — Sezione "Output Materiali di Studio" nel menu azioni rapide
**Decision**: in `index.html`, header di sezione non interattivo con `data-i18n`
prima di "Foglio nodi"; spostare la voce "Sintesi di ramo (AI)" su, accanto a
Stampa dossier; la voce "Studio attivo" scende sotto la sezione (resta nel menu).
Sezione risultante: Foglio nodi · Sintesi di ramo · Stampa dossier ·
Crea Timeline · Esporta JIGSAW · Ricomponi copie · Revisione lacune.
**Rationale**: riordino puro di markup esistente (onclick invariati = FR-006);
Timeline è materiale di studio stampabile e sta già in mezzo al gruppo —
lasciarla fuori creerebbe un orfano visivo (registrato come estensione minima
rispetto alla lista del documento).
**Alternatives considered**: sotto-menu a comparsa — scartata (un livello di
profondità in più per l'uso in classe, contro lo scopo); seconda sezione
etichettata anche per file/vault — rinviata (il divider esistente basta per
FR-005, meno testo sulla LIM).

### D5 — Chiavi i18n
**Decision**:
- Header sezione (HTML statico): chiave `ui_output_materials` con `data-i18n`,
  presente in ENTRAMBI i dizionari.
- Card launcher (stringhe JS): `as_views_header`, `as_cloze_title`, `as_cloze_hint`,
  `as_heatmap_title`, `as_heatmap_hint`, `as_effort_title`, `as_effort_hint`,
  `as_view_on`, `as_view_off` via `window.t(chiave, fallback-italiano)` —
  chiavi solo in `en_translations.js` (convenzione di progetto).
**Rationale**: principio VII; i due meccanismi esistenti coprono i due casi.
**Alternatives considered**: nessuna (convenzione fissata dalla costituzione).

## Nessun impatto

- Nessuna chiamata AI, nessun provider coinvolto (principio IV: N/A).
- Nessuna persistenza: vault, mappe, localStorage dei dati non toccati
  (principio V: N/A; l'unico localStorage nuovo è il flag D2).
- Nessuna nuova logica pura → nessun nuovo test unit; la suite esistente
  (250/250) deve restare verde (principio VI).
