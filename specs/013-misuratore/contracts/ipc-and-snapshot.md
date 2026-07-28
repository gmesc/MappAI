# Contract — superficie IPC e schema dello snapshot

## Parte 1 — IPC (renderer ↔ main)

**Principio**: il main fa **solo** I/O e finestre. Nessun calcolo di metriche, nessuna logica di indice. Se una funzione del main dovesse calcolare qualcosa, è nel posto sbagliato: i core sono testabili in Node e non hanno bisogno di stare lì.

Esposti via `contextBridge` in `preload.js` come `window.misAPI`.

### Radice dati

| Canale | Argomenti | Ritorna |
|---|---|---|
| `dati-radice` | — | `{ radice, upload, report, esiste }` |

> Unico punto in cui la posizione della cartella dati viene risolta. Lo spostamento in `~/Documents` al momento della pacchettizzazione è un cambio qui e in nessun altro posto (Complexity Tracking del piano).

### Import

| Canale | Argomenti | Ritorna |
|---|---|---|
| `scegli-vault` | — | `{ percorso, annullato }` — dialogo di cartella |
| `scegli-pdf` | — | `{ percorsi[], annullato }` — multiplo |
| `scegli-cartella-classe` | — | `{ percorso, vaultTrovati[] }` |
| `importa` | `{ percorso, tipo, seCollide }` | `{ elemento, sostituito }` — `seCollide`: `chiedi` · `sostituisci` · `affianca` (FR-002, FR-003) |
| `contesto-mappai` | `{ progetto, finestra }` | `{ classe, consumi[], disponibile }` — legge `classi.json` e `consumi-ai.jsonl` **in sola lettura** |

### Elementi e report

| Canale | Argomenti | Ritorna |
|---|---|---|
| `elementi-lista` | — | `Elemento[]` — legge il disco, non una cache (FR-005) |
| `elemento-elimina` | `{ id, confermaTesto }` | `{ ok }` — richiede il nome esatto |
| `elemento-leggi-corpi` | `{ id }` | `{ corpi[] }` |
| `report-lista` | — | `[{ file, titolo, data, tipo, nElementi, profiloId }]` — legge `Report/`, ricostruendo da `_dati/` o dal JSON incorporato (FR-006, FR-040) |
| `report-salva` | `{ html, json, nome }` | `{ file }` — scrive `.html` e la copia in `_dati/` |
| `report-apri` | `{ file }` | — apre nella finestra dell'app, non nel browser di sistema (US2) |
| `report-mostra-cartella` | `{ file }` | — |
| `report-elimina` | `{ file, confermaTesto }` | `{ ok }` (FR-007) |

### Profili

| Canale | Argomenti | Ritorna |
|---|---|---|
| `profili-lista` | — | `Profilo[]` — il predefinito più i personalizzati |
| `profilo-salva` | `{ profilo }` | `{ ok, errori[] }` — valida prima di scrivere (FR-033-ter) |
| `profilo-ripristina` | — | `{ profilo }` — torna al predefinito senza cancellare i personalizzati (FR-056) |

### PDF e AI

| Canale | Argomenti | Ritorna |
|---|---|---|
| `pdf-estrai` | `{ percorso }` | `{ blocchi[], pagine, problema }` — `problema: 'senza-testo'` sotto le 200 parole (US3) |
| `ai-prosa` | `{ system, user, modello }` | `{ testo, usoToken }` — **la chiave non lascia mai il main** |
| `ai-chiave-imposta` / `-stato` | `{ chiave }` / — | `{ ok }` / `{ configurata }` — mai restituita al renderer |

---

## Parte 2 — Schema dello snapshot `mappai-misura@1`

Il contratto più importante: governa che cosa resta leggibile fra un anno.

### Incorporazione nel report

```html
<script type="application/json" id="mis-dati">{ …analisi… }</script>
```

Stesso schema del file in `_dati/`. Il report è la **fonte di verità**; `_dati/` è cache ricostruibile (FR-039, FR-040).

### Campi obbligatori

```jsonc
{
  "schema": "mappai-misura@1",
  "id": "…", "creataIl": "2026-07-28T09:12:00.000Z",
  "titolo": "Funzioni Urbane — 1A vs 1B",
  "tipo": "confronto",                 // profilo | confronto
  "versioneMisuratore": "1.0.0",
  "elementi": [ /* descrittori AL MOMENTO dell'analisi, non riferimenti a Upload/ */ ],
  "misure":   [ /* una per elemento */ ],
  "confronto": { "strategia": "appaiato", /* … */ },
  "baseline":  { /* null se nessuna fonte misurabile */ },
  "profilo":   { /* il profilo PER INTERO (FR-032) */ },
  "prosaAI":   null,
  "limiti":    [ /* generati da ciò che è accaduto (FR-041) */ ]
}
```

### Invarianti — vincolano il codice, non sono raccomandazioni

1. **`profilo` è incorporato per intero, mai per riferimento.** Un `profiloId` da solo rende il report illeggibile quando il profilo cambia. Costo: qualche decina di kilobyte. Beneficio: l'archivio non marcisce.
2. **`elementi` contiene i descrittori copiati, non i puntatori.** Cancellare un elemento da `Upload/` non deve svuotare un report già prodotto (SC-004).
3. **Se `baseline` esiste, contiene sia `deltaIndice` sia `copertura`.** Nessuna forma valida ha l'uno senza l'altra (FR-023) — garantito a monte da `buildBaseline`, che lancia.
4. **`limiti` non è mai vuoto.** Un'analisi senza limiti dichiarati non è un'analisi perfetta, è un'analisi che non ha guardato (principio 5 della visione).
5. **`prosaAI` è additiva.** Aggiungerla non modifica nessun altro campo. Verificabile per confronto (SC-007).
6. **Ogni numero porta la propria definizione risolta** (FR-010). Il costruttore del report non sa che cosa sia una «parola lunga»: lo legge dal dato.

### Evoluzione

Un cambio incompatibile diventa `mappai-misura@2`. Il lettore accetta le versioni note e **rifiuta esplicitamente** quelle ignote invece di interpretarle a caso: un report del futuro letto male è peggio di un report non letto.
