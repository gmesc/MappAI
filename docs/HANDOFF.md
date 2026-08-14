# HANDOFF — MappAI, stato di `main`

> **Questo è l'unico documento di stato.** Dice che cosa c'è in `main` OGGI, che cosa è
> acceso, che cosa manca e come si verifica. Scritto il **12 agosto 2026** unificando i
> tre handoff precedenti, che da qui in poi sono **diari**: si leggono per il *perché* di
> una decisione, mai per sapere com'è fatto il codice adesso.
>
> Progetto: Giacomo Meschini — giacomo@insegnai.ch

---

## 0. Le prime tre cose da sapere

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

---

## 1. Come si verifica che tutto sia a posto

```bash
cd "/Users/giacomomeschini/Claude/MappAI re"
git log --oneline -5                              # b1a9636 o più recente in testa
git status --short -- public tests tools main.js  # atteso: VUOTO
node --test tests/                                # atteso: 0 fail
node tools/smoke/cornice-documenti.js             # atteso: TUTTO OK
node tools/smoke/elenchi-elabora-insegna.js       # atteso: TUTTO OK
node tools/smoke/studio-sidebar.js                # atteso: TUTTO OK
node tools/smoke/pipeline-lucchetto.js            # atteso: TUTTO OK
```

I banchi in `tools/smoke/` non sono test della suite e non lo diventano: caricano i
moduli VERI con un finto `window`, un finto `appState` e finti IPC. `tools/smoke/LEGGIMI.md`
dice, per ciascuno, **che cosa NON può provare** — leggerlo prima di fidarsi di un «ok».

Il working tree a fine sessione è VUOTO. Il **misuratore** è un repo a sé dal 12/8:
`~/Claude/MappAI - misuratore`, col suo git e il suo handoff — i piani non si mescolano.

---

## 2. Che cosa è acceso, e con quale interruttore

Tutto il lavoro dell'ultimo mese è dietro un kill-switch in `localStorage`. Questa
tabella è la mappa per tornare indietro di un passo alla volta quando qualcosa si rompe.

| chiave | stato | che cosa spegne |
|---|---|---|
| `mappai_console_bento_app` | **`'1'` nel userData di Giacomo** | il cablaggio bento delle console. ⚠️ Col bento acceso **il rail delle tre forme non si monta**: la sezione la dicono le briciole in alto, che sono anche l'unica uscita |
| `mappai_stile_manifesto` | acceso | la veste «manifesto»: landing, CREA, bento. `'0'` → la landing torna esattamente com'era e il modale «Genera materiali» si riapre |
| `mappai_bento_layout` | assente = composizione del file | la composizione scritta dall'Officina §7. Assente, comanda `mappai-bento-composizione.js` |
| `mappai_teach_console` | acceso | la console INSEGNA. `'0'` → le tre sezioni storiche della landing |
| `mappai_studio_view` | acceso | il passo **STUDIO** nel ciclo LAYOUT. `'0'` → il ciclo storico, e nessun rientro automatico |
| `mappai_studio_profile` | scritto dall'uso | il profilo della Vista studio a livello UTENTE (non di progetto) |
| `mappai_studio_attivo` | scritto dall'uso | «ero dentro STUDIO quando ho chiuso»: fa rientrare l'app in STUDIO all'apertura di una mappa |
| `mappai_vista_ridotta` | scritto dalla combo | la vista ridotta di CREA (SHIFT+CTRL+L,K,J,H) |
| `mappai_teach_row_select` | acceso | in INSEGNA il clic sulla riga SELEZIONA la mappa. `'0'` → la apre (storico) |
| `mappai_legacy_float_btns` | spento | `'1'` rimette i 7 bottoni flottanti del bordo destro |
| `mappai_archivio_insegna` | spento | `'1'` rimostra in INSEGNA le voci d'archivio dei fogli cartacei (`quizpaper`/`flashsheet` senza PDF proprio), nascoste dal 13/8: la loro sorgente vive in ELABORA |

---

## 3. Le superfici, oggi

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
`window.openCabina(voce)` in `mappai-cabina.js`: nove viste in quattro gruppi (Profilo
insegnante · Allievi · Classi · Impostazioni AI · Consumi AI · Consigli di studio ·
Tutorial · Termini · Privacy). **Nessun ponte**: dal 13/8 anche «Impostazioni AI» vive
qui — provider, chiave, Product ID, modello e listino.
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

### VISTA STUDIO — il passo «STUDIO» del ciclo LAYOUT
Overlay a card sopra il canvas; il force layout resta intatto sotto e si ritrova uscendo.
Sette motori deterministici in `mappai-studio-layouts.js`, renderer condiviso in
`mappai-studio-draw.js`, pannello in `mappai-studio-view.js`.
- **Default (12/8)**: Albero · dall'alto · solo gerarchia · niente linking words · niente
  gerarchia visiva · evidenzia «vicini» · frecce separate · bande off · curva · ponticelli
  off. È la mappa più semplice che la vista sa produrre: da lì si aggiunge.
- **Un pannello solo**, uguale dentro e fuori dal focus: `profiloDi(k)` manda la geometria
  al profilo del focus e la resa a quello della vista.
- Le opzioni oblique (anelli · colonne · percorso · matrice · instradamento · ponticelli)
  stanno nel pieghevole **«Altre opzioni»**, dopo Esporta PDF.
- ⚠️ `exit()` viene chiamato in **due situazioni diverse**: col bottone LAYOUT è
  **volontaria** (`exit(true)`, spegne il ricordo), al cambio mappa è **di servizio** (lo
  lascia). Confonderle rende il ricordo inutile — si perderebbe a ogni cambio di mappa.

---

## 4. I debiti aperti, in ordine di quanto mordono

Verificati sul codice il 13/8: ognuno esiste ancora.

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
3. **Sedici superfici senza destinazione.** La console «Mappa» (D1) è stata **ritirata il
   13/8**: il menu radiale resta quello che è e gira. Le superfici che le erano state
   assegnate — hub Materiali, Studio attivo, dossier, configurazione di studio, gestore
   dei layout… — hanno perso la meta e nel cantiere dicono «—». Sono **decisioni che
   mancano**, non lavoro in coda.
4. **Il bottone «HTML» dell'editor è a quattro passi** (sintesi con voce naturale).
5. **Codice morto della sintesi**: `_voceNaturale()` (mappai-doc-editor.js) cerca ancora
   l'**MP3 fratello** al passo 4, `buildPrintHtml` accetta ancora `opts.audioSrc`
   (mappai-branch-synthesis.js), e due commenti dicono il contrario di ciò che il codice
   fa. Sono i resti del modello a un file solo, superato dai due file
   (`Sintesi-<Mappa>.html` editabile · `Sintesi-voce-<Mappa>.html` da consegnare).
6. **I quattro cloni della barra dei documenti** (`branch-synthesis`, `causal-chains`,
   `timeline`, `glossary`, `live-reports`) → `mappai-doc-bar.js`. In
   `mappai-branch-synthesis.js` c'è ancora un `🖶` in un bottone, contro la regola «solo
   Lucide». ⚠️ I token `--mm-doc-*` vivono **in quel file, non nel foglio dei token**: la
   barra sta per metà in finestre `window.open`, che il CSS dell'app non lo caricano — ed è
   anche il motivo per cui `doc-bar` disegna le icone come SVG in linea (là
   `lucide.createIcons()` non esiste).
7. **Codice senza ingresso**: `StorageManager.renderRecentProjects` e `MappAITeach.editGrade`
   dopo l'eliminazione di «Progetti salvati». Degradano in silenzio, non lanciano.
8. **713 `!important` in `style.css`** — il 59% delle dichiarazioni. È il motivo per cui la
   cascata non è prevedibile a tavolino (GUIDA-ARCHITETTO §8, trappola 6).
9. **`mappai-landing-teach.js` è a 3.544 righe** e fa quattro mestieri (landing · console
   INSEGNA · tabelle condivise · archivio). Le tabelle, che ormai servono due console, sono
   il pezzo che uscirebbe per primo — come hanno fatto la cornice e il clone.
10. **Guardia mancante in `filesOrganized()`** (main.js): controlla che `filesRoot` sia una
    stringa, mai che la cartella esista → un percorso morto svuota l'app **senza dire nulla**.
11. **Testo definitivo di «Termini & Condizioni» e «Privacy»**: quello che c'è dice il vero
    ed è verificato sul codice, ma è una sintesi informativa, non un documento legale.

La versione VIVA dell'elenco delle superfici da migrare è il **cantiere dell'Atlante**
(`public/dev/atlante-ui.html`, sezione «CANTIERE»): ogni superficie con la sua destinazione
e il costo letto dal codice. Si rigenera con `node tools/atlante-ui/build.js`.

---

## 5. Da provare in Electron, in ordine

Il pannello browser non ha IPC, non ha disco e serve i file dalla cache: quello che segue
si può vedere **solo** nell'app vera.

1. Il **bottone stampa** delle righe di INSEGNA: se si apre il dialogo di sistema o se
   scatta il ripiego (il file si apre nell'applicazione di sistema).
2. Le **colonne allineate** fra gli elenchi impilati di INSEGNA: l'ultima colonna deve
   essere **134px** e uguale in tutte le tabelle (nel banco esce 58 perché la cache dei
   file è vuota).
3. Il **dossier** stampato: è il documento cambiato di più (testata ora stampata, piè
   presente anche a pagina 1).
4. Il **PDF della catena dei perché** scritto davvero in `Materiale Studio/`.
5. La **combo da tastiera** SHIFT+CTRL+L,K,J,H (provata l'API, mai la sequenza di tasti).

Fatti e verificati: il **PDF di una copia** che non sovrascrive più l'originale (12/8), il
rientro automatico in STUDIO col motore giusto (12/8), la veste manifesto in Electron
(4/8), ELABORA su 28 vault reali (9/8), e il **gesto «crea un documento» intero** (13/8
sera, via CDP sull'app viva: generazione con AI vera, PDF nel vault, PDF rotto a mano →
la sorgente resta con l'avviso, nome doppio rifiutato, righe di ELABORA con copia+file).
Restano da guardare A OCCHIO (il CDP non vede i pixel): i due toast nuovi
(`cq_ok_no_pdf`, `cq_nome_preso`) e l'elenco INSEGNA senza le voci d'archivio cartacee.

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
| il diario di «creare un materiale a mano» (**chiuso il 13/8 sera**) | [`HANDOFF-crea-materiali.md`](HANDOFF-crea-materiali.md) |
| il diario del filone **console-bento / ELABORA** (6-12 agosto) | [`HANDOFF-console-bento.md`](HANDOFF-console-bento.md) |
| il diario del filone **manifesto** (3-6 agosto) | [`HANDOFF-manifesto.md`](HANDOFF-manifesto.md) |
| il diario del filone **console e motore dei modali** (fino al 3 agosto) | [`HANDOFF-console.md`](HANDOFF-console.md) |
| il **vocabolario** dell'interfaccia e il cantiere | `public/dev/atlante-ui.html` |
| l'app **misuratore**, che è un altro REPO (sorella) | `~/Claude/MappAI - misuratore/HANDOFF.md` |

⚠️ I tre diari sono in ordine cronologico **inverso** e contengono sezioni che dicono
«UNCOMMITTED»: lo dicevano nel momento in cui sono state scritte. **Non sono lo stato del
repo.** Lo stato del repo è §1 di questo file.
