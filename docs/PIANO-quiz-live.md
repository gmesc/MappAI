# Piano — il QUIZ di Studio attivo va anche via QR

> Da `/architetto` (20/8/26). Guida letta per intera; stato da `docs/HANDOFF.md` §0-§5;
> codice dell'area letto (`mappai-study-session.js`, `mappai-scelta*.js`, `live-server.js`,
> `mappai-live-core.js`, `public/live/student.html`, `mappai-live-teacher.js`).
> ✅ **SPEDITO il 20/8/26, tutti e due i giri.** Revisione avversaria a due agenti:
> **9 difetti corretti**, uno grave — col verdetto in mano si poteva **tirare a caso,
> leggere la soluzione e riscrivere la risposta**: il report del docente dava 100%.
> Il blocco stava solo nel telefono, cioè al livello che questo piano aveva scartato
> apposta per il feedback. Ora la regola vive nel server (409 `already-graded`), il
> verdetto si **persiste** dentro la risposta e torna col rientro.
> Altri due che valeva la pena scoprire: «Salta» cancellava una risposta già corretta
> (vive nel piè, fuori dal blocco), e una domanda aperta **da correggere a mano**
> (`outcome: 'manual'`) riceveva un rosso «Sbagliato» e si chiudeva.
>
> Bivi risolti con Giacomo prima di scrivere: **due giri** (prima «Quiz a scelta», poi il
> quiz classico col punteggio), **solo su Studio attivo live**, e la superficie nuova
> **si affianca** dietro kill-switch invece di sostituire `student.html`.

**Braindump tradotto**: portare via QR le due cose che oggi vivono solo in-app —
(1) l'attività **«Quiz a scelta»** (pool dai set MC del vault, campionamento una-per-angolo,
tre passi, taglio nascosto, profilo alla consegna), e (2) le **logiche del player quiz
classico** (`mappai-study-session.js`: feedback immediato per item, punteggio, spiegazione,
riepilogo con gli errori). Perimetro: la sola attività **Studio attivo live**.

**Stato rilevante**
- `mode:'scelta'` in `live-server.js` esiste già e la superficie è **una sola**
  (`mappai-scelta-view.js`) per telefono, app e banco: fra `open` e `mc` cambia **solo il
  campo della risposta** — le opzioni sono già disegnate (`.sc-opt`, `aria-checked`).
- `MappAIScelta.pubblico` porta già `opzioni` e **non** porta `giusta`: il trasporto delle
  opzioni, che il piano precedente dava per mancante, **c'è**.
- `closeSession` (ramo scelta) calcola già `corretta` per gli item `mc` (`v.giusta >= 0`), e
  `buildSceltaReportHtml` mostra già ✓/✗ e «giusta: …».
- Manca solo l'INGRESSO: `MappAISceltaAttivita.apriLive()` impila i due generi in un pool
  unico e non fa scegliere; il modale del docente non ha la leva.
- **Il quiz classico e il quiz Live sono due mondi che si somigliano e divergono in un punto
  che conta**: il classico corregge **subito** (`checkQuizAnswer` → «Esatto/Sbagliato» +
  risposta corretta + spiegazione), il Live **non manda mai** le soluzioni durante il gioco
  (`publicQuestions` le strippa per costruzione, `revealAnswers` vale solo alla consegna).
  È una decisione di prodotto, non una dimenticanza: in classe i telefoni si guardano.
- Il registro: in-app la sessione va su `MappAIStudyBus`; in Live va nei report della sessione
  e in `Attività di studio/<classe>/`. Sono due destinazioni diverse per costruzione.

## Che cosa si fa

### Giro 1 — «Quiz a scelta» via QR ✅ (piccolo: l'infrastruttura c'era già)

1. **`public/js/mappai-scelta.js`** — `apriLive()` guadagna la scelta del **genere**: «Domande
   aperte» · «Quiz a scelta» · «Tutt'e due». Oggi il pool è l'unione dei due e nessuno lo
   decide. La scelta filtra i fogli PRIMA di `poolDaFogli` (una sola lettura, `leggiFogli` non
   cambia), e il modale dice quante domande restano per ogni genere — la stessa riga che già
   dice «N domande da K fogli» (inv. 21: si sceglie vedendo quanto costa).
2. **`public/js/mappai-scelta-core.js`** — `pubblico()` non cambia; si aggiunge
   `conteggioPerTipo(pool)` (puro, due righe) per la riga del modale. ⚠️ Da verificare nel
   test: su un pool misto il campionamento `unaPerAngolo` NON deve far sparire un genere
   (ramo × angolo è la chiave, e un `mc` e un `open` dello stesso ramo/angolo si escludono a
   vicenda). Se il caso esiste, la chiave diventa `ramo|angolo|tipo` — **è la decisione tecnica
   che il giro 1 deve misurare per prima**.
3. **`live-server.js`** — niente di nuovo nel trasporto. Si aggiunge una guardia:
   `/api/stato` accetta `scelta` solo se l'item servito è `mc` (già così via
   `normalizzaStato`, che chiede `v.tipo === 'mc'` e ora anche che l'indice sia dentro le
   opzioni). Test nuovo: una risposta `mc` a una domanda `open` viene scartata.
4. **`public/js/mappai-live-reports.js`** — la scheda per allievo separa i due generi
   («risposte scritte» / «scelte multiple»), perché mescolarli in una percentuale sola
   confonderebbe due misure diverse (una si corregge da sé, l'altra no).

### Giro 2 — le logiche del quiz classico dentro il Live ✅

5. **La correzione la fa il SERVER, item per item** — `live-server.js`, `/api/answer` (e
   `/api/stato` per la strada «a scelta») ritorna `{esito, spiegazione}` **solo se** il docente
   ha acceso `feedbackImmediato` in `session`. Le soluzioni continuano a non viaggiare:
   viaggia il **verdetto** su ciò che lo studente ha già mandato, più la spiegazione, che è
   materiale didattico e non una chiave. ⚠️ Con `feedbackImmediato` spento non cambia
   **niente** (inv. 1: la strada storica è il default).
6. **`public/live/student.html`** — il player mostra l'esito sotto la domanda quando il server
   lo manda (verde/rosso + «Corretta: …» + spiegazione), e il contatore in barra diventa
   «giuste / date». Sono i due pezzi che il classico ha e il Live no. ⚠️ Nessun ritorno
   indietro sulla domanda già corretta: correggere e poi lasciar cambiare la risposta
   trasformerebbe il punteggio in un contatore di tentativi.
7. **`public/js/mappai-scelta-view.js`** — lo stesso esito, ma nella superficie «a scelta»:
   una riga sotto il campo, mai un modale (siamo nel passo ③, dove si risponde una alla volta).
   Una funzione sola per le due superfici sarebbe un pezzo di DOM condiviso fra una pagina che
   ha `style.css` e una che non ce l'ha: **non** si condivide (inv. 6 non morde qui — la
   verità condivisa è il VERDETTO, che sta nel server, non la sua resa).
8. **`public/js/mappai-live-teacher.js`** — nel setup della Live: spunta **«Correggi subito»**
   (default spento) accanto a «Mostra i risultati a fine sessione». Le due leve dicono cose
   diverse e vanno viste insieme.
9. **Il riepilogo finale del classico** (errori con la spiegazione, tempo impiegato) esiste già
   nel Live come `computeStudentResult` + la scheda di `student.html`: si **allineano i due
   testi**, non si scrive un terzo riepilogo (inv. 6). Il tempo per item il Live lo misura già
   (`accumMs`), non lo mostra: si mostra.

## Dove vive la logica nuova

- **Il verdetto sta nel SERVER** (`live-server.js` + `mappai-live-core.js:gradeAnswer`, che già
  corregge): è l'unico posto che ha le soluzioni, ed è la ragione per cui il feedback immediato
  si può fare senza mandarle al telefono (inv. 6: una verità, un proprietario).
- **Il conteggio per genere e il campionamento** in `mappai-scelta-core.js`, puro e testato in
  Node (inv. 4).
- **La resa dell'esito** nelle due superfici, ognuna con la sua veste: `student.html` non carica
  `style.css` e la view si porta il CSS dietro.
- **`main.js`**: pass-through di `feedbackImmediato`, una riga (inv. 19).
- **Niente AI**: entrambi i giri leggono materiali già generati (inv. 7).

## Prove

```bash
node --test tests/scelta-core.test.js     # conteggioPerTipo · campionamento su pool MISTO
node --test tests/live-core.test.js       # gradeAnswer invariato; nessuna soluzione in publicQuestions
node --test tests/live-server.test.js     # server VERO: mc via /api/stato · feedback ON/OFF · report per genere
node --test tests/                        # 0 fail
node tools/smoke/scelta-materiali.js      # i due generi si ritrovano nel vault
```
- Banco `public/dev/scelta-inapp-harness.html`: pool misto, il passo ③ mostra le opzioni per gli
  `mc` e il campo per le aperte, e l'esito compare solo col feedback acceso.
- Live provata contro il **server vero** (pattern di `tests/live-server.test.js`): join → pool
  misto senza soluzioni → risposta `mc` → verdetto con feedback ON, silenzio con feedback OFF.

## Verifica a mano (Electron, Giacomo)

1. Hub Live → «Domande a scelta» → il modale fa scegliere il **genere** e dice quante domande
   per ognuno; scelto «Quiz a scelta», dal telefono arrivano domande **con le opzioni**.
2. Rispondi da due telefoni diversi: ognuno ha le SUE domande (campionamento per studente).
3. Consegna → il profilo dei tagli; il report del docente separa scritte e scelte multiple.
4. Riapri la stessa Live con **«Correggi subito» acceso**: l'esito compare sotto la domanda,
   col testo giusto e la spiegazione; il contatore dice «giuste / date».
5. Con la spunta **spenta** — che è il default — la sessione si comporta esattamente come oggi.
6. `localStorage.mappai_quiz_live_feedback='0'` → la spunta sparisce dal setup e resta la
   strada storica.

## Non-obiettivi

- **Timeline (Completa e Costruisci), Tutor, Lavagna, Materiali**: fuori perimetro, deciso.
- **Sostituire `public/live/student.html`**: resta la strada storica (inv. 1). La potatura si
  valuta dopo che la superficie nuova ha retto giorni d'uso reale.
- Generare domande nuove durante la Live («Domande nuove» del player classico): la Live parte
  **solo da set già pronti** — decisione del 13/8, non si ridiscute.
- Le flashcard via QR (il classico le ha; non sono un quiz).
- Correzione AI delle risposte aperte, timer per domanda, classifica di classe.
- Possibile seguito: il quiz classico in-app che consuma lo stesso verdetto del server quando
  la mappa è in una sessione Live (oggi sono due strade separate).

## Decisioni prese (e revocabili)

- **Il feedback immediato è del SERVER, non del telefono**: mandare le soluzioni e correggere
  in locale sarebbe più corto di una giornata di lavoro e regalerebbe le risposte a chiunque
  apra gli strumenti del browser. Il costo è una chiamata in più per risposta, su LAN.
- **Default spento**: in classe la correzione immediata cambia l'attività (si smette di
  ragionare e si tira a indovinare finché non diventa verde). Chi la vuole la accende.
- **Niente ritorno indietro su una domanda già corretta**: senza questo il punteggio conta
  tentativi, non conoscenze.
- **La resa dell'esito è scritta due volte** (pagina studente e view): condividere DOM fra una
  pagina che ha il CSS dell'app e una che non ce l'ha è la strada per una veste che diverge
  in silenzio. Ciò che si condivide è il verdetto.
- **Il genere si sceglie all'avvio**, non si mescola per default: un pool misto fa convivere due
  misure diverse nello stesso profilo.
- **Ordine dei giri**: prima «Quiz a scelta» (l'infrastruttura c'è, si consegna in fretta e si
  prova in classe), poi il feedback immediato, che è quello che cambia la pedagogia
  dell'attività e va guardato dal vivo prima di renderlo default.


---

## Che cosa è cambiato rispetto al piano (dichiarato)

1. **Il campionamento andava corretto prima di tutto** — era il passo 2 e si è rivelato un
   difetto vero, non un dubbio: con la chiave `ramo|angolo` un `mc` e una domanda aperta dello
   stesso ramo e taglio si escludevano, e su un pool misto **spariva un genere intero**
   (misurato: 4 → 1, tutte aperte). La chiave ora porta il TIPO. Conseguenza sul prodotto:
   «Tutt'e due» raddoppia il carico (14 → 28 con due aree), e la riga del preventivo lo dice.
2. **La regola «una risposta corretta è definitiva» è del SERVER, non del client.** Il piano la
   dichiarava fra le decisioni ma la metteva a schermo: è esattamente il livello che lo stesso
   piano aveva scartato per il feedback. Ora `/api/answer` risponde **409 `already-graded`** e
   il ramo «a scelta» rimette sopra la risposta vecchia; il blocco lato telefono resta, ma come
   interfaccia — non è lui a difendere il dato del docente.
3. **I verdetti stanno su disco, dentro la risposta**, e tornano col `join`: in memoria voleva
   dire che un ricaricamento sbloccava le domande già corrette e azzerava il punteggio. ⚠️ E la
   pagina che lo faceva male era `student.html`, mentre `scelta.html` lo faceva già bene: due
   superfici asimmetriche sullo stesso dato.
4. **`corretta(v, r)` è finita in `mappai-scelta-core.js`** invece di restare scritta due volte
   nel server (inv. 6), e `correctText` è stata **esportata** da `mappai-live-core.js` invece di
   riscritta: sa già di `tf`, `mc`, anni e tolleranze.
5. **Kill-switch `mappai_quiz_live_feedback`** — il piano lo citava e non esisteva (inv. 1).
6. **La spiegazione arriva anche nella strada «a scelta»**: il pool la conserva, `pubblico` non
   la copia, il verdetto sì. Prima la regola CSS che la disegna era irraggiungibile.
7. **Non fatto, e dichiarato**: nella superficie «a scelta» non c'è un contatore di giuste (c'è
   «Domanda N di M»). Aggiungerlo vuol dire decidere se il punteggio si mostra mentre si
   risponde — che è la stessa domanda pedagogica del feedback, e va guardata in classe prima.
