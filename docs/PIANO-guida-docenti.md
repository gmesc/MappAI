# La guida per i docenti — stato e ripresa

> Nata come piano il **22 agosto 2026** (`/architetto`, approvata da Giacomo lo stesso giorno),
> **consegnata il 23**, potata il **24**: i passi eseguiti e le decisioni già prese vivono in
> git (commit `fd0c6d0` → `88c686c`). Qui resta ciò che serve a chi riprende.

## Che cos'è, e dove

**La guida** è `~/Claude/MappAI - guida docenti/index.html` — doppio clic e si legge. Tredici
capitoli nell'ordine in cui un docente incontra l'app, più un'appendice sulle attività via QR
marcata sperimentale; 95 fotografie vere, indice navigabile, immagini che si ingrandiscono al
clic. Cartella autonoma (~52 MB), **fuori da git**: si copia o si manda così com'è.

**Gli strumenti che la rigenerano** stanno nel repo, `tools/guida-docenti/`, e il loro
[`LEGGIMI`](../tools/guida-docenti/LEGGIMI.md) è il documento operativo: i tre comandi, che cosa
NON provano, le trappole pagate. In due righe:

```bash
./node_modules/.bin/electron . --remote-debugging-port=9333 \
  --user-data-dir="$HOME/Claude/MappAI - guida docenti/lab/userData" \
  --disable-renderer-backgrounding --disable-background-timer-throttling \
  --disable-backgrounding-occluded-windows
node tools/guida-docenti/campagna.js --da-zero && node tools/guida-docenti/verifica.js
```

## Che cosa resta a Giacomo

1. **Leggerla** — soprattutto il capitolo 1 (la filosofia: meta-materiali, didattica non
   stravolta, «domani meglio»), il 2 (che cosa esce verso l'AI, i costi) e il 12 («Che cosa NON
   esiste ancora»): sono quelli che i docenti leggeranno per primi e per ultimi.
2. **Dire se la classe di prova va bene**: una 4R finta, venti allievi-animale, nessun nome,
   nota di taratura neutra; e i due vault scelti da lui, copiati nel laboratorio.
3. **Il PDF stampabile**: rinviato per sua scelta. Se lo vuole: foglio di stampa e figure
   ridimensionate, mezza giornata.
4. **La chiave Gemini nell'istanza di prova** (Cabina › Impostazioni AI, una volta sola).
   Sblocca le uniche scene che oggi la guida racconta a parole invece di mostrarle: la
   generazione di una mappa da un PDF, «Genera materiali», il dossier da una foto, la voce
   naturale. I passi da aggiungere a `passi.js` sono in fondo.

## I difetti VERI dell'app, trovati leggendo e fotografando

Uno corretto, gli altri no per scelta: la guida non tocca l'app, e ognuno è una riga di lavoro
a sé. In ordine di quanto mordono per un docente-tester.

- **a.** ~~lo schermo di sblocco dice «…a [EMAIL_ADDRESS]»~~ — **corretto il 23/8** (`88c686c`):
  i due dizionari e il markup dicono «a **giacomo@insegnai.ch**», scatto rifatto.
- **b.** il tutor di un nodo scrive nel prompt «L'utente è \<nickname\>, ha \<età\> anni…»
  (`mappai-ai-tutor.js:524-529`), mentre il testo «Privacy» della Cabina promette «Il NOME
  dell'allievo non entra mai» (`mappai-cabina.js:487`). O si corregge il codice, o la promessa.
- **c.** in INSEGNA la tabella «Attività già svolte» non si popola mai: `landing-teach.js:3034`
  legge `r.sessions || r.records`, `main.js:3437` restituisce `rows` (e le celle leggono
  `cls`/`joined` invece di `className`/`participants`).
- **d.** l'onboarding delle lingue è codice morto: `storage-lang.js:864` scrive
  `mappai_language` **prima** del controllo `:869` che lo vuole nullo. Non compare mai.
- **e.** il pallino «Dev self-test» (lo stetoscopio) si monta anche nell'app dei docenti
  (`mappai-dev-selftest.js:141`); in vista ridotta è nascosto dal foglio, altrove no.
- **f.** nei Consumi la voce naturale è prezzata come testo: `matchModelKB` fa prefix-match e
  `gemini-2.5-flash-preview-tts` cade su `gemini-2.5-flash` (`mappai-ui-modals.js:1005`).
- **g.** «Include piano Gratuito (15 req/min)» è una costante scritta a mano (`app.js:495`).
- **h.** la nota sotto YouTube promette «MappAI estrarrà i contenuti audio/visivi del video», ma
  al modello arriva **solo l'URL** (`app.js:1338-1340`).
- **i.** ESC non chiude «Proietta» quando arriva via CDP (il × sì): da provare a mano prima di
  dichiararlo un difetto.
- **j.** il preventivo delle chiamate (`#mp-estimate`) non è montato in nessun riquadro del
  bento: si sceglie senza vedere quanto costa.
- **k.** il dossier `grind this heels` sul disco vero aveva `dossier: false` (riaperto e
  risalvato: `buildVaultMapData` guarda `nodes[0].id === 'fonte_0'`, ma `Nodi/` si rilegge in
  ordine alfabetico) → niente «Proietta». **Riparato a mano** dalla sessione del demo video,
  ma la causa nel codice resta.

## Le decisioni che governano una ripresa

- **La configurazione fotografata è la VISTA RIDOTTA** (`mappai_vista_ridotta`): è quella che i
  tester useranno, e i riquadri scuri di CREA non sono a schermo. La guida quindi non li
  descrive: al loro posto, nel capitolo 5, un riquadro «In breve» dice che cosa nasce di
  partenza. ⚠️ Le spunte nascoste **contano lo stesso** — `_readConfig()` le legge.
- **Dati di prova, mai i veri**: `--da-zero` ricopia i due vault della 4R e riscrive la classe
  anonimizzata; l'istanza ha `userData` e cartella madre proprie, dentro `lab/`.
- **Una guida sbaglia dove ricorda invece di leggere**: i fatti vengono da otto lettori del
  codice (`fatti/*.md`, con `file:riga`), e sei verificatori scettici hanno smentito 51 frasi su
  577. Se il testo cambia in modo sostanziale, quel giro si rifà.
- **Prosa per docenti**: «tu», zero gergo, ogni etichetta fra «…» è quella vera a schermo. Il
  vocabolario tradotto sta in fondo a ogni file di `fatti/` («parole da NON usare»).
- **Non-obiettivi confermati**: la presentazione orale (se ne è occupato il demo video); una
  versione inglese; toccare Cabina › Tutorial e il modale «Come usare MappAI».

## La generazione, fotografata davvero (24/8)

Con la chiave di Giacomo nell'istanza sono nati due passi, `05-crea-genera` e
`09-dossier-crea`, e sette figure che prima mancavano: il velo con le fasi, la girandola in
barra, «Materiali generati»; il modale «Che cosa sai di questa fonte?», la scheda appena letta,
il blocco che interpreta con gli appigli, i box delle opzioni, il riepilogo del dossier.

Tre cose misurate, che sono finite nella guida:

- **il velo finisce prima del lavoro**: quando se ne va la mappa è pronta, ma la pipeline dei
  materiali continua in sottofondo (59 s di velo, un altro minuto di quiz). La fine vera è la
  finestra «Materiali generati», non il velo;
- **il preventivo del dossier non conta la voce**: dice «circa 9 chiamate», ne sono servite
  **25** perché la voce naturale ne fa una per blocco di testo (18);
- una mappa di 49 nodi da un PDF di 24 pagine: **1 minuto**, e il quiz a scelta multipla un
  altro minuto — con la chiave gratuita, zero franchi.

Resta fuori solo la **registrazione della voce** vista da vicino (il preavviso «N blocchi ·
circa M minuti» e il velo «Genero audio 12/78»): si fotografa con un passo `07-voce` che apra
una sintesi in ELABORA e prema «Voce».

### Il passo 09 era rotto, ed era lo strumento — non l'app (24/8, sera)

**Tutti e due i passi ora girano puliti**: `05-crea-genera` (126 s) e `09-dossier-crea`
(223 s, otto figure, dossier generato dalla foto). `verifica.js`: nessun difetto.

Il sintomo era «nessuna scheda dopo 2 minuti», eppure la lettura avveniva davvero. Non era
l'invariante 10 — il motore dei modali si chiude regolarmente col clic dal DOM (provato in
isolamento: box 1→0, promessa risolta con `azione:"si"`). Era `aggiungiFile` in `gesti.js`:
**`DOM.setFileInputFiles` spara già lui l'evento `change`**, e la riga seguente ne sparava un
secondo. `processSourceFile` girava quindi **due volte**: con un PDF non si vedeva, con una
foto impilava **due** modali «Che cosa sai di questa fonte?». Il clic ne chiudeva uno,
l'analisi partiva — e l'attesa del passo, che cerca la sparizione di quel testo, trovava
ancora il secondo. Misurato prima e dopo: `processSourceFile` 2 → 1, modali 2 → 1.

Tolto il dispatch a mano (commento sul posto: se un giorno l'evento non arrivasse più, va
rimesso **condizionato** alla riga della fonte rimasta vuota, mai incondizionato).

```bash
# l'istanza di prova coi tre flag (vedi sopra), poi:
node tools/guida-docenti/campagna.js --solo 09-dossier-crea
cat tools/guida-docenti/fatti/esiti-electron.md      # oggi tutto ✅
node tools/guida-docenti/verifica.js                 # 0 difetti (verificato il 24/8)
```

⚠️ **La chiave AI è nell'istanza di prova** (`lab/userData`, in chiaro nel `localStorage` di
quel profilo). Se non serve più:
`node -e "const l=require('./tools/guida-docenti/lab.js');(async()=>{await l.collega();await l.ls('gemini_api_key',null);l.chiudi()})()"`
