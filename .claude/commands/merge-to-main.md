# /merge-to-main

Merge sicuro del branch `dev` su `MappAI_main` con checklist di sicurezza.

## Quando usarlo

Quando una feature è stabile, testata e pronta per diventare la versione "ufficiale".

## Istruzioni per Claude

Esegui questi passi nell'ordine. Fermati se uno fallisce e spiega cosa è andato storto.

### Step 1 — Verifica che siamo su dev
```bash
git branch --show-current
```
Se non siamo su `dev`, avvisa e fermati.

### Step 2 — Verifica che dev sia pulito
```bash
git status --short
```
Se ci sono modifiche non committate, esegui `/save-work` prima di continuare.

### Step 3 — Mostra cosa sta per essere mergiato
```bash
git log MappAI_main..dev --oneline
```
Elenca i commit che entreranno in main. Chiedi conferma all'utente: "Questi N commit stanno per essere mergiati su MappAI_main. Confermi?"

### Step 4 — Aggiorna main e fai il merge
```bash
git checkout MappAI_main
git pull origin MappAI_main
git merge dev --no-ff -m "merge: integra sessione $(date '+%Y-%m-%d') da dev"
```

### Step 5 — Push di main
```bash
git push origin MappAI_main
```

### Step 6 — Torna su dev
```bash
git checkout dev
```

### Step 7 — Riepilogo
Mostra:
- Quanti commit sono stati mergiati
- Il nuovo HEAD di MappAI_main
- Conferma che siamo tornati su dev

## Nota
Il merge usa `--no-ff` (no fast-forward) per mantenere traccia esplicita di ogni sessione di lavoro nella storia del repo.
