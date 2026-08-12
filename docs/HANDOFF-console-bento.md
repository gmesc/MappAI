> ⚠️ **DIARIO, NON STATO DEL REPO.** Filone «console-bento / ELABORA», 6 – 12 agosto 2026.
> Lo stato di `main` — che cosa c'è, che cosa è acceso, che cosa manca — sta in
> **[`HANDOFF.md`](HANDOFF.md)**, ed è l'unico posto che lo dice.
> Questo file si legge per il **perché** di una decisione. Le sezioni che dicono
> «UNCOMMITTED» o «da fare» lo dicevano il giorno in cui sono state scritte: molte
> di quelle cose sono state fatte, e alcune sono state rovesciate.

---

# HANDOFF — Console-bento & officina-console + compito «INSEGNA a bento»
> Punto di ripresa esatto. Scritto 6/8/26, aggiornato 7/8, 8/8, 9/8, 10/8, 11/8, **AGGIORNATO 12/8/26**.
> Flag del cablaggio: `mappai_console_bento_app='1'` (acceso nel userData di Giacomo).

# 👉 SI RIPARTE DA QUI — 12/8

## In due righe
Il filone dei **documenti** è chiuso e committato: una cornice sola per testata e
piè, ELABORA che elenca le SORGENTI e INSEGNA i FILE, e il CLONE su tutti i
generi. Resta da provare in Electron **una cosa sola che conta** (sotto), e da
fare i debiti vecchi del 10/8.

## Stato del repo
```bash
cd "/Users/giacomomeschini/Claude/MappAI re"
git log --oneline -8                              # 3dfcd97 … 399e713
git status --short -- public tests main.js docs   # atteso: VUOTO
node --test tests/                                # atteso: 1063 pass / 0 fail / 2 skip
node tools/smoke/cornice-documenti.js             # atteso: TUTTO OK
node tools/smoke/elenchi-elabora-insegna.js       # atteso: TUTTO OK
```
`index.html` a **`?v=dh10`**. Nel working tree resta solo ciò che non è di questo
filone e va lasciato lì: lo stream **misuratore**, `Inkscape/`, `MappAI_logo.svg`.

⚠️ **`main` è 34 commit avanti su `origin` e il push NON parte da qui**: il
portachiavi non ha più credenziali per github.com (token scaduto il 23/7). Lo fa
Giacomo: `git push origin main`.

| commit | che cosa |
|---|---|
| `399e713` | **due moduli puri**: `mappai-doc-head.js` (la cornice) · `mappai-clona-core.js` (le copie) — +34 test |
| `fc7df6e` | i **sei fogli** passano alla cornice: testata unica, piè coi numeri di pagina |
| `90cda1b` | **ELABORA elenca le sorgenti, INSEGNA i file** + il clone su tutti i generi |
| `6dbaac7` | il blocco del 10-11/8 (domande aperte · preset «Default» · limite TTS) |
| `50afe07` | INSEGNA a un elenco solo, col bottone stampa (IPC `vault-file-print`) |
| `10f9b47` | i `.json` fuori dagli elenchi di INSEGNA |
| `90e4df7` | **rientro**: in INSEGNA tornano gli elenchi per GENERE, con le colonne allineate |
| `3dfcd97` | i banchi di prova entrano nel repo (`tools/smoke/`) |

⚠️ Gli ultimi due commit vanno letti insieme: l'elenco unico «Stampabili» è
durato una sera e Giacomo l'ha fatto rientrare. Di quel giro **resta** il bottone
stampa, le larghezze misurate, la fusione archivio↔file e i `.json` fuori.
La chiave i18n `lt_g_stampabili` è rimasta orfana, dichiarata nel dizionario.

## ✅ IL PDF DELLA COPIA — provato da Giacomo in Electron (12/8)
Il file di una copia si stampa col SUO nome: nella cartella restano due file, non
uno riscritto. Era l'unica prova che contava sul difetto chiuso per ultimo —
l'editor componeva il nome da genere + mappa e **ignorava la copia**, quindi ci
scriveva sopra in silenzio. Il fix su due lati regge: l'editor passa il nome, e
l'aggancio lo cerca come SEGMENTO (`buildFileName` mette il dettaglio prima del
nome).

Resta da provare, in ordine:
1. Il **bottone stampa** delle righe di INSEGNA: se il dialogo di sistema si apre
   o se scatta il ripiego (il file si apre nell'applicazione di sistema). ⚠️ Dal
   banco in Node NON si può provare: `_diskCache` è privata e la popola il
   caricamento di INSEGNA.
2. Le **colonne allineate** fra gli elenchi impilati: nel banco l'ultima colonna
   esce 58px perché la cache dei file è vuota; nell'app, con stampa · scarica ·
   cartella, dev'essere **134px** e uguale in tutte le tabelle.
3. Il **dossier** stampato: è il documento che è cambiato di più (testata ora
   stampata, piè presente anche a pagina 1).

## Che cosa resta da fare
- I tre **debiti del 10/8**, ancora aperti: il bottone «HTML» dell'editor a
  quattro passi · la **pipeline in sottofondo coi dati congelati** (oggi
  cambiando progetto mentre gira scrive i materiali della mappa nuova nel vault
  vecchio, in silenzio) · tre pezzi di codice morto della sintesi
  (`_voceNaturale()` cerca ancora l'MP3 fratello, `buildPrintHtml` accetta
  ancora `opts.audioSrc`, e due commenti dicono il contrario di ciò che il
  codice fa).
- **F6**: potatura della v1 di ELABORA (la v2 è accesa di default dall'11/8).
- Candidato dichiarato, NON urgente: `mappai-landing-teach.js` è a **3.512
  righe** e fa quattro mestieri (landing · console INSEGNA · tabelle condivise ·
  archivio). Le tabelle, che ormai servono due console, sono il pezzo che
  uscirebbe per primo — come hanno fatto la cornice e il clone.

## Dove guardare per capire com'è fatto
| | |
|---|---|
| la cornice dei documenti | `public/js/mappai-doc-head.js` (la nota in testa spiega le tre tecniche provate per il piè) |
| le copie | `public/js/mappai-clona-core.js` |
| gli elenchi di ELABORA | `_materiali()` in `mappai-elabora-console.js` |
| le tabelle condivise | `_consTabelleMateriali()` in `mappai-landing-teach.js` |
| i banchi di prova | `tools/smoke/` (+ `LEGGIMI.md`: che cosa NON possono provare) |

## Le trappole pagate in questo giro (non ripeterle)
- ⚠️ **Il marcatore di cache si bumpa DOPO l'ultima modifica, non prima.** Due
  volte Giacomo ha provato l'app e non ha visto il codice nuovo (`index.html`
  scritto alle 18:23, il modulo alle 18:25). Il sintomo sembra «la funzione non
  c'è», e si perde un giro a cercarla nel posto sbagliato.
- ⚠️ **Byte di controllo LETTERALI in una regex**: `mappai-clona-core.js` era
  «binario» per git (un NUL e un 0x1f scritti come byte invece che come
  `\x00`/`\x1f`). Committarlo così mette un blob nel repo — niente diff, niente
  review. Stesso incidente di `0941a05`. Si controlla con `file <percorso>`
  prima di committare un file nuovo.
- ⚠️ **Un apice inverso in un COMMENTO dentro un template literal** chiude la
  stringa. Sesta e settima volta in questo progetto.
- ⚠️ **Un test può passare per il motivo sbagliato.** Provato che i `.json` non
  finissero negli elenchi di INSEGNA usando la lista di ELABORA — che li scarta
  già da sé: il filtro nuovo non veniva esercitato affatto.
- ⚠️ **Il nome di una struttura dati descrive che cosa contiene; la sua vera
  definizione è che cosa i suoi lettori pretendono.** `studySets` sembra «i
  materiali di studio», è «le cose che il player sa giocare» — ed è il motivo
  per cui le domande aperte vivono altrove, con tutto quello che ne è seguito.

> ⚠️ **Da qui in giù è un DIARIO, in ordine cronologico inverso.** Le sezioni
> che dicono «UNCOMMITTED» lo dicevano nel momento in cui sono state scritte:
> oggi è tutto in `main` (vedi gli otto commit qui sopra). Si leggono per il PERCHÉ
> delle decisioni, non per lo stato del repo — quello sta solo in cima.

# ✅ 11/8 — LA V2 È ACCESA, E C'È UN GENERE NUOVO: «DOMANDE APERTE»

> Richieste di Giacomo + i difetti emersi dalle sue prove vere. Suite **1020/0/2**.
> `index.html`: i file toccati oggi portano **`?v=oq6`**, tranne quelli ritoccati dopo —
> pipeline `oq7`, stile-manifesto `oq8`, costruisci-manifesto `oq10`. Senza il marcatore
> l'app serve il vecchio dalla cache.

## La nuova ELABORA è il comportamento normale
`_v2()` legge ora `mappai_elabora_v2 !== '0'`: **default acceso**, kill-switch `'0'` che
riporta alla colonna a sette gruppi. La v1 vive ancora tutta nel modulo e si pota quando
questa avrà retto qualche giorno d'uso vero (è ciò che resta di F6, col conteggio dei
quattro gesti). Verificato in Electron senza nessun flag in storage: sidebar coi **29
progetti**, 0 errori.

## «Domande aperte» — il genere che gli altri non coprivano
Domande a cui si risponde **scrivendo**: il foglio porta le righe su cui scrivere e, in
coda su pagina nuova, le **tracce di correzione** per il docente.

| pezzo | dove |
|---|---|
| genere e nome file | `mappai-pipeline-core.js` → `open_questions` → `Domande-aperte-<Mappa>.pdf` |
| prompt | `OPEN_QUESTIONS_GENERATOR_{IT,EN}` nei due JSON + categoria **STUDY** del pannello admin |
| generazione | `_genOpenQuestions` in `mappai-material-pipeline.js` (gemello di `_genFlashcards`, con ripiego inline se il template manca) |
| foglio | `window.buildOpenQuestionsHtml` in `mappai-quiz-print.js` (accanto ai suoi fratelli, stessi stili) |
| UI | spunta **`mp-qt-open`** nel box **Quiz** del bento (4ª voce) e nel modale |
| elenchi | `_diskKind` → «Domande aperte» (icona `pen-line`) + gruppo suo in `GRUPPI_MAT` |
| consumi | sottovoce `quiz_open` della categoria pipeline |

- **È un tipo di quiz per la CONFIGURAZIONE, un DOCUMENTO per la pipeline.** Sta nel box
  Quiz perché per il docente è la stessa scelta («che verifica preparo?»), ma
  `_QT.open` porta `documento: true` e **salta `studySets`**: il player di studio e
  l'editor si aspettano delle opzioni e un indice della risposta esatta, e un item senza
  opzioni li romperebbe **in silenzio**. Il materiale è il PDF nel vault + la voce
  d'archivio `quizpaper` (l'HTML, non il PDF: da lì INSEGNA sa ristampare la versione
  senza tracce — da un PDF non si ricava più niente).
  ⚠️ **Conseguenza dichiarata**: in ELABORA il foglio non ha «Modifica» (D4: nessuna
  sorgente editabile). Renderlo correggibile è un genere nuovo nell'editor: lavoro a sé.
- **La macro-area non si chiede all'AI**: il ramo lo sappiamo già (è quello per cui stiamo
  generando), e chiederlo al modello vorrebbe dire poter ricevere un nome che nella mappa
  non esiste. Finisce come **kicker** accanto al numero della domanda: su un foglio di 12
  domande è ciò che dice allo studente dove ripassare.
- **Righe vere** (un bordo per riga), tante quante ne dichiara la domanda — 3 breve, 5
  spiegazione, 8 confronto — con clamp 3-12: uno spazio bianco senza righe fa scrivere
  storto e non dice quanto ci si aspetta.

**Provato in Electron, non a occhio**: `fillPromptTemplate` riempie il template (1336
caratteri, zero placeholder residui) · **una chiamata AI VERA** → 3 domande nella forma
attesa, con tracce e righe 5/8/3 coerenti col tipo di risposta · PDF costruito e
ispezionato con `pdftotext`/`pdftoppm`: **17 righe disegnate** dove ne erano attese 17,
kicker presente, «Tracce di correzione» su pagina nuova nella copia del docente e
**assenti** — testo E sorgente JSON — in quella per gli allievi · spunta nel box **Quiz**
(4ª voce, accanto a Scelta multipla · Flashcard · Vero/Falso) · e la prova che la
configurazione la LEGGE davvero: la stima passa da **B 7 a B 14** (7 rami × 2 tipi).
+3 test (core: conto e nome; classificatore esteso; derivati del master aggiornati).

## Round 5 (11/8) — IN CREA UNA BRICIOLA SOLA (e un difetto che nascondevano)
Domanda di Giacomo: «ha senso mostrare le briciole nella sezione Crea?». Misurando: **no**,
e il perché è peggio di un doppione — in CREA il contesto era dichiarato in **due punti**,
con la stessa parola per due cose diverse:

| | briciole in alto | box giallo del bento |
|---|---|---|
| **«Cosa»** | la **sezione** (Crea/Elabora/Insegna) | la **materia** |
| «A chi?» / «Chi:» | classe o allievo | classe o allievo |
| «Materia» / «Cosa:» | materia | materia |

Ora in CREA resta **la prima briciola** («Crea», che apre il menu delle tre sezioni) e il
**box giallo** (per chi genero): il doppione del contesto sparisce, l'uscita no. Gli altri
livelli li taglia il JS (`livelli.slice(0,1)`), non il CSS — un livello nascosto col foglio
resterebbe nel percorso di tabulazione e nella lettura dello schermo.
- 🐛 **Errore mio, corretto subito dopo (Giacomo: «entrando in Crea non posso più
  uscire»)**: avevo tolto la cascata INTERA dando per scontato che la sezione la dicesse il
  **rail delle tre forme**. Non l'avevo verificato, e il codice lo dichiara nero su bianco:
  `montaRail()` esce alla prima riga quando il cablaggio bento è acceso — «niente rail,
  «Cosa» del percorso lo sostituisce». Col bento **il rail non esiste**, quindi le briciole
  erano l'unica uscita da CREA. Misurato dopo la correzione: `#manifesto-rail` assente,
  briciola «Crea» presente, menu con Crea/Elabora/Insegna, uscita verso INSEGNA e ritorno.
  ⚠️ La lezione: prima di dire «quel comando c'è già altrove», **guardare se c'è**.
- ⚠️ Si nasconde invece il **chip**: senza la cascata completa, `renderChip`
  (mappai-live-classes.js) lo rimonta nell'header — sarebbe di nuovo lo stesso contesto in
  due posti. Quello sì via CSS, perché i due nodi li montano DUE moduli diversi su eventi
  diversi: una guardia nel primo non fermerebbe il secondo.
- 🐛 **Il difetto che le briciole mascheravano**: il box giallo si popolava **solo al
  montaggio**. Cambiando classe o materia da un'altra superficie (console, Cabina,
  «Assegna classe e disciplina») restava indietro — e la generazione sarebbe finita nella
  cartella di un destinatario diverso da quello che il docente crede. Prima lo si vedeva dal
  chip in alto; senza, sarebbe diventato **invisibile**. Ora il box si riallinea sull'evento.
  ⚠️ **DUE eventi, non uno**: `setActive` annuncia `mappai-active-class-changed`,
  `setActiveDiscipline` annuncia `mappai-active-discipline-changed`. Ascoltandone uno solo,
  «Chi» seguiva e la materia restava indietro — misurato. Guardia anti-rientro perché
  scegliere NEL box chiama `setActive`, che riemette lo stesso evento.

**Provato in Electron**: landing vuota → «Cosa» (invito) · CREA → **«Crea»**, un livello
solo, niente chip, box giallo al suo posto · il menu della briciola porta a Elabora/Insegna
e il giro CREA → INSEGNA → CREA funziona · console → cascata intera («Insegna › A chi?») ·
contesto cambiato da fuori → il box giallo passa a **4R · Geografia** e `mp-class` si
popola · scelta dentro il box → **un solo giro d'evento**, nessun rientro. 0 errori console,
suite **1020/0/2**.

## Round 4 (11/8) — CREA a SEI box, e il preset «Default» che governa la generazione
Decisione di Giacomo: «meno box, meno attrito». **Preset · Quiz · Fogli nodi · Fonte &
Sintesi** passano al gruppo che si rivela con **SHIFT+CTRL+L,K,J,H**. La schermata
d'ingresso resta a **sei box**: i quattro pezzi della prima sezione (fonti, elenco, genere,
opzioni del genere) + il box giallo del contesto + l'azione che conclude.
- Il gesto che li sposta è **togliere `stile: CHIARO`**: il marcatore dei nascondibili è il
  FONDO SCURO, non un flag — `nascondibile()` legge lo stile, e un riquadro scuro in mezzo
  ai chiari è già la sua etichetta nell'officina. Nessuna seconda lista da tenere allineata.
- ⚠️ **I box restano MONTATI nel DOM**, solo nascosti: `_readConfig()` legge i loro campi.
  È ciò che permette al preset di governare la generazione senza che nessuno apra la vista
  estesa. Smontarli davvero riporterebbe la configurazione ai default del markup, e le
  domande aperte sparirebbero in silenzio.
- 🐛 **Difetto colto dai test, non da me**: resi nascondibili, i quattro box erano rimasti
  **in mezzo** al mega-bento — la combo li avrebbe rivelati spezzando la griglia. Il test
  «i box extra stanno DOPO il mega-bento» è caduto subito: ora sono spostati in coda
  davvero, e l'ordine è `upload · elenco · genere · genere-opz · ctx · azioni` + gli extra.

**Il preset «Default».** Con le opzioni fuori vista, la configurazione di partenza non può
più venire dalle spunte del markup — nessuno le vede — e diventa un preset, che è la forma
in cui una configurazione si dice, si salva e si cambia. `Pipeline.assicuraPresetDefault()`
lo crea se manca, sceglie quale governa la sessione (l'ULTIMO applicato a mano, ricordato
in `mappai_preset_attivo`, o «Default») e lo applica **a ogni montaggio del bento**.
- 🐛 **La prima stesura applicava una volta sola, con un marcatore — ed era sbagliata.**
  Le spunte NON persistono: sono campi del DOM, ricostruiti dal markup a ogni avvio. Così
  il preset avrebbe governato solo la primissima sessione e dal secondo riavvio la
  generazione sarebbe ripartita dai default del markup — solo scelta multipla, niente voce,
  niente domande aperte — cioè esattamente ciò che il preset doveva evitare, e **senza che
  si vedesse**, perché quei campi non sono più a schermo. Trovato al primo riavvio dopo lo
  spostamento dei box. `montaBento` gira una volta per sessione, quindi riapplicare non
  cancella le scelte fatte nella vista estesa mentre si lavora.
- ⚠️ **Un «Default» PUÒ ESISTERE GIÀ** — è il caso vero trovato provando: quello di Giacomo
  aveva `mc+tf+flashcards`, 6 domande per ramo, fogli «parole chiave + scheda». Le sue
  scelte **non si toccano**: si aggiunge soltanto ciò che ha chiesto che il Default
  comprenda — **domande aperte e voce naturale** — una volta sola, con un marcatore suo
  (`mappai_preset_default_oq_v1`). Senza quel marcatore, chi togliesse di proposito le
  domande aperte se le ritroverebbe al riavvio: sarebbe una preferenza che non si può
  esprimere.
- Se la migrazione **cambia** il preset, il marcatore «già applicato» si azzera e i campi si
  riallineano: altrimenti la tendina direbbe «Default» mentre le spunte raccontano il
  Default di prima, e le domande aperte non si genererebbero pur essendo nel preset.
- `tuned`/`levelTuned` a **true** non è un dettaglio: `_applyPreset` deriva da lì la spunta
  «Adatta alla classe», che il bento monta nascosta e accesa. Un preset che li lasciasse
  falsi la spegnerebbe, e la taratura del contesto attivo sparirebbe dai prompt in silenzio.
- 🐛 **Chiuso prima che mordesse**: `_VALID_TYPES` non conosceva `'open'`, e
  `presetNormalize` filtra su quella lista — un preset con le domande aperte si sarebbe
  salvato con la spunta accesa e riaperto senza. +2 test.

**Provato in Electron**: CREA a **6 box** (0 sbordi, 0 errori), la **combo vera** rivela i
16 e riporta ai 6 · preset «Default» in tendina con `['mc','tf','flashcards','open']`, voce
ON, catena ON, 6 per ramo, fogli «keywords+card» — cioè le scelte di Giacomo **più** le due
chieste · i campi seguono il preset **a ogni riavvio** (provati due riavvii di fila) · un
preset scelto a mano viene **ricordato** e governa l'avvio successivo (provato con un
secondo preset, poi rimosso) · e la prova che `_readConfig` legge i box nascosti: la stima
passa da **41 a 48** chiamate spegnendo e riaccendendo le domande aperte (7 rami × 4 tipi =
28 per i quiz).
⚠️ **Marcatori di cache**: uno dei replace non aveva trovato la stringa e
`mappai-material-pipeline.js` era rimasto indietro pur essendo il file più toccato. Ora
**tutti i file toccati oggi portano lo stesso `?v=oq6`** (la pipeline `oq7`), così il numero
da guardare è uno solo.
⚠️ **Da sapere**: col Default così, una generazione costa **~48 chiamate**. È la
conseguenza di avere quattro generi di quiz insieme: si riduce dalla vista estesa, dove i
box ora vivono. Suite **1020/0/2**, `index.html` a `?v=oq6`.

## Round 3 (11/8) — 🐛 LA VOCE NATURALE SFONDAVA IL LIMITE DI GOOGLE
Dalla prima generazione vera di Giacomo: **429, «limit: 10, model: gemini-2.5-flash-tts»**.
Non era un caso sfortunato ma un difetto strutturale, con tre facce:
1. la voce fa **una chiamata per blocco**, in fila e senza pause: una sintesi di venti
   blocchi ne spara venti in pochi secondi, e il piano gratuito ne ammette **10 al minuto**;
2. **nessun retry**, benché l'API dichiari nella risposta stessa quanto aspettare
   (`retryDelay: "59s"`, «Please retry in 59.724s»);
3. **tutto il lavoro perso**: i clip già generati — e già pagati — venivano buttati insieme
   all'errore.

**Che cosa c'è ora** (logica pura in `mappai-usage-core.js`, +2 test):
- `nextSlotMs(timestamps, now, limite)` — **finestra scorrevole**, non una pausa fissa: le
  prime 10 partono subito (una sintesi corta non rallenta di un secondo) e solo dopo si
  aspetta quanto serve alla più vecchia per uscire dal minuto. Tetto configurabile con
  `mappai_tts_rpm` — **non è una proprietà del nostro codice ma del piano di chi usa
  l'app**: chi paga non deve aspettare per un limite che non ha.
- `retryDelayMs(err)` — legge l'attesa dichiarata dall'API (entrambe le grafie, vince la
  più lunga: ritentare troppo presto è un secondo 429 e un altro giro perso); `0` se non è
  un rate limit, così un errore vero non viene ritentato tre volte per niente.
- **L'attesa si DICE**, secondo per secondo, sull'overlay: un minuto di silenzio su una
  barra ferma si legge come un blocco dell'app.
- **Cache dei clip per (testo + voce + modello)**: se la generazione si ferma a metà, al
  secondo tentativo si riparte da dove si era arrivati invece di ricomprare tutto. Se il
  docente corregge una frase, si rigenera quel blocco **e solo quello**.

⚠️ **Verifica: onestà su che cosa è stato provato.** Le due funzioni pure sono testate
(10/10) e il cablaggio è stato controllato a costo zero (il percorso legge il core, la
finestra risponde 0 con 3 chiamate e 51s con 10, l'errore VERO di Giacomo → 59724ms). La
**cache è provata**: 7 blocchi serviti in 0,1s senza toccare la rete. Il throttle e il
retry sul campo NO: non si possono simulare.
⚠️ **Trappola nuova, e mi è costata chiamate di Giacomo**: `window.electronAPI` è
**congelato dal contextBridge** — sostituirne un metodo per fare da stub NON ha effetto e
non dà errore, quindi la mia «prova simulata» ha fatto ~7 chiamate TTS **vere** (testo
finto, clip brevi). Per simulare il provider bisogna intervenire nel main, non nel
renderer.

## Round 2 (11/8) — l'EDITOR delle domande aperte, e le domande a due macro-aree
Due richieste di Giacomo. Suite **1016/0/2**, `index.html` a **`?v=oq2`**, 0 errori console.
(Sul foglio flashcard: **lasciato con i colori che ha** — sua decisione.)

**1. Da una a DUE macro-aree per domanda.** Prima ogni domanda nasceva dal materiale di UN
ramo: si potevano chiedere solo domande interne a un'area. Ora ogni ramo viene generato
insieme a un **ramo compagno**, e almeno una domanda deve collegarli.
- Il compagno **non si chiede all'AI e non si prende a caso**: `_ramoCompagno` conta i link
  fra i due sottoalberi (i cross-link del KG, i rimandi della MindMap) e prende il più
  connesso; a pari merito e senza collegamenti, il ramo successivo. Deterministico: la
  stessa mappa dà sempre le stesse coppie. Le chiamate AI restano **una per ramo**.
- Il modello dichiara `aree` per ogni domanda, e quelle si **filtrano contro i due nomi
  veri**: se ne inventa una terza o storpia un titolo, sul foglio comparirebbe un kicker
  che nella mappa non esiste. Tetto di due, applicato dal core.
- Il foglio mostra uno o due chip (`Clima + Idrosfera`); `l1` resta letto per i fogli
  scritti prima — un documento già sul disco non si riscrive.

**2. L'editor, gemello di quello dei quiz.** `openOpenQuestions(docId)`, kind **`openq`**.
- **La sorgente è la voce d'ARCHIVIO**, non un set di studio: le domande aperte non entrano
  in `studySets`, e il foglio HTML che la pipeline archivia porta il JSON delle domande
  incorporato (`setFromHtml`). È la stessa strada dei quiz cartacei di INSEGNA, ed è il
  motivo per cui in archivio va l'HTML e non il PDF.
- Il foglio ha i tre campi del genere: **traccia** di correzione, **righe** (3-12), **aree**
  come chip che si accendono — l'elenco sono le macro-aree VERE della mappa, più quelle già
  scritte nel documento (toglierle farebbe sparire un chip che il foglio mostra). Con due
  aree scelte, gli altri chip si **disabilitano**: la regola si vede prima di essere
  contestata, e non si sostituisce un'area a sorpresa.
- Nel core: `normOpenItem` · `setOpenField` · `blankOpenItem` · `validateOpenDoc`, **+5
  test**. ⚠️ Funzioni PROPRIE e non `normItem`/`setField`: quelle normalizzano verso la
  forma del quiz e **scarterebbero traccia, righe e aree in silenzio** — c'è un test che
  fissa proprio quel comportamento, così il prossimo che le riusa qui lo scopre subito.
- «Stampa» chiede **con o senza tracce** (le stesse due voci del quiz) e scrive il PDF nella
  cartella; il file del vault è la copia del docente. In ELABORA la riga del PDF ha ora
  **«Modifica»**, perché la sua sorgente esiste: `_docArchivioAperte()` la trova per mappa +
  genere, e il ramo `openq` di `_dipingi` sta **prima** di quello `disk:` (altrimenti
  l'anteprima del PDF si rimonterebbe sopra l'editor appena aperto).

**Provato in Electron sul vault vero**: riga → anteprima → **Modifica** → editor con 2
domande, tracce, righe 5/8, chip `Clima✓` e `Clima✓ Idrosfera✓` con gli altri disabilitati
→ modifiche (traccia, righe 8→10, un'area tolta) → **Salva** → round-trip verificato
rileggendo l'HTML archiviato: `lines: 10`, `areas: ['Clima']`, **una sola voce**. File di
prova e voci d'archivio poi rimossi (cartella e archivio come prima).

🐛 **Due difetti trovati e chiusi mentre provavo**, entrambi silenziosi:
- **`list()` dell'archivio NON porta l'HTML** — dice solo `hasHtml`. Filtrare su `d.html`
  non scarta: **azzera**. L'aggancio non agganciava niente e «Modifica» non compariva mai.
  ⚠️ È la trappola scritta nel commento del core («chi filtrava su `d.html`… svuotava
  silenziosamente gli elenchi») e ci sono cascato lo stesso.
- **`saveDoc` con un `id` passato a mano e il titolo cambiato crea DUE record con lo stesso
  id**: il dedup è per `(kind|title|mapName)`, quindi la chiave nuova non combacia e la voce
  si aggiunge invece di sostituire. Ora l'id non si passa (il dedup lo riusa da sé) e la
  voce vecchia si toglie quando il titolo cambia. Verificato rinominando: **una voce, zero
  id duplicati**.

⚠️ **Aperti dichiarati**: `#mp-estimate` **non è montato nel bento** (aperto dal round 10:
la stima è viva ma non si vede — è una riga da trascinare in Officina §7; l'ho montata a
mano per misurare, e tolta) · una generazione VERA end-to-end della pipeline con la spunta
accesa non è stata fatta (costa token di Giacomo: la catena è provata pezzo per pezzo,
l'ultimo miglio no — con essa si vedrebbero le prime domande a due aree su una mappa vera) ·
un foglio di domande aperte **senza voce d'archivio** (PDF sopravvissuto alla potatura dei
30 documenti, o vault ricevuto da un collega) resta in sola lettura: l'editor lo dice, ma
la sorgente non si può ricostruire da un PDF.
⚠️ **Trappola ripagata, quinta volta**: un apice inverso in un COMMENTO dentro un template
literal chiude la stringa — `node --check` l'ha preso al volo, ma è lo stesso errore di
sempre.

# ✅ FATTO — ELABORA ristrutturata (F0-F5; di F6 resta la potatura della v1)

> **La fonte di verità è [`docs/SPEC-elabora-console.md`](SPEC-elabora-console.md)**
> (git-ignored come questo file): 8 decisioni D1-D8, la macchina a tre stati
> (tabelle → anteprima → editor), il contratto della lista materiali, le fasi F0-F6,
> la tabella di ciò che si riusa, e le 9 trappole note che il lavoro incrocia.
> Qui solo lo stato di avanzamento.

- **F0 ✅ FATTA e verificata** (10/8 sera): `MappAITeach.tabelleMateriali(lista,
  conMappa, dove)` + `filtraSintesi` esportate. Stessa chiamata → INSEGNA vede
  `Sintesi-voce-X.html`, ELABORA vede `Sintesi-X.html`, altri generi identici in
  entrambe. Cambio innocuo: nessun chiamante esistente passa `dove`.
- **F1 ✅ FATTA e verificata** (10/8 notte): `_materiali()` in
  `mappai-elabora-console.js` — la lista unificata del §4 (fonte + set editabili + disco),
  esposta come hook `MappAIElaboraConsole.materiali()` (sola lettura). Nessun cambio
  visibile: nessun chiamante in-app la usa ancora.
  - **L'aggancio archivio↔disco (D3) è dentro**: per ogni set si calcola il nome che
    `buildFileName` produrrebbe (forma nuova E variante storica ` -VERDE`, esatta prima);
    se sul disco c'è → UNA voce con entrambe le nature (`id` del set + `relPath` del
    file, titolo/data dal file, `archivio: true`). Fusione SOLO senza ambiguità: due set
    che reclamano lo stesso nome restano voci separate — «mai una voce sbagliata».
  - Se `_disco === null`, `_materiali()` avvia `_caricaDisco()` e compone con quello che
    c'è: al ritorno `rifaiEsterno` ridisegna — lo stesso patto asincrono della colonna.
  - **Verificata ESEGUENDO i moduli veri in Node via `vm`** (pipeline-core + docedit-core
    + elabora-console, window/appState/electronAPI finti — trappola §7.8: eseguire, non
    parsare): 16/16 — fonte, aggancio esatto, aggancio ` -VERDE` (V/F via `isTrueFalse`),
    set senza file NON fuso, `Sintesi-voce` mai in lista (filtro D8 a monte esercitato),
    nessun file fuso duplicato, cls/disc vuoti, ambiguità (2 set MC) → nessuna fusione.
    Script: `smoke-f1.js` nello scratchpad di sessione (fixture: 3 set + 5 file disco).
- **F2 ✅ FATTA e verificata** (10/8 notte): flag **`mappai_elabora_v2`** (default OFF) +
  lo scheletro. `_schema()` biforca in `_schemaV2()`: sidebar = **progetti** del contesto
  (`_navV2`, VOCI del motore `{id:'prog:<id>', etichetta, icona map/network, attiva}` sotto
  un'intestazione NON collassabile), area = **S1** con `s.tabelle` — la FONTE come prima
  tabella costruita qui (D2: `tabelleMateriali` non la conosce), poi i generi da
  `tabelleMateriali(resto, false, 'elabora')` su `_materiali()` (F1). Senza progetto del
  contesto → invito «Scegli un progetto nella colonna». Stato di modulo `_prog`/`_doc`
  dichiarato (§3), azzerato in `dopo()`, `open()` e alla chiusura.
  - **Clic su un progetto in sidebar** → `_conSalvataggio` → `_cambiaMappa(m)` — la
    STESSA strada della briciola (azzera, aspetta l'identità, ridisegna); la voce in
    caricamento resta marcata attiva via `_inCorsoV2` (doppione dichiarato di `_inCorso`,
    che vive dentro `open()`: F5 riordina lo stato).
  - **«Crea nuovo» NON c'è in v2 fino a F3**, per scelta: i tipi «dalla mappa» aprono
    l'editor, che in F2 non ha una tela dove disegnare — un bottone che apre un documento
    rotto è peggio di un bottone che manca.
  - **Nav mai di sole intestazioni**: con 0 progetti la colonna porta la riga `vuoto:prog`
    («Cerco i progetti…» / «— nessun progetto —»), già ignorata dal gestore `__nav`.
    Il validatore lo pretendeva, e ha ragione.
  - **Verificata**: smoke `vm` esteso a 26/26 (v1 invariato a flag OFF · tabelle senza
    tela · fonte prima · `dove:'elabora'` · fonte fuori da `tabelleMateriali` · niente
    «Crea nuovo» · invito senza mappa) + **`validaSchema` del motore: 0 errori / 0 avvisi**
    su entrambi gli stati v2. Chiavi EN nuove: `ec_g_progetti`, `ec_prog_cerco`,
    `ec_scegli_prog_col`. Suite **1009/0/2**.
  - 🐛 **Preesistente, dichiarato e NON corretto**: lo stato v1 «nessun progetto del
    contesto» (nav = 6 gruppi vuoti, zero voci) fallisce `validaSchema` con «console senza
    navigazione». Non è di oggi e v1 muore a F6: si segnala, non si rattoppa.
- **F3 ✅ + F4 ✅ FATTE e PROVATE IN ELECTRON** (10/8 notte, via CDP sull'app vera coi
  vault di Giacomo — flag acceso solo per la prova e RIMOSSO a fine giro, app chiusa per
  PID). Fatte insieme perché si intrecciano negli stessi gestori. La macchina a tre stati
  gira TUTTA su «11 Sistema Terra» (16 righe vere), **0 errori pagina** lungo l'intero
  percorso:
  - **S1 → S2**: clic riga (`_apriDocV2`) — sintesi dal disco → iframe `srcdoc` 42 KB con
    barra «Modifica · Stampa · HTML · Finder · Esci»; fonte PDF → `#ec-src` col visore +
    `sourceActions` + «esci-doc»; **set FUSO → si mostra il FILE** (`Quiz-MC-… -VERDE.pdf`
    nel visore PDF, niente «HTML» che su un PDF non ha senso) **e «Modifica» apre il SET**
    (D4: la sorgente c'è) — misurato: l'aggancio F1 ha fuso i 3 set veri coi loro file
    ` -VERDE` via la variante storica del nome.
  - **S2 → S3**: «Modifica» → editor VERO nella tela («Sistema Terra — Scelta Multipla»,
    `haDocumento` true). Set non fuso → `_montaAnteprimaSet` dal builder headless (quiz
    CON soluzioni: è la revisione del docente, non la copia da consegnare — dichiarato).
  - **S3 → S2**: sia con ESC sia con l'USCITA dell'editor (`mappai-doc-uscito` →
    `_tornaAnteprima`) — l'anteprima si RIGENERA (file riletto, builder rieseguito).
    ⚠️ Assunzione della spec da confermare con Giacomo: dall'editor si torna
    all'ANTEPRIMA, non alle tabelle.
  - **S2 → S1**: ESC e «Esci»; **S1 + ESC = niente** (si resta nella console). Cambio
    progetto in sidebar CON documento aperto → mappa nuova, S1 con le SUE 23 righe, voce
    attiva giusta.
  - Cestino delle righe = `confirmDeleteText` (ora **esportata da MappAITeach**: regola
    §10.15, un posto solo) + `deleteVaultFile` + segnale sul bus; senza conferma il gesto
    NON parte (nessun ripiego che elimina zitto). «Apri nel Finder» di riga sempre sul
    vault ATTIVO — ⚠️ la `_diskCache` di INSEGNA è per `relPath` senza vault: fidarsene
    qui aprirebbe il file di un'altra mappa. «Crea nuovo» rientrato (S3 diretto, natura
    `crea`, ritorno a S1). Chiavi EN: `ec_esci`, `ec_esci_tip`, `ec_modifica_set_tip`,
    `ec_modifica_tip2`, `ec_set_via`, `ec_anteprima_ko`, `ec_del_set`, `ec_del_ko2`.
  - **NON ancora provato**: il cestino con eliminazione VERA (non esercitato sui file di
    Giacomo, ovviamente); «Crea nuovo» v2 end-to-end (foglio nodi/catena da S1);
    S3 con modifiche SPORCHE → domanda di salvataggio nelle tre vie; «Stampa»
    dall'anteprima-set; il caso set non fuso a schermo (i 3 set della mappa di prova sono
    tutti fusi). Lo smoke `vm` resta a 26/26 e `validaSchema` a 0/0.
- **F5 ✅ FATTA e PROVATA IN ELECTRON** (10/8 notte, stesso giro CDP): in v2 la quarta
  briciola «Progetto» NON si monta più (una riga: `pronto && !_v2()`) — le briciole
  filtrano QUALI progetti, QUALE lo dice la sidebar (D1). Verificato dal GESTO VERO:
  briciola «A chi?» → 4R → «Materia» → Geografia → percorso «Elabora › 4R › Geografia»,
  sidebar filtrata alle **6 mappe di 4R·Geografia**, progetto scelto → briciole INVARIATE
  (mai il nome del progetto) e voce attiva in sidebar. ESC+scala e azzeramento su cambio
  contesto erano già dentro F2-F4.
  - 🐛 **Difetto latente trovato (e chiuso) pilotando via CDP**: `open()` senza guardia
    impilava una SECONDA console sulla prima a una doppia chiamata programmatica —
    `rifaiEsterno` ridisegnava solo la nuova e la vecchia restava a schermo coi dati di
    prima (misurato: 2 `.mm-box--piena`, la zombie ferma a 5 righe). Dal percorso utente
    non ci si arriva (il rail passa da `onCosa`, che chiude prima). Ora `if (_aperta)
    return;`. ⚠️ Da chiedersi se la console INSEGNA abbia la stessa porta aperta.
  - ⚠️ Trappola ripagata DUE volte nel giro: cambiare contesto via `CL.setActive` da CDP
    (fuori percorso) lascia briciole e sidebar ferme — NON è un difetto, è il motivo per
    cui si verifica dal gesto vero (briciole → menu → voce).
- **✅ LE DUE ASSUNZIONI SONO CONFERMATE DA GIACOMO (11/8)**: ESC dall'editor torna
  all'**anteprima**, un secondo ESC porta alle **tabelle** (verificato dopo il cambio
  async di `backToList`); l'anteprima dei set esce **con le soluzioni** — «e poi anche il
  PDF deve uscire con le soluzioni».
- **✅ IL PDF DEL VAULT ESCE CON LE SOLUZIONI** (`_payloadFile` in `mappai-doc-editor.js`:
  `_quizHtml(false,false)` → `_quizHtml(true,false)`). Chiudeva un disaccordo fra i due
  produttori dello stesso file: la **pipeline** lo scrive col foglio soluzioni da sempre
  (`buildQuizSetHtml` senza `includeAnswers` vale `true`), l'**editor** lo scriveva senza
  — stesso nome, stessa cartella, contenuto diverso a seconda di chi l'aveva scritto.
  - **Verificato sul PDF VERO**, non a occhio: percorso completo nell'app (riga → Modifica
    → digito → Stampa → nome) → file scritto in `Materiale Studio/` → `pdftotext`:
    **15 pagine, l'ultima è «Soluzioni»** con le risposte; il gemello senza soluzioni ne
    fa 14. File di prova poi **rimosso nel Cestino**, titolo del set ripristinato e voce
    d'archivio ripulita (verificato: cartella e archivio come prima).
  - ⚠️ **Costo dichiarato**: un PDF non si ricostruisce, quindi dal file del vault non si
    ricava più la copia per gli allievi (in INSEGNA `printQuizPaper` su un PDF lo apre e
    basta). Quella copia resta sulle due strade che partono dal SET: «Stampa» nell'editor
    (modale «senza soluzioni») e la condivisione QR, che agli allievi manda sempre la
    versione muta.
- 🐛 **CHIUSO l'aperto più vecchio: gli 8 `confirm()` NATIVI dell'editor** (era «l'ultimo
  pezzo fuori dal motore dei modali», dichiarato dal 9/8). Non era teoria: **mi ha bloccato
  l'app due volte in questo giro**, sulla strada del punto qui sopra.
  - **La diagnosi che mancava**: in Electron `confirm()` è un dialog **nativo del main
    process** → blocca il renderer, e dal CDP il dominio `Page` **non lo vede**
    (`Page.handleJavaScriptDialog` risponde «No dialog is showing»): sembra un crash o un
    loop, e si perde tempo a cercare il loop. Il colpevole vero era la validazione
    «Il documento ha dei problemi» di `_saveQuiz`, che dal 9/8 sta sulla strada di
    «Stampa» — e in v2, dove «Modifica» è a un clic, la si incontra subito.
  - Tutti e 8 passano ora da `_chiedi()` → `MappAIModal.conferma` (ripiego a `confirm` solo
    dove il motore non c'è: banchi e harness). `_saveQuiz` · `_saveCausal` ·
    `_saveNodeSheet` · `_printNodeSheet` · `nsDelCard` · `delQuestion` · `delBlock` ·
    `backToList` diventano **async**, e con esse `save()`: i due chiamanti la attendevano
    già (`_salvaDoveVive` con `await`, la console con `Promise.resolve`).
    ⚠️ `backToList` senza modifiche in sospeso **non esegue nessun `await`**, quindi resta
    sincrona — e con essa l'annuncio `mappai-doc-uscito`, su cui la console conta per
    togliere l'host PRIMA che `render()` cerchi dove disegnare.
  - Il bottone ora dice il GESTO («Salva comunque», «Elimina», «Esci senza salvare»…):
    `confirm()` aveva solo OK/Annulla. 6 chiavi EN nuove (`de_*_ok`).
- ⚠️ **Trappola nuova, costosa**: `window.electronAPI` è esposto via **contextBridge** e le
  sue proprietà sono **read-only** — sovrascrivere `saveVaultFile` con uno stub **non
  fallisce, viene ignorato in silenzio**, e la prova che credevo a vuoto ha scritto un file
  VERO nel vault di Giacomo. Per provare senza toccare il disco si stubba il livello sopra
  (`buildQuizSetHtml`, `openPrintable`), mai l'IPC.
- **F6 = il primo gesto della prossima sessione**: il conteggio dei quattro gesti
  (correggi sintesi · stampa quiz · file per mail · cambia documento), lo switch del
  default e la potatura della v1 (con essa muore anche il difetto preesistente «console
  senza navigazione» dello stato vuoto v1, dichiarato sopra).
- ⚠️ La regola che regge tutto: **`_voce` va sostituita, non riusata** — oggi fa due
  mestieri (progetto e documento), e tenerla con semantica nuova romperebbe in silenzio
  i punti censiti nella spec (§3).

# 🎯 LE DECISIONI DEL 10/8 SERA — la sintesi diventa DUE file (in corso)

> Prese in chat con Giacomo. Scritte qui perché in chat si perdono, e da queste dipende
> tutto il blocco successivo (default «genera tutto», Domande aperte, ristrutturazione di
> ELABORA). **Lavoro iniziato, NON finito**: vedi «cosa manca» in fondo alla sezione.

## Il modello: due file, non due stati

| | nome | dove si vede | si modifica? |
|---|---|---|---|
| editabile | `Sintesi-<Mappa>.html` | **solo ELABORA** | sì |
| con voce | `Sintesi-voce-<Mappa>[-<nome scelto>].html` | **solo INSEGNA** | **no** |

- L'MP3 **non si scrive più come file separato**: vive dentro l'HTML con la voce (base64,
  ~8 MB). Il motivo del file accanto era tenere leggero il documento, e quel motivo è
  caduto separando i due file: l'editabile resta a ~60 KB.
- Il marcatore **` -VERDE` non si scrive più** su nessun materiale. Aveva un mestiere —
  distinguere la versione tarata per una classe inclusiva da quella standard — finito
  quando la taratura ha smesso di essere una scelta e ha cominciato ad applicarsi da sé
  dal contesto attivo (5/8). ⚠️ **Conseguenza da conoscere**: due generazioni della stessa
  mappa producono ora lo stesso nome e la seconda sovrascrive la prima. È sicuro solo
  finché vale quella premessa.
- ⚠️ **Il marcatore «voce» sta IN TESTA**, attaccato al tipo (`Sintesi-voce-`), non dopo il
  nome della mappa: la classificazione (`_diskKind`) decide con espressioni ancorate
  all'inizio, e una regola che dovesse scavalcare un nome di mappa di lunghezza ignota
  sarebbe fragile. Stesso precedente di `Quiz-MC` / `Quiz-VF`.
- ⚠️ **`^Sintesi-voce` va PRIMA di `^Sintesi`** in ogni classificatore: la generica cattura
  anche l'altra, e messa per prima fa sparire la distinzione **in silenzio**. C'è un test
  che lo verifica (`tests/pipeline-core.test.js`).

## Il bottone «HTML» dell'editor (DA FARE)

1. salva l'editabile (sovrascrive, nessun nome da chiedere)
2. chiede: vuoi generare la voce?
3. **no** → scarica una copia senza audio; l'editabile resta nel vault
4. **sì** → chiede il nome → genera l'MP3 → lo incorpora in una copia → **scrive nel vault**
   **e** scarica → avviso verde che dice entrambe le cose

⚠️ Il passo 1 non è un dettaglio: **non esiste autosave** nell'editor documenti (Ctrl+Z sì,
20 passi, intercettato in cattura). Senza salvare per primo, si ottiene una sintesi *con
voce* più aggiornata dell'editabile da cui è nata.
⚠️ Se il testo non è cambiato dall'ultima registrazione (`audioStale`), la rigenerazione va
rifiutata: è spesa pura.

## Le altre decisioni prese, da fare

- **Clona** nell'editor: crea una seconda copia editabile, per scelta esplicita invece che
  per accumulo.
- **Pipeline in sottofondo**: i pezzi difficili ci sono già (manifest file-first, segnale su
  `mappai-vaults-changed`, `normalizeOnLoad`, `checkResume`); manca sostituire
  `showLoadingOverlay` con un indicatore non modale e segnalare a ogni file scritto.
  ⚠️ **Vincolo duro**: la pipeline legge `appState` in *ogni* step ma congela il vault
  all'avvio → cambiando progetto mentre gira, genera materiali della mappa nuova nel vault
  vecchio, in silenzio. Decisione presa: **congelare i dati all'avvio**.
- **Domande aperte**: nuovo genere. Domande + kicker della macro-area (riusare
  `buildL1Resolver`), soluzioni su una pagina separata (riusare il pattern `includeAnswers`
  dei quiz cartacei). **Senza citazioni verbatim** — decisione di Giacomo del 10/8.
- **ELABORA ristrutturata**: sidebar a un piano coi progetti (le briciole filtrano *quali*
  progetti, non *quale* — o sono due comandi per lo stesso gesto), area con le tabelle per
  genere, clic su documento → anteprima + toolbar, clic su Modifica → toolbar di editing e
  uscita a due stati. ⚠️ L'anteprima delle voci d'archivio va **generata dai builder**
  (esistono headless): è ciò che rende le due nature la stessa riga e permette di fondere
  il doppio registro.

## Che cosa è già stato scritto (10/8 sera, UNCOMMITTED)

- `mappai-pipeline-core.js`: genere `synthesis_voice`; `buildFileName` non scrive più
  ` -VERDE` (`SUFFISSO_TARATO` resta esportato: i file su disco ce l'hanno e `_tarato()`
  deve continuare a riconoscerlo).
- `mappai-material-pipeline.js`: scrive **due** file; l'MP3 separato non si scrive più;
  `_conEstensione` rimossa (era orfana).
- `mappai-landing-teach.js`: `_diskKind` riconosce `Sintesi-voce` (regola PRIMA della
  generica, con `voce: true`); `filtraSintesi(lista, 'insegna'|'elabora')` — **una** regola
  per entrambe le console; le tabelle nascondono classe e materia quando non variano;
  comando «Apri nel Finder» per riga.
- `mappai-elabora-console.js`: `_caricaDisco` esclude `Sintesi-voce` **a monte** (dal solo
  `_disco` dipendono gruppi, «Modifica» e anteprima: filtrare in uno solo dei tre lasciava
  gli altri due scoperti).
- `mappai-doc-editor.js`: `openSynthesisFromVault` rifiuta i file `Sintesi-voce` — la
  funzione è esportata, la difesa va dove accade il danno.
- Test: +2 su `buildFileName` e sull'ordine dei classificatori. Suite **1009 / 0 / 2**.

## Cosa manca, in ordine

1. **Provare in Electron una generazione vera.** Non ci è mai girato: un HTML da 8 MB che
   passa da `saveVaultFile`, i due nomi, la separazione fra le due console.
2. Il bottone «HTML» a quattro passi (sopra) e **Clona**.
3. La pipeline in sottofondo coi dati congelati.
4. ⚠️ **Debito lasciato in piedi**, censito ma non chiuso: `_voceNaturale()` in
   `mappai-doc-editor.js` cerca ancora l'MP3 fratello (ramo morto sui vault nuovi);
   `buildPrintHtml` accetta ancora `opts.audioSrc` e produce documenti che puntano a un file
   che nessuno scrive più; `_passo()` nella pipeline annuncerà l'MP3 non riscritto come
   «col nome vecchio, ancora nella cartella», che è falso; e due commenti (in
   `mappai-doc-editor.js:176` e `mappai-landing-teach.js:2554`) ora dicono l'esatto
   contrario di ciò che il codice fa.

---

# 👉 DOMATTINA SI RIPARTE DA QUI (10/8, notte)

⚠️ Questo file è **git-ignored** (`.gitignore: *console*.md`): vive solo su disco.

## Stato: tutto committato, niente in sospeso
```bash
cd "/Users/giacomomeschini/Claude/MappAI re"
git log --oneline -7        # 28dee87 … 86e0796
git status --short -- public tests main.js   # atteso: VUOTO
node --test tests/          # atteso: 1008 pass / 0 fail / 2 skip
```
`index.html` a **`?v=cons1`**. Nel working tree resta **solo ciò che non è di questo filone**
e va lasciato lì: lo stream **misuratore** (`MappAI - misuratore/**`), `Inkscape/`,
`MappAI_logo.svg`.

⚠️ **`origin/main` è indietro di 26 commit e il push NON parte da qui**: il portachiavi non ha
più credenziali per github.com (ultimo push da CLI il 23/7, token scaduto; su 401 git cancella
la voce). Lo fa Giacomo: `git push origin main`, con un token di scope `repo`.

## I sette commit di oggi, dal più grosso
| commit | che cosa |
|---|---|
| `86e0796` | **convenzione unica dei nomi** dei materiali (`Tipo-Mappa-NomeDocente[ -VERDE]`) + `nomeLibero` |
| `244295f` | **barra unica** nell'anteprima · **uscita a due stati** («Esci»/«Salva ed Esci») · **Stampa chiede il nome e scrive il file** · audio che viaggia · karaoke con interruttore |
| `b9232ee` | le tabelle di INSEGNA dicono **PDF/HTML/JSON/Modificabile**; `.DS_Store` non è un materiale |
| `1d98838` | **ESC chiude uno strato, non la sezione** (+ la domanda di salvataggio porta al modale del nome, e viene attesa) |
| `032e6a6` | colonna **tutta piegata all'avvio** · **maniglia nell'angolo** in alto a sinistra dell'area |
| `084e272` | i **comandi del blocco** non coprono più il testo (corridoio riservato, 2×2) |
| `28dee87` | via l'invito «Scegli un documento nella colonna» |

## Che cosa NON è stato verificato, e va provato
1. **La stampa vera** dopo il salvataggio (il PDF che esce dalla stampante, non il file).
2. Il **modale di collisione a tre vie** non è mai stato visto aperto: il ` · 02` sul disco dice
   che quel ramo gira, ma l'osservazione diretta è saltata due volte.
3. La **sintesi con audio incorporato su un tablet reale** (il caso d'uso DSA).
4. Il **PDF nella tela di una mappa appena generata**, restando nella stessa sessione.
5. La **Vista Studio**: il ciclo e i 7 motori girano, ma il PDF scritto su disco e la
   persistenza del profilo alla riapertura non sono stati provati.

## Aperti, dichiarati (in ordine di quanto mordono)
- ✅ **CHIUSO l'11/8**: gli 8 `confirm()` nativi dell'editor passano ora dal motore dei
  modali (vedi la sezione di F3-F5 in cima). Erano l'ultimo pezzo fuori dal motore.
- 🐛 **La pipeline scrive l'MP3 accanto all'HTML ma l'HTML non lo referenzia** —
  `mappai-material-pipeline.js` chiama `buildHtml(data)` senza `opts`, l'audio va come file a
  sé: **il file consegnato agli allievi non ha la voce naturale pagata in token**. (Il collegamento
  esiste ora via `audioSrc`, ma va verificato su una generazione VERA.)
- 🐛 **`directLoadVault` non imposta `currentProjectId`**: il primo `saveCurrentProject()` dopo
  può scrivere lo snapshot **sotto l'id del progetto precedente**. Difetto grosso e preesistente.
- 🐛 **`_materialiEsistenti` ha un `catch` muto** che ritorna `[]`: se `vaultMaterialsList`
  fallisce, la collisione non si rileva e si sovrascrive un file senza dirlo.
- Il **karaoke del chip esterno** non dipinge dentro l'iframe (Range del documento genitore,
  CSS Highlight per-documento). La voce parla, l'evidenziazione no. Nel file aperto **da solo**
  — cioè dallo studente — funziona.
- Il documento della sintesi non ha `<meta name="viewport">`: su tablet si rimpicciolisce
  invece di reimpaginarsi. Preesistente; cambiarlo tocca tutti i dispositivi → decisione di Giacomo.
- `_testoDaBase64` esiste ora in **tre** file: candidato per `FilesCore`.

## Le trappole che è costato imparare (non ripeterle)
- ⚠️ **MAI `pkill -f "Electron"`** né alcun pattern su un nome di applicazione: colpisce **ogni**
  app Electron della macchina, compresa la MappAI che Giacomo sta usando e Claude.app. Stanotte
  gli ho chiuso le app aperte così. Si chiude **solo per PID annotato al lancio**; per
  distinguere le proprie istanze si usa `--remote-debugging-port=9222`, che nessun altro apre.
- ⚠️ **Un apice inverso dentro un commento** — anche un commento CSS — chiude il template
  literal che lo contiene, e il file smette di parsare. Quarta volta in questo progetto.
- ⚠️ **Un `confirm()` nativo blocca il renderer**: CDP va in timeout e sembra un crash. Se
  `Page.enable` stesso si blocca, è quello.
- ⚠️ **Le misure impazienti mentono**: un PDF passa da una finestra offscreen che aspetta i
  font — 4 secondi non bastano, e il file «non scritto» in realtà arrivava.
- ⚠️ **`15ch` si risolve nel font dell'elemento che lo scrive**, non in quello del vicino: la
  colonna delle etichette misura 88px, un `15ch` sui comandi ne misurava 220.
- ⚠️ **Verificare dal percorso dell'utente**: pilotando `setMode` a mano ho ottenuto uno stato
  bloccato che dal gesto vero (briciola → progetto) non esiste. Il difetto era nella mia prova.

---


## ✅ 10/8 — ESC CHIUDE UNO STRATO, NON LA SEZIONE
Due rilievi di Giacomo: in INSEGNA ESC lo sbatteva in **CREA**; in ELABORA faceva sparire la
colonna «e poi non la posso più riaprire».

**Riprodotti tutti e due, e il secondo non era un vicolo cieco vero**: dalla briciola in alto
«Elabora → Elabora» la console si riapre (verificato col gesto vero). Ma *sembra* un vicolo
cieco, perché per rientrare bisogna **riscegliere la sezione in cui si è già**, e la briciola la
mostra come corrente. Il salto a CREA era invece la decisione dell'8/8 («entrando in INSEGNA la
landing sotto va su COSTRUISCI, è dove si atterra chiudendola») — un dettaglio interno finito a
schermo.

**Decisione di Giacomo**: ESC chiude **solo il documento**; senza documento aperto **non fa
niente** e si resta nella console. Dalla sezione si esce dal percorso in alto, che è un gesto
deliberato. Queste console non sono finestre *sopra* una sezione: **sono** la sezione.
E soprattutto — parole sue — «ESC non deve diventare un tasto che se schiacciato
involontariamente fa perdere del lavoro».

- ELABORA e INSEGNA: il ramo `__esc` ritorna **`false`** anche quando non c'è niente da
  chiudere (prima ritornava `undefined`, e il motore lo leggeva come «chiudi pure»).
- 🐛 **La domanda di salvataggio portava a `save()`**, che per quattro generi su cinque scrive
  solo in memoria e in localStorage: chi rispondeva «Salva» non otteneva **nessun file**. Ora
  passa da `MappAIDocEditor.salvaConNome()` (nuova, esportata) — la stessa strada di «Stampa» e
  «Salva ed Esci»: chiede il nome e avvisa se esiste già.
- 🐛 **E non era atteso**: `try { DEd().save(); }` senza `await`, con `_sporco()` letto mentre la
  scrittura era ancora in volo — per una sintesi-da-vault il documento non cambiava mai.
  Difetto già censito nella ricognizione del 9/8, chiuso qui.

**Provato in Electron**: ESC ×3 in ELABORA e in INSEGNA → console sempre aperta, colonna a 272,
INSEGNA non tocca più CREA · ESC su documento modificato → «Salvi le modifiche?» con le tre vie
· «Salva» → **modale del nome** · annullando il nome si **resta nel documento**, ancora sporco,
con l'editor montato. Suite 1008/0/2.

## ✅ 9/8 (9) — I TRE DIFETTI TROVATI DA GIACOMO USANDO L'APP (UNCOMMITTED)
Suite **1008/0/2**. Tutti e tre riprodotti, corretti e **verificati in Electron**.

**1. «Stampa» non faceva niente su quiz e flashcard — e non era la stampa.**
Il file veniva scritto e i toast comparivano: moriva l'ultimo gesto. `_modal()` crea il
pannello a **`z-[1200]`** e lo appende al `body`, mentre la console di ELABORA è un modale
del motore a **12100** con riquadro opaco a tutto schermo: il foglio nasceva **sotto**,
invisibile, e si prendeva pure il fuoco. La sintesi funzionava perché esce da `window.open` —
una finestra nuova allo z-index non deve niente. **Deterministico al 100% dentro la console,
invisibile fuori: è nato con la console.**
Il piano ora si **chiede** al motore (`MappAIModal.prossimoZ()`, lo stesso gesto di
`mappai-cabina.js:114`): un numero fisso più alto tornerebbe a sbagliare al primo modale in più.
⚠️ **Stessa famiglia, altri due posti**, chiusi con la stessa riga: `_paperModal`
(`mappai-landing-teach.js`, raggiungibile da «Quiz cartacei» nella console INSEGNA) e il
cruscotto dei consumi (`mappai-usage-dashboard.js`, raggiungibile dalla Cabina).

**2. «Salva ed Esci» non chiedeva il nome.** Non era uno stato: il modale del nome vive in
**un solo posto al mondo**, dentro `print()`. `esci()` chiamava `save()`, che per quattro
generi su cinque scrive in memoria e in localStorage e **non produce nessun file** — si
«salvava» un materiale e nella cartella della mappa non compariva niente. Ora `esci()` passa
dalla stessa strada di «Stampa». Le due deroghe le gestiva già `_salvaConNome`: una sintesi
aperta DAL vault riscrive il suo file senza chiedere, e senza cartella il documento si salva
lo stesso e lo si dice.

**3. Le fonti congelate sul primo progetto della sessione.** `appState.sources` **non viene
azzerato da nessun caricatore** (né `loadMapVault` né `directLoadVault`), e il ripristino
scritto stamattina si autoescludeva con `if ((s.sources||[]).length) return 0` — «già in
memoria: non si tocca». La domanda giusta non era «ci sono fonti?» ma «sono di QUESTO vault?».
Ora un `_fontiDiVault` dice a chi appartengono: stesso vault → si tengono (quelle in RAM hanno
il File vero); vault diverso → si buttano insieme a `_pdfFiles`, o il visore mostrerebbe il PDF
del progetto precedente.
⚠️ **Trappola chiusa insieme**: `salvaIndiceFonti` riscrive `Fonti/fonti.json` **intero**, e il
ripristino è asincrono e non atteso — un salvataggio caduto in quella finestra avrebbe scritto
`fonti: []` nel vault appena aperto, cancellandone l'indice. Ora non si scrive un elenco vuoto
per fonti che non risultano ancora di quel vault; svuotarlo davvero passa comunque.

**Verificato in Electron**: mappa A → B, le fonti seguono (`1.11 …` → `1.7 …`) · pannello di
stampa a **12200** sopra la console a 12100, con `elementFromPoint` al centro che restituisce
un elemento **dentro** il pannello (in cima davvero, non solo presente) · «Salva ed Esci» su
documento modificato apre il modale del nome, e «Annulla» lascia nel documento.

**4. Il nome scelto non arrivava al file scaricato.** Dallo screenshot di Giacomo: il dialogo
di salvataggio del sistema proponeva `Flashcard-<titolo> — Flashcard-2x2v.pdf` invece del nome
appena scelto. Il file in `Materiale Studio/` ce l'aveva giusto; il **download** no.
Causa: foglio dei nodi e flashcard escono da **jsPDF**, che chiama `doc.save(<nome suo>)` —
e `mappai-print-dossier.js` non sapeva niente di `_salvaConNome`. Ora `_salvaConNome`
**restituisce il nome** invece di `true` (resta vero per i due chiamanti che guardano solo
`=== null`), `print()` lo porta a `_stampaOra`, e i due motori jsPDF onorano `opts.fileName`.
Quiz, sintesi e catena non sono toccati: aprono una finestra, non c'è nessun nome file di mezzo.
Misurato in Electron: download proposto `Flashcard-Sistema Terra-ripasso di maggio.pdf`.

### ⚠️ Aperti, dichiarati
- **`_saveQuiz` usa due `confirm()` NATIVI** (validazione, «set non più nella mappa»). In
  Electron bloccano il renderer, e rispondendo **No** la stampa si ferma **in silenzio**
  (`_dirty` resta true → letto come rinuncia). È l'ultimo pezzo fuori dal motore dei modali.
- **`_materialiEsistenti` ha un `catch` muto** che ritorna `[]`: se `vaultMaterialsList`
  fallisce, la collisione non viene mai rilevata e si sovrascrive un file senza dirlo.
- **`directLoadVault` non imposta `currentProjectId`**: il primo `saveCurrentProject()` dopo
  può scrivere lo snapshot **sotto l'id del progetto precedente**. Difetto grosso e
  preesistente, non toccato.
- Nella console, `_conSalvataggio` fa `try { DEd().save(); }` **senza `await`**: per una
  sintesi-da-vault legge `_sporco()` mentre la scrittura è ancora in volo, e il documento non
  cambia mai. `esci()` invece attende. Due regole per la stessa domanda.

## ✅ 9/8 (8) — I NOMI DEI MATERIALI, L'USCITA A DUE STATI, L'AUDIO CHE VIAGGIA (UNCOMMITTED)
Cinque richieste di Giacomo + la domanda «è tutto coerente?». Suite **1008/0/2**.
Quattro decisioni prese da lui con i numeri in mano, poi quattro agenti su quattro file
disgiunti, col **contratto dei nomi scritto prima** da me (è ciò da cui dipendono tutti).

**La risposta alla sua domanda era no, e il censimento lo dice**: cinque grafie diverse per
` -VERDE`, sei funzioni di sanitizzazione indipendenti, quattro nomi senza il nome della
mappa, e `Materiale Studio/` **senza alcuna protezione anti-collisione** (`Fonti/` ce l'ha da
sempre) → sovrascrittura silenziosa. In più `Catena-dei-perche.pdf` non era classificato da
nessuna regex: finiva in «File», ed è un difetto **vivo** da prima di oggi.

**1. Convenzione unica** (`mappai-pipeline-core.js`, +5 test):
`<Tipo>-<Mappa>[-<dettaglio>][-<nome del docente>][ -VERDE].<est>`.
⚠️ Il TIPO resta **in testa** perché `_diskKind` riconosce i file dal prefisso, e da quel
riconoscimento dipende il bottone «Modifica» — l'unico ingresso all'editor di un file su
disco. C'è un test che lo verifica: se cade, la colonna smette di sapere che cos'ha in mano,
in silenzio. `buildFileName` senza `opts.mappa` produce il nome VECCHIO (retrocompatibile).
Nuova `nomeLibero(nome, esistenti)` → ` · 02`, la stessa forma di `Fonti/`.
⚠️ **Cambio dichiarato**: l'MP3 prende ` -VERDE`. Prima era fisso, e un vault con
`Sintesi.html` + `Sintesi -VERDE.html` aveva **un solo audio**, accoppiato al testo sbagliato.

**2. Il bottone primario è un'USCITA a due stati**: «Esci» finché non si tocca niente, «Salva
ed Esci» alla prima modifica, in tutti e cinque gli editor.
⚠️ La trappola: **8 dei 27 punti che sporcano non ridisegnano la barra** — sono proprio quelli
della digitazione (un re-render sposterebbe il cursore). Cambiare l'etichetta in `_docBar()`
non sarebbe bastato: scrivendo, il bottone sarebbe rimasto «Esci». Ridipinge `_paintDirty()`,
che è l'unico punto che tutti raggiungono, e **le due facce stanno entrambe nel markup** (si
scambia il `display`): cambiare l'icona avrebbe richiesto `safeCreateIcons` — l'hub globale —
a ogni tasto premuto.

**3. «Stampa» chiede il nome, salva e poi stampa; «Nel vault» è sparito** (facevano la stessa
cosa senza dirlo). Il modale mostra la parte preimpostata + il campo + **il nome che ne
risulta, aggiornato mentre si scrive**, e dichiara in ambra se quel nome esiste già; alla
conferma, un secondo modale offre **Sovrascrivi / Salva accanto (` · 02`) / Annulla**.

**4. L'audio viaggia — strada IBRIDA** (scelta di Giacomo su un numero misurato: un MP3 vero
del disco pesa **6,16 MB** → incorporato **8,28 MB**, HTML da 63 KB a 8,28 MB, **137×**;
mediana del corpus 40 KB → 1,94 MB). Il vault resta leggero e l'HTML **punta** all'MP3
fratello (`opts.audioSrc`); la copia da consegnare incorpora (l'editor, dal bottone «HTML»,
legge l'MP3 dal vault e lo mette dentro coi cue veri). Se il riferimento relativo non carica,
il documento **ripiega sulla voce di sistema** invece di restare muto.

**5. Karaoke con un interruttore** nell'header (`#ap-hl-btn`, «Evidenzia: sì/no»): prima era
sempre acceso e non c'era modo di spegnerlo. Con esso si spegne anche lo **scorrimento**
automatico. Corretto anche che `pause()` non puliva l'evidenziazione (restava congelata).

### 🐛 Il difetto che il ventaglio ha lasciato FRA due patch — la doppia codifica
La pipeline passava `audioSrc: encodeURIComponent(nome)` e il generatore applicava `_relUrl`,
che codifica di nuovo: `%20` → **`%2520`**, cioè un file che non esiste. Ed era **muto**,
perché il documento ripiega da solo sulla voce di sistema quando l'audio non carica: il lavoro
sarebbe stato inutile e nessuno se ne sarebbe accorto. Entrambe le patch avevano ragione da
sole. Ora il nome viaggia **grezzo** e a codificarlo è solo chi costruisce l'URL.

### 🐛 L'altro contatto: l'eccezione `#ap-audio` sarebbe diventata la regola
Console e INSEGNA nascondono la barra interna del documento **tranne** quando trovano un
`<audio>`. Con `audioSrc` quel tag c'è **anche nei file del vault** → la barra doppia sarebbe
tornata su quasi tutte le sintesi. Ora l'eccezione vale solo per l'audio **incorporato**, e lo
si legge da `data-ap-src="embedded"` (attributo, non `src`: la proprietà `.src` risolve il
relativo e restituisce sempre un URL assoluto, quindi non direbbe mai «non è `data:`»).

### Provato in Electron (app vera, CDP, 28 vault)
Nomi prodotti e **tutti classificati**, Catena compresa (prima «File») · bottone che gira
scrivendo **senza ridisegnare la barra** (stesso nodo), «Nel vault» assente · modale del nome
che compone `Quiz-MC-Sistema Terra.pdf` → `…-ripasso finale.pdf` mentre si scrive · **file
scritto davvero** in `Materiale Studio/` e **comparso nella colonna** (gruppo Quiz 4→5) ·
avviso di collisione nel modale e ` · 02` sul disco · documento nelle tre varianti: nudo senza
audio, fratello con `%20` (non `%2520`) e `data-ap-src="file"`, incorporato con `embedded` ·
eccezione provata su tre iframe veri: barra nascosta per nudo e fratello, **visibile solo per
l'incorporato**. File di prova rimossi (Cestino).

### ⚠️ NON verificato, e va detto
- **Il modale di collisione a tre vie non l'ho mai visto aperto**: il ` · 02` sul disco dice
  che quel ramo gira, ma le mie osservazioni erano mistimate e poi il renderer si è bloccato.
- **La stampa vera** (dopo il salvataggio) non è stata esercitata.
- 🐛 **Trovato bloccandomi due volte**: il flusso di stampa può far comparire un `confirm()`
  **nativo** — la validazione di `_saveQuiz` (`mappai-doc-editor.js:900`) e il controllo «set
  non più nella mappa» (`:912`) — che in Electron **blocca il renderer**. Non è nuovo di oggi
  (il `confirm` c'era), ma **prima la stampa non passava dal salvataggio**, quindi ora è
  raggiungibile da lì. Per un docente è una finestra a cui rispondere; resta che è l'ultimo
  pezzo fuori dal motore dei modali (l'agente l'aveva già censito come incoerenza n. 14).
- La sintesi consegnata con l'audio incorporato non è stata provata su un tablet reale.

## ✅ 9/8 (7) — I SEI FIX DELLA SINTESI IN ELABORA (tutto UNCOMMITTED)
Sei richieste di Giacomo, delegate a quattro agenti su **quattro file disgiunti** (le scritture
sullo stesso file non si parallelizzano: l'ultimo vince e gli altri si perdono in silenzio).
Suite **1004 pass / 0 fail / 2 skip**. **Provato in Electron via CDP sui vault veri, 0 errori.**
File toccati: `mappai-doc-bar.js` · `mappai-branch-synthesis.js` · `mappai-doc-editor.js` ·
`mappai-elabora-console.js` · `mappai-landing-teach.js` · `en_translations.js` ·
`index.html` (`?v=sint1`).

**1. La colonna apre la sintesi in EDITING.** La voce editabile non esisteva per una ragione
strutturale: `Sintesi -VERDE.html` lo scrive **solo** la pipeline, che chiama
`runWholeMap({silent:true})` → il modale del risultato non si apre → `_saveSynthesisDoc` (che sta
*dentro* quel modale) non gira mai → **nessun record in `MappAIStudyDocs`**; e `_lastSynthesis` è
memoria di sessione che nessuno persiste. Decisione di Giacomo: **l'editing nasce dal FILE del
vault**. Nuova `MappAIDocEditor.openSynthesisFromVault({vaultPath, relPath, title, mapName})` →
`Promise<boolean>`; «Salva» **riscrive lo stesso file**, senza suffissi né nomi nuovi (il tema dei
nomi è il blocco B, e inventare una convenzione qui l'avrebbe pregiudicato).
⚠️ `openSynthesisFromVault` conserva l'`<audio>` incorporato, che `blocksFromHtml` non sa vedere:
senza, risalvare avrebbe **cancellato la voce naturale in silenzio**. Se il testo è cambiato
(`audioStale`) l'audio cade e un toast lo dice, invece di lasciare un karaoke fuori sincrono.

**2. UNA barra sola, e il chip del lettore.** L'anteprima aveva **due barre impilate**: quella
disegnata a mano dalla console e quella che il documento si porta dentro. Ora la barra ha la veste
`.de-bar` dei quattro editor e porta *nome · chip del lettore · Modifica · Stampa · Apri nel Finder*.
- Gli HTML entrano come **`srcdoc`** (stessa origine) e non più come `data:` (origine opaca, da cui
  non si tocca niente); PDF e audio restano `data:`, che vanno al visualizzatore di Chromium.
- La barra interna si spegne **da fuori** — `MappAIDocBar.nascondiInIframe` (nuova, regola
  `.no-print,.mm-doc-bar,.mm-doc-spazio{display:none!important}`) — e non evitando di emetterla:
  **i file sono già sul disco e nessuno li riscriverà**, e fuori dall'app quella barra è ciò che
  serve agli studenti con DSA. Vale anche in **INSEGNA** (dove il caso dal disco era `data:` ed è
  passato a `srcdoc`: senza, lì la barra doppia sarebbe rimasta quasi sempre).
- ⚠️ **ECCEZIONE `#ap-audio`**: se il documento porta la voce naturale incorporata, la sua barra
  resta e il chip esterno non si monta — il chip dell'app non sa suonare quell'MP3.
- ⚠️ **Il difetto che ha quasi rovinato tutto**: `MappAITTS.mountChip` nasce `display:none` perché
  segue `isEnabled()`, che legge `mappai_tts_tool_enabled` — **e nell'app di Giacomo vale `'0'`**.
  Nascondere la barra interna senza forzare il chip avrebbe lasciato l'anteprima **senza lettore**.
  Il chip si forza visibile in questo contesto e il perché è scritto in `_montaChip`.

**3. «✕ Chiudi» eliminato** dal documento: `window.close()` chiude solo finestre aperte da script —
in un iframe o su un file aperto dal Finder era un **no-op silenzioso**.

**4. ESC a strati, e il lavoro non si perde più.** La console **non intercettava `__esc`**: ESC
chiudeva tutto, e la `then` di chiusura chiamava `reset()`, che **azzera `_dirty`** → il documento
non salvato spariva senza una domanda. Ora ESC chiude il DOCUMENTO (`return false` **subito**: la
domanda è asincrona e rispondere dopo chiuderebbe la console sotto la domanda), chiede con
`MappAIModal.chiediSalvataggio` + `MappAIDocEditor.hasUnsaved()` — **due API che esistevano da
giorni con zero chiamanti** — e la colonna torna visibile **da sé** (lo stato «chiusa» vive solo
nella classe `is-nav-chiusa`, e `rifai()` costruisce un box nuovo: misurato 0 → 272px).
La stessa domanda ora protegge anche **il cambio di voce nella colonna** e **il cambio di sezione
dal percorso** (`onCosa`, dove `setMode` è passato DOPO la risposta: prima cambiava la landing
sotto anche a chi rispondeva «torna indietro»).

**5. «Aa Dislessia» è un ciclo a tre stati**: spento → **1,5×** → **2×** → spento, con l'etichetta
che dichiara lo stato. I due fattori sono le **stesse scale dell'a11y dell'app**
(`body.a11y-zoom-x15`/`x2`), non una terza convenzione. Il fattore vive in `--ap-scala`, così un
numero governa tutti i corpi. ⚠️ Corretto anche che `.on` veniva messa dal JS **senza nessuna regola
CSS**: il bottone non dava alcun segnale di stato.

**6. Margini del PDF.** Il documento non dichiarava **nessun `@page`**, e la sua unica regola di
stampa (`padding:10px` = **2,65 mm**) *peggiorava* i 24px dello schermo. Ora
`@page { size:A4 portrait; margin: 18mm 15mm 22mm 15mm }` — la convenzione del dossier, scelta da
Giacomo — con `padding:0` in stampa e le regole di interruzione (`break-after:avoid` sui titoli,
`orphans`/`widows` sui paragrafi) che non c'erano.

**Misurato in Electron, app vera, 28 vault, 0 errori console**: la barra è `.de-bar` senza più i
vecchi `mm-btn`; iframe `srcdoc` di stessa origine; barra interna `display:none`, altezza **0**;
chip **visibile** con 4 comandi puntato a `.bs-body`; «Modifica» smonta l'anteprima e monta
l'editor (14 blocchi, **accenti integri** — la trappola `atob`/`TextDecoder` evitata); ESC su
documento pulito → area vuota e colonna a 272px; ESC su documento sporco → «Salvi le modifiche?»
con la console ancora aperta; INSEGNA idem. Il file di Giacomo **non è mai stato riscritto**
(verificato col timestamp).

**⚠️ Da sapere: i file GIÀ sul disco non cambiano.** I sei `Sintesi -VERDE.html` esistenti non hanno
`@page` né il ciclo Dislessia: le regole valgono per i documenti **generati da qui in avanti**.
Verificato però che **«Modifica → Salva» rigenera l'HTML con le regole nuove** — è la via di
aggiornamento dei vecchi, un file per volta.

**Aperti, dichiarati e non corretti** (fuori dai sei punti):
- 🐛 **La pipeline scrive l'MP3 accanto all'HTML ma l'HTML non lo referenzia**
  (`mappai-material-pipeline.js:327` chiama `buildHtml(data)` senza `opts`, l'audio va a `:342` come
  file a sé): **il file consegnato agli allievi non ha la voce naturale che è stata pagata in
  token**. Tocca esattamente il caso d'uso DSA a cui Giacomo tiene.
- Il **karaoke** del chip esterno non dipinge dentro l'iframe (`_highlight` costruisce il Range col
  documento genitore e la CSS Highlight è per-documento). La voce parla, l'evidenziazione no. Nel
  documento aperto **da solo** — cioè dallo studente — funziona come prima.
- La **×** della console scarta ancora il non salvato: `esci()` chiede solo con `s.sporco`, che si
  legge al render mentre `_dirty` cambia mentre si scrive. Il rimedio sta nel motore, non qui.
  (Nella veste manifesto la × è `display:none`, quindi il gesto è raro.)
- `window.close()` no-op e `@page` assente valgono anche per **glossario, timeline e report live**.
- `_testoDaBase64` esiste ora in **tre** file (elabora, elabora-console, landing-teach): 8 righe
  ciascuno, ma è un candidato per `FilesCore`.

## 👉 SI RIPARTE DA QUI — 9/8: ELABORA È FINITA E PROVATA IN ELECTRON
⚠️ Questo file è **git-ignored** (`.gitignore: *console*.md`): vive solo su disco.

**Stato del repo (agg. 9/8 sera).** `main` è **aggiornato e committato**:
- `244295f` feat(elabora): una barra sola, l'uscita che salva, l'audio che viaggia
- `86e0796` feat(nomi): una convenzione sola per i nomi dei materiali
- prima: `0941a05` · `f2a86f6` · `6677a0f`

`index.html` a **`?v=fix5`**. Suite **1008 pass / 0 fail / 2 skip**.
Nel working tree resta **solo ciò che non è di questo filone** e va lasciato lì: lo stream
**misuratore** (`MappAI - misuratore/**`), `Inkscape/`, `MappAI_logo.svg`.

⚠️ `origin/main` è indietro di **21 commit** e **il push non parte da qui**: il portachiavi
non ha più credenziali per github.com (l'ultimo push da CLI è del 23/7; il token è
probabilmente scaduto, e su 401 git cancella la voce dal portachiavi). Il push lo fa
Giacomo: `git push origin main`, incollando un token con scope `repo`.

⚠️ **Regola imparata a caro prezzo il 9/8**: mai `pkill -f "Electron"` (né alcun pattern su
un nome di applicazione) per chiudere un'istanza di prova — quel pattern colpisce **ogni** app
Electron della macchina, compresa la MappAI che Giacomo sta usando e Claude.app. Si chiude
**solo per PID**, annotato al lancio; per distinguere le proprie istanze si usa la porta di
debug (`--remote-debugging-port=9222`), che nessun altro apre.

**Come rimettersi in piedi**
```bash
cd "/Users/giacomomeschini/Claude/MappAI re"
git log --oneline -3          # 0941a05 · f2a86f6 · 6677a0f
git status --short -- public  # atteso: VUOTO
node --test tests/            # atteso: 1004 pass / 0 fail / 2 skip
```
**Provare nell'app VERA** (è così che è stato verificato tutto il 9/8, non nel pannello):
```bash
npx electron . --remote-debugging-port=9222
```
poi si pilota il renderer via CDP con l'helper `cdp.js` (usa il `ws` già in
node_modules): `Runtime.evaluate` con `awaitPromise`. Nel pannello browser mancano il
disco e gli IPC, quindi metà di queste cose non è esercitabile.

**Che cosa è entrato il 9/8**, in ordine di importanza:
1. **Le FONTI sopravvivono al vault** — era la «cecità sulla fonte»: riaprendo una mappa
   ELABORA non aveva né testo né PDF. Ora il vault porta `Fonti/fonti.json` + i testi
   estratti, con ripristino a tre gradini e auto-riparazione dei vault vecchi. Con essa il
   **visore PDF nella tela** funziona (24 pagine misurate).
2. **Gli elenchi non vivono più di ricordi** — canale unico `mappai-vaults-changed`
   (`public/js/mappai-vaults-bus.js`): chi scrive su disco lo dichiara, chi mostra elenchi
   rilegge. Rileggere costa 1-7ms su 28 vault (misurato).
3. **La colonna di ELABORA vede i documenti SUL DISCO**, non solo i set editabili — con la
   **stampante** come icona dei pre-generati e l'apertura in sola lettura nella tela.
4. **Le briciole seguono la cascata** e la **colonna si azzera** quando il contesto cambia:
   niente più contenuti dell'ultimo progetto sotto un'altra classe.
5. **I titoli di sezione si accendono in emerald** quando la sezione è aperta (o al
   passaggio / col fuoco): con sei gruppi estesi la colonna era illeggibile.
6. **La VISTA STUDIO è su main** (cherry-pick, non merge: quel ramo porta anche una copia
   vecchia dei file console) e **gira in Electron** — non ci era mai girata.

**Che cosa resta da provare** (l'unica cosa non esercitata): il **PDF nella tela di una
mappa appena generata**, restando nella stessa sessione — là la fonte ha l'oggetto File
vero, non il read-back dal vault.

**Il compito della prossima chat è deciso**: prima alcuni **fix di UI**, poi il **tema dei
salvataggi e dei nomi** (nome progetto ↔ nome root, nome della cartella vault e la sua
rinomina da MappAI, nomi dei materiali generati e dei PDF esportati, e che cosa deve fare
«Sincronizza Vault»). La ricognizione è già fatta: vedi «🎯 PROSSIMA CHAT» qui sotto —
c'è anche il difetto più concreto, `Sintesi -VERDE.html` che è un **nome fisso** e si
sovrascrive fra rami diversi.

**Da leggere in quest'ordine**: questa sezione → «🎯 PROSSIMA CHAT» → le sei sezioni «✅ 9/8» (sono il lavoro
di oggi, dalla più importante alla più piccola) → «✅ 9/8 — PROVATO IN ELECTRON» (che cosa è
stato misurato e come) → «🧭 STATO DEI RAMI» → «🔧 DA FARE».

**Le trappole che è costato imparare oggi**, in una riga ciascuna:
- `read-vault-file` ritorna **solo base64**: il testo va decodificato con `TextDecoder`,
  perché `atob` da solo rompe gli accenti («Elettricità» → «ElettricitÃ »).
- Una variabile letta da `_nav` deve vivere nel MODULO, non dentro `open()`: se sbagli lo
  scope la console **smette di aggiornarsi senza un errore a schermo**.
- Un'apertura di documento può **rinunciare** (`openCausal` senza nessi): chi mostra la tela
  deve chiedere se è riuscita, non darlo per fatto.
- Le risposte asincrone di una richiesta **abbandonata** vanno lasciate cadere, o
  riportano in vista i dati di un contesto che l'utente ha già lasciato.
- Un rapporto di un subagente **non è un fatto**: uno dei due censimenti di oggi aveva
  inventato funzioni e righe (zero file letti), tre segnalazioni su cinque dell'altro erano
  falsi positivi. Verificare prima di costruirci sopra.

**Come rimettersi in piedi in un minuto**
```bash
cd "/Users/giacomomeschini/Claude/MappAI re"
git log --oneline -3            # main: c885d2b topbar+bento
git status --short -- public/   # il lavoro di ELABORA, tutto uncommitted
node --test tests/              # atteso: 986 pass / 0 fail / 2 skip
```
Nell'app: flag acceso, **Cmd+Q e rilancio** (non un reload — vedi trappola 1), poi
ELABORA dalla landing: si apre la console, non più il workspace storico.

⚠️ **Nel pannello browser non basta aprire la pagina**: la console di ELABORA si prova
con `MappAIElaboraConsole.open()` dopo aver messo dati finti in `appState`
(`db.nodes`, `db.studySets` con `mode:'flashcards'` per le flashcard — la
classificazione passa da `kindOfSet`, che guarda `mode`/`type` e NON il titolo).

## 🎯 PROSSIMA CHAT — deciso da Giacomo (9/8): fix UI, poi IL TEMA DEI SALVATAGGI
Due blocchi, in quest'ordine.

### A. Alcuni fix di UI
Giacomo li dirà. Nulla di aperto e già noto, tranne le due voci in fondo a «DA FARE».

### B. Il grande tema: i NOMI e i SALVATAGGI
Sei domande che Giacomo vuole affrontare insieme, perché sono un solo groviglio. Qui sotto
c'è la **ricognizione già fatta** (fatti misurati, file:riga): serve a non ripartire da zero.

**1. Nome del progetto ↔ nome del root.** Oggi sono **la stessa cosa**: il progetto si
   chiama `appState.rootNodeLabel` (`mappai-storage-lang.js:49`, `name: appState.rootNodeLabel
   || "Mappa Senza Nome"`). Quindi rinominare il nodo radice rinomina il progetto, e non
   esiste un titolo del progetto indipendente dal contenuto della mappa.

**2. Nome della cartella del vault.** Una terza cosa ancora: la crea l'auto-vault da
   `rootNodeLabel` al momento della generazione (`mappai-vault-io.js`, con collisione « · 0N»),
   e da allora **non segue più** le rinomine. Il 9/8 il titolo mostrato ha smesso di venire
   dal basename (vince `index.yaml`), quindi ora nome-cartella e titolo possono divergere
   legittimamente — ed è un bene per i vault ricevuti, ma va deciso che cosa mostrare dove.
   ⚠️ Non esiste alcuna funzione per **rinominare la cartella** da MappAI: esiste solo
   `vault-relocate` (main.js), che la SPOSTA fra classe/materia tenendo il nome.

**3. Nomi dei materiali generati.** Li decide `buildFileName` in `mappai-pipeline-core.js`
   (~riga 300, e i test in `tests/pipeline-core.test.js:248`):
   | genere | nome |
   |---|---|
   | quiz MC / VF | `Quiz-MC-<mappa>[ -VERDE].pdf` · `Quiz-VF-…` |
   | flashcard | `Flashcard-<mappa>[ -VERDE].pdf` |
   | foglio nodi | `Foglio-nodi-<layout>[ -VERDE].pdf` |
   | **sintesi** | **`Sintesi[ -VERDE].html` — NOME FISSO, senza la mappa né il ramo** |
   | audio | `Sintesi-audio.mp3` — fisso |
   ⚠️ È il difetto più concreto del gruppo: due sintesi di RAMI diversi della stessa mappa si
   chiamano identico e la seconda sovrascrive la prima (o si aggiunge « (rivista)», che è un
   ripiego). Il foglio nodi porta il *layout* e non la mappa, quindi tre fogli della stessa
   mappa si distinguono, ma fra mappe diverse no.

**4. Nomi dei PDF esportati** (fuori dalla pipeline): la Vista Studio scrive
   `Studio-<mappa>-<motore>.pdf` e `Focus-<nodo>-<vicini|parentela>.pdf`; l'editor documenti
   scrive con `buildFileName` (`mappai-doc-editor.js:1004`). Due convenzioni diverse.

**5. «Sincronizza Vault»** — ⚠️ **oggi NON sincronizza**: il bottone
   (`index.html:1548`) chiama `window.saveMapVault()`, che **apre il dialogo di scelta
   cartella** (`pickFolder({createOnly:true})`, `mappai-vault-io.js:66`) e scrive un vault
   dove dici tu. Con una mappa che ha già `activeVaultPath` il gesto atteso sarebbe
   «riscrivi QUELLA cartella, senza chiedere niente» — che è quello che fa già l'auto-vault
   internamente. Nome e comportamento non coincidono: è il punto da chiarire per primo,
   perché da lì dipende il resto.

**6. Il doppio registro (già dichiarato).** `MappAIStudyDocs` (localStorage) e i file su
   disco sono due elenchi della stessa cosa. Dal 9/8 convivono nella colonna, quindi i
   doppioni si VEDONO: per «Riproduzione Sessuata» il gruppo Sintesi dice 2 — la voce
   editabile dell'archivio e il file `Sintesi -VERDE.html`. Due strade: il disco diventa
   l'unico registro (il quaderno una cache), oppure i due si riconoscono e si mostra **una
   riga con due azioni** («correggi» / «stampa»). La seconda è contenuta; la prima è la
   soluzione vera e richiede saper ricostruire un documento editabile da un file.

**Materiale utile già in casa**: `FilesCore` (`mappai-files-core.js`) ha `safeName`,
`mapVaultParents`, `sanitizeVaultRelPath`, `VAULT_CONTAINER_EXCLUDE` — le regole dei nomi
stanno già lì e sono testate; qualunque convenzione nuova va scritta in quel file, non
sparsa nei chiamanti.

## ✅ 9/8 (6) — IL VAULT È PORTABILE: si passa a un collega e lui lo apre
Requisito di Giacomo: un vault passato a un collega deve aprirsi **anche se lui non ha
quella classe né quella materia**, e il collega deve vedere TUTTI i documenti.
- **`index.yaml` porta `classe` e `materia`.** Prima quell'informazione viveva solo nei
  nomi delle cartelle (`Mappe/<classe>/<materia>/<mappa>`) e nel progetto in localStorage:
  due posti che **non viaggiano con la cartella**. Ordine di lettura: cartella (fonte di
  verità dove c'è) → progetto → dichiarazione del vault. L'ultimo gradino è la novità.
- **Ciò che il docente non ha nel proprio profilo è GENERICO per lui** (`_comeLaVedo` in
  landing-teach): la classe `3C` di un collega non è una sua classe, quindi la mappa compare
  sotto «Generico» invece di non comparire in nessun contesto — prima era invisibile, perché
  il filtro cercava una corrispondenza con la classe attiva e non esisteva alcun contesto in
  cui quella mappa potesse mostrarsi.
- ⚠️ Le classi/materie scritte nel vault sono quelle **di chi l'ha fatto**, non di chi lo
  guarda: un vault aperto e risalvato da un collega non cambia materia.
- 🐛 **In contesto Generico la briciola del progetto non compariva mai**: pretendeva una
  materia scelta, ma le materie generiche sono quelle del profilo e un vault arrivato da
  fuori non ne ha nessuna. Ora la materia è richiesta **solo con una classe attiva**, dove
  serve davvero a restringere l'elenco.
- 🐛 **Il titolo veniva dal nome della CARTELLA** (`directLoadVault` faceva il basename):
  per un vault ricevuto — che sta in una cartella chiamata come capita — la mappa perdeva il
  suo nome. Ora vince `rootNodeLabel` dell'`index.yaml`, col basename come ripiego.
- **Provato con un vault finto** (`Mappe/Dal collega - Vulcani`, che dichiara `3C` /
  `Scienze della Terra`, nessuna delle due nel profilo di Giacomo): compare in Generico e
  NON in 4R·Scienze · titolo «Vulcani del Ticino» dal vault · colonna con **6 editabili + 7
  pre-generati** · la sintesi del vault si apre nella tela. Vault e progetto di prova poi
  rimossi (Cestino), 243 progetti come prima.
- ⚠️ I vault **già esistenti** non hanno i due campi: li prendono al prossimo salvataggio.
  Finché stanno nelle loro cartelle non cambia nulla — contano solo se li si manda a qualcuno.

## 🧹 9/8 — un byte NUL in `mappai-pipeline-core.js` (commit `0941a05`)
Trovato cercando `buildFileName`: **grep non trovava nulla** in quel file, e `file` lo
dichiarava «data» invece di testo. Dentro la regex di `_safeName` i caratteri di controllo
erano scritti come **byte letterali** (0x00 e 0x1f) invece che come escape `\x00`/`\x1f`:
per gli strumenti testuali il file era binario. Sostituiti con gli escape — la regex è
identica per il motore JS, il file torna «UTF-8 text» e grep lo cerca. Suite 1004/0/2.
⚠️ Vale la pena controllare se altri file hanno lo stesso incidente:
`for f in public/js/*.js; do file "$f" | grep -q 'text' || echo "$f"; done`

## ✅ 9/8 (5) — la colonna si AZZERA col contesto, e senza progetto non elenca nulla
Due rilievi di Giacomo, una radice sola: **la colonna leggeva `appState`**, che resta
caricato con la mappa precedente — nessuno la scarica quando cambi classe o materia.
Effetti: al boot compariva «Fonte › Testo» senza alcun progetto scelto; e dopo un cambio di
contesto la briciola si aggiornava mentre la colonna teneva nomi e contatori dell'ultimo
progetto, cioè elencava i documenti di una mappa che non appartiene più a quel contesto.
- Ora la colonna si fa **una domanda sola** (`_progettoDelContesto`): c'è un progetto scelto
  dentro questo contesto? Se no, i gruppi restano — dicono quali generi esistono — ma senza
  voci, e l'area invita a scegliere un PROGETTO invece di un documento che non c'è.
- ⚠️ Il punto delicato è l'istante in cui l'elenco delle mappe non è ancora arrivato dal
  disco: lì non si SA, e la risposta giusta dipende da come ci si è arrivati. Aprendo la
  console la mappa aperta è per definizione quella su cui si lavora; dopo un cambio di
  contesto no — e mostrare i vecchi contenuti «solo per un istante» era esattamente il
  difetto. Il flag `_contestoCambiato` vive solo per quell'attesa.
- 🐛 **Difetto mio, e il sintomo era subdolo**: `_mappe` e `_inCorso` erano dichiarate
  DENTRO `open()`, mentre `_progettoDelContesto` (che `_nav` chiama) sta nello scope del
  modulo → `_mappe is not defined` a ogni ridisegno. Nessun errore a schermo: la console
  semplicemente **non si aggiornava più**, le briciole restavano ferme. Trovato costruendo
  lo schema a mano (`MappAIElaboraConsole.schema()`) e leggendo lo stack, non a occhio.
- 🐛 **`_inCorso` non veniva dimenticato**: cambiando contesto mentre una mappa si stava
  aprendo, la briciola restava incollata su «… · apro…» — l'attesa di qualcosa che non
  interessa più. E la risposta di quel caricamento abbandonato ora si lascia cadere, o
  riporterebbe in colonna i documenti della mappa sbagliata.
- **Misurato in Electron**, giro completo: boot → `A chi?` e gruppi a 0 · progetto scelto →
  `4R › Scienze › I Cromosomi` con `Fonte 1 · Quiz 4 · Flashcard 2 · Fogli 4 · Sintesi 1 ·
  Catene 1` (13 voci) · **subito** dopo il cambio materia → `4R › Storia › Nessun progetto`
  e colonna a 0 · cambio classe → `1B › Materia`, colonna a 0.

## ✅ 9/8 (4) — la stampante sui pre-generati, e il titolo di sezione che si accende
Due richieste di Giacomo sulla leggibilità della colonna.
1. **L'icona dice che cosa si può FARE**, non di che genere è (il genere lo dice già il
   gruppo che contiene la voce): tutti i documenti del vault portano `printer`, gli
   editabili conservano la loro (`file-question`, `layers`, `scissors`, `git-branch`). In un
   elenco misto le due nature si distinguevano solo leggendo il nome del file.
   Misurato su «I Cromosomi»: 13 voci, **7 con la stampante**, un solo tipo di icona per i file.
2. **Il titolo di sezione ha fondo emerald quando è APERTO** (e al passaggio, e col fuoco da
   tastiera), trasparente da chiuso: così il verde marca ciò che sta occupando spazio e una
   colonna di sezioni chiuse resta silenziosa.
   - ⚠️ Lo stato lo dichiara **`aria-expanded`**, l'attributo che il motore già scrive
     quando piega — è anche quello che uno screen reader legge; un secondo indicatore nostro
     potrebbe divergere.
   - ⚠️ Testo e contatore diventano **scuri**: bianco su `#41e6aa` fa 1,6:1 (misurato il
     4/8). Con sei gruppi aperti: **12,3:1** su ognuno, banda 248 in una colonna di 272.
   - La pillola del contatore, che sul verde sarebbe sparita, passa a un velo scuro.

### File toccati il 9/8 (da committare insieme)
`public/js/mappai-vaults-bus.js` (NUOVO, il canale) · `mappai-elabora.js` (indice delle
fonti, ripristino, estrazione lazy, `#ec-src`) · `mappai-elabora-console.js` (documenti dal
disco, gate del contesto, briciola, icone) · `mappai-landing-teach.js` (mappe del contesto
esposte, `generePerFile`, ascolto del canale, hook della console) · `mappai-vault-io.js` +
`mappai-vault-manager.js` (ripristino al load, segnale) · `mappai-doc-editor.js` (mai la
lista nella console, `haDocumento`, segnale) · `mappai-material-pipeline.js` (segnale) ·
`main.js` + `preload.js` (IPC `vault-sources-list`) · `mappai-console-manifesto.css`
(titoli emerald) · `en_translations.js` · `index.html` (`?v=fonti9`).

## ✅ 9/8 (3) — la colonna di ELABORA vede anche i documenti SUL DISCO
Giacomo: «il progetto Cromosomi non carica il file Sintesi che è in Materiale Studio».
**Causa**: la colonna elencava solo i set EDITABILI (`appState.db.studySets`, che il vault
ricarica) e l'archivio in localStorage. Il disco non lo guardava nessuno — gli stessi due mondi
che non si parlano della cecità sulla fonte. Nel vault di «I Cromosomi» c'erano **sette**
documenti (`Sintesi -VERDE.html`, due quiz, flashcard, tre fogli dei nodi) e la colonna diceva
«Sintesi 0».
- Ora i gruppi uniscono **set + file del vault**: sono la stessa cosa in due stadi, e tenerli in
  elenchi diversi obbligava a cercare in due posti. Voce marcata «nel vault»; i `.json` restano
  fuori (sono i set stessi, comparirebbero due volte, una editabile e una no); i file di genere
  ignoto finiscono in «Altri documenti» invece di sparire.
- **Il genere lo dice `MappAITeach.generePerFile`** — la regola di INSEGNA, esposta invece che
  ricopiata: due classificatori dello stesso nome-file divergerebbero al primo ritocco.
- **Apertura in sola lettura** (`_montaFile`): un file del vault è un documento FINITO, non un set
  da correggere. Byte via IPC → data-URI in un iframe (la stessa tecnica di INSEGNA, e l'unica che
  regge un PDF), con una riga sopra: nome · **Stampa** · **Apri nel Finder**. Chi vuole modificare
  passa dal set, che resta la voce editabile.
- La lettura del disco si rifà al cambio mappa, al cambio contesto e quando arriva
  `mappai-vaults-changed`: un materiale appena generato compare senza riaprire.
- **Misurato in Electron su «I Cromosomi»**: gruppi `Quiz 4 · Flashcard 2 · Foglio dei nodi 4 ·
  Sintesi 1`, con i set e i file affiancati; la sintesi si apre (`data:text/html`, barra col nome),
  un quiz PDF si apre (`data:application/pdf`), e tornando a un set l'editor riprende il posto
  (`#elab-doc-host` + `.de-bar`), tornando alla fonte torna `#ec-src`. Un contenitore per volta.

### E i tre difetti del giro precedente (stessa sessione)
1. **La sintesi di un'altra mappa compariva senza classe**: era un difetto della mia correzione —
   «se non so di che mappa sono, la mostro» si applicava a TUTTE quando non c'è mappa aperta. Ora
   senza mappa aperta la colonna non elenca documenti (verifica sui NODI, non sul nome: il nome
   resta da un caricamento precedente).
2. **«Catena dei perché» c'era sempre**: la condizione guardava se il MODULO era caricato, non se
   la mappa avesse nessi. Ora conta i nessi veri (doc salvato o ricavabili adesso, deterministico).
3. 🐛 **La vecchia superficie che riappariva**: `openCausal` RINUNCIA quando non trova nessi (avvisa
   e resta dov'è), ma la console aveva già mostrato la tela e l'editor — rimasto in modalità
   elenco — ci disegnava la sua lista «Documenti da elaborare». Chiuso in un punto solo invece di
   rincorrere ogni apertura che può rinunciare: **nella console l'editor non disegna mai la lista**;
   e la console chiede `haDocumento()`, se no la voce non resta marcata e l'area torna al segnaposto.
   Verificato: host **vuoto** dopo un ritorno a lista non annunciato; col workspace classico (console
   chiusa) la lista c'è ancora con le sue 4 righe.

## ✅ 9/8 (2) — LA FONTE TORNA DAL VAULT · letture sempre fresche · briciole a cascata
Tre richieste di Giacomo, provate tutte nell'app vera (CDP, 28 vault reali). Suite 1004/0/2.

### 1. La cecità sulla fonte è chiusa
Il PDF originale era in `Fonti/` dal 22/7, ma il TESTO non stava da nessuna parte: i markdown
non portano più «## Fonti» da quando lo schema del ramo ha smesso di chiedere i `chunks` (9/6).
Ora il vault porta anche le fonti:
- **`Fonti/fonti.json`** = indice (id · tipo · nome · `vaultRel` · caratteri · `testoRel`) e
  **`Fonti/<nome>.txt`** = il testo estratto. Testo in un file separato per due ragioni: il vault
  è leggibile in Obsidian (un .txt lì si apre e si cerca), e un JSON che si porta dentro megabyte
  va riscritto per intero a ogni salvataggio. Scritti da `salvaIndiceFonti()`, che gira dentro
  `flushSourcesToVault` — cioè a ogni salvataggio del vault, dove già si travasavano i PDF.
- **Ripristino a tre gradini** (`ripristinaFontiDalVault`, chiamato da `loadMapVault` E da
  `directLoadVault`, che è la strada di INSEGNA e della briciola dei progetti): indice → se manca,
  si elenca `Fonti/` col nuovo IPC **`vault-sources-list`** e si ricostruiscono le voci PDF senza
  testo → se non c'è nulla, non si tocca niente. Non sovrascrive fonti già in memoria.
- **Il testo mancante si estrae quando serve** (`_completaTestiMancanti`, all'apertura della fonte
  in ELABORA) con la STESSA `extractTextFromPDF` dell'upload, e il risultato si scrive nel vault:
  la volta dopo è pronto. Questo copre tutti i vault salvati prima di oggi.
- **Misurato sul vault vero** (mappa «Elettricità - MM», PDF da 7 MB): fonte ripristinata →
  **33.385 caratteri** estratti → corpus 33.385 → ELABORA dice «3042 parole · 387 frasi · 9 nessi
  causali · Gulpease 84». Su disco compaiono `2.1 PROJECT E.txt` e `fonti.json`.
- 🐛 **E il PDF nella tela, che era «non provato», ora funziona**: la voce PDF della colonna
  guardava solo `x.file` (l'oggetto File del browser), che una mappa riaperta non ha e non può
  avere — quindi il visore era irraggiungibile proprio sulle mappe riaperte, il caso normale. Ora
  vale anche `vaultRel`: **24 pagine montate** leggendo i byte dal vault.
- ⚠️ Due inciampi corretti misurando: `read-vault-file` ritorna **solo base64** (è nato per i PDF),
  quindi il testo va decodificato con `TextDecoder` — `atob` da solo rompe gli accenti; e il nome
  del testo era «X.pdf.txt» (doppia estensione) → ora «X.txt».
- ⚠️ Provato anche il caso rotto: indice che punta a un testo **cancellato** → si autoripara,
  riestrae e riscrive l'indice col nome giusto.

### 2. Gli elenchi non vivono più di ricordi
Rileggere costa **niente** — misurato in Electron su 28 vault: `getAllVaults` 7ms la prima volta e
1-2ms poi, i materiali di una mappa 1ms, le sessioni 5ms. Quindi non serve una cache più furba,
serve **accorgersi**. File nuovo **`public/js/mappai-vaults-bus.js`**:
`MappAIVaults.segnala(motivo, dettaglio)` / `.quando(fn)` → un solo evento
`mappai-vaults-changed`, con le notifiche **raggruppate a 60ms** (la pipeline scrive otto file di
fila: otto ridisegni sono sette di troppo).
- **Segnalano**: salvataggio del vault e **auto-vault a fine generazione** (era il caso che si
  vedeva più spesso: la mappa nuova non compariva), spostamento della cartella, eliminazione di un
  file (due punti), «Nel vault» dell'editor, e il manifest della pipeline a ogni transizione.
- **Ascoltano**: la landing (INSEGNA o ELABORA, quale è visibile), la **console INSEGNA aperta**
  (appiglio `_consAggiorna`, perché il suo `ridisegna` vive dentro `openConsoleInsegna`), la
  console ELABORA, e `StorageManager.syncValidVaults`. Si azzerano anche le cache che
  rappresentano il disco (`_generi`, `_diskCache`), o resterebbero le vecchie sotto una tabella
  nuova. Chi ascolta si **stacca** alla chiusura.
- **Misurato con una scrittura vera a console aperta**: 13 righe → **14** e il file nuovo compare
  senza riaprire; al segnale di eliminazione **14 → 13**.

### 3. Le briciole seguono la cascata
Cambiare un livello riporta indietro i seguenti, come chiesto: **scelgo un progetto** → la briciola
lo mostra; **cambio materia** (stessa classe) → il progetto torna neutro; **cambio classe** → la
materia torna «Materia» e il progetto **sparisce**. Verificato in Electron:
`4R › Scienze › 2.1 PROJECT E` → `4R › Storia › Nessun progetto` → `1B › Materia`.
- La causa della «persistenza» era un ripiego: la briciola mostrava il nome della mappa CARICATA
  (`rootNodeLabel`) anche quando quella mappa non apparteneva più al contesto. Ora il nome si
  mostra solo se la mappa è fra quelle del contesto; il `rootNodeLabel` vale solo nell'istante in
  cui l'elenco dal disco non è ancora arrivato.
- Non è solo grafica: cambiando contesto si azzera anche la voce scelta, si smonta la fonte e si
  lascia andare l'editor — il documento aperto era della mappa di prima.

## ✅ 9/8 — PROVATO IN ELECTRON (app vera, debug remoto CDP, 28 vault reali)
`npx electron . --remote-debugging-port=9222` + helper `cdp.js` (ws già in node_modules) →
`Runtime.evaluate` nel renderer vero. Viewport 1280×768, 0 errori console, 28 vault su disco
(25 MindMap, 3 KG), tutti con `extractionMode` dichiarato.

**Funziona tutto quello che era «da provare»:**
| cosa | esito misurato |
|---|---|
| contesto vuoto al lancio | classe · materia · sticky **nulli**, marcatore posato → topbar «Elabora › A chi?» |
| icona MM/KG sui vault VERI | «2.1 PROJECT E» e «Introduzione alla Robotica» → `network`; le 7 MindMap → `git-merge` |
| **ciclo LAYOUT su MindMap** (41 nodi) | `default → ORBITA → RADIALE → **STUDIO** → default`, overlay con **41 card** / 93 testi, badge «STUDIO» |
| **i 7 motori sulla mappa vera** | geometrie distinte: dag 7 righe · albero 4 · anelli 33 · colonne 4 · percorso 4 (134 testi = badge) · fasci **52 tratti su 104** (bundling) · matrice 52 card |
| pannello del tab «vista» | 6 chip preset · 7 segmenti · 7 slider · PDF · metriche vive: «41 nodi · 52 archi · 34 incroci · 1 etichette accavallate» |
| Focus + ESC a strati | focus 767×768 con 4 card (nodo + vicini); ESC chiude il focus e la vista studio **resta** |
| **ciclo su KG** (35 nodi, 71 archi) | `ORBITA → SEPARATO → STUDIO (35 card) → PERSONAL`; metriche «210 incroci · 1 invertiti · 13 etichette accavallate» |
| overlay orfano al cambio mappa | **nessuno**: caricando un'altra mappa l'overlay se ne va |
| console ELABORA | si apre al posto del workspace (`#elab-overlay` **assente**), 6 gruppi coi contatori |
| briciole di ELABORA | «Elabora › 4R › Scienze › *Elettricità*» — l'ultima in **corsivo**, come chiesto |
| fonte nella tela | `#ec-src` **1002×642**, split presente, colori risolti (`rgb(30,41,59)`), 5 comandi |

### 🐛 DIFETTO PREESISTENTE trovato qui, e non è piccolo: il vault non riporta la FONTE
Aprendo una mappa dal disco, ELABORA è **cieco sulla fonte**: `appState.sources` = 0, corpus = 0
caratteri, `sourcesDict` vuoto, 0 nodi con `chunks` → la tela dice «Nessuna fonte nel progetto» e
con essa **restano vuote copertura, evidenziazione, «Domande scheda» e i due export**.
- Non è del lavoro di stanotte: la console mostra correttamente ciò che c'è, e non c'è nulla.
- La causa: `saveMapVault` scrive gli originali PDF in `<vault>/Fonti/` (22/7, «anteprima ELABORA
  persistente») ma **nessuno ripristina `appState.sources` al caricamento**. `_collectPdfs` sa
  leggere da `Fonti/` solo via `src.vaultRel`, cioè solo se le sources esistono già in memoria:
  la persistenza vale dentro la sessione, non fra i riavvii.
- Conseguenza pratica: ELABORA serve solo **subito dopo la generazione**. Riaperta una mappa —
  che è il caso normale in INSEGNA — è un guscio.
- Serve un elenco delle fonti salvato nel vault (nome · tipo · `vaultRel` · testo estratto) e il
  suo ripristino al load. È il prossimo lavoro naturale, e va deciso con Giacomo: il testo
  estratto in chiaro dentro il vault è una scelta (peso su disco, e il vault è Obsidian-leggibile).
- ⚠️ Per questo il **PDF nella tela resta non provato**: nessuna mappa riaperta ha un PDF da
  montare. Va provato generando una mappa nuova e restando nella stessa sessione.

⚠️ L'app Electron è rimasta APERTA con la porta di debug 9222.

## ✅ 8/8 notte (4) — uscendo da un documento l'AREA torna vuota
Rilievo di Giacomo: chiudendo l'editor ricompariva **la vecchia superficie di selezione dei
documenti** dentro l'area. Non era un residuo: `backToList()` in `mappai-doc-editor.js` mette
`_view='list'` e ridisegna la SUA lista nell'host — che nella console è la tela. L'editor non sa
che la console esiste, e nel workspace classico quella lista è la superficie giusta.
- **Fix**: `backToList()` **annuncia** l'uscita (`mappai-doc-uscito`, evento sincrono emesso
  PRIMA del suo `render()`); la console ascolta, azzera `_voce` e ridisegna → tela via,
  segnaposto, e la voce nella colonna si deseleziona da sé (la voce attiva è un dato dello
  schema, non una classe appiccicata al DOM). L'ascolto si toglie alla chiusura: la console si
  apre più volte in una sessione.
- ⚠️ L'ordine conta: l'evento arriva prima del `render()` dell'editor, quindi quando l'editor
  cerca il suo host non lo trova più e non disegna niente. Nessuna lista che compare e sparisce.
- **Verificato** (via il bottone VERO «‹ Documenti», flag acceso): tela e `#elab-doc-host` via,
  area = «Scegli un documento nella colonna…», nessun `.de-bar` né lista dell'editor, voce
  deselezionata, colonna intatta; riaprendo il documento l'editor torna. 0 errori console.
- **Verificato anche col flag SPENTO**: il workspace classico esce sulla sua lista «Documenti da
  elaborare» come prima — l'annuncio non cambia niente dove la lista serve.
- ⚠️ Resta un dettaglio dichiarato: nella console il bottone dell'editor si chiama ancora
  «‹ Documenti» mentre porta a un'area vuota. L'editor non sa dove sta, e cambiargli l'etichetta
  dall'esterno vorrebbe dire una seconda fonte per il suo markup: se dà fastidio, si rinomina
  nell'editor (là il nome è giusto) o si accetta che «Documenti» indichi la colonna.

## ✅ 8/8 notte (7) — il GENERE della mappa si legge dal disco, non si indovina
Giacomo: «2.1 PROJECT E» mostrava l'icona delle MindMap ed è un Knowledge Graph.
**Causa**: `_consCaricaMappe` deduceva `type: (p && p.type) || 'mindmap'` — il genere veniva dal
progetto in localStorage, e senza progetto ripiegava su MindMap. In Electron le mappe senza
progetto sono la maggioranza (la fonte è il disco), quindi **ogni KG del genere era dichiarato
MindMap per difetto**. Il dato vero c'era già e nessuno lo leggeva: `index.yaml` porta
`extractionMode` e `get-all-vaults` lo restituisce (`readVaultInfo`, main.js ~2560).
- Ora **il disco vince** sul campo del progetto: la stessa regola già in vigore per classe e
  materia (la cartella è la fonte di verità, il campo del progetto è il ripiego di chi non ha
  Electron). I vault vecchi senza `extractionMode` restano MindMap, come prima.
- Non è solo l'icona: da quel campo dipende **«Elabora»**, che c'è sulle MindMap e non sui KG.
  Prima, su un KG dedotto MindMap, il bottone compariva e poi rispondeva con un avviso.
- **Misurato**: KG senza progetto → `kg` · MM → `mindmap` · vault legacy senza `extractionMode`
  → `mindmap`; nella console INSEGNA l'icona è `network`.

### Il secondo posto con lo stesso difetto: i PICKER dei progetti
Un difetto che si è ripetuto una volta si è quasi sempre ripetuto altrove: il picker delle mappe
(avvii rapidi di INSEGNA) elenca i PROGETTI di localStorage e ha in mano solo `p.type` — che le
mappe generate senza progetto non hanno. Aggiunta una **cache nome→genere** (`_generi`), riempita
ogni volta che qualcuno legge i vault (INSEGNA · ELABORA · la console), e `_tipoDi(p)` che
interroga prima il disco e ripiega su `p.type`.
- ⚠️ La chiave è il nome della cartella quando il progetto la dichiara, il nome della mappa
  altrimenti: due mappe omonime in classi diverse condividono la seconda chiave e vince l'ultima
  letta. È il compromesso di un picker che elenca progetti, non cartelle.
- **Misurato**: progetto senza `type` + vault `extractionMode: 'kg'` → il picker mostra `network`.

### Terzo: la meta-analisi faceva indovinare il genere pur avendolo
`analyzeStructure(nodes, links, {})` in `mappai-meta-analysis.js` → senza `mode` si cade su
`detectMode`, che deduce il genere dal formato degli id (`L1_…`). Il vault caricato porta
`extractionMode`: ora glielo si passa. Conta perché le analisi gerarchiche girano **solo** sulle
MindMap, quindi un genere sbagliato produce suggerimenti sbagliati.
- `detectMode` resta come ripiego, ed è giusto così: è pura e serve a chi non ha il dato.
- ⚠️ Errore mio nel primo tentativo, corretto: la patch chiamava `analyzeStructure` **due volte**
  con una condizione senza senso. Riscritta con una chiamata sola.

### ⚠️ Il censimento delegato aveva 3 falsi positivi su 5 — verificati uno per uno
Non fidarsi dei numeri di riga di un rapporto su file appena modificati:
- la tabella-disco dei progetti di ELABORA **legge già** `v.extractionMode` (non era rotta);
- `vault-io.js:200` legge `data.mode || data.extractionMode` (il ripiego scatta solo se il JSON
  non porta il genere);
- `vault-io.js:425` è `startEmptyMap` — «Nuovo progetto» vuoto, MindMap per definizione, non un
  import che forza il genere.
Resta vero il `detectMode` euristico e restano i picker (corretti qui sopra).

## ✅ 8/8 notte (6) — il contesto NON si eredita dal lancio, e la briciola «qui» resta corsiva
Due rilievi di Giacomo, due cause indipendenti.

### (a) All'avvio la topbar diceva «4R › Geografia»
Era la decisione del 3/8 («i chip restano in localStorage e sopravvivono alla chiusura»), che
**Giacomo rovescia**: al lancio la topbar dice «Elabora › A chi?», e la materia si rivela solo
dopo aver scelto il destinatario. `_contestoVuotoAlLancio()` in `init()` di landing-teach azzera
classe · materia · allievo · flag sticky del percorso.
- ⚠️ Si azzera al **LANCIO**, non a ogni `init()`: `backToLanding` fa `location.reload()` e il
  reload ripassa da lì — senza guardia, tornare alla landing da una mappa avrebbe buttato via la
  classe appena scelta. Il marcatore sta in `sessionStorage` (sopravvive al reload, muore col
  processo: in Electron un lancio = una sessione). **Verificato**: dopo il reload classe e
  materia sono ancora quelle scelte.
- ⚠️ Va azzerato **anche** `mappai_bento_achi`: dice «A chi? l'ho già scelto», e senza toglierlo
  la briciola mostrava «Generico» rivelando «Materia» — un contesto scelto da nessuno.
- ⚠️ **L'allievo attivo non è una chiave sua**: è `appState.userProfile.nickname`. Si usa
  `setActiveStudent(null)`, lo stesso gesto del bottone «Generico», che azzera il profilo ATTIVO
  e non tocca le schede in `allProfiles` — cancellarle sarebbe perdere dati.
- Chi dipende dal contesto degrada bene (censito): `buildTuningBlock`/`classTuningPrompt` tornano
  stringa vuota, `injectClassTuning` è un no-op, «Adatta» si disabilita da sé, e
  `mapVaultParents('')` torna `[]` → la mappa nasce in `Mappe/` **flat**, non in una cartella
  «senza classe».

### (b) La briciola del progetto tornava grassetto dopo mezzo secondo
Il corsivo era legato a «ultimo livello **statico**». La briciola del progetto è l'ultima E si
apre: al primo disegno nasce statica (l'elenco dal disco non c'è ancora) → corsivo; quando il
disco risponde diventa una tendina (`<button>`) → grassetto. Da qui il lampeggìo.
Ora un livello può **dichiararsi** `qui: true` e resta corsivo anche da cliccabile.
- ⚠️ Legato al DATO, non alla posizione: dedurlo da «è l'ultimo» avrebbe messo in corsivo anche
  la materia di CREA, che nessuno ha chiesto di cambiare (verificato: CREA invariata, 700).
- Le voci della tendina restano in grassetto: là sono un elenco di scelte, non il posto in cui si è.

### 🐛 Due difetti trovati verificando, entrambi miei (di ieri sera)
1. **Scegliere una classe dalla briciola di ELABORA non funzionava**: `specContesto` consegna
   l'OGGETTO classe e la console faceva `setActive(oggetto)` → «[object Object]» in localStorage,
   `getActive()` null, briciola «Generico». Ora passa `c.id`, e scegliere una classe azzera
   materia e allievo come nella landing. (`setActiveStudent('')` non azzerava: il modulo vuole `null`.)
2. **La briciola del progetto compariva troppo presto**: «Nessun progetto» accanto a «A chi?»,
   cioè una risposta a una domanda non ancora fatta. Ora sta dietro la stessa rivelazione
   progressiva: serve il destinatario **e** la materia scelta davvero.
- **Verificato dalla porta vera**: lancio pulito → «Elabora › A chi?» · scelgo 2A → «Elabora › 2A
  › Materia» · scelgo Storia → «Elabora › 2A › Storia › *Progetto*» (corsivo 400). 0 errori console.

## ✅ 8/8 notte (5) — via «‹ Documenti» dalla barra degli editor (nella console)
Seguito del punto (4): nella console quel bottone diceva «Documenti» mentre l'elenco dei
documenti è la COLONNA, sempre a schermo e con la voce aperta marcata — un secondo comando per
una cosa che non è nascosta. Ora la barra dell'editor non lo emette quando è la console a
ospitarlo; **nel workspace classico resta**, perché là è l'UNICA uscita dal documento (la sua
lista occupa lo stesso posto del foglio) — toglierlo lì avrebbe chiuso dentro chi apre un quiz.
- Un punto solo: `_docBar()` in `mappai-doc-editor.js`, con `_inConsole()` che **chiede alla
  console** (`aperta()`) invece di leggere il flag: il flag dice che il cablaggio è acceso, non
  che in questo momento sia lei a ospitare l'editor.
- `backToList` resta esportata e l'annuncio del punto (4) resta: è la strada del workspace, e
  nella console fa da rete se qualcuno la chiama da fuori.
- **Verificato** (flag acceso): barra senza «‹ Documenti» su **tutti e quattro** gli editor —
  quiz, flashcard, foglio dei nodi, catena dei perché — con zoom · Annulla · (HTML) · Nel vault ·
  Stampa · Salva al loro posto. **Flag spento**: il bottone c'è e uscendo mostra ancora la lista.
  0 errori console.
- Nella console si passa da un documento all'altro dalla colonna, e si esce con ESC o dal
  pallino della testata.

## ✅ 8/8 notte (3) — la VISTA STUDIO torna nel ciclo LAYOUT (non era una regressione)
Giacomo: «i layout studio — DAG, Albero… — non si attivano più dal ciclo del bottone LAYOUT».
Misurato: **non era una regressione**. `mappai-studio-{view,draw,layouts}.js` **non esistevano su
`main`** e `index.html` non li citava: vivevano solo su `feature/vista-studio` (`8d1f7ae` +
`db443fe`), mai fusa. Su main `toggleLayout` andava `default → orbit → radial/separated →
personal → custom`: il passo STUDIO non era nel codice, quindi non c'entrava il kill-switch.

**Come sono entrati, e perché NON col merge.** `git merge feature/vista-studio` dava 6 conflitti:
quel ramo porta anche una **copia** dei tre commit console-bento (hash diversi, contenuto più
vecchio del lavoro di stasera), e il merge avrebbe riportato indietro `modal.js`, `modal-core.js`,
`console-manifesto.{js,css}`, `landing-teach.js`. Merge annullato; fatto invece il
**cherry-pick dei due soli commit della Vista Studio**: un conflitto solo, su `CLAUDE.md`
(risolto tenendo main, che quella sezione ce l'ha già). Prima però il lavoro di stasera è stato
committato (`0aae84e`), o il merge avrebbe rifiutato di toccare `index.html` e `en_translations.js`.
Storia su main: `0aae84e` console ELABORA → `8da0ecc` + `c01798e` vista studio.

**Verificato** nell'harness dei moduli VERI (`public/dev/studio-harness.html`, 1440×900, 0 errori):
ciclo `default → orbit → separated → **studio** → default`, `#studio-overlay` montato e smontato,
e i **sette motori disegnano sette geometrie diverse** (card misurate a schermo):
| motore | card | righe distinte | note |
|---|---|---|---|
| dag | 30 | 7 | Sugiyama |
| td | 30 | 6 | albero portante |
| anelli | 30 | 15 | concentrico |
| colonne | 30 | 6 | una colonna per ramo L1 |
| percorso | 30 | 4 | +30 badge numerati, 140 tratti |
| fasci | 30 | 27 | tratti 82 → **41** (bundling) |
| matrice | 41 | 18 | adiacenza |
- ⚠️ **Errore mio, corretto misurando**: la prima prova dava sette volte gli stessi numeri e
  sembrava un difetto. Non lo era: il campo del profilo è **`mode`**, non `motore`, e `profile()`
  non prende argomenti (ritorna l'oggetto da mutare). Stavo cambiando una chiave inesistente.
- ⚠️ Suite: **1004 pass / 0 fail / 2 skip** (+18 test dei motori, che ora girano su main).
- ⚠️ **Da provare in Electron**: il ciclo su una mappa VERA (MM e KG) e l'overlay sopra il canvas
  vero. Tutta la lista di prove in sospeso di quel ramo è in CLAUDE.md §11 «VISTA STUDIO».

## ✅ 8/8 notte (2) — la QUARTA BRICIOLA: il progetto, e la sua tendina
Richiesta di Giacomo: in ELABORA l'ultima briciola deve dire su QUALE mappa si lavora —
in ogni modo si sia arrivati lì (avvio → ELABORA · «Elabora» dal menu di una mappa aperta ·
da CREA con classe e materia già scelte · da INSEGNA con anche il progetto) — e cliccandola
deve aprirsi la tendina dei progetti di quella classe e materia. Fatto, tutto UNCOMMITTED,
suite **986/0/2**, 0 errori console, misurato a 1440×900.

**Niente elenco nuovo.** Le tre cose che servivano esistevano già, private nella console
INSEGNA: `_consCaricaMappe` (i vault dal DISCO coi progetti agganciati), il filtro per
classe+materia e `_consQuandoPronta` (aspetta l'IDENTITÀ della mappa, non un timeout).
Sono state **esposte**, non ricopiate — un secondo elenco delle stesse mappe è
esattamente l'errore che aveva fatto comparire i materiali di una classe sola:
`MappAITeach.mappeDelContesto()` · `.mappaCorrente(list)` · `.apriMappa(m, poi)`
(+ `_consFiltrate` rifattorizzata su `_filtraContesto(list)`, stessa regola per entrambe).

**Il livello** vive in `mappai-elabora-console.js` (`_livelloProgetto`), appeso in coda a
`specContesto` — non dentro `specContesto`, che è sincrona mentre l'elenco arriva dal disco.
Tre stati, tutti provati:
| stato | briciola | tendina |
|---|---|---|
| mappa aperta | il suo nome | i progetti della classe+materia, con quello corrente marcato (`aria-checked`) |
| nessuna mappa (avvio → ELABORA) | «Progetto» | idem |
| classe+materia senza mappe | «Nessun progetto» | una riga che lo dice, non una tendina vuota |
| caricamento in corso | «<nome> · apro…», statica | — |

- ⚠️ **L'ultima briciola con `menu` NON prende il corsivo di «sono qui»** (`is-qui` vale
  solo per i livelli statici). È il prezzo del renderla cliccabile: un livello in corsivo
  che si apre direbbe due cose opposte.
- **Cambiare mappa da qui è più che caricarla**: i documenti della colonna e quello aperto
  nella tela sono della mappa di PRIMA → si azzera l'editor, si smonta la fonte, si torna
  al segnaposto, e si ridisegna quando la mappa nuova c'è DAVVERO.
- ⚠️ **«apro…» non è un vezzo**: misurato, fra il clic e la mappa caricata da vault
  passano ~400ms in cui la briciola mostrava ancora il nome VECCHIO mentre la console era
  già tornata al segnaposto — diceva una cosa e ne stava facendo un'altra.
- Cambiare classe o materia **rilegge l'elenco** (`_mappe = null` → ricarica): il filtro
  vive in landing-teach, qui non se ne tiene una copia.

### 🐛 Il difetto che questa briciola ha fatto uscire: il menu non scorreva
`.mn-bric-menu` non aveva **né `max-height` né `overflow`**. Finché le tendine erano «Cosa»
(3 voci) e «Materia» (una manciata) non si vedeva; i progetti sono decine. Con 40 mappe il
menu sarebbe stato alto **1238px** partendo da y=52, cioè **oltre il bordo della finestra**,
con le voci in fondo irraggiungibili. Ora tetto **62vh** + `overflow-y:auto` +
`overscroll-behavior:contain`; nel menu a COLONNE («A chi?») lo scorrimento va nella
singola colonna, o tre colonne che scorrono insieme perdono l'allineamento delle
intestazioni — che è la ragione per cui esistono le colonne.
Misurato con 40 progetti: contenuto 1238 su **556 visibili**, menu 558 col fondo a **610**
su 900 di viewport, ultima voce raggiungibile scorrendo.

### Provato per la porta vera
`MappAITeach.setMode('elabora')` con una mappa aperta → **«Elabora › 2A › Storia ›
Elettricità»**, corpi 30/18/18/18; clic sulla quarta → tendina sotto il trigger con le 2
mappe di 2A·Storia e «Elettricità» marcata; scelgo «La Carta» → `directLoadVault` chiamata
col percorso GIUSTO → a caricamento finito la briciola dice «La Carta». Cambio materia in
2A·Scienze naturali → «Nessun progetto». Elenco per classe: 2A·Storia = 2 mappe,
1B·Scienze naturali = 1.
⚠️ Provato con `getAllVaults` finto (nel pannello non c'è disco): in Electron va rifatto
sui vault veri, dove i progetti in localStorage e le mappe senza progetto convivono.

## ✅ 8/8 notte — la FONTE nell'area · UNA topbar · i gruppi che si ricordano
Tutto UNCOMMITTED. Suite **986/0/2**, 0 errori console, misurato nella pagina servita
a 1440×900 con dati finti in `appState`.

### 1. La FONTE entra nella TELA (il nodo grosso)
Era un ponte perché il corpo della fonte era scritto DENTRO `_shell`, cioè dentro la
pagina intera del workspace: la console poteva solo aprire quella pagina e chiudersi.
Ora quel corpo è una funzione sua e ELABORA sa disegnarlo in un contenitore qualunque.
- **`mappai-elabora.js`**: estratti `_sourceBodyHTML(s, R, pdfs)` (striscia di triage +
  le due colonne + legenda — la CORNICE resta a `_shell`) e `_analisi()` (struttura,
  copertura, marcatori, PDF raccolti, stato di vista normalizzato), che ora usano
  entrambe le superfici → la fonte non può essere analizzata in due modi diversi.
  Nuovi: `mountSource(el, {view, pdfIdx})` · `unmountSource()` · `renderSource()` ·
  `sourceActions()` / `runSourceAction(id)`.
- **Il pezzo che fa funzionare tutto il resto senza riscriverlo** è una guardia in testa
  a `render()`: se l'host della console è montato *e attaccato al documento*, `render()`
  ridisegna lì. I comandi interni della fonte (segmenti testo/PDF, Card/Albero, «Ignora
  intestazioni», ignora/aggiungi citazione, rivela nella fonte…) chiamano `render()` da
  sempre: zero gestori duplicati. Verificato che nessuno di quei gesti apra il workspace.
- **`mappai-elabora-console.js`**: `_apriFonte` (il ponte) **eliminato**; `_montaSrc(box)`
  crea `#ec-src` nella tela e toglie `#elab-doc-host` (un contenitore per volta, e
  viceversa quando si torna a un documento); i comandi della fonte sono una fila di
  azioni sopra il documento (`src-*` → `runSourceAction`), perché la barra è della console.
- ⚠️ **La vista si passa a `mountSource`, non con `setSrcView`/`setPdfIdx`**: quei setter
  chiamano `render()`, e chiamati prima del montaggio — con l'host del giro precedente
  già staccato dal documento — riaprirebbero il workspace SOPRA la console.
- ⚠️ **`#ec-src` va dichiarato nel foglio di `mappai-elabora.js`**: le variabili di colore
  e il corpo del testo sono scoped a `#elab-overlay`/`#elabora-content`, e dentro la
  console nessuno di quei due esiste. Senza, ogni `var(--eink)` resta irrisolta.
- ⚠️ **Niente apici inversi nei commenti di quel CSS**: è un template literal e l'apice
  chiude la stringa (`node --check` è morto su una riga di prosa — terza volta in repo).
- **Misurato**: fonte nella tela **1162×774** (tela 1162×775), `#elab-overlay` assente e
  `body.elab-fullscreen` spento in ogni passaggio, colore risolto `rgb(30,41,59)`, corpo
  16px, striscia di triage + 2 pannelli + legenda + 5 comandi; passando a un documento la
  fonte si smonta e i comandi `src-*` spariscono; tornando alla fonte l'editor lascia il
  posto. Validatore **0 errori / 0 avvisi**.
- ⚠️ **NON provato: il PDF nella tela** — nel pannello non c'è un PDF vero da montare
  (`_collectPdfs` vuole un file con `arrayBuffer`, e `_mountPdf` passa da pdf.js). È la
  prima cosa da guardare in Electron: aprire una voce `src:pdf:<i>` con due PDF nel
  progetto e controllare che si apra QUELLO cliccato.

### 2. UNA sola strada per la topbar (era il nodo 2)
INSEGNA **spostava** `#header-utils` nella testata (`_huEmbed`/`_huRestore`), ELABORA e la
Cabina ricostruiscono le briciole sul posto: stesso risultato a schermo, due strade da
tenere allineate — e quella «sposta il nodo» è la stessa che aveva bloccato il renderer
(nodo condiviso con la landing + la veste che osserva ogni mutazione del DOM).
Unificato verso **«ricostruisci sul posto»**: `_huEmbed` eliminato, `montaCascata` chiama
`montaPercorso(box, {livelli})` senza `testiEl`, il pallino della testata è già il bottone
Cabina. `_huRestore` resta solo per l'evento che fa ridipingere le briciole della landing.
Nel CSS le regole di parità (livelli al 55%, «Cosa» piena, hover al colore del titolo)
escono da `.mn-head-hu` e valgono per la testata di OGNI console → **un aspetto solo**.
- **Misurato, scarto 0**: landing CREA, console INSEGNA e console ELABORA hanno pallino
  **(28,11) 43×43** e briciole **(81, 17.5)**; `#header-utils` resta in `#landing-view`
  anche con la console aperta; chiudendo, la landing ha di nuovo le sue briciole.
- L'allineamento ora è **per costruzione**: `padding-left:28px` + `align-items:center`
  sulla `.mm-head` valgono per tutte le console, non è più una taratura per sezione.

### 2-bis. 🐛 Un difetto PREESISTENTE della console, trovato misurando
`render()` di ELABORA non sapeva che la console è aperta, e la landing lo chiama per
suo conto: la ri-sincronizzazione dei vault all'ingresso in ELABORA
(`_ensureFreshAndRerender`) e il filtro classe. Risultato misurato: **`#elab-overlay`
presente con la console aperta** — il workspace a tutto schermo costruito dietro di lei,
con l'editor che disegnava in `#elab-doc-host` sbagliato. Ora `MappAIElaboraConsole`
dichiara `aperta()` e `render()` con la console in piedi smonta l'overlay e si ferma:
la superficie di ELABORA è la console, e chi ridisegna è lei.
Verificato per la via vera (`MappAITeach.setMode('elabora')`): console aperta, overlay
assente, `body.elab-fullscreen` spento, e un `render()` successivo non tocca la fonte.

### 3. I gruppi chiusi si ricordano — e il difetto del motore che veniva prima
Memoria **globale** (`localStorage mappai_ec_gruppi`): i gruppi sono i GENERI di documento,
non una proprietà della mappa — chi tiene chiusi i quiz li vuole chiusi su ogni mappa.
Stato illeggibile → tutti aperti (non deve nascondere elenchi).
- 🐛 **Difetto vero del motore, trovato provando questo**: il gestore dei gruppi vive in
  `render()` ma chiamava `manda`, che è definita in `open()` → **`manda is not defined` a
  ogni clic su un titolo di gruppo**. Il gruppo si piegava (la classe si scambia prima
  del lancio), quindi a occhio sembrava funzionare, ma l'avviso `__gruppo` non arrivava
  mai: la console riapriva il gruppo al primo ridisegno e nessuna memoria era possibile.
  Ora `open()` lascia il dispacciatore sul box (`box._mmManda`, ri-appeso a ogni
  ridisegno) e `render()` avvisa solo se c'è — nel banco, dove nessuno ha aperto niente,
  non c'è nulla da avvisare.
- **Misurato**: piego «Quiz e verifiche» → `{"quiz":true}` su disco, `aria-expanded=false`;
  scelgo la fonte (ridisegno) → resta chiuso; **chiudo e riapro la console** → ancora chiuso.

## ✅ 8/8 sera — ELABORA a CONSOLE (tutto UNCOMMITTED)
File nuovo **`public/js/mappai-elabora-console.js`** (`window.MappAIElaboraConsole`),
caricato in `index.html` dopo `mappai-doc-editor.js`. Dietro lo stesso flag: spento,
ELABORA è il workspace di prima. L'ingresso è dirottato in
`mappai-elabora.js` → `open()` (marcatore `open._daConsole` per non rimbalzare).

**Forma**: console-EDITOR, come la F2 del banco — **l'area È il documento**, niente
bento. Il lavoro nuovo è la COLONNA.

**Colonna** — sei gruppi, tutti richiudibili, col contatore sulla riga del titolo:
`Fonte · Quiz e verifiche · Flashcard · Foglio dei nodi · Sintesi · Catene`.
⚠️ Niente elenco riscritto: le voci nascono dalle STESSE fonti dell'elenco
dell'editor (`appState.db.studySets`, archivio `MappAIStudyDocs`, foglio nodi e catena
costruiti dalla mappa) e ad aprirle sono le SUE funzioni (`MappAIDocEditor.openSet/
openSynthesis/openNodeSheet/openCausal`). La classificazione quiz/flashcard passa da
`MappAIDocEdit.kindOfSet`, la stessa dell'editor: non possono divergere.

**«Crea nuovo»** in fondo alla colonna (è il gesto che aggiunge una voce a
quell'elenco, non un comando del documento aperto, che ha già la sua barra). Popup coi
quattro tipi, ognuno col badge che dice CHI lo produce: *dalla mappa* (Foglio dei nodi ·
Catena dei perché → si aprono subito) e *con l'AI* (Sintesi · Quiz/flashcard → portano
a `openStudyMaterialsModal`). La fonte unica è `TIPI` nel modulo: `da`, `puo()`,
`perche()`, `apri()`.

**Area**: la console monta `#elab-doc-host` DENTRO la tela — è l'host che
`mappai-doc-editor.js` cerca, quindi a schermo c'è l'editor VERO, non una copia.
⚠️ La tela si emette **solo con un documento aperto**: il validatore contesta una tela
senza voce attiva («la console si apre senza dire dove sei») e ha ragione — senza
documento l'area porta una riga che dice cosa fare.

**Motore, pezzi nuovi** (`mappai-modal-core.js` + `mappai-modal.js` + i due CSS):
i gruppi della colonna possono avere `contatore`, `collassabile`, `chiuso`. Le voci di
un gruppo vivono ora in un contenitore proprio (`.mm-nav__gc`) — nell'elenco piatto non
erano figlie del titolo, quindi non c'era niente da chiudere. Il titolo È il comando
(come per le tabelle); il motore piega da sé ed emette `__gruppo`, così chi ridisegna
può ricordare lo stato.

**Verificato** (pagina servita, dati finti): colonna coi sei gruppi e i contatori ·
piega/dispiega con `aria-expanded` e contatore che resta · clic su un documento → la
tela compare, l'host è dentro, l'editor disegna, la voce si marca attiva · popup coi
quattro tipi · «Foglio dei nodi» dal popup apre davvero · validatore **0 errori / 0
avvisi** · 0 errori console · suite **986/0/2**.

### ⚠️ Tre trappole trovate qui, da non ripetere
1. **NON spostare `#header-utils` dentro una console** (primo tentativo: ha **bloccato
   il renderer**). Quel nodo è CONDIVISO con la landing e la veste
   (`mappai-console-manifesto.js`) reagisce a ogni mutazione del DOM: spostarlo mentre
   la landing lo rivuole indietro è un rimpallo infinito. Isolato misurando: con quel
   pezzo spento la console si apriva in **8ms**. INSEGNA può farlo perché governa il
   proprio ciclo di ridisegno; le altre console usano
   `MappAIConsoleBento.montaPercorso(box, spec)`, che costruisce le briciole DENTRO la
   testata — zero nodi spostati.
2. **`specContesto` restituisce l'ARRAY dei livelli**, mentre `montaPercorso` vuole
   `{livelli: …}`. Passarlo nudo **non dà errore**: semplicemente non monta niente e il
   chip resta. Difetto muto, costato un giro.
3. **Chi apre una console DICHIARA la sua sezione**
   (`document.documentElement.dataset.manSezionePendente = 'elabora'` prima di
   `open()`): senza, il percorso non sa dove si è e mostra il solo «Cosa».

### ✅ I TRE NODI (erano aperti l'8/8 sera) — CHIUSI l'8/8 notte, vedi sopra
Qui sotto resta la descrizione com'era, utile a capire da dove si partiva.
1. **La FONTE è un PONTE, dichiarato.** Le voci `Testo` e `PDF` **chiudono la console**
   e aprono il workspace classico in modalità fonte (`_apriFonte`, che passa anche
   l'indice del PDF scelto). La vista della fonte — testo estratto, PDF, copertura,
   evidenziazione — è costruita dentro `mappai-elabora.js`, che disegna la pagina
   intera: non è un pezzo staccabile com'è oggi. **Portarla DENTRO l'area della console**
   è il passo grosso che resta, ed è il motivo per cui la voce esiste già.
   ⚠️ Finché è un ponte, per un istante possono coesistere due `#elab-doc-host` (quello
   della console e quello del workspace): oggi non nuoce perché il workspace in
   modalità `source` non lo disegna, ma chi tocca quel percorso lo sappia.
2. **Due meccanismi per la stessa topbar.** INSEGNA porta dentro `#header-utils`
   (barra unica), ELABORA ricostruisce le briciole sul posto. A schermo il risultato è
   lo stesso, ma sono due strade: se un giorno la barra cambia, vanno cambiate
   entrambe. Da decidere se unificare — e in quale direzione (vedi trappola 1: la via
   «sposta il nodo» è quella che si è già rotta).
3. **Lo stato dei gruppi chiusi vive nel modulo, non fra le sessioni**: riaprendo
   ELABORA i gruppi tornano tutti aperti. Da decidere con Giacomo se ricordarlo
   (e se sì, per mappa o globale).

Altre cose da rifinire, minori: la voce del **Foglio dei nodi** mostra il nome della
mappa (non «Foglio dei nodi») — è voluto, ma il gruppo si chiama già così; e le
**sintesi di altre mappe** restano in elenco, in fondo, con la mappa scritta nella
seconda riga (stessa scelta dell'editor: toglierle darebbe un elenco vuoto senza
spiegazione).

### File toccati (da committare insieme)
`public/js/mappai-elabora-console.js` (nuovo) · `public/js/mappai-elabora.js`
(dirottamento) · `public/js/mappai-modal-core.js` + `public/js/mappai-modal.js` (gruppi
richiudibili col contatore) · `public/css/mappai-modal-tokens.css` (`.mm-nav__g--tog`,
`.mm-nav__gn`, `.mm-nav__gc`) · `public/css/mappai-console-manifesto.css` (la stessa
riga nella veste — ⚠️ senza, una regola più specifica della veste vinceva e il chevron
finiva su una riga a sé col contatore incollato al titolo: «FONTE1»; più la tela
full-bleed per `#elab-doc-host`) · `public/index.html` (script + cache-buster
`?v=topbar4`) · `public/traduzioni/en_translations.js` (chiavi `ec_*`).

## ✅ 8/8 — TOPBAR + INSEGNA a bento + CREA centrato → **COMMITTATI SU MAIN**
Tre commit su `main` (prima ne era completamente privo: era rimasto a `2421b7d`):
- `0ac1d46` banco «officina delle console» + INSEGNA (D1) a bento
- `632bdeb` veste manifesto + motore modali + bento + console
- `c885d2b` **topbar unificata, INSEGNA a bento, CREA centrato** ← il lavoro di oggi

Suite intera sul ramo: **986 pass / 0 fail / 2 skip**. Nessun riferimento pendente
(controllati tutti gli `src`/`href` di `index.html` contro i file presenti).
⚠️ **Niente è stato pubblicato**: `origin/main` non è aggiornato, il push non è stato
chiesto.

### Che cosa è entrato oggi
**TOPBAR — le tre sezioni ora coincidono PER COSTRUZIONE, non per taratura**
- Altezza in un token unico **`--mn-topbar-h`** (76 → **65px**, meno un settimo su
  richiesta di Giacomo): governa la banda della landing (`#landing-view::before`) E la
  testata delle console. Erano due numeri uguali scritti a mano in fogli diversi.
  `--mnc-testata` ora deriva dal token (era **78px** hardcoded: con la barra a 65 la
  console restava alta 78).
- **Centratura**: la barra si occupa tutta (`top:0` + altezza = token) e centra
  `align-items`. ⚠️ Via i due rapporti **22/76** (landing) e **11/76** (console),
  tarati a mano l'uno indipendentemente dall'altro: **coincidevano solo a 76px**.
  Misurato prima del fix: landing **+7,8px** sotto il centro, console **+4,2px** →
  3,6px di scarto fra loro, e nessuna delle due centrata.
- **Filetto unico**: la testata portava un `border-bottom` **e** `.mm-body--console` un
  `border-top` sullo stesso confine (fratelli senza spazio in mezzo), per giunta di
  colori diversi (`#ebebeb` contro `#e2e8f0`) → in INSEGNA la linea sembrava più
  spessa. Ora una sola, dalla testata. ⚠️ **`--mnc-hairline` era referenziata e MAI
  dichiarata** in nessun foglio: valeva sempre il ripiego. Ora è un token vero.
- ⚠️ Dettaglio principiato, non una taratura: il filetto sta DENTRO il riquadro
  (border-box) e si mangia 1px in fondo → la testata restituisce **esattamente 1px**
  di `padding-top`. Con quello, le tre sezioni misurano **pallino top 11 · centro 32,5
  = centro barra · scarto 0**, e il filetto è `1px #ebebeb` identico ovunque.

**INSEGNA — area a bento** (vista «mappa scelta», era il PASSO 2 rimasto aperto)
- Motore: il campo `bento` sopravvive a `normalizzaSchema` (un campo sconosciuto
  veniva scartato); render dell'area `.mn-bento-area` con voci `azione` e `materiali`;
  le voci `azione` entrano nella raccolta del dispatch (altrimenti il clic non
  concludeva).
- App: riga di **4 comandi** (Mappa · Elabora · QR · Cartella) + **box materiali a due
  colonne**; «Elabora» compare solo sulle MindMap (come nel ramo storico). QR dalla
  riga comandi apre il **picker del materiale** (`_consShareMat` estratta da `_consQr`:
  lì un materiale «corrente» non c'è).
- Tabelle della console **collassate di default** (`_consChiuse`, filtra lo schema al
  momento dell'apertura/ridisegno → vale per TUTTE le viste, non solo i materiali).
- Tolto il testo «Da dove si comincia…» in modalità bento.

**CREA — centratura verticale, «opzione 3»**
- Si centra il **GRUPPO VISIBILE** — dal bordo alto di `#mn-bento` al bordo basso
  dell'ultimo pezzo visibile — non il solo bento: sotto restano i tre avvii
  (`#landing-quick-actions`, **+80px**: 14 di passo + 66 di bottone), visibili in
  ENTRAMBE le viste. Centrando il solo bento, il gruppo che si vede finiva più in
  basso del centro (era il sospetto di Giacomo, confermato dai numeri).
- ⚠️ **Nessuna cache dell'altezza di riferimento**: si riempiva SOLO passando dalla
  vista ridotta (spenta di default, e «Home» ricarica la pagina azzerandola) → nella
  maggior parte delle sessioni il blocco si ricentrava **su sé stesso** e il bordo si
  spostava mentre si lavorava. Ora la ridotta si misura **su richiesta**: si applica la
  sua classe e si legge nello stesso giro (il ridisegno avviene a fine giro, quando la
  classe è già tolta → nessun lampeggio).
- La vista estesa parte dallo stesso bordo e cresce verso il basso; sul 13" il gruppo
  non ci sta e si àncora sotto la topbar (là centrare è impossibile).
- Il `76` scritto nel JS è sparito: `margineCrea()` **legge il token** `--mn-topbar-h`.

### ⚠️ Trappole nuove trovate oggi (valgono per il futuro)
1. **Cache-buster mancanti = fix che non arrivano mai.** Per più giri Giacomo ha
   continuato a vedere il comportamento vecchio: `index.html` caricava CSS e JS
   **senza `?v=`**, e il renderer li serviva dalla cache. Ora `mappai-stile-manifesto.css`,
   `mappai-console-manifesto.css` e `mappai-vista-ridotta.js` hanno il marcatore
   (`?v=topbar2`). **Chi tocca uno di quei file lo bumpi**, o la prova non prova nulla.
2. **Il ResizeObserver non notifica a finestra non in primo piano** (stessa trappola
   del rAF, già nota). Un meccanismo che dipende solo da lui resta fermo proprio nello
   stato in cui non lo si può verificare → servono reti deterministiche
   (`300/800/1500/2500ms` + `load` + `fonts.ready`).
3. **Misurare al boot misura una schermata che non esiste ancora**: `avvio()` di
   vista-ridotta gira a `DOMContentLoaded`, ma il bento si monta DOPO (i `setTimeout`
   di costruisci-manifesto). Da lì nasceva un margine calcolato su un'altezza troppo
   corta, che nessuno correggeva più (e che finiva pure in `localStorage`).
4. **`agganciaSetMode()` avvolge la funzione sbagliata**: `window.setMode` è il
   selettore **MindMap/KG** (`mappai-ui-canvas.js`), non `MappAITeach.setMode` che
   accende `#build-content`. Per intercettare l'ingresso in una sezione si osserva
   l'**attributo** `class` del contenitore, non si avvolge una funzione omonima.
5. **La landing può essere nascosta pur restando in modalità build**: aprendo una mappa
   `#landing-view` va a `display:none` senza toccare la modalità → ogni misura vale 0.
   Serve una guardia, o il valore sbagliato sopravvive al rientro (che **non sempre**
   ricarica la pagina: `mappai-elabora.js` commuta il display senza `location.reload()`).

## 🧭 STATO DEI RAMI (8/8) — leggere PRIMA di riprendere
| ramo | contiene | pubblicato |
|---|---|---|
| **`main`** | console-bento · manifesto · topbar+bento (i tre commit sopra) | ❌ locale |
| **`feature/vista-studio`** | gli stessi tre lavori **in commit diversi** (`77130f1`, `1ec1889`, `5bd4c52`) **+ 2 commit di vista-studio** | ❌ locale |

⚠️ **I due rami sono DIVERGENTI (3 contro 5).** Su main i tre lavori sono arrivati per
cherry-pick, quindi hanno SHA diversi dagli originali che restano su feature: un merge
diretto proverebbe a riapplicarli e darebbe conflitti.

**Il filone PARALLELO fermo** — `feature/vista-studio` porta due commit che su main NON
ci sono e che nessuno ha ripreso:
- `8d1f7ae` 7 motori di layout deterministici nel ciclo LAYOUT
- `db443fe` focus a tutta area, scheda del nodo vera, PDF fedele, etichette leggibili

Erano dichiarati **«da testare in Electron»** e non lo sono mai stati. Oggi sono stati
lasciati fuori di proposito («per intanto solo stabili», Giacomo).
⚠️ **Un rebase di `feature/vista-studio` su `main` è stato PROVATO e ABORTITO**: il
primo commit vista-studio entra in conflitto con la veste manifesto (toccano gli stessi
file). Riconciliare i due filoni è un lavoro a sé, non una pulizia — va fatto con
Giacomo, decidendo cosa vince dove.

**Altri lavori non committati nel working tree** (nessuno riguarda l'app):
stream **misuratore** (`MappAI - misuratore/**`, molti file nuovi e modificati),
`specs/013-misuratore/tasks.md`, `.claude/launch.json`, `Inkscape/`, `MappAI_logo.svg`.

## ✅ 7/8 — TOPBAR UNIFICATA + tutti i fix grafici (verificato in Electron via CDP)
Sessione lunga di rifinitura della topbar del cablaggio bento. Tutto dietro il flag
`mappai_console_bento_app`; con flag OFF l'app è identica a prima. Tests console-bento
**16/0**. Ogni misura presa nell'app VERA via CDP (porta 9222), non a occhio.

**Bug 1 — topbar di INSEGNA disallineata rispetto a CREA/ELABORA.** Il pallino della
console stava a (20,17), la landing a (28,22) → 8px a sx, 5px in alto. Causa: la
testata riceveva `padding-left:20 !important` (da `mappai-stile-manifesto.css`, era il
pallino della landing in modalità chip) e il gruppo era centrato in una testata di
78px. Fix in `mappai-console-manifesto.css` (`html.manifesto.mn-bento-app .mm-box--piena.mm-box--console > .mm-head`):
`padding-left:28 !important` + `padding-top:11` (poi la testata è passata a 76px, vedi
sotto) + `height:76 !important` + `border-bottom-color:#ebebeb`. Pallino e briciole a
(28,22) come la landing (Δ≤0,5px sub-pixel).

**Bug 2 — da INSEGNA, scegliendo «Crea»/«Elabora» si restava bloccati in INSEGNA.**
`onCosa` faceva `setMode(m)` ma non chiudeva l'overlay a schermo pieno. Fix in
`mappai-landing-teach.js` (`montaCascata` → `onCosa`): dopo `setMode(m)` clicca la
`.mm-close` (`[data-azione="__chiudi"]`, nascosta) → `chiudi(null)` → il `.then` di
`open()` atterra sulla landing già portata su Crea/Elabora.

**Bug 3 — UNA SOLA toolbar per tutte le sezioni.** CREA/ELABORA usano già lo STESSO
`#header-utils`; INSEGNA (console a schermo pieno) ne disegnava una SUA → deriva. Ora
`#header-utils` viene RE-PARENTATO dentro la testata della console e rimesso alla
chiusura. In `mappai-landing-teach.js`: `_huEmbed(box)` (sposta hu nel `.mm-head`,
classi `mn-head-hu` sulla testata + `hu-in-console` su hu; tiene `_huNode` come
riferimento DIRETTO perché alla chiusura il velo — con hu dentro — viene rimosso e
`getElementById` non lo troverebbe più) e `_huRestore()` (rimette hu nella landing e
dispatcha `mappai-active-class-changed` per far ricostruire la cascata landing). CSS:
`html.mn-bento-app #header-utils.hu-in-console{position:static}` + nasconde
`.mm-head.mn-head-hu > .mm-head__ico,.mm-head__testi`.

**Chip via + parità font/spaziatura briciole.** ⚠️ Trappola: `montaPercorso(node,...)`
va chiamata con `node = il BOX` (marca `mn-percorso` → la veste non rimette il chip; e
toglie il chip esistente), `hu` come **terzo arg `testiEl`** (dove vanno le briciole).
Le regole `.mm-box--console .mn-briciole` rendevano le briciole NERE (opacity 1) e con
gap diverso → neutralizzate per `.mn-head-hu` (opacity .55, inline-block, gap 0) =
identiche a CREA/ELABORA (misurato: match esatto).

**Briciole PERSISTENTI + PROGRESSIVE** (`specContesto` in `mappai-console-bento.js`,
riscritta STATE-DRIVEN). Ogni livello scelto mostra il VALORE (non il prompt) e resta;
il successivo appare solo dopo. Stato derivato dai veri store (sezione · classe/allievo
· materia) + flag sticky `mappai_bento_achi` per «A chi?» (il caso «Generico» non lascia
traccia). Persiste landing↔console e al cambio «Cosa». Cambiare il destinatario azzera
la materia (onGenerico/onClasse/onAllievo fanno `setActiveDiscipline('')`). ⚠️
`_sezioneAttiva()` ora legge la sezione della CONSOLE dal velo (`manSezione`/
`manSezionePendente`), non `readMode()` (che dentro INSEGNA torna 'build' = la landing
sotto) → «Cosa» mostra «Insegna».

**Menu drop-down.** Voci «Cosa» in Title-case (Crea/Elabora/Insegna, non UPPERCASE).
«A chi?»: tolte le intestazioni «Classi»/«Allievi» e le righe verticali di separazione
(`.mn-bric-col + .mn-bric-col` senza border-left). ▾ triangolino TOLTO da tutte le
briciole (`montaPercorso` non emette più `.mn-briciole__car`). Il menu si posiziona
sotto la briciola: clamp orizzontale ora sul VIEWPORT, non sulla larghezza di `hu`
(stretto → prima lo buttava a x=8).

**Corpi + colore briciole.** «Cosa» (i=0) alla dimensione piena `--mn-tit-fs` (30px) e
SEMPRE piena opacità (#404040 = rgb 64,64,64, `:first-child{opacity:1}` su landing e
`.mn-head-hu`). Tutti gli altri livelli a un corpo FISSO = 60% (18px), non più
decrescente 0,9^i (`montaPercorso`: `i===0 ? var(--mn-tit-fs) : calc(...*0.6)`).

**Hairline.** Testata console → **#ebebeb, 1px, testata 76px** = identica alla banda
`#landing-view::before` (76px · 1px #ebebeb border-box, y=75-76). VERIFICATA identica a
CREA/ELABORA in tre modi (computed style + due screenshot pixel). Aggiunta anche alla
**prima pagina vuota** (tolto `manifesto-vuota #landing-view::before{border-bottom-color:transparent}`).
⚠️ Se Giacomo la vede ancora «diversa» = la sua app carica CSS STALE → **quit totale
(Cmd+Q) + rilancio**, non un semplice reload.

**Prima pagina vuota (landing d'avvio).** (a) linguetta viola insegnai.ch fissata a
**40px dalla base del cassetto** (`#insegnai-drawer{align-items:flex-end}` +
`#insegnai-drawer-tab{align-self:flex-end !important; margin-bottom:40px}` — ⚠️ la
linguetta ha `align-self:center` da Tailwind, va forzato). (b) logo MappAI **sempre al
60% dell'altezza dal fondo** (= centro a 40% dall'alto): `manifesto-vuota
#landing-hero-row{margin-top:calc(40vh - 99px)}` (la vecchia `margin-top:22vh` sulla
glass-card era sovrascritta a 0). (c) drop-down «Cosa» allineato sotto la briciola
(stesso fix clamp viewport).

**Bug 4 (7/8, dopo) — topbar rotta uscendo da una mappa → console INSEGNA riaperta
→ Crea/Elabora.** Solo in questo flusso: la barra finiva a (52,46) invece di (28,22),
sbiadita. Causa: la console si RIAPRE dal segnalibro (`mappai_teach_console_back`) in
`init()` PRIMA che `sganciaHeader` (stile-manifesto) abbia spostato `#header-utils`
sotto `#landing-view`. Così `_huEmbed` catturava `_huHome` = il posto di markup (dentro
`.glass-card`, `position:relative`) → al ripristino l'`absolute top:22 left:28` cadeva
rispetto alla glass-card, non alla finestra. Fix in `_huEmbed`: ancora hu a
`#landing-view` PRIMA di ricordare la casa (idempotente). Verificato: (28,22) in tutti i
flussi (tab casuali, e riapertura da segnalibro → Crea/Elabora).

**Maniglia della sidebar** (da `Inkscape/maniglia.svg`, `mappai-console-manifesto.css`).
Forma: quadrato con SOLO l'angolo **basso-destra** arrotondato (`border-radius:0 0 8px 0`).
Icona: `panel-right-close` viola (divisorio a DESTRA, freccia «›»); l'icona dell'app è
`panel-left-close` («‹») → RUOTATA 180° nello stato APERTO (`--mnc-man-rot:180deg`,
`--mnc-man-rot-chiusa:0deg`) per ottenere la pagina 1 del disegno. Box di sfondo
**BIANCO** (`--mnc-man-bg:#fff`, era #f1f4f8) — richiesta di Giacomo: sul bianco della
colonna resta solo l'icona.

## 🔧 DA FARE (in ordine) — aggiornato 9/8 (dopo il commit `f2a86f6`)
0. **IL TEMA DEI SALVATAGGI E DEI NOMI** — è il compito concordato per la prossima chat,
   dopo alcuni fix di UI. Sei domande e la ricognizione: vedi «🎯 PROSSIMA CHAT».
1. **PUSH**: `origin/main` è indietro di **19 commit**. Lo fa Giacomo — da qui le
   credenziali github non ci sono più (vedi in cima).
2. **Provare il PDF nella tela su una mappa APPENA GENERATA**, restando nella stessa
   sessione: è l'unico percorso non ancora esercitato (là la fonte ha l'oggetto File vero,
   non il read-back dal vault).
3. **Provare la VISTA STUDIO su una mappa vera con lo zoom/l'export PDF su disco**: il ciclo
   e i 7 motori girano in Electron (misurati), ma il PDF scritto su disco e la persistenza
   del profilo alla riapertura del progetto non sono stati verificati.
4. **Decidere della voce «Testo» sotto FONTE** quando la mappa non ha fonti: oggi c'è sempre
   (è l'unico posto da cui incollare una fonte prima di generare) — se dà fastidio, una riga.
5. **SEZIONE TOPBAR nell'officina-console** (richiesta del 7/8, iniziata): il banco deve
   SPECIFICARE la topbar — livelli, corpi (100% / 60%), colori, separatore, filetto,
   maniglia. ⚠️ I numeri sono cambiati: barra **65px** (`--mn-topbar-h`), filetto
   `1px #ebebeb` (`--mnc-hairline`). E ora ci sono **quattro** livelli: il progetto è il
   quarto, in corsivo anche da cliccabile (`qui: true`).
6. **Tutte le superfici nell'officina bento**: il banco mostri anche il percorso della topbar
   e la colonna di ELABORA, non solo F1/F2/D1.
7. **Cancellare `feature/vista-studio`** quando ci si fida di main: i suoi due commit sono su
   main via cherry-pick, il resto è una copia vecchia dei commit console. Tenerlo in giro
   invita a un merge che riporterebbe indietro `modal.js` & co.
8. **Debito dichiarato, non urgente**: i vault salvati prima del 9/8 hanno il testo della
   fonte solo dopo la prima apertura di ELABORA (auto-riparazione); e `MappAIStudyDocs`
   (archivio in localStorage) resta una seconda fonte di verità accanto al disco — oggi
   convivono nello stesso elenco, ma è il posto dove nascono i doppioni.

**FATTO**: passo 2 (area a bento) l'8/8 · ELABORA a console l'8/8 sera · i tre nodi della
colonna l'8/8 notte · le fonti, il canale del disco, i documenti dal disco e la cascata delle
briciole il 9/8.

## 🐛 BUGS DA INDAGARE (6/8) — RISOLTI il 7/8 (vedi sopra), lasciati per storia

## 🔵 TOPBAR — ridisegno in corso (6/8, dopo commit 77130f1)
Richiesta di Giacomo: togliere il chip e usare le briciole come percorso interattivo;
ogni livello un menu a tendina (rettangolare, fondo bianco, item resi alla dimensione
di QUEL livello di briciola). Cascata: **Cosa** (CREA/ELABORA/INSEGNA) › **A chi?**
(Generico · classi · allievi «Nome Cognome Classe») › **Materia** (materie della
classe/allievo; se Generico = materie del profilo + «Nuova materia» al volo). Riuso: il
filtro del CHIP (`chipContesto` in mappai-modal.js) al cablaggio; nel banco si mocka. Unica
cosa NUOVA = lo stile della tendina.
- **FATTO (passo 1)**: **rail delle 3 forme TOLTO** (i pallini △⬡▢) + primo livello del
  percorso = menu **«Cosa»** (CREA/ELABORA/INSEGNA, l'attivo marcato). Resta solo il
  pallino della testata (Cabina). Tutto in `officina-console.js` (`_cosaMenu`/`_toggleCosa`,
  rail rimosso) + `mappai-console-manifesto.css` (`--mnc-rail` 82→0; `.mn-bric-menu`
  rettangolare bianco radius 4, item al font del 1° livello = `--mn-tit-fs` 30px).
  ⚠️ La tendina è appesa al `.mm-box--console`, NON a `.mn-briciole`: la testata la
  ritaglia e il corpo (`position:relative`) la copre — dal box galleggia sopra (verificato
  `elementFromPoint` = item «CREA»). Posizione = somma degli offset lungo la catena fino al
  box. Verificato: rail 0, body padding 0, «Cosa▾» 30px opacità 1, menu bianco/rettangolare
  con CREA·ELABORA·INSEGNA(attivo) a 30px, on-top, diagnosi pulita, test 16/0, 0 errori.
  «Prima» (con rail) documentato in questa sessione + nel codice a commit 77130f1.
- **FATTO (passo 2)**: cascata completa + **chip TOLTO**. Il percorso è ora
  **Cosa▾ › A chi?▾ › Materia▾ › [mappa]**, ognuno una tendina (`_ruoloDi(b.id)`:
  sezione→cosa · contesto→achi · materia→materia; l'ultima briciola resta statica).
  **A chi?** = tendina a **3 colonne** (`mn-bric-menu--cols`): Generico · CLASSI · ALLIEVI
  (allievi «Nome Cognome — Classe»). **Materia** = materie della classe/allievo, oppure
  (se A chi = Generico) materie del profilo + **«+ Nuova materia»** (`mn-bric-menu__nuovo`).
  Item di ogni menu resi alla dimensione del SUO livello (30 / 27 / 24,3px). Cascata demo
  reale: `_selAChi` governa le materie (verificato: Generico → +Nuova materia; 1ªA → materie
  di classe, niente Nuova). Dati **MOCK** in `officina-console.js` (`_MOCK`). Chip rimosso
  dall'anteprima (resta il pallino → Cabina). Verificato: 0 chip, 3 tendine coi ruoli, menu
  on-top, 16/0, 0 errori console.
- **DA FARE (cablaggio, §3.6)**: nell'app le tendine leggono i dati VERI — modalità da
  `MappAITeach.setMode`, «A chi» da `MappAIClasses`/`allProfiles`, «Materia» da
  `disciplineChoices`/profilo, «Nuova materia» crea il label e procede alla generazione. Il
  filtro delle mappe (sidebar) segue la scelta, riusando la logica del chip
  (`contestoDelleMappe`) — è il momento in cui il percorso interattivo diventa il vero
  contesto di lavoro che oggi porta il chip.
- **Poi**, richieste #2 e #3 di Giacomo (col cablaggio / indipendente): anteprima PDF/sintesi
  spostata sulla toolbar; ritocchi grafici all'HTML della Sintesi (`mappai-branch-synthesis.js`).

## 🟢 CABLAGGIO NELL'APP (6/8) — OPT-IN, default OFF · ordine: topbar → area → rail
Flag **`mappai_console_bento_app`** (default OFF = console INSEGNA IDENTICA a oggi; `'1'` =
veste nuova). Va provata **in Electron** accendendo il flag; qui verificata solo la struttura
nel browser statico (licensing tolto lato-DOM, dati mock in localStorage/appState).
- **PASSO 1 — TOPBAR = cascata, chip via (FATTO, verificato in browser)**:
  - **Motore condiviso**: `MappAIConsoleBento.montaPercorso(node, spec)` in
    `mappai-console-bento.js` — costruisce il percorso «Cosa › A chi? › Materia › [mappa]» da
    uno `spec` dichiarativo (dati + callback); marca il box `mn-percorso` e toglie il chip.
  - **App**: in `mappai-landing-teach.js`, `openConsoleInsegna` → `montaCascata(node)` (dentro
    la funzione, chiuso su `_cons`/`rifai`), chiamata da `rifai()` e `suApertura`; `_consSchema`
    **omette `contesto`** (niente chip) quando il flag è on. Dati VERI riusati: `MappAIClasses.
    list/setActive/setActiveStudent/disciplineChoices/setActiveDiscipline`, allievi da
    `appState.allProfiles`, materie del profilo da `MappAITeacherProfile.disciplineList`. Il
    picking filtra le mappe come `__ctx-classe` (stessa logica del chip).
  - **⚠️ Bug 1 (box giusto)**: il motore `ridisegna` crea un box NUOVO a ogni giro →
    `montaCascata` deve ricevere QUEL box (`ridisegna` lo restituisce), non `querySelector`
    (prendeva il primo, sbagliato con console impilate).
  - **⚠️ Bug 2 (la veste rimetteva chip+briciole)**: `mappai-console-manifesto.js` vestte TUTTE
    le console con un `MutationObserver` su `body` — riaggiungeva il chip (`chipNodo`) e
    ricostruiva le sue briciole STATICHE dal titolo, cancellando la cascata dopo il montaggio.
    Fix: `montaChip`/`montaBriciole` **saltano** i box `mn-percorso` (la cascata è del cablaggio).
    Converge perché `montaCascata` è sincrona nel `rifai`, la veste è async → `mn-percorso` c'è
    sempre prima che la veste guardi il box. Il **pallino** (Cabina) resta.
  - Verificato (browser, dati mock): chip 0 · cascata Cosa/A chi/Materia · A chi = 3 colonne
    (Generico · classi reali · allievi «Nome — grado») · Materia = materie di classe, o del
    profilo + «+ Nuova materia» se Generico · pick 2ªB → attiva 2ªB + Materia→Italiano/Geografia
    + **cascata resta** (stabile a t0/t1/t2) · flag OFF → chip torna, niente cascata,
    `mn-percorso` assente · **test 16/0**, 0 errori console.
  - **⚠️ DA PROVARE IN ELECTRON**: accendere il flag, entrare in INSEGNA con classi/allievi VERI
    su disco, pick classe/allievo/materia → filtro mappe reale, «Nuova materia», e che le ALTRE
    console (Cabina/ELABORA) NON siano toccate (il guard è scoped a `mn-percorso`, solo INSEGNA
    lo mette — basso rischio, ma da confermare).
- **PASSO 1-bis — TOPBAR OVUNQUE + RAIL VIA (FATTO, provato in ELECTRON)**: decisione di
  Giacomo dagli screenshot — la cascata dev'essere in TUTTE le sezioni, non solo INSEGNA, e
  il rail va tolto («Cosa» lo sostituisce). Fatto:
  - **`montaPercorso` generalizzato**: accetta un `testiEl` (contenitore delle briciole) →
    funziona anche sulla LANDING (l'header non ha `.mm-head__testi`). **`specContesto(cb)`**
    nuovo in `mappai-console-bento.js` = fonte UNICA dei livelli A chi?/Materia (e Cosa) dai
    veri store, con le callback del chiamante.
  - **Landing** (`mappai-stile-manifesto.js`): `montaCascataLanding()` monta il percorso su
    `#header-utils` quando il flag è on; `Cosa` = `vaiA(modo)` (sostituisce il rail);
    A chi?/Materia = setActive/… + evento. Hook in `sincronizza` (con firma anti-rebuild);
    `montaRail` **salta** col flag; classe `mn-bento-app` su `<html>`.
    ⚠️ Nessun loop: l'osservatore della veste guarda solo `class` dei 3 contenitori di
    modalità, non l'header.
  - **CSS** (`mappai-console-manifesto.css`, `html.mn-bento-app`): `--mnc-rail:0` (via lo
    spazio del rail nelle consoli), `#manifesto-rail`/`#manifesto-home`/`#mn-sezione`/chip
    `display:none`, `#header-utils` position:relative.
  - **Provato in Electron** (CDP, dati VERI di Giacomo): landing CREA → cascata, rail via
    (0px), chip via, titolo nascosto; **Cosa CREA→ELABORA** cambia sezione (elabora-content
    visibile), cascata resta; INSEGNA via Cosa → console senza rail (bodyPadLeft 0), A chi =
    classi vere (1A·1B·2A·4R\*·3B·4A). Test **16/0**.
  - ⚠️ **Aperto**: la reattività fine della landing al cambio classe dalla cascata (es.
    ELABORA che ri-filtra i «Progetti esistenti» dal vivo) usa l'evento
    `mappai-active-class-changed`, che in landing-teach rinfresca **solo in teach** — da
    verificare/estendere per elabora/build. Cosa in INSEGNA-console: onCosa fa `setMode` ma
    non chiude la console (il `vaiA` con la × vive solo sulla landing) — da rifinire.
- **PASSO 1-ter — BRICIOLE PROGRESSIVE + ALLINEAMENTO A SINISTRA (FATTO, Electron)**: dai
  4 screenshot di Giacomo (avvio disallineato · topbar CREA/ELABORA sregolata · briciole che
  non corrispondono). Due richieste:
  1. **Le briciole si svelano UNA ALLA VOLTA**: all'avvio (mode='') solo **Cosa**; scelta la
     sezione appare **A chi?**; scelto il destinatario appare **Materia**. Implementato:
     `specContesto(cb, livello)` con `livello` = `'cosa'|'achi'|'materia'` (costruisce fin lì).
     Il chiamante calcola il livello:
     - **Landing** (`montaCascataLanding`): `!modo() ? 'cosa' : (_landAchi ? 'materia' : 'achi')`;
       `_landAchi` (flag) si azzera al cambio sezione (traccia `_lastMode`), si accende su
       pick di A chi (Generico/classe/allievo). `onCosa` azzera `_landAchi` + `vaiA`.
     - **Console** (`montaCascata` in landing-teach): sezione sempre teach → `_consAchi ?
       'materia' : 'achi'`; `_consAchi` (var in openConsoleInsegna) si accende su pick A chi.
     ⚠️ Le label restano i PROMPT («Cosa», «A chi?», «Materia»), non i valori scelti — è il
     disegno di Giacomo (i valori si vedono aprendo la tendina, marcati `is-on`).
  2. **Barra in alto a SINISTRA** come la console (era in alto a destra: la landing è una FLEX
     ROW centrata e `#header-utils` è il suo ultimo figlio). Fix CSS `html.mn-bento-app`:
     `#header-utils` **position:absolute; top:22; left:28; z-index:60** (staccato dal flusso,
     ancorato a `#landing-view` relative); pallino `#btn-cabina` **order:0** e `.mn-briciole`
     **order:1** (la landing dava `order:1` al pallino → finiva a destra della cascata).
  - **Provato in Electron** (CDP): landing avvio → `['Cosa']`; CREA → `['Cosa','A chi?']`; pick
    classe 1A → `['Cosa','A chi?','Materia']`; console idem; header a (28,22), pallino prima
    della cascata (28 < 81), **0 overlap** col bento (y=140 > header bottom 65). Test **16/0**.

## 🐛 BUGS DA INDAGARE (7/8) — Giacomo ne ha visti, chat piena, non dettagliati
Giacomo: «ci son dei bug ma chat piena». Non li ha elencati: **prima cosa della prossima
sessione = chiederglieli** e riprodurli in Electron col flag on. Piste note / aperti già
identificati (da verificare se sono questi):
- **Reattività landing al cambio contesto dalla cascata**: cambiando classe/materia dalla
  cascata su CREA/ELABORA, la landing NON si ri-filtra dal vivo (es. «Progetti esistenti» di
  ELABORA). Causa: l'evento `mappai-active-class-changed` in `mappai-landing-teach.js:2886`
  rinfresca **solo in `readMode()==='teach'`**. Da estendere a build/elabora.
- **«Cosa» dalla CONSOLE INSEGNA** verso CREA/ELABORA: fa `setMode(m)` ma **non chiude la
  console** (il `vaiA` con la × sta solo in stile-manifesto; la console resta aperta sopra la
  landing cambiata). Da rifinire: onCosa in `montaCascata` dovrebbe uscire dalla console.
- **Doppio-mount / firma**: se una console INSEGNA è impilata e si torna alla landing, la
  cascata potrebbe rimanere; verificare i casi di `consoleInCima()` e la firma `_sigCascata`.
- **`_landAchi` vs contesto persistente**: entrando in CREA con una classe già attiva, «A chi?»
  parte come prompt (Materia nascosta) finché non tocchi A chi — è VOLUTO (wizard), ma da
  confermare con Giacomo che sia il comportamento che vuole anche col contesto già scelto.

## 📌 STATO FILE — ⚠️ SUPERATO l'8/8: ora è tutto COMMITTATO su `main`
> Questa sezione descriveva lo stato del 6-7/8, quando il cablaggio era ancora nel
> working tree. Vale ora solo come elenco di DOVE vive il cablaggio; per lo stato dei
> rami vedi «🧭 STATO DEI RAMI» in cima. Il flag resta il kill-switch:
> `localStorage.setItem('mappai_console_bento_app','0')` → app com'era.

### (storico) STATO FILE al 7/8 — allora tutto uncommitted, dietro il flag
Cablaggio topbar (passi 1/1-bis/1-ter) tocca file di PRODUZIONE, tutti gated da
`mappai_console_bento_app` (OFF = app identica a oggi):
`public/js/mappai-console-bento.js` (montaPercorso+testiEl, specContesto+livello, montaPercorso
mn-percorso+strip chip) · `public/js/mappai-landing-teach.js` (`_bentoApp`, `_allieviProfili`,
`_promptNuovaMateria`, `montaCascata`+`_consAchi`, `_consSchema` contesto conditional, rifai/
suApertura) · `public/js/mappai-stile-manifesto.js` (`montaCascataLanding`+`_landAchi`, hook in
sincronizza/avvio/montaRail, classe `mn-bento-app`, listener active-class-changed) ·
`public/js/mappai-console-manifesto.js` (montaChip/montaBriciole saltano `mn-percorso`) ·
`public/css/mappai-console-manifesto.css` (blocco `html.mn-bento-app`). Il flag è **ACCESO** in
userData di Giacomo (va provato) — per spegnerlo: `localStorage.setItem('mappai_console_bento_app','0')`.

- **PASSO 2 — area a bento** (4 bottoni + box materiali): ✅ **FATTO l'8/8** (vedi in cima).
- **Procedura Electron (CDP)** — il banco `scratchpad/cdp.js` è SESSION-TEMP (sparisce). Da
  ricreare: un file Node che fa `GET http://127.0.0.1:9222/json`, sceglie il target `page` con
  url `index.html`, apre la `webSocketDebuggerUrl` con `ws` (in node_modules), manda
  `Runtime.enable` poi `Runtime.evaluate {expression: <file JS>, awaitPromise:true,
  returnByValue:true}` e stampa `result.result.value`. Uso: `NODE_PATH=<repo>/node_modules node
  cdp.js expr.js`. Lanciare l'app: `nohup ./node_modules/.bin/electron .
  --remote-debugging-port=9222 </dev/null & disown` (⚠️ viene reaped dopo poco: rilancia+probe
  nella STESSA Bash, o riavvia se `ECONNREFUSED`). Il flag persiste → boot fresco = veste nuova
  già montata, nessun reload necessario (il flag si legge all'apertura di console/landing).

## ✅ §2 FATTO (6/8/26) — D1 (INSEGNA) ridisegnato a bento
Il compito della §2 è chiuso e verificato nell'officina (0 errori console, diagnosi
«nessun rilievo», suite `console-bento`+`bento-composizione` **85/0**). **Solo BANCO**:
nessun cablaggio nell'app (resta la §3.6 = FASE SUCCESSIVA).
- **Decisioni prese con Giacomo**: (1) sidebar = **solo mappe** (la sezione
  Materiali/Lavagna/LIVE/Stampabili NON entra qui); (2) riga 1 = **4 bottoni**
  `Mappa · Elabora · QR · Cartella`, che **sostituiscono** il banner verde «MAPPA».
- **Nuova forma `materiali`** (`FORME` in `mappai-console-bento.js` + validazione:
  avviso se non è span-pieno). Renderer nel banco = `materialiHtml`/`tabellaMat` in
  `officina-console.js`: griglia **2 colonne** di `.mm-tabg` collassabili, riuso della
  veste del motore (colonne NOME·CLASSE·MATERIA·DATA + cestino, contatore, `is-chiusa`).
  Generi mock = i 7 di `_consTabelleMateriali` (SINTESI · FOGLI · QUIZ MC · QUIZ VF ·
  FLASHCARD · ALTRI · FILE DI LAVORO, **quest'ultimo chiuso** di default, come l'app).
- **`d1-mappa` ricomposto**: `console:'Insegna'`, colonna = 5 mappe mock (MM `git-merge`
  / KG `network`), moduli = [riga 4 bottoni nudo span4 `layout.colonneVoci:4`] + [box
  materiali nudo span4], `aspetto.area = {colonne:4, tetto:1000, padX:70, padY:45}`.
- **CSS** (`mappai-console-manifesto.css`): `.mn-materiali` griglia 2-col + cap
  **340px** per tabella (misurato: righe **57px** — la riga porta il cestino da 34px,
  non 31 — quindi 5 righe = 33+5×57≈318, tetto 340 = 5 intere + accenno della 6ª) +
  `.mm-console__area:has(.mn-materiali){overflow-y:auto}` (il bento alto scorre: le
  tabelle sono in un modulo, non in `s.tabelle`, quindi l'area non riceve `--scorre`).
  **+ mirror del layout voci** `.mn-bento-area .mn-card[data-voci-n]>.mn-card__b`
  (griglia): senza, la riga a 4 bottoni usciva verticale — stessa trappola ID-vs-classe
  dei colori bottoni (era già documentata in §4).
- **VER** `officina-console.js` `3`→**`4`**.
- Verificato dal DOM: sidebar 5 mappe (0 gruppi), riga 4 bottoni orizzontali (stesso
  `top`, 118px l'uno), `.mn-materiali` display grid `441px 441px`, cap: Sintesi(7) e
  Flashcard(6) scorrono, ≤5 no; area scrolls (scrollH 1357 > client 821); 28 cestini
  resi (lucide ok).
- **Aperti/minori** (per Giacomo, nell'officina): il bottone «Mappa» è `primaria` ma nel
  banco non spicca in verde (colore da tarare); «fuori scala: 4» nelle misure = la
  tipografia VERA delle tabelle (th 10 / tabg__t 11 / tabg__n 10.5 / td 12), fuori dai
  tre corpi del bento **di proposito** (è la veste dell'app, non un errore).
- **Rifinitura (6/8, dopo)**: i **4 bottoni** della mappa sono ora **145px** con
  **icona↔testo al passaggio** (stessa veste dei bottoni-azione di CREA). Icone:
  Mappa=`git-merge` (= icona del genere della mappa aperta, MM `git-merge`/KG `network`,
  come in sidebar; mock = MM), Elabora=`hexagon` (= pallino ELABORA del rail), QR=`qr-code`,
  Cartella=`folder`. Mezzi: officina `vocePezzo` 'azione' con `v.icona` → `<button
  class="mn-btn mn-cmd"><i><span>` + title/aria-label; CSS `.mn-cmd` in
  `mappai-console-manifesto.css` copia i parametri di CREA `.mn-card--azione` (icona 64px,
  testo 15/700, dissolvenza `.18s ease .09s`, etichetta assoluta centrata). VER `4`→`5`.
  ⚠️ `font-size` dello span con `!important` (la guardia zoom landing impone
  `.mn-btn{font-size:var(--bn-fs-voce)!important}`=12px → senza important l'etichetta
  resterebbe 12/600). Verificato DOM: 4 bottoni h145, span 15/700, svg 64px, riposo
  icona/hover testo (regole `:hover>svg{opacity:0}`+`:hover>span{opacity:1}`), test 16/0.
- **Prossimo = §3.6 (cablaggio app)**: montare `d1-mappa` nell'app — sidebar da
  `contestoDelleMappe(getAllVaults())` filtrata dal chip, i 4 bottoni + il box materiali
  agganciati alle funzioni di `openConsoleInsegna` (`_diskKind`, `_consApriMateriale`,
  `_consMostra`). NON reinventare: la logica dati c'è già (§2bis). ⚠️ Nell'app il bottone
  «Mappa» prende l'icona DAL GENERE della mappa selezionata (non fisso `git-merge`).

## 0. Come riprendere / come si verifica
- Il banco è `public/dev/officina-console.html` (compone e MISURA le console).
- Servi `public/` con un http server e apri `/dev/officina-console.html`.
  ⚠️ **Cache del pannello browser**: l'html NON ha `?v=`, quindi CSS/JS restano in
  cache. Per bustare, **servi su una PORTA NUOVA** ogni volta (`python3 -m http.server
  88NN` dentro `public/`). Misura sempre dal **DOM** (screenshot spesso in timeout/bianco).
- L'anteprima ha `transform:scale` (auto-zoom): per misure reali dividi per
  `box.getBoundingClientRect().width / 1440`.
- Suite: `npm test` (0 fail è ciò che conta; il totale oscilla per i test del misuratore).

## 1. STATO (dove lo trovi)

### Il sistema «console-bento» — la composizione delle console come DATO
- **Dati**: `public/js/mappai-console-bento.js` → `MappAIConsoleBento`.
  - `AREE` = 3 superfici: **`f1-documenti`** (ELABORA·elenco), **`f2-documento`**
    (ELABORA·editor), **`d1-mappa`** (= schermata finale di INSEGNA, vedi §2).
  - `FORME` = i tipi di pezzo dentro un'area: `azione · scelta · campo · tendina ·
    interruttore · tabella · elenco · esito · tela`. **Aggiungere una forma = una riga
    qui + il renderer che la disegna.**
  - `TOKEN_BASE` (globali: chip, campi, riquadri, colonna, **maniglia**, **sidebar**) →
    `variabiliGlobali()` → variabili CSS su `<html>`/radice anteprima.
  - `ASPETTO_BASE` (per-vista: barra, colonna, area) → `aspettoDi()`/`variabili()` → var
    sul riquadro. `area` ha `padX·padY·passo·colonne·tetto·allinea`.
  - `POPUP['nuovo-doc-chooser']` = schema modale del chooser «Nuovo documento» (6 tipi).
  - Caricato in `index.html` dopo `mappai-modal.js` — **solo DATO, nessuna console
    cablata nell'app** (l'app vera usa ancora `mappai-landing-teach.js`).
- **Renderer motore**: `MappAIModal.render(schema)` in `public/js/mappai-modal.js`
  disegna la cornice console: `.mm-head` (testata) · `.mm-console__side` (colonna nav) ·
  `.mm-console__area` (area) · `.mm-tela` · **`tabelleHtml`/`.mm-tabg`** (tabelle
  collassabili, riga 208) · `tabellaHtml`/`.mm-tab-wrap` (stile tabella). Il glifo della
  maniglia è `icona('panel-right-close')` (riga ~487).
- **Banco**: `public/dev/officina-console.js` (+ `.html`). Legge `CB = MappAIConsoleBento`
  e `B = MappAIBento` (bento di CREA). `anteprima()` chiama `MappAIModal.render` e ci
  AUMENTA: chip (mock «1ªA · Storia»), briciole, **rail** (3 forme), iniezione del bento
  nell'area, clic su «Nuovo documento» → apre il POPUP. `VER='3'` (§4 version-bump).
  `GLOBALI` = i controlli dei token globali; `GRIGLIA` = i controlli per-vista (barra/
  colonna/area, con `padX`/`padY`/`colonne`/`tetto`).
- **CSS**: `public/css/mappai-console-manifesto.css` (chrome console, scoped
  `html.manifesto .mm-box--console`) · `public/css/mappai-modal-tokens.css` (motore).
- **Bento di CREA riusato**: `public/js/mappai-bento-composizione.js`
  (`presentazione`/`stileDi`/`bottoniDi`) + `public/css/mappai-stile-manifesto.css`. La
  console usa le stesse classi `.mn-card`/`.mn-btn` ma nel contenitore **`.mn-bento-area`**
  (NON l'ID `#mn-bento`, che è di CREA).

### Fatto in questa sessione (tutto verificato nell'officina, 0 errori console)
1. **Adottati** i 3 JSON di Giacomo come default del file (F1/F2/D1) via script
   (`scratchpad/gen.js`+`splice.js`: serializza in stile-file, toglie `__firma`, splice
   per id). Margini F1/D1 `padX:70`.
2. **Tela tolta** dall'officina: il bento entra DIRETTAMENTE in `.mm-console__area`
   (trasparente); F2 (editor) reso a filo con la `tela` piena del motore.
3. **«Nuovo documento» in sidebar** (`comandi`) + **pop-up chooser** dei 6 tipi
   (`POPUP['nuovo-doc-chooser']`, cliccabile nel banco).
4. **Briciole**: titolo sezione a `--mn-tit-fs` (30px) decrescente **−10%/step**
   (`calc(var(--mn-tit-fs) * 0.9^i)`), ultimo (nome doc) **italic/400**; centrate col chip.
5. **Sidebar bianca** (`--man-card`→`#fff`); voci nav simmetriche (`width:auto`, prima
   sforavano a destra); bottoni doc-bar inset 14px (= voci nav).
6. **Rail = prima colonna**: 3 forme (△ build · ⬡ elabora · ▢ teach) ROTONDE
   (`border-radius:50%`, come `.man-forma` dell'app), **assoluto nel riquadro**
   `top:96 · left:18 · gap:12`, forma attiva dedotta da `briciole[0].et`
   (`{Crea:build, Elabora:elabora, Insegna:teach}`), si nasconde con la nav.
7. **Controlli officina nuovi** (in GLOBALI): gruppo **«Maniglia della sidebar»**
   (top · x · taglia · raggio · angolo · orientamento glifo mostra/nascondi · colori
   mostra/nascondi) e **«Colonna — margine sopra»**. Token in `TOKEN_BASE.maniglia` +
   `TOKEN_BASE.sidebar`, var in `variabiliGlobali`, CSS che le consuma in console-manifesto.
8. **Maniglia ridisegnata** dal SVG di Giacomo (`Inkscape/maniglia.svg`): glifo
   **`panel-right-close`** (path identici allo SVG), box con **1 angolo** arrotondato
   (default `basso-dx`, controllabile), orientamento glifo **per stato** (mostra 0° /
   nascondi 180°, controllabili), **posizione orizzontale** `x`.
9. **Fix bottoni-modulo console**: mirror in console-manifesto.css →
   `html.manifesto .mn-bento-area .mn-card[data-btn] .mn-btn { background:
   var(--mn-btn-bg, color-mix(currentColor 14%)) !important; ... }`. Prima la regola che
   leggeva `--mn-btn-bg` stava SOLO sotto `#mn-bento` (CREA) → nella console
   (`.mn-bento-area`) `bottoni.bg` era inerte e i bottoni restavano al color-mix 14%.
10. **D1 = schermata INSEGNA**: briciole `Insegna › 1ªA › Scienze › La Fotosintesi`
    (mock), rail 3ª forma (Insegna/▢) attiva. Moduli attuali: **banner verde MAPPA**
    (span 3, `#41e6aa`, = **«apri visualizzazione mappa»**), «Attività QR», «Stampabili»,
    «Jigsaw», «Grafo e vault», «Knowledge Garden». `aspetto.area` = `padX:70, padY:120,
    colonne:3, tetto:600`.

## 2. IL COMPITO — INSEGNA a bento (ridisegno di D1)
Giacomo: la console **«Mappa - tutte le azioni» (= `d1-mappa`) È la schermata finale del
path INSEGNA** (non «Crea», anche se il campo `console` dice «Mappa»). Errore di design
planning precedente. Va rifatta così. **Riferimento visivo**: lo screenshot dell'INSEGNA
reale attuale = `openConsoleInsegna` in `public/js/mappai-landing-teach.js`.

### 2a. Sidebar (colonna nav)
- Mostra la **lista dei PROGETTI (mappe MM e KG)** **filtrati dal chip** (classe/materia).
  Non le categorie d'azione di adesso.
- MM e KG con **icone diverse** (nell'app reale: MM ≈ `git-fork`, KG ≈ un'icona di rete/
  nodi — vedi lo screenshot: «2.1 PROJECT E» e «Introduzione alla Robotica» hanno icone
  diverse dalle altre).
- **Nel banco/officina**: mock = elenco di mappe d'esempio (con le due icone).
- **Nell'app (cablaggio, fase dopo)**: da disco, filtrate dal chip →
  `MappAITeach.contestoDelleMappe(getAllVaults())` + filtro classe/materia (la logica c'è
  già in `openConsoleInsegna`).
- ⚠️ Da decidere: nell'app reale la sidebar ha anche una sezione **MATERIALI** (Lavagna ·
  Attività LIVE · Stampabili). Con questo ridisegno restano in sidebar o migrano altrove?
  (Chiedere a Giacomo.)

### 2b. Console area = BENTO
- **4 colonne**, **tetto larghezza = 1000** → `aspetto.area = { colonne:4, tetto:1000 }`
  (oggi è `colonne:3, tetto:600` — va cambiato).
- **Riga 1**: una riga con **4 bottoni**: **`Mappa` · `Elabora` · `QR` · `Folder`**.
  = un modulo **nudo span 4** con 4 voci `forma:'azione'` (o una riga di comandi). Nell'app
  reale la riga top è Mappa/Finder/Elabora/Studio attivo/Lavagna → qui diventa i 4 nuovi.
- **Riga 2**: un **box span 4** — **NUOVO TIPO DI BOX** che contiene le **tabelle
  collassabili dei materiali**:
  - tabelle interne su **2 colonne**;
  - ogni tabella: anteprima **max 5 documenti**, oltre i 5 → **scroll interno**;
  - **stile/formattazione = le tabelle già usate nell'app** (screenshot: header
    collassabile col nome-genere + contatore; colonne **NOME · CLASSE · MATERIA · DATA** +
    cestino). «Poi modificheremo qualche piccolo dettaglio».
  - **Generi materiali** (dall'INSEGNA reale, `openConsoleInsegna`/`_diskKind`): SINTESI ·
    FOGLI DEI NODI · QUIZ A SCELTA MULTIPLA · QUIZ VERO/FALSO · FLASHCARD · ALTRI
    MATERIALI · FILE DI LAVORO.

### 2c. Il «nuovo tipo di box»
Serve una **`forma` nuova** nel sistema console-bento (es. `materiali` o `tabelle`), che il
renderer disegna come **griglia 2-col di tabelle collassabili**, ognuna cap 5 righe +
scroll. **Riusa il motore che c'è già**:
- `tabelleHtml`/`.mm-tabg` in `mappai-modal.js` (tabelle collassabili, header
  `.mm-tabg__t` col contatore, `is-chiusa`);
- `.mm-tab-wrap`/`.mm-tab` per lo stile tabella (le stesse dell'app).
- Il cap-5: `max-height = 5×altezza-riga + header` con `overflow-y:auto` sul corpo tabella.
- Le 2 colonne: `display:grid; grid-template-columns:1fr 1fr` sul contenitore delle tabelle.
- ⚠️ Alternativa scartabile: un modulo con più voci `forma:'tabella'` disposte a 2 col —
  ma il **collasso + cap-5 + scroll per-tabella** conviene incapsularli in UNA forma
  dedicata, non replicarli a mano.

## 2bis. RIUSARE — È GIÀ IN APP (non riscrivere NIENTE di questo)
⚠️ **Regola di Giacomo**: la console INSEGNA reale (`openConsoleInsegna` in
`public/js/mappai-landing-teach.js`) fa GIÀ tutto — sidebar filtrata, tabelle materiali
cliccabili, anteprima PDF e HTML-sintesi. Il compito è **RIMPAGINARE l'area a bento**,
NON rifare questi pezzi. Ottimizza il presente.

| Serve | Esiste già come | Dove |
|---|---|---|
| Sidebar mappe (MM/KG) filtrate dal chip | `contestoDelleMappe(vaults)` + `matchProjectToVault` + `electronAPI.getAllVaults` | landing-teach.js:2681 · 820 · 212 |
| Generi + tabelle collassabili (colonne NOME·CLASSE·MATERIA·DATA + cestino) | `_consSchema()` costruisce GIÀ i `tabelle` del motore (SINTESI · FOGLI DEI NODI · QUIZ MC · QUIZ VF · FLASHCARD · ALTRI · FILE DI LAVORO); genere da `_diskKind` | landing-teach.js:~1990-2020 · 497 |
| Riga cliccabile → apri doc nella tela | `_consApriMateriale()` + **`_consMostra(html, src)`** = iframe (archivio `MappAIStudyDocs.get(docId)` html/pdf; disco `readVaultFile`→data-URI, mime da estensione) | landing-teach.js:2284-2317 |
| **Anteprima PDF** (tool) | `_consMostra(null, 'data:application/pdf;base64,…')` → viewer PDF del browser nell'iframe | 2312-2315 |
| **Anteprima HTML sintesi** (tool, col lettore TTS) | `_consMostra(htmlSintesi)` → l'HTML porta già il reader (MappAITTS) | 2296 |
| Barra doc: Indietro · Stampa · **QR** · **Finder** | già nella doc-bar/anteprima (= i bottoni «Condividi (QR)» e «Apri nel Finder») | screenshot |
| Tabelle collassabili nel motore | `tabelleHtml`/`.mm-tabg` (header col contatore, `is-chiusa`) | mappai-modal.js:208 |

**Quindi il «nuovo tipo di box» = un contenitore che dispone su 2 COLONNE i `tabelle`
che `_consSchema` GIÀ produce** (cap 5 righe + scroll per tabella). È **CSS + una forma
che ospita tabelle esistenti** — NON una nuova pipeline dati, NON un nuovo modo di aprire
i file. I 4 bottoni riga-1 (Mappa/Elabora/QR/Folder) sono azioni che **esistono già**.

## 3. Passi (ordine consigliato)
1. **Nuova `forma`** in `mappai-console-bento.js` `FORME` (es. `materiali: 'gruppo di
   tabelle collassabili di documenti'`) + eventuale validazione in `valida()`.
2. **Renderer della forma**: nell'officina `vocePezzo()` (public/dev/officina-console.js) e/o
   nel motore se serve — disegna `.mn-materiali` = griglia 2-col di `.mm-tabg`. Ogni
   tabella: `mm-tabg__t` (titolo genere + contatore) + `mm-tab-wrap` (colonne NOME/CLASSE/
   MATERIA/DATA) con `max-height` 5 righe + scroll. Dati mock nel banco.
   - CSS nuovo in `mappai-console-manifesto.css` (scoped `html.manifesto .mn-bento-area
     .mn-materiali`).
3. **Ricomponi `d1-mappa`** (mappai-console-bento.js):
   - `colonna` → lista mappe mock (MM/KG con icone) invece delle categorie d'azione;
   - `moduli` → [modulo nudo span4 con 4 azioni Mappa/Elabora/QR/Folder] + [modulo span4
     con 1 voce `forma:'materiali'`];
   - `aspetto.area` → `{ colonne:4, tetto:1000, padX:70, padY:? }`;
   - `briciole` → già `Insegna › classe › materia › mappa`.
4. **Officina**: la forma nuova compare nei menu forme; verifica render + misure
   (2 colonne, cap 5 righe, scroll, stile tabella).
5. **Version bump** `VER` `'3'→'4'` in officina-console.js (D1 cambia → nuova firma; bump
   per sicurezza, così la localStorage vecchia non maschera i default).
6. **Cablaggio app (FASE SUCCESSIVA, non ora)**: la sidebar legge le mappe da disco
   filtrate dal chip; i 4 bottoni + le tabelle materiali si agganciano alle funzioni reali.
   Riusa la logica di `openConsoleInsegna` (raccolta materiali, `_diskKind`, `VISTE_CLASSE`,
   `contestoDelleMappe`) — NON reinventarla.

## 4. Trappole (viste sul campo, da non ripetere)
- **Cache** del pannello browser → porta nuova ogni volta; misura dal DOM.
- **Version-bump**: `carica()` sceglie stored-vs-file confrontando la **`__firma`**
  (moduli/span/forme). **Margini, briciole, aspetto, stile NON entrano nella firma** →
  se cambi solo quelli, la localStorage vince: bump `VER` per far vincere il file.
- **ID vs classe**: ogni regola CSS di CREA sotto `#mn-bento` NON ricade sulla console
  (`.mn-bento-area`). È stato il bug dei bottoni bianchi (risolto col mirror §1.9). Se una
  cosa «non si applica nella console», controlla se la regola è scritta con `#mn-bento`.
- **Transizioni congelate** a pannello nascosto: `getComputedStyle` serve il frame di
  partenza → per misurare un COLORE, spegni prima `transition`.
- **Scala anteprima**: dividi le misure per `box.width/1440`.

## 5. File
| Ruolo | File |
|---|---|
| Dati console (AREE, FORME, TOKEN, POPUP) | `public/js/mappai-console-bento.js` |
| Renderer motore | `public/js/mappai-modal.js` (+ `mappai-modal-core.js`) |
| Banco/officina | `public/dev/officina-console.js` (+ `.html`) |
| CSS chrome console | `public/css/mappai-console-manifesto.css` |
| CSS motore | `public/css/mappai-modal-tokens.css` |
| Bento CREA (riuso: presentazione/stile/bottoni) | `public/js/mappai-bento-composizione.js`, `public/css/mappai-stile-manifesto.css` |
| INSEGNA reale (riferimento + cablaggio futuro) | `public/js/mappai-landing-teach.js` (`openConsoleInsegna`, `_diskKind`, `VISTE_CLASSE`, `contestoDelleMappe`) |
| SVG maniglia (già implementato) | `Inkscape/maniglia.svg` |

## 6. Decisioni aperte da chiedere a Giacomo
- La sezione MATERIALI (Lavagna/LIVE/Stampabili) della sidebar reale: resta o migra?
- I 4 bottoni riga-1 **mappano su azioni che esistono già**: Mappa (apri mappa) · Elabora
  (ELABORA) · QR (= «Condividi (QR)» della barra anteprima) · Folder (= «Apri nel Finder»).
  Confermare che siano questi 4 e in quest'ordine.
- Il banner verde «MAPPA» attuale in D1 (span 3, «apri visualizzazione mappa»): probabilmente
  SOSTITUITO dai 4 bottoni riga-1 (o «Mappa» = quel banner). Confermare.
- Ordine/quali generi nel box materiali, e se «FILE DI LAVORO»/«ALTRI» stanno chiusi di
  default (nell'app reale «FILE DI LAVORO» è chiuso).
- Il box materiali a 2 colonne: quali generi a sinistra e quali a destra, o riempimento
  automatico in ordine?
