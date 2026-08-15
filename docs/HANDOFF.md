# HANDOFF — MappAI, stato di `main`

> **Questo è l'unico documento di stato.** Dice che cosa c'è in `main` OGGI, che cosa è
> acceso, che cosa manca e come si verifica. Scritto il **12 agosto 2026** unificando i
> tre handoff precedenti, che da qui in poi sono **diari**: si leggono per il *perché* di
> una decisione, mai per sapere com'è fatto il codice adesso.
> Ultimo allineamento: **15 agosto 2026** (gruppo «Sviluppo» in Cabina · registro locale
> degli errori · «Gestione cartelle» nel profilo · modale delle segnalazioni pensionato ·
> la cartella madre si adotta da sé).
>
> Progetto: Giacomo Meschini — giacomo@insegnai.ch

---

## 0. Le prime quattro cose da sapere

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

---

## 1. Come si verifica che tutto sia a posto

```bash
cd "/Users/giacomomeschini/Claude/MappAI re"
git log --oneline -5                              # a7ab432 o più recente in testa
git status --short -- public tests tools main.js  # atteso: VUOTO
node --test tests/                                # atteso: 0 fail
node tools/smoke/cornice-documenti.js             # atteso: TUTTO OK
node tools/smoke/elenchi-elabora-insegna.js       # atteso: TUTTO OK
node tools/smoke/studio-sidebar.js                # atteso: TUTTO OK
node tools/smoke/pipeline-lucchetto.js            # atteso: TUTTO OK
```
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
| `mappai_studio_profile` | scritto dall'uso | il profilo della Vista studio a livello UTENTE (non di progetto) |
| `mappai_studio_attivo` | scritto dall'uso | «ero dentro STUDIO quando ho chiuso»: fa rientrare l'app in STUDIO all'apertura di una mappa |
| `mappai_vista_ridotta` | scritto dalla combo | la vista ridotta di CREA (SHIFT+CTRL+L,K,J,H) |
| `mappai_teach_row_select` | acceso | in INSEGNA il clic sulla riga SELEZIONA la mappa. `'0'` → la apre (storico) |
| `mappai_legacy_float_btns` | spento | `'1'` rimette i 7 bottoni flottanti del bordo destro |
| `mappai_archivio_insegna` | spento | `'1'` rimostra in INSEGNA le voci d'archivio dei fogli cartacei (`quizpaper`/`flashsheet` senza PDF proprio), nascoste dal 13/8: la loro sorgente vive in ELABORA |
| `mappai_lavori_barra` | acceso | l'indicatore del lavoro in corso nella barra in alto (spinner + nome). `'0'` → nessun indicatore e nessun aggancio a `showLoadingOverlay` |
| `mappai_gen_ctx_sempre` | acceso | «per chi è questa mappa?» chiesto SEMPRE prima di generare. `'0'` → si chiede solo quando serve (storico: classe con 2+ materie e nessuna scelta) |
| `mappai_progetti_nuovi` | scritto dall'uso | i progetti marcati **NUOVO** negli elenchi (non è un interruttore: è la lista, e si svuota da sé al primo clic su ogni riga) |
| `mappai_error_log` | acceso | il **registro locale degli errori** (15/8). `'0'` → non si registra più niente, né su disco né in memoria; la vista «Segnalazione» resta e mostra il registro vuoto |
| `mappai_errori_recenti` | scritto dall'uso | la copia in `localStorage` degli ultimi 50 errori: serve dove non c'è il disco (browser) e a mostrarli subito. La fonte resta il file |

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

**Pezzi aggiunti il 15/8** (piccoli, e ognuno nato da un bisogno preciso):
- `voce.sotto` **si disegna anche nella navigazione** — era normalizzato dal core e
  nessuno lo emetteva, come il badge prima di lui;
- `voce.classe` = deroga di veste su una voce di colonna. Serve al clone del bottone
  ambra; senza, la voce resta standard. Regge la doppia normalizzazione (c'è il test);
- `sezione.figura` = `{src, alt, tonda}`, immagine a `float` con il testo che le scorre
  accanto (la `tela` non andava: sta SOTTO le sezioni, e il ritratto deve stare accanto al
  testo che presenta). L'`alt` è la parte che conta; senza `src` non si emette nulla.

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
foglio nodi) e la console lo accoglie nella tela anche per i generi
«dalla mappa» — il primo `openCausal` da fuori console restava invisibile.

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
   ⚠️ Resta la pulizia UNA TANTUM delle ~257 copie già accumulate (da Cabina, con
   anteprima): il difetto è fermo, l'accumulo storico è ancora lì.
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
8. **Il bottone «HTML» dell'editor è a quattro passi** (sintesi con voce naturale).
9. **Codice morto della sintesi**: `_voceNaturale()` (mappai-doc-editor.js) cerca ancora
   l'**MP3 fratello** al passo 4, `buildPrintHtml` accetta ancora `opts.audioSrc`
   (mappai-branch-synthesis.js), e due commenti dicono il contrario di ciò che il codice
   fa. Sono i resti del modello a un file solo, superato dai due file
   (`Sintesi-<Mappa>.html` editabile · `Sintesi-voce-<Mappa>.html` da consegnare).
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
15. **Testo definitivo di «Termini & Condizioni» e «Privacy»**: quello che c'è dice il vero
    ed è verificato sul codice, ma è una sintesi informativa, non un documento legale.

La versione VIVA dell'elenco delle superfici da migrare è il **cantiere dell'Atlante**
(`public/dev/atlante-ui.html`, sezione «CANTIERE»): ogni superficie con la sua destinazione
e il costo letto dal codice. Si rigenera con `node tools/atlante-ui/build.js`.

---

## 5. Da provare in Electron, in ordine

Il pannello browser non ha IPC, non ha disco e serve i file dalla cache: quello che segue
si può vedere **solo** nell'app vera.

0. ✅ **La generazione vera, dall'inizio alla fine: PASSATA** (Giacomo, 14/8 sera, mappa
   «La Svizzera Politica»). Premere Genera → rispondere al modale → andare in INSEGNA
   mentre lavora → spinner in topbar → a fine lavoro l'avviso invece del salto → il
   progetto negli elenchi marcato **NUOVO** → un clic e il bollino sparisce da entrambe le
   liste: tutto verificato sull'app vera, e il bollino corretto è stato confermato da lui.
   ⚠️ **Restano da guardare le due correzioni fatte DOPO quella prova**, e si vedono nei
   primi trenta secondi di una generazione piccola: (a) il velo che copre la sola area di
   lavoro di CREA, con i tre avvii rapidi spariti; (b) il menu «Cosa» aperto mentre lavora
   — Crea ed Elabora grigie col solo lucchetto, nessun'altra icona.
   Da guardare, se capita: che HOME non uccida più la generazione.

1. **Il lavoro del 15/8, in un giro solo** (Cabina › Sviluppo):
   (a) i **quattro collegamenti** di insegnai.ch devono aprire il **browser di sistema**,
   non una finestra dentro MappAI — nel pannello si prova solo che l'URL giusto arrivi a
   `openExternal`, l'ultimo anello lo vedi solo qui;
   (b) la cartella **Diagnostica** che nasce davvero, e una riga dentro `errori.jsonl`;
   (c) una **chiusura brutale**: Uscita forzata → **riapri** l'app → in Cabina › Segnalazione
   deve comparire `chiusura-improvvisa` (la riga arriva al riavvio, non sul momento: chi
   viene ucciso da SIGKILL non scrive niente);
   (d) **Gestione cartelle**: «Apri la cartella» sul Finder giusto e un giro vero di
   «Cambia posizione» con lo spostamento dei file;
   (e) la **segnalazione** dal principio: categoria, testo, «Prepara l'email» → il client
   di posta si apre con gli ultimi errori in coda.
   ⚠️ L'**adozione della cartella madre** è già stata provata sull'app vera (impostazioni
   tolte → adottata e flag riscritto identico; cartella spostata via → zero adozioni),
   quindi non è in questa lista.
2. Il **bottone stampa** delle righe di INSEGNA: se si apre il dialogo di sistema o se
   scatta il ripiego (il file si apre nell'applicazione di sistema).
3. Le **colonne allineate** fra gli elenchi impilati di INSEGNA: l'ultima colonna deve
   essere **134px** e uguale in tutte le tabelle (nel banco esce 58 perché la cache dei
   file è vuota).
4. Il **dossier** stampato: è il documento cambiato di più (testata ora stampata, piè
   presente anche a pagina 1).
5. Il **PDF della catena dei perché** scritto davvero in `Materiale Studio/`.
6. La **combo da tastiera** SHIFT+CTRL+L,K,J,H (provata l'API, mai la sequenza di tasti).

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
