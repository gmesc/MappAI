> ⚠️ **DIARIO, NON STATO DEL REPO.** Filone «console e motore dei modali», fino al 3 agosto 2026.
> Lo stato di `main` — che cosa c'è, che cosa è acceso, che cosa manca — sta in
> **[`HANDOFF.md`](HANDOFF.md)**, ed è l'unico posto che lo dice.
> Questo file si legge per il **perché** di una decisione. Le sezioni che dicono
> «UNCOMMITTED» o «da fare» lo dicevano il giorno in cui sono state scritte: molte
> di quelle cose sono state fatte, e alcune sono state rovesciate.

---

# HANDOFF — console, landing e motore dei modali

> Punto di ripresa. Riscritto il **3 agosto 2026**, a fine sessione.
> Il file nasce sulle console; da questa sessione copre anche la **landing**, che è passata
> dallo stesso riordino. Il diario completo, con misure e motivi, è in `CLAUDE.md` §11.
> Autore del progetto: Giacomo Meschini — giacomo@insegnai.ch
>
> ⚠️ Dal 4 agosto c'è un secondo punto di ripresa: [`HANDOFF-manifesto.md`](HANDOFF-manifesto.md),
> per la VESTE nuova della landing e di COSTRUISCI (rail, bento, Officina §7). Questo file resta la
> verità sulle **console e sul motore dei modali**, che quella veste non tocca.

---

## 1. Dove siamo

Il motore dei modali è **in produzione**. La landing è stata riscritta attorno a due idee: la
schermata d'ingresso è una domanda, non la ripresa di ieri; e ogni superficie che raccoglie
comandi è una **console**, non una fila di finestre.

| superficie | stato |
|---|---|
| **Profilo insegnante** | schema vero (`MappAITeacherProfile.sezioni`) |
| **Modali della landing** (pickClass · pickMap · pickDoc · editGrade · assegna) | migrati |
| **Conferme a digitazione** (`confirmDeleteText`) | al motore |
| **Console INSEGNA** | sostituisce le tre sezioni della landing |
| **Console CABINA** | 9 viste; resta **un solo ponte**: Impostazioni AI |
| **Landing** | si apre vuota · header a due comandi · vista ridotta di COSTRUISCI |

Suite: **981 pass / 0 fail / 2 skip** (`npm test`). Branch `feature/vista-studio`, **nulla
committato** (64 voci in `git status`; l'ultimo commit è `db443fe`, di un'altra linea di lavoro).

---

## 2. Il motore, oggi

`MappAIModal.open(schema)` → Promise · `render(schema)` → nodo · `conferma/avviso/chiedi` ·
`chipContesto(parti)` · `prossimoZ()`.

Ogni pezzo è nato da un difetto visto a schermo, non da un disegno a tavolino:

| pezzo | perché esiste |
|---|---|
| `suAzione(ev, box, ridisegna, sorgente)` | senza, il «+» di un elenco **chiudeva il modale** |
| `suApertura(box, ridisegna)` | chi aspetta dati (scansione dei vault) non ha un gesto da cui ripartire |
| eventi `__nav` · `__scheda` · `__campo` · `__esc` | navigazione inerte; ESC che buttava via tutto |
| `sezioni[].voci` | l'archetipo «Elenco»: righe che si scelgono |
| `tabelle: [...]` | più elenchi per genere, richiudibili dal titolo |
| `tabelle` + `tela` insieme | la forma dei Consumi: elenco in testa, contenuto libero sotto |
| righe `{id, celle}` + celle `{azioni}` | in un elenco si apre quello che si legge |
| `sezioni[].nuda` · `collassabile` | comandi senza riquadro grigio |
| bottoni `soloIcona` | tre «Elimina» rossi dominavano un elenco |
| `prossimoZ()` | il piano si CHIEDE, non si calcola (vedi trappola 8) |

**Regole del motore da ricordare**
- una **voce**, una **riga di tabella** e **ogni azione** (di piè o di sezione) CONCLUDONO per
  default → dentro una console vanno dichiarate `chiude:false`;
- ⚠️ un'azione che conclude **non passa da `suAzione`**: il motore chiude e consegna l'esito al
  `.then()` di `open()`. O `chiude:false` e la logica sta in `suAzione`, o conclude e la logica sta
  nel `.then()` — scriverla nel posto sbagliato produce **codice morto senza errori**;
- `Core.validaSchema(schema)` va chiamato su ogni schema nuovo: ha trovato **nove** difetti veri;
- la normalizzazione **è idempotente** — `open()` normalizza e `render()` rinormalizza.

---

## 3. Le due console in app

**INSEGNA** (`mappai-landing-teach.js`, `MappAITeach.openConsole(voceIniziale)`) — chip
classe·materia → colonna delle mappe **dal disco** (`getAllVaults`) → materiali del vault in elenchi
per genere → documento nella tela. Sotto «Materiali»: Lavagna · Attività LIVE · Stampabili.
Kill-switch `mappai_teach_console='0'`.
Entrando, la landing sotto va su **COSTRUISCI**; uscendo verso una mappa si lascia un **segnalibro**
in `sessionStorage` (`mappai_teach_console_back`) che `init()` consuma una volta sola per riaprire la
console sulla stessa mappa dopo l'HOME (che fa `location.reload()`).

**CABINA** (`mappai-cabina.js`, `window.openCabina(voce)`) — nove viste in quattro gruppi:
Profilo insegnante · **Allievi** · **Classi** (tabella in alto, «Generico» e «Crea profilo» sotto) ·
Impostazioni AI (**unico ponte rimasto**) · **Consumi AI** · Consigli di studio · Tutorial ·
Termini & Condizioni · Privacy. Nessun chip in testata: il contesto vive nell'header della landing.

---

## 4. La landing

- **Si apre vuota**: marchio, selettore Costruisci/Elabora/Insegna, chip del contesto, Cabina,
  nastro di insegnai.ch. `readMode()` ammette `''` come stato vero; `init()` lo scrive. L'unica
  eccezione è il segnalibro della console.
- **Header a due comandi**: il **chip classe · materia** (`MappAIModal.chipContesto`, le due metà
  aprono i rispettivi selettori) e il bottone **Cabina**, un cerchio del diametro del chip
  (token `--mm-ctx-h`), teal-400 → teal-600, icona bianca.
- **Stile «manifesto»**: la landing e COSTRUISCI hanno una VESTE nuova, disegnata da Giacomo in
  Inkscape — rail delle tre forme al posto del selettore centrale, riquadri chiari, e il **bento**
  delle opzioni al posto del modale «Genera materiali». Kill-switch `mappai_stile_manifesto='0'` →
  torna esattamente questa landing.
  ⚠️ Tutto il resto (colori, composizione del bento, banchi, cose da fare) sta in
  **[`HANDOFF-manifesto.md`](HANDOFF-manifesto.md)**, e sta SOLO lì: ripeterlo qui vorrebbe dire due
  verità che divergono al primo ritocco — è già successo con i numeri di contrasto del primo verde.
- **Vista ridotta di COSTRUISCI** (`mappai-vista-ridotta.js`, combo SHIFT+CTRL+L,K,J,H,
  ricordata in `mappai_vista_ridotta`): resta PDF a tutta colonna → MM/KG → tema o slider →
  Genera materiali / Genera mappa → Mappa manuale. Niente titoli numerati: l'ordine lo dice
  l'opacità (15% → 100%), e lo stato si **ricalcola dai dati** a ogni cambiamento.
  Default messi dalla vista: multipass ON · logica adattiva · profondità automatica ·
  «adatta al livello» armato da solo col preset **semplice (BES/DSA)**.
  ⚠️ Quella combo attivava la **modalità studente**, ora in pensione per decisione di Giacomo:
  `window.toggleStudentMode` resta esposta ma il flag non si accende più da nessuna parte, e i due
  prompt `_STUDENT` restano nei file senza consumatori.

---

## 5. Da fare, in ordine

> La versione VIVA di questo elenco è il **cantiere dell'Atlante** (`public/dev/atlante-ui.html`,
> sezione «CANTIERE — che cosa resta, e dove va»): ogni superficie con la sua destinazione, il costo
> letto dal codice e il link che la apre. Rigenera con `node tools/atlante-ui/build.js`; la
> destinazione si scrive in `tools/atlante-ui/cantiere.js`. Stato al 3/8: **28 da migrare · 2 ponti ·
> 2 senza destinazione decisa · 5 da pensionare · 16 già al motore**.

1. **Testare in Electron** quello che è stato scritto in queste due sessioni: l'elenco per voce è in
   `CLAUDE.md` §11, sotto ogni «⚠️ Da testare in Electron vivo». È l'unico posto dove IPC, disco e
   `appState` esistono davvero. In particolare: la **combo** della vista ridotta (nel pannello
   browser `app.js` arriva dalla cache, quindi è verificata solo leggendo il file servito) e una
   **generazione reale** dalla vista ridotta.
2. **Chiudere l'ultimo ponte della Cabina**: config AI (uno dei 5 modali orfani).
3. **Testo definitivo di «Termini & Condizioni» e «Privacy»**: quello che c'è dice il vero ed è
   verificato sul codice, ma è una sintesi informativa, non un documento legale.
4. **Console «Mappa» (D2)** — sostituisce `floating-actions-menu` (index.html).
5. **Console «Documento» (F)** — il guscio di ELABORA·Documenti.
6. **I quattro cloni rimasti della barra documenti** (`branch-synthesis`, `causal-chains`,
   `timeline`, `glossary`, `live-reports`) → `mappai-doc-bar.js`.
7. **«File condivisi»**: `renderSharedMat` non ha un contenitore (`teach-shared-body` non esiste).
   Va deciso se ricostruirla o pensionarla.
8. **Pulizia**: i `.pm-*` non migrati; i 713 `!important` di `style.css`; e il **debito dichiarato**
   di `StorageManager.renderRecentProjects` + `MappAITeach.editGrade`, che dopo l'eliminazione di
   «Progetti salvati» non hanno più un ingresso nella UI (degradano in silenzio, non lanciano).

---

## 6. Trappole, quelle che costano davvero tempo

1. **La cache del pannello browser serve i JS e i CSS vecchi**, anche dopo un reload forzato: si
   misura codice di due giri prima. Per verificare bisogna rifetchare con `fetch(f, {cache:'reload'})`
   e rieseguire con `eval`, o rimettere il marcatore `?v=` sui `<link>`.
   ⚠️ Rieseguire un modulo con `eval` lascia **due istanze** attive: listener doppi e misure
   contraddittorie. Se i numeri non tornano, ricarica la pagina invece di aggiungere un `eval`.
2. **Il pannello parte con `innerWidth: 0`** (`94vw` vale 0, un modale si misura 44×44) e lavora con
   `visibilityState: hidden`: `requestAnimationFrame`, `setTimeout` e **le animazioni CSS** sono
   sospesi o strozzati. Le opacità lette lì non sono affidabili — misura la CLASSE, che è la logica,
   e prova a parte il legame classe→stile.
3. **Le regole in `@layer` perdono** contro quelle fuori dai layer, a prescindere dalla specificità.
   È il motivo per cui i token `mm-*` stanno in un foglio non-in-layer.
4. `appState` e `StorageManager` sono **`const` lessicali**, non su `window`.
5. **Misurare l'elemento giusto**: una maniglia che sporge 3px faceva sembrare troncate tutte le
   intestazioni.
6. **Verificare la firma prima di chiamare**: `showConfirm(title, message, onConfirm)` vuole tre
   argomenti, e con due la callback finisce stampata come messaggio.
7. **Il PDF headless non aspetta i font** da solo: `html-to-pdf` attende `document.fonts.ready`.
8. **Un z-index non si calcola mai da una formula.** `12000 + aperti*100` sembra sopra tutto e può
   essere sotto: le finestre non migrate non stanno nella pila del motore. Si chiede
   `MappAIModal.prossimoZ()`.
9. **Una superficie che mostra dati scritti altrove non si aggiorna da sola**: serve un annuncio
   (`mappai-profili-cambiati`), altrimenti l'utente ricarica la pagina per vedere un'eliminazione.
10. **`.checked = x` da JS NON scatena `onchange`.** La pipeline accendeva la spunta della taratura
    e il motore restava disarmato: la taratura non finiva nel prompt e nessuno se ne accorgeva.
11. **In `style.css` la cascata non è prevedibile a tavolino** (700+ `!important`): due tentativi
    con `:has()` e con una classe dedicata, entrambi `!important`, non hanno vinto su un
    `display:flex`. Dove serve certezza, stile inline con priorità — e dirlo nel commento.
12. **Un `</script>` dentro un dato chiude il tag della pagina.** L'Atlante inietta le superfici in uno
    `<script>`, e le superfici PORTANO markup: la prima volta che vi è entrata la landing — che in
    `index.html` contiene uno script inline — la pagina si è aperta **muta, senza un errore in console**
    (non c'era più uno script che potesse fallire). Due difese, entrambe necessarie: togliere gli
    `<script>` dai blocchi estratti (è comportamento, non superficie) e scrivere i dati con
    `JSON.stringify(...).replace(/</g,'\\u003c')`.
13. **A pannello nascosto le transizioni CSS restano CONGELATE sul frame di partenza**, e
    `getComputedStyle` serve quel colore. Misuravo le forme del rail tutte verdi con la classe già
    tolta: sembrava una regola che non vinceva, era la transizione ferma. Prima di dire che una regola
    perde, spegni `transition` e rimisura. (Sorella della trappola sulle opacità, punto 2.)
14. **Avvolgere una funzione ESPORTATA non intercetta le chiamate interne**: `MappAITeach.setMode`
    chiama `applyMode` **locale**, non `MappAITeach.applyMode` — la patch si applicava a un
    riferimento che nessuno usa, senza un errore. Quando serve sapere che qualcosa è cambiato, osserva
    il DOM (è il risultato) invece del codice che lo produce.
15. **Uno stacking context annulla lo z-index dei figli**: `.glass-card` ha `relative z-10`, quindi il
    chip dentro di lei con z-60 finiva sotto una banda a z-55 del contesto radice. Presente nel DOM,
    invisibile a schermo — si diagnostica solo misurando la posizione E guardando.
16. **Con due `!important` decide la specificità, e un id batte due classi**: `#landing-view
    .glass-card{padding:29px !important}` batteva `html.manifesto .glass-card{...!important}`.
17. **`safeCreateIcons()` è un hub GLOBALE: riscrive le icone di tutta la pagina.** Chiamarlo dentro
    un ridisegno che è a sua volta innescato da un `MutationObserver` chiude il cerchio e **appende
    il renderer** — successo davvero, e da lì in poi nemmeno `1+1` rispondeva più nel pannello. Se un
    pezzo si ridisegna spesso, l'icona va messa come **SVG in linea** (come `mappai-doc-bar.js`).
    Corollario di metodo: quando il pannello si blocca, la via più rapida è un **harness col solo
    modulo** — se lì non si blocca, il colpevole è l'interazione con l'app.
18. **`setMode('')`, `readMode()`, i default silenziosi**: prima qualunque valore non riconosciuto
    ripiegava su `'build'`, quindi lo stato «landing vuota» non poteva esistere. Quando aggiungi uno
    stato, controlla che la funzione che lo legge sappia nominarlo.

---

## 7. Stato del repo

- Branch `feature/vista-studio`, **nulla committato**.
- File nuovi di queste due sessioni: `mappai-cabina.js` · `mappai-doc-bar.js` ·
  `mappai-vista-ridotta.js` · `tests/doc-bar.test.js`.
- Kill-switch utili: `mappai_teach_console='0'` (console INSEGNA off) ·
  `mappai_vista_ridotta` (la vista ridotta, scritta dalla combo) · `mappai_studio_view='0'`.
- `.claude/launch.json` ha più voci per servire `public/` (8145-8148): due chat non possono usare
  la stessa porta.
- Aperto da prima: guardia in `filesOrganized()` (main.js) — controlla che `filesRoot` sia una
  stringa, mai che la cartella esista, quindi un percorso morto svuota l'app **senza dire nulla**.

---

## 8. Come lavora Giacomo

- Vuole **vedere e misurare**. Ogni proposta va guardata alle larghezze vere.
- Corregge in modo puntuale e ha ragione spesso: in queste sessioni ha trovato difetti veri provando
  in Electron che dal banco erano invisibili (il bottone MAPPA che non apriva la mappa, la conferma
  nascosta sotto la scheda, ELABORA che portava al canvas).
- Regole sue: niente articoli nei nomi dei bottoni · tutto a sinistra nelle tabelle · **niente emoji
  nei bottoni, solo Lucide** · emoji di sistema in **Noto/Android**, anche nei PDF.
- Le pagine in `public/dev/` sono strumenti **suoi**: si rigenerano coi loro script
  (`node tools/atlante-ui/build.js`, `tools/officina/…`), non si riscrivono a mano.
  L'Atlante ha due comandi, in quest'ordine: `node tools/atlante-ui/cattura.js` (rilegge gli schemi
  VERI di INSEGNA e Cabina in una finestra Electron nascosta — serve solo quando cambiano le console)
  e `node tools/atlante-ui/build.js` (rigenera la pagina; questo sempre).
- Gergo concordato per parlare di interfaccia: **`superficie › pezzo`**, coi nomi dell'Atlante UI.
