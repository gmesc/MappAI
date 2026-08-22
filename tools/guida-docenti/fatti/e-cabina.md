# E — CABINA: la console delle impostazioni (fatti dal codice)

> Letto da `main` il 22/8/2026. Ogni fatto porta file:riga. Le etichette sono trascritte
> fra «…» ESATTAMENTE come stanno nel codice (i fallback di `t()` sono il testo italiano:
> `it_translations.js` non contiene NESSUNA chiave `cb_*` — `grep -c "cb_"` = 0 — quindi in
> italiano a schermo compare sempre il fallback scritto nel modulo; `i18n-helper.js:18-25`).

## 0. Com'è fatta e come si apre

- Modulo: `public/js/mappai-cabina.js` (1441 righe). Namespace `window.MappAICabina`, alias
  `window.openCabina(voce)` (`mappai-cabina.js:1438-1439`). Disegnata dal motore dei modali
  `MappAIModal` con `layout: 'console'`, `taglia: 'xl'`, a tutto schermo (`:920-927`).
- Titolo della console: «Cabina» · sottotitolo «Il tuo profilo, il contesto di lavoro e l’AI»
  (`:921-922`). Chiusura: bottone × con aria-label «Chiudi» (`mappai-modal.js:696-697`) o ESC
  (`:853`); il velo NON chiude (`veloChiude: false`, `:925`).
- **Come ci si arriva:**
  1. landing, bottone `#btn-cabina` (icona `sliders-horizontal`), aria-label «Cabina», tooltip
     «Cabina — profilo, AI, consumi, guida» → `openCabina('profilo')` (`index.html:622-626`).
     Con la veste «manifesto» accesa (`mappai_stile_manifesto`, default ON) `#header-utils` viene
     solo spostato sotto `#landing-view` (`mappai-stile-manifesto.js:258-261`): il bottone resta.
  2. da dentro un'altra console (CREA/ELABORA/INSEGNA): il «pallino» in testata, aria-label
     «Apri la Cabina» (`mappai-console-manifesto.js:121-125`). Dentro la Cabina lo stesso pallino
     è acceso e CHIUDE (`:109-113`).
  3. il bottone ambra del cassetto insegnai «Feedback & Bug» → `openCabina('feedback')`
     (`index.html:548-550`).
  4. qualunque codice che chiami `showConfigAIModal()` viene dirottato su `openCabina('ai')`
     (`mappai-ui-modals.js:256-257`).
- Alias di voce: `classe`→`classi`, `guida`→`tutorial` (`:70`). Voce sconosciuta → «Profilo
  insegnante» (`:1132`).

## 1. Etichette ESATTE a schermo

### 1.1 La colonna di navigazione (`VOCI`, `mappai-cabina.js:36-66`)
Ordine e gruppi (il primo gruppo NON ha intestazione, scelta di Giacomo `:31-35`):

| Voce (etichetta esatta) | icona Lucide | id | riga |
|---|---|---|---|
| «Profilo insegnante» | id-card | profilo | :37 |
| «Allievi» | user-round | allievi | :41 |
| «Classi» | graduation-cap | classi | :42 |
| intestazione «L’app» | — | — | :43 |
| «Aspetto e leggibilità» | type | aspetto | :44 |
| «Impostazioni AI» | bot | ai | :45 |
| «Consumi AI» | coins | consumi | :46 |
| intestazione «Imparare» | — | — | :47 |
| «Consigli di studio» | lightbulb | consigli | :48 |
| «Tutorial» | book-open | tutorial | :49 |
| intestazione «Note d’uso» | — | — | :50 |
| «Termini & Condizioni» | scroll-text | termini | :51 |
| «Privacy» | shield-check | privacy | :52 |
| intestazione «Sviluppo» | — | — | :57 |
| «insegnai.ch» | globe | insegnai | :58 |
| «Segnalazione» + sottotitolo «Invia feedback o bug» (classe `mm-nav__v--segnala`, veste ambra) | alert-triangle | feedback | :61-65 |

Il bottone che ripiega la colonna ha aria-label «Mostra o nascondi la navigazione»
(`mappai-modal.js:628`); la `<nav>` ha aria-label «Sezioni» (`:490`).

### 1.2 «Profilo insegnante» (schema da `mappai-teacher-profile.js:103-190`)
Sezioni e campi (ordine reale):
- «Chi sei»: «Nome e cognome» · «Anno scolastico» (tendina) (`:145-152`).
- «Sedi»: elenco «Sedi in cui insegni», bottone «Aggiungi sede», aiuto «Ogni classe dichiara la
  sua: qui stanno tutte quelle fra cui scegliere.» (`:155-161`). Il modale per aggiungere ha
  titolo «Aggiungi sede», campo «Nome della sede» (`:235-236`).
- «Materie»: elenco «Materie che insegni», «Aggiungi materia», aiuto «Da qui vengono i nomi che
  compaiono in tutta l’app: nelle classi, nel chip di contesto e nelle cartelle su disco.»
  (`:164-170`); modale «Aggiungi materia» / «Nome della materia».
- «Ora di classe»: spunta «Sono docente di classe», aiuto «Aggiunge «Ora di classe» fra le
  materie selezionabili, con materiali non disciplinari.» (`:108-112`); se spuntata E esistono
  classi: tendina «Classe di cui sei docente» con «— nessuna —» (`:116-121`).
- «Ruolo professionale» (largo): radio «Docente di materia» (aiuto «Si lavora per classe: mappe,
  materiali e attività sono della classe.») e «Docente di sostegno / OPI» (aiuto «Sblocca i
  profili dei singoli allievi: taratura, misure compensative e materiali individuali.»)
  (`:124-133`). Con sostegno: campo «Servizio o istituto di riferimento», aiuto «Compare
  nell’intestazione dei materiali individuali.» (`:136-140`) e sezione accentata «Profili
  individuali degli allievi» con testo «Attivi perché il ruolo dichiarato è «Docente di
  sostegno / OPI». I profili vivono sul tuo computer. Quando la taratura è attiva, nel prompt
  entrano età, grado e le note che scrivi qui — mai il nome dell’allievo.» e bottone «Gestisci
  profili» (`:177-187`).
- In coda: riquadro **«Gestione cartelle»** (`mappai-cabina.js:535-597`), vedi 1.11.
- Piè: bottone primario «Salva profilo» (`:960`); toast «Profilo insegnante salvato.» (`:1219`).
  Salvare NON chiude la console (`chiude:false`).

### 1.3 «Classi» (`mappai-cabina.js:828-850`)
- Tabella «Profili classe», colonne: «Classe» · «Grado» · «Registro» · «Materie» · «Allievi» ·
  «Azioni» (`:830-839`). Vuota: «Nessuna classe. Creane una per tarare i contenuti sul livello
  dei tuoi allievi.» (`:831`).
- Pallino sulla prima cella, tooltip: «Contesto attivo» / «Profilo con taratura speciale» /
  «Profilo standard» (`:786-790`). Colonna Azioni: bottone solo-icona «Gestisci» (`:776`).
- ⚠️ La colonna «Registro» mostra il valore GREZZO `semplice` / `medio` / `ricco` in italiano
  (`t('cb_reg_'+register, register)`, `:800`; le chiavi `cb_reg_*` esistono solo in
  `en_translations.js:2655-2657`).
- Piè: «Generico» (icona circle-dashed) · «Crea profilo» (primario, icona plus) (`:846-848`).
- Nota sotto la tabella: «Contesto attivo: classe X» / «Contesto attivo: allievo X» / «Contesto
  attivo: generico — nessuna taratura.» (`:820-826`).

### 1.4 «Allievi» (`mappai-cabina.js:852-874`)
- Tabella «Profili allievo», colonne: «Allievo» · «Classe» · «Grado» · «Età» · «Preset» · «Note
  per la taratura» · «Azioni» (`:854-863`). Vuota: «Nessuna scheda studente. Creane una per un
  allievo che segui (es. sostegno).» (`:855`).
- Piè: «Generico» · «Crea profilo» (icona user-plus) (`:867-869`).
- Nota: «Le schede allievo sono la taratura individuale: si aprono dichiarando il ruolo «Docente
  di sostegno / OPI» nel profilo.» + contesto attivo (`:871-872`).
- ⚠️ Nonostante la nota, la voce «Allievi» e «Crea profilo» NON sono condizionate dal ruolo: la
  nav elenca tutte le `VOCI` senza filtro (`:927-935`) e `nuovo-allievo` apre sempre
  `openStudentCreate` (`:1272-1276`). Il ruolo condiziona solo la sezione nel Profilo insegnante.
- Toast al clic su una riga allievo: «Scheda attiva per la taratura.» (`:1251`).

### 1.5 «Aspetto e leggibilità» (`mappai-cabina.js:986-1030`)
- Sezione «Carattere dell’app», testo «Vale per l’interfaccia e per tutto quello che MappAI
  produce: mappe, quiz, flashcard, sintesi e fogli da stampare.» (`:997-998`).
- Le 4 voci (catalogo `mappai-font-core.js:79-142`, ordine reale):
  1. «Space Mono» — «Il carattere storico di MappAI. Monospazio: ogni lettera occupa lo stesso
     spazio.» (default)
  2. «TM Sans» — «Carattere ad alta leggibilità derivato da TestMe (Perondi/Romei, a sua volta da
     Titillium). Senza corsivo.»
  3. «TM Alt» — «La variante di TestMe (Perondi/Romei) con le lettere che si scambiano più
     spesso (b d p q) disegnate diverse. Senza corsivo.»
  4. «Atkinson Hyperlegible» — «Disegnato dal Braille Institute per chi vede poco: lettere
     simili rese diverse. Ha anche il corsivo.»
  Badge sulla voce attiva: «in uso»; sulle altre senza corsivo: «senza corsivo» (`:1001-1012`).
  Icona: `check` sull'attivo, `type` sugli altri.
- Avviso se il carattere attivo non ha corsivo: «Questo carattere non ha un corsivo suo: dove
  serve (la spiegazione di una risposta nei quiz) il testo viene inclinato dal computer.»
  (`:1024-1028`).
- Nota: «I caratteri sono installati dentro MappAI: funzionano anche senza collegamento a
  internet. In ELABORA puoi dare a un singolo documento un carattere diverso da questo.» (`:1030`).
- Modulo mancante: «Il modulo dei caratteri non è caricato.» (`:992`).
- ⚠️ NESSUN riquadro di anteprima: la console stessa si ridisegna nel carattere scelto
  (`:975-985`, commento esplicito).

### 1.6 «Impostazioni AI» (`mappai-cabina.js:1047-1119`)
I comandi NON sono ridisegnati: sono gli elementi VERI di `#config-ai-modal`
(`index.html:2860-2990`) spostati dentro la tela e restituiti alla chiusura (`:1076-1119`).
Ordine a schermo: prima provider/chiave/modello, poi le due righe della lingua (`:1094-1102`).
Etichette (dal markup di `index.html`):
- «Provider AI» (`:2898`); due bottoni `#provider-google` «Google Gemini» / `#provider-infomaniak`
  «Infomaniak (CH)» (`:2901-2905`). Dopo il clic il bottone attivo mostra «✅ Google Gemini» o
  «✅ Infomaniak (CH)» (`app.js:458-464`).
- Google: «Google API Key» (`:2910`), «API key salvata localmente.» + bottone «Come ottenerla?»
  (`:2912-2916`), campo password `#gemini-api-key-input` placeholder «Inserisci chiave Google
  Gemini...» (`:2921-2923`). «Come ottenerla?» apre nel browser di sistema
  `https://aistudio.google.com/app/apikey` (`app.js:472-484`).
- Infomaniak: «Infomaniak API Token» (`:2930-2931`), «Token salvato localmente.» + «Come
  crearlo?» (`:2933-2937`; apre `https://manager.infomaniak.com/v3/ng/profile/token/api`),
  campo `#infomaniak-api-key-input` placeholder «Inserisci token Infomaniak...» (`:2941-2943`);
  «Product ID (Infomaniak)» campo `#infomaniak-product-id` placeholder «Es: 12345» (`:2947-2953`).
- «Modello AI» + bottone «Aggiorna Modelli» (icona refresh-cw) (`:2958-2964`); tendina
  `#model-select` con prima voce «Caricamento modelli in corso...» (`:2970-2973`). Stati della
  tendina: «Nessun modello (manca API Key)» · «Nessun modello (manca Product ID)» · «Nessun
  modello compatibile» · «Errore: …» (`mappai-ui-modals.js:1117, 1132, 1189, 1163`). Riga di
  stato `#models-status`: «Attesa inserimento API Key...» · «Caricamento modelli in corso...» ·
  «N modelli compatibili trovati.» · «Errore nel caricamento. Usa i modelli preimpostati.»
  (`:1120, 1142, 1226, 1230`). Toast: «Inserisci prima una API Key per caricare i modelli.» ·
  «Inserisci il Product ID per caricare i modelli Infomaniak.» (`:1118, 1133`).
- Riquadro capacità `#model-capabilities` (`mappai-ui-modals.js:1235-1270`): badge «📝 Testo» «📄
  PDF» «🌐 URL» «🎬 YouTube» «🎙️ Audio» «📊 JSON» (`:1049-1052`); costo «🆓 Gratuito (con
  limiti)» oppure «💰 ~N cent/mappa» (`:1250-1252`); i gruppi della tendina sono «⚡ Veloce» «💎
  Potente» «🟢 Economico» «📦 Legacy» «Nuovi Modelli» (`:1199`).
- Legenda provider `#pricing-legend` (`app.js:486-516`), testo Google: «🎯 Target: Consigliato
  per studenti Liceali, Universitari o Professori.» «🚀 Performance: Enorme finestra di token
  (fino a 2M), nessun timeout e generazione di enormi quantità di dettagli.» «Include piano
  Gratuito (15 req/min) e Pay-as-you-go.»; Infomaniak: «🎯 Target: Eccezionale per studenti delle
  Scuole Medie.» «⚖️ Bilanciamento: Input/Output più ridotti ma risposte veloci ed efficaci per
  l'apprendimento di base.» «Servizio basato su infrastruttura svizzera sicura.»
- Lingua: etichetta «Lingua:» (`index.html:2874`, scritta da `changeLanguage`,
  `mappai-storage-lang.js:699`) con due bottoni bandiera `#lang-btn-it` 🇮🇹 (title «Italiano») e
  `#lang-btn-en` 🇬🇧 (title «English») (`:2876-2881`).
- «Lingua delle mappe:» tendina `#map-language-select`: «Come l'interfaccia» · «Italiano» ·
  «English» · «Lingua delle fonti» (`:2884-2891`).
- Nota della Cabina: «Le chiavi restano su questo computer: non vengono mai inviate se non al
  provider che scegli qui.» (`mappai-cabina.js:1057`). Se il markup manca: «I comandi delle
  impostazioni AI non sono caricati.» (`:1080`).

### 1.7 «Consumi AI» (`mappai-cabina.js:876-917`)
- Caricamento: «Leggo il registro delle chiamate AI…» (`:880`).
- Filtri: tendina «Classe o allievo» (prima voce «— tutte le classi e gli allievi —», `:283`),
  tendina «Materia» («— tutte le materie —», `:296`), numero «Tasso USD→CHF» (min 0.1, max 3,
  `:895-904`). Azioni: «Stampa» (printer) · solo-icona «Apri la cartella del registro su disco»
  (folder-open) (`:907-909`).
- Tabella «Mappe» collassabile, colonne «Mappa» · «Classe o allievo» · «Materia» · «Chiamate AI»
  · «Totale»; prima riga «Tutte le mappe» (tooltip «Selezione corrente»); vuota «Nessuna mappa
  con questi filtri.» (`:318-344`).
- Cruscotto (tela, disegnata da `mappai-usage-dashboard.js:109-125`): tessere «Chiamate AI»
  «Token input» «Token output» «Costo input» «Costo output» «Totale»; riga «Provider:» «Modelli:»;
  avviso «Prezzo sconosciuto (costo 0) per: …»; ciambelle «Per categoria» (hint «Clicca una fetta
  per il dettaglio» / «Dettaglio della categoria selezionata», bottone «Tutte le categorie») e
  «Per modello» (hint «Costo per ciascun modello usato»); tabella «Dettaglio voci» con colonna
  «Voce» (`:128-192`). Registro vuoto: «Nessun consumo registrato» + «Il registro parte da
  adesso: genera una mappa o un materiale di studio e qui compariranno token e costi di ogni
  operazione AI.» (`:224-225`). Categorie del registro: «Tutor AI» «Attività live» «Pipeline
  materiali» «Altro» (`mappai-usage-core.js:55-92`, etichette `label:`) — le altre categorie
  esistono nello stesso blocco ma non le ho trascritte una per una (dubbio §8).
- Nota: «I costi si calcolano qui dalle tariffe dei modelli: il registro salva solo i token,
  quindi correggere il tasso o un prezzo aggiorna anche lo storico.» (`:916`).
- Manca il cruscotto: «Il cruscotto dei consumi non è caricato.» (`:361`).

### 1.8 «Consigli di studio» (`mappai-cabina.js:378-398`)
Intro «MappAI non è solo un generatore di schemi: è un ambiente di apprendimento attivo. …»
(chiave `study_intro`, `it_translations.js:103`). Sei sezioni coi titoli IT SENZA l'emoji
iniziale (`_senzaEmoji`, `:375-377`): «Ripasso Dilazionato (Spaced Repetition)» · «Active
Recall (Richiamo Attivo)» · «Metodo Feynman» · «Interleaving (Studio Alternato)» ·
«Interrogazione Elaborativa» · «Collegamento File Locali» (`it_translations.js:104-114`).
Bottone «Apri con la lettura ad alta voce» → apre il modale storico `#app-tutorial-modal`
«Metodi di Studio Attivo» (`index.html:2994-3001`). Nota: «Sono i metodi che le funzioni di
studio dell’app mettono in pratica: flashcard a intervalli, richiamo attivo, quiz, cloze.»
(`:396`) — ⚠️ cita «cloze», che è pensionato (HANDOFF §5 «PENSIONE delle sette modalità»).

### 1.9 «Tutorial» (`mappai-cabina.js:403-447`)
Intro (`cb_tu_intro`) + quattro passi: «Passo 1 — una scheda corta, una mappa piccola» · «Passo 2
— la mappa la costruisce l’allievo» · «Passo 3 — due schede sullo stesso tema» · «Passo 4 — il
capitolo intero» (`:403-424`) + «Le due leve che cambiano tutto» (`:433-435`) con bottoni «Come
usare MappAI» (apre `#app-guide-modal`, titolo «Come usare MappAI», `index.html:3050-3057`) e
«Quanto costa» (salta alla vista Consumi) (`:437-439`). Nota: «Ogni passo si prova con la stessa
fonte: cambiano la profondità e chi disegna la mappa, non l’argomento.» (`:444`).
⚠️ Il testo dei passi cita «Genera fino a» e «Mostra fino a»: in CREA il controllo si chiama
«Profondità» con bottoni «auto»/«manuale» e tendina «L2 — essenziale … L5 — massimo»
(`index.html:877-909`); `ui_gen_depth_label: "Genera fino a:"` esiste in
`it_translations.js:281` ma nessun elemento di `index.html` la usa (grep vuoto). «Mostra fino
al livello» esiste (`index.html:1590`).

### 1.10 «Termini & Condizioni» e «Privacy» (`mappai-cabina.js:449-511`)
Termini: «Che cos’è MappAI» · «I contenuti li scrive un modello» · «Chiave AI e costi» · «Uso con
gli allievi» · «Le fonti che carichi»; nota «Sintesi informativa, non un contratto. Per le
condizioni complete: insegnai.ch — giacomo@insegnai.ch».
Privacy: «Dove vivono i dati» · «Che cosa esce dal computer» · «I profili degli allievi» · «Le
attività in classe» · «Il registro degli errori» · «Cancellare» con bottone «Apri la cartella dei
consumi» (`:504`).

### 1.11 «Gestione cartelle» (in coda al Profilo; `mappai-cabina.js:535-597`)
- Titolo «Gestione cartelle». Stati: nel browser «I file di MappAI si gestiscono dall’app
  installata: qui, nel browser, non c’è un disco da mostrare.»; in lettura «Cerco la cartella…»;
  NON organizzata: «I documenti che MappAI produce sono sparsi in più cartelle dentro Documenti.
  Puoi raccoglierli in una sola — «MappAI - file» — nella posizione che scegli tu: quelli che ci
  sono già vengono spostati, non copiati.» + bottone primario «Scegli la posizione» (`:545-552`).
- Organizzata: testo «Tutto quello che MappAI scrive — mappe e vault, materiali, sessioni delle
  attività, profili, registri — vive in questa cartella sul tuo computer. …»; dati «Cartella»
  (percorso vero) · «Dentro» (elenco letto da `FilesCore.SUB` + «Diagnostica»: «Mappe · Attività
  di studio · File condivisi · Classi · Giardini · Allievi · Diagnostica», `:513-517`,
  `mappai-files-core.js:24-34`) · «Spazio di lavoro» = «N MB · P% dello spazio disponibile [—
  AVVISO/ALTO/CRITICO] · K copie vecchie dei progetti (M MB)» oppure «nessuna copia in eccesso»
  (`:565-584`). Azioni: «Apri la cartella» (primario) · «Cambia posizione» · «Libera spazio»
  (solo se ci sono copie) (`:585-590`).
- ⚠️ L'elenco «Dentro» NON nomina la cartella «Registro consumi AI», che però il main crea sotto
  la stessa madre (`main.js:2627-2629`).
- Conferma di «Libera spazio»: titolo «Libera spazio», testo «Di ogni mappa resta la copia più
  recente — quella che l’app apre. Le copie più vecchie non sono raggiungibili da nessuna
  schermata, e le mappe su disco non vengono toccate.» + «Vanno via N copie vecchie dei progetti
  (M MB): mappa (tolte) · … · +K altre mappe» (`:1312-1323`); toast «Spazio liberato: M MB (N)»
  (`:1331`).
- La finestra storica aperta da «Cambia posizione» (`mappai-files-settings.js:91-115`): titolo
  «Cartella documenti»; organizzata: «Tutti i documenti di MappAI sono organizzati in una cartella
  sola:» + «Apri la cartella» · «Cambia posizione» + «Struttura: Mappe · Attività di studio ·
  File condivisi · Classi · Giardini.»; non organizzata: «Scegli dove MappAI deve raccogliere
  TUTTI i documenti che produce (mappe, report delle attività, file condivisi, classi) in una sola
  cartella "MappAI - file".» «Oggi sono sparsi in più cartelle dentro Documenti. Finché non
  scegli, nulla cambia.» + «Scegli la posizione». Dialogo di sistema: «Scegli dove creare la
  cartella "MappAI - file"» (`main.js:3281`). Conferma (`:46-68`): «Organizza i file di MappAI» ·
  «Creerò la cartella MappAI - file in …» · «Sposto i dati esistenti» · spunta «Sposta ora i
  dati esistenti nella nuova cartella» · «Se apri il Vault in Obsidian, dopo lo spostamento
  riaprilo da MappAI - file/Mappe.» · «Nessun dato storico da spostare.» · bottoni «Annulla» /
  «Crea e organizza» → «Sto organizzando…» → toast «Fatto! I documenti di MappAI ora vivono in
  una cartella sola. (N spostati)» (`:73-83`).

### 1.12 «Segnalazione» (`mappai-cabina.js:673-767`)
- «Che cosa vuoi segnalare»: sei voci (da `app.js:2015-2024`): «Interfaccia» (palette) ·
  «Generazione AI» (bot) · «Salvataggio e file» (save) · «Bug o errore» (alert-triangle) ·
  «Suggerimento» (lightbulb) · «Altro» (circle-ellipsis). Default «Interfaccia» (`:87`).
- «Racconta cosa è successo» + testo «Più sei preciso, più è probabile che si possa correggere:
  …»; area «Descrizione della segnalazione»; bottone primario «Prepara l’email» (send).
- «Come arriva la segnalazione»: «MappAI prepara un’email, la copia negli appunti e apre il tuo
  programma di posta con giacomo@insegnai.ch già compilato. Niente parte da solo: …».
- «Che cosa viene allegato»: «La categoria che scegli, il modello AI selezionato, la versione
  dell’app e la stringa del browser interno. Nient’altro: …».
- «Gli errori restano su questo computer»: «MappAI registra gli errori in un file sul tuo disco e
  non li spedisce a nessuno: …».
- «Errori registrati» (`:715-767`): azioni «Copia gli ultimi errori» · «Apri Diagnostica» ·
  «Svuota il registro» (distruttivo). Stati: «Il registro degli errori non è caricato.» · «Leggo
  il registro…» · «Nessun errore registrato. È la condizione normale: qui compaiono solo i guasti
  veri, non i messaggi di lavoro dell’app.» (con sole azione «Apri Diagnostica») · con righe:
  «Le ultime righe scritte sul disco. …» + righe `AAAA-MM-GG HH:MM — messaggio — file:riga ·
  modello` + «Registrati in tutto: N» (+ «copia in memoria del browser (fuori dall’app
  installata)» se non c'è disco).
- Toast: «Inserisci i dettagli della segnalazione» (testo vuoto, `app.js:2032`) · «Segnalazione
  copiata e client email aperto!» / «Email preparata!» (`app.js:2069-2070`) · «Nessun errore da
  copiare.» · «Errori copiati: incollali nella segnalazione.» · «Copia non riuscita.» ·
  «Registro svuotato.» (`mappai-cabina.js:1343-1372`). Conferma svuota: «Svuota il registro» —
  «Cancella le righe degli errori registrati su questo computer. Non si torna indietro, e con
  esse sparisce il dettaglio da allegare alla segnalazione.» (`:1358-1361`).
- Nota: «Consigli e richieste valgono quanto i bug: la scelta di che cosa costruire dopo si fa
  anche così.» (`:711`).

### 1.13 «insegnai.ch» (`mappai-cabina.js:623-671`)
«Chi c’è dietro MappAI» (ritratto `insegnai_profilo.png`, testo da `about_desc1..3` senza tag) ·
«Il progetto insegnai.ch» · «Dove trovarmi» con quattro AZIONI «insegnai.ch» · «giacomo@insegnai.ch»
· «Instagram» · «Facebook» (aperte col browser di sistema via `openExternal`, `:1384-1389`).
Nota: «Questa vista crescerà: qui finiranno versione, note di rilascio e i canali dove seguire lo
sviluppo.»

### 1.14 Il modale CLASSI (`mappai-live-classes.js`, finestra storica `#class-accounts-modal`)
- Tab: «Classi» · «Studenti» (`:337-344`).
- Lista classi (`:352-385`): intro «Clicca una classe per renderla ATTIVA (tara la generazione e
  filtra la sezione Insegna). "Gestisci" per modificarla. Premi Invio per confermare e chiudere.»;
  riga: nome + «(attiva)» + «anno · N allievi · materie»; bottone «Gestisci»; vuota «Nessuna
  classe. Creane una per generare le credenziali degli allievi.»; piè «Generico» (solo se c'è
  una classe attiva) · «+ Nuova classe».
- Nuovo profilo classe (`:656-750`), titolo «Nuovo profilo classe»: «Classe» = tendina grado
  («— grado —», optgroup «Scuola Media» / «Liceo», voci «1ª» «2ª» «3ª» «4ª», `:631-645`) +
  campo «Sezione (es. A)» (maxlength 4, forzato MAIUSCOLO); anteprima «✓ Nome classe: 2A ·
  Scuola Media» o «⚠ … — nome già in uso» (`:694-702`); «Anno scolastico» (due numeri, il
  secondo si autocompila `+1`); «Numero allievi» placeholder «es. 18»; «Sede» («— sede —», solo
  se il profilo ha sedi); «Discipline insegnate in questa classe» (pillole, solo se il profilo ha
  materie) + hint «Le mappe generate finiscono in una cartella per disciplina dentro la classe.
  Con due o più discipline la generazione chiede quale.»; card «🎯 Taratura AI» con «?» (tooltip
  «Come funziona la taratura?»), hint «Guida la generazione AI (mappe, quiz, cloze) al livello
  di questa classe. Adatta il linguaggio, non i fatti.», tendina registro «— registro —» /
  «Semplice (BES/DSA, primo biennio)» / «Standard (medie / biennio)» / «Ricco (liceo /
  triennio)» (`:27-31`), textarea «Note di taratura (es. 3 DSA, 2 alloglotti; esempi dallo sport;
  evita metafore astratte)»; bottoni «Annulla» / «Crea classe».
  Errori: «Scegli il grado (1–4).» · «Esiste già la classe «2A». Cambia grado o sezione.» ·
  «Inserisci il numero di allievi.» · «Numero allievi troppo alto (max 132).» (`:722-731`).
- Profilo classe (`:857-988`), titolo «Profilo classe · 2A»: «Stampa credenziali»; card «Nome
  classe» (grado+sezione, nota «Cambiare grado o sezione rinomina la classe. I materiali e le
  sessioni già create restano legati al vecchio nome.»); card Taratura; «Aggiungi i nomi
  (facoltativo): appariranno nei report al posto di emoji+numero.»; righe allievo = emoji + numero
  + campo «Nome (facoltativo)»; bottoni «Elimina classe» · «Indietro» · «Salva nomi». Toast
  «Classe salvata.» · «Foglio credenziali salvato in Classi/2A» · «Tessera salvata in
  Allievi/Nome» · «Consenti i popup per stampare le credenziali.». Eliminazione: modale «Elimina
  la classe», etichetta «Scrivi "elimina" per cancellare la classe 2A», bottone «Elimina»
  (`:967-982`).
- Tab Studenti (`:387-442`): intro «Schede allievo per la taratura AI individuale (utile al
  docente di sostegno). "Attiva" una scheda per generare al livello di quello studente. Premi
  Invio per confermare e chiudere.»; riga (tooltip «Attiva questa scheda per la taratura»);
  «Gestisci»; «Nessuno (generico)» · «+ Nuova scheda studente».
- Scheda allievo (`:444-558`), titolo «Nuovo profilo allievo»: card «Dati studente»: «Nome /
  nickname allievo» (ph «Es. Marco») · «Età» · «Classe di appartenenza» («— nessuna classe —») ·
  «Grado e livello»; card «🎯 Taratura AI» con hint «Adatta la generazione AI (mappe, quiz,
  cloze) a questo studente quando la sua scheda è attiva. Cambia il linguaggio, non i fatti.»,
  «Preset di taratura» (stesse tre voci), note ph «Es. dislessia; frasi brevi; esempi concreti»;
  bottoni «Annulla» / «Crea scheda». Errori: «Inserisci il nome dell'allievo.» · «Esiste già una
  scheda con questo nome.»; toast «Scheda studente salvata.».
- Toast di contesto: «Classe attiva: 2A — i contenuti AI saranno tarati su questa classe» ·
  «Nessuna classe attiva: contenuti AI generici» (`:81-82`).
- Chip in testata (`:1337-1363`): due metà «Classe»/«Materia» (vuote) o nome; tooltip «Contesto
  attivo (classe o allievo, materia) — tara la generazione e filtra la sezione Insegna.». Picker
  «Contesto di lavoro» con voce «Generico» (sotto «Nessuna taratura: l’AI scrive senza un
  destinatario preciso.») e bottone «Gestisci classi e allievi» (`:1241-1275`); picker «Scegli
  la materia» con «Tutte le materie»; toast «Nessuna materia: aggiungile nel profilo insegnante.».
- Modale prima di generare «Per chi è questa mappa?» (`:1175-1239`): «Questa scelta tara il
  linguaggio dell'AI e decide in quale cartella finisce la mappa. Resta ferma per tutta la
  generazione.»; tendina «Destinatario» («Allievo: Nome» se attivo · «Generico (nessuna
  classe)» · classi) · «Materia» («— nessuna materia —»); «Annulla» / «Genera». Si chiede SEMPRE
  (`mappai_gen_ctx_sempre` default acceso, `:1122-1124`).

### 1.15 Primo avvio (`index.html:333-446`, `mappai-storage-lang.js:804-872`)
- Schermo di blocco `#beta-lock-screen` (z 10000): «MappAI» · «Il software è bloccato e legato a
  questo dispositivo.» · «Invia il seguente ID Macchina a [EMAIL_ADDRESS] per ricevere il tuo
  codice di sblocco univoco:» (⚠️ il markup dice «a Giacomo», ma `changeLanguage` sovrascrive col
  valore di `machine_id_desc` in `it_translations.js:207`, che contiene il segnaposto letterale
  `[EMAIL_ADDRESS]`) · riquadro `#machine-id-display` («CARICAMENTO...» poi 10 caratteri) ·
  bottone «Copia ID» (title) · campo password placeholder «INSERISCI SBLOCCO» · bottone «Sblocca
  Software» · errore «Codice di sblocco errato per questo dispositivo.».
- Onboarding lingue `#lang-onboarding-modal` (z 9999, SOTTO il blocco): «Benvenuto in MappAI! ·
  Welcome!» · «Scegli le lingue · Choose your languages» · «🖥 Lingua dell'interfaccia ·
  Interface language» (Italiano 🇮🇹 / English 🇬🇧) · «🗺 Lingua delle mappe · Map language»
  («Come l'interfaccia · Same as interface» / Italiano / English / «Lingua delle fonti ·
  Language of the sources» con desc «Le mappe nascono nella lingua dei documenti caricati · …») ·
  bottone «Inizia · Start».

## 2. Gesti → che cosa succede (e che cosa finisce su disco)

| Gesto | Funzione | Effetto visibile | Su disco / localStorage |
|---|---|---|---|
| Clic voce nav | `suAzione '__nav'` (`mappai-cabina.js:1170-1178`) | ridisegna la vista | — |
| «Salva profilo» | `MappAITeacherProfile.salva` (`:1215-1221`) | toast «Profilo insegnante salvato.» | `localStorage.mappai_teacher_profile` (`mappai-teacher-profile.js:29,71`) |
| Riga classe | `MappAIClasses.setActive(id)` (`:1237-1241`) | pallino, toast «Classe attiva: …»; l'allievo attivo si azzera (esclusione mutua, `live-classes.js:80`) | `localStorage.mappai_active_class` (`:22`) |
| Riga allievo | `setActiveStudent(p)` (`:1242-1251`) | toast «Scheda attiva per la taratura.»; la classe attiva si azzera in silenzio (`:329`) | `localStorage.mappai_user_profile` + `mappai_all_profiles` (`:320-322`) |
| «Generico» | azzera allievo e classe (`:1252-1259`) | nota «Contesto attivo: generico» | rimuove `mappai_active_class` |
| «Crea profilo» (Classi) / «Gestisci» | `openClassCreate` / `openClassEdit` (`:1224-1276`) | apre `#class-accounts-modal` sopra la console | — |
| «Crea classe» | `renderCreate` save (`live-classes.js:713-749`) | passa al Profilo classe; toast credenziali | `Classi/classi.json` via IPC `live-classes-save` (`main.js:2347`, `:2544`); PDF `Classi/<nome>/credenziali-<nome>.pdf` (`:1011-1033`) + copia in `localStorage.mappai_classes` |
| «Salva nomi» | (`:917-963`) | toast «Classe salvata.» | riscrive classi.json e il PDF; per ogni nome nuovo `Allievi/<nome>/credenziali-<nome>.pdf` (`:1035-1058`) |
| «Crea scheda» allievo | `wireStudentForm` (`:498-550`) | toast «Scheda studente salvata.» | `mappai_all_profiles`; crea cartella `Allievi/<nome>/` (`:1099-1104`) |
| «Elimina classe» | digitare «elimina» → `doDelete` (`:967-994`) | torna alla lista | classi.json riscritto (la cartella su disco NON viene toccata — nessun `rm` nel codice) |
| Voce carattere | `MappAIFont.imposta(id)` (`:1206-1210`; `mappai-font.js:106-122`) | tutta l'app cambia carattere subito | `localStorage.mappai_font_app`; attributo `data-font` sull'`<html>` |
| Bottone provider | `switchAIProvider` (`app.js:420-468`) | spunta ✅, campi chiave scambiati, ricarica modelli | `localStorage.ai_provider` |
| Chiave API (blur) | `saveSecureKey` (`index.html:2922`; `storageAdapter.js:64-80`) | ricarica i modelli | `localStorage.gemini_api_key` / `infomaniak_api_key` (su desktop NON il Portachiavi: il Keychain è solo Capacitor/iOS) |
| Product ID (blur) | `updateInfomaniakProductId` (`app.js:403-405`) | ricarica modelli | `localStorage.infomaniak_product_id` |
| Tendina modello | `onModelSelectChange` (`app.js:409-411`) | badge capacità + costo | `gemini_selected_model` / `infomaniak_selected_model` |
| Bandiera 🇮🇹/🇬🇧 | `changeLanguage(lang)` (`mappai-storage-lang.js:670-672`) | interfaccia ritradotta + toast (`toast_lang_it`/`toast_lang_en`, `:787-788`) | `localStorage.mappai_language` |
| «Lingua delle mappe» | onchange inline (`index.html:2886`) | nulla di visibile; vale dalla prossima generazione | `localStorage.mappai_map_language` |
| Tasso USD→CHF | `MappAIUsageDash.setRate` (`:1190`) | i totali si ricalcolano | `localStorage.mappai_usd_chf_rate` (default 0.90, `usage-dashboard.js:29-30`) |
| «Stampa» consumi | `printReport` (`:1265-1269`) | finestra «MappAI — Consumi AI» con «Stampa» (`usage-dashboard.js:296`) | — |
| Cartella consumi | IPC `usage-open-folder` (`main.js:2652`) | Finder su `…/Registro consumi AI/` (file `consumi-ai.jsonl`, `:2627-2631`) | — |
| «Apri la cartella» | IPC `files-open-root` (`main.js:3373`) | Finder sulla madre «MappAI - file» | — |
| «Cambia posizione» → «Crea e organizza» | IPC `files-setup` (`main.js:3331-3370`) | crea `MappAI - file/` + sottocartelle, SPOSTA le cartelle storiche, scrive `migrazione-log.json` | impostazioni in `userData` (`writeSettings`) |
| «Libera spazio» | (`:1300-1335`) | conferma con anteprima, toast | rimuove da localStorage le copie vecchie dei progetti e aggiorna `tutor_ai_projects` |
| «Prepara l’email» | `inviaSegnalazione` (`app.js:2029-2075`) | copia negli appunti, apre `mailto:giacomo@insegnai.ch` con oggetto «MappAI Feedback - [Categoria]» | — (nulla parte da solo) |
| «Copia gli ultimi errori» | `MappAIErrori.blocco(8)` (`:1343-1352`) | toast | appunti |
| «Apri Diagnostica» | IPC `error-open-folder` (`main.js:2820`) | Finder su `Diagnostica/` | — |
| «Svuota il registro» | `MappAIErrori.pulisci` → IPC `error-log-clear` (`main.js:2812-2818`) | toast «Registro svuotato.» | cancella `errori.jsonl` e `errori-precedenti.jsonl` |
| «Sblocca Software» | `checkBetaCode` (`index.html:407-422`) | il velo scompare | `localStorage.mappai_beta_access_granted='true'` |
| «Inizia · Start» | (`index.html`→`storage-lang.js:841-848`) | applica la lingua | `mappai_map_language`, `mappai_lang_onboarded='1'`, `mappai_language` |

Registro errori (`mappai-errori.js`): ogni riga contiene ts, dove, messaggio (≤500 car.), file,
riga, stack (≤2000), e contesto = provider, modello, titolo mappa (≤80 car.), hash della vista
(`:75-90, 121-133`). File `Diagnostica/errori.jsonl` (`main.js:2775-2778`), o `~/Documents/MappAI
- Diagnostica` se non organizzata; copia degli ultimi 50 in `localStorage.mappai_errori_recenti`.

## 3. Limiti numerici e default

- Caratteri: 4 nel catalogo; default `space-mono` (`font-core.js`, `mappai-font.js:73-78`).
- Classi: grado 1–4, due scuole (Scuola Media / Liceo) (`live-classes.js:631-645`); sezione max
  4 caratteri; allievi per classe max **132** (= 12 emoji × 11 numeri, `live-core.js:34-49`);
  nome allievo max 40 (`LIMITS.nameMax`); note di taratura max 400 caratteri (`:743, :933`);
  nome classe max 40 (`classMax`). Emoji del mazzo: 🦊 🐼 🐸 🦁 🐙 🦉 🐢 🐝 🦋 🐬 🦄 🐞.
- Tasso USD→CHF: default 0.90, min 0.1, max 3 (`cabina.js:895-899`, `usage-dashboard.js:30`).
- Badge costo: «~N cent/mappa» = (input×5k + output×4k token) (`ui-modals.js:1252`).
  Legenda Google: «piano Gratuito (15 req/min)» (`app.js:495`).
- Registro errori: dedup 60 s (`errori.js:34`), tetto 200 errori distinti per sessione (`:33`),
  copia locale 50 righe, rotazione file a 1 MB con una copia precedente (`main.js:2779-2790`).
  Nella Cabina si mostrano le ultime 8 (`:117`); nell'email le ultime 3 (`app.js:2075`).
- Spazio di lavoro (localStorage): quota MISURATA ~48 MB (`errori.js:55`); soglie 60% «AVVISO»,
  80% «ALTO», 90% «CRITICO» (`:56-60`).
- Limite provider (solo voce naturale/TTS, `usage-core.js:218-293`, `branch-synthesis.js:1563`):
  10 chiamate/minuto di default (`localStorage.mappai_tts_rpm` per cambiarlo); un 429 senza
  attesa dichiarata = 60 s; attesa ≥ 120 s o parole «per day/daily» = quota GIORNALIERA, messaggio
  «Hai esaurito la quota GIORNALIERA del modello vocale. Oggi non si può registrare: riprova
  domani, oppure cambia modello nelle impostazioni (ogni modello ha un contatore suo).»
  (`branch-synthesis.js:1695`); altrimenti «limite raggiunto, riprendo fra {s}s» per max 3
  tentativi, poi «Il provider continua a rifiutare le richieste: riprova fra qualche minuto.»
  (`:1704-1708`).
- Codice di sblocco: SHA-256(ID macchina + sale), primi 10 caratteri maiuscoli
  (`index.html:397-405`); ID macchina = SHA-256(MAC + CPU) tagliato a 10 (`main.js:3540-3554`).
- Lingua mappe default `'ui'`; lingua interfaccia default `'it'`.

## 4. Percorso tipico del docente (storyboard)

1. Landing → clic `#btn-cabina` (tooltip «Cabina — profilo, AI, consumi, guida») → si apre la
   console su «Profilo insegnante».
2. Compilare «Nome e cognome», «Anno scolastico»; «Aggiungi materia» → modale «Nome della
   materia» → pillola; scegliere «Docente di materia»; clic «Salva profilo» → toast «Profilo
   insegnante salvato.». In coda si vede «Gestione cartelle» con il percorso di «MappAI - file».
3. Nav → «Impostazioni AI»: «Google Gemini» già attivo (✅), incollare la chiave in «Inserisci
   chiave Google Gemini...», uscire dal campo → la tendina «Modello AI» si riempie («N modelli
   compatibili trovati.»), sotto i badge «📝 Testo 📄 PDF …» e «🆓 Gratuito (con limiti)».
4. Sempre lì, in basso: «Lingua:» 🇮🇹 🇬🇧 e «Lingua delle mappe:» → «Come l'interfaccia».
5. Nav → «Classi» → «Crea profilo» → finestra «Nuovo profilo classe»: grado «2ª» (Scuola Media),
   sezione «A» → anteprima «✓ Nome classe: 2A · Scuola Media»; «Numero allievi» 18; spuntare le
   discipline; registro «Standard (medie / biennio)»; «Crea classe» → toast «Foglio credenziali
   salvato in Classi/2A» e si apre «Profilo classe · 2A» con 18 righe emoji+numero.
6. «Indietro» → ESC chiude la finestra classi (un solo strato, `cabina.js:1183-1187`) → nella
   tabella «Profili classe» clic sulla riga «2A» → pallino acceso, toast «Classe attiva: 2A — …»,
   nota «Contesto attivo: classe 2A».
7. Nav → «Aspetto e leggibilità» → clic «Atkinson Hyperlegible» → l'intera console si ridisegna
   nel carattere nuovo, badge «in uso».
8. Nav → «Consumi AI» → tabella «Mappe» (vuota: «Nessuna mappa con questi filtri.») e cruscotto
   «Nessun consumo registrato».
9. Nav → «Segnalazione» → scegliere «Bug o errore», scrivere in «Descrizione della
   segnalazione», «Prepara l’email» → toast «Segnalazione copiata e client email aperto!» e
   Mail si apre su giacomo@insegnai.ch.
10. ESC o × «Chiudi» → si torna alla landing; il chip in testata mostra «2A · Materia».

## 5. Prerequisiti e stati

- **Motore dei modali** (`MappAIModal`): senza, `openCabina` ripiega sul vecchio
  `showTeacherProfileModal` (`cabina.js:1129`).
- **App installata (Electron)**: «Gestione cartelle», «Apri la cartella», «Apri Diagnostica»,
  cartella consumi e il registro su disco. Nel browser: «I file di MappAI si gestiscono dall’app
  installata…», toast «Disponibile solo nell’app installata.» (`:1274, 1285, 1353`), registro
  «copia in memoria del browser».
- **Chiave AI**: senza, la tendina dice «Nessun modello (manca API Key)» e il toast «Inserisci
  prima una API Key per caricare i modelli.»; la generazione è bloccata da «Inserisci un'API Key
  AI per continuare.» (`app.js:1246`). Infomaniak richiede anche il Product ID.
- **Schermo di blocco**: compare a ogni avvio finché `mappai_beta_access_granted` non è 'true'
  (`index.html:367-380`); copre anche l'onboarding lingue (z 10000 > 9999). Il codice si chiede
  a Giacomo; esiste un bypass `DEV-BYPASS-2026` nel codice (`index.html:412`).
- **Onboarding lingue**: SOLO se `mappai_language` non è mai stato salvato (`storage-lang.js:868-873`).
- **Cartella madre**: al boot `adottaRootEsistente()` adotta `~/Documents/MappAI - file` se esiste
  ed è «abitata» (`main.js:275-289`); altrimenti si resta nelle cartelle storiche («MappAI -
  Vault», «MappAI - Classi», «MappAI - Diagnostica», «MappAI - Consumi AI») finché il docente non
  fa «Scegli la posizione» dalla Cabina.
- **Sedi/Discipline nella classe**: i campi compaiono SOLO se il profilo insegnante ne dichiara
  (`live-classes.js:809-813, 823-829`); senza materie il picker dice «Nessuna materia: aggiungile
  nel profilo insegnante.».
- **Allievo vs classe**: si escludono; attivare l'uno azzera l'altro (`live-classes.js:80,329`).
- **Font**: con `mappai_font_selettore='0'` la vista resta ma non fa nulla (`mappai-font.js:107`).
- **Registro errori**: `mappai_error_log='0'` spegne la registrazione; la vista mostra il
  registro vuoto.

## 6. NON ESISTE

- **Nessun prompt «Organizza i documenti di MappAI» al primo avvio**: `maybePromptFirstRun` è
  definita (`mappai-files-settings.js:126-141`) ma NESSUNO la chiama (grep su `public/`, `main.js`,
  `index.html` esclusa la definizione = vuoto). La cartella «MappAI - file» si crea solo da
  Cabina › Gestione cartelle o si adotta se già presente.
- **Nessun modale «Invia segnalazione»**: pensionato il 15/8 (HANDOFF §3 «CABINA»; `app.js:2011`).
- **Nessuna telemetria / crash reporter / invio automatico**: la segnalazione è un `mailto:`
  (`app.js:2062`); il registro resta su disco (`cabina.js:663-667`, commento verificato).
- **L'Uscita forzata non si registra**: SIGKILL; coperta al giro dopo con
  `Diagnostica/sessione-aperta.json` → riga «chiusura-improvvisa» (`main.js:2834-2850`, HANDOFF).
- **Nessun selettore del contesto all'avvio** (`live-classes.js:1366-1371`): si riparte dal chip.
- **Nessuna anteprima del carattere**: la console È l'anteprima (`cabina.js:975-985`).
- **Nessun cloze**: la nota di «Consigli di studio» e gli hint di taratura lo citano ancora, ma
  le modalità sono pensionate (HANDOFF §5 «PENSIONE delle sette modalità»).
- **«Genera fino a»** non è un'etichetta visibile: il controllo in CREA si chiama «Profondità»
  (`index.html:877`); la chiave `ui_gen_depth_label` è orfana.
- **Nessuna spiegazione dedicata dei 429 per la generazione di mappe**: `grep 429|RESOURCE_EXHAUSTED`
  in `app.js`, `mappai-mm-extraction.js`, `mappai-kg-extraction.js`, `main.js` = vuoto. La logica
  «limite al minuto / quota giornaliera» vive SOLO nella voce naturale (`usage-core.js`,
  `branch-synthesis.js:1685-1708`).
- **Nessun Portachiavi su desktop**: `saveSecureKey` scrive in localStorage fuori da Capacitor
  (`storageAdapter.js:64-80`); la vista dice «API key salvata localmente.», che è esatto.
- **Nessuna cartella «Registro consumi AI» nell'elenco «Dentro»** di Gestione cartelle (vedi 1.11).
- **Nessun bottone «Adatta» nella Cabina**: «Adatta alla classe» / «Adatta linguaggio» vivono nel
  bento di CREA (`mappai-bento-composizione.js:102, 289, 602`), non qui. Nella Cabina la taratura
  si chiama «🎯 Taratura AI» (modale classi) e «Note per la taratura» (tabella Allievi).

## 7. Parole da NON usare con i docenti

| Nel codice / HANDOFF | Nella guida |
|---|---|
| Cabina (console) | va bene «Cabina» (è l'etichetta a schermo): «la pagina delle impostazioni, che si chiama Cabina» |
| console, motore dei modali, schema | «finestra», «pagina» |
| vault | «la cartella della mappa» (dentro «Mappe») |
| cartella madre / files root / `MappAI - file` | «la cartella MappAI - file, dove finisce tutto» |
| localStorage / cassetto / spazio di lavoro | «la memoria interna dell'app» (a schermo: «Spazio di lavoro») |
| potatura / `tutor_ai_projects` | «Libera spazio: toglie le copie vecchie» |
| kill-switch / flag / `mappai_*` | non nominarli |
| registro errori / `errori.jsonl` / Diagnostica | «l'elenco degli errori, nella cartella Diagnostica» |
| `MappAIErrori.diagnosi()` / console degli sviluppatori | «il comando che Giacomo può chiederti di incollare (lo spiega lui passo passo)» |
| provider / Google Gemini / Infomaniak | «il servizio AI: Google oppure Infomaniak (svizzero)» |
| API key / token / Product ID | «la chiave personale» (Infomaniak: «chiave e numero del prodotto») |
| modello / tier / Flash / Pro | «il motore AI scelto» |
| token / Chiamate AI | «quanto testo è passato / quante richieste» (a schermo restano «Token», «Chiamate AI») |
| registro linguistico / preset / «taratura» | «come l'AI parla alla classe» (a schermo: «Taratura AI», «Preset di taratura») |
| contesto attivo / chip | «la classe (o l'allievo) selezionata in alto» |
| esclusione mutua allievo/classe | «o una classe o un allievo: sceglierne uno toglie l'altro» |
| roster / credenziali / identità emoji+numero | «le tessere degli allievi (un animale e un numero)» |
| IPC / main / renderer / Electron | non nominarli |
| onboarding | «la prima volta che apri MappAI» |
| ID Macchina / codice di sblocco / beta | «il codice del tuo computer» e «il codice di sblocco che ti manda Giacomo» |
| 429 / RESOURCE_EXHAUSTED / rate limit / quota giornaliera | «il servizio ha detto di aspettare» / «per oggi la voce ha finito il suo credito gratuito» |
| KG, L1, cross-link, deepening | non toccano quest'area |
| `mailto:` | «si apre il tuo programma di posta con l'email già scritta» |

## 8. Dubbi (non verificati)

- Non ho eseguito l'app: le etichette sono lette dal codice, non da uno screenshot. In
  particolare il testo del blocco beta con «[EMAIL_ADDRESS]» dipende dal fatto che
  `changeLanguage` venga eseguita mentre il velo è visibile (il velo è nel DOM e
  `changeLanguage` processa tutti i `[data-i18n]`, `storage-lang.js:722-725`): quasi certo, non
  visto.
- L'ordine reale dei pezzi in «Impostazioni AI» dipende dal sort di `_portaAi` (`:1094-1102`):
  provider per primo, il resto nell'ordine del markup; non ho verificato dove finisce il
  blocco «Lingua delle mappi» rispetto a «Lingua:».
- Le categorie del registro consumi: ho trascritto solo le 4 etichette trovate col grep
  (`usage-core.js:55-92`); l'elenco completo va letto se la guida le nomina.
- Quanti modelli Google mostra davvero la tendina dipende dalla risposta live dell'API e dal
  filtro `MODEL_KB` (`ui-modals.js:1176-1187`): non riproducibile senza chiave.
- Il bottone «Gestisci profili» (sezione «Profili individuali degli allievi», azione
  `apri-prof`) è gestito SOLO dal modale storico del profilo (`teacher-profile.js:303`); in
  `mappai-cabina.js` non c'è nessun ramo `apri-prof` (grep vuoto): dalla Cabina quel bottone
  quasi certamente non fa nulla. Da provare in Electron.
- La voce naturale e `mappai_tts_rpm` sono dell'area sintesi, citate qui solo perché sono
  l'unico posto dove i 429 vengono spiegati.
