# Memory Dungeon — Design del gameplay

> Documento di design per il gioco di studio "Memory Dungeon" di MappAI.
> Autore: Giacomo Meschini — giacomo@insegnai.ch
> Stato: design del loop core **completo** (sblocco · cattura · door keeper · boss). Mancano: mapping KG, tuning numerico fine, piano d'implementazione.
> Ultimo aggiornamento: 25 giugno 2026.

---

## 1. Visione e vincolo fondamentale

Il grafo (MindMap o Knowledge Graph) generato da MappAI **non** viene mostrato allo studente all'inizio. Lo studente prima **esplora e si impadronisce dei contenuti** giocando; il grafo completo, la heatmap di studio e gli strumenti classici di MappAI compaiono **solo alla fine**. Il grafo è uno strumento di studio, non il fine.

Il gioco trasforma il materiale (nodi del grafo + citazioni verbatim dalla fonte del docente) in un dungeon roguelike esplorabile. Ogni meccanica è progettata su due assi non negoziabili:

- **Anti-frustrazione**: nessun muro insormontabile, difficoltà sempre nella zona ottimale, riprova garantita.
- **Inclusività BES/DSA**: percorsi alternativi per dislessia, discalculia, ADHD, disgrafia, ansia da prestazione.

Target: studenti BES/DSA, con uso anche da parte di docenti e OPI (Operatori per l'Inclusione).

---

## 2. Il loop di gioco

```
scendi un piano (= categoria di nodi)
   └─ esplora le stanze (nebbia / fog-of-war)
        └─ trova i device (computer / server / droidi)
             └─ SBLOCCA la memoria del device  → allena memoria di lavoro / calcolo
                  └─ estrai la MEMORY UNIT
                       └─ CATTURA (3 modi, profondità crescente) → codifica nel diario
   quando vuoi → DOOR KEEPER → rispondi per scendere → richiamo + fluency
ultimo piano → BOSS → domande di transfer → badge
   └─ la heatmap di studio si colora
        └─ REVEAL: mappa intera + strumenti classici MappAI + diario
```

**Pipeline cognitiva**: Memoria di lavoro → Conoscenza (encoding) → Fluency (richiamo) → Transfer (integrazione).

---

## 3. Struttura: piani, stanze, device, memory unit

- **Piano = livello di profondità del grafo** (non le community). Piano N = livello N-1:
  - Piano 1 = root (L0) — quadro d'insieme
  - Piano 2 = L1 (macro-aree)
  - Piano 3 = L2
  - Piano 4 = L3 … fino alla profondità massima
  - Senso didattico: dal generale al particolare (top-down).
  - KG (no gerarchia): mapping piani **da definire** (probabile: tier di centralità/degree).
- **Stanze**: ogni piano ne ha diverse, da esplorare nella nebbia.
- **Device**: dentro le stanze (computer, macchine server, droidi da catturare). Sono i contenitori delle memory unit.
- **Memory unit**: il bottino. Contenuto da:
  - JSON del grafo: `label` + `desc` (paragrafo di studio ricco), e/o
  - **citazioni verbatim** dalla fonte del docente: `appState.db.sourcesDict[nodeId]` (`[{title, source, text}]`).

---

## 4. Sottosistema — Sblocco device (funzioni esecutive)

Per accedere alla memoria di un device si supera **sempre** una sfida.

- **Scelta della sfida**: 1° tentativo modalità **casuale** (sequenza di simboli *oppure* calcolo). Se fallisce, il **2° tentativo cambia modalità** (l'altra) → seconda chance su un canale cognitivo diverso.
- **Sequenza = simboli/forme colorate** (NON lettere): 6 forme (● ▲ ■ ◆ ★ ⬢) × 4 colori. Distinguibili **per forma**, non solo per colore. Mostra → sparisce → ridigiti nell'ordine. Scala adattiva:

  | Lv | span | esposizione/simbolo |
  |----|------|---------------------|
  | 1 | 3 | 0.9 s |
  | 2 | 4 | 0.9 s |
  | 3 | 4 | 0.7 s |
  | 4 | 5 | 0.7 s |
  | 5 | 5 | 0.6 s |
  | 6 | 6 | 0.6 s |
  | 7 | 7 | 0.5 s |

- **Calcolo = solo addizione/sottrazione, timer generoso**:

  | Lv | forma | timer |
  |----|-------|-------|
  | 1 | a±b, ≤9 | 25 s |
  | 2 | a±b, ≤20 | 22 s |
  | 3 | a±b±c, ≤20 | 22 s |
  | 4 | a±b, ≤50 | 20 s |
  | 5 | a±b±c, ≤50 | 20 s |
  | 6 | a±b, ≤100 | 18 s |

  Ai livelli bassi il timeout è **morbido** (si ritenta, nessuna penalità dura).

- **Difficoltà adattiva**: due tracce separate `seqLv` / `calcLv` (start 1; +1 dopo 2 successi consecutivi; −1 dopo un fallimento; clamp 1–7). Persistite in `localStorage 'mappai_dungeon_skill' = {seq, calc}`.
- **Doppio fallimento** (entrambe le modalità): il device va in **cooldown** (si ritenta dopo averne sbloccato un altro) e quella modalità scende di 1 livello. Nessuna penalità dura.
- **Effetto**: lo sblocco alimenta un **misuratore di memoria di lavoro (WM)** dedicato (0–100, EWMA di successo + velocità + livello raggiunto), **separato** dalla conoscenza del contenuto.

---

## 5. Sottosistema — Cattura (codifica + diario markdown)

Device sbloccato → memory unit estratta → la si **cattura** in uno dei 3 modi (profondità di codifica crescente). Tutte confluiscono nel **diario**.

- **Assegnazione del modo = misto + upgrade**: il sistema **propone** il modo dal ruolo strutturale del nodo (keystone/bridge → a mano; hub → TTS; foglia → diario 1-clic; riuso di `mappai-structure-analyzer` / `mappai-node-styling`). Il player può **salire** di profondità (diario → TTS → a mano), **mai scendere**.
- **I 3 modi**:
  1. **Diario (1-clic)** — collezione, encoding basso.
  2. **TTS → trascrivi** — ascolti il contenuto (`speechSynthesis`, già in `app.js`) e lo scrivi: dual-coding uditivo→scritto, attenzione, ortografia.
  3. **A mano (schermata doppia)** — testo della memory unit a sinistra, **editor markdown** a destra. "A mano" = digiti tu da tastiera. Il player **sceglie copia verbatim o riassunto con parole proprie** (il riassunto attiva l'effetto generativo, massima ritenzione).
- **Validazione inclusiva a soglia bassa**: riassunto → AI valuta la copertura concettuale con soglia morbida; verbatim/TTS → fedeltà con tolleranza ai refusi. Conta l'atto di scrivere, non la perfezione: niente blocchi.
- **Diario (artefatto markdown)**:
  - **Tab/capitoli per macro-area (L1)**.
  - Ogni unit catturata = sezione markdown (`## Concetto` + testo del player + citazione fonte + meta: modo, data, badge).
  - **Notazione markdown deliberata**: l'editor usa markdown con anteprima → lo studente **impara la notazione** mentre studia (doppio obiettivo). Sinergia con il Vault di MappAI, già markdown/Obsidian.
  - **Richiamabile al reveal finale**, accanto al grafo D3.
  - **Persistenza**: locale (`localStorage`) durante il gioco → **export nel Vault** come file `.md` per macro-area (Obsidian-compatibile) al reveal.
- **Effetto**: cattura → diario + telemetria completa + conoscenza (knowledge PT), con peso proporzionale alla profondità del modo.

---

## 6. Sottosistema — Door keeper (richiamo + fluency)

Custode tra i piani: **quando vuole**, il player ci va, risponde, e se supera scende. È dove si guadagna la **fluency di contenuto**.

- **Contenuti**: ~70% memory unit catturate del piano corrente + ~30% **richiamo distribuito** (spaced retrieval) dai piani precedenti (ratio tarabile). Selezione del richiamo = nodi con padronanza bassa o "stale" (riuso del decay di `mappai-study-path.js`, `staleDays = 7`).
- **Soglia**: si **passa** se l'accuracy ≥ soglia (default 70%, tarabile; nota: `ACC_THR = 0.8` è la soglia *mastery* PT, il gate può essere più basso). La **fluency (rate) non blocca ma assegna un grado**: bronzo = passa; argento = rate ≥ `FLUENCY_AIM`/2 (4/min); oro = rate ≥ `FLUENCY_AIM` (8/min).
- **Fallimento**: si torna a esplorare/catturare/ripassare; il door keeper **evidenzia le aree deboli**. Si ritenta liberamente, mai bloccati.
- **Tipi di domanda = mix configurabile dal docente**. Schema `localStorage 'mappai_dungeon_doorkeeper' = { mix:{tf,mc,open}, accThr, recallRatio, nQuestions }`. **Default non configurato** = scala crescente vero/falso → multiple choice → risposta aperta.
- **Meccanica**: N domande default 5–7, adattivo (meno se forte). Generazione riusando `mappai-active-study` (modi 1–7 → tipi); risposta aperta valutata da AI (`coverage` 0–100). Effetto → telemetria + heatmap finale.

---

## 7. Sottosistema — Boss (transfer) + heatmap

Climax dell'ultimo piano. È la prova di **transfer/integrazione** (cima della pipeline).

- **Domande**: UNA aperta **integrativa per macro-area** (collega l'area al resto), che fonde i tre registri — **sintesi** tra concetti + **spiegazione** + **applicazione a casi nuovi**. N domande = numero di macro-aree. Valutazione AI (`coverage` 0–100) per risposta → punteggio per area.
- **Esito = soglia morbida + badge per tentativo**:
  - vinci (media ≥ soglia, default 60%, tarabile) al **1° tentativo → ORO**, al **2° → ARGENTO**, al **3° → BRONZO**;
  - sotto soglia → si ripassa e si ritenta (il boss indica le aree deboli);
  - dopo il 3° tentativo (o a scelta) → **reveal comunque** (soglia morbida = accesso garantito agli strumenti), senza badge.
  - **I badge sono salvati nel diario** e mostrati all'apertura e **in stampa**. La telemetria logga i tentativi.
- **Heatmap finale**: combina i 3 segnali **per area** via `mappai-mastery-view`: cattura (knowledge) + door keeper (fluency) + boss (transfer). Peso default proposto: knowledge 30% / fluency 30% / **transfer 40%** (tarabile).

---

## 8. Reveal e ritorno agli strumenti classici

Dopo il boss lo studente vede **la mappa intera** (grafo D3) colorata dalla heatmap di studio, e può usare **tutti gli strumenti classici di MappAI** (lenti, timeline, quiz, dossier, tutor…). Il **diario** resta richiamabile, completo di badge, ed esportabile nel Vault.

---

## 9. Inclusività e anti-frustrazione (principi trasversali)

Ogni scelta di design serve a non escludere e a non frustrare:

| Scelta di design | A chi/che cosa serve |
|------------------|----------------------|
| Simboli/forme colorate invece di lettere nello sblocco | dislessia (evita confusione b/d/p, g/q) |
| Sblocco a calcolo solo +/− con timer generoso | discalculia, ansia da prestazione |
| Fallimento → cambio modalità (sequenza ↔ calcolo) | chi è debole in una skill trova una via alternativa |
| Difficoltà adattiva su tutte le sfide | mantiene il *flow* (né noia né frustrazione) |
| Doppio fail → cooldown + −1 livello, mai penalità dura | evita spirali di fallimento |
| Validazione cattura inclusiva a soglia bassa | disgrafia, lentezza; premia l'atto di scrivere |
| Player può salire di profondità ma non è punito | autonomia + senso di competenza |
| Fluency come **grado** (bronzo/argento/oro), non come blocco | la lentezza non esclude, la velocità premia |
| Door keeper e boss: ritenti sempre, indicano le aree deboli | trasforma l'errore in indicazione di studio |
| Boss a soglia morbida con reveal garantito | nessuno resta chiuso fuori dagli strumenti di studio |
| `prefers-reduced-motion` (animazioni/rotazioni) | ADHD, sensibilità vestibolare |
| Etichette grandi e leggibili, alto contrasto | ipovisione |
| Privacy-first sui dati (locale, export manuale) | tutela del minore (GDPR, contesto svizzero) |

Principio guida: **l'errore non punisce, informa**. Ogni "fallimento" abbassa la difficoltà o indica cosa ripassare.

---

## 10. Cosa allena il gioco (matrice attività → competenza)

Il design è pensato perché **ogni attività alleni qualcosa**, oltre al contenuto disciplinare.

### Funzioni esecutive
| Attività | Funzione esecutiva allenata |
|----------|-----------------------------|
| Sequenza di simboli (span crescente) | **memoria di lavoro** visuo-spaziale |
| Calcolo mentale a timer | memoria di lavoro + fluency aritmetica |
| Fallimento → cambio modalità | **flessibilità cognitiva** (task-switching) |
| Inibire risposte impulsive sotto timer | **inibizione / controllo degli impulsi** |
| Decidere quando andare dal door keeper, quali stanze esplorare, quale modo di cattura | **pianificazione** e definizione di obiettivi |
| Heatmap finale + aree deboli evidenziate | **automonitoraggio / metacognizione** |

### Competenze di studio e contenuto
| Attività | Cosa allena |
|----------|-------------|
| Cattura "diario 1-clic" | selezione e organizzazione delle informazioni |
| Cattura "TTS → trascrivi" | elaborazione uditiva, dual-coding, ortografia, attenzione sostenuta |
| Cattura "a mano: copia" | trascrizione accurata, attenzione ai dettagli |
| Cattura "a mano: riassunto" | **effetto generativo**, sintesi, parafrasi, comprensione profonda |
| Editor markdown + anteprima | **notazione markdown** (digital literacy), strutturazione del testo |
| Diario a tab per macro-area | categorizzazione e organizzazione gerarchica della conoscenza |
| Door keeper — vero/falso | riconoscimento |
| Door keeper — multiple choice | discriminazione tra alternative |
| Door keeper — risposta aperta | richiamo attivo e produzione |
| Door keeper — richiamo distribuito | **ritenzione a lungo termine** (spaced retrieval) |
| Door keeper — grado di fluency (rate) | **automatizzazione / fluency** del recupero |
| Boss — domande integrative cross-area | **transfer**, pensiero relazionale, **collegamenti tra aree** |
| Boss — applicazione a casi nuovi | problem solving, transfer lontano |
| Esplorazione nella nebbia | memoria spaziale, orientamento |
| Badge e progressione adattiva | motivazione, perseveranza, autoefficacia |

---

## 11. Modalità di input e arricchimento del diario

Il diario è un **artefatto multimodale**: più canali di input = codifica più ricca e diario più personale.

**Attuali (definite):**
- Digitazione da tastiera (riscrittura/riassunto).
- Trascrizione da TTS (ascolto → scrittura).
- Copia verbatim assistita (schermata doppia).
- Markdown (titoli, liste, enfasi) come notazione del diario.

**Candidate future (da valutare, coerenti con il design):**
- **Voce → testo** (speech-to-text) per dettare un riassunto: utile per disgrafia.
- **Collegamenti `[[wikilink]]`** in stile Obsidian: lo studente crea link tra concetti del diario → allena i collegamenti cross-area e prepara la lettura del grafo finale.
- **Evidenziazione / tag** dei termini chiave nella citazione verbatim.
- **Aggiunta di esempi propri** o domande personali a margine (elaborazione).
- **Mini-schizzo / immagine** allegata a una memory unit (dual-coding visivo; percorso relativo nel Vault, mai assoluto).
- **Cloze auto-generato** dal proprio riassunto (riuso `mappai-cloze.js`) come auto-verifica.

Ogni modalità aggiuntiva va sempre offerta come **opzione**, mai imposta, per non penalizzare profili specifici.

---

## 12. Telemetria, privacy ed etica

- **Namespace** previsto: `MappAIGameTelemetry`. Event log append-only, con campi ricchi per ogni azione:
  - *unlock*: nodeId, deviceType, modalità (seq/calc), livello, successo, tentativi, durata, cambio modalità, timestamp.
  - *capture*: nodeId, modo, sottomodo (copia/riassunto), caratteri, durata, score validazione, accettato, piano, macroArea, timestamp.
  - *door keeper / boss*: punteggi, tentativi, grado/badge, aree deboli.
  - *derivati per nodo*: knowledge PT, profondità di cattura, tempo-su-concetto.
- **Aggregabile** per area / tempo / profondità / progressione WM / pattern di errore → futura **meta-analisi per il docente** e **neurofeedback** allo studente.
- **Privacy-first**: storage **locale**, **export manuale** (JSON) su richiesta. Nessun backend, nessun invio automatico. Dati comportamentali di minori → tutela GDPR e contesto svizzero.

---

## 13. Riuso del codice MappAI esistente

| Elemento del gioco | File / sorgente |
|--------------------|-----------------|
| Piani per livello | `node.level` in `appState.db.nodes` |
| Contenuto memory unit | `desc` + `appState.db.sourcesDict[id]` |
| TTS (cattura modo b) | `speechSynthesis` in `app.js` |
| Domande gate/boss | `mappai-active-study.js` (modi 1–7: vero/falso, multiple, aperta) |
| Scoring risposta aperta | `coverage` 0–100 (`mappai-active-study.js`) |
| Soglie knowledge/fluency | `mappai-mastery.js` (accuracy, rate, `FLUENCY_AIM = 8`, `ACC_THR = 0.8`) |
| Decay per spaced recall | `mappai-study-path.js` (`staleDays = 7`) |
| Ruolo strutturale (assegnazione cattura) | `mappai-structure-analyzer.js` / `mappai-node-styling.js` |
| Heatmap finale | `mappai-mastery-view.js` |
| Cloze auto-verifica (futuro) | `mappai-cloze.js` |
| Reveal + strumenti di studio | grafo D3 + UI esistente |

> Nota: `colorScale` e `getNodeColor` **non** sono esposti su `window` (sono `const`/funzioni interne all'IIFE di `app.js`). La logica colore va replicata nel modulo del gioco (come fatto nella v1 di `mappai-games.js`).

---

## 14. Aperto / da definire

- **Mapping KG**: come ricavare i piani da un Knowledge Graph senza gerarchia (probabile: tier di centralità/degree).
- **Tuning numerico fine**: soglie del gate (default 70%) e del boss (default 60%), pesi della heatmap (30/30/40), ratio del richiamo (70/30), curve adattive.
- **Telemetria**: lista esatta dei campi e degli aggregati per il neurofeedback al docente.
- **Piano d'implementazione**: build fresca in-app (riscrivere `mappai-games.js`) **oppure** adattare l'engine `tapio/7drl-2015` con grafiche da `opengameart.org/users/min`. Ispezionare repo e asset prima di decidere.
- **UI di configurazione docente** (mix domande door keeper, soglie): riuso del pattern admin esistente.

---

## 15. Glossario

- **Memory unit**: unità di contenuto (da grafo o citazione verbatim) custodita in un device.
- **Device**: oggetto (computer/server/droide) in una stanza, da sbloccare per ottenere la memory unit.
- **Diario**: artefatto markdown costruito dallo studente catturando le memory unit; esportabile nel Vault.
- **Door keeper**: custode che apre il passaggio al piano successivo dopo un quiz.
- **WM meter**: misuratore di memoria di lavoro alimentato dagli sblocchi, separato dalla conoscenza del contenuto.
- **Knowledge / Fluency / Transfer**: i tre livelli della pipeline cognitiva (cattura / door keeper / boss).
- **Heatmap di studio**: colorazione finale della mappa per area, sintesi di knowledge + fluency + transfer.
