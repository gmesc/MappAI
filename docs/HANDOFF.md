# HANDOFF — MappAI, stato di `main`

> **Questo è l'unico documento di stato.** Dice che cosa c'è in `main` OGGI, che cosa è
> acceso, che cosa manca e come si verifica. Scritto il **12 agosto 2026** unificando i
> tre handoff precedenti, che da qui in poi sono **diari**: si leggono per il *perché* di
> una decisione, mai per sapere com'è fatto il codice adesso.
> Ultimo allineamento: **19 agosto 2026**. La giornata in una riga: **il CARATTERE
> si sceglie** — quattro caratteri (Space Mono · TestMe Sans · TestMe Alt · Atkinson
> Hyperlegible), uno per l'app dalla Cabina e uno per il singolo documento in ELABORA; e
> **tutti i caratteri sono locali**, mentre fino a stamattina perfino Space Mono arrivava
> da una CDN in nove documenti stampabili. OpenDyslexic in pensione.
> Prima, in giornata: **il PDF della mappa torna VETTORIALE** — il ripiego raster non
> scatta più (debito §4 7-bis, chiuso).
> Prima: **17 agosto 2026, sera**. La giornata in una riga: **la VOCE della
> sintesi diventa usabile** (si registra anche dopo, scrive la copia parlante, si può
> annullare, dice quanto costa prima e riprende il giorno dopo dai blocchi mancanti), i
> **file del vault prendono nomi che dicono a chi appartengono** (set, materiali, mappa
> esportata) e il **pathfinder è stato pensionato**. Dodici commit, tutti su `main`.
>
> Progetto: Giacomo Meschini — giacomo@insegnai.ch

---

## 0. Le prime cose da sapere

0-bis. **⟵ DA QUI SI RIPRENDE (20/8 sera): un'IMMAGINE produce le domande aperte e le
   flashcard.** Nasce da una richiesta di docenti di **storia di scuola media**: da una
   fonte iconografica — una miniatura, un manifesto, una carta — si ricavano (1) un testo
   di **contesto e descrizione** e (2) i fogli di **domande aperte, uno per angolo**, con
   **l'immagine in testa**, o le **flashcard**.
   La legge un modello **in casa** (Ollama + `qwen2.5vl:7b`): la foto non lascia il
   computer. ⚠️ `node-llama-cpp`, il motore locale che l'app ha già per gli NPC, **non fa
   visione** — misurato, zero simboli `mtmd`/`mmproj` nei binari.
   ⚠️ **La cosa da non dimenticare**: un modello di visione **descrive bene e
   contestualizza male**. Fra la lettura e la generazione c'è una **scheda che il docente
   corregge**, e i due campi sono separati apposta — se il contesto fosse un'ipotesi del
   modello, sette fogli nascerebbero da una premessa inventata, con l'errore nel punto in
   cui nessuno lo cerca. Il testo nudo, quando la risposta non arriva in forma, diventa
   **descrizione** e mai contesto.
   Il taglio nel motore è **tre righe** (`opts.sorgente` in `Pipeline.generaSet`, a monte
   del ciclo sui rami): angoli, nomi, archivio, PDF e le righe di ELABORA sono quelli di
   sempre. ⚠️ **Mai girato in Electron**: la lista è in §5, in testa.

0. **Le attività «a scelta» sono COMPLETE, sei fasi su sei.**
   In `main`: il box **«Più set per angolo»** nel bento (A), il **core** (B), la **superficie
   a tre passi** (C), la **Live** — server `mode:'scelta'`, pagina studente, report, card nel
   hub e in INSEGNA (D) — il **guscio in-app** (E) e la **pensione** delle sette modalità
   storiche e del Cloze (F).
   **Lo Studio attivo non smonta più la mappa.** Le sette modalità che ricostruivano il grafo
   sul canvas sono state cancellate insieme al Cloze: `mappai-active-study.js` è passato da
   **1832 a 190 righe** — resta il solo launcher — e con loro sono cadute `session`,
   `emergencyExit`, lo snapshot del grafo e le **nove guardie** che sei moduli tenevano per
   non litigare con una sessione attiva. Il launcher apre ora **Domande a scelta · Quiz a
   scelta · Palazzo**, più le due viste e i due strumenti.
   ⚠️ **Niente di tutto questo è mai girato in Electron**: è misurato nei test puri, in tre
   banchi e in due tornate di revisione avversaria (otto agenti). La lista di che cosa provare
   è in §5 — e dopo la fase F la prima riga è *aprire una mappa e verificare che la gerarchia
   resti intatta*.
   ⚠️ La cosa da non dimenticare: l'attività **non è «rispondi a delle domande»** — è
   leggere dei RICHIAMI e riconoscere quali riaccendono le proprie conoscenze. Da lì il
   campionamento, i chip di attivazione e i due registri dello stato (§3).
   📌 I record già scritti (`sessioni.jsonl`, padronanza) citano `mode: 1..7` e `cloze`:
   **restano leggibili**. Un record di un'attività pensionata è storia, non un errore.

1. **Il push funziona di nuovo, in SSH** (13/8): chiave `~/.ssh/github_mappai`
   registrata su GitHub, remote `git@github.com:gmesc/MappAI.git`. Il token HTTPS
   scaduto il 23/7 non serve più, e non scade niente.
2. **Il numero che conta della suite è `0 fail`, non il totale.** Dal 12/8 il
   misuratore è un repo A SÉ (cartella sorella `~/Claude/MappAI - misuratore`), quindi
   `npm test` non scopre più i suoi test e il totale ha smesso di oscillare. Se nei diari
   leggi totali fra 1000 e 1120, era quello il motivo.
3. **Il marcatore di cache si bumpa DOPO l'ultima modifica al file, non prima.** Ogni
   `<script src="js/…?v=…">` in `index.html` esiste solo per questo. Due volte Giacomo ha
   provato l'app e non ha visto il codice nuovo. Il sintomo sembra «la funzione non c'è»,
   e si perde un giro a cercarla nel posto sbagliato.
4. **Dal 14/8 una generazione non blocca più l'app, ma non si esce da CREA.** Il velo copre
   la sola area di lavoro, lo spinner in barra dice che si sta lavorando, e nel menu «Cosa»
   Elabora e Insegna sono col lucchetto: si aspetta lì. Le porte che caricano o
   sostituiscono una mappa sono chiuse dal lucchetto (`MappAIGen` + `mappaiOccupato`), il
   contesto è congelato per tutta la lavorazione, e alla fine il progetto compare negli
   elenchi marcato **NUOVO** invece di strappare la schermata. Dettagli in §3.

5. **Dal 15/8 sera il DISCO è davvero la casa di una mappa.** Aprire un vault dichiara
   l'identità del progetto (prima si ereditava quella della mappa precedente, e il
   salvataggio scriveva la mappa nuova nella scheda della vecchia); **uscire salva** — HOME
   attende la scrittura del vault, ⌘Q passa da `before-quit`; e le quattro cose che
   vivevano solo in `localStorage` (Vista studio · focus · timeline · foglio dei nodi)
   viaggiano col vault in `vista.json`. Conseguenza pratica: `localStorage` è tornato un
   **indice** potabile — da 42,6 a 17,4 MB, con la valvola che libera i doppioni se la
   quota si esaurisce mentre lavori. Dettagli in §3.

6. **Dal 16/8 la MAPPA si guarda dalla sidebar, non dalla barra.** La barra è rimasta a
   `CENTRA · LAYOUT · TESTO · «mostra fino al livello»`: tutto il resto (PIN, attrazione,
   dimensione dei testi, scelta della vista, ripristino del layout fissato) sta nel tab
   **Vista studio**, che ora è sempre visibile e ha **due forme** — piena dentro una vista
   di studio, ridotta sulla mappa libera. Aprire una mappa dà **Albero + Indice**, e da lì
   il ciclo del bottone è `Mappa → Albero → Fasci → DAG`. FISSA, LINK, RIORDINA e i due
   `+/−` non ci sono più; **il PATHFINDER è stato pensionato per intero il 17/8**, funzioni
   comprese. Dettagli in §3.

7. **Dal 17/8 un FILE DEL VAULT dice a chi appartiene.** Tre nomi che non lo dicevano sono
   stati corretti, e sono tre modi diversi di sbagliare: il **set** prendeva il nome dal
   TITOLO (rinominare il progetto lasciava doppioni con lo stesso `id`) → ora viene
   dall'`id` e il file porta il marchio `_mappa`; il **foglio dei nodi** non passava la
   mappa a `buildFileName` (`Foglio-nodi-card -VERDE.pdf`); la **mappa esportata** usciva
   `MappAI_Mappa_<timestamp>.pdf` → ora `MM-<Mappa>-NN` o `KG-<Mappa>-NN`.
   📌 Il perché conta più del come: sono i nomi muti che, finiti nella cartella sbagliata,
   ci restano per settimane senza che nessuno se ne accorga — nel vault di «Project E» ce
   n'erano di un'altra mappa dal 30 luglio. Dettagli in §3.

8. **Dal 17/8 la VOCE della sintesi è usabile davvero.** Prima si poteva registrare solo
   nel modale che compare subito dopo la generazione, il file non veniva scritto da nessuna
   parte, un titolo di una parola uccideva l'intera registrazione, non si poteva annullare
   e il lavoro pagato moriva chiudendo l'app. Ora: bottone **Voce** nell'editor, la **copia
   parlante** finisce in «Materiale Studio», i blocchi rifiutati si saltano, si **annulla**
   dal velo, si sa **prima** quanto costa, e i clip stanno su disco — quindi domani si
   riprende dai blocchi mancanti. Dettagli in §3.

---

## 1. Come si verifica che tutto sia a posto

```bash
cd "/Users/giacomomeschini/Claude/MappAI re"
git log --oneline -5                              # 17/8 o più recente in testa
git status --short -- public tests tools main.js  # atteso: VUOTO
node --test tests/                                # atteso: 0 fail (1162 pass al 17/8)
node tools/smoke/cornice-documenti.js             # atteso: TUTTO OK
node tools/smoke/elenchi-elabora-insegna.js       # atteso: TUTTO OK
node tools/smoke/studio-sidebar.js                # atteso: TUTTO OK
node tools/smoke/pipeline-lucchetto.js            # atteso: TUTTO OK
node tools/smoke/scelta-materiali.js              # atteso: TUTTO OK
node tools/smoke/visione-fogli.js                 # atteso: TUTTO OK
node tools/diagnosi/vault-estranei.js             # sui vault VERI: dice, non tocca
```
I due banchi di `public/dev/` si aprono in un server statico (`python3 -m http.server 8145
--directory public`) e si leggono dal riquadro nero in cima:
`/dev/scelta-harness.html` (la SUPERFICIE delle attività «a scelta»: i tre passi, il
campionamento, i contrasti, i bersagli) · `/dev/scelta-inapp-harness.html` (il GUSCIO
IN-APP: la stessa attività dentro un modale del motore, coi moduli veri e un archivio
finto — è il percorso che nessun test puro esegue, e dove il modale si era aperto vuoto) ·
`/dev/costruisci-harness.html` (il bento di CREA).
⚠️ Vanno guardati a **390px**, cioè a larghezza di telefono: è dove vive la pagina dello
studente, ed è la larghezza a cui sono stati misurati.
`tools/diagnosi/vault-estranei.js` (17/8) è l'unico che guarda il DISCO dell'utente, in sola
lettura: set di un'altra mappa · set duplicati · vault annidati · materiali di un'altra
mappa · nomi muti. Si lancia quando qualcosa non torna in una cartella, invece di rifare
l'indagine a mano — che la prima volta è costata tre passate.
⚠️ `tools/smoke/censimento-maniglia-cdp.js` NON sta in questa lista: vuole l'app VERA
aperta con `npx electron . --remote-debugging-port=9222` e la pilota via CDP. Si lancia
dopo ogni intervento sulla maniglia o sulla colonna delle console — dice se qualcosa è
finito sotto la maniglia, ed è l'unico modo di saperlo.

I banchi in `tools/smoke/` non sono test della suite e non lo diventano: caricano i
moduli VERI con un finto `window`, un finto `appState` e finti IPC. `tools/smoke/LEGGIMI.md`
dice, per ciascuno, **che cosa NON può provare** — leggerlo prima di fidarsi di un «ok».

Il working tree a fine sessione è VUOTO. Il **misuratore** è un repo a sé dal 12/8:
`~/Claude/MappAI - misuratore`, col suo git e il suo handoff — i piani non si mescolano.

---

## 2. Che cosa è acceso, e con quale interruttore

Tutto il lavoro dell'ultimo mese è dietro un kill-switch in `localStorage`. Questa
tabella è la mappa per tornare indietro di un passo alla volta quando qualcosa si rompe.
⚠️ **`mappai_console_bento_app` non c'è più** (14/8 sera): il suo passo indietro era il rail
delle tre forme, pensionato — a `'0'` la landing sarebbe rimasta senza modo di cambiare
sezione. Il cablaggio bento non è più opzionale.

| chiave | stato | che cosa spegne |
|---|---|---|
| `mappai_stile_manifesto` | acceso | la veste «manifesto»: landing, CREA, bento. `'0'` → la landing torna esattamente com'era e il modale «Genera materiali» si riapre |
| `mappai_bento_layout` | assente = composizione del file | la composizione scritta dall'Officina §7. Assente, comanda `mappai-bento-composizione.js` |
| `mappai_teach_console` | acceso | la console INSEGNA. `'0'` → le tre sezioni storiche della landing |
| `mappai_studio_view` | acceso | il passo **STUDIO** nel ciclo LAYOUT. `'0'` → il ciclo storico, e nessun rientro automatico |
| `mappai_layout_ciclo_storico` | spento | `'1'` rimette il **ciclo lungo** del bottone LAYOUT (Default · Orbita · Radiale/Separato · Studio · Personale · salvati). Dal 16/8 il ciclo è **Default → Albero → Fasci → DAG**: orbita, radiale, separato e personale non hanno più un ingresso, i layout salvati restano sotto il bottone FISSA |
| `mappai_map_fs_node` · `mappai_map_fs_rel` | scritto dall'uso | le due scale del testo sul canvas (nodi · linking words). Assenti = 1.0 |
| `mappai_map_rel_labels` | scritto dall'uso | le linking words sul canvas: `off` · `short` · `full` (il ciclo del bottone TESTO). Assente = intere |
| `mappai_studio_profile` | scritto dall'uso | il profilo della Vista studio a livello UTENTE (non di progetto), **con una taratura per motore** (`perMotore`) |
| `mappai_vista_ridotta` | scritto dalla combo | la vista ridotta di CREA (SHIFT+CTRL+L,K,J,H) |
| `mappai_teach_row_select` | acceso | in INSEGNA il clic sulla riga SELEZIONA la mappa. `'0'` → la apre (storico) |
| `mappai_legacy_float_btns` | spento | `'1'` rimette i 7 bottoni flottanti del bordo destro |
| `mappai_archivio_insegna` | spento | `'1'` rimostra in INSEGNA le voci d'archivio dei fogli cartacei (`quizpaper`/`flashsheet` senza PDF proprio), nascoste dal 13/8: la loro sorgente vive in ELABORA |
| `mappai_lavori_barra` | acceso | l'indicatore del lavoro in corso nella barra in alto (spinner + nome). `'0'` → nessun indicatore e nessun aggancio a `showLoadingOverlay` |
| `mappai_domande_scelta` | acceso | le attività **«a scelta»**. `'0'` → via la card dal hub Live, la voce da INSEGNA › Attività LIVE e le due card dal launcher di Studio attivo (le sette modalità storiche restano) |
| `mappai_gen_ctx_sempre` | acceso | «per chi è questa mappa?» chiesto SEMPRE prima di generare. `'0'` → si chiede solo quando serve (storico: classe con 2+ materie e nessuna scelta) |
| `mappai_progetti_nuovi` | scritto dall'uso | i progetti marcati **NUOVO** negli elenchi (non è un interruttore: è la lista, e si svuota da sé al primo clic su ogni riga) |
| `mappai_visione` | acceso | **leggere le immagini col motore locale** (20/8). `'0'` → il passo «Da che cosa» sparisce da «Crea un documento» e la riga della Cabina non si monta: tutto torna a partire dalla mappa |
| `mappai_visione_model` · `mappai_visione_host` | scritti dall'uso | il modello VL (default `qwen2.5vl:7b`) e l'indirizzo del motore (default `http://127.0.0.1:11434`) |
| `mappai_error_log` | acceso | il **registro locale degli errori** (15/8) e con esso gli **allarmi di saturazione del cassetto** (16/8). `'0'` → non si registra più niente, né su disco né in memoria; la vista «Segnalazione» resta e mostra il registro vuoto |
| `mappai_tts_model` | assente = `gemini-2.5-flash-preview-tts` | il modello della voce naturale |
| `mappai_font_selettore` | acceso | il **carattere scegliibile** (18/8). `'0'` → tutto Space Mono e la vista «Aspetto e leggibilità» resta inerte: esattamente com'era prima della feature |
| `mappai_font_app` | assente = Space Mono | il carattere dell'app, scritto da Cabina › Aspetto e leggibilità. Vale per l'interfaccia, le mappe e tutto ciò che l'app genera |
| `mappai_tts_model_alt` | assente = `gemini-3.1-flash-tts-preview` | il modello di **ripiego** per i blocchi che il primo rifiuta (i titoli di una parola sola). `''` spegne il ripiego: quei blocchi restano muti |
| `mappai_errori_recenti` | scritto dall'uso | la copia in `localStorage` degli ultimi 50 errori: serve dove non c'è il disco (browser) e a mostrarli subito. La fonte resta il file |

---

## 3. Le superfici, oggi

### PIÙ SET PER ANGOLO — il box nel bento di CREA (19/8)
Vista estesa (combo SHIFT+CTRL+L,K,J,H), riga sua a tutta larghezza sotto `Preset ·
Quiz · Fogli nodi · Fonte & Sintesi`: **«Più set per angolo»** con **nove caselle** —
due che dicono A CHE COSA (Domande aperte · Scelta multipla) e **una per angolo**
(definizione · causa · conseguenza · esempio · confronto · eccezione · applicazione)
che dicono QUANTE versioni. **Tutte accese di default.** «Genera materiali» produce
allora un materiale per ogni angolo spuntato, invece di uno solo.

**Perché sta lì e non dentro il box «Quiz»**: moltiplica il costo di ciò che sta nel
box sopra. Una spunta in mezzo alle altre non lo direbbe.
- **Niente interruttore generale**: spegnere tutte le caselle **è** lo spegnimento, e
  una casella per angolo dice anche *quali* — cosa che un interruttore solo non poteva
  dire. (La spunta madre c'era il 19/8 mattina: tolta la sera, con gli angoli.)
- **Costa, e lo dice prima**: la stima segue le caselle — su 4 rami con MC e aperte:
  `B 8` senza angoli · `B 40` con cinque · `B 56` con tutti e sette (misurato
  attraverso il `_readConfig` VERO nell'harness).
- **La tendina «Angolo» è uscita dal box Quiz**: con le caselle erano due comandi per
  la stessa domanda (inv. 21). Resta nell'inventario dell'officina col suo `seFuori`.
  Un genere senza angoli spuntati esce ad angolo **misto**, come prima.
- **Comandi inerti spenti** (inv. 21): senza nessuno dei due generi le sette caselle
  non governano niente → si disabilitano.
- **Il nome della variante è la CHIAVE dell'angolo** — `Domande-aperte-<Mappa>-causa`,
  `Quiz-MC-<Mappa>-conseguenza` — cioè la convenzione del gesto singolo di ELABORA
  (`_generaVarianti`) e quella che Giacomo applicava a mano. La funzione che la scrive
  è ora una sola: `PipelineCore.nomeAngolo` (`auto` → `misto`).
- **Un angolo che fallisce non porta via gli altri sei**: si segna, si continua, e alla
  fine si dice quante varianti sono saltate (trappola 36). Con un angolo solo l'errore
  risale come prima.
- **`auto` resta fuori dai sette**: un foglio «misto» in mezzo agli angolati confonde
  il profilo di chi poi sceglie fra le versioni.
- **Il modale storico** («Genera materiali», veste manifesto spenta) NON ha il box: i
  suoi campi non esistono, `_readConfig` legge falso e la generazione resta quella di
  sempre (inv. 1).

### «DOMANDE A SCELTA» — il core e la superficie a TRE PASSI (19/8, fasi B e C)
Il pezzo su cui si regge il rifacimento dello Studio attivo. **L'attività non è
«rispondi a delle domande»**: è leggere dei **richiami** e riconoscere quali riaccendono
le proprie conoscenze (Giacomo, 19/8). Da lì la forma:
**① aree** — dichiari su quali macro-aree ti senti sicuro (già una risposta
metacognitiva, e riduce il campo) · **② leggi e scegli** — leggi i richiami, dici che
cosa ti accendono, prendi quelli a cui vuoi rispondere, **senza ancora scrivere** ·
**③ rispondi** — una domanda alla volta, poi consegni. L'angolo resta nascosto per tutto
il percorso e si rivela alla fine: il profilo non dice «che cosa sai», dice **quali tipi
di richiamo funzionano per te**.

⚠️ **Il campionamento è la condizione perché tutto questo sia possibile.** La scala vera:
5 domande per ramo × 7 angoli = **35 per ramo**, ~175 su una mappa da cinque macro-aree.
Su 175 nessuno legge — si cerca la prima che si sa, il contrario dell'esercizio. Dove
tagliare lo dice la struttura: i sette angoli sono **sette tipi di richiamo diversi**, le
cinque varianti dello stesso angolo sono **lo stesso richiamo riscritto** (l'angolo è
assoluto nel prompt). Quelle cinque servono al DOCENTE, che ne fa le righe A e B di una
verifica. Quindi `unaPerAngolo(pool, seed)`: **una per (area × angolo)** — 175 → 35, e
con due aree scelte **14 domande da leggere**. Le altre varianti restano nei fogli del
vault, e due studenti con semi diversi leggono varianti diverse: **la classe copre tutto
il materiale** senza che nessuno legga tutto.

⚠️ **I chip dicono ATTIVAZIONE, non preferenza** — «mi viene in mente subito · so da dove
partire · mi dice qualcosa, ma vago · **non mi accende niente**» — e si danno **anche a
una domanda che non si prende**: un richiamo che non accende nulla è il dato più
interessante per il docente. Per questo lo stato si sdoppia: `letture` (che cosa mi ha
acceso leggendola, per qualunque domanda) e `risposte` (che cosa ho risposto, solo per le
prese). Prima stavano insieme, ed era come chiedere «che cosa ti aveva acceso?» a chi ha
già finito di scrivere.

Piano completo in [`PIANO-domande-a-scelta.md`](PIANO-domande-a-scelta.md), il percorso a
tre passi in [`PIANO-scelta-a-tre-passi.md`](PIANO-scelta-a-tre-passi.md).
- **`mappai-scelta-core.js`** (puro, 26 test): `unaPerAngolo` · `aree` (coi conteggi: si
  sceglie vedendo quanto costa) · `filtraPerAree` · `passiUtili` (il percorso si accende da
  sé: sotto le due aree CON UN NOME non ha niente da chiedere — i fogli vecchi non portano
  il ramo) · `validaAree` · `calorAree` · `poolDaFogli` col dedup fra fogli ·
  `pubblico` (il pacchetto che va al telefono: niente angolo, niente soluzioni — una
  funzione sola, come `publicQuestions` in Live) · `mescola` col seme dello studente ·
  `perRamo` · `validaConsegna` · `profilo` · `evitata` · `calorClasse` · `CFG_DEFAULT`.
- **`mappai-scelta-view.js`**: la superficie, **una sola** per il telefono, per l'app e
  per il banco. Il trasporto si inietta (`onCambia`, `onConsegna`), il CSS se lo porta
  dietro (la pagina dello studente non carica `style.css`). Fra domande aperte e scelta
  multipla cambia **solo il campo della risposta**: elenco, chip, contatore, consegna e
  esito sono gli stessi — ed è la ragione per cui la view è una.
- **Banco**: `public/dev/scelta-harness.html`, i due moduli veri a larghezza di telefono
  (390px), **cinque colonne** — i tre passi, la scelta multipla, l'esito. I dati finti
  hanno la **forma vera** di un vault generato con «Più set per angolo» (7 angoli × 3 rami
  × 2 varianti = 42 grezze → 21 campionate): con cinque domande inventate il
  campionamento non sarebbe esercitato affatto. Misura: nessuna chiave d'angolo a schermo
  in nessuno dei passi · 0 sbordi · bersagli ≥ 44px · contrasti 4,76-17,85:1 · «lette ≠
  scelte» · il giudizio su una domanda NON presa · una domanda alla volta con la consegna
  raggiungibile dalla prima · su un pool piccolo il percorso non parte.
- Due difetti trovati misurando, e sono la parte utile: la view **dichiara il suo
  `box-sizing`** (la pagina che la ospita può non avere regole globali: un campo
  `width:100%` sbordava di 14px su un telefono); e l'invito delle Osservazioni sta
  nell'**etichetta**, non nel segnaposto — con `field-sizing: content` è il contenuto a
  dare l'altezza, e un segnaposto di due righe faceva nascere il campo a 94px, un terzo
  di schermo occupato da un invito mentre si sta ancora scegliendo (94 → 49).
- ⚠️ **Due prove del banco fallivano per il motivo sbagliato** (trappola 5), e vale la
  pena saperlo: i testi finti contenevano la parola dell'angolo («Domanda sul causa…»),
  quindi «nessuna chiave d'angolo a schermo» accusava la view per colpa dei DATI; e uno
  stato con le `aree` ma senza `fase` ripartiva dal passo ① — che è il comportamento
  giusto (a decidere la schermata è `fase`, ed è ciò che fa ritrovare il posto a chi
  rientra), ma non quello che il banco voleva misurare.
**Da dove ci si entra (fasi D ed E, 20/8).** Due porte, e sotto la stessa superficie:
- **Live, col QR** — hub Live › «Domande a scelta», oppure INSEGNA › Attività LIVE.
  `mappai-scelta.js` legge i fogli e i set del vault (non genera niente), il modale dice
  **quante domande da quanti fogli**, e si avvia una sessione `mode:'scelta'`.
  Nel server: il **campionamento è per studente e persistito** (al rientro ritrova le SUE
  domande), `/api/stato` salva il **percorso** — aree, fase, letture — e non «una
  risposta», e il profilo per angolo esce **solo alla consegna**, come le soluzioni di un
  quiz. Alla chiusura: `report-scelta.html`, col calore dei tagli, quello delle aree, le
  risposte col loro angolo e il «perché no?».
- **In-app** — Studio attivo › «Domande a scelta» e «Quiz a scelta»: la stessa attività in
  un modale del motore, bozza in `localStorage`, sessione su `MappAIStudyBus`. Senza
  materiali le card sono **spente col motivo e la strada**.
⚠️ **`/api/answer` non c'entra**: qui non si salva una risposta per volta ma un percorso,
e spezzarlo in chiamate per-domanda avrebbe voluto dire inventare una `answer` senza
`qIdx`. Per questo `cleanAnswer` non è stata toccata: le sessioni quiz storiche non
cambiano di una riga.
⚠️ **Il Palazzo della Memoria NON è stato portato nel guscio**: è il punto 16 della fase E,
e il suo guadagno arriva solo con la F, quando il launcher si riduce a tre card.

### «PAROLE CHIAVE CON AI» — il bottone che non faceva niente (19/8)
Nell'editor del **foglio dei nodi**, riga «a tutte le card». Non era rotto: la sua
condizione era **falsa per costruzione** (trappola 27). Cercava le card «parole
chiave» ancora **vuote** — ma dare quel contenuto a una card la riempie subito col
ripiego deterministico (`_fallbackKeywords`: le parole dei nodi figli, o quelle
salienti della desc), sia dal menu «+» sia da «a tutte le card». Quindi quella lista
era quasi sempre vuota e il bottone rispondeva «Nessuna card da riempire»: il docente
leggeva «non funziona», e aveva ragione.
Ora fa le due cose che ha senso fare: **riempie i buchi** se ce ne sono, altrimenti
**chiede** se riscrivere con l'AI quelle che il ripiego ha già messo — ed è lì che
l'AI serve davvero (il ripiego dà parole grezze, l'AI dei concetti). La domanda è
esplicita perché fra quelle parole possono esserci quelle corrette a mano, e non si
distinguono; `_nsSnapshot` mette comunque l'annulla prima di toccare qualcosa.
📌 La regola sta in `MappAINodeSheet.keywordTargets` (core puro, +4 test): dentro la
funzione dell'editor non si poteva provare senza un editor aperto.

**Il VERO/FALSO esce dalla pipeline** (19/8 sera): «Genera materiali» produce
scelta multipla · flashcard · domande aperte, e basta. La casella è uscita dal bento
E dal modale storico, e `tf` non è più un tipo valido nei preset — uno salvato prima
lo perde al caricamento (se restasse senza niente, ripiega su «scelta multipla»).
⚠️ Restano vive due cose, e non sono una svista: la **spec** `_QT.tf` — la usa
`generaSet`, cioè il gesto singolo di ELABORA «Crea un documento → Vero o Falso», che
resta l'unico modo di ottenerne uno — e il **prefisso** `Quiz-VF` in `GENERI`, perché
i fogli già sul disco vanno ancora riconosciuti, elencati e riaperti.
✅ **E gli elenchi non mostrano tabelle V/F vuote**: i generi si dichiarano in
`GRUPPI_MAT` (i quiz stanno in un elenco solo dall'11/8) e un gruppo senza righe non
si disegna. Misurato in `tools/smoke/elenchi-elabora-insegna.js`, che ora lo tiene
fermo: su un vault senza V/F, ELABORA dà `Sintesi · Fogli dei nodi · Catena dei perché
· Quiz` e INSEGNA `Fogli dei nodi · Catena dei perché · Quiz`, zero elenchi vuoti — e
su un vault VECCHIO la riga del suo V/F si vede ancora.

**I default della generazione, e la memoria dei box** (19/8 sera, scelte di Giacomo):
domande aperte **accese** · **5** domande per ramo · voce
naturale **spenta** · «Allega PDF» **acceso** · box «Più set per angolo» **tutto
acceso**. Vivono nel preset «Default», che il bento applica al montaggio.
⚠️ E adesso **quello che si lascia nei box nascosti resta**: `mappai_bento_scelte`
tiene lo stato dei campi e vince sul preset applicato al boot; `_applyPreset` lo
riscrive, così premere «Applica» resta l'ultima parola. Prima no, ed era dichiarato:
le spunte sono campi del DOM, ricostruiti dal markup a ogni avvio — funzionava per il
DEFAULT e non per le SCELTE, quindi chi toglieva una spunta se la ritrovava al riavvio.
Il contesto (chi · cosa) NON entra in quella memoria: vive già come contesto attivo
dell'app, e una seconda copia divergerebbe (inv. 6).
⚠️ I default nuovi vincono **una volta** anche su un «Default» già scritto
(`mappai_preset_default_v2`), e quella migrazione **svuota la memoria dei box**: se
restasse, il ripristino rimetterebbe le scelte di ieri sopra i default nuovi e la
migrazione non si vedrebbe (inv. 17).

**Due cose che i materiali ora si portano dietro**, e servono al passo successivo (le
attività «a scelta»):
- ogni domanda porta il suo **`ramo`**, dichiarato dove si sa — nel ciclo per macro-area
  — invece di essere ricavato dopo, quando l'informazione non c'è più (inv. 20-bis);
- il foglio delle domande aperte porta l'**angolo dentro la sorgente** (`qp-set`), non
  solo nel nome del file: un nome si rinomina, e chi riapre il foglio deve sapere con
  che taglio è stato generato.

📌 Il resto del disegno — le attività «Domande a scelta» e «Quiz a scelta», lo Studio
attivo rifatto — è in [`PIANO-domande-a-scelta.md`](PIANO-domande-a-scelta.md), fasi
B→F. Questa è la fase A, spedita.


### La sintesi: «Sezioni» (18/8 notte)
Nell'editor della sintesi di **ramo**, un comando compatto **«Sezioni 2/2»** accende e
spegne i due pezzi generati che stanno in coda al foglio: **La catena dei perché** e le
**Note** (le fonti citate). Un flag solo governa HTML, PDF e stampa — escono tutti dallo
stesso costruttore. La scelta sta nella **sorgente**, non nelle opzioni di stampa: si
ritrova riaprendo. Default accesi.
- ⚠️ **Spegnendo le Note spariscono anche i richiami `[1] [2]`** dal testo, o resterebbero
  puntati a niente. Dalla **resa**, mai dalla sorgente: riaccendendo tornano dov'erano
  (`MappAIDocEdit.togliRichiamiCitazione`). Chiede le parentesi quadre apposta — un `<sup>`
  senza è un **esponente** (m², x³), che in scienze c'è eccome.
- ⚠️ **Non due spunte nella barra, e lo ha deciso la misura**: la barra ha **113px liberi**
  a 1440 e le due etichette ne volevano **166** — mandavano tutto a capo (51→89px). Il
  comando compatto ne chiede 82. `<details>`, così tastiera e chiusura le fa il browser.
- Il **conteggio** nell'etichetta è ciò che salva la spunta dall'essere cieca: quei due
  pezzi nell'editor non si vedono. Ambra quando una è spenta.
- Compare solo se il documento quelle sezioni **ce le ha**, e solo sulla sintesi di ramo
  (in quella di tutta la mappa le citazioni stanno dentro il corpo).

### Il carattere — Cabina › Aspetto e leggibilità (18/8)
Quattro caratteri, tutti **dentro l'app** (`public/fonts/`, licenza OFL):
**Space Mono** (default, monospazio) · **TestMe Sans** e **TestMe Alt** (Perondi/Romei,
la seconda con le lettere-specchio disegnate diverse) · **Atkinson Hyperlegible**
(Braille Institute, l'unico dei nuovi con un corsivo vero).

**Due scelte, una regola.** La Cabina decide il carattere dell'**app** e di tutto ciò che
l'app **genera** — interfaccia, mappe sul canvas, quiz, flashcard, sintesi, fogli
stampabili, PDF. In ELABORA il selettore accanto alla dimensione dell'anteprima decide il
carattere di **quel documento**, che vince solo lì e viaggia con la sua **sorgente**
(campo `font`, invariante 18): riaprendolo lo ritrovi, e finisce nel foglio stampato e nel
PDF. La prima voce del selettore è «Come l'app», che non è un carattere: è la rinuncia a
sceglierne uno.

- **Catalogo**: `mappai-font-core.js` (puro, testato) — un carattere nuovo è una riga lì.
  `mappai-font.js` applica: scrive `--app-font`, inietta le `@font-face`, annuncia le
  metriche a chi impagina, registra il font in jsPDF **a richiesta** (i moduli base64
  pesano ~200 KB l'uno e servono solo a chi esporta).
- **Una leva sola per l'interfaccia**: la regola `*` di `style.css` legge `--app-font`.
  ⚠️ E porta `!important`, quindi **vince già** su classi, shorthand `font:`, stile inline
  e attributi SVG — misurato. Le ~50 conversioni che sembravano necessarie non lo erano;
  scappano al token solo le regole con un `!important` proprio e i documenti in finestra
  propria (che usano `MappAIFont.styleDocumento`, cioè `--doc-font` + le facce dentro).
- **Le metriche del foglio arrivano da fuori** (`PL.setFontMetrics` / `NS.setFontMetrics`):
  quei moduli sono puri e girano in Node, non possono leggere `window`. Senza l'annuncio
  non si romperebbe niente di visibile — i caratteri nuovi sono più STRETTI di Space Mono —
  ma il foglio riserverebbe il 38% di spazio in più del necessario e il motore
  rimpicciolirebbe il corpo per farcelo stare: su un carattere scelto per leggere meglio,
  il risultato rovesciato (misurato sul foglio dei nodi: 30 caratteri per riga contro 38).
- ⚠️ **`headAdvance` si DICHIARA, non si somma.** Il foglio faceva
  `headAdvance = advance + headLetterSpacing`: con Space Mono regge perché è monospazio,
  sui proporzionali la somma dà 0,56 dove ne servono 0,71 — le testate (maiuscole *e*
  spaziate) sborderebbero del 27%. C'è il test.
- ⚠️ **TestMe è OTF (curve `CFF `), jsPDF legge solo `glyf`.**
  `tools/font/prepara-font.py` converte con cu2qu e **verifica che nessun advance cambi**
  (se cambiassero, l'impaginazione calcolata non varrebbe più). Ripartire dagli `.otf`
  originali farebbe ricadere l'export in Helvetica **in silenzio**.
- **OpenDyslexic è in pensione**: arrivava da una CDN (quindi in aula senza rete non
  c'era) e il suo bottone nella barra a11y era un secondo comando per la stessa domanda
  (invariante 21). Via la funzione, il bottone, le `@font-face` e la classe.
  Le due cose che quella classe governava **non** sono morte con lei e sono state
  riscritte a chiare lettere (trappola 32): la **sillabazione** resta spenta fuori dal
  monospazio (`html[data-font="space-mono"]`), e gli **strumenti di lettura nella scheda**
  compaiono quando il carattere dell'app non è quello di default.
- **Prova**: `public/dev/banco-font.html` (servendo `public/`) dice `arrivato: sì/NO` per
  ciascuno misurando la larghezza del testo reso — un file che non arriva non dà errore,
  il browser ripiega in silenzio.

**Il documento si porta DENTRO il suo carattere** (18/8 notte, dal difetto trovato da
Giacomo). Le `@font-face` non puntano a un percorso: portano i byte
(`src: url(data:font/woff;base64,…)`). ⚠️ Non è una comodità, è la condizione perché il
PDF esca giusto: la finestra che stampa carica l'HTML come `data:text/html`, cioè
un'**origine opaca**, e da lì un caricamento `file://` è **bloccato** — il carattere non
arrivava mai e il PDF usciva col ripiego mentre l'app lo mostrava giusto («l'editor sì, il
PDF no»). Chiude anche il percorso legato a questa cartella (app pacchettizzata) e il
documento condiviso via QR. Peso: sottoinsieme dei glifi + WOFF = **76-101 KB** a
documento, contro i 433 KB del `.ttf` intero. WOFF2 comprimerebbe meglio ma vuole `brotli`.

**L'anteprima segue la Cabina, il salvataggio allinea il file** (scelta di Giacomo). La
tela apre un FILE, che si porta il carattere di quando è stato scritto: ora lo riallinea
nell'iframe, accanto a dove già riallinea la taglia del testo. ⚠️ **Ma non su tutti**: un
documento che il carattere se l'è SCELTO non si tocca — lo dice il marcatore
`--doc-font-scelto`, che la resa emette solo in quel caso. I documenti scritti prima del
18/8 non ce l'hanno, quindi si riallineano: che è quello che serve, visto che sono tutti
quelli che Giacomo ha in mano. Finché non si salva, il file su disco resta indietro: la
barra lo dice con una riga, o si vedrebbe una cosa e se ne consegnerebbe un'altra.

**Il carattere per documento vale per tutti e cinque i generi.** ⚠️ Ogni genere tiene il
suo stato in una variabile diversa (`_doc` · `_syn` · `_sheet` · `_cc`): la prima stesura
leggeva solo `_doc`, e sulla **sintesi** — cioè dove Giacomo lo usa — il selettore si
disegnava e non faceva niente.

✅ **I SIMBOLI SCIENTIFICI ORA CI SONO IN TUTTI E QUATTRO (19/8).** Nessuno dei quattro
aveva `✓` né i filetti del dossier, e **anche Space Mono** — il carattere con cui è stato
prodotto tutto finora — mancava di quindici simboli che l'app usa: non era un difetto dei
caratteri nuovi, era un difetto che i caratteri nuovi hanno reso visibile. Su un foglio
prodotto da **jsPDF** un glifo mancante **spariva senza dirlo** (jsPDF non sa ripiegare a
cascata come il browser). Ora i glifi si **cuciono dentro** ogni carattere in fase di
build, presi da DejaVu Sans: greco, matematica, frecce, filetti, forme, spunte, apici e
pedici. ⚠️ Con la cucitura TestMe è diventata una versione modificata, e la sua OFL ha un
nome riservato: si chiama **«TM Sans» / «TM Alt»** (l'`id` non cambia). Il perché, le
regole e le misure: **§4 debito 0**.

⚠️ **Il PDF dei grafi era rotto, ed è stato corretto il 19/8**: i `.ttf` di TestMe li
produce `prepara-font.py` convertendo gli `.otf` (jsPDF legge solo `glyf`), e la
conversione non toccava l'intestazione sfnt — il font continuava a dichiararsi `OTTO`,
cioè «curve in CFF». Un `/FontFile2` **è** un TrueType per definizione, quindi i lettori
lo rifiutavano («Embedded font file may be invalid») e l'export usciva col ripiego. Si
vedeva solo sui grafi perché i quiz passano da Chromium, che il font se lo incorpora per
conto suo ed è tollerante. C'è il test, e guarda i **byte** dei file.

📌 **Difetto vecchio chiuso strada facendo**: **nove** costruttori di documenti prendevano
Space Mono da `fonts.googleapis.com` (quiz ×3, sintesi, catena, documento di studio,
glossario, dossier, timeline), e `index.html` faceva lo stesso per l'intera app. Un foglio
stampato in aula senza collegamento perdeva la sua veste, senza dirlo. Ora nessun
carattere di testo passa dalla rete; resta la sola CDN di Noto Color Emoji, che su desktop
non ha alternativa.


### Il motore dei modali — in produzione
`MappAIModal.open(schema)` → Promise · `render(schema)` → nodo · `conferma/avviso/chiedi` ·
`chipContesto(parti)` · `prossimoZ()`. I modali sono **dati**: uno schema, non markup.

**Le tre regole da non dimenticare**
- una **voce**, una **riga di tabella** e **ogni azione** concludono per default → dentro
  una console vanno dichiarate `chiude:false`;
- ⚠️ **un'azione che conclude NON passa da `suAzione`**: il motore chiude e consegna
  l'esito al `.then()` di `open()`. O `chiude:false` e la logica sta in `suAzione`, o
  conclude e la logica sta nel `.then()`. Scriverla nel posto sbagliato produce **codice
  morto senza errori** — è già costato quattro bottoni che non facevano niente;
- `Core.validaSchema(schema)` va chiamato su ogni schema nuovo: ha trovato **nove**
  difetti veri. La normalizzazione è idempotente (`open` normalizza, `render` rinormalizza).

**La regola dei CAMPI, corretta il 16/8.** La decisione 4 (31/7) diceva «solo segnaposto,
niente etichetta sopra il campo». Regge per un campo di testo **vuoto** — il nome si legge
finché non si scrive — e **non regge** dove il segnaposto non compare mai: una tendina
mostra sempre un'opzione, un campo con un valore di partenza mostra sempre quel valore, un
campo colore un colore. Nel modale delle domande aperte si leggevano un «5» e un «40»
senza sapere che cosa fossero. Ora in quei casi `campoHtml` emette **per forza** un
`<label for>`; il campo vuoto resta al solo segnaposto.
⚠️ `.mm-label` era citata dal motore e **non esisteva nel CSS** (con `STILE.etichette
='sopra'` sarebbe uscita senza stile). Aggiunta.
⚠️ Una riga `larghezza:'meta'` **con** un aiuto non stringe più l'aiuto: si restringe il
controllo, non la riga (`--spiegato`). Le coppie di campi affiancati senza aiuto non
cambiano.

**`sezione.colonne: 2|3`** (16/8) avvolge **solo i campi** in una griglia — `testo` e
`sotto` restano a tutta larghezza, o si leggerebbero in due strisce strette. Sotto i 520px
torna a una colonna: un'etichetta tagliata su una spunta è peggio di una lista lunga. Un
valore non previsto viene ignorato e non emette niente (le sezioni che non le chiedono non
guadagnano un `<div>`). Dodici test in `tests/modal-campi-etichette.test.js`.

**Pezzi aggiunti il 15/8** (piccoli, e ognuno nato da un bisogno preciso):
- `voce.sotto` **si disegna anche nella navigazione** — era normalizzato dal core e
  nessuno lo emetteva, come il badge prima di lui;
- `voce.classe` = deroga di veste su una voce di colonna. Serve al clone del bottone
  ambra; senza, la voce resta standard. Regge la doppia normalizzazione (c'è il test);
- `sezione.figura` = `{src, alt, tonda}`, immagine a `float` con il testo che le scorre
  accanto (la `tela` non andava: sta SOTTO le sezioni, e il ritratto deve stare accanto al
  testo che presenta). L'`alt` è la parte che conta; senza `src` non si emette nulla.
- `tela.forma: 'colonna'` (sera) — la tela CENTRA il contenuto perché nasce per un pezzo
  solo; con più blocchi dentro (le Impostazioni AI ne spostano tre) il centraggio li mette
  in fila e la vista si scompone. Il default non cambia: la deroga si dichiara.
  ⚠️ E chi usa la tela si riprende il posto della **maniglia** (guida §8.19): con la tela
  l'area va a `padding:0`, e il primo titolo finisce sotto il bottone.

### La landing e CREA — veste «manifesto»
Disegnata da Giacomo in Inkscape. Non è una riarchitettura: è la pelle sopra i moduli che
c'erano. La landing si apre **vuota** (`readMode()` ammette `''` come stato vero): il
primo schermo è una domanda, non la ripresa di ieri. I chip di contesto sopravvivono alla
chiusura, la posizione Crea/Elabora/Insegna no.

**CREA è un mega-bento**, e la sua composizione è un **dato**
(`public/js/mappai-bento-composizione.js`), non markup: si compone trascinando
nell'**Officina §7** (`public/dev/officina.html#bento`) e l'app la legge.
⚠️ Le card portano gli **STESSI id del modale** (`mp-quiz-on`, `mp-ns-fmt`…) perché
`MappAIPipeline._readConfig()` deve restare **l'unico posto che legge la configurazione**.
Per questo, con la veste accesa, il modale non si apre più: due superfici con gli stessi
id aperte insieme sarebbero un guaio vero.
⚠️ Alcuni campi sono montati **nascosti** e sono decisioni, non scorciatoie: `mp-class`
(senza, i materiali finiscono fuori dalla cartella di classe), `mp-adapt-on` (chi ha
tarato una classe l'ha già deciso una volta), e i master `mp-quiz-on`/`mp-ns-on`,
**derivati dai figli**.
⚠️ Una voce lasciata nell'**inventario** dell'officina **non viene montata**: quell'opzione
sparisce e la pipeline usa il default. Ogni voce dichiara `seFuori`, cioè *quanto costa*
non averla.

**Il titolo del progetto è anche il nome della cartella** (14/8). `vaultFolderName` lo
prende di lì, quindi la ripulitura è UNA e sta in `mappai-files-core.js`
(`titoloProgetto` · `titoloDaFile`, pure e provate): via l'estensione (da un PDF nasceva
un progetto «Il Clima.pdf», con la cartella chiamata così) e via i simboli che una
cartella non ammette. Vale per il titolo **dedotto** e per quello **scritto a mano** — sia
alla generazione sia alla rinomina dalla sidebar. Sulla MindMap resta il ROOT che scrive
il docente, e un nome fatto di soli simboli si contesta invece di sostituirlo d'ufficio;
sul KG, senza titolo e senza focus, si deduce dal nome del primo file.
**La testata della sidebar è il titolo del progetto** (marchio e logo via: dentro l'app si
sa in che app si è). Si scrive da un posto solo, `window.setSidebarProjectTitle`: prima la
rinomina RICOSTRUIVA il markup con classi e corpo diversi da quelli di `index.html`, e
dopo una rinomina la testata cambiava aspetto e prendeva il prefisso «Progetto:».

**Il lavoro in corso si vede nella barra in alto** (14/8, `public/js/mappai-lavori.js`,
kill-switch `mappai_lavori_barra='0'`): lo spinner di MappAI — quello VERO del velo, senza
didascalie — col nome di ciò che si sta creando alla sua sinistra. Taglia e margine del
bottone della Cabina ma **dal lato opposto** (la Cabina sta a sinistra a 28px, lo spinner a
destra a 28px). Si mostra **solo dove c'è quel bottone**: landing e testata delle console —
sulla mappa nuda quella barra non esiste. Aggancio UNO: `window.showLoadingOverlay`, che è
il collo di bottiglia di ogni lavorazione lunga (una ventina di moduli lo chiamano); il
nome viaggia come **quarto argomento** e senza di esso si ricade sul titolo del progetto.
⚠️ Due tarature che sembrano dettagli e non lo sono: l'attesa di 600ms prima di comparire
(sotto, sarebbe un lampo, e un lampo si legge come un difetto) **non si riarma** a ogni
fase — una MindMap multi-pass ne annuncia una dozzina e l'indicatore non sarebbe mai
comparso; e il contenitore non riceve il puntatore (è largo quanto il nome e starebbe sopra
i comandi sotto), lo ricevono i due pezzi dipinti.
**Il bottone degli strumenti compensativi** vive solo nel contesto di LETTURA, e da oggi le
CONSOLE lo spengono: erano nate dopo quella guardia, che conosceva solo l'ELABORA v1 —
con una mappa aperta sotto restava a schermo, e per giunta SOPRA la console.

### L'EDITOR dei documenti — tre gesti, non uno
Salvare non è pubblicare (13/8, modello di Giacomo):

| gesto | che cosa fa | contesta i campi vuoti? |
|---|---|---|
| **Salva ed Esci** | salva la SORGENTE modificabile: memoria, progetto **e vault** | no — un documento a metà è normale |
| **Stampa** | apre la stampa su una copia **effimera**, nessun file nella cartella | sì |
| **Crea PDF** | scrive il file in `Materiale Studio/` → compare in **INSEGNA** | sì |

⚠️ Prima erano un gesto solo: «Salva ed Esci» chiedeva il nome e pubblicava il PDF, quindi
su un documento a cui si lavora per giorni si pubblicavano PDF **transitori**, e a ogni
salvataggio si rispondeva a due domande («che nome?», «ci sono campi vuoti, salvo
comunque?»).
⚠️ Deroga: un documento aperto **DA** un file del vault (la sintesi) continua a riscrivere
il suo file salvando — lì il file è la sua casa, non una pubblicazione nuova.

### L'EDITOR — la scala unica (13/8 notte, standard = Sintesi/Catena)
Prima due modi di occupare il pannello: Sintesi e Catena crescevano IN SCALA
(zoom a gradini), quiz/aperte/flashcard si ALLARGAVANO a corpo piccolo (colonne
da 1400px, testo 13px, bande chiare, header minuscoli). Ora **un token solo**,
`--de-lad` in `mappai-doc-editor.js`: cinque gradini sulla larghezza del
PANNELLO (container query sul wrap — 1120→1.3 · 1360→1.6 · 1700→1.85 ·
1900→2 · 2300→2.4). Tutti i fogli di TESTO lo seguono per intero: larghezza di
impaginazione 800 (i caratteri per riga della stampa) × gradino, stessa
larghezza visiva, stessi header, ovunque. Le flashcard passano a 2 colonne da
1120 e 3 da 1700 (tetto 1180 SOLO da 2 colonne in su: a colonna singola stanno
a 800 come gli altri — misurato). **Eccezione dichiarata: il foglio dei NODI**
specchia la stampa A4 e i corpi dentro le card vengono dalla geometria (px/mm):
continua ad allargarsi, e alla scala si aggancia la sola testata.
Misurato in Electron: sidebar aperta → tutti 800/gradino 1/titolo 20; chiusa →
tutti 1040/gradino 1.3/titolo 26, flash 1160 a 2 colonne. Lo zoom utente (−/+)
MOLTIPLICA la scala come prima.
L'editor **annuncia ogni apertura** (`mappai-doc-aperto`: set, aperte, catena,
foglio nodi, **e dal 17/8 anche le due della sintesi**) e la console lo accoglie nella
tela anche per i generi «dalla mappa» — il primo `openCausal` da fuori console restava
invisibile.
⚠️ Le due sintesi (`openSynthesis`, `openSynthesisFromVault`) erano rimaste **fuori
dall'annuncio** malgrado il commento dichiarasse «ogni ingresso, anche quelli di domani»:
aperte da fuori dalla console caricavano tutto in memoria e non disegnavano niente,
perché `#elab-doc-host` non esiste finché la console non è in modalità documento.
E l'ascoltatore `_suDocAperto` era una **lista chiusa di tre forme**
(`docId`/`setId`/`dallaMappa`): la sintesi non era nessuna delle tre e usciva subito.
Ora è la quarta forma, con gli id **della colonna** (`syn:` · `synfile:`) e non una terza
convenzione. ⚠️ `_doc` non può restare `null`: è lui a far emettere la `tela`
(`if (_doc) s.tela = …` in `_schemaV2`), e senza tela non c'è dove appendere l'host.

### ESC SU UNA SINTESI: un colpo solo, senza il passaggio grigio (17/8)
🐛 Modificando una sintesi in ELABORA, il primo ESC lasciava **l'area grigia** e serviva un
secondo ESC per rivedere i documenti. Difetto mio, nato ieri: montando la sintesi nella
console le avevo dato `natura: 'syn'` con `editing: true`, e ESC in editing chiama
`_tornaAnteprima` — che mette `editing = false`, azzera l'editor e ridisegna. Ma per una
SINTESI un'anteprima non esiste (l'avevo scritto nel commento e poi non l'avevo detto a
ESC): `_dipingi` cadeva sul ramo finale e rimontava un editor ormai vuoto.
Ora la domanda la fa `_haAnteprima()`: ce l'hanno i documenti che vengono da un FILE del
vault (`disk:`, si rilegge dal disco) e i set d'archivio (`set:`, il builder li ridisegna);
non ce l'hanno quelli nati qui (`crea`) né le sintesi. Chi non ha un'anteprima **esce dal
documento in un colpo**.
⚠️ E il ramo della sintesi in `_suDocAperto` non sostituisce più il `_doc` quando la console
stava già mostrando l'anteprima di QUELLO stesso file: quel `_doc` porta il `relPath`, cioè
la strada del ritorno — buttarlo avrebbe chiuso il documento invece di riportare
all'anteprima da cui si era partiti.
Provato in Electron sui due percorsi: dal vault (riga → anteprima → Modifica → ESC →
domanda «Salvi le modifiche?» → **anteprima**, secondo ESC → elenco) e senza anteprima
(editor → **un ESC** → elenco). In nessuno dei due l'area resta vuota.

### I FILE DEI SET DI STUDIO: uno per set, e di questa mappa (17/8)
🐛 Nel vault di «Project E» c'erano **nove** file di set invece di tre: tre di un'altra
mappa («Elettricità», id identici a quelli del suo vault) e tre in doppia copia. Aprendo il
progetto si caricavano nove set. Due cause diverse, e vanno tenute separate:
- **gli estranei** sono la coda dell'invariante 20 (i PDF di Elettricità lì dentro sono del
  30 luglio, prima della correzione del 15/8). Il difetto è chiuso — provato: caricando
  Elettricità e poi un'altra mappa i set non sopravvivono — ma i file già scritti venivano
  **riletti a ogni apertura e riscritti a ogni salvataggio**: un cricchetto che si
  autoalimenta;
- **i doppioni** nascevano dalla RINOMINA: il nome del file veniva dal TITOLO del set
  («2.1 Project E — Flashcard» → `2_1_project_e___flashcard…`), quindi rinominato il
  progetto i set prendevano un nome nuovo e i vecchi restavano, **con lo stesso `id`**.

Tre correzioni, logica pura in `mappai-files-core.js` (+11 test, coi dati veri):
1. **Il nome del file viene dall'`id`** (`set-<id>.json`), che non cambia mai. La rinomina
   non orfanizza più.
2. **Ogni file dichiara la sua mappa** (`_mappa`, scritto al salvataggio) e al caricamento
   `setsDelVault` scarta quelli di un'altra: un file finito nella cartella sbagliata non
   torna in memoria, quindi non viene nemmeno riscritto — il cricchetto si spezza da sé.
   ⚠️ Un file **senza** marchio si accetta: quelli scritti prima non ce l'hanno.
3. **Dedup per `id` al caricamento** — due file con lo stesso id sono lo stesso set. È la
   rete per i doppioni già sul disco.
Dopo la scrittura la cartella si **allinea**: i file di set che non corrispondono più a
nessun set vanno nel **Cestino** (non cancellati). ⚠️ Con zero set non si pota niente: un
salvataggio che arriva senza set non deve svuotare la cartella.
Provato in Electron: «Project E» apriva 9 set, ora ne apre **3**; il salvataggio riscrive i
file col nome dall'id, col marchio, e porta via i vecchi.
📌 I sei file estranei di Giacomo sono stati spostati nel Cestino a mano, dopo aver
verificato che ognuno avesse un gemello identico (i tre di Elettricità) o un successore con
lo stesso id (i tre `2_1_project_e`).

### I MATERIALI: il nome dice la mappa, e una diagnosi ripetibile (17/8)
Seguito del trattamento dei set. ⚠️ **La potatura NON si estende ai materiali**: i `.json`
dei set derivano da una lista che l'app possiede per intero, i PDF e gli HTML no — si
accumulano apposta (i sette «Domande aperte», i vari «Studio») e non esiste un elenco di
ciò che «dovrebbe» esserci. Allineare quella cartella cancellerebbe lavoro vero.
- 🐛 **`mappai-print-dossier.js` non passava la mappa** a `buildFileName`: da lì usciva
  `Foglio-nodi-card -VERDE.pdf`, un nome che non dice a quale mappa appartiene. Sono
  proprio i file così che, finiti nella cartella sbagliata, ci restano senza che nessuno
  se ne accorga. Ora compone come la **pipeline** (`{mappa, dettaglio}`), non in un secondo
  modo (invariante 6).
- **`tools/diagnosi/vault-estranei.js`** — sola lettura, usa le funzioni VERE del core:
  set di un'altra mappa · set duplicati · vault annidati dentro «Materiale Studio» ·
  materiali di un'altra mappa · **nomi muti**. Si rilancia quando qualcosa non torna,
  invece di rifare l'indagine a mano.
- Nel core, pure e provate: `materialeEstraneo(nome, mia, altre, nodi)` e
  `nomeDiceLaMappa(nome, mappa)`.
  ⚠️ Le due trappole che le hanno formate, ed erano il grosso del lavoro: **«Clima» è
  sottostringa di «Il Clima»** (una ricerca ingenua dava 28 estranei, di cui 24 falsi) e un
  **`Focus-…` porta il nome di un NODO**, non di una mappa. E «muto» non si decide col nome
  intero: le etichette cambiano nel tempo (il vault «1-2 Orientarsi nel Paesaggio» ha
  materiali che dicono solo «Orientarsi nel Paesaggio»), quindi si guardano le parole ≥4
  lettere — i numeri di capitolo non contano.

**Esito sui 31 vault**: zero set estranei, zero duplicati, zero vault annidati. Restano
**cinque materiali** da decidere a mano (quattro `Caratteri ereditari-ALBERO-td-*.pdf` in
«Riproduzione Sessuata» — trovati dallo strumento, non dalla ricognizione a mano — e un
`Focus-Geografia Fisica-parentela.pdf`) e **102 nomi muti**, che non sono un difetto ma la
convenzione vecchia: rigenerandoli il nome diventa parlante.

⚠️ **Non fatto, e dichiarato**: la **guardia alla scrittura** — un materiale dovrebbe poter
essere scritto solo nel vault della mappa APERTA, e chi ci prova dovrebbe essere fermato.
È il pezzo che previene invece di diagnosticare, ma tocca 17 punti di scrittura in 5 file e
non è verificabile senza provare l'app: va fatto con Electron libero, e conviene che nasca
come **avviso** (con kill-switch) prima di diventare un rifiuto.

### LA MAPPA ESPORTATA ENTRA NELLA CONVENZIONE (17/8)
🐛 Il PDF della mappa usciva `MappAI_Mappa_1787004725715.pdf` — un marchio, una parola
generica e un timestamp: non dice né QUALE mappa né di che genere, e in una cartella di
download si riconosce solo aprendolo.
La convenzione **esisteva già** (`_studyMapPdfName` in `mappai-d3-render.js`, che compone
`MM-<Mappa>-<grado>-NN`), ma **la usava solo il percorso vettoriale**: il ripiego raster,
l'SVG e l'istantanea PNG scrivevano il nome col timestamp. Giacomo ha visto proprio quello
perché il vettoriale era caduto sul ripiego.
- `map_mm` / `map_kg` entrano in **`GENERI`** (`mappai-pipeline-core.js`) e il prefisso lo
  compone `buildMapExportName(mode, mappa, est)`, la stessa convenzione degli altri
  materiali — non un secondo compositore (invariante 6). `est` è un parametro perché lo
  stesso disegno esce in tre formati: tre generi per tre estensioni sarebbero sei voci.
- ⚠️ Due prefissi (MM/KG) e non uno con un suffisso, come `Quiz-MC`/`Quiz-VF` e
  `Sintesi-voce`: il genere si deduce dall'INIZIO del nome.
- 🐛 **Il grado non arrivava mai nel nome**: `_studyMapPdfName` leggeva
  `window.StorageManager.currentProjectId`, e `window.StorageManager` è la **classe DOM
  nativa** — sempre truthy, senza quella proprietà (invariante 3). Corretto col nome
  lessicale nudo.
Provato in Electron sui due generi: `MM-Il Clima-00.pdf` · `MM-Il Clima-00.svg` ·
`KG-Project E-00.svg`, e il file esce davvero in Download.

✅ **CHIUSO il 18/8: il PDF vettoriale della mappa funziona** (era il ripiego raster a
scattare sempre — vedi «Il PDF della mappa torna vettoriale» qui sotto).

### IL PDF DELLA MAPPA TORNA VETTORIALE (18/8)
🐛 Segnalato da Giacomo: «Esporta PDF» dal tab **Vista studio** con la vista su **Mappa**
produceva PDF che «sembrano screenshot». Erano screenshot: il percorso vettoriale
(`window.exportPDF`, svg2pdf su jsPDF) **falliva a ogni export** e scattava sempre il
ripiego raster (`_exportPDFRaster`, cattura della finestra via `capturePage`).
La catena, misurata sull'app viva via CDP:
- `_svgCloneWithStyles` raccoglieva ogni regola CSS il cui **`cssText`** contenesse «text»
  o «svg» — `text-align` compreso, cioè mezza app: **362 regole, 72 KB**;
- svg2pdf ricostruisce quel foglio con `insertRule` e per farlo spezza i selettori alle
  virgole con uno splitter **che non conta le parentesi**. Colpevole esatto, catturato in
  pagina: `html.manifesto … .mn-spostato button:is(.bg-white` → `SyntaxError: Failed to
  parse the rule` → l'intero export moriva e cadeva sul ripiego.
**Fix**: si tiene solo ciò che la mappa usa DAVVERO — regole di stile il cui **selettore
combacia con un elemento del clone** (split delle virgole *paren-aware*, pseudo-classi
ignorate nel confronto), e si saltano le regole con una virgola dentro le parentesi, che
sono la mina dello splitter. Da **362 regole/72 KB a 11/2 KB**: restano `.node-circle`,
`.node-text`, `.link`, `.link-label` e poco altro.
✅ **Provato in Electron** su «Il Clima» (1A › Geografia, 50 nodi), leggendo il PDF
prodotto: **0 immagini**, `/BaseFont /Space#20Mono` con `/FontFile2` ×2, 40 KB. Il file di
prima, per confronto: 1 immagine, solo Helvetica, 178 KB.
⚠️ Vale anche per l'**export SVG**, che passa dallo stesso clone. Non è una regressione del
17/8: la convenzione dei nomi (`MM-<Mappa>-NN`) era già stata estesa a tutti e quattro i
formati, ed è proprio per questo che Giacomo aveva visto il nome giusto su un file raster.
📌 Trappola generale in [`GUIDA-ARCHITETTO.md`](../GUIDA-ARCHITETTO.md) §8 n. 46: *un
ripiego che scatta sempre non è un ripiego, è il percorso principale* — e nessuno se ne
accorge finché non guarda il prodotto.

### IL NOME DEL LAVORO SI CATTURA ALL'AVVIO (17/8)
🐛 Segnalato due volte da Giacomo, prima sulla voce e poi sulla generazione della sintesi:
lanciando una lavorazione in ELABORA e cliccando un altro progetto, **lo spinner in barra si
ribattezzava col nome di quel progetto** — sembrava che MappAI stesse generando per tutti.
La radice non era del chiamante ma della patch in `mappai-lavori.js`: **ogni** chiamata col
velo acceso chiudeva il lavoro e ne apriva uno nuovo, ricalcolando il nome; e senza un nome
esplicito il ripiego legge `rootNodeLabel`, cioè il progetto aperto **in quel momento**. Una
lavorazione è fatta di decine di fasi che si annunciano una dopo l'altra (la MindMap
multi-pass ne ha una dozzina, la voce **una per blocco**), quindi bastava un clic.
Ora una chiamata che non dichiara un nome è una **fase** del lavoro in corso, non un lavoro
nuovo: il nome resta quello di quando è cominciato. Si ribattezza **solo** se arriva un nome
esplicito diverso — cioè se è davvero un'altra cosa.
📌 Vale per tutti i chiamanti, anche quelli che il nome non lo passano: era il punto.
In più il nome ora viaggia dalla sintesi («Sintesi: <ramo>») e dalla voce («Voce naturale»):
dicono *che cosa* si sta creando, non *dove ci si trova*.
⚠️ `mappai-lavori.js` **non aveva un marcatore di cache** (trappola §0.3): modificarlo non
bastava a farlo arrivare all'app. Aggiunto.
Provato in Electron: generata una sintesi di ramo, cliccato un altro progetto a metà — il
nome resta «Sintesi: Funzione Educativa». E il meccanismo è provato sui tre casi, a costo
zero: senza nome tiene il primo · con nome esplicito lo tiene attraverso le fasi · con un
nome diverso si ribattezza.

### IL MODALE DI RISULTATO NON È PIÙ UN VICOLO CIECO (17/8)
🐛 Generando una sintesi nuova, il modale che la mostra **archiviava** in `localStorage` ma
non scriveva nessun file, e le sue tre azioni non portavano da nessuna parte: «Stampa» apre
una finestra stampabile, non salva. Giacomo: «non posso salvare la nuova sintesi».
Salvare e pubblicare vivono nell'**editor** (13/8: «Salva» tiene il documento, «Crea PDF»
lo pubblica in «Materiale Studio»), quindi l'azione conclusiva del modale è **andarci**:
`Chiudi · Stampa · **Rivedi e salva**` → `apriSintesiNellEditor()`. Non è un secondo posto
dove si salva: è la strada per l'unico che c'è.
⚠️ Apre la **casa** prima (la console ELABORA, se è quella attiva): l'editor si disegna solo
dentro `#elab-doc-host`, e chiamare `openSynthesis` con la console chiusa caricherebbe il
documento senza mostrarlo — il difetto già pagato il 13/8 coi quiz.
🐛 E **«Audio voce naturale» è stato tolto da quel modale**: faceva partire la registrazione
**senza scrivere la copia parlante**, cioè ricadeva esattamente nel difetto segnalato la
mattina stessa. Erano due porte per lo stesso gesto con esiti diversi (invariante 21), e
questa faceva di meno. La voce si registra dall'editor, dove il bottone scrive anche il file
e apre lo stesso menu di scarico/QR: qui non si perde niente. Chiavi `bs_audio_btn`/
`bs_audio_tip` rimosse dal dizionario, erano orfane.
Provato in Electron su «Funzioni Urbane»: generata una sintesi vera di ramo → modale con i
tre bottoni → «Rivedi e salva» → editor con 14 blocchi editabili e la barra completa →
modifica → Salva → l'archivio contiene il testo rivisto.

### LA VOCE NATURALE su una sintesi già esistente (17/8)
Bottone **«Voce»** nella barra dell'editor, solo sulle sintesi. Prima la registrazione si
poteva chiedere **solo** nel modale che compare subito dopo la generazione: riaperta il
giorno dopo dall'archivio o dal vault — cioè nel caso normale, perché una sintesi si
rivede prima di consegnarla — quella strada non c'era più, e con essa spariva l'unico
modo di dare l'audio a un allievo dislessico. Il motore è lo stesso
(`window.generateSynthesisAudio`), qui si porta solo il documento aperto.
Sotto c'erano **due difetti veri**, tutti e due trovati misurando:
- **`_audioBlob` non lo scriveva NESSUNO.** Censito nel repo: tre occorrenze, tutte che lo
  azzerano. Il passo «generata in questa sessione» di `_voceNaturale()` era **codice
  morto**, quindi la voce appena registrata non arrivava mai a HTML / Stampa / Crea PDF.
  Ora il deposito lo fa `generateSynthesisAudio`, dove il blob nasce e dove si conosce il
  `data` a cui appartiene.
- **La voce fresca perdeva contro quella vecchia.** Quel passo stava al **terzo** posto,
  dopo l'audio incorporato nel file e dopo l'MP3 che gli sta accanto nella cartella: su
  una sintesi che una voce ce l'ha già, quei due arrivavano sempre primi. Misurato su
  «Il Clima» (che ha `Sintesi-audio-Il Clima -VERDE.mp3`): dopo aver registrato, l'export
  riceveva i **59 cue del file vecchio** invece dei nuovi. Ora è il **passo 0** — un blob
  in memoria è nato dal testo di adesso, non può che essere il più recente.
**E registrare SCRIVE il file** (`_scriviCopiaParlante`). Era il rilievo di Giacomo: «la
generazione inizia ma il file non appare in Materiale Studio». Vero — il blob restava in
memoria e moriva alla chiusura; a scrivere era solo la pipeline.
⚠️ **Non si scrive un MP3 accanto al documento**: è la decisione del 10/8. Un HTML che
PUNTA all'MP3 fratello funziona solo finché i due file restano nella stessa cartella —
via QR, per email o nell'anteprima `srcdoc` il riferimento non risolve e il documento
ripiega **in silenzio** sulla voce di sistema. L'audio va DENTRO un secondo file,
`Sintesi-voce-<Mappa>.html`: l'editabile resta leggero per chi corregge, la copia parlante
basta a sé stessa per chi la consegna. Il nome lo compone `buildFileName('synthesis_voice')`,
**la stessa funzione della pipeline**.
📌 Ri-registrare **sovrascrive**, ed è voluto: è la voce dello stesso documento, rifatta.
Con `nomeLibero` nascerebbe un «… · 02.html» a ogni ripensamento.
📌 `_syn.vaultAudio` non si tocca: dichiara l'audio del file APERTO, e valorizzarlo
incorporerebbe l'audio anche nell'EDITABILE al salvataggio dopo — 8 MB da riaprire a ogni
ritocco, cioè proprio ciò che i due file separati evitano.
📌 Il bottone si mostra sempre e **non è inerte**: quando non può registrare, il motore
dice il perché (serve la chiave Google, serve l'app desktop, ci sono modifiche da
salvare). Provato: con modifiche pendenti → toast e **zero chiamate AI**.
⚠️ **Trappola di misura pagata due volte**: `window.electronAPI` è un oggetto **congelato**
da `contextBridge` — sostituirne un metodo per spiarlo **fallisce in silenzio** e gira la
funzione vera. La prima prova diceva «nessuna scrittura» mentre il file era già sul disco.
Per sapere se una scrittura è avvenuta, guardare il DISCO, non una spia sull'API.

🐛 **UN BLOCCO DI UNA PAROLA SOLA UCCIDEVA L'INTERA REGISTRAZIONE** (17/8, dal secondo
rilievo di Giacomo: «lo spinner ha girato per un attimo»). Misurato sulla sua chiave con
`gemini-2.5-flash-preview-tts`, che è il default:

| testo | parole | esito |
|---|---|---|
| `Panoramica` · `Introduzione` · `Sintesi` · `Panoramica.` | 1 | **200 OK, `finishReason:"OTHER"`, nessun contenuto** |
| `La citta` (8 caratteri!) · `Le funzioni` · `Panoramica, in breve.` | 2+ | audio ✓ |

**Non è la lunghezza: è il numero di parole** — e i blocchi di una parola sola sono
esattamente i TITOLI DI SEZIONE. Su «Funzioni Urbane» il blocco 1 di 78 era «Panoramica»,
il codice faceva `throw`, e tutto moriva dopo **1,6 secondi**.
Due rimedi, e il primo vale a prescindere dal modello:
- **un blocco rifiutato non ferma gli altri**: si salta, si scrive comunque il suo cue
  (durata zero, altrimenti il karaoke slitterebbe di un blocco da lì in poi) e alla fine si
  DICE quanti ne sono stati saltati. Perdere 77 frasi già pagate per un titolo è il guasto
  peggiore possibile lì dentro — è la stessa regola delle varianti del 16/8;
- **si ritenta col modello di ripiego** (`mappai_tts_model_alt`, default
  `gemini-3.1-flash-tts-preview`): gli altri due modelli TTS della stessa chiave le parole
  singole le leggono, provato, e tornano PCM 16 bit a 24 kHz come il primo — quindi i clip
  si concatenano senza conversioni. `''` spegne il ripiego.
Se TUTTI i blocchi vengono saltati si lancia invece di consegnare un file muto.
📌 Chi mette `mappai_tts_model = 'gemini-3.1-flash-tts-preview'` evita la chiamata doppia
sui titoli (una rifiutata + una buona).

### LA REGISTRAZIONE DELLA VOCE: dirlo prima, potersi fermare, capire perché (17/8)
Tre difetti scoperti da Giacomo in una corsa sola: la voce si è fermata al **blocco 23 di
78** con «limite raggiunto, riprendo fra **1000s**», lui ha chiuso l'app e i 23 blocchi
già pagati sono spariti con la cache.

**1. «Aspetta un attimo» e «per oggi hai finito» arrivano nella STESSA forma.** Un 429 con
un ritardo dichiarato. Il codice leggeva il ritardo e obbediva: un conto alla rovescia da
diciassette minuti su una quota che non si sarebbe liberata prima del giorno dopo — e alla
fine si sarebbe arreso comunque, dopo tre tentativi.
`MappAIUsageCore.limiteGiornaliero(err, soglia)` (pura, 5 test con errori nella forma vera
di Google) riconosce il tetto **giornaliero** da due segnali: il nome della quota
(`…PerDay`, `daily`) **oppure** un ritardo oltre i 120s — un limite al minuto non chiede
mai due minuti. Riconosciuto, si lancia SUBITO col motivo e il rimedio: riprova domani, o
cambia modello (ogni modello ha un contatore suo).
⚠️ Questo ramo è provato **dai test**, non osservato dal vivo: non so forzare un 429
giornaliero a comando.

**2. Non si poteva annullare.** L'unica uscita era chiudere l'app — che è anche il gesto
che distrugge i clip già pagati. Ora il velo mostra un **«Annulla»** quando chi lo apre sa
fermarsi: `showLoadingOverlay(show, testo, mode, nome, onAnnulla)`, quinto argomento
opzionale. Il bottone si emette **solo** se un annullamento esiste davvero (invariante 21),
e diventa «Sto annullando…» perché il lavoro finisce la chiamata in corso prima di
arrendersi. Annullare **non consegna un audio parziale** (una sintesi letta a metà si
scopre solo riascoltandola): resta la CACHE, quindi riprovando nella stessa sessione non si
ripaga niente. Provato dal vivo: bottone → «Sto annullando…» → si ferma → toast **info**,
non errore.

**3. Nessuno diceva quanto sarebbe costato.** Il bento dice «circa 15 chiamate all'AI»
prima di generare i materiali; la voce non diceva niente. Ora un preavviso — solo **sopra i
12 blocchi**, o una conferma che compare sempre smette di essere letta — con i numeri di
`MappAIUsageCore.stimaTts` e il consiglio di registrare un **ramo**. Misurato sul documento
vero: «**78 blocchi di testo da leggere · circa 79 chiamate all'AI · circa 12 minuti, per il
limite di 10 chiamate al minuto**».
📌 I titoli di una parola in quel documento erano **uno**, non quindici: il costo del
ripiego è molto minore di quanto avevo stimato a occhio.

**4. E il velo cancellava il conteggio.** Trovato misurando l'annullamento: i messaggi che
ruotano ogni 4 secondi («Estrazione concetti chiave…») **sovrascrivevano** «Genero audio
23/78», cioè l'unica informazione che dice se sta avanzando o se è appeso. Ora **chi passa
un testo comanda** (`window._loadingTestoProprio`): la rotazione serve alle attese mute.
Misurato: 7 letture in 14 secondi, **zero messaggi generici**.

**5. E la cache dei clip ora SOPRAVVIVE alla chiusura.** Era il punto che costava soldi:
i 23 blocchi pagati sono spariti chiudendo l'app. I clip vanno su disco in
**`<userData>/tts-cache/`** (scelta di Giacomo: è lavoro in corso, non un materiale — nel
vault sarebbero ~20 MB di roba tecnica in mezzo ai documenti di classe, risincronizzati a
ogni ritocco). IPC sottili in `main.js`: `tts-cache-has` · `-get` · `-put` · `-clear`.
- **La ripresa è per BLOCCO**, perché la chiave è quella di sempre — `modello|voce|TESTO`.
  Correggendo una frase si rigenera quella e nient'altro; cambiando modello o voce si
  rigenera tutto, e deve essere così: clip di due voci diverse nello stesso audio si
  sentono. 📌 Quindi il modello si cambia PRIMA di cominciare, non a metà.
- **Si scrive subito, non alla fine**: se la quota si esaurisce al blocco dopo, quello
  precedente è già salvo. Scriverli tutti in fondo li perderebbe proprio nel caso per cui
  la cache esiste.
- ⚠️ **La frequenza viaggia nel NOME del file** (`<sha1>-<rate>.pcm`): il PCM grezzo non la
  porta dentro di sé, e riprendendo domani un default silenzioso sbaglierebbe sia
  l'intestazione del WAV sia i tempi del karaoke, che si calcolano dividendo i byte per la
  frequenza.
- **Si svuota quando la copia parlante è scritta** (regola di Giacomo), e la chiama chi ha
  scritto il file, non il motore: finché quel file non è su disco i clip servono ancora —
  è proprio la scrittura fallita che non deve costare una seconda registrazione.
  ⚠️ **Valvola**: annullamenti, crash e la pipeline lasciano orfani, quindi al primo uso di
  ogni sessione si buttano i clip più vecchi di **7 giorni**. Senza, la cartella cresce e
  basta.
- **Il preavviso conta il MANCANTE**: «58 blocchi da leggere — 20 già pronti dalla volta
  scorsa». Dire «78 blocchi · 12 minuti» il giorno dopo sarebbe falso, e farebbe rinunciare
  a una corsa ormai a un terzo dalla fine.

**Provato dal vivo su «Funzioni Urbane»** (17/8), compresa la parte che conta: seminati 20
clip, **chiusa e riaperta l'app**, la registrazione è ripartita da **21/78** senza una
chiamata, col preavviso che diceva i numeri giusti. Il round-trip dell'IPC è provato a sé
(scrive → trova → rilegge byte e frequenza → cancella).
📌 E la **quota giornaliera è stata vista dal vivo**, non solo nei test: sulla chiave di
Giacomo, esaurita, il toast dice «Hai esaurito la quota GIORNALIERA del modello vocale…»
invece di far contare mille secondi.

⚠️ Resta aperto il **tetto di 10/min**, che è una stima ottimistica: i dati del 17/8
dicono che il vero limite del TTS gratuito è più basso. Tarato troppo alto fa partire
chiamate destinate al rifiuto, e ogni rifiuto costa più dell'attesa che avrebbe evitato.
⚠️ E la **pipeline** popola la cache ma non la svuota (scrive la sua copia parlante da sé):
per ora ci pensa la valvola dei 7 giorni.
⚠️ `_audioMatchesText` confrontava con `_lastSynthesis` invece che col `data` passato: con
l'editor aperto su una sintesi del VAULT quello è un altro documento, e la guardia
avvisava «il testo è cambiato» su una voce appena registrata.

### ELABORA — console
Sidebar dei progetti → tabelle dei documenti → il documento entra nella **tela**.
`mappai-elabora-console.js`. La vecchia colonna a sette gruppi è stata **potata il
13/8**: non c'è più una seconda strada, né il flag che la accendeva. ELABORA elenca le **sorgenti** (ciò che si può ancora
modificare), INSEGNA elenca i **file**. Il **clone** funziona su tutti i generi.
Senza un progetto scelto l'area resta vuota: il gesto è nella colonna.

### INSEGNA — console
`MappAITeach.openConsole(voce)` in `mappai-landing-teach.js`. Chip classe·materia →
colonna delle mappe **dal disco** (`getAllVaults`, che è la fonte di verità: una mappa
senza progetto in localStorage compare lo stesso) → materiali in **elenchi per genere** →
documento nella tela con la barra (stampa · scarica · cartella).

⚠️ **PUNTO FERMO (Giacomo, 13/8): la vista «mappa scelta» resta com'è.** Una riga di
**quattro comandi** — Mappa · Elabora · QR · Cartella, che diventano tre sui Knowledge
Graph, dove «Elabora» non ha un bersaglio — e sotto le tabelle dei materiali **impilate in
una colonna**. Le due colonne del 6/8 sono state abbandonate l'11/8 perché a metà
larghezza il NOME del file, che qui è l'informazione principale, si troncava troppo
presto. Se serve una superficie nuova, si trova un altro posto: non si aggiungono righe
qui.

Uscendo verso una mappa si lascia un **segnalibro** in `sessionStorage`
(`mappai_teach_console_back`) che `init()` consuma una volta sola: HOME fa
`location.reload()`, quindi niente sopravvive tranne lo storage.

### CABINA — console
`window.openCabina(voce)` in `mappai-cabina.js`: **undici viste in cinque gruppi** (Profilo
insegnante · Allievi · Classi — poi *L'app*: Impostazioni AI · Consumi AI — *Imparare*:
Consigli di studio · Tutorial — *Note d'uso*: Termini · Privacy — e dal 15/8 **Sviluppo**:
insegnai.ch · Segnalazione). **Nessun ponte**: dal 13/8 anche «Impostazioni AI» vive
qui — provider, chiave, Product ID, modello e listino.

**Sviluppo (15/8)** — le due cose che vivevano SOLO nel cassetto insegnai, cioè visibili
solo sulla landing vuota e irraggiungibili appena si comincia a lavorare:
- **insegnai.ch**: ritratto tondo (`public/insegnai_profilo.png`), chi c'è dietro (testo
  dalle STESSE chiavi `about_desc*` del cassetto — una fonte sola), il progetto insegnai.ch
  e i quattro collegamenti. Sono **azioni**, non link: in Electron un `<a target=_blank>`
  passa da `setWindowOpenHandler` e apre una finestra dell'app, mentre `openExternal` li
  consegna al browser di sistema, che è dove ci si aspetta un profilo social.
- **Segnalazione**: sei categorie (voci con icone Lucide), il testo, «Prepara l'email», e
  il **registro degli errori** con Copia · Apri Diagnostica · Svuota.
  ⚠️ La voce nella colonna è l'unica con una veste sua (`mm-nav__v--segnala`): è il CLONE
  del bottone ambra del cassetto, misurato sul bottone vero e non copiato dalle sue classi
  Tailwind (le regole globali dell'app lo rendono padding 8 / corpo 15 / seconda riga
  13-700 a .7, non quello che il markup dichiara).
- **Il modale «Invia segnalazione» è PENSIONATO** (markup fuori da `index.html`, e con lui
  `openFeedbackModal`/`closeFeedbackModal`/`submitFeedback`/`selectFeedbackCategory`). Di
  app.js restano `categorieSegnalazione()` — fonte unica di quelle sei voci — e
  `inviaSegnalazione(cat, testo)`, che compone l'email. Il bottone del cassetto apre la
  Cabina. ⚠️ In quella vista **ogni comando ridisegna**: il testo digitato si raccoglie
  nello stato PRIMA del ridisegno, o sparisce al primo clic (il valore lo porta lo schema,
  non il DOM).

**Gestione cartelle** — ultimo riquadro del *Profilo insegnante*: dice dove finiscono i
file, con il percorso vero, l'elenco delle sottocartelle letto da `FilesCore.SUB` (mai
scritto a mano: «Allievi» e «Diagnostica» sono nate dopo) e i comandi **Apri la cartella**
· **Cambia posizione**, che apre la finestra storica di `MappAIFiles`. Quella finestra non
avvisa nessuno quando si chiude: un `MutationObserver` aspetta che sparisca e rilegge,
altrimenti il riquadro dichiarerebbe il percorso VECCHIO dopo che i file sono già stati
spostati.

### Il REGISTRO LOCALE DEGLI ERRORI (15/8)
Non è telemetria e non è un crash reporter: **niente parte da solo**. Prima di oggi un
errore non lasciava traccia e la segnalazione diceva «si è chiuso», che non è
diagnosticabile.
- `public/js/mappai-errori.js` cattura `error`, `unhandledrejection` e le risorse che non
  caricano; `main.js` registra anche `render-process-gone` (**il crash vero**: lì il
  renderer non c'è più per registrarsi da sé), `child-process-gone`, `uncaughtException`,
  `unhandledRejection`. Provato sull'app viva con `Page.crash`: riga
  `{"dove":"renderer-gone","motivo":"crashed","exit":5}`, main sopravvissuto.
- ⚠️ **L'Uscita forzata NON è registrabile, e non lo sarà mai**: macOS manda `SIGKILL`,
  muore anche chi dovrebbe scrivere. Giacomo l'ha provata il 15/8 e il registro taceva —
  sembrava rotto, era fisica. Coperta **al giro dopo**: al boot si posa
  `Diagnostica/sessione-aperta.json` e `will-quit` lo toglie; se al boot successivo è
  ancora lì, la sessione prima è finita di colpo e si scrive `dove: 'chiusura-improvvisa'`
  con l'ora di quell'avvio. Provato: kill -9 → al riavvio la riga c'è; chiusura pulita →
  segnaposto rimosso e **nessun** falso allarme.
- File: `<cartella madre>/Diagnostica/errori.jsonl` (o `~/Documents/MappAI - Diagnostica`
  se la riorganizzazione non è attiva), rotazione a 1 MB con **una** copia precedente.
- Due difese, perché un registro che si riempie da solo è peggio di nessun registro:
  **dedup** (stesso errore nella stessa posizione entro 60s = contatore, non riga nuova:
  50 ripetizioni → 1 riga) e **tetto di 200 errori distinti** per sessione, dichiarato
  nell'ultima riga.
- Contenuto: messaggio, file e riga, provider, modello e titolo della mappa aperta. **Mai**
  il testo delle fonti né i profili di allievi e classi. Detto anche nella vista Privacy.
- Nell'email della segnalazione finiscono gli **ultimi 3**, senza stack: tre stack interi
  sfondano la lunghezza che alcuni client accettano e il `mailto:` non si aprirebbe.
- ⚠️ Il modulo ha una guardia di idempotenza: caricato due volte aggancerebbe due ascolti
  e terrebbe due tabelle di dedup — ogni errore in doppia copia, e la difesa che non vale.

### La VISTA viaggia col vault — vista.json (15/8 sera)
Quattro cose vivevano SOLO nello snapshot in localStorage di UN computer:
profilo della Vista studio, focus/lenti, timeline, foglio dei nodi rivisto.
Misurato su un foglio vero (251 KB): il 99% era fotocopia del vault, il pezzo
insostituibile pesa qualche KB. Ora:
- `mappai-vista-core.js` (core puro, +7 test): `raccogli` → che cosa entra in
  `vista.json` (null = niente file, e main.js toglie quello stantio);
  `applica` → il rientro, che non azzera ciò che la vista non porta;
  `statoSnello` → lo snapshot coi link a coppie di id (dopo il disegno D3 ogni
  arco portava dentro i due nodi INTERI: 120 KB di link per 8,8 di dati).
- `buildVaultMapData` allega la vista; `save-vault` la scrive; `load-vault` la
  legge; `directLoadVault` PRIMA azzera i cinque campi (i residui della mappa
  precedente non sopravvivono al cambio — stessa regola del tutorState) e POI
  applica.
- **Uscire scrive il vault**: HOME attende il `saveVault` (tetto 4s, la HOME
  non resta appesa a un disco lento) prima del reload; **⌘Q** passa da
  `before-quit` → il main trattiene l'uscita UNA volta, il renderer salva
  snapshot+vault e risponde, tetto 3s nel main (un'app che non si chiude più è
  peggio del guasto curato). `beforeunload` resta la rete sincrona.
- **Ripiego**: `loadProject` senza snapshot ma con `p.vault` apre dal disco
  (percorso ricostruito da mapsBaseDir + classDir/discDir/vault). È ciò che
  rende innocua una futura potatura del cassetto.
Provato sull'app viva, per intero: salva → `vista.json` su disco → cambio
mappa (campi azzerati) → ritorno (campi tornati) → HOME col segno non salvato
→ segno nel vault → ⌘Q vero via Apple Event → app uscita, vista aggiornata,
segnaposto di sessione rimosso → snapshot tolto a mano → la mappa si apre dal
disco con la sua vista. **La potatura con anteprima è FATTA** (15/8
sera): Cabina › Gestione cartelle mostra «Spazio di lavoro: N MB · X copie
vecchie» e il comando «Libera spazio» — la conferma RACCONTA che cosa va via
(le prime 5 mappe col conteggio, mai un muro di 98 righe) e che le mappe su
disco non si toccano. Core: `anteprimaPotatura` in teach-core (+2 test), la
stessa `vociDaPotare` del salvataggio a quota piena. Eseguita sui dati veri di
Giacomo premendo i bottoni veri: 243 copie via, **42,6 → 17,4 MB**, 98 voci
con 0 snapshot mancanti, e le mappe si aprono ancora (dal cassetto e dal
disco). A cassetto pulito il comando sparisce: un bottone che non ha niente da
fare non deve esserci.

### La cartella madre si ADOTTA da sé (15/8)
Le impostazioni vivono in `userData`, che è **diverso** fra `npm start` (sotto `dev/`) e
l'app pacchettizzata — e diverso di nuovo dopo una reinstallazione. Risultato: la stessa
`MappAI - file` piena di dati esisteva su disco, ma senza il flag l'app tornava a scrivere
nelle posizioni storiche. `adottaRootEsistente()` (main.js, una volta al boot) la adotta
se esiste ed è **abitata** (almeno una sottocartella nota) e scrive il flag; cartella
assente o vuota → non fa niente, non inventa e non sposta. Cerca solo in Documenti: una
cartella madre su un disco esterno resta da dichiarare con «Cambia posizione».

**I vault senza classe vanno in `Mappe/Generico/` (15/8 sera).** Prima restavano piatti in
`Mappe/`, mescolati ai file .json di export. «Generico» è un nome **riservato**, dichiarato
in un posto solo (`FilesCore.GENERICO`): chi scrive lo usa (`mapVaultParents('')` →
`['Generico']`, quindi auto-vault, pipeline e `vault-relocate` lo ereditano), chi legge lo
**ritraduce in `classDir` null** (`FilesCore.classDirDaCartella`, usata da `walkMappe` in
main.js — la camminata condivisa da `get-all-vaults` e dalla risoluzione per nome — e da
`adottaVault`). Senza la ritraduzione «Generico» sarebbe una classe fantasma nei chip e nei
filtri, e i progetti generici (`classDir` null) perderebbero la loro mappa. Sotto Generico
non c'è il livello materia: una cartella senza `index.yaml` lì non si scandisce. I vault
**piatti preesistenti restano leggibili** (livello 1, comportamento storico) e trovano il
loro progetto; nessuno spostamento su disco. Il ripiego «voce senza snapshot ma con vault»
chiede la posizione a `get-all-vaults` invece di ricostruirla a mano.
⚠️ Quei comandi non sono riscritti come schema: si **spostano**. Sono cablati per ID a
una dozzina di funzioni globali, e ricostruirli come dati vorrebbe dire due superfici
con gli stessi id. La console li porta nella sua area e li **restituisce** al
`<div id="config-ai-modal">` — che resta nel markup come loro CASA, non come superficie
— quando si cambia vista o si chiude. Senza la restituzione sparirebbero col riquadro.

### La PIPELINE dei materiali — lavora, e l'app resta navigabile
`MappAIPipeline.run(config)` in `mappai-material-pipeline.js`: step A mappa → B quiz →
C fogli nodi → D sintesi → E catena, con un manifesto su disco a ogni transizione
(`pipeline.json`), quindi «Riprendi» sa sempre da dove ripartire.

⚠️ **Il velo copre la sola area di CREA** (13/8): non se ne disegna un secondo, si
SPOSTA `#loading-overlay` dentro `#build-content` con la classe `in-area`
(`position:absolute`). Così restano il suo cronometro e i suoi messaggi, e quando CREA
viene nascosta il velo sparisce **con lei** — è il contenitore a governarlo, non una
riga di codice. Alla fine torna al `body`, anche in caso di errore.

⚠️ **Finché lavora, l'app non accetta lavoro nuovo** e lo dice: «Pipeline occupata,
riprova più tardi.» (`window.mappaiOccupato()`). Il lucchetto ha una **chiave interna**
(`Pipeline._interno`), perché lo step A chiama `startGeneration` e senza la pipeline
bloccherebbe sé stessa. Porte chiuse: `startGeneration` · i quattro punti che caricano
una mappa (`loadProject`, `loadMapVault`, `directLoadVault`, `importGraph`) · Espandi
con AI · quiz e flashcard del nodo · rigenera set · Timeline · cross-link AI · Studio
attivo · Sintesi di ramo · Tutor del nodo.

⚠️ **La sentinella d'identità** è la rete sotto: la cartella di destinazione si fissa
all'inizio, ma i passi costruiscono i materiali **leggendo `appState`**. Prima di ogni
passo si controlla che titolo, vault e id di progetto siano ancora quelli; se no la
pipeline **si ferma e lo dice**, col manifesto già scritto (da lì «Riprendi»). Il numero
dei nodi NON entra nel confronto: la pipeline stessa lo cambia.

### GENERARE MENTRE SI LAVORA — il lucchetto, il contesto, l'avviso (14/8)
Cinque pezzi decisi con Giacomo, in quest'ordine. Il **velo su CREA resta** (sua
decisione, 14/8): oggi però non è più lui a impedire i danni — lo fanno i pezzi qui sotto.

**Il lucchetto** (`public/js/mappai-generazione.js`, `window.MappAIGen`). `mappaiOccupato()`
copriva la PIPELINE, non una generazione MM/KG nuda: finché il velo copriva tutto lo
schermo non si notava, ma da quando copre la sola area di CREA si gira per l'app — e
bastava un HOME (`backToLanding` fa `location.reload()`) per ucciderla in silenzio, coi
token già spesi. `startGeneration` alza il lucchetto attorno all'estrazione e lo abbassa
in un `finally`; una riga in `mappaiOccupato` lo fa vedere ai **sedici** guardiani già
sparsi per l'app, più la guardia nuova su `backToLanding`. `MappAIGen.motivo()` è il testo
che dicono tutti — un comando spento senza motivo si legge come un difetto dell'app.

**I comandi si spengono e lo mostrano**: nella briciola «Cosa», mentre genera, **si resta
in CREA** — «Crea» resta scegliibile (è dove si è, e il modulo lo copre il velo), ELABORA e
INSEGNA sono grigie col lucchetto e il motivo.
⚠️ Rovescia il primo giro, dove avevo bloccato Crea (per la seconda generazione) e lasciato
aperta INSEGNA, che legge dal disco e non tocca `appState`. Decisione di Giacomo, 14/8
sera: il prezzo è che mentre genera non si guardano più i materiali di un'altra mappa, il
guadagno è un modello solo — «finché lavora, sei in CREA» — invece di una sezione mezza
usabile da spiegare. La seconda generazione la ferma comunque il lucchetto: qui si tolgono
le porte, non i lucchetti. In INSEGNA le quattro azioni che caricano una mappa restano
guardate a runtime (`_consAvvia`), come rete.
⚠️ `bloccata` nelle voci del percorso è una **funzione**, non un booleano: le voci del
menu si costruiscono quando il menu si APRE, e un valore calcolato al montaggio non
vedrebbe una generazione partita dopo.

**Il contesto si congela** (`MappAITune.congela()` / `scongela()`). `classTuningPrompt()`
è chiamata a OGNI chiamata all'AI e `generaSet` ne fa una PER RAMO: cambiando classe a
metà, un foglio su cinque aree usciva metà tarato per una classe e metà per un'altra —
output plausibile, nessun errore. E la voce d'archivio, che senza `cls`/`disc` li prende
dal contesto ATTIVO, finiva etichettata con la classe di FINE pipeline. Congelano
`startGeneration`, `Pipeline.run` e `Pipeline.generaSet`. Si congela il **testo già
risolto**, non le sue fonti (nasce da due posti: `appState.userProfile` e
`MappAIClasses`); `scongela()` SEMPRE, anche su errore.

**Il destinatario si sceglie sempre** (`ensureGenerationContext`, kill-switch
`mappai_gen_ctx_sempre`). Il modale «Per chi è questa mappa?» arriva già compilato col
contesto attivo — nel caso normale un clic su «Genera» — con tre famiglie nello stesso
elenco: **Generico · le classi · l'allievo attivo**. «Generico» deve restare valido (al
primo avvio non esistono classi); scegliere l'allievo non tocca la classe (sono in
esclusione mutua e cambierebbe la cartella di destinazione).
⚠️ Non si chiede con `Pipeline._interno`: lo step A chiama `startGeneration` da dentro e
il destinatario la pipeline l'ha già nella sua configurazione.

**L'autosave periodico si sospende** durante generazione e pipeline: scriveva un progetto
a metà costruzione, e se la generazione falliva restava quello.

**Il velo copre l'AREA DI LAVORO di CREA, e gli avvii rapidi si spengono.** Il velo dentro
l'area era una cosa della sola pipeline: una generazione MM/KG nuda lo lasciava a tutto
schermo, e sopra restavano comunque «Nuovo Progetto · Apri Vault · Apri JSON» — i tre
comandi che RIMPIAZZANO il progetto, cioè quelli che il lucchetto rifiuta. Un bottone che
si vede acceso e risponde con un avviso è peggio di un bottone che non c'è. Li spegne il
foglio su `html.mappai-genera`; l'implementazione del velo è **una**
(`MappAIGen.veloNellArea/veloACasa`, la pipeline delega): due copie si sarebbero contese
lo stesso nodo e il suo segnaposto di ritorno.

**Alla fine, `window.mappaPronta()`**: se sei ancora dov'eri (nessuna console **visibile**)
passa al canvas come prima; se ti sei spostato, avvisa e non ti strappa la schermata.
Ritorna `true` solo se ha cambiato vista — i cinque punti di fine generazione disegnano il
grafo solo allora. Il progetto resta marcato **NUOVO** negli elenchi finché non lo apri.
⚠️ La console si guarda per DISPLAY, non per presenza nel DOM: un riquadro rimasto
nascosto direbbe «sono altrove» per sempre.

**Il bollino NUOVO** vive in `MappAIGen` con **due chiavi per riga** — ELABORA elenca
progetti (id in localStorage), INSEGNA elenca vault dal DISCO (percorso della cartella):
con una chiave sola comparirebbe in una lista e non nell'altra. Sparisce al primo clic,
da entrambe insieme. È una PAROLA e non solo un colore; il pulsare è un di più.

### I FILTRI e la BRICIOLA (14/8)
Difetto: aprendo ELABORA la colonna elencava tutti i progetti, e che le briciole in alto
fossero dei FILTRI non si capiva. (Causa vera: all'avvio l'app **azzera il contesto**
apposta, quindi la colonna parte sempre senza filtro.)
- Le due domande scendono **in testa alla colonna** (`CB.montaFiltriSidebar`), col valore
  scelto e la riga del conto «15 di 30 — mostra tutti». Corpo `--mnc-voce-fs`: stanno
  sopra le voci e non devono pesare più di quelle.
- ⚠️ **Non è un secondo stato da sincronizzare**: è lo stesso `specContesto` montato in
  due posti. Chi dei due scrive, l'altro si ridipinge. `opts.sempre` spegne la rivelazione
  progressiva **solo** in sidebar: là le due domande sono la guida e devono vedersi prima
  di essere scelte.
- **Aprire un progetto ALLINEA il filtro** a quel progetto (classe e materia lette dalla
  cartella, `MappAITeach.allineaContestoA`). Perciò «mostra tutti» non è un ornamento: è
  la via del ritorno, o l'elenco resta stretto attorno a una mappa sola.
- **La briciola in alto si completa quando scegli un progetto**: prima resta la sola
  «Cosa», poi il percorso intero fino al progetto, con l'ultima briciola che apre le altre
  mappe del filtro. ⚠️ Rovescia la decisione del 9/8 («sarebbe un secondo comando»): coi
  filtri nella colonna non duplica più niente, è la via breve. Il menu c'è **solo se c'è
  altro fra cui scegliere** — una tendina con una voce già spuntata si legge come rotta.
- Il **chip di INSEGNA** sparisce da sé: `montaPercorso` marca il box `mn-percorso` e la
  veste non glielo rimette.
- Nel menu «Cosa» **l'unica icona è il LUCCHETTO** sulle voci spente (Lucide, non emoji):
  dice una cosa che il testo non dice. Le icone accanto a Crea/Elabora/Insegna sono state
  tolte — un glifo messo per bellezza è un secondo alfabeto da imparare (invariante 15).

### CREA UN DOCUMENTO — il percorso, e le VARIANTI (16/8)
`ELABORA › Crea un documento` → quattro card: Foglio dei nodi · Catena dei perché ·
Sintesi · **Quiz, Domande aperte e Flashcard**. La quarta apre il percorso di
`mappai-crea-quiz.js`: tipo → a mano o con l'AI → parametri.

**La card «Sintesi» apre il generatore, non un hub** (17/8). Fino a ieri cliccarla non
produceva niente di visibile: portava all'hub «Materiali di studio», che si disegna a
`z-index: 9990` mentre questa console parte da 12000 — l'hub si apriva **davvero**, ma
dietro alla console. Due correzioni, e la seconda vale per tutti:
- i **tre modali della sintesi** (configurazione · risultato · scelta dell'audio)
  **chiedono il piano al motore** (`_zSopra` in `mappai-branch-synthesis.js`) invece di
  dichiararne uno scritto a mano. Si chiede dove il modale NASCE, non nel chiamante: la
  generazione è asincrona, quindi chi preme il bottone non sa quando comparirà il modale
  di risultato e non potrebbe alzarlo;
- il **ponte è sparito**: si chiama `openBranchSynthesisModal` direttamente. Non è un
  secondo ingresso alla generazione (invariante 21) — il motore resta uno, e mandare
  l'utente in un hub di dodici card perché ne scelga una che si chiama ancora «Sintesi»
  era un passaggio in più. Con l'ultimo chiamante se n'è andata `_vaiAlGeneratore`.
📌 `MappAIModal.alza(sel)` è ora nel **motore**, non in Cabina: alza una finestra non
migrata sopra la pila chiedendo `prossimoZ()`. Cabina delega. Una seconda copia scritta
altrove sarebbe tornata a indovinare il numero.

**Il modale dei parametri ha quattro gruppi** — «Che cosa chiedono», «Angolazioni»,
«Quante e come graduate», «Come si chiama il file» — invece di un elenco unico di cinque
campi. La spiegazione del nome sta **sul campo**: è l'aiuto di quella riga, non il tema
del modale.

**LE ANGOLAZIONI SONO UNA SCELTA MULTIPLA** (otto spunte su due colonne). Ogni angolazione
scelta produce un **foglio suo** sullo stesso materiale: è il modo in cui si preparano le
varianti di una verifica. Nel modale c'è la **stima** («3 fogli · circa 15 chiamate
all'AI»), che si aggiorna mentre si sceglie via `__campo`.

⚠️ **Due vincoli decidono la forma di `_generaVarianti`**, e nessuno è negoziabile:
- `Pipeline.generaSet` mette il **lucchetto** e lo rilascia nel `finally` → le chiamate
  vanno in **sequenza**, o la seconda torna «occupata»;
- `generaSet` **rifiuta un nome già preso** (`_nomeGiaPreso`) → ogni variante deve avere un
  nome diverso.

**Il nome della variante è la CHIAVE dell'angolo**, non l'etichetta a schermo:
`Domande-aperte-<Mappa>-causa.pdf`, `-conseguenza`, `-definizione`, e `auto` → **`misto`**.
📌 Non è una convenzione inventata: è quella che Giacomo applicava **a mano** — i file
`Domande-aperte-Il Clima-misto.pdf` nel vault lo dimostrano. Con un nome scritto dal
docente l'angolo lo qualifica («verifica di ottobre - causa»).

Un foglio che fallisce **non ferma gli altri**: si raccoglie l'esito e si dice alla fine
quanti ne sono usciti. Si apre il **primo**, non l'ultimo. Senza nessuna spunta non si
genera: si dice e si riapre il modale com'era.

### LA BARRA DELLA MAPPA — asciugata il 16/8
`CENTRA · LAYOUT · PIN¹ · TESTO · «mostra fino al livello»` — dove **PIN¹** e ATTR sono
*usciti* e vivono nel pannello della Vista studio (sono leve del force layout, e nella
barra stavano anche mentre si guardava una vista di studio, dove non toccano niente).

**Che cosa è uscito, e dov'è finito**

| pezzo | dove |
|---|---|
| RIORDINA · `+/−` distanza · `+/−` testo · PATH | **fuori dalla barra**; le funzioni restano nel codice, senza ingresso (§4) |
| PIN · ATTR | pannello della Vista studio, forma «mappa libera» |
| `+/−` testo | due **slider** nel pannello (nodi e linking words, separati) |
| LINK (tutti/gerarchia/cross) | **pensionato** con la lente delle famiglie di relazione |
| FISSA | **pensionata per intero** — 996 righe di `app.js`, due modali, 66 di CSS, 41 chiavi i18n |

**TESTO cicla `no → brevi → intere`** e agisce su ciò che si sta guardando: dentro una
vista di studio sul profilo di quella vista, sulla mappa libera sul canvas. Dice lo
**stato** (`NO`/`BREVI`/`INTERE`), come fa LAYOUT.
⚠️ Su quello span **niente `data-i18n`**: `changeLanguage` lo riscriverebbe con «TESTO» al
primo cambio di lingua, cancellando lo stato. Le tre parole le traduce
`aggiornaBottoneTesto`.
⚠️ «Brevi» tronca a 14 caratteri, e la regola **non è riscritta**: `CAP_REL` esce da
`mappai-studio-draw.js` e la legge anche il canvas — due tabelle darebbero due lunghezze
diverse per la stessa parola.

**Lo slider dei livelli è UNO** e governa tutte e quattro le viste. ⚠️ Il numero **non si
copia**: la barra arriva a `max(node.level, 5)`, la vista studio usa la profondità
**topologica** del sottografo, che cambia perfino fra un motore e l'altro. Si sincronizza
il concetto: *in fondo alla corsa = tutti*. Conseguenza visibile: alla stessa tacca le tre
viste mostrano quantità diverse (su «Il Clima» a livello 2: Albero 24 card, DAG e Fasci 6),
perché in Albero «livello» è la profondità della gerarchia e nelle altre i cross-link
allungano i cammini.

📌 Con LINK esce di scena l'**ultimo chiamante di `markMmCrossLinks`** — ed è un bene: era
quella chiamata a ricalcolare gli `isCross` a ogni pressione e a persisterli, cioè il modo
in cui il difetto del tronco finiva scritto nei `links.json`. Da ora, in una MindMap
`isCross` lo mette solo chi crea davvero un cross-link (Fase 4, dedup): un dato, non
un'euristica. Per i KG niente cambia (`markKgCrossLinks` è chiamata in generazione).

### VISTA STUDIO — il passo «STUDIO» del ciclo LAYOUT
Overlay a card sopra il canvas; il force layout resta intatto sotto e si ritrova uscendo.
Sette motori deterministici in `mappai-studio-layouts.js`, renderer condiviso in
`mappai-studio-draw.js`, pannello in `mappai-studio-view.js`.
- **Una mappa nuova si apre in ALBERO, con l'INDICE nella sidebar** (16/8). Vale UNA volta
  per mappa, riconosciuta dalla sua identità (id del progetto · vault · titolo).
  ⚠️ `initD3Visualization` non gira solo all'apertura: la chiamano anche l'espansione con
  l'AI, il merge e le modifiche dal tutor. Senza la firma, il default rispedirebbe il
  docente in Albero a metà lavoro. Nella firma **non** entra il numero dei nodi — cambia a
  ogni espansione, che è il caso da non confondere con una mappa nuova.
  ⚠️ Il flag `mappai_studio_attivo` **non esiste più**: la vista di partenza è una regola,
  non una preferenza da ricordare.
- **Il tab della sidebar non si sposta da solo**: ciclare i layout (e aprire un Focus) non
  porta più al tab «Vista studio». Il tab a schermo è quello che il docente ha scelto.
- **Il ciclo del bottone LAYOUT è `Mappa → Albero → Fasci → DAG`** (16/8; il passo libero
  si chiama **MAPPA**, non «LAYOUT» — tre passi su quattro dicevano il nome della vista e
  il quarto diceva il nome del bottone). La decisione
  è una funzione PURA — `MappAIStudioLayouts.cicloStudio(passo, motore)` — e non più una
  catena di `else if` dentro `toggleLayout`, che vuole d3 e mezza app per girare: è la
  cosa che l'utente incontra a ogni pressione del bottone, e non era provabile. Il
  bottone dice il **nome del motore**, non «STUDIO» per tutti e tre.
  ⚠️ Da un motore fuori dai tre (Anelli, Colonne… presi da «Altre opzioni») il passo dopo
  è l'**uscita**: chi l'ha scelto non viene spostato su Albero senza averlo chiesto.
  ⚠️ Orbita, radiale, separato e personale **hanno perso il loro ingresso**; i layout
  salvati restano sotto il bottone FISSA. Kill-switch `mappai_layout_ciclo_storico='1'`.
- **Una taratura per MOTORE** (16/8, `p.perMotore`). I tre motori disegnano cose di scala
  diversa e con una taratura sola o si sceglieva per l'uno o per l'altro:

  | | archi | parole | livelli | card | testo |
  |---|---|---|---|---|---|
  | **Albero** | solo gerarchia | intere | 260 · 28 | 176×120 | 22 |
  | **DAG** | + cross | intere | 260 · 28 | 176×120 | 22 |
  | **Fasci** | + cross | no | 50 · 30 | 80×30 | 11 |

  Comune ai tre: dall'alto · gerarchia visiva no · evidenzia **la parentela** · tutti i
  livelli · testo dei legami 9 · frecce separate · bande spente. Un motore senza taratura
  sua (Anelli, Colonne…) eredita quella dell'**Albero**, non quella dei Fasci.
  Le leve VIVE restano piatte su `p` (il renderer non deve sapere che esiste una taratura
  per motore); `perMotore` è solo la fotografia che si ripone cambiando motore.
- **Sulla mappa libera c'è anche «Esporta PDF della mappa»** (17/8, rilievo di Giacomo).
  Mancava proprio lì: la regola del 1/8 è «**Esporta PDF segue quello che guardi**» — nel
  focus la focus-map, nella vista di studio la vista — e sul passo di partenza aveva un
  buco. ⚠️ Non è lo stesso PDF: chiama `window.exportPDF` (il motore della barra, non un
  secondo), che esporta il CANVAS in vettori inquadrando l'intera mappa (`getBBox` ignora
  lo zoom) e dà alla pagina la misura del disegno — non è un A4 come quello delle viste di
  studio, e l'etichetta lo dice.
- **Sulla mappa libera il pannello ha quattro leve** (16/8): «Mostra fino al livello»
  (gemello della barra), **testo dei nodi** e **testo delle linking words** — due scale
  separate, prima erano una sola (`testo × 0.765`), e si ricordano fra le sessioni
  (`mappai_map_fs_node/rel`) —, il gruppo a tre delle linking words, e le due spunte
  **PIN** e **attrazione** arrivate dalla barra.
  ⚠️ Portano un attributo LORO (`data-sv-map`, `data-sv-mapchk`, `data-sv-map-seg`):
  mescolarle con `data-sv-sl` scriverebbe nel profilo della Vista studio valori che quel
  disegno non usa.
- **«Ripristina default»** nel pannello, e dice sempre di quale vista parla («Ripristina
  default · Fasci»): dove ogni motore ha la sua taratura, «ripristina» da solo non
  direbbe che cosa sta per tornare indietro.
- **Dove si salva**: nel progetto (`saveCurrentProject`, è dentro `appState`) e a livello
  UTENTE (`mappai_studio_profile`) — quest'ultimo è la taratura con cui si riapre la
  prossima mappa. HOME passa da `exit()`, ⌘Q da `onSalvaPrimaDiUscire` (⚠️ non da
  `beforeunload`, che con ⌘Q non è garantito).
- **Il tab è SEMPRE visibile** (16/8) e il pannello ha **due forme**. Dentro la vista:
  tutte le leve. Sulla **mappa libera**: solo la scelta della vista (con «Mappa» accesa) e
  **«Ripristina il layout fissato»**, che rimette i nodi dove `salvaLayout` («Fissa
  Layout», tasto destro sul canvas) li ha lasciati. Le altre leve lì non disegnerebbero
  niente, e comandi inerti sono peggio che assenti. Scegliere Albero/DAG/Fasci dal
  pannello ENTRA nella vista.
  ⚠️ `exit()` non nasconde più il tab e non scappa su «Struttura»: ridisegna il pannello
  nella forma «mappa libera». Il ripristino vero è `window.applyPinnedLayout()` in
  `mappai-d3-render.js` (là vive `simulation`), che usa anche il ramo `personal` del ciclo
  storico — una scrittura sola.
- **Un pannello solo**, uguale dentro e fuori dal focus: `profiloDi(k)` manda la geometria
  al profilo del focus e la resa a quello della vista.
- Le opzioni oblique (anelli · colonne · percorso · matrice · instradamento · ponticelli)
  stanno nel pieghevole **«Altre opzioni»**, dopo Esporta PDF.
- ⚠️ **`mappai-studio-layouts.js` e `-draw.js` non avevano un marcatore di cache** fino al
  16/8: modificarli non bastava a farli arrivare all'app.
- ⚠️ `exit()` viene chiamato in **due situazioni diverse**: col bottone LAYOUT è
  **volontaria** (`exit(true)`, spegne il ricordo), al cambio mappa è **di servizio** (lo
  lascia). Confonderle rende il ricordo inutile — si perderebbe a ogni cambio di mappa.

---

### Il TRONCO della MindMap non è un cross-link (16/8)
`markMmCrossLinks` chiedeva livelli adiacenti **e stesso `group`** per dire che un arco è
gerarchia. Il ROOT però non sta in nessun ramo: ha `group: 0` e ogni L1 riceve un intero
suo (il colore della macro-area). Per gli archi del tronco «stesso group» era falso **per
costruzione** → tutti marcati `isCross`, e col filtro «solo gerarchia» il root si staccava
e i suoi L1 diventavano radici. Valeva per **ogni** MindMap, non per una mappa sola.
- La regola ora deroga sugli archi **0↔1**, e solo lì.
- ⚠️ Il flag è un **DATO** già scritto nei `links.json`: `markMmCrossLinks` gira dentro
  `cycleLinkVisibility` (il bottone LINK), quindi premerlo lo persisteva. Le mappe vecchie
  le rimette a posto **`repairRootHierarchy`**, chiamata in `initD3Visualization` — l'unico
  istante attraversato da tutte le strade di caricamento. È **stretta di proposito**: tocca
  solo gli archi 0↔1 marcati cross in una MindMap, dove «è gerarchia» è la definizione, non
  un'euristica.
- Misurato su «4R › Geografia › Il Clima»: 5 archi su 5, 6 radici → 1.

---

## 4. I debiti aperti, in ordine di quanto mordono

Verificati sul codice il 13/8: ognuno esiste ancora.

0. ✅ **I SIMBOLI SONO CUCITI DENTRO I CARATTERI (19/8).** Chiuso: i glifi
   scientifici ora ci sono in tutti e quattro, e nessun foglio li perde più.

   **Il fatto da cui è partito.** Un quiz di elettricità è uscito con l'ohm in un
   carattere diverso dal resto. Misurando, il problema era largo e vecchio: **anche
   Space Mono** — con cui è stato prodotto tutto finora — non aveva `✓ ✗ ─ │ ├ └ ▲ ▼
   Ω Δ α β`. E i due percorsi di esportazione fallivano in modo diverso:

   | percorso | chi ci passa | che cosa succedeva a un glifo mancante |
   |---|---|---|
   | **Chromium** (HTML → printToPDF) | quiz, domande aperte, sintesi, report | **ripiega** su un carattere di sistema: il simbolo si vede, in un'altra veste |
   | **jsPDF** | grafi, vista studio, dossier, foglio dei nodi | il glifo **spariva**, e non lo diceva nessuno: «ohm 12 Ω · spunta ✓» usciva «ohm 12 · spunta» |

   ⚠️ **La riga NON si tronca — quello che era scritto qui era sbagliato.**
   Rimisurato sui PDF veri (`pdftotext` su `/tmp/g-jspdf-*.pdf`) e riprodotto fuori
   dall'app su jsPDF in Node: il comportamento è **uno solo per tutti e quattro**, il
   carattere senza glifo viene scartato e il resto della riga si stampa. Il meccanismo
   sta in due pezzi diversi di `jspdf.umd.min.js`, e il secondo è una mina che dorme:
   · `postProcessText` tiene un carattere solo se il font ha il glifo **oppure se il
     suo codice è < 256**; il resto lo butta — `Ω` (U+03A9) e `✓` (U+2713) di lì.
   · `pdfEscape16` fa `if ("0" == gid) return`: **quello sì tronca** la riga al primo
     glifo mancante, ma ci arrivano solo i caratteri sotto 256 non mappati. Nei
     quattro caratteri sono i soli codici di controllo, quindi non si vede. Un
     carattere futuro con un buco in Latin-1 lo farebbe vedere eccome.

   **La cura: i glifi si CUCIONO dentro il font**, in `tools/font/prepara-font.py`
   (`cuci()`), donatore **DejaVu Sans** (Bitstream Vera License, un donatore solo per
   greco · matematica · frecce · filetti · forme · spunte · apici e pedici). Perché
   così e non altrimenti: jsPDF incorpora **un** font per `setFont` e non sa ripiegare
   a cascata come il browser; e i simboli arrivano anche dal testo dell'AI, dove non
   si può decidere in anticipo che cosa comparirà — l'unica difesa è che il carattere
   il glifo ce l'abbia. La cucitura è **una tantum, in fase di build**: a runtime non
   cambia una riga di codice, quindi non può rompere l'impaginazione.

   **Le due regole che tengono in piedi la cucitura** (le verifica lo script, e si
   ferma se saltano):
   - **i glifi che c'erano non si toccano mai.** Le costanti `advance`/`headAdvance`
     di `mappai-font-core.js` sono misurate su di loro: cambiarne uno ricomporrebbe
     fogli che oggi escono giusti. Verificato: **0 advance cambiati** su tutti e otto
     i file.
   - **su un monospazio il passo è sacro.** Space Mono ha un solo advance (612): il
     glifo donato si rimpicciolisce fino al passo e ci si centra dentro, così il conto
     dei caratteri per riga di `print-layout` resta valido. ⚠️ **Eccezione misurata**:
     filetti e barre (`U+2500-259F`) si tirano in larghezza fino al passo invece di
     centrarsi — centrati lasciavano 10 unità di buco fra un `├` e il `─` che segue, e
     l'albero del dossier usciva **tratteggiato**. L'1,7% di distorsione non si vede,
     il buco sì.

   **Che cosa è cambiato nei file** (`python3 tools/font/prepara-font.py`):
   - `public/fonts/*.ttf` — **+1065** glifi in Space Mono, **+1152** in TM Sans e TM Alt,
     **+1191** in Atkinson (anche i corsivi, col taglio giusto del donatore: un Ω chiaro
     dentro un grassetto si legge come un errore di stampa). La rigenerazione è
     **identica byte per byte** (`recalcTimestamp = False`, o ogni build sporcherebbe
     il repo con otto file «modificati» senza che sia cambiato niente);
   - `public/js/vendor/*-font.js` — i moduli per jsPDF, ora **tutti generati**, Space
     Mono compreso (prima era scritto a mano e lo script ne *decodificava* i byte:
     un modulo non rigenerato vorrebbe dire schermo con l'Ω e PDF senza). 461-733 KB
     l'uno, e si caricano a richiesta;
   - `public/js/vendor/*-incorpora.js` — i byte dentro i documenti: **da 76-101 KB a
     ~230 KB** a documento. È il prezzo dichiarato: un documento in più pesa quanto
     un'immagine, e in cambio una formula stampata non perde pezzi.

   ⚠️ **TestMe si chiama «TM Sans» e «TM Alt»**, e non è un capriccio: la sua OFL
   dichiara «Reserved Font Name TestMe» e il §3 vieta a una **versione modificata** di
   portare quel nome — cucirci dentro dei glifi la rende modificata. Space Mono e
   Atkinson non dichiarano nomi riservati e tengono il loro. La paternità
   (Perondi/Romei, da Titillium) resta nella descrizione del selettore e nel copyright
   dentro il font, che è dove la licenza vuole che stia. Gli `id` (`testme-sans`,
   `testme-alt`) **non cambiano**: sono un dato salvato nei documenti e nelle
   impostazioni. Cambia invece il nome nei file dei materiali NUOVI
   (`… - TM Sans.pdf`); quelli già su disco restano come sono.
   📌 Se un giorno si vuole indietro il nome, la strada è chiedere il permesso scritto
   ai due autori — la licenza lo prevede.

   **Com'è verificato, e come si rifà in un minuto:**
   - `python3 tools/font/copertura-glifi.py` → «nessuno: tutti i simboli dei fogli
     jsPDF hanno il loro glifo». Restano `NO` solo 💡 e 🎓, che sono **emoji a colori**
     su percorso HTML: le disegna Noto Color Emoji, non un carattere di testo.
   - `npx electron tools/font/prova-glifi.js` → tutti e sei i PDF (tre caratteri × due
     percorsi) leggono «ohm 12 Ω · spunta ✓ · freccia → · fine», e `pdffonts` dice che
     il font è **incorporato** (`/BaseFont /TM#20Sans`, `/Space#20Mono`).
   - una pagina di prova con fisica, chimica, matematica, segni e filetti nei quattro
     caratteri: 112 caratteri, **112 glifi scritti, 0 persi** in tutti e quattro.
   - suite **1188/0**.

0-ter. ✅ **RISOLTO in giornata — e l'avevo classificato male.** Era scritto qui come
   «da decidere se conviene incorporare i caratteri per il QR». Non era una comodità: era
   la condizione perché il **PDF** uscisse giusto, perché la finestra che stampa carica da
   `data:` e lì un `file://` è bloccato. Chiuso incorporando i byte (sottoinsieme + WOFF,
   76-101 KB). Lezione: un debito che si può descrivere come «sarebbe comodo» va provato
   sul prodotto prima di classificarlo — questo era un difetto, e si vedeva solo aprendo
   il PDF. Testo originale sotto, per memoria.

0-quater. ~~⏳ **I caratteri non viaggiano fuori da questo computer (18/8).**~~ Le `@font-face`
   di un documento puntano ai file in `public/fonts/` con un URL locale: perfetto per la
   stampa e per il PDF (dove il carattere finisce incorporato), inutile per un documento
   **condiviso via QR** e aperto dal telefono di un allievo, che cadrà sul carattere di
   sistema. La cura è incorporare il carattere in base64 dentro quell'HTML
   (`MappAIFont.perPdf` ha già i byte): +150-200 KB a documento, che su LAN non sono
   niente. Non fatto perché è una decisione di prodotto — vale la pena su TUTTI i
   documenti condivisi, o solo su quelli con un carattere scelto apposta?
   ⚠️ E il carattere è proprio la cosa che a un allievo dislessico serviva di più.

0-bis. ✅ **RISOLTO (15/8 sera): aprire una mappa dal disco ADOTTA la sua identità.**
   `directLoadVault`/`loadMapVault` non toccavano mai `currentProjectId`: il salvataggio
   scriveva la mappa nuova nella scheda della PRECEDENTE (trovata una voce «2.1 PROJECT E»
   puntata su un altro vault) e a ogni avvio nasceva una scheda in più — 355 voci per 98
   mappe, 43 MB su ~48 di quota, 46 copie di una sola mappa. Ora:
   `StorageManager.adottaVault` (chiamato dai due ingressi) trova la voce per POSIZIONE su
   disco via `MappAITeachCore.progettoDelVault` (confronti in NFC) o conia un id nuovo, e
   allinea `activeVaultClassDir/DiscDir`, che erano il residuo della mappa precedente.
   RETE nel salvataggio: voce esistente con un vault DIVERSO da quello attivo → l'identità
   si stacca e se ne conia una — mai scambiare. E la QUOTA non spezza più il salvataggio:
   snapshot PRIMA dell'indice (invariante 18), a spazio esaurito si libera coi doppioni
   (`vociDaPotare`, mai la voce in corso) e si riprova, col toast; se non basta, errore
   DETTO. Provato sull'app viva: Clima → Project E cambia identità e aggancia la voce
   giusta; due salvataggi → zero voci nuove; identità sporcata a mano → conia senza toccare
   la voce di Clima. Ramo quota provato in harness Node.
   ✅ **Anche la pulizia una tantum è FATTA, e ha tenuto.** Misurato nell'app vera il
   **16/8** (CDP, sola lettura): `localStorage` pesa **17,4 MB**, ci sono **99 voci di
   progetto per 99 mappe distinte** — una riga per mappa — e **zero copie in eccesso**.
   Il 15/8 sera erano 355 voci per 98 mappe. Che dopo un giorno di lavoro il rapporto sia
   ancora 1:1 è la prova che vale più della potatura stessa: il difetto a monte è fermo
   davvero, non si stanno riformando doppioni.
   ⚠️ Questa riga diceva il contrario fino al 16/8 («resta la pulizia una tantum delle
   ~257 copie»): era stata scritta PRIMA di eseguirla, nella stessa sessione, e mai
   aggiornata. Il diario in `CLAUDE.md` diceva già «243 copie via». Quando due documenti
   si contraddicono, **misurare** — qui è bastato leggere `localStorage` dall'app viva.
   Il conto si rifà così, con l'app aperta su `--remote-debugging-port=9222`: leggere
   `tutor_ai_projects` e passarlo a `MappAITeachCore.anteprimaPotatura(P, 1, pesoDi)`,
   che è la STESSA funzione della Cabina (se qui e là uscissero due numeri, uno dei due
   sarebbe una bugia). In app lo dice Cabina › Gestione cartelle, riga «Spazio di lavoro».
   📌 La chiave più pesante non è più una mappa ma **`mappai_saved_documents` (1,9 MB)**,
   l'archivio dei documenti: se il cassetto tornerà a crescere, è lì che va guardato
   prima — nessuna potatura lo tocca.
   ⚠️ Trappola vista provando: `window.StorageManager` è la CLASSE DOM nativa (funzione,
   sempre truthy) — anche nelle prove CDP va usato il nome lessicale nudo, o si misura un
   oggetto che non è quello dell'app (invariante 3, versione da banco).

0. ✅ **RISOLTO (15/8 sera): l'accento non scollega più una mappa dal suo progetto.**
   `MappAITeachCore.nfc` / `stessoNome` (esportati, +4 test con le due forme VERE) e
   normalizzazione nei confronti che incrociano disco e memoria: `matchProjectToVault` e
   gli altri sei di `mappai-landing-teach.js`, `filterByClass` e `matchesSelectedProject`
   nel core, la posizione del ripiego in `storage-lang`, la guardia «mappa cambiata»
   della pipeline (che avrebbe fermato una pipeline per un accento).
   ⚠️ Correzione di una cosa scritta male ieri: **non è vero che macOS scrive sempre in
   forma scomposta** — HFS+ lo imponeva, APFS PRESERVA la forma di chi crea il nome. Sul
   disco di Giacomo convivono: `Présent` NFC e `Elettricità - MM` NFD; fra le voci di
   progetto, 2 e 2. Provato sull'app viva sul caso vero (cartella NFD contro voce NFC):
   confronto vecchio `false`, nuovo `true`.


1. ✅ **RISOLTO (13/8 sera): creare un materiale a mano arriva in fondo.** Il ramo
   documento di `generaSet` ora scrive la SORGENTE prima della resa (archivio → PDF →
   vault: un `htmlToPdf` che fallisce AVVISA col motivo, `pdfErrore`, senza perdere la
   generazione), il titolo segue la convenzione dei cloni (`MappAIClona.etichetta` → in
   ELABORA la riga porta nome, cestino e clona; senza nome resta la forma della pipeline
   così rigenerare AGGIORNA l'originale), un nome già preso si rifiuta PRIMA di spendere
   token, e il bus viene avvisato. In INSEGNA le voci d'archivio dei fogli cartacei
   (`quizpaper`/`flashsheet` senza PDF proprio) **non si mostrano più** (decisione di
   Giacomo: INSEGNA elenca i FILE; kill-switch `mappai_archivio_insegna='1'`) — spariscono
   con esse le righe dei file cancellati dal Finder E le righe doppie che la dedup per
   nome non fondeva. Provato in **Electron vivo** (CDP, vault «La Politica Svizzera», AI
   vera). Diario: [`HANDOFF-crea-materiali.md`](HANDOFF-crea-materiali.md). Residui
   dichiarati: (a) una voce d'archivio ORFANA (set eliminato dopo l'archiviazione) non
   compare più nelle tabelle — resta raggiungibile dal picker QR, da «Documenti salvati»
   e col kill-switch; (b) il picker QR mostra APPOSTA le voci d'archivio HTML che le
   tabelle nascondono (è la copia senza soluzioni che si manda agli allievi); (c) la voce
   d'archivio del gesto singolo prende classe/materia dal contesto ATTIVO, non dalla
   mappa; (d) `MappAIStudyDocs.save` ora ritorna `null` quando la quota localStorage
   scarta il documento.

   **Seguito (13/8 notte, dalla seconda prova di Giacomo): «creare a mano» ora è
   davvero possibile, e il documento appena creato SI VEDE.** Due difetti distinti:
   (1) le **domande aperte non si potevano scrivere a mano** — il percorso «Le scrivo
   io» rispondeva «genera con l'AI e poi correggi», e la ragione era vera ma mal
   risolta: non sono un set giocabile (non entrano in `studySets`, il player pretende
   opzioni), quindi non esisteva un «set vuoto» da creare. Ora il foglio vuoto lo
   scrive `MappAIPipeline.nuovoFoglioAperte` (una domanda in bianco, archiviata come
   `quizpaper`: `setFromHtml` richiede almeno un item, con zero il foglio si
   riaprirebbe «senza domande»), l'editor la riapre come qualunque altra e il PDF lo
   fa «Crea PDF» — salvare non è pubblicare. Il titolo e il rifiuto dei nomi doppi
   passano dagli stessi due helper di `generaSet` (`_titoloDoc`, `_nomeGiaPreso`), e
   senza nome, se un foglio esiste già, il nome diventa obbligatorio invece di
   rimpiazzarlo.
   (2) **Il documento creato non compariva**: l'editor si disegna solo dentro
   `#elab-doc-host`, che monta la console ELABORA quando è in modalità documento — e
   nessuno gliel'aveva detto. Valeva anche per i quiz MC. Ora l'editor **annuncia**
   (`mappai-doc-aperto`, gemello di `mappai-doc-uscito`) e la console accoglie il
   documento nella tela; se il gesto parte da fuori, la console si apre prima
   (`_casaDocumenti` in `mappai-crea-quiz.js`). Provato in Electron vivo cliccando il
   DOM vero, dentro la console: MC e domande aperte, editor a 702px con la domanda in
   bianco e i chip delle macro-aree della mappa.
2. ✅ **RISOLTO (13/8 notte): l'angolo arriva alle domande aperte, e il foglio si
   può graduare.** Diagnosi da otto fogli veri di Giacomo (200 domande misurate): il
   set «esempi concreti» non conteneva **un solo esempio**, «definizioni» era il meno
   definitorio di tutti, la prima domanda era **la stessa in quattro set** — erano
   otto estrazioni dello stesso foglio «Automatico». Causa: `_genOpenQuestions` non
   riceveva `angle` (andava solo a `generateDynamicQuiz`), e il template ordinava
   comunque «VARIETÀ COGNITIVA», che è l'opposto di un angolo. Ora l'angolo è
   **assoluto** (`window.openQuestionsAngleBlock`, che legge la STESSA `QUIZ_ANGLES`
   dei quiz), il blocco sta **fuori dal template e prima** — così vale anche per chi
   ha un `prompts_config.json` personale — e **dichiara di prevalere** sulle
   indicazioni di varietà; la riga del template è diventata `{{varieta}}`, vuota
   quando un angolo è scelto.
   Con esso la **graduazione**: ogni domanda dichiara `livello` base|ponte e il
   docente sceglie la **percentuale di domande d'avvio** (default 40%). La quota si
   calcola **per ramo** e arriva al modello come NUMERO («2 su 5»), non come
   percentuale da calcolare mentre scrive. Le domande d'avvio vanno **prime dentro il
   loro ramo**; il segno «AVVIO» compare **solo sul foglio soluzioni**, mai sulla
   copia degli allievi (dire «facile» a chi non ci riesce è un giudizio, non un
   aiuto). Logica pura in `mappai-pipeline-core.js` (`quotaBase`, `contaGraduazione`,
   `ordinaGraduazione`) con 8 test nuovi.
   ⚠️ **Trovato solo con l'AI vera**: con `livello` opzionale nello schema il modello
   **non lo emetteva** — l'istruzione veniva letta e il campo che la rende
   verificabile spariva, quindi tutte le domande cadevano su «ponte» e la leva
   sembrava non fare niente. Ora è `required`, più l'ordine operativo «scrivi per
   prime le N di avvio». Provato su «Il Clima» (4R): 2 base + 3 ponte esatti su due
   angoli opposti, esempi concreti dove prima non ce n'erano.
   **Nell'editor il livello si cambia** (13/8 notte): due chip **AVVIO · PONTE** nella
   testata di ogni domanda (ambra / indaco, `oqLivello` → `setOpenField(…,'livello')`),
   perché è chi CORREGGE ad avere l'ultima parola — a una domanda d'avvio si aggiunge
   un collegamento e quella smette di esserlo, mentre le tracce continuerebbero a dire
   di sì. Provato in Electron: clic → livello cambiato → salvato → riletto
   dall'archivio → il foglio soluzioni porta due segni «avvio» invece di uno.
   Aperto: la pipeline batch usa il default 40% — `config.quiz.base` è **già letto**
   dal motore, manca solo il campo nel bento (voce nell'inventario dell'Officina +
   `mp-base` in `_readConfig`).
3. ✅ **La maniglia della colonna: il posto è riservato** (14/8, chiuso). Occupava
   l'angolo in alto a sinistra dell'area — 34×34, sopra il contenuto — senza che
   nessuna regola lo dichiarasse: due pezze in due giorni, e «Crea nuovo» di
   ELABORA coperto per 10px. Strada scelta da Giacomo: **margini nell'area**, ma
   con tre correzioni — **una** regola per tutte le console (non due eccezioni,
   che lascerebbero pagare la terza), numero **derivato** dalle leve della
   maniglia (`--mnc-man-size`, `--mnc-man-x`) e non scritto a mano, costo reale
   **10px** (l'area ne pagava già 24). Censimento rifatto: **zero elementi sotto
   la maniglia** in tutte e quattro le console e in entrambi gli stati, col primo
   contenuto esattamente al bordo destro della maniglia. Diario, misure e le due
   trappole pagate in
   **[`HANDOFF-maniglia-layout.md`](HANDOFF-maniglia-layout.md)**; la regola è la
   trappola §8.19 della guida.
3-bis. 🟡 **Codice rimasto senza ingresso il 16/8 — il PATHFINDER è stato tolto (17/8),
   il resto è ancora da decidere.**
   ✅ **Pathfinder pensionato per intero** su decisione di Giacomo: via `pathfinderActive`,
   `pathfinderState`, `window.togglePathfinder`, `calculatePath` (una BFS fra due nodi), il
   ramo di `handleBackgroundClick` che gli riservava il clic sullo sfondo, quello di
   `handleNodeClick` in `mappai-ui-canvas.js` che raccoglieva i due estremi, la riga di
   `mappai-context-menu.js` che lo spegneva entrando in «Collega» e le due regole
   `.pathfinder-active` in `style.css`. Verificato nell'app viva: `togglePathfinder` e
   `calculatePath` non esistono più, zero regole CSS residue.
   ⚠️ **Una trappola pagata, e vale in generale**: lo `.classed("dimmed", …)` dentro
   `applyVisualFilters` SEMBRAVA un residuo del pathfinder, ma l'espressione cominciava con
   `pathfinderActive &&` — quindi a pathfinder spento, cioè sempre, valeva `false` e
   **spegneva** lo sbiadimento. Era da lì che l'evidenziazione da clic su un nodo si
   azzerava muovendo lo slider dei livelli. Cancellandola avrei cambiato in silenzio un
   comportamento che nessuno aveva chiesto di cambiare: il reset è stato riscritto a chiare
   lettere. *Prima di togliere una condizione morta, guardare che cosa faceva il suo ramo
   `else` implicito.*
   🟡 **Restano senza ingresso** (richiesta era «elimina dalla navbar», non le funzioni):
   `riordinaMappa` (ui-canvas), `changeDistance`. `changeFontScale` è **tenuta apposta** —
   è l'involucro che muove insieme le due scale del testo.
   📌 `markMmCrossLinks` non ha più chiamanti (§3, «La barra della mappa»), e questo è
   voluto: era la sua chiamata a riscrivere gli `isCross` e a persisterli.

4. 🆕 **Cinque code del lavoro del 14/8, lasciate aperte di proposito.**
   (a) Il ramo **ALLIEVO** del modale «Per chi è questa mappa?» non è mai stato provato:
   questa installazione non ha schede allievo. È l'unico codice nuovo che nessuno ha visto
   girare. (b) Le quattro azioni di INSEGNA che caricano una mappa restano guardate solo **a
   runtime** (clic → avviso), non si *vedono* spente. Da stasera pesa meno: durante una
   generazione in INSEGNA non ci si entra proprio (la voce è col lucchetto), quindi quella
   guardia è diventata una rete, non la porta. (c) **«Solo le mappe senza classe»
   non è filtrabile**: sarebbe un terzo stato di `mappai_active_class`, che è anche il
   contesto di taratura dell'AI — un filtro non può prendersi quella leva, serve una
   decisione. (d) Lo **spinner in topbar non compare sulla mappa aperta** (là quella barra
   non esiste): una generazione lanciata dalla mappa non ha indicatore. (e) Il **titolo di
   un KG dedotto dal FOCUS vince sul nome del file** — una riga per invertirlo.
5. ✅ **RISOLTO (14/8 sera): la colonna delle console non sborda più.** Sbordava di 11px
   (106 col bollino NUOVO, che finiva oltre il bordo). Causa: un `<button>` con
   `width:auto` **non riempie il suo contenitore** — si stringe sul contenuto, come ogni
   controllo di modulo — e in un contenitore `block` le voci crescevano quanto il nome più
   lungo. `.mm-nav__gc` è ora flex-colonna: da flex item la voce si stira alla larghezza
   del contenitore meno i margini, e l'ellissi del testo torna a funzionare perché la riga
   ha finalmente una larghezza da rispettare. Misurato: sbordo 0, voci tutte a 232px.
6. ✅ **RISOLTO (14/8 sera): il rail è stato pensionato, e il flag con lui.** Via `FORME`,
   `montaRail`, il mini-logo, `alzaRail()` e ~50 righe di CSS; `mappai_console_bento_app`
   non esiste più (`_bentoApp()` risponde sempre di sì in tutti e quattro i moduli che lo
   chiedevano) e `--mnc-rail` resta a 0 perché due calcoli lo sommano.
   ⚠️ **Si è perso davvero il ritorno alla PRIMA PAGINA** (la landing vuota, `setMode('')`):
   viveva solo sul mini-logo. Nessun rimpiazzo, per scelta — se serve, la strada naturale è
   una voce «Home» nel menu «Cosa».
   ⚠️ Trappola pagata mentre lo facevo: cancellando il blocco del rail sono spariti con lui
   `consoleInCima`, `sezioneDelBox` e `vaiA`, che stavano lì dentro ma servono alla
   BRICIOLA — la landing è rimasta senza modo di cambiare sezione finché non li ho rimessi
   (guida, trappola 16).
7. **Sedici superfici senza destinazione.** La console «Mappa» (D1) è stata **ritirata il
   13/8**: il menu radiale resta quello che è e gira. Le superfici che le erano state
   assegnate — hub Materiali, Studio attivo, dossier, configurazione di studio, gestore
   dei layout… — hanno perso la meta e nel cantiere dicono «—». Sono **decisioni che
   mancano**, non lavoro in coda.
7-bis. ✅ **RISOLTO (18/8): il PDF VETTORIALE della mappa** — il ripiego raster non scatta
   più. Il clone SVG raccoglieva le regole CSS per SOTTOSTRINGA del `cssText` (362 regole,
   72 KB) e una regola `:is(a, b)` della veste manifesto uccideva `insertRule` dentro
   svg2pdf. Ora si tengono solo le regole il cui selettore combacia col clone (11 regole).
   Provato in Electron: PDF con 0 immagini e Space Mono incorporato. Dettagli in §3.
7-ter. 🆕 **La guardia alla scrittura dei MATERIALI** (progetto deciso il 17/8, non
   spedito). Un materiale dovrebbe poter essere scritto **solo nel vault della mappa
   APERTA**, e chi ci prova andrebbe fermato: è il pezzo che *previene* invece di
   diagnosticare. Tocca **17 punti di scrittura in 5 file** e va provato con Electron
   libero. ⚠️ Conviene che nasca come **avviso** con kill-switch prima di diventare un
   rifiuto: il guasto a monte è chiuso, quindi non dovrebbe scattare mai — e se scatta,
   si impara dove.
8. **Il bottone «HTML» dell'editor è a cinque passi** (sintesi con voce naturale): dal 17/8
   il primo è «registrata adesso», che vince su tutti.
9. **Resti del modello a un file solo**: `_voceNaturale()` cerca ancora l'**MP3 fratello**
   all'ultimo passo e `buildPrintHtml` accetta ancora `opts.audioSrc`
   (mappai-branch-synthesis.js). ⚠️ Riga corretta il 17/8: **non è più tutto codice morto**
   — il passo del blob ora è vivo, è il primo, e ci arriva la registrazione fatta
   dall'editor. Restano superati dai due file (`Sintesi-<Mappa>.html` editabile ·
   `Sintesi-voce-<Mappa>.html` da consegnare).
10. **I quattro cloni della barra dei documenti** (`branch-synthesis`, `causal-chains`,
   `timeline`, `glossary`, `live-reports`) → `mappai-doc-bar.js`. In
   `mappai-branch-synthesis.js` c'è ancora un `🖶` in un bottone, contro la regola «solo
   Lucide». ⚠️ I token `--mm-doc-*` vivono **in quel file, non nel foglio dei token**: la
   barra sta per metà in finestre `window.open`, che il CSS dell'app non lo caricano — ed è
   anche il motivo per cui `doc-bar` disegna le icone come SVG in linea (là
   `lucide.createIcons()` non esiste).
11. **Codice senza ingresso**: `StorageManager.renderRecentProjects` e `MappAITeach.editGrade`
   dopo l'eliminazione di «Progetti salvati». Degradano in silenzio, non lanciano.
12. **713 `!important` in `style.css`** — il 59% delle dichiarazioni. È il motivo per cui la
   cascata non è prevedibile a tavolino (GUIDA-ARCHITETTO §8, trappola 6).
13. **`mappai-landing-teach.js` è a 3.544 righe** e fa quattro mestieri (landing · console
   INSEGNA · tabelle condivise · archivio). Le tabelle, che ormai servono due console, sono
   il pezzo che uscirebbe per primo — come hanno fatto la cornice e il clone.
14. **Guardia mancante in `filesOrganized()`** (main.js): controlla che `filesRoot` sia una
    stringa, mai che la cartella esista → un percorso morto svuota l'app **senza dire nulla**.
15-bis. 🆕 **Sui DATI di Giacomo, non sul codice** (17/8, dalla ricognizione dei 31 vault):
    restano **cinque materiali di un'altra mappa** da decidere a mano — quattro
    `Caratteri ereditari-ALBERO-td-*.pdf` in «Riproduzione Sessuata», che **non hanno
    gemello** e quindi non si cestinano (vanno spostati o rigenerati), e un
    `Focus-Geografia Fisica-parentela.pdf` in «4-6 Geografie» — e **166 file col vecchio
    `-VERDE`** negli altri vault. In «Project E» ed «Elettricità - MM» i nomi sono già
    stati allineati (11 rinomine). Non è un difetto del codice: è la convenzione vecchia,
    e `tools/diagnosi/vault-estranei.js` la rimisura quando serve.
15. **Testo definitivo di «Termini & Condizioni» e «Privacy»**: quello che c'è dice il vero
    ed è verificato sul codice, ma è una sintesi informativa, non un documento legale.

La versione VIVA dell'elenco delle superfici da migrare è il **cantiere dell'Atlante**
(`public/dev/atlante-ui.html`, sezione «CANTIERE»): ogni superficie con la sua destinazione
e il costo letto dal codice. Si rigenera con `node tools/atlante-ui/build.js`.

---

## 5. Provato in Electron — che cosa è acquisito

### ⏳ DA PROVARE IN ELECTRON — le IMMAGINI, lette in casa (20/8 sera)
Niente di questo è mai girato nell'app vera: è misurato in 21 test puri e in un banco
(`tools/smoke/visione-fogli.js`). **Il motore è un programma a sé e va acceso**: Ollama è
già installato sul Mac di Giacomo, ma serve `ollama pull qwen2.5vl:7b` (~6 GB) una volta.
In ordine di quanto morde:
1. **Il motore SPENTO deve dire il rimedio.** Con Ollama chiuso: «Crea un documento →
   Domande aperte → Le genera l'AI → Da un'immagine» deve rispondere «il motore locale non
   risponde: apri Ollama e lascialo acceso», non un errore generico. Stessa cosa col
   modello non installato (il rimedio è il comando da incollare).
2. **Una fotografia vera di una fonte storica** (una miniatura, un manifesto): la
   **descrizione** deve essere fedele, e il **contesto** è il campo da guardare col
   sospetto giusto — è lì che un modello di visione inventa date e nomi. Correggerlo, e
   verificare che il testo corretto sia quello che finisce nelle domande (non l'ipotesi).
3. **Un `.heic` dall'iPhone e un `.tiff` da scanner**: `sips` converte, la lettura funziona.
4. **Tre angoli** → tre PDF nel vault e tre righe in ELABORA, ognuna col nome della fonte e
   l'angolo. Aprire un foglio: **l'immagine è in testa**, il contesto sotto, le domande
   dopo. Stamparlo, e controllare che la **descrizione compaia solo sul foglio delle
   tracce** — sulla copia degli allievi sarebbe la risposta a metà delle domande.
5. **Il giro dell'editor**: aprire quel foglio in ELABORA → «Modifica» → salvare → **la
   foto deve esserci ancora**. È il punto in cui un'immagine che viaggiasse solo nella resa
   sparirebbe in silenzio.
6. **Dalla stessa scheda, le flashcard**: la voce «Dalla stessa immagine» deve comparire, e
   non deve rileggere la foto né richiedere di correggere di nuovo il contesto.
7. **Una foto senza testo** (un paesaggio) e una **pagina di manuale**: nel secondo caso la
   descrizione deve contenere il testo trascritto, non parlare della pagina.
8. **Il peso dell'archivio** dopo sette fogli con la stessa foto (Cabina › Gestione
   cartelle): è `localStorage`, e sette copie della stessa immagine ci vivono dentro.
9. **Cabina › Impostazioni AI**: la riga «Leggere le immagini» dice se il motore risponde,
   e cambiare il modello nel campo si ricorda.
10. `mappai_visione='0'` → il passo «Da che cosa» non compare e «Crea un documento» è
    esattamente quello di prima.

### ⏳ DA PROVARE IN ELECTRON — la PENSIONE delle sette modalità (20/8, fase F)
Questa lista viene prima delle altre: qui non si è aggiunto, si è **tolto**, e ciò che si
rompe togliendo non lo dice nessun test.
1. **La mappa non si smonta più, e quindi non si perde**: apri una mappa, apri Studio
   attivo, chiudi, cambia progetto, torna. La gerarchia deve essere intatta — prima c'era
   una macchina di sicurezza apposta, e ora non serve più perché non c'è più il guasto.
2. **Il launcher**: Studio attivo mostra **Domande a scelta · Quiz a scelta · Palazzo** +
   le due viste + i due strumenti. Nessuna card numerata, nessun Cloze.
3. **Le nove guardie tolte**: salvare mentre si guarda una mappa, uscire con ⌘Q, caricare
   un vault, accendere Heat map e Mappa lavoro. Nessuna di queste deve comportarsi in modo
   diverso da prima — erano tutte condizionate a una sessione che non esiste più.
4. **Il player Live** senza il genere «cloze»: una sessione con V/F, scelta multipla e
   domande aperte si gioca e si consegna come prima.
5. **Progressi e Heat map** devono ancora mostrare le sessioni VECCHIE delle modalità
   pensionate: i record non sono stati migrati apposta.

### ⏳ DA PROVARE IN ELECTRON — le attività «a scelta», ora con un ingresso (20/8)
Fasi D ed E spedite: la Live e il guscio in-app. Tutto misurato nei test puri, in tre
banchi e in una revisione avversaria; **niente nell'app vera**. In ordine di quanto
morde:
1. **Una sessione Live vera, da un telefono**: hub Live → «Domande a scelta» → il modale
   dice quante domande e da quanti fogli → QR → il telefono deve aprire **`scelta.html`**
   (non `student.html`), fare login emoji+numero, e ricevere **una domanda per argomento
   e per taglio**, non tutte.
2. **Il rientro a metà percorso**: chiudere il browser del telefono e riscansionare il QR
   → devono tornare le SUE domande (non altre) e il punto dov'era.
3. **La consegna e il reveal**: alla consegna compaiono i tagli; con «perché no?» acceso,
   scrivere la nota **non deve** togliere la spunta dalla dashboard del docente.
4. **Il report**: «Chiudi sessione» → il bottone porta a `report-scelta.html`, con il
   calore dei tagli, quello delle aree, le risposte col loro angolo e il «perché no?».
5. **Il guscio in-app**: Studio attivo → «Domande a scelta» e «Quiz a scelta». Senza
   materiali le due card devono essere **spente col motivo**; con materiali veri, il
   percorso a tre passi dentro il modale, la bozza che sopravvive a una chiusura, e la
   consegna che scrive in `Studio Attivo/sessioni.jsonl`.
6. **Il kill-switch** `mappai_domande_scelta='0'`: via la card dal hub Live e le due dal
   launcher, senza lasciare buchi.
7. Lo **switch EN** sulle schermate nuove.

### ⏳ DA PROVARE IN ELECTRON — la fase A delle attività «a scelta» (19/8 sera)
Tutto misurato nel banco e nei test puri, **niente nell'app vera** — e per buona parte non
si può ancora: la superficie non ha un ingresso finché non arrivano le fasi D ed E.
Quello che si può provare **subito**, ed è della fase A:
1. **Una generazione VERA con «Più set per angolo» acceso**: nel vault devono comparire
   `Domande-aperte-<Mappa>-definizione.pdf` … `-applicazione.pdf` (sette) e, se spuntata la
   seconda voce, sette set MC col loro angolo nel titolo.
2. **I default nuovi al primo avvio** (aperte on · 5 per ramo · V/F off · voce off · allega
   PDF on · tutte le caselle del box on), che devono vincere UNA volta anche sul «Default»
   già presente dal 11/8.
3. **La memoria dei box nascosti**: togliere due angoli, chiudere l'app, riaprirla → quei
   due sono ancora spenti.
4. **«Parole chiave con AI»** su un foglio dei nodi con le card già riempite dal ripiego: la
   conferma, poi le parole nuove.
Quello che arriva con la fase D: la pagina dal telefono, il rientro a metà percorso, il
report col calore delle aree.


### ⏳ DA PROVARE IN ELECTRON — «Più set per angolo» (19/8)
Misurato nell'harness (`public/dev/costruisci-harness.html`, moduli veri + `_readConfig`
vero) e nei test puri; mai in una generazione reale.
1. **Vista estesa**: il box compare sotto i quattro delle opzioni, largo quanto il bento
   (misurato 1240px), e NON compare nella vista compatta.
2. **La stima**: con tutte le caselle accese il numero di chiamate sale di sette volte
   per ogni genere spuntato — è il dato su cui si decide se vale la spesa. ⚠️ È il
   DEFAULT: chi non apre la vista estesa genera 14 materiali invece di 2.
2-bis. **I default nuovi arrivano davvero** sul computer di Giacomo, dove un preset
   «Default» esiste già dall'11/8: al primo avvio devono comparire domande aperte
   accese, 5 per ramo, vero/falso spento, voce spenta, allega PDF acceso.
2-ter. **La memoria**: togliere due angoli, chiudere l'app, riaprirla → quei due sono
   ancora spenti.
3. **Una generazione VERA con l'AI**: nel vault devono comparire
   `Domande-aperte-<Mappa>-definizione.pdf` … `-applicazione.pdf` (sette) e, se spuntata
   la seconda voce, sette set MC nella sidebar col loro angolo nel titolo.
4. **Un angolo che fallisce** (si può provocare staccando la rete a metà): gli altri
   arrivano lo stesso e alla fine compare l'avviso con quante varianti sono saltate.
5. **Preset**: salvato con la madre accesa e riapplicato, rimette le tre spunte.
6. **La strada vecchia**: con `mappai_stile_manifesto='0'` il modale «Genera materiali»
   non ha il box e genera un foglio solo, come prima.


### ⏳ DA PROVARE IN ELECTRON — il carattere (18/8 sera)
Tutto quello che segue è stato misurato nel **pannello browser** (server statico,
licensing tolto lato-DOM) e nei test puri, mai nell'app vera. Le prime tre righe sono
quelle che possono nascondere una sorpresa: là fuori il protocollo è `file://`, non
`http://`.

1. **I caratteri arrivano su `file://`.** È il punto: le `@font-face` puntano ai file con
   un URL ricavato da dove sta `mappai-font.js`. Se qualcosa non torna, il sintomo NON è
   un errore — è l'app che si apre in un monospace di sistema. Prova rapida: Cabina ›
   Aspetto e leggibilità, scegliere Atkinson, e vedere se la Cabina stessa cambia.
2. **Senza rete.** Staccare il Wi-Fi e riaprire l'app: il carattere deve esserci lo
   stesso (prima di oggi non era vero nemmeno per Space Mono).
3. **Il PDF della mappa.** Esportare con un carattere diverso da Space Mono e controllare
   con `pdffonts` che il font incorporato sia quello scelto e non Helvetica — il ripiego
   qui è silenzioso ed è già costato un mese una volta.
4. **Un foglio di quiz e un foglio dei nodi stampati davvero**, nei quattro caratteri:
   guardare se il testo esce dalle carte. È la parte tarata sulle metriche misurate, e la
   carta è l'unico giudice.
5. **In ELABORA**: aprire un documento, scegliergli un carattere, salvare, chiudere e
   riaprire — deve ritrovarlo; «Crea PDF» e «Stampa» devono uscire in quel carattere
   mentre il resto dell'app resta nel suo.
6. **Un documento condiviso via QR aperto dal telefono**: ora il carattere viaggia col
   documento, quindi deve arrivare anche là.
7. **Lo switch EN** sulla vista nuova della Cabina, e il kill-switch
   `mappai_font_selettore='0'` → tutto come prima.
8. **L'anteprima nella tela**: aprire una sintesi vecchia dopo aver cambiato carattere —
   deve mostrarlo, con la riga «mostrato in …» accanto al nome. Poi Modifica → Salva, e la
   riga deve sparire (il file si è allineato).
9. **«Sezioni»** su una sintesi vera: spegnere le Note, Crea PDF, e controllare che nel
   foglio non restino i richiami. Riaccendere: devono tornare.
10. **L'export dei grafi** (Esporta PDF dalla mappa e dalla Vista studio) nei quattro
   caratteri: `pdffonts` non deve più dire «Embedded font file may be invalid», e il
   testo deve leggersi.
11. **I simboli, sui fogli veri** (§4 debito 0 li ha cuciti, ma provati solo su una pagina
   di prova): un **dossier** con l'albero — i filetti `├ ─ └` devono toccarsi, non
   tratteggiare — e un quiz o un foglio dei nodi con dentro `Ω`, `H₂O`, `✓`, in tutti e
   quattro i caratteri. E il selettore della Cabina, che ora dice «TM Sans» e «TM Alt».


> **Aggiornato il 17 agosto 2026, sera.** Tutto il lavoro del 17/8 è stato provato
> nell'app vera via CDP mentre lo si scriveva — il registro di quel giorno è in coda a
> questa sezione. La coda «da provare» aperta il 15/8 è chiusa:
> Giacomo l'ha percorsa tutta e funziona. Quello che segue è il registro di ciò che è
> stato visto girare — serve a non riprovarlo, e a sapere che cosa dare per acquisito
> quando qualcosa si romperà più avanti.
> ⚠️ Resta una cosa che nessuna prova via CDP può dare: **l'aspetto**. Il DOM si legge,
> i pixel no. Le tre superfici cambiate oggi vanno guardate a occhio (in fondo a questa
> sezione).

Il pannello browser non ha IPC, non ha disco e serve i file dalla cache: tutto quello
che c'è qui sotto si poteva vedere **solo** nell'app vera, ed è stato visto lì.

**Provato il 16/8 (Giacomo, app vera)** — era la coda aperta il 15/8 sera:
- il **giro di lavoro normale**: apri una mappa dagli elenchi, sposta i nodi, tocca la
  Vista studio, esci con HOME, riapri → posizioni e vista sono quelle lasciate; stesso
  esito uscendo con ⌘Q; negli elenchi **una riga sola** per quella mappa;
- Cabina › Sviluppo: i **quattro collegamenti** di insegnai.ch aprono il browser di
  sistema · **chiusura brutale** → al riavvio `chiusura-improvvisa` compare in
  Segnalazione · **Gestione cartelle**, «Cambia posizione» con lo spostamento vero dei
  file · la **segnalazione** dal principio (categoria → testo → «Prepara l'email», col
  client di posta che si apre con gli ultimi errori in coda) · una **generazione senza
  classe** → la mappa nasce in `Mappe/Generico/` e negli elenchi non compare il chip
  «Generico»;
- il **bottone stampa** delle righe di INSEGNA; le **colonne allineate** (ultima a
  134px, uguale in tutte le tabelle impilate); il **dossier** stampato con testata e
  piè anche a pagina 1; il **PDF della catena dei perché** scritto in
  `Materiale Studio/`; la **combo da tastiera** SHIFT+CTRL+L,K,J,H.

**Provato il 16/8 (io, via CDP sull'app viva)** — tutto il lavoro della giornata è stato
verificato lì mentre lo scrivevo, su «Il Clima» (4R › Geografia) e su un secondo vault:
la barra ridotta e zero superstiti dei pezzi tolti · il ciclo `Mappa → Albero → Fasci →
DAG` coi default di ogni motore · la taratura che ogni motore ricorda · «Ripristina
default» e «Ripristina il layout fissato» (nodo spostato a 9999 → tornato a 414/437) ·
HOME che salva le opzioni · il tronco riparato (6 radici → 1, e la controprova che
rimette il difetto) · TESTO che cicla e i tre posti che dicono la stessa cosa · «brevi»
che accorcia (17 → 14 caratteri) · le due scale del testo indipendenti · lo slider dei
livelli che governa tutte e tre le viste nei due versi · mappa nuova → Albero + Indice,
e un `initD3Visualization()` a mano che non tocca niente · i tre gruppi del modale delle
domande aperte coi nomi dei campi a schermo.
**E la prova con l'AI VERA** (16/8, due chiamate): due varianti delle domande aperte su una
macro-area, in 20s, **due nomi distinti e due PDF** — poi rimossi dal vault insieme alle
loro voci d'archivio, erano prove. È la prova che il lucchetto regge in sequenza e che
`_nomeGiaPreso` non rifiuta la seconda variante.

⚠️ **Che cosa quella verifica NON copre**: il CDP legge il DOM, non i pixel. Restano da
guardare a occhio l'**aspetto** della barra ridotta (quattro comandi e uno slider più
largo: l'equilibrio dei pesi), il pannello della vista Mappa con le sue sei leve, e il
modale «Genera con l'AI» — i quattro gruppi e le otto angolazioni su due colonne. Se
qualcosa stona è lì che si vede.

**Provato prima, e già acquisito:**
- **la generazione vera dall'inizio alla fine** (14/8 sera, «La Svizzera Politica»):
  Genera → modale → INSEGNA mentre lavora → spinner in topbar → avviso invece del salto
  → progetto marcato **NUOVO** → un clic e il bollino sparisce da entrambe le liste; con
  esso le due correzioni fatte dopo quella prova (il velo sulla sola area di lavoro di
  CREA, il menu «Cosa» col lucchetto su Crea ed Elabora) e HOME che non uccide più la
  generazione;
- il 15/8 sera, sull'app viva: adozione della cartella madre, `vista.json` (scrittura,
  cambio mappa, ritorno), HOME e ⌘Q, ripiego dal disco senza snapshot, potatura
  (42,6 → 17,4 MB), lettura di un vault in `Generico`, l'accento NFD contro la voce NFC,
  la vista Impostazioni AI ricomposta;
- il **PDF di una copia** che non sovrascrive l'originale (12/8), il rientro automatico
  in STUDIO col motore giusto (12/8), la veste manifesto in Electron (4/8), ELABORA su
  28 vault reali (9/8), e il **gesto «crea un documento» intero** (13/8 sera, via CDP:
  generazione con AI vera, PDF nel vault, PDF rotto a mano → la sorgente resta con
  l'avviso, nome doppio rifiutato, righe di ELABORA con copia+file), coi due toast nuovi
  (`cq_ok_no_pdf`, `cq_nome_preso`) e l'elenco INSEGNA senza le voci d'archivio cartacee.

✅ **Anche il cassetto ha retto** (misurato il 16/8, §4 punto 0-bis): 99 voci per 99
mappe, zero copie in eccesso, **36% di ~48 MB**. E dal 16/8 non c'è più bisogno di
ricordarsi di guardarlo: la saturazione **si scrive da sola nel registro degli errori**
quando supera il 60 / 80 / 90%, quindi arriva in coda a una segnalazione senza che il
tester sappia di doverla cercare. In app la riga di Cabina › Gestione cartelle dice ora
anche la percentuale. Se risale, il sospetto numero uno è un salvataggio che conia una
scheda nuova invece di adottare quella del vault; il secondo è `mappai_saved_documents`
(1,9 MB, la chiave più pesante), che **nessuna potatura tocca**.

⚠️ **Non è mai stato visto girare** il ramo **ALLIEVO** del modale «Per chi è questa
mappa?»: questa installazione non ha schede allievo, quindi non è una prova rimandata —
è codice che aspetta il primo dato vero (§4 punto 4a).

**Provato il 17/8 (via CDP, sui vault veri, mentre si scriveva)** — sono le prove che
rendono acquisito il lavoro della giornata:
- **il pathfinder non esiste più** nel runtime (`togglePathfinder`, `calculatePath`
  assenti; zero regole `.pathfinder-active`), e `changeFontScale` è rimasta;
- **«Crea un documento → Sintesi»** apre il generatore **sopra** la console (12300 contro
  12100, ed è l'elemento in cima), con i sei rami nella tendina;
- **il bottone «Voce»** compare sulla sintesi aperta dal vault; la guardia delle modifiche
  pendenti ferma tutto con **zero chiamate AI**; l'export HTML incorpora la voce **appena
  registrata** e non quella vecchia del file;
- **la copia parlante viene scritta** in «Materiale Studio» (`Sintesi-voce-…html`);
- **il preavviso** dice i numeri veri («78 blocchi · circa 79 chiamate · circa 12 minuti»)
  e rifiutando non parte nessuna chiamata; **l'annullamento** ferma la registrazione con un
  toast *info*; il conteggio dei blocchi **resta a schermo** (7 letture in 14s, zero
  messaggi generici);
- **la quota GIORNALIERA è stata vista dal vivo**: sulla chiave esaurita il toast dice il
  motivo invece di far contare mille secondi;
- **la ripresa attraverso un riavvio dell'app**: seminati 20 clip, chiusa e riaperta
  MappAI, la registrazione riparte da **21/78** senza una chiamata;
- **ESC su una sintesi** esce in un colpo dai due percorsi (dal vault: domanda di
  salvataggio → anteprima; senza anteprima: elenco), senza il passaggio grigio;
- **«Project E»** apriva 9 set, ora ne apre **3**, e il salvataggio riscrive col nome
  dall'`id` e col marchio;
- **gli export della mappa**: `MM-Il Clima-00.pdf`, `MM-Il Clima-00.svg`,
  `KG-Project E-00.svg`, col file che esce davvero in Download.

⚠️ Una cosa che le prove hanno mostrato e che resta APERTA: il ramo **ALLIEVO** senza dati.
(Il **PDF vettoriale**, l'altra, è stato corretto il 18/8 — §4, 7-bis.)

**18/8 — il PDF della mappa è vettoriale davvero.** Provato via CDP su «Il Clima» (1A ›
Geografia, 50 nodi): export dal tab Vista studio → PDF **40 KB, 0 immagini,
`/BaseFont /Space#20Mono` + `/FontFile2` ×2**; riprodotta anche la CAUSA in pagina
(`insertRule` che rifiuta `…button:is(.bg-white`). Il file raster di prima: 178 KB, 1
immagine, solo Helvetica.
📌 Nota di metodo pagata tre volte in un giorno: **una misura sbagliata accusa il codice**.
`window.electronAPI` è congelato e non si può spiare; `MappAIStudyDocs.list()` toglie
apposta i campi pesanti; l'accento esiste in due forme e un confronto ingenuo dà falsi.
Prima di dichiarare un difetto, leggere che cosa la funzione di lettura *promette*.

---

## 6. Le trappole

Il catalogo vive nella **[GUIDA-ARCHITETTO.md](../GUIDA-ARCHITETTO.md) §8** — sono lezioni
permanenti, non stato, e tenerne una copia qui era esattamente il guasto «due verità che
divergono». Qui resta solo la regola d'oro: **quando nemmeno uno stile inline `!important`
cambia la misura, non è la cascata — è la misura.**

## 7. Come lavora Giacomo

- Vuole **vedere e misurare**. Ogni proposta va guardata alle larghezze vere; un numero
  letto dal DOM vale più di un'impressione.
- Corregge in modo puntuale e ha ragione spesso: i difetti peggiori li ha trovati provando
  in Electron cose che dal banco erano invisibili (il bottone MAPPA che non apriva la mappa,
  la conferma nascosta sotto la scheda, il PDF della copia che sovrascriveva l'originale).
- Regole sue, da non ridiscutere: niente articoli nei nomi dei bottoni · tutto a sinistra
  nelle tabelle · **niente emoji nei bottoni, solo Lucide** · emoji di sistema in
  **Noto/Android**, anche nei PDF · date in **GG/MM/AAAA** · ogni eliminazione si conferma
  **digitando il nome esatto**.
- **Contrasto ≥ 4,5:1, misurato.** Bianco su verde `#41e6aa` fa **1,6:1**: sul verde il
  testo è **scuro**. Lo scuro di CREA è `#404040` (un token, `--man-nero`); il neutro dei
  bottoni a riposo è `#f1f4f8` (un token, `--man-card`). L'unica eccezione è il blu
  `#3f6bf2`, dove il segno resta bianco.
- Le pagine in `public/dev/` sono strumenti **suoi**: si rigenerano coi loro script, non si
  riscrivono a mano.
  ```bash
  node tools/atlante-ui/cattura.js   # solo quando cambiano le console
  node tools/atlante-ui/build.js     # sempre
  node tools/officina/build.js       # l'officina dei modali e del bento
  ```
- Gergo concordato per parlare di interfaccia: **`superficie › pezzo`**, coi nomi
  dell'Atlante UI.

---

## 8. Dove sta il resto

| | |
|---|---|
| il **diario** giorno per giorno, coi motivi e le misure | `CLAUDE.md` §11 |
| **assistere un beta tester da remoto** (comandi per la console, per sintomo) | [`ASSISTENZA-REMOTA.md`](ASSISTENZA-REMOTA.md) |
| il diario di «creare un materiale a mano» (**chiuso il 13/8 sera**) | [`HANDOFF-crea-materiali.md`](HANDOFF-crea-materiali.md) |
| il diario del filone **console-bento / ELABORA** (6-12 agosto) | [`HANDOFF-console-bento.md`](HANDOFF-console-bento.md) |
| il diario del filone **manifesto** (3-6 agosto) | [`HANDOFF-manifesto.md`](HANDOFF-manifesto.md) |
| il diario del filone **console e motore dei modali** (fino al 3 agosto) | [`HANDOFF-console.md`](HANDOFF-console.md) |
| il **vocabolario** dell'interfaccia e il cantiere | `public/dev/atlante-ui.html` |
| la **ricognizione dei vault** sul disco vero (sola lettura) | `tools/diagnosi/vault-estranei.js` |
| l'app **misuratore**, che è un altro REPO (sorella) | `~/Claude/MappAI - misuratore/HANDOFF.md` |

⚠️ I tre diari sono in ordine cronologico **inverso** e contengono sezioni che dicono
«UNCOMMITTED»: lo dicevano nel momento in cui sono state scritte. **Non sono lo stato del
repo.** Lo stato del repo è §1 di questo file.

### I rami, dopo la potatura del 16/8/2026

Sul remoto restano **quattro** rami: `main`, `backup/main-pre-mappai-re` (il backup di
prima di «MappAI re», da non toccare) e i due iPadOS `MappAI_iPad` /
`MappAI_iPad_studente`, che sono in **standby dichiarato**, non morti.

Gli altri undici — `dev`, `global`, `feat/structural-suggestions` e la sua variante
`-GEMINI-lavora-bene`, `experiment/atomic-suggestions`, `atomic-suggestions-sigma`,
`feat/kg-hub-extraction`, `feat/infomaniak-jsonl-sse`, i due `claude/*` e
`010-file-organization` — sono stati cancellati. **Erano tutti fermi fra il 28 maggio e
il 15 giugno e indietro di 277 commit da `main`**: non rebasabili in pratica, e il
lavoro vivo che contenevano (merge/relink dei nodi, KG hub) è dentro `main` da giugno.

**Nessun commit è andato perso.** Prima di cancellare, ogni ramo ha ricevuto un tag
annotato `archivio/<nome del ramo>` sullo stesso commit, spinto su GitHub. Per rivedere
uno di quei rami:

```bash
git fetch origin --tags && git log --oneline archivio/dev
```

e per farlo tornare un ramo vero:

```bash
git switch -c dev archivio/dev
```

Il tag porta nel messaggio la data dell'ultimo commit del ramo. **Non cancellare i tag
`archivio/*`**: sono l'unica cosa che tiene raggiungibili quei commit — senza, la
raccolta rifiuti di GitHub se li porta via.
