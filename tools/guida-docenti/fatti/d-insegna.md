# D — INSEGNA: la console del docente (fatti letti dal codice)

Letto il 22/8/2026 su `main`. Fonti: `public/js/mappai-landing-teach.js` (console, 1853-3740),
`public/js/mappai-console-bento.js` (briciola e filtri), `public/js/mappai-proiezione.js` +
`mappai-proiezione-core.js`, `public/js/mappai-live-classes.js`, `public/js/mappai-live-reports.js`,
`public/js/mappai-live-teacher.js`, `public/js/mappai-files-core.js`, `main.js`, `docs/HANDOFF.md` §2-§5.
Tutte le stringhe sono i fallback italiani di `_t('chiave', 'testo')`: in `public/traduzioni/it_translations.js`
l'unica chiave di quest'area è `ui_landing_teach: "Insegna"` (riga 11), quindi ciò che si legge a schermo
è esattamente il fallback nel JS.

Stato degli interruttori che contano qui (HANDOFF §2, righe 285-320):
`mappai_teach_console` acceso (la console) · `mappai_teach_row_select` acceso · `mappai_archivio_insegna` spento ·
`mappai_visione` acceso (→ «Proietta») · `mappai_domande_scelta` acceso (→ voce «Domande a scelta»).
`_bentoApp()` risponde SEMPRE `true` (landing-teach.js:1891): la veste a bento non è più opzionale.

---

## 1. Etichette ESATTE a schermo

### 1a. Come si entra — la briciola «Cosa»
| Etichetta | Dove | File:riga |
|---|---|---|
| «Cosa» (prima briciola, finché non si è scelto) | `.mn-briciole` in testata landing | console-bento.js:913 |
| «Crea» · «Elabora» · «Insegna» (voci della tendina) | menu `tipo:'lista'` | console-bento.js:914-916 |
| lucchetto Lucide `lock` + `title` col motivo sulle voci «Elabora»/«Insegna» durante una generazione | `.mn-bric-menu__lock`, `is-bloccata`, `aria-disabled` | console-bento.js:786-797 |
| motivo: «Sto generando «<nome>»: si riapre appena è pronta.» oppure «Generazione in corso: si riapre appena è pronta.» | `title` + `aria-label` | mappai-generazione.js:154-158 |
| separatore briciole «›» | `.mn-briciole__sep` | console-bento.js:955 |

Scegliere «Insegna» → `cb.onCosa('teach')` → `setMode('teach')` (landing-teach.js:152-173) → `openConsoleInsegna(voce)`
(2883). La landing sotto viene messa su COSTRUISCI (`LS_MODE='build'`, 165) — è dove si atterra chiudendo.

### 1b. La console (motore modali, `layout:'console'`, `taglia:'xl'`, `piena:true`)
| Etichetta | Selettore / posizione | File:riga |
|---|---|---|
| «Insegna» (titolo) | testata `.mm-head__testi` | landing-teach.js:2499 (+ it_translations.js:11) |
| «×» chiudi, `aria-label` «Chiudi» | `.mm-close[data-azione="__chiudi"]` | mappai-modal.js:696-697 |
| briciole «Insegna › <classe o Generico> › <materia> › <mappa>» (si completano SOLO dopo aver scelto una mappa) | `.mn-briciole` nella testata della console | landing-teach.js:2962-2990 |
| ultima briciola = menu con le altre mappe del filtro, solo se ce n'è più d'una | `menu.tipo:'lista'` | landing-teach.js:2975-2988 |
| gruppo sidebar «Mappe» | `.mm-console__side` nav | landing-teach.js:2469 |
| «Cerco le mappe…» (icona loader) | voce `vuoto` | 2471 |
| «Nessuna mappa» (icona circle-dashed) | voce `vuoto` | 2473 |
| righe delle mappe: nome + icona `image` (dossier) / `network` (Knowledge Graph) / `map` (MindMap) | voci nav | 2482 |
| bollino «NUOVO» sulle mappe generate in sessione e mai aperte | `badge` | 2487 (lista `mappai_progetti_nuovi`, mappai-generazione.js:45,112) |
| gruppo sidebar «Materiali» | nav | 2493 |
| voci «Lavagna» (presentation) · «Attività LIVE» (radio) · «Stampabili» (printer) | nav | 1866-1868 |
| sottotitolo «Scegli una classe per restringere le mappe» (nessuna classe, nessuna mappa scelta) | `.mm-head__testi` | 2605 |
| sottotitolo «<classe> · <materia> · N mappe» | idem | 2602-2604 |
| sottotitolo «<mappa> · <classe>» (mappa scelta) | idem | 2537 |
| sottotitolo «<vista> · <classe>» oppure «<vista> · Tutte le classi» | idem | 2592 |

### 1c. I FILTRI in testa alla colonna (`.mn-filtri`, console-bento.js:1022-1095)
| Etichetta | Selettore | File:riga |
|---|---|---|
| `aria-label` «Filtri dell'elenco» | `.mn-filtri[role=group]` | 1039 |
| «Classe?» / «Materia?» (le due righe-bottone) | `.mn-filtro__k` | 1041, 1056 |
| valore: «—» (niente scelto) · «Tutte» (contesto Generico) · nome classe / materia | `.mn-filtro__v` | 1054-1057 |
| conto «N progetti» / «1 progetto» | `.mn-filtri__conto` | 1069 |
| conto «X di N — » + bottone «mostra tutti» | `.mn-filtri__tutte` | 1071-1083 |
| tendina «A chi?»: colonne «Generico» · le classi · gli allievi «<nick> — <grado>» | `.mn-bric-menu--cols` | 921-925 |
| tendina «Materia»: le materie della classe (o del profilo docente); «+ Nuova materia» SOLO senza classe | `menu.nuovo` | 929-931 |
| prompt «Nome della nuova materia» | `showPrompt` | landing-teach.js:1905 |
⚠️ Il vecchio **chip** classe·materia nella testata NON c'è più: `contesto: []` (landing-teach.js:2503).

### 1d. La vista «mappa scelta» — la riga dei comandi (bento, `_consBentoMappa` 2423-2462)
Bottoni `.mn-btn.mn-cmd[data-azione]`, icona a riposo, etichetta in `title`/`aria-label`, tooltip da `data-tip`
(console-bento.js:585-594; il tooltip lo mostra mappai-menu-hubs.js:41-48).
| Etichetta | `data-azione` | Tooltip (`aiuto`) | Quando | File:riga |
|---|---|---|---|---|
| «Mappa» | `apri` | «Apre la visualizzazione della mappa.» | sempre (icona image/network/git-merge) | 2425-2427 |
| «Proietta» | `proietta` | «La fotografia a tutto schermo per la lezione, con la scheda e le domande da affiancare.» | solo `p.dossier` | 2432 |
| «Elabora» | `elabora` | «Apre ELABORA sulla fonte e sui documenti di questa mappa.» | non sui KG | 2435 |
| «QR» | `qr` | «Condivide un materiale di questa mappa con la classe via codice QR.» | sempre | 2436 |
| «Cartella» | `cartella` | «Apre la cartella del vault nel Finder.» | sempre | 2437 |
Quindi: **4 comandi** (Mappa · Elabora · QR · Cartella), **3 su un Knowledge Graph**, **5 su un dossier** (+Proietta).
Stile riga: sfondo trasparente, bottoni `#f1f4f8` → hover `#41e6aa` (2444-2447).

Sotto, il box «Materiali» (2448-2451) con:
- «Cerco i materiali di questa mappa…» (2439)
- «Nessun materiale archiviato. Genera una Sintesi, un Dossier, un Foglio nodi o una Timeline: compariranno qui.» (2440)

### 1e. Le TABELLE dei materiali (`_consTabelleMateriali` 2218-2415) — impilate in UNA colonna, tutte CHIUSE all'apertura (`_consChiuse` 2621-2625)
Elenchi per genere (`GRUPPI_MAT` 2115-2140), nell'ordine: «Sintesi» · «Fogli dei nodi» · «Catena dei perché» · «Quiz» ·
«Flashcard» · «Altri materiali» · («File di lavoro» è dichiarato ma in INSEGNA non riceve mai righe: i `.json` sono filtrati, 2257).
Un gruppo senza righe non si disegna (2269).

Colonne (2320-2345): «Nome» (libera) · «Tipo» (130px) · [«Mappa» 190px — solo in Stampabili] · [«Classe» 96px — solo se varia fra le righe] ·
[«Materia» 130px — solo se varia] · «Data» (116px, formato GG/MM/AAAA, `fmtDate` 626) · colonna comandi senza intestazione,
larghezza misurata: 1 comando 58px · 2 → 96 · 3 → 134 · 4 → 172 (`_larghezzaComandi` 2200-2209).
Valori di «Tipo» (`_formatoMateriale` 2146-2160): «Modificabile» · «PDF» · «HTML» · estensione in maiuscolo · «File».
I generi letti dal NOME del file (`_diskKind` 529-567): «Audio» (.mp3/.m4a/.wav) · «Analisi della fonte» (`Analisi-fonte-…`) ·
«Quiz MC» · «Quiz V/F» · «Quiz» · «Flashcard» · «Foglio nodi» · «Sintesi con voce» (`Sintesi-voce-…`) · «Sintesi» ·
«Catena dei perché» · «Domande aperte» · «Dati» (.json) · «File».

Comandi di riga (icona sola, etichetta nel tooltip; 2366-2404), solo per i FILE su disco:
| Etichetta | icona | id | Quando |
|---|---|---|---|
| «Stampa» | printer | `st:<id>` | file su disco |
| «Scarica una copia» | download | `dl:<id>` | file su disco |
| «Apri nel Finder» | folder-open | `fnd:<id>` | file su disco |
| «Elimina» | trash-2 | `del:<id>` | SOLO se `m.clone` (una copia), mai sull'originale (2387-2404) |
«Fai una copia» (copy) esiste solo in ELABORA (2385).

### 1f. Un materiale aperto nella tela (`_cons.mat`, 2507-2523)
Sottotitolo «<mappa> · <titolo>». Barra `colonna:'barra'`: «Indietro» (arrow-left) · «Stampa» (printer, primario) ·
«Condividi (QR)» (qr-code) · «Apri nel Finder» (folder). Segnaposto tela: «Apro il materiale…» (2522).
La colonna si ritira (`navChiusa: true`, 2508); la maniglia sul bordo la riapre (mappai-modal.js:622-634).
Messaggi nella tela: «Documento non disponibile.» (2851) · «Disponibile solo nell'app desktop.» (2857) ·
«Non riesco ad aprire questo file» [+ «: errore»] (2864).

### 1g. Toast e modali della console
| Testo | Quando | File:riga |
|---|---|---|
| «Non riesco a stampare questo file.» | stampa fallita | 3265, 3268 |
| «L'ho aperto nell'applicazione di sistema: stampalo da lì.» | Chromium non stampa il file → aperto fuori | 3266 |
| «✓ Copia scaricata» | download riuscito | 3284 |
| «Non riesco a scaricare questo file.» | download fallito | 3282, 3286 |
| «Spostato nel Cestino.» | file eliminato | 3310 |
| «Non è stato possibile eliminare il file» [+ «: errore»] | cestino fallito | 3312 |
| «Non riesco ad aprire questo file dalla cartella.» | Finder fallito | 3237-3239 |
| «Disponibile solo nell'app desktop.» | senza Electron | 3229, 3248, 3274, 3303 |
| «La stampa non è disponibile per questo materiale.» | Stampa dalla barra su iframe opaco | 3374 |
| «Solo i materiali in HTML si condividono via QR.» | QR su un PDF | 3386 |
| «Nessun materiale da condividere: genera prima una Sintesi, un Foglio nodi o una Timeline.» | QR senza HTML | 3410 |
| modale «Condividi un materiale via QR» (icona qr-code, elenco con icona file-text, seconda riga = mappa) | comando «QR» senza materiale aperto | 3413-3416 |
| «Pubblicato: <file>» | dopo la pubblicazione | mappai-live-teacher.js:671 |
| «Non riesco ad aprire questa mappa.» | «Mappa» fallisce / mappa non pronta in ~5 s | 3327, 3457 |
| «ELABORA lavora sulle MindMap: questa è un Knowledge Graph.» | «Elabora» su KG | 3480 |
| «Funzione non disponibile.» | modulo mancante | 3486 |
| «Richiede l'app desktop.» | Lavagna/Live senza Electron | 3116, 3128, 3142, 3148 |
| «Funzione non disponibile» (errore) | «Domande a scelta» senza modulo | 3155 |
| «Questa sessione non ha report da aprire.» | clic su riga senza report | 3173 |
| «Scegli prima una classe nel chip in alto.» | «Foglio credenziali» senza classe | 3131 — ⚠️ il chip non esiste più: il testo è stantio |

**Conferma eliminazione a digitazione** (`confirmDeleteText` 765-795): titolo «Conferma eliminazione» (icona trash-2, taglia s),
testo «Per eliminare scrivi qui sotto il nome esatto: “<nome>”», un campo la cui etichetta È il nome, bottoni «Annulla» /
«Elimina» (ruolo distruttivo). Confronto senza maiuscole e senza spazi ai bordi (768-770). Se non combacia:
toast «Il testo non corrisponde: eliminazione annullata.» (773).

### 1h. Vista «Lavagna» (`_vistaLavagna` 2635-2697) — SOLO elenco, il dettaglio è di un altro lettore
Sezione «Nuova sessione» · campo «Accesso allievi»: «A gruppi (3 emoji)» / «Individuale (roster della classe attiva)» ·
campo «Rete degli allievi»: «Wi-Fi dell’aula» / «Internet condiviso», aiuto «Rete: usa l’hotspot del PC o un router d’aula. Le reti
scolastiche spesso bloccano il traffico tra dispositivi.» · bottoni «Avvia la Lavagna» (play, primario) · «Foglio credenziali» (id-card) ·
nota «Senza una classe attiva è disponibile solo l’accesso a gruppi.» · «Cerco le sessioni salvate…» · tabella «Sessioni da riprendere»
con colonne «Mappa» · «Classe» (120) · «Materia» (150) · «Data» (120) · «Gruppi» (90) · «Accesso» (125; valori «individuale»/«gruppi»).

### 1i. Vista «Attività LIVE» (`_vistaLive` 2700-2745) — SOLO elenco
Sezione «Nuova attività» con tre bottoni: **«Quiz a distanza»** (list-checks, primario) · **«Rispondi e Domanda»** (message-square) ·
**«Domande a scelta»** (list-checks). Testo: «Gli allievi entrano dal telefono con le loro credenziali: il quiz si corregge da sé, la
scrittura col tutor consegna testo e trascrizione.» · «Cerco i report…» · «Nessuna attività svolta finora.» ·
tabella «Attività già svolte»: «Attività» (150) · «Mappa» · «Classe» (120) · «Materia» (150) · «Data» (120) · «Partecipanti» (115) ·
icona folder «Apri nel Finder» (58).
⚠️ «Quiz a scelta» NON è una voce di questa vista: è il titolo che `mappai-scelta.js:137,219,273` dà al genere a scelta multipla
DENTRO il modale di «Domande a scelta». «Lavagna» e il tutor («Rispondi e Domanda») sono: la prima una voce di sidebar a sé, il secondo
un bottone qui.

### 1j. Vista «Stampabili» (`_vistaStampabili` 2747-2758)
Le stesse tabelle di 1e per TUTTE le mappe del filtro, con la colonna «Mappa» in più (2753, `conMappa=true`). Vuoto: stesso testo
«Nessun materiale archiviato. …» (2750, 2757). Attesa: «Cerco i materiali di questa mappa…» (2749 — testo riusato, dice «mappa» anche qui).

### 1k. «Proietta» (`mappai-proiezione.js` 172-330; overlay `#pj-overlay`, sfondo `#0f172a`)
| Etichetta | Selettore | File:riga |
|---|---|---|
| titolo = nome della mappa/fonte | `.pj-titolo` | 198 |
| «Affianca» (`aria-pressed`) | `.pj-btn[data-pj="split"]` | 200 |
| «×» con `aria-label` «Chiudi» | `[data-pj="chiudi"]` | 201 |
| «−» · «100%» (percentuale viva) · «+» · «Adatta» · «100%» | `.pj-zoombar` | 207-211 |
| «Scheda» | `[data-pj="scheda"]` | 216 |
| tendina «Domande aperte…» (prima voce, vuota) | `select[data-pj="sel-oq"]` | 217, 268 |
| tendina «Flashcard…» | `select[data-pj="sel-fc"]` | 218, 272 |
| «A−» · «A+» | `[data-pj="a-"]`, `[data-pj="a+"]` | 220-221 |
| «La fotografia di questa fonte non è su questo computer: si proietta dal computer dove il dossier è stato creato.» | al posto della foto | 239 |
| «Questo dossier non ha una scheda in archivio su questo computer.» | pannello | 133 |
| «Questo foglio non porta le sue domande.» | pannello | 150 |
| «Questo set non porta le sue carte.» | pannello | 163 |
| «La proiezione non è caricata.» (toast) | core mancante | 178 |

### 1l. Le tessere (foglio credenziali, `buildCredentialCardsHtml` live-reports.js:232-245)
Intestazione «Credenziali classe» · sotto «Ogni allievo entra con: nome classe + emoji + numero» · una card per allievo con
emoji grande, numero, nome classe, nome allievo oppure «Nome: ____________» · piè «MappAI Live · generato il GG/MM/AAAA HH:MM» (108, 114).
Toast: «Foglio credenziali salvato in Classi/<classe>» (live-classes.js:1024) · «Foglio credenziali non salvato: <errore>» (1028) ·
«Tessera salvata in Allievi/<nome>» (1051).

---

## 2. Gesti → che cosa succede (e che cosa finisce su disco)

| Gesto | Funzione | Effetto visibile | Disco / storage |
|---|---|---|---|
| Briciola «Cosa» › «Insegna» | `cb.onCosa('teach')` → `setMode('teach')` → `openConsoleInsegna` (152-173, 2883) | console a tutto schermo; colonna «Cerco le mappe…» poi le mappe | `localStorage.mappai_landing_mode='build'` (165); `document.documentElement.dataset.manSezionePendente='teach'` (2890) |
| Apertura console | `_consCaricaMappe` (1919-1975) | le mappe della colonna | LETTURA: `electronAPI.getAllVaults()` (main.js:3067) scandisce `Mappe/` e `Allievi/<nome>/Mappe`; legge `index.yaml` (`extractionMode`, `rootNodeLabel`, `dossier`, `classe`, `materia`) |
| Filtro «Classe?» / «Materia?» | `_cbCtx.onClasse/onMateria/onGenerico` (2940-2947) | colonna ristretta; conto «X di N — mostra tutti» | `MappAIClasses.setActive / setActiveDiscipline / setActiveStudent` (localStorage `mappai_active_class`, `mappai_active_discipline`) |
| Clic su una riga della colonna | `__nav` → `scegliMappa(id)` (3002-3019) | la riga si SELEZIONA: riga comandi + box Materiali; il bollino NUOVO sparisce; il filtro si ALLINEA alla classe/materia della mappa (`allineaContestoA` 3665-3676) | `MappAIGen.visto(m)` toglie l'id da `mappai_progetti_nuovi`; LETTURA `vaultMaterialsList({vaultPath})` (main.js:1203-1229) = i file di `Materiale Studio/` del vault |
| «Mappa» | esito `apri` nel `.then` di `open()` (3328-3334) → `_consCarica` (3422-3428) | la console si chiude, la mappa si apre sul canvas | `sessionStorage.mappai_teach_console_back=<id>` (3533-3535): tornando con HOME si riapre la console sulla stessa mappa (`init` 3545-3548) |
| «Elabora» | `_consAvvia(m,'elabora')` (3462-3481) | carica la mappa, aspetta l'identità giusta (max 60×80 ms ≈ 5 s, 3452-3460), poi `setMode('elabora')` | nessun segnalibro (3344-3345) |
| «Proietta» | `MappAIProiezione.apri({mapName, vaultPath})` (3210-3216) | overlay a tutto schermo con la foto | LETTURA: `vaultMaterialsList({dir:'Allegati'})` + `readVaultFile('Allegati/<foto>')` (proiezione.js:105-117); ripiego sul JPEG della scheda d'archivio (`MappAIStudyDocs`, 96-101) |
| «QR» (riga comandi) | `_consQr` (3396-3421) → picker → `_consShareMat` (3377-3395) | modale «Condividi un materiale via QR» con i soli HTML; poi il pannello «Materiali di studio» di MappAI Live con il QR | SCRITTURA: `liveMaterialsAddHtml` (main.js:2522-2526) copia l'HTML in `<cartella sessione materiali>/materials/<nome>.html` (live-server.js:787); la cartella è `Attività di studio/…/materiali-<nome>-<data>` se i file sono organizzati, altrimenti `Documenti/MappAI - Live/materiali-…` (main.js:2346, 2474) |
| «Cartella» | `pipelineOpenFolder({folderPath})` (3217-3223) | Finder sulla cartella del vault | — |
| Clic su una riga dei materiali | `m:<id>` (3225-3230) → `_consApriMateriale` (2837-2868) | il documento nella tela (iframe: HTML come `srcdoc`, PDF/MP3 come `data:`), barra Indietro·Stampa·Condividi (QR)·Apri nel Finder | LETTURA `readVaultFile` (main.js:967) |
| riga › «Stampa» | `st:` → `vaultFilePrint` (3253-3270; main.js:1073-1100) | dialogo di stampa di sistema; se Chromium non ce la fa apre il file fuori e lo dice | — |
| riga › «Scarica una copia» | `dl:` → `vaultFileDownload` (3276-3289; main.js:1033-1056) | dialogo «Scarica una copia», bottone «Scarica», proposta `~/Downloads/<nome file>` | SCRITTURA: copia dove l'utente sceglie; annullare = nessun avviso |
| riga › «Apri nel Finder» | `fnd:` → `pipelineOpenFile` (3234-3244; main.js:1188) | Finder sul file | — |
| riga › «Elimina» (solo copie) | `del:` → `confirmDeleteText` → `deleteVaultFile` (3290-3315; main.js:1005-1016) | modale a digitazione; «Spostato nel Cestino.» | il file va nel **Cestino di sistema** (`shell.trashItem`, main.js:1016), non cancellato; voce d'archivio → `MappAIStudyDocs.remove` (localStorage) |
| barra › «Stampa» | `_consStampa` (3369-3375) | `iframe.contentWindow.print()` | — |
| barra › «Condividi (QR)» | `_consShareMat(_cons.mat)` | come «QR», sul materiale aperto | come sopra |
| barra › «Apri nel Finder» | `openDiskFile` (587-592) | Finder sul file; per una voce d'archivio apre la cartella `Mappe/` (`openMapsFolder` 1172) | — |
| barra › «Indietro» / ESC | `ind` / `__esc` (3098, 3225) | chiude il documento, la console resta; ESC senza documento non fa nulla | — |
| Lavagna › «Foglio credenziali» | `lav-cred` → `MappAIClasses.saveCredentialsPdf(classe,{avvisa:true})` (3127-3139; live-classes.js:1011-1030) | toast «Foglio credenziali salvato in Classi/<classe>», poi Finder sulla cartella (`classDocOpen`, main.js:2606) | SCRITTURA: `Classi/<classe>/credenziali-<classe>.pdf` (PDF A4 via `htmlToPdf`, `classDocSave` main.js:2565-2585). Base: `MappAI - file/Classi/` se organizzato, altrimenti `Documenti/MappAI - Classi/` (main.js:237). Lo stesso PDF nasce DA SÉ quando si salva una classe (live-classes.js:746-747) |
| Lavagna › «Avvia la Lavagna» / riga «Sessioni da riprendere» | `lav-start` / `res:<dir>` → `MappAICollabTeacher.avvia` (3108-3125) | avvio (altro lettore) | `MappAINetMode.set(rete)` |
| Attività LIVE › «Quiz a distanza» | `MappAILive.openSetup()` (3141-3145) | setup del quiz (altro lettore) | — |
| Attività LIVE › «Rispondi e Domanda» | `MappAITutor.openSetup()` (3146-3150) | setup tutor (altro lettore) | — |
| Attività LIVE › «Domande a scelta» | `MappAISceltaAttivita.apriLive()` (3151-3157) | modale a tre passi (altro lettore) | — |
| riga «Attività già svolte» | `rep:<i>` → `studyReportOpen(primo report)` (3158-3175; main.js:3444) | apre nel browser il PRIMO `report-*.html` della sessione | LETTURA da `Attività di studio/<Classe>/<AAAA-MM-GG · Attività · Mappa>/` (files-core.js:237-247; main.js:248-256) |
| riga › icona folder | `repdir:<i>` → `studySessionOpenFolder({dir})` (main.js:3241) | Finder sulla cartella della sessione | — |
| «×» / briciola «Cosa» › «Crea»/«Elabora» | `__chiudi` (2954-2958) | la console si chiude sulla landing (COSTRUISCI o la sezione scelta) | — |
| HOME dalla mappa | `init()` (3545-3548) consuma `mappai_teach_console_back` | riapre INSEGNA sulla mappa da cui si era usciti | il segnalibro si cancella alla lettura (3538-3543) |

Dove si scrivono i materiali che INSEGNA elenca: **non li scrive INSEGNA**. Sono i file di `Mappe/<classe>/<materia>/<vault>/Materiale Studio/`
prodotti da CREA/ELABORA; INSEGNA li legge (`vault-materials-list`, main.js:1214-1224) e vi aggiunge le voci dell'archivio
`MappAIStudyDocs` (localStorage) che non hanno un file gemello (dedup per nome+genere, 2089-2097). Vince il file (2070-2079).

---

## 3. Limiti numerici e default

- **Mappe della colonna**: dal DISCO (`getAllVaults`), rilettura 1-7 ms su 28 vault (commento 3722). Nessun tetto.
- **Filtro**: una mappa con classe/materia che il docente non ha (vault di un collega) è GENERICA (`_comeLaVedo` 1994-2000) e compare col filtro «Tutte».
- **Sintesi**: in INSEGNA si vede SOLO `Sintesi-voce-<mappa>.html` (quella con l'MP3 dentro, ~8 MB); l'editabile `Sintesi-<mappa>.html` resta in ELABORA (`filtraSintesi` 2177-2186).
- **Voci d'archivio dei fogli cartacei** (quiz/flashcard senza PDF proprio): nascoste (`mappai_archivio_insegna` ≠ '1', 2236-2242).
- **`.json`** (set di studio): mai in tabella (2257), restano nella cartella.
- **QR**: solo `.html`/`.htm` (3386; `qr: /\.html?$/i`, 2105). Le voci d'archivio condivisibili = `hasHtml` e genere ≠ `nodesheet` (2054).
- **Cestino**: solo sulle COPIE (`m.clone`); mai originali, mai fogli «dalla mappa» (2387-2404). Conferma a digitazione del nome esatto (case-insensitive).
- **Larghezze colonne**: Tipo 130 · Mappa 190 · Classe 96 · Materia 130 · Data 116 · comandi 58/96/134/172 px (2320-2345, 2200-2209).
- **Tabelle chiuse** all'apertura e a ogni ridisegno (`_consChiuse` 2621-2625).
- **Apertura mappa**: attesa dell'identità fino a 60 giri × 80 ms ≈ 5 s (3452-3460).
- **Proietta**: zoom min 0.05 · max 8 (`Z_MIN/Z_MAX`, core:18); rotellina ×1.15 (proiezione.js:246); bottoni ± ×1.25 (324-325); «Adatta» = 0.98 del riquadro nei due assi (core:25); pan con almeno 48 px d'immagine sempre dentro (core:42); corpi del testo affiancato **18 · 22 · 26 · 32 · 40 px**, default **22** (core:57-63). Foto: primo `.jpg/.jpeg/.png` in `Allegati/` (108-110). Flashcard: i `set-*.json` di `Materiale Studio/` con `type/mode` che contiene «flash» e `_mappa` = nome mappa (73-91). Domande aperte: voci d'archivio `quizpaper` col titolo che contiene «domande aperte» (53-60); la tendina mostra la parte del titolo dopo « - » (265-268).
- **Credenziali**: PDF A4 (`pageSize:'A4'`, live-classes.js:1015); nome `credenziali-<classe>.pdf` (1020); tessera singola `credenziali-<nome allievo>.pdf` in `Allievi/<nome>/` (1043-1048).
- **Report delle sessioni**: cartella `Attività di studio/<Classe>/<AAAA-MM-GG · Attività · Mappa[ — ramo]>` (files-core.js:237-247); più somministrazioni lo stesso giorno → suffisso ` · NN` (258-268); dentro `session.json`, `results.json`, `report-*.html` (main.js:3393-3398); senza organizzazione: `Documenti/MappAI - Live|Tutor|Lavagna` (main.js:3383-3388). Ordinati dal più recente (main.js:3437).
- **Cartelle di base** (files-core.js:23-33, main.js:231-245): cartella madre «MappAI - file» con «Mappe», «Attività di studio», «File condivisi», «Classi», «Giardini», «Allievi»; senza organizzazione: «MappAI - Vault», «MappAI - Materiali docente», «MappAI - Classi», «MappAI - Knowledge Garden», «MappAI - Allievi».
- **Download**: dialogo di sistema, proposta `~/Downloads/<nome>` (main.js:1046-1049).

---

## 4. Percorso tipico del docente (storyboard)

1. Landing → briciola «Cosa» (`.mn-briciole`) → tendina → clic **«Insegna»** (console-bento.js:916). Si vede: la console «Insegna» a tutto schermo, colonna «Mappe» con «Cerco le mappe…» poi l'elenco con icone map/network/image e qualche «NUOVO»; in testa alla colonna «Classe? —» / «Materia? —» e «N progetti».
2. Clic su **«Classe?»** (`.mn-filtro`) → tendina a colonne «Generico | classi | allievi» → scegli «2A». Si vede: valore «2A», conto «X di N — mostra tutti», colonna ristretta, sottotitolo «2A · N mappe».
3. Clic su **«Materia?»** → scegli «Geografia». Si vede: «Materia? Geografia», colonna ancora più stretta.
4. Clic sulla **riga di una mappa** (nav). Si vede: briciole «Insegna › 2A › Geografia › <mappa>», riga dei comandi «Mappa · Elabora · QR · Cartella» (`.mn-cmd`), box «Materiali» con gli elenchi chiusi «Sintesi», «Quiz», «Flashcard»…
5. Clic sul titolo dell'elenco **«Quiz»** → si apre: righe con Nome · Tipo (PDF/HTML) · Data · tre icone (Stampa · Scarica una copia · Apri nel Finder).
6. Clic sull'icona **«Stampa»** (`[data-azione^="st:"]`). Si vede: dialogo di stampa di sistema.
7. Clic sulla **riga** del quiz. Si vede: il PDF nella tela, barra «Indietro · Stampa · Condividi (QR) · Apri nel Finder», colonna ritirata.
8. «Indietro» → clic su **«QR»** nella riga dei comandi. Si vede: modale «Condividi un materiale via QR» con i soli HTML (es. «Sintesi-voce-…html»); scegli → pannello «Materiali di studio» di MappAI Live con il QR e «File pubblicati» (live-teacher.js:613-650).
9. (Se la mappa è un dossier) clic su **«Proietta»**. Si vede: `#pj-overlay` scuro, foto adattata, zoombar «− 100% + Adatta 100%»; clic **«Affianca»** → pannello destro con la scheda; tendina «Domande aperte…» → le domande senza righe; «A+» → testo a 26 px; ESC chiude.
10. Sidebar › **«Lavagna»** → «Nuova sessione» con «Accesso allievi» e «Rete degli allievi»; clic **«Foglio credenziali»** → toast «Foglio credenziali salvato in Classi/2A» e Finder su `Classi/2A/`.
11. Sidebar › **«Attività LIVE»** → «Nuova attività» con «Quiz a distanza · Rispondi e Domanda · Domande a scelta»; sotto «Attività già svolte» (⚠️ vedi §6: oggi resta «Nessuna attività svolta finora.»).
12. Sidebar › **«Stampabili»** → gli stessi elenchi per tutte le mappe di 2A · Geografia, con la colonna «Mappa» in più.
13. Clic **«Mappa»** → la console si chiude, la mappa si apre; HOME → la console si riapre sulla stessa mappa (segnalibro).

---

## 5. Prerequisiti e stati

- **App desktop (Electron)**: senza `electronAPI` la colonna mostra solo i progetti in localStorage (1922-1926); materiali, stampa, download, Finder, QR, Lavagna, Live rispondono «Disponibile solo nell'app desktop.» / «Richiede l'app desktop.».
- **Nessuna chiave AI richiesta**: INSEGNA non chiama l'AI (legge il disco). Unica eccezione indiretta: «Elabora» porta in ELABORA.
- **Durante una generazione**: la voce «Insegna» nella tendina «Cosa» è grigia col lucchetto e `title` = motivo (console-bento.js:786-797; mappai-generazione.js:154-158). Se la console è già aperta, «Mappa»/«Elabora» sono fermate da `window.mappaiOccupato()` a runtime (3470) — non si vedono spente (HANDOFF §4 debito 4b, riga 1865-1868).
- **Classe attiva**: non obbligatoria. Senza classe: sottotitolo «Scegli una classe per restringere le mappe»; in Lavagna «Senza una classe attiva è disponibile solo l'accesso a gruppi.»; «Foglio credenziali» → toast «Scegli prima una classe nel chip in alto.».
- **Materia**: la tendina elenca le materie della classe (`disciplineChoices`) o del profilo docente; «+ Nuova materia» solo senza classe (console-bento.js:927-931).
- **«Elabora»**: assente sui Knowledge Graph (2434-2435); il genere lo dice `index.yaml` del vault (1936-1937).
- **«Proietta»**: solo se `index.yaml` porta `dossier: true` (1948, main.js lettura `parsed.dossier`) e `mappai_visione` acceso (HANDOFF §2). Senza foto in `Allegati/` né JPEG nella scheda d'archivio: messaggio «La fotografia di questa fonte non è su questo computer…».
- **Comandi di riga**: compaiono solo sui FILE (`_diskCache[m.id]`, 2366); le voci d'archivio (localStorage) non hanno icone.
- **Cestino**: solo sulle copie (`m.clone`).
- **Tabella «Attività già svolte»**: richiede `studySessionsList` — vedi §6.
- **Il bollino «NUOVO»**: solo per mappe generate in questa sessione e mai cliccate (`MappAIGen.eNuovo`).
- **Contesto azzerato al lancio** (`_contestoVuotoAlLancio` 3577-3597): all'apertura dell'app classe, materia e allievo attivi sono vuoti; il reload (HOME) li conserva.

---

## 6. «NON ESISTE»

1. **Un bottone «Consegna»**: `npm run dove -- "Consegna"` non trova nessuna etichetta in quest'area (solo commenti e un tooltip di ELABORA/Lavagna). Il gesto di consegna si chiama **«QR»** nella riga dei comandi e **«Condividi (QR)»** nella barra del documento aperto, e pubblica sul server materiali di MappAI Live (pannello «Materiali di studio», «File pubblicati», «Gli allievi scaricano senza login» — live-teacher.js:613-650). Nessuna copia va nelle cartelle di classe: il file va in `…/materiali-<nome>-<data>/materials/` (live-server.js:787).
2. **«Studio attivo» e «Lavagna» nella riga dei comandi della mappa**: esistono solo nel ramo storico non-bento (2557-2558), irraggiungibile perché `_bentoApp()` è sempre `true` (1891). In `main` i comandi sono Mappa · (Proietta) · (Elabora) · QR · Cartella.
3. **Il chip classe·materia nella testata**: `contesto: []` (2503). Al suo posto la briciola + i due filtri in colonna.
4. **La voce «File condivisi»** nella sidebar: pensionata il 13/8 (commento 2490-2491).
5. **`mappai_teach_row_select`**: nella console NON ha effetto — il clic sulla riga chiama sempre `scegliMappa` (3093-3096). `rowSelectEnabled()` è letto solo dalle tabelle della landing storica (978, 1131), che si vedono solo con `mappai_teach_console='0'`.
6. **La tabella «Attività già svolte» non si popola mai** — bug letto nel codice: `scegliVista('live')` legge `r.sessions || r.records` (landing-teach.js:3034) ma `study-sessions-list` restituisce `{ success, rows }` (main.js:3437); inoltre le celle leggono `r.cls` e `r.joined` (2727-2732) mentre il record porta `className` e `participants` (files-core.js:346-358). La landing storica legge `res.rows` correttamente (1487). Risultato in `main`: sempre «Nessuna attività svolta finora.». I report esistono su disco in `Attività di studio/` e si aprono dal Finder.
7. **Il modale «Scegli la materia»** (`_consPickMateria` 3347-3367) e la voce «Tutte le materie»: raggiungibili solo dal chip (`__ctx-materia`, 3206), che non c'è più.
8. **Le voci d'archivio dei fogli cartacei** (quiz/flashcard senza PDF proprio): nascoste in INSEGNA (kill-switch `mappai_archivio_insegna` spento, 2236-2242). La loro sorgente si corregge in ELABORA.
9. **«Fai una copia»** (clona): solo in ELABORA (2385). In INSEGNA nessun comando di copia.
10. **Un cestino sugli originali**: vietato per scelta (2387-2392).
11. **Una colonna «Classe»/«Materia» fissa**: compaiono solo se il valore varia fra le righe (2312-2318).
12. **La «Sintesi» editabile** in INSEGNA: si vede solo «Sintesi con voce» (2177-2186).
13. **Un QR per i PDF**: rifiutato («Solo i materiali in HTML si condividono via QR.»).
14. **Una tessera per singolo allievo da INSEGNA**: `saveStudentCredentialPdf` (live-classes.js:1035-1055) non ha un bottone in questa console; parte da «Account classi» (altro lettore).
15. **Il paragrafo «Da dove si comincia»**: solo nel ramo storico (2607-2612), mai in `main`.
16. **Proietta provato in Electron**: no — HANDOFF §5 lo elenca fra i «DA PROVARE» (righe 2003-2006).

---

## 7. Parole da NON usare con i docenti

| Gergo | Nella guida |
|---|---|
| console | «la schermata Insegna» / «la pagina Insegna» |
| bento, cablaggio bento | non nominare; «la riga dei comandi» e «il riquadro Materiali» |
| kill-switch, flag, localStorage | non nominare; se serve: «impostazione» |
| vault | «la cartella della mappa» (dentro «Mappe») |
| KG / Knowledge Graph, MindMap | «mappa a rete» / «mappa ad albero» (l'app li distingue con le icone network/map; «Elabora» c'è solo sulle mappe ad albero) |
| dossier (iconografico) | «scheda di una fotografia» / «fonte con immagine» (icona foto) |
| L1, cross-link, deepening | non riguardano INSEGNA; non nominare |
| archivio (MappAIStudyDocs) vs disco | «documenti salvati nell'app» vs «file nella cartella»; meglio ancora: parlare solo di «materiali» e dire che alcuni hanno le icone (quelli che sono file) |
| IPC, electronAPI, main | «l'app sul computer» |
| briciola, cascata, percorso | «la riga in alto Insegna › classe › materia › mappa» |
| chip | non esiste più: non nominare |
| sidebar / colonna nav | «la colonna a sinistra» |
| tela | «l'area grande a destra» |
| iframe, srcdoc, data: URI | non nominare |
| toast | «un avviso in basso» |
| modale | «una finestra» |
| QR / MappAI Live / server materiali | «il codice QR che gli allievi inquadrano col telefono» |
| roster | «l'elenco degli allievi della classe» |
| credenziali | «la tessera d'ingresso (emoji + numero)» / «il foglio delle tessere» |
| session.json, report-*.html | «i resoconti della lezione», nella cartella «Attività di studio» |
| segnalibro (sessionStorage) | «tornando indietro ritrovi Insegna dov'era» |
| Finder | va bene su Mac; su Windows «Esplora file» |
| split / Affianca | «Affianca» è l'etichetta vera: usarla |
| zoom sul puntatore, pan, clamp | «la rotellina ingrandisce dove sta il mouse; trascini per spostare; l'immagine non può uscire del tutto» |

---

## 8. Dubbi (non verificati)

- **Il bug di «Attività già svolte»** (§6.6) è letto nel codice, non visto in Electron: se `preload.js` o un altro strato rimappassero `rows`→`sessions` non l'ho trovato (preload.js:20 è un `invoke` nudo). Da confermare a schermo prima di scriverlo nella guida come «sempre vuoto».
- **Il tooltip `data-tip`** sui quattro comandi: il gestore vive in `mappai-menu-hubs.js:41-48`; non ho verificato che sia caricato prima della console né il ritardo di comparsa.
- **La maniglia** che riapre la colonna ritirata: `navChiudibile` (mappai-modal.js:626) — non ho verificato che `_consSchema` la dichiari; la colonna torna comunque chiudendo il documento (2508).
- **«Cerco i materiali di questa mappa…»** in Stampabili (2749): testo riusato; potrebbe apparire per un attimo anche lì.
- **Il comportamento di «Stampa» dalla barra** su un PDF nella tela: `_consStampa` chiama `iframe.print()` che su `data:` può lanciare (commento 3247-3252) → toast «La stampa non è disponibile per questo materiale.». Non misurato quale dei due succede su un PDF.
- **Il nome della cartella dei materiali QR**: `materiali-<slug>-<data>` (main.js:2474) — non ho letto `dateStamp()` né confermato che `liveInfo.dir` (una sessione Live aperta) prevalga su `liveBaseDir()` nel caso tipico.
- **«Nome: ____________»** sulla tessera: letto nel generatore; non ho visto il PDF.
- Le etichette **del pannello «Materiali di studio»** (live-teacher.js:613-650) sono lette ma appartengono all'area Live: qui solo citate.
- **Kill-switch `mappai_visione`** su «Proietta»: lo dice HANDOFF §2 (riga 310); in `landing-teach.js` non c'è un `grep` del flag — il gate sta a monte (il vault riceve `dossier:true` solo con la visione accesa). Non verificato dove.
