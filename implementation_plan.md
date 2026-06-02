# Piano di Implementazione: Allineamento Applicazione Desktop (Docente e Studente)

Questo piano descrive i passaggi per sincronizzare le modifiche apportate alla UI, alla gestione dei Vault (esportazione dei set di studio, risposte aperte come file di testo) e alle modalità di importazione/allineamento nomi progetto dalle versioni iPad alle versioni Desktop.

## User Review Required

> [!IMPORTANT]
> Le modifiche del frontend (codice HTML, CSS e JS in `public/`) sono condivise tra iPad e Desktop tramite condizioni sulla presenza di Capacitor (`isCapacitor`). 
> Per evitare di inquinare il ramo Desktop (`MappAI_main` e `MappAI_studente`) con le cartelle native iOS (`ios/`), i file di configurazione Capacitor e i certificati Apple Xcode, utilizzeremo una sincronizzazione mirata della cartella `public/` dai branch iPad ai rispettivi branch Desktop.

## Proposed Changes

La cartella `public/` (contenente la UI, i fogli di stile CSS, la logica JS e le traduzioni) verrà allineata direttamente dai rami iPad.

### Sincronizzazione Ramo Docente Desktop (`MappAI_main`)

* Passaggio al branch `MappAI_main`.
* Checkout selettivo di tutta la cartella `public/` dal branch `MappAI_iPad`.
* Commit e push sul branch `MappAI_main`.

### Sincronizzazione Ramo Studente Desktop (`MappAI_studente`)

* Passaggio al branch `MappAI_studente`.
* Checkout selettivo di tutta la cartella `public/` dal branch `MappAI_iPad_studente`.
* Commit e push sul branch `MappAI_studente`.

---

## Verification Plan

### Manual Verification
- Verifica visiva dei bottoni della landing page su desktop (layout verticale, assenza di sottotitoli).
- Verifica del caricamento di un vault su desktop, controllando che il nome della cartella diventi il nome del progetto.
- Verifica del salvataggio e caricamento dei set di studio nel vault.
