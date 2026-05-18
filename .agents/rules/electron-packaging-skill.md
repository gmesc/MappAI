# Electron Build & Packaging Controller (MappAI)

## 1. Direttiva di Notifica ("PACK NON AGGIORNATA / PACK AGGIORNATA")
- Dopo ogni singola modifica ai file sorgente, l'AI deve concludere la risposta indicando chiaramente e in modo conciso lo stato del pacchetto:
  - `"PACK NON AGGIORNATA"` se le modifiche sono state salvate solo nel codice sorgente.
  - `"PACK AGGIORNATA"` se è stato eseguito il comando di compilazione.

## 2. Controllo Esecuzione Build
- L'AI **non deve mai** avviare il processo di packaging (`npm run pack` o `electron-builder`) di propria iniziativa.
- La compilazione deve essere eseguita esclusivamente su esplicito comando dell'utente (es. tramite parole chiave come `"aggiorna"`, `"aggiorna pack"` o richieste dirette di compilazione).
- Il percorso ufficiale del pacchetto generato su architettura Apple Silicon è: `/dist/mac-arm64/MappAI.app`.
