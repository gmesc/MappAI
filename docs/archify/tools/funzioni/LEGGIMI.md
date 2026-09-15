# Come si rigenera «Le funzioni» (funzioni.html)

Tre pezzi, in quest'ordine. Si lancia dalla radice del repo.

1. `extract3.py` legge i sorgenti e ne cava ogni funzione: nome, riga, argomenti,
   commento sopra, che cosa tocca (AI, schermo, disco, stampa, rete, D3, modali),
   il nome pubblico (`window.*`, `MappAIXxx.metodo`, `electronAPI.*`, canale IPC).
   Scrive `funcs4.json`.

   ```bash
   ls public/js/*.js | grep -vE "d3.v7|jspdf|lucide|pdf.min|tailwind" > /tmp/files.txt
   ls main.js live-server.js tutor-server.js collab-server.js garden-server.js relay-client.js >> /tmp/files.txt
   python3 docs/archify/tools/funzioni/extract3.py $(cat /tmp/files.txt | tr '\n' ' ')
   ```

2. `moduli.py` è l'unica parte scritta a mano: per ogni modulo dice area, mappe
   dell'Atlante, momento del lavoro e una riga di descrizione. **Un modulo nuovo va
   aggiunto qui**, altrimenti `build.py` si ferma con un KeyError — ed è voluto:
   meglio fermarsi che pubblicare un modulo senza casa.

3. `desc.tsv` sono le descrizioni scritte a mano, una per riga:
   `percorso/file.js:riga<TAB>descrizione`. Valgono più del commento nel codice.
   `build.py` mette insieme tutto e scrive `funzioni-dati.js`:

   ```bash
   python3 docs/archify/tools/funzioni/build.py && cp <scratch>/funzioni-dati.js docs/archify/
   ```

Le righe nei file invecchiano a ogni modifica del codice: `desc.tsv` è indicizzato
per `file:riga`, quindi dopo un refactoring grosso le descrizioni di quel file
vanno riagganciate (il nome della funzione resta, la riga no).

⚠️ I percorsi di scrittura dentro gli script puntano alla cartella di lavoro della
sessione in cui sono nati: prima di rilanciarli, cambia le due costanti `S`.
