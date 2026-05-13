# MappAI - Master Product Sheet

## 1. Storia del Progetto
MappAI è nato con un obiettivo chiaro: rivoluzionare il modo in cui studenti, ricercatori e professionisti organizzano e apprendono l'informazione. Dalle sue primissime versioni, concepite come semplici script per la generazione di mappe concettuali basilari tramite IA, il progetto si è evoluto in una **potente applicazione desktop standalone (Windows, macOS, Linux)**.
Attraverso iterazioni successive, MappAI ha integrato un motore di visualizzazione a grafo avanzato (D3.js), capacità di elaborazione multimodale (testo, PDF, URL, Audio/Video) e, soprattutto, un ecosistema di strumenti per l'accessibilità e lo studio attivo, trasformandosi da un semplice "generatore" a un vero e proprio **"Secondo Cervello" potenziato dall'Intelligenza Artificiale**.

---

## 2. Architettura Tecnica

### Backend (Core & System Integration)
- **Framework:** Sviluppato su architettura **Electron.js**, garantisce un'esecuzione nativa e multipiattaforma.
- **Sicurezza & IPC:** Tutte le comunicazioni tra l'interfaccia utente e il sistema operativo avvengono tramite canali IPC (Inter-Process Communication) sicuri (`preload.js`), mantenendo il contesto isolato.
- **Elaborazione Dati Locali:**
  - Parsing diretto di file `PDF`.
  - Motore di salvataggio basato su un Data Abstraction Layer (DAL) proprietario che salva i dati in formato **Markdown Vault** (file fisici `.md`, immagini in cartelle dedicate, metadata in `yaml`/`json`).
- **Integrazione LLM:** Collegamento diretto e ottimizzato con le API di Google Gemini (supporto per le serie 1.5, 2.0 e 3 Flash/Pro), con gestione avanzata di caricamenti multimediali tramite Google File API.

### Frontend (UI/UX)
- **Motore Grafico:** **D3.js** è il cuore dell'esperienza visiva, gestendo la fisica dei nodi (force-directed graph), il trascinamento, lo zoom pan&tilt e le relazioni interattive tra i concetti.
- **Design System:** Interfaccia moderna e "glassmorphism", costruita con **Tailwind CSS**. È progettata per essere responsiva, pulita e priva di distrazioni, focalizzando l'attenzione sui dati.
- **Componenti Modulari:** Modali contestuali, drawer laterali a scorrimento (per appunti, struttura, AI Tutor e ricerca) e menu contestuali al clic destro sui nodi.

---

## 3. Funzionalità per l'Utente Finale (End-User Features)

### 3.1. Creazione e Generazione
- **Creazione Assistita dall'IA:** Generazione automatica di mappe a partire da innumerevoli fonti (testi incollati, file PDF, documenti Word, pagine web tramite URL, e persino file Audio/Video).
  - **Mind Map (Mappa Mentale):** Struttura gerarchica classica (Livello 0, 1, 2) ideale per lo studio strutturato.
  - **Knowledge Graph (Grafo di Conoscenza):** Struttura relazionale libera, pensata per scoprire connessioni non ovvie tra entità (Super-hub, nodi intermedi e relazioni logiche).
- **Creazione Manuale (Zero-to-Hero):** L'utente può creare una mappa interamente da zero, aggiungendo nodi isolati, collegandoli a piacimento e costruendo il proprio grafo concettuale senza l'uso dell'IA.

### 3.2. Personalizzazione Estrema del Grafo
- **Gestione Nodi & Link:** Creazione di nodi figli, rinominazione libera di etichette e relazioni.
- **Rich Content:** Ogni nodo può contenere testo lungo (descrizione enciclopedica), citazioni esatte dalle fonti, **immagini**, **collegamenti web (URL)** e **link a file locali**.
- **Estetica:** Personalizzazione completa dei colori dei raggruppamenti (macro-aree).
- **Pin & Layout:** Possibilità di "fissare" (pin) la posizione dei nodi nello spazio per mantenere l'ordine desiderato.

### 3.3. Nessun Vendor Lock-in (Portabilità dei Dati)
- **Esportazione in Markdown Vault:** La più grande garanzia per l'utente. Interi progetti possono essere salvati come cartelle locali strutturate:
  - Un file `index.yaml` globale.
  - Una cartella `Nodi/` contenente file `.md` standard per ogni nodo, leggibili con qualsiasi editor testuale (es. Obsidian, Notion, VS Code).
  - Una cartella `Allegati/` per tutte le immagini locali.
  *Se l'utente smette di usare MappAI in futuro, i suoi appunti e i suoi dati saranno per sempre a sua disposizione e perfettamente leggibili.*
- Esportazione in formato JSON per backup di sistema.

### 3.4. AI Tutor Personalizzato (Socratic Tutor)
- **Profilazione dell'Allievo:** L'utente può inserire il proprio profilo (Nickname, Età, Classe scolastica, Sistema formativo - es. "Ticino"). L'AI Tutor legge questi dati per calibrare:
  - Complessità del vocabolario.
  - Profondità didattica.
  - Tipologia di domande.
- **Gestione dello stato di "FLOW":** L'IA riconosce se lo studente è in difficoltà o sotto stress, riducendo la difficoltà e offrendo esempi incoraggianti.
- **Archiviazione Chat:** Tutte le conversazioni con il tutor (sia generali che contestuali al singolo nodo) vengono salvate automaticamente in file di testo all'interno della cartella di progetto, per tenere traccia dei progressi.

### 3.5. Strumenti di Studio Attivo
- **Sistema a Semaforo (Study Status):** Ogni nodo può essere marcato con uno stato visivo:
  - 🔘 Da Studiare (Todo - Grigio)
  - 🟠 Da Ripassare (Review - Arancione)
  - 🟢 Fatto/Imparato (Done - Verde)
- **Generazione Quiz e Flashcard:** L'IA crea dinamicamente test a risposta multipla e flashcard mirate sul contenuto specifico di ogni nodo per facilitare la "Spaced Repetition" (Ripetizione Dilazionata).
- **Timer Pomodoro Integrato:** Widget a schermo per gestire le sessioni di studio (es. 25 min focus / 5 min pausa).
- **Spazio Appunti Personali:** Un pannello laterale (Notes) per scrivere liberamente durante la visione della mappa.

### 3.6. Accessibilità e Lettura Aumentata
MappAI è progettato per essere inclusivo (DCA e dislessia):
- **TTS (Text-to-Speech):** Lettura ad alta voce integrata per tutti i modali, i nodi e le risposte del Tutor AI.
- **Font OpenDyslexic:** Font ottimizzato per dislessici attivabile con un clic.
- **Lente di Ingrandimento:** Uno strumento a schermo per ingrandire specifiche aree del grafo senza alterare l'interfaccia globale.
- **Tema ad Alto Contrasto:** Migliora la leggibilità dei testi e dei collegamenti.
- **Zoom UI Globale:** Scala l'intera interfaccia grafica.

### 3.7. Ricerca e Struttura
- **Finder Integrato:** Motore di ricerca testuale per trovare rapidamente nodi specifici all'interno di grafi immensi.
- **Tree View (Struttura):** Pannello laterale che mostra l'alberatura logica o i "Super-Hub" del grafo per una navigazione istantanea.

---

## 4. Stima Sviluppo e Impegno
*Nota del creatore:*
Dietro a MappAI c'è uno sforzo ingegneristico, di design e di raffinamento pedagogico enorme. Dalle prime linee di codice per il proxy API, fino allo sviluppo del Data Abstraction Layer per i Markdown Vault, la logica fisica di D3.js, le pipeline di build multi-OS e le traduzioni bilingue...
**Ore di sviluppo stimate:** Si stimano **oltre 250 - 300 ore di lavoro attivo**. Questo tempo comprende la ricerca sulle dinamiche di apprendimento (Socratic Flow), il design della UI in Tailwind, il debugging asincrono IPC di Electron e la calibrazione meticolosa dei prompt per i LLM Gemini.
