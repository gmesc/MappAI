# Piano — Guida illustrata di MappAI per i docenti che la testano

> Scritto il 22 agosto 2026 da `/architetto`, approvato da Giacomo lo stesso giorno.
> **Stato: CONSEGNATO il 23 agosto 2026.** Il piano resta come storia del lavoro; quello che
> serve per riprendere sta nel blocco qui sotto.

> ## ⟵ DA QUI SI RIPRENDE (23 agosto 2026, notte)
>
> **La guida è finita e si legge**: `~/Claude/MappAI - guida docenti/index.html` — doppio clic.
> Tredici capitoli per percorso del docente più l'appendice QR, 95 fotografie vere dell'app,
> indice navigabile, immagini che si ingrandiscono al clic. Cartella autonoma di 52 MB, fuori
> da git: si copia o si manda così com'è.
>
> **Come si rifà**, quando l'app cambia: [`tools/guida-docenti/LEGGIMI.md`](../tools/guida-docenti/LEGGIMI.md)
> — i tre comandi (app di prova su :9333 con i flag anti-sospensione, `campagna.js --da-zero`,
> `verifica.js`), che cosa gli strumenti NON provano, le nove trappole pagate.
>
> ### Che cosa resta a Giacomo
> 1. **Leggerla.** In particolare il capitolo 1 (la filosofia: meta-materiali, didattica non
>    stravolta, «domani meglio»), il 2 (che cosa esce verso l'AI, i costi) e il 12 («Che cosa
>    NON esiste ancora»). Sono i due che i docenti leggeranno per primi e per ultimi.
> 2. **Dire se la classe di prova va bene**: una 4R finta con venti allievi-animale, nessun
>    nome, nota di taratura neutra; e i due vault che hai scelto, copiati nel laboratorio.
> 3. **Il PDF**: rinviato per tua scelta (bivio A). Se lo vuoi, servono un foglio di stampa e
>    le figure ridimensionate — mezza giornata.
> 4. **La chiave Gemini nell'istanza di prova** (Cabina › Impostazioni AI, una volta): sblocca
>    le uniche scene che oggi la guida racconta a parole invece di mostrarle — la generazione
>    di una mappa da un PDF, «Genera materiali», il dossier da una foto, la voce naturale.
>    I passi da aggiungere a `passi.js` sono al punto 6 qui sotto.
>
> ### I difetti VERI dell'app trovati leggendo e fotografando
> Non corretti qui per scelta del piano (la guida non tocca l'app); ognuno è una riga di lavoro
> a sé. In ordine di quanto morde per un docente-tester:
> - **a.** lo schermo di sblocco dice «Invia il seguente ID Macchina a **[EMAIL_ADDRESS]**»: il
>   segnaposto è a schermo (`it_translations.js:207`). È la primissima cosa che un tester legge.
> - **b.** il tutor di un nodo scrive nel prompt «L'utente è \<nickname\>, ha \<età\> anni…»
>   (`mappai-ai-tutor.js:524-529`), mentre il testo «Privacy» della Cabina promette «Il NOME
>   dell'allievo non entra mai» (`mappai-cabina.js:487`). O si corregge il codice, o si corregge
>   la promessa: oggi si contraddicono.
> - **c.** in INSEGNA la tabella «Attività già svolte» non si popola mai: `landing-teach.js:3034`
>   legge `r.sessions || r.records`, `main.js:3437` restituisce `rows` (e le celle leggono
>   `cls`/`joined` invece di `className`/`participants`).
> - **d.** l'onboarding delle lingue è codice morto: `storage-lang.js:864` scrive
>   `mappai_language` **prima** del controllo `:869` che lo vuole nullo. Non compare mai.
> - **e.** il bottone «Dev self-test» (lo stetoscopio in basso a sinistra) si monta anche
>   nell'app dei docenti (`mappai-dev-selftest.js:141`).
> - **f.** nei Consumi la voce naturale è prezzata come testo: `matchModelKB` fa prefix-match e
>   `gemini-2.5-flash-preview-tts` cade su `gemini-2.5-flash` (`mappai-ui-modals.js:1005`).
> - **g.** «Include piano Gratuito (15 req/min)» è una costante scritta a mano del 2024
>   (`app.js:495`).
> - **h.** la nota sotto YouTube promette «MappAI estrarrà i contenuti audio/visivi del video»,
>   ma al modello arriva **solo l'URL** (`app.js:1338-1340`).
> - **i.** ESC non chiude «Proietta» quando arriva via CDP (il × sì): da provare a mano prima
>   di dichiararlo un difetto.
> - **j.** il preventivo delle chiamate (`#mp-estimate`) non è montato in nessun riquadro del
>   bento: si sceglie senza vedere quanto costa.
>
> ### Se si riprende il lavoro sulla guida
> 5. Chiusura già fatta: `docs/HANDOFF.md` §0 (punto 0-sexies), §5 (gli esiti in Electron) e §8
>    (il puntatore); tre commit su `main` (`fd0c6d0`, `aa2f390`, `7b91461`); memoria
>    `guida-docenti-ripresa`.
> 6. **Con la chiave**: aggiungere a `passi.js` un passo `05-crea-genera` (fonte già caricata →
>    «Genera Mappa» → velo con le fasi → toast finale) e un passo `09-dossier-crea`
>    (`aggiungiFile('doc', [FOTO])` → modale «Che cosa sai di questa fonte?» → «Analizza» →
>    la scheda a quattro blocchi → «Usa questa fonte» → «Genera materiali»); poi rifare le
>    figure del capitolo 9, che oggi mostrano un dossier già fatto.
> 7. Possibili seguiti dichiarati: il PDF stampabile; una versione inglese; il bottone «Come
>    usare MappAI» della Cabina che apre questa guida invece del modale storico.

**Braindump tradotto**: una **guida utente illustrata** (HTML con indice, lightbox, screenshot
VERI scattati sull'app viva via CDP) che copre le superfici di `main` oggi — landing/CREA con il
bento, la mappa e la Vista studio, le console ELABORA · INSEGNA · Cabina, i dossier di fonte —
organizzata **come il percorso di un docente di scuola media**, non come l'elenco dei bottoni.
Si apre con un capitolo di **filosofia**: MappAI non chiede ai docenti di stravolgere la propria
didattica — fornisce **meta-materiali** per differenziarla, renderla multicanale e più
inclusiva; e dice con onestà che cosa oggi non fa (o non fa bene) e farà meglio domani.
È il documento che i docenti-tester tengono aperto accanto all'app; la presentazione orale ne è
un taglio, ma la presentazione in sé **non** è in questo piano.

**Stato rilevante**:
- `docs/PRESENTAZIONE_MAPPAI_CLASSE.md` + `docs/presentazione/*.pdf` (11/7/26): **superata**
  (quattro hub, Cloze, sette modalità — pensionati). Si recuperano solo «Privacy» e «Cosa serve
  per iniziare». Non si aggiorna: la guida la sostituisce.
- **Fonti per il capitolo di filosofia**: le due conversazioni preparate per la fondazione
  (Gebert Rüf / Education Pioneers), in `~/Downloads/…fondazione…md`. I concetti da riusare:
  *moltiplicatore didattico* (da una scheda a un percorso graduato), i **meta-materiali**
  cartacei e digitali, «gli studenti ricevono il prodotto finito senza apprendere le operazioni
  cognitive che lo generano», accessibilità DSA come requisito e non come optional, l'AI come
  componente **sotto supervisione del docente** che non sostituisce la valutazione, la
  co-progettazione con insegnanti e il miglioramento iterativo («quello che oggi manca, domani
  migliora»).
- In-app: Cabina › Tutorial e il modale «Come usare MappAI» (`showAppGuide`,
  `mappai-ui-modals.js:283`) NON si toccano (possibile seguito).
- Infrastruttura riusabile: `tools/smoke/cdp.js`, memoria `electron-debug-remoto`, gli asset
  della skill (`lab.js` · `guida.js` · `stile-guida.css`) da riscrivere per MappAI.
- ⚠️ HANDOFF §5: dossier di fonte, attività «a scelta», scheda-editor **mai girati in
  Electron** — la campagna li fa girare davvero; gli esiti si scrivono e chiudono quei debiti.
- **Vault scelti da Giacomo** per gli screenshot dei materiali (si COPIANO, mai in-place):
  - `Mappe/4R/Storia/grind this heels` — 5 nodi, fonte fotografica (`Allegati/grind this
    heels.jpg`), Analisi-fonte + Domande aperte + Flashcard + Sintesi già in `Materiale Studio/`
    → perfetto per i capitoli dossier/Proietta;
  - `Mappe/4R/Scienze/Elettricità - MM` — 41 nodi, materiali ricchi (Domande aperte **per
    angolo**: applicazione · causa · confronto · conseguenza · definizione · eccezione ·
    esempio; Flashcard fronte/retro; Focus) → capitoli mappa/ELABORA/INSEGNA.
  - Se in sidebar compaiono titoli di altri progetti va bene (sono solo titoli — ok di Giacomo).

---

## Che cosa si fa

### Passo 0 — Istanza di prova isolata
1. `npx electron . --remote-debugging-port=9333 --user-data-dir=<lab>/userData`. Se Electron
   non onora il flag (si misura: i file devono nascere sotto `<lab>/userData`), **una riga** in
   `main.js` prima della guardia dev (L.162): `if (process.env.MAPPAI_USERDATA)
   app.setPath('userData', process.env.MAPPAI_USERDATA)`. Assente = oggi (inv. 1, 19).
   In dev mode il suffisso `dev/` si applica comunque → i dati vivono in `<lab>/userData/dev/`.
2. `<lab>/userData/dev/mappai-settings.json` = `{ "filesOrganized": true, "filesRoot":
   "<lab>/casa" }` → la cartella madre `MappAI - file` nasce nello scratch (`mappaiRootDir()`).
3. `<lab>` = `~/Claude/MappAI - guida docenti/lab/` (deve sopravvivere alle sessioni: c'è
   dentro la chiave che Giacomo incolla una volta sola).
4. Dati di prova: copia dei DUE vault scelti sotto `casa/MappAI - file/Mappe/4R/…`; la classe
   **4R** si crea dal modale classi con 5-6 allievi finti (il registro vive in localStorage).
5. `localStorage`: `mappai_beta_access_granted='true'`; kill-switch ai default di `main`.
6. **Chiave Gemini**: la incolla Giacomo nell'istanza di prova (una volta).
7. Finestra 1470×956 logici, `deviceScaleFactor: 2`.

### Passo 1 — La mappa dei fatti (Workflow, ~8 lettori + 1 critico)
Come da skill: etichette ESATTE, selettori, gesto → funzione, disco, limiti, «NON ESISTE»,
tutto con `file:riga`. Aree: (a) landing+CREA+bento+contesto; (b) mappa/barra/Vista studio/PDF;
(c) ELABORA; (d) INSEGNA+Proietta; (e) Cabina+a11y+segnalazione; (f) fonti fotografiche/dossier;
(g) vault e disco; (h) attività «a scelta» via QR (per l'appendice). Output:
`tools/guida-docenti/fatti/*.md`. Critico di completezza contro l'indice, lettori sui buchi.

### Passo 2 — La campagna di screenshot (ripetibile da zero)
- `tools/guida-docenti/lab.js` (riscritto per MappAI: porta 9333, `ws` del repo, IMG
  parametrica) + `campagna.js` con `passo(nome, fn)`; `--da-zero` azzera `casa/` +
  `localStorage.clear()` + reload. Gli esiti delle feature mai provate in Electron finiscono
  in `fatti/esiti-electron.md`.
- Generazione AI: **una** generazione vera (MindMap da PDF corto) + **un** set di materiali +
  **una** sessione **«Domande a scelta»** (versione con gli angoli differenti — l'unica
  attività QR che entra in guida) con la pagina studente nel Browser pane a 375×812.
- Foglio di provini (PIL) a fine campagna.

### Passo 3 — La pagina
- Cartella fuori dal repo: `~/Claude/MappAI - guida docenti/` → `index.html` + `img/` +
  `assets/`. Veste manifesto (Space Mono, token `--man-*`, palette teal/rosa/blu), emoji Noto,
  Lucide inline solo dove serve (inv. 15), contrasto ≥ 4,5:1 misurato (inv. 16).
- **Prosa con `/bella-prosa`**, adattata a insegnanti: NIENTE gergo tecnico (no «vault»,
  «console», «kill-switch» nel testo — si dice «la cartella della mappa», «la schermata…»);
  ogni etichetta fra «…» è quella vera a schermo; analogie concrete.
- **Indice** (bozza — il passo 1 la corregge):
  1. **Perché MappAI** — la filosofia: non uno strumento che entra nella didattica
     stravolgendola; **meta-materiali** per differenziare, rendere multicanale, includere.
     La mappa non è il prodotto: è l'occasione per allenare le operazioni mentali che la
     generano. L'AI lavora sotto gli occhi del docente, che resta l'autorità sui contenuti.
     E l'onestà del beta: che cosa oggi l'app non fa o non fa bene, e farà meglio domani e
     dopodomani (materiale dalle conversazioni per la fondazione).
  2. **Cosa serve per iniziare** — computer, chiave Gemini (dove si prende, costi), dove
     finiscono i file. **Privacy**: che cosa va all'AI e che cosa resta sul computer.
  3. **La prima apertura** — sblocco beta, lingua, «per chi è questa mappa?».
  4. **La classe** — creare la classe, gli allievi, le tessere in PDF.
  5. **CREA una mappa** — dal PDF alle opzioni: MindMap o grafo, «Genera fino a», gli output
     automatici, il preventivo, l'attesa (si può continuare a lavorare).
  6. **Leggere la mappa** — barra, livelli, disposizioni (Default → Albero → Fasci → DAG),
     Vista studio, la scheda del nodo, strumenti di leggibilità, PDF della mappa.
  7. **ELABORA i materiali** — quiz, flashcard, sintesi (+ voce e costi), fogli dei nodi,
     domande aperte per angolo; l'editor; «Crea PDF»; dove si salva tutto.
  8. **INSEGNA** — la console, i filtri, consegnare un materiale, **Proietta**.
  9. **Una fotografia come fonte** — il dossier (capitolo confermato da Giacomo).
  10. **Cabina** — carattere, leggibilità, consumi AI, cartelle, **Segnalazione** (i tester
      devono sapere come segnalare).
  11. **Le cartelle sul computer** — che cosa si trova nel Finder / in Obsidian.
  12. **Che cosa NON esiste (ancora)** — con la promessa onesta: domani meglio, dopodomani
      ancora meglio.
  13. **Appendice — La classe con il QR (sperimentale)**: le **«Domande aperte» con angoli
      differenti** dal telefono degli allievi. ⚠️ Dichiarato in testa: funzioni
      **sperimentali, NON abilitate all'uso in classe** a settembre 2026; si mostrano perché
      i tester sappiano dove va l'app.
- Su richiesta di Giacomo: la sezione QR sta IN FONDO (era il cap. 7 della prima bozza);
  Lavagna e Tutor NON entrano (solo un cenno nel cap. 12).

### Passo 4 — Verifica (Workflow, ~6-8 verificatori scettici)
Frasi ↔ `fatti/*.md` ↔ app viva; `<img>` integre, TOC, lightbox, rese a 1280/1920, contrasto.
Poi copia come Artifact se < 16 MB (il PDF si valuterà dopo — deciso da Giacomo).

### Passo 5 — Chiusura
HANDOFF §0 + esiti Electron in §5 + puntatore in §8; commit di `tools/guida-docenti/` + piano;
memoria col puntatore e il comando per rifare la campagna.

## Dove vive la logica nuova
| pezzo | dove | perché |
|---|---|---|
| eventuale override `userData` (1 riga, solo se serve) | `main.js` ~L.162 | percorsi in main (inv. 19); assente = oggi (inv. 1) |
| `lab.js` · `campagna.js` · `fatti/` | `tools/guida-docenti/` | strumento rigenerabile, come `tools/atlante-ui/` |
| guida (html, img, assets) + `lab/` (istanza di prova) | `~/Claude/MappAI - guida docenti/` | deliverable + dati di prova, fuori da git |
| nessun modulo dell'app viene toccato | — | i difetti trovati in campagna si dichiarano e si correggono in commit a sé |

## Prove
`node --test tests/` a 0 fail; `campagna.js --da-zero` finisce con 0 passi in errore + provini;
verificatori del passo 4.

## Verifica a mano (Giacomo)
1. Incollare la chiave Gemini nell'istanza di prova (Cabina › AI) quando gliela indico.
2. A guida finita: indice, 3-4 figure in lightbox, capitoli 1, 2 e 12 (i più letti).
3. Appendice col telefono in mano: il QR fotografato deve corrispondere al gesto vero.
4. Giudicare presentabilità di 4R finta e dei due vault copiati.

## Non-obiettivi
- La presentazione orale/diapositive; il PDF della guida (se ne ragiona dopo — Giacomo).
- Aggiornare la presentazione di luglio; toccare Cabina › Tutorial / `showAppGuide`.
- Lavagna e Tutor via QR come capitoli (solo cenno nel cap. 12).
- Versione inglese; correggere in questo lavoro i difetti scoperti in campagna.
- Windows: foto macOS, dichiarato nel cap. 2.

## Decisioni prese (e revocabili)
1. Guida per percorso del docente; capitolo-filosofia in apertura scritto con `/bella-prosa`,
   zero gergo.
2. Istanza isolata con i due vault COPIATI e classe 4R finta; mai i dati veri in scrittura.
3. Una sola generazione AI vera; il resto sui materiali già nei vault scelti.
4. Default di `main`, nessun flag nascosto.
5. Attività QR: SOLO «Domande aperte» con angoli, in appendice, marcata sperimentale/non
   abilitata (settembre 2026).
6. Cartella fuori repo per guida e lab; strumenti nel repo.
7. 1470×956 @2×, Noto, veste manifesto.
8. Artifact solo come copia se sta nei 16 MB; deliverable primario = cartella HTML.

## Bivi — RISOLTI da Giacomo (22/8)
- A: **solo HTML**; PDF se ne ragiona dopo.
- B: **solo «Domande aperte»** (versione con angoli differenti), in appendice sperimentale.
- C: dossier fotografici **dentro**.
