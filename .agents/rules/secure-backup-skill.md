# Secure Incremental Backup Protocol (MappAI)

## 1. Destinazione e Naming
- Tutti i backup del workspace devono essere creati come sottocartelle all'interno di: `/Users/giacomomeschini/Antigravity/MappAI_Backup`
- Il nome della cartella deve seguire rigorosamente il pattern: `MappAI_backup_[GG-MM-YYYY]_[Numero Incrementale a 2 cifre]` (es. `MappAI_backup_19-05-2026_01`).
- L'AI deve scansionare la cartella di destinazione per calcolare automaticamente il prossimo indice disponibile per la data corrente.

## 2. Sanitizzazione e Sicurezza delle API Key
- Prima di completare il backup, l'AI deve eseguire una ricerca ricorsiva ed eliminare in modo distruttivo (o redigere) qualsiasi credenziale sensibile:
  - Rimuovere file `.env` o file di configurazione locali contenenti token di sessione.
  - Ricercare stringhe con pattern di API Key di Google AI Studio (es. prefix `AIzaSy`) o di Infomaniak (Bearer tokens).
  - Escludere o ripulire file di cache o chiavi memorizzate temporaneamente.
