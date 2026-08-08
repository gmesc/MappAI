/* ═══════════════════════════════════════════════════════════════════════════
   IL BENTO DELLE CONSOLE — la composizione delle AREE come DATO (5/8/26)

   Perché esiste: le console disegnate finora avevano l'area piena di forme
   diverse — tabelle, file di bottoni, riquadri scritti a mano — mentre COSTRUISCI
   è una griglia modulare di riquadri (il bento). Giacomo, 5/8: «in tutte le
   console areas usa il più possibile dei box allineati con il bento di CREA».
   Quindi l'area di una console si compone con la STESSA grammatica del bento:
   quattro colonne, moduli che occupano 1-4 colonne, un passo solo, tre corpi.

   Che cosa NON è: un secondo motore. I riquadri escono con le classi `.mn-card`
   del bento e prendono il foglio della veste — se cambia là, cambiano qui.

   Differenza vera col bento di CREA, e va detta: là un modulo ACCOGLIE un pezzo
   che esiste già nel form (`sposta`), qui il pezzo lo DISEGNA il renderer (una
   console non ha un form sotto da cui prendere i controlli). Per questo ogni voce
   dichiara una `forma` — è quella a dire che cosa disegnare.

   Si compone nell'officina: public/dev/officina-console.html
   ═══════════════════════════════════════════════════════════════════════════ */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.MappAIConsoleBento = factory();
}(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    /* le quattro colonne del bento: lo stesso numero di CREA, perché è lo stesso
       ritmo — un'area a 3 o a 5 colonne si leggerebbe come un'altra schermata */
    var COLONNE = 4;

    /* Le FORME che un pezzo può avere dentro un'area. Il renderer sa disegnare
       queste e nient'altro: una forma nuova è una decisione, non un dettaglio. */
    var FORME = {
        azione: 'bottone che fa una cosa',
        scelta: 'due o più facce, una attiva (segmento)',
        campo: 'campo da compilare',
        tendina: 'scelta da un elenco',
        interruttore: 'acceso/spento (chip + pallino)',
        tabella: 'elenco di righe con colonne',
        materiali: 'gruppo di tabelle collassabili di documenti, per genere',
        elenco: 'righe che si scelgono',
        esito: 'testo che dice com\'è andata o quanto costa',
        tela: 'lo spazio che ospita un pezzo vero dell\'app (editor, grafico)'
    };

    /* Una TELA è l'eccezione dichiarata: dentro ci vive un pezzo dell'app che il
       bento non disegna (l'editor dei documenti). Prende tutta la riga e resta
       una sola per area — due tele si contenderebbero lo spazio, ed è il difetto
       che il motore già rifiuta per `tabella` + `tela`. */
    var MAX_TELE = 1;

    /* ── LE AREE ──────────────────────────────────────────────────────────────
       `briciole` = il percorso nella barra (regola di Giacomo, 5/8): il titolo
       della console È il percorso, e ogni livello riporta indietro di un passo.
       `colonna` = le voci di navigazione; `comandi` = i comandi che stanno nella
       COLONNA sotto la navigazione (è lì che vanno quelli del documento, così la
       sotto-barra sparisce).
       `moduli` = il bento dell'area. */
    var AREE = [
        /* ── F1 · Documenti, elenco ──────────────────────────────────────── */
        {
            id: 'f1-documenti',
            console: 'Documento',
            vista: 'Elenco',
            briciole: [
                {
                    id: 'sezione',
                    et: 'Elabora'
                },
                {
                    id: 'documenti',
                    et: 'Documenti'
                }
            ],
            colonna: [
                {
                    id: 'fonte',
                    et: 'Fonte',
                    icona: 'file-search'
                },
                {
                    id: 'tutti',
                    et: 'Tutti',
                    icona: 'copy',
                    contatore: 34
                },
                {
                    id: 'quiz',
                    et: 'Quiz',
                    icona: 'help-circle',
                    contatore: 9
                },
                {
                    id: 'flash',
                    et: 'Flashcard',
                    icona: 'copy',
                    contatore: 6
                },
                {
                    id: 'sintesi',
                    et: 'Sintesi',
                    icona: 'file-text',
                    contatore: 7
                },
                {
                    id: 'nodi',
                    et: 'Fogli dei nodi',
                    icona: 'layout-grid',
                    contatore: 12
                },
                {
                    id: 'qr',
                    et: 'Condivisi (QR)',
                    icona: 'qr-code',
                    contatore: 3
                }
            ],
            comandi: [
                {
                    id: 'f1-nuovo',
                    et: 'Nuovo documento',
                    icona: 'plus',
                    primaria: true,
                    aiuto: 'Apre la scelta del tipo (Quiz, Flashcard, Foglio dei nodi, Sintesi, Catena dei perché) e crea un documento vuoto di quel tipo.'
                }
            ],
            moduli: [
                {
                    id: 'elenco-doc',
                    titolo: 'Documenti',
                    icona: 'files',
                    span: 4,
                    altezza: 420,
                    voci: [
                        {
                            id: 'f1-tabella',
                            et: 'Elenco dei documenti',
                            forma: 'tabella',
                            colonne: ['Documento', 'Tipo', 'Classe', 'Materia', 'Contenuto', 'Data'],
                            aiuto: 'Un documento per riga. Si apre premendo la riga; i comandi di riga (stampa, condividi, elimina) stanno in coda.'
                        },
                        {
                            id: 'v1786007885842',
                            et: 'Cerca:',
                            forma: 'campo',
                            aiuto: 'Filtra l\'elenco mentre scrivi: cerca nel nome del documento, non nel suo contenuto.',
                            w: '30'
                        },
                        {
                            id: 'v1786007944707',
                            et: 'Archivio · Su disco',
                            forma: 'scelta',
                            aiuto: 'ARCHIVIO: i documenti registrati dall\'app. SU DISCO: i file che stanno nella cartella del vault, anche quelli che l\'app non ha generato.',
                            w: '10'
                        }
                    ],
                    stile: {
                        bg: '#f1f4f8',
                        testo: '#404040',
                        bordoCol: '#f1f4f8'
                    },
                    bottoni: {
                        bg: '#dee0e4'
                    }
                }
            ],
            aspetto: {
                area: {
                    padX: 70,
                    padY: 45
                },
                colonna: {
                    icona: 23,
                    raggio: 10,
                    altezzaVoce: 44,
                    passo: 2
                },
                barra: {
                    opacitaPrec: 35
                }
            }
        },

        /* ── F2 · Documento aperto ────────────────────────────────────────── */
        {
            id: 'f2-documento',
            console: 'Documento',
            vista: 'Documento aperto',
            briciole: [
                {
                    id: 'sezione',
                    et: 'Elabora'
                },
                {
                    id: 'documenti',
                    et: 'Documenti'
                },
                {
                    id: 'tipo',
                    et: 'Quiz'
                },
                {
                    id: 'file',
                    et: 'Storia della Carta'
                }
            ],
            colonna: [
                {
                    id: 'fonte',
                    et: 'Fonte',
                    icona: 'file-search'
                },
                {
                    id: 'tutti',
                    et: 'Tutti',
                    icona: 'copy',
                    contatore: 34
                },
                {
                    id: 'quiz',
                    et: 'Quiz',
                    icona: 'help-circle',
                    contatore: 9,
                    attiva: true
                },
                {
                    id: 'flash',
                    et: 'Flashcard',
                    icona: 'copy',
                    contatore: 6
                },
                {
                    id: 'sintesi',
                    et: 'Sintesi',
                    icona: 'file-text',
                    contatore: 7
                },
                {
                    id: 'nodi',
                    et: 'Fogli dei nodi',
                    icona: 'layout-grid',
                    contatore: 12
                },
                {
                    id: 'qr',
                    et: 'Condivisi (QR)',
                    icona: 'qr-code',
                    contatore: 3
                }
            ],
            comandi: [
                {
                    gruppo: 'Che cosa vedi'
                },
                {
                    id: 'd-contenuto',
                    et: 'Contenuto',
                    icona: 'pencil-line',
                    attivo: true,
                    aiuto: 'Il testo del documento, come si scrive.'
                },
                {
                    id: 'd-aspetto',
                    et: 'Aspetto',
                    icona: 'palette',
                    aiuto: 'Colori, corpo del testo e spaziatura del foglio.'
                },
                {
                    id: 'd-anteprima',
                    et: 'Anteprima di stampa',
                    icona: 'eye',
                    aiuto: 'Il foglio come esce dalla stampante, con i margini veri.'
                },
                {
                    gruppo: 'Che cosa ne fai'
                },
                {
                    id: 'd-annulla',
                    et: 'Annulla',
                    icona: 'rotate-ccw',
                    aiuto: 'Torna indietro di un passo. Non tocca la mappa.'
                },
                {
                    id: 'd-html',
                    et: 'HTML',
                    icona: 'code',
                    aiuto: 'Apre il documento come pagina, da condividere o archiviare fuori dall\'app.'
                },
                {
                    id: 'd-vault',
                    et: 'Nel vault',
                    icona: 'download',
                    aiuto: 'Scrive il PDF nella cartella «Materiale Studio» del vault della mappa.'
                },
                {
                    id: 'd-stampa',
                    et: 'Stampa',
                    icona: 'printer',
                    aiuto: 'Apre il foglio nella finestra di stampa del sistema.'
                },
                {
                    id: 'd-salva',
                    et: 'Salva',
                    icona: 'save',
                    primaria: true,
                    aiuto: 'Salva le modifiche nel documento. Finché non salvi, uscendo compare la finestra di salvataggio.'
                }
            ],
            moduli: [
                {
                    id: 'foglio',
                    titolo: '',
                    icona: '',
                    span: 4,
                    altezza: 620,
                    nuda: true,
                    voci: [
                        {
                            id: 'f2-tela',
                            et: 'Il foglio del documento',
                            forma: 'tela',
                            aiuto: 'Qui dentro vive l\'editor vero (mappai-doc-editor.js): il foglio identico a come verrà stampato.'
                        }
                    ]
                }
            ],
            aspetto: {
                colonna: {
                    icona: 23
                },
                barra: {
                    opacitaPrec: 35
                }
            }
        },

        /* ── D1 · INSEGNA · mappa scelta ──────────────────────────────────────
           È la schermata finale del percorso INSEGNA (il campo `console` dice
           «Mappa» perché è la mappa scelta, ma la sezione è Insegna). La sidebar
           È la lista delle MAPPE filtrate dal chip; l'area è un bento a due
           righe: i comandi della mappa (4 bottoni) e i suoi materiali per
           genere. Cablaggio: `openConsoleInsegna` in mappai-landing-teach.js. */
        {
            id: 'd1-mappa',
            console: 'Insegna',
            vista: 'Mappa scelta',
            briciole: [
                { id: 'sezione', et: 'Insegna' },
                { id: 'contesto', et: '1ªA' },
                { id: 'materia', et: 'Scienze' },
                { id: 'mappa', et: 'La Fotosintesi' }
            ],
            /* la colonna È l'elenco delle mappe (MM e KG), filtrate dal chip
               classe·materia — NON le categorie d'azione: quelle sono i comandi
               della mappa e stanno nella riga in alto dell'area. Icone diverse
               per genere, le stesse dell'app reale (MM `git-merge`, KG `network`).
               Nel banco è un mock; nell'app arriva da `contestoDelleMappe`. */
            colonna: [
                { id: 'm-fotosintesi', et: 'La Fotosintesi', icona: 'git-merge', attiva: true },
                { id: 'm-cellula', et: 'La Cellula', icona: 'git-merge' },
                { id: 'm-ecosistema', et: 'L’Ecosistema', icona: 'network' },
                { id: 'm-respirazione', et: 'La Respirazione', icona: 'git-merge' },
                { id: 'm-catena', et: 'Catena alimentare', icona: 'network' }
            ],
            comandi: [],
            moduli: [
                /* riga 1 · i comandi della mappa: aprirla, elaborarla,
                   condividerla via QR, aprirne la cartella. Modulo nudo a 4
                   colonne = una riga di 4 bottoni (sostituisce il banner verde
                   «MAPPA»). Sono azioni che nell'app esistono già. */
                {
                    id: 'mappa-azioni', titolo: '', icona: '', span: 4, altezza: 145, nuda: true,
                    voci: [
                        /* «Mappa» porta l'icona DEL GENERE della mappa aperta, la stessa
                           della sidebar (mock: La Fotosintesi = MM = `git-merge`; nell'app
                           la sceglie il progetto selezionato, MM `git-merge` / KG `network`). */
                        { id: 'a-mappa', et: 'Mappa', forma: 'azione', icona: 'git-merge', primaria: true, aiuto: 'Apre la visualizzazione della mappa mentale.' },
                        /* «Elabora» = l'esagono, la stessa forma del pallino ELABORA nel rail */
                        { id: 'a-elabora', et: 'Elabora', forma: 'azione', icona: 'hexagon', aiuto: 'Apre ELABORA sulla fonte e sui documenti di questa mappa.' },
                        { id: 'a-qr', et: 'QR', forma: 'azione', icona: 'qr-code', aiuto: 'Condivide un materiale con la classe via codice QR.' },
                        { id: 'a-folder', et: 'Cartella', forma: 'azione', icona: 'folder', aiuto: 'Apre la cartella del vault nel Finder.' }
                    ],
                    stile: { bg: 'transparent', testo: '#404040', bordoPx: 0 },
                    bottoni: { bg: '#f1f4f8', testo: '#404040', hoverBg: '#41e6aa', hoverTesto: '#0b0b0b' },
                    layout: { colonneVoci: 4 }
                },
                /* riga 2 · i materiali della mappa per genere: tabelle
                   collassabili su due colonne, ognuna con anteprima di cinque
                   righe e scorrimento oltre. Lo stesso elenco che `_consSchema`
                   già produce nell'app (`_consTabelleMateriali`), impaginato a
                   bento. La forma `materiali` è il «nuovo tipo di box». */
                {
                    id: 'mappa-materiali', titolo: '', icona: '', span: 4, nuda: true,
                    voci: [
                        { id: 'mat', et: 'Materiali di studio', forma: 'materiali', aiuto: 'I documenti già prodotti per questa mappa, divisi per genere. Ognuno si apre premendo la riga; oltre cinque, la tabella scorre.' }
                    ],
                    stile: { bg: 'transparent', testo: '#404040', bordoPx: 0 }
                }
            ],
            aspetto: {
                area: { padX: 70, padY: 45, colonne: 4, tetto: 1000, passo: 14 },
                colonna: { icona: 23 },
                barra: { opacitaPrec: 35 }
            }
        }
    ];

    /* ── L'ASPETTO: la griglia su cui si allineano i pezzi (5/8, Giacomo) ────
       Tre gruppi, uno per pezzo della console. Ogni valore ha un ripiego uguale a
       com'è oggi: un'area che non dichiara niente esce identica.
       ⚠️ Sono VARIABILI CSS, non regole: il foglio le legge
       (`mappai-console-manifesto.css`), l'officina le scrive sull'anteprima e chi
       monta la console le scrive dal dato. Così quello che si compone nel banco è
       quello che l'app può fare — non un disegno che poi qualcuno traduce. */
    /* ── I TOKEN GLOBALI: valgono per TUTTE le console (5/8, Giacomo) ────────
       «Gli allineamenti nella sidebar vanno applicati a tutte le sidebar»: quello
       che è di tutte le console vive qui, in un livello sopra l'area. La gerarchia
       è dichiarata e ha un ordine solo:
           GLOBALE → CONSOLE → VISTA (l'area) → RIQUADRO → VOCE
       Ogni livello sovrascrive quello sopra, e solo per le chiavi che tocca.
       Serve a non ritrovarsi la stessa decisione presa quattro volte in quattro
       posti — che è come si finisce con quattro sidebar diverse. */
    var TOKEN_BASE = {
        chip: {
            altezza: 43, raggio: 999, fondo: '#f1f4f8', testo: '#404040',
            bordo: 'transparent', corpo: 12
        },
        campi: {
            altezza: 32, raggio: 10, largMin: 120, tendinaLarg: 160
        },
        riquadri: { raggio: 18, ombra: 'nessuna' },
        colonna: { allinea: 'sinistra' },
        /* la maniglia che mostra/nasconde la colonna: posizione, taglia, e i colori
           nei DUE stati (mostra · nascondi) — così l'icona può cambiare veste quando
           la colonna è aperta o chiusa. */
        maniglia: {
            top: 14, taglia: 34, raggio: 8,
            x: 0,                          /* spostamento orizzontale dal confine */
            /* l'icona dell'app è `panel-left-close` («‹»); il disegno di Giacomo
               (maniglia.svg pag.1) è `panel-right-close` («›») → 180° da APERTO. */
            rot: '180', rotChiusa: '0',    /* orientamento del glifo (mostra · nascondi) */
            angolo: 'basso-dx',            /* l'unico angolo arrotondato del box */
            /* box di sfondo BIANCO (Giacomo 7/8): sul bianco della colonna resta l'icona */
            fondo: '#ffffff', segno: '#ac72fe',
            fondoChiusa: '#ffffff', segnoChiusa: '#ac72fe'
        },
        /* la colonna di navigazione: il margine sopra i suoi contenuti (sotto la
           maniglia). 14 = com'è oggi; alzalo per dare aria in cima alla colonna. */
        sidebar: { margineSopra: 14 }
    };

    var OMBRE = {
        nessuna: 'none',
        lieve: '0 1px 2px rgba(15,23,42,.06)',
        media: '0 4px 14px rgba(15,23,42,.10)'
    };

    var ASPETTO_BASE = {
        barra: {
            altezza: 76,          /* --mnc-testata (= la banda della landing, 76px) */
            corpo: 30,            /* --mn-tit-fs: il livello «Cosa» a dimensione piena */
            colore: '#404040',    /* --mn-tit-col: «Cosa» sempre piena (rgb 64,64,64) */
            opacitaPrec: 55,      /* i livelli dopo «Cosa», in % */
            opacitaSep: 35,       /* i separatori › */
            scalaAltri: 60,       /* --mn-bric-scale: i livelli dopo «Cosa» al 60% del corpo */
            hairline: '#ebebeb'   /* --mnc-hairline: il filetto sotto la barra (= la banda landing) */
        },
        colonna: {
            larghezza: 272,       /* --mm-console-side */
            altezzaVoce: 44,
            corpoVoce: 13,
            passo: 2,             /* fra una voce e l'altra */
            raggio: 10,
            imballaggio: 14,      /* il margine laterale su cui le voci si allineano */
            icona: 18
        },
        area: {
            padX: 24, padY: 20,
            passo: 14,            /* il passo del bento: lo stesso di CREA */
            colonne: COLONNE,
            tetto: 1240,          /* --mnc-max */
            allinea: 'sinistra'   /* 'sinistra' | 'centro' */
        }
    };

    /* i token globali, con le scelte di chi compone sopra i valori di partenza */
    function tokenDi(scelte) {
        var out = {};
        Object.keys(TOKEN_BASE).forEach(function (g) {
            out[g] = {};
            Object.keys(TOKEN_BASE[g]).forEach(function (k) {
                var mio = scelte && scelte[g] && scelte[g][k];
                out[g][k] = (mio === 0 || mio) ? mio : TOKEN_BASE[g][k];
            });
        });
        return out;
    }

    /* le variabili dei token globali: si scrivono su <html> (o sulla radice
       dell'anteprima), non sul riquadro di UNA console — è il livello sopra */
    function variabiliGlobali(scelte) {
        var t = tokenDi(scelte);
        /* il box della maniglia ha UN solo angolo arrotondato (disegno di Giacomo):
           quale, lo dice `angolo`; il raggio è quello della maniglia. */
        var rr = t.maniglia.raggio + 'px';
        var ANGOLI = {
            'alto-sx': rr + ' 0 0 0', 'alto-dx': '0 ' + rr + ' 0 0',
            'basso-dx': '0 0 ' + rr + ' 0', 'basso-sx': '0 0 0 ' + rr
        };
        return {
            '--mnc-chip-h': t.chip.altezza + 'px',
            '--mnc-chip-r': t.chip.raggio + 'px',
            '--mnc-chip-bg': t.chip.fondo,
            '--mnc-chip-txt': t.chip.testo,
            '--mnc-chip-bordo': t.chip.bordo,
            '--mnc-chip-fs': t.chip.corpo + 'px',
            '--mnc-campo-h': t.campi.altezza + 'px',
            '--mnc-campo-r': t.campi.raggio + 'px',
            '--mnc-campo-min': t.campi.largMin + 'px',
            '--mnc-tendina-w': t.campi.tendinaLarg + 'px',
            '--mnc-card-r': t.riquadri.raggio + 'px',
            '--mnc-card-ombra': OMBRE[t.riquadri.ombra] || 'none',
            '--mnc-voce-just': t.colonna.allinea === 'centro' ? 'center' : 'flex-start',
            '--mnc-man-top': t.maniglia.top + 'px',
            '--mnc-man-size': t.maniglia.taglia + 'px',
            '--mnc-man-r': t.maniglia.raggio + 'px',
            '--mnc-man-bg': t.maniglia.fondo,
            '--mnc-man-fg': t.maniglia.segno,
            '--mnc-man-bg-chiusa': t.maniglia.fondoChiusa,
            '--mnc-man-fg-chiusa': t.maniglia.segnoChiusa,
            '--mnc-man-x': t.maniglia.x + 'px',
            '--mnc-man-rot': t.maniglia.rot + 'deg',
            '--mnc-man-rot-chiusa': t.maniglia.rotChiusa + 'deg',
            '--mnc-man-radii': ANGOLI[t.maniglia.angolo] || ANGOLI['basso-dx'],
            '--mnc-side-top': t.sidebar.margineSopra + 'px'
        };
    }

    function aspettoDi(a) {
        var out = {};
        Object.keys(ASPETTO_BASE).forEach(function (g) {
            out[g] = {};
            Object.keys(ASPETTO_BASE[g]).forEach(function (k) {
                var mio = a && a.aspetto && a.aspetto[g] && a.aspetto[g][k];
                out[g][k] = (mio === 0 || mio) ? mio : ASPETTO_BASE[g][k];
            });
        });
        return out;
    }

    /* le variabili da scrivere sul riquadro della console: una sola funzione, la
       usano il banco e (quando si monta) l'app */
    function variabili(a) {
        var s = aspettoDi(a);
        return {
            '--mnc-testata': s.barra.altezza + 'px',
            '--mn-tit-fs': s.barra.corpo + 'px',
            '--mn-tit-col': s.barra.colore,
            '--mnc-bric-op': (s.barra.opacitaPrec / 100),
            '--mnc-sep-op': (s.barra.opacitaSep / 100),
            '--mn-bric-scale': (s.barra.scalaAltri / 100),
            '--mnc-hairline': s.barra.hairline,
            '--mm-console-side': s.colonna.larghezza + 'px',
            '--mnc-voce-h': s.colonna.altezzaVoce + 'px',
            '--mnc-voce-fs': s.colonna.corpoVoce + 'px',
            '--mnc-voce-gap': s.colonna.passo + 'px',
            '--mnc-voce-r': s.colonna.raggio + 'px',
            '--mnc-col-pad': s.colonna.imballaggio + 'px',
            '--mnc-col-icona': s.colonna.icona + 'px',
            '--mnc-area-pad-x': s.area.padX + 'px',
            '--mnc-area-pad-y': s.area.padY + 'px',
            '--mnc-gap': s.area.passo + 'px',
            '--mnc-col-n': String(s.area.colonne),
            '--mnc-max': s.area.tetto + 'px'
        };
    }

    /* ── contrasto, per dire se il percorso si legge davvero ─────────────── */
    function luminanza(hex) {
        var h = String(hex || '').replace('#', '');
        if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
        var v = [0, 2, 4].map(function (i) {
            var c = parseInt(h.substr(i, 2), 16) / 255;
            return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
        });
        return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
    }
    function contrasto(a, b) {
        var l1 = luminanza(a), l2 = luminanza(b);
        return Math.round(((Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)) * 100) / 100;
    }

    /* ── funzioni pure ───────────────────────────────────────────────────── */

    function area(id) {
        for (var i = 0; i < AREE.length; i++) if (AREE[i].id === id) return AREE[i];
        return null;
    }

    /* le RIGHE: i moduli si impacchettano da sinistra finché le colonne bastano.
       È lo stesso conto del bento di CREA — qui però lo fa il dato, perché non
       c'è un form sotto che imponga un ordine. */
    function righe(a) {
        var out = [], riga = [], somma = 0;
        (a && a.moduli || []).forEach(function (m) {
            var s = Math.max(1, Math.min(COLONNE, m.span || 1));
            if (somma + s > COLONNE) { out.push(riga); riga = []; somma = 0; }
            riga.push(m); somma += s;
        });
        if (riga.length) out.push(riga);
        return out;
    }

    function spanDi(m) { return Math.max(1, Math.min(COLONNE, (m && m.span) || 1)); }

    function tele(a) {
        var n = 0;
        (a && a.moduli || []).forEach(function (m) {
            (m.voci || []).forEach(function (v) { if (v.forma === 'tela') n++; });
        });
        return n;
    }

    /* Il validatore: le domande a cui, guardando una composizione, non si sa
       rispondere a occhio. Errori = la superficie non si può montare; avvisi =
       si può, ma qualcuno se ne accorgerà. */
    function valida(a) {
        var err = [], avv = [];
        if (!a) return { errori: ['area inesistente'], avvisi: [] };

        if (!a.briciole || !a.briciole.length)
            err.push('senza percorso nella barra: la console non direbbe dove sei, e non ci sarebbe modo di tornare indietro');
        if (!a.moduli || !a.moduli.length)
            err.push('area vuota: nessun modulo da mostrare');

        righe(a).forEach(function (r, i) {
            var somma = r.reduce(function (s, m) { return s + spanDi(m); }, 0);
            if (somma !== COLONNE)
                avv.push('la riga ' + (i + 1) + ' chiude a ' + somma + ' colonne su ' + COLONNE + ': resta un buco a destra');
        });

        var t = tele(a);
        if (t > MAX_TELE) err.push('due tele nella stessa area: si contendono lo spazio (una sola, come vuole il motore)');
        (a.moduli || []).forEach(function (m) {
            (m.voci || []).forEach(function (v) {
                if (!v.forma || !FORME[v.forma])
                    err.push('«' + (v.et || v.id) + '»: forma «' + (v.forma || '—') + '» che il renderer non sa disegnare');
                if (v.forma === 'tela' && spanDi(m) !== COLONNE)
                    err.push('la tela sta in un modulo da ' + spanDi(m) + ' colonne: un foglio in un quarto di riga non è un foglio');
                if (v.forma === 'materiali' && spanDi(m) !== COLONNE)
                    avv.push('il box dei materiali sta in un modulo da ' + spanDi(m) + ' colonne: le tabelle a due colonne vogliono la riga intera');
                if (!v.aiuto)
                    avv.push('«' + (v.et || v.id) + '» non dichiara il pop-up: chi non sa che cos\'è non ha dove leggerlo');
            });
            if (m.nuda && (m.titolo || '').trim())
                avv.push('il modulo «' + m.titolo + '» è nudo (senza riquadro) ma dichiara un titolo: non si vedrà');
        });

        /* i comandi nella colonna: è lì che vanno quelli del documento (regola
           del 5/8). Se una vista ha una tela ma nessun comando, la sotto-barra
           che abbiamo tolto non è stata sostituita da niente. */
        if (t > 0 && !(a.comandi || []).filter(function (c) { return !c.gruppo; }).length)
            err.push('c\'è una tela ma nessun comando nella colonna: il documento si aprirebbe senza il modo di salvarlo');

        /* ── l'ASPETTO: le domande che una griglia si porta dietro ────────── */
        var s = aspettoDi(a);
        var cr = contrasto(s.barra.colore, '#ffffff');
        if (cr < 4.5)
            err.push('il percorso fa ' + cr + ':1 sulla barra bianca: sotto 4,5 non si legge');
        var crPrec = Math.round(((cr - 1) * (s.barra.opacitaPrec / 100) + 1) * 100) / 100;
        if (crPrec < 3)
            avv.push('i livelli precedenti del percorso scendono a ~' + crPrec + ':1 con questa opacità: sono comandi, non decorazione');
        if (s.barra.corpo < 16)
            avv.push('il percorso a ' + s.barra.corpo + 'px non è più un titolo: si confonde con le voci');
        if (s.colonna.altezzaVoce < 36)
            avv.push('voci di navigazione alte ' + s.colonna.altezzaVoce + 'px: sotto i 36 il bersaglio diventa scomodo (WCAG chiede 24 come minimo assoluto)');
        var largVoce = s.colonna.larghezza - 2 * s.colonna.imballaggio;
        if (largVoce < 150)
            avv.push('dentro la colonna alle voci restano ' + largVoce + 'px: le etichette lunghe si troncano');
        var colBento = Math.round((Math.min(s.area.tetto, 1240) - 2 * s.area.padX - s.area.passo * (s.area.colonne - 1)) / s.area.colonne);
        if (colBento < 120)
            avv.push('una colonna del bento viene ' + colBento + 'px: sotto i 120 un riquadro non tiene una voce');
        if (s.area.colonne !== COLONNE)
            avv.push('l\'area gira a ' + s.area.colonne + ' colonne invece di ' + COLONNE + ': è un altro ritmo rispetto a CREA — va deciso, non subìto');

        return { errori: err, avvisi: avv };
    }

    /* Quante colonne di CSS occupa un modulo, e quanto è largo davvero: serve al
       banco per dire «questo riquadro viene 221px» prima di montarlo. */
    function larghezza(m, larghezzaArea, gap) {
        var g = (typeof gap === 'number') ? gap : 14;
        var col = (larghezzaArea - g * (COLONNE - 1)) / COLONNE;
        return Math.round(col * spanDi(m) + g * (spanDi(m) - 1));
    }

    /* la FIRMA della composizione: cambia quando cambia la struttura (moduli,
       span, forme), non quando si ritocca una tinta. Serve al banco per dire
       «il codice è cambiato sotto di te». */
    function firma(a) {
        return (a && a.moduli || []).map(function (m) {
            return m.id + ':' + spanDi(m) + ':' + (m.voci || []).map(function (v) { return v.id + '/' + v.forma; }).join(',');
        }).join('|');
    }

    /* ── I POP-UP delle console — modali del motore, non aree ──────────────────
       Un'azione della console può aprire un modale piccolo. Non è un'area (niente
       nav/tabella/tela): è uno schema per `MappAIModal.open`, tenuto qui perché è
       DESIGN come le aree — quando la console verrà cablata, l'app aprirà QUESTO.
       ⚠️ Nota per il cablaggio: Quiz/Flashcard/Sintesi si generano con l'AI (nascono
       davvero «vuoti»); Foglio dei nodi/Catena dei perché/Timeline si costruiscono
       deterministici dalla mappa — scegliendoli non si crea un foglio vuoto ma si
       apre quello ricavato dalla mappa. */
    var POPUP = {
        // Sidebar di ELABORA · «Nuovo documento» → scelta del tipo (archetipo Elenco).
        'nuovo-doc-chooser': {
            taglia: 'm',
            titolo: 'Nuovo documento',
            sottotitolo: 'Scegli il tipo di documento da creare',
            icona: 'file-plus',
            sezioni: [{
                voci: [
                    { id: 'quiz', icona: 'list-checks', etichetta: 'Quiz e verifiche', sotto: 'Domande a scelta multipla o Vero/Falso, con foglio soluzioni.' },
                    { id: 'flash', icona: 'layers', etichetta: 'Flashcard', sotto: 'Carte fronte-retro, da studiare a schermo o ritagliare.' },
                    { id: 'nodi', icona: 'scissors', etichetta: 'Foglio dei nodi', sotto: 'Le card dei nodi da ritagliare, nel formato scelto.' },
                    { id: 'sintesi', icona: 'file-text', etichetta: 'Sintesi', sotto: 'Il testo continuo di un ramo o di tutta la mappa.' },
                    { id: 'causale', icona: 'git-branch-plus', etichetta: 'Catena dei perché', sotto: 'I nessi causa-effetto ricavati dalla mappa.' },
                    { id: 'timeline', icona: 'calendar-clock', etichetta: 'Timeline', sotto: 'La linea del tempo degli eventi citati dalla fonte.' }
                ]
            }],
            azioni: [{ id: 'annulla', etichetta: 'Annulla' }]
        }
    };

    /* ── montaPercorso: la cascata del percorso nella testata di una console ────
       Trasforma la testata (pallino · titolo) nel percorso interattivo
       «Cosa › A chi? › Materia › …»: ogni livello con un `menu` è una tendina
       rettangolare a fondo bianco; i livelli `statico` restano etichette; l'ultimo
       livello è in tondo corsivo. Qui c'è solo la MECCANICA (disegno, apertura,
       chiusura, posizione): i DATI e le CALLBACK arrivano dallo `spec`, così la
       usano sia l'app (dati veri) sia il banco (mock). Le classi CSS sono quelle
       di mappai-console-manifesto.css (già caricata nell'app).
         spec = { livelli: [
           { et:'Cosa',    menu:{ tipo:'lista',   voci:[{et,on,onPick}], nuovo:{et,onPick} } },
           { et:'A chi?',  menu:{ tipo:'colonne', colonne:[{h,voci:[{et,on,onPick}]}] } },
           { statico:'La Fotosintesi' }
         ] } */
    function _escP(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
    function _chiudiPercorso() {
        var m = document.querySelector('.mn-bric-menu');
        if (m) { if (m._trg) m._trg.setAttribute('aria-expanded', 'false'); m.remove(); }
    }
    function _voceP(v, fs) {
        var it = document.createElement('button');
        it.type = 'button';
        it.setAttribute('role', 'menuitemradio');
        it.setAttribute('aria-checked', v.on ? 'true' : 'false');
        it.className = 'mn-bric-menu__it' + (v.on ? ' is-on' : '') + (v.nuovo ? ' mn-bric-menu__nuovo' : '');
        it.textContent = v.et;
        it.style.fontSize = fs;
        it.addEventListener('click', function (ev) { ev.stopPropagation(); _chiudiPercorso(); if (v.onPick) v.onPick(); });
        return it;
    }
    function _apriPercorsoMenu(node, trigger, menuSpec, fs) {
        var aperto = document.querySelector('.mn-bric-menu');
        if (aperto) { var era = aperto._trg; aperto.remove(); if (era) era.setAttribute('aria-expanded', 'false'); if (era === trigger) return; }
        var menu = document.createElement('div');
        menu.className = 'mn-bric-menu';
        menu.setAttribute('role', 'menu');
        menu._trg = trigger;
        if (menuSpec.tipo === 'colonne') {
            menu.classList.add('mn-bric-menu--cols');
            (menuSpec.colonne || []).forEach(function (col) {
                var c = document.createElement('div'); c.className = 'mn-bric-col';
                if (col.h) { var h = document.createElement('div'); h.className = 'mn-bric-col__h'; h.textContent = col.h; c.appendChild(h); }
                (col.voci || []).forEach(function (v) { c.appendChild(_voceP(v, fs)); });
                menu.appendChild(c);
            });
        } else {
            (menuSpec.voci || []).forEach(function (v) { menu.appendChild(_voceP(v, fs)); });
            if (menuSpec.nuovo) menu.appendChild(_voceP({ et: menuSpec.nuovo.et, nuovo: true, onPick: menuSpec.nuovo.onPick }, fs));
        }
        /* appeso al BOX (non alla testata: la ritaglierebbe e il corpo la coprirebbe);
           posizione = somma degli offset lungo la catena fino al box */
        var box = trigger.closest('.mm-box--console') || node;
        box.appendChild(menu);
        var top = 0, left = 0, el = trigger;
        while (el && el !== box) { top += el.offsetTop; left += el.offsetLeft; el = el.offsetParent; }
        menu.style.top = (top + trigger.offsetHeight + 6) + 'px';
        /* clamp orizzontale rispetto al VIEWPORT, non alla larghezza del box:
           sulla landing il box è `#header-utils`, stretto quanto le briciole, e
           `box.offsetWidth - menu.offsetWidth` andava NEGATIVO → il menu veniva
           forzato a sinistra (x=8) invece che sotto il trigger. Ora resta sotto
           «Cosa» come nelle altre viste, e si sposta solo se sborderebbe (Giacomo). */
        var boxLeft = box.getBoundingClientRect().left;
        var wantScreen = boxLeft + left;
        var maxScreen = window.innerWidth - menu.offsetWidth - 8;
        menu.style.left = (Math.max(8, Math.min(wantScreen, maxScreen)) - boxLeft) + 'px';
        trigger.setAttribute('aria-expanded', 'true');
        setTimeout(function () {
            document.addEventListener('mousedown', function chiudi(e) {
                if (!menu.contains(e.target) && e.target !== trigger) { menu.remove(); trigger.setAttribute('aria-expanded', 'false'); document.removeEventListener('mousedown', chiudi); }
            });
        }, 0);
    }
    /* dati del contesto (A chi? · Materia) dai VERI store dell'app, con le callback
       del chiamante. Fonte UNICA per console E landing (il banco usa i suoi mock).
       ⚠️ label in italiano fisse: EN al giro dell'i18n. */
    function _classi() { try { return (window.MappAIClasses && window.MappAIClasses.list) ? window.MappAIClasses.list() : []; } catch (e) { return []; } }
    function _allievi() { try { var a = (typeof appState !== 'undefined') ? appState : window.appState; var arr = (a && a.allProfiles) || []; return arr.filter(function (p) { return p && p.nickname; }); } catch (e) { return []; } }
    /* la sezione: se una console a schermo pieno è aperta, la SUA (scritta sul velo
       da chi l'apre, come fa `modo()` in stile-manifesto) — non la modalità della
       landing sotto, che per INSEGNA vale «build» (è dove si atterra chiudendo). Si
       guarda anche `manSezionePendente` su <html> perché al primo giro la veste può
       non aver ancora travasato il dato sul velo. Fuori da una console = readMode. */
    function _sezioneAttiva() {
        try {
            var box = document.querySelectorAll('.mm-overlay .mm-box--piena.mm-box--console');
            if (box.length) {
                var velo = box[box.length - 1].closest('.mm-overlay');
                var s = (velo && velo.dataset && velo.dataset.manSezione) || document.documentElement.dataset.manSezionePendente || '';
                if (s && s !== 'cabina') return s;
            }
            return (window.MappAITeach && window.MappAITeach.readMode) ? window.MappAITeach.readMode() : (localStorage.getItem('mappai_landing_mode') || '');
        } catch (e) { return ''; }
    }
    /* «A chi?» è scelto anche quando il target è «Generico» — che nello store non
       lascia traccia (né classe né allievo). Un flag sticky ricorda che la scelta
       è stata FATTA, così «Materia» resta svelata anche dopo. */
    function _stickyAchi() { try { return localStorage.getItem('mappai_bento_achi') === '1'; } catch (e) { return false; } }
    function _setStickyAchi() { try { localStorage.setItem('mappai_bento_achi', '1'); } catch (e) { } }
    /* cb: { onCosa(modo)?, onGenerico, onClasse(c), onAllievo(p), onMateria(m), onNuovaMateria }
       BRICIOLE PERSISTENTI e PROGRESSIVE (Giacomo, 6/8): ogni livello, una volta
       scelto, mostra il VALORE (non più il prompt «Cosa/A chi?/Materia») e resta;
       il livello successivo appare SOLO dopo aver scelto il precedente. Lo stato è
       DERIVATO dai veri store (sezione attiva · classe/allievo attivi · materia
       attiva) + il flag sticky per «A chi?» → persiste anche passando landing↔console
       e cambiando «Cosa». `livello` non serve più (ignorato). */
    function specContesto(cb, livello) {
        var CL = window.MappAIClasses || {};
        var cls = (CL.getActive && CL.getActive()) || null;
        var mat = CL.activeDiscipline ? CL.activeDiscipline() : '';
        var stud = CL.activeStudentName ? CL.activeStudentName() : '';
        var sez = _sezioneAttiva();
        var SEZ = { build: 'Crea', elabora: 'Elabora', teach: 'Insegna' };
        var cosaScelto = !!sez;
        var achiScelto = !!(cls || stud || _stickyAchi());
        var livelli = [];
        if (cb.onCosa) {
            livelli.push({ et: cosaScelto ? (SEZ[sez] || 'Cosa') : 'Cosa', menu: { tipo: 'lista', voci: [
                { et: 'Crea', on: sez === 'build', onPick: function () { cb.onCosa('build'); } },
                { et: 'Elabora', on: sez === 'elabora', onPick: function () { cb.onCosa('elabora'); } },
                { et: 'Insegna', on: sez === 'teach', onPick: function () { cb.onCosa('teach'); } }
            ] } });
        }
        if (!cosaScelto) return livelli;                    // finché «Cosa» non è scelto, si vede solo «Cosa»
        var achiLabel = achiScelto ? (stud || (cls && cls.name) || 'Generico') : 'A chi?';
        livelli.push({ et: achiLabel, menu: { tipo: 'colonne', colonne: [
            { h: '', voci: [{ et: 'Generico', on: achiScelto && !cls && !stud, onPick: function () { _setStickyAchi(); cb.onGenerico(); } }] },
            { h: '', voci: _classi().map(function (c) { return { et: c.name, on: !!cls && cls.name === c.name, onPick: function () { _setStickyAchi(); cb.onClasse(c); } }; }) },
            { h: '', voci: _allievi().map(function (p) { return { et: p.nickname + (p.grade ? ' — ' + p.grade : ''), on: !!stud && stud === p.nickname, onPick: function () { _setStickyAchi(); cb.onAllievo(p); } }; }) }
        ] } });
        if (!achiScelto) return livelli;                    // «Materia» solo dopo aver scelto «A chi?»
        var materie = (cls && CL.disciplineChoices) ? (CL.disciplineChoices(cls) || [])
            : ((window.MappAITeacherProfile && window.MappAITeacherProfile.disciplineList()) || []);
        livelli.push({ et: mat || 'Materia', menu: { tipo: 'lista',
            voci: materie.map(function (m) { return { et: m, on: mat === m, onPick: function () { cb.onMateria(m); } }; }),
            nuovo: cls ? null : { et: '+ Nuova materia', onPick: cb.onNuovaMateria }
        } });
        return livelli;
    }

    function montaPercorso(node, spec, testiEl) {
        if (!node || !spec || !spec.livelli) return;
        /* il contenitore delle briciole: nella console è `.mm-head__testi`, sulla
           landing lo passa il chiamante (l'header non ha quella struttura). */
        var testi = testiEl || node.querySelector('.mm-head__testi') || node;
        /* questa superficie ha il PERCORSO interattivo: la veste (console-manifesto)
           non ci aggiunge il chip né ricostruisce le sue briciole statiche — lo sa
           da questa classe. E qui si toglie l'eventuale chip già messo. */
        node.classList.add('mn-percorso');
        var chip = node.querySelector('.mm-ctx'); if (chip) chip.remove();
        _chiudiPercorso();
        /* via il titolo/sottotitolo del motore: il percorso li sostituisce */
        var t = testi.querySelector('.mm-title'); if (t) t.style.display = 'none';
        var st = testi.querySelector('.mm-subtitle'); if (st) st.style.display = 'none';
        var vecchio = testi.querySelector('.mn-briciole'); if (vecchio) vecchio.remove();
        var br = document.createElement('nav');
        br.className = 'mn-briciole';
        var livelli = spec.livelli;
        livelli.forEach(function (lv, i) {
            if (i) { var sep = document.createElement('span'); sep.className = 'mn-briciole__sep'; sep.textContent = '›'; br.appendChild(sep); }
            /* «Cosa» (i=0) alla dimensione piena; TUTTI gli altri livelli a una
               dimensione FISSA = 60% di «Cosa» (Giacomo), non più decrescente 10%/passo.
               La scala è un token (`--mn-bric-scale`) → l'officina la specifica; l'app,
               che non emette il token, usa il fallback 0.6 (= invariata). */
            var fs = i === 0 ? 'var(--mn-tit-fs, 30px)' : 'calc(var(--mn-tit-fs, 30px) * var(--mn-bric-scale, 0.6))';
            var ultima = (i === livelli.length - 1);
            /* «SONO QUI» NON È «SONO STATICO» (Giacomo, 8/8 notte).
               Il corsivo (con `is-qui`, che tronca invece di sfondare) lo prendeva solo
               l'ultimo livello STATICO. La briciola del progetto in ELABORA e INSEGNA è
               l'ultima E si apre: quindi ricadeva nel grassetto degli altri — e si
               vedeva come un lampeggìo, perché al primo disegno l'elenco dal disco non
               c'è ancora e la briciola nasce statica (corsivo), poi arriva l'elenco e
               diventa una tendina (grassetto).
               Ora il livello può DICHIARARSI `qui: true` e resta corsivo anche da
               cliccabile. Non si deduce dalla posizione: l'ultima briciola di CREA è la
               materia, e nessuno ha chiesto di metterla in corsivo.
               Le voci della TENDINA restano in grassetto: là sono un elenco di scelte,
               non il posto in cui si è. */
            var qui = (lv.qui === true) || (ultima && !lv.menu);
            function _qui(elem) {
                elem.classList.add('is-qui');
                elem.style.fontStyle = 'italic';
                elem.style.fontWeight = '400';
            }
            if (lv.menu) {
                var b = document.createElement('button');
                b.type = 'button';
                b.className = 'mn-briciole__l mn-briciole__l--menu';
                b.setAttribute('aria-haspopup', 'true');
                b.setAttribute('aria-expanded', 'false');
                b.innerHTML = '<span>' + _escP(lv.et) + '</span>';   /* niente triangolino ▾ (Giacomo) */
                b.style.fontSize = fs;
                if (qui) _qui(b);
                (function (btn, ms, f) { btn.addEventListener('click', function (ev) { ev.stopPropagation(); _apriPercorsoMenu(node, btn, ms, f); }); })(b, lv.menu, fs);
                br.appendChild(b);
            } else {
                var el = document.createElement(ultima ? 'span' : 'button');
                el.className = 'mn-briciole__l';
                if (el.tagName === 'BUTTON') el.type = 'button';
                el.textContent = lv.statico || lv.et || '';
                el.style.fontSize = fs;
                if (qui) _qui(el);
                br.appendChild(el);
            }
        });
        testi.appendChild(br);
        testi.classList.add('ha-briciole');
    }

    return {
        COLONNE: COLONNE, FORME: FORME, AREE: AREE, MAX_TELE: MAX_TELE, POPUP: POPUP,
        ASPETTO_BASE: ASPETTO_BASE, TOKEN_BASE: TOKEN_BASE, OMBRE: OMBRE,
        area: area, righe: righe, spanDi: spanDi, tele: tele,
        tokenDi: tokenDi, variabiliGlobali: variabiliGlobali,
        aspettoDi: aspettoDi, variabili: variabili, contrasto: contrasto,
        valida: valida, larghezza: larghezza, firma: firma,
        montaPercorso: montaPercorso, chiudiPercorso: _chiudiPercorso,
        specContesto: specContesto
    };
}));
