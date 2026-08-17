/* mappai-lavori.js — IL LAVORO IN CORSO, NELLA BARRA IN ALTO (14/8/26)
 *
 * Il difetto da cui nasce (Giacomo): si preme «Genera» su un materiale — le
 * domande aperte, per dire — e non succede niente di visibile. Il velo di
 * lavorazione esiste, ma dal 13/8 vive DENTRO l'area di CREA: chi ha lanciato
 * la generazione e poi è andato in un'altra sezione non ha più un segno che
 * dica «sto ancora lavorando», e la stessa cosa vale per una mappa MM o KG
 * lanciata e lasciata andare.
 *
 * Qui c'è UN indicatore solo, nella barra in alto: lo spinner di MappAI —
 * quello vero del velo, senza le didascalie — con accanto il NOME di ciò che
 * si sta creando. Geometria dettata da Giacomo: taglia del bottone della
 * Cabina e stesso margine, ma **dal lato opposto** — la Cabina sta a sinistra
 * (28px dal bordo), quindi lo spinner sta a destra, a 28px dal bordo.
 *
 * ⚠️ Si mostra SOLO dove c'è il bottone della Cabina: la landing (Crea ·
 * Elabora · Insegna) e la testata delle console. Sulla mappa aperta no — lì
 * non c'è quella barra, e un pallino che galleggia sul canvas sarebbe un
 * pezzo di interfaccia che non appartiene a nessuna barra.
 *
 * L'aggancio è UNO: `window.showLoadingOverlay`, che è il collo di bottiglia
 * di ogni lavorazione lunga dell'app (una ventina di moduli lo chiamano). Chi
 * conosce il nome di ciò che sta creando lo passa come quarto argomento; chi
 * non lo passa ricade sul titolo del progetto. Così un modulo nuovo che mostra
 * il velo entra nell'indicatore senza doverlo sapere.
 */
(function () {
    'use strict';

    var MARGINE = 28;      /* = il margine della Cabina, dall'altro lato */
    var TAGLIA = 43;       /* = la taglia del bottone della Cabina */
    var CIMA = 11;         /* = il suo scarto dall'alto: le due barre sono alte 65 */
    var ATTESA = 600;      /* sotto questa soglia il lavoro non si annuncia */

    var lavori = [];       /* [{id, nome, da}] — il più recente in coda */
    var seq = 0;
    var el = null, elNome = null, elPiu = null;
    var timer = null;

    function t(k, f) { return window.t ? window.t(k, f) : f; }

    /* Lo spinner È quello del velo (`#loading-overlay`), stessa geometria e
       stesse animazioni: un secondo disegno «ispirato» diventerebbe un altro
       marchio al primo ritocco. Qui senza titolo né didascalia. */
    var SPINNER = '' +
        '<svg viewBox="0 0 200 200" class="mn-lav__svg" aria-hidden="true" focusable="false">' +
        '<g class="mn-lav__ramo mn-lav__r1"><line x1="100" y1="100" x2="100" y2="30" stroke="#475569" stroke-width="6"/><circle cx="100" cy="30" r="15.9" fill="#2A8EFC"/></g>' +
        '<g class="mn-lav__ramo mn-lav__r2"><line x1="100" y1="100" x2="166.5" y2="78.4" stroke="#475569" stroke-width="6"/><circle cx="166.5" cy="78.4" r="15.9" fill="#3BCC42"/></g>' +
        '<g class="mn-lav__ramo mn-lav__r3"><line x1="100" y1="100" x2="141.1" y2="156.6" stroke="#475569" stroke-width="6"/><circle cx="141.1" cy="156.6" r="15.9" fill="#FF8C00"/></g>' +
        '<g class="mn-lav__ramo mn-lav__r4"><line x1="100" y1="100" x2="58.9" y2="156.6" stroke="#475569" stroke-width="6"/><circle cx="58.9" cy="156.6" r="15.9" fill="#FF1493"/></g>' +
        '<g class="mn-lav__ramo mn-lav__r5"><line x1="100" y1="100" x2="33.5" y2="78.4" stroke="#475569" stroke-width="6"/><circle cx="33.5" cy="78.4" r="15.9" fill="#FFD700"/></g>' +
        '<circle cx="100" cy="100" r="24" fill="#0f172a" class="mn-lav__cuore"/>' +
        '</svg>';

    /* ⚠️ Le linee dello spinner grande sono spesse 2 su 200: a 43px sparirebbero.
       Qui valgono 6 — è la stessa figura, letta da lontano. */
    var CSS = '' +
        '#mn-lavori{position:fixed;top:' + CIMA + 'px;right:' + MARGINE + 'px;height:' + TAGLIA + 'px;' +
        'display:none;align-items:center;gap:10px;pointer-events:none}' +
        '#mn-lavori.is-on{display:flex}' +
        '.mn-lav__n{font:700 12px "Space Mono",var(--emoji-font),monospace;color:#404040;' +
        'max-width:38vw;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:right}' +
        '.mn-lav__piu{font:700 11px "Space Mono",monospace;color:#fff;background:#4f46e5;' +
        'border-radius:999px;padding:1px 7px;display:none}' +
        '.mn-lav__piu.is-on{display:inline-block}' +
        /* ⚠️ Il contenitore NON riceve il puntatore (`pointer-events:none`): è
           largo quanto il nome e starebbe sopra qualunque comando gli capiti
           sotto, invisibile. Lo ricevono i due pezzi DIPINTI, che è l'unica
           superficie che si vede — e serve, o il fumetto con l'elenco dei
           lavori non si aprirebbe mai. */
        '.mn-lav__n,.mn-lav__s{pointer-events:auto}' +
        '.mn-lav__s{width:' + TAGLIA + 'px;height:' + TAGLIA + 'px;flex:0 0 auto;display:block}' +
        '.mn-lav__svg{width:100%;height:100%;overflow:visible}' +
        '@keyframes mn-lav-respiro{0%,100%{transform:scale(.95)}50%{transform:scale(1.10)}}' +
        '@keyframes mn-lav-fiore{0%{transform:rotate(0) scale(1)}4%{transform:rotate(3deg) scale(1.05)}' +
        '10%{transform:rotate(0) scale(1.12)}16%{transform:rotate(-2deg) scale(1.05)}' +
        '20%{transform:rotate(0) scale(1)}100%{transform:rotate(0) scale(1)}}' +
        '.mn-lav__cuore{transform-origin:100px 100px;animation:mn-lav-respiro 3s ease-in-out infinite}' +
        '.mn-lav__ramo{transform-origin:100px 100px;animation:mn-lav-fiore 2.5s linear infinite}' +
        '.mn-lav__r1{animation-delay:0s}.mn-lav__r3{animation-delay:.5s}.mn-lav__r5{animation-delay:1s}' +
        '.mn-lav__r2{animation-delay:1.5s}.mn-lav__r4{animation-delay:2s}' +
        '@media (prefers-reduced-motion: reduce){' +
        '.mn-lav__cuore,.mn-lav__ramo{animation:none}}';

    function monta() {
        if (el) return el;
        var st = document.createElement('style');
        st.id = 'mn-lavori-css';
        st.textContent = CSS;
        document.head.appendChild(st);

        el = document.createElement('div');
        el.id = 'mn-lavori';
        /* `status` e non `alert`: è un avanzamento, non un allarme — e
           `aria-live=polite` non interrompe chi sta leggendo altro. */
        el.setAttribute('role', 'status');
        el.setAttribute('aria-live', 'polite');
        el.innerHTML = '<span class="mn-lav__n"></span><span class="mn-lav__piu"></span>' +
            '<span class="mn-lav__s">' + SPINNER + '</span>';
        elNome = el.querySelector('.mn-lav__n');
        elPiu = el.querySelector('.mn-lav__piu');
        document.body.appendChild(el);
        return el;
    }

    /* La barra con la Cabina c'è? Landing a schermo, oppure una console aperta.
       Sulla mappa nuda no: lì quella barra non esiste. */
    function barraCPosto() {
        try {
            if (document.querySelector('.mm-box--console')) return true;
            var lv = document.getElementById('landing-view');
            if (!lv) return false;
            if (lv.classList.contains('hidden')) return false;
            return getComputedStyle(lv).display !== 'none';
        } catch (e) { return false; }
    }

    /* Il piano non si scrive nel foglio: le console lo prendono a runtime
       (`prossimoZ` sale di 100 a ogni finestra). Si legge quello vero e ci si
       mette un gradino sopra — stessa cura del rail delle modalità. */
    function alza() {
        var z = 60;
        document.querySelectorAll('.mm-overlay').forEach(function (o) {
            var v = parseInt(getComputedStyle(o).zIndex, 10);
            if (isFinite(v) && v >= z) z = v + 1;
        });
        el.style.zIndex = String(z);
    }

    function disegna() {
        monta();
        var n = lavori.length;
        var ok = n > 0 && barraCPosto();
        el.classList.toggle('is-on', ok);
        if (!ok) return;
        var ultimo = lavori[n - 1];
        elNome.textContent = ultimo.nome;
        elPiu.textContent = '+' + (n - 1);
        elPiu.classList.toggle('is-on', n > 1);
        el.setAttribute('title', lavori.map(function (l) { return l.nome; }).join('\n'));
        el.setAttribute('aria-label', t('lav_in_corso', 'In lavorazione: ') +
            lavori.map(function (l) { return l.nome; }).join(', '));
        alza();
    }

    function nomeDiRipiego(testo) {
        var s = window.appState && window.appState.rootNodeLabel;
        try { if (!s && typeof appState !== 'undefined') s = appState.rootNodeLabel; } catch (e) { }
        return String(s || testo || t('lav_generico', 'MappAI sta lavorando')).trim();
    }

    var API = {
        /* Annuncia un lavoro. ⚠️ Non subito: sotto i 600ms l'indicatore sarebbe
           un lampo, e un lampo si legge come un difetto, non come un'informazione. */
        inizia: function (nome) {
            var id = 'lav' + (++seq);
            lavori.push({ id: id, nome: String(nome || nomeDiRipiego()).trim(), da: Date.now() });
            /* ⚠️ L'attesa NON si riarma a ogni lavoro. Una generazione lunga è
               fatta di TANTE fasi che si annunciano una dopo l'altra (la MindMap
               multi-pass ne ha una dozzina): riazzerando il conto a ogni fase,
               l'indicatore non comparirebbe mai. Si aspetta una volta sola;
               dopo, ogni cambio si vede subito. */
            if (el && el.classList.contains('is-on')) disegna();
            else if (!timer) timer = setTimeout(function () { timer = null; disegna(); }, ATTESA);
            return id;
        },
        fine: function (id) {
            if (id == null) lavori.pop(); else lavori = lavori.filter(function (l) { return l.id !== id; });
            if (!lavori.length && timer) { clearTimeout(timer); timer = null; }
            disegna();
        },
        /* Il nome si può scoprire DOPO l'inizio (la pipeline sa il titolo solo
           quando ha finito di leggere la configurazione). */
        etichetta: function (id, nome) {
            var l = id ? lavori.filter(function (x) { return x.id === id; })[0] : lavori[lavori.length - 1];
            if (l && nome) { l.nome = String(nome).trim(); disegna(); }
        },
        attivi: function () { return lavori.slice(); },
        _disegna: disegna
    };

    /* ── l'aggancio: il velo di lavorazione ────────────────────────────────
       Un solo punto per tutta l'app. Chi chiama passa il nome come QUARTO
       argomento; gli altri ricadono sul titolo del progetto. */
    function aggancia() {
        var orig = window.showLoadingOverlay;
        if (typeof orig !== 'function' || orig.__lavori) return false;
        var corrente = null, nomeCorrente = '';
        var patched = function (show, testo, mode, nome) {
            if (show) {
                /* 🐛 IL NOME SI CATTURA ALL'AVVIO E APPARTIENE AL LAVORO (17/8).
                   Prima ogni chiamata col velo acceso chiudeva il lavoro e ne
                   apriva uno nuovo, ricalcolando il nome — e senza un nome
                   esplicito il ripiego legge `rootNodeLabel`, cioè il progetto
                   APERTO IN QUEL MOMENTO. Una generazione è fatta di decine di
                   fasi che si annunciano una dopo l'altra (la MindMap
                   multi-pass ne ha una dozzina, la voce una per blocco): bastava
                   cliccare un altro progetto in ELABORA e alla fase successiva
                   l'indicatore si ribattezzava col nome di quello — sembrava che
                   MappAI stesse generando per tutti i progetti.
                   Ora una chiamata che non dichiara un nome è una FASE del
                   lavoro in corso, non un lavoro nuovo: il nome resta quello di
                   quando è cominciato. Si ribattezza solo se arriva un nome
                   esplicito DIVERSO — cioè se è davvero un'altra cosa. */
                if (!corrente) {
                    nomeCorrente = nome || nomeDiRipiego(testo);
                    corrente = API.inizia(nomeCorrente);
                } else if (nome && nome !== nomeCorrente) {
                    API.fine(corrente);
                    nomeCorrente = nome;
                    corrente = API.inizia(nomeCorrente);
                }
            } else if (corrente) {
                API.fine(corrente); corrente = null; nomeCorrente = '';
            }
            return orig.apply(this, arguments);
        };
        patched.__lavori = true;
        window.showLoadingOverlay = patched;
        return true;
    }

    function spento() {
        try { return localStorage.getItem('mappai_lavori_barra') === '0'; } catch (e) { return false; }
    }

    function avvio() {
        if (spento()) return;                 /* kill-switch: nessun indicatore, nessun aggancio */
        monta();
        if (!aggancia()) {
            /* `mappai-ui-canvas.js` può caricarsi dopo: si riprova finché c'è. */
            var n = 0, iv = setInterval(function () {
                if (aggancia() || ++n > 100) clearInterval(iv);
            }, 100);
        }
        /* La barra sotto i piedi cambia (console che si apre, landing che va e
           viene): il segnale è il DOM, come per il rail. */
        if (window.MutationObserver) {
            var coda = false;
            new MutationObserver(function () {
                if (coda) return;
                coda = true;
                setTimeout(function () { coda = false; if (lavori.length) disegna(); }, 0);
            }).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style'] });
        }
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', avvio);
    else avvio();

    window.MappAILavori = API;
})();
