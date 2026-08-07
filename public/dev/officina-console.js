/* ═══════════════════════════════════════════════════════════════════════════
   OFFICINA DELLE CONSOLE — si compone il BENTO dell'area, poi si monta (5/8/26)

   Richiesta di Giacomo: «in tutte le console areas usa il più possibile dei box
   allineati con il bento di CREA; costruisci un'officina apposta prima di
   montarle» — e poi: «più granularità: la stessa della vecchia officina, più la
   griglia della colonna, la posizione del bento nell'area, corpo e colore del
   percorso».

   Tre livelli, e sono livelli diversi apposta:
     1. la GRIGLIA (barra · colonna · area) — variabili CSS scritte sul riquadro;
     2. il RIQUADRO (fondo, testo, bordo, disposizione delle voci, bottoni) — le
        stesse leve del bento di CREA, prese dalla sua funzione `presentazione`;
     3. la VOCE (etichetta, forma, pop-up).

   ⚠️ La cornice non è ridisegnata qui: è `MappAIModal.render()`, il motore
   dell'app, e il bento entra DIRETTAMENTE nell'area della console (niente tela
   grigia attorno: la tela è lo slot-canvas dove l'app cala un widget vivo, non il
   contenitore del bento dell'area). Un banco che disegna una console sua
   mostra una superficie che a schermo non esiste — è già successo il 5/8 con
   l'anteprima del bento di CREA (la classe che mancava su <html>).
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
    'use strict';

    var CB = window.MappAIConsoleBento;
    var B = window.MappAIBento;                 /* il bento di CREA: scala, presentazione, contrasti */
    var LS = 'mappai_console_bento';
    var LS_TOKEN = 'mappai_console_token';      /* i token GLOBALI: valgono per tutte le console */
    var LS_VER = 'mappai_console_bento_ver';    /* bump quando il FILE cambia le composizioni di default */
    var VER = '6';                              /* 6 = spec topbar completata (barra: scalaAltri 60% + hairline #ebebeb, altezza 76) + maniglia sincronizzata all'app (bianca, raggio 8, glifo panel-right ruotato) (7/8) */
    var stato = null, areaId = null, token = null;
    /* ⚠️ La finestra dell'anteprima ha DUE misure, non una. Con l'altezza fissa a
       720px (e il banco che ne mostrava anche meno) l'area restava una striscia:
       il bento non si poteva impaginare, che è l'unica cosa per cui il banco
       esiste. La `scala` serve a far stare 1440×900 dentro il pannello senza
       cambiare le misure vere — si rimpicciolisce l'immagine, non il layout. */
    var vista = { larghezza: 1440, altezza: 900, scala: 1, navChiusa: false };

    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }
    function clona(o) { return JSON.parse(JSON.stringify(o)); }
    function $(s, r) { return (r || document).querySelector(s); }
    function $$(s, r) { return [].slice.call((r || document).querySelectorAll(s)); }

    /* ── stato ───────────────────────────────────────────────────────────── */
    function salvate() { try { return JSON.parse(localStorage.getItem(LS) || '{}'); } catch (e) { return {}; } }
    function carica(id) {
        areaId = id;
        _selAChi = null;   /* la scelta demo di «A chi» non passa da una console all'altra */
        var mie = salvate()[id], base = CB.area(id);
        /* ⚠️ Composizione salvata + firma diversa = il codice è cambiato sotto:
           si riparte dal file e lo si dice. Un banco che mostra una struttura che
           il codice non ha più fa perdere tempo due volte. */
        if (mie && mie.__firma === CB.firma(base)) { stato = clona(mie); return; }
        stato = clona(base);
    }
    function salva() {
        var tutte = salvate(), c = clona(stato);
        c.__firma = CB.firma(CB.area(areaId));
        tutte[areaId] = c;
        try { localStorage.setItem(LS, JSON.stringify(tutte)); } catch (e) { }
        try { localStorage.setItem(LS_TOKEN, JSON.stringify(token)); } catch (e) { }
    }
    function caricaToken() {
        var t = null;
        try { t = JSON.parse(localStorage.getItem(LS_TOKEN) || 'null'); } catch (e) { }
        token = t || {};
    }

    /* ── i PEZZI del bento dell'area ─────────────────────────────────────── */
    function largVoce(v) {
        return v.w ? 'style="width:' + parseInt(v.w, 10) + 'px;max-width:none"' : '';
    }

    /* ── la forma «materiali»: il gruppo di tabelle collassabili per genere ────
       Il «nuovo tipo di box» dell'INSEGNA a bento. Nel banco i dati sono un
       mock; la struttura HTML è QUELLA del motore (`.mm-tabg` + `.mm-tab-wrap` +
       `.mm-tab`) → eredita la veste delle tabelle dell'app senza ridisegnarla.
       Le colonne e i generi sono quelli di `_consTabelleMateriali` in
       mappai-landing-teach.js. «File di lavoro» chiuso di default, come nell'app. */
    var MAT_GEN = [
        { t: 'Sintesi', n: 7 },
        { t: 'Fogli dei nodi', n: 3 },
        { t: 'Quiz a scelta multipla', n: 4 },
        { t: 'Quiz vero / falso', n: 2 },
        { t: 'Flashcard', n: 6 },
        { t: 'Altri materiali', n: 1 },
        { t: 'File di lavoro', n: 5, chiusa: true }
    ];
    function tabellaMat(g) {
        var cols = ['Nome', 'Classe', 'Materia', 'Data', ''];
        var colgroup = '<colgroup><col><col style="width:88px"><col style="width:112px"><col style="width:100px"><col style="width:50px"></colgroup>';
        var thead = '<thead><tr>' + cols.map(function (c) { return '<th>' + esc(c) + '</th>'; }).join('') + '</tr></thead>';
        var righe = '';
        for (var i = 0; i < g.n; i++) {
            righe += '<tr class="mm-tab__riga">' +
                '<td>' + esc(g.t + ' — ' + (i + 1)) + '</td>' +
                '<td>1ªA</td><td>Scienze</td><td>04/08/2026</td>' +
                '<td><span class="mm-cella-az"><button type="button" class="mm-btn mm-btn--quieto mm-btn--icona" ' +
                'aria-label="Elimina" title="Elimina"><i data-lucide="trash-2"></i></button></span></td></tr>';
        }
        return '<div class="mm-tabg' + (g.chiusa ? ' is-chiusa' : '') + '">' +
            '<button type="button" class="mm-tabg__t mm-sez__t--tog" aria-expanded="' + (g.chiusa ? 'false' : 'true') + '">' +
            '<i data-lucide="chevron-down"></i><span>' + esc(g.t) + '</span>' +
            '<span class="mm-tabg__n">' + g.n + '</span></button>' +
            '<div class="mm-sez__c"><div class="mm-tab-wrap"><table class="mm-tab">' +
            colgroup + thead + '<tbody>' + righe + '</tbody></table></div></div></div>';
    }
    function materialiHtml(v) {
        var tip = v.aiuto ? ' data-tip="' + esc(v.aiuto) + '"' : '';
        return '<div class="mn-materiali"' + tip + '>' + MAT_GEN.map(tabellaMat).join('') + '</div>';
    }

    function vocePezzo(v) {
        var tip = v.aiuto ? ' data-tip="' + esc(v.aiuto) + '"' : '';
        switch (v.forma) {
            case 'materiali':
                return materialiHtml(v);
            case 'azione':
                /* con un'icona = comando stile azione di CREA: icona a riposo,
                   etichetta al passaggio. `title`+`aria-label` perché l'etichetta si
                   rivela solo col mouse; `.mn-cmd` porta i parametri di CREA (icona 64,
                   testo 15/700, dissolvenza .18s ease .09s). Senza icona resta il
                   bottone di testo di prima (retrocompatibile). */
                if (v.icona) {
                    return '<button type="button" class="mn-btn mn-cmd"' +
                        ' title="' + esc(v.et) + '" aria-label="' + esc(v.et) + '"' + tip + '>' +
                        '<i data-lucide="' + esc(v.icona) + '"></i><span>' + esc(v.et) + '</span></button>';
                }
                return '<button type="button" class="mn-btn' + (v.primaria ? ' mn-btn--primaria' : '') + '"' + tip + '>' + esc(v.et) + '</button>';
            case 'scelta':
                var facce = (v.et || '').split('·').map(function (x) { return x.trim(); });
                if (facce.length < 2) facce = [v.et || 'A', 'B'];
                return '<div class="mn-seg"' + tip + '>' + facce.map(function (f, i) {
                    return '<button type="button" class="mn-seg__f' + (i === 0 ? ' is-on' : '') + '">' + esc(f) + '</button>';
                }).join('') + '</div>';
            /* la larghezza per-voce vince sul token globale: una tendina può
               dover essere più larga delle altre (le date, i nomi delle mappe),
               ma il DEFAULT resta uno solo per tutte le console */
            case 'campo':
                return '<label class="mn-campo"' + tip + '><span>' + esc(v.et) + '</span>' +
                    '<input type="text" class="mn-sel" ' + largVoce(v) + ' placeholder="' + esc(v.segnaposto || '') + '"></label>';
            case 'tendina':
                return '<label class="mn-campo"' + tip + '><span>' + esc(v.et) + '</span>' +
                    '<select class="mn-sel" ' + largVoce(v) + '><option>' + esc(v.segnaposto || 'tutte') + '</option></select></label>';
            case 'interruttore':
                return '<label class="mn-op"' + tip + '><input type="checkbox" checked><span>' + esc(v.et) + '</span></label>';
            case 'esito':
                return '<div class="mn-est"' + tip + '>' + esc(v.et) + '</div>';
            case 'tabella':
                var col = v.colonne || ['Documento', 'Tipo', 'Data'];
                return '<div class="mm-tab-wrap"' + tip + '><table class="mm-tab"><thead><tr>' +
                    col.map(function (c) { return '<th>' + esc(c) + '</th>'; }).join('') + '</tr></thead><tbody>' +
                    [0, 1, 2].map(function () {
                        return '<tr>' + col.map(function (c, i) {
                            return '<td>' + (i === 0 ? 'Storia della Carta' : '—') + '</td>';
                        }).join('') + '</tr>';
                    }).join('') + '</tbody></table></div>';
            case 'elenco':
                return '<div class="mn-elenco"' + tip + '>' + [1, 2, 3].map(function (i) {
                    return '<div class="mn-elenco__r">' + esc(v.et) + ' ' + i + '</div>';
                }).join('') + '</div>';
            case 'tela':
                return '<div class="mn-tela-doc"' + tip + '><span>' + esc(v.aiuto || v.et) + '</span></div>';
            default:
                return '<div class="oc-ignoto">forma sconosciuta: ' + esc(v.forma) + '</div>';
        }
    }

    /* ⚠️ La presentazione del riquadro è QUELLA DEL BENTO DI CREA
       (`MappAIBento.presentazione`): fondo, testo, bordo, disposizione delle voci
       e colori dei bottoni escono dalla stessa funzione, quindi un riquadro di una
       console e uno di CREA non possono divergere. Se manca (Node, o il file non
       caricato) si ripiega su un riquadro nudo invece di reinventarla qui. */
    /* ⚠️ `presentazione()` emette SOLO i bottoni interni e la disposizione delle
       voci: fondo, testo e bordo del riquadro li scrive un'altra funzione
       (`stileAttr` in costruisci-manifesto), e non emetterli qui era il difetto
       che Giacomo ha visto — i colori scelti nelle card laterali non arrivavano
       mai nell'anteprima. */
    function presenta(m) {
        var vars = '', attr = '';
        if (B && B.presentazione) { try { var p = B.presentazione(m); vars += p.vars || ''; attr += p.attr || ''; } catch (e) { } }
        var s = (B && B.stileDi) ? B.stileDi(m) : null;
        if (s) {
            vars += 'background:' + s.bg + ';color:' + s.testo + ';';
            vars += s.bordoPx ? 'border:' + s.bordoPx + 'px solid ' + s.bordoCol + ';' : 'border:none;';
            /* le due variabili che i figli usano per ricavare i loro fondi: senza,
               un bottone dentro un riquadro chiaro resterebbe con la tinta del
               riquadro scuro (è la regola del 4/8 sui colori composti) */
            vars += '--mn-fondo:' + s.bg + ';--mn-seg:' + s.testo + ';';
        }
        return { vars: vars, attr: attr };
    }

    function moduloHtml(m) {
        var p = presenta(m);
        var st = 'grid-column: span ' + CB.spanDi(m) + ';' + (m.altezza ? 'min-height:' + m.altezza + 'px;' : '') + (p.vars || '');
        var testata = (m.nuda || !m.titolo) ? '' :
            '<div class="mn-card__t">' + (m.icona ? '<i data-lucide="' + esc(m.icona) + '"></i>' : '') +
            '<span>' + esc(m.titolo) + '</span></div>';
        return '<div class="mn-card' + (m.nuda ? ' mn-card--nuda' : '') + '" style="' + st + '" ' +
            (p.attr || '') + ' data-mod="' + esc(m.id) + '">' +
            testata + '<div class="mn-card__b">' + (m.voci || []).map(vocePezzo).join('') + '</div></div>';
    }

    function bentoHtml(a) {
        var al = (CB.aspettoDi(a).area.allinea === 'centro') ? ' data-allinea="centro"' : '';
        /* ⚠️ Niente `id="mn-bento"`: quello è il bento di CREA, e le sue regole
           sono scritte con l'ID — un id batte una classe, quindi il passo scelto
           qui (`--mnc-gap`) veniva ignorato e restava quello di CREA (misurato:
           var a 24px, `gap` reale 14px). L'aspetto arriva dalle CLASSI condivise
           (`.mn-card`, `.mn-btn`…), non dall'id di un'altra superficie. */
        return '<div class="mn-bento-area"' + al + '>' +
            (a.moduli || []).map(moduloHtml).join('') + '</div>';
    }

    /* ── i menu del PERCORSO: ogni livello (tranne l'ultimo) è una tendina ─────
       Il percorso non è più un'etichetta ma una cascata di scelte:
         Cosa (CREA/ELABORA/INSEGNA) › A chi? (Generico · classi · allievi) ›
         Materia (materie della classe/allievo, o del profilo + «Nuova materia» se
         Generico) › [nome mappa].
       Tendina RETTANGOLARE a fondo bianco; gli item resi alla dimensione del
       livello di briciola a cui appartengono. Nel banco i dati sono MOCK e la
       cascata è un demo (`_selAChi` governa le materie); al cablaggio si riusa la
       logica del chip (MappAIClasses, allProfiles, contestoDelleMappe). */
    var _MOCK = {
        classi: ['1ªA', '2ªB', '3ªC'],
        allievi: ['Anna Rossi — 1ªA', 'Luca Bianchi — 2ªB', 'Sara Neri — 1ªA', 'Marco Verdi — 3ªC'],
        materieClasse: { '1ªA': ['Scienze', 'Storia', 'Matematica'], '2ªB': ['Italiano', 'Geografia'], '3ªC': ['Fisica', 'Chimica', 'Biologia'] },
        materieProfilo: ['Scienze', 'Storia', 'Matematica', 'Italiano', 'Geografia', 'Fisica']
    };
    var _selAChi = null;   /* scelta corrente in «A chi» (demo): governa le materie */

    function _ruoloDi(id) {
        return ({ sezione: { et: 'Cosa', role: 'cosa' }, contesto: { et: 'A chi?', role: 'achi' }, materia: { et: 'Materia', role: 'materia' } })[id] || null;
    }
    function _sezAttiva() { return String(((stato.briciole || [])[0] || {}).et || '').toLowerCase(); }
    /* la scelta «A chi» attiva: quella fatta nel banco, o quella della briciola */
    function _contestoAttivo() {
        if (_selAChi != null) return _selAChi;
        var b = (stato.briciole || []).filter(function (x) { return x.id === 'contesto'; })[0];
        return b ? b.et : '';
    }
    function _voceMenu(testo, on, fs, extraCls, onClick) {
        var it = document.createElement('button');
        it.type = 'button';
        it.setAttribute('role', 'menuitemradio');
        it.setAttribute('aria-checked', on ? 'true' : 'false');
        it.className = 'mn-bric-menu__it' + (on ? ' is-on' : '') + (extraCls ? ' ' + extraCls : '');
        it.textContent = testo;
        it.style.fontSize = fs;
        it.addEventListener('click', function (ev) { ev.stopPropagation(); onClick && onClick(); });
        return it;
    }
    function _colonna(titolo) {
        var c = document.createElement('div'); c.className = 'mn-bric-col';
        if (titolo) { var h = document.createElement('div'); h.className = 'mn-bric-col__h'; h.textContent = titolo; c.appendChild(h); }
        return c;
    }
    function _costruisciMenu(trigger) {
        var role = trigger.dataset.role;
        var fs = trigger.style.fontSize || 'var(--mn-tit-fs, 30px)';
        var chiudi = function () { menu.remove(); trigger.setAttribute('aria-expanded', 'false'); };
        var menu = document.createElement('div');
        menu.className = 'mn-bric-menu';
        menu.setAttribute('role', 'menu');

        if (role === 'cosa') {
            var att = _sezAttiva();
            [['CREA', ['crea', 'costruisci', 'build']], ['ELABORA', ['elabora']], ['INSEGNA', ['insegna', 'teach']]].forEach(function (v) {
                menu.appendChild(_voceMenu(v[0], v[1].indexOf(att) >= 0, fs, '', chiudi));
            });
            return menu;
        }
        if (role === 'achi') {
            menu.classList.add('mn-bric-menu--cols');
            var ctx = _contestoAttivo();
            var c1 = _colonna('');
            c1.appendChild(_voceMenu('Generico', ctx === 'Generico', fs, '', function () { _selAChi = 'Generico'; chiudi(); }));
            menu.appendChild(c1);
            var c2 = _colonna('Classi');
            _MOCK.classi.forEach(function (cl) { c2.appendChild(_voceMenu(cl, ctx === cl, fs, '', function () { _selAChi = cl; chiudi(); })); });
            menu.appendChild(c2);
            var c3 = _colonna('Allievi');
            _MOCK.allievi.forEach(function (al) { c3.appendChild(_voceMenu(al, ctx === al, fs, '', function () { _selAChi = al; chiudi(); })); });
            menu.appendChild(c3);
            return menu;
        }
        if (role === 'materia') {
            var ctx2 = _contestoAttivo();
            var generico = (ctx2 === 'Generico' || !ctx2);
            var lista = generico ? _MOCK.materieProfilo.slice()
                : (_MOCK.materieClasse[String(ctx2).replace(/^.*—\s*/, '')] || _MOCK.materieProfilo.slice());
            lista.forEach(function (mat) { menu.appendChild(_voceMenu(mat, false, fs, '', chiudi)); });
            /* «Nuova materia» solo su Generico: crea al volo il label e procede */
            if (generico) menu.appendChild(_voceMenu('+ Nuova materia', false, fs, 'mn-bric-menu__nuovo', chiudi));
            return menu;
        }
        return menu;
    }
    function _apriMenu(trigger) {
        var aperto = document.querySelector('.mn-bric-menu');
        if (aperto) {
            var era = aperto._perTrigger;
            aperto.remove();
            if (era) era.setAttribute('aria-expanded', 'false');
            if (era === trigger) return;   /* clic sullo stesso trigger = chiudi */
        }
        var menu = _costruisciMenu(trigger);
        menu._perTrigger = trigger;
        /* ⚠️ Appeso al BOX, non a `.mn-briciole`: la testata non riesce a tenere la
           tendina SOPRA il corpo (`.mm-body--console` è position:relative → copre
           un menu che vive nella testata, e la testata la ritaglia). Nel box —
           position:relative e senza clip verso il basso — il menu galleggia sopra
           l'area. Posizione = somma degli offset lungo la catena fino al box (px
           non scalati: menu e trigger vivono nella stessa cornice trasformata). */
        var box = trigger.closest('.mm-box--console');
        box.appendChild(menu);
        var top = 0, left = 0, el = trigger;
        while (el && el !== box) { top += el.offsetTop; left += el.offsetLeft; el = el.offsetParent; }
        menu.style.top = (top + trigger.offsetHeight + 6) + 'px';
        /* non sfora a destra: se il menu (le colonne di «A chi» sono larghe) supera
           il bordo del box, lo si tira a sinistra */
        var maxLeft = box.offsetWidth - menu.offsetWidth - 8;
        menu.style.left = Math.max(8, Math.min(left, maxLeft)) + 'px';
        trigger.setAttribute('aria-expanded', 'true');
        setTimeout(function () {
            document.addEventListener('mousedown', function chiudi(e) {
                if (!menu.contains(e.target) && e.target !== trigger) {
                    menu.remove(); trigger.setAttribute('aria-expanded', 'false');
                    document.removeEventListener('mousedown', chiudi);
                }
            });
        }, 0);
    }

    /* ── ANTEPRIMA: la cornice vera, con le variabili della griglia sopra ─── */
    function anteprima() {
        var host = $('#oc-anteprima');
        host.innerHTML = '';
        /* il contenitore prende l'ingombro RIMPICCIOLITO (la scala non cambia il
           posto che l'elemento occupa nel flusso: va detto a mano) */
        host.style.width = Math.round(vista.larghezza * vista.scala) + 'px';
        host.style.height = Math.round(vista.altezza * vista.scala) + 'px';
        if (!window.MappAIModal || !window.MappAIModal.render) {
            host.innerHTML = '<p class="oc-nota">motore dei modali non caricato</p>';
            return;
        }
        var nav = (stato.colonna || []).map(function (v) {
            return { id: v.id, etichetta: v.et, icona: v.icona, contatore: v.contatore, attiva: !!v.attiva };
        });
        var lato = [];
        if ((stato.comandi || []).length) {
            lato.push({
                colonna: 'lato', titolo: '',
                azioni: (stato.comandi || []).filter(function (c) { return !c.gruppo; }).map(function (c) {
                    return { id: c.id, etichetta: c.et, icona: c.icona, ruolo: c.primaria ? 'primario' : (c.attivo ? 'quieto' : '') };
                })
            });
        }
        /* ⚠️ `taglia: 'xl'`: il core RIPIEGA il layout console su un cruscotto
           sotto XL (a 820 resterebbe un elenco). Senza, il banco mostrerebbe un
           riquadro senza colonna né tela — cioè non una console. */
        /* Una console-EDITOR (un solo modulo con una `tela`, come F2) NON è un
           bento: la sua area È il foglio, esteso a tutta la console e senza box
           attorno (regola di Giacomo). La rendiamo con la `tela` del motore in
           vista piena — `.mm-box--piena:has(.mm-tela)` toglie i margini dell'area. */
        var telaVoce = ((stato.moduli || []).length === 1
            && ((stato.moduli[0].voci || []).length === 1)
            && stato.moduli[0].voci[0].forma === 'tela') ? stato.moduli[0].voci[0] : null;
        var schema = {
            layout: 'console', taglia: 'xl', piena: true, invio: false,
            titolo: (stato.briciole || []).map(function (b) { return b.et; }).join(' › ') || stato.vista,
            icona: 'folder', nav: nav, sezioni: lato
        };
        if (telaVoce) schema.tela = { segnaposto: telaVoce.aiuto || '' };
        var nodo = window.MappAIModal.render(schema);

        /* ⚠️ DUE livelli, e si scrivono in due posti diversi apposta: i token
           GLOBALI vanno sulla radice dell'anteprima (valgono per tutte le
           console: chip, campi, riquadri, allineamento delle sidebar), le
           variabili della VISTA sul riquadro di questa console. Scritti insieme,
           una scelta di questa vista sembrerebbe valere per tutte. */
        var glob = CB.variabiliGlobali(token);
        Object.keys(glob).forEach(function (k) { host.style.setProperty(k, glob[k]); });
        var vars = CB.variabili(stato);
        Object.keys(vars).forEach(function (k) { nodo.style.setProperty(k, vars[k]); });
        /* ⚠️ La finestra simulata va imposta al RIQUADRO, non al contenitore: il
           motore dà alla console una larghezza sua (`94vw` sotto la taglia piena),
           quindi l'anteprima misurava 800px mentre il selettore diceva 1440 — e le
           misure dei riquadri erano quelle di un'altra finestra. */
        nodo.style.width = vista.larghezza + 'px';
        nodo.style.maxWidth = 'none';
        /* ⚠️ E l'ALTEZZA: il motore dà alla console `88vh`, cioè la altezza del
           BANCO — che non c'entra niente con lo schermo su cui girerà. Senza
           questa riga il bento si impaginava in una striscia. */
        nodo.style.height = vista.altezza + 'px';
        nodo.style.maxHeight = 'none';
        if (vista.scala !== 1) {
            nodo.style.transformOrigin = 'top left';
            nodo.style.transform = 'scale(' + vista.scala + ')';
        }
        if (vista.navChiusa) nodo.classList.add('is-nav-chiusa');

        /* la testata: pallino (→ Cabina) · percorso. Il CHIP è stato TOLTO (6/8,
           Giacomo): il contesto classe·materia vive ora nel percorso — livelli
           «A chi?» e «Materia». Resta solo il pallino per la Cabina. */
        var ico = nodo.querySelector('.mm-head__ico');
        if (ico) {
            var pal = document.createElement('button');
            pal.type = 'button';
            pal.className = ico.className + ' mm-head__ico--cabina';
            ico.parentNode.replaceChild(pal, ico);
        }
        var testi = nodo.querySelector('.mm-head__testi');
        if (testi) {
            var br = document.createElement('nav');
            br.className = 'mn-briciole';
            (stato.briciole || []).forEach(function (b, i, arr) {
                if (i) {
                    var s = document.createElement('span');
                    s.className = 'mn-briciole__sep'; s.textContent = '›';
                    br.appendChild(s);
                }
                var ultima = (i === arr.length - 1);
                var el;
                var ruolo = !ultima ? _ruoloDi(b.id) : null;
                if (ruolo) {
                    /* un livello con un ruolo (Cosa · A chi? · Materia) è una TENDINA:
                       il label è il prompt, il menu porta le scelte marcando l'attiva.
                       Resta alla dimensione del suo livello (10% in meno per passo). */
                    el = document.createElement('button');
                    el.type = 'button';
                    el.className = 'mn-briciole__l mn-briciole__l--menu';
                    el.dataset.role = ruolo.role;
                    el.setAttribute('aria-haspopup', 'true');
                    el.setAttribute('aria-expanded', 'false');
                    el.innerHTML = '<span>' + esc(ruolo.et) + '</span><span class="mn-briciole__car" aria-hidden="true">▾</span>';
                    el.style.fontSize = 'calc(var(--mn-tit-fs, 30px) * ' + Math.pow(0.9, i).toFixed(3) + ')';
                    (function (t) { t.addEventListener('click', function (ev) { ev.stopPropagation(); _apriMenu(t); }); })(el);
                } else {
                    /* livello senza ruolo (l'ultimo = nome della mappa, o le briciole
                       delle altre console): etichetta statica; l'ultima in corsivo. */
                    el = document.createElement(ultima ? 'span' : 'button');
                    el.className = 'mn-briciole__l' + (ultima ? ' is-qui' : '');
                    if (el.tagName === 'BUTTON') el.type = 'button';
                    el.textContent = b.et;
                    el.style.fontSize = 'calc(var(--mn-tit-fs, 30px) * ' + Math.pow(0.9, i).toFixed(3) + ')';
                    if (ultima) { el.style.fontStyle = 'italic'; el.style.fontWeight = '400'; }
                }
                br.appendChild(el);
            });
            testi.appendChild(br);
            testi.classList.add('ha-briciole');
        }
        /* Il rail delle tre forme è stato TOLTO (6/8, Giacomo): la scelta
           CREA/ELABORA/INSEGNA vive ora nel menu «Cosa» del primo livello del
           percorso. Resta solo il pallino della testata (accesso alla Cabina). */

        /* Il bento entra DIRETTAMENTE nell'area (niente tela grigia attorno). Ma
           una console-EDITOR (solo `tela`, come F2) NON ha bento: la sua area È il
           foglio, a tutta la console e senza box (la `tela` piena del motore). */
        var area = nodo.querySelector('.mm-console__area');
        if (area && !telaVoce) {
            var telaVuota = area.querySelector('.mm-tela');
            if (telaVuota) telaVuota.remove();
            area.insertAdjacentHTML('beforeend', bentoHtml(stato));
        }

        host.appendChild(nodo);
        if (window.lucide && window.lucide.createIcons) { try { window.lucide.createIcons(); } catch (e) { } }
        /* Nel banco i bottoni della console sono muti (render, non open). «Nuovo
           documento» però apre un pop-up che È parte del design: lo rendiamo
           cliccabile qui, così il flusso si prova davvero (clic → chooser del tipo). */
        var nuovoBtn = nodo.querySelector('[data-azione="f1-nuovo"]');
        if (nuovoBtn && CB.POPUP && CB.POPUP['nuovo-doc-chooser'] && window.MappAIModal && window.MappAIModal.open) {
            nuovoBtn.addEventListener('click', function (ev) {
                ev.preventDefault();
                window.MappAIModal.open(CB.POPUP['nuovo-doc-chooser']).catch(function () { });
            });
        }
        misura();
    }

    /* ── MISURE: quanto vengono i riquadri, con che corpi, e cosa non torna ── */
    function misura() {
        var box = $('#oc-anteprima .mn-bento-area'), out = $('#oc-misure');
        if (!box) { out.textContent = ''; return; }
        /* ⚠️ `offsetWidth/Height` e non `getBoundingClientRect`: col banco a metà
           scala il rettangolo misurato è quello RIMPICCIOLITO, e le misure
           direbbero numeri che sullo schermo vero non esistono. */
        var mods = $$('#oc-anteprima .mn-card').map(function (c) {
            return esc(c.dataset.mod) + ' ' + c.offsetWidth + '×' + c.offsetHeight;
        });
        var corpi = {};
        $$('#oc-anteprima .mn-bento-area *').forEach(function (e) {
            if (e.children.length || !(e.textContent || '').trim()) return;
            var cs = getComputedStyle(e);
            if (cs.display === 'none') return;
            corpi[parseFloat(cs.fontSize) + '/' + cs.fontWeight] = (corpi[parseFloat(cs.fontSize) + '/' + cs.fontWeight] || 0) + 1;
        });
        /* fuori scala = una coppia corpo/peso che il bento di CREA non dichiara.
           È la caccia ai pezzi fuori token, fatta mentre si compone. */
        var attesi = {};
        if (B && B.SCALA) Object.keys(B.SCALA).forEach(function (k) {
            attesi[B.SCALA[k].px + '/' + B.SCALA[k].peso] = k;
            if (B.SCALA[k].pesoTitolo) attesi[B.SCALA[k].px + '/' + B.SCALA[k].pesoTitolo] = k;
        });
        var fuori = Object.keys(corpi).filter(function (k) { return !attesi[k]; });
        var colonna = $('#oc-anteprima .mm-console__side');
        var area = $('#oc-anteprima .mm-console__area');
        out.innerHTML =
            '<b>finestra</b> ' + vista.larghezza + '×' + vista.altezza +
            (vista.scala !== 1 ? ' (mostrata al ' + Math.round(vista.scala * 100) + '%)' : '') +
            ' · <b>colonna</b> ' + (colonna ? colonna.offsetWidth : 0) + 'px · <b>area</b> ' +
            (area ? area.offsetWidth + '×' + area.offsetHeight : box.offsetWidth + '×' + box.offsetHeight) + 'px<br>' +
            '<b>riquadri</b> ' + mods.join(' · ') + '<br>' +
            '<b>corpi</b> ' + Object.keys(corpi).sort().map(function (k) {
                return (attesi[k] ? '' : '<i class="oc-fuori">') + k + ' ×' + corpi[k] + (attesi[k] ? '' : '</i>');
            }).join(' · ') +
            (fuori.length ? '<br><b class="oc-fuori">fuori scala: ' + fuori.length + '</b> — pezzi che non usano i tre corpi del bento' : '');
    }

    function diagnosi() {
        var v = CB.valida(stato), h = '';
        if (!v.errori.length && !v.avvisi.length) h = '<p class="oc-ok">Nessun rilievo: si può montare.</p>';
        if (v.errori.length) h += '<ul class="oc-err">' + v.errori.map(function (e) { return '<li>' + esc(e) + '</li>'; }).join('') + '</ul>';
        if (v.avvisi.length) h += '<ul class="oc-avv">' + v.avvisi.map(function (e) { return '<li>' + esc(e) + '</li>'; }).join('') + '</ul>';
        $('#oc-diagnosi').innerHTML = h;
    }

    /* ── LA GRIGLIA: barra · colonna · area ──────────────────────────────── */
    /* ── LIVELLO 0 · i token GLOBALI (valgono per tutte le console) ────────── */
    var GLOBALI = [
        {
            g: 'chip', titolo: 'Chip del contesto', ambito: 'tutte le console e la landing', campi: [
                { k: 'fondo', et: 'fondo', tipo: 'color' },
                { k: 'testo', et: 'testo', tipo: 'color' },
                { k: 'bordo', et: 'bordo', tipo: 'color' },
                { k: 'altezza', et: 'altezza', tipo: 'number', min: 28, max: 64 },
                { k: 'raggio', et: 'raggio', tipo: 'number', min: 0, max: 999 },
                { k: 'corpo', et: 'corpo', tipo: 'number', min: 9, max: 18 }
            ]
        },
        {
            g: 'campi', titolo: 'Campi e tendine', ambito: 'tutte le console', campi: [
                { k: 'altezza', et: 'altezza', tipo: 'number', min: 24, max: 56 },
                { k: 'raggio', et: 'raggio', tipo: 'number', min: 0, max: 24 },
                { k: 'largMin', et: 'larghezza minima', tipo: 'number', min: 60, max: 400 },
                { k: 'tendinaLarg', et: 'larghezza tendina', tipo: 'number', min: 80, max: 400 }
            ]
        },
        {
            g: 'riquadri', titolo: 'Riquadri', ambito: 'tutte le console', campi: [
                { k: 'raggio', et: 'raggio', tipo: 'number', min: 0, max: 40 },
                { k: 'ombra', et: 'ombra', tipo: 'scelta', valori: ['nessuna', 'lieve', 'media'] }
            ]
        },
        {
            g: 'colonna', titolo: 'Colonna — allineamento', ambito: 'TUTTE le sidebar', campi: [
                { k: 'allinea', et: 'voci allineate', tipo: 'scelta', valori: ['sinistra', 'centro'] }
            ]
        },
        {
            g: 'maniglia', titolo: 'Maniglia della sidebar', ambito: 'tutte le console', campi: [
                { k: 'top', et: 'posizione dall\'alto', tipo: 'number', min: 0, max: 120 },
                { k: 'x', et: 'posizione orizzontale', tipo: 'number', min: -40, max: 40 },
                { k: 'taglia', et: 'taglia', tipo: 'number', min: 24, max: 56 },
                { k: 'raggio', et: 'raggio', tipo: 'number', min: 0, max: 28 },
                { k: 'angolo', et: 'angolo arrotondato', tipo: 'scelta', valori: ['alto-sx', 'alto-dx', 'basso-dx', 'basso-sx'] },
                { k: 'rot', et: 'orientamento glifo (mostra)', tipo: 'scelta', valori: ['0', '90', '180', '270'] },
                { k: 'rotChiusa', et: 'orientamento glifo (nascondi)', tipo: 'scelta', valori: ['0', '90', '180', '270'] },
                { k: 'fondo', et: 'fondo (mostra)', tipo: 'color' },
                { k: 'segno', et: 'icona (mostra)', tipo: 'color' },
                { k: 'fondoChiusa', et: 'fondo (nascondi)', tipo: 'color' },
                { k: 'segnoChiusa', et: 'icona (nascondi)', tipo: 'color' }
            ]
        },
        {
            g: 'sidebar', titolo: 'Colonna — margine sopra', ambito: 'tutte le console', campi: [
                { k: 'margineSopra', et: 'margine sopra i contenuti', tipo: 'number', min: 0, max: 120 }
            ]
        }
    ];

    var GRIGLIA = [
        {
            g: 'barra', titolo: 'Barra in alto (topbar / percorso)', campi: [
                { k: 'corpo', et: 'corpo di «Cosa» (px)', tipo: 'number', min: 12, max: 48 },
                { k: 'scalaAltri', et: 'livelli dopo «Cosa» (% del corpo)', tipo: 'number', min: 30, max: 100 },
                { k: 'colore', et: 'colore di «Cosa»', tipo: 'color' },
                { k: 'opacitaPrec', et: 'opacità livelli dopo «Cosa» %', tipo: 'number', min: 20, max: 100 },
                { k: 'opacitaSep', et: 'opacità separatori › %', tipo: 'number', min: 10, max: 100 },
                { k: 'altezza', et: 'altezza barra (px)', tipo: 'number', min: 56, max: 120 },
                { k: 'hairline', et: 'colore del filetto', tipo: 'color' }
            ]
        },
        {
            g: 'colonna', titolo: 'Colonna (sidebar)', campi: [
                { k: 'larghezza', et: 'larghezza', tipo: 'number', min: 180, max: 420 },
                { k: 'imballaggio', et: 'margine interno', tipo: 'number', min: 0, max: 40 },
                { k: 'altezzaVoce', et: 'altezza voce', tipo: 'number', min: 28, max: 72 },
                { k: 'passo', et: 'passo fra le voci', tipo: 'number', min: 0, max: 20 },
                { k: 'corpoVoce', et: 'corpo voce', tipo: 'number', min: 10, max: 20 },
                { k: 'raggio', et: 'raggio voce', tipo: 'number', min: 0, max: 24 },
                { k: 'icona', et: 'icona', tipo: 'number', min: 12, max: 28 }
            ]
        },
        {
            g: 'area', titolo: 'Area (dove sta il bento)', campi: [
                { k: 'colonne', et: 'colonne del bento', tipo: 'number', min: 1, max: 6 },
                { k: 'passo', et: 'passo del bento', tipo: 'number', min: 0, max: 40 },
                { k: 'padX', et: 'margine ↔', tipo: 'number', min: 0, max: 80 },
                { k: 'padY', et: 'margine ↕', tipo: 'number', min: 0, max: 80 },
                { k: 'tetto', et: 'tetto di larghezza', tipo: 'number', min: 600, max: 2400 },
                { k: 'allinea', et: 'allineamento', tipo: 'scelta', valori: ['sinistra', 'centro'] }
            ]
        }
    ];

    /* un gruppo di leve, con l'AMBITO scritto: chi lo tocca deve sapere subito
       quante superfici sta cambiando (è la richiesta di Giacomo sulla gerarchia) */
    function gruppoHtml(gr, valori, prefisso) {
        return '<div class="oc-gr"><h3>' + esc(gr.titolo) +
            (gr.ambito ? '<span class="oc-ambito">vale per ' + esc(gr.ambito) + '</span>' : '') +
            '</h3><div class="oc-gr__c">' +
            gr.campi.map(function (c) {
                var v = valori[gr.g][c.k];
                if (c.tipo === 'scelta') {
                    return '<label>' + esc(c.et) + '<select class="oc-s" ' + prefisso + '="' + gr.g + '" data-gk="' + c.k + '">' +
                        c.valori.map(function (x) { return '<option' + (x === v ? ' selected' : '') + '>' + x + '</option>'; }).join('') +
                        '</select></label>';
                }
                if (c.tipo === 'color') {
                    var val = (v === 'transparent') ? '#ffffff' : v;
                    return '<label>' + esc(c.et) + '<input type="color" class="oc-col" ' + prefisso + '="' + gr.g + '" data-gk="' + c.k + '" value="' + esc(val) + '"></label>';
                }
                return '<label>' + esc(c.et) + '<input type="number" class="oc-t oc-t--s" ' + prefisso + '="' + gr.g + '" data-gk="' + c.k +
                    '" min="' + c.min + '" max="' + c.max + '" value="' + esc(v) + '"></label>';
            }).join('') + '</div></div>';
    }

    function globaliHtml() {
        var t = CB.tokenDi(token);
        return GLOBALI.map(function (gr) { return gruppoHtml(gr, t, 'data-t'); }).join('');
    }

    function grigliaHtml() {
        var s = CB.aspettoDi(stato);
        return GRIGLIA.map(function (gr) {
            return '<div class="oc-gr"><h3>' + esc(gr.titolo) +
                '<span class="oc-ambito">vale per questa vista</span></h3><div class="oc-gr__c">' +
                gr.campi.map(function (c) {
                    var v = s[gr.g][c.k];
                    if (c.tipo === 'scelta') {
                        return '<label>' + esc(c.et) + '<select class="oc-s" data-g="' + gr.g + '" data-gk="' + c.k + '">' +
                            c.valori.map(function (x) { return '<option' + (x === v ? ' selected' : '') + '>' + x + '</option>'; }).join('') +
                            '</select></label>';
                    }
                    if (c.tipo === 'color') {
                        return '<label>' + esc(c.et) + '<input type="color" class="oc-col" data-g="' + gr.g + '" data-gk="' + c.k + '" value="' + esc(v) + '"></label>';
                    }
                    return '<label>' + esc(c.et) + '<input type="number" class="oc-t oc-t--s" data-g="' + gr.g + '" data-gk="' + c.k +
                        '" min="' + c.min + '" max="' + c.max + '" value="' + esc(v) + '"></label>';
                }).join('') + '</div></div>';
        }).join('');
    }

    /* ── L'EDITOR dei riquadri: le leve del bento di CREA, una per una ───── */
    function moduloEditor(m, i) {
        var st = (B && B.stileDi) ? B.stileDi(m) : { bg: '', testo: '', bordoPx: 0, bordoCol: '#333' };
        var lay = (B && B.layoutDi) ? B.layoutDi(m) : { colonneVoci: 'auto', colMin: 220, etichette: 'sinistra', etLarghezza: 0 };
        var bot = (B && B.bottoniDi) ? B.bottoniDi(m) : { bg: '', testo: '', hoverBg: '', hoverTesto: '' };
        var cr = (B && B.contrasto && st.bg && st.testo) ? B.contrasto(st.testo, st.bg) : null;
        var crBot = null;
        if (B && B.contrasto && B.componi && bot.bg && bot.testo) crBot = B.contrasto(bot.testo, bot.bg);

        return '<div class="oc-mod" draggable="true" data-i="' + i + '">' +
            '<div class="oc-mod__h"><span class="oc-drag" title="trascina per riordinare">⠿</span>' +
            '<input class="oc-t" data-k="titolo" value="' + esc(m.titolo || '') + '" placeholder="titolo del riquadro">' +
            '<button type="button" class="oc-mini" data-su="' + i + '" title="su">↑</button>' +
            '<button type="button" class="oc-mini" data-giu="' + i + '" title="giù">↓</button>' +
            '<button type="button" class="oc-mini oc-mini--x" data-togli-mod="' + i + '" title="togli il riquadro">×</button></div>' +

            '<div class="oc-mod__p">' +
            '<label>icona <input class="oc-t oc-t--s" data-k="icona" value="' + esc(m.icona || '') + '"></label>' +
            '<label>colonne <select class="oc-s" data-k="span">' +
            [1, 2, 3, 4, 5, 6].map(function (n) { return '<option value="' + n + '"' + (CB.spanDi(m) === n ? ' selected' : '') + '>' + n + '</option>'; }).join('') +
            '</select></label>' +
            '<label>altezza <input class="oc-t oc-t--s" data-k="altezza" type="number" value="' + (m.altezza || 145) + '"></label>' +
            '<label class="oc-chk"><input type="checkbox" data-k="nuda"' + (m.nuda ? ' checked' : '') + '> senza riquadro</label>' +
            '</div>' +

            /* aspetto del riquadro — le stesse leve dell'officina del bento */
            '<div class="oc-mod__p oc-mod__p--asp">' +
            '<label>fondo <input type="color" class="oc-col" data-s="bg" value="' + esc(st.bg || '#404040') + '"></label>' +
            '<label>testo <input type="color" class="oc-col" data-s="testo" value="' + esc(st.testo || '#ffffff') + '"></label>' +
            (cr ? '<span class="oc-cr' + (cr < 4.5 ? ' is-basso' : '') + '">' + cr + ':1</span>' : '') +
            '<label>bordo <input class="oc-t oc-t--xs" type="number" data-s="bordoPx" value="' + (st.bordoPx || 0) + '"></label>' +
            '<label><input type="color" class="oc-col" data-s="bordoCol" value="' + esc(st.bordoCol || '#333333') + '"></label>' +
            '</div>' +

            /* disposizione delle voci dentro il riquadro */
            '<div class="oc-mod__p oc-mod__p--asp">' +
            '<label>voci <select class="oc-s" data-l="colonneVoci">' +
            ['auto', 'colonna', '1', '2', '3', '4', '5', '6'].map(function (x) {
                return '<option value="' + x + '"' + (String(lay.colonneVoci) === x ? ' selected' : '') + '>' + x + '</option>';
            }).join('') + '</select></label>' +
            '<label>larghezza min <input class="oc-t oc-t--xs" type="number" data-l="colMin" value="' + (lay.colMin || 220) + '"></label>' +
            '<label>etichette <select class="oc-s" data-l="etichette">' +
            ['sinistra', 'sopra'].map(function (x) { return '<option value="' + x + '"' + (lay.etichette === x ? ' selected' : '') + '>' + x + '</option>'; }).join('') +
            '</select></label>' +
            '<label>colonna et. <input class="oc-t oc-t--xs" type="number" data-l="etLarghezza" value="' + (lay.etLarghezza || 0) + '"></label>' +
            '</div>' +

            /* colori dei bottoni interni, col contrasto sul fondo COMPOSITO */
            '<div class="oc-mod__p oc-mod__p--asp">' +
            '<label>bottoni <input type="color" class="oc-col" data-b="bg" value="' + esc(bot.bg || '#f1f4f8') + '"></label>' +
            '<label>testo <input type="color" class="oc-col" data-b="testo" value="' + esc(bot.testo || '#404040') + '"></label>' +
            (crBot ? '<span class="oc-cr' + (crBot < 4.5 ? ' is-basso' : '') + '">' + crBot + ':1</span>' : '') +
            '<label>al passaggio <input type="color" class="oc-col" data-b="hoverBg" value="' + esc(bot.hoverBg || '#41e6aa') + '"></label>' +
            '<label><input type="color" class="oc-col" data-b="hoverTesto" value="' + esc(bot.hoverTesto || '#404040') + '"></label>' +
            '</div>' +

            '<div class="oc-voci">' + (m.voci || []).map(function (v, j) {
                return '<div class="oc-voce" data-j="' + j + '">' +
                    '<input class="oc-t" data-vk="et" value="' + esc(v.et || '') + '" placeholder="etichetta">' +
                    '<select class="oc-s" data-vk="forma">' + Object.keys(CB.FORME).map(function (f) {
                        return '<option value="' + f + '"' + (v.forma === f ? ' selected' : '') + '>' + f + '</option>';
                    }).join('') + '</select>' +
                    '<input class="oc-t oc-t--xs" type="number" data-vk="w" value="' + (v.w || '') + '" placeholder="larg" title="larghezza del campo in px (vuoto = quella di tutte le console)">' +
                    '<button type="button" class="oc-mini oc-mini--x" data-togli-voce="' + j + '" title="togli la voce">×</button>' +
                    '<textarea class="oc-a" data-vk="aiuto" placeholder="pop-up: che cos\'è, in una frase">' + esc(v.aiuto || '') + '</textarea>' +
                    '</div>';
            }).join('') +
            '<button type="button" class="oc-add" data-add-voce="' + i + '">+ voce</button>' +
            '</div></div>';
    }

    function editor() {
        $('#oc-globali').innerHTML = globaliHtml();
        $('#oc-griglia').innerHTML = grigliaHtml();
        $('#oc-editor').innerHTML = (stato.moduli || []).map(moduloEditor).join('') +
            '<button type="button" class="oc-add oc-add--mod" id="oc-add-mod">+ riquadro</button>';
        aggancia();
    }

    function aggancia() {
        /* i token globali */
        $$('#oc-globali [data-t]').forEach(function (c) {
            c.addEventListener('input', function () {
                var g = c.getAttribute('data-t'), k = c.dataset.gk;
                token[g] = token[g] || {};
                token[g][k] = (c.type === 'number') ? (parseFloat(c.value) || 0) : c.value;
                ridisegna(false);
            });
        });
        /* la griglia */
        $$('#oc-griglia [data-g]').forEach(function (c) {
            c.addEventListener('input', function () {
                stato.aspetto = stato.aspetto || {};
                stato.aspetto[c.dataset.g] = stato.aspetto[c.dataset.g] || {};
                var v = c.value;
                if (c.type === 'number') v = parseFloat(v) || 0;
                stato.aspetto[c.dataset.g][c.dataset.gk] = v;
                ridisegna(false);
            });
        });
        /* i riquadri */
        $$('#oc-editor .oc-mod').forEach(function (el) {
            var i = +el.dataset.i;
            $$('[data-k]', el).forEach(function (c) {
                c.addEventListener('change', function () {
                    var k = c.dataset.k, v = (c.type === 'checkbox') ? c.checked : c.value;
                    if (k === 'span' || k === 'altezza') v = parseInt(v, 10) || 1;
                    stato.moduli[i][k] = v; ridisegna(false);
                });
            });
            $$('[data-s]', el).forEach(function (c) {
                c.addEventListener('input', function () {
                    var m = stato.moduli[i];
                    m.stile = m.stile || {};
                    m.stile[c.dataset.s] = (c.type === 'number') ? (parseInt(c.value, 10) || 0) : c.value;
                    ridisegna(false);
                });
            });
            $$('[data-l]', el).forEach(function (c) {
                c.addEventListener('input', function () {
                    var m = stato.moduli[i];
                    m.layout = m.layout || {};
                    var v = c.value;
                    if (c.type === 'number') v = parseInt(v, 10) || 0;
                    else if (/^\d+$/.test(v)) v = parseInt(v, 10);
                    m.layout[c.dataset.l] = v;
                    ridisegna(false);
                });
            });
            $$('[data-b]', el).forEach(function (c) {
                c.addEventListener('input', function () {
                    var m = stato.moduli[i];
                    m.bottoni = m.bottoni || {};
                    m.bottoni[c.dataset.b] = c.value;
                    ridisegna(false);
                });
            });
            $$('.oc-voce', el).forEach(function (ve) {
                var j = +ve.dataset.j;
                $$('[data-vk]', ve).forEach(function (c) {
                    c.addEventListener('change', function () {
                        stato.moduli[i].voci[j][c.dataset.vk] = c.value; ridisegna(false);
                    });
                });
            });
        });
        /* riordino e aggiunte */
        $$('#oc-editor [data-su]').forEach(function (b) { b.addEventListener('click', function () { sposta(+b.dataset.su, -1); }); });
        $$('#oc-editor [data-giu]').forEach(function (b) { b.addEventListener('click', function () { sposta(+b.dataset.giu, 1); }); });
        $$('#oc-editor [data-togli-mod]').forEach(function (b) {
            b.addEventListener('click', function () { stato.moduli.splice(+b.dataset.togliMod, 1); ridisegna(true); });
        });
        $$('#oc-editor [data-add-voce]').forEach(function (b) {
            b.addEventListener('click', function () {
                var m = stato.moduli[+b.dataset.addVoce];
                m.voci = m.voci || [];
                m.voci.push({ id: 'v' + Date.now(), et: 'Voce nuova', forma: 'azione', aiuto: '' });
                ridisegna(true);
            });
        });
        $$('#oc-editor .oc-voce [data-togli-voce]').forEach(function (b) {
            b.addEventListener('click', function () {
                var i = +b.closest('.oc-mod').dataset.i;
                stato.moduli[i].voci.splice(+b.dataset.togliVoce, 1); ridisegna(true);
            });
        });
        var add = $('#oc-add-mod');
        if (add) add.addEventListener('click', function () {
            stato.moduli.push({ id: 'm' + Date.now(), titolo: 'Riquadro nuovo', icona: '', span: 1, altezza: 145, voci: [] });
            ridisegna(true);
        });
        var preso = null;
        $$('#oc-editor .oc-mod').forEach(function (el) {
            el.addEventListener('dragstart', function () { preso = +el.dataset.i; el.classList.add('is-preso'); });
            el.addEventListener('dragend', function () { el.classList.remove('is-preso'); });
            el.addEventListener('dragover', function (e) { e.preventDefault(); });
            el.addEventListener('drop', function (e) {
                e.preventDefault();
                var dove = +el.dataset.i;
                if (preso == null || preso === dove) return;
                stato.moduli.splice(dove, 0, stato.moduli.splice(preso, 1)[0]);
                preso = null; ridisegna(true);
            });
        });
    }

    function sposta(i, d) {
        var j = i + d;
        if (j < 0 || j >= stato.moduli.length) return;
        stato.moduli.splice(j, 0, stato.moduli.splice(i, 1)[0]);
        ridisegna(true);
    }

    /* «auto» = la finestra si rimpicciolisce quanto basta a starci dentro tutta.
       È il modo normale di guardarla: si compone un 1440×900 vedendolo INTERO,
       invece di scorrere una finestra più grande del pannello che la contiene. */
    function adatta() {
        var zoom = $('#oc-zoom');
        if (!zoom || zoom.value !== 'auto') return;
        var pan = $('#oc-anteprima').parentElement;
        var disp = Math.max(320, pan.clientWidth - 4);
        var alto = Math.max(320, window.innerHeight - 180);
        vista.scala = Math.min(1, disp / vista.larghezza, alto / vista.altezza);
    }

    function ridisegna(rifaiEditor) {
        if (rifaiEditor) editor();
        adatta(); anteprima(); diagnosi(); salva();
        $('#oc-json').value = JSON.stringify(stato, null, 1);
    }

    function avvio() {
        document.documentElement.classList.add('manifesto');
        /* Version-bump: quando il FILE adotta nuove composizioni di default, la
           localStorage vecchia le maschererebbe — e i margini (aspetto) non entrano
           nella `__firma`, quindi il confronto in carica() non basta a farle vincere.
           A ogni bump di VER si azzera la composizione salvata: si riparte dal file. */
        try {
            if (localStorage.getItem(LS_VER) !== VER) {
                localStorage.removeItem(LS);
                localStorage.setItem(LS_VER, VER);
            }
        } catch (e) { }
        var sel = $('#oc-area');
        sel.innerHTML = CB.AREE.map(function (a) {
            return '<option value="' + a.id + '">' + esc(a.console + ' · ' + a.vista) + '</option>';
        }).join('');
        sel.addEventListener('change', function () { carica(sel.value); ridisegna(true); });

        var larg = $('#oc-larghezza');
        larg.addEventListener('change', function () { vista.larghezza = parseInt(larg.value, 10); adatta(); anteprima(); });
        var alt = $('#oc-altezza');
        alt.addEventListener('change', function () { vista.altezza = parseInt(alt.value, 10); adatta(); anteprima(); });
        var zoom = $('#oc-zoom');
        zoom.addEventListener('change', function () {
            vista.scala = (zoom.value === 'auto') ? 0 : (parseInt(zoom.value, 10) / 100);
            adatta(); anteprima();
        });
        var nav = $('#oc-navchiusa');
        nav.addEventListener('change', function () { vista.navChiusa = nav.checked; anteprima(); });

        $('#oc-reset').addEventListener('click', function () {
            var t = salvate(); delete t[areaId];
            try { localStorage.setItem(LS, JSON.stringify(t)); } catch (e) { }
            carica(areaId); ridisegna(true);
        });
        /* i token globali si azzerano a parte: buttarli via insieme a una vista
           vorrebbe dire perdere il lavoro fatto su TUTTE le console */
        $('#oc-reset-token').addEventListener('click', function () {
            token = {};
            try { localStorage.removeItem(LS_TOKEN); } catch (e) { }
            ridisegna(true);
        });
        $('#oc-copia').addEventListener('click', function () {
            $('#oc-json').select();
            try { document.execCommand('copy'); } catch (e) { }
        });

        caricaToken();
        carica(CB.AREE[0].id);
        vista.scala = 0;            /* parte in «auto»: la finestra si vede intera */
        ridisegna(true);
        window.addEventListener('resize', function () { adatta(); anteprima(); });
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', avvio);
    else avvio();
}());
