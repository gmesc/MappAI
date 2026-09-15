# Sentence Transformers locale — verifica del 15 settembre 2026

## Esito e perimetro

Branch `codex/sentence-transformers-locale`, base `d034020`, creato da `main` con copia di lavoro inizialmente pulita. Le modifiche preesistenti già nella base Git sono conservate. Nessun push.

**S0–S4 implementate. S5 tecnica eseguita con modelli reali e build arm64; la validazione indipendente delle annotazioni rimane aperta.** Il banco è esplorativo: le 60 richieste e i passaggi attesi sono stati preparati dall’agente e controllati letteralmente sugli snapshot. Questo controllo non sostituisce la revisione umana richiesta dal piano. Nessuna promozione del recupero a sostituto del contesto completo del giudice.

Nessun intervento UDL, nessuna modifica ai preset o al rendering dei materiali PDF. Il worker PDF.js locale riguarda esclusivamente la lettura delle fonti. Nessuna proposta o nuova decisione applicata ai progetti originali.

## Componenti consegnati

| Fase | Implementazione / riscontro |
|---|---|
| S0 | Regole, grafo esistente, flusso fonti → snapshot → bozze → decisioni; copie temporanee e hash degli originali. |
| S1 | Python dedicato, Sentence Transformers/PyTorch/NumPy, modelli reali BGE ed E5, MPS e CPU esplicita. |
| S2 | SQLite FTS5, vettori float32 normalizzati, ricerca esatta NumPy, RRF e CrossEncoder; riuso per hash, aggiornamento atomico, rimozioni, manifest, contesto adiacente. |
| S3 | Processo persistente JSONL; main Electron risolve runtime/cache; IPC ristretto alla finestra principale, limiti, cancellazione, timeout, isolamento, uscita del worker. |
| S4 | Preparazione PDF all’importazione in una cache separata; sincronizzazione del progetto su generazione, bozze, salvataggio e riapertura. Pannelli nei modali del nodo, relazione e revisione, incluse revisioni senza pendenti; IT/EN e KaTeX. |
| S5 | Banco da 60 casi, confronto delle quattro strategie e reranking diretto; regressioni e QA reale arm64. Annotazioni ancora da rivedere da parte di un docente. |

Gli adattatori riusano `ReviewCore.preview`, `ReviewContext.occurrenceSnapshot`, `MaterialDrafts.flatten` e `Grounding.originalExcerpt`. Le decisioni vengono lette su una copia per calcolare il testo corrente: non vengono salvate nuove decisioni. I campi domanda/opzioni/risposta/guida/criteri e le relazioni complete sono indicizzati separatamente. La modalità Prove esclude sempre generati e testi del docente.

## Ambiente e configurazione

- Apple M5, 34.359.738.368 byte di RAM (32 GiB), verificati con sysctl. macOS 26.6.2, Python 3.13.13 arm64; Electron 41.10.7, electron-builder 26.15.3.
- Sentence Transformers 6.0.1, PyTorch 2.14.0, NumPy 2.5.3, Transformers 5.17.0, Tokenizers 0.23.2, Hugging Face Hub 1.31.0. Lock completo delle 41 dipendenze in `local-ai/requirements.txt`.
- MPS, precisione float32, batch 4, frammenti fino a 320 token effettivi, coppie reranker fino a 1024 token. I frammenti sono delimitati per token con preferenza per confini di frase/paragrafo; gli offset mantengono il testo grezzo.
- 20 candidati lessicali + 20 dense, RRF con costante 60, massimo 30 candidati rivalutati, prime 5 schede espandibili a 20.
- BGE dense: 1024 dimensioni, senza prefissi; E5: 768 dimensioni, `query: ` e `passage: `. Nessuna modalità sparse/ColBERT implicita.

| Modello | Revisione verificata |
|---|---|
| `BAAI/bge-m3` | `5617a9f61b028005a4858fdac845db406aefb181` |
| `BAAI/bge-reranker-v2-m3` | `953dc6f6f85a1b2dbfca4c34a2796e7dde08d41e` |
| `intfloat/multilingual-e5-base` | `d128750597153bb5987e10b1c3493a34e5a4502a` |

## Banco italiano: cosa è stato misurato

60 richieste: **30 taratura** sul PDF elettrico, **30 verifica** sul dossier storico. In ciascuna parte: 27 casi con un passaggio atteso e 3 casi senza prova attesa. Le due Officine condividono il PDF: restano entrambe nella taratura, senza contaminare la verifica. Il terzo dossier effettivamente usato è la copia di **10 Svizzera e 2a GM**, che contiene snapshot originali persistenti. Due ulteriori cartelle legacy sono state esaminate e poi escluse dal banco perché prive del registro `review`.

I corpus delle fonti contengono solo **29 frammenti per Officina e 9 per il dossier storico**. Recall@20 sulla verifica è quindi poco selettiva: tutte le nove candidate dense possono entrare nei primi venti. Il banco non misura dossier grandi o generalizzazione a nuove discipline. Il confronto E5 è un confronto esplorativo aggiuntivo; nessuna taratura è stata compiuta sulle risposte della verifica.

Un risultato conta se contiene il passaggio letterale annotato della fonte corretta. I casi senza prova sono esclusi dal denominatore di Recall e rendicontati separatamente. MRR@20 è la media del reciproco della posizione, con zero per un passaggio mancante.

### Recupero e tempi a caldo sul gruppo di verifica

| Modello / metodo | Recall@5 | Recall@20 | MRR@20 | p50 ms | p95 ms |
|---|---:|---:|---:|---:|---:|
|  Àncora lessicale esistente | 88.9% | 96.3% | 0.678 | 0.6 | 0.7 |
|  FTS5/BM25 | 100.0% | 100.0% | 0.938 | 0.7 | 0.8 |
| bge-m3 dense | 100.0% | 100.0% | 0.970 | 25.0 | 29.2 |
| bge-m3 ibrido | 100.0% | 100.0% | 0.975 | 24.6 | 29.5 |
| bge-m3 ibrido + reranker | 100.0% | 100.0% | 0.981 | 949.1 | 1031.8 |
| bge-m3 reranker diretto | 100.0% | 100.0% | 0.981 | 969.6 | 1056.5 |
| multilingual-e5-base dense | 100.0% | 100.0% | 0.963 | 28.9 | 35.5 |
| multilingual-e5-base ibrido | 100.0% | 100.0% | 1.000 | 29.3 | 36.1 |
| multilingual-e5-base ibrido + reranker | 100.0% | 100.0% | 0.981 | 1465.5 | 1584.0 |
| multilingual-e5-base reranker diretto | 100.0% | 100.0% | 0.981 | 1545.0 | 1640.0 |

### Taratura e casi critici

| Modello / metodo | Recall@5 | Recall@20 | MRR@20 | p50 ms | p95 ms |
|---|---:|---:|---:|---:|---:|
| bge-m3 / legacy | 66.7% | 85.2% | 0.389 | 1.6 | 1.9 |
| bge-m3 / lexical | 92.6% | 100.0% | 0.794 | 1.0 | 1.1 |
| bge-m3 / dense | 88.9% | 100.0% | 0.757 | 23.5 | 24.7 |
| bge-m3 / hybrid | 96.3% | 100.0% | 0.842 | 23.3 | 24.4 |
| bge-m3 / rerank | 96.3% | 100.0% | 0.932 | 1883.6 | 2268.4 |
| multilingual-e5-base / dense | 85.2% | 100.0% | 0.790 | 11.9 | 16.0 |
| multilingual-e5-base / hybrid | 96.3% | 100.0% | 0.869 | 11.0 | 16.1 |
| multilingual-e5-base / rerank | 96.3% | 100.0% | 0.932 | 2159.5 | 3871.3 |

- Nessuna perdita di Recall@20 rispetto alla baseline nei casi annotati, incluse negazioni, inversioni e condizioni omesse. Questo non dice se il testo recuperato sostiene o contraddice la domanda.
- **IT-018**, tensione e corrente come termini non equivalenti: passaggio atteso in posizione **6** dopo reranking con entrambi i modelli. Non compare nelle prime cinque schede; la baseline non lo recupera nei primi venti.
- La baseline manca quattro passaggi di taratura (IT-011, IT-017, IT-018, IT-020) e uno di verifica (IT-034). Nessun fallimento @20 di dense/ibrido/reranker sul campione.
- Nei **sei casi senza prova** dense/ibrido/reranker restituiscono comunque dei passaggi. Non esiste un rilevatore calibrato di “prova assente”. Nessuno score è una soglia scientifica.
- I tempi lessicali sono stati rimisurati senza l’inferenza dense superflua della prima versione; cinque esecuzioni per richiesta, mediana per caso. Gli altri tempi derivano da una passata per modello: ordine fisso, carico e temperatura non controllati. Non sono una classifica di velocità del Mac.

### Caricamento e memoria

| Embedding + reranker | Caricamento e prima inferenza | Picco RSS processo | Memoria driver MPS alla fine |
|---|---:|---:|---:|
| bge-m3 | 5.12 s | 1.44 GB | 5.36 GB |
| multilingual-e5-base | 4.61 s | 1.43 GB | 4.35 GB |

RSS e memoria Metal non si sommano come stime di RAM fisica indipendente; su Apple Silicon la memoria è condivisa. La misura Metal è una lettura finale, non un picco campionato. “A freddo” significa nuovo processo/modelli non caricati nel processo, con pesi già su disco; la cache del filesystem non è stata svuotata.

Indicizzazione fonti BGE: Officina Elettrica 2,53 s, Officina Project E 1,94 s, storia 0,63 s; riuso rispettivamente 7,1 / 7,0 / 3,4 ms. Queste misure riguardano le fonti, non tutti i materiali. CPU verificata separatamente con modelli veri: caricamento, indicizzazione di due pagine e ricerca in circa 5,62 s complessivi; non è un banco prestazionale CPU.

**Default provvisorio: BGE-M3 + bge-reranker-v2-m3 su MPS.** Sul gruppo di taratura BGE ha Recall@5 dense leggermente maggiore; dopo reranking qualità identica. La memoria misurata è compatibile con il Mac da 32 GB. E5 resta configurabile e usa circa 1 GB Metal in meno. Il vantaggio temporale osservato non basta a dimostrare superiorità, vista la metodologia. La scelta resta rivedibile dopo annotazioni indipendenti e un corpus più ampio.

## Sicurezza dei dati e limiti di estrazione

Il PDF della pagina 8 mostra **Ω**, mentre lo snapshot archiviato riporta **W** e sposta alcune righe delle tabelle. Confronto visivo effettuato sulla copia temporanea. Il testo non è stato corretto: vengono aggiunti soltanto avvisi e alias di ricerca separati. L’estrazione nuova segnala possibili tabelle/colonne in alcune pagine; è una euristica, con falsi positivi possibili. OCR, interpretazione delle tabelle e verifica scientifica restano fuori dal perimetro.

I PDF importati ora conservano anche SHA-256 del file: un allegato sostituito non viene aperto come se corrispondesse alla vecchia citazione. Nei progetti legacy senza quel digest l’identità binaria non è verificabile retroattivamente ed è dichiarata. Il testo recuperato viene controllato rispetto allo snapshot archiviato. Le fonti web importate conservano URL, titolo, data di acquisizione e testo letto; nessun crawler nuovo.

## Prove tecniche e applicazione

- Test Node: suite completa pertinente, con `live-server.test.js` escluso perché già documentato come sospeso. Risultato finale riportato sotto. Le prime esecuzioni nel sandbox fallivano anche sui server localhost: quelle non sono state considerate regressioni del codice.
- Test Python deterministici: persistenza/riuso, aggiornamento e rimozione, annullamento, rollback, crash reale del processo durante la transazione, isolamento, manifest incompatibile, cache corrotta, modello assente, pagine vuote, offset Unicode e contesto tra pagine. Vettori simulati: non sono prove semantiche.
- Protocollo con sottoprocesso reale simulato: Unicode, progresso, risposta malformata, timeout, chiusura; sessione precedente ripristinata dopo un aggiornamento annullato/fallito.
- Modelli veri: MPS, CPU e coppie oltre il limite del reranker; finestre esplicite con massimo dei punteggi e passaggio originale conservato, nessuna troncatura silenziosa.
- Banco dei modelli con `socket.connect` bloccato e flag Hugging Face offline: **zero tentativi di rete**. La UI di prova blocca HTTP/HTTPS nel renderer. Nessuna chiamata cloud è presente nel percorso locale.
- QA Electron dal repository e dalla build `isPackaged=true`, `arch=arm64`, con profili temporanei; screenshot a 1200 e 700 px. Nel dossier Officina Elettrica: **382 frammenti**, ricerca Prove/Occorrenze, 382 vettori riusati, un solo vettore aggiornato per una modifica, decisioni identiche. Ricerca prove circa 2,76 s e occorrenze 1,18 s nella prima QA di sviluppo.
- PDF.js worker incluso localmente: 24 pagine estratte senza CDN, PDF temporaneo aperto con successo dal comando della citazione. Il comando apre il file nel lettore predefinito, non garantisce il salto automatico alla pagina.
- Uscita ordinata dell’app: il PID del worker di sviluppo non esiste più (`ESRCH`). Firma, notarizzazione e distribuzione pubblica non effettuate.

Tre banchi ausiliari sono già rotti sulla base HEAD: `cornice-documenti` cerca `mappai-glossary.js` rimosso; `pipeline-lucchetto` usa attese obsolete sui preset; `visione-fogli` ha uno stub DOM incompleto. Riprodotti in una copia temporanea della base. Non sono stati modificati preset/PDF per far passare questi banchi. Passano `elenchi-elabora-insegna`, `studio-sidebar` e `scelta-materiali`.

## Riproduzione ed evidenze

- Banco annotato: `local-ai/italian-bank.json` (stato di revisione esplicito).
- Numeri completi e ranghi per caso: `local-ai/results-2026-09-15.json`.
- `node local-ai/prepare-eval.cjs /private/tmp/mappai-st-eval` legge solo le copie predisposte nelle sottocartelle `projects/`. Non copia né modifica gli originali.
- `python local-ai/evaluate.py --root /private/tmp/mappai-st-eval --model BAAI/bge-m3` e stessa chiamata con `intfloat/multilingual-e5-base`, usando il Python del runtime installato.
- `node --test tests/local-search.test.js`; `python local-ai/test_worker.py` per le prove deterministiche.
- `local-ai/electron-qa.cjs`, `electron-import-qa.cjs` e `cdp-command.cjs`: strumenti per istanze di prova già avviate su porte esplicite, con sole copie in `/private/tmp`. Non inserirvi profili personali.
- Evidenze estese e screenshot in `/private/tmp/mappai-st-eval`; dati dei progetti non inclusi nel repository. I file temporanei possono essere rimossi dal sistema.

[Guida a installazione, uso, cache e rimozione](GUIDA-ricerca-locale.md). Licenze in `THIRD-PARTY-NOTICES.md`; fonti tecniche: [Sentence Transformers](https://www.sbert.net/docs/sentence_transformer/usage/efficiency.html), [BGE-M3](https://huggingface.co/BAAI/bge-m3), [reranker](https://huggingface.co/BAAI/bge-reranker-v2-m3), [E5](https://huggingface.co/intfloat/multilingual-e5-base).

## Risultati conclusivi

- Regressione finale: **1.538 test Node, 1.536 superati, zero fallimenti, due skipped**; escluso `live-server.test.js` per il blocco preesistente. **9 test Python superati**.
- Build definitiva Electron: **15/15 controlli di integrazione superati**, `isPackaged=true`, `arch=arm64`, inferenza MPS reale. Verificati interfaccia a 700/1200 px, filtri Prove/Occorrenze, riuso, modifica incrementale, invalidazione e isolamento. Dopo la chiusura anche il worker della build è terminato (`ESRCH`).
- Officina Project E completa: **1.115 frammenti** indicizzati; 123 impulsi del timer UI a intervalli nominali di 25 ms durante il lavoro, decisioni identiche prima/dopo. È una verifica di reattività, non una misura rigorosa della latenza del renderer.
- Importazione automatica reale: **24 pagine**, digest SHA-256 registrato e avvisi di estrazione; cache della fonte preparata senza sottrarre la sessione del progetto alla ricerca corrente.
- Controllo finale degli originali: **376 file verificati con SHA-256, zero modifiche** nelle cinque cartelle esaminate. Tutte le prove sui progetti sono state eseguite su copie temporanee.
- Copia locale avviabile: `dist-local-ai-arm64/MappAI.app` nel repository, circa 295 MB, esclusa da Git. Runtime e modelli già installati nell’area dell’app su questo Mac. Build locale senza firma/notarizzazione.

Rimane da completare la **revisione indipendente delle annotazioni**, richiesta dal piano prima di considerare validato il banco. Il Recall@20 del 100% sui 27 casi positivi di verifica è un risultato esplorativo di pertinenza, non una certificazione scientifica; nei casi senza prova il sistema può comunque restituire passaggi.
