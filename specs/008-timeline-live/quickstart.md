# Quickstart — validazione 008-timeline-live

Guida di verifica end-to-end. Prerequisiti: progetto con mappa generata e
fonti caricate (per avere anni nel testo), una classe negli Account classi,
telefono (o 2° browser) sulla stessa rete del PC docente.

## 0. Suite automatica

```bash
npm test          # tutta la suite: deve restare verde (382 esistenti + nuovi)
```

## 1. US1 — Base in-app (senza rete)

1. `npm start` → apri il progetto → menu Stampa dossier → **Crea Timeline** → genera.
2. Nel popup: **+ Aggiungi data** → anno 1949, evento "Nascita della NATO" → Salva.
   ✅ card in posizione cronologica, marcata ✏️, bottone elimina presente.
3. Chiudi app, riapri, rigenera la timeline.
   ✅ la data manuale c'è ancora, nessun duplicato. (Pool: in console
   `appState.db.timelineAI.length > 0` dopo la generazione.)
4. Attiva **Modalità esercizio** nel popup.
   ✅ card-buco sugli anni citati dalle fonti e assenti; 💡 mostra l'estratto;
   compilando, la card si completa (origine 🎓).
5. Chiudi la finestra principale, prova ad aggiungere una data dal popup.
   ✅ avviso chiaro, nessun errore silenzioso.

## 2. US2 — Completa la timeline (QR)

1. Menu azioni → **MappAI Live** → card **Timeline** → modalità **Completa**:
   classe, 6 domande, direzione mista, formato aperta, indizio "su richiesta",
   tolleranza ±2, login individuale → Avvia. (≤4 interazioni dal menu Live: conta.)
2. Telefono: inquadra QR → login emoji+numero → rispondi:
   - evento con refuso lieve → ✅ accettato;
   - anno a distanza 2 → ✅ accettato; a distanza 3 → ❌;
   - apri 💡 su una domanda prima di rispondere.
3. DevTools rete sul PC docente durante il lancio: ✅ ZERO chiamate AI.
4. Chiudi la sessione → ✅ 2 report: domande in ordine cronologico, colonna
   indizi valorizzata per la risposta col 💡.
5. Rilancia con formato **scelta multipla** → ✅ opzioni = altri eventi del pool;
   ispeziona `/api/session` dal telefono: nessuna chiave di risposta presente.
6. Wizard con pool vuoto (progetto nuovo): ✅ CTA "Genera prima la Timeline".

## 3. US3 — Costruisci la timeline (QR)

1. Card Timeline → **Costruisci**: buchi+libere, max 3 proposte, login
   individuale → Avvia.
2. Telefono A: proponi evento per un buco (usa il 💡). Telefono B: proposta
   libera con anno inventato (es. 2947) e una copia esatta della proposta di A.
3. Dashboard docente: ✅ le proposte arrivano (polling ≤3s), flag "duplicato"
   su quella di B, flag "anno non citato dalle fonti" su 2947.
4. Approva la proposta di A, boccia il duplicato.
   ✅ approvata → compare nel popup timeline del progetto (origine 🎓 + autore);
   4ª proposta dello stesso studente → rifiutata con messaggio (cap 3).
5. Chiudi con una proposta ancora pending.
   ✅ report Costruisci: per studente approvate/bocciate/in attesa + timeline
   finale stampabile; la pending NON è nel progetto.
6. Stampa una nuova timeline: ✅ l'evento approvato c'è, zero chiamate AI.

## 4. US4 — Proiezione LIM

1. Sessione Costruisci attiva → **Proietta sulla LIM** (fullscreen, QR in angolo).
2. Dal portatile approva una proposta.
   ✅ la card compare sulla proiezione entro 5 secondi. ESC → dashboard, la
   sessione continua.

## 5. US5 — Login flessibile

1. Timeline Completa con login **a gruppi**: 2 device joinano lo stesso nickname.
   ✅ 2° device stesso nick = 409/ripresa secondo regola device; report aggrega
   per gruppo.
2. Lavagna collaborativa con login **individuale**: ✅ join emoji+numero contro
   roster, contributi attribuiti al singolo in dashboard; lancio senza opzione →
   ✅ comportamento storico a gruppi identico (regressione zero).

## 6. US6 — Tab LIM

1. Sidebar → tab **LIM**: ✅ card attività con avvio diretto.
2. Avvia la Lavagna: ✅ dashboard sia nel tab LIM sia in Struttura, stesso stato.
3. `localStorage.setItem('mappai_lim_tab','0')` + reload: ✅ tab nascosto,
   tutto il resto invariato.

## 7. Crash-safety e retrocompatibilità

1. A sessione Timeline aperta, uccidi l'app e riavvia → riprendi la sessione.
   ✅ stesso token, QR già distribuiti validi, risposte/proposte ritrovate.
2. Apri un progetto salvato PRIMA della feature.
   ✅ nessun errore console; timeline generabile; pool parte vuoto.
3. Regressione attività esistenti: lancia uno Studio attivo live V/F e un
   Tutor QR. ✅ comportamento invariato.
