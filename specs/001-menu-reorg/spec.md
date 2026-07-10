# Feature Specification: Riorganizzazione Menu — Studio Attivo e Output Materiali di Studio

**Feature Branch**: `001-menu-reorg`

**Created**: 2026-07-10

**Status**: Draft

**Input**: User description: "Riorganizzazione dei menu (UI/UX) per l'uso in classe. Due interventi: (1) spostare nel menu 'Studio Attivo' le funzioni operative Cloze, Heat map e Mappa lavoro (quella con i nodi in gradienti bianco→blu); (2) creare un raggruppamento 'Output Materiali di Studio' che riunisce le funzioni di generazione di materiali: Stampa Label, Sintesi Mappa/Rami, Stampa Dossier, Jigsaw (generazione vault per gruppi). La mappa e le funzioni esistenti non cambiano comportamento: cambia solo dove si trovano nei menu. Fonte: 'Appunti Implementazione MappAI.md' §2."

## Contesto attuale (rilevato)

Oggi le sette funzioni interessate sono raggiunte così:

| Funzione (nome documento) | Nome attuale nell'app | Posizione attuale |
|---|---|---|
| Cloze | 📝 bottone flottante | Colonna flottante bordo destro, in basso |
| Heat map | 🎯 "Mostra padronanza sul grafo" | Colonna flottante bordo destro |
| Mappa lavoro (bianco→blu) | 🔥 "Mostra il lavoro svolto sul grafo" | Colonna flottante bordo destro, in alto |
| Stampa Label | "Foglio nodi" (forbici) | Menu azioni rapide (basso-sinistra), mescolato a import/vault |
| Sintesi Mappa/Rami | "Sintesi di ramo (AI)" | Menu azioni rapide |
| Stampa Dossier | "Stampa dossier" | Menu azioni rapide |
| Jigsaw | "Esporta JIGSAW" + "Ricomponi copie" + "Revisione lacune" | Menu azioni rapide |

Il punto d'ingresso "Studio attivo" esiste già: voce del menu azioni rapide che apre
il launcher con le 7 modalità di studio (card).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Docente trova le attività di studio in un posto solo (Priority: P1)

Un docente in classe apre il launcher "Studio attivo" e vi trova, oltre alle 7
modalità esistenti, anche Cloze, la vista Heat map (padronanza) e la vista
Mappa lavoro. I tre bottoni flottanti sparsi sul bordo destro del canvas per
queste tre funzioni non ci sono più: la colonna destra è più pulita e la LIM
mostra meno elementi che distraggono gli studenti.

**Why this priority**: è il cuore della richiesta — le funzioni operative di
studio devono stare sotto un unico punto d'ingresso pensato per l'uso in classe.
Riduce il carico visivo sul canvas (principio accessibilità).

**Independent Test**: aprire una mappa, aprire il launcher Studio attivo,
verificare presenza e funzionamento di Cloze, Heat map, Mappa lavoro dal
launcher; verificare assenza dei tre bottoni flottanti corrispondenti.

**Acceptance Scenarios**:

1. **Given** una mappa aperta, **When** il docente apre il launcher "Studio attivo", **Then** il launcher espone anche Cloze, Heat map (padronanza) e Mappa lavoro, distinguendo le attività di sessione (Cloze) dalle viste attivabili/disattivabili (Heat map, Mappa lavoro)
2. **Given** il launcher aperto, **When** l'utente avvia Cloze, **Then** l'esercizio Cloze parte identico a prima (stesso comportamento, stessi punteggi)
3. **Given** il launcher aperto, **When** l'utente attiva la vista Heat map o Mappa lavoro, **Then** il grafo si tinge come oggi e la vista si può disattivare dallo stesso punto
4. **Given** una mappa aperta, **When** l'utente guarda il bordo destro del canvas, **Then** i tre bottoni flottanti 📝/🎯/🔥 non sono più presenti
5. **Given** una vista Heat map attiva, **When** l'utente attiva Mappa lavoro, **Then** vale la regola attuale di mutua esclusione (una vista alla volta)

---

### User Story 2 - Docente genera materiali di studio da un gruppo dedicato (Priority: P2)

Un docente che vuole produrre materiali per la classe (foglio nodi da ritagliare,
sintesi, dossier PDF, copie Jigsaw per gruppi) apre il menu azioni rapide e trova
un raggruppamento visivamente distinto "Output Materiali di Studio" con tutte e
quattro le famiglie di funzioni, separate dalle azioni di file/vault (import,
export, unisci).

**Why this priority**: migliora la scopribilità ma le funzioni sono già tutte nel
menu; è un riordino dentro lo stesso menu, valore leggermente inferiore alla US1.

**Independent Test**: aprire il menu azioni rapide e verificare che le voci
Foglio nodi, Sintesi, Stampa dossier e le tre voci Jigsaw compaiano sotto
un'intestazione/sezione "Output Materiali di Studio", e che ciascuna apra il
suo modale identico a prima.

**Acceptance Scenarios**:

1. **Given** una mappa aperta, **When** l'utente apre il menu azioni rapide, **Then** esiste una sezione riconoscibile "Output Materiali di Studio" contenente: Foglio nodi (Stampa Label), Sintesi di ramo, Stampa dossier, e le voci Jigsaw (Esporta / Ricomponi / Revisione lacune)
2. **Given** la sezione visibile, **When** l'utente clicca una qualunque voce, **Then** si apre lo stesso modale/flusso di oggi senza differenze di comportamento
3. **Given** il menu aperto, **When** l'utente cerca le azioni file/vault (Importa JSON, Esporta Vault, Unisci mappe…), **Then** restano disponibili ma visivamente separate dalla sezione output

---

### User Story 3 - Utente in lingua inglese vede i menu coerenti (Priority: P3)

Un utente con interfaccia in inglese vede le nuove etichette di sezione e le voci
spostate correttamente tradotte; tornando all'italiano tutte le etichette
ripristinano il testo italiano.

**Why this priority**: obbligo di coerenza bilingue del progetto; piccolo ma
bloccante per considerare finita la feature.

**Independent Test**: switch lingua EN → verifica etichette → switch IT →
verifica ripristino.

**Acceptance Scenarios**:

1. **Given** l'interfaccia in inglese, **When** l'utente apre il launcher Studio attivo e il menu azioni rapide, **Then** tutte le voci nuove/spostate sono in inglese
2. **Given** l'interfaccia in inglese, **When** l'utente torna all'italiano, **Then** tutte le etichette tornano in italiano (nessuna resta in inglese)

---

### Edge Cases

- Mappa senza dati di padronanza/lavoro (mai studiata): Heat map e Mappa lavoro
  attivate dal launcher mostrano lo stato "tutto neutro" come oggi, senza errori.
- Modalità studente (studentMode) attiva: le voci spostate rispettano la stessa
  visibilità che avevano prima dello spostamento.
- Sessione di Studio Attivo in corso: le viste Heat map / Mappa lavoro non devono
  interferire (regola attuale: le viste non si applicano durante una sessione
  attiva — comportamento da preservare).
- Knowledge Graph (modalità KG): le funzioni che oggi hanno comportamenti
  specifici o limitati su KG mantengono le stesse regole di visibilità.
- Utenti abituati ai bottoni flottanti: la prima volta dopo l'aggiornamento
  potrebbero cercarli; il launcher resta raggiungibile dallo stesso bottone
  "Studio attivo" già esistente.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Il launcher "Studio attivo" DEVE esporre punti di avvio per Cloze,
  Heat map (padronanza) e Mappa lavoro (lavoro svolto), oltre alle modalità
  esistenti.
- **FR-002**: I tre bottoni flottanti dedicati a Cloze, Heat map e Mappa lavoro
  NON DEVONO più comparire sul canvas.
- **FR-003**: Il comportamento delle tre funzioni spostate DEVE restare identico
  (stessi flussi, stessi punteggi, stessa mutua esclusione tra viste, stessa
  regola di non-interferenza con le sessioni di studio attive).
- **FR-004**: Il menu azioni rapide DEVE presentare una sezione denominata
  "Output Materiali di Studio" che raggruppa: Foglio nodi (Stampa Label),
  Sintesi di ramo, Stampa dossier, e le tre voci Jigsaw.
- **FR-005**: La sezione output DEVE essere visivamente separata dalle azioni
  file/vault (che restano nel menu).
- **FR-006**: Nessuna funzione raggruppata DEVE cambiare comportamento: solo la
  collocazione nel menu cambia.
- **FR-007**: Tutte le etichette nuove o spostate DEVONO esistere in entrambe le
  lingue dell'interfaccia (italiano e inglese) e lo switch di lingua DEVE
  ripristinarle correttamente in entrambe le direzioni.
- **FR-008**: Le regole di visibilità esistenti per modalità (MindMap/KG) e per
  modalità studente DEVONO essere preservate per ogni voce spostata.
- **FR-009**: Lo spostamento DEVE essere reversibile: in caso di problemi deve
  essere possibile ripristinare la disposizione precedente senza perdita di dati
  (nessun dato utente è coinvolto).

### Key Entities

Nessuna entità dati: la feature riorganizza soli punti d'ingresso UI. Nessun
formato di salvataggio, vault o mappa viene toccato.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Un docente che non conosce la nuova disposizione trova e avvia
  Cloze dal launcher Studio attivo in meno di 30 secondi.
- **SC-002**: Il numero di bottoni flottanti sul bordo destro del canvas
  diminuisce di 3 (i tre spostati) senza perdita di funzioni raggiungibili.
- **SC-003**: Il 100% delle sette funzioni interessate apre lo stesso flusso di
  prima (verifica per confronto diretto prima/dopo).
- **SC-004**: Lo switch lingua IT↔EN non lascia alcuna etichetta non tradotta
  nei due menu interessati (0 chiavi mancanti).

## Assumptions

- "Heat map" nel documento = vista padronanza (nodi grigio/ambra/verde);
  "Mappa lavoro (gradienti bianco→blu)" = vista lavoro svolto (tinta indaco
  proporzionale all'effort). Confermato dal confronto con l'app.
- "Stampa Label" = funzione "Foglio nodi" (stampa etichette con forbici).
- "Sintesi Mappa/Rami" = l'attuale "Sintesi di ramo (AI)"; l'estensione della
  sintesi all'intera mappa è un'altra feature (Appunti §3) e NON fa parte di
  questo riordino.
- "Jigsaw" comprende tutte e tre le voci correlate (Esporta copie, Ricomponi,
  Revisione lacune): si spostano insieme come famiglia.
- Le tre funzioni spostate nel launcher restano accessibili anche a chi usa la
  tastiera/screen reader almeno quanto lo erano prima.
- Gli altri bottoni flottanti del bordo destro (celeration, percorso di studio,
  palazzo, giochi) NON fanno parte di questa feature e non si toccano.
- Non serve migrazione dati né onboarding dedicato: la voce "Studio attivo" nel
  menu azioni rapide esiste già ed è il punto d'ingresso naturale.

## Addendum 2026-07-10 — Estensione richiesta dall'utente

Dopo la prima consegna, tre interventi aggiuntivi (stessa filosofia: riordino
punti d'ingresso, zero cambi di comportamento):

### User Story 4 - Tutti gli strumenti di studio nel launcher (Priority: P1)

Anche "Cosa studiare ora" (percorso di studio 🧭), "Palazzo della Memoria" (🏛️)
e "I tuoi progressi nel tempo" (celeration 📈) escono dalla colonna flottante
ed entrano nel launcher Studio attivo, in una terza sezione "Strumenti".
Il launcher diventa un modale **landscape** (due colonne): a sinistra le
modalità di studio, a destra "Viste ed esercizi rapidi" + "Strumenti".
Su finestre strette le colonne si impilano.

**Acceptance**: le 3 funzioni si avviano dal launcher identiche a prima; i loro
flottanti non compaiono più (tornano col flag legacy alle posizioni storiche).

### Rimozione bottone Memory Dungeon

Il flottante 🎮 sparisce dalla UI di default (ingresso futuro: hub Knowledge
Garden). Con `mappai_legacy_float_btns='1'` torna alla posizione storica.
Resta invariata la voce "Importa piano Dungeon" nel menu azioni rapide.

### Bottone Knowledge Garden nel menu azioni rapide

Nuova voce "Knowledge Garden" (icona sprout) sotto "Studio attivo": apre l'hub
dedicato a creazione/condivisione/esplorazione dei giardini (attività grafiche
interdisciplinari, in sviluppo su altro filone). Contratto: l'hub espone
`window.openKnowledgeGardenHub()`; finché assente, il bottone mostra un toast
informativo ("in arrivo"). Etichette bilingui.

**Effetto netto**: colonna flottante destra VUOTA di default — tutto vive nel
launcher Studio attivo o nel menu azioni rapide.
