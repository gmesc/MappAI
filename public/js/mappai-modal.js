/* MappAI — MOTORE DEI MODALI
 *
 *   const esito = await MappAIModal.open({
 *       titolo: 'Elimina la classe',
 *       icona: 'trash-2',
 *       taglia: 's',
 *       testo: 'La cartella resta su disco. Si perdono solo le credenziali.',
 *       azioni: [ 'Annulla', { etichetta: 'Elimina', ruolo: 'distruttivo' } ]
 *   });
 *   // esito → { azione: 'Elimina', valore: …, valori: {…} }  oppure  null se annullato
 *
 * Un modale non si scrive più in HTML: si dichiara. Da qui in poi taglie,
 * impaginazioni, ESC, Invio, focus trap, ritorno del fuoco e ruoli dei bottoni
 * arrivano a tutti allo stesso modo — l'omogeneità non dipende più da chi scrive.
 *
 * Dipendenze: `mappai-modal-core.js` (logica pura) e `mappai-modal-tokens.css`
 * (le classi .mm-*). Lucide è opzionale: senza, le icone restano vuote.
 */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory(require('./mappai-modal-core.js'));
    else root.MappAIModal = factory(root.MappAIModalCore);
}(typeof self !== 'undefined' ? self : this, function (Core) {
    'use strict';

    var pila = [];          /* modali aperti, dal più vecchio al più recente */

    /* Scelta di sistema, non di singolo modale: dove sta l'etichetta del campo.
       'dentro' = solo segnaposto (decisione 4) · 'sopra' = etichetta visibile.
       In entrambi i casi il campo porta aria-label: quello non è negoziabile. */
    var STILE = { etichette: 'dentro' };
    /* Sopra i modali SCRITTI A MANO che ancora esistono: account classi e
       profilo insegnante stanno a 9992, altri arrivano a 10005. A 2000 una
       conferma aperta sopra uno di quelli finiva DIETRO — è quello che Giacomo
       vedeva eliminando una scheda studente (2/8). Resta ben sotto i fumetti
       (2147483000), che devono stare sopra tutto per definizione.
       Censito, non scelto a occhio: `grep` degli z-index a 3+ cifre nel repo. */
    var Z_BASE = 12000;
    /* Il piano più alto occupato, che sale e basta. Contare i modali della PILA
       non basta più: le finestre non ancora migrate (account classi, prompt,
       config AI) si alzano sopra la console per essere viste, e non stanno nella
       pila — così la conferma aperta DOPO di loro prendeva un numero più basso e
       finiva sotto (Giacomo, eliminando un profilo allievo). Chi apre qualcosa
       sopra chiede il prossimo piano: l'ordine è quello di apertura, che è
       l'unico che l'utente riconosce. */
    var Z_TOP = Z_BASE;
    function prossimoZ() { Z_TOP += 100; return Z_TOP; }

    /* «Alza questa finestra sopra la mia pila» (17/8). I modali non ancora
       migrati dichiarano un piano SUO, scritto quando il motore non esisteva:
       config AI 9999, account classi 9992, il cruscotto dei consumi 1200, il
       modale della sintesi 3000, l'hub dei materiali 9990. Tutti sotto i 12000
       da cui parte il motore: aperti DA una console finiscono DIETRO alla
       finestra che li ha chiamati, cioè invisibili — e chi clicca conclude che
       il bottone è morto (è successo con «Crea un documento → Sintesi»).
       Sta QUI e non in ogni chiamante perché è il motore a tenere la pila: un
       secondo `_alza` scritto altrove ricomincerebbe a indovinare il numero.
       ⚠️ Il piano si CHIEDE (`prossimoZ`), non si calcola: una formula del tipo
       `12000 + aperti*100` poteva dare un numero più BASSO di quello che la
       console aveva già preso.
       Ritenta per un attimo: qualcuna di queste finestre si costruisce dopo una
       lettura da disco e al primo giro non è ancora nel DOM. */
    function alza(sel) {
        var n = 0;
        var passo = function () {
            var el = null;
            try { el = document.querySelector(sel); } catch (e) { return; }
            if (el) { el.style.zIndex = String(prossimoZ()); return; }
            if (++n < 12) setTimeout(passo, 80);
        };
        passo();
    }

    /* Le parole del motore sono parole dell'app: «Annulla», «Chiudi», «Esci»
       arrivano a tutti i modali, quindi devono seguire la lingua come tutto il
       resto. Il testo italiano resta qui come ripiego (regola 13 del progetto:
       la chiave vive solo nel dizionario inglese). */
    function tt(k, f) {
        try { return (typeof window !== 'undefined' && window.t) ? window.t(k, f) : f; }
        catch (e) { return f; }
    }

    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }
    function el(tag, cls, testo) {
        var e = document.createElement(tag);
        if (cls) e.className = cls;
        if (testo != null) e.textContent = testo;
        return e;
    }
    function icona(nome, cls) {
        if (!nome) return '';
        return '<i data-lucide="' + esc(nome) + '"' + (cls ? ' class="' + cls + '"' : '') + '></i>';
    }
    function disegnaIcone() {
        /* Solo Lucide SVG: lo «stile Android» (emoji al posto degli SVG) è
           pensionato dal 13/8 — nell'app c'è una famiglia di icone sola. */
        if (root_lucide()) { try { window.lucide.createIcons({ nameAttr: 'data-lucide' }); } catch (e) { } }
    }
    function root_lucide() { return window.lucide && window.lucide.createIcons; }

    /* ═══════════════════════════════════════════════════════════════════════
       CAMPI — un tipo, un pezzo. Ogni campo porta sempre la sua etichetta
       accessibile: è la condizione posta alla scelta «solo segnaposto».
       ═══════════════════════════════════════════════════════════════════════ */
    function campoHtml(c) {
        var idAttr = 'id="mmf-' + esc(c.id) + '"';
        var aria = 'aria-label="' + esc(c.etichetta) + '"';
        var largo = c.larghezza === 'breve' ? 'style="max-width:110px"' : '';
        var segna = 'placeholder="' + esc(c.etichetta) + '"';
        var req = c.obbligatorio ? ' required' : '';

        if (c.tipo === 'spunta' || c.tipo === 'radio') {
            var tipo = c.tipo === 'spunta' ? 'checkbox' : 'radio';
            var gruppo = c.tipo === 'radio' ? ' name="mmg-' + esc(c.gruppo || 'g') + '"' : '';
            return '<label class="mm-opz">' +
                '<input type="' + tipo + '"' + gruppo + ' ' + idAttr + (c.valore ? ' checked' : '') + ' data-campo="' + esc(c.id) + '">' +
                '<span><span class="mm-opz__t">' + esc(c.etichetta) + '</span>' +
                (c.aiuto ? '<span class="mm-opz__d">' + esc(c.aiuto) + '</span>' : '') +
                '</span></label>';
        }
        if (c.tipo === 'nota') {
            return '<p class="mm-nota">' + esc(c.etichetta) + '</p>';
        }
        /* elenco: i valori si vedono tutti insieme e si tolgono uno per uno.
           L'etichetta del gruppo la porta il titolo di sezione (decisione 4);
           qui serve invece il nome accessibile su ogni singola × e sul «+». */
        if (c.tipo === 'elenco') {
            return '<div class="mm-campo-riga">' +
                '<div class="mm-elenco" role="group" aria-label="' + esc(c.etichetta) + '">' +
                c.valori.map(function (v) {
                    return '<span class="mm-elenco__v">' + esc(v) +
                        '<button type="button" class="mm-elenco__x" data-azione="__via-' + esc(c.id) + ':' + esc(v) +
                        '" aria-label="' + esc(tt('mm_togli', 'Togli') + ' ' + v) + '">&times;</button></span>';
                }).join('') +
                '<button type="button" class="mm-elenco__piu" data-azione="__piu-' + esc(c.id) + '">' +
                icona('plus') + '<span>' + esc(c.aggiungi || c.etichetta) + '</span></button>' +
                '</div>' +
                (c.aiuto ? '<span class="mm-hint">' + esc(c.aiuto) + '</span>' : '') + '</div>';
        }
        var dentro;
        if (c.tipo === 'scelta') {
            dentro = '<select class="mm-campo" ' + idAttr + ' ' + aria + ' ' + largo + ' data-campo="' + esc(c.id) + '">' +
                c.opzioni.map(function (o) {
                    var v = (o && o.valore !== undefined) ? o.valore : o;
                    var t = (o && o.etichetta !== undefined) ? o.etichetta : o;
                    return '<option value="' + esc(v) + '"' + (String(v) === String(c.valore) ? ' selected' : '') + '>' + esc(t) + '</option>';
                }).join('') + '</select>';
        } else if (c.tipo === 'area') {
            dentro = '<textarea class="mm-campo" rows="3" ' + idAttr + ' ' + aria + ' ' + segna + req +
                ' data-campo="' + esc(c.id) + '">' + esc(c.valore) + '</textarea>';
        } else if (c.tipo === 'colore') {
            dentro = '<input type="color" class="mm-campo mm-campo--colore" ' + idAttr + ' ' + aria +
                ' value="' + esc(c.valore || '#4f46e5') + '" data-campo="' + esc(c.id) + '">';
        } else {
            var t = c.tipo === 'numero' ? 'number' : 'text';
            dentro = '<input type="' + t + '" class="mm-campo" ' + idAttr + ' ' + aria + ' ' + segna + ' ' + largo + req +
                (c.min !== undefined ? ' min="' + esc(c.min) + '"' : '') +
                (c.max !== undefined ? ' max="' + esc(c.max) + '"' : '') +
                ' value="' + esc(c.valore) + '" data-campo="' + esc(c.id) + '">';
        }
        /* ── QUANDO IL SEGNAPOSTO NON PUÒ FARE IL SUO MESTIERE (16/8) ─────────
           La decisione 4 (31/7) dice «solo segnaposto, niente etichetta sopra»,
           e per un campo di testo vuoto funziona: il nome si legge finché non
           si scrive. Ma un SELECT mostra sempre un'opzione, un campo con un
           valore di partenza mostra sempre quel valore, e un campo colore un
           colore: lì il segnaposto non compare MAI, e il campo resta anonimo.
           Nel modale delle domande aperte si leggevano «5» e «40» senza sapere
           che cosa fossero — è il difetto che Giacomo ha segnalato.
           Qui l'etichetta si emette PER FORZA. La decisione 4 resta dov'è utile
           (campi da riempire), e non vale dove non poteva reggere. */
        var haValore = c.valore !== undefined && c.valore !== null && String(c.valore) !== '';
        var segnaMai = c.tipo === 'scelta' || c.tipo === 'colore' || haValore;
        var etichettaVisibile = (STILE.etichette === 'sopra' || segnaMai)
            ? '<label class="mm-label" for="mmf-' + esc(c.id) + '">' + esc(c.etichetta) + '</label>' : '';
        /* ⚠️ Un campo a metà larghezza con una spiegazione: la spiegazione NON
           si stringe con lui. `--meta` restringe il controllo, non la riga —
           altrimenti quattro righe di testo si incolonnano in una striscia
           larga un dito (misurato nel modale delle domande aperte). */
        var meta = c.larghezza === 'meta' ? ' mm-campo-riga--meta' + (c.aiuto ? ' mm-campo-riga--spiegato' : '') : '';
        return '<div class="mm-campo-riga' + meta + '">' +
            etichettaVisibile + dentro +
            (c.aiuto ? '<span class="mm-hint">' + esc(c.aiuto) + '</span>' : '') + '</div>';
    }

    /* dati di contesto: una riga per fatto — etichetta a sinistra, valore a
       destra. Incolonnati si scorrono; dentro un paragrafo si perdono. */
    function datiHtml(dati) {
        if (!dati || !dati.length) return '';
        return '<dl class="mm-dati">' + dati.map(function (d) {
            return (d.etichetta ? '<dt>' + esc(d.etichetta) + '</dt>' : '<dt aria-hidden="true"></dt>') +
                '<dd>' + esc(d.valore) + '</dd>';
        }).join('') + '</dl>';
    }

    /* ── Elenco di righe che si scelgono ─────────────────────────────────────
       «Scegli la classe», «scegli la mappa», «scegli il materiale»: la forma
       più frequente fra i modali censiti, e l'unica che il motore non sapeva
       disegnare. Una voce È un bottone (conclude, salvo dirlo) e può portare i
       suoi comandi in coda, che invece non concludono: si elimina un documento
       e l'elenco resta aperto. */
    function vociHtml(voci) {
        if (!voci || !voci.length) return '';
        return '<div class="mm-voci">' + voci.map(function (v) {
            if (v.tipo === 'gruppo') {
                return '<span class="mm-voci__g" role="presentation">' + esc(v.etichetta) + '</span>';
            }
            var riga = '<button type="button" class="mm-voce' + (v.attiva ? ' is-attiva' : '') + '"' +
                ' data-azione="' + esc(v.id) + '"' + (v.attiva ? ' aria-current="true"' : '') + '>' +
                (v.icona ? '<span class="mm-voce__i">' + icona(v.icona) + '</span>' : '') +
                '<span class="mm-voce__t"><span class="mm-voce__n">' + esc(v.etichetta) + '</span>' +
                (v.sotto ? '<span class="mm-voce__s">' + esc(v.sotto) + '</span>' : '') + '</span>' +
                (v.badge ? '<span class="mm-voce__b">' + esc(v.badge) + '</span>' : '') +
                (v.contatore !== null ? '<span class="mm-nav__n">' + esc(v.contatore) + '</span>' : '') +
                '</button>';
            if (!v.azioni.length) return riga;
            return '<div class="mm-voce-riga">' + riga +
                '<span class="mm-voce__az">' + v.azioni.map(bottoneHtml).join('') + '</span></div>';
        }).join('') + '</div>';
    }

    function sezioneHtml(s) {
        var dentro = '';
        /* la figura apre la sezione e il testo le scorre accanto (`float`): con
           un blocco affiancato in flex, un testo lungo diventerebbe una colonna
           stretta accanto a una foto alta un dito */
        if (s.figura) {
            dentro += '<img class="mm-fig' + (s.figura.tonda ? ' mm-fig--tonda' : '') + '" src="' +
                esc(s.figura.src) + '" alt="' + esc(s.figura.alt) + '">';
        }
        if (s.testo) dentro += '<p class="mm-testo">' + esc(s.testo) + '</p>';
        dentro += datiHtml(s.dati);
        /* I campi in colonne, se la sezione le dichiara. Il contenitore avvolge
           SOLO i campi: `testo` e `sotto` restano a tutta larghezza. */
        var campiHtml = s.campi.map(campoHtml).join('');
        dentro += s.colonne
            ? '<div class="mm-campi mm-campi--' + s.colonne + '">' + campiHtml + '</div>'
            : campiHtml;
        dentro += vociHtml(s.voci);
        if (s.azioni.length) {
            dentro += '<div class="mm-sez__azioni">' + s.azioni.map(bottoneHtml).join('') + '</div>';
        }
        if (s.sotto) dentro += '<p class="mm-sez__esito">' + esc(s.sotto) + '</p>';
        var cls = 'mm-sez' + (s.accento ? ' mm-sez--accento' : '') + (s.largo ? ' mm-sez--largo' : '') +
            (s.nuda ? ' mm-sez--nuda' : '') + (s.chiusa ? ' is-chiusa' : '');
        var testa = s.collassabile
            ? '<button type="button" class="mm-sez__t mm-sez__t--tog" data-piega="' + esc(s.id) + '"' +
            ' aria-expanded="' + (s.chiusa ? 'false' : 'true') + '">' +
            icona('chevron-down') + '<span>' + esc(s.titolo) + '</span></button>'
            : (s.titolo ? '<span class="mm-sez__t">' + esc(s.titolo) + '</span>' : '');
        return '<div class="' + cls + '" data-sez="' + esc(s.id) + '">' +
            testa + '<div class="mm-sez__c">' + dentro + '</div></div>';
    }

    /* Più elenchi nella stessa vista, ognuno col suo titolo. Il titolo È il
       comando per richiuderli: un secondo bottone accanto sarebbe un comando in
       più per la stessa cosa. */
    function tabelleHtml(lista) {
        if (!lista || !lista.length) return '';
        return lista.map(function (t) {
            var testa = t.collassabile
                ? '<button type="button" class="mm-tabg__t mm-sez__t--tog" data-piega="' + esc(t.id) + '"' +
                ' aria-expanded="' + (t.chiusa ? 'false' : 'true') + '">' +
                icona('chevron-down') + '<span>' + esc(t.titolo) + '</span>' +
                '<span class="mm-tabg__n">' + t.righe.length + '</span></button>'
                : (t.titolo ? '<span class="mm-tabg__t">' + esc(t.titolo) + '</span>' : '');
            return '<div class="mm-tabg' + (t.chiusa ? ' is-chiusa' : '') + '" data-sez="' + esc(t.id) + '">' +
                testa + '<div class="mm-sez__c">' + tabellaHtml(t) + '</div></div>';
        }).join('');
    }

    function bottoneHtml(b) {
        /* di sola icona: l'etichetta non sparisce, diventa il nome accessibile */
        if (b.soloIcona) {
            return '<button type="button" class="mm-btn mm-btn--' + b.ruolo + ' mm-btn--icona"' +
                ' data-azione="' + esc(b.id) + '" aria-label="' + esc(b.etichetta) + '"' +
                ' title="' + esc(b.etichetta) + '">' + icona(b.icona) + '</button>';
        }
        return '<button type="button" class="mm-btn mm-btn--' + b.ruolo + '" data-azione="' + esc(b.id) + '"' +
            (b.ruolo === 'primario' ? ' data-primario="1"' : '') + '>' +
            icona(b.icona) + '<span>' + esc(b.etichetta) + '</span></button>';
    }

    /* ═══════════════════════════════════════════════════════════════════════
       CONTESTO — un chip diviso in parti cliccabili: «classe/allievo ·
       disciplina», «documento». Stessa forma in testata alle console e nella
       barra della landing: è la stessa informazione, non può avere due vesti.
       Esportato come `MappAIModal.chipContesto(parti)` perché la landing possa
       usarlo senza aprire un modale.
       ═══════════════════════════════════════════════════════════════════════ */
    function ctxHtml(parti) {
        return '<div class="mm-ctx" role="group" aria-label="' + esc(tt('mm_ctx_aria', 'Selezione corrente')) + '">' +
            parti.map(function (c) {
                var dentro = (c.icona ? icona(c.icona) : '') + '<span>' + esc(c.etichetta) + '</span>';
                var cls = 'mm-ctx__p' + (c.vuoto ? ' is-vuoto' : '');
                /* il titolo porta il testo intero: se un nome lungo arriva
                   comunque all'ellissi, resta un modo per leggerlo */
                var tit = ' title="' + esc(c.etichetta) + '"';
                return (c.scegli
                    ? '<button type="button" class="' + cls + '" data-azione="__ctx-' + esc(c.id) + '"' + tit +
                    ' aria-label="' + esc(tt('mm_ctx_scegli', 'Scegli') + ': ' + c.etichetta) + '">' + dentro + '</button>'
                    : '<span class="' + cls + '"' + tit + '>' + dentro + '</span>') +
                    (c.azzerabile ? '<button type="button" class="mm-ctx__x" data-azione="__ctx-via-' + esc(c.id) +
                        '" aria-label="' + esc(tt('mm_togli', 'Togli') + ' ' + c.etichetta) + '">&times;</button>' : '');
            }).join('') + '</div>';
    }

    /* ═══════════════════════════════════════════════════════════════════════
       CONSOLE — navigazione di dominio + schede + filtri + tabella o tela.
       Raccoglie in una finestra sola famiglie di modali oggi sparse.
       ═══════════════════════════════════════════════════════════════════════ */
    /* ── Suggerimento al passaggio, con attesa ───────────────────────────────
       Compare solo se il testo è DAVVERO troncato (si misura al momento) e
       solo dopo 900ms: un fumetto che scatta subito su ogni cella mentre si
       scorre una tabella è rumore, non aiuto. */
    var TIP = { el: null, t: 0 };
    function tipVia() {
        if (TIP.t) { clearTimeout(TIP.t); TIP.t = 0; }
        if (TIP.el) { TIP.el.remove(); TIP.el = null; }
    }
    function tipSu(bersaglio) {
        if (bersaglio.scrollWidth <= bersaglio.clientWidth + 1) return;   /* non è troncato */
        var testo = (bersaglio.textContent || '').trim();
        if (!testo) return;
        var d = el('div', 'mm-tip', testo);
        document.body.appendChild(d);
        var r = bersaglio.getBoundingClientRect();
        var w = d.getBoundingClientRect().width;
        d.style.left = Math.max(6, Math.min(r.left, window.innerWidth - w - 6)) + 'px';
        d.style.top = (r.bottom + 6) + 'px';
        TIP.el = d;
    }
    /* ── Ordinamento e ridimensionamento delle colonne ───────────────────────
       Comportamenti che l'utente si aspetta da qualunque elenco. Stanno qui,
       nel motore, così li hanno tutte le tabelle senza riscriverli ogni volta. */

    /* Il valore su cui confrontare due celle. Le date in GG/MM/AAAA e i numeri
       scritti all'italiana (1.204.860 · CHF 2,31) vanno confrontati per quello
       che SONO: ordinati come stringhe, «10/07» verrebbe prima di «9/07» e
       «CHF 2,31» prima di «CHF 12,00». */
    function chiaveOrdine(testo) {
        var s = String(testo || '').trim();
        var d = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
        if (d) return { n: Number(d[3]) * 10000 + Number(d[2]) * 100 + Number(d[1]) };
        var num = s.replace(/[^\d.,-]/g, '');
        if (num && /\d/.test(num)) {
            var v = Number(num.replace(/\./g, '').replace(',', '.'));
            if (!isNaN(v)) return { n: v };
        }
        return { t: s.toLocaleLowerCase('it') };
    }

    function ordinaTabella(tab, i, verso) {
        var tbody = tab.tBodies[0]; if (!tbody) return;
        var righe = [].slice.call(tbody.rows);
        /* il confronto è stabile: le righe che pareggiano restano nell'ordine
           in cui erano, così ordinare due volte non le rimescola */
        righe.forEach(function (r, k) { r._k = k; });
        righe.sort(function (a, b) {
            var ca = a.cells[i], cb = b.cells[i];
            var ka = chiaveOrdine(ca ? ca.textContent : ''), kb = chiaveOrdine(cb ? cb.textContent : '');
            var d;
            if (ka.n !== undefined && kb.n !== undefined) d = ka.n - kb.n;
            else if (ka.n !== undefined) d = -1;
            else if (kb.n !== undefined) d = 1;
            else d = ka.t.localeCompare(kb.t, 'it');
            return d ? d * verso : a._k - b._k;
        });
        righe.forEach(function (r) { tbody.appendChild(r); });
    }

    /* ogni tabella della vista si aggancia da sé: con più elenchi nella stessa
       area, agganciare solo il primo lasciava gli altri senza ordinamento */
    function attaccaTabelle(box) {
        [].forEach.call(box.querySelectorAll('.mm-tab'), function (t) { attaccaTabella(box, t); });
    }

    function attaccaTabella(box, tab) {
        if (!tab) return;

        /* ordinamento: un clic ordina, un altro inverte */
        tab.addEventListener('click', function (e) {
            var b = e.target.closest && e.target.closest('[data-ord]'); if (!b) return;
            var i = Number(b.getAttribute('data-ord'));
            var th = b.closest('th');
            var verso = th.getAttribute('aria-sort') === 'ascending' ? -1 : 1;
            [].forEach.call(tab.querySelectorAll('th[aria-sort]'), function (x) { x.setAttribute('aria-sort', 'none'); });
            th.setAttribute('aria-sort', verso === 1 ? 'ascending' : 'descending');
            ordinaTabella(tab, i, verso);
        });

        /* ridimensionamento: si tira il confine fra due colonne */
        if (!tab.querySelector('[data-grip]')) return;
        tab.addEventListener('mousedown', function (e) {
            var g = e.target.closest && e.target.closest('[data-grip]'); if (!g) return;
            e.preventDefault(); e.stopPropagation();
            var cols = tab.querySelectorAll('col');
            var th = g.closest('th');
            TRASCINA = {
                cols: cols, i: Number(g.getAttribute('data-grip')),
                x0: e.clientX, w0: th.getBoundingClientRect().width
            };
            /* le colonne senza larghezza dichiarata la prendono ADESSO: senza,
               al primo trascinamento tutte le altre salterebbero */
            [].forEach.call(tab.querySelectorAll('th'), function (h, k) {
                if (cols[k] && !cols[k].style.width) cols[k].style.width = Math.round(h.getBoundingClientRect().width) + 'px';
            });
            document.body.style.cursor = 'col-resize';
        });
    }

    /* Il trascinamento vive sul DOCUMENTO, e quindi una volta sola: agganciarlo
       dentro attaccaTabella significava un paio di ascoltatori per ogni tabella
       di ogni ridisegno, mai rimossi — con tre elenchi e qualche ridisegno si
       accumulano in fretta. */
    var TRASCINA = null;
    if (typeof document !== 'undefined') {
        document.addEventListener('mousemove', function (e) {
            if (!TRASCINA) return;
            var w = Math.max(70, Math.round(TRASCINA.w0 + (e.clientX - TRASCINA.x0)));
            if (TRASCINA.cols[TRASCINA.i]) TRASCINA.cols[TRASCINA.i].style.width = w + 'px';
        });
        document.addEventListener('mouseup', function () {
            if (!TRASCINA) return;
            TRASCINA = null; document.body.style.cursor = '';
        });
    }

    function attaccaTip(box) {
        box.addEventListener('mouseover', function (e) {
            var b = e.target.closest && e.target.closest('.mm-tab td, .mm-nav__t, .mm-ctx__p>span, .mm-voce__n, .mm-voce__s');
            if (!b) return;
            tipVia();
            TIP.t = setTimeout(function () { TIP.t = 0; tipSu(b); }, 900);
        });
        box.addEventListener('mouseout', tipVia);
        box.addEventListener('mousedown', tipVia);
        box.addEventListener('scroll', tipVia, true);
    }

    /* La colonna: intestazioni di gruppo e voci. Un gruppo può portare il suo
       CONTATORE (sulla riga del titolo, non su ogni voce) ed essere
       RICHIUDIBILE — e allora le sue voci vivono in un contenitore proprio, che
       è ciò che si nasconde. Senza contenitore l'elenco è piatto e non c'è
       niente da piegare: le voci di un gruppo non sono suoi figli nel markup. */
    function navHtml(voci) {
        var out = '', aperto = false;   /* `aperto` = c'è un contenitore di gruppo da chiudere */
        voci.forEach(function (v) {
            if (v.tipo === 'gruppo') {
                if (aperto) { out += '</div>'; aperto = false; }
                var cont = (v.contatore !== null && v.contatore !== undefined)
                    ? '<span class="mm-nav__gn">' + esc(v.contatore) + '</span>' : '';
                if (v.collassabile) {
                    out += '<button type="button" class="mm-nav__g mm-nav__g--tog" data-piega-nav="' + esc(v.id) + '"' +
                        ' aria-expanded="' + (v.chiuso ? 'false' : 'true') + '">' +
                        icona('chevron-down', 'mm-nav__gc-i') +
                        '<span class="mm-nav__gt">' + esc(v.etichetta) + '</span>' + cont + '</button>';
                } else {
                    out += '<span class="mm-nav__g" role="presentation">' +
                        '<span class="mm-nav__gt">' + esc(v.etichetta) + '</span>' + cont + '</span>';
                }
                out += '<div class="mm-nav__gc' + (v.chiuso ? ' is-chiusa' : '') + '" data-navgruppo="' + esc(v.id) + '">';
                aperto = true;
                return;
            }
            out += '<button type="button" class="mm-nav__v' + (v.attiva ? ' is-attiva' : '') +
                (v.classe ? ' ' + esc(v.classe) : '') + '"' +
                ' data-nav="' + esc(v.id) + '"' + (v.attiva ? ' aria-current="page"' : '') + '>' +
                (v.icona ? icona(v.icona) : '') +
                /* con la seconda riga il testo diventa una colonna: il titolo
                   sopra, la riga di spiegazione sotto. `sotto` era normalizzato
                   dal core e nessuno lo disegnava — stessa storia del badge. */
                (v.sotto
                    ? '<span class="mm-nav__tt"><span class="mm-nav__t">' + esc(v.etichetta) + '</span>' +
                      '<span class="mm-nav__s">' + esc(v.sotto) + '</span></span>'
                    : '<span class="mm-nav__t">' + esc(v.etichetta) + '</span>') +
                /* il BADGE della voce: il core lo normalizzava già e nessuno lo
                   disegnava. È in coda alla riga, prima del contatore — dice uno
                   STATO della voce («NUOVO»), non quante cose contiene. */
                (v.badge ? '<span class="mm-nav__b">' + esc(v.badge) + '</span>' : '') +
                (v.contatore !== null ? '<span class="mm-nav__n">' + esc(v.contatore) + '</span>' : '') +
                '</button>';
        });
        if (aperto) out += '</div>';
        return '<nav class="mm-nav" aria-label="' + esc(tt('mm_nav_aria', 'Sezioni')) + '">' + out + '</nav>';
    }

    function schedeHtml(schede) {
        return '<div class="mm-schede" role="tablist">' + schede.map(function (v) {
            return '<button type="button" role="tab" class="mm-scheda' + (v.attiva ? ' is-attiva' : '') + '"' +
                ' aria-selected="' + (v.attiva ? 'true' : 'false') + '" data-scheda="' + esc(v.id) + '">' +
                esc(v.etichetta) + '</button>';
        }).join('') + '</div>';
    }

    /* <colgroup> + <table>: header e celle condividono lo STESSO layout di
       colonne per costruzione. Con una griglia ripetuta riga per riga le
       intestazioni si scollegano appena il contenuto varia (regola §10.15). */
    function tabellaHtml(t) {
        if (!t || !t.colonne.length) return '';
        var cols = '<colgroup>' + t.colonne.map(function (c) {
            return '<col' + (c.larghezza ? ' style="width:' + esc(c.larghezza) + '"' : '') + '>';
        }).join('') + '</colgroup>';
        var all = function (c) { return c.allinea === 'centro' ? ' style="text-align:center"' : c.allinea === 'destra' ? ' style="text-align:right"' : ''; };
        var thead = '<thead><tr>' + t.colonne.map(function (c, i) {
            var ord = t.ordinabile && c.ordinabile;
            var dentro = ord
                ? '<button type="button" class="mm-tab__ord" data-ord="' + i + '">' +
                esc(c.etichetta) + '<span class="mm-tab__frec" aria-hidden="true"></span></button>'
                : esc(c.etichetta);
            /* la maniglia sta sul bordo DESTRO: si tira il confine fra questa
               colonna e la prossima, che è il gesto che tutti conoscono */
            var grip = (t.ridimensionabile && i < t.colonne.length - 1)
                ? '<span class="mm-tab__grip" data-grip="' + i + '" role="separator" aria-hidden="true"></span>' : '';
            return '<th' + all(c) + (ord ? ' aria-sort="none"' : '') + '>' + dentro + grip + '</th>';
        }).join('') + '</tr></thead>';
        var tbody = t.righe.length
            ? '<tbody>' + t.righe.map(function (r) {
                /* riga che si sceglie: in un elenco di materiali si apre quello
                   che si legge, non un bottone in fondo alla riga */
                var apre = r.id ? ' data-azione="' + esc(r.id) + '" tabindex="0" role="button"' : '';
                return '<tr' + (r.id ? ' class="mm-tab__riga"' : '') + apre + '>' + r.map(function (cel, i) {
                    /* cella di scelte: ogni voce è una scorciatoia (le
                       discipline di una classe attivano quella coppia) */
                    var dentro;
                    if (cel && typeof cel === 'object' && cel.scelte) {
                        dentro = '<span class="mm-cella-scelte">' + cel.scelte.map(function (s) {
                            return '<button type="button" class="mm-scelta" data-azione="' +
                                esc(cel.azione) + ':' + esc(s) + '">' + esc(s) + '</button>';
                        }).join('') + '</span>';
                    } else if (cel && typeof cel === 'object' && cel.azioni) {
                        dentro = '<span class="mm-cella-az">' + cel.azioni.map(bottoneHtml).join('') + '</span>';
                    } else if (cel && typeof cel === 'object') {
                        /* il bollino porta sempre il suo significato scritto:
                           un pallino colorato da solo non è leggibile da tutti */
                        dentro = (cel.bollino
                            ? '<span class="mm-bollino mm-bollino--' + esc(cel.bollino) + '"' +
                            (cel.titolo ? ' title="' + esc(cel.titolo) + '" aria-label="' + esc(cel.titolo) + '"' : '') +
                            '></span>' : '') + esc(cel.testo);
                    } else {
                        dentro = esc(cel);
                    }
                    return '<td' + all(t.colonne[i] || {}) + '>' + dentro + '</td>';
                }).join('') + '</tr>';
            }).join('') + '</tbody>'
            : '<tbody><tr><td colspan="' + t.colonne.length + '" class="mm-tab__vuota">' +
            esc(t.vuota || tt('mm_tab_vuota', 'Niente da mostrare')) + '</td></tr></tbody>';
        return '<div class="mm-tab-wrap"><table class="mm-tab">' + cols + thead + tbody + '</table></div>';
    }

    /* ── Area a BENTO (cablaggio console INSEGNA, flag mappai_console_bento_app) ──
       Il D1 dell'officina portato in produzione: la vista «mappa scelta» diventa
       un bento — una riga di comandi (voci `azione`) e il box dei materiali (voce
       `materiali`, le stesse `tabelle` del motore, a due colonne). Il guscio del
       modulo rispecchia `moduloHtml` del banco (public/dev/officina-console.js); la
       VESTE è nelle classi condivise (`.mn-bento-area`, `.mn-card`, `.mn-materiali`
       in mappai-console-manifesto.css), così banco e app non divergono. Colori e
       disposizione dei riquadri arrivano da MappAIBento (la stessa del bento di
       CREA); se il modulo non è caricato, il riquadro resta nudo. */
    function bentoPresenta(m) {
        var B = (typeof window !== 'undefined') ? window.MappAIBento : null, vars = '', attr = '';
        if (B && B.presentazione) { try { var p = B.presentazione(m); vars += p.vars || ''; attr += p.attr || ''; } catch (e) { } }
        if (B && B.stileDi) {
            try {
                var st = B.stileDi(m);
                vars += 'background:' + st.bg + ';color:' + st.testo + ';';
                vars += st.bordoPx ? 'border:' + st.bordoPx + 'px solid ' + st.bordoCol + ';' : 'border:none;';
                /* le due variabili che i bottoni interni usano per ricavare il
                   loro fondo dal colore corrente (regola del 4/8 sui colori composti) */
                vars += '--mn-fondo:' + st.bg + ';--mn-seg:' + st.testo + ';';
            } catch (e) { }
        }
        return { vars: vars, attr: attr };
    }
    function bentoVoceHtml(v, tabelle) {
        if (v.forma === 'materiali') {
            var cont = tabelle && tabelle.length ? tabelleHtml(tabelle)
                : '<div class="mn-materiali-vuoto">' + esc(v.vuoto || '') + '</div>';
            return '<div class="mn-materiali">' + cont + '</div>';
        }
        if (v.forma === 'azione') {
            /* comando stile CREA: l'icona a riposo, l'etichetta al passaggio →
               title+aria-label perché l'etichetta si rivela solo col mouse.
               `data-azione` lo raccoglie il dispatch come una qualunque azione. */
            var tip = v.aiuto ? ' data-tip="' + esc(v.aiuto) + '"' : '';
            return '<button type="button" class="mn-btn mn-cmd" data-azione="' + esc(v.id) + '"' +
                ' title="' + esc(v.et) + '" aria-label="' + esc(v.et) + '"' + tip + '>' +
                icona(v.icona) + '<span>' + esc(v.et) + '</span></button>';
        }
        return '';
    }
    function bentoAreaHtml(moduli, tabelle) {
        var CB = (typeof window !== 'undefined') ? window.MappAIConsoleBento : null;
        return '<div class="mn-bento-area">' + moduli.map(function (m) {
            var span = (CB && CB.spanDi) ? CB.spanDi(m) : (m.span || 4);
            var p = bentoPresenta(m);
            var st = 'grid-column: span ' + span + ';' + (m.altezza ? 'min-height:' + m.altezza + 'px;' : '') + (p.vars || '');
            return '<div class="mn-card' + (m.nuda ? ' mn-card--nuda' : '') + '" style="' + st + '" ' +
                (p.attr || '') + ' data-mod="' + esc(m.id) + '"><div class="mn-card__b">' +
                (m.voci || []).map(function (v) { return bentoVoceHtml(v, tabelle); }).join('') +
                '</div></div>';
        }).join('') + '</div>';
    }

    function consoleHtml(s, coda) {
        var filtri = s.sezioni.filter(function (x) { return x.colonna === 'filtri'; });
        /* `colonna:'barra'` = i comandi stanno sulla STESSA riga delle schede,
           spinti a destra. Serve quando la vista è un editor: schede e comandi
           parlano dello stesso documento, e due righe separate sprecano
           altezza proprio dove serve al foglio. */
        var barra = s.sezioni.filter(function (x) { return x.colonna === 'barra'; });
        var lato = s.sezioni.filter(function (x) { return x.colonna === 'lato'; });
        var main = s.sezioni.filter(function (x) {
            return x.colonna !== 'filtri' && x.colonna !== 'lato' && x.colonna !== 'barra';
        });
        var areaMod = s.area === 'due' ? ' mm-console__sez--2' : s.area === 'tre' ? ' mm-console__sez--3' : '';
        /* La maniglia vive sul CONFINE fra colonna e area, e si sposta con lui:
           aperta sta sul bordo della colonna, chiusa sul bordo dell'area. Così
           il comando è sempre dove l'occhio cerca il pannello, e resta
           raggiungibile anche quando il pannello non c'è. */
        var maniglia = s.navChiudibile
            ? '<button type="button" class="mm-console__man" data-nav-toggle="1"' +
            ' aria-label="' + esc(tt('mm_nav_toggle', 'Mostra o nascondi la navigazione')) + '">' +
            icona('panel-right-close') + '</button>'
            : '';
        return '<div class="mm-body mm-body--console">' +
            '<aside class="mm-console__side">' + navHtml(s.nav) +
            (lato.length ? '<div class="mm-console__side-sez">' + lato.map(sezioneHtml).join('') + '</div>' : '') +
            '</aside>' + maniglia +
            /* Con PIÙ elenchi a scorrere è l'AREA: una tabella sola si porta il
               suo scorrimento dentro `.mm-tab-wrap`, ma tre elenchi impilati con
               l'area a `overflow:hidden` venivano semplicemente tagliati. (Col
               bento lo scorrimento lo dà `.mm-console__area:has(.mn-materiali)`.) */
            '<main class="mm-console__area' + (s.tabelle.length && !(s.bento && s.bento.length) ? ' mm-console__area--scorre' : '') + '">' +
            (s.schede.length || barra.length
                ? '<div class="mm-schede-riga">' +
                (s.schede.length ? schedeHtml(s.schede) : '') +
                (barra.length ? '<div class="mm-barra">' + barra.map(function (b) {
                    return b.campi.map(campoHtml).join('') + b.azioni.map(bottoneHtml).join('');
                }).join('') + '</div>' : '') +
                '</div>' : '') +
            (filtri.length ? '<div class="mm-filtri">' + filtri.map(function (f) {
                return f.campi.map(campoHtml).join('') + f.azioni.map(bottoneHtml).join('');
            }).join('') + '</div>' : '') +
            /* Col bento l'area È i moduli (comandi + materiali): il box `materiali`
               consuma le `tabelle`, quindi non si rendono anche impilate qui. */
            (s.bento && s.bento.length
                ? bentoAreaHtml(s.bento, s.tabelle)
                : (main.length ? '<div class="mm-console__sez' + areaMod + '">' + main.map(sezioneHtml).join('') + '</div>' : '') +
                tabellaHtml(s.tabella) +
                tabelleHtml(s.tabelle) +
                (s.tela ? '<div class="mm-tela' + (s.tela.forma === 'colonna' ? ' mm-tela--colonna' : '') + '" data-tela="' + esc(s.tela.id) + '"' +
                    (s.tela.altezza ? ' style="flex:0 0 ' + esc(s.tela.altezza) + '"' : '') + '>' +
                    (s.tela.segnaposto ? '<span class="mm-tela__vuota">' + esc(s.tela.segnaposto) + '</span>' : '') +
                    '</div>' : '')) +
            /* nota e piè stanno DENTRO l'area: se restassero sotto il corpo,
               la colonna di navigazione si fermerebbe prima del fondo della
               console e sotto resterebbe una fascia bianca a tutta larghezza */
            (coda || '') +
            '</main></div>';
    }

    /* ═══════════════════════════════════════════════════════════════════════
       RENDER — restituisce l'elemento del riquadro. L'Officina lo usa per
       l'anteprima in pagina: così quello che si vede nel banco È il prodotto,
       non un disegno che gli somiglia.
       ═══════════════════════════════════════════════════════════════════════ */
    function render(schema) {
        var s = Core.normalizzaSchema(schema);
        var box = el('div', 'mm-box' + (s.taglia !== 'm' ? ' mm-box--' + s.taglia : '') +
            (s.piena ? ' mm-box--piena' : '') + (s.layout === 'console' ? ' mm-box--console' : '') +
            (s.navChiusa ? ' is-nav-chiusa' : ''));
        box.setAttribute('role', 'dialog');
        box.setAttribute('aria-modal', 'true');
        box.setAttribute('aria-label', s.titolo);

        /* il contesto sta in testata: è vero per tutta la console, non per la
           vista corrente — cambiando voce di navigazione non si azzera.
           UN chip diviso in parti, ognuna cliccabile: la stessa forma che la
           landing usa per «classe/allievo · disciplina». */
        var ctx = s.contesto.length ? ctxHtml(s.contesto) : '';

        var testata =
            '<div class="mm-head">' +
            (s.icona ? '<div class="mm-head__ico">' + icona(s.icona) + '</div>' : '') +
            '<div class="mm-head__testi"><div class="mm-title">' + esc(s.titolo) + '</div>' +
            (s.sottotitolo ? '<div class="mm-subtitle">' + esc(s.sottotitolo) + '</div>' : '') + '</div>' +
            ctx +
            (s.azioniTestata.length
                ? '<div class="mm-head__az">' + s.azioniTestata.map(bottoneHtml).join('') + '</div>' : '') +
            '<button type="button" class="mm-close" data-azione="__chiudi" aria-label="' +
            esc(tt('mm_chiudi', 'Chiudi')) + '">&times;</button></div>';

        var corpo;
        if (s.layout === 'console') {
            corpo = null;               /* costruito dopo: gli serve la coda */
        } else if (s.layout === 'cruscotto') {
            var lato = s.sezioni.filter(function (x) { return x.colonna === 'lato'; });
            var main = s.sezioni.filter(function (x) { return x.colonna !== 'lato'; });
            corpo = '<div class="mm-body mm-body--dash">' +
                '<aside class="mm-body__side">' + lato.map(sezioneHtml).join('') + '</aside>' +
                '<main class="mm-body__main">' + main.map(sezioneHtml).join('') + '</main></div>';
        } else {
            var mod = s.layout === 'tre' ? ' mm-body--3' : s.layout === 'due' ? ' mm-body--2' : '';
            corpo = '<div class="mm-body' + mod + '">' + s.sezioni.map(sezioneHtml).join('') + '</div>';
        }

        /* Il distruttivo si isola a sinistra solo quando è un'azione ACCESSORIA,
           cioè quando esiste anche un primario (editor: Elimina · Annulla/Salva).
           In una conferma distruttiva («Elimina?» → Annulla / Elimina) il
           distruttivo È l'azione conclusiva e sta a destra come tutte le altre:
           spostarlo a sinistra lo farebbe leggere come una via di fuga. */
        var distruttivi = s.azioni.filter(function (b) { return b.ruolo === 'distruttivo'; });
        var primari = s.azioni.filter(function (b) { return b.ruolo === 'primario'; });
        var split = distruttivi.length && primari.length;
        var altri = s.azioni.filter(function (b) { return b.ruolo !== 'distruttivo'; });
        var pie = s.azioni.length
            ? '<div class="mm-foot' + (split ? ' mm-foot--split' : '') + '">' +
            (split
                ? '<div class="mm-foot__sx">' + distruttivi.map(bottoneHtml).join('') + '</div>' +
                '<div class="mm-foot__dx">' + altri.map(bottoneHtml).join('') + '</div>'
                : s.azioni.map(bottoneHtml).join('')) +
            '</div>'
            : '';

        var nota = s.nota ? '<p class="mm-piede-nota">' + esc(s.nota) + '</p>' : '';
        /* nella console nota e piè scendono DENTRO l'area, così la colonna di
           navigazione arriva fino in fondo alla finestra */
        if (s.layout === 'console') {
            box.innerHTML = testata + consoleHtml(s, nota + pie);
        } else {
            box.innerHTML = testata + corpo + tabellaHtml(s.tabella) + tabelleHtml(s.tabelle) + nota + pie;
        }

        /* Richiudere una sezione o un elenco è comportamento del motore, non di
           chi lo dichiara: vive qui, non in ogni schermata che li usa. */
        box.addEventListener('click', function (e) {
            var b = e.target.closest && e.target.closest('[data-piega]');
            if (!b) return;
            e.stopPropagation();
            var g = box.querySelector('[data-sez="' + b.getAttribute('data-piega').replace(/(["\\])/g, '\\$1') + '"]');
            if (!g) return;
            var chiusa = g.classList.toggle('is-chiusa');
            b.setAttribute('aria-expanded', chiusa ? 'false' : 'true');
        });

        /* Gruppi della COLONNA: stessa cosa, e per la stessa ragione — piegare è
           comportamento del motore. In più si AVVISA il chiamante (`__gruppo`):
           chi ridisegna la console (ELABORA lo fa a ogni documento scelto) deve
           poter rimandare lo stato nello schema, altrimenti i gruppi si
           riaprirebbero da soli al primo clic su una voce. */
        box.addEventListener('click', function (e) {
            var b = e.target.closest && e.target.closest('[data-piega-nav]');
            if (!b) return;
            e.stopPropagation();
            var id = b.getAttribute('data-piega-nav');
            var g = box.querySelector('[data-navgruppo="' + id.replace(/(["\\])/g, '\\$1') + '"]');
            if (!g) return;
            var chiusa = g.classList.toggle('is-chiusa');
            b.setAttribute('aria-expanded', chiusa ? 'false' : 'true');
            /* ⚠️ `manda` vive in `open()`, non qui: questo gestore sta in
               `render()`, che disegna anche i riquadri del banco (dove nessuno ha
               aperto niente). Chiamarla direttamente lanciava
               «manda is not defined» a OGNI clic su un titolo di gruppo: il
               gruppo si piegava (la classe è già stata scambiata sopra) ma
               l'avviso non arrivava mai — quindi la console lo riapriva al primo
               ridisegno e la memoria dei gruppi non poteva funzionare.
               `open()` lascia il suo dispacciatore sul BOX: se c'è, si avvisa. */
            if (typeof box._mmManda === 'function') box._mmManda({ azione: '__gruppo', voce: id, chiuso: chiusa }, b);
        });

        /* il toggle della navigazione è comportamento della console, non del
           chiamante: vive qui, non in ogni schermata che la usa */
        if (s.navChiudibile) {
            box.addEventListener('click', function (e) {
                var b = e.target.closest && e.target.closest('[data-nav-toggle]');
                if (b) { e.stopPropagation(); box.classList.toggle('is-nav-chiusa'); }
            });
        }
        attaccaTabelle(box);
        attaccaTip(box);
        return box;
    }

    /* raccoglie i valori dei campi: chi apre il modale non deve rincorrere il DOM */
    function raccogli(box) {
        var out = {};
        box.querySelectorAll('[data-campo]').forEach(function (c) {
            var k = c.getAttribute('data-campo');
            if (c.type === 'checkbox') out[k] = c.checked;
            else if (c.type === 'radio') { if (c.checked) out[k] = c.value || true; }
            else if (c.type === 'number') out[k] = c.value === '' ? null : Number(c.value);
            else out[k] = c.value;
        });
        return out;
    }

    /* ═══════════════════════════════════════════════════════════════════════
       OPEN — il contratto tastiera vive tutto qui, una volta sola.
       ═══════════════════════════════════════════════════════════════════════ */
    function open(schema) {
        var s = Core.normalizzaSchema(schema);
        var check = Core.validaSchema(s);
        if (!check.ok && window.console) console.warn('[MappAIModal] schema con errori:', check.errori);

        return new Promise(function (risolvi) {
            var apriva = document.activeElement;
            var velo = el('div', 'mm-overlay' + (pila.length ? ' mm-overlay--sopra' : ''));
            velo.style.zIndex = String(prossimoZ());
            var box = null;

            var chiuso = false;
            function chiudi(risultato) {
                if (chiuso) return;
                chiuso = true;
                document.removeEventListener('keydown', tasti, true);
                velo.remove();
                pila = pila.filter(function (x) { return x !== velo; });
                /* a schermo sgombro si torna al piano terra: senza, una sessione
                   lunga farebbe salire il contatore all'infinito */
                if (!pila.length) Z_TOP = Z_BASE;
                if (apriva && apriva.focus) { try { apriva.focus({ preventScroll: true }); } catch (e) { apriva.focus(); } }
                risolvi(risultato);
            }

            /* uscita: se ci sono dati in scrittura si chiede conferma invece di
               buttare via quello che l'utente stava facendo */
            function esci() {
                if (!s.sporco) return chiudi(null);
                open({
                    titolo: tt('mm_esci_titolo', 'Uscire senza salvare?'),
                    icona: 'alert-triangle',
                    taglia: 's',
                    sezioni: [{ testo: tt('mm_esci_testo', 'Quello che hai scritto in questa finestra va perso.') }],
                    azioni: [{ id: 'resta', etichetta: tt('mm_esci_resta', 'Torna indietro') },
                    { id: 'esci', etichetta: tt('mm_esci_ok', 'Esci'), ruolo: 'distruttivo' }]
                }).then(function (r) { if (r && r.azione === 'esci') chiudi(null); });
            }

            function fuocabili() {
                return [].slice.call(box.querySelectorAll(
                    'button:not([disabled]), input:not([type=hidden]):not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
                )).filter(function (e) { return e.offsetParent !== null; });
            }

            function tasti(e) {
                if (velo !== pila[pila.length - 1]) return;      /* agisce solo il modale in cima */
                if (e.key === 'Escape' && s.esc) {
                    e.preventDefault(); e.stopPropagation();
                    /* ESC A STRATI: dentro una console si esce prima dal
                       documento aperto, poi dalla console. Chi ha aperto il
                       modale lo sa e risponde `false` per dire «l'ho gestito
                       io»; chi non se ne occupa non deve fare niente. */
                    if (manda({ azione: '__esc' }) === false) return;
                    esci(); return;
                }
                if (e.key === 'Enter' && s.invio && e.target.tagName !== 'TEXTAREA') {
                    var p = box.querySelector('[data-primario]');
                    if (p) { e.preventDefault(); p.click(); }
                    return;
                }
                if (e.key === 'Tab') {                            /* il fuoco resta dentro */
                    var f = fuocabili(); if (!f.length) return;
                    var primo = f[0], ultimo = f[f.length - 1];
                    if (e.shiftKey && document.activeElement === primo) { e.preventDefault(); ultimo.focus(); }
                    else if (!e.shiftKey && document.activeElement === ultimo) { e.preventDefault(); primo.focus(); }
                }
            }

            velo.addEventListener('click', function (e) { if (e.target === velo && s.veloChiude) esci(); });

            /* Il fuoco entra: primo campo → azione primaria → azione non
               distruttiva → la ×. Non si posa MAI su un bottone distruttivo:
               con Invio a portata di dito, un fuoco su «Elimina» è una trappola. */
            function posaFuoco(dove) {
                var primo = dove ||
                    box.querySelector('.mm-campo, input[type=checkbox], input[type=radio]') ||
                    box.querySelector('[data-primario]') ||
                    /* in un elenco la cosa da fare è scegliere: il fuoco parte
                       dalla prima riga, non dalla × di chiusura */
                    box.querySelector('.mm-voce') ||
                    box.querySelector('.mm-btn--secondario, .mm-btn--quieto') ||
                    box.querySelector('.mm-close');
                if (primo && primo.focus) { try { primo.focus({ preventScroll: true }); } catch (e) { primo.focus(); } }
            }
            /* Da quale elemento ripartire dopo un ridisegno: si riconosce dal
               suo ruolo dichiarato, non dalla posizione — dopo aver aggiunto una
               sede la fila è più lunga, e l'ennesimo bottone non è più lo stesso. */
            var ATTR = ['data-azione', 'data-campo', 'data-nav', 'data-scheda'];
            function selFuoco() {
                var a = document.activeElement;
                if (!box || !a || !box.contains(a)) return '';
                for (var i = 0; i < ATTR.length; i++) {
                    var v = a.getAttribute(ATTR[i]);
                    if (v) return '[' + ATTR[i] + '="' + v.replace(/(["\\])/g, '\\$1') + '"]';
                }
                return '';
            }

            function risultatoDi(id, az) {
                return {
                    azione: id, etichetta: az ? az.etichetta : id,
                    valore: az ? az.valore : id, valori: raccogli(box)
                };
            }
            /* Il gestore è un comportamento del modale APERTO, non un dato dello
               schema: chi ridisegna manda dati nuovi e non deve riattaccarlo
               ogni volta. Un nuovo schema può sostituirlo, non azzerarlo. */
            var gestore = typeof schema.suAzione === 'function' ? schema.suAzione : null;
            function manda(ev, sorgente) {
                if (!ev.valori) ev.valori = raccogli(box);
                return gestore ? gestore(ev, box, ridisegna, sorgente) : undefined;
            }
            /* i gestori che il motore attacca in `render()` (i gruppi della
               colonna) devono poter avvisare chi ha aperto la finestra, e da lì
               `manda` non è raggiungibile: si lascia sul box. Un ridisegno
               costruisce un box NUOVO, quindi va ri-appeso ogni volta (lo fa
               `ridisegna`, che ripassa da qui). */
            function segnaManda(el) { if (el) el._mmManda = manda; }

            function legaBox() {
                box.addEventListener('click', function (e) {
                    /* Navigazione e schede cambiano la VISTA, non concludono
                       niente: chi ha aperto la console riceve l'evento e rimanda
                       uno schema nuovo. Chiudere qui vorrebbe dire che cambiare
                       pagina è un modo di uscire. */
                    var n = e.target.closest && e.target.closest('[data-nav]');
                    if (n) return manda({ azione: '__nav', voce: n.getAttribute('data-nav') }, n);
                    var sc = e.target.closest && e.target.closest('[data-scheda]');
                    if (sc) return manda({ azione: '__scheda', voce: sc.getAttribute('data-scheda') }, sc);

                    var b = e.target.closest && e.target.closest('[data-azione]');
                    if (!b) return;
                    var id = b.getAttribute('data-azione');
                    if (id === '__chiudi') return esci();
                    var tutte = s.azioni.concat(s.azioniTestata);
                    s.sezioni.forEach(function (x) {
                        tutte = tutte.concat(x.azioni);
                        /* una VOCE di elenco è un bottone come gli altri: sceglierla
                           conclude, e i suoi comandi in coda no */
                        x.voci.forEach(function (v) {
                            if (v.tipo !== 'gruppo') tutte = tutte.concat([v], v.azioni);
                        });
                    });
                    /* le righe delle tabelle e i loro comandi seguono la stessa regola */
                    [s.tabella].concat(s.tabelle).filter(Boolean).forEach(function (t) {
                        t.righe.forEach(function (r) {
                            if (r.id) tutte = tutte.concat([{ id: r.id, etichetta: r.id, valore: r.id, chiude: r.chiude }]);
                            r.forEach(function (cel) {
                                if (cel && cel.azioni) tutte = tutte.concat(cel.azioni);
                            });
                        });
                    });
                    /* le voci `azione` del bento sono azioni come le altre: conclusive
                       per default (come le azioni di sezione), a meno di chiude:false */
                    (s.bento || []).forEach(function (m) {
                        (m.voci || []).forEach(function (v) {
                            if (v.forma === 'azione') tutte = tutte.concat([{ id: v.id, etichetta: v.et, valore: v.id, chiude: v.chiude !== false }]);
                        });
                    });
                    var az = tutte.filter(function (a) { return a.id === id; })[0];
                    /* Conclude solo un'azione DICHIARATA. Tutto il resto — il «+»
                       di un elenco, la × di una voce, una metà del chip di
                       contesto, una cella di scelte — è un comando interno del
                       motore: chiudere la finestra sopra a quel clic butterebbe
                       via il lavoro proprio mentre lo si sta facendo. */
                    if (az && az.chiude) return chiudi(risultatoDi(id, az));
                    manda(risultatoDi(id, az), b);
                });
                /* Un campo che cambia può cambiare il modale: scegliere «Docente
                   di sostegno» apre una sezione che prima non c'era, scegliere
                   Infomaniak chiede un Product ID. Senza questo, l'unico modo
                   sarebbe che ogni schermata si riattaccasse al DOM da sé —
                   cioè quello che il motore serve a non fare più. */
                box.addEventListener('change', function (e) {
                    var c = e.target.closest && e.target.closest('[data-campo]');
                    if (!c) return;
                    manda({ azione: '__campo', campo: c.getAttribute('data-campo') }, c);
                });
            }

            /* Montaggio e RI-montaggio. Uno schema è dati: quando i dati cambiano
               (una sede in più, una vista di console scelta) la finestra si
               ridisegna sul posto invece di chiudersi e riaprirsi. */
            function monta(nuovo) {
                if (nuovo) {
                    if (typeof nuovo.suAzione === 'function') gestore = nuovo.suAzione;
                    s = Core.normalizzaSchema(nuovo);
                }
                var vecchio = box;
                box = render(s);
                legaBox();
                segnaManda(box);          /* i gruppi della colonna avvisano da qui */
                if (vecchio) velo.replaceChild(box, vecchio); else velo.appendChild(box);
            }
            function ridisegna(nuovo) {
                if (chiuso) return;
                var sel = selFuoco();
                monta(nuovo);
                disegnaIcone(velo);
                posaFuoco(sel ? box.querySelector(sel) : null);
                return box;
            }

            monta();
            document.body.appendChild(velo);
            pila.push(velo);
            disegnaIcone(velo);
            posaFuoco();
            document.addEventListener('keydown', tasti, true);
            /* Chi apre una finestra che aspetta dati (la scansione dei vault, una
               chiamata AI) ha bisogno di ridisegnare quando arrivano, senza che
               l'utente abbia toccato niente: `suAzione` da solo non basta, perché
               nasce da un gesto. */
            if (typeof schema.suApertura === 'function') schema.suApertura(box, ridisegna);
        });
    }

    /* scorciatoie: sono il 60% dei modali di oggi */
    function conferma(o) {
        o = o || {};
        return open({
            titolo: o.titolo || tt('mm_conferma_titolo', 'Confermi?'),
            icona: o.icona || 'help-circle',
            taglia: 's',
            sezioni: o.testo ? [{ testo: o.testo }] : [],
            azioni: [
                { id: 'no', etichetta: o.annulla || tt('mm_annulla', 'Annulla') },
                { id: 'si', etichetta: o.conferma || tt('mm_conferma', 'Conferma'), ruolo: o.distruttivo ? 'distruttivo' : 'primario' }
            ]
        }).then(function (r) { return !!(r && r.azione === 'si'); });
    }
    function avviso(o) {
        o = typeof o === 'string' ? { testo: o } : (o || {});
        return open({
            titolo: o.titolo || tt('mm_avviso_titolo', 'Attenzione'),
            icona: o.icona || 'alert-triangle',
            taglia: 's',
            sezioni: [{ testo: o.testo || '' }],
            azioni: [{ id: 'ok', etichetta: o.ok || tt('mm_ok', 'Ho capito'), ruolo: 'primario' }]
        });
    }
    function chiedi(o) {
        o = o || {};
        return open({
            titolo: o.titolo || tt('mm_chiedi_titolo', 'Inserisci un valore'),
            icona: o.icona || 'pencil-line',
            taglia: o.taglia || 's',
            sezioni: [{ campi: [{ id: 'valore', tipo: o.tipo || 'testo', etichetta: o.etichetta || o.titolo || tt('mm_valore', 'Valore'), valore: o.valore || '' }] }],
            azioni: [{ id: 'no', etichetta: tt('mm_annulla', 'Annulla') }, { id: 'si', etichetta: o.conferma || tt('mm_salva', 'Salva'), ruolo: 'primario' }]
        }).then(function (r) { return r && r.azione === 'si' ? r.valori.valore : null; });
    }

    /* ── La finestra di SALVATAGGIO (5/8, richiesta di Giacomo) ───────────────
       Uscire da un documento con modifiche non è una conferma qualunque: ci sono
       TRE strade, non due — salvare, uscire buttando via, tornare indietro — e
       una conferma sì/no ne perde una (quella che di solito si vuole).
       È qui e non in chi apre il documento perché la domanda è sempre la stessa
       ovunque si scriva: due formulazioni della stessa domanda si leggono come
       due comportamenti diversi.
       ⚠️ Il fuoco NON si posa sul distruttivo: si posa su «Salva». Esce
       'salva' | 'esci' | 'annulla' (velo, ESC e × valgono 'annulla': chi non
       risponde non perde niente). */
    function chiediSalvataggio(o) {
        o = o || {};
        var nome = o.nome ? ('«' + o.nome + '»') : tt('mm_salva_questo', 'questo documento');
        return open({
            titolo: o.titolo || tt('mm_salva_titolo', 'Salvi le modifiche?'),
            icona: o.icona || 'save',
            taglia: 's',
            sezioni: [{ testo: o.testo || tt('mm_salva_testo', 'Hai modifiche non salvate in ') + nome + '.' }],
            azioni: [
                { id: 'annulla', etichetta: o.annulla || tt('mm_salva_indietro', 'Torna indietro') },
                { id: 'esci', etichetta: o.esci || tt('mm_salva_esci', 'Esci senza salvare'), ruolo: 'distruttivo' },
                { id: 'salva', etichetta: o.salva || tt('mm_salva', 'Salva'), ruolo: 'primario' }
            ]
        }).then(function (r) {
            var a = r && r.azione;
            return (a === 'salva' || a === 'esci') ? a : 'annulla';
        });
    }

    /* il chip di contesto anche fuori dai modali: la barra della landing lo
       usa così, senza aprire niente — una forma sola per un'informazione sola */
    function chipContesto(parti) {
        var n = Core.normalizzaSchema({ titolo: '.', contesto: parti || [] });
        var d = document.createElement('div');
        d.innerHTML = ctxHtml(n.contesto);
        var el = d.firstChild;
        disegnaIcone(el);
        return el;
    }

    return {
        open: open, render: render, conferma: conferma, avviso: avviso, chiedi: chiedi,
        chiediSalvataggio: chiediSalvataggio,
        chipContesto: chipContesto,
        /* Per le finestre non ancora migrate che devono comparire sopra: chiedono
           il prossimo piano invece di inventarsi un numero. `alza` è la forma
           pronta all'uso (selettore + ritenta finché la finestra non c'è). */
        prossimoZ: prossimoZ,
        alza: alza,
        stile: STILE,
        get aperti() { return pila.length; },
        Core: Core
    };
}));
