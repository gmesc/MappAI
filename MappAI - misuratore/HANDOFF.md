# MappAI - misuratore — punto di ripresa

**Ultimo aggiornamento**: 29 luglio 2026 · **Branch**: `013-misuratore` · **Nulla è committato**

---

## In una frase

Applicazione Electron separata che misura l'accessibilità del materiale didattico generato da MappAI, più un documento pubblico che ne dichiara le basi scientifiche e propone una sperimentazione didattica al DECS e alla SUPSI‑DFA.

## Che cosa esiste e funziona

| | Stato |
|---|---|
| Spec-kit completo | `specs/013-misuratore/`: spec (62 requisiti, 8 user story), plan, research, data-model, contracts, quickstart, tasks (120) |
| Applicazione | Si apre in Electron 39.8.10, quattro tab, cartelle dati create dal main |
| Task completati | **35 su 120** |
| Suite | **79 test, tutti verdi** (`npm test`) |
| Documento basi scientifiche | `pitch/basi-scientifiche.html`, ~110 KB, autoconsistente |

### Il risultato che regge tutto

`tests/riferimento-2026.test.js` **è verde**: sui due vault reali il misuratore riproduce l'assessment del 24/07/2026 su 30 valori — tutte le metriche strutturali, tutte le righe di parole per nodo, la deviazione standard, e per il corpus dei nodi parole, frasi, parole per frase e parole lunghe. Il Gulpease sta entro 0,2.

**Tre definizioni sono calibrate e non si toccano** senza rifare la calibrazione documentata in `research.md` R1:

1. Il corpo del nodo è tutto ciò che segue il frontmatter **meno la riga del titolo markdown**.
2. Il tokenizzatore è `/[A-Za-zÀ-ÿ0-9']+/g`: l'apostrofo appartiene alla parola, il trattino separa.
3. La deviazione standard è **di popolazione** (÷n), non campionaria.

---

## Come riprendere

```bash
cd "MappAI - misuratore"
npm test            # 79/79
npm start           # Electron
```

Il binario Electron è già scaricato (270 MB, `npm approve-scripts electron` già dato).

**Il prossimo blocco è la fase 3**, 14 task: import dei vault e archivio dei report. È ciò che rende cliccabili i tre bottoni della landing, oggi inerti. Poi la fase 4 (costruttore del report editoriale) chiude l'MVP.

---

## Le decisioni che non vanno rifatte da capo

**Perché esiste uno strumento separato.** Chi misura non deve essere chi produce. Il misuratore non importa nulla da MappAI a runtime: le porzioni riusate sono **copiate** in `public/js/riuso/` con intestazione di origine, commit e data, e `tests/riuso-divergenza.test.js` confronta i verbi di `EDGE_FAMILIES` con l'originale e fallisce dicendo cosa aggiornare. Se MappAI non è raggiungibile il test si salta invece di fallire.

**Perché il profilo di parametri arriva presto.** Un'analisi creata senza profilo incorporato nasce rotta e l'archivio parte corrotto. Per questo la user story 8 è stata promossa prima di US3 e US4 nell'ordine dei task.

**Il vincolo che rende leggibili i risultati.** `buildBaseline` **lancia** se riceve un Δ accessibilità senza la copertura della fonte: non esiste una via di codice che produca l'uno senza l'altra. Un guadagno ottenuto tagliando contenuto non è un guadagno.

**Deroghe consapevoli alla costituzione**, entrambe annotate nel piano: solo Google (all'AI arrivano numeri aggregati, mai testi di allievi) e solo italiano (strumento interno, stringhe comunque centralizzate in `i18n/it.js`).

---

## Il documento pubblico

`pitch/basi-scientifiche.html` — quattordici sezioni, indice a dodici voci, 35 riferimenti in linea, 23 voci di bibliografia, tutte le àncore valide. Si apre dal tab **BASI SCIENTIFICHE** dell'app, oppure da solo: è autoconsistente, font incorporato compreso.

### Le fonti sono state verificate una per una

Quattro verificate sulla pubblicazione via ricerca, cinque sui PDF integrali che Giacomo ha messo in `RIF SCIENTIFICI/`. **Una è stata rimossa perché non esiste**: «EFM-KG 2025, d = 0,80, −28,1% di gap» non compare in nessuna ricerca, e con essa è caduta una citazione virgolettata attribuita a Schroeder sui profili neurodivergenti. In fondo alla bibliografia c'è una nota che dichiara la rimozione.

**Due fonti valutate e non usate, con il motivo scritto**: Luo Xinge & Baharudin 2024 (rivista senza garanzie editoriali verificabili) e Lee, Woo & Yu (realtà virtuale per manutenzione aeronautica, non riguarda le mappe).

### Il perno dell'argomento

Schroeder et al. 2018 trovano che **costruire** una mappa vale g = 0,72 e **studiarne** una già fatta g = 0,43. MappAI genera la mappa, quindi la prima obiezione è ovvia. La risposta, che Giacomo ha formulato e che regge l'intero documento: MappAI non consegna mappe da studiare, **produce l'impalcatura che rende possibile costruirla** — fogli di nodi da completare, sintesi accessibili, schede. Per un allievo con dislessia grave la scelta reale non corre fra costruire e ricevere, ma fra ricevere qualcosa e non fare nulla.

### Un controllo automatico da rieseguire dopo ogni modifica

Esiste uno script usa-e-getta che confronta il documento con `public/profili/predefinito.json`: pesi dei componenti, ancoraggi del Gulpease, soglie, velocità di lettura, assenza di linguaggio da pitch per investitori. Ventidue controlli. Se il documento e il codice divergono, il documento mente su come funziona lo strumento. Vale la pena riscriverlo come test vero in `tests/`.

---

## Che cosa resta aperto

**Da completare prima di inviare il documento**: le voci bibliografiche [16] Lucisano & Piemontese e [17] Franchina & Vacca hanno formula e soglie verificate, ma rivista, volume e pagine li ho scritti a memoria e vanno controllati su catalogo.

**Da decidere prima della pacchettizzazione**: la cartella dati sta dentro la cartella di progetto, come richiesto. Dentro un'app impacchettata quel percorso è in sola lettura, quindi dovrà spostarsi in `~/Documents/`. Il codice risolve la radice dati in **una sola funzione** di `main.js`, quindi lo spostamento resta un cambio in un punto.

**Rischio noto**: l'abbinamento delle righe del registro consumi AI agli elementi avviene per nome progetto e finestra temporale, perché `consumi-ai.jsonl` non contiene la classe. Sui due `Funzioni Urbane` di 1A e 1B funziona perché le generazioni non si sovrappongono (06:52–06:56 contro 07:04–07:09). È fortuna, non garanzia.

---

## Regole di stile fissate da Giacomo, valide per le pagine future

Vedi la sezione dedicata in `CLAUDE.md` §11. In sintesi: una colonna unica centrata con le tabelle in deroga più larghe; schede con fondo pieno d'accento e testo bianco, hover giallo su slate‑800; nessun testo grigio di corollario e nessuna riga d'invito dentro le schede; sillabazione attiva sulla prosa e bilanciamento sui titoli; ogni accostamento di testo e fondo verificato sopra 4,5:1.

## Due trappole in cui sono già caduto

**Le funzioni matematiche CSS esigono spazi attorno agli operatori.** `clamp(19px,0.8vw+17px,22.5px)` è un errore di sintassi e viene scartato in silenzio: l'elemento mostra la dimensione della cascata, che può essere plausibile e quindi passare inosservata. Sei regole ne erano affette. Prima di riportare una dimensione, verificare che la regola **si applichi davvero**, non solo che il valore calcolato sembri giusto.

**Il pannello del browser lavora con `visibilityState: hidden`.** `requestAnimationFrame` è sospeso, quindi le catture di schermo escono bianche o stantie e i contatori animati restano a zero. Non è un difetto della pagina. Verificare interrogando il DOM — su geometria, colori e contrasti è prova più solida di uno screenshot — e dirlo esplicitamente invece di spacciare per verifica visiva ciò che non lo è stato.
