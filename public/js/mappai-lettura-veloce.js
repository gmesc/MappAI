/*
 * mappai-lettura-veloce.js — la lettura veloce (RSVP), una parola alla volta
 * ---------------------------------------------------------------------------
 * La parola sta al centro con la lettera di fuoco in rosso, sempre allo stesso
 * punto: l'occhio non si sposta, è il testo che gli arriva addosso
 * (MappAIRsvpCore, da rsvp-reading di Thomas Kolmans, MIT). Niente voce.
 *
 * Tre comandi e basta: play/pausa, la velocità in parole al minuto, e la
 * PAROLA STESSA, che si trascina (o scorre con la rotella) per tornare
 * indietro o andare avanti una parola alla volta. Un tocco senza trascinare
 * è play/pausa.
 *
 * Due modi:
 *   · `dove` (un elemento): il testo da cui si legge si NASCONDE e il pannello
 *     ne prende il posto — scheda del nodo, sintesi. Si vede solo la parola.
 *     Chiudendo, il testo torna com'era.
 *   · senza `dove`: pannello flottante in basso, lo stesso del lettore ad alta
 *     voce (`.mai-tts-float`) — menu dei nodi sulla mappa e nelle viste.
 *
 * Un lettore alla volta: all'avvio si annuncia con l'evento `mappai:lettura`
 * ({chi:'veloce'}) e si chiude quando lo annuncia la voce ({chi:'voce'},
 * mappai-tts-reader.js). Nata in MappAI studente il 17/9/2026, portata qui il
 * giorno stesso. Caricata DOPO mappai-rsvp-core.js e mappai-tts-reader.js.
 */
(function () {
    'use strict';
    if (window.MappAILetturaVeloce) return;

    var LS_PPM = 'mappai_rsvp_ppm';
    var PASSO_PX = 36;      /* trascinando: una parola ogni 36 px */
    var PASSO_ROTELLA = 40; /* rotella o trackpad */

    function t(k, f) { try { return (window.t ? window.t(k, f) : f) || f; } catch (e) { return f; } }
    function C() { return window.MappAIRsvpCore; }
    function icone() { try { if (window.safeCreateIcons) window.safeCreateIcons(); } catch (e) { } }

    var R = { el: null, dove: null, doveDisplay: '', parole: [], i: 0, play: false, timer: null };

    function ppm() {
        var n = NaN;
        try { n = parseInt(localStorage.getItem(LS_PPM), 10); } catch (e) { }
        return (n >= C().MIN_PPM && n <= C().MAX_PPM) ? n : C().PPM;
    }

    /* Il testo visibile di un corpo (anche dentro un iframe), senza ciò che il
       lettore ad alta voce salta: note, citazioni, comandi, la copia MathML. */
    function testoDi(body) {
        if (!body) return '';
        var c = body.cloneNode(true), doc = body.ownerDocument || document;
        c.querySelectorAll('sup, button, style, script, annotation, .katex-mathml, .bs-citations, [data-tts-skip], [data-ap-skip], .mai-tts-wrap')
            .forEach(function (n) { n.remove(); });
        /* textContent incolla i blocchi: «fine.Inizio» sarebbe una parola sola */
        c.querySelectorAll('p, li, h1, h2, h3, h4, h5, h6, blockquote, div, br, td, th').forEach(function (n) {
            if (n.parentNode) n.parentNode.insertBefore(doc.createTextNode(' '), n.nextSibling);
        });
        return c.textContent || '';
    }
    /* Il testo di un nodo della mappa, pulito come lo pulisce `speakNode`. */
    function testoNodo(n) {
        return String((n && (n.desc || n.content)) || '')
            .replace(/\$\$?[^$]*\$\$?/g, ' ')
            .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1');
    }

    function mostra() {
        if (!R.el) return;
        var pz = R.el.querySelector('.mai-rsvp');
        pz.innerHTML = C().html(R.parole[R.i] || '');
        pz.setAttribute('aria-valuenow', String(R.i + 1));
    }
    function dipingiPlay() {
        if (!R.el) return;
        var b = R.el.querySelector('.mai-tts-play');
        b.innerHTML = '<i data-lucide="' + (R.play ? 'pause' : 'play') + '"></i>';
        R.el.querySelector('.mai-tts-chip').classList.toggle('is-playing', R.play);
        icone();
    }

    function passo() {
        if (!R.el || !R.el.isConnected) { chiudi(); return; }
        mostra();
        R.timer = setTimeout(function () {
            if (R.i >= R.parole.length - 1) { R.play = false; R.timer = null; dipingiPlay(); return; }
            R.i++;
            passo();
        }, C().pausa(R.parole[R.i], ppm()));
    }
    function suona() {
        if (R.i >= R.parole.length - 1) R.i = 0;
        clearTimeout(R.timer);
        R.play = true; dipingiPlay(); passo();
    }
    function pausa() {
        clearTimeout(R.timer); R.timer = null;
        if (R.play) { R.play = false; dipingiPlay(); }
    }
    function vai(i) {
        R.i = Math.max(0, Math.min(i, R.parole.length - 1));
        mostra();
    }

    function chiudi() {
        clearTimeout(R.timer); R.timer = null; R.play = false;
        if (R.el) { try { R.el.remove(); } catch (e) { } }
        if (R.dove) { try { R.dove.style.display = R.doveDisplay; } catch (e) { } }
        R.el = null; R.dove = null; R.doveDisplay = '';
    }

    /* Se si legge da un documento in un iframe, la sua voce (o il suo MP3) tace. */
    function zittisci(el) {
        try {
            if (!el || el.tagName !== 'IFRAME') return;
            var d = el.contentDocument, w = el.contentWindow;
            if (d) d.querySelectorAll('audio, video').forEach(function (a) { try { a.pause(); } catch (e) { } });
            if (w && w.speechSynthesis) w.speechSynthesis.cancel();
        } catch (e) { }
    }

    function apri(opts) {
        opts = opts || {};
        chiudi();
        var parole = C().parole(opts.testo || '');
        if (!parole.length) {
            if (window.showToast) window.showToast(t('tst_no_text_tts', 'Nessun testo da leggere'), 'info');
            return null;
        }
        try { document.dispatchEvent(new CustomEvent('mappai:lettura', { detail: { chi: 'veloce' } })); } catch (e) { }
        R.parole = parole; R.i = 0;

        var dentro = !!(opts.dove && opts.dove.parentNode);
        var f = document.createElement('div');
        f.className = dentro ? 'mai-lv mai-lv--in' : 'mai-lv mai-tts-float';
        if (!dentro) f.id = 'mai-rsvp-float';
        f.setAttribute('role', dentro ? 'region' : 'dialog');
        f.setAttribute('aria-label', t('rsvp_titolo', 'Lettura veloce'));
        var v = ppm(), aiuto = t('rsvp_trascina', 'Trascina la parola per andare avanti o indietro');
        f.innerHTML =
            '<div class="mai-lv-top"><h4 class="mai-lv-t"></h4>' +
            '<button type="button" class="mai-lv-x" aria-label="' + t('tts_close', 'Chiudi') + '" title="' + t('tts_close', 'Chiudi') + '">✕</button></div>' +
            '<div class="mai-rsvp" tabindex="0" role="slider" aria-valuemin="1" aria-valuemax="' + parole.length + '"' +
            ' aria-label="' + aiuto + '" title="' + aiuto + '"></div>' +
            '<div class="mai-lv-ctrl">' +
            '<span class="mai-tts-chip"><button type="button" class="mai-tts-seg mai-tts-play" aria-label="' + t('tts_play', 'Ascolta / Pausa') + '"><i data-lucide="play"></i></button></span>' +
            '<input type="range" class="mai-lv-vel" min="' + C().MIN_PPM + '" max="' + C().MAX_PPM + '" step="25" value="' + v + '"' +
            ' aria-label="' + t('rsvp_velocita', 'Velocità (parole al minuto)') + '">' +
            '<span class="mai-lv-ppm">' + v + ' p/min</span>' +
            '</div>';
        f.querySelector('.mai-lv-t').textContent = opts.titolo || '';

        if (dentro) {
            zittisci(opts.dove);
            R.dove = opts.dove; R.doveDisplay = opts.dove.style.display || '';
            opts.dove.parentNode.insertBefore(f, opts.dove.nextSibling);
            opts.dove.style.display = 'none';
        } else {
            document.body.appendChild(f);
        }
        R.el = f;

        f.querySelector('.mai-lv-x').addEventListener('click', chiudi);
        f.querySelector('.mai-tts-play').addEventListener('click', function () { if (R.play) pausa(); else suona(); });
        var vel = f.querySelector('.mai-lv-vel');
        vel.addEventListener('input', function () {
            try { localStorage.setItem(LS_PPM, vel.value); } catch (e) { }
            f.querySelector('.mai-lv-ppm').textContent = vel.value + ' p/min';
        });

        /* la parola si trascina come un nastro: a sinistra avanti, a destra indietro */
        var pz = f.querySelector('.mai-rsvp'), x0 = null, mosso = false, acc = 0;
        pz.addEventListener('pointerdown', function (e) {
            x0 = e.clientX; mosso = false;
            try { pz.setPointerCapture(e.pointerId); } catch (er) { }
            e.preventDefault();
        });
        pz.addEventListener('pointermove', function (e) {
            if (x0 === null) return;
            var n = Math.trunc((e.clientX - x0) / PASSO_PX);
            if (!n) return;
            if (!mosso) { mosso = true; pausa(); }
            vai(R.i - n);
            x0 += n * PASSO_PX;
        });
        function su(e) {
            if (x0 === null) return;
            x0 = null;
            try { pz.releasePointerCapture(e.pointerId); } catch (er) { }
            if (!mosso && e.type === 'pointerup') { if (R.play) pausa(); else suona(); }
        }
        pz.addEventListener('pointerup', su);
        pz.addEventListener('pointercancel', su);
        pz.addEventListener('wheel', function (e) {
            e.preventDefault();
            acc += Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
            var n = Math.trunc(acc / PASSO_ROTELLA);
            if (!n) return;
            acc -= n * PASSO_ROTELLA;
            pausa(); vai(R.i + n);
        }, { passive: false });
        pz.addEventListener('keydown', function (e) {
            if (e.key === 'ArrowRight') { pausa(); vai(R.i + 1); e.preventDefault(); }
            else if (e.key === 'ArrowLeft') { pausa(); vai(R.i - 1); e.preventDefault(); }
            else if (e.key === ' ' || e.key === 'Enter') { if (R.play) pausa(); else suona(); e.preventDefault(); }
        });

        mostra(); dipingiPlay();
        try { pz.focus({ preventScroll: true }); } catch (e) { }
        return f;
    }

    /* ── gli ingressi ─────────────────────────────────────────────────────── */
    /* la scheda del nodo: il corpo si nasconde, il pannello ne prende il posto */
    function daScheda() {
        var tit = document.getElementById('source-modal-title');
        var body = document.getElementById('source-modal-body');
        return apri({ titolo: tit ? tit.textContent.trim() : '', testo: testoDi(body), dove: body });
    }
    /* un nodo dai menu (mappa, Albero, Fasci, DAG): pannello flottante */
    function daNodo(n) {
        if (!n) return null;
        var titolo = (window.cleanLabel ? window.cleanLabel(n.label) : n.label) || '';
        return apri({ titolo: titolo, testo: testoNodo(n) });
    }
    /* un documento in un iframe (sintesi): l'iframe si nasconde */
    function daIframe(fr, titolo) {
        var d = null;
        try { d = fr && fr.contentDocument; } catch (e) { d = null; }
        if (!d || !d.body) return null;
        return apri({ titolo: titolo || d.title || '', testo: testoDi(d.querySelector('.bs-body') || d.body), dove: fr });
    }

    /* un lettore alla volta */
    document.addEventListener('mappai:lettura', function (e) {
        if (R.el && e.detail && e.detail.chi !== 'veloce') chiudi();
    });

    function _css() {
        if (document.getElementById('mai-lv-style')) return;
        var st = document.createElement('style');
        st.id = 'mai-lv-style';
        st.textContent =
            '.mai-lv{font-family:var(--app-font,"Space Mono",monospace)}' +
            '.mai-lv-top{display:flex;align-items:center;gap:10px;margin:0 0 10px}' +
            '.mai-lv-t{flex:1;min-width:0;margin:0;font-size:14px;font-weight:800;color:#4338ca;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
            '.mai-lv-x{flex:0 0 auto;width:36px;height:36px;border:0;border-radius:9999px;background:#f1f5f9;color:#475569;cursor:pointer;font-size:15px;line-height:1}' +
            '.mai-lv .mai-rsvp{font-size:46px;min-height:2.1em;margin:0 0 12px;cursor:ew-resize;touch-action:none;user-select:none;-webkit-user-select:none;outline-offset:3px}' +
            '.mai-lv-ctrl{display:flex;align-items:center;gap:12px}' +
            '.mai-lv-vel{flex:1 1 180px;min-width:120px;height:36px;accent-color:#4f46e5}' +
            '.mai-lv-ppm{flex:0 0 auto;min-width:86px;text-align:right;font-size:12px;font-weight:700;color:#64748b}' +
            '.mai-lv--in{display:flex;flex-direction:column;flex:1 1 auto;box-sizing:border-box;min-height:260px;height:100%;padding:18px 22px;background:#fff}' +
            '.mai-lv--in .mai-rsvp{font-size:64px;min-height:2.3em;margin:auto 0 20px}' +
            '.mai-lv--in .mai-lv-ctrl{width:100%;max-width:640px;margin:0 auto auto}' +
            '@media (prefers-color-scheme: dark){' +
            '.mai-lv-t{color:#c7d2fe}.mai-lv-x{background:#334155;color:#e2e8f0}.mai-lv--in{background:#1e293b}.mai-lv-ppm{color:#94a3b8}}';
        document.head.appendChild(st);
    }
    if (document.head) _css(); else document.addEventListener('DOMContentLoaded', _css);

    window.MappAILetturaVeloce = {
        apri: apri, chiudi: chiudi, daScheda: daScheda, daNodo: daNodo, daIframe: daIframe,
        testoDi: testoDi, aperta: function () { return !!R.el; }
    };
})();
