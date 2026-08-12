# SPEC — La nuova ELABORA: sidebar coi progetti, area a tre stati
> Scritta 10/8/26 sera, decisa in chat con Giacomo. Questo file è **git-ignored**
> (`.gitignore: *console*.md`): vive solo su disco, accanto a `HANDOFF-console-bento.md`.
> Stato: **fasi 0-5 fatte e verificate (F2-F5 provate in Electron sui vault veri)**,
> resta F6 (conteggio dei clic e switch del default). Le due assunzioni sono CONFERMATE.

---

## 1. CHE COSA CAMBIA, IN UNA FRASE

La sidebar di ELABORA smette di elencare i documenti e elenca i **progetti** (come
INSEGNA); i documenti passano nell'area come **tabelle per genere** — le stesse di
INSEGNA — e il flusso diventa una macchina a tre stati: **tabelle → anteprima → editor**,
con ESC che sfoglia gli strati all'indietro e si ferma DENTRO la console.

Perché: oggi la colonna a sette gruppi tronca i nomi (tre `Foglio-nodi-…` si distinguono
solo dalla coda che non si vede), «guardare» e «correggere» sono due meccaniche diverse a
seconda del genere, e il doppio registro (archivio in localStorage + file su disco) mostra
due righe per la stessa sintesi senza dire quale serve.

## 2. LE DECISIONI PRESE (non ridiscutere senza Giacomo)

| # | decisione | motivo |
|---|---|---|
| D1 | Sidebar a **un piano: i progetti**. Le briciole filtrano *quali* progetti (classe, materia), **non** *quale* — quello lo sceglie la sidebar | due comandi per lo stesso gesto divergono al primo ritocco |
| D2 | La **FONTE è la prima tabella** («Testo», «PDF 1», «PDF 2»); i suoi comandi (`EL().sourceActions()`) vivono nella toolbar dell'anteprima | un gesto solo per tutto, nessuna seconda meccanica |
| D3 | L'anteprima delle voci d'**archivio si GENERA dai builder** (`buildQuizSetHtml`, `buildFlashcardSetHtml`, foglio nodi, sintesi `buildPrintHtml`) — esistono già headless | metà delle righe non sono file; e se le due nature mostrano la stessa cosa, il doppio registro si fonde in **una riga con due azioni** |
| D4 | «**Modifica**» solo dove c'è una sorgente (set d'archivio, sintesi editabile, foglio nodi, catena). Un PDF su disco è un file finito | un bottone che non può riuscire è peggio di un bottone che manca |
| D5 | Entrando in modifica, i comandi dell'anteprima **spariscono** (non si impilano) | «Stampa» durante l'editing stamperebbe il file vecchio senza dirlo |
| D6 | ESC: editor → anteprima → tabelle → **niente** (si resta nella console; dalla sezione si esce dal percorso in alto) | «ESC non deve diventare un tasto che fa perdere del lavoro» (Giacomo, 10/8) |
| D7 | Il costo accettato: cambiare documento va da 1 clic a 2 (Esci → scegli) | comprato con nomi interi, tipo e data al posto di nomi troncati |
| D8 | La copia con la voce (`Sintesi-voce-*`) **non entra** in ELABORA — filtro già attivo a monte in `_caricaDisco` | è un prodotto finito da 8 MB, si consegna e non si corregge |

**✅ CONFERMATO da Giacomo (11/8)**: dall'editor si torna all'**anteprima** dello stesso
documento (rinfrescata), e un secondo ESC porta alle tabelle. Confermato anche che
l'anteprima dei set esce **con le soluzioni** — e con essa il **PDF** scritto nel vault
(era l'unico punto in cui editor e pipeline non erano d'accordo: vedi handoff).

## 3. LA MACCHINA A STATI

```
   ┌─────────────────────────────────────────────────────────────┐
   │  CONSOLE ELABORA (briciole: Elabora › 4R › Geografia › …)   │
   │                                                             │
   │  sidebar: PROGETTI          area:                           │
   │  ┌──────────────┐   S1 TABELLE   fonte · quiz · flash ·     │
   │  │ ○ Il Clima   │               fogli · sintesi · catene ·  │
   │  │ ● I Cromosomi│               altri  (+ riga «Crea nuovo»)│
   │  │ ○ Présent    │        │ clic su riga                     │
   │  └──────────────┘        ▼                                  │
   │                  S2 ANTEPRIMA   documento + toolbar:        │
   │                                 [Modifica] [Stampa] [HTML*] │
   │                                 [Finder] [Esci]      *sintesi│
   │                          │ Modifica                         │
   │                          ▼                                  │
   │                  S3 EDITOR      toolbar di editing +        │
   │                                 [Esci / Salva ed Esci]      │
   └─────────────────────────────────────────────────────────────┘
   ESC:  S3 → (chiediSalvataggio se sporco) → S2 → S1 → nulla
```

Lo stato vive in DUE variabili di modulo (mai dentro `open()` — trappola già pagata:
`_mappe is not defined` silenzioso):
- `_prog` — id del progetto scelto in sidebar (null = nessuno);
- `_doc` — il documento aperto (`null` = S1; `{id, natura}` = S2; `+ editing:true` = S3).

⚠️ **`_voce` oggi fa entrambi i mestieri** (`'src:text'`, `'disk:…'`, `'synfile:…'`,
`'vuoto:'`). Va SOSTITUITA, non riusata: tenere il nome con una semantica nuova è il modo
migliore di rompere in silenzio i punti che la leggono (censiti: `_nav`, `_schema`,
`_eFonte`, il gestore `__esc`, `_vociDisco` con la coppia `disk:`/`synfile:`).

## 4. IL CONTRATTO DELLA LISTA MATERIALI

Le tabelle sono già esportate: `MappAITeach.tabelleMateriali(lista, conMappa, dove)`
(+ `filtraSintesi`). ELABORA passa `dove:'elabora'`. La **forma** di ogni voce:

```js
{ id: 'disk:<relPath>' | 'set:<setId>' | 'src:text' | 'src:pdf:<i>',
  titolo: 'Sintesi-Il Clima.html',
  tipo:   'Sintesi' | 'Quiz MC' | …,     // da MappAITeach.generePerFile(nome)
  data:   <ms>,                           // mtime dal disco, o data del set
  archivio: bool,                         // true = set editabile (localStorage)
  voce: bool,                             // true = Sintesi-voce (mai qui, per D8)
  cls: '', disc: ''                       // vuoti in ELABORA: contesto già nelle briciole
                                          // → le colonne si spengono da sole (non variano)
}
```

⚠️ La fusione del doppio registro (D3) qui diventa concreta: quando un set d'archivio e un
file su disco sono **lo stesso documento** (stessa mappa, stesso genere, il file prodotto
da quel set), la lista deve emettere UNA voce con entrambe le nature
(`id` del set + `relPath` del file). Criterio di aggancio: il nome che `buildFileName`
produrrebbe per quel set — se sul disco c'è, sono la stessa cosa. Fallback: due voci
(com'è oggi), mai una voce sbagliata.

## 5. LE FASI — ognuna lascia l'app funzionante

**F0 ✅ (fatta, 10/8 sera)** — `tabelleMateriali` + `filtraSintesi` esportate da
landing-teach col parametro `dove`. Verificato: stessa chiamata, INSEGNA vede
`Sintesi-voce-X.html`, ELABORA vede `Sintesi-X.html`, gli altri generi identici.

**F1 ✅ (fatta, 10/8 notte)** — La lista unificata (`mappai-elabora-console.js`)
`_materiali()` compone nella forma del §4: fonte (`src:text` + `_pdf()`) + set
editabili (`_sets()`, tipo da `kindOfSet`+`isTrueFalse`) + `_disco` (già filtrato da
D8). Aggancio archivio↔disco: nomi attesi da `buildFileName` (forma nuova + variante
` -VERDE`), fusione solo senza ambiguità. Hook esportato:
`MappAIElaboraConsole.materiali()`. Verificata eseguendo i moduli veri in Node (`vm`),
16/16 — dettagli nell'handoff, «🔨 IL PROSSIMO LAVORO».

**F2 ✅ (fatta, 10/8 notte)** — Il flag e lo scheletro (`mappai_elabora_v2`, default OFF)
`_schema()` biforca in `_schemaV2()`: sidebar = progetti (voci `prog:<id>` da `_mappe`,
intestazione non collassabile, riga `vuoto:prog` quando l'elenco manca — il validatore
pretende almeno una voce, e ha ragione); area = S1 con la FONTE come prima tabella
(costruita qui, D2) + `tabelleMateriali(resto, false, 'elabora')` su `_materiali()`.
Clic su progetto → `_conSalvataggio` → `_cambiaMappa` (la stessa strada della briciola).
`_prog`/`_doc` dichiarati nel modulo, azzerati in `dopo()`/`open()`/chiusura.
«Crea nuovo» rinviato a F3 (senza tela aprirebbe un editor rotto). `validaSchema`: 0/0
su entrambi gli stati. Dettagli e «da provare in Electron» nell'handoff.

**F3 ✅ + F4 ✅ (fatte insieme, 10/8 notte — si intrecciano negli stessi gestori;
provate in Electron via CDP su «11 Sistema Terra», 0 errori)**
Righe → S2 (`_apriDocV2`); disk = `_montaFile` con `opts` nuove (Esci · Modifica-per-set-fuso
· `dopoModifica`); set non fuso = `_montaAnteprimaSet` dal builder headless (quiz CON
soluzioni: è la revisione del docente); fonte = `mountSource` + `sourceActions` + esci-doc;
set FUSO si mostra dal FILE e «Modifica» apre il SET (D4). S3 via `_apriEditorSet` /
`dopoModifica` (sintesi) / «Crea nuovo» (natura `crea`, S3 diretto, ritorno a S1);
uscita → `_tornaAnteprima` (S2 RIGENERATA — assunzione «si torna all'anteprima» da
confermare con Giacomo). ESC: scala completa. Cestino righe = `confirmDeleteText`
(esportata da MappAITeach) + `deleteVaultFile` + bus; «Finder» di riga sempre sul vault
ATTIVO (la cache di INSEGNA è per relPath, non per vault). Spec originale qui sotto.

**F3 — S2, l'anteprima** (il pezzo più grosso)
Clic su riga → `_doc = {id, natura}` → l'area monta il documento + la toolbar:
- file su disco → il percorso iframe **già scritto** (barra `.de-bar`, `srcdoc`,
  `scalaTesto`, `snellisciInIframe`, chip TTS, stampa con nome via `stampaIframe(fr, nome)`);
- voce d'archivio → **builder headless** (D3): quiz/flashcard da `buildQuizSetHtml`/
  `buildFlashcardSetHtml`, sintesi da `buildPrintHtml(data)`, foglio nodi dal suo builder;
  il risultato entra nello stesso iframe. Nessun visore nuovo;
- fonte (D2) → `MappAIElabora.mountSource` in `#ec-src` (già esiste), con
  `sourceActions()` nella toolbar.
Toolbar: Modifica (solo se D4) · Stampa · HTML (solo sintesi, riusa `_scaricaHtml`) ·
Finder · Esci. Il caso «PDF orfano» (D4): niente Modifica + tooltip che dice perché.

**F4 — S3, l'editor**
«Modifica» → il percorso **già scritto**: `_montaEditor` / `openSynthesisFromVault` /
`DEd().open(...)` per i set. La toolbar dell'anteprima si smonta (D5). L'uscita a due
stati esiste già negli editor (9/8). Al ritorno → S2 rinfrescata.
⚠️ Il guardiano su `Sintesi-voce` è già in `openSynthesisFromVault`: non toglierlo.

**F5 — ESC e briciole**
`__esc` con la scala del §3 (`return false` SUBITO, la domanda di salvataggio è
asincrona — trappola del 9/8). Briciole: filtrano `_mappe` per classe/materia (D1);
cambiare contesto azzera `_prog` e `_doc` col meccanismo `_contestoCambiato` che c'è già.

**F6 — Il conteggio e lo switch**
I quattro gesti, prima/dopo: correggi una sintesi · stampa un quiz · file per una mail ·
cambia documento. Se i numeri reggono → flag ON di default, il vecchio percorso resta
per una sessione di sicurezza, poi si pota.

## 6. CHE COSA SI RIUSA (non riscrivere)

| pezzo | dove sta | stato |
|---|---|---|
| tabelle per genere | `MappAITeach.tabelleMateriali` | ✅ esportata |
| filtro delle due sintesi | `MappAITeach.filtraSintesi` + `_caricaDisco` (D8) | ✅ attivi |
| elenco progetti del contesto | `MappAITeach.mappeDelContesto` / `mappaCorrente` | ✅ esportate |
| anteprima file su disco | iframe + `.de-bar` in elabora-console (~r.640) | ✅ scritto |
| taglia/margini documenti vecchi | `MappAIDocBar.scalaTesto` / `scalaTestoInHtml` | ✅ verificati su PDF |
| barra snella (audio incorporato) | `MappAIDocBar.snellisciInIframe` | ✅ scritto |
| download con voce | `_scaricaHtml` in elabora-console | ✅ scritto |
| builder headless | `buildQuizSetHtml` · `buildFlashcardSetHtml` · `buildPrintHtml` · foglio nodi | ✅ esistono (pipeline li usa) |
| editor + uscita a due stati | `MappAIDocEditor` (`open`, `openSynthesisFromVault`, `hasUnsaved`, `salvaConNome`) | ✅ in produzione |
| domanda di salvataggio | `MappAIModal.chiediSalvataggio` | ✅ in produzione |
| fonte nella tela | `MappAIElabora.mountSource` + `sourceActions` | ✅ scritto (8/8) |

## 7. TRAPPOLE NOTE CHE QUESTO LAVORO INCROCIA

1. Variabili di stato **nel modulo**, mai dentro `open()` (il difetto `_mappe is not
   defined` non dava errori a schermo: la console smetteva di aggiornarsi).
2. `__esc`: `return false` **subito**, mai dopo un `await` (o la console si chiude sotto
   la domanda di salvataggio).
3. `tabelle` + `tela` insieme = stato incoerente. Alternativi, sempre.
4. Le risposte asincrone di un contesto **abbandonato** si lasciano cadere
   (`_discoVault !== vp` è il pattern già in uso).
5. Il ridisegno ricostruisce il box: tutto ciò che è montato a mano (percorso in testata)
   va rimesso **a ogni** `rifai()` — è già così per `montaPercorso`.
6. `z-index`: qualunque finestra sopra la console chiede `MappAIModal.prossimoZ()`, mai un
   numero fisso.
7. Icone: `safeCreateIcons()` è l'hub globale — dentro pezzi ridisegnati spesso, SVG in
   linea (precedente: il loop del 3/8 sulla tabella file).
8. Apici inversi nei commenti dentro template literal: **`node --check` non basta** — il
   file può parsare e produrre spazzatura (pagato di nuovo il 10/8 sera: `body is not
   defined` a runtime con parse pulito). Dopo ogni tocco a quei template: eseguire, non
   solo parsare.
9. Nel pannello browser gli IPC non esistono: le fasi F1-F5 si provano con
   `MappAIElaboraConsole.schema()` + dati finti, la verità si misura in Electron via CDP
   (helper in `scratchpad/cdp.js`, lancio con `--remote-debugging-port=9222`, chiusura
   SOLO per PID).

## 8. COSA NON ENTRA IN QUESTO LAVORO (ma ci si appoggia dopo)

- Il bottone «HTML» a 4 passi con generazione voce in background + **Clona** (deciso, vive
  nell'handoff, sezione «decisioni del 10/8»).
- La pipeline in sottofondo coi dati congelati.
- «Genera tutto per default» + Domande aperte.
- La migrazione del doppio registro alla forma «il disco è l'unico registro»: la fusione
  del §4 è il ponte, non la soluzione finale.
