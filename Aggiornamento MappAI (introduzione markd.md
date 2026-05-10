Aggiornamento MappAI (introduzione markdown vault)

Ho completato la Fase 3 del piano, trasformando Mapp.AI in uno strumento di "Augmented Intelligence" estremamente sofisticato. Ecco le novità principali:

### 1. Iniezione Mirata SOTA (Espandi Nodo)
Ho riscritto completamente il prompt e la logica di espansione dei nodi (Click Destro -> Espandi con IA).
- **Consapevolezza Globale:** Ora Gemini riceve l'elenco di tutti i nodi già esistenti nella mappa. Questo gli permette di evitare la creazione di duplicati e di creare invece link intelligenti verso concetti già presenti.
- **Relazioni Semantiche:** L'IA ora definisce il *tipo* di relazione (es: "causa", "conseguenza", "esempio di") rendendo il Knowledge Graph molto più leggibile.
- **Dettaglio Elevato:** Ho istruito il modello a generare descrizioni didattiche più approfondite (3-4 frasi) per ogni nuovo nodo.

### 2. Smart Merging Chirurgico
La funzione "Unisci Mappe" è stata potenziata per evitare qualsiasi perdita di dati:
- Se provi a unire una mappa che contiene un nodo già esistente (stessa etichetta), il sistema non crea un duplicato.
- Invece, **inietta** le nuove informazioni (descrizioni, note e fonti) all'interno del nodo vecchio, aggiungendo un tag `[Dettaglio Unione]` per permetterti di distinguere le fonti.

### 3. Tutor AI con Prove Documentali
Il Tutor contestuale del nodo ora è molto più "colto":
- Oltre alla descrizione del nodo, ora gli inviamo anche tutti i **chunks (fonti)** collegati.
- Questo gli permette di rispondere citando testualmente i documenti che hai caricato, rendendo il supporto allo studio estremamente affidabile e basato sulle evidenze.

### 4. Rimozione Limiti e Scalabilità
- Ho rimosso ogni limite di nodi per le correlazioni AI (`aiCrossLink`). Ora puoi unire mappe enormi e lasciare che Gemini 1.5 Pro (grazie alla sua enorme finestra di contesto) trovi tutti i nessi logici in un colpo solo.

L'app è ora un vero ecosistema di Knowledge Management professionale. Puoi iniziare progetti vuoti, popolarli tramite iniezioni mirate da PDF e salvare tutto in un Vault Markdown pronto per essere usato come il tuo "Secondo Cervello". 

A te la prova!