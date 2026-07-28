# Spec — pipeline di assessment leggibilità/accessibilità BES-DSA

> Stato: **spec di metodologia**, non ancora uno script permanente nel repo.
> Origine: analisi comparativa 1A vs 1B su "Funzioni Urbane" (24 luglio 2026),
> report in [`assessment-funzioni-urbane-1A-1B.html`](../assessment-funzioni-urbane-1A-1B.html)
> (root del progetto). Questa spec formalizza quella pipeline perché sia
> rieseguibile su altre coppie di vault, e aggiunge un secondo indice di
> leggibilità (Flesch-Vacca) accanto al Gulpease già implementato.
> Non è una feature dell'app — è uno strumento di analisi interna, stesso
> registro di `/analyze-mm`.

---

## 1. Scopo

Dati **due vault MappAI generati dalla stessa scheda didattica** per due
classi/registri diversi, produrre un confronto quantitativo e qualitativo
di leggibilità e accessibilità, per capire **se e dove** la taratura di
classe (registro + note BES/DSA, vedi CLAUDE.md §"classe = contesto attivo
che tara l'AI") produce davvero un materiale più accessibile.

**Precondizione irrinunciabile — comparabilità controllata.** Il confronto
è interpretabile solo se l'unica variabile che cambia tra i due vault è la
taratura di classe. Prima di leggere i risultati come effetto del registro,
verificare che:

- la fonte/scheda didattica sia la stessa
- il modello AI (`index.yaml → generationUsage.usedModel/usedProvider`) sia lo stesso
- il preset dei materiali di stampa (`pipeline.json → config`) sia lo stesso
- non ci siano flag sperimentali diversi attivi tra le due generazioni (§10 di CLAUDE.md)

Se una di queste condizioni non è verificata, il confronto misura anche
altre variabili e va dichiarato come tale nel report finale.

---

## 2. Input

Per ciascun vault (`<VaultRoot>/<classe>/<NomeMappa>/`):

| File | Contenuto usato |
|---|---|
| `index.yaml` | `extractionMode`, `generationUsage` (token, modello, provider) |
| `Nodi/*.md` | un file per nodo: frontmatter YAML (`id,label,level,group,parent,x,y`) + corpo `# Label\n\n<desc>` |
| `links.json` | array `{source,target,rel,isCross}` |
| `pipeline.json` | config di generazione: `classId`, preset materiali (quiz/nodesheet/synthesis) |
| `Materiale Studio/*scelta_multipla*.json` / `*vero_o_falso*.json` / `*flashcard*.json` | `{items:[{q,correct,explanation,options}]}` |
| `Materiale Studio/Sintesi*.html` | prosa continua, contenuto in `div.bs-body` |

Fuori dal vault, condiviso: `<MappAI file>/Classi/classi.json` — contiene
`register` e `notes` per classe. È la fonte del "perché" (variabile causale
dichiarata), non va confuso con l'estrazione (l'effetto).

---

## 3. Estrazione

- **Nodo**: split frontmatter/corpo con `^---\n(.*?)\n---\n(.*)$` (`re.DOTALL`)
  → `yaml.safe_load` sul frontmatter; corpo = tutto meno la prima riga `# Label`.
- **Sintesi**: `BeautifulSoup`, selettore `.bs-body`. ⚠️ Estrarre PRIMA la
  struttura (conteggio `h3`/`h4`/`li`/`p`, blocchi con `→` = catene causali)
  e SOLO DOPO appiattire in testo con `get_text(' ', strip=True)` — se si
  appiattisce subito si perde l'informazione di formato (liste, titoli),
  che nel report §5 finding 3 è risultata un segnale reale.
- **Quiz**: per ogni `item`, concatenare `q + correct + explanation + options[]`.

---

## 4. Metriche — struttura

| Metrica | Definizione |
|---|---|
| Nodi totali / per livello | conteggio diretto da `Nodi/*.md`, raggruppato per `level` |
| Macro-aree (L1) | nodi con `level == 1` |
| Profondità massima | `max(level)` |
| Legami totali | `len(links.json)` |
| Verbi di relazione distinti | valori distinti di `rel` |
| % generico | quota di link con `rel == "include"` (il default gerarchico, vedi CLAUDE.md §12 linking words) |
| Legami "ricchi" | `totale − generico` |

**Coppie appaiate** (per il confronto qualitativo): intersezione delle
`label` normalizzate (`lower().strip()`) tra i due vault. **Esclusivi**:
differenza insiemistica in un verso o nell'altro. Questo passaggio è
**automatico**. La *selezione* di quali coppie/esclusivi commentare nel
report e la loro *interpretazione* (es. "questo è uno split atomico",
"questo è concretezza") resta lettura umana sull'output — non tutto è
automatizzabile, e va dichiarato come tale.

---

## 5. Metriche linguistiche — livello 1 (già implementate)

Tokenizzazione: parole con `[A-Za-zÀ-ÿ]+(?:'[A-Za-zÀ-ÿ]+)?`; frasi con
split su `[.!?]` seguito da spazio e maiuscola.

| Metrica | Come si calcola | Fonte/soglia |
|---|---|---|
| Parole per frase | parole totali / frasi totali | — |
| **Gulpease** | `89 + (300×frasi − 10×lettere) / parole` | GULP, Univ. La Sapienza, anni '80. Soglie: ≥80 facile per licenza elementare, ≥60 per licenza media, ≥40 per diploma superiore |
| Parole lunghe | quota parole ≥8 caratteri | soglia arbitraria dichiarata, non uno standard |
| Nominalizzazioni | parole che finiscono in `-zione/-zioni/-mento/-menti/-ità/-anza/-anze/-enza/-enze`, lunghezza >6 | proxy per suffisso, non lemmatizzazione/POS — falsi positivi possibili |
| Connettivi subordinanti/causali/coordinanti | conteggio per stringa (liste chiuse) su testo lowercase | non disambiguati dal contesto |
| Costruzioni passive | regex `\b(è\|sono\|era\|erano\|viene\|vengono\|venne\|furono\|fu)\s+\w+(ato\|ata\|ati\|ate\|uto\|uta\|uti\|ute\|ito\|ita\|iti\|ite)\b` | euristica, non parsing sintattico |
| Marcatori di esempio/analogia | liste chiuse (`"per esempio"`, `"come se"`, …) | — |

Tutte queste metriche si calcolano su **quattro livelli di testo** per
ciascun vault: nodi concatenati, sintesi in prosa continua, quiz a scelta
multipla, vero/falso, flashcard — separatamente, mai mescolati (livelli di
testo diversi hanno leggibilità strutturalmente diversa, vedi report §3).

---

## 6. Metriche linguistiche — livello 2 (nuovo): indice Flesch-Vacca

### 6.1 Formula

Adattamento italiano (Vacca e Franchina, 1972) della Flesch Reading Ease:

```
F = 206 − 0,65 × S − W
```

- **S** = sillabe per 100 parole (non sillabe per parola — è un conteggio
  normalizzato su un campione di 100 parole, come per la formula inglese
  originale che usa 84,6 come coefficiente su una base diversa)
- **W** = media di parole per frase (stesso valore già calcolato per
  Gulpease, riusabile)
- **206** e **0,65** = costanti di adattamento all'italiano (nella
  revisione Vacca 1986 diventano 217 e 1,3 — usare la versione 1972,
  citata come più affidabile dalla letteratura italiana consultata)

Soglie di interpretazione (stessa scala usata per Gulpease — comodo per
riusare la stessa visualizzazione nel report): **80–100** facile per
licenza elementare, **60–80** facile per licenza media, **40–60** facile
per diploma superiore, sotto 40 difficile anche per diplomati.

### 6.2 Il problema: contare le sillabe in italiano

A differenza di Gulpease (che conta lettere, operazione non ambigua),
Flesch-Vacca richiede sillabe — ed è esattamente per evitare questo
problema che Gulpease fu proposto negli anni '80 come alternativa più
affidabile per l'italiano. Implementare un sillabatore italiano corretto
(gestione di dittonghi/trittonghi vs iati, digrammi/trigrammi consonantici,
sillabazione delle consonanti doppie) è lavoro non banale.

**Euristica proposta per una prima implementazione** (dichiarata come
tale, non uno standard):

```
sillabe(parola) = numero di gruppi vocalici contigui nella parola
                  (gruppo = run massimale di [aeiouAEIOUàèéìíîòóù])
                  minimo 1 per parola
```

⚠️ **Limite noto**: questa euristica *sottoconta* le parole con iato
(vocali contigue che sono sillabe separate, non un dittongo). Esempio:
"poesia" → sillabazione vera po-e-si-a (4 sillabe), ma la euristica vede
due run vocalici contigui ("oe", "ia") → 2. L'errore è sistematico e va
nella direzione di un F più ALTO (testo che sembra più leggibile di
quanto sia). Da tenere presente nel confronto — è un limite dell'euristica,
non un artefatto del testo.

Raffinamento possibile (non implementato in questa spec, aperto per
un'iterazione successiva): sillabatore basato su pattern di sillabazione
italiana (es. pattern TeX `ithyph`) o libreria dedicata, se il progetto
vorrà investire in una S più accurata.

### 6.3 Perché aggiungerlo accanto al Gulpease, non al posto di

Le due formule pesano dimensioni diverse del testo (sillabe vs lettere,
coefficienti diversi). Se convergono sullo stesso vault, rafforzano la
lettura. Se divergono, è un segnale che l'artefatto della singola formula
(limite già dichiarato nel report, §8) è probabilmente in gioco — la
divergenza stessa è informazione, non va nascosta facendo la media.

### 6.4 Dove si applica

Stessi quattro livelli di testo del §5 (nodi concatenati, sintesi, quiz
MC/VF/FC) — stessa tabella comparativa, colonna aggiuntiva accanto a
Gulpease, mai in sostituzione.

---

## 7. Output

**JSON di estrazione** (uno per esecuzione, chiave = nome vault):

```json
{
  "<NomeVault>": {
    "n_nodes": 0,
    "nodes_by_level": {"0": 1, "1": 6},
    "n_links": 0,
    "n_distinct_rel": 0,
    "generic_include_pct": 0,
    "rel_vocabulary": {"include": 0},
    "aggregate_node_text_metrics": {
      "n_words": 0, "n_sentences": 0, "gulpease": 0, "flesch_vacca": 0,
      "long_words_ratio_pct": 0, "nominalizations_per_100w": 0,
      "subordinating_per_100w": 0, "causal_per_100w": 0, "passive_per_100w": 0
    },
    "sintesi_metrics": { "...": "stessi campi, + h3/li/p/catene_causali count" },
    "quiz_MC": { "...": "stessi campi + n_items" },
    "quiz_VF": {}, "quiz_FC": {}
  },
  "_matched_pairs": [{"label": "...", "1A": {"level":0,"desc":"...","words":0}, "1B": {} }],
  "_labels_only_in_<A>": [],
  "_labels_only_in_<B>": []
}
```

Il report HTML comparativo consuma questo JSON — non lo ricalcola.

---

## 8. Come rieseguire su un'altra coppia

1. Individuare due vault stesso-argomento-classi-diverse (nel vault attuale
   ce ne sono altre generate lo stesso giorno: Svizzera 2GM, Robotica,
   Storia della Carta — vedi idea #01 del report).
2. Verificare le precondizioni del §1 leggendo `index.yaml` + `pipeline.json`
   di entrambi.
3. Parametrizzare i due path di vault nello script.
4. Rigenerare JSON + report.

---

## 9. Limiti del metodo (validi per entrambi gli indici)

- **Campione**: un confronto per coppia di vault. Pattern strutturali
  osservati su una coppia non sono generalizzabili senza ripetizione (§8).
- **Le metriche lessicali sono proxy euristici**, non analisi linguistica
  vera — vedi le note per-metrica nel §5 e il limite sillabe nel §6.2.
- **Il campionamento Vacca non è rispettato alla lettera**: il metodo
  originale prevede la media di più campioni da 100 parole; questa
  implementazione calcola S/W sul testo intero come campione unico
  (approssimazione dichiarata).
- **Nessuna delle due formule è tarata su un singolo studente DSA** — sono
  medie di popolazione scolastica italiana generica.
- **Il layer tipografico (font, interlinea, spaziatura) non rientra in
  questa pipeline** — è testo puro, non resa visiva. Se serve, è un
  livello di analisi separato (idea #03 del report).

---

## 10. Stato attuale e decisioni aperte

- Lo script che ha prodotto il report del 24/07/2026 (`analyze_access.py`)
  ha girato nella cartella scratchpad della sessione — non è nel repo,
  non è permanente.
- **Aperto**: se e dove promuoverlo a script stabile nel repo (proposta:
  `tools/content-assessment/` accanto a questa spec) — decisione non
  ancora presa, va con l'utente prima di creare struttura/branch.
- **Aperto**: implementare S (sillabe/100 parole) con l'euristica del §6.2
  è l'unico pezzo di codice nuovo richiesto per aggiungere Flesch-Vacca —
  tutto il resto (W, tokenizzazione, soglie) è già disponibile dal livello 1.

---

## Fonti (formula Flesch-Vacca)

- [Formula di Flesch — Wikipedia (IT)](https://it.wikipedia.org/wiki/Formula_di_Flesch)
- [Flesch Vacca, Gulpease e la leggibilità — Scrivereperglialtri](https://scrivereperglialtri.com/2024/03/21/fleschvacca-gulpease-leggibilita/)
