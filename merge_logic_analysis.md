# Report Analisi Logica: Funzione "Unisci" e Sviluppo dell'Espansione Contestuale

Come richiesto, ho analizzato in profondità il codice attuale della funzione `unisci` (`window.importGraph` e `window.confirmMerge` in `app.js`) per capire come gestisce l'importazione di una mappa esterna. 

Ecco il referto medico dell'attuale sistema e la cura (potenziamento) necessaria per realizzare la nostra nuova visione di "Spazio di Lavoro Ibrido".

---

## 1. Stato Attuale: Come funziona oggi l'unione

### A. Prevenzione Nodi Doppi (Mappe + KG)
*   **Come funziona oggi**: L'app **non** previene i nodi doppi a livello semantico. Quello che fa è prevenire i *conflitti di sistema*. Per farlo, prende l'ID di ogni nuovo nodo in entrata e gli appiccica un prefisso univoco basato sul tempo (es. se entra un nodo con `id: "N1"`, lo trasforma in `id: "_m17150000000_N1"`). 
*   **Il problema**: Se la tua mappa attuale ha un nodo "Fotosintesi" e la mappa che stai unendo ha un nodo "Fotosintesi", **avrai due nodi separati** sulla mappa. Non vengono fusi. Le due mappe vivono come isole separate nello stesso oceano.

### B. Creazione Nuovi Link (solo KG)
*   **Come funziona oggi**: Dopo aver unito i file, scatta la funzione `window.aiCrossLink`. Prende i nomi dei primi 30 nodi della vecchia mappa e i primi 30 della nuova, li manda a Gemini e gli chiede: *"Trova relazioni tra la Lista A e la Lista B"*. Se Gemini trova dei match, crea dei collegamenti "tratteggiati" (suggeriti dall'AI, con l'emoji 🤖) che l'utente deve poi convalidare col tasto destro.
*   **Il problema**: Ha un limite hardware inserito nel codice (`slice(0, 30)`)! Analizza solo i primi 30 nodi per "evitare di consumare troppi token". Ma oggi usiamo Gemini 1.5 (che supporta fino a 1 milione di token!), quindi questo limite è obsoleto e castra le potenzialità dell'AI.

---

## 2. Il Piano di Potenziamento (Verso l'Espansione Contestuale)

Per implementare la vera "Augmented Intelligence" (caricare un PDF per espandere una mappa), le vecchie logiche di unione non bastano. Dobbiamo evolverle. Ecco il piano:

### Potenziamento 1: "Smart Merging" (Fusione Semantica)
Quando chiediamo all'AI di leggere un PDF per espandere globalmente la mappa, il nuovo JSON generato deve fondersi intelligentemente con l'esistente.
*   **La Soluzione**: Invece di rinominare gli ID ciecamente, scriveremo un algoritmo di **riconciliazione**. Prima di aggiungere un nuovo nodo, il sistema controllerà se esiste già un nodo con la stessa `label` (ignorando maiuscole/minuscole). 
*   **Se esiste**: Non crea un nuovo nodo. Prende invece le "Fonti" (`chunks`) e la descrizione del nuovo nodo e le "inietta" dentro il nodo vecchio. 
*   **Se non esiste**: Crea un nuovo nodo.

### Potenziamento 2: Prompt di "Iniezione Mirata" (Click Destro)
L'espansione contestuale di un *singolo* nodo richiede un approccio chirurgico.
*   **La Soluzione**: Quando l'utente fa click-destro su "Rivoluzione Francese" e carica un PDF, invieremo a Gemini un prompt speciale.
    *   *Prompt*: "Leggi questo testo. Estrai solo i concetti che sono figli diretti o sottotemi di 'Rivoluzione Francese'. Restituisci un JSON dove il parentID di ogni nuovo nodo sia esattamente l'ID del nodo selezionato."
*   In questo modo, Gemini non genererà una mappa casuale, ma **solo un ramo aggiuntivo** che si innesterà perfettamente nel nodo che hai scelto.

### Potenziamento 3: Rimozione del Limite dei Token
*   Rimuoveremo il blocco dei 30 nodi in `aiCrossLink`. Invieremo a Gemini l'indice completo della mappa (ID e Label) per permettergli di creare connessioni su larghissima scala.

> [!IMPORTANT]
> **Qual è il prossimo passo operativo?**
> A mio parere, il modo migliore per procedere senza "rompere" il codice esistente è sviluppare questa funzione in due step:
> 1. Creare la **"Mappa Vuota"** nella Landing Page (permetterti di entrare subito nell'editor).
> 2. Costruire l'azione **"Espandi Nodo con IA (Da Documento)"** all'interno del menu contestuale del singolo nodo.
> 
> Sei d'accordo con l'analisi e con l'ordine d'azione?
