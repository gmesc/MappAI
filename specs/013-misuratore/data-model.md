# Phase 1 — Data Model: MappAI - misuratore

**Data**: 2026-07-28 · **Spec**: [spec.md](./spec.md) · **Research**: [research.md](./research.md)

Regola trasversale: ogni struttura è **JSON semplice e serializzabile**, senza classi, senza riferimenti circolari, senza date come oggetti (sempre stringhe ISO). I core puri ricevono e restituiscono queste strutture e nient'altro.

---

## 1. Elemento — l'unità misurabile

Vive in `Upload/<nome>/`, con un `elemento.json` che descrive ciò che gli sta accanto.

```
Upload/1B · Funzioni Urbane/
├── elemento.json          ← il descrittore qui sotto
└── originale/             ← copia integrale di ciò che è stato importato
    ├── index.yaml  links.json  pipeline.json
    ├── Nodi/  Fonti/  Materiale Studio/
```

| Campo | Tipo | Note |
|---|---|---|
| `id` | stringa | stabile, generato all'import, mai riusato |
| `nome` | stringa | disambiguato con la classe: `1B · Funzioni Urbane` (FR-003) |
| `tipo` | `vault` · `pdf` · `sintesi` | determina quali corpi si possono estrarre |
| `importatoIl` | ISO | |
| `origine` | stringa | percorso da cui è stato copiato, a fini diagnostici |
| `contesto` | oggetto | **fotografia** al momento dell'import (FR-004) |
| `corpi` | array di **Corpo di testo** | estratti all'import, non ricalcolati a ogni analisi |
| `problemi` | array di stringhe | `pdf-senza-testo`, `lingua-non-italiana`, `links-assenti`… |

### `contesto` — ciò che al momento dell'import è vero e dopo potrebbe non esserlo più

| Campo | Origine | Serve a |
|---|---|---|
| `classe` · `grado` · `sistema` · `registro` · `note` | `classi.json` di MappAI | stratificazione dell'ANDAMENTO (US5) |
| `modello` · `provider` | `index.yaml → generationUsage` | asse versione/modello |
| `tokenDichiarati` | `index.yaml → generationUsage.totalTokens` | verifica incrociata dell'abbinamento consumi (R7) |
| `preset` | nomi dei file in `Materiale Studio/` | asse preset |
| `generatoIl` · `finestra` | `pipeline.json` `createdAt`/`updatedAt` | asse temporale e abbinamento consumi |
| `consumi` | righe di `consumi-ai.jsonl` nella finestra | lente costi (US7) |
| `materia` · `livello` | dedotti, correggibili a mano | asse materia/livello |

> `materia` non esiste in nessun file di MappAI. Va **dedotta** dal titolo e resa **modificabile**: dedurla in silenzio e trattarla come un fatto renderebbe falso un intero asse dell'ANDAMENTO.

---

## 2. Corpo di testo — la porzione omogenea che si misura

Un elemento ne produce diversi. La segmentazione in **blocchi** è portante: da R9, un blocco senza punteggiatura finale conta come una frase, e appiattire tutto a testo continuo falsa la lunghezza media delle frasi.

| Campo | Tipo | Note |
|---|---|---|
| `ruolo` | `nodi` · `sintesi` · `quiz` · `flashcard` · `fonte` | |
| `etichetta` | stringa | `Quiz — Scelta Multipla` |
| `blocchi` | array di `{ tipo, testo }` | tipo: `titolo` · `paragrafo` · `voce-elenco` · `nodo` |
| `meta` | oggetto | per `nodi`: `livello` e `id` per blocco. Per `fonte`: pagina |

**Definizione del blocco `nodo`** (calibrata in R1, non negoziabile): tutto ciò che segue il frontmatter YAML **meno** la riga del titolo markdown `# Etichetta`. Includendo il titolo nessuna cifra della pagina di riferimento combacia più.

---

## 3. Profilo di parametri — la configurazione che è anche documentazione

L'oggetto più importante del modello. È **al tempo stesso** ciò che i core leggono per calcolare e ciò da cui si generano il tab METODO e la sezione «limiti» dei report (FR-054). Non esiste un secondo posto dove sia scritto che cosa significa una metrica.

```
public/profili/predefinito.json          ← indice-accessibilita@1, versionato in git
<dati>/profili/<id>.json                 ← profili personalizzati dell'utente
```

| Campo | Tipo | Note |
|---|---|---|
| `id` | stringa | `indice-accessibilita@1` o `personale-<impronta>` |
| `nome` | stringa | mostrato in METODO e nella testata dei report |
| `creatoIl` · `derivatoDa` | ISO · id | catena di derivazione dei profili |
| `parametri` | mappa di **Parametro** | tutte le scelte arbitrarie |
| `componenti` | array di **Componente** | gli 8 dell'Allegato A |

### Parametro — mai un numero nudo (FR-053)

```json
"parolaLungaMinChar": {
  "valore": 8,
  "tipo": "intero", "min": 4, "max": 20,
  "definizione": "Una parola conta come lunga se ha almeno 8 caratteri dopo la tokenizzazione.",
  "motivo": "Soglia usata nell'assessment del 24/07/2026; convenzionale in letteratura per l'italiano.",
  "limite": "Arbitraria. Non distingue una parola lunga ma familiare ('naturalmente') da una lunga e tecnica ('nominalizzazione')."
}
```

I tre campi testuali non sono ornamento: sono **l'unica fonte** dei testi di METODO e della sezione «limiti». Un parametro senza `limite` non supera la validazione — è ciò che impedisce di aggiungere una soglia senza dichiararne la debolezza.

### Componente dell'indice

| Campo | Note |
|---|---|
| `n` · `nome` · `peso` | 1-8; i pesi devono sommare a 100 (FR-033-ter) |
| `metriche` | quali metriche lo compongono e come si mediano |
| `ancoraggi` | punti `[valore, punteggio]`, **monotòni** (validato) |
| `richiede` | `struttura` · `formattazione` · `grafo` — determina la calcolabilità |
| `moderatoDa` | solo componente 6: il fattore di sostanza |
| `definizione` · `motivo` · `limite` | come per i parametri |

### Vincoli di validazione (FR-033-ter)

1. I pesi sommano esattamente a 100.
2. Gli ancoraggi di ogni metrica sono monotòni e con almeno due punti.
3. Ogni valore sta dentro `min`/`max`.
4. Ogni parametro e ogni componente ha `definizione`, `motivo`, `limite` non vuoti.
5. Il fattore di sostanza resta nell'intervallo `[0,4 – 1,0]`.

---

## 4. Misura — i numeri su un elemento

| Campo | Note |
|---|---|
| `elementoId` | |
| `perCorpo` | mappa `ruolo → ` metriche linguistiche |
| `struttura` | metriche di grafo (solo `tipo: vault`) |
| `paroleNodo` | per livello e complessive: `n`, media, min, max, deviazione **di popolazione** (R1) |
| `quiz` | array per set |
| `costi` | token, chiamate, CHF, `abbinamentoSospetto`, `righeContese` |
| `indice` | `{ valore, componenti[], componentiAttivi, componentiTotali, ridistribuzione }` |
| `nonCalcolabili` | mappa `metrica → motivo` (FR-011) |

Ogni metrica trasporta la propria `definizione` risolta dal profilo (FR-010): il costruttore del report non deve sapere che cosa significa «parola lunga».

---

## 5. Confronto — l'accostamento di N misure

| Campo | Note |
|---|---|
| `strategia` | `appaiato` (N=2) · `colonne` (3-6) · `distribuzioni` (7+) — scelta dal codice, non dall'utente (FR-018) |
| `delta` | per metrica, solo se N=2 |
| `concettiAppaiati` | etichette presenti in tutti gli elementi, coi testi |
| `concettiEsclusivi` | per elemento |
| `matriceConcetti` | concetto × elemento, per la strategia `colonne` |
| `distribuzioni` | mediana, quartili, estremi con l'elemento che li tocca, per `distribuzioni` |
| `omogeneo` | booleano: gli elementi condividono la fonte? Se falso, il confronto lessicale è confuso e va dichiarato |

---

## 6. Baseline — fonte contro prodotto

Non è un'entità separata: è una **Misura** con `ruolo: fonte` più un blocco di raffronto.

| Campo | Note |
|---|---|
| `deltaIndice` | differenza dell'indice, **solo sui componenti attivi da entrambi i lati** (FR-021) |
| `componentiComuni` | quali e quanti — deve comparire accanto al Δ |
| `deltaPerComponente` | |
| `copertura` | `{ frasiFonte, frasiCoperte, quota, soglia }` |
| `nonCalcolabile` | es. `fonte-senza-testo` (PDF scansionato) |

**Vincolo di rendering (FR-023)**: il costruttore del report riceve `deltaIndice` e `copertura` come **un oggetto unico**. Non esiste una via di codice che emetta l'uno senza l'altra — la regola è resa impossibile da violare dalla forma del dato, non affidata alla disciplina di chi scrive il builder.

---

## 7. Analisi — l'oggetto salvato

È lo snapshot congelato. Vive incorporato nel report `.html` e in copia in un archivio affiancato (FR-039).

| Campo | Note |
|---|---|
| `schema` | `mappai-misura@1` |
| `id` · `creataIl` · `titolo` | |
| `tipo` | `profilo` (1 elemento) · `confronto` (N) |
| `elementi` | descrittori **al momento dell'analisi**, non riferimenti a `Upload/` |
| `misure` · `confronto` · `baseline` | |
| `profilo` | il profilo di parametri **per intero** (FR-032) |
| `versioneMisuratore` | |
| `prosaAI` | `null` finché non generata; `{ sezioni, modello, generataIl, cifreVerificate }` |
| `limiti` | generati da ciò che è realmente accaduto (FR-041) |

**Perché il profilo per intero e non per riferimento**: un report deve restare interpretabile fra un anno, quando il profilo che l'ha prodotto sarà stato modificato o cancellato. Il costo è qualche decina di kilobyte per report; il beneficio è che l'archivio non può marcire.

### Persistenza

```
Report/
├── 2026-07-28 · Funzioni Urbane — 1A vs 1B.html     ← con <script type="application/json" id="mis-dati">
└── _dati/
    └── 2026-07-28 · Funzioni Urbane — 1A vs 1B.json ← copia per la lettura rapida
```

`_dati/` è una **cache ricostruibile**: se manca o è incompleta, l'ANDAMENTO rilegge il JSON incorporato nei report (FR-040). Il report è la fonte di verità, non l'indice.

---

## 8. Archivio e aggregazione dell'ANDAMENTO

L'archivio è l'insieme delle Analisi. `mis-trend-core` è puro: riceve un array di Analisi e restituisce l'aggregazione.

| Campo | Note |
|---|---|
| `asse` | `tempo` · `versione` · `registro` · `materia` |
| `serie` | una per combinazione `profilo.id` + valore dell'asse |
| `punti` | `{ analisiId, data, indice, etichetta }` |
| `avvisi` | `campione-insufficiente` (meno di 3), `profili-diversi`, `componenti-diversi` |

**Regola dura (FR-045)**: due Analisi con `profilo.id` diverso non finiscono mai nella stessa serie. Senza questa regola, ritoccare un peso riscriverebbe la storia in silenzio — che è precisamente il rischio introdotto dal rendere i parametri modificabili.

**Secondo avviso, meno ovvio**: due analisi con lo stesso profilo ma un numero diverso di **componenti attivi** producono indici non pienamente confrontabili (una aveva la struttura, l'altra no). Vanno segnalate, non separate: separarle frammenterebbe troppo le serie.

---

## Transizioni di stato

**Elemento**: `importato` → `analizzabile` | `problematico` (con motivo). Un elemento problematico resta nell'elenco e non blocca l'analisi degli altri.

**Analisi**: `calcolata` → `salvata` → `con prosa` (opzionale) → `ricalcolata` (nuovo snapshot, l'originale resta). Non esiste transizione verso «cancellata» che riscriva un file: si cancella il report, punto.

**Profilo**: `predefinito` → `derivato` (a ogni modifica). Non esiste modifica in loco di un profilo già usato da un'analisi.
