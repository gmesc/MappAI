# HANDOFF — stile «manifesto»: landing, COSTRUISCI, bento

> Punto di ripresa per la chat successiva. Scritto il **4 agosto 2026**, a fine sessione.
> Riguarda la VESTE nuova (landing + COSTRUISCI + bento delle opzioni) e il banco che la governa.
> Per le CONSOLE e il motore dei modali resta valido [`HANDOFF-console.md`](HANDOFF-console.md):
> i due filoni si toccano (il chip, i token, il `.mm-tab-wrap`) ma hanno stati diversi — le console
> sono in produzione, questa veste è nuova.
> **Aggiornato il 4/8: la veste è stata provata in Electron — il resoconto, i due difetti corretti
> e le tre cose che aspettano una tua decisione stanno in §8.**
> **Aggiornato il 5/8: una generazione reale è rimasta appesa cinque ore senza spendere un token.
> La causa (un modale nascosto sotto il velo di caricamento) e le tre richieste che ne sono nate —
> contesto nel bento, check master derivati, catena dei perché indipendente — stanno in §10.
> È la sezione da leggere per prima: cambia il contratto del bento.
> La sera del 5/8 è stato rifatto anche l'**upload dei PDF** (Finder al primo clic, righe a griglia,
> elenco dei file che scorre): §11.**
> **⚠️ CHAT NUOVA — leggi §12 per PRIMA COSA.** È il punto di ripresa: i **quattordici
> giri del 5/8** (dalla generazione appesa fino alla composizione finale di Modalità,
> FOCUS e Macro-aree), le due cose che aspettano una tua decisione e le cinque da
> provare in Electron.
> Stato a fine giornata: COSTRUISCI è un mega-bento di **sette righe**, la
> composizione è quella che hai rimandato dall'Officina, e il banco disegna quello
> che l'app fa — le divergenze trovate strada facendo sono tutte chiuse.
> Il diario completo, con le misure e i motivi, è in `CLAUDE.md` §11.

---

## 1. Dove siamo

Giacomo ha disegnato in Inkscape come immagina la landing (`Inkscape/landing MappAI.pdf`, 5 pagine).
Non era una riarchitettura: pagina 4 è la Cabina 1:1, pagina 2 è la vista ridotta di COSTRUISCI.
Quindi è stata costruita **la pelle**, non nuovi moduli — e sotto è rimasto tutto com'era.

| pezzo | stato |
|---|---|
| **Landing manifesto** (rail delle tre forme · header a due comandi · prima pagina vuota) | fatto, **provato in Electron** (§8) |
| **COSTRUISCI** (due colonne · tabella dei file · bento) | fatto, **provato in Electron** — 2 difetti corretti (§8) |
| **Bento** = le opzioni di «Genera materiali», al posto del modale | fatto |
| **Box giallo «Chi:» / «Cosa:»** = il contesto si dichiara nel bento, e il chip dell'header sparisce in COSTRUISCI | fatto 5/8 (§10) |
| **Un bottone, due facce**: verde «Genera materiali» · blu «Genera Mappa» senza materiali | fatto 5/8 (§10) |
| **Catena dei perché** = materiale indipendente, PDF suo (step E) | fatto 5/8, **PDF da provare in Electron** |
| **Upload rifatto**: Finder al primo clic · righe a griglia 2+2 e 1+3 · elenco file che scorre | fatto 5/8 (§11) |
| **Officina §7** — si compone il bento trascinando | fatto |
| **Bottoni-comando** (5 fonti + 3 avvii + 2 Genera) unificati: sola icona, etichetta al passaggio | fatto |
| Vista ridotta (combo SHIFT+CTRL+L,K,J,H) | preesistente, convive |

Suite: **1068 pass / 0 fail / 5 skip** (`npm test`). Branch `feature/vista-studio`, **nulla
committato**. ⚠️ Il totale oscilla: `npm test` scopre anche i test del misuratore, condizionati ai
dati su disco. Il numero che conta è **0 fail**.

---

## 2. I file

Nuovi (2 023 righe in tutto):

| file | cosa fa |
|---|---|
| `public/css/mappai-stile-manifesto.css` | la veste. **Ogni regola è sotto `html.manifesto`**: senza quella classe il foglio è inerte |
| `public/js/mappai-stile-manifesto.js` | monta il **rail** delle tre forme e il mini-logo; tiene lo stato allineato alla modalità vera |
| `public/js/mappai-costruisci-manifesto.js` | la **tabella dei file** e il **bento**; impagina le due righe a colonne |
| `public/js/mappai-bento-composizione.js` | **la composizione del bento come DATO** (voci, moduli, scala, validatore). La leggono officina e app |
| `public/dev/officina-bento.js` | il banco §7: trascinamento, aspetto, diagnosi |
| `public/dev/costruisci-harness.html` | banco del solo modulo di COSTRUISCI |
| `tests/bento-composizione.test.js` | 55 test sulle regole pure (composizione · master derivati · gate · catena indipendente · z-index del velo · le due righe sopra il bento · **i controlli granulari del modulo**) |

Toccati altrove: `index.html` (tre tag), `mappai-landing-teach.js` (esporta `readMode`/`applyMode`),
`mappai-live-classes.js` (z-index del ripiego + `ensureGenerationContext` che non richiede la materia
già dichiarata), e — dal 5/8 — la **pipeline**, che non è più «una riga»:
`mappai-pipeline-core.js` (step E, `hasOutput`, nome file, preset) e `mappai-material-pipeline.js`
(`_stepE`, `cfg.causal`, le tre guardie diventate una).

**Kill-switch**: `mappai_stile_manifesto='0'` → la landing torna esattamente com'era, il modale
storico di «Genera materiali» si riapre. `mappai_bento_layout` = la composizione scritta
dall'officina (assente = quella del file).

---

## 3. Il bento, e perché è fatto così

Le card portano gli **STESSI id del modale** (`mp-quiz-on`, `mp-ns-fmt`…). Non è un trucco: è la
condizione perché `MappAIPipeline._readConfig()` resti **l'unico posto che legge la
configurazione**. Per questo, con la veste accesa, il modale non si apre più — due superfici con gli
stessi id aperte insieme sarebbero un guaio vero.

Alcuni campi non montati ricevono un **campo nascosto**, e sono decisioni, non scorciatoie:
- **`mp-class`** ← ora lo scrive «Chi:» del box giallo (prima il chip). Senza quel campo `classId`
  resterebbe vuoto e i materiali finirebbero fuori dalla cartella di classe. Con un **allievo** vale
  `''` di proposito: la sua mappa va in `Allievi/<nome>/Mappe/`.
- **`mp-adapt-on`** ← acceso. Chi ha assegnato preset e note a una classe le ha già decise una
  volta: richiederle a ogni generazione vorrebbe dire che quella configurazione non conta.
- **`mp-quiz-on` e `mp-ns-on`** ← **derivati dai figli** (5/8). Non sono a schermo perché spuntare
  «Scelta multipla» dice già che i quiz si generano; restano un dato perché `_readConfig()` li cerca.
  Chi sono e da chi dipendono lo dichiara `derivato` in `VOCI` — e `mastersDerivati()` è la funzione
  che officina, app e validatore condividono, così non esistono due liste che possano divergere.
  ⚠️ Il corpo di una sezione con master derivato **non si nasconde mai**: è da lì che si riaccende.

⚠️ Una voce che resta nell'**inventario** dell'officina **non viene montata**: quell'opzione sparisce
e la pipeline usa il suo default. Per questo ogni voce dichiara `seFuori`, cioè *quanto costa* non
averla. Oggi restano fuori, **per decisione presa**: la **stima delle chiamate AI** (si sceglie senza
vedere il prezzo — l'unica assenza che pesa) e **«Genera solo la mappa»**, che non serve più perché è
il bottone verde a diventare blu quando non c'è nessun materiale.

---

## 4. Le decisioni di Giacomo, per non ridiscuterle

- **Verde `#41e6aa`** per tutto ciò che è attivo o si accende al passaggio. Un valore solo.
- **Sul verde il testo è SCURO.** Bianco su quel verde fa **1,6:1**: la scritta sparisce. Vale anche
  per l'emerald.
- **Lo scuro di COSTRUISCI è `#404040`** (5/8), non il nero pieno: **un** grigio scuro per i bottoni
  e per ogni testo scuro della pagina. Sta in due token (`--man-nero`, `--man-su-verde`), quindi si
  cambia in un posto solo. Misurato: sul verde **6,48:1** · sulle card `#f1f4f8` **9,4:1** · sul
  giallo `#fff700` **9,16:1** · come fondo, bianco sopra a **10,37:1**.
  ⚠️ **Unica eccezione, il blu**: `#404040` su `#3f6bf2` fa **2,27:1** — là il segno resta **bianco**
  (4,57:1). È l'unico posto di COSTRUISCI dove questo grigio non si può usare.
- **Neutro `#f1f4f8`** per ogni bottone a riposo: bottoni-fonte, MM/KG non attivo, chip vuoto, i tre
  avvii, il rail. È **un token solo** (`--man-card`) — così la regola resta vera anche al prossimo
  pezzo che si aggiunge.
- **Il rail neutro si inverte**: fondo chiaro, segno scuro. Un'icona bianca in un cerchio chiaro non
  si vedrebbe. Attivo = viola, segno bianco.
- **Tendine e campi senza bordo** (trasparente, il posto resta occupato) + riempimento. È la
  decisione del 31/7 sui campi del motore. Con il bordo via, il `:focus-visible` è obbligatorio.
- **I bottoni-comando mostrano la sola ICONA.** Vale per cinque famiglie che ora sono una sola: i
  cinque **bottoni-fonte** (PDF, URL, YouTube, Audio, Testo), i tre **avvii** e i due **Genera** —
  stessa taglia (130px), stesso raggio, **icona 44px**, etichetta 15/700 che scende di 4px.
  A riposo l'etichetta prende il colore del FONDO e sparisce; compare al passaggio **e col fuoco da
  tastiera**, che un hover non ce l'ha.
  ⚠️ Con l'etichetta nascosta, `title` + `aria-label` non sono un extra ma una **condizione**: senza,
  l'informazione starebbe tutta in un glifo e si scoprirebbe per caso. Li mette
  `titoliAvvii()` in `mappai-stile-manifesto.js`, leggendo il testo del bottone stesso.
- **Sui due Genera il passaggio NON cambia il fondo** (è già colorato): compare solo l'etichetta,
  **col colore del segno**. Conseguenza da sapere: su un **bottone-azione** il colore «txt» scelto
  nell'Officina §7 è quello del **segno** (icona a riposo, testo al passaggio), non del testo a
  riposo. Sui moduli normali resta il colore del testo. Stessa regola nell'anteprima dell'officina.
- **La centratura delle icone è esatta**: misurato **0px** di scarto fra il centro del glifo e quello
  del bottone. Quello che a volte sembra decentrato è un effetto **ottico** della forma dell'icona
  (`folder-open` ha il lembo a destra). Se lo si vuole correggere, va fatto per singola icona.
- **Memoria**: i chip (classe · materia · allievo) sopravvivono alla chiusura; la posizione
  Costruisci/Elabora/Insegna **no** — la prima pagina è una domanda, non la ripresa di ieri.
- **In COSTRUISCI il contesto vive nel BOX GIALLO, non nel chip** (5/8). Il chip dell'header è
  nascosto lì (classe `mn-costruisci` su `<html>`) e torna in ELABORA, in INSEGNA e nelle console.
  La stessa informazione in due posti finisce per divergere, e quello che nessuno aggiorna è quello
  che blocca la generazione — è letteralmente com'è andata.
- **Niente check «generici»**: si spunta «Scelta multipla» e i quiz si generano. Il master resta un
  DATO derivato dai figli, montato nascosto, perché `_readConfig()` deve restare l'unico posto che
  legge la configurazione. Chi sono i master e da quali figli dipendono lo dice `derivato` in
  `VOCI` — una lista sola, non due.
- **Un bottone, due facce**: senza materiali spuntati «Genera materiali» diventa **blu** e si chiama
  «Genera Mappa». Due bottoni affiancati costringevano a scegliere fra due cose di cui una era
  sempre quella sbagliata; e «non hai spuntato niente» smette di essere un errore da spiegare.
- **La «Catena dei perché» è un materiale a sé**, con un PDF suo. Prima era un'opzione dei fogli
  nodi e le sue pagine finivano in coda a quel PDF: per averla bisognava chiedere anche i fogli, e
  nella cartella non c'era un file che si chiamasse come la cosa cercata.

---

## 5. Da fare, in ordine

1. ~~**Provare in Electron.**~~ **FATTO il 4/8** — vedi §8. **Provata anche una generazione reale il
   5/8, e ha trovato il difetto di §10.** Restano da provare in Electron:
   - il **PDF della catena dei perché** scritto davvero in `Materiale Studio/Catena-dei-perche.pdf`
     (`html-to-pdf` e `save-vault-file` sono IPC: nel browser non esistono);
   - una **generazione completa dal box giallo** con una classe a più materie, ora che il modale non
     si apre più;
   - la **combo da tastiera** SHIFT+CTRL+L,K,J,H (provata l'API, non la sequenza di tasti).
2. ~~**Decidere della stima chiamate AI.**~~ **Deciso il 5/8: resta FUORI.** Il bento non dice quanto
   costa, e il validatore lo dichiara come avviso invece di tacerlo. Conseguenza da sapere: la
   «Catena dei perché» costa **zero** chiamate (i nessi si ricavano dal grafo) e senza la stima
   quel dato non si vede. Se un giorno serve, è una casella.
3. ~~**Il campo ROOT a destra della scelta del genere.**~~ **Già fatto** nel round 2 (`mn-riga-genere`):
   misurato in Electron, MM/KG a sinistra 340px e il campo del tema a destra, 460px. Questa voce
   era rimasta indietro rispetto al codice.
4. **Icone**: quelle dei moduli e delle azioni ci sono e sono a 44px. Se ne servono altre — per
   esempio accanto alle singole opzioni — diventerebbero un campo della composizione, come già il
   titolo: va detto quali.
5. Quando la composizione convince: **«Mostra il JSON» → incollarlo** in
   `public/js/mappai-bento-composizione.js`, così diventa il default del repo e non vive solo nel
   localStorage di una macchina.
6. ~~Il **pallino della Cabina** è rimasto `#989898`.~~ **Fatto il 4/8**: prende `--man-card` come
   ogni altro bottone a riposo, e si **inverte** come il rail — puntino `#404040` (**9,4:1**), che
   torna bianco quando il passaggio o il fuoco da tastiera fanno diventare viola il fondo.
   `--man-grigio` non lo usa più nessuno: resta dichiarato, con scritto perché.

---

## 6. Trappole, quelle che sono costate tempo QUI

Le generali stanno in `HANDOFF-console.md` §6 e valgono ancora. Queste NOVE sono nuove:

1. **`safeCreateIcons()` è un hub GLOBALE**: riscrive le icone di tutta la pagina. Chiamarlo dentro
   un ridisegno innescato da un `MutationObserver` chiude il cerchio e **appende il renderer** —
   successo, e da lì nemmeno `1+1` rispondeva più. Dove un pezzo si ridisegna spesso, l'icona va
   messa come **SVG in linea**.
2. **Quando il pannello si blocca, la via più rapida è un harness col solo modulo**: se lì non si
   blocca, il colpevole è l'interazione con l'app. (`costruisci-harness.html` è nato così.)
3. **Due banchi perché vedono cose diverse**: l'harness carica `style.css` (e infatti ha trovato il
   `font-size !important` della landing che sfondava i corpi del bento), l'officina no.
4. **Il figlio ha un colore SUO**: `.source_btn_text`, `.mn-op span`, lo `<span>` di
   `.btn_quick_action` (20px con 5px di spaziatura). Il contenitore obbedisce e il figlio no —
   succede ogni volta, e ogni volta la cura è la stessa: **imporre sull'etichetta**, con id +
   `!important`. Nel bento i figli ora fanno `color: inherit` apposta.
5. **`inherit !important` può peggiorare**: eredita dal padre, e se il padre è colpito dalla stessa
   regola il difetto si propaga. Serve il VALORE.
6. **Lo stile inline batte qualunque regola non-`!important`, quindi uccide gli stati.** Scrivere
   `color` inline sul bottone-azione rendeva impossibile all'hover del foglio cambiarlo: il testo
   restava del colore del fondo anche al passaggio. La cura non è `!important` a valanga — è passare
   inline solo i **valori** (`--mn-seg`, `--mn-fondo`) e lasciare che a scegliere sia il CSS, dove
   `:hover` e `:focus-visible` funzionano. Vale per ogni proprietà che ha degli stati.
7. **`var(--x)` non risolve se il token è dichiarato solo su `html`**: dentro un contenitore la
   dichiarazione diventa invalida e l'elemento esce **trasparente**. I token stanno su
   `html.manifesto, .manifesto`.
8. **Il marcatore anti-cache deve dipendere da OGNI file che la pagina serve**, non da tre: si
   modifica il CSS e la pagina mostra il vecchio, e si misura una cosa non più vera.
9. **A pannello nascosto le transizioni CSS restano congelate** sul frame di partenza, e
   `getComputedStyle` serve quel colore. Prima di dire che una regola non vince: spegni
   `transition` e rimisura.
10. **`getComputedStyle` dice il valore in vigore, mai da dove viene.** Quando una regola
    `!important` non vince, smetti di ragionare e chiedi: `CSS.getMatchedStylesForNode` (debug
    remoto) elenca le regole che colpiscono davvero quel nodo, con i loro `!important`. Qui ha
    trovato in due secondi `#landing-view .glass-card #setup-form > div:not(:last-child)`, che a
    memoria non avrei mai cercato.
11. **Una `*/` di troppo fa scartare in silenzio la regola che segue.** Aggiungendo righe a un
    commento CSS già chiuso, il testo finisce nel foglio come spazzatura e il browser butta via
    la dichiarazione successiva senza dire niente. Sembra un problema di cascata, non lo è.
12. **Sposta il puntatore prima di giudicare uno stato.** Uno screenshot col mouse fermo sul
    bottone mostra l'hover: qui ha fatto sembrare rotta l'etichetta nascosta di «Genera Mappa».
13. **Un modale che si apre DOPO il velo di caricamento deve stare sopra il velo.** `#loading-overlay`
    è a **9999** (`style.css` §9): qualunque finestra aperta più in basso è invisibile e non
    cliccabile, e se qualcuno la sta aspettando resta lì per sempre. Il ripiego degli overlay a mano
    di `live-classes` è ora **10050**, e un test legge i due numeri dal codice e fallisce se il
    modale ridiscende sotto (`tests/bento-composizione.test.js`). Prima di cambiare uno dei due:
    controlla l'altro.
14. **Un `await` su una promise che nessuno risolverà non esegue il `finally`.** Il flag
    `Pipeline._running` è rimasto `true` per cinque ore, e da quel momento **ogni** avvio moriva
    sulla guardia con un toast che il velo copriva: sembrava che l'app ignorasse i clic. Quando una
    funzione «non fa più niente» senza errori in console, cerca un lucchetto rimasto chiuso — e
    ricorda che un flag in memoria si azzera solo ricaricando (Cmd+R).
15. **Se una diagnosi non spiega TUTTI i sintomi, è incompleta.** Il primo giro spiegava la 4ª (tre
    materie → modale) ma non la 1ª (una sola materia → nessun modale). Il secondo sintomo veniva dal
    lucchetto del punto 14, che era la conseguenza del primo difetto — e senza cercarlo avremmo
    corretto lo z-index lasciando l'app inutilizzabile fino al riavvio.

---

## 7. Come si rigenerano gli strumenti

Per **provare l'app vera** (e non un banco), il debug remoto di Chromium:

```bash
npx electron . --remote-debugging-port=9222
```

Da lì `Runtime.evaluate` misura, `DOM.setFileInputFiles` mette un PDF vero nel campo file (il
dialogo nativo non si pilota) e `CSS.getMatchedStylesForNode` dice **quale regola vince**.
`Page.reload {ignoreCache:true}` è obbligatorio dopo ogni modifica a CSS/JS: altrimenti si misura
il codice di prima (§6.8).

```bash
node tools/officina/build.js      # officina, compresa §7 (bento)
node tools/atlante-ui/cattura.js  # solo se cambiano le console INSEGNA/Cabina
node tools/atlante-ui/build.js    # atlante
```

Pagine: `public/dev/officina.html#bento` · `public/dev/atlante-ui.html` ·
`public/dev/costruisci-harness.html`. Si servono con un http server statico su `public/`
(`.claude/launch.json`, porte 8145-8148) — **mai** aprire `file://`.

---

## 8. La prova in Electron (4 agosto 2026)

Fatta guidando l'app vera con il **debug remoto di Chromium** invece che a occhio:
`npx electron . --remote-debugging-port=9222`, poi `Runtime.evaluate` per misurare,
`DOM.setFileInputFiles` per mettere un PDF VERO nel campo file (il dialogo nativo non si può
pilotare) e `CSS.getMatchedStylesForNode` per sapere **quale regola vince davvero**. Senza
quest'ultima non si trova la causa dei difetti di cascata: si tira a indovinare.
Viewport 1470×891, licensing regolare (`#beta-lock-screen` a `display:none` da sé), **0 errori
console**, suite **998/0/2** prima e dopo.

### Cosa funziona (misurato, non guardato)
- **Landing vuota**: rail delle tre forme verde d'invito (`manifesto-vuota`), mini-logo nascosto,
  cassetto insegnai visibile, chip **«4R · Scienze» vero** (43px), Cabina 43×43 tonda.
- **Scegliendo COSTRUISCI**: forma attiva viola `#ac72fe`, le altre due neutre `#f1f4f8`, marchio
  e cassetto via, mini-logo 54×54. `mappai_landing_mode` scritto.
- **PDF vero**: `The_Use_of_Mindmap….pdf` → estratto, **15.178 token** contati, tabella file con
  nome e **465 KB**, 3 `<col>` = 3 `<th>` = 3 `<td>` (regola §10.15), nessuno sbordo.
- **Bento**: 7 moduli veri + i 2 campi nascosti; `mp-class` porta la **classe attiva vera**,
  `mp-adapt-on` acceso; riquadri `#f1f4f8` su testo `#404040`, «Genera Mappa» `#3f6bf2`,
  «Genera materiali» `#41e6aa`; **tre corpi** (14/700 · 12/600 · 15/700) e nient'altro — i 19
  valori «fuori scala» che si contano scorrendo il DOM sono `<option>`, che il browser disegna
  da sé.
- **Etichetta che si rivela**: a riposo entrambi i Genera mostrano **la sola icona**; l'etichetta
  compare al passaggio col colore del segno. (La prima misura diceva il contrario: il puntatore
  era fermo sul bottone. **Sposta il mouse prima di giudicare uno stato.**)
- **Rail su una mappa aperta**: `display:none`, mini-logo idem. La mappa si apre e si disegna.
- **Vista ridotta + manifesto convivono**; spegnendola torna tutto (step 3 alto 539, tema 460).

### I due difetti trovati, e corretti
1. **Metà pagina bianca finché non carichi un file.** La riga delle fonti è sempre a due colonne
   `340px | 868px`: senza file la destra è vuota (**868×426 di bianco**) e i cinque bottoni si
   accalcano **due per riga** nei 340px di sinistra. Ora `_disegnaTabella` mette
   `mn-riga--sola` sulla riga quando non ci sono file → **una colonna**, i cinque bottoni in fila
   (238×130 ciascuno, come i tre avvii in fondo). Al primo file la riga torna `340 | 868` e i
   bottoni a 164 — verificato nei due versi.
   ⚠️ La prima stesura non vinceva: `auto-fill` restava perché la regola di partenza porta
   `#setup-form` e **un id batte tre classi**.
2. **48px di aria fra il tema e il bento, in vista ridotta.** Con la veste accesa `impagina`
   porta il campo del tema fuori da `#step-3-container`, che in vista ridotta resta **alto 0 ma
   consuma comunque il `gap` del form** (misurato: 96px fra il fondo del tema e il bento, di cui
   48 di troppo). Un item alto 0 conta come item: va tolto dal flusso.
   ⚠️ Due tentativi persi prima di trovarlo davvero: (a) `display:none !important` con **un solo
   id perdeva** contro `#landing-view .glass-card #setup-form > div:not(:last-child)
   {display:flex !important}` di style.css — l'ha detto `CSS.getMatchedStylesForNode`, non il
   ragionamento; (b) il commento che spiegava il perché era stato chiuso due volte, e **una
   `*/` di troppo fa scartare in silenzio la regola che segue**.

### Quello che ho visto e NON ho toccato (decisioni tue)
- **Il nome del file compare due volte, con due unità**: nella tabella «465 KB», venti centimetri
  sotto la riga della fonte dice «(0.5 MB) pronto». La riga è già rimpicciolita a 12px, ma
  ripete nome e peso. Toglierle nome e peso vuol dire cambiare il messaggio in
  `app.js:1100`, che è condiviso con la UI storica dove la tabella non esiste: è una biforcazione
  di comportamento, non una veste. **Come lo vuoi?**
- **In vista ridotta senza file il bottone «Documenti» ora è largo 1240** (com'era nella tua
  taratura del 3/8) e si stringe a 340 quando il file arriva. Se il salto dà fastidio, in vista
  ridotta si può tenere la colonna unica e mettere la tabella **sotto**.
- **Il centro di COSTRUISCI è ancora la pelle vecchia**: focus e lenti, «Impostazioni
  generazione» (toggle OFF/ON ambra, pillola «MappAI Adattiva»), «Analisi Documento & Stima
  Costi». In vista ridotta non si vedono — per questo non erano mai emersi. Nella vista piena
  stanno in mezzo fra due pezzi nuovi.
- **Il chip non c'è nella barra della mappa**: aperta una mappa, l'unico `.mm-ctx` è quello della
  landing (nascosto con lei).

---

## 9. Le CONSOLE in stile manifesto (4 agosto 2026)

Dal disegno `Inkscape/console cabina profilo insegnante.pdf`. **La console smette di essere una
finestra sopra l'app e diventa la schermata**: testata a tutta larghezza col marchio, e sotto — in
fila — il rail delle tre forme, la colonna, l'area. Fatte **Cabina** e **INSEGNA**; il resto delle
console eredita da sé, perché è tutta veste sulle stesse classi `.mm-*`.

**File nuovi**: `public/css/mappai-console-manifesto.css` (la cornice) e
`public/js/mappai-console-manifesto.js` (il poco comportamento che il CSS non può dare). Scoped
sotto `html.manifesto` e alle sole console a schermo pieno: i modali normali non cambiano, e il
kill-switch resta `mappai_stile_manifesto='0'`. Toccata una riga di `mappai-cabina.js` (via
l'intestazione «Io»).

**Quello che c'era già, e il disegno conferma**: riquadri chiari col titolo in maiuscoletto, pillole
lilla delle materie, «+ Aggiungi …» tratteggiato, nota di aiuto sotto il riquadro, azione conclusiva
in basso a destra, due colonne con «Ruolo professionale» a tutta riga. Non è stato ridichiarato
niente: il delta era la cornice.

**Quello che cambia**
- **Testata 78px**: pallino **viola 44px** col segno bianco + nome della console a **26px**.
- **Il pallino è l'uscita.** Al passaggio — e col **fuoco da tastiera** — diventa emerald e il segno
  si riduce a un puntino: la stessa inversione del bottone Cabina sulla landing. Misurato: fondo
  `#41e6aa` esatto, puntino `#0b0b0b` (12,3:1). La **× sparisce**: due uscite a due centimetri
  l'una dall'altra sono due modi di chiedersi quale sia quella giusta. `title` e `aria-label`
  passano sul pallino.
  ⚠️ Non nasce una seconda via d'uscita: il pallino porta `data-azione="__chiudi"`, che è la stessa
  che aveva la ×. Su una console `sporco` (la Cabina) ESC e pallino aprono la conferma «Uscire
  senza salvare?» — verificato, e il rail resta **sotto** quella conferma.
- **Il rail resta visibile**, e con una console aperta si spegne (il verde è un invito a scegliere
  una modalità: qui non si sta scegliendo). Lo spazio glielo lascia `--mnc-rail: 82px`.
- **Colonna** `#f1f4f8`, staccata dal bordo, con le intestazioni di gruppo. In Cabina il primo
  gruppo **non ha più intestazione**: «Io» in cima a una colonna vuota diceva meno di quanto
  costasse.
- **Maniglia**: bottoncino 34×34 con l'icona del pannello (`panel-left-close`/`open`), non più la
  linguetta col chevron. La navigazione parte 56px più in basso, così la prima voce non le finisce
  sotto (misurato: si sovrapponevano di 2px).
- **Tetto di larghezza `--mnc-max: 1240px`**, centrato — lo STESSO numero della landing. Vale per
  ogni figlio diretto dell'area, non solo per i riquadri: il tetto è della colonna di lettura, e se
  lo mettessi solo su alcuni pezzi una tabella accanto partirebbe da un'altra riga verticale. Su
  uno schermo largo restano fasce bianche ai lati — scelta di Giacomo.

**Due difetti trovati misurando**, entrambi corretti:
1. **Il rail spariva sotto la console.** Un numero fisso nel foglio non basta: il piano lo assegna
   il motore a runtime (`prossimoZ()` sale di 100 a ogni finestra) e la console si era aperta a
   12100 mentre il rail stava a 12050. Ora il JS **legge il piano vero** e mette il rail un gradino
   sopra — così resta sopra la console e sotto qualunque finestra aperta da lì.
2. **La maniglia finiva in mezzo alla colonna**: `left` di un elemento assoluto si misura dal bordo
   interno del contenitore e **ignora il suo padding**, quindi il posto lasciato al rail non veniva
   contato (centro a 272 invece che a 354).

**Misurato in Electron** (1704×1041, 0 errori console, suite **998/0/2**): Cabina — testata 78,
pallino 44 viola, titolo 26px, colonna a 82, rail sopra e spento, contenuto 1240 centrato, ESC e
pallino → conferma → chiusa, `man-console` e z-index del rail rimessi a posto. INSEGNA — stessa
cornice col chip in testata; scelta una mappa, 6 elenchi tutti a 1240 senza sbordi; aperto un
documento, la tela è 1240×898 centrata con la barra dei comandi sopra, allineata.

**Da decidere**
- **Il sottotitolo della testata è rimasto** (in Cabina «Il tuo profilo, il contesto di lavoro e
  l'AI»; in INSEGNA porta la mappa e il documento aperto). Nel disegno non c'è. L'ho tenuto perché
  in INSEGNA è l'unico posto dove si legge su che cosa si sta lavorando — toglierlo è una riga.
- **La tela dei documenti ora è capata a 1240** e non più da bordo a bordo (decisione del 2/8 per
  F2). Per un foglio da leggere la colonna è meglio del bordo-a-bordo, ma è un rovesciamento
  dichiarato: se lo vuoi indietro, è una riga.

**Round 2 (4/8) — dai tre rilievi di Giacomo sulla console.** Suite verde.
1. **Il pallino della testata è il bottone della CABINA, non il marchio della console.** Fuori dalla
   Cabina è **grigio `#f1f4f8` col puntino `#404040`** (9,4:1) e ci porta; al passaggio e col fuoco
   da tastiera diventa viola col puntino bianco — identico a `#btn-cabina` sulla landing, un solo
   comando con un solo aspetto in tutta l'app. **Dentro** la Cabina resta viola con la sua icona e
   cliccarlo esce (emerald + puntino al passaggio). Da una console non-Cabina si esce con **ESC** o
   scegliendo un'altra forma nel rail.
2. 🐛 **Il rail non marcava INSEGNA.** Entrando nella console la landing sotto viene messa su
   COSTRUISCI apposta — è dove si atterra CHIUDENDO la console — e quel dettaglio interno finiva
   dritto nel rail: la testata diceva «Insegna» e il rail «Costruisci», due comandi che dicono due
   cose diverse sulla stessa schermata. Ora **il rail dice dove sei**: chi apre una console scrive
   la sua sezione, e `modo()` la preferisce alla modalità della landing. Con la **Cabina** aperta
   nessuna forma è accesa — ed è giusto: la Cabina non è una modalità di lavoro, è il pallino.
   ⚠️ **La sezione sta sul VELO, non sul riquadro**: `ridisegna()` del motore costruisce un riquadro
   NUOVO e sostituisce il vecchio dentro il velo. Scritta sul riquadro spariva al primo ridisegno —
   e INSEGNA si ridisegna da sola appena finisce la scansione dei vault, quindi spariva sempre.
   Verificata anche la **pila**: da INSEGNA → pallino → Cabina sopra (nessuna forma accesa) → ESC →
   di nuovo INSEGNA col cubo acceso e il pallino di nuovo grigio.
3. **«In ELABORA il documento non apre l'editor» non è un difetto**: l'editor si apre (provato,
   aperto e modificato un mazzo di flashcard). Quella nello screenshot era la console **INSEGNA** —
   dove il documento si apre in **sola lettura**, con Stampa · QR · Finder, perché INSEGNA è la
   schermata da cui si porta in classe, non quella da cui si corregge. A far credere il contrario
   era il rail del punto 2, che diceva «Elabora».
   **Da decidere**: se le righe dei materiali in INSEGNA devono avere anche un comando **«Modifica»**
   che salta all'editor di ELABORA su quel documento.

⚠️ **Nota sul conteggio della suite**: `npm test` è `node --test` dalla radice, che scopre **anche**
`MappAI - misuratore/tests/*.test.js`. Il totale oscilla (1000 → 1019) perché alcuni test del
misuratore sono condizionati ai dati presenti su disco. Il numero che conta è **0 fail**; citare
«998» come se fosse una costante è fuorviante.

---

## 10. La generazione che non finiva (5 agosto 2026) — e le tre richieste che ne sono nate

Sezione da leggere per prima: **cambia il contratto del bento**.

### Il difetto, e perché è durato cinque ore

Giacomo: *«un'ora fa la stessa scheda assegnata a una 1ª media l'ha generata senza problemi, adesso
l'ho assegnata a una 4ª e non finisce».* Non stava processando: **aspettava lui**, dietro il velo.

Il registro consumi (`MappAI - file/Registro consumi AI/consumi-ai.jsonl`) è stato il testimone:
ultima chiamata alle 16:40, poi **zero token**. Quindi non «lenta»: mai partita.

La catena, per intero:

1. La classe **4R insegna tre materie**, la 1B una sola. Con 2+ materie `startGeneration` chiama
   `ensureGenerationContext`, che apre il modale «Per quale classe e disciplina?» **prima di spendere
   token**. Con una materia sola risolve da sé e non mostra niente — ecco perché la 1ª filava.
2. La pipeline «Genera materiali» alza `#loading-overlay` (**z 9999**) e **poi** chiama
   `startGeneration`. Il modale stava a **9992**: sette punti sotto. Invisibile, non cliccabile.
3. La sua promise non si è mai risolta → l'`await` non è mai tornato → il **`finally` di
   `Pipeline.run` non è girato** → `Pipeline._running` è rimasto `true`.
4. Da lì **ogni** avvio moriva sulla guardia di rientro, con un toast che lo stesso velo copriva:
   qualunque classe, anche la 1ª. Che è il secondo sintomo che Giacomo ha segnalato — e senza
   cercarlo avremmo corretto lo z-index lasciando l'app da riavviare.

**Corretto a due mandate**, perché una sola non basta:
- ripiego z-index **9992 → 10050** in `_zSopraMotore` (`mappai-live-classes.js`), con un test che
  legge i due numeri dal codice e fallisce se il modale ridiscende sotto il velo;
- `ensureGenerationContext` **non chiede più ciò che è già dichiarato**: se la materia attiva è fra
  quelle della classe, risolve subito. Un modale che non si apre non può restare appeso. Verificato:
  4R+Storia → nessun modale · 4R senza materia → modale (giusto: non c'è nulla da dedurre) · 1B →
  nessun modale.

⚠️ **Se ricapita**: `Cmd+R`. Il flag è in memoria, il reload lo azzera; nessun lavoro va perso
perché quel run non aveva prodotto niente.

### Le tre richieste, e come sono state messe a terra

**1. Il contesto entra nel bento, il chip esce da COSTRUISCI.** Box giallo con «Chi:» (classi *e*
allievi) e «Cosa:» (le materie di quella classe). Non portano campi nuovi alla pipeline: **scrivono
il contesto attivo**, da cui `_resolveFolderPath` e la taratura già leggono.
- allievo scelto → la materia è **facoltativa** (la sua cartella non ha quel livello) e `mp-class`
  si azzera, così la mappa va in `Allievi/<nome>/Mappe/`;
- una materia sola → **preselezionata**: non è una scelta, non si fa confermare;
- cambiando destinatario la materia cade **solo** se lui non la fa (regola già del chip);
- se il profilo non ha materie il gate **non le pretende**: bloccare su un dato che l'app non sa
  fornire sarebbe un vicolo cieco.

**2. Il gate del bottone.** Spento al 50% con `pointer-events:none` finché non c'è (classe+materia)
oppure (allievo), e il motivo in `title` **e** `aria-label` — su questa card l'etichetta si rivela al
passaggio, quindi da tastiera non ci sarebbe altro modo di saperlo. Il box giallo prende un bordo
ambra: «è spento» senza dire *dove guardare* è lo stesso buio dell'ora persa.
La regola è pura e testata: `MappAIBento.gate()`.

**3. Niente check «generici», e la catena diventa un materiale.**
- I master (`mp-quiz-on`, `mp-ns-on`) non stanno più a schermo: si **derivano** dai figli e vivono
  come `<input hidden>`. `_readConfig()` non cambia di una riga e il modale storico resta identico.
  ⚠️ Il corpo di una sezione con master derivato **non si nasconde mai**: è da lì che si riaccende.
- La **catena dei perché** esce da sotto i fogli nodi: chiave `causal` di primo livello, **step E**
  nuovo, PDF suo in `Materiale Studio/Catena-dei-perche.pdf` (A4 verticale, dallo **stesso** builder
  del documento a schermo e dell'editor ELABORA: una resa sola). Zero chiamate AI.
  ⚠️ `mp-ns-causal` **non è fra i derivanti** di «Fogli nodi», o spuntare la catena produrrebbe un
  PDF di fogli che nessuno ha chiesto. E il foglio nodi non se la porta più dentro (era
  `causal: true`): sarebbe stampata due volte.
  ⚠️ L'**id resta `mp-ns-causal`**, oggi fuorviante: è un id del DOM, e cambiarlo invaliderebbe i
  preset già salvati sulla macchina di Giacomo. `presetNormalize` legge la catena **anche** dal
  vecchio posto (`nodesheet.causal`), altrimenti chi l'aveva in un preset la perderebbe in silenzio.
- **Un bottone, due facce**: senza materiali diventa blu «Genera Mappa» → `startGeneration()`; con
  materiali è verde «Genera materiali» → pipeline. Il modulo blu affiancato è uscito dalla
  composizione e il validatore lo dichiara.
  ⚠️ Il blu ha bisogno di `!important` su fondo e variabili: lo stile del modulo è **inline** (scelte
  per-modulo dell'Officina) e batte qualunque regola non-important.

### Retro-compatibilità, la parte che non si vede

Lo schema del manifest resta `mappai-pipeline@1`, ma i file già su disco **non hanno la chiave E**:
`normalizeOnLoad` la riempie come `skipped`. Senza, `isComplete` leggerebbe `undefined` e ogni vault
già lavorato verrebbe riproposto come «pipeline da riprendere» a ogni apertura. C'è il test.

### Misure (pagina vera, 1440×900, DOM)

Bento 1236×380, quattro colonne da 299 · giallo 299×145 con testo a **9,16:1** · **21 testi, un solo
colore `#404040`** · tre corpi tipografici · nessuno sbordo · 0 errori console · **1063 pass / 0 fail**.
Provati i cinque stati del bottone, i cinque casi del box giallo e sei configurazioni lette
intercettando `Pipeline.run` (solo catena → `causal: true`, `nodesheet: —`, manifest `C skipped ·
E pending`).

⚠️ **Non verificato qui**: la vista d'insieme (screenshot bianco a pannello nascosto) e l'inglese
nella pagina — `en_translations` è una **const lessicale**, quindi un `eval` non la sostituisce e la
pagina serviva il dizionario dalla cache; le 15 chiavi sono state controllate valutando il file.

---

## 11. L'upload dei PDF, rifatto (5 agosto 2026, sera)

Giacomo: *«la procedura di upload dei file PDF è brutta».* Aveva ragione su tre livelli
sovrapposti, e il terzo era il più costoso: **due clic per aprire il Finder**.

### Le righe sopra il bento sono un DATO, e usano la sua griglia

Erano impaginate con due numeri scritti nel CSS — `340px | 1fr` — quindi «larghezza due
colonne» non voleva dire niente, non si poteva verificare e non si poteva ritoccare in
officina come tutto il resto. Ora stanno in **`MappAIBento.RIGHE`** e usano la **stessa
griglia del bento** (`repeat(4, 1fr)`, gap 14):

| riga | sinistra | destra |
|---|---|---|
| `mn-riga-fonti` | bottoni-fonte **2** | elenco dei file **2** |
| `mn-riga-genere` | Mappa/Knowledge Graph **1** | tema centrale *oppure* slider dei nodi **3** |

Misurato: `611 @134` + `611 @759` nella prima riga, `299 @134` + `924 @447` nella seconda —
e **le stesse coordinate** nel bento sotto. Le colonne si allineano attraverso le tre righe
invece di essere tre misure vicine e diverse. `validaRighe()` è un errore, non un avviso, se
gli span non chiudono le quattro colonne: resterebbe del bianco a destra, che è il difetto da
cui il dato è nato. `vuotoASinistra` = quanto prende la sinistra quando la destra non ha
ancora niente da dire (senza file i bottoni si distendono su 4).

Si vedono e si verificano nell'**Officina §7** (`public/dev/officina.html#bento`), riquadro
«Le righe sopra il bento», col verdetto per riga.

### Il Finder si apre al primo clic

Prima: clic su «Documenti» → compariva un riquadro con dentro un `<input type=file>` → secondo
clic su «Scegli file» → Finder. Ora il primo clic apre il Finder.
Si **avvolge `window.addSource`** invece di modificarla: è esposta su window, così ogni punto
che la chiama guadagna il comportamento e la funzione storica resta intatta.
⚠️ Il `.click()` va fatto **nello stesso task** del gesto dell'utente: il selettore di file
richiede una *transient activation*, che un `setTimeout` lascia scadere. Per questo non c'è
nessun rinvio. Vale per i tipi che aprono un file (doc · pdf · audio · video); su URL, YouTube
e testo il fuoco sul campo resta la cosa giusta.

### L'elenco dei file: alto come il bottone, e scorre

Era una `<table>` col contenitore del motore. Ora sono righe compatte **senza intestazione**:
il box è alto quanto il bottone accanto, e una fila «NOME FILE · DIMENSIONE» costerebbe un
quinto di quello spazio per dire ciò che un nome e un «33,1 MB» dicono da soli — e scorrendo
sparirebbe comunque. Il nome cede con l'ellissi (è l'unica parte di lunghezza imprevedibile) e
il titolo intero resta nel `title`.

Il **pallino di eliminazione** è un disco `#404040` con la × **bucata** — ritagliata nel disco
con `fill-rule="evenodd"`, non disegnata sopra: un tratto sopra sarebbe una seconda tinta da
scegliere e da tenere leggibile, un foro no. Il riflesso in alto a sinistra (ovale bianco al
22%) è ciò che lo rende «lucido»; su 20px un gradiente non si leggerebbe. 20×20, con un
margine di 4px dopo la dimensione.

⚠️ **Il difetto che ha richiesto due giri**: l'elenco è **posizionato** (assoluto in un
`#mn-files` relativo). Un contenitore con `overflow:auto` ha comunque l'altezza intrinseca del
contenuto, quindi **contribuisce a dimensionare la riga della griglia**: misurato, con otto
file il box cresceva a 230px e — per via di `align-items: stretch` — si trascinava dietro il
bottone accanto, invece di scorrere. Fuori dal flusso non pesa più: l'altezza la detta il
bottone (142px) e i file scorrono dentro. Verificato: 1 file → 142/142 senza scroll · 8 file →
142/142 con contenuto 248 e scroll attivo, ultimo file raggiungibile.

### MM/KG sempre visibili, e chi decide cosa si vede accanto

I due bottoni sono **sempre attivi** e impilati a una colonna: non sono più fra i passi
bloccati della vista ridotta (`PASSI` in `mappai-vista-ridotta.js`). Sbiadirli al 15% prima del
file faceva sembrare rotta metà schermata, mentre scegliere il genere di mappa prima di caricare
la fonte è legittimo e non costa niente. Il gate resta su ciò che spende: i bottoni che generano.

Accanto, nello stesso posto, il **tema centrale** (MindMap) o lo **slider dei nodi** (KG) —
due facce della stessa domanda, quindi lo stesso spazio: passando da MM a KG la pagina non salta.
⚠️ **Chi decide è `window.setMode`** (`mappai-ui-canvas.js`), la funzione vera che i due bottoni
già chiamano e che imposta anche `style.display`. La prima stesura faceva il lavoro da sé con un
toggle di classe e all'avvio il tema restava nascosto: qualcuno metteva `hidden` **dopo** il
montaggio del bento, e un toggle girato una volta sola aveva già perso. Delegare risolve il
conflitto alla radice invece di rincorrerlo; `setMode` è idempotente, quindi si chiama per
normalizzare lo stato senza effetti collaterali (una volta al montaggio, una come rete differita).
Verificato: MM → tema 924×94 · KG → slider 924×134 · ritorno a MM → tema di nuovo.

### I tre rilievi sugli screenshot (5/8, subito dopo)

1. **Altezza modulare.** Il bottone di caricamento era alto 130 e il modulo del bento 145: la
   colonna era modulare in larghezza e casuale in altezza. Ora c'è **un token**,
   `--mn-h-modulo: 145px`, usato dal bottone e dall'elenco dei file. Misurato: bottone **145** ·
   elenco **145** · box giallo **145**, e tutti e tre sulla stessa linea superiore (top 174).
   ⚠️ Il 145 è l'altezza REALE a cui viene un modulo che dichiara `altezza: 130` in `MODULI`
   (i 130 sono il suo `min-height`, il resto è il padding del riquadro): due numeri legati da una
   MISURA, non da un calcolo. Se si cambia `altezza` nella composizione, va rimisurato — il box
   giallo è il riferimento.
   Trovato strada facendo: il **contenitore** dei bottoni misurava 157 (padding 4 sopra e 8 sotto),
   quindi il bottone partiva 4px più in basso dell'elenco accanto → `padding: 0`.

2. **Il vecchio riquadro della fonte non si vede più.** Cliccando «Documenti» si apriva il Finder
   (giusto) e insieme compariva il riquadro con «Scegli file» e il nome del documento: la stessa
   cosa detta due volte, la seconda in una veste che non è più questa.
   ⚠️ **Nascosto, non rimosso**: l'`<input type=file>` vive lì dentro, è quello che il Finder
   riempie e che `handleFileUpload` legge. Un input `display:none` riceve `.click()` e apre il
   selettore (verificato: 1 apertura, input ancora nel DOM). Togliere l'elemento romperebbe il
   caricamento.
   Restano **visibili** le fonti che un campo lo richiedono davvero: verificato in vista piena —
   le tre righe di tipo file marcate e invisibili, URL e testo libero visibili coi loro campi.
   La classe `mn-src-file` la mette il wrapper di `addSource`.

3. **L'elenco appare solo dopo il primo file** — era già così, ora verificato ai due estremi:
   senza file l'elenco è alto 0 e i bottoni prendono **4 colonne** (1236px); al primo file
   l'elenco è **611×145** e i bottoni scendono a **2 colonne** (611px).

### Il MEGA-BENTO: un passo solo, moduli tutti uguali (5/8, terzo giro)

Quattro richieste di Giacomo che sono in realtà una: COSTRUISCI deve leggersi come
**una griglia**, non come quattro blocchi accostati.

1. **La prima fase ha bottone ed elenco da subito** (2+2), anche a elenco vuoto.
   Rovescia la scelta del 4/8 (`vuotoASinistra` da 4 a **2**): la colonna distesa
   faceva cambiare forma alla riga nel momento in cui si caricava il primo file.
   La leva resta nel dato, non nel CSS.
2. **MM/KG sono l'ECCEZIONE dichiarata**: lì l'altezza modulare non è del singolo
   bottone ma del GRUPPO — due bottoni **più lo spazio in mezzo** in 145px
   (misurato 66 + 14 + 66). I bottoni si dividono quello che resta con `flex: 1`,
   invece di avere un'altezza scritta a mano da ricalcolare a ogni ritocco del token.
3. **Il box del genere è un riquadro del bento**: fondo e bordo `#f1f4f8`, raggio 22,
   3 colonne, 145 di altezza, testi `#404040`, e dentro **solo i tre corpi della
   scala** (14/700 · 15/700 · 12/600) sia col tema centrale sia con lo slider.
   Due pezzi ci erano rimasti fuori e li ha trovati la misura: `#kg-nodes-val` a
   **21,6px** (un quarto corpo che nessuno ha deciso → token dell'azione) e
   `#label-step4-kg-desc` a `#94a3b8`, che su quel fondo fa **2,5:1** — non si legge.
4. **Un solo passo verticale** (`--mn-gap`, 14px): lo stesso fra le colonne di una
   riga e fra una riga e l'altra. Prima le sezioni erano a 40px e le colonne a 14.
   La «sottile linea orizzontale» sotto MM/KG era il bordo superiore di
   `#generation-details-card` — un rettangolo `bg-slate-100` quasi dello stesso
   colore dei moduli, di cui si intravedeva solo il limite: togliendo fondo e
   imballaggio sparisce, e i moduli si allineano alle righe sopra.
   Spenti anche i **titoli numerati di passo**: fra le righe del mega-bento erano
   due righe di testo che rompevano il ritmo.

**Esito misurato**: sei moduli su sei a **145** (bottone upload · elenco file ·
gruppo MM/KG · box genere · giallo · i tre avvii, che erano l'unico 130 rimasto),
passi **14 · 15 · 14** (il 15 è un mezzo pixel), colonne allineate a `299 @134` e
`924 @447` attraverso tutte le righe, nessuno sbordo.

⚠️ **Restano a 221 i moduli Quiz e Fogli nodi** della prima riga del bento: il loro
contenuto (cinque voci) non entra in 145. Se li si vuole modulari anche lì, la leva
è la composizione — meno voci per riquadro, non un'altezza forzata che li farebbe
scorrere.

⚠️ **Le tre trappole di questo giro, tutte già in §6**: un `padding` con **un id
solo** non vince contro `#landing-view .glass-card #…` (il contenitore del bento
conservava 28,8px di padding-top, quindi il passo vero era 43 e non 14); un
`#sources-container` alto ~0 **consuma comunque il gap** del suo wrapper (via dal
flusso, non rimpicciolito); e il gap fra i due bottoni del genere perdeva contro
`#setup-form .mode-buttons-container`.

### I due residui, e la lezione che si ripete (5/8, quarto giro)

1. **La linea era ANCORA là**, e il motivo è istruttivo: `#generation-details-card`
   porta `border-top: 1px rgba(199,210,254,.4)`. La dichiarazione `border: none`
   stava nella regola con **un id solo** — che perde — mentre quella con due id, che
   vince, non la portava. Due regole per lo stesso elemento e la proprietà giusta
   nella metà sbagliata: il difetto sopravvive a un `!important` scritto altrove.
   Trovata **cercandola col DOM** (ogni elemento largo >200px con un bordo visibile
   nella fascia fra le due righe), non a occhio.
   Effetto collaterale utile: sparito quel bordo, il passo «15» diventa **14** — il
   pixel in più era il bordo, non un arrotondamento.

2. **Passando da MM a KG la spaziatura cresceva di 14px.** In Knowledge Graph la
   vista ridotta riaccendeva `#step-gen-settings-container`, che dopo lo spostamento
   dello slider dentro `#mn-genere-dx` **non ha più niente da mostrare**: un
   contenitore alto ZERO che consuma comunque il gap del form. È la **terza volta**
   che questa trappola si presenta in questo lavoro (il campo del tema il 4/8,
   `#sources-container` stamattina, questo ora).
   Il fix non è «non riaccenderlo mai», che romperebbe la vista ridotta con la veste
   spenta (là lo slider è ancora suo): si riaccende **solo se lo slider è ancora
   dentro** (`box.contains(slider)`). La condizione guarda il DOM invece di
   presumere una configurazione.

**Esito**: passi **14 · 14 · 14** identici in MindMap, in Knowledge Graph e al
ritorno; zero bordi residui in entrambe le modalità; box del genere 145 in entrambe,
col tema o con lo slider, senza sbordare; 0 errori console.

⚠️ **Trappola di misura, di nuovo**: il primo giro di verifica diceva che il fix non
funzionava. Il file sul server ce l'aveva (`fetch` con `cache:'reload'`), la **pagina
eseguiva la versione in cache**. Serve una navigazione forzata prima di credere che
una correzione non abbia avuto effetto.

### Gli STRUMENTI: le funzioni nascoste diventano componibili (5/8, quinto giro)

La vista compatta lascia a schermo la strada breve e nasconde il resto. Quelle
funzioni non erano sparite: erano **irraggiungibili e non discutibili**, perché
vivevano solo in un blocco di nascondimenti CSS. Ora sono **19 voci
dell'inventario**, in quattro gruppi, e si compongono in officina come ogni altra:

| gruppo | voci |
|---|---|
| **Fonti** (4) | Link web · YouTube · File audio · Testo libero |
| **Contenuto** (5) | Macro-aree a mano · Focus specifico · Lenti · Disciplina · Adatta al livello |
| **Motore** (6) | Multi-pass · Logica della profondità · Profondità automatica · Genera fino a · Pipeline A/B · Stima token e costi |
| **Apri** (4) | Apri Vault · Apri JSON · Analisi (docente) · Dev self-test |

**Il modulo accoglie l'ELEMENTO VERO**, spostato dal suo posto nel form: non una
copia. Un toggle clonato sarebbe un secondo controllo per lo stesso stato, che
divergerebbe al primo clic — la stessa ragione per cui il tema centrale e lo slider
sono stati spostati, non ridisegnati. Verificato: cliccando un bottone-fonte dentro
il bento parte `addSource('youtube')`, cioè la funzione vera.
⚠️ Conseguenza da sapere: l'elemento esce dal suo posto storico **anche nella vista
piena**. Una casa sola per ogni controllo.

**Come restano modulari.** Gli elementi arrivano con la taglia del posto da cui
vengono (un bottone-fonte è una card da 130 con l'icona a 44): dentro un modulo
diventano **righe da 30px**, icona 16, etichetta sempre a vista — nascondere il
testo aveva senso su una card grande, non su una riga. E il modulo ha un **tetto**:
il corpo scorre invece di far crescere il riquadro.
Misurato con due box da 2 colonne e nove strumenti: **tutte le altezze a 145** (un
solo valore distinto in tutto il bento), i due box scorrono (237 e 298 di contenuto
in 78 visibili), **tre corpi tipografici** e nient'altro, nessuno sbordo.

**Nell'Officina §7**: inventario **raggruppato** (19 voci in un elenco piatto erano
un muro), anteprima che mostra il posto con nome e selettore — il banco serve a
decidere *dove* va una funzione, non a simulare il controllo.

⚠️ **Tre trappole di questo giro**:
1. **Ricorsione infinita silenziosa.** Il ramo «strumento» di `pezzo()` rimandava a
   `pezzo()` con un id finto, che rientrava nello stesso ramo. Effetto: il bento
   **non si montava affatto** e in console non c'era niente — lo stack esplodeva
   dentro un `try`. Il sintomo era «zero moduli», la causa a tre righe di distanza.
2. **`height` fisso ≠ altezza modulare.** Include il padding: un modulo-strumento
   veniva 130 contro i 145 dei vicini. Col padding pieno (`+36`) veniva 166. Il
   numero giusto è lo **scarto** fra altezza dichiarata e reale (**+15**), che è lo
   stesso già scritto nel token `--mn-h-modulo`.
3. **Un elemento spostato si porta dietro il suo nascondimento**: le regole di
   `.mappai-ridotta` lo spengono con `display: none !important`, e dentro il bento
   resterebbe montato e invisibile — il peggio dei due mondi. Serve dichiarare un
   display dentro `#mn-bento`.

### La VISTA ESTESA: i box nascondibili sotto il mega-bento (5/8, sesto giro)

Composizione di Giacomo adottata come default. La combo **SHIFT+CTRL+L,K,J,H** non
riduce più: **rivela**. Il mega-bento è identico nelle due viste, e i box extra
compaiono sotto.

**Il marcatore è il FONDO, non un flag**: un modulo col fondo scuro del progetto
(`#404040`, cioè `STILE_BASE.bg`) è nascondibile — lo dice `MappAIBento.nascondibile()`.
Così la distinzione si **vede** mentre si compone in officina: un riquadro scuro fra
quelli chiari è già la sua etichetta. Chi vuole rendere stabile un box gli dà un
fondo chiaro. Nell'Officina ogni modulo porta ora il bollino
«● sempre a schermo» / «◐ solo nella vista estesa».

| | moduli |
|---|---|
| **stabili** (mega-bento) | preset · quiz · fogli nodi · fonte&sintesi · contesto giallo · azione |
| **extra** (vista estesa) | Modalità · FOCUS · INPUT · fonti caricate |

**Il box delle fonti caricate** accoglie `#sources-container`, cioè i campi VERI:
premi «URL» nel box INPUT e il campo per incollare compare lì accanto. È l'unico che
può **crescere**: misurato, vuoto 150px → 10 righe 312 → **oltre le 30 righe si
ferma a 540 e scorre** (30 × 1,5 × 12px, dichiarato in righe e non in pixel). Ha uno
stato vuoto che dice a che serve, invece di essere un rettangolo scuro muto.

**Il mega-bento è immobile**, ed è la cosa che andava dimostrata: `492 · 727 · 174`
identici in compatta, in estesa e al ritorno; con e senza un testo di 60 righe
incollato, le distanze restano **14 · 14 · 14** e l'altezza 698. Il box che cresce è
l'ultimo della composizione — c'è un test che lo pianta, perché se domani finisse in
mezzo un testo lungo spingerebbe giù tutto.

⚠️ **Due difetti trovati misurando, entrambi «ricompare qualcosa uscendo dalla vista
compatta»**:
1. **I contenitori RESIDUI del form.** Spostato uno strumento nel bento, il
   contenitore che lo ospitava resta vuoto ma vivo: in compatta è spento dal blocco
   dei nascondimenti, in estesa **ricompariva** e il mega-bento scendeva di 364px.
   `svuotaContenitoriResidui()` li spegne guardando se è rimasto qualcosa di
   visibile dentro — una condizione sul contenuto, non un elenco di id: se una voce
   NON viene montata nel bento, il suo contenitore ha ancora qualcosa da mostrare e
   resta dove serve.
2. **La stima dei costi vive DENTRO il guscio del bento** (`#generation-details-card`),
   sopra la griglia: in estesa ricompariva e spingeva giù il mega-bento di 161px.
   Ora in quel guscio non ci sta niente oltre al bento
   (`> *:not(#mn-bento)`) — regola generale di proposito: se una di quelle cose serve,
   si monta nel bento dall'officina, e allora non è più figlia diretta. Il posto di
   un pezzo lo decide la composizione, non l'ordine del markup.

⚠️ Corretto anche nel JSON rimandato: `mp-class` nel box giallo → **`mp-chi`** («Chi»
elenca classi **e allievi**; `mp-class` è solo le classi, ed è il campo che il modulo
monta nascosto per la pipeline), e il testo sul verde da `#ffffff` a `#404040` — terza
volta.

### Le altezze dei box neri, e il campo che mentiva (5/8, settimo giro)

Giacomo: *«aumenta l'altezza dei moduli come ho corretto nel json»*. Il JSON mandato
aveva però le **stesse** altezze del precedente (preset 130, Modalità 60, gli altri
nessuna). Prima di applicare qualcosa ho verificato perché — e il difetto era nel
banco, non nell'export.

**Il campo «h» è un'altezza MINIMA e non lo diceva.** Misurato sul modulo Quiz, alto
277 per il suo contenuto: `180` → nessun effetto · `260` → nessun effetto · `300` →
funziona. Giacomo ha alzato i numeri, non ha visto muoversi un pixel e ha concluso che
il banco perdesse il dato; l'export era corretto dall'inizio.
Ora accanto al campo c'è l'**altezza reale** letta dall'anteprima, e diventa **rossa**
quando il minimo è inefficace: `preset: min=130 (reale 277) ← AVVISO`. Resta un minimo
di proposito — imporre l'altezza taglierebbe il contenuto.

**La richiesta vera**, chiarita: i **box neri** (quelli della vista estesa) alti come
il box giallo. Il giallo misura **145** — `altezza: 130` dichiarata più il padding, che
è il numero del token `--mn-h-modulo`. Tutti e quattro dichiarano ora 130.

⚠️ **Due difetti trovati applicandola**:
1. **In un riquadro largo le voci stavano incolonnate.** «Modalità» è larga 4 colonne
   (1236px) e le sue quattro voci si impilavano, quindi il corpo scorreva con 1100px di
   spazio orizzontale vuoto accanto. Ora dentro un modulo-strumento le voci vanno in
   **griglia** (`auto-fill`, minimo 220px): Modalità e FOCUS stanno in una riga e non
   scorrono più. Un box a una colonna resta in colonna, dove 220px non ci stanno.
2. **Con le voci affiancate, «Modalità» scendeva a 130** mentre i vicini stavano a 145:
   il contenuto non arrivava più a riempire il modulo, e il `min-height` dichiarato
   (130) diventava l'altezza vera. Per un modulo-strumento il minimo è ora
   `altezza + 15` — lo stesso scarto del token — quindi 130 dichiarati fanno 145 reali,
   uguali al giallo per costruzione.

**Esito misurato**: box neri **145 · 145 · 145 · 145** (identici al giallo), Modalità e
FOCUS su 5 colonne senza scorrere, il box delle fonti larghezza piena (884 su 924, il
resto è padding) che parte da 145 e **cresce fino a 540 = 30 righe** poi scorre, gli
altri tre restano a 145 mentre lui cresce. Nessuno sbordo, 0 errori console.

⚠️ **Trappola di misura, la più insidiosa di oggi**: `navigate` con `force: true`
ricarica l'HTML ma **non i sub-resources**. Il foglio di stile sul server aveva la
regola nuova (`fetch` con `cache:'reload'` lo confermava) e la pagina eseguiva quello
vecchio: la griglia sembrava non applicarsi. Prima di dire che una regola non funziona,
confronta il file SERVITO con quello CARICATO — `document.styleSheets` sa dire se una
regola è davvero nel foglio in uso.

### L'Officina riparte dal codice quando il codice cambia (5/8, ottavo giro)

Richiesta: *«aggiorna l'officina impostando tutto il bento come è adesso»*. Il banco
salva il lavoro in `localStorage` e al caricamento lo preferisce al file — giusto
finché si compone, **sbagliato quando la composizione del codice è cambiata sotto**:
si continuava a ritoccare una versione vecchia senza saperlo. È la stessa forma del
difetto del campo «h»: lo strumento non diceva una cosa che sapeva.

**La FIRMA** (`MappAIBento.firma`) è un hash corto di ciò che è STRUTTURA: id, ordine,
span, altezze, voci. **Non** cambia per i colori, che si ritoccano di continuo e non
sono struttura — c'è un test per entrambe le metà. Al caricamento: firma salvata ≠
firma del file → si riparte dal file.

⚠️ **Il lavoro in corso non si perde**: finisce in `mappai_bento_layout_precedente` e
un avviso ambra offre «Riprendi il lavoro precedente» oppure «Va bene, scartalo».
Perdere in silenzio quello che qualcuno ha composto sarebbe peggio del problema che
questa regola risolve.

**Verificato, seminando uno stato vecchio senza firma**: avviso mostrato col motivo
giusto · i dieci moduli a schermo sono **quelli del file** · il vecchio messo da parte
· «Riprendi» lo riporta e svuota la copia · «Torna alla composizione di partenza»
riporta al file · un'altezza composta dopo sopravvive al ricarico **senza** avviso
(firma coincidente). 0 errori console.

Corretto anche il percorso indicato nella pagina: il JSON va incollato in
`public/js/mappai-bento-composizione.js`, non in `tools/officina/`.

⚠️ **Trappola di misura**: un `.click()` programmatico **non risponde ai dialoghi**.
«Torna alla composizione di partenza» sembrava rotto: era il suo `confirm()` che
tornava falso. Stubbato `window.confirm`, funziona. Non è un difetto del codice — è
un difetto della verifica, e vale per ogni bottone che chiede conferma.

### Trappola nuova, e istruttiva

**Il markup dell'officina vive in un template literal di `build.js`**: un backtick o una
interpolazione dentro un commento HTML **chiude la stringa a metà** e il build muore con un
errore di sintassi in una riga di prosa. Ci sono cascato due volte di fila — la seconda
scrivendo l'avvertimento stesso.

⚠️ **Non verificato**: la vista d'insieme (a pannello nascosto lo screenshot esce bianco) e il
caricamento di un PDF **vero** dal Finder — nel browser i file sono iniettati con
`DataTransfer`, e pdf.js li rifiuta perché sono byte a zero (`InvalidPDFException` in console:
sono i file finti, non il codice). Da provare in Electron.


---

## 12. PUNTO DI RIPRESA — 5-6 agosto 2026, fine sessione

Suite **1120 pass / 0 fail / 5 skip** (`npm test`). Branch `feature/vista-studio`,
**nulla committato** (102 file toccati fra questa sessione e quelle prima).
Zero errori console in tutte le verifiche.

### ▶ DA DOVE SI RIPARTE (6 agosto)

1. **L'officina delle console** (`public/dev/officina-console.html`) è il posto dove
   si lavora adesso: si compongono le aree **F1 · F2 · D1** con i parametri divisi
   per gerarchia (globale → vista → riquadro → voce). Serve la composizione buona
   PRIMA di montare.
2. **Poi si montano**, in quest'ordine: la console **Documento (F1/F2)** — con
   percorso al posto del titolo, comandi nella colonna, nessuna sotto-barra, nessun
   «Chiudi» — e la console **Mappa (D1)**, che sostituisce il menu radiale e i due
   modali hub.
3. **Il livello che manca nell'officina** (proposto, non fatto): gli **STATI** —
   voce attiva e al passaggio, campo a fuoco, riquadro disabilitato, elenco vuoto,
   tabella che scorre. Oggi si compone lo stato di riposo e gli altri si scoprono in
   uso. Più il **tema del riquadro in un clic** (chiaro · scuro · accento) invece di
   due color picker, coi contrasti già garantiti.
4. **La caccia ai pezzi fuori token** è già cominciata da sola: la riga delle misure
   dell'officina marca in ambra le coppie corpo/peso che la scala non dichiara —
   oggi **2**, dalla tabella del motore dentro un riquadro scuro.
5. **Da provare in Electron** (niente di questa sessione ci ha girato): il lampo
   della vecchia UI all'avvio (dovrebbe essere sparito), la barra con percorso e
   chip dentro INSEGNA con vault veri, «Adatta» con una classe attiva, il ciclo
   auto→manuale della profondità in una generazione vera.

### Dove siamo, in una frase

COSTRUISCI è un **mega-bento** di **sette righe**, tutte a quattro colonne: quattro
sempre a schermo (upload · genere · le quattro card delle opzioni · contesto e
azione) e tre che la combo SHIFT+CTRL+L,K,J,H rivela (Modalità+FOCUS · INPUT+elenco
delle fonti · Testo). Tutto è modulare — un solo passo (14px), tre corpi tipografici
— e la **composizione è un dato** in `public/js/mappai-bento-composizione.js`, che si
compone nell'**Officina §7** (`public/dev/officina.html#bento`): lì si decide dove va
ogni opzione, che aspetto ha il riquadro, come si dispongono le voci, che pop-up
porta ciascuna e se il posto scrive il proprio titolo o lo lascia dire al pezzo.

### Gli otto giri del 5/8, in ordine

| § | cosa |
|---|---|
| §10 | la generazione appesa 5 ore (modale sotto il velo) · contesto nel bento · master derivati · catena dei perché indipendente |
| §11 | upload rifatto: Finder al primo clic · righe a griglia · elenco file che scorre |
| §11 | mega-bento: passo unico, moduli a 145, la «linea» che era un bordo |
| §11 | vista estesa: box neri, il box fonti che cresce fino a 30 righe |
| §11 | strumenti: le 19 funzioni nascoste diventano componibili |
| §11 | altezze dei box neri = box giallo; il campo «h» che mentiva |
| §11 | Officina: la FIRMA della composizione (riparte dal codice quando cambia) |
| §12 | contrasto sui box neri: **1:1 → 6,79:1** (vedi sotto) |
| §12 | **controlli granulari per box** nell'Officina: colori dei bottoni interni · etichette · disposizione delle voci (vedi sotto) |
| §12 | la PRIMA SEZIONE entra nella composizione (upload · elenco · genere · opzioni) come moduli **nudi** |
| §12 | i due box delle fonti: elenco compatto + area di scrittura che cresce fino a 30 righe |
| §12 | i box senza titoli · pop-up su tutto (950ms) · gli switch montati INTERI |
| §12 | i comandi di Modalità e FOCUS: righe «etichetta · comando», chip+pallino, i default, le Lenti che si vedono |
| §12 | il box **Macro-aree** col suo toggle «in automatico» (e il contenitore sbagliato che montavo) |
| §12 | la composizione finale: quasi nessun titolo del posto — il nome lo porta il pezzo |
| §12 | i **box scuri**: il nero ai bordi, i chip chiari, la faccia attiva verde · «Profondità» a due facce |
| §12 | la **barra in alto**: pallino · chip · nome della sezione; i bottoni che scambiano icona e testo |
| §12 | il **lampo** della vecchia UI all'avvio: classi in `<head>` + velo `mn-boot` con tre reti |
| §12 | **briciole**, **finestra di salvataggio** e rail che segue la colonna (i pezzi delle console) |
| §12 | l'**officina delle console**: il bento delle aree, la finestra vera, i parametri per gerarchia |

### L'ultimo difetto chiuso: i bottoni invisibili sui box neri

Segnalato da Giacomo: *«sui box neri non sono leggibili se non in hover»*. Causa mia:
avevo scritto `color: var(--man-su-verde)` (#404040) sugli elementi spostati, quindi
dentro un box **#404040** il testo aveva **il colore del fondo — 1:1**.
Corretto con `color: inherit`: il colore lo decide il MODULO (bianco sui neri, scuro
sui chiari), e i riempimenti si ricavano da `color-mix(currentColor 14%)` invece di
essere un grigio fisso che su fondo scuro sparisce. Misurato: **6,79:1** (bianco su
fondo composito #5b5b5b). Al passaggio il fondo diventa verde e il testo torna scuro —
regola del 3/8, altrimenti si sposterebbe il difetto invece di risolverlo.

### ✅ FATTO (5/8, nono giro): i controlli granulari per box nell'Officina

Le quattro leve chieste da Giacomo. Tutte nel DATO
(`mappai-bento-composizione.js`), nessuna nel foglio: il CSS legge, l'officina
compone, il validatore dice cosa costa. Suite **1090 pass / 0 fail / 5 skip**.

| leva | dove sta | come si vede |
|---|---|---|
| **colori dei bottoni interni** (fondo · testo · fondo e testo al passaggio) | `m.bottoni` | 4 selettori + **due badge di contrasto**, a riposo e al passaggio |
| **posizione delle etichette** (a sinistra / sopra) | `m.layout.etichette` | tendina |
| **colonna che allinea i campi** (px) | `m.layout.etLarghezza` | campo px |
| **disposizione delle voci** (auto · in colonna · 1-6 per riga) + **larghezza minima di colonna** | `m.layout.colonneVoci` · `colMin` | tendina + campo, con **la larghezza che ne risulta** scritta accanto (rossa sotto 120px) |

**La regola che tiene insieme tutto**: si emette **solo ciò che è stato scelto**.
`presentazione(m)` — una funzione sola, che usano l'app *e* l'anteprima
dell'officina — restituisce le variabili e gli attributi da scrivere sul riquadro;
un modulo senza scelte non porta né gli uni né gli altri, e le regole nuove sono
agganciate a un ATTRIBUTO (`data-btn`, `data-et`, `data-voci-n`), quindi **non lo
incontrano nemmeno**. Verificato: con la composizione del file, `conAttr = 0` e
tutte le misure restano quelle del 5/8 (moduli 221×4 e 145×6, griglia a 232px,
bottoni sul fondo derivato, nessuno sbordo).

**Il contrasto si misura sul fondo che si VEDE.** I bottoni dentro un modulo non
hanno un fondo proprio: il foglio ne mette uno al 14% del colore del testo. Quindi
«testo sul fondo del riquadro» sarebbe un numero che a schermo non esiste. Nuova
`componi(fondo, tinta, %)` — pura, testata: bianco al 14% su `#404040` dà
**`#5b5b5b`**, che è il fondo composito già misurato ieri. È quello il numero che
il badge mostra, ed è il motivo per cui il difetto dei bottoni a **1:1** poteva
passare inosservato: nessuno strumento lo calcolava.

**Cinque cose che il validatore dice adesso**: bottoni illeggibili a riposo ·
illeggibili **al passaggio** (l'hover non deve spostare il difetto, deve
risolverlo) · una colonna di voci sotto i 120px, col numero · una colonna delle
etichette dichiarata con le etichette *sopra* (non ha dove allinearsi) · un minimo
di colonna dichiarato con le colonne *fissate* (non ha effetto).

**Il layout entra nella FIRMA, i colori dei bottoni no**: la disposizione decide
quante voci stanno per riga, quindi è struttura; una tinta è un ritocco. Stessa
regola già valida per fondo e testo del modulo.

⚠️ **Difetto trovato nel banco, e non piccolo**: **l'anteprima dell'Officina non
riceveva le regole nuove.** Il foglio ha due famiglie di selettori — le vecchie
partono da `.manifesto` (e la classe sul contenitore bastava), tutte quelle scritte
dal 5/8 in poi da **`html.manifesto`**, e l'`<html>` dell'officina non aveva la
classe. Conseguenza: il banco mostrava una disposizione delle voci **che a schermo
non esiste** — cioè esattamente quello che un banco serve a non far succedere.
Ora la classe sta sul tag HTML (verificato innocuo: gli 81 campioni `.mm-*` delle
altre sezioni non cambiano di un pixel) e l'anteprima porta anche le classi
`mn-card--str` / `--cresce` che mette l'app.

⚠️ **Secondo difetto, trovato misurando**: con le etichette **sopra**, il
`flex-basis` della colonna diventa un'**altezza** — l'etichetta veniva alta 90px.
Il validatore diceva già che la leva non ha effetto lì, ma «non ha effetto» deve
voler dire *niente*, non una resa rotta: la regola porta ora
`:not([data-et="sopra"])`.

⚠️ **La trappola dei backtick nel `build.js` è scattata di nuovo**, sempre allo
stesso modo: un commento HTML con un backtick chiude il template literal e il build
muore su una riga di prosa. Terza volta.

**Misurato nell'app vera** (1440×900, composizione di prova, poi rimossa): colonna
etichette 110px → i due campi del box giallo partono **entrambi a x=272** · box
FOCUS a 2 colonne (588,5 × 2) · box INPUT in colonna · bottoni del box «Modalità»
col fondo scelto (bianco/`#404040`) e **al passaggio blu `#3f6bf2` con testo
bianco**, provato col puntatore vero. 0 errori console.

**Aperto, e non è di oggi**: nel box **FOCUS** il pannello delle Lenti si porta
dietro i suoi corpi (10/600 ×12, 11/700 ×6, 13,2/400 ×1) — quattro corpi oltre i
tre della scala. La regola che uniforma i testi degli elementi spostati copre
`span`, `p` e `label`, e quelle pillole non sono nessuno dei tre. È una riga, ma
schiaccerebbe corpi che qualcuno potrebbe volere: **decisione tua**.

### ✅ FATTO (5/8, decimo giro): la PRIMA SEZIONE entra nella composizione

Rilievo di Giacomo: *«in officina vedo una cosa diversa da quella che vedo in app»*.
Aveva ragione, ed era strutturale: il bottone che carica i documenti, l'elenco delle
fonti, MM/KG e le sue opzioni erano impaginati da `RIGHE`, cioè **fuori dal dato**.
Il banco mostrava dieci moduli, l'app quattordici pezzi. Suite **1094 pass / 0 fail /
5 skip**, 0 errori console.

**Quattro moduli NUDI.** `nuda` non vuol più dire «è un bottone» (quello si deduce da
`soloAzioni`): vuol dire **senza riquadro**. Il fondo, il raggio e l'altezza modulare
ce li ha già il pezzo che il modulo accoglie; un secondo contorno costerebbe due
bordi, un imballaggio e 36px in più. Del modulo resta la sola cosa che è sua: quante
colonne occupa — 2+2 e 1+3, gli stessi span delle righe storiche, quindi
l'impaginazione a schermo **non cambia di un pixel**: cambia dove è scritta.

| | misurato nell'app (1440×900) |
|---|---|
| upload · elenco | `611 @134` · `611 @759`, **145** ciascuno |
| genere · opzioni | `299 @134` · `924 @447`, **145** ciascuno |
| passi verticali | **14 · 14 · 14**, un solo valore in tutta la griglia |
| bottone «Documenti» | fondo `#f1f4f8`, raggio 16, **icona 44px**, etichetta 15/700 — la sua veste, intatta |

⚠️ **Chi li toglie dalla composizione se li ritrova dove stavano**: `impagina()`
costruisce le due righe storiche **solo per i pezzi che il bento non ha preso**
(`nelBento()` lo chiede al dato). Senza, resterebbe un contenitore che aspetta un
pezzo che il bento si è preso — la trappola dell'item alto zero, per la quarta volta.

**L'elenco è UNO, per tutte le fonti** (decisione tua): PDF, link, YouTube, audio e
testo incollato, una riga ciascuno col pallino di eliminazione. Prima elencava i soli
file: chi incollava un URL non aveva un posto dove vedere che cosa stesse per dare in
pasto all'AI. Il **campo** dove si incolla resta nel box «Fonti caricate» — lì si
scrive, nell'elenco si vede l'inventario. Il genere lo dichiara il titolo che
`addSource` già scrive («Link Web», «Testo Libero»…), quindi non c'è una seconda
lista di tipi da tenere allineata. Verificato con fonti vere: `insegnai.ch/mappai.html
· Link Web` e `La fotosintesi… · 12 parole`, e il pallino toglie la fonte vera
(2 righe → 1, e la `source-entry` sparisce).

⚠️ **Difetto preesistente trovato qui**: in **vista compatta** ogni modulo-strumento
cresceva di **24px**. La regola che riaccende i figli del posto (`.mn-str > *`)
accendeva anche l'etichetta della voce, che `.mn-str--pieno` aveva spento e che
perdeva in specificità — 18px di testo più 6 di spazio. Quando il posto è pieno il
nome c'è già nel pezzo: ripeterlo è la stessa cosa scritta due volte. Ora i quattro
moduli misurano **145 in entrambe le viste**.

⚠️ **Un modulo nudo non è mai nascondibile**: senza stile prenderebbe il fondo scuro
di base e `nascondibile()` lo manderebbe nella vista estesa — cioè la schermata
d'ingresso resterebbe **senza il bottone che carica il PDF**. C'è il test.

⚠️ **Il file è cambiato sotto durante il lavoro**: `mappai-bento-composizione.js` ha
ora un campo `forma` sulle voci strumento (bottone · campo · pannello · segmento ·
interruttore · area · esito) che **nessuno legge**. L'ho lasciato e l'ho usato per le
quattro voci nuove. Se serve a qualcosa, va collegato; se no, è un campo che invecchia.

### ✅ FATTO (5/8, undicesimo giro): i due box delle fonti, e l'area dove si scrive

Dai due rilievi di Giacomo sugli screenshot dell'officina. Suite **1095 pass / 0 fail
/ 5 skip**, 0 errori console. Adottata la sua bozza (upload 1 + elenco 3 · azioni 3 ·
`ctx` con la colonna etichette a 45px), completata dove restava aperta.

**Un box faceva due mestieri.** «Fonti caricate» mostrava che cosa era stato caricato
*e* dava il posto dove scrivere: schede alte tre righe (titolo in grassetto, campo,
riga di spiegazione) là dove accanto, per i PDF, c'era un elenco. Ora sono due:

| box | che cos'è |
|---|---|
| **Elenco delle fonti** (`mn-input-box`) | righe con la **veste esatta** dell'inventario dei PDF: fondo trasparente, raggio 0, imballaggio 0, gap 10, pallino 20px. Il genere («Link Web») passa in coda come dettaglio, la riga di spiegazione sparisce — il segnaposto del campo dice già la stessa cosa |
| **Testo** (`mn-testo`, span 4) | l'unico posto della pagina dove si **scrive**: fondo bianco, testo `#404040`, cresce col contenuto **fino a 30 righe** e poi scorre |

Misurato a confronto: inventario `h 20 · raggio 0 · gap 10 · fondo trasparente` ·
riga-fonte `h 31 · raggio 0 · gap 10 · fondo trasparente`. L'unica differenza che
resta è l'altezza: lì dentro c'è un campo da compilare, e sotto i 26px non si tocca.

**`raccoglie`: la terza forma di montaggio.** Un posto normale *sposta* un elemento
che esiste già. La riga del testo libero no: nasce quando si preme «Testo», cioè
dopo, e più volte. Quindi il posto dichiara **che cosa raccoglie** (`raccoglie:
'textarea'`) e `raccogliRighe()` gliela porta appena compare — al montaggio e a ogni
cambio delle fonti. Verificato che sia sicuro: `app.js` cerca le fonti con
`document.querySelector('[data-source-id]')`, cioè nel documento intero, quindi
spostare la riga fuori da `#sources-container` non toglie niente alla generazione.

**La crescita fino a 30 righe la fa il CSS, non del JS**: `field-sizing: content`
(supportato, Chromium 148) fra `min-height` e `max-height`. Misurato: 3 righe → 90px
senza scorrimento · 40 righe → **540px** (= 30 × 1,5 × 12px) che scorre · 60 righe →
540px. Il tetto è dichiarato in righe e non in pixel, così resta trenta righe anche
se un domani cambia il corpo del testo.

Altri due dettagli misurati: l'**inventario cerca le fonti nel documento**, non nel
contenitore (se no la riga del testo, appena spostata, sparirebbe dall'elenco proprio
mentre la si scrive) · l'ascolto di ciò che si digita è **delegato al documento**, per
la stessa ragione · il nome del file nell'inventario passa da 700 a **600**: era un
quarto corpo (12/700) accanto ai 12/600 di tutto il resto.

⚠️ **Ci sono ricascato, ed è la trappola §6.9**: la textarea si misurava **bianca su
bianco** e ho dato la colpa alla specificità. Non era quello: a pannello nascosto le
**transizioni restano congelate sul frame di partenza** e `getComputedStyle` serve
quel colore — tanto che nemmeno uno `style` inline `!important` cambiava la misura,
che è il segno inequivocabile. Spente le transizioni: `rgb(64,64,64)`, giusto dal
principio. Il fix di specificità l'ho tenuto perché regge comunque
(`.mn-spostato.source-entry`, quattro classi contro quattro), ma non serviva a
riparare niente. **Quando nemmeno l'inline vince, non è la cascata: è la misura.**

### ✅ FATTO (5/8, dodicesimo giro): gli switch interi, i pop-up, e che cosa l'Officina governa davvero

Suite **1100 pass / 0 fail / 5 skip**, 0 errori console.

**1. Che cosa è granulare, e che cosa no** (risposta alla domanda). L'Officina §7
governa oggi: **per modulo** titolo · icona · colonne · altezza minima (con
l'altezza reale accanto) · fondo · colore del testo · bordo · colori dei bottoni
interni con due badge di contrasto · disposizione delle voci · larghezza minima di
colonna · posizione delle etichette · colonna che le allinea; **per voce**
etichetta · larghezza del campo · **pop-up informativo** · **etichetta sempre
visibile**. Restano NON componibili, e sono decisioni non ancora prese: il raggio e
l'ombra del riquadro, il passo fra le voci, la taglia delle icone, l'ordine dei
moduli fra le righe (si trascina, ma non si dichiara un «vai a capo»).

**2. Il bordo grigio attorno alla textarea è sparito.** Era il fondo al 14% che la
regola generale dà a ogni pezzo spostato: quattro classi contro tre della regola del
box che cresce, e vinceva lei. Ora pareggiano (`:not(.mn-card--nuda)`), e insieme al
fondo se ne va il titolo interno «Testo Libero» — la stessa parola due volte in un
box che si chiama «Testo». Misurato: riga trasparente, raggio 0, textarea bianca con
testo `#404040`.

**3. Gli switch arrivavano a METÀ, ed era un difetto vero.** Le voci puntavano al
singolo bottone (`#multipass-on`), non alla riga: nel bento finiva una faccia sola
dell'interruttore, senza il nome della cosa che governa e senza il suo `data-tip` —
a schermo si leggeva «ON», «MappAI», «Automatica», «A», che sono **valori, non
comandi**. Ora le quattro voci montano la **riga intera** (`#row-multipass`,
`#row-mm-logic`, `#row-kg-logic`, `#row-gen-depth`, id nuovi in `index.html`), e
arrivano etichetta + entrambe le facce + la spiegazione che il markup già portava.
Verificato: `Generazione Multi-Pass | OFF ON` · `MindMap | MappAI Adattiva` ·
`Profondità di generazione | Automatica + L2…L5` · `KG (A/B) | A B`.

**Le due profondità ora si distinguono dal nome**, che era il rilievo:
- «MindMap: come costruisce i rami (MappAI · **Adattiva**)» — *come* si costruisce;
- «**Profondità**: automatica o scelta a mano» — *quanto* si scende.
L'aiuto della seconda dice anche che **non è «Mostra fino a»**, che è solo un filtro
di vista (c'è il test).

**4. Pop-up informativi su tutto, con 950ms di attesa.** Tutte e **50** le voci
dichiarano `aiuto` — quello che compare passando il mouse — e il renderer lo mette
come `data-tip` su spunte, campi, azioni e posti. Misurato nell'app: **43 elementi**
del bento col fumetto, **0 opzioni senza**. Il testo sta nel dato e **si riscrive in
officina**, accanto all'etichetta: una spiegazione scritta nel renderer è una cosa
che nessuno può correggere senza toccare il codice. `seFuori` resta un campo a sé —
risponde a un'altra domanda (che cosa costa non montarla) e nel fumetto non
servirebbe.
L'attesa è una costante dichiarata (`ATTESA = 950` in `MappAITips`), e c'è il test
che la legge dal codice: senza, passando il mouse per arrivare altrove si accendeva
una spiegazione dopo l'altra.

⚠️ **Corretto un difetto vero del fumetto**: `showTip` posizionava dentro un
`requestAnimationFrame`, che **non scatta quando la finestra non è in primo piano**
— il fumetto restava creato, col testo giusto, e invisibile per sempre. È la stessa
trappola già corretta in `mappai-a11y.js`: posizionamento **sincrono** (il testo è
già nel DOM, `offsetWidth` è misurabile subito).

⚠️ **Due misure che sembrano difetti e non lo sono**, nel pannello: i `setTimeout`
sono strozzati a ~1/s (i 950ms si misurano come ~2000) e le transizioni restano
congelate (l'opacità del fumetto letta a 1 dopo l'uscita). Verificato quello che si
può verificare: **non compare all'istante** e **torna a zero uscendo**.

### ✅ FATTO (5/8, tredicesimo giro): i due box senza titoli — elenco che scorre, aree di scrittura nude

Suite **1100 pass / 0 fail / 5 skip**, 0 errori console.

**Niente titoli, in nessuno dei due box.** L'etichetta del posto non si nasconde col
foglio: **non si emette proprio** (`nascondiEt` sulla voce). Quello che non c'è non
può ricomparire per una regola più forte — ed è già successo con le etichette che
tornavano in vista compatta. Il nome resta nell'**inventario dell'officina**, dove
serve a sapere che cosa si sta trascinando.
Via anche i titoli di riga («Link Web», «Video YouTube»): il segnaposto del campo
dice già di che fonte si tratta, e il genere torna comunque nell'elenco dei documenti
accanto, che lo scrive in coda a ogni riga.

**L'elenco è un wrap che scorre**: il riquadro resta alto quanto gli altri (145) e
sono le righe a scorrere. Misurato con quattro link: contenuto 107 su 99 visibili,
**scorre**, ultima riga raggiungibile, box a 145.

**Il box del testo: una casella per ogni clic, col suo cestino.** Tre clic su
«Testo» → **tre aree bianche**, nessun titolo, **nessun segnaposto** (il campo
bianco è già l'invito; la frase dentro sarebbe la terza volta che si dice la stessa
cosa dopo il bottone e il nome del box) e un **cestino da 22px** per riga, grigio,
rosso al passaggio e col fuoco da tastiera. Ogni area cresce per conto suo: misurate
90 · 232 · 90 px con dentro 1, 12 e 0 righe.
⚠️ Il segnaposto si svuota **solo nella copia che sta nel bento** (`data-ph`
conserva l'originale): è lo stesso campo della UI storica, dove serve ancora.

⚠️ **Il difetto che si vedeva come «non scorre»**: le quattro fonti stavano
**affiancate** su una riga alta 43px. La regola che compatta i pezzi spostati impone
`flex-direction: row !important` a ogni figlio diretto del posto, e un `!important`
batte qualunque regola che non ce l'ha — **anche con due id contro uno**. La
compattazione a riga è giusta per un bottone; un contenitore di righe è l'eccezione,
e ora lo dichiara.

### ✅ FATTO (5/8, quattordicesimo giro): l'Officina allineata — e il buco che l'ha resa inutile per un giro

Alla domanda «l'officina è aggiornata?» la risposta era **no, non del tutto**, e
verificandolo è saltato fuori un difetto peggiore. Suite **1104 pass / 0 fail /
5 skip**.

**Il buco**: `vociDi()` copiava a mano **solo `et` e `w`**. Quando le leve per-voce
erano due andava bene; alla terza (il pop-up) e alla quarta (il titolo del posto)
era diventata una lista da tenere allineata — e si è rotta **in silenzio**: la
scelta finiva nel dato, l'officina la rileggeva dal file salvato e mostrava di
averla presa, e **chi disegna non la vedeva mai**. Ora si copiano tutti i campi
scritti sulla voce: una leva nuova funziona senza toccare quella funzione. C'è il
test di regressione.

**Il titolo del posto è UNA leva a tre stati** (`titoloPosto`: auto · sempre · mai)
al posto di due booleani opposti (`mostraEt`/`nascondiEt`) nati a due giorni di
distanza — uno stato che si poteva scrivere in modo contraddittorio. I due flag
restano leggibili per non invalidare le composizioni già salvate.
- **auto** — si vede finché il posto è vuoto (il pezzo montato porta il suo nome);
- **sempre** — resta anche a pezzo montato: serve dove il pezzo mostra un VALORE
  («ON», «A») e non il proprio nome;
- **mai** — non si emette affatto.

**L'anteprima dell'Officina segue la stessa regola**: prima mostrava un titolo che a
schermo non c'è — la divergenza che il banco esiste per evitare. Verificato nel
banco (titolo assente → «sempre» lo fa comparire → «mai» lo toglie) **e nell'app**
(posto `mn-str--et`, etichetta emessa e visibile, `data-tip` = l'aiuto riscritto in
officina; i due box delle fonti restano senza titolo).

⚠️ **Un secondo processo scrive sugli stessi file.** Durante il giro sono comparse
in `mappai-bento-composizione.js` e in `officina-bento.js` cose che non ho scritto
io: il campo `forma` sulle voci, `formaDi()`, e in officina un `disegnoStrumento()`
che disegna la **sagoma** del controllo (interruttore · segmento · campo · area ·
pannello · esito). Non l'ho toccato — ci ho solo innestato la regola sul titolo.
**Da sapere prima di riprendere**: due sessioni sullo stesso file si sovrascrivono,
e qui è andata bene solo perché le modifiche non si toccavano.

### ✅ FATTO (5/8, quindicesimo giro): la composizione di Giacomo adottata come default

Il JSON dell'officina è ora quello scritto in `mappai-bento-composizione.js`.
Suite **1104 pass / 0 fail / 5 skip**, 0 errori console, **8 righe** che chiudono
tutte e quattro le colonne.

| riga | moduli |
|---|---|
| 1-2 | upload 1 + elenco 3 · genere 1 + opzioni 3 |
| 3 | preset · quiz · fogli nodi · fonte&sintesi (221 ciascuno) |
| 4 | contesto giallo 1 + azione 3 |
| 5 | **Modalità** (145) — con «Adatta al livello» spostata qui da FOCUS |
| 6 | **FOCUS** (215) — quattro leve **in colonna** |
| 7 | INPUT 1 + elenco fonti 3 (215) |
| 8 | **Testo** (215), col titolo portato dal POSTO e non dal modulo |

**Due difetti trovati applicandola**, tutti e due corretti:
1. ⚠️ **La tua scelta sul titolo sarebbe stata ignorata.** `titoloPosto` guardava i
   campi per tipo (prima `titoloPosto` di entrambi, poi `nascondiEt` di entrambi…),
   quindi `mostraEt: true` scritto sulla VOCE perdeva contro il `nascondiEt` che la
   voce d'inventario dichiara: il box del testo sarebbe rimasto muto. Ora vale
   **tutto quello che dice la voce, poi quello che dice l'inventario** — chi compone
   deve poter rovesciare il default, è il senso del banco.
2. ⚠️ **Tre corpi tipografici in più**, dai bottoni degli switch montati («OFF/ON»,
   «MappAI/Adattiva», «A/B»): sono `<button>`, e la regola che uniforma i testi
   degli elementi spostati copriva solo `span`, `p` e `label` — per giunta lo zoom
   della landing li portava a 14,4px. Aggiunto `button`. Misurato dopo: **tre corpi
   in tutto il bento** (12/600 ×82 · 14/700 ×11 · 15/700 ×5) e nient'altro.
   La stessa riga ha chiuso anche i **quattro corpi delle Lenti** che erano rimasti
   aperti dal 5/8 mattina: erano pillole `<button>`.

**Due ritocchi al dato**: corretto il refuso «Profontià» → «Profondità» (è
un'etichetta che si legge a schermo) e riscritti tre `seFuori` che erano allarmisti
— «Apri Vault», «Apri JSON» e «Analisi» non montati **restano fra i tre avvii in
fondo alla pagina**, non spariscono. (L'analisi però resta spenta in vista compatta,
e questo il campo ora lo dice.)

Restano fuori dalla composizione, dichiarati dal validatore: la **stima delle
chiamate AI** (decisione del 5/8) · la stima token · «Genera solo la mappa» (il
bottone si adatta) · il Dev self-test · e i tre campi che il modulo monta nascosti.

### ✅ FATTO (5/8, sedicesimo giro): i box del bento come nel banco — riga «etichetta · comando»

Rilievo di Giacomo, con i due screenshot a confronto: nell'officina un modulo di
strumenti si legge come un elenco — una voce per riga, nome a sinistra, comando a
destra — e in app i controlli veri arrivavano con la loro taglia, affiancati, con
due barre di scorrimento. Suite **1104 pass / 0 fail / 5 skip**, 0 errori console.

**Nel dato**: Modalità e FOCUS dichiarano `colonneVoci: 'colonna'` e tutte le loro
voci portano il titolo (`mostraEt`). Il titolo è quello **scelto in officina**, non
quello che l'elemento si porta dietro: «MappAI · Adattiva» dice più di «MindMap»,
e con tutti e due a vista sarebbero due nomi per la stessa cosa (il primo figlio
testuale dell'elemento montato si spegne).

**Nel foglio**: la voce con etichetta a vista diventa una riga
`justify-content: space-between`, i controlli perdono le tinte di Tailwind
(arancio · emerald · indigo, scelte per un fondo bianco) e prendono il fondo dei
bottoni del modulo, la faccia attiva resta chiara `#f1f4f8` su testo `#404040`.

Misurato: **Modalità** 5 righe (40 · 40 · 42 · 40 · 30) tutte a x=154 col comando a
destra, **291px, non scorre**; **FOCUS** 4 righe, **371px, non scorre**; nessuno
scorrimento orizzontale, tre corpi tipografici, nessuno sbordo.

⚠️ **Ho inseguito un numero per tre giri, ed era la domanda sbagliata.** Alzavo
l'altezza del riquadro e il contenuto cresceva con lui (172 → 179 → 190): le righe
si allungavano nello spazio che si liberava. La regola giusta non è un'altezza
tarata a mano ma **un box in colonna prende l'altezza del suo contenuto**
(`max-height: none` su `data-voci="colonna"`), con `altezza` che torna a essere un
minimo. Così non c'è niente da rimisurare quando si aggiunge una voce.

⚠️ **Due difetti veri trovati qui**, e sono lo stesso difetto degli switch di
stamattina — *montare il pezzo senza ciò che lo governa*:
1. **«Macro-aree a mano» era montata e inerte**: `#step-l1-wrap` sta nella lista dei
   contenitori RESIDUI (quelli che si spengono quando restano vuoti) **ed è anche**
   la voce montata nel bento — quindi la funzione spegneva il pezzo. Ora un
   contenitore che sta dentro `#mn-bento` non è più un residuo: è il pezzo.
2. Una volta acceso, portava il **pannello intero (294px)** e FOCUS passava a 525.
   Ora una riga non supera **140px** e il pannello scorre dentro la sua riga.
   ⚠️ La prima stesura della regola schiacciava anche i quattro moduli nudi
   (145 → 140): il tetto vale solo dove il modulo NON è il pezzo.

**Aperto, è una tua decisione**: la voce **«Lenti»** monta `#lenses-panel`, che nel
markup è dichiarato **NASCOSTO** («Lenses avanzate (collassabili) — NASCOSTO», con
il suo bottone dentro un contenitore `hidden`). Montarla nel bento non la
riaccende: la riga mostra l'etichetta e niente altro. O si riattiva la funzione, o
la voce va tolta dalla composizione.

### ✅ FATTO (5/8, dal diciassettesimo al ventesimo giro): i comandi di Modalità e FOCUS

Quattro giri sullo stesso tema — far somigliare l'app al banco — più la composizione
finale di Giacomo. Suite **1104 pass / 0 fail / 5 skip**, 0 errori console.

**I toggle dicono le due scelte, non un valore.** «Single · Multi» (era OFF/ON),
«Normale · Adattiva» (era MappAI/Adattiva), «KG A · KG B» (era A/B). Pillole
allargate a 132 e 124px: «Single» non stava in 72.
⚠️ Rinominare una faccia rende incoerenti le etichette che la citavano: sono stati
aggiornati anche i tre `data-tip` e `tip_mm_logic` nei due dizionari, che parlavano
ancora di «MappAI: costruzione classica».

**«Adatta al livello» → «Adatta»**, col pop-up dettato da Giacomo, e la rinomina
anche nel markup e nei due dizionari (`ui_level_tune`).

**Chip + pallino** per i due comandi a UNO stato (`#level-tune-toggle`,
`#auto-depth-toggle`): 46×26, pallino 18, **rosso da spento · emerald da acceso**.
Il colore sta sul pallino: il chip è il binario, il pallino è lo stato.
⚠️ `syncAutoDepthUI` accende `bg-emerald-400` sul bottone — dentro il bento va
neutralizzato, o il chip direbbe la stessa cosa due volte (col testo bianco su
emerald a 1,6:1).
⚠️ **«Adatta» è disabilitata finché non c'è un contesto attivo**: senza classe o
allievo `levelBlock()` tornerebbe vuoto, quindi una spunta accesa non farebbe
niente. Il default la accende solo quando si può, e `sincronizzaBento` ripassa a
ogni scelta nel box giallo. Da spenta-per-forza il pallino è **grigio** e non rosso:
il rosso vuol dire «spento», non «non disponibile».

**I default**: Adattiva · Multi · Profondità automatica ON · Adatta ON · **KG B**
(deciso il 5/8, dopo un giro a «A»).
⚠️ Non basta «applica se la chiave è vuota»: `mappai-storage-lang.js` al boot scrive
già un default suo, quindi quando il bento gira non esiste più niente di «mai
scelto». Serve un marcatore proprio (`mappai_bento_default_v1`): i default si
applicano UNA volta, poi comanda la scelta dell'utente.

**La composizione finale** (JSON di Giacomo): **7 righe**, con Modalità (1 colonna) e
FOCUS (3) che ora condividono la riga 5. Misurato: `299 @134` e `924 @447`, stessa
riga, nessuno scorrimento, nessuno sbordo.
`titoloPosto: 'mai'` dove il pezzo porta già il suo nome — «MindMap», «Generazione
Multi-Pass», «KG (A/B)», i quattro di FOCUS; il titolo resta dove il pezzo mostra un
valore o un chip.
⚠️ La prima misura sembrava piena di doppioni: `textContent` legge anche ciò che è
`display:none`. Rifatta sui testi **visibili**.

🐛 **Le Lenti, e perché non si vedevano.** Il pannello era **già montato e già
pieno** (13 lenti in 3 gruppi): restava invisibile per la classe `hidden` del
markup — lo stato «collassato» — e il bottone che lo apriva («▸ Personalizza
extraction lenses») vive in un contenitore dichiarato NASCOSTO, rimasto FUORI dal
bento. È lo stesso difetto degli switch e delle macro-aree: **montare il corpo senza
il comando che lo governa**. Dentro il bento non c'è niente da collassare — il
pannello È il pezzo di quel posto — quindi ora si mostra; fuori dal bento la
decisione storica non cambia (regola scoped a `#mn-bento`). Misurato: 21 voci
visibili, riga a 140px, FOCUS 481 senza scorrere.

📌 **Perché il check della taratura non c'è, ed è giusto**: la taratura si applica da
sé leggendo il profilo del contesto attivo. Per la MAPPA passa da
`classTuningPrompt()` dentro `buildSystemInstruction`, senza spunte di mezzo; per i
MATERIALI il modulo monta `mp-adapt-on` **nascosto e acceso** (verificato: `hidden`,
`checked`), perché `_readConfig()` deve trovarlo. «Adatta linguaggio» è un'altra
cosa: aggiunge il livello di lettura per le fonti esterne non scritte per quella
classe.

**L'officina, riallineata due volte** — perché `build.js` non basta: il banco è
aggiornato quando **disegna quello che l'app fa**.
1. La `forma` di «Profondità automatica» era `segmento`: ora è `interruttore`, e la
   sagoma dell'interruttore ha le **misure vere** (46×26, pallino 18 emerald a
   destra) invece di un 26×15 col pomello bianco — era *un'idea* di interruttore,
   non questo.
2. Le voci con titolo «mai» diventavano **sagome anonime**: quattro righe uguali in
   FOCUS, mentre a schermo ognuna porta il suo nome. Ora il nome si vede
   **attenuato e in corsivo** (opacità .5), col fumetto che dice che è del pezzo e
   non del posto.

### ✅ FATTO (5/8, ventunesimo giro): il box «Macro-aree» col suo toggle

Composizione di Giacomo: FOCUS resta a focus · lenti · disciplina, e le macro-aree
escono in un riquadro a tutta riga — **otto righe** in tutto. Suite **1104/0/5**,
0 errori console.

🐛 **`mn-l1` montava il contenitore sbagliato.** `#step-l1-wrap` contiene anche il
blocco del Focus specifico, che ha una voce sua: il box delle macro-aree si portava
dentro «Focus specifico (Opzionale)» e nel form restava un'etichetta orfana. Ora
monta **`#input-l1-container`**, che porta l'elenco da scrivere a mano **e il toggle
«Genera Macro-Aree in automatico»** — che era già lì dentro: non serviva aggiungerlo,
serviva montare il contenitore giusto.

🐛 **Il toggle finiva 18px sotto la piega**: il tetto di 140px per riga tagliava il
pannello, e la decisione da cui dipende tutto il resto del box si raggiungeva
scorrendo. Ora **un riquadro con UNA sola voce prende l'altezza del contenuto** — il
tetto serve a non far sfondare una riga fra tante, non a tagliare un pannello che ha
un box tutto per sé; `altezza` resta il minimo. Misurato: 283px, non scorre, toggle
visibile, gli altri box-strumento invariati (Modalità e FOCUS 333, INPUT 215).

Verificato anche che il contenitore residuo del Focus nel form resti **spento**:
nessuna etichetta orfana.

### ✅ FATTO (5/8, ultimo giro): quasi nessun titolo del posto in Modalità

Composizione rimandata da Giacomo: quattro voci su cinque passano a
`titoloPosto: 'mai'` — il nome lo porta il pezzo montato («MindMap», «Generazione
Multi-Pass», «Profondità di generazione», «KG (A/B)») — e il titolo del posto resta
solo su «Adatta linguaggio», il cui pezzo mostra un chip e nient'altro. FOCUS senza
titoli, coi suoi tre pezzi. Suite **1104/0/5**, 0 errori console.

Misurato: Modalità e FOCUS **333px sulla stessa riga**, macro-aree 283, tre corpi
tipografici, nessuno scorrimento, nessuno sbordo.

⚠️ **Due cose che il dato dice e a schermo non si vedono**, e vale la pena saperle
prima di ritoccare la composizione:
1. Le **`et` delle voci con titolo «mai» non compaiono in app** — restano per
   l'inventario dell'officina, dove servono a riconoscere quello che si trascina.
   Riscrivere «Adattiva» in «(Normale · Adattiva)» non cambia un pixel.
2. **L'`altezza` di un box in colonna è un MINIMO, non un tetto**: il riquadro prende
   l'altezza del contenuto (260 dichiarati → 333 reali). Serve solo a non farlo
   collassare quando le voci sono poche.

### ✅ FATTO (5/8, ventiduesimo giro): i box scuri senza riquadro, e «Profondità» a due facce

I quattro punti di Giacomo, con una premessa: **una prima stesura c'era già e non si
vedeva.** Perdeva di specificità contro la regola dei colori dei bottoni scritta
nell'officina (`.mn-card[data-btn] .mn-str > .mn-spostato` = 1 id e 5 classi contro
1 id e 4), quindi il riquadro chiaro restava e — peggio — **le due facce di ogni
switch erano identiche**: «Normale» e «Adattiva» misurate entrambe `#f1f4f8`, cioè
nessun modo di sapere quale fosse attiva. È la trappola della specificità per la
quinta volta: il blocco nuovo usa DUE classi del riquadro
(`.mn-card--extra.mn-card--str`) e sta in fondo al foglio. Suite **1104/0/5**, 0 errori
console.

**La regola, in una riga: il fondo chiaro sta sui COMANDI, mai sui contenitori.**
Un `div` che raccoglie non si preme, quindi non si dipinge; un bottone, un menu, un
campo sì — e la faccia attiva è **verde**, perché due chip dello stesso chiaro
chiedono un secondo canale.

| punto | cosa cambia |
|---|---|
| 1 · sfondo nero esteso | righe e pannelli montati (Lenti, area disciplinare, macro-aree) senza fondo: il `#404040` arriva ai bordi. Titoli inline **bianchi 12/700**, su una riga sola |
| 2 · «Profondità» | due facce `auto \| manuale` **nella stessa pillola degli altri switch**, `syncAutoDepthUI` le governa entrambe; il menu del livello è una riga sua e si spegne (45%) con «auto» |
| 3 · «Adatta» | il riquadro bianco esterno è caduto con la regola del punto 1 — era lo stesso riquadro |
| 4 · «Modo KG» | bianco sul nero col toggle chiaro, stessa regola |

**Sette difetti trovati misurando** (nessuno si vedeva a occhio nel codice):
1. il menu «Livello» restava **trasparente sul nero**: `.mn-spostato COMANDO` è un
   discendente e non comprende l'elemento stesso — il menu È il pezzo montato. Serve
   anche la forma `COMANDO.mn-spostato`.
2. il binario del toggle «Genera Macro-Aree in automatico» è un `div`: spento come
   contenitore, restava a galleggiare **il solo pallino bianco**. Eccezione
   `:not(.peer + div)` + stessa grammatica dell'altro switch (binario chiaro,
   pallino rosso/verde).
3. il pannello delle macro-aree veniva **compattato in una riga** dalla regola
   storica (`flex-direction: row` su ogni pezzo montato): spiegazione, bottone e
   campo affiancati e centrati, col campo largo 176px e la × sopra il testo.
4. i **bottoni-fonte sono `div` con `onclick`**, non `<button>`: trattati da pannelli
   perdevano fondo e forma. Un pezzo che si preme è un comando, qualunque tag porti.
5. «Nuova macro-area» largo **1196px** — una fascia chiara che pesava più del
   riquadro. Un bottone dentro un pannello prende la larghezza che gli serve.
6. il chip di «Adatta» era **invisibile**: binario al 18% del colore del testo, su
   nero e per giunta disabilitato (.45). Ora binario chiaro come ogni chip, e il
   pallino «non disponibile» è grigio pieno, non rosso.
7. la × che toglie una macro-area faceva **3,75:1**: sopra il 3:1 dei grafici, ma è
   l'unico segno di un comando che cancella → `#fca5a5` = 5,4:1.

**Due nomi accorciati, perché si troncavano**: «Generazione Multi-Pass» → il titolo
lo scrive il posto («Multi-pass»; misurati 124px disponibili contro 146 richiesti) e
«Livello massimo» → «Livello». E in italiano la faccia diceva ancora «Automatica»
accanto a «manuale»: `ui_auto_depth` è **«auto»** nei due dizionari.
⚠️ In `en_translations.js` `ui_gen_depth_title` era **dichiarata due volte** — in un
oggetto letterale vince l'ultima, quindi la prima non contava niente e nessuno se ne
accorgeva. Ora è una sola.

**Un quarto corpo, dichiarato**: `SCALA.voce.pesoTitolo = 700`. Non è un corpo nuovo
(12px resta 12px), è il grassetto del titolo di una riga — che sta in una riga alta
30px e i 14px del titolo del riquadro non li può prendere. L'officina lo riconosce,
altrimenti segnalerebbe «fuori scala» un grassetto voluto.

**Misure finali** (pagina vera, 1440×900, veste accesa): contenitori tutti
trasparenti · chip `#f1f4f8` con testo `#404040` = **9,4:1** · faccia attiva
`#41e6aa` = **6,48:1** · titoli bianchi = **10,37:1** · **nessun comando sotto 4,5:1**
· nessun troncamento · corpi 15/700 ×4 · 14/700 ×9 · 12/700 ×10 · 12/600 ×53 ·
nessuno sbordo · 0 errori console. Vista compatta invariata (0 box scuri, 10 moduli).
Con la veste spenta la riga «Profondità» resta quella del form (pillola bianca, menu
disabilitato con «auto»).

⚠️ **Da provare in Electron**: il ciclo auto→manuale con una generazione vera (che il
tetto di profondità segua la faccia scelta), e «Adatta» con una classe attiva — nel
browser resta disabilitata perché le classi stanno su disco.

### ✅ FATTO (5/8, ventitreesimo giro): la BARRA IN ALTO, e i bottoni che scambiano icona e testo

Sei ritocchi di Giacomo. Suite **1104/0/5**, 0 errori console.

| # | cosa | misura |
|---|---|---|
| 1 | il mega-bento sale verso il bordo | prima riga **197 → 140** (−57) |
| 2 | il chip è sempre visibile, nello stesso posto | landing **73,16** · console **73,17** |
| 3 | il nome della sezione sulla stessa riga di pallino e chip | pallino 20 · chip 73 · titolo **271**, identici in Crea e nelle console |
| 4 | i tre avvii alti come MindMap/Knowledge Graph | **145 → 66**, lo stesso token `--mn-h-scelta` |
| 5a | icona a riposo ↔ testo al passaggio, con un ritardo | `opacity .18s ease **.09s**`, etichetta assoluta al centro |
| 5b | icone di PDF e Genera +45% | **44 → 64** |

**La barra in alto è una sola cosa**: pallino della Cabina · chip del contesto ·
nome di dove sei (**Crea · Elabora · Insegna · Cabina**), e nient'altro. Vale sulla
landing e dentro una console, con le stesse coordinate — perché il chip «sempre
nello stesso posto» non si ottiene lasciando quello della landing sotto la console
(sta a z 60 contro 12100: è coperto), ma rimontandolo nella testata.

**Le tre cose che questo giro ha chiuso davvero**:
1. **Il chip non spariva più in COSTRUISCI.** La regola c'era per un buon motivo —
   la stessa informazione in due posti diverge — ma il motivo non si applicava: il
   box giallo non tiene uno stato suo, chiama `MappAIClasses.setActive*`, cioè
   scrive nello stesso store che il chip legge. Sono due viste, non due copie.
2. **Il chip si costruisce in un posto solo** (`MappAIClasses.chipNodo`, estratto da
   `renderChip`): landing e console chiamano quello. Due costruzioni avrebbero
   mostrato due contesti diversi nella stessa schermata.
3. **Se la console ha già il suo chip, si adotta quello.** INSEGNA lo dichiara nello
   schema e là non è un'etichetta: è il FILTRO della colonna delle mappe. Ne
   aggiungevo un secondo → due comandi per la stessa cosa (misurato: dot spinto a
   x=1051, due `.mm-ctx` nella stessa testata). Ora il manifesto gli dà solo il
   posto, con una classe.

**Cinque difetti trovati misurando** (e uno è il più costoso della sessione):
1. 🐛 **La pagina si bloccava.** `sincronizzaTitolo` scriveva `textContent` a ogni
   giro; `textContent` sostituisce il nodo di testo, cioè è una modifica del DOM, e
   la console osserva `body` in `subtree/childList` e richiama `sincronizza` a ogni
   modifica → ciclo infinito, renderer appeso (`navigate` in timeout a 300s). Si
   scrive **solo se cambia**. È la regola generale: dentro un osservatore, non
   toccare il DOM se il valore è già quello.
2. Il sottotitolo della testata si chiama **`mm-subtitle`, non `mm-sub`**: con il
   selettore sbagliato restava, e per giunta PRIMA del titolo (misurato:
   sottotitolo a 273, titolo a 597 — il nome della console in mezzo alla barra).
3. Il chip del motore porta `margin-left: auto` (nelle testate normali sta a
   destra): **712px di margine** spedivano chip e titolo in fondo alla riga.
4. Il contenitore dei testi è una **colonna centrata**: tolto il sottotitolo, il
   titolo restava piantato al centro invece che accanto al chip.
5. La transizione dell'etichetta perdeva contro una regola id-qualificata già
   esistente (`transition: color .12s`): la dissolvenza non c'era e il testo
   appariva di scatto. Serve la variante con `#landing-view`.

**Il ritardo dello scambio è voluto** (.09s prima della dissolvenza da .18s):
passando il mouse per arrivare altrove non si accende niente. Con
`prefers-reduced-motion` lo scambio resta, la dissolvenza no.

**Chiuso subito dopo**: **il nome è CREA**, e vale ovunque. `ui_landing_build` passa
da «Costruisci» a «Crea» (IT) e da «Build» a «Create» (EN), con il markup del
selettore storico; la barra usa le STESSE chiavi del rail (`TITOLI` punta a
`ui_landing_*`), quindi non possono più divergere — erano due chiavi per lo stesso
posto, ed è così che è nato «Crea» nella barra e «Costruisci» nel fumetto del rail.
Titolo a **30px** (+50%) e **#404040**.
⚠️ Il corpo e il colore vivono in due token (`--mn-tit-fs`, `--mn-tit-col`) perché
il titolo della console sta in un ALTRO foglio (`mappai-console-manifesto.css`):
scritti a mano in due posti, quel foglio è caricato dopo e vinceva a parità di
specificità — misurato, console a 26px mentre la landing era già a 30.
⚠️ Resta noto: i `title` del rail si scrivono al montaggio, quindi **non seguono lo
switch di lingua** finché non si ricarica (difetto preesistente, non di questo giro).

⚠️ **Da provare in Electron**: la barra dentro INSEGNA con vault veri (nel browser
la console si apre senza mappe), e il chip che cambia contesto mentre una console è
aperta (`mappai-active-class-changed` → `ridisegnaChip`).

### ✅ FATTO (5/8): il LAMPO della vecchia UI all'avvio

Segnalato da Giacomo in Electron: per meno di un secondo compare la landing
storica (hero grande, tre card con l'etichetta, chip a destra), poi salta tutto al
suo posto. Non era la veste spenta: era **l'ordine in cui il browser fa le cose**.
Le classi `manifesto` e `mappai-ridotta` le mettevano i due moduli a
`DOMContentLoaded`, cioè **dopo il primo disegno**, e il mega-bento lo costruisce
il JS — quindi prima di quel momento la pagina mostrava per forza il form storico.

**Due pezzi, nessuno dei quali è una veste nuova**:
1. **Script inline in `<head>`** (prima del `<body>`, verificato): legge le due
   chiavi da localStorage e mette le classi. Gira prima che il body esista, quindi
   il primo disegno è già quello giusto. Non tocca il DOM e non dipende da niente.
2. **`mn-boot`**: la landing resta **invisibile** finché il bento non è montato
   (`montaBento` chiama `window.__mnBootFine`). `visibility`, non `display`: lo
   spazio resta occupato, altrimenti si eviterebbe un lampeggio per averne un altro.

⚠️ **Tre reti perché la pagina non possa MAI restare bianca**: la chiamata di chi
monta il bento, l'evento `load`, e un tetto di **1,5s**. Chi arriva per primo vince.
Un velo che dipende da una sola riga di JS è un modo nuovo di rompersi.

Verificato: dopo il caricamento `mn-boot` è via e la landing è visibile; rimettendo
la classe a mano il velo copre (`visibility: hidden` → `visible`); col kill-switch
`mappai_stile_manifesto='0'` **non si aggiunge nessuna classe e nessun velo** (la
landing storica si vede subito, com'era).

### 📐 LE REGOLE DELLA BARRA E DELLE CONSOLE (5/8, dettate da Giacomo)

Vanno lette prima di montare qualunque console: correggono il disegno dei mockup
F1/F2 e valgono per tutte le superfici a schermo pieno.

1. **La barra porta sempre tre cose e solo quelle**: il **pallino della Cabina**, il
   **chip classe/materia**, e il **percorso** di dove sei. L'icona Lucide della
   testata (la cartella di «Documenti») **non c'è più**: quel posto è del pallino.
2. **Il titolo è un percorso cliccabile**:
   `Elabora › Documenti › [Quiz|Flashcard|Sintesi|Catena|Nodi] › [nome del file]`.
3. **I comandi del documento stanno nella COLONNA**, sotto la navigazione per
   genere (Contenuto · Aspetto · Anteprima di stampa · Stampa · Annulla · HTML ·
   Salva · Nel vault): così **la sotto-barra sparisce** e il foglio prende
   l'altezza che quella riga si mangiava.
4. **«Chiudi» non serve**: si esce con **ESC** (torna alla console Documenti con la
   colonna visibile) o **premendo un livello del percorso**.
5. **Il rail delle tre forme resta sempre**, e **se ne va con la colonna**: chi la
   chiude per leggere a tutta larghezza sta togliendo di mezzo la navigazione, e il
   rail è navigazione.
6. **Tornare a «Documenti» con modifiche aperte** apre la **finestra di
   salvataggio**; se non c'è niente da salvare si torna diretti all'elenco.

**Fatti in questo giro** (i tre pezzi riusabili che quelle regole richiedono).
Suite **1104/0/5**, 0 errori console.

| pezzo | dove | prova |
|---|---|---|
| **briciole** `MappAIConsoleManifesto.briciole([{id, et}…])` | testata di qualunque console | 4 livelli, l'ultimo è testo (`aria-current`), i precedenti bottoni al 55%; il titolo del motore si spegne (sarebbe lo stesso nome due volte); nessuno sbordo; il clic emette `mappai-briciola` con `{id, indice}` |
| **finestra di salvataggio** `MappAIModal.chiediSalvataggio({nome})` | motore | tre strade — Salva · Esci senza salvare · Torna indietro — fuoco su **Salva** (mai sul distruttivo); ESC e velo valgono `annulla`, e la console sotto resta aperta |
| **rail che segue la colonna** | veste console | misurato `flex` → `none` alla chiusura della maniglia → `flex` alla riapertura |

⚠️ **Perché tre strade e non una conferma sì/no**: uscire da un documento scritto
NON è una conferma. Con due bottoni si perde quella che di solito si vuole
(salvare), e chi ha fretta impara a premere «esci» — che è il distruttivo.

**Prossimo passo, con questi pezzi**: montare la console **Documento (F1/F2)** con la
grammatica sopra (percorso al posto del titolo, comandi nella colonna, nessuna
sotto-barra, nessun «Chiudi»), e poi la console **Mappa (D1)**.

### ✅ FATTO (5/8): l'OFFICINA DELLE CONSOLE — il bento dell'area, prima di montarla

Richiesta di Giacomo: «in tutte le console areas usa il più possibile dei box
allineati con il bento di CREA; se aiuta, costruisci un'officina apposta per i
bento delle console prima di montarle». Suite **1116/0/5** (+12 test).

| file | cosa |
|---|---|
| `public/js/mappai-console-bento.js` | **il dato**: le AREE (F1 · F2 · D1) con briciole, colonna, comandi e moduli; `righe()` · `valida()` · `larghezza()` · `firma()` — pure e testate |
| `public/dev/officina-console.html` + `officina-console.js` | **il banco**: si compone (trascinamento, colonne, altezze, voci, forme, pop-up) e si guarda **dentro la cornice vera** |
| `tests/console-bento.test.js` | 12 prove sulle regole pure |

**La cornice non è ridisegnata dal banco**: è `MappAIModal.render()`, cioè il motore
dell'app, e il bento entra nella sua tela. Se il banco disegnasse una console sua
mostrerebbe una superficie che a schermo non esiste — è già successo con
l'anteprima del bento di CREA (5/8, il difetto della classe su `<html>`).

**Che cosa il validatore chiede a una composizione**: percorso nella barra (senza,
la console non dice dove sei e non ha una via d'uscita) · righe che chiudono le
quattro colonne (avviso: resta un buco) · forme che il renderer sa disegnare · la
**tela** larga tutta la riga e **una sola** per area · **una tela senza comandi
nella colonna è un errore** (tolta la sotto-barra, se i comandi non sono nella
colonna non sono stati spostati: sono spariti) · ogni voce col suo pop-up · un
modulo nudo che dichiara un titolo che non si vedrà.

**Misurato nel banco** (F1): cornice `mm-box--xl mm-box--piena mm-box--console`, 7
voci di navigazione, area 581px con **4 riquadri** del bento (`cerca 284×155 ·
origine 135×155 · nuovo 135×155 · elenco 581×420`); F2: percorso a 4 livelli, gli
**8 comandi del documento nella colonna**, un modulo-tela 581×620.

⚠️ **Difetto trovato dal banco stesso, corretto**: nel percorso si accorciavano
TUTTI i livelli («Elab… › Docume… › Qu… › Storia della …»): quattro parole tagliate
al posto di un percorso. Ora si stringe solo l'ultimo — il nome del file, l'unico
che può essere lungo; gli altri sono comandi corti e si leggono per intero.

📌 **Primo reperto per la caccia ai pezzi fuori token**: dentro un riquadro scuro la
tabella del motore porta i suoi corpi (**12/400** e **10/700**), che non sono i tre
della scala. È da guardare quando si monta F1 sul serio.

**Round 2 (5/8) — la granularità che mancava.** Richiesta di Giacomo: «la stessa
granularità della vecchia officina, più la griglia della colonna, la posizione del
bento nell'area, corpo e colore del percorso». Suite **1120/0/5** (+4 test).

Tre livelli, e sono livelli diversi apposta:
1. **la GRIGLIA** — `aspetto: {barra, colonna, area}` nel dato → **17 variabili CSS**
   scritte sul riquadro della console (`CB.variabili`). Barra: corpo e colore del
   percorso, opacità dei livelli precedenti e dei separatori, altezza. Colonna:
   larghezza, margine interno (è la riga verticale su cui le voci si allineano),
   altezza e passo delle voci, corpo, raggio, icona. Area: colonne del bento, passo,
   margini, tetto di larghezza, allineamento (a bandiera o centrato).
2. **il RIQUADRO** — fondo, testo, bordo, disposizione delle voci, colonna delle
   etichette, colori dei bottoni interni, **con i badge di contrasto**: sono le
   stesse leve del bento di CREA, prese da `MappAIBento.presentazione/stileDi/
   layoutDi/bottoniDi`. Non una seconda implementazione: la stessa funzione.
3. **la VOCE** — etichetta, forma, pop-up.

**Il foglio legge, il banco scrive**: le variabili hanno tutte un ripiego uguale a
com'è oggi (`mappai-console-manifesto.css`), quindi una console che non dichiara
niente non cambia di un pixel — e quando si monta, i valori arrivano dal dato invece
che da un CSS scritto a mano.

**Nel banco anche**: finestra simulata (1280 · 1440 · 1680 · 1920) — le misure sono
quelle di quella larghezza, non del pannello — e **colonna aperta/chiusa**, per
vedere la vista a tutta larghezza che serve a F2.

**La riga delle misure fa da cacciatore di fuori-token**: elenca le coppie
corpo/peso trovate nell'area e marca in ambra quelle che la scala del bento non
dichiara (oggi: 2, dalla tabella del motore).

**Round 4 (5/8) — i parametri per GERARCHIA, e il difetto che li rendeva muti.**
Rilievo di Giacomo: «l'anteprima non modifica i colori come ho esplicitato nelle card
laterali; mancano i controlli per la larghezza delle tendine; il chip ha ancora i
colori vecchi; crea un'officina con tutti i parametri divisi per gerarchia — per
esempio gli allineamenti nella sidebar vanno applicati a TUTTE le sidebar».

🐛 **Perché i colori non arrivavano**: `MappAIBento.presentazione()` emette **solo** i
bottoni interni e la disposizione delle voci — fondo, testo e bordo del riquadro li
scrive un'altra funzione (`stileAttr`, in `mappai-costruisci-manifesto.js`), e il
banco non li emetteva. Per giunta il valore di ritorno è `{vars, attr}` e io leggevo
`{stile, attributi}`: due nomi sbagliati, zero errori in console, e le leve
sembravano rotte invece che scollegate. Ora il renderer emette anche fondo/testo/
bordo **e** le due variabili da cui i figli ricavano le loro tinte.

**La gerarchia, dichiarata** — cinque livelli, ognuno sovrascrive quello sopra e solo
per le chiavi che tocca:

| livello | dove vive | esempi |
|---|---|---|
| ① **globale** — *tutte le console* | `TOKEN_BASE` + `mappai_console_token` | chip (fondo · testo · bordo · altezza · raggio · corpo), campi e tendine (altezza · raggio · larghezza minima · **larghezza tendina**), riquadri (raggio · ombra), **allineamento delle voci: vale per TUTTE le sidebar** |
| ② **vista** — *questa area* | `aspetto` dell'area | barra (corpo/colore del percorso, opacità, altezza), colonna (larghezza, margine, altezza voce, passo, corpo, raggio, icona), area (colonne, passo, margini, tetto, allineamento) |
| ③ **riquadro** | `stile` · `layout` · `bottoni` del modulo | fondo, testo, bordo, disposizione delle voci, colonna delle etichette, colori dei bottoni con badge di contrasto |
| ④ **voce** | la voce | etichetta, forma, **larghezza del campo** (vince sul default globale), pop-up |

Ogni gruppo di leve porta scritto **l'ambito** («vale per tutte le console», «vale per
TUTTE le sidebar», «vale per questa vista»): chi tocca una leva deve sapere quante
superfici sta cambiando. I token globali si azzerano con un bottone loro — buttarli
via insieme a una vista vorrebbe dire perdere il lavoro fatto su tutte le console.

**Nel foglio dell'app**, non nel banco: i token nuovi stanno in
`mappai-console-manifesto.css` con il valore di oggi come ripiego (chip 43px/#f1f4f8/
999, campi 32/10, tendina 160, riquadri raggio 18, voci a sinistra) — verificato che
la landing e il chip dell'app non cambiano di un pixel.

**Misurato nel banco**: riquadro giallo `#ffd400` col testo `#222` ✓ · chip lilla
(fondo e testo dai token globali) ✓ · tendina a **240px** ✓ · voci di navigazione
**centrate** in tutte le colonne ✓ · 4 gruppi globali + 3 di vista, 7 ambiti scritti.

**Round 3 (5/8) — l'anteprima è una FINESTRA, non una striscia.** Rilievo di Giacomo:
«l'estensione verticale è inadeguata a impostare il layout del bento». Aveva ragione,
ed era un numero scritto nel banco: la console stava in una scatola alta **720px
fissi**, quindi l'area restava una fascia e il bento non si poteva impaginare — che
è l'unica cosa per cui il banco esiste.
- La finestra ha ora **due misure** (1280·1440·1680·1920 × 800·900·1080·1200) e uno
  **zoom** (auto · 100 · 75 · 50%). «Auto» rimpicciolisce quanto basta a vederla
  intera nel pannello.
- ⚠️ Lo zoom è una **scala visiva**: le misure restano quelle vere perché si leggono
  con `offsetWidth/Height` e non col rettangolo sullo schermo — che a metà scala
  direbbe numeri che sul monitor vero non esistono.
- L'anteprima è **agganciata in alto** (sticky): si regola una leva a sinistra e si
  guarda l'effetto senza risalire.
- Misurato: 1440×900 → area **1038×781** · 1280×800 al 100% → **878×681** ·
  1920×1200 → **1240×1081** (il tetto di larghezza morde) · colonna chiusa →
  area **1240** e navigazione via.

⚠️ **Difetto trovato misurando, e vale come regola**: l'anteprima ignorava il passo
scelto (var a 24px, `gap` reale 14). Il contenitore del bento portava
`id="mn-bento"` — l'id del bento di CREA, le cui regole sono scritte con l'ID: **un
id batte una classe**, quindi vinceva sempre CREA. L'aspetto arriva dalle CLASSI
condivise; l'id di un'altra superficie non si riusa per «ereditare» stile.
⚠️ Secondo: la finestra simulata va imposta al RIQUADRO, non al contenitore — il
motore dà alla console una larghezza sua, e il banco misurava 800px mentre il
selettore diceva 1440.

### ▶ DA DECIDERE (sono scelte tue, non lavoro in coda)

1. **Sei funzioni restano fuori dalla composizione**, e il validatore lo dichiara a
   ogni apertura: la **stima delle chiamate AI** (decisa fuori il 5/8 — è l'unica
   assenza che pesa: si sceglie senza vedere quanto costa), la stima token, «Genera
   solo la mappa» (non serve: il bottone si adatta), il Dev self-test, e **Apri
   Vault · Apri JSON · Analisi**, che restano fra i tre avvii in fondo alla pagina
   (l'analisi però è spenta in vista compatta).
2. Nel box FOCUS le **macro-aree a mano** portano un pannello intero: sta in una riga
   da 140px che scorre. Se lo vuoi più comodo, la leva è l'altezza del box.

### Le cinque cose da provare in Electron (nessuna è stata provata lì)

1. Una **generazione reale** dal box giallo, con una classe a più materie — e con la
   taratura che si applica da sé dal profilo (nessuna spunta a schermo: vedi §12).
2. Il **PDF della catena dei perché** scritto in `Materiale Studio/Catena-dei-perche.pdf`
   (`html-to-pdf` e `save-vault-file` sono IPC: nel browser non esistono).
3. Il **Finder** con un PDF vero (nel browser i file sono iniettati con `DataTransfer`
   e pdf.js li rifiuta — gli `InvalidPDFException` in console sono quelli, non un difetto).
4. La **combo** SHIFT+CTRL+L,K,J,H con i tasti veri (provata l'API `inverti()`).
5. Gli **strumenti spostati** che funzionano davvero: URL, YouTube, i tre switch,
   «Adatta» con una classe VERA attiva (nel browser resta disabilitata: le classi
   stanno su disco), le Lenti spuntabili dentro il box FOCUS.

### Le trappole di questa sessione (le nuove stanno in §6)

Sei si sono ripresentate più volte e vale la pena rileggerle prima di misurare
qualunque cosa: **item alto zero che consuma il gap** (tre volte), **specificità: un id
solo non basta** (quattro volte, e una volta perdeva anche con DUE id contro uno,
perché l'altra regola aveva `!important`), **sub-resources dalla cache** anche con la
navigazione forzata (la cura sicura è un'ORIGINE nuova: cache è per-porta), **il click
programmatico non risponde ai dialoghi**, **le transizioni congelate a pannello
nascosto** (due volte: quando nemmeno uno stile inline `!important` cambia la misura,
non è la cascata — è la misura), e **`textContent` legge anche ciò che è
`display:none`** (una lettura che sembrava piena di doppioni inesistenti).
