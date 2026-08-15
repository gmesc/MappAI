# GUIDA-ARCHITETTO — MappAI

> **A chi serve questo documento.** A chi riceve un braindump di Giacomo e deve trasformarlo
> in un piano di implementazione: un agente, una skill, un collaboratore nuovo. Si legge PRIMA
> di progettare, non prima di ogni gesto.
> **La regola di lettura**: questo documento dice *come si costruisce qui*; **a che punto
> siamo** lo dice [`docs/HANDOFF.md`](docs/HANDOFF.md) — che cosa c'è in `main`, che cosa è
> acceso, che cosa manca. Se sembrano in conflitto, ha ragione il documento più recente.
> **La regola di manutenzione**: si aggiorna quando cambia un invariante o la mappa — di rado,
> mai per registrare lo stato di una sessione. Se scrivendo qui viene voglia di annotare uno
> stato («X è fatto», «N test verdi»), quel contenuto va in HANDOFF.md, e qui al massimo un
> puntatore.

---

## 1. Che cos'è il progetto

MappAI è un'applicazione desktop **Electron** che genera mappe mentali e knowledge graph da
fonti testuali (PDF, URL, YouTube, testo) usando AI, e attorno alle mappe costruisce materiali
di studio: quiz, flashcard, sintesi con voce, fogli dei nodi, attività di classe via QR su LAN.
Utenti: **docenti** e studenti **BES/DSA** (dislessia, ADHD, ipovisione) nella scuola svizzera.
Autore e product owner: Giacomo Meschini, ex insegnante — è lui che prova ogni cosa in classe.

Le proprietà che lo definiscono più di ogni funzione:

- **L'utente è un docente, non un tecnico.** La leggibilità batte la potenza: default già
  tarati, opzioni avanzate nascoste in un pieghevole, mai sedici comandi nella prima schermata.
  Un'interfaccia che travolge il docente è un difetto di prodotto, non di gusto.
- **Ogni modifica è reversibile.** Le feature nascono dietro un kill-switch e la strada vecchia
  resta viva finché la nuova non ha retto l'uso vero (invariante 1).
- **Il disco è dell'utente.** I vault sono cartelle Markdown compatibili con Obsidian in
  `~/Documents/MappAI - file/`: l'app li legge come fonte di verità e non deve mai renderli
  dipendenti da sé (invariante 7).
- **Stack deliberatamente semplice**: Electron 39, vanilla JS a script globali (`window.*`),
  D3 v7, Tailwind via CDN, **nessun bundler, nessun framework**. La complessità sta nel dominio,
  non nella toolchain.

Che cosa questo progetto NON fa: non manda dati di allievi all'AI se non nelle attività che lo
dichiarano (Tutor QR) e col provider scelto dal docente; il **misuratore**
(repo a sé, cartella sorella `~/Claude/MappAI - misuratore`) è un'app separata *per
principio* — chi misura l'accessibilità non deve essere chi produce il materiale — e non
importa nulla da MappAI a runtime: le porzioni riusate sono COPIE dichiarate, sorvegliate
dal suo test di divergenza; il ramo iPadOS è in standby
su branch propri; il sistema di licensing e la cartella `ios/` non si toccano.

---

## 2. Vocabolario

| termine | che cos'è | da non confondere |
|---|---|---|
| **console** | superficie a tutto schermo del motore dei modali: navigazione · schede · area (INSEGNA, Cabina, ELABORA v2) | non è un modale «grande»: ha ESC a strati, maniglia, tela |
| **motore (dei modali)** | `MappAIModal`: i modali sono SCHEMI (dati), il motore li disegna | col **motore (di layout)** della Vista studio: sette algoritmi in `mappai-studio-layouts.js` |
| **bento** | l'area delle opzioni di generazione in CREA, al posto del modale «Genera materiali»; la composizione è un DATO (`mappai-bento-composizione.js`) | con gli avvii rapidi della landing, che bento non sono |
| **officina** | banco `public/dev/` dove una composizione si costruisce trascinando e l'app la legge da localStorage | con l'**harness**, che carica i moduli veri per misurarli |
| **banco / harness** | pagina o script che fa girare i MODULI VERI con stub minimi (`public/dev/*-harness.html`, `tools/smoke/*.js`) | coi test della suite: il banco prova ciò che i test puri non raggiungono |
| **superficie › pezzo** | il gergo per parlare di UI senza ambiguità; i nomi li dà l'Atlante (`public/dev/atlante-ui.html`) | inventare nomi propri: se il pezzo ha già un nome nel glossario, si usa quello |
| **vault** | cartella su disco di una mappa (`index.yaml`, `links.json`, `Nodi/*.md`, `Materiale Studio/`, `Allegati/`) | col **progetto**, che è lo snapshot in localStorage: possono esistere l'uno senza l'altro, comanda il vault |
| **contesto attivo** | classe o allievo + materia correnti (localStorage): governano cartelle di destinazione e taratura AI | classe e allievo si ESCLUDONO a vicenda |
| **taratura [VERDE]** | il profilo completo della classe iniettato nel prompt (registro + note); marca i file col suffisso | con **«Adatta»**, che passa solo il livello di lettura (grado/età) |
| **clone / copia** | seconda versione di un documento con un NOME suo, che entra nel nome del file | col «(rivisto)» storico, che era un'etichetta pre-copie |
| **materiali** | i file in `Materiale Studio/` del vault: PDF e HTML consegnabili | con **`studySets`**: vedi invariante 6 — il nome mente |
| **linking words** | i verbi sugli archi (`rel`); vocabolario unico in `EDGE_FAMILIES` | mai hardcodare liste di verbi nei prompt |
| **macro-aree** | i nodi L1, i rami della mappa | col `group` (indice colore) e col `level` (che nei KG non è semantico) |
| **desc / content** | `desc` è il campo RICCO di studio; `content` è il breve legacy | tutte le superfici leggono `desc \|\| content`, mai il contrario |
| **vista ridotta** | CREA asciugato (combo SHIFT+CTRL+L,K,J,H) | con la **Vista studio**, il passo STUDIO del ciclo LAYOUT sul canvas |
| **kill-switch** | chiave localStorage che spegne una feature e ripristina la strada storica | la tabella completa è in HANDOFF.md §2 |

---

## 3. Gli invarianti

I piani li citano per numero («viola l'invariante 6»). Ognuno è stato pagato.

1. **Ogni feature nasce dietro un kill-switch, e la strada vecchia resta viva.** Il progetto ha
   ~900 ore di lavoro dell'autore e utenti veri: la reversibilità è la condizione per osare.
   La strada vecchia si pota solo quando la nuova ha retto giorni d'uso reale (è il criterio con
   cui ELABORA v2 è diventata default e la v1 aspetta la potatura).
2. **I nodi stanno in `appState.db.nodes`, mai in `appState.nodes`.** Il secondo non esiste;
   scriverci crea uno stato fantasma che nessun renderer legge.
3. **`appState` e `StorageManager` sono `const` lessicali, NON stanno su `window`.** La guardia
   giusta è `typeof X !== 'undefined'`. Guasto d'origine: un `window.StorageManager` in
   `persist()` falliva in silenzio — il profilo non si salvava e nessun errore lo diceva.
4. **La logica nuova nasce in un core puro UMD, testato in Node; la UI lo monta.** È il pattern
   `mappai-*-core.js` + `tests/*.test.js`: pipeline, files, teach, usage, docedit, nodesheet,
   dungeon… Un modulo che mescola logica e DOM non si può provare senza Electron, e quello che
   non si prova si rompe in silenzio.
5. **I file JS sono script globali caricati in `index.html` dopo `app.js`, col marcatore
   `?v=` bumpato DOPO l'ultima modifica.** Niente ES modules, niente bundler. Il marcatore non è
   cosmesi: due volte Giacomo ha provato l'app e non vedeva il codice nuovo perché il bump era
   stato fatto prima dell'ultima scrittura — il sintomo sembra «la funzione non c'è».
6. **Una verità ha UNA fonte, e la definizione vera di una struttura è che cosa i suoi lettori
   pretendono.** Esempi pagati: il bento porta gli STESSI id del modale perché
   `MappAIPipeline._readConfig()` resti l'unico lettore della configurazione; i nomi file
   escono SOLO da `buildFileName` (il PDF di una copia sovrascriveva l'originale perché un
   secondo compositore di nomi ignorava la copia); i verbi degli archi vivono solo in
   `EDGE_FAMILIES`; `studySets` sembra «i materiali» ma è «ciò che il player sa giocare» — le
   domande aperte vivono altrove per questo. Prima di duplicare un dato o una lista, cercare chi
   la possiede già.
7. **Il disco è la verità per mappe e materiali; localStorage è un indice.** INSEGNA e le
   console elencano i vault da `getAllVaults`: una mappa senza progetto in localStorage deve
   comparire lo stesso. Guasto d'origine: la console partiva dai progetti salvati e «l'unica
   classe che vedeva tutti i materiali era la 2A». Corollari: mai percorsi assoluti dentro i
   markdown del vault (solo relativi); un dato che contraddice la cartella verrà rismentito
   dalla cartella al render successivo.
8. **Mai `JSON.parse` diretto su una risposta AI: sempre `salvageTruncatedJSON`.** I modelli
   troncano e sporcano; in single-pass un JSON rotto perde tutto.
9. **Infomaniak non riceve `responseMimeType` né `responseSchema`, e un fix che funziona solo
   su Google non è accettabile.** Il bridge li converte in modi che alterano il contesto o
   svuotano la risposta (documentato sui modelli svizzeri). Le due strade si provano entrambe.
10. **Nel motore dei modali, un'azione che CONCLUDE non passa da `suAzione`.** Il motore chiude
    e consegna l'esito al `.then()` di `open()`. O `chiude:false` con la logica in `suAzione`,
    o conclude con la logica nel `.then()`. Guasto d'origine: quattro bottoni della console
    INSEGNA che chiudevano la finestra e basta — codice morto senza errori. Corollario: voci,
    righe di tabella e azioni concludono PER DEFAULT; dentro una console vanno dichiarate
    `chiude:false`. Ogni schema nuovo passa da `Core.validaSchema` (ha trovato nove difetti veri).
11. **Uno z-index non si calcola: si chiede a `MappAIModal.prossimoZ()`.** Le finestre non
    migrate non stanno nella pila del motore, quindi ogni formula «abbastanza alta» prima o poi
    finisce sotto. Guasto: conferme di eliminazione nascoste DIETRO la scheda che le apriva.
12. **Le tabelle di dati sono `<table>` + `<colgroup>`, tutto allineato a sinistra, ultima
    colonna (azioni) a larghezza FISSA, date in GG/MM/AAAA.** Con CSS grid ogni riga è un
    contenitore a sé e le intestazioni si scollano dalle celle appena il contenuto varia.
13. **Un'eliminazione si conferma digitando il nome esatto; i file su disco vanno nel Cestino
    (`shell.trashItem`), mai cancellati.** Un materiale di classe si deve poter recuperare.
14. **i18n a tre regole**: chiavi del markup statico in ENTRAMBI i dizionari (o lo switch
    EN→IT non ripristina l'italiano); nei moduli `window.t('chiave', 'fallback italiano')` con
    la chiave solo in `en_translations.js`; nei moduli UMD testati in Node `_tSafe` locale, mai
    `window.t` diretto.
15. **Icone: solo Lucide, mai emoji nei bottoni; `safeCreateIcons()` dopo ogni append al DOM —
    ma è un hub GLOBALE.** Riscrive le icone di tutta la pagina: dentro un ridisegno innescato
    da un `MutationObserver` chiude il cerchio e appende il renderer (successo davvero). Dove un
    pezzo si ridisegna spesso, l'icona va messa come SVG in linea. Le emoji di CONTENUTO
    (identità allievi) si rendono in Noto/Android anche nei PDF: l'emoji È l'identità.
    ⚠️ E **un'icona si mette solo se dice qualcosa che il testo non dice** (Giacomo, 14/8):
    il lucchetto su una voce spenta sì — dice che non si può premere; un glifo accanto a
    «Crea» no, è un secondo alfabeto da imparare per un'informazione che c'è già. Niente
    icone dove non sono state chieste. E se un'icona la si prende «da un'altra parte
    dell'app», va guardato se quella parte è ancora viva: le forme del rail erano una UI
    abbandonata, e un glifo che viene da un pezzo morto porta con sé un'identità che non
    esiste più.
16. **Il contrasto si misura, ≥ 4,5:1, sul fondo che si VEDE.** Bianco su verde `#41e6aa` fa
    1,6:1: sul verde il testo è scuro. I colori vivono in token unici (`--man-nero: #404040`,
    `--man-card: #f1f4f8`): una leva sola, non cinque regole che coincidono per caso.
17. **Un default nuovo deve vincere UNA volta anche sui profili già salvati, con un marcatore
    di versione; poi comanda la scelta dell'utente.** Senza, chi ha aperto la feature una volta
    si porta dietro la taratura vecchia per sempre e il miglioramento non lo vede nessuno
    (pattern `mappai_bento_default_v1`, `defv` della Vista studio). E attenzione al fratello di
    questo guasto: al boot qualcun altro può aver già scritto un default suo, quindi «applica se
    la chiave è vuota» non basta mai.
18. **La SORGENTE si salva prima della RESA, e un errore nella resa non la fa perdere.**
    Un documento ha una sorgente (il set, l'HTML col suo contenuto incorporato) e una o
    più rese (il PDF, il foglio stampato). La sorgente si può riaprire e correggere; da
    una resa non si ricava più niente. Guasto d'origine: `generaSet` costruiva il PDF
    PRIMA di archiviare l'HTML, quindi un `htmlToPdf` che non rispondeva buttava via
    minuti di generazione AI e il materiale «non compariva da nessuna parte»
    ([`docs/HANDOFF-crea-materiali.md`](docs/HANDOFF-crea-materiali.md)). Corollario:
    scrivere sempre l'ordine sorgente → resa, e far fallire la resa **rumorosamente**
    senza toccare quello che c'è già.
19. **`main.js` è I/O e finestre: IPC sottili, la logica sta nei core del renderer.** Le guardie
    sui percorsi (`sanitizeVaultRelPath`, allowlist) stanno nell'IPC; il resto no.

---

## 4. Mappa del codice

```
main.js                     Electron main: IPC sottili, server LAN, finestre (invariante 18)
preload.js                  contextBridge → window.electronAPI
public/
  index.html                entry: markup dei modali storici + caricamento script con ?v=
  css/style.css             CSS storico — 713 !important: cascata NON prevedibile (trappola 6)
  css/mappai-modal-tokens.css   token del motore dei modali (fuori @layer, apposta)
  css/mappai-*-manifesto.css    la veste «manifesto», tutta scoped sotto html.manifesto
  js/app.js                 core storico in smontaggio (bootstrap, appState, fetchModelAPI)
  js/mappai-*-core.js       LOGICA PURA, UMD, testata in Node (invariante 4)
  js/mappai-*.js            moduli UI, script globali, caricati dopo app.js
  js/riuso/ (nel misuratore) copie dichiarate, mai import a runtime fra le due app
  js/vendor/                librerie vendorizzate: si lavora OFFLINE, niente CDN a runtime
  traduzioni/               it/en + i18n-helper (invariante 14)
  dev/                      banchi e strumenti DI GIACOMO: si rigenerano coi loro script
                            (atlante-ui, officina, harness) — mai riscriverli a mano
  live/ collab/ tutor/      pagine studente self-contained servite dai server LAN
tests/                      node --test; solo logica pura, zero DOM
tools/
  smoke/                    banchi Node sui moduli veri (LEGGIMI.md dice cosa NON provano)
  atlante-ui/ officina/     generatori delle pagine di public/dev/
docs/                       HANDOFF.md (stato) + diari + guide tecniche
specs/                      spec-kit delle feature grandi (spec → plan → tasks)
```

*(server LAN: `live-server.js`, `collab-server.js`, `tutor-server.js`, `garden-server.js` nella
radice — HTTP Node puro, stessa famiglia di pattern: token nel QR, allowlist statica, ripresa
crash-safe da disco.)*

## 5. Mappa dei dati

Tutto sotto `~/Documents/MappAI - file/` (percorsi risolti da `FilesCore` + `filesOrganized()`
in main.js — mai comporre percorsi a mano).

| cartella | di chi è | note |
|---|---|---|
| `Mappe/<classe>/<materia>/<mappa>/` | **dell'utente** (vault, compatibile Obsidian) | dentro: `Nodi/*.md`, `links.json`, `Materiale Studio/`, `Allegati/`. La posizione nella gerarchia È il dato classe/materia (invariante 7) |
| `Allievi/<nome>/Mappe/` | dell'utente | le mappe generate con un allievo attivo vivono QUI, non fra quelle di classe: sono materiale suo |
| `Classi/<classe>/` | dell'app, rigenerabile | credenziali PDF, riscritte al salvataggio della classe |
| `Attività di studio/<classe>/<sessione>/` | dell'app, storico | sessioni Live/Tutor/Lavagna: `session.json` (MAI i token a schermo), report HTML |
| `Registro consumi AI/` | dell'app, append-only | `consumi-ai.jsonl`: token e contesto, MAI i costi (si calcolano a display-time) |
| localStorage | indice e preferenze | progetti (snapshot), contesto attivo, kill-switch, profili utente |

Un piano che fa scrivere un generatore dentro una cartella dell'utente, o che duplica nella
struttura un dato che la gerarchia delle cartelle già dice, va rifatto.

---

## 6. Come si verifica

```bash
node --test tests/                             # suite pura
node tools/smoke/cornice-documenti.js          # i banchi: moduli VERI, stub minimi
node tools/smoke/elenchi-elabora-insegna.js
node tools/smoke/studio-sidebar.js
npm start                                      # l'app vera (solo Giacomo o CDP)
npx electron . --remote-debugging-port=9222    # debug remoto: misurare NELL'app vera
```

Condizioni al contorno che falsano le misure:

- ⚠️ il numero che conta della suite è **0 fail**, non il totale (nei diari i totali
  oscillano: fino al 12/8 `npm test` scopriva anche i test del misuratore);
- il pannello browser mente in modi catalogati (trappole 1-4 in §8): cache, viewport a zero,
  transizioni congelate, rAF sospeso. Per le misure vere: CDP sull'app, o banchi Node;
- ogni banco dichiara in `tools/smoke/LEGGIMI.md` che cosa NON può provare — leggerlo prima di
  fidarsi di un «ok».

La filosofia di verifica: **eseguire, non parsare; misurare, non guardare**. Un modulo si prova
facendolo girare; un contrasto si calcola; un PDF si ispeziona con `pdftotext`/`pdftoppm`, non
a occhio sullo schermo. E ciò che vive di IPC, disco e `appState` si prova SOLO in Electron:
ogni consegna dichiara la sua lista «da provare in Electron», e finché Giacomo non l'ha vista
girare non è finita.

## 7. Come si lavora

- **Si committa su `main`**, a lavoro verificato; i feature-branch sono storici (le feature
  grandi passavano da spec-kit in `specs/`). Un branch che risulta «avanti» va misurato col
  diff prima di crederci: è già successo che fosse uno stato arretrato.
- **Commit narrativi in italiano**: `tipo(area): che cosa`, e il corpo racconta il PERCHÉ e il
  guasto, non l'elenco dei file. La storia del progetto è la sua documentazione migliore.
- **Il push lo fa Giacomo** (`git push origin main`): l'agente non ha credenziali, e non deve
  averle.
- **Prima il banco, poi l'app**: la strada tipica di una feature è core puro + test → banco o
  harness che lo fa girare → montaggio nell'app → prova in Electron di Giacomo. Quando il
  pannello si blocca, un harness col SOLO modulo dice subito se il colpevole è il modulo o
  l'interazione con l'app.
- **A fine sessione si aggiorna `docs/HANDOFF.md`** (lo stato), non questa guida. I diari
  `HANDOFF-*.md` restano fermi: sono storia.
- **`file <percorso>` su ogni file nuovo prima del commit**: due volte un byte di controllo
  letterale in una regex ha reso un sorgente «binario» per git — niente diff, niente review.
- Giacomo corregge in modo puntuale e ha ragione spesso: i difetti peggiori li ha trovati LUI
  provando in Electron cose invisibili dal banco. Le sue regole di prodotto (niente articoli
  nei bottoni, conferme a digitazione, contrasti, Lucide, Noto) sono negli invarianti 12-16 e
  non si ridiscutono a ogni giro.

---

## 8. Trappole permanenti

Le prime quattro riguardano il **metodo di misura**: quasi ogni volta che «una regola non
vince», il difetto è nella misura. Questo catalogo vive QUI; HANDOFF.md vi punta.

1. **A pannello nascosto le transizioni CSS restano congelate sul frame di partenza** e
   `getComputedStyle` serve quel colore. **Quando nemmeno uno stile inline `!important` cambia
   la misura, non è la cascata: è la misura.** Spegnere `transition` e rimisurare.
   E per misurare il MOVIMENTO, non lo stato: senza fotogrammi `getAnimations()` torna vuoto e
   `requestAnimationFrame` non scatta (un campionamento si pianta e sembra che l'animazione non
   ci sia). `Page.startScreencast` costringe il renderer a produrre fotogrammi.
2. **Il pannello browser lavora con `visibilityState: hidden`**: rAF fermo, `setTimeout`
   strozzato a ~1/s, animazioni e ResizeObserver sospesi. Schermate bianche e contatori a zero
   non sono difetti della pagina: si misura il DOM e si dichiara che la verifica visiva non è
   stata fatta.
3. **Il pannello parte con `innerWidth: 0`** (`94vw` vale 0, un modale si misura 44×44):
   `resize_window` prima di misurare.
4. **La cache serve JS e CSS vecchi anche dopo un reload forzato.** E rieseguire un modulo con
   `eval` lascia DUE istanze attive: se i numeri non tornano, si ricarica la pagina.
5. **Un test può passare per il motivo sbagliato**: la prova dei `.json` fuori dagli elenchi di
   INSEGNA girava su una lista che li scartava già da sé. Chiedersi sempre da quale dato arriva
   l'«ok».
6. **In `style.css` la cascata non è prevedibile a tavolino** (713 `!important`). Con due
   `!important` decide la specificità e un id batte due classi; le regole in `@layer` perdono
   contro quelle fuori, a prescindere. Dove serve certezza: stile inline con priorità, e dirlo
   nel commento. ⚠️ E il rovescio: un `!important` **inline nel markup** uccide in silenzio la
   regola del foglio scritta per governare quel valore — il corpo del titolo in sidebar aveva
   un `font-size:18px !important` inline, e la regola che lo faceva crescere con lo zoom testo
   (a11y) era morta da chissà quando, senza che nulla lo dicesse.
7. **Il figlio ha un colore SUO** (`.source_btn_text`, gli `<span>` dei bottoni): il contenitore
   obbedisce e il figlio no. La cura è imporre sull'etichetta, con id + `!important`.
8. **Uno stacking context annulla lo z-index dei figli**: presente nel DOM, invisibile a
   schermo. Si diagnostica misurando la posizione E guardando chi sta sopra
   (`elementFromPoint`).
9. **Avvolgere una funzione esportata non intercetta le chiamate interne** (`setMode` chiama la
   `applyMode` locale, non quella sul namespace). Per sapere che qualcosa è cambiato si osserva
   il DOM, che è il risultato.
10. **`.checked = x` da JS non scatena `onchange`**: si arma il motore, poi si allinea la
    spunta — mai il contrario.
11. **Un contenitore alto 0 consuma comunque il `gap` del genitore.** Se un pezzo è stato
    spostato altrove, il posto vecchio si spegne (`display:none`), non si svuota.
12. **`showConfirm(title, message, onConfirm)` vuole TRE argomenti**: con due, la callback
    finisce stampata come messaggio. Verificare la firma prima di chiamare.
13. **Un `</script>` dentro un dato chiude il tag della pagina** — e la pagina si apre muta,
    senza errori, perché non resta uno script che possa fallire. Dati inline sempre con
    `JSON.stringify(...).replace(/</g,'\\u003c')`.
14. **Un apice inverso in un COMMENTO dentro un template literal chiude la stringa.** Settima
    volta in questo progetto: nei template literal i commenti si scrivono senza backtick.
15. **Una superficie che mostra dati scritti altrove non si aggiorna da sola**: serve un
    annuncio (`CustomEvent`), o l'utente ricarica per vedere un'eliminazione. E se il dato
    cambia da DUE strade, servono DUE eventi (classe e materia ne hanno uno ciascuno).
16. **Prima di dire «quel comando c'è già altrove», guardare se c'è.** Una briciola tolta
    «perché c'è il rail» ha lasciato una schermata senza uscita: col bento il rail non si
    montava. ⚠️ E vale anche togliendo: cancellando il rail (14/8) sono spariti con lui
    `consoleInCima`, `sezioneDelBox` e `vaiA` — che stavano nel suo blocco ma servono alla
    BRICIOLA. La landing è rimasta senza modo di cambiare sezione finché non li ho rimessi.
    Prima di cancellare un blocco, cercare i suoi nomi ALTROVE.
17. **L'ARCHIVIO e il DISCO sono due mondi che non si parlano.** Le voci d'archivio
    (`MappAIStudyDocs`, in localStorage) e i file nel vault vivono separati: cancellare un
    file dal Finder non toglie la voce, e cancellare la voce non toglie il file. Gli
    elenchi che li UNISCONO (INSEGNA) devono dire quando divergono, o mostrano materiali
    che non esistono più. È dichiarato nel codice, e va ricordato ogni volta che si
    aggiunge una fonte a un elenco.
18. **`clamp()` senza spazi attorno agli operatori è sintassi invalida scartata in silenzio**, e
    l'elemento mostra il valore della cascata — verosimile abbastanza da non insospettire.
    `getComputedStyle` dice quale valore è in vigore, non da dove viene.
19. **L'area della console NON comincia al suo bordo sinistro**: i primi 34px in alto a sinistra
    sono della maniglia della colonna, che ci sta sopra. Il posto glielo riserva UNA regola
    (`padding-left` di `.mm-console__area`, derivato da `--mnc-man-size`), quindi chi disegna
    una vista non deve più saperlo — ma chi porta l'area a `padding:0` (la console-EDITOR con
    la tela a filo) se lo riprende, e allora il respiro va rimesso sul primo pezzo, **con lo
    stesso token**. Due pezze puntuali in due giorni prima che diventasse una regola sola.

20. **Un `<button>` con `width:auto` NON riempie il suo contenitore**: si stringe sul contenuto,
    come ogni controllo di modulo. In un contenitore `block` le voci di una colonna crescevano
    quanto il nome più lungo — la colonna scorreva in orizzontale, il testo non troncava mai (una
    riga senza larghezza non ha niente da rispettare) e il bollino in coda finiva oltre il bordo.
    La cura è rendere il contenitore un **flex colonna**: da flex item la voce si stira alla
    larghezza del contenitore meno i margini. Vale per qualunque elenco di bottoni.

21. **Un clone fedele si copia dal RESO, non dalle classi.** Il bottone-modello dichiarava
    `p-3` e `text-sm`, ma le regole globali dell'app lo rendevano padding 8 e corpo 15:
    trascrivere le classi Tailwind produce un pezzo *simile* — che è il difetto che il clone
    doveva evitare. Si misura l'originale a schermo, campo per campo, e si copiano i numeri.

22. **Un modulo caricato due volte aggancia due ascolti** e tiene due copie del suo stato.
    Nel registro degli errori voleva dire ogni riga in doppia copia e la difesa contro le
    ripetizioni che non valeva più — un difetto che si vede solo nei DATI, mai a schermo.
    Ogni modulo con ascolti globali comincia con `if (window.NomeModulo) return;`.

23. **Il testo che il motore ESCAPA non può portare markup.** Le chiavi i18n nate per una
    superficie HTML contengono `<strong>`: riusarle in uno schema mostra i tag a schermo.
    Riusare la chiave resta giusto (una fonte sola), ma va ripulita.

24. **La forma breve dei `dati` (`'etichetta: valore'`) spezza al PRIMO due punti**, e in
    un'ora («11:46») quel due punti è dentro il dato. Con un valore che può contenerne uno,
    si passa l'oggetto `{etichetta, valore}`.

25. **Un accento scritto da macOS non è l'accento scritto da JS.** I nomi di file e cartella
    che arrivano dal filesystem sono in forma **scomposta** (NFD: `a` + segno), le stringhe
    dei letterali JS e di `appState` in forma **composta** (NFC). `'Elettricità' === 'Elettricità'`
    può essere **falso** pur essendo la stessa parola a schermo, e un filtro che cerca una
    cartella con l'accento torna **zero** invece che sbagliato — il che è peggio, perché
    sembra una risposta. Chi confronta un nome di cartella con un nome tenuto in memoria
    normalizza prima (`.normalize('NFC')` su entrambi i lati). Nei dati veri di Giacomo le
    due forme convivono già.

---

## 9. Protocollo per un braindump

1. **Leggere, in quest'ordine**: questa guida → [`docs/HANDOFF.md`](docs/HANDOFF.md) (stato,
   kill-switch, debiti aperti) → se l'area ha una spec in `specs/`, la sua.
2. **Tradurre il braindump nel vocabolario (§2)** prima di ragionare: «il menu» è una
   superficie con un nome nell'Atlante; «i materiali» potrebbe voler dire `studySets`, che è
   un'altra cosa.
3. **Passare l'idea contro gli invarianti (§3)**, con le domande-filtro del progetto:
   - questa logica vivrà in un core puro testabile, o sto scrivendo DOM che nessun banco
     raggiunge? (inv. 4)
   - questa verità ha già un proprietario? sto per creare la seconda copia che diverge? (inv. 6)
   - di chi è la cartella in cui scrivo? che cosa succede al dato quando il vault viene
     spostato o rigenerato? (§5, inv. 7)
   - come si spegne? qual è il kill-switch e che cosa ripristina? (inv. 1)
   - cambia un default? allora serve il marcatore di versione (inv. 17)
   - sto scrivendo una RESA (un PDF, un foglio)? la sorgente è già al sicuro? (inv. 18)
   - funziona anche su Infomaniak? anche coi vault legacy? (inv. 9, 7)
4. **Il piano dichiara sempre**: file toccati · dove vive la logica nuova (quale core, quale
   modulo) · le prove (test + banco) · **che cosa Giacomo verificherà a mano in Electron** ·
   i non-obiettivi, per iscritto.
5. **Chiedere a Giacomo solo i bivi materiali** (una scelta di prodotto, un colore, un costo
   visibile all'utente); tutto il resto si decide e si dichiara. Le decisioni già prese —
   §7 di HANDOFF.md e §4 dei diari — non si ridiscutono.
6. **Il lavoro è finito quando**: suite a 0 fail, banchi verdi, marcatori `?v=` bumpati DOPO
   l'ultima modifica, `docs/HANDOFF.md` aggiornato (stato + lista «da provare in Electron»),
   commit narrativo. Se è cambiato un invariante o la mappa: aggiornare QUESTA guida, ed è
   l'unico caso in cui la si tocca.

---

## 10. Fonti vive

| documento | che cosa dice | affidabilità |
|---|---|---|
| [`docs/HANDOFF.md`](docs/HANDOFF.md) | **lo stato**: cosa c'è in `main`, kill-switch, debiti, cosa provare in Electron | l'unico documento di stato; se contraddice questa guida su un fatto recente, vince lui |
| `CLAUDE.md` | il diario giorno per giorno, con misure e motivi (§11) | 4.500+ righe in ordine di SCRITTURA, non di verità: le sezioni vecchie descrivono stati superati |
| `docs/HANDOFF-console-bento.md` · `-manifesto.md` · `-console.md` | i diari dei tre filoni | il perché delle decisioni; le loro sezioni «UNCOMMITTED» e «da fare» sono fotografie datate |
| `public/dev/atlante-ui.html` | il vocabolario della UI e il cantiere delle migrazioni | si rigenera con `node tools/atlante-ui/build.js`, mai a mano |
| `tools/smoke/LEGGIMI.md` | che cosa i banchi possono e NON possono provare | leggere prima di fidarsi di un banco |
| `~/Claude/MappAI - misuratore/HANDOFF.md` | lo stato dell'app misuratore | REPO separato (sorella): non mescolare i piani |
| memoria agente (`~/.claude/projects/...-MappAI-re/memory/`) | lezioni trasversali alle sessioni | può citare file rinominati: verificare prima di agire |

Non esiste un README: `CLAUDE.md` ne fa le veci per l'orientamento iniziale, con il limite
detto sopra.
