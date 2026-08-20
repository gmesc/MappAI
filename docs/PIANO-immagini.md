# Piano — dall'IMMAGINE: la scheda della fonte e le domande aperte per angolo

> Scritto il 20 agosto 2026. Braindump: «LLM headless, Qwen-VL per .jpg .png .heic .tiff».
> Scopo dichiarato: **per intanto** l'immagine deve produrre (1) un testo di **contesto e
> descrizione**, (2) le **domande aperte con i vari angoli** e (3) le **flashcard**.
> Nasce da una richiesta di **docenti di storia di scuola media**.
> Bivio risolto: **motore locale** (l'immagine non lascia il computer).

**Braindump tradotto**: una fotografia — una miniatura, un manifesto, una carta storica, una
pagina di manuale — viene letta in casa da un modello multimodale. L'estrazione diventa la
**scheda della fonte** (contesto + descrizione), il docente la **corregge**, e da lì si generano
**N fogli di domande aperte, uno per angolo**, ognuno **con l'immagine in testa** — oppure le
**flashcard**. Il percorso è quello che esiste già («Crea un documento»): cambia solo da dove
viene il materiale.

**Stato rilevante**
- `Pipeline.generaSet({tipo:'open', nome, quantita, area, angolo, base})` fa già tutto: angoli,
  quota d'avvio, foglio HTML, archivio, PDF nel vault, nome del file. Prende il materiale dai
  **rami della mappa** (`_branchNodes` → `_branchMaterial`), e quello è l'unico punto da aprire.
- `_genOpenQuestions(material, nodeLabel, quantity, apiKey, opts)` accetta **una stringa** come
  materiale e **un'etichetta**: non sa nulla di mappe. Senza secondo ramo il blocco «due aree»
  sparisce da sé, e le aree si filtrano contro `[nodeLabel]`. **`_genFlashcards` ha la stessa
  firma**: la sorgente esplicita copre entrambi i generi senza un rigo in più nei generatori.
- `_generaVarianti` (`mappai-crea-quiz.js`) genera già **un foglio per angolo** e il nome viene
  dalla chiave dell'angolo. Il 20/8 il naming è stato riallineato fra pipeline e gesto singolo.
- `QUIZ_ANGLES` sono **otto e già scritti per una fonte** («un ESEMPIO concreto: applicare il
  concetto a un caso reale della fonte»): non se ne inventano di nuovi per le immagini (inv. 6).
- **Il motore LLM locale che esiste** (`main_npc_llm.js`, node-llama-cpp 3.19) **non fa visione**:
  misurato, zero simboli `mtmd`/`mmproj` nei binari. **Ollama è già installato**
  (`/usr/local/bin/ollama`, server spento) → POST a `127.0.0.1:11434` con `axios`, che c'è già.
- **HEIC e TIFF non li decodifica nessuno**: `sips` è nel Mac e converte. Solo macOS.

---

## La cosa che decide il disegno

Un modello di visione **descrive bene e contestualizza male**. Su una miniatura medievale dirà
con precisione «un uomo incoronato, seduto, due figure inginocchiate» e poi può **inventare** «è
l'incoronazione di Carlo Magno, anno 800». Costruirci sopra sette fogli di domande vuol dire
sette verifiche sbagliate, con l'errore nascosto nella premessa.

Quindi il flusso non è «immagine → domande», è **«immagine → scheda che il docente corregge →
domande»**, e l'estrazione tiene i due campi **separati**:
- **descrizione** — che cosa si vede, e basta (qui il modello è affidabile);
- **contesto** — che cosa potrebbe essere, dichiarato come ipotesi (qui il docente riscrive).

Il docente di storia il contesto ce l'ha e il modello no. La casella dove scriverlo è metà del
valore della funzione, non un extra.

---

## Che cosa si fa

### 1. `public/js/mappai-visione-core.js` — la logica, pura (inv. 4)
UMD, testata in Node, zero DOM:
- `ESTENSIONI` / `mimeDi(nome)` / `accetta(nome)` — jpg, jpeg, png, heic, heif, tif, tiff;
- `serveConversione(nome)` — vera per tutto tranne jpg e png;
- `MAX_LATO_LETTURA = 1600` (per il modello) e `MAX_LATO_FOGLIO` (per l'immagine incorporata nel
  foglio — vedi passo 5);
- `promptLettura({nome, notaDocente})` — chiede **due campi separati**, `descrizione` e
  `contesto`, e dice al modello di **non affermare** ciò di cui non è certo: nel dubbio, il
  contesto resta vuoto. La nota del docente, se c'è, entra nel prompt come vincolo;
- `normalizzaLettura(raw)` — passa da `salvageTruncatedJSON` (inv. 8); un testo nudo diventa
  `descrizione`, mai `contesto` (il campo che si può inventare non si riempie per ripiego);
- `materialeDaScheda({titolo, contesto, descrizione})` — **l'unico** compositore del materiale
  che va al generatore di domande (inv. 6);
- `diagnosi(errore)` — *server spento* · *modello assente* · *immagine troppo grande* · *timeout*,
  ognuno col **rimedio**, non col fatto (trappola 38);
- `stimaFogli(angoli)` — quante chiamate all'AI costerà (le domande sì; la lettura no, è locale).

**Test** `tests/visione-core.test.js`: estensioni e mime · `serveConversione` · il prompt chiede i
due campi e vieta l'affermazione incerta · normalizzazione sui quattro casi (JSON pulito,
troncato, testo nudo, campi mancanti) · `materialeDaScheda` (compreso il caso «contesto vuoto») ·
`diagnosi` sui quattro guasti · `stimaFogli`.

### 2. `main.js` + `public/js/preload.js` — due IPC sottili (inv. 19)
- **`immagine-prepara({ path, maxLato, formato })`** → `sips -Z <maxLato> -s format <png|jpeg>` in
  `userData/visione-tmp/`, ritorna `{ ok, base64, mime, w, h, byte }` e **cancella il
  temporaneo**. Serve due volte con parametri diversi: PNG grande per la lettura, JPEG piccolo per
  il foglio. Fuori da macOS: jpg e png passano letti e basta, heic e tiff tornano
  `{ ok:false, motivo:'conversione-non-disponibile' }`.
- **`visione-locale({ base64, prompt, model, host, timeoutMs })`** → `axios` POST
  `${host}/api/generate`, `{ images:[b64], stream:false, options:{ temperature:0.1 } }`.
  **`visione-locale-stato()`** → GET `/api/tags`, timeout 1,5s.
- Nessun `require` nuovo, nessun binario nel pacchetto.

### 3. `public/js/mappai-visione.js` — il lettore + la scheda
- `MappAIVisione.disponibile()` — stato del motore, cache breve;
- `MappAIVisione.leggi(file)` → `{ titolo, contesto, descrizione, fotoFoglio }`;
- **il velo dice a che punto è ed è annullabile** (trappola 39-40): una lettura su un Air dura
  decine di secondi;
- la **scheda** è un modale del motore (inv. 10, `Core.validaSchema`): titolo della fonte ·
  contesto · descrizione, **tutti e tre modificabili**, con l'anteprima dell'immagine accanto e
  una riga che dice «il contesto lo ha ipotizzato il modello: controllalo». Da qui si prosegue.

### 4. `Pipeline.generaSet` — **una sorgente esplicita** (l'unico taglio nel motore)
Oggi il materiale viene dai rami:
```js
const tutte  = _branchNodes();
const scelte = (opts.area && opts.area !== 'all') ? tutte.filter(...) : tutte;
```
Si aggiunge un ramo solo: se `opts.sorgente` è presente (`{ etichetta, materiale }`), `scelte`
diventa quella e `_branchMaterial` restituisce il materiale dichiarato. **Tre righe.**
Da lì in poi **non cambia niente**: angoli, quota d'avvio, `_genOpenQuestions`, `ordinaGraduazione`,
il titolo con la convenzione dei cloni, `buildFileName`, l'archivio, il PDF nel vault, le righe in
ELABORA e in INSEGNA. È il punto in cui il resto dell'app funziona già (inv. 6).
E siccome il taglio sta **a monte** del `for` sui rami, vale per **tutti i generi** di
`generaSet`: le **flashcard** dall'immagine escono dallo stesso interruttore — set editabile,
soglia caratteri, foglio A4 orizzontale con le carte da ritagliare, tutto già scritto.

### 5. Il foglio PORTA l'immagine — `window.buildOpenQuestionsHtml(set, opts)`
Nuovo `opts.intro = { fotoB64, mime, titolo, contesto, descrizione }`: in testa al foglio
l'immagine, sotto il contesto, poi le domande. **Un foglio di domande su un'immagine che l'allievo
non vede non serve a niente.**
⚠️ L'immagine va **incorporata**, non referenziata: la finestra che stampa carica l'HTML come
`data:` (origine opaca) e da lì un `file://` è **bloccato** — è la lezione dei caratteri del 19/8,
dove «l'editor sì, il PDF no».
⚠️ E il peso conta: l'archivio (`MappAIStudyDocs`) è `localStorage`, con una quota che si è già
saturata una volta. Sette fogli portano sette copie della stessa foto → si incorpora un **JPEG
ridotto**, e il lato lungo si sceglie **misurando sulle foto vere di Giacomo** (leggibile in
stampa, minimo peso), non a occhio.

### 6. L'ingresso — `public/js/mappai-crea-quiz.js`
Un passo in più, prima dei parametri: **«Da che cosa?» → la mappa · un'immagine**. Compare per
**Domande aperte e Flashcard** (i due generi chiesti); per gli altri resta il percorso di oggi.
Scegliendo l'immagine si apre il file picker, poi la scheda (passo 3), poi i parametri di sempre —
e per le aperte `_generaVarianti` produce **un foglio per angolo** con `opts.sorgente` al posto
dell'area; per le flashcard un set solo (le carte non hanno angoli: la leva non compare, inv. 21).
Il nome della variante resta la chiave dell'angolo, quindi i file escono
`Domande-aperte-<Mappa>-<titolo fonte>-causa.pdf` e ELABORA li riconosce come copie.
⚠️ **La scheda si legge UNA volta e serve entrambi i generi**: chi genera prima le aperte e poi
le flashcard dalla stessa foto non deve pagare due letture né correggere due volte il contesto —
la scheda corretta resta in mano al modulo finché non si cambia immagine.

### 7. Dove finiscono, e perché serve una mappa aperta
I materiali vivono in `Materiale Studio/` **del vault della mappa aperta** (§5 della guida: un
materiale appartiene a una mappa). Concretamente: il docente ha aperto «Il Monachesimo» e produce
le domande su una miniatura di quel capitolo — è il caso reale.
⚠️ **L'originale NON si copia nel vault** (cambiato in corso d'opera): `copySourcesTo` legge
`appState.sources`, cioè le fonti di CREA, e l'immagine di questo percorso lì dentro non entra —
estenderlo sarebbe stato codice per una strada che non esiste. E non serve: il foglio si porta
dentro la sua copia, e l'originale ce l'ha il docente. Quando l'immagine diventerà anche una
fonte per la mappa (il seguito dichiarato), la copia in `Allegati/` verrà da sé, per quella
strada.

### 8. Cabina › Impostazioni AI — una riga che DICE
Motore locale: server acceso? modello presente? Il modello in un campo e il comando da incollare
(`ollama pull qwen2.5vl:7b`). Non una procedura guidata che installa al posto del docente.

### 9. Registro consumi — NON fatto, e dichiarato
La lettura è locale e costa zero: registrarla avrebbe voluto dire toccare `usage-core` (che
normalizza il provider a due valori) e la guardia «niente token, niente riga» del tracker, cioè
il percorso dei COSTI, per una riga a costo zero in un cruscotto che parla di spesa. Le
**domande** passano da `fetchModelAPI` e si registrano già da sole.

### 10. Kill-switch `mappai_visione` (inv. 1)
Spento: il passo «Da che cosa?» non compare, «Crea un documento» è esattamente quello di oggi,
nessun IPC chiamato.

---

## Dove vive la logica nuova

| pezzo | dove | perché lì |
|---|---|---|
| formati, prompt, normalizzazione, materiale, diagnosi | `mappai-visione-core.js` | inv. 4: quello che non si prova in Node si rompe in silenzio |
| `sips` e la POST a Ollama | IPC in `main.js` | inv. 19: I/O e rete di là, decisioni di qua |
| velo, annullamento, scheda modificabile | `mappai-visione.js` | è UI e orchestrazione |
| **la sorgente esplicita** | 3 righe in `Pipeline.generaSet` | inv. 6: generare, nominare e archiviare un foglio ha **un** proprietario. Una seconda strada divergerebbe sui NOMI dei file, cioè su ciò da cui INSEGNA riconosce un materiale |
| gli angoli | `QUIZ_ANGLES`, invariato | inv. 6: già scritti «sulla fonte», nessun elenco parallelo per le immagini |
| l'intro del foglio | `buildOpenQuestionsHtml` | è il builder del foglio: l'immagine è parte del foglio, non un secondo documento |

**Invariante 9** non è in gioco per la lettura (è locale). Le domande passano da `fetchModelAPI`
come sempre → Google e Infomaniak restano entrambi validi, e il foglio va provato su tutti e due.

---

## Prove

```bash
node --test tests/                        # + tests/visione-core.test.js
node tools/smoke/visione-fogli.js         # NUOVO
node tools/smoke/cornice-documenti.js     # il foglio con l'intro non deve rompere la cornice
```
Il banco `visione-fogli.js` fa girare i **moduli veri** con IPC finti, motore di visione finto e
`fetchModelAPI` finta, e prova le quattro cose che i test puri non raggiungono:
una scheda corretta a mano finisce **davvero** nel materiale che va al generatore ·
tre angoli producono **tre** fogli con tre nomi distinti · l'immagine è incorporata nell'HTML di
ognuno · un angolo che fallisce non porta via gli altri (trappola 36) · le **flashcard** dalla
stessa scheda producono un set giocabile col nome giusto, senza rileggere l'immagine.
⚠️ **Nessun test tocca Ollama**: un banco che dipende da un server esterno fallisce per il motivo
sbagliato (trappola 5).

---

## Verifica a mano (Electron — la lista per Giacomo)

1. Ollama **spento** → il passo «un'immagine» c'è e dice il **rimedio**, non un errore generico.
2. `ollama pull qwen2.5vl:7b`, server acceso, mappa di storia aperta → una **miniatura**: la
   descrizione è fedele, e il **contesto** è il campo da guardare col sospetto giusto.
3. Correggi il contesto («miniatura del XII sec., ms. lat. 000, incoronazione di…») → genera
   **tre angoli** (descrizione? causa · conseguenza · confronto) → tre PDF nel vault, tre righe in
   ELABORA con l'angolo nel nome.
4. Apri un foglio: **l'immagine c'è in testa**, il contesto sotto, le domande dopo. Stampalo.
5. Un **.heic** dall'iPhone e un **.tiff** da scanner.
6. Una foto **senza testo** (un paesaggio, un grafico) e una **pagina di manuale**: nel secondo
   caso la descrizione deve contenere il testo, non parlare della pagina.
7. Dalla **stessa scheda**, senza ricaricare la foto: genera le **flashcard** → il set compare
   fra i Set di studio, il foglio da ritagliare è nel vault, e il player le gioca.
8. Con «Salva la fonte originale»: la foto piena è in `Allegati/`.
9. Il peso dell'archivio dopo sette fogli con la stessa foto (Cabina › Gestione cartelle).
10. `mappai_visione='0'` → «Crea un documento» com'era.

---

## Non-obiettivi

- **L'immagine come fonte per generare una MAPPA.** L'estrazione è la stessa e l'aggancio sarebbe
  cinque righe in `startGeneration`, ma non è lo scopo dichiarato: **seguito possibile**, un
  lettore e due consumatori.
- **Quiz a scelta multipla e Vero/Falso dall'immagine**: la sorgente esplicita li abilita quasi
  gratis, ma non sono stati chiesti. Si accendono quando serve (una voce in più nel passo
  «Da che cosa?»).
- **L'originale nel vault** e **la riga nel registro consumi**: vedi i passi 7 e 9.
- **HEIC e TIFF fuori da macOS** (`sips` è di sistema): jpg e png ovunque, gli altri due dicono
  perché no.
- **Più immagini in un foglio solo** (un dossier di fonti a confronto): un'immagine, un foglio.
- **OCR dei PDF scansionati**, **TIFF multipagina** (si legge la prima).
- **Il motore locale come terzo provider di generazione**: qui legge immagini e basta.
- **Installare Ollama al posto del docente.**

---

## Decisioni prese (e revocabili)

- **Contesto e descrizione separati, e il contesto si corregge prima di generare.** È la decisione
  che regge tutto: un modello di visione contestualizza male, e sette fogli costruiti su una
  premessa inventata sono sette verifiche sbagliate.
- **Il contesto non si riempie per ripiego**: se il modello non risponde in forma, il testo nudo
  diventa descrizione. Il campo che si può inventare resta vuoto.
- **L'immagine è incorporata nel foglio** (compressa), non referenziata: un `file://` da un'origine
  `data:` è bloccato, e un foglio senza l'immagine non è un foglio.
- **Il taglio nel motore è una sorgente esplicita in `generaSet`**, non un secondo generatore.
- **Nessun angolo nuovo per le immagini**: gli otto di `QUIZ_ANGLES` parlano già «della fonte».
- **Serve una mappa aperta**, perché un materiale appartiene a un vault. Il passo lo dice invece
  di comparire inerte.
- **Modello dichiarato `qwen2.5vl:7b`**, non `qwen2-vl`: stessa famiglia, generazione successiva,
  ed è quella che Ollama serve oggi. È un **campo**, non una costante.
- **1600px per la lettura**; il lato del JPEG incorporato si decide **misurando** sulle foto vere.
- **Le flashcard NON portano l'immagine sulle carte**: sono carte da ritagliare, e una foto
  ripetuta su ogni carta non è una fonte, è zavorra. L'immagine vive sul foglio delle domande
  aperte e in `Allegati/`; le carte nascono dalla scheda (contesto + descrizione).
- **Una lettura, due generi**: la scheda corretta si riusa per aperte e flashcard della stessa
  immagine.
- **Niente streaming dei token**: una lettura è un risultato, non una conversazione.


---

## Che cosa è stato fatto davvero (20/8 sera)

Tutto quanto sopra, tranne i due punti che il piano stesso ha rovesciato strada facendo
(l'originale in `Allegati/` e la riga nei consumi: passi 7 e 9, motivati lì).

**Un difetto PREESISTENTE corretto per strada**: nel percorso «Crea un documento» le otto
spunte delle **angolazioni comparivano anche per le FLASHCARD**, ma `_genFlashcards` l'angolo
non lo riceve e non l'ha mai ricevuto — otto spunte producevano otto mazzi IDENTICI con otto
nomi diversi («…-causa», «…-conseguenza»), cioè una varietà che nel contenuto non c'è. Il bento
di «Genera materiali» le escludeva già (`multi: ['open','mc']`); questa strada era rimasta
indietro. Ora la sezione non si emette per le flashcard (invariante 21: comandi inerti sono
peggio che assenti).

**File nuovi**: `public/js/mappai-visione-core.js` · `public/js/mappai-visione.js` ·
`tests/visione-core.test.js` (21) · `tools/smoke/visione-fogli.js`.
**Toccati**: `main.js` (+3 IPC) · `public/js/preload.js` · `mappai-material-pipeline.js`
(la sorgente esplicita, 3 righe + `intro`) · `mappai-quiz-print.js` (l'intro sul foglio e
nella sorgente) · `mappai-doc-editor.js` (il giro dell'editor) · `mappai-crea-quiz.js`
(il passo «Da che cosa») · `mappai-cabina.js` (la riga di stato) · `index.html` ·
`en_translations.js` (40 chiavi).

**Verifiche**: suite **1194/0**, sei banchi verdi, i tre schemi nuovi passano
`Core.validaSchema` con 0 errori e 0 avvisi. **Mai girato in Electron** — la lista è in
`docs/HANDOFF.md` §5, in testa.

---
---

# Fase 2 — il DOSSIER DI FONTE (piano, 20/8 sera)

> Braindump: «lasciamo stare Qwen-VL, restiamo con Gemini. Costruire la pipeline per accettare
> immagini (niente `.tiff`) e avviare la generazione degli output partendo da immagine. Nei box
> nascondibili del bento un box nuovo a 4 colonne con le spunte degli output: flashcard, domande
> aperte, sintesi (voce naturale spenta di default, l'opzione resta nell'editor di ELABORA)».
> Poi, sul bivio: «la mappa non mi interessa; mi interessa un **documento di contesto e
> analisi**» — tecnica, periodo, corrente, finalità propagandistiche, destinatario, diffusione,
> elementi grafici, iconografici e tipografici.
> Bivio risolto: **vault DOSSIER, col nome della fonte**.

**Braindump tradotto**: una fotografia caricata fra le fonti di CREA diventa un **dossier**: un
vault suo, col titolo della fonte, che contiene la **scheda di analisi** (il documento nuovo) e
i materiali generati da essa — flashcard, domande aperte, sintesi. La legge **Gemini**, con la
chiave già configurata. Niente mappa generata dalla foto.

**Stato rilevante** (fase 1, commit `7563d0b`)
- Esistono già: il lettore (`mappai-visione.js`), la scheda a due campi, la **sorgente
  esplicita** in `Pipeline.generaSet`, l'**immagine in testa** al foglio delle domande aperte e
  il passo «Da che cosa» in ELABORA › «Crea un documento». Si riusano quasi per intero.
- ⚠️ Il motore era **Ollama**: qui si sostituisce con Gemini. Non si aggiunge — si toglie.
- **Le tre spunte esistono già** (`mp-qt-fc`, `mp-qt-open`, `mp-syn-on`) ma sono **sparse** fra i
  box «Quiz» e «Fonte & Sintesi». Il box nuovo le **raccoglie**: crearne di nuove sarebbe una
  seconda scelta per la stessa cosa (inv. 6).
- **La voce naturale è già spenta di default** (`synthesis: { audio: false }`) e il bottone
  «Voce» **c'è già** nell'editor della sintesi (17/8). Quel punto del braindump è già vero.
- `mp-qt-mc`, `mp-qt-fc`, `mp-qt-open` sono `figlioDi: 'mp-quiz-on'`, e il validatore del bento
  **rifiuta un figlio staccato dal suo master**: nel box nuovo la famiglia si sposta INTERA.

---

## La decisione che rende il resto quasi gratis

Un vault senza nodi rompe le superfici che lo aprono: `_mappaAperta()` della console di ELABORA
chiede `db.nodes.length` e direbbe «nessun documento»; la pipeline genera **per ramo**
(`_branchNodes` → L1), e senza rami non genera niente.

Quindi **il dossier è un vault vero, e il suo grafo È la scheda**: root = il titolo della fonte,
e un nodo L1 per ogni blocco dell'analisi, con il testo del blocco nella `desc`. Costruito in
modo **deterministico** dalla scheda già corretta — zero chiamate AI, zero «mappa generata dalla
foto», che è ciò che non interessa.

Con questo, **tutto il resto dell'app funziona senza toccare niente**: il vault, ELABORA,
INSEGNA, la Vista studio, e soprattutto la pipeline — step B (quiz e flashcard) e D (sintesi)
girano sui blocchi come girerebbero sulle macro-aree di una mappa. Il lavoro nuovo si riduce a:
leggere l'immagine, comporre la scheda, scriverne il documento, e il box del bento.

⚠️ **È una decisione, ed è revocabile**: l'alternativa è un vault a zero nodi e una guardia
nuova in ogni superficie che lo apre. Se il grafo dei quattro blocchi dà fastidio a schermo, si
nasconde — ma toglierlo costa più codice, non meno.

---

## La SCHEDA DI ANALISI — la griglia

Quattro blocchi. La divisione non è redazionale: separa **ciò che il modello osserva** (dove è
affidabile) da **ciò che interpreta** (dove inventa), ed è la trappola 49 della guida applicata
a una griglia più larga di due campi.

**A · Carta d'identità** — genere della fonte (manifesto · dipinto · fotografia · vignetta ·
miniatura · carta · pubblicità) · titolo o slogan · autore o firma se visibile · data o periodo ·
luogo e lingua · **tecnica e supporto** (litografia, xilografia, olio, fotografia b/n, offset).

**B · Che cosa si vede** *(osservazione)* — descrizione denotativa · **il testo trascritto alla
lettera** · elementi iconografici (simboli, attributi, allegorie) · **linguaggio visivo**:
composizione, punto di vista, luce, colore, gerarchia dimensionale, sguardi e gesti ·
**tipografia**: caratteri, corpo, gerarchia, rapporto testo-immagine.

**C · Che cosa vuole ottenere** *(interpretazione)* — corrente grafica o artistica · committente ·
**destinatario** · finalità (informare · celebrare · persuadere · vendere · denigrare) ·
**strategie persuasive** (appello all'emozione, autorità, urgenza, noi/loro, nemico
disumanizzato, semplificazione) · diffusione (dove circolava, tiratura, durata).

**D · Che cosa prova questa fonte** — che cosa dimostra davvero (le **intenzioni di chi l'ha
fatta**, non i fatti che rappresenta) · che cosa **non** mostra, chi non è rappresentato · di
parte, e da quale parte.

**Le due regole che tengono la griglia onesta:**
1. **Ogni affermazione del blocco C porta il suo APPIGLIO VISIVO** — non «propagandistico», ma
   «propagandistico — lo dicono lo slogan in maiuscolo e la figura vista dal basso». Rende
   l'invenzione **verificabile in due secondi**, ed è anche il metodo che si insegna. Senza
   appiglio, il campo resta **vuoto**.
2. **Il blocco D esiste perché senza di lui la scheda descrive un'immagine invece di
   interrogare una fonte** — ed è la competenza che il Piano di studio chiede in storia.

---

## Che cosa si fa

### 1. Il motore passa a Gemini — e Ollama si TOGLIE
- `mappai-visione.js`: `leggi()` chiama `window.fetchModelAPI` con una parte `inlineData`
  (`{ mimeType, data }`) accanto al prompt. È la forma nativa che `fetchModelAPI` già manda.
- **Via** gli IPC `visione-locale` e `visione-locale-stato` da `main.js` e `preload.js`, la riga
  di stato in Cabina, `mappai_visione_model` e `mappai_visione_host`. Resta `immagine-prepara`
  (`sips`), che serve ancora: HEIC Gemini lo accetta, ma **Chromium non lo decodifica** — e
  l'immagine va mostrata nella scheda e incorporata nei documenti.
- **TIFF fuori** da `ESTENSIONI` e `MIME` (braindump). Restano jpg, jpeg, png, heic, heif.
- ⚠️ **Il preavviso del costo**: la lettura ora è una chiamata all'AI e va nella stima del bento
  (una per immagine, ~1000-1500 token). Un lavoro che spende si preventiva prima (trappola 39).
- ⚠️ Invariante 9: su **Infomaniak** non è dichiarato che i modelli accettino immagini. Il passo
  si presenta solo col provider **Google** attivo, e con Infomaniak dice perché — non fallisce.

### 2. La scheda a quattro blocchi — `mappai-visione-core.js`
- `promptAnalisi({nome, notaDocente})` sostituisce `promptLettura`: chiede i campi della griglia
  in un JSON, con la regola dell'appiglio e la licenza di lasciare vuoto **estesa a tutto il
  blocco C e a D**.
- `normalizzaAnalisi(raw, salvage)` → oggetto a campi noti; **il testo nudo cade in `B.descrizione`**,
  mai nei blocchi interpretativi (è la regola della fase 1, allargata).
- `materialeDaScheda(sch)` — riscritta sui quattro blocchi. Resta **l'unico** compositore.
- `nodiDaScheda(sch)` — **nuova, pura**: root + un L1 per blocco non vuoto, con `desc` = il testo
  del blocco. È il grafo del dossier.
- `schedaPronta` resta la valvola contro il caso degenere.

### 3. Il documento «Analisi della fonte»
- Genere nuovo in `mappai-pipeline-core.js`: `analisi_fonte: { pre: 'Analisi-fonte', est: '.pdf' }`.
- Builder `window.buildAnalisiFonteHtml(scheda, opts)` in `mappai-quiz-print.js`, con la
  **cornice condivisa** degli altri documenti (`_qpTestata` · `_qpPie` · `_fontDoc`): immagine in
  testa, poi i quattro blocchi, i campi vuoti **non si stampano**.
- La sorgente incorporata (`qp-set`) porta la scheda: il documento si riapre e si corregge
  (inv. 18). ⚠️ Il banco `cornice-documenti.js` va esteso al settimo documento.
- Riconoscimento negli elenchi: `^Analisi.?fonte` in `_generePerFile` (ELABORA) e `_diskKind`
  (INSEGNA), con un gruppo suo.

### 4. Il DOSSIER — `mappai-vault-io.js` + `mappai-material-pipeline.js`
- All'avvio della generazione, per ogni immagine con la scheda confermata:
  `rootNodeLabel` = titolo della fonte · `db.nodes/links` = `nodiDaScheda` → si riusa la
  funzione di auto-vault **così com'è** (nome, collisione « · 0N », classe e materia dal
  contesto, `Allievi/` con un allievo attivo).
- Poi la pipeline gira come sempre: la scheda come documento (passo 3), quindi B e D secondo le
  spunte del box nuovo.
- ⚠️ **Un'immagine = un dossier.** Tre foto caricate = tre dossier, in sequenza. Un dossier con
  più fonti dentro è un'altra cosa e non è stato chiesto.

### 5. L'immagine fra le fonti di CREA — `index.html` + `app.js`
- Bottone `#btn-src-img` accanto agli altri cinque; `addSource('img')` con
  `accept=".jpg,.jpeg,.png,.heic,.heif"`.
- **La lettura avviene al CARICAMENTO**, non alla generazione: la scheda si apre subito e si
  corregge lì. Così il contatore dei token è vero, il docente vede cosa ha in mano, e **non si
  apre un modale in mezzo alla pipeline** (trappola 33: finirebbe dietro il velo).
- Nel bento, la voce `mn-src-img` nella riga delle fonti — o il bottone non compare affatto.

### 6. Il box «Output automatici» — `mappai-bento-composizione.js`
- `{ id: 'output', titolo: 'Output automatici', icona: 'package-check', span: 4, altezza: 130 }`
  fra i **box nascondibili**, la stessa forma di «Più set per angolo».
- Voci: `mp-quiz-on` (master) · `mp-qt-mc` · `mp-qt-fc` · `mp-qt-open` · `mp-syn-on` ·
  `mp-syn-audio`. **Spostate**, non duplicate: gli id restano quelli che `_readConfig()` legge
  (inv. 6), e la famiglia si muove intera o il validatore la dichiara staccata dal master.
- Restano dov'erano: `mp-perbranch` (un parametro, non un output) nel box «Quiz», `mp-src-pdf` e
  `mp-ns-causal` in «Fonte & Sintesi».
- ⚠️ Con un DOSSIER, i fogli dei nodi e la catena dei perché non hanno senso: le loro spunte si
  disabilitano dicendo perché, invece di produrre documenti vuoti (inv. 21).

---

## Dove vive la logica nuova

| pezzo | dove | perché lì |
|---|---|---|
| griglia, prompt, normalizzazione, materiale, **nodi dalla scheda** | `mappai-visione-core.js` | inv. 4: `nodiDaScheda` è pura e va provata in Node — è ciò che rende il dossier apribile |
| la chiamata a Gemini | `mappai-visione.js` via `fetchModelAPI` | il choke point esiste già: registra i consumi da sé e applica la taratura |
| la conversione HEIC | IPC `immagine-prepara` | inv. 19: `sips` è I/O |
| il documento | `buildAnalisiFonteHtml` in `mappai-quiz-print.js` | è dove vivono i builder dei documenti, con la cornice condivisa |
| il dossier | la funzione di auto-vault che c'è già | inv. 6 e 20: chi crea un vault dichiara la sua identità in un posto solo |
| le spunte | `mappai-bento-composizione.js` (dato) | la composizione è un DATO, e `_readConfig()` resta l'unico lettore |

---

## Prove

```bash
node --test tests/                        # + i casi nuovi in visione-core (griglia, nodiDaScheda)
node tools/smoke/visione-fogli.js         # esteso: dalla scheda al DOSSIER e ai tre output
node tools/smoke/cornice-documenti.js     # esteso al settimo documento
node tools/smoke/pipeline-lucchetto.js
```
I casi che contano nei test puri: il prompt concede il vuoto su **tutto** C e D · un testo nudo
non finisce mai in un campo interpretativo · `nodiDaScheda` salta i blocchi vuoti e produce un
grafo connesso · `materialeDaScheda` non emette intestazioni a vuoto.
Nel banco: una scheda corretta a mano → **un dossier con root e N blocchi** → i tre output
generati dai blocchi, coi nomi giusti. ⚠️ **Nessun test chiama Gemini.**

---

## Verifica a mano (Electron)

1. Provider **Infomaniak** attivo → il passo dell'immagine dice perché non c'è, non fallisce.
2. Una foto di un **manifesto di propaganda**: la scheda arriva coi quattro blocchi. Guardare il
   blocco C: **ogni riga ha il suo appiglio?** Le righe senza appiglio devono essere vuote.
3. Correggere due campi, confermare → «Genera materiali» → **un dossier** in
   `Mappe/<classe>/<materia>/<titolo fonte>/` con la scheda in PDF e i tre output.
4. Aprire il dossier da ELABORA: la console lo apre (è il punto che un vault a zero nodi
   romperebbe), la scheda si corregge e si ristampa.
5. Un **.heic** dall'iPhone.
6. Il box «Output automatici»: spegnere la sintesi → non si genera; la voce naturale resta
   **spenta** e si accende dall'editor della sintesi.
7. Tre foto caricate insieme → tre dossier, in sequenza, nessun nome che si sovrascrive.
8. `mappai_visione='0'` → CREA com'era.

---

## Non-obiettivi

- **La mappa generata dalla foto**: il grafo del dossier è la scheda, deterministico.
- **Un dossier con più fonti** a confronto (un'immagine, un dossier).
- **TIFF** (escluso dal braindump) e **HEIC fuori da macOS**.
- **Quiz MC e V/F dall'immagine**: la spunta c'è ed è già collegata, ma i tre output chiesti sono
  altri — se il MC produce domande deboli su una fonte iconografica si spegne, non si riprogetta.
- **La voce naturale automatica**: resta spenta, l'opzione è nell'editor (già vero dal 17/8).
- **Il motore locale**: si toglie. Se un domani serve l'analisi senza rete, torna come secondo
  motore dietro la stessa interfaccia.

---

## Decisioni prese (e revocabili)

- **Il grafo del dossier è la scheda**: root + un L1 per blocco. Deterministico, gratis, e rende
  apribile il vault senza una guardia nuova in ogni superficie.
- **La lettura al caricamento**, non alla generazione: un modale in mezzo alla pipeline finirebbe
  dietro il velo, e il preventivo dev'essere vero prima di premere «Genera».
- **Un'immagine = un dossier.**
- **Le spunte si SPOSTANO nel box nuovo**, non si duplicano — e la famiglia del quiz si muove
  intera, o il validatore la dichiara staccata dal master.
- **L'appiglio visivo è obbligatorio nel blocco C**: senza, il campo resta vuoto.
- **Il documento porta l'immagine incorporata** e la sua sorgente, come il foglio delle domande.
- **Solo Google**: su Infomaniak la visione non è dichiarata e non si promette.


---

## Fase 2 — che cosa è stato fatto davvero (20/8 notte)

Tutto il piano, con tre aggiustamenti emersi eseguendo:
- **il master `mp-quiz-on` NON si monta nel box nuovo**: è un master DERIVATO (spuntare
  «Flashcard» lo accende da sé, il renderer lo tiene nascosto per `_readConfig`) — montarlo
  a vista rompeva il meccanismo esistente e aggiungeva una spunta ridondante;
- **il box «Output automatici» sta PRIMA di «Preset»**: dopo, la riga dei quattro box da 1
  restava spaiata (l'ha detto il validatore della composizione: righe piene, 13 avvisi come
  prima);
- **la regola dell'appiglio è CODICE, non solo prompt**: `normalizzaAnalisi` scarta un campo
  interpretativo senza « — » (un modello le istruzioni ogni tanto le ignora). `critica` è
  esente: «che cosa tace» parla per assenza.

**Verificato nel banco** (`tools/smoke/visione-fogli.js`, moduli veri): l'appiglio scarta
«Futurismo» nudo e tiene «Persuadere — il dito puntato» · il dossier ha identità NUOVA
(inv. 20) e il grafo è la scheda (root + 4 blocchi) · la CORREZIONE del docente (1917, non
1936) arriva ai generatori e la data sbagliata non arriva a nessuno · l'analisi si archivia
prima del PDF e si rilegge (`schedaFromAnalisiHtml`) · fogli-nodi e catena forzati spenti ·
tre angoli → tre fogli con l'immagine dentro e l'osservazione solo sulle tracce.

**File nuovi (fase 2)**: nessuno — la fase 2 riscrive quelli della fase 1.
**Toccati**: `mappai-visione-core.js` (griglia `BLOCCHI`, `promptAnalisi`,
`normalizzaAnalisi` con la regola dell'appiglio, `nodiDaScheda`, `contestoBreve`) ·
`mappai-visione.js` (Gemini via `fetchModelAPI`, scheda a quattro sezioni) · `main.js` e
`preload.js` (via gli IPC Ollama, resta `immagine-prepara`) · `mappai-cabina.js` (via la
riga di stato) · `mappai-pipeline-core.js` (`analisi_fonte`) · `mappai-study-export-core.js`
(kind `analisi`) · `mappai-quiz-print.js` (`buildAnalisiFonteHtml` + `schedaFromAnalisiHtml`)
· `mappai-material-pipeline.js` (ramo dossier nello step A, `_schedeImmagini`,
`_startFromModal`) · `app.js` (`addSource('img')` + `handleImageUpload`) ·
`mappai-bento-composizione.js` (box «Output automatici», voce `mn-src-img`) ·
`mappai-crea-quiz.js` (intro dai blocchi) · `mappai-elabora-console.js` (righe «Analisi
della fonte» + `_modificaAnalisi`) · `mappai-landing-teach.js` (`^Analisi.?fonte`) ·
`index.html` · i due dizionari.

**Verifiche**: suite **1196/0**, sei banchi verdi, composizione del bento valida (0 errori).
**Mai girato in Electron** — la lista in `docs/HANDOFF.md` §5, in testa.
