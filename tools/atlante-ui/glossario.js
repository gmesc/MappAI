/* Atlante UI — GLOSSARIO
 *
 * Il vocabolario condiviso: come si chiama ogni pezzo di interfaccia quando ne
 * parliamo. Non è documentazione del CSS — è il dizionario che rende una frase
 * come «nella console INSEGNA, il badge della voce» non ambigua.
 *
 * Ogni voce:
 *   sel     selettore CSS (o pseudo-test) con cui l'elemento viene RICONOSCIUTO
 *           nella superficie renderizzata. L'ordine conta: vince il PRIMO che
 *           combacia, quindi le voci specifiche stanno sopra a quelle generiche.
 *   nome    la parola da usare parlando (è questo il prodotto del file)
 *   fam     famiglia, per raggruppare la tabella e colorare i cartellini
 *   classe  la classe CSS vera, se esiste (le superfici a stile inline non ne hanno)
 *   schema  il campo dello schema del motore che lo genera, quando c'è
 *   spiega  a che serve / cosa NON è
 *
 * Le ultime voci sono STRUTTURALI: riconoscono per forma e non per classe, così
 * anche i modali vecchi (stile inline, zero classi) ricevono un nome. Senza,
 * l'atlante saprebbe nominare solo il codice nuovo — cioè proprio quello di cui
 * si ha meno bisogno di parlare.
 */
'use strict';

const GLOSSARIO = [
    /* ─────────── contenitori ─────────── */
    { sel: '.mm-overlay', nome: 'velo', fam: 'contenitore', classe: '.mm-overlay',
      spiega: 'Il fondo scuro sfocato che isola la finestra. Token unico rgba(15,23,42,.45) + blur. Con veloChiude:false il clic sul velo non chiude.', schema: 'veloChiude' },
    { sel: '.mm-box', nome: 'riquadro', fam: 'contenitore', classe: '.mm-box',
      spiega: 'Il corpo della finestra. Taglie --s 440 · --l 820 · --xl 1160 · --console · --piena (bordo a bordo, raggio 0, niente ombra).', schema: 'taglia · piena' },
    { sel: '.mm-console__side', nome: 'colonna di navigazione', fam: 'contenitore', classe: '.mm-console__side',
      spiega: 'La barra laterale della console, 272px. Contiene la navigazione. Una console senza nav è un errore di validazione.', schema: 'nav[]' },
    { sel: '.mm-console__area', nome: 'area di lavoro', fam: 'contenitore', classe: '.mm-console__area',
      spiega: 'Lo spazio a destra della colonna: ospita sezioni, filtri, tabella o tela. Colonne col campo area.', schema: "area:'una'|'due'|'tre'" },
    { sel: '.mm-console__sez, .mm-sez', nome: 'riquadro di sezione', fam: 'contenitore', classe: '.mm-sez',
      spiega: 'Un blocco di contenuto dentro l\'area. Varianti --accento e --largo. min-width:0 obbligatorio: senza, un nome lungo lo sfonda.', schema: 'sezioni[]' },
    { sel: '.mm-body__side', nome: 'barra laterale del cruscotto', fam: 'contenitore', classe: '.mm-body__side',
      spiega: 'Colonna di contesto nei layout a cruscotto (non è la navigazione: non cambia vista).', schema: "colonna:'lato'" },
    { sel: '.mm-console__side-sez', nome: 'riquadro di contesto della colonna', fam: 'contenitore', classe: '.mm-console__side-sez',
      spiega: 'Blocco informativo in fondo alla navigazione: dice dove sei, non porta altrove.', schema: "sezioni[].colonna:'lato'" },
    { sel: '.mm-body__main', nome: 'colonna principale del corpo', fam: 'contenitore', classe: '.mm-body__main', spiega: 'Il contenuto vero nei layout a cruscotto.', schema: 'layout' },
    { sel: '.mm-barra', nome: 'barra dei comandi', fam: 'azione', classe: '.mm-barra', spiega: 'Fila di comandi fuori dalle sezioni.', schema: "sezioni[].colonna:'barra'" },
    { sel: '.mm-body', nome: 'corpo', fam: 'contenitore', classe: '.mm-body',
      spiega: 'Il contenuto fra testata e piè. Varianti --2 / --3 colonne, --dash cruscotto, --console.', schema: 'layout' },
    { sel: '.mm-tela', nome: 'tela', fam: 'contenitore', classe: '.mm-tela',
      spiega: 'Spazio libero che il chiamante riempie con ciò che il motore non sa disegnare (iframe di un documento, editor, grafico). tabella + tela insieme = errore.', schema: 'tela' },

    /* ─────────── testata e piè ─────────── */
    { sel: '.mm-head__ico', nome: 'pastiglia icona', fam: 'testata', classe: '.mm-head__ico',
      spiega: 'Icona Lucide 24px su fondo chiaro, in testata. Mai emoji.', schema: 'icona' },
    { sel: '.mm-title', nome: 'titolo', fam: 'testata', classe: '.mm-title', spiega: 'Il nome della finestra.', schema: 'titolo' },
    { sel: '.mm-subtitle', nome: 'sottotitolo', fam: 'testata', classe: '.mm-subtitle',
      spiega: 'Dice DOVE sei: mappa, classe, tipo di documento.', schema: 'sottotitolo' },
    { sel: '.mm-ctx__p', nome: 'metà del chip (selettore)', fam: 'testata', classe: '.mm-ctx__p',
      spiega: 'Ogni metà del chip è cliccabile e apre il suo picker. Si azzera scegliendo «tutte», non con una crocetta.', schema: 'contesto[].scegli' },
    { sel: '.mm-ctx__x', nome: 'crocetta del chip', fam: 'testata', classe: '.mm-ctx__x',
      spiega: 'Presente solo sulle parti aggiunte al volo (il documento aperto), non sui selettori.', schema: 'contesto[].azzerabile' },
    { sel: '.mm-ctx', nome: 'chip di contesto', fam: 'testata', classe: '.mm-ctx',
      spiega: 'Vale per TUTTA la console e sopravvive al cambio di vista: è ciò che trasforma finestre scollegate in un percorso. Altezza 43px.', schema: 'contesto[]' },
    { sel: '.mm-head__az', nome: 'azioni di testata', fam: 'testata', classe: '.mm-head__az',
      spiega: 'Comandi conclusivi nelle console a tutto schermo, dove un piè sarebbe una riga sprecata in fondo.', schema: 'azioniTestata[]' },
    { sel: '.mm-head', nome: 'testata', fam: 'testata', classe: '.mm-head',
      spiega: 'Identità della finestra + comandi globali. 54-71px.', schema: '—' },
    { sel: '.mm-close', nome: 'comando di chiusura', fam: 'testata', classe: '.mm-close',
      spiega: 'La × in alto a destra. Bersaglio 44×44: è l\'uscita, il bersaglio da non sbagliare.', schema: '—' },
    { sel: '.mm-foot__sx', nome: 'lato distruttivo del piè', fam: 'piede', classe: '.mm-foot__sx',
      spiega: 'Il distruttivo si isola a sinistra, lontano dalle azioni conclusive.', schema: "azioni[].ruolo:'distruttivo'" },
    { sel: '.mm-foot__dx', nome: 'azioni conclusive', fam: 'piede', classe: '.mm-foot__dx', spiega: 'Annulla + primario, a destra.', schema: 'azioni[]' },
    { sel: '.mm-foot', nome: 'piè di pagina', fam: 'piede', classe: '.mm-foot',
      spiega: 'Sticky con sfumatura quando il modale supera 88vh: senza, si compila un form senza vedere come si conclude.', schema: 'azioni[]' },
    { sel: '.mm-piede-nota', nome: 'nota del piè', fam: 'piede', classe: '.mm-piede-nota', spiega: 'Riga di avvertenza accanto ai bottoni conclusivi.', schema: 'piedeNota' },

    /* ─────────── navigazione ─────────── */
    { sel: '.mm-nav__g', nome: 'intestazione di gruppo', fam: 'navigazione', classe: '.mm-nav__g',
      spiega: 'Non cliccabile e non contata come voce: divide la navigazione per ENTITÀ (la classe · i documenti · io e l\'app).', schema: "nav[].gruppo" },
    { sel: '.mm-nav__n', nome: 'contatore della voce', fam: 'navigazione', classe: '.mm-nav__n', spiega: 'Numero in coda alla voce di navigazione.', schema: 'nav[].contatore' },
    { sel: '.mm-nav__t', nome: 'etichetta della voce', fam: 'navigazione', classe: '.mm-nav__t', spiega: 'Il testo della voce di navigazione.', schema: 'nav[].etichetta' },
    { sel: '.mm-nav__v', nome: 'voce di navigazione', fam: 'navigazione', classe: '.mm-nav__v',
      spiega: 'Cambia la vista dell\'area ed emette l\'evento __nav. Attiva con attiva:true.', schema: 'nav[]' },
    { sel: '.mm-nav', nome: 'navigazione', fam: 'navigazione', classe: '.mm-nav', spiega: 'L\'elenco delle viste della console.', schema: 'nav[]' },
    { sel: '.mm-console__man', nome: 'maniglia della colonna', fam: 'navigazione', classe: '.mm-console__man',
      spiega: 'Linguetta 22×26 a cavallo del bordo: chiude e riapre la navigazione. Discreta per scelta (opacità .75, niente ombra).', schema: 'navChiudibile · navChiusa' },
    { sel: '.mm-scheda', nome: 'scheda (tab)', fam: 'navigazione', classe: '.mm-scheda', spiega: 'Vista dentro la vista. Emette __scheda.', schema: 'schede[]' },
    { sel: '.mm-schede-riga', nome: 'riga delle schede', fam: 'navigazione', classe: '.mm-schede-riga',
      spiega: 'Schede e comandi sulla STESSA riga (colonna:\'barra\'): due righe ruberebbero altezza al contenuto.', schema: "sezioni[].colonna:'barra'" },
    { sel: '.mm-schede', nome: 'fila delle schede', fam: 'navigazione', classe: '.mm-schede',
      spiega: 'In cima all\'area. Con colonna:\'barra\' i comandi stanno sulla stessa riga, spinti a destra.', schema: 'schede[]' },

    /* ─────────── elenchi e tabelle ─────────── */
    { sel: '.mm-voce__n', nome: 'nome della voce', fam: 'elenco', classe: '.mm-voce__n',
      spiega: 'Riga principale. Tronca con l\'ellissi; il testo intero arriva nel fumetto dopo 900ms, e solo se è davvero troncato.', schema: 'voci[].nome' },
    { sel: '.mm-voce__s', nome: 'seconda riga della voce', fam: 'elenco', classe: '.mm-voce__s', spiega: 'La riga grigia sotto il nome: tipo, data, contesto.', schema: 'voci[].sotto' },
    { sel: '.mm-voce__b', nome: 'badge della voce', fam: 'elenco', classe: '.mm-voce__b', spiega: 'Etichetta in coda alla riga (data, stato, conteggio).', schema: 'voci[].badge' },
    { sel: '.mm-voce__i', nome: 'icona della voce', fam: 'elenco', classe: '.mm-voce__i', spiega: 'Icona Lucide in testa alla riga.', schema: 'voci[].icona' },
    { sel: '.mm-voce__az', nome: 'comandi di riga', fam: 'elenco', classe: '.mm-voce__az',
      spiega: 'Azioni proprie della voce: NON concludono la finestra (elimini un file e l\'elenco resta aperto).', schema: 'voci[].azioni[]' },
    { sel: '.mm-voce', nome: 'voce d\'elenco', fam: 'elenco', classe: '.mm-voce',
      spiega: 'Riga da 56px che si comporta come un bottone. chiude:false quando non deve concludere la finestra.', schema: 'voci[]' },
    { sel: '.mm-voci__g', nome: 'intestazione di gruppo dell\'elenco', fam: 'elenco', classe: '.mm-voci__g', spiega: 'Non cliccabile, non contata fra le voci.', schema: "voci[].gruppo" },
    { sel: '.mm-voci', nome: 'elenco', fam: 'elenco', classe: '.mm-voci',
      spiega: 'Righe che si scelgono. Oltre 12 voci senza gruppi il validatore avvisa: «diventa un muro».', schema: 'voci[]' },
    { sel: '.mm-elenco__piu', nome: 'comando aggiungi', fam: 'elenco', classe: '.mm-elenco__piu',
      spiega: 'Un «+» senza etichetta di aggiunta fa scattare un avviso: non dice cosa aggiunge.', schema: 'campi[].aggiungi' },
    { sel: '.mm-elenco__x', nome: 'togli voce', fam: 'elenco', classe: '.mm-elenco__x', spiega: 'Rimuove una riga dall\'elenco modificabile.', schema: '—' },
    { sel: '.mm-elenco__v', nome: 'riga dell\'elenco modificabile', fam: 'elenco', classe: '.mm-elenco__v', spiega: 'Una sede, una materia: voce aggiunta dall\'utente.', schema: 'campi[].valori[]' },
    { sel: '.mm-elenco', nome: 'elenco modificabile', fam: 'elenco', classe: '.mm-elenco',
      spiega: 'Campo a cui si aggiungono voci: chi insegna in due istituti non deve sceglierne uno e correggere a mano.', schema: "campi[].tipo:'elenco'" },
    { sel: '.mm-tab__grip', nome: 'maniglia di colonna', fam: 'tabella', classe: '.mm-tab__grip',
      spiega: 'Bordo destro trascinabile: al primo trascinamento tutte le colonne fissano la larghezza che hanno.', schema: 'tabella.ridimensionabile' },
    { sel: '.mm-tab__frec', nome: 'freccia di ordinamento', fam: 'tabella', classe: '.mm-tab__frec',
      spiega: 'Occupa il suo posto anche da spenta: senza, l\'intestazione ballerebbe al primo clic.', schema: 'tabella.ordinabile' },
    { sel: '.mm-scelta', nome: 'cella di scelte', fam: 'tabella', classe: '.mm-scelta',
      spiega: 'Valori cliccabili dentro una cella (le materie di una classe): accorciano la strada fra «vedo» e «lavoro su».', schema: 'righe[][].scelte[]' },
    { sel: '.mm-bollino', nome: 'bollino di stato', fam: 'tabella', classe: '.mm-bollino',
      spiega: 'Pallino verde/grigio. Porta SEMPRE title e aria-label: il colore da solo è un canale che non tutti leggono.', schema: 'righe[][].bollino' },
    { sel: '.mm-tab__vuota', nome: 'stato vuoto della tabella', fam: 'stato', classe: '.mm-tab__vuota',
      spiega: 'Quello che resta quando non c\'è niente da mostrare: è lo stato che nessuno disegna e tutti incontrano.', schema: 'tabella.vuota' },
    { sel: '.mm-cella-scelte', nome: 'cella di scelte (contenitore)', fam: 'tabella', classe: '.mm-cella-scelte', spiega: 'La cella che contiene i valori cliccabili.', schema: 'righe[][].scelte[]' },
    { sel: '.mm-tab', nome: 'tabella', fam: 'tabella', classe: '.mm-tab',
      spiega: 'colgroup dichiarato una volta, th sticky, prima colonna = identità. Righe con celle ≠ colonne = errore.', schema: 'tabella' },
    { sel: '.mm-tab-wrap', nome: 'area di scorrimento della tabella', fam: 'tabella', classe: '.mm-tab-wrap', spiega: 'Scorre SOLO la tabella: testata, navigazione e filtri restano fermi.', schema: '—' },
    { sel: '.mm-dati', nome: 'righe di dati', fam: 'contenuto', classe: '.mm-dati',
      spiega: 'Un fatto per riga, etichetta → valore. In un paragrafo unico i numeri si leggono come prosa e ci si perde.', schema: 'dati' },

    /* ─────────── azioni ─────────── */
    { sel: '.mm-btn--distruttivo', nome: 'bottone distruttivo', fam: 'azione', classe: '.mm-btn--distruttivo',
      spiega: 'Rosso, solo per ciò che cancella. Il fuoco non si posa mai su di esso.', schema: "azioni[].ruolo:'distruttivo'" },
    { sel: '.mm-btn--primario', nome: 'bottone primario', fam: 'azione', classe: '.mm-btn--primario', spiega: 'L\'azione conclusiva. Uno solo per finestra.', schema: "azioni[].ruolo:'primario'" },
    { sel: '.mm-btn--icona', nome: 'bottone di sola icona', fam: 'azione', classe: '.mm-btn--icona',
      spiega: '44×44, grigio a riposo. L\'etichetta diventa aria-label + fumetto: mai muto.', schema: 'azioni[].soloIcona' },
    { sel: '.mm-btn', nome: 'bottone-azione', fam: 'azione', classe: '.mm-btn', spiega: 'Corpo 14px, bersaglio 47px, icona 20px.', schema: 'azioni[]' },
    { sel: '.mm-sez__azioni', nome: 'fila di azioni', fam: 'azione', classe: '.mm-sez__azioni', spiega: 'I bottoni di una sezione.', schema: 'sezioni[].azioni[]' },
    { sel: '.mm-sez__esito', nome: 'riga di esito', fam: 'stato', classe: '.mm-sez__esito',
      spiega: 'Sotto i bottoni: dice cosa è stato scelto o com\'è andata. È la conseguenza del bottone, non la sua spiegazione (quella sta sopra).', schema: 'sezioni[].sotto' },

    /* ─────────── campi ─────────── */
    { sel: '.mm-filtri', nome: 'barra dei filtri', fam: 'campo', classe: '.mm-filtri',
      spiega: 'Governa l\'elenco sotto, effetto immediato: per questo non le si chiede un titolo di sezione.', schema: "sezioni[].colonna:'filtri'" },
    { sel: '.mm-campo', nome: 'campo', fam: 'campo', classe: '.mm-campo',
      spiega: 'Bordo trasparente per scelta, riempimento chiaro, 16px. Solo segnaposto: mai etichetta sopra il campo.', schema: 'campi[]' },
    { sel: '.mm-campo-riga', nome: 'riga di campi', fam: 'campo', classe: '.mm-campo-riga', spiega: 'Griglia dei campi di una sezione.', schema: 'campi[]' },
    { sel: '.mm-opz__t', nome: 'titolo dell\'opzione', fam: 'campo', classe: '.mm-opz__t', spiega: 'La scelta.', schema: 'campi[].opzioni[].etichetta' },
    { sel: '.mm-opz__d', nome: 'spiegazione dell\'opzione', fam: 'campo', classe: '.mm-opz__d', spiega: 'Che cosa cambia scegliendola.', schema: 'campi[].opzioni[].desc' },
    { sel: '.mm-opz', nome: 'opzione', fam: 'campo', classe: '.mm-opz', spiega: 'Radio o spunta con la sua riga di spiegazione.', schema: 'campi[].opzioni[]' },
    { sel: '.mm-label', nome: 'etichetta di campo', fam: 'campo', classe: '.mm-label', spiega: 'Usata solo dove il segnaposto non basta.', schema: 'campi[].etichetta' },

    /* ─────────── stato e testo ─────────── */
    { sel: '.mm-sez__t', nome: 'titolo di sezione', fam: 'contenuto', classe: '.mm-sez__t',
      spiega: 'L\'indicazione che RESTA anche a campi compilati: un gruppo di 2+ campi scritti lo esige.', schema: 'sezioni[].titolo' },
    { sel: '.mm-errore', nome: 'messaggio d\'errore', fam: 'stato', classe: '.mm-errore', spiega: 'Sotto il campo, con bordo rosso sul campo stesso.', schema: '—' },
    { sel: '.mm-hint', nome: 'riga di aiuto', fam: 'stato', classe: '.mm-hint', spiega: 'Spiegazione breve sotto un campo o un\'azione.', schema: 'campi[].aiuto' },
    { sel: '.mm-nota', nome: 'nota', fam: 'stato', classe: '.mm-nota', spiega: 'Avvertenza dentro l\'area, fuori dalle sezioni.', schema: 'nota' },
    { sel: '.mm-tip', nome: 'fumetto al passaggio', fam: 'stato', classe: '.mm-tip', spiega: 'Solo se il testo è davvero troncato, e dopo 900ms.', schema: '—' },
    { sel: '.mm-testo', nome: 'testo di sezione', fam: 'contenuto', classe: '.mm-testo', spiega: 'La spiegazione sopra le azioni.', schema: 'sezioni[].testo' },

    /* ─────────── famiglie storiche (pm-* e btn_*) ─────────── */
    { sel: '.pm-icon-wrap', nome: 'pastiglia icona (storica)', fam: 'testata', classe: '.pm-icon-wrap', spiega: 'Equivalente di mm-head__ico nei modali non ancora migrati.', schema: '—' },
    { sel: '.pm-title', nome: 'titolo (storico)', fam: 'testata', classe: '.pm-title', spiega: 'Da migrare a .mm-title.', schema: '—' },
    { sel: '.pm-subtitle', nome: 'sottotitolo (storico)', fam: 'testata', classe: '.pm-subtitle', spiega: 'Da migrare a .mm-subtitle.', schema: '—' },
    { sel: '.pm-section-title', nome: 'titolo di sezione (storico)', fam: 'contenuto', classe: '.pm-section-title', spiega: 'Da migrare a .mm-sez__t.', schema: '—' },
    { sel: '.pm-section', nome: 'riquadro di sezione (storico)', fam: 'contenitore', classe: '.pm-section', spiega: 'Da migrare a .mm-sez.', schema: '—' },
    { sel: '.pm-option-label', nome: 'titolo dell\'opzione (storico)', fam: 'campo', classe: '.pm-option-label', spiega: 'Da migrare a .mm-opz__t.', schema: '—' },
    { sel: '.pm-option-desc', nome: 'spiegazione dell\'opzione (storica)', fam: 'campo', classe: '.pm-option-desc', spiega: 'Da migrare a .mm-opz__d.', schema: '—' },
    { sel: '.pm-option', nome: 'opzione (storica)', fam: 'campo', classe: '.pm-option', spiega: 'Da migrare a .mm-opz.', schema: '—' },
    { sel: '.pm-btn-primary, .btn_salva_action', nome: 'bottone primario (storico)', fam: 'azione', classe: '.pm-btn-primary', spiega: 'Da migrare a .mm-btn--primario.', schema: '—' },
    { sel: '.pm-btn-cancel, .btn_annulla_action', nome: 'bottone annulla (storico)', fam: 'azione', classe: '.pm-btn-cancel', spiega: 'Oggi rosso: per decisione va bianco con bordo, il rosso resta al distruttivo.', schema: '—' },
    /* ⚠️ «bottone-card della landing» copriva con un nome solo gli avvii rapidi
       e i bottoni-fonte, che fanno due cose diverse: sono diventati due voci nel
       blocco «landing» qui sotto. Vince il PRIMO selettore che combacia, quindi
       una voce generica messa qui sopra le avrebbe zittite entrambe. */
    { sel: '.teach-section-card', nome: 'sezione della landing', fam: 'contenitore', classe: '.teach-section-card',
      spiega: 'Header slate-600 + icona indigo + chevron. Larghezza del contenuto: token unico della landing.', schema: '—' },
    { sel: '.landing-input', nome: 'campo della landing', fam: 'campo', classe: '.landing-input', spiega: 'Destinato a confluire in .mm-campo (verdetto del 31/7).', schema: '—' },
    { sel: '.de-block', nome: 'blocco dell\'editor', fam: 'contenuto', classe: '.de-block',
      spiega: 'Riga del documento in ELABORA: l\'etichetta a sinistra È il selettore del tipo di blocco.', schema: '—' },

    /* ─────────── landing e cromo della mappa ───────────
       Sono le superfici NON migrate, ed è proprio per quelle che serve un nome:
       finché «il bottone in alto a destra» resta l'unico modo di indicarle, ogni
       richiesta va tradotta a mano. I selettori usano [data-orig-id] perché
       l'atlante rinomina gli id dei blocchi estratti da index.html (due elementi
       con lo stesso id nella stessa pagina sarebbero un difetto vero). */
    { sel: '.glass-card', nome: 'lastra della landing', fam: 'contenitore', classe: '.glass-card',
      spiega: 'Il pannello di vetro che contiene tutta la landing. Larghezza del contenuto: 1240px (token unico, §10.16 — mai un max-w custom).', schema: '—' },
    { sel: '.hero_title_main', nome: 'marchio', fam: 'testata', classe: '.hero_title_main',
      spiega: 'Il nome dell\'app accanto all\'icona. Sotto non c\'è più la riga di separazione: su una schermata quasi vuota era l\'elemento più marcato.', schema: '—' },
    { sel: '[data-orig-id="header-utils"]', nome: 'header a due comandi', fam: 'testata', classe: '#header-utils',
      spiega: 'Chip del contesto + Cabina. Erano cinque comandi: quattro bottoni solo-icona portavano a quattro viste della STESSA finestra. Il chip lo monta renderChip() (mappai-live-classes.js).', schema: 'contesto[]' },
    { sel: '[data-orig-id="btn-cabina"], #btn-cabina', nome: 'bottone Cabina', fam: 'azione', classe: '.btn_header_setting',
      spiega: 'Cerchio del diametro del chip (token --mm-ctx-h, 43px), teal-400 → teal-600, icona bianca. ⚠️ Bianco su teal-400 fa 1,86:1: sotto i 3:1 che WCAG chiede a un\'icona che porta informazione.', schema: '—' },
    /* stile «manifesto» (3/8): il selettore esce dalla barra centrale e diventa
       una colonna di forme sul bordo sinistro, presente su ogni schermata */
    { sel: '#manifesto-rail', nome: 'rail delle modalità', fam: 'navigazione', classe: '#manifesto-rail',
      spiega: 'La colonna delle tre forme a sinistra: è il selettore Costruisci/Elabora/Insegna, montato da mappai-stile-manifesto.js. Chiama gli stessi setMode dei segmenti storici — è una veste, non un secondo comando.', schema: '—' },
    { sel: '.man-forma', nome: 'forma di modalità', fam: 'navigazione', classe: '.man-forma',
      spiega: 'Triangolo = Costruisci · esagono = Elabora · cubo = Insegna. Verde = invito (prima pagina) · viola = attiva · grigio = sei altrove. Codice doppio forma+colore, con aria-label: da sola l\'icona sarebbe muta.', schema: '—' },
    { sel: '#manifesto-home', nome: 'ritorno alla prima pagina', fam: 'navigazione', classe: '#manifesto-home',
      spiega: 'Il mini-logo in basso a sinistra: riporta alla schermata d\'ingresso vuota (setMode(\'\')). Compare solo dentro una modalità.', schema: '—' },
    { sel: '.landing-mode-seg', nome: 'segmento di modalità', fam: 'navigazione', classe: '.landing-mode-seg',
      spiega: 'Costruisci · Elabora · Insegna. All\'avvio NESSUNO è attivo: la landing si apre vuota, e lo stato \'\' è un valore che readMode() sa nominare.', schema: '—' },
    { sel: '.teach-filter-seg', nome: 'segmento del filtro classe', fam: 'navigazione', classe: '.teach-filter-seg',
      spiega: 'Mostra tutto / Solo classe attiva. Compare solo in INSEGNA; con la console accesa il filtro è il chip.', schema: '—' },
    { sel: '.step_container', nome: 'passo di COSTRUISCI', fam: 'contenitore', classe: '.step_container',
      spiega: 'Uno dei riquadri numerati del modulo di generazione. Nella vista ridotta i passi non ancora disponibili stanno al 15% con pointer-events:none.', schema: '—' },
    { sel: '.step_badge', nome: 'numero del passo', fam: 'stato', classe: '.step_badge',
      spiega: 'Pastiglia colorata (blue/green/orange/yellow). La vista ridotta li toglie: l\'ordine lo dice l\'opacità.', schema: '—' },
    { sel: '.step_title', nome: 'titolo del passo', fam: 'testata', classe: '.step_title', spiega: 'Intestazione del riquadro numerato.', schema: '—' },
    { sel: '.btn_selezione_input', nome: 'bottone-fonte', fam: 'azione', classe: '.btn_selezione_input',
      spiega: 'Documenti · URL · YouTube · Audio · Testo. Nella vista ridotta resta solo il PDF, a tutta colonna.', schema: '—' },
    { sel: '.source_btn_text', nome: 'etichetta del bottone-fonte', fam: 'azione', classe: '.source_btn_text', spiega: 'Il testo sotto l\'icona, centrato su due righe.', schema: '—' },
    { sel: '.btn_mode_selector, .btn_mode_selector_sm', nome: 'scelta del genere di mappa', fam: 'azione', classe: '.btn_mode_selector',
      spiega: 'MindMap / Knowledge Graph. La scelta cambia i comandi sotto: il tema (MM) o il numero di nodi (KG).', schema: '—' },
    { sel: '.btn_quick_action', nome: 'avvio rapido', fam: 'azione', classe: '.btn_quick_action',
      spiega: 'I tre avvii in fondo a COSTRUISCI. Grigio a riposo, emerald-400 al passaggio: è l\'accento dei bottoni-card (§10.16).', schema: '—' },
    { sel: '.landing_label_primary, .landing_label_secondary, .input_label_sm', nome: 'etichetta della landing', fam: 'campo', classe: '.landing_label_primary',
      spiega: 'Etichetta sopra il campo. Nei modali al motore questa forma è stata scartata: resta il solo segnaposto + aria-label.', schema: '—' },
    { sel: '.input_text_step3, .l1-topic-input', nome: 'campo di COSTRUISCI', fam: 'campo', classe: '.input_text_step3',
      spiega: 'Campo del modulo di generazione: non è .mm-campo, quindi non prende i token (bordo, riempimento, altezza 44).', schema: '—' },
    { sel: '[data-orig-id="floating-actions-menu"]', nome: 'menu delle azioni rapide', fam: 'contenitore', classe: '#floating-actions-menu',
      spiega: 'Il menu radiale della mappa: 8 hub + Annulla + Home. È la superficie che la console Mappa (D1) sostituisce.', schema: '—' },
    { sel: '[data-orig-id="map-control-card"]', nome: 'barra dei comandi della mappa', fam: 'contenitore', classe: '#map-control-card',
      spiega: 'CENTRA · Layout · zoom · TESTO · LINK · «Mostra fino a» · FISSA. Sta fuori dal contenitore del canvas (z-30): resta sopra la vista studio.', schema: '—' },

    /* ─────────── strutturali (per le superfici a stile inline) ───────────
       Qui il riconoscimento è per FORMA, non per classe: i modali storici non
       hanno classi semantiche, e senza queste voci l'atlante saprebbe nominare
       solo il codice nuovo — cioè proprio quello di cui si parla di meno. */
    { sel: '[data-atl="velo"]', nome: 'velo (senza classi)', fam: 'contenitore', classe: '—',
      spiega: 'Il contenitore a schermo intero del modale storico: stessa funzione di .mm-overlay.', schema: '—' },
    { sel: '[data-atl="riquadro"], [role="dialog"]', nome: 'riquadro (senza classi)', fam: 'contenitore', classe: '—',
      spiega: 'Modale costruito a stile inline: stessa funzione di .mm-box, ma niente token — è materiale da migrare.', schema: '—' },
    { sel: 'h1, h2, h3, h4', nome: 'titolo (senza classi)', fam: 'testata', classe: '—',
      spiega: 'Intestazione scritta a mano invece che con .mm-title / .mm-sez__t.', schema: '—' },
    { sel: '[class*="overflow-y-auto"], [style*="overflow-y:auto"], [style*="overflow-y: auto"], [style*="overflow:auto"]',
      nome: 'area con scorrimento', fam: 'contenitore', classe: '—',
      spiega: 'La parte che scorre. In una console scorre SOLO la tabella: testata, navigazione e filtri restano fermi.', schema: '—' },
    { sel: 'label', nome: 'etichetta di campo (senza classi)', fam: 'campo', classe: '—',
      spiega: 'Nel motore l\'etichetta sopra il campo è stata scartata: resta il solo segnaposto + aria-label.', schema: '—' },
    { sel: 'ul, ol', nome: 'elenco puntato', fam: 'contenuto', classe: '—', spiega: 'Testo elencato, non righe che si scelgono (quelle sono .mm-voci).', schema: '—' },
    { sel: 'img', nome: 'immagine', fam: 'contenuto', classe: '—', spiega: 'Allegato o anteprima.', schema: '—' },
    { sel: 'table', nome: 'tabella (senza classi)', fam: 'tabella', classe: '—', spiega: 'Righe multiple con colonne: la regola §10.15 chiede table + colgroup, mai una grid ripetuta riga per riga.', schema: '—' },
    { sel: 'select', nome: 'tendina', fam: 'campo', classe: '—', spiega: 'Scelta fra valori noti.', schema: '—' },
    { sel: 'textarea', nome: 'area di testo', fam: 'campo', classe: '—', spiega: 'Testo lungo. Invio NON conclude la finestra.', schema: '—' },
    { sel: 'input[type=checkbox], input[type=radio]', nome: 'spunta / radio', fam: 'campo', classe: '—', spiega: 'I radio di un gruppo devono condividere il name.', schema: '—' },
    { sel: 'input', nome: 'campo (senza classi)', fam: 'campo', classe: '—', spiega: 'Serve comunque un aria-label: il solo segnaposto non basta agli assistivi.', schema: '—' },
    { sel: 'button', nome: 'bottone (senza classi)', fam: 'azione', classe: '—', spiega: 'Stile inline: fuori dai token. Corpo e bersaglio vanno misurati caso per caso.', schema: '—' },
    { sel: '[data-lucide], svg.lucide', nome: 'icona Lucide', fam: 'contenuto', classe: '—', spiega: '20px nei bottoni, 24px in testata. Mai emoji nei titoli o nei bottoni.', schema: '—' }
];

/* famiglie → colore del cartellino */
const FAMIGLIE = {
    contenitore: '#dc2626', testata: '#7c3aed', piede: '#7c3aed', navigazione: '#0284c7',
    elenco: '#059669', tabella: '#059669', azione: '#c2410c', campo: '#0f766e',
    stato: '#b45309', contenuto: '#475569'
};

module.exports = { GLOSSARIO, FAMIGLIE };
