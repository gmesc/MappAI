/*
 * mappai-quiz-mc-view.js — la scelta multipla, UN aspetto solo
 * ---------------------------------------------------------------------------
 * La domanda a 24 px con l'altoparlante accanto, ogni opzione a 20 px col suo
 * altoparlante, il verdetto sotto. È il disegno del quiz LIVE via QR
 * (`public/live/student.html`), tolto da lì e messo qui perché lo usino anche la
 * view «a scelta» (`mappai-scelta-view.js`, che MappAI Studente apre sull'iPad)
 * e, domani, ogni altra superficie: due copie della stessa schermata divergono
 * al primo ritocco (inv. 6), ed era già successo — sull'iPad il quiz era più
 * piccolo e muto.
 *
 * Disegna e basta. Niente richieste di rete, niente disco, niente stato: la
 * scelta, il verdetto e la voce arrivano da fuori (`onScegli`, `parla`). Le
 * misure sono quelle di LIVE com'erano il 19/10/2026, copiate, non "migliorate":
 * `tests/quiz-mc-view.test.js` le inchioda.
 *
 * Il CSS se lo porta dietro (iniettato una volta) e sta tutto sotto `.qmc`, la
 * classe che il modulo mette sul contenitore che riceve: nell'app del docente
 * `.tts` e `.opt` esistono già con un altro significato.
 *
 * Due modi di caricarlo: <script> (→ `window.MappAIQuizMcView`) e `require` in
 * Node (i test provano le parti che non toccano il DOM: CSS e markup).
 */
(function () {
    'use strict';
    if (typeof window !== 'undefined' && window.MappAIQuizMcView) return;   /* due caricamenti = due ascolti */

    function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
    function _t(k, f) {
        try { return (typeof window !== 'undefined' && typeof window.t === 'function' && window.t(k, f)) || f; } catch (e) { return f; }
    }

    /* ── LA VESTE: le regole di LIVE, sotto `.qmc` ───────────────────────── */
    var CSS = [
        /* il carattere dei bottoni è quello della pagina: è ciò che serve di più a chi legge con fatica.
           LIVE lo ottiene da `button { font: inherit }`; una pagina che non lo dice non deve perderlo */
        '.qmc .opt, .qmc .tts { font-family: inherit; }',
        '.qmc .q-head { display: flex; align-items: flex-start; gap: 10px; margin-bottom: 22px; }',
        '.qmc .q-testo { font-size: 24px; font-weight: 700; line-height: 1.45; flex: 1; }',
        '.qmc .q-testo:empty { display: none; }',
        /* l'altoparlante: grande, area tap comoda (inv. 16: bersagli da 44 px, qui 56) */
        '.qmc .tts { flex: 0 0 auto; width: 56px; min-height: 56px; border-radius: 14px; border: 2px solid var(--mm-bordo, #cbd5e1); background: #fff; font-size: 24px; display: flex; align-items: center; justify-content: center; color: #4f46e5; }',
        '.qmc .tts:active, .qmc .tts.on { background: #eef2ff; border-color: #4f46e5; }',
        '.qmc .q-head .tts { align-self: flex-start; }',
        /* l'opzione è una riga: il bottone-testo (sceglie) + il suo altoparlante */
        '.qmc .opt-row { display: flex; align-items: stretch; gap: 8px; margin-bottom: 12px; }',
        '.qmc .opt { flex: 1; text-align: left; padding: 18px 18px; border-radius: 14px; border: 2px solid var(--mm-bordo, #cbd5e1); background: #fff; color: var(--mm-testo, #404040); font-size: 20px; line-height: 1.35; }',
        '.qmc .opt.sel, .qmc .opt[aria-checked="true"] { border-color: #4f46e5; background: #eef2ff; }',
        /* l'esito: sotto le opzioni, mai in un modale */
        '.qmc .verd { margin-top: 16px; border-radius: 12px; padding: 12px 14px; font-size: 16px; line-height: 1.45; }',
        '.qmc .verd-ok { background: #dcfce7; border: 2px solid #16a34a; color: #14532d; }',
        '.qmc .verd-ko { background: #fee2e2; border: 2px solid #dc2626; color: #7f1d1d; }',
        '.qmc .verd b { font-weight: 800; }',
        '.qmc .verd .sp { display: block; margin-top: 6px; font-size: 14px; color: var(--mm-testo, #404040); }',
        /* il telefono coricato: meno altezza, stessi margini */
        '@media (orientation: landscape) and (max-height: 560px) {',
        '  .qmc .q-head { margin-bottom: 12px; }',
        '  .qmc .q-testo { font-size: 21px; }',
        '  .qmc .opt { font-size: 18px; padding: 13px 15px; }',
        '  .qmc .opt-row { margin-bottom: 8px; }',
        '}'
    ].join('\n');

    function css() {
        if (typeof document === 'undefined' || document.getElementById('qmc-css')) return;
        var s = document.createElement('style'); s.id = 'qmc-css'; s.textContent = CSS;
        (document.head || document.documentElement).appendChild(s);
    }

    /* ── IL MARKUP (puro: si prova in Node) ──────────────────────────────── */
    function htmlDomanda(testo, o) {
        o = o || {};
        var et = o.etichetta || _t('qmc_ascolta_domanda', 'Ascolta la domanda');
        return '<div class="q-head"><div class="q-testo">' + esc(testo) + '</div>' +
            (o.leggi === false ? '' : '<button class="tts" type="button" aria-label="' + esc(et) + '">🔊</button>') + '</div>';
    }
    function htmlOpzione(testo, i, o) {
        o = o || {};
        var sel = o.scelta === i;
        return '<div class="opt-row"><button type="button" class="opt' + (sel ? ' sel' : '') + '"' +
            (o.radio ? ' role="radio" aria-checked="' + sel + '"' : '') + '>' + esc(testo) + '</button>' +
            '<button class="tts" type="button" aria-label="' + esc(o.etichetta || _t('qmc_ascolta', 'Ascolta')) + '">🔊</button></div>';
    }
    function htmlVerdetto(v, o) {
        o = o || {};
        var ok = v && v.esito === 'right';
        return '<div class="verd ' + (ok ? 'verd-ok' : 'verd-ko') + '" role="status"><b>' + esc(ok ? (o.giusto || 'Giusto') : (o.sbagliato || 'Sbagliato')) + '</b>' +
            (v && v.giusta ? ' — ' + esc(o.corretta || 'corretta') + ': <b>' + esc(v.giusta) + '</b>' : '') +
            (v && v.spiegazione ? '<span class="sp">' + esc(v.spiegazione) + '</span>' : '') + '</div>';
    }

    /* ── LA VOCE: quella del browser, offline, senza server ──────────────── */
    function parla(testo, lingua) {
        try {
            if (typeof speechSynthesis === 'undefined') return;
            var t = String(testo || '').trim(); if (!t) return;
            speechSynthesis.cancel();                       /* interrompe la lettura precedente */
            var u = new SpeechSynthesisUtterance(t);
            u.lang = lingua || 'it-IT'; u.rate = 0.95;
            speechSynthesis.speak(u);
        } catch (e) { }
    }

    /* ── IL DOM: poche righe sopra il markup ─────────────────────────────── */
    function prepara(host) { css(); host.classList.add('qmc'); }
    function voce(o) { return (o && o.parla) || parla; }

    /* la testata sostituisce il contenuto del contenitore */
    function domanda(host, testo, o) {
        prepara(host);
        host.innerHTML = htmlDomanda(testo, o);
        var b = host.querySelector('.tts');
        if (b) b.onclick = function (ev) { ev.stopPropagation(); voce(o)(testo); };
        return host;
    }

    /* le opzioni si AGGIUNGONO al contenitore (sotto ciò che c'è già) */
    function opzioni(host, lista, o) {
        o = o || {};
        prepara(host);
        var tmp = document.createElement('div');
        tmp.innerHTML = (lista || []).map(function (t, i) { return htmlOpzione(t, i, o); }).join('');
        var righe = [].slice.call(tmp.children);
        righe.forEach(function (riga, i) {
            var b = riga.querySelector('.opt'), a = riga.querySelector('.tts');
            if (o.bloccata) b.disabled = true;            /* già corretta: non si ripensa */
            b.onclick = function () { if (o.onScegli) o.onScegli(i); };
            a.onclick = function (ev) { ev.stopPropagation(); voce(o)(lista[i]); };
            host.appendChild(riga);
        });
        return righe;
    }

    /* la scelta cambia senza ridisegnare */
    function segna(host, indice) {
        [].forEach.call(host.querySelectorAll('.opt'), function (b, i) {
            b.classList.toggle('sel', i === indice);
            if (b.hasAttribute('aria-checked')) b.setAttribute('aria-checked', String(i === indice));
        });
    }

    /* l'esito: uno solo per contenitore, in fondo */
    function verdetto(host, v, o) {
        prepara(host);
        var vecchio = host.querySelector('.verd'); if (vecchio) vecchio.remove();
        var tmp = document.createElement('div');
        tmp.innerHTML = htmlVerdetto(v, o);
        var el = tmp.firstChild;
        host.appendChild(el);
        return el;
    }

    var api = {
        CSS: CSS, domanda: domanda, opzioni: opzioni, segna: segna, verdetto: verdetto, parla: parla,
        htmlDomanda: htmlDomanda, htmlOpzione: htmlOpzione, htmlVerdetto: htmlVerdetto
    };
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (typeof window !== 'undefined') window.MappAIQuizMcView = api;
})();
