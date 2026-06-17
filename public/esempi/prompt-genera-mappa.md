# Prompt per generare una mappa mentale MappAI

Usa questo prompt (con il testo sorgente allegato) per chiedere a Claude di generare
una mappa da importare in MappAI e confrontare con le mappe di Apertus.

---

## PROMPT DA COPIARE

```
Genera una mappa mentale in formato JSON importabile in MappAI.

## TESTO SORGENTE
[INCOLLA QUI IL TESTO DA ANALIZZARE]

## FORMATO JSON RICHIESTO

Segui ESATTAMENTE questa struttura (è il formato nativo di MappAI):

{
  "rootNodeLabel": "Titolo principale",
  "extractionMode": "mindmap",
  "nodes": [ ... ],
  "links": [ ... ]
}

### Struttura di ogni nodo

{
  "id":          "stringa univoca senza spazi (es. L1_economia, L2_inflazione)",
  "label":       "2-4 parole, sostantivo, NO date, NO liste, NO verbi all'infinito",
  "content":     "Spiegazione completa (2-4 frasi) del concetto, con dettagli dal testo",
  "desc":        "Versione breve di content (1 frase)",
  "level":       0 | 1 | 2 | 3 | 4,
  "group":       intero che identifica il ramo L1 (tutti i nodi di un ramo hanno lo stesso group),
  "chunks":      [],
  "studyStatus": "none"
}

Livelli:
- level 0 → radice (ROOT), uno solo, group: 0
- level 1 → macro-aree principali (4-6), ognuna con group univoco (1, 2, 3 ...)
- level 2 → concetti principali sotto ogni L1 (3-4 per ramo)
- level 3 → dettagli significativi (2-3 per nodo L2 importante)
- level 4 → solo se il testo lo giustifica (specificità, esempi chiave)

### Struttura di ogni link

{ "source": "id_nodo_padre", "target": "id_nodo_figlio", "rel": "include" }

Per i link gerarchici usa sempre "rel": "include".

Per i cross-link (connessioni TRA rami diversi) aggiungi "isCross": true
e usa un verbo semantico preciso come:
  "causa", "produce", "permette", "regola", "è fissata da", "attiva",
  "influenza", "si oppone a", "precede", "richiede", "fa parte di",
  "porta a", "determina", "deriva da", "è condizione di"

### Requisiti qualità

- Ogni ramo L1 deve avere ALMENO 3 nodi L2
- Almeno 2 nodi L2 devono avere figli L3
- I cross-link devono essere almeno 5, tra rami DIVERSI
- I label devono essere NOMINALIZZAZIONI (no "Capire come...", sì "Meccanismi di...")
- Nei label: NO nomi propri di persona, NO anni, NO virgole
- Il campo content deve citare dati concreti del testo sorgente
- I cross-link devono essere semanticamente motivati, non decorativi

### Esempio di struttura (NON copiare il contenuto, solo la forma)

{
  "rootNodeLabel": "La Fotosintesi",
  "extractionMode": "mindmap",
  "nodes": [
    { "id": "ROOT",             "label": "La Fotosintesi",    "content": "Processo con cui piante...", "desc": "Conversione luce→glucosio.", "level": 0, "group": 0, "chunks": [], "studyStatus": "none" },
    { "id": "L1_ingredienti",   "label": "Ingredienti Necessari", "content": "Le molecole...",        "desc": "Sostanze che la pianta preleva.", "level": 1, "group": 1, "chunks": [], "studyStatus": "none" },
    { "id": "L1_processo",      "label": "Fasi del Processo", "content": "Le due fasi...",            "desc": "Reazioni che trasformano gli ingredienti.", "level": 1, "group": 2, "chunks": [], "studyStatus": "none" },
    { "id": "L2_co2",           "label": "Anidride Carbonica","content": "La CO₂ atmosferica...",     "desc": "Gas catturato dagli stomi.", "level": 2, "group": 1, "chunks": [], "studyStatus": "none" },
    { "id": "L2_fase_luminosa", "label": "Fase Luminosa",    "content": "Avviene nei tilacoidi...",   "desc": "Fotolisi dell'acqua, produce ATP.", "level": 2, "group": 2, "chunks": [], "studyStatus": "none" },
    { "id": "L3_clorofilla",    "label": "Clorofilla",        "content": "Pigmento verde...",          "desc": "Cattura la luce, trasferisce energia.", "level": 3, "group": 2, "chunks": [], "studyStatus": "none" }
  ],
  "links": [
    { "source": "ROOT",          "target": "L1_ingredienti",  "rel": "include" },
    { "source": "ROOT",          "target": "L1_processo",     "rel": "include" },
    { "source": "L1_ingredienti","target": "L2_co2",          "rel": "include" },
    { "source": "L1_processo",   "target": "L2_fase_luminosa","rel": "include" },
    { "source": "L2_fase_luminosa","target": "L3_clorofilla", "rel": "include" },
    { "source": "L2_co2",        "target": "L2_fase_luminosa","rel": "è fissata in",  "isCross": true },
    { "source": "L2_luce",       "target": "L2_fase_luminosa","rel": "attiva",         "isCross": true }
  ]
}

Rispondi SOLO con il JSON, nessun altro testo prima o dopo.
```

---

## COME USARLO

1. Copia il prompt sopra
2. Sostituisci `[INCOLLA QUI IL TESTO DA ANALIZZARE]` con il tuo testo sorgente
3. Invia a Claude Sonnet o Opus
4. Salva la risposta come file `.json`
5. In MappAI: menu ⋮ → **Importa JSON** → seleziona il file

---

## METRICHE DA CONFRONTARE CON APERTUS

Dopo l'import, apri la console del browser e digita:

```js
MappAIStructureAnalyzer.analyzeCurrentMap()
```

Oppure per il report completo:

```js
MappAIMetrics.report()
```

Annota per ogni mappa:
- `stats.nodeCount` — numero totale nodi
- `stats.density` — link per nodo (obiettivo: > 1.5)
- `stats.topology` — "tree-like" o "networked"
- `suggestions` — lista problemi strutturali
- Distribuzione livelli (quanti L2, L3, L4?)
- Numero cross-link (`isCross: true`)
- Varietà dei `rel` usati (quanti tipi diversi?)
