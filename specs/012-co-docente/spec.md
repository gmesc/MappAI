# Feature Specification: Co-docente AI

**Feature Branch**: `012-co-docente`

**Created**: 2026-07-21

**Status**: Draft (documento ombrello — visione + primo layer)

**Input**: User description: "Co-docente AI — assistente di analisi e arricchimento del materiale didattico dentro MappAI. UI split-screen per lavorare su analisi contenuti (nessi logici, densità, gap, copertura) e co-costruire il miglioramento delle schede."

---

## Visione e principi *(governano tutte le user story)*

MappAI oggi è **transazionale** (incolla PDF → mappa → fine). Il co-docente lo rende **relazionale**: l'ambiente dove il docente analizza e MIGLIORA le proprie schede didattiche nel tempo. Serve tre obiettivi: (a) migrazione verso una didattica migliore, (b) AI fluency sviluppata attraverso l'uso, (c) domanda continuativa degli abbonati.

**Quattro principi NON negoziabili** — ogni user story e ogni scelta di UI vi si conforma:

1. **Descrittivo, MAI giudicante.** Nessun voto/punteggio del materiale. Si descrive il profilo ("questa scheda è definizionale"), non si pagella il docente. Nessuna percentuale come prova ("forse manca X, controlla", non "copertura 31%").
2. **Advisory, MAI gate.** Nessun blocco di generazione o salvataggio. Card in un pannello che il docente approva / modifica / ignora. *Strumento propone, docente dispone.*
3. **Anti-fabbricazione.** La FONTE è ground truth. I suggerimenti mostrano la frase-fonte VERBATIM. "+Aggiungi" inserisce la **citazione letterale** scelta dal docente, mai testo AI generato di nascosto. È l'opposto dell'attuale `enrichThinDescs` (riscrittura silenziosa della desc — da NON imitare).
4. **Equilibrio attrito / fluency.** Default frictionless (agire su un suggerimento a un clic), ma il ragionamento (frase-fonte, verdetto) è sempre a un colpo d'occhio. L'accetta/rifiuta È l'interazione che costruisce AI fluency (il docente calibra la fiducia facendo). La fluency è disponibile, non forzata.

Allineamento constitution: I (Accessibilità BES/DSA), II (Reversibilità/gradualità — ogni layer flag-gated), III (script globali), IV (dual-provider), VI (logica pura testata — il motore di analisi è deterministico e testabile in Node).

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Tab ELABORA: analisi + arricchimento copertura-fonte (Priority: P1)

Il co-docente vive in un **tab ELABORA**, terza modalità della landing tra **COSTRUISCI** e **INSEGNA**. Vi si accede SOLO dopo aver generato una mappa (lavora sull'artefatto, dove esistono nodi + fonte). ELABORA mostra uno **split-screen**: a sinistra il materiale/fonte, a destra il **profilo descrittivo** del contenuto (segnali deterministici — nessi logici, densità, ridondanza, ancoraggio — ognuno con un'azione) inclusi i **feedback del triage** (il verdetto strutturale reso visibile), e le **card di arricchimento** che citano la frase-fonte verbatim non ancora rappresentata nella scheda. Con un clic il docente aggiunge la citazione a un nodo, oppure ignora.

**Meccanismo di chiusura gap senza fabbricazione**: in ELABORA il docente può **inserire nuovi testi/PDF**. Questi vengono aggiunti al corpus-fonte e l'analisi ricalcola il residuo → nascono nuove card che citano VERBATIM dal materiale aggiunto. Il docente chiude i gap fornendo materiale REALE, non chiedendo all'AI di inventare: la fonte (ora arricchita) resta il giudice.

Nessuna AI nella rilevazione; nessun voto; nessuna modifica automatica del contenuto.

**Why this priority**: È l'MVP e il cuore del valore. Deterministico → sicuro, offline, funziona su vault riaperti con fonte. Dimostra la tesi "co-docente" senza rischio: nessuna generazione, nessuna mutazione silenziosa. Consegna da solo un prodotto utile (il docente vede cosa manca e lo aggiunge come citazione verificata).

**Independent Test**: aprire il co-docente su una mappa reale con fonte sottile → verificare che (1) il profilo mostri i segnali con azioni, (2) le card mostrino frasi-fonte verbatim con conteggio di parole nuove, (3) "+Aggiungi" inserisca la citazione letterale (undoable) e nient'altro, (4) su scheda ricca compaia uno stato "nulla da arricchire" positivo.

**Acceptance Scenarios**:

1. **Given** una mappa con un nodo povero (desc breve, poco ancorata) e la fonte disponibile, **When** il docente apre il co-docente, **Then** compare una card che cita ≥1 frase-fonte verbatim on-topic col nodo ma con lessico nuovo, col numero di parole nuove che porta.
2. **Given** una card di arricchimento, **When** il docente preme "+Aggiungi", **Then** la citazione VERBATIM selezionata è appesa alla desc del nodo (un nodo, un'azione, annullabile) e NESSUN testo AI viene inserito.
3. **Given** una scheda già ricca e ben coperta, **When** il docente apre il co-docente, **Then** vede uno stato vuoto valorizzante ("materiale ben coperto"), nessuna card inventata.
4. **Given** un vault riaperto SENZA fonte (<200 caratteri di corpus), **When** il docente apre il co-docente, **Then** l'analisi degrada con grazia (profilo strutturale disponibile, nessuna card di residuo, messaggio chiaro), mai suggerimenti fabbricati.
5. **Given** il pannello di analisi, **When** il docente guarda un segnale (es. "3 nessi causali, pochi per un testo di processo"), **Then** il segnale ha un'azione attaccata (mai un numero decorativo).
6. **Given** un gap di copertura, **When** il docente inserisce un nuovo testo o PDF in ELABORA, **Then** il corpus si arricchisce, l'analisi ricalcola, e le nuove card citano VERBATIM dal materiale aggiunto (nessun testo inventato dall'AI).
7. **Given** la landing, **When** il docente non ha ancora generato una mappa, **Then** il tab ELABORA è inaccessibile/disabilitato con un invito chiaro a generare prima una mappa.

---

### User Story 2 - Riformula con AI (opzionale) (Priority: P2)

Su una card di arricchimento, oltre a "+Aggiungi la citazione", il docente può chiedere "✨ Riformula": l'AI riscrive **solo le frasi-residuo mostrate** (prompt vincolato alla frase-fonte a vista), il docente rivede prima di applicare.

**Why this priority**: polish che riduce l'attrito per chi vuole prosa integrata invece della citazione grezza, senza rompere l'anti-fabbricazione (l'AI riformula ground-truth visibile, non inventa). Vive sopra US1.

**Independent Test**: su una card, "Riformula" produce un testo derivato SOLO dalle frasi mostrate; il docente lo vede prima dell'apply; disattivando il flag la CTA sparisce e US1 resta intatta.

**Acceptance Scenarios**:

1. **Given** una card col residuo-fonte visibile, **When** il docente preme "Riformula", **Then** l'AI restituisce una riformulazione ancorata a quelle frasi (nessun contenuto nuovo) mostrata per revisione prima dell'inserimento.
2. **Given** il provider Infomaniak attivo, **When** parte la riformulazione, **Then** il payload rispetta i vincoli dual-provider (nessun `responseMimeType`).

---

### User Story 3 - Domande co-generate per ramo (Priority: P2)

Il co-docente propone domande/quiz per ramo; il docente approva o modifica ogni domanda; il set curato viene salvato. Stesso pattern advisory delle card.

**Why this priority**: estende il co-docente dall'arricchimento della scheda alla co-costruzione della valutazione, riusa il motore quiz esistente, e produce asset che si accumulano (retention). Indipendente da US1/US2.

**Independent Test**: su un ramo, il co-docente propone N domande; il docente ne modifica una e ne scarta una'altra; il set salvato contiene solo quelle approvate/modificate.

**Acceptance Scenarios**:

1. **Given** un ramo della mappa, **When** il docente chiede le domande, **Then** compaiono proposte modificabili una per una (approva / modifica / scarta).
2. **Given** domande approvate, **When** il docente salva, **Then** nasce un set di studio curato riutilizzabile (e riusabile in MappAI Live).

---

### User Story 4 - Tag competenza + lente curricolare (Piano di studio ticinese) (Priority: P3)

La mappa viene **etichettata descrittivamente** con le competenze del Piano di studio ticinese che tocca ("questa mappa lavora su STO.III.4"), utile per la programmazione ufficiale del docente. In generazione, il docente può scegliere un traguardo come **lente** (teacher-declared) per orientare la mappa a servirlo.

**Why this priority**: dà al docente il vocabolario burocratico che deve usare comunque, e un aggancio curricolare unico (ticinese). Descrittivo (tag) o dichiarato dal docente (lente) → mai gap-checker prescrittivo contro le competenze. Indipendente dai layer precedenti; richiede la tassonomia già estratta.

**Independent Test**: su una mappa di storia, il tag mostra i codici STO plausibili come suggerimento descrittivo che il docente conferma/rimuove; la lente, se scelta in generazione, appare nel prompt come focus dichiarato.

**Acceptance Scenarios**:

1. **Given** una mappa di una disciplina coperta dalla tassonomia, **When** il docente apre il tag competenza, **Then** vede una proposta descrittiva di codici pertinenti che può confermare o togliere (mai imposta, mai "ti manca").
2. **Given** il flusso di generazione, **When** il docente seleziona un traguardo come lente, **Then** la generazione lo tratta come focus dichiarato dal docente.

---

### User Story 5 - Loop col dato-studente (Priority: P3)

Il co-docente unisce i **gap della scheda** con i **risultati Live/quiz** già raccolti: dove gli studenti hanno sbagliato E la scheda era sottile, propone l'arricchimento mirato ("i tuoi studenti hanno faticato sul ramo X; la fonte dice ancora «…» — vuoi arricchire e rigenerare?").

**Why this priority**: è il pezzo difendibile (nessun concorrente generico ha la classe dentro) e chiude il ciclo qualità-materiale → esito-apprendimento → miglioramento. Ultimo perché richiede i layer precedenti solidi e dati di sessione reali.

**Independent Test**: con risultati di una sessione Live e una mappa, il co-docente evidenzia i rami a bassa performance che coincidono con nodi poco ancorati, e offre l'arricchimento su quelli.

**Acceptance Scenarios**:

1. **Given** risultati Live per una mappa, **When** il docente apre il loop dato-studente, **Then** i rami con performance debole E scheda sottile sono evidenziati con la relativa card di arricchimento copertura-fonte.
2. **Given** un ramo evidenziato, **When** il docente arricchisce e rigenera, **Then** l'azione riusa il loop copertura-fonte (US1), senza fabbricazione.

---

### Edge Cases

- **Fonte assente/troppo corta** (vault riaperto, corpus <200 char): niente card di residuo; il profilo strutturale resta; messaggio esplicito; mai suggerimenti fabbricati.
- **Cecità lessicale** (sinonimi/parafrasi): un "gap" può essere falso (contenuto presente ma riformulato). Mitigazione: framing da triage, `isNearDuplicate` sul lato opposto (non suggerire ciò che c'è già riformulato), upgrade embedding opzionale off di default.
- **Fabbricazione di struttura** (coppia di gruppi "orfani" spuria da co-occorrenza lessicale — il caso "martello di legno papiro↔magli" documentato): advisory only + evidenza-fonte a vista + mai auto-insert.
- **KG vs MindMap**: i segnali di residuo/groundedness sono mode-agnostici; le card STRUTTURALI su KG poggiano su comunità stimate dall'LLM → vanno etichettate come tali ("comunità stimate dal modello").
- **Scheda ricca**: nessuna card → stato vuoto valorizzante, non un pannello vuoto ambiguo.
- **Docente rifiuta molti suggerimenti**: nessuna penalità, nessun re-prompt insistente; i rifiutati non ricompaiono nella stessa sessione.

## Requirements *(mandatory)*

### Functional Requirements

**Principi trasversali**

- **FR-001**: Il sistema DEVE presentare ogni analisi in forma DESCRITTIVA (profilo del materiale), MAI come voto/punteggio/pagella del docente o del suo materiale.
- **FR-002**: Il sistema DEVE essere advisory: nessuna azione del co-docente può bloccare generazione o salvataggio; ogni suggerimento è approvabile/modificabile/ignorabile dal docente.
- **FR-003**: Ogni suggerimento di contenuto DEVE mostrare la frase-fonte VERBATIM come evidenza; l'inserimento tramite "+Aggiungi" DEVE inserire la citazione letterale scelta, mai testo AI generato senza revisione.
- **FR-004**: Il sistema NON DEVE mai mutare il contenuto dei nodi automaticamente/in batch (distinto ed esplicitamente opposto a `enrichThinDescs`). Ogni modifica è per-nodo, esplicita, annullabile.
- **FR-005**: Ogni segnale mostrato nel pannello DEVE avere un'azione o un'interpretazione azionabile attaccata; metriche puramente decorative sono vietate.

**Ambiente / UI**

- **FR-006**: Il sistema DEVE offrire una vista split-screen: materiale/fonte da un lato, analisi + suggerimenti dall'altro, come ambiente di lavoro sul contenuto.
- **FR-007**: Il co-docente DEVE vivere in un tab **ELABORA**, terza modalità della landing tra COSTRUISCI e INSEGNA, accessibile SOLO dopo aver generato una mappa. Mai nella "Modalità Studente".
- **FR-008**: Lo stato "nulla da arricchire" (scheda ricca) DEVE essere un messaggio valorizzante, non un pannello vuoto.
- **FR-008b**: ELABORA DEVE mostrare i feedback del triage (verdetto strutturale reso visibile al docente).
- **FR-008c**: In ELABORA il docente DEVE poter inserire nuovi testi/PDF che si aggiungono al corpus-fonte; l'analisi DEVE ricalcolare il residuo sul corpus arricchito e le nuove card DEVONO citare verbatim dal materiale aggiunto (chiusura gap con materiale reale, mai testo AI inventato).

**Analisi contenuto (deterministica)**

- **FR-009**: Il sistema DEVE calcolare, senza AI, un profilo del materiale che includa almeno: densità e tipo di nessi logici (causale/temporale/avversativo/condizionale/esemplificativo), densità concettuale, rapporto esempio↔astrazione, ridondanza (trattata come possibile salienza), e ancoraggio (groundedness) dei nodi rispetto alla fonte.
- **FR-010**: Il sistema DEVE evidenziare i gap strutturali del grafo (ponti/snodi già disponibili; coppie di gruppi ad alta potenzialità e bassa connessione) come suggerimenti advisory.
- **FR-011**: La rilevazione DEVE funzionare su vault riaperti con fonte e degradare con grazia se la fonte manca.

**Loop di arricchimento copertura-fonte**

- **FR-012**: Il sistema DEVE identificare i nodi poveri e, per ciascuno, proporre le frasi-fonte on-topic ma con lessico non ancora presente nella scheda (residuo), con il conteggio di parole nuove.
- **FR-013**: Il sistema NON DEVE proporre come "mancante" contenuto già presente nella scheda in forma riformulata (controllo anti-duplicato).

**Riformula AI (opzionale)**

- **FR-014**: Quando attivata, la riformulazione AI DEVE riscrivere SOLO le frasi-residuo mostrate, con revisione del docente prima dell'applicazione, e rispettare i vincoli dual-provider.

**Domande co-generate**

- **FR-015**: Il sistema DEVE proporre domande per ramo che il docente approva/modifica/scarta prima del salvataggio in un set curato riutilizzabile.

**Curricolo**

- **FR-016**: Il sistema DEVE poter etichettare descrittivamente la mappa con competenze del Piano di studio ticinese (proposta confermabile/rimovibile, mai imposta) e permettere al docente di scegliere un traguardo come lente di generazione.
- **FR-017**: Il sistema NON DEVE usare le competenze come gap-checker prescrittivo ("ti manca la competenza X").

**Dato-studente**

- **FR-018**: Il sistema DEVE poter incrociare i risultati di sessione (Live/quiz) con i gap della scheda per evidenziare i rami a performance debole e scheda sottile, offrendo l'arricchimento copertura-fonte su quelli.

**Reversibilità**

- **FR-019**: Ogni layer DEVE essere attivabile/disattivabile indipendentemente (flag), con default che lascia il comportamento attuale invariato.

### Key Entities

- **Profilo del materiale**: descrizione non giudicante del contenuto (segnali deterministici + interpretazione azionabile). Non un voto.
- **Card di suggerimento**: {tipo (residuo-fonte | gap-strutturale | struttura-testo), evidenza (frase-fonte verbatim), azione (Aggiungi citazione | Riformula | Ignora), severità}. La evidenza-fonte è obbligatoria per i suggerimenti di contenuto.
- **Tag competenza**: associazione descrittiva mappa ↔ codice competenza del Piano di studio ticinese, confermata dal docente.
- **Set di domande curato**: domande proposte dal co-docente e approvate/modificate dal docente, riutilizzabile.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Il 100% dei suggerimenti di contenuto mostra una frase-fonte verbatim verificabile nella fonte (zero suggerimenti non ancorati alla fonte).
- **SC-002**: Zero modifiche al contenuto dei nodi avvengono senza un'azione esplicita del docente (nessuna mutazione silenziosa).
- **SC-003**: Su una scheda sottile, il docente identifica e agisce su un suggerimento pertinente in meno di 1 minuto dall'apertura del co-docente.
- **SC-004**: Su una scheda ricca e ben coperta, il co-docente non produce card fabbricate (stato vuoto valorizzante).
- **SC-005**: Ogni metrica mostrata nel pannello è accompagnata da un'azione o interpretazione (zero numeri decorativi in audit UI).
- **SC-006**: Disattivando tutti i flag del co-docente, il comportamento dell'app è identico a prima della feature (reversibilità verificabile).
- **SC-007**: Nessun docente riceve un output che valuta/pagella il suo materiale (audit di tono su tutte le stringhe: descrittive, mai giudicanti).

## Assumptions

- **Motore riusato, non riscritto**: la rilevazione deterministica compone moduli già esistenti (residuo dalla fonte + groundedness + analisi strutturale con ponti/snodi già implementati). Il co-docente non introduce un nuovo motore di analisi da zero né dipendenze pesanti nuove. Community detection e embeddings restano opzionali e disattivati di default.
- **Sink advisory riusato**: esiste già un pannello suggerimenti con severità; il co-docente lo riusa, spostandone il montaggio dal contesto studente al contesto docente.
- **Tassonomia disponibile**: le competenze del Piano di studio ticinese sono già estratte in `public/data/piano-studio-ticino.json` (287 competenze, 17 discipline). I traguardi SPECIFICI di apprendimento non sono nel documento sorgente (portale esterno) → il tag/lente lavora sui traguardi di COMPETENZA.
- **Timing = post-generazione (RISOLTO)**: l'MVP (US1 = tab ELABORA) lavora sulla MAPPA generata, dove esistono nodi + fonte da confrontare (residuo vs desc). Il "prima della generazione" (una fase "Architetta" di sola diagnosi della scheda grezza — descrittiva, mai generativa) resta una feature successiva e separata; ELABORA copre il "dopo". La chiusura dei gap avviene aggiungendo materiale-fonte reale (testi/PDF), non riscrivendo a priori.
- **Mount-point = tab ELABORA (RISOLTO)**: terza modalità della landing tra COSTRUISCI e INSEGNA, accessibile solo dopo aver generato una mappa. Non nella Modalità Studente (dove oggi vive il pannello suggerimenti, da rimontare in ELABORA).
- **Ogni layer è un binario separato**, flag-gated, con ordine di build: motore puro → pannello split-screen + card copertura-fonte (US1) → riformula AI (US2) → domande co-generate (US3) → tag/lente competenza (US4) → loop dato-studente (US5).
- **Copertura-FONTE ≠ copertura-CURRICOLO**: due binari distinti. Il loop di arricchimento (US1) è copertura-fonte (deterministica, in casa). Il curricolo (US4) è LLM-fuzzy per natura e non raggiunge lo stesso livello di fiducia; per questo resta descrittivo/dichiarato, mai prescrittivo.
- **Target**: docenti di Scuola Media ticinese, focus BES/DSA e OPI; l'autore è ex-insegnante → sensibilità massima al non far sentire giudicato il docente (guida FR-001, FR-007, SC-007).
