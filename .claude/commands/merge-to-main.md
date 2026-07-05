# /merge-to-main

Merge sicuro del branch di lavoro corrente su `main` con checklist di sicurezza.

## Quando usarlo

Quando una feature è stabile, testata e pronta per diventare la versione "ufficiale".

## Istruzioni per Claude

Esegui questi passi nell'ordine. Fermati se uno fallisce e spiega cosa è andato storto.
Chiama `WORK` il branch di lavoro corrente (es. `feat/...`, `refactor/...`, `dev`).

### Step 1 — Identifica il branch di lavoro
```bash
git branch --show-current
```
Se siamo già su `main`, avvisa e fermati: il merge parte sempre dal branch di lavoro.

### Step 2 — Verifica che WORK sia pulito
```bash
git status --short
```
Se ci sono modifiche non committate: ispezionale con `git diff`, poi committale
(o esegui `/save-work`) prima di continuare. Mai mergiare con il working tree sporco.

### Step 3 — Mostra cosa sta per essere mergiato
```bash
git log main..WORK --oneline
```
Elenca i commit che entreranno in main. Chiedi conferma all'utente: "Questi N commit
stanno per essere mergiati su main. Confermi?" — salta la domanda solo se l'utente
ha già chiesto esplicitamente il merge in questo scambio.

### Step 4 — Aggiorna main e fai il merge
```bash
git remote -v   # prima verifica se esiste un remote
git checkout main
git pull origin main   # SOLO se esiste un remote, altrimenti salta
git merge WORK --no-ff -m "merge: integra sessione $(date '+%Y-%m-%d') da WORK"
```

### Step 5 — Verifica post-merge
```bash
npm test
```
La suite (`node --test`, 144+ test) deve passare al 100% sullo stato mergiato.
Se fallisce: `git reset --hard ORIG_HEAD` su main, torna su WORK e indaga.

### Step 6 — Push di main
```bash
git push origin main
```
SOLO se esiste un remote. Se non c'è, segnala che il repo vive solo su disco
(niente backup remoto) e prosegui.

### Step 7 — Torna sul branch di lavoro
```bash
git checkout WORK
```

### Step 8 — Riepilogo
Mostra:
- Quanti commit sono stati mergiati
- Il nuovo HEAD di main (hash + messaggio del merge commit)
- Esito della suite di test
- Conferma che siamo tornati su WORK

## Note
- Il merge usa `--no-ff` (no fast-forward) per mantenere traccia esplicita di ogni
  sessione di lavoro nella storia del repo.
- Storia: fino a giugno 2026 il flusso era `dev` → `MappAI_main`; quei branch non
  esistono più. Il default branch è `main`, il lavoro avviene su branch `feat/*`
  o `refactor/*` (aggiornato 6 luglio 2026 dopo il merge dell'innesto BERT).
