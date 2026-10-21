/*
 * mappai-emoji-prova.js — packet 0099 (15-16/10/2026)
 *
 * `public/fonts/MappAIEmoji.ttf` porta le 27 emoji di identità solo come COLRv1
 * e come OT-SVG, con glifi di base VUOTI. Due guasti, due rimedi:
 *
 * 1. Un browser che non legge nessuno dei due (Chromium < 98, Android/WebView
 *    vecchi) disegna il vuoto e, siccome la `cmap` dichiara quei caratteri, NON
 *    ripiega sulle emoji di sistema. Rimedio: si PROVA il font su un canvas con
 *    due emoji; se non lasciano inchiostro `'MappAI Emoji'` esce da `--emoji` e
 *    lo stack ripiega su Noto / Apple / Segoe. Ogni dubbio cade sul lato sicuro.
 *
 * 2. Sui motori WebKit (iPhone, iPad, Safari, Chrome per iOS — il 16/10 su iOS 27)
 *    il font NON disegna nel testo ma sul canvas sì: la prova di sopra darebbe
 *    «va bene» a torto. Rimedio: niente prova, le emoji del font diventano IMMAGINI SVG
 *    estratte dallo stesso font (`public/fonts/emoji/`, `tools/font/emoji-in-svg.py`):
 *    ogni carattere finisce in uno span con l'immagine di sfondo. Il TESTO resta
 *    dov'è (spinto fuori dallo span e nascosto): `textContent`, copia e lettori
 *    di schermo non cambiano. Un MutationObserver avvolge anche le emoji che il
 *    codice della pagina aggiunge dopo. Se l'immagine non si carica: emoji di sistema.
 *
 * ES5 di proposito: deve girare proprio dove il resto non gira. Se questo file
 * si rompe o non arriva, lo stack resta com'era il 14/10 (nessun danno nuovo).
 * ⚠️ L'elenco CODEPOINTS ripete i codepoint del font: le 27 dell'identità e, dal
 * packet 0108 (16/10/2026), le emoji che le pagine degli allievi e i report scrivono
 * (⚠️, 💡, 📎…), che prima arrivavano da Google Fonts. `tests/emoji-immagini.test.js`
 * lo confronta con la cmap del font e con la cartella delle immagini.
 */
(function (root) {
    'use strict';

    var PROVE = ['🦊', '🐼'];            // 🦊 🐼, entrambe fra le 27
    var LOCALE = /'MappAI Emoji'\s*,\s*/;
    var RISERVA = "'Noto Color Emoji','Apple Color Emoji','Segoe UI Emoji'";
    var LATO = 64;
    var CARTELLA = '/public/fonts/emoji/';
    var CODEPOINTS = [0x26A0, 0x26F5, 0x2705, 0x270D, 0x274C, 0x2B06, 0x2B1C, 0x1F310, 0x1F347,
        0x1F34C, 0x1F34E, 0x1F353, 0x1F355, 0x1F389, 0x1F419, 0x1F41D, 0x1F41E, 0x1F422, 0x1F42C,
        0x1F430, 0x1F431, 0x1F436, 0x1F438, 0x1F43C, 0x1F4A1, 0x1F4AC, 0x1F4BE, 0x1F4C4, 0x1F4CE,
        0x1F4D5, 0x1F4D8, 0x1F4DA, 0x1F4DD, 0x1F4EE, 0x1F50A, 0x1F512, 0x1F5BC, 0x1F680, 0x1F681,
        0x1F682, 0x1F68C, 0x1F6B2, 0x1F955, 0x1F981, 0x1F984, 0x1F989, 0x1F98A, 0x1F98B];
    var SALTA = { SCRIPT: 1, STYLE: 1, TEXTAREA: 1, INPUT: 1, OPTION: 1, TITLE: 1, NOSCRIPT: 1, SELECT: 1 };

    /* ── il motore ───────────────────────────────────────────────────────── */

    /* WebKit vero: iOS (ogni browser) e Safari. Chrome per iOS dice `CriOS/`,
       Firefox `FxiOS/`, Edge `EdgiOS/`: nessuno ha `Chrome/`. */
    function eWebKit(ua) {
        ua = String(ua || '');
        return /AppleWebKit/.test(ua) && !/(Chrome|Chromium|Edg|OPR)\//.test(ua) && !/Android/.test(ua);
    }

    /* ── 1. la prova su canvas (motori non WebKit) ───────────────────────── */

    /* true se almeno un pixel ha opacità: il glifo ha lasciato qualcosa. */
    function inchiostro(ctx) {
        var d = ctx.getImageData(0, 0, LATO, LATO).data;
        for (var i = 3; i < d.length; i += 4) { if (d[i] > 0) return true; }
        return false;
    }

    /* true se TUTTE le emoji di prova si disegnano col solo font locale. */
    function disegnaTutte(doc) {
        var cv = doc.createElement('canvas');
        cv.width = LATO; cv.height = LATO;
        var ctx = cv.getContext && cv.getContext('2d');
        if (!ctx || !ctx.getImageData) return false;
        for (var i = 0; i < PROVE.length; i++) {
            ctx.clearRect(0, 0, LATO, LATO);
            ctx.font = "48px 'MappAI Emoji'";
            ctx.textBaseline = 'top';
            ctx.fillText(PROVE[i], 4, 4);
            if (!inchiostro(ctx)) return false;
        }
        return true;
    }

    /* Riscrive --emoji senza il font locale (inline: vince su :root). */
    function togliLocale(doc, win) {
        var el = doc.documentElement;
        var cur = (win.getComputedStyle(el).getPropertyValue('--emoji') || '').replace(/^\s+|\s+$/g, '');
        var next = cur && LOCALE.test(cur) ? cur.replace(LOCALE, '') : RISERVA;
        el.style.setProperty('--emoji', next);
        el.setAttribute('data-emoji', 'sistema');
    }

    /* → 'locale' | 'sistema' (sempre risolve: mai un errore verso la pagina). */
    function esegui(doc, win) {
        var fonts = doc.fonts;
        if (!fonts || !fonts.load || typeof root.Promise !== 'function') {
            togliLocale(doc, win); return { then: function (f) { f('sistema'); } };
        }
        function esito() {
            var ok = false;
            try { ok = disegnaTutte(doc); } catch (e) { ok = false; }
            if (ok) { doc.documentElement.setAttribute('data-emoji', 'locale'); return 'locale'; }
            try { togliLocale(doc, win); } catch (e) { /* lo stack resta com'è */ }
            return 'sistema';
        }
        var carica;
        try { carica = fonts.load("48px 'MappAI Emoji'", PROVE.join('')); }
        catch (e) { carica = root.Promise.resolve(); }
        return carica.then(esito, esito);
    }

    /* ── 2. le immagini (motori WebKit) ──────────────────────────────────── */

    function inStringa(cp) {
        if (cp < 0x10000) return String.fromCharCode(cp);
        cp -= 0x10000;
        return String.fromCharCode(0xD800 + (cp >> 10), 0xDC00 + (cp & 0x3FF));
    }
    var PER_CP = {};
    (function () { for (var i = 0; i < CODEPOINTS.length; i++) PER_CP[inStringa(CODEPOINTS[i])] = CODEPOINTS[i]; })();
    function nuovoRegex() {                 // /g ha uno stato: uno nuovo a ogni uso
        var alt = [];
        for (var i = 0; i < CODEPOINTS.length; i++) alt.push(inStringa(CODEPOINTS[i]));
        return new RegExp('(' + alt.join('|') + ')\\uFE0F?', 'g');
    }

    /* testo → [{ t:'testo', v } | { t:'emo', v:'🦊', cp:0x1F98A }]; senza emoji: un solo pezzo. */
    function dividi(testo) {
        var out = [], re = nuovoRegex(), ultimo = 0, m;
        testo = String(testo);
        while ((m = re.exec(testo))) {
            if (m.index > ultimo) out.push({ t: 'testo', v: testo.slice(ultimo, m.index) });
            out.push({ t: 'emo', v: m[0], cp: PER_CP[m[1]] });
            ultimo = m.index + m[0].length;
        }
        if (ultimo < testo.length || !out.length) out.push({ t: 'testo', v: testo.slice(ultimo) });
        return out;
    }

    /* `?v=`: un telefono che ha in cache il disegno di prima (Noto v40, 0099) prende quello nuovo. */
    var VERSIONE = '0108';
    function urlImmagine(cp) { return CARTELLA + cp.toString(16) + '.svg?v=' + VERSIONE; }

    var STILE = '.mappai-emo{display:inline-block;width:1.15em;height:1em;line-height:1;vertical-align:-.15em;' +
        'background:center/contain no-repeat;overflow:hidden;text-indent:-100em;white-space:nowrap}';

    function dentroUnaEmoji(n) {
        for (var p = n.parentNode; p; p = p.parentNode) {
            if (p.nodeType === 1 && (SALTA[p.nodeName] || (p.className && String(p.className).indexOf('mappai-emo') >= 0))) return true;
        }
        return false;
    }

    function avvolgiNodo(doc, nodo) {
        var pezzi = dividi(nodo.nodeValue);
        if (pezzi.length === 1 && pezzi[0].t === 'testo') return false;
        var frag = doc.createDocumentFragment();
        for (var i = 0; i < pezzi.length; i++) {
            var p = pezzi[i];
            if (p.t === 'testo') { frag.appendChild(doc.createTextNode(p.v)); continue; }
            var s = doc.createElement('span');
            s.className = 'mappai-emo';
            s.setAttribute('data-e', p.v);
            s.style.backgroundImage = 'url(' + urlImmagine(p.cp) + ')';
            s.appendChild(doc.createTextNode(p.v));
            frag.appendChild(s);
        }
        nodo.parentNode.replaceChild(frag, nodo);
        return true;
    }

    /* Avvolge ogni nodo di testo sotto `base` (un nodo di testo o un elemento). → quanti. */
    function avvolgiSotto(doc, base) {
        if (!base) return 0;
        if (base.nodeType === 3) {
            return base.parentNode && !dentroUnaEmoji(base) && avvolgiNodo(doc, base) ? 1 : 0;
        }
        if (base.nodeType !== 1 || SALTA[base.nodeName]) return 0;
        var tutti = [], w = doc.createTreeWalker(base, 4 /* SHOW_TEXT */, null, false), n, conta = 0;
        while ((n = w.nextNode())) tutti.push(n);
        for (var i = 0; i < tutti.length; i++) {
            if (!dentroUnaEmoji(tutti[i]) && avvolgiNodo(doc, tutti[i])) conta++;
        }
        return conta;
    }

    function avviaImmagini(doc, win) {
        if (doc.getElementById('mappai-emo-stile')) return;
        var st = doc.createElement('style');
        st.id = 'mappai-emo-stile'; st.textContent = STILE;
        (doc.head || doc.documentElement).appendChild(st);
        doc.documentElement.setAttribute('data-emoji', 'immagini');
        avvolgiSotto(doc, doc.body);
        if (typeof win.MutationObserver !== 'function') return;
        new win.MutationObserver(function (records) {
            for (var i = 0; i < records.length; i++) {
                var r = records[i];
                if (r.type === 'characterData') { avvolgiSotto(doc, r.target); continue; }
                for (var j = 0; j < r.addedNodes.length; j++) avvolgiSotto(doc, r.addedNodes[j]);
            }
        }).observe(doc.documentElement, { childList: true, subtree: true, characterData: true });
    }

    /* Prima prova che l'immagine arriva (rete di salvataggio), poi avvolge. */
    function eseguiImmagini(doc, win) {
        function perso() { try { togliLocale(doc, win); } catch (e) { /* stack com'è */ } }
        var img;
        try { img = new win.Image(); } catch (e) { perso(); return; }
        img.onload = function () {
            var pronto = function () { try { avviaImmagini(doc, win); } catch (e) { perso(); } };
            if (doc.body) pronto(); else doc.addEventListener('DOMContentLoaded', pronto);
        };
        img.onerror = perso;
        img.src = urlImmagine(CODEPOINTS[0]);
    }

    var api = {
        esegui: esegui, disegnaTutte: disegnaTutte, togliLocale: togliLocale, PROVE: PROVE,
        eWebKit: eWebKit, dividi: dividi, CODEPOINTS: CODEPOINTS, CARTELLA: CARTELLA,
        avvolgiSotto: avvolgiSotto, avviaImmagini: avviaImmagini, eseguiImmagini: eseguiImmagini, urlImmagine: urlImmagine
    };
    if (typeof module === 'object' && module.exports) module.exports = api;

    if (typeof document !== 'undefined' && typeof window !== 'undefined') {
        window.MappAIEmojiProva = api;
        var avvia = function () {
            try {
                if (eWebKit(navigator.userAgent)) eseguiImmagini(document, window);
                else window.MappAIEmojiProva.stato = esegui(document, window);
            } catch (e) { /* stack com'è */ }
        };
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', avvia);
        else avvia();
    }
})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this));
