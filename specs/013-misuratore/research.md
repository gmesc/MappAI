# Phase 0 — Research: MappAI - misuratore

**Data**: 2026-07-28 · **Spec**: [spec.md](./spec.md)

Le decisioni qui sotto sono state prese **eseguendo codice sui vault reali**, non ragionando a priori. Gli script di calibrazione sono usa-e-getta e non entrano nel repo; i loro esiti sì.

---

## R1 — Quanto della pagina di riferimento è davvero riproducibile

**Domanda**: SC-001 chiede di riprodurre le cifre dell'assessment del 24/07/2026. È un obiettivo raggiungibile o un desiderio?

**Metodo**: tre script di calibrazione eseguiti su `Mappe/1A/Funzioni Urbane` e `Mappe/1B/Funzioni Urbane`, confrontando ogni cifra prodotta con quella pubblicata.

### Decisione — riproducibile ed esatto

| Gruppo | Esito |
|---|---|
| Metriche strutturali (nodi totali, per livello, macro-aree, profondità, link, verbi distinti, link ricchi, % generici) | **18 valori su 18 esatti**, su entrambe le classi |
| Parole per nodo (n, media, intervallo, per livello e complessive) | **1A: 4 righe su 4 esatte.** 1B: L1 e L3 esatte, L2 e complessiva a 0,1 di distanza |
| Deviazione standard | Esatta con la formula di **popolazione** (÷n), non campionaria (÷n−1): 9,7 e 7,7 contro 9,7 e 7,8 pubblicati |
| Corpus nodi — parole, frasi, parole per frase, parole lunghe | 1A **esatti tutti e quattro** (1357 · 98 · 13,85 · 26,2%). 1B: frasi e parole lunghe esatti, parole 1748 contro 1745 |
| Corpus nodi — Gulpease | 56,7 contro 56,6 e 57,0 contro 56,8: **entro 0,2** |

**Definizioni che riproducono questi valori**, da congelare nel profilo predefinito:

- **Corpo del nodo** = tutto ciò che segue il frontmatter YAML, **meno la riga del titolo markdown** `# Etichetta`. Includendo il titolo, ogni cifra si sposta di 2-3 parole e nessuna combacia più: è la scelta che discrimina.
- **Tokenizzatore parole** = `/[A-Za-zÀ-ÿ0-9']+/g`. L'apostrofo **appartiene** alla parola (`l'ospitalità` = 1) e il trattino **separa** (`politico-amministrativa` = 2). Testate quattro varianti: questa è l'unica che riproduce 1A al centesimo su tutte e quattro le righe.
- **Frasi** = separazione su `[.!?]+`. Testato anche includendo `;` e `:` e con protezione delle abbreviazioni: sui nodi le tre varianti danno lo **stesso** risultato, quindi il dato non discrimina e si sceglie la più semplice.
- **Parola lunga** = 8 caratteri o più, dopo tokenizzazione.
- **Gulpease** = `89 + (300 × frasi − 10 × lettere) / parole`, lettere = `/[A-Za-zÀ-ÿ]/g` (cifre e punteggiatura escluse).
- **Deviazione standard** = di popolazione.

### Decisione — NON riproducibile, e perché conta

| Metrica | Calcolato | Pubblicato | Fattore |
|---|---|---|---|
| Connettivi subordinanti (1A nodi) | 2,06 | 0,59 | **3,5×** |
| Connettivi causali (1A nodi) | 0,22 | 0,88 | **4×** |
| Nominalizzazioni (1A nodi) | 7,07 | 6,48 | 1,09× |
| Marcatori di esempio (1B nodi) | 3 | 9 | 3× |
| Corpus sintesi (1A parole · frasi · Gulpease) | 2984 · 173 · 54,8 | 2955 · 155 · 49,0 | frasi fuori del 12%, Gulpease di 5,8 punti |

Sui connettivi la distanza non è rumore: includere `che` e `se` fra i subordinanti triplica il conteggio, escluderli lo affossa. La lista esatta del 2026 non esiste da nessuna parte. Stesso problema sulla sintesi: `bs-body` meno le citazioni avvicina il conteggio di parole entro l'1% (2984 contro 2955) ma la segmentazione in frasi resta fuori del 12%, e il Gulpease dipende linearmente da quella.

**Conseguenza accettata**: il misuratore **definisce liste e confini propri**, li scrive nel profilo, e i valori storici corrispondenti della pagina del 2026 restano non comparabili. SC-001 è stato riscritto per dire esattamente questo.

**Perché è la scoperta più utile di questa fase**: la pagina di riferimento è irriproducibile non perché il metodo fosse sbagliato, ma perché **i parametri non furono scritti da nessuna parte**. È la giustificazione empirica di FR-053 e FR-054 — non un principio astratto, un errore già commesso una volta su questo stesso materiale.

**Alternative scartate**: (a) reverse-engineering delle liste per tentativi — costoso, e produrrebbe liste scelte per far tornare i conti su un campione di due, cioè sovradattate; (b) rinunciare al confronto — perderebbe la verifica esatta che invece funziona su 30 valori.

---

## R2 — Flesch-Vacca e conteggio delle sillabe

**Decisione**: `Flesch-Vacca = 206 − (0,65 × S) − P`, con `S` = sillabe per 100 parole e `P` = parole per frase. Sillabe contate con un **contatore di gruppi vocalici** con gestione dei dittonghi e degli iati italiani, non con la sillabazione tipografica.

**Rationale**: MappAI ha già la sillabazione, ma è tipografica — `Hypher` con i pattern di Liang italiani, caricata nel browser e usata per spezzare le parole a fine riga. La sillabazione tipografica evita di isolare lettere singole e non coincide con quella fonologica; per un indice serve il conteggio fonologico. Un contatore di gruppi vocalici sull'italiano è accurato perché l'italiano ha ortografia trasparente: ogni gruppo vocalico è una sillaba, salvo i dittonghi e trittonghi che vanno accorpati.

**Alternative scartate**: riusare `Hypher` — introdurrebbe una dipendenza browser in un core che deve girare in Node, e conterebbe la cosa sbagliata. Libreria esterna di sillabazione italiana — dipendenza in più per una funzione di venti righe, contro il vincolo offline.

**Rischio dichiarato**: il conteggio sillabico è approssimato sui dittonghi in iato (`bìo-lo-gì-a` contro `bio-lo-gia`). Va nel profilo come limite noto, e Flesch-Vacca serve a **triangolare** il Gulpease, non a sostituirlo.

---

## R3 — Estrazione testo dai PDF

**Decisione**: PDF.js **vendorizzato** copiando `public/js/pdf.min.js` da MappAI, eseguito nel renderer con il worker disabilitato.

**Rationale**: già in casa, già offline, già in uso in produzione nell'app principale. Il worker disabilitato evita di dover distribuire e risolvere il percorso di `pdf.worker.js` dentro un'app Electron — la penalità di prestazione è irrilevante per PDF di poche decine di pagine analizzati una volta.

**Vincolo che ne deriva**: l'estrazione produce un flusso di elementi di testo con coordinate, non paragrafi. La ricomposizione in frasi va fatta ricongiungendo per riga e riconoscendo le interruzioni: **la sillabazione a fine riga va ricucita** (`amministra-\nzione` → `amministrazione`) altrimenti il conteggio di parole lunghe e le sillabe si falsano. Questo è un requisito di implementazione da annotare nei task.

**Alternative scartate**: `pdftotext` di sistema — non garantito sulla macchina, viola l'autosufficienza. OCR — fuori perimetro dichiarato.

---

## R4 — Niente Tailwind

**Decisione**: CSS scritto a mano, con i design token MappAI riprodotti come classi di utilità nel foglio del misuratore. Nessun Tailwind, né da CDN né compilato.

**Rationale**: FR-051 impone il funzionamento offline; MappAI carica Tailwind da CDN in modalità *play*, che offline non funziona ed è già oggi un debito riconosciuto (703 `!important` per la guerra di specificità con il CSS custom). Il misuratore ha tre schermate, non 3245 righe di HTML: importare quel debito per risparmiare qualche classe è un cattivo affare. I token restano quelli della costituzione grafica — larghezza 1100px, `slate-100` con hover `emerald-400`, header `slate-600` con icone indigo — semplicemente scritti come CSS.

**Alternative scartate**: Tailwind compilato — reintrodurrebbe un passo di build, contro il principio III. Tailwind da CDN — rompe l'offline.

---

## R5 — Grafici dell'ANDAMENTO senza librerie

**Decisione**: SVG generato a mano, come già fa la dashboard consumi di MappAI.

**Rationale**: precedente diretto in casa e funzionante (due ciambelle con drill-down, zero librerie). Le curve e i box dell'ANDAMENTO sono più semplici delle ciambelle. Una libreria di grafici sarebbe la dipendenza più pesante del progetto per la funzione meno critica.

**Vincolo di accessibilità**: ogni grafico deve avere accanto la tabella equivalente — è già la regola seguita nella dashboard consumi, e discende dal principio I.

---

## R6 — Riuso da MappAI: per copia, mai per riferimento

**Decisione**: le porzioni riusate vengono **copiate** in `public/js/vendor/` (librerie) e `public/js/riuso/` (logica), ciascuna con un'intestazione che dichiara file d'origine, commit e data della copia. Un file `RIUSO.md` elenca le copie.

Da copiare: tokenizzazione e stemming italiano da `mappai-desc-fidelity.js` (per la copertura, FR-022), `EDGE_FAMILIES` da `mappai-relations.js` (per il componente 8, FR-030-ter), la normalizzazione degli item di quiz da `mappai-docedit-core.js` (FR-024), `safeName` e `isoDate` da `mappai-files-core.js`, `pdf.min.js` e `js-yaml`.

**Rationale**: un `require` che risale a `../../public/js/` legherebbe l'avvio del misuratore alla struttura interna di MappAI e romperebbe il misuratore a ogni refactoring dell'app principale — che è in corso, il monolite `app.js` è stato appena decomposto.

**Rischio dichiarato e sua mitigazione**: la copia diverge in silenzio. `EDGE_FAMILIES` è il caso pericoloso, perché la regola 12 di MappAI dice che un verbo nuovo si aggiunge lì e si propaga ovunque — ma non si propagherà qui. **Mitigazione**: un test che legge il file originale di MappAI, se raggiungibile, e confronta l'elenco dei verbi con la copia, fallendo con un messaggio che dice cosa aggiornare. Se MappAI non è raggiungibile (misuratore distribuito da solo) il test si salta invece di fallire.

---

## R7 — Abbinamento delle righe di consumo AI

**Decisione**: abbinamento per **nome progetto più finestra temporale** ricavata da `pipeline.json` (`createdAt` meno un margine, `updatedAt` più un margine), con il margine nel profilo. Le righe che cadono nella finestra di due elementi diversi non vengono attribuite a nessuno e sono contate a parte come «contese».

**Rationale**: verificato sui dati reali. `consumi-ai.jsonl` ha `project` e `ts` ma **non** la classe: sui due `Funzioni Urbane` di 1A e 1B il nome è identico. Le finestre però non si sovrappongono — 1A ha generato fra le 06:52 e le 06:56, 1B fra le 07:04 e le 07:09 — quindi l'abbinamento temporale funziona. È fortuna, non garanzia: due classi generate in parallelo si sovrapporrebbero.

**Verifica incrociata gratuita**: `index.yaml` porta `generationUsage.totalTokens` (106.672 per 1A). Se la somma delle righe abbinate si discosta oltre una tolleranza dal totale dichiarato, l'abbinamento è sospetto e va segnalato invece di essere presentato come esatto.

**Alternative scartate**: chiedere a MappAI di scrivere la classe nel registro — modificherebbe l'app principale per comodità del misuratore, e non recupererebbe comunque lo storico.

---

## R8 — Versione di Electron

**Decisione**: allineare alla versione in uso su MappAI, **39.x**.

**Rationale**: il branch `chore/electron-39` ha già fatto il lavoro di migrazione da 30 e ha chiuso 16 avvisi di sicurezza. Partire da una versione più vecchia significherebbe rifare quella migrazione. Il misuratore non usa `webUtils.getPathForFile` né gli handler che avevano richiesto adeguamenti, quindi non eredita alcun debito.

---

## R9 — Segmentazione in frasi dell'italiano

**Decisione**: separazione su `[.!?]+` con protezione di una lista di abbreviazioni dichiarata nel profilo (`ecc.`, `es.`, `art.`, `pag.`, `n.`, `Dott.`, `Prof.`), più la regola che un punto seguito da minuscola non chiude la frase.

**Rationale**: sui corpus dei nodi la protezione delle abbreviazioni non cambia nulla — verificato, le tre varianti danno lo stesso numero di frasi — perché le descrizioni generate non contengono abbreviazioni puntate. Serve invece sulle **fonti**, che sono schede didattiche vere dove `ecc.` e `es.` abbondano; e la baseline fonte→prodotto dipende da quel conteggio.

**Limite dichiarato**: i titoli senza punto finale si fondono con il paragrafo seguente, gonfiando la lunghezza media della frase. Su documenti molto titolati come la sintesi l'effetto è misurabile. **Mitigazione**: la segmentazione avviene **per blocco** (ogni titolo, paragrafo, voce di elenco è un blocco a sé) e un blocco senza punteggiatura finale conta come una frase. È la ragione per cui il corpus della sintesi va estratto conservando la struttura a blocchi, non appiattito a testo.

---

## Riepilogo delle NEEDS CLARIFICATION risolte

| Incognita | Esito |
|---|---|
| SC-001 è raggiungibile? | Sì per 30 valori, no per i proxy euristici e la sintesi — SC-001 riscritto (R1) |
| Formula e sillabe di Flesch-Vacca | Contatore di gruppi vocalici, non sillabazione tipografica (R2) |
| Estrazione PDF | PDF.js vendorizzato, worker disabilitato, ricucitura della sillabazione a fine riga (R3) |
| Tailwind sì o no | No, CSS a mano con i token MappAI (R4) |
| Grafici | SVG a mano, con tabella equivalente accanto (R5) |
| Riuso del codice MappAI | Copia dichiarata + test di divergenza su `EDGE_FAMILIES` (R6) |
| Abbinamento consumi | Nome più finestra da `pipeline.json`, righe contese non attribuite, verifica contro `generationUsage` (R7) |
| Versione Electron | 39.x (R8) |
| Segmentazione frasi | Per blocco, con abbreviazioni protette (R9) |
