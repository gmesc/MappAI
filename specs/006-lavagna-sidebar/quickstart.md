# Quickstart — Validazione manuale "Lavagna nella sidebar" (006)

Verifica end-to-end. Prerequisiti: `npm install`, una mappa con più rami/livelli,
un telefono sulla stessa rete per il flusso studente reale.

## 0. Suite automatica

```bash
npm test    # atteso verde, incluso il nuovo test /api/reopen in collab-server.test.js
```

## 1. Albero collassato di default (US4)

```bash
npm start
```

- Apri una mappa, vai al tab **Struttura**.
- ✅ I rami sono tutti **collassati** (solo macro-aree di primo livello).
- ✅ Espandi un ramo → compaiono i figli; gli altri restano collassati.
- ✅ In fondo all'albero c'è il bottone **"avvia condivisione QR"**.
- Kill-switch: `localStorage.mappai_tree_expanded_default='1'` → riavvio → albero espanso come prima.

## 2. Dashboard nella sidebar (US1)

- Avvia la condivisione dal bottone in fondo all'albero.
- ✅ Nel tab Struttura appaiono **QR + URL + sezione gruppi** — la **mappa resta visibile** (nessun popup che la copre).
- ✅ Collega un gruppo dal telefono → la lista nella sidebar si aggiorna da sola (≤ pochi secondi) e l'overlay compare sulla mappa.
- Kill-switch: `localStorage.mappai_collab_legacy_modal='1'` → la gestione torna nel popup storico.

## 3. Pannello fluttuante staccabile (US1)

- Premi **"stacca"** → compare il pannello fluttuante con QR + gruppi.
- ✅ Collassa/espandi il pannello: da collassato mostra solo l'intestazione, non copre la mappa.
- ✅ Un'azione su un gruppo (es. nascondi layer) si riflette **sia** nel pannello **sia** nella sidebar.
- ✅ Utile per la LIM: espandi e proietta il QR grande (clic sul QR = fullscreen, come oggi).

## 4. Sblocca gruppo (US2)

- Dal telefono premi **"Fatto ✓"** → nel docente compare il badge ✓ sul gruppo.
- Premi **"sblocca"** su quel gruppo.
- ✅ Entro il tick successivo il badge ✓ **sparisce** (gruppo "in corso").
- ✅ Aggiungi altri nodi dal telefono → continuano ad arrivare e comparire sull'overlay.
- ✅ Ripremi "Fatto ✓" → il badge ✓ ricompare.

## 5. Controlli per-gruppo (US3)

Con 2+ gruppi:
- ✅ **ON/OFF**: nascondi il layer di un gruppo → il suo overlay sparisce, gli altri restano.
- ✅ **SOLO**: mostra solo un gruppo (profondità base si adatta come oggi).
- ✅ **rinomina**: la nuova etichetta appare sull'overlay.
- ✅ **JSON**: esporta la mappa del gruppo → file importabile in MappAI.
- ✅ **Termina sessione** + **Apri cartella** presenti; **nessun** bottone "Salva".

## 6. Sidebar ridimensionabile (US5)

- Trascina il bordo destro della sidebar.
- ✅ Si allarga fino a **metà finestra** e non oltre; si stringe fino al **minimo** (320px) e non meno.
- ✅ Riavvia l'app → la sidebar riapre alla **larghezza scelta**.
- ✅ Ridimensiona la finestra dell'app dopo aver allargato → la sidebar non supera il 50% della nuova finestra.

## 7. Regressioni

- ✅ Overlay contributi (nodi + link al concetto centrale) corretto in tutte le collocazioni (fix 003 preservato).
- ✅ Ripresa sessione / stop / apri cartella funzionano come prima.
- ✅ Switch lingua EN→IT→EN: etichette nuove tradotte nei due sensi.
- ✅ Altri tab sidebar (Note, Studio, Finder, Tutor) invariati.

## Riferimenti

- Schemi/stati: [data-model.md](data-model.md)
- API/endpoint: [contracts/api-and-ui.md](contracts/api-and-ui.md)
- Decisioni: [research.md](research.md)
