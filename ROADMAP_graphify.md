# ROADMAP — Modalità Studente vs Modalità OPI

> Aggiornato: 2026-06-01
> Branch attivo Piano 1: `feat/structural-suggestions`
> Branch futuro Piano 2: `feat/auto-restructure` (da creare)

---

## FILOSOFIA: due modalità complementari

MappAI offrirà due modalità di lavoro selezionabili nell'header dello Step 4:

### 🎓 Modalità Studente (Piano 1)
**Per chi**: studenti BES/DSA, 4a Media, Liceo che usano MappAI per studiare attivamente.
**Cosa fa**: MappAI genera la mappa e poi mostra suggerimenti strutturali ("Il
Piano Marshall sembra essere un concetto-cerniera, valuta spostarlo a L2") che
lo studente **accetta o rifiuta manualmente**. Il lavoro metacognitivo di
ristrutturazione resta dell'allievo — questo è il valore pedagogico.

### 👨‍🏫 Modalità OPI / Docente (Piano 2)
**Per chi**: Operatori per l'Inclusione, docenti che preparano materiali in
anticipo per più studenti.
**Cosa fa**: MappAI esegue automaticamente la ristrutturazione two-pass
(estrazione → clustering Louvain → naming AI dei cluster). Output: mappa
già ottimizzata, pronta per essere consegnata o adattata. Risparmia ore di
preparazione.

---

## PIANO 1 — Pannello suggerimenti strutturali (branch `feat/structural-suggestions`)

### Obiettivo
Dopo la generazione della mappa, un pannello laterale mostra suggerimenti
basati su analisi grafica deterministica (zero AI calls aggiuntive).

### Stack tecnologico
- **graphology** + **graphology-metrics** (~50KB minified, ESM via CDN)
- Alternativa: implementare a mano i 3-4 algoritmi necessari in vanilla JS
  (degree centrality, betweenness, group misplacement detection)

### Task

#### 1.1 Modulo di analisi strutturale (`mappai-structure-analyzer.js`)
- [ ] `analyzeGodNodes(nodes, links)` — top-N per degree centrality
- [ ] `detectMisplacedNodes(nodes, links)` — un nodo è "mal classificato" se
  ha più link verso un'altra macro-area di quella corrente
- [ ] `detectUnderutilizedClusters(nodes, links)` — macro-aree con <3 nodi
  o >40% dei nodi totali
- [ ] `detectLeafIsolation(nodes, links)` — foglie senza cross-link che
  potrebbero beneficiare di collegamenti

#### 1.2 UI pannello suggerimenti
- [ ] Componente `#structural-suggestions-panel` collassabile sul lato destro
  del grafo, sotto il pannello fonti
- [ ] Ogni suggerimento è una card con:
  - Icona tipo (god node / misplaced / isolated / unbalanced)
  - Descrizione in linguaggio naturale ("Piano Marshall è connesso a 6 nodi
    ma è a L3. Sembra un concetto-cerniera.")
  - Bottoni: "Applica" / "Ignora" / "Spiega di più"
- [ ] Persistenza: i suggerimenti applicati/ignorati si salvano nel vault

#### 1.3 Azioni applicabili
- [ ] "Sposta nodo a L2" — usa `appState.db.nodes` mutation + re-render D3
- [ ] "Crea cross-link tra X e Y" — aggiunge link a `appState.db.links`
- [ ] "Unisci nodi duplicati" — merge con preservazione delle fonti
- [ ] "Sposta nodo in macro-area Y" — cambia `group` + re-render

#### 1.4 Toggle modalità Studente/OPI
- [ ] Bottone nell'header con due stati visibili
- [ ] In modalità Studente: pannello suggerimenti attivo, Pass 2 disattivato
- [ ] In modalità OPI: pannello disattivato (perché già applicato automaticamente)
- [ ] Persistenza scelta in `localStorage.mappai_mode`

#### 1.5 Test e validazione pedagogica
- [ ] Test su 3 mappe esistenti (GF GEMMA STORIA, scienze, letteratura)
- [ ] Verifica che i suggerimenti corrispondano alle anomalie già rilevate da
  /analyze-mm + graphify
- [ ] Validazione UX con 1-2 studenti BES/DSA

---

## PIANO 2 — Two-pass generation con auto-clustering (branch `feat/auto-restructure`)

### Obiettivo
Cambiare l'architettura della generazione MM: invece di chiedere all'AI di fare
"estrazione + organizzazione gerarchica" in un colpo solo, dividere in due pass
con clustering algoritmico nel mezzo.

### Architettura proposta

Pass 1: AI estrae entità + relazioni tipizzate (NO gerarchia)
↓
Algoritmo Louvain: identifica community naturali nel grafo
↓
Pass 2: AI dà un nome storiografico a ogni community → diventano gli L1
↓
Algoritmo centralità: il nodo più centrale di ogni community → diventa il rappresentante L2
↓
Resto della gerarchia: costruito da centralità decrescente all'interno della community

### Roadmap dettagliata
#### Fase 2.1 — Prototipo di estrazione tipizzata (1-2 settimane)
- [ ] Nuovo template `EXTRACT_ENTITIES_RELATIONS_IT` che chiede solo nodi + link
  tipizzati (causa, controlla, si_contrappone_a, fa_parte_di, precede, segue),
  zero menzione di gerarchia o livelli
- [ ] Schema JSON di output piatto: `{ entities: [...], relations: [...] }`
- [ ] Test confronto: stesso documento estratto col vecchio prompt vs nuovo
  (qualità + numero di relazioni tipizzate)
#### Fase 2.2 — Integrazione algoritmo Louvain in JS (3-5 giorni)
- [ ] Aggiungere `graphology` + `graphology-communities-louvain` al progetto
  (ESM via CDN, no bundler richiesto)
- [ ] Modulo `mappai-graph-algorithms.js`:
  - `runLouvain(entities, relations)` → ritorna `{ nodeId: communityId }`
  - `computeCentrality(entities, relations)` → ritorna degree + betweenness
  - `findCommunityRepresentative(community, centrality)` → top per centralità
- [ ] Test su grafi sintetici noti (validazione: clustering Louvain è ben
  testato in graphology, ma serve verificare le scelte di hyperparameter)
#### Fase 2.3 — Pass 2: naming AI dei cluster (1 settimana)
- [ ] Template `NAME_CLUSTERS_DISCIPLINE_IT` che riceve:
  - Lista di nodi per cluster (label + breve content)
  - Il disciplinare attivo (es. Storia)
  - Profilo allievo
- [ ] Output: un nome storiografico per ogni cluster (es. "Le due superpotenze",
  "Il controllo dei satelliti")
- [ ] Cap a 4-6 cluster (i Louvain con resolution=1.0 in genere ne danno 5-7
  su corpus tipo MappAI, ma serve tuning)
#### Fase 2.4 — Costruzione gerarchia da centralità (1 settimana)
- [ ] Funzione `buildHierarchyFromClusters(clusters, names, centrality)`:
  - L1 = nome cluster (output Pass 2)
  - L2 = top-3 nodi per centralità all'interno del cluster
  - L3-L5 = restanti nodi distribuiti per centralità decrescente
- [ ] Link cross-ramo: tutte le relazioni inter-cluster del grafo estratto
  diventano cross-link nella MM finale
- [ ] Gestione orfani: nodi non assegnati a nessun cluster (rari con Louvain)
#### Fase 2.5 — Integrazione modalità OPI nell'UI (3-5 giorni)
- [ ] Toggle Studente/OPI nell'header (vedi Piano 1.4)
- [ ] In modalità OPI, `startGeneration()` chiama la pipeline two-pass invece
  della singola `extractMindMapIterative`
- [ ] Indicatore "Modalità OPI: ristrutturazione automatica attiva" nella UI
- [ ] Tempo di generazione: probabilmente 1.5-2x quello attuale (2 chiamate AI
  invece di 1+N, ma con clustering deterministico nel mezzo)
#### Fase 2.6 — Validazione e tuning (1-2 settimane)
- [ ] Confronto sistematico: stessi 6 documenti (GF, scienze, letteratura,
  matematica, geografia, filosofia) generati in modalità Studente e OPI
- [ ] Analisi via /analyze-mm + graphify: la modalità OPI dovrebbe mostrare
  community detection allineata al grafo graphify ground truth
- [ ] Tuning resolution Louvain in base ai risultati
- [ ] Validazione con docente OPI reale (uno dei contatti svizzeri già acquisiti)
---
## STIMA TEMPORALE COMPLESSIVA
| Fase | Tempo stimato | Branch |
|---|---|---|
| Piano 1 (modalità Studente) | 1-2 settimane | `feat/structural-suggestions` |
| Piano 2.1 — Estrazione tipizzata | 1-2 settimane | `feat/auto-restructure` |
| Piano 2.2 — Louvain in JS | 3-5 giorni | `feat/auto-restructure` |
| Piano 2.3 — Naming AI cluster | 1 settimana | `feat/auto-restructure` |
| Piano 2.4 — Costruzione gerarchia | 1 settimana | `feat/auto-restructure` |
| Piano 2.5 — Toggle UI OPI | 3-5 giorni | `feat/auto-restructure` |
| Piano 2.6 — Validazione | 1-2 settimane | `feat/auto-restructure` |
| **TOTALE Piano 2** | **5-8 settimane** | |
---
## INTERAZIONE CON ALTRE PRIORITÀ DEL TODO
- **Profili disciplinari** (oggi): il Pass 2 della modalità OPI usa lo stesso
  prompt disciplinare già implementato (`DISCIPLINE_STORIA_IT`, etc.). Le
  modifiche al template impattano entrambe le modalità.
- **Template Liceo per Mistral Small** (TODO #2): da implementare in parallelo,
  ortogonale a queste modalità.
- **Chunking map-reduce per Infomaniak** (TODO #3): rilevante per Piano 2
  perché il Pass 1 (estrazione) può essere chunked indipendentemente.
- **Anomalia token KG GEMMA + lenti** (TODO #9): da investigare prima di
  iniziare il Piano 2 perché i due-pass useranno gli stessi pattern di payload.
