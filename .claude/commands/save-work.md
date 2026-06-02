# /save-work

Commit e push immediato di tutto il lavoro corrente sul branch `dev`.

## Comportamento

1. Controlla il branch corrente (deve essere `dev`, non `MappAI_main`)
2. Fa `git add -A` per stageare tutto
3. Chiede un messaggio di commit descrittivo oppure usa un messaggio WIP con timestamp
4. Committa e pusha su origin

## Istruzioni per Claude

Esegui questi passi:

1. Controlla il branch corrente:
```bash
git branch --show-current
```

2. Se il branch è `MappAI_main`, avvisa l'utente e fermati — non committare direttamente su main.

3. Controlla se ci sono cambiamenti:
```bash
git status --short
```

4. Se non ci sono cambiamenti, di' "Nessuna modifica da salvare" e fermati.

5. Se ci sono cambiamenti, chiedi all'utente: "Vuoi aggiungere un messaggio descrittivo al commit? (premi Invio per usare un timestamp automatico)"

6. Usa il messaggio fornito dall'utente oppure genera: `"WIP: save $(date '+%Y-%m-%d %H:%M')"`

7. Esegui:
```bash
git add -A
git commit -m "MESSAGGIO_SCELTO"
git push origin $(git branch --show-current)
```

8. Mostra un riepilogo dei file committati.
