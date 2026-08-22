# Fatti — LE FONTI FOTOGRAFICHE e il DOSSIER

> Letto dal codice il 22/8/2026 (HEAD `e35db8f`). Ogni fatto porta `file:riga`.
> Moduli: `public/js/mappai-visione-core.js` (regole, puro), `public/js/mappai-visione.js`
> (gesto e superficie), `public/js/mappai-proiezione-core.js` (geometria, puro),
> `public/js/mappai-proiezione.js` (vista «Proietta»), più i punti d'innesto in `app.js`,
> `mappai-material-pipeline.js`, `mappai-elabora-console.js`, `mappai-landing-teach.js`,
> `mappai-quiz-print.js`, `main.js`.
> Nota sulle etichette: NESSUNA chiave `vs_*`, `pj_*`, `src_img_*`, `ec_an_*`, `ec_rig_*`,
> `mp_dossier_*` esiste in `public/traduzioni/it_translations.js` (grep vuoto) → in italiano a
> schermo compare SEMPRE il fallback scritto nel codice (`window.t` in
> `public/traduzioni/i18n-helper.js:18-25` torna il fallback se la chiave manca).
> Stato: `mappai_visione` è ACCESO di default (`docs/HANDOFF.md` §2; `mappai-visione.js:42-45`,
> spento solo con `'0'`). ⚠️ HANDOFF §5 dichiara che tutto il percorso «non è mai girato in
> Electron» al 20/8; il 21/8 (§0-quater) la superficie è stata provata via CDP.

## 1. Etichette ESATTE a schermo

### 1a. CREA — il caricamento della foto
| Etichetta | Dove | file:riga |
|---|---|---|
| «Documenti» | bottone-card `#btn-src-doc` (`.btn_selezione_input`), `data-i18n="src_docs"` | `public/index.html:706-719`; `it_translations.js:212` |
| «Testi (PDF incluso) e IMMAGINI: una foto diventa un dossier di fonte.» | nota grigia sotto il selettore file della fonte «doc» | `public/js/app.js:985` |
| (selettore file) `accept=".pdf,.txt,.csv,.md,.rtf,.docx,.jpg,.jpeg,.png,.heic,.heif"`, `multiple` | `input[type=file][data-source-id]` dentro la riga fonte | `public/js/app.js:985` |
| «Lettura file...» | stato della riga fonte, prima che l'estensione venga riconosciuta | `public/js/app.js:1066` |
| «Analisi in corso…» | stato della riga fonte (`#status-<id>`), con spinner | `public/js/app.js:1107` (chiave `src_img_leggo`) |
| «<nome file> — scheda confermata: farà un dossier» | stato verde della riga dopo «Usa questa fonte» | `public/js/app.js:1121-1122` (`src_img_ok`) |
| «<nome file> — scheda annullata: togli la fonte o ricaricala» | stato ambra se la scheda è stata chiusa senza confermare | `public/js/app.js:1128-1129` (`src_img_no`) |
| «Formato non gestito: servono JPG, PNG o HEIC.» | toast warning | `mappai-visione.js:685` (`vs_formato`) |
| «Il lettore di immagini non è caricato.» | toast warning (core assente) | `mappai-visione.js:674` |

### 1b. Il modale «Che cosa sai di questa fonte?» (prima della lettura)
Modale del motore (`MappAIModal.open`, taglia `s`, icona `image`) — `mappai-visione.js:651-666`.
| Etichetta | Ruolo |
|---|---|
| «Che cosa sai di questa fonte?» | titolo (`vs_nota_titolo`, r.653) |
| «Facoltativo, ma migliora molto la lettura: periodo, luogo, personaggi raffigurati, occasione. Quello che scrivi qui l'AI lo tiene per VERO.» | testo (r.657) |
| «Contesto (es. «manifesto USA del 1942; i tre schiacciati sono Hitler, Mussolini e l’imperatore del Giappone»)» | etichetta dell'area di testo `nota`, che cresce (r.659) |
| «Annulla» | bottone (`mm_annulla`, r.662) — abbandona il gesto |
| «Analizza» | bottone primario (`vs_nota_avanti`, r.663) |

### 1c. Il velo durante la lettura
| Etichetta | file:riga |
|---|---|
| «Analizzo la fonte con l'AI… qualche secondo.» — velo `showLoadingOverlay` con bottone di annullamento (callback) | `mappai-visione.js:696-699` (`vs_leggo`) |

### 1d. Messaggi di errore (toast, `messaggio + ' ' + rimedio`) — `mappai-visione-core.js:338-383`
| Quando | Messaggio esatto |
|---|---|
| provider Infomaniak attivo | «La lettura delle immagini passa da Google Gemini. Scegli il provider Google nelle Impostazioni AI e riprova.» (r.370-371; il toast è warning, sparato da `nuovaScheda` r.676-680 PRIMA del dialogo file) |
| chiave assente / 401 / 403 | «La chiave API non è valida per questo servizio. Controlla la chiave Google nelle Impostazioni AI.» (r.357-358) — ⚠️ con chiave MANCANTE `provaProvider` dà `'api key mancante'` (`mappai-visione.js:49`) che `diagnosi` mappa a questo stesso messaggio |
| HEIC fuori da macOS | «Questo formato si converte solo su macOS. Salva la foto come JPG o PNG e ricaricala.» (r.348-349) |
| file > 40 MB | «L'immagine è troppo grande. Riducila (o esportala a qualità più bassa) e riprova.» (r.352-353) |
| 429 / quota | «Il provider chiede di aspettare (quota). Riprova fra qualche minuto.» (r.361-362) |
| rete | «Il servizio non risponde. Controlla la connessione e riprova.» (r.366-367) |
| risposta vuota | «Il modello non ha risposto su questa immagine. Riprova, o prova con una foto più nitida.» (r.374-375) |
| timeout | «La lettura non è finita in tempo. Riprova con un'immagine più piccola, o con un modello più leggero.» (r.378-379) |
| altro | «La lettura dell'immagine non è riuscita.» + messaggio grezzo (r.381-382) |

### 1e. LA SCHEDA — superficie di validazione in CREA (`montaSuperficie`, modo `crea`)
Box `.vs-superficie.vs-superficie--crea` montato AL POSTO di `#setup-form` (il form si nasconde, `mappai-visione.js:447-451`; `#setup-form` è `public/index.html:666`). Barra comandi `.de-bar` in alto (veste degli editor, `assicuraStili` di `mappai-doc-editor.js`), `mappai-visione.js:338-392`.
| Etichetta | Selettore | file:riga |
|---|---|---|
| «La fonte, prima di generare» | titolo nella barra `.de-bar-t` | `mappai-visione.js:350` (`vs_scheda_t`) |
| <nome del file> | sottotitolo `.de-row-m` nella barra | r.351-357 |
| «Non usare questa foto» | `button.de-btn.de-btn--rosso[data-azione="scarta"]`, icona `trash-2` | r.388 (`vs_scarta`) |
| «Usa questa fonte» | `button.de-btn.de-primary[data-azione="ok"]`, icona `check` | r.389 (`vs_usa`) |
| (anteprima foto) | `<img>` in cima a `.mm-body`, max 260px di altezza | r.618-634 |
| «Titolo della fonte» | campo `data-campo="titolo"` (sezione `chi`, nuda) | r.410 (`vs_titolo`) |
| «Carta d'identità» | sezione collassabile `identita`, nota: «Che cos'è, materialmente. Correggi quello che il modello ha sbagliato o non ha visto.» | core r.174; nota `mappai-visione.js:177` |
| «Che cosa si vede» | sezione `osservazione`, nota: «Solo ciò che si VEDE. Sui fogli degli allievi non compare: sarebbe la risposta a metà delle domande — va nelle tue tracce.» | core r.183; nota r.178 |
| «Che cosa vuole ottenere» | sezione `interpretazione`, nota: «IPOTESI del modello, non fatti: ogni riga deve citare l'elemento visivo che la giustifica («— lo dice…»). Le righe senza appiglio sono state scartate. Correggi: è quello che le domande daranno per vero.» | core r.191; nota r.179 |
| «Che cosa prova questa fonte» | sezione `critica`, nota: «Che cosa questa fonte DIMOSTRA (le intenzioni di chi l'ha fatta) e che cosa tace. È la parte che trasforma un'immagine in una fonte.» | core r.200; nota r.180 |

**I 13 campi + 6, con le etichette esatte** (`mappai-visione-core.js:174-207`, fonte unica `BLOCCHI`):
- Carta d'identità (6, a riga singola): «Genere della fonte» · «Titolo o slogan» · «Autore o firma» · «Data o periodo» · «Luogo e lingua» · «Tecnica e supporto».
- Che cosa si vede (5, aree che crescono): «Descrizione» · «Testo trascritto» · «Elementi iconografici» · «Linguaggio visivo» · «Tipografia».
- Che cosa vuole ottenere (6, aree): «Corrente grafica o artistica» · «Committente» · «Destinatario» · «Finalità» · «Strategie persuasive» · «Diffusione».
- Che cosa prova questa fonte (2, aree): «Che cosa dimostra» · «Che cosa non mostra».
→ totale 19 campi; i **13 «lunghi»** (`CAMPI_LUNGHI`, `mappai-visione.js:189-191`) sono aree che crescono col testo (`cresce: true`, 3-18 righe secondo HANDOFF §3).

**I box delle opzioni in fondo (solo modo `crea`)** — `mappai-visione.js:214-242`:
| Etichetta | Campo |
|---|---|
| «Domande aperte» | sezione `op-oq` (`vs_op_oq`, r.236) |
| «Flashcard» | sezione `op-fc` (`vs_op_fc`, r.237) |
| «Le categorie dicono DA QUALI blocchi della scheda nascono; ogni angolo spuntato produce un set suo. Nessun angolo = un set misto.» | nota di ciascuno dei due box (`vs_op_d`, r.232) |
| «Genera» | spunta `oq.on` / `fc.on`, default ON (r.218) |
| «Quante per categoria» | numero `oq.n` / `fc.n`, default **3**, min 1, max 30 (r.219) |
| «Carta d'identità» · «Che cosa si vede» · «Che cosa vuole ottenere» · «Che cosa prova questa fonte» | 4 spunte «categorie» per box, default tutte ON (r.221-224) |
| «Definizione» · «Causa» · «Conseguenza» · «Esempio concreto» · «Confronto» · «Eccezione / limite» · «Applicazione / inferenza» | 7 spunte «angoli» per box (da `QUIZ_ANGLES` senza `auto`, `mappai-study-session.js:101-114`), default tutte OFF (r.225-230) |
| «Sintesi» | sezione `op-syn` (`vs_op_syn`, r.238) con nota «Un testo continuo dalla scheda. La voce naturale si aggiunge dopo, dall'editor della sintesi in ELABORA.» (r.239) e la sola spunta «Genera» default ON (r.240) |
| «Questo dossier: circa {n} chiamate all'AI (oq + fc + syn)» | riga `.mm-piede-nota[data-vs-stima]` sotto i box, aggiornata a ogni spunta | r.306-316 (`vs_stima`), r.455-461, r.569-575 |

⚠️ HANDOFF §0-ter parla di «otto angoli a spunte singole»: nel codice le spunte sono **7** (gli 8 di `QUIZ_ANGLES` meno `auto`, saltato a r.226).

**Conferme / toast della superficie**
| Etichetta | Quando | file:riga |
|---|---|---|
| «Serve almeno qualche riga di analisi: è il materiale da cui nascono i documenti.» | toast warning, «Usa questa fonte»/«Salva» con meno di 10 parole in tutta la scheda | `mappai-visione.js:484` (`vs_troppo_poco`); soglia `MIN_PAROLE = 10` core r.287 |
| «Chiudere la scheda?» | titolo della conferma a tre vie (ESC sempre; in editor anche «Esci» con modifiche) | r.501 (`vs_esc_t`) |
| «La scheda è il materiale da cui nascono i documenti del dossier.» | testo in modo crea | r.504 |
| «Le correzioni non salvate andranno perse.» | testo in modo editor | r.503 |
| «Riprendi» · «Non usare questa foto» · «Salva e chiudi» | i tre bottoni in modo crea | r.506-508 |
| «Riprendi» · «Esci senza salvare» · «Salva ed esci» | i tre bottoni in modo editor | r.506-508 |
| «Con una fonte iconografica si genera il DOSSIER: la mappa e il tema non servono — il titolo viene dalla scheda.» | `title` (tooltip) su `#mode-mindmap`, `#mode-kg` e `#root-node-name` quando c'è una foto fra le fonti (opacità 0.4, `aria-disabled`, campo `disabled`) | r.598-616 (`vs_mappa_no`); elementi `public/index.html:744,755,785` (etichette «Mappa Mentale», «Knowledge Graph», «Tema Centrale:») |
| «Il motore dei modali non è caricato.» | toast warning se manca `MappAIModal` | r.397 |

### 1f. CREA — il bottone che genera
| Etichetta | Dove | file:riga |
|---|---|---|
| «Genera materiali» (verde, icona `package`) / «Genera Mappa» (blu, icona `git-merge`) | bottone `#mn-genera` del bento «manifesto» (una sola faccia che cambia) | `mappai-costruisci-manifesto.js:1115-1135`; clic r.935-946 |
| «Scegli prima CHI: una classe o un allievo» / «Scegli anche COSA: la materia della classe» | motivo del bottone spento (toast) | `mappai-costruisci-manifesto.js:1091-1093` |
| «Chi:» · «Cosa:» | tendine `#mp-chi` · `#mp-disc` del box contesto | `mappai-bento-composizione.js:94-96` |
| «Carica almeno una fonte prima di generare i materiali» | toast di `openModal` (via storica, `#generate-materials-btn` in `index.html:1009-1014`, manifesto spento) | `mappai-material-pipeline.js:1378` |
| «Con delle immagini caricate si generano i DOSSIER delle fonti: le altre fonti non entrano (generale separatamente).» | toast info se c'è anche un PDF/testo | `mappai-material-pipeline.js:1625` (`mp_dossier_solo`) |
| «Preparo il dossier della fonte…» | velo, step A del dossier | `mappai-material-pipeline.js:985` (`mp_step_dossier`) |
| «Genero i quiz…» · «Scrivo la sintesi…» | velo, step B e D | r.523, r.754 |
| «{n} dossier lavorati — l'esito di ognuno è nel suo riepilogo» | toast a fine sequenza, solo con 2+ foto | r.1668 (`mp_dossier_fine`) |
| «Materiali generati» | titolo del riepilogo finale (`#mp-summary`), righe per step: «Mappa» · «Quiz e flashcard» · «Fogli nodi» · «Sintesi» · «Catena dei perché» con chip «fatto» / «errore» / «saltato» | r.1742; etichette r.1700-1701 — ⚠️ lo step A di un dossier si chiama comunque «Mappa» nel riepilogo |

### 1g. ELABORA — il dossier
| Etichetta | Dove | file:riga |
|---|---|---|
| «Analisi della fonte» | riga nell'elenco documenti (voce `an:<id>`, tipo «Analisi della fonte», icona `image` per i file `Analisi-fonte-*`) | `mappai-elabora-console.js:682-686`; `mappai-landing-teach.js:535` |
| «Apri la scheda di analisi» | `title` + `aria-label` del bottone `.ec-foto-fonte` (anteprima della foto, max 160px, in cima all'area del dossier aperto senza documento scelto) | `mappai-elabora-console.js:1904-1912` (`ec_foto_apri`) |
| «Modifica» | bottone dell'anteprima PDF → riapre la SCHEDA come editor | `mappai-elabora-console.js:2204` (`_optsDiskV2`), r.2621-2635 |
| «Analisi della fonte» | titolo della barra dell'editor | `mappai-visione.js:350,406` (`vs_ed_t`) |
| «Annulla» · «Rigenera materiali» · «Crea PDF» · «Salva» · «Esci» | i 5 bottoni `.de-btn[data-azione=annulla|rigenera|pdf|salva|esci]` (Salva = primario) | `mappai-visione.js:376-386` |
| «Rifà domande aperte, flashcard e sintesi da questa scheda, sovrascrivendo i materiali attuali.» | `title` di «Rigenera materiali» | r.382 (`vs_rigenera_tip`) |
| «Rigenerare i materiali?» / «Domande aperte, flashcard e sintesi si RIFANNO dalla scheda corretta e sovrascrivono i file attuali nel vault. Servono alcune chiamate all'AI e qualche minuto.» / «Annulla» · «Rigenera» | conferma del motore dopo «Rigenera materiali» | `mappai-elabora-console.js:2485-2493` |
| «Materiali rigenerati dalla scheda corretta.» | toast success | r.2497 |
| «Apri prima la mappa del dossier: i materiali vivono nel suo vault.» / «La scheda è troppo vuota per generare.» / «Una pipeline è già in corso» | toast warning di `rigeneraDossier` | `mappai-material-pipeline.js:2150-2161` |
| «Scheda corretta: archivio e PDF aggiornati.» | toast dopo Salva (PDF rifatto) | `mappai-elabora-console.js:2520` |
| «Scheda corretta e salvata in archivio.» | toast se non c'è vault aperto / Electron | r.2508 |
| «Scheda salvata, ma il PDF non si è rifatto: …» | toast warning | r.2522 |
| «Salvataggio non riuscito: archivio pieno?» | toast error | r.2470 |
| «Questo documento non porta con sé la scheda: si può stampare, ma non correggere.» | toast se il PDF/archivio non ha `qp-scheda` | r.2434 |
| «Non riesco ad aprire questo documento.» | toast di ripiego | r.2233, 2429 |
| «La pipeline dei materiali non è caricata.» | toast | r.2481 |
| «Da che cosa» | titolo del passo-sorgente nel gesto «Crea un documento» (solo Domande aperte e Flashcard, solo se `mappai_visione` acceso) con le voci «Dalla mappa» («Il materiale sono le macro-aree e le loro schede.»), «Da un'immagine» («Una fonte iconografica letta sul tuo computer: la leggi, correggi il contesto, e le domande nascono da lì.») e — se c'è già una scheda in memoria — «Dalla stessa immagine» col titolo della fonte | `mappai-crea-quiz.js:138-175` |

### 1h. INSEGNA — il dossier
| Etichetta | Dove | file:riga |
|---|---|---|
| (icona `image`) | voce del dossier nella sidebar/elenco di INSEGNA ed ELABORA (invece di `map`/`network`) | `mappai-landing-teach.js:2482`; `mappai-elabora-console.js:1150`; marcatore `dossier` da `index.yaml` via `get-all-vaults` (`main.js:3085`; `mappai-landing-teach.js:1949`) |
| «Mappa» (icona `image` sui dossier) | azione 1 della console della mappa selezionata | `mappai-landing-teach.js:2427`, 2553 |
| «Proietta» (icona `presentation`) | azione presente SOLO sui dossier (`p.dossier`) | `mappai-landing-teach.js:2432`, 2556 (`lt_cons_proietta`); gestore r.3210-3215 |
| «La fotografia a tutto schermo per la lezione, con la scheda e le domande da affiancare.» | aiuto/tooltip di «Proietta» | r.2432 (`lt_cons_tip_proietta`) |
| «Elabora» · «QR» · «Cartella»/«Finder» · «Studio attivo» · «Lavagna» | le altre azioni della console | r.2436-2440, 2554-2560 |

### 1i. La vista «Proietta» (`#pj-overlay`, sfondo `#0f172a`) — `mappai-proiezione.js:178-206`
| Etichetta | Selettore |
|---|---|
| <nome della mappa> | `.pj-titolo` nella barra `.pj-bar` |
| «Affianca» | `button.pj-btn[data-pj="split"]` (`aria-pressed`) — apre/chiude il pannello materiali; alla prima apertura mostra la scheda (r.335-340) |
| «×» con `aria-label="Chiudi"` | `[data-pj="chiudi"]` (`mm_chiudi`) |
| «−» · «100%» (percentuale viva `.pj-pct`) · «+» · «Adatta» · «100%» | pannellino `.pj-zoombar` (`[data-pj="z-"]`, `[data-pj="z+"]`, `[data-pj="fit"]`, `[data-pj="z100"]`) |
| «Scheda» | `[data-pj="scheda"]` nel pannello `.pj-mat` |
| «Domande aperte…» / «Flashcard…» | voci vuote delle due tendine `.pj-sel[data-pj="sel-oq"]` / `[data-pj="sel-fc"]` (r.279-287) |
| «A−» · «A+» | `[data-pj="a-"]`, `[data-pj="a+"]` |
| «La fotografia di questa fonte non è su questo computer: si proietta dal computer dove il dossier è stato creato.» | al posto dell'immagine, se manca sia in `Allegati/` sia in archivio (r.239) |
| «Questo dossier non ha una scheda in archivio su questo computer.» | pannello, scheda assente (r.132) |
| «Questo foglio non porta le sue domande.» / «Questo set non porta le sue carte.» | pannello (r.148, 160) |
| «La proiezione non è caricata.» | toast se manca il core (r.175) |
| (flashcard) | ogni carta è `button.pj-carta[data-pj-flip]`: fronte visibile, retro `.pj-retro[hidden]` che si mostra al clic (r.157-168, 308-315) |

## 2. Gesti → che cosa succede

1. **Clic su «Documenti» (`#btn-src-doc`)** → `window.addSource('doc')` (`app.js:957,983-985`) aggiunge una riga fonte con `<input type=file multiple>`. Scegliendo un file → `handleFileUpload(this,'doc')` (`app.js:1140`) → `processSourceFile` (`app.js:1060`): se `MappAIVisioneCore.accetta(nome)` (estensione jpg/jpeg/png/heic/heif, core r.59-77) → `leggiImmagineSorgente` (`app.js:1104`), altrimenti estrazione testo. Con più file: il primo subito, gli altri in sequenza aggiungendo una riga per ciascuno (`app.js:1163-1190`).
2. **`leggiImmagineSorgente`** → `MappAIVisione.nuovaScheda(file)` (`mappai-visione.js:671-690`): verifica flag `mappai_visione`, provider Google + chiave (`provaProvider` r.47-52), formato; poi modale «Che cosa sai di questa fonte?» (`chiediNota` r.651-667; «Annulla» → `null` → la riga dice «scheda annullata…»).
3. **«Analizza»** → `_analizza` (r.692-714): velo «Analizzo la fonte con l'AI…» → `leggi` (r.116-159): `immagine-prepara` IPC in `main.js:659-698` (copia per la LETTURA: `sips -Z 1600` in PNG; temporaneo in `userData/visione-tmp/`, cancellato subito) → payload Gemini con `inlineData` + prompt `promptAnalisi` (core r.124-166) + `injectClassTuning`, `temperature 0.2`, `maxOutputTokens 4096`, NIENTE `responseSchema` → `fetchModelAPI` (consumi registrati col contesto `pipeline: visione`, r.127-129) → `normalizzaAnalisi` (core r.218-247: scarta i campi di «Che cosa vuole ottenere» senza « — »; testo nudo cade in «Descrizione») → seconda copia per i DOCUMENTI (`sips -Z 900` JPEG, `scheda.fotoB64`) → `apriScheda` monta la superficie al posto del form.
4. **«Usa questa fonte»** (`data-azione="ok"`, r.533-538) → controllo `schedaPronta` (≥10 parole) → `scheda.opzioni` dalle spunte → la promise risolve → `src._scheda = scheda` (`app.js:1119`) → riga verde «scheda confermata: farà un dossier» → `sincronizzaGenere()` spegne MM/KG e «Tema Centrale» (r.598-616). Nulla su disco ancora.
5. **«Non usare questa foto»** (r.539-540) → `{__scarta:true}` → `removeSource(src.id)` (`app.js:1115`): la riga fonte sparisce, il form torna (r.446-449).
6. **ESC sulla superficie** → sempre la conferma a tre vie (r.490-523): «Salva e chiudi» = come «Usa questa fonte»; «Non usare questa foto» = scarta; «Riprendi» = resta.
7. **«Genera materiali»** (`#mn-genera`, manifesto) → `Pipeline._startFromModal` (`mappai-material-pipeline.js:1598-1671`): `_schedeImmagini()` raccoglie le fonti con `_scheda`; se c'è anche testo → toast «…le altre fonti non entrano»; per OGNI scheda, in sequenza, `Pipeline.run(cfgDossier(sch))` con `quiz.types` = `open` + `flashcards` (se spuntati), `perBranch 3`, `perTipo` = i numeri «Quante per categoria», `catPerTipo`, `angoliPerTipo`, `synthesis` se spuntata, `dossier: sch`.
8. **Step A del dossier** (`mappai-material-pipeline.js:975-1058`) — zero AI: `nodiDaScheda` (core r.318-333) → grafo root `fonte_0` (label = titolo, desc «Dossier di una fonte iconografica: la scheda di analisi è nei rami.») + un ramo L1 per blocco pieno (`fonte_identita`, `fonte_osservazione`, `fonte_interpretazione`, `fonte_critica`; label = titolo del blocco; `desc` = «Etichetta: valore» dei campi pieni; link `rel: 'analizza'`) → `extractionMode='mindmap'` → cartella via `_resolveFolderPath` (r.190-215) → `saveVault` → `pipeline.json` (manifest) → `buildAnalisiFonteHtml` (`mappai-quiz-print.js:613-683`) salvato in ARCHIVIO (`MappAIStudyDocs`, `kind:'analisi'`, titolo «Analisi della fonte — <Fonte>») e come PDF `Materiale Studio/Analisi-fonte-<Fonte>[ - <Carattere>].pdf` via `htmlToPdf` → la foto ORIGINALE copiata in `Allegati/<titolo-sicuro><ext>` (`ifAbsent`, r.1037-1051).
9. **Step B/D** (r.500-560, 748-775): domande aperte e flashcard PER RAMO (= per blocco scelto), un set per angolo spuntato; sintesi con la foto in testa (`data.foto`, r.757-765). ⚠️ Su un dossier `nodesheet` e `causal` sono forzati a `null` (r.953-957): niente foglio nodi né catena dei perché.
10. **ELABORA › «Modifica» / clic sulla foto** → `_modificaAnalisi` (`mappai-elabora-console.js:2427-2455`): rilegge la scheda dal JSON incorporato `#qp-scheda` dell'HTML d'archivio (`schedaFromAnalisiHtml`, `mappai-quiz-print.js:692-700`) → `montaSuperficie(scheda,{modo:'editor', host})` (r.2243-2251).
    - «Salva» → `_salvaAnalisi` (r.2459-2473): riscrive la voce d'archivio (dedup kind|title|mapName) e rifà il PDF `Analisi-fonte-<Fonte>.pdf` nel vault aperto (`_rifaiPdfAnalisi` r.2503-2524).
    - «Annulla» → i campi tornano all'ultimo salvataggio (`mappai-visione.js:546-556`).
    - «Crea PDF» → `onPdf` → `_rifaiPdfAnalisi` (solo il PDF; r.2247-2250).
    - «Rigenera materiali» → salva, poi conferma «Rigenerare i materiali?» → `Pipeline.rigeneraDossier` (`mappai-material-pipeline.js:2150-2200+`): rifà grafo, analisi (archivio + PDF), domande/flashcard (B) e sintesi (D) SOVRASCRIVENDO i file del vault aperto; le opzioni (angoli, quantità, categorie) le prende dal `pipeline.json` del vault, non dalla scheda.
    - «Esci» → se non sporca esce subito (torna all'anteprima del PDF); se sporca, conferma a tre vie «Chiudere la scheda?» (r.577-580). Lo «sporco» è l'impronta canonica dei campi (r.278-288).
11. **INSEGNA › «Proietta»** (`mappai-landing-teach.js:3210-3215`) → `MappAIProiezione.apri({mapName, vaultPath})`: foto da `Allegati/` (primo jpg/png trovato, `mappai-proiezione.js:103-119`) con ripiego sul JPEG da 900px della scheda d'archivio; rotellina = zoom sul puntatore ×1.15 (r.244-248); «+»/«−» = ×1.25 (r.343-344); drag = pan con 48px sempre dentro (core r.46-56); «Adatta» (core r.24-31, ×0.98); ESC chiude (r.323-329). Niente scritto su disco.
12. **Uscita dalla mappa / salvataggio del vault** → `buildVaultMapData` (`mappai-vault-io.js:47-60`) scrive `dossier: true` in `index.yaml` SOLO se `appState.db.nodes[0].id === 'fonte_0'` (vedi Dubbi §8.1).

## 3. Limiti numerici e default

| Che cosa | Valore | file:riga |
|---|---|---|
| Formati accettati | `.jpg .jpeg .png .heic .heif` — **niente TIFF** (decisione 20/8), niente GIF/WEBP/SVG | `mappai-visione-core.js:59`, commento r.54-58 |
| Formati mostrabili senza conversione | `.jpg .jpeg .png`; HEIC/HEIF convertiti da `sips` SOLO su macOS | core r.69; `main.js:676-683` |
| Peso massimo del file | 40 MB (`MAX_BYTE_SORGENTE`) → «L'immagine è troppo grande.» | core r.97; `main.js:669` |
| Lato massimo per la lettura AI | 1600 px, PNG | core r.93, 409-412 |
| Lato massimo della copia nei documenti | 900 px, JPEG (vive anche in localStorage) | core r.94 |
| Timeout conversione `sips` | 60 s | `main.js:688` |
| Token massimi della risposta | 4096 | core r.102 |
| Temperatura | 0.2 | `mappai-visione.js:137` |
| Chiamate AI per la lettura | 1 per immagine (non contata nel preventivo del dossier) | core r.385-399 |
| Preventivo del dossier | per genere acceso: max(1, angoli scelti) × (categorie scelte ∩ blocchi pieni, o blocchi pieni) + 1 per la sintesi. Default (tutto ON, nessun angolo, 4 blocchi pieni) = **9** (4 + 4 + 1) | core r.389-399; HANDOFF §0-quater «9 → 5 → 9» |
| «Quante per categoria» | default 3, min 1, max 30 | `mappai-visione.js:219` |
| Soglia minima della scheda | 10 parole in tutto | core r.287-294 |
| Scarto dei campi interpretativi | campo di «Che cosa vuole ottenere» senza « — » né « - » → svuotato | core r.237-239 |
| Campi lunghi | 13 aree che crescono, 3-18 righe | `mappai-visione.js:189-191`; HANDOFF §3 |
| Anteprima foto | 260 px (scheda), 160 px (ELABORA), 420 px (PDF) | `mappai-visione.js:629`; `elabora-console.js:1911`; `quiz-print.js:628` |
| Zoom della proiezione | da 5% a 800% (`Z_MIN 0.05`, `Z_MAX 8`); rotellina ×1.15, bottoni ×1.25; pan con margine 48px | `mappai-proiezione-core.js:19,46`; `proiezione.js:247,343` |
| Corpo del testo proiettato | 18 · 22 · 26 · 32 · 40 px, default 22 | `mappai-proiezione-core.js:61-67` |
| Nomi dei file | `Analisi-fonte-<Fonte>.pdf`, `Domande-aperte-<Fonte>[-<angolo>].pdf`, `Flashcard-<Fonte>[-<angolo>].pdf`, `Sintesi-<Fonte>.html`, `set-<id>.json`; con carattere scelto: suffisso ` - <Carattere>` prima dell'estensione | `mappai-pipeline-core.js:416-445, 488-515` |
| Cartella del dossier | `<cartella madre>/Mappe/<classe>/<materia>/<titolo fonte>/` (classe: da `mp-chi`; materia: da `mp-disc`) | `mappai-material-pipeline.js:190-215` |
| Output del dossier | FISSI: domande aperte + flashcard + sintesi (ognuno spegnibile dalla scheda); foglio nodi e catena dei perché mai | r.1627-1660, 953-957 |
| Step A | deterministico, 0 chiamate AI | r.976-990 |

## 4. Percorso tipico del docente (storyboard)

1. **CREA** (landing, veste manifesto): nel box «Chi:» (`#mp-chi`) scegliere la classe, in «Cosa:» (`#mp-disc`) la materia — altrimenti il bottone «Genera materiali» resta spento («Scegli prima CHI…»). Si vede: bento con i box, bottone `#mn-genera` verde.
2. Clic su **«Documenti»** (`#btn-src-doc`) → compare la riga fonte con il selettore file e la nota «Testi (PDF incluso) e IMMAGINI: una foto diventa un dossier di fonte.».
3. Scegliere una foto (es. `grind this heels.jpg`) → la riga dice «Lettura file...» poi «Analisi in corso…» → si apre il modale **«Che cosa sai di questa fonte?»** con l'area «Contesto (es. …)». Scrivere due righe (facoltativo) → **«Analizza»**.
4. Velo **«Analizzo la fonte con l'AI… qualche secondo.»** (una chiamata a Gemini).
5. Il form di CREA si spegne e al suo posto compare la **SCHEDA** `.vs-superficie--crea`: barra in alto «La fonte, prima di generare» + nome file + «Non usare questa foto» · «Usa questa fonte»; sotto: la foto, «Titolo della fonte», i quattro blocchi collassabili («Carta d'identità», «Che cosa si vede», «Che cosa vuole ottenere», «Che cosa prova questa fonte»). Screenshot dettaglio: una riga di «Che cosa vuole ottenere» con l'appiglio «— lo dicono…».
6. Correggere un campo (es. «Data o periodo»). Scorrere in fondo: i box **«Domande aperte»** e **«Flashcard»** (Genera · Quante per categoria · 4 categorie · 7 angoli), **«Sintesi»**, e la riga «Questo dossier: circa 9 chiamate all'AI (4 + 4 + 1)». Spuntare un angolo e vedere il numero cambiare.
7. Clic **«Usa questa fonte»** → la scheda si smonta, il form torna; la riga fonte è verde «<file> — scheda confermata: farà un dossier»; «Mappa Mentale», «Knowledge Graph» e «Tema Centrale:» sono sbiaditi col tooltip «Con una fonte iconografica si genera il DOSSIER…».
8. Clic **«Genera materiali»** (`#mn-genera`) → velo «Preparo il dossier della fonte…», poi «Genero i quiz…», «Scrivo la sintesi…» → riepilogo **«Materiali generati»** (righe Mappa · Quiz e flashcard · Sintesi con «fatto»).
9. **Finder**: `Mappe/4R/Storia/grind this heels/` con `index.yaml`, `links.json`, `pipeline.json`, `vista.json`, `Nodi/` (5 file .md), `Allegati/grind this heels.jpg`, `Materiale Studio/` (`Analisi-fonte-… .pdf`, `Domande-aperte-… .pdf`, `Flashcard-… .pdf`, `Sintesi-… .html`, `set-… .json`). Aprire il PDF dell'analisi: testata «Analisi della fonte» con badge «Fonte iconografica», foto, quattro riquadri viola; i campi vuoti non stampati; i blocchi interpretativi con l'etichetta «interpretazione».
10. **ELABORA** sul dossier: in cima all'area la foto piccola (tooltip «Apri la scheda di analisi»); nell'elenco la riga «Analisi della fonte». Clic sulla foto (o «Modifica» dall'anteprima del PDF) → la scheda si monta nella tela come **editor**: barra «Analisi della fonte» con «Annulla» · «Rigenera materiali» · «Crea PDF» · «Salva» · «Esci».
11. Correggere, **«Salva»** → toast «Scheda corretta: archivio e PDF aggiornati.». **«Esci»** → torna all'anteprima (se sporca: «Chiudere la scheda?» con «Riprendi» · «Esci senza salvare» · «Salva ed esci»).
12. **INSEGNA**: la riga del dossier ha l'icona della foto; selezionarla → console con «Mappa» · **«Proietta»** · «Elabora» · «QR» · «Cartella». Clic «Proietta» → schermo scuro con la foto, pannellino «− 100% + Adatta 100%», «Affianca» → pannello con «Scheda», tendine «Domande aperte…» / «Flashcard…», «A−»/«A+»; clic su una carta rivela il retro. ESC chiude.

## 5. Prerequisiti e stati

- **Flag `mappai_visione`** ≠ `'0'` (default acceso): senza, `nuovaScheda` torna `null` (`mappai-visione.js:673`) → ⚠️ la foto viene comunque riconosciuta da «Documenti» e la riga dice «scheda annullata: togli la fonte o ricaricala» (non un messaggio «funzione spenta»); il passo «Da che cosa» in ELABORA non compare (`mappai-crea-quiz.js:143-147`).
- **Provider Google** (`appState.aiProvider === 'google'`, default) + chiave (`getSystemKey()`): controllati PRIMA di aprire il dialogo file (r.676-680). Su Infomaniak: toast «La lettura delle immagini passa da Google Gemini. Scegli il provider Google nelle Impostazioni AI e riprova.» e la riga fonte resta ambra «scheda annullata…». Nessun lucchetto sui bottoni: il blocco è a posteriori, via toast.
- **macOS** per HEIC/HEIF (`sips`); su Windows/Linux jpg/png passano letti e basta, HEIC dà «Questo formato si converte solo su macOS.» (`main.js:676-679`).
- **Electron**: senza `electronAPI.immaginePrepara` la foto si legge dal `File` senza ridurla (`mappai-visione.js:88-103`); «Genera materiali», la copia in `Allegati/`, il PDF e «Proietta» con foto dal vault richiedono gli IPC Electron.
- **Classe + materia** nel bento (gate `statoContesto`), altrimenti `#mn-genera` è disabilitato con `aria-disabled` e classe `mn-card--spento` (`mappai-costruisci-manifesto.js:1115-1125`).
- **Per «Modifica»/«Rigenera materiali» in ELABORA**: il dossier deve essere la mappa APERTA (`activeVaultPath`) e la voce «Analisi della fonte» deve esistere in ARCHIVIO (`MappAIStudyDocs`, localStorage) con il JSON `qp-scheda`: su un altro computer il PDF c'è ma «Modifica» dice «Questo documento non porta con sé la scheda…» (r.2434) — e in «Proietta» il pannello dice «Questo dossier non ha una scheda in archivio su questo computer.» (HANDOFF §4 0-B, dichiarato).
- **Per «Proietta»**: la voce deve avere `dossier: true` in `index.yaml` (altrimenti l'azione non compare e l'icona è quella della mappa) — vedi Dubbi §8.1.
- **Per le tendine della proiezione**: «Domande aperte…» si popola dall'archivio (`kind:'quizpaper'` con «domande aperte» nel titolo, stesso `mapName`); «Flashcard…» dai `set-*.json` su disco in `Materiale Studio/` con `_mappa` uguale al nome e `type`/`mode` contenente «flash» (`mappai-proiezione.js:53-100`).

## 6. «NON ESISTE»

- **Nessun bottone «Immagini»/«Foto» in CREA**: la foto entra da «Documenti» e basta (`app.js:1067-1075`; HANDOFF §5 p.2 «nessun bottone Immagini»). Lo `span data-i18n="ui_tab_images"` «Immagini» in `index.html:2349` è la tab dei media di un NODO, altra cosa. ⚠️ CLAUDE.md §11 (tabella flag) cita un «bottone «Immagini» in CREA»: è SUPERATO.
- **Niente TIFF, GIF, WEBP, SVG, PDF-come-immagine**: `ESTENSIONI` core r.59.
- **Nessuna lettura con Infomaniak/Apertus**: `provaProvider` r.47-52; il motore locale Ollama della prima stesura è stato TOLTO il 20/8 (testata `mappai-visione.js:10-14`; nessun IPC `ollama` in `main.js`).
- **Nessuna «mappa generata dalla foto»**: il grafo del dossier è la scheda, deterministico (core r.310-333). MM/KG e «Tema Centrale» sono disabilitati con la foto (r.598-616).
- **Niente foglio dei nodi né catena dei perché su un dossier**, anche se spuntati nel bento (`mappai-material-pipeline.js:953-957`; HANDOFF §5 p.7).
- **Il bento «Output automatici» NON governa il dossier**: le spunte dei materiali del dossier stanno nella scheda (box in fondo); gli output sono «fissi» (r.1627-1660).
- **Nessun quiz a scelta multipla o V/F dal dossier in CREA**: `cfgDossier` produce solo `open` e `flashcards` (r.1639-1641). In ELABORA «Da che cosa» vale solo per Domande aperte e Flashcard (`GENERI_IMMAGINE`, `mappai-crea-quiz.js:138`).
- **Nessun «Immagini multiple → un solo dossier»**: ogni foto = un dossier (r.1613-1669).
- **Nessuna scheda-file nel vault**: la scheda vive SOLO nell'archivio locale (localStorage) dentro l'HTML dell'analisi (`qp-scheda`) e nel `pipeline.json` (`config.dossier`, col `fotoB64` da 900px); debito dichiarato HANDOFF §4 0-B.
- **Nessun ridimensionamento/ritaglio manuale della foto, nessuna annotazione sull'immagine** (grep `crop|ritaglia` in `mappai-visione*.js`: vuoto).
- **Nessun tooltip «perché» sui bottoni della scheda**: solo «Rigenera materiali» ha un `title` (r.381-382).
- **«Proietta» non esiste sulle mappe normali** (`if (p.dossier)`, `mappai-landing-teach.js:2432, 2556`) e non c'è un ingresso a «Proietta» da ELABORA o dalla mappa (grep `MappAIProiezione.apri` → solo landing-teach r.3213).
- **Nessuna 8ª spunta «angolo»**: 7 (HANDOFF dice «otto», ma `auto` è escluso r.226).

## 7. Parole da NON usare con i docenti

| Nel codice/HANDOFF | Nella guida |
|---|---|
| vault / vault DOSSIER | la cartella del dossier (dentro «Mappe › classe › materia») |
| dossier di fonte | il dossier della foto: la scheda + i materiali |
| scheda di analisi / superficie di validazione | la scheda della fonte (da correggere prima di generare) |
| i quattro BLOCCHI / griglia | le quattro parti della scheda |
| regola dell'appiglio | ogni ipotesi deve dire che cosa, nell'immagine, la giustifica («— lo dicono…») |
| osservazione / interpretazione | che cosa si vede / che cosa la fonte vuole ottenere |
| normalizzazione | la pulizia automatica della risposta dell'AI |
| provider Google / Gemini / `fetchModelAPI` | l'AI di Google (serve la chiave Google nelle Impostazioni AI) |
| Infomaniak | l'altro servizio AI (non legge le foto) |
| API key | la chiave dell'AI |
| `inlineData`, token, `maxOutputTokens` | (non nominare) — «una chiamata all'AI» |
| preventivo / stima | «circa N chiamate all'AI» (così com'è a schermo) |
| MM / KG / MindMap / Knowledge Graph | mappa mentale / grafo delle relazioni (qui: «la mappa») |
| L1 / rami / `fonte_0` | i quattro rami della mappa del dossier (uno per parte della scheda) |
| pipeline / step A-B-D / manifest / `pipeline.json` | «Genera materiali» e i suoi passaggi: dossier → domande e flashcard → sintesi |
| archivio / `MappAIStudyDocs` / localStorage | i documenti salvati nell'app (su QUESTO computer) |
| console / bento / manifesto | la schermata CREA, i riquadri delle opzioni |
| kill-switch / flag | (non nominare) |
| IPC / `sips` / `immagine-prepara` | «la foto viene ridotta e, se è HEIC, convertita (solo su Mac)» |
| HEIC | il formato delle foto dell'iPhone |
| `Allegati/` | la cartella «Allegati» del dossier, dove sta la foto originale |
| `Materiale Studio/` | la cartella «Materiale Studio», dove stanno PDF e sintesi |
| angoli (`QUIZ_ANGLES`) | i tagli delle domande (Definizione, Causa, Conseguenza, Esempio concreto, Confronto, Eccezione / limite, Applicazione / inferenza) |
| categorie | le parti della scheda da cui nascono domande e flashcard |
| set / `set-*.json` | il mazzo di flashcard |
| split / pannello / «Affianca» | «Affianca» (così com'è a schermo): la scheda o le domande accanto alla foto |
| zoom sul puntatore / pan / clamp | ingrandire con la rotellina, trascinare la foto |
| Trappola N / invariante N | (non nominare) |

## 8. Dubbi

1. **Il dossier d'esempio ha `dossier: false` in `index.yaml`** (`~/Claude/MappAI - guida docenti/lab/casa/MappAI - file/Mappe/4R/Storia/grind this heels/index.yaml`, `lastUpdated 2026-08-21T06:51`, mentre `pipeline.json` lo crea alle 00:27). Causa probabile, non provata in Electron: riaprendo il vault i nodi si caricano nell'ordine dei file di `Nodi/` (`_vaultWalkMd`, `main.js:1375-1385`, `readdirSync` senza `sort`; alfabeticamente `carta_d_identit__fonte_identita.md` viene prima di `grind_this_heels_fonte_0.md`) e al salvataggio successivo `buildVaultMapData` vede `nodes[0] !== 'fonte_0'` → scrive `dossier: false` (`mappai-vault-io.js:55`). Conseguenza da verificare: dopo aver aperto e chiuso il dossier, in INSEGNA sparirebbero l'icona della foto e «Proietta». Per gli screenshot: o usare un dossier appena generato, o correggere a mano `dossier: true` nel file d'esempio.
2. **Con nessun materiale spuntato nel bento** `soloMappa()` diventa vero e il bottone diventa «Genera Mappa» → `startGeneration`, non la pipeline (`mappai-costruisci-manifesto.js:942-945`); `_hasOutputNow` (`mappai-material-pipeline.js:1575`) non guarda le foto. Che cosa succeda a una foto-sola in quel caso non l'ho verificato (probabile: si tenta una mappa senza testo).
3. **Tre foto insieme**: la sequenza «tre schede una dopo l'altra» è nel codice (`app.js:1163-1190` chiama `processSourceFile` in serie), ma mai vista girare (HANDOFF §5 p.6).
4. **Il comportamento «Documenti» con `mappai_visione='0'`**: nel codice la foto resta riconosciuta e la riga dice «scheda annullata…» — HANDOFF §5 p.10 promette «niente riconoscimento foto». Da provare.
5. **ESC vs «Esci» in ELABORA aprono due conferme diverse** (ESC passa dalla console, «Salvi le modifiche?»; «Esci» dalla superficie, «Chiudere la scheda?») — dichiarato aperto in HANDOFF §0-quater; non ho letto il testo esatto della conferma della console.
6. **L'esempio di schermo «9 → 5 → 9»** del preventivo viene da HANDOFF §0-quater, non l'ho ricalcolato sui dati reali (dipende dai blocchi pieni).
7. **Il contenuto visivo dei PDF** (`Domande-aperte-…`, `Flashcard-…`) non l'ho aperto: ho letto il builder dell'analisi (`mappai-quiz-print.js:613-683`) e l'intro dei fogli di domande (`r.448-452, 572-577`: foto + contesto breve in testa, osservazione SOLO sulle tracce), non le rese.
8. **Nome del file in `Allegati/`**: `safeName(titolo,'fonte') + estensione` (`mappai-material-pipeline.js:1045-1047`); nell'esempio è `grind this heels.jpg`. Non ho letto `safeName` per dire quali caratteri toglie.
9. **Il `set-*.json` dell'esempio ha 20 flashcard con `perBranch: 5`** nel `pipeline.json` — quindi quel dossier è stato generato con una versione in cui il numero veniva dal bento (5) e non dalla scheda (3): i numeri visti negli screenshot del vault d'esempio possono differire da quelli di una generazione nuova.
10. **La riga «Lettura file...»** (`app.js:1066`) è hardcoded senza `t()`: in inglese resta in italiano. Dettaglio, non verificato a schermo.
