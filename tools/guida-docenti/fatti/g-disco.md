# G — IL DISCO: che cosa il docente trova nel Finder

> Fatti letti dal codice (commit `e35db8f`, 22/8/2026) e dal laboratorio
> `~/Claude/MappAI - guida docenti/lab/casa/MappAI - file/`. Ogni riga porta `file:riga`.
> Dove non ho trovato un'etichetta, scrivo «NON TROVATA». Le righe dei file sono quelle di oggi.

## 0. Il quadro in una frase

Tutto ciò che MappAI scrive sta in **una cartella normale del disco**, `MappAI - file`, di
default dentro `Documenti` (main.js:230-233 `mappaiRootDir`; il nome `'MappAI - file'` è
`FilesCore.ROOT_FOLDER`, public/js/mappai-files-core.js:23). Non c'è un account, non c'è un
server MappAI, non c'è sincronizzazione (testo della Cabina › Privacy, mappai-cabina.js:479).
`localStorage` (il «cassetto» interno dell'app) è solo un **indice** con una copia di lavoro:
se sparisce, le mappe si riaprono dal disco (GUIDA-ARCHITETTO.md:102-107, invariante 7).

## 1. L'albero completo di «MappAI - file»

Le sei sottocartelle create dal setup sono `FilesCore.SUB` (mappai-files-core.js:24-35);
`files-setup` le crea tutte (main.js:3336). Due cartelle in più nascono **alla prima
scrittura** e non sono in `SUB`: `Diagnostica` (main.js:2773-2777) e `Registro consumi AI`
(main.js:2626-2630). `migrazione-log.json` compare nella radice solo se si è scelto di
spostare i dati storici (main.js:3361).

```
MappAI - file/                               ← FilesCore.ROOT_FOLDER (files-core.js:23)
├── Mappe/                                   ← SUB.maps (files-core.js:25) — le mappe («vault»)
│   ├── <classe>/<materia>/<mappa>/          ← files-core.js:162-167 mapVaultParents
│   ├── <classe>/<mappa>/                    ← classe senza disciplina (files-core.js:127-130)
│   ├── Generico/<mappa>/                    ← senza classe; nome RISERVATO (files-core.js:142-149)
│   ├── <mappa>/                             ← vault «piatti» di prima del 15/8: ancora letti (main.js:3040-3043)
│   ├── Chat/ · Quiz e Flashcard/ · Studio Attivo/   ← contenitori storici se nessuna mappa aperta (files-core.js:225; main.js:1273,1303,1328)
│   └── mm_<titolo>.json / kg_<titolo>.json  ← export JSON (main.js:828-833)
├── Allievi/<nome>/                          ← SUB.students (files-core.js:34)
│   ├── Mappe/<mappa>/                       ← le mappe fatte con un allievo attivo (files-core.js:177-181; main.js:2601)
│   └── credenziali-<nome>.pdf               ← mappai-live-classes.js:1043-1046
├── Classi/                                  ← SUB.classes (files-core.js:29)
│   ├── classi.json                          ← registro delle classi, schema mappai-classes@1 (main.js:2347, 2553-2558)
│   └── <classe>/credenziali-<classe>.pdf    ← mappai-live-classes.js:1016-1021
├── Attività di studio/<classe>/<AAAA-MM-GG · Attività · Mappa[ — ramo]> · NN/   ← files-core.js:236-246; main.js:2360-2392
│   ├── session.json · results.json · students/<id>.json
│   └── report-domande.html · report-studenti.html · report-costruzione.html · report-scelta.html   ← live-server.js:10-15, 312-371
├── File condivisi/                          ← SUB.shared (files-core.js:28) — PENSIONATA il 13/8, nessuno ci scrive più (main.js:2530-2542)
├── Giardini/<slug-sessione>/                ← SUB.gardens (files-core.js:30); Knowledge Garden (main.js:2088, 2146)
├── Diagnostica/                             ← main.js:2773-2777
│   ├── errori.jsonl · errori-precedenti.jsonl   ← main.js:2778-2797
│   └── sessione-aperta.json                 ← main.js:2834-2851
├── Registro consumi AI/consumi-ai.jsonl     ← main.js:2626-2631
└── migrazione-log.json                      ← solo dopo una migrazione (main.js:3361)
```

**Laboratorio (vero, 22/8):** `MappAI - file/` contiene `Classi/classi.json`,
`Diagnostica/sessione-aperta.json`, `Mappe/4R/Scienze/Elettricità - MM/`,
`Mappe/4R/Storia/grind this heels/`. La classe 4R ha `sede: ""`, quindi la cartella si chiama
solo `4R`: con una sede sarebbe `<sede>-4R` (`mapClassFolder`, files-core.js:82-90).

### Prima del setup: le cartelle «storiche»
Finché `filesOrganized` non è `true` in `<userData>/mappai-settings.json` (main.js:225-228),
l'app scrive nelle cartelle separate dentro `Documenti`: `MappAI - Vault`, `MappAI - Materiali
docente`, `MappAI - Classi`, `MappAI - Knowledge Garden`, `MappAI - Allievi` (main.js:237-245),
`MappAI - Live/Tutor/Lavagna` (main.js:3380-3384), `MappAI - Consumi AI` (main.js:2629),
`MappAI - Diagnostica` (main.js:2776). **Adozione automatica:** se `Documenti/MappAI - file`
esiste ed è «abitata» (almeno una sottocartella di `SUB`), al boot l'app la adotta da sé e
scrive il flag (main.js:275-290 `adottaRootEsistente`). Cerca SOLO in Documenti.

### Dove stanno le impostazioni (non è roba del docente)
`<userData>/mappai-settings.json` con `filesRoot` e `filesOrganized` (main.js:206-222). In
sviluppo (`npm start`) `userData` ha una sottocartella `dev/` (main.js:160-163): per questo
l'app di Giacomo e quella installata hanno impostazioni diverse. Lì vivono anche
`visione-tmp/` (immagini ridotte, cancellate subito — GUIDA-ARCHITETTO.md:254),
`tts-cache/` (clip della voce, main.js:2669-2676) e `MappAI-Pipeline/` (artefatti
intermedi, main.js:838-853). Nessuna di queste va nel Finder del docente.

## 2. Dentro una mappa («vault»): il contratto della cartella

Scrittura: `save-vault` (main.js:1398-1705). Lettura: `load-vault` (main.js:1733-1850).
Esempio vero: `Mappe/4R/Scienze/Elettricità - MM/`.

| file / cartella | che cos'è | chi lo scrive |
|---|---|---|
| `index.yaml` | la carta d'identità: `extractionMode`, `rootNodeLabel`, `dossier`, `classe`, `materia`, `userProfile`, `customColors`, `generationUsage`, `lastUpdated` | main.js:1405-1423 (js-yaml) |
| `links.json` | i collegamenti `{source, target, rel, isCross}` | main.js:1446-1460 |
| `Nodi/*.md` | un file per concetto, Markdown con frontmatter YAML | main.js:1496-1613 |
| `Allegati/` | le immagini dei nodi, copiate dentro | main.js:1551-1585 |
| `vista.json` | Vista studio, focus/lenti, timeline, foglio dei nodi (schema `mappai-vista@1`) | main.js:1432-1442; contenuto da mappai-vista-core.js:41-54 |
| `fonti_e_link.txt` | indice dei link esterni dei nodi («Nessun link esterno trovato.» se vuoto) | main.js:1619-1624 |
| `chat_state.json` | stato del tutor AI (cronologia sidebar + per nodo) | main.js:1627-1629 |
| `Materiale Studio/` | PDF/HTML generati + `set-<id>.json` (quiz/flashcard giocabili) | main.js:1652-1674; PDF via `save-vault-file` main.js:942-962 |
| `Fonti/` | i PDF originali, il testo estratto `.txt`, `fonti.json` (schema `mappai-fonti@1`) | mappai-elabora.js:1563-1580, 1700-1716, 1664 |
| `Chat/` | trascrizioni del tutor: `<Mappa>_<sidebar|nodo_X>_<GG-MM-AAAA>.txt`, in append | main.js:1266-1293; mappai-ai-tutor.js:141-157 |
| `Studio Attivo/` | `storico_score.md` + `sessioni.jsonl` (+ `mastery.json`) | main.js:1322-1345, 1634-1638 |
| `pipeline.json` | stato della generazione materiali (schema `mappai-pipeline@1`, passi A-D) | file nel root ammesso da files-core.js:210 |
| `Quiz e Flashcard/` | `risposte_quiz_<titolo>_<timestamp>.txt`, `Report_Studio_*` | main.js:1297-1316; mappai-study-session.js:878-884 |
| `Nodi/_ponti/_bridges.json` | solo JIGSAW (ponti proposti dagli studenti) | main.js:1468-1474 |
| `Dialoghi NPC/` | solo Memory Dungeon (nascosto di default) | mappai-games.js:1850-1856 |

**Collisioni di nome.** Cartella della mappa già esistente nella stessa coppia
classe/materia → `« · 02»`, `« · 03»` (mappai-vault-io.js:177-182). Stesso schema in
`Fonti/` (mappai-elabora.js:1571-1572) e in `Materiale Studio/` (`nomeLibero`,
mappai-pipeline-core.js:529-541, fino a 99 varianti).

### Il formato di un nodo `.md` — esempio VERO

`Nodi/grandezze_elettriche_misura_L1_1.md` (laboratorio):

```markdown
---
id: "L1_1"
label: "Grandezze Elettriche Misura"
level: 1
group: 2
parent: "ROOT"
x: 126.41527732549048
y: 174.24542395610578
---

# Grandezze Elettriche Misura

Questa categoria si concentra sulle grandezze elettriche fondamentali e sui metodi per la loro misurazione. […]
```

- **Nome del file** = etichetta ripulita (solo lettere/cifre ASCII, il resto `_`, minuscolo)
  + `_` + id del nodo + `.md` (main.js:1497, 1516-1517). Per questo «Elettricità» diventa
  `elettricit__ROOT.md`: l'accento è sostituito da `_`.
- **Frontmatter** (main.js:1521-1540): sempre `id`, `label`, `level`, `group`; poi se esistono
  `parent`, `iconVisibility`, `hasCustomText`, `hasCustomImage`, `x`, `y`, `savedX`, `savedY`,
  `studyStatus`, `nextReview`, `lastReviewed`, `urls`, `images`.
- **Corpo**: `# <label>`, poi le immagini come `![[../Allegati/<file>]]` (main.js:1597-1600,
  sintassi Obsidian), poi la descrizione (`node.desc`), poi la sezione `## Fonti` con righe
  `- [Titolo | Sorgente]: testo` (main.js:1604-1612). Nell'esempio del laboratorio la sezione
  `## Fonti` NON c'è: i nodi di quella mappa non portano estratti.
- **Radice**: `elettricit__ROOT.md` ha `id: "ROOT"`, `level: 0`, `x: 0`, `y: 0`.
- **Nodi di approfondimento**: suffisso `_D1`, `_D2` nell'id (es. `analogia_idraulica_L1_0_L3_C2_D1.md`).
- Rilettura: il corpo dopo `# titolo` torna in `desc`, le righe `## Fonti` tornano negli
  estratti; la forma vecchia `- [Titolo]: testo` vale come sorgente «Originale»
  (main.js:1825-1849). Un `links.json` senza `rel` legge `"include"` (main.js:1783).

### `index.yaml` vero (laboratorio)
```yaml
extractionMode: mindmap
rootNodeLabel: Elettricità
dossier: false
classe: 4R
materia: Scienze
userProfile: { nickname: "", age: "", grade: "", system: Ticino }
customColors: { "2": "#f59e0b" }
generationUsage: { promptTokens: 129341, candidateTokens: 54916, totalTokens: 287024, usedModel: gemini-2.5-flash, usedProvider: google }
lastUpdated: "2026-08-21T08:46:41.104Z"
```
`classe`/`materia` sono una **dichiarazione** per chi riceve il vault da un collega; dove la
cartella esiste, comanda la cartella (mappai-vault-io.js:13-24; GUIDA-ARCHITETTO.md:252).

### Sottocartelle per ramo dentro `Nodi/` — NON di default
Il layout `Nodi/g<gruppo>_<ramo>/` esiste ma è gated da `localStorage
mappai_vault_branch_folders` o dall'export JIGSAW (public/js/preload.js:70-75;
main.js:1356-1372). Di default `Nodi/` è piatta (come nel laboratorio: 41 file, nessuna
sottocartella).

## 3. La convenzione dei NOMI dei materiali

Unica fonte: `buildFileName` in public/js/mappai-pipeline-core.js:487-517.

**Forma:** `<Tipo>-<Mappa>[-<dettaglio>][-<nome del docente>] - <Carattere>.<est>`
(pipeline-core.js:367-368, 392-399). I pezzi sono uniti dal solo trattino; il carattere è in
coda separato da « - » (spazio-trattino-spazio) «perché si legga come un'etichetta» (509-516).

**I tipi** (`GENERI`, pipeline-core.js:413-460): `Analisi-fonte`, `Quiz-MC`, `Quiz-VF`,
`Flashcard`, `Foglio-nodi` (+dettaglio = layout), `Sintesi` (.html, +dettaglio = ramo),
`Sintesi-voce` (.html con MP3 dentro), `Domande-aperte`, `Catena-dei-perche` (senza accento,
apposta: «finisce su chiavette»), `Dossier` (+dettaglio = nodo/ramo), `Sintesi-audio` (.mp3),
e la mappa esportata `MM-`/`KG-` (`buildMapExportName`, 524-532).

**Il carattere nel nome** (18/8): l'etichetta arriva da `setFontEtichetta` quando il docente
sceglie il carattere in Cabina › Aspetto e leggibilità (mappai-font.js:366-373). Etichette
possibili: `Space Mono`, `TM Sans`, `TM Alt`, `Atkinson Hyperlegible` (mappai-font-core.js:81,
108, 125, 141). ⚠️ **Oggi il nome è « - TM Sans», NON « - TestMe Sans»**: il carattere che
l'app spedisce è una versione modificata e la licenza OFL vieta il nome riservato
(mappai-font-core.js:100-107). I file « - TestMe Sans» nel laboratorio sono del 19-21/8,
prima della rinomina; `grind this heels` (21/8) ha già «Analisi-fonte-grind this heels - TM
Sans.pdf». Conseguenza voluta: due generazioni in caratteri diversi **restano affiancate**,
non si sovrascrivono (pipeline-core.js:400-402).

**Il marcatore ` -VERDE`** (taratura per la classe inclusiva): dal 10/8 **non si produce più**
(pipeline-core.js:474-486): la taratura si applica da sé dal contesto, quindi non c'è nulla da
distinguere. I file già sul disco lo portano (`Quiz-MC-Elettricità -VERDE.pdf` in
`pipeline.json` del laboratorio) e chi li rilegge lo riconosce ancora. Una sola grafia
ammessa, ` -VERDE` (pipeline-core.js:387-390): `-[VERDE]` e ` [VERDE]` erano errori vecchi.

**La mappa esportata** (`_studyMapPdfName`, public/js/mappai-d3-render.js:1276-1320):
`MM-<Mappa>[ - <Carattere>]-<grado>-NN.pdf|svg|png`. Il grado viene dalla classe attiva
(`c.grade`, es. `4ª`); `NN` è il progressivo dei PDF della stessa mappa già in archivio.
Laboratorio: `MM-Elettricità - TestMe Sans-4ª-00.pdf` … `-03.pdf`, `MM-Elettricità-4ª-00.pdf`
(Space Mono? no: vedi dubbi), `MM-Elettricità-00.pdf` (senza classe attiva).

**I set giocabili**: `set-<id>.json`, il nome è l'`id` e non il titolo, così rinominare il
progetto non lascia orfani (`nomeFileSet`, files-core.js:387-390). Ogni file dichiara la sua
mappa (`_mappa`, main.js:1656) e al caricamento i file di un'altra mappa si scartano
(files-core.js:402-411).

**Le credenziali**: `Classi/<classe>/credenziali-<classe>.pdf` si riscrive da sé a ogni
salvataggio della classe (mappai-live-classes.js:1005-1021); la tessera singola va in
`Allievi/<nome>/credenziali-<nome>.pdf` (1034-1047). Toast: «Foglio credenziali salvato in
Classi/<classe>» · «Tessera salvata in Allievi/<nome>» (1024, 1050).

**Le sessioni in classe**: `Attività di studio/<Classe>/<AAAA-MM-GG · Attività · Mappa>[ — ramo] · NN`
(`sessionFolderName`, files-core.js:236-241; suffisso progressivo `· 00`, `· 01` per più
somministrazioni lo stesso giorno, main.js:2373-2392). Attività leggibili: `Quiz`,
`Vero-Falso`, `Domande`, `Tutor AI`, `Lavagna`, `Timeline`, `Materiali`, `Studio attivo`
(files-core.js:228-235). Classe assente → `Senza classe` (files-core.js:75-77).

**Le chat del tutor**: `Chat/<Mappa>_<sidebar|nodo_<etichetta>>_<GG-MM-AAAA>.txt`, spazi →
`_`, in append con intestazione `RIFERIMENTO MAPPA / DOCUMENTO / DATA` (main.js:1280-1290).
⚠️ «Mappa» qui è l'etichetta del PRIMO nodo (mappai-ai-tutor.js:143-145): nel laboratorio il
file si chiama `Analogia_idraulica_sidebar_31-07-2026.txt` perché quel giorno il primo nodo
era «Analogia idraulica».

## 4. Etichette ESATTE a schermo (quest'area)

### Cabina › Profilo insegnante › sezione «Gestione cartelle» (mappai-cabina.js:535-589, montata a 953)
Si apre dal bottone `#btn-cabina` in alto a destra, `aria-label="Cabina"`, tooltip
«Cabina — profilo, AI, consumi, guida» (public/index.html:620-622); la voce di menu è
«Profilo insegnante» (mappai-cabina.js `VOCI`, prima voce).

| etichetta | dove | file:riga |
|---|---|---|
| «Gestione cartelle» | titolo sezione `#pr-cartelle` | mappai-cabina.js:543 |
| «Cerco la cartella…» | stato in lettura | :548 |
| «I file di MappAI si gestiscono dall’app installata: qui, nel browser, non c’è un disco da mostrare.» | fuori da Electron | :545 |
| «I documenti che MappAI produce sono sparsi in più cartelle dentro Documenti. Puoi raccoglierli in una sola — «MappAI - file» — nella posizione che scegli tu: quelli che ci sono già vengono spostati, non copiati.» | non ancora organizzato | :550 |
| «Scegli la posizione» | bottone primario (non organizzato) | :551 |
| «Tutto quello che MappAI scrive — mappe e vault, materiali, sessioni delle attività, profili, registri — vive in questa cartella sul tuo computer. È una cartella normale: puoi aprirla, copiarla su un disco esterno, metterla in un backup.» | testo (organizzato) | :554 |
| «Cartella» → percorso · «Dentro» → `Mappe · Attività di studio · File condivisi · Classi · Giardini · Allievi · Diagnostica` | righe dati (la lista viene da `FilesCore.SUB` + «Diagnostica») | :555-558, 517-521 |
| «Spazio di lavoro» → «N MB · X% dello spazio disponibile[ — LIVELLO] · K copie vecchie dei progetti (M MB)» oppure «… · nessuna copia in eccesso» | riga dati | :570-586 |
| «Apri la cartella» (primario, icona folder-open) · «Cambia posizione» (folder-cog) · «Libera spazio» (solo se ci sono copie vecchie) | azioni | :580-586 |
| conferma «Libera spazio»: «Di ogni mappa resta la copia più recente — quella che l’app apre. Le copie più vecchie non sono raggiungibili da nessuna schermata, e le mappe su disco non vengono toccate.» + «Vanno via N copie vecchie dei progetti (M MB): <prime 5 mappe> · +X altre mappe» | modale conferma | :1343-1360 |
| toast «Spazio liberato: N MB (K)» | dopo la potatura | :1365 |
| toast «Disponibile solo nell’app installata.» | fuori da Electron | :1326, 1339 |

### Finestra «Cartella documenti» (public/js/mappai-files-settings.js, si apre da «Cambia posizione»)
| etichetta | file:riga |
|---|---|
| titolo «Cartella documenti», × con `aria-label="Chiudi"` | :110, :31 |
| «Tutti i documenti di MappAI sono organizzati in una cartella sola:» + percorso | :97 |
| «Apri la cartella» · «Cambia posizione» | :100-101 |
| «Struttura: Mappe · Attività di studio · File condivisi · Classi · Giardini.» ⚠️ lista FERMA: mancano Allievi, Diagnostica, Registro consumi AI | :102 |
| (non organizzato) «Scegli dove MappAI deve raccogliere TUTTI i documenti che produce (mappe, report delle attività, file condivisi, classi) in una sola cartella "MappAI - file".» · «Oggi sono sparsi in più cartelle dentro Documenti. Finché non scegli, nulla cambia.» · «Scegli la posizione» | :105-108 |
| dialogo di sistema: «Scegli dove creare la cartella "MappAI - file"» | main.js:3274 |
| conferma «Organizza i file di MappAI»: «Creerò la cartella **MappAI - file** in:» + percorso · «Sposto i dati esistenti» + elenco `MappAI - Vault → Mappe (N)` · spunta «Sposta ora i dati esistenti nella nuova cartella» · «Se apri il Vault in Obsidian, dopo lo spostamento riaprilo da MappAI - file/Mappe.» · «Nessun dato storico da spostare.» · «Annulla» · «Crea e organizza» · «Sto organizzando…» · «spostati» | :50-83 |
| primo avvio (una volta per installazione, 1,5 s dopo il caricamento, chiave `mappai_files_prompted`): «Organizza i documenti di MappAI» · «Vuoi che MappAI raccolga tutti i suoi documenti (mappe, report, file condivisi, classi) in una sola cartella a tua scelta? Potrai spostare anche quelli già esistenti.» · «Più tardi» · «Scegli la posizione» | :15, :118-146 |
| toast «Disponibile solo nell'app desktop.» | :92 |

### INSEGNA / ELABORA — i bottoni-icona sulle righe (public/js/mappai-landing-teach.js)
| etichetta (tooltip `title`) | gesto | file:riga |
|---|---|---|
| «Apri nel Finder» (icona folder) | apre la cartella della mappa | :261, :476, :997, :1148 |
| «Nessuna cartella vault su disco» (icona disabilitata) | quando il progetto non ha cartella | :476, :1148, :1163 |
| «Apri la cartella documenti» | apre `Mappe/` | :1282, :1410 |
| «Elimina» (icona trash-2) | → conferma a digitazione | :262, :477, :998 |
| «Conferma eliminazione» · «Per eliminare scrivi qui sotto il nome esatto:» “<nome>” · bottone «Elimina» (distruttivo) | modale | :765-780 |
| toast «Il testo non corrisponde: eliminazione annullata.» | nome sbagliato | :772 |
| toast «Cartella spostata nel Cestino.» · «Impossibile eliminare la cartella.» | esito | :301-303 |
| toast «Spostato nel Cestino.» · «Non è stato possibile eliminare il file» | singolo materiale | :608-611 |

### La mappa aperta — menu «Graph manager» (public/index.html:1478; public/js/mappai-menu-hubs.js:275-304)
| etichetta | tooltip | file:riga |
|---|---|---|
| «Graph manager» | «Salva, apri, importa ed esporta la mappa» | index.html:1478-1479 |
| «Esporta nel Vault» | «Salva la mappa come vault Markdown (cartella compatibile Obsidian).» | menu-hubs.js:280 |
| «Importa dal Vault» | «Riapre una mappa salvata come vault Markdown.» | :282 |
| dialogo di sistema «Seleziona la cartella del Vault (Second Brain)» | | main.js:3168 |
| overlay «Esportazione Vault in corso...» · toast «Vault creato e collegato!» · alert «Nessuna mappa da esportare.» | | mappai-vault-io.js:82, 117, 76 |
| bottone `#sync-vault-btn` «Sincronizza Vault», tooltip «Sincronizza modifiche nel Vault» (appare dopo il primo salvataggio) | | index.html:1483-1485 |
| «Cartella Salvataggi» (`save_folder`) | | it_translations.js:25 |

### Altri «apri la cartella»
- Cabina › Consumi AI: bottone-icona «Apri la cartella del registro su disco» (mappai-cabina.js:907).
- Cabina › Privacy: «Apri la cartella dei consumi» (:502); testi «Dove vivono i dati», «Cancellare»: «Le cartelle sono file normali: si eliminano dal Finder e spariscono davvero.» (:477-502).
- Cabina › Segnalazione: «Errori registrati», «Copia gli ultimi errori», «Apri Diagnostica», «Svuota il registro» + conferma «Cancella le righe degli errori registrati su questo computer. Non si torna indietro…» (:718-727, 1395-1402).
- INSEGNA › Attività: «Apri nel Finder» sulla riga di una sessione (landing-teach.js:1536).

## 5. Gesti → che cosa succede (e che cosa finisce su disco)

| gesto | funzione | effetto visibile | su disco / localStorage |
|---|---|---|---|
| fine di una generazione | `ensureProjectVault({reason:'generation'})` app.js:1879-1884 → mappai-vault-io.js:141-232 | toast «Generazione completata!…»; la mappa compare negli elenchi col bollino NUOVO | crea `Mappe/<classe>/<materia>/<titolo>/` (o `Generico/`, o `Allievi/<nome>/Mappe/`) e scrive l'intero vault (`save-vault`); poi `saveCurrentProject` → `localStorage` |
| tasto HOME | mappai-ui-canvas.js:296-309 | torna alla landing | riscrive lo snapshot e il vault (attesa max **4 s**), poi ricarica |
| ⌘Q / chiusura app | main.js:2865-2881 `before-quit` → storage-lang.js:1000-1013 | l'app si chiude | salva snapshot + vault; il main aspetta al massimo **3 s**; toglie `Diagnostica/sessione-aperta.json` (main.js:2852-2856) |
| ogni 2 minuti | storage-lang.js:656-665 `setInterval(…,120000)` | niente | solo `localStorage` (indice `tutor_ai_projects` + snapshot per id, :184-185); **non** mentre si genera |
| «Esporta nel Vault» | `saveMapVault` vault-io.js:75-133 | dialogo cartella → overlay → toast «Vault creato e collegato!» | scrive il vault nella cartella scelta (anche FUORI da Mappe); travasa i PDF in `Fonti/` |
| «Sincronizza Vault» | stesso `saveMapVault` (index.html:1483) | idem | idem, sul vault collegato |
| «Importa dal Vault» | `loadMapVault` vault-io.js:294 → `load-vault` main.js:1733 | la mappa si apre | legge `index.yaml`, `links.json`, `Nodi/`, `chat_state.json`, `vista.json`; azzera i residui della mappa precedente |
| «Genera materiali» (pipeline) | `save-vault-file` main.js:942-962 | i file compaiono in ELABORA/INSEGNA | `Materiale Studio/<Tipo>-<Mappa>… - <Carattere>.pdf|html`, `pipeline.json` nel root |
| salva una classe | mappai-live-classes.js:1005-1021 | toast «Foglio credenziali salvato in Classi/<classe>» | `Classi/classi.json` + `Classi/<classe>/credenziali-<classe>.pdf` |
| crea un profilo allievo | `student-folder-ensure` main.js:2590-2603 | — | `Allievi/<nome>/Mappe/` (vuota) |
| avvia un'attività LIVE | main.js:2395+; live-server.js:180-188 | QR e dashboard | `Attività di studio/<classe>/<data · attività · mappa> · NN/session.json` (schema `mappai-live-session@1`: sessione, roster, conteggio domande, id studenti — i token delle identità **non** vanno a schermo, GUIDA-ARCHITETTO.md:258); a chiusura `results.json` + `report-*.html` |
| ogni chiamata AI | mappai-usage-tracker.js:47-65 → main.js:2632-2638 | Cabina › Consumi AI | una riga in `Registro consumi AI/consumi-ai.jsonl`: `ts, provider, model, inTok, outTok, cat, sub, project, projectId` — **mai i costi** (si calcolano a schermo) |
| un errore | main.js:2778-2797 | Cabina › Segnalazione | riga in `Diagnostica/errori.jsonl`; sopra 1 MB il file scala a `errori-precedenti.jsonl` |
| «Elimina» (INSEGNA/ELABORA) | `delete-vault` main.js:1117-1128 | conferma a digitazione → toast «Cartella spostata nel Cestino.» | `shell.trashItem` sulla cartella (solo sotto `Mappe/`) |
| «Elimina» su un materiale | `delete-vault-file` main.js:1004-1019 | toast «Spostato nel Cestino.» | `shell.trashItem` sul file |
| «Libera spazio» (Cabina) | mappai-cabina.js:1341-1369 | toast «Spazio liberato…» | solo `localStorage`: toglie le copie vecchie dei progetti; **il disco non si tocca** |
| «Scegli la posizione» / «Crea e organizza» | `files-setup` main.js:3329-3368 | conferma con anteprima | crea `MappAI - file` + 6 sottocartelle; se spuntato sposta le cartelle storiche (rename, mai sovrascrive: main.js:3317-3327); scrive `migrazione-log.json`; scrive il flag in `mappai-settings.json`; rimuove le cartelle storiche solo se vuote (:3355-3359) |
| «Apri la cartella» | `files-open-root` main.js:3373-3378 | si apre il Finder | crea la radice se manca |
| assegnare una classe a posteriori (ELABORA) | `vault-relocate` main.js:1135-1175 | la mappa cambia riga/classe | **sposta** la cartella della mappa sotto la nuova coppia classe/materia; collisione → `· 02`; le cartelle-genitore vuote spariscono |

## 6. Limiti numerici e default

- Salvataggio periodico in `localStorage`: **120 000 ms** (storage-lang.js:665). Attesa del vault all'uscita: **4 s** (HOME), **3 s** (⌘Q).
- Quota del cassetto `localStorage`: **~48 MB** (GUIDA-ARCHITETTO.md:261); la Cabina mostra MB e percentuale.
- `Diagnostica/errori.jsonl`: rotazione a **1 MB** (`ERR_MAX_BYTES`, main.js:2779).
- Collisioni di nome: suffisso `· 02` … `· 99` per i materiali (pipeline-core.js:538), `· 02`… per cartelle mappa e Fonti (10 tentativi, elabora.js:1571).
- Lettura di un file del vault via IPC: tetto **50 MB** (main.js:974).
- `pipeline.json` del laboratorio: passo B (quiz+flashcard) = **15 chiamate** (`"calls": 15`), `perBranch: 6`.
- Nome della cartella-mappa: `safeName` conserva spazi e accenti, toglie solo `/ \ : * ? " < > |` e punto/spazio finale (files-core.js:54-62); il titolo del progetto perde un'estensione riconosciuta (`.pdf`, `.docx`…: lista files-core.js:111-116).
- Segmento di ramo in `Nodi/` (solo con flag): 40 caratteri (main.js:1359).
- Formati attesi in `Fonti/`: PDF originale + `.txt` del testo (solo se > 40 caratteri, elabora.js:1709).

## 7. Percorso tipico del docente (storyboard)

1. Primo avvio → finestra «Organizza i documenti di MappAI» (files-settings.js:137) → clic «Scegli la posizione».
2. Dialogo di sistema «Scegli dove creare la cartella "MappAI - file"» → si sceglie `Documenti` → «Crea e organizza» nella conferma «Organizza i file di MappAI» (con l'elenco «Sposto i dati esistenti» se ci sono cartelle storiche).
3. Si genera una mappa (CREA) con la classe 4R e la materia Scienze attive → a fine generazione toast «Generazione completata!» e, su disco, `MappAI - file/Mappe/4R/Scienze/Elettricità/`.
4. Clic su `#btn-cabina` (tooltip «Cabina — profilo, AI, consumi, guida») → voce «Profilo insegnante» → in fondo la sezione «Gestione cartelle» con «Cartella», «Dentro», «Spazio di lavoro».
5. Clic «Apri la cartella» → il Finder mostra `MappAI - file` con `Mappe · Attività di studio · File condivisi · Classi · Giardini · Allievi · Diagnostica · Registro consumi AI`.
6. Nel Finder: `Mappe/4R/Scienze/Elettricità/` → `index.yaml`, `links.json`, `vista.json`, `Nodi/` (41 `.md`), `Materiale Studio/` (PDF e `set-*.json`), `Fonti/` (il PDF originale), `Chat/`, `Allegati/`.
7. Si apre un file di `Nodi/` con un editor di testo: frontmatter + `# Titolo` + descrizione (screenshot del `.md`).
8. In INSEGNA, sulla riga della mappa, l'icona cartella «Apri nel Finder» porta alla stessa cartella; l'icona «Elimina» apre «Conferma eliminazione» → si digita il nome esatto → «Cartella spostata nel Cestino.» → nel Cestino di macOS c'è la cartella intera.
9. Cabina › Segnalazione → «Apri Diagnostica» mostra `errori.jsonl` e `sessione-aperta.json`; Cabina › Consumi AI → icona «Apri la cartella del registro su disco» mostra `consumi-ai.jsonl`.
10. (Facoltativo) Cabina › Gestione cartelle › «Libera spazio» quando compare: conferma che racconta le prime 5 mappe e quante copie vanno via; toast «Spazio liberato: N MB».

## 8. Prerequisiti e stati

- **Serve l'app installata (Electron)**: nel browser la sezione dice «I file di MappAI si gestiscono dall’app installata…» (cabina.js:545) e i bottoni rispondono «Disponibile solo nell’app installata.» (:1326).
- **Non serve la chiave AI** per nulla di quest'area.
- **Classe attiva** decide la cartella della mappa nuova: senza classe → `Mappe/Generico/`; con allievo attivo → `Allievi/<nome>/Mappe/` (vault-io.js:158-184). La materia viene dalla scelta fatta al momento di generare (`appState.generationDiscipline`, vault-io.js:171).
- **Flag `filesOrganized`** (setup fatto o cartella adottata): senza, l'app scrive nelle cartelle storiche `MappAI - *` dentro Documenti; la sezione Gestione cartelle mostra il testo «sparsi in più cartelle» e solo «Scegli la posizione».
- **«Libera spazio»** compare solo se ci sono copie vecchie nel cassetto (cabina.js:584-586): «un bottone che non ha niente da fare non deve esserci».
- **«Sincronizza Vault»** compare solo dopo che la mappa è collegata a una cartella (vault-io.js:111-115).
- **Icona cartella disabilitata** con tooltip «Nessuna cartella vault su disco» per i progetti solo in localStorage (landing-teach.js:476, 1148).
- **Nel browser** il registro errori dice «copia in memoria del browser (fuori dall’app installata)» (cabina.js:760).
- **Kill-switch** `mappai_autovault = '0'` spegne la creazione automatica della cartella a fine generazione (vault-io.js:144); di default è acceso.

## 9. Obsidian

- Il vault è «compatibile Obsidian» (tooltip «Esporta nel Vault», menu-hubs.js:280; files-core.js:25). Aprendo `Mappe/4R/Scienze/Elettricità/` come vault di Obsidian si vedono: `Nodi/` con una nota per concetto (frontmatter YAML nelle «Properties», titolo `# …`, descrizione), le immagini incorporate come `![[../Allegati/file]]` (main.js:1597-1600), `Allegati/` e `Fonti/` con i PDF, `Materiale Studio/` con i PDF generati. `index.yaml`, `links.json`, `vista.json` sono file di servizio.
- ⚠️ **Nessun wikilink tra le note**: i collegamenti tra concetti stanno SOLO in `links.json`; nel grafo di Obsidian le note appaiono scollegate. Non ho trovato nel codice nessuna scrittura di `[[Nodo]]` fra note (grep `[[` in main.js restituisce solo l'embed delle immagini).
- **Che cosa NON toccare a mano:**
  - il **frontmatter** (`id`, `level`, `parent`, `group`): è ciò che l'app rilegge (main.js:1805-1820);
  - il **nome dei file** in `Nodi/`: al salvataggio successivo l'app rigenera il nome canonico e **cancella davvero** (`fs.unlinkSync`) ogni `.md` che non corrisponde a un nodo (main.js:1507-1513). Una nota aggiunta a mano in `Nodi/` sparirebbe al primo salvataggio;
  - `links.json` e `index.yaml`.
- **Che cosa si può modificare**: il testo della descrizione sotto `# Titolo` e le righe `- [Titolo | Sorgente]: …` sotto `## Fonti` tornano nell'app alla prossima apertura (main.js:1825-1849). ⚠️ Ma se la mappa è aperta in MappAI nello stesso momento, il salvataggio dell'app sovrascrive il file.
- Dopo «Cambia posizione»: «Se apri il Vault in Obsidian, dopo lo spostamento riaprilo da MappAI - file/Mappe.» (files-settings.js:63).
- La cartella `.obsidian/` creata da Obsidian nel root del vault non disturba la lettura (il loader apre solo `Nodi/*.md` e i file noti).

## 10. Il Cestino — «niente si cancella»: vero con tre eccezioni

**Va nel Cestino di macOS (`shell.trashItem`, recuperabile):** la cartella della mappa
(«Elimina», main.js:1126), un singolo materiale («Elimina» sul file, main.js:1016), i file
`set-*.json` superati dopo un salvataggio (main.js:1673).

**Si cancella DAVVERO (`fs.unlinkSync` / `rmSync`), senza passare dal Cestino:**
1. i file `.md` in `Nodi/` che non corrispondono più a un nodo (nodi fusi, cancellati nell'app, o file aggiunti a mano) — main.js:1507-1513;
2. `vista.json` stantio quando la vista è vuota — main.js:1439;
3. il cassetto `localStorage` («Libera spazio», «Svuota il registro»): non sono file del Finder.
Caso limite: nella migrazione, se il rename fallisce tra dischi diversi si copia e poi si
rimuove l'originale (`rmSync`, main.js:3322).

Il testo della Cabina › Privacy dice «Le cartelle sono file normali: si eliminano dal Finder
e spariscono davvero.» (cabina.js:500): è il Finder a cancellare, non l'app.

## 11. Spostare o rinominare a mano

- **Rinominare la cartella di una mappa nel Finder**: l'app elenca le mappe scandendo `Mappe/`
  e riconoscendo ogni cartella con `index.yaml` (`walkMappe`, main.js:3032-3065): la mappa
  resta visibile. Il progetto nel cassetto che la cercava col nome vecchio non la trova più
  (icona «Nessuna cartella vault su disco», ripiego per nome `findVaultDirByName`
  main.js:3193-3199), e la prossima generazione con lo stesso titolo creerebbe una cartella
  nuova. Il **titolo** mostrato resta quello di `index.yaml` (`rootNodeLabel`).
- **Spostare una mappa in un'altra classe/materia nel Finder**: la POSIZIONE è il dato
  (GUIDA-ARCHITETTO.md:252): negli elenchi la mappa cambia classe; `classe`/`materia` in
  `index.yaml` restano quelli di chi l'ha generata (vault-io.js:13-24). La strada prevista è
  invece l'assegnazione da ELABORA, che sposta la cartella da sé (`vault-relocate`).
- **Spostare `MappAI - file` altrove** (disco esterno, iCloud): l'adozione automatica cerca
  **solo in Documenti** (main.js:278); altrove va dichiarata con «Cambia posizione»
  (HANDOFF.md:1253-1255). ⚠️ `files-setup` sposta SOLO le cartelle storiche `MappAI - Vault`,
  `- Live`, `- Tutor`, `- Lavagna`, `- Knowledge Garden`, `- Materiali docente`, `- Classi`
  (`FilesCore.LEGACY`, files-core.js:39-47; `scanLegacyOnDisk` main.js:3283-3306): una
  `MappAI - file` già piena **non viene spostata** dal comando — l'app punta alla nuova
  posizione e la vecchia resta dov'è. Per cambiare disco il docente deve spostare la
  cartella col Finder e POI dire «Cambia posizione» sulla cartella che la contiene (vedi dubbi).
- **Un vault ricevuto da un collega**: lo si copia sotto `Mappe/<classe>/<materia>/` (o
  `Mappe/Generico/`); viene elencato al prossimo aggiornamento. Se non ha quella classe nel
  profilo, appare come «Generico» (vault-io.js:23-24).
- **Materiali nella cartella sbagliata**: non c'è guardia alla scrittura (HANDOFF.md:869-874,
  dichiarato non fatto); esiste uno strumento di diagnosi per Giacomo
  (`tools/diagnosi/vault-estranei.js`, solo lettura).

## 12. «NON ESISTE» (o è spento / pensionato)

- **«File condivisi»** — la libreria è PENSIONATA il 13/8: nessuna schermata ci scrive o la
  elenca; la cartella resta per i file già copiati (main.js:2530-2542; landing-teach.js:1178-1191).
  Per dare un file alla classe c'è «Aggiungi file…» nei Materiali di una sessione LIVE.
- **Sottocartelle per ramo in `Nodi/`** — solo con `mappai_vault_branch_folders` o JIGSAW
  (preload.js:70-75): di default non ci sono.
- **«Studio Attivo»** — le sette modalità di Studio attivo sono state CANCELLATE il 20/8
  (HANDOFF.md:2007); i file `Studio Attivo/storico_score.md` e `sessioni.jsonl` del
  laboratorio sono del 31/7. L'handler `save-study-record` esiste ancora (main.js:1322);
  non ho verificato chi lo chiami oggi (vedi dubbi).
- **`Dialoghi NPC/`** — solo Memory Dungeon, nascosto di default (menu-hubs.js:295).
- **Wikilink tra note Obsidian** — non esistono (vedi §9).
- **Un «cestino» interno all'app** — non c'è: si usa quello di macOS.
- **Un bottone «Rinomina cartella»** nel Finder dell'app — NON TROVATO: il nome della cartella
  nasce dal titolo del progetto (files-core.js:93-95) e si cambia rinominando il progetto
  (fuori dalla mia area).
- **Sincronizzazione cloud / account** — non c'è (cabina.js:479).
- **Costi nel registro consumi** — non si scrivono mai: solo token (main.js:2621-2624).
- **Il suffisso ` -VERDE`** nei file nuovi — non si produce più dal 10/8 (pipeline-core.js:474-486).
- **Il nome « - TestMe Sans»** nei file nuovi — sostituito da « - TM Sans» (font-core.js:100-107).
- **Un elenco aggiornato delle sottocartelle nella finestra «Cartella documenti»** — il testo
  «Struttura: Mappe · Attività di studio · File condivisi · Classi · Giardini.» è fermo
  (files-settings.js:102); quello giusto è nella Cabina (cabina.js:517-521).
- **La cartella demo** `public/vault_demo` — il codice la copierebbe in `Mappe/` al primo avvio
  (main.js:133-156) ma la cartella **non esiste nel repo**: non compare nessuna mappa demo.
- **Il Knowledge Garden / `Giardini/`** — il bottone «Knowledge Garden» esiste nel menu
  flottante (index.html:1475) ma la feature vive in una finestra separata; `Giardini/` resta
  vuota finché non si avvia una sessione. Non l'ho verificato oltre.

## 13. Parole da NON usare con i docenti → come dirlo

| gergo nel codice | nella guida |
|---|---|
| vault | «la cartella della mappa» (o «la mappa, sul disco») |
| `MappAI - file`, root, filesRoot | «la cartella MappAI - file» (il nome vero, tra virgolette) |
| console, Cabina | «Cabina» è il nome a schermo: si può usare; mai «console» |
| bento, kill-switch, flag | non nominare; dire «è acceso/spento di serie» |
| localStorage, snapshot, cassetto | «la copia di lavoro interna dell'app» / «lo spazio di lavoro» (è l'etichetta a schermo) |
| userData, mappai-settings.json | «le impostazioni dell'app» (non servono al docente) |
| IPC, handler, main/renderer | non nominare: «l'app scrive…» |
| KG / MM, `extractionMode` | «mappa mentale» / «mappa delle relazioni» (vedi area CREA) |
| L0/L1/L2, `_D` nodi | «il titolo», «i rami principali», «i sottorami», «gli approfondimenti» |
| cross-link, `isCross` | «i collegamenti trasversali» |
| frontmatter | «l'intestazione della nota» (le righe tra i due `---`) |
| `index.yaml`, `links.json`, `vista.json` | «i file di servizio della mappa» (citare i nomi una volta, con «non toccarli») |
| `Generico` | «le mappe senza classe» |
| `Senza classe` (Attività) | lasciare il nome: è quello che si vede |
| trashItem / Cestino | «finisce nel Cestino del Mac» |
| autosave, `saveCurrentProject` | «il salvataggio automatico» |
| JSONL, append-only | «un registro, una riga per volta» |
| taratura / `-VERDE` | «la versione adattata alla classe» (solo per i file vecchi) |
| slug, safeName | «il nome ripulito dai caratteri che una cartella non ammette» |
| pipeline | «la generazione dei materiali» |
| Obsidian | va bene, ma spiegato: «un programma gratuito per leggere cartelle di note» |

## 14. Dubbi (non verificati)

1. **Chi chiama ancora `save-study-record`** (`Studio Attivo/`) dopo la pensione delle sette
   modalità del 20/8: ho visto l'handler (main.js:1322) ma non ho cercato i chiamanti vivi.
2. **«Cambia posizione» con una `MappAI - file` già piena**: dal codice `files-setup` migra
   solo le cartelle `LEGACY`; deduco che la cartella organizzata non venga spostata, ma non
   l'ho provato nell'app. Da provare prima di scriverlo nella guida.
3. **`MM-Elettricità-4ª-00.pdf` senza etichetta del carattere** nel laboratorio: potrebbe
   essere un export fatto prima del 18/8, oppure con Space Mono prima che l'etichetta fosse
   annunciata. Oggi con Space Mono attivo il nome dovrebbe portare « - Space Mono»
   (font-core.js:81 + font.js:372): da verificare con un export vero.
4. **Il percorso di `userData` in produzione**: Electron usa il nome dell'app; con
   `productName: "MappAI"` (package.json:24) dovrebbe essere
   `~/Library/Application Support/MappAI/`. Non l'ho verificato su un'installazione.
5. **Che cosa vede l'app se il docente rinomina la cartella di una mappa mentre è aperta**:
   il salvataggio all'uscita userebbe `activeVaultPath` vecchio e ricreerebbe la cartella col
   nome vecchio (main.js:1400-1402 `mkdirSync` se manca). Plausibile, non provato.
6. **Il contenuto esatto di `session.json` per Lavagna e Tutor** (ho letto solo il writer del
   quiz live, live-server.js:180-185, e quello dei materiali, :802).
7. **`Giardini/`**: non ho verificato se il Knowledge Garden sia ancora raggiungibile e
   funzionante in `main`.
8. **Titolo mostrato dopo una rinomina a mano della cartella**: deduco da `readVaultInfo`
   (main.js:3100-3106) che l'elenco legga `rootNodeLabel` da `index.yaml`, ma non ho letto
   per intero quale campo usa la riga di INSEGNA.
