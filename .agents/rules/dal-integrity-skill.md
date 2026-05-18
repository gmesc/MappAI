# DAL Integrity & Retrocompatibility Protocol (MappAI)

## 1. Struttura del Markdown Vault
Ogni qualvolta si modifica la logica di persistenza dei dati, si deve rispettare la struttura fisica del Vault:
- `index.yaml`: Configurazione globale (extractionMode, rootNodeLabel, userProfile, customColors, lastUpdated).
- `links.json`: Relazioni contenenti sempre `source`, `target`, `rel` (linking words) e `isCross`.
- `Nodi/`: File `.md` individuali per ogni nodo con frontmatter YAML completo.
- `Allegati/`: File multimediali locali (immagini Base64 convertite o file locali copiati).

## 2. Regole di Retrocompatibilità (Caricamento)
- **Fallback delle Linking Words**: Se nel file `links.json` manca la proprietà `rel` (struttura legacy), impostare di default `rel = "include"` per evitare che i collegamenti appaiano vuoti sul canvas.
- **Fallback delle Fonti (Citazioni)**: Nel corpo del nodo markdown, la sezione `## Fonti` può presentarsi in due varianti:
  1. Nuovo formato: `- [Titolo | Sorgente]: Testo`
  2. Vecchio formato: `- [Titolo]: Testo`
  Il parser deve essere in grado di leggere entrambi. Se la sorgente è assente, deve valorizzarla automaticamente a `"Originale"`.

## 3. Gestione dei Riferimenti Multimediali
- Non lasciare mai percorsi assoluti locali dell'utente nei markdown salvati (es. `/Users/...`); convertili sempre in percorsi relativi alla cartella del Vault (`../Allegati/nome_file`).
