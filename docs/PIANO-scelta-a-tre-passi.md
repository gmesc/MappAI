# Piano — «Domande a scelta» in TRE PASSI: aree → scelta → risposte

> ✅ **SPEDITO** il 19/8/26 (commit `322d65f`): core, view a tre passi e banco. Quello che
> resta di questo documento è il PERCHÉ delle scelte — la forma dell'attività, il
> campionamento, i due registri dello stato. Lo stato di fatto è in
> [`HANDOFF.md`](HANDOFF.md) §3.
>
> Da `/architetto` (19/8/26). Rivede la superficie appena spedita con la **fase C**
> (`mappai-scelta-view.js`, commit `9707bd0`) e si innesta nel piano grande
> ([`PIANO-domande-a-scelta.md`](PIANO-domande-a-scelta.md)) **prima** della fase D.
> Guida e stato già letti in questa sessione; codice dell'area riletto prima di scrivere.

**Braindump tradotto**: l'attività non è «rispondi a delle domande»: è **leggere con
attenzione dei RICHIAMI e riconoscere quali riaccendono le proprie conoscenze**. Ogni domanda
è una traccia di recupero; leggerle è già esercizio, anche quelle che si scartano. Perciò la
superficie diventa un percorso a **tre passi**: ① scegli almeno N **macro-aree** (i rami L1,
che il `ramo` dell'item già dichiara) — dichiarare dove ti senti sicuro è già una risposta
metacognitiva; ② **leggi** le domande di quelle aree e per ognuna dici che cosa ti ha acceso,
prendendo quelle a cui vuoi rispondere — **senza ancora scrivere**; ③ rispondi a quelle prese,
una alla volta, e consegni. Vale identico per aperte e scelta multipla: la view è una, cambia
solo il campo della risposta.
Il profilo che ne esce non dice «che cosa sa»: dice **quali tipi di richiamo funzionano per
lui** — ed è per questo che gli angoli restano nascosti durante la lettura e si rivelano dopo.

**Stato rilevante**
- La view di ieri fa ①+②+③ **insieme**: la card si apre e mostra subito la casella. Il codice
  da cambiare è quello, e non è in produzione — la feature non ha ancora nessun ingresso
  nell'app (le fasi D/E non sono state fatte), quindi non esiste un «prima» per l'utente e
  **non serve un kill-switch** per tornarci (inv. 1 non morde: la strada vecchia è l'assenza).
- Il **ramo c'è già** su ogni domanda: la pipeline lo dichiara sull'item dal 19/8 (fase A) e il
  core lo espone con `perRamo(pool)` (già scritto e testato). ⚠️ I fogli generati **prima**
  non ce l'hanno: finiscono in un gruppo senza nome, e su un vault così il passo ① non ha
  niente da chiedere.
- `pubblico(pool)` porta già `ramo` al telefono: il passo ① non richiede nuovi campi in
  trasporto (l'angolo continua a non viaggiare).
- `CFG_DEFAULT` ha `minimo` (risposte) e `perRamo` (raggruppa sì/no). Nessuna leva sulle aree.
- Il banco `public/dev/scelta-harness.html` esercita la view a 390px e misura angolo, sbordi,
  bersagli, contrasti: è dove si prova anche questo.

## Che cosa si fa

**0. IL CAMPIONAMENTO — una domanda per (area × angolo)**
La scala vera: 5 domande per ramo × 7 angoli = **35 per ramo**, cioè ~175 su una mappa da
cinque macro-aree. Su 175 nessuno legge: si cerca la prima che si sa, ed è esattamente il
contrario dell'esercizio. Ma il taglio non si fa a caso — la struttura dice già dove tagliare:
i **7 angoli sono 7 tipi di richiamo diversi** sullo stesso contenuto, mentre le **5 varianti
dello stesso angolo sono lo stesso richiamo ripetuto** (l'angolo è assoluto nel prompt: «causa»
produce cinque modi di chiedere la causa). Le cinque varianti servono al DOCENTE, che ne fa le
righe A e B di una verifica; allo studente che deve riconoscere quale taglio lo accende servono
i sette tagli, non le cinque riscritture di uno.
Quindi `unaPerAngolo(pool, seed)`: per ogni coppia (ramo, angolo) resta **una** domanda, scelta
col seme dello studente.

| | senza | con |
|---|---|---|
| per ramo | 35 | **7** |
| 2 aree scelte | 70 | **14** |
| tutta la mappa (5 rami) | 175 | 35 |

⚠️ Le altre varianti **non si perdono**: restano nei fogli del vault, dove il docente le usa.
E due studenti, avendo semi diversi, leggono varianti diverse dello stesso taglio: **la classe
copre tutto il materiale** senza che nessuno legga centosettantacinque domande.
⚠️ Il campionamento lo applica **chi trasporta** (il server per Live, il guscio in-app), non la
view: in Live il pool campionato è anche quello che si SERVE al telefono, e servirne 175 per
mostrarne 14 sarebbe mandare al telefono le domande che l'attività ha deciso di non fare.

**1. Il core impara le AREE** — `public/js/mappai-scelta-core.js`
- `aree(pool)` → `[{ramo, quante, base, ponte}]` nell'ordine della mappa, gruppo senza nome in
  coda. È `perRamo` con i conteggi: serve a far scegliere **vedendo quanto costa** («Oceani ·
  8 domande»), che è la stessa ragione per cui il bento mostra la stima.
- `filtraPerAree(pool, aree)` → il pool ridotto. Con `aree` vuoto ritorna **tutto**: un
  filtro che non filtra è più prudente di un elenco vuoto (e vale per i vault senza ramo).
- `CFG_DEFAULT` + `minimoAree: 2`, e `passi: true` — l'interruttore del percorso a tre passi.
  ⚠️ `passi: false` non è un kill-switch di produzione: è la forma che serve **in-app** a chi
  apre l'attività su una mappa piccola, dove tre passi per otto domande sono tre schermate per
  niente. La regola sta in `passiUtili(pool, cfg)` — vedi sotto — non in un flag scritto a mano.
- `passiUtili(pool, cfg)` → `false` quando le aree con un nome sono **meno di 2** o le domande
  sono **meno di `sogliaPassi` (12)**: in quei casi il passo ① non ha niente da chiedere e il
  ② è già corto. È la difesa contro la trappola 27 — un passo che esiste sempre ma su metà dei
  vault non può funzionare.
- `validaAree(pool, stato, cfg)` → `{ok, motivi}` con `sotto_minimo_aree` e `nessuna_domanda`
  (aree scelte che non contengono domande: non può capitare dall'elenco, può capitare da uno
  stato vecchio).
- `conteggio`/`validaConsegna`/`profilo` restano **sul pool filtrato**: chi le chiama passa già
  il pool ridotto, e nessuna delle tre cambia. Il `profilo` guadagna invece `aree: [...]` prese
  dallo stato, perché «ha scelto Oceani e Atmosfera» è un dato didattico quanto l'angolo.
- `calorClasse` guadagna la gemella `calorAree(pool, stati)`: quante volte un'area è stata
  scelta e quante evitata. È la riga che dice al docente su quali rami la classe non si sente.
- Test nuovi in `tests/scelta-core.test.js`: aree coi conteggi · il gruppo senza nome in coda ·
  filtro (e filtro vuoto = tutto) · `passiUtili` nei tre casi (poche aree · poche domande ·
  vault vecchio senza rami) · `validaAree` sotto il minimo · `profilo.aree` · `calorAree`.

**1-bis. I CHIP diventano il giudizio di RICHIAMO, e vivono nella lettura**
- Il vocabolario cambia: non più preferenza ma **attivazione** —
  `subito` «mi viene in mente subito» · `partenza` «so da dove partire» · `vago` «mi dice
  qualcosa, ma vago» · `niente` «non mi accende niente».
- ⚠️ **Il chip si dà anche a una domanda NON scelta** (decisione di Giacomo, 19/8): un richiamo
  che non accende nulla è il dato più interessante per il docente, e oggi si sarebbe perso.
  Quindi lo stato si sdoppia, ed è una separazione di sostanza:
  `stato.letture[id] = {chip, nota}` — **che cosa mi ha acceso leggendola**, per qualunque
  domanda; `stato.risposte[id] = {testo|scelta, auto}` — **che cosa ho risposto**, solo per le
  prese. Prima chip e nota stavano dentro la risposta: con l'obiettivo di oggi sarebbe come
  chiedere «che cosa ti aveva acceso?» a chi ha già finito di scrivere.
- Il `profilo` guadagna, per angolo, `letti` e `spenti` (i `niente`): è la riga che dice **quali
  tipi di richiamo non funzionano** per quello studente — e per la classe, con `calorClasse`.

**2. La view diventa un percorso** — `public/js/mappai-scelta-view.js`
- `monta(host, o)` prende `stato.fase` (`'aree' | 'scegli' | 'rispondi'`) e disegna **una**
  delle tre schermate. Manca? La decide `passiUtili`: `'aree'` col percorso, `'scegli'` senza.
  ⚠️ La fase sta nello STATO, non in una variabile del modulo: al rientro lo studente deve
  ritrovarsi dov'era, e lo stato è l'unica cosa che il trasporto salva (inv. 20-bis — ciò che
  dura più di un istante dichiara a che punto è).
- **Passo ① aree**: una card per macro-area col nome e «N domande», che si prendono a tocco
  (stessi `.sc-take`/`.sc-mark` delle domande: una forma sola per «lo prendo»). In testa il
  contatore «2 aree scelte · 14 domande da leggere», che è il numero che rende la scelta
  informata. In fondo **«Vai alle domande»**; sotto il minimo **chiede**, non vieta — è la
  regola già presa per la consegna, e vale a maggior ragione qui, dove il minimo è un consiglio
  di metodo e non un requisito.
- **Passo ② leggi e scegli**: l'elenco **senza il campo della risposta**. Sotto ogni domanda i
  quattro chip del richiamo, che si danno **a prescindere dalla scelta**; il tocco sulla card la
  prende. In testa «lette: N di M · scelte: K» e un comando **«Cambia aree»**; in fondo
  **«Comincia a rispondere»**.
  ⚠️ Dare `niente` a una domanda **non** la prende, e prenderla non obbliga a un chip: sono due
  gesti indipendenti, perché rispondono a due domande diverse.
  ⚠️ Tornando alle aree, le domande già prese che escono dalle aree nuove **restano prese**:
  toglierle sarebbe distruggere una scelta che nessuno ha revocato. Il passo ② le mostra
  comunque, in un gruppo in coda («Già scelte in altre aree»).
- **Passo ③ rispondi**: solo le domande prese, **una alla volta**, con «‹ Indietro» e «Avanti ›»
  e un contatore «3 di 6» (scelta di Giacomo). Sotto il campo: l'autovalutazione se accesa, e il
  chip dato in lettura mostrato **in sola lettura** — si è già espresso, ripetere la domanda lì
  sarebbe chiederla a memoria. In fondo Osservazioni + **Consegna**, che resta raggiungibile
  da qualunque domanda (non solo dall'ultima: chi ha finito deve poter chiudere).
- I tre passi **non** sono tre `monta` diversi: è la stessa funzione che sceglie il corpo, così
  il piè, il contatore e la veste restano una scrittura sola (inv. 6).
- Chiavi i18n nuove `sc_*` in `en_translations.js`, italiano come ripiego inline (inv. 14).

**3. Il banco misura il percorso** — `public/dev/scelta-harness.html`
- **I dati finti prendono la FORMA VERA**: oggi il banco ha 5 domande in tutto, cioè non
  assomiglia a niente di quello che l'app produce. Salgono a **3 rami × 7 angoli × 2 varianti =
  42 grezze**, che è la scala di un vault generato con «Più set per angolo» — e il
  campionamento le porta a **21** (7 per ramo). Senza dati di quella forma, `unaPerAngolo` non
  sarebbe esercitata affatto.
  ⚠️ E si tiene un SECONDO pool piccolo (5 domande, un ramo) per provare il caso opposto: che il
  percorso non parta e si atterri sull'elenco.
- Prove nuove: il passo ① compare · sotto il minimo di aree **chiede** · il passo ② mostra solo
  le domande delle aree scelte · «Cambia aree» conserva le scelte · il passo ③ mostra una
  domanda alla volta e la consegna è raggiungibile da tutte · su un pool piccolo il percorso
  **non** parte (si atterra su «scegli») · e — questo è il punto — **le prove di ieri devono
  continuare a passare**: nessuna chiave d'angolo a schermo, 0 sbordi a 390px, bersagli ≥ 44px,
  contrasti ≥ 4,5:1, «scelta ≠ scritta», lasciare una domanda non butta la risposta, la
  soluzione che non arriva al telefono. Riscrivere la view a passi è il genere di lavoro che
  quelle proprietà le perde in silenzio: restano lì per accorgersene.

**4. Il seguito, dichiarato**: la fase D (server + pagina Live + report) parte **dopo**, e
raccoglie due campi in più nello stato dello studente — `aree` e `fase` — più le due righe
nuove del report (aree scelte per allievo, `calorAree` per la classe). Il piano grande si
aggiorna di conseguenza.

## Dove vive la logica nuova

- **Core** (inv. 4): `aree`, `filtraPerAree`, `passiUtili`, `validaAree`, `calorAree`,
  `profilo.aree`. Sono regole — quante aree bastano, quando il percorso serve, che cosa manca
  per proseguire — e devono girare identiche nel server (Node), nella pagina e nell'app.
- **View**: solo il disegno dei tre passi e la navigazione fra loro. Nessuna regola: `passiUtili`
  e `validaAree` si chiedono al core, come la consegna chiede `validaConsegna`.
- **Trasporto**: invariato nella forma (`onCambia(id, risposta, stato)` passa già lo stato
  intero, quindi `aree` e `fase` viaggiano senza aggiungere una funzione). In fase D il server
  li persiste con le risposte.
- **Niente in `appState`**: le aree sono quelle del POOL, non della mappa aperta — in Live la
  mappa non c'è (inv. 6: la verità è il materiale, non il grafo).

## Prove

```bash
node --test tests/scelta-core.test.js     # +7 prove nuove
node --test tests/                        # 0 fail
```
- Banco `public/dev/scelta-harness.html` a 390px: il percorso completo (aree → scegli →
  rispondi → consegna), il ritorno alle aree, il pool piccolo che salta il passo ①, e le misure
  di ieri che devono restare vere.
- ⚠️ Il banco non prova il **rientro**: `stato.fase` sopravvive solo se qualcuno lo salva, e
  quel qualcuno è il trasporto (fase D per Live, fase E per l'app). La prova vera è là.

## Verifica a mano (Electron/telefono, quando ci sarà la fase D)

1. Una mappa con 4-5 rami e ~30 domande: il primo passo chiede le aree e dice quante domande
   comporta ognuna.
2. Scegliere una sola area → il bottone chiede conferma invece di bloccare.
3. Passo ②: si vedono solo le domande di quelle aree, e nessuna casella di scrittura.
4. «Cambia aree», togliere un'area già usata → le domande prese lì restano prese e si vedono
   in coda.
5. Passo ③: una domanda alla volta, «Consegna» raggiungibile anche dalla prima.
6. Una mappa piccola (8 domande, 1 ramo): il percorso non parte, si atterra sull'elenco.
7. Chiudere e riaprire a metà: si torna al passo in cui si era.

## Non-obiettivi

- Non tocca la fase A (il bento, la generazione per angolo) né il core della pipeline.
- Non aggiunge un tempo massimo, né l'ordine di risposta imposto: si sceglie e si risponde
  quando si vuole.
- Non cambia che cosa viaggia al telefono: l'angolo resta fuori.
- Non tocca il player Live esistente (`student.html`): è un'altra attività.
- Possibile seguito: un **suggerimento** delle aree («l'ultima volta hai evitato Oceani») dal
  registro della padronanza — interessante, ma è un'altra fonte di verità da collegare.

## Decisioni prese (e revocabili)

- **`minimoAree: 2`**: una sola area è la mappa vista da uno spiraglio; due obbligano già a
  scegliere. È una leva del docente, come `minimo`.
- **Il percorso si accende da sé** (`passiUtili`): sotto le 12 domande o con meno di 2 aree con
  un nome, tre schermate sono tre schermate per niente. Un flag scritto a mano avrebbe prodotto
  esattamente il passo inerte che l'inv. 21 vieta.
- **Le domande prese fuori dalle aree nuove non si perdono**: cambiare idea sulle aree non
  cancella una scelta già fatta.
- **Il minimo delle aree si chiede, non si impone** — stessa regola della consegna.
- **Il passo ③ è una domanda alla volta** (vedi bivio): con risposte lunghe su un telefono una
  colonna unica diventa un rotolo, e il «3 di 6» dice quanto manca — che è ciò che tiene su chi
  scrive. La consegna però non aspetta l'ultima domanda.
- **`fase` e `aree` stanno nello stato**, non nel modulo: sono ciò che fa ritrovare il proprio
  posto al rientro.
- **Nessun kill-switch**: la view non ha ancora un ingresso nell'app, quindi non c'è una strada
  vecchia da preservare. Ne servirà uno quando la fase E la monterà nel launcher.

## Bivi

Nessuno aperto. **Il passo ③ è una domanda alla volta** («‹ 3 di 6 ›»), scelto da Giacomo il
19/8: è il pattern che gli allievi già conoscono dal player Live, tiene una risposta lunga su
uno schermo piccolo senza rotoli e dice quanto manca. La Consegna resta raggiungibile da
qualunque domanda, non solo dall'ultima.
