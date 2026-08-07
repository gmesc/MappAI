/*
 * mappai-console-manifesto.js — quel poco di comportamento che la veste
 * «manifesto» chiede alle CONSOLE, e che il CSS da solo non può dare.
 * (disegno di Giacomo: Inkscape/console cabina profilo insegnante.pdf, 4/8/26)
 *
 * Fa tre cose, e nessuna tocca il motore dei modali:
 *   1. mette `man-console` su <html> finché una console a schermo pieno è
 *      aperta → il rail delle tre forme si alza SOPRA di lei e resta visibile
 *      (è la costante della finestra: non si copre, ci si lavora accanto);
 *   2. trasforma il pallino della testata nel comando di USCITA — Giacomo, 4/8:
 *      «si esce con ESC oppure cliccando sul pallino viola». Gli mette
 *      `data-azione="__chiudi"`, cioè la STESSA strada della × di prima: il
 *      motore la riconosce già (`if (id === '__chiudi') return esci()`), quindi
 *      qui non nasce una seconda via d'uscita da tenere allineata;
 *   3. dà alla maniglia l'icona giusta (pannello che si apre / si chiude)
 *      invece del chevron.
 *
 * ⚠️ Le icone sono SVG IN LINEA, non `<i data-lucide>`: `safeCreateIcons()` è
 * un hub globale che riscrive le icone di tutta la pagina, e chiamarlo da un
 * osservatore che guarda il DOM chiude il cerchio (§TRAPPOLE del manifesto).
 *
 * Inerte se la veste è spenta: il kill-switch resta `mappai_stile_manifesto`.
 */
(function () {
    'use strict';

    var CLASSE = 'man-console';

    /* i18n con l'italiano come ripiego inline (regola 13): la chiave vive solo
       nel dizionario EN. */
    function t(k, f) { try { return (window.t ? window.t(k, f) : f); } catch (e) { return f; } }

    function vesteAccesa() {
        return document.documentElement.classList.contains('manifesto');
    }

    /* Tracciati Lucide, copiati: `panel-left-close` e `panel-left-open`. */
    function svg(d) {
        return '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" ' +
            'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" ' +
            'stroke-linejoin="round" aria-hidden="true">' + d + '</svg>';
    }
    var BASE = '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M9 3v18"/>';
    var CHIUDI = svg(BASE + '<path d="m16 15-3-3 3-3"/>');
    var APRI = svg(BASE + '<path d="m14 9 3 3-3 3"/>');

    function consolePiena() {
        /* l'ULTIMA della pila: se sopra la console si è aperta una finestra,
           quella non è una console e non deve cambiare niente */
        var tutte = document.querySelectorAll('.mm-overlay .mm-box--piena.mm-box--console');
        return tutte.length ? tutte[tutte.length - 1] : null;
    }

    /* La sezione della console: la scrive chi la apre, subito prima di aprirla,
       in `dataset.manSezionePendente` su <html>. Qui la si travasa sul VELO,
       perché le console si impilano (dalla Cabina si può aprire INSEGNA e
       viceversa) e una variabile globale direbbe sempre l'ultima aperta, anche
       dopo che è stata chiusa.
       ⚠️ Sul velo e NON sul riquadro: `ridisegna()` del motore costruisce un
       riquadro NUOVO e sostituisce il vecchio dentro il velo (misurato: INSEGNA
       si ridisegna appena la scansione dei vault finisce, e la sezione scritta
       sul riquadro spariva lì). Il velo, invece, vive quanto la finestra. */
    function veloDi(box) { return box.closest('.mm-overlay'); }

    function sezioneDi(box) {
        var v = veloDi(box);
        return v ? (v.dataset.manSezione || '') : '';
    }

    function marcaSezione(box) {
        var v = veloDi(box);
        if (!v || v.dataset.manSezione) return;
        var html = document.documentElement;
        v.dataset.manSezione = html.dataset.manSezionePendente || '';
        delete html.dataset.manSezionePendente;
    }

    function vestiTestata(box) {
        var ico = box.querySelector('.mm-head__ico');
        if (!ico || ico.dataset.manVestito === '1') return;
        var chiudi = box.querySelector('.mm-head .mm-close');
        var nomeChiudi = (chiudi && chiudi.getAttribute('aria-label')) || 'Chiudi';
        var titolo = (box.querySelector('.mm-title') || {}).textContent || '';
        var inCabina = sezioneDi(box) === 'cabina';

        /* da <div> a <button>: senza, non è raggiungibile da tastiera e lo
           screen reader non ha niente da annunciare. Il contenuto (l'icona
           della console) resta quello che il motore ha già disegnato. */
        var b = document.createElement('button');
        b.type = 'button';
        b.className = ico.className + (inCabina ? '' : ' mm-head__ico--cabina');
        b.innerHTML = ico.innerHTML;

        if (inCabina) {
            /* Sei NELLA Cabina: il pallino è acceso e cliccarlo esce. Porta
               `__chiudi`, cioè la stessa strada della × — nessuna seconda via
               d'uscita da tenere allineata. */
            b.setAttribute('data-azione', '__chiudi');
            b.setAttribute('aria-label', titolo ? nomeChiudi + ' — ' + titolo : nomeChiudi);
        } else {
            /* Fuori dalla Cabina il pallino È il bottone della Cabina, identico
               a quello della landing: grigio col puntino scuro, viola quando ci
               passi sopra (decisione di Giacomo, 4/8: «deve rimanere grigio col
               punto nero in modo da poter passare a CABINA»). Da una console si
               esce con ESC o scegliendo un'altra forma nel rail. */
            b.setAttribute('aria-label', t('mn_vai_cabina', 'Apri la Cabina'));
            b.addEventListener('click', function (e) {
                e.preventDefault(); e.stopPropagation();
                if (window.openCabina) window.openCabina();
            });
        }
        b.title = b.getAttribute('aria-label');
        b.dataset.manVestito = '1';
        ico.parentNode.replaceChild(b, ico);
        montaChip(b);
        montaBriciole(box);
    }

    /* Il CHIP del contesto nella testata, subito dopo il pallino (5/8, richiesta
       di Giacomo: «il chip è sempre visibile nella stessa posizione»).
       ⚠️ Non si può contare sul chip della landing: una console a schermo pieno
       sta a z 12100 e la barra della landing a 60, quindi là sotto è coperto. Il
       chip va rimontato QUI, ma costruito dalla stessa funzione
       (`MappAIClasses.chipNodo`) — due costruzioni finirebbero per mostrare due
       contesti diversi nella stessa schermata.
       ⚠️ Niente `id`: quello (`active-class-chip`) resta del chip della landing;
       due elementi con lo stesso id sono un guaio silenzioso. */
    function montaChip(dopo) {
        if (!dopo || !dopo.parentNode) return;
        var head = dopo.parentNode;
        /* console col PERCORSO interattivo (cablaggio bento, `mn-percorso`): niente
           chip qui — il contesto vive nel percorso «A chi? · Materia». Si toglie
           anche l'eventuale chip già montato da un giro precedente della veste. */
        var boxP = dopo.closest && dopo.closest('.mm-box--console');
        if (boxP && boxP.classList.contains('mn-percorso')) {
            var c = head.querySelector('.mm-ctx'); if (c) c.remove();
            return;
        }
        /* ⚠️ Se la console ha GIÀ il suo chip (INSEGNA lo dichiara nello schema, e
           là non è un'etichetta: è il FILTRO della colonna delle mappe), non se ne
           aggiunge un secondo — si adotta quello, dandogli solo il posto. Due chip
           nella stessa testata sono due comandi per la stessa cosa, e uno dei due
           finisce per non essere quello che l'utente crede di premere. */
        var suo = head.querySelector('.mm-ctx:not(.mn-chip-console)');
        if (suo) { suo.classList.add('mn-chip-console'); return; }
        var vecchio = head.querySelector('.mn-chip-console');
        if (!window.MappAIClasses || !window.MappAIClasses.chipNodo) return;
        var nodo = window.MappAIClasses.chipNodo();
        if (!nodo) return;
        nodo.classList.add('mn-chip-console');
        if (vecchio) vecchio.replaceWith(nodo);
        else head.insertBefore(nodo, dopo.nextSibling);
        if (window.safeCreateIcons) window.safeCreateIcons();
    }

    /* ── LE BRICIOLE: dove sei, in un percorso cliccabile (5/8, Giacomo) ──────
       «Elabora › Documenti › Quiz › nome del file». Non è decorazione: sostituisce
       i comandi d'uscita. Ogni livello riporta indietro di un passo, quindi la ×
       e i «Chiudi» sparsi non servono più — e non c'è più un posto dove l'uscita
       possa dire una cosa diversa da dove sei.
       ⚠️ Vivono sul VELO, non sul riquadro: il riquadro viene ricostruito a ogni
       ridisegno della console (è la stessa ragione per cui ci sta la sezione).
       ⚠️ Il livello CORRENTE non si preme: è dove sei. Gli altri emettono
       `mappai-briciola` con il loro id — chi ha aperto la console decide che cosa
       vuol dire tornare lì (per un documento con modifiche: la finestra di
       salvataggio, `MappAIModal.chiediSalvataggio`). */
    function briciole(livelli) {
        var box = consolePiena();
        var velo = box && veloDi(box);
        if (!velo) return;
        velo.__mnBriciole = (livelli && livelli.length) ? livelli.slice() : null;
        if (box) montaBriciole(box);
    }

    function montaBriciole(box) {
        /* le briciole di una console col percorso interattivo le costruisce il
           cablaggio bento (montaPercorso): la veste non le tocca */
        if (box && box.classList && box.classList.contains('mn-percorso')) return;
        var velo = veloDi(box);
        var liv = velo && velo.__mnBriciole;
        var testi = box.querySelector('.mm-head__testi') || box.querySelector('.mm-head');
        if (!testi) return;
        var vecchio = testi.querySelector('.mn-briciole');
        if (!liv || !liv.length) { if (vecchio) vecchio.remove(); testi.classList.remove('ha-briciole'); return; }

        var nav = document.createElement('nav');
        nav.className = 'mn-briciole';
        nav.setAttribute('aria-label', t('mn_briciole_aria', 'Percorso'));
        liv.forEach(function (l, i) {
            var ultimo = i === liv.length - 1;
            if (i) {
                var sep = document.createElement('span');
                sep.className = 'mn-briciole__sep';
                sep.setAttribute('aria-hidden', 'true');
                sep.textContent = '›';
                nav.appendChild(sep);
            }
            var el = document.createElement(ultimo ? 'span' : 'button');
            el.className = 'mn-briciole__l' + (ultimo ? ' is-qui' : '');
            el.textContent = l.et || '';
            if (ultimo) {
                el.setAttribute('aria-current', 'page');
            } else {
                el.type = 'button';
                el.addEventListener('click', function (ev) {
                    ev.preventDefault(); ev.stopPropagation();
                    document.dispatchEvent(new CustomEvent('mappai-briciola', {
                        detail: { id: l.id || '', indice: i, livelli: liv }
                    }));
                });
            }
            nav.appendChild(el);
        });
        if (vecchio) vecchio.replaceWith(nav); else testi.appendChild(nav);
        testi.classList.add('ha-briciole');
    }

    /* il contesto cambia mentre la console è aperta (dal chip stesso, o da una
       vista «Allievi/Classi» della Cabina): il chip deve dirlo subito */
    function ridisegnaChip() {
        var box = consolePiena();
        if (!box) return;
        var pallino = box.querySelector('.mm-head__ico[data-man-vestito="1"]');
        if (pallino) montaChip(pallino);
    }

    function vestiManiglia(box) {
        var m = box.querySelector('.mm-console__man');
        if (!m) return;
        var chiusa = box.classList.contains('is-nav-chiusa');
        var vuole = chiusa ? 'apri' : 'chiudi';
        if (m.dataset.manIcona === vuole) return;
        m.innerHTML = chiusa ? APRI : CHIUDI;
        m.dataset.manIcona = vuole;
    }

    /* Il rail deve stare SOPRA la console e SOTTO qualunque finestra aperta da
       lì. Il piano non si può scrivere nel foglio: il motore lo assegna a
       runtime (`prossimoZ()` sale di 100 a ogni finestra), quindi un numero
       fisso indovina finché non sbaglia — misurato: la console si era aperta a
       12100 e il rail a 12050 spariva sotto. Si legge il piano vero e ci si
       mette un gradino sopra. */
    function alzaRail(box) {
        var rail = document.getElementById('manifesto-rail');
        if (!rail) return;
        /* ⚠️ Il rail se ne va con la COLONNA (5/8, regola di Giacomo): chi chiude
           la colonna per leggere un documento a tutta larghezza sta chiedendo di
           togliere di mezzo la navigazione, e il rail è navigazione. Torna con
           lei — la maniglia resta l'unico comando, quindi non si può restare
           senza via d'uscita. */
        var nascosto = !!box && box.classList.contains('is-nav-chiusa');
        rail.style.display = nascosto ? 'none' : '';
        if (!box) { rail.style.removeProperty('z-index'); return; }
        var ov = box.closest('.mm-overlay');
        var z = parseInt(ov ? getComputedStyle(ov).zIndex : '', 10);
        rail.style.zIndex = (isFinite(z) ? z + 1 : 12001);
    }

    function aggiorna() {
        if (!vesteAccesa()) return;
        var box = consolePiena();
        document.documentElement.classList.toggle(CLASSE, !!box);
        alzaRail(box);
        if (box) { marcaSezione(box); vestiTestata(box); vestiManiglia(box); }
        /* Il rail dice dove sei: cambia quando una console si apre E quando si
           chiude (là sotto c'è di nuovo una modalità della landing). */
        if (window.MappAIManifesto && window.MappAIManifesto.sincronizza) {
            try { window.MappAIManifesto.sincronizza(); } catch (e) { }
        }
    }

    function avvio() {
        if (!vesteAccesa()) return;
        aggiorna();
        if (!window.MutationObserver) return;
        /* Il segnale è il DOM: il motore appende e toglie gli overlay dal body,
           e la maniglia cambia una CLASSE sul riquadro — nessuna funzione da cui
           passare, e avvolgerne una la legherebbe a com'è scritto dentro. */
        new MutationObserver(aggiorna).observe(document.body, {
            childList: true, subtree: true, attributes: true, attributeFilter: ['class']
        });
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', avvio);
    else avvio();

    document.addEventListener('mappai-active-class-changed', ridisegnaChip);

    window.MappAIConsoleManifesto = { aggiorna: aggiorna, briciole: briciole };
})();
