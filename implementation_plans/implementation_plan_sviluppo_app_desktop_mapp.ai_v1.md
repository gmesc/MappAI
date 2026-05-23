# Sviluppo App Desktop "Mapp.AI" (v1)

Questo documento definisce il piano definitivo per l'App Desktop Nativa macOS (.dmg) focalizzata su Google Gemini, con le migliorìe dell'interfaccia e l'archiviazione dati.
*(Approvato dall'utente)*

## Proposed Changes

---

### Setup Architettura (Electron)
#### [NEW] /Mapp_AI_v1/package.json & main.js
- **Installazione NVM / Node.js**: Verrà eseguita sul sistema del Mac per rendere agibile la compilazione.
- **main.js**: Core Electron per aggirare i limiti CORS e gestire il File System.
- **Salvataggio JSON & Bottoni Rapidi**: Ricezione dell'IPC per generare un file `.json` in `Documenti/Salvataggi Mapp.AI/`.
- Un bottone **"Apri Cartella Salvataggi"** nel frontend invierà un comando ad Electron per aprire la cartella `.json` originaria nel Finder nativo di macOS.

---

### UI / Frontend
#### [NEW] /Mapp_AI_v1/public/index.html
- **Header "Mapp.AI"**: Nuovo design pulito. API limitate solo a Google e AI Studio.
- **Mini-Guida API (Modal)**: Box illustrativo per recuperare token API su AI Studio.
- **Modal Tutorial App ("Metodo di Studio Attivo")**: Un pulsante/modal dedicato che spiega come funziona l'applicazione, e incentiva attivamente lo studente a rifinire manualmente le mappe.
- **Sidebar "Note Utente"**: Nuova tab laterale che funge da *raccoglitore* visualizzando sotto forma di feed tutte le immagini e le note digitate/appese dallo studente sui nodi della mappa.

#### [NEW] /Mapp_AI_v1/public/js/app.js & css
- Integrazione IPC frontend.

---

### Miglioramento dei Prompt e Logica (Backend/Logic)
#### [MODIFY] Ingegneria dei Prompt Gemini
- **Italiano Tassativo**: Direttive rigorose del prompt a Gemini affinché verbi relazionali e chunk testuali siano in Italiano al 100%.
- **Descrizione Generale Tema (L0)**: Modifica alla generazione della radice (Livello 0) della mappa per includere una panoramica generale del tema trattato.
- **Descrizione Dettagliata (L1)**: Incremento della direttiva `content` dei nodi L1 da 25 a 50 parole per spiegazioni approfondite.
- **Gestione Chunks L1**: Intercettazione e aggregazione delle *quotes/chunks* della prole e dell'albero L2/L3 in modo da renderle visibili direttamente analizzando l'area sorgente del nodo L1.

#### [MODIFY] UI Rendering Nodi
- **Marker Icone Modifica**: Quando l'utente aggiunge informazioni testuali (✏️) o un'immagine (🖼️) tramite il modale di Editing Nodo, il rendering D3.js affiggerà piccole emoji identificative direttamente al fianco del nodo interessato per rintracciarle subito a colpo d'occhio.
