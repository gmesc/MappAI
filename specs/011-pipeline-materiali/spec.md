# Feature Specification: Pipeline «Genera materiali»

**Feature Branch**: `011-pipeline-materiali`

**Created**: 2026-07-20

**Status**: Draft

**Input**: User description: "Dalla fonte caricata + classe assegnata, MappAI genera in un colpo solo mappa + tutti i materiali di studio (quiz V/F-MC-flashcard, fogli nodi, sintesi con voce naturale), a step successivi crash-safe, e li archivia nel vault dentro una cartella di classe. Nel tab Insegna, selezionando una mappa, le sezioni materiali mostrano solo gli item di quella mappa."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Generare mappa + materiali in un colpo solo (Priority: P1)

Il docente carica una fonte (PDF, testo, URL), sceglie la classe destinataria, clicca «Genera materiali» e configura in un modale a tutto schermo cosa vuole ottenere: quiz (V/F, scelta multipla, flashcard — con numero di domande per ramo e angolo delle domande), fogli nodi (livello massimo, formato pagina, uno o più modi di contenuto), sintesi della mappa intera con voce naturale. Avvia la generazione e, al termine, trova TUTTO già salvato nella cartella della mappa (vault), dentro una cartella intestata alla classe: la mappa apribile, i quiz riutilizzabili in app E stampabili in PDF, i fogli nodi in PDF, la sintesi con il file audio.

**Why this priority**: è il cuore della feature — trasforma N flussi manuali separati (genera mappa → salva vault → apri quiz → apri foglio nodi → apri sintesi → genera audio → scarica tutto a mano) in un unico gesto. Da solo costituisce l'MVP.

**Independent Test**: caricare una fonte, scegliere una classe, selezionare quiz MC (3 per ramo) + foglio nodi (titolo, 2x2) + sintesi con voce, avviare, e verificare che al termine la cartella di classe contenga il vault della mappa con dentro tutti i file elencati nel riepilogo.

**Acceptance Scenarios**:

1. **Given** una fonte caricata e una classe attiva, **When** il docente clicca «Genera materiali», **Then** si apre il modale a tutto schermo con la classe destinataria evidenziata, le sezioni di output selezionabili con le rispettive sotto-opzioni, e la stima preventiva delle chiamate AI.
2. **Given** il modale configurato (quiz MC 3/ramo con angolo Automatico + foglio nodi «parole chiave» 2x2 + sintesi con voce), **When** il docente clicca «Avvia generazione», **Then** la pipeline esegue in ordine: (A) generazione mappa e salvataggio immediato del vault nella cartella di classe, (B) quiz per ogni ramo, (C) fogli nodi, (D) sintesi + audio — mostrando l'avanzamento per step.
3. **Given** una pipeline completata, **When** il docente apre la cartella del vault, **Then** trova la mappa, i PDF dei quiz stampabili, i PDF dei fogli nodi, la sintesi e il file audio, ognuno con nome parlante; i quiz sono anche riutilizzabili in app (Set di Studio) e in MappAI Live.
4. **Given** il provider attivo è Infomaniak e nessuna chiave Google configurata, **When** il docente seleziona la sintesi con voce, **Then** PRIMA di avviare viene avvisato che l'audio non è disponibile e la sintesi degrada a solo testo (la pipeline non si blocca a metà per questo).
5. **Given** una classe con nick sede «Bellinzona» nel profilo insegnante, **When** la pipeline salva il vault, **Then** la cartella di classe si chiama «Bellinzona-2a A»; senza nick sede si chiama «2a A»; la cartella viene creata automaticamente se non esiste.
6. **Given** una mappa con lo stesso nome già presente nella cartella di classe, **When** la pipeline salva il vault, **Then** il nuovo vault riceve un suffisso progressivo numerico senza toccare quello esistente.
7. **Given** la taratura VERDE attivata nel modale, **When** la pipeline genera i materiali, **Then** i materiali sono adattati al profilo della classe e i file portano il marcatore [VERDE] nel nome; la mappa resta standard salvo il toggle «Adatta al livello».

---

### User Story 2 - Non perdere mai il materiale generato (Priority: P1)

Se qualcosa si inceppa a metà (errore AI, crash dell'app, chiusura accidentale), il docente non perde nulla di ciò che è già stato prodotto: ogni step scrive i suoi file su disco appena finiti, e alla riapertura la pipeline riprende dal punto esatto, saltando gli step già completati. Nel riepilogo finale ogni step fallito ha un bottone «Riprova» che rilancia solo quello.

**Why this priority**: requisito centrale dichiarato dall'utente («la pipeline deve lavorare a step successivi per evitare che qualcosa si inceppi e si perda parte del materiale»). Una pipeline lunga con AI reale fallisce prima o poi: senza questa storia la feature è inaffidabile in classe.

**Independent Test**: avviare una pipeline completa, chiudere forzatamente l'app durante lo step C, riaprire, riprendere la pipeline e verificare che A e B non vengano rigenerati (zero nuove chiamate AI per quegli step) e che C e D completino.

**Acceptance Scenarios**:

1. **Given** una pipeline in esecuzione, **When** lo step B termina, **Then** i file dei quiz sono già scritti su disco nel vault e lo stato dello step è registrato nel manifest della pipeline PRIMA che inizi lo step C.
2. **Given** un'app chiusa a metà pipeline, **When** il docente riapre il progetto, **Then** gli viene proposto di riprendere la pipeline dal punto in cui era; gli step già completati vengono saltati.
3. **Given** uno step fallito (es. sintesi), **When** la pipeline termina, **Then** il riepilogo mostra lo stato per step (completato / fallito / saltato) e un bottone «Riprova» sul singolo step fallito; gli output degli step riusciti restano intatti.
4. **Given** una generazione mappa che produce dati incompleti senza errore esplicito, **When** lo step A termina, **Then** la pipeline valida il risultato (presenza di nodi sufficienti) e marca lo step come fallito invece di proseguire con una mappa vuota.
5. **Given** gli step B, C e D, **When** uno di essi fallisce, **Then** gli altri due vengono comunque eseguiti (dipendono solo dalla mappa, non l'uno dall'altro).

---

### User Story 3 - Preset riusabili delle opzioni di output (Priority: P2)

Il docente che ha trovato la sua configurazione ideale (es. «Verifica di storia»: quiz MC 4/ramo angolo Causa + foglio nodi parole-chiave 2x2 + sintesi senza audio) la salva come preset con un nome. Alla prossima generazione — per qualunque classe — la richiama con un clic. Un menu di gestione permette di rinominare ed eliminare i preset.

**Why this priority**: riduce il costo del gesto ripetuto (il docente genera materiali per più classi e più fonti a settimana), ma la pipeline funziona anche senza.

**Independent Test**: configurare il modale, salvare il preset «Test», riaprire il modale su un'ALTRA classe, applicare «Test» e verificare che tutte le opzioni di output tornino identiche mentre la classe resta quella nuova.

**Acceptance Scenarios**:

1. **Given** un modale configurato, **When** il docente clicca «Salva preset» e dà un nome, **Then** il preset salva SOLO le opzioni di output (mai la classe) e appare nell'elenco dei preset.
2. **Given** un preset esistente, **When** il docente lo applica, **Then** tutte le sotto-opzioni si impostano come salvate, per qualsiasi classe destinataria.
3. **Given** il menu di gestione preset, **When** il docente elimina o rinomina un preset, **Then** l'elenco si aggiorna e la scelta persiste tra i riavvii dell'app.

---

### User Story 4 - Sede di lavoro sulla classe (Priority: P2)

Il docente che lavora su più sedi assegna a ogni classe la propria sede (scelta tra i nick sedi già inseriti nel profilo insegnante). La cartella di classe sul disco si chiama «[nick sede]-[classe]», così le classi omonime di sedi diverse non si mescolano.

**Why this priority**: senza il campo sede, con più sedi il nome cartella è ambiguo (due «2a A» in sedi diverse collidono). Necessario per il naming corretto, ma il caso monosede funziona anche senza.

**Independent Test**: creare nel profilo insegnante due nick sede, assegnare una sede a una classe dal form classi, lanciare una pipeline e verificare che la cartella creata sia «[nick sede]-[classe]».

**Acceptance Scenarios**:

1. **Given** un profilo insegnante con nick sedi, **When** il docente crea o modifica una classe, **Then** il form offre una tendina «Sede» con i nick del profilo (più l'opzione vuota); la scelta persiste.
2. **Given** una classe con sede assegnata, **When** la pipeline salva il vault, **Then** la cartella di classe è «[nick sede]-[classe]»; senza sede assegnata è «[classe]».
3. **Given** un profilo insegnante senza nick sedi, **When** il docente apre il form classi, **Then** il campo sede non appare (o appare disabilitato) e il naming resta «[classe]».

---

### User Story 5 - Tab Insegna: materiali filtrati per mappa selezionata (Priority: P3)

Nel tab Insegna il docente clicca su una mappa in «Progetti esistenti»: la riga si evidenzia e le sezioni «Materiali di studio», «File condivisi» e «Attività di studio e report» mostrano solo gli item di quella mappa. Cliccando di nuovo (o su un'area di deselezione) torna la vista per classe: tutte le sezioni mostrano tutti i materiali della classe filtrata. L'apertura della mappa passa al solo bottone «Riprendi».

**Why this priority**: migliora la navigazione quando i materiali crescono, ma non blocca la generazione né l'archiviazione. Cambia un comportamento esistente (oggi il click apre la mappa) → va consegnata con attenzione ma per ultima.

**Independent Test**: generare materiali per due mappe della stessa classe, selezionare la prima in Progetti esistenti e verificare che le tre sezioni mostrino solo i suoi item; deselezionare e verificare che riappaiano entrambi i set.

**Acceptance Scenarios**:

1. **Given** il tab Insegna con più mappe e materiali, **When** il docente clicca una riga di «Progetti esistenti», **Then** la riga si evidenzia come selezionata e le tre sezioni si filtrano sugli item di quella mappa; il click NON apre più la mappa.
2. **Given** una mappa selezionata, **When** il docente clicca «Riprendi», **Then** la mappa si apre (comportamento di apertura invariato, spostato sul bottone).
3. **Given** nessuna mappa selezionata, **When** il docente guarda le sezioni, **Then** vede tutti i materiali della classe filtrata (filtro classe esistente invariato).
4. **Given** file condivisi caricati PRIMA di questa feature (senza collegamento a una mappa), **When** una mappa è selezionata, **Then** quei file non appaiono; riappaiono nella vista senza selezione.
5. **Given** i materiali generati dalla pipeline (che vivono su disco nel vault), **When** il docente apre la sezione «Materiali di studio», **Then** li vede elencati accanto ai materiali storici, con apertura funzionante per entrambi.

---

### Edge Cases

- **Mappa fallita o vuota allo step A**: gli estrattori esistenti non propagano eccezioni → la pipeline valida i DATI prodotti (numero nodi > soglia); sotto soglia, step A fallito, B/C/D non partono (dipendono dalla mappa), riepilogo con Riprova.
- **Knowledge Graph senza rami L1 canonici**: il conteggio «domande per ramo» usa i raggruppamenti disponibili (hub); se non ce ne sono, i quiz si generano sull'intera mappa con il totale richiesto.
- **Nessuna classe attiva**: il modale chiede di sceglierne una prima di avviare (la cartella di classe e la taratura dipendono dalla classe); in alternativa esplicita «Generico» → cartella «Senza classe».
- **Chiave Google assente con sintesi+voce selezionata**: avviso nel pre-flight, audio deselezionato automaticamente, sintesi solo testo.
- **Vault omonimo esistente**: suffisso progressivo numerico; MAI sovrascrittura silenziosa di un vault esistente.
- **Vault legacy flat (fuori dalle cartelle di classe)**: restano visibili e apribili; nessuna migrazione automatica.
- **Preset che referenzia opzioni non più valide** (es. angolo rimosso in futuro): le opzioni ignote degradano al default con avviso non bloccante.
- **Quota localStorage**: i materiali della pipeline NON passano dall'archivio localStorage (cap 30, quota-guard) — vivono su disco; l'archivio storico resta per i flussi manuali.
- **Doppio avvio**: con una pipeline già in corso il bottone «Avvia» è disabilitato (una pipeline per volta).
- **Fonte troppo povera** (quasi nessun testo): la validazione dello step A la intercetta come mappa sotto soglia; messaggio chiaro al docente.

## Requirements *(mandatory)*

### Functional Requirements

**Modale e configurazione**

- **FR-001**: Il sistema DEVE offrire un'azione «Genera materiali» disponibile quando è caricata almeno una fonte, che apre un modale a tutto schermo di configurazione output.
- **FR-002**: Il modale DEVE mostrare la classe destinataria (classe attiva, cambiabile) e le sezioni di output attivabili singolarmente: quiz/flashcard, fogli nodi, sintesi.
- **FR-003**: Per i quiz il docente DEVE poter scegliere: tipi (V/F, scelta multipla, flashcard — combinabili), numero di domande per ramo, angolo delle domande (Automatico/misto oppure uno specifico tra i 7 angoli esistenti).
- **FR-004**: Per i fogli nodi il docente DEVE poter scegliere: livello massimo dei nodi inclusi, formato pagina (3x4, 2x2, 2x1), e uno o più modi di contenuto (solo titolo, parole chiave AI, spazio per scrivere, scheda con descrizione, catena dei perché, oppure «tutti i set»); ogni modo selezionato produce un PDF distinto.
- **FR-005**: Per la sintesi il sistema DEVE generare la sintesi dell'INTERA mappa (la sintesi per-ramo resta fuori pipeline) e, se disponibile la chiave Google, l'audio a voce naturale in formato compresso (MP3).
- **FR-006**: Il modale DEVE mostrare, prima dell'avvio, una stima del numero di chiamate AI e un pre-flight check delle chiavi (chiave provider attivo; chiave Google per la voce), con degradazione esplicita e non bloccante dell'audio se la chiave Google manca.
- **FR-007**: Il modale DEVE offrire i toggle di taratura coerenti col design VERDE: «Taratura AI [VERDE]» per i materiali (step B/C/D) e «Adatta al livello» per la mappa (step A); i file tarati portano il marcatore [VERDE] nel nome.

**Pipeline a step**

- **FR-008**: La pipeline DEVE eseguire quattro step ordinati: (A) generazione mappa + salvataggio vault, (B) quiz/flashcard, (C) fogli nodi, (D) sintesi + audio; B, C e D dipendono solo dallo step A, mai l'uno dall'altro.
- **FR-009**: Lo step A DEVE validare il risultato della generazione ispezionando i dati prodotti (non affidandosi all'assenza di errori) e DEVE salvare il vault automaticamente, senza alcun dialog di scelta cartella.
- **FR-010**: Ogni step DEVE scrivere i propri output su disco nel vault appena prodotti, PRIMA che inizi lo step successivo.
- **FR-011**: La pipeline DEVE mantenere nel vault un manifest con lo stato per step (in corso / completato / fallito / saltato) e l'elenco dei file prodotti, aggiornato a ogni transizione.
- **FR-012**: Dopo un'interruzione (crash, chiusura), alla riapertura del progetto il sistema DEVE proporre la ripresa della pipeline; la ripresa DEVE saltare gli step completati (zero chiamate AI ripetute) e rieseguire solo quelli mancanti o falliti.
- **FR-013**: Al termine la pipeline DEVE mostrare un riepilogo con lo stato per step e un'azione «Riprova» sul singolo step fallito che non tocca gli output degli step riusciti.
- **FR-014**: I quiz generati DEVONO essere sia riutilizzabili in app (Set di Studio / MappAI Live) sia salvati come PDF stampabile su disco, prodotto senza interazione (nessuna finestra di stampa).
- **FR-015**: Tutte le chiamate AI della pipeline DEVONO essere tracciate nel registro consumi con una categoria dedicata.

**Filesystem e classi**

- **FR-016**: I vault prodotti dalla pipeline DEVONO essere salvati in una cartella di classe dentro la cartella base delle mappe; nome cartella = «[nick sede]-[classe]» se la classe ha una sede assegnata, altrimenti «[classe]», sanitizzato per il filesystem; la cartella viene creata se assente.
- **FR-017**: L'oggetto classe DEVE acquisire un campo «sede» opzionale, impostabile da una tendina (nick sedi del profilo insegnante) sia nel form di creazione sia in quello di modifica della classe.
- **FR-018**: In caso di vault omonimo nella stessa cartella di classe, il sistema DEVE aggiungere un suffisso progressivo numerico; MAI sovrascrivere un vault esistente.
- **FR-019**: L'elenco vault dell'app DEVE trovare sia i vault storici (primo livello) sia quelli dentro le cartelle di classe (secondo livello); regola: una cartella con indice di vault è un vault, una senza è un contenitore da scandire. Nessuna migrazione dei vault esistenti.

**Tab Insegna**

- **FR-020**: Nel tab Insegna il click su una riga di «Progetti esistenti» DEVE selezionare la mappa (evidenziazione visibile) invece di aprirla; l'apertura DEVE avvenire solo dal bottone «Riprendi». Un secondo click sulla stessa riga deseleziona.
- **FR-021**: Con una mappa selezionata, le sezioni «Materiali di studio», «File condivisi» e «Attività di studio e report» DEVONO mostrare solo gli item collegati a quella mappa; senza selezione DEVONO mostrare tutti gli item della classe filtrata (filtro classe esistente invariato).
- **FR-022**: I materiali della pipeline DEVONO vivere su disco nel vault come fonte di verità ed essere elencati nella sezione «Materiali di studio» tramite lettura da disco con un indice leggero; l'archivio storico in memoria locale resta per i flussi manuali e non riceve i file pesanti della pipeline.
- **FR-023**: I file condivisi caricati tramite la pipeline DEVONO portare il metadato della mappa di origine; i file storici senza metadato appaiono solo nella vista senza selezione.

### Key Entities

- **Preset di generazione**: nome + insieme delle opzioni di output (tipi quiz, quantità per ramo, angolo, opzioni fogli nodi, sintesi sì/no, audio sì/no, toggle taratura). NON contiene la classe. Persistito localmente, gestibile (rinomina/elimina).
- **Manifest pipeline**: stato della pipeline di un vault — per ogni step: stato, orario, elenco file prodotti, eventuale errore sintetico. Vive nel vault accanto ai materiali; è la base della ripresa idempotente.
- **Cartella di classe**: contenitore su disco dentro la cartella base delle mappe; nome derivato da sede+classe (o solo classe), creato on-demand; contiene i vault delle mappe generate per quella classe.
- **Materiale generato**: file su disco nel vault (PDF quiz, PDF foglio nodi, sintesi, audio) + voce nell'indice leggero con: tipo, titolo, mappa di origine, classe, marcatore taratura, data.
- **Classe (estesa)**: campi esistenti + «sede» opzionale (nick dal profilo insegnante).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Un docente parte da una fonte e ottiene mappa + quiz + fogli nodi + sintesi archiviati e pronti all'uso con UN solo flusso di configurazione e UN clic di avvio (oggi: ≥5 flussi manuali separati).
- **SC-002**: Dopo un'interruzione forzata a metà pipeline, il 100% dei file già prodotti è presente su disco e la ripresa non ripete nessuna chiamata AI per gli step completati.
- **SC-003**: Il fallimento di un singolo step non impedisce il completamento degli altri step indipendenti né cancella alcun output; il docente può rilanciare il singolo step fallito senza riconfigurare nulla.
- **SC-004**: Applicare un preset su una classe diversa riproduce il 100% delle opzioni di output salvate, senza trascinarsi la classe di origine.
- **SC-005**: Con due sedi con classi omonime, i materiali finiscono in cartelle distinte e riconoscibili dal nome; zero collisioni e zero sovrascritture di vault esistenti.
- **SC-006**: Tutti i vault esistenti prima della feature restano visibili e apribili senza alcuna azione dell'utente.
- **SC-007**: Nel tab Insegna, selezionando una mappa, il docente trova un materiale specifico senza scorrere item di altre mappe; deselezionando ritrova la vista per classe completa.
- **SC-008**: L'archiviazione dei materiali della pipeline non degrada né satura l'archivio locale esistente (i flussi manuali storici continuano a funzionare invariati).

## Assumptions

- **Decisioni già prese dall'utente (20/7/26)**: D1 campo sede sulla classe (tendina dai nick del profilo insegnante); D2 collisione nome vault → suffisso progressivo numerico; D3 click riga Insegna = seleziona, «Riprendi» apre; D4 PDF quiz senza interazione tramite conversione dell'HTML di stampa esistente nel processo desktop; D5 sintesi in pipeline solo mappa intera.
- **Riuso dei motori esistenti**: generazione mappa, quiz (motore condiviso con angoli), fogli nodi, sintesi map-reduce e voce naturale esistono già; la pipeline è un orchestratore. I motori oggi accoppiati alla UI (fogli nodi, sintesi, stampa quiz) vengono resi invocabili con opzioni esplicite senza cambiarne l'output.
- **Percorso di salvataggio**: esiste già una primitiva di salvataggio vault senza dialog e una di scrittura PDF nel vault; la cartella «Materiale Studio» dentro il vault è già preservata dai salvataggi successivi.
- **Voce naturale**: richiede l'app desktop e la chiave Google diretta, indipendentemente dal provider attivo; formato audio compresso (≈0,5 MB/min) preferito a quello non compresso (≈3 MB/min).
- **Errori di generazione**: gli estrattori esistenti non propagano eccezioni → la validazione degli step si basa sui dati prodotti, non sugli errori.
- **Nessuna migrazione**: i vault esistenti restano dove sono; solo i nuovi vault della pipeline usano le cartelle di classe.
- **Fasi di consegna** (ognuna committabile e reversibile, constitution II): Fase 1 fondamenta (motori parametrizzati, salvataggio automatico + cartelle classe + elenco vault a due livelli, PDF senza interazione, indice materiali su disco) con logica pura testata in Node; Fase 2 pipeline (modale, preset, orchestratore a step con manifest, riepilogo/riprova); Fase 3 Insegna (selezione mappa + filtri + metadato mappa sui file condivisi).
- **Vincoli di piattaforma**: architettura a script globali senza build step (constitution III); i18n bilingue (constitution VII); dual-provider per i testi, Google-only accettata per la sola voce (già così oggi per la voce naturale della sintesi).
