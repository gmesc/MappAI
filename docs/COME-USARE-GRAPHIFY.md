# Come usare il grafo per lavorare su MappAI

> Scritto il **21 agosto 2026**, dopo una sessione in cui due domande di debug hanno
> bruciato il 29% della finestra di contesto leggendo a tappeto ciò che il grafo sapeva già.
> Il grafo sta in `graphify-out/graph.json` — **7983 nodi, 13523 archi, 364 comunità**.

## Prima di tutto: `npm run dove`

Il grafo indicizza **simboli**; chi usa l'app ricorda **parole viste a schermo**. Il ponte
è uno script, e non chiede di ricordare niente:

```bash
npm run dove -- "Le domande ci sono già: nessuna generazione davanti alla classe"
```
```
  public/js/mappai-live-teacher.js:162   dentro openLiveSetup()  [def. riga 144]
  🕸  Vicinato di openLiveSetup() nel grafo — chi altro tocca la stessa cosa: …
```

Un comando, ~1 secondo, ~15 righe di output. Fa da solo i tre passi della sezione qui sotto:
trova la riga vera (dal FILE, non dal grafo), risale alla funzione che la contiene, e con quel
nome interroga il grafo. Funziona anche con una frase approssimata — pesa le parole che
discriminano e butta le altre.

Sorgente: [`tools/dove.js`](../tools/dove.js), ~100 righe, zero dipendenze.
Le sezioni che seguono servono quando `dove` non basta: nessun testo a schermo da citare,
oppure serve seguire una catena di chiamate.

## L'interprete

`graphify` non è nel PATH. Il percorso vive in `graphify-out/.graphify_python`:

```bash
P=$(cat graphify-out/.graphify_python)
$P -m graphify query "..."
```

## I quattro comandi, e a che domanda rispondono

| Comando | Domanda | Costo |
|---|---|---|
| `query "SIMBOLO"` | «chi sta intorno a questa funzione?» — vicini a distanza 2, con `file` e `comunità` | ~0,3 s, 700-1500 token |
| `query "..." --dfs` | «come fa X ad arrivare a Y?» — segue una catena invece di allargarsi | idem |
| `path "A()" "B()"` | «A chiama B? per quali salti?» | ~0,2 s, 3 righe |
| `explain "X()"` | «che cos'è questo nodo?» — sorgente, tipo, archi entranti e uscenti | ~0,2 s, 10 righe |

Sempre con `--budget N` su `query`: senza, un nodo molto connesso riempie la risposta.

## La regola che conta: il grafo dice DOVE, il file dice CHE COSA

Il grafo indicizza **simboli**, non prosa. E le sue righe **invecchiano**.

```
graphify query "openMaterialsPanel"
  → renderMaterials()  [src=public/js/mappai-live-teacher.js  loc=L744]
grep -n "function renderMaterials" public/js/mappai-live-teacher.js
  → 520
```

L1 del file è esatto, L744 no: il grafo è del 20/8 e il file è cambiato sotto.
Quindi il ciclo è **sempre a tre passi**, mai due:

1. `query` → **quale file, quale simbolo** (questo il grafo lo sa e non invecchia)
2. `grep -n "function <simbolo>"` → **la riga vera** (una riga di output)
3. `sed -n 'A,Bp'` su ≤40 righe → **il codice**

Saltare il passo 2 significa leggere il punto sbagliato e poi allargare la finestra
per rimediare: è esattamente il modo in cui si brucia contesto.

## Come si formula la domanda

**Un simbolo, non una frase.** Il traversal parte da un nodo che deve *combaciare*:

- ❌ `query "modale QR materiali live z-index"` → aggancia il nodo `materiali` di un file
  di smoke test e restituisce 36 nodi inutili
- ✅ `query "openMaterialsPanel"` → il modulo giusto, `modal()`, `closeModal()`,
  `openDashboard()`, `renderMaterials()` — cioè il vicinato del problema

Non sai il nome del simbolo? Un `grep -rn` **mirato** su una stringa che l'utente ha VISTO
a schermo (il titolo di un modale, un'etichetta) dà il nome; da lì comanda il grafo.

**Nomi ambigui: usa `query`, non `explain`.** `explain "modal()"` ha risposto col `modal()`
di `mappai-tutor-teacher.js` — ce ne sono tre nel repo. `query` mostra `src=` e `community=`
per ogni nodo, quindi l'ambiguità si vede.

## Il grafo è a comunità, ed è il suo valore vero

Ogni nodo porta `community=N`. Simboli della stessa comunità sono **lo stesso pezzo di
sistema**, anche in file diversi. Quando correggi qualcosa, i suoi fratelli di comunità sono
i posti dove lo stesso difetto vive già.

Esempio del 21/8: `modal()` di live-teacher aveva `z-index: 9991` fisso, sotto la console
(12000). La comunità 4 conteneva anche `openQrFull` — **stesso difetto, stessa patch**.
Cercandolo a mano si correggeva uno solo, e il secondo tornava fuori fra un mese.

## I due mestieri

**Correggere un difetto** — sintomo → simbolo → vicinato → causa:
```bash
grep -rn "Testo che l'utente ha letto a schermo" public/js/   # nome del simbolo
$P -m graphify query "quelSimbolo" --budget 800               # vicinato
grep -n "function quelSimbolo" <file> ; sed -n 'A,Bp' <file>  # riga vera, poi 40 righe
```
Prima di dichiarare fatto: guarda i fratelli di comunità. Il difetto è quasi sempre in più
di un posto, ed è la lezione della guida (`GUIDA-ARCHITETTO.md`): si corregge dove passano
tutti i chiamanti, non sul ramo che il rilievo nomina.

**Implementare una funzione** — trova il precedente, non la pagina bianca:
```bash
$P -m graphify query "unaFunzioneCheFaGiàUnaCosaSimile"
$P -m graphify path "chiamante()" "servizio()"     # come si arriva al motore
```
MappAI ha quasi sempre **il precedente**: un modale che si apre così, un IPC che scrive
così, un elenco disegnato così. Il grafo lo trova in mezzo secondo; da lì si copia la
FORMA, che è la ragione per cui le superfici non divergono.

## Quando ricostruire il grafo (e quando no)

- Patch da poche righe → **niente**. Il grafo resta buono: i file ci sono, i simboli anche.
- Modifiche grosse (moduli nuovi, funzioni pensionate) → aggiornamento **strutturale**
  (AST, zero chiamate AI) sui **soli file toccati**.
- ⚠️ **Mai `--update` nudo**: scandisce tutto il repo (1271 file, 2,2 M parole, video
  compresi) e rifà l'estrazione semantica su piani vecchi e asset. Il grafo vive sul corpus
  **curato**: `public/js` senza vendored/minificati, `main.js`, server LAN,
  `tools/banco-layout`, `tests`, traduzioni.
- ⚠️ `prune_sources` confronta percorsi ASSOLUTI contro i `source_file` RELATIVI del grafo
  e **non morde**: la potatura dei nodi morti va fatta a mano sui percorsi relativi.

## Chiudere il cerchio

Una risposta che è costata fatica si rimette nel grafo, e la prossima volta è gratis:

```bash
$P -m graphify save-result --question "..." --answer "..." --type query --nodes SIM1 SIM2
```
