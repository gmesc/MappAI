/* =========================================================================
   mappai-crea-iconografica.js — CREA CON UNA FOTO, il guscio (0067)

   ADR 0015 (rev. 1). Con una scheda di fonte iconografica confermata fra le
   fonti di CREA, nel bento le due card della mappa (Mappa / Knowledge Graph e
   «Tema centrale») lasciano il posto a due card nuove con gli stessi span:
     · l'anteprima della foto;
     · la scheda letta — il titolo in un campo (unico scrittore di
       `scheda.titolo`, sul `change`), l'identità, «N parti su 4», gli avvisi e
       «Rivedi la scheda», che riapre la superficie che esiste già
       (`MappAIVisione.montaSuperficie`).
   Il verde prende l'etichetta del gesto vero; la spunta «Manda la fonte
   all'allievo» si nasconde (la foto va in `Allegati/` comunque). E vale «o foto o
   documenti»: con una foto fra le fonti un PDF non entra, e viceversa (01/10).
   Con una foto SENZA scheda (annullata, fallita, rifiutata dal provider) le due
   card dicono «Leggi prima la foto», col motivo, e il verde resta bloccato.

   Che cosa mostrare lo decide il core (`MappAICreaIconograficaCore`): qui si
   monta, si smonta, si aggancia. Nessun `if` di composizione (invariante 4).

   Interruttore (inv. 1): localStorage `mappai_crea_iconografica`, ACCESO
   (bivio 1 chiuso da Giacomo). '0' → la schermata di prima, al carattere.
   Il gancio: `MappAIVisione.sincronizzaGenere()` chiama `aggiorna()`; lo
   chiamano già `leggiImmagineSorgente` e `removeSource` (app.js).
   ========================================================================= */
(function () {
    'use strict';
    /* trappola 22: caricato due volte terrebbe due osservatori sul verde */
    if (window.MappAICreaIconografica) return;

    var LS = 'mappai_crea_iconografica';
    var t = function (k, f) { return window.t ? window.t(k, f) : f; };
    function IC() { return window.MappAICreaIconograficaCore; }
    function toast(m, tipo) { if (window.showToast) window.showToast(m, tipo || 'info'); }
    /* `appState` è un `let` di app.js: non sta su `window` (invariante 3) */
    function _st() {
        try { return (typeof appState !== 'undefined') ? appState : window.appState; }
        catch (e) { return window.appState; }
    }
    function attivo() {
        try { return localStorage.getItem(LS) !== '0'; } catch (e) { return true; }
    }
    function _fonti() { var s = _st(); return (s && s.sources) || []; }
    function _fonteDi(id) {
        var l = _fonti();
        for (var i = 0; i < l.length; i++) if (l[i] && l[i].id === id) return l[i];
        return null;
    }

    var S = {
        montato: false, comp: null, firma: '', motivo: '',
        foto: null, scheda: null, nascosti: [],
        url: null, urlDi: null, fotoDi: null,
        osservatore: null, spunta: null,
        inLettura: {}, vociNascoste: [],
        /* il riquadro della scheda (0069): l'elemento, che cosa mostra (`rq`, vedi
           `_nuovoRq`), se il montaggio è quello col riquadro, e il fattore di «Aa» */
        riquadro: null, rq: null, modoRiquadro: false, zoom: 1
    };

    /* I due moduli che si sostituiscono: si riconoscono da ciò che contengono, non
       dalla posizione — l'Officina §7 può averli spostati. Se non ci sono (veste
       spenta, composizione diversa) il guscio non monta e `sincronizzaGenere` fa
       quello che faceva prima. */
    function _moduli() {
        var bento = document.getElementById('mn-bento');
        if (!bento) return null;
        var mm = document.getElementById('mode-mindmap');
        var dx = document.getElementById('mn-genere-dx');
        var g = mm && mm.closest ? mm.closest('#mn-bento > *') : null;
        var o = dx && dx.closest ? dx.closest('#mn-bento > *') : null;
        if (!g || !o || g === o) return null;
        return { bento: bento, genere: g, opz: o };
    }

    /* ── il motivo del provider, se la foto non è letta ─────────────────────── */
    function _motivo(comp) {
        if (!comp || !comp.daLeggere.length) return '';
        var V = window.MappAIVisione, C = window.MappAIVisioneCore;
        var male = (V && V.provaProvider) ? V.provaProvider() : '';
        if (!male || !C || !C.diagnosi) return '';
        var d = C.diagnosi(male);
        return d.messaggio + ' ' + d.rimedio;
    }

    /* ── la card della foto ──────────────────────────────────────────────────── */
    function _disegnaFoto(comp) {
        var f = comp.fonte || {};
        var src = _fonteDi(f.id);
        var sch = src && src._scheda;
        var chiave = f.id + '|' + (sch ? 's' : 'n');
        if (S.fotoDi === chiave && S.foto.firstChild) return;
        S.fotoDi = chiave;
        var box = S.foto;
        box.textContent = '';
        var dati = '';
        if (sch && sch.fotoB64) {
            dati = 'data:' + (sch.mime || 'image/jpeg') + ';base64,' + sch.fotoB64;
        } else if (f.anteprima && src && src.file && typeof Blob !== 'undefined' && src.file instanceof Blob && window.URL && URL.createObjectURL) {
            if (S.urlDi !== src.file) {
                if (S.url) { try { URL.revokeObjectURL(S.url); } catch (e) { } }
                S.url = URL.createObjectURL(src.file); S.urlDi = src.file;
            }
            dati = S.url;
        }
        if (dati) {
            var img = document.createElement('img');
            img.className = 'ci-foto__img';
            img.src = dati;
            img.alt = comp.titolo || f.nome || '';
            box.appendChild(img);
        } else {
            var p = document.createElement('p');
            p.className = 'ci-foto__formato';
            p.textContent = t('ci_formato', 'Formato {f}: l\'anteprima qui non si mostra, ma la foto c\'è.')
                .replace('{f}', f.formato || '?');
            box.appendChild(p);
        }
        var nome = document.createElement('p');
        nome.className = 'ci-foto__nome';
        nome.textContent = f.nome || '';
        nome.title = f.nome || '';
        box.appendChild(nome);
    }

    /* ── il verde ────────────────────────────────────────────────────────────
       `aggiornaGate` (mappai-costruisci-manifesto.js) riscrive etichetta, titolo,
       glifo e `mn-card--mappa` a ogni sincronizzazione del bento, e da fuori non
       si intercetta (trappola 9): si OSSERVA il bottone e si rimette il gesto vero.
       Ogni scrittura avviene solo se cambia qualcosa, quindi l'osservatore si
       ferma da sé dopo un giro. */
    function _verde() {
        var b = document.getElementById('mn-genera');
        var comp = S.comp;
        if (!b || !comp) return;
        /* 0069, giro 13: la scheda del riquadro non confermata (o cambiata dopo) →
           il verde dice che cosa fare, come «Leggi prima la foto» */
        var nome = comp.bloccoConferma ? comp.mancano
            : comp.attiva ? comp.etichetta : t('ci_genera_bloccato', 'Leggi prima la foto');
        var bloccato = !comp.pronta;
        var sp = b.querySelector('span');
        if (sp && sp.textContent !== nome) sp.textContent = nome;
        if (b.classList.contains('mn-card--mappa')) b.classList.remove('mn-card--mappa');
        if (b.classList.contains('ci-bloccato') !== bloccato) b.classList.toggle('ci-bloccato', bloccato);
        /* giro 13: bloccato per la conferma, il verde riceve comunque il clic (che
           porta in vista «Confermo la scheda»): la classe toglie il `pointer-events:
           none` di `ci-bloccato` — il clic lo ferma `_suClic`, in cattura */
        var perConferma = !!(bloccato && comp.bloccoConferma);
        if (b.classList.contains('ci-da-confermare') !== perConferma) b.classList.toggle('ci-da-confermare', perConferma);
        /* il glifo della mappa (git-merge) non vale: da una foto non nasce una mappa */
        var g = b.querySelector('svg, i[data-lucide]');
        var nomeG = g ? (g.getAttribute('data-lucide') || ((g.getAttribute('class') || '').match(/lucide-([a-z0-9-]+)/) || [])[1] || '') : '';
        if (g && nomeG === 'git-merge') {
            g.outerHTML = '<i data-lucide="package"></i>';
            if (window.safeCreateIcons) window.safeCreateIcons();
        }
        var tit;
        if (b.disabled) {
            /* il contesto (Chi/Cosa) manca: il motivo è di `aggiornaGate`, resta */
            var i = (b.title || '').indexOf(' — ');
            tit = nome + (i >= 0 ? b.title.slice(i) : '');
        } else {
            tit = nome + (bloccato && comp.mancano && comp.mancano !== nome ? ' — ' + comp.mancano : '');
        }
        if (b.title !== tit) b.title = tit;
        if (b.getAttribute('aria-label') !== tit) b.setAttribute('aria-label', tit);
        var ad = (b.disabled || bloccato) ? 'true' : 'false';
        if (b.getAttribute('aria-disabled') !== ad) b.setAttribute('aria-disabled', ad);
    }
    function _osservaVerde() {
        var b = document.getElementById('mn-genera');
        if (!b || S.osservatore || typeof MutationObserver === 'undefined') return;
        S.osservatore = new MutationObserver(function () { if (S.montato) _verde(); });
        S.osservatore.observe(b, { childList: true, subtree: true, characterData: true,
            attributes: true, attributeFilter: ['class', 'title', 'aria-label', 'aria-disabled', 'disabled'] });
    }

    /* Il clic sul verde, prima di chi lo ascolta nel bento (fase di cattura):
       · foto da leggere → non parte niente, e si dice perché (anche da tastiera:
         `pointer-events` non ferma Invio);
       · nessun materiale spuntato → il bento chiamerebbe `startGeneration`, cioè
         la mappa: con una foto si fa il dossier (decisione 2 di Giacomo). */
    function _suClic(e) {
        if (!S.montato || !S.comp) return;
        var b = e.target && e.target.closest ? e.target.closest('#mn-genera') : null;
        if (!b) return;
        /* Il CONTESTO prima di tutto (Giacomo, 01/10: il verde resta bloccato finché
           classe e materia non sono scelte, anche con la foto). Chi/Cosa li giudica
           `aggiornaGate` (mappai-costruisci-manifesto.js), che spegne il bottone con
           `disabled` + `mn-card--spento`: qui non si scavalca, si lascia il clic al
           suo ascolto, che dice il motivo. */
        if (b.disabled || b.classList.contains('mn-card--spento')) return;
        if (!S.comp.pronta) {
            e.preventDefault(); e.stopImmediatePropagation();
            toast(S.comp.mancano, 'warning');
            /* 0069, giro 13: la scheda da confermare — si porta in vista la conferma */
            if (S.comp.bloccoConferma && S.riquadro) {
                var dove = S.riquadro.querySelector('[data-ci="conferma"]') || S.riquadro.querySelector('[data-ci-stato]');
                if (dove && dove.scrollIntoView) dove.scrollIntoView({ block: 'center', behavior: 'smooth' });
            }
            return;
        }
        var P = window.MappAIPipeline;
        var soloMappa = false;
        try { soloMappa = !!(P && P._hasOutputNow && !P._hasOutputNow()); } catch (er) { soloMappa = false; }
        if (soloMappa && P._startFromModal) {
            e.preventDefault(); e.stopImmediatePropagation();
            P._startFromModal();
        }
    }

    /* ── la spunta «Manda la fonte all'allievo» ─────────────────────────────
       Con una foto SI NASCONDE (Giacomo, 01/10): la foto va in `Allegati/` comunque,
       e con una foto non può esserci un PDF (`fileAmmessi`). Si nasconde la sua
       etichetta e basta: il campo resta nel DOM, perché `_readConfig()` lo legge, e
       il suo valore non cambia — togliendo la foto torna com'era. */
    function _spunta(comp) {
        var cb = document.getElementById('mp-src-pdf');
        if (!cb) return;
        var lab = (cb.closest && cb.closest('label')) || cb.parentNode;
        if (!lab) return;
        if (comp && comp.spunta && comp.spunta.nascosta) {
            if (!S.spunta) {
                S.spunta = { el: lab, prima: lab.style.getPropertyValue('display'), prio: lab.style.getPropertyPriority('display') };
                lab.style.setProperty('display', 'none', 'important');
            }
        } else if (S.spunta) {
            if (S.spunta.prima) S.spunta.el.style.setProperty('display', S.spunta.prima, S.spunta.prio);
            else S.spunta.el.style.removeProperty('display');
            S.spunta = null;
        }
    }

    /* ── O FOTO O DOCUMENTI (Giacomo, 01/10) ─────────────────────────────────
       Il file entra in una fonte SOLO al `change` del suo `<input type=file>`
       (`onchange="window.handleFileUpload(this,'doc')"` / `handlePDFUpload`, scritti
       da `addSource` in app.js): prima la fonte ha `file: null`. Un ascolto sul
       documento in fase di CATTURA arriva prima dell'attributo `onchange` del campo:
       se il core rifiuta, si ferma la propagazione, si svuota il campo e si toglie
       la riga rimasta vuota (`removeSource`, la stessa strada del cestino) — una
       riga senza file direbbe che c'è qualcosa in coda, e non c'è.
       Vale anche a modalità iconografica spenta? No: è parte della modalità, e
       `'0'` deve restituire la schermata di prima (inv. 1). */
    function _suFile(e) {
        var inp = e.target;
        if (!inp || inp.tagName !== 'INPUT' || inp.type !== 'file') return;
        var id = inp.getAttribute('data-source-id');
        if (!id || !attivo() || !IC() || !IC().fileAmmessi) return;
        var src = _fonteDi(id);
        if (!src || (src.type !== 'doc' && src.type !== 'pdf')) return;
        var nomi = [];
        for (var i = 0; i < ((inp.files && inp.files.length) || 0); i++) nomi.push(inp.files[i].name);
        var esito = IC().fileAmmessi(_fonti(), nomi, id);
        if (esito.ok) {
            /* 01/10 (gate): la landing si aggiorna già quando la foto ENTRA, non solo
               alla conferma della scheda — `leggiImmagineSorgente` chiama
               `sincronizzaGenere` solo in fondo (app.js:1394). L'onchange del campo
               (`handleFileUpload`, app.js:1404) scrive `src.file` e `src.path` nella sua
               parte SINCRONA, prima del primo `await`: un giro dopo (`setTimeout 0`) la
               fonte c'è già. La foto risulta «in lettura» finché `sincronizzaGenere` non
               dice che la lettura è finita (confermata, annullata o fallita). */
            var V = window.MappAIVisioneCore;
            if (nomi.some(function (n) { return V && V.accetta && V.accetta(n); })) {
                S.inLettura[id] = true;
                setTimeout(function () { aggiorna({ daFile: true }); }, 0);
            }
            return;
        }
        e.stopImmediatePropagation();
        e.preventDefault();
        try { inp.value = ''; } catch (er) { }
        if (window.removeSource) { try { window.removeSource(id); } catch (er) { } }
        toast(esito.motivo, 'warning');
    }

    /* ── montaggio ───────────────────────────────────────────────────────────── */
    function _monta(m) {
        if (S.montato) return;
        var foto = document.createElement('div');
        foto.className = 'ci-card ci-card--foto';
        foto.id = 'ci-foto';
        var scheda = document.createElement('div');
        scheda.className = 'ci-card ci-card--scheda';
        scheda.id = 'ci-scheda';
        /* gli span sono quelli dei moduli che si nascondono: la griglia non si muove */
        foto.style.gridColumn = m.genere.style.gridColumn || 'span 1';
        scheda.style.gridColumn = m.opz.style.gridColumn || 'span 3';
        /* 0069, giro 4: con l'interruttore acceso le due card non entrano nel bento
           (restano staccate: nessuno le mostra) e al loro posto va il riquadro */
        S.modoRiquadro = _riquadroAcceso();
        if (S.modoRiquadro) {
            S.riquadro = _creaRiquadro();
            m.bento.insertBefore(S.riquadro, m.genere);
        } else {
            m.bento.insertBefore(foto, m.genere);
            m.bento.insertBefore(scheda, m.genere);
        }
        /* `display:none`, non svuotati: un modulo alto zero consuma comunque il gap
           della griglia (trappola 11) */
        S.nascosti = [m.genere, m.opz].map(function (el) {
            var prima = el.style.getPropertyValue('display');
            var prio = el.style.getPropertyPriority('display');
            el.style.setProperty('display', 'none', 'important');
            return { el: el, prima: prima, prio: prio };
        });
        scheda.addEventListener('change', _suCambio);
        scheda.addEventListener('keydown', _suTasto);
        scheda.addEventListener('click', _suAzione);
        S.foto = foto; S.scheda = scheda; S.montato = true;
        _osservaVerde();
    }
    function _smonta() {
        var c = S.comp;
        S.comp = null; S.firma = ''; S.motivo = ''; S.fotoDi = null;
        _spunta(null);
        _nascondiVoci([]);
        if (!S.montato) return;
        S.montato = false;
        _togliRiquadro();
        if (S.osservatore) { try { S.osservatore.disconnect(); } catch (e) { } S.osservatore = null; }
        [S.foto, S.scheda].forEach(function (el) { if (el && el.parentNode) el.parentNode.removeChild(el); });
        S.foto = null; S.scheda = null;
        S.nascosti.forEach(function (n) {
            if (n.prima) n.el.style.setProperty('display', n.prima, n.prio);
            else n.el.style.removeProperty('display');
        });
        S.nascosti = [];
        if (S.url) { try { URL.revokeObjectURL(S.url); } catch (e) { } S.url = null; S.urlDi = null; }
        var b = document.getElementById('mn-genera');
        if (b) b.classList.remove('ci-bloccato', 'ci-da-confermare');
        /* il verde torna quello di prima: lo ridipinge chi lo possiede */
        try { if (window.MappAICostruisci && window.MappAICostruisci.aggiornaGate) window.MappAICostruisci.aggiornaGate(); } catch (e) { }
        return c;
    }

    function _disegna(comp) {
        var firma = JSON.stringify(comp) + '\u0001' + S.motivo;
        if (firma === S.firma) return;
        S.firma = firma;
        _disegnaFoto(comp);
        S.scheda.innerHTML = IC().htmlScheda(comp, { motivo: S.motivo });
    }

    /* ── IL RIQUADRO DELLA SCHEDA (0069, ADR 0016 rev. 1) ─────────────────────
       Largo quattro colonne, al posto della riga della foto e del titolo (giro 4),
       prima della riga del giallo e del verde: la foto sopra i campi della
       scheda, e «Confermo la scheda», che registra la revisione APPROVATA sulla
       fonte (`src._confermaScheda`, `MappAIDossierFonteCore.registraConferma`).
       Al checkpoint della pipeline la revisione la legge `MappAIReview.checkpoint`:
       con la conferma valida dopo la generazione non c'è G1.
       Interruttore `mappai_dossier_fonte_scheda`, ACCESO di default (0088): lo
       spegne solo '0'; spento, la landing è quella dello 0067, al carattere.
       Il markup lo scrive il core di CREA (`htmlRiquadro`); qui si monta, si scrive
       nella scheda e si aggiorna lo stato. Un campo corretto dopo la conferma la fa
       decadere (il cancello risponde `stale_revision`), e lo stato lo dice. */
    function DF() { return window.MappAIDossierFonteCore; }
    function _riquadroAcceso() {
        try { return !!(DF() && DF().acceso(window.localStorage)); } catch (e) { return false; }
    }
    /* giro 7: la scheda è il ripiego di una risposta illeggibile? (regola del core) */
    function _fallita(sch) {
        try { return !!(DF() && typeof DF().letturaFallita === 'function' && DF().letturaFallita(sch)); } catch (e) { return false; }
    }
    /* ── giro 4 (Giacomo, 03/10): il riquadro PRENDE IL POSTO della riga 2 ────────
       Con l'interruttore acceso le due card dello 0067 (foto e scheda letta) non
       si montano: al loro posto, a tutta larghezza, il riquadro, che esiste già
       mentre la foto si legge. Dall'alto: titolo con «Aa», foto intera, campi
       (o la lettura in corso), materiali su due colonne, avvisi, stato, conferma.
       Le parti si aggiornano una per volta (`S.rq` ricorda che cosa c'è a
       schermo): quando la lettura finisce cambiano corpo, materiali e fondo, il
       titolo no — chi ci sta scrivendo non perde il fuoco. Spento: niente di
       tutto questo, `_monta` e `aggiorna` fanno quello che facevano. */
    function _nuovoRq() { return { id: null, fase: null, sch: null, foto: null, fotoRotta: false, corpo: '', fondo: '', prov: '' }; }
    function _creaRiquadro() {
        var r = document.createElement('div');
        r.className = 'ci-card ci-riquadro';
        r.id = 'ci-riquadro';
        r.style.gridColumn = '1 / -1';
        r.style.setProperty('--ci-zoom', String(S.zoom || 1));
        r.addEventListener('input', _suCampo);
        r.addEventListener('change', _suCampoFinito);
        r.addEventListener('click', _suClicRiquadro);
        r.addEventListener('keydown', _suTastoRiquadro);
        S.rq = _nuovoRq();
        return r;
    }
    function _urlFile(file) {
        if (S.urlDi !== file) {
            if (S.url) { try { URL.revokeObjectURL(S.url); } catch (e) { } }
            S.url = URL.createObjectURL(file); S.urlDi = file;
        }
        return S.url;
    }
    /* quale foto: la regola è del core (`fotoDelRiquadro`) */
    function _fotoDi(src, sch, f) {
        var file = !!(src && src.file && typeof Blob !== 'undefined' && src.file instanceof Blob && window.URL && URL.createObjectURL);
        var quale = IC().fotoDelRiquadro({ file: file, anteprima: !!(f && f.anteprima), fotoB64: !!(sch && sch.fotoB64) });
        if (quale === 'file') return _urlFile(src.file);
        if (quale === 'b64') return 'data:' + (sch.mime || 'image/jpeg') + ';base64,' + sch.fotoB64;
        return '';
    }
    function _togliRiquadro() {
        if (S.riquadro && S.riquadro.parentNode) S.riquadro.parentNode.removeChild(S.riquadro);
        S.riquadro = null; S.rq = _nuovoRq();
    }
    /* L'altezza delle textarea segue il testo: lo fa il CSS (`field-sizing:
       content`, Chromium ≥ 123, Electron 41); dove non c'è, `scrollHeight` preso
       col riquadro nel DOM, a ogni input e dopo ogni cambio di «Aa». */
    var _crescePerCss = (function () { try { return !!(window.CSS && CSS.supports && CSS.supports('field-sizing', 'content')); } catch (e) { return false; } })();
    function _adatta(ta) {
        if (_crescePerCss || !ta || ta.tagName !== 'TEXTAREA') return;
        ta.style.height = 'auto';
        ta.style.height = ta.scrollHeight + 'px';
    }
    function _adattaTutti() {
        if (_crescePerCss || !S.riquadro || !S.riquadro.isConnected) return;
        S.riquadro.querySelectorAll('textarea.ci-campo__testo').forEach(_adatta);
    }
    /* Le opzioni della composizione: spento, quelle di sempre; acceso, il riquadro e
       lo stato della conferma di ogni scheda (giro 18; prima solo della PRIMA), così
       la card non dice «confermata» mentre il riquadro dice «da confermare» (giro 3). */
    function _opzioniComposizione() {
        var o = { inLettura: Object.keys(S.inLettura) };
        if (!_riquadroAcceso()) return o;
        /* giro 7: una lettura fallita vale come una foto da leggere (core).
           Giro 18: lo stato della conferma di CIASCUNA scheda del lotto, non solo
           della prima — il riquadro mostra la prima non confermata e il verde si
           libera solo con tutte confermate (regola del core, `composizione`) */
        return IC().opzioniRiquadro(_fonti(), { inLettura: o.inLettura, mostrata: S.rq && S.rq.id,
            statoConferma: DF() ? DF().statoConferma : null, letturaFallita: _fallita });
    }
    /* La riga della fonte nell'elenco: `leggiImmagineSorgente` (app.js, fuori dal
       perimetro) scrive «scheda confermata» appena la scheda entra; acceso, la
       scheda entra NON confermata e la riga deve dire lo stato vero (testo del
       core, `rigaFonte`). Si riscrive solo se cambia. Spento: non si tocca. */
    function _righeFonti() {
        if (!_riquadroAcceso() || !DF() || !IC().rigaFonte) return;
        _fonti().forEach(function (x) {
            if (!x || !x._scheda || typeof x._scheda !== 'object') return;
            var el = document.getElementById('status-' + x.id);
            if (!el) return;
            var stato = _fallita(x._scheda) ? 'lettura_fallita' : DF().statoConferma(x._scheda, x._confermaScheda);
            var r = IC().rigaFonte(stato, (x.file && x.file.name) || x._scheda.nomeFile || '');
            var cls = 'text-[10px] mt-1 font-bold ' + (r.tono === 'ok' ? 'text-emerald-400' : 'text-amber-500');
            if (el.getAttribute('data-ci-riga') === r.testo && el.className === cls) return;
            el.className = cls;
            el.setAttribute('data-ci-riga', r.testo);
            el.innerHTML = '<i data-lucide="' + (r.tono === 'ok' ? 'check' : 'alert-circle') + '" class="w-3 h-3 inline"></i> ' + IC().esc(r.testo);
            if (window.safeCreateIcons) window.safeCreateIcons();
        });
    }
    /* Il fondo (avvisi, frase di stato, conferma): si riscrive solo se cambia, e
       la conferma che aveva il fuoco lo riprende. */
    function _disegnaFondo(comp) {
        if (!S.riquadro || !comp || !comp.fonte) return;
        var f = comp.fonte, src = _fonteDi(f.id), sch = S.rq.sch;
        var fase = S.rq.fase;
        var stato = (sch && DF()) ? DF().statoConferma(sch, src && src._confermaScheda) : 'da_confermare';
        /* giro 18: il piede col lotto (conto delle confermate, foto da leggere) è del core */
        var html = IC().htmlPiedeDelLotto(comp, { fase: fase, stato: stato, nome: f.nome, foto: !!S.rq.foto && !S.rq.fotoRotta });
        if (html === S.rq.fondo) return;
        var host = S.riquadro.querySelector('.ci-riquadro__fondo');
        if (!host) return;
        var aveva = document.activeElement && host.contains(document.activeElement);
        host.innerHTML = html; S.rq.fondo = html;
        if (aveva) { var b = host.querySelector('[data-ci="conferma"]'); if (b && !b.disabled) b.focus(); }
    }
    function _statoRiquadro() {
        if (!S.riquadro || !S.montato || !IC()) return;
        S.comp = IC().composizione(_fonti(), _opzioniComposizione());
        /* giro 18: confermata una scheda del lotto, il riquadro passa alla prossima
           da confermare, con la SUA foto sopra i suoi campi; il fuoco va al titolo */
        if (S.modoRiquadro && S.comp.fonte && S.comp.fonte.id !== S.rq.id) {
            var aveva = document.activeElement && S.riquadro.contains(document.activeElement);
            _disegnaRiquadro(S.comp);
            var ti = aveva ? S.riquadro.querySelector('[data-ci-campo="titolo"]') : null;
            if (ti) ti.focus();
        } else _disegnaFondo(S.comp);
        _righeFonti();
        /* giro 13: il verde segue la conferma, senza ricaricare */
        _verde();
    }
    function _disegnaRiquadro(comp) {
        if (!S.modoRiquadro || !S.riquadro || !comp || !comp.fonte) return;
        var f = comp.fonte, src = _fonteDi(f.id);
        var sch = (src && src._scheda && typeof src._scheda === 'object') ? src._scheda : null;
        var leggendo = !!S.inLettura[f.id] || (comp.daLeggere || []).some(function (d) { return d.id === f.id && d.inLettura; });
        var fallita = !!(sch && _fallita(sch));
        var fase = IC().faseRiquadro({ scheda: sch, inLettura: leggendo, fallita: fallita });
        var testa = S.riquadro.querySelector('.ci-rq-testa');
        /* lo scheletro, una volta per fonte */
        if (S.rq.id !== f.id || !testa) {
            S.rq = _nuovoRq();
            S.rq.id = f.id;
            S.rq.prov = (window.MappAIVisioneCore && window.MappAIVisioneCore.titoloDaNome) ? window.MappAIVisioneCore.titoloDaNome(f.nome) : f.nome;
            /* giro 18: lo scheletro (e il suo ordine) è del core, una fonte sola */
            S.riquadro.innerHTML = IC().scheletroRiquadro(sch ? sch.titolo : S.rq.prov, S.zoom || 1);
        }
        /* la lettura è finita: nel campo del titolo arriva quello dell'AI, se il
           docente non ne ha scritto uno suo nel frattempo (regola del core) */
        var campoTitolo = S.riquadro.querySelector('[data-ci-campo="titolo"]');
        if (fase === 'letta' && sch !== S.rq.sch && S.rq.fase && S.rq.fase !== 'letta' && campoTitolo) {
            var nuovo = IC().titoloDopoLettura({ provvisorio: S.rq.prov, scritto: campoTitolo.value,
                dallAI: sch.identita && sch.identita.titolo });
            sch.titolo = nuovo;
            if (campoTitolo.value !== nuovo) campoTitolo.value = nuovo;
        }
        /* la foto: cambia solo se cambia l'indirizzo */
        var foto = _fotoDi(src, sch, f);
        if (foto !== S.rq.foto) {
            S.rq.foto = foto; S.rq.fotoRotta = false;
            var hf = S.riquadro.querySelector('.ci-riquadro__foto');
            if (hf) hf.innerHTML = IC().htmlRiquadroFoto(foto, { alt: (sch && sch.titolo) || S.rq.prov, formato: foto ? '' : f.formato });
            _guardaFoto();
        }
        /* il corpo e i materiali: i campi quando c'è la scheda, altrimenti la lettura */
        var hc = S.riquadro.querySelector('.ci-riquadro__campi'), hm = S.riquadro.querySelector('[data-ci-materiali]');
        if (fase === 'letta') {
            if (sch !== S.rq.sch || S.rq.fase !== 'letta') {
                if (hc) hc.innerHTML = IC().htmlRiquadroCampi(sch);
                S.rq.corpo = '';
                var V = window.MappAIVisione;
                if (hm && V && typeof V.montaOpzioni === 'function') {
                    try { V.montaOpzioni(hm, sch); } catch (e) { console.warn('[CREA] materiali del riquadro non montati:', e && e.message); }
                }
            }
        } else {
            var corpo = IC().htmlRiquadroLettura({ fase: fase, nome: f.nome, mancano: comp.mancano, motivo: S.motivo,
                grezzo: fallita ? String((sch.osservazione && sch.osservazione.descrizione) || '') : '' });
            if (corpo !== S.rq.corpo || S.rq.fase === 'letta') {
                if (hc) hc.innerHTML = corpo;
                if (hm) hm.innerHTML = '';
                S.rq.corpo = corpo;
            }
        }
        S.rq.fase = fase; S.rq.sch = sch;
        _disegnaFondo(comp);
        _adattaTutti();
    }
    /* «Aa»: ×1 → ×1,25 → ×1,5 → ×1 (giro 5; il ciclo è del core). A schermo solo
       «Aa», il fattore nell'`aria-label`. Una custom property sul
       riquadro, letta in `calc()` SOLO dalle textarea dei blocchi (Giacomo, 03/10:
       «basta ingrandire solo testi delle descrizioni modificabili»): titolo,
       intestazioni, etichette e opzioni restano al loro corpo. Dopo ogni cambio
       le altezze si ricalcolano. Non si ricorda fra le sedute. */
    function _zoom(b) {
        S.zoom = IC().zoomSuccessivo(S.zoom || 1);
        S.riquadro.style.setProperty('--ci-zoom', String(S.zoom));
        b.textContent = IC().etichettaZoom(S.zoom);
        b.setAttribute('aria-pressed', S.zoom > 1 ? 'true' : 'false');
        b.setAttribute('aria-label', IC().ariaZoom(S.zoom));
        _adattaTutti();
    }
    function _suClicRiquadro(e) {
        var b = e.target && e.target.closest ? e.target.closest('[data-ci]') : null;
        if (!b || b.tagName !== 'BUTTON') return;
        var a = b.getAttribute('data-ci');
        if (a === 'zoom') { e.preventDefault(); _zoom(b); return; }
        if (a === 'leggi') {
            /* giro 7, «Leggi di nuovo»: la scheda fallita se ne va, e la foto torna
               una foto da leggere — poi la strada di sempre di «Leggi la foto» */
            /* giro 18: anche dal piede, quando la foto fallita è un'altra del lotto
               (`_suAzione` legge la prima da leggere, `daLeggere[0]`) */
            var dl = S.comp && S.comp.daLeggere && S.comp.daLeggere[0];
            var daRifare = S.rq.fase === 'fallita' ? S.rq.id : (dl && dl.fallita ? dl.id : null);
            if (daRifare != null) {
                var src = _fonteDi(daRifare);
                if (src) { src._scheda = null; delete src._confermaScheda; }
                S.comp = IC().composizione(_fonti(), _opzioniComposizione());
            }
            _suAzione(e);
            return;
        }
        if (a === 'conferma') _suConferma(e);
    }
    /* Il riquadro sta dentro `#setup-form`: Invio nel titolo lo invierebbe, cioè
       `startGeneration` — una mappa dalla foto. Invio conferma il titolo e basta. */
    function _suTastoRiquadro(e) {
        if (e.key !== 'Enter') return;
        var el = e.target;
        if (!el || el.tagName !== 'INPUT' || el.getAttribute('data-ci-campo') !== 'titolo') return;
        e.preventDefault();
        el.blur();
    }
    /* La foto deve essere VISTA, non solo presente nel markup (ADR 0016): un
       `<img>` che non si decodifica (fotoB64 vuoto, un file che il browser non
       legge) spegne la conferma e lo dice al posto della foto. */
    function _fotoVista() {
        var img = S.riquadro && S.riquadro.querySelector('.ci-riquadro__foto img');
        return !!(img && img.complete && img.naturalWidth > 0);
    }
    function _guardaFoto() {
        var img = S.riquadro && S.riquadro.querySelector('.ci-riquadro__foto img');
        if (!img) return;
        var rotta = function () {
            if (!S.riquadro || !S.riquadro.contains(img)) return;
            var p = document.createElement('p');
            p.className = 'ci-riquadro__senza';
            p.setAttribute('role', 'status');
            /* giro 18: «Rileggi la foto» non ha un gesto qui (la scheda è letta): resta caricarla di nuovo */
            p.textContent = t('ci_rq_foto_rotta', 'La foto non si apre: senza la foto davanti la scheda non si conferma. Caricala di nuovo.');
            if (img.parentNode) img.parentNode.replaceChild(p, img);
            S.rq.fotoRotta = true;
            var b = S.riquadro.querySelector('[data-ci="conferma"]');
            if (b) { b.disabled = true; b.setAttribute('aria-disabled', 'true'); }
            S.rq.fondo = '';   /* il prossimo fondo lo ridisegna già spento */
        };
        img.addEventListener('error', rotta);
        if (img.complete && !(img.naturalWidth > 0)) rotta();
    }
    /* Ogni battuta scrive nella scheda: è la scheda che diventerà il dossier
       (`config.dossier`), e la conferma si giudica su di lei. */
    function _suCampo(e) {
        var el = e.target;
        var k = el && el.getAttribute ? el.getAttribute('data-ci-campo') : null;
        if (!k) return;
        /* non è una voce del bento: chi ascolta il bento (stima, memoria delle
           scelte, sincronizzazione) non ha niente da fare con lei */
        e.stopPropagation();
        _adatta(el);
        var x = _schedaPrima();
        /* mentre la foto si legge la scheda non c'è: il titolo scritto resta nel
           campo, e quando la lettura finisce lo legge `titoloDopoLettura` */
        if (!x || x.sch !== S.rq.sch || !DF()) return;
        /* solo il CONTENUTO si scrive qui (titolo e campi): le scelte dei materiali
           le scrive `montaOpzioni`, e non toccano la conferma (core, giro 3) */
        if (DF().campoDelRiquadro(k) !== 'contenuto') return;
        var v = String(el.value == null ? '' : el.value);
        if (k === 'titolo') {
            /* vuoto non si scrive mentre si batte: a campo lasciato torna l'ultimo buono */
            if (v.trim()) x.sch.titolo = IC().titoloCorretto(v, x.sch.titolo);
            _statoRiquadro();
            return;
        }
        var pz = k.split('.');
        if (!x.sch[pz[0]] || typeof x.sch[pz[0]] !== 'object') x.sch[pz[0]] = {};
        x.sch[pz[0]][pz[1]] = v;
        _statoRiquadro();
    }
    /* A campo lasciato si ridisegna la card del titolo (identità e parti), non il
       riquadro: il fuoco resta dov'è. */
    function _suCampoFinito(e) {
        if (!e.target || !e.target.getAttribute || !e.target.getAttribute('data-ci-campo') || !S.montato) return;
        e.stopPropagation();
        if (e.target.getAttribute('data-ci-campo') === 'titolo') {
            /* la stessa regola del campo del titolo dello 0067: vuoto si rifiuta */
            var x = _schedaPrima(), el = e.target;
            if (x && x.sch === S.rq.sch) {
                var vuoto = !String(el.value || '').trim();
                var nuovo = IC().titoloCorretto(el.value, x.sch.titolo);
                if (vuoto) toast(t('ci_titolo_vuoto', 'Il titolo non può restare vuoto: torna quello di prima.'), 'warning');
                if (el.value !== nuovo) el.value = nuovo;
                x.sch.titolo = nuovo;
                _statoRiquadro();
            }
        }
        /* giro 4: la card della riga 2 non c'è più; si aggiornano il fondo del
           riquadro (stato e parti) e il verde */
        _statoRiquadro();
        _verde();
    }
    function _suConferma(e) {
        var b = e.target && e.target.closest ? e.target.closest('[data-ci="conferma"]') : null;
        if (!b) return;
        e.preventDefault();
        if (b.disabled) return;
        var x = _schedaPrima();
        if (!x || !DF() || x.sch !== S.rq.sch) return;
        /* la foto deve essere NEL riquadro, sopra i campi, e decodificata: si
           guarda l'immagine vista (`complete` e larghezza vera), non il markup */
        var conFoto = !!(S.rq.foto && !S.rq.fotoRotta && _fotoVista());
        /* la regola è del core (giro 3): foto vista, e almeno le righe che chiedeva
           «Usa questa fonte» (`schedaPronta`) */
        var pc = DF().puoConfermare ? DF().puoConfermare(x.sch, { fotoVista: conFoto }) : { ok: conFoto, motivo: 'foto' };
        if (!pc.ok) {
            toast(pc.motivo === 'poco'
                ? t('vs_troppo_poco', 'Serve almeno qualche riga di analisi: è il materiale da cui nascono i documenti.')
                : t('ci_rq_non_confermata', 'La scheda non si conferma: serve la foto vista sopra i campi e almeno un blocco scritto.'), 'warning');
            return;
        }
        var r = DF().registraConferma(x.sch, { conFoto: conFoto, now: new Date().toISOString() });
        if (!r) { toast(t('ci_rq_non_confermata', 'La scheda non si conferma: serve la foto vista sopra i campi e almeno un blocco scritto.'), 'warning'); return; }
        x.src._confermaScheda = r;
        _statoRiquadro();
        toast(t('ci_rq_ok', 'Scheda confermata: è la fonte del dossier.'), 'success');
    }

    /* Ricalcola dai DATI a ogni chiamata (niente stato da tenere allineato) e dice
       se il guscio governa la schermata: `sincronizzaGenere` lo chiede per sapere
       se sbiadire MM/KG (strada di prima) o lasciarli al guscio. */
    /* LE ULTIME SCELTE DELLA SCHEDA (01/10): ogni scheda confermata che compare fra
       le fonti per la prima volta — al caricamento o dopo «Rivedi» — scrive le sue
       opzioni come punto di partenza della prossima (`MappAIVisione.ricordaOpzioni`,
       che possiede la chiave). Una scheda già vista non riscrive: vince l'ultima
       confermata. Non dipende dall'interruttore: è una qualità della scheda, che
       si apre uguale con la modalità accesa o spenta. */
    var _viste = (typeof WeakSet !== 'undefined') ? new WeakSet() : null;
    function _ricorda() {
        var V = window.MappAIVisione;
        if (!_viste || !V || !V.ricordaOpzioni) return;
        _fonti().forEach(function (x) {
            var sch = x && x._scheda;
            if (!sch || typeof sch !== 'object' || !sch.opzioni || _viste.has(sch)) return;
            _viste.add(sch);
            V.ricordaOpzioni(sch.opzioni);
        });
    }

    /* ── CON UNA FOTO, SOLO LE VOCI CHE VALGONO (01/10, gate) ─────────────────────
       Quali voci non valgono lo dice il core (`comp.nascondi`); qui si trova il loro
       posto nel bento e lo si nasconde: il RIQUADRO intero quando tutte le sue voci
       sono da nascondere, la sola riga della voce quando il riquadro ne ha di valide.
       Il riquadro si cerca da ciò che contiene, non dalla composizione: l'Officina
       può averla cambiata. Uno strumento non montato nel bento si nasconde dove sta.
       Si confronta col giro prima (si tocca solo ciò che cambia) e tutto torna quando
       la foto se ne va o l'interruttore va a '0'. */
    function _postoDi(v, bento) {
        if (v.tipo === 'strumento') {
            var posti = bento.querySelectorAll('.mn-str');
            for (var i = 0; i < posti.length; i++) {
                var p = posti[i];
                if ((v.sposta && p.getAttribute('data-sposta') === v.sposta) ||
                    (v.raccoglie && p.getAttribute('data-raccoglie') === v.raccoglie)) {
                    return { riga: p, card: p.closest('#mn-bento > .mn-card') };
                }
            }
            if (!v.sposta) return null;
            var fuori = null;
            try { fuori = document.querySelector(v.sposta); } catch (e) { fuori = null; }
            return (fuori && !bento.contains(fuori)) ? { riga: fuori, card: null } : null;
        }
        var el = document.getElementById(v.id);
        if (!el || !bento.contains(el)) return null;
        var card = el.closest('#mn-bento > .mn-card');
        if (!card) return null;                       /* i master nascosti del renderer */
        return { riga: el.closest('.mn-op, .mn-campo, .mn-radio') || el, card: card };
    }
    function _nascondiVoci(ids) {
        var B = window.MappAIBento, bento = document.getElementById('mn-bento');
        var bersagli = [];
        if (B && B.VOCI && bento && ids.length) {
            var perCard = new Map();
            B.VOCI.forEach(function (v) {
                var p = _postoDi(v, bento);
                if (!p) return;
                var no = ids.indexOf(v.id) >= 0;
                if (!p.card) { if (no) bersagli.push(p.riga); return; }
                if (!perCard.has(p.card)) perCard.set(p.card, { tutte: 0, righe: [] });
                var c = perCard.get(p.card);
                c.tutte++;
                if (no) c.righe.push(p.riga);
            });
            perCard.forEach(function (c, card) {
                if (!c.righe.length) return;
                if (c.righe.length === c.tutte) bersagli.push(card);
                else bersagli = bersagli.concat(c.righe);
            });
        }
        /* i due moduli della mappa li ha già nascosti `_monta`: non si toccano due volte */
        var gia = S.nascosti.map(function (n) { return n.el; });
        bersagli = bersagli.filter(function (el) { return gia.indexOf(el) < 0; });
        S.vociNascoste = S.vociNascoste.filter(function (n) {
            if (bersagli.indexOf(n.el) >= 0) return true;
            if (n.prima) n.el.style.setProperty('display', n.prima, n.prio);
            else n.el.style.removeProperty('display');
            return false;
        });
        bersagli.forEach(function (el) {
            if (S.vociNascoste.some(function (n) { return n.el === el; })) return;
            S.vociNascoste.push({ el: el, prima: el.style.getPropertyValue('display'), prio: el.style.getPropertyPriority('display') });
            el.style.setProperty('display', 'none', 'important');
        });
    }

    /* (La riga «Con una foto i materiali si scelgono nella scheda» della vista estesa
       è stata tolta il 01/10 sera: con la decisione 9 il riquadro «Output automatici»
       sparisce intero con una foto, e non resta un box di materiali vicino a cui
       spiegarlo — le scelte stanno tutte nella scheda, che si apre da «Rivedi».) */

    /* `opts.daFile`: chiamata dal `change` del campo (la foto è appena entrata).
       Senza `opts` chiama `sincronizzaGenere`, cioè la lettura è finita: nessuna foto
       è più «in lettura». */
    function aggiorna(opts) {
        var C = IC();
        if (!(opts && opts.daFile)) S.inLettura = {};
        try { _ricorda(); } catch (e) { }
        if (!attivo() || !C || !C.composizione) { _smonta(); return false; }
        var comp = C.composizione(_fonti(), _opzioniComposizione());
        if (!comp.attiva && !comp.daLeggere.length) { _smonta(); return false; }
        /* l'interruttore cambiato a schermo montato: si rismonta nell'altra forma */
        if (S.montato && S.modoRiquadro !== _riquadroAcceso()) _smonta();
        var m = S.montato ? { ok: true } : _moduli();
        if (!m) { _smonta(); return false; }
        if (!S.montato) _monta(m);
        S.comp = comp;
        S.motivo = _motivo(comp);
        if (S.modoRiquadro) _disegnaRiquadro(comp);
        else _disegna(comp);
        _righeFonti();
        _spunta(comp);
        _nascondiVoci(comp.nascondi || []);
        _verde();
        try { if (window.MappAIRidotta && window.MappAIRidotta.aggiorna) window.MappAIRidotta.aggiorna(); } catch (e) { }
        return true;
    }
    function _risincronizza() {
        var V = window.MappAIVisione;
        if (V && V.sincronizzaGenere) V.sincronizzaGenere(); else aggiorna();
    }

    /* ── gli eventi della card della scheda ───────────────────────────────────── */
    function _schedaPrima() {
        var f = S.comp && S.comp.fonte;
        var src = f ? _fonteDi(f.id) : null;
        return (src && src._scheda) ? { src: src, sch: src._scheda } : null;
    }
    function _suCambio(e) {
        var el = e.target;
        if (!el || el.getAttribute('data-ci') !== 'titolo') return;
        var x = _schedaPrima();
        if (!x) return;
        var vuoto = !String(el.value || '').trim();
        var nuovo = IC().titoloCorretto(el.value, x.sch.titolo);
        if (vuoto) toast(t('ci_titolo_vuoto', 'Il titolo non può restare vuoto: torna quello di prima.'), 'warning');
        if (el.value !== nuovo) el.value = nuovo;
        x.sch.titolo = nuovo;            /* l'unico scrittore: diventa il nome del dossier */
        /* il campo mostra già il valore giusto: si aggiorna la firma senza ridisegnare,
           o il campo perderebbe il fuoco */
        S.comp = IC().composizione(_fonti());
        S.firma = JSON.stringify(S.comp) + '\u0001' + S.motivo;
        /* il titolo è la radice del dossier: cambiato dopo la conferma, la fa decadere (0069) */
        _statoRiquadro();
    }
    /* Il campo sta dentro `#setup-form`: Invio lo invierebbe, cioè `startGeneration`
       — una mappa dalla foto. Invio conferma il titolo e basta. */
    function _suTasto(e) {
        if (e.key !== 'Enter') return;
        var el = e.target;
        if (!el || el.getAttribute('data-ci') !== 'titolo') return;
        e.preventDefault();
        el.blur();
    }
    function _suAzione(e) {
        var b = e.target && e.target.closest ? e.target.closest('[data-ci]') : null;
        if (!b || b.tagName !== 'BUTTON') return;
        var a = b.getAttribute('data-ci');
        var V = window.MappAIVisione;
        if (a === 'rivedi') {
            /* con il riquadro nessun gesto riapre la superficie in CREA (giro 3):
               il bottone non c'è, e questa è la rete se ci fosse */
            if (_riquadroAcceso()) return;
            var x = _schedaPrima();
            if (!x || !V || !V.montaSuperficie) return;
            V.montaSuperficie(x.sch, { modo: 'crea' }).then(function (f) {
                if (!f || f.uscita) return;
                if (f.__scarta) { if (window.removeSource) window.removeSource(x.src.id); else _risincronizza(); return; }
                x.src._scheda = f;
                _risincronizza();
            });
        } else if (a === 'leggi') {
            var d = S.comp && S.comp.daLeggere && S.comp.daLeggere[0];
            var src = d ? _fonteDi(d.id) : null;
            if (!src || !src.file || !V) return;
            /* il provider la rifiuterebbe: il motivo è già a schermo, si ridice */
            var male = V.provaProvider ? V.provaProvider() : '';
            if (male) { S.motivo = _motivo(S.comp); S.firma = ''; aggiorna(); toast(S.motivo || male, 'warning'); return; }
            /* col riquadro (giro 4) la foto è «in lettura» da subito: il riquadro lo
               dice al posto dei campi, e la conferma resta spenta. Annullata o
               fallita, `sincronizzaGenere` la riporta a «Leggi prima la foto». */
            if (S.modoRiquadro) { S.inLettura[src.id] = true; aggiorna({ daFile: true }); }
            var statusEl = document.getElementById('status-' + src.id);
            if (statusEl && window.leggiImmagineSorgente) {
                /* la stessa strada del caricamento: scrive `_scheda`, la riga della
                   fonte e chiama `sincronizzaGenere` */
                window.leggiImmagineSorgente(src, src.file, statusEl);
            } else if (V.nuovaScheda) {
                V.nuovaScheda(src.file).then(function (sch) {
                    if (sch && sch.__scarta) { if (window.removeSource) window.removeSource(src.id); return; }
                    if (sch) src._scheda = sch;
                    _risincronizza();
                });
            }
        }
    }

    document.addEventListener('click', _suClic, true);
    document.addEventListener('change', _suFile, true);

    window.MappAICreaIconografica = {
        attivo: attivo,
        aggiorna: aggiorna,
        /* 0069, giro 3: la visione chiede se il riquadro ha un posto dove montarsi
           prima di saltare la superficie (`MappAIDossierFonteCore.soloRiquadro`) */
        puoMontare: function () { try { return !!(attivo() && IC() && (S.montato || _moduli())); } catch (e) { return false; } },
        /* per la console e per chi prova: che cosa il guscio sta mostrando */
        stato: function () { return { montato: S.montato, comp: S.comp, motivo: S.motivo }; }
    };
    console.log('[MappAI] mappai-crea-iconografica.js caricato ✓');
})();
