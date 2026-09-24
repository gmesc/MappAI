/* MappAI — CORE DEI MODALI (logica pura, zero DOM)
 *
 * Un modale si DICHIARA come dati; a disegnarlo è un solo motore
 * (`mappai-modal.js`). Qui dentro vive tutto ciò che si può decidere senza
 * un browser: normalizzare lo schema, validarlo, scegliere la taglia,
 * calcolare i contrasti della paletta, dire se un contratto tastiera è completo.
 *
 * Perché separato: così è testabile in Node (`npm test`) e l'Officina può
 * usarlo per l'anteprima senza duplicare una riga di regole.
 *
 * Sorgente delle misure: censimento dei 69 modali esistenti
 * (public/dev/campionario-modali.html, generato dal codice vero).
 */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.MappAIModalCore = factory();
}(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    /* ── Taglie ───────────────────────────────────────────────────────────
       Quattro, non ventinove. I numeri non sono scelti a gusto: sono i valori
       attorno a cui si addensano le larghezze già in uso. */
    var TAGLIE = {
        s: 440,     // conferme, avvisi, una domanda sola
        m: 600,     // form corti, opzioni di stampa, wizard a un passo
        l: 820,     // wizard, hub a schede, elenchi
        xl: 1160    // cruscotti a colonne
    };
    var ORDINE = ['s', 'm', 'l', 'xl'];

    /* ── Impaginazioni del corpo ───────────────────────────────────────────
       'console' è il quinto, aggiunto il 30/7: navigazione di dominio a
       sinistra, schede + filtri + tabella a destra. Serve a RACCOGLIERE in una
       finestra sola famiglie di modali che oggi sono sparse (classi, allievi,
       documenti, AI, consumi). Vuole spazio: sotto XL non è una console. */
    var LAYOUT = ['una', 'due', 'tre', 'cruscotto', 'console'];

    /* ── Ruoli dei bottoni ───────────────────────────────────────────────── */
    var RUOLI = ['primario', 'secondario', 'distruttivo', 'quieto'];

    /* ── Tipi di campo ───────────────────────────────────────────────────── */
    /* 'elenco' = più valori dello stesso genere che si aggiungono e si tolgono
       (le sedi di chi insegna in due istituti, le materie di chi ne insegna
       tre). Un campo di testo con le voci separate da virgole sembrerebbe più
       semplice, ma poi nessuno saprebbe dove finisce un nome e comincia
       l'altro — e sono nomi che il resto dell'app deve poter confrontare. */
    var CAMPI = ['testo', 'numero', 'area', 'scelta', 'spunta', 'radio', 'colore', 'nota', 'elenco'];

    /* ═══════════════════════════════════════════════════════════════════════
       TAGLIA
       ═══════════════════════════════════════════════════════════════════════ */
    function taglia(nome) {
        var k = String(nome || 'm').toLowerCase();
        return TAGLIE[k] ? k : 'm';
    }
    function larghezza(nome) { return TAGLIE[taglia(nome)]; }

    /* La taglia più vicina a una larghezza esistente: serve a migrare i modali
       di oggi senza doverli misurare a occhio. */
    function tagliaVicina(px) {
        var w = Number(px) || 0, best = 's';
        ORDINE.forEach(function (k) {
            if (Math.abs(TAGLIE[k] - w) < Math.abs(TAGLIE[best] - w)) best = k;
        });
        return best;
    }

    /* Il cruscotto sotto una certa larghezza non è un cruscotto: è una colonna
       stretta con dentro due colonne strette. */
    function layoutValido(layout, tagliaNome) {
        var l = LAYOUT.indexOf(layout) >= 0 ? layout : 'una';
        var w = larghezza(tagliaNome);
        /* la console porta una colonna di navigazione da 240px E una tabella:
           sotto XL restano ~500px per la tabella, cioè un elenco, non una console */
        if (l === 'console' && w < TAGLIE.xl) return 'cruscotto';
        if (l === 'cruscotto' && w < TAGLIE.l) return 'una';
        if (l === 'tre' && w < TAGLIE.l) return 'due';
        if (l === 'due' && w < TAGLIE.m) return 'una';
        return l;
    }

    /* ═══════════════════════════════════════════════════════════════════════
       SCHEMA — normalizzazione
       Tollerante in ingresso, severo in uscita: chi scrive uno schema a mano
       non deve ricordare venti campi, ma il motore ne riceve sempre venti.
       ═══════════════════════════════════════════════════════════════════════ */
    function normalizzaCampo(c, i) {
        if (typeof c === 'string') c = { etichetta: c };
        c = c || {};
        var tipo = CAMPI.indexOf(c.tipo) >= 0 ? c.tipo : 'testo';
        return {
            id: c.id || ('campo-' + (i + 1)),
            tipo: tipo,
            etichetta: String(c.etichetta || '').trim(),
            valore: c.valore !== undefined ? c.valore : (tipo === 'spunta' ? false : ''),
            opzioni: Array.isArray(c.opzioni) ? c.opzioni.slice() : [],
            /* elenco: i valori già presenti + l'etichetta del comando che ne
               aggiunge uno. Senza quell'etichetta il «+» non dice cosa aggiunge. */
            valori: Array.isArray(c.valori) ? c.valori.map(function (v) { return String(v); }) : [],
            aggiungi: c.aggiungi ? String(c.aggiungi) : '',
            /* i radio si escludono a vicenda DENTRO il loro gruppo: perderlo
               qui significava un solo gruppo per tutto il modale (audit 31/7) */
            gruppo: c.gruppo ? String(c.gruppo) : '',
            /* `cresce`: l'area si adatta al suo testo (`mm-campo--cresce`,
               field-sizing fra 3 e 18 righe). ⚠️ Terza volta che un campo si
               perde QUI: questa funzione costruisce un oggetto nuovo ELENCANDO
               ciò che sopravvive, quindi ogni proprietà nuova che nessuno
               aggiunge a questa lista viene scartata in silenzio — chi scrive
               lo schema la vede nel suo codice, chi disegna non la riceve mai.
               Era già successo col `gruppo` dei radio (audit 31/7) e con
               `vociDi()` (5/8). Qui il costo: la scheda della fonte dichiarava
               `cresce: true` dal 20/8 e i suoi tredici campi lunghi sono sempre
               rimasti alti tre righe, col testo che scorreva dentro. */
            cresce: !!c.cresce,
            aiuto: c.aiuto ? String(c.aiuto) : '',
            obbligatorio: !!c.obbligatorio,
            larghezza: c.larghezza || 'piena',   // piena | meta | breve
            min: c.min, max: c.max
        };
    }

    /* Dati di contesto: una riga per fatto (etichetta → valore). Un paragrafo
       con dentro cinque numeri separati da punti si legge come prosa e i
       numeri ci si perdono; incolonnati si scorrono con l'occhio. */
    function normalizzaDati(lista) {
        return (lista || []).map(function (d, i) {
            if (typeof d === 'string') {
                var p = d.split(':');
                d = p.length > 1 ? { etichetta: p.shift(), valore: p.join(':') } : { valore: d };
            }
            d = d || {};
            return {
                id: d.id || ('dato-' + (i + 1)),
                etichetta: String(d.etichetta || '').trim(),
                valore: d.valore == null ? '' : String(d.valore).trim()
            };
        }).filter(function (d) { return d.etichetta || d.valore; });
    }

    function normalizzaSezione(s, i) {
        if (typeof s === 'string') s = { titolo: s };
        s = s || {};
        return {
            id: s.id || ('sez-' + (i + 1)),
            titolo: String(s.titolo || '').trim(),
            testo: s.testo ? String(s.testo) : '',
            /* FIGURA: un'immagine accanto al testo della sezione — il ritratto
               di chi scrive, la copertina di un materiale. Non è decorazione
               libera: porta un `alt` obbligatorio (un ritratto senza nome, per
               chi legge con lo schermo, è un buco) e la sola forma dichiarabile
               è `tonda`. La `tela` non andava bene: sta SOTTO le sezioni, e la
               foto qui deve stare accanto al testo che presenta. */
            figura: (s.figura && s.figura.src)
                ? { src: String(s.figura.src), alt: String(s.figura.alt || ''), tonda: !!s.figura.tonda }
                : null,
            dati: normalizzaDati(s.dati),
            /* COLONNE dei campi (16/8): 2 o 3, altrimenti nessuna (una lista).
               Nato dalle otto angolazioni delle domande aperte — in colonna
               fanno scorrere, affiancate si abbracciano con un colpo d'occhio.
               Vale sui CAMPI, non su tutta la sezione: il testo di spiegazione
               e la riga di esito restano a tutta larghezza, o si leggerebbero
               in due strisce strette. */
            colonne: (s.colonne === 2 || s.colonne === 3) ? s.colonne : 0,
            /* riga di ESITO sotto le azioni: dice com'è andata o che cosa è
               stato scelto (il file caricato, l'ultimo salvataggio, quanti
               elementi). Sta sotto perché è la conseguenza del bottone, non
               la sua spiegazione — quella va sopra, nel testo. */
            sotto: s.sotto ? String(s.sotto) : '',
            campi: (s.campi || []).map(normalizzaCampo),
            /* elenco di righe che si scelgono (i «picker» della landing) */
            voci: (s.voci || []).map(normalizzaVoce),
            azioni: (s.azioni || []).map(normalizzaBottone),
            accento: !!s.accento,        // riquadro in evidenza (indigo tenue)
            colonna: s.colonna || null,  // 'lato' | 'principale' nel cruscotto
            largo: !!s.largo,            // occupa tutta la riga
            /* NUDA: nessun riquadro attorno. Dentro una console a tutto schermo
               una fila di comandi chiusa in un rettangolo grigio sembra un
               ritaglio della pagina invece che la pagina — il contenuto deve
               occupare la superficie che ha (richiesta di Giacomo, 2/8). */
            nuda: !!s.nuda,
            /* COLLASSABILE: il titolo diventa un comando. Serve quando la vista
               raccoglie più elenchi dello stesso genere e non si guardano tutti
               insieme (sintesi · fogli · quiz della stessa mappa). */
            collassabile: !!s.collassabile,
            chiusa: !!s.collassabile && !!s.chiusa
        };
    }

    function normalizzaBottone(b, i) {
        if (typeof b === 'string') b = { etichetta: b };
        b = b || {};
        var ruolo = RUOLI.indexOf(b.ruolo) >= 0 ? b.ruolo : 'secondario';
        return {
            id: b.id || ('btn-' + (i + 1)),
            etichetta: String(b.etichetta || '').trim(),
            ruolo: ruolo,
            icona: b.icona || '',
            /* Bottone di sola icona: l'etichetta non sparisce, diventa il NOME
               ACCESSIBILE (aria-label + fumetto). È la condizione per averlo —
               l'audit del 31/7 ha contato 26 bottoni solo-icona muti, e da qui
               non ne può nascere un altro. Serve dove il comando accompagna una
               riga e non deve competere col contenuto (il cestino di un elenco). */
            soloIcona: !!b.soloIcona && !!b.icona,
            valore: b.valore !== undefined ? b.valore : b.id || ruolo,
            chiude: b.chiude !== false
        };
    }

    /* ── Voci ────────────────────────────────────────────────────────────────
       Una VOCE è una riga che si sceglie. Serve alla navigazione della console,
       alle schede e — dal 2/8 — agli ELENCHI: «scegli la classe», «scegli la
       mappa», «scegli il materiale». Erano il caso più frequente fra i modali
       censiti e il motore non lo sapeva disegnare: chi li scriveva a mano
       ricominciava ogni volta da un `<button>` con lo stile inline.
       Una voce si comporta come un bottone (ha un id e conclude, salvo dirlo),
       e può portare una riga di comandi suoi (rinomina, elimina). */
    function normalizzaVoce(v, i) {
        if (typeof v === 'string') v = { etichetta: v };
        v = v || {};
        /* Intestazione di GRUPPO: oltre una decina di voci un elenco piatto
           smette di essere una navigazione e diventa un muro. Le intestazioni
           non sono cliccabili e non contano come voci.
           ⚠️ Il riconoscimento guarda ANCHE `tipo`: normalizzata una volta, la
           voce non porta più il campo `gruppo` (è diventato `etichetta`), e
           `open()` normalizza prima di passare a `render()`, che rinormalizza.
           Senza questo, alla seconda passata ogni intestazione tornava un
           bottone cliccabile — trovato il 2/8 sul picker delle mappe. */
        if (v.gruppo || v.tipo === 'gruppo') {
            return {
                tipo: 'gruppo', id: v.id || ('gr-' + (i + 1)),
                etichetta: String(v.gruppo || v.etichetta || '').trim(), attiva: false,
                /* Quante voci ci sono dentro: sta sulla RIGA DEL TITOLO, non su
                   ognuna. Con il gruppo chiuso è l'unica cosa che ne dice il
                   contenuto — ed è anche ciò che rende inutile una riga
                   «Nessuno»: `SINTESI 0` lo dice già, senza fingere una voce. */
                contatore: (v.contatore === 0 || v.contatore) ? v.contatore : null,
                /* Un gruppo si può richiudere: il titolo È il comando (un secondo
                   bottone accanto sarebbe un comando in più per la stessa cosa —
                   stessa scelta già fatta per le tabelle). */
                collassabile: !!v.collassabile,
                chiuso: !!v.collassabile && !!v.chiuso
            };
        }
        return {
            tipo: 'voce',
            id: v.id || ('voce-' + (i + 1)),
            etichetta: String(v.etichetta || '').trim(),
            /* seconda riga: il grado di una classe, la mappa di un documento —
               ciò che distingue due voci che si chiamano quasi uguale */
            sotto: v.sotto ? String(v.sotto) : '',
            icona: v.icona || '',
            /* Deroga di veste, dichiarata dalla voce: una classe in più sul
               bottone. Serve alle voci che devono essere RICONOSCIUTE come un
               comando già visto altrove (la segnalazione della Cabina è il
               bottone ambra del cassetto insegnai) — non è un modo di vestire
               una navigazione a piacere: senza classe la voce resta standard. */
            classe: v.classe ? String(v.classe) : '',
            /* in coda alla riga: una data, un grado, uno stato */
            badge: (v.badge === 0 || v.badge) ? String(v.badge) : '',
            contatore: (v.contatore === 0 || v.contatore) ? v.contatore : null,
            attiva: !!v.attiva,
            /* comandi della singola riga: NON concludono (si elimina un
               documento e l'elenco resta aperto), quindi il default si rovescia */
            azioni: (v.azioni || []).map(function (b, k) {
                var n = normalizzaBottone(b, k);
                n.chiude = b && b.chiude === true;
                return n;
            }),
            valore: v.valore !== undefined ? v.valore : (v.id || ''),
            chiude: v.chiude !== false
        };
    }

    /* Una tabella di dati NON si disegna con una griglia CSS ripetuta riga per
       riga: le colonne si scollegherebbero dalle intestazioni appena il
       contenuto varia (regola §10.15 del progetto). Qui le colonne sono
       dichiarate una volta e il motore emette <colgroup>. */
    function normalizzaTabella(t) {
        if (!t) return null;
        var colonne = (t.colonne || []).map(function (c, i) {
            if (typeof c === 'string') c = { etichetta: c };
            return {
                id: c.id || ('col-' + (i + 1)),
                etichetta: String(c.etichetta || '').trim(),
                larghezza: c.larghezza || '',        // '' = auto · '120px' · '1fr'
                /* DECISO il 2/8: tutto a sinistra, intestazioni e celle.
                   Colonne allineate al centro o a destra rendono irregolare la
                   lettura verticale della tabella — l'occhio cerca un solo
                   bordo di partenza. `allinea` resta come deroga esplicita,
                   non è più il modo normale di scrivere una colonna. */
                allinea: c.allinea === 'centro' ? 'centro' : c.allinea === 'destra' ? 'destra' : 'sinistra',
                /* una colonna può essere esclusa dall'ordinamento quando il suo
                   ordine non significa niente (una colonna di azioni) */
                ordinabile: c.ordinabile !== false
            };
        });
        /* Una cella è testo, oppure un gruppo di SCELTE cliccabili: serve per
           le discipline di una classe, dove ogni nome è una scorciatoia che
           attiva quella coppia classe+disciplina. */
        /* Una riga può essere un semplice array di celle, oppure dichiarare un
           `id`: allora la riga INTERA si sceglie, come una voce di elenco. In una
           tabella di materiali l'azione naturale è aprire quello che si legge,
           non cercare un bottone in fondo alla riga. */
        var righe = (t.righe || []).map(function (r, k) {
            var celle = Array.isArray(r) ? r : (r && Array.isArray(r.celle) ? r.celle : []);
            /* l'id sopravvive a una seconda normalizzazione: una riga già
               normalizzata è un array CON id sopra, e `open()` normalizza prima
               di passare a `render()`, che rinormalizza (trappola del 2/8) */
            var meta = (r && (r.id !== undefined || r.chiude !== undefined)) ? r : null;
            var out = celle.map(function (x) {
                if (x && typeof x === 'object' && Array.isArray(x.scelte)) {
                    return {
                        scelte: x.scelte.map(function (s) { return String(s); }),
                        azione: x.azione ? String(x.azione) : 'scelta'
                    };
                }
                /* cella con BOLLINO di stato: il pallino non basta da solo —
                   il colore è un canale che non tutti leggono, quindi porta
                   sempre un titolo che dice cosa significa */
                if (x && typeof x === 'object' && x.testo !== undefined) {
                    var cella = {
                        testo: String(x.testo),
                        bollino: x.bollino ? String(x.bollino) : '',
                        titolo: x.titolo ? String(x.titolo) : ''
                    };
                    if (Object.prototype.hasOwnProperty.call(x, 'ordine')) cella.ordine = typeof x.ordine === 'number' && isFinite(x.ordine) ? x.ordine : null;
                    return cella;
                }
                /* cella di COMANDI: come i comandi di una voce, non concludono */
                if (x && typeof x === 'object' && Array.isArray(x.azioni)) {
                    return {
                        azioni: x.azioni.map(function (b, j) {
                            var nb = normalizzaBottone(b, j);
                            nb.chiude = b && b.chiude === true;
                            return nb;
                        })
                    };
                }
                return x == null ? '' : String(x);
            });
            out.id = meta && meta.id ? String(meta.id) : '';
            out.chiude = meta ? meta.chiude !== false : true;
            if (r && r.fissa) out.fissa = true;
            return out;
        });
        return {
            colonne: colonne, righe: righe,
            vuota: t.vuota ? String(t.vuota) : '',
            /* Ordinare cliccando l'intestazione e tirare il bordo per allargare
               una colonna sono comportamenti che l'utente si aspetta da
               qualunque elenco: stanno nel motore, così li hanno tutte le
               tabelle senza che nessuno li riscriva. Si spengono dove non
               avrebbero senso (un elenco già ordinato per costruzione). */
            ordinabile: t.ordinabile !== false,
            ridimensionabile: t.ridimensionabile !== false,
            colonneIndipendenti: t.colonneIndipendenti === true,
            statoColonne: t.statoColonne || null
        };
    }

    function normalizzaSchema(s) {
        s = s || {};
        var t = taglia(s.taglia);
        var sezioni = (s.sezioni || []).map(normalizzaSezione);
        var azioni = (s.azioni || []).map(normalizzaBottone);
        return {
            id: s.id || 'modale',
            titolo: String(s.titolo || '').trim(),
            sottotitolo: s.sottotitolo ? String(s.sottotitolo) : '',
            icona: s.icona || 'square',
            taglia: t,
            layout: layoutValido(s.layout, t),
            /* vista piena: la console occupa la finestra invece di essere un
               riquadro sospeso. Vale solo per la console — un form a mezza
               pagina in vista piena è spazio sprecato. */
            piena: !!s.piena && layoutValido(s.layout, t) === 'console',
            /* colonne dell'AREA della console (le sezioni principali):
               'una' = flusso verticale · 'due'/'tre' = griglia. La tabella e la
               barra dei filtri restano sempre a tutta larghezza. */
            area: ['una', 'due', 'tre'].indexOf(s.area) >= 0 ? s.area : 'una',
            /* CONTESTO — la selezione corrente (classe/allievo · disciplina ·
               documento), mostrata in testata e valida per TUTTA la console:
               passando da una vista all'altra non si ricomincia da capo. È il
               pezzo che rende le console un percorso invece di finestre
               scollegate. Le parti formano UN chip diviso: ogni metà è
               cliccabile e apre il suo selettore. */
            contesto: (s.contesto || []).map(function (c, i) {
                if (typeof c === 'string') c = { etichetta: c };
                c = c || {};
                return {
                    id: c.id || ('ctx-' + (i + 1)),
                    etichetta: String(c.etichetta || '').trim(),
                    icona: c.icona || '',
                    /* vuoto = nessuna scelta fatta: la metà resta cliccabile ma
                       si legge come invito, non come dato */
                    vuoto: !!c.vuoto,
                    /* cliccabile = apre il selettore; se falso è solo un'etichetta */
                    scegli: c.scegli !== false,
                    azzerabile: !!c.azzerabile
                };
            }).filter(function (c) { return c.etichetta; }),
            /* Navigazione richiudibile: la colonna è spazio tolto all'area, e
               ogni console deve poterla ripiegare. Attiva di default (2/8) —
               si spegne solo dove la navigazione È la funzione della finestra. */
            navChiudibile: s.navChiudibile !== false,
            navChiusa: !!s.navChiusa,
            /* TELA — lo spazio libero dell'area, che il chiamante riempie con
               ciò che il motore non sa disegnare: un editor, un grafico, una
               mappa. Senza, una console potrebbe ospitare solo tabelle. */
            tela: s.tela ? {
                id: (s.tela.id || 'tela'),
                segnaposto: String(s.tela.segnaposto || ''),
                altezza: s.tela.altezza || '',
                /* FORMA (15/8 sera): la tela nasce per UN pezzo solo — un
                   cruscotto, un'anteprima — quindi centra il contenuto. Con
                   PIÙ blocchi (le Impostazioni AI, che ci spostano dentro tre
                   pezzi del markup storico) il centraggio li mette in FILA e
                   la vista si scompone. `colonna` = impilati, in alto a
                   sinistra, con una larghezza di lettura. */
                forma: s.tela.forma === 'colonna' ? 'colonna' : ''
            } : null,
            nav: (s.nav || []).map(normalizzaVoce),
            schede: (s.schede || []).map(normalizzaVoce),
            tabella: normalizzaTabella(s.tabella),
            /* PIÙ tabelle nella stessa vista, ognuna col suo titolo e
               richiudibile. I materiali di una mappa sono elenchi DIVERSI —
               sintesi, fogli dei nodi, quiz — e impilarli in una tabella sola
               con una colonna «tipo» costringe a leggere per trovare, invece
               che a guardare. Una tabella senza titolo non si può chiudere:
               non ci sarebbe niente su cui cliccare. */
            tabelle: (s.tabelle || []).map(function (t, i) {
                var n = normalizzaTabella(t);
                if (!n) return null;
                n.id = (t && t.id) || ('tab-' + (i + 1));
                n.titolo = String((t && t.titolo) || '').trim();
                n.collassabile = !!n.titolo && (!t || t.collassabile !== false);
                n.chiusa = n.collassabile && !!t.chiusa;
                return n;
            }).filter(Boolean),
            /* AREA A BENTO (cablaggio console INSEGNA, flag mappai_console_bento_app):
               moduli con voci `azione`/`materiali`, impaginati come il D1 dell'officina.
               Passa quasi grezzo — la presentazione dei riquadri (colori, disposizione
               delle voci) la calcola MappAIBento in fase di render, e il renderer del
               motore legge questi campi. Un campo sconosciuto verrebbe scartato da qui:
               senza questa riga il bento non arriverebbe mai a schermo. */
            bento: (s.bento || []).map(function (m) {
                return {
                    id: m.id || '', span: m.span || 4, altezza: m.altezza || 0,
                    nuda: m.nuda !== false, layout: m.layout || null,
                    stile: m.stile || null, bottoni: m.bottoni || null,
                    voci: (m.voci || []).map(function (v) {
                        return {
                            id: v.id || '', et: String(v.et || ''), forma: v.forma || '',
                            icona: v.icona || '', aiuto: v.aiuto ? String(v.aiuto) : '',
                            /* chiude non forzato: il default (conclusivo) lo decide il
                               dispatch, come per le azioni delle sezioni */
                            chiude: v.chiude, vuoto: v.vuoto ? String(v.vuoto) : ''
                        };
                    })
                };
            }),
            sezioni: sezioni,
            azioni: azioni,
            /* azioni in TESTATA: servono alle console a tutto schermo, dove un
               piè di pagina sarebbe una riga sprecata in fondo a una vista
               che occupa lo schermo. Stanno accanto alla × di chiusura. */
            azioniTestata: (s.azioniTestata || []).map(normalizzaBottone),
            /* contratto tastiera: i valori di default SONO la decisione presa */
            esc: s.esc !== false,
            invio: s.invio !== false,
            veloChiude: s.veloChiude !== false,
            /* un modale con dati in scrittura non si chiude per sbaglio */
            sporco: (typeof s.sporco === 'function') ? s.sporco : !!s.sporco,   /* funzione = si chiede al momento di uscire */
            nota: s.nota ? String(s.nota) : ''
        };
    }

    /* ═══════════════════════════════════════════════════════════════════════
       VALIDAZIONE — quello che il motore si rifiuta di disegnare
       ═══════════════════════════════════════════════════════════════════════ */
    function validaSchema(s) {
        var n = normalizzaSchema(s), errori = [], avvisi = [];

        if (!n.titolo) errori.push('titolo mancante: un modale senza titolo non è annunciabile a un lettore di schermo');
        /* «vuoto» significa senza CONTENUTO: una console porta il suo nella
           navigazione e nella tabella, non necessariamente in sezioni o azioni */
        var haCorpo = n.sezioni.length || n.azioni.length || n.azioniTestata.length || n.nav.length ||
            (n.tabella && n.tabella.colonne.length) || n.contesto.length || n.tela ||
            (n.bento && n.bento.length);
        var vociTot = n.sezioni.reduce(function (a, s2) {
            return a + s2.voci.filter(function (v) { return v.tipo !== 'gruppo'; }).length;
        }, 0);
        if (!haCorpo) errori.push('modale vuoto: né sezioni né azioni');

        var primari = n.azioni.filter(function (b) { return b.ruolo === 'primario'; });
        if (primari.length > 1) errori.push('due azioni primarie: l’occhio non sa dove andare');
        if (n.invio && !primari.length && n.azioni.length) {
            avvisi.push('Invio è attivo ma non c’è un’azione primaria: non farà nulla');
        }

        var visti = {};
        n.sezioni.forEach(function (sez) {
            sez.campi.forEach(function (c) {
                if (!c.etichetta) errori.push('campo ' + c.id + ' senza etichetta: con il solo segnaposto diventa muto per un lettore di schermo');
                if (visti[c.id]) errori.push('id di campo ripetuto: ' + c.id);
                visti[c.id] = true;
                if (c.tipo === 'scelta' && !c.opzioni.length) errori.push('campo ' + c.id + ': tendina senza opzioni');
                if (c.tipo === 'elenco' && !c.aggiungi) {
                    avvisi.push('campo ' + c.id + ': elenco senza etichetta di aggiunta — un «+» da solo non dice cosa aggiunge');
                }
            });
            /* Regola di accompagnamento della decisione 4 (31/7): coi campi a
               solo segnaposto, un gruppo di più campi scritti ha bisogno del
               titolo di sezione — è l'indicazione che RESTA dopo la
               compilazione, quando i segnaposto sono spariti.
               NON vale per la barra dei filtri (2/8): lì i campi non si
               «compilano e si lasciano», governano l'elenco lì sotto e il
               loro effetto si vede subito — un titolo sarebbe solo una riga
               in più fra i comandi e i dati che comandano. */
            var scritti = sez.colonna === 'filtri' ? 0 : sez.campi.filter(function (c) {
                return c.tipo === 'testo' || c.tipo === 'numero' || c.tipo === 'area' ||
                    c.tipo === 'scelta' || c.tipo === 'elenco';
            }).length;
            if (scritti >= 2 && !sez.titolo) {
                avvisi.push('sezione ' + sez.id + ': ' + scritti + ' campi senza titolo di sezione — compilati, non resta nessuna indicazione (decisione 4 + regola 31/7)');
            }
            sez.voci.forEach(function (v) {
                if (!v.etichetta) errori.push('voce ' + v.id + ' senza etichetta: una riga che si sceglie deve dire che cosa si sceglie');
                if (visti[v.id]) errori.push('id ripetuto: ' + v.id + ' — il clic finirebbe sulla voce sbagliata');
                visti[v.id] = true;
            });
        });
        /* Un elenco lungo dentro un riquadro piccolo si scorre due volte (la
           pagina e il riquadro): oltre una decina di voci vogliono dei gruppi. */
        if (vociTot > 12 && !n.sezioni.some(function (s2) {
            return s2.voci.some(function (v) { return v.tipo === 'gruppo'; });
        })) {
            avvisi.push('elenco di ' + vociTot + ' voci senza intestazioni di gruppo: oltre la decina diventa un muro');
        }

        if (n.layout === 'cruscotto') {
            var lato = n.sezioni.filter(function (s2) { return s2.colonna === 'lato'; });
            if (!lato.length) avvisi.push('cruscotto senza colonna di lato: probabilmente basta un layout a colonne');
        }
        if (n.layout === 'console') {
            /* le intestazioni di gruppo non sono navigazione: contano le VOCI */
            var vociVere = n.nav.filter(function (v) { return v.tipo !== 'gruppo'; });
            if (!vociVere.length) errori.push('console senza navigazione: è la colonna che giustifica la console — senza, è un elenco');
            /* «Dove sei» ha senso solo se esiste una vista specifica: con una
               tabella, delle schede o una tela, nessuna voce attiva vuol dire
               che l'utente non sa cosa sta guardando. Una console che mostra
               TUTTE le sue azioni in griglia, invece, non è «da nessuna parte»:
               è nello stato senza filtro, e lo dice il sottotitolo. */
            var vistaSpecifica = n.tabella || n.tela || n.schede.length;
            if (vociVere.length && vistaSpecifica && !vociVere.some(function (v) { return v.attiva; })) {
                avvisi.push('nessuna voce di navigazione attiva: la console si apre senza dire dove sei');
            }
            /* La tabella PRINCIPALE e la tela si contendono davvero lo spazio:
               entrambe prendono `flex:1` e riempiono l'area, quindi insieme non
               stanno. Gli elenchi TITOLATI (`tabelle`) no: l'area scorre e loro
               crescono quanto il contenuto, quindi una tela può stare sotto un
               elenco richiudibile — è la forma dei Consumi in Cabina (2/8),
               dove le mappe si scelgono da un elenco in testa e sotto sta il
               cruscotto che il motore non sa disegnare. */
            if (n.tabella && n.tela) {
                errori.push('console con tabella E tela: l’area può ospitare un elenco o un contenuto libero, non tutti e due — si contendono lo stesso spazio');
            }
            if (n.navChiusa && !n.navChiudibile) {
                avvisi.push('navigazione chiusa ma non richiudibile: senza il comando non si può riaprire');
            }
            [n.tabella].concat(n.tabelle).filter(Boolean).forEach(function (t) {
                var quale = t.titolo ? 'tabella «' + t.titolo + '»' : 'tabella';
                var nc = t.colonne.length;
                var storte = t.righe.filter(function (r) { return r.length !== nc; }).length;
                if (nc && storte) errori.push(quale + ': ' + storte + ' righe non hanno ' + nc + ' celle — le intestazioni si scollegherebbero dalle celle');
                if (nc > 8) avvisi.push(quale + ' con ' + nc + ' colonne: oltre le 8 si scorre in orizzontale, valuta cosa togliere');
            });
            /* più tabelle senza titolo si leggono come una tabella sola spezzata */
            if (n.tabelle.filter(function (t) { return !t.titolo; }).length > 1) {
                avvisi.push('più tabelle senza titolo: non si capisce dove finisce un elenco e comincia l’altro');
            }
        }
        if (n.piena && n.layout !== 'console') {
            avvisi.push('vista piena chiesta su un layout che non è una console: ignorata');
        }
        if (n.sporco && n.veloChiude) {
            avvisi.push('il modale ha dati in scrittura ma il clic sul velo lo chiude: si perde quello che si stava scrivendo');
        }
        var nCampi = n.sezioni.reduce(function (a, s2) { return a + s2.campi.length; }, 0);
        if (n.taglia === 's' && nCampi > 2) avvisi.push('taglia S con ' + nCampi + ' campi: sta stretta, valuta M');

        return { ok: errori.length === 0, errori: errori, avvisi: avvisi, schema: n };
    }

    /* ═══════════════════════════════════════════════════════════════════════
       COLORE — contrasto WCAG. Serve al picker della paletta: un accostamento
       si sceglie guardando il numero, non l'effetto che fa.
       ═══════════════════════════════════════════════════════════════════════ */
    function rgb(hex) {
        var h = String(hex || '').replace('#', '').trim();
        if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
        if (!/^[0-9a-fA-F]{6}$/.test(h)) return null;
        return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
    }
    function luminanza(hex) {
        var c = rgb(hex); if (!c) return null;
        var a = c.map(function (v) {
            var s = v / 255;
            return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
        });
        return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2];
    }
    function contrasto(hex1, hex2) {
        var l1 = luminanza(hex1), l2 = luminanza(hex2);
        if (l1 === null || l2 === null) return null;
        var chiaro = Math.max(l1, l2), scuro = Math.min(l1, l2);
        return Math.round(((chiaro + 0.05) / (scuro + 0.05)) * 100) / 100;
    }
    /* soglie WCAG 2.1: 4.5 testo normale · 3 testo grande (≥18.66px o ≥24px) e
       componenti dell'interfaccia (bordi, icone che veicolano informazione) */
    function esitoContrasto(valore, tipo) {
        if (valore === null) return { ok: false, soglia: null, etichetta: 'colore non valido' };
        /* 'decorativo': nessuna soglia — l'elemento non porta informazione */
        if (tipo === 'decorativo') return { ok: true, soglia: null, etichetta: 'decorativo' };
        var soglia = tipo === 'grande' || tipo === 'componente' ? 3 : 4.5;
        return {
            ok: valore >= soglia,
            soglia: soglia,
            etichetta: valore >= 7 ? 'AAA' : valore >= 4.5 ? 'AA' : valore >= 3 ? 'AA grande' : 'insufficiente'
        };
    }
    /* Controlla in un colpo tutti gli accostamenti che contano di una paletta. */
    function verificaPaletta(p) {
        p = p || {};
        var prove = [
            { nome: 'testo su fondo', a: p.testo, b: p.fondo, tipo: 'normale' },
            { nome: 'testo secondario su fondo', a: p.testo2, b: p.fondo, tipo: 'normale' },
            { nome: 'testo terziario su fondo', a: p.testo3, b: p.fondo, tipo: 'normale' },
            { nome: 'segnaposto su campo', a: p.testo3, b: p.fondo, tipo: 'normale' },
            { nome: 'bianco su accento', a: '#ffffff', b: p.accento, tipo: 'normale' },
            { nome: 'accento su fondo tenue', a: p.accento, b: p.accentoTenue, tipo: 'normale' },
            { nome: 'distruttivo su fondo', a: p.distruttivo, b: p.fondo, tipo: 'normale' },
            /* DECISA 31/7: i campi non hanno bordo (si riconoscono dal
               riempimento) → il bordo resta solo sui riquadri, decorativo.
               Un elemento decorativo non ha soglia WCAG da rispettare. */
            { nome: 'bordo dei riquadri (decorativo: i campi non hanno bordo)', a: p.bordo, b: p.fondo, tipo: 'decorativo' },
            { nome: 'testo su sezione', a: p.testo, b: p.fondoSez, tipo: 'normale' }
        ];
        var esiti = prove.map(function (t) {
            var v = contrasto(t.a, t.b);
            var e = esitoContrasto(v, t.tipo);
            return { nome: t.nome, a: t.a, b: t.b, valore: v, ok: e.ok, soglia: e.soglia, etichetta: e.etichetta };
        });
        return { esiti: esiti, ok: esiti.every(function (e) { return e.ok; }), falliti: esiti.filter(function (e) { return !e.ok; }).length };
    }

    /* ═══════════════════════════════════════════════════════════════════════
       BERSAGLI — un bottone che non si riesce a colpire non è un bottone.
       WCAG 2.2 (2.5.8) chiede almeno 24×24 CSS px; le linee guida delle
       piattaforme touch dicono 44. Per un'app usata anche su iPad: 44.
       ═══════════════════════════════════════════════════════════════════════ */
    function altezzaBersaglio(paddingY, corpo, bordo) {
        return Math.round((Number(paddingY) || 0) * 2 + (Number(corpo) || 0) * 1.35 + (Number(bordo) || 0) * 2);
    }
    function bersaglioOk(h) { return { ok: h >= 44, minimo: 44, wcag: h >= 24 }; }

    return {
        TAGLIE: TAGLIE, ORDINE: ORDINE, LAYOUT: LAYOUT, RUOLI: RUOLI, CAMPI: CAMPI,
        taglia: taglia, larghezza: larghezza, tagliaVicina: tagliaVicina, layoutValido: layoutValido,
        normalizzaCampo: normalizzaCampo, normalizzaBottone: normalizzaBottone,
        normalizzaSezione: normalizzaSezione, normalizzaSchema: normalizzaSchema,
        normalizzaVoce: normalizzaVoce, normalizzaTabella: normalizzaTabella,
        normalizzaDati: normalizzaDati,
        validaSchema: validaSchema,
        rgb: rgb, luminanza: luminanza, contrasto: contrasto, esitoContrasto: esitoContrasto,
        verificaPaletta: verificaPaletta,
        altezzaBersaglio: altezzaBersaglio, bersaglioOk: bersaglioOk
    };
}));
