Questa è un'ottima intuizione. Trasformare Mapp.AI da un semplice "generatore" a un vero e proprio **"Spazio di Lavoro Ibrido" (Manuale + AI)** è il passo successivo naturale per renderla un'applicazione di livello professionale. 

Ecco come potremmo architettare e implementare questa evoluzione:

### 1. Creazione di una Mappa "Da Zero" (Blank Canvas)
Attualmente, la landing page obbliga l'utente a inserire una fonte. Per permettere la creazione manuale, dobbiamo modificare il flusso iniziale:

*   **Nuovo Bottone "Canvas Vuoto"**: Nella schermata iniziale, aggiungiamo una grande opzione (accanto a "Nuovo Progetto") chiamata "Crea Mappa Vuota". 
*   **Bypass del Processamento**: Cliccando questo bottone, l'app salta la chiamata a Gemini e inizializza immediatamente un database vuoto.
    *   Se l'utente sceglie "Mappa Mentale", il sistema crea solo un singolo nodo centrale chiamato "Nuovo Argomento".
    *   Se sceglie "Knowledge Graph", lo schermo è totalmente bianco.
*   **Costruzione Manuale**: Una volta dentro, l'utente usa gli strumenti che abbiamo già costruito: click-destro per "Aggiungi Nodo Figlio", "Modifica Testo", e lo strumento "Pathfinder/Collega" per unire i nodi.

### 2. Aumentare una mappa esistente con documenti (Augmented Intelligence)
Se un utente ha una mappa (creata a mano o precedentemente generata dall'AI) e vuole arricchirla caricando un PDF o un testo, possiamo introdurre due potenti meccanismi:

**A. Espansione Contestuale (Mirata a un singolo Nodo)**
*   **Come funziona**: L'utente fa click-destro su un nodo specifico (es. "Rivoluzione Francese") e seleziona una nuova opzione: **"Espandi con IA (Carica Fonte)..."**.
*   **Il Flusso**: Si apre una finestra per selezionare un file (es. un PDF su Robespierre). Mapp.AI estrae il testo del PDF e lo invia a Gemini con un prompt specifico: *"Leggi questo documento e crea una struttura JSON di sottonodi da attaccare esclusivamente al nodo padre 'Rivoluzione Francese'"*.
*   **Risultato**: Gemini genera solo i rami aggiuntivi che vengono iniettati nell'albero esistente, senza alterare il resto della mappa.

**B. Arricchimento Globale (Riorganizzazione dell'intera Mappa)**
*   **Come funziona**: Inseriamo un bottone globale nella Sidebar chiamato **"Integra Nuovo Documento"**.
*   **Il Flusso**: L'utente carica il documento. Mapp.AI prende *tutta l'attuale struttura della mappa* (il JSON esistente) e il testo del nuovo documento, e li invia a Gemini dicendo: *"Questa è la mappa attuale. Leggi questo nuovo documento e: 1) Aggiungi nuovi nodi dove mancano informazioni, 2) Crea collegamenti tra i nodi esistenti se il documento rivela nuove relazioni."*
*   **Risultato**: La mappa si "aggiorna" organicamente fondendo la vecchia conoscenza con quella nuova.

### Cosa serve tecnicamente per realizzarlo:
1.  **Modifica alla Landing Page**: Aggiungere i bottoni per il bypass dell'AI.
2.  **Pannello "Fonti" nella Sidebar**: Creare una zona dove l'utente può fare "Drag & Drop" di un PDF mentre la mappa è già aperta.
3.  **Prompt di "Merging" (Unione)**: Dobbiamo scrivere due nuovi prompt per Gemini specializzati nell'**iniettare** dati in JSON esistenti senza corromperli, un compito leggermente diverso dalla creazione da zero.

Se l'idea ti piace, possiamo procedere per gradi. Ti consiglierei di iniziare dalla **Creazione "Da Zero" (Blank Canvas)** che è tecnicamente molto rapida da implementare, per poi passare all'**Espansione Contestuale** dei singoli nodi! Quale preferisci affrontare per prima?