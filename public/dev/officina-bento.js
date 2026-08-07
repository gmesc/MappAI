/* ═══════════════════════════════════════════════════════════════════════════
   OFFICINA §7 — COMPOSIZIONE DEL BENTO
   Banco per decidere DOVE va ogni opzione di «Genera materiali» e quanto spazio
   prende ogni riquadro. Si trascina, si guarda, si applica all'app.

   Perché uno strumento e non due ritocchi al CSS: le tre cose che Giacomo ha
   trovato guardando il bento — corpi tipografici diversi, i preset spariti, un
   bottone fuori griglia — non sono tre sviste, sono la stessa cosa: la
   composizione non era scritta da nessuna parte, quindi non poteva essere né
   controllata né discussa. Ora è un DATO (public/js/mappai-bento-composizione.js),
   e questo banco è il posto dove si modifica.

   Tre pannelli:
   · INVENTARIO — le voci non ancora assegnate (trascinabili). Se qui resta
     qualcosa, quell'opzione non esiste nell'interfaccia.
   · GRIGLIA — i moduli, con titolo, larghezza in colonne e le voci dentro.
   · DIAGNOSI — cosa manca, quale riga non chiude, chi è staccato dal suo master.
     Più i CORPI misurati sull'anteprima vera, con chi esce dalla scala.

   ⚠️ Il trascinamento non basta da solo: ogni voce porta anche una tendina
   «sposta in…». Un banco che si usa solo col mouse esclude chi lavora da
   tastiera, ed è la stessa regola che vale per l'app.
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
    'use strict';

    var B = window.MappAIBento;
    if (!B) return;

    var LS = 'mappai_bento_layout';
    var stato = null;          // moduli correnti (copia di lavoro)
    var trascinata = null;     // id della voce che si sta trascinando
    var modTrascinato = null;  // id del MODULO che si sta spostando

    function esc(s) {
        return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
    function copia(x) { return JSON.parse(JSON.stringify(x)); }

    var LS_FIRMA = 'mappai_bento_layout_firma';
    var LS_PREC = 'mappai_bento_layout_precedente';
    var ripartito = null;      // messaggio da mostrare se si è ripartiti dal file

    /* ⚠️ Il lavoro salvato vince sul file finché si compone — ma NON quando la
       composizione del codice è cambiata sotto (5/8): si continuava a ritoccare una
       versione vecchia senza saperlo, e le correzioni «non arrivavano».
       Ora si confronta la FIRMA (`MappAIBento.firma`): id, ordine, span, altezze e
       voci. Se la firma del file è diversa da quella con cui il lavoro è stato
       salvato, si riparte DAL FILE — e il lavoro precedente non si perde: finisce in
       una chiave sua, con un bottone per recuperarlo. Perdere in silenzio quello che
       qualcuno ha composto sarebbe peggio del problema che questa regola risolve. */
    function carica() {
        var salvato = null;
        try {
            var s = localStorage.getItem(LS);
            if (s) { var j = JSON.parse(s); if (Array.isArray(j) && j.length) salvato = j; }
        } catch (e) { }
        if (!salvato) return copia(B.MODULI);

        var firmaFile = B.firma ? B.firma(B.MODULI) : '';
        var firmaSalvata = '';
        try { firmaSalvata = localStorage.getItem(LS_FIRMA) || ''; } catch (e) { }

        if (!B.firma || firmaSalvata === firmaFile) return salvato;

        /* il codice è cambiato (o il lavoro è di prima che la firma esistesse):
           si mette da parte e si riparte da quello che dice il repo */
        try {
            localStorage.setItem(LS_PREC, JSON.stringify(salvato));
            localStorage.removeItem(LS);
            localStorage.setItem(LS_FIRMA, firmaFile);
        } catch (e) { }
        ripartito = firmaSalvata
            ? 'La composizione nel codice è cambiata: sei ripartito da quella.'
            : 'Il lavoro salvato era di prima che esistesse il controllo di versione: sei ripartito dalla composizione del codice.';
        return copia(B.MODULI);
    }

    /* ── inventario: le voci non assegnate ──────────────────────────────── */
    function nonAssegnate() {
        var usate = {};
        stato.forEach(function (m) {
            (m.voci || []).forEach(function (v) { usate[v] = true; });
            if (m.master) usate[m.master] = true;
        });
        return B.VOCI.filter(function (v) { return !usate[v.id]; });
    }

    /* `v` è una voce normalizzata {id, et, w, base} quando sta in un modulo,
       oppure una voce d'inventario. `dentro` = è già montata. */
    function chipVoce(v, dentro) {
        var base = v.base || v;
        var opz = stato.map(function (m) {
            return '<option value="' + esc(m.id) + '">' + esc(m.titolo || ('modulo ' + m.id)) + '</option>';
        }).join('');
        var campoLarghezza = (dentro && /tendina|numero|preset/.test(base.tipo))
            ? '<input class="bn-w" type="number" min="60" max="400" step="10" placeholder="px" ' +
              'value="' + (v.w || '') + '" data-voce="' + esc(v.id) + '" title="larghezza del campo, in px" ' +
              'aria-label="Larghezza del campo ' + esc(v.et) + '">' : '';
        var etichetta = dentro
            ? '<input class="bn-et" value="' + esc(v.et) + '" data-voce="' + esc(v.id) + '" ' +
              'aria-label="Etichetta di ' + esc(base.et) + '" title="l\'etichetta a schermo — l\'id del campo non cambia">'
            : '<span class="bn-voce__t">' + esc(v.et) + '</span>';
        /* Il POP-UP della voce e l'etichetta del posto: due leve granulari (5/8).
           L'aiuto è quello che compare passando il mouse dopo 950ms; l'etichetta
           serve dove il pezzo montato mostra un valore e non il proprio nome. */
        var aiuto = dentro
            ? '<input class="bn-aiuto" value="' + esc(v.aiuto || base.aiuto || '') + '" data-voce="' + esc(v.id) + '" ' +
              'placeholder="pop-up informativo…" title="il testo che compare passando il mouse (950ms)" ' +
              'aria-label="Pop-up informativo di ' + esc(v.et) + '">' : '';
        /* ⚠️ UNA leva a tre stati, non due spunte opposte: `mostraEt` e
           `nascondiEt` erano due booleani contrari nati a due giorni di distanza —
           uno stato che si poteva scrivere in modo contraddittorio. */
        var stato3 = B.titoloPosto ? B.titoloPosto(v) : 'auto';
        var etSempre = (dentro && base.tipo === 'strumento')
            ? '<label class="bn-etq" title="il titolo sopra il pezzo: AUTO si vede finché il posto è vuoto · SEMPRE resta anche a pezzo montato (serve dove il pezzo mostra un valore, «ON», «A») · MAI non viene proprio scritto">titolo ' +
              '<select class="bn-titpos" data-voce="' + esc(v.id) + '" aria-label="Titolo del posto di ' + esc(v.et) + '">' +
              ['auto', 'sempre', 'mai'].map(function (x) {
                  return '<option value="' + x + '"' + (stato3 === x ? ' selected' : '') + '>' + x + '</option>';
              }).join('') + '</select></label>' : '';
        var comandi = '<span class="bn-tipo">' + esc(base.tipo) + '</span>' +
            (base.figlioDi ? '<span class="bn-fig" title="dipende da ' + esc(base.figlioDi) + '">↳</span>' : '') +
            (dentro && !(v.aiuto || base.aiuto) ? '<span class="bn-k bn-k--ko" title="senza pop-up questa opzione non si spiega da nessuna parte">senza aiuto</span>' : '') +
            etSempre +
            campoLarghezza +
            '<select class="bn-sposta" data-voce="' + esc(v.id) + '" aria-label="Sposta ' + esc(v.et) + ' in un modulo">' +
            '<option value="">sposta in…</option>' + opz +
            (dentro ? '<option value="__fuori">— toglila —</option>' : '') + '</select>';
        /* dentro un modulo l'etichetta prende una RIGA SUA: in linea coi comandi
           restava larga un dito e non si riusciva a scriverci */
        return '<div class="bn-voce' + (dentro ? ' bn-voce--dentro' : '') + '" draggable="true" data-voce="' + esc(v.id) + '">' +
            etichetta + aiuto + '<div class="bn-voce__c">' + comandi + '</div></div>';
    }

    /* ── I CONTROLLI GRANULARI: come stanno le voci DENTRO il riquadro ────────
       Il livello che mancava. Fin qui si governava il riquadro (colonne, altezza,
       colori) e la singola voce (etichetta, larghezza del campo); come le voci si
       dispongono là dentro e che aspetto hanno i bottoni stava solo nel foglio —
       il `minmax(220px)` della griglia e il `color-mix(currentColor 14%)` dei
       bottoni. Numeri veri, e non discutibili.

       ⚠️ I colori dei bottoni hanno un interruttore, e non è una comodità: un
       `<input type=color>` non sa dire «non scelto», e senza quello stato non si
       potrebbe più tornare al derivato dal modulo — che è il comportamento giusto
       nella grande maggioranza dei casi. Spento = niente in `m.bottoni`, quindi il
       foglio resta sul suo fallback. */
    function interni(m) {
        var L = B.layoutDi(m), BT = B.bottoniDi(m);
        var propri = B.haBottoniScelti(m);
        var kRip = B.contrasto(BT.bg, BT.testo);
        var kHov = B.contrasto(BT.hoverBg, BT.hoverTesto);
        var larg = B.largezzaVoce(m);
        var badge = function (k, titolo) {
            return '<span class="bn-k' + (k != null && k < 4.5 ? ' bn-k--ko' : '') + '" title="' + esc(titolo) + '">' +
                (k == null ? '—' : String(k).replace('.', ',') + ':1') + '</span>';
        };
        var opzColonne = ['auto', 'colonna', 1, 2, 3, 4, 5, 6].map(function (v) {
            var et = v === 'auto' ? 'auto' : (v === 'colonna' ? 'in colonna' : v + ' per riga');
            return '<option value="' + v + '"' + (String(L.colonneVoci) === String(v) ? ' selected' : '') + '>' + et + '</option>';
        }).join('');
        return '<div class="bn-asp bn-int">' +
            '<label title="come si dispongono le voci nel riquadro">voci ' +
            '<select class="bn-voci-n" data-mod="' + esc(m.id) + '" aria-label="Disposizione delle voci">' + opzColonne + '</select></label>' +
            '<label title="larghezza minima di una colonna quando la disposizione è «auto»">min col ' +
            '<input class="bn-colmin" type="number" min="80" max="600" step="10" value="' + L.colMin + '" ' +
            'data-mod="' + esc(m.id) + '" aria-label="Larghezza minima di colonna"></label>' +
            '<span class="bn-hreale" title="larghezza di una voce con la disposizione scelta"' +
            (larg < B.GEOM.minLeggibile ? ' style="color:#dc2626;font-weight:800"' : '') + '>' +
            larg + 'px/voce</span>' +
            '<label title="dove sta l\'etichetta rispetto al campo">etich. ' +
            '<select class="bn-et-pos" data-mod="' + esc(m.id) + '" aria-label="Posizione delle etichette">' +
            '<option value="sinistra"' + (L.etichette === 'sinistra' ? ' selected' : '') + '>a sinistra</option>' +
            '<option value="sopra"' + (L.etichette === 'sopra' ? ' selected' : '') + '>sopra</option></select></label>' +
            '<label title="colonna FISSA delle etichette, in px: è la leva che allinea i campi fra loro (0 = naturale)">col. et. ' +
            '<input class="bn-et-w" type="number" min="0" max="300" step="5" value="' + (L.etLarghezza || '') + '" ' +
            'placeholder="0" data-mod="' + esc(m.id) + '" aria-label="Larghezza della colonna delle etichette"></label>' +
            '<label title="con i colori propri spenti, i bottoni interni si ricavano dal modulo (fondo = testo al 14%, hover verde)">' +
            '<input type="checkbox" class="bn-btn-on" data-mod="' + esc(m.id) + '"' + (propri ? ' checked' : '') + '> colori bottoni</label>' +
            (propri
                ? '<label title="fondo del bottone a riposo">bg <input class="bn-c" type="color" value="' + esc(BT.bg) + '" data-btnbg="' + esc(m.id) + '" aria-label="Fondo dei bottoni interni"></label>' +
                  '<label title="testo del bottone a riposo">txt <input class="bn-c" type="color" value="' + esc(BT.testo) + '" data-btntxt="' + esc(m.id) + '" aria-label="Testo dei bottoni interni"></label>' +
                  '<label title="fondo al passaggio">hov <input class="bn-c" type="color" value="' + esc(BT.hoverBg) + '" data-btnhbg="' + esc(m.id) + '" aria-label="Fondo dei bottoni al passaggio"></label>' +
                  '<input class="bn-c" type="color" value="' + esc(BT.hoverTesto) + '" data-btnhtxt="' + esc(m.id) + '" title="testo al passaggio" aria-label="Testo dei bottoni al passaggio">'
                : '<span class="bn-hreale" title="fondo composito calcolato dal modulo">derivati (' + esc(BT.bg) + ')</span>') +
            badge(kRip, 'contrasto dei bottoni a riposo, sul fondo che si VEDE (composito)') +
            badge(kHov, 'contrasto dei bottoni al passaggio') +
            '</div>';
    }

    /* ── un modulo della griglia ──────────────────────────────────────────
       Il modulo si trascina per la MANIGLIA (⠿), non da tutto il riquadro:
       dentro ci sono voci che si trascinano a loro volta, e due bersagli
       sovrapposti si contendono lo stesso gesto. Le frecce ↑↓ fanno la stessa
       cosa da tastiera. */
    function modulo(m, i) {
        var voci = B.vociDi(m).map(function (v) {
            return v.base && v.base.tipo !== '?' ? chipVoce(v, true)
                : '<div class="bn-voce bn-voce--ko">voce sconosciuta: ' + esc(v.id) + '</div>';
        }).join('');
        var st = B.stileDi(m);
        var k = B.contrasto(st.bg, st.testo);
        var opzIcone = B.ICONE.map(function (n) {
            return '<option value="' + n + '"' + (m.icona === n ? ' selected' : '') + '>' + n + '</option>';
        }).join('');
        /* ⚠️ Qui NON si applica lo span: nell'editor un modulo a 1 colonna
           sarebbe largo un quarto, e il campo dell'etichetta si riduce a un
           filo — «Per ramo» non si riusciva a riscrivere. Il layout vero lo
           mostra l'ANTEPRIMA, che sta sotto: qui conta poter leggere e toccare. */
        return '<div class="bn-mod" data-mod="' + esc(m.id) + '">' +
            '<div class="bn-mod__h">' +
            '<span class="bn-grip" draggable="true" data-modtrascina="' + esc(m.id) + '" ' +
            'title="trascina per spostare il modulo" aria-hidden="true">⠿</span>' +
            '<button type="button" class="bn-su" data-su="' + esc(m.id) + '" aria-label="Sposta il modulo prima"' +
            (i === 0 ? ' disabled' : '') + '>↑</button>' +
            '<button type="button" class="bn-giu" data-giu="' + esc(m.id) + '" aria-label="Sposta il modulo dopo"' +
            (i === stato.length - 1 ? ' disabled' : '') + '>↓</button>' +
            '<input class="bn-tit" value="' + esc(m.titolo || '') + '" data-mod="' + esc(m.id) + '" ' +
            'placeholder="senza titolo" aria-label="Titolo del modulo">' +
            '<button type="button" class="bn-x" data-del="' + esc(m.id) + '" aria-label="Elimina il modulo ' + esc(m.titolo || m.id) + '">×</button>' +
            '</div>' +
            /* Il bollino dice se il modulo compare SEMPRE o solo nella vista estesa.
               Lo decide il FONDO (`nascondibile`), quindi il bollino non è una scelta
               in più: è la lettura di quello che il fondo già dice. Senza, mentre si
               compone si deve ricordare a memoria che «#404040 = nascondibile». */
            (B.nascondibile ? '<div style="font-size:10px;font-weight:800;letter-spacing:.04em;' +
                'padding:2px 0 6px;color:' + (B.nascondibile(m) ? '#7c3aed' : '#047857') + '">' +
                (B.nascondibile(m)
                    ? '◐ solo nella vista estesa (combo) — fondo scuro'
                    : '● sempre a schermo — è il mega-bento') + '</div>' : '') +
            '<div class="bn-asp">' +
            '<label title="icona Lucide prima del titolo">ico <select class="bn-ico" data-mod="' + esc(m.id) + '" aria-label="Icona del modulo">' +
            '<option value="">— nessuna —</option>' + opzIcone + '</select></label>' +
            '<label title="colonne occupate">col <select class="bn-col" data-mod="' + esc(m.id) + '" aria-label="Colonne occupate">' +
            [1, 2, 3, 4].map(function (n) {
                return '<option value="' + n + '"' + ((m.span || 1) === n ? ' selected' : '') + '>' + n + '</option>';
            }).join('') + '</select></label>' +
            /* ⚠️ Il campo è un'altezza MINIMA, e senza dirlo mente: un valore sotto
               l'altezza naturale del contenuto non produce NIENTE (misurato: 180 e
               260 su un modulo alto 277 non cambiano un pixel; 300 sì). Giacomo ha
               alzato i numeri, non ha visto muoversi nulla e ha concluso che il
               banco perdesse il dato — invece l'export era corretto.
               Ora accanto al campo c'è l'altezza REALE letta dall'anteprima, e il
               numero diventa rosso quando è inefficace: il banco dice cosa succede,
               che è il suo lavoro. Resta un MINIMO di proposito — imporre l'altezza
               taglierebbe il contenuto. */
            '<label title="altezza MINIMA del riquadro, in px: un valore sotto l\'altezza del contenuto non ha effetto">' +
            'h min <input class="bn-h" type="number" min="60" max="600" step="10" ' +
            'placeholder="auto" value="' + (m.altezza || '') + '" data-mod="' + esc(m.id) + '" aria-label="Altezza minima del modulo">' +
            '<span class="bn-hreale" data-hreale="' + esc(m.id) + '" style="font-size:10px;opacity:.7;margin-left:4px">—</span></label>' +
            '<label title="colore del fondo">bg <input class="bn-c" type="color" value="' + esc(st.bg) + '" data-bg="' + esc(m.id) + '" aria-label="Colore del fondo"></label>' +
            '<label title="colore del testo">txt <input class="bn-c" type="color" value="' + esc(st.testo) + '" data-txt="' + esc(m.id) + '" aria-label="Colore del testo"></label>' +
            '<label title="spessore del bordo, in px">bd <input class="bn-bp" type="number" min="0" max="6" value="' + st.bordoPx + '" data-bp="' + esc(m.id) + '" aria-label="Spessore del bordo"></label>' +
            '<input class="bn-c" type="color" value="' + esc(st.bordoCol) + '" data-bc="' + esc(m.id) + '" title="colore del bordo" aria-label="Colore del bordo">' +
            '<span class="bn-k' + (k != null && k < 4.5 ? ' bn-k--ko' : '') + '" title="contrasto testo/fondo">' +
            (k == null ? '—' : String(k).replace('.', ',') + ':1') + '</span>' +
            '</div>' +
            interni(m) +
            (m.master ? '<div class="bn-master">si accende con: <b>' + esc(m.master) + '</b></div>' : '') +
            '<div class="bn-drop" data-mod="' + esc(m.id) + '">' + (voci || '<span class="bn-vuoto">trascina qui una voce</span>') + '</div>' +
            '</div>';
    }

    /* ── diagnosi ───────────────────────────────────────────────────────── */
    function diagnosi() {
        var v = B.valida(stato);
        var out = '';
        if (v.errori.length) {
            out += '<div class="bn-d bn-d--ko"><b>ERRORI</b><ul>' +
                v.errori.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul></div>';
        }
        if (v.avvisi.length) {
            out += '<div class="bn-d bn-d--av"><b>AVVISI</b><ul>' +
                v.avvisi.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul></div>';
        }
        if (!v.errori.length && !v.avvisi.length) {
            out += '<div class="bn-d bn-d--ok"><b>Nessun errore, nessun avviso.</b> ' +
                'Tutte le voci sono montate e ogni riga chiude le ' + B.COLONNE + ' colonne.</div>';
        }
        out += '<div class="bn-d"><b>FORMA</b> ' + v.righe.length + ' righe · ' + stato.length + ' moduli · ' +
            v.righe.map(function (r, i) {
                var occ = r.reduce(function (a, x) { return a + x.span; }, 0);
                return 'riga ' + (i + 1) + ': ' + occ + '/' + B.COLONNE;
            }).join(' · ') + '</div>';
        return out;
    }

    /* ── i corpi misurati sull'ANTEPRIMA vera ───────────────────────────────
       Non i valori dichiarati nel CSS: quelli che il browser applica davvero,
       letti dall'anteprima renderizzata con le classi dell'app. È l'unico modo
       di accorgersi che una regola più forte ne sta scavalcando un'altra. */
    function corpi() {
        var host = document.getElementById('bn-preview');
        if (!host) return '';
        var visti = {};
        host.querySelectorAll('*').forEach(function (el) {
            if (!el.textContent || !el.textContent.trim()) return;
            if (el.children.length) return;                     // solo le foglie: il testo vero
            if (el.tagName === 'OPTION') return;                // le voci di una tendina non sono in pagina
            var cs = getComputedStyle(el);
            var k = Math.round(parseFloat(cs.fontSize) * 10) / 10 + 'px / ' + cs.fontWeight;
            (visti[k] = visti[k] || []).push(el.textContent.trim().slice(0, 22));
        });
        var attesi = {};
        Object.keys(B.SCALA).forEach(function (k) {
            attesi[B.SCALA[k].px + 'px / ' + B.SCALA[k].peso] = k;
            /* la variante in grassetto dello stesso corpo, dove la scala la
               dichiara (il titolo di una riga di strumento): senza, un grassetto
               VOLUTO comparirebbe qui come «fuori scala» a ogni apertura */
            if (B.SCALA[k].pesoTitolo) attesi[B.SCALA[k].px + 'px / ' + B.SCALA[k].pesoTitolo] = k + ' (titolo di riga)';
        });
        var righe = Object.keys(visti).sort().map(function (k) {
            var ok = !!attesi[k];
            return '<tr class="' + (ok ? '' : 'bn-fuori') + '"><td><b>' + esc(k) + '</b></td>' +
                '<td>' + (ok ? 'scala: ' + esc(attesi[k]) : '<b>fuori scala</b>') + '</td>' +
                '<td>' + visti[k].length + ' pezzi — ' + esc(visti[k].slice(0, 3).join(' · ')) + '</td></tr>';
        }).join('');
        return '<table class="bn-corpi"><thead><tr><th>CORPO / PESO</th><th>ESITO</th><th>DOVE</th></tr></thead>' +
            '<tbody>' + righe + '</tbody></table>' +
            '<p class="bn-nota">La scala dichiarata è: ' +
            Object.keys(B.SCALA).map(function (k) {
                return '<b>' + esc(k) + '</b> ' + B.SCALA[k].px + 'px/' + B.SCALA[k].peso + ' (' + esc(B.SCALA[k].uso) + ')';
            }).join(' · ') + '.</p>';
    }

    /* stessa funzione che usa l'app: l'anteprima non può divergere dal prodotto */
    function stileAnt(m) {
        var st = B.stileDi(m);
        var azione = B.soloAzioni(m);   /* stessa regola dell'app: `nuda` ≠ azione */
        /* le leve granulari passano dalla STESSA funzione che usa l'app
           (`presentazione`): l'anteprima non può divergere dal prodotto */
        var P = B.presentazione ? B.presentazione(m) : { vars: '', attr: '' };
        /* un modulo NUDO non porta fondo né colore: sono del pezzo che accoglie */
        if (m.nuda && !azione) {
            return ' style="grid-column: span ' + (m.span || 1) + ';' +
                (m.altezza ? 'min-height:' + m.altezza + 'px;' : '') + P.vars + '"' + P.attr;
        }
        return ' style="grid-column: span ' + (m.span || 1) + ';background:' + st.bg + ';' +
            (azione ? '--mn-seg:' + st.testo + ';--mn-fondo:' + st.bg + ';' : 'color:' + st.testo + ';') +
            (st.bordoPx ? 'border:' + st.bordoPx + 'px solid ' + st.bordoCol + ';' : 'border:none;') +
            (m.altezza ? 'min-height:' + m.altezza + 'px;' : '') + P.vars + '"' + P.attr;
    }

    /* ── Il DISEGNO di uno strumento ──────────────────────────────────────────
       Nel banco gli strumenti erano righe di testo («Multi-pass#multipass-on»): non
       si vedeva l'ingombro né il peso visivo, e comporre alla cieca è ciò che
       l'officina serve a evitare (5/8, rilievo di Giacomo).
       Qui si disegna la SAGOMA di ognuno alla taglia vera, con i colori del modulo:
       non l'elemento reale — che nel banco non esiste — ma la sua forma.
       Il tratteggio dice «questo è un segnaposto»: guardando la composizione si deve
       sapere che si sta guardando un mockup, non l'app. */
    function disegnaStrumentoStile() {
        if (document.getElementById('bn-forme-css')) return;
        var st = document.createElement('style');
        st.id = 'bn-forme-css';
        st.textContent = [
            '.mn-str .fo{display:flex;align-items:center;gap:8px;min-width:0;font-size:12px;font-weight:600;color:inherit}',
            '.mn-str .fo__n{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:1;min-width:0}',
            /* il nome che viene dal PEZZO e non dal posto: attenuato e in corsivo,
               così si legge che quella riga a schermo avrà un nome, ma non questo */
            '.mn-str .fo__n--suo{opacity:.5;font-style:italic;font-weight:400}',
            /* Interruttore: chip + pallino, con le MISURE VERE del prodotto (5/8) —
               46×26 col pomello da 18 a destra e in emerald, che è lo stato acceso
               (il default di entrambi i comandi a un solo stato). Prima il banco ne
               disegnava uno da 26×15 col pomello bianco a sinistra: un'idea di
               interruttore, non QUESTO interruttore. */
            '.mn-str .fo-sw{width:46px;height:26px;border-radius:13px;background:color-mix(in srgb,currentColor 18%,transparent);position:relative;flex:0 0 auto}',
            '.mn-str .fo-sw::after{content:"";position:absolute;top:4px;left:24px;width:18px;height:18px;border-radius:50%;background:#41e6aa}',
            /* segmento: due scelte affiancate, la prima attiva */
            '.mn-str .fo-seg{display:flex;border-radius:7px;overflow:hidden;flex:0 0 auto}',
            '.mn-str .fo-seg i{display:block;width:22px;height:15px;background:color-mix(in srgb,currentColor 18%,transparent)}',
            '.mn-str .fo-seg i:first-child{background:currentColor;opacity:.85}',
            /* bottone e campo: due sagome diverse — piena contro incavata */
            '.mn-str .fo-btn{padding:4px 10px;border-radius:9px;background:color-mix(in srgb,currentColor 16%,transparent)}',
            '.mn-str .fo-fld{flex:1;min-width:60px;height:24px;border-radius:8px;background:color-mix(in srgb,currentColor 12%,transparent);border:1px dashed color-mix(in srgb,currentColor 35%,transparent)}',
            '.mn-str .fo-area{flex:1;min-width:80px;height:46px;border-radius:8px;background:color-mix(in srgb,currentColor 10%,transparent);border:1px dashed color-mix(in srgb,currentColor 35%,transparent)}',
            '.mn-str .fo-pan{flex:1;min-width:80px;height:34px;border-radius:8px;background:color-mix(in srgb,currentColor 10%,transparent);border:1px dashed color-mix(in srgb,currentColor 35%,transparent);display:flex;align-items:center;justify-content:center}',
            '.mn-str .fo-pan::after{content:"▤";opacity:.5}',
            '.mn-str .fo-est{font-variant-numeric:tabular-nums;opacity:.75}'
        ].join('\n');
        document.head.appendChild(st);
    }

    function disegnoStrumento(v) {
        disegnaStrumentoStile();
        var f = B.formaDi ? B.formaDi(v) : 'bottone';
        /* ⚠️ Il titolo del posto segue la STESSA regola dell'app (`titoloPosto`):
           a «mai» non si scrive, e resta la sola sagoma. Senza, il banco mostrava
           un titolo che a schermo non c'è — la divergenza che l'officina esiste
           per evitare (è il caso dei due box delle fonti, 5/8). */
        var quale = B.titoloPosto ? B.titoloPosto(v) : 'auto';
        /* ⚠️ Con «mai» il posto non scrive il titolo, ma l'app NON resta muta: il
           nome lo porta il pezzo montato («MindMap», «KG (A/B)», «Area
           Disciplinare»). Disegnare una sagoma anonima direbbe una cosa falsa e
           lascerebbe chi compone davanti a quattro righe uguali. Si mostra il nome
           ATTENUATO, con la nota che è del pezzo e non del posto. */
        var nome = quale === 'mai'
            ? '<span class="fo__n fo__n--suo" title="il titolo non lo scrive il posto: lo porta il pezzo montato">' + esc(v.et) + '</span>'
            : '<span class="fo__n">' + esc(v.et) + '</span>';
        var sagoma = {
            interruttore: '<span class="fo-sw"></span>',
            segmento: '<span class="fo-seg"><i></i><i></i></span>',
            bottone: '',
            campo: '<span class="fo-fld"></span>',
            area: '<span class="fo-area"></span>',
            pannello: '<span class="fo-pan"></span>',
            esito: '<span class="fo-est">~5</span>'
        }[f] || '';
        /* un BOTTONE è tutto il pezzo, non un'etichetta con qualcosa accanto */
        if (f === 'bottone') return '<div class="fo"><span class="fo-btn fo__n' +
            (quale === 'mai' ? ' fo__n--suo' : '') + '">' + esc(v.et) + '</span></div>';
        if (f === 'area' || f === 'pannello') return '<div class="fo" style="flex-direction:column;align-items:stretch;gap:5px">' + nome + sagoma + '</div>';
        return '<div class="fo">' + nome + sagoma + '</div>';
    }

    /* ── anteprima: le classi VERE dell'app ─────────────────────────────── */
    function anteprima() {
        var html = stato.map(function (m) {
            /* stessa regola dell'app: un modulo di sole azioni È il bottone */
            if (B.soloAzioni(m)) {
                return B.vociDi(m).map(function (v) {
                    return '<button type="button" class="mn-card ' +
                        (v.base.primaria ? 'mn-card--genera' : 'mn-card--azione') + '"' + stileAnt(m) + '>' +
                        '<span>' + esc(v.et) + '</span></button>';
                }).join('');
            }
            var corpo = B.vociDi(m).map(function (v) {
                if (v.base.tipo === 'spunta') return '<label class="mn-op"><input type="checkbox"><span>' + esc(v.et) + '</span></label>';
                var w = v.w ? ' style="width:' + v.w + 'px;max-width:100%"' : '';
                if (v.base.tipo === 'numero') return '<label class="mn-campo"><span>' + esc(v.et) + '</span><input class="mn-num" type="number" value="3"' + w + '></label>';
                if (v.base.tipo === 'tendina') return '<label class="mn-campo"><span>' + esc(v.et) + '</span><select class="mn-sel"' + w + '><option>—</option></select></label>';
                if (v.base.tipo === 'radio') return '<div class="mn-radio"><label><input type="radio" name="ap"><span>Solo la mappa</span></label>' +
                    '<label><input type="radio" name="ap"><span>Solo i materiali</span></label>' +
                    '<label><input type="radio" name="ap" checked><span>Entrambi</span></label></div>';
                if (v.base.tipo === 'esito') return '<div class="mn-est">Stima chiamate AI: ~5 (A 3 · B 0 · C 0 · D 2)</div>';
                /* uno STRUMENTO nell'app accoglie l'elemento VERO, spostato dal suo
                   posto nel form. Qui quell'elemento non esiste, quindi si mostra il
                   posto che occuperà col nome della funzione: il banco serve a
                   decidere DOVE va, non a simulare il controllo. */
                if (v.base.tipo === 'strumento') return '<div class="mn-str">' + disegnoStrumento(v) + '</div>';
                if (v.base.tipo === 'azione') return '<button type="button" class="mn-azione-int"><span>' + esc(v.et) + '</span></button>';
                if (v.base.tipo === 'preset') return '<select class="mn-sel"' + w + '><option>— nessun preset —</option></select>' +
                    '<div class="mn-preset-az"><button type="button" class="mn-btn">Applica</button>' +
                    '<button type="button" class="mn-btn">Salva</button>' +
                    '<button type="button" class="mn-btn">Elimina</button></div>';
                return '';
            }).join('');
            var testata = m.master
                ? '<label class="mn-card__t mn-card__t--on"><input type="checkbox" checked>' +
                  (m.icona ? '<i data-lucide="' + esc(m.icona) + '"></i>' : '') + '<span>' + esc(m.titolo) + '</span></label>'
                : '<div class="mn-card__t">' + (m.icona ? '<i data-lucide="' + esc(m.icona) + '"></i>' : '') +
                  '<span>' + esc(m.titolo) + '</span></div>';
            /* le stesse classi che mette l'app: senza, l'anteprima non riceveva le
               regole dei moduli-strumento (griglia delle voci, corpo che scorre) e
               mostrava una disposizione che a schermo non esiste */
            var str = B.vociDi(m).some(function (v) { return v.base && v.base.tipo === 'strumento'; });
            var cre = B.vociDi(m).some(function (v) { return v.base && v.base.cresce; });
            return '<div class="mn-card' + (str ? ' mn-card--str' : '') + (cre ? ' mn-card--cresce' : '') +
                (m.nuda ? ' mn-card--nuda' : '') + '"' + stileAnt(m) + '>' +
                testata + '<div class="mn-card__b">' + corpo + '</div></div>';
        }).join('');
        return '<div id="mn-bento">' + html + '</div>';
    }

    /* ── disegno ────────────────────────────────────────────────────────── */
    function disegna() {
        var inv = document.getElementById('bn-inventario');
        var gri = document.getElementById('bn-griglia');
        var dia = document.getElementById('bn-diagnosi');
        var pre = document.getElementById('bn-preview');
        if (!inv) return;

        /* L'inventario è RAGGRUPPATO: con l'arrivo dei diciannove strumenti un
           elenco piatto diventa un muro in cui non si trova niente. I gruppi sono
           quelli dichiarati in `VOCI` (`gruppo`); le voci della pipeline, che non
           ne hanno uno, stanno sotto «Opzioni dei materiali». */
        var fuori = nonAssegnate();
        if (!fuori.length) {
            inv.innerHTML = '<span class="bn-vuoto">tutte le voci sono montate</span>';
        } else {
            var per = {};
            fuori.forEach(function (v) {
                var g = v.gruppo || 'Opzioni dei materiali';
                (per[g] = per[g] || []).push(v);
            });
            /* ordine: prima le opzioni (è il cuore del bento), poi gli strumenti
               nell'ordine in cui li incontra chi lavora — fonti, contenuto, motore */
            var ordine = ['Opzioni dei materiali', 'Fonti', 'Contenuto', 'Motore', 'Apri'];
            var chiavi = Object.keys(per).sort(function (a, b) {
                var ia = ordine.indexOf(a), ib = ordine.indexOf(b);
                return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
            });
            inv.innerHTML = chiavi.map(function (g) {
                return '<div style="margin-bottom:8px">' +
                    '<div style="font-size:10px;letter-spacing:.08em;text-transform:uppercase;' +
                    'color:#64748b;font-weight:800;margin-bottom:4px">' + esc(g) +
                    ' <span style="opacity:.6">(' + per[g].length + ')</span></div>' +
                    per[g].map(function (v) { return chipVoce(v, false); }).join('') + '</div>';
            }).join('');
        }

        gri.innerHTML = stato.map(modulo).join('');
        pre.innerHTML = anteprima();
        if (window.lucide) { try { lucide.createIcons(); } catch (e) { } }
        dia.innerHTML = diagnosi() + '<h4 class="bn-h4">Corpi misurati sull\'anteprima</h4>' + corpi();
        disegnaRighe();
        aggancia();
        mostraAltezzeReali();
        avvisoRipartenza();
    }

    /* L'avviso che dice PERCHÉ la composizione a schermo non è quella che avevi
       lasciato, col bottone per riprendere il lavoro messo da parte. Senza, ripartire
       dal file sarebbe una sparizione inspiegabile — e il banco esiste per non far
       succedere cose inspiegabili. */
    function avvisoRipartenza() {
        var host = document.getElementById('bn-righe');
        if (!host) return;
        var vecchio = document.getElementById('bn-ripartito');
        if (vecchio) vecchio.remove();
        var prec = null;
        try { prec = localStorage.getItem(LS_PREC); } catch (e) { }
        if (!ripartito && !prec) return;
        var box = document.createElement('div');
        box.id = 'bn-ripartito';
        box.style.cssText = 'margin:0 0 10px;padding:9px 12px;border-radius:10px;' +
            'background:#fef3c7;color:#78350f;font-size:12px;font-weight:700;' +
            'display:flex;align-items:center;gap:10px;flex-wrap:wrap';
        box.innerHTML = '<span>' + esc(ripartito || 'C\'è un lavoro precedente messo da parte.') + '</span>' +
            (prec ? '<button type="button" id="bn-recupera" class="bn-b">Riprendi il lavoro precedente</button>' : '') +
            '<button type="button" id="bn-scarta" class="bn-b">Va bene, scartalo</button>';
        host.parentNode.insertBefore(box, host);
        var rec = document.getElementById('bn-recupera');
        if (rec) rec.addEventListener('click', function () {
            try {
                var j = JSON.parse(localStorage.getItem(LS_PREC) || '[]');
                if (Array.isArray(j) && j.length) {
                    stato = j; ripartito = null;
                    localStorage.removeItem(LS_PREC);
                    salva(); disegna();
                }
            } catch (e) { }
        });
        var sc = document.getElementById('bn-scarta');
        if (sc) sc.addEventListener('click', function () {
            try { localStorage.removeItem(LS_PREC); } catch (e) { }
            ripartito = null;
            var b = document.getElementById('bn-ripartito'); if (b) b.remove();
        });
    }

    /* L'altezza VERA di ogni modulo, letta dall'anteprima e scritta accanto al campo
       «h min». Serve a rendere visibile la cosa che il campo da solo non dice: se il
       contenuto è più alto del minimo, il minimo non ha effetto. Il numero diventa
       rosso in quel caso — così non si passa un quarto d'ora a cambiare un valore
       che non può cambiare niente. */
    function mostraAltezzeReali() {
        var pre = document.getElementById('bn-preview');
        if (!pre) return;
        var card = pre.querySelectorAll('.mn-card');
        stato.forEach(function (m, i) {
            var seg = document.querySelector('[data-hreale="' + m.id + '"]');
            if (!seg || !card[i]) return;
            var vera = Math.round(card[i].getBoundingClientRect().height);
            var inefficace = m.altezza && vera > parseInt(m.altezza, 10) + 1;
            seg.textContent = '(reale ' + vera + ')';
            seg.style.color = inefficace ? '#dc2626' : '';
            seg.style.fontWeight = inefficace ? '800' : '';
            seg.title = inefficace
                ? 'il contenuto è alto ' + vera + 'px: il minimo di ' + m.altezza + 'px non ha effetto. Per alzarlo davvero serve un valore sopra ' + vera + '.'
                : 'altezza reale del riquadro nell\'anteprima';
        });
    }

    /* ── le due righe sopra il bento (5/8) ───────────────────────────────────
       Sono un dato (`MappAIBento.RIGHE`) e usano la stessa griglia a 4 colonne
       del bento. Qui si vedono con i loro span e col verdetto: gli span devono
       chiudere le quattro colonne, altrimenti resta del bianco a destra — che è
       il difetto da cui il dato è nato.
       Si mostrano, non si trascinano: sono DUE righe con due posti ciascuna, e un
       trascinamento per scegliere fra «2+2» e «1+3» sarebbe più cerimonia che
       decisione. I numeri si cambiano nel file, dove c'è scritto perché. */
    function disegnaRighe() {
        var host = document.getElementById('bn-righe');
        if (!host || !B.RIGHE) return;
        var errori = B.validaRighe ? B.validaRighe(B.RIGHE) : [];
        host.innerHTML = B.RIGHE.map(function (r) {
            var s = r.span[0], d = r.span[1];
            var somma = s + d;
            var ok = somma === B.COLONNE;
            var barra = function (n, tinta) {
                return '<span style="display:inline-flex;gap:2px;vertical-align:middle;margin:0 4px">' +
                    Array.apply(null, Array(n)).map(function () {
                        return '<i style="width:14px;height:10px;border-radius:2px;background:' + tinta + '"></i>';
                    }).join('') + '</span>';
            };
            return '<div class="bn-chip" style="display:block;text-align:left;cursor:default">' +
                '<b>' + r.id.replace('mn-riga-', '') + '</b> — ' + r.nota + '<br>' +
                'sinistra ' + s + barra(s, '#404040') +
                ' · destra ' + d + barra(d, '#41e6aa') +
                ' · senza contenuto a destra: ' + (r.vuotoASinistra || s) + ' colonne' +
                ' <b style="color:' + (ok ? '#047857' : '#dc2626') + '">' +
                (ok ? '✓ chiude le ' + B.COLONNE + ' colonne' : '✗ ' + somma + ' su ' + B.COLONNE) + '</b>' +
                '</div>';
        }).join('') + (errori.length
            ? '<div class="bn-chip" style="display:block;background:#fee2e2;color:#991b1b;cursor:default">' +
              errori.map(esc).join('<br>') + '</div>'
            : '');
    }

    /* ── interazione ────────────────────────────────────────────────────── */
    function vociGrezze(m) { return (m && m.voci) || []; }
    function idDi(v) { return typeof v === 'string' ? v : (v && v.id); }

    /* togliere una voce restituisce la sua FORMA (stringa o oggetto con
       etichetta e larghezza): spostandola in un altro modulo non si perde
       quello che ci è stato scritto sopra */
    function togli(id) {
        var forma = id;
        stato.forEach(function (m) {
            m.voci = vociGrezze(m).filter(function (v) {
                if (idDi(v) !== id) return true;
                forma = v; return false;
            });
        });
        return forma;
    }
    function metti(id, modId, prima) {
        var forma = togli(id);
        for (var i = 0; i < stato.length; i++) {
            if (stato[i].id !== modId) continue;
            stato[i].voci = stato[i].voci || [];
            var at = prima != null ? prima : stato[i].voci.length;
            stato[i].voci.splice(at, 0, forma);
            return;
        }
    }
    /* scrive una proprietà sulla voce, promuovendola a oggetto se serve */
    function scriviVoce(id, campo, valore) {
        stato.forEach(function (m) {
            m.voci = vociGrezze(m).map(function (v) {
                if (idDi(v) !== id) return v;
                var o = typeof v === 'string' ? { id: v } : Object.assign({}, v);
                if (valore === '' || valore == null) delete o[campo]; else o[campo] = valore;
                return (Object.keys(o).length === 1) ? o.id : o;   // torna stringa se non resta nulla
            });
        });
    }
    function scriviStile(modId, campo, valore) {
        stato.forEach(function (m) {
            if (m.id !== modId) return;
            m.stile = m.stile || {};
            m.stile[campo] = valore;
        });
    }
    /* ⚠️ Un valore uguale al default si TOGLIE dal dato, non si scrive: il JSON
       che finisce nel repo deve dire solo quello che è stato deciso. Un
       `colMin: 220` scritto ovunque sembrerebbe una scelta, e al prossimo cambio
       del default resterebbe indietro in silenzio. */
    function scriviRamo(modId, ramo, campo, valore, base) {
        stato.forEach(function (m) {
            if (m.id !== modId) return;
            var o = m[ramo] || {};
            if (valore === '' || valore == null || (base != null && valore === base)) delete o[campo];
            else o[campo] = valore;
            if (Object.keys(o).length) m[ramo] = o; else delete m[ramo];
        });
    }
    function sposta(modId, delta) {
        var i = stato.findIndex(function (m) { return m.id === modId; });
        var j = i + delta;
        if (i < 0 || j < 0 || j >= stato.length) return;
        var m = stato.splice(i, 1)[0];
        stato.splice(j, 0, m);
    }

    function aggancia() {
        document.querySelectorAll('.bn-voce[draggable]').forEach(function (el) {
            el.addEventListener('dragstart', function (e) {
                trascinata = el.dataset.voce;
                el.classList.add('bn-drag');
                try { e.dataTransfer.setData('text/plain', trascinata); } catch (x) { }
                e.dataTransfer.effectAllowed = 'move';
            });
            el.addEventListener('dragend', function () { el.classList.remove('bn-drag'); trascinata = null; });
        });
        document.querySelectorAll('.bn-drop, #bn-inventario').forEach(function (z) {
            z.addEventListener('dragover', function (e) { e.preventDefault(); z.classList.add('bn-over'); });
            z.addEventListener('dragleave', function () { z.classList.remove('bn-over'); });
            z.addEventListener('drop', function (e) {
                e.preventDefault(); z.classList.remove('bn-over');
                var id = trascinata || (e.dataTransfer && e.dataTransfer.getData('text/plain'));
                if (!id) return;
                if (z.id === 'bn-inventario') togli(id);
                else metti(id, z.dataset.mod);
                salva(); disegna();
            });
        });
        /* la via da tastiera: stessa azione, senza mouse */
        document.querySelectorAll('.bn-sposta').forEach(function (s) {
            s.addEventListener('change', function () {
                var id = s.dataset.voce;
                if (!s.value) return;
                if (s.value === '__fuori') togli(id); else metti(id, s.value);
                salva(); disegna();
            });
        });
        /* etichette, larghezze, aspetto, altezza, icona */
        document.querySelectorAll('.bn-et').forEach(function (i) {
            i.addEventListener('change', function () { scriviVoce(i.dataset.voce, 'et', i.value.trim()); salva(); disegna(); });
        });
        document.querySelectorAll('.bn-w').forEach(function (i) {
            i.addEventListener('change', function () {
                scriviVoce(i.dataset.voce, 'w', i.value ? parseInt(i.value, 10) : ''); salva(); disegna();
            });
        });
        /* il pop-up e l'etichetta: due leve per VOCE, come l'etichetta e la
           larghezza. Un aiuto uguale a quello dell'inventario non si riscrive nel
           dato — sarebbe una copia che invecchia. */
        document.querySelectorAll('.bn-aiuto').forEach(function (i) {
            i.addEventListener('change', function () {
                var base = B.voce(i.dataset.voce) || {};
                var val = i.value.trim();
                scriviVoce(i.dataset.voce, 'aiuto', val === (base.aiuto || '') ? '' : val);
                salva(); disegna();
            });
        });
        document.querySelectorAll('.bn-titpos').forEach(function (s) {
            s.addEventListener('change', function () {
                /* si scrive UN campo e si ripuliscono i due vecchi flag: due
                   sorgenti per lo stesso stato tornerebbero a contraddirsi */
                scriviVoce(s.dataset.voce, 'mostraEt', '');
                scriviVoce(s.dataset.voce, 'nascondiEt', '');
                /* ⚠️ Si scrive nel dato solo se il valore scelto DIVERGE da quello
                   che l'inventario dichiara — e «auto» va scritto quando la base
                   dice altro, o cancellandolo si tornerebbe alla base e la scelta
                   non avrebbe effetto (mn-input-box nasce a «mai»). */
                var base = B.titoloPosto({ id: s.dataset.voce, base: B.voce(s.dataset.voce) });
                scriviVoce(s.dataset.voce, 'titoloPosto', s.value === base ? '' : s.value);
                salva(); disegna();
            });
        });
        document.querySelectorAll('.bn-ico').forEach(function (s2) {
            s2.addEventListener('change', function () {
                stato.forEach(function (m) { if (m.id === s2.dataset.mod) m.icona = s2.value; });
                salva(); disegna();
            });
        });
        document.querySelectorAll('.bn-h').forEach(function (i) {
            i.addEventListener('change', function () {
                stato.forEach(function (m) {
                    if (m.id !== i.dataset.mod) return;
                    if (i.value) m.altezza = parseInt(i.value, 10); else delete m.altezza;
                });
                salva(); disegna();
            });
        });
        [['data-bg', 'bg'], ['data-txt', 'testo'], ['data-bc', 'bordoCol']].forEach(function (par) {
            document.querySelectorAll('[' + par[0] + ']').forEach(function (i) {
                i.addEventListener('change', function () {
                    scriviStile(i.getAttribute(par[0]), par[1], i.value); salva(); disegna();
                });
            });
        });
        document.querySelectorAll('.bn-bp').forEach(function (i) {
            i.addEventListener('change', function () {
                scriviStile(i.dataset.bp, 'bordoPx', parseInt(i.value, 10) || 0); salva(); disegna();
            });
        });
        /* ── i controlli granulari (5/8) ─────────────────────────────────────
           Layout in `m.layout`, colori dei bottoni in `m.bottoni`: due rami
           separati perché rispondono a due domande diverse, e perché solo il
           primo entra nella FIRMA (la disposizione è struttura, una tinta no). */
        document.querySelectorAll('.bn-voci-n').forEach(function (s) {
            s.addEventListener('change', function () {
                var v = /^\d+$/.test(s.value) ? parseInt(s.value, 10) : s.value;
                scriviRamo(s.dataset.mod, 'layout', 'colonneVoci', v, B.LAYOUT_BASE.colonneVoci);
                salva(); disegna();
            });
        });
        document.querySelectorAll('.bn-colmin').forEach(function (i) {
            i.addEventListener('change', function () {
                scriviRamo(i.dataset.mod, 'layout', 'colMin', parseInt(i.value, 10) || '', B.LAYOUT_BASE.colMin);
                salva(); disegna();
            });
        });
        document.querySelectorAll('.bn-et-pos').forEach(function (s) {
            s.addEventListener('change', function () {
                scriviRamo(s.dataset.mod, 'layout', 'etichette', s.value, B.LAYOUT_BASE.etichette);
                salva(); disegna();
            });
        });
        document.querySelectorAll('.bn-et-w').forEach(function (i) {
            i.addEventListener('change', function () {
                scriviRamo(i.dataset.mod, 'layout', 'etLarghezza', parseInt(i.value, 10) || '', 0);
                salva(); disegna();
            });
        });
        /* l'interruttore dei colori propri: acceso, scrive nel dato i valori
           DERIVATI (così i quattro selettori partono da quello che si vede e non
           da un nero qualunque); spento, toglie il ramo e si torna al derivato */
        document.querySelectorAll('.bn-btn-on').forEach(function (c) {
            c.addEventListener('change', function () {
                var id = c.dataset.mod;
                stato.forEach(function (m) {
                    if (m.id !== id) return;
                    if (!c.checked) { delete m.bottoni; return; }
                    var d = B.bottoniDi(m);
                    m.bottoni = { bg: d.bg, testo: d.testo, hoverBg: d.hoverBg, hoverTesto: d.hoverTesto };
                });
                salva(); disegna();
            });
        });
        [['data-btnbg', 'bg'], ['data-btntxt', 'testo'],
         ['data-btnhbg', 'hoverBg'], ['data-btnhtxt', 'hoverTesto']].forEach(function (par) {
            document.querySelectorAll('[' + par[0] + ']').forEach(function (i) {
                i.addEventListener('change', function () {
                    scriviRamo(i.getAttribute(par[0]), 'bottoni', par[1], i.value);
                    salva(); disegna();
                });
            });
        });
        /* riordino: frecce (tastiera) e maniglia (mouse) */
        document.querySelectorAll('.bn-su').forEach(function (b) {
            b.addEventListener('click', function () { sposta(b.dataset.su, -1); salva(); disegna(); });
        });
        document.querySelectorAll('.bn-giu').forEach(function (b) {
            b.addEventListener('click', function () { sposta(b.dataset.giu, 1); salva(); disegna(); });
        });
        document.querySelectorAll('.bn-grip').forEach(function (g) {
            g.addEventListener('dragstart', function (e) {
                modTrascinato = g.dataset.modtrascina;
                e.dataTransfer.effectAllowed = 'move';
                try { e.dataTransfer.setData('text/plain', 'mod:' + modTrascinato); } catch (x) { }
            });
            g.addEventListener('dragend', function () { modTrascinato = null; });
        });
        document.querySelectorAll('.bn-mod').forEach(function (mo) {
            mo.addEventListener('dragover', function (e) {
                if (!modTrascinato) return;                 // le VOCI hanno la loro zona
                e.preventDefault(); mo.classList.add('bn-over');
            });
            mo.addEventListener('dragleave', function () { mo.classList.remove('bn-over'); });
            mo.addEventListener('drop', function (e) {
                if (!modTrascinato) return;
                e.preventDefault(); e.stopPropagation(); mo.classList.remove('bn-over');
                var da = stato.findIndex(function (m) { return m.id === modTrascinato; });
                var a = stato.findIndex(function (m) { return m.id === mo.dataset.mod; });
                if (da < 0 || a < 0 || da === a) return;
                var m = stato.splice(da, 1)[0];
                stato.splice(a, 0, m);
                modTrascinato = null;
                salva(); disegna();
            });
        });
        document.querySelectorAll('.bn-col').forEach(function (s) {
            s.addEventListener('change', function () {
                stato.forEach(function (m) { if (m.id === s.dataset.mod) m.span = parseInt(s.value, 10) || 1; });
                salva(); disegna();
            });
        });
        document.querySelectorAll('.bn-tit').forEach(function (i) {
            i.addEventListener('change', function () {
                stato.forEach(function (m) { if (m.id === i.dataset.mod) m.titolo = i.value; });
                salva(); disegna();
            });
        });
        document.querySelectorAll('.bn-x').forEach(function (b) {
            b.addEventListener('click', function () {
                var m = stato.filter(function (x) { return x.id === b.dataset.del; })[0];
                if (m && B.vociDi(m).length &&
                    !confirm('Il modulo «' + m.titolo + '» contiene ' + m.voci.length +
                        ' voci: torneranno nell\'inventario (e finché restano lì, quelle opzioni non compaiono). Procedo?')) return;
                stato = stato.filter(function (x) { return x.id !== b.dataset.del; });
                salva(); disegna();
            });
        });
    }

    function salva() {
        try {
            localStorage.setItem(LS, JSON.stringify(stato));
            /* si salva la firma del FILE, non dello stato: dice «questo lavoro è
               partito da quella versione del codice» — che è la domanda a cui deve
               rispondere al caricamento successivo */
            if (B.firma) localStorage.setItem(LS_FIRMA, B.firma(B.MODULI));
        } catch (e) { }
    }

    /* ── comandi ────────────────────────────────────────────────────────── */
    function comandi() {
        var n = document.getElementById('bn-nuovo');
        if (n) n.addEventListener('click', function () {
            var id = 'm' + Date.now().toString(36).slice(-4);
            stato.push({ id: id, titolo: 'Nuovo modulo', icona: 'square', span: 1, voci: [] });
            salva(); disegna();
        });
        var r = document.getElementById('bn-reset');
        if (r) r.addEventListener('click', function () {
            if (!confirm('Torno alla composizione di partenza (quella scritta in bento-composizione.js)?')) return;
            stato = copia(B.MODULI); salva(); disegna();
        });
        var j = document.getElementById('bn-json');
        if (j) j.addEventListener('click', function () {
            var t = document.getElementById('bn-out');
            t.value = JSON.stringify(stato, null, 1);
            t.style.display = '';
            t.select();
        });
    }

    function avvio() {
        stato = carica();
        disegna();
        comandi();
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', avvio);
    else avvio();
}());
