# Quickstart — Validazione manuale "Costruisci / Insegna" (005)

Guida di verifica end-to-end in Electron vivo. Prerequisiti: `npm install` fatto,
almeno 1 progetto salvato, almeno 1 classe in Account classi (con grade compilato,
es. "1ª media").

## 0. Suite automatica

```bash
npm test          # attesi: tutti verdi, incluso tests/teach-core.test.js
```

## 1. Avvio diretto (US1)

```bash
npm start
```

- ✅ Si apre DIRETTAMENTE la landing MappAI (nessun launcher).
- ✅ Sotto l'hero: toggle "Costruisci / Insegna" (hero identica a prima).
- ✅ Primo avvio → modalità Costruisci; passare a Insegna, chiudere, riavviare →
  riparte su Insegna.
- ✅ Menu azioni → "Knowledge Garden" apre ancora la finestra Studio.
- Kill-switch: creare `<userData>/mappai-settings.json` con
  `{"legacyLauncher": true}` → riavvio → torna il launcher storico. Rimuovere il
  file → boot diretto. (userData: `~/Library/Application Support/MappAI` su macOS
  in build; in dev quella di Electron.)

## 2. Costruisci: sezione progetti + grade (US4)

- ✅ Il drawer fisso in basso NON esiste più.
- ✅ Sezione collassabile "Progetti", CHIUSA di default; aprendola: tabella
  Tipo/Titolo/Classe/Nodi/Creato + azioni Riprendi/Elimina invariate.
- ✅ Menu grade su una riga → assegnare "1ª media" → riavvio → grade persistito.
- ✅ Il resto della landing Costruisci = identico a prima (generazione MM/KG ok).

## 3. Insegna: sezioni e filtro (US3)

Preparazione: generare su un progetto una sintesi (o dossier), un foglio nodi,
una timeline e un quiz; risalvare il progetto (basta una modifica qualsiasi).

- ✅ Sezione "Materiali di studio": compaiono sintesi/dossier E foglio nodi E
  timeline, con grafo di origine e classe; click → si riapre senza rigenerare.
- ✅ Sezione "Quiz & flashcard": il set appare con nome, tipo, grafo, classe, data.
- ✅ Progetto pre-feature: i suoi set NON appaiono finché non viene risalvato.
- ✅ Toggle "Solo classe attiva" (chip su una classe): tutte le sezioni si
  restringono agli elementi della classe; chip su "Generico" → nessun filtro.

## 4. Quick-start QR (US2)

Con una classe "1ª A" (grade "1ª media") e un progetto con grade "1ª media":

- ✅ "Lavagna interattiva" → popup classi → scelta "1ª A" → elenco mappe in 3
  fasce (avviate sulla classe / stesso grade / altre) → scelta mappa → il
  progetto si carica e si apre l'hub Lavagna. Interazioni dal click sul
  quick-start: ≤ 4.
- ✅ "Studio attivo live" → stesso flusso → si apre il wizard live.
- ✅ "Materiali di studio" → classe → scelta documento archiviato → pannello
  Materiali con QR e file pubblicato (nessuna mappa caricata necessaria).
- ✅ Dopo l'avvio della Lavagna: nella sezione Progetti la riga della mappa
  mostra il chip "1ª A" (registro sessioni scritto).
- ✅ Nessuna classe creata: il popup propone "Crea una classe" / "Continua senza
  classe"; senza classe → sessione avviata, nessun chip.
- ✅ Progetto SENZA grade selezionato con classe attiva → il grade della classe
  viene salvato sul progetto (verificare nella sezione progetti di Costruisci).

## 5. Archivio esteso (US5)

- ✅ Generare >30 documenti (o abbassare temporaneamente il cap da console) →
  il più vecchio viene scartato, nessun errore.
- Console: `MappAIStudyDocs.list().length` ≤ 30.

## 6. Regressioni (SC-005)

- ✅ Generazione MM e KG dalla landing Costruisci: invariata.
- ✅ Import JSON, apertura vault, hub Materiali/Graph manager dal menu: invariati.
- ✅ Uscita segreta (5 click angolo alto-sinistra) → launcher → Studio: funziona.
- ✅ Switch lingua EN→IT→EN: tutte le etichette nuove tradotte nei due sensi.

## Riferimenti

- Schemi store: [data-model.md](data-model.md)
- Firme API: [contracts/storage-and-api.md](contracts/storage-and-api.md)
- Decisioni: [research.md](research.md)
