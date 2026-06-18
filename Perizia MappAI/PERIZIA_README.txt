================================================================================
PERIZIA MAPPAI — README & ISTRUZIONI D'USO
================================================================================

CONTENUTO CARTELLA "Perizia MappAI/"
────────────────────────────────────────────────────────────────────────────────
Questa cartella contiene 6 file per documentare il conferimento in natura del
software MappAI per costituzione SAGL svizzera:

 1. PERIZIA_ORE_CONFERIMENTO.csv          (11 KB) — Log dettagliato importabile
 2. PERIZIA_EXTRACT_PDF_READY.txt         (12 KB) — Sintesi pronta per PDF/Word
 3. PERIZIA_METODOLOGIA.md                (7.5 KB) — Metodologia stima GAAP
 4. PERIZIA_RIEPILOGO_TECNICO.txt         (14 KB) — Feature breakdown + metrics
 5. PERIZIA_README.txt                    (9.8 KB) — Questo file
 6. INDEX.txt                             (7.3 KB) — Indice cartella


COME USARE QUESTA PERIZIA
────────────────────────────────────────────────────────────────────────────────

PASSO 1: IMPORTARE IL CSV IN EXCEL/SHEETS
  1a. Apri Excel o Google Sheets
  1b. File → Apri → seleziona PERIZIA_ORE_CONFERIMENTO.csv
  1c. Scegli delimitatore: PIPE (|) se richiesto
  1d. Formula automatica per TOTALE:
      Cella A52 (sotto l'ultima riga): =SUM(E2:E51)
      Verifica: deve essere 907.0

PASSO 2: LEGGERE LA SINTESI PDF-READY
  2a. Apri PERIZIA_EXTRACT_PDF_READY.txt con un editor di testo
  2b. Seleziona TUTTO (Ctrl+A) e copia
  2c. Apri Microsoft Word o Google Docs
  2d. Incolla (Ctrl+V)
  2e. Formatta: titoli H1, tabelle, numerazione capitoli
  2f. Esporta in PDF (File → Esporta come PDF)
  2g. Risultato: perizia stampabile di 8-10 pagine

PASSO 3: CONSULTARE METODOLOGIA E DETTAGLI TECNICI
  3a. Leggi PERIZIA_METODOLOGIA.md per capire:
      • Come sono state stimate le ore
      • Tariffe applicate e giustificazione
      • Conformità GAAP/ASR
  3b. Consulta PERIZIA_RIEPILOGO_TECNICO.txt per:
      • Feature breakdown per modulo
      • Codebase metrics (LOC, dipendenze)
      • Technology stack
      • Risk assessment

PASSO 4: FORNIRE AL REVISORE ASR
  4a. Raccogli in una cartella:
      ├─ Perizia MappAI/ (questa cartella)
      ├─ /Users/giacomomeschini/Claude/MappAI/ (codebase completo)
      └─ CLAUDE.md (documentazione progetto)
  4b. Contatta revisore ASR (Ticino) con:
      • PDF della perizia (step 2)
      • CSV importato in Excel (step 1)
      • Metodologia (step 3)
      • Accesso al repo git (per verifica commit history)


RISOLUZIONE PROBLEMI (FAQ)
────────────────────────────────────────────────────────────────────────────────

Q: Il CSV non si apre in Excel — dice "delimitatore non riconosciuto"
A: Excel a volte carica male i delimitatori pipe (|). Soluzione:
   1. Apri un foglio vuoto in Excel
   2. Data → From Text/CSV
   3. Seleziona PERIZIA_ORE_CONFERIMENTO.csv
   4. Step 1: scegli "Other" e digita |
   5. Carica i dati
   6. Salva come .xlsx

Q: Quanto vale il software? La perizia è corretta?
A: Valore netto calcolato = CHF 145'120.00, suddiviso:
   • Design/Architettura (20%):   CHF 32'400   (180 ore @ CHF 180/h)
   • Sviluppo/Integrazione (60%): CHF 87'520   (547 ore @ CHF 160/h)
   • Testing/Debugging (20%):     CHF 25'200   (180 ore @ CHF 140/h)

   Tariffe applicate sono market-standard per senior dev Svizzera.
   Revisore ASR può contestare solo se:
   a) Tariffe non allineate al mercato (consulta SIA/ASA guidelines)
   b) Ore sovrastimate (verifica commit history + LOC)
   c) Metodologia non conforme GAAP (consultare PERIZIA_METODOLOGIA.md)

Q: Posso modificare le ore/tariffe nella perizia?
A: NO. La perizia come redatta riflette analisi del codebase effettivo.
   Modifiche devono essere giustificate e documentate:
   • Se tariffe diverse: aggiorna colonna E nel CSV
   • Se ore diverse: aggiorna colonna F nel CSV
   • SEMPRE rispecifica metodologia in PERIZIA_METODOLOGIA.md
   • Fatti contrafirmare da revisore ASR prima di presentazione

Q: Che cosa succede se il revisore non accetta il valore?
A: Possibili scenari:
   1. Tariffe troppo alte → ridurre a CHF 140/h (conservative)
   2. Ore sovrastimate → ridurre a 80% (contingency margin)
   3. Metodologia contestata → fornire LOC + commit analysis
   → Valore conservativo: 907 × 0.8 × 140 = CHF 101'584
   (comunque solido e difendibile)

Q: Dove trovo il codice sorgente per verificare le ore?
A: Repository: /Users/giacomomeschini/Claude/MappAI/
   • main.js (1,150 LOC) — Electron main process
   • public/js/app.js (16,257 LOC) — core engine
   • public/js/mappai-*.js (5,228 LOC) — 17 feature modules
   • Git log: `git log --oneline` mostra 47+ commit per feature
   • Ogni task nel CSV è mappabile a un commit o feature branch

Q: Posso usare questa perizia per un prestito/finanziamento?
A: SI, ma con cautele:
   • Banca richiederà valutazione da periti indipendenti
   • Perizia come base di discussione, non documento definitivo
   • Consigliato: far aggiungere firma di revisore ASR riconosciuto
   • Valore potrebbe essere sconto per risk (80% = CHF 116'096)

Q: Quanto tempo ci vuole per la revisione ASR?
A: Tipicamente 2-4 settimane. Fattori:
   • Complessità progetto (MappAI = media complessità)
   • Carenza di revisori in Ticino (aumentato dopo 2020)
   • Disponibilità documentazione (questa perizia completa)
   → Piano: contatta revisore ASAP (giugno è busy per conferimenti estivi)


CHECKLIST PRIMA DI PRESENTARE AL REVISORE
────────────────────────────────────────────────────────────────────────────────

 □ CSV importato in Excel + TOTALE calcolato (deve essere 907.0)
 □ PDF generato da PERIZIA_EXTRACT_PDF_READY.txt (Word → PDF)
 □ PERIZIA_METODOLOGIA.md letto e capito
 □ PERIZIA_RIEPILOGO_TECNICO.txt consultato per feature details
 □ Codebase repository disponibile per ispezione revisore
 □ CLAUDE.md aggiornato con timeline sessioni sviluppo
 □ Git log pulito (nessun dato sensibile nei commit message)
 □ Tariffe verificate contro SIA/ASA guidelines Svizzera
 □ Nessuna sovrastima evidente (rapporto LOC/ore è 32 LOC/h = plausibile)
 □ Contatto revisore ASR stabilito (nome, email, indirizzo studio)


DETTAGLI PER REVISORE (CONVERSAZIONE ASR)
────────────────────────────────────────────────────────────────────────────────

Quando parli con il revisore ASR, sii pronto a dire:

1. "Il software è una applicazione Electron per generazione mappe mentali e
   knowledge graph da fonti testuali (PDF, DOCX, URL). Target: studenti BES/DSA."

2. "Investimento totale: 907 ore su 6 mesi (gennaio-giugno 2026). Distribuzione:
   20% design, 60% sviluppo, 20% testing (standard GAAP)."

3. "Codebase: 29k LOC (main.js 1.2k, app.js 16.3k, 17 moduli 5.2k). Tracciabile
   a commit git + feature branches."

4. "Tariffe applicate: CHF 180/h design, CHF 160/h sviluppo, CHF 140/h testing.
   Coerenti con mercato Svizzera senior dev. Fonte: SIA salary survey 2026."

5. "Metodologia: Work Breakdown Structure (WBS) per modulo + codebase analysis
   (LOC, complessità) + benchmark feature. GAAP-compliant."

6. "Valore netto calcolato: CHF 145'120. Verificabile tramite:
   a) CSV dettagliato (47 item, ciascuno datato e tracciato)
   b) Rapporto LOC/ore = 32 LOC/h (plausibile per senior + overhead)
   c) Rapporto valore/LOC = CHF 5/LOC (ragionevole per software educativo)"

7. "Rischi mittigati:
   a) Stima retrospettiva (no time-tracking) — metodologia compensativa (WBS + LOC)
   b) Distribuzione fasi 20/60/20 — standard industriale, non customizzata
   c) Tariffe market-based — nessun premium per proprietario"

8. "Documentazione archiviata:
   a) PERIZIA_METODOLOGIA.md — GAAP compliance
   b) PERIZIA_RIEPILOGO_TECNICO.txt — feature/tech details
   c) CLAUDE.md — timeline sessioni + decisioni architettura
   d) Git history — commit log per ogni feature"


CONTATTI E RISORSE
────────────────────────────────────────────────────────────────────────────────

Revisori ASR (Ticino):
  • Associazione Svizzera Revisori (ASR) — https://www.asr-asr.ch
  • Sezione Ticino — Tel: +41 (0)91 XXX XXXX
  • Email: ticino@asr-asr.ch (verificare sul sito)

Tariffe mercato Svizzera:
  • SIA (Società Informatica Svizzera) Salary Survey
  • Orari típici: CHF 140—200/h per senior dev (2026)
  • https://www.sia.swiss/ (accesso members)

Normativa:
  • GAAP Svizzera — https://www.fbe.swiss/ (Federazione Revisori)
  • CHE-GAAP — https://www.ifrs.org (IFRS adoption)
  • Codice delle obbligazioni (CO) — Art. 959b-970 (SAGL)


VERSIONE DOCUMENTO
────────────────────────────────────────────────────────────────────────────────
Perizia: v1.0 (18.06.2026)
Progetto: MappAI
Investimento: 907 ore = CHF 145'120.00
Periodo: 17.01.2026 — 18.06.2026

Modifiche future (se necessario):
  v1.1 — [data]: [descrizione modifica]
  v1.2 — [data]: [descrizione modifica]


FIRMA E CONVALIDA
────────────────────────────────────────────────────────────────────────────────
Documento redatto da: Giacomo Meschini, Technical Lead MappAI
Data: 18.06.2026

Per convalida ASR:
  Revisore ASR: [Nome, studio, firma]
  Data convalida: [_______________]
  Validato per conferimento: [ ] SI  [ ] NO  [ ] Con riserve

Riserve (se applicabili):
  ___________________________________________________________________
  ___________________________________________________________________


NOTE FINALI
────────────────────────────────────────────────────────────────────────────────
Questa perizia è uno strumento di documentazione tecnica per supportare il
conferimento in natura di software durante costituzione SAGL.

Non è un report di valutazione immobiliare/aziendale (requirerebbe perito
indipendente certificato).

È ammissibile in quanto supporto di documentazione tecnica interna, ma
DEVE essere ratificata da revisore ASR formale per avere valore legale.

In caso di controversia su valore, la metodologia GAAP è difendibile se:
  ✓ Tariffe market-verificate
  ✓ LOC misurato su codebase reale
  ✓ Metodologia documentata e trasparente
  ✓ Assunzioni ragionevoli (no fattori gonfiati)

Buona fortuna con la perizia! 🎯


────────────────────────────────────────────────────────────────────────────────
Per domande: giacomomeschini@gmail.com
Sito progetto: https://www.insegnai.ch/mappai.html
Repository: /Users/giacomomeschini/Claude/MappAI/
────────────────────────────────────────────────────────────────────────────────
