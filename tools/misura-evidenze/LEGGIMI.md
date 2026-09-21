# La misura delle evidenze

Risponde alla domanda con cui si chiude la Milestone 1 del piano Evidence
(ADR 0002): **le domande costruite sulle frasi vere della fonte sono più
verificabili di quelle costruite sulle descrizioni della mappa?**

Due numeri, sugli stessi nodi:

- **quante domande portano un identificatore valido** — cioè una prova che si
  verifica per uguaglianza, non a somiglianza (invariante 22);
- **quante vengono scartate, e per quale motivo** — `id-assente`,
  `id-frase-copiata`, `id-sconosciuto` a interruttore acceso;
  `prova-non-nel-materiale` sulla strada vecchia.

Più la **fedeltà sulle sopravvissute** (la quota di domande entrate nel foglio la
cui prova si verifica per uguaglianza) e la **copertura del pacchetto servito**
(quante delle evidenze date a un ramo hanno prodotto almeno una domanda).

## ⚠️ La misura NON si fa rigenerando la mappa

Provato il 19/9: due generazioni della stessa fonte, stesso modello, stesso
giorno, hanno in comune **15 etichette su 48**. La varianza della generazione è
molto più grande dell'effetto da misurare. Si parte da un progetto **già
generato** e si costruiscono i fogli di domande due volte, senza toccare la
mappa. Il confronto è poi **sui soli nodi presenti in entrambi i giri**, e il
comando dichiara quelli che ha lasciato fuori.

## I passi

1. **Aprire il progetto** già generato (caso di prova: «Svizzera e 2a GM», 48
   nodi, 47 frasi, revisione approvata). Non rigenerare niente.

2. **Primo giro, interruttore SPENTO.** Dalla console dell'app:

   ```js
   MappAIEvidence.spegni()
   ```

   Poi costruire i fogli di domande come sempre («Genera materiali», oppure
   «Crea un documento → Quiz»). A fine giro la console dice il nome del giro:
   `[Misura evidenze] giro «20260921_150210_svizzera_e_2a_gm_evidenze-off»`.

3. **Secondo giro, interruttore ACCESO.** Sempre dalla console:

   ```js
   MappAIEvidence.accendi()
   ```

   L'indice delle evidenze si costruisce **alla prossima apertura del progetto**:
   chiudere e riaprire il progetto, poi costruire gli stessi fogli di domande.
   Il giro nuovo nasce da sé, perché l'interruttore ha cambiato stato.

   Lungo la strada, in qualunque momento: `MappAIMisuraEvidenze.stato()` dice a
   che punto è il giro in corso; `MappAIMisuraEvidenze.chiudi()` lo scrive subito.

4. **Contare:**

   ```bash
   node tools/misura-evidenze/confronta.mjs \
     "~/Library/Application Support/mappai/MappAI-Pipeline/<giro …evidenze-off>" \
     "~/Library/Application Support/mappai/MappAI-Pipeline/<giro …evidenze-on>"
   ```

   L'ordine è quello della misura: prima il giro spento, poi quello acceso. Si
   può passare la cartella del giro oppure direttamente il suo
   `misura-evidenze.json`.

## Dove vanno le tracce

In `<userData>/MappAI-Pipeline/<runId>/misura-evidenze.json` — la stessa cartella
«bus» del checkpoint L1, fuori dal Vault dell'utente perché è lavoro in corso e
non un materiale di classe. `<userData>` è
`~/Library/Application Support/mappai` con l'app in sviluppo e
`~/Library/Application Support/MappAI` con l'app installata. Per aprire la
cartella senza cercarla, dalla console:

```js
window.electronAPI.openPipelineFolder({ runId: MappAIMisuraEvidenze.giro().runId })
```

La traccia si scrive **sempre**, a interruttore acceso e spento: un giro non
tracciato è un giro da rifare. Non c'è un secondo interruttore da ricordare.

Il file contiene: l'intestazione (progetto, quando, interruttore, provider,
modello), i totali, una voce per nodo e una per foglio — con gli identificatori
serviti, le domande tenute e quelle scartate col motivo.

## Che cosa dicono i numeri

| riga | che cosa conta |
|---|---|
| `domande ricevute dal modello` | ciò che è arrivato, prima di qualunque filtro |
| `con un identificatore valido` | la prova si verifica per **uguaglianza** |
| `scartate` + i motivi | chi non è entrato nel foglio, e perché |
| `sopravvissute` | ciò che il docente si ritrova in mano |
| `fedeltà` | sopravvissute con prova per uguaglianza / sopravvissute |
| `evidenze servite che hanno dato una domanda` | copertura del pacchetto del ramo |

A interruttore **spento** la fedeltà è **zero per costruzione**: il materiale non
elenca prove, quindi nessuna domanda può portarne una. Non è un difetto del
giro spento — è esattamente la differenza che la pipeline introduce, ed è il
motivo per cui il numero che conta davvero, fra i due, è quello degli **scarti**:
dice quanto il modello obbedisce quando gli si chiede l'identificatore.

Gli `⚠` in coda dicono quando il confronto **non** misura ciò che sembra: i due
giri con l'interruttore nello stesso stato, progetti diversi, modelli diversi, un
nodo servito da un numero di fogli diverso nei due giri.

## L'autoprova

```bash
node tools/misura-evidenze/confronta.mjs --autoprova
```

Gira su **due tracce finte** scritte dentro `confronta.mjs` (`tracceFinte()`), di
cui si conosce la risposta: tre nodi per giro, due in comune, e il nodo
«Neutralità armata» scritto in NFC in un giro e in NFD nell'altro — identico a
schermo, diverso per `===` (trappola 25). Se la normalizzazione saltasse, i nodi
in comune sarebbero uno invece di due.

| | SPENTE | ACCESE |
|---|---:|---:|
| domande ricevute | 8 | 8 |
| con un identificatore valido | 0 | 5 |
| scartate | 2 | 3 |
| · `prova-non-nel-materiale` | 2 | 0 |
| · `id-assente` | 0 | 1 |
| · `id-frase-copiata` | 0 | 1 |
| · `id-sconosciuto` | 0 | 1 |
| sopravvissute | 6 | 5 |
| fedeltà | 0% | 100% |
| evidenze servite che hanno dato una domanda | — | 4/5 (80%) |

`--mostra` stampa per intero le due tracce finte, nella forma esatta in cui
l'app le scrive: è il modo più corto per vedere il formato del file.

Il comando esce con stato 1 se un numero non torna, quindi vale come prova: la
suite lo lancia (`tests/misura-evidenze.test.js`).

## I limiti, dichiarati

- **Non tutti i fogli passano dalla stessa porta, e va letto sapendolo.** I fogli
  di domande a scelta (scelta multipla, vero/falso) hanno la **porta rovesciata**:
  una domanda senza prova valida non entra, e negli `scartate` si vede. Le
  **flashcard** e le **domande aperte** (dal 21/9) chiedono l'identificatore e
  vengono contate allo stesso modo, ma **non scartano niente**: il docente
  riceve tutte le carte e tutte le domande che il modello ha mandato. Per quei
  fogli `scartate` vale **0 per costruzione** — è il disegno, non un punteggio
  pieno — e il numero che porta il senso è **«con un identificatore valido»**.
  Se la porta vada rovesciata anche lì si decide dopo, con questi numeri.
- Conseguenza della riga qui sopra: in un foglio senza scarti una domanda con un
  id **inventato** si conta come `assente`, non come `id-sconosciuto` — i motivi
  li dice solo chi scarta. La distinzione resta nella console durante la
  generazione (`[Evidenze] … senza una prova verificabile — TENUTE lo stesso`).
- Una domanda aperta può portare **due** identificatori (nasce dal materiale di
  due rami): ne basta uno valido perché risulti provata, e in
  `evidenze servite che hanno dato una domanda` si conta il **primo** valido —
  la copertura del pacchetto, su quei fogli, è quindi una stima per difetto.
- `idsServiti` di un nodo è l'unione dei suoi fogli; il totale del giro è la
  somma dei nodi. Un'evidenza che serve due rami è contata in entrambi — è la
  lettura giusta per «quanto del pacchetto di QUESTO ramo ha prodotto una
  domanda», che è la domanda del passo 6.
- La copertura si legge solo a interruttore acceso: spento non c'è un pacchetto
  da coprire.
- Il punto che tiene il conto è **uno solo** — il filtro delle prove — e ci passa
  anche il quiz del singolo nodo della sessione di studio. Un quiz giocato nel
  quarto d'ora fra due fogli, con lo stesso interruttore, finisce nello stesso
  giro e gonfia i numeri: durante la misura conviene non fare altro. Un giro
  nuovo lo si forza in ogni momento con `MappAIMisuraEvidenze.chiudi()`.
- Le cartelle dei giri restano dove sono: nessuno le pota. Sono piccole (un
  `.json` per giro), ma vanno svuotate a mano quando non servono più.
