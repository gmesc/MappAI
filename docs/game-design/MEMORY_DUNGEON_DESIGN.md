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
  | 1 | 3 | 1.5 s |
  | 2 | 3 | 1.3 s |
  | 3 | 4 | 1.3 s |
  | 4 | 4 | 1.1 s |
  | 5 | 5 | 1.0 s |
  | 6 | 5 | 0.9 s |
  | 7 | 6 | 0.8 s |

  Affinamenti (validati 25/6, dopo 2 feedback "troppo difficile"): partenza **monocromo** — un solo colore, obiettivo = ricordare **solo la sequenza/ordine**. La ricostruzione mostra **esattamente** i simboli della sequenza (nessun intruso esterno) → puro compito di ordinamento. La variabile **colore entra solo con lo score WM**, gradualmente: 1 → 2 → 3 → 4 colori (`1 + WM/30`, max 4). Span parte da 3, esposizione 1.5 s; velocità adattiva al WM ma lenta (`base − WM*3`, min 600 ms). Salita **graduale**: 3 successi consecutivi per +1.

  ### Sblocco droidi = stop/go (inibizione)
  I device di tipo **droide** usano un gioco **stop/go** (go/no-go) per allenare l'**inibizione dello stimolo**, stessa UI di forme/calcolo, tasti **F/J**: Blu → F, Arancio → J (GO); Rosso → **non premere** (NO-GO, ~30% dei trial). Score = % di trial corretti su 12; **sblocco se ≥ 60%**, altrimenti si **ripete all'infinito senza malus**.

- **Calcolo = solo addizione/sottrazione, timer generoso**:

  | Lv | forma | operazioni | timer |
  |----|-------|-----------|-------|
  | 1 | a+b, ≤5 | solo addizione | 30 s |
  | 2 | a+b, ≤9 | solo addizione | 28 s |
  | 3 | a±b, ≤9 | + sottrazione | 26 s |
  | 4 | a±b, ≤20 | +/− | 24 s |
  | 5 | a±b±c, ≤20 | +/− | 22 s |
  | 6 | a±b, ≤50 | +/− (cap) | 22 s |

  Affinamenti (25/6): si **parte da sola addizione con numeri piccoli** (≤5); la sottrazione entra solo al livello 3; il cap (livello 6, ≤50) è il massimo. Salita graduale (3 successi consecutivi per +1).

  Ai livelli bassi il timeout è **morbido** (si ritenta, nessuna penalità dura). Difficoltà **progressiva e incrementale** sul profilo del player (metriche memorizzate); **cap rigido**: mai operazioni più complesse di questa tabella (max testato nella demo).

- **Difficoltà adattiva**: due tracce separate `seqLv` / `calcLv` (start 1; +1 dopo **3** successi consecutivi; −1 dopo un fallimento; clamp 1–7). Persistite in `localStorage 'mappai_dungeon_skill' = {seq, calc}`.
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

---

## 16. Esplorazione, nemici e combattimento (stile 8-bit)

Direzione visiva decisa (25/6): **2D top-down 8-bit con sprite animate**, asset in `public/assets/rogue8x8/` (pack 8×8 stile rogue-like — verificare licenza). **Niente cabinato disegnato, niente effetti CRT** (mockup arcade scartato per il gioco vero).

- **Movimento = point&click col mouse** (sempre): si clicca una cella esplorata, il personaggio raggiunge la destinazione via pathfinding (`ROT.Path.AStar`). Nessun tasto direzionale per muoversi.
- **Stanze**: generate con `ROT.Map.Digger` per ogni piano (= livello). Nebbia di guerra con `ROT.FOV`.
- **Sorgenti memoria** (rinominati da computer/server/droide): **📖 libro → sequenza forme**, **📜 scroll → calcolo**, **🧟 zombi → stop/go**. Arrivando sulla sorgente parte il minigioco di sblocco; al successo si estrae la memory unit.
- **Nemici (fantasmi)** — distinti dagli zombi-sorgente. Vagano per il dungeon.
- **Combattimento = duello d'inibizione**, si avvia al **contatto** player↔nemico:
  - Appare un balloon sopra il nemico con una lettera **F** o **J**.
  - Per colpire si preme il tasto **OPPOSTO** a quello mostrato (F→J, J→F).
  - Tasto **giusto al momento giusto** → nemico **−2 HP**; tasto **sbagliato** → player **−1 HP**.
  - HP nemico per livello: **L1 = 5, L2 = 6, L3/4/5 = 8**.
- **Salute**: barra a **cuoricini sempre in alto**; player rigenera **1 HP ogni 10 s**; **pozioni** (GroundItems) curano.
- **Morte = soft permadeath inclusivo**: il **diario NON perde memoria**; le sorgenti già estratte restano disattive; respawn a inizio piano, HP pieno. Nessuna perdita di apprendimento.
- **Diario**: si apre con il tasto **B**.
- **Asset → ruolo**: `Tileset` (dungeon), character sheets (player animato, selezione personaggio), `Enemies` (fantasmi/zombi), `OrcSheet` (boss), `Book` (diario aperto + libri), `GroundItems` (pozioni/scroll), `UIthings` (cuori/HUD), `KeyButtons` (prompt F/J), `NPC`/`EnemyPortraits` (door keeper/boss).

### Stato build
- **Slice 2a FATTO**: stanze + esplorazione point&click + fog + sorgenti agganciate ai 3 minigiochi + memory unit mostrata + diario (B) + scala/piani + cuori/rigen. Rendering provvisorio a **emoji** (sprite PNG reali = slice 2b).
- **Slice 2b TODO**: sprite PNG 8-bit animate (slicing fogli), nemici fantasmi + duello F/J-opposto, pozioni, diario markdown ricco con export Vault.

---

## 17. Ponte Studio Attivo ↔ Dungeon (proposte 6 luglio 2026 — da discutere)

> Origine: revisione pedagogica completa di `mappai-active-study.js` (Handbook of
> Game-Based Learning). Regola guida (Ch 14): **non portare le 7 modalità come
> minigiochi-popup** — un mini-quiz "incollato" sul dungeon è skin, e la
> disallineamento meccanica↔contenuto peggiora l'apprendimento. Ogni modalità va
> tradotta in un elemento della finzione, così la meccanica È il compito di studio.

### Prerequisito non negoziabile: misurazione pulita
Il door keeper assegna bronzo/argento/oro sul **rate** e la heatmap fonde
knowledge/fluency/transfer: i numeri devono essere sani PRIMA della gamification.
Fatto il 6/7/2026 in `mappai-active-study.js` (v2 misurazione PT):
- salvataggio **una volta per sessione** (mai per verifica) + `attempts` nel record;
- **rate per-item** (60/secondi sull'item, cap 30) al posto della media di sessione;
- campo **`metric`** (`completion|structure|recognition|recall|coverage`) su ogni
  record: la meta-analisi non somma più mele e pere;
- quiz/flashcard configurati instradati sul **StudyBus** (prima invisibili alla padronanza).

### Traduzioni proposte (modalità → elemento del dungeon)

| Modalità Studio Attivo | Nel dungeon | Note di design |
|---|---|---|
| **6. Verbi delle relazioni** | **Circuiti e passaggi segreti**: le relazioni sono cavi/condotti tra sorgenti e stanze; per alimentare una porta scegli il tipo di connettore (= famiglia del verbo); connettore giusto → circuito chiuso. I **cross-link diventano teleport tra piani**: indovina la relazione tra due concetti di aree diverse → si apre lo shortcut. | Spazializza i cross-link, che nel mapping piani=livelli non hanno casa. Riusa `EDGE_FAMILIES` + il picker (senza keyword-leak, 2 tentativi conta il primo). |
| **7. Ordina la sequenza** | **Sequenza di boot**: riavvia il server di piano accendendo le macchine nell'ordine del processo (catena cronologica). Ordine errato = soft reset con indizio su quale coppia è invertita. | Usare solo contenuti davvero sequenziali (timeline / rel famiglia "sequenza"). Credito parziale LCS già in `mappai-active-study-core.js`. |
| **5. Trova l'intruso** | **Unità mal archiviata / mimic**: nel diario (capitoli per macro-area) una memory unit è archiviata nel capitolo sbagliato — "file corrotto" da riclassificare. Variante: sorgente **mimic** che contiene una unit di un altro piano; catturarla richiede dire a quale piano appartiene. | Scelta dell'intruso col criterio lessicale-distante (`pickDistantBranchIndex`), mai random: un intruso plausibile punisce risposte difendibili. |
| **4. Riempi le descrizioni** | **Riparazione di unit corrotte**: unit estratte **con lacune** (cloze generativo); il player ripara i buchi scrivendo — unit riparata vale di più nella heatmap. La cattura "a mano" (§5) È già il modo 4: `scoreDesc` (coverage 0-100) riusabile pari pari come validazione. | Portare anche anti-pappagallo (jaccard ≥ 0.8 → "riformula") e hint ladder (3 parole chiave → prima frase). |
| **3. Richiamo etichette** | **Indice corrotto dell'archivio**: al door keeper, ogni tanto, l'indice del diario ha perso i titoli; il player riassegna le etichette ai riassunti **che lui stesso ha scritto**. | Richiamo sul proprio artefatto > richiamo sulla mappa. Variante digitata (fuzzy `labelMatches`) = richiamo vero, chips = fallback accessibile. |
| **1-2. Costruisci / Gerarchie** | **Il reveal diventa attivo — "defrag della memoria"**: dopo il boss, il finale non MOSTRA la mappa: il player la **ricostruisce** (modo 1/2) usando solo le unit catturate; la heatmap si accende nodo per nodo man mano che piazza. | Coerente con la visione ("il grafo si guadagna"); chiude la pipeline con l'atto generativo più potente; il criterio di successo c'è (il boss ha già validato la conoscenza). La modalità 1, la più debole in-app, diventa climax narrativo. |

### Infrastruttura
- Tutte le meccaniche del dungeon producono evidenza per lo **stesso store pinpoint**
  via `MappAIStudyBus` (activity `dungeon`, già previsto dal bus): il dungeon è il
  wrapper di **stealth assessment** (Ch 20), non un silo di punteggi separato.
- Door keeper = agente pedagogico con **hint laddering + fading** (Ch 8): primo
  indizio gratuito e loggato; gli indizi sfumano quando la padronanza sale.
- Confermato il principio già nel design: locks WM/calcolo **separati** dalla
  conoscenza (mai gate di contenuto dietro prestazioni esecutive per discalculia).

### ✅ Stato implementazione §17 (6 luglio 2026) — TUTTO IMPLEMENTATO
Le 6 traduzioni sono nel runtime (`mappai-games.js`, sezione «PONTE STUDIO ATTIVO ↔ DUNGEON»),
logica pura in `mappai-dungeon-core.js` (`buildParentOf`, `findBestChain`, `clozeGaps`,
`pickMisfiled` — testate in `tests/dungeon-core-s17.test.js`, 10 test). Riuso di
`MappAIActiveStudyCore` (jaccard/similarity/sequenceScore/labelMatches).

| Meccanica | Dove scatta | Attività (mastery) | Kill-switch localStorage |
|---|---|---|---|
| ⚡ Condotto (verbi, modo 6) | sorgente sui piani misto; cross-link con verbo non generico; 2 tentativi conta il 1°; poi resta **fast-travel** verso i piani visitati + "visione" dell'altro capo | `dungeon_verbs` | `mappai_dungeon_circuits='0'` |
| 🖥 Server di boot (modo 7) | una volta per run, sul piano della testa della catena (≥3, senza biforcazioni); LCS; ordine errato = soft reset con indizio sulla coppia invertita; successo = **nebbia del piano dissolta** +2 mana | `dungeon_seq` | `mappai_dungeon_boot='0'` |
| 🎭 Mimic (modo 5) | ~1 piano misto su 4: sorgente-libro extra con memoria di un ALTRO piano; dopo lo sblocco chiede il capitolo di appartenenza | `dungeon_intruso` | `mappai_dungeon_mimic='0'` |
| 📁 Voce mal archiviata (modo 5) | al gate, alternata con l'indice (1 evento ogni 2 gate, mai bloccante); intruso scelto lessicalmente distante (`pickMisfiled`) | `dungeon_intruso` | `mappai_dungeon_archive='0'` |
| 🗂 Indice corrotto (modo 3) | al gate: riassegna i titoli alle **sintesi scritte dal player** (note ≥8 parole, i più bisognosi prima); variante «✍ scrivilo» fuzzy | `dungeon_index` | `mappai_dungeon_archive='0'` |
| ▁ Unit corrotta / cloze (modo 4) | alla cattura, SOLO nodi già incontrati (attempts ≥2, non 'nuovo'): riparazione a memoria con hint ladder per gap; riparata perfetta = +10 synth (heatmap); primo incontro resta sintesi generativa | `dungeon` (canale cattura) | `mappai_dungeon_cloze='0'` |
| 🧩 Defrag della memoria (modi 1-2) | post-boss, PRIMA del riepilogo: ricolloca ≤12 unit (stratificate per macro, deboli prima) nelle macro-aree; la heatmap si accende cella per cella; skippabile | `dungeon_defrag` | `mappai_dungeon_defrag='0'` |
| Anti-pappagallo cattura (modo 4) | in `evaluate()` della cattura attiva: jaccard ≥0.8 con la fonte → «riscrivila con parole tue» | — | (sempre attivo) |

Tutti i punteggi passano dal **StudyBus** dentro la sessione `dungeon` → `sessioni.jsonl`
+ mastery EWMA per pinpoint: il dungeon è il wrapper di stealth assessment previsto.

---

## 18. Spunti da Tilemancer Dungeon (6 luglio 2026 — da discutere)

> Origine: studio del demo di **Tilemancer Dungeon** (dungeon crawler + card game dove il
> giocatore COSTRUISCE il dungeon che esplora, piazzando tile-stanza pescate dai forzieri).
> Pattern estratti nella skill `~/.claude/skills/tilemancer-dungeon-design/`.
> Filtro applicato: entra solo ciò che arricchisce l'apprendimento con un gameplay più ricco
> (stessa regola Ch 14 di §17: la meccanica È il compito di studio). Tutto ciò che è skin
> decorativa è scartato esplicitamente in fondo.

### Meccaniche importabili

| Spunto Tilemancer | Nel Memory Dungeon | Funzione di apprendimento |
|---|---|---|
| **Preview del danno** pre-scontro ("prenderai 2 danni, vinci") | **Preview dei costi**: il door keeper mostra PRIMA di entrare "N domande, mix, quota richiamo dai piani precedenti"; il duello F/J mostra HP nemico vs propri; la cattura mostra profondità/tempo stimato | Autoregolazione e valutazione del rischio (metacognizione esternalizzata); riduce l'ansia da prestazione — estende l'asse anti-frustrazione (§9) dal "dopo l'errore" al "prima della scelta" |
| **Bomba** rompe-muri (risorsa scarsa, mai sulla boss room) | **🔧 Riparatore** (costa mana, già in economia): ri-archivia una unit mal classificata, riapre un piazzamento sbagliato nel defrag, concede un secondo tentativo su un condotto fallito. MAI utilizzabile su gate/boss | Economia dell'errore a 3 livelli: prevenzione (preview) → riparazione a costo → sicurezza (nessuna perdita permanente). L'errore informa E responsabilizza, senza condannare. La valvola non scavalca mai la verifica |
| **Tile con porte vincolate** (l'aggancio è legale solo se compatibile; l'errore si vede da sé) | **Defrag v2**: le unit del defrag post-boss diventano tile con **connettori sagomati per famiglia di relazione** (`EDGE_FAMILIES` — colori e verbi già definiti); la tile entra solo dove la relazione è compatibile | Il vincolo spaziale È il vincolo semantico: piazzare = ragionare sulle relazioni, non smistare per categoria. Errore auto-evidente senza giudizio esterno |
| **Il player costruisce il dungeon** pescando tile dai forzieri | **Piano cantiere** (1 per run, opzionale, kill-switch `mappai_dungeon_builder='0'`): un piano NON pre-generato; lo studente pesca stanze-concetto (nodi di quel livello) dai forzieri e costruisce lui il percorso verso la scala; porte = relazioni del grafo | Porta i modi 1-2 (costruisci/gerarchie) DENTRO la run — oggi esistono solo al defrag post-boss. La pianificazione (funzione esecutiva, §10) è allenata dalla meccanica stessa, zero popup |
| **Mazzo con reshuffle** (draw/discard, ricircolo automatico) | **Pescate pesate sulla mastery EWMA**: i nodi deboli tornano più spesso nel mazzo del piano cantiere; il reshuffle garantisce che nulla si perda | Spaced retrieval nascosto nella meccanica: la composizione del mazzo è un punto di controllo pedagogico invisibile, coerente con lo stealth assessment (§17) |
| **Classi con kit distinti** (Knight: HP alti, affronta a testa bassa) | **Classi = profili di accesso**: una classe con più HP (più tentativi nei duelli), una con lanterna ampia (meno nebbia), una con più mana (più riparazioni). Stesso compito di studio per tutte | Gli adattamenti BES/DSA vestiti da scelta di build: autonomia e identità al posto di "modalità facile" (niente stigma). Le classi ridistribuiscono il margine d'errore, MAI il contenuto |

### Cautele

- **Import solo dove piazzare = decisione semantica.** Un puzzle spaziale con vincoli arbitrari
  è frizione gratuita — stessa regola anti-skin di §17. Il vincolo educa solo se codifica
  una logica che lo studente può imparare (le famiglie di relazione).
- **No-undo puro confligge con l'anti-frustrazione (§9)** → sempre commitment + valvola:
  il piazzamento pesa, ma il riparatore esiste. L'errore costa una risorsa, mai la sessione.
- **Carico cognitivo (ADHD/DSA)**: costruire + combattere + studiare insieme satura. Il piano
  cantiere è un piano *dedicato* (niente nemici, niente timer), mai una meccanica sovrapposta
  alle altre. Tilemancer regge proprio perché minimalista: una decisione per volta.

### Scartati esplicitamente (sexy shell)

| Meccanica Tilemancer | Perché NO |
|---|---|
| Negozio / oro / upgrade del gear come reward | Ricompensa estrinseca scollegata dalla competenza (Handbook GBL); la heatmap rende già visibile la padronanza. L'oro sposta la motivazione dal padroneggiare all'accumulare |
| Boss "a tema" estetico (Berserker/Dark Mage/Vampire) | Cambia solo l'aspetto, non il compito: climax sprecato. I nostri boss sono già prove di transfer (§7) |
| Achievement di sblocco classi | Decorazione: le classi-profilo devono essere disponibili da subito, non guadagnate (sarebbe gate-are l'accessibilità) |
| Economia monetaria in generale | Nessuna funzione di apprendimento; aggiunge una valuta da gestire che distrae dal contenuto |

---

## 19. Ambiente voxel 3D × modalità di studio — design world-space (6 luglio 2026)

> Origine: upgrade grafico (`tools/voxel-proto` — volumi flat senza texture + sprite
> billboard, camera isometrica, griglia logica intatta) + decisioni utente del 6/7:
> **(a)** design prima del codice · **(b)** fog = buio + luci · **(c)** sfide §17
> world-space · **(d)** mapgen ibrido (stanze speciali curate, piani normali runtime).
> Stato: **design approvando — nessun codice fino a conferma**.

### 19.1 Principio

La griglia logica non cambia: `mappai-dungeon-core.js`, pathfinding, FOV-dati, StudyBus
e tutte le registrazioni §17 restano identici. Il 3D è presentazione — ma una
presentazione che **rende fisiche le metafore** di §17: il cross-link diventa un ponte
che si costruisce, il boot accende letteralmente la luce, il defrag è depositare
tile su piattaforme. Verbo unificante di TUTTE le interazioni di studio world-space:
**porta-e-deposita** (raccogli l'oggetto-risposta, deposita sul bersaglio giusto).
Un solo pattern motorio da imparare = carico cognitivo minimo (ADHD/DSA).

### 19.2 Contratto entità v1 (estende il draft di voxel-proto/README)

```json
"entities": [
  { "id":"hero",    "type":"hero",     "sprite":"rogue8x8/Girl-Melee", "x":2.0, "z":5.0 },
  { "id":"s_n42",   "type":"source",   "src":"libro|scroll|vaso", "nodeId":"n42", "x":7, "z":3 },
  { "id":"mim_1",   "type":"source",   "src":"libro", "mimic":true, "nodeId":"n88", "x":9, "z":6 },
  { "id":"cond_1",  "type":"condotto", "linkS":"n42", "linkT":"n77", "x":4, "z":9,
                    "bridge":[[5,9],[6,9]] },
  { "id":"srv_1",   "type":"server",   "machines":["n1","n2","n3","n4"], "x":10, "z":4 },
  { "id":"ped_g2",  "type":"pedestal", "group":2, "x":12, "z":2 },
  { "id":"stairs",  "type":"stairs",   "x":14, "z":14 },
  { "id":"gk",      "type":"gatekeeper","x":8, "z":1 },
  { "id":"boss",    "type":"boss",     "x":12, "z":12 },
  { "id":"npc_v",   "type":"npc",      "name":"sapiente-viola", "x":3.4, "z":6.2 },
  { "id":"tot_n42", "type":"totem",    "nodeId":"n42", "sprite":"…", "x":5.3, "z":2.8 },
  { "id":"dec_1",   "type":"decor",    "name":"tree", "x":1.2, "z":3.7 }
]
```

- Le mappe CURATE (mapgen) dichiarano **slot tipizzati** senza `nodeId` (come gli
  `anchors` di `mappai-map-loader.js` oggi); il runtime lega i nodi del grafo agli slot.
- I piani PROCEDURALI emettono lo stesso JSON a runtime (porting del digger → `cells`).
- `bridge` (condotto): celle che passano `blocca:true → false` + quota alzata quando
  il circuito si chiude. `pedestal`: bersaglio porta-e-deposita, colore = `group`.
- `totem`: riservato al layer Palazzo della Memoria (coordinate frazionarie ✓).

### 19.3 Modello luce = fog (decisione b)

- **Piano al buio**: ambient bassissima; l'eroe porta una **lanterna** (point light,
  raggio ~4 tile). Le celle esplorate mantengono una tinta tenue permanente
  (mappa `DUN.explored` invariata → solo resa visiva diversa).
- **Landmark nel buio**: sorgenti/scale/condotti emettono un bagliore fioco visibile
  da lontano — l'esplorazione ha bussole, mai brancolamento (anti-frustrazione §9).
- **🖥 Boot riuscito = luce globale del piano** (persistente): il reward §17 "nebbia
  dissolta" diventa letterale e spettacolare.
- **Raggio lanterna = kit di classe** (§18): la classe "esploratore" vede più lontano —
  adattamento ipovisione/ansia vestito da build, senza stigma.
- Toggle "niente buio" nelle impostazioni di gioco (profili che il buio affatica).

### 19.4 Le meccaniche §17 in world-space (decisione c)

| Meccanica | Forma fisica | Interazione | Cosa resta DOM |
|---|---|---|---|
| **⚡ Condotto** | Due piloni con billboard dei concetti, collegati da una fila di voxel spenti che attraversa acqua/baratro | Sul terminale compaiono 7 **prese-connettore** (colori famiglia, grandi): clicchi la presa → se giusta i voxel si accendono col colore-famiglia e **il ponte si materializza** (percorribile: lo shortcut è fisico, non un menu) | Tooltip verbo + TTS. 2 tentativi, conta il 1° (invariato) |
| **🖥 Server** | Torri-macchina nella sala, schermo-billboard col concetto | CAMMINI alla macchina e la clicchi nell'ordine scelto (si accende ambra; ri-click = spegni/undo); "avvia" = leva fisica → il prefisso corretto si accende verde in sequenza, la prima sbagliata scintilla rossa → soft reset + indizio sulla coppia | Nulla: tutto nel mondo. LCS sul 1° tentativo (invariato) |
| **🎭 Mimic** | La sorgente trema e si rivela mimic dopo lo sblocco | La unit ti segue (porta-e-deposita): **piedistalli colorati** per macro-area nella stanza — depositi su quello giusto | Nulla |
| **📁 Mal archiviata** | Nella gate room: scaffale con 4 unit-card fluttuanti sotto l'insegna del capitolo | Clicchi la card che NON c'entra; quella giusta vola al suo scaffale | Nulla |
| **🗂 Indice corrotto** | Le TUE sintesi come card fluttuanti allo scaffale | Selezione titolo: card-titolo da deporre accanto alla sintesi (porta-e-deposita). Variante "✍ scrivilo": pannello-terminale | Input digitato (tastiera = DOM per natura), stilizzato **schermo CRT diegetico** |
| **▁ Cloze** | Il terminale della sorgente mostra il testo coi gap | Riparazione = digitazione → pannello-terminale CRT ancorato alla sorgente; a riparazione perfetta la sorgente brilla oro (heatmap +10 visibile nel mondo) | Input digitato + hint ladder |
| **🧩 Defrag** | **Camera del defrag** post-boss (stanza curata): piattaforme colorate = macro-aree; le unit catturate = tile impilate al centro | Porta-e-deposita ogni tile sulla piattaforma giusta; la piattaforma **si accende cella per cella** col colore-padronanza. Con §18 "defrag v2": zoccoli sagomati per famiglia di relazione | Bottone "salta" (portale d'uscita sempre visibile) |
| **Gate/boss quiz** | Restano overlay (sono già dialogo col custode) | — | Quiz completo — con **preview dei costi** (§18) sull'insegna della porta: "N domande · quota richiamo" |

Regole trasversali:
- **Testo nel mondo = billboard grandi + TTS ovunque**; dimensione testo regolabile.
- **Niente timing** in nessuna interazione di studio (i tempi servono solo al rate PT, misurato in silenzio).
- **Camera fissa di default** (rotazione Q/E opt-in): la rotazione libera carica la memoria spaziale — per molti BES è costo, non feature. Ombre blob default (già nel proto).
- **Tastiera**: TAB cicla le entità interattive visibili, Invio attiva — percorso senza mouse.
- Le skin 2D (SB/LoL) **mantengono i modali attuali** di §17: il world-space vive solo
  nel renderer voxel → migrazione senza regressioni, fallback sempre disponibile.

### 19.5 Mapgen ibrido (decisione d)

- **Curate da mapgen** (Python → JSON contratto): giardino/hub, gate room, sala boss,
  camera del defrag, radura FE. Poche, belle, riusate.
- **Procedurali runtime** (JS): piani normali — porting del digger sul formato `cells`
  (stanze ∝ nodi come oggi; `size` variabile, non 16 fisso: il contratto lo permette).
- ⚠️ **Debito da sanare prima**: gli script di `tools/mapgen` (rules_compositor, grass)
  puntano hardcoded a `/Users/…/MappAI BERT/` — vanno portati su questo repo e
  aggiornati per emettere il JSON del contratto (oggi compongono PNG).

### 19.6 Piano di migrazione (fasi, ognuna shippabile)

1. **F0 — proto**: contratto entità v1 + modello buio/lanterna dentro `tools/voxel-proto`
   (zero rischio, valida le decisioni b/c su un piano finto).
2. **F1 — terza skin**: renderer voxel in `mappai-games.js` dietro
   `mappai_dungeon_skin='voxel'`; piani procedurali → JSON runtime; stanze speciali
   curate. Le sfide §17 restano modali (come nelle skin 2D).
3. **F2 — world-space**: picking 3D (raycast) + entity manager; condotto-ponte,
   server-macchine, porta-e-deposita, camera del defrag. Una meccanica alla volta,
   kill-switch per ognuna.
4. **F3 — consolidamento**: voxel diventa default, SB/LoL legacy; layer Palazzo
   della Memoria (totem alla cattura, richiamo per loci — le stanze ora sono VERE).

### ✅ Stato implementazione §19 (7 luglio 2026) — F0 + F1 + sprite F2 + VOXEL DEFAULT
- **Sprite PNG animati + voxel DEFAULT** (7 luglio 2026): la skin voxel è ora il
  **default** del Memory Dungeon (`_skin()` ritorna `'voxel'`; fallback sicuro a `'lol'`
  se THREE assente o `frame()` fallisce — mai sul renderer ASCII). I PERSONAGGI non sono
  più emoji ma **sprite PNG animati** dai fogli `rogue8x8`, in `mappai-dungeon-voxel.js`:
  - eroe = `Girl-Melee.png` riga 0 (fronte), walk 3 frame quando si muove / idle da fermo;
  - mob = `OrcSheet.png` orco verde, walk 3 frame; boss = `gatekeeper.png`, idle 4 frame
    (crop 13px per evitare il watermark 't'); sapienti = `NPC.png`, statici, colonna
    variabile per varietà. Frame ritagliati via UV `offset`/`repeat` (clone del foglio,
    immagine condivisa), animati su clock globale dentro `V.frame` (nessun rAF proprio).
  - I LANDMARK di studio (libri/scroll/vaso, scale, condotto ⚡, server 🖥, portale 🔮)
    restano **emoji self-lit** (leggibili nel buio §19.3), come nel proto.
  - Caricamento async con placeholder emoji: se un PNG manca, l'emoji resta (fallback).
  - Verificato con harness three-r128 dedicato (crop/animazione corretti, 6/6 sprite,
    0 errori console); non testato nell'app Electron viva (licensing blocca il browser).
  - ⚠️ Giardino curato (`_gmap`, arte LoL-tile) reso solo in skin 'lol': in voxel il
    giardino usa il layout procedurale seedato (comunque valido). Duelli F/J: balloon
    ancora non resi in voxel → per ora modalità studio, o skin 'lol' via
    `MappAIGames.skin('lol')`.
- **Parità visiva col proto** (7 luglio 2026, feedback utente su screenshot):
  - **Q/E ruota la camera di 90°** con lerp morbido (decisione utente: SUPERA lo
    "yaw fisso" di §19.4; ignorato quando si digita in input/textarea; listener
    rimosso in dispose). Billboard sempre rivolti alla camera, pick invariato.
  - **1 tile = SUB×SUB mini-voxel** con jitter di quota e colore, come il proto.
    SUB adattivo (≤1200 celle → 3, ≤3000 → 2, oltre → 1: i piani digger 72×48
    restano leggeri). Muri = colonne ad altezza variabile 1.45–1.85; acqua del
    giardino incassata (-0.3/-0.42) e blu.
  - **Ombre**: BasicShadowMap (le "dure" del proto), sole con shadow camera
    adattata al piano, ombre ritagliate sulla silhouette degli sprite via
    `customDepthMaterial` (la depth map segue il frame di animazione).
  - **Taglie in rapporto proto** (tile=1): eroe 0.78, mob 0.62, NPC 0.6, boss 0.95;
    landmark emoji 0.62 (server 0.85, condotto 0.7, portale 0.8).
  - Luce piena (post-boot): hemi 0.5 + dir 1.25 (ombre leggibili) e RESET della
    tinta "visitato" (+45% solo al buio: a luce piena sovraesponeva).
  - Verificato con harness sul modulo reale (buio+lanterna, rotazione, luce piena):
    zero errori console dopo fix.

### ✅ Stato implementazione §19 (6 luglio 2026, notte) — F0 + F1 FATTI
- **F0** (`tools/voxel-proto`): buio+lanterna (toggle L), tinta esplorato, entità
  tipizzate §19.2 come billboard emoji self-lit, **condotto-ponte** (le lastre
  sull'acqua si accendono e diventano percorribili), **boot = luce globale**.
  Validato visivamente nel browser; hook testabili in `window.__protoDebug`.
- **F1** (`public/js/mappai-dungeon-voxel.js`, ~250 righe): terza skin
  `mappai_dungeon_skin='voxel'` — scena Three.js (r128 vendored) costruita da
  `DUN.map`, buio+lanterna+tinta esplorato, luce globale quando il piano è tutto
  esplorato (post-boot §17), billboard emoji per sorgenti/scale/boss/gate/NPC/mob,
  camera isometrica FISSA che segue l'eroe, pick 3D per il point&click.
  3 hook in `mappai-games.js` (_dunRender dispatch · _onDunClick pick · dispose);
  auto-fallback alla skin 2D su errore. Le sfide §17 restano modali (F2).
  ⚠️ Limite F1 noto: i balloon del duello F/J non sono resi in voxel — con la
  skin voxel usare la modalità studio (senza nemici) finché F2 non li porta in 3D.
- **Bonifica mapgen**: path hardcoded MappAI BERT rimossi da tutti gli script
  (`ROOT` ora derivato da `__file__`); pronti a produrre asset per QUESTO repo.
- **F2 sprite + default FATTI** (vedi blocco sopra, 7 luglio 2026): personaggi come
  sprite PNG animati e voxel come skin di default. Restano da F2: sfide §17 world-space
  (condotto/boot in-world), balloon duello F/J in 3D. F3 (layer Palazzo): successiva.

### 📐 DESIGN (6 luglio 2026): mappe custom persistite nel vault
Piani del dungeon **disegnabili/modificabili nell'editor** (`tools/voxel-proto`) e
salvati nel vault (`Memory Dungeon/piani/*.json`), con studenti/docenti coinvolti
nell'authoring degli ambienti. Contratto dati completo (contratto piano + ruleset +
validatore), separazione dati/regole/codice, slot didattici (memoria vincolata al
livello, spawn/scale/gatekeeper obbligatori), degradazione graziosa e ordine di
implementazione in **[`VAULT_DUNGEON_MAPS_CONTRACT.md`](VAULT_DUNGEON_MAPS_CONTRACT.md)**.
Implementati (6-7 luglio 2026): loader con fallback, cartella creata di default nel
vault (+LEGGIMI), nome file libero (fa fede l'`id` interno), validatore §4,
import in-app «Importa piano Dungeon» — dettagli nel contratto, §9.

### ✅ Giardino per-mappa + Sapienti con personalità (6 luglio 2026, notte)
Richiesta: giardini nuovi per ogni mappa; Sapienti con personalità che gironzolano nella
loro zona, si fermano a parlare col giocatore e riprendono la routine quando se ne va.

**Vincolo rispettato**: `VAULT_DUNGEON_MAPS_CONTRACT.md` è la fonte di verità e non ha slot
`sapiente/npc` (v1) → **nessun campo nuovo nel contratto**. Personalità e geometria del
giardino sono **runtime**, derivate deterministicamente da nodo+firma-mappa.

- **Movimento + stop-chat-ripresa**: già in `mappai-npc-behavior.js` (`stepNpc`: wander nel
  raggio dalla home, `playerDist ≤ trigger` → TURN e si ferma, player lontano → riprende).
  Era gated OFF; ora `mappai_npc_garden_enabled` **default ON** (kill-switch `'0'`).
- **Personalità** (nuovo, runtime): catalogo `PERSONALITIES` (5 archetipi: contemplativo,
  curioso, arguto, severo, sognatore) + `pickPersonality(seed)`. Ogni archetipo detta
  raggio, `pauseProb`, cadenza passi/pausa/bolla e **`tone`** (la voce nel prompt
  `NPC_NARRATOR`, prima hardcodata). `mkBehavior` accetta un 5° arg `persona`
  (retrocompatibile: senza persona = cadenza storica). Seed = `rootNodeLabel + nodeId` →
  lo stesso Sapiente ha lo stesso carattere per tutta la classe; i Sapienti di una mappa
  ricevono archetipi diversi.
- **Giardino seedato per-mappa**: `_loadGarden` seeda laghetto/alberi/fiori/posizioni dei
  Sapienti dalla firma-mappa (`mappai_garden_seeded` default ON). Ogni mappa ha il SUO
  giardino, **stabile a ogni visita** (principio dei loci, contratto §8) e diverso tra mappe.
  Kill-switch `'0'` → prato casuale a ogni reload.
- **Quanti Sapienti**: uno per macro-area L1 (non più fisso a 4), fino a
  `mappai_garden_sapienti_max` (default 8, clamp 1..12). Sprite ciclato per distinguerli;
  oltre i colori base i colori si ripetono. Mappe curate: qualsiasi slot `sapiente-*` è
  riconosciuto dall'editor-loader (`mappai-map-loader.js`), non solo i 4 colori storici.
- Test: +8 in `tests/npc-behavior.test.js` (determinismo/varietà persona, retrocompat
  mkBehavior, raggio e pauseProb per-carattere). Suite 222/222 ✅.

---

## 20. Mappa-mondo — open world a zone come alternativa ai piani (7 luglio 2026 — DESIGN, in attesa di decisioni)

> Origine: idea dell'utente durante il lavoro sull'editor Pianta (P1). Una mappa unica
> grande — isole/quartieri/ambienti collegati — al posto della pila di piani. Le aree
> si aprono attraverso GATE presidiati da guardiani. Questo paragrafo è il "P2"
> concordato: design-first, zero codice fino alle decisioni in fondo.

### 20.1 Visione

Il dungeon a piani racconta una discesa: livello dopo livello, dal generale al
particolare. La mappa-mondo racconta un TERRITORIO: ogni **zona è una macro-area L1**
della MindMap ("l'isola della Fotosintesi", "il quartiere delle Cellule"), i confini
tra zone sono confini semantici, e attraversarli richiede di aver consolidato il ramo
che ci si lascia alle spalle. È il **metodo dei loci reso giocabile** — la convergenza
naturale col Palazzo della Memoria (§19 F3) e col defrag (§17 modi 1-2): là lo studente
RICOLLOCA le memorie nelle macro-aree, qui le ABITA.

Per BES/DSA: la geografia porta significato (questo posto = questo argomento), la
memoria spaziale scaffolda quella semantica. Il rischio (dispersione su mappa grande,
ADHD) va compensato con le valvole di §20.5.

### 20.2 Modello dati (bozza — diventa contratto §11 SOLO dopo l'ok)

Nuovo file (proposta A, vedi domanda D4): `Memory Dungeon/mondo.json`,
schema `mappai-dungeon-world@1`. Coesiste coi piani; se presente e valido, il gioco
può partire in modalità mondo (kill-switch, default da decidere).

```jsonc
{
  "schema": "mappai-dungeon-world@1",
  "size": 64,                      // cap contratto attuale (D5)
  "sub": 3,
  "seed": 20260707,
  "cells": [ /* identiche al contratto §2: biome/quota/alt/blocca/mat */ ],
  "props": [ /* identici (yOff/billboard/scale/rot/walkable/light, m/f) */ ],

  // ZONE: aree di pavimento CONTIGUE, rilevate per flood-fill (non disegnate a mano).
  // anchor = una cella dentro l'area (identifica la zona); branchHint = binding SOFT
  // al ramo L1 (come nodeHint §2: fuzzy sul label, ignorato se il ramo non esiste più).
  "zones": [
    { "id": "z1", "anchor": { "x": 8,  "z": 8  }, "branchHint": "Fotosintesi" },
    { "id": "z2", "anchor": { "x": 40, "z": 30 }, "branchHint": null }   // null = assegnazione runtime
  ],

  // SLOT: gli stessi del contratto §2 (spawn/memory/enemy) + il nuovo tipo "gate".
  // Un gate sta su una cella di passaggio tra due zone: finché è chiuso, blocca.
  // req = requisito di apertura (vedi 20.3); la zona di appartenenza è implicita
  // (l'area in cui lo slot si trova), MAI scritta nel file.
  "slots": [
    { "type": "spawn",  "x": 8,  "z": 6 },
    { "type": "memory", "x": 10, "z": 9 },
    { "type": "gate",   "x": 20, "z": 14, "req": { "coverage": 0.6 } },
    { "type": "gatekeeper", "x": 60, "z": 58 }    // boss di mondo, opzionale
  ],
  "meta": { "author": "docente:rossi", "title": "Il mondo della biologia" }
}
```

Principi conservati dal contratto v1:
- **contenuto ≠ struttura**: le zone non nominano nodi; `branchHint` è un suggerimento
  soft con fallback automatico (staleness come §5);
- **regole nel ruleset**, non nella mappa: soglie di default dei gate, severità;
- campi cells/props INVARIATI → l'editor Pianta e i materiali funzionano già.

### 20.3 I gate — il cuore pedagogico

Un gate è un **guardiano di confine**: fisicamente blocca la cella finché il requisito
non è soddisfatto. Il requisito si valuta sulla ZONA DA CUI SI PROVIENE (consolidare
prima di procedere — testing effect al momento giusto). Opzioni di `req` (D2):

| Requisito | Meccanica | Nota |
|---|---|---|
| `coverage: 0.6` | ≥60% delle memorie della zona catturate | misura quantità, zero attrito |
| `quiz: 3` | il guardiano fa N domande sul ramo (pipeline gatekeeper §6 esistente) | misura richiamo, riusa tutto |
| `mastery: 0.5` | EWMA del ramo ≥ soglia (store padronanza esistente) | misura profondità, invisibile |
| combinazioni | es. coverage 0.6 + quiz 2 | il default va deciso (D2) |

Aperto un gate, resta aperto (persistenza come le porte §17). Il fallimento al quiz non
punisce: rimanda a studiare la zona (anti-frustrazione §1), il guardiano suggerisce QUALI
memorie mancano (dal diario).

### 20.4 Runtime — riempimento e progressione

1. **Zone detection**: flood-fill delle aree di pavimento; i gate chiusi tagliano il
   grafo. Ogni area → zona; match con `zones[]` per anchor.
2. **Binding zona↔ramo**: `branchHint` fuzzy sui label L1; zone senza hint → assegnazione
   per capienza (zona con più slot memory ↔ ramo con più memorie), deterministico.
3. **Riempimento**: nodi con contenuto del ramo X → slot memory della zona X (i deboli
   per primi, come §5). Staleness: rami in più → zone rimaste libere o celle libere;
   zone in più → restano vuote (esplorabili, "terre di nessuno").
4. **Progressione**: la decide la TOPOLOGIA disegnata dal docente — hub centrale con
   raggiera di gate = ordine libero; catena di istmi = percorso guidato. Nessuna regola
   hardcoded (D3).
5. **§17 e NPC**: sfide auto-piazzate per zona (invariate); Sapienti del giardino →
   un Sapiente per zona (già "uno per macro-area L1", combacia).

### 20.5 Valvole anti-dispersione (ADHD)

- **Minimappa a zone** (non a celle): bolle colorate = zone, bordi = gate aperti/chiusi,
  bolla corrente evidenziata. Colori = group dei rami (coerenza con la MindMap).
- **Bussola**: indicatore verso "la memoria più vicina non ancora catturata" (toggle).
- **Fast travel**: condotti ⚡ tra zone visitate (esistono già, §17 modo 6).
- **Fog per zona**: le zone oltre un gate chiuso sono sagome scure sulla minimappa
  (curiosità senza overwhelm); il buio+lanterna §19 resta dentro la zona.

### 20.6 Validatore esteso (diventa §4-bis del contratto dopo l'ok)

Giocabilità (sempre error):
1. spawn esattamente 1; ogni zona raggiungibile dallo spawn attraverso una sequenza
   di gate (BFS con porte: i gate sono archi condizionati);
2. ogni gate separa DAVVERO due aree (non gate su cella interna);
3. nessuna zona-vicolo-cieco senza memorie E senza uscita (softlock semantico);
4. slot mai su celle bloccate (invariato).
Pedagogia (severità da ruleset): coverage per ZONA (= nodi con contenuto del ramo,
non del level), minSpacing invariato, cap nemici per zona.

### 20.7 Authoring — cosa manca agli strumenti (poco)

- **Pianta (P1)**: già disegna il mondo (isole = zone). Da aggiungere: pennello/marker
  GATE sulle celle di passaggio + marker ancora-zona.
- **Studio**: l'estrazione requisiti oggi conta per LIVELLO; per il mondo serve il
  conteggio per RAMO L1 (stessa passata sui nodi, raggruppata per sottoalbero L1 —
  `getDescendantIds` esiste in app.js).
- **Editor 3D**: pannello zone (lista rami ↔ zone rilevate, con anteprima); slot gate
  piazzabile come gli altri.
- **Gioco**: `_loadWorld` accanto a `_loadFloor` — un solo piano gigante, scale
  sostituite dai gate, boss finale opzionale. Skin (D6).

### 20.8 Fasi implementative proposte

- ✅ **W1 FATTA** (7 luglio 2026) — contratto §11 scritto in
  VAULT_DUNGEON_MAPS_CONTRACT.md; in `mappai-dungeon-core.js`: `worldZones`
  (flood-fill deterministico + anchor match + conteggi per zona), `bindZones`
  (D1: hint fuzzy → capienza), `validateWorld` (BFS con porte, gate-not-boundary,
  zone-unreachable, coverage per ZONA, req default D2). +17 test
  (`tests/dungeon-world.test.js`), suite 239/239.
- ✅ **W2 FATTA** (7 luglio 2026) — runtime: `mondo.json` letto dal loader IPC;
  `_loadWorld` in mappai-games.js (zone→rami via `_branchGroups`+`bindZones`,
  memorie per zona con staleness IN-zona, gate = celle bloccate, gatekeeper=boss,
  guard voxel-only D6 con fallback ai piani); gate runtime (click da vicino →
  `checkGateReq` coverage/mastery → quiz del guardiano dal diario del ramo →
  apertura con `worldRev++` e rebuild della skin); minimappa a zone (§20.5);
  porta 🚪 nella skin voxel. Contratto §11.3. Esempio validato
  `docs/game-design/esempi/mondo.json`. Suite 241/241. ⚠️ Non testato in Electron vivo.
- **W2** — runtime di gioco: `_loadWorld`, gate col quiz del guardiano, minimappa
  a zone. Prima in skin 2D o voxel secondo D6.
- **W3** — authoring: gate nella Pianta, requisiti per ramo nello Studio, pannello
  zone nell'editor.
- **W4** — polish: bussola, fog per zona, condotti tra zone, telemetria per zona.

### 20.9 Decisioni (D1/D2/D4/D7 fissate con l'utente il 7 luglio 2026)

- ✅ **D1 — binding zona↔ramo**: il DOCENTE sceglie per zona (lista rami nell'editor);
  fallback automatico per capienza sulle zone non assegnate.
- ✅ **D2 — requisito gate di default**: **coverage 0.6 + quiz 2 domande** del guardiano
  sul ramo della zona precedente (riusa pipeline gatekeeper §6). Configurabile dal
  ruleset per-vault.
- ✅ **D4 — dove vive il mondo**: file separato **`Memory Dungeon/mondo.json`**
  (schema `mappai-dungeon-world@1`), coesiste coi piani.
- ✅ **D7 — giardino**: in modalità mondo il **Giardino dei Sapienti è la zona di
  partenza** (spawn); il piano-0 separato sparisce.
- **D3 — ordine di visita** (default proposto, non obiettato): lo decide la TOPOLOGIA
  disegnata dal docente — hub a raggiera = ordine libero, catena = percorso guidato;
  il motore non impone regole.
- **D5 — dimensioni v1** (default proposto): cap 64×64 del contratto; oltre = streaming
  a chunk, rimandato.
- **D6 — skin** (default proposto): mondo SOLO voxel 3D (direzione F2/F3; la 2D resta
  per i piani classici).

---

## 21. Movimento quota-aware in-app — gradini, salto, caduta (7 luglio 2026 — CONFERMATO, decisioni in §21.8)

### 21.1 Problema e obiettivo

Oggi il gioco vero usa una griglia piatta 0/1 (`DUN.map[key] = 0|1`): la `quota`
delle celle del contratto (§2 di VAULT_DUNGEON_MAPS_CONTRACT.md, dipinta con il
pennello ⛰ Rilievo della Pianta) viene **scartata** da `planToGrid`
(mappai-dungeon-core.js:208) e la skin voxel usa solo un jitter casuale estetico
(mappai-dungeon-voxel.js:231). Risultato: un docente disegna colline e dislivelli
nella Pianta, ma in gioco il player le attraversa come se fossero piatte — il
rilievo non ha significato logico né visivo coerente.

Obiettivo F2-quota: portare in-app la fisica di dislivello già validata nel proto
(`tools/voxel-proto/proto.js:717` `stepKind`): **salite a gradini** camminabili,
**salto automatico** per gradini medi, **barriere** per dislivelli grandi,
**discese** con ease-down (cappate, vedi §21.2/DQ0). Il dislivello diventa
strumento di level design per il docente: terrazzamenti che guidano il percorso,
rupi come muri naturali, plateau presidiati dai mob.

### 21.2 Regole di movimento (dal proto, con UNA modifica decisa dall'utente)

Costanti (nuove in `mappai-dungeon-core.js`, fonte unica; il proto tiene le sue):

| Costante | Valore | Significato |
|---|---|---|
| `STEP_UP_WALK` | 0.9 | salita camminando: rise ≤ 0.9 → passo normale |
| `STEP_UP_JUMP` | 1.6 | salita col salto: 0.9 < rise ≤ 1.6 → salto automatico |
| — | — | rise > 1.6 → bloccato (parete) |
| — | — | discesa: **cap a 1.6** (drop > 1.6 → bloccato, come una parete) |

⚠️ **Differenza dal proto** (decisione utente, 7 luglio 2026): la discesa NON è
illimitata — un dirupo più alto della quota di salto blocca anche la caduta.
Conseguenza architetturale importante: il movimento diventa **simmetrico**
(|Δq| ≤ 1.6 percorribile nei due versi) → **le fosse-trappola sono impossibili
per costruzione** (se sei potuto scendere ≤ 1.6, puoi risalire col salto).
Il proto resta col suo modello a caduta libera (sandbox, non allineato).

`stepKind(quotaDa, cellaA) → 'walk' | 'jump' | 'fall' | 'blocked'`:
|Δq| > 1.6 → `blocked`; salita > 0.9 → `jump` (arco); discesa > 0.9 → `fall`
(ease-down, passabile); altrimenti `walk`. Mai su celle `blocca`
(acqua/lava/muro/void). Nessun danno da caduta (DQ2, anti-frustrazione §9).

Adattamento griglia (il proto è a movimento continuo, l'app è a celle): niente
campionamento a 4 offset del raggio eroe — il confronto è cella-a-cella
(`quota[to] - quota[from]`), un solo test per passo.

### 21.3 Architettura — fonte unica di verità in core

Principio: **runtime, validatore e auto-slot devono usare la STESSA funzione di
raggiungibilità**, altrimenti una mappa "valida" può essere ingiocabile (o
viceversa). Tutto il nuovo codice puro vive in `mappai-dungeon-core.js` (UMD,
testabile in Node):

1. **`planToGrid` esteso**: oltre a `{w, h, map, waterKeys}` ritorna
   `quota: { 'x,y': number }` (default 0 se il campo manca — retrocompatibilità
   totale con piani legacy). Nessun cambio di firma: campo aggiunto al risultato.
2. **`stepKindGrid(map, quota, fromKey, toKey)`** → `'walk'|'jump'|'blocked'` —
   regole §21.2 su celle.
3. **`findPathQuota(map, quota, sx, sy, sx2, sy2)`** — BFS 4-direzioni con arco
   |Δq| ≤ 1.6 (adattamento di proto.js:731). ⚠️ Sostituisce `ROT.Path.AStar`
   quando la quota esiste: rot.js riceve solo `(x,y)` nel callback di
   passabilità — l'arco dipende da ENTRAMBE le celle, non dalla sola
   destinazione. Con quota nulla (piani procedurali, giardino) si continua a
   usare rot.js → zero regressioni.
4. **BFS di validazione** (richiesta esplicita utente): con la discesa cappata
   il softlock è impossibile per costruzione, ma il BFS quota-aware resta nel
   validatore come rete di sicurezza e per i muri "invisibili" da dislivello:
   `_reachableFrom` diventa quota-aware → `stairs-unreachable` /
   `gatekeeper-unreachable` scattano anche quando la scala è dietro una rupe
   > 1.6; nuovo warning `slot-unreachable` per memorie/nemici in aree isolate
   dal dislivello. Il flood-fill delle zone (`worldZones`) diventa quota-aware:
   una rupe > 1.6 divide fisicamente due aree ESATTAMENTE come un muro, e le
   zone rilevate devono rispecchiarlo (altrimenti `zone-unreachable` non
   vedrebbe la barriera).

### 21.4 Runtime (mappai-games.js)

- **Loader**: `_loadFloorFromPlan` (già conserva `DUN.floorPlan`, riga 1284) e
  `_loadWorld` salvano `DUN.quota = grid.quota`. Piani procedurali (digger,
  giardino, boss room): `DUN.quota = null` → comportamento identico a oggi.
- **Click-to-move** (`_onDunClick`, riga ~1814): se `DUN.quota` → `findPathQuota`
  al posto di `ROT.Path.AStar`; altrimenti invariato.
- **Consumo passi** (`_dunTick`, riga ~1825): per ogni passo calcola
  `stepKindGrid(from, to)`:
  - `walk` → come oggi (110ms);
  - `jump` → `DUN.jumpFx = {from, to, t0}` per le skin + intervallo passo 320ms
    (durata dell'arco mezzo-seno del proto);
  - `fall` (discesa 0.9–1.6) → `DUN.fallFx`, ease-down, cadenza normale;
  - `blocked` non deve accadere (path già validato) → guard: scarta il path.
- **Mob** (`_mobTick`, riga ~2557): i mob **camminano solo, simmetrico**
  (|Δq| ≤ 0.9 in ENTRAMBI i versi — decisione utente DQ1: non saltano E non
  scendono dal loro terrazzo) → mob territoriali che presidiano il proprio
  livello z; il player può sfuggire saltando su/giù da un terrazzamento.
  Prevedibile per il target BES/DSA. Coerenza duelli: l'adiacenza ortogonale
  ingaggia SOLO se |Δq| ≤ 0.9 (un mob 1.2 più in basso non ti tocca — vale in
  `_mobTick` e nel check adiacenza di `_dunTick`).
- **NPC giardino** (`_npcCellFree`): giardino procedurale senza quota →
  invariato; guard nel helper per robustezza.
- **Spell** (`_spellCells`): la spell vola — ignora la quota (invariato, v1).
- **Kill-switch**: `mappai_dungeon_quota = '0'` → `DUN.quota` forzato null,
  griglia piatta come oggi. Default ON (convenzione del progetto).

### 21.5 Skin

- **Voxel** (`buildFloor`, mappai-dungeon-voxel.js:206): se `DUN.quota` presente,
  la base dei mini-voxel = quota reale della cella (jitter ridotto SOPRA la
  quota, non al suo posto); muri = quota base + altezza. Entità (eroe, mob, NPC,
  landmark, item, porte) posate a `y = quota` della loro cella; il lerp
  dell'eroe (`V.frame`, riga ~333) interpola anche la y; `jumpFx` → arco
  mezzo-seno 0.32s sulla y (identico al proto); `fallFx` → ease-down; lanterna e
  camera seguono la y dell'eroe.
- **2D (lol/fantastic)**: quota non rappresentabile in pianta. Cue minimi:
  offset sprite -4px durante `jumpFx` (saltello), nient'altro in v1. Le REGOLE
  di movimento valgono comunque (coerenza: la stessa mappa si comporta uguale
  in 2D e 3D — vincolo fondamentale §1, la griglia logica resta una).

### 21.6 Authoring e validazione

- **`validatePlan`** (contratto §4): la BFS spawn→scala/gatekeeper diventa
  quota-aware (arco = |Δq| ≤ 1.6, il salto conta come percorribile) + nuovo
  warning `slot-unreachable` per memorie/nemici isolati dal dislivello.
- **`validateWorld`** (§20): flood-fill zone quota-aware (rupe > 1.6 = confine
  fisico) + stessa BFS-con-porte.
- **Auto-slot** allo "Salva nel vault" dello Studio (BFS farthest-point):
  stessa funzione di raggiungibilità del validatore.
- **Contratto**: NESSUN campo nuovo (la `quota` c'è già dal §2). Da aggiungere
  solo la semantica di movimento (§21.2) come nota, così chi disegna sa che
  dislivello > 1.6 = barriera one-way e che le fosse senza risalita sono errore.
- **Pianta/editor**: overlay celle-trappola in anteprima = nice-to-have, fase
  successiva (Q4 opzionale).

### 21.7 Fasi (ognuna reversibile, suite verde prima di procedere)

- **Q1 — core puro**: costanti + `planToGrid` quota + `stepKindGrid` +
  `findPathQuota` + `_reachableFrom`/`worldZones` quota-aware + ~12-15 test
  (walk/jump/fall/blocked su 0.5/1.0/2.0, simmetria, blocca, path attorno a
  rupe, scala dietro rupe → unreachable, zone divise da rupe). Nessun chiamante
  nuovo: impatto solo dove la quota esiste (piani legacy → quota 0 → identico).
- **Q2 — runtime**: loader `DUN.quota`, path quota-aware, jump/fall FX state,
  mob walk-only, kill-switch, cue 2D. Testabile in Electron con
  `docs/game-design/esempi/` + un piano con rilievo.
- **Q3 — voxel**: terreno a quota reale, entità a `y=quota`, arco di salto,
  caduta, lanterna/camera. Solo estetica: la logica è già in Q2.
- **Q4 — validazione/authoring**: `quota-trap` + BFS quota-aware in
  `validatePlan`/`validateWorld`/auto-slot, nota semantica nel contratto,
  (opz.) overlay trappole nella Pianta.

### 21.8 Decisioni (fissate con l'utente il 7 luglio 2026)

- ✅ **DQ0 — discesa cappata**: la caduta da dirupi > quota salto (1.6) è
  BLOCCATA (modifica al modello del proto). Movimento simmetrico → niente
  softlock per costruzione; BFS di validazione mantenuto come rete di sicurezza.
- ✅ **DQ1 — mob territoriali**: mob walk-only SIMMETRICO (|Δq| ≤ 0.9, non
  saltano e non scendono dal proprio terrazzo). "Per intanto ok" — rivedibile.
- ✅ **DQ2 — niente danno da caduta**: confermato.
- ✅ **DQ3 — ordine fasi**: si fa tutto in sequenza Q1→Q4, nessuna inversione.

### 21.9 Stato implementazione (7 luglio 2026 — Q1..Q4 FATTE, suite 250/250)

- **Q1 core** (`mappai-dungeon-core.js`): `STEP_UP_WALK`/`STEP_UP_JUMP` esportate;
  `planToGrid` ritorna anche `quota` + `hasQuota`; `stepKindGrid` (walk/jump/fall/
  blocked); `findPathQuota` (BFS, formato path identico a rot.js); `reachableCells`
  esportata; `_reachableFrom` e il flood-fill di `worldZones` (zone + adiacenza gate)
  quota-aware; `validatePlan` nuovo warning `slot-unreachable`. +9 test in
  `tests/dungeon-quota.test.js`.
- **Q2 runtime** (`mappai-games.js`): `DUN.quota` dai due loader piano/mondo
  (`hasQuota` + kill-switch `mappai_dungeon_quota`); TUTTI gli altri loader
  (procedurale, giardino×2, radura, gate room) la azzerano; `_onDunClick` usa
  `findPathQuota` (messaggio `dg_cliff` se irraggiungibile); `_dunTick` con
  `DUN.path.wait` per-passo (jump = 320ms) + `DUN.jumpFx`/`DUN.fallFx`; guard su
  passo `blocked` (path stantio); `_mobStepOk`/`_mobEngage` (DQ1) in `_mobTick` e
  nel check adiacenza duelli; celle libere staleness filtrate per raggiungibilità;
  adiacenza gate mondo quota-aware; `_jumpBump` = saltello nelle skin 2D (lol +
  fantastic).
- **Q3 voxel** (`mappai-dungeon-voxel.js`): mini-voxel sollevati alla quota reale
  (`b.qy`), entità posate con `st.gy`, y dell'eroe in lerp + arco mezzo-seno da
  `jumpFx` (0.45 di altezza), lanterna e camera seguono la quota del terreno
  (senza il bump: la camera non rimbalza).
- **Q4 authoring**: `autoSlots` dell'editor (`tools/voxel-proto/editor.js`, bump
  cache `?v=e6-quota`) con BFS quota-aware (stessa soglia dal core); contratto §2
  (semantica quota) e §4 (BFS quota-aware + `slot-unreachable`) aggiornati.
- **Esempio per il test manuale**: `docs/game-design/esempi/piano-1-rilievo.json`
  (valle 0 / terrazza 1.8 / gradino-salto 1.2 / rampa a sud) — validato col core:
  bordo diretto `blocked`, scorciatoia `jump`, rampa `walk`, path spawn→scale ok.
- ⚠️ Il PROTO resta al modello vecchio (caduta libera): non allineato di
  proposito, è la sandbox.

**Batch fix da primo test Electron (7 luglio 2026, feedback utente):**
- **Canvas non-fullscreen** (bug vero): la skin voxel dimensionava renderer e
  frustum su `window.inner*` ma il canvas vive in `#game` → in finestra non
  massimizzata vista deformata/ingiocabile. Ora: size dal CONTENITORE +
  `ResizeObserver`.
- **WASD/frecce + SPAZIO** (nuovo input, rifinito 7/7/26 sera): movimento
  **SCREEN-RELATIVE** — W = su LO SCHERMO, non "nord della griglia". In skin 2D
  top-down schermo = griglia; nella skin voxel ISOMETRICA "su" = passo diagonale
  di griglia (es. (-1,-1)). `_screenToGrid` ricava forward/right dallo yaw REALE
  della camera (`MappAIDungeonVoxel.yaw()`) → identico alla formula del proto
  (WASD già funzionante lì), corretto anche dopo Q/E. **HOLD**: i tasti premuti
  vivono in `DUN.held`; `_keyDrive()` gira nel game-loop (`_dunTick`) → passi
  continui finché si tiene premuto (cadenza 130ms, salto 320ms), non più un
  passo per keydown. `_keyMove` rispetta §21 (salto automatico, `dg_cliff` su
  rupe), annulla il click-to-move, ingaggia mob/NPC/gate. SPAZIO = `_keyJump`.
  keyup pulisce `held`; listener rimosso alla chiusura. Guard input nei modali.
- **Zoom rotellina** (voxel): wheel su `#game` → `st.half` 4..18 (mai esistito
  nella skin voxel; il proto ce l'aveva).
- **Sprite LoL in voxel** (richiesta: parità visiva con la 2D): SHEETS ora usa
  gli STESSI PNG della skin LoL — `playerSheet<outfit>` (idle riga7 ×4, walk
  riga0 ×2, outfit da `DUN.lolOutfit`), scheletro/pipistrello per specie, boss
  guardian ×4, Sapienti = PNG distinti per variante (viola = Custode) + flip
  orizzontale dell'eroe. Frame verificati in preview col ritaglio reale.
- **NPC in movimento anche in voxel**: `V.frame` ora segue `DUN.gardenNpcs`
  (lerp posizione per-frame) — la logica si muoveva già, la skin non aggiornava.
- Diagnostica: `[piano vault] rilievo: quota ATTIVA/DISATTIVATA` in console.
- **Perché sembravano regressioni**: WASD/zoom/fisica-dislivelli esistevano nel
  PROTO (sandbox) e nell'editor, mai portati nella skin voxel dell'app (gap F2
  documentati in §19); gli sprite rogue8x8 erano una SCELTA F2 poi cambiata in
  LoL su richiesta. Il canvas era l'unico bug vero, mai emerso perché la skin
  era stata provata solo fullscreen/harness.
