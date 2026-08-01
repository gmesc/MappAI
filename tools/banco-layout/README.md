# Banco di prova dei layout di grafo

Pagina di valutazione per due algoritmi di disposizione dei nodi, provati sui vault
reali e **misurati**, non giudicati a occhio. Serve a decidere se e come portarli nel
ciclo layout di MappAI (oggi: default → orbita → radiale/separato → personale → salvati)
oppure in MappAI - Misuratore.

Non è codice dell'app: `layouts.js` è un modulo puro senza DOM e senza dipendenze da
`appState`. Nessun file di MappAI viene toccato da questi script.

## Comandi

```bash
node tools/banco-layout/build.js      # genera public/dev/banco-layout.html
node tools/banco-layout/test.js       # griglia di misure a terminale, senza browser
node tools/banco-layout/extract.js    # rigenera data.json dai vault (serve solo se cambi mappe)
```

Per aprire la pagina: doppio clic su `public/dev/banco-layout.html` (è autoconsistente —
D3, algoritmi e dati sono incorporati), oppure con il server statico già configurato in
`.claude/launch.json`, voce `mappai-public` → `http://localhost:8145/dev/banco-layout.html`.

## File

| file | ruolo |
|---|---|
| *(fonte unica)* | **il cuore è `public/js/mappai-studio-layouts.js`** — lo stesso modulo che carica l'app (vista STUDIO). Il build lo embedda da lì: mai due copie che divergono. 7 motori: dag, td, anelli, colonne, percorso, fasci, matrice. |
| `vaultparse.js` | lettura dei vault (frontmatter dei `Nodi/*.md`, `links.json`, `index.yaml`) e dei JSON MappAI. UMD, **condiviso** da `extract.js` e dalla pagina: una sola implementazione, nessuna divergenza fra dati precotti e dati caricati a mano. |
| `template.html` | la pagina: caricatore, banchi, comandi, metriche, registro delle prove, verdetto |
| `build.js` | incorpora D3 (da `public/js/d3.v7.min.js`), `layouts.js`, `vaultparse.js` e `data.json` nel template |
| `extract.js` | legge due vault via `vaultparse.js` e scrive `data.json` |
| `data.json` | i dati di prova: `Elettricità - MM` (41 nodi / 52 archi) e `Elettricità - KG` (35 / 71) |
| `test.js` | misura una griglia di configurazioni e la stampa in tabelle |

## Caricare una tua mappa

Il pannello «Prova con una tua mappa» aggiunge un banco accanto ai due precotti. Accetta:

- una **cartella vault** (bottone o trascinamento): legge `Nodi/*.md`, `links.json` e
  `index.yaml`. Il trascinamento di cartelle percorre l'albero, quindi funziona anche
  lasciando cadere la cartella intera;
- un **JSON** esportato da MappAI (`{nodes, links, rootNodeLabel, …}`) o lo stesso
  `data.json` del banco.

Tutto resta nel browser: nessun file viene inviato da nessuna parte.

Il banco si adatta ai dati: le opzioni di «Archi usati» sono calcolate dalla mappa
(hub `COMM_*` → *solo relazioni / + comunità*; presenza di `isCross` → *gerarchia / +
cross*; altrimenti una sola voce). Gli archi che puntano a nodi inesistenti vengono
scartati **e dichiarati** in un avviso — un arco orfano sposta livelli e conteggi, non è
un dettaglio da nascondere. I banchi caricati entrano nel registro delle prove e
nell'esplorazione automatica come quelli precotti, e si tolgono con «Rimuovi banco».

## I due motori

**TD — albero dall'alto.** Reingold-Tilford (`d3.tree`). Serve un albero, quindi si estrae
un **albero portante** con visita in ampiezza dalle radici (grado entrante zero). Sul KG le
radici sono più d'una → **foresta multi-radice**, un albero per radice, impaccati a fianco.
Gli archi che non entrano nell'albero restano disegnati a parte.

**DAG — grafo aciclico a livelli.** Sugiyama in quattro tempi, scritto a mano:
1. rottura dei cicli (DFS): gli archi all'indietro vengono **invertiti**, mai buttati;
2. livelli per cammino più lungo dalle sorgenti;
3. nodi fittizi per gli archi che scavalcano più livelli, poi riduzione degli incroci
   (mediana + trasposizione, provando due ordini di partenza e tenendo il migliore);
4. coordinate col **metodo delle priorità**: un nodo può spostare solo quelli a priorità
   minore, i maggiori fanno da muro. Senza questo vincolo l'assegnamento è un cricchetto
   che allarga il disegno a ogni passata (misurato: un livello da 568px di fabbisogno
   arrivava a occuparne 4544).

Le **corsie** del corridoio fra due livelli non sono più 7 fisse a `max(6, gapLayer/14)`: erano
sei pixel l'una dall'altra con lo spazio fra livelli a 56, cioè un fascio illeggibile. Ora sono
`gapLayer/16` (limitate a 3..9) con passo `gapLayer/(corsie+1)`, e l'ampiezza occupata resta
sempre minore del corridoio, quindi nessuna corsia invade le card. Misurato: distanza minima fra
orizzontali 6px → **14px** a gapLayer 56, **24px** a 240. Lo slider «spazio fra livelli» governa
ora davvero anche questa distanza.

⚠️ Nel passo ③ la trasposizione valuta ogni scambio contando gli incroci delle **sole due
coppie di livelli confinanti**, non di tutto il disegno. La versione ingenua è quadratica nel
numero di archi per ogni singolo scambio: su un grafo denso da 70 nodi il layout impiegava
**67 secondi**, ora 494 ms, a parità di risultato (verificato sui vault reali, numeri
identici). Se si tocca `ordering`, non tornare a ricontare tutto.

Non perde nessun arco.

## Le leve

| leva | cosa fa |
|---|---|
| **Sub-righe** | ripiega un livello su k righe per accorciarlo. Il taglio è in tratti contigui nell'ordine già ottimizzato, così i vicini restano vicini. `auto` sceglie il k minimo sotto una soglia di rapporto. |
| **Orientamento** | dall'alto ↓ o da sinistra →. Una sola trasposizione finale delle coordinate: nessun ramo di codice duplicato. Da sinistra le card si impilano sul lato corto (46px invece di 168). |
| **Instradamento** | curva a S · spezzata dritta · **ortogonale su corsie** (gomiti; porta a zero gli archi che passano sopra card altrui). |
| **Ponticelli** | agli incroci uno dei due archi scavalca l'altro con un semicerchio, come sugli schemi elettrici. Serve all'ortogonale, dove senza non si distingue chi prosegue dritto e chi devia. Il gonfiore va **sempre** dalla stessa parte (verso l'alto sugli orizzontali, verso sinistra sui verticali): la perpendicolare grezza dipende dal verso di percorrenza dell'arco e faceva uscire un ponte a cupola e uno a conca. Nella vista Focus sono **spenti**: lì i nodi sono pochi e gli archetti sarebbero solo rumore. |
| **Respiro** | spazio libero fra livelli, fra card, fra sub-righe; larghezza e altezza card. |
| **Porte** | ogni arco riceve un punto d'attacco distinto sul bordo del nodo, ordinato secondo la posizione dell'altro capo. Senza, tutte le relazioni entrano dal centro e si vede una sola freccia (misurato: 41/41 punti di partenza distinti contro 17/41; distanza fra le punte in arrivo 0px → mediana 18px). ⚠️ In orientamento da sinistra il ventaglio si apre sull'**altezza** della card: se un nodo ha molte entrate, allarga «altezza card». |
| **Gerarchia visiva** | niente · foglie sbiadite · sfumatura per livello · sfumatura + taglia. Ripresa da MappAI: `_opacity` 0.65 sulle foglie e `radiusScale` che rimpicciolisce col livello. |
| **Profondità** | «mostra fino al livello N»: taglia il sottografo e ricalcola il layout, quindi le misure sono quelle di ciò che si vede. In KG la profondità è ricavata dal grafo, non dal campo `level` (che lì non è semantico). |
| **Resa** | etichette archi, bande delle macro-aree, evidenziazione al passaggio (vicini o parentela completa). |

## Colori

La palette è **quella di MappAI**, trascritta da `colorScale` in
[mappai-d3-render.js:18](../../public/js/mappai-d3-render.js): il colore dipende dal `group`
(la macro-area), non dal livello, e i `customColors` del vault hanno la precedenza — come
nell'app. Un nodo ha quindi qui lo stesso colore che ha nella mappa vera.

## Menu contestuale e vista Focus

Tasto destro su un nodo: **Focus (vicini diretti / parentela)**, **Isola qui il sottografo**,
**Copia etichetta**.

Il Focus estrae l'intorno del nodo e lo ridisegna *da solo* in una finestra: pochi nodi, spazio
abbondante, card grandi, **etichette delle relazioni sempre visibili** (il verbo che lega due
concetti è il contenuto didattico, non un dettaglio) e il nodo di partenza cerchiato.
Sopra i 14 nodi passa da sé all'orientamento da sinistra. È la vista che serve quando si deve
capire una cosa per volta, invece di cercarla dentro un disegno da due metri.

«Isola qui» crea invece un **banco nuovo** con quel sottografo: resta confrontabile con gli
altri e passa dal registro delle prove come tutti.

Sei **preset** pronti: Nastro classico · Compatto · Colonna · Arioso da LIM ·
Leggibile BES/DSA · Albero puro.

## Le misure

Calcolate sulla geometria **effettivamente disegnata**: il modulo emette polilinee
campionate che il disegnatore traccia tali e quali, quindi numeri e immagine non possono
divergere. (Prima di questa scelta il misuratore contava corde dritte mentre il disegno
usava curve, e il KG ad albero dichiarava *0 incroci* per 41 archi palesemente intrecciati.)

I **ponticelli sono uno stadio separato** (`addHops`), chiamato *dopo* la misura: sono un aiuto
alla lettura, non un cambio di struttura, e i numeri devono restare confrontabili fra un
instradamento e l'altro. Un ponticello non toglie un incrocio — lo rende leggibile, e questo
va detto invece che nascosto dentro una metrica che migliora da sola. Salta il più orizzontale
sopra il più verticale (convenzione degli schemi) e viene disegnato con una fodera bianca sotto,
così la linea scavalcata si interrompe e il ponte legge come «passa sopra».

Metriche: incroci geometrici · **archi che passano sopra una card** che non è il loro capo ·
card sovrapposte · macro-aree accavallate · ingombro e area · rapporto larghezza/altezza ·
lunghezza media degli archi · archi persi · radici inventate · archi invertiti · nodi fittizi.

Il **registro delle prove** salva configurazione + misure di ogni tentativo, con «Riapplica»
per il confronto A/B, esplorazione automatica di tutte le combinazioni e copia in CSV.
La prima colonna è la **cartella del grafo** su cui la rappresentazione è stata applicata
(`Elettricità - KG`, `Fotosintesi - KG`, …): è il dato che rende la riga rintracciabile
a distanza di giorni. Per i vault viene dedotta dal percorso — è il segmento che precede
`Nodi/` — e per i due precotti la scrive `extract.js` dentro `data.json`. Una mappa
caricata da un singolo `.json` non ha cartella: lì compare il nome del file.
Il registro vive in memoria: ricaricando la pagina si svuota, quindi usa «Copia come CSV»
prima di chiudere.

## Cosa è emerso finora

- Sulla **MindMap** con la sola gerarchia i due motori pareggiano (0 incroci); con i
  cross-link accesi l'albero ne butta fuori 12 e va a 68 incroci, il DAG li stratifica a 18 —
  ma **ri-classifica** la mappa (da 4 a 7 livelli), che è una lettura diversa da quella del docente.
- Sul **KG** l'albero è la scelta sbagliata: 11 radici di cui **6 inventate** (nodi che nessuna
  sorgente raggiunge, promossi a punto di partenza per far quadrare l'albero) e il **54% delle
  relazioni** fuori dall'albero portante.
- Gli **hub di comunità `COMM_*` non devono entrare nel layout**: inchiodano ogni concetto al
  livello 1 e ogni relazione vera diventa un arco lungo da spezzare (nodi fittizi 22 → 100,
  incroci 27 → 131). Vanno resi come banda di colore.
- Le **sub-righe sono un baratto** sul DAG (−54% di larghezza, incroci ×3) ma un guadagno
  netto sull'albero del KG (incroci 79 → 33), dove il costo sono gli archi liberi lunghi.
- L'**orientamento vale più delle sub-righe**: stessa struttura, stessi incroci, area da
  1,92 a 1,60 Mpx solo trasponendo.
- L'**ortogonale** azzera gli archi sopra le card. Il preset «Leggibile BES/DSA» chiude a
  0 archi su card e 0 sovrapposizioni.

## Se si porta nell'app

`layouts.js` entra così com'è (è già UMD e testabile in Node). I punti di innesto nel
renderer attuale:

- il ciclo in [mappai-d3-render.js:1447](../../public/js/mappai-d3-render.js) e le etichette
  del badge a [:1506](../../public/js/mappai-d3-render.js);
- **non** dentro `applyLayoutForces()`: questi sono layout *posizionali*, non a forze. Vanno
  nel ramo che già gestisce `personal`/`custom_*`, che fissa le posizioni e si limita a
  `simulation.alpha(0.3)`;
- i link dell'app sono `<path>`, quindi le polilinee emesse si disegnano senza adattamenti;
- in KG `level` non è semantico (vedi `mappai-structure-analyzer.js`): la profondità va
  ricavata dal grafo, come fa già il modulo;
- le posizioni calcolate si possono salvare col meccanismo dei **layout salvati**, così
  restano ritoccabili a mano.
